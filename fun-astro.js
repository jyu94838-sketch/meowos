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
    const txt = await F.aiText(
      [
        { role: "system", content: "你是温柔专业的星座合盘师。结合两人的星座元素和各自的性格人设做合盘，要具体，不要只说星座套话；建议要能落地。只输出 JSON。" },
        {
          role: "user",
          content: `A：${a.name}，${a.sign}${a.persona ? "，人设：" + a.persona.slice(0, 300) : ""}\nB：${b.name}，${b.sign}${b.persona ? "，人设：" + b.persona.slice(0, 300) : ""}\n元素参考分：${base}（可以在±12 范围内按性格调整）\n\n格式：{"score":0到100,"title":"这对组合的称号，8字内","summary":"整体分析，60~100字","good":["合拍的地方","",""],"clash":["容易摩擦的地方",""],"advice":["给 A 的相处建议","给 B 的相处建议","两人一起的建议"],"date_idea":"适合的约会方式","b_says":"B 用自己的口吻对 A 说一句话"}`
        }
      ],
      { maxTokens: 1400 }
    );
    const o = F.parseJsonLoose(txt);
    if (!o || o.score == null) throw new Error("合盘格式不对");
    o.score = Math.max(0, Math.min(100, Number(o.score) || base));
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
      <div class="sh-tabs as-tabs">${[["fortune", "今日运势"], ["chars", "角色档案"], ["match", "合盘"]].map(([k, n]) => `<button type="button" data-tab="${k}" class="${tab === k ? "is-on" : ""}">${n}</button>`).join("")}</div>
      <div class="as-panel" id="as-panel"></div></div>`;
    const p = root.querySelector("#as-panel");
    if (tab === "fortune") renderFortune(p);
    if (tab === "chars") renderChars(p);
    if (tab === "match") renderMatch(p);
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
