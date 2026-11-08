"use strict";

/**
 * 联机 · Meow 用户之间加好友、建群聊，带上自己的角色一起聊天、一起玩游戏
 * - 每个人有一个 8 位「Meow 号」，输入对方的 Meow 号就能加好友
 * - 好友之间可以私聊，也可以拉好友建群聊；每个人都能把自己的一个角色带进群里
 * - 小游戏：掷骰子比大小、数字炸弹、真心话大冒险（大家和大家的角色一起玩）
 * - 用资源站同一个 Supabase 项目的 Realtime（广播 + 在线状态），不用建表、不存服务器
 *   好友申请 / 拉群这类通知：对方不在线时先留在自己手机上，等对方上线自动送达
 *   聊天记录存在每个人自己的手机上；有人离线时漏掉的消息，等大家同时在线时会互相补齐
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
  const MAX_MSGS = 300;

  /** @type {{ mid: string, nick: string, av: string, friends: Record<string, {mid:string,name:string,av:string,at:number}>, reqIn: any[], reqOut: Record<string, {mid:string,at:number}>, convs: Record<string, any>, outbox: any[], seen: string[] }} */
  let S;
  try {
    S = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
  } catch (_) {
    S = null;
  }
  if (!S || typeof S !== "object" || !S.mid) S = { mid: newMid(), nick: "", av: "", friends: {}, reqIn: [], reqOut: {}, convs: {}, outbox: [], seen: [] };
  S.friends ||= {};
  S.reqIn ||= [];
  S.reqOut ||= {};
  S.convs ||= {};
  S.outbox ||= [];
  S.seen ||= [];
  let saveT = 0;
  function save(now) {
    clearTimeout(saveT);
    const run = () => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(S));
      } catch (_) {
        // 存满了：每个会话少留一点
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

  /** 头像缩成小图再发（省流量） */
  function thumb(src) {
    return new Promise((ok) => {
      if (!src) return ok("");
      if (/^data:image\/jpeg/.test(src) && src.length < 9000) return ok(src);
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = c.height = 72;
          const s = Math.min(im.width, im.height);
          c.getContext("2d").drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 72, 72);
          ok(c.toDataURL("image/jpeg", 0.7));
        } catch (_) {
          ok("");
        }
      };
      im.onerror = () => ok("");
      im.src = src;
    });
  }

  /* ───── Supabase Realtime（Phoenix 协议，一条 WebSocket 同时订阅多个频道） ───── */
  function rtUrl() {
    const c = window.MX_SHARE_CONFIG || {};
    if (!c.url || !c.anonKey) return "";
    return String(c.url).replace(/\/+$/, "").replace(/^http/, "ws") + "/realtime/v1/websocket?apikey=" + encodeURIComponent(c.anonKey) + "&vsn=1.0.0";
  }
  const Hub = {
    ws: null,
    ref: 0,
    hb: 0,
    tries: 0,
    status: "",
    started: false,
    /** @type {Map<string, any>} */
    topics: new Map(),
    start() {
      if (this.started) return;
      if (!rtUrl()) {
        this.status = "nocfg";
        return;
      }
      this.started = true;
      this.connect();
    },
    connect() {
      const url = rtUrl();
      this.setStatus("connecting");
      let ws;
      try {
        ws = new WebSocket(url);
      } catch (_) {
        return this.retry();
      }
      this.ws = ws;
      ws.onopen = () => {
        this.tries = 0;
        this.setStatus("online");
        for (const t of this.topics.values()) this.rawJoin(t);
        clearInterval(this.hb);
        this.hb = setInterval(() => this.raw({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(++this.ref) }), 25000);
      };
      ws.onmessage = (ev) => {
        let m;
        try {
          m = JSON.parse(ev.data);
        } catch (_) {
          return;
        }
        const t = this.topics.get(String(m.topic || "").replace(/^realtime:/, ""));
        if (!t) return;
        if (m.event === "phx_reply" && m.ref === t.joinRef) {
          if (m.payload?.status === "ok") {
            t.joined = true;
            if (t.meta) this.track(t.name, t.meta);
            t.queue.splice(0).forEach(([e, p]) => this.send(t.name, e, p));
            t.h.joined?.();
          }
          return;
        }
        if (m.event === "broadcast") return t.h.broadcast?.(m.payload?.event, m.payload?.payload || {});
        if (m.event === "presence_state" || m.event === "presence_diff") {
          const metasOf = (obj) => {
            const out = [];
            for (const [k, v] of Object.entries(obj || {})) for (const mm of v?.metas || []) out.push([k, mm]);
            return out;
          };
          if (m.event === "presence_state") {
            t.pres = new Map(metasOf(m.payload).map(([k, mm]) => [k, mm]));
          } else {
            for (const [k] of metasOf(m.payload?.leaves)) t.pres.delete(k);
            for (const [k, mm] of metasOf(m.payload?.joins)) t.pres.set(k, mm);
          }
          t.h.presence?.();
          return;
        }
        if (m.event === "phx_error" || m.event === "phx_close") {
          t.joined = false;
          setTimeout(() => this.topics.has(t.name) && this.ws?.readyState === 1 && this.rawJoin(t), 2000);
        }
      };
      ws.onclose = () => {
        clearInterval(this.hb);
        for (const t of this.topics.values()) {
          t.joined = false;
          t.pres = new Map();
        }
        this.retry();
      };
      ws.onerror = () => {
        /* onclose 会接着来 */
      };
    },
    retry() {
      this.setStatus("reconnecting");
      const wait = Math.min(20000, 800 * 2 ** this.tries++);
      setTimeout(() => this.connect(), wait);
    },
    setStatus(s) {
      this.status = s;
      drawStatus();
    },
    raw(obj) {
      if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
    },
    rawJoin(t) {
      t.joinRef = String(++this.ref);
      t.joined = false;
      this.raw({
        topic: "realtime:" + t.name,
        event: "phx_join",
        payload: { config: { broadcast: { self: false, ack: false }, presence: { key: t.key }, private: false } },
        ref: t.joinRef,
        join_ref: t.joinRef
      });
    },
    join(name, h, meta) {
      if (this.topics.has(name)) {
        const t = this.topics.get(name);
        t.h = h;
        if (meta) this.track(name, meta);
        return t;
      }
      const t = { name, key: S.mid, h, joinRef: "", joined: false, queue: [], meta: meta || null, pres: new Map() };
      this.topics.set(name, t);
      if (this.ws && this.ws.readyState === 1) this.rawJoin(t);
      return t;
    },
    leave(name) {
      const t = this.topics.get(name);
      if (!t) return;
      this.topics.delete(name);
      this.raw({ topic: "realtime:" + name, event: "phx_leave", payload: {}, ref: String(++this.ref), join_ref: t.joinRef });
    },
    send(name, event, payload) {
      const t = this.topics.get(name);
      if (!t) return;
      if (!t.joined) {
        t.queue.push([event, payload]);
        if (t.queue.length > 50) t.queue.shift();
        return;
      }
      this.raw({ topic: "realtime:" + name, event: "broadcast", payload: { type: "broadcast", event, payload }, ref: String(++this.ref), join_ref: t.joinRef });
    },
    track(name, meta) {
      const t = this.topics.get(name);
      if (!t) return;
      t.meta = meta;
      if (!t.joined) return;
      this.raw({ topic: "realtime:" + name, event: "presence", payload: { type: "presence", event: "track", payload: meta }, ref: String(++this.ref), join_ref: t.joinRef });
    },
    online(name) {
      return this.topics.get(name)?.pres || new Map();
    }
  };

  const inboxName = (mid) => "meow-u-" + mid;
  const groupName = (gid) => "meow-g-" + gid;
  const me = () => ({ mid: S.mid, name: S.nick || "Meow 用户", av: S.av || "" });

  /* ───── 送达箱：好友申请 / 同意 / 拉群，对方上线时自动送达 ───── */
  function enqueue(to, ev, data) {
    if (!to || to === S.mid) return;
    S.outbox.push({ id: rid(), to, ev, data, at: Date.now() });
    save();
    watch(to);
    flush(to);
  }
  function watch(to) {
    const name = inboxName(to);
    if (Hub.topics.has(name) || to === S.mid) return;
    Hub.join(name, {
      joined: () => flush(to),
      presence: () => flush(to),
      broadcast: (ev, p) => {
        if (ev === "here" && p.mid === to) flush(to);
        if (ev === "ack" && p.to === S.mid) {
          const ids = new Set(p.ids || []);
          S.outbox = S.outbox.filter((x) => !(x.to === to && ids.has(x.id)));
          save();
          if (!S.outbox.some((x) => x.to === to)) setTimeout(() => !S.outbox.some((x) => x.to === to) && Hub.leave(name), 1500);
        }
      }
    });
  }
  function flush(to) {
    const name = inboxName(to);
    const t = Hub.topics.get(name);
    if (!t || !t.joined || !t.pres.has(to)) return;
    const items = S.outbox.filter((x) => x.to === to);
    if (!items.length) return;
    Hub.send(name, "deliver", { to, from: me(), items: items.map(({ id, ev, data }) => ({ id, ev, data })) });
  }
  setInterval(() => {
    const tos = new Set(S.outbox.map((x) => x.to));
    for (const to of tos) {
      watch(to);
      flush(to);
    }
  }, 20000);

  function startInbox() {
    Hub.start();
    Hub.join(
      inboxName(S.mid),
      {
        joined: () => Hub.send(inboxName(S.mid), "here", { mid: S.mid }),
        broadcast: (ev, p) => {
          if (ev !== "deliver" || p.to !== S.mid || !p.from?.mid) return;
          const ids = [];
          for (const it of p.items || []) {
            ids.push(it.id);
            if (S.seen.includes(it.id)) continue;
            S.seen.push(it.id);
            if (S.seen.length > 400) S.seen.splice(0, S.seen.length - 400);
            handleItem(p.from, it.ev, it.data || {});
          }
          Hub.send(inboxName(S.mid), "ack", { to: p.from.mid, ids });
          save();
          render();
        }
      },
      { mid: S.mid }
    );
    for (const to of new Set(S.outbox.map((x) => x.to))) watch(to);
    for (const gid of Object.keys(S.convs)) joinConv(gid);
  }

  function upsertFriend(p) {
    const old = S.friends[p.mid];
    S.friends[p.mid] = { mid: p.mid, name: p.name || old?.name || "Meow 用户", av: p.av || old?.av || "", at: old?.at || Date.now() };
    ensureDm(p.mid);
  }
  function handleItem(from, ev, d) {
    if (muted.has(from.mid) && ev === "freq") return;
    if (ev === "freq") {
      if (S.friends[from.mid] || S.reqOut[from.mid]) {
        // 已经是好友 / 我也正好加了 TA：直接成为好友
        delete S.reqOut[from.mid];
        upsertFriend(from);
        enqueue(from.mid, "facc", {});
        toast(`和 ${from.name} 成为好友啦`);
        return;
      }
      S.reqIn = S.reqIn.filter((r) => r.mid !== from.mid);
      S.reqIn.unshift({ mid: from.mid, name: from.name, av: from.av, note: String(d.note || "").slice(0, 60), at: Date.now() });
      toast(`${from.name} 想加你为好友（联机 → 好友）`);
    } else if (ev === "facc") {
      delete S.reqOut[from.mid];
      S.reqIn = S.reqIn.filter((r) => r.mid !== from.mid);
      upsertFriend(from);
      toast(`${from.name} 通过了你的好友申请`);
    } else if (ev === "fdel") {
      delete S.friends[from.mid];
    } else if (ev === "ginv") {
      if (!d.gid) return;
      const fresh = !S.convs[d.gid];
      const c = (S.convs[d.gid] ||= newConv(d.gid, d.name || "群聊", null));
      Object.assign(c.members, d.members || {});
      c.members[from.mid] = { name: from.name, av: from.av };
      c.members[S.mid] = { name: me().name, av: me().av };
      if (fresh) {
        c.lastAt = Date.now();
        pushLocal(c, { id: rid(), sys: true, at: Date.now(), text: `${from.name} 邀请你加入了群聊「${c.name}」` });
        toast(`${from.name} 拉你进了群聊「${c.name}」`);
      }
      joinConv(d.gid);
    }
    if (from.mid && S.friends[from.mid]) {
      S.friends[from.mid].name = from.name || S.friends[from.mid].name;
      if (from.av) S.friends[from.mid].av = from.av;
    }
  }

  /* ───── 会话（私聊 = 两个人的群） ───── */
  const dmGid = (a, b) => "d" + [a, b].sort().join("_").toLowerCase();
  function newConv(gid, name, dm) {
    return { gid, name, dm, members: { [S.mid]: { name: me().name, av: me().av } }, msgs: [], unread: 0, lastAt: Date.now(), char: null, charAuto: true };
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
  const convTitle = (c) => (c.dm ? S.friends[c.dm]?.name || c.members[c.dm]?.name || "好友" : c.name || "群聊");
  const convAv = (c) => (c.dm ? S.friends[c.dm]?.av || c.members[c.dm]?.av || "" : "");

  /** 运行时状态：游戏、角色接话（不存） */
  const RT = new Map();
  const rt = (gid) => {
    if (!RT.has(gid)) RT.set(gid, { game: null, charBusy: false, charLast: 0, joinedAt: Date.now() });
    return RT.get(gid);
  };
  function myMeta(c) {
    return { mid: S.mid, name: me().name, av: me().av, t: rt(c.gid).joinedAt, char: c.char ? { id: c.char.id, name: c.char.name, av: c.char.av } : null };
  }
  function joinConv(gid) {
    const c = S.convs[gid];
    if (!c || !Hub.started) return;
    const name = groupName(gid);
    Hub.join(
      name,
      {
        joined: () => {
          const since = Math.max(0, (c.msgs.filter((m) => !m.local).slice(-1)[0]?.at || 0) - 5 * 60 * 1000);
          Hub.send(name, "hello", { from: me(), since, char: c.char ? { id: c.char.id, name: c.char.name, av: c.char.av } : null });
        },
        presence: () => onConvPresence(gid),
        broadcast: (ev, p) => onConvBroadcast(gid, ev, p)
      },
      myMeta(c)
    );
  }
  const onlineMetas = (gid) => [...Hub.online(groupName(gid)).values()].filter((m) => m && m.mid);
  function hostMid(gid) {
    const arr = onlineMetas(gid).sort((a, b) => (a.t || 0) - (b.t || 0) || String(a.mid).localeCompare(String(b.mid)));
    return arr[0]?.mid || S.mid;
  }
  const amHost = (gid) => hostMid(gid) === S.mid;

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
    if (!viewing && !m.sys) {
      c.unread = (c.unread || 0) + 1;
      if (live && Date.now() - lastNotify > 3000) {
        lastNotify = Date.now();
        toast(`${c.dm ? "" : "「" + convTitle(c) + "」"}${m.from?.name || ""}：${String(m.text || "").slice(0, 30)}`);
      }
    }
    if (viewing) drawMsgs();
    else drawHome();
    if (live) void maybeCharReply(c, m);
  }
  function sendMsg(c, m) {
    pushLocal(c, m);
    Hub.send(groupName(c.gid), "msg", { m });
    if (root && V.open === c.gid) drawMsgs();
  }
  function sysMsg(c, text, extra) {
    const m = { id: rid(), sys: true, text, at: Date.now(), ...(extra || {}) };
    sendMsg(c, m);
    void maybeCharReply(c, m);
  }

  function onConvPresence(gid) {
    const c = S.convs[gid];
    if (!c) return;
    for (const m of onlineMetas(gid)) {
      if (m.mid === S.mid) continue;
      c.members[m.mid] = { name: m.name, av: m.av || c.members[m.mid]?.av || "" };
      if (S.friends[m.mid]) {
        S.friends[m.mid].name = m.name;
        if (m.av) S.friends[m.mid].av = m.av;
      }
    }
    const R = rt(gid);
    if (R.game && amHost(gid)) {
      const on = new Set(onlineMetas(gid).map((m) => m.mid));
      on.add(S.mid);
      const alive = R.game.players.filter((pl) => on.has(pl.owner));
      if (alive.length !== R.game.players.length) {
        R.game.players = alive;
        if (alive.length < 2) endGame(c, "人不够了，游戏结束");
        else hostTick(c);
      }
    }
    if (root && V.open === gid) drawHead();
    else drawHome();
  }

  function onConvBroadcast(gid, ev, p) {
    const c = S.convs[gid];
    if (!c) return;
    const name = groupName(gid);
    const R = rt(gid);
    if (ev === "msg") {
      if (p.m) receiveMsg(c, p.m, true);
    } else if (ev === "hello") {
      const f = p.from;
      if (!f?.mid || f.mid === S.mid) return;
      c.members[f.mid] = { name: f.name, av: f.av || "" };
      const since = Number(p.since) || 0;
      // 房主把漏掉的消息全给 TA；其他人只补自己发的
      const pool = amHost(gid) ? c.msgs : c.msgs.filter((m) => m.from?.mid === S.mid);
      const msgs = pool.filter((m) => !m.local && (m.at || 0) > since).slice(-150);
      Hub.send(name, "sync", { to: f.mid, msgs, members: c.members, name: c.dm ? "" : c.name, game: amHost(gid) ? R.game : null });
      save();
    } else if (ev === "sync") {
      if (p.to !== S.mid) return;
      let added = 0;
      for (const m of p.msgs || []) {
        if (m.from && muted.has(m.from.mid)) continue;
        if (pushLocal(c, m)) added++;
      }
      if (p.members && typeof p.members === "object") for (const [k, v] of Object.entries(p.members)) if (!c.members[k]) c.members[k] = v;
      if (p.name && !c.dm) c.name = p.name;
      if (p.game && !R.game) R.game = p.game;
      if (added && !(root && V.open === gid)) c.unread = (c.unread || 0) + added;
      save();
      render();
    } else if (ev === "members") {
      if (p.members) Object.assign(c.members, p.members);
      save();
      render();
    } else if (ev === "rename") {
      if (!c.dm && p.name) c.name = String(p.name).slice(0, 20);
      save();
      render();
    } else if (ev === "leave") {
      if (p.mid && p.mid !== S.mid) delete c.members[p.mid];
      save();
      render();
    } else if (ev === "game") {
      R.game = p.game || null;
      if (root && V.open === gid) drawGame();
      void charGameTurn(c);
    } else if (ev === "act") {
      if (amHost(gid)) hostAct(c, p);
    }
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
    const m = { id: rid(), at: Date.now(), text: t, from: { mid: S.mid, name: ch.name, av: ch.av, isChar: true, owner: me().name } };
    sendMsg(c, m);
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

  /* ───── 小游戏（房主 = 最早在线的人，状态广播给所有人） ───── */
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
    dice: { name: "掷骰子比大小", icon: "🎲", desc: "每人掷两颗骰子，点数最小的人接惩罚（真心话或大冒险）" },
    bomb: { name: "数字炸弹", icon: "💣", desc: "1~100 里藏着一个炸弹数字，轮流猜，猜中的人被炸" },
    td: { name: "真心话大冒险", icon: "🎡", desc: "转盘随机选一个人，选真心话或大冒险" }
  };
  function allPlayers(c) {
    const out = [];
    const metas = onlineMetas(c.gid);
    if (!metas.some((m) => m.mid === S.mid)) metas.push(myMeta(c));
    for (const m of metas) {
      out.push({ pid: m.mid, name: m.name, av: m.av || "", owner: m.mid, isChar: false });
      if (m.char) out.push({ pid: `c:${m.mid}:${m.char.id}`, name: m.char.name, av: m.char.av || "", owner: m.mid, isChar: true, ownerName: m.name });
    }
    return out;
  }
  function broadcastGame(c) {
    Hub.send(groupName(c.gid), "game", { game: rt(c.gid).game });
    if (root && V.open === c.gid) drawGame();
    void charGameTurn(c);
  }
  function startGame(c, kind) {
    const R = rt(c.gid);
    if (!amHost(c.gid)) {
      Hub.send(groupName(c.gid), "act", { type: "start", kind, from: S.mid });
      toast("已经请主持人开始");
      return;
    }
    const players = allPlayers(c);
    if (players.length < 2) return toast("至少要两个人（带上角色也算）才能玩，对方得在线哦");
    const g = { id: rid(), kind, players, phase: "play", log: [] };
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
    R.game = g;
    sysMsg(c, `${GAMES[kind].icon} 开始玩「${GAMES[kind].name}」！参加的有：${players.map((p) => p.name).join("、")}`);
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
    if (amHost(c.gid)) hostAct(c, a);
    else Hub.send(groupName(c.gid), "act", a);
  }
  function hostAct(c, a) {
    const R = rt(c.gid);
    if (a.type === "start") {
      if (!R.game && GAMES[a.kind]) startGame(c, a.kind);
      return;
    }
    const g = R.game;
    if (!g || a.gid !== g.id) return;
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
        g.phase = "over";
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
    }
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
  const stText = () => ({ online: "在线", connecting: "连接中…", reconnecting: "重新连接中…", nocfg: "没配置资源站" })[Hub.status] || "";

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
      el.className = "net-st " + Hub.status;
      el.textContent = stText();
    });
  }

  function drawHome() {
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
              const on = onlineMetas(c.gid).filter((m) => m.mid !== S.mid).length;
              const prev = last ? (last.sys ? last.text : `${c.dm && last.from?.mid === c.dm && !last.from?.isChar ? "" : (last.from?.name || "") + "："}${last.text}`) : "还没有消息";
              const av = c.dm ? F.avHtml({ name: convTitle(c), avatar: convAv(c) }, "fun-av") : `<span class="fun-av net-gav">👥</span>`;
              return `<button type="button" class="net-conv" data-open="${esc(c.gid)}">${av}<div><b>${esc(convTitle(c))}${c.dm ? "" : `<i>(${Object.keys(c.members).length})</i>`}</b><small>${esc(String(prev).slice(0, 40))}</small></div><span class="net-cmeta"><small>${fmtTime(c.lastAt)}</small>${on ? `<em class="net-on">${on} 在线</em>` : ""}${c.unread ? `<u>${c.unread > 99 ? "99+" : c.unread}</u>` : ""}</span></button>`;
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
                .map((r) => `<div class="net-frow"><span class="fun-av net-gav">⏳</span><div><b>${esc(r.mid)}</b><small>${S.outbox.some((x) => x.to === r.mid) ? "对方上线后会自动收到申请" : "已送达，等 TA 同意"}</small></div><button type="button" class="fun-btn ghost sm" data-cancel="${esc(r.mid)}">撤回</button></div>`)
                .join("")}`
            : ""
        }
        <h4 class="net-h4">我的好友（${friends.length}）</h4>
        ${
          friends
            .map((f) => {
              const gid = dmGid(S.mid, f.mid);
              const on = Hub.online(groupName(gid)).has(f.mid);
              return `<div class="net-frow" data-open="${esc(gid)}">${F.avHtml({ name: f.name, avatar: f.av }, "fun-av")}<div><b>${esc(f.name)}${on ? `<em class="net-on">在线</em>` : ""}</b><small>Meow 号 ${esc(f.mid)}</small></div><button type="button" class="fun-btn ghost sm" data-fmenu="${esc(f.mid)}">⋯</button></div>`;
            })
            .join("") || `<p class="fun-note">还没有好友。把你的 Meow 号发给朋友，或者输入 TA 的 Meow 号加 TA。</p>`
        }`;
    }
    root.innerHTML = `<div class="net-home">
      <div class="net-me">${F.avHtml({ name: me().name, avatar: me().av }, "fun-av")}<div><b>${esc(me().name)} <button type="button" class="net-mini" data-a="nick">改名</button></b><small>Meow 号 <code>${esc(S.mid)}</code> <button type="button" class="net-mini" data-a="copyid">复制</button></small></div><span class="net-st ${Hub.status}" data-st>${stText()}</span></div>
      <div class="net-tabs"><button type="button" data-tab="msgs" class="${V.tab === "msgs" ? "is-on" : ""}">消息${unread ? `<u>${unread > 99 ? "99+" : unread}</u>` : ""}</button><button type="button" data-tab="friends" class="${V.tab === "friends" ? "is-on" : ""}">好友${S.reqIn.length ? `<u>${S.reqIn.length}</u>` : ""}</button></div>
      <div class="net-pane">${body}</div>
      <p class="fun-note">通知类消息（好友申请、拉群）对方不在线时会先存在你手机上，等 TA 打开 Meow 自动送达。聊天记录只存在各自的手机里，不经过服务器保存；有人离线漏掉的消息，等大家同时在线时会自动补齐。角色说话用的是 TA 主人自己的 AI。</p>
    </div>`;
  }

  function drawConv() {
    const c = S.convs[V.open];
    c.unread = 0;
    save();
    root.innerHTML = `<div class="net-room">
      <div class="net-head" id="net-head"></div>
      <div class="net-game" id="net-game" hidden></div>
      <div class="net-list" id="net-list"></div>
      <form class="net-bar"><button type="button" class="net-ico" data-a="games" title="一起玩">🎲</button><input type="text" maxlength="500" placeholder="说点什么…（提到角色名字 TA 就会接话）" enterkeyhint="send" /><button type="submit" class="fun-btn solid sm">发送</button></form>
    </div>`;
    drawHead();
    drawGame();
    drawMsgs();
    const inp = root.querySelector(".net-bar input");
    root.querySelector(".net-bar").addEventListener("submit", (e) => {
      e.preventDefault();
      const t = String(inp.value || "").trim().slice(0, 500);
      if (!t) return;
      const m = { id: rid(), at: Date.now(), text: t, from: { mid: S.mid, name: me().name, av: me().av } };
      sendMsg(c, m);
      void maybeCharReply(c, m);
      inp.value = "";
    });
  }
  function drawHead() {
    const h = root?.querySelector("#net-head");
    const c = S.convs[V.open];
    if (!h || !c) return;
    const on = new Set(onlineMetas(c.gid).map((m) => m.mid));
    on.add(S.mid);
    const metaByMid = new Map(onlineMetas(c.gid).map((m) => [m.mid, m]));
    const mids = Object.keys(c.members).sort((a, b) => Number(on.has(b)) - Number(on.has(a)));
    h.innerHTML = `<div class="net-top"><button type="button" class="net-back" data-a="back">‹</button><div><strong>${esc(convTitle(c))}</strong><small class="net-st ${Hub.status}">${on.size} 人在线${amHost(c.gid) && on.size > 1 ? " · 你是主持人" : ""}</small></div>
      ${c.dm ? "" : `<button type="button" class="fun-btn ghost sm" data-a="invite">邀请</button><button type="button" class="fun-btn ghost sm" data-a="gmenu">⋯</button>`}</div>
      <div class="net-mems">${mids
        .map((mid) => {
          const m = c.members[mid] || {};
          const live = metaByMid.get(mid);
          const ch = mid === S.mid ? c.char : live?.char;
          return `<span class="net-mem ${on.has(mid) ? "" : "is-off"}" data-mid="${esc(mid)}">${F.avHtml({ name: m.name, avatar: m.av }, "fun-av sm")}<b>${esc(mid === S.mid ? me().name : m.name || "")}${mid === hostMid(c.gid) && on.size > 1 ? " 👑" : ""}</b>${ch ? `<i>+ ${esc(ch.name)}</i>` : ""}</span>`;
        })
        .join("")}</div>
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
    const host = amHost(c.gid);
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
    }
    box.innerHTML = `<div class="net-gh"><strong>${GAMES[g.kind].icon} ${GAMES[g.kind].name}</strong>${host ? `<button type="button" data-a="gend">结束</button>` : ""}</div>${body}`;
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
          if (m.sys) return `<p class="net-sys">${esc(m.text).replace(/\n/g, "<br/>")}</p>`;
          const mine = m.from?.mid === S.mid && !m.from?.isChar;
          return `<div class="net-msg ${mine ? "me" : ""} ${m.from?.isChar ? "char" : ""}" data-mid="${esc(m.from?.mid || "")}">${F.avHtml({ name: m.from?.name, avatar: m.from?.av }, "fun-av sm")}<div><small>${esc(m.from?.name || "")}${m.from?.isChar ? `<em>${esc(m.from.owner || "")}的角色</em>` : ""}</small><p>${esc(m.text)}</p></div></div>`;
        })
        .join("") || `<p class="net-sys">还很安静，打个招呼吧～</p>`;
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
    const inc = S.reqIn.find((r) => r.mid === id);
    if (inc) return acceptReq(id);
    S.reqOut[id] = { mid: id, at: Date.now() };
    enqueue(id, "freq", {});
    toast("申请已发出，对方打开 Meow 就能收到");
    drawHome();
  }
  function acceptReq(mid) {
    const r = S.reqIn.find((x) => x.mid === mid);
    if (!r) return;
    S.reqIn = S.reqIn.filter((x) => x.mid !== mid);
    upsertFriend(r);
    enqueue(mid, "facc", {});
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
        enqueue(mid, "fdel", {});
        delete S.friends[mid];
        const gid = dmGid(S.mid, mid);
        Hub.leave(groupName(gid));
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
        for (const m of picked) enqueue(m, "ginv", { gid, name: c.name, members: c.members });
        pushLocal(c, { id: rid(), sys: true, at: Date.now(), text: `你创建了群聊「${c.name}」，邀请了 ${picked.map((m) => S.friends[m]?.name).join("、")}。对方上线后会自动进群。` });
        V.open = gid;
        render();
      },
      true
    );
  }
  function inviteToGroup(c) {
    pickFriends("邀请好友进群", new Set(Object.keys(c.members)), (picked) => {
      for (const m of picked) c.members[m] = { name: S.friends[m]?.name || "", av: S.friends[m]?.av || "" };
      for (const m of picked) enqueue(m, "ginv", { gid: c.gid, name: c.name, members: c.members });
      Hub.send(groupName(c.gid), "members", { members: c.members });
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
        Hub.send(groupName(c.gid), "rename", { name: v });
        sysMsg(c, `${me().name} 把群名改成了「${v}」`);
        sh.close();
        drawHead();
      } else if (x === "quit") {
        if (!confirm(`退出群聊「${c.name}」？聊天记录也会删掉。`)) return;
        sysMsg(c, `${me().name} 退出了群聊`);
        Hub.send(groupName(c.gid), "leave", { mid: S.mid });
        setTimeout(() => Hub.leave(groupName(c.gid)), 500);
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
        Hub.track(groupName(c.gid), myMeta(c));
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
      Hub.track(groupName(c.gid), myMeta(c));
      drawHead();
      sysMsg(c, `${me().name} 把 ${x.name} 带进来了`);
    });
  }
  function pickGame(c) {
    const R = rt(c.gid);
    const sh = F.openSheet(
      `<div class="net-games">${Object.entries(GAMES)
        .map(([k, g]) => `<button type="button" data-g="${k}"><span>${g.icon}</span><strong>${g.name}</strong><small>${g.desc}</small></button>`)
        .join("")}</div><p class="fun-note">${R.game ? "正在玩别的游戏，先结束才能开新的。" : amHost(c.gid) ? "你是主持人，点了就开始。" : "点了会请主持人开始。"}现在在线的人和大家带来的角色都会一起参加。</p>`,
      { title: "一起玩" }
    );
    sh.body.addEventListener("click", (e) => {
      const b = e.target.closest("[data-g]");
      if (!b || R.game) return;
      sh.close();
      startGame(c, b.dataset.g);
    });
  }
  function memberMenu(c, mid) {
    if (!mid || mid === S.mid) return;
    const m = c.members[mid] || {};
    const isF = !!S.friends[mid];
    const sh = F.openSheet(
      `<p class="fun-note">Meow 号 ${esc(mid)}</p><div class="fun-sheet-actions" style="flex-direction:column">${isF ? `<button type="button" class="fun-btn solid" data-x="chat">私聊</button>` : `<button type="button" class="fun-btn solid" data-x="add">加为好友</button>`}<button type="button" class="fun-btn ghost" data-x="block">${muted.has(mid) ? "取消屏蔽" : "屏蔽 TA（看不到 TA 和 TA 的角色说话）"}</button></div>`,
      { title: m.name || "TA" }
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
      S.outbox = S.outbox.filter((x) => !(x.to === cancel && x.ev === "freq"));
      save();
      return drawHome();
    }
    const fm = e.target.closest("[data-fmenu]")?.dataset.fmenu;
    if (fm) return friendMenu(fm);
    const open = e.target.closest("[data-open]")?.dataset.open;
    if (open && S.convs[open]) {
      V.open = open;
      return render();
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
    if (a === "nick") {
      const v = prompt("在联机里显示的名字", me().name);
      if (v == null) return;
      S.nick = String(v).trim().slice(0, 16) || S.nick;
      save();
      for (const cc of Object.values(S.convs)) {
        cc.members[S.mid] = { name: me().name, av: me().av };
        Hub.track(groupName(cc.gid), myMeta(cc));
      }
      return drawHome();
    }
    if (a === "addfriend") return addFriend(root.querySelector("#net-addid")?.value);
    if (a === "newgroup") return createGroup();
    if (a === "back") {
      V.open = "";
      return render();
    }
    if (!c) return;
    if (a === "invite") return inviteToGroup(c);
    if (a === "gmenu") return groupMenu(c);
    if (a === "char") return void pickChar(c);
    if (a === "auto") {
      c.charAuto = e.target.checked;
      save();
      return;
    }
    if (a === "games") return pickGame(c);
    if (a === "gend") return endGame(c, "主持人结束了游戏");
    if (a === "roll") return act(c, "roll");
    if (a === "guess") {
      const n = Number(root.querySelector("#net-gn")?.value);
      const g = rt(c.gid).game;
      if (!g || !(n >= g.lo && n <= g.hi)) return toast(`要猜 ${g?.lo}~${g?.hi} 之间的数`);
      return act(c, "guess", n);
    }
    if (a === "truth" || a === "dare") return act(c, "choose", a);
    if (a === "tdagain") return act(c, "again");
    if (a === "tdend") return act(c, "done");
    const mu = e.target.closest(".net-msg:not(.me) .fun-av, .net-mem")?.closest("[data-mid]");
    if (mu) memberMenu(c, mu.dataset.mid);
  }

  /* 有好友 / 群 / 待送达的通知时，打开 Meow 就自动连上（这样别人发的消息和申请能及时收到） */
  function autoStart() {
    if (Object.keys(S.friends).length || Object.keys(S.convs).length || S.outbox.length || Object.keys(S.reqOut).length) {
      void refreshMe().then(startInbox);
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
      startInbox();
      if (!rtUrl()) toast("还没配置资源站（Supabase），联机用不了");
      render();
    },
    unmount() {
      root = null;
    }
  });
  window.XXJ_NET = { state: S, hub: Hub, uid: () => S.mid, addFriend, enqueue };
})();
