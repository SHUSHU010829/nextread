import { checkPassword, clearedCookie, createSessionToken, isAuthenticated, sessionCookie } from "@/lib/server/auth";
import { handle, HttpError, json, readJSON } from "@/lib/server/http";

export const GET = handle(async (req) => json({ authenticated: isAuthenticated(req) }));

export const POST = handle(async (req) => {
  const body = (await readJSON(req)) as { password?: unknown };
  if (typeof body.password !== "string" || !checkPassword(body.password)) {
    await new Promise((r) => setTimeout(r, 800)); // 減緩暴力嘗試
    throw new HttpError(401, "密碼錯誤");
  }
  return json({ authenticated: true }, 200, { "Set-Cookie": sessionCookie(createSessionToken()) });
});

export const DELETE = handle(async () => json({ authenticated: false }, 200, { "Set-Cookie": clearedCookie() }));
