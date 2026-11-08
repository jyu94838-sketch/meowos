-- Meow · 联机（好友 / 私聊 / 群聊）建表脚本
-- 用法：Supabase 控制台 → SQL Editor → New query → 整段粘贴 → Run（只需运行一次；重复运行也没关系）
-- 消息存在你自己的 Supabase 里，对方不在线也能收到，上线后自动拉取。
-- 表都开了 RLS 且没有任何策略：网页上的 anon key 不能直接读写表，只能通过下面这些带「身份校验」的函数。

-- 1. 用户（Meow 号 + 设备密钥的哈希）
create table if not exists public.mx_net_users (
  mid         text primary key,
  secret_hash text not null,
  name        text not null default '',
  av          text not null default '',
  last_seen   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

-- 2. 通知（好友申请、同意、拉群……）
create table if not exists public.mx_net_inbox (
  id         bigserial primary key,
  to_mid     text not null,
  from_mid   text not null,
  kind       text not null,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists mx_net_inbox_to_idx on public.mx_net_inbox (to_mid, id);

-- 3. 会话成员（私聊也是一个两个人的会话）
create table if not exists public.mx_net_members (
  gid       text not null,
  mid       text not null,
  joined_at timestamptz not null default now(),
  primary key (gid, mid)
);
create index if not exists mx_net_members_mid_idx on public.mx_net_members (mid);

-- 4. 消息
create table if not exists public.mx_net_msgs (
  id         bigserial primary key,
  gid        text not null,
  from_mid   text not null,
  body       jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists mx_net_msgs_gid_idx on public.mx_net_msgs (gid, id);

alter table public.mx_net_users   enable row level security;
alter table public.mx_net_inbox   enable row level security;
alter table public.mx_net_members enable row level security;
alter table public.mx_net_msgs    enable row level security;

-- 身份校验
create or replace function public.mx_net_auth(p_mid text, p_secret text)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from mx_net_users
    where mid = p_mid and secret_hash = encode(sha256(convert_to(coalesce(p_secret, ''), 'UTF8')), 'hex')
  );
$$;

-- 注册 / 更新资料：第一次用这个 Meow 号的设备拿到它
create or replace function public.mx_net_register(p_mid text, p_secret text, p_name text, p_av text)
returns text language plpgsql security definer set search_path = public as $$
declare
  h text := encode(sha256(convert_to(coalesce(p_secret, ''), 'UTF8')), 'hex');
  r record;
begin
  if p_mid !~ '^[A-Z0-9]{8}$' or length(coalesce(p_secret, '')) < 16 then return 'bad'; end if;
  select * into r from mx_net_users where mid = p_mid;
  if not found then
    insert into mx_net_users (mid, secret_hash, name, av) values (p_mid, h, left(coalesce(p_name, ''), 24), left(coalesce(p_av, ''), 20000));
    return 'new';
  end if;
  if r.secret_hash <> h then return 'taken'; end if;
  update mx_net_users set name = left(coalesce(p_name, ''), 24), av = left(coalesce(p_av, ''), 20000), last_seen = now() where mid = p_mid;
  return 'ok';
end $$;

-- 发通知给某个 Meow 号
create or replace function public.mx_net_notify(p_mid text, p_secret text, p_to text, p_kind text, p_data jsonb)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not mx_net_auth(p_mid, p_secret) then return 'auth'; end if;
  if not exists (select 1 from mx_net_users where mid = p_to) then return 'nouser'; end if;
  if (select count(*) from mx_net_inbox where from_mid = p_mid and created_at > now() - interval '1 minute') > 40 then return 'slow'; end if;
  if length(coalesce(p_data, '{}'::jsonb)::text) > 20000 then return 'big'; end if;
  insert into mx_net_inbox (to_mid, from_mid, kind, data) values (p_to, p_mid, left(p_kind, 20), coalesce(p_data, '{}'::jsonb));
  return 'ok';
end $$;

-- 拉取：新通知 + 我所在会话的新消息 + 谁在线
create or replace function public.mx_net_pull(p_mid text, p_secret text, p_inbox bigint, p_msg bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not mx_net_auth(p_mid, p_secret) then return jsonb_build_object('error', 'auth'); end if;
  update mx_net_users set last_seen = now() where mid = p_mid;
  return jsonb_build_object(
    'inbox', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.id) from (
        select i.id, i.from_mid, i.kind, i.data, i.created_at, u.name as from_name, u.av as from_av
        from mx_net_inbox i left join mx_net_users u on u.mid = i.from_mid
        where i.to_mid = p_mid and i.id > coalesce(p_inbox, 0)
        order by i.id limit 100
      ) x), '[]'::jsonb),
    'msgs', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.id) from (
        select m.id, m.gid, m.from_mid, m.body, m.created_at
        from mx_net_msgs m join mx_net_members mm on mm.gid = m.gid and mm.mid = p_mid
        where m.id > coalesce(p_msg, 0)
        order by m.id limit 300
      ) x), '[]'::jsonb),
    'online', coalesce((
      select jsonb_agg(distinct u.mid)
      from mx_net_members a join mx_net_members b on a.gid = b.gid join mx_net_users u on u.mid = b.mid
      where a.mid = p_mid and u.last_seen > now() - interval '45 seconds'
    ), '[]'::jsonb),
    'now', now()
  );
