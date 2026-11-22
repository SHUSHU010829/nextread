// Route Handler 共用：JSON 回應與錯誤處理。
import { HttpError } from "./errors.ts";

export { HttpError };

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(data, { status, headers });
}

export function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

/** 包住 handler，統一處理錯誤。 */
export function handle<A extends unknown[]>(fn: (req: Request, ...args: A) => Promise<Response>) {
  return async (req: Request, ...args: A): Promise<Response> => {
    try {
      return await fn(req, ...args);
    } catch (e) {
      if (e instanceof HttpError) return error(e.status, e.message);
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
