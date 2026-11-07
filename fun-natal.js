"use strict";

/**
 * 星盘计算（本命盘）
 * 行星位置：Paul Schlyter「How to compute planetary positions」的简化轨道根数 + 主要摄动项，精度约 1°，够做星盘
 * 上升 / 天顶：由地方恒星时计算；宫位用等宫制
 * 冥王星没有简单解析式，这里不算
 */
(function () {
  const rad = Math.PI / 180;
  const norm = (x) => ((x % 360) + 360) % 360;
  const sind = (x) => Math.sin(x * rad);
  const cosd = (x) => Math.cos(x * rad);
  const atan2d = (y, x) => Math.atan2(y, x) / rad;

  const SIGNS = ["白羊座", "金牛座", "双子座", "巨蟹座", "狮子座", "处女座", "天秤座", "天蝎座", "射手座", "摩羯座", "水瓶座", "双鱼座"];
  const SIGN_GLYPH = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];
  const BODIES = [
    { k: "sun", n: "太阳", g: "☉" },
    { k: "moon", n: "月亮", g: "☽" },
    { k: "mercury", n: "水星", g: "☿" },
    { k: "venus", n: "金星", g: "♀" },
    { k: "mars", n: "火星", g: "♂" },
    { k: "jupiter", n: "木星", g: "♃" },
    { k: "saturn", n: "土星", g: "♄" },
    { k: "uranus", n: "天王星", g: "♅" },
    { k: "neptune", n: "海王星", g: "♆" }
  ];

  /** 2000-01-00 0h UT 起算的日数（1900–2100 有效） */
  function dayNumber(y, m, D, ut) {
    return 367 * y - Math.floor((7 * (y + Math.floor((m + 9) / 12))) / 4) + Math.floor((275 * m) / 9) + D - 730530 + ut / 24;
  }

  function elements(d) {
    return {
      sun: { N: 0, i: 0, w: 282.9404 + 4.70935e-5 * d, a: 1, e: 0.016709 - 1.151e-9 * d, M: 356.047 + 0.9856002585 * d },
      moon: { N: 125.1228 - 0.0529538083 * d, i: 5.1454, w: 318.0634 + 0.1643573223 * d, a: 60.2666, e: 0.0549, M: 115.3654 + 13.0649929509 * d },
      mercury: { N: 48.3313 + 3.24587e-5 * d, i: 7.0047 + 5e-8 * d, w: 29.1241 + 1.01444e-5 * d, a: 0.387098, e: 0.205635 + 5.59e-10 * d, M: 168.6562 + 4.0923344368 * d },
      venus: { N: 76.6799 + 2.4659e-5 * d, i: 3.3946 + 2.75e-8 * d, w: 54.891 + 1.38374e-5 * d, a: 0.72333, e: 0.006773 - 1.302e-9 * d, M: 48.0052 + 1.6021302244 * d },
      mars: { N: 49.5574 + 2.11081e-5 * d, i: 1.8497 - 1.78e-8 * d, w: 286.5016 + 2.92961e-5 * d, a: 1.523688, e: 0.093405 + 2.516e-9 * d, M: 18.6021 + 0.5240207766 * d },
      jupiter: { N: 100.4542 + 2.76854e-5 * d, i: 1.303 - 1.557e-7 * d, w: 273.8777 + 1.64505e-5 * d, a: 5.20256, e: 0.048498 + 4.469e-9 * d, M: 19.895 + 0.0830853001 * d },
      saturn: { N: 113.6634 + 2.3898e-5 * d, i: 2.4886 - 1.081e-7 * d, w: 339.3939 + 2.97661e-5 * d, a: 9.55475, e: 0.055546 - 9.499e-9 * d, M: 316.967 + 0.0334442282 * d },
      uranus: { N: 74.0005 + 1.3978e-5 * d, i: 0.7733 + 1.9e-8 * d, w: 96.6612 + 3.0565e-5 * d, a: 19.18171 - 1.55e-8 * d, e: 0.047318 + 7.45e-9 * d, M: 142.5905 + 0.011725806 * d },
      neptune: { N: 131.7806 + 3.0173e-5 * d, i: 1.77 - 2.55e-7 * d, w: 272.8461 - 6.027e-6 * d, a: 30.05826 + 3.313e-8 * d, e: 0.008606 + 2.15e-9 * d, M: 260.2471 + 0.005995147 * d }
    };
  }

  /** 解开普勒方程，返回轨道面内的 (v 真近点角, r) */
  function orbit(el) {
    const M = norm(el.M);
    let E = M + (el.e / rad) * sind(M) * (1 + el.e * cosd(M));
    for (let k = 0; k < 8; k++) {
      const dE = (E - (el.e / rad) * sind(E) - M) / (1 - el.e * cosd(E));
      E -= dE;
      if (Math.abs(dE) < 1e-6) break;
    }
    const xv = el.a * (cosd(E) - el.e);
    const yv = el.a * Math.sqrt(1 - el.e * el.e) * sind(E);
    return { v: atan2d(yv, xv), r: Math.hypot(xv, yv) };
  }
  function helio(el) {
    const { v, r } = orbit(el);
    const vw = v + el.w;
    return {
      x: r * (cosd(el.N) * cosd(vw) - sind(el.N) * sind(vw) * cosd(el.i)),
      y: r * (sind(el.N) * cosd(vw) + cosd(el.N) * sind(vw) * cosd(el.i)),
      z: r * sind(vw) * sind(el.i)
    };
  }

  /**
   * @param {{y:number,m:number,d:number,hour:number,min:number,tz:number,lat?:number,lon?:number,noTime?:boolean}} b
   */
  function compute(b) {
    const ut = b.hour + b.min / 60 - b.tz;
    const d = dayNumber(b.y, b.m, b.d, ut);
    const E = elements(d);
    const ecl = 23.4393 - 3.563e-7 * d;
    const lon = {};

    // 太阳
    const so = orbit(E.sun);
    const sunLon = norm(so.v + E.sun.w);
    lon.sun = sunLon;
    const xs = so.r * cosd(sunLon);
    const ys = so.r * sind(sunLon);

    // 月亮（地心）+ 主要摄动
    const mh = helio(E.moon);
    let moonLon = atan2d(mh.y, mh.x);
    const Ms = norm(E.sun.M);
    const Mm = norm(E.moon.M);
    const Ls = norm(Ms + E.sun.w);
    const Lm = norm(Mm + E.moon.w + E.moon.N);
    const D = norm(Lm - Ls);
    const Fm = norm(Lm - E.moon.N);
    moonLon +=
      -1.274 * sind(Mm - 2 * D) +
      0.658 * sind(2 * D) -
      0.186 * sind(Ms) -
      0.059 * sind(2 * Mm - 2 * D) -
      0.057 * sind(Mm - 2 * D + Ms) +
      0.053 * sind(Mm + 2 * D) +
      0.046 * sind(2 * D - Ms) +
      0.041 * sind(Mm - Ms) -
      0.035 * sind(D) -
      0.031 * sind(Mm + Ms) -
      0.015 * sind(2 * Fm - 2 * D) +
      0.011 * sind(Mm - 4 * D);
    lon.moon = norm(moonLon);

    // 行星（日心 → 地心）
    const Mj = norm(E.jupiter.M);
    const Msat = norm(E.saturn.M);
    const Mu = norm(E.uranus.M);
    for (const k of ["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune"]) {
      const h = helio(E[k]);
      let L = atan2d(h.y + ys, h.x + xs);
      if (k === "jupiter")
        L +=
          -0.332 * sind(2 * Mj - 5 * Msat - 67.6) -
          0.056 * sind(2 * Mj - 2 * Msat + 21) +
          0.042 * sind(3 * Mj - 5 * Msat + 21) -
          0.036 * sind(Mj - 2 * Msat) +
          0.022 * cosd(Mj - Msat) +
          0.023 * sind(2 * Mj - 3 * Msat + 52) -
          0.016 * sind(Mj - 5 * Msat - 69);
      if (k === "saturn")
        L += 0.812 * sind(2 * Mj - 5 * Msat - 67.6) - 0.229 * cosd(2 * Mj - 4 * Msat - 2) + 0.119 * sind(Mj - 2 * Msat - 3) + 0.046 * sind(2 * Mj - 6 * Msat - 69) + 0.014 * sind(Mj - 3 * Msat + 32);
      if (k === "uranus") L += 0.04 * sind(Msat - 2 * Mu + 6) + 0.035 * sind(Msat - 3 * Mu + 33) - 0.015 * sind(Mj - Mu + 20);
      lon[k] = norm(L);
    }

    // 上升 / 天顶
    let asc = null;
    let mc = null;
    if (!b.noTime && Number.isFinite(b.lat) && Number.isFinite(b.lon)) {
      const gmst0 = norm(Ls + 180);
      const ramc = norm(gmst0 + ut * 15.04107 + b.lon);
      mc = norm(atan2d(sind(ramc), cosd(ramc) * cosd(ecl)));
      asc = norm(atan2d(cosd(ramc), -(sind(ramc) * cosd(ecl) + Math.tan(b.lat * rad) * sind(ecl))));
    }

    const planets = BODIES.map((p) => {
      const L = lon[p.k];
      return { ...p, lon: L, sign: Math.floor(L / 30), deg: L % 30, house: asc == null ? null : Math.floor(norm(L - asc) / 30) + 1 };
    });
    return { planets, asc, mc, aspects: aspects(planets), noTime: asc == null };
  }

  const ASPECTS = [
    { n: "合相", a: 0, orb: 8, c: "#e0a400" },
    { n: "六合", a: 60, orb: 5, c: "#2f74d0" },
    { n: "刑相", a: 90, orb: 7, c: "#e5484d" },
    { n: "拱相", a: 120, orb: 7, c: "#2fa36b" },
    { n: "冲相", a: 180, orb: 8, c: "#c0392b" }
  ];
  function aspects(ps) {
    const out = [];
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) {
        let dlt = Math.abs(ps[i].lon - ps[j].lon);
        if (dlt > 180) dlt = 360 - dlt;
        for (const a of ASPECTS)
          if (Math.abs(dlt - a.a) <= a.orb) {
            out.push({ a: ps[i], b: ps[j], type: a, exact: Math.abs(dlt - a.a) });
            break;
          }
      }
    return out.sort((x, y) => x.exact - y.exact);
  }

  const fmtDeg = (x) => `${Math.floor(x)}°${String(Math.round((x % 1) * 60)).padStart(2, "0")}′`;
  function describe(chart) {
    const lines = chart.planets.map((p) => `${p.n} ${SIGNS[p.sign]} ${fmtDeg(p.deg)}${p.house ? ` 第${p.house}宫` : ""}`);
    if (chart.asc != null) lines.push(`上升 ${SIGNS[Math.floor(chart.asc / 30)]} ${fmtDeg(chart.asc % 30)}`, `天顶 ${SIGNS[Math.floor(chart.mc / 30)]} ${fmtDeg(chart.mc % 30)}`);
    const asp = chart.aspects.slice(0, 10).map((x) => `${x.a.n}${x.type.n}${x.b.n}`);
    return lines.join("；") + (asp.length ? `。主要相位：${asp.join("、")}` : "") + (chart.noTime ? "。（出生时间未知，未计算上升和宫位）" : "");
  }

  /** 画星盘 SVG：上升点放在左边（9 点钟方向），逆时针排列 */
  function svg(chart, size) {
    const S = size || 320;
    const c = S / 2;
    const R1 = S * 0.48;
    const R2 = S * 0.39;
    const R3 = S * 0.3;
    const base = chart.asc != null ? chart.asc : 0;
    const pt = (lonDeg, r) => {
      const t = (180 + (lonDeg - base)) * rad;
      return [c + r * Math.cos(t), c - r * Math.sin(t)];
    };
    let g = `<circle cx="${c}" cy="${c}" r="${R1}" class="nt-ring"/><circle cx="${c}" cy="${c}" r="${R2}" class="nt-ring"/><circle cx="${c}" cy="${c}" r="${R3}" class="nt-ring2"/>`;
    for (let s = 0; s < 12; s++) {
      const [x1, y1] = pt(s * 30, R2);
      const [x2, y2] = pt(s * 30, R1);
      g += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="nt-tick"/>`;
      const [tx, ty] = pt(s * 30 + 15, (R1 + R2) / 2);
      g += `<text x="${tx}" y="${ty}" class="nt-sign e${s % 4}" text-anchor="middle" dominant-baseline="central">${SIGN_GLYPH[s]}</text>`;
    }
    if (chart.asc != null) {
      for (let h = 0; h < 12; h++) {
        const L = chart.asc + h * 30;
        const [x1, y1] = pt(L, R3 * 0.35);
        const [x2, y2] = pt(L, R2);
        g += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${h % 3 === 0 ? "nt-axis" : "nt-house"}"/>`;
        const [hx, hy] = pt(L + 15, R3 * 0.48);
        g += `<text x="${hx}" y="${hy}" class="nt-hno" text-anchor="middle" dominant-baseline="central">${h + 1}</text>`;
      }
      const [ax, ay] = pt(chart.asc, R1 + 2);
      g += `<text x="${ax - 4}" y="${ay}" class="nt-lbl" text-anchor="end" dominant-baseline="central">ASC</text>`;
      const [mx, my] = pt(chart.mc, R1 + 2);
      g += `<text x="${mx}" y="${my - 4}" class="nt-lbl" text-anchor="middle">MC</text>`;
    }
    // 相位线
    for (const a of chart.aspects) {
      if (a.type.a === 0) continue;
      const [x1, y1] = pt(a.a.lon, R3 * 0.98);
      const [x2, y2] = pt(a.b.lon, R3 * 0.98);
      g += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${a.type.c}" class="nt-asp"/>`;
    }
    // 行星：位置太近时错开半径
    const sorted = chart.planets.slice().sort((a, b) => a.lon - b.lon);
    let prev = -99;
    let lane = 0;
    for (const p of sorted) {
      lane = p.lon - prev < 7 ? (lane + 1) % 3 : 0;
      prev = p.lon;
      const r = R2 - S * 0.045 - lane * S * 0.05;
      const [x, y] = pt(p.lon, r);
      const [dx, dy] = pt(p.lon, R2);
      g += `<line x1="${dx}" y1="${dy}" x2="${pt(p.lon, R2 - S * 0.018)[0]}" y2="${pt(p.lon, R2 - S * 0.018)[1]}" class="nt-ptick"/>`;
      g += `<text x="${x}" y="${y}" class="nt-planet p-${p.k}" text-anchor="middle" dominant-baseline="central">${p.g}</text>`;
    }
    return `<svg class="nt-svg" viewBox="0 0 ${S} ${S}" width="100%" xmlns="http://www.w3.org/2000/svg">${g}</svg>`;
  }

  /** 常用城市坐标（东经为正） */
  const CITIES = [
    ["北京", 39.9, 116.4], ["上海", 31.23, 121.47], ["广州", 23.13, 113.26], ["深圳", 22.54, 114.06], ["天津", 39.13, 117.2],
    ["重庆", 29.56, 106.55], ["成都", 30.66, 104.06], ["杭州", 30.27, 120.15], ["南京", 32.06, 118.8], ["武汉", 30.59, 114.3],
    ["西安", 34.27, 108.94], ["长沙", 28.23, 112.94], ["郑州", 34.75, 113.62], ["济南", 36.65, 117.0], ["青岛", 36.07, 120.38],
    ["沈阳", 41.8, 123.43], ["大连", 38.91, 121.6], ["哈尔滨", 45.8, 126.53], ["长春", 43.82, 125.32], ["石家庄", 38.04, 114.51],
    ["太原", 37.87, 112.55], ["合肥", 31.82, 117.23], ["福州", 26.07, 119.3], ["厦门", 24.48, 118.09], ["南昌", 28.68, 115.86],
    ["昆明", 25.04, 102.71], ["贵阳", 26.65, 106.63], ["南宁", 22.82, 108.32], ["海口", 20.04, 110.2], ["兰州", 36.06, 103.83],
    ["西宁", 36.62, 101.78], ["银川", 38.49, 106.23], ["乌鲁木齐", 43.83, 87.62], ["拉萨", 29.65, 91.13], ["呼和浩特", 40.84, 111.75],
    ["苏州", 31.3, 120.62], ["宁波", 29.87, 121.55], ["无锡", 31.49, 120.31], ["佛山", 23.02, 113.12], ["东莞", 23.02, 113.75],
    ["香港", 22.32, 114.17], ["澳门", 22.2, 113.55], ["台北", 25.03, 121.57], ["东京", 35.68, 139.69], ["首尔", 37.57, 126.98],
    ["新加坡", 1.35, 103.82], ["伦敦", 51.51, -0.13], ["巴黎", 48.86, 2.35], ["纽约", 40.71, -74.01], ["洛杉矶", 34.05, -118.24], ["悉尼", -33.87, 151.21]
  ];

  window.XXJ_NATAL = { compute, svg, describe, SIGNS, SIGN_GLYPH, CITIES, fmtDeg };
})();
