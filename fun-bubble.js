"use strict";

/**
 * Bubble · 爱豆模拟
 * 你是爱豆，给订阅你的粉丝发消息；AI 生成一群性格各异的粉丝，
 * 并且认真读懂你说的话来回复：回答你的问题、接住你的情绪、记得你之前说过的事。
 * 点粉丝的回复可以「翻牌」单独回复 TA。
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast, rnd, pick, shuffle, uid, hue, avHtml } = F;

  const KV = "bubble_v1";
  const FAN_TYPES = ["老粉", "新粉", "女友粉", "妈妈粉", "事业粉", "毒唯", "颜粉", "路人转粉", "站姐", "CP粉"];
  const PRESET_FANS = [
    { name: "今天也很想你", type: "女友粉", persona: "黏人，每天第一个来报到，喜欢叫老公", days: 812 },
    { name: "宝宝要好好吃饭", type: "妈妈粉", persona: "操心爱豆身体，总提醒吃饭睡觉", days: 1204 },
    { name: "冲销量的小陈", type: "事业粉", persona: "关心行程和成绩，理性但很护短", days: 640 },
    { name: "一只路过的猫", type: "路人转粉", persona: "刚入坑，什么都好奇，说话很萌", days: 12 },
    { name: "镜头里的光", type: "站姐", persona: "拍照很厉害，会夸细节，偶尔发糖图预告", days: 1530 },
    { name: "哥哥看我一眼", type: "颜粉", persona: "疯狂夸颜值，尖叫型选手", days: 95 }
  ];

  let S = null; // 状态
  let root = null;
  let replyTo = null;
  let busy = false;
  let pendingImg = "";

  async function load() {
    try {
      S = (await F.FunDB.get(KV)) || null;
    } catch (_) {
      S = null;
    }
    if (!S) S = { idol: null, fans: [], msgs: [], subs: 0 };
  }
  function save() {
    if (S.msgs.length > 400) S.msgs = S.msgs.slice(-400);
    F.FunDB.set(KV, S).catch(() => toast("保存失败：存储空间不足"));
  }

  const fanById = (id) => S.fans.find((f) => f.id === id);
  const fanByName = (n) => S.fans.find((f) => f.name === n) || S.fans.find((f) => n && (f.name.includes(n) || n.includes(f.name)));
  const fmtW = (n) => (n >= 10000 ? (n / 10000).toFixed(1) + "w" : String(n));
  const timeStr = (t) => {
    const d = new Date(t);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  /* ───── AI ───── */
  function idolDesc() {
    const i = S.idol;
    return `艺名：${i.name}${i.group ? `；所属：${i.group}` : ""}${i.fandom ? `；粉丝名：${i.fandom}` : ""}${i.persona ? `\n人设/性格：${i.persona}` : ""}`;
  }
  function fansDesc(list) {
    return (list || S.fans).map((f) => `- ${f.name}（${f.type}，入坑${f.days}天，被翻牌${f.picked || 0}次）：${f.persona}`).join("\n");
  }
  function recentContext() {
    const lines = [];
    const recent = S.msgs.slice(-40);
    for (const m of recent) {
      if (m.from === "idol") lines.push(`【${S.idol.name}】${m.replyTo ? `（回复 ${m.replyTo.name}：「${m.replyTo.text.slice(0, 30)}」）` : ""}${m.text || ""}${m.image ? "［发了一张照片］" : ""}`);
      else if (m.from === "letter") lines.push(`（${fanById(m.fan)?.name || "粉丝"} 写了一封信）`);
      else lines.push(`  ${fanById(m.fan)?.name || "粉丝"}：${m.text}`);
    }
    let s = lines.join("\n");
    if (s.length > 3500) s = "……\n" + s.slice(-3500);
    return s || "（这是第一条消息）";
  }

  async function generateFans(n) {
    const sys =
      "你在为一个偶像私信订阅平台（类似 Bubble）生成订阅用户（粉丝）。粉丝要真实、多样、有记忆点，昵称像真实的饭圈网名。只输出 JSON 数组。";
    const usr = `爱豆资料：\n${idolDesc()}\n\n${S.fans.length ? `已有粉丝（不要重名）：${S.fans.map((f) => f.name).join("、")}\n\n` : ""}请生成 ${n} 位粉丝，类型从这些里挑并且要混搭：${FAN_TYPES.join("、")}。\n格式：[{"name":"昵称","type":"类型","persona":"性格和说话习惯，20~40字","days":入坑天数}]`;
    const txt = await F.aiText(
      [
        { role: "system", content: sys },
        { role: "user", content: usr }
      ],
      { maxTokens: 1600, temperature: 0.95 }
    );
    const arr = F.parseJsonLoose(txt);
    if (!Array.isArray(arr)) throw new Error("粉丝生成格式不对，再试一次");
    return arr
      .filter((x) => x && x.name)
      .map((x) => ({
        id: uid(),
        name: String(x.name).slice(0, 16),
        type: String(x.type || pick(FAN_TYPES)).slice(0, 6),
        persona: String(x.persona || "").slice(0, 80),
        days: Math.max(1, parseInt(x.days, 10) || rnd(1500)),
        picked: 0,
        hue: rnd(360)
      }));
  }

  /** 爱豆发消息后，生成粉丝回复 */
  async function fanReplies(msg) {
    const target = msg.replyTo ? fanById(msg.replyTo.fanId) : null;
    const pool = shuffle(S.fans.slice());
    const n = Math.min(pool.length, 4 + rnd(4));
    const chosen = pool.slice(0, n);
    if (target && !chosen.includes(target)) chosen.unshift(target);
    const sys = [
      `你在模拟偶像私信订阅平台（类似 Bubble）里，粉丝们回复爱豆消息的场景。`,
      `爱豆资料：\n${idolDesc()}`,
      `这次会回复的粉丝：\n${fansDesc(chosen)}`,
      `最重要的规则——读懂爱豆的话：`,
      `1. 先弄清楚爱豆这条消息到底在说什么、情绪是什么、有没有提问。回复必须紧扣内容里的具体细节（提到的食物、地点、事情、用词），不要只会泛泛地喊"好帅""爱你"。`,
      `2. 爱豆提问了就要正面回答（每个粉丝按自己的情况回答，答案要不一样）；爱豆在开玩笑就接梗；爱豆情绪低落要认真安慰；爱豆暗示什么要能猜出来。`,
      `3. 结合之前的聊天记录，记得爱豆说过的事，可以自然地提起。`,
      `4. 每个粉丝说话符合自己的类型和性格，长短不一（3~50字），可以用饭圈用语、颜文字、尖叫，但别每条都一样。`,
      `5. 粉丝之间看不到彼此的回复（这是一对一私信），所以不要互相对话。`,
      target ? `6. 这条消息是爱豆单独回复「${target.name}」的（翻牌）。${target.name} 必须第一个回复，反应要非常激动且回应爱豆说的内容；其他粉丝只能看到爱豆的这句话但不知道是回给谁的，会好奇/羡慕/猜测。` : "",
      `只输出 JSON 数组：[{"fan":"粉丝昵称（必须是上面列表里的）","text":"回复内容"}]`
    ]
      .filter(Boolean)
      .join("\n");
    const userContent = `之前的聊天记录：\n${recentContext()}\n\n爱豆刚刚发来：${msg.replyTo ? `（回复 ${msg.replyTo.name} 的「${msg.replyTo.text}」）` : ""}「${msg.text || ""}」${msg.image ? "（附了一张照片，见图）" : ""}\n\n请生成 ${chosen.length} 条粉丝回复。`;
    const mk = (withImg) => [
      { role: "system", content: sys },
      {
        role: "user",
        content: withImg
          ? [
              { type: "text", text: userContent },
              { type: "image_url", image_url: { url: msg.image } }
            ]
          : userContent.replace("（附了一张照片，见图）", "（附了一张照片，粉丝看得到但你看不到，可以根据文字猜照片内容来回应）")
      }
    ];
    let txt;
    try {
      txt = await F.aiText(mk(!!msg.image), { maxTokens: 1800, temperature: 0.9 });
    } catch (err) {
      if (!msg.image) throw err;
      txt = await F.aiText(mk(false), { maxTokens: 1800, temperature: 0.9 }); // 模型不支持看图时退回纯文字
    }
    const arr = F.parseJsonLoose(txt);
    if (!Array.isArray(arr)) throw new Error("回复格式不对");
    return arr
      .filter((x) => x && x.text)
      .map((x) => {
        const f = fanByName(String(x.fan || "")) || pick(chosen);
        return { fan: f.id, text: F.cleanLine(x.text, 200, f.name) };
      });
  }

  async function fanLetter() {
    const f = pick(S.fans);
    const txt = await F.aiText(
      [
        {
          role: "system",
          content: `你是粉丝「${f.name}」（${f.type}，入坑${f.days}天，性格：${f.persona}），正在给爱豆写一封信。爱豆资料：${idolDesc()}\n要真诚具体，可以提到入坑契机、和爱豆聊天里印象深的话、自己的生活。150~300字。只输出信的正文。`
        },
        { role: "user", content: `最近的聊天记录（供参考）：\n${recentContext()}` }
      ],
      { maxTokens: 1200 }
    );
    return { fan: f.id, text: F.cleanLine(txt, 800, f.name) };
  }

  async function fanChatter() {
    const chosen = shuffle(S.fans.slice()).slice(0, 3 + rnd(3));
    const txt = await F.aiText(
      [
        {
          role: "system",
          content: `你在模拟偶像私信订阅平台里，爱豆一段时间没发消息，粉丝们主动给爱豆发私信（报备日常、催更、问问题、表白）。爱豆资料：${idolDesc()}\n粉丝：\n${fansDesc(chosen)}\n结合聊天记录让内容有延续性。只输出 JSON 数组：[{"fan":"昵称","text":"内容"}]`
        },
        { role: "user", content: `聊天记录：\n${recentContext()}\n\n生成 ${chosen.length} 条。` }
      ],
      { maxTokens: 1200, temperature: 0.95 }
    );
    const arr = F.parseJsonLoose(txt);
    if (!Array.isArray(arr)) throw new Error("格式不对");
    return arr
      .filter((x) => x && x.text)
      .map((x) => {
        const f = fanByName(String(x.fan || "")) || pick(chosen);
        return { fan: f.id, text: F.cleanLine(x.text, 200, f.name) };
      });
  }

  /* ───── 渲染 ───── */
  const fanAv = (f) => avHtml({ name: f?.name || "?" }, "fun-av sm");

  function renderMain() {
    if (!root) return;
    const i = S.idol;
    root.innerHTML = `
      <div class="bb">
        <div class="bb-head">
          ${avHtml({ name: i.name, avatar: i.avatar }, "fun-av bb-idol-av")}
          <div class="bb-head-t"><strong>${esc(i.name)}</strong><small>${esc(i.group || "SOLO")} · 订阅 ${fmtW(S.subs)}</small></div>
          <button type="button" class="fun-btn ghost sm" data-a="fans">粉丝 ${S.fans.length}</button>
        </div>
        <div class="bb-feed" id="bb-feed"></div>
        <div class="bb-tools">
          <button type="button" class="fun-chip-btn" data-a="chatter">💬 看看粉丝在说什么</button>
          <button type="button" class="fun-chip-btn" data-a="letter">💌 收一封信</button>
        </div>
        <div class="bb-reply" id="bb-reply" hidden></div>
        <div class="bb-input">
          <button type="button" class="fun-icon-btn" data-a="img" aria-label="发图"><i class="ph ph-image"></i></button>
          <div class="bb-input-box"><img id="bb-img-prev" hidden alt="" /><textarea id="bb-text" rows="1" placeholder="对${esc(i.fandom || "粉丝")}说点什么…"></textarea></div>
          <button type="button" class="fun-btn solid sm" data-a="send">发送</button>
          <input type="file" accept="image/*" hidden id="bb-file" />
        </div>
      </div>`;
    renderFeed();
    syncReply();
    const ta = root.querySelector("#bb-text");
    ta.addEventListener("input", () => {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 110) + "px";
    });
    root.querySelector("#bb-file").onchange = async (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      pendingImg = await compress(f);
      const im = root.querySelector("#bb-img-prev");
      im.src = pendingImg;
      im.hidden = false;
    };
  }

  function renderFeed() {
    const feed = root?.querySelector("#bb-feed");
    if (!feed) return;
    if (!S.msgs.length) {
      feed.innerHTML = `<div class="bb-empty"><div>🫧</div><p>${esc(S.idol.fandom || "粉丝")}们都在等你的第一条消息</p><small>说说今天做了什么、问问大家问题、发张自拍……粉丝会认真回应你说的每个细节</small></div>`;
      return;
    }
    feed.innerHTML = S.msgs
      .map((m) => {
        if (m.from === "idol") {
          return `<div class="bb-idol-msg">
            ${m.replyTo ? `<div class="bb-quote">↪ ${esc(m.replyTo.name)}：${esc(m.replyTo.text.slice(0, 40))}</div>` : ""}
            ${m.image ? `<img src="${esc(m.image)}" alt="" />` : ""}
            ${m.text ? `<p>${esc(m.text)}</p>` : ""}
            <small>${timeStr(m.at)} · 已读 ${fmtW(m.reads || 0)}</small></div>`;
        }
        if (m.from === "sys") return `<div class="bb-sys">${esc(m.text)}</div>`;
        const f = fanById(m.fan);
        if (m.from === "letter")
          return `<div class="bb-letter" data-mid="${m.id}"><p class="fun-kicker">💌 来自 ${esc(f?.name || "粉丝")} 的信</p><p>${esc(m.text).replace(/\n/g, "<br/>")}</p></div>`;
        return `<button type="button" class="bb-fan-msg${m.picked ? " is-picked" : ""}" data-mid="${m.id}">${fanAv(f)}
          <span><small>${esc(f?.name || "粉丝")} <em>${esc(f?.type || "")}</em></small><span class="bb-fan-text">${esc(m.text)}</span></span></button>`;
      })
      .join("");
    if (busy) feed.insertAdjacentHTML("beforeend", `<div class="bb-sys"><span class="is-typing"><i></i><i></i><i></i></span> 粉丝们正在回复…</div>`);
    feed.scrollTop = feed.scrollHeight;
  }

  function syncReply() {
    const el = root?.querySelector("#bb-reply");
    if (!el) return;
    el.hidden = !replyTo;
    if (replyTo) {
      el.innerHTML = `<span>翻牌 <b>${esc(replyTo.name)}</b>：${esc(replyTo.text.slice(0, 30))}</span><button type="button" data-a="unreply">✕</button>`;
    }
  }

  function compress(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, 900 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  async function send() {
    if (busy) return;
    const ta = root.querySelector("#bb-text");
    const text = ta.value.trim();
    if (!text && !pendingImg) return;
    if (!F.hasApiKey()) return toast("请先在设置里填写 API Key");
    const msg = { id: uid(), from: "idol", text, image: pendingImg, at: Date.now(), reads: 0 };
    if (replyTo) {
      msg.replyTo = { ...replyTo };
      const f = fanById(replyTo.fanId);
      if (f) f.picked = (f.picked || 0) + 1;
      const src = S.msgs.find((x) => x.id === replyTo.mid);
      if (src) src.picked = true;
    }
    S.msgs.push(msg);
    ta.value = "";
    ta.style.height = "auto";
    pendingImg = "";
    root.querySelector("#bb-img-prev").hidden = true;
    replyTo = null;
    syncReply();
    busy = true;
    renderFeed();
    const growRead = setInterval(() => {
      msg.reads = Math.min(S.subs, msg.reads + rnd(Math.max(1, Math.floor(S.subs / 12))));
      const last = root?.querySelectorAll(".bb-idol-msg small");
      if (last && last.length) last[last.length - 1].textContent = `${timeStr(msg.at)} · 已读 ${fmtW(msg.reads)}`;
    }, 500);
    try {
      const reps = await fanReplies(msg);
      for (const r of reps) {
        if (!S) return;
        S.msgs.push({ id: uid(), from: "fan", fan: r.fan, text: r.text, at: Date.now() });
        renderFeed();
        await F.sleep(250 + rnd(450));
      }
      S.subs += rnd(30) + (msg.replyTo ? 50 : 5);
      msg.reads = Math.max(msg.reads, Math.floor(S.subs * (0.6 + Math.random() * 0.3)));
    } catch (err) {
      toast("粉丝回复失败：" + err.message);
    } finally {
      clearInterval(growRead);
      busy = false;
      if (S) {
        save();
        renderFeed();
      }
    }
  }

  async function runExtra(kind) {
    if (busy) return;
    if (!F.hasApiKey()) return toast("请先在设置里填写 API Key");
    busy = true;
    renderFeed();
    try {
      if (kind === "letter") {
        const l = await fanLetter();
        S.msgs.push({ id: uid(), from: "letter", fan: l.fan, text: l.text, at: Date.now() });
      } else {
        S.msgs.push({ id: uid(), from: "sys", text: "—— 你不在的时候 ——", at: Date.now() });
        const reps = await fanChatter();
        reps.forEach((r) => S.msgs.push({ id: uid(), from: "fan", fan: r.fan, text: r.text, at: Date.now() }));
      }
      save();
    } catch (err) {
      toast("失败：" + err.message);
    } finally {
      busy = false;
      renderFeed();
    }
  }

  function openFans() {
    const sh = F.openSheet(
      `<div class="bb-fans">${S.fans
        .map(
          (f) => `<div class="bb-fan-row">${fanAv(f)}<div><strong>${esc(f.name)}</strong> <em class="bb-tag">${esc(f.type)}</em><small>入坑 ${f.days} 天 · 被翻牌 ${f.picked || 0} 次</small><p>${esc(f.persona)}</p></div><button type="button" class="sh-link" data-del="${f.id}">移除</button></div>`
        )
        .join("")}</div>
       <div class="fun-sheet-actions"><button type="button" class="fun-btn ghost" data-a="edit">编辑爱豆资料</button><button type="button" class="fun-btn solid" data-a="more">再来 4 位粉丝</button></div>`,
      { title: `我的粉丝 · ${S.fans.length}` }
    );
    sh.el.classList.add("fun-sheet--tall");
    sh.body.addEventListener("click", async (e) => {
      const del = e.target.closest("[data-del]")?.dataset.del;
      if (del) {
        if (S.fans.length <= 2) return toast("至少留两位粉丝");
        S.fans = S.fans.filter((f) => f.id !== del);
        save();
        e.target.closest(".bb-fan-row").remove();
        return;
      }
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (a === "edit") {
        sh.close();
        renderSetup(true);
      }
      if (a === "more") {
        if (!F.hasApiKey()) return toast("请先在设置里填写 API Key");
        const btn = e.target.closest("button");
        btn.disabled = true;
        btn.textContent = "生成中…";
        try {
          S.fans.push(...(await generateFans(4)));
          save();
          sh.close();
          renderMain();
          openFans();
        } catch (err) {
          toast(err.message);
          btn.disabled = false;
          btn.textContent = "再来 4 位粉丝";
        }
      }
    });
  }

  function onClick(e) {
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "send") return void send();
    if (a === "img") return root.querySelector("#bb-file").click();
    if (a === "fans") return openFans();
    if (a === "letter" || a === "chatter") return void runExtra(a);
    if (a === "unreply") {
      replyTo = null;
      return syncReply();
    }
    const fm = e.target.closest(".bb-fan-msg");
    if (fm) {
      const m = S.msgs.find((x) => x.id === fm.dataset.mid);
      const f = m && fanById(m.fan);
      if (!f) return;
      replyTo = { mid: m.id, fanId: f.id, name: f.name, text: m.text };
      syncReply();
      root.querySelector("#bb-text").focus();
    }
  }

  async function renderSetup(editing) {
    const user = await F.loadUser();
    if (!root) return;
    const i = S.idol || { name: user.name, persona: user.persona, avatar: user.avatar, group: "", fandom: "" };
    root.innerHTML = `<div class="fun-setup">
      <div class="fun-hero">🫧</div>
      <p class="fun-kicker">BUBBLE · IDOL MODE</p><h2 class="fun-h2">${editing ? "编辑爱豆资料" : "今天，你是爱豆"}</h2>
      <p class="fun-note">在这里你是被追捧的偶像。AI 会生成一群性格各异的粉丝，认真读你发的每一句话来回复。点粉丝的回复可以「翻牌」。</p>
      <label class="fun-field"><span>艺名</span><input id="bb-name" maxlength="16" value="${esc(i.name)}" /></label>
      <label class="fun-field"><span>团名 / 公司（选填）</span><input id="bb-group" maxlength="20" value="${esc(i.group)}" placeholder="比如：SOLO / 某某娱乐" /></label>
      <label class="fun-field"><span>粉丝名（选填）</span><input id="bb-fandom" maxlength="12" value="${esc(i.fandom)}" placeholder="比如：小星星" /></label>
      <label class="fun-field"><span>你的人设</span><textarea id="bb-persona" rows="3" maxlength="300" placeholder="比如：舞台上很A私下很憨的主唱，喜欢吃辣，养了一只橘猫">${esc(i.persona)}</textarea></label>
      ${editing ? "" : `<label class="fun-field"><span>粉丝人数</span><select id="bb-n"><option value="6">6 位</option><option value="10" selected>10 位</option><option value="14">14 位</option></select></label>`}
      ${F.hasApiKey() ? "" : `<p class="fun-note warn">没有填 API Key：会先用预设粉丝，但粉丝回复需要 API。</p>`}
      <div class="fun-setup-btns">${editing ? `<button type="button" class="fun-btn ghost" id="bb-clear">清空聊天记录</button>` : ""}<button type="button" class="fun-btn solid" id="bb-go">${editing ? "保存" : "开始营业"}</button></div></div>`;
    root.querySelector("#bb-clear")?.addEventListener("click", (e) => {
      if (e.target.dataset.sure !== "1") {
        e.target.dataset.sure = "1";
        e.target.textContent = "再点一次确认清空";
        return;
      }
      S.msgs = [];
      save();
      toast("已清空");
      renderMain();
    });
    root.querySelector("#bb-go").onclick = async (e) => {
      const idol = {
        ...i,
        name: root.querySelector("#bb-name").value.trim() || "我",
        group: root.querySelector("#bb-group").value.trim(),
        fandom: root.querySelector("#bb-fandom").value.trim(),
        persona: root.querySelector("#bb-persona").value.trim()
      };
      S.idol = idol;
      if (editing) {
        save();
        return renderMain();
      }
      const n = Number(root.querySelector("#bb-n").value);
      e.target.disabled = true;
      e.target.textContent = "正在召集粉丝…";
      try {
        S.fans = F.hasApiKey() ? await generateFans(n) : PRESET_FANS.map((f) => ({ ...f, id: uid(), picked: 0, hue: rnd(360) }));
      } catch (err) {
        toast("粉丝生成失败，先用预设粉丝：" + err.message);
        S.fans = PRESET_FANS.map((f) => ({ ...f, id: uid(), picked: 0, hue: rnd(360) }));
      }
      S.subs = 3000 + rnd(60000);
      S.msgs = [];
      save();
      if (root) renderMain();
    };
  }

  F.register("Bubble", {
    title: "Bubble",
    kicker: "IDOL · PRIVATE MESSAGE",
    async mount(body, act) {
      root = document.createElement("div");
      root.className = "bb-root";
      body.appendChild(root);
      root.addEventListener("click", onClick);
      root.addEventListener("keydown", (e) => {
        if (e.target.id === "bb-text" && e.key === "Enter" && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          void send();
        }
      });
      act.innerHTML = `<button type="button" class="fun-btn ghost sm" id="bb-edit">资料</button>`;
      act.querySelector("#bb-edit").onclick = () => S?.idol && renderSetup(true);
      await load();
      if (!root) return;
      if (S.idol && S.fans.length) renderMain();
      else renderSetup(false);
    },
    unmount() {
      root = null;
      replyTo = null;
    }
  });
})();
