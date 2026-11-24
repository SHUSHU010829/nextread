/** dropped：棄讀。 */
export type Status = "want" | "reading" | "read" | "dropped";
/** 2 超級喜歡、1 喜歡、0 沒想法、-1 不喜歡、null 未評價。 */
export type Rating = 2 | 1 | 0 | -1 | null;

/** 只有完讀或棄讀的書可以評價。 */
export const RATABLE_STATUSES: Status[] = ["read", "dropped"];
export const canRate = (s: Status) => RATABLE_STATUSES.includes(s);

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
  /** 加入想讀時的推薦分數（0–100），沒有則為 null。 */
  rec_score: number | null;
  /** 加入想讀時的推薦理由。 */
  rec_reason: string;
  /** 推薦的時間（ISO）。 */
  rec_at: string | null;
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
  rec_score: number | null;
  rec_reason: string;
  /** ISO 時間；空字串代表沒有。 */
  rec_at: string;
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
  read: "完讀",
  reading: "在讀",
  want: "想讀",
  dropped: "棄讀",
};

export type RatingKey = "2" | "1" | "0" | "-1";
export const RATING_LABEL: Record<RatingKey, string> = {
  "2": "超級喜歡",
  "1": "喜歡",
  "0": "沒想法",
  "-1": "不喜歡",
};

export interface Prediction {
  /** 模型是否確定這本書存在且了解內容；false 時分數沒有參考價值。 */
  known: boolean;
  title: string;
  /** 原文書名；中文書為空字串。 */
  original_title: string;
  author: string;
  score: number;
  reason: string;
  based_on: string[];
}

export interface Suggestion {
  title: string;
  author: string;
  /** 推測的喜歡程度 0–100。 */
  score: number;
  reason: string;
  based_on: string[];
  /** 是否在 Google Books / Open Library 查到這本書。 */
  verified: boolean;
  /** 查到時的書籍資料（封面、簡介等）。 */
  book?: LookupResult;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** assistant 訊息附帶的推薦書。 */
  items?: Suggestion[];
}
