-- Meow · 资源站「个人账号」：昵称、头像、上传跟着账号走、上传后可以反复编辑
-- 用法：Supabase 后台 → SQL Editor → New query → 整段粘贴 → Run（只需运行一次，可以重复运行）
-- 运行前请先运行过 supabase-setup.sql（share-attach.sql 运不运行都行，这里会把附件字段一起补上）
--
-- 账号不用邮箱密码：创建账号时手机里随机生成一串「密钥」，数据库只存它的 sha256。
-- 换手机时用「账号 ID + 密钥」（App 里叫「登录码」）登录，或者直接用 Meow 的备份恢复。

create extension if not exists pgcrypto with schema extensions;

-- 1. 账号表
create table if not exists public.mx_share_users (
  id          text primary key,
  created_at  timestamptz not null default now(),
  nick        text not null check (char_length(nick) between 1 and 20),
  avatar_path text not null default '' check (avatar_path = '' or avatar_path like 'avatar/%'),
  bio         text not null default '' check (char_length(bio) <= 80),
  secret_hash text not null
);
alter table public.mx_share_users enable row level security;
revoke all on public.mx_share_users from anon, authenticated;
grant select (id, created_at, nick, avatar_path, bio) on public.mx_share_users to anon, authenticated;
drop policy if exists "su read" on public.mx_share_users;
create policy "su read" on public.mx_share_users for select to anon, authenticated using (true);

-- 2. 资源表加字段：属于哪个账号、最后编辑时间、附件
alter table public.mx_shares add column if not exists owner_user text not null default '';
alter table public.mx_shares add column if not exists updated_at timestamptz;
alter table public.mx_shares add column if not exists extras jsonb not null default '[]'::jsonb;
alter table public.mx_shares drop constraint if exists mx_shares_extras_check;
alter table public.mx_shares add constraint mx_shares_extras_check
  check (jsonb_typeof(extras) = 'array' and jsonb_array_length(extras) <= 12);
create index if not exists mx_shares_owner_idx on public.mx_shares (owner_user);
grant select (owner_user, updated_at, extras) on public.mx_shares to anon, authenticated;

create or replace function public.mx_share_extras_ok(p_kind text, p_extras jsonb) returns boolean
language sql immutable as $$
  select not exists (
    select 1 from jsonb_array_elements(coalesce(p_extras, '[]'::jsonb)) e
     where coalesce(e->>'path', '') not like p_kind || '/%'
        or coalesce(e->>'type', '') not in ('image', 'card', 'file')
  );
$$;

-- 上传时 owner_user 必须是空的（不能冒充别人），上传完再用密钥「认领」到自己账号下
drop policy if exists "mx insert" on public.mx_shares;
create policy "mx insert" on public.mx_shares
  for insert to anon, authenticated
  with check (downloads = 0 and likes = 0 and reports = 0 and owner_user = ''
              and file_path like kind || '/%'
              and (thumb_path = '' or thumb_path like kind || '/%')
              and public.mx_share_extras_ok(kind, extras));

-- 3. 账号函数
create or replace function public.mx_su_ok(p_id text, p_secret text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from mx_share_users
                  where id = p_id and secret_hash = encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex'));
$$;

create or replace function public.mx_su_register(p_secret text, p_nick text, p_avatar text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_id text; n int := 0;
begin
  if char_length(coalesce(p_secret, '')) < 24 then raise exception 'secret too short'; end if;
  loop
    v_id := upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 8));
    exit when not exists (select 1 from mx_share_users where id = v_id);
    n := n + 1;
    if n > 20 then raise exception 'id busy'; end if;
  end loop;
  insert into mx_share_users (id, nick, avatar_path, secret_hash)
  values (v_id, left(btrim(coalesce(p_nick, '')), 20),
          case when coalesce(p_avatar, '') like 'avatar/%' then p_avatar else '' end,
          encode(extensions.digest(p_secret, 'sha256'), 'hex'));
  return v_id;
end $$;

