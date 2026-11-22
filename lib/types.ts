export type Status = "want" | "reading" | "read";
export type Rating = 1 | 0 | -1 | null;

export interface Book {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  cover_url: string;
  description: string;
  categories: string[];
  status: Status;
  rating: Rating;
  finished_at: string | null;
  note: string;
  created_at: string;
  updated_at: string;
}

/** 新增或整筆更新時送給 API 的欄位。 */
export interface BookInput {
  title: string;
  author: string;
  isbn: string;
  cover_url: string;
  description: string;
  categories: string[];
  status: Status;
  rating: Rating;
  finished_at: string;
  note: string;
}

export interface LookupResult {
  source: "google" | "openlibrary";
  title: string;
  subtitle?: string;
  authors: string[];
  isbn?: string;
  cover_url?: string;
  description?: string;
  categories: string[];
  published_date?: string;
  language?: string;
}

export interface ImportResult {
  imported: number;
  skipped: string[];
  errors: { index: number; title: string; error: string }[];
}

export interface EnrichResult {
  updated: number;
  /** 時間不夠、這次沒處理到的書。 */
  remaining: number;
  results: { id: string; title: string; status: "updated" | "not_found" | "error"; source?: string }[];
}

export const STATUS_LABEL: Record<Status, string> = {
  read: "讀完",
  reading: "在讀",
  want: "想讀",
};

export const RATING_LABEL: Record<"1" | "0" | "-1", string> = {
  "1": "喜歡",
  "0": "沒想法",
  "-1": "不喜歡",
};
