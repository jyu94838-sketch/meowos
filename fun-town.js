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
    if (S) normState(S);
  }
  function normState(t) {
    t.rels = Array.isArray(t.rels) ? t.rels : [];
    t.posts = Array.isArray(t.posts) ? t.posts : [];
    t.romance = !!t.romance;
    for (const r of t.residents || []) {
      r.memory ||= [];
      r.diary ||= [];
    }
    return t;
  }
  function save() {
    if (S.feed.length > 300) S.feed = S.feed.slice(-300);
    if (S.posts.length > 150) S.posts = S.posts.slice(-150);
    F.FunDB.set(KV, S).catch(() => toast("保存失败：存储空间不足"));
  }

  const resById = (id) => S.residents.find((r) => r.id === id);
  const resByName = (n) => {
    const s = String(n || "").trim();
    return S.residents.find((r) => r.name === s) || S.residents.find((r) => s && (s.includes(r.name) || r.name.includes(s)));
  };
  const timeLabel = (d, s) => `第${d}天 · ${SLOTS[s]}`;
  const resAv = (r, cls) => avHtml({ name: r.name, avatar: r.avatar }, cls || "fun-av sm");

  /* ───── 人际关系：镇民之间会慢慢认识；恋爱 / 结婚 / 生子要镇长打开开关 ───── */
  const ROMANTIC = ["暧昧", "恋人", "夫妻"];
  const AI_REL_TYPES = ["认识", "邻居", "同事", "朋友", "好友", "死党", "不对付", "冤家", "暧昧", "恋人", "夫妻", "分手"];
  const relOf = (a, b) => S.rels.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  const relsOf = (id) => S.rels.filter((x) => x.a === id || x.b === id);
  const otherOf = (x, id) => (x.a === id ? x.b : x.a);
  function relLabel(x, viewer) {
    if (x.t === "亲子") return x.a === viewer ? "孩子" : "爸妈";
    if (x.dir && x.b === viewer) return `我是 TA 的${x.t}`;
    return x.t;
  }
  /** dir：t 描述的是「b 是 a 的 t」（比如 妹妹、好友），单向的称呼 */
  function setDirRel(a, b, t) {
    const x = setRel(a, b, t);
    if (x) {
      x.dir = 1;
      if (x.a !== a) [x.a, x.b] = [x.b, x.a];
    }
    return x;
  }
  function setRel(a, b, t, note) {
    if (!a || !b || a === b || !t) return null;
    let x = relOf(a, b);
    if (x) {
      if (x.t === "亲子" || x.t === t) return null;
      x.t = t;
      x.since = S.day;
      delete x.dir;
    } else {
      x = { a, b, t, since: S.day };
      S.rels.push(x);
    }
    if (note) x.note = String(note).slice(0, 40);
    return x;
  }
  const isKid = (r) => !!(r && r.kid);
  /** 校验 AI 给的关系变化：恋爱要开关、小孩不能恋爱、要先恋人才能结婚 */
  function applyAiRel(ra, rb, type) {
    let t = String(type || "").trim();
    if (!ra || !rb || ra === rb || !AI_REL_TYPES.includes(t)) return null;
    const cur = relOf(ra.id, rb.id);
    if (cur && cur.t === "亲子") return null;
    if (ROMANTIC.includes(t)) {
      if (!S.romance || isKid(ra) || isKid(rb)) return null;
      if (t === "夫妻" && (!cur || cur.t !== "恋人")) t = cur && cur.t === "暧昧" ? "恋人" : "暧昧";
      if (t === "恋人" && !cur) t = "暧昧";
      // 已经有对象的人不再开新恋情
      const taken = (r) => relsOf(r.id).some((x) => ROMANTIC.includes(x.t) && otherOf(x, r.id) !== (r === ra ? rb.id : ra.id));
      if (taken(ra) || taken(rb)) return null;
    }
    if (t === "分手") {
      if (!cur || !ROMANTIC.includes(cur.t)) return null;
      t = cur.t === "夫妻" ? "前夫妻" : "前任";
    }
    if (!ROMANTIC.includes(t) && cur && ROMANTIC.includes(cur.t) && t !== "前任" && t !== "前夫妻") return null;
    const x = setRel(ra.id, rb.id, t);
    if (x) {
      S.feed.push({ id: uid(), day: S.day, slot: S.slot, kind: "rel", whoList: [ra.id, rb.id], place: "park", text: relNews(ra, rb, t) });
      for (const r of [ra, rb]) pushMem(r, `第${S.day}天：和${(r === ra ? rb : ra).name}成了「${t}」`);
    }
    return x;
  }
  function relNews(a, b, t) {
    if (t === "夫妻") return `💍 ${a.name} 和 ${b.name} 结婚啦！`;
    if (t === "恋人") return `💕 ${a.name} 和 ${b.name} 在一起了`;
    if (t === "暧昧") return `🌸 ${a.name} 和 ${b.name} 之间好像有点什么…`;
    if (t === "前任" || t === "前夫妻") return `💔 ${a.name} 和 ${b.name} 分开了`;
    if (t === "不对付" || t === "冤家") return `⚡ ${a.name} 和 ${b.name} 有点不对付`;
    return `🤝 ${a.name} 和 ${b.name} 成了${t}`;
  }
  function pushMem(r, m) {
    r.memory.push(m);
    if (r.memory.length > 10) r.memory = r.memory.slice(-10);
  }
  function relDescFor(list) {
    const ids = new Set(list.map((r) => r.id));
    const lines = S.rels
      .filter((x) => ids.has(x.a) || ids.has(x.b))
      .slice(-40)
      .map((x) => {
        const a = resById(x.a);
        const b = resById(x.b);
        if (!a || !b) return "";
        return x.t === "亲子" ? `${a.name} 是 ${b.name} 的家长` : x.dir ? `${b.name} 是 ${a.name} 的${x.t}` : `${a.name} — ${b.name}：${x.t}${x.note ? "（" + x.note + "）" : ""}`;
      })
      .filter(Boolean);
    return lines.length ? lines.join("\n") : "（大家还不太熟）";
  }

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
      .map((r) => `- ${r.name}${r.charId ? "（主要角色）" : r.kid ? `（小孩，第${r.born || 1}天出生）` : "（NPC）"}｜职业：${r.job}｜工作地点：${placeById(r.place).name}｜性格：${String(r.persona || "").replace(/\n/g, " ").slice(0, 120)}${r.memory.length ? `｜最近经历：${r.memory.slice(-3).join("；")}` : ""}`)
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
    const wantChance = Math.random() < 0.3;
    const wantPosts = Math.random() < 0.65;
    let baby = null;
    if (S.romance) {
      const couples = S.rels.filter((x) => x.t === "夫妻" && x.since <= S.day - 1 && resById(x.a) && resById(x.b));
      const fresh = (x) => !S.residents.some((r) => r.kid && (r.parents || []).includes(x.a) && (r.born || 0) > S.day - 4);
      const c = shuffle(couples.filter(fresh))[0];
      if (c && Math.random() < 0.18) baby = c;
    }
    const romanceRule = S.romance
      ? "镇长开启了恋爱：成年居民之间可以慢慢产生好感，关系要循序渐进（认识→朋友→暧昧→恋人→夫妻），一次最多推进一对，不要一下子很多对。小孩不能谈恋爱。"
      : "不要写任何恋爱、暧昧、结婚的情节。";
    const txt = await F.aiText(
      [
        {
          role: "system",
          content: [
            `你在写一个温馨小镇「Pocket Town」的居民日常。玩家是镇长。`,
            `地点：${PLACES.map((p) => p.name).join("、")}`,
            `写作要求：每条 20~60 字，具体、有画面、有小细节和小情绪，符合每个人的职业和性格；工作时间（早上、下午）多写工作中的事——遇到的客人、小麻烦、成就感、摸鱼；中午写午休吃饭；晚上写下班后的生活。可以延续之前发生的事，人物之间可以有自然的交集。`,
            `居民之间会慢慢认识：在同一个地方工作、常去同一家店、住得近的人，可以从陌生变成认识、同事、朋友，也可能闹别扭。已经认识的人互动要符合现有关系。${romanceRule}`,
            `只输出 JSON。`
          ].join("\n")
        },
        {
          role: "user",
          content: `居民：\n${residentsDesc(list)}\n\n居民之间的关系：\n${relDescFor(list)}\n\n${prev.length ? `上一个时间段（${timeLabel(S.day, S.slot)}）：\n${prev.slice(-14).join("\n")}\n\n` : ""}${notice.length ? `镇长最近的公告（居民会知道并受影响）：${notice.join("；")}\n\n` : ""}${S.pendingEvent ? `镇长发起了活动：「${S.pendingEvent}」，请让这次的内容围绕它展开。\n\n` : ""}现在是 ${timeLabel(nd, ns)}。请写出每位居民此刻在做什么。${wantEvent ? "另外写 1 个小镇事件（两三个居民之间发生的有意思的事）。" : ""}${wantChance ? "再写 1 个偶然事件：意料之外的小插曲，比如突然下暴雨、停电、走失的小猫、捡到钱包、撞衫、认错人、意外的好运或小倒霉，落在一两个居民身上。" : ""}${baby ? `\n${resById(baby.a).name} 和 ${resById(baby.b).name} 的宝宝今天出生了！请给宝宝起个名字（可以随父母的姓），写一句宝宝的样子。` : ""}\n关系变化：如果这段时间里有人新认识了、关系变好变差了，写进 rels（0~3 条，没有就空数组）。${wantPosts ? "\n镇民圈：挑 1~2 位居民发一条像朋友圈一样的动态（第一人称、口语、可带表情），认识 TA 的人可以评论。" : ""}\n\n格式：{"life":[{"who":"名字","place":"地点","text":"在做什么","mood":"一个表情符号"}]${wantEvent ? ',"event":{"who":["名字","名字"],"place":"地点","title":"事件标题，10字内","text":"事件经过，60~120字"}' : ""}${wantChance ? ',"chance":{"who":["名字"],"place":"地点","title":"10字内","text":"经过，40~100字"}' : ""}${baby ? ',"baby":{"name":"宝宝名字","persona":"一句话，宝宝的样子"}' : ""},"rels":[{"a":"名字","b":"名字","type":"${(S.romance ? AI_REL_TYPES : AI_REL_TYPES.filter((t) => !ROMANTIC.includes(t))).join("/")}"}]${wantPosts ? ',"posts":[{"who":"名字","text":"动态内容","likes":["名字"],"comments":[{"who":"名字","text":"评论"}]}]' : ""}}`
        }
      ],
      { maxTokens: 4000, temperature: 0.95 }
    );
    const o = F.parseJsonLoose(txt);
    if (!o || !Array.isArray(o.life)) throw new Error("生成格式不对，再试一次");
    return { o, nd, ns, baby };
  }

  /* ───── 操作 ───── */
  async function advance() {
    if (busy) return;
    if (!F.hasApiKey()) return toast("请先在设置里填写 API Key");
    busy = true;
    render();
    try {
      const { o, nd, ns, baby } = await aiAdvance();
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
      if (o.chance && o.chance.text) {
        const who = (Array.isArray(o.chance.who) ? o.chance.who : [o.chance.who]).map(resByName).filter(Boolean);
        const pl = placeByName(o.chance.place) || (who[0] ? placeById(who[0].place) : PLACES[10]);
        S.feed.push({ id: uid(), day: nd, slot: ns, kind: "chance", whoList: who.map((r) => r.id), place: pl.id, title: String(o.chance.title || "偶然事件").slice(0, 20), text: String(o.chance.text).slice(0, 260) });
        for (const r of who) pushMem(r, `第${nd}天${SLOTS[ns]}（意外）：${String(o.chance.title || o.chance.text).slice(0, 30)}`);
      }
      if (baby && o.baby && o.baby.name) {
        const pa = resById(baby.a);
        const pb = resById(baby.b);
        const kid = { id: uid(), name: String(o.baby.name).slice(0, 12), avatar: "", persona: String(o.baby.persona || "刚出生的小宝宝"), job: "小宝宝", place: "hospital", memory: [], diary: [], mood: "👶", chat: [], kid: true, born: nd, parents: [baby.a, baby.b] };
        S.residents.push(kid);
        setRel(baby.a, kid.id, "亲子");
        setRel(baby.b, kid.id, "亲子");
        S.feed.push({ id: uid(), day: nd, slot: ns, kind: "event", whoList: [baby.a, baby.b, kid.id], place: "hospital", title: "新生命", text: `👶 ${pa.name} 和 ${pb.name} 的宝宝「${kid.name}」出生了！${String(o.baby.persona || "")}` });
        for (const r of [pa, pb]) pushMem(r, `第${nd}天：我们的宝宝${kid.name}出生了`);
      }
      for (const x of Array.isArray(o.rels) ? o.rels.slice(0, 4) : []) applyAiRel(resByName(x?.a), resByName(x?.b), x?.type);
      for (const p of Array.isArray(o.posts) ? o.posts.slice(0, 3) : []) addPost(p, nd, ns);
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

  /* ───── 镇民圈 ───── */
  function addPost(p, day, slot) {
    const r = resByName(p?.who);
    if (!r || !p.text) return null;
    const post = {
      id: uid(),
      who: r.id,
      day: day ?? S.day,
      slot: slot ?? S.slot,
      text: String(p.text).slice(0, 300),
      likes: (Array.isArray(p.likes) ? p.likes : []).map(resByName).filter((x) => x && x !== r).map((x) => x.id).filter((v, i, a) => a.indexOf(v) === i),
      comments: (Array.isArray(p.comments) ? p.comments : [])
        .map((c) => ({ who: resByName(c?.who)?.id, text: String(c?.text || "").slice(0, 160) }))
        .filter((c) => c.who && c.text)
        .slice(0, 6)
    };
    S.posts.push(post);
    return post;
  }

  async function refreshCircle() {
    if (busy) return;
    if (!F.hasApiKey()) return toast("请先在设置里填写 API Key");
    busy = true;
    render();
    try {
      const list = shuffle(S.residents.filter((r) => !isKid(r) || (r.born || 0) < S.day - 6)).slice(0, 10);
      const recent = S.feed.filter((f) => f.day >= S.day - 1).slice(-16).map((f) => (f.kind === "life" ? `${resById(f.who)?.name}：${f.text}` : `【${f.title || "动态"}】${f.text}`));
      const txt = await F.aiText(
        [
          { role: "system", content: `你在写小镇「${S.name}」的「镇民圈」——镇上居民自己的朋友圈。动态是第一人称、口语、生活化，可以晒工作、吐槽、晒吃的、发感慨、@别人，可以带表情。评论的人要认识发帖人，口吻符合两人关系。${S.romance ? "" : "不要写恋爱内容。"}只输出 JSON。` },
          { role: "user", content: `居民：\n${residentsDesc(list)}\n\n关系：\n${relDescFor(list)}\n\n${recent.length ? "最近镇上发生的事：\n" + recent.join("\n") + "\n\n" : ""}现在是${timeLabel(S.day, S.slot)}。写 2~3 条不同居民发的动态，每条 15~60 字，配 0~3 条评论和几个点赞的人。\n格式：{"posts":[{"who":"名字","text":"动态","likes":["名字"],"comments":[{"who":"名字","text":"评论"}]}]}` }
        ],
        { maxTokens: 1800, temperature: 0.95 }
      );
      const o = F.parseJsonLoose(txt);
      const arr = Array.isArray(o) ? o : o?.posts;
      if (!Array.isArray(arr)) throw new Error("格式不对，再试一次");
      let n = 0;
      for (const p of arr.slice(0, 4)) if (addPost(p)) n++;
      save();
      toast(n ? `刷到 ${n} 条新动态` : "大家今天都很安静");
    } catch (err) {
      toast("刷新失败：" + err.message);
    } finally {
      busy = false;
      render();
    }
  }

  async function mayorComment(post, text) {
    const me = await F.loadUser();
    post.comments.push({ who: "mayor", text });
    save();
    render();
    const r = resById(post.who);
    if (!r || !F.hasApiKey()) return;
    try {
      const txt = await F.aiText(
        [
          { role: "system", content: `你是小镇居民「${r.name}」，${r.job}。${r.persona ? "人设：" + String(r.persona).slice(0, 400) : ""}\n你在镇民圈发了动态：「${post.text}」，镇长（${me.name}）评论了你。用你的口吻回复一句（口语、简短），只输出回复内容。` },
          ...post.comments.slice(-6).map((c) => ({ role: c.who === r.id ? "assistant" : "user", content: `${c.who === "mayor" ? "镇长" : resById(c.who)?.name || "居民"}：${c.text}` }))
        ],
        { maxTokens: 200 }
      );
      const t = F.cleanLine(txt, 160, r.name);
      if (t) post.comments.push({ who: r.id, text: t, to: "mayor" });
      save();
      render();
    } catch (_) {
      /* 没回就算了 */
    }
  }

  function postHtml(p, me) {
    const r = resById(p.who);
    if (!r) return "";
    const nm = (id) => (id === "mayor" ? "镇长" : resById(id)?.name || "居民");
    const liked = p.likes.includes("mayor");
    return `<div class="pt-post" data-post="${p.id}">
      <button type="button" class="pt-post-av" data-r="${r.id}">${resAv(r, "fun-av")}</button>
      <div class="pt-post-main">
        <b>${esc(r.name)}</b><small>${esc(r.job)}</small>
        <p>${esc(p.text)}</p>
        <div class="pt-post-meta"><span>${timeLabel(p.day, p.slot)}</span><button type="button" data-a="plike" class="${liked ? "is-on" : ""}">${liked ? "❤️" : "🤍"} 赞</button><button type="button" data-a="pcmt">💬 评论</button></div>
        ${p.likes.length || p.comments.length ? `<div class="pt-post-box">${p.likes.length ? `<p class="pt-post-likes">❤ ${p.likes.map((id) => esc(nm(id))).join("、")}</p>` : ""}${p.comments.map((c) => `<p><b>${esc(nm(c.who))}</b>${c.to ? ` 回复 <b>${esc(nm(c.to))}</b>` : ""}：${esc(c.text)}</p>`).join("")}</div>` : ""}
        <div class="pt-post-input" hidden><input type="text" maxlength="120" placeholder="镇长评论…" /><button type="button" class="fun-btn solid sm" data-a="psend">发送</button></div>
      </div></div>`;
  }

  /* ───── TA 的一天 / 日记 ───── */
  function dayRecords(r, day) {
    return S.feed.filter((f) => f.day === day && (f.who === r.id || (f.whoList || []).includes(r.id)));
  }
  async function writeDiary(r, day, btn) {
    if (!F.hasApiKey()) return toast("请先在设置里填写 API Key");
    const recs = dayRecords(r, day);
    if (!recs.length) return toast("这一天还没有 TA 的记录");
    btn.disabled = true;
    btn.textContent = "TA 在写…";
    try {
      const posts = S.posts.filter((p) => p.who === r.id && p.day === day).map((p) => p.text);
      const rel = relsOf(r.id).slice(-8).map((x) => `${resById(otherOf(x, r.id))?.name}（${relLabel(x, r.id)}）`).join("、");
      const txt = await F.aiText(
        [
          { role: "system", content: `你是小镇居民「${r.name}」，${r.job}。${r.persona ? "人设：" + String(r.persona).slice(0, 500) : ""}${rel ? "\n你认识的人：" + rel : ""}\n用第一人称写一篇今天的日记，100~220 字，按时间顺序写今天发生的事和真实感受，语气符合你的性格。只输出日记正文。` },
          { role: "user", content: `第${day}天的经历：\n${recs.map((f) => `${SLOTS[f.slot]}：${f.title ? f.title + "，" : ""}${f.text}`).join("\n")}${posts.length ? "\n今天发的动态：" + posts.join("；") : ""}` }
        ],
        { maxTokens: 700, temperature: 0.9 }
      );
      r.diary = (r.diary || []).filter((d) => d.day !== day);
      r.diary.push({ day, text: String(txt || "").trim().slice(0, 800) });
      if (r.diary.length > 12) r.diary = r.diary.slice(-12);
      save();
      return true;
    } catch (err) {
      toast("没写成：" + err.message);
      btn.disabled = false;
      btn.textContent = "写今天的日记";
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
       ${(() => {
         const rs = relsOf(r.id).map((x) => ({ x, o: resById(otherOf(x, r.id)) })).filter((y) => y.o);
         return rs.length ? `<p class="fun-kicker">TA 认识的人</p><div class="pt-rels">${rs.map(({ x, o }) => `<button type="button" class="pt-rel" data-goto="${o.id}">${resAv(o)}<span>${esc(o.name)}</span><em>${esc(relLabel(x, r.id))}</em></button>`).join("")}</div>` : `<p class="fun-kicker">TA 认识的人</p><p class="fun-note">还不认识谁，推进几次时间就会慢慢熟起来。</p>`;
       })()}
       ${(() => {
         const days = [...new Set(S.feed.filter((f) => f.who === r.id || (f.whoList || []).includes(r.id)).map((f) => f.day))].sort((a, b) => b - a);
         if (!days.length) return "";
         const d = days[0];
         const recs = dayRecords(r, d);
         const di = (r.diary || []).find((x) => x.day === d);
         return `<p class="fun-kicker">TA 的一天 · 第${d}天</p><ol class="pt-day">${recs.map((f) => `<li><b>${SLOT_ICON[f.slot]} ${SLOTS[f.slot]}</b>${f.kind === "chance" ? "🎲 " : f.kind === "event" ? "✨ " : ""}${esc(f.title ? f.title + "：" : "")}${esc(f.text)}</li>`).join("")}</ol>
           ${di ? `<div class="pt-diary"><small>📔 TA 的日记</small><p>${esc(di.text)}</p></div>` : ""}
           <button type="button" class="fun-btn ghost sm" data-a="diary" data-day="${d}">${di ? "重写日记" : "写今天的日记"}</button>
           ${(r.diary || []).filter((x) => x.day !== d).length ? `<details class="pt-diary-old"><summary>以前的日记</summary>${r.diary.filter((x) => x.day !== d).slice().reverse().map((x) => `<div class="pt-diary"><small>第${x.day}天</small><p>${esc(x.text)}</p></div>`).join("")}</details>` : ""}`;
       })()}
       ${r.memory.length ? `<p class="fun-kicker">TA 记得的事</p><ul class="pt-mem">${r.memory.slice().reverse().map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
       <p class="fun-kicker">最近动态</p><div class="pt-hist">${mine.length ? mine.map(feedItemHtml).join("") : `<p class="fun-note">还没有动态</p>`}</div>
       <div class="fun-sheet-actions">${r.charId ? "" : `<button type="button" class="fun-btn ghost" data-a="del">请 TA 搬走</button><button type="button" class="fun-btn ghost" data-a="edit">编辑资料</button>`}<button type="button" class="fun-btn ghost" data-a="save">保存</button><button type="button" class="fun-btn solid" data-a="chat">去聊聊</button></div>`,
      { title: "居民档案" }
    );
    sh.el.classList.add("fun-sheet--tall");
    sh.body.addEventListener("click", async (e) => {
      const go = e.target.closest("[data-goto]");
      if (go) {
        sh.close();
        return openResident(resById(go.dataset.goto));
      }
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (!a) return;
      if (a === "edit") {
        sh.close();
        return npcSheet(r);
      }
      if (a === "diary") {
        const ok = await writeDiary(r, Number(e.target.closest("[data-a]").dataset.day), e.target.closest("button"));
        if (ok) {
          sh.close();
          openResident(r);
        }
        return;
      }
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
        S.rels = S.rels.filter((x) => x.a !== r.id && x.b !== r.id);
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
       <p class="fun-kicker">自己写一位</p>
       <div class="fun-sheet-actions"><button type="button" class="fun-btn solid" data-a="manual">＋ 新加 NPC</button></div>
       <p class="fun-kicker">从角色卡里找 NPC</p>
       <p class="fun-note">AI 会读角色人设，把里面写到的朋友、家人、同事这些有名字的人请进小镇，并记下 TA 们和角色的关系。</p>
       <div class="fun-sheet-actions"><button type="button" class="fun-btn ghost" data-a="persona">选角色卡</button></div>
       <p class="fun-kicker">随机来一批</p>
       <div class="ww-row"><select id="pt-batch"><option value="2">2 位</option><option value="3" selected>3 位</option><option value="5">5 位</option></select><button type="button" class="fun-btn ghost" data-a="batch">自动生成</button></div>
       <p class="fun-kicker">招一位新 NPC</p>
       <label class="fun-field"><span>想要什么样的居民？（可不填，让 AI 决定）</span><input id="pt-want" placeholder="比如：新开面包店的老板" maxlength="40" /></label>
       <div class="fun-sheet-actions"><button type="button" class="fun-btn solid" data-a="npc">发布招募</button></div>`,
      { title: "招新居民" }
    );
    sh.body.addEventListener("click", async (e) => {
      const cb = e.target.closest("[data-c]");
      const go = e.target.closest('[data-a="npc"]');
      if (e.target.closest('[data-a="manual"]')) {
        sh.close();
        return npcSheet();
      }
      const act = e.target.closest('[data-a="persona"],[data-a="batch"]')?.dataset.a;
      if (!cb && !go && !act) return;
      const btn = e.target.closest("button");
      if (act === "persona") {
        if (!cast.length) return toast("角色库里还没有角色");
        const chosen = await F.pickCast(cast, { min: 1, max: cast.length, preselect: S.residents.filter((r) => r.charId).map((r) => r.charId), title: "从谁的人设里找？" });
        if (!chosen || !chosen.length) return;
        btn.disabled = true;
        btn.textContent = "正在读人设…";
        try {
          const n = await importPersonaNpcs(chosen);
          save();
          sh.close();
          render();
          toast(n ? `${n} 位 NPC 搬进来了` : "人设里没找到新的有名字的 NPC");
        } catch (err) {
          toast("失败：" + err.message);
          btn.disabled = false;
          btn.textContent = "选角色卡";
        }
        return;
      }
      btn.disabled = true;
      try {
        if (act === "batch") {
          const n = await aiNewNpcs(Number(sh.body.querySelector("#pt-batch").value) || 3, "");
          save();
          sh.close();
          render();
          toast(`${n} 位新居民搬进来了`);
          return;
        }
        if (cb) {
          const c = notIn.find((x) => x.id === cb.dataset.c);
          const o = await aiFoundTown([c], 0);
          const a = o.chars[0] || {};
          addResident({ charId: c.id, name: c.name, avatar: c.avatar, persona: c.persona, job: a.job || "自由职业", place: (placeByName(a.place) || PLACES[8]).id });
        } else {
          const want = sh.body.querySelector("#pt-want").value.trim();
          const n = await aiNewNpcs(1, want);
          if (!n) throw new Error("格式不对");
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

  /** 图片 → 小头像 dataURL */
  function avatarFromFile(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onerror = () => rej(new Error("读不了这张图"));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => rej(new Error("读不了这张图"));
        img.onload = () => {
          const n = 192;
          const cv = document.createElement("canvas");
          cv.width = cv.height = n;
          const k = Math.max(n / img.width, n / img.height);
          const w = img.width * k;
          const h = img.height * k;
          cv.getContext("2d").drawImage(img, (n - w) / 2, (n - h) / 2, w, h);
          res(cv.toDataURL("image/jpeg", 0.85));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  /** 镇长亲自加一位 NPC（ex 传入就是编辑现有 NPC） */
  function npcSheet(ex) {
    let avatar = ex?.avatar || "";
    const others = S.residents.filter((r) => r !== ex);
    const relRow = (id = "", t = "") => `<div class="pt-relrow"><select class="pt-rel-who"><option value="">和谁认识…</option>${others.map((r) => `<option value="${r.id}" ${r.id === id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select><input class="pt-rel-t" maxlength="8" placeholder="是 TA 的…（好友）" value="${esc(t)}" /><button type="button" data-a="rmrel">✕</button></div>`;
    const curRels = ex ? relsOf(ex.id).filter((x) => x.t !== "亲子" && !(x.dir && x.a === ex.id)) : [];
    const sh = F.openSheet(
      `<div class="pt-npcform">
        <button type="button" class="pt-npc-av" data-a="av">${avatar ? `<img src="${esc(avatar)}" alt="" />` : "<span>＋<small>头像</small></span>"}</button>
        <input type="file" accept="image/*" hidden id="pt-npc-file" />
        <label class="fun-field"><span>名字</span><input id="pt-npc-name" maxlength="12" value="${esc(ex?.name || "")}" placeholder="必填" /></label>
        <label class="fun-field"><span>人设 / 性格</span><textarea id="pt-npc-persona" rows="3" maxlength="600" placeholder="比如：面包店老板娘，嗓门大心肠软，总给小孩塞饼干">${esc(ex?.persona || "")}</textarea></label>
        <div class="dt-form"><label class="fun-field"><span>职业</span><input id="pt-npc-job" maxlength="20" value="${esc(ex?.job || "")}" placeholder="可不填" /></label>
        <label class="fun-field"><span>工作地点</span><select id="pt-npc-place"><option value="">让 AI 定</option>${PLACES.map((p) => `<option value="${p.id}" ${ex?.place === p.id ? "selected" : ""}>${p.icon} ${p.name}</option>`).join("")}</select></label></div>
        ${others.length ? `<p class="fun-kicker">TA 认识谁（可不填）</p><div class="pt-relrows">${curRels.length ? curRels.map((x) => relRow(otherOf(x, ex.id), x.t)).join("") : relRow()}</div><button type="button" class="fun-btn ghost sm" data-a="addrel">＋ 再加一个</button>` : ""}
        <p class="fun-note">只填名字也行，职业、地点、性格没写的话 AI 会帮你补上。</p>
        <div class="fun-sheet-actions"><button type="button" class="fun-btn solid" data-a="ok">${ex ? "保存" : "搬进小镇"}</button></div>
      </div>`,
      { title: ex ? "编辑居民" : "新加 NPC" }
    );
    sh.el.classList.add("fun-sheet--tall");
    const $ = (q) => sh.body.querySelector(q);
    $("#pt-npc-file").onchange = async (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      try {
        avatar = await avatarFromFile(f);
        $(".pt-npc-av").innerHTML = `<img src="${esc(avatar)}" alt="" />`;
      } catch (err) {
        toast(err.message);
      }
    };
    sh.body.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-a]");
      const a = b?.dataset.a;
      if (a === "av") return $("#pt-npc-file").click();
      if (a === "addrel") return $(".pt-relrows").insertAdjacentHTML("beforeend", relRow());
      if (a === "rmrel") return b.closest(".pt-relrow").remove();
      if (a !== "ok") return;
      const name = $("#pt-npc-name").value.trim();
      if (!name) return toast("给 TA 起个名字");
      if (S.residents.some((r) => r !== ex && r.name === name)) return toast("小镇里已经有叫这个名字的人了");
      let persona = $("#pt-npc-persona").value.trim();
      let job = $("#pt-npc-job").value.trim();
      let place = $("#pt-npc-place").value;
      const rels = [...sh.body.querySelectorAll(".pt-relrow")].map((row) => ({ id: row.querySelector(".pt-rel-who").value, t: row.querySelector(".pt-rel-t").value.trim() })).filter((x) => x.id);
      if ((!job || !place || !persona) && F.hasApiKey()) {
        b.disabled = true;
        b.textContent = "AI 在补全…";
        try {
          const txt = await F.aiText(
            [
              { role: "system", content: `为小镇「${S.name}」补全一位居民的资料。地点只有：${PLACES.map((p) => p.name).join("、")}。已经写了的不要改，只补空着的。只输出 JSON。` },
              { role: "user", content: `名字：${name}\n人设：${persona || "（空）"}\n职业：${job || "（空）"}\n工作地点：${place ? placeById(place).name : "（空）"}${rels.length ? "\n认识：" + rels.map((x) => `${resById(x.id)?.name}（${x.t || "认识"}）`).join("、") : ""}\n格式：{"persona":"性格，20~40字","job":"职业","place":"地点"}` }
            ],
            { maxTokens: 400, temperature: 0.9 }
          );
          const o = F.parseJsonLoose(txt) || {};
          if (!persona && o.persona) persona = String(o.persona).slice(0, 600);
          if (!job && o.job) job = String(o.job).slice(0, 20);
          if (!place && o.place) place = placeByName(o.place)?.id || "";
        } catch (_) {
          /* 补不上就用默认的 */
        }
      }
      job ||= "居民";
      place ||= "park";
      let r = ex;
      if (ex) {
        Object.assign(ex, { name, persona, job, place, avatar });
        S.rels = S.rels.filter((x) => !curRels.includes(x));
        toast("已保存");
      } else {
        r = addResident({ name, persona, job, place, avatar, byMayor: true });
      }
      for (const x of rels) {
        const o = resById(x.id);
        if (!o) continue;
        const t = cleanRel(x.t || "认识");
        setDirRel(o.id, r.id, t);
        if (!ex) pushMem(r, `我是${o.name}的${t}`);
      }
      save();
      sh.close();
      render();
    });
  }

  /** AI 随机生成 n 位新 NPC（可以和现有居民有关系） */
  async function aiNewNpcs(n, want) {
    const txt = await F.aiText(
      [
        { role: "system", content: `为温馨小镇「${S.name}」生成新 NPC 居民。地点只有：${PLACES.map((p) => p.name).join("、")}。名字和性格要有生活感、互相不同。只输出 JSON。` },
        { role: "user", content: `现有居民：${S.residents.map((r) => r.name + "（" + r.job + "）").join("、")}\n${want ? "镇长的要求：" + want : "补小镇缺少的职业"}\n生成 ${n} 位。如果新居民和某位现有居民本来就认识（亲戚、老同学、前同事等），写在 knows 里。\n格式：{"npcs":[{"name":"名字","persona":"性格，20~40字","job":"职业","place":"地点","knows":[{"name":"现有居民名字","rel":"新居民是 TA 的什么人，4字内"}]}]}` }
      ],
      { maxTokens: 400 + n * 260, temperature: 0.95 }
    );
    const o = F.parseJsonLoose(txt);
    const arr = Array.isArray(o) ? o : o?.npcs || (o?.name ? [o] : null);
    if (!Array.isArray(arr)) throw new Error("格式不对");
    let c = 0;
    for (const x of arr.slice(0, n)) {
      if (!x || !x.name || resByName(x.name)?.name === String(x.name).trim()) continue;
      const r = addResident({ name: String(x.name).slice(0, 12), persona: String(x.persona || ""), job: String(x.job || "居民").slice(0, 20), place: (placeByName(x.place) || PLACES[10]).id });
      for (const k of Array.isArray(x.knows) ? x.knows : []) {
        const o2 = S.residents.find((y) => y.name === String(k?.name || "").trim());
        if (o2 && o2 !== r) setDirRel(o2.id, r.id, cleanRel(k.rel));
      }
      c++;
    }
    return c;
  }
  function cleanRel(t) {
    let s = String(t || "认识").trim().slice(0, 6) || "认识";
    if (!S.romance && /恋|情侣|对象|男友|女友|老婆|老公|夫|妻|暧昧/.test(s)) s = "熟人";
    return s;
  }

  /** 读角色卡人设，把里面写到的、有名字的 NPC 搬进小镇 */
  async function importPersonaNpcs(chars) {
    const withText = chars.filter((c) => String(c.persona || "").trim());
    if (!withText.length) return 0;
    const txt = await F.aiText(
      [
        { role: "system", content: `你在帮一个小镇模拟游戏找居民。下面是几位角色的人设。请找出人设里**明确写到名字的其他人物（NPC）**——朋友、家人、同事、同学、邻居、对手等，不要角色本人，也不要用户。小镇地点只有：${PLACES.map((p) => p.name).join("、")}。按人设给每个 NPC 写性格、在小镇的职业和工作地点，并写出 TA 和哪位角色是什么关系。没有就输出 {"npcs":[]}。只输出 JSON。` },
        { role: "user", content: `${withText.map((c) => `【${c.name}】\n${String(c.persona).slice(0, 2500)}`).join("\n\n")}\n\n已经住在小镇的人（不要重复）：${S.residents.map((r) => r.name).join("、") || "无"}\n\n格式：{"npcs":[{"name":"名字","persona":"性格和身份，20~50字","job":"职业","place":"地点","of":"和谁有关系（角色名）","rel":"这个 NPC 是那位角色的什么人，4字内，比如 妹妹、好友、同事"}]}` }
      ],
      { maxTokens: 2000, temperature: 0.7 }
    );
    const o = F.parseJsonLoose(txt);
    const arr = Array.isArray(o) ? o : o?.npcs;
    if (!Array.isArray(arr)) throw new Error("格式不对");
    let n = 0;
    for (const x of arr.slice(0, 12)) {
      const name = String(x?.name || "").trim().slice(0, 12);
      if (!name || S.residents.some((r) => r.name === name) || chars.some((c) => c.name === name)) continue;
      const r = addResident({ name, persona: String(x.persona || ""), job: String(x.job || "居民").slice(0, 20), place: (placeByName(x.place) || PLACES[10]).id, fromCard: true });
      const host = S.residents.find((y) => y.charId && y.name === String(x.of || "").trim());
      if (host) {
        setDirRel(host.id, r.id, cleanRel(x.rel));
        pushMem(r, `我和${host.name}是${cleanRel(x.rel)}`);
      }
      n++;
    }
    return n;
  }

  function addResident(x) {
    const r = { id: uid(), memory: [], diary: [], mood: "🙂", chat: [], avatar: "", ...x };
    S.residents.push(r);
    S.feed.push({ id: uid(), day: S.day, slot: S.slot, kind: "mayor", place: "hall", text: `欢迎新居民 ${r.name} 入住！职业：${r.job}（${placeById(r.place).name}）` });
    toast(`${r.name} 搬进来了`);
    return r;
  }

  /* ───── 渲染 ───── */
  function feedItemHtml(f) {
    const pl = placeById(f.place);
    if (f.kind === "event")
      return `<div class="pt-event"><p class="fun-kicker">✨ 小镇事件 · ${esc(pl.icon + pl.name)} · ${timeLabel(f.day, f.slot)}</p><strong>${esc(f.title)}</strong><p>${esc(f.text)}</p><div class="pt-event-who">${(f.whoList || []).map((id) => resById(id)).filter(Boolean).map((r) => resAv(r)).join("")}</div></div>`;
    if (f.kind === "chance")
      return `<div class="pt-event pt-chance"><p class="fun-kicker">🎲 偶然事件 · ${esc(pl.icon + pl.name)} · ${timeLabel(f.day, f.slot)}</p><strong>${esc(f.title)}</strong><p>${esc(f.text)}</p><div class="pt-event-who">${(f.whoList || []).map((id) => resById(id)).filter(Boolean).map((r) => resAv(r)).join("")}</div></div>`;
    if (f.kind === "rel") return `<div class="pt-mayor pt-relnews">${esc(f.text)}</div>`;
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
      <div class="sh-tabs pt-tabs">${[["map", "地图"], ["feed", "动态"], ["circle", "镇民圈"], ["people", "居民"], ["mayor", "镇长"]].map(([k, n]) => `<button type="button" data-tab="${k}" class="${tab === k ? "is-on" : ""}">${n}</button>`).join("")}</div>
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
    if (tab === "circle") {
      const posts = S.posts.slice(-60).reverse();
      p.innerHTML = `<div class="pt-circle-head"><span>镇民们自己发的动态</span><button type="button" class="fun-btn ghost sm" data-a="circle" ${busy ? "disabled" : ""}>${busy ? "刷新中…" : "↻ 刷新"}</button></div>
        ${posts.length ? posts.map((x) => postHtml(x)).join("") : `<p class="fun-note pt-tip">还没有人发动态。推进时间时镇民会自己发，也可以点「刷新」。</p>`}`;
    }
    if (tab === "people") {
      const now = whereNow();
      p.innerHTML = `<div class="pt-circle-head"><span>${S.residents.length} 位居民</span><span><button type="button" class="fun-btn ghost sm" data-a="recruit">招新居民</button> <button type="button" class="fun-btn solid sm" data-a="addnpc">＋ 新加 NPC</button></span></div><div class="pt-res-list">${S.residents
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
        <p class="fun-kicker">💕 恋爱与家庭</p>
        <label class="fun-switch"><input type="checkbox" id="pt-romance" ${S.romance ? "checked" : ""}/><span>允许镇民恋爱、结婚、生小孩</span></label>
        <p class="fun-note">${S.romance ? "已开启：成年居民之间会慢慢产生好感，暧昧→恋人→夫妻，结婚后可能会有宝宝。" : "关着的时候，镇民之间只会做朋友、同事、邻居。"}</p>
        <p class="fun-kicker">🏠 居民</p>
        <div class="ww-row"><button type="button" class="fun-btn ghost" data-a="addnpc">＋ 新加 NPC</button><button type="button" class="fun-btn ghost" data-a="recruit">招新居民</button><button type="button" class="fun-btn ghost" data-a="reset">重建小镇</button></div>
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
    if (a === "circle") return void refreshCircle();
    if (a === "addnpc") return npcSheet();
    const postEl = e.target.closest("[data-post]");
    if (postEl && (a === "plike" || a === "pcmt" || a === "psend")) {
      const post = S.posts.find((x) => x.id === postEl.dataset.post);
      if (!post) return;
      if (a === "plike") {
        post.likes = post.likes.includes("mayor") ? post.likes.filter((x) => x !== "mayor") : [...post.likes, "mayor"];
        save();
        return render();
      }
      const box = postEl.querySelector(".pt-post-input");
      if (a === "pcmt") {
        box.hidden = !box.hidden;
        if (!box.hidden) box.querySelector("input").focus();
        return;
      }
      const v = box.querySelector("input").value.trim();
      if (!v) return;
      return void mayorComment(post, v);
    }
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
      <label class="fun-switch"><input type="checkbox" id="pt-cardnpc" ${F.hasApiKey() ? "checked" : "disabled"}/><span>角色卡里写到的 NPC 也一起搬进来</span></label>
      <label class="fun-switch"><input type="checkbox" id="pt-rom" /><span>允许镇民恋爱、结婚、生小孩（以后也能在镇长页改）</span></label>
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
      const town = normState({ name: root.querySelector("#pt-name").value.trim() || "Pocket Town", day: 1, slot: 0, residents: [], feed: [], notices: [], pendingEvent: "", romance: root.querySelector("#pt-rom").checked });
      const wantCard = root.querySelector("#pt-cardnpc").checked;
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
        for (const r of town.residents) r.diary = [];
        town.feed.push({ id: uid(), day: 1, slot: 0, kind: "mayor", place: "hall", text: `${town.name} 成立了！首批 ${town.residents.length} 位居民入住。` });
        S = town;
        if (wantCard && picked.length && F.hasApiKey()) {
          btn.textContent = "正在读角色卡里的 NPC…";
          try {
            await importPersonaNpcs(picked);
          } catch (_) {
            /* 读不出来就算了，小镇照样建 */
          }
        }
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
      root.addEventListener("change", (e) => {
        if (e.target.id !== "pt-romance" || !S) return;
        S.romance = e.target.checked;
        S.feed.push({ id: uid(), day: S.day, slot: S.slot, kind: "mayor", place: "hall", text: S.romance ? "镇长宣布：镇民可以自由恋爱、结婚成家了 💕" : "镇长关闭了恋爱模式" });
        save();
        render();
      });
      root.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.isComposing && e.target.closest(".pt-post-input")) e.target.closest(".pt-post-input").querySelector("[data-a]").click();
      });
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
