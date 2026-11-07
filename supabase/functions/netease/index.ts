// Meow · 网易云音乐接口（Supabase Edge Function，名字叫 netease）
//
// 按「Cove 一起听歌」的思路做的音源适配层：
//   search   搜歌（cloudsearch）
//   url      取播放地址（song/enhance/player/url/v1）—— 带上你自己的网易云登录态，
//            会员能听的歌就能拿到完整音源；没登录只能拿到免费歌曲 / 试听片段
//   lyric    歌词
//   playlist 歌单详情（导入歌单）
//   my       我的账号 + 我的歌单（需要登录态）
//   qr_key / qr_check  扫码登录网易云（拿到的是你自己的登录态）
//
// 登录态：前端把用户自己的 MUSIC_U 放在请求头 x-ne-cookie 里传过来，本函数只转发给网易云，
// 不保存、不打印、不返回给别人。每个人只能用自己的账号。
// 不做任何「从别的平台抓音源 / 解锁」的事情：拿不到就是拿不到。
//
// 部署方法见 NETEASE-SETUP.md

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ne-cookie",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-ne-set-cookie",
};
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const json = (data: unknown, status = 200, cache = 0) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cache ? `public, max-age=${cache}` : "no-store",
    },
  });

/* ───── weapi 加密（网易云网页版用的请求格式） ───── */
const PRESET_KEY = "0CoJUm6Qyw8W8jud";
const IV = "0102030405060708";
const RSA_E = 0x10001n;
const RSA_N = BigInt(
  "0x00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7",
);
const enc = new TextEncoder();
const b64 = (u8: Uint8Array) => {
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s);
};
async function aesCbc(text: string, key: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "AES-CBC" }, false, ["encrypt"]);
  const out = await crypto.subtle.encrypt({ name: "AES-CBC", iv: enc.encode(IV) }, k, enc.encode(text));
  return b64(new Uint8Array(out));
}
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let r = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) r = (r * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return r;
}
function rsaNoPad(text: string): string {
  const rev = text.split("").reverse().join("");
  let hex = "";
  for (const ch of rev) hex += ch.charCodeAt(0).toString(16).padStart(2, "0");
  return modPow(BigInt("0x" + hex), RSA_E, RSA_N).toString(16).padStart(256, "0");
}
const B62 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export async function weapiBody(data: Record<string, unknown>): Promise<string> {
  const rnd = crypto.getRandomValues(new Uint8Array(16));
  const secKey = Array.from(rnd, (b) => B62[b % 62]).join("");
  const params = await aesCbc(await aesCbc(JSON.stringify(data), PRESET_KEY), secKey);
  return new URLSearchParams({ params, encSecKey: rsaNoPad(secKey) }).toString();
}

/* ───── 请求网易云 ───── */
function cleanCookie(raw: string | null): string {
  // 只接受 MUSIC_U / __csrf 这类键值，丢掉别的
  const s = String(raw || "").trim();
  if (!s) return "";
  if (!s.includes("=")) return `MUSIC_U=${s.replace(/[^\w.+/=%-]/g, "")}`;
  const keep: string[] = [];
  for (const part of s.split(/;\s*/)) {
    const [k, ...v] = part.split("=");
    const key = (k || "").trim();
    if (/^(MUSIC_U|__csrf|MUSIC_A|NMTID)$/.test(key) && v.length) keep.push(`${key}=${v.join("=").trim()}`);
  }
  return keep.join("; ");
}
function csrfOf(cookie: string): string {
  const m = cookie.match(/__csrf=([^;]+)/);
  return m ? m[1] : "";
}

type Ctx = { cookie: string; ip: string };

