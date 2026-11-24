import { dedupKey } from "@/lib/server/books";
import { bookToInput } from "@/lib/shelf";
import type { Book, BookInput, LookupResult } from "@/lib/types";

/** 用書名找書櫃上的同一本書（忽略作者，避免譯名不同而漏掉）。 */
export function findOwned(books: Book[], title: string): Book | undefined {
  const key = dedupKey(title, "");
  return books.find((b) => dedupKey(b.title, "") === key);
}

/** 從推薦結果加入想讀時預先填入的欄位，包含推薦分數、理由、時間。 */
export function wantPreset(
  rec: { title: string; author: string; score: number | null; reason: string },
  book?: LookupResult,
): Partial<BookInput> {
  return {
    title: book?.title || rec.title,
    author: book?.authors.length ? book.authors.join("、") : rec.author,
    isbn: book?.isbn ?? "",
    cover_url: book?.cover_url ?? "",
    description: book?.description ?? "",
    categories: book?.categories ?? [],
    status: "want",
    finished_at: "",
    rec_score: rec.score,
    rec_reason: rec.reason,
    rec_at: new Date().toISOString(),
  };
}

/** 已在想讀清單的書：只更新推薦分數與理由。 */
export function withRecommendation(book: Book, score: number | null, reason: string): BookInput {
  return { ...bookToInput(book), rec_score: score, rec_reason: reason, rec_at: new Date().toISOString() };
}
