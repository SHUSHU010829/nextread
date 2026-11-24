import { test } from "node:test";
import assert from "node:assert/strict";
import type { Book, LookupResult } from "../types.ts";
import { enrichBooks } from "./enrich.ts";
import type { Provider } from "./lookup.ts";

function book(p: Partial<Book>): Book {
  return {
    id: "x",  title: "x", author: "", isbn: null, cover_url: "", description: "", categories: [],
    status: "read", rating: null, finished_at: null, note: "", rec_score: null, rec_reason: "", rec_at: null, created_at: "", updated_at: "", ...p,
  };
}

const provider: Provider = {
  name: "fake",
  async search(q) {
    if (q.title === "三體") {
      return [{ source: "google", title: "三體", authors: ["劉慈欣"], isbn: "9789573327059", description: "科幻小說",
        cover_url: "https://img/3.jpg", categories: ["Fiction"] } satisfies LookupResult];
    }
    return [{ source: "google", title: "Unrelated", authors: [], categories: [] }];
  },
};

test("enrich fills only empty fields and skips duplicate ISBN", async () => {
  const books = [
    book({ id: "1", title: "三體" }),
    book({ id: "2", title: "冷門書" }),
    book({ id: "3", title: "已完整", description: "有了", cover_url: "https://c" }),
    book({ id: "4", title: "三體", description: "我自己寫的" }),
    book({ id: "5", title: "三體 平裝版", description: "d", cover_url: "https://c", isbn: "9789573327059" }),
  ];
  const updates: Record<string, Partial<Book>> = {};
  const res = await enrichBooks(books, [provider], async (id, fields) => {
    if (fields.isbn && books.some((b) => b.id !== id && b.isbn === fields.isbn)) return { code: "23505" };
    updates[id] = fields;
    return null;
  });
  assert.equal(res.updated, 2);
  assert.equal(res.results.length, 3);
  assert.deepEqual(updates["1"], { description: "科幻小說", cover_url: "https://img/3.jpg", categories: ["Fiction"], author: "劉慈欣" });
  assert.deepEqual(updates["4"], { cover_url: "https://img/3.jpg", categories: ["Fiction"], author: "劉慈欣" });
  assert.equal(updates["2"], undefined);
  assert.equal(res.results.find((r) => r.id === "2")?.status, "not_found");
});

test("enrich stops starting new lookups after the deadline", async () => {
  let t = 0;
  const books = [book({ id: "1", title: "三體" }), book({ id: "2", title: "三體" }), book({ id: "3", title: "三體" })];
  const res = await enrichBooks(books, [provider], async () => {
    t += 10;
    return null;
  }, { concurrency: 1, deadline: 15, now: () => t });
  assert.equal(res.results.length, 2);
  assert.equal(res.remaining, 1);
});
