import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Book } from "../types.ts";
import { FileStore, MemoryStore, mutate, StoreConflictError, type BookStore } from "./store.ts";

const book = (id: string): Book => ({
  id, title: id, author: "", isbn: null, cover_url: "", description: "", categories: [], status: "read",
  rating: null, finished_at: null, note: "", created_at: "", updated_at: "",
});

test("FileStore round trip and conflict detection", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "nextread-"));
  try {
    const s = new FileStore(path.join(dir, "sub", "books.json"));
    const empty = await s.read();
    assert.deepEqual(empty, { books: [], etag: null });

    await s.write([book("a")], null);
    const snap = await s.read();
    assert.equal(snap.books[0].id, "a");
    assert.ok(snap.etag);

    // 用舊的 etag 寫入會衝突
    await assert.rejects(s.write([book("x")], null), StoreConflictError);
    await s.write([book("a"), book("b")], snap.etag);
    await assert.rejects(s.write([book("y")], snap.etag), StoreConflictError);
    assert.equal((await s.read()).books.length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("mutate retries after a concurrent write", async () => {
  const inner = new MemoryStore([book("a")]);
  let interfered = false;
  // 第一次寫入前，模擬另一台裝置先寫入
  const racy: BookStore = {
    read: () => inner.read(),
    async write(books, etag) {
      if (!interfered) {
        interfered = true;
        const s = await inner.read();
        await inner.write([...s.books, book("other-device")], s.etag);
      }
      return inner.write(books, etag);
    },
  };
  let calls = 0;
  const result = await mutate(racy, (books) => {
    calls++;
    return { books: [...books, book("mine")], result: "ok" };
  });
  assert.equal(result, "ok");
  assert.equal(calls, 2);
  assert.deepEqual((await inner.read()).books.map((b) => b.id), ["a", "other-device", "mine"]);
});

test("mutate gives up after repeated conflicts", async () => {
  const always: BookStore = {
    read: async () => ({ books: [], etag: null }),
    write: async () => {
      throw new StoreConflictError();
    },
  };
  await assert.rejects(mutate(always, (b) => ({ books: b, result: 1 })), (e: Error & { status?: number }) => e.status === 409);
});
