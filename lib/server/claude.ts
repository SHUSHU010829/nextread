// 呼叫 Claude：推測喜歡程度、推薦新書。結構化輸出確保回傳的 JSON 符合 schema。
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Book, Prediction, Suggestion } from "../types.ts";
import { HttpError } from "./errors.ts";
import { best, defaultProviders, searchAll } from "./lookup.ts";
import { clampScore, dropOwned, shelfPrompt, SYSTEM_PROMPT, type ApiMessage } from "./recommend.ts";

const MODEL = "claude-sonnet-5-5";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(500, "伺服器尚未設定 ANTHROPIC_API_KEY");
  // Vercel 函式上限 60 秒：單次請求最多等 50 秒、不自動重試
  client ??= new Anthropic({ timeout: 50_000, maxRetries: 0 });
  return client;
}

async function ask<T>(books: Book[], messages: ApiMessage[], schema: z.ZodType<T>, instructions?: string): Promise<T> {
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
        // 書櫃內容快取起來：連續查詢（推測與聊天共用）時不用重新計算
        { type: "text", text: shelfPrompt(books), cache_control: { type: "ephemeral" } },
        ...(instructions ? [{ type: "text" as const, text: instructions }] : []),
      ],
      messages,
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
  title: z.string().describe("台灣最常見的繁體中文書名，不要加括號、原文或別名"),
  original_title: z.string().describe("原文書名；本身就是中文書時留空字串"),
  author: z.string().describe("作者名，有中文譯名時用中文譯名，不要加括號"),
  score: z.number().describe("0 到 100 的整數，使用者會喜歡的程度"),
  reason: z.string().describe("2 到 3 句，說明依據"),
  based_on: z.array(z.string()).describe("判斷時主要參考的已評價書名，最多 3 本"),
});

export async function predict(books: Book[], query: string): Promise<Prediction> {
  const r = await ask(
    books,
    [
      {
        role: "user",
        content: `推測使用者會多喜歡這本書：「${query}」。\n分析它的主題、文體、風格，對照使用者喜歡與不喜歡的書，給 0–100 分。`,
      },
    ],
    PredictionSchema,
  );
  return { ...r, score: clampScore(r.score), based_on: r.based_on.slice(0, 3) };
}

// ---- 幫我挑書（聊天） ----

const ChatSchema = z.object({
  message: z.string().describe("給使用者的回覆，1 到 3 句，口語自然"),
  items: z
    .array(
      z.object({
        title: z.string(),
        author: z.string(),
        score: z.number().describe("0 到 100 的整數，推測使用者會喜歡的程度"),
        reason: z.string().describe("一句話，點出跟哪本喜歡的書相近"),
        based_on: z.array(z.string()).describe("相近的已評價書名，最多 3 本"),
      }),
    )
    .describe("這次推薦的書；只是聊天或追問時可以是空陣列"),
});

const CHAT_INSTRUCTIONS = `這是一段選書聊天。依照使用者最新的訊息回應：
- 要推薦書時，給 3 到 6 本不在書櫃上（包含想讀清單）、確實存在的書，優先選有繁體中文版的書，避開跟「不喜歡」「沒想法」「棄讀」相似的書，也不要重複之前已經推薦過的書。
- 使用者追問某本書、或需求不清楚時，可以只回覆訊息、不推薦書（items 為空陣列）。
- message 用聊天的語氣，簡短說明這次的挑書方向。`;

export async function chat(books: Book[], messages: ApiMessage[]): Promise<{ message: string; items: Suggestion[] }> {
  const r = await ask(books, messages, ChatSchema, CHAT_INSTRUCTIONS);
  const items = dropOwned(r.items, books).slice(0, 6);

  // 用書籍資料庫確認每一本，順便帶入封面與簡介；查不到的標示為未確認
  const providers = defaultProviders();
  const verified = await Promise.all(
    items.map(async (it): Promise<Suggestion> => {
      let match = null;
      try {
        match = best(await searchAll(providers, { title: it.title, author: it.author }), it.title);
      } catch {
        /* 查詢失敗就當作未確認 */
      }
      return {
        ...it,
        score: clampScore(it.score),
        based_on: it.based_on.slice(0, 3),
        verified: Boolean(match),
        book: match ?? undefined,
      };
    }),
  );
  return { message: r.message, items: verified };
}
