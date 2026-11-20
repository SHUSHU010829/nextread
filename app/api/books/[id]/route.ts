import { toRow } from "@/lib/server/books";
import { authed, dbError, handle, HttpError, json, readJSON } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = handle(async (req, { params }: Ctx) => {
  const { db } = await authed(req);
  const { id } = await params;
  const row = toRow(await readJSON(req));
  const { data, error } = await db.from("books").update(row).eq("id", id).select();
  if (error) throw dbError(error);
  if (!data?.length) throw new HttpError(404, "找不到這本書");
  return json(data[0]);
});

export const DELETE = handle(async (req, { params }: Ctx) => {
  const { db } = await authed(req);
  const { id } = await params;
  const { data, error } = await db.from("books").delete().eq("id", id).select("id");
  if (error) throw dbError(error);
  if (!data?.length) throw new HttpError(404, "找不到這本書");
  return new Response(null, { status: 204 });
});
