import { requireAuth } from "@/lib/server/auth";
import { chat } from "@/lib/server/claude";
import { getRepo } from "@/lib/server/get-repo";
import { handle, HttpError, json, readJSON } from "@/lib/server/http";
import { MIN_RATED, ratedCount, recommendEnabled, toApiMessages } from "@/lib/server/recommend";

export const maxDuration = 60;

export const POST = handle(async (req) => {
  requireAuth(req);
  const body = (await readJSON(req)) as { messages?: unknown };
  const messages = toApiMessages(body.messages);
  if (!messages.length) throw new HttpError(400, "請輸入訊息");
  const books = await getRepo().list();
  if (!recommendEnabled(books)) {
    throw new HttpError(400, `評價超過 ${MIN_RATED} 本才能使用推薦（目前 ${ratedCount(books)} 本）`);
  }
  return json(await chat(books, messages));
});
