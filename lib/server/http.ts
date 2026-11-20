// Route Handler 共用：驗證登入、建立帶使用者 token 的 Supabase client、錯誤回應。
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ValidationError } from "./books.ts";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * 從 Authorization header 取得使用者 token，驗證後回傳帶著該 token 的 client。
 * 所有查詢都以使用者身分執行，RLS 照常生效；伺服器端不需要 service role key。
 */
export async function authed(req: Request): Promise<{ db: SupabaseClient; userId: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new HttpError(500, "伺服器尚未設定 Supabase");

  const h = req.headers.get("authorization") ?? "";
  const token = /^bearer\s+/i.test(h) ? h.replace(/^bearer\s+/i, "").trim() : "";
  if (!token) throw new HttpError(401, "請先登入");

  const db = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error: err } = await db.auth.getUser(token);
  if (err || !data.user) throw new HttpError(401, "請先登入");
  return { db, userId: data.user.id };
}

/** 把 PostgREST 錯誤轉成 HttpError。 */
export function dbError(e: { code?: string; message?: string } | null): HttpError {
  if (e?.code === "23505") return new HttpError(409, "書櫃裡已經有相同 ISBN 的書");
  if (e?.code === "22P02") return new HttpError(404, "找不到這本書"); // id 不是合法 uuid
  console.error("supabase", e);
  return new HttpError(502, "資料庫暫時無法使用");
}

/** 包住 handler，統一處理錯誤。 */
export function handle<A extends unknown[]>(fn: (req: Request, ...args: A) => Promise<Response>) {
  return async (req: Request, ...args: A): Promise<Response> => {
    try {
      return await fn(req, ...args);
    } catch (e) {
      if (e instanceof HttpError) return error(e.status, e.message);
      if (e instanceof ValidationError) return error(400, e.message);
      console.error(e);
      return error(500, "伺服器錯誤");
    }
  };
}

export async function readJSON(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "JSON 格式錯誤");
  }
}
