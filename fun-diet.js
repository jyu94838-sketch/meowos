"use strict";

/**
 * 饮食 · 正常饮食 / 减脂两种模式
 * - 正常饮食：按身体数据算每天需要多少热量，AI 生成三餐 + 加餐
 * - 减脂：填身高、体重、理想体重，算出每日摄入上限（有安全下限，不会饿肚子式节食），
 *   AI 生成适配的饮食和运动安排
 * 热量用 Mifflin-St Jeor 公式在本地算，AI 只负责按这个数配菜和运动
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast, uid } = F;
  const KEY = "meowos_diet_v1";

  let S;
  try {
    S = JSON.parse(localStorage.getItem(KEY) || "null");
  } catch (_) {
    S = null;
  }
  if (!S || typeof S !== "object") S = {};
  S.mode ||= "";
  S.prof ||= { sex: "f", age: 22, height: 165, weight: 55, target: 52, act: "1.375", likes: "", avoid: "" };
  S.plans ||= {};
  S.logs ||= {};
  S.weights ||= [];
  S.sport ||= null;
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch (_) {
      toast("保存失败：存储空间不足");
    }
  };

  const ACTS = [
    ["1.2", "几乎不动（久坐、很少走路）"],
    ["1.375", "轻度活动（每周运动 1~3 次）"],
    ["1.55", "中度活动（每周运动 3~5 次）"],
    ["1.725", "高强度（几乎每天运动）"]
  ];
  const MEALS = [
    ["breakfast", "早餐", "🍳", 0.3],
    ["lunch", "午餐", "🍱", 0.35],
    ["dinner", "晚餐", "🥗", 0.25],
    ["snack", "加餐", "🍎", 0.1]
  ];
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const r1 = (n) => Math.round(n * 10) / 10;

  /* ───── 计算 ───── */
  function calc(p = S.prof, mode = S.mode) {
    const h = Number(p.height) / 100;
    const w = Number(p.weight);
    const bmi = w / (h * h);
    const bmr = 10 * w + 6.25 * Number(p.height) - 5 * Number(p.age) + (p.sex === "m" ? 5 : -161);
    const tdee = bmr * Number(p.act || 1.375);
    const minSafe = Math.max(Math.round(bmr), p.sex === "m" ? 1500 : 1200);
    const healthyLow = r1(18.5 * h * h);
    const healthyHigh = r1(23.9 * h * h);
    let target = Number(p.target) || w;
    let targetNote = "";
    if (target < healthyLow) {
      targetNote = `理想体重低于健康范围（BMI 18.5 对应 ${healthyLow} kg），已按 ${healthyLow} kg 来安排`;
      target = healthyLow;
    }
    let kcal = Math.round(tdee);
    let deficit = 0;
    let weeks = 0;
    let lowBmi = false;
    if (mode === "cut") {
      if (bmi < 18.5 || w <= target) {
        lowBmi = bmi < 18.5;
        kcal = Math.round(tdee);
      } else {
        deficit = Math.min(500, Math.round(tdee * 0.2));
        kcal = Math.max(minSafe, Math.round(tdee - deficit));
        deficit = Math.round(tdee - kcal);
        // 运动额外消耗约 250 kcal/天，加上饮食缺口，每 7700 kcal ≈ 1 kg
        const perWeek = ((deficit + 250) * 7) / 7700;
        weeks = perWeek > 0 ? Math.ceil((w - target) / perWeek) : 0;
      }
    }
    const protein = Math.round(w * (mode === "cut" ? 1.6 : 1.2));
    const fat = Math.round((kcal * 0.27) / 9);
    const carb = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    return { bmi: r1(bmi), bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, deficit, minSafe, weeks, target, targetNote, healthyLow, healthyHigh, protein, fat, carb, lowBmi };
  }
  const bmiTag = (b) => (b < 18.5 ? "偏瘦" : b < 24 ? "正常" : b < 28 ? "偏重" : "肥胖");

  /* ───── AI ───── */
  async function genPlan(day) {
    const c = calc();
    const p = S.prof;
    const cut = S.mode === "cut" && c.deficit > 0;
    const txt = await F.aiText(
      [
        {
          role: "system",
          content: `你是一位温和、专业的营养师，给中国用户安排一天的饮食。食物要家常、好买好做，分量写清楚（克数或常见单位，比如「一拳头米饭约150g」），每样标大概热量。四餐热量加起来要接近目标（误差 ±80 kcal），蛋白质要够。${cut ? "这是减脂期，但不要节食，要吃饱、吃得均衡，多蔬菜和优质蛋白，少油少糖。" : "这是正常饮食，营养均衡就好。"}只输出 JSON。`
        },
        {
          role: "user",
          content: `${p.sex === "m" ? "男" : "女"}，${p.age} 岁，${p.height} cm，${p.weight} kg。
今日目标：${c.kcal} kcal，蛋白质约 ${c.protein} g、脂肪约 ${c.fat} g、碳水约 ${c.carb} g。
分配参考：${MEALS.map(([, n, , r]) => `${n}约 ${Math.round(c.kcal * r)} kcal`).join("，")}。
${p.likes ? "喜欢吃：" + p.likes + "\n" : ""}${p.avoid ? "忌口 / 不吃：" + p.avoid + "\n" : ""}${S.plans[day] ? "换一套和上次不一样的。\n" : ""}
格式：{"meals":[{"key":"breakfast|lunch|dinner|snack","items":[{"name":"食物","amount":"分量","kcal":数字}],"tip":"一句小提示"}],"water":"建议喝水量","note":"一句今日小贴士"}`
        }
      ],
      { maxTokens: 1800, temperature: 0.85 }
    );
    const o = F.parseJsonLoose(txt);
    if (!o || !Array.isArray(o.meals)) throw new Error("格式不对，再试一次");
    const meals = MEALS.map(([k]) => {
      const m = o.meals.find((x) => x && x.key === k) || {};
      const items = (Array.isArray(m.items) ? m.items : []).map((it) => ({ name: String(it?.name || "").slice(0, 30), amount: String(it?.amount || "").slice(0, 30), kcal: Math.max(0, Math.round(Number(it?.kcal) || 0)) })).filter((it) => it.name);
      return { key: k, items, tip: String(m.tip || "").slice(0, 60) };
    });
    S.plans[day] = { meals, water: String(o.water || "1500~2000 ml").slice(0, 30), note: String(o.note || "").slice(0, 80), kcal: c.kcal, mode: S.mode, at: Date.now() };
    const keys = Object.keys(S.plans).sort();
    while (keys.length > 14) delete S.plans[keys.shift()];
    save();
  }

  async function genSport() {
    const c = calc();
    const p = S.prof;
    const txt = await F.aiText(
      [
        {
          role: "system",
          content: `你是一位温和的健身教练，给普通人安排一周运动计划。安排要循序渐进、在家或附近就能做，有氧和力量结合，每周至少休息 1 天。体重基数大（BMI≥28）的人避免跳跃类动作，保护膝盖。每天写清楚做什么、多久或几组、大概消耗多少热量。只输出 JSON。`
        },
        {
          role: "user",
          content: `${p.sex === "m" ? "男" : "女"}，${p.age} 岁，${p.height} cm，${p.weight} kg，BMI ${c.bmi}，目标 ${c.target} kg。平时活动量：${ACTS.find((a) => a[0] === String(p.act))?.[1] || "轻度"}。目标：减脂，每天运动额外消耗约 200~300 kcal。
格式：{"days":[{"day":"周一","items":[{"name":"运动","detail":"时长或组数","kcal":数字}],"rest":false}],"tips":["注意事项"]}`
        }
      ],
      { maxTokens: 1800, temperature: 0.8 }
    );
    const o = F.parseJsonLoose(txt);
    if (!o || !Array.isArray(o.days)) throw new Error("格式不对，再试一次");
    S.sport = {
      at: Date.now(),
      days: o.days.slice(0, 7).map((d) => ({ day: String(d?.day || "").slice(0, 6), rest: !!d?.rest, items: (Array.isArray(d?.items) ? d.items : []).map((it) => ({ name: String(it?.name || "").slice(0, 30), detail: String(it?.detail || "").slice(0, 40), kcal: Math.max(0, Math.round(Number(it?.kcal) || 0)) })).filter((it) => it.name) })),
      tips: (Array.isArray(o.tips) ? o.tips : []).map((t) => String(t).slice(0, 80)).slice(0, 5)
    };
    save();
  }

  async function estimateKcal(name) {
    const txt = await F.aiText(
      [
        { role: "system", content: "估算食物热量。只输出 JSON：{\"kcal\":数字,\"amount\":\"按什么分量估的\"}" },
        { role: "user", content: name }
      ],
      { maxTokens: 120, temperature: 0.2 }
    );
    const o = F.parseJsonLoose(txt);
    const k = Math.round(Number(o?.kcal));
    if (!k || k < 0) throw new Error("没估出来");
    return { kcal: Math.min(k, 3000), amount: String(o?.amount || "").slice(0, 20) };
  }

  /* ───── 渲染 ───── */
  let root = null;
  let tab = "today";
  let busy = "";
  let editing = false;

  function logOf(day) {
    S.logs[day] ||= { done: [], extra: [] };
    return S.logs[day];
  }
  function eatenKcal(day) {
    const plan = S.plans[day];
    const lg = logOf(day);
    let n = 0;
    if (plan) for (const m of plan.meals) if (lg.done.includes(m.key)) n += m.items.reduce((a, b) => a + b.kcal, 0);
    n += lg.extra.reduce((a, b) => a + (Number(b.kcal) || 0), 0);
    return n;
  }

  function render() {
    if (!root) return;
    if (!S.mode || editing) return renderSetup();
    root.innerHTML = `<div class="dt">
      <div class="sh-tabs dt-tabs">${[["today", "今天"], ...(S.mode === "cut" ? [["sport", "运动"]] : []), ["body", "身体"]].map(([k, n]) => `<button type="button" data-tab="${k}" class="${tab === k ? "is-on" : ""}">${n}</button>`).join("")}</div>
      <div class="dt-panel"></div></div>`;
    const p = root.querySelector(".dt-panel");
    if (tab === "sport" && S.mode !== "cut") tab = "today";
    if (tab === "today") p.innerHTML = todayHtml();
    if (tab === "sport") p.innerHTML = sportHtml();
    if (tab === "body") p.innerHTML = bodyHtml();
  }

  function ringHtml(eaten, goal) {
    const pct = Math.min(1, goal ? eaten / goal : 0);
    const over = eaten > goal;
    return `<div class="dt-ring ${over ? "is-over" : ""}" style="--p:${Math.round(pct * 360)}deg"><div><b>${over ? "+" + (eaten - goal) : goal - eaten}</b><small>${over ? "超出 kcal" : "还能吃 kcal"}</small></div></div>`;
  }

  function todayHtml() {
    const day = today();
    const c = calc();
    const plan = S.plans[day];
    const lg = logOf(day);
    const eaten = eatenKcal(day);
    const cut = S.mode === "cut";
    return `<div class="dt-hero">
        ${ringHtml(eaten, c.kcal)}
        <div class="dt-hero-txt">
          <p class="fun-kicker">${cut ? "减脂模式 · 每日摄入" : "正常饮食 · 每日建议"}</p>
          <strong>${c.kcal} kcal</strong>
          <small>已吃 ${eaten} kcal</small>
          <small>蛋白质 ${c.protein}g · 脂肪 ${c.fat}g · 碳水 ${c.carb}g</small>
        </div>
      </div>
      ${cut && c.lowBmi ? `<p class="fun-note warn">你现在的 BMI 是 ${c.bmi}，已经偏瘦了，不建议再减。这里按维持体重来安排，好好吃饭 🍚</p>` : ""}
      ${cut && !c.lowBmi && c.deficit === 0 ? `<p class="fun-note">已经达到理想体重啦，现在按维持体重来安排。</p>` : ""}
      ${plan ? `<p class="dt-note">💧 今天喝水：${esc(plan.water)}${plan.note ? `<br/>✨ ${esc(plan.note)}` : ""}</p>` : ""}
      ${plan
        ? plan.meals
            .map((m) => {
              const meta = MEALS.find((x) => x[0] === m.key);
              const sum = m.items.reduce((a, b) => a + b.kcal, 0);
              const done = lg.done.includes(m.key);
              return `<div class="dt-meal ${done ? "is-done" : ""}">
                <div class="dt-meal-head"><span>${meta[2]} <b>${meta[1]}</b> <small>${sum} kcal</small></span><button type="button" class="dt-check" data-a="done" data-k="${m.key}">${done ? "✓ 吃了" : "打卡"}</button></div>
                <ul>${m.items.map((it) => `<li><span>${esc(it.name)}<small>${esc(it.amount)}</small></span><em>${it.kcal}</em></li>`).join("")}</ul>
                ${m.tip ? `<p class="dt-tip">${esc(m.tip)}</p>` : ""}</div>`;
            })
            .join("")
        : `<div class="dt-empty"><p>今天的菜单还没生成</p></div>`}
      <div class="dt-row"><button type="button" class="fun-btn solid" data-a="plan" ${busy ? "disabled" : ""}>${busy === "plan" ? "正在配餐…" : plan ? "↻ 换一套菜单" : "生成今天的菜单"}</button></div>
      <p class="fun-kicker">额外吃的</p>
      ${lg.extra.length ? `<ul class="dt-extra">${lg.extra.map((x) => `<li><span>${esc(x.name)}${x.amount ? `<small>${esc(x.amount)}</small>` : ""}</span><em>${x.kcal}</em><button type="button" data-a="delx" data-id="${x.id}">✕</button></li>`).join("")}</ul>` : `<p class="fun-note">菜单外吃了别的，记在这里。</p>`}
      <div class="dt-add"><input id="dt-xname" maxlength="30" placeholder="吃了什么，比如：一杯珍珠奶茶" /><input id="dt-xkcal" type="number" inputmode="numeric" placeholder="kcal" /><button type="button" class="fun-btn ghost sm" data-a="est" ${busy ? "disabled" : ""}>${busy === "est" ? "…" : "AI 估"}</button><button type="button" class="fun-btn solid sm" data-a="addx">记</button></div>
      <div class="dt-row"><button type="button" class="fun-btn ghost sm" data-a="mode">切换模式 / 改资料</button></div>`;
  }

  function sportHtml() {
    const c = calc();
    const sp = S.sport;
    const wd = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][new Date().getDay()];
    return `<p class="fun-note">每天运动额外消耗约 200~300 kcal，配合饮食缺口 ${c.deficit} kcal，${c.weeks ? `大约 <b>${c.weeks} 周</b>能到 ${c.target} kg（每周 0.5~0.8 kg 左右，慢一点更不容易反弹）` : "按自己的节奏来"}。</p>
      ${sp
        ? sp.days
            .map((d) => `<div class="dt-meal ${d.day === wd ? "is-today" : ""}"><div class="dt-meal-head"><span><b>${esc(d.day)}</b>${d.day === wd ? " <small>今天</small>" : ""}</span><small>${d.rest ? "休息日" : d.items.reduce((a, b) => a + b.kcal, 0) + " kcal"}</small></div>
              ${d.rest && !d.items.length ? `<p class="dt-tip">好好休息，散散步拉伸一下就好</p>` : `<ul>${d.items.map((it) => `<li><span>${esc(it.name)}<small>${esc(it.detail)}</small></span><em>${it.kcal || ""}</em></li>`).join("")}</ul>`}</div>`)
            .join("") + (sp.tips.length ? `<p class="fun-kicker">注意</p><ul class="dt-tips">${sp.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : "")
        : `<div class="dt-empty"><p>还没有运动计划</p></div>`}
      <div class="dt-row"><button type="button" class="fun-btn solid" data-a="sport" ${busy ? "disabled" : ""}>${busy === "sport" ? "正在安排…" : sp ? "↻ 重新安排一周运动" : "生成一周运动计划"}</button></div>`;
  }

  function bodyHtml() {
    const c = calc();
    const p = S.prof;
    const ws = S.weights.slice(-30);
    let chart = "";
    if (ws.length >= 2) {
      const vals = ws.map((x) => x.w);
      const lo = Math.min(...vals, S.mode === "cut" ? c.target : Infinity) - 0.5;
      const hi = Math.max(...vals) + 0.5;
      const W = 300;
      const H = 110;
      const X = (i) => 10 + (i * (W - 20)) / (ws.length - 1);
      const Y = (v) => H - 10 - ((v - lo) * (H - 20)) / (hi - lo || 1);
      chart = `<svg class="dt-chart" viewBox="0 0 ${W} ${H}">${S.mode === "cut" ? `<line x1="10" x2="${W - 10}" y1="${Y(c.target)}" y2="${Y(c.target)}" class="dt-goal"/>` : ""}<polyline points="${ws.map((x, i) => `${X(i)},${Y(x.w)}`).join(" ")}"/>${ws.map((x, i) => `<circle cx="${X(i)}" cy="${Y(x.w)}" r="2.6"/>`).join("")}</svg>`;
    }
    return `<div class="dt-stats">
        <div><small>BMI</small><b>${c.bmi}</b><em>${bmiTag(c.bmi)}</em></div>
        <div><small>基础代谢</small><b>${c.bmr}</b><em>kcal</em></div>
        <div><small>每日消耗</small><b>${c.tdee}</b><em>kcal</em></div>
      </div>
      <p class="fun-note">健康体重范围：${c.healthyLow} ~ ${c.healthyHigh} kg。${S.mode === "cut" ? `每日摄入不会低于 ${c.minSafe} kcal（低于这个容易掉肌肉、反弹）。` : ""}${c.targetNote ? "<br/>" + esc(c.targetNote) : ""}</p>
      <p class="fun-kicker">体重记录</p>
      ${chart || `<p class="fun-note">记两次以上就能看到曲线。</p>`}
      <div class="dt-add"><input id="dt-w" type="number" step="0.1" inputmode="decimal" placeholder="今天的体重 kg" value="" /><button type="button" class="fun-btn solid sm" data-a="logw">记录</button></div>
      ${ws.length ? `<ul class="dt-extra">${ws.slice().reverse().slice(0, 8).map((x) => `<li><span>${esc(x.d)}</span><em>${x.w} kg</em></li>`).join("")}</ul>` : ""}
      <p class="fun-note">当前资料：${p.sex === "m" ? "男" : "女"} · ${p.age} 岁 · ${p.height} cm · ${p.weight} kg${S.mode === "cut" ? ` · 理想 ${p.target} kg` : ""}</p>
      <div class="dt-row"><button type="button" class="fun-btn ghost sm" data-a="mode">切换模式 / 改资料</button></div>`;
  }

  function renderSetup() {
    const p = S.prof;
    let mode = S.mode || "normal";
    root.innerHTML = `<div class="fun-setup dt-setup"><div class="fun-hero">🥗</div>
      <p class="fun-kicker">MEOW DIET</p><h2 class="fun-h2">今天想怎么吃？</h2>
      <div class="dt-modes">
        <button type="button" data-mode="normal" class="${mode === "normal" ? "is-on" : ""}"><b>🍚 正常饮食</b><small>营养均衡，按身体需要吃够</small></button>
        <button type="button" data-mode="cut" class="${mode === "cut" ? "is-on" : ""}"><b>🔥 减脂模式</b><small>算好每日摄入，配饮食和运动</small></button>
      </div>
      <div class="dt-form">
        <label class="fun-field"><span>性别</span><select id="dt-sex"><option value="f" ${p.sex !== "m" ? "selected" : ""}>女</option><option value="m" ${p.sex === "m" ? "selected" : ""}>男</option></select></label>
        <label class="fun-field"><span>年龄</span><input id="dt-age" type="number" inputmode="numeric" value="${esc(p.age)}" /></label>
        <label class="fun-field"><span>身高 cm</span><input id="dt-h" type="number" inputmode="decimal" value="${esc(p.height)}" /></label>
        <label class="fun-field"><span>体重 kg</span><input id="dt-wt" type="number" step="0.1" inputmode="decimal" value="${esc(p.weight)}" /></label>
        <label class="fun-field dt-cut-only"><span>理想体重 kg</span><input id="dt-tg" type="number" step="0.1" inputmode="decimal" value="${esc(p.target)}" /></label>
      </div>
      <label class="fun-field"><span>平时活动量</span><select id="dt-act">${ACTS.map(([v, n]) => `<option value="${v}" ${String(p.act) === v ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label class="fun-field"><span>喜欢吃的（可不填）</span><input id="dt-likes" maxlength="60" value="${esc(p.likes || "")}" placeholder="比如：面食、鸡肉、川味" /></label>
      <label class="fun-field"><span>忌口 / 过敏（可不填）</span><input id="dt-avoid" maxlength="60" value="${esc(p.avoid || "")}" placeholder="比如：不吃香菜、海鲜过敏、素食" /></label>
      <p class="fun-note dt-preview"></p>
      ${F.hasApiKey() ? "" : `<p class="fun-note warn">没有填 API Key：能算每日热量，但菜单和运动计划需要 API 才能生成。</p>`}
      <div class="fun-setup-btns"><button type="button" class="fun-btn solid" id="dt-go">开始</button></div></div>`;
    const read = () => ({
      sex: root.querySelector("#dt-sex").value,
      age: Math.min(100, Math.max(12, Number(root.querySelector("#dt-age").value) || 22)),
      height: Math.min(230, Math.max(120, Number(root.querySelector("#dt-h").value) || 165)),
      weight: Math.min(300, Math.max(30, Number(root.querySelector("#dt-wt").value) || 55)),
      target: Number(root.querySelector("#dt-tg").value) || 0,
      act: root.querySelector("#dt-act").value,
      likes: root.querySelector("#dt-likes").value.trim(),
      avoid: root.querySelector("#dt-avoid").value.trim()
    });
    const preview = () => {
      root.querySelectorAll(".dt-cut-only").forEach((el) => (el.hidden = mode !== "cut"));
      const np = read();
      if (mode === "cut" && !np.target) np.target = np.weight;
      const c = calc(np, mode);
      let t = `BMI ${c.bmi}（${bmiTag(c.bmi)}）· 每日${mode === "cut" ? "摄入" : "建议"} <b>${c.kcal} kcal</b>`;
      if (mode === "cut") {
        if (c.lowBmi) t += `<br/>现在已经偏瘦了，不建议减脂，会按维持体重来安排。`;
        else if (c.deficit) t += `（比消耗少 ${c.deficit} kcal）<br/>配合运动，约 ${c.weeks} 周到 ${c.target} kg`;
        if (c.targetNote) t += `<br/>${esc(c.targetNote)}`;
      }
      root.querySelector(".dt-preview").innerHTML = t;
    };
    preview();
    root.querySelector(".dt-setup").addEventListener("input", preview);
    root.querySelector(".dt-setup").addEventListener("change", preview);
    root.querySelectorAll("[data-mode]").forEach(
      (b) =>
        (b.onclick = () => {
          mode = b.dataset.mode;
          root.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("is-on", x === b));
          preview();
        })
    );
    root.querySelector("#dt-go").onclick = () => {
      const np = read();
      if (mode === "cut" && !np.target) return toast("填一下理想体重");
      if (mode === "cut") {
        const lowT = calc(np, mode).healthyLow;
        if (np.target < lowT) {
          np.target = lowT;
          toast(`理想体重调到健康范围的下限 ${lowT} kg`);
        }
      }
      const changed = JSON.stringify(np) !== JSON.stringify(S.prof) || mode !== S.mode;
      S.prof = np;
      S.mode = mode;
      if (changed) {
        delete S.plans[today()];
        if (mode === "cut") S.sport = null;
      }
      const d = today();
      if (!S.weights.length || S.weights[S.weights.length - 1].w !== np.weight) {
        S.weights = S.weights.filter((x) => x.d !== d);
        S.weights.push({ d, w: np.weight });
      }
      save();
      editing = false;
      tab = "today";
      render();
      if (changed && F.hasApiKey()) void run("plan");
    };
  }

  async function run(kind) {
    if (busy) return;
    if (!F.hasApiKey()) return toast("请先在设置里填写 API Key");
    busy = kind;
    render();
    try {
      if (kind === "plan") await genPlan(today());
      if (kind === "sport") await genSport();
    } catch (err) {
      toast("生成失败：" + err.message);
    } finally {
      busy = "";
      render();
    }
  }

  async function onClick(e) {
    const t = e.target.closest("[data-tab]");
    if (t) {
      tab = t.dataset.tab;
      return render();
    }
    const b = e.target.closest("[data-a]");
    const a = b?.dataset.a;
    if (!a) return;
    const day = today();
    if (a === "plan" || a === "sport") return void run(a);
    if (a === "mode") {
      editing = true;
      return render();
    }
    if (a === "done") {
      const lg = logOf(day);
      const k = b.dataset.k;
      lg.done = lg.done.includes(k) ? lg.done.filter((x) => x !== k) : [...lg.done, k];
      save();
      return render();
    }
    if (a === "delx") {
      const lg = logOf(day);
      lg.extra = lg.extra.filter((x) => x.id !== b.dataset.id);
      save();
      return render();
    }
    if (a === "est") {
      const name = root.querySelector("#dt-xname").value.trim();
      if (!name) return toast("先写吃了什么");
      if (!F.hasApiKey()) return toast("请先在设置里填写 API Key");
      busy = "est";
      b.disabled = true;
      b.textContent = "…";
      try {
        const r = await estimateKcal(name);
        busy = "";
        const lg = logOf(day);
        lg.extra.push({ id: uid(), name, amount: r.amount, kcal: r.kcal });
        save();
        toast(`约 ${r.kcal} kcal，已记上`);
      } catch (err) {
        busy = "";
        toast("估算失败：" + err.message);
      }
      return render();
    }
    if (a === "addx") {
      const name = root.querySelector("#dt-xname").value.trim();
      const kcal = Math.round(Number(root.querySelector("#dt-xkcal").value));
      if (!name) return toast("先写吃了什么");
      if (!kcal || kcal < 0) return toast("填一下热量，或者点「AI 估」");
      logOf(day).extra.push({ id: uid(), name, amount: "", kcal: Math.min(kcal, 5000) });
      save();
      return render();
    }
    if (a === "logw") {
      const w = r1(Number(root.querySelector("#dt-w").value));
      if (!w || w < 25 || w > 300) return toast("填一个正常的体重");
      S.weights = S.weights.filter((x) => x.d !== day);
      S.weights.push({ d: day, w });
      if (S.weights.length > 120) S.weights = S.weights.slice(-120);
      S.prof.weight = w;
      save();
      toast(S.mode === "cut" && w <= calc().target ? "到理想体重啦 🎉 接下来按维持体重来吃" : "记好了");
      return render();
    }
  }

  F.register("饮食", {
    title: "饮食",
    kicker: "DIET · 吃好每一餐",
    mount(body) {
      root = document.createElement("div");
      root.className = "dt-root";
      body.appendChild(root);
      root.addEventListener("click", onClick);
      render();
    },
    unmount() {
      root = null;
    }
  });
})();
