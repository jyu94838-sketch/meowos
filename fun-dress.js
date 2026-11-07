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
  const FACE = "M50 96 Q50 40 100 40 Q150 40 150 96 Q150 134 120 150 Q100 160 80 150 Q50 134 50 96Z";
  const BANG_PTS = "M48 100 Q44 40 100 34 Q156 40 152 100 L146 82 L136 96 L128 70 L116 90 L104 64 L92 90 L80 68 L70 94 L58 80Z";
  const bangs = (c) => `<path d="${BANG_PTS}" fill="${c}" ${stk(c)}/><path d="M66 56 Q100 40 134 56" stroke="#fff" stroke-width="5" opacity=".28" fill="none" stroke-linecap="round"/>`;
  const sideLocks = (c) => `<path d="M50 90 Q44 128 58 152 Q62 124 62 98Z" fill="${c}" ${stk(c, 1.2)}/><path d="M150 90 Q156 128 142 152 Q138 124 138 98Z" fill="${c}" ${stk(c, 1.2)}/>`;
  const sweep = (c) => `<path d="M46 102 Q40 34 104 32 Q160 38 154 100 Q148 74 128 66 Q120 84 100 80 Q74 76 64 72 Q52 84 46 102Z" fill="${c}" ${stk(c)}/><path d="M70 52 Q104 38 138 54" stroke="#fff" stroke-width="5" opacity=".28" fill="none" stroke-linecap="round"/>`;
  const HAIR = {
    short: { name: "短发", back: (c) => `<path d="M42 104 Q38 30 100 28 Q162 30 158 104 Q160 132 148 148 L52 148 Q40 132 42 104Z" fill="${c}" ${stk(c)}/>`, front: (c) => bangs(c) },
    long: {
      name: "长直发",
      back: (c) => `<path d="M40 100 Q36 26 100 26 Q164 26 160 100 L166 222 Q100 236 34 222Z" fill="${c}" ${stk(c)}/><path d="M60 150 L58 216 M140 150 L142 216" stroke="${ol(c)}" stroke-width="1.2" opacity=".5"/>`,
      front: (c) => bangs(c) + sideLocks(c)
    },
    twin: {
      name: "双马尾",
      back: (c) =>
        `<path d="M42 104 Q38 30 100 28 Q162 30 158 104 L150 140 L50 140Z" fill="${c}" ${stk(c)}/><path d="M48 70 Q8 96 18 160 Q22 196 40 206 Q34 170 48 136 Q56 108 56 84Z" fill="${c}" ${stk(c)}/><path d="M152 70 Q192 96 182 160 Q178 196 160 206 Q166 170 152 136 Q144 108 144 84Z" fill="${c}" ${stk(c)}/>`,
      front: (c) => bangs(c) + `<circle cx="50" cy="72" r="7" fill="#ff7a93" stroke="#d9506c" stroke-width="1.4"/><circle cx="150" cy="72" r="7" fill="#ff7a93" stroke="#d9506c" stroke-width="1.4"/>`
    },
    bun: {
      name: "丸子头",
      back: (c) => `<circle cx="100" cy="24" r="22" fill="${c}" ${stk(c)}/><path d="M42 104 Q38 30 100 28 Q162 30 158 104 Q160 132 148 146 L52 146 Q40 132 42 104Z" fill="${c}" ${stk(c)}/>`,
      front: (c) => bangs(c) + `<path d="M84 16 Q100 8 116 16" stroke="#fff" stroke-width="3" opacity=".3" fill="none" stroke-linecap="round"/>`
    },
    wavy: {
      name: "大波浪",
      back: (c) =>
        `<path d="M38 100 Q34 24 100 24 Q166 24 162 100 Q178 130 164 160 Q180 192 160 218 Q132 236 100 226 Q68 236 40 218 Q20 192 36 160 Q22 130 38 100Z" fill="${c}" ${stk(c)}/>`,
      front: (c) => sweep(c) + `<path d="M48 96 Q40 124 52 146 Q44 168 58 184 Q62 150 64 112Z" fill="${c}" ${stk(c, 1.2)}/><path d="M152 96 Q160 124 148 146 Q156 168 142 184 Q138 150 136 112Z" fill="${c}" ${stk(c, 1.2)}/>`
    },
    spiky: {
      name: "刺猬头",
      back: (c) => `<path d="M42 104 Q38 30 100 28 Q162 30 158 104 Q160 126 150 140 L50 140 Q40 126 42 104Z" fill="${c}" ${stk(c)}/>`,
      front: (c) => `<path d="M44 104 L34 62 L58 70 L54 30 L78 50 L88 16 L104 46 L120 18 L128 50 L150 32 L146 70 L168 62 L156 104 L144 82 L132 96 L122 72 L110 90 L98 68 L86 90 L74 72 L64 94 L56 80Z" fill="${c}" ${stk(c)}/>`
    },
    bob: {
      name: "波波头",
      back: (c) => `<path d="M38 100 Q34 26 100 26 Q166 26 162 100 L164 156 Q150 166 134 158 L66 158 Q50 166 36 156Z" fill="${c}" ${stk(c)}/>`,
      front: (c) => bangs(c) + `<path d="M50 96 Q46 134 52 156 Q60 140 62 104Z" fill="${c}" ${stk(c, 1.2)}/><path d="M150 96 Q154 134 148 156 Q140 140 138 104Z" fill="${c}" ${stk(c, 1.2)}/>`
    }
  };
  // 眼睛：(80,110) 和 (120,110)
  const EYE_L = 80;
  const EYE_R = 120;
  const EY = 110;
  let gid = 0;
  const animeEye = (cx, c, id, opt) => {
    const o = opt || {};
    if (o.sharp)
      return `<path d="M${cx - 11} ${EY - 1} Q${cx} ${EY - 9} ${cx + 11} ${EY - 2} Q${cx + 6} ${EY + 7} ${cx} ${EY + 7} Q${cx - 7} ${EY + 7} ${cx - 11} ${EY - 1}Z" fill="#fff"/>
        <ellipse cx="${cx}" cy="${EY}" rx="6.6" ry="7.4" fill="url(#${id})"/><ellipse cx="${cx}" cy="${EY + 1}" rx="3" ry="4.2" fill="#1d1420"/><circle cx="${cx + 2.6}" cy="${EY - 2.6}" r="2.2" fill="#fff"/>
        <path d="M${cx - 13} ${EY - 2} Q${cx} ${EY - 11} ${cx + 13} ${EY - 3}" stroke="#2a1d24" stroke-width="3.8" fill="none" stroke-linecap="round"/>
        <path d="M${cx - 11} ${EY - 16} Q${cx} ${EY - (cx < 100 ? 20 : 18)} ${cx + 11} ${EY - (cx < 100 ? 16 : 20)}" stroke="#3a2a2a" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
    return `<ellipse cx="${cx}" cy="${EY}" rx="10" ry="12.5" fill="#fff"/>
      <ellipse cx="${cx}" cy="${EY + 1}" rx="8.6" ry="11.2" fill="url(#${id})"/>
      ${o.slit ? `<ellipse cx="${cx}" cy="${EY + 1}" rx="1.8" ry="8" fill="#1d1420"/>` : `<ellipse cx="${cx}" cy="${EY + 2}" rx="4.2" ry="5.8" fill="#1d1420"/>`}
      ${o.star ? `<path d="M${cx} ${EY - 7} l2.4 5.2 5.6 .8 -4.1 3.8 1 5.6 -4.9 -2.7 -4.9 2.7 1 -5.6 -4.1 -3.8 5.6 -.8z" fill="#fff" opacity=".95"/>` : `<circle cx="${cx + 3.5}" cy="${EY - 4}" r="3.4" fill="#fff"/><circle cx="${cx - 3.5}" cy="${EY + 6}" r="1.6" fill="#fff" opacity=".9"/>`}
      <path d="M${cx - 12} ${EY - 6} Q${cx} ${EY - 17} ${cx + 12} ${EY - 7}" stroke="#2a1d24" stroke-width="3.6" fill="none" stroke-linecap="round"/>
      <path d="M${cx + (cx < 100 ? -12 : 12)} ${EY - 7} l${cx < 100 ? -4 : 4} -3" stroke="#2a1d24" stroke-width="2.4" stroke-linecap="round"/>`;
  };
  const irisGrad = (id, c) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(c, 0.45)}"/><stop offset=".55" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, 1.35)}"/></linearGradient>`;
  const closedArc = (cx, up) => `<path d="M${cx - 10} ${EY + (up ? 2 : -1)} Q${cx} ${EY + (up ? -9 : 6)} ${cx + 10} ${EY + (up ? 2 : -1)}" stroke="#2a1d24" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;
  const EYES = {
    round: { name: "圆眼", draw: (c, id) => irisGrad(id, c) + animeEye(EYE_L, c, id) + animeEye(EYE_R, c, id) },
    sparkle: { name: "星星眼", draw: (c, id) => irisGrad(id, c) + animeEye(EYE_L, c, id, { star: 1 }) + animeEye(EYE_R, c, id, { star: 1 }) },
    smile: { name: "笑眼", draw: () => closedArc(EYE_L, true) + closedArc(EYE_R, true) },
    sleepy: {
      name: "困困眼",
      draw: (c, id, sk) =>
        irisGrad(id, c) +
        animeEye(EYE_L, c, id) +
        animeEye(EYE_R, c, id) +
        `<path d="M66 94 Q80 90 94 94 L94 108 Q80 104 66 108Z M106 94 Q120 90 134 94 L134 108 Q120 104 106 108Z" fill="${sk || "#ffe6d5"}"/><path d="M68 108 Q80 104 92 108 M108 108 Q120 104 132 108" stroke="#2a1d24" stroke-width="3" fill="none" stroke-linecap="round"/>`
    },
    cat: { name: "猫猫眼", draw: (c, id) => irisGrad(id, c) + animeEye(EYE_L, c, id, { slit: 1 }) + animeEye(EYE_R, c, id, { slit: 1 }) },
    wink: { name: "眨眼", draw: (c, id) => irisGrad(id, c) + animeEye(EYE_L, c, id) + `<path d="M110 106 L130 102 M110 106 L130 112" stroke="#2a1d24" stroke-width="3.4" stroke-linecap="round"/>` }
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
  Object.assign(HAIR, {
    center: {
      name: "中分",
      m: 1,
      back: (c) => `<path d="M44 104 Q40 30 100 28 Q160 30 156 104 Q156 116 148 124 L52 124 Q44 116 44 104Z" fill="${c}" ${stk(c)}/>`,
      front: (c) =>
        `<path d="M48 104 Q44 38 100 34 Q98 50 88 60 Q74 72 64 88 Q58 96 56 104Z" fill="${c}" ${stk(c)}/><path d="M152 104 Q156 38 100 34 Q102 50 112 60 Q126 72 136 88 Q142 96 144 104Z" fill="${c}" ${stk(c)}/><path d="M66 52 Q84 42 98 40 M134 52 Q116 42 102 40" stroke="#fff" stroke-width="4" opacity=".25" fill="none" stroke-linecap="round"/>`
    },
    wolf: {
      name: "狼尾",
      m: 1,
      back: (c) => `<path d="M42 104 Q38 30 100 28 Q162 30 158 104 L160 150 Q156 172 140 178 L134 158 L66 158 L60 178 Q44 172 40 150Z" fill="${c}" ${stk(c)}/>`,
      front: (c) =>
        `<path d="M46 104 Q42 36 100 32 Q158 36 154 104 L148 86 L140 100 L132 74 L120 92 L110 68 L98 92 L88 70 L78 94 L68 76 L60 98 L54 84Z" fill="${c}" ${stk(c)}/><path d="M48 96 L44 140 L56 118Z M152 96 L156 140 L144 118Z" fill="${c}" ${stk(c, 1.2)}/>`
    },
    buzz: {
      name: "寸头",
      m: 1,
      back: () => "",
      front: (c) => `<path d="M50 94 Q48 36 100 36 Q152 36 150 94 Q146 66 128 60 Q100 54 72 60 Q54 66 50 94Z" fill="${c}" ${stk(c)} opacity=".95"/><path d="M60 64 l2 -3 M72 56 l2 -3 M86 52 l2 -3 M100 50 l2 -3 M114 52 l2 -3 M128 56 l2 -3 M140 64 l2 -3" stroke="${ol(c)}" stroke-width="1.2" opacity=".6"/>`
    },
    slick: {
      name: "背头",
      m: 1,
      back: (c) => `<path d="M44 100 Q40 30 100 26 Q160 30 156 100 Q158 126 150 142 L50 142 Q42 126 44 100Z" fill="${c}" ${stk(c)}/>`,
      front: (c) =>
        `<path d="M48 96 Q44 30 100 26 Q156 30 152 96 Q146 62 120 54 Q100 50 80 54 Q56 62 48 96Z" fill="${c}" ${stk(c)}/><path d="M64 70 Q80 46 104 40 M80 64 Q96 44 120 40 M98 58 Q114 44 136 46" stroke="${ol(c)}" stroke-width="1.6" fill="none" opacity=".7"/><path d="M118 54 Q130 64 128 80" stroke="${c}" stroke-width="4" fill="none" stroke-linecap="round"/>`
    },
    curly: {
      name: "卷毛",
      m: 1,
      back: (c) => `<path d="M42 100 Q36 28 100 24 Q164 28 158 100 Q158 114 150 120 L50 120 Q42 114 42 100Z" fill="${c}" ${stk(c)}/>`,
      front: (c) =>
        [[56, 70], [72, 54], [90, 46], [110, 46], [128, 54], [144, 70], [64, 88], [138, 88], [82, 66], [100, 62], [118, 66]]
          .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="${c}" ${stk(c, 1.3)}/>`)
          .join("") + `<path d="M86 50 q6 -6 12 0 M112 52 q6 -6 12 0" stroke="#fff" stroke-width="2.4" opacity=".3" fill="none"/>`
    },
    emo: {
      name: "刘海遮眼",
      m: 1,
      back: (c) => `<path d="M40 104 Q36 28 100 26 Q164 28 160 104 L162 160 Q148 168 136 160 L64 160 Q52 168 38 160Z" fill="${c}" ${stk(c)}/>`,
      front: (c) =>
        `<path d="M44 110 Q40 34 104 30 Q160 36 156 104 L148 92 L142 108 L134 86 L124 104 Q116 116 104 120 Q86 124 74 118 L66 128 L64 110 L54 122Z" fill="${c}" ${stk(c)}/><path d="M70 56 Q100 40 132 50" stroke="#fff" stroke-width="5" opacity=".25" fill="none" stroke-linecap="round"/>`
    }
  });
  Object.assign(EYES, {
    sharp: { name: "冷淡眼", m: 1, draw: (c, id) => irisGrad(id, c) + animeEye(EYE_L, c, id, { sharp: 1 }) + animeEye(EYE_R, c, id, { sharp: 1 }) }
  });
  Object.assign(MOUTH, {
    smirk: { name: "坏笑", m: 1, draw: () => `<path d="M92 135 Q102 138 110 131" stroke="#7a3a3a" stroke-width="2.4" fill="none" stroke-linecap="round"/>` },
    flat: { name: "面无表情", m: 1, draw: () => `<path d="M94 135 h12" stroke="#7a3a3a" stroke-width="2.4" stroke-linecap="round"/>` }
  });
  Object.assign(TOP, {
    tank: {
      name: "无袖背心",
      m: 1,
      draw: (c) => `<path d="M84 157 Q90 168 90 178 L86 218 Q100 224 114 218 L110 178 Q110 168 116 157 L108 157 Q100 172 92 157Z" fill="${c}" ${stk(c)}/>`
    },
    jersey: {
      name: "篮球服",
      m: 1,
      draw: (c) =>
        `<path d="M82 157 Q90 170 88 180 L84 220 Q100 226 116 220 L112 180 Q110 170 118 157 L108 157 Q100 172 92 157Z" fill="${c}" ${stk(c)}/><path d="M92 157 Q100 172 108 157" stroke="#fff" stroke-width="2.4" fill="none"/><text x="100" y="204" font-size="17" font-weight="800" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif">23</text>`
    },
    bomber: {
      name: "夹克",
      m: 1,
      draw: (c) =>
        sleeves(c, true) +
        torso(c, "M72 168 Q72 158 88 157 L112 157 Q128 158 128 168 L130 216 Q100 222 70 216Z") +
        `<path d="M72 210 Q100 216 128 210 L130 220 Q100 226 70 220Z" fill="${shade(c, 0.78)}"/><path d="M100 158 V218" stroke="${ol(c)}" stroke-width="1.8"/><path d="M86 157 Q100 166 114 157 L112 152 Q100 160 88 152Z" fill="${shade(c, 0.78)}"/><rect x="78" y="176" width="10" height="3" rx="1.5" fill="${ol(c)}"/>`
    },
    leather: {
      name: "皮衣",
      m: 1,
      draw: (c) =>
        sleeves("#1f1d22", true) +
        torso("#1f1d22") +
        `<path d="M92 157 L100 176 L108 157Z" fill="#f2f2f5"/><path d="M84 157 L96 190 L90 157Z M116 157 L104 190 L110 157Z" fill="#2e2b32" stroke="#000" stroke-width="1"/><path d="M104 170 L112 214" stroke="#c9c9d0" stroke-width="1.6"/><path d="M78 196 h10 M112 196 h10" stroke="#444" stroke-width="2"/>` +
        `<path d="M74 168 Q80 162 86 160" stroke="#fff" stroke-width="2" opacity=".2" fill="none"/>`
    },
    trench: {
      name: "风衣",
      m: 1,
      draw: (c) =>
        sleeves(c, true) +
        `<path d="M72 166 Q72 158 88 157 L112 157 Q128 158 128 166 L136 252 Q100 260 64 252Z" fill="${c}" ${stk(c)}/><path d="M86 157 L100 190 L94 157Z M114 157 L100 190 L106 157Z" fill="${shade(c, 0.82)}" ${stk(c, 1)}/><path d="M70 204 L130 204 L131 211 L69 211Z" fill="${shade(c, 0.75)}"/><rect x="96" y="203" width="8" height="9" rx="1" fill="none" stroke="#d4b25a" stroke-width="1.6"/><circle cx="92" cy="182" r="2" fill="${ol(c)}"/><circle cx="108" cy="182" r="2" fill="${ol(c)}"/><path d="M100 212 V254" stroke="${ol(c)}" stroke-width="1.4"/>`
    },
    gakuran: {
      name: "立领制服",
      m: 1,
      draw: (c) =>
        sleeves(c, true) +
        torso(c) +
        `<rect x="88" y="150" width="24" height="10" rx="3" fill="${c}" ${stk(c)}/>` +
        [168, 182, 196, 210].map((y) => `<circle cx="100" cy="${y}" r="2.6" fill="#e8c55a" stroke="#b38f2a" stroke-width=".8"/>`).join("")
    },
    cardigan: {
      name: "开衫",
      m: 1,
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
      m: 1,
      draw: (c) =>
        `<path d="M74 210 L126 210 L125 264 L104 264 L100 228 L96 264 L75 264Z" fill="${c}" ${stk(c)}/><rect x="72" y="232" width="12" height="14" rx="2" fill="${shade(c, 0.85)}" ${stk(c, 1)}/><rect x="116" y="232" width="12" height="14" rx="2" fill="${shade(c, 0.85)}" ${stk(c, 1)}/><path d="M74 212 h52" stroke="#3a2a2a" stroke-width="3"/>`
    },
    track: {
      name: "运动裤",
      m: 1,
      draw: (c) => `<path d="M74 210 L126 210 L125 264 L104 264 L100 228 L96 264 L75 264Z" fill="${c}" ${stk(c)}/><path d="M77 214 L78 262 M123 214 L122 262" stroke="#fff" stroke-width="2.6"/><path d="M76 260 h20 M104 260 h20" stroke="${shade(c, 0.75)}" stroke-width="4"/>`
    },
    ripped: {
      name: "破洞牛仔裤",
      m: 1,
      draw: (c) =>
        `<path d="M74 210 L126 210 L125 264 L104 264 L100 228 L96 264 L75 264Z" fill="${c}" ${stk(c)}/><path d="M80 236 q5 -2 10 0 q-5 3 -10 0Z M108 246 q5 -2 10 0 q-5 3 -10 0Z" fill="#f6cfb2"/><path d="M80 236 h10 M108 246 h10" stroke="#fff" stroke-width="1" stroke-dasharray="2 1.5"/><path d="M100 212 v14" stroke="${ol(c)}" stroke-width="1.2"/>`
    }
  });
  Object.assign(SHOES, {
    leather: { name: "皮鞋", m: 1, draw: () => `<path d="M76 264 h20 q6 2 8 8 h-30 q-2 -8 2 -8z M104 264 h20 q4 0 2 8 h-30 q2 -6 8 -8z" fill="#2b2326" stroke="#000" stroke-width="1.2"/><path d="M80 266 q6 -1 10 0 M108 266 q6 -1 10 0" stroke="#fff" stroke-width="1.4" opacity=".5"/>` },
    hightop: {
      name: "高帮帆布鞋",
      m: 1,
      draw: (c) =>
        `<path d="M80 250 h16 v14 q6 2 8 8 h-30 q0 -6 6 -8z M104 250 h16 v14 q6 2 4 8 h-30 q2 -6 10 -8z" fill="${c}" ${stk(c)}/><path d="M74 272 h30 M98 272 h30" stroke="#fff" stroke-width="3.4"/><path d="M84 254 l8 4 M84 259 l8 4 M108 254 l8 4 M108 259 l8 4" stroke="#fff" stroke-width="1.4"/>`
    }
  });
  Object.assign(ACC, {
    cap: { name: "鸭舌帽", m: 1, draw: (c) => `<path d="M48 70 Q48 22 100 22 Q152 22 152 70Z" fill="#3b5bdb" stroke="#28409e" stroke-width="1.8"/><path d="M44 70 Q100 62 168 76 Q160 84 100 78 Q60 78 44 70Z" fill="#28409e"/><circle cx="100" cy="24" r="3" fill="#28409e"/>` },
    capback: { name: "反戴鸭舌帽", m: 1, draw: () => `<path d="M48 66 Q48 22 100 22 Q152 22 152 66Z" fill="#2b2b2b" stroke="#000" stroke-width="1.6"/><path d="M60 64 Q100 70 140 64" stroke="#000" stroke-width="2" fill="none"/><path d="M136 30 Q166 34 172 52 Q160 50 146 42Z" fill="#1a1a1a"/><rect x="92" y="52" width="16" height="8" rx="2" fill="none" stroke="#777" stroke-width="1.4"/>` },
    beanie: { name: "毛线帽", m: 1, draw: () => `<path d="M48 70 Q46 18 100 16 Q154 18 152 70Z" fill="#5c4b8a" stroke="#3f3266" stroke-width="1.6"/><rect x="44" y="60" width="112" height="16" rx="7" fill="#4a3c72" stroke="#3f3266" stroke-width="1.4"/>${[58, 72, 86, 100, 114, 128, 142].map((x) => `<path d="M${x} 62 v12" stroke="#3f3266" stroke-width="1.2"/>`).join("")}` },
    earring: { name: "耳钉 + 项链", m: 1, draw: () => `<circle cx="52" cy="122" r="2.8" fill="#e8e8f0" stroke="#999" stroke-width=".8"/><circle cx="148" cy="122" r="2.8" fill="#e8e8f0" stroke="#999" stroke-width=".8"/><path d="M88 158 Q100 176 112 158" stroke="#cfcfd8" stroke-width="2" fill="none" stroke-dasharray="3 1.5"/><path d="M98 172 l2 6 2 -6z" fill="#cfcfd8"/>` },
    bandaid: { name: "创可贴", m: 1, draw: () => `<rect x="120" y="120" width="20" height="8" rx="4" fill="#f2c9a0" stroke="#d6a77a" stroke-width="1" transform="rotate(-20 130 124)"/><path d="M127 122 l0 4 M130 121 l0 4 M133 120 l0 4" stroke="#d6a77a" stroke-width=".8" transform="rotate(-20 130 124)"/>` },
    mask: { name: "黑口罩", m: 1, draw: () => `<path d="M72 120 Q100 112 128 120 L126 140 Q100 152 74 140Z" fill="#232126" stroke="#000" stroke-width="1.2"/><path d="M72 122 L52 112 M128 122 L148 112" stroke="#232126" stroke-width="2"/>` }
  });
  Object.assign(HELD, {
    ball: { name: "篮球", m: 1, draw: () => `<circle cx="142" cy="208" r="15" fill="#f08a3c" stroke="#b85a1c" stroke-width="1.6"/><path d="M127 208 h30 M142 193 v30 M131 197 Q142 208 131 219 M153 197 Q142 208 153 219" stroke="#7a3a10" stroke-width="1.4" fill="none"/>` },
    phone: { name: "手机", m: 1, draw: () => `<rect x="128" y="194" width="16" height="28" rx="3" fill="#2b2b2b" stroke="#000" stroke-width="1"/><rect x="131" y="198" width="10" height="18" rx="1.5" fill="#6a8ad8"/>` },
    coffee: { name: "咖啡", m: 1, draw: () => `<path d="M126 198 h18 l-2 26 h-14z" fill="#fff" stroke="#bbb" stroke-width="1.2"/><rect x="124" y="194" width="22" height="5" rx="2" fill="#3a2a2a"/><rect x="127" y="206" width="16" height="8" fill="#b98b5e"/>` }
  });
  const isMaleItem = (set, k) => !!(set[k] && set[k].m);
  const FEMININE = { hair: ["twin", "bun", "wavy", "long"], top: ["dress", "sailor"], bottom: ["skirt", "pleated", "none"], shoes: ["maryjane"], acc: ["bow", "flower", "crown"], held: ["bouquet"], eyes: ["sparkle", "wink"], mouth: ["pout", "tongue"] };

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
  const DEF = { skin: 0, hair: "short", hairC: 1, eyes: "round", eyeC: 1, mouth: "smile", top: "tee", topC: 7, bottom: "skirt", botC: 0, shoes: "sneakers", shoeC: 11, acc: "none", held: "none", bg: "pink" };
  const valid = (o) => {
    const out = { ...DEF };
    for (const c of CATS) {
      const v = o && o[c.k];
      if (c.k === "skin") out.skin = Number.isInteger(v) && v >= 0 && v < SKIN.length ? v : DEF.skin;
      else if (c.set && v != null && c.set[v]) out[c.k] = v;
      if (c.color) {
        const cv = Number(o && o[c.color]);
        if (Number.isInteger(cv) && cv >= 0 && cv < PAL.length) out[c.color] = cv;
      }
    }
    return out;
  };
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  /** 随机一身；gender 是「男」就只挑男生款（和中性款），「女」就不挑男生款 */
  function randomOutfit(gender) {
    const g = String(gender || "");
    const boy = /男|male|boy/i.test(g);
    const girl = /女|female|girl/i.test(g);
    const o = { skin: Math.floor(Math.random() * SKIN.length) };
    for (const c of CATS) {
      if (c.set) {
        let keys = Object.keys(c.set);
        if (boy) {
          const fem = FEMININE[c.k] || [];
          const male = keys.filter((k) => isMaleItem(c.set, k));
          const neutral = keys.filter((k) => !fem.includes(k));
          keys = male.length && Math.random() < 0.7 ? male : neutral;
        } else if (girl) keys = keys.filter((k) => !isMaleItem(c.set, k) || ["center", "cardigan", "track", "hightop", "cap", "beanie", "phone", "coffee"].includes(k));
        o[c.k] = rnd(keys.length ? keys : Object.keys(c.set));
      }
      if (c.color) o[c.color] = Math.floor(Math.random() * PAL.length);
    }
    if (boy) {
      o.hairC = rnd([0, 1, 2, 4, 3, 13]);
      if (o.bottom === "none" || (FEMININE.bottom || []).includes(o.bottom)) o.bottom = rnd(["pants", "cargo", "track", "ripped", "shorts"]);
    }
    if (TOP[o.top].dress) o.bottom = "none";
    return valid(o);
  }

  /** 画一个小人 */
  function doll(o0) {
    const o = valid(o0);
    const sk = SKIN[o.skin];
    const skO = shade(sk, 0.8);
    const hc = PAL[o.hairC];
    const isDress = TOP[o.top].dress;
    const id = "dri" + ++gid;
    return `<svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg">
      ${BG[o.bg].draw()}
      <ellipse cx="100" cy="276" rx="44" ry="7" fill="#000" opacity=".08"/>
      ${HAIR[o.hair].back(hc)}
      <rect x="84" y="212" width="13" height="54" rx="6" fill="${sk}" stroke="${skO}" stroke-width="1.4"/><rect x="103" y="212" width="13" height="54" rx="6" fill="${sk}" stroke="${skO}" stroke-width="1.4"/>
      ${SHOES[o.shoes].draw(PAL[o.shoeC])}
      <path d="M80 164 Q69 188 66 210 M120 164 Q131 188 134 210" stroke="${skO}" stroke-width="14.5" stroke-linecap="round" fill="none"/><path d="M80 164 Q69 188 66 210 M120 164 Q131 188 134 210" stroke="${sk}" stroke-width="12" stroke-linecap="round" fill="none"/>
      <circle cx="66" cy="213" r="7.5" fill="${sk}" stroke="${skO}" stroke-width="1.4"/><circle cx="134" cy="213" r="7.5" fill="${sk}" stroke="${skO}" stroke-width="1.4"/>
      <path d="M74 168 Q74 158 88 157 L112 157 Q126 158 126 168 L128 216 Q100 222 72 216Z" fill="${sk}"/>
      <rect x="93" y="144" width="14" height="18" rx="5" fill="${sk}"/><path d="M93 152 Q100 158 107 152" stroke="${skO}" stroke-width="1.4" fill="none" opacity=".6"/>
      ${isDress ? "" : BOTTOM[o.bottom].draw(PAL[o.botC])}
      ${TOP[o.top].draw(PAL[o.topC])}
      <path d="${FACE}" fill="${sk}" stroke="${skO}" stroke-width="1.6"/>
      ${EYES[o.eyes].draw(PAL[o.eyeC], id, sk)}
      <ellipse cx="68" cy="128" rx="9" ry="5" fill="#ff8fa6" opacity=".38"/><ellipse cx="132" cy="128" rx="9" ry="5" fill="#ff8fa6" opacity=".38"/>
      <path d="M64 126 l3 -3 M69 127 l3 -3 M128 126 l3 -3 M133 127 l3 -3" stroke="#ff7f99" stroke-width="1.2" opacity=".6" stroke-linecap="round"/>
      <circle cx="100" cy="124" r="1.3" fill="${shade(sk, 0.7)}"/>
      ${MOUTH[o.mouth].draw()}
      ${HAIR[o.hair].front(hc)}
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

  const outfitOf = (w) => (w === "me" ? (S.user = S.user || valid(DEF)) : (S.chars[ch.id] = S.chars[ch.id] || randomOutfit(ch.gender)));
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
    else items = Object.entries(cat.set).map(([k, v]) => `<button type="button" class="dr-item${o[tab] === k ? " is-on" : ""}${v.m ? " is-m" : ""}" data-item="${k}">${esc(v.name)}</button>`).join("");
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

  const catalogText = () =>
    CATS.filter((c) => c.set)
      .map((c) => `${c.k}（${c.name}）：${Object.entries(c.set).map(([k, v]) => `${k}=${v.name}`).join("，")}`)
      .join("\n") +
    `\nskin（肤色）：0~${SKIN.length - 1}，0 最白\n颜色编号（hairC 发色 / eyeC 眼睛颜色 / topC 上衣色 / botC 下装色 / shoeC 鞋子色）：${PAL_NAME.map((n, i) => `${i}=${n}`).join("，")}\n注意：top 选 dress（连衣裙）时 bottom 用 none。`;

  async function charDress(target) {
    if (busy) return;
    if (!F.hasApiKey()) {
      const o = randomOutfit(target === "char" ? ch.gender : user.gender);
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
            content: `你是「${ch.name}」。${ch.persona ? "人设：\n" + ch.persona + "\n" : ""}你和「${user.name}」在玩换装游戏，每人有一个 Q 版小人。${ch.gender ? `你是${ch.gender}生。` : ""}${user.gender ? `${user.name}是${user.gender}生。` : ""}衣柜里男生款、女生款都有，按性别和性格挑合适的。${
              target === "char" ? "现在你给你自己的小人搭一身衣服，要符合你的性格和审美。" : `现在你给「${user.name}」的小人搭一身你觉得最好看 / 最想看 TA 穿的衣服。`
            }\n只能从下面的衣柜里选：\n${catalogText()}\n只输出 JSON：{"outfit":{"hair":"","hairC":0,"eyes":"","eyeC":0,"mouth":"","top":"","topC":0,"bottom":"","botC":0,"shoes":"","shoeC":0,"acc":"","held":"","bg":"","skin":0},"say":"你搭完之后说的一两句话（按人设、口语）"}`
          },
          { role: "user", content: `${target === "char" ? "你" : user.name}现在穿的是：${describe(cur)}。开始搭吧。` }
        ],
        { maxTokens: 600, temperature: 0.95 }
      );
      const j = F.parseJsonLoose(txt);
      if (!j || !j.outfit) throw new Error("没搭出来，再试一次");
      const o = valid({ ...cur, ...j.outfit });
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
      if (who === "me") S.user = randomOutfit(user.gender);
      else S.chars[ch.id] = randomOutfit(ch.gender);
      save();
      render();
    }
    if (a === "reset") {
      if (who === "me") S.user = valid(DEF);
      else S.chars[ch.id] = randomOutfit(ch.gender);
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
  window.XXJ_DRESS = { doll, describe, randomOutfit };
})();