create or replace function public.mx_su_login(p_id text, p_secret text) returns json
language sql stable security definer set search_path = public, extensions as $$
  select json_build_object('id', id, 'nick', nick, 'avatar_path', avatar_path, 'bio', bio)
    from mx_share_users
   where id = upper(btrim(p_id)) and secret_hash = encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex');
$$;

create or replace function public.mx_su_update(p_id text, p_secret text, p_nick text, p_avatar text, p_bio text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not mx_su_ok(p_id, p_secret) then return false; end if;
  update mx_share_users
     set nick = left(btrim(coalesce(nullif(btrim(p_nick), ''), nick)), 20),
         avatar_path = case when p_avatar is null then avatar_path
                            when p_avatar = '' or p_avatar like 'avatar/%' then p_avatar
                            else avatar_path end,
         bio = left(coalesce(p_bio, bio), 80)
   where id = p_id;
  -- 改了昵称，自己发过的帖子署名也跟着改
  update mx_shares set author = (select nick from mx_share_users where id = p_id) where owner_user = p_id;
  return true;
end $$;

-- 把（用上传凭证证明是自己传的）帖子认领到账号下
create or replace function public.mx_share_claim(p_share uuid, p_token text, p_id text, p_secret text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  if not mx_su_ok(p_id, p_secret) then return false; end if;
  update mx_shares
     set owner_user = p_id, author = (select nick from mx_share_users where id = p_id)
   where id = p_share and owner_user = ''
     and owner_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- 编辑自己的帖子：标题、简介、分类、附件，也可以换主卡片
create or replace function public.mx_share_edit(p_share uuid, p_id text, p_secret text, p_title text, p_desc text,
  p_category text, p_extras jsonb, p_file_path text, p_thumb_path text, p_size integer) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare r mx_shares; n int;
begin
  if not mx_su_ok(p_id, p_secret) then return false; end if;
  select * into r from mx_shares where id = p_share and owner_user = p_id;
  if not found then return false; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 60 then raise exception 'bad title'; end if;
  if p_extras is not null and not (jsonb_typeof(p_extras) = 'array' and jsonb_array_length(p_extras) <= 12
                                   and mx_share_extras_ok(r.kind, p_extras)) then raise exception 'bad extras'; end if;
  if coalesce(p_file_path, '') <> '' and p_file_path not like r.kind || '/%' then raise exception 'bad file'; end if;
  if coalesce(p_thumb_path, '') <> '' and p_thumb_path not like r.kind || '/%' then raise exception 'bad thumb'; end if;
  update mx_shares
     set title = btrim(p_title),
         description = left(coalesce(p_desc, ''), 300),
         category = left(coalesce(p_category, category), 20),
         extras = coalesce(p_extras, extras),
         file_path = coalesce(nullif(p_file_path, ''), file_path),
         thumb_path = coalesce(nullif(p_thumb_path, ''), thumb_path),
         size = case when coalesce(p_file_path, '') <> '' then least(coalesce(p_size, size), 10485760) else size end,
         updated_at = now()
   where id = p_share;
  get diagnostics n = row_count;
  return n > 0;
end $$;

create or replace function public.mx_share_delete_user(p_share uuid, p_id text, p_secret text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  if not mx_su_ok(p_id, p_secret) then return false; end if;
  delete from mx_shares where id = p_share and owner_user = p_id;
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke execute on function public.mx_su_ok(text, text) from public, anon, authenticated;
grant execute on function public.mx_su_register(text, text, text), public.mx_su_login(text, text),
  public.mx_su_update(text, text, text, text, text), public.mx_share_claim(uuid, text, text, text),
  public.mx_share_edit(uuid, text, text, text, text, text, jsonb, text, text, integer),
  public.mx_share_delete_user(uuid, text, text) to anon, authenticated;

-- 4. 存储：头像放在 avatar/ 文件夹；附件允许的类型和 share-attach.sql 一样
update storage.buckets
   set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/octet-stream'],
       file_size_limit = 10485760
 where id = 'mx-shares';

drop policy if exists "mx upload" on storage.objects;
create policy "mx upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'mx-shares' and (storage.foldername(name))[1] in ('look', 'worldbook', 'char', 'preset', 'font', 'avatar'));
