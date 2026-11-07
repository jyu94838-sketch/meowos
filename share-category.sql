-- Meow · 资源站「分类」
-- 用法：Supabase 后台 → SQL Editor → New query → 整段粘贴 → Run（只需运行一次，可以重复运行）
alter table public.mx_shares add column if not exists category text not null default '';
alter table public.mx_shares drop constraint if exists mx_shares_category_check;
alter table public.mx_shares add constraint mx_shares_category_check check (char_length(category) <= 20);
create index if not exists mx_shares_category_idx on public.mx_shares (category);
grant select (category) on public.mx_shares to anon, authenticated;
