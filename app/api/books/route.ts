import { toRow } from "@/lib/server/books";
import { authed, dbError, handle, json, readJSON } from "@/lib/server/http";

export const GET = handle(async (req) => {
  const { db } = await authed(req);
  const { data, error } = await db
    .from("books")
    .select("*")
    .order("finished_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw dbError(error);
  return json(data ?? []);
});

export const POST = handle(async (req) => {
  const { db } = await authed(req);
  const row = toRow(await readJSON(req));
  const { data, error } = await db.from("books").insert(row).select().single();
  if (error) throw dbError(error);
  return json(data, 201);
});
