-- 没心机 · 资源站（共享广场）建表脚本
-- 用法：Supabase 控制台 → SQL Editor → New query → 整段粘贴 → Run（只需运行一次）

-- 1. 资源表
create table if not exists public.mx_shares (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  kind        text not null check (kind in ('look', 'worldbook', 'char')),
  title       text not null check (char_length(title) between 1 and 60),
  description text not null default '' check (char_length(description) <= 300),
  author      text not null default '匿名' check (char_length(author) <= 30),
  file_path   text not null,
  thumb_path  text not null default '',
  size        integer not null default 0 check (size <= 10485760),
  downloads   integer not null default 0,
  likes       integer not null default 0,
  reports     integer not null default 0,
  owner_hash  text not null
);
alter table public.mx_shares add column if not exists thumb_path text not null default '';
create index if not exists mx_shares_created_idx on public.mx_shares (created_at desc);

alter table public.mx_shares enable row level security;

-- 任何人可以看（被举报 5 次以上的自动隐藏）
drop policy if exists "mx read" on public.mx_shares;
create policy "mx read" on public.mx_shares
  for select to anon, authenticated using (reports < 5);

-- 任何人可以上传，但不能伪造计数
drop policy if exists "mx insert" on public.mx_shares;
create policy "mx insert" on public.mx_shares
  for insert to anon, authenticated
  with check (downloads = 0 and likes = 0 and reports = 0 and file_path like kind || '/%'
              and (thumb_path = '' or thumb_path like kind || '/%'));

-- 不允许直接改 / 删（只能通过下面的函数）
revoke update, delete on public.mx_shares from anon, authenticated;
-- 不把上传者的删除凭证哈希暴露给别人
revoke select on public.mx_shares from anon, authenticated;
grant select (id, created_at, kind, title, description, author, file_path, thumb_path, size, downloads, likes, reports)
  on public.mx_shares to anon, authenticated;

-- 2. 计数 / 举报 / 删除函数
create or replace function public.mx_share_download(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update mx_shares set downloads = downloads + 1 where id = p_id;
$$;

create or replace function public.mx_share_like(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update mx_shares set likes = likes + 1 where id = p_id;
$$;

create or replace function public.mx_share_report(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update mx_shares set reports = reports + 1 where id = p_id;
$$;

-- 上传时浏览器生成一个随机凭证，只把它的 sha256 存进库；凭证在上传者本机，用来删除
create or replace function public.mx_share_delete(p_id uuid, p_token text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  delete from mx_shares
   where id = p_id and owner_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  get diagnostics n = row_count;
  return n > 0;
end $$;

grant execute on function public.mx_share_download(uuid), public.mx_share_like(uuid),
  public.mx_share_report(uuid), public.mx_share_delete(uuid, text) to anon, authenticated;

-- 3. 文件存储桶（公开读，只收 PNG 卡片和 JPG 缩略图，单个最大 10MB）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mx-shares', 'mx-shares', true, 10485760, array['image/png', 'image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 10485760, allowed_mime_types = array['image/png', 'image/jpeg'];

drop policy if exists "mx upload" on storage.objects;
create policy "mx upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'mx-shares' and (storage.foldername(name))[1] in ('look', 'worldbook', 'char'));
