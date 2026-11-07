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

  /* ───── 衣柜（每样都是一段 SVG） ───── */
  const BANGS = (c) => `<path d="M44 96 Q46 30 100 28 Q154 30 156 96 Q146 66 124 68 Q112 52 100 64 Q86 52 74 66 Q56 66 44 96Z" fill="${c}"/>`;
  const SWEEP = (c) => `<path d="M42 100 Q40 26 104 26 Q160 30 158 98 Q150 70 132 62 Q110 74 80 60 Q62 70 42 100Z" fill="${c}"/>`;
  const HAIR = {
    short: { name: "短发", back: (c) => `<circle cx="100" cy="86" r="61" fill="${c}"/>`, front: BANGS },
    long: { name: "长直发", back: (c) => `<path d="M38 92 Q38 22 100 22 Q162 22 162 92 L168 206 Q100 220 32 206Z" fill="${c}"/>`, front: BANGS },
    twin: {
      name: "双马尾",
      back: (c) => `<circle cx="100" cy="86" r="61" fill="${c}"/><ellipse cx="34" cy="138" rx="18" ry="46" fill="${c}"/><ellipse cx="166" cy="138" rx="18" ry="46" fill="${c}"/><circle cx="44" cy="92" r="7" fill="#e85a5a"/><circle cx="156" cy="92" r="7" fill="#e85a5a"/>`,
      front: BANGS
    },
    bun: { name: "丸子头", back: (c) => `<circle cx="100" cy="86" r="61" fill="${c}"/><circle cx="100" cy="26" r="22" fill="${c}"/>`, front: BANGS },
    wavy: {
      name: "大波浪",
      back: (c) => `<path d="M36 92 Q36 20 100 20 Q164 20 164 92 Q176 120 164 150 Q178 180 160 206 Q130 222 100 214 Q70 222 40 206 Q22 180 36 150 Q24 120 36 92Z" fill="${c}"/>`,
      front: SWEEP
    },
    spiky: {
      name: "刺猬头",
      back: (c) => `<circle cx="100" cy="86" r="61" fill="${c}"/>`,
      front: (c) => `<path d="M42 98 L40 50 L60 62 L64 26 L84 46 L100 16 L116 46 L136 26 L140 62 L160 50 L158 98 Q144 70 124 72 Q110 60 100 70 Q90 60 76 72 Q56 70 42 98Z" fill="${c}"/>`
    },
    bob: { name: "波波头", back: (c) => `<path d="M36 96 Q36 22 100 22 Q164 22 164 96 L164 150 Q150 160 136 150 L64 150 Q50 160 36 150Z" fill="${c}"/>`, front: BANGS }
  };
  const EYES = {
    round: { name: "圆眼", draw: (c) => `<ellipse cx="78" cy="102" rx="9" ry="11" fill="${c}"/><ellipse cx="122" cy="102" rx="9" ry="11" fill="${c}"/><circle cx="81" cy="98" r="3.2" fill="#fff"/><circle cx="125" cy="98" r="3.2" fill="#fff"/>` },
    sparkle: {
      name: "星星眼",
      draw: (c) =>
        `<ellipse cx="78" cy="102" rx="11" ry="13" fill="${c}"/><ellipse cx="122" cy="102" rx="11" ry="13" fill="${c}"/><path d="M78 94 l2 5 5 1 -5 2 -2 5 -2 -5 -5 -2 5 -1z" fill="#fff"/><path d="M122 94 l2 5 5 1 -5 2 -2 5 -2 -5 -5 -2 5 -1z" fill="#fff"/><circle cx="72" cy="108" r="2" fill="#fff"/><circle cx="116" cy="108" r="2" fill="#fff"/>`
    },
    smile: { name: "笑眼", draw: () => `<path d="M68 104 Q78 92 88 104" stroke="${ink}" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M112 104 Q122 92 132 104" stroke="${ink}" stroke-width="3.5" fill="none" stroke-linecap="round"/>` },
    sleepy: { name: "困困眼", draw: () => `<path d="M68 102 Q78 108 88 102" stroke="${ink}" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M112 102 Q122 108 132 102" stroke="${ink}" stroke-width="3.5" fill="none" stroke-linecap="round"/>` },
    cat: {
      name: "猫猫眼",
      draw: (c) =>
        `<path d="M66 102 Q78 88 90 102 Q78 114 66 102Z" fill="${c}"/><path d="M110 102 Q122 88 134 102 Q122 114 110 102Z" fill="${c}"/><ellipse cx="78" cy="102" rx="2" ry="7" fill="${ink}"/><ellipse cx="122" cy="102" rx="2" ry="7" fill="${ink}"/>`
    },
    wink: { name: "眨眼", draw: (c) => `<ellipse cx="78" cy="102" rx="9" ry="11" fill="${c}"/><circle cx="81" cy="98" r="3.2" fill="#fff"/><path d="M112 102 l20 -4 M112 102 l20 4" stroke="${ink}" stroke-width="3.5" stroke-linecap="round"/>` }
  };
  const MOUTH = {
    smile: { name: "微笑", draw: () => `<path d="M90 124 Q100 132 110 124" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/>` },
    open: { name: "张嘴笑", draw: () => `<path d="M90 122 Q100 138 110 122Z" fill="#c4474e"/>` },
    cat: { name: "ω 嘴", draw: () => `<path d="M88 122 Q94 130 100 122 Q106 130 112 122" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/>` },
    pout: { name: "嘟嘴", draw: () => `<circle cx="100" cy="126" r="4" fill="#d9606a"/>` },
    tongue: { name: "吐舌头", draw: () => `<path d="M90 122 Q100 130 110 122" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M98 126 Q103 136 108 126Z" fill="#f08a9a"/>` }
  };
  const SLEEVE_S = (c) => `<rect x="53" y="148" width="21" height="26" rx="9" fill="${c}" transform="rotate(10 63 152)"/><rect x="126" y="148" width="21" height="26" rx="9" fill="${c}" transform="rotate(-10 137 152)"/>`;
  const SLEEVE_L = (c) => `<rect x="54" y="148" width="19" height="62" rx="9" fill="${c}" transform="rotate(10 63 152)"/><rect x="127" y="148" width="19" height="62" rx="9" fill="${c}" transform="rotate(-10 137 152)"/>`;
  const TORSO = (c, h) => `<rect x="70" y="144" width="60" height="${h || 60}" rx="18" fill="${c}"/>`;
  const TOP = {
    tee: { name: "T 恤", draw: (c) => SLEEVE_S(c) + TORSO(c) + `<path d="M90 146 Q100 154 110 146" stroke="${shade(c, 0.8)}" stroke-width="3" fill="none"/>` },
    hoodie: {
      name: "卫衣",
      draw: (c) =>
        `<ellipse cx="100" cy="148" rx="32" ry="11" fill="${shade(c, 0.78)}"/>` + SLEEVE_L(c) + TORSO(c, 70) + `<rect x="84" y="180" width="32" height="18" rx="6" fill="${shade(c, 0.85)}"/><path d="M93 152 v14 M107 152 v14" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>`
    },
    sailor: {
      name: "水手服",
      draw: (c) =>
        SLEEVE_S("#fff") + TORSO("#fff") + `<path d="M70 150 L100 184 L130 150 L130 168 L100 196 L70 168Z" fill="${c}"/><path d="M74 158 L100 188 L126 158" stroke="#fff" stroke-width="2" fill="none"/><path d="M92 186 l-10 8 10 2z M108 186 l10 8 -10 2z" fill="#e85a5a"/><circle cx="100" cy="188" r="4" fill="#e85a5a"/>`
    },
    shirt: { name: "衬衫领带", draw: (c) => SLEEVE_L("#f7f7fb") + TORSO("#f7f7fb") + `<path d="M88 146 L100 156 L112 146" stroke="#ccc" stroke-width="2" fill="none"/><path d="M96 156 h8 l3 34 -7 8 -7 -8z" fill="${c}"/>` },
    sweater: {
      name: "毛衣",
      draw: (c) => SLEEVE_L(c) + TORSO(c, 64) + [160, 172, 184, 196].map((y) => `<path d="M74 ${y} Q100 ${y + 4} 126 ${y}" stroke="${shade(c, 0.82)}" stroke-width="3" fill="none"/>`).join("") + `<rect x="80" y="142" width="40" height="8" rx="4" fill="${shade(c, 0.85)}"/>`
    },
    dress: {
      name: "连衣裙",
      dress: true,
      draw: (c) =>
        `<circle cx="64" cy="156" r="12" fill="${c}"/><circle cx="136" cy="156" r="12" fill="${c}"/>` + TORSO(c, 50) + `<path d="M72 186 L128 186 L146 248 Q100 258 54 248Z" fill="${c}"/><path d="M60 240 Q100 250 140 240" stroke="#fff" stroke-width="3" fill="none" opacity=".7"/><rect x="72" y="182" width="56" height="7" rx="3" fill="${shade(c, 0.8)}"/>`
    },
    suit: {
      name: "西装",
      draw: (c) => SLEEVE_L(c) + TORSO(c, 66) + `<path d="M90 144 L100 176 L110 144Z" fill="#fff"/><path d="M84 144 L100 182 L92 144Z M116 144 L100 182 L108 144Z" fill="${shade(c, 0.75)}"/><circle cx="100" cy="194" r="2.5" fill="${shade(c, 0.6)}"/>`
    },
    kimono: {
      name: "和风上衣",
      draw: (c) =>
        `<path d="M48 150 L72 146 L72 196 L44 196Z M152 150 L128 146 L128 196 L156 196Z" fill="${c}"/>` + TORSO(c, 64) + `<path d="M80 144 L104 186 M120 144 L96 186" stroke="#fff" stroke-width="4"/><rect x="70" y="182" width="60" height="12" fill="${shade(c, 0.7)}"/>`
    }
  };
  const BOTTOM = {
    none: { name: "不穿（配连衣裙）", draw: () => "" },
    shorts: { name: "短裤", draw: (c) => `<path d="M72 198 L128 198 L130 228 L104 228 L100 214 L96 228 L70 228Z" fill="${c}"/>` },
    skirt: { name: "半身裙", draw: (c) => `<path d="M72 198 L128 198 L138 238 Q100 246 62 238Z" fill="${c}"/>` },
    pleated: {
      name: "百褶裙",
      draw: (c) => `<path d="M72 198 L128 198 L138 238 Q100 246 62 238Z" fill="${c}"/>` + [80, 92, 104, 116].map((x, i) => `<path d="M${x + 4} 200 L${x - 2 + i * 3} 240" stroke="${shade(c, 0.8)}" stroke-width="2"/>`).join("")
    },
    pants: { name: "长裤", draw: (c) => `<rect x="74" y="196" width="52" height="24" rx="8" fill="${c}"/><rect x="77" y="212" width="20" height="58" rx="7" fill="${c}"/><rect x="103" y="212" width="20" height="58" rx="7" fill="${c}"/>` },
    jeans: {
      name: "背带裤",
      draw: (c) =>
        `<rect x="76" y="168" width="48" height="40" rx="8" fill="${c}"/><path d="M80 170 L74 146 M120 170 L126 146" stroke="${c}" stroke-width="6" stroke-linecap="round"/><rect x="74" y="200" width="52" height="24" rx="8" fill="${c}"/><rect x="77" y="214" width="20" height="40" rx="7" fill="${c}"/><rect x="103" y="214" width="20" height="40" rx="7" fill="${c}"/><circle cx="84" cy="176" r="2.5" fill="#f2d17a"/><circle cx="116" cy="176" r="2.5" fill="#f2d17a"/>`
    }
  };
  const SHOES = {
    sneakers: { name: "运动鞋", draw: (c) => `<ellipse cx="86" cy="276" rx="13" ry="8" fill="${c}"/><ellipse cx="114" cy="276" rx="13" ry="8" fill="${c}"/><rect x="72" y="279" width="28" height="4" rx="2" fill="#fff"/><rect x="100" y="279" width="28" height="4" rx="2" fill="#fff"/>` },
    boots: { name: "靴子", draw: (c) => `<rect x="77" y="246" width="19" height="34" rx="6" fill="${c}"/><rect x="104" y="246" width="19" height="34" rx="6" fill="${c}"/><ellipse cx="86" cy="279" rx="13" ry="6" fill="${c}"/><ellipse cx="114" cy="279" rx="13" ry="6" fill="${c}"/>` },
    maryjane: { name: "玛丽珍鞋", draw: (c) => `<ellipse cx="86" cy="277" rx="12" ry="7" fill="${c}"/><ellipse cx="114" cy="277" rx="12" ry="7" fill="${c}"/><path d="M78 270 h16 M106 270 h16" stroke="${c}" stroke-width="3"/>` },
    slippers: { name: "毛拖鞋", draw: (c) => `<ellipse cx="86" cy="277" rx="14" ry="8" fill="${c}"/><ellipse cx="114" cy="277" rx="14" ry="8" fill="${c}"/><circle cx="86" cy="271" r="6" fill="#fff"/><circle cx="114" cy="271" r="6" fill="#fff"/>` },
    barefoot: { name: "光脚", draw: () => "" }
  };
  const ACC = {
    none: { name: "不戴", draw: () => "" },
    catears: { name: "猫耳", draw: (c) => `<path d="M48 58 L58 14 L86 40Z M152 58 L142 14 L114 40Z" fill="${c}"/><path d="M58 50 L62 28 L76 42Z M142 50 L138 28 L124 42Z" fill="#f4a7b9"/>` },
    bow: { name: "蝴蝶结", draw: () => `<path d="M132 44 L112 30 L114 58Z M132 44 L152 30 L150 58Z" fill="#e85a5a"/><circle cx="132" cy="44" r="6" fill="#c43c3c"/>` },
    crown: { name: "小皇冠", draw: () => `<path d="M76 34 L76 12 L88 24 L100 6 L112 24 L124 12 L124 34Z" fill="#f2c94c" stroke="#d4a72c" stroke-width="2"/><circle cx="100" cy="24" r="3.5" fill="#e85a5a"/>` },
    glasses: { name: "圆眼镜", draw: () => `<circle cx="78" cy="102" r="15" fill="none" stroke="${ink}" stroke-width="3"/><circle cx="122" cy="102" r="15" fill="none" stroke="${ink}" stroke-width="3"/><path d="M93 102 h14" stroke="${ink}" stroke-width="3"/>` },
    beret: { name: "贝雷帽", draw: () => `<ellipse cx="94" cy="34" rx="50" ry="17" fill="#e85a5a" transform="rotate(-8 94 34)"/><circle cx="94" cy="18" r="4" fill="#c43c3c"/>` },
    flower: { name: "小花", draw: () => `${[0, 72, 144, 216, 288].map((a) => `<circle cx="${140 + 9 * Math.cos((a * Math.PI) / 180)}" cy="${54 + 9 * Math.sin((a * Math.PI) / 180)}" r="7" fill="#f4a7b9"/>`).join("")}<circle cx="140" cy="54" r="5" fill="#f2d17a"/>` },
    headphones: { name: "耳机", draw: () => `<path d="M42 96 Q42 20 100 20 Q158 20 158 96" stroke="#5c4b8a" stroke-width="7" fill="none"/><rect x="32" y="84" width="18" height="30" rx="8" fill="#5c4b8a"/><rect x="150" y="84" width="18" height="30" rx="8" fill="#5c4b8a"/>` },
    halo: { name: "光环", draw: () => `<ellipse cx="100" cy="16" rx="34" ry="8" fill="none" stroke="#f2d17a" stroke-width="5"/>` },
    horns: { name: "小恶魔角", draw: () => `<path d="M64 40 Q56 14 70 6 Q66 26 80 34Z M136 40 Q144 14 130 6 Q134 26 120 34Z" fill="#5c4b8a"/>` }
  };
  const HELD = {
    none: { name: "空手", draw: () => "" },
    tea: { name: "奶茶", draw: () => `<path d="M140 196 h18 l-3 30 h-12z" fill="#f2e2c4" stroke="#c9a77a" stroke-width="1.5"/><path d="M150 196 l5 -16" stroke="#e85a5a" stroke-width="3"/>${[144, 149, 154].map((x) => `<circle cx="${x}" cy="220" r="2.2" fill="#3a2a2a"/>`).join("")}` },
    plush: { name: "猫猫玩偶", draw: () => `<circle cx="154" cy="204" r="15" fill="#f2d17a"/><path d="M142 196 l-2 -12 10 7z M166 196 l2 -12 -10 7z" fill="#f2d17a"/><circle cx="149" cy="203" r="2" fill="${ink}"/><circle cx="159" cy="203" r="2" fill="${ink}"/><path d="M151 209 q3 3 6 0" stroke="${ink}" stroke-width="1.5" fill="none"/>` },
    bouquet: { name: "花束", draw: () => `${[[146, 190], [158, 186], [152, 178], [164, 196], [140, 200]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="7" fill="${["#f4a7b9", "#e85a5a", "#c9a7f2", "#f4a7b9", "#ffffff"][i]}"/>`).join("")}<path d="M140 204 L166 204 L156 232 L150 232Z" fill="#8fc5f2"/>` },
    balloon: { name: "气球", draw: () => `<path d="M148 216 Q160 180 162 132" stroke="#999" stroke-width="1.5" fill="none"/><ellipse cx="164" cy="112" rx="18" ry="22" fill="#e85a5a"/><path d="M158 102 q4 -6 10 -4" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>` },
    book: { name: "书", draw: () => `<rect x="138" y="196" width="26" height="32" rx="3" fill="#3b5bdb"/><rect x="142" y="200" width="18" height="4" rx="2" fill="#fff"/>` },
    mic: { name: "麦克风", draw: () => `<rect x="146" y="200" width="6" height="26" rx="3" fill="#555"/><circle cx="149" cy="196" r="8" fill="#888"/>` }
  };
  const BG = {
    pink: { name: "粉色房间", draw: () => `<rect width="200" height="300" fill="#ffe8ee"/><rect y="250" width="200" height="50" fill="#f7c9d4"/><circle cx="34" cy="40" r="3" fill="#fff"/><circle cx="170" cy="60" r="4" fill="#fff"/>` },
    night: { name: "星空", draw: () => `<rect width="200" height="300" fill="#262044"/>${[[20, 30], [60, 60], [170, 30], [150, 90], [30, 140], [180, 170], [100, 18]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8" fill="#fff"/>`).join("")}<circle cx="168" cy="36" r="14" fill="#f2e6a8"/>` },
    grass: { name: "草地", draw: () => `<rect width="200" height="300" fill="#d8f0ff"/><rect y="236" width="200" height="64" fill="#9bd77f"/><circle cx="30" cy="40" r="16" fill="#fff4b0"/>` },
    sea: { name: "海边", draw: () => `<rect width="200" height="300" fill="#bfe6ff"/><rect y="200" width="200" height="40" fill="#5fb4e8"/><rect y="240" width="200" height="60" fill="#f6e2b3"/>` },
    cafe: { name: "咖啡店", draw: () => `<rect width="200" height="300" fill="#f3e7d8"/><rect x="0" y="60" width="200" height="6" fill="#c9a77a"/><rect y="250" width="200" height="50" fill="#b98b5e"/><rect x="18" y="22" width="40" height="34" rx="4" fill="#fff" opacity=".7"/>` },
    plain: { name: "纯白", draw: () => `<rect width="200" height="300" fill="#ffffff"/>` }
  };
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
  function randomOutfit() {
    const o = { skin: Math.floor(Math.random() * SKIN.length) };
    for (const c of CATS) {
      if (c.set) o[c.k] = rnd(Object.keys(c.set));
      if (c.color) o[c.color] = Math.floor(Math.random() * PAL.length);
    }
    if (TOP[o.top].dress) o.bottom = "none";
    return valid(o);
  }

  /** 画一个小人 */
  function doll(o0) {
    const o = valid(o0);
    const sk = SKIN[o.skin];
    const hc = PAL[o.hairC];
    const isDress = TOP[o.top].dress;
    return `<svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg">
      ${BG[o.bg].draw()}
      ${HAIR[o.hair].back(hc)}
      <rect x="80" y="224" width="15" height="50" rx="7" fill="${sk}"/><rect x="105" y="224" width="15" height="50" rx="7" fill="${sk}"/>
      ${SHOES[o.shoes].draw(PAL[o.shoeC])}
      <rect x="56" y="150" width="15" height="64" rx="7.5" fill="${sk}" transform="rotate(10 63 152)"/><rect x="129" y="150" width="15" height="64" rx="7.5" fill="${sk}" transform="rotate(-10 137 152)"/>
      <circle cx="52" cy="215" r="8" fill="${sk}"/><circle cx="148" cy="215" r="8" fill="${sk}"/>
      <rect x="72" y="146" width="56" height="84" rx="18" fill="${sk}"/>
      <rect x="90" y="134" width="20" height="16" fill="${sk}"/>
      ${isDress ? "" : BOTTOM[o.bottom].draw(PAL[o.botC])}
      ${TOP[o.top].draw(PAL[o.topC])}
      <circle cx="100" cy="92" r="56" fill="${sk}"/>
      <circle cx="45" cy="100" r="9" fill="${sk}"/><circle cx="155" cy="100" r="9" fill="${sk}"/>
      ${EYES[o.eyes].draw(PAL[o.eyeC])}
      <ellipse cx="66" cy="120" rx="9" ry="5" fill="#f4a7b9" opacity=".55"/><ellipse cx="134" cy="120" rx="9" ry="5" fill="#f4a7b9" opacity=".55"/>
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

  const outfitOf = (w) => (w === "me" ? (S.user = S.user || valid(DEF)) : (S.chars[ch.id] = S.chars[ch.id] || randomOutfit()));
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
    else items = Object.entries(cat.set).map(([k, v]) => `<button type="button" class="dr-item${o[tab] === k ? " is-on" : ""}" data-item="${k}">${esc(v.name)}</button>`).join("");
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
      const o = randomOutfit();
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
            content: `你是「${ch.name}」。${ch.persona ? "人设：\n" + ch.persona + "\n" : ""}你和「${user.name}」在玩换装游戏，每人有一个 Q 版小人。${
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
      if (who === "me") S.user = randomOutfit();
      else S.chars[ch.id] = randomOutfit();
      save();
      render();
    }
    if (a === "reset") {
      if (who === "me") S.user = valid(DEF);
      else S.chars[ch.id] = randomOutfit();
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
