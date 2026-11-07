"use strict";

/**
 * 娱乐模块 · 公共层 + 音乐
 * - 统一的全屏页面 #fun-screen（音乐 / UNO / 狼人杀 / 短视频共用）
 * - 公共工具：转义、角色读取、AI 调用、底部弹层、选角色
 * - 音乐：本地上传 / 链接，歌单存 IndexedDB(xxj_fun)，桌面迷你播放条
 * 其它玩法在 fun-uno.js / fun-wolf.js / fun-video.js 中通过 XXJ_FUN.register 注册。
 */
(function () {
  const phone = document.getElementById("phone") || document.body;

  /* ───────────── 工具 ───────────── */
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const toast = (t) => {
    if (typeof showToast === "function") showToast(t);
    else console.log("[fun]", t);
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rnd(a.length)];
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = rnd(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const hue = (name) => {
    let h = 0;
    const s = String(name || "?");
    for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
    return Math.abs(h) % 360;
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const fmtTime = (sec) => {
    if (!Number.isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ":" + String(s).padStart(2, "0");
  };

  function avHtml(p, cls) {
    const c = cls || "fun-av";
    const name = String(p?.name || "?");
    if (p?.avatar) return `<span class="${c} ${c}--img"><img src="${esc(p.avatar)}" alt="" loading="lazy" /></span>`;
    return `<span class="${c}" style="--av-h:${hue(name)}">${esc(name.slice(0, 1))}</span>`;
  }

  /* ───────────── 本地存储（独立库，不碰主库） ───────────── */
  const FunDB = (() => {
    let opening = null;
    function open() {
      if (opening) return opening;
      opening = new Promise((res, rej) => {
        const r = indexedDB.open("xxj_fun", 1);
        r.onupgradeneeded = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains("tracks")) db.createObjectStore("tracks", { keyPath: "id" });
          if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      return opening;
    }
    async function run(store, mode, fn) {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        let out;
        if (req) req.onsuccess = () => (out = req.result);
        t.oncomplete = () => res(out);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      });
    }
    return {
      allTracks: () => run("tracks", "readonly", (s) => s.getAll()),
      putTrack: (v) => run("tracks", "readwrite", (s) => s.put(v)),
      delTrack: (id) => run("tracks", "readwrite", (s) => s.delete(id)),
      get: (k) => run("kv", "readonly", (s) => s.get(k)),
      set: (k, v) => run("kv", "readwrite", (s) => s.put(v, k))
    };
  })();

  /* ───────────── 角色 / 用户 ───────────── */
  async function resolveImg(u) {
    const s = String(u || "").trim();
    if (!s) return "";
    try {
      if (window.XXJ_MEDIA && window.XXJ_MEDIA.isBlobRef(s)) return (await window.XXJ_MEDIA.resolveDisplayUrl(s)) || "";
    } catch (_) {
      return "";
    }
    return s;
  }

  async function loadCast() {
    try {
      if (typeof ensureCharPersonaStoreHydrated === "function") await ensureCharPersonaStoreHydrated();
    } catch (_) {
      /* ignore */
    }
    let st = { items: [] };
    try {
      if (typeof readCharPersonaStore === "function") st = readCharPersonaStore();
      else if (typeof window.readCharPersonaStore === "function") st = window.readCharPersonaStore();
    } catch (_) {
      /* ignore */
    }
    const items = (Array.isArray(st?.items) ? st.items : []).filter((x) => String(x?.displayName || "").trim());
    return Promise.all(
      items.map(async (x) => ({
        id: String(x.id),
        name: String(x.displayName).trim(),
        persona: [x.summary, x.tags && "标签：" + x.tags, x.voice && "说话方式：" + x.voice]
          .filter((v) => String(v || "").trim())
          .join("\n")
          .slice(0, 700),
        avatar: await resolveImg(x.avatar),
        look: String(x.charImageGenPrompt || "").slice(0, 600)
      }))
    );
  }

  async function loadUser() {
    let m = null;
    try {
      if (typeof readUserMask === "function") m = readUserMask();
    } catch (_) {
      /* ignore */
    }
    return {
      name: String(m?.displayName || m?.name || "").trim() || "我",
      avatar: await resolveImg(m?.avatar),
      persona: String(m?.persona || m?.summary || "").slice(0, 300)
    };
  }

  /* ───────────── AI ───────────── */
  function hasApiKey() {
    try {
      return !!String(window.RP_AI?.getConfig()?.apiKey || "").trim();
    } catch (_) {
      return false;
    }
  }

  async function aiText(messages, opts) {
    const o = opts || {};
    const ai = window.RP_AI;
    if (!ai) throw new Error("AI 模块未加载");
    const body = { messages, max_tokens: o.maxTokens || 800 };
    if (o.temperature != null) body.temperature = o.temperature;
    const data = await ai.chatCompletions(body, o.signal ? { signal: o.signal } : undefined);
    let t =
      typeof readChatCompletionChoiceText === "function"
        ? readChatCompletionChoiceText(data)
        : String(data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || "");
    t = String(t || "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim();
    if (!t) throw new Error("模型没有返回内容");
    return t;
  }

  function parseJsonLoose(text) {
    let t = String(text || "").trim();
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    try {
      return JSON.parse(t);
    } catch (_) {
      /* 继续尝试截取 */
    }
    const firstArr = t.indexOf("[");
    const firstObj = t.indexOf("{");
    const candidates = [];
    if (firstArr >= 0) candidates.push([firstArr, t.lastIndexOf("]")]);
    if (firstObj >= 0) candidates.push([firstObj, t.lastIndexOf("}")]);
    candidates.sort((a, b) => a[0] - b[0]);
    for (const [s, e] of candidates) {
      if (e > s) {
        try {
          return JSON.parse(t.slice(s, e + 1));
        } catch (_) {
          /* next */
        }
      }
    }
    return null;
  }

  /** 去掉模型常加的引号、「名字：」前缀 */
  const cleanLine = (t, max, name) => {
    let s = String(t || "").trim();
    if (name) {
      const n = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      s = s.replace(new RegExp("^(?:\\d+号)?\\s*" + n + "\\s*[：:]\\s*"), "");
    }
    s = s.replace(/^\d+号\s*[：:]\s*/, "");
    s = s.replace(/^["“「『]+|["”」』]+$/g, "").trim();
    return s.slice(0, max || 200);
  };

  /* ───────────── 生图（复用「设置 → 生图」里配置的接口） ───────────── */
  function imageGenConfig() {
    try {
      return typeof readImageGenConfig === "function" ? readImageGenConfig() : null;
    } catch (_) {
      return null;
    }
  }
  function hasImageGen() {
    const c = imageGenConfig();
    return !!(c && String(c.apiKey || "").trim() && typeof executeImageGenRequestToDataUrl === "function");
  }
  function shrinkDataUrl(dataUrl, max) {
    return new Promise((resolve) => {
      const im = new Image();
      im.onload = () => {
        const s = Math.min(1, (max || 900) / Math.max(im.width, im.height));
        const c = document.createElement("canvas");
        c.width = Math.round(im.width * s);
        c.height = Math.round(im.height * s);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.86));
      };
      im.onerror = () => resolve(dataUrl);
      im.src = dataUrl;
    });
  }
  /**
   * 根据一段中文场景生成配图：先让聊天模型写英文生图提示词（带上出场角色的外貌 tag），再调生图接口
   * @param {string} scene 场景描述
   * @param {{ chars?: {name:string, look?:string}[], style?: string }} [o]
   */
  async function genImage(scene, o) {
    const opt = o || {};
    if (!hasImageGen()) throw new Error("还没配置生图：去「设置 → 生图」填好接口和 Key");
    const cfg = imageGenConfig();
    let prompt = scene;
    if (hasApiKey()) {
      const looks = (opt.chars || []).filter((c) => c && c.look).map((c) => `${c.name}: ${c.look}`).join("\n");
      try {
        prompt = await aiText(
          [
            { role: "system", content: "You write prompts for an image generation model. Output ONE English prompt only: comma-separated tags/phrases describing subject, action, setting, lighting, composition, style. No explanations." },
            { role: "user", content: `Scene (Chinese):\n${scene}\n${looks ? `\nCharacter appearance tags (keep them):\n${looks}` : ""}${opt.style ? `\nStyle: ${opt.style}` : ""}` }
          ],
          { maxTokens: 400 }
        );
      } catch (_) {
        prompt = scene;
      }
    }
    const r = await executeImageGenRequestToDataUrl(cfg, String(prompt).slice(0, 1500), {});
    if (!r || !r.ok || !r.dataUrl) throw new Error(r?.error || "生图失败");
    return shrinkDataUrl(r.dataUrl, 900);
  }

  /* ───────────── 全屏页面 + 弹层 ───────────── */
  const screen = document.createElement("section");
  screen.className = "fun-screen";
  screen.id = "fun-screen";
  screen.setAttribute("aria-hidden", "true");
  screen.innerHTML = `
    <header class="fun-top">
      <button type="button" class="fun-back" id="fun-back" aria-label="返回桌面"><i class="ph ph-caret-left"></i></button>
      <div class="fun-top-t"><small id="fun-kicker"></small><strong id="fun-title"></strong></div>
      <div class="fun-top-act" id="fun-top-act"></div>
    </header>
    <main class="fun-body" id="fun-body"></main>
    <div class="fun-sheet-host" id="fun-sheet-host"></div>`;
  phone.appendChild(screen);
  const bodyEl = screen.querySelector("#fun-body");
  const actEl = screen.querySelector("#fun-top-act");
  const sheetHost = screen.querySelector("#fun-sheet-host");
  // 娱乐页面没打开时（比如在角色、装扮页里弹窗），用盖在整个手机上的弹层
  const globalSheetHost = document.createElement("div");
  globalSheetHost.className = "fun-sheet-host fun-sheet-host--global";
  phone.appendChild(globalSheetHost);

  const apps = {};
  let current = null;

  function register(key, app) {
    apps[key] = app;
  }

  function closeOtherScreens() {
    const names = [
      "closeSettings",
      "closeMyScreen",
      "closeCharScreen",
      "closeChatScreen",
      "closeChatListScreen",
      "closeCheckupScreen",
      "closeRelationScreen",
      "closeRoleplayScreen",
      "closeRoamScreen",
      "closeStickerScreen",
      "closeWardrobeScreen",
      "closeWorldBookScreen",
      "closeForumScreen"
    ];
    for (const n of names) {
      try {
        const fn = window[n] || (typeof globalThis[n] === "function" ? globalThis[n] : null);
        if (typeof fn === "function") fn();
      } catch (_) {
        /* ignore */
      }
    }
    document.getElementById("drawer")?.classList.remove("open");
  }

  function openFunApp(key) {
    const app = apps[key];
    if (!app) {
      toast("模块未加载");
      return;
    }
    closeOtherScreens();
    if (current && current !== app && current.unmount) current.unmount();
    current = app;
    sheetHost.innerHTML = "";
    actEl.innerHTML = "";
    bodyEl.innerHTML = "";
    screen.className = "fun-screen" + (app.theme ? " fun-screen--" + app.theme : "");
    screen.querySelector("#fun-kicker").textContent = app.kicker || "";
    screen.querySelector("#fun-title").textContent = app.title || key;
    screen.classList.add("is-open");
    screen.setAttribute("aria-hidden", "false");
    app.mount(bodyEl, actEl);
    syncMini();
  }

  function closeFunScreen() {
    if (current && current.unmount) current.unmount();
    current = null;
    sheetHost.innerHTML = "";
    bodyEl.innerHTML = "";
    screen.classList.remove("is-open");
    screen.setAttribute("aria-hidden", "true");
    syncMini();
  }

  // 输入框聚焦 / 键盘弹出时浏览器可能把整个 #phone 滚上去，露出底下的抽屉；娱乐页打开期间保持复位
  phone.addEventListener(
    "scroll",
    () => {
      if (screen.classList.contains("is-open") && phone.scrollTop) phone.scrollTop = 0;
    },
    { passive: true }
  );

  screen.querySelector("#fun-back").addEventListener("click", () => {
    if (current && typeof current.back === "function") {
      const fn = current.back;
      closeFunScreen();
      fn();
    } else if (current && current.parent && apps[current.parent]) openFunApp(current.parent);
    else closeFunScreen();
  });

  /* ───────────── 战绩 ───────────── */
  let records = null;
  async function loadRecords() {
    if (records) return records;
    try {
      records = (await FunDB.get("game_records")) || [];
    } catch (_) {
      records = [];
    }
    return records;
  }
  /** @param {{game:string, players:string[], winner:string, userWon:boolean, note?:string}} r */
  async function addRecord(r) {
    await loadRecords();
    records.push({ ...r, at: Date.now() });
    if (records.length > 300) records = records.slice(-300);
    FunDB.set("game_records", records).catch(() => {});
  }
  /** 给 AI 用的「和某角色的过往战绩」 */
  function recordSummary(name) {
    if (!records || !name) return "";
    const mine = records.filter((r) => r.players.includes(name));
    if (!mine.length) return "";
    const by = {};
    for (const r of mine) {
      const g = (by[r.game] = by[r.game] || { n: 0, userWin: 0, selfWin: 0 });
      g.n++;
      if (r.userWon) g.userWin++;
      if (r.winner === name) g.selfWin++;
    }
    const parts = Object.entries(by).map(([g, v]) => `${g}一起玩过${v.n}局（对方赢${v.userWin}局，你赢${v.selfWin}局）`);
    const last = mine[mine.length - 1];
    return `你们之前的游戏战绩：${parts.join("；")}。上一局是${last.game}，${last.winner}赢了${last.note ? "（" + last.note + "）" : ""}。可以自然地提起（比如记仇、炫耀、想报仇），但别每句都提。`;
  }
  void loadRecords();

  function openSheet(inner, opts) {
    const o = opts || {};
    const wrap = document.createElement("div");
    wrap.className = "fun-sheet";
    wrap.innerHTML = `<div class="fun-sheet-mask"></div>
      <div class="fun-sheet-card">
        <div class="fun-sheet-grab"></div>
        ${o.title ? `<h3 class="fun-sheet-title">${esc(o.title)}</h3>` : ""}
        <div class="fun-sheet-body">${inner}</div>
      </div>`;
    (screen.classList.contains("is-open") ? sheetHost : globalSheetHost).appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add("is-open"));
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      wrap.classList.remove("is-open");
      setTimeout(() => wrap.remove(), 220);
      if (o.onClose) o.onClose();
    };
    if (!o.modal) wrap.querySelector(".fun-sheet-mask").addEventListener("click", close);
    return { el: wrap, body: wrap.querySelector(".fun-sheet-body"), close };
  }

  /** 选角色：返回所选角色数组；取消返回 null */
  function pickCast(cast, opts) {
    const o = opts || {};
    const min = o.min || 1;
    const max = o.max || cast.length;
    return new Promise((resolveRaw) => {
      let done = false;
      const resolve = (v) => {
        if (done) return;
        done = true;
        resolveRaw(v);
      };
      const selected = new Set(o.preselect || []);
      const sh = openSheet(
        `<p class="fun-note">${esc(o.note || `选择 ${min}${max > min ? "~" + max : ""} 位角色`)}</p>
         <div class="fun-cast-list">${cast
           .map(
             (c) => `<button type="button" class="fun-cast-item" data-id="${esc(c.id)}">
               ${avHtml(c)}<span class="fun-cast-name">${esc(c.name)}</span><i class="fun-check"></i></button>`
           )
           .join("")}</div>
         <div class="fun-sheet-actions">
           <button type="button" class="fun-btn ghost" data-act="cancel">取消</button>
           <button type="button" class="fun-btn solid" data-act="ok">确定</button>
         </div>`,
        { title: o.title || "选择角色", onClose: () => resolve(null) }
      );
      const sync = () => {
        sh.body.querySelectorAll(".fun-cast-item").forEach((b) => b.classList.toggle("is-on", selected.has(b.dataset.id)));
        const ok = sh.body.querySelector('[data-act="ok"]');
        ok.disabled = selected.size < min || selected.size > max;
        ok.textContent = `确定 (${selected.size})`;
      };
      sh.body.addEventListener("click", (e) => {
        const item = e.target.closest(".fun-cast-item");
        if (item) {
          const id = item.dataset.id;
          if (selected.has(id)) selected.delete(id);
          else if (selected.size < max) selected.add(id);
          else toast(`最多选 ${max} 位`);
          sync();
          return;
        }
        const act = e.target.closest("[data-act]")?.dataset.act;
        if (act === "cancel") sh.close();
        if (act === "ok") {
          resolve(cast.filter((c) => selected.has(c.id)));
          sh.close();
        }
      });
      sync();
    });
  }

  /* ───────────── 音乐 ───────────── */
  const audio = new Audio();
  audio.preload = "metadata";
  const music = {
    tracks: [],
    idx: -1,
    mode: "loop", // loop | one | shuffle
    objUrl: "",
    loaded: false,
    showLyrics: false,
    lrc: [], // [{t, text}]
    lrcIdx: -1,
    buddy: null, // 一起听的角色
    buddyLog: [], // [{who:'me'|'buddy', text}]
    buddyBusy: false,
    buddyTimer: 0
  };
  const MODE_META = {
    loop: { icon: "ph-repeat", label: "列表循环" },
    one: { icon: "ph-repeat-once", label: "单曲循环" },
    shuffle: { icon: "ph-shuffle", label: "随机播放" }
  };

  async function loadTracks() {
    if (music.loaded) return;
    try {
      const all = (await FunDB.allTracks()) || [];
      music.tracks = all.sort((a, b) => (a.order ?? a.addedAt) - (b.order ?? b.addedAt));
      const saved = await FunDB.get("music_state");
      if (saved && saved.mode && MODE_META[saved.mode]) music.mode = saved.mode;
    } catch (err) {
      console.warn("[fun] load tracks", err);
    }
    music.loaded = true;
  }

  function saveMusicState() {
    FunDB.set("music_state", { mode: music.mode }).catch(() => {});
  }

  function parseName(fileName) {
    const base = String(fileName || "").replace(/\.[a-z0-9]{2,5}$/i, "").trim();
    const m = base.split(/\s+-\s+|\s*-\s*/);
    if (m.length >= 2) return { artist: m[0].trim(), title: m.slice(1).join(" - ").trim() };
    return { title: base || "未命名", artist: "" };
  }

  /** 网易云歌曲 id：支持歌曲页、手机分享页、带 #/ 的网页版链接 */
  function neteaseId(text) {
    const s = String(text || "");
    const m = s.match(/music\.163\.com\/[^\s]*?[?&#/]id=(\d+)/) || s.match(/music\.163\.com\/(?:#\/)?song\/(\d+)/) || s.match(/music\.163\.com\/song\/media\/outer\/url\?id=(\d+)/);
    return m ? m[1] : "";
  }
  function normalizeMusicUrl(raw) {
    const u = String(raw || "").trim();
    // 网易云官方外链：免费歌曲可以完整播放
    const id = neteaseId(u);
    if (id) return `https://music.163.com/song/media/outer/url?id=${id}.mp3`;
    return u;
  }
  /** VIP / 受限歌曲：跳到网易云 App（或网页版）用自己的会员听完整版 */
  function openInNetease(t, failed) {
    const id = neteaseId(t.url);
    if (!id) return;
    const sh = openSheet(
      `<p class="fm-ne-tip">${failed ? `《${esc(t.title)}》是 VIP 或版权受限歌曲，网页里放不了。<br/>` : ""}可以在网易云里用你自己的会员听完整版。</p>
       <a class="fun-btn solid wide fm-ne-btn" href="https://music.163.com/song?id=${id}" target="_blank" rel="noopener">在网易云里打开</a>
       <p class="fun-note">手机上装了网易云 App 会直接跳过去；没装的话会打开网页版。听完切回 Meow OS 就行。</p>`,
      { title: "🎵 去网易云听" }
    );
    sh.body.querySelector("a").addEventListener("click", () => setTimeout(() => sh.close(), 300));
  }

  /** 从网易云 App 的分享文字里拆出链接、歌名、歌手 */
  function parseShareText(text) {
    const s = String(text || "").trim();
    const url = (s.match(/https?:\/\/[^\s，。、"'）)]+/) || [""])[0];
    const title = (s.match(/《([^》]+)》/) || [])[1] || "";
    const artist = (s.match(/分享(.+?)的(?:单曲|歌曲)/) || [])[1] || "";
    return { url, title, artist, isShort: /163cn\.tv|y\.music\.163\.com\/m\/[a-z]/i.test(url) && !neteaseId(url) };
  }

  /** 在网易云里搜（装了 App 会跳 App，否则打开网页版） */
  const neSearchUrl = (q) => `https://music.163.com/#/search/m/?s=${encodeURIComponent(q)}&type=1`;
  let neWaitingPaste = false;
  function goNeSearch(q) {
    neWaitingPaste = true;
    window.open(neSearchUrl(q), "_blank", "noopener");
  }
  /** 把网易云分享文字加进歌单并播放；成功返回 true */
  async function addFromShareText(text, extra) {
    const share = parseShareText(text);
    if (!share.url || !/163/.test(share.url)) return false;
    if (share.isShort) {
      toast("这是短链接：在浏览器里打开它，再复制地址栏里的完整链接");
      return false;
    }
    const url = normalizeMusicUrl(share.url);
    const exist = music.tracks.findIndex((t) => t.url === url);
    if (exist >= 0) {
      playIndex(exist);
      toast("已经在歌单里了，直接播放");
      return true;
    }
    const rec = { id: uid(), title: share.title || extra?.title || "网易云歌曲", artist: share.artist || extra?.artist || "", url, addedAt: Date.now() };
    await FunDB.putTrack(rec);
    music.tracks.push(rec);
    renderMusicUi();
    playIndex(music.tracks.length - 1);
    toast(`已加入并播放：${rec.title}`);
    return true;
  }
  /** 读剪贴板里的网易云分享链接 */
  async function pasteNeFromClipboard() {
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch (_) {
      text = "";
    }
    if (text && (await addFromShareText(text))) return;
    if (!text) toast("读不到剪贴板，请手动粘贴");
    else toast("剪贴板里没有网易云链接，请手动粘贴");
    openAddLink();
  }
  // 从网易云切回来：提示一键粘贴
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !neWaitingPaste) return;
    neWaitingPaste = false;
    const sh = openSheet(
      `<p class="fun-note">在网易云里点歌曲的「分享 → 复制链接」了吗？点下面就能直接加进歌单播放（免费歌曲能听完整版）。</p>
       <div class="fun-sheet-actions"><button type="button" class="fun-btn ghost" data-ne="no">还没有</button><button type="button" class="fun-btn solid" data-ne="paste">📋 粘贴并播放</button></div>`,
      { title: "从网易云回来啦" }
    );
    sh.body.addEventListener("click", (e) => {
      const a = e.target.closest("[data-ne]")?.dataset.ne;
      if (!a) return;
      sh.close();
      if (a === "paste") void pasteNeFromClipboard();
    });
  });

  const curTrack = () => music.tracks[music.idx] || null;

  function playIndex(i, autoplay) {
    const t = music.tracks[i];
    if (!t) return;
    music.idx = i;
    if (music.objUrl) {
      URL.revokeObjectURL(music.objUrl);
      music.objUrl = "";
    }
    if (t.blob) {
      music.objUrl = URL.createObjectURL(t.blob);
      audio.src = music.objUrl;
    } else {
      audio.src = t.url;
    }
    if (autoplay !== false) {
      audio.play().catch((err) => {
        if (err && err.name === "NotAllowedError") return;
        toast("这首歌放不了：链接失效或格式不支持");
      });
    }
    music.lrc = parseLrc(t.lrc);
    music.lrcIdx = -1;
    setMediaSession();
    renderMusicUi();
    syncMini();
    if (music.buddy && autoplay !== false) {
      clearTimeout(music.buddyTimer);
      music.buddyTimer = setTimeout(() => void buddySay(null), 1800);
    }
  }

  /* ───── 歌词 ───── */
  function parseLrc(text) {
    const out = [];
    const src = String(text || "");
    if (!src.trim()) return out;
    let timed = false;
    for (const line of src.split(/\r?\n/)) {
      const tags = [...line.matchAll(/\[(\d{1,2}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
      const body = line.replace(/\[[^\]]*\]/g, "").trim();
      if (tags.length) {
        timed = true;
        for (const m of tags) out.push({ t: Number(m[1]) * 60 + Number(m[2].replace(":", ".")), text: body });
      } else if (body && !/^\[/.test(line)) out.push({ t: -1, text: body });
    }
    if (timed) return out.filter((x) => x.t >= 0).sort((a, b) => a.t - b.t);
    return out;
  }

  function renderLyrics() {
    const box = bodyEl.querySelector("#fm-lyrics");
    if (!box) return;
    const t = curTrack();
    if (!t) {
      box.innerHTML = `<p class="fm-lrc-empty">还没有在放的歌</p>`;
      return;
    }
    if (!music.lrc.length) {
      box.innerHTML = `<p class="fm-lrc-empty">这首歌还没有歌词</p><button type="button" class="fun-btn ghost sm" data-lrc-add>导入歌词</button>`;
      return;
    }
    box.innerHTML = `<div class="fm-lrc-lines">${music.lrc.map((l, i) => `<p data-li="${i}">${esc(l.text) || "♪"}</p>`).join("")}</div>`;
    music.lrcIdx = -1;
    syncLyric();
  }

  function syncLyric() {
    if (!music.showLyrics || !music.lrc.length || music.lrc[0].t < 0) return;
    const box = bodyEl.querySelector("#fm-lyrics");
    if (!box) return;
    const now = audio.currentTime + 0.25;
    let i = -1;
    for (let k = 0; k < music.lrc.length; k++) {
      if (music.lrc[k].t <= now) i = k;
      else break;
    }
    if (i === music.lrcIdx) return;
    music.lrcIdx = i;
    box.querySelectorAll(".is-cur").forEach((x) => x.classList.remove("is-cur"));
    const el = box.querySelector(`[data-li="${i}"]`);
    if (el) {
      el.classList.add("is-cur");
      box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2, behavior: "smooth" });
    }
  }

  function currentLyricLine() {
    if (!music.lrc.length) return "";
    const l = music.lrc[Math.max(0, music.lrcIdx)];
    return l ? l.text : "";
  }

  function openLrcEditor() {
    const t = curTrack();
    if (!t) return toast("先放一首歌");
    const sh = openSheet(
      `<p class="fun-note">支持 .lrc 文件（带时间轴会跟着滚动），也可以直接粘贴纯文本歌词。</p>
       <button type="button" class="fun-btn ghost sm" data-a="file">选择 .lrc 文件</button>
       <input type="file" accept=".lrc,.txt,text/plain" hidden />
       <label class="fun-field"><span>歌词</span><textarea rows="8" placeholder="[00:12.30]第一句歌词…">${esc(t.lrc || "")}</textarea></label>
       <div class="fun-sheet-actions"><button type="button" class="fun-btn ghost" data-a="clear">清除</button><button type="button" class="fun-btn solid" data-a="ok">保存</button></div>`,
      { title: `歌词 · ${t.title}` }
    );
    const ta = sh.body.querySelector("textarea");
    const fi = sh.body.querySelector("input[type=file]");
    fi.onchange = async () => {
      const f = fi.files?.[0];
      if (f) ta.value = await f.text();
    };
    sh.body.addEventListener("click", async (e) => {
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (a === "file") fi.click();
      if (a === "clear") ta.value = "";
      if (a === "ok") {
        t.lrc = ta.value.trim();
        await FunDB.putTrack(t).catch(() => toast("保存失败"));
        music.lrc = parseLrc(t.lrc);
        music.showLyrics = true;
        sh.close();
        renderMusicUi();
      }
    });
  }

  /* ───── 在线搜歌（Apple iTunes 公开搜索接口：免费、免 Key，可试听 30 秒） ───── */
  function itunesSearch(term) {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=25&country=CN`;
    const map = (data) =>
      (data?.results || [])
        .filter((r) => r.previewUrl)
        .map((r) => ({ title: r.trackName, artist: r.artistName, album: r.collectionName, cover: String(r.artworkUrl100 || "").replace("100x100", "300x300"), url: r.previewUrl, dur: Math.round((r.trackTimeMillis || 0) / 1000) }));
    return fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(map)
      .catch(
        () =>
          // 个别网络下 fetch 被跨域拦截时，用 JSONP 兜底
          new Promise((resolve, reject) => {
            const cb = "__mxItunes" + Date.now();
            const sc = document.createElement("script");
            const timer = setTimeout(() => {
              cleanup();
              reject(new Error("搜索超时，检查一下网络"));
            }, 12000);
            const cleanup = () => {
              clearTimeout(timer);
              delete window[cb];
              sc.remove();
            };
            window[cb] = (data) => {
              cleanup();
              resolve(map(data));
            };
            sc.onerror = () => {
              cleanup();
              reject(new Error("搜索失败，检查一下网络"));
            };
            sc.src = url + "&callback=" + cb;
            document.head.appendChild(sc);
          })
      );
  }

  function openSearch(prefill) {
    const sh = openSheet(
      `<div class="fm-search"><input type="search" placeholder="歌名 / 歌手" value="${esc(prefill || "")}" /><button type="button" class="fun-btn solid sm">搜索</button></div>
       <button type="button" class="fm-ne-go" id="fm-ne-go">☁ 去网易云搜，听完整版</button>
       <p class="fun-note">下面是 Apple Music 曲库，可以试听 30 秒。想听完整版：点上面或每首歌的 ☁ 去网易云，找到歌后「分享 → 复制链接」，回来点「粘贴并播放」就行。</p>
       <div class="fm-results" id="fm-results"></div>`,
      { title: "搜歌" }
    );
    sh.el.classList.add("fun-sheet--tall");
    const inp = sh.body.querySelector("input");
    const box = sh.body.querySelector("#fm-results");
    let results = [];
    const go = async () => {
      const q = inp.value.trim();
      if (!q) return;
      box.innerHTML = `<p class="fun-note"><span class="fun-spin"></span> 搜索中…</p>`;
      try {
        results = await itunesSearch(q);
        box.innerHTML = results.length
          ? results
              .map(
                (r, i) => `<div class="fm-res" data-i="${i}"><img src="${esc(r.cover)}" alt="" loading="lazy" /><span><strong>${esc(r.title)}</strong><small>${esc(r.artist)} · ${esc(r.album || "")}</small></span>
                <button type="button" class="fun-btn ghost sm" data-r="ne" title="去网易云听完整版">☁</button><button type="button" class="fun-btn ghost sm" data-r="play">试听</button><button type="button" class="fun-btn solid sm" data-r="add">＋</button></div>`
              )
              .join("")
          : `<p class="fun-note">没有找到，换个关键词试试</p>`;
      } catch (err) {
        box.innerHTML = `<p class="fun-note warn">${esc(err.message)}</p>`;
      }
    };
    sh.body.querySelector(".fm-search button").onclick = go;
    sh.body.querySelector("#fm-ne-go").onclick = () => {
      const q = inp.value.trim();
      if (!q) return toast("先输入歌名");
      goNeSearch(q);
    };
    inp.addEventListener("keydown", (e) => e.key === "Enter" && !e.isComposing && go());
    box.addEventListener("click", async (e) => {
      const row = e.target.closest(".fm-res");
      const r = row && results[Number(row.dataset.i)];
      const act = e.target.closest("[data-r]")?.dataset.r;
      if (!r || !act) return;
      if (act === "ne") return goNeSearch(`${r.title} ${r.artist}`);
      let i = music.tracks.findIndex((t) => t.url === r.url);
      if (i < 0) {
        const rec = { id: uid(), title: r.title, artist: r.artist, url: r.url, cover: r.cover, preview: true, addedAt: Date.now() };
        await FunDB.putTrack(rec);
        music.tracks.push(rec);
        i = music.tracks.length - 1;
        if (act === "add") toast(`已加入歌单：${r.title}`);
      } else if (act === "add") toast("已经在歌单里了");
      renderMusicUi();
      if (act === "play") playIndex(i);
      e.target.closest("[data-r]").textContent = act === "add" ? "✓" : "♪";
    });
    if (prefill) go();
  }

  /* ───── 一起听 ───── */
  async function chooseBuddy() {
    const cast = await loadCast();
    if (!cast.length) return toast("角色库里还没有角色");
    const res = await pickCast(cast, { min: 1, max: 1, title: "和谁一起听？", preselect: music.buddy ? [music.buddy.id] : [] });
    if (!res || !res[0]) return;
    music.buddy = res[0];
    music.buddyLog = [];
    renderBuddy();
    if (curTrack()) void buddySay(null);
  }

  async function buddySay(userText) {
    const b = music.buddy;
    const t = curTrack();
    if (!b || music.buddyBusy) return;
    if (!hasApiKey()) {
      if (userText) toast("请先在设置里填写 API Key");
      return;
    }
    if (userText) music.buddyLog.push({ who: "me", text: userText });
    music.buddyBusy = true;
    renderBuddy();
    try {
      const user = await loadUser();
      const song = t ? `《${t.title}》${t.artist ? " - " + t.artist : ""}` : "（现在没有放歌）";
      const line = currentLyricLine();
      const hist = music.buddyLog.slice(-10).map((x) => (x.who === "me" ? `${user.name}：${x.text}` : `${b.name}：${x.text}`)).join("\n");
      const txt = await aiText(
        [
          {
            role: "system",
            content: `你是「${b.name}」。${b.persona ? "人设：\n" + b.persona + "\n" : ""}你正和${user.name}戴着同一副耳机一起听歌。像真人一样自然地聊：可以说对这首歌的感受、联想到的回忆、哼一句、问对方为什么喜欢。如果推荐歌曲，用《歌名》标出来。你可以凭自己知道的去理解这首歌，不确定的不要编造歌词。1~3 句话，口语化，只输出你说的话。`
          },
          {
            role: "user",
            content: `正在播放：${song}${line ? `\n现在唱到：「${line}」` : ""}${hist ? `\n\n刚才的对话：\n${hist}` : ""}\n\n${userText ? "请回应" + user.name + "。" : "歌刚开始放，说点什么。"}`
          }
        ],
        { maxTokens: 500 }
      );
      const said = cleanLine(txt, 200, b.name);
      music.buddyLog.push({ who: "buddy", text: said });
      const rec = said.match(/《([^》]{1,30})》/);
      music.buddyRec = rec && (!t || rec[1] !== t.title) ? rec[1] : "";
      if (music.buddyLog.length > 30) music.buddyLog = music.buddyLog.slice(-30);
    } catch (err) {
      toast(`${b.name}没听清：${err.message}`);
    } finally {
      music.buddyBusy = false;
      renderBuddy();
    }
  }

  function renderBuddy() {
    const box = bodyEl.querySelector("#fm-buddy");
    if (!box) return;
    const b = music.buddy;
    if (!b) {
      box.innerHTML = `<button type="button" class="fm-buddy-invite" data-buddy="pick"><span class="fm-buddy-ear">🎧</span><span><strong>和角色一起听</strong><small>TA 会跟你聊正在放的歌</small></span></button>`;
      return;
    }
    const logs = music.buddyLog.slice(-6);
    box.innerHTML = `
      <div class="fm-buddy-head">${avHtml(b, "fun-av sm")}<strong>${esc(b.name)}</strong><small>正在和你一起听</small>
        <button type="button" class="sh-link" data-buddy="pick">换人</button><button type="button" class="sh-link" data-buddy="off">结束</button></div>
      <div class="fm-buddy-log">${logs
        .map((x) => `<p class="${x.who === "me" ? "is-me" : ""}">${esc(x.text)}</p>`)
        .join("")}${music.buddyBusy ? `<p class="is-typing"><i></i><i></i><i></i></p>` : ""}${!logs.length && !music.buddyBusy ? `<p class="fm-buddy-hint">放一首歌，${esc(b.name)}会先开口</p>` : ""}</div>
      <div class="fm-buddy-input"><input type="text" placeholder="聊聊这首歌，或者让 TA 推荐一首…" maxlength="120" /><button type="button" class="fun-btn solid sm" data-buddy="send">发送</button></div>
      ${music.buddyRec ? `<button type="button" class="fm-rec" data-buddy="rec">🎵 搜索 TA 推荐的「${esc(music.buddyRec)}」</button>` : ""}`;
    const lg = box.querySelector(".fm-buddy-log");
    lg.scrollTop = lg.scrollHeight;
    const inp = box.querySelector("input");
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing) box.querySelector('[data-buddy="send"]').click();
    });
  }

  function togglePlay() {
    if (!curTrack()) {
      if (music.tracks.length) playIndex(0);
      else toast("歌单是空的，先上传一首歌");
      return;
    }
    if (audio.paused) audio.play().catch(() => toast("播放失败"));
    else audio.pause();
  }

  function step(dir) {
    const n = music.tracks.length;
    if (!n) return;
    let i;
    if (music.mode === "shuffle" && n > 1) {
      do i = rnd(n);
      while (i === music.idx);
    } else {
      i = ((music.idx < 0 ? 0 : music.idx + dir) + n) % n;
    }
    playIndex(i);
  }

  function stopMusic() {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    if (music.objUrl) URL.revokeObjectURL(music.objUrl);
    music.objUrl = "";
    music.idx = -1;
    renderMusicUi();
    syncMini();
  }

  audio.addEventListener("ended", () => {
    if (music.mode === "one") {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } else step(1);
  });
  audio.addEventListener("error", () => {
    if (!audio.getAttribute("src")) return;
    const t = curTrack();
    if (t && neteaseId(t.url)) openInNetease(t, true);
    else toast("这首歌放不了：链接失效或格式不支持");
  });
  ["play", "pause", "loadedmetadata", "timeupdate"].forEach((ev) =>
    audio.addEventListener(ev, () => {
      if (ev === "timeupdate") updateProgress();
      else {
        renderMusicUi(true);
        syncMini();
      }
    })
  );

  function setMediaSession() {
    const t = curTrack();
    if (!t || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist || "未知歌手", album: "Meow OS · 音乐" });
      navigator.mediaSession.setActionHandler("play", () => audio.play());
      navigator.mediaSession.setActionHandler("pause", () => audio.pause());
      navigator.mediaSession.setActionHandler("previoustrack", () => step(-1));
      navigator.mediaSession.setActionHandler("nexttrack", () => step(1));
    } catch (_) {
      /* ignore */
    }
  }

  /* 桌面迷你播放条 */
  const mini = document.createElement("div");
  mini.className = "fun-mini";
  mini.id = "fun-mini";
  mini.hidden = true;
  mini.innerHTML = `
    <button type="button" class="fun-mini-main" data-act="open">
      <span class="fun-mini-disc"></span>
      <span class="fun-mini-meta"><strong></strong><small></small></span>
    </button>
    <button type="button" class="fun-mini-btn" data-act="toggle" aria-label="播放/暂停"><i class="ph ph-play"></i></button>
    <button type="button" class="fun-mini-btn" data-act="next" aria-label="下一首"><i class="ph ph-skip-forward"></i></button>
    <button type="button" class="fun-mini-btn" data-act="close" aria-label="关闭"><i class="ph ph-x"></i></button>`;
  phone.appendChild(mini);
  mini.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "open") openFunApp("音乐");
    if (act === "toggle") togglePlay();
    if (act === "next") step(1);
    if (act === "close") stopMusic();
  });

  const musicSubs = new Set();
  function syncMini() {
    musicSubs.forEach((fn) => {
      try {
        fn();
      } catch (_) {
        /* ignore */
      }
    });
    const t = curTrack();
    const onMusicPage = screen.classList.contains("is-open");
    mini.hidden = !t || onMusicPage;
    if (!t) return;
    mini.querySelector("strong").textContent = t.title;
    mini.querySelector("small").textContent = t.artist || (audio.paused ? "已暂停" : "正在播放");
    mini.classList.toggle("is-playing", !audio.paused);
    mini.querySelector('[data-act="toggle"] i').className = "ph " + (audio.paused ? "ph-play" : "ph-pause");
  }

  function updateProgress() {
    const seek = bodyEl.querySelector("#fm-seek");
    if (!seek || seek.dataset.dragging === "1") return;
    const d = audio.duration;
    seek.value = Number.isFinite(d) && d > 0 ? String(Math.round((audio.currentTime / d) * 1000)) : "0";
    seek.style.setProperty("--p", seek.value / 10 + "%");
    const cur = bodyEl.querySelector("#fm-cur");
    const dur = bodyEl.querySelector("#fm-dur");
    if (cur) cur.textContent = fmtTime(audio.currentTime);
    if (dur) dur.textContent = fmtTime(d);
    syncLyric();
  }

  function renderMusicUi(lightOnly) {
    const root = bodyEl.querySelector(".fm");
    if (!root) return;
    const t = curTrack();
    root.classList.toggle("is-playing", !!t && !audio.paused);
    root.querySelector("#fm-title").textContent = t ? t.title : "还没有在放的歌";
    root.querySelector("#fm-artist").textContent = t ? t.artist || "未知歌手" : "上传本地音乐，或者粘贴一个音频链接";
    root.querySelector("#fm-play i").className = "ph " + (t && !audio.paused ? "ph-pause" : "ph-play");
    const mm = MODE_META[music.mode];
    root.querySelector("#fm-mode i").className = "ph " + mm.icon;
    root.querySelector("#fm-mode").title = mm.label;
    root.querySelector("#fm-disc").style.setProperty("--disc-h", t ? hue(t.title) : 220);
    root.querySelector("#fm-disc").style.setProperty("--cover", t && t.cover ? `url("${t.cover}")` : "none");
    root.classList.toggle("show-lyrics", music.showLyrics);
    root.querySelector("#fm-lrc-btn").classList.toggle("is-on", music.showLyrics);
    updateProgress();
    if (lightOnly) {
      root.querySelectorAll(".fm-item").forEach((li) => li.classList.toggle("is-on", li.dataset.id === t?.id));
      return;
    }
    if (music.showLyrics) renderLyrics();
    root.querySelector("#fm-count").textContent = `${music.tracks.length} 首`;
    const list = root.querySelector("#fm-list");
    if (!music.tracks.length) {
      list.innerHTML = `<li class="fm-empty">歌单还空着。<br/>点「上传」选手机里的歌，文件名写成「歌手 - 歌名」会自动识别。</li>`;
      return;
    }
    list.innerHTML = music.tracks
      .map(
        (x, i) => `<li class="fm-item${x.id === t?.id ? " is-on" : ""}" data-id="${esc(x.id)}" data-i="${i}">
          <span class="fm-item-no">${String(i + 1).padStart(2, "0")}</span>
          <span class="fm-item-meta"><strong>${esc(x.title)}</strong><small>${x.preview ? "试听 · " : ""}${esc(x.artist || (x.url ? "链接" : "本地"))}</small></span>
          <span class="fm-item-eq"><i></i><i></i><i></i></span>
          ${neteaseId(x.url) ? `<button type="button" class="fm-item-del" data-ne="${i}" title="在网易云里打开">☁</button>` : ""}
          <button type="button" class="fm-item-del" data-lrc="${i}" aria-label="歌词" title="歌词">${x.lrc ? "词✓" : "词"}</button>
          <button type="button" class="fm-item-del" data-del="${esc(x.id)}" aria-label="删除"><i class="ph ph-trash"></i></button>
        </li>`
      )
      .join("");
  }

  async function addFiles(files) {
    const arr = Array.from(files || []).filter((f) => /^audio\//.test(f.type) || /\.(mp3|m4a|aac|wav|flac|ogg|opus)$/i.test(f.name));
    if (!arr.length) {
      toast("没有识别到音频文件");
      return;
    }
    let added = 0;
    for (const f of arr) {
      const meta = parseName(f.name);
      const rec = { id: uid(), title: meta.title, artist: meta.artist, blob: f, type: f.type, addedAt: Date.now() + added };
      try {
        await FunDB.putTrack(rec);
        music.tracks.push(rec);
        added++;
      } catch (err) {
        console.warn(err);
        toast("存储空间不足，部分歌曲没有保存");
        break;
      }
    }
    renderMusicUi();
    if (added) toast(`已添加 ${added} 首`);
    if (music.idx < 0 && added) playIndex(music.tracks.length - added, false);
  }

  function openAddLink() {
    const sh = openSheet(
      `<label class="fun-field"><span>网易云分享内容 / 音频链接</span><textarea id="fm-l-url" rows="3" placeholder="在网易云 App 里点歌曲「分享 → 复制链接」，整段粘贴到这里就行；也可以填 mp3 直链"></textarea></label>
       <label class="fun-field"><span>歌名</span><input id="fm-l-title" type="text" placeholder="可不填" /></label>
       <label class="fun-field"><span>歌手</span><input id="fm-l-artist" type="text" placeholder="可不填" /></label>
       <p class="fun-note">网易云的<b>免费歌曲</b>可以完整播放；VIP 和版权受限的歌曲网页里放不了。歌名和歌手会从分享文字里自动识别。</p>
       <div class="fun-sheet-actions"><button type="button" class="fun-btn ghost" data-act="cancel">取消</button><button type="button" class="fun-btn solid" data-act="ok">添加</button></div>`,
      { title: "添加链接" }
    );
    sh.body.addEventListener("click", async (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "cancel") sh.close();
      if (act !== "ok") return;
      const share = parseShareText(sh.body.querySelector("#fm-l-url").value);
      if (!share.url) {
        toast("没找到链接，请粘贴网易云的分享内容或 http(s) 链接");
        return;
      }
      if (share.isShort) {
        toast("这是短链接，请在浏览器里打开它，再复制地址栏里的完整链接");
        return;
      }
      const url = normalizeMusicUrl(share.url);
      if (!sh.body.querySelector("#fm-l-title").value.trim() && share.title) sh.body.querySelector("#fm-l-title").value = share.title;
      if (!sh.body.querySelector("#fm-l-artist").value.trim() && share.artist) sh.body.querySelector("#fm-l-artist").value = share.artist;
      const guess = parseName(decodeURIComponent(url.split("/").pop().split("?")[0] || ""));
      const rec = {
        id: uid(),
        title: sh.body.querySelector("#fm-l-title").value.trim() || (/163\.com/.test(url) ? "网易云歌曲" : guess.title),
        artist: sh.body.querySelector("#fm-l-artist").value.trim() || guess.artist,
        url,
        addedAt: Date.now()
      };
      await FunDB.putTrack(rec);
      music.tracks.push(rec);
      sh.close();
      renderMusicUi();
      playIndex(music.tracks.length - 1);
    });
  }

  async function deleteTrack(id) {
    const i = music.tracks.findIndex((x) => x.id === id);
    if (i < 0) return;
    const wasCurrent = i === music.idx;
    await FunDB.delTrack(id).catch(() => {});
    music.tracks.splice(i, 1);
    if (wasCurrent) stopMusic();
    else if (i < music.idx) music.idx--;
    renderMusicUi();
  }

  register("音乐", {
    title: "音乐",
    kicker: "MUSIC / PLAYER",
    async mount(body, act) {
      body.innerHTML = `
        <div class="fm">
          <section class="fm-now">
            <div class="fm-stage">
              <div class="fm-disc" id="fm-disc"><span class="fm-disc-hole"></span></div>
              <div class="fm-lyrics" id="fm-lyrics"></div>
            </div>
            <div class="fm-now-meta"><strong id="fm-title"></strong><span id="fm-artist"></span></div>
            <div class="fm-progress">
              <span id="fm-cur">0:00</span>
              <input id="fm-seek" type="range" min="0" max="1000" value="0" aria-label="进度" />
              <span id="fm-dur">0:00</span>
            </div>
            <div class="fm-ctrls">
              <button type="button" class="fm-btn" id="fm-mode"><i class="ph ph-repeat"></i></button>
              <button type="button" class="fm-btn" id="fm-prev"><i class="ph ph-skip-back"></i></button>
              <button type="button" class="fm-btn fm-btn--big" id="fm-play"><i class="ph ph-play"></i></button>
              <button type="button" class="fm-btn" id="fm-next"><i class="ph ph-skip-forward"></i></button>
              <button type="button" class="fm-btn fm-btn--txt" id="fm-lrc-btn" title="歌词">词</button>
            </div>
          </section>
          <section class="fm-buddy" id="fm-buddy"></section>
          <section class="fm-list-wrap">
            <div class="fm-list-head"><span class="fun-kicker">PLAYLIST · <b id="fm-count">0 首</b></span>
              <div class="fm-list-tools">
                <button type="button" class="fun-btn solid sm" id="fm-search-btn">🔍 搜歌</button>
                <button type="button" class="fun-btn ghost sm" id="fm-ne-paste">📋 粘贴网易云</button>
                <button type="button" class="fun-btn ghost sm" id="fm-add-link"><i class="ph ph-link"></i> 链接</button>
                <button type="button" class="fun-btn ghost sm" id="fm-add-file"><i class="ph ph-upload-simple"></i> 上传</button>
              </div>
            </div>
            <ul class="fm-list" id="fm-list"></ul>
            <input type="file" id="fm-file" accept="audio/*,.mp3,.m4a,.flac,.wav,.ogg" multiple hidden />
          </section>
        </div>`;
      act.innerHTML = "";
      await loadTracks();
      renderMusicUi();
      const seek = body.querySelector("#fm-seek");
      seek.addEventListener("input", () => {
        seek.dataset.dragging = "1";
        seek.style.setProperty("--p", seek.value / 10 + "%");
        const d = audio.duration;
        if (Number.isFinite(d)) body.querySelector("#fm-cur").textContent = fmtTime((seek.value / 1000) * d);
      });
      seek.addEventListener("change", () => {
        const d = audio.duration;
        if (Number.isFinite(d)) audio.currentTime = (seek.value / 1000) * d;
        seek.dataset.dragging = "";
      });
      body.querySelector("#fm-play").onclick = togglePlay;
      body.querySelector("#fm-prev").onclick = () => step(-1);
      body.querySelector("#fm-next").onclick = () => step(1);
      body.querySelector("#fm-lrc-btn").onclick = () => {
        music.showLyrics = !music.showLyrics;
        renderMusicUi();
      };
      body.querySelector("#fm-lyrics").addEventListener("click", (e) => {
        if (e.target.closest("[data-lrc-add]")) openLrcEditor();
        else if (e.target.closest(".fm-lrc-lines")) {
          music.showLyrics = false;
          renderMusicUi();
        }
      });
      body.querySelector("#fm-lyrics").addEventListener("dblclick", openLrcEditor);
      body.querySelector("#fm-buddy").addEventListener("click", (e) => {
        const a = e.target.closest("[data-buddy]")?.dataset.buddy;
        if (a === "pick") void chooseBuddy();
        if (a === "rec" && music.buddyRec) openSearch(music.buddyRec);
        if (a === "off") {
          music.buddy = null;
          renderBuddy();
        }
        if (a === "send") {
          const inp = e.currentTarget.querySelector("input");
          const v = inp.value.trim();
          if (!v) return;
          inp.value = "";
          void buddySay(v);
        }
      });
      renderBuddy();
      body.querySelector("#fm-mode").onclick = () => {
        const order = ["loop", "one", "shuffle"];
        music.mode = order[(order.indexOf(music.mode) + 1) % order.length];
        saveMusicState();
        toast(MODE_META[music.mode].label);
        renderMusicUi(true);
      };
      const fileIn = body.querySelector("#fm-file");
      body.querySelector("#fm-add-file").onclick = () => fileIn.click();
      fileIn.onchange = () => {
        void addFiles(fileIn.files);
        fileIn.value = "";
      };
      body.querySelector("#fm-add-link").onclick = openAddLink;
      body.querySelector("#fm-ne-paste").onclick = () => void pasteNeFromClipboard();
      body.querySelector("#fm-search-btn").onclick = () => openSearch("");
      body.querySelector("#fm-list").addEventListener("click", (e) => {
        const del = e.target.closest("[data-del]");
        if (del) {
          e.stopPropagation();
          const t = music.tracks.find((x) => x.id === del.dataset.del);
          if (t && confirmDelete(t)) void deleteTrack(t.id);
          return;
        }
        const nb = e.target.closest("[data-ne]");
        if (nb) {
          e.stopPropagation();
          openInNetease(music.tracks[Number(nb.dataset.ne)], false);
          return;
        }
        const lb = e.target.closest("[data-lrc]");
        if (lb) {
          e.stopPropagation();
          const i = Number(lb.dataset.lrc);
          if (i !== music.idx) playIndex(i);
          openLrcEditor();
          return;
        }
        const li = e.target.closest(".fm-item");
        if (!li) return;
        const i = Number(li.dataset.i);
        if (i === music.idx) togglePlay();
        else playIndex(i);
      });
    },
    unmount() {}
  });

  function confirmDelete(t) {
    // 不用原生 confirm（会阻塞），用二次点击确认
    const key = "fmDel_" + t.id;
    if (confirmDelete[key] && Date.now() - confirmDelete[key] < 2500) return true;
    confirmDelete[key] = Date.now();
    toast(`再点一次删除「${t.title}」`);
    return false;
  }

  // 预加载歌单（迷你条需要），不自动播放
  void loadTracks();

  /* ───────────── 对外 ───────────── */
  window.XXJ_FUN = {
    esc,
    toast,
    sleep,
    rnd,
    pick,
    shuffle,
    hue,
    uid,
    avHtml,
    FunDB,
    loadCast,
    loadUser,
    hasApiKey,
    hasImageGen,
    genImage,
    aiText,
    parseJsonLoose,
    cleanLine,
    openSheet,
    pickCast,
    register,
    addRecord,
    loadRecords,
    recordSummary,
    open: (k) => openFunApp(k),
    isOpen: (key) => screen.classList.contains("is-open") && current === apps[key],
    get body() {
      return bodyEl;
    }
  };
  window.openFunApp = openFunApp;
  /** 给桌面小组件用的音乐接口 */
  window.XXJ_MUSIC = {
    current: () => curTrack(),
    playing: () => !!curTrack() && !audio.paused,
    toggle: () => togglePlay(),
    next: () => step(1),
    prev: () => step(-1),
    progress: () => (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.currentTime / audio.duration : 0),
    subscribe: (fn) => (musicSubs.add(fn), () => musicSubs.delete(fn)),
    ready: () => loadTracks(),
    /** 打开搜歌（朋友圈音乐卡片、让 TA 选歌用） */
    search: (q) => {
      void loadTracks().then(() => openSearch(q || ""));
    }
  };
  window.closeFunScreen = closeFunScreen;
})();
