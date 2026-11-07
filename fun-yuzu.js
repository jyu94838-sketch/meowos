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
    S = Object.assign({ records: [], periodLen: 5, cycleLen: 28, remind: { on: false, charId: "", daysBefore: 2, memory: true, lastFor: "" }, notes: [] }, S || {});
    S.remind = Object.assign({ on: false, charId: "", daysBefore: 2, memory: true, lastFor: "" }, S.remind || {});
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
    const g6 = gaps.slice(-6);
    const cycle = g6.length ? Math.round(g6.reduce((a, b) => a + b, 0) / g6.length) : S.cycleLen;
    const lens = r.filter((x) => x.end).map((x) => diffDays(x.end, x.start) + 1).filter((n) => n > 0 && n < 15).slice(-6);
    const plen = lens.length ? Math.round(lens.reduce((a, b) => a + b, 0) / lens.length) : S.periodLen;
    return { cycle, plen, n: r.length };
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
      cells.push(`<button type="button" class="yz-d ${k ? "is-" + k : ""}${s === today() ? " is-today" : ""}" data-d="${s}">${d}</button>`);
    }
    return `<div class="yz-cal"><div class="yz-cal-h"><button type="button" data-m="-1">‹</button><b>${y} 年 ${m + 1} 月</b><button type="button" data-m="1">›</button></div>
      <div class="yz-wk">${"日一二三四五六".split("").map((w) => `<span>${w}</span>`).join("")}</div><div class="yz-grid">${cells.join("")}</div>
      <div class="yz-legend"><span class="is-period">经期</span><span class="is-predict">预测经期</span><span class="is-fertile">易孕期</span><span class="is-ovu">排卵日</span></div></div>`;
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
    root.innerHTML = `<div class="yz">
      <div class="yz-ring">${ring}</div>
      <div class="yz-btns">${
        p.last && !p.last.end && p.inPeriod
          ? `<button type="button" class="fun-btn solid" data-a="end">经期结束了</button>`
          : `<button type="button" class="fun-btn solid" data-a="start">经期来了</button>`
      }<button type="button" class="fun-btn ghost" data-a="pick">补记某一天</button></div>
      <div class="yz-stats"><span><b>${p.st.cycle}</b>平均周期(天)</span><span><b>${p.st.plen}</b>经期长度(天)</span><span><b>${p.st.n}</b>已记录(次)</span></div>
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
      `<div class="fun-sheet-actions yz-acts"><button type="button" class="fun-btn solid" data-x="s">${md(d)} 经期开始</button><button type="button" class="fun-btn ghost" data-x="e">${md(d)} 经期结束</button></div>`,
      { title: md(d) }
    );
    sh.body.addEventListener("click", (e) => {
      const x = e.target.closest("[data-x]")?.dataset.x;
      if (!x) return;
      sh.close();
      if (d > today()) return toast("不能记未来的日子");
      if (x === "s") void setStart(d);
      else void setEnd(d);
    });
  }
  async function onClick(e) {
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "start") return setStart(today());
    if (a === "end") return setEnd(today());
    if (a === "pick") return toast("在日历上点那一天就可以补记");
    if (a === "test") return checkRemind(true);
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
      S.remind.on = true;
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
    if (t.id === "yz-before") S.remind.daysBefore = Number(t.value);
    S.remind.lastFor = "";
    await save();
    draw();
  }

  F.register("柚子", {
    title: "柚子",
    kicker: "YUZU · 经期记录",
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
