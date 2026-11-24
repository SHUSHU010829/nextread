// 推薦：把書櫃的評價與心得交給 Claude，推測喜歡程度或推薦新書。
// 只放純函式（門檻、組 prompt、整理結果），呼叫 API 的部分在 claude.ts。
import type { Book } from "../types.ts";
import { dedupKey } from "./books.ts";

/** 已評價（喜歡／沒想法／不喜歡）超過這個數量才啟用推薦。 */
export const MIN_RATED = 10;

export function ratedCount(books: Book[]): number {
  return books.filter((b) => b.rating !== null).length;
}

export function recommendEnabled(books: Book[]): boolean {
  return ratedCount(books) > MIN_RATED;
}

const NOTE_LIMIT = 300;

function line(b: Book): string {
  const parts = [`《${b.title}》`];
  if (b.author) parts.push(b.author);
  if (b.categories.length) parts.push(`分類：${b.categories.slice(0, 4).join("、")}`);
  let s = "- " + parts.join(" / ");
  const note = b.note.trim().replace(/\s+/g, " ");
  if (note) s += `\n  心得：${note.length > NOTE_LIMIT ? note.slice(0, NOTE_LIMIT) + "…" : note}`;
  return s;
}

/** 把書櫃整理成給模型看的文字：依評價分組，附上分類與心得。 */
export function shelfPrompt(books: Book[]): string {
  const group = (r: 1 | 0 | -1) => books.filter((b) => b.rating === r).map(line).join("\n") || "（無）";
  const others = books.filter((b) => b.rating === null).map((b) => `《${b.title}》`).join("、") || "（無）";
  return [
    "以下是使用者的書櫃。",
    `【喜歡】\n${group(1)}`,
    `【沒想法】（讀了沒什麼感覺）\n${group(0)}`,
    `【不喜歡】\n${group(-1)}`,
    `【其他已在書櫃上、尚未評價的書】\n${others}`,
  ].join("\n\n");
}

export const SYSTEM_PROMPT = `你是使用者的私人選書顧問，根據他自己的閱讀評價判斷口味。
- 「喜歡」是正面訊號，「不喜歡」是負面訊號，「沒想法」是輕微的負面訊號。
- 心得說明了喜歡或不喜歡的原因，比書名和分類更重要。
- 只談確實存在的書；不確定一本書是否存在或不了解內容時，要老實說，不要編造。
- 用繁體中文回答，理由要具體點出是跟哪幾本已評價的書相似或不同。`;

export function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));
}

/** 去掉已經在書櫃上的推薦，以及推薦清單內的重複項目。 */
export function dropOwned<T extends { title: string; author: string }>(items: T[], books: Book[]): T[] {
  const seen = new Set(books.map((b) => dedupKey(b.title, b.author)));
  const titles = new Set(books.map((b) => dedupKey(b.title, "")));
  return items.filter((it) => {
    const k = dedupKey(it.title, it.author);
    if (seen.has(k) || titles.has(dedupKey(it.title, ""))) return false;
    seen.add(k);
    return true;
  });
}
