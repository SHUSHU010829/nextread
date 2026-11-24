# nextread：個人閱讀紀錄與書籍推薦系統 開發計畫

Nov 20, 2026 · @Shuyuan Chuang

## 背景與動機

目標是做一個自用的閱讀紀錄 app，並根據我自己的評價推薦書和預測喜歡程度。

- 我主要在 Kobo 上看電子書，但 Kobo 沒有個人化推薦，也沒有好用的評價紀錄。
- 除了推薦，也想要一份自己的閱讀紀錄：讀過哪些書、喜不喜歡、為什麼。
- 目前先用 artifact 版的書櫃（已上線）累積評價資料，正式版完成後再把資料轉過去。

## 目標與非目標

**目標**

1. 紀錄：手動輸入書櫃上的書，記下狀態、評價、讀完日期和心得，當作長期的閱讀紀錄。
2. 評價：用三種評價表達偏好——喜歡、沒想法、不喜歡，輸入成本要低。
3. 推薦：根據我的評價，推薦還沒讀過的書。
4. 預測：查詢任何一本書時，推測我會喜歡它的程度（0–100 分）並說明理由。
5. 介面簡潔、資料不會遺失，換裝置也能使用。

**非目標（目前不做）**

- 多人使用、社群功能、公開書評
- 自動同步 Kobo 閱讀進度
- 協同過濾：只有一位使用者，沒有其他人的評價資料可以參考
- 博客來、讀墨等書店的爬蟲

## 核心功能需求

功能分成紀錄、資料帶入、推薦三組，對應後面的 Phase 1–3。

| 功能 | 說明 | 階段 |
| --- | --- | --- |
| 書櫃列表 | 搜尋書名或作者，依狀態、評價篩選，依讀完日期排序 | Phase 1 |
| 新增／編輯書籍 | 書名、作者、狀態（想讀／在讀／讀完）、評價、讀完日期、心得 | Phase 1 |
| 三種評價 | 喜歡 / 沒想法 / 不喜歡，也可以不評價（想讀的書） | Phase 1 |
| 登入與雲端儲存 | 密碼登入，資料存在 Neon Postgres，換裝置也能用 | Phase 1 |
| 匯入 artifact 資料 | 把目前 artifact 書櫃的紀錄轉進正式版 | Phase 1 |
| 書籍資料自動帶入 | 輸入 ISBN 或書名，從 Google Books / Open Library 帶入封面、簡介、分類 | Phase 2 |
| 手動補簡介 | 查不到的中文書，可以自己貼上簡介 | Phase 2 |
| 喜歡程度預測 | 查詢一本書，給出 0–100 分 | Phase 3 |
| 為我推薦 | 從候選書內排出最可能喜歡的書 | Phase 3 |
| 推薦理由 | 說明是因為哪幾本已讀的書而推薦 | Phase 4 |

## 技術架構

Next.js（含 Route Handler 當後端）+ Neon Postgres + Voyage，整個專案部署在 Vercel。

前端只呼叫自己的 `/api/*` Route Handler；外部的 API key 和推薦運算都留在伺服器端，LLM 到 Phase 4 才會加入。

| 層 | 選型 | 理由 |
| --- | --- | --- |
| 前端 | Next.js + TypeScript | 熟悉，可以部署在 Vercel |
| 後端 | Next.js Route Handler | 跟前端一起部署在 Vercel，封裝外部 API 與推薦邏輯 |
| 資料庫 | Neon Postgres（HTTP driver） | 可還原到過去時間點；Phase 3 可用 pgvector；適合 Vercel 無伺服器環境 |
| 登入 | 單一密碼（環境變數）+ 簽名 cookie | 只有一位使用者，不需要帳號系統 |
| Embedding | Voyage AI | 已在 semantic notes 用過 |
| 書籍資料 | Google Books、Open Library | 免費、可用 ISBN 查詢 |

## 資料模型

主要只有一張 `books` 表（`db/schema.sql`），每本書一列。embedding 到 Phase 3 再加 pgvector 欄位或另開一張表。

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| id | uuid | 主鍵 |
| title | text | 書名，必填 |
| author | text | 作者 |
| isbn | text | 可空，用來查資料與去重 |
| cover\_url | text | 封面 |
| description | text | 簡介，API 帶入或手動貼上 |
| categories | text\[] | 分類／標籤 |
| status | enum | want / reading / read |
| rating | smallint | 1 喜歡 / 0 沒想法 / -1 不喜歡 / null 未評價 |
| finished\_at | date | 讀完日期 |
| note | text | 心得 |
| created\_at / updated\_at | timestamptz | 建立／更新時間 |

候選書（推薦池）一開始就用 `status = want` 的書。之後如果要匯入外部書單，再加一張 `candidates` 表，欄位跟書籍資料部分相同。

## 推薦演算法

採用內容相似度（content-based）：把每本書轉成向量，用我的評價算出一個偏好向量，再拿候選書跟它比較。

