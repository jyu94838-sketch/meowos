"use strict";

/**
 * 换装小屋（游戏厅）
 * - 你和角色各有一个小人，可以给自己换装，也可以给对方换装
 * - 角色也会动手：让 TA 给自己搭一身、给你搭一身（用 AI 从衣柜里挑），还会评价你给 TA 搭的衣服
 * - 每个人的搭配都会保存；可以把两个小人存成图片
 * - 小人是原创的简笔 SVG，没有用任何现成角色的形象
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast } = F;
  const KV = "dress_v1";

  /* ───── 颜色 ───── */
  const PAL = ["#2b2b2b", "#6b4a3a", "#c58a4a", "#f2d17a", "#e8e8e8", "#f4a7b9", "#c9a7f2", "#8fc5f2", "#7fd1a8", "#e85a5a", "#3b5bdb", "#ffffff", "#ff9f43", "#5c4b8a"];
  const PAL_NAME = ["黑", "深棕", "焦糖", "奶金", "银灰", "樱粉", "香芋紫", "天蓝", "薄荷绿", "红", "宝蓝", "白", "橘", "深紫"];
  const SKIN = ["#ffe6d5", "#f6cfb2", "#e0a57f", "#a8714f"];
  const shade = (hex, k) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
    return "#" + ((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, "0");
  };
  const ink = "#3a2a2a";

  /* ───── 衣柜（每样都是一段 SVG，Q 版二头身） ───── */
  // 坐标：头在 (100,100) 附近，身体 158~214，腿 214~262，鞋 262~276
  const ol = (c) => shade(c, 0.72); // 描边色
  const stk = (c, w) => `stroke="${ol(c)}" stroke-width="${w || 1.6}" stroke-linejoin="round"`;
  const FACE_F = "M50 94 Q50 40 100 40 Q150 40 150 94 Q150 122 134 140 Q116 157 100 158 Q84 157 66 140 Q50 122 50 94Z";
  const FACE_M = "M51 94 Q51 40 100 40 Q149 40 149 94 Q149 120 136 140 Q118 159 100 161 Q82 159 64 140 Q51 120 51 94Z";
  /* ───── 画头发的小工具：一缕一缕的尖发束 + 渐变 + 高光 ───── */
  const r1 = (n) => Math.round(n * 10) / 10;
  const mixW = (hex, k) => {
    const n = parseInt(hex.slice(1), 16);
    const m = (v) => Math.round(v + (255 - v) * k);
    return "#" + ((m(n >> 16) << 16) | (m((n >> 8) & 255) << 8) | m(n & 255)).toString(16).padStart(6, "0");
  };
  /** 一缕头发：发根中心 (x0,y0) → 发梢 (x1,y1)，w 发根宽度，b 弯曲 */
  function lock(x0, y0, x1, y1, w, b) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L;
    const ny = dx / L;
    const bb = b || 0;
    const ax = x0 + (nx * w) / 2;
    const ay = y0 + (ny * w) / 2;
    const bx = x0 - (nx * w) / 2;
    const by = y0 - (ny * w) / 2;
    const mx = (x0 + x1) / 2 + nx * bb;
    const my = (y0 + y1) / 2 + ny * bb;
    return `M${r1(ax)} ${r1(ay)}Q${r1(mx + nx * w * 0.32)} ${r1(my + ny * w * 0.32)} ${r1(x1)} ${r1(y1)}Q${r1(mx - nx * w * 0.32)} ${r1(my - ny * w * 0.32)} ${r1(bx)} ${r1(by)}Z`;
  }
  const mir = (a) => [200 - a[0], a[1], 200 - a[2], a[3], a[4], -(a[5] || 0)];
  const sym = (arr) => arr.concat(arr.map(mir));
  /** 发束中间的细发丝线 */
  const strand = (x0, y0, x1, y1, b) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const L = Math.hypot(dx, dy) || 1;
    return `M${r1(x0)} ${r1(y0)}Q${r1((x0 + x1) / 2 + (-dy / L) * (b || 0))} ${r1((y0 + y1) / 2 + (dx / L) * (b || 0))} ${r1(x1)} ${r1(y1)}`;
  };
  /** g：{ id, c } —— 一组发片（同一个渐变 + 描边） */
  /** 发片先收集起来，画的时候先整体描一圈外轮廓、再填色——这样发束之间不会有乱七八糟的内线 */
  const hp = (g, d) => {
    g.list.push(d);
    return "";
  };
  const circ = (cx, cy, rx, ry) => `M${cx - rx} ${cy}A${rx} ${ry || rx} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry || rx} 0 1 0 ${cx - rx} ${cy}Z`;
  function paintHair(fn, g) {
    g.list = [];
    const extra = fn(g) || "";
    const ps = g.list.flatMap((d) => d.split(/(?=M)/)).filter((d) => d.trim());
    if (!ps.length) return extra;
    const line = shade(g.c, 0.5);
    const paths = ps.map((d) => `<path d="${d}"/>`).join("");
    return `<g fill="${line}" stroke="${line}" stroke-width="2.6" stroke-linejoin="round">${paths}</g><g fill="url(#${g.id})">${paths}</g>${extra}`;
  }
  const hl = (g, arr) => `<path d="${arr.map((a) => strand(...a)).join("")}" stroke="${shade(g.c, 0.6)}" stroke-width=".9" fill="none" opacity=".55" stroke-linecap="round"/>`;
  /** 天使环高光 */
  const ring = (g, y, w) => {
    const ww = w || 34;
    return `<path d="M${100 - ww} ${y + 8} Q100 ${y - 8} ${100 + ww} ${y + 8}" stroke="${mixW(g.c, 0.62)}" stroke-width="4.5" fill="none" opacity=".75" stroke-linecap="round" stroke-dasharray="12 5 7 4 16 6 9 5"/>`;
  };
  const shine = (g, d) => `<path d="${d}" stroke="${mixW(g.c, 0.55)}" stroke-width="2.2" fill="none" opacity=".7" stroke-linecap="round"/>`;
  const locksD = (arr) => arr.map((a) => lock(...a)).join("");
  /** 后脑勺的发量（挡在脸后面） */
  const CAP = "M38 114 Q28 18 100 14 Q172 18 162 114 Q160 126 150 130 L50 130 Q40 126 38 114Z";
  /** 头顶前面的发片（盖住额头上半部，留给刘海） */
  const CAP_M = "M40 110 Q28 16 100 12 Q172 16 160 110 Q158 118 152 120 L48 120 Q42 118 40 110Z";
  const TOPMASS = "M42 104 Q32 20 100 16 Q168 20 158 104 Q150 62 124 50 Q100 42 76 50 Q50 62 42 104Z";
  /** 下摆尖尖的长发 */
  const zigBottom = (x0, x1, y, amp, n) => {
    let d = "";
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      d += ` L${r1(x)} ${r1(i % 2 ? y - amp : y + (i % 4 === 0 ? amp * 0.4 : 0))}`;
    }
    return d;
  };

  /** 一排刘海：n 缕，从 x0 到 x1，发根 rootY，发梢 tipY（中间长两边短），spread 往外散开 */
  const fringe = (n, x0, x1, rootY, tipY, w, spread, wob) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const x = x0 + ((x1 - x0) * i) / (n - 1);
      const off = (x - 100) / 50; // -1..1
      const ty = tipY - Math.abs(off) * 6 + (i % 2 ? 5 : 0) + (wob ? (i % 3) * wob : 0);
      out.push([x, rootY + Math.abs(off) * 10, x + off * (spread || 6), ty, w, off * 4]);
    }
    return out;
  };
  const HAIR = {
    /* ── 女生款 ── */
    short: {
      name: "齐耳短发",
      g: "f",
      back: (g) => hp(g, `M38 104 Q28 18 100 14 Q172 18 162 104 Q166 134 156 156${zigBottom(156, 44, 156, 7, 8)} Q34 134 38 104Z`),
      front: (g) =>
        hp(g, TOPMASS + locksD(fringe(8, 56, 144, 34, 98, 22, 6)) + locksD(sym([[50, 76, 46, 146, 18, -4], [58, 84, 60, 132, 10, -2]]))) +
        hl(g, [[74, 48, 72, 90, -1], [100, 42, 100, 92, 0], [126, 48, 128, 90, 1]]) +
        ring(g, 44)
    },
    long: {
      name: "黑长直",
      g: "f",
      back: (g) => hp(g, `M36 100 Q26 16 100 14 Q174 16 164 100 L170 214 Q172 230 166 240${zigBottom(166, 34, 240, 10, 12)} Q28 230 30 214Z`) + hl(g, [[56, 140, 52, 230, 2], [144, 140, 148, 230, -2], [68, 150, 68, 228, 0], [132, 150, 132, 228, 0]]),
      front: (g) => hp(g, TOPMASS + locksD(fringe(8, 56, 144, 34, 100, 21, 4)) + locksD(sym([[50, 74, 44, 186, 18, -5], [60, 86, 60, 166, 10, -2]]))) + ring(g, 44)
    },
    hime: {
      name: "公主切",
      g: "f",
      back: (g) => hp(g, `M36 100 Q26 16 100 14 Q174 16 164 100 L168 232${zigBottom(168, 32, 236, 5, 16)} Z`),
      front: (g) =>
        hp(g, TOPMASS + "M46 98 Q42 34 100 30 Q158 34 154 98 L148 93 L141 99 L134 93 L127 99 L120 93 L113 99 L106 93 L99 99 L92 93 L85 99 L78 93 L71 99 L64 93 L57 99 L51 93Z" + "M46 86 L44 152 L50 158 L56 152 L61 158 L64 100Z M154 86 L156 152 L150 158 L144 152 L139 158 L136 100Z") +
        hl(g, [[70, 46, 68, 90, 0], [100, 38, 100, 90, 0], [130, 46, 132, 90, 0]]) +
        ring(g, 44)
    },
    twin: {
      name: "双马尾",
      g: "f",
      back: (g) => hp(g, CAP + locksD([[42, 66, 14, 214, 44, -20], [158, 66, 186, 214, 44, 20], [40, 74, 30, 196, 26, -6], [160, 74, 170, 196, 26, 6]])) + hl(g, [[38, 90, 20, 196, -10], [162, 90, 180, 196, 10], [34, 100, 30, 180, -4], [166, 100, 170, 180, 4]]),
      front: (g) =>
        hp(g, TOPMASS + locksD(fringe(8, 56, 144, 34, 98, 21, 6)) + locksD(sym([[50, 78, 48, 148, 15, -3]]))) +
        `<g fill="#ff7a93" stroke="#d9506c" stroke-width="1.2"><path d="M38 66 l-11 -9 v18z M38 66 l11 -9 v18z"/><path d="M162 66 l-11 -9 v18z M162 66 l11 -9 v18z"/><circle cx="38" cy="66" r="3.8"/><circle cx="162" cy="66" r="3.8"/></g>` +
        ring(g, 44)
    },
    ponyhi: {
      name: "高马尾",
      g: "f",
      back: (g) => hp(g, CAP + locksD([[118, 22, 170, 204, 38, 26], [124, 26, 158, 186, 22, 12], [114, 22, 150, 170, 18, 18]])) + hl(g, [[128, 40, 166, 190, 18], [122, 40, 152, 172, 14]]),
      front: (g) =>
        hp(g, TOPMASS + locksD(fringe(7, 58, 142, 34, 96, 22, 7)) + locksD(sym([[50, 78, 52, 152, 14, -4]]))) +
        `<rect x="114" y="14" width="14" height="10" rx="3" fill="#ff7a93" stroke="#d9506c" stroke-width="1.1" transform="rotate(28 121 19)"/>` +
        ring(g, 44)
    },
    bun: {
      name: "丸子头",
      g: "f",
      back: (g) => hp(g, circ(100, 20, 20) + CAP) + hl(g, [[86, 12, 112, 28, 6], [90, 6, 116, 20, 6]]),
      front: (g) => hp(g, TOPMASS + locksD(fringe(7, 58, 142, 34, 94, 21, 7)) + locksD(sym([[52, 80, 56, 142, 11, -5]]))) + ring(g, 44)
    },
    wavy: {
      name: "大波浪",
      g: "f",
      back: (g) =>
        hp(g, "M34 100 Q24 14 100 14 Q176 14 166 100 Q184 130 166 162 Q186 194 164 224 Q150 242 130 234 Q116 244 100 236 Q84 244 70 234 Q50 242 36 224 Q14 194 34 162 Q16 130 34 100Z") +
        hl(g, [[50, 130, 40, 214, -12], [150, 130, 160, 214, 12], [64, 160, 74, 226, 8], [136, 160, 126, 226, -8]]),
      front: (g) =>
        hp(g, "M42 104 Q32 18 104 16 Q168 22 158 100 Q150 66 128 58 Q118 78 98 80 Q74 76 62 68 Q50 80 42 104Z" + locksD([[104, 30, 60, 98, 28, 12], [118, 36, 144, 96, 20, -8], [110, 34, 104, 82, 14, -4]]) + locksD([[48, 80, 40, 176, 22, -12], [152, 80, 160, 176, 22, 12]])) +
        shine(g, "M58 52 Q86 32 120 36") +
        ring(g, 42, 30)
    },
    bob: {
      name: "波波头",
      g: "f",
      back: (g) => hp(g, "M34 100 Q24 16 100 14 Q176 16 166 100 L168 150 Q164 168 146 164 L54 164 Q36 168 32 150Z"),
      front: (g) => hp(g, TOPMASS + locksD(fringe(8, 56, 144, 34, 98, 22, 3)) + locksD(sym([[46, 78, 56, 164, 24, -10]]))) + ring(g, 44)
    },
    braid: {
      name: "侧编发",
      g: "f",
      back: (g) => hp(g, CAP),
      front: (g) =>
        hp(g, TOPMASS + locksD([[98, 30, 56, 94, 28, 10], [110, 32, 90, 88, 20, 5], [124, 36, 140, 96, 20, -5], [138, 44, 150, 102, 18, -4], [50, 78, 50, 140, 14, -3]])) +
        hp(g, [0, 1, 2, 3, 4, 5].map((i) => circ(146 + (i % 2 ? 4 : -2), 118 + i * 15, 12, 9.5)).join("") + lock(147, 198, 151, 224, 13, 2)) +
        [0, 1, 2, 3, 4].map((i) => `<path d="M${136 + (i % 2 ? 6 : 0)} ${124 + i * 15} q10 4 20 -2" stroke="${shade(g.c, 0.55)}" stroke-width="1" fill="none"/>`).join("") +
        `<circle cx="147" cy="198" r="4" fill="#ff7a93" stroke="#d9506c" stroke-width="1"/>` +
        ring(g, 42, 30)
    },

    /* ── 男生款（参考：中分、背头、碎刘海、侧分卷、低马尾、清爽短发、长层次、纹理侧分、慵懒微卷） ── */
    center: {
      name: "经典中分",
      g: "m",
      back: (g) => hp(g, CAP_M),
      front: (g) =>
        hp(g, "M42 106 Q32 20 100 16 Q168 20 158 106 Q150 70 128 56 Q112 46 100 38 Q88 46 72 56 Q50 70 42 106Z" + locksD(sym([[98, 30, 64, 100, 24, -12], [92, 34, 50, 108, 22, -10], [80, 40, 44, 124, 18, -6], [98, 34, 82, 86, 14, -6]]))) +
        hl(g, [[96, 38, 66, 94, -8], [88, 40, 54, 102, -7], [104, 38, 134, 94, 8], [112, 40, 146, 102, 7]]) +
        shine(g, "M62 50 Q80 34 96 32 M104 32 Q120 34 138 50")
    },
    slick: {
      name: "后梳大背头",
      g: "m",
      back: (g) => hp(g, CAP_M),
      front: (g) =>
        hp(g, "M42 104 Q32 14 100 10 Q168 14 158 104 Q152 76 142 66 Q122 54 100 56 Q78 54 58 66 Q48 76 42 104Z" + locksD([[110, 56, 120, 88, 10, 5], [118, 56, 134, 82, 8, 4]]) + locksD(sym([[48, 72, 46, 114, 13, -2]]))) +
        hl(g, [[62, 66, 90, 22, -8], [78, 60, 108, 18, -8], [98, 56, 128, 22, -6], [118, 56, 146, 38, -5], [138, 66, 154, 54, -2]]) +
        shine(g, "M70 38 Q96 20 126 26")
    },
    fringe: {
      name: "轻薄碎刘海",
      g: "m",
      back: (g) => hp(g, CAP_M),
      front: (g) => hp(g, TOPMASS + locksD(fringe(9, 52, 148, 32, 100, 20, 8)) + locksD(sym([[48, 78, 46, 128, 16, -3]]))) + hl(g, [[70, 46, 67, 90, -1], [94, 40, 92, 92, 0], [118, 42, 121, 92, 1]]) + ring(g, 42)
    },
    sidecurl: {
      name: "侧分卷发",
      g: "m",
      back: (g) => hp(g, "M38 112 Q26 16 100 12 Q174 16 162 112 Q164 132 152 138 L48 138 Q36 132 38 112Z"),
      front: (g) =>
        hp(g, "M42 106 Q32 18 84 14 Q156 14 160 102 Q150 66 120 54 Q96 46 80 46 Q58 62 42 106Z" + locksD([[82, 28, 134, 94, 30, -12], [92, 30, 154, 112, 22, -14], [78, 32, 112, 86, 18, -8], [66, 42, 50, 102, 22, 7], [54, 64, 44, 130, 18, 5]])) +
        `<path d="M134 94 q9 2 7 11 q-7 0 -4 -7 M154 112 q8 4 3 12 q-6 -2 -1 -8 M44 130 q-7 2 -4 9 q6 0 4 -7" stroke="${shade(g.c, 0.5)}" stroke-width="1.8" fill="none" stroke-linecap="round"/>` +
        hl(g, [[88, 36, 130, 88, -7], [96, 36, 148, 104, -9], [68, 50, 54, 98, 5]]) +
        shine(g, "M70 34 Q100 22 128 36")
    },
    lowtail: {
      name: "低马尾束发",
      g: "m",
      back: (g) => hp(g, CAP + locksD([[118, 128, 150, 206, 22, 10], [124, 130, 142, 192, 12, 4]])) + `<rect x="112" y="120" width="15" height="11" rx="3" fill="#2b2326" transform="rotate(30 119 125)"/>`,
      front: (g) =>
        hp(g, "M42 106 Q32 18 100 14 Q168 18 158 106 Q150 70 128 56 Q112 46 104 36 Q92 50 72 58 Q50 72 42 106Z" + locksD([[104, 32, 68, 102, 24, -10], [96, 34, 52, 110, 22, -9], [108, 34, 130, 94, 20, 7], [114, 38, 150, 104, 20, 8]]) + locksD([[56, 78, 44, 156, 13, -7], [146, 78, 158, 156, 13, 7]])) +
        hl(g, [[100, 40, 70, 96, -6], [112, 42, 140, 98, 6]]) +
        shine(g, "M66 50 Q86 34 102 32")
    },
    crew: {
      name: "短发清爽款",
      g: "m",
      back: (g) => hp(g, "M42 110 Q32 22 100 18 Q168 22 158 110 Q156 118 150 120 L50 120 Q44 118 42 110Z"),
      front: (g) =>
        hp(g, "M44 102 Q34 22 100 16 Q166 22 156 102 Q150 78 134 72 Q100 64 66 72 Q50 78 44 102Z" + locksD([[64, 72, 52, 34, 20, -4], [80, 68, 74, 24, 20, -3], [96, 66, 98, 18, 20, 0], [112, 66, 120, 22, 20, 3], [128, 68, 142, 30, 20, 4], [142, 74, 156, 44, 18, 4]]) + locksD([[86, 66, 70, 88, 16, 4], [102, 66, 90, 86, 14, 3]]) + locksD(sym([[48, 76, 48, 110, 13, -2]]))) +
        shine(g, "M66 44 Q100 26 134 42")
    },
    wolf: {
      name: "长层次狼尾",
      g: "m",
      back: (g) => hp(g, `M36 104 Q26 16 100 14 Q174 16 164 104 L166 152 Q166 172 156 186${zigBottom(156, 44, 186, 12, 8)} Q34 172 34 152Z`),
      front: (g) => hp(g, TOPMASS + locksD(fringe(8, 54, 146, 32, 104, 21, 8)) + locksD(sym([[48, 78, 40, 156, 18, -6], [56, 92, 56, 140, 10, -2]]))) + hl(g, [[74, 48, 69, 94, -1], [100, 42, 101, 98, 0], [126, 48, 132, 94, 1]]) + ring(g, 42)
    },
    texture: {
      name: "纹理侧分",
      g: "m",
      back: (g) => hp(g, CAP_M),
      front: (g) =>
        hp(g, "M42 106 Q32 18 100 12 Q168 18 158 106 Q152 72 136 58 Q126 46 122 36 Q104 52 80 58 Q54 70 42 106Z" + locksD([[120, 32, 72, 94, 28, 12], [114, 34, 56, 104, 24, 12], [106, 38, 46, 120, 20, 10], [126, 36, 142, 86, 18, -5], [134, 42, 154, 100, 18, -5], [150, 76, 156, 124, 13, 3]])) +
        hl(g, [[118, 40, 74, 90, 9], [110, 42, 60, 100, 9], [128, 44, 142, 84, -4]]) +
        shine(g, "M84 40 Q106 28 126 32")
    },
    lazy: {
      name: "慵懒微卷",
      g: "m",
      back: (g) => hp(g, "M38 110 Q26 14 100 10 Q174 14 162 110 Q164 132 152 142 L48 142 Q36 132 38 110Z"),
      front: (g) =>
        hp(g, TOPMASS + locksD([[58, 46, 46, 104, 22, 9], [72, 40, 68, 102, 21, -8], [86, 36, 80, 98, 20, 8], [100, 34, 104, 102, 20, -7], [114, 36, 120, 98, 20, 8], [128, 40, 136, 102, 21, -8], [142, 46, 156, 104, 22, -9]]) + locksD([[48, 80, 42, 138, 18, 8], [152, 80, 158, 138, 18, -8]])) +
        `<path d="M46 104 q-6 4 -1 10 M104 102 q6 4 1 10 M156 104 q6 4 1 10 M42 138 q-5 4 0 9 M158 138 q5 4 0 9" stroke="${shade(g.c, 0.5)}" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
        hl(g, [[72, 46, 69, 92, -5], [100, 40, 103, 94, -4], [128, 46, 134, 94, -5]]) +
        ring(g, 42)
    },
    buzz: {
      name: "寸头",
      g: "m",
      back: () => "",
      front: (g) =>
        `<path d="M48 98 Q44 28 100 28 Q156 28 152 98 Q146 64 128 58 Q100 52 72 58 Q54 64 48 98Z" fill="url(#${g.id})" stroke="${shade(g.c, 0.5)}" stroke-width="1.6"/>` +
        `<path d="M58 62 l2 -3 M70 54 l2 -3 M84 48 l2 -3 M100 46 l2 -3 M114 48 l2 -3 M128 54 l2 -3 M140 62 l2 -3" stroke="${shade(g.c, 0.6)}" stroke-width="1.1" opacity=".55"/>`
    },
    emo: {
      name: "刘海遮眼",
      g: "m",
      back: (g) => hp(g, `M36 104 Q26 16 100 14 Q174 16 164 104 L166 160${zigBottom(166, 34, 162, 6, 10)} Z`),
      front: (g) => hp(g, TOPMASS + locksD([[132, 34, 70, 122, 32, 14], [120, 34, 56, 114, 28, 14], [140, 42, 98, 120, 22, 9], [146, 48, 154, 106, 18, -3], [60, 46, 46, 108, 20, -2]])) + hl(g, [[128, 42, 74, 114, 11], [118, 42, 62, 106, 11]]) + ring(g, 42)
    }
  };
  const HAIR_DEF = { f: "short", m: "fringe" };
  // 眼睛：(80,110) 和 (120,110)
  const EYE_L = 80;
  const EYE_R = 120;
  const EY = 110;
  let gid = 0;
  const LASH = "#24161c";
  /** 一只精致眼睛；sex 决定女生大眼 / 男生细长眼 */
  const eye = (cx, c, id, sex, o) => {
    o = o || {};
    const s = cx < 100 ? -1 : 1; // 外眼角方向
    const ox = cx + s * 12;
    const ix = cx - s * 12;
    const male = sex === "m" || o.sharp;
    const cid = `${id}c${cx}`;
    let sclera;
    let lid;
    let brow;
    let iris;
    let lower;
    if (male) {
      sclera = `M${ix} ${EY - 1}Q${cx} ${EY - 11} ${ox} ${EY - 4}C${ox} ${EY + 3} ${cx + s * 5} ${EY + 8} ${cx} ${EY + 8}C${cx - s * 6} ${EY + 8} ${ix} ${EY + 4} ${ix} ${EY - 1}Z`;
      lid = `M${ix - s * 1} ${EY - 1}Q${cx} ${EY - 12} ${ox + s * 1} ${EY - 4}L${ox + s * 3} ${EY - 7}Q${cx} ${EY - 16} ${ix - s * 1} ${EY - 4.5}Z`;
      brow = `M${ix - s * 1} ${EY - 17}Q${cx} ${EY - 22} ${ox + s * 2} ${EY - 19}L${ox + s * 2} ${EY - 17.5}Q${cx} ${EY - 19.5} ${ix - s * 1} ${EY - 13.5}Z`;
      iris = { cy: EY + 1, rx: 6.4, ry: 7.6, p: 3.2, pr: 4.2 };
      lower = `M${cx - s * 5} ${EY + 8.6}Q${cx + s * 3} ${EY + 9.4} ${ox - s * 1} ${EY + 4}`;
    } else {
      sclera = `M${ix} ${EY - 4}Q${cx} ${EY - 15} ${ox} ${EY - 6}C${ox + s * 1} ${EY + 6} ${cx + s * 6} ${EY + 13} ${cx} ${EY + 13}C${cx - s * 7} ${EY + 13} ${ix} ${EY + 6} ${ix} ${EY - 4}Z`;
      lid = `M${ix - s * 1} ${EY - 4}Q${cx} ${EY - 16} ${ox + s * 1} ${EY - 6}L${ox + s * 5} ${EY - 9}L${ox + s * 2} ${EY - 9.5}Q${cx} ${EY - 20.5} ${ix - s * 1} ${EY - 7.5}Z`;
      brow = `M${ix} ${EY - 21}Q${cx} ${EY - 27} ${ox + s * 2} ${EY - 22}L${ox + s * 2} ${EY - 21}Q${cx} ${EY - 25} ${ix} ${EY - 19.5}Z`;
      iris = { cy: EY + 2, rx: 8.4, ry: 10.6, p: 3.8, pr: 5.2 };
      lower = `M${cx - s * 6} ${EY + 13.4}Q${cx + s * 2} ${EY + 14.6} ${ox - s * 0.5} ${EY + 7}`;
    }
    if (o.closed) {
      const up = o.closed === "up";
      return `<path d="${brow}" fill="${LASH}" opacity=".85"/><path d="M${ix} ${EY + (up ? 2 : 0)}Q${cx} ${EY + (up ? -9 : 7)} ${ox} ${EY + (up ? 1 : -1)}" stroke="${LASH}" stroke-width="3.2" fill="none" stroke-linecap="round"/>${male ? "" : `<path d="M${ox} ${EY + (up ? 1 : -1)} l${s * 4} -3" stroke="${LASH}" stroke-width="2" stroke-linecap="round"/>`}`;
    }
    const pupil = o.slit ? `<ellipse cx="${cx}" cy="${iris.cy}" rx="1.6" ry="${iris.ry - 2}" fill="#140c12"/>` : `<ellipse cx="${cx}" cy="${iris.cy + 0.6}" rx="${iris.p}" ry="${iris.pr}" fill="#140c12"/>`;
    const hi = o.star
      ? `<path d="M${cx + 2} ${iris.cy - 7} l1.8 3.9 4.2 .6 -3.1 2.9 .8 4.2 -3.7 -2 -3.7 2 .8 -4.2 -3.1 -2.9 4.2 -.6z" fill="#fff"/>`
      : `<ellipse cx="${cx + s * -2.6}" cy="${iris.cy - iris.ry * 0.45}" rx="${male ? 2 : 2.8}" ry="${male ? 2.4 : 3.4}" fill="#fff"/><circle cx="${cx + s * 3}" cy="${iris.cy + iris.ry * 0.45}" r="${male ? 1 : 1.5}" fill="#fff" opacity=".9"/>`;
    const sleepy = o.sleepy ? `<path d="M${ix - s * 2} ${EY - 16}L${ox + s * 3} ${EY - 16}L${ox + s * 3} ${EY - 1}Q${cx} ${EY - 5} ${ix - s * 2} ${EY + 1}Z" fill="${o.sk}"/><path d="M${ix - s * 1} ${EY + 1}Q${cx} ${EY - 5} ${ox + s * 2} ${EY - 1}" stroke="${LASH}" stroke-width="3" fill="none" stroke-linecap="round"/>` : "";
    return `<clipPath id="${cid}"><path d="${sclera}"/></clipPath>
      <path d="${sclera}" fill="#fffdfb"/>
      <g clip-path="url(#${cid})">
        <ellipse cx="${cx}" cy="${iris.cy}" rx="${iris.rx}" ry="${iris.ry}" fill="url(#${id})" stroke="${shade(c, 0.4)}" stroke-width=".9"/>
        ${pupil}
        <ellipse cx="${cx}" cy="${iris.cy + iris.ry * 0.55}" rx="${iris.rx * 0.6}" ry="${iris.ry * 0.3}" fill="${mixW(c, 0.45)}" opacity=".55"/>
        ${hi}
        <path d="${sclera}" fill="none" stroke="#000" stroke-width="5" opacity=".14" transform="translate(0 -3)"/>
      </g>
      ${o.sleepy ? sleepy : ""}
      <path d="${lid}" fill="${LASH}"/>
      ${male ? "" : `<path d="M${ox + s * 1} ${EY - 7} l${s * 4} 1.5 M${ox} ${EY - 3} l${s * 3.6} 2.6" stroke="${LASH}" stroke-width="1.4" stroke-linecap="round"/>`}
      <path d="${lower}" stroke="${LASH}" stroke-width="${male ? 0.9 : 1.1}" fill="none" opacity=".55" stroke-linecap="round"/>
      <path d="${brow}" fill="${male ? "#2a1d20" : "#4a3236"}" opacity="${male ? 0.92 : 0.8}"/>`;
  };
  const irisGrad = (id, c) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(c, 0.35)}"/><stop offset=".45" stop-color="${shade(c, 0.8)}"/><stop offset=".8" stop-color="${c}"/><stop offset="1" stop-color="${mixW(c, 0.35)}"/></linearGradient>`;
  const pair = (c, id, sex, o) => irisGrad(id, c) + eye(EYE_L, c, id, sex, o) + eye(EYE_R, c, id, sex, o);
  const EYES = {
    round: { name: "圆眼", draw: (c, id, sk, sex) => pair(c, id, sex) },
    sparkle: { name: "星星眼", g: "f", draw: (c, id, sk, sex) => pair(c, id, sex, { star: 1 }) },
    smile: { name: "笑眼", draw: (c, id, sk, sex) => eye(EYE_L, c, id, sex, { closed: "up" }) + eye(EYE_R, c, id, sex, { closed: "up" }) },
    sleepy: { name: "困困眼", draw: (c, id, sk, sex) => pair(c, id, sex, { sleepy: 1, sk }) },
    cat: { name: "猫猫眼", draw: (c, id, sk, sex) => pair(c, id, sex, { slit: 1 }) },
    wink: { name: "眨眼", draw: (c, id, sk, sex) => irisGrad(id, c) + eye(EYE_L, c, id, sex) + eye(EYE_R, c, id, sex, { closed: "up" }) },
    sharp: { name: "冷淡眼", draw: (c, id, sk, sex) => pair(c, id, sex, { sharp: 1, sleepy: sex === "m" ? 0 : 0 }) }
  };
  const MOUTH = {
    smile: { name: "微笑", draw: () => `<path d="M93 134 Q100 140 107 134" stroke="#7a3a3a" stroke-width="2.4" fill="none" stroke-linecap="round"/>` },
    open: { name: "张嘴笑", draw: () => `<path d="M91 132 Q100 133 109 132 Q107 145 100 145 Q93 145 91 132Z" fill="#b8434f" stroke="#7a3a3a" stroke-width="1.6"/><path d="M95 141 Q100 137 105 141" fill="#f08a9a"/>` },
    cat: { name: "ω 嘴", draw: () => `<path d="M90 133 Q95 139 100 133 Q105 139 110 133" stroke="#7a3a3a" stroke-width="2.4" fill="none" stroke-linecap="round"/>` },
    pout: { name: "嘟嘴", draw: () => `<ellipse cx="100" cy="136" rx="3.4" ry="3" fill="#e0707c"/>` },
    tongue: { name: "吐舌头", draw: () => `<path d="M92 133 Q100 139 108 133" stroke="#7a3a3a" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M98 136 Q103 146 108 136Z" fill="#f08a9a" stroke="#c45a6a" stroke-width="1.2"/>` }
  };
  // 衣服
  const TORSO = "M74 168 Q74 158 88 157 L112 157 Q126 158 126 168 L128 216 Q100 222 72 216Z";
  const sleeves = (c, long) => {
    const L = long ? "M80 164 Q69 188 66 210" : "M80 164 Q75 176 73 184";
    const R = long ? "M120 164 Q131 188 134 210" : "M120 164 Q125 176 127 184";
    return `<path d="${L}" stroke="${ol(c)}" stroke-width="18" stroke-linecap="round" fill="none"/><path d="${R}" stroke="${ol(c)}" stroke-width="18" stroke-linecap="round" fill="none"/><path d="${L}" stroke="${c}" stroke-width="15" stroke-linecap="round" fill="none"/><path d="${R}" stroke="${c}" stroke-width="15" stroke-linecap="round" fill="none"/>`;
  };
  const torso = (c, d) => `<path d="${d || TORSO}" fill="${c}" ${stk(c)}/>`;
  const TOP = {
    tee: { name: "T 恤", draw: (c) => sleeves(c) + torso(c) + `<path d="M90 158 Q100 168 110 158" stroke="${ol(c)}" stroke-width="2" fill="none"/>` },
    hoodie: {
      name: "卫衣",
      draw: (c) =>
        `<ellipse cx="100" cy="160" rx="28" ry="9" fill="${shade(c, 0.8)}" ${stk(c)}/>` +
        sleeves(c, true) +
        torso(c, "M72 168 Q72 158 88 157 L112 157 Q128 158 128 168 L130 222 Q100 228 70 222Z") +
        `<path d="M84 196 L116 196 L118 212 L82 212Z" fill="${shade(c, 0.88)}" ${stk(c, 1.2)}/><path d="M94 162 v16 M106 162 v16" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>`
    },
    sailor: {
      name: "水手服",
      draw: (c) =>
        sleeves("#ffffff") +
        torso("#ffffff") +
        `<path d="M74 162 L100 194 L126 162 L126 176 L100 204 L74 176Z" fill="${c}" ${stk(c, 1.2)}/><path d="M78 168 L100 194 L122 168" stroke="#fff" stroke-width="1.6" fill="none"/><path d="M100 196 l-12 9 4 3z M100 196 l12 9 -4 3z" fill="#ff6b81" stroke="#d94a62" stroke-width="1"/><circle cx="100" cy="197" r="3.6" fill="#ff6b81"/>`
    },
    shirt: {
      name: "衬衫领带",
      draw: (c) =>
        sleeves("#f7f7fb", true) +
        torso("#f7f7fb") +
        `<path d="M88 157 L100 168 L112 157 L108 170 L100 168 L92 170Z" fill="#fff" stroke="#c9c9d6" stroke-width="1.2"/><path d="M97 168 h6 l3 30 -6 7 -6 -7z" fill="${c}" ${stk(c, 1.2)}/>`
    },
    sweater: {
      name: "毛衣",
      draw: (c) =>
        sleeves(c, true) +
        torso(c) +
        `<path d="M86 157 Q100 166 114 157" stroke="${shade(c, 0.8)}" stroke-width="5" fill="none"/>` +
        [176, 188, 200].map((y) => `<path d="M80 ${y} q5 4 10 0 q5 4 10 0 q5 4 10 0 q5 4 10 0" stroke="${shade(c, 0.82)}" stroke-width="1.6" fill="none"/>`).join("") +
        `<path d="M73 210 Q100 216 127 210 L128 216 Q100 222 72 216Z" fill="${shade(c, 0.85)}"/>`
    },
    dress: {
      name: "连衣裙",
      dress: true,
      draw: (c) =>
        `<circle cx="80" cy="166" r="9" fill="${c}" ${stk(c)}/><circle cx="120" cy="166" r="9" fill="${c}" ${stk(c)}/>` +
        torso(c, "M76 166 Q76 158 88 157 L112 157 Q124 158 124 166 L124 196 L76 196Z") +
        `<path d="M76 194 L124 194 L144 250 Q100 260 56 250Z" fill="${c}" ${stk(c)}/><path d="M56 250 q6 6 11 0 q6 6 11 0 q6 6 11 0 q6 6 11 0 q6 6 11 0 q6 6 11 0 q6 6 11 0 q6 6 11 0" fill="#fff" stroke="${ol(c)}" stroke-width="1"/><path d="M76 192 L124 192 L124 198 L76 198Z" fill="${shade(c, 0.8)}"/><path d="M100 192 l-8 -5 v10z M100 192 l8 -5 v10z" fill="${shade(c, 0.75)}"/>`
    },
    suit: {
      name: "西装",
      draw: (c) =>
        sleeves(c, true) +
        torso(c) +
        `<path d="M90 157 L100 186 L110 157Z" fill="#fff"/><path d="M98 166 h4 l2 22 -4 4 -4 -4z" fill="#3b2b3b"/><path d="M86 157 L100 190 L94 157Z M114 157 L100 190 L106 157Z" fill="${shade(c, 0.78)}" ${stk(c, 1)}/><circle cx="100" cy="204" r="2.4" fill="${ol(c)}"/>`
    },
    kimono: {
      name: "和风上衣",
      draw: (c) =>
        `<path d="M78 162 L52 178 L58 212 L80 206Z M122 162 L148 178 L142 212 L120 206Z" fill="${c}" ${stk(c)}/>` +
        torso(c) +
        `<path d="M84 157 L106 196 M116 157 L94 196" stroke="#fff" stroke-width="3.4"/><path d="M73 194 L127 194 L127 206 L73 206Z" fill="${shade(c, 0.7)}"/><path d="M96 194 h8 v12 h-8z" fill="#f2d17a"/>`
    }
  };
  const BOTTOM = {
    none: { name: "不穿（配连衣裙）", draw: () => "" },
    shorts: { name: "短裤", draw: (c) => `<path d="M74 210 L126 210 L128 238 L103 238 L100 226 L97 238 L72 238Z" fill="${c}" ${stk(c)}/>` },
    skirt: { name: "半身裙", draw: (c) => `<path d="M74 210 L126 210 L138 246 Q100 254 62 246Z" fill="${c}" ${stk(c)}/>` },
    pleated: {
      name: "百褶裙",
      draw: (c) => `<path d="M74 210 L126 210 L138 246 Q100 254 62 246Z" fill="${c}" ${stk(c)}/>` + [[84, 70], [94, 86], [106, 114], [116, 130]].map(([a, b]) => `<path d="M${a} 212 L${b} 249" stroke="${ol(c)}" stroke-width="1.4"/>`).join("") + `<path d="M74 210 L126 210 L126 216 L74 216Z" fill="${shade(c, 0.85)}"/>`
    },
    pants: { name: "长裤", draw: (c) => `<path d="M74 210 L126 210 L125 264 L104 264 L100 228 L96 264 L75 264Z" fill="${c}" ${stk(c)}/>` },
    jeans: {
      name: "背带裤",
      draw: (c) =>
        `<path d="M80 180 L120 180 L122 210 L78 210Z" fill="${c}" ${stk(c)}/><path d="M82 182 L78 160 M118 182 L122 160" stroke="${c}" stroke-width="5" stroke-linecap="round"/><path d="M74 208 L126 208 L125 250 L104 250 L100 228 L96 250 L75 250Z" fill="${c}" ${stk(c)}/><circle cx="84" cy="186" r="2.4" fill="#f2d17a"/><circle cx="116" cy="186" r="2.4" fill="#f2d17a"/><path d="M92 190 h16 v10 h-16z" fill="${shade(c, 0.85)}"/>`
    }
  };
  const SHOES = {
    sneakers: { name: "运动鞋", draw: (c) => `<path d="M78 262 h20 q4 0 4 6 v4 h-28 q0 -10 4 -10z M102 262 h20 q4 0 4 10 h-28 v-4 q0 -6 4 -6z" fill="${c}" ${stk(c)}/><path d="M74 272 h28 M98 272 h28" stroke="#fff" stroke-width="3"/>` },
    boots: { name: "靴子", draw: (c) => `<path d="M80 240 h16 v26 q6 0 8 6 h-28 q0 -6 4 -6z M104 240 h16 v26 q4 0 4 6 h-28 q2 -6 8 -6z" fill="${c}" ${stk(c)}/><path d="M80 244 h16 M104 244 h16" stroke="${shade(c, 1.25)}" stroke-width="2"/>` },
    maryjane: { name: "玛丽珍鞋", draw: (c) => `<ellipse cx="88" cy="268" rx="12" ry="6" fill="${c}" ${stk(c)}/><ellipse cx="112" cy="268" rx="12" ry="6" fill="${c}" ${stk(c)}/><path d="M82 262 h12 M106 262 h12" stroke="${c}" stroke-width="3"/>` },
    slippers: { name: "毛拖鞋", draw: (c) => `<ellipse cx="88" cy="269" rx="14" ry="7" fill="${c}" ${stk(c)}/><ellipse cx="112" cy="269" rx="14" ry="7" fill="${c}" ${stk(c)}/><circle cx="88" cy="263" r="5.5" fill="#fff" stroke="#ddd"/><circle cx="112" cy="263" r="5.5" fill="#fff" stroke="#ddd"/>` },
    barefoot: { name: "光脚", draw: () => "" }
  };
  const ACC = {
    none: { name: "不戴", draw: () => "" },
    catears: { name: "猫耳", draw: (c) => `<path d="M52 66 L60 18 L90 44Z M148 66 L140 18 L110 44Z" fill="${c}" ${stk(c)}/><path d="M60 56 L63 30 L80 46Z M140 56 L137 30 L120 46Z" fill="#ffb3c4"/>` },
    bow: { name: "蝴蝶结", draw: () => `<path d="M136 48 L114 34 L116 62Z M136 48 L158 34 L156 62Z" fill="#ff6b81" stroke="#d94a62" stroke-width="1.6"/><circle cx="136" cy="48" r="6" fill="#e04a62"/>` },
    crown: { name: "小皇冠", draw: () => `<path d="M76 38 L74 14 L88 26 L100 8 L112 26 L126 14 L124 38Z" fill="#f6cf52" stroke="#c99a1e" stroke-width="1.8"/><circle cx="100" cy="26" r="3.6" fill="#ff6b81"/><circle cx="84" cy="32" r="2" fill="#8fc5f2"/><circle cx="116" cy="32" r="2" fill="#8fc5f2"/>` },
    glasses: { name: "圆眼镜", draw: () => `<circle cx="${EYE_L}" cy="${EY}" r="15" fill="rgba(255,255,255,.12)" stroke="#3a2a2a" stroke-width="2.6"/><circle cx="${EYE_R}" cy="${EY}" r="15" fill="rgba(255,255,255,.12)" stroke="#3a2a2a" stroke-width="2.6"/><path d="M95 108 q5 -3 10 0" stroke="#3a2a2a" stroke-width="2.6" fill="none"/>` },
    beret: { name: "贝雷帽", draw: () => `<ellipse cx="94" cy="36" rx="54" ry="18" fill="#e85a5a" stroke="#b83c3c" stroke-width="1.8" transform="rotate(-8 94 36)"/><circle cx="92" cy="19" r="4" fill="#b83c3c"/>` },
    flower: { name: "小花", draw: () => `${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="${140 + 8 * Math.cos((a * Math.PI) / 180)}" cy="${58 + 8 * Math.sin((a * Math.PI) / 180)}" rx="6.5" ry="6.5" fill="#ffb3c4" stroke="#e88aa0" stroke-width="1"/>`).join("")}<circle cx="140" cy="58" r="4.5" fill="#f6cf52"/>` },
    headphones: { name: "耳机", draw: () => `<path d="M44 104 Q40 24 100 22 Q160 24 156 104" stroke="#5c4b8a" stroke-width="7" fill="none" stroke-linecap="round"/><rect x="32" y="92" width="20" height="32" rx="9" fill="#5c4b8a"/><rect x="148" y="92" width="20" height="32" rx="9" fill="#5c4b8a"/><rect x="36" y="98" width="8" height="20" rx="4" fill="#c9a7f2"/><rect x="156" y="98" width="8" height="20" rx="4" fill="#c9a7f2"/>` },
    halo: { name: "光环", draw: () => `<ellipse cx="100" cy="14" rx="34" ry="8" fill="none" stroke="#f6cf52" stroke-width="5"/><ellipse cx="100" cy="14" rx="34" ry="8" fill="none" stroke="#fff6c8" stroke-width="1.6"/>` },
    horns: { name: "小恶魔角", draw: () => `<path d="M66 50 Q56 22 70 10 Q68 30 84 40Z M134 50 Q144 22 130 10 Q132 30 116 40Z" fill="#6a4fa0" stroke="#4a3478" stroke-width="1.6"/>` }
  };
  const HELD = {
    none: { name: "空手", draw: () => "" },
    tea: { name: "奶茶", draw: () => `<path d="M124 196 h22 l-3 30 h-16z" fill="#f2e2c4" stroke="#c9a77a" stroke-width="1.5"/><path d="M124 196 h22 v5 h-22z" fill="#fff"/><path d="M137 196 l6 -18" stroke="#ff6b81" stroke-width="3" stroke-linecap="round"/>${[129, 135, 141].map((x) => `<circle cx="${x}" cy="220" r="2.2" fill="#3a2a2a"/>`).join("")}` },
    plush: { name: "猫猫玩偶", draw: () => `<circle cx="140" cy="204" r="15" fill="#f6d27a" stroke="#c99a3e" stroke-width="1.6"/><path d="M128 196 l-2 -13 11 8z M152 196 l2 -13 -11 8z" fill="#f6d27a" stroke="#c99a3e" stroke-width="1.4"/><circle cx="135" cy="203" r="2" fill="#3a2a2a"/><circle cx="145" cy="203" r="2" fill="#3a2a2a"/><path d="M137 209 q3 3 6 0" stroke="#3a2a2a" stroke-width="1.5" fill="none"/>` },
    bouquet: { name: "花束", draw: () => `${[[132, 190], [144, 186], [138, 178], [150, 196], [126, 200]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="7" fill="${["#ffb3c4", "#ff6b81", "#c9a7f2", "#ffb3c4", "#ffffff"][i]}" stroke="#e88aa0" stroke-width=".8"/>`).join("")}<path d="M126 204 L152 204 L142 232 L136 232Z" fill="#8fc5f2" stroke="#5f9fd6" stroke-width="1.2"/>` },
    balloon: { name: "气球", draw: () => `<path d="M134 216 Q146 180 150 132" stroke="#999" stroke-width="1.5" fill="none"/><ellipse cx="152" cy="112" rx="18" ry="22" fill="#ff6b81" stroke="#d94a62" stroke-width="1.6"/><path d="M146 102 q4 -6 10 -4" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>` },
    book: { name: "书", draw: () => `<rect x="124" y="196" width="26" height="32" rx="3" fill="#3b5bdb" stroke="#28409e" stroke-width="1.4"/><rect x="128" y="200" width="18" height="4" rx="2" fill="#fff"/>` },
    mic: { name: "麦克风", draw: () => `<rect x="132" y="200" width="6" height="26" rx="3" fill="#555"/><circle cx="135" cy="196" r="8" fill="#9a9aa6" stroke="#6a6a76" stroke-width="1.4"/>` }
  };
  const BG = {
    pink: { name: "粉色房间", draw: () => `<rect width="200" height="300" fill="#ffe8ee"/><rect y="250" width="200" height="50" fill="#f7c9d4"/><rect x="20" y="40" width="44" height="54" rx="6" fill="#fff" opacity=".7"/><path d="M42 40 v54 M20 67 h44" stroke="#f7c9d4" stroke-width="2"/><circle cx="170" cy="60" r="4" fill="#fff"/>` },
    night: { name: "星空", draw: () => `<rect width="200" height="300" fill="#262044"/>${[[20, 30], [60, 60], [150, 90], [30, 140], [180, 170], [100, 18], [176, 236], [24, 220]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8" fill="#fff"/>`).join("")}<circle cx="168" cy="36" r="14" fill="#f2e6a8"/><circle cx="174" cy="32" r="12" fill="#262044"/>` },
    grass: { name: "草地", draw: () => `<rect width="200" height="300" fill="#d8f0ff"/><ellipse cx="60" cy="60" rx="26" ry="10" fill="#fff"/><rect y="236" width="200" height="64" fill="#9bd77f"/><circle cx="170" cy="40" r="16" fill="#fff4b0"/>` },
    sea: { name: "海边", draw: () => `<rect width="200" height="300" fill="#bfe6ff"/><rect y="196" width="200" height="44" fill="#5fb4e8"/><path d="M0 200 q12 -6 24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0" stroke="#fff" stroke-width="2" fill="none" opacity=".7"/><rect y="240" width="200" height="60" fill="#f6e2b3"/>` },
    cafe: { name: "咖啡店", draw: () => `<rect width="200" height="300" fill="#f3e7d8"/><rect x="0" y="62" width="200" height="6" fill="#c9a77a"/><rect y="250" width="200" height="50" fill="#b98b5e"/><rect x="18" y="20" width="40" height="34" rx="4" fill="#fff" opacity=".7"/><rect x="142" y="20" width="40" height="34" rx="4" fill="#fff" opacity=".7"/>` },
    plain: { name: "纯白", draw: () => `<rect width="200" height="300" fill="#ffffff"/>` }
  };
  /* ───── 男生款 ───── */
  Object.assign(MOUTH, {
    smirk: { name: "坏笑", g: "m", draw: () => `<path d="M92 135 Q102 138 110 131" stroke="#7a3a3a" stroke-width="2.4" fill="none" stroke-linecap="round"/>` },
    flat: { name: "面无表情", g: "m", draw: () => `<path d="M94 135 h12" stroke="#7a3a3a" stroke-width="2.4" stroke-linecap="round"/>` }
  });
  Object.assign(TOP, {
    tank: {
      name: "无袖背心",
      g: "m",
      draw: (c) => `<path d="M84 157 Q90 168 90 178 L86 218 Q100 224 114 218 L110 178 Q110 168 116 157 L108 157 Q100 172 92 157Z" fill="${c}" ${stk(c)}/>`
    },
    jersey: {
      name: "篮球服",
      g: "m",
      draw: (c) =>
        `<path d="M82 157 Q90 170 88 180 L84 220 Q100 226 116 220 L112 180 Q110 170 118 157 L108 157 Q100 172 92 157Z" fill="${c}" ${stk(c)}/><path d="M92 157 Q100 172 108 157" stroke="#fff" stroke-width="2.4" fill="none"/><text x="100" y="204" font-size="17" font-weight="800" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif">23</text>`
    },
    bomber: {
      name: "夹克",
      g: "m",
      draw: (c) =>
        sleeves(c, true) +
        torso(c, "M72 168 Q72 158 88 157 L112 157 Q128 158 128 168 L130 216 Q100 222 70 216Z") +
        `<path d="M72 210 Q100 216 128 210 L130 220 Q100 226 70 220Z" fill="${shade(c, 0.78)}"/><path d="M100 158 V218" stroke="${ol(c)}" stroke-width="1.8"/><path d="M86 157 Q100 166 114 157 L112 152 Q100 160 88 152Z" fill="${shade(c, 0.78)}"/><rect x="78" y="176" width="10" height="3" rx="1.5" fill="${ol(c)}"/>`
    },
    leather: {
      name: "皮衣",
      g: "m",
      draw: (c) =>
        sleeves("#1f1d22", true) +
        torso("#1f1d22") +
        `<path d="M92 157 L100 176 L108 157Z" fill="#f2f2f5"/><path d="M84 157 L96 190 L90 157Z M116 157 L104 190 L110 157Z" fill="#2e2b32" stroke="#000" stroke-width="1"/><path d="M104 170 L112 214" stroke="#c9c9d0" stroke-width="1.6"/><path d="M78 196 h10 M112 196 h10" stroke="#444" stroke-width="2"/>` +
        `<path d="M74 168 Q80 162 86 160" stroke="#fff" stroke-width="2" opacity=".2" fill="none"/>`
    },
    trench: {
      name: "风衣",
      g: "m",
      draw: (c) =>
        sleeves(c, true) +
        `<path d="M72 166 Q72 158 88 157 L112 157 Q128 158 128 166 L136 252 Q100 260 64 252Z" fill="${c}" ${stk(c)}/><path d="M86 157 L100 190 L94 157Z M114 157 L100 190 L106 157Z" fill="${shade(c, 0.82)}" ${stk(c, 1)}/><path d="M70 204 L130 204 L131 211 L69 211Z" fill="${shade(c, 0.75)}"/><rect x="96" y="203" width="8" height="9" rx="1" fill="none" stroke="#d4b25a" stroke-width="1.6"/><circle cx="92" cy="182" r="2" fill="${ol(c)}"/><circle cx="108" cy="182" r="2" fill="${ol(c)}"/><path d="M100 212 V254" stroke="${ol(c)}" stroke-width="1.4"/>`
    },
    gakuran: {
      name: "立领制服",
      g: "m",
      draw: (c) =>
        sleeves(c, true) +
        torso(c) +
        `<rect x="88" y="150" width="24" height="10" rx="3" fill="${c}" ${stk(c)}/>` +
        [168, 182, 196, 210].map((y) => `<circle cx="100" cy="${y}" r="2.6" fill="#e8c55a" stroke="#b38f2a" stroke-width=".8"/>`).join("")
    },
    cardigan: {
      name: "开衫",
      g: "m",
      draw: (c) =>
        sleeves(c, true) +
        torso("#f7f7fb") +
        `<path d="M74 168 Q74 158 88 157 L96 157 L96 218 Q84 220 72 216Z M126 168 Q126 158 112 157 L104 157 L104 218 Q116 220 128 216Z" fill="${c}" ${stk(c)}/>` +
        [176, 190, 204].map((y) => `<circle cx="97" cy="${y}" r="1.8" fill="${ol(c)}"/>`).join("")
    }
  });
  Object.assign(BOTTOM, {
    cargo: {
      name: "工装裤",
      g: "m",
      draw: (c) =>
        `<path d="M74 210 L126 210 L125 264 L104 264 L100 228 L96 264 L75 264Z" fill="${c}" ${stk(c)}/><rect x="72" y="232" width="12" height="14" rx="2" fill="${shade(c, 0.85)}" ${stk(c, 1)}/><rect x="116" y="232" width="12" height="14" rx="2" fill="${shade(c, 0.85)}" ${stk(c, 1)}/><path d="M74 212 h52" stroke="#3a2a2a" stroke-width="3"/>`
    },
    track: {
      name: "运动裤",
      g: "m",
      draw: (c) => `<path d="M74 210 L126 210 L125 264 L104 264 L100 228 L96 264 L75 264Z" fill="${c}" ${stk(c)}/><path d="M77 214 L78 262 M123 214 L122 262" stroke="#fff" stroke-width="2.6"/><path d="M76 260 h20 M104 260 h20" stroke="${shade(c, 0.75)}" stroke-width="4"/>`
    },
    ripped: {
      name: "破洞牛仔裤",
      g: "m",
      draw: (c) =>
        `<path d="M74 210 L126 210 L125 264 L104 264 L100 228 L96 264 L75 264Z" fill="${c}" ${stk(c)}/><path d="M80 236 q5 -2 10 0 q-5 3 -10 0Z M108 246 q5 -2 10 0 q-5 3 -10 0Z" fill="#f6cfb2"/><path d="M80 236 h10 M108 246 h10" stroke="#fff" stroke-width="1" stroke-dasharray="2 1.5"/><path d="M100 212 v14" stroke="${ol(c)}" stroke-width="1.2"/>`
    }
  });
  Object.assign(SHOES, {
    leather: { name: "皮鞋", g: "m", draw: () => `<path d="M76 264 h20 q6 2 8 8 h-30 q-2 -8 2 -8z M104 264 h20 q4 0 2 8 h-30 q2 -6 8 -8z" fill="#2b2326" stroke="#000" stroke-width="1.2"/><path d="M80 266 q6 -1 10 0 M108 266 q6 -1 10 0" stroke="#fff" stroke-width="1.4" opacity=".5"/>` },
    hightop: {
      name: "高帮帆布鞋",
      g: "m",
      draw: (c) =>
        `<path d="M80 250 h16 v14 q6 2 8 8 h-30 q0 -6 6 -8z M104 250 h16 v14 q6 2 4 8 h-30 q2 -6 10 -8z" fill="${c}" ${stk(c)}/><path d="M74 272 h30 M98 272 h30" stroke="#fff" stroke-width="3.4"/><path d="M84 254 l8 4 M84 259 l8 4 M108 254 l8 4 M108 259 l8 4" stroke="#fff" stroke-width="1.4"/>`
    }
  });
  Object.assign(ACC, {
    cap: { name: "鸭舌帽", g: "m", draw: (c) => `<path d="M48 70 Q48 22 100 22 Q152 22 152 70Z" fill="#3b5bdb" stroke="#28409e" stroke-width="1.8"/><path d="M44 70 Q100 62 168 76 Q160 84 100 78 Q60 78 44 70Z" fill="#28409e"/><circle cx="100" cy="24" r="3" fill="#28409e"/>` },
    capback: { name: "反戴鸭舌帽", g: "m", draw: () => `<path d="M48 66 Q48 22 100 22 Q152 22 152 66Z" fill="#2b2b2b" stroke="#000" stroke-width="1.6"/><path d="M60 64 Q100 70 140 64" stroke="#000" stroke-width="2" fill="none"/><path d="M136 30 Q166 34 172 52 Q160 50 146 42Z" fill="#1a1a1a"/><rect x="92" y="52" width="16" height="8" rx="2" fill="none" stroke="#777" stroke-width="1.4"/>` },
    beanie: { name: "毛线帽", g: "m", draw: () => `<path d="M48 70 Q46 18 100 16 Q154 18 152 70Z" fill="#5c4b8a" stroke="#3f3266" stroke-width="1.6"/><rect x="44" y="60" width="112" height="16" rx="7" fill="#4a3c72" stroke="#3f3266" stroke-width="1.4"/>${[58, 72, 86, 100, 114, 128, 142].map((x) => `<path d="M${x} 62 v12" stroke="#3f3266" stroke-width="1.2"/>`).join("")}` },
    earring: { name: "耳钉 + 项链", g: "m", draw: () => `<circle cx="52" cy="122" r="2.8" fill="#e8e8f0" stroke="#999" stroke-width=".8"/><circle cx="148" cy="122" r="2.8" fill="#e8e8f0" stroke="#999" stroke-width=".8"/><path d="M88 158 Q100 176 112 158" stroke="#cfcfd8" stroke-width="2" fill="none" stroke-dasharray="3 1.5"/><path d="M98 172 l2 6 2 -6z" fill="#cfcfd8"/>` },
    bandaid: { name: "创可贴", g: "m", draw: () => `<rect x="120" y="120" width="20" height="8" rx="4" fill="#f2c9a0" stroke="#d6a77a" stroke-width="1" transform="rotate(-20 130 124)"/><path d="M127 122 l0 4 M130 121 l0 4 M133 120 l0 4" stroke="#d6a77a" stroke-width=".8" transform="rotate(-20 130 124)"/>` },
    mask: { name: "黑口罩", g: "m", draw: () => `<path d="M72 120 Q100 112 128 120 L126 140 Q100 152 74 140Z" fill="#232126" stroke="#000" stroke-width="1.2"/><path d="M72 122 L52 112 M128 122 L148 112" stroke="#232126" stroke-width="2"/>` }
  });
  Object.assign(HELD, {
    ball: { name: "篮球", g: "m", draw: () => `<circle cx="142" cy="208" r="15" fill="#f08a3c" stroke="#b85a1c" stroke-width="1.6"/><path d="M127 208 h30 M142 193 v30 M131 197 Q142 208 131 219 M153 197 Q142 208 153 219" stroke="#7a3a10" stroke-width="1.4" fill="none"/>` },
    phone: { name: "手机", g: "m", draw: () => `<rect x="128" y="194" width="16" height="28" rx="3" fill="#2b2b2b" stroke="#000" stroke-width="1"/><rect x="131" y="198" width="10" height="18" rx="1.5" fill="#6a8ad8"/>` },
    coffee: { name: "咖啡", g: "m", draw: () => `<path d="M126 198 h18 l-2 26 h-14z" fill="#fff" stroke="#bbb" stroke-width="1.2"/><rect x="124" y="194" width="22" height="5" rx="2" fill="#3a2a2a"/><rect x="127" y="206" width="16" height="8" fill="#b98b5e"/>` }
  });
  // 女生款 / 男生款打标；没打标的是男女都能穿
  const tag = (set, keys, g) => keys.forEach((k) => set[k] && (set[k].g = g));
  tag(TOP, ["dress", "sailor", "kimono"], "f");
  tag(BOTTOM, ["skirt", "pleated", "none"], "f");
  tag(SHOES, ["maryjane"], "f");
  tag(ACC, ["bow", "flower", "crown"], "f");
  tag(HELD, ["bouquet"], "f");
  tag(MOUTH, ["pout"], "f");
  // 这些以前算男生款，其实男女都行
  ["cardigan"].forEach((k) => TOP[k] && delete TOP[k].g);
  ["track"].forEach((k) => BOTTOM[k] && delete BOTTOM[k].g);
  ["hightop"].forEach((k) => SHOES[k] && delete SHOES[k].g);
  ["cap", "beanie", "earring"].forEach((k) => ACC[k] && delete ACC[k].g);
  ["phone", "coffee"].forEach((k) => HELD[k] && delete HELD[k].g);
  const fits = (set, k, sex) => !!set[k] && (!set[k].g || set[k].g === sex);

  const CATS = [
    { k: "hair", name: "发型", set: HAIR, color: "hairC" },
    { k: "eyes", name: "眼睛", set: EYES, color: "eyeC" },
    { k: "mouth", name: "嘴巴", set: MOUTH },
    { k: "top", name: "上衣", set: TOP, color: "topC" },
    { k: "bottom", name: "下装", set: BOTTOM, color: "botC" },
    { k: "shoes", name: "鞋子", set: SHOES, color: "shoeC" },
    { k: "acc", name: "配饰", set: ACC },
    { k: "held", name: "手里", set: HELD },
    { k: "skin", name: "肤色" },
    { k: "bg", name: "背景", set: BG }
  ];
  const DEF_F = { sex: "f", skin: 0, hair: "short", hairC: 1, eyes: "round", eyeC: 1, mouth: "smile", top: "tee", topC: 7, bottom: "skirt", botC: 0, shoes: "sneakers", shoeC: 11, acc: "none", held: "none", bg: "pink" };
  const DEF_M = { sex: "m", skin: 0, hair: "fringe", hairC: 0, eyes: "round", eyeC: 1, mouth: "smile", top: "shirt", topC: 13, bottom: "pants", botC: 0, shoes: "sneakers", shoeC: 11, acc: "none", held: "none", bg: "plain" };
  const DEF = DEF_F;
  const sexOf = (gender) => (/男|male|boy|♂/i.test(String(gender || "")) ? "m" : "f");
  /** 把存档整理成合法的一身；穿了另一性别的款就换成这个性别的默认 */
  const valid = (o) => {
    const sex = o && (o.sex === "m" || o.sex === "f") ? o.sex : "f";
    const D = sex === "m" ? DEF_M : DEF_F;
    const out = { ...D };
    for (const c of CATS) {
      const v = o && o[c.k];
      if (c.k === "skin") out.skin = Number.isInteger(v) && v >= 0 && v < SKIN.length ? v : D.skin;
      else if (c.set && v != null && fits(c.set, v, sex)) out[c.k] = v;
      if (c.color) {
        const cv = Number(o && o[c.color]);
        if (Number.isInteger(cv) && cv >= 0 && cv < PAL.length) out[c.color] = cv;
      }
    }
    if (TOP[out.top].dress) out.bottom = "none";
    else if (out.bottom === "none") out.bottom = D.bottom;
    return out;
  };
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  /** 随机一身：男生只挑男生款 + 通用款，女生只挑女生款 + 通用款 */
  function randomOutfit(gender, sexForce) {
    const sex = sexForce || sexOf(gender);
    const o = { sex, skin: Math.floor(Math.random() * SKIN.length) };
    for (const c of CATS) {
      if (c.set) {
        const keys = Object.keys(c.set).filter((k) => fits(c.set, k, sex) && k !== "none");
        const own = keys.filter((k) => c.set[k].g === sex);
        o[c.k] = rnd(own.length && Math.random() < 0.6 ? own : keys.length ? keys : Object.keys(c.set));
      }
      if (c.color) o[c.color] = Math.floor(Math.random() * PAL.length);
    }
    if (Math.random() < 0.5) o.acc = "none";
    if (Math.random() < 0.5) o.held = "none";
    if (sex === "m") o.hairC = rnd([0, 0, 1, 1, 2, 4, 3, 13]);
    return valid(o);
  }

  /** 画一个小人 */
  function doll(o0) {
    const o = valid(o0);
    const sex = o.sex;
    const sk = SKIN[o.skin];
    const skO = shade(sk, 0.78);
    const skS = shade(sk, 0.9);
    const hc = PAL[o.hairC];
    const isDress = TOP[o.top].dress;
    const id = "dri" + ++gid;
    const g = { id: id + "h", c: hc };
    const face = sex === "m" ? FACE_M : FACE_F;
    const blush = sex === "m" ? 0.16 : 0.42;
    return `<svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${g.id}" gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="0" y2="230"><stop offset="0" stop-color="${mixW(hc, 0.14)}"/><stop offset=".35" stop-color="${hc}"/><stop offset="1" stop-color="${shade(hc, 0.68)}"/></linearGradient>
        <radialGradient id="${id}bl"><stop offset="0" stop-color="#ff7d95" stop-opacity=".9"/><stop offset="1" stop-color="#ff7d95" stop-opacity="0"/></radialGradient>
        <linearGradient id="${id}lt" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".1"/><stop offset=".35" stop-color="#000" stop-opacity="0"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>
      </defs>
      ${BG[o.bg].draw()}
      <ellipse cx="100" cy="276" rx="44" ry="7" fill="#000" opacity=".1"/>
      ${paintHair(HAIR[o.hair].back, g)}
      <rect x="84" y="212" width="13" height="54" rx="6" fill="${sk}" stroke="${skO}" stroke-width="1.2"/><rect x="103" y="212" width="13" height="54" rx="6" fill="${sk}" stroke="${skO}" stroke-width="1.2"/>
      ${SHOES[o.shoes].draw(PAL[o.shoeC])}
      <path d="M80 164 Q69 188 66 210 M120 164 Q131 188 134 210" stroke="${skO}" stroke-width="14" stroke-linecap="round" fill="none"/><path d="M80 164 Q69 188 66 210 M120 164 Q131 188 134 210" stroke="${sk}" stroke-width="11.6" stroke-linecap="round" fill="none"/>
      <circle cx="66" cy="213" r="7" fill="${sk}" stroke="${skO}" stroke-width="1.2"/><circle cx="134" cy="213" r="7" fill="${sk}" stroke="${skO}" stroke-width="1.2"/>
      <path d="M74 168 Q74 158 88 157 L112 157 Q126 158 126 168 L128 216 Q100 222 72 216Z" fill="${sk}"/>
      <rect x="${sex === "m" ? 92 : 93.5}" y="142" width="${sex === "m" ? 16 : 13}" height="20" rx="5" fill="${sk}"/><path d="M92 150 Q100 158 108 150 L108 146 L92 146Z" fill="${skS}" opacity=".9"/>
      ${isDress ? "" : BOTTOM[o.bottom].draw(PAL[o.botC])}
      ${TOP[o.top].draw(PAL[o.topC])}
      <path d="M50 104 Q42 104 43 114 Q45 124 53 124Z M150 104 Q158 104 157 114 Q155 124 147 124Z" fill="${sk}" stroke="${skO}" stroke-width="1.2"/><path d="M48 110 q2 4 5 6 M152 110 q-2 4 -5 6" stroke="${skO}" stroke-width="1" fill="none"/>
      <path d="${face}" fill="${sk}" stroke="${skO}" stroke-width="1.3"/>
      ${EYES[o.eyes].draw(PAL[o.eyeC], id, sk, sex)}
      <ellipse cx="68" cy="128" rx="11" ry="6" fill="url(#${id}bl)" opacity="${blush}"/><ellipse cx="132" cy="128" rx="11" ry="6" fill="url(#${id}bl)" opacity="${blush}"/>
      ${sex === "m" ? `<path d="M102 115 Q104 121 100 123" stroke="${shade(sk, 0.72)}" stroke-width="1.1" fill="none" stroke-linecap="round"/>` : `<path d="M64 127 l2.4 -2.4 M69 128 l2.4 -2.4 M128 127 l2.4 -2.4 M133 128 l2.4 -2.4" stroke="#ff7f99" stroke-width="1" opacity=".55" stroke-linecap="round"/><path d="M100.5 121 l-1 2.2" stroke="${shade(sk, 0.7)}" stroke-width="1.1" stroke-linecap="round"/>`}
      ${MOUTH[o.mouth].draw()}
      ${paintHair(HAIR[o.hair].front, g)}
      ${ACC[o.acc].draw(hc)}
      ${HELD[o.held].draw()}
    </svg>`;
  }
  function describe(o0) {
    const o = valid(o0);
    const col = (i) => PAL_NAME[i];
    return [
      `${col(o.hairC)}${HAIR[o.hair].name}`,
      EYES[o.eyes].name,
      `${col(o.topC)}${TOP[o.top].name}`,
      TOP[o.top].dress || o.bottom === "none" ? "" : `${col(o.botC)}${BOTTOM[o.bottom].name}`,
      o.shoes === "barefoot" ? "光着脚" : `${col(o.shoeC)}${SHOES[o.shoes].name}`,
      o.acc !== "none" ? "戴着" + ACC[o.acc].name : "",
      o.held !== "none" ? "拿着" + HELD[o.held].name : "",
      "背景是" + BG[o.bg].name
    ]
      .filter(Boolean)
      .join("、");
  }

  /* ───── 存档 ───── */
  let S = { user: null, chars: {}, last: "" };
  const load = async () => {
    try {
      S = (await F.FunDB.get(KV)) || S;
    } catch (_) {
      /* ignore */
    }
    S.chars = S.chars || {};
  };
  const save = () => F.FunDB.set(KV, S).catch(() => toast("保存失败"));

  /* ───── 界面 ───── */
  let root = null;
  let cast = [];
  let user = null;
  let ch = null; // 当前的角色
  let who = "me"; // 正在给谁换：me / char
  let tab = "hair";
  let busy = false;

  /** 取某个小人的这一身；旧存档没有性别就按人设性别补上 */
  const outfitOf = (w) => {
    if (w === "me") {
      if (!S.user) S.user = valid(sexOf(user.gender) === "m" ? DEF_M : DEF_F);
      else if (!S.user.sex) S.user = valid({ ...S.user, sex: sexOf(user.gender) });
      return S.user;
    }
    const cur = S.chars[ch.id];
    if (!cur) S.chars[ch.id] = randomOutfit(ch.gender);
    else if (!cur.sex) S.chars[ch.id] = valid({ ...cur, sex: sexOf(ch.gender) });
    return S.chars[ch.id];
  };
  /** 换性别：不合适的单品换成新性别的默认款，颜色和肤色保留 */
  function switchSex(w, sex) {
    const o = outfitOf(w);
    if (o.sex === sex) return;
    const D = sex === "m" ? DEF_M : DEF_F;
    const n = { ...o, sex };
    for (const c of CATS) if (c.set && !fits(c.set, n[c.k], sex)) n[c.k] = D[c.k];
    if (w === "me") S.user = valid(n);
    else S.chars[ch.id] = valid(n);
    save();
  }
  function render() {
    if (!root) return;
    if (!ch) {
      root.innerHTML = `<div class="dr-pick"><div class="mlm-logo">👗<span>换装小屋</span></div><p class="fun-note">选一个角色。你们俩各有一个小人：你可以给自己换装、给 TA 换装，也可以让 TA 来搭配。</p>
        <div class="mm-to">${cast.map((c) => `<button type="button" class="pt-person" data-char="${esc(c.id)}">${F.avHtml(c, "fun-av")}<strong>${esc(c.name)}</strong></button>`).join("") || `<p class="fun-note">角色库里还没有角色</p>`}</div></div>`;
      return;
    }
    const cat = CATS.find((c) => c.k === tab);
    const o = outfitOf(who);
    let items = "";
    if (tab === "skin") items = SKIN.map((c, i) => `<button type="button" class="dr-sw${o.skin === i ? " is-on" : ""}" data-skin="${i}" style="background:${c}"></button>`).join("");
    else
      items = Object.entries(cat.set)
        .filter(([, v]) => !v.g || v.g === o.sex)
        .map(([k, v]) => `<button type="button" class="dr-item${o[tab] === k ? " is-on" : ""}" data-item="${k}">${esc(v.name)}</button>`)
        .join("");
    const colors = cat.color ? `<div class="dr-colors">${PAL.map((c, i) => `<button type="button" class="dr-sw${o[cat.color] === i ? " is-on" : ""}" data-col="${i}" style="background:${c}" title="${PAL_NAME[i]}"></button>`).join("")}</div>` : "";
    root.innerHTML = `<div class="dr">
      <div class="dr-stage">
        <button type="button" class="dr-doll${who === "me" ? " is-on" : ""}" data-who="me">${doll(outfitOf("me"))}<b>${esc(user.name)}</b></button>
        <button type="button" class="dr-doll${who === "char" ? " is-on" : ""}" data-who="char">${doll(outfitOf("char"))}<b>${esc(ch.name)}</b></button>
      </div>
      <div class="dr-say" id="dr-say">${S.lastSay && S.lastSayFor === ch.id ? `${F.avHtml(ch, "fun-av sm")}<p>${esc(S.lastSay)}</p>` : `<p class="fun-note">点上面的小人选择给谁换装 · 现在在给 <b>${who === "me" ? "自己" : esc(ch.name)}</b> 换</p>`}</div>
      <div class="dr-ai">
        <button type="button" data-a="charself" ${busy ? "disabled" : ""}>✨ 让 TA 给自己搭</button>
        <button type="button" data-a="charme" ${busy ? "disabled" : ""}>💝 让 TA 给我搭</button>
        <button type="button" data-a="show" ${busy ? "disabled" : ""}>👀 给 TA 看看</button>
      </div>
      <div class="dr-sex"><span>给 <b>${who === "me" ? "自己" : esc(ch.name)}</b> 换 · 衣柜</span><button type="button" class="${o.sex === "f" ? "is-on" : ""}" data-sex="f">♀ 女生款</button><button type="button" class="${o.sex === "m" ? "is-on" : ""}" data-sex="m">♂ 男生款</button></div>
      <div class="dr-tabs">${CATS.map((c) => `<button type="button" class="${c.k === tab ? "is-on" : ""}" data-tab="${c.k}">${c.name}</button>`).join("")}</div>
      <div class="dr-items">${items}</div>
      ${colors}
      <div class="dr-foot"><button type="button" class="fun-btn ghost sm" data-a="rand">🎲 随机</button><button type="button" class="fun-btn ghost sm" data-a="reset">还原</button><button type="button" class="fun-btn ghost sm" data-a="swap">换角色</button><button type="button" class="fun-btn solid sm" data-a="png">存成图片</button></div>
    </div>`;
  }
  function setSay(text) {
    S.lastSay = text;
    S.lastSayFor = ch.id;
    save();
    render();
  }

  const catalogText = (sex) =>
    CATS.filter((c) => c.set)
      .map((c) => `${c.k}（${c.name}）：${Object.entries(c.set).filter(([, v]) => !v.g || v.g === sex).map(([k, v]) => `${k}=${v.name}`).join("，")}`)
      .join("\n") +
    `\nskin（肤色）：0~${SKIN.length - 1}，0 最白\n颜色编号（hairC 发色 / eyeC 眼睛颜色 / topC 上衣色 / botC 下装色 / shoeC 鞋子色）：${PAL_NAME.map((n, i) => `${i}=${n}`).join("，")}\n注意：top 选 dress（连衣裙）时 bottom 用 none。`;

  async function charDress(target) {
    if (busy) return;
    if (!F.hasApiKey()) {
      const o = randomOutfit(null, outfitOf(target === "char" ? "char" : "me").sex);
      if (target === "char") S.chars[ch.id] = o;
      else {
        S.prevUser = S.user;
        S.user = o;
      }
      save();
      toast("没填 API Key，先随机搭了一身");
      return render();
    }
    busy = true;
    render();
    const cur = target === "char" ? outfitOf("char") : outfitOf("me");
    try {
      const txt = await F.aiText(
        [
          {
            role: "system",
            content: `你是「${ch.name}」。${ch.persona ? "人设：\n" + ch.persona + "\n" : ""}你和「${user.name}」在玩换装游戏，每人有一个 Q 版小人。${ch.gender ? `你是${ch.gender}生。` : ""}${user.gender ? `${user.name}是${user.gender}生。` : ""}这个小人是${cur.sex === "m" ? "男生" : "女生"}，衣柜里只列了适合的款式，按性格挑。${
              target === "char" ? "现在你给你自己的小人搭一身衣服，要符合你的性格和审美。" : `现在你给「${user.name}」的小人搭一身你觉得最好看 / 最想看 TA 穿的衣服。`
            }\n只能从下面的衣柜里选：\n${catalogText(cur.sex)}\n只输出 JSON：{"outfit":{"hair":"","hairC":0,"eyes":"","eyeC":0,"mouth":"","top":"","topC":0,"bottom":"","botC":0,"shoes":"","shoeC":0,"acc":"","held":"","bg":"","skin":0},"say":"你搭完之后说的一两句话（按人设、口语）"}`
          },
          { role: "user", content: `${target === "char" ? "你" : user.name}现在穿的是：${describe(cur)}。开始搭吧。` }
        ],
        { maxTokens: 600, temperature: 0.95 }
      );
      const j = F.parseJsonLoose(txt);
      if (!j || !j.outfit) throw new Error("没搭出来，再试一次");
      const o = valid({ ...cur, ...j.outfit, sex: cur.sex });
      if (TOP[o.top].dress) o.bottom = "none";
      if (target === "char") S.chars[ch.id] = o;
      else {
        S.prevUser = S.user;
        S.user = o;
      }
      busy = false;
      setSay(F.cleanLine(j.say || "", 120, ch.name) || "搭好啦！");
    } catch (err) {
      busy = false;
      toast(err.message || "失败了");
      render();
    }
  }
  async function showToChar() {
    if (!F.hasApiKey()) return toast("要先填 API Key，TA 才能评价");
    if (busy) return;
    busy = true;
    render();
    try {
      const txt = await F.aiText(
        [
          { role: "system", content: `你是「${ch.name}」。${ch.persona ? "人设：\n" + ch.persona + "\n" : ""}你和「${user.name}」在玩换装游戏。按人设说一两句真实的反应，口语化，可以夸、可以吐槽、可以害羞。不要加名字前缀。` },
          { role: "user", content: `${user.name}给你的小人搭的是：${describe(outfitOf("char"))}。\n${user.name}自己的小人穿的是：${describe(outfitOf("me"))}。\n你看了之后说：` }
        ],
        { maxTokens: 300, temperature: 0.95 }
      );
      busy = false;
      setSay(F.cleanLine(txt, 160, ch.name));
    } catch (err) {
      busy = false;
      toast(err.message || "失败了");
      render();
    }
  }
  function exportPng() {
    const svgs = [doll(outfitOf("me")), doll(outfitOf("char"))];
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 680;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 800, 680);
    let n = 0;
    svgs.forEach((s, i) => {
      const im = new Image();
      im.onload = () => {
        ctx.drawImage(im, 10 + i * 395, 10, 380, 570);
        if (++n === 2) {
          ctx.fillStyle = "#333";
          ctx.font = "600 30px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(user.name, 200, 625);
          ctx.fillText(ch.name, 595, 625);
          ctx.font = "18px system-ui, sans-serif";
          ctx.fillStyle = "#999";
          ctx.fillText("Meow · 换装小屋", 400, 662);
          const a = document.createElement("a");
          a.href = c.toDataURL("image/png");
          a.download = `Meow-换装-${user.name}-${ch.name}.png`;
          a.click();
          toast("图片已保存");
        }
      };
      im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
    });
  }

  function onClick(e) {
    const cb = e.target.closest("[data-char]");
    if (cb) {
      ch = cast.find((c) => c.id === cb.dataset.char);
      S.last = ch.id;
      save();
      return render();
    }
    if (!ch) return;
    const w = e.target.closest("[data-who]");
    if (w) {
      who = w.dataset.who;
      return render();
    }
    const sxb = e.target.closest("[data-sex]");
    if (sxb) {
      switchSex(who, sxb.dataset.sex);
      return render();
    }
    const t = e.target.closest("[data-tab]");
    if (t) {
      tab = t.dataset.tab;
      return render();
    }
    const o = outfitOf(who);
    const it = e.target.closest("[data-item]");
    if (it) {
      o[tab] = it.dataset.item;
      if (tab === "top" && TOP[o.top].dress) o.bottom = "none";
      if (tab === "bottom" && o.bottom !== "none" && TOP[o.top].dress) o.top = "tee";
      save();
      return render();
    }
    const col = e.target.closest("[data-col]");
    if (col) {
      const cat = CATS.find((c) => c.k === tab);
      o[cat.color] = Number(col.dataset.col);
      save();
      return render();
    }
    const sk = e.target.closest("[data-skin]");
    if (sk) {
      o.skin = Number(sk.dataset.skin);
      save();
      return render();
    }
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "charself") void charDress("char");
    if (a === "charme") void charDress("me");
    if (a === "show") void showToChar();
    if (a === "rand") {
      const sx = outfitOf(who).sex;
      if (who === "me") S.user = randomOutfit(null, sx);
      else S.chars[ch.id] = randomOutfit(null, sx);
      save();
      render();
    }
    if (a === "reset") {
      const sx = outfitOf(who).sex;
      if (who === "me") S.user = valid(sx === "m" ? DEF_M : DEF_F);
      else S.chars[ch.id] = valid(sx === "m" ? DEF_M : DEF_F);
      save();
      render();
    }
    if (a === "swap") {
      ch = null;
      render();
    }
    if (a === "png") exportPng();
  }

  F.register("换装小屋", {
    title: "换装小屋",
    kicker: "DRESS UP",
    async mount(body) {
      root = document.createElement("div");
      root.className = "dr-root";
      body.appendChild(root);
      root.addEventListener("click", onClick);
      [cast, user] = await Promise.all([F.loadCast(), F.loadUser()]);
      await load();
      ch = cast.find((c) => c.id === S.last) || null;
      render();
    },
    unmount() {
      root = null;
    }
  });
  window.XXJ_DRESS = { doll, describe, randomOutfit, HAIR, EYES };
})();
