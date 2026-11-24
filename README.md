# nextread

個人閱讀紀錄與書籍推薦系統。開發計畫見 [docs/PLAN.md](docs/PLAN.md)。

目前完成 **Phase 1（紀錄 MVP）**、**Phase 2（書籍資料帶入）**，以及先用 Claude 做的**推薦**（評價超過 10 本後啟用）；Phase 3（Embedding 推薦）等評價累積到 30 本以上再開始。

```
app/            Next.js App Router：頁面與 /api/* Route Handler
components/     書櫃、新增／編輯、匯入等元件
lib/            前端共用（型別、篩選排序、API client）
lib/server/     只在伺服器端執行（登入、儲存、輸入驗證、匯入、書籍資料查詢、批次補資料）
```

## 架構

```
瀏覽器 ──(密碼登入，取得簽名 cookie)──▶ Next.js /api/*（Vercel Functions）
                                           │
                                           ├──▶ Vercel Blob：nextread/books.json（私有）
                                           ├──▶ Google Books（主要）／Open Library（備援）
                                           └──▶ Claude API（推薦）
```

- 只有一位使用者，所以不用資料庫：整個書櫃是一個 JSON 檔，幾百本書大約幾百 KB。
- 登入是單一密碼（`APP_PASSWORD`），登入後發一個 HMAC 簽名、30 天有效的 HttpOnly cookie。改密碼會讓所有舊的登入失效。
- 寫入時帶上讀取當時的 etag：如果兩台裝置同時存檔，後到的那次會重新讀取、套用修改再寫入，不會蓋掉另一台的修改。
- Blob 檔案設為 private，只能透過伺服器讀取。
- 本機開發沒有設定 `BLOB_READ_WRITE_TOKEN` 時，資料存在 `.data/books.json`。

## API

除了 `/api/session`，所有路由都需要登入（cookie 由瀏覽器自動帶）。

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET / POST / DELETE | `/api/session` | 查詢登入狀態／用密碼登入／登出 |
| GET | `/api/books` | 全部書籍 |
| POST | `/api/books` | 新增 |
| PUT | `/api/books/{id}` | 整筆更新 |
| DELETE | `/api/books/{id}` | 刪除 |
| POST | `/api/books/import` | 匯入 JSON（artifact 格式或本系統匯出的格式），書名＋作者重複的會略過 |
| GET | `/api/books/export` | 下載整個書櫃的 JSON 備份，可以直接匯回 |
| POST | `/api/books/enrich` | 替缺簡介或封面的書查資料，只填空白欄位；可帶 `{"ids": [...]}` |
| GET | `/api/lookup?q=` | ISBN 或書名查詢；Google Books 失敗或沒結果時改查 Open Library |
| POST | `/api/recommend/predict` | `{"query": "書名"}`：推測喜歡程度（0–100）與理由 |
| POST | `/api/recommend/suggest` | `{"hint": "選填"}`：推薦書櫃上沒有的書，並用書籍資料庫確認、帶入封面 |

## 推薦

書櫃頁面的「推薦」按鈕。已評價（喜歡／沒想法／不喜歡）的書**超過 10 本**才會啟用，門檻在 `lib/server/recommend.ts` 的 `MIN_RATED`。

- **這本我會喜歡嗎？**：輸入書名，回傳 0–100 分、理由與參考了哪幾本已評價的書；模型不確定這本書時會直說，不給分數。
- **為我推薦**：推薦 6 本書櫃上沒有的書，可以補一句這次想看什麼。每本會再查一次 Google Books／Open Library 確認存在並帶入封面，查不到的會標示。按「加入想讀」會開啟新增視窗並預先填好資料。
- 每次請求把書櫃（依評價分組，附分類與心得，心得超過 300 字會截斷）交給 Claude（`claude-sonnet-5-5`，effort `medium`），用結構化輸出取得固定格式的 JSON。書櫃內容有開 prompt caching。
- 被安全機制拒絕時由 API 自動改用備援模型（`fallbacks: "default"`）。
- 需要 `ANTHROPIC_API_KEY`。費用依書櫃大小和模型思考的長度而定：書櫃幾十本時，一次推測或推薦大約 0.015–0.06 美元（約新台幣 0.5–2 元）。實際花費可以在 Claude Console 的 Usage 頁面查看。

## 本機開發

```bash
cp .env.example .env.local   # 至少填 APP_PASSWORD
npm install
npm run dev
```

## 部署到 Vercel

1. 在 Vercel 匯入這個 GitHub repo（Framework 會自動偵測為 Next.js）。
2. 專案的 **Storage** → 建立 **Blob** store 並連接到這個專案。`BLOB_READ_WRITE_TOKEN` 會自動加入環境變數。
3. **Settings → Environment Variables** 加入：
   - `APP_PASSWORD`：登入密碼，請用夠長的密碼
   - `GOOGLE_BOOKS_API_KEY`：建議設定；沒有 key 很容易被限流（HTTP 429）
   - `ANTHROPIC_API_KEY`：推薦功能需要
4. 重新部署，讓新的環境變數生效。

「補資料」每次最多查 40 秒，接著先存下已補好的資料（函式上限 60 秒）。書很多時畫面會提示還剩幾本，再按一次會接著處理。

## 備份

書櫃頁面底部有「匯出 JSON 備份」。Vercel Blob 本身沒有版本紀錄，建議偶爾下載一份。匯出的檔案可以直接用「匯入」匯回去，重複的書會略過。

## 從 artifact 書櫃匯入

「匯入」接受 artifact 書櫃的資料格式（JSON 陣列）：

```json
[{"title":"挪威的森林","author":"村上春樹","status":"read","rating":1,"finishedAt":"2026-09-01","note":"…","createdAt":"2026-09-02T10:00:00.000Z"}]
```

- `rating`：`1` 喜歡、`0` 沒想法、`-1` 不喜歡、`null` 未評價
- `createdAt` 會保留成原本的建立時間
- 也接受 `{"books": [...]}` 與 snake_case 欄位（`finished_at`、`cover_url`、`description`、`categories`、`isbn`），也就是「匯出」的格式
- 匯入完按「補資料」，替這些書批次帶入封面與簡介

## 測試

```bash
npm test            # 單元測試（登入、儲存與寫入衝突、書櫃操作、驗證、匯入、書籍資料解析、補資料、推薦）
npm run typecheck
npm run build
```