1. **Embedding 文字**：書名 + 作者 + 分類 + 簡介；已讀的書再加上心得。存書或修改時重算。
2. **偏好向量**：喜歡 +1、沒想法 0、不喜歡 −1，取加權平均後正規化。
3. **預測分數**：候選書與偏好向量的 cosine 相似度，線性映射到 0–100。
4. **推薦**：對候選池逐本計算分數，取前 N 名。書量在幾千本以內，直接在伺服器端計算即可，不需要向量資料庫。

```latex
p = \mathrm{normalize}\left(\sum_i r_i \cdot e_i\right), \quad r_i \in \{1, 0, -1\}
```

```latex
\mathrm{score}(b) = 100 \cdot \frac{\cos(e_b, p) + 1}{2}
```

之後的改進方向（Phase 4）：

- 「沒想法」改成輕微的負權重（例如 −0.3），用實際資料驗證是否比 0 準。
- 喜歡和不喜歡各自算一個中心點，或改成「最接近的 k 本已評價書」，讓口味很多元時不會被平均掉。
- Embedding 篩出前 20 名後，交給 LLM 重新排序並寫出推薦理由。
- 分數校正：cosine 的實際分布通常集中在一個窄區間，可以改用已評價書的分布做百分位換算。

## 開發階段與里程碑

先做 Phase 1–2，同時繼續用 artifact 累積評價；評價滿 30 本後再開始 Phase 3。

[embedded content: 開發階段 · 4 個 Phase，1 個門檻]

**Phase 1：紀錄 MVP**

- [x] 書櫃儲存（Neon Postgres，本機開發存在 `.data/`）
- [x] 密碼登入
- [x] 書櫃列表：搜尋、篩選、排序
- [x] 新增／編輯／刪除書籍
- [x] 從 artifact 匯入現有資料

完成條件：可以完全取代 artifact 版的日常紀錄。

**Phase 2：書籍資料帶入**

- [x] `/api/lookup`：Google Books 為主，Open Library 備援
- [x] 新增書時從搜尋結果選一本，自動填入封面、簡介、分類
- [x] 查不到時可以手動貼簡介
- [x] 曾經匯入的書批次補上資料

完成條件：新增一本書少於 30 秒，大部分的書都有簡介。

**過渡方案：Claude 推薦（已完成）**

- [x] 評價超過 10 本後啟用「推薦」：把評價與心得交給 Claude，推測單本書的喜歡程度、推薦書櫃外的新書
- [x] 推薦結果用 Google Books／Open Library 確認存在並帶入封面，可直接加入想讀

Phase 3 完成後，可以把 embedding 算出的分數一起交給 Claude，讓理由更有依據。

**Phase 3：Embedding 推薦**

- [ ] 存書時用 Voyage 產生 embedding，存進 pgvector
- [ ] 計算偏好向量
- [ ] `/predict`：單本書的 0–100 分
- [ ] `/recommend`：對「想讀」清單排序
- [ ] 用已評價的書做離線驗證

完成條件：測試集裡，喜歡的書平均分明顯高於不喜歡的書。

**Phase 4：推薦優化（之後再說）**

- [ ] LLM 重排序前 20 名，並寫出推薦理由
- [ ] 調整「沒想法」的權重，或改用 k 近鄰
- [ ] 擴充候選池（`candidates` 表）
- [x] 匯出／匯入

## 風險與待決問題

| 風險 | 影響 | 對策 |
| --- | --- | --- |
| 中文書在 Google Books / Open Library 資料少 | 簡介空白，embedding 品質差 | 允許手動貼簡介；心得也納入 embedding |
| 評價數太少 | 偏好向量不穩定，分數沒參考性 | 先用 artifact 累積 30 本以上再開 Phase 3 |
| 口味多元 | 平均後的偏好向量變模糊 | Phase 4 改用 k 近鄰或多個中心點 |
| 候選池太小 | 只能在「想讀」裡排序，推薦不到新書 | 之後加入 `candidates` 表，或由 LLM 先提名、再用 embedding 打分 |

待決問題：

- [ ] Voyage 要用哪個模型（決定向量維度）？中文效果需要實測。
- [x] 後端用 Go 獨立服務，還是先用 Next.js Route Handler 就好？→ Next.js Route Handler，前後端一起部署在 Vercel。
- [x] 資料存哪裡？→ Neon Postgres，密碼登入（單人使用，不需要帳號系統）。曾經用過 Vercel Blob 的單一 JSON 檔，改成 Neon 以便還原與之後使用 pgvector。
- [ ] 候選書的來源：只用「想讀」，還是要匯入外部書單？
- [x] 部署位置：Vercel，還是放到自己的 VPS？→ Vercel

## 成功指標

- **有在用**：每讀完一本書都會記錄，新增一本書的時間少於 30 秒。
- **預測準**：留一部分已評價的書當測試集，喜歡的書平均分要明顯高於不喜歡的書。
- **推薦有用**：照推薦讀完的書，評為「喜歡」的比例高於自己隨意挑書。
