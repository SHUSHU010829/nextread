import { supabase } from "./supabase";
import type { Book, BookInput, EnrichResult, ImportResult, LookupResult } from "./types";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  const headers: Record<string, string> = {};
  if (session) headers.Authorization = `Bearer ${session.access_token}`;
  if (init.body) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(API_URL + path, { ...init, headers: { ...headers, ...(init.headers as object) } });
  } catch {
    throw new ApiError("無法連線到伺服器", 0);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && supabase) await supabase.auth.signOut();
    throw new ApiError(body?.error ?? `HTTP ${res.status}`, res.status);
  }
  return body as T;
}

export const api = {
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

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
