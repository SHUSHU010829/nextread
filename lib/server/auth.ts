// 單人密碼登入：密碼放在 APP_PASSWORD 環境變數，登入後發一個 HMAC 簽名的 cookie。
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "./errors.ts";

export const COOKIE_NAME = "nextread_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 天

function password(): string {
  const p = process.env.APP_PASSWORD;
  if (!p) throw new HttpError(500, "伺服器尚未設定 APP_PASSWORD");
  return p;
}

/** 簽名金鑰：預設由密碼衍生，所以改密碼會讓所有舊的登入失效。 */
function secret(): string {
  return process.env.SESSION_SECRET || createHash("sha256").update("nextread-session:" + password()).digest("hex");
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  // 先雜湊成固定長度，避免長度不同時洩漏資訊
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkPassword(input: string): boolean {
  return safeEqual(input, password());
}

export function createSessionToken(nowMs = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + MAX_AGE_SECONDS;
  return `${exp}.${sign(String(exp))}`;
}

export function verifySessionToken(token: string | undefined, nowMs = Date.now()): boolean {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) * 1000 < nowMs) return false;
  return safeEqual(sig, sign(exp));
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export function isAuthenticated(req: Request): boolean {
  return verifySessionToken(readCookie(req, COOKIE_NAME));
}

export function requireAuth(req: Request): void {
  if (!isAuthenticated(req)) throw new HttpError(401, "請先登入");
}

export function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`;
}

export function clearedCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
