import { requireAuth } from "@/lib/server/auth";
import { toRow } from "@/lib/server/books";
import { getStore } from "@/lib/server/get-store";
import { handle, json, readJSON } from "@/lib/server/http";
import { deleteBook, updateBook } from "@/lib/server/repo";
import { mutate } from "@/lib/server/store";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = handle(async (req, { params }: Ctx) => {
  requireAuth(req);
  const { id } = await params;
  const row = toRow(await readJSON(req));
  const book = await mutate(getStore(), (books) => updateBook(books, id, row));
  return json(book);
});

export const DELETE = handle(async (req, { params }: Ctx) => {
  requireAuth(req);
  const { id } = await params;
  await mutate(getStore(), (books) => deleteBook(books, id));
  return new Response(null, { status: 204 });
});
