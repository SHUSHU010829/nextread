// 書籍輸入驗證、正規化，以及 artifact 書櫃資料的匯入對應。
import type { Book, Status } from "../types.ts";
import { ValidationError } from "./errors.ts";

export { ValidationError };

const STATUSES: Status[] = ["want", "reading", "read", "dropped"];
const RATINGS = [2, 1, 0, -1];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 去掉連字號與空白；不是合法的 ISBN-10 / ISBN-13 格式時回傳空字串。 */
export function normalizeISBN(s: string): string {
  const out = s.replace(/[-\s]/g, "").toUpperCase();
  if (/^\d{13}$/.test(out) || /^\d{9}[\dX]$/.test(out)) return out;
  return "";
}

/** 書名比對用：小寫、只留字母與數字。 */
export function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

export function dedupKey(title: string, author: string): string {
  return normalizeTitle(title) + "|" + normalizeTitle(author ?? "");
}

export function cleanCategories(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of input) {
    if (typeof c !== "string") continue;
    const t = c.trim();
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function validDate(d: string): boolean {
  if (!DATE_RE.test(d)) return false;
  const t = new Date(d + "T00:00:00Z");
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export type BookRow = {
  title: string;
  author: string;
  isbn: string | null;
  cover_url: string;
  description: string;
  categories: string[];
  status: Status;
  rating: 2 | 1 | 0 | -1 | null;
  finished_at: string | null;
  note: string;
  rec_score: number | null;
  rec_reason: string;
  rec_at: string | null;
  created_at?: string;
};

/** 驗證並正規化使用者輸入，回傳可以寫入 books 表的欄位。 */
export function toRow(input: unknown): BookRow {
  if (!input || typeof input !== "object") throw new ValidationError("資料格式錯誤");
  const v = input as Record<string, unknown>;

  const title = str(v.title);
  if (!title) throw new ValidationError("書名必填");

  const status = (v.status ?? "want") as Status;
  if (!STATUSES.includes(status)) throw new ValidationError("狀態必須是 want、reading、read 或 dropped");

  let rating = (v.rating ?? null) as BookRow["rating"];
  if (rating !== null && !RATINGS.includes(rating)) {
    throw new ValidationError("評價必須是 2、1、0、-1 或 null");
  }
  // 只有完讀、棄讀可以評價；棄讀沒有評價時預設為不喜歡
  if (status === "want" || status === "reading") rating = null;
  else if (status === "dropped" && rating === null) rating = -1;

  let recScore: number | null = null;
  if (v.rec_score !== undefined && v.rec_score !== null && v.rec_score !== "") {
    const n = Number(v.rec_score);
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new ValidationError("推薦分數必須是 0–100");
    recScore = Math.round(n);
  }
  let recAt: string | null = null;
  const rawRecAt = str(v.rec_at);
  if (rawRecAt) {
    if (Number.isNaN(Date.parse(rawRecAt))) throw new ValidationError("推薦時間格式不正確");
    recAt = new Date(rawRecAt).toISOString();
  }

  let isbn: string | null = null;
  const rawIsbn = str(v.isbn);
  if (rawIsbn) {
    isbn = normalizeISBN(rawIsbn);
    if (!isbn) throw new ValidationError(`ISBN 格式不正確：${rawIsbn}`);
  }

  let finished: string | null = null;
  const rawDate = str(v.finished_at);
  if (rawDate) {
    if (!validDate(rawDate)) throw new ValidationError("讀完日期格式需為 YYYY-MM-DD");
    finished = rawDate;
  }

  return {
    title,
    author: str(v.author),
    isbn,
    cover_url: str(v.cover_url),
    description: str(v.description),
    categories: cleanCategories(v.categories),
    status,
    rating,
    finished_at: finished,
    note: str(v.note),
    rec_score: recScore,
    rec_reason: str(v.rec_reason).slice(0, 1000),
    rec_at: recAt,
  };
}

// ---- 匯入 ----

/** 接受 JSON 陣列，或 {"books": [...]}。 */
export function parseImport(text: string): unknown[] {
  if (!text.trim()) throw new ValidationError("匯入內容是空的");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new ValidationError(`JSON 格式錯誤：${(e as Error).message}`);
  }
  if (Array.isArray(data)) return data;
  const books = (data as { books?: unknown } | null)?.books;
  if (Array.isArray(books)) return books;
  throw new ValidationError('找不到書籍資料：需要 JSON 陣列或 {"books": [...]}');
}

function parseRating(v: unknown): BookRow["rating"] {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "string" ? Number(v) : v;
  if (n === 2 || n === 1 || n === 0 || n === -1) return n;
  throw new ValidationError(`評價必須是 2、1、0、-1 或 null，收到 ${JSON.stringify(v)}`);
}

/**
 * 把一筆匯入資料轉成 row。同時接受 artifact 書櫃的 camelCase 欄位
 * （finishedAt、createdAt）與本系統的 snake_case 欄位。
 */
export function importItemToRow(item: unknown): BookRow {
  if (!item || typeof item !== "object") throw new ValidationError("資料格式錯誤");
  const v = item as Record<string, unknown>;
  let finished = str(v.finished_at) || str(v.finishedAt);
  if (finished.length > 10) finished = finished.slice(0, 10); // ISO 時間只取日期
  const row = toRow({
    ...v,
    status: v.status || "read",
    rating: parseRating(v.rating),
    finished_at: finished,
  });
  const created = str(v.created_at) || str(v.createdAt);
  if (created && !Number.isNaN(Date.parse(created)) && /^\d{4}-\d{2}-\d{2}T/.test(created)) {
    row.created_at = created;
  }
  return row;
}

export interface ImportError {
  index: number;
  title: string;
  error: string;
}

export interface ImportPlan {
  rows: BookRow[];
  skipped: string[];
  errors: ImportError[];
}

/** 驗證每一筆資料，並以書名＋作者略過已存在或重複的書。 */
export function planImport(items: unknown[], existing: Pick<Book, "title" | "author">[]): ImportPlan {
  const seen = new Set(existing.map((b) => dedupKey(b.title, b.author)));
  const plan: ImportPlan = { rows: [], skipped: [], errors: [] };
  items.forEach((item, index) => {
    const title = str((item as { title?: unknown } | null)?.title);
    let row: BookRow;
    try {
      row = importItemToRow(item);
    } catch (e) {
      plan.errors.push({ index, title, error: (e as Error).message });
      return;
    }
    const key = dedupKey(row.title, row.author);
    if (seen.has(key)) {
      plan.skipped.push(row.title);
      return;
    }
    seen.add(key);
    plan.rows.push(row);
  });
  return plan;
}
