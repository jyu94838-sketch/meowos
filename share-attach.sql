-- Meow · 资源站「一个帖子带多张图片和文件」
-- 用法：Supabase 后台 → SQL Editor → New query → 整段粘贴 → Run（只需运行一次，可以重复运行）
-- 运行前请先运行过 supabase-setup.sql

-- 1. 附件列表：[{ "type": "image" | "card" | "file", "path": "look/xxx-a1.jpg", "name": "原文件名", "size": 1234 }]
alter table public.mx_shares add column if not exists extras jsonb not null default '[]'::jsonb;
alter table public.mx_shares drop constraint if exists mx_shares_extras_check;
alter table public.mx_shares add constraint mx_shares_extras_check
  check (jsonb_typeof(extras) = 'array' and jsonb_array_length(extras) <= 12);
grant select (extras) on public.mx_shares to anon, authenticated;

-- 附件路径也必须放在同一类型的文件夹下（和主卡片一样）
create or replace function public.mx_share_extras_ok(p_kind text, p_extras jsonb) returns boolean
language sql immutable as $$
  select not exists (
    select 1 from jsonb_array_elements(coalesce(p_extras, '[]'::jsonb)) e
     where coalesce(e->>'path', '') not like p_kind || '/%'
        or coalesce(e->>'type', '') not in ('image', 'card', 'file')
  );
$$;

drop policy if exists "mx insert" on public.mx_shares;
create policy "mx insert" on public.mx_shares
  for insert to anon, authenticated
  with check (downloads = 0 and likes = 0 and reports = 0 and file_path like kind || '/%'
              and (thumb_path = '' or thumb_path like kind || '/%')
              and public.mx_share_extras_ok(kind, extras));

-- 2. 存储桶：除了 PNG / JPG，再收 WebP / GIF 图片，和以「下载文件」方式保存的附件
--    （附件一律用 application/octet-stream 存，浏览器只会下载、不会直接打开运行）
update storage.buckets
   set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/octet-stream'],
       file_size_limit = 10485760
 where id = 'mx-shares';
