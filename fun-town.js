"use strict";

/**
 * Pocket Town · 口袋小镇
 * 你是镇长。角色库里的角色搬进小镇，各有职业；AI 再生成一批 NPC 居民。
 * 每次「推进时间」，AI 按时间段生成每个人的工作日常，偶尔发生跨角色的小镇事件。
 * 镇长可以：发公告（影响接下来的日常）、分配工作、发起活动、招新居民、找人聊天。
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast, rnd, pick, shuffle, uid, avHtml } = F;

  const KV = "town_v1";
  const SLOTS = ["早上", "中午", "下午", "晚上"];
  const SLOT_ICON = ["🌅", "☀️", "🌤", "🌙"];
  const PLACES = [
    { id: "cafe", name: "咖啡店", icon: "☕" },
    { id: "hospital", name: "医院", icon: "🏥" },
    { id: "police", name: "警局", icon: "🚓" },
    { id: "school", name: "学校", icon: "🏫" },
    { id: "flower", name: "花店", icon: "💐" },
    { id: "store", name: "便利店", icon: "🏪" },
    { id: "office", name: "写字楼", icon: "🏢" },
    { id: "library", name: "图书馆", icon: "📚" },
    { id: "studio", name: "工作室", icon: "🎨" },
    { id: "bar", name: "小酒馆", icon: "🍸" },
    { id: "park", name: "中央公园", icon: "🌳" },
    { id: "hall", name: "镇政府", icon: "🏛" }
  ];
  const placeById = (id) => PLACES.find((p) => p.id === id) || PLACES[10];
  const placeByName = (n) => {
    const s = String(n || "").trim();
    if (!s) return null;
    return PLACES.find((p) => p.name === s) || PLACES.find((p) => s.includes(p.name) || p.name.includes(s)) || null;
  };
  const PRESET_NPCS = [
    { name: "阿福", persona: "咖啡店老板，胖胖的，爱讲冷笑话", job: "咖啡店老板", place: "cafe" },
    { name: "周医生", persona: "医院值班医生，总是睡眠不足但很温柔", job: "急诊科医生", place: "hospital" },
    { name: "小林", persona: "便利店夜班店员，大学生，爱看漫画", job: "便利店店员", place: "store" },
    { name: "王老师", persona: "学校语文老师，严肃但会偷偷给学生糖", job: "语文老师", place: "school" },
    { name: "莉莉", persona: "图书馆管理员，安静，记得每个人借过什么书", job: "图书管理员", place: "library" },
    { name: "老陈", persona: "小酒馆调酒师，见过很多故事，话不多", job: "调酒师", place: "bar" }
  ];

  let S = null;
  let root = null;
  let tab = "map";
  let busy = false;

  async function load() {
    try {
      S = (await F.FunDB.get(KV)) || null;
    } catch (_) {
      S = null;
    }
  }
  function save() {
    if (S.feed.length > 300) S.feed = S.feed.slice(-300);
    F.FunDB.set(KV, S).catch(() => toast("保存失败：存储空间不足"));
  }

  const resById = (id) => S.residents.find((r) => r.id === id);
  const resByName = (n) => {
    const s = String(n || "").trim();
    return S.residents.find((r) => r.name === s) || S.residents.find((r) => s && (s.includes(r.name) || r.name.includes(s)));
  };
  const timeLabel = (d, s) => `第${d}天 · ${SLOTS[s]}`;
  const resAv = (r, cls) => avHtml({ name: r.name, avatar: r.avatar }, cls || "fun-av sm");

  /** 刷新角色头像/人设（角色库可能改过） */
  async function syncCast() {
    const cast = await F.loadCast();
    for (const r of S.residents) {
      if (!r.charId) continue;
      const c = cast.find((x) => x.id === r.charId);
      if (c) {
        r.avatar = c.avatar;
        r.persona = c.persona;
        r.name = c.name;
      }
    }
    return cast;
  }

  /** 当前时间段每个人在哪 */
  function whereNow() {
    const map = {};
    const latest = S.feed.filter((f) => f.day === S.day && f.slot === S.slot && f.kind === "life");
    for (const r of S.residents) {
      const e = latest.find((f) => f.who === r.id);
      map[r.id] = e ? e.place : S.slot === 3 ? "" : r.place;
    }
    return map;
  }

  /* ───── AI ───── */
  function residentsDesc(list) {
    return list
      .map((r) => `- ${r.name}${r.charId ? "（主要角色）" : "（NPC）"}｜职业：${r.job}｜工作地点：${placeById(r.place).name}｜性格：${String(r.persona || "").replace(/\n/g, " ").slice(0, 120)}${r.memory.length ? `｜最近经历：${r.memory.slice(-3).join("；")}` : ""}`)
      .join("\n");
  }

  async function aiFoundTown(chars, npcN) {
    const txt = await F.aiText(
      [
        {
          role: "system",
          content: `你在为一个温馨的小镇模拟游戏建镇。小镇地点只有这些：${PLACES.map((p) => p.name).join("、")}。只输出 JSON。`
        },
        {
          role: "user",
          content: `这些主要角色要搬进小镇，请根据人设给每人安排一份合适的工作（职业名称要具体，比如「刑警队长」「花店老板娘」）和工作地点：\n${chars.map((c) => `- ${c.name}：${(c.persona || "无").replace(/\n/g, " ").slice(0, 200)}`).join("\n")}\n\n再生成 ${npcN} 位 NPC 居民，填补小镇的各个岗位，名字和性格要有生活感、互相不同，可以和主要角色有点关系。\n\n格式：{"chars":[{"name":"原名","job":"职业","place":"地点"}],"npcs":[{"name":"名字","persona":"性格和小特点，20~40字","job":"职业","place":"地点"}]}`
        }
      ],
      { maxTokens: 1800, temperature: 0.9 }
    );
    const o = F.parseJsonLoose(txt);
    if (!o || !Array.isArray(o.chars)) throw new Error("建镇失败，格式不对");
    return o;
  }

  async function aiAdvance() {
    const list = S.residents.length > 12 ? shuffle(S.residents.slice()).slice(0, 12) : S.residents;
    const prev = S.feed.filter((f) => f.day === S.day && f.slot === S.slot).map((f) => (f.kind === "life" ? `${resById(f.who)?.name}在${placeById(f.place).name}：${f.text}` : `【${f.kind === "event" ? "事件" : "公告"}】${f.text}`));
    const notice = S.notices.filter((n) => n.day >= S.day - 1).map((n) => n.text);
    const ns = (S.slot + 1) % 4;
    const nd = ns === 0 ? S.day + 1 : S.day;
    const wantEvent = Math.random() < 0.45 || S.pendingEvent;
    const txt = await F.aiText(
      [
        {
          role: "system",
          content: [
            `你在写一个温馨小镇「Pocket Town」的居民日常。玩家是镇长。`,
            `地点：${PLACES.map((p) => p.name).join("、")}`,
            `写作要求：每条 20~60 字，具体、有画面、有小细节和小情绪，符合每个人的职业和性格；工作时间（早上、下午）多写工作中的事——遇到的客人、小麻烦、成就感、摸鱼；中午写午休吃饭；晚上写下班后的生活。可以延续之前发生的事，人物之间可以有自然的交集。`,
            `只输出 JSON。`
          ].join("\n")
        },
        {
          role: "user",
          content: `居民：\n${residentsDesc(list)}\n\n${prev.length ? `上一个时间段（${timeLabel(S.day, S.slot)}）：\n${prev.slice(-14).join("\n")}\n\n` : ""}${notice.length ? `镇长最近的公告（居民会知道并受影响）：${notice.join("；")}\n\n` : ""}${S.pendingEvent ? `镇长发起了活动：「${S.pendingEvent}」，请让这次的内容围绕它展开。\n\n` : ""}现在是 ${timeLabel(nd, ns)}。请写出每位居民此刻在做什么。${wantEvent ? "另外写 1 个小镇事件（两三个居民之间发生的有意思的事）。" : ""}\n\n格式：{"life":[{"who":"名字","place":"地点","text":"在做什么","mood":"一个表情符号"}]${wantEvent ? ',"event":{"who":["名字","名字"],"place":"地点","title":"事件标题，10字内","text":"事件经过，60~120字"}' : ""}}`
        }
      ],
      { maxTokens: 3000, temperature: 0.95 }
    );
    const o = F.parseJsonLoose(txt);
    if (!o || !Array.isArray(o.life)) throw new Error("生成格式不对，再试一次");
    return { o, nd, ns };
  }

  /* ───── 操作 ───── */
  async function advance() {
    if (busy) return;
    if (!F.hasApiKey()) return toast("请先在设置里填写 API Key");
    busy = true;
    render();
    try {
      const { o, nd, ns } = await aiAdvance();
      S.day = nd;
      S.slot = ns;
      for (const x of o.life) {
        const r = resByName(x.who);
        if (!r || !x.text) continue;
        const pl = placeByName(x.place) || placeById(r.place);
        S.feed.push({ id: uid(), day: nd, slot: ns, kind: "life", who: r.id, place: pl.id, text: String(x.text).slice(0, 160), mood: String(x.mood || "").slice(0, 4) });
        r.mood = String(x.mood || r.mood || "").slice(0, 4);
      }
      if (o.event && o.event.text) {
        const who = (Array.isArray(o.event.who) ? o.event.who : []).map(resByName).filter(Boolean);
        const pl = placeByName(o.event.place) || PLACES[10];
        S.feed.push({ id: uid(), day: nd, slot: ns, kind: "event", whoList: who.map((r) => r.id), place: pl.id, title: String(o.event.title || "小镇事件").slice(0, 20), text: String(o.event.text).slice(0, 300) });
        for (const r of who) {
          r.memory.push(`第${nd}天${SLOTS[ns]}：${String(o.event.title || o.event.text).slice(0, 30)}`);
          if (r.memory.length > 8) r.memory = r.memory.slice(-8);
        }
      }
      S.pendingEvent = "";
      save();
      toast(`${SLOT_ICON[ns]} ${timeLabel(nd, ns)}`);
    } catch (err) {
      toast("推进失败：" + err.message);
    } finally {
      busy = false;
      render();
    }
  }

  async function chatWith(r) {
    r.chat = r.chat || [];
    const sh = F.openSheet(
      `<div class="pt-chat-head">${resAv(r, "fun-av")}<div><strong>${esc(r.name)}</strong><small>${esc(r.job)} · ${esc(placeById(r.place).name)}</small></div></div>
       <div class="pt-chat-log" id="pt-chat-log"></div>
       <div class="sv-cmt-input"><input type="text" placeholder="镇长想说…" maxlength="150" /><button type="button" class="fun-btn solid sm">发送</button></div>`,
      { title: "镇长来访" }
    );
    sh.el.classList.add("fun-sheet--tall");
    const log = sh.body.querySelector("#pt-chat-log");
    const draw = (typing) => {
      log.innerHTML =
        (r.chat.length ? "" : `<p class="fun-note">${esc(r.name)}正在${esc(placeById(whereNow()[r.id] || r.place).name)}。打个招呼吧。</p>`) +
        r.chat.map((m) => `<p class="${m.who === "mayor" ? "is-me" : ""}">${esc(m.text)}</p>`).join("") +
        (typing ? `<p class="is-typing"><i></i><i></i><i></i></p>` : "");
      log.scrollTop = log.scrollHeight;
    };
    draw();
    const inp = sh.body.querySelector("input");
    const send = async () => {
      const t = inp.value.trim();
      if (!t) return;
      if (!F.hasApiKey()) return toast("请先在设置里填写 API Key");
      inp.value = "";
      r.chat.push({ who: "mayor", text: t });
      draw(true);
      try {
        const today = S.feed.filter((f) => f.day === S.day && (f.who === r.id || (f.whoList || []).includes(r.id))).map((f) => `${SLOTS[f.slot]}：${f.title ? f.title + "，" : ""}${f.text}`);
        const txt = await F.aiText(
          [
            {
              role: "system",
              content: `你是 Pocket Town 小镇的居民「${r.name}」，职业是${r.job}，在${placeById(r.place).name}工作。${r.persona ? "性格/人设：" + r.persona + "\n" : ""}${r.memory.length ? "你最近的经历：" + r.memory.join("；") + "\n" : ""}${today.length ? "你今天到目前为止：" + today.join("；") + "\n" : ""}镇长（${(await F.loadUser()).name}）来找你聊天。现在是${timeLabel(S.day, S.slot)}。用你的口吻自然回应，可以聊工作、抱怨、八卦镇上的事、给镇长提建议。1~3 句，只输出你说的话。`
            },
            ...r.chat.slice(-12).map((m) => ({ role: m.who === "mayor" ? "user" : "assistant", content: m.text }))
          ],
          { maxTokens: 500 }
        );
        r.chat.push({ who: "res", text: F.cleanLine(txt, 300, r.name) });
        if (r.chat.length > 30) r.chat = r.chat.slice(-30);
        save();
      } catch (err) {
        toast("对方没听清：" + err.message);
      }
      if (sh.el.isConnected) draw();
    };
    sh.body.querySelector("button").onclick = send;
    inp.addEventListener("keydown", (e) => e.key === "Enter" && !e.isComposing && send());
  }

  function openPlace(pid) {
    const pl = placeById(pid);
    const now = whereNow();
    const here = S.residents.filter((r) => now[r.id] === pid);
    const workers = S.residents.filter((r) => r.place === pid && !here.includes(r));
    const hist = S.feed.filter((f) => f.place === pid).slice(-8).reverse();
    const sh = F.openSheet(
      `<p class="fun-kicker">${timeLabel(S.day, S.slot)} · 现在在这里</p>
       <div class="pt-people">${here.length ? here.map((r) => `<button type="button" class="pt-person" data-r="${r.id}">${resAv(r, "fun-av")}<strong>${esc(r.name)}</strong><small>${esc(r.job)}</small></button>`).join("") : `<p class="fun-note">现在没有人</p>`}</div>
       ${workers.length ? `<p class="fun-kicker">在这里上班（现在不在）</p><div class="pt-people">${workers.map((r) => `<button type="button" class="pt-person is-away" data-r="${r.id}">${resAv(r, "fun-av")}<strong>${esc(r.name)}</strong><small>${esc(r.job)}</small></button>`).join("")}</div>` : ""}
       <p class="fun-kicker">最近发生</p>
       <div class="pt-hist">${hist.length ? hist.map(feedItemHtml).join("") : `<p class="fun-note">还没有故事</p>`}</div>`,
      { title: `${pl.icon} ${pl.name}` }
    );
    sh.el.classList.add("fun-sheet--tall");
    sh.body.addEventListener("click", (e) => {
      const b = e.target.closest("[data-r]");
      if (!b) return;
      sh.close();
      openResident(resById(b.dataset.r));
    });
  }

  function openResident(r) {
    if (!r) return;
    const mine = S.feed.filter((f) => f.who === r.id || (f.whoList || []).includes(r.id)).slice(-6).reverse();
    const sh = F.openSheet(
      `<div class="pt-prof">${resAv(r, "fun-av sv-prof-av")}<strong>${esc(r.name)} ${esc(r.mood || "")}</strong><em class="bb-tag">${r.charId ? "主要角色" : "NPC"}</em>
        <p class="fun-note">${esc(String(r.persona || "").split("\n")[0].slice(0, 80))}</p></div>
       <label class="fun-field"><span>职业（镇长可以改）</span><input id="pt-job" value="${esc(r.job)}" maxlength="20" /></label>
       <label class="fun-field"><span>工作地点</span><select id="pt-place">${PLACES.map((p) => `<option value="${p.id}" ${p.id === r.place ? "selected" : ""}>${p.icon} ${p.name}</option>`).join("")}</select></label>
       ${r.memory.length ? `<p class="fun-kicker">TA 记得的事</p><ul class="pt-mem">${r.memory.slice().reverse().map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
       <p class="fun-kicker">最近动态</p><div class="pt-hist">${mine.length ? mine.map(feedItemHtml).join("") : `<p class="fun-note">还没有动态</p>`}</div>
       <div class="fun-sheet-actions">${r.charId ? "" : `<button type="button" class="fun-btn ghost" data-a="del">请 TA 搬走</button>`}<button type="button" class="fun-btn ghost" data-a="save">保存</button><button type="button" class="fun-btn solid" data-a="chat">去聊聊</button></div>`,
      { title: "居民档案" }
    );
    sh.el.classList.add("fun-sheet--tall");
    sh.body.addEventListener("click", (e) => {
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (!a) return;
      const job = sh.body.querySelector("#pt-job").value.trim();
      const place = sh.body.querySelector("#pt-place").value;
      if (a === "save" || a === "chat") {
        if (job && (job !== r.job || place !== r.place)) {
          const before = `${r.job}@${placeById(r.place).name}`;
          r.job = job;
          r.place = place;
          r.memory.push(`第${S.day}天：镇长把我的工作从「${before}」调成了「${job}@${placeById(place).name}」`);
          S.feed.push({ id: uid(), day: S.day, slot: S.slot, kind: "mayor", place: "hall", text: `镇长任命 ${r.name} 为${placeById(place).name}的${job}` });
          save();
          toast("任命已生效");
          render();
        }
        if (a === "chat") {
          sh.close();
          chatWith(r);
        }
      }
      if (a === "del") {
        if (e.target.dataset.sure !== "1") {
          e.target.dataset.sure = "1";
          e.target.textContent = "再点一次确认";
          return;
        }
        S.residents = S.residents.filter((x) => x !== r);
        S.feed.push({ id: uid(), day: S.day, slot: S.slot, kind: "mayor", place: "hall", text: `${r.name} 搬离了小镇` });
        save();
        sh.close();
        render();
      }
    });
  }

  /* ───── 镇长办公室 ───── */
  async function recruit() {
    if (!F.hasApiKey()) return toast("请先在设置里填写 API Key");
    const cast = await syncCast();
    const notIn = cast.filter((c) => !S.residents.some((r) => r.charId === c.id));
    const sh = F.openSheet(
      `${notIn.length ? `<p class="fun-kicker">邀请角色入住</p><div class="pt-people">${notIn.map((c) => `<button type="button" class="pt-person" data-c="${esc(c.id)}">${avHtml(c, "fun-av")}<strong>${esc(c.name)}</strong></button>`).join("")}</div>` : ""}
       <p class="fun-kicker">招一位新 NPC</p>
       <label class="fun-field"><span>想要什么样的居民？（可不填，让 AI 决定）</span><input id="pt-want" placeholder="比如：新开面包店的老板" maxlength="40" /></label>
       <div class="fun-sheet-actions"><button type="button" class="fun-btn solid" data-a="npc">发布招募</button></div>`,
      { title: "招新居民" }
    );
    sh.body.addEventListener("click", async (e) => {
      const cb = e.target.closest("[data-c]");
      const go = e.target.closest('[data-a="npc"]');
      if (!cb && !go) return;
      const btn = e.target.closest("button");
      btn.disabled = true;
      try {
        if (cb) {
          const c = notIn.find((x) => x.id === cb.dataset.c);
          const o = await aiFoundTown([c], 0);
          const a = o.chars[0] || {};
          addResident({ charId: c.id, name: c.name, avatar: c.avatar, persona: c.persona, job: a.job || "自由职业", place: (placeByName(a.place) || PLACES[8]).id });
        } else {
          const want = sh.body.querySelector("#pt-want").value.trim();
          const txt = await F.aiText(
            [
              { role: "system", content: `为温馨小镇 Pocket Town 生成一位新 NPC 居民。地点只有：${PLACES.map((p) => p.name).join("、")}。只输出 JSON。` },
              { role: "user", content: `现有居民：${S.residents.map((r) => r.name + "（" + r.job + "）").join("、")}\n${want ? "镇长的要求：" + want : "补一个小镇缺少的职业"}\n格式：{"name":"名字","persona":"性格，20~40字","job":"职业","place":"地点"}` }
            ],
            { maxTokens: 500, temperature: 0.95 }
          );
          const o = F.parseJsonLoose(txt);
          if (!o || !o.name) throw new Error("格式不对");
          addResident({ name: String(o.name).slice(0, 12), persona: String(o.persona || ""), job: String(o.job || "居民").slice(0, 20), place: (placeByName(o.place) || PLACES[10]).id });
        }
        save();
        sh.close();
        render();
      } catch (err) {
        toast("失败：" + err.message);
        btn.disabled = false;
      }
    });
  }

  function addResident(x) {
    const r = { id: uid(), memory: [], mood: "🙂", chat: [], avatar: "", ...x };
    S.residents.push(r);
    S.feed.push({ id: uid(), day: S.day, slot: S.slot, kind: "mayor", place: "hall", text: `欢迎新居民 ${r.name} 入住！职业：${r.job}（${placeById(r.place).name}）` });
    toast(`${r.name} 搬进来了`);
  }

  /* ───── 渲染 ───── */
  function feedItemHtml(f) {
    const pl = placeById(f.place);
    if (f.kind === "event")
      return `<div class="pt-event"><p class="fun-kicker">✨ 小镇事件 · ${esc(pl.icon + pl.name)} · ${timeLabel(f.day, f.slot)}</p><strong>${esc(f.title)}</strong><p>${esc(f.text)}</p><div class="pt-event-who">${(f.whoList || []).map((id) => resById(id)).filter(Boolean).map((r) => resAv(r)).join("")}</div></div>`;
    if (f.kind === "mayor") return `<div class="pt-mayor">🏛 ${esc(f.text)}</div>`;
    const r = resById(f.who);
    if (!r) return "";
    return `<button type="button" class="pt-life" data-r="${r.id}">${resAv(r)}<span><small><b>${esc(r.name)}</b> · ${esc(r.job)} · ${pl.icon}${esc(pl.name)} ${esc(f.mood || "")}</small><span>${esc(f.text)}</span></span></button>`;
  }

  function render() {
    if (!root || !S) return;
    root.innerHTML = `<div class="pt">
      <div class="pt-clock"><span class="pt-time">${SLOT_ICON[S.slot]} ${timeLabel(S.day, S.slot)}</span>
        <button type="button" class="fun-btn solid sm" data-a="next" ${busy ? "disabled" : ""}>${busy ? "时间流逝中…" : `推进到${S.slot === 3 ? "第" + (S.day + 1) + "天早上" : SLOTS[S.slot + 1]} →`}</button></div>
      <div class="sh-tabs pt-tabs">${[["map", "地图"], ["feed", "动态"], ["people", "居民"], ["mayor", "镇长"]].map(([k, n]) => `<button type="button" data-tab="${k}" class="${tab === k ? "is-on" : ""}">${n}</button>`).join("")}</div>
      <div class="pt-panel" id="pt-panel"></div></div>`;
    const p = root.querySelector("#pt-panel");
    if (tab === "map") {
      const now = whereNow();
      p.innerHTML = `<div class="pt-map pt-map--${S.slot}">${PLACES.map((pl) => {
        const here = S.residents.filter((r) => now[r.id] === pl.id);
        return `<button type="button" class="pt-place" data-p="${pl.id}"><span class="pt-place-ico">${pl.icon}</span><strong>${pl.name}</strong><span class="pt-place-avs">${here.slice(0, 4).map((r) => resAv(r)).join("")}${here.length > 4 ? `<em>+${here.length - 4}</em>` : ""}</span></button>`;
      }).join("")}</div>
      ${S.slot === 3 ? `<p class="fun-note pt-tip">🌙 晚上大家各自回家了，没写到的人在家休息。</p>` : ""}
      ${S.feed.length ? "" : `<p class="fun-note pt-tip">点右上角「推进」让小镇的一天开始运转。</p>`}`;
    }
    if (tab === "feed") {
      const items = S.feed.slice(-80).reverse();
      let lastKey = "";
      p.innerHTML =
        items
          .map((f) => {
            const k = `${f.day}-${f.slot}`;
            const head = k !== lastKey ? `<p class="pt-sep">${SLOT_ICON[f.slot]} ${timeLabel(f.day, f.slot)}</p>` : "";
            lastKey = k;
            return head + feedItemHtml(f);
          })
          .join("") || `<p class="fun-note pt-tip">还没有动态，点「推进」开始。</p>`;
    }
    if (tab === "people") {
      const now = whereNow();
      p.innerHTML = `<div class="pt-res-list">${S.residents
        .map((r) => `<button type="button" class="pt-res" data-r="${r.id}">${resAv(r, "fun-av")}<span><strong>${esc(r.name)} ${esc(r.mood || "")}</strong><small>${esc(r.job)} · ${r.charId ? "主要角色" : "NPC"}</small><small>现在：${now[r.id] ? placeById(now[r.id]).icon + placeById(now[r.id]).name : "🏠 在家"}</small></span></button>`)
        .join("")}</div>`;
    }
    if (tab === "mayor") {
      p.innerHTML = `<div class="pt-office">
        <p class="fun-kicker">📢 发布公告</p>
        <p class="fun-note">居民会知道公告内容，接下来的日常会受影响。比如：「明天开始全镇停电两小时」「本周五举办夏日祭」。</p>
        <textarea id="pt-notice" rows="2" maxlength="120" placeholder="写一条公告…"></textarea>
        <button type="button" class="fun-btn solid sm" data-a="notice">发布</button>
        <p class="fun-kicker">🎪 发起活动</p>
        <p class="fun-note">下一次推进时间时，大家会围绕这个活动展开。</p>
        <input id="pt-event" maxlength="60" placeholder="比如：中央公园烧烤大会" value="${esc(S.pendingEvent || "")}" />
        <button type="button" class="fun-btn solid sm" data-a="event">${S.pendingEvent ? "修改活动" : "发起"}</button>
        <p class="fun-kicker">🏠 居民</p>
        <div class="ww-row"><button type="button" class="fun-btn ghost" data-a="recruit">招新居民</button><button type="button" class="fun-btn ghost" data-a="reset">重建小镇</button></div>
        ${S.notices.length ? `<p class="fun-kicker">历史公告</p><ul class="pt-mem">${S.notices.slice(-6).reverse().map((n) => `<li>第${n.day}天：${esc(n.text)}</li>`).join("")}</ul>` : ""}
      </div>`;
    }
  }

  function onClick(e) {
    const t = e.target.closest("[data-tab]");
    if (t) {
      tab = t.dataset.tab;
      return render();
    }
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "next") return void advance();
    if (a === "notice") {
      const v = root.querySelector("#pt-notice").value.trim();
      if (!v) return;
      S.notices.push({ day: S.day, text: v });
      S.feed.push({ id: uid(), day: S.day, slot: S.slot, kind: "mayor", place: "hall", text: `镇长公告：${v}` });
      save();
      toast("公告已张贴");
      return render();
    }
    if (a === "event") {
      S.pendingEvent = root.querySelector("#pt-event").value.trim();
      save();
      toast(S.pendingEvent ? "活动已安排，推进时间后开始" : "已取消活动");
      return render();
    }
    if (a === "recruit") return void recruit();
    if (a === "reset") {
      const b = e.target.closest("button");
      if (b.dataset.sure !== "1") {
        b.dataset.sure = "1";
        b.textContent = "再点一次：清空并重建";
        return;
      }
      S = null;
      F.FunDB.set(KV, null).catch(() => {});
      return void renderSetup();
    }
    const pl = e.target.closest("[data-p]");
    if (pl) return openPlace(pl.dataset.p);
    const r = e.target.closest("[data-r]");
    if (r) return openResident(resById(r.dataset.r));
  }

  async function renderSetup() {
    const cast = await F.loadCast();
    if (!root) return;
    let picked = cast.slice(0, 6);
    root.innerHTML = `<div class="fun-setup"><div class="fun-hero">🏘️</div>
      <p class="fun-kicker">POCKET TOWN</p><h2 class="fun-h2">欢迎上任，镇长</h2>
      <p class="fun-note">选几位角色搬进小镇，AI 会按人设给他们安排工作，再招一批 NPC 居民。之后每推进一次时间，就能看到大家在忙什么。</p>
      <div class="fun-picked" id="pt-picked"></div>
      <label class="fun-field"><span>NPC 居民数量</span><select id="pt-npc"><option value="4">4 位</option><option value="6" selected>6 位</option><option value="8">8 位</option></select></label>
      <label class="fun-field"><span>小镇名字</span><input id="pt-name" maxlength="16" value="Pocket Town" /></label>
      ${F.hasApiKey() ? "" : `<p class="fun-note warn">没有填 API Key：会用预设 NPC 建镇，但小镇日常需要 API 才能生成。</p>`}
      <div class="fun-setup-btns"><button type="button" class="fun-btn ghost" id="pt-pick">选角色</button><button type="button" class="fun-btn solid" id="pt-go">建镇</button></div></div>`;
    const draw = () =>
      (root.querySelector("#pt-picked").innerHTML = picked.length
        ? picked.map((c) => `<span class="fun-chip">${avHtml(c, "fun-av sm")}${esc(c.name)}</span>`).join("")
        : `<p class="fun-note">角色库里还没有角色，小镇会只有 NPC。</p>`);
    draw();
    root.querySelector("#pt-pick").onclick = async () => {
      if (!cast.length) return toast("角色库里还没有角色");
      const r = await F.pickCast(cast, { min: 0, max: cast.length, preselect: picked.map((c) => c.id), title: "谁搬进小镇？" });
      if (r) {
        picked = r;
        draw();
      }
    };
    root.querySelector("#pt-go").onclick = async (e) => {
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = "正在建镇…";
      const npcN = Number(root.querySelector("#pt-npc").value);
      const town = { name: root.querySelector("#pt-name").value.trim() || "Pocket Town", day: 1, slot: 0, residents: [], feed: [], notices: [], pendingEvent: "" };
      try {
        let o = null;
        if (F.hasApiKey()) o = await aiFoundTown(picked, npcN);
        for (const c of picked) {
          const a = o?.chars?.find((x) => x.name === c.name) || {};
          town.residents.push({ id: uid(), charId: c.id, name: c.name, avatar: c.avatar, persona: c.persona, job: String(a.job || "自由职业").slice(0, 20), place: (placeByName(a.place) || pick(PLACES.slice(0, 10))).id, memory: [], mood: "🙂", chat: [] });
        }
        const npcs = o?.npcs?.length ? o.npcs : PRESET_NPCS.slice(0, npcN);
        for (const n of npcs.slice(0, npcN)) {
          if (!n || !n.name) continue;
          town.residents.push({ id: uid(), name: String(n.name).slice(0, 12), avatar: "", persona: String(n.persona || ""), job: String(n.job || "居民").slice(0, 20), place: (typeof n.place === "string" && PLACES.some((p) => p.id === n.place) ? placeById(n.place) : placeByName(n.place) || PLACES[10]).id, memory: [], mood: "🙂", chat: [] });
        }
        town.feed.push({ id: uid(), day: 1, slot: 0, kind: "mayor", place: "hall", text: `${town.name} 成立了！首批 ${town.residents.length} 位居民入住。` });
        S = town;
        save();
        tab = "map";
        if (root) {
          setTitle();
          render();
        }
      } catch (err) {
        toast("建镇失败：" + err.message);
        btn.disabled = false;
        btn.textContent = "建镇";
      }
    };
  }

  function setTitle() {
    const t = document.getElementById("fun-title");
    if (t && S) t.textContent = S.name || "Pocket Town";
  }

  F.register("Pocket Town", {
    title: "Pocket Town",
    kicker: "MAYOR · 口袋小镇",
    async mount(body) {
      root = document.createElement("div");
      root.className = "pt-root";
      body.appendChild(root);
      root.addEventListener("click", onClick);
      await load();
      if (!root) return;
      if (S && S.residents) {
        await syncCast();
        setTitle();
        render();
      } else void renderSetup();
    },
    unmount() {
      root = null;
    }
  });
})();
