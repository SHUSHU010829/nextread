import { authed, handle, HttpError, json } from "@/lib/server/http";
import { defaultProviders, isEmptyQuery, parseQuery, searchAll } from "@/lib/server/lookup";

export const GET = handle(async (req) => {
  await authed(req);
  const params = new URL(req.url).searchParams;
  let q = parseQuery(params.get("q") ?? "");
  const title = params.get("title")?.trim();
  if (isEmptyQuery(q) && title) q = { title, author: params.get("author")?.trim() };
  if (isEmptyQuery(q)) throw new HttpError(400, "請輸入書名或 ISBN");
  try {
    return json(await searchAll(defaultProviders(), q));
  } catch (e) {
    console.warn("lookup", e);
    throw new HttpError(502, "書籍資料查詢失敗，請稍後再試");
  }
});
