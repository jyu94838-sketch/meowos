"use strict";

/**
 * 星座：今日运势 / 角色星座档案 / 星座合盘与相处建议
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast, avHtml } = F;

  const KV = "astro_v1";
  const SIGNS = [
    { n: "白羊座", s: "♈", d: "3.21-4.19", e: "火" },
    { n: "金牛座", s: "♉", d: "4.20-5.20", e: "土" },
    { n: "双子座", s: "♊", d: "5.21-6.21", e: "风" },
    { n: "巨蟹座", s: "♋", d: "6.22-7.22", e: "水" },
    { n: "狮子座", s: "♌", d: "7.23-8.22", e: "火" },
    { n: "处女座", s: "♍", d: "8.23-9.22", e: "土" },
    { n: "天秤座", s: "♎", d: "9.23-10.23", e: "风" },
    { n: "天蝎座", s: "♏", d: "10.24-11.22", e: "水" },
    { n: "射手座", s: "♐", d: "11.23-12.21", e: "火" },
    { n: "摩羯座", s: "♑", d: "12.22-1.19", e: "土" },
    { n: "水瓶座", s: "♒", d: "1.20-2.18", e: "风" },
    { n: "双鱼座", s: "♓", d: "2.19-3.20", e: "水" }
  ];
  const EL_COLOR = { 火: "#ff8a65", 土: "#c9a26b", 风: "#7cc4e8", 水: "#8d8df0" };
  const sign = (n) => SIGNS.find((x) => x.n === n) || null;

  function signFromDate(m, d) {
    const cut = [20, 19, 21, 20, 21, 22, 23, 23, 23, 24, 23, 22]; // 每月这一天及之后进入下一个星座
    // 1月20日起水瓶(10)……
    const startIdx = [9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8]; // 每月月初所属星座
    const i = d >= cut[m - 1] ? (startIdx[m - 1] + 1) % 12 : startIdx[m - 1];
    return SIGNS[i].n;
  }
  /** 元素基础契合度：同元素 / 火风、土水互补 较高 */
  function baseScore(a, b) {
    const ea = sign(a)?.e;
    const eb = sign(b)?.e;
    if (!ea || !eb) return 60;
    if (ea === eb) return 82;
    const pair = [ea, eb].sort().join("");
    if (pair === "火风" || pair === "土水") return 86;
    if (pair === "火水" || pair === "土风") return 58;
    return 68;
  }
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };

  let S = null;
  let root = null;
  let tab = "fortune";
  let cast = [];
  let user = null;

  async function load() {
    try {
      S = (await F.FunDB.get(KV)) || null;
    } catch (_) {
      S = null;
    }
    if (!S) S = { mySign: "", myBirthday: "", chars: {}, fortune: {}, matches: {} };
    S.births = S.births || {};
    S.natalReads = S.natalReads || {};
  }
  function save() {
    // 运势只留最近 30 条
    const keys = Object.keys(S.fortune);
    if (keys.length > 30) keys.slice(0, keys.length - 30).forEach((k) => delete S.fortune[k]);
    F.FunDB.set(KV, S).catch(() => {});
  }

  /* ───── AI ───── */
  async function aiFortune(signName) {
    const txt = await F.aiText(
      [
        { role: "system", content: "你是温柔又有点俏皮的星座运势作者，写法像星座 App 的每日运势：具体、有画面、给出可执行的小建议，不要恐吓，不要绝对化。只输出 JSON。" },
        {
          role: "user",
          content: `日期：${new Date().toLocaleDateString("zh-CN")}（${["日", "一", "二", "三", "四", "五", "六"][new Date().getDay()]}）\n星座：${signName}\n\n格式：{"overall":1到5,"love":1到5,"work":1到5,"money":1到5,"health":1到5,"summary":"今日综合，50~80字","love_text":"爱情，30~50字","work_text":"事业学业，30~50字","money_text":"财运，20~40字","lucky_color":"","lucky_number":"","lucky_item":"","match":"今日速配星座","tip":"一句今日小建议"}`
        }
      ],
      { maxTokens: 1000, temperature: 0.9 }
    );
    const o = F.parseJsonLoose(txt);
    if (!o || !o.summary) throw new Error("运势格式不对，再试一次");
    return o;
  }

  async function aiProfile(c, signName) {
    const txt = await F.aiText(
      [
        { role: "system", content: "你是懂星座也懂角色塑造的写手，把星座特质和角色人设结合起来写一份星座档案。只输出 JSON。" },
        {
          role: "user",
          content: `角色：${c.name}\n人设：${c.persona || "（无）"}\n${signName ? `TA 的星座：${signName}` : "人设里如果写了生日或星座就按它来；没有的话，根据性格推断最像的星座。"}\n\n格式：{"sign":"X座","reason":"${signName ? "这个星座在 TA 身上的体现" : "推断依据"}，30~60字","traits":["性格关键词","",""],"love_style":"恋爱中的样子，40~70字","weakness":"小缺点，20~40字","ideal":"理想型，20~40字","quote":"TA 用自己的口吻说一句对星座的看法"}`
        }
      ],
      { maxTokens: 900 }
    );
    const o = F.parseJsonLoose(txt);
    if (!o || !o.sign) throw new Error("档案格式不对");
    const s = SIGNS.find((x) => String(o.sign).includes(x.n.slice(0, 2)));
    o.sign = s ? s.n : signName || "白羊座";
    return o;
  }

  async function aiMatch(a, b) {
    const base = baseScore(a.sign, b.sign);
    const ca = chartOf(a.id);
    const cb = chartOf(b.id);
    const N = window.XXJ_NATAL;
    const txt = await F.aiText(
      [
        { role: "system", content: "你是温柔专业的星座合盘师。结合两人的星座元素和各自的性格人设做合盘，要具体，不要只说星座套话；建议要能落地。只输出 JSON。" },
        {
          role: "user",
          content: `A：${a.name}，${a.sign}${a.persona ? "，人设：" + a.persona.slice(0, 300) : ""}${ca ? "\nA 的星盘：" + N.describe(ca) : ""}\nB：${b.name}，${b.sign}${b.persona ? "，人设：" + b.persona.slice(0, 300) : ""}${cb ? "\nB 的星盘：" + N.describe(cb) : ""}${ca && cb ? "\n请重点参考两人的太阳、月亮、金星、火星和上升之间的关系。" : ""}\n元素参考分：${base}（可以在±12 范围内按性格调整）\n\n格式：{"score":0到100,"title":"这对组合的称号，8字内","summary":"整体分析，60~100字","good":["合拍的地方","",""],"clash":["容易摩擦的地方",""],"advice":["给 A 的相处建议","给 B 的相处建议","两人一起的建议"],"date_idea":"适合的约会方式","b_says":"B 用自己的口吻对 A 说一句话"}`
        }
      ],
      { maxTokens: 1400 }
    );
    const o = F.parseJsonLoose(txt);
    if (!o || o.score == null) throw new Error("合盘格式不对");
    o.score = Math.max(0, Math.min(100, Number(o.score) || base));
    return o;
  }

  /* ───── 星盘 ───── */
  let natalWho = "me";
  function chartOf(id) {
    const b = S.births?.[id];
    const N = window.XXJ_NATAL;
    if (!b || !b.date || !N) return null;
    const [y, m, d] = b.date.split("-").map(Number);
    const [hh, mm] = (b.time || "12:00").split(":").map(Number);
    return N.compute({ y, m, d, hour: hh, min: mm, tz: Number(b.tz ?? 8), lat: Number(b.lat), lon: Number(b.lon), noTime: !b.time });
  }
  const birthKey = (b) => [b.date, b.time, b.lat, b.lon, b.tz].join("|");

  function renderNatal(p) {
    const N = window.XXJ_NATAL;
    if (!N) {
      p.innerHTML = `<p class="fun-note as-center">星盘模块未加载</p>`;
      return;
    }
    const people = [{ id: "me", name: user?.name || "我", avatar: user?.avatar }, ...cast];
    const who = people.find((x) => x.id === natalWho) || people[0];
    const b = S.births[who.id];
    const chart = chartOf(who.id);
    const read = S.natalReads[who.id];
    const readOk = read && b && read.key === birthKey(b);
    p.innerHTML = `<div class="nt-people">${people
      .map((x) => `<button type="button" class="nt-person${x.id === who.id ? " is-on" : ""}" data-nw="${esc(x.id)}">${avHtml(x, "fun-av sm")}<span>${esc(x.id === "me" ? "我" : x.name)}</span></button>`)
      .join("")}</div>
      ${
        chart
          ? `<div class="as-card nt-wrap">${N.svg(chart, 320)}</div>
             <p class="fun-note as-center">${esc(b.date)} ${esc(b.time || "（时间未知）")} · ${esc(b.city || `${b.lat}, ${b.lon}`)} <button type="button" class="sh-link" data-a="editbirth">修改</button></p>
             <div class="as-card"><p class="fun-kicker">行星落座</p><div class="nt-table">${chart.planets
               .map((x) => `<span><b class="p-${x.k}">${x.g}</b>${x.n}</span><span>${N.SIGN_GLYPH[x.sign]} ${N.SIGNS[x.sign]} ${N.fmtDeg(x.deg)}</span><span>${x.house ? `第${x.house}宫` : ""}</span>`)
               .join("")}${
               chart.asc != null
                 ? `<span><b>AC</b>上升</span><span>${N.SIGN_GLYPH[Math.floor(chart.asc / 30)]} ${N.SIGNS[Math.floor(chart.asc / 30)]} ${N.fmtDeg(chart.asc % 30)}</span><span></span><span><b>MC</b>天顶</span><span>${N.SIGN_GLYPH[Math.floor(chart.mc / 30)]} ${N.SIGNS[Math.floor(chart.mc / 30)]} ${N.fmtDeg(chart.mc % 30)}</span><span></span>`
                 : ""
             }</div>${chart.noTime ? `<p class="fun-note">没有出生时间，所以没有上升、天顶和宫位；月亮星座在当天也可能有偏差。</p>` : ""}</div>
             ${chart.aspects.length ? `<div class="as-card"><p class="fun-kicker">主要相位</p><div class="nt-asps">${chart.aspects.slice(0, 12).map((a) => `<span style="--c:${a.type.c}">${a.a.g}${a.a.n} <b>${a.type.n}</b> ${a.b.g}${a.b.n}</span>`).join("")}</div></div>` : ""}
             ${
               readOk
                 ? natalReadHtml(read.data, who)
                 : `<div class="fun-setup-btns"><button type="button" class="fun-btn solid" data-a="natalread">✨ 解读${who.id === "me" ? "我" : " " + esc(who.name) + " "}的星盘</button></div>`
             }
             <p class="fun-note as-center">行星位置用天文算法计算（误差约 1°），宫位为等宫制，未计算冥王星。</p>`
          : birthForm(who, b)
      }`;
    if (!chart) bindBirthForm(p, who);
  }

  function natalReadHtml(r, who) {
    const sec = [
      ["🌞 核心性格", r.core],
      ["🌙 内心与情绪", r.emotion],
      ["💗 爱情模式", r.love],
      ["💼 事业与天赋", r.work],
      ["🌱 成长课题", r.growth]
    ].filter(([, t]) => t);
    return sec.map(([k, t]) => `<div class="as-card"><p class="fun-kicker">${k}</p><p>${esc(t)}</p></div>`).join("") + (r.quote && who.id !== "me" ? `<div class="as-card as-tip">${avHtml(who, "fun-av sm")} ${esc(who.name)}：「${esc(r.quote)}」</div>` : "") + `<div class="fun-setup-btns"><button type="button" class="fun-btn ghost" data-a="natalread">重新解读</button></div>`;
  }

  function birthForm(who, b) {
    const N = window.XXJ_NATAL;
    const v = b || { date: who.id === "me" ? S.myBirthday || "" : "", time: "", city: "北京", lat: 39.9, lon: 116.4, tz: 8 };
    return `<div class="as-card nt-form">
      <p class="fun-kicker">${who.id === "me" ? "你的" : esc(who.name) + " 的"}出生信息</p>
      <label class="fun-field"><span>出生日期</span><input type="date" id="nt-date" value="${esc(v.date)}" /></label>
      <label class="fun-field"><span>出生时间（知道的话填，能算上升和宫位）</span><input type="time" id="nt-time" value="${esc(v.time)}" /></label>
      <label class="fun-field"><span>出生城市</span><select id="nt-city">${N.CITIES.map(([n]) => `<option ${v.city === n ? "selected" : ""}>${n}</option>`).join("")}<option value="__custom__" ${v.city && !N.CITIES.some(([n]) => n === v.city) ? "selected" : ""}>其他（手填经纬度）</option></select></label>
      <div class="nt-ll" ${v.city && !N.CITIES.some(([n]) => n === v.city) ? "" : "hidden"}><input id="nt-lat" type="number" step="0.01" placeholder="纬度 北正南负" value="${esc(v.lat)}" /><input id="nt-lon" type="number" step="0.01" placeholder="经度 东正西负" value="${esc(v.lon)}" /></div>
      <label class="fun-field"><span>时区</span><select id="nt-tz">${[-8, -5, 0, 1, 7, 8, 9, 10].map((t) => `<option value="${t}" ${Number(v.tz) === t ? "selected" : ""}>UTC${t >= 0 ? "+" : ""}${t}${t === 8 ? "（北京时间）" : ""}</option>`).join("")}</select></label>
      <div class="fun-setup-btns">${who.id !== "me" ? `<button type="button" class="fun-btn ghost" data-a="aibirth">让 AI 按人设设定</button>` : ""}<button type="button" class="fun-btn solid" data-a="savebirth">生成星盘</button></div>
    </div>`;
  }

  function bindBirthForm(p, who) {
    const city = p.querySelector("#nt-city");
    if (!city) return;
    city.onchange = () => (p.querySelector(".nt-ll").hidden = city.value !== "__custom__");
  }

  function readBirthForm(p) {
    const N = window.XXJ_NATAL;
    const date = p.querySelector("#nt-date").value;
    if (!date) {
      toast("填一下出生日期");
      return null;
    }
    const cv = p.querySelector("#nt-city").value;
    const c = N.CITIES.find(([n]) => n === cv);
    const lat = c ? c[1] : Number(p.querySelector("#nt-lat").value);
    const lon = c ? c[2] : Number(p.querySelector("#nt-lon").value);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      toast("填一下经纬度");
      return null;
    }
    return { date, time: p.querySelector("#nt-time").value, city: c ? cv : "", lat, lon, tz: Number(p.querySelector("#nt-tz").value) };
  }

  function saveBirth(id, b) {
    S.births[id] = b;
    const ch = chartOf(id);
    const sun = window.XXJ_NATAL.SIGNS[ch.planets[0].sign];
    if (id === "me") {
      S.mySign = sun;
      S.myBirthday = b.date;
    } else {
      S.chars[id] = { ...(S.chars[id] || {}), sign: sun };
    }
    save();
  }

  async function aiBirth(who) {
    const N = window.XXJ_NATAL;
    const known = S.chars[who.id]?.sign;
    const txt = await F.aiText(
      [
        { role: "system", content: "你在为虚构角色设定出生信息，用来排星盘。如果人设里写了生日就用它；否则按性格挑一个合适的日期和时间。只输出 JSON。" },
        { role: "user", content: `角色：${who.name}\n人设：${who.persona || "（无）"}\n${known ? `TA 的太阳星座应该是 ${known}。` : ""}\n可选城市：${N.CITIES.map((c) => c[0]).join("、")}\n格式：{"date":"YYYY-MM-DD","time":"HH:MM","city":"城市名","reason":"一句话说明"}` }
      ],
      { maxTokens: 400 }
    );
    const o = F.parseJsonLoose(txt);
    if (!o || !/^\d{4}-\d{2}-\d{2}$/.test(o.date || "")) throw new Error("格式不对，再试一次");
    const c = N.CITIES.find(([n]) => n === o.city) || N.CITIES[0];
    const TZ = { 东京: 9, 首尔: 9, 伦敦: 0, 巴黎: 1, 纽约: -5, 洛杉矶: -8, 悉尼: 10 };
    return { b: { date: o.date, time: /^\d{2}:\d{2}$/.test(o.time || "") ? o.time : "", city: c[0], lat: c[1], lon: c[2], tz: TZ[c[0]] ?? 8 }, reason: o.reason };
  }

  async function natalRead(who) {
    const N = window.XXJ_NATAL;
    const ch = chartOf(who.id);
    const txt = await F.aiText(
      [
        {
          role: "system",
          content: `你是温柔专业的占星师，根据本命盘做解读：具体、有洞察，避免空泛和宿命论，多给可执行的建议。${who.id === "me" ? "" : "这是一个虚构角色的星盘，请把星盘和 TA 的人设结合起来，说明星盘如何解释 TA 的性格。"}只输出 JSON。`
        },
        {
          role: "user",
          content: `${who.id === "me" ? `${who.name}` : `角色「${who.name}」`}的本命盘：${N.describe(ch)}\n${who.persona ? "人设：" + who.persona.slice(0, 400) : ""}\n\n格式：{"core":"核心性格（太阳、上升），60~100字","emotion":"内心与情绪（月亮），50~80字","love":"爱情模式（金星、火星、第7宫），60~100字","work":"事业与天赋（天顶、第10宫、土星），50~80字","growth":"成长课题，40~70字"${who.id === "me" ? "" : ',"quote":"TA 用自己的口吻对自己的星盘说一句话"'}}`
        }
      ],
      { maxTokens: 1600 }
    );
    const o = F.parseJsonLoose(txt);
    if (!o || !o.core) throw new Error("解读格式不对，再试一次");
    return o;
  }

  /* ───── 渲染 ───── */
  const stars = (n) => "★★★★★".slice(0, Math.max(0, Math.min(5, Math.round(n)))) + "☆☆☆☆☆".slice(0, 5 - Math.max(0, Math.min(5, Math.round(n))));
  const signBadge = (n) => {
    const s = sign(n);
    return s ? `<span class="as-badge" style="--el:${EL_COLOR[s.e]}">${s.s} ${s.n}</span>` : `<span class="as-badge is-none">未设置</span>`;
  };

  function render() {
    if (!root) return;
    root.innerHTML = `<div class="as">
      <div class="as-sky"></div>
      <div class="sh-tabs as-tabs">${[["fortune", "今日运势"], ["natal", "星盘"], ["chars", "角色档案"], ["match", "合盘"]].map(([k, n]) => `<button type="button" data-tab="${k}" class="${tab === k ? "is-on" : ""}">${n}</button>`).join("")}</div>
      <div class="as-panel" id="as-panel"></div></div>`;
    const p = root.querySelector("#as-panel");
    if (tab === "fortune") renderFortune(p);
    if (tab === "chars") renderChars(p);
    if (tab === "match") renderMatch(p);
    if (tab === "natal") renderNatal(p);
  }

  function signPicker(cur) {
    return `<div class="as-grid">${SIGNS.map((s) => `<button type="button" class="as-sign${cur === s.n ? " is-on" : ""}" data-sign="${s.n}" style="--el:${EL_COLOR[s.e]}"><span>${s.s}</span><strong>${s.n}</strong><small>${s.d}</small></button>`).join("")}</div>`;
  }

  function renderFortune(p) {
    if (!S.mySign) {
      p.innerHTML = `<div class="as-intro"><p class="fun-kicker">先告诉我你的星座</p><label class="fun-field"><span>生日（选填，自动算星座）</span><input type="date" id="as-bday" /></label>${signPicker("")}</div>`;
      p.querySelector("#as-bday").onchange = (e) => {
        const [, m, d] = e.target.value.split("-").map(Number);
        if (!m) return;
        S.myBirthday = e.target.value;
        S.mySign = signFromDate(m, d);
        save();
        render();
      };
      p.querySelectorAll("[data-sign]").forEach((b) => (b.onclick = () => ((S.mySign = b.dataset.sign), save(), render())));
      return;
    }
    const key = today() + "|" + S.mySign;
    const f = S.fortune[key];
    const s = sign(S.mySign);
    p.innerHTML = `<div class="as-me"><span class="as-big" style="--el:${EL_COLOR[s.e]}">${s.s}</span><div><strong>${esc(user?.name || "我")} · ${s.n}</strong><small>${s.d} · ${s.e}象星座</small></div><button type="button" class="sh-link" data-a="change">换星座</button></div>
      <div id="as-fortune">${f ? fortuneHtml(f) : `<div class="as-card as-center"><p>今天的运势还没揭晓</p><button type="button" class="fun-btn solid" data-a="gen">✨ 查看今日运势</button></div>`}</div>
      ${f ? `<p class="fun-note as-center">${new Date().toLocaleDateString("zh-CN")} · 每天更新一次</p>` : ""}`;
  }

  function fortuneHtml(f) {
    const rows = [["爱情", f.love, f.love_text], ["事业", f.work, f.work_text], ["财运", f.money, f.money_text]];
    return `<div class="as-card">
        <div class="as-overall"><span>综合运势</span><b>${stars(f.overall)}</b></div>
        <p class="as-sum">${esc(f.summary)}</p>
        <div class="as-mini">${[["爱情", f.love], ["事业", f.work], ["财运", f.money], ["健康", f.health]].map(([k, v]) => `<span>${k}<b>${stars(v)}</b></span>`).join("")}</div>
      </div>
      ${rows.map(([k, v, t]) => `<div class="as-card"><p class="fun-kicker">${k} ${stars(v)}</p><p>${esc(t || "")}</p></div>`).join("")}
      <div class="as-lucky"><span>幸运色<b>${esc(f.lucky_color || "-")}</b></span><span>幸运数字<b>${esc(f.lucky_number || "-")}</b></span><span>幸运物<b>${esc(f.lucky_item || "-")}</b></span><span>速配<b>${esc(f.match || "-")}</b></span></div>
      ${f.tip ? `<div class="as-card as-tip">💫 ${esc(f.tip)}</div>` : ""}`;
  }

  function renderChars(p) {
    if (!cast.length) {
      p.innerHTML = `<p class="fun-note as-center">角色库里还没有角色</p>`;
      return;
    }
    p.innerHTML = `<p class="fun-note">点角色查看 TA 的星座档案。没设置星座的，可以让 AI 根据人设推断。</p>
      <div class="as-chars">${cast
        .map((c) => {
          const pr = S.chars[c.id];
          return `<button type="button" class="as-char" data-c="${esc(c.id)}">${avHtml(c, "fun-av")}<span><strong>${esc(c.name)}</strong>${signBadge(pr?.sign)}</span>${pr?.profile ? `<small>${esc((pr.profile.traits || []).slice(0, 3).join(" · "))}</small>` : ""}</button>`;
        })
        .join("")}</div>`;
  }

  function openChar(c) {
    const pr = S.chars[c.id] || {};
    const o = pr.profile;
    const sh = F.openSheet(
      `<div class="as-prof">${avHtml(c, "fun-av sv-prof-av")}<strong>${esc(c.name)}</strong>${signBadge(pr.sign)}</div>
       ${
         o
           ? `<div class="as-card"><p class="fun-kicker">性格关键词</p><div class="as-tags">${(o.traits || []).map((t) => `<span>${esc(t)}</span>`).join("")}</div><p>${esc(o.reason || "")}</p></div>
              <div class="as-card"><p class="fun-kicker">💗 恋爱中的 TA</p><p>${esc(o.love_style || "")}</p></div>
              <div class="as-card"><p class="fun-kicker">🌧 小缺点</p><p>${esc(o.weakness || "")}</p></div>
              <div class="as-card"><p class="fun-kicker">🎯 理想型</p><p>${esc(o.ideal || "")}</p></div>
              ${o.quote ? `<div class="as-card as-tip">「${esc(o.quote)}」—— ${esc(c.name)}</div>` : ""}`
           : `<p class="fun-note as-center">还没有档案</p>`
       }
       <p class="fun-kicker">设置星座</p>
       <select class="as-select" id="as-csign"><option value="">让 AI 根据人设推断</option>${SIGNS.map((s) => `<option ${pr.sign === s.n ? "selected" : ""}>${s.n}</option>`).join("")}</select>
       <div class="fun-sheet-actions"><button type="button" class="fun-btn solid" data-a="gen">${o ? "重新生成档案" : "生成星座档案"}</button></div>`,
      { title: "星座档案" }
    );
    sh.el.classList.add("fun-sheet--tall");
    sh.body.querySelector('[data-a="gen"]').onclick = async (e) => {
      if (!F.hasApiKey()) return toast("请先在设置里填写 API Key");
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = "正在观星…";
      try {
        const chosen = sh.body.querySelector("#as-csign").value;
        const prof = await aiProfile(c, chosen);
        S.chars[c.id] = { sign: prof.sign, profile: prof };
        save();
        sh.close();
        render();
        openChar(c);
      } catch (err) {
        toast("失败：" + err.message);
        btn.disabled = false;
        btn.textContent = "生成星座档案";
      }
    };
  }

  let matchSel = { a: "me", b: "" };
  function personOf(id) {
    if (id === "me") return { id: "me", name: user?.name || "我", sign: S.mySign, persona: user?.persona || "", avatar: user?.avatar };
    const c = cast.find((x) => x.id === id);
    return c ? { ...c, sign: S.chars[c.id]?.sign || "" } : null;
  }
  function renderMatch(p) {
    const people = [{ id: "me", name: (user?.name || "我") + "（我）", avatar: user?.avatar }, ...cast];
    if (!matchSel.b && cast[0]) matchSel.b = cast[0].id;
    const A = personOf(matchSel.a);
    const B = personOf(matchSel.b);
    const key = [matchSel.a, matchSel.b].join("|");
    const m = S.matches[key];
    const opts = (cur) => people.map((x) => `<option value="${esc(x.id)}" ${x.id === cur ? "selected" : ""}>${esc(x.name)}</option>`).join("");
    p.innerHTML = `<div class="as-pair">
        <div class="as-who">${A ? avHtml(A, "fun-av") : ""}<select id="as-a">${opts(matchSel.a)}</select>${signBadge(A?.sign)}</div>
        <span class="as-heart">♡</span>
        <div class="as-who">${B ? avHtml(B, "fun-av") : ""}<select id="as-b">${opts(matchSel.b)}</select>${signBadge(B?.sign)}</div>
      </div>
      ${!A?.sign || !B?.sign ? `<p class="fun-note as-center warn">${!A?.sign ? esc(A?.name || "") : esc(B?.name || "")} 还没有星座，${(A?.id === "me" && !A.sign) || (B?.id === "me" && !B.sign) ? "去「今日运势」设置你的星座；" : ""}角色去「角色档案」生成。</p>` : ""}
      <div class="fun-setup-btns"><button type="button" class="fun-btn solid" data-a="match" ${A?.sign && B?.sign && matchSel.a !== matchSel.b ? "" : "disabled"}>${m ? "重新合盘" : "开始合盘"}</button></div>
      <div id="as-mres">${m ? matchHtml(m, A, B) : ""}</div>`;
    p.querySelector("#as-a").onchange = (e) => ((matchSel.a = e.target.value), render());
    p.querySelector("#as-b").onchange = (e) => ((matchSel.b = e.target.value), render());
  }

  function matchHtml(m, A, B) {
    return `<div class="as-card as-score"><div class="as-ring" style="--p:${m.score}"><b>${m.score}</b><small>契合度</small></div><div><strong>${esc(m.title || "")}</strong><p>${esc(m.summary || "")}</p></div></div>
      <div class="as-card"><p class="fun-kicker">✨ 合拍的地方</p><ul>${(m.good || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div class="as-card"><p class="fun-kicker">⚡ 容易摩擦</p><ul>${(m.clash || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div class="as-card"><p class="fun-kicker">💌 相处建议</p><ul>${(m.advice || []).map((x, i) => `<li><b>${i === 0 ? esc(A.name) : i === 1 ? esc(B.name) : "一起"}：</b>${esc(x)}</li>`).join("")}</ul></div>
      ${m.date_idea ? `<div class="as-card"><p class="fun-kicker">🎡 适合的约会</p><p>${esc(m.date_idea)}</p></div>` : ""}
      ${m.b_says ? `<div class="as-card as-tip">${avHtml(B, "fun-av sm")} ${esc(B.name)}：「${esc(m.b_says)}」</div>` : ""}`;
  }

  async function onClick(e) {
    const t = e.target.closest("[data-tab]");
    if (t) {
      tab = t.dataset.tab;
      return render();
    }
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "change") {
      S.mySign = "";
      save();
      return render();
    }
    if (a === "gen" && tab === "fortune") {
      if (!F.hasApiKey()) return toast("请先在设置里填写 API Key");
      const box = root.querySelector("#as-fortune");
      box.innerHTML = `<div class="as-card as-center"><span class="fun-spin"></span><p>正在读取星象…</p></div>`;
      try {
        S.fortune[today() + "|" + S.mySign] = await aiFortune(S.mySign);
        save();
      } catch (err) {
        toast("失败：" + err.message);
      }
      return render();
    }
    if (a === "match") {
      if (!F.hasApiKey()) return toast("请先在设置里填写 API Key");
      const btn = e.target.closest("button");
      btn.disabled = true;
      btn.textContent = "正在合盘…";
      try {
        const A = personOf(matchSel.a);
        const B = personOf(matchSel.b);
        S.matches[[matchSel.a, matchSel.b].join("|")] = await aiMatch(A, B);
        save();
      } catch (err) {
        toast("失败：" + err.message);
      }
      return render();
    }
    const nw = e.target.closest("[data-nw]");
    if (nw) {
      natalWho = nw.dataset.nw;
      return render();
    }
    const who = natalWho === "me" ? { id: "me", name: user?.name || "我", persona: user?.persona || "", avatar: user?.avatar } : cast.find((x) => x.id === natalWho);
    if (a === "editbirth") {
      delete S.births[natalWho];
      return render();
    }
    if (a === "savebirth") {
      const b = readBirthForm(root);
      if (!b) return;
      saveBirth(natalWho, b);
      return render();
    }
    if (a === "aibirth" && who) {
      if (!F.hasApiKey()) return toast("请先在设置里填写 API Key");
      const btn = e.target.closest("button");
      btn.disabled = true;
      btn.textContent = "AI 正在设定…";
      try {
        const r = await aiBirth(who);
        saveBirth(who.id, r.b);
        if (r.reason) toast(r.reason);
      } catch (err) {
        toast("失败：" + err.message);
      }
      return render();
    }
    if (a === "natalread" && who) {
      if (!F.hasApiKey()) return toast("请先在设置里填写 API Key");
      const btn = e.target.closest("button");
      btn.disabled = true;
      btn.textContent = "正在解读星盘…";
      try {
        S.natalReads[who.id] = { key: birthKey(S.births[who.id]), data: await natalRead(who) };
        save();
      } catch (err) {
        toast("失败：" + err.message);
      }
      return render();
    }
    const c = e.target.closest("[data-c]");
    if (c) openChar(cast.find((x) => x.id === c.dataset.c));
  }

  F.register("星座", {
    title: "星座",
    kicker: "ASTROLOGY",
    async mount(body) {
      root = document.createElement("div");
      root.className = "as-root";
      body.appendChild(root);
      root.addEventListener("click", onClick);
      [cast, user] = await Promise.all([F.loadCast(), F.loadUser()]);
      await load();
      if (root) render();
    },
    unmount() {
      root = null;
    }
  });

  // 给其它模块用（情侣小屋会读星座）
  window.XXJ_ASTRO = { signOf: async (charId) => (await F.FunDB.get(KV))?.chars?.[charId]?.sign || "", mySign: async () => (await F.FunDB.get(KV))?.mySign || "" };
})();
