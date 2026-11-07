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
        avatar: await resolveImg(x.avatar)
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

  screen.querySelector("#fun-back").addEventListener("click", closeFunScreen);

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
    sheetHost.appendChild(wrap);
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
    loaded: false
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

  function normalizeMusicUrl(raw) {
    const u = String(raw || "").trim();
    // 网易云歌曲页 → 外链直链（仅部分免费歌曲可播）
    const ne = u.match(/music\.163\.com\/.*?[?&#]id=(\d+)/) || u.match(/music\.163\.com\/song\/(\d+)/);
    if (ne) return `https://music.163.com/song/media/outer/url?id=${ne[1]}.mp3`;
    return u;
  }

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
    setMediaSession();
    renderMusicUi();
    syncMini();
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
    if (audio.getAttribute("src")) toast("这首歌放不了：链接失效或格式不支持");
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
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist || "未知歌手", album: "没心机 · 音乐" });
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

  function syncMini() {
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
    updateProgress();
    if (lightOnly) {
      root.querySelectorAll(".fm-item").forEach((li) => li.classList.toggle("is-on", li.dataset.id === t?.id));
      return;
    }
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
          <span class="fm-item-meta"><strong>${esc(x.title)}</strong><small>${esc(x.artist || (x.url ? "链接" : "本地"))}</small></span>
          <span class="fm-item-eq"><i></i><i></i><i></i></span>
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
      `<label class="fun-field"><span>音频链接</span><input id="fm-l-url" type="url" placeholder="https://…/xxx.mp3 或网易云歌曲页链接" /></label>
       <label class="fun-field"><span>歌名</span><input id="fm-l-title" type="text" placeholder="可不填" /></label>
       <label class="fun-field"><span>歌手</span><input id="fm-l-artist" type="text" placeholder="可不填" /></label>
       <p class="fun-note">支持 mp3 / m4a 等音频直链。网易云歌曲页链接会自动转换（仅部分免费歌曲能播）。</p>
       <div class="fun-sheet-actions"><button type="button" class="fun-btn ghost" data-act="cancel">取消</button><button type="button" class="fun-btn solid" data-act="ok">添加</button></div>`,
      { title: "添加链接" }
    );
    sh.body.addEventListener("click", async (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "cancel") sh.close();
      if (act !== "ok") return;
      const raw = sh.body.querySelector("#fm-l-url").value.trim();
      if (!/^https?:\/\//i.test(raw)) {
        toast("请填一个 http(s) 开头的链接");
        return;
      }
      const url = normalizeMusicUrl(raw);
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
            <div class="fm-disc" id="fm-disc"><span class="fm-disc-hole"></span></div>
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
              <button type="button" class="fm-btn" id="fm-stop" title="停止"><i class="ph ph-stop"></i></button>
            </div>
          </section>
          <section class="fm-list-wrap">
            <div class="fm-list-head"><span class="fun-kicker">PLAYLIST · <b id="fm-count">0 首</b></span>
              <div class="fm-list-tools">
                <button type="button" class="fun-btn ghost sm" id="fm-add-link"><i class="ph ph-link"></i> 链接</button>
                <button type="button" class="fun-btn solid sm" id="fm-add-file"><i class="ph ph-upload-simple"></i> 上传</button>
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
      body.querySelector("#fm-stop").onclick = stopMusic;
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
      body.querySelector("#fm-list").addEventListener("click", (e) => {
        const del = e.target.closest("[data-del]");
        if (del) {
          e.stopPropagation();
          const t = music.tracks.find((x) => x.id === del.dataset.del);
          if (t && confirmDelete(t)) void deleteTrack(t.id);
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
    aiText,
    parseJsonLoose,
    cleanLine,
    openSheet,
    pickCast,
    register,
    isOpen: (key) => screen.classList.contains("is-open") && current === apps[key],
    get body() {
      return bodyEl;
    }
  };
  window.openFunApp = openFunApp;
  window.closeFunScreen = closeFunScreen;
})();
