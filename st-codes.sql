-- ════════════════════════════════════════════════════════════
-- Meow OS ·「导入 SillyTavern 卡」专属激活码
-- 用法：Supabase 后台 → SQL Editor → 新建查询 → 粘贴全部 → Run
-- 可以重复运行，不会清掉已有的激活码
-- ════════════════════════════════════════════════════════════

-- 1. 激活码表（网页端读不到这张表，只能通过下面的兑换函数验证）
create table if not exists public.mx_codes (
  code       text primary key,
  max_uses   int  not null default 3,     -- 一个码最多能激活几台设备
  used       int  not null default 0,
  note       text default '',             -- 备注：发给谁了
  disabled   boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.mx_code_devices (
  code       text references public.mx_codes(code) on delete cascade,
  device     text not null,
  created_at timestamptz not null default now(),
  primary key (code, device)
);
alter table public.mx_codes enable row level security;
alter table public.mx_code_devices enable row level security;
revoke all on public.mx_codes, public.mx_code_devices from anon, authenticated;

-- 2. 兑换：同一台设备重复激活不重复计数
create or replace function public.mx_redeem_code(p_code text, p_device text) returns json
language plpgsql security definer set search_path = public as $$
declare c mx_codes; k text := upper(trim(coalesce(p_code, '')));
begin
  if length(k) < 4 or length(coalesce(p_device, '')) < 8 then
    return json_build_object('ok', false, 'msg', '激活码格式不对');
  end if;
  select * into c from mx_codes where code = k for update;
  if not found or c.disabled then
    return json_build_object('ok', false, 'msg', '激活码不存在或已停用');
  end if;
  if exists (select 1 from mx_code_devices where code = k and device = p_device) then
    return json_build_object('ok', true, 'msg', '这台设备已激活过');
  end if;
  if c.used >= c.max_uses then
    return json_build_object('ok', false, 'msg', '这个激活码的使用次数已经用完了');
  end if;
  insert into mx_code_devices (code, device) values (k, p_device);
  update mx_codes set used = used + 1 where code = k;
  return json_build_object('ok', true, 'msg', '激活成功');
end $$;
grant execute on function public.mx_redeem_code(text, text) to anon, authenticated;

-- 3. 生成激活码（只能在 SQL Editor 里用，网页端调用不了）
create or replace function public.mx_make_codes(n int default 5, uses int default 3, memo text default '')
returns table (code text)
language plpgsql security definer set search_path = public as $$
declare chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; k text; i int;
begin
  for i in 1..n loop
    loop
      k := 'MEOW-' ||
        (select string_agg(substr(chars, 1 + floor(random() * length(chars))::int, 1), '') from generate_series(1, 4)) || '-' ||
        (select string_agg(substr(chars, 1 + floor(random() * length(chars))::int, 1), '') from generate_series(1, 4));
      exit when not exists (select 1 from mx_codes where mx_codes.code = k);
    end loop;
    insert into mx_codes (code, max_uses, note) values (k, uses, memo);
    code := k;
    return next;
  end loop;
end $$;
revoke execute on function public.mx_make_codes(int, int, text) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- 常用操作（需要时单独复制一行运行）：
--
-- 生成 5 个码，每个码能激活 3 台设备：
--   select * from mx_make_codes(5, 3, '');
-- 生成 1 个码，备注发给谁：
--   select * from mx_make_codes(1, 3, '给小明');
-- 查看所有激活码和使用情况：
--   select code, used, max_uses, note, disabled from mx_codes order by created_at desc;
-- 停用某个码：
--   update mx_codes set disabled = true where code = 'MEOW-XXXX-XXXX';
-- ════════════════════════════════════════════════════════════
