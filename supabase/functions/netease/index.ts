// Meow OS · 网易云搜歌代理（Supabase Edge Function，名字叫 netease）
// 只做两件事：搜歌、取歌词。播放用网易云官方外链，免费歌曲能听完整版；
// VIP / 付费歌曲不破解，App 里会提示去网易云用自己的会员听。
// 部署方法见 NETEASE-SETUP.md

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const NE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Referer: "https://music.163.com/",
  Cookie: "os=pc; appver=2.10.13",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=600" },
  });

// deno-lint-ignore no-explicit-any
function mapSong(s: any) {
  const fee = Number(s?.fee ?? s?.privilege?.fee ?? 0);
  const st = Number(s?.privilege?.st ?? 0);
  return {
    id: s.id,
    title: s.name || "",
    artist: (s.ar || s.artists || []).map((a: { name?: string }) => a?.name).filter(Boolean).join(" / "),
    album: s.al?.name || s.album?.name || "",
    cover: s.al?.picUrl ? s.al.picUrl + "?param=300y300" : "",
    dur: Math.round(Number(s.dt || s.duration || 0) / 1000),
    // 1 = VIP，4 = 付费专辑；st < 0 = 下架
    vip: fee === 1 || fee === 4,
    off: st < 0,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const u = new URL(req.url);
  const type = u.searchParams.get("type") || "search";
  try {
    if (type === "search") {
      const s = (u.searchParams.get("s") || "").trim().slice(0, 80);
      if (!s) return json({ songs: [] });
      const limit = Math.min(50, Math.max(1, Number(u.searchParams.get("limit") || 30)));
      const offset = Math.max(0, Number(u.searchParams.get("offset") || 0));
      const api = `https://music.163.com/api/cloudsearch/pc?type=1&s=${encodeURIComponent(s)}&limit=${limit}&offset=${offset}`;
      const r = await fetch(api, { headers: NE_HEADERS });
      const d = await r.json();
      const songs = (d?.result?.songs || []).map(mapSong);
      return json({ songs, total: d?.result?.songCount || songs.length });
    }
    if (type === "lyric") {
      const id = String(u.searchParams.get("id") || "").replace(/\D/g, "");
      if (!id) return json({ lrc: "" });
      const r = await fetch(`https://music.163.com/api/song/lyric?id=${id}&lv=1&tv=-1`, { headers: NE_HEADERS });
      const d = await r.json();
      return json({ lrc: d?.lrc?.lyric || "", tlyric: d?.tlyric?.lyric || "" });
    }
    return json({ ok: true, hello: "meowos-netease" });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 502);
  }
});
