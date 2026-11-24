// 呼叫 Claude：推測喜歡程度、推薦新書。結構化輸出確保回傳的 JSON 符合 schema。
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Book, Prediction, Suggestion } from "../types.ts";
import { HttpError } from "./errors.ts";
import { best, defaultProviders, searchAll } from "./lookup.ts";
import { clampScore, dropOwned, shelfPrompt, SYSTEM_PROMPT } from "./recommend.ts";

const MODEL = "claude-sonnet-5-5";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(500, "伺服器尚未設定 ANTHROPIC_API_KEY");
  // Vercel 函式上限 60 秒：單次請求最多等 50 秒、不自動重試
  client ??= new Anthropic({ timeout: 50_000, maxRetries: 0 });
  return client;
}

async function ask<T>(books: Book[], question: string, schema: z.ZodType<T>): Promise<T> {
  let res;
  try {
    res = await getClient().beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      // 被安全機制拒絕時，由伺服器依類別自動改用建議的備援模型
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
      system: [
        { type: "text", text: SYSTEM_PROMPT },
        // 書櫃內容放在 system 最後並快取：連續查詢時不用重新計算
        { type: "text", text: shelfPrompt(books), cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: question }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new HttpError(500, "ANTHROPIC_API_KEY 無效");
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "請求太頻繁，稍後再試");
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw new HttpError(504, "推薦花太久了，請再試一次");
    if (e instanceof Anthropic.APIError) {
      console.error("claude", e.status, e.message);
      throw new HttpError(502, "推薦服務暫時無法使用，請稍後再試");
    }
    throw e;
  }
  if (res.stop_reason === "refusal") throw new HttpError(422, "這個請求無法處理，換個說法再試");
  if (!res.parsed_output) {
    console.error("claude: no parsed output", res.stop_reason);
    throw new HttpError(502, "推薦結果格式不完整，請再試一次");
  }
  return res.parsed_output;
}

// ---- 這本我會喜歡嗎？ ----

const PredictionSchema = z.object({
  known: z.boolean().describe("是否確定這本書存在且了解其內容"),
  title: z.string().describe("正式書名"),
  author: z.string(),
  score: z.number().describe("0 到 100 的整數，使用者會喜歡的程度"),
  reason: z.string().describe("2 到 3 句，說明依據"),
  based_on: z.array(z.string()).describe("判斷時主要參考的已評價書名，最多 3 本"),
});

export async function predict(books: Book[], query: string): Promise<Prediction> {
  const r = await ask(
    books,
    `推測使用者會多喜歡這本書：「${query}」。\n分析它的主題、文體、風格，對照使用者喜歡與不喜歡的書，給 0–100 分。`,
    PredictionSchema,
  );
  return { ...r, score: clampScore(r.score), based_on: r.based_on.slice(0, 3) };
}

// ---- 為我推薦 ----

const SuggestionsSchema = z.object({
  items: z.array(
    z.object({
      title: z.string(),
      author: z.string(),
      reason: z.string().describe("一句話，點出跟哪本喜歡的書相近"),
      based_on: z.array(z.string()).describe("相近的已評價書名，最多 3 本"),
    }),
  ),
});

const SUGGEST_COUNT = 6;

export async function suggest(books: Book[], hint: string): Promise<Suggestion[]> {
  const r = await ask(
    books,
    `推薦 ${SUGGEST_COUNT + 2} 本使用者可能會喜歡、不在書櫃上、確實存在的書，優先選有繁體中文版的書，避開跟「不喜歡」「沒想法」相似的書。` +
      (hint ? `\n使用者這次的需求：${hint}` : ""),
    SuggestionsSchema,
  );
  const items = dropOwned(r.items, books).slice(0, SUGGEST_COUNT);

  // 用書籍資料庫確認每一本，順便帶入封面與簡介；查不到的標示為未確認
  const providers = defaultProviders();
  return Promise.all(
    items.map(async (it): Promise<Suggestion> => {
      let match = null;
      try {
        match = best(await searchAll(providers, { title: it.title, author: it.author }), it.title);
      } catch {
        /* 查詢失敗就當作未確認 */
      }
      return { ...it, based_on: it.based_on.slice(0, 3), verified: Boolean(match), book: match ?? undefined };
    }),
  );
}
