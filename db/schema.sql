-- nextread：books 資料表（目前的完整結構）。
-- 程式第一次連到資料庫時會自動建立並套用 migration（lib/server/pg-repo.ts 的 MIGRATIONS），
-- 這個檔案只是方便查閱。
CREATE TABLE IF NOT EXISTS books (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL CHECK (length(btrim(title)) > 0),
  author      text NOT NULL DEFAULT '',
  isbn        text UNIQUE,
  cover_url   text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  categories  text[] NOT NULL DEFAULT '{}',
  -- want 想讀 / reading 在讀 / read 完讀 / dropped 棄讀
  status      text NOT NULL DEFAULT 'want' CONSTRAINT books_status_check CHECK (status IN ('want', 'reading', 'read', 'dropped')),
  -- 2 超級喜歡 / 1 喜歡 / 0 沒想法 / -1 不喜歡；只有完讀、棄讀可以評價
  rating      smallint CONSTRAINT books_rating_check CHECK (rating IN (-1, 0, 1, 2)),
  finished_at date,
  note        text NOT NULL DEFAULT '',
  -- 加入想讀時的推薦分數、理由、時間
  rec_score   smallint CHECK (rec_score BETWEEN 0 AND 100),
  rec_reason  text NOT NULL DEFAULT '',
  rec_at      timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
