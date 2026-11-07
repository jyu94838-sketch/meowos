"use strict";

/**
 * 情侣小屋：你和一位角色的情侣空间
 * 首页（在一起天数 / 纪念日倒数 / TA 的今日悄悄话 / 心情打卡）、
 * 恋爱日记（TA 会回复，也会写自己的日记）、恋爱清单、纪念日、每日一问、相册
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast, pick, uid, avHtml } = F;

  const KV = "couple_v1";
  const MOODS = ["🥰", "😊", "😌", "🥺", "😤", "😭", "😴", "🤒"];
  const LIST = [
    "一起看日出", "一起看一场电影", "交换手写信", "一起做一顿饭", "穿情侣装出门", "一起去游乐园", "拍一组情侣写真", "一起淋一场雨",
    "给对方剪一次头发", "一起去看海", "一起熬夜聊到天亮", "一起养一盆植物", "一起去旅行", "给对方准备惊喜", "一起看星星", "一起逛超市",
    "一起打一局游戏", "互相化妆", "一起拼一副拼图", "一起去图书馆", "一起学一项新技能", "一起去看演唱会", "一起放烟花", "一起堆雪人",
    "一起去天文馆", "在对方生病时照顾 TA", "一起做蛋糕", "一起去一次寺庙许愿", "一起看一部完整的剧", "一起去露营"
  ];
  const QUESTIONS = [
    "第一次心动是什么时候？", "如果我们一起去旅行，你最想去哪里？", "你觉得我最可爱的一个小习惯是什么？", "你最想和我一起做的一件小事是什么？",
    "吵架的时候，你最希望我怎么做？", "你觉得我们像哪两种动物？", "如果明天是世界末日，今天你想怎么过？", "你小时候的梦想是什么？",
    "你最喜欢我叫你什么？", "我们老了以后，你想住在什么样的地方？", "你偷偷为我做过什么我不知道的事？", "最近一次因为我开心是什么时候？",
    "你最想对十年后的我们说什么？", "你觉得爱是什么？", "有什么话一直想说但没说出口？", "我们的第一次约会，你最记得什么？"
  ];
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const daysBetween = (a, b) => Math.floor((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);

  let S = null; // { partnerId, by: { [charId]: room } }
  let root = null;
  let tab = "home";
  let partner = null;
  let user = null;

  async function load() {
    try {
      S = (await F.FunDB.get(KV)) || null;
    } catch (_) {
      S = null;
    }
    if (!S) S = { partnerId: "", by: {} };
  }
  function save() {
    F.FunDB.set(KV, S).catch(() => toast("保存失败：存储空间不足"));
  }
  const room = () => {
    const id = partner?.id;
    if (!S.by[id]) S.by[id] = { start: dayKey(), nick: "", anniv: [], diary: [], list: {}, qa: {}, photos: [], daily: {}, mood: {} };
    return S.by[id];
  };

  /* ───── AI ───── */
  function ctx() {
    const R = room();
    const together = daysBetween(R.start, dayKey()) + 1;
    const recent = R.diary.slice(-4).map((d) => `${d.date} ${d.by === "me" ? user.name : partner.name}的日记：${d.text.slice(0, 60)}`);
    const done = Object.entries(R.list).filter(([, v]) => v.done).map(([k]) => LIST[Number(k)]).slice(-6);
    return `你是「${partner.name}」，和${user.name}是恋人，已经在一起 ${together} 天${R.nick ? `，你叫TA「${R.nick}」` : ""}。${partner.persona ? "你的人设：\n" + partner.persona + "\n" : ""}${user.persona ? `${user.name}的人设：${user.persona}\n` : ""}${recent.length ? "最近的日记：\n" + recent.join("\n") + "\n" : ""}${done.length ? "你们一起完成过的事：" + done.join("、") + "\n" : ""}用你的性格和说话方式，像真的恋人一样自然、具体，不要写成客服腔。只输出你说的话。`;
  }
  async function say(instruction, max) {
    const txt = await F.aiText(
      [
        { role: "system", content: ctx() },
        { role: "user", content: instruction }
      ],
      { maxTokens: max || 600 }
    );
    return F.cleanLine(txt, 600, partner.name);
  }
  const needKey = () => {
    if (F.hasApiKey()) return false;
    toast("请先在设置里填写 API Key");
    return true;
  };

  /* ───── 渲染 ───── */
  function render() {
    if (!root) return;
    if (!partner) return renderPick();
    const R = room();
    const together = daysBetween(R.start, dayKey()) + 1;
    root.innerHTML = `<div class="cp">
      <div class="cp-top">
        <div class="cp-avs">${avHtml(user, "fun-av cp-av")}<span class="cp-heart">❤</span>${avHtml(partner, "fun-av cp-av")}</div>
        <p class="cp-days">我们在一起 <b>${together}</b> 天</p>
        <small>${esc(user.name)} & ${esc(partner.name)} · 从 ${R.start.replace(/-/g, ".")} 开始</small>
      </div>
      <div class="cp-tabs">${[["home", "🏠", "小屋"], ["diary", "📔", "日记"], ["list", "✅", "清单"], ["qa", "💬", "一问"], ["pet", "🐾", "宠物"], ["anniv", "📅", "纪念日"], ["album", "📷", "相册"]].map(([k, i, n]) => `<button type="button" data-tab="${k}" class="${tab === k ? "is-on" : ""}"><span>${i}</span>${n}</button>`).join("")}</div>
      <div class="cp-panel" id="cp-panel"></div></div>`;
    const p = root.querySelector("#cp-panel");
    ({ home: renderHome, diary: renderDiary, list: renderList, qa: renderQa, pet: renderPet, anniv: renderAnniv, album: renderAlbum })[tab](p);
  }

  function nextAnniv() {
    const R = room();
    const t = dayKey();
    const items = [{ name: "在一起", date: R.start, yearly: true }, ...R.anniv];
    let best = null;
    for (const a of items) {
      let d = a.date;
      if (a.yearly) {
        const [, m, dd] = a.date.split("-");
        const y = new Date().getFullYear();
        d = `${y}-${m}-${dd}`;
        if (d < t) d = `${y + 1}-${m}-${dd}`;
      }
      if (d < t) continue;
      const left = daysBetween(t, d);
      if (!best || left < best.left) best = { ...a, left, on: d };
    }
    // 100 天倍数里程碑
    const together = daysBetween(R.start, t) + 1;
    const next100 = Math.ceil((together + (together % 100 === 0 ? 0 : 0)) / 100) * 100 || 100;
    const left100 = next100 - together;
    if (!best || left100 < best.left) best = { name: `在一起 ${next100} 天`, left: left100 };
    return best;
  }

  function renderHome(p) {
    const R = room();
    const t = dayKey();
    const daily = R.daily[t];
    const myMood = R.mood[t]?.me;
    const taMood = R.mood[t]?.ta;
    const na = nextAnniv();
    p.innerHTML = `
      <div class="cp-card cp-note">
        <p class="fun-kicker">💌 ${esc(partner.name)} 的今日悄悄话</p>
        ${daily ? `<p class="cp-whisper">${esc(daily)}</p>` : `<button type="button" class="fun-btn solid sm" data-a="daily">拆开今天的悄悄话</button>`}
      </div>
      <div class="cp-card">
        <p class="fun-kicker">今天的心情</p>
        <div class="cp-moods">${MOODS.map((m) => `<button type="button" class="cp-mood${myMood === m ? " is-on" : ""}" data-mood="${m}">${m}</button>`).join("")}</div>
        ${taMood ? `<p class="cp-ta-mood">${avHtml(partner, "fun-av sm")} ${esc(partner.name)} 今天：<b>${esc(taMood.m)}</b> ${esc(taMood.t)}</p>` : myMood ? `<p class="fun-note">${esc(partner.name)} 看到你的心情了…</p>` : `<p class="fun-note">打卡后 TA 也会告诉你 TA 的心情</p>`}
      </div>
      <div class="cp-card cp-count"><span>📅</span><div><strong>${na.left === 0 ? "就是今天！" : `还有 ${na.left} 天`}</strong><small>${esc(na.name)}</small></div></div>
      <div class="cp-row">
        <button type="button" class="cp-tile" data-tab="qa"><span>💬</span>今日一问${R.qa[t]?.me ? " ✓" : ""}</button>
        <button type="button" class="cp-tile" data-tab="list"><span>✅</span>恋爱清单 ${Object.values(R.list).filter((v) => v.done).length}/${LIST.length}</button>
      </div>
      <button type="button" class="cp-tile cp-tile-wide" data-a="theater"><span>🎬</span><b>小剧场</b><small>${(R.theaters || []).length ? `已收藏 ${R.theaters.length} 个` : "生成一段你们俩的小故事"}</small></button>
      <div class="cp-foot"><button type="button" class="sh-link" data-a="settings">小屋设置</button> · <button type="button" class="sh-link" data-a="switch">换一位恋人</button></div>`;
  }

  function renderDiary(p) {
    const R = room();
    p.innerHTML = `<div class="cp-card"><textarea id="cp-dtext" rows="3" maxlength="500" placeholder="今天想对 TA 说的话，或者记下今天发生的事…"></textarea>
      <div class="ww-row"><button type="button" class="fun-btn ghost sm" data-a="tadiary">看看 TA 今天写了什么</button><button type="button" class="fun-btn solid sm" data-a="write">写进日记</button></div></div>
      <div class="cp-diary">${
        R.diary.length
          ? R.diary
              .slice()
              .reverse()
              .map(
                (d) => `<div class="cp-entry${d.by === "ta" ? " is-ta" : ""}"><p class="fun-kicker">${d.date.replace(/-/g, ".")} · ${d.by === "me" ? esc(user.name) : esc(partner.name)} 的日记</p><p>${esc(d.text).replace(/\n/g, "<br/>")}</p>
            ${d.reply ? `<div class="cp-reply">${avHtml(d.by === "me" ? partner : user, "fun-av sm")}<span>${esc(d.reply)}</span></div>` : d.by === "me" ? `<p class="fun-note">等 TA 回复…</p>` : ""}</div>`
              )
              .join("")
          : `<p class="fun-note cp-center">还没有日记。写下第一篇吧，TA 会认真回复的。</p>`
      }</div>`;
  }

  function renderList(p) {
    const R = room();
    const n = Object.values(R.list).filter((v) => v.done).length;
    p.innerHTML = `<div class="cp-progress"><span style="width:${(n / LIST.length) * 100}%"></span></div><p class="fun-note cp-center">完成了 ${n} / ${LIST.length} 件小事</p>
      <div class="cp-list">${LIST.map((it, i) => {
        const v = R.list[i] || {};
        return `<button type="button" class="cp-li${v.done ? " is-done" : ""}" data-li="${i}"><span class="cp-check">${v.done ? "✓" : ""}</span><span><strong>${esc(it)}</strong>${v.done ? `<small>${esc(v.date || "")}${v.reply ? " · " + esc(partner.name) + "：" + esc(v.reply) : ""}</small>` : ""}</span></button>`;
      }).join("")}</div>`;
  }

  function todayQuestion() {
    const t = dayKey();
    const n = Number(t.replace(/-/g, "")) % QUESTIONS.length;
    return QUESTIONS[n];
  }
  function renderQa(p) {
    const R = room();
    const t = dayKey();
    const q = R.qa[t]?.q || todayQuestion();
    const cur = R.qa[t] || {};
    const past = Object.entries(R.qa).filter(([d, v]) => d !== t && v.me && v.ta).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 10);
    p.innerHTML = `<div class="cp-card cp-q"><p class="fun-kicker">${t.replace(/-/g, ".")} · 每日一问</p><h3>${esc(q)}</h3>
        ${
          cur.me
            ? `<div class="cp-ans"><b>${esc(user.name)}</b><p>${esc(cur.me)}</p></div><div class="cp-ans is-ta"><b>${esc(partner.name)}</b><p>${cur.ta ? esc(cur.ta) : `<span class="is-typing"><i></i><i></i><i></i></span>`}</p></div>`
            : `<textarea id="cp-qa" rows="2" maxlength="300" placeholder="先写下你的答案，才能看到 TA 的"></textarea><button type="button" class="fun-btn solid sm" data-a="answer">提交答案</button>`
        }</div>
      ${past.length ? `<p class="fun-kicker">往期</p>${past.map(([d, v]) => `<div class="cp-card cp-past"><small>${d.replace(/-/g, ".")}</small><strong>${esc(v.q)}</strong><p><b>${esc(user.name)}：</b>${esc(v.me)}</p><p><b>${esc(partner.name)}：</b>${esc(v.ta)}</p></div>`).join("")}` : ""}`;
  }

  /* ───── 宠物窝 ───── */
  const PETS = [
    { k: "cat", n: "小猫", e: ["🐱", "🐈", "🐈‍⬛"] },
    { k: "dog", n: "小狗", e: ["🐶", "🐕", "🦮"] },
    { k: "rabbit", n: "兔兔", e: ["🐰", "🐇", "🐇"] },
    { k: "hamster", n: "仓鼠", e: ["🐹", "🐹", "🐹"] },
    { k: "penguin", n: "企鹅", e: ["🐧", "🐧", "🐧"] },
    { k: "fox", n: "小狐狸", e: ["🦊", "🦊", "🦊"] },
    { k: "duck", n: "小鸭", e: ["🐣", "🐥", "🦆"] },
    { k: "panda", n: "熊猫", e: ["🐼", "🐼", "🐼"] }
  ];
  const ACTS = {
    feed: { n: "喂饭", i: "🍖", d: { hunger: 35, mood: 5 }, say: ["吃得肚子圆滚滚", "狼吞虎咽", "吃完舔了舔嘴巴"] },
    bath: { n: "洗澡", i: "🛁", d: { clean: 45, mood: -5 }, say: ["一开始不情愿，洗完香喷喷", "甩了一身水", "泡泡糊了一脸"] },
    play: { n: "陪玩", i: "🧶", d: { mood: 30, hunger: -8, energy: -15 }, say: ["玩得满屋跑", "叼着玩具不肯放", "开心得转圈圈"] },
    sleep: { n: "哄睡", i: "🌙", d: { energy: 45 }, say: ["打着小呼噜睡着了", "缩成一团睡着了", "睡着了还在吧唧嘴"] },
    pet: { n: "摸摸", i: "🤲", d: { mood: 12 }, say: ["蹭了蹭手心", "舒服得眯起眼", "翻出肚皮"] }
  };
  const STAGE = (lv) => (lv >= 10 ? 2 : lv >= 4 ? 1 : 0);
  const STAGE_NAME = ["幼崽", "少年", "成年"];
  const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

  /** 按真实时间流逝衰减；离开太久 TA 会帮忙照顾 */
  function tickPet(pet) {
    const now = Date.now();
    const h = Math.max(0, (now - (pet.tick || now)) / 3600000);
    if (h > 0) {
      pet.hunger = clamp(pet.hunger - h * 6);
      pet.clean = clamp(pet.clean - h * 3);
      pet.mood = clamp(pet.mood - h * 4);
      pet.energy = clamp(pet.energy + h * 5);
      pet.tick = now;
    }
    // TA 每隔 5 小时以上会来照顾一次
    if (now - (pet.taAt || 0) > 5 * 3600000 && (pet.hunger < 60 || pet.clean < 60 || pet.mood < 60)) {
      const k = pet.hunger <= Math.min(pet.clean, pet.mood) ? "feed" : pet.clean <= pet.mood ? "bath" : "play";
      applyAct(pet, k, "ta");
      pet.taAt = now;
    }
  }
  function applyAct(pet, k, who) {
    const a = ACTS[k];
    for (const [stat, v] of Object.entries(a.d)) pet[stat] = clamp(pet[stat] + v);
    pet.exp += who === "me" ? 10 : 8;
    while (pet.exp >= pet.level * 30) {
      pet.exp -= pet.level * 30;
      pet.level++;
      pet.log.push({ at: Date.now(), who: "sys", text: `🎉 ${pet.name} 升到了 Lv.${pet.level}${STAGE(pet.level) !== STAGE(pet.level - 1) ? `，长成了${STAGE_NAME[STAGE(pet.level)]}！` : ""}` });
    }
    pet.log.push({ at: Date.now(), who, text: `${who === "me" ? user.name : partner.name}给${pet.name}${a.n}：${pick(a.say)}` });
    if (pet.log.length > 40) pet.log = pet.log.slice(-40);
  }

  function renderPet(p) {
    const R = room();
    if (!R.pet) {
      p.innerHTML = `<div class="cp-card cp-center"><p class="fun-kicker">🐾 一起养一只小宠物吧</p><div class="cp-pet-types">${PETS.map((x) => `<button type="button" class="cp-pet-type" data-pt="${x.k}"><span>${x.e[0]}</span>${x.n}</button>`).join("")}</div>
        <input id="cp-pname" maxlength="8" placeholder="给 TA 起个名字" /><button type="button" class="fun-btn solid" data-a="adopt">领养</button></div>`;
      let sel = PETS[0].k;
      const mark = () => p.querySelectorAll("[data-pt]").forEach((b) => b.classList.toggle("is-on", b.dataset.pt === sel));
      p.querySelectorAll("[data-pt]").forEach((b) => (b.onclick = () => ((sel = b.dataset.pt), mark())));
      mark();
      p.querySelector('[data-a="adopt"]').onclick = async () => {
        const type = PETS.find((x) => x.k === sel);
        const name = p.querySelector("#cp-pname").value.trim() || type.n;
        R.pet = { type: sel, name, born: dayKey(), level: 1, exp: 0, hunger: 80, clean: 80, mood: 80, energy: 80, tick: Date.now(), taAt: Date.now(), log: [{ at: Date.now(), who: "sys", text: `${user.name}和${partner.name}领养了${type.n}「${name}」🎀` }] };
        save();
        render();
        if (F.hasApiKey()) {
          try {
            R.pet.log.push({ at: Date.now(), who: "ta", text: await say(`你和${user.name}刚刚一起领养了一只${type.n}，取名「${name}」。说一句话（25字内）。`, 300) });
            save();
            if (tab === "pet") render();
          } catch (_) {
            /* ignore */
          }
        }
      };
      return;
    }
    const pet = R.pet;
    tickPet(pet);
    save();
    const type = PETS.find((x) => x.k === pet.type) || PETS[0];
    const st = STAGE(pet.level);
    const low = pet.hunger < 30 ? "饿了…" : pet.clean < 30 ? "有点脏脏的" : pet.mood < 30 ? "好无聊" : pet.energy < 25 ? "困困" : "";
    const bar = (k, n, c) => `<div class="cp-stat"><span>${n}</span><i><b style="width:${pet[k]}%;background:${c}"></b></i><em>${pet[k]}</em></div>`;
    p.innerHTML = `<div class="cp-card cp-pethome">
        <div class="cp-pet-stage"><span class="cp-pet-emoji st-${st}${pet.energy < 25 ? " is-sleepy" : ""}">${type.e[st]}</span>${low ? `<span class="cp-pet-bubble">${low}</span>` : ""}</div>
        <strong>${esc(pet.name)}</strong><small>${type.n} · ${STAGE_NAME[st]} · Lv.${pet.level}（${pet.exp}/${pet.level * 30}）· 第 ${daysBetween(pet.born, dayKey()) + 1} 天</small>
        ${bar("hunger", "饱腹", "#ffb86b")}${bar("clean", "清洁", "#7cc4e8")}${bar("mood", "心情", "#ff8fab")}${bar("energy", "精力", "#a78bfa")}
        <div class="cp-acts">${Object.entries(ACTS).map(([k, a]) => `<button type="button" data-act="${k}"><span>${a.i}</span>${a.n}</button>`).join("")}</div>
      </div>
      <div class="ww-row"><button type="button" class="fun-btn ghost sm" data-a="petask">问问 ${esc(partner.name)} 关于${esc(pet.name)}</button></div>
      <p class="fun-kicker" style="margin-top:12px">养育日记</p>
      <div class="cp-petlog">${pet.log.slice().reverse().map((l) => `<p class="${l.who}"><small>${new Date(l.at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small>${esc(l.text)}</p>`).join("")}</div>`;
  }

  /* ───── 小剧场 ───── */
  const THEMES = ["下雨天没带伞", "TA 吃醋了", "你生病了", "同居的早晨", "第一次见面", "平行世界 AU", "吵架后和好", "深夜打电话", "一起去旅行", "纪念日惊喜", "TA 喝醉了", "十年后的我们"];
  function readTheaterPresets() {
    try {
      const D = window.XXJ_DB;
      const arr = D.getKv(D.K.THEATER_PRESETS);
      return Array.isArray(arr) ? arr.filter((x) => x && x.name) : [];
    } catch (_) {
      return [];
    }
  }
  function openTheater() {
    const R = room();
    R.theaters = R.theaters || [];
    const presets = readTheaterPresets();
    let theme = THEMES[0];
    const sh = F.openSheet(
      `<p class="fun-kicker">选一个主题</p>
       <div class="cp-themes">${THEMES.map((t, i) => `<button type="button" class="fun-chip-btn${i === 0 ? " is-on" : ""}" data-th="${esc(t)}">${esc(t)}</button>`).join("")}</div>
       <label class="fun-field"><span>或者自己写设定（选填）</span><input id="cp-th-custom" maxlength="80" placeholder="比如：TA 是吸血鬼，我是送外卖的" /></label>
       ${presets.length ? `<label class="fun-field"><span>套用我的小剧场预设（选填）</span><select id="cp-th-preset"><option value="">不用</option>${presets.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</select></label>` : ""}
       <button type="button" class="fun-btn solid wide" data-a="gen">🎬 开拍</button>
       <p class="fun-kicker" style="margin-top:16px">收藏的小剧场</p>
       <div class="cp-th-list">${R.theaters.length ? R.theaters.slice().reverse().map((t) => `<button type="button" class="cp-th-item" data-tid="${t.id}">${t.img ? `<img src="${esc(t.img)}" alt="" />` : `<span>🎬</span>`}<div><strong>${esc(t.title)}</strong><small>${esc(t.theme)} · ${t.date}</small></div></button>`).join("") : `<p class="fun-note">还没有小剧场</p>`}</div>`,
      { title: "🎬 小剧场" }
    );
    sh.el.classList.add("fun-sheet--tall");
    sh.body.addEventListener("click", async (e) => {
      const th = e.target.closest("[data-th]");
      if (th) {
        theme = th.dataset.th;
        sh.body.querySelectorAll("[data-th]").forEach((b) => b.classList.toggle("is-on", b === th));
        return;
      }
      const it = e.target.closest("[data-tid]");
      if (it) {
        sh.close();
        return readTheater(R.theaters.find((t) => t.id === it.dataset.tid));
      }
      if (!e.target.closest('[data-a="gen"]')) return;
      if (needKey()) return;
      const btn = e.target.closest("button");
      const custom = sh.body.querySelector("#cp-th-custom").value.trim();
      const pid = sh.body.querySelector("#cp-th-preset")?.value;
      const preset = presets.find((x) => String(x.id) === pid);
      btn.disabled = true;
      btn.textContent = "正在拍摄…";
      try {
        const txt = await F.aiText(
          [
            { role: "system", content: ctx().replace("只输出你说的话。", "") + "\n现在请你作为编剧，写你和" + user.name + "的恋爱小剧场。只输出 JSON。" },
            {
              role: "user",
              content: `主题：${custom || theme}\n${preset ? `写作要求（来自用户的小剧场预设「${preset.name}」）：${String(preset.instruction || "").slice(0, 800)}\n` : ""}要求：300~600 字，有画面、有动作、有对白，两个人都要符合各自的性格；称呼用名字；结尾留一点余韵。\n格式：{"title":"小剧场标题，12 字内","text":"正文，可以分段"}`
            }
          ],
          { maxTokens: 2000, temperature: 0.95 }
        );
        const o = F.parseJsonLoose(txt) || { title: custom || theme, text: txt };
        const t = { id: uid(), theme: custom || theme, title: String(o.title || theme).slice(0, 24), text: String(o.text || "").slice(0, 3000), date: dayKey() };
        R.theaters.push(t);
        save();
        sh.close();
        render();
        readTheater(t);
      } catch (err) {
        toast("失败：" + err.message);
        btn.disabled = false;
        btn.textContent = "🎬 开拍";
      }
    });
  }

  function readTheater(t) {
    if (!t) return;
    const sh = F.openSheet(
      `<div class="cp-th-read">${t.img ? `<img src="${esc(t.img)}" alt="" />` : ""}<p class="fun-kicker">${esc(t.theme)} · ${t.date}</p>
        ${esc(t.text).split(/\n+/).map((x) => `<p>${x}</p>`).join("")}</div>
       <div class="fun-sheet-actions">${F.hasImageGen() ? `<button type="button" class="fun-btn ghost" data-a="img">🎨 ${t.img ? "重新配图" : "配一张图"}</button>` : ""}<button type="button" class="fun-btn ghost" data-a="del">删除</button><button type="button" class="fun-btn solid" data-a="more">再来一个</button></div>`,
      { title: t.title }
    );
    sh.el.classList.add("fun-sheet--tall");
    sh.body.addEventListener("click", async (e) => {
      const a = e.target.closest("[data-a]")?.dataset.a;
      const btn = e.target.closest("button");
      if (a === "more") {
        sh.close();
        return openTheater();
      }
      if (a === "del") {
        if (btn.dataset.sure !== "1") {
          btn.dataset.sure = "1";
          btn.textContent = "再点一次删除";
          return;
        }
        const R = room();
        R.theaters = R.theaters.filter((x) => x !== t);
        save();
        sh.close();
        return render();
      }
      if (a === "img") {
        btn.disabled = true;
        btn.textContent = "配图中…";
        try {
          t.img = await F.genImage(`恋爱小剧场插图。${t.title}。${t.text.slice(0, 300)}`, { chars: [{ name: partner.name, look: partner.look }], style: "romantic illustration, soft light" });
          save();
          sh.close();
          readTheater(t);
        } catch (err) {
          toast(err.message);
          btn.disabled = false;
          btn.textContent = "🎨 配一张图";
        }
      }
    });
  }

  function renderAnniv(p) {
    const R = room();
    const t = dayKey();
    const list = [{ id: "start", name: "在一起", date: R.start, yearly: true, fixed: true }, ...R.anniv];
    p.innerHTML = `<div class="cp-annivs">${list
      .map((a) => {
        const passed = daysBetween(a.date, t);
        return `<div class="cp-card cp-anniv"><div><strong>${esc(a.name)}</strong><small>${a.date.replace(/-/g, ".")}${a.yearly ? " · 每年" : ""}</small></div><span class="cp-big">${passed >= 0 ? `已经 <b>${passed}</b> 天` : `还有 <b>${-passed}</b> 天`}</span>${a.fixed ? "" : `<button type="button" class="sh-link" data-del="${a.id}">删除</button>`}</div>`;
      })
      .join("")}</div>
      <div class="cp-card"><p class="fun-kicker">添加纪念日</p><input id="cp-an" maxlength="20" placeholder="比如：第一次约会 / TA 的生日" /><input id="cp-ad" type="date" />
        <label class="fun-switch"><input type="checkbox" id="cp-ay" checked /><span>每年重复</span></label><button type="button" class="fun-btn solid sm" data-a="addanniv">添加</button></div>`;
  }

  function renderAlbum(p) {
    const R = room();
    p.innerHTML = `<div class="cp-album-head"><button type="button" class="fun-btn solid sm" data-a="photo">＋ 放一张照片</button><input type="file" accept="image/*" hidden id="cp-file" /></div>
      <div class="cp-album">${
        R.photos.length
          ? R.photos
              .slice()
              .reverse()
              .map((ph) => `<figure class="cp-photo" data-ph="${ph.id}"><img src="${esc(ph.img)}" alt="" /><figcaption>${esc(ph.cap || "")}<small>${ph.date.replace(/-/g, ".")}</small>${ph.reply ? `<em>${esc(partner.name)}：${esc(ph.reply)}</em>` : ""}</figcaption></figure>`)
              .join("")
          : `<p class="fun-note cp-center">相册还是空的</p>`
      }</div>`;
    p.querySelector("#cp-file").onchange = async (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      const img = await compress(f);
      openPhotoCaption(img);
    };
  }

  function compress(file) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      const url = URL.createObjectURL(file);
      im.onload = () => {
        const s = Math.min(1, 900 / Math.max(im.width, im.height));
        const c = document.createElement("canvas");
        c.width = Math.round(im.width * s);
        c.height = Math.round(im.height * s);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      im.onerror = reject;
      im.src = url;
    });
  }

  function openPhotoCaption(img) {
    const sh = F.openSheet(
      `<img class="cp-prev" src="${esc(img)}" alt="" /><label class="fun-field"><span>写一句话</span><input id="cp-cap" maxlength="60" placeholder="这是我们…" /></label><div class="fun-sheet-actions"><button type="button" class="fun-btn solid">放进相册</button></div>`,
      { title: "新照片" }
    );
    sh.body.querySelector("button").onclick = async () => {
      const R = room();
      const ph = { id: uid(), img, cap: sh.body.querySelector("#cp-cap").value.trim(), date: dayKey() };
      R.photos.push(ph);
      save();
      sh.close();
      render();
      if (!F.hasApiKey()) return;
      try {
        const msg = [
          { role: "system", content: ctx() },
          {
            role: "user",
            content: [
              { type: "text", text: `${user.name}往你们的情侣相册里放了一张照片${ph.cap ? "，配文：「" + ph.cap + "」" : ""}。看看照片，说一句话（30字内）。` },
              { type: "image_url", image_url: { url: img } }
            ]
          }
        ];
        let txt;
        try {
          txt = await F.aiText(msg, { maxTokens: 400 });
        } catch (_) {
          txt = await say(`${user.name}往你们的情侣相册里放了一张照片${ph.cap ? "，配文：「" + ph.cap + "」" : ""}（你看不到图）。说一句话（30字内）。`, 300);
        }
        ph.reply = F.cleanLine(txt, 80, partner.name);
        save();
        if (tab === "album") render();
      } catch (_) {
        /* ignore */
      }
    };
  }

  function openSettings() {
    const R = room();
    const sh = F.openSheet(
      `<label class="fun-field"><span>在一起的日子</span><input type="date" id="cp-start" value="${R.start}" /></label>
       <label class="fun-field"><span>TA 怎么叫你（爱称，选填）</span><input id="cp-nick" maxlength="10" value="${esc(R.nick || "")}" placeholder="宝宝 / 笨蛋 / 小猫…" /></label>
       <div class="fun-sheet-actions"><button type="button" class="fun-btn solid">保存</button></div>`,
      { title: "小屋设置" }
    );
    sh.body.querySelector("button").onclick = () => {
      R.start = sh.body.querySelector("#cp-start").value || R.start;
      R.nick = sh.body.querySelector("#cp-nick").value.trim();
      save();
      sh.close();
      render();
    };
  }

  async function renderPick() {
    const cast = await F.loadCast();
    if (!root) return;
    root.innerHTML = `<div class="fun-setup"><div class="fun-hero">🏡</div><p class="fun-kicker">COUPLE HOUSE</p><h2 class="fun-h2">情侣小屋</h2>
      <p class="fun-note">选一位角色成为你的恋人，一起记录在一起的每一天。每位恋人有各自独立的小屋，可以随时切换。</p>
      <div class="cp-pick">${cast.length ? cast.map((c) => `<button type="button" class="pt-person" data-pick="${esc(c.id)}">${avHtml(c, "fun-av")}<strong>${esc(c.name)}</strong>${S.by[c.id] ? `<small>❤ ${daysBetween(S.by[c.id].start, dayKey()) + 1} 天</small>` : ""}</button>`).join("") : `<p class="fun-note warn">角色库里还没有角色</p>`}</div></div>`;
    root.querySelectorAll("[data-pick]").forEach(
      (b) =>
        (b.onclick = () => {
          partner = cast.find((c) => c.id === b.dataset.pick);
          const isNew = !S.by[partner.id];
          S.partnerId = partner.id;
          room();
          save();
          tab = "home";
          render();
          if (isNew) openSettings();
        })
    );
  }

  /* ───── 交互 ───── */
  async function onClick(e) {
    const t = e.target.closest("[data-tab]");
    if (t) {
      tab = t.dataset.tab;
      return render();
    }
    const R = partner ? room() : null;
    const btn = e.target.closest("button");
    const a = e.target.closest("[data-a]")?.dataset.a;
    const busy = (txt) => {
      if (btn) {
        btn.disabled = true;
        btn.textContent = txt;
      }
    };
    try {
      if (a === "switch") {
        partner = null;
        S.partnerId = "";
        save();
        return render();
      }
      if (a === "settings") return openSettings();
      if (a === "theater") return openTheater();
      if (a === "daily") {
        if (needKey()) return;
        busy("拆信中…");
        R.daily[dayKey()] = await say(`今天是${new Date().toLocaleDateString("zh-CN")}。给${user.name}写今天的悄悄话：一两句，像早安/晚安/突然想你时发的那种，要有今天的具体小事或小情绪。`, 400);
        save();
        return render();
      }
      const mood = e.target.closest("[data-mood]")?.dataset.mood;
      if (mood) {
        const d = dayKey();
        R.mood[d] = { ...(R.mood[d] || {}), me: mood };
        save();
        render();
        if (!F.hasApiKey() || R.mood[d].ta) return;
        const txt = await F.aiText(
          [
            { role: "system", content: ctx() },
            { role: "user", content: `${user.name}今天的心情打卡是 ${mood}。请给出你今天的心情和对TA心情的回应。只输出 JSON：{"mood":"一个表情","text":"一句话，25字内"}` }
          ],
          { maxTokens: 300 }
        );
        const o = F.parseJsonLoose(txt) || { mood: "🙂", text: F.cleanLine(txt, 40) };
        R.mood[d].ta = { m: String(o.mood || "🙂").slice(0, 4), t: String(o.text || "").slice(0, 60) };
        save();
        return render();
      }
      if (a === "write") {
        const v = root.querySelector("#cp-dtext").value.trim();
        if (!v) return;
        const entry = { id: uid(), by: "me", date: dayKey(), text: v };
        R.diary.push(entry);
        save();
        render();
        if (!F.hasApiKey()) return;
        entry.reply = await say(`${user.name}在你们的恋爱日记里写了：\n「${v}」\n请回复这篇日记，要回应里面的具体内容和情绪，30~80字。`, 600);
        save();
        if (tab === "diary") render();
        return;
      }
      if (a === "tadiary") {
        if (needKey()) return;
        busy("翻开 TA 的日记…");
        const text = await say(`以你的身份写一篇今天的恋爱日记（${new Date().toLocaleDateString("zh-CN")}），80~160字，写你今天的生活、想到${user.name}的瞬间、没说出口的小心思。`, 900);
        R.diary.push({ id: uid(), by: "ta", date: dayKey(), text });
        save();
        return render();
      }
      const li = e.target.closest("[data-li]");
      if (li) {
        const i = Number(li.dataset.li);
        const v = R.list[i] || {};
        if (v.done) {
          delete R.list[i];
          save();
          return render();
        }
        R.list[i] = { done: true, date: dayKey() };
        save();
        render();
        if (!F.hasApiKey()) return;
        R.list[i].reply = await say(`你们刚刚一起完成了恋爱清单里的「${LIST[i]}」。说一句感想（20字内）。`, 300);
        save();
        if (tab === "list") render();
        return;
      }
      if (a === "answer") {
        const v = root.querySelector("#cp-qa").value.trim();
        if (!v) return toast("写下你的答案吧");
        const d = dayKey();
        const q = todayQuestion();
        R.qa[d] = { q, me: v };
        save();
        render();
        if (!F.hasApiKey()) return;
        R.qa[d].ta = await say(`今天的情侣问答是：「${q}」\n${user.name}的答案是：「${v}」\n请给出你自己的答案（真诚、具体、符合你的性格），也可以顺带回应一下TA的答案。40~100字。`, 700);
        save();
        if (tab === "qa") render();
        return;
      }
      if (a === "addanniv") {
        const name = root.querySelector("#cp-an").value.trim();
        const date = root.querySelector("#cp-ad").value;
        if (!name || !date) return toast("填上名字和日期");
        R.anniv.push({ id: uid(), name, date, yearly: root.querySelector("#cp-ay").checked });
        save();
        return render();
      }
      const del = e.target.closest("[data-del]")?.dataset.del;
      if (del) {
        R.anniv = R.anniv.filter((x) => x.id !== del);
        save();
        return render();
      }
      if (a === "photo") return root.querySelector("#cp-file").click();
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act && R.pet) {
        tickPet(R.pet);
        applyAct(R.pet, act, "me");
        save();
        render();
        const emo = root.querySelector(".cp-pet-emoji");
        if (emo) emo.classList.add("is-hop");
        return;
      }
      if (a === "petask") {
        if (needKey()) return;
        busy("TA 在想…");
        const pet = R.pet;
        const type = PETS.find((x) => x.k === pet.type) || PETS[0];
        const recent = pet.log.slice(-6).map((l) => l.text).join("；");
        const t = await say(`你们一起养的${type.n}「${pet.name}」现在 Lv.${pet.level}，饱腹${pet.hunger}、清洁${pet.clean}、心情${pet.mood}、精力${pet.energy}。最近：${recent}。说说你对它的看法、照顾它时的小事，或者提醒${user.name}一起照顾它（40字内）。`, 400);
        pet.log.push({ at: Date.now(), who: "ta", text: `${partner.name}：${t}` });
        save();
        return render();
      }
    } catch (err) {
      toast("出错了：" + err.message);
      render();
    }
  }

  F.register("情侣小屋", {
    title: "情侣小屋",
    kicker: "COUPLE HOUSE",
    async mount(body) {
      root = document.createElement("div");
      root.className = "cp-root";
      body.appendChild(root);
      root.addEventListener("click", onClick);
      const [cast, u] = await Promise.all([F.loadCast(), F.loadUser()]);
      user = u;
      await load();
      partner = cast.find((c) => c.id === S.partnerId) || null;
      if (root) render();
    },
    unmount() {
      root = null;
    }
  });
})();
