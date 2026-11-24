import { requireAuth } from "@/lib/server/auth";
import { suggest } from "@/lib/server/claude";
import { getStore } from "@/lib/server/get-store";
import { handle, HttpError, json } from "@/lib/server/http";
import { MIN_RATED, ratedCount, recommendEnabled } from "@/lib/server/recommend";

export const maxDuration = 60;

export const POST = handle(async (req) => {
  requireAuth(req);
  const body = (await req.json().catch(() => ({}))) as { hint?: unknown };
  const hint = typeof body.hint === "string" ? body.hint.trim().slice(0, 200) : "";
  const { books } = await getStore().read();
  if (!recommendEnabled(books)) {
    throw new HttpError(400, `評價超過 ${MIN_RATED} 本才能使用推薦（目前 ${ratedCount(books)} 本）`);
  }
  return json({ items: await suggest(books, hint) });
});
