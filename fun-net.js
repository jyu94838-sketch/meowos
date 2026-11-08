"use strict";

/**
 * 联机 · Meow 用户之间加好友、私聊、建群聊，带上自己的角色一起聊天、一起玩游戏
 * - 每个人有一个 8 位「Meow 号」，输入对方的 Meow 号就能加好友
 * - 消息和好友申请都存在站长的 Supabase 里（需要先运行一次 supabase-net.sql）：
 *   对方不在线也能收到，打开 Meow 就自动拉取；不用 AI 接口，就是一个内部聊天室
 * - 只走普通 HTTPS（不用 WebSocket），手机流量 / 各种网络都更容易连上
 * - 角色接话才会用到主人自己的 AI；小游戏的状态也走同一条消息通道
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast } = F;

  /* ───── 本地存储 ───── */
  const STORE_KEY = "meowos_net_v2";
  const MUTE_KEY = "meowos_net_mute";
  const CODE_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
  const newMid = () => Array.from({ length: 8 }, () => CODE_ABC[Math.floor(Math.random() * CODE_ABC.length)]).join("");
  const newSecret = () => {
    const a = new Uint8Array(24);
    (window.crypto || {}).getRandomValues?.(a);
    return [...a].map((b) => (b || Math.floor(Math.random() * 256)).toString(16).padStart(2, "0")).join("");
  };
  const MAX_MSGS = 300;

  let S;
  try {
    S = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
  } catch (_) {
    S = null;
  }
  if (!S || typeof S !== "object" || !S.mid) S = { mid: newMid() };
  normStore();
  function normStore() {
  S.friends ||= {};
  S.reqIn ||= [];
  S.reqOut ||= {};
  S.convs ||= {};
  S.outbox ||= [];
  S.cur ||= { inbox: 0, msg: 0 };
  if (!S.secret) S.secret = newSecret();
  // 旧版（实时频道）留下的待发通知，换成新格式
  S.outbox = S.outbox
    .map((x) => (x && x.type ? x : x && x.to ? { id: x.id || rid(), type: "notify", to: x.to, kind: x.ev, data: x.data || {} } : null))
    .filter(Boolean);
  for (const c of Object.values(S.convs)) {
    c.memberChars ||= {};
    c.members ||= {};
    c.msgs ||= [];
    if (!c.joined) c.needJoin = true;
  }
  }
  /** 从备份恢复后：把 localStorage 里的联机数据重新读进来（保持同一个 S 对象） */
  function reloadFromStorage() {
    let d = null;
    try {
      d = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    } catch (_) {
      d = null;
    }
    if (!d || typeof d !== "object" || !d.mid) return false;
    for (const k of Object.keys(S)) delete S[k];
    Object.assign(S, d);
    normStore();
    try {
      tick();
    } catch (_) {
      /* ignore */
    }
    return true;
  }
  let saveT = 0;
  function save(now) {
    clearTimeout(saveT);
    const run = () => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(S));
      } catch (_) {
        for (const c of Object.values(S.convs)) c.msgs = c.msgs.slice(-120);
        try {
          localStorage.setItem(STORE_KEY, JSON.stringify(S));
        } catch (_) {
          /* ignore */
        }
      }
    };
    if (now) run();
    else saveT = setTimeout(run, 400);
  }
  save(true);

  const muted = new Set(
    (() => {
      try {
        return JSON.parse(localStorage.getItem(MUTE_KEY) || "[]");
      } catch (_) {
        return [];
      }
    })()
  );
  const saveMute = () => localStorage.setItem(MUTE_KEY, JSON.stringify([...muted]));

  function thumb(src) {
    return new Promise((ok) => {
      if (!src) return ok("");
      if (/^data:image\/jpeg/.test(src) && src.length < 9000) return ok(src);
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = c.height = 64;
          const s = Math.min(im.width, im.height);
          c.getContext("2d").drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 64, 64);
          ok(c.toDataURL("image/jpeg", 0.7));
        } catch (_) {
          ok("");
        }
      };
      im.onerror = () => ok("");
      im.src = src;
    });
  }

  /* ───── 服务器（Supabase RPC，普通 HTTPS） ───── */
  const cfg = () => {
    const c = window.MX_SHARE_CONFIG || {};
    return c.url && c.anonKey ? { url: String(c.url).replace(/\/+$/, ""), key: c.anonKey } : null;
  };
  async function rpc(fn, args) {
    const c = cfg();
    if (!c) {
      const e = new Error("nocfg");
      e.kind = "nocfg";
      throw e;
    }
    const ctl = new AbortController();
    const tm = setTimeout(() => ctl.abort(), 15000);
    try {
      let res;
      try {
        res = await fetch(c.url + "/rest/v1/rpc/" + fn, {
          method: "POST",
          headers: { apikey: c.key, ...(/^eyJ/.test(c.key) ? { Authorization: "Bearer " + c.key } : {}), "Content-Type": "application/json" },
          body: JSON.stringify(args || {}),
          signal: ctl.signal
        });
      } catch (err) {
        const e = new Error("网络连不上服务器");
        e.kind = "offline";
        throw e;
      }
      const t = await res.text();
      let d = null;
      try {
        d = t ? JSON.parse(t) : null;
      } catch (_) {
        d = t;
      }
      if (!res.ok) {
        const e = new Error((d && (d.message || d.hint)) || "HTTP " + res.status);
        e.kind = res.status === 404 || (d && d.code === "PGRST202") ? "nosql" : "server";
        throw e;
      }
      return d;
    } finally {
      clearTimeout(tm);
    }
  }
  const auth = () => ({ p_mid: S.mid, p_secret: S.secret });
  const Net = { status: "", online: new Set(), lastErr: "", regSig: "" };
  const me = () => ({ mid: S.mid, name: S.nick || "Meow 用户", av: S.av || "" });

  async function ensureReg() {
    const sig = me().name + "|" + (S.av || "").length;
    if (S.regOk && Net.regSig === sig) return;
    for (let i = 0; i < 3; i++) {
      const r = await rpc("mx_net_register", { ...auth(), p_name: me().name, p_av: S.av || "" });
      if (r === "new" || r === "ok") {
        S.regOk = true;
        Net.regSig = sig;
        save();
        return;
      }
      if (r === "taken") {
        // 这个号被别的设备占了（极少见）：换一个
        S.mid = newMid();
        S.regOk = false;
        continue;
      }
      throw Object.assign(new Error("注册失败：" + r), { kind: "server" });
    }
  }

  /* ───── 待发队列（网络不好时先存着，下次再发） ───── */
  function queue(item) {
    S.outbox.push({ id: rid(), ...item });
    save();
    void tick(true);
  }
  async function flushOut() {
    const later = [];
    while (S.outbox.length) {
      const it = S.outbox[0];
      // 对方还没打开过新版联机：先放一边，过一会儿再试（最多等 7 天）
      if (it.retryAt && it.retryAt > Date.now()) {
        later.push(S.outbox.shift());
        continue;
      }
      try {
        if (it.type === "notify") {
          const r = await rpc("mx_net_notify", { ...auth(), p_to: it.to, p_kind: it.kind, p_data: it.data || {} });
          if (r === "nouser") {
            it.firstTry ||= Date.now();
            if (Date.now() - it.firstTry < 7 * 24 * 3600 * 1000) {
              it.retryAt = Date.now() + 45 * 1000;
              it.waiting = true;
              later.push(S.outbox.shift());
              save();
              continue;
            }
            if (it.kind === "freq") {
              delete S.reqOut[it.to];
              toast(`Meow 号 ${it.to} 一直没有上线，好友申请已取消`);
            }
          } else if (r === "auth") {
            S.regOk = false;
            throw Object.assign(new Error("auth"), { kind: "auth" });
          } else if (r === "slow") throw Object.assign(new Error("发得太快了"), { kind: "server" });
        } else if (it.type === "join") {
          const r = await rpc("mx_net_join", { ...auth(), p_gid: it.gid });
          if (r && r.error === "auth") {
            S.regOk = false;
            throw Object.assign(new Error("auth"), { kind: "auth" });
          }
          const c = S.convs[it.gid];
          if (c && r && !r.error) {
            c.joined = true;
            c.needJoin = false;
            for (const row of r.msgs || []) handleRow(row, false);
            // 告诉大家我带着哪个角色（新设备 / 重新进会话时）
            if (c.char) S.outbox.push({ id: rid(), type: "post", gid: c.gid, body: { t: "char", char: c.char } });
            // 旧版（点对点）时自己发的消息没存到服务器：第一次进会话时补传，对方之前没收到的也能收到
            if (!c.legacyUp) {
              c.legacyUp = true;
              const onServer = new Set((r.msgs || []).map((x) => x.body?.m?.id).filter(Boolean));
              for (const m of c.msgs) {
                if (m.local || onServer.has(m.id) || m.pending) continue;
                if (m.from?.mid !== S.mid && !(m.sys && !m.from)) continue;
                if (m.sys && !/创建了群聊|邀请了|带进|改成了/.test(m.text || "")) continue;
                const { pending, ...clean } = m;
                if (clean.from) clean.from = { mid: clean.from.mid, name: clean.from.name, isChar: clean.from.isChar, owner: clean.from.owner };
                S.outbox.push({ id: rid(), type: "post", gid: c.gid, body: { t: "msg", m: clean, old: true } });
              }
            }
          }
        } else if (it.type === "leave") {
          await rpc("mx_net_leave", { ...auth(), p_gid: it.gid });
        } else if (it.type === "post") {
          const c = S.convs[it.gid];
          if (c && !c.joined) {
            // 先进会话再发
            const r = await rpc("mx_net_join", { ...auth(), p_gid: it.gid });
            if (r && !r.error) {
              c.joined = true;
              c.needJoin = false;
            }
          }
          const id = await rpc("mx_net_post", { ...auth(), p_gid: it.gid, p_body: it.body });
          if (id === -1) {
            S.regOk = false;
            throw Object.assign(new Error("auth"), { kind: "auth" });
          }
          if (id === -4) throw Object.assign(new Error("发得太快了"), { kind: "server" });
          if (id > 0 && it.body?.m?.id && c) {
            const m = c.msgs.find((x) => x.id === it.body.m.id);
            if (m) delete m.pending;
          }
        }
        S.outbox.shift();
        save();
      } catch (e) {
        S.outbox.push(...later);
        later.length = 0;
        if (e.kind === "auth") {
          await ensureReg().catch(() => {});
        }
        throw e;
      }
    }
    S.outbox.push(...later);
  }

  /* ───── 拉取循环 ───── */
  let pulling = false;
  let timer = 0;
  let started = false;
  let lastProfiles = 0;
  const needProfiles = new Set();
  async function tick(soon) {
    if (soon) {
      clearTimeout(timer);
      timer = setTimeout(() => void tick(), 60);
      return;
    }
    if (pulling) return;
    pulling = true;
    try {
      await ensureReg();
      for (const c of Object.values(S.convs)) if (c.needJoin && !S.outbox.some((x) => x.type === "join" && x.gid === c.gid)) S.outbox.push({ id: rid(), type: "join", gid: c.gid });
      await flushOut();
      const r = await rpc("mx_net_pull", { ...auth(), p_inbox: S.cur.inbox || 0, p_msg: S.cur.msg || 0 });
      if (r && r.error === "auth") {
        S.regOk = false;
        throw Object.assign(new Error("auth"), { kind: "auth" });
      }
      const now = Date.parse(r?.now) || Date.now();
      for (const it of r?.inbox || []) {
        S.cur.inbox = Math.max(S.cur.inbox || 0, it.id);
        handleItem({ mid: it.from_mid, name: it.from_name || "Meow 用户", av: it.from_av || "" }, it.kind, it.data || {});
      }
      for (const row of r?.msgs || []) {
        S.cur.msg = Math.max(S.cur.msg || 0, row.id);
        const fresh = !row.body?.old && now - (Date.parse(row.created_at) || 0) < 90 * 1000;
        handleRow(row, fresh);
      }
      Net.online = new Set(r?.online || []);
      Net.status = "ok";
      Net.lastErr = "";
      const changed = (r?.inbox || []).length || (r?.msgs || []).length;
      if (needProfiles.size || Date.now() - lastProfiles > 10 * 60 * 1000) await loadProfiles();
      // 没收到新东西就不写本地存储（大段 JSON 写入在手机上会卡一下）
      if (changed) save();
    } catch (e) {
      Net.status = e.kind || "offline";
      Net.lastErr = e.message || String(e);
    } finally {
      pulling = false;
      drawStatus();
      refreshView();
      schedule();
    }
  }
  function schedule() {
    clearTimeout(timer);
    if (!started) return;
    const vis = document.visibilityState === "visible";
    let ms = !vis ? 30000 : root && V.open ? 2000 : root ? 3000 : 8000;
    if (Net.status && Net.status !== "ok") ms = Math.max(ms, Net.status === "nosql" ? 60000 : 6000);
    timer = setTimeout(() => void tick(), ms);
  }
  function start() {
    if (started) return;
    if (!cfg()) {
      Net.status = "nocfg";
      return;
    }
    started = true;
    void tick();
  }
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && started && tick(true));
  window.addEventListener("online", () => started && tick(true));

  async function loadProfiles() {
    lastProfiles = Date.now();
    const all = new Set(needProfiles);
    needProfiles.clear();
    if (all.size < 40) {
      Object.keys(S.friends).forEach((m) => all.add(m));
      for (const c of Object.values(S.convs)) Object.keys(c.members).forEach((m) => all.add(m));
    }
    all.delete(S.mid);
    if (!all.size) return;
    const rows = await rpc("mx_net_profiles", { p_mids: [...all].slice(0, 50) }).catch(() => []);
    for (const p of rows || []) {
      if (S.friends[p.mid]) {
        S.friends[p.mid].name = p.name || S.friends[p.mid].name;
        if (p.av) S.friends[p.mid].av = p.av;
      }
      for (const c of Object.values(S.convs)) {
        if (c.members[p.mid]) {
          c.members[p.mid].name = p.name || c.members[p.mid].name;
          if (p.av) c.members[p.mid].av = p.av;
        }
      }
    }
  }

  /* ───── 好友 / 通知 ───── */
  function upsertFriend(p) {
    const old = S.friends[p.mid];
    S.friends[p.mid] = { mid: p.mid, name: p.name || old?.name || "Meow 用户", av: p.av || old?.av || "", at: old?.at || Date.now() };
    ensureDm(p.mid);
  }
  function handleItem(from, ev, d) {
    if (muted.has(from.mid) && ev === "freq") return;
    if (ev === "freq") {
      if (S.friends[from.mid] || S.reqOut[from.mid]) {
        delete S.reqOut[from.mid];
        upsertFriend(from);
        queue({ type: "notify", to: from.mid, kind: "facc", data: {} });
        toast(`和 ${from.name} 成为好友啦`);
        return;
      }
      S.reqIn = S.reqIn.filter((r) => r.mid !== from.mid);
      S.reqIn.unshift({ mid: from.mid, name: from.name, av: from.av, note: String(d.note || "").slice(0, 60), at: Date.now() });
      toast(`${from.name} 想加你为好友（联机 → 好友）`);
    } else if (ev === "facc") {
      const was = !!S.friends[from.mid];
      delete S.reqOut[from.mid];
      S.reqIn = S.reqIn.filter((r) => r.mid !== from.mid);
      upsertFriend(from);
      if (!was) toast(`${from.name} 通过了你的好友申请`);
    } else if (ev === "fdel") {
      delete S.friends[from.mid];
    } else if (ev === "ginv") {
      if (!d.gid) return;
      const fresh = !S.convs[d.gid];
      const c = (S.convs[d.gid] ||= newConv(d.gid, d.name || "群聊", null));
      for (const [k, v] of Object.entries(d.members || {})) if (!c.members[k]) c.members[k] = { name: v?.name || "", av: "" };
      c.members[from.mid] = { name: from.name, av: from.av || c.members[from.mid]?.av || "" };
      Object.keys(c.members).forEach((m) => needProfiles.add(m));
      if (fresh) {
        c.lastAt = Date.now();
        pushLocal(c, { id: rid(), sys: true, local: true, at: Date.now(), text: `${from.name} 邀请你加入了群聊「${c.name}」` });
        toast(`${from.name} 拉你进了群聊「${c.name}」`);
      }
      joinConv(d.gid);
    }
    if (S.friends[from.mid]) {
      S.friends[from.mid].name = from.name || S.friends[from.mid].name;
      if (from.av) S.friends[from.mid].av = from.av;
    }
  }

  /* ───── 会话 ───── */
  const dmGid = (a, b) => "d" + [a, b].sort().join("_").toLowerCase();
  function newConv(gid, name, dm) {
    return { gid, name, dm, members: { [S.mid]: { name: me().name, av: "" } }, memberChars: {}, msgs: [], unread: 0, lastAt: Date.now(), char: null, charAuto: true, joined: false, needJoin: true, legacyUp: true };
  }
  function ensureDm(mid) {
    const gid = dmGid(S.mid, mid);
    if (!S.convs[gid]) {
      const f = S.friends[mid];
      S.convs[gid] = newConv(gid, f?.name || "好友", mid);
      S.convs[gid].members[mid] = { name: f?.name || "", av: f?.av || "" };
    }
    joinConv(gid);
    return gid;
  }
  function joinConv(gid) {
    const c = S.convs[gid];
    if (!c || c.joined) return;
    c.needJoin = true;
    if (!S.outbox.some((x) => x.type === "join" && x.gid === gid)) queue({ type: "join", gid });
  }
  const convTitle = (c) => (c.dm ? S.friends[c.dm]?.name || c.members[c.dm]?.name || "好友" : c.name || "群聊");
  const avOf = (c, mid) => (mid === S.mid ? S.av : S.friends[mid]?.av || c?.members?.[mid]?.av || "");
  const nameOf = (c, mid) => (mid === S.mid ? me().name : S.friends[mid]?.name || c?.members?.[mid]?.name || "Meow 用户");
  const isOn = (mid) => mid === S.mid || Net.online.has(mid);
  const onlineIn = (c) => [...new Set([S.mid, ...(c.dm ? [c.dm] : []), ...Object.keys(c.members)])].filter(isOn);

  const RT = new Map();
  const rt = (gid) => {
    if (!RT.has(gid)) RT.set(gid, { game: null, charBusy: false, charLast: 0 });
    return RT.get(gid);
  };

  function pushLocal(c, m) {
    if (!m || !m.id || c.msgs.some((x) => x.id === m.id)) return false;
    c.msgs.push(m);
    if (m.at && m.at < (c.msgs[c.msgs.length - 2]?.at || 0)) c.msgs.sort((a, b) => (a.at || 0) - (b.at || 0));
    if (c.msgs.length > MAX_MSGS) c.msgs.splice(0, c.msgs.length - MAX_MSGS);
    c.lastAt = Math.max(c.lastAt || 0, m.at || Date.now());
    save();
    return true;
  }
  let lastNotify = 0;
  function receiveMsg(c, m, live) {
    if (m.from && muted.has(m.from.mid)) return;
    if (!pushLocal(c, m)) return;
    const viewing = root && V.open === c.gid;
    const mine = m.from?.mid === S.mid;
    if (!viewing && !m.sys && !mine) {
      c.unread = (c.unread || 0) + 1;
      if (live && Date.now() - lastNotify > 3000) {
        lastNotify = Date.now();
        toast(`${c.dm ? "" : "「" + convTitle(c) + "」"}${m.from?.name || ""}：${String(m.text || "").slice(0, 30)}`);
      }
    }
    if (viewing) drawMsgs();
    if (live && !mine) void maybeCharReply(c, m);
  }
  /** 服务器上的一条记录 */
  function handleRow(row, live) {
    const c = S.convs[row.gid];
    if (!c) return;
    const b = row.body || {};
    const from = row.from_mid;
    const mine = from === S.mid;
    if (from && !c.members[from]) {
      c.members[from] = { name: b.m?.from?.name || "", av: "" };
      needProfiles.add(from);
    }
    if (b.t === "msg" && b.m && b.m.id) {
      const m = { ...b.m, at: (b.old && b.m.at) || Date.parse(row.created_at) || b.m.at || Date.now() };
      if (m.from) m.from = { ...m.from, mid: from };
      if (m.from && !m.from.isChar && m.from.name && c.members[from]) c.members[from].name = m.from.name;
      const old = c.msgs.find((x) => x.id === m.id);
      if (old) {
        delete old.pending;
        return;
      }
      receiveMsg(c, m, live);
    } else if (b.t === "char") {
      if (b.char) c.memberChars[from] = b.char;
      else delete c.memberChars[from];
    } else if (b.t === "rename") {
      if (!c.dm && b.name) c.name = String(b.name).slice(0, 20);
    } else if (b.t === "members") {
      for (const [k, v] of Object.entries(b.members || {})) if (!c.members[k]) c.members[k] = { name: v?.name || "", av: "" }, needProfiles.add(k);
    } else if (b.t === "leave") {
      if (from !== S.mid) delete c.members[from];
    } else if (b.t === "game") {
      if (live && !mine) {
        rt(c.gid).game = b.game || null;
        if (root && V.open === c.gid) drawGame();
        void charGameTurn(c);
      }
    } else if (b.t === "act") {
      if (live && !mine && rt(c.gid).game?.host === S.mid) hostAct(c, b.a);
    } else if (b.t === "draw") {
      if (mine || !b.key) return;
      const R = rt(c.gid);
      R.strokes ||= {};
      const arr = (R.strokes[b.key] ||= []);
      const st = b.clear ? { clear: true } : { s: b.s || [], col: b.col, w: b.w };
      arr.push(st);
      const cv = root?.querySelector("canvas.net-cv");
      if (cv && cv.dataset.key === b.key) {
        if (b.clear) redrawCanvas(cv, b.key, c.gid);
        else paintStroke(cv.getContext("2d"), st, cv.width, cv.height);
      }
    }
  }
  function post(c, body) {
    queue({ type: "post", gid: c.gid, body });
  }
  function sendMsg(c, m) {
    m.pending = true;
    pushLocal(c, m);
    const { pending, ...clean } = m;
    post(c, { t: "msg", m: clean });
    if (root && V.open === c.gid) drawMsgs();
  }
  function sysMsg(c, text, extra) {
    sendMsg(c, { id: rid(), sys: true, text, at: Date.now(), ...(extra || {}) });
  }

  /* ───── 角色接话（用主人自己手机上的 AI） ───── */
  async function charPersona(c) {
    if (!c.char) return "";
    try {
      const cast = await F.loadCast();
      return cast.find((x) => x.id === c.char.id)?.persona || "";
    } catch (_) {
      return "";
    }
  }
  function sendAsChar(c, text) {
    const ch = c.char;
    if (!ch) return;
    const t = F.cleanLine(text, 300, ch.name);
    if (!t) return;
    sendMsg(c, { id: rid(), at: Date.now(), text: t, from: { mid: S.mid, name: ch.name, isChar: true, owner: me().name } });
  }
  async function maybeCharReply(c, m) {
    const ch = c.char;
    const R = rt(c.gid);
    if (!ch || !c.charAuto || R.charBusy || !F.hasApiKey()) return;
    if (m.from && m.from.isChar && m.from.mid === S.mid) return;
    const text = String(m.text || "");
    const called = text.includes(ch.name);
    const now = Date.now();
    let chance = 0;
    if (called) chance = 1;
    else if (m.sys) chance = m.gameEnd && m.involves?.includes(ch.name) ? 0.8 : 0;
    else if (m.from?.isChar) chance = now - R.charLast > 40000 ? 0.18 : 0;
    else if (c.dm) chance = now - R.charLast > 8000 ? 0.45 : 0.1;
    else chance = now - R.charLast > 15000 ? (m.from?.mid === S.mid ? 0.55 : 0.35) : 0.08;
    if (Math.random() > chance) return;
    R.charBusy = true;
    try {
      await new Promise((r) => setTimeout(r, 900 + Math.random() * 1600));
      const persona = await charPersona(c);
      const ctx = c.msgs
        .slice(-18)
        .map((x) => (x.sys ? `（${x.text}）` : `${x.from?.isChar ? `${x.from.name}（${x.from.owner}的角色）` : x.from?.name}：${x.text}`))
        .join("\n");
      const reply = await F.aiText(
        [
          {
            role: "system",
            content: `你是「${ch.name}」。${persona ? "人设：\n" + persona + "\n" : ""}你的主人是「${me().name}」，TA 把你带进了和其他 Meow 用户的${c.dm ? "好友私聊" : "群聊「" + c.name + "」"}，里面有别的真人和他们带来的角色。像在群聊里一样自然地说话：口语、简短（一两句），符合人设，可以和别人互动、开玩笑。不要替别人说话，不要加名字前缀，不要旁白，不要输出思考过程。`
          },
          { role: "user", content: `最近的消息：\n${ctx}\n\n现在轮到你说一句。` }
        ],
        { maxTokens: 300, temperature: 0.95 }
      );
      R.charLast = Date.now();
      sendAsChar(c, reply);
    } catch (_) {
      /* AI 失败就不说话 */
    } finally {
      R.charBusy = false;
    }
  }

  /* ───── 小游戏（谁开的谁当主持人；状态走消息通道） ───── */
  const TRUTH = [
    "最近一次心动是什么时候？",
    "手机里最不想被看到的是什么？",
    "说一个你从来没告诉别人的小秘密",
    "在场的人里你最想和谁一起出去玩？",
    "最近一次哭是因为什么？",
    "你做过最丢脸的事是什么？",
    "理想型是什么样的？",
    "如果明天世界末日，今天你想做什么？",
    "你偷偷讨厌过在场的谁吗？（可以说没有）",
    "最近一次撒谎是什么时候？"
  ];
  const DARE = [
    "用最嗲的语气说一句「晚安」",
    "给在场的一个人写一句土味情话",
    "学一种动物叫三声",
    "接下来三条消息都要用叠字说话",
    "夸一夸列表里上一个人",
    "发一句你最喜欢的歌词（自己写的也行）",
    "用三个 emoji 形容自己",
    "接下来一分钟只能用文言文说话",
    "给群主起一个可爱的外号",
    "讲一个冷笑话"
  ];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const GAMES = {
    uno: { name: "UNO", icon: "🃏", desc: "经典卡牌，先出完的人赢，手里牌最多的受罚" },
    spy: { name: "谁是卧底", icon: "🕵️", desc: "每人一个词，有一个人的词不一样，描述 + 投票揪出卧底（3 人以上）" },
    draw: { name: "你画我猜", icon: "🎨", desc: "轮流画，大家猜，角色也会来瞎猜" },
    mines: { name: "扫雷对战", icon: "💣", desc: "一块雷盘轮流挖，踩到雷的人受罚" },
    td: { name: "真心话大冒险", icon: "🍾", desc: "转盘随机选一个人，选真心话或大冒险" },
    mlm: { name: "喵了个喵 · 比分", icon: "🐱", desc: "每人玩一局，比谁玩得好，垫底的受罚" },
    piano: { name: "猫爪琴键 · 比分", icon: "🐾", desc: "每人弹一局，比谁弹得多，垫底的受罚" },
    snake: { name: "小馋猫 · 比分", icon: "😼", desc: "每人玩一局小馋猫，比谁抢的吃的多，垫底的受罚" },
    snaket: { name: "小馋猫 · 组队", icon: "😼", desc: "大家（和角色）的分数加起来，达到目标就一起过关，没达到全员受罚" },
    dice: { name: "掷骰子比大小", icon: "🎲", desc: "每人掷两颗骰子，点数最小的人接惩罚" },
    bomb: { name: "数字炸弹", icon: "🧨", desc: "1~100 里藏着一个炸弹数字，轮流猜，猜中的人被炸" }
  };
  /* ───── 游戏厅联机版：谁是卧底、你画我猜、UNO、扫雷对战、喵了个喵 / 猫爪琴键比分 ───── */
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const SPY_PAIRS = [
    ["牛奶", "豆浆"], ["火锅", "麻辣烫"], ["眼镜", "隐形眼镜"], ["包子", "饺子"], ["蝴蝶", "蜜蜂"], ["猫", "老虎"],
    ["地铁", "公交"], ["奶茶", "咖啡"], ["口红", "唇膏"], ["枕头", "抱枕"], ["微信", "QQ"], ["电影院", "剧场"],
    ["橙子", "橘子"], ["雨伞", "雨衣"], ["钢琴", "电子琴"], ["婚纱", "旗袍"], ["蛋糕", "面包"], ["游泳", "潜水"],
    ["月亮", "太阳"], ["情书", "日记"], ["保安", "警察"], ["演唱会", "音乐节"], ["烧烤", "铁板烧"], ["香水", "花露水"]
  ];
  const DRAW_WORDS = ["猫", "西瓜", "火锅", "长颈鹿", "彩虹", "雪人", "钢琴", "眼镜", "冰淇淋", "月亮", "企鹅", "雨伞", "蛋糕", "自行车", "向日葵", "灯塔", "章鱼", "热气球", "仙人掌", "耳机", "汉堡", "恐龙", "风筝", "城堡", "蜗牛", "奶茶", "吉他", "外星人", "帆船", "蝴蝶", "兔子", "太阳", "房子", "鱼", "飞机", "苹果", "花", "树", "星星", "爱心"];
  const UCOL = ["r", "y", "g", "b"];
  const UCN = { r: "红", y: "黄", g: "绿", b: "蓝", w: "万能" };
  const unoDeck = () => {
    const d = [];
    for (const c of UCOL) {
      d.push(c + "0");
      for (let n = 1; n <= 9; n++) d.push(c + n, c + n);
      for (const s of ["S", "R", "D"]) d.push(c + s, c + s);
    }
    for (let i = 0; i < 4; i++) d.push("wW", "wF");
    return shuffle(d);
  };
  const unoLabel = (k) => ({ S: "🚫", R: "🔁", D: "+2", W: "🌈", F: "+4" })[k[1]] || k[1];
  const unoName = (k, col) => (k[0] === "w" ? (k[1] === "F" ? "万能+4" : "万能牌") + (col ? `（变${UCN[col]}）` : "") : UCN[k[0]] + ({ S: "禁止", R: "反转", D: "+2" }[k[1]] || k[1]));
  const unoCan = (k, g) => k[0] === "w" || k[0] === g.color || k[1] === g.top[1];
  const unoCard = (k, extra) => `<span class="nu-card nu-${k[0]}${extra || ""}"><b>${unoLabel(k)}</b></span>`;
  const MN = 8;
  const MINES = 10;
  const mNeighbors = (i) => {
    const r = Math.floor(i / MN);
    const c0 = i % MN;
    const out = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && r + dr >= 0 && r + dr < MN && c0 + dc >= 0 && c0 + dc < MN) out.push((r + dr) * MN + c0 + dc);
    return out;
  };
  const mCount = (g, i) => mNeighbors(i).filter((j) => g.mines.includes(j)).length;
  const pun = () => (Math.random() < 0.5 ? "真心话 · " + pick(TRUTH) : "大冒险 · " + pick(DARE));
  const CHAL = { mlm: "喵了个喵", piano: "猫爪琴键", snake: "小馋猫", snaket: "小馋猫" };
  const isChal = (k) => k === "mlm" || k === "piano" || k === "snake" || k === "snaket";
  function allPlayers(c) {
    const out = [];
    for (const mid of onlineIn(c)) {
      out.push({ pid: mid, name: nameOf(c, mid), owner: mid, isChar: false });
      const ch = mid === S.mid ? c.char : c.memberChars[mid];
      if (ch) out.push({ pid: `c:${mid}:${ch.id}`, name: ch.name, owner: mid, isChar: true, ownerName: nameOf(c, mid) });
    }
    return out;
  }
  function broadcastGame(c) {
    post(c, { t: "game", game: rt(c.gid).game });
    if (root && V.open === c.gid) drawGame();
    void charGameTurn(c);
  }
  function startGame(c, kind) {
    const R = rt(c.gid);
    if (R.game) return toast("正在玩别的游戏");
    const players = allPlayers(c);
    if (players.length < 2) return toast("至少要两个人（带上角色也算）才能玩，对方得在线哦");
    const g = { id: rid(), kind, host: S.mid, players, phase: "play", log: [] };
    if (kind === "dice") g.rolls = {};
    if (kind === "bomb") {
      g.secret = 1 + Math.floor(Math.random() * 100);
      g.lo = 1;
      g.hi = 100;
      g.turn = 0;
      g.players.sort(() => Math.random() - 0.5);
    }
    if (kind === "td") {
      g.target = pick(players).pid;
      g.choice = "";
      g.q = "";
    }
    if (kind === "spy") {
      if (players.length < 3) return toast("谁是卧底至少要 3 个人（带上角色也算）");
      const pair = shuffle(pick(SPY_PAIRS).slice());
      g.players = shuffle(g.players);
      g.spy = pick(g.players).pid;
      g.words = Object.fromEntries(g.players.map((p) => [p.pid, p.pid === g.spy ? pair[1] : pair[0]]));
      g.alive = g.players.map((p) => p.pid);
      g.round = 1;
      g.t = 0;
      g.phase = "desc";
      g.descs = [];
      g.votes = {};
    }
    if (kind === "draw") {
      const humans = g.players.filter((p) => !p.isChar).map((p) => p.pid);
      if (humans.length < 1 || players.length < 2) return toast("你画我猜至少要两个人");
      g.drawers = shuffle(humans);
      g.di = 0;
      g.scores = Object.fromEntries(g.players.map((p) => [p.pid, 0]));
      g.word = pick(DRAW_WORDS);
      g.solved = {};
      g.deadline = Date.now() + 90000;
      g.log = [];
    }
    if (kind === "uno") {
      if (players.length > 8) return toast("UNO 最多 8 个人");
      g.deck = unoDeck();
      g.hands = {};
      for (const p of g.players) g.hands[p.pid] = g.deck.splice(0, 7);
      let top = g.deck.shift();
      while (top[0] === "w") {
        g.deck.push(top);
        top = g.deck.shift();
      }
      g.top = top;
      g.color = top[0];
      g.turn = 0;
      g.dir = 1;
      g.players = shuffle(g.players);
      g.last = "";
    }
    if (kind === "mines") {
      const cells = shuffle([...Array(MN * MN).keys()]);
      g.mines = cells.slice(0, MINES);
      g.open = [];
      g.turn = 0;
      g.players = shuffle(g.players);
    }
    if (isChal(kind)) {
      g.scores = {};
      g.labels = {};
      if (kind === "snaket") g.goal = 30 * g.players.length;
    }
    R.game = g;
    sysMsg(c, `${GAMES[kind].icon} ${me().name} 开了一局「${GAMES[kind].name}」！参加的有：${players.map((p) => p.name).join("、")}`);
    broadcastGame(c);
  }
  function endGame(c, text, extra) {
    if (text) sysMsg(c, text, extra);
    rt(c.gid).game = null;
    broadcastGame(c);
  }
  function act(c, type, value, pid) {
    const g = rt(c.gid).game;
    if (!g) return;
    const a = { type, value, pid: pid || S.mid, gid: g.id, from: S.mid };
    if (g.host === S.mid) hostAct(c, a);
    else post(c, { t: "act", a });
  }
  function hostAct(c, a) {
    const R = rt(c.gid);
    const g = R.game;
    if (!g || !a || a.gid !== g.id) return;
    const pl = g.players.find((p) => p.pid === a.pid);
    if (!pl || pl.owner !== a.from) return;
    if (g.kind === "dice" && a.type === "roll" && g.phase === "play") {
      if (g.rolls[pl.pid]) return;
      g.rolls[pl.pid] = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
      hostTick(c);
    } else if (g.kind === "bomb" && a.type === "guess" && g.phase === "play") {
      const cur = g.players[g.turn % g.players.length];
      if (cur.pid !== pl.pid) return;
      const n = Math.round(Number(a.value));
      if (!(n >= g.lo && n <= g.hi)) return;
      if (n === g.secret) {
        endGame(c, `💥 ${pl.name} 猜了 ${n}，被炸弹炸到啦！惩罚：${Math.random() < 0.5 ? "真心话 · " + pick(TRUTH) : "大冒险 · " + pick(DARE)}`, { gameEnd: true, involves: [pl.name] });
        return;
      }
      if (n < g.secret) g.lo = n + 1;
      else g.hi = n - 1;
      g.log.push(`${pl.name} 猜 ${n}`);
      if (g.lo === g.hi) {
        const next = g.players[(g.turn + 1) % g.players.length];
        endGame(c, `💥 只剩 ${g.lo} 了，${next.name} 躲不掉，被炸到啦！惩罚：${pick(DARE)}`, { gameEnd: true, involves: [next.name] });
        return;
      }
      g.turn++;
      broadcastGame(c);
    } else if (g.kind === "td" && a.type === "choose" && g.phase === "play") {
      if (g.target !== pl.pid || g.choice) return;
      g.choice = a.value === "dare" ? "dare" : "truth";
      g.q = g.choice === "dare" ? pick(DARE) : pick(TRUTH);
      g.phase = "answer";
      sysMsg(c, `🎡 ${pl.name} 选了${g.choice === "dare" ? "大冒险" : "真心话"}：${g.q}`, { gameEnd: true, involves: [pl.name] });
      broadcastGame(c);
    } else if (g.kind === "td" && a.type === "done") {
      endGame(c, "");
    } else if (g.kind === "td" && a.type === "again") {
      g.target = pick(g.players).pid;
      g.choice = "";
      g.q = "";
      g.phase = "play";
      broadcastGame(c);
    } else if (g.kind === "spy") {
      if (a.type === "desc" && g.phase === "desc") {
        const cur = g.alive[g.t];
        if (cur !== pl.pid) return;
        const t = String(a.value || "").trim().slice(0, 60) || "……";
        g.descs.push({ pid: pl.pid, r: g.round, text: t });
        g.t++;
        if (g.t >= g.alive.length) {
          g.phase = "vote";
          g.votes = {};
        }
        broadcastGame(c);
      } else if (a.type === "vote" && g.phase === "vote") {
        if (!g.alive.includes(pl.pid) || !g.alive.includes(a.value) || a.value === pl.pid || g.votes[pl.pid]) return;
        g.votes[pl.pid] = a.value;
        if (g.alive.every((pid) => g.votes[pid])) {
          const cnt = {};
          Object.values(g.votes).forEach((v) => (cnt[v] = (cnt[v] || 0) + 1));
          const max = Math.max(...Object.values(cnt));
          const top = Object.keys(cnt).filter((k) => cnt[k] === max);
          const nm = (pid) => g.players.find((p) => p.pid === pid)?.name || "";
          const tally = Object.entries(cnt).map(([k, n]) => `${nm(k)} ${n} 票`).join("，");
          if (top.length > 1) {
            sysMsg(c, `🕵️ 第 ${g.round} 轮投票：${tally}。平票，没人出局，继续描述！`);
          } else {
            const out = top[0];
            g.alive = g.alive.filter((p) => p !== out);
            const civ = g.words[g.players.find((p) => p.pid !== g.spy).pid];
            if (out === g.spy) {
              endGame(c, `🕵️ ${tally}。${nm(out)} 出局——TA 就是卧底！平民赢啦 🎉\n平民词「${civ}」，卧底词「${g.words[g.spy]}」。惩罚卧底 ${nm(out)}：${pun()}`, { gameEnd: true, involves: [nm(out)] });
              return;
            }
            if (g.alive.length <= 2) {
              endGame(c, `🕵️ ${tally}。${nm(out)} 出局，是平民……只剩两个人，卧底 ${nm(g.spy)} 赢了！\n平民词「${civ}」，卧底词「${g.words[g.spy]}」。惩罚平民们：${pun()}`, { gameEnd: true, involves: g.players.filter((p) => p.pid !== g.spy).map((p) => p.name) });
              return;
            }
            sysMsg(c, `🕵️ ${tally}。${nm(out)} 出局，TA 不是卧底！卧底还在，继续…`);
          }
          g.round++;
          g.t = 0;
          g.phase = "desc";
          g.votes = {};
        }
        broadcastGame(c);
      }
    } else if (g.kind === "draw") {
      if (a.type === "guess" && pl.pid !== g.drawers[g.di] && !g.solved[pl.pid]) {
        const t = String(a.value || "").trim().slice(0, 20);
        if (!t) return;
        if (t === g.word || (t.length >= 1 && t.replace(/\s/g, "") === g.word)) {
          g.solved[pl.pid] = true;
          g.scores[pl.pid] = (g.scores[pl.pid] || 0) + 2;
          g.scores[g.drawers[g.di]] = (g.scores[g.drawers[g.di]] || 0) + 1;
          g.log.push(`✅ ${pl.name} 猜对了！`);
          const need = g.players.filter((p) => !p.isChar && p.pid !== g.drawers[g.di]);
          if (need.every((p) => g.solved[p.pid])) return drawNext(c, "大家都猜对啦！");
        } else g.log.push(`${pl.name}：${t}`);
        g.log = g.log.slice(-8);
        broadcastGame(c);
      } else if (a.type === "skip" && pl.pid === g.drawers[g.di]) {
        drawNext(c, "画的人跳过了这题。");
      }
    } else if (g.kind === "uno") {
      const cur = g.players[g.turn];
      if (!cur || cur.pid !== pl.pid) return;
      const n = g.players.length;
      const nx = (k) => (g.turn + g.dir * k + n * 10) % n;
      const draw = (pid, k) => {
        for (let i = 0; i < k; i++) {
          if (!g.deck.length) g.deck = unoDeck();
          g.hands[pid].push(g.deck.shift());
        }
      };
      if (a.type === "draw") {
        draw(pl.pid, 1);
        g.last = `${pl.name} 摸了一张牌`;
        g.turn = nx(1);
        return broadcastGame(c);
      }
      if (a.type !== "play") return;
      const hand = g.hands[pl.pid];
      const i = Number(a.value?.i);
      const k = hand[i];
      if (!k || !unoCan(k, g)) return;
      hand.splice(i, 1);
      g.top = k;
      g.color = k[0] === "w" ? (UCOL.includes(a.value?.color) ? a.value.color : pick(UCOL)) : k[0];
      g.last = `${pl.name} 出了 ${unoName(k, k[0] === "w" ? g.color : "")}`;
      if (!hand.length) {
        const worst = g.players.filter((p) => p.pid !== pl.pid).sort((x, y) => g.hands[y.pid].length - g.hands[x.pid].length)[0];
        endGame(c, `🃏 ${pl.name} 出完了所有牌，赢啦！🎉\n手里牌最多的是 ${worst.name}（${g.hands[worst.pid].length} 张），惩罚：${pun()}`, { gameEnd: true, involves: [worst.name] });
        return;
      }
      if (hand.length === 1) g.last += "，UNO！";
      let step = 1;
      if (k[1] === "S") step = 2;
      if (k[1] === "R") {
        if (n === 2) step = 2;
        else g.dir = -g.dir;
      }
      if (k[1] === "D" || k[1] === "F") {
        const victim = g.players[nx(1)];
        draw(victim.pid, k[1] === "D" ? 2 : 4);
        g.last += `，${victim.name} 摸 ${k[1] === "D" ? 2 : 4} 张`;
        step = 2;
      }
      g.turn = nx(step);
      broadcastGame(c);
    } else if (g.kind === "mines") {
      const cur = g.players[g.turn % g.players.length];
      if (a.type !== "dig" || !cur || cur.pid !== pl.pid) return;
      const i = Number(a.value);
      if (!(i >= 0 && i < MN * MN) || g.open.includes(i)) return;
      if (g.mines.includes(i)) {
        g.open.push(i);
        g.boom = i;
        endGame(c, `💥 ${pl.name} 踩到雷啦！惩罚：${pun()}`, { gameEnd: true, involves: [pl.name] });
        return;
      }
      const stack = [i];
      while (stack.length) {
        const j = stack.pop();
        if (g.open.includes(j) || g.mines.includes(j)) continue;
        g.open.push(j);
        if (mCount(g, j) === 0) stack.push(...mNeighbors(j));
      }
      if (g.open.length >= MN * MN - MINES) {
        endGame(c, "🎉 雷全部避开了，大家一起赢！");
        return;
      }
      g.turn++;
      broadcastGame(c);
    } else if (isChal(g.kind)) {
      if (a.type !== "score" || g.scores[pl.pid] != null) return;
      g.scores[pl.pid] = Number(a.value?.n) || 0;
      g.labels[pl.pid] = String(a.value?.label || g.scores[pl.pid]).slice(0, 30);
      if (g.players.every((p) => g.scores[p.pid] != null)) return chalEnd(c);
      broadcastGame(c);
    }
  }
  function drawNext(c, why) {
    const g = rt(c.gid).game;
    if (!g) return;
    sysMsg(c, `🎨 ${why} 这题的答案是「${g.word}」`);
    g.di++;
    if (g.di >= g.drawers.length) {
      const rank = g.players.slice().sort((x, y) => (g.scores[y.pid] || 0) - (g.scores[x.pid] || 0));
      const last = rank[rank.length - 1];
      endGame(c, `🎨 你画我猜结束！${rank.map((p, i) => `${i + 1}. ${p.name} ${g.scores[p.pid] || 0} 分`).join("　")}\n最后一名 ${last.name}，惩罚：${pun()}`, { gameEnd: true, involves: [last.name] });
      return;
    }
    g.word = pick(DRAW_WORDS.filter((w) => w !== g.word));
    g.solved = {};
    g.deadline = Date.now() + 90000;
    g.log = [];
    broadcastGame(c);
  }
  function chalEnd(c) {
    const g = rt(c.gid).game;
    if (!g) return;
    const done = g.players.filter((p) => g.scores[p.pid] != null);
    if (!done.length) return endGame(c, "挑战取消了");
    const rank = done.sort((x, y) => g.scores[y.pid] - g.scores[x.pid]);
    if (g.kind === "snaket") {
      const total = done.reduce((n, p) => n + g.scores[p.pid], 0);
      const ok = total >= g.goal;
      return endGame(c, `😼 小馋猫组队：${rank.map((p) => `${p.name} ${g.scores[p.pid]}`).join(" + ")} = ${total} 分（目标 ${g.goal}）\n${ok ? "过关啦，大家都好棒 🎉" : `差一点点！全员惩罚：${pun()}`}`, { gameEnd: true, involves: ok ? [] : rank.map((p) => p.name) });
    }
    const last = rank[rank.length - 1];
    endGame(c, `🏆 「${CHAL[g.kind]}」挑战结果：${rank.map((p, i) => `${i + 1}. ${p.name}（${g.labels[p.pid]}）`).join("　")}${rank.length > 1 ? `\n垫底的 ${last.name}，惩罚：${pun()}` : ""}`, { gameEnd: true, involves: [last.name] });
  }
  // 你画我猜：主持人负责计时
  setInterval(() => {
    for (const [gid, R] of RT) {
      const g = R.game;
      if (g && g.kind === "draw" && g.host === S.mid && Date.now() > g.deadline && S.convs[gid]) drawNext(S.convs[gid], "时间到！");
    }
    if (root && V.open) {
      const el = root.querySelector("#net-draw-left");
      const g = rt(V.open).game;
      if (el && g?.deadline) el.textContent = Math.max(0, Math.ceil((g.deadline - Date.now()) / 1000)) + " 秒";
    }
  }, 1000);
  /** 从「游戏厅」玩完单人游戏回来报分 */
  function reportScore(game, n, label) {
    const ch = window.__mxNetChallenge;
    if (!ch || CHAL[ch.kind] !== game) return;
    const c = S.convs[ch.gid];
    const g = c && rt(c.gid).game;
    if (!g || g.id !== ch.gameId) {
      window.__mxNetChallenge = null;
      return;
    }
    window.__mxNetChallenge = null;
    act(c, "score", { n, label });
    toast(`成绩已经交到「${convTitle(c)}」啦`);
  }

  function hostTick(c) {
    const g = rt(c.gid).game;
    if (!g) return;
    if (g.kind === "dice") {
      const ids = g.players.map((p) => p.pid);
      if (ids.every((id) => g.rolls[id])) {
        const sum = (id) => g.rolls[id][0] + g.rolls[id][1];
        const min = Math.min(...ids.map(sum));
        const max = Math.max(...ids.map(sum));
        const losers = g.players.filter((p) => sum(p.pid) === min);
        const winners = g.players.filter((p) => sum(p.pid) === max);
        const res = g.players.map((p) => `${p.name} ${g.rolls[p.pid].join("+")}=${sum(p.pid)}`).join("，");
        const pun = Math.random() < 0.5 ? "真心话 · " + pick(TRUTH) : "大冒险 · " + pick(DARE);
        endGame(c, `🎲 ${res}。\n最大的是 ${winners.map((p) => p.name).join("、")}，最小的是 ${losers.map((p) => p.name).join("、")}！惩罚：${pun}`, { gameEnd: true, involves: losers.map((p) => p.name) });
        return;
      }
    }
    broadcastGame(c);
  }
  const charTimers = new Map();
  const answered = new Set();
  async function charGameTurn(c) {
    const g = rt(c.gid).game;
    const ch = c.char;
    if (!g || !ch) return;
    const mine = g.players.find((p) => p.isChar && p.owner === S.mid);
    if (!mine) return;
    clearTimeout(charTimers.get(c.gid));
    const later = (fn, ms) => charTimers.set(c.gid, setTimeout(fn, ms));
    if (g.kind === "dice" && g.phase === "play" && !g.rolls?.[mine.pid]) later(() => act(c, "roll", null, mine.pid), 1200 + Math.random() * 1800);
    if (g.kind === "bomb" && g.phase === "play" && g.players[g.turn % g.players.length]?.pid === mine.pid)
      later(() => act(c, "guess", g.lo + Math.floor(Math.random() * (g.hi - g.lo + 1)), mine.pid), 1500 + Math.random() * 1500);
    if (g.kind === "td" && g.phase === "play" && g.target === mine.pid && !g.choice) later(() => act(c, "choose", Math.random() < 0.5 ? "truth" : "dare", mine.pid), 1600);
    const ansKey = g.id + ":" + g.q;
    if (g.kind === "td" && g.phase === "answer" && g.target === mine.pid && !answered.has(ansKey)) {
      answered.add(ansKey);
      if (!F.hasApiKey()) return sendAsChar(c, g.choice === "dare" ? "……好吧，我做就是了。" : "这个嘛……秘密。");
      try {
        const persona = await charPersona(c);
        const reply = await F.aiText(
          [
            { role: "system", content: `你是「${ch.name}」。${persona ? "人设：\n" + persona + "\n" : ""}你在和其他 Meow 用户的群里玩真心话大冒险。用你的人设回答，口语、简短（一到三句），可以害羞、耍赖或认真。不要加名字前缀，不要输出思考过程。` },
            { role: "user", content: `你抽到了${g.choice === "dare" ? "大冒险" : "真心话"}：「${g.q}」。现在完成它。` }
          ],
          { maxTokens: 300, temperature: 0.95 }
        );
        sendAsChar(c, reply);
        rt(c.gid).charLast = Date.now();
      } catch (_) {
        sendAsChar(c, "……这个我跳过！");
      }
    }
    const k2 = (s) => `${g.id}:${s}`;
    if (g.kind === "spy") {
      const myChars = g.players.filter((p) => p.isChar && p.owner === S.mid && g.alive.includes(p.pid));
      for (const me2 of myChars) {
        if (g.phase === "desc" && g.alive[g.t] === me2.pid && !answered.has(k2(`d${g.round}${me2.pid}`))) {
          answered.add(k2(`d${g.round}${me2.pid}`));
          const word = g.words[me2.pid];
          let t = "";
          if (F.hasApiKey()) {
            try {
              const persona = await charPersona(c);
              const prev = g.descs.map((d) => `${g.players.find((p) => p.pid === d.pid)?.name}：${d.text}`).join("\n");
              t = await F.aiText(
                [
                  { role: "system", content: `你是「${ch.name}」。${persona ? "人设：\n" + persona + "\n" : ""}你在玩谁是卧底。你拿到的词是「${word}」（你不知道自己是不是卧底）。用一句话（15 字以内）描述你的词，不能说出这个词本身，也别太直白，按你的人设说话。只输出这句描述。` },
                  { role: "user", content: prev ? `前面大家的描述：\n${prev}\n轮到你了。` : "你第一个描述。" }
                ],
                { maxTokens: 120, temperature: 0.9 }
              );
            } catch (_) {
              t = "";
            }
          }
          t = F.cleanLine(t || "这个东西大家应该都见过吧", 40, ch.name);
          setTimeout(() => act(c, "desc", t, me2.pid), 800);
        }
        if (g.phase === "vote" && !g.votes[me2.pid] && !answered.has(k2(`v${g.round}${me2.pid}`))) {
          answered.add(k2(`v${g.round}${me2.pid}`));
          const cands = g.alive.filter((p) => p !== me2.pid);
          let target = pick(cands);
          if (F.hasApiKey()) {
            try {
              const list = g.descs.filter((d) => d.r === g.round).map((d) => `${cands.indexOf(d.pid) + 1}. ${g.players.find((p) => p.pid === d.pid)?.name}：${d.text}`).filter((x) => !x.startsWith("0."));
              const r = await F.aiText(
                [
                  { role: "system", content: `你在玩谁是卧底，你的词是「${g.words[me2.pid]}」。根据大家的描述，投出你觉得最可能是卧底的人。只输出序号数字。` },
                  { role: "user", content: list.join("\n") }
                ],
                { maxTokens: 10, temperature: 0.5 }
              );
              const n = parseInt(String(r).match(/\d+/)?.[0] || "0", 10);
              if (n >= 1 && n <= cands.length) target = cands[n - 1];
            } catch (_) {
              /* 随便投 */
            }
          }
          setTimeout(() => act(c, "vote", target, me2.pid), 1200 + Math.random() * 1500);
        }
      }
    }
    if (g.kind === "draw") {
      const mine2 = g.players.find((p) => p.isChar && p.owner === S.mid);
      const key = k2(`g${g.di}`);
      if (mine2 && !g.solved[mine2.pid] && !answered.has(key)) {
        answered.add(key);
        const tries = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < tries; i++)
          setTimeout(() => {
            const gg = rt(c.gid).game;
            if (!gg || gg.id !== g.id || gg.di !== g.di || gg.solved[mine2.pid]) return;
            const guess = Math.random() < 0.18 ? gg.word : pick(DRAW_WORDS);
            act(c, "guess", guess, mine2.pid);
          }, 12000 + i * 18000 + Math.random() * 6000);
      }
    }
    if (g.kind === "uno") {
      const cur = g.players[g.turn];
      if (cur && cur.isChar && cur.owner === S.mid && !answered.has(k2(`u${g.top}${g.turn}${g.hands[cur.pid].length}${g.deck.length}`))) {
        answered.add(k2(`u${g.top}${g.turn}${g.hands[cur.pid].length}${g.deck.length}`));
        const hand = g.hands[cur.pid];
        let idx = hand.findIndex((k) => k[0] !== "w" && k[0] === g.color);
        if (idx < 0) idx = hand.findIndex((k) => k[0] !== "w" && unoCan(k, g));
        if (idx < 0) idx = hand.findIndex((k) => k[0] === "w");
        const cnt = {};
        hand.forEach((k) => k[0] !== "w" && (cnt[k[0]] = (cnt[k[0]] || 0) + 1));
        const col = Object.keys(cnt).sort((x, y) => cnt[y] - cnt[x])[0] || pick(UCOL);
        setTimeout(() => (idx >= 0 ? act(c, "play", { i: idx, color: col }, cur.pid) : act(c, "draw", null, cur.pid)), 1400 + Math.random() * 1200);
      }
    }
    if (g.kind === "mines") {
      const cur = g.players[g.turn % g.players.length];
      if (cur && cur.isChar && cur.owner === S.mid && !answered.has(k2(`m${g.turn}`))) {
        answered.add(k2(`m${g.turn}`));
        const closed = [...Array(MN * MN).keys()].filter((i) => !g.open.includes(i));
        // 尽量挑旁边没有数字的格子
        const safeish = closed.filter((i) => mNeighbors(i).every((j) => !g.open.includes(j) || mCount(g, j) === 0));
        setTimeout(() => act(c, "dig", pick(safeish.length ? safeish : closed), cur.pid), 1500 + Math.random() * 1500);
      }
    }
    if (isChal(g.kind)) {
      for (const me2 of g.players.filter((p) => p.isChar && p.owner === S.mid)) {
        if (g.scores[me2.pid] != null || answered.has(k2("s" + me2.pid))) continue;
        answered.add(k2("s" + me2.pid));
        let n;
        let label;
        if (g.kind === "piano") {
          n = 15 + Math.floor(Math.random() * 120);
          label = `${n} 块`;
        } else if (g.kind === "snake" || g.kind === "snaket") {
          n = 15 + Math.floor(Math.random() * 35);
          label = `抢到 ${n} 分`;
        } else if (Math.random() < 0.35) {
          const sec = 60 + Math.floor(Math.random() * 120);
          n = 1000 - sec;
          label = `通关 ${sec} 秒`;
        } else {
          n = 20 + Math.floor(Math.random() * 60);
          label = `消了 ${n} 张`;
        }
        setTimeout(() => act(c, "score", { n, label }, me2.pid), 4000 + Math.random() * 8000);
      }
    }
  }

  /* ───── 界面 ───── */
  let root = null;
  const V = { tab: "msgs", open: "" };
  const fmtTime = (t) => {
    if (!t) return "";
    const d = new Date(t);
    const now = new Date();
    return d.toDateString() === now.toDateString() ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : `${d.getMonth() + 1}/${d.getDate()}`;
  };
  const ST = { ok: ["online", "已连接"], offline: ["reconnecting", "网络连不上"], nosql: ["error", "服务器还没建表"], server: ["error", "服务器出错"], auth: ["reconnecting", "登录中…"], nocfg: ["error", "没配置资源站"] };
  const stCls = () => (ST[Net.status] || ["connecting", "连接中…"])[0];
  const stText = () => (ST[Net.status] || ["connecting", "连接中…"])[1];

  /** 拉取完只在内容真的变了时才重画，免得把正在输入的框冲掉 */
  let lastSig = "";
  function refreshView() {
    if (!root) return;
    const sig = [Net.status, [...Net.online].sort().join(","), S.reqIn.length, Object.keys(S.reqOut).length, S.outbox.length, Object.keys(S.friends).length, ...Object.values(S.convs).map((c) => c.gid + c.msgs.length + ":" + (c.unread || 0) + c.name + Object.keys(c.members).length)].join("|");
    if (sig === lastSig) return;
    lastSig = sig;
    if (V.open) {
      drawHead();
      drawGame();
      drawMsgs();
      return;
    }
    const ae = document.activeElement;
    if (ae && root.contains(ae) && ae.tagName === "INPUT") return;
    drawHome();
  }
  function render() {
    if (!root) return;
    if (V.open && S.convs[V.open]) drawConv();
    else {
      V.open = "";
      drawHome();
    }
  }
  function drawStatus() {
    root?.querySelectorAll("[data-st]").forEach((el) => {
      el.className = "net-st " + stCls();
      el.textContent = stText();
    });
  }

  /** 进了聊天房间就铺满整个屏幕（像和角色聊天那样），回到列表再恢复 */
  function setNetFullscreen(on) {
    document.getElementById("fun-screen")?.classList.toggle("fun-screen--netroom", !!on);
  }
  function netAvHtml(name, av) {
    const nm = String(name || "?");
    if (av) return `<img class="chat-msg-avatar chat-msg-avatar--image mx-net-av" src="${esc(av)}" alt="" />`;
    const h = typeof F.hue === "function" ? F.hue(nm) : 210;
    return `<div class="chat-msg-avatar chat-msg-avatar--ph mx-net-av" style="background:hsl(${h} 45% 62%)">${esc(nm.slice(0, 1))}</div>`;
  }

  function drawHome() {
    setNetFullscreen(false);
    if (!root || V.open) return;
    const convs = Object.values(S.convs).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
    const unread = convs.reduce((n, c) => n + (c.unread || 0), 0);
    const friends = Object.values(S.friends).sort((a, b) => String(a.name).localeCompare(String(b.name), "zh"));
    const outs = Object.values(S.reqOut);
    let body = "";
    if (V.tab === "msgs") {
      body = `<button type="button" class="fun-btn solid wide" data-a="newgroup">＋ 发起群聊</button>
        <div class="net-convs">${
          convs
            .map((c) => {
              const last = c.msgs[c.msgs.length - 1];
              const on = onlineIn(c).filter((m) => m !== S.mid).length;
              const prev = last ? (last.sys ? last.text : `${c.dm && last.from?.mid === c.dm && !last.from?.isChar ? "" : (last.from?.name || "") + "："}${last.text}`) : "还没有消息";
              const av = c.dm ? F.avHtml({ name: convTitle(c), avatar: avOf(c, c.dm) }, "fun-av") : `<span class="fun-av net-gav">👥</span>`;
              return `<button type="button" class="net-conv" data-open="${esc(c.gid)}">${av}<div><b>${esc(convTitle(c))}${c.dm ? "" : `<i>(${Object.keys(c.members).length})</i>`}</b><small>${esc(String(prev).slice(0, 40))}</small></div><span class="net-cmeta"><small>${fmtTime(c.lastAt)}</small>${on ? `<em class="net-on">${c.dm ? "在线" : on + " 在线"}</em>` : ""}${c.unread ? `<u>${c.unread > 99 ? "99+" : c.unread}</u>` : ""}</span></button>`;
            })
            .join("") || `<p class="fun-note">还没有聊天。先去「好友」加几个 Meow 好友，就能私聊或者拉群啦。</p>`
        }</div>`;
    } else {
      body = `<div class="net-join"><input type="text" id="net-addid" maxlength="8" placeholder="输入好友的 Meow 号" autocapitalize="characters" /><button type="button" class="fun-btn solid" data-a="addfriend">加好友</button></div>
        ${
          S.reqIn.length
            ? `<h4 class="net-h4">新的朋友</h4>${S.reqIn
                .map(
                  (r) =>
                    `<div class="net-frow">${F.avHtml({ name: r.name, avatar: r.av }, "fun-av")}<div><b>${esc(r.name)}</b><small>Meow 号 ${esc(r.mid)}${r.note ? " · " + esc(r.note) : ""}</small></div><button type="button" class="fun-btn solid sm" data-acc="${esc(r.mid)}">同意</button><button type="button" class="fun-btn ghost sm" data-ign="${esc(r.mid)}">忽略</button></div>`
                )
                .join("")}`
            : ""
        }
        ${
          outs.length
            ? `<h4 class="net-h4">等待对方通过</h4>${outs
                .map((r) => `<div class="net-frow"><span class="fun-av net-gav">⏳</span><div><b>${esc(r.mid)}</b><small>${S.outbox.some((x) => x.to === r.mid && x.waiting) ? "对方还没打开新版联机，打开后会自动收到" : S.outbox.some((x) => x.to === r.mid) ? "正在发送…" : "已送达，等 TA 同意"}</small></div><button type="button" class="fun-btn ghost sm" data-cancel="${esc(r.mid)}">撤回</button></div>`)
                .join("")}`
            : ""
        }
        <h4 class="net-h4">我的好友（${friends.length}）</h4>
        ${
          friends
            .map((f) => {
              const gid = dmGid(S.mid, f.mid);
              return `<div class="net-frow" data-open="${esc(gid)}">${F.avHtml({ name: f.name, avatar: f.av }, "fun-av")}<div><b>${esc(f.name)}${isOn(f.mid) ? `<em class="net-on">在线</em>` : ""}</b><small>Meow 号 ${esc(f.mid)}</small></div><button type="button" class="fun-btn ghost sm" data-fmenu="${esc(f.mid)}">⋯</button></div>`;
            })
            .join("") || `<p class="fun-note">还没有好友。把你的 Meow 号发给朋友，或者输入 TA 的 Meow 号加 TA。</p>`
        }`;
    }
    root.innerHTML = `<div class="net-home">
      <div class="net-me">${F.avHtml({ name: me().name, avatar: me().av }, "fun-av")}<div><b>${esc(me().name)} <button type="button" class="net-mini" data-a="nick">改名</button></b><small>Meow 号 <code>${esc(S.mid)}</code> <button type="button" class="net-mini" data-a="copyid">复制</button></small></div><span class="net-stbox"><span class="net-st ${stCls()}" data-st>${stText()}</span><button type="button" class="net-mini" data-a="diag">检测</button></span></div>
      ${Net.status === "nosql" ? `<p class="net-warn">站长还没在 Supabase 里运行 <b>supabase-net.sql</b>，联机暂时用不了。（SQL Editor → 粘贴整段 → Run，一次就好）</p>` : ""}
      <div class="net-tabs"><button type="button" data-tab="msgs" class="${V.tab === "msgs" ? "is-on" : ""}">消息${unread ? `<u>${unread > 99 ? "99+" : unread}</u>` : ""}</button><button type="button" data-tab="friends" class="${V.tab === "friends" ? "is-on" : ""}">好友${S.reqIn.length ? `<u>${S.reqIn.length}</u>` : ""}</button></div>
      <div class="net-pane">${body}</div>
      <p class="fun-note">消息和好友申请会存到服务器上，对方不在线也能收到，打开 Meow 就会自动拉取。角色说话用的是 TA 主人自己的 AI，聊天本身不花 AI 额度。</p>
    </div>`;
  }

  /* ───── 联机聊天页美化：跟随聊天页美化 / 自己写 CSS ───── */
  const NET_STYLE_KEY = "meowos_net_style"; // default | chat | custom
  const NET_CSS_KEY = "meowos_net_css";
  const lsg = (k, d) => {
    try {
      return localStorage.getItem(k) ?? d;
    } catch (_) {
      return d;
    }
  };
  const netStyleMode = () => {
    const v = lsg(NET_STYLE_KEY, "chat");
    return v === "default" || v === "custom" ? v : "chat";
  };
  /** 把写给聊天页（#chat-screen）的 CSS 换成联机聊天页对应的元素 */
  /** 把写给聊天页（#chat-screen）的 CSS 套到联机聊天页：
   *  联机房间用的是和聊天页一样的结构和 class（.chat-msg / .chat-msg-inner / .chat-msg-bubble …），
   *  所以只需要把 #chat-screen 换成 #mx-net-room，挂件、气泡尾巴、已读标记这些都能原样生效 */
  function mapChatCssToNet(css) {
    return String(css || "")
      .replace(/#chat-list-screen(?:#chat-list-screen)*/g, "#mx-nomatch")
      .replace(/#chat-offline-screen(?:#chat-offline-screen)*/g, "#mx-nomatch")
      .replace(/#chat-screen/g, "#mx-net-room")
      .replace(/#chat-close\b/g, ".mx-net-back")
      .replace(/#chat-meta-label\b/g, ".mx-net-title")
      .replace(/#chat-messages\b/g, ".chat-messages")
      .replace(/#chat-input\b/g, ".chat-input")
      .replace(/#chat-[\w-]+/g, "#mx-nomatch")
      // 旧写法（自定义 CSS 里直接写 mx-net-*）继续有效：DOM 上两套 class 都有
      .replace(/\.mx-av-rep\b/g, ".mx-nomatch");
  }
  function netChatSourceCss() {
    let skin = "";
    try {
      skin = document.getElementById("mx-skin-css")?.textContent || "";
    } catch (_) {
      skin = "";
    }
    let chat = "";
    try {
      if (typeof readGlobalChatSurfaceBundleFromKv === "function") chat = String(readGlobalChatSurfaceBundleFromKv().classicCss || "");
    } catch (_) {
      chat = "";
    }
    return skin + "\n" + chat;
  }
  function applyNetStyle() {
    const mode = netStyleMode();
    let el = document.getElementById("mx-net-style");
    const css = mode === "chat" ? netChatSourceCss() : mode === "custom" ? lsg(NET_CSS_KEY, "") : "";
    if (!css.trim()) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement("style");
      el.id = "mx-net-style";
    }
    el.textContent = mapChatCssToNet(css);
    document.head.appendChild(el);
  }
  function netStyleSheet() {
    const mode = netStyleMode();
    const sh = F.openSheet(
      `<div class="net-style" style="display:flex;flex-direction:column;gap:10px">
        <div class="net-style-opts" style="display:flex;flex-direction:column;gap:8px">
          ${[
            ["chat", "跟随聊天美化", "和你跟角色聊天的页面一样（风格包 + 装扮里的聊天界面 CSS）"],
            ["custom", "自己写美化", "单独给联机聊天写一份 CSS"],
            ["default", "不美化", "用联机原本的样子"]
          ]
            .map(
              ([v, t, d]) =>
                `<label style="display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:14px;border:1px solid var(--line);background:var(--bg-card)"><input type="radio" name="nst" value="${v}" ${mode === v ? "checked" : ""} style="margin-top:3px"/><span><b>${t}</b><small style="display:block;color:var(--text-sub);font-size:12px">${d}</small></span></label>`
            )
            .join("")}
        </div>
        <div class="net-style-custom">
          <textarea id="nst-css" rows="8" spellcheck="false" placeholder="可以直接粘贴给聊天页写的美化 CSS（#chat-screen …），会自动套到联机聊天上。&#10;也可以直接写：#mx-net-room（整页）.mx-net-bubble（气泡）.mx-net-me / .mx-net-them（我 / 对方）.mx-net-av（头像）.mx-net-bar（输入栏）" style="width:100%;box-sizing:border-box;font-family:monospace;font-size:12px;padding:10px;border-radius:12px;border:1px solid var(--line);background:var(--bg-card);color:var(--text-main)">${esc(lsg(NET_CSS_KEY, ""))}</textarea>
          <div style="display:flex;gap:8px;margin-top:6px"><button type="button" class="fun-btn ghost sm" data-x="copy">把聊天页的美化复制过来改</button></div>
        </div>
        <div class="fun-sheet-actions"><button type="button" class="fun-btn solid" data-x="ok">保存</button></div>
      </div>`,
      { title: "联机聊天美化" }
    );
    const sync = () => {
      const v = sh.body.querySelector("[name=nst]:checked")?.value;
      sh.body.querySelector(".net-style-custom").style.display = v === "custom" ? "" : "none";
    };
    sync();
    sh.body.addEventListener("change", sync);
    sh.body.addEventListener("click", (e) => {
      const x = e.target.closest("[data-x]")?.dataset.x;
      if (x === "copy") {
        let chat = "";
        try {
          chat = String(readGlobalChatSurfaceBundleFromKv().classicCss || "");
        } catch (_) {
          chat = "";
        }
        if (!chat.trim()) return toast("聊天页还没写过美化 CSS");
        sh.body.querySelector("#nst-css").value = chat;
        return;
      }
      if (x !== "ok") return;
      const v = sh.body.querySelector("[name=nst]:checked")?.value || "chat";
      try {
        localStorage.setItem(NET_STYLE_KEY, v);
        localStorage.setItem(NET_CSS_KEY, sh.body.querySelector("#nst-css").value);
      } catch (_) {
        return toast("保存失败：存储空间不够");
      }
      applyNetStyle();
      sh.close();
      toast(v === "chat" ? "联机聊天跟随聊天美化啦" : v === "custom" ? "已套用你的美化" : "已换回原样");
    });
  }

  function drawConv() {
    const c = S.convs[V.open];
    c.unread = 0;
    save();
    root.innerHTML = `<div class="net-room mx-net-bg chat-main" id="mx-net-room">
      <div class="net-head" id="net-head"></div>
      <div class="net-game" id="net-game" hidden></div>
      <div class="net-list mx-net-list chat-messages" id="net-list"></div>
      <form class="net-bar mx-net-bar chat-composer"><button type="button" class="net-ico mx-net-more chat-more-btn" data-a="games" title="一起玩">🎲</button><div class="chat-input-ruled net-input-wrap"><input type="text" class="mx-net-input chat-input" maxlength="500" placeholder="说点什么…" enterkeyhint="send" /></div><button type="submit" class="fun-btn solid sm mx-net-send chat-send-fab">发送</button></form>
    </div>`;
    setNetFullscreen(true);
    applyNetStyle();
    drawHead();
    drawGame();
    drawMsgs();
    const inp = root.querySelector(".net-bar input");
    root.querySelector(".net-bar").addEventListener("submit", (e) => {
      e.preventDefault();
      const t = String(inp.value || "").trim().slice(0, 500);
      if (!t) return;
      const m = { id: rid(), at: Date.now(), text: t, from: { mid: S.mid, name: me().name } };
      sendMsg(c, m);
      void maybeCharReply(c, m);
      inp.value = "";
    });
  }
  function drawHead() {
    const h = root?.querySelector("#net-head");
    const c = S.convs[V.open];
    if (!h || !c) return;
    const onl = onlineIn(c);
    const mids = Object.keys(c.members).sort((a, b) => Number(isOn(b)) - Number(isOn(a)));
    h.innerHTML = `<div class="net-top mx-net-top chat-screen-topbar"><button type="button" class="net-back mx-net-back" data-a="back" aria-label="返回"><i class="ph ph-caret-left"></i></button><div class="net-top-t"><strong class="mx-net-title mx-chat-title">${esc(convTitle(c))}</strong><small class="net-st ${stCls()}">${Net.status === "ok" ? (c.dm ? (isOn(c.dm) ? "对方在线" : "对方不在线 · 上线后会收到") : `${onl.length} 人在线`) : stText()}</small></div>
      <button type="button" class="fun-btn ghost sm mx-net-style-btn" data-a="netstyle" title="聊天美化">🎨</button>${c.dm ? "" : `<button type="button" class="fun-btn ghost sm" data-a="invite">邀请</button><button type="button" class="fun-btn ghost sm" data-a="gmenu">⋯</button>`}</div>
      ${
        c.dm
          ? ""
          : `<div class="net-mems">${mids
              .map((mid) => {
                const ch = mid === S.mid ? c.char : c.memberChars[mid];
                return `<span class="net-mem ${isOn(mid) ? "" : "is-off"}" data-mid="${esc(mid)}">${F.avHtml({ name: nameOf(c, mid), avatar: avOf(c, mid) }, "fun-av sm")}<b>${esc(nameOf(c, mid))}</b>${ch ? `<i>+ ${esc(ch.name)}</i>` : ""}</span>`;
              })
              .join("")}</div>`
      }
      <div class="net-charbar">${
        c.char
          ? `${F.avHtml({ name: c.char.name, avatar: c.char.av }, "fun-av sm")}<span>带着 <b>${esc(c.char.name)}</b>${F.hasApiKey() ? "" : "（没填 API Key，TA 只能玩游戏不能聊天）"}</span><label class="net-auto"><input type="checkbox" ${c.charAuto ? "checked" : ""} data-a="auto" />会主动接话</label><button type="button" data-a="char">换</button>`
          : `<span>还没带角色进来</span><button type="button" data-a="char">带上我的角色</button>`
      }</div>`;
  }
  function drawGame() {
    const box = root?.querySelector("#net-game");
    const c = S.convs[V.open];
    if (!box || !c) return;
    const g = rt(c.gid).game;
    if (!g) {
      box.innerHTML = "";
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const meP = g.players.find((p) => p.owner === S.mid && !p.isChar);
    const host = g.host === S.mid;
    let body = "";
    if (g.kind === "dice") {
      body = `<div class="net-dice">${g.players.map((p) => `<span class="${g.rolls[p.pid] ? "done" : ""}">${esc(p.name)}<b>${g.rolls[p.pid] ? g.rolls[p.pid].map((n) => "⚀⚁⚂⚃⚄⚅"[n - 1]).join("") : "…"}</b></span>`).join("")}</div>
        ${meP && !g.rolls[meP.pid] ? `<button type="button" class="fun-btn solid" data-a="roll">🎲 掷骰子</button>` : `<small>等其他人掷…</small>`}`;
    } else if (g.kind === "bomb") {
      const cur = g.players[g.turn % g.players.length];
      const myTurn = cur && cur.owner === S.mid && !cur.isChar;
      body = `<div class="net-bomb"><b>${g.lo}</b> ~ <b>${g.hi}</b></div><small>轮到：${esc(cur?.name || "")}${g.log.length ? " · 刚才：" + esc(g.log.slice(-2).join("，")) : ""}</small>
        ${myTurn ? `<div class="net-guess"><input type="number" id="net-gn" min="${g.lo}" max="${g.hi}" placeholder="${g.lo}~${g.hi}" /><button type="button" class="fun-btn solid sm" data-a="guess">猜</button></div>` : ""}`;
    } else if (g.kind === "td") {
      const t = g.players.find((p) => p.pid === g.target);
      const mineT = t && t.owner === S.mid && !t.isChar;
      body = `<div class="net-td">🎡 转到了 <b>${esc(t?.name || "")}</b>${g.q ? `<p>${g.choice === "dare" ? "大冒险" : "真心话"}：${esc(g.q)}</p>` : ""}</div>
        ${mineT && !g.choice ? `<div class="ww-row"><button type="button" class="fun-btn ghost sm" data-a="truth">真心话</button><button type="button" class="fun-btn solid sm" data-a="dare">大冒险</button></div>` : ""}
        ${g.phase === "answer" && host ? `<div class="ww-row"><button type="button" class="fun-btn ghost sm" data-a="tdagain">再转一次</button><button type="button" class="fun-btn ghost sm" data-a="tdend">结束游戏</button></div>` : ""}`;
    } else if (g.kind === "spy") {
      const nm = (pid) => g.players.find((p) => p.pid === pid)?.name || "";
      const mineAlive = meP && g.alive.includes(meP.pid);
      const cur = g.alive[g.t];
      body = `<p class="net-spy-word">${meP ? `你的词：<b>${esc(g.words[meP.pid])}</b>${mineAlive ? "" : "（你已出局）"}` : "你在旁观"}</p>
        <div class="net-spy-seats">${g.players.map((p) => `<span class="${g.alive.includes(p.pid) ? "" : "is-out"}${g.phase === "desc" && cur === p.pid ? " is-cur" : ""}">${esc(p.name)}${g.phase === "vote" && g.votes[p.pid] ? " ✓" : ""}</span>`).join("")}</div>
        <div class="net-spy-log">${g.descs.slice(-8).map((d) => `<p><small>第${d.r}轮</small> <b>${esc(nm(d.pid))}</b>：${esc(d.text)}</p>`).join("") || `<p class="fun-note">按顺序每人用一句话描述自己的词，别直接说出来</p>`}</div>
        ${
          g.phase === "desc"
            ? cur === meP?.pid
              ? `<div class="net-guess"><input type="text" id="net-spy-in" maxlength="40" placeholder="用一句话描述你的词"/><button type="button" class="fun-btn solid sm" data-a="spydesc">说</button></div>`
              : `<small>第 ${g.round} 轮 · 轮到 ${esc(nm(cur))} 描述…</small>`
            : mineAlive && !g.votes[meP.pid]
              ? `<small>投票：你觉得谁是卧底？</small><div class="ww-row net-wrap">${g.alive.filter((p) => p !== meP.pid).map((p) => `<button type="button" class="fun-btn ghost sm" data-spyvote="${esc(p)}">${esc(nm(p))}</button>`).join("")}</div>`
              : `<small>投票中…（${Object.keys(g.votes).length}/${g.alive.length}）</small>`
        }`;
    } else if (g.kind === "draw") {
      const drawer = g.drawers[g.di];
      const iDraw = drawer === S.mid;
      const dn = g.players.find((p) => p.pid === drawer)?.name || "";
      body = `<div class="net-draw-top"><small>第 ${g.di + 1}/${g.drawers.length} 题 · <b>${esc(dn)}</b> 在画 · 剩 <b id="net-draw-left">${Math.max(0, Math.ceil((g.deadline - Date.now()) / 1000))} 秒</b></small>${iDraw ? `<b class="net-draw-word">题目：${esc(g.word)}</b>` : `<b class="net-draw-word">${"□".repeat(g.word.length)}（${g.word.length} 个字）</b>`}</div>
        <div id="net-cvbox" class="net-cvbox"></div>
        ${iDraw ? `<div class="ww-row"><button type="button" class="fun-btn ghost sm" data-a="dclear">清空</button>${["#3a2a2a", "#e85a5a", "#3b82c4", "#4caf50", "#f2a33a"].map((col) => `<button type="button" class="net-pen" data-pen="${col}" style="background:${col}"></button>`).join("")}<button type="button" class="fun-btn ghost sm" data-a="dskip">跳过</button></div>` : meP && !g.solved[meP.pid] ? `<div class="net-guess"><input type="text" id="net-draw-in" maxlength="20" placeholder="猜猜画的是什么"/><button type="button" class="fun-btn solid sm" data-a="dguess">猜</button></div>` : meP ? `<small>你猜对啦 ✅</small>` : ""}
        <div class="net-draw-log">${g.log.map((x) => `<span>${esc(x)}</span>`).join("")}</div>
        <small>${g.players.map((p) => `${esc(p.name)} ${g.scores[p.pid] || 0}`).join(" · ")}</small>`;
    } else if (g.kind === "uno") {
      const cur = g.players[g.turn];
      const myTurn = cur && cur.owner === S.mid && !cur.isChar;
      const hand = meP ? g.hands[meP.pid] || [] : [];
      body = `<div class="net-uno-top">${unoCard(g.top)}<span class="nu-col nu-${g.color}">当前颜色：${UCN[g.color]}</span></div>
        <small>${esc(g.last || "开局！")}</small>
        <div class="net-spy-seats">${g.players.map((p, i) => `<span class="${i === g.turn ? "is-cur" : ""}">${esc(p.name)} · ${g.hands[p.pid].length} 张</span>`).join("")}</div>
        ${meP ? `<div class="nu-hand">${hand.map((k, i) => `<button type="button" class="nu-btn${myTurn && unoCan(k, g) ? " ok" : ""}" data-uno="${i}">${unoCard(k)}</button>`).join("")}</div>` : ""}
        ${myTurn ? `<div class="ww-row"><small>轮到你了：点亮着的牌出牌</small><button type="button" class="fun-btn ghost sm" data-a="unodraw">摸一张</button></div>` : `<small>轮到 ${esc(cur?.name || "")}</small>`}`;
    } else if (g.kind === "mines") {
      const cur = g.players[g.turn % g.players.length];
      const myTurn = cur && cur.owner === S.mid && !cur.isChar;
      body = `<small>轮流挖格子，踩到雷的人受罚 · 轮到 <b>${esc(cur?.name || "")}</b>${myTurn ? "（你）" : ""}</small>
        <div class="nm-grid">${[...Array(MN * MN).keys()]
          .map((i) => {
            const o = g.open.includes(i);
            const n = o ? mCount(g, i) : 0;
            return `<button type="button" class="nm-c${o ? " is-o" : ""}${myTurn && !o ? " can" : ""}" data-dig="${i}">${o ? (g.mines.includes(i) ? "💥" : n || "") : ""}</button>`;
          })
          .join("")}</div>`;
    } else if (isChal(g.kind)) {
      const mineDone = meP && g.scores[meP.pid] != null;
      body = `<small>${g.kind === "snaket" ? `每个人在自己手机上玩一局小馋猫，大家的分数加起来要到 ${g.goal} 分才算过关（现在 ${Object.values(g.scores).reduce((n, v) => n + v, 0)} 分）` : `每个人在自己手机上玩一局「${CHAL[g.kind]}」，成绩自动交上来，最后一名受罚`}</small>
        <div class="net-spy-seats">${g.players.map((p) => `<span class="${g.scores[p.pid] != null ? "is-cur" : ""}">${esc(p.name)}：${g.scores[p.pid] != null ? esc(g.labels[p.pid]) : "还在玩…"}</span>`).join("")}</div>
        ${meP && !mineDone ? `<button type="button" class="fun-btn solid" data-a="chalgo">🎮 去玩「${CHAL[g.kind]}」</button>` : ""}
        ${g.host === S.mid ? `<button type="button" class="fun-btn ghost sm" data-a="chalend">不等了，现在公布成绩</button>` : ""}`;
    }
    const oldCv = box.querySelector("canvas.net-cv");
    box.className = "net-game net-game--" + g.kind;
    box.innerHTML = `<div class="net-gh"><strong>${GAMES[g.kind].icon} ${GAMES[g.kind].name}</strong><button type="button" data-a="gend">结束</button></div>${body}`;
    if (g.kind === "draw") mountCanvas(c, g, oldCv);
  }
  /* 你画我猜的画板 */
  let curPen = "#3a2a2a";
  function paintStroke(ctx, st, W, H) {
    const p = st.s || [];
    if (!p.length) return;
    ctx.strokeStyle = st.col || "#3a2a2a";
    ctx.lineWidth = st.w || 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(p[0][0] * W, p[0][1] * H);
    for (const [x, y] of p.slice(1)) ctx.lineTo(x * W, y * H);
    if (p.length === 1) ctx.lineTo(p[0][0] * W + 0.5, p[0][1] * H);
    ctx.stroke();
  }
  function redrawCanvas(cv, key, gid) {
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    for (const st of rt(gid).strokes?.[key] || []) {
      if (st.clear) {
        ctx.fillRect(0, 0, cv.width, cv.height);
        continue;
      }
      paintStroke(ctx, st, cv.width, cv.height);
    }
  }
  function mountCanvas(c, g, oldCv) {
    const box = root?.querySelector("#net-cvbox");
    if (!box) return;
    const key = g.id + ":" + g.di;
    let cv = oldCv && oldCv.dataset.key === key ? oldCv : null;
    if (!cv) {
      cv = document.createElement("canvas");
      cv.width = 600;
      cv.height = 440;
      cv.dataset.key = key;
      cv.className = "net-cv";
      redrawCanvas(cv, key, c.gid);
    }
    box.appendChild(cv);
    const iDraw = g.drawers[g.di] === S.mid;
    if (!iDraw || cv.__bound) return;
    cv.__bound = true;
    let cur = null;
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return [Math.round(((e.clientX - r.left) / r.width) * 1000) / 1000, Math.round(((e.clientY - r.top) / r.height) * 1000) / 1000];
    };
    cv.style.touchAction = "none";
    cv.addEventListener("pointerdown", (e) => {
      cur = { s: [pos(e)], col: curPen, w: 6 };
      cv.setPointerCapture?.(e.pointerId);
    });
    cv.addEventListener("pointermove", (e) => {
      if (!cur) return;
      const p = pos(e);
      const last = cur.s[cur.s.length - 1];
      if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) < 0.006) return;
      cur.s.push(p);
      const ctx = cv.getContext("2d");
      paintStroke(ctx, { s: [last, p], col: cur.col, w: cur.w }, cv.width, cv.height);
    });
    const end = () => {
      if (!cur) return;
      const st = cur;
      cur = null;
      const R = rt(c.gid);
      R.strokes ||= {};
      (R.strokes[key] ||= []).push(st);
      post(c, { t: "draw", key, s: st.s.slice(0, 400), col: st.col, w: st.w });
    };
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", end);
  }

  function drawMsgs() {
    const box = root?.querySelector("#net-list");
    const c = S.convs[V.open];
    if (!box || !c) return;
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.innerHTML =
      c.msgs
        .filter((m) => !(m.from && muted.has(m.from.mid)))
        .map((m) => {
          if (m.sys) return `<div class="chat-time-divider net-sys-row"><span class="chat-time-divider-label net-sys mx-net-sys">${esc(m.text).replace(/\n/g, "<br/>")}</span></div>`;
          const mid = m.from?.mid || "";
          const mine = mid === S.mid && !m.from?.isChar;
          const ch = m.from?.isChar ? (mid === S.mid ? c.char : c.memberChars[mid]) : null;
          const av = m.from?.isChar ? ch?.av || "" : avOf(c, mid);
          // 一对一聊天里不用每条都写名字；群聊、或者是谁带来的角色说话时才标出来
          const showName = !c.dm || m.from?.isChar;
          const avEl = netAvHtml(m.from?.name, av);
          const stack = `<div class="chat-msg-bubble-stack mx-net-stack">${showName ? `<div class="chat-msg-group-speaker mx-net-name">${esc(m.from?.name || "")}${m.from?.isChar ? `<em>${esc(m.from.owner || "")}的角色</em>` : ""}</div>` : ""}${m.dress && window.XXJ_DRESS ? `<div class="net-dress">${window.XXJ_DRESS.doll(m.dress)}</div>` : ""}<div class="chat-msg-bubble mx-net-bubble">${esc(m.text)}</div>${m.pending ? `<i class="net-pend">发送中…</i>` : ""}</div>`;
          return `<div class="net-msg chat-msg ${mine ? "chat-msg--user me mx-net-me" : "chat-msg--assistant mx-net-them"} mx-net-msg ${m.from?.isChar ? "char" : ""}" data-mid="${esc(mid)}"><div class="chat-msg-inner">${mine ? stack + avEl : avEl + stack}</div></div>`;
        })
        .join("") || `<p class="net-sys">还很安静，打个招呼吧～对方不在线也能收到</p>`;
    if (near || c.msgs.length < 3) box.scrollTop = box.scrollHeight;
  }

  /* ───── 操作 ───── */
  async function refreshMe() {
    try {
      const u = await F.loadUser();
      if (!S.nick) S.nick = String(u.name || "").trim().slice(0, 16) || "Meow 用户";
      const av = await thumb(u.avatar);
      if (av) S.av = av;
      save();
    } catch (_) {
      /* ignore */
    }
  }
  function addFriend(idRaw) {
    const id = String(idRaw || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(id)) return toast("Meow 号是 8 位字母或数字");
    if (id === S.mid) return toast("这是你自己的 Meow 号哦");
    if (S.friends[id]) return toast("已经是好友啦");
    if (S.reqIn.find((r) => r.mid === id)) return acceptReq(id);
    S.reqOut[id] = { mid: id, at: Date.now() };
    queue({ type: "notify", to: id, kind: "freq", data: {} });
    toast("申请已发出，对方打开 Meow 就能看到");
    drawHome();
  }
  function acceptReq(mid) {
    const r = S.reqIn.find((x) => x.mid === mid);
    if (!r) return;
    S.reqIn = S.reqIn.filter((x) => x.mid !== mid);
    upsertFriend(r);
    queue({ type: "notify", to: mid, kind: "facc", data: {} });
    save();
    toast(`和 ${r.name} 成为好友啦`);
    render();
  }
  function friendMenu(mid) {
    const f = S.friends[mid];
    if (!f) return;
    const sh = F.openSheet(
      `<div class="fun-sheet-actions" style="flex-direction:column"><button type="button" class="fun-btn solid" data-x="chat">发消息</button><button type="button" class="fun-btn ghost" data-x="del">删除好友</button><button type="button" class="fun-btn ghost" data-x="block">${muted.has(mid) ? "取消屏蔽" : "屏蔽 TA"}</button></div>`,
      { title: f.name }
    );
    sh.body.addEventListener("click", (e) => {
      const x = e.target.closest("[data-x]")?.dataset.x;
      if (!x) return;
      sh.close();
      if (x === "chat") {
        V.open = ensureDm(mid);
        render();
      } else if (x === "del") {
        if (!confirm(`删除好友 ${f.name}？和 TA 的私聊记录也会删掉。`)) return;
        queue({ type: "notify", to: mid, kind: "fdel", data: {} });
        delete S.friends[mid];
        const gid = dmGid(S.mid, mid);
        queue({ type: "leave", gid });
        delete S.convs[gid];
        save();
        render();
      } else if (x === "block") {
        if (muted.has(mid)) muted.delete(mid);
        else muted.add(mid);
        saveMute();
        render();
      }
    });
  }
  function pickFriends(title, exclude, onDone, withName) {
    const list = Object.values(S.friends).filter((f) => !exclude.has(f.mid));
    if (!list.length) return toast(exclude.size > 1 ? "好友都已经在群里了" : "先去「好友」里加几个 Meow 好友吧");
    const sh = F.openSheet(
      `${withName ? `<input type="text" class="net-input" id="net-gname" maxlength="20" placeholder="群聊名字（可不填）" />` : ""}
       <div class="net-pick">${list.map((f) => `<label class="net-frow">${F.avHtml({ name: f.name, avatar: f.av }, "fun-av sm")}<div><b>${esc(f.name)}</b><small>${esc(f.mid)}</small></div><input type="checkbox" value="${esc(f.mid)}" /></label>`).join("")}</div>
       <div class="fun-sheet-actions"><button type="button" class="fun-btn solid" data-x="ok">确定</button></div>`,
      { title }
    );
    sh.body.querySelector("[data-x=ok]").onclick = () => {
      const picked = [...sh.body.querySelectorAll("input[type=checkbox]:checked")].map((x) => x.value);
      if (!picked.length) return toast("至少选一个好友");
      const nm = String(sh.body.querySelector("#net-gname")?.value || "").trim();
      sh.close();
      onDone(picked, nm);
    };
  }
  const memberNames = (c) => Object.fromEntries(Object.keys(c.members).map((k) => [k, { name: nameOf(c, k) }]));
  function createGroup() {
    pickFriends(
      "发起群聊",
      new Set(),
      (picked, nm) => {
        const gid = "g" + rid();
        const names = [me().name, ...picked.map((m) => S.friends[m]?.name || "")].filter(Boolean);
        const c = (S.convs[gid] = newConv(gid, nm || names.slice(0, 3).join("、").slice(0, 20) + (names.length > 3 ? "…" : ""), null));
        for (const m of picked) c.members[m] = { name: S.friends[m]?.name || "", av: S.friends[m]?.av || "" };
        joinConv(gid);
        sysMsg(c, `${me().name} 创建了群聊「${c.name}」，邀请了 ${picked.map((m) => S.friends[m]?.name).join("、")}`);
        for (const m of picked) queue({ type: "notify", to: m, kind: "ginv", data: { gid, name: c.name, members: memberNames(c) } });
        V.open = gid;
        render();
      },
      true
    );
  }
  function inviteToGroup(c) {
    pickFriends("邀请好友进群", new Set(Object.keys(c.members)), (picked) => {
      for (const m of picked) c.members[m] = { name: S.friends[m]?.name || "", av: S.friends[m]?.av || "" };
      for (const m of picked) queue({ type: "notify", to: m, kind: "ginv", data: { gid: c.gid, name: c.name, members: memberNames(c) } });
      post(c, { t: "members", members: memberNames(c) });
      sysMsg(c, `${me().name} 邀请了 ${picked.map((m) => S.friends[m]?.name).join("、")} 加入群聊`);
      save();
      drawHead();
    });
  }
  function groupMenu(c) {
    const sh = F.openSheet(
      `<input type="text" class="net-input" id="net-rn" maxlength="20" value="${esc(c.name)}" />
       <div class="fun-sheet-actions"><button type="button" class="fun-btn solid" data-x="rn">改群名</button><button type="button" class="fun-btn ghost" data-x="quit">退出群聊</button></div>`,
      { title: "群聊设置" }
    );
    sh.body.addEventListener("click", (e) => {
      const x = e.target.closest("[data-x]")?.dataset.x;
      if (x === "rn") {
        const v = String(sh.body.querySelector("#net-rn").value || "").trim().slice(0, 20);
        if (!v) return;
        c.name = v;
        post(c, { t: "rename", name: v });
        sysMsg(c, `${me().name} 把群名改成了「${v}」`);
        sh.close();
        drawHead();
      } else if (x === "quit") {
        if (!confirm(`退出群聊「${c.name}」？聊天记录也会删掉。`)) return;
        sysMsg(c, `${me().name} 退出了群聊`);
        post(c, { t: "leave" });
        queue({ type: "leave", gid: c.gid });
        delete S.convs[c.gid];
        save();
        sh.close();
        V.open = "";
        render();
      }
    });
  }
  async function pickChar(c) {
    const cast = await F.loadCast();
    if (!cast.length) return toast("角色库里还没有角色");
    const sh = F.openSheet(
      `<div class="mm-to">${cast.map((x) => `<button type="button" class="pt-person${c.char?.id === x.id ? " is-on" : ""}" data-char="${esc(x.id)}">${F.avHtml(x, "fun-av")}<strong>${esc(x.name)}</strong></button>`).join("")}</div>
       ${c.char ? `<div class="fun-sheet-actions"><button type="button" class="fun-btn ghost" data-a2="nochar">不带角色了</button></div>` : ""}
       <p class="fun-note">TA 会用你自己的 AI 在这里说话，别人看到的是 TA 的名字和头像（不会把人设发给别人）。</p>`,
      { title: "带哪个角色？" }
    );
    sh.body.addEventListener("click", async (e) => {
      if (e.target.closest("[data-a2=nochar]")) {
        c.char = null;
        save();
        post(c, { t: "char", char: null });
        sh.close();
        drawHead();
        return;
      }
      const b = e.target.closest("[data-char]");
      if (!b) return;
      const x = cast.find((y) => y.id === b.dataset.char);
      sh.close();
      c.char = { id: x.id, name: x.name, av: await thumb(x.avatar) };
      save();
      post(c, { t: "char", char: c.char });
      drawHead();
      sysMsg(c, `${me().name} 把 ${x.name} 带进来了`);
    });
  }
  function pickGame(c) {
    const R = rt(c.gid);
    const sh = F.openSheet(
      `<div class="net-games">${Object.entries(GAMES)
        .map(([k, g]) => `<button type="button" data-g="${k}"><span>${g.icon}</span><strong>${g.name}</strong><small>${g.desc}</small></button>`)
        .join("")}<button type="button" data-g="dress"><span>👗</span><strong>晒搭配</strong><small>把你在换装小屋搭好的小人发到这里，大家和角色一起点评</small></button></div><p class="fun-note">${R.game ? "正在玩别的游戏，先结束才能开新的。" : "谁开局谁当主持人。"}现在在线的人和大家带来的角色都会一起参加。</p>`,
      { title: "一起玩" }
    );
    sh.body.addEventListener("click", (e) => {
      const b = e.target.closest("[data-g]");
      if (b && b.dataset.g === "dress") {
        sh.close();
        return void shareDress(c);
      }
      if (!b || R.game) return;
      sh.close();
      startGame(c, b.dataset.g);
    });
  }
  async function shareDress(c) {
    let o = null;
    try {
      o = (await F.FunDB.get("dress_v1"))?.user || null;
    } catch (_) {
      o = null;
    }
    if (!o || !window.XXJ_DRESS) return toast("先去「换装小屋」给自己的小人搭一身吧");
    const desc = window.XXJ_DRESS.describe(o);
    const m = { id: rid(), at: Date.now(), text: `晒一下我今天的搭配：${desc}`, dress: o, from: { mid: S.mid, name: me().name } };
    sendMsg(c, m);
    void maybeCharReply(c, { ...m, text: m.text + "（大家快夸夸 / 点评一下）" });
  }
  function memberMenu(c, mid) {
    if (!mid || mid === S.mid) return;
    const isF = !!S.friends[mid];
    const sh = F.openSheet(
      `<p class="fun-note">Meow 号 ${esc(mid)}</p><div class="fun-sheet-actions" style="flex-direction:column">${isF ? `<button type="button" class="fun-btn solid" data-x="chat">私聊</button>` : `<button type="button" class="fun-btn solid" data-x="add">加为好友</button>`}<button type="button" class="fun-btn ghost" data-x="block">${muted.has(mid) ? "取消屏蔽" : "屏蔽 TA（看不到 TA 和 TA 的角色说话）"}</button></div>`,
      { title: nameOf(c, mid) }
    );
    sh.body.addEventListener("click", (e) => {
      const x = e.target.closest("[data-x]")?.dataset.x;
      if (!x) return;
      sh.close();
      if (x === "chat") {
        V.open = ensureDm(mid);
        render();
      } else if (x === "add") addFriend(mid);
      else if (x === "block") {
        if (muted.has(mid)) muted.delete(mid);
        else muted.add(mid);
        saveMute();
        drawMsgs();
      }
    });
  }

  /** 连接检测 */
  async function diagnose() {
    const sh = F.openSheet(`<div class="net-diag" id="net-diag"><p>检测中…</p></div>`, { title: "联机连接检测" });
    const box = sh.body.querySelector("#net-diag");
    const lines = [];
    const put = (ok, t) => {
      lines.push(`<p class="${ok === true ? "ok" : ok === false ? "bad" : ""}">${ok === true ? "✅" : ok === false ? "❌" : "…"} ${t}</p>`);
      box.innerHTML = lines.join("");
    };
    if (!cfg()) return put(false, "没有资源站（Supabase）配置，联机用不了");
    put(true, "资源站配置已读到");
    const t0 = Date.now();
    try {
      await rpc("mx_net_profiles", { p_mids: [] });
      put(true, `服务器连得上，联机表已经建好（${Date.now() - t0}ms）`);
    } catch (e) {
      if (e.kind === "nosql") put(false, "服务器连得上，但还没建联机的表：站长要在 Supabase 的 SQL Editor 里运行一次 supabase-net.sql");
      else if (e.kind === "offline") put(false, "这台手机的网络连不上 Supabase（国内移动数据网络有时会这样），换 WiFi 或开关一下加速器再试");
      else put(false, "服务器出错：" + esc(e.message));
      return;
    }
    try {
      await ensureReg();
      put(true, `你的 Meow 号 ${esc(S.mid)} 已经登记好`);
    } catch (e) {
      put(false, "登记 Meow 号失败：" + esc(e.message));
      return;
    }
    if (S.outbox.length) put(null, `还有 ${S.outbox.length} 条在排队发送，正在补发…`);
    await tick();
    put(Net.status === "ok", Net.status === "ok" ? "收发正常" : "收发出错：" + esc(Net.lastErr));
  }

  function onClick(e) {
    const tab = e.target.closest("[data-tab]")?.dataset.tab;
    if (tab) {
      V.tab = tab;
      return drawHome();
    }
    const acc = e.target.closest("[data-acc]")?.dataset.acc;
    if (acc) return acceptReq(acc);
    const ign = e.target.closest("[data-ign]")?.dataset.ign;
    if (ign) {
      S.reqIn = S.reqIn.filter((r) => r.mid !== ign);
      save();
      return drawHome();
    }
    const cancel = e.target.closest("[data-cancel]")?.dataset.cancel;
    if (cancel) {
      delete S.reqOut[cancel];
      S.outbox = S.outbox.filter((x) => !(x.to === cancel && x.kind === "freq"));
      save();
      return drawHome();
    }
    const fm = e.target.closest("[data-fmenu]")?.dataset.fmenu;
    if (fm) return friendMenu(fm);
    const open = e.target.closest("[data-open]")?.dataset.open;
    if (open && S.convs[open]) {
      V.open = open;
      render();
      return void tick(true);
    }
    const a = e.target.closest("[data-a]")?.dataset.a;
    const c = S.convs[V.open];
    if (a === "copyid") {
      navigator.clipboard?.writeText(`来 Meow 加我好友吧！打开「联机」→ 好友，输入我的 Meow 号：${S.mid}`).then(
        () => toast("已复制，发给朋友吧"),
        () => toast("Meow 号：" + S.mid)
      );
      return;
    }
    if (a === "diag") return void diagnose();
    if (a === "nick") {
      const v = prompt("在联机里显示的名字", me().name);
      if (v == null) return;
      S.nick = String(v).trim().slice(0, 16) || S.nick;
      save();
      void tick(true);
      return drawHome();
    }
    if (a === "addfriend") return addFriend(root.querySelector("#net-addid")?.value);
    if (a === "newgroup") return createGroup();
    if (a === "back") {
      V.open = "";
      return render();
    }
    if (!c) return;
    if (a === "netstyle") return netStyleSheet();
    if (a === "invite") return inviteToGroup(c);
    if (a === "gmenu") return groupMenu(c);
    if (a === "char") return void pickChar(c);
    if (a === "auto") {
      c.charAuto = e.target.checked;
      save();
      return;
    }
    if (a === "games") return pickGame(c);
    if (a === "gend") return endGame(c, `${me().name} 结束了游戏`);
    if (a === "roll") return act(c, "roll");
    if (a === "guess") {
      const n = Number(root.querySelector("#net-gn")?.value);
      const g = rt(c.gid).game;
      if (!g || !(n >= g.lo && n <= g.hi)) return toast(`要猜 ${g?.lo}~${g?.hi} 之间的数`);
      return act(c, "guess", n);
    }
    if (a === "truth" || a === "dare") return act(c, "choose", a);
    if (a === "spydesc") {
      const v = root.querySelector("#net-spy-in")?.value.trim();
      if (!v) return toast("说一句描述吧");
      return act(c, "desc", v);
    }
    if (a === "dguess") {
      const inp = root.querySelector("#net-draw-in");
      const v = inp?.value.trim();
      if (!v) return;
      inp.value = "";
      return act(c, "guess", v);
    }
    if (a === "dskip") return act(c, "skip");
    if (a === "dclear") {
      const g = rt(c.gid).game;
      if (!g) return;
      const key = g.id + ":" + g.di;
      const R = rt(c.gid);
      R.strokes ||= {};
      (R.strokes[key] ||= []).push({ clear: true });
      post(c, { t: "draw", key, clear: true });
      const cv = root.querySelector("canvas.net-cv");
      if (cv) redrawCanvas(cv, key, c.gid);
      return;
    }
    if (a === "unodraw") return act(c, "draw");
    if (a === "chalgo") {
      const g = rt(c.gid).game;
      if (!g) return;
      window.__mxNetChallenge = { gid: c.gid, gameId: g.id, kind: g.kind };
      toast("玩完这一局，成绩会自动交回来");
      return F.open(CHAL[g.kind]);
    }
    if (a === "chalend") return chalEnd(c);
    const pen = e.target.closest("[data-pen]");
    if (pen) {
      curPen = pen.dataset.pen;
      return;
    }
    const sv = e.target.closest("[data-spyvote]");
    if (sv) return act(c, "vote", sv.dataset.spyvote);
    const dg = e.target.closest("[data-dig]");
    if (dg) {
      const g = rt(c.gid).game;
      const cur = g && g.players[g.turn % g.players.length];
      if (!cur || cur.owner !== S.mid || cur.isChar) return toast("还没轮到你");
      return act(c, "dig", Number(dg.dataset.dig));
    }
    const ub = e.target.closest("[data-uno]");
    if (ub) {
      const g = rt(c.gid).game;
      const cur = g && g.players[g.turn];
      if (!cur || cur.owner !== S.mid || cur.isChar) return toast("还没轮到你");
      const i = Number(ub.dataset.uno);
      const k = g.hands[S.mid]?.[i];
      if (!k || !unoCan(k, g)) return toast("这张出不了：要同颜色或同数字，或者万能牌");
      if (k[0] === "w") {
        const sh = F.openSheet(`<div class="ww-row nu-pick">${UCOL.map((col) => `<button type="button" class="nu-card nu-${col}" data-col="${col}"><b>${UCN[col]}</b></button>`).join("")}</div>`, { title: "变成什么颜色？" });
        sh.body.addEventListener("click", (ev) => {
          const cb = ev.target.closest("[data-col]");
          if (!cb) return;
          sh.close();
          act(c, "play", { i, color: cb.dataset.col });
        });
        return;
      }
      return act(c, "play", { i });
    }
    if (a === "tdagain") return act(c, "again");
    if (a === "tdend") return act(c, "done");
    const mu = e.target.closest(".net-msg:not(.me) .mx-net-av, .net-mem")?.closest("[data-mid]");
    if (mu) memberMenu(c, mu.dataset.mid);
  }

  /* 用过联机（有好友 / 群 / 待发）就在打开 Meow 时自动开始拉取，好友申请和消息能及时收到 */
  function autoStart() {
    if (Object.keys(S.friends).length || Object.keys(S.convs).length || S.outbox.length || Object.keys(S.reqOut).length || S.regOk) {
      void refreshMe().then(start);
    }
  }
  setTimeout(autoStart, 2500);

  F.register("联机", {
    title: "联机",
    kicker: "ONLINE",
    async mount(body) {
      root = document.createElement("div");
      root.className = "net";
      body.appendChild(root);
      root.addEventListener("click", onClick);
      root.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && e.target.id === "net-addid") addFriend(e.target.value);
      });
      await refreshMe();
      render();
      start();
      void tick(true);
    },
    unmount() {
      setNetFullscreen(false);
      root = null;
      schedule();
    }
  });
  window.XXJ_NET = { state: S, net: Net, uid: () => S.mid, addFriend, tick, reportScore, reloadFromStorage, storeKey: STORE_KEY, flush: () => save(true) };
})();
