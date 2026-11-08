"use strict";

/**
 * 柚子 · 经期记录
 * - 记录每次经期的开始 / 结束，自动算平均周期，预测下次经期和易孕期
 * - 选一位角色在经期快来时提醒你
 *   · 与记忆共通：提醒会作为 TA 的消息发进你们的聊天（TA 以后记得，也能接着聊）
 *   · 不共通：提醒只出现在柚子里，聊天记录不受影响
 * - 数据只存在这台设备上
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast } = F;
  const KV = "yuzu_v1";
  const DAY = 86400000;

  const iso = (d) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  };
  const parse = (s) => {
    const [y, m, d] = String(s).split("-").map(Number);
    return new Date(y, m - 1, d).getTime();
  };
  const today = () => iso(Date.now());
  const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / DAY);
  const addDays = (s, n) => iso(parse(s) + n * DAY);
  const md = (s) => {
    const [, m, d] = s.split("-").map(Number);
    return `${m}月${d}日`;
  };

  let S = null;
  async function load() {
    if (S) return S;
    try {
      S = (await F.FunDB.get(KV)) || null;
    } catch (_) {
      S = null;
    }
    S = Object.assign({ records: [], periodLen: 5, cycleLen: 28, manual: false, daily: {}, remind: { on: false, charId: "", daysBefore: 2, memory: true, lastFor: "" }, notes: [] }, S || {});
    S.daily = S.daily || {};
    S.remind = Object.assign({ on: false, charId: "", daysBefore: 2, memory: true, lastFor: "", body: false, bodyFor: "" }, S.remind || {});
    return S;
  }
  const save = () => F.FunDB.set(KV, S).catch(() => toast("保存失败"));
  const sorted = () => S.records.slice().sort((a, b) => (a.start < b.start ? -1 : 1));

  /** 平均周期 / 经期天数（用最近 6 次） */
  function stats() {
    const r = sorted();
    const gaps = [];
    for (let i = 1; i < r.length; i++) {
      const g = diffDays(r[i].start, r[i - 1].start);
      if (g >= 18 && g <= 60) gaps.push(g);
    }
    if (S.manual) return { cycle: S.cycleLen, plen: S.periodLen, n: r.length, manual: true };
    const g6 = gaps.slice(-6);
    const cycle = g6.length ? Math.round(g6.reduce((a, b) => a + b, 0) / g6.length) : S.cycleLen;
    const lens = r.filter((x) => x.end).map((x) => diffDays(x.end, x.start) + 1).filter((n) => n > 0 && n < 15).slice(-6);
    const plen = lens.length ? Math.round(lens.reduce((a, b) => a + b, 0) / lens.length) : S.periodLen;
    return { cycle, plen, n: r.length, auto: g6.length > 0 || lens.length > 0 };
  }
  /** 当前状态 + 预测 */
  function predict() {
    const r = sorted();
    const st = stats();
    const last = r[r.length - 1];
    if (!last) return { st, last: null };
    const t = today();
    const inPeriod = !last.end ? diffDays(t, last.start) < 12 : t >= last.start && t <= last.end;
    let next = addDays(last.start, st.cycle);
    while (diffDays(next, t) < -st.plen) next = addDays(next, st.cycle); // 很久没记：往后推
    const ovu = addDays(next, -14);
    return { st, last, inPeriod, dayN: diffDays(t, last.start) + 1, next, until: diffDays(next, t), ovu, fertile: [addDays(ovu, -5), addDays(ovu, 1)] };
  }
  function dayKind(d, p) {
    const r0 = sorted();
    for (const r of r0) {
      // 没点结束的那次：算到今天为止（最多 12 天）
      const end = r.end || (r === r0[r0.length - 1] ? iso(Math.min(parse(today()), parse(addDays(r.start, 11)))) : addDays(r.start, p.st.plen - 1));
      if (d >= r.start && d <= end) return "period";
    }
    if (!p.last) return "";
    if (d >= p.next && d <= addDays(p.next, p.st.plen - 1)) return "predict";
    if (d === p.ovu) return "ovu";
    if (d >= p.fertile[0] && d <= p.fertile[1]) return "fertile";
    return "";
  }

  /* ───── 角色提醒 ───── */
  async function makeReminder(ch, p, user) {
    const daysLeft = p.until;
    const when = daysLeft > 0 ? `大概还有 ${daysLeft} 天（${md(p.next)}左右）` : daysLeft === 0 ? "预计就是今天" : `预计已经过了 ${-daysLeft} 天，可能快来了`;
    if (F.hasApiKey()) {
      try {
        const t = await F.aiText(
          [
            {
              role: "system",
              content: `你是「${ch.name}」。${ch.persona ? "人设：\n" + ch.persona + "\n" : ""}${F.recordSummary ? F.recordSummary(ch.name) : ""}
你记得「${user.name}」的经期，现在主动发消息提醒 TA 经期快到了。按你的性格和你们的关系来说（可以别扭、可以温柔、可以唠叨），要具体关心：比如备好卫生巾、别吃冰的、注意保暖、少熬夜、肚子疼就喝热水 / 告诉你。像微信聊天一样口语化，可以分 2~3 条，用 ||| 分隔，每条不超过 40 字。只输出你发的消息。`
            },
            { role: "user", content: `她的经期${when}。平均周期 ${p.st.cycle} 天，一般持续 ${p.st.plen} 天。发消息提醒吧。` }
          ],
          { maxTokens: 300, temperature: 0.85 }
        );
        const out = F.cleanLine ? String(t).replace(/^["「]|["」]$/g, "").trim() : t;
        if (out) return out;
      } catch (_) {
        /* 用下面的兜底 */
      }
    }
    return `经期${daysLeft > 0 ? `大概还有 ${daysLeft} 天` : "快到了"}|||记得把卫生巾放包里，这几天别吃冰的、少熬夜|||肚子疼要跟我说`;
  }
  /** 检查要不要提醒（打开 App 时 + 每小时一次） */
  async function checkRemind(force) {
    await load();
    const R = S.remind;
    if (!R.on || !R.charId) return force ? toast("先打开提醒并选一位角色") : null;
    const p = predict();
    if (!p.last) return force ? toast("先记录一次经期，才能预测下次") : null;
    const due = p.until <= R.daysBefore && p.until >= -2 && !p.inPeriod;
    if (!force && (!due || R.lastFor === p.next)) return;
    const cast = await F.loadCast();
    const ch = cast.find((c) => c.id === R.charId);
    if (!ch) return force ? toast("找不到这个角色了，重新选一下") : null;
    const user = await F.loadUser();
    const text = await makeReminder(ch, p, user);
    let toChat = false;
    if (R.memory && typeof window.mxPushCharMessage === "function") {
      toChat = await window.mxPushCharMessage(ch.id, text).catch(() => false);
    }
    S.notes.unshift({ at: Date.now(), from: ch.name, text, toChat });
    S.notes = S.notes.slice(0, 30);
    if (!force) R.lastFor = p.next;
    await save();
    if (toChat) toast(`${ch.name} 给你发了消息提醒经期`);
    else toast(`${ch.name}：${text.split("|||")[0]}`);
    if (root) draw();
    if (R.memory && !toChat) toast(`没找到和 ${ch.name} 的聊天，提醒先放在柚子里了`);
  }

  /* ───── 界面 ───── */
  let root = null;
  let view = new Date();
  view.setDate(1);
  function calHtml(p) {
    const y = view.getFullYear();
    const m = view.getMonth();
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push(`<span></span>`);
    for (let d = 1; d <= days; d++) {
      const s = iso(new Date(y, m, d));
      const k = dayKind(s, p);
      cells.push(`<button type="button" class="yz-d ${k ? "is-" + k : ""}${s === today() ? " is-today" : ""}${S.daily[s] ? " has-log" : ""}" data-d="${s}">${d}</button>`);
    }
    return `<div class="yz-cal"><div class="yz-cal-h"><button type="button" data-m="-1">‹</button><b>${y} 年 ${m + 1} 月</b><button type="button" data-m="1">›</button></div>
      <div class="yz-wk">${"日一二三四五六".split("").map((w) => `<span>${w}</span>`).join("")}</div><div class="yz-grid">${cells.join("")}</div>
      <div class="yz-legend"><span class="is-period">经期</span><span class="is-predict">预测经期</span><span class="is-fertile">易孕期</span><span class="is-ovu">排卵日</span></div></div>`;
  }
  let tab = "cycle";

  /* ───── 设定周期 / 经期长度 ───── */
  function editLens() {
    const st = stats();
    let cyc = S.manual ? S.cycleLen : st.cycle;
    let pl = S.manual ? S.periodLen : st.plen;
    let manual = S.manual;
    const sh = F.openSheet(
      `<div class="yz-mode"><button type="button" data-mode="auto">按我的记录自动算</button><button type="button" data-mode="manual">用我自己设定的</button></div>
       <p class="fun-note" id="yz-mode-note"></p>
       <div class="yz-step"><span>平均周期</span><button type="button" data-st="c-">−</button><b id="yz-c"></b><button type="button" data-st="c+">＋</button><small>天（两次经期开始日之间）</small></div>
       <div class="yz-step"><span>经期长度</span><button type="button" data-st="p-">−</button><b id="yz-p"></b><button type="button" data-st="p+">＋</button><small>天（每次流血几天）</small></div>
       <p class="fun-note">一般周期在 21~35 天、经期 2~7 天都算常见范围。改了之后，预测的下次经期、易孕期都会跟着变。</p>
       <div class="fun-sheet-actions"><button type="button" class="fun-btn solid" data-ok>保存</button></div>`,
      { title: "周期设定" }
    );
    const paint = () => {
      sh.body.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("is-on", (b.dataset.mode === "manual") === manual));
      sh.body.querySelector("#yz-mode-note").textContent = manual
        ? "预测会一直用下面你设的天数。"
        : st.n >= 2
          ? "根据你最近几次记录自动算平均值（下面的数字是没有记录时的默认值）。"
          : "记录还不够两次，先用下面的天数预测；记多了会自动按记录算。";
      sh.body.querySelector("#yz-c").textContent = cyc;
      sh.body.querySelector("#yz-p").textContent = pl;
    };
    paint();
    sh.body.addEventListener("click", async (e) => {
      const m = e.target.closest("[data-mode]");
      if (m) {
        manual = m.dataset.mode === "manual";
        return paint();
      }
      const b = e.target.closest("[data-st]")?.dataset.st;
      if (b === "c-") cyc = Math.max(15, cyc - 1);
      if (b === "c+") cyc = Math.min(60, cyc + 1);
      if (b === "p-") pl = Math.max(1, pl - 1);
      if (b === "p+") pl = Math.min(14, pl + 1);
      if (b) return paint();
      if (e.target.closest("[data-ok]")) {
        S.manual = manual;
        S.cycleLen = cyc;
        S.periodLen = pl;
        S.remind.lastFor = "";
        await save();
        sh.close();
        toast(manual ? `已设定：周期 ${cyc} 天，经期 ${pl} 天` : "已改成按记录自动算");
        draw();
      }
    });
  }

  /* ───── 女性健康 ───── */
  const FLOW = ["无", "少", "中", "多"];
  const PAIN = ["不痛", "有点痛", "比较痛", "很痛"];
  const MOODS = ["😊", "😐", "😔", "😣", "😤", "🥱"];
  const SYMS = ["腹痛", "腰酸", "头痛", "乳房胀痛", "长痘", "疲惫", "失眠", "腹胀", "情绪低落", "烦躁", "食欲大", "怕冷", "白带变化"];
  function phaseOf(p) {
    if (!p.last) return null;
    if (p.inPeriod) return "period";
    const t = today();
    if (t === p.ovu || (t >= p.fertile[0] && t <= p.fertile[1])) return "ovu";
    if (t < p.ovu) return "follicular";
    return "luteal";
  }
  const PHASES = {
    period: {
      n: "经期",
      e: "🩸",
      tips: ["注意保暖，肚子不舒服可以热敷", "多喝温水，吃点含铁的食物（红肉、动物肝脏、深绿色蔬菜）", "可以散步、做拉伸，不用硬撑剧烈运动", "卫生巾 2~4 小时换一次，棉条最长不超过 8 小时", "睡够觉，少吃冰的和太辣的"]
    },
    follicular: {
      n: "卵泡期（经期后）",
      e: "🌱",
      tips: ["精力通常会慢慢回升，适合安排运动和学习", "保持规律作息和饮食", "经期刚结束几天是做乳房自检的好时候"]
    },
    ovu: {
      n: "排卵期附近",
      e: "🌸",
      tips: ["这几天比较容易怀孕，有需要请做好避孕（日历预测不能代替避孕）", "白带可能变多、变清透拉丝，属于常见现象", "有的人会有一侧小腹轻微隐痛"]
    },
    luteal: {
      n: "黄体期（经前）",
      e: "🍂",
      tips: ["经前可能会胀、长痘、情绪起伏，对自己温柔一点", "少吃太咸的食物可以减轻水肿", "适量运动、规律睡眠有助于缓解经前不适", "提前备好卫生用品"]
    }
  };
  const KNOW = [
    ["缓解痛经", "热敷小腹、轻度运动、规律作息都有帮助。可以按说明书用布洛芬这类非处方止痛药（有胃病、过敏或在用其他药先问医生）。"],
    ["经期卫生", "卫生巾 2~4 小时换一次；棉条按需更换、最长不超过 8 小时，不要过夜超时使用；月经杯按说明清洗消毒。"],
    ["乳房自检", "每月一次，经期结束后几天做：看外形和皮肤有没有变化，用指腹画圈摸有没有硬块，挤压乳头看有没有异常分泌物。"],
    ["定期检查", "有性生活后，按医生建议定期做妇科检查和宫颈癌筛查（TCT / HPV）。适龄可以接种 HPV 疫苗。"],
    ["记录的意义", "连续记录几个月，看医生时把周期、经期天数、症状告诉医生，会很有帮助。"]
  ];
  const DOCTOR = [
    "周期经常短于 21 天或长于 35 天",
    "经期超过 7 天还没结束",
    "量特别多：1~2 小时就湿透一片卫生巾，或有很大的血块",
    "痛到影响上学上班、吃止痛药也不管用",
    "两次经期之间出血，或性生活后出血",
    "没怀孕却超过 3 个月没来月经",
    "用棉条时突然高烧、起皮疹、头晕呕吐（要马上就医）"
  ];
  function healthHtml(p) {
    const ph = PHASES[phaseOf(p)] || null;
    const t = today();
    const dl = S.daily[t];
    const recentDays = Object.keys(S.daily).sort().slice(-60);
    const cnt = {};
    recentDays.forEach((d) => (S.daily[d].syms || []).forEach((x) => (cnt[x] = (cnt[x] || 0) + 1)));
    const top = Object.entries(cnt)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return `
      <section class="yz-card yz-phase">${ph ? `<h3>${ph.e} 现在是：${ph.n}</h3><ul>${ph.tips.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<h3>🌷 阶段小贴士</h3><p class="fun-note">先在「经期」里记一次经期，这里会按你现在所处的阶段给建议。</p>`}</section>
      ${bodyCardHtml()}
      <section class="yz-card"><h3>📝 今天的身体记录</h3>
        ${dl ? `<div class="yz-daysum">${dayLine(dl)}</div>` : `<p class="fun-note">记一下今天的感觉，攒多了就能看出规律。</p>`}
        <button type="button" class="fun-btn solid" data-a="logday" data-day="${t}">${dl ? "修改今天的记录" : "记录今天"}</button>
        ${recentDays.length ? `<div class="yz-dlist">${recentDays.slice(-7).reverse().map((d) => `<button type="button" data-logd="${d}"><small>${md(d)}</small><span>${dayLine(S.daily[d])}</span></button>`).join("")}</div>` : ""}
      </section>
      ${top.length ? `<section class="yz-card"><h3>📊 最近常出现的症状</h3><div class="yz-top">${top.map(([k, n]) => `<span>${esc(k)}<b>${n} 天</b></span>`).join("")}</div></section>` : ""}
      <section class="yz-card"><h3>📖 健康小知识</h3>${KNOW.map(([h, b]) => `<details class="yz-know"><summary>${esc(h)}</summary><p>${esc(b)}</p></details>`).join("")}</section>
      <section class="yz-card yz-doc"><h3>🏥 出现这些情况，建议去看医生</h3><ul>${DOCTOR.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>
      <p class="fun-note yz-foot">这里是一般的健康常识，不能代替医生的诊断。身体不舒服请及时就医。所有记录只保存在这台设备上。</p>`;
  }
  let castCache = [];
  function bodyCardHtml() {
    const R = S.remind;
    const ch = castCache.find((c) => c.id === R.charId);
    return `<section class="yz-card"><h3>💗 身体不舒服时让 TA 知道</h3>
      <label class="fun-switch"><input type="checkbox" id="yz-body" ${R.body ? "checked" : ""}/><span>${R.body ? `开着：${ch ? esc(ch.name) : "TA"}会知道` : "关着：TA 不知道"}</span></label>
      <div class="yz-cast">${castCache.length ? castCache.map((c) => `<button type="button" class="fun-chip-btn${R.charId === c.id ? " is-on" : ""}" data-c="${esc(c.id)}">${F.avHtml ? F.avHtml(c, "fun-av sm") : ""}${esc(c.name)}</button>`).join("") : `<p class="fun-note">角色库里还没有角色</p>`}</div>
      <p class="fun-note">${R.body ? `你记录今天痛、有症状或者心情不好时，${ch ? esc(ch.name) : "TA"}会知道，${R.memory ? "并在你们的聊天里发消息关心你（TA 会记得）" : "在柚子里给你留一句关心"}。` : "打开以后，你记录身体不舒服时，选中的角色会知道并来关心你。和「经期」页的提醒用的是同一位角色。"}</p>
    </section>`;
  }
  const isUnwell = (x) => x && (x.pain >= 1 || (x.syms || []).length || ["😣", "😔", "😤", "🥱"].includes(x.mood) || x.flow >= 3);
  /** 记了不舒服：让角色知道（只对今天的记录，每天同样的内容只说一次） */
  async function tellChar(d, x) {
    const R = S.remind;
    if (!R.body || !R.charId || d !== today() || !isUnwell(x)) return;
    const sig = d + "|" + x.pain + "|" + (x.syms || []).join(",") + "|" + x.mood + "|" + x.flow;
    if (R.bodyFor === sig) return;
    const cast = castCache.length ? castCache : await F.loadCast();
    const ch = cast.find((c) => c.id === R.charId);
    if (!ch) return;
    const user = await F.loadUser();
    const p = predict();
    const how = [x.flow ? "流量" + FLOW[x.flow] : "", x.pain ? PAIN[x.pain] : "", (x.syms || []).length ? "有" + x.syms.join("、") : "", x.mood ? "心情 " + x.mood : "", x.note ? "她说：" + x.note : ""].filter(Boolean).join("，");
    let text = "";
    if (F.hasApiKey()) {
      try {
        text = await F.aiText(
          [
            {
              role: "system",
              content: `你是「${ch.name}」。${ch.persona ? "人设：\n" + ch.persona + "\n" : ""}${F.recordSummary ? F.recordSummary(ch.name) : ""}
你知道了「${user.name}」今天身体不太舒服${p.inPeriod ? "（正在经期）" : ""}。按你的性格和你们的关系，主动发消息关心 TA：具体一点（热水、热敷、休息、想吃什么、要不要陪着），别说教，不要像医生。像微信聊天，口语化，可以分 2~3 条，用 ||| 分隔，每条不超过 40 字。只输出你发的消息。`
            },
            { role: "user", content: `${user.name}今天的情况：${how}。` }
          ],
          { maxTokens: 300, temperature: 0.85 }
        );
      } catch (_) {
        text = "";
      }
    }
    if (!text) text = `今天是不是不太舒服|||热水喝了没，肚子疼就先躺着别硬撑|||想吃什么跟我说`;
    let toChat = false;
    if (R.memory && typeof window.mxPushCharMessage === "function") toChat = await window.mxPushCharMessage(ch.id, text).catch(() => false);
    S.notes.unshift({ at: Date.now(), from: ch.name, text, toChat });
    S.notes = S.notes.slice(0, 30);
    R.bodyFor = sig;
    await save();
    toast(toChat ? `${ch.name} 知道你不舒服，给你发了消息` : `${ch.name}：${text.split("|||")[0]}`);
    if (root) draw();
  }

  function dayLine(x) {
    if (!x) return "";
    return [x.mood || "", x.flow ? "流量" + FLOW[x.flow] : "", x.pain ? PAIN[x.pain] : "", (x.syms || []).join("、"), x.note ? "「" + esc(x.note) + "」" : ""].filter(Boolean).join(" · ");
  }
  function logDay(d) {
    const cur = Object.assign({ flow: 0, pain: 0, mood: "", syms: [], note: "" }, S.daily[d] || {});
    const sh = F.openSheet(
      `<p class="fun-kicker">流量</p><div class="yz-pick" data-k="flow">${FLOW.map((n, i) => `<button type="button" data-v="${i}">${n}</button>`).join("")}</div>
       <p class="fun-kicker">痛感</p><div class="yz-pick" data-k="pain">${PAIN.map((n, i) => `<button type="button" data-v="${i}">${n}</button>`).join("")}</div>
       <p class="fun-kicker">心情</p><div class="yz-pick yz-moods" data-k="mood">${MOODS.map((m) => `<button type="button" data-v="${m}">${m}</button>`).join("")}</div>
       <p class="fun-kicker">症状（可多选）</p><div class="yz-pick" data-k="syms">${SYMS.map((m) => `<button type="button" data-v="${m}">${m}</button>`).join("")}</div>
       <label class="fun-field"><span>备注</span><input id="yz-dnote" maxlength="60" value="${esc(cur.note)}" placeholder="比如：喝了红糖水好多了" /></label>
       <div class="fun-sheet-actions">${S.daily[d] ? `<button type="button" class="fun-btn ghost" data-del>删除这天</button>` : ""}<button type="button" class="fun-btn solid" data-ok>保存</button></div>`,
      { title: md(d) + " 的身体记录" }
    );
    const paint = () =>
      sh.body.querySelectorAll(".yz-pick").forEach((g) => {
        const k = g.dataset.k;
        g.querySelectorAll("[data-v]").forEach((b) => {
          const v = b.dataset.v;
          b.classList.toggle("is-on", k === "syms" ? cur.syms.includes(v) : String(cur[k]) === v);
        });
      });
    paint();
    sh.body.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-v]");
      if (b) {
        const k = b.closest(".yz-pick").dataset.k;
        const v = b.dataset.v;
        if (k === "syms") cur.syms = cur.syms.includes(v) ? cur.syms.filter((x) => x !== v) : [...cur.syms, v];
        else if (k === "mood") cur.mood = cur.mood === v ? "" : v;
        else cur[k] = Number(v);
        return paint();
      }
      if (e.target.closest("[data-del]")) {
        delete S.daily[d];
        await save();
        sh.close();
        return draw();
      }
      if (e.target.closest("[data-ok]")) {
        cur.note = sh.body.querySelector("#yz-dnote").value.trim();
        S.daily[d] = cur;
        await save();
        sh.close();
        toast("已记录");
        draw();
        void tellChar(d, cur);
      }
    });
  }

  /* ───── 健康社区（大家分享经验 / 提问 / 评论；存在站长的 Supabase 里） ───── */
  const CATS = ["全部", "痛经", "月经不调", "备孕", "避孕", "情绪", "日常护理", "妇科检查", "其他"];
  const FS = { cat: "全部", sort: "new", q: "", list: [], more: true, loading: false, err: "", open: null, detail: null, loaded: false };
  const lsGet = (k, d) => {
    try {
      return localStorage.getItem(k) ?? d;
    } catch (_) {
      return d;
    }
  };
  const lsSet = (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch (_) {
      /* ignore */
    }
  };
  let yzToken = lsGet("meowos_yz_token", "");
  if (!yzToken) {
    const a = new Uint8Array(20);
    (window.crypto || {}).getRandomValues?.(a);
    yzToken = [...a].map((b) => (b || Math.floor(Math.random() * 256)).toString(16).padStart(2, "0")).join("");
    lsSet("meowos_yz_token", yzToken);
  }
  let yzNick = lsGet("meowos_yz_nick", "") || "柚子" + Math.floor(1000 + Math.random() * 9000);
  lsSet("meowos_yz_nick", yzNick);
  const liked = new Set(JSON.parse(lsGet("meowos_yz_liked", "[]") || "[]"));
  const saveLiked = () => lsSet("meowos_yz_liked", JSON.stringify([...liked].slice(-500)));
  const sbCfg = () => {
    const c = window.MX_SHARE_CONFIG || {};
    return c.url && c.anonKey ? { url: String(c.url).replace(/\/+$/, ""), key: c.anonKey } : null;
  };
  async function yrpc(fn, args) {
    const c = sbCfg();
    if (!c) throw new Error("还没有配置资源站（Supabase）");
    let res;
    try {
      res = await fetch(c.url + "/rest/v1/rpc/" + fn, {
        method: "POST",
        headers: { apikey: c.key, ...(/^eyJ/.test(c.key) ? { Authorization: "Bearer " + c.key } : {}), "Content-Type": "application/json" },
        body: JSON.stringify(args)
      });
    } catch (_) {
      throw new Error("网络连不上社区服务器");
    }
    const t = await res.text();
    let d = null;
    try {
      d = t ? JSON.parse(t) : null;
    } catch (_) {
      d = t;
    }
    if (!res.ok) {
      if (res.status === 404 || (d && d.code === "PGRST202")) throw new Error("社区还没开通：站长需要在 Supabase 里运行一次 supabase-yuzu.sql");
      throw new Error((d && d.message) || "HTTP " + res.status);
    }
    return d;
  }
  const ago = (s) => {
    const t = (Date.now() - Date.parse(s)) / 1000;
    if (t < 60) return "刚刚";
    if (t < 3600) return Math.floor(t / 60) + " 分钟前";
    if (t < 86400) return Math.floor(t / 3600) + " 小时前";
    if (t < 86400 * 30) return Math.floor(t / 86400) + " 天前";
    const d = new Date(s);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  };
  const br = (s) => esc(s).replace(/\n/g, "<br>");

  /* ───── 路人帖 / 角色本地帖（只存在自己手机里，AI 生成） ───── */
  const NP = { list: null, busy: false };
  async function npLoad() {
    if (NP.list) return NP.list;
    try {
      NP.list = (await F.FunDB.get("yz_forum_npc")) || [];
    } catch (_) {
      NP.list = [];
    }
    return NP.list;
  }
  const npSave = () => F.FunDB.set("yz_forum_npc", (NP.list || []).slice(0, 80)).catch(() => {});
  const npId = () => "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const isLocalId = (id) => typeof id === "string" && /^n/.test(id);
  const npFind = (id) => (NP.list || []).find((x) => x.id === id);
  function npRows() {
    const q = FS.q.trim();
    return (NP.list || [])
      .filter((x) => (FS.cat === "全部" || x.cat === FS.cat) && (!q || (x.title + x.body).includes(q)) && (FS.sort !== "mine" || x.mine))
      .map((x) => ({
        id: x.id,
        local: true,
        tag: x.tag,
        cat: x.cat,
        title: x.title,
        preview: String(x.body || "").slice(0, 140),
        nick: x.nick,
        mine: !!x.mine,
        created_at: x.created_at,
        likes: x.likes || 0,
        comments: (x.comments || []).length
      }));
  }
  function mergedList() {
    const all = npRows().concat(FS.list);
    if (FS.sort === "hot") all.sort((a, b) => b.likes + b.comments * 2 - (a.likes + a.comments * 2));
    else all.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return all;
  }
  const sanitize = (t, n) => String(t || "").replace(/\s+$/g, "").slice(0, n);
  /** 刷新出几条路人帖（每条带 1~3 条路人评论） */
  async function refreshPasserby() {
    if (NP.busy) return;
    if (!F.hasApiKey()) return toast("先在设置里填好 API，路人才能来发帖");
    NP.busy = true;
    draw();
    try {
      await npLoad();
      const cats = CATS.slice(1);
      const want = FS.cat !== "全部" ? `这次都发在「${FS.cat}」分类。` : `分类从这些里挑，尽量不重复：${cats.join("、")}。`;
      const recent = NP.list.slice(0, 12).map((x) => x.title).join("；");
      const t = await F.aiText(
        [
          {
            role: "system",
            content: `你在模拟一个中文女性健康匿名论坛里的普通网友（路人）。生成 3 条新帖子，像真实网友：有人分享经验、有人提问求助、有人吐槽；语气口语、有生活细节（年龄段、学生/上班、试过的办法），可以带一点 emoji。内容要靠谱，不推销、不夸大偏方，涉及就医的要建议去看医生。${want}
每条帖子再配 1~3 条其他路人的评论（真诚的经验 / 安慰 / 追问）。昵称要像网名（不要真名），每条不同。
只输出 JSON 数组：[{"cat":"分类","nick":"发帖人网名","title":"标题(≤30字)","body":"正文(60~220字)","comments":[{"nick":"网名","body":"评论(≤80字)"}]}]`
          },
          { role: "user", content: `${recent ? "这些话题最近发过了，换点别的：" + recent : "开始吧"}` }
        ],
        { maxTokens: 1800, temperature: 1 }
      );
      const arr = F.parseJsonLoose(t);
      if (!Array.isArray(arr) || !arr.length) throw new Error("路人这次没想好，再刷一下试试");
      const now = Date.now();
      const got = [];
      arr.slice(0, 4).forEach((x, i) => {
        if (!x || !x.title || !x.body) return;
        const at = now - (i * 7 + Math.floor(Math.random() * 6)) * 60000;
        got.push({
          id: npId(),
          tag: "路人",
          cat: cats.includes(x.cat) ? x.cat : FS.cat !== "全部" ? FS.cat : "其他",
          nick: sanitize(x.nick || "路过的网友", 16),
          title: sanitize(x.title, 40),
          body: sanitize(x.body, 2000),
          created_at: new Date(at).toISOString(),
          likes: Math.floor(Math.random() * 30),
          comments: (Array.isArray(x.comments) ? x.comments : []).slice(0, 3).filter((c) => c && c.body).map((c, j) => ({
            id: npId(),
            nick: sanitize(c.nick || "热心网友", 16),
            body: sanitize(c.body, 500),
            created_at: new Date(at + (j + 1) * (3 + Math.floor(Math.random() * 20)) * 60000).toISOString(),
            likes: Math.floor(Math.random() * 8)
          }))
        });
      });
      if (!got.length) throw new Error("路人这次没想好，再刷一下试试");
      NP.list = got.concat(NP.list);
      npSave();
      toast(`来了 ${got.length} 条新帖`);
    } catch (e) {
      toast(e.message || "刷新失败");
    } finally {
      NP.busy = false;
      if (tab === "forum") draw();
    }
  }
  /** 本地帖下面：用户评论后，楼主 / 路人回一句 */
  async function npReply(post) {
    if (!F.hasApiKey()) return;
    const user = await F.loadUser().catch(() => ({ name: "我" }));
    const thread = (post.comments || []).slice(-8).map((c) => `${c.nick}：${c.body}`).join("\n");
    try {
      let who = post.nick;
      let persona = "";
      if (post.tag === "角色" && post.charId) {
        const ch = (castCache.length ? castCache : await F.loadCast()).find((c) => c.id === post.charId);
        if (ch) persona = ch.persona ? "你的人设：\n" + ch.persona + "\n" : "";
      }
      const t = await F.aiText(
        [
          {
            role: "system",
            content: `你是女性健康论坛里的网友「${who}」，你是这个帖子的楼主。${persona}帖子：《${post.title}》\n${post.body}\n刚才有人在下面评论了，回一句楼中楼：真诚、口语、≤60字，像真人。只输出回复内容。`
          },
          { role: "user", content: `评论区：\n${thread}\n（最新一条是「${yzNick}」发的）` }
        ],
        { maxTokens: 200, temperature: 0.9 }
      );
      const body = String(t || "").replace(/^["「]|["」]$/g, "").replace(/^[^：:]{1,16}[：:]\s*/, "").trim();
      if (!body) return;
      post.comments.push({ id: npId(), nick: who, body: `回复 @${yzNick}：${body}`.slice(0, 500), created_at: new Date().toISOString(), likes: 0, op: true });
      npSave();
      if (FS.open === post.id) {
        FS.detail = npDetail(post);
        draw();
      }
    } catch (_) {
      /* 没回就算了 */
    }
    void user;
  }
  function npDetail(x) {
    return {
      local: true,
      post: { id: x.id, cat: x.cat, title: x.title, body: x.body, nick: x.nick, mine: !!x.mine, created_at: x.created_at, likes: x.likes || 0, tag: x.tag },
      comments: (x.comments || []).map((c) => ({ ...c, likes: c.likes || 0, mine: !!c.mine }))
    };
  }

  /** 让角色来发帖求助：帮用户问 / TA 自己的问题 */
  async function charAsk() {
    if (!F.hasApiKey()) return toast("先在设置里填好 API，角色才能写帖子");
    const cast = await F.loadCast();
    if (!cast.length) return toast("还没有角色哦");
    const picked = await F.pickCast(cast, { min: 1, max: 1, title: "让谁来发帖求助？" });
    if (!picked || !picked.length) return;
    const ch = cast.find((c) => c.id === (picked[0].id || picked[0])) || picked[0];
    const sh = F.openSheet(
      `<p class="fun-note">${esc(ch.name)} 要问点什么？</p>
       <div class="fun-sheet-actions" style="flex-direction:column;gap:8px">
         <button type="button" class="fun-btn solid wide" data-m="user">💗 帮我问（替你发帖问问大家）</button>
         <button type="button" class="fun-btn ghost wide" data-m="self">🙋 TA 自己的问题</button>
       </div>
       <textarea id="yzf-hint" rows="2" maxlength="200" placeholder="可选：想问的方向，比如「最近痛经好严重」「怎么照顾经期的女朋友」" style="width:100%;margin-top:8px"></textarea>`,
      { title: "角色求助" }
    );
    sh.body.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-m]");
      if (!b) return;
      const mode = b.dataset.m;
      const hint = sh.body.querySelector("#yzf-hint").value.trim();
      sh.body.querySelectorAll("[data-m]").forEach((x) => (x.disabled = true));
      b.textContent = "✍️ " + ch.name + " 正在写…";
      try {
        const draft = await writeCharAsk(ch, mode, hint);
        sh.close();
        previewCharAsk(ch, mode, draft);
      } catch (er) {
        toast(er.message || "没写出来，再试一次");
        sh.body.querySelectorAll("[data-m]").forEach((x) => (x.disabled = false));
        b.textContent = mode === "user" ? "💗 帮我问（替你发帖问问大家）" : "🙋 TA 自己的问题";
      }
    });
  }
  async function writeCharAsk(ch, mode, hint) {
    await load();
    const user = await F.loadUser();
    const p = predict();
    const recentDays = Object.keys(S.daily).sort().slice(-14);
    const logs = recentDays
      .map((d) => {
        const x = S.daily[d];
        return [d.slice(5), x.flow ? "流量" + FLOW[x.flow] : "", x.pain ? PAIN[x.pain] : "", (x.syms || []).join("、"), x.note || ""].filter(Boolean).join(" ");
      })
      .filter((l) => l.length > 6)
      .join("；");
    const cyc = p.last ? `平均周期 ${p.st.cycle} 天，经期 ${p.st.plen} 天${p.inPeriod ? "，现在正在经期第 " + p.dayN + " 天" : p.until > 0 ? "，离下次大概 " + p.until + " 天" : ""}` : "（还没记录经期）";
    const sys =
      mode === "user"
        ? `你是「${ch.name}」。${ch.persona ? "人设：\n" + ch.persona + "\n" : ""}你在一个女性健康匿名论坛，替「${user.name}」发帖向网友求助（你是 TA 身边的人，帖子里用“我对象/我朋友/我家那位”之类称呼，不写真名）。根据下面 TA 的身体情况，挑最值得问的点。语气符合你的性格，但要把情况说清楚、问题具体。`
        : `你是「${ch.name}」。${ch.persona ? "人设：\n" + ch.persona + "\n" : ""}你在一个女性健康匿名论坛发帖，问一个你自己真正关心的问题（可以是你自己的身体/心理困扰，也可以是怎么照顾身边的人）。符合你的人设和性格，像真实网友。`;
    const t = await F.aiText(
      [
        { role: "system", content: sys + `\n不写任何真实姓名、电话、地址。分类从这些里选一个：${CATS.slice(1).join("、")}。\n只输出 JSON：{"cat":"分类","title":"标题(≤30字)","body":"正文(60~250字)"}` },
        { role: "user", content: (mode === "user" ? `${user.name}的情况：${cyc}${logs ? "。最近记录：" + logs : ""}` : "发帖吧") + (hint ? `\n想问的方向：${hint}` : "") }
      ],
      { maxTokens: 700, temperature: 0.9 }
    );
    const j = F.parseJsonLoose(t);
    if (!j || !j.title || !j.body) throw new Error("没写出来，再试一次");
    return { cat: CATS.slice(1).includes(j.cat) ? j.cat : "其他", title: sanitize(j.title, 40), body: sanitize(j.body, 2000) };
  }
  function previewCharAsk(ch, mode, d) {
    const sh = F.openSheet(
      `<div class="yzf-new">
        <div class="yzf-cats">${CATS.slice(1).map((c) => `<button type="button" class="${c === d.cat ? "is-on" : ""}" data-pc="${c}">${c}</button>`).join("")}</div>
        <input type="text" id="yzf-t" maxlength="40" value="${esc(d.title)}"/>
        <textarea id="yzf-b" rows="8" maxlength="2000">${esc(d.body)}</textarea>
        <p class="fun-note">以「${esc(ch.name)}」的名字发帖${mode === "user" ? "（帮你问的）" : ""}。可以先改改再发。<br>「发到社区」所有 Meow 用户都能看到、真人来回复；「只在我这儿」会有路人来回复，别人看不到。</p>
        <div class="fun-sheet-actions"><button type="button" class="fun-btn ghost" data-x="local">只在我这儿</button><button type="button" class="fun-btn solid" data-x="ok">发到社区</button></div>
      </div>`,
      { title: ch.name + " 的求助帖" }
    );
    let cat = d.cat;
    sh.body.addEventListener("click", async (e) => {
      const pc = e.target.closest("[data-pc]");
      if (pc) {
        cat = pc.dataset.pc;
        sh.body.querySelectorAll("[data-pc]").forEach((b) => b.classList.toggle("is-on", b === pc));
        return;
      }
      const x = e.target.closest("[data-x]")?.dataset.x;
      if (!x) return;
      const title = sh.body.querySelector("#yzf-t").value.trim();
      const body = sh.body.querySelector("#yzf-b").value.trim();
      if (!title || body.length < 5) return toast("标题和内容都写一下");
      const nick = String(ch.name || "TA").slice(0, 20);
      sh.body.querySelectorAll("[data-x]").forEach((b) => (b.disabled = true));
      if (x === "local") {
        await npLoad();
        const post = { id: npId(), tag: "角色", charId: ch.id, cat, nick, title, body, created_at: new Date().toISOString(), likes: 0, comments: [] };
        NP.list.unshift(post);
        npSave();
        sh.close();
        toast("发好啦，路人马上来回");
        FS.open = post.id;
        FS.detail = npDetail(post);
        draw();
        void npPasserbyComments(post);
        return;
      }
      try {
        const id = await yrpc("mx_yz_post", { p_token: yzToken, p_nick: nick, p_cat: cat, p_title: title, p_body: body });
        if (id === -2) throw new Error("发得太快了，过几分钟再发");
        if (!(id > 0)) throw new Error("发布失败");
        sh.close();
        toast(`${nick} 发好啦 🌷`);
        FS.sort = "new";
        FS.cat = "全部";
        loadList(true);
        openPost(id);
      } catch (err) {
        sh.body.querySelectorAll("[data-x]").forEach((b) => (b.disabled = false));
        toast(err.message);
      }
    });
  }
  /** 给本地求助帖生成几条路人回复 */
  async function npPasserbyComments(post) {
    if (!F.hasApiKey()) return;
    try {
      const t = await F.aiText(
        [
          {
            role: "system",
            content: `你在模拟女性健康论坛里的 2~3 位不同的路人网友，给下面这个求助帖回复：真诚、具体、分享自己的经验或给建议，必要时建议就医；口语，每条 ≤80 字；网名像真实网名。只输出 JSON 数组：[{"nick":"网名","body":"回复"}]`
          },
          { role: "user", content: `《${post.title}》\n${post.body}` }
        ],
        { maxTokens: 600, temperature: 1 }
      );
      const arr = F.parseJsonLoose(t);
      if (!Array.isArray(arr)) return;
      const base = Date.now();
      arr.slice(0, 3).forEach((c, j) => {
        if (c && c.body) post.comments.push({ id: npId(), nick: sanitize(c.nick || "热心网友", 16), body: sanitize(c.body, 500), created_at: new Date(base + j * 1000).toISOString(), likes: 0 });
      });
      npSave();
      if (FS.open === post.id) {
        FS.detail = npDetail(post);
        draw();
      }
    } catch (_) {
      /* ignore */
    }
  }

  async function loadList(reset) {
    if (FS.loading) return;
    FS.loading = true;
    FS.err = "";
    if (reset) {
      FS.list = [];
      FS.more = true;
    }
    if (tab === "forum") draw();
    await npLoad();
    try {
      const rows = await yrpc("mx_yz_list", { p_cat: FS.cat, p_sort: FS.sort, p_offset: FS.list.length, p_q: FS.q, p_token: yzToken });
      FS.list = FS.list.concat(rows || []);
      FS.more = (rows || []).length >= 30;
      FS.loaded = true;
    } catch (e) {
      FS.err = e.message;
    } finally {
      FS.loading = false;
      if (tab === "forum") draw();
    }
  }
  async function openPost(id) {
    if (isLocalId(id)) {
      await npLoad();
      const x = npFind(id);
      if (!x) return toast("这个帖子不见了");
      FS.open = id;
      FS.detail = npDetail(x);
      return draw();
    }
    FS.open = id;
    FS.detail = null;
    draw();
    try {
      FS.detail = await yrpc("mx_yz_get", { p_id: id, p_token: yzToken });
      if (!FS.detail?.post) {
        toast("这个帖子不见了");
        FS.open = null;
      }
    } catch (e) {
      toast(e.message);
      FS.open = null;
    }
    draw();
  }
  function forumHtml() {
    if (FS.open) return postHtml();
    return `<div class="yzf">
      <div class="yzf-top"><div class="yzf-search"><input type="search" id="yzf-q" placeholder="搜搜大家的经验…" value="${esc(FS.q)}" enterkeyhint="search"/></div><button type="button" class="fun-btn solid sm" data-fa="new">✏️ 发帖</button></div>
      <div class="yzf-top" style="gap:6px"><button type="button" class="fun-btn ghost sm" data-fa="npc" style="flex:1"${NP.busy ? " disabled" : ""}>${NP.busy ? "⏳ 路人正在发帖…" : "🔄 刷新路人帖"}</button><button type="button" class="fun-btn ghost sm" data-fa="ask" style="flex:1">🙋 让 TA 来求助</button></div>
      <div class="yzf-cats">${CATS.map((c) => `<button type="button" class="${FS.cat === c ? "is-on" : ""}" data-fcat="${c}">${c}</button>`).join("")}</div>
      <div class="yzf-sort"><button type="button" class="${FS.sort === "new" ? "is-on" : ""}" data-fsort="new">最新</button><button type="button" class="${FS.sort === "hot" ? "is-on" : ""}" data-fsort="hot">热门</button><button type="button" class="${FS.sort === "mine" ? "is-on" : ""}" data-fsort="mine">我发的</button><span>我的昵称：<b>${esc(yzNick)}</b> <button type="button" class="yzf-mini" data-fa="nick">改</button></span></div>
      ${FS.err ? `<p class="yzf-err">${esc(FS.err)}</p>` : ""}
      <div class="yzf-list">${
        mergedList()
          .map(
            (p) => `<button type="button" class="yzf-item" data-fpost="${p.id}"><span class="yzf-cat">${esc(p.cat)}${p.local ? ` · ${p.tag === "角色" ? "角色·仅自己可见" : "路人"}` : ""}</span><b>${esc(p.title)}</b><p>${esc(p.preview)}${p.preview.length >= 140 ? "…" : ""}</p><small>${esc(p.nick)}${p.mine ? (p.nick === yzNick ? "（我）" : "（我发的）") : ""} · ${ago(p.created_at)}<span>💗 ${p.likes}　💬 ${p.comments}</span></small></button>`
          )
          .join("") || (FS.loading ? `<p class="fun-note yzf-empty">加载中…</p>` : FS.err ? "" : `<p class="fun-note yzf-empty">${FS.sort === "mine" ? "你还没发过帖子" : "这里还没有帖子，来发第一个吧～"}</p>`)
      }</div>
      ${FS.more && FS.list.length >= 30 ? `<button type="button" class="fun-btn ghost wide" data-fa="more">${FS.loading ? "加载中…" : "加载更多"}</button>` : ""}
      <p class="fun-note yz-foot">这里是大家匿名分享经验和互相提问的地方，彼此温柔一点 🌷。网友的经验不能代替医生的诊断，身体不舒服请及时就医。不要发手机号、住址等个人信息；看到不好的内容可以举报。</p>
    </div>`;
  }
  function postHtml() {
    const d = FS.detail;
    if (!d) return `<div class="yzf"><button type="button" class="yzf-back" data-fa="back">‹ 返回</button><p class="fun-note yzf-empty">加载中…</p></div>`;
    const p = d.post;
    const lk = liked.has("p" + p.id);
    return `<div class="yzf yzf-detail">
      <button type="button" class="yzf-back" data-fa="back">‹ 返回</button>
      <article class="yzf-post"><span class="yzf-cat">${esc(p.cat)}</span><h3>${esc(p.title)}</h3><small>${esc(p.nick)}${p.mine ? (p.nick === yzNick ? "（我）" : "（我发的）") : ""} · ${ago(p.created_at)}</small><p>${br(p.body)}</p>
        <div class="yzf-acts"><button type="button" class="${lk ? "is-on" : ""}" data-flike="post:${p.id}">💗 ${p.likes}</button><button type="button" data-fa="focus">💬 评论</button>${p.mine || d.local ? `<button type="button" data-fdel="post:${p.id}">删除</button>` : `<button type="button" data-frep="post:${p.id}">举报</button>`}</div>
      </article>${d.local ? `<p class="fun-note" style="margin:4px 2px">${p.tag === "角色" ? "这是角色发在你本地的求助帖，只有你能看到" : "这是 AI 模拟的路人帖，只在你手机里"}，网友的话仅供参考～</p>` : ""}
      <h4 class="yzf-h4">评论 ${d.comments.length}</h4>
      <div class="yzf-cmts">${
        d.comments
          .map((c, i) => {
            const l = liked.has("c" + c.id);
            return `<div class="yzf-cmt"><div class="yzf-cmt-h"><b>${esc(c.nick)}${c.mine ? "（我）" : ""}</b><small>${i + 1} 楼 · ${ago(c.created_at)}</small></div><p>${br(c.body)}</p><div class="yzf-acts sm"><button type="button" class="${l ? "is-on" : ""}" data-flike="comment:${c.id}">💗 ${c.likes}</button><button type="button" data-freply="${esc(c.nick)}">回复</button>${c.mine || d.local ? `<button type="button" data-fdel="comment:${c.id}">删除</button>` : `<button type="button" data-frep="comment:${c.id}">举报</button>`}</div></div>`;
          })
          .join("") || `<p class="fun-note yzf-empty">还没有评论，说说你的经验或者给 TA 一点鼓励吧</p>`
      }</div>
      <form class="yzf-bar"><input type="text" id="yzf-cin" maxlength="500" placeholder="温柔地评论一下…（以 ${esc(yzNick)} 的身份）" enterkeyhint="send"/><button type="submit" class="fun-btn solid sm">发送</button></form>
    </div>`;
  }
  function newPost() {
    const sh = F.openSheet(
      `<div class="yzf-new">
        <div class="yzf-cats">${CATS.slice(1).map((c, i) => `<button type="button" class="${i === 0 ? "is-on" : ""}" data-pc="${c}">${c}</button>`).join("")}</div>
        <input type="text" id="yzf-t" maxlength="40" placeholder="标题：想问什么 / 想分享什么（40 字内）"/>
        <textarea id="yzf-b" rows="7" maxlength="2000" placeholder="具体说说～比如年龄段、周期情况、试过什么办法、有没有看过医生……（不要写真实姓名、电话、住址）"></textarea>
        <p class="fun-note">以「${esc(yzNick)}」的身份匿名发布</p>
        <div class="fun-sheet-actions"><button type="button" class="fun-btn solid" data-x="ok">发布</button></div>
      </div>`,
      { title: "发帖" }
    );
    let cat = CATS[1];
    sh.body.addEventListener("click", async (e) => {
      const pc = e.target.closest("[data-pc]");
      if (pc) {
        cat = pc.dataset.pc;
        sh.body.querySelectorAll("[data-pc]").forEach((b) => b.classList.toggle("is-on", b === pc));
        return;
      }
      if (!e.target.closest("[data-x=ok]")) return;
      const title = sh.body.querySelector("#yzf-t").value.trim();
      const body = sh.body.querySelector("#yzf-b").value.trim();
      if (!title) return toast("写个标题吧");
      if (body.length < 5) return toast("内容再多写一点点");
      const btn = e.target.closest("[data-x=ok]");
      btn.disabled = true;
      try {
        const id = await yrpc("mx_yz_post", { p_token: yzToken, p_nick: yzNick, p_cat: cat, p_title: title, p_body: body });
        if (id === -2) throw new Error("发得太快了，过几分钟再发");
        if (!(id > 0)) throw new Error("发布失败");
        sh.close();
        toast("发布成功 🌷");
        FS.sort = "new";
        FS.cat = "全部";
        loadList(true);
        openPost(id);
      } catch (err) {
        btn.disabled = false;
        toast(err.message);
      }
    });
  }
  async function sendComment(text, input) {
    const t = String(text || "").trim();
    if (!t || !FS.detail) return;
    if (FS.detail.local) {
      const x = npFind(FS.detail.post.id);
      if (!x) return;
      x.comments = x.comments || [];
      x.comments.push({ id: npId(), nick: yzNick, body: t.slice(0, 500), created_at: new Date().toISOString(), likes: 0, mine: true });
      npSave();
      FS.detail = npDetail(x);
      draw();
      setTimeout(() => root?.querySelector(".yzf-cmts")?.lastElementChild?.scrollIntoView({ block: "center" }), 30);
      if (Math.random() < 0.8) setTimeout(() => void npReply(x), 1500 + Math.random() * 2500);
      return;
    }
    input.disabled = true;
    try {
      const id = await yrpc("mx_yz_comment", { p_token: yzToken, p_nick: yzNick, p_post: FS.detail.post.id, p_body: t });
      if (id === -2) throw new Error("评论太频繁了，歇一会儿");
      if (!(id > 0)) throw new Error("评论失败");
      await openPost(FS.detail.post.id);
      const box = root?.querySelector(".yzf-cmts");
      box?.lastElementChild?.scrollIntoView({ block: "center" });
      const it = FS.list.find((x) => x.id === FS.open);
      if (it) it.comments++;
    } catch (err) {
      toast(err.message);
      input.disabled = false;
    }
  }
  async function forumClick(e) {
    const fa = e.target.closest("[data-fa]")?.dataset.fa;
    if (fa === "new") return newPost();
    if (fa === "npc") return refreshPasserby();
    if (fa === "ask") return charAsk();
    if (fa === "more") return loadList(false);
    if (fa === "back") {
      FS.open = null;
      FS.detail = null;
      return draw();
    }
    if (fa === "focus") return root.querySelector("#yzf-cin")?.focus();
    if (fa === "nick") {
      const v = prompt("在社区里显示的昵称（不要用真名哦）", yzNick);
      if (v == null) return true;
      yzNick = String(v).trim().slice(0, 20) || yzNick;
      lsSet("meowos_yz_nick", yzNick);
      draw();
      return true;
    }
    const fc = e.target.closest("[data-fcat]");
    if (fc) {
      FS.cat = fc.dataset.fcat;
      return loadList(true);
    }
    const fs = e.target.closest("[data-fsort]");
    if (fs) {
      FS.sort = fs.dataset.fsort;
      return loadList(true);
    }
    const fp = e.target.closest("[data-fpost]");
    if (fp) return openPost(/^n/.test(fp.dataset.fpost) ? fp.dataset.fpost : Number(fp.dataset.fpost));
    const fr = e.target.closest("[data-freply]");
    if (fr) {
      const inp = root.querySelector("#yzf-cin");
      if (inp) {
        inp.value = `回复 @${fr.dataset.freply}：`;
        inp.focus();
      }
      return true;
    }
    const fl = e.target.closest("[data-flike]");
    if (fl) {
      const [kind, id] = fl.dataset.flike.split(":");
      const key = (kind === "post" ? "p" : "c") + id;
      const on = !liked.has(key);
      if (on) liked.add(key);
      else liked.delete(key);
      saveLiked();
      if (FS.detail?.local) {
        const x = npFind(FS.detail.post.id);
        const o2 = kind === "post" ? x : (x?.comments || []).find((c) => String(c.id) === id);
        if (o2) o2.likes = Math.max(0, (o2.likes || 0) + (on ? 1 : -1));
        npSave();
      } else yrpc("mx_yz_like", { p_kind: kind, p_id: Number(id), p_delta: on ? 1 : -1 }).catch(() => {});
      const obj = kind === "post" ? FS.detail?.post : FS.detail?.comments.find((c) => String(c.id) === id);
      if (obj) obj.likes = Math.max(0, obj.likes + (on ? 1 : -1));
      const li = FS.list.find((x) => String(x.id) === id);
      if (kind === "post" && li) li.likes = obj ? obj.likes : li.likes;
      draw();
      return true;
    }
    const frp = e.target.closest("[data-frep]");
    if (frp) {
      if (!confirm("举报这条内容？被多人举报后会自动隐藏。")) return true;
      const [kind, id] = frp.dataset.frep.split(":");
      yrpc("mx_yz_report", { p_kind: kind, p_id: Number(id) }).then(() => toast("已举报，谢谢你"), (er) => toast(er.message));
      return true;
    }
    const fd = e.target.closest("[data-fdel]");
    if (fd) {
      const [kind, id] = fd.dataset.fdel.split(":");
      if (!confirm(kind === "post" ? "删除这个帖子？评论也会一起删掉。" : "删除这条评论？")) return true;
      if (FS.detail?.local) {
        const x = npFind(FS.detail.post.id);
        if (kind === "post") {
          NP.list = NP.list.filter((y) => y.id !== id);
          FS.open = null;
          FS.detail = null;
        } else if (x) {
          x.comments = (x.comments || []).filter((c) => String(c.id) !== id);
          FS.detail = npDetail(x);
        }
        npSave();
        toast("已删除");
        draw();
        return true;
      }
      try {
        const ok = await yrpc("mx_yz_delete", { p_token: yzToken, p_kind: kind, p_id: Number(id) });
        if (!ok) throw new Error("删除失败");
        toast("已删除");
        if (kind === "post") {
          FS.open = null;
          FS.detail = null;
          FS.list = FS.list.filter((x) => String(x.id) !== id);
          draw();
        } else openPost(FS.detail.post.id);
      } catch (er) {
        toast(er.message);
      }
      return true;
    }
    return false;
  }

  async function draw() {
    if (!root) return;
    const p = predict();
    const cast = await F.loadCast();
    const R = S.remind;
    const ring = !p.last
      ? `<b>🍊</b><span>还没有记录</span><small>经期来了点下面「经期来了」</small>`
      : p.inPeriod
        ? `<small>经期第</small><b>${p.dayN}</b><span>天</span><small>${p.last.end ? "" : "结束了记得点「经期结束」"}</small>`
        : p.until > 0
          ? `<small>距离下次经期</small><b>${p.until}</b><span>天</span><small>预计 ${md(p.next)}</small>`
          : `<small>预计经期</small><b>${p.until === 0 ? "今天" : "推迟 " + -p.until + " 天"}</b><small>来了就点「经期来了」</small>`;
    const recs = sorted().reverse();
    const tabs = `<div class="yz-tabs"><button type="button" data-tab="cycle" class="${tab === "cycle" ? "is-on" : ""}">🍊 经期</button><button type="button" data-tab="forum" class="${tab === "forum" ? "is-on" : ""}">💬 女性健康</button><button type="button" data-tab="health" class="${tab === "health" ? "is-on" : ""}">🌷 我的身体</button></div>`;
    castCache = cast;
    if (tab === "forum") {
      root.innerHTML = `<div class="yz">${tabs}${forumHtml()}</div>`;
      if (!FS.loaded && !FS.loading && !FS.err) loadList(true);
      const f = root.querySelector(".yzf-bar");
      if (f)
        f.addEventListener("submit", (ev) => {
          ev.preventDefault();
          const inp = root.querySelector("#yzf-cin");
          sendComment(inp.value, inp);
        });
      const q = root.querySelector("#yzf-q");
      if (q)
        q.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") {
            FS.q = q.value.trim();
            loadList(true);
          }
        });
      return;
    }
    if (tab === "health") {
      root.innerHTML = `<div class="yz">${tabs}${healthHtml(p)}</div>`;
      return;
    }
    root.innerHTML = `<div class="yz">${tabs}
      <div class="yz-ring">${ring}</div>
      <div class="yz-btns">${
        p.last && !p.last.end && p.inPeriod
          ? `<button type="button" class="fun-btn solid" data-a="end">经期结束了</button>`
          : `<button type="button" class="fun-btn solid" data-a="start">经期来了</button>`
      }<button type="button" class="fun-btn ghost" data-a="pick">补记某一天</button></div>
      <div class="yz-stats"><button type="button" data-a="lens"><b>${p.st.cycle}</b>平均周期(天)<em>${p.st.manual ? "我设定的 ✎" : p.st.auto ? "按记录算 ✎" : "默认 ✎"}</em></button><button type="button" data-a="lens"><b>${p.st.plen}</b>经期长度(天)<em>${p.st.manual ? "我设定的 ✎" : p.st.auto ? "按记录算 ✎" : "默认 ✎"}</em></button><span><b>${p.st.n}</b>已记录(次)</span></div>
      ${calHtml(p)}
      <section class="yz-card"><h3>💌 让 TA 提醒我</h3>
        <label class="fun-switch"><input type="checkbox" id="yz-on" ${R.on ? "checked" : ""}/><span>经期快来时让角色提醒我</span></label>
        <div class="yz-cast">${cast.length ? cast.map((c) => `<button type="button" class="fun-chip-btn${R.charId === c.id ? " is-on" : ""}" data-c="${esc(c.id)}">${F.avHtml ? F.avHtml(c, "fun-av sm") : ""}${esc(c.name)}</button>`).join("") : `<p class="fun-note">角色库里还没有角色</p>`}</div>
        <label class="fun-field"><span>提前几天提醒</span><select id="yz-before">${[1, 2, 3, 5].map((n) => `<option value="${n}"${R.daysBefore === n ? " selected" : ""}>提前 ${n} 天</option>`).join("")}</select></label>
        <label class="fun-switch"><input type="checkbox" id="yz-mem" ${R.memory ? "checked" : ""}/><span>与记忆共通</span></label>
        <p class="fun-note">${R.memory ? "开着：提醒会作为 TA 的消息发进你们的聊天，TA 会记得，你也可以直接回 TA。" : "关着：提醒只出现在柚子里，不会写进聊天记录，TA 聊天时也不会提起。"}</p>
        <button type="button" class="fun-btn ghost" data-a="test">现在让 TA 提醒一次试试</button>
      </section>
      ${
        S.notes.length
          ? `<section class="yz-card"><h3>TA 的提醒</h3>${S.notes
              .slice(0, 6)
              .map((n) => `<div class="yz-note"><small>${esc(n.from)} · ${new Date(n.at).toLocaleDateString()}${n.toChat ? " · 已发进聊天" : ""}</small><p>${esc(String(n.text).split("|||").join("\n")).replace(/\n/g, "<br>")}</p></div>`)
              .join("")}</section>`
          : ""
      }
      <section class="yz-card"><h3>历史记录</h3>${
        recs.length
          ? recs
              .map((r, i) => {
                const prev = recs[i + 1];
                return `<div class="yz-rec"><b>${md(r.start)}${r.end ? ` - ${md(r.end)}` : " 开始"}</b><small>${r.end ? `持续 ${diffDays(r.end, r.start) + 1} 天` : "进行中"}${prev ? ` · 周期 ${diffDays(r.start, prev.start)} 天` : ""}</small><button type="button" class="yz-del" data-del="${r.start}">删除</button></div>`;
              })
              .join("")
          : `<p class="fun-note">还没有记录</p>`
      }</section>
      <p class="fun-note yz-foot">预测只供参考，不能当避孕或诊断用；身体不舒服请去看医生。数据只保存在这台设备上。</p>
    </div>`;
  }
  async function setStart(d) {
    // 上一次没点结束：自动按平均天数结束（不超过新开始的前一天）
    for (const r of S.records) {
      if (!r.end && r.start < d) r.end = iso(Math.min(parse(addDays(r.start, stats().plen - 1)), parse(addDays(d, -1))));
    }
    if (!S.records.some((r) => r.start === d)) S.records.push({ start: d, end: "" });
    S.remind.lastFor = "";
    await save();
    toast(`已记录：${md(d)} 经期开始`);
    draw();
  }
  async function setEnd(d) {
    const r = sorted().reverse().find((x) => x.start <= d);
    if (!r) return toast("这天之前没有经期开始的记录");
    if (diffDays(d, r.start) > 14) return toast("离开始那天太久了，先补记开始日期");
    r.end = d;
    await save();
    toast(`已记录：${md(d)} 经期结束`);
    draw();
  }
  function dayMenu(d) {
    const sh = F.openSheet(
      `<div class="fun-sheet-actions yz-acts"><button type="button" class="fun-btn solid" data-x="s">${md(d)} 经期开始</button><button type="button" class="fun-btn ghost" data-x="e">${md(d)} 经期结束</button><button type="button" class="fun-btn ghost" data-x="b">📝 记这天的身体状况</button></div>`,
      { title: md(d) }
    );
    sh.body.addEventListener("click", (e) => {
      const x = e.target.closest("[data-x]")?.dataset.x;
      if (!x) return;
      sh.close();
      if (d > today()) return toast("不能记未来的日子");
      if (x === "b") return logDay(d);
      if (x === "s") void setStart(d);
      else void setEnd(d);
    });
  }
  async function onClick(e) {
    if (tab === "forum" && !e.target.closest("[data-tab]")) {
      await forumClick(e);
      return;
    }
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "start") return setStart(today());
    if (a === "end") return setEnd(today());
    if (a === "pick") return toast("在日历上点那一天就可以补记");
    if (a === "test") return checkRemind(true);
    if (a === "lens") return editLens();
    const tb = e.target.closest("[data-tab]");
    if (tb) {
      tab = tb.dataset.tab;
      return draw();
    }
    if (a === "logday") return logDay(e.target.closest("[data-day]")?.dataset.day || today());
    const ld = e.target.closest("[data-logd]");
    if (ld) return logDay(ld.dataset.logd);
    const mv = e.target.closest("[data-m]");
    if (mv) {
      view.setMonth(view.getMonth() + Number(mv.dataset.m));
      return draw();
    }
    const d = e.target.closest("[data-d]");
    if (d) return dayMenu(d.dataset.d);
    const c = e.target.closest("[data-c]");
    if (c) {
      S.remind.charId = c.dataset.c;
      if (tab === "health") {
        S.remind.body = true;
        S.remind.bodyFor = "";
      } else S.remind.on = true;
      S.remind.lastFor = "";
      await save();
      return draw();
    }
    const del = e.target.closest("[data-del]");
    if (del) {
      S.records = S.records.filter((r) => r.start !== del.dataset.del);
      await save();
      return draw();
    }
  }
  async function onChange(e) {
    const t = e.target;
    if (t.id === "yz-on") S.remind.on = t.checked;
    if (t.id === "yz-mem") S.remind.memory = t.checked;
    if (t.id === "yz-body") {
      S.remind.body = t.checked;
      S.remind.bodyFor = "";
      if (t.checked && !S.remind.charId) toast("再选一位角色");
    }
    if (t.id === "yz-before") S.remind.daysBefore = Number(t.value);
    S.remind.lastFor = "";
    await save();
    draw();
  }

  F.register("柚子", {
    title: "柚子",
    kicker: "YOUZI · 经期记录",
    async mount(body) {
      root = document.createElement("div");
      body.appendChild(root);
      await load();
      view = new Date();
      view.setDate(1);
      root.addEventListener("click", (e) => void onClick(e));
      root.addEventListener("change", (e) => void onChange(e));
      draw();
    },
    unmount() {
      root = null;
    }
  });

  // 开机后 + 每小时检查一次要不要提醒
  setTimeout(() => void checkRemind(false).catch(() => {}), 15000);
  setInterval(() => void checkRemind(false).catch(() => {}), 3600000);
})();
