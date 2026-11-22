// 對書櫃（Book[]）的純函式操作；搭配 store.mutate() 使用。
import type { Book } from "../types.ts";
import type { BookRow } from "./books.ts";
import { duplicateIsbn, notFound } from "./errors.ts";

export interface Clock {
  now: () => string;
  id: () => string;
}

export const systemClock: Clock = {
  now: () => new Date().toISOString(),
  id: () => crypto.randomUUID(),
};

function assertUniqueIsbn(books: Book[], isbn: string | null, exceptId?: string) {
  if (isbn && books.some((b) => b.isbn === isbn && b.id !== exceptId)) throw duplicateIsbn();
}

function newBook(row: BookRow, clock: Clock): Book {
  const now = clock.now();
  const { created_at, ...fields } = row;
  return { id: clock.id(), ...fields, created_at: created_at ?? now, updated_at: now };
}

export function createBook(books: Book[], row: BookRow, clock = systemClock) {
  assertUniqueIsbn(books, row.isbn);
  const book = newBook(row, clock);
  return { books: [...books, book], result: book };
}

export function updateBook(books: Book[], id: string, row: BookRow, clock = systemClock) {
  const i = books.findIndex((b) => b.id === id);
  if (i < 0) throw notFound();
  assertUniqueIsbn(books, row.isbn, id);
  const { created_at: _ignored, ...fields } = row;
  const book: Book = { ...books[i], ...fields, updated_at: clock.now() };
  const next = books.slice();
  next[i] = book;
  return { books: next, result: book };
}

export function deleteBook(books: Book[], id: string) {
  if (!books.some((b) => b.id === id)) throw notFound();
  return { books: books.filter((b) => b.id !== id), result: undefined };
}

/** 匯入：ISBN 跟現有書重複的列會把 ISBN 清掉再匯入，避免整批失敗。 */
export function importRows(books: Book[], rows: BookRow[], clock = systemClock) {
  const isbns = new Set(books.map((b) => b.isbn).filter(Boolean));
  const added = rows.map((row) => {
    const r = row.isbn && isbns.has(row.isbn) ? { ...row, isbn: null } : row;
    if (r.isbn) isbns.add(r.isbn);
    return newBook(r, clock);
  });
  return { books: [...books, ...added], result: added.length };
}

/** 套用補資料的結果；書已被刪除或 ISBN 已被別本使用時略過該欄位。 */
export function applyPatches(books: Book[], patches: Map<string, Partial<Book>>, clock = systemClock) {
  const now = clock.now();
  const next = books.map((b) => {
    const p = patches.get(b.id);
    if (!p) return b;
    const fields = { ...p };
    if (fields.isbn && books.some((x) => x.isbn === fields.isbn && x.id !== b.id)) delete fields.isbn;
    return { ...b, ...fields, updated_at: now };
  });
  return { books: next, result: undefined };
}
