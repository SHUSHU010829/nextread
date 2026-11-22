import type { Book, BookInput, EnrichResult, ImportResult, LookupResult } from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** 登入過期時通知頁面回到登入畫面。 */
export const UNAUTHORIZED_EVENT = "nextread:unauthorized";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api" + path, {
      ...init,
      credentials: "same-origin",
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    throw new ApiError("無法連線到伺服器", 0);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && path !== "/session") window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(body?.error ?? `HTTP ${res.status}`, res.status);
  }
  return body as T;
}

export const api = {
  session: () => request<{ authenticated: boolean }>("/session"),
  login: (password: string) =>
    request<{ authenticated: boolean }>("/session", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => request<{ authenticated: boolean }>("/session", { method: "DELETE" }),

  listBooks: () => request<Book[]>("/books"),
  createBook: (input: BookInput) => request<Book>("/books", { method: "POST", body: JSON.stringify(input) }),
  updateBook: (id: string, input: BookInput) =>
    request<Book>(`/books/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) }),
  deleteBook: (id: string) => request<void>(`/books/${encodeURIComponent(id)}`, { method: "DELETE" }),
  importBooks: (json: string) => request<ImportResult>("/books/import", { method: "POST", body: json }),
  enrich: (ids?: string[]) =>
    request<EnrichResult>("/books/enrich", { method: "POST", body: JSON.stringify(ids ? { ids } : {}) }),
  lookup: (q: string) => request<LookupResult[]>(`/lookup?q=${encodeURIComponent(q)}`),
};

export const EXPORT_URL = "/api/books/export";

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
