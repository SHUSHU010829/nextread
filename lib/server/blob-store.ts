// Vercel Blob：書櫃存成一個私有的 JSON 檔，用 etag 做條件式寫入。
import { BlobNotFoundError, BlobPreconditionFailedError, get, head, put } from "@vercel/blob";
import type { Book } from "../types.ts";
import { decodeShelf, encodeShelf, StoreConflictError, type BookStore, type Snapshot } from "./store.ts";

/** token：讀寫 token；storeId：搭配 Vercel OIDC（SDK 會自動取得 OIDC token）。 */
export type BlobAuth = { token: string } | { storeId: string };

export class BlobStore implements BookStore {
  private pathname: string;
  private auth: BlobAuth;
  constructor(auth: BlobAuth, pathname = "nextread/books.json") {
    this.auth = auth;
    this.pathname = pathname;
  }

  async read(): Promise<Snapshot> {
    // etag 要用 Blob API（head）回傳的值，跟 put 的 ifMatch 比對的是同一種格式；
    // 下載檔案時 HTTP header 裡的 etag 格式可能不同，拿來當 ifMatch 會每次都被判定為衝突。
    // 先取 etag 再下載內容：如果中間檔案被改，寫入會失敗並重試，不會蓋掉別人的修改。
    let etag: string;
    try {
      etag = (await head(this.pathname, this.auth)).etag;
    } catch (e) {
      if (e instanceof BlobNotFoundError) return { books: [], etag: null };
      throw e;
    }
    const res = await get(this.pathname, { access: "private", useCache: false, ...this.auth });
    if (!res || res.statusCode !== 200) throw new Error(`讀取書櫃失敗：${res ? res.statusCode : "not found"}`);
    const text = await new Response(res.stream).text();
    return { books: decodeShelf(text), etag };
  }

  async write(books: Book[], etag: string | null): Promise<void> {
    try {
      await put(this.pathname, encodeShelf(books), {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        ...this.auth,
        // 第一次建立時不允許覆蓋；之後只在 etag 相同時才寫入
        ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
      });
    } catch (e) {
      const conflict =
        e instanceof BlobPreconditionFailedError || (!etag && e instanceof Error && /already exists/i.test(e.message));
      if (conflict) {
        console.warn("blob write conflict", { etag, error: (e as Error).message });
        throw new StoreConflictError();
      }
      throw e;
    }
  }
}
