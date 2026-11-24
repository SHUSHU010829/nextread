import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFilter, applyLookup, DEFAULT_FILTER, emptyInput, parseCategories, shelfStats, wantList } from "./shelf.ts";
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
    rec_score: null,
    rec_reason: "",
    rec_at: null,
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
  const st = shelfStats(
    [...books, book({ title: "E", status: "dropped", rating: -1, finished_at: "2025-01-01" }), book({ title: "F", rating: 2, finished_at: "2026-02-01" })],
    2026,
  );
  assert.equal(st.total, 6);
  assert.equal(st.read, 4);
  assert.equal(st.dropped, 1);
  assert.equal(st.superLiked, 1);
  assert.equal(st.liked, 1);
  assert.equal(st.rated, 5);
  assert.equal(st.readThisYear, 3);
  assert.equal(st.want, 1);
});

test("wantList sorts by recommendation score", () => {
  const list = wantList([
    book({ title: "W1", status: "want", rec_score: 60, created_at: "2026-01-03T00:00:00Z" }),
    book({ title: "W2", status: "want", rec_score: null, created_at: "2026-01-05T00:00:00Z" }),
    book({ title: "W3", status: "want", rec_score: 90, created_at: "2026-01-01T00:00:00Z" }),
    book({ title: "R", status: "read" }),
  ]);
  assert.deepEqual(list.map((b) => b.title), ["W3", "W1", "W2"]);
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
