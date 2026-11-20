-- nextread Phase 1：books 表、RLS、updated_at trigger
-- embedding 欄位（pgvector）留到 Phase 3 決定 Voyage 模型與維度後再加。

create type public.book_status as enum ('want', 'reading', 'read');

create table public.books (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (length(btrim(title)) > 0),
  author      text not null default '',
  isbn        text,
  cover_url   text not null default '',
  description text not null default '',
  categories  text[] not null default '{}',
  status      public.book_status not null default 'want',
  rating      smallint check (rating in (-1, 0, 1)),
  finished_at date,
  note        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index books_user_id_idx on public.books (user_id);
-- 同一個使用者的 ISBN 不重複（ISBN 可空）
create unique index books_user_isbn_key on public.books (user_id, isbn) where isbn is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger books_set_updated_at
  before update on public.books
  for each row execute function public.set_updated_at();

alter table public.books enable row level security;

create policy "books_select_own" on public.books
  for select to authenticated using (user_id = (select auth.uid()));

create policy "books_insert_own" on public.books
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "books_update_own" on public.books
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "books_delete_own" on public.books
  for delete to authenticated using (user_id = (select auth.uid()));
