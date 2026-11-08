-- Meow · 资源站「评论区」：用资源站账号在帖子下面互相评论
-- 用法：Supabase 后台 → SQL Editor → New query → 整段粘贴 → Run（只需运行一次，可以重复运行）
-- 运行前请先运行过 share-account.sql（评论要用资源站账号）

create table if not exists public.mx_share_comments (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  share_id    uuid not null references public.mx_shares(id) on delete cascade,
  user_id     text not null references public.mx_share_users(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 500),
  reply_to    bigint,
  reports     integer not null default 0
);
create index if not exists mx_share_comments_share_idx on public.mx_share_comments (share_id, created_at);
create index if not exists mx_share_comments_user_idx on public.mx_share_comments (user_id, created_at desc);

alter table public.mx_share_comments enable row level security;
revoke all on public.mx_share_comments from anon, authenticated;
grant select (id, created_at, share_id, user_id, body, reply_to) on public.mx_share_comments to anon, authenticated;
-- 被举报 5 次以上的自动隐藏
drop policy if exists "sc read" on public.mx_share_comments;
create policy "sc read" on public.mx_share_comments for select to anon, authenticated using (reports < 5);

-- 发评论（要账号密钥；一分钟最多 8 条，防刷屏）
create or replace function public.mx_share_comment_add(p_share uuid, p_id text, p_secret text, p_body text, p_reply bigint)
returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare v_id bigint; n int;
begin
  if not mx_su_ok(p_id, p_secret) then raise exception 'not logged in'; end if;
  if not exists (select 1 from mx_shares where id = p_share) then raise exception 'no such share'; end if;
  select count(*) into n from mx_share_comments where user_id = p_id and created_at > now() - interval '1 minute';
  if n >= 8 then return -2; end if;
  insert into mx_share_comments (share_id, user_id, body, reply_to)
  values (p_share, p_id, left(btrim(p_body), 500),
          case when p_reply is not null and exists (select 1 from mx_share_comments where id = p_reply and share_id = p_share) then p_reply end)
  returning id into v_id;
  return v_id;
end $$;

-- 删评论：自己的评论，或者自己帖子下面的评论
create or replace function public.mx_share_comment_del(p_cid bigint, p_id text, p_secret text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  if not mx_su_ok(p_id, p_secret) then return false; end if;
  delete from mx_share_comments c
   where c.id = p_cid
     and (c.user_id = p_id or exists (select 1 from mx_shares s where s.id = c.share_id and s.owner_user = p_id));
  get diagnostics n = row_count;
  return n > 0;
end $$;

create or replace function public.mx_share_comment_report(p_cid bigint) returns void
language sql security definer set search_path = public as $$
  update mx_share_comments set reports = reports + 1 where id = p_cid;
$$;

grant execute on function public.mx_share_comment_add(uuid, text, text, text, bigint),
  public.mx_share_comment_del(bigint, text, text), public.mx_share_comment_report(bigint) to anon, authenticated;
