import type { Book } from "@/lib/types";
import { enrichBooks } from "@/lib/server/enrich";
import { authed, dbError, handle, json } from "@/lib/server/http";
import { defaultProviders } from "@/lib/server/lookup";

export const maxDuration = 60;

export const POST = handle(async (req) => {
  const { db } = await authed(req);
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : null;

  let q = db.from("books").select("*");
  if (ids?.length) q = q.in("id", ids);
  const { data, error } = await q;
  if (error) throw dbError(error);

  const result = await enrichBooks((data ?? []) as Book[], defaultProviders(), async (id, fields) => {
    const { error: e } = await db.from("books").update(fields).eq("id", id);
    if (e && e.code !== "23505") console.error("enrich update", id, e);
    return e;
  });
  return json(result);
});
