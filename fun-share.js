"use strict";

/**
 * 资源站：Meow OS 专属资源卡（.png）+ 共享广场（Supabase）
 *
 * 专属 PNG 格式（MXJ 卡）：
 *   - 外观是一张普通 PNG 卡片图（可预览、可发群）
 *   - 数据藏在自定义私有区块「mxJd」里：MXJ1 魔数 + deflate 压缩的 JSON，再做一层混淆
 *   - 只有本站能识别；其它酒馆 / 网站读不出内容
 *   - 注意：QQ/微信「不发原图」会重新压缩图片，隐藏数据会丢失，分享时请发原图或文件
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast, uid } = F;

  /* ═════════ PNG 编解码 ═════════ */
  const CHUNK_TYPE = "mxJd";
  const MAGIC = "MXJ1";
  const KEY = "meixinji·没心机·36123·card";
  const KIND_META = {
    look: { name: "美化", icon: "🎨", c1: "#f6d0e2", c2: "#b8889e" },
    worldbook: { name: "世界书", icon: "📖", c1: "#d8e6ff", c2: "#3a5c89" },
    char: { name: "角色卡", icon: "🎭", c1: "#e4dcff", c2: "#6e4dbd" },
    preset: { name: "预设", icon: "🧩", c1: "#d9f5e6", c2: "#1f7a61" },
    font: { name: "字体", icon: "🔤", c1: "#fff1cc", c2: "#b8920a" }
  };
  /** 可分享的预设种类：KV 里都是 {id,name,…} 列表（生图预设包在 {v:1,items} 里，本身不含 Key） */
  const PRESET_SUBS = {
    theater: { name: "小剧场预设", key: "THEATER_PRESETS" },
    prose: { name: "晤面文风预设", key: "CHAT_OFFLINE_DM_PROSE_PRESETS" },
    chatcss: { name: "密谈样式预设", key: "CHAT_THREAD_UI_CSS_PRESETS" },
    offlinecss: { name: "晤面样式预设", key: "CHAT_OFFLINE_THREAD_UI_CSS_PRESETS" },
    imagegen: { name: "生图预设", key: "IMAGE_GEN_PRESETS", wrapped: true }
  };
  function readPresetList(sub) {
    const d = window.XXJ_DB;
    const meta = PRESET_SUBS[sub];
    if (!d || !meta) return [];
    const raw = d.getKv(d.K[meta.key]);
    const arr = meta.wrapped ? raw?.items : raw;
    return Array.isArray(arr) ? arr.filter((x) => x && typeof x === "object") : [];
  }
  function writePresetList(sub, list) {
    const d = window.XXJ_DB;
    const meta = PRESET_SUBS[sub];
    d.setKv(d.K[meta.key], meta.wrapped ? { v: 1, items: list } : list);
  }
  function readFonts() {
    const d = window.XXJ_DB;
    if (!d) return [];
    const out = [];
    const cur = d.getKv(d.K.GLOBAL_UI_TYPO);
    if (cur && (cur.fontStack || cur.faceFamily || cur.linkUrl)) out.push({ ...cur, id: "__current__", name: "当前使用的字体" });
    const pre = d.getKv(d.K.GLOBAL_UI_TYPO_PRESETS);
    if (Array.isArray(pre)) pre.forEach((x) => x && x.id && out.push(x));
    return out;
  }
  /** 字体卡封面：尽量用这款字体本身画一段示例文字 */
  async function fontCover(f) {
    const fam = "mxjfont" + Date.now();
    let family = String(f.fontStack || f.faceFamily || "serif");
    try {
      const src = f.faceSrcDataUrl || f.faceSrcUrl;
      if (src) {
        const face = new FontFace(fam, `url(${JSON.stringify(src)})`);
        await face.load();
        document.fonts.add(face);
        family = fam;
      }
    } catch (_) {
      /* 加载不了就用字体栈 */
    }
    const c = document.createElement("canvas");
    c.width = 600;
    c.height = 400;
    const ctx = c.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 600, 400);
    g.addColorStop(0, "#fff7dd");
    g.addColorStop(1, "#ffe7a3");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 600, 400);
    ctx.fillStyle = "#3a2f10";
    ctx.textAlign = "center";
    ctx.font = `110px ${family}`;
    ctx.fillText("Aa 喵", 300, 190);
    ctx.font = `40px ${family}`;
    ctx.fillText("今天也要开心哦 123", 300, 290);
    return c.toDataURL("image/png");
  }


  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  /** 对称混淆：同一函数加/解 */
  function scramble(bytes) {
    const k = new TextEncoder().encode(KEY);
    const out = new Uint8Array(bytes.length);
    let s = 0x6d786a31;
    for (let i = 0; i < bytes.length; i++) {
      s ^= s << 13;
      s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5;
      s >>>= 0;
      out[i] = bytes[i] ^ k[i % k.length] ^ (s & 0xff);
    }
    return out;
  }
  const u32 = (n) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
  const readU32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];

  function deflate(bytes) {
    if (window.fflate?.deflateSync) return window.fflate.deflateSync(bytes, { level: 9 });
    throw new Error("压缩库未加载");
  }
  function inflate(bytes) {
    if (window.fflate?.inflateSync) return window.fflate.inflateSync(bytes);
    throw new Error("压缩库未加载");
  }

  /** @returns {Promise<Blob>} */
  async function embedPayload(pngBlob, payload) {
    const png = new Uint8Array(await pngBlob.arrayBuffer());
    const json = new TextEncoder().encode(JSON.stringify(payload));
    const body = deflate(json);
    const magic = new TextEncoder().encode(MAGIC);
    const raw = new Uint8Array(magic.length + body.length);
    raw.set(magic, 0);
    raw.set(body, magic.length);
    const data = scramble(raw);
    const type = new TextEncoder().encode(CHUNK_TYPE);
    const crcIn = new Uint8Array(4 + data.length);
    crcIn.set(type, 0);
    crcIn.set(data, 4);
    const chunk = new Uint8Array(12 + data.length);
    chunk.set(u32(data.length), 0);
    chunk.set(type, 4);
    chunk.set(data, 8);
    chunk.set(u32(crc32(crcIn)), 8 + data.length);
    const iend = png.length - 12; // IEND 固定 12 字节
    const out = new Uint8Array(png.length + chunk.length);
    out.set(png.subarray(0, iend), 0);
    out.set(chunk, iend);
    out.set(png.subarray(iend), iend + chunk.length);
    return new Blob([out], { type: "image/png" });
  }

  /** @returns {Promise<object|null>} 不是 MXJ 卡返回 null */
  async function extractPayload(blobOrBuf) {
    const b = new Uint8Array(blobOrBuf instanceof ArrayBuffer ? blobOrBuf : await blobOrBuf.arrayBuffer());
    if (b.length < 8 || PNG_SIG.some((v, i) => b[i] !== v)) return null;
    let o = 8;
    while (o + 12 <= b.length) {
      const len = readU32(b, o);
      const type = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
      if (type === CHUNK_TYPE) {
        const raw = scramble(b.subarray(o + 8, o + 8 + len));
        if (new TextDecoder().decode(raw.subarray(0, 4)) !== MAGIC) throw new Error("资源卡已损坏");
        return JSON.parse(new TextDecoder().decode(inflate(raw.subarray(4))));
      }
      if (type === "IEND") break;
      o += 12 + len;
    }
    return null;
  }

  /* ═════════ 卡面绘制 ═════════ */
  function loadImg(src) {
    return new Promise((res) => {
      if (!src) return res(null);
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = src;
    });
  }
  function wrapText(ctx, text, maxW, maxLines) {
    const lines = [];
    let cur = "";
    for (const ch of String(text || "")) {
      if (ch === "\n") {
        lines.push(cur);
        cur = "";
        continue;
      }
      if (ctx.measureText(cur + ch).width > maxW) {
        lines.push(cur);
        cur = ch;
      } else cur += ch;
      if (lines.length >= maxLines) break;
    }
    if (cur && lines.length < maxLines) lines.push(cur);
    if (lines.length === maxLines && String(text).length > lines.join("").length) lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + "…";
    return lines;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  async function drawCard({ kind, title, author, desc, cover, sub }) {
    const m = KIND_META[kind];
    const W = 720;
    const H = 960;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    const font = '"PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif';
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, m.c1);
    g.addColorStop(1, "#ffffff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // 胶带 + 卡片
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.12)";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 10;
    roundRect(ctx, 48, 60, W - 96, H - 120, 36);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(W / 2, 60);
    ctx.rotate(-0.04);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillRect(-90, -18, 180, 36);
    ctx.restore();
    // 封面
    const img = await loadImg(cover);
    const cx = 84;
    const cy = 104;
    const cw = W - 168;
    const ch = 400;
    ctx.save();
    roundRect(ctx, cx, cy, cw, ch, 24);
    ctx.clip();
    if (img) {
      const s = Math.max(cw / img.width, ch / img.height);
      ctx.drawImage(img, cx + (cw - img.width * s) / 2, cy + (ch - img.height * s) / 2, img.width * s, img.height * s);
    } else {
      const g2 = ctx.createLinearGradient(cx, cy, cx + cw, cy + ch);
      g2.addColorStop(0, m.c1);
      g2.addColorStop(1, m.c2);
      ctx.fillStyle = g2;
      ctx.fillRect(cx, cy, cw, ch);
      ctx.font = `160px ${font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(m.icon, W / 2, cy + ch / 2);
    }
    ctx.restore();
    // 标签
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `600 22px ui-monospace, Menlo, monospace`;
    ctx.fillStyle = m.c2;
    ctx.fillText(`${m.icon} MXJ CARD · ${m.name}`, cx, cy + ch + 52);
    // 标题
    ctx.fillStyle = "#17191c";
    ctx.font = `bold italic 44px "Times New Roman","Songti SC",${font}`;
    wrapText(ctx, title || "未命名", cw, 2).forEach((l, i) => ctx.fillText(l, cx, cy + ch + 112 + i * 54));
    // 描述
    ctx.font = `24px ${font}`;
    ctx.fillStyle = "#6d727b";
    const dy = cy + ch + 112 + Math.min(2, wrapText(ctx, title || "", cw, 2).length) * 54 + 6;
    wrapText(ctx, desc || sub || "", cw, 3).forEach((l, i) => ctx.fillText(l, cx, dy + i * 34));
    // 底栏
    ctx.strokeStyle = "#e7e8ea";
    ctx.beginPath();
    ctx.moveTo(cx, H - 150);
    ctx.lineTo(cx + cw, H - 150);
    ctx.stroke();
    ctx.font = `24px ${font}`;
    ctx.fillStyle = "#17191c";
    ctx.fillText(`by ${author || "匿名"}`, cx, H - 108);
    ctx.font = `18px ${font}`;
    ctx.fillStyle = "#9aa0a8";
    ctx.fillText("Meow OS · 专属资源卡 · 仅限本站「资源站」导入", cx, H - 76);
    // 印章
    ctx.save();
    ctx.translate(W - 150, H - 100);
    ctx.rotate(-0.2);
    ctx.strokeStyle = m.c2;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 44, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = m.c2;
    ctx.font = `bold 22px ui-monospace, Menlo, monospace`;
    ctx.textAlign = "center";
    ctx.fillText("MXJ", 0, 8);
    ctx.restore();
    return new Promise((res) => c.toBlob((b) => res(b), "image/png"));
  }

  /* ═════════ 读取 / 写入本机数据 ═════════ */
  const D = () => window.XXJ_DB;

  async function hydrateDeep(v) {
    const M = window.XXJ_MEDIA;
    if (typeof v === "string") return M && M.isBlobRef(v) ? await M.hydrateImageUrlForExport(v) : v;
    if (Array.isArray(v)) return Promise.all(v.map(hydrateDeep));
    if (v && typeof v === "object") {
      const o = {};
      for (const [k, x] of Object.entries(v)) o[k] = await hydrateDeep(x);
      return o;
    }
    return v;
  }
  function firstImage(v) {
    if (typeof v === "string") return /^data:image\//.test(v) || /^https?:\/\/.+\.(png|jpe?g|webp|gif)/i.test(v) ? v : "";
    if (Array.isArray(v)) {
      for (const x of v) {
        const r = firstImage(x);
        if (r) return r;
      }
    } else if (v && typeof v === "object") {
      for (const x of Object.values(v)) {
        const r = firstImage(x);
        if (r) return r;
      }
    }
    return "";
  }

  async function hydrateStores() {
    for (const fn of ["ensureCharPersonaStoreHydrated", "ensureWorldBookStoreHydrated"]) {
      try {
        if (typeof globalThis[fn] === "function") await globalThis[fn]();
      } catch (_) {
        /* ignore */
      }
    }
  }
  function readChars() {
    try {
      return (typeof readCharPersonaStore === "function" ? readCharPersonaStore() : { items: [] }).items || [];
    } catch (_) {
      return [];
    }
  }
  function readVolumes() {
    try {
      return (typeof readWorldBookStore === "function" ? readWorldBookStore() : { volumes: [] }).volumes || [];
    } catch (_) {
      return [];
    }
  }

  const LOOK_SKIP = new Set(["PHOTOS", "HERO_NOTE", "SCENE_PROMPT"]);
  function lookKeys() {
    const d = D();
    if (!d || typeof getWardrobeLookExportKeyList !== "function") return [];
    const skip = new Set([...LOOK_SKIP].map((k) => d.K[k]));
    return getWardrobeLookExportKeyList().filter((k) => !skip.has(k));
  }

  /** 生成导出数据 */
  async function buildExport(kind, ids, opts) {
    await hydrateStores();
    if (kind === "look") {
      const d = D();
      const kv = {};
      for (const k of lookKeys()) {
        const v = d.getKv(k);
        if (v !== undefined) kv[k] = v;
      }
      const data = { format: "xxj-wardrobe-look", version: 1, kv: await hydrateDeep(kv) };
      if (!Object.keys(kv).length) throw new Error("你还没有设置任何装扮");
      return { data, cover: firstImage(data.kv), sub: `${Object.keys(kv).length} 项装扮配置` };
    }
    if (kind === "worldbook") {
      const vols = readVolumes().filter((v) => ids.includes(String(v.id)));
      if (!vols.length) throw new Error("请选择世界书");
      const n = vols.reduce((s, v) => s + (v.entries?.length || 0), 0);
      return { data: { volumes: JSON.parse(JSON.stringify(vols)) }, cover: "", sub: `${vols.length} 本 · ${n} 条设定` };
    }
    if (kind === "char") {
      const ch = readChars().find((c) => ids.includes(String(c.id)));
      if (!ch) throw new Error("请选择角色");
      const char = await hydrateDeep(JSON.parse(JSON.stringify(ch)));
      let volumes = [];
      if (opts?.withBooks) {
        const vid = new Set([...(char.worldBookVolumeIds || []), char.defaultWorldBookVolumeId].filter(Boolean).map(String));
        volumes = readVolumes().filter((v) => vid.has(String(v.id)));
      }
      return {
        data: { char, volumes },
        cover: char.avatar || char.charImageRefDataUrl || "",
        sub: String(char.summary || "").slice(0, 80) + (volumes.length ? `（附 ${volumes.length} 本世界书）` : "")
      };
    }
    if (kind === "preset") {
      const sub = opts?.sub;
      const items = readPresetList(sub).filter((x) => ids.includes(String(x.id)));
      if (!items.length) throw new Error("请选择预设");
      return { data: { sub, items: JSON.parse(JSON.stringify(items)) }, cover: "", sub: `${PRESET_SUBS[sub].name} × ${items.length}：${items.map((x) => x.name || "未命名").join("、").slice(0, 60)}` };
    }
    if (kind === "font") {
      const f = readFonts().find((x) => ids.includes(String(x.id)));
      if (!f) throw new Error("请选择字体");
      const font = JSON.parse(JSON.stringify(f));
      delete font.id;
      return { data: { font }, cover: await fontCover(font), sub: String(font.fontStack || font.faceFamily || "自定义字体").slice(0, 60) };
    }
    throw new Error("未知类型");
  }


  function newVolId() {
    try {
      if (typeof newWorldBookEntryId === "function") return newWorldBookEntryId();
    } catch (_) {
      /* ignore */
    }
    return "wb_" + uid();
  }

  function importVolumes(vols) {
    const store = typeof readWorldBookStore === "function" ? readWorldBookStore() : { volumes: [] };
    const map = {};
    for (const v of vols || []) {
      const id = newVolId();
      map[String(v.id)] = id;
      store.volumes.push({
        ...v,
        id,
        title: String(v.title || "导入的世界书"),
        entries: (v.entries || []).map((e) => ({ ...e, id: newVolId() }))
      });
    }
    if (vols && vols.length && typeof writeWorldBookStore === "function") writeWorldBookStore(store);
    try {
      if (typeof renderWorldBookList === "function") renderWorldBookList();
    } catch (_) {
      /* ignore */
    }
    return map;
  }

  /** 导入到本机：返回提示文字 */
  async function applyImport(payload) {
    if (!payload || !KIND_META[payload.kind]) throw new Error("无法识别的资源卡");
    await hydrateStores();
    const data = payload.data || {};
    if (payload.kind === "look") {
      if (typeof importWardrobeLookFromParsed !== "function") throw new Error("装扮模块未加载");
      const ok = await importWardrobeLookFromParsed(data);
      if (!ok) throw new Error("装扮导入失败");
      return "美化已应用";
    }
    if (payload.kind === "worldbook") {
      importVolumes(data.volumes);
      return `已导入 ${data.volumes?.length || 0} 本世界书`;
    }
    if (payload.kind === "char") {
      const map = importVolumes(data.volumes || []);
      const st = readCharPersonaStore();
      const c = { ...data.char };
      c.id = typeof newEntityId === "function" ? newEntityId() : "c_" + uid();
      c.worldBookVolumeIds = (c.worldBookVolumeIds || []).map((x) => map[String(x)]).filter(Boolean);
      c.defaultWorldBookVolumeId = map[String(c.defaultWorldBookVolumeId)] || "";
      if (readChars().some((x) => x.displayName === c.displayName)) c.displayName = c.displayName + "（导入）";
      st.items.push(c);
      writeCharPersonaStore(st);
      try {
        if (typeof renderCharRoster === "function") renderCharRoster();
      } catch (_) {
        /* ignore */
      }
      return `角色「${c.displayName}」已加入角色库`;
    }
    if (payload.kind === "preset") {
      const meta = PRESET_SUBS[data.sub];
      if (!meta) throw new Error("不认识的预设类型");
      const list = readPresetList(data.sub);
      const names = new Set(list.map((x) => x.name));
      for (const it of data.items || []) {
        const x = { ...it, id: typeof newEntityId === "function" ? newEntityId() : "p_" + uid() };
        if (names.has(x.name)) x.name = (x.name || "预设") + "（导入）";
        list.push(x);
      }
      writePresetList(data.sub, list);
      return `已导入 ${data.items?.length || 0} 个${meta.name}，去对应页面的预设列表里使用`;
    }
    if (payload.kind === "font") {
      const d = window.XXJ_DB;
      const pre = d.getKv(d.K.GLOBAL_UI_TYPO_PRESETS);
      const list = Array.isArray(pre) ? pre.slice() : [];
      const entry = { ...data.font, id: typeof newEntityId === "function" ? newEntityId() : "f_" + uid(), name: payload.title || data.font?.name || "导入的字体" };
      if (list.some((x) => x && x.name === entry.name)) entry.name += "（导入）";
      list.push(entry);
      d.setKv(d.K.GLOBAL_UI_TYPO_PRESETS, list);
      if (typeof applyGlobalUiTypoPresetEntry === "function") applyGlobalUiTypoPresetEntry(entry);
      return `字体「${entry.name}」已导入并套用，可在「装扮 → 字体」里切换`;
    }
    return "完成";
  }


  async function makeCard(kind, ids, meta) {
    const exp = await buildExport(kind, ids, meta);
    const payload = {
      kind,
      v: 1,
      title: meta.title,
      author: meta.author,
      desc: meta.desc,
      createdAt: Date.now(),
      data: exp.data
    };
    const png = await drawCard({ kind, title: meta.title, author: meta.author, desc: meta.desc, cover: exp.cover, sub: exp.sub });
    return { blob: await embedPayload(png, payload), payload };
  }

  function downloadBlob(blob, name) {
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const safeName = (s) => String(s || "资源").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40);

  /* ═════════ 云端（Supabase REST） ═════════ */
  const BUCKET = "mx-shares";
  const COLS = "id,created_at,kind,title,description,author,file_path,thumb_path,size,downloads,likes";
  function cfg() {
    let local = {};
    try {
      local = JSON.parse(localStorage.getItem("mx_share_cfg") || "{}");
    } catch (_) {
      /* ignore */
    }
    const base = window.MX_SHARE_CONFIG || {};
    const url = String(local.url || base.url || "").trim().replace(/\/+$/, "");
    const key = String(local.anonKey || base.anonKey || "").trim();
    return url && key ? { url, key } : null;
  }
  async function api(path, opts) {
    const c = cfg();
    if (!c) throw new Error("资源站还没有配置云端");
    const o = opts || {};
    const res = await fetch(c.url + path, {
      method: o.method || "GET",
      headers: {
        apikey: c.key,
        // 旧版 anon key 是 JWT，需要同时放进 Authorization；新版 sb_publishable_ key 只放 apikey
        ...(/^eyJ/.test(c.key) ? { Authorization: "Bearer " + c.key } : {}),
        ...(o.json ? { "Content-Type": "application/json" } : {}),
        ...(o.headers || {})
      },
      body: o.json ? JSON.stringify(o.json) : o.body
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = text;
    }
    if (!res.ok) throw new Error((data && (data.message || data.error)) || "HTTP " + res.status);
    return data;
  }
  const publicUrl = (p) => `${cfg()?.url}/storage/v1/object/public/${BUCKET}/${p.split("/").map(encodeURIComponent).join("/")}`;

  async function sha256Hex(s) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function myTokens() {
    try {
      return JSON.parse(localStorage.getItem("mx_share_tokens") || "{}");
    } catch (_) {
      return {};
    }
  }
  function saveToken(id, t) {
    const m = myTokens();
    m[id] = t;
    localStorage.setItem("mx_share_tokens", JSON.stringify(m));
  }

  /** 列表用的小缩略图（省流量：完整卡约 400KB，缩略图约 15KB） */
  async function makeThumb(blob) {
    const url = URL.createObjectURL(blob);
    const img = await loadImg(url);
    URL.revokeObjectURL(url);
    if (!img) return null;
    const c = document.createElement("canvas");
    c.width = 240;
    c.height = 320;
    c.getContext("2d").drawImage(img, 0, 0, 240, 320);
    return new Promise((res) => c.toBlob((b) => res(b), "image/jpeg", 0.78));
  }

  async function uploadShare(blob, payload) {
    const token = uid() + uid() + uid();
    const base = `${payload.kind}/${Date.now()}-${uid()}`;
    const path = base + ".png";
    await api(`/storage/v1/object/${BUCKET}/${path}`, { method: "POST", body: blob, headers: { "Content-Type": "image/png", "x-upsert": "false" } });
    let thumbPath = "";
    try {
      const th = await makeThumb(blob);
      if (th) {
        await api(`/storage/v1/object/${BUCKET}/${base}.jpg`, { method: "POST", body: th, headers: { "Content-Type": "image/jpeg", "x-upsert": "false" } });
        thumbPath = base + ".jpg";
      }
    } catch (_) {
      /* 缩略图失败不影响上传 */
    }
    const rows = await api("/rest/v1/mx_shares?select=id", {
      method: "POST",
      json: {
        kind: payload.kind,
        title: payload.title.slice(0, 60),
        description: String(payload.desc || "").slice(0, 300),
        author: String(payload.author || "匿名").slice(0, 30),
        file_path: path,
        thumb_path: thumbPath,
        size: blob.size,
        owner_hash: await sha256Hex(token)
      },
      headers: { Prefer: "return=representation" }
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (row?.id) saveToken(row.id, token);
    return row;
  }

  /* ═════════ 界面 ═════════ */
  let root = null;
  let tab = "square";
  let filter = { kind: "", q: "", sort: "new" };
  let liked = new Set();
  try {
    liked = new Set(JSON.parse(localStorage.getItem("mx_share_liked") || "[]"));
  } catch (_) {
    /* ignore */
  }

  function renderShell() {
    root.innerHTML = `
      <div class="sh">
        <div class="sh-tabs">
          <button type="button" data-tab="square">广场</button>
          <button type="button" data-tab="make">制作卡片</button>
          <button type="button" data-tab="import">导入</button>
          <button type="button" data-tab="mine">我的上传</button>
        </div>
        <div class="sh-panel" id="sh-panel"></div>
      </div>`;
    root.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => switchTab(b.dataset.tab)));
    switchTab(tab);
  }

  function switchTab(t) {
    tab = t;
    root.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("is-on", b.dataset.tab === t));
    const p = root.querySelector("#sh-panel");
    if (t === "square") renderSquare(p);
    if (t === "make") renderMake(p);
    if (t === "import") renderImport(p);
    if (t === "mine") renderMine(p);
  }

  function noCloudHtml() {
    return `<div class="sh-empty"><div class="sh-empty-ico">☁️</div><p>广场还没开通</p>
      <small>站长需要在 <code>share-config.js</code> 里填好 Supabase 地址和 anon key（教程见仓库里的 SHARE-SETUP.md）。<br/>现在也可以先「制作卡片」下载 PNG，发给朋友后在「导入」里导入。</small></div>`;
  }

  function kindChips() {
    return `<div class="sh-chips">${[["", "全部"], ["look", "🎨 美化"], ["worldbook", "📖 世界书"], ["char", "🎭 角色卡"], ["preset", "🧩 预设"], ["font", "🔤 字体"]]
      .map(([k, n]) => `<button type="button" class="fun-chip-btn${filter.kind === k ? " is-on" : ""}" data-kind="${k}">${n}</button>`)
      .join("")}</div>`;
  }

  async function renderSquare(p) {
    if (!cfg()) {
      p.innerHTML = noCloudHtml();
      return;
    }
    p.innerHTML = `${kindChips()}
      <div class="sh-search"><input type="search" placeholder="搜索标题 / 作者" value="${esc(filter.q)}" /><select><option value="new">最新</option><option value="hot">最多下载</option><option value="like">最多点赞</option></select></div>
      <div class="sh-grid" id="sh-grid"><div class="sh-empty"><span class="fun-spin"></span></div></div>`;
    p.querySelector("select").value = filter.sort;
    p.querySelectorAll("[data-kind]").forEach((b) => (b.onclick = () => ((filter.kind = b.dataset.kind), renderSquare(p))));
    p.querySelector("select").onchange = (e) => ((filter.sort = e.target.value), renderSquare(p));
    let t;
    p.querySelector("input").oninput = (e) => {
      clearTimeout(t);
      t = setTimeout(() => {
        filter.q = e.target.value.trim();
        loadGrid(p.querySelector("#sh-grid"));
      }, 400);
    };
    loadGrid(p.querySelector("#sh-grid"));
  }

  async function loadGrid(grid, onlyIds) {
    const order = { new: "created_at.desc", hot: "downloads.desc,created_at.desc", like: "likes.desc,created_at.desc" }[filter.sort];
    let q = `/rest/v1/mx_shares?select=${COLS}&order=${order}&limit=60`;
    if (onlyIds) q += `&id=in.(${onlyIds.join(",")})`;
    else {
      if (filter.kind) q += `&kind=eq.${filter.kind}`;
      if (filter.q) {
        const s = encodeURIComponent(`*${filter.q.replace(/[,()*]/g, " ")}*`);
        q += `&or=(title.ilike.${s},author.ilike.${s})`;
      }
    }
    try {
      const rows = await api(q);
      if (!grid.isConnected) return;
      if (!rows.length) {
        grid.innerHTML = `<div class="sh-empty"><div class="sh-empty-ico">🪹</div><p>${onlyIds ? "你还没有上传过" : "这里还空空的"}</p><small>去「制作卡片」上传第一个吧</small></div>`;
        return;
      }
      grid.innerHTML = rows
        .map(
          (r) => `<button type="button" class="sh-item" data-id="${esc(r.id)}">
            <img src="${esc(publicUrl(r.thumb_path || r.file_path))}" alt="" loading="lazy" />
            <span class="sh-item-meta"><strong>${esc(r.title)}</strong><small>${KIND_META[r.kind]?.icon || ""} ${esc(r.author)} · ⬇${r.downloads || 0} · ♥${r.likes || 0}</small></span>
          </button>`
        )
        .join("");
      grid.querySelectorAll(".sh-item").forEach((b) => (b.onclick = () => openDetail(rows.find((r) => r.id === b.dataset.id), grid)));
    } catch (err) {
      if (grid.isConnected) grid.innerHTML = `<div class="sh-empty"><p>加载失败</p><small>${esc(err.message)}</small></div>`;
    }
  }

  function openDetail(r, grid) {
    const mine = !!myTokens()[r.id];
    const unlocked = () => mine || liked.has(r.id); // 自己上传的不用点赞
    const sh = F.openSheet(
      `<div class="sh-detail">
        <img src="${esc(publicUrl(r.file_path))}" alt="" />
        <p class="fun-note">${KIND_META[r.kind]?.icon} ${KIND_META[r.kind]?.name} · by ${esc(r.author)} · ${new Date(r.created_at).toLocaleDateString()} · ${(r.size / 1024).toFixed(0)}KB</p>
        ${r.description ? `<p class="sh-desc">${esc(r.description)}</p>` : ""}
        <div class="fun-sheet-actions">
          <button type="button" class="fun-btn ghost" data-a="like">${liked.has(r.id) ? "♥ 已赞" : "♡ 点赞"} ${r.likes || 0}</button>
          <button type="button" class="fun-btn ghost${unlocked() ? "" : " is-locked"}" data-a="dl">${unlocked() ? "" : "🔒 "}下载 PNG</button>
          <button type="button" class="fun-btn solid${unlocked() ? "" : " is-locked"}" data-a="import">${unlocked() ? "" : "🔒 "}导入</button>
        </div>
        ${unlocked() ? "" : `<p class="fun-note sh-like-tip">先点个赞支持一下作者，才能下载和导入哦</p>`}
        <div class="sh-detail-foot">${mine ? `<button type="button" class="sh-link" data-a="del">删除我的上传</button>` : `<button type="button" class="sh-link" data-a="report">举报</button>`}</div>
      </div>`,
      { title: r.title }
    );
    sh.el.classList.add("fun-sheet--tall");
    const fetchBlob = async () => {
      const res = await fetch(publicUrl(r.file_path));
      if (!res.ok) throw new Error("文件下载失败");
      api("/rest/v1/rpc/mx_share_download", { method: "POST", json: { p_id: r.id } }).catch(() => {});
      return res.blob();
    };
    sh.body.addEventListener("click", async (e) => {
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (!a) return;
      try {
        if (a === "like") {
          if (liked.has(r.id)) return;
          await api("/rest/v1/rpc/mx_share_like", { method: "POST", json: { p_id: r.id } });
          liked.add(r.id);
          localStorage.setItem("mx_share_liked", JSON.stringify([...liked]));
          r.likes = (r.likes || 0) + 1;
          e.target.closest("button").textContent = `♥ 已赞 ${r.likes}`;
          sh.body.querySelectorAll(".is-locked").forEach((x) => {
            x.classList.remove("is-locked");
            x.textContent = x.textContent.replace("🔒 ", "");
          });
          sh.body.querySelector(".sh-like-tip")?.remove();
          toast("点赞成功，现在可以导入啦");
          const card = grid?.querySelector?.(`[data-id="${CSS.escape(r.id)}"]`);
          if (card) card.classList.add("is-liked");
        }
        if ((a === "dl" || a === "import") && !unlocked()) {
          toast("要先点赞才能" + (a === "dl" ? "下载" : "导入") + "哦 ♡");
          const lb = sh.body.querySelector('[data-a="like"]');
          lb?.classList.add("sh-pulse");
          setTimeout(() => lb?.classList.remove("sh-pulse"), 900);
          return;
        }
        if (a === "dl") downloadBlob(await fetchBlob(), safeName(r.title) + ".png");
        if (a === "import") {
          const btn = e.target.closest("button");
          btn.disabled = true;
          btn.textContent = "导入中…";
          const payload = await extractPayload(await fetchBlob());
          if (!payload) throw new Error("这不是 Meow OS 资源卡");
          if (payload.kind === "look" && !(await confirmSheet("导入美化会覆盖你现在的装扮（壁纸、图标、字体、聊天样式等），继续吗？"))) {
            btn.disabled = false;
            btn.textContent = "导入";
            return;
          }
          toast(await applyImport(payload));
          sh.close();
        }
        if (a === "report") {
          await api("/rest/v1/rpc/mx_share_report", { method: "POST", json: { p_id: r.id } });
          toast("已举报，被多人举报后会自动隐藏");
        }
        if (a === "del") {
          if (!(await confirmSheet("确定删除这个上传吗？"))) return;
          const ok = await api("/rest/v1/rpc/mx_share_delete", { method: "POST", json: { p_id: r.id, p_token: myTokens()[r.id] } });
          if (!ok) throw new Error("删除失败");
          toast("已删除");
          sh.close();
          if (grid?.isConnected) grid.querySelector(`[data-id="${CSS.escape(r.id)}"]`)?.remove();
        }
      } catch (err) {
        toast("出错了：" + err.message);
        const btn = e.target.closest("button");
        if (btn && a === "import") {
          btn.disabled = false;
          btn.textContent = "导入";
        }
      }
    });
  }

  function confirmSheet(text) {
    return new Promise((resolve) => {
      let done = false;
      const fin = (v) => {
        if (!done) {
          done = true;
          resolve(v);
        }
      };
      const sh = F.openSheet(
        `<p class="sh-confirm">${esc(text)}</p><div class="fun-sheet-actions"><button type="button" class="fun-btn ghost" data-v="0">取消</button><button type="button" class="fun-btn solid" data-v="1">确定</button></div>`,
        { onClose: () => fin(false) }
      );
      sh.body.addEventListener("click", (e) => {
        const v = e.target.closest("[data-v]")?.dataset.v;
        if (v == null) return;
        fin(v === "1");
        sh.close();
      });
    });
  }

  let makeState = { kind: "char", ids: [], withBooks: true, sub: "theater" };
  async function renderMake(p) {
    await hydrateStores();
    const user = await F.loadUser();
    const chars = readChars();
    const vols = readVolumes();
    const k = makeState.kind;
    const list =
      k === "char"
        ? chars.map((c) => ({ id: String(c.id), name: c.displayName || "未命名", sub: String(c.summary || "").slice(0, 30) }))
        : k === "worldbook"
          ? vols.map((v) => ({ id: String(v.id), name: v.title || "未命名", sub: `${v.entries?.length || 0} 条` }))
          : k === "preset"
            ? readPresetList(makeState.sub).map((x) => ({ id: String(x.id), name: x.name || "未命名", sub: String(x.kind || x.css || x.instruction || x.stylePrompt || "").replace(/\s+/g, " ").slice(0, 30) }))
            : k === "font"
              ? readFonts().map((x) => ({ id: String(x.id), name: x.name || "未命名", sub: String(x.fontStack || x.faceFamily || "").slice(0, 30) + (x.faceSrcDataUrl ? " · 含字体文件" : "") }))
              : [];
    makeState.ids = makeState.ids.filter((id) => list.some((x) => x.id === id));
    if (k !== "look" && !makeState.ids.length && list.length) makeState.ids = [list[0].id];
    const defTitle = k === "look" ? `${user.name}的装扮` : k === "char" ? list.find((x) => x.id === makeState.ids[0])?.name || "" : list.find((x) => x.id === makeState.ids[0])?.name || "";
    p.innerHTML = `
      <div class="sh-make">
        <p class="fun-kicker">1 · 选择类型</p>
        <div class="sh-chips">${Object.entries(KIND_META)
          .map(([key, m]) => `<button type="button" class="fun-chip-btn${k === key ? " is-on" : ""}" data-mk="${key}">${m.icon} ${m.name}</button>`)
          .join("")}</div>
        <p class="fun-kicker">2 · 选择内容</p>
        ${k === "preset" ? `<div class="sh-chips">${Object.entries(PRESET_SUBS).map(([sk, m]) => `<button type="button" class="fun-chip-btn${makeState.sub === sk ? " is-on" : ""}" data-sub="${sk}">${m.name}</button>`).join("")}</div>` : ""}
        ${
          k === "look"
            ? `<p class="fun-note">会打包你当前的装扮：壁纸、主屏图标和背景、Dock、字体、密谈/晤面聊天样式。<b>不含</b>拍立得照片。</p>`
            : list.length
              ? `<div class="sh-pick">${list
                  .map((x) => `<button type="button" class="sh-pick-item${makeState.ids.includes(x.id) ? " is-on" : ""}" data-pid="${esc(x.id)}"><strong>${esc(x.name)}</strong><small>${esc(x.sub)}</small></button>`)
                  .join("")}</div>${
                  k === "char"
                    ? `<label class="fun-switch"><input type="checkbox" id="sh-withbooks" ${makeState.withBooks ? "checked" : ""}/><span>附带角色绑定的世界书</span></label>`
                    : k === "font"
                      ? `<p class="fun-note">带字体文件的卡会比较大（上限 10MB）。请只分享你有权分发的字体。</p>`
                      : `<p class="fun-note">可多选，打包成一张卡。</p>`
                }`
              : `<p class="fun-note warn">你还没有${k === "preset" ? PRESET_SUBS[makeState.sub].name : KIND_META[k].name}。${k === "font" ? "先去「装扮 → 字体」设置一个字体。" : ""}</p>`
        }
        <p class="fun-kicker">3 · 填写信息</p>
        <label class="fun-field"><span>标题</span><input id="sh-title" maxlength="40" value="${esc(defTitle)}" /></label>
        <label class="fun-field"><span>简介（选填）</span><textarea id="sh-desc" rows="2" maxlength="200" placeholder="风格、适用场景、注意事项…"></textarea></label>
        <label class="fun-field"><span>作者署名</span><input id="sh-author" maxlength="20" value="${esc(localStorage.getItem("mx_share_author") || user.name)}" /></label>
        <div class="sh-preview" id="sh-preview"></div>
        <div class="fun-setup-btns"><button type="button" class="fun-btn ghost" id="sh-dl">生成并下载 PNG</button><button type="button" class="fun-btn solid" id="sh-up" ${cfg() ? "" : "disabled"}>上传到广场</button></div>
        ${cfg() ? "" : `<p class="fun-note">广场未开通，暂时只能下载 PNG。</p>`}
      </div>`;
    p.querySelectorAll("[data-mk]").forEach((b) => (b.onclick = () => ((makeState.kind = b.dataset.mk), (makeState.ids = []), renderMake(p))));
    p.querySelectorAll("[data-sub]").forEach((b) => (b.onclick = () => ((makeState.sub = b.dataset.sub), (makeState.ids = []), renderMake(p))));
    p.querySelectorAll("[data-pid]").forEach(
      (b) =>
        (b.onclick = () => {
          const id = b.dataset.pid;
          if (k === "char" || k === "font") makeState.ids = [id];
          else makeState.ids = makeState.ids.includes(id) ? makeState.ids.filter((x) => x !== id) : [...makeState.ids, id];
          const t = p.querySelector("#sh-title");
          const keep = t.value;
          p.querySelectorAll("[data-pid]").forEach((x) => x.classList.toggle("is-on", makeState.ids.includes(x.dataset.pid)));
          if (k === "char" || k === "font" || !keep) t.value = list.find((x) => x.id === id)?.name || keep;
        })
    );
    p.querySelector("#sh-withbooks")?.addEventListener("change", (e) => (makeState.withBooks = e.target.checked));
    const go = async (upload) => {
      const meta = {
        title: p.querySelector("#sh-title").value.trim(),
        desc: p.querySelector("#sh-desc").value.trim(),
        author: p.querySelector("#sh-author").value.trim() || "匿名",
        withBooks: makeState.withBooks,
        sub: makeState.sub
      };
      if (!meta.title) return toast("填个标题吧");
      if (k !== "look" && !makeState.ids.length) return toast("先选内容");
      localStorage.setItem("mx_share_author", meta.author);
      const btns = p.querySelectorAll(".fun-setup-btns .fun-btn");
      btns.forEach((b) => (b.disabled = true));
      try {
        const { blob, payload } = await makeCard(k, makeState.ids, meta);
        const prev = p.querySelector("#sh-preview");
        prev.innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="预览" />`;
        if (blob.size > 9.5 * 1024 * 1024) throw new Error(`卡片 ${(blob.size / 1048576).toFixed(1)}MB，超过 10MB 上限（多半是图片太大）`);
        if (upload) {
          toast("上传中…");
          await uploadShare(blob, payload);
          toast("上传成功！");
          switchTab("mine");
        } else {
          downloadBlob(blob, safeName(meta.title) + ".mxj.png");
          toast("已生成，分享时请发「原图」或文件");
        }
      } catch (err) {
        toast("失败：" + err.message);
      } finally {
        btns.forEach((b) => (b.disabled = b.id === "sh-up" && !cfg()));
      }
    };
    p.querySelector("#sh-dl").onclick = () => go(false);
    p.querySelector("#sh-up").onclick = () => go(true);
  }

  function renderImport(p) {
    p.innerHTML = `<div class="sh-import">
      <div class="sh-drop" id="sh-drop"><div class="sh-empty-ico">🖼️</div><p>选择一张 Meow OS 资源卡（.png）</p><small>美化 / 世界书 / 角色卡 / 预设 / 字体都可以</small></div>
      <input type="file" accept="image/png" hidden />
      <div id="sh-import-info"></div></div>`;
    const inp = p.querySelector("input");
    const drop = p.querySelector("#sh-drop");
    drop.onclick = () => inp.click();
    drop.ondragover = (e) => e.preventDefault();
    drop.ondrop = (e) => {
      e.preventDefault();
      if (e.dataTransfer.files[0]) handle(e.dataTransfer.files[0]);
    };
    inp.onchange = () => {
      if (inp.files[0]) handle(inp.files[0]);
      inp.value = "";
    };
    async function handle(file) {
      const info = p.querySelector("#sh-import-info");
      try {
        const payload = await extractPayload(file);
        if (!payload) {
          info.innerHTML = `<p class="fun-note warn">这张图里没有 Meow OS 资源数据。可能不是资源卡，或者被聊天软件压缩过（请让对方发原图）。</p>`;
          return;
        }
        const m = KIND_META[payload.kind];
        const d = payload.data || {};
        const detail =
          payload.kind === "char"
            ? `角色：${esc(d.char?.displayName || "")}${d.volumes?.length ? `，附 ${d.volumes.length} 本世界书` : ""}`
            : payload.kind === "worldbook"
              ? `${d.volumes?.length || 0} 本：${esc((d.volumes || []).map((v) => v.title).join("、"))}`
              : payload.kind === "preset"
                ? `${esc(PRESET_SUBS[d.sub]?.name || "预设")} × ${d.items?.length || 0}：${esc((d.items || []).map((x) => x.name).join("、"))}`
                : payload.kind === "font"
                  ? `字体：${esc(d.font?.fontStack || d.font?.faceFamily || "")}${d.font?.faceSrcDataUrl ? "（含字体文件）" : ""}，导入后会立即套用`
                  : `${Object.keys(d.kv || {}).length} 项装扮配置（会覆盖现在的装扮）`;
        info.innerHTML = `<div class="sh-import-card"><img src="${URL.createObjectURL(file)}" alt="" />
          <div><p class="fun-kicker">${m.icon} ${m.name}</p><strong>${esc(payload.title)}</strong><p class="fun-note">by ${esc(payload.author || "匿名")}<br/>${detail}</p>
          ${payload.desc ? `<p class="fun-note">${esc(payload.desc)}</p>` : ""}
          <button type="button" class="fun-btn solid" id="sh-do-import">导入到本机</button></div></div>`;
        info.querySelector("#sh-do-import").onclick = async (e) => {
          if (payload.kind === "look" && !(await confirmSheet("导入美化会覆盖你现在的装扮，继续吗？"))) return;
          e.target.disabled = true;
          try {
            toast(await applyImport(payload));
            e.target.textContent = "已导入 ✓";
          } catch (err) {
            toast("导入失败：" + err.message);
            e.target.disabled = false;
          }
        };
      } catch (err) {
        info.innerHTML = `<p class="fun-note warn">读取失败：${esc(err.message)}</p>`;
      }
    }
  }

  function renderMine(p) {
    if (!cfg()) {
      p.innerHTML = noCloudHtml();
      return;
    }
    const ids = Object.keys(myTokens()).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    p.innerHTML = `<p class="fun-note">只记录在这台设备上传的；换设备或清缓存后就不能删除了。</p><div class="sh-grid" id="sh-grid"></div>`;
    const grid = p.querySelector("#sh-grid");
    if (!ids.length) {
      grid.innerHTML = `<div class="sh-empty"><div class="sh-empty-ico">📦</div><p>你还没有上传过</p></div>`;
      return;
    }
    loadGrid(grid, ids);
  }

  F.register("资源站", {
    title: "资源站",
    kicker: "SHARE / MXJ CARD",
    mount(body) {
      root = document.createElement("div");
      root.className = "sh-root";
      body.appendChild(root);
      renderShell();
    },
    unmount() {
      root = null;
    }
  });

  /* ───── 世界书 / 角色 / 装扮页里的「导入 Meow OS 卡」按钮 ───── */
  const KIND_WANT_NAME = { char: "角色卡", worldbook: "世界书", look: "美化" };
  let pngPicker = null;
  async function importPngFor(want) {
    if (!pngPicker) {
      pngPicker = document.createElement("input");
      pngPicker.type = "file";
      pngPicker.accept = "image/png";
      pngPicker.hidden = true;
      document.body.appendChild(pngPicker);
    }
    const file = await new Promise((res) => {
      pngPicker.value = "";
      pngPicker.onchange = () => res(pngPicker.files[0] || null);
      pngPicker.click();
    });
    if (!file) return;
    try {
      const payload = await extractPayload(file);
      if (!payload) {
        toast("这张图里没有 Meow OS 资源数据（可能不是资源卡，或被聊天软件压缩过，请要原图）");
        return;
      }
      const m = KIND_META[payload.kind] || {};
      if (payload.kind !== want) {
        if (!(await confirmSheet(`这是一张「${m.name || "资源"}」卡，不是${KIND_WANT_NAME[want]}。还要导入吗？`))) return;
      }
      if (payload.kind === "look" && !(await confirmSheet(`导入「${payload.title || "美化"}」会覆盖你现在的装扮（壁纸、图标、字体、聊天样式等），继续吗？`))) return;
      toast(await applyImport(payload));
      try {
        if (payload.kind === "worldbook" || payload.kind === "char") {
          if (typeof renderWorldBookList === "function") renderWorldBookList();
          if (typeof renderCharRoster === "function") renderCharRoster();
        }
      } catch (_) {
        /* ignore */
      }
    } catch (err) {
      toast("导入失败：" + err.message);
    }
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-mxpng]");
    if (!b) return;
    e.preventDefault();
    void importPngFor(b.dataset.mxpng);
  });

  window.XXJ_MXCARD = { embedPayload, extractPayload, drawCard, applyImport, makeCard, importPngFor };
})();
