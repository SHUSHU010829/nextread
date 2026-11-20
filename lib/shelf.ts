import type { Book, BookInput, LookupResult, Status } from "./types";

export type StatusFilter = Status | "all";
export type RatingFilter = "1" | "0" | "-1" | "none" | "all";
export type SortKey = "finished" | "created" | "title";

export interface ShelfFilter {
  q: string;
  status: StatusFilter;
  rating: RatingFilter;
  sort: SortKey;
}

export const DEFAULT_FILTER: ShelfFilter = { q: "", status: "all", rating: "all", sort: "finished" };

function matchesRating(b: Book, r: RatingFilter): boolean {
  if (r === "all") return true;
  if (r === "none") return b.rating === null;
  return String(b.rating) === r;
}

/** 依讀完日期排序：有日期的在前（新到舊），沒日期的依建立時間（新到舊）。 */
function compareFinished(a: Book, b: Book): number {
  if (a.finished_at && b.finished_at) {
    const c = b.finished_at.localeCompare(a.finished_at);
    if (c !== 0) return c;
  } else if (a.finished_at) {
    return -1;
  } else if (b.finished_at) {
    return 1;
  }
  return b.created_at.localeCompare(a.created_at);
}

export function applyFilter(books: Book[], f: ShelfFilter): Book[] {
  const q = f.q.trim().toLowerCase();
  const out = books.filter(
    (b) =>
      (f.status === "all" || b.status === f.status) &&
      matchesRating(b, f.rating) &&
      (!q || `${b.title} ${b.author}`.toLowerCase().includes(q)),
  );
  switch (f.sort) {
    case "finished":
      return out.sort(compareFinished);
    case "created":
      return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
    case "title":
      return out.sort((a, b) => a.title.localeCompare(b.title, "zh-Hant"));
  }
}

export function shelfStats(books: Book[]) {
  return {
    total: books.length,
    read: books.filter((b) => b.status === "read").length,
    liked: books.filter((b) => b.rating === 1).length,
    rated: books.filter((b) => b.rating !== null).length,
    missingInfo: books.filter((b) => !b.description.trim() || !b.cover_url.trim()).length,
  };
}

export function emptyInput(preset: Partial<BookInput> = {}): BookInput {
  return {
    title: "",
    author: "",
    isbn: "",
    cover_url: "",
    description: "",
    categories: [],
    status: "read",
    rating: null,
    finished_at: "",
    note: "",
    ...preset,
  };
}

export function bookToInput(b: Book): BookInput {
  return {
    title: b.title,
    author: b.author,
    isbn: b.isbn ?? "",
    cover_url: b.cover_url,
    description: b.description,
    categories: b.categories ?? [],
    status: b.status,
    rating: b.rating,
    finished_at: b.finished_at ?? "",
    note: b.note,
  };
}

/** 把查詢結果套進表單：書名作者以查詢結果為準，其他資料只覆蓋有值的欄位。 */
export function applyLookup(input: BookInput, r: LookupResult): BookInput {
  return {
    ...input,
    title: r.title || input.title,
    author: r.authors.length ? r.authors.join("、") : input.author,
    isbn: r.isbn || input.isbn,
    cover_url: r.cover_url || input.cover_url,
    description: r.description || input.description,
    categories: r.categories.length ? r.categories : input.categories,
  };
}

export function parseCategories(s: string): string[] {
  return s
    .split(/[,，、]/)
    .map((c) => c.trim())
    .filter(Boolean);
}

export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
