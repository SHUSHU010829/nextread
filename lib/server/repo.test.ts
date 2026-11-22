import { test } from "node:test";
import assert from "node:assert/strict";
import { toRow } from "./books.ts";
import { HttpError } from "./errors.ts";
import { applyPatches, createBook, deleteBook, importRows, updateBook, type Clock } from "./repo.ts";

function clock(): Clock {
  let n = 0;
  return { now: () => "2026-11-22T00:00:00.000Z", id: () => `id${++n}` };
}

const status = (code: number) => (e: unknown) => e instanceof HttpError && e.status === code;

test("create, update, delete", () => {
  const c = clock();
  let { books, result: a } = createBook([], toRow({ title: "A", isbn: "9789571330825", status: "read", rating: 1 }), c);
  assert.equal(a.id, "id1");
  assert.equal(a.created_at, "2026-11-22T00:00:00.000Z");

  assert.throws(() => createBook(books, toRow({ title: "B", isbn: "978-957-13-3082-5" }), c), status(409));
  ({ books } = createBook(books, toRow({ title: "B" }), c));

  const u = updateBook(books, "id1", toRow({ title: "A2", status: "read", rating: null, note: "n" }), c);
  assert.equal(u.result.title, "A2");
  assert.equal(u.result.rating, null);
  assert.equal(u.result.created_at, a.created_at);
  assert.throws(() => updateBook(books, "id2", toRow({ title: "B", isbn: "9789571330825" }), c), status(409));
  assert.throws(() => updateBook(books, "nope", toRow({ title: "x" }), c), status(404));

  books = deleteBook(u.books, "id1").books;
  assert.deepEqual(books.map((b) => b.id), ["id2"]);
  assert.throws(() => deleteBook(books, "id1"), status(404));
});

test("importRows keeps created_at and drops clashing ISBNs", () => {
  const c = clock();
  const { books } = createBook([], toRow({ title: "A", isbn: "9789571330825" }), c);
  const rows = [
    { ...toRow({ title: "B", isbn: "9789571330825" }) },
    { ...toRow({ title: "C" }), created_at: "2026-09-02T10:00:00.000Z" },
  ];
  const out = importRows(books, rows, c);
  assert.equal(out.result, 2);
  assert.equal(out.books[1].isbn, null);
  assert.equal(out.books[2].created_at, "2026-09-02T10:00:00.000Z");
});

test("applyPatches skips deleted books and taken ISBNs", () => {
  const c = clock();
  let { books } = createBook([], toRow({ title: "A" }), c);
  ({ books } = createBook(books, toRow({ title: "B", isbn: "9789571330825" }), c));
  const patches = new Map([
    ["id1", { description: "d", isbn: "9789571330825" }],
    ["gone", { description: "x" }],
  ]);
  const out = applyPatches(books, patches, c).books;
  assert.equal(out[0].description, "d");
  assert.equal(out[0].isbn, null);
  assert.equal(out.length, 2);
});
