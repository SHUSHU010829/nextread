// 用 undici MockAgent 模擬 Vercel Blob：Blob API 的 etag 跟下載檔案時 HTTP header 的 etag 格式不同，
// 確認寫入時用的是 API 的 etag，連續存檔不會被誤判為衝突。
import { test } from "node:test";
import assert from "node:assert/strict";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from "undici";
import type { Book } from "../types.ts";
import { BlobStore } from "./blob-store.ts";
import { mutate } from "./store.ts";

const book = (id: string): Book => ({
  id, title: id, author: "", isbn: null, cover_url: "", description: "", categories: [], status: "read",
  rating: null, finished_at: null, note: "", created_at: "", updated_at: "",
});

function fakeBlob() {
  let content: string | null = null;
  let version = 0;
  const apiEtag = () => `api-etag-${version}`;
  const cdnEtag = () => `"cdn-${version}"`; // 故意跟 API etag 不同
  const ifMatchSeen: (string | undefined)[] = [];

  const agent = new MockAgent();
  agent.disableNetConnect();
  const api = agent.get("https://vercel.com");
  const meta = () => ({
    url: "https://teststore.private.blob.vercel-storage.com/nextread/books.json",
    downloadUrl: "https://teststore.private.blob.vercel-storage.com/nextread/books.json?download=1",
    pathname: "nextread/books.json",
    contentType: "application/json",
    contentDisposition: "inline",
    cacheControl: "no-cache",
    size: content?.length ?? 0,
    uploadedAt: new Date().toISOString(),
    etag: apiEtag(),
  });
  const err = (status: number, code: string) => ({ statusCode: status, data: JSON.stringify({ error: { code, message: code } }), responseOptions: { headers: { "content-type": "application/json" } } });
  const ok = (data: unknown) => ({ statusCode: 200, data: JSON.stringify(data), responseOptions: { headers: { "content-type": "application/json" } } });

  // head
  api.intercept({ path: (p) => p.startsWith("/api/blob/?url=") || p.startsWith("/api/blob?url="), method: "GET" })
    .reply((opts) => {
      void opts;
      return content === null ? err(404, "not_found") : ok(meta());
    }).persist();
  // put
  api.intercept({ path: (p) => p.includes("pathname="), method: "PUT" })
    .reply((opts) => {
      const h = opts.headers as Record<string, string>;
      const ifMatch = h["x-if-match"];
      ifMatchSeen.push(ifMatch);
      if (ifMatch && ifMatch !== apiEtag()) return err(412, "precondition_failed");
      if (!ifMatch && h["x-allow-overwrite"] === "0" && content !== null) return err(400, "bad_request");
      content = String(opts.body);
      version++;
      return ok(meta());
    }).persist();
  // 下載內容
  agent.get("https://teststore.private.blob.vercel-storage.com")
    .intercept({ path: (p) => p.startsWith("/nextread/books.json"), method: "GET" })
    .reply(() => (content === null
      ? { statusCode: 404, data: "" }
      : { statusCode: 200, data: content, responseOptions: { headers: { etag: cdnEtag(), "content-type": "application/json" } } }))
    .persist();
  return { agent, ifMatchSeen, external: () => { content = JSON.stringify({ version: 1, books: [book("other")] }); version++; } };
}

test("BlobStore saves repeatedly using the API etag", async () => {
  const prev = getGlobalDispatcher();
  const fake = fakeBlob();
  setGlobalDispatcher(fake.agent);
  try {
    const store = new BlobStore({ token: "vercel_blob_rw_teststore_secret" });
    assert.deepEqual(await store.read(), { books: [], etag: null });

    await mutate(store, (b) => ({ books: [...b, book("a")], result: null }));
    await mutate(store, (b) => ({ books: [...b, book("b")], result: null }));
    await mutate(store, (b) => ({ books: [...b, book("c")], result: null }));
    assert.deepEqual((await store.read()).books.map((b) => b.id), ["a", "b", "c"]);
    assert.deepEqual(fake.ifMatchSeen, [undefined, "api-etag-1", "api-etag-2"]);

    // 讀取後檔案被別的裝置改過：舊 etag 寫入會被拒絕
    const snap = await store.read();
    fake.external();
    await assert.rejects(store.write([...snap.books, book("d")], snap.etag), /其他地方/);
  } finally {
    setGlobalDispatcher(prev);
    await fake.agent.close();
  }
});
