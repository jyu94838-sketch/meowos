"use strict";

/**
 * 资源站：Meow 专属资源卡（.png）+ 共享广场（Supabase）
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

  /* ───── 可爱小猫系列卡面 ───── */
  const CAT_STYLE = {
    look: { fur: "#ffd9e6", dark: "#f3a6c0", bg1: "#fff0f5", bg2: "#ffd6e5", ink: "#c45d86", acc: "bow" },
    worldbook: { fur: "#dbe9ff", dark: "#9dbcf0", bg1: "#f1f6ff", bg2: "#d5e5ff", ink: "#4a6fa8", acc: "glasses" },
    char: { fur: "#e9e0ff", dark: "#b9a5f0", bg1: "#f6f2ff", bg2: "#e3d9ff", ink: "#7457c4", acc: "star" },
    preset: { fur: "#d8f5e6", dark: "#93d9b5", bg1: "#effcf5", bg2: "#d2f2e2", ink: "#2f8a63", acc: "leaf" },
    font: { fur: "#fff1c9", dark: "#f0cf6e", bg1: "#fffaea", bg2: "#ffedb8", ink: "#a37f12", acc: "pencil" }
  };
  function paw(ctx, x, y, r, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.35, r * 0.62, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    [[-0.62, -0.32], [-0.22, -0.68], [0.22, -0.68], [0.62, -0.32]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.ellipse(x + dx * r, y + dy * r, r * 0.22, r * 0.27, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }
  /** 一只圆滚滚的小猫头（cx, cy 为脸中心，r 为半径） */
  function drawCat(ctx, cx, cy, r, st) {
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const line = "#5b4a52";
    // 耳朵
    [-1, 1].forEach((sd) => {
      ctx.beginPath();
      ctx.moveTo(cx + sd * r * 0.92, cy - r * 0.18);
      ctx.quadraticCurveTo(cx + sd * r * 0.98, cy - r * 1.18, cx + sd * r * 0.42, cy - r * 0.82);
      ctx.closePath();
      ctx.fillStyle = st.fur;
      ctx.fill();
      ctx.lineWidth = r * 0.06;
      ctx.strokeStyle = line;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + sd * r * 0.8, cy - r * 0.32);
      ctx.quadraticCurveTo(cx + sd * r * 0.86, cy - r * 0.95, cx + sd * r * 0.52, cy - r * 0.72);
      ctx.closePath();
      ctx.fillStyle = "#ffc2d4";
      ctx.fill();
    });
    // 脸
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.05, r * 0.86, 0, 0, Math.PI * 2);
    ctx.fillStyle = st.fur;
    ctx.fill();
    ctx.lineWidth = r * 0.06;
    ctx.strokeStyle = line;
    ctx.stroke();
    // 额头花纹
    ctx.strokeStyle = st.dark;
    ctx.lineWidth = r * 0.07;
    [-0.18, 0, 0.18].forEach((dx) => {
      ctx.beginPath();
      ctx.moveTo(cx + dx * r, cy - r * 0.78);
      ctx.lineTo(cx + dx * r, cy - r * 0.58);
      ctx.stroke();
    });
    // 腮红
    ctx.fillStyle = "rgba(255,140,170,0.45)";
    [-1, 1].forEach((sd) => {
      ctx.beginPath();
      ctx.ellipse(cx + sd * r * 0.6, cy + r * 0.22, r * 0.17, r * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    // 眼睛（亮晶晶）
    [-1, 1].forEach((sd) => {
      const ex = cx + sd * r * 0.38;
      const ey = cy - r * 0.02;
      ctx.fillStyle = line;
      ctx.beginPath();
      ctx.ellipse(ex, ey, r * 0.12, r * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(ex - r * 0.04, ey - r * 0.06, r * 0.045, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + r * 0.04, ey + r * 0.05, r * 0.022, 0, Math.PI * 2);
      ctx.fill();
    });
    // 鼻子 + ω 嘴
    ctx.fillStyle = "#ff8fab";
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.07, cy + r * 0.13);
    ctx.lineTo(cx + r * 0.07, cy + r * 0.13);
    ctx.lineTo(cx, cy + r * 0.21);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.lineWidth = r * 0.045;
    ctx.beginPath();
    ctx.arc(cx - r * 0.09, cy + r * 0.24, r * 0.09, 0.15 * Math.PI, 0.95 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + r * 0.09, cy + r * 0.24, r * 0.09, 0.05 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    // 胡须
    ctx.lineWidth = r * 0.03;
    [-1, 1].forEach((sd) => {
      [-0.06, 0.08].forEach((dy) => {
        ctx.beginPath();
        ctx.moveTo(cx + sd * r * 0.72, cy + r * (0.14 + dy));
        ctx.lineTo(cx + sd * r * 1.18, cy + r * (0.08 + dy * 1.6));
        ctx.stroke();
      });
    });
    // 小配饰：每种资源一只不同的猫
    ctx.lineWidth = r * 0.05;
    if (st.acc === "bow") {
      const bx = cx + r * 0.62;
      const by = cy - r * 0.62;
      ctx.fillStyle = "#ff7aa2";
      [-1, 1].forEach((sd) => {
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + sd * r * 0.32, by - r * 0.16);
        ctx.lineTo(bx + sd * r * 0.32, by + r * 0.16);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      });
      ctx.beginPath();
      ctx.arc(bx, by, r * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (st.acc === "glasses") {
      ctx.strokeStyle = line;
      [-1, 1].forEach((sd) => {
        ctx.beginPath();
        ctx.arc(cx + sd * r * 0.38, cy - r * 0.02, r * 0.22, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.16, cy - r * 0.04);
      ctx.lineTo(cx + r * 0.16, cy - r * 0.04);
      ctx.stroke();
    } else if (st.acc === "star") {
      const sx = cx + r * 0.66;
      const sy = cy - r * 0.66;
      ctx.fillStyle = "#ffd34d";
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? r * 0.11 : r * 0.26;
        ctx.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (st.acc === "leaf") {
      ctx.fillStyle = "#6fcf97";
      ctx.beginPath();
      ctx.ellipse(cx + r * 0.1, cy - r * 1.0, r * 0.26, r * 0.12, -0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.86);
      ctx.lineTo(cx + r * 0.05, cy - r * 0.96);
      ctx.stroke();
    } else if (st.acc === "pencil") {
      ctx.save();
      ctx.translate(cx + r * 0.78, cy - r * 0.62);
      ctx.rotate(0.6);
      ctx.fillStyle = "#ffcf5a";
      ctx.fillRect(-r * 0.07, -r * 0.34, r * 0.14, r * 0.5);
      ctx.strokeRect(-r * 0.07, -r * 0.34, r * 0.14, r * 0.5);
      ctx.fillStyle = "#f6c7a0";
      ctx.beginPath();
      ctx.moveTo(-r * 0.07, r * 0.16);
      ctx.lineTo(r * 0.07, r * 0.16);
      ctx.lineTo(0, r * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  /** 小猫趴在框上：两只小爪子 */
  function catPaws(ctx, cx, y, r, st) {
    ctx.save();
    ctx.fillStyle = st.fur;
    ctx.strokeStyle = "#5b4a52";
    ctx.lineWidth = r * 0.06;
    [-1, 1].forEach((sd) => {
      ctx.beginPath();
      ctx.ellipse(cx + sd * r * 0.55, y, r * 0.24, r * 0.17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = r * 0.035;
      [-0.08, 0.08].forEach((dx) => {
        ctx.beginPath();
        ctx.moveTo(cx + sd * r * 0.55 + dx * r, y + r * 0.02);
        ctx.lineTo(cx + sd * r * 0.55 + dx * r, y + r * 0.13);
        ctx.stroke();
      });
      ctx.lineWidth = r * 0.06;
    });
    ctx.restore();
  }

  async function drawCard({ kind, title, author, desc, cover, sub }) {
    const m = KIND_META[kind];
    const st = CAT_STYLE[kind] || CAT_STYLE.look;
    const W = 720;
    const H = 960;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    const font = '"PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif';
    // 底色 + 散落的小爪印
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, st.bg1);
    g.addColorStop(1, st.bg2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    [[60, 40, 14], [660, 120, 18], [30, 520, 16], [690, 640, 14], [120, 930, 18], [600, 920, 12], [360, 22, 10]].forEach(([x, y, r]) => paw(ctx, x, y, r, "rgba(255,255,255,0.75)"));
    // 白色卡片
    ctx.save();
    ctx.shadowColor = "rgba(120,80,100,0.16)";
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 12;
    roundRect(ctx, 48, 70, W - 96, H - 130, 44);
    ctx.fillStyle = "#fffdfb";
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.setLineDash([10, 9]);
    ctx.strokeStyle = st.dark;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2.5;
    roundRect(ctx, 64, 86, W - 128, H - 162, 34);
    ctx.stroke();
    ctx.restore();
    // 封面窗
    const cx = 92;
    const cy = 214;
    const cw = W - 184;
    const ch = 300;
    const img = await loadImg(cover);
    ctx.save();
    roundRect(ctx, cx, cy, cw, ch, 30);
    ctx.clip();
    if (img) {
      const s = Math.max(cw / img.width, ch / img.height);
      ctx.drawImage(img, cx + (cw - img.width * s) / 2, cy + (ch - img.height * s) / 2, img.width * s, img.height * s);
    } else {
      const g2 = ctx.createLinearGradient(cx, cy, cx + cw, cy + ch);
      g2.addColorStop(0, st.bg2);
      g2.addColorStop(1, st.fur);
      ctx.fillStyle = g2;
      ctx.fillRect(cx, cy, cw, ch);
      for (let yy = cy + 30; yy < cy + ch; yy += 70)
        for (let xx = cx + ((yy / 70) % 2 ? 30 : 65); xx < cx + cw; xx += 90) paw(ctx, xx, yy, 13, "rgba(255,255,255,0.6)");
      ctx.fillStyle = st.ink;
      ctx.globalAlpha = 0.85;
      ctx.font = `bold 46px ${font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${m.icon} ${m.name}`, W / 2, cy + ch / 2 + 46);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.save();
    roundRect(ctx, cx, cy, cw, ch, 30);
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#5b4a52";
    ctx.stroke();
    ctx.restore();
    // 趴在封面上的小猫
    drawCat(ctx, W / 2, cy - 22, 82, st);
    catPaws(ctx, W / 2, cy + 4, 82, st);
    // 类型小标签
    ctx.textBaseline = "middle";
    ctx.font = `bold 22px ${font}`;
    const tag = `🐾 MEOW CARD · ${m.name}`;
    const tw = ctx.measureText(tag).width + 36;
    roundRect(ctx, cx, cy + ch + 30, tw, 42, 21);
    ctx.fillStyle = st.bg2;
    ctx.fill();
    ctx.fillStyle = st.ink;
    ctx.textAlign = "left";
    ctx.fillText(tag, cx + 18, cy + ch + 52);
    // 标题（先量好行数，再排副标题，避免重叠）
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#3d3036";
    ctx.font = `bold 40px ${font}`;
    const tLines = wrapText(ctx, title || "未命名", cw, 2);
    const ty = cy + ch + 124;
    tLines.forEach((l, i) => ctx.fillText(l, cx, ty + i * 52));
    ctx.font = `24px ${font}`;
    ctx.fillStyle = "#8a7c83";
    const dy = ty + (tLines.length - 1) * 52 + 44;
    wrapText(ctx, desc || sub || "", cw, 2).forEach((l, i) => ctx.fillText(l, cx, dy + i * 34));
    // 底栏
    ctx.save();
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = st.dark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, H - 184);
    ctx.lineTo(cx + cw, H - 184);
    ctx.stroke();
    ctx.restore();
    paw(ctx, cx + 12, H - 142, 13, st.dark);
    ctx.font = `bold 24px ${font}`;
    ctx.fillStyle = "#3d3036";
    ctx.fillText(`by ${author || "匿名"}`, cx + 34, H - 134);
    ctx.font = `18px ${font}`;
    ctx.fillStyle = "#a99ba2";
    ctx.fillText("Meow 专属资源卡 · 只能在 Meow 里导入", cx, H - 104);
    // 右下角小猫印章
    ctx.save();
    ctx.translate(W - 150, H - 140);
    ctx.rotate(-0.15);
    ctx.beginPath();
    ctx.arc(0, 0, 50, 0, Math.PI * 2);
    ctx.fillStyle = st.bg1;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = st.ink;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    drawCat(ctx, 0, 6, 26, st);
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
      if (data.skinChat) {
        try {
          localStorage.setItem("meowos_skin_chat", String(data.skinChat));
          window.XXJ_SKINS?.apply?.();
        } catch (_) {
          /* ignore */
        }
      }
      try {
        if (data.chatCssOnly && typeof wardrobeChatCssBundleDraft !== "undefined") wardrobeChatCssBundleDraft = null;
      } catch (_) {
        /* ignore */
      }
      return data.chatCssOnly ? `聊天样式已应用${data.skinChat ? "（风格包也切过去了）" : ""}` : "美化已应用";
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
  const COLS0 = "id,created_at,kind,title,description,author,file_path,thumb_path,size,downloads,likes";
  /** 分类：云端还没运行 share-category.sql 时自动退回不带分类 */
  /** 每种资源各自的分类 */
  const CATS = {
    look: ["简约", "可爱", "清新", "暗黑", "复古", "梦幻", "二次元", "其他"],
    worldbook: ["现代", "古风", "校园", "奇幻", "科幻", "末世", "悬疑", "其他"],
    char: ["现代", "古风", "校园", "奇幻", "科幻", "末世", "甜宠", "虐心", "搞笑", "其他"],
    preset: ["文风", "剧情", "日常", "恋爱", "玩法", "其他"],
    font: ["中文", "英文", "手写", "可爱", "艺术", "其他"]
  };
  const catsOf = (kind) => CATS[kind] || ["其他"];
  let hasCat = true;
  let hasExtras = true;
  const cols = () => (hasCat ? COLS0 + ",category" : COLS0) + (hasExtras ? ",extras" : "") + (typeof hasOwner !== "undefined" && hasOwner ? ",owner_user,updated_at" : "");
  const isCatErr = (err) => /category/i.test(String(err && err.message));
  const isExtrasErr = (err) => /extras/i.test(String(err && err.message));
  const NEED_ATTACH_SQL = "站长需要先在 Supabase 里运行一次 share-attach.sql，才能在一个帖子里带多张图片和文件";
  function catChips(cur, attr, withAll, kind) {
    const list = (withAll ? [["", "全部分类"]] : []).concat(catsOf(kind).map((c) => [c, c]));
    return `<div class="sh-chips sh-cats">${list.map(([v, n]) => `<button type="button" class="fun-chip-btn${cur === v ? " is-on" : ""}" ${attr}="${esc(v)}">${esc(n)}</button>`).join("")}</div>`;
  }
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

  async function uploadShare(blob, payload, category, atts) {
    const token = uid() + uid() + uid();
    const base = `${payload.kind}/${Date.now()}-${uid()}`;
    const list = Array.isArray(atts) ? atts.slice(0, 12) : [];
    if (list.length && !hasExtras) throw new Error(NEED_ATTACH_SQL);
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
    // 附件：图片存 JPG / PNG，资源卡存 PNG，其他文件一律当「下载文件」存
    const extras = [];
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const ext = a.type === "image" ? (a.blob.type === "image/png" ? "png" : "jpg") : a.type === "card" ? "png" : (String(a.name).match(/\.([a-z0-9]{1,6})$/i)?.[1] || "bin").toLowerCase();
      const ctype = a.type === "image" ? a.blob.type || "image/jpeg" : a.type === "card" ? "image/png" : "application/octet-stream";
      const pth = `${base}-a${i + 1}.${ext}`;
      try {
        await api(`/storage/v1/object/${BUCKET}/${pth}`, { method: "POST", body: a.blob, headers: { "Content-Type": ctype, "x-upsert": "false" } });
      } catch (err) {
        if (/mime|type/i.test(err.message) && a.type === "file") throw new Error(NEED_ATTACH_SQL);
        throw new Error(`附件「${a.name}」上传失败：${err.message}`);
      }
      extras.push({ type: a.type, path: pth, name: String(a.name || "").slice(0, 80), size: a.blob.size });
    }
    const rowData = {
      kind: payload.kind,
      title: String(payload.title || "未命名").slice(0, 60),
      description: String(payload.desc || "").slice(0, 300),
      author: String(payload.author || "匿名").slice(0, 30),
      file_path: path,
      thumb_path: thumbPath,
      size: blob.size,
      owner_hash: await sha256Hex(token),
      ...(extras.length ? { extras } : {})
    };
    const insert = async (data) => {
      try {
        return await api("/rest/v1/mx_shares?select=id", { method: "POST", json: data, headers: { Prefer: "return=representation" } });
      } catch (err) {
        if (isExtrasErr(err)) {
          hasExtras = false;
          throw new Error(NEED_ATTACH_SQL);
        }
        throw err;
      }
    };
    let rows;
    if (hasCat && category) {
      try {
        rows = await insert({ ...rowData, category: String(category).slice(0, 20) });
      } catch (err) {
        if (isExtrasErr(err)) {
          hasExtras = false;
          throw new Error(NEED_ATTACH_SQL);
        }
        if (!isCatErr(err)) throw err;
        hasCat = false; // 云端还没加分类字段
        rows = await insert(rowData);
      }
    } else rows = await insert(rowData);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (row?.id) saveToken(row.id, token);
    // 有账号：马上归到账号下（署名也会变成账号昵称）
    const me = acc();
    if (row?.id && me) await rpc("mx_share_claim", { p_share: row.id, p_token: token, p_id: me.id, p_secret: me.secret }).catch(() => {});
    return row;
  }

  /* ═════════ 界面 ═════════ */
  let root = null;
  let tab = "square";
  let filter = { kind: "", cat: "", q: "", sort: "new" };
  let liked = new Set();
  try {
    liked = new Set(JSON.parse(localStorage.getItem("mx_share_liked") || "[]"));
  } catch (_) {
    /* ignore */
  }

  function renderShell() {
    root.innerHTML = `
      <div class="sh">
        <div class="sh-notice" role="note" style="display:flex;gap:8px;align-items:flex-start;margin:0 0 10px;padding:9px 12px;border-radius:14px;background:#fff6dc;border:1px solid #f3dc9a;color:#7a5a12;font-size:12.5px;line-height:1.5">
          <span aria-hidden="true">💡</span><span>温馨提示：Meow 为开源机，请确保上传的文件为可公开文件～</span>
        </div>
        <div class="sh-tabs">
          <button type="button" data-tab="square">广场</button>
          <button type="button" data-tab="make">制作卡片</button>
          <button type="button" data-tab="upload">批量上传</button>
          <button type="button" data-tab="import">导入</button>
          <button type="button" data-tab="mine">我的</button>
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
    if (t === "upload") renderBatch(p);
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
    p.innerHTML = `${kindChips()}${hasCat && filter.kind ? catChips(filter.cat, "data-fcat", true, filter.kind) : ""}
      <div class="sh-search"><input type="search" placeholder="搜索标题 / 作者" value="${esc(filter.q)}" /><select><option value="new">最新</option><option value="hot">最多下载</option><option value="like">最多点赞</option></select></div>
      <div class="sh-grid" id="sh-grid"><div class="sh-empty"><span class="fun-spin"></span></div></div>`;
    p.querySelector("select").value = filter.sort;
    p.querySelectorAll("[data-kind]").forEach((b) => (b.onclick = () => ((filter.kind = b.dataset.kind), (filter.cat = ""), renderSquare(p))));
    p.querySelectorAll("[data-fcat]").forEach((b) => (b.onclick = () => ((filter.cat = b.dataset.fcat), renderSquare(p))));
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

  let hasOwner = true;
  async function loadGrid(grid, onlyIds, ownerId) {
    const order = { new: "created_at.desc", hot: "downloads.desc,created_at.desc", like: "likes.desc,created_at.desc" }[filter.sort];
    let q = `/rest/v1/mx_shares?select=${cols()}&order=${order}&limit=60`;
    if (ownerId && hasOwner) q += onlyIds && onlyIds.length ? `&or=(owner_user.eq.${encodeURIComponent(ownerId)},id.in.(${onlyIds.join(",")}))` : `&owner_user=eq.${encodeURIComponent(ownerId)}`;
    else if (onlyIds) q += `&id=in.(${onlyIds.length ? onlyIds.join(",") : "00000000-0000-0000-0000-000000000000"})`;
    else {
      if (filter.kind) q += `&kind=eq.${filter.kind}`;
      if (filter.cat && hasCat) q += `&category=eq.${encodeURIComponent(filter.cat)}`;
      if (filter.q) {
        const s = encodeURIComponent(`*${filter.q.replace(/[,()*]/g, " ")}*`);
        q += `&or=(title.ilike.${s},author.ilike.${s})`;
      }
    }
    try {
      let rows;
      try {
        rows = await api(q);
      } catch (err) {
        if (hasExtras && isExtrasErr(err)) {
          hasExtras = false; // 云端还没运行 share-attach.sql
          return loadGrid(grid, onlyIds, ownerId);
        }
        if (hasOwner && /owner_user|updated_at/i.test(String(err.message))) {
          hasOwner = false; // 云端还没运行 share-account.sql
          return loadGrid(grid, onlyIds, ownerId);
        }
        if (!hasCat || !isCatErr(err)) throw err;
        hasCat = false; // 云端还没运行 share-category.sql
        return loadGrid(grid, onlyIds, ownerId);
      }
      if (!grid.isConnected) return;
      if (!rows.length) {
        grid.innerHTML = `<div class="sh-empty"><div class="sh-empty-ico">🪹</div><p>${onlyIds || ownerId ? "你还没有上传过" : "这里还空空的"}</p><small>去「制作卡片」上传第一个吧</small></div>`;
        return;
      }
      grid.innerHTML = rows
        .map(
          (r) => `<button type="button" class="sh-item${liked.has(r.id) || isMine(r) ? " is-liked" : ""}" data-id="${esc(r.id)}" style="position:relative">
            <img src="${esc(publicUrl(r.thumb_path || r.file_path))}" alt="" loading="lazy" />
            <span class="sh-badges" style="position:absolute;top:8px;right:8px;display:flex;gap:4px;pointer-events:none">${Array.isArray(r.extras) && r.extras.length ? `<span class="sh-badge" style="padding:2px 8px;border-radius:99px;background:rgba(0,0,0,.55);color:#fff;font-size:11px">📎 ${r.extras.length}</span>` : ""}${liked.has(r.id) || isMine(r) ? "" : `<span class="sh-badge sh-lock" style="padding:2px 7px;border-radius:99px;background:rgba(0,0,0,.55);color:#fff;font-size:11px">🔒</span>`}</span>
            <span class="sh-item-meta"><strong>${esc(r.title)}</strong><small>${KIND_META[r.kind]?.icon || ""}${r.category ? " " + esc(r.category) + " ·" : ""} ${esc(r.author)} · ⬇${r.downloads || 0} · ♥${r.likes || 0}</small></span>
          </button>`
        )
        .join("");
      grid.querySelectorAll(".sh-item").forEach((b) => (b.onclick = () => openDetail(rows.find((r) => r.id === b.dataset.id), grid)));
    } catch (err) {
      if (grid.isConnected) grid.innerHTML = `<div class="sh-empty"><p>加载失败</p><small>${esc(err.message)}</small></div>`;
    }
  }

  /** 帖子里的附图（随便看）和附件（点赞后才能下载 / 导入） */
  function extrasHtml(r, open) {
    const ex = Array.isArray(r.extras) ? r.extras : [];
    if (!ex.length) return "";
    const imgs = ex.map((x, i) => ({ ...x, i })).filter((x) => x.type === "image");
    const files = ex.map((x, i) => ({ ...x, i })).filter((x) => x.type !== "image");
    const lock = open ? "" : "🔒 ";
    const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + "MB" : Math.max(1, Math.round(n / 1024)) + "KB");
    return `${
      imgs.length
        ? `<div class="sh-ximgs" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:10px 0">${imgs
            .map((x) => `<button type="button" data-a="zoom" data-src="${esc(publicUrl(x.path))}" style="padding:0;border:0;background:none;aspect-ratio:1;border-radius:10px;overflow:hidden"><img src="${esc(publicUrl(x.path))}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;margin:0;border-radius:0"/></button>`)
            .join("")}</div>`
        : ""
    }${
      files.length
        ? `<div class="sh-xfiles" style="display:flex;flex-direction:column;gap:6px;margin:10px 0">${files
            .map(
              (x) => `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;border:1px solid var(--line);background:var(--bg-card)"><span style="font-size:20px">${x.type === "card" ? "🎴" : "📄"}</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px">${esc(x.name || "附件")}<small style="display:block;color:var(--text-sub);font-size:11px">${x.type === "card" ? "Meow 资源卡 · " : ""}${kb(x.size || 0)}</small></span>${
                x.type === "card" ? `<button type="button" class="fun-btn solid sm${open ? "" : " is-locked"}" data-a="ximp" data-i="${x.i}">${lock}导入</button>` : ""
              }<button type="button" class="fun-btn ghost sm${open ? "" : " is-locked"}" data-a="xdl" data-i="${x.i}">${lock}下载</button></div>`
            )
            .join("")}</div>`
        : ""
    }`;
  }

  const isMine = (r) => !!myTokens()[r.id] || (!!r.owner_user && r.owner_user === acc()?.id);
  /* ───── 帖子评论区（用资源站账号评论） ───── */
  const NEED_CMT_SQL = "站长需要先在 Supabase 里运行一次 share-comments.sql，才能开评论区";
  const cmtAgo = (s) => {
    const t = (Date.now() - Date.parse(s)) / 1000;
    if (t < 60) return "刚刚";
    if (t < 3600) return Math.floor(t / 60) + " 分钟前";
    if (t < 86400) return Math.floor(t / 3600) + " 小时前";
    if (t < 86400 * 30) return Math.floor(t / 86400) + " 天前";
    return new Date(s).toLocaleDateString();
  };
  async function drawComments(sh, r, scrollToEnd) {
    const box = sh.body.querySelector("#sh-cmts");
    if (!box) return;
    let rows;
    try {
      rows = await api(`/rest/v1/mx_share_comments?select=id,created_at,user_id,body,reply_to&share_id=eq.${encodeURIComponent(r.id)}&order=created_at.asc&limit=300`);
    } catch (err) {
      box.innerHTML = `<p class="fun-note">${/mx_share_comments|does not exist|404|PGRST/i.test(err.message) ? "评论区还没开通。" + NEED_CMT_SQL : "评论加载失败：" + esc(err.message)}</p>`;
      return;
    }
    if (!box.isConnected) return;
    await loadProfiles(rows.map((x) => x.user_id));
    const me = acc();
    const nickOf = (uid0) => profCache.get(uid0)?.nick || "某位用户";
    const byId = new Map(rows.map((x) => [x.id, x]));
    const canDel = (c) => me && (c.user_id === me.id || r.owner_user === me.id);
    box.innerHTML = `<p class="fun-kicker" style="margin:0 0 8px">评论 ${rows.length}</p>
      <div class="sh-cmt-list" style="display:flex;flex-direction:column;gap:12px">${
        rows
          .map((c) => {
            const pf = profCache.get(c.user_id);
            const rp = c.reply_to ? byId.get(c.reply_to) : null;
            const isAuthor = r.owner_user && c.user_id === r.owner_user;
            return `<div class="sh-cmt" data-cid="${c.id}" style="display:flex;gap:10px;align-items:flex-start">${avHtmlS(pf?.avatar_path || "", nickOf(c.user_id), 32)}<div style="flex:1;min-width:0">
              <div style="display:flex;gap:6px;align-items:baseline;flex-wrap:wrap"><b style="font-size:13px">${esc(nickOf(c.user_id))}</b>${isAuthor ? `<span style="font-size:10px;padding:0 6px;border-radius:99px;background:#ffe3a6;color:#7a5a12">作者</span>` : ""}<small style="color:var(--text-sub);font-size:11px">${cmtAgo(c.created_at)}</small></div>
              <p style="margin:3px 0 4px;font-size:13.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word">${rp ? `<span style="color:var(--text-sub)">回复 @${esc(nickOf(rp.user_id))}：</span>` : ""}${esc(c.body)}</p>
              <div style="display:flex;gap:14px;font-size:12px;color:var(--text-sub)"><button type="button" class="sh-link" data-cr="${c.id}" style="font-size:12px">回复</button>${canDel(c) ? `<button type="button" class="sh-link" data-cd="${c.id}" style="font-size:12px">删除</button>` : `<button type="button" class="sh-link" data-crep="${c.id}" style="font-size:12px">举报</button>`}</div>
            </div></div>`;
          })
          .join("") || `<p class="fun-note" style="margin:0">还没有评论，来说说用起来怎么样吧～</p>`
      }</div>
      ${
        me
          ? `<form class="sh-cmt-bar" style="display:flex;gap:8px;align-items:center;margin-top:12px;position:sticky;bottom:0;padding:8px 0;background:var(--bg-card, #fff)">${avHtmlS(me.avatar_path, me.nick, 30)}<div style="flex:1;min-width:0"><small class="sh-cmt-to" style="display:none;color:var(--text-sub);font-size:11px"></small><input type="text" maxlength="500" placeholder="以「${esc(me.nick)}」评论…" enterkeyhint="send" style="width:100%;box-sizing:border-box;padding:9px 12px;border-radius:99px;border:1px solid var(--line);background:var(--bg-card);color:var(--text-main);font:inherit;font-size:13.5px"/></div><button type="submit" class="fun-btn solid sm">发送</button></form>`
          : `<div style="margin-top:12px;text-align:center"><button type="button" class="fun-btn ghost sm" data-cacc="1">建个资源站账号就能评论</button></div>`
      }`;
    if (scrollToEnd) box.querySelector(".sh-cmt-list")?.lastElementChild?.scrollIntoView({ block: "center" });
    let replyTo = null;
    const form = box.querySelector(".sh-cmt-bar");
    const inp = form?.querySelector("input");
    const toLbl = form?.querySelector(".sh-cmt-to");
    box.onclick = async (e) => {
      if (e.target.closest("[data-cacc]")) return accountSheet("new", () => drawComments(sh, r));
      const cr = e.target.closest("[data-cr]");
      if (cr) {
        if (!me) return accountSheet("new", () => drawComments(sh, r));
        const c = byId.get(Number(cr.dataset.cr));
        replyTo = c ? c.id : null;
        if (toLbl && c) {
          toLbl.style.display = "block";
          toLbl.innerHTML = `回复 @${esc(nickOf(c.user_id))} <button type="button" class="sh-link" data-cx="1" style="font-size:11px">取消</button>`;
        }
        inp?.focus();
        return;
      }
      if (e.target.closest("[data-cx]")) {
        replyTo = null;
        if (toLbl) toLbl.style.display = "none";
        return;
      }
      const cd = e.target.closest("[data-cd]");
      if (cd) {
        if (!(await confirmSheet("删除这条评论？"))) return;
        try {
          const ok = await rpc("mx_share_comment_del", { p_cid: Number(cd.dataset.cd), p_id: me.id, p_secret: me.secret });
          if (!ok) throw new Error("删除失败");
          toast("已删除");
          void drawComments(sh, r);
        } catch (err) {
          toast(err.message);
        }
        return;
      }
      const crep = e.target.closest("[data-crep]");
      if (crep) {
        if (!(await confirmSheet("举报这条评论？被多人举报后会自动隐藏。"))) return;
        rpc("mx_share_comment_report", { p_cid: Number(crep.dataset.crep) }).then(() => toast("已举报，谢谢你"), (er) => toast(er.message));
      }
    };
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const t = String(inp.value || "").trim();
      if (!t) return;
      inp.disabled = true;
      try {
        const id = await rpc("mx_share_comment_add", { p_share: r.id, p_id: me.id, p_secret: me.secret, p_body: t, p_reply: replyTo });
        if (id === -2) throw new Error("评论太快啦，歇一会儿再发");
        if (!(Number(id) > 0)) throw new Error("评论失败");
        void drawComments(sh, r, true);
      } catch (err) {
        toast(missingFn(err) ? NEED_CMT_SQL : /logged/i.test(err.message) ? "账号验证没通过，去「我的」里重新登录一下" : err.message);
        inp.disabled = false;
      }
    });
  }

  function openDetail(r, grid) {
    const mine = isMine(r);
    const ownedByAcc = !!r.owner_user && r.owner_user === acc()?.id;
    const unlocked = () => mine || liked.has(r.id); // 自己上传的不用点赞
    const sh = F.openSheet(
      `<div class="sh-detail">
        <img src="${esc(publicUrl(r.file_path))}" alt="" />
        <div class="sh-author" style="display:flex;align-items:center;gap:8px;margin:8px 0 2px" data-owner="${esc(r.owner_user || "")}">${avHtmlS("", r.author, 30)}<b style="font-size:14px">${esc(r.author)}</b>${r.updated_at ? `<small style="color:var(--text-sub);font-size:11px">· 编辑于 ${new Date(r.updated_at).toLocaleDateString()}</small>` : ""}</div>
        <p class="fun-note">${KIND_META[r.kind]?.icon} ${KIND_META[r.kind]?.name}${r.category ? " · " + esc(r.category) : ""} · ${new Date(r.created_at).toLocaleDateString()} · ${(r.size / 1024).toFixed(0)}KB</p>
        ${r.description ? `<p class="sh-desc">${esc(r.description)}</p>` : ""}
        ${extrasHtml(r, unlocked())}
        <div class="fun-sheet-actions">
          <button type="button" class="fun-btn ghost" data-a="like">${liked.has(r.id) ? "♥ 已赞" : "♡ 点赞"} ${r.likes || 0}</button>
          <button type="button" class="fun-btn ghost${unlocked() ? "" : " is-locked"}" data-a="dl">${unlocked() ? "" : "🔒 "}下载 PNG</button>
          <button type="button" class="fun-btn solid${unlocked() ? "" : " is-locked"}" data-a="import">${unlocked() ? "" : "🔒 "}导入</button>
        </div>
        ${unlocked() ? "" : `<p class="fun-note sh-like-tip">先点个赞支持一下作者，才能下载和导入哦</p>`}
        <div class="sh-detail-foot">${mine ? `<button type="button" class="sh-link" data-a="edit">编辑</button>　<button type="button" class="sh-link" data-a="del">删除我的上传</button>` : `<button type="button" class="sh-link" data-a="report">举报</button>`}</div>
        <div class="sh-cmts" id="sh-cmts" style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px"><p class="fun-note">评论加载中…</p></div>
      </div>`,
      { title: r.title }
    );
    sh.el.classList.add("fun-sheet--tall");
    void drawComments(sh, r);
    // 作者头像
    if (r.owner_user) {
      void loadProfiles([r.owner_user]).then(() => {
        const pf = profCache.get(r.owner_user);
        const box = sh.body.querySelector(".sh-author");
        if (pf && box) box.innerHTML = `${avHtmlS(pf.avatar_path, pf.nick, 30)}<b style="font-size:14px">${esc(pf.nick)}</b>${pf.bio ? `<small style="color:var(--text-sub);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(pf.bio)}</small>` : ""}${r.updated_at ? `<small style="color:var(--text-sub);font-size:11px;flex:none">· 编辑于 ${new Date(r.updated_at).toLocaleDateString()}</small>` : ""}`;
      });
    }
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
          if (card) {
            card.classList.add("is-liked");
            card.querySelector(".sh-lock")?.remove();
          }
        }
        if ((a === "dl" || a === "import" || a === "xdl" || a === "ximp") && !unlocked()) {
          toast("要先点赞才能" + (a === "dl" ? "下载" : "导入") + "哦 ♡");
          const lb = sh.body.querySelector('[data-a="like"]');
          lb?.classList.add("sh-pulse");
          setTimeout(() => lb?.classList.remove("sh-pulse"), 900);
          return;
        }
        if (a === "dl") downloadBlob(await fetchBlob(), safeName(r.title) + ".png");
        if (a === "zoom") {
          const src = e.target.closest("[data-src]")?.dataset.src;
          if (src) F.openSheet(`<img src="${esc(src)}" alt="" style="width:100%;border-radius:12px"/>`, { title: "图片" });
        }
        if (a === "xdl" || a === "ximp") {
          const x = (r.extras || [])[Number(e.target.closest("[data-i]")?.dataset.i)];
          if (!x) return;
          const btn = e.target.closest("button");
          const old = btn.textContent;
          btn.disabled = true;
          btn.textContent = a === "xdl" ? "下载中…" : "导入中…";
          try {
            const res = await fetch(publicUrl(x.path));
            if (!res.ok) throw new Error("文件下载失败");
            const b = await res.blob();
            api("/rest/v1/rpc/mx_share_download", { method: "POST", json: { p_id: r.id } }).catch(() => {});
            if (a === "xdl") downloadBlob(b, x.name || x.path.split("/").pop());
            else {
              const payload = await extractPayload(b);
              if (!payload) throw new Error("这不是 Meow 资源卡");
              if (payload.kind === "look" && !(await confirmSheet(payload.data?.chatCssOnly ? "导入会覆盖你现在的聊天界面样式，继续吗？" : "导入美化会覆盖你现在的装扮（壁纸、图标、字体、聊天样式等），继续吗？"))) return;
              toast(await applyImport(payload));
            }
          } finally {
            btn.disabled = false;
            btn.textContent = old;
          }
        }
        if (a === "import") {
          const btn = e.target.closest("button");
          btn.disabled = true;
          btn.textContent = "导入中…";
          const payload = await extractPayload(await fetchBlob());
          if (!payload) throw new Error("这不是 Meow 资源卡");
          if (payload.kind === "look" && !(await confirmSheet(payload.data?.chatCssOnly ? "导入会覆盖你现在的聊天界面样式，继续吗？" : "导入美化会覆盖你现在的装扮（壁纸、图标、字体、聊天样式等），继续吗？"))) {
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
        if (a === "edit") {
          const me = acc();
          if (!me) {
            toast("先在「我的」里创建资源站账号，就能编辑了（会自动认领你在这台手机上传的东西）");
            return;
          }
          if (!ownedByAcc) {
            // 这台手机用凭证传的、还没归到账号下：先认领
            const tok = myTokens()[r.id];
            const ok = tok ? await rpcAcc("mx_share_claim", { p_share: r.id, p_token: tok, p_id: me.id, p_secret: me.secret }).catch(() => false) : false;
            if (!ok) throw new Error("这个上传不在你的账号下");
            r.owner_user = me.id;
          }
          sh.close();
          editSheet(r, () => {
            if (grid?.isConnected) {
              if (tab === "mine") switchTab("mine");
              else loadGrid(grid);
            }
          });
          return;
        }
        if (a === "del") {
          if (!(await confirmSheet("确定删除这个上传吗？"))) return;
          const me = acc();
          const ok = ownedByAcc && me
            ? await rpcAcc("mx_share_delete_user", { p_share: r.id, p_id: me.id, p_secret: me.secret })
            : await api("/rest/v1/rpc/mx_share_delete", { method: "POST", json: { p_id: r.id, p_token: myTokens()[r.id] } });
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

  let makeState = { kind: "char", ids: [], withBooks: true, sub: "theater", cat: "" };
  /** 「制作卡片」里一起上传的附图 / 附件 */
  let makeAtts = [];
  /** 附图压成 JPG，长边 1600 */
  async function shrinkForShare(file) {
    const url = URL.createObjectURL(file);
    const img = await loadImg(url);
    URL.revokeObjectURL(url);
    if (!img) return null;
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round((img.naturalWidth || img.width) * k));
    c.height = Math.max(1, Math.round((img.naturalHeight || img.height) * k));
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return new Promise((res) => c.toBlob((b) => res(b), "image/jpeg", 0.86));
  }
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
        ${acc() ? `<p class="fun-note">以资源站账号「${esc(acc().nick)}」发布，上传后可以在「我的」里反复编辑。</p><input id="sh-author" type="hidden" value="${esc(acc().nick)}" />` : `<label class="fun-field"><span>作者署名</span><input id="sh-author" maxlength="20" value="${esc(localStorage.getItem("mx_share_author") || user.name)}" /></label><p class="fun-note">建个资源站账号（「我的」里）就能用自己的头像昵称发布，还能随时编辑上传。</p>`}
        <p class="fun-kicker">4 · 选择分类</p>
        ${catChips(makeState.cat, "data-mcat", false, makeState.kind)}
        <p class="fun-kicker">5 · 附图 / 附件（可选）</p>
        <p class="fun-note">可以再加几张效果图、别的资源卡或文件（txt / json / docx / zip / 字体…），最多 9 个，每个 10MB 以内。别人点赞以后才能下载附件。</p>
        <div class="sh-atts" id="sh-atts" style="display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 8px"></div>
        <button type="button" class="fun-btn ghost sm" id="sh-att-add">＋ 添加图片或文件</button>
        <input type="file" id="sh-att-file" multiple hidden accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.json,.css,.docx,.zip,.ttf,.otf,.woff,.woff2" />
        <div class="sh-preview" id="sh-preview"></div>
        <div class="fun-setup-btns"><button type="button" class="fun-btn ghost" id="sh-dl">生成并下载 PNG</button><button type="button" class="fun-btn solid" id="sh-up" ${cfg() ? "" : "disabled"}>上传到广场</button></div>
        ${cfg() ? "" : `<p class="fun-note">广场未开通，暂时只能下载 PNG。</p>`}
      </div>`;
    p.querySelectorAll("[data-mk]").forEach((b) => (b.onclick = () => ((makeState.kind = b.dataset.mk), (makeState.ids = []), (makeState.cat = ""), renderMake(p))));
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
    const drawAtts = () => {
      const box = p.querySelector("#sh-atts");
      if (!box) return;
      box.innerHTML = makeAtts
        .map(
          (a, i) =>
            `<span style="position:relative;display:inline-flex;align-items:center;gap:6px;max-width:160px;padding:4px 26px 4px 4px;border-radius:12px;border:1px solid var(--line);background:var(--bg-card);font-size:12px">${
              a.type === "file" ? `<span style="font-size:20px;padding:0 4px">📄</span>` : `<img src="${a.url}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:8px;margin:0"/>`
            }<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.type === "card" ? "🎴 " : ""}${esc(a.name)}</span><button type="button" data-attdel="${i}" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);border:0;background:none;color:inherit;opacity:.6">✕</button></span>`
        )
        .join("");
      box.querySelectorAll("[data-attdel]").forEach((b) => (b.onclick = () => (makeAtts.splice(Number(b.dataset.attdel), 1), drawAtts())));
    };
    drawAtts();
    const attInp = p.querySelector("#sh-att-file");
    p.querySelector("#sh-att-add").onclick = () => attInp.click();
    attInp.onchange = async () => {
      for (const f of [...attInp.files]) {
        if (makeAtts.length >= 9) {
          toast("最多 9 个附件");
          break;
        }
        if (f.size > 10 * 1024 * 1024) {
          toast(`「${f.name}」超过 10MB 了`);
          continue;
        }
        const isImg = /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif)$/i.test(f.name);
        if (isImg) {
          // 先看是不是 Meow 资源卡（卡片要原样保存，不能压缩）
          let isCard = false;
          if (/png/i.test(f.type) || /\.png$/i.test(f.name)) {
            try {
              isCard = !!(await extractPayload(f));
            } catch (_) {
              isCard = false;
            }
          }
          if (isCard) {
            makeAtts.push({ type: "card", name: f.name, blob: f, url: URL.createObjectURL(f) });
            continue;
          }
          const small = await shrinkForShare(f);
          if (!small) {
            toast(`「${f.name}」打不开`);
            continue;
          }
          makeAtts.push({ type: "image", name: f.name, blob: small, url: URL.createObjectURL(small) });
        } else makeAtts.push({ type: "file", name: f.name, blob: f, url: "" });
      }
      attInp.value = "";
      drawAtts();
    };
    p.querySelectorAll("[data-mcat]").forEach(
      (b) =>
        (b.onclick = () => {
          makeState.cat = b.dataset.mcat;
          p.querySelectorAll("[data-mcat]").forEach((x) => x.classList.toggle("is-on", x === b));
        })
    );
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
      if (upload && !makeState.cat) return toast("选一个分类再上传");
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
          await uploadShare(blob, payload, makeState.cat, makeAtts);
          makeAtts = [];
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

  /* ───── 批量上传：一次选好几张做好的资源卡 ───── */
  let batch = { items: [], cat: "" };
  function renderBatch(p) {
    if (!cfg()) {
      p.innerHTML = noCloudHtml();
      return;
    }
    const ok = batch.items.filter((x) => x.payload);
    const pending = ok.filter((x) => x.status !== "done");
    const kinds = [...new Set(ok.map((x) => x.payload.kind))];
    const oneKind = kinds.length === 1 ? kinds[0] : "";
    p.innerHTML = `<div class="sh-batch">
      <div class="sh-drop" id="sh-bdrop"><div class="sh-empty-ico">📤</div><p>${batch.items.length ? "继续添加资源卡" : "选择要上传的资源卡（可以一次选好几张）"}</p><small>只能上传 Meow 资源卡 PNG；在「制作卡片」里生成并下载的都可以</small></div>
      <input type="file" accept="image/png" multiple hidden />
      ${
        batch.items.length
          ? `${
              oneKind
                ? `<p class="fun-kicker">选择分类（全部套用，也可以单独改）</p>${catChips(batch.cat, "data-bcat", false, oneKind)}`
                : `<p class="fun-note">这次选的卡片类型不一样，请在每张下面单独选分类。</p>`
            }
        <div class="sh-blist">${batch.items
          .map((x, i) =>
            x.payload
              ? `<div class="sh-brow" data-i="${i}">
              <img src="${x.url}" alt="" />
              <div class="sh-brow-main">
                <small>${KIND_META[x.payload.kind]?.icon || ""} ${KIND_META[x.payload.kind]?.name || ""} · ${(x.file.size / 1024).toFixed(0)}KB</small>
                <input class="sh-btitle" maxlength="40" value="${esc(x.title)}" ${x.status === "done" ? "disabled" : ""} />
                <div class="sh-brow-foot">
                  <select class="sh-bcat" ${x.status === "done" ? "disabled" : ""}><option value="">选分类</option>${catsOf(x.payload.kind).map((c) => `<option${x.cat === c ? " selected" : ""}>${c}</option>`).join("")}</select>
                  <span class="sh-bstat ${x.status || ""}">${x.status === "done" ? "✓ 已上传" : x.status === "up" ? "上传中…" : x.status === "err" ? "失败：" + esc(x.err || "") : ""}</span>
                </div>
              </div>
              ${x.status === "done" || x.status === "up" ? "" : `<button type="button" class="sh-brm" data-rm="${i}" aria-label="移除">✕</button>`}
            </div>`
              : `<div class="sh-brow is-bad"><div class="sh-brow-main"><strong>${esc(x.file.name)}</strong><small>不是 Meow 资源卡（或被压缩过），不能上传</small></div><button type="button" class="sh-brm" data-rm="${i}" aria-label="移除">✕</button></div>`
          )
          .join("")}</div>
        <div class="fun-setup-btns">
          <button type="button" class="fun-btn ghost" id="sh-bclear">清空列表</button>
          <button type="button" class="fun-btn solid" id="sh-bgo" ${pending.length ? "" : "disabled"}>上传全部（${pending.length}）</button>
        </div>`
          : ""
      }
    </div>`;
    const inp = p.querySelector("input[type=file]");
    const drop = p.querySelector("#sh-bdrop");
    drop.onclick = () => inp.click();
    drop.ondragover = (e) => e.preventDefault();
    drop.ondrop = (e) => {
      e.preventDefault();
      void addFiles([...e.dataTransfer.files]);
    };
    inp.onchange = () => {
      const fs = [...inp.files];
      inp.value = "";
      void addFiles(fs);
    };
    async function addFiles(files) {
      for (const f of files) {
        let payload = null;
        try {
          payload = await extractPayload(f);
        } catch (_) {
          payload = null;
        }
        batch.items.push({ file: f, payload, url: URL.createObjectURL(f), title: payload ? String(payload.title || f.name.replace(/\.(mxj\.)?png$/i, "")) : "", cat: payload && catsOf(payload.kind).includes(batch.cat) ? batch.cat : "", status: "" });
      }
      renderBatch(p);
    }
    const syncInputs = () => {
      p.querySelectorAll(".sh-brow[data-i]").forEach((row) => {
        const x = batch.items[Number(row.dataset.i)];
        if (!x || x.status === "done") return;
        x.title = row.querySelector(".sh-btitle").value.trim();
        x.cat = row.querySelector(".sh-bcat").value;
      });
    };
    p.querySelectorAll("[data-bcat]").forEach(
      (b) =>
        (b.onclick = () => {
          syncInputs();
          batch.cat = b.dataset.bcat;
          batch.items.forEach((x) => x.payload && x.status !== "done" && (x.cat = batch.cat));
          renderBatch(p);
        })
    );
    p.querySelectorAll("[data-rm]").forEach(
      (b) =>
        (b.onclick = () => {
          syncInputs();
          batch.items.splice(Number(b.dataset.rm), 1);
          renderBatch(p);
        })
    );
    p.querySelector("#sh-bclear")?.addEventListener("click", () => {
      batch = { items: [], cat: batch.cat };
      renderBatch(p);
    });
    p.querySelector("#sh-bgo")?.addEventListener("click", async () => {
      syncInputs();
      const todo = batch.items.filter((x) => x.payload && x.status !== "done");
      const noCat = todo.filter((x) => !x.cat);
      if (noCat.length) return toast(`还有 ${noCat.length} 张没选分类`);
      const noTitle = todo.filter((x) => !x.title);
      if (noTitle.length) return toast(`还有 ${noTitle.length} 张没填标题`);
      let okN = 0;
      for (const x of todo) {
        x.status = "up";
        renderBatch(p);
        try {
          if (x.file.size > 9.5 * 1024 * 1024) throw new Error("超过 10MB");
          await uploadShare(x.file, { ...x.payload, title: x.title }, x.cat);
          x.status = "done";
          okN++;
        } catch (err) {
          x.status = "err";
          x.err = err.message;
        }
      }
      renderBatch(p);
      toast(okN === todo.length ? `全部上传成功（${okN} 个）` : `上传了 ${okN} 个，${todo.length - okN} 个失败`);
    });
  }

  function renderImport(p) {
    p.innerHTML = `<div class="sh-import">
      <div class="sh-drop" id="sh-drop"><div class="sh-empty-ico">🖼️</div><p>选择一张 Meow 资源卡（.png）</p><small>美化 / 世界书 / 角色卡 / 预设 / 字体都可以</small></div>
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
          info.innerHTML = `<p class="fun-note warn">这张图里没有 Meow 资源数据。可能不是资源卡，或者被聊天软件压缩过（请让对方发原图）。</p>`;
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
          if (payload.kind === "look" && !(await confirmSheet(payload.data?.chatCssOnly ? "导入会覆盖你现在的聊天界面样式，继续吗？" : "导入美化会覆盖你现在的装扮，继续吗？"))) return;
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

  /* ═════════ 资源站个人账号：昵称 / 头像 / 上传跟着账号走 ═════════ */
  const ACC_KEY = "mx_share_account";
  const NEED_ACC_SQL = "站长需要先在 Supabase 里运行一次 share-account.sql，才能用资源站账号";
  function acc() {
    try {
      const a = JSON.parse(localStorage.getItem(ACC_KEY) || "null");
      return a && a.id && a.secret ? a : null;
    } catch (_) {
      return null;
    }
  }
  function saveAcc(a) {
    try {
      if (a) localStorage.setItem(ACC_KEY, JSON.stringify(a));
      else localStorage.removeItem(ACC_KEY);
    } catch (_) {
      /* ignore */
    }
  }
  const rpc = (fn, args) => api(`/rest/v1/rpc/${fn}`, { method: "POST", json: args });
  const missingFn = (err) => /could not find|PGRST202|does not exist|404/i.test(String(err && err.message));
  async function rpcAcc(fn, args) {
    try {
      return await rpc(fn, args);
    } catch (err) {
      if (missingFn(err)) throw new Error(NEED_ACC_SQL);
      throw err;
    }
  }
  const loginCode = (a) => `MEOW-${a.id}-${a.secret}`;
  function parseLoginCode(s) {
    const t = String(s || "").trim();
    const m = t.match(/MEOW-([A-Z0-9]{6,12})-([a-f0-9]{24,})/i) || t.match(/^([A-Z0-9]{6,12})\s+([a-f0-9]{24,})$/i);
    return m ? { id: m[1].toUpperCase(), secret: m[2].toLowerCase() } : null;
  }
  const randSecret = () => {
    const a = new Uint8Array(20);
    crypto.getRandomValues(a);
    return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
  };
  const avatarUrl = (p) => (p ? publicUrl(p) : "");
  const avHtmlS = (path, nick, size) =>
    path
      ? `<img src="${esc(avatarUrl(path))}" alt="" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex:none;margin:0"/>`
      : `<span style="width:${size}px;height:${size}px;border-radius:50%;flex:none;display:grid;place-items:center;background:linear-gradient(135deg,#ffd6e4,#d9c8ff);color:#7a4f68;font-weight:700;font-size:${Math.round(size * 0.42)}px">${esc(String(nick || "?").slice(0, 1))}</span>`;
  async function uploadAvatar(file) {
    const url = URL.createObjectURL(file);
    const img = await loadImg(url);
    URL.revokeObjectURL(url);
    if (!img) throw new Error("这张图片打不开");
    const S = 256;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const m = Math.min(w, h);
    c.getContext("2d").drawImage(img, (w - m) / 2, (h - m) / 2, m, m, 0, 0, S, S);
    const blob = await new Promise((res) => c.toBlob((b) => res(b), "image/jpeg", 0.86));
    const path = `avatar/${Date.now()}-${uid()}.jpg`;
    try {
      await api(`/storage/v1/object/${BUCKET}/${path}`, { method: "POST", body: blob, headers: { "Content-Type": "image/jpeg", "x-upsert": "false" } });
    } catch (err) {
      if (/policy|row-level|403|unauthorized/i.test(err.message)) throw new Error(NEED_ACC_SQL);
      throw err;
    }
    return path;
  }
  /** 这台手机上用凭证传过的帖子，认领到账号下 */
  async function claimLocal(a) {
    const toks = myTokens();
    let n = 0;
    for (const [id, tok] of Object.entries(toks)) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) continue;
      try {
        if (await rpc("mx_share_claim", { p_share: id, p_token: tok, p_id: a.id, p_secret: a.secret })) n++;
      } catch (_) {
        /* 已经认领过 / 不是自己的 */
      }
    }
    return n;
  }
  /** 头像 / 昵称缓存（广场和详情里显示作者头像用） */
  const profCache = new Map();
  async function loadProfiles(ids) {
    const need = [...new Set(ids.filter((x) => x && !profCache.has(x)))];
    if (!need.length) return;
    try {
      const rows = await api(`/rest/v1/mx_share_users?select=id,nick,avatar_path,bio&id=in.(${need.map(encodeURIComponent).join(",")})`);
      for (const r of rows || []) profCache.set(r.id, r);
    } catch (_) {
      /* 没开账号功能 */
    }
    for (const id of need) if (!profCache.has(id)) profCache.set(id, null);
  }

  /** 创建账号 / 登录 / 编辑资料 */
  function accountSheet(mode, done) {
    const a = acc();
    const editing = mode === "edit" && a;
    let avatarFile = null;
    const sh = F.openSheet(
      mode === "login"
        ? `<div class="sh-acc">
            <p class="fun-note">在原来的手机上打开「资源站 → 我的 → 登录码」复制，粘贴到这里。也可以直接用 Meow 的备份恢复，账号会一起回来。</p>
            <label class="fun-field"><span>登录码</span><textarea id="sha-code" rows="3" placeholder="MEOW-XXXXXXXX-……"></textarea></label>
            <button type="button" class="fun-btn solid wide" data-x="login">登录</button>
          </div>`
        : `<div class="sh-acc" style="display:flex;flex-direction:column;gap:12px">
            <div style="display:flex;align-items:center;gap:14px">
              <button type="button" data-x="av" style="border:0;background:none;padding:0;position:relative" aria-label="换头像"><span id="sha-av">${avHtmlS(editing ? a.avatar_path : "", editing ? a.nick : "?", 72)}</span><small style="position:absolute;right:-4px;bottom:-2px;background:var(--bg-card);border:1px solid var(--line);border-radius:99px;padding:1px 6px;font-size:11px">换</small></button>
              <p class="fun-note" style="margin:0">点头像可以换一张，会自动裁成圆形。</p>
            </div>
            <input type="file" id="sha-file" accept="image/*" hidden />
            <label class="fun-field"><span>昵称</span><input id="sha-nick" maxlength="20" value="${esc(editing ? a.nick : localStorage.getItem("mx_share_author") || "")}" placeholder="在资源站显示的名字" /></label>
            <label class="fun-field"><span>一句话简介（可不填）</span><input id="sha-bio" maxlength="80" value="${esc(editing ? a.bio || "" : "")}" placeholder="比如：做美化的小猫" /></label>
            <button type="button" class="fun-btn solid wide" data-x="save">${editing ? "保存" : "创建账号"}</button>
            ${editing ? "" : `<p class="fun-note">创建后你在这台手机上传过的东西会自动归到账号下。账号存在 Meow 的备份里，换手机用备份或「登录码」就能找回。</p>`}
          </div>`,
      { title: mode === "login" ? "登录资源站账号" : editing ? "编辑资料" : "创建资源站账号" }
    );
    const fileInp = sh.body.querySelector("#sha-file");
    fileInp?.addEventListener("change", () => {
      const f = fileInp.files[0];
      if (!f) return;
      avatarFile = f;
      const u = URL.createObjectURL(f);
      sh.body.querySelector("#sha-av").innerHTML = `<img src="${u}" alt="" style="width:72px;height:72px;border-radius:50%;object-fit:cover;margin:0"/>`;
    });
    sh.body.addEventListener("click", async (e) => {
      const x = e.target.closest("[data-x]")?.dataset.x;
      if (!x) return;
      if (x === "av") return fileInp.click();
      const btn = e.target.closest("button");
      btn.disabled = true;
      const old = btn.textContent;
      btn.textContent = "请稍等…";
      try {
        if (x === "login") {
          const c = parseLoginCode(sh.body.querySelector("#sha-code").value);
          if (!c) throw new Error("登录码格式不对");
          const prof = await rpcAcc("mx_su_login", { p_id: c.id, p_secret: c.secret });
          if (!prof || !prof.id) throw new Error("登录码不对，或者账号不存在");
          const na = { id: prof.id, secret: c.secret, nick: prof.nick, avatar_path: prof.avatar_path || "", bio: prof.bio || "" };
          saveAcc(na);
          const n = await claimLocal(na);
          sh.close();
          toast(`欢迎回来，${na.nick}${n ? `（又认领了 ${n} 个上传）` : ""}`);
          done?.();
          return;
        }
        const nick = sh.body.querySelector("#sha-nick").value.trim();
        const bio = sh.body.querySelector("#sha-bio").value.trim();
        if (!nick) throw new Error("起个昵称吧");
        const avatarPath = avatarFile ? await uploadAvatar(avatarFile) : null;
        if (editing) {
          const ok = await rpcAcc("mx_su_update", { p_id: a.id, p_secret: a.secret, p_nick: nick, p_avatar: avatarPath, p_bio: bio });
          if (!ok) throw new Error("保存失败：账号验证没通过");
          saveAcc({ ...a, nick, bio, avatar_path: avatarPath == null ? a.avatar_path : avatarPath });
          profCache.delete(a.id);
          sh.close();
          toast("资料已更新，你发过的帖子署名也一起改了");
        } else {
          const secret = randSecret();
          const id = await rpcAcc("mx_su_register", { p_secret: secret, p_nick: nick, p_avatar: avatarPath || "" });
          if (!id) throw new Error("创建失败");
          const na = { id: String(id), secret, nick, bio, avatar_path: avatarPath || "" };
          if (bio) await rpc("mx_su_update", { p_id: na.id, p_secret: secret, p_nick: nick, p_avatar: null, p_bio: bio }).catch(() => {});
          saveAcc(na);
          localStorage.setItem("mx_share_author", nick);
          const n = await claimLocal(na);
          sh.close();
          toast(`账号建好啦${n ? `，已把之前的 ${n} 个上传归到你名下` : ""}`);
        }
        done?.();
      } catch (err) {
        toast(err.message);
        btn.disabled = false;
        btn.textContent = old;
      }
    });
  }

  /** 把一个本地文件变成附件（附图压缩；资源卡原样；其他文件原样） */
  async function fileToAtt(f) {
    if (f.size > 10 * 1024 * 1024) {
      toast(`「${f.name}」超过 10MB 了`);
      return null;
    }
    const isImg = /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif)$/i.test(f.name);
    if (!isImg) return { type: "file", name: f.name, blob: f, url: "" };
    if (/png/i.test(f.type) || /\.png$/i.test(f.name)) {
      let isCard = false;
      try {
        isCard = !!(await extractPayload(f));
      } catch (_) {
        isCard = false;
      }
      if (isCard) return { type: "card", name: f.name, blob: f, url: URL.createObjectURL(f) };
    }
    const small = await shrinkForShare(f);
    if (!small) {
      toast(`「${f.name}」打不开`);
      return null;
    }
    return { type: "image", name: f.name, blob: small, url: URL.createObjectURL(small) };
  }
  async function uploadAtts(kind, list) {
    const base = `${kind}/${Date.now()}-${uid()}`;
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const ext = a.type === "image" ? (a.blob.type === "image/png" ? "png" : "jpg") : a.type === "card" ? "png" : (String(a.name).match(/\.([a-z0-9]{1,6})$/i)?.[1] || "bin").toLowerCase();
      const ctype = a.type === "image" ? a.blob.type || "image/jpeg" : a.type === "card" ? "image/png" : "application/octet-stream";
      const pth = `${base}-a${i + 1}.${ext}`;
      try {
        await api(`/storage/v1/object/${BUCKET}/${pth}`, { method: "POST", body: a.blob, headers: { "Content-Type": ctype, "x-upsert": "false" } });
      } catch (err) {
        if (/mime|type/i.test(err.message) && a.type === "file") throw new Error(NEED_ATTACH_SQL);
        throw new Error(`附件「${a.name}」上传失败：${err.message}`);
      }
      out.push({ type: a.type, path: pth, name: String(a.name || "").slice(0, 80), size: a.blob.size });
    }
    return out;
  }

  /** 编辑自己的帖子：标题 / 简介 / 分类 / 附件 / 换主卡片，可以改很多次 */
  function editSheet(r, onDone) {
    const a = acc();
    if (!a) {
      toast("先在「我的」里创建资源站账号，就能编辑自己的上传了");
      return;
    }
    let cat = r.category || "";
    let keep = (Array.isArray(r.extras) ? r.extras : []).slice();
    let adds = [];
    let newCard = null;
    const sh = F.openSheet(
      `<div class="sh-edit" style="display:flex;flex-direction:column;gap:10px">
        <label class="fun-field"><span>标题</span><input id="she-title" maxlength="40" value="${esc(r.title)}" /></label>
        <label class="fun-field"><span>简介</span><textarea id="she-desc" rows="3" maxlength="200">${esc(r.description || "")}</textarea></label>
        ${hasCat ? `<p class="fun-kicker">分类</p>${catChips(cat, "data-ecat", false, r.kind)}` : ""}
        <p class="fun-kicker">附图 / 附件</p>
        <div id="she-atts" style="display:flex;flex-wrap:wrap;gap:8px"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="fun-btn ghost sm" data-x="add">＋ 添加图片或文件</button><button type="button" class="fun-btn ghost sm" data-x="card">🔁 换主卡片</button></div>
        <input type="file" id="she-file" multiple hidden accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.json,.css,.docx,.zip,.ttf,.otf,.woff,.woff2" />
        <input type="file" id="she-card" hidden accept="image/png" />
        <p class="fun-note" id="she-card-note">${esc(KIND_META[r.kind]?.name || "")}卡：不换就保留原来的。</p>
        <button type="button" class="fun-btn solid wide" data-x="save">保存修改</button>
      </div>`,
      { title: "编辑上传" }
    );
    sh.el.classList.add("fun-sheet--tall");
    const drawAtts = () => {
      const chip = (label, thumb, key) =>
        `<span style="position:relative;display:inline-flex;align-items:center;gap:6px;max-width:160px;padding:4px 26px 4px 4px;border-radius:12px;border:1px solid var(--line);background:var(--bg-card);font-size:12px">${thumb}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</span><button type="button" data-rm="${key}" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);border:0;background:none;color:inherit;opacity:.6">✕</button></span>`;
      const th = (x, url) => (x.type === "file" ? `<span style="font-size:20px;padding:0 4px">📄</span>` : `<img src="${esc(url)}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:8px;margin:0"/>`);
      const box = sh.body.querySelector("#she-atts");
      box.innerHTML =
        keep.map((x, i) => chip(`${x.type === "card" ? "🎴 " : ""}${esc(x.name || "附件")}`, th(x, publicUrl(x.path)), "k" + i)).join("") +
        adds.map((x, i) => chip(`<b style="color:#e0864a">新</b> ${esc(x.name)}`, th(x, x.url), "a" + i)).join("") ||
        `<p class="fun-note" style="margin:0">还没有附件</p>`;
    };
    drawAtts();
    const fi = sh.body.querySelector("#she-file");
    const ci = sh.body.querySelector("#she-card");
    fi.addEventListener("change", async () => {
      for (const f of [...fi.files]) {
        if (keep.length + adds.length >= 12) {
          toast("一个帖子最多 12 个附件");
          break;
        }
        const x = await fileToAtt(f);
        if (x) adds.push(x);
      }
      fi.value = "";
      drawAtts();
    });
    ci.addEventListener("change", async () => {
      const f = ci.files[0];
      ci.value = "";
      if (!f) return;
      const pl = await extractPayload(f).catch(() => null);
      if (!pl) return toast("这不是 Meow 资源卡");
      if (pl.kind !== r.kind) return toast(`要换成同类型的卡（${KIND_META[r.kind]?.name}）`);
      newCard = f;
      sh.body.querySelector("#she-card-note").textContent = `新主卡片：${f.name}（保存后生效）`;
    });
    sh.body.addEventListener("click", async (e) => {
      const ec = e.target.closest("[data-ecat]");
      if (ec) {
        cat = ec.dataset.ecat;
        sh.body.querySelectorAll("[data-ecat]").forEach((b) => b.classList.toggle("is-on", b === ec));
        return;
      }
      const rm = e.target.closest("[data-rm]");
      if (rm) {
        const k = rm.dataset.rm;
        if (k[0] === "k") keep.splice(Number(k.slice(1)), 1);
        else adds.splice(Number(k.slice(1)), 1);
        return drawAtts();
      }
      const x = e.target.closest("[data-x]")?.dataset.x;
      if (x === "add") return fi.click();
      if (x === "card") return ci.click();
      if (x !== "save") return;
      const title = sh.body.querySelector("#she-title").value.trim();
      if (!title) return toast("标题不能空");
      const btn = e.target.closest("button");
      btn.disabled = true;
      btn.textContent = "保存中…";
      try {
        const newEx = adds.length ? await uploadAtts(r.kind, adds) : [];
        let filePath = "";
        let thumbPath = "";
        if (newCard) {
          const base = `${r.kind}/${Date.now()}-${uid()}`;
          filePath = base + ".png";
          await api(`/storage/v1/object/${BUCKET}/${filePath}`, { method: "POST", body: newCard, headers: { "Content-Type": "image/png", "x-upsert": "false" } });
          const t = await makeThumb(newCard).catch(() => null);
          if (t) {
            await api(`/storage/v1/object/${BUCKET}/${base}.jpg`, { method: "POST", body: t, headers: { "Content-Type": "image/jpeg", "x-upsert": "false" } }).catch(() => {});
            thumbPath = base + ".jpg";
          }
        }
        const extras = keep.concat(newEx);
        const ok = await rpcAcc("mx_share_edit", {
          p_share: r.id,
          p_id: a.id,
          p_secret: a.secret,
          p_title: title,
          p_desc: sh.body.querySelector("#she-desc").value.trim(),
          p_category: cat,
          p_extras: extras,
          p_file_path: filePath,
          p_thumb_path: thumbPath,
          p_size: newCard ? newCard.size : null
        });
        if (!ok) throw new Error("保存失败：这个帖子不在你的账号下");
        Object.assign(r, { title, description: sh.body.querySelector("#she-desc").value.trim(), category: cat, extras, ...(filePath ? { file_path: filePath, thumb_path: thumbPath || r.thumb_path, size: newCard.size } : {}) });
        sh.close();
        toast("改好啦");
        onDone?.();
      } catch (err) {
        toast(err.message);
        btn.disabled = false;
        btn.textContent = "保存修改";
      }
    });
  }

  function renderMine(p) {
    if (!cfg()) {
      p.innerHTML = noCloudHtml();
      return;
    }
    const a = acc();
    const tokIds = Object.keys(myTokens()).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    p.innerHTML = `${
      a
        ? `<div class="sh-me" style="display:flex;align-items:center;gap:14px;padding:14px;border-radius:18px;border:1px solid var(--line);background:var(--bg-card);margin-bottom:12px">
            ${avHtmlS(a.avatar_path, a.nick, 58)}
            <div style="flex:1;min-width:0"><b style="font-size:1.05rem">${esc(a.nick)}</b><small style="display:block;color:var(--text-sub);font-size:12px">资源站 ID：${esc(a.id)}</small>${a.bio ? `<small style="display:block;font-size:12px;margin-top:2px">${esc(a.bio)}</small>` : ""}</div>
          </div>
          <div class="sh-chips" style="margin-bottom:10px"><button type="button" class="fun-chip-btn" data-me="edit">✏️ 编辑资料</button><button type="button" class="fun-chip-btn" data-me="code">🔑 登录码</button><button type="button" class="fun-chip-btn" data-me="out">退出登录</button></div>`
        : `<div class="sh-me" style="padding:16px;border-radius:18px;border:1px solid var(--line);background:var(--bg-card);margin-bottom:12px;text-align:center">
            <div style="font-size:34px">🐾</div><b>还没有资源站账号</b>
            <p class="fun-note">建个账号：自己起昵称、换头像，上传的东西跟着账号走，上传后还能反复编辑。</p>
            <div style="display:flex;gap:8px;justify-content:center"><button type="button" class="fun-btn solid" data-me="new">创建账号</button><button type="button" class="fun-btn ghost" data-me="login">已有账号，登录</button></div>
          </div>`
    }<p class="fun-kicker">我的上传</p><div class="sh-grid" id="sh-grid"></div>`;
    const grid = p.querySelector("#sh-grid");
    p.querySelectorAll("[data-me]").forEach(
      (b) =>
        (b.onclick = () => {
          const m = b.dataset.me;
          const again = () => renderMine(p);
          if (m === "new") accountSheet("new", again);
          if (m === "login") accountSheet("login", again);
          if (m === "edit") accountSheet("edit", again);
          if (m === "code") {
            const code = loginCode(acc());
            const sh = F.openSheet(
              `<p class="fun-note">换手机时在「资源站 → 我的 → 已有账号，登录」里粘贴这串登录码。<b>它就是你的账号密码，别发给别人。</b>（Meow 的备份里也会带上账号）</p><textarea readonly rows="3" style="width:100%;font-family:monospace;font-size:12px">${esc(code)}</textarea><div class="fun-sheet-actions"><button type="button" class="fun-btn solid" data-c="1">复制</button></div>`,
              { title: "登录码" }
            );
            sh.body.querySelector("[data-c]").onclick = () => {
              navigator.clipboard?.writeText(code).then(() => toast("已复制"), () => toast("复制失败，长按上面的文字复制吧"));
            };
          }
          if (m === "out") {
            void confirmSheet("退出后这台手机就不能编辑账号下的上传了，记得先保存好「登录码」。确定退出？").then((ok) => {
              if (!ok) return;
              saveAcc(null);
              again();
            });
          }
        })
    );
    if (!a && !tokIds.length) {
      grid.innerHTML = `<div class="sh-empty"><div class="sh-empty-ico">📦</div><p>你还没有上传过</p></div>`;
      return;
    }
    loadGrid(grid, tokIds, a ? a.id : "");
  }


  /** 资源站暂停开放：改成 false 就重新打开（代码和数据都还在） */
  const SHARE_CLOSED = true;

  F.register("资源站", {
    title: "资源站",
    kicker: "SHARE / MXJ CARD",
    mount(body) {
      root = document.createElement("div");
      root.className = "sh-root";
      body.appendChild(root);
      if (SHARE_CLOSED) {
        root.innerHTML = `<div class="sh-closed"><div class="fun-hero">📦</div><h2 class="fun-h2">资源站暂停开放</h2><p class="fun-note">资源站暂时关闭，不能浏览、上传和下载。<br/>美化、角色卡、世界书还是可以用「导出 PNG / 导入 Meow 卡」发给朋友。</p></div>`;
        return;
      }
      renderShell();
    },
    unmount() {
      root = null;
    }
  });

  /* ───── 世界书 / 角色 / 装扮页里的「导入 Meow 卡」按钮 ───── */
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
        toast("这张图里没有 Meow 资源数据（可能不是资源卡，或被聊天软件压缩过，请要原图）");
        return;
      }
      const m = KIND_META[payload.kind] || {};
      if (payload.kind !== want) {
        if (!(await confirmSheet(`这是一张「${m.name || "资源"}」卡，不是${KIND_WANT_NAME[want]}。还要导入吗？`))) return;
      }
      if (payload.kind === "look" && !(await confirmSheet(payload.data?.chatCssOnly ? `导入「${payload.title || "聊天样式"}」会覆盖你现在的聊天界面样式，继续吗？` : `导入「${payload.title || "美化"}」会覆盖你现在的装扮（壁纸、图标、字体、聊天样式等），继续吗？`))) return;
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
  /* ───── 世界书 / 角色 / 装扮页里的「导出为 PNG」 ───── */
  async function exportPngFor(kind) {
    await hydrateStores();
    const user = await F.loadUser();
    const list =
      kind === "char"
        ? readChars().map((c) => ({ id: String(c.id), name: c.displayName || "未命名" }))
        : kind === "worldbook"
          ? readVolumes().map((v) => ({ id: String(v.id), name: v.title || "未命名", sub: `${v.entries?.length || 0} 条` }))
          : [];
    if (kind !== "look" && !list.length) return toast(kind === "char" ? "角色库里还没有角色" : "还没有世界书");
    const multi = kind === "worldbook";
    let ids = list.length ? [list[0].id] : [];
    const sh = F.openSheet(
      `<div class="sh-exp">
        ${
          kind === "look"
            ? `<p class="fun-note">会把你现在的装扮（壁纸、图标、字体、聊天样式等）打包成一张 Meow 卡片 PNG。别人在「装扮」里点「导入 PNG」就能一键用上。</p>`
            : `<p class="fun-note">${multi ? "选要导出的世界书（可以多选）" : "选一个要导出的角色"}，会生成一张只有 Meow 能读的 PNG 卡片。</p>
          <div class="sh-pick">${list.map((x, i) => `<button type="button" class="sh-pick-item${i === 0 ? " is-on" : ""}" data-pid="${esc(x.id)}"><strong>${esc(x.name)}</strong>${x.sub ? `<small>${esc(x.sub)}</small>` : ""}</button>`).join("")}</div>
          ${kind === "char" ? `<label class="fun-switch"><input type="checkbox" class="sh-exp-books" checked /><span>附带角色绑定的世界书</span></label>` : ""}`
        }
        <label class="fun-field"><span>卡片标题</span><input class="sh-exp-title" maxlength="40" value="${esc(kind === "look" ? `${user.name}的装扮` : list[0]?.name || "")}" /></label>
        <label class="fun-field"><span>作者署名</span><input class="sh-exp-author" maxlength="20" value="${esc(localStorage.getItem("mx_share_author") || user.name)}" /></label>
        <button type="button" class="fun-btn solid sh-exp-go">生成并保存 PNG</button>
      </div>`,
      { title: "导出为 PNG" }
    );
    const titleIn = sh.body.querySelector(".sh-exp-title");
    sh.body.querySelectorAll("[data-pid]").forEach(
      (b) =>
        (b.onclick = () => {
          const id = b.dataset.pid;
          if (multi) ids = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
          else ids = [id];
          sh.body.querySelectorAll("[data-pid]").forEach((x) => x.classList.toggle("is-on", ids.includes(x.dataset.pid)));
          if (ids.length === 1) titleIn.value = list.find((x) => x.id === ids[0])?.name || titleIn.value;
        })
    );
    sh.body.querySelector(".sh-exp-go").onclick = async (ev) => {
      const btn = ev.currentTarget;
      if (kind !== "look" && !ids.length) return toast("先选内容");
      const meta = {
        title: titleIn.value.trim() || "未命名",
        author: sh.body.querySelector(".sh-exp-author").value.trim() || "匿名",
        desc: "",
        withBooks: !!sh.body.querySelector(".sh-exp-books")?.checked
      };
      try {
        localStorage.setItem("mx_share_author", meta.author);
      } catch (_) {
        /* ignore */
      }
      btn.disabled = true;
      btn.textContent = "生成中…";
      try {
        const { blob } = await makeCard(kind, ids, meta);
        downloadBlob(blob, `${safeName(meta.title)}.mxj.png`);
        sh.close();
        toast("已生成，保存到「文件」里就行（别发到会压缩图片的地方）");
      } catch (err) {
        toast("导出失败：" + err.message);
        btn.disabled = false;
        btn.textContent = "生成并保存 PNG";
      }
    };
  }
  /* 装扮页顶部：一键导入 / 导出整套装扮 */
  function injectWardLookIo() {
    const host = document.getElementById("ward-widgets-entry");
    if (!host) return false;
    if (document.getElementById("mx-look-io")) return true;
    const panel = document.createElement("div");
    panel.id = "mx-look-io";
    panel.className = "settings-panel wardrobe-panel wg-ward";
    panel.innerHTML = `<div><p class="widget-label"><i class="ph ph-palette" aria-hidden="true"></i> 装扮卡片</p>
      <p class="settings-ai-blurb wardrobe-panel-lead">把整套装扮存成一张 PNG 发给朋友，或导入别人分享的装扮卡片。</p></div>
      <div class="mx-look-io-btns"><button type="button" class="chip ghost" data-mxpng="look">导入 PNG</button><button type="button" class="chip solid" data-mxpng-export="look">导出为 PNG</button></div>`;
    host.insertBefore(panel, host.firstChild);
    return true;
  }
  if (!injectWardLookIo()) {
    let n = 0;
    const t = setInterval(() => {
      if (injectWardLookIo() || ++n > 40) clearInterval(t);
    }, 500);
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-mxpng-export]");
    if (!b) return;
    e.preventDefault();
    void exportPngFor(b.dataset.mxpngExport);
  });

  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-mxpng]");
    if (!b) return;
    e.preventDefault();
    void importPngFor(b.dataset.mxpng);
  });


  /* ───── 装扮 → 聊天界面样式 CSS：导出为 PNG 资源卡（只含聊天样式，可以上传资源站） ───── */
  async function exportChatCssPng() {
    const d = D();
    if (!d) return toast("数据库还没准备好");
    let bundle = null;
    try {
      bundle = typeof readWardrobeChatCssBundleDraft === "function" ? { ...readWardrobeChatCssBundleDraft() } : null;
    } catch (_) {
      bundle = null;
    }
    if (!bundle) bundle = { ...(d.getKv(d.K.GLOBAL_CHAT_SURFACE_CSS) || {}) };
    // 编辑框里还没保存的内容也一起带上（只在框里有字时）
    try {
      const ta = document.getElementById("ward-chat-css-input");
      const val = ta ? String(ta.value || "") : "";
      if (val.trim() && typeof getWardrobeChatCssEditKind === "function") {
        if (getWardrobeChatCssEditKind() === "glass") bundle.glassCss = val;
        else bundle.classicCss = val;
      }
    } catch (_) {
      /* ignore */
    }
    const classic = String(bundle?.classicCss || "");
    const glass = String(bundle?.glassCss || "");
    if (!classic.trim() && !glass.trim()) return toast("样式框是空的，先写好聊天样式再导出");
    let skin = "default";
    try {
      skin = localStorage.getItem("meowos_skin_chat") || "default";
    } catch (_) {
      /* ignore */
    }
    const user = await F.loadUser();
    const SKIN_NAME = { default: "默认", wechat: "微信", qq: "QQ" };
    const sh = F.openSheet(
      `<div class="sh-exp">
        <p class="fun-note">只打包「聊天界面样式」这一块（经典 ${classic.trim() ? "✓" : "—"} / 玻璃 ${glass.trim() ? "✓" : "—"}），不会带上你的壁纸、图标、字体。生成的 PNG 可以直接在「资源站 → 上传」里分享到「美化」分类。</p>
        ${skin !== "default" ? `<label class="fun-switch"><input type="checkbox" class="sh-exp-skin" checked /><span>附带风格包「${esc(SKIN_NAME[skin] || skin)}」（别人导入时自动切过去）</span></label>` : ""}
        <label class="fun-field"><span>卡片标题</span><input class="sh-exp-title" maxlength="40" value="${esc(user.name + "的聊天样式")}" /></label>
        <label class="fun-field"><span>作者署名</span><input class="sh-exp-author" maxlength="20" value="${esc(localStorage.getItem("mx_share_author") || user.name)}" /></label>
        <label class="fun-field"><span>一句话介绍（可不填）</span><input class="sh-exp-desc" maxlength="60" placeholder="比如：Y2K 像素窗口，记得先选微信风格包" /></label>
        <button type="button" class="fun-btn solid sh-exp-go">生成并保存 PNG</button>
      </div>`,
      { title: "聊天样式 · 导出为 PNG" }
    );
    sh.body.querySelector(".sh-exp-go").onclick = async (ev) => {
      const btn = ev.currentTarget;
      const meta = {
        title: sh.body.querySelector(".sh-exp-title").value.trim() || "聊天样式",
        author: sh.body.querySelector(".sh-exp-author").value.trim() || "匿名",
        desc: sh.body.querySelector(".sh-exp-desc").value.trim()
      };
      try {
        localStorage.setItem("mx_share_author", meta.author);
      } catch (_) {
        /* ignore */
      }
      btn.disabled = true;
      btn.textContent = "生成中…";
      try {
        const withSkin = skin !== "default" && !!sh.body.querySelector(".sh-exp-skin")?.checked;
        const data = {
          format: "xxj-wardrobe-look",
          version: 1,
          kv: { [d.K.GLOBAL_CHAT_SURFACE_CSS]: { v: 2, activeKind: bundle?.activeKind || (classic.trim() ? "classic" : "glass"), classicCss: classic, glassCss: glass } },
          chatCssOnly: true,
          ...(withSkin ? { skinChat: skin } : {})
        };
        const payload = { kind: "look", v: 1, title: meta.title, author: meta.author, desc: meta.desc, createdAt: Date.now(), data };
        const sub = `聊天样式 · ${[classic.trim() && "经典", glass.trim() && "玻璃"].filter(Boolean).join(" + ")}${withSkin ? " · " + (SKIN_NAME[skin] || skin) + "风格包" : ""}`;
        const png = await drawCard({ kind: "look", title: meta.title, author: meta.author, desc: meta.desc, cover: "", sub });
        const blob = await embedPayload(png, payload);
        downloadBlob(blob, `${safeName(meta.title)}.mxj.png`);
        sh.close();
        toast("已生成，可以去资源站上传了（别发到会压缩图片的地方）");
      } catch (err) {
        toast("导出失败：" + err.message);
        btn.disabled = false;
        btn.textContent = "生成并保存 PNG";
      }
    };
  }
  /** 在「导出」按钮旁边插一个「导出 PNG」（JS 插入，兼容旧缓存的页面） */
  function injectChatCssPngBtn() {
    const exp = document.getElementById("ward-chat-css-export");
    if (!exp) return false;
    if (document.getElementById("ward-chat-css-export-png")) return true;
    const b = document.createElement("button");
    b.type = "button";
    b.id = "ward-chat-css-export-png";
    b.className = exp.className;
    b.innerHTML = `<i class="ph ph-image" aria-hidden="true"></i> 导出 PNG`;
    b.title = "导出为 Meow 资源卡，可以上传资源站";
    b.addEventListener("click", (e) => {
      e.preventDefault();
      void exportChatCssPng();
    });
    exp.insertAdjacentElement("afterend", b);
    const inp = document.getElementById("ward-chat-css-import-file");
    if (inp && !/image\/png/.test(inp.accept)) inp.accept += ",.png,image/png";
    return true;
  }
  if (!injectChatCssPngBtn()) {
    let n2 = 0;
    const t2 = setInterval(() => {
      if (injectChatCssPngBtn() || ++n2 > 60) clearInterval(t2);
    }, 500);
  }

  window.XXJ_MXCARD = { embedPayload, extractPayload, drawCard, applyImport, makeCard, importPngFor, exportChatCssPng };
})();
