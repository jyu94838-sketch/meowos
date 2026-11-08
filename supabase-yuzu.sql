-- Meow · 柚子「女性健康社区」建表脚本
-- 用法：Supabase 控制台 → SQL Editor → New query → 整段粘贴 → Run（只需运行一次；重复运行也没关系）
-- 大家匿名分享经验、提问、评论。表开了 RLS 且没有策略：只能通过下面的函数读写。

create table if not exists public.mx_yz_posts (
  id          bigserial primary key,
  cat         text not null default '其他',
  title       text not null check (char_length(title) between 1 and 40),
  body        text not null check (char_length(body) between 1 and 2000),
  nick        text not null default '柚子用户' check (char_length(nick) <= 20),
  owner_hash  text not null,
  likes       integer not null default 0,
  comments    integer not null default 0,
  reports     integer not null default 0,
  created_at  timestamptz not null default now(),
  last_at     timestamptz not null default now()
);
create index if not exists mx_yz_posts_created_idx on public.mx_yz_posts (created_at desc);
create index if not exists mx_yz_posts_cat_idx on public.mx_yz_posts (cat, created_at desc);

create table if not exists public.mx_yz_comments (
  id          bigserial primary key,
  post_id     bigint not null references public.mx_yz_posts (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 500),
  nick        text not null default '柚子用户' check (char_length(nick) <= 20),
  owner_hash  text not null,
  likes       integer not null default 0,
  reports     integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists mx_yz_comments_post_idx on public.mx_yz_comments (post_id, id);

alter table public.mx_yz_posts enable row level security;
alter table public.mx_yz_comments enable row level security;
revoke all on public.mx_yz_posts, public.mx_yz_comments from anon, authenticated;

create or replace function public.mx_yz_h(p_token text)
returns text language sql immutable as $$
  select encode(sha256(convert_to('yz:' || coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

-- 帖子列表：p_sort = 'new' 最新 / 'hot' 热门 / 'mine' 我发的；p_q 搜索
create or replace function public.mx_yz_list(p_cat text, p_sort text, p_offset int, p_q text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h text := mx_yz_h(p_token);
begin
  return coalesce((
    select jsonb_agg(to_jsonb(x)) from (
      select id, cat, title, left(body, 140) as preview, nick, likes, comments, created_at, last_at, (owner_hash = h) as mine
      from mx_yz_posts
      where reports < 5
        and (coalesce(p_cat, '') in ('', '全部') or cat = p_cat)
        and (coalesce(p_q, '') = '' or title ilike '%' || p_q || '%' or body ilike '%' || p_q || '%')
        and (coalesce(p_sort, '') <> 'mine' or owner_hash = h)
      order by
        case when p_sort = 'hot' then likes * 2 + comments * 3 end desc nulls last,
        case when p_sort = 'hot' then last_at end desc,
        created_at desc
      limit 30 offset greatest(0, coalesce(p_offset, 0))
    ) x), '[]'::jsonb);
end $$;

-- 帖子详情 + 评论
create or replace function public.mx_yz_get(p_id bigint, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h text := mx_yz_h(p_token);
begin
  return jsonb_build_object(
    'post', (select to_jsonb(x) from (select id, cat, title, body, nick, likes, comments, created_at, (owner_hash = h) as mine from mx_yz_posts where id = p_id and reports < 5) x),
    'comments', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from (
      select id, body, nick, likes, created_at, (owner_hash = h) as mine from mx_yz_comments where post_id = p_id and reports < 5 order by id limit 300
    ) x), '[]'::jsonb)
  );
end $$;

-- 发帖
create or replace function public.mx_yz_post(p_token text, p_nick text, p_cat text, p_title text, p_body text)
returns bigint language plpgsql security definer set search_path = public as $$
declare h text := mx_yz_h(p_token); new_id bigint;
begin
  if length(coalesce(p_token, '')) < 16 then return -1; end if;
  if (select count(*) from mx_yz_posts where owner_hash = h and created_at > now() - interval '10 minutes') >= 5 then return -2; end if;
  insert into mx_yz_posts (cat, title, body, nick, owner_hash)
  values (left(coalesce(nullif(p_cat, ''), '其他'), 10), left(trim(p_title), 40), left(trim(p_body), 2000), left(coalesce(nullif(trim(p_nick), ''), '柚子用户'), 20), h)
  returning id into new_id;
  return new_id;
end $$;

-- 评论
create or replace function public.mx_yz_comment(p_token text, p_nick text, p_post bigint, p_body text)
returns bigint language plpgsql security definer set search_path = public as $$
declare h text := mx_yz_h(p_token); new_id bigint;
begin
  if length(coalesce(p_token, '')) < 16 then return -1; end if;
  if not exists (select 1 from mx_yz_posts where id = p_post and reports < 5) then return -3; end if;
  if (select count(*) from mx_yz_comments where owner_hash = h and created_at > now() - interval '10 minutes') >= 30 then return -2; end if;
  insert into mx_yz_comments (post_id, body, nick, owner_hash)
  values (p_post, left(trim(p_body), 500), left(coalesce(nullif(trim(p_nick), ''), '柚子用户'), 20), h)
  returning id into new_id;
  update mx_yz_posts set comments = comments + 1, last_at = now() where id = p_post;
  return new_id;
end $$;

-- 点赞（p_kind = 'post' / 'comment'；手机上记住点过的，不重复点）
create or replace function public.mx_yz_like(p_kind text, p_id bigint, p_delta int)
returns void language plpgsql security definer set search_path = public as $$
declare d int := case when p_delta < 0 then -1 else 1 end;
begin
  if p_kind = 'comment' then update mx_yz_comments set likes = greatest(0, likes + d) where id = p_id;
  else update mx_yz_posts set likes = greatest(0, likes + d) where id = p_id; end if;
end $$;

-- 举报（5 次自动隐藏）
create or replace function public.mx_yz_report(p_kind text, p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind = 'comment' then update mx_yz_comments set reports = reports + 1 where id = p_id;
  else update mx_yz_posts set reports = reports + 1 where id = p_id; end if;
end $$;

-- 删除自己发的
create or replace function public.mx_yz_delete(p_token text, p_kind text, p_id bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare h text := mx_yz_h(p_token); pid bigint;
begin
  if p_kind = 'comment' then
    delete from mx_yz_comments where id = p_id and owner_hash = h returning post_id into pid;
    if pid is null then return false; end if;
    update mx_yz_posts set comments = greatest(0, comments - 1) where id = pid;
    return true;
  end if;
  delete from mx_yz_posts where id = p_id and owner_hash = h returning id into pid;
  return pid is not null;
end $$;

grant execute on function public.mx_yz_list(text, text, int, text, text) to anon, authenticated;
grant execute on function public.mx_yz_get(bigint, text) to anon, authenticated;
grant execute on function public.mx_yz_post(text, text, text, text, text) to anon, authenticated;
grant execute on function public.mx_yz_comment(text, text, bigint, text) to anon, authenticated;
grant execute on function public.mx_yz_like(text, bigint, int) to anon, authenticated;
grant execute on function public.mx_yz_report(text, bigint) to anon, authenticated;
grant execute on function public.mx_yz_delete(text, text, bigint) to anon, authenticated;
