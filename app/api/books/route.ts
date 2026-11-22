import { requireAuth } from "@/lib/server/auth";
import { toRow } from "@/lib/server/books";
import { getStore } from "@/lib/server/get-store";
import { handle, json, readJSON } from "@/lib/server/http";
import { createBook } from "@/lib/server/repo";
import { mutate } from "@/lib/server/store";

export const GET = handle(async (req) => {
  requireAuth(req);
  const { books } = await getStore().read();
  return json(books);
});

export const POST = handle(async (req) => {
  requireAuth(req);
  const row = toRow(await readJSON(req));
  const book = await mutate(getStore(), (books) => createBook(books, row));
  return json(book, 201);
});