end $$;

-- 加入会话（私聊只能是会话号里那两个人），返回最近的聊天记录
create or replace function public.mx_net_join(p_mid text, p_secret text, p_gid text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not mx_net_auth(p_mid, p_secret) then return jsonb_build_object('error', 'auth'); end if;
  if p_gid !~ '^[a-z0-9_]{6,40}$' then return jsonb_build_object('error', 'bad'); end if;
  if left(p_gid, 1) = 'd' and position(lower(p_mid) in p_gid) = 0 then return jsonb_build_object('error', 'dm'); end if;
  insert into mx_net_members (gid, mid) values (p_gid, p_mid) on conflict do nothing;
  return jsonb_build_object('msgs', coalesce((
    select jsonb_agg(to_jsonb(x) order by x.id) from (
      select id, gid, from_mid, body, created_at from mx_net_msgs where gid = p_gid order by id desc limit 200
    ) x), '[]'::jsonb));
end $$;

-- 退出会话
create or replace function public.mx_net_leave(p_mid text, p_secret text, p_gid text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not mx_net_auth(p_mid, p_secret) then return 'auth'; end if;
  delete from mx_net_members where gid = p_gid and mid = p_mid;
  return 'ok';
end $$;

-- 发消息（必须是会话成员）
create or replace function public.mx_net_post(p_mid text, p_secret text, p_gid text, p_body jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare new_id bigint;
begin
  if not mx_net_auth(p_mid, p_secret) then return -1; end if;
  if not exists (select 1 from mx_net_members where gid = p_gid and mid = p_mid) then return -2; end if;
  if length(p_body::text) > 30000 then return -3; end if;
  if (select count(*) from mx_net_msgs where from_mid = p_mid and created_at > now() - interval '1 minute') > 120 then return -4; end if;
  insert into mx_net_msgs (gid, from_mid, body) values (p_gid, p_mid, p_body) returning id into new_id;
  -- 偶尔顺手清掉 30 天前的旧记录
  if random() < 0.02 then
    delete from mx_net_msgs where created_at < now() - interval '30 days';
    delete from mx_net_inbox where created_at < now() - interval '30 days';
  end if;
  return new_id;
end $$;

-- 查资料（名字、头像、最后在线）
create or replace function public.mx_net_profiles(p_mids text[])
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('mid', mid, 'name', name, 'av', av, 'last_seen', last_seen)), '[]'::jsonb)
  from mx_net_users where mid = any(p_mids[1:50]);
$$;

revoke all on public.mx_net_users, public.mx_net_inbox, public.mx_net_members, public.mx_net_msgs from anon, authenticated;
grant execute on function public.mx_net_register(text, text, text, text) to anon, authenticated;
grant execute on function public.mx_net_notify(text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.mx_net_pull(text, text, bigint, bigint) to anon, authenticated;
grant execute on function public.mx_net_join(text, text, text) to anon, authenticated;
grant execute on function public.mx_net_leave(text, text, text) to anon, authenticated;
grant execute on function public.mx_net_post(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.mx_net_profiles(text[]) to anon, authenticated;
revoke execute on function public.mx_net_auth(text, text) from anon, authenticated, public;