async function weapi(path: string, data: Record<string, unknown>, ctx: Ctx) {
  const csrf = csrfOf(ctx.cookie);
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Referer: "https://music.163.com/",
    Origin: "https://music.163.com",
    "Content-Type": "application/x-www-form-urlencoded",
    Cookie: ["os=pc", "appver=2.10.13", ctx.cookie].filter(Boolean).join("; "),
  };
  // 把用户自己的真实 IP 告诉网易云（函数服务器可能在海外，不然会按海外地区判断版权）
  if (ctx.ip) {
    headers["X-Real-IP"] = ctx.ip;
    headers["X-Forwarded-For"] = ctx.ip;
  }
  const res = await fetch(`https://music.163.com/weapi${path}?csrf_token=${csrf}`, {
    method: "POST",
    headers,
    body: await weapiBody({ ...data, csrf_token: csrf }),
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { code: res.status, raw: text.slice(0, 200) };
  }
  const setCookie = typeof (res.headers as any).getSetCookie === "function" ? (res.headers as any).getSetCookie() : [];
  return { body, setCookie: setCookie as string[] };
}

/* ───── 数据整理 ───── */
// deno-lint-ignore no-explicit-any
function mapSong(s: any) {
  const fee = Number(s?.fee ?? s?.privilege?.fee ?? 0);
  const st = Number(s?.privilege?.st ?? 0);
  return {
    id: s.id,
    title: s.name || "",
    artist: (s.ar || s.artists || []).map((a: { name?: string }) => a?.name).filter(Boolean).join(" / "),
    album: s.al?.name || s.album?.name || "",
    cover: (s.al?.picUrl || s.album?.picUrl) ? (s.al?.picUrl || s.album?.picUrl) + "?param=300y300" : "",
    dur: Math.round(Number(s.dt || s.duration || 0) / 1000),
    vip: fee === 1 || fee === 4, // 1 = VIP，4 = 付费专辑
    off: st < 0, // 下架
  };
}
const https = (u: string) => String(u || "").replace(/^http:\/\//, "https://");

const LEVELS: Record<string, string[]> = {
  high: ["lossless", "exhigh", "higher", "standard"],
  smooth: ["higher", "standard", "exhigh"],
};

/* ───── 入口 ───── */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const u = new URL(req.url);
  const q = (k: string) => (u.searchParams.get(k) || "").trim();
  const type = q("type") || "search";
  const fwd = req.headers.get("x-forwarded-for") || "";
  const ctx: Ctx = {
    cookie: cleanCookie(req.headers.get("x-ne-cookie")),
    ip: (fwd.split(",")[0] || req.headers.get("x-real-ip") || "").trim(),
  };
  try {
    if (type === "search") {
      const s = q("s").slice(0, 80);
      if (!s) return json({ songs: [] });
      const limit = Math.min(50, Math.max(1, Number(q("limit") || 30)));
      const offset = Math.max(0, Number(q("offset") || 0));
      const { body } = await weapi("/cloudsearch/get/web", { s, type: 1, limit, offset, total: true }, ctx);
      let songs = (body?.result?.songs || []).map(mapSong);
      if (!songs.length) {
        // 备用：公开搜索接口
        const r = await fetch(
          `https://music.163.com/api/cloudsearch/pc?type=1&s=${encodeURIComponent(s)}&limit=${limit}&offset=${offset}`,
          { headers: { "User-Agent": UA, Referer: "https://music.163.com/", Cookie: "os=pc" } },
        );
        const d = await r.json().catch(() => null);
        songs = (d?.result?.songs || []).map(mapSong);
      }
      return json({ songs, total: body?.result?.songCount || songs.length }, 200, ctx.cookie ? 0 : 300);
    }

    if (type === "url") {
      const id = q("id").replace(/\D/g, "");
      if (!id) return json({ error: "缺少歌曲 id" }, 400);
      const levels = LEVELS[q("quality")] || LEVELS.high;
      let last: any = null;
      for (const level of levels) {
        const { body } = await weapi("/song/enhance/player/url/v1", { ids: `[${id}]`, level, encodeType: "flac" }, ctx);
        const d = body?.data?.[0];
        last = d || body;
        if (d?.url) {
          return json({
            url: https(d.url),
            level: d.level || level,
            trial: !!d.freeTrialInfo, // 只有试听片段（没登录 / 不是会员）
            br: d.br || 0,
            size: d.size || 0,
            expire: d.expi || 1200,
          });
        }
      }
      return json({ url: "", reason: last?.code === 404 ? "下架或无版权" : "拿不到音源（可能需要会员或地区限制）" });
    }

    if (type === "lyric") {
      const id = q("id").replace(/\D/g, "");
      if (!id) return json({ lrc: "" });
      const r = await fetch(`https://music.163.com/api/song/lyric?id=${id}&lv=1&tv=-1`, {
        headers: { "User-Agent": UA, Referer: "https://music.163.com/", Cookie: "os=pc" },
      });
      const d = await r.json().catch(() => ({}));
      return json({ lrc: d?.lrc?.lyric || "", tlyric: d?.tlyric?.lyric || "" }, 200, 86400);
    }

    if (type === "playlist") {
      const id = q("id").replace(/\D/g, "");
      if (!id) return json({ error: "缺少歌单 id" }, 400);
      const { body } = await weapi("/v6/playlist/detail", { id, n: 100000, s: 8 }, ctx);
      const pl = body?.playlist;
      if (!pl) return json({ error: body?.message || "读不到这个歌单（私密歌单需要登录本人账号）" }, 404);
      let tracks = (pl.tracks || []).map(mapSong);
      const allIds: number[] = (pl.trackIds || []).map((t: { id: number }) => t.id);
      const have = new Set(tracks.map((t: { id: number }) => t.id));
      const missing = allIds.filter((x) => !have.has(x)).slice(0, 1000);
      for (let i = 0; i < missing.length; i += 400) {
        const chunk = missing.slice(i, i + 400);
        const { body: d } = await weapi("/v3/song/detail", { c: JSON.stringify(chunk.map((x) => ({ id: x }))) }, ctx);
        tracks = tracks.concat((d?.songs || []).map(mapSong));
      }
      return json({ name: pl.name || "", cover: pl.coverImgUrl ? https(pl.coverImgUrl) : "", count: allIds.length, tracks: tracks.filter((t: { off: boolean }) => !t.off) });
    }

    if (type === "my") {
      if (!ctx.cookie) return json({ login: false });
      const { body } = await weapi("/w/nuser/account/get", {}, ctx);
      const p = body?.profile;
      if (!p) return json({ login: false });
      const { body: pls } = await weapi("/user/playlist", { uid: p.userId, limit: 60, offset: 0, includeVideo: false }, ctx);
      return json({
        login: true,
        nickname: p.nickname || "",
        avatar: p.avatarUrl ? https(p.avatarUrl) : "",
        vip: Number(p.vipType || 0) > 0 || Number(body?.account?.vipType || 0) > 0,
        playlists: (pls?.playlist || []).map((x: any) => ({
          id: x.id,
          name: x.name,
          count: x.trackCount,
          cover: x.coverImgUrl ? https(x.coverImgUrl) + "?param=120y120" : "",
          mine: x.userId === p.userId,
        })),
      });
    }

    if (type === "qr_key") {
      const { body } = await weapi("/login/qrcode/unikey", { type: 1 }, ctx);
      if (!body?.unikey) return json({ error: "拿不到登录二维码，稍后再试" }, 502);
      return json({ key: body.unikey, qr: `https://music.163.com/login?codekey=${body.unikey}` });
    }

    if (type === "qr_check") {
      const key = q("key");
      if (!key) return json({ error: "缺少 key" }, 400);
      const { body, setCookie } = await weapi("/login/qrcode/client/login", { key, type: 1 }, ctx);
      const code = Number(body?.code || 0);
      // 800 过期 · 801 等待扫码 · 802 已扫码待确认 · 803 登录成功
      if (code === 803) {
        const pick = (name: string) => {
          for (const c of setCookie) {
            const m = c.match(new RegExp(`^${name}=([^;]+)`));
            if (m) return m[1];
          }
          return "";
        };
        const musicU = pick("MUSIC_U");
        const csrf = pick("__csrf");
        const cookie = [musicU && `MUSIC_U=${musicU}`, csrf && `__csrf=${csrf}`].filter(Boolean).join("; ");
        return json({ code, cookie });
      }
      return json({ code, nickname: body?.nickname || "", avatar: body?.avatarUrl ? https(body.avatarUrl) : "" });
    }

    return json({ ok: true, hello: "meowos-netease", v: 2 });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 502);
  }
});
