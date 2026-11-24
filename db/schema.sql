-- nextread：books 資料表。程式第一次連到資料庫時會自動建立（lib/server/pg-repo.ts），
-- 這個檔案只是方便查閱，或想手動在 Neon 的 SQL Editor 建表時使用。
CREATE TABLE IF NOT EXISTS books (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL CHECK (length(btrim(title)) > 0),
  author      text NOT NULL DEFAULT '',
  isbn        text UNIQUE,
  cover_url   text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  categories  text[] NOT NULL DEFAULT '{}',
  status      text NOT NULL DEFAULT 'want' CHECK (status IN ('want', 'reading', 'read')),
  rating      smallint CHECK (rating IN (-1, 0, 1)),
  finished_at date,
  note        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
)
