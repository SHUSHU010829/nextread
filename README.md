# nextread

個人閱讀紀錄與書籍推薦系統。開發計畫見 [docs/PLAN.md](docs/PLAN.md)。

目前完成 **Phase 1（紀錄 MVP）** 與 **Phase 2（書籍資料帶入）**；Phase 3（Embedding 推薦）等評價累積到 30 本以上再開始。

```
web/       Next.js + TypeScript 前端（書櫃、新增／編輯、匯入、查詢書籍資料）
api/       Go API（書籍 CRUD、artifact 匯入、/lookup、批次補資料）
supabase/  資料庫 migration（books 表、RLS）
```

## 架構

```
瀏覽器 ──(Supabase Auth 登入)──▶ Supabase Auth
   │
   │  Authorization: Bearer <使用者 access token>
   ▼
Go API ──(同一個 token)──▶ Supabase PostgREST ──▶ Postgres（RLS：只能存取自己的書）
   │
   └──▶ Google Books（主要）／Open Library（備援）
```

- 前端只呼叫 Go API；外部 API key 留在後端。
- Go 不持有 service role key：它把使用者的 token 轉給 PostgREST，所以 RLS 照常生效。
- 驗證 token 的方式是呼叫 Supabase `/auth/v1/user`（快取 2 分鐘），不必處理 JWT secret 或 JWKS 金鑰輪替。

## API

所有路由（除了 `/healthz`）都需要 `Authorization: Bearer <Supabase access token>`。

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/books` | 全部書籍（依讀完日期、建立時間排序） |
| POST | `/books` | 新增 |
| PUT | `/books/{id}` | 整筆更新 |
| DELETE | `/books/{id}` | 刪除 |
| POST | `/books/import` | 匯入 JSON（artifact 格式或本系統格式），書名＋作者重複的會略過 |
| POST | `/books/enrich` | 替缺簡介或封面的書查資料，只填空白欄位；可帶 `{"ids": [...]}` |
| GET | `/lookup?q=` | ISBN 或書名查詢；Google Books 失敗或沒結果時改查 Open Library |

## 本機開發

### 1. Supabase

1. 建立 Supabase 專案。
2. 執行 migration：在 SQL Editor 貼上 `supabase/migrations/20261120000000_books.sql`，或用 CLI `supabase db push`。
3. Authentication → Users → **Add user** 建立自己的帳號（Email + 密碼）。
   只有一位使用者，建議在 Authentication → Sign In / Providers 關閉「Allow new users to sign up」。
4. 如果要用「寄登入連結」：Authentication → URL Configuration 把前端網址加進 Redirect URLs。

### 2. Go API

```bash
cd api
export SUPABASE_URL=https://xxx.supabase.co
export SUPABASE_ANON_KEY=...            # Project Settings → API → anon / publishable key
export GOOGLE_BOOKS_API_KEY=...         # 建議設定；沒有 key 時很容易被限流（HTTP 429）
export ALLOWED_ORIGINS=http://localhost:3000
go run ./cmd/server                     # 預設 :8080，可用 PORT 改
```

### 3. 前端

```bash
cd web
cp .env.example .env.local              # 填入 Supabase URL、anon key、API 位址
npm install
npm run dev
```

## 從 artifact 書櫃匯入

正式版的「匯入」接受 artifact 書櫃的資料格式（JSON 陣列）：

```json
[{"title":"挪威的森林","author":"村上春樹","status":"read","rating":1,"finishedAt":"2026-09-01","note":"…","createdAt":"2026-09-02T10:00:00.000Z"}]
```

- `rating`：`1` 喜歡、`0` 沒想法、`-1` 不喜歡、`null` 未評價
- `createdAt` 會保留成原本的建立時間
- 也接受 `{"books": [...]}` 與 snake_case 欄位（`finished_at`、`cover_url`、`description`、`categories`、`isbn`），之後的匯出／匯入可以共用
- 匯入完按「補資料」，替這些書批次帶入封面與簡介

## 測試

```bash
cd api && go test ./...
cd web && npm test && npm run typecheck && npm run build
```

實際呼叫 Google Books / Open Library 的測試預設不跑：

```bash
cd api && go test -tags live -run TestLive -v ./internal/lookup/
```
