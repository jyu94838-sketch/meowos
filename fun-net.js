"use strict";

/**
 * 联机 · 和别的 Meow 用户一起玩
 * - 房间：6 位房间号，或者进「公共大厅」随便聊
 * - 每个人可以把自己的一个角色（char）带进房间：TA 用主人手机上的 AI 说话、一起玩游戏
 * - 小游戏：掷骰子比大小（输的人接惩罚）、数字炸弹、真心话大冒险
 * - 用的是资源站同一个 Supabase 项目的 Realtime（广播 + 在线状态），不用建表、不存聊天记录
 *   房间里的聊天只在大家手机上，所有人都退出后就没了
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast } = F;

  /* ───── 我是谁 ───── */
  const UID_KEY = "meowos_net_uid";
  const MUTE_KEY = "meowos_net_mute";
  let myUid = "";
  try {
    myUid = localStorage.getItem(UID_KEY) || "";
    if (!myUid) {
      myUid = "u" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      localStorage.setItem(UID_KEY, myUid);
    }
  } catch (_) {
    myUid = "u" + Math.random().toString(36).slice(2, 12);
  }
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

  const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
  const CODE_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const newCode = () => Array.from({ length: 6 }, () => CODE_ABC[Math.floor(Math.random() * CODE_ABC.length)]).join("");
  const PUBLIC = "PUBLIC";

  /** 头像缩成小图再发（省流量） */
  function thumb(src) {
    return new Promise((ok) => {
      if (!src) return ok("");
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

  /* ───── Supabase Realtime（Phoenix 协议，直接用 WebSocket） ───── */
  function rtUrl() {
    const c = window.MX_SHARE_CONFIG || {};
    if (!c.url || !c.anonKey) return "";
    return String(c.url).replace(/\/+$/, "").replace(/^http/, "ws") + "/realtime/v1/websocket?apikey=" + encodeURIComponent(c.anonKey) + "&vsn=1.0.0";
  }
  class Channel {
    constructor(topic, presenceKey, on) {
      this.topic = "realtime:" + topic;
      this.key = presenceKey;
      this.on = on;
      this.ref = 0;
      this.joinRef = "";
      this.ws = null;
      this.hb = 0;
      this.closed = false;
      this.tries = 0;
      this.meta = null;
      this.joined = false;
      this.queue = [];
    }
    connect() {
      const url = rtUrl();
      if (!url) {
        this.on.status?.("nocfg");
        return;
      }
      this.on.status?.("connecting");
      let ws;
      try {
        ws = new WebSocket(url);
      } catch (_) {
        return this.retry();
      }
      this.ws = ws;
      ws.onopen = () => {
        this.tries = 0;
        this.joinRef = String(++this.ref);
        this.raw({
          topic: this.topic,
          event: "phx_join",
          payload: { config: { broadcast: { self: false, ack: false }, presence: { key: this.key }, private: false } },
          ref: this.joinRef,
          join_ref: this.joinRef
        });
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
        if (m.topic !== this.topic) return;
        if (m.event === "phx_reply" && m.ref === this.joinRef) {
          if (m.payload?.status === "ok") {
            this.joined = true;
            this.on.status?.("online");
            if (this.meta) this.track(this.meta);
            const q = this.queue.splice(0);
            q.forEach(([e, p]) => this.send(e, p));
            this.on.joined?.();
          } else {
            this.on.status?.("error", m.payload?.response?.reason || "加入失败");
          }
          return;
        }
        if (m.event === "broadcast") return this.on.broadcast?.(m.payload?.event, m.payload?.payload || {});
        if (m.event === "presence_state") return this.on.presence?.("state", m.payload || {});
        if (m.event === "presence_diff") return this.on.presence?.("diff", m.payload || {});
        if (m.event === "phx_error" || m.event === "phx_close") {
          this.joined = false;
          try {
            ws.close();
          } catch (_) {
            /* ignore */
          }
        }
      };
      ws.onclose = () => {
        clearInterval(this.hb);
        this.joined = false;
        if (!this.closed) this.retry();
      };
      ws.onerror = () => {
        /* onclose 会接着来 */
      };
    }
    retry() {
      if (this.closed) return;
      this.on.status?.("reconnecting");
      const wait = Math.min(15000, 800 * 2 ** this.tries++);
      setTimeout(() => !this.closed && this.connect(), wait);
    }
    raw(obj) {
      if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
    }
    send(event, payload) {
      if (!this.joined) {
        this.queue.push([event, payload]);
        return;
      }
      this.raw({ topic: this.topic, event: "broadcast", payload: { type: "broadcast", event, payload }, ref: String(++this.ref), join_ref: this.joinRef });
    }
    track(meta) {
      this.meta = meta;
      if (!this.joined) return;
      this.raw({ topic: this.topic, event: "presence", payload: { type: "presence", event: "track", payload: meta }, ref: String(++this.ref), join_ref: this.joinRef });
    }
    close() {
      this.closed = true;
      clearInterval(this.hb);
      try {
        this.raw({ topic: this.topic, event: "phx_leave", payload: {}, ref: String(++this.ref), join_ref: this.joinRef });
        this.ws?.close();
      } catch (_) {
        /* ignore */
      }
    }
  }

  /* ───── 房间状态（离开联机页面也保持连接，直到点「退出房间」） ───── */
  const R = {
    code: "",
    ch: null,
    status: "",
    members: new Map(), // uid -> meta { uid, name, av, t, char }
    msgs: [],
    game: null,
    me: null, // { name, av }
    myChar: null, // { id, name, av, persona }
    charAuto: true,
    charLast: 0,
    charBusy: false,
    unread: 0
  };
  let root = null; // 当前页面（没打开就是 null）

  const hostUid = () => {
    const arr = [...R.members.values()].sort((a, b) => (a.t || 0) - (b.t || 0) || String(a.uid).localeCompare(String(b.uid)));
    return arr[0]?.uid || myUid;
  };
  const amHost = () => hostUid() === myUid;

  function pushMsg(m, fromNet) {
    if (!m || !m.id || R.msgs.some((x) => x.id === m.id)) return;
    R.msgs.push(m);
    if (R.msgs.length > 200) R.msgs.splice(0, R.msgs.length - 200);
    if (!root) R.unread++;
    drawMsgs();
    if (fromNet || m.sys || m.from?.uid === myUid) void maybeCharReply(m);
  }
  function sysMsg(text, extra) {
    const m = { id: rid(), sys: true, text, at: Date.now(), ...(extra || {}) };
    pushMsg(m);
    R.ch?.send("msg", { m });
  }
  function myMeta() {
    return {
      uid: myUid,
      name: R.me?.name || "我",
      av: R.me?.av || "",
      t: R.joinedAt,
      char: R.myChar ? { id: R.myChar.id, name: R.myChar.name, av: R.myChar.av } : null
    };
  }

  async function joinRoom(code) {
    code = String(code || "").trim().toUpperCase();
    if (!code) return;
    if (!rtUrl()) return toast("站长还没配置资源站（Supabase），联机用不了");
    if (R.ch) leaveRoom(true);
    const user = await F.loadUser();
    R.me = { name: user.name || "我", av: await thumb(user.avatar) };
    R.code = code;
    R.msgs = [];
    R.game = null;
    R.members = new Map();
    R.joinedAt = Date.now();
    R.unread = 0;
    R.ch = new Channel("meowos-room-" + code, myUid, {
      status: (s, why) => {
        R.status = s;
        if (s === "error") toast("进房间失败：" + (why || ""));
        drawHead();
      },
      joined: () => {
        R.ch.send("hello", { uid: myUid });
      },
      presence: onPresence,
      broadcast: onBroadcast
    });
    R.ch.track(myMeta());
    R.ch.connect();
    R.members.set(myUid, myMeta());
    render();
  }
  function leaveRoom(silent) {
    if (!R.ch) return;
    R.ch.close();
    R.ch = null;
    R.code = "";
    R.members.clear();
    R.msgs = [];
    R.game = null;
    if (!silent) toast("已退出房间");
    render();
  }

  function onPresence(kind, p) {
    const metasOf = (obj) => {
      const out = [];
      for (const [, v] of Object.entries(obj || {})) for (const m of v?.metas || []) if (m && m.uid) out.push(m);
      return out;
    };
    if (kind === "state") {
      R.members = new Map(metasOf(p).map((m) => [m.uid, m]));
    } else {
      for (const m of metasOf(p.leaves)) {
        R.members.delete(m.uid);
        if (m.uid !== myUid) pushMsg({ id: "l" + m.uid + Date.now(), sys: true, text: `${m.name} 离开了房间`, at: Date.now() });
      }
      for (const m of metasOf(p.joins)) {
        const isNew = !R.members.has(m.uid);
        R.members.set(m.uid, m);
        if (isNew && m.uid !== myUid) pushMsg({ id: "j" + m.uid + (m.t || 0), sys: true, text: `${m.name} 进入了房间${m.char ? `，还带来了 ${m.char.name}` : ""}`, at: Date.now() });
      }
    }
    if (!R.members.has(myUid)) R.members.set(myUid, myMeta());
    // 游戏里有人走了：房主把 TA 从游戏里去掉
    if (R.game && amHost()) {
      const alive = R.game.players.filter((pl) => R.members.has(pl.owner));
      if (alive.length !== R.game.players.length) {
        R.game.players = alive;
        if (alive.length < 2) endGame("人不够了，游戏结束");
        else hostTick();
      }
    }
    drawHead();
  }

  function onBroadcast(ev, p) {
    if (ev === "msg") {
      const m = p.m;
      if (!m || (m.from && muted.has(m.from.uid))) return;
      pushMsg(m, true);
    } else if (ev === "hello") {
      // 新人进来：房主把最近的聊天和游戏发给 TA
      if (amHost() && p.uid !== myUid) R.ch.send("sync", { to: p.uid, msgs: R.msgs.slice(-60), game: R.game });
    } else if (ev === "sync") {
      if (p.to !== myUid) return;
      for (const m of p.msgs || []) if (!R.msgs.some((x) => x.id === m.id) && !(m.from && muted.has(m.from.uid))) R.msgs.push(m);
      R.msgs.sort((a, b) => (a.at || 0) - (b.at || 0));
      if (p.game) R.game = p.game;
      render();
    } else if (ev === "game") {
      R.game = p.game || null;
      drawGame();
      void charGameTurn();
    } else if (ev === "act") {
      if (amHost()) hostAct(p);
    }
  }

  /* ───── 聊天 ───── */
  function sendText(text) {
    const t = String(text || "").trim().slice(0, 500);
    if (!t || !R.ch) return;
    const m = { id: rid(), at: Date.now(), text: t, from: { uid: myUid, name: R.me.name, av: R.me.av } };
    pushMsg(m);
    R.ch.send("msg", { m });
  }
  function sendAsChar(text) {
    const c = R.myChar;
    const t = F.cleanLine(text, 300, c.name);
    if (!t) return;
    const m = { id: rid(), at: Date.now(), text: t, from: { uid: myUid, name: c.name, av: c.av, isChar: true, owner: R.me.name } };
    pushMsg(m);
    R.ch?.send("msg", { m });
  }

  /** 我带来的角色要不要接话（用我自己的 AI） */
  async function maybeCharReply(m) {
    const c = R.myChar;
    if (!c || !R.charAuto || R.charBusy || !R.ch || !F.hasApiKey()) return;
    if (m.from && m.from.isChar && m.from.uid === myUid) return; // 不自己接自己
    const text = String(m.text || "");
    const called = text.includes(c.name) || /@/.test(text) && text.includes("@" + c.name);
    const now = Date.now();
    let chance = 0;
    if (called) chance = 1;
    else if (m.sys) chance = m.gameEnd && m.involves?.includes(c.name) ? 0.8 : 0;
    else if (m.from?.isChar) chance = now - R.charLast > 40000 ? 0.18 : 0;
    else chance = now - R.charLast > 15000 ? (m.from?.uid === myUid ? 0.55 : 0.35) : 0.08;
    if (Math.random() > chance) return;
    R.charBusy = true;
    try {
      await new Promise((r) => setTimeout(r, 900 + Math.random() * 1600));
      const ctx = R.msgs
        .slice(-18)
        .map((x) => (x.sys ? `（${x.text}）` : `${x.from?.isChar ? `${x.from.name}（${x.from.owner}的角色）` : x.from?.name}：${x.text}`))
        .join("\n");
      const reply = await F.aiText(
        [
          {
            role: "system",
            content: `你是「${c.name}」。${c.persona ? "人设：\n" + c.persona + "\n" : ""}你的主人是「${R.me.name}」，TA 把你带进了一个多人联机聊天室，里面有别的真人玩家和他们带来的角色。像在群聊里一样自然地说话：口语、简短（一两句），符合人设，可以和别人互动、开玩笑。不要替别人说话，不要加名字前缀，不要旁白。`
          },
          { role: "user", content: `聊天室最近的消息：\n${ctx}\n\n现在轮到你在群里说一句。` }
        ],
        { maxTokens: 300, temperature: 0.95 }
      );
      R.charLast = Date.now();
      sendAsChar(reply);
    } catch (_) {
      /* AI 失败就不说话 */
    } finally {
      R.charBusy = false;
    }
  }

  /* ───── 小游戏（房主说了算，状态广播给所有人） ───── */
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
    "夸一夸你左边（列表里上一个）的人",
    "发一句你最喜欢的歌词（自己写的也行）",
    "用三个 emoji 形容自己",
    "接下来一分钟只能用文言文说话",
    "给房主起一个可爱的外号",
    "讲一个冷笑话"
  ];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const GAMES = {
    dice: { name: "掷骰子比大小", icon: "🎲", desc: "每人掷两颗骰子，点数最小的人接惩罚（真心话或大冒险）" },
    bomb: { name: "数字炸弹", icon: "💣", desc: "1~100 里藏着一个炸弹数字，轮流猜，猜中的人被炸" },
    td: { name: "真心话大冒险", icon: "🎡", desc: "转盘随机选一个人，选真心话或大冒险" }
  };
  function allPlayers() {
    const out = [];
    for (const m of R.members.values()) {
      out.push({ pid: m.uid, name: m.name, av: m.av || "", owner: m.uid, isChar: false });
      if (m.char) out.push({ pid: `c:${m.uid}:${m.char.id}`, name: m.char.name, av: m.char.av || "", owner: m.uid, isChar: true, ownerName: m.name });
    }
    return out;
  }
  function broadcastGame() {
    R.ch?.send("game", { game: R.game });
    drawGame();
    void charGameTurn();
  }
  function startGame(kind) {
    if (!amHost()) {
      R.ch?.send("act", { type: "start", kind, from: myUid });
      toast("已经请房主开始");
      return;
    }
    const players = allPlayers();
    if (players.length < 2) return toast("至少要两个人（带上角色也算）才能玩");
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
    sysMsg(`${GAMES[kind].icon} 开始玩「${GAMES[kind].name}」！参加的有：${players.map((p) => p.name).join("、")}`);
    broadcastGame();
  }
  function endGame(text, extra) {
    if (text) sysMsg(text, extra);
    R.game = null;
    broadcastGame();
  }
  function act(type, value, pid) {
    if (!R.game) return;
    const a = { type, value, pid: pid || myUid, gid: R.game.id, from: myUid };
    if (amHost()) hostAct(a);
    else R.ch?.send("act", a);
  }
  function hostAct(a) {
    if (a.type === "start") {
      if (!R.game && GAMES[a.kind]) startGame(a.kind);
      return;
    }
    const g = R.game;
    if (!g || a.gid !== g.id) return;
    const pl = g.players.find((p) => p.pid === a.pid);
    if (!pl || pl.owner !== a.from) return; // 只能操作自己 / 自己带来的角色
    if (g.kind === "dice" && a.type === "roll" && g.phase === "play") {
      if (g.rolls[pl.pid]) return;
      const d1 = 1 + Math.floor(Math.random() * 6);
      const d2 = 1 + Math.floor(Math.random() * 6);
      g.rolls[pl.pid] = [d1, d2];
      hostTick();
    } else if (g.kind === "bomb" && a.type === "guess" && g.phase === "play") {
      const cur = g.players[g.turn % g.players.length];
      if (cur.pid !== pl.pid) return;
      const n = Math.round(Number(a.value));
      if (!(n >= g.lo && n <= g.hi)) return;
      if (n === g.secret) {
        g.phase = "over";
        endGame(`💥 ${pl.name} 猜了 ${n}，被炸弹炸到啦！惩罚：${Math.random() < 0.5 ? "真心话 · " + pick(TRUTH) : "大冒险 · " + pick(DARE)}`, { gameEnd: true, involves: [pl.name] });
        return;
      }
      if (n < g.secret) g.lo = n + 1;
      else g.hi = n - 1;
      g.log.push(`${pl.name} 猜 ${n}`);
      if (g.lo === g.hi) {
        const next = g.players[(g.turn + 1) % g.players.length];
        endGame(`💥 只剩 ${g.lo} 了，${next.name} 躲不掉，被炸到啦！惩罚：${pick(DARE)}`, { gameEnd: true, involves: [next.name] });
        return;
      }
      g.turn++;
      broadcastGame();
    } else if (g.kind === "td" && a.type === "choose" && g.phase === "play") {
      if (g.target !== pl.pid || g.choice) return;
      g.choice = a.value === "dare" ? "dare" : "truth";
      g.q = g.choice === "dare" ? pick(DARE) : pick(TRUTH);
      g.phase = "answer";
      sysMsg(`🎡 ${pl.name} 选了${g.choice === "dare" ? "大冒险" : "真心话"}：${g.q}`, { gameEnd: true, involves: [pl.name], tdq: g.q, tdFor: pl.pid });
      broadcastGame();
    } else if (g.kind === "td" && a.type === "done") {
      endGame("");
    } else if (g.kind === "td" && a.type === "again") {
      g.target = pick(g.players).pid;
      g.choice = "";
      g.q = "";
      g.phase = "play";
      broadcastGame();
    }
  }
  function hostTick() {
    const g = R.game;
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
        endGame(`🎲 ${res}。\n最大的是 ${winners.map((p) => p.name).join("、")}，最小的是 ${losers.map((p) => p.name).join("、")}！惩罚：${pun}`, { gameEnd: true, involves: losers.map((p) => p.name) });
        return;
      }
    }
    broadcastGame();
  }
  /** 轮到我带来的角色：自动行动 */
  let charGameTimer = 0;
  const answered = new Set();
  async function charGameTurn() {
    const g = R.game;
    const c = R.myChar;
    if (!g || !c) return;
    const me = g.players.find((p) => p.isChar && p.owner === myUid);
    if (!me) return;
    clearTimeout(charGameTimer);
    if (g.kind === "dice" && g.phase === "play" && !g.rolls?.[me.pid]) {
      charGameTimer = setTimeout(() => act("roll", null, me.pid), 1200 + Math.random() * 1800);
    }
    if (g.kind === "bomb" && g.phase === "play" && g.players[g.turn % g.players.length]?.pid === me.pid) {
      charGameTimer = setTimeout(() => {
        const n = g.lo + Math.floor(Math.random() * (g.hi - g.lo + 1));
        act("guess", n, me.pid);
      }, 1500 + Math.random() * 1500);
    }
    if (g.kind === "td" && g.phase === "play" && g.target === me.pid && !g.choice) {
      charGameTimer = setTimeout(() => act("choose", Math.random() < 0.5 ? "truth" : "dare", me.pid), 1600);
    }
    const ansKey = g.id + ":" + g.q;
    if (g.kind === "td" && g.phase === "answer" && g.target === me.pid && !answered.has(ansKey)) {
      answered.add(ansKey);
      if (!F.hasApiKey()) return sendAsChar(g.choice === "dare" ? "……好吧，我做就是了。" : "这个嘛……秘密。");
      try {
        const reply = await F.aiText(
          [
            { role: "system", content: `你是「${c.name}」。${c.persona ? "人设：\n" + c.persona + "\n" : ""}你在多人联机房间里玩真心话大冒险。用你的人设回答，口语、简短（一到三句），可以害羞、耍赖或认真。不要加名字前缀。` },
            { role: "user", content: `你抽到了${g.choice === "dare" ? "大冒险" : "真心话"}：「${g.q}」。现在完成它。` }
          ],
          { maxTokens: 300, temperature: 0.95 }
        );
        sendAsChar(reply);
        R.charLast = Date.now();
      } catch (_) {
        sendAsChar("……这个我跳过！");
      }
    }
  }

  /* ───── 界面 ───── */
  function render() {
    if (!root) return;
    if (!R.code) return drawLobby();
    root.innerHTML = `<div class="net-room">
      <div class="net-head" id="net-head"></div>
      <div class="net-game" id="net-game"></div>
      <div class="net-list" id="net-list"></div>
      <form class="net-bar"><button type="button" class="net-ico" data-a="games" title="小游戏">🎲</button><input type="text" maxlength="500" placeholder="说点什么…（@角色名 可以叫 TA）" enterkeyhint="send" /><button type="submit" class="fun-btn solid sm">发送</button></form>
    </div>`;
    R.unread = 0;
    drawHead();
    drawGame();
    drawMsgs();
    const inp = root.querySelector(".net-bar input");
    root.querySelector(".net-bar").addEventListener("submit", (e) => {
      e.preventDefault();
      sendText(inp.value);
      inp.value = "";
    });
  }
  function drawLobby() {
    root.innerHTML = `<div class="net-lobby">
      <div class="net-hero"><span>🌐</span><h3>和别的 Meow 用户一起玩</h3><p>建个房间把房间号发给朋友，或者去公共大厅随便聊聊。每个人都可以带上自己的一个角色，TA 会一起聊天、一起玩游戏。</p></div>
      <button type="button" class="fun-btn solid wide" data-a="create">＋ 新建房间</button>
      <div class="net-join"><input type="text" id="net-code" maxlength="6" placeholder="输入 6 位房间号" autocapitalize="characters" /><button type="button" class="fun-btn ghost" data-a="join">加入</button></div>
      <button type="button" class="fun-btn ghost wide" data-a="public">🏛 去公共大厅</button>
      <p class="fun-note">聊天内容只在大家的手机之间传，不会存到服务器上；角色说话用的是 TA 主人自己的 AI。公共大厅里都是陌生人，注意保护隐私，不想看到的人可以点头像屏蔽。</p>
    </div>`;
  }
  function drawHead() {
    const h = root?.querySelector("#net-head");
    if (!h) return;
    const st = { online: "在线", connecting: "连接中…", reconnecting: "重新连接中…", error: "连接出错", nocfg: "没配置" }[R.status] || "";
    const mem = [...R.members.values()];
    h.innerHTML = `<div class="net-top"><div><strong>${R.code === PUBLIC ? "公共大厅" : "房间 " + esc(R.code)}</strong><small class="net-st ${R.status}">${st} · ${mem.length} 人${amHost() ? " · 你是房主" : ""}</small></div>
      ${R.code !== PUBLIC ? `<button type="button" class="fun-btn ghost sm" data-a="copy">复制房间号</button>` : ""}<button type="button" class="fun-btn ghost sm" data-a="leave">退出</button></div>
      <div class="net-mems">${mem
        .map(
          (m) =>
            `<span class="net-mem" data-uid="${esc(m.uid)}">${F.avHtml({ name: m.name, avatar: m.av }, "fun-av sm")}<b>${esc(m.name)}${m.uid === hostUid() ? " 👑" : ""}</b>${m.char ? `<i>+ ${esc(m.char.name)}</i>` : ""}</span>`
        )
        .join("")}</div>
      <div class="net-charbar">${
        R.myChar
          ? `${F.avHtml({ name: R.myChar.name, avatar: R.myChar.av }, "fun-av sm")}<span>带着 <b>${esc(R.myChar.name)}</b>${F.hasApiKey() ? "" : "（没填 API Key，TA 只能玩游戏不能聊天）"}</span><label class="net-auto"><input type="checkbox" ${R.charAuto ? "checked" : ""} data-a="auto" />会主动接话</label><button type="button" data-a="char">换</button>`
          : `<span>还没带角色进来</span><button type="button" data-a="char">带上我的角色</button>`
      }</div>`;
  }
  function drawGame() {
    const box = root?.querySelector("#net-game");
    if (!box) return;
    const g = R.game;
    if (!g) {
      box.innerHTML = "";
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const mine = g.players.filter((p) => p.owner === myUid && !p.isChar);
    const meP = mine[0];
    let body = "";
    if (g.kind === "dice") {
      body = `<div class="net-dice">${g.players.map((p) => `<span class="${g.rolls[p.pid] ? "done" : ""}">${esc(p.name)}<b>${g.rolls[p.pid] ? g.rolls[p.pid].map((n) => "⚀⚁⚂⚃⚄⚅"[n - 1]).join("") : "…"}</b></span>`).join("")}</div>
        ${meP && !g.rolls[meP.pid] ? `<button type="button" class="fun-btn solid" data-a="roll">🎲 掷骰子</button>` : `<small>等其他人掷…</small>`}`;
    } else if (g.kind === "bomb") {
      const cur = g.players[g.turn % g.players.length];
      const myTurn = cur && cur.owner === myUid && !cur.isChar;
      body = `<div class="net-bomb"><b>${g.lo}</b> ~ <b>${g.hi}</b></div><small>轮到：${esc(cur?.name || "")}${g.log.length ? " · 刚才：" + esc(g.log.slice(-2).join("，")) : ""}</small>
        ${myTurn ? `<div class="net-guess"><input type="number" id="net-gn" min="${g.lo}" max="${g.hi}" placeholder="${g.lo}~${g.hi}" /><button type="button" class="fun-btn solid sm" data-a="guess">猜</button></div>` : ""}`;
    } else if (g.kind === "td") {
      const t = g.players.find((p) => p.pid === g.target);
      const mineT = t && t.owner === myUid && !t.isChar;
      body = `<div class="net-td">🎡 转到了 <b>${esc(t?.name || "")}</b>${g.q ? `<p>${g.choice === "dare" ? "大冒险" : "真心话"}：${esc(g.q)}</p>` : ""}</div>
        ${mineT && !g.choice ? `<div class="ww-row"><button type="button" class="fun-btn ghost sm" data-a="truth">真心话</button><button type="button" class="fun-btn solid sm" data-a="dare">大冒险</button></div>` : ""}
        ${g.phase === "answer" && amHost() ? `<div class="ww-row"><button type="button" class="fun-btn ghost sm" data-a="tdagain">再转一次</button><button type="button" class="fun-btn ghost sm" data-a="tdend">结束游戏</button></div>` : ""}`;
    }
    box.innerHTML = `<div class="net-gh"><strong>${GAMES[g.kind].icon} ${GAMES[g.kind].name}</strong>${amHost() ? `<button type="button" data-a="gend">结束</button>` : ""}</div>${body}`;
  }
  function drawMsgs() {
    const box = root?.querySelector("#net-list");
    if (!box) return;
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.innerHTML =
      R.msgs
        .map((m) => {
          if (m.sys) return `<p class="net-sys">${esc(m.text).replace(/\n/g, "<br/>")}</p>`;
          const mine = m.from?.uid === myUid && !m.from?.isChar;
          return `<div class="net-msg ${mine ? "me" : ""} ${m.from?.isChar ? "char" : ""}" data-uid="${esc(m.from?.uid || "")}">${F.avHtml({ name: m.from?.name, avatar: m.from?.av }, "fun-av sm")}<div><small>${esc(m.from?.name || "")}${m.from?.isChar ? `<em>${esc(m.from.owner || "")}的角色</em>` : ""}</small><p>${esc(m.text)}</p></div></div>`;
        })
        .join("") || `<p class="net-sys">房间里还很安静，打个招呼吧～</p>`;
    if (near || R.msgs.length < 3) box.scrollTop = box.scrollHeight;
  }

  async function pickChar() {
    const cast = await F.loadCast();
    if (!cast.length) return toast("角色库里还没有角色");
    const sh = F.openSheet(
      `<div class="mm-to">${cast.map((c) => `<button type="button" class="pt-person${R.myChar?.id === c.id ? " is-on" : ""}" data-char="${esc(c.id)}">${F.avHtml(c, "fun-av")}<strong>${esc(c.name)}</strong></button>`).join("")}</div>
       ${R.myChar ? `<div class="fun-sheet-actions"><button type="button" class="fun-btn ghost" data-a="nochar">不带角色了</button></div>` : ""}
       <p class="fun-note">TA 会用你自己的 AI 在房间里说话，别人看到的是 TA 的名字和头像（不会把完整人设发给别人）。</p>`,
      { title: "带哪个角色进房间？" }
    );
    sh.body.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-char]");
      if (e.target.closest("[data-a=nochar]")) {
        R.myChar = null;
        R.ch?.track(myMeta());
        R.members.set(myUid, myMeta());
        sh.close();
        drawHead();
        return;
      }
      if (!b) return;
      const c = cast.find((x) => x.id === b.dataset.char);
      sh.close();
      R.myChar = { id: c.id, name: c.name, persona: c.persona, av: await thumb(c.avatar) };
      R.ch?.track(myMeta());
      R.members.set(myUid, myMeta());
      drawHead();
      sysMsg(`${R.me.name} 把 ${c.name} 带进了房间`);
    });
  }
  function pickGame() {
    const sh = F.openSheet(
      `<div class="net-games">${Object.entries(GAMES)
        .map(([k, g]) => `<button type="button" data-g="${k}"><span>${g.icon}</span><strong>${g.name}</strong><small>${g.desc}</small></button>`)
        .join("")}</div><p class="fun-note">${R.game ? "正在玩别的游戏，先结束才能开新的。" : amHost() ? "你是房主，点了就开始。" : "你不是房主，点了会请房主开始。"}所有人和大家带来的角色都会一起参加。</p>`,
      { title: "一起玩" }
    );
    sh.body.addEventListener("click", (e) => {
      const b = e.target.closest("[data-g]");
      if (!b || R.game) return;
      sh.close();
      startGame(b.dataset.g);
    });
  }

  function onClick(e) {
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "create") return void joinRoom(newCode());
    if (a === "public") return void joinRoom(PUBLIC);
    if (a === "join") {
      const v = root.querySelector("#net-code").value.trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(v)) return toast("房间号是 6 位字母或数字");
      return void joinRoom(v);
    }
    if (a === "leave") return leaveRoom();
    if (a === "copy") {
      navigator.clipboard?.writeText(`来 Meow 联机找我玩！打开「联机」输入房间号：${R.code}`).then(
        () => toast("已复制，发给朋友吧"),
        () => toast("房间号：" + R.code)
      );
      return;
    }
    if (a === "char") return void pickChar();
    if (a === "auto") {
      R.charAuto = e.target.checked;
      return;
    }
    if (a === "games") return pickGame();
    if (a === "gend") return endGame("房主结束了游戏");
    if (a === "roll") return act("roll");
    if (a === "guess") {
      const n = Number(root.querySelector("#net-gn")?.value);
      const g = R.game;
      if (!g || !(n >= g.lo && n <= g.hi)) return toast(`要猜 ${g?.lo}~${g?.hi} 之间的数`);
      return act("guess", n);
    }
    if (a === "truth" || a === "dare") return act("choose", a);
    if (a === "tdagain") return act("again");
    if (a === "tdend") return act("done");
    // 点别人头像：屏蔽 / 取消屏蔽
    const mu = e.target.closest(".net-msg:not(.me) .fun-av, .net-mem")?.closest("[data-uid]");
    if (mu && mu.dataset.uid && mu.dataset.uid !== myUid) {
      const u = mu.dataset.uid;
      const name = R.members.get(u)?.name || "TA";
      const sh = F.openSheet(
        `<p class="fun-note">${muted.has(u) ? `已经屏蔽了 ${esc(name)}。` : `屏蔽之后，${esc(name)} 和 TA 的角色说的话你都看不到了。`}</p><div class="fun-sheet-actions"><button type="button" class="fun-btn solid" data-m="1">${muted.has(u) ? "取消屏蔽" : "屏蔽 TA"}</button></div>`,
        { title: name }
      );
      sh.body.querySelector("[data-m]").onclick = () => {
        if (muted.has(u)) muted.delete(u);
        else {
          muted.add(u);
          R.msgs = R.msgs.filter((m) => m.from?.uid !== u);
        }
        saveMute();
        sh.close();
        drawMsgs();
      };
    }
  }

  F.register("联机", {
    title: "联机",
    kicker: "ONLINE",
    async mount(body) {
      root = document.createElement("div");
      root.className = "net";
      body.appendChild(root);
      root.addEventListener("click", onClick);
      render();
    },
    unmount() {
      root = null;
    }
  });
  window.XXJ_NET = { state: R, join: joinRoom, leave: leaveRoom, uid: () => myUid };
})();
