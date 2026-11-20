// 從 Google Books（主要）與 Open Library（備援）查詢書籍資料。
import type { LookupResult } from "../types.ts";
import { normalizeISBN, normalizeTitle } from "./books.ts";

export interface Query {
  isbn?: string;
  title?: string;
  author?: string;
  text?: string;
}

export function isEmptyQuery(q: Query): boolean {
  return !q.isbn && !q.title?.trim() && !q.text?.trim();
}

/** 判斷使用者輸入的是 ISBN 還是書名。 */
export function parseQuery(s: string): Query {
  const t = s.trim();
  const isbn = normalizeISBN(t);
  return isbn ? { isbn } : { text: t };
}

export interface Provider {
  name: string;
  search(q: Query): Promise<LookupResult[]>;
}

type Fetch = typeof fetch;
const TIMEOUT_MS = 8000;

async function getJSON<T>(f: Fetch, url: string): Promise<T> {
  const res = await f(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return (await res.json()) as T;
}

/** 移除 HTML 標籤並整理空行（Google Books 的簡介有時帶 HTML）。 */
export function cleanText(s: string | undefined): string {
  if (!s) return "";
  return s
    .replace(/<br\s*\/?>|<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const https = (u: string) => u.replace(/^http:\/\//, "https://");

// ---- Google Books ----

interface GBVolume {
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    description?: string;
    categories?: string[];
    publishedDate?: string;
    language?: string;
    industryIdentifiers?: { type: string; identifier: string }[];
    imageLinks?: { smallThumbnail?: string; thumbnail?: string };
  };
}

export function googleQuery(q: Query): string {
  if (q.isbn) return `isbn:${q.isbn}`;
  if (q.title) return `intitle:${q.title}` + (q.author ? ` inauthor:${q.author}` : "");
  return q.text ?? "";
}

export function googleBooks(opts: { apiKey?: string; baseURL?: string; fetch?: Fetch } = {}): Provider {
  const base = (opts.baseURL ?? "https://www.googleapis.com/books/v1").replace(/\/$/, "");
  const f = opts.fetch ?? fetch;
  return {
    name: "google",
    async search(q) {
      const p = new URLSearchParams({ q: googleQuery(q), maxResults: "10", printType: "books" });
      if (opts.apiKey) p.set("key", opts.apiKey);
      const body = await getJSON<{ items?: GBVolume[] }>(f, `${base}/volumes?${p}`);
      const out: LookupResult[] = [];
      for (const it of body.items ?? []) {
        const vi = it.volumeInfo;
        if (!vi?.title) continue;
        const ids = vi.industryIdentifiers ?? [];
        const isbn = ids.find((i) => i.type === "ISBN_13")?.identifier ?? ids.find((i) => i.type === "ISBN_10")?.identifier;
        const cover = vi.imageLinks?.thumbnail || vi.imageLinks?.smallThumbnail;
        out.push({
          source: "google",
          title: vi.title,
          subtitle: vi.subtitle || undefined,
          authors: vi.authors ?? [],
          isbn,
          cover_url: cover ? https(cover) : undefined,
          description: cleanText(vi.description) || undefined,
          categories: vi.categories ?? [],
          published_date: vi.publishedDate,
          language: vi.language,
        });
      }
      return out;
    },
  };
}

// ---- Open Library ----

interface OLDoc {
  key?: string;
  title?: string;
  subtitle?: string;
  author_name?: string[];
  isbn?: string[];
  cover_i?: number;
  subject?: string[];
  first_publish_year?: number;
  language?: string[];
}

/** Open Library 的文字欄位可能是字串或 {"type":..., "value":...}。 */
function olText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && typeof (v as { value?: unknown }).value === "string") return (v as { value: string }).value;
  return "";
}

export function openLibrary(
  opts: { baseURL?: string; coversURL?: string; fetch?: Fetch; descriptionLimit?: number } = {},
): Provider {
  const base = (opts.baseURL ?? "https://openlibrary.org").replace(/\/$/, "");
  const covers = (opts.coversURL ?? "https://covers.openlibrary.org").replace(/\/$/, "");
  const f = opts.fetch ?? fetch;
  const descLimit = opts.descriptionLimit ?? 3;
  return {
    name: "openlibrary",
    async search(q) {
      const p = new URLSearchParams();
      if (q.isbn) p.set("isbn", q.isbn);
      else if (q.title) {
        p.set("title", q.title);
        if (q.author) p.set("author", q.author);
      } else p.set("q", q.text ?? "");
      p.set("limit", "8");
      p.set("fields", "key,title,subtitle,author_name,isbn,cover_i,subject,first_publish_year,language");
      const body = await getJSON<{ docs?: OLDoc[] }>(f, `${base}/search.json?${p}`);
      const docs = (body.docs ?? []).filter((d) => d.title);
      const out: LookupResult[] = docs.map((d) => ({
        source: "openlibrary",
        title: d.title!,
        subtitle: d.subtitle || undefined,
        authors: d.author_name ?? [],
        isbn: q.isbn ?? d.isbn?.find((s) => s.length === 13) ?? d.isbn?.[0],
        cover_url: d.cover_i ? `${covers}/b/id/${d.cover_i}-M.jpg` : undefined,
        categories: (d.subject ?? []).slice(0, 5),
        published_date: d.first_publish_year ? String(d.first_publish_year) : undefined,
        language: d.language?.[0],
      }));
      // 補抓前幾筆的作品簡介；失敗就略過
      await Promise.all(
        docs.slice(0, descLimit).map(async (d, i) => {
          if (!d.key?.startsWith("/works/")) return;
          try {
            const work = await getJSON<{ description?: unknown }>(f, `${base}${d.key}.json`);
            out[i].description = cleanText(olText(work.description)) || undefined;
          } catch {
            /* ignore */
          }
        }),
      );
      return out;
    },
  };
}

// ---- 依序嘗試各來源 ----

export async function searchAll(providers: Provider[], q: Query): Promise<LookupResult[]> {
  if (isEmptyQuery(q)) return [];
  const errors: string[] = [];
  for (const p of providers) {
    try {
      const res = await p.search(q);
      if (res.length) return res;
    } catch (e) {
      errors.push(`${p.name}: ${(e as Error).message}`);
    }
  }
  if (providers.length && errors.length === providers.length) throw new Error(errors.join("; "));
  return [];
}

export function defaultProviders(): Provider[] {
  return [googleBooks({ apiKey: process.env.GOOGLE_BOOKS_API_KEY }), openLibrary()];
}

/** 從結果中挑出書名吻合的第一筆，用於批次補資料。 */
export function best(results: LookupResult[], title: string): LookupResult | null {
  const want = normalizeTitle(title);
  if (!want) return null;
  for (const r of results) {
    const got = normalizeTitle(r.title);
    const full = normalizeTitle(r.title + (r.subtitle ?? ""));
    if (!got) continue;
    if (got === want || full === want || want.includes(got) || got.includes(want)) return r;
  }
  return null;
}
