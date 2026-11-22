import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFilter, applyLookup, DEFAULT_FILTER, emptyInput, parseCategories, shelfStats } from "./shelf.ts";
import type { Book } from "./types.ts";

function book(p: Partial<Book>): Book {
  return {
    id: p.title ?? "x",
    
    title: "x",
    author: "",
    isbn: null,
    cover_url: "",
    description: "",
    categories: [],
    status: "read",
    rating: null,
    finished_at: null,
    note: "",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...p,
  };
}

const books = [
  book({ title: "A", author: "村上春樹", rating: 1, finished_at: "2026-03-01" }),
  book({ title: "B", rating: -1, finished_at: "2026-05-01" }),
  book({ title: "C", status: "want", created_at: "2026-06-01T00:00:00Z" }),
  book({ title: "D", rating: 0, created_at: "2026-02-01T00:00:00Z", description: "d", cover_url: "c" }),
];

test("sort by finished date, undated books after, newest first", () => {
  assert.deepEqual(
    applyFilter(books, DEFAULT_FILTER).map((b) => b.title),
    ["B", "A", "C", "D"],
  );
});

test("filters by status, rating and query", () => {
  assert.deepEqual(applyFilter(books, { ...DEFAULT_FILTER, status: "want" }).map((b) => b.title), ["C"]);
  assert.deepEqual(applyFilter(books, { ...DEFAULT_FILTER, rating: "0" }).map((b) => b.title), ["D"]);
  assert.deepEqual(applyFilter(books, { ...DEFAULT_FILTER, rating: "none" }).map((b) => b.title), ["C"]);
  assert.deepEqual(applyFilter(books, { ...DEFAULT_FILTER, q: "村上" }).map((b) => b.title), ["A"]);
});

test("stats", () => {
  assert.deepEqual(shelfStats(books), { total: 4, read: 3, liked: 1, rated: 3, missingInfo: 3 });
});

test("applyLookup keeps existing values when result is empty", () => {
  const input = emptyInput({ title: "三体", author: "", description: "我自己貼的", note: "好看" });
  const out = applyLookup(input, {
    source: "google",
    title: "三體",
    authors: ["劉慈欣"],
    isbn: "9789573327059",
    categories: [],
  });
  assert.equal(out.title, "三體");
  assert.equal(out.author, "劉慈欣");
  assert.equal(out.description, "我自己貼的");
  assert.equal(out.note, "好看");
  assert.equal(out.isbn, "9789573327059");
});

test("parseCategories", () => {
  assert.deepEqual(parseCategories("小說, 科幻，日本、 "), ["小說", "科幻", "日本"]);
});
