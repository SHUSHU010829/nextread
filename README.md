# nextread

個人閱讀紀錄與書籍推薦系統。開發計畫見 [docs/PLAN.md](docs/PLAN.md)。

目前完成 **Phase 1（紀錄 MVP）** 與 **Phase 2（書籍資料帶入）**；Phase 3（Embedding 推薦）等評價累積到 30 本以上再開始。

```
app/            Next.js App Router：頁面與 /api/* Route Handler
components/     書櫃、新增／編輯、匯入等元件
lib/            前端共用（型別、篩選排序、API client）
lib/server/     只在伺服器端執行（輸入驗證、匯入、書籍資料查詢、批次補資料）
supabase/       資料庫 migration（books 表、RLS）
```

## 架構

```
瀏覽器 ──(登入)──▶ Supabase Auth
   │
   │  Authorization: Bearer <使用者 access token>
   ▼
Next.js /api/*（Vercel Functions）──(同一個 token)──▶ Supabase（RLS：只能存取自己的書）
   │
   └──▶ Google Books（主要）／Open Library（備援）
```

- 前端和 API 在同一個 Next.js 專案，一起部署到 Vercel，不需要另外的後端服務。
- 伺服器端不持有 service role key：每個請求都用使用者自己的 token 查詢 Supabase，所以 RLS 照常生效。
- `GOOGLE_BOOKS_API_KEY` 只在伺服器端使用，不會送到瀏覽器。

## API

所有路由都需要 `Authorization: Bearer <Supabase access token>`（前端會自動帶）。

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/api/books` | 全部書籍（依讀完日期、建立時間排序） |
| POST | `/api/books` | 新增 |
| PUT | `/api/books/{id}` | 整筆更新 |
| DELETE | `/api/books/{id}` | 刪除 |
| POST | `/api/books/import` | 匯入 JSON（artifact 格式或本系統格式），書名＋作者重複的會略過 |
| POST | `/api/books/enrich` | 替缺簡介或封面的書查資料，只填空白欄位；可帶 `{"ids": [...]}` |
| GET | `/api/lookup?q=` | ISBN 或書名查詢；Google Books 失敗或沒結果時改查 Open Library |

## 設定 Supabase

1. 建立 Supabase 專案。
2. 執行 migration：在 SQL Editor 貼上 `supabase/migrations/20261120000000_books.sql`，或用 CLI `supabase db push`。
3. Authentication → Users → **Add user** 建立自己的帳號（Email + 密碼）。
   只有一位使用者，建議在 Authentication → Sign In / Providers 關閉「Allow new users to sign up」。
4. 如果要用「寄登入連結」：Authentication → URL Configuration 把網站網址（本機與 Vercel 網域）加進 Redirect URLs。

## 本機開發

```bash
cp .env.example .env.local   # 填入 Supabase URL、anon key、Google Books API key
npm install
npm run dev
```

## 部署到 Vercel

1. 在 Vercel 匯入這個 GitHub repo（Framework 會自動偵測為 Next.js，Root Directory 維持預設）。
2. Settings → Environment Variables 加入：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `GOOGLE_BOOKS_API_KEY`（建議設定；沒有 key 很容易被限流，HTTP 429）
3. 部署完成後，把 Vercel 網址加到 Supabase 的 Redirect URLs（使用登入連結時需要）。

「補資料」一次處理所有缺資料的書，函式上限設為 60 秒；書很多時可能要按幾次。

## 從 artifact 書櫃匯入

「匯入」接受 artifact 書櫃的資料格式（JSON 陣列）：

```json
[{"title":"挪威的森林","author":"村上春樹","status":"read","rating":1,"finishedAt":"2026-09-01","note":"…","createdAt":"2026-09-02T10:00:00.000Z"}]
```

- `rating`：`1` 喜歡、`0` 沒想法、`-1` 不喜歡、`null` 未評價
- `createdAt` 會保留成原本的建立時間
- 也接受 `{"books": [...]}` 與 snake_case 欄位（`finished_at`、`cover_url`、`description`、`categories`、`isbn`），之後的匯出／匯入可以共用
- 匯入完按「補資料」，替這些書批次帶入封面與簡介

## 測試

```bash
npm test            # 單元測試（驗證、匯入、書籍資料解析、補資料）
npm run typecheck
npm run build
```
