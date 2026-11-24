import { requireAuth } from "@/lib/server/auth";
import { predict } from "@/lib/server/claude";
import { getStore } from "@/lib/server/get-store";
import { handle, HttpError, json, readJSON } from "@/lib/server/http";
import { MIN_RATED, ratedCount, recommendEnabled } from "@/lib/server/recommend";

export const maxDuration = 60;

export const POST = handle(async (req) => {
  requireAuth(req);
  const body = (await readJSON(req)) as { query?: unknown };
  const query = typeof body.query === "string" ? body.query.trim().slice(0, 200) : "";
  if (!query) throw new HttpError(400, "請輸入書名");
  const { books } = await getStore().read();
  if (!recommendEnabled(books)) {
    throw new HttpError(400, `評價超過 ${MIN_RATED} 本才能使用推薦（目前 ${ratedCount(books)} 本）`);
  }
  return json(await predict(books, query));
});
