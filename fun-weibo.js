"use strict";

/**
 * 喵博（原「微博」）：热搜榜（小世界里的时事 + 娱乐）/ 首页信息流 / 超话（CP 超话 + 个人超话）/ 我的
 * 新闻是 AI 按角色们所在的世界编的，不是真实新闻。
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast, rnd, pick, shuffle, uid, avHtml } = F;

  const KV = "weibo_v1";
  let S = null;
  let root = null;
  let tab = "home";
  let cast = [];
  let user = null;
  let busy = false;

  async function load() {
    try {
      S = (await F.FunDB.get(KV)) || null;
    } catch (_) {
      S = null;
    }
    if (!S) S = { hot: [], hotAt: 0, feed: [], topics: [], world: "" };
  }
  function save() {
    if (S.feed.length > 80) S.feed = S.feed.slice(0, 80);
    for (const t of S.topics) if (t.posts.length > 60) t.posts = t.posts.slice(0, 60);
    F.FunDB.set(KV, S).catch(() => toast("保存失败：存储空间不足"));
  }
  const needKey = () => {
    if (F.hasApiKey()) return false;
    toast("请先在设置里填写 API Key");
    return true;
  };
  const charByName = (n) => cast.find((c) => c.name === n);
  const fmtN = (n) => (n >= 1e8 ? (n / 1e8).toFixed(1) + "亿" : n >= 1e4 ? (n / 1e4).toFixed(1).replace(/\.0$/, "") + "万" : String(n));
  const ago = (t) => {
    const m = Math.floor((Date.now() - t) / 60000);
    return m < 1 ? "刚刚" : m < 60 ? `${m}分钟前` : m < 1440 ? `${Math.floor(m / 60)}小时前` : new Date(t).toLocaleDateString("zh-CN");
  };
  const castDesc = (n) =>
    cast
      .slice(0, n || 10)
      .map((c) => `- ${c.name}：${(c.persona || "").replace(/\n/g, " ").slice(0, 120)}`)
      .join("\n") || "（没有角色）";
  const worldLine = () => (S.world ? `这个世界的设定：${S.world}\n` : "");

  function mkPost(x, extra) {
    const author = String(x.author || "路人").slice(0, 20);
    return {
      id: uid(),
      author,
      kind: charByName(author) ? "char" : author === user.name ? "me" : String(x.kind || "npc"),
      v: !!x.verified || /新闻|日报|官方|电视台|快讯|娱乐/.test(author),
      text: String(x.text || "").slice(0, 400),
      at: Date.now() - rnd(3600000),
      likes: Math.max(0, parseInt(x.likes, 10) || rnd(5000)),
      reposts: Math.max(0, parseInt(x.reposts, 10) || rnd(800)),
      liked: false,
      comments: (Array.isArray(x.comments) ? x.comments : []).filter((c) => c && c.text).map((c) => ({ name: String(c.name || "网友").slice(0, 20), text: String(c.text).slice(0, 150) })),
      ...(extra || {})
    };
  }

  /* ───── AI ───── */
  async function genHot() {
    const txt = await F.aiText(
      [
        {
          role: "system",
          content: `你在模拟一个架空小世界里的微博热搜榜。角色们生活在这个世界里，有的人可能是名人。热搜要像真的微博：标题短、有梗、有悬念。内容全部虚构，不要涉及现实中的真实人物、真实政治事件和敏感话题。只输出 JSON。`
        },
        {
          role: "user",
          content: `${worldLine()}角色：\n${castDesc()}\n\n${S.hot.length ? `上一批热搜（别重复）：${S.hot.slice(0, 10).map((h) => h.title).join("、")}\n` : ""}生成 12 条热搜：大约 4 条时事民生（天气、城市、科技、社会新闻）、5 条娱乐八卦、3 条和角色有关（可以是角色上热搜，也可以是角色相关的事）。\n格式：[{"title":"热搜词条","cat":"news或ent或char","tag":"新/热/沸/爆/空字符串","heat":热度整数,"desc":"导语，40~80字"}]`
        }
      ],
      { maxTokens: 2200, temperature: 1 }
    );
    const arr = F.parseJsonLoose(txt);
    if (!Array.isArray(arr) || !arr.length) throw new Error("热搜格式不对，再试一次");
    return arr
      .filter((x) => x && x.title)
      .map((x) => ({ id: uid(), title: String(x.title).replace(/^#|#$/g, "").slice(0, 30), cat: x.cat, tag: String(x.tag || "").slice(0, 1), heat: Math.max(1000, parseInt(x.heat, 10) || rnd(5e6)), desc: String(x.desc || "").slice(0, 200), posts: [] }))
      .sort((a, b) => b.heat - a.heat);
  }

  async function genPosts(about, n) {
    const txt = await F.aiText(
      [
        {
          role: "system",
          content: `你在模拟微博。写出不同账号发的微博：角色本人（按人设说话）、路人、营销号、新闻媒体、粉丝等，风格要像真的微博（话题标签、表情、口语、梗）。评论区像真的网友，角色也可以出现在评论里。内容虚构，不涉及现实真实人物和敏感话题。只输出 JSON。`
        },
        {
          role: "user",
          content: `${worldLine()}角色：\n${castDesc()}\n玩家「${user.name}」也生活在这个世界。\n\n${about}\n\n生成 ${n} 条微博。格式：[{"author":"账号名（角色用原名）","verified":是否蓝V,"text":"正文","likes":点赞数,"reposts":转发数,"comments":[{"name":"","text":""}]}]，每条 2~4 条评论。每条正文都要写完整，不要写到一半。`
        }
      ],
      { maxTokens: 7000, temperature: 0.95 }
    );
    const arr = F.parseJsonLoose(txt);
    if (!Array.isArray(arr)) throw new Error("格式不对，再试一次");
    return arr.filter((x) => x && x.text);
  }

  async function genReplies(post, myText, ctxLine) {
    const txt = await F.aiText(
      [
        { role: "system", content: `你在模拟微博评论区。角色要按各自人设说话。${worldLine()}角色：\n${castDesc(8)}\n只输出 JSON 数组。` },
        { role: "user", content: `${ctxLine || ""}微博：@${post.author}：${post.text}\n已有评论：${post.comments.slice(-6).map((c) => c.name + "：" + c.text).join(" / ")}\n\n${user.name} 刚评论：「${myText}」\n生成 1~3 条回复（博主优先回复；如果${user.name}和某角色有关系，那个角色也可能出现）。格式：[{"name":"","text":""}]` }
      ],
      { maxTokens: 700 }
    );
    const arr = F.parseJsonLoose(txt);
    return Array.isArray(arr) ? arr.filter((x) => x && x.text).slice(0, 3) : [];
  }

  /* ───── 渲染：通用帖子 ───── */
  function postHtml(p, where) {
    const c = charByName(p.author);
    const av = p.kind === "me" ? user.avatar : c?.avatar;
    return `<article class="wb-post" data-pid="${p.id}" data-where="${where || ""}">
      <div class="wb-ph">${avHtml({ name: p.author, avatar: av }, "fun-av")}<div><strong>${esc(p.author)}${p.v ? `<i class="wb-v">V</i>` : ""}${p.kind === "char" ? `<em class="wb-chartag">角色</em>` : ""}</strong><small>${ago(p.at)}${p.topic ? ` · 来自 ${esc(p.topic)}` : ""}</small></div></div>
      <p class="wb-text">${esc(p.text).replace(/#([^#\s]{1,30})#/g, '<b class="wb-tag">#$1#</b>')}</p>
      ${p.image ? `<img class="wb-img" src="${esc(p.image)}" alt="" />` : ""}
      <div class="wb-bar"><button type="button" data-op="repost">↗ ${fmtN(p.reposts)}</button><button type="button" data-op="cmt">💬 ${fmtN(p.comments.length)}</button><button type="button" data-op="like" class="${p.liked ? "is-on" : ""}">${p.liked ? "❤" : "♡"} ${fmtN(p.likes + (p.liked ? 1 : 0))}</button></div>
      ${p.comments.length ? `<div class="wb-cprev">${p.comments.slice(0, 2).map((x) => `<p><b>${esc(x.name)}：</b>${esc(x.text)}</p>`).join("")}${p.comments.length > 2 ? `<small>查看全部 ${p.comments.length} 条评论 ›</small>` : ""}</div>` : ""}
    </article>`;
  }

  function findPost(pid) {
    for (const p of S.feed) if (p.id === pid) return p;
    for (const h of S.hot) for (const p of h.posts) if (p.id === pid) return p;
    for (const t of S.topics) for (const p of t.posts) if (p.id === pid) return p;
    return null;
  }

  function openComments(p) {
    const sh = F.openSheet(`<div class="sv-cmts" id="wb-cm"></div><div class="sv-cmt-input"><input type="text" placeholder="写评论…" maxlength="140" /><button type="button" class="fun-btn solid sm">发送</button></div>`, { title: `评论 ${p.comments.length}` });
    sh.el.classList.add("fun-sheet--tall");
    const list = sh.body.querySelector("#wb-cm");
    const draw = (typing) => {
      list.innerHTML =
        p.comments.map((c) => `<div class="sv-cmt">${avHtml({ name: c.name, avatar: c.isMe ? user.avatar : charByName(c.name)?.avatar }, "fun-av sm")}<div><small>${esc(c.name)}${c.name === p.author ? " <em>博主</em>" : ""}${charByName(c.name) && c.name !== p.author ? ' <em class="is-char">角色</em>' : ""}</small><p>${esc(c.text)}</p></div></div>`).join("") ||
        `<p class="fun-note">还没有评论</p>`;
      if (typing) list.insertAdjacentHTML("beforeend", `<p class="fun-note">对方正在输入…</p>`);
      list.scrollTop = list.scrollHeight;
    };
    draw();
    const inp = sh.body.querySelector("input");
    const send = async () => {
      const t = inp.value.trim();
      if (!t) return;
      inp.value = "";
      p.comments.push({ name: user.name, text: t, isMe: true });
      save();
      draw(F.hasApiKey());
      if (!F.hasApiKey()) return;
      try {
        const rs = await genReplies(p, t);
        rs.forEach((r) => p.comments.push({ name: String(r.name || p.author).slice(0, 20), text: String(r.text).slice(0, 150) }));
        save();
      } catch (err) {
        toast("回复失败：" + err.message);
      }
      if (sh.el.isConnected) draw();
      render();
    };
    sh.body.querySelector("button").onclick = send;
    inp.addEventListener("keydown", (e) => e.key === "Enter" && !e.isComposing && send());
  }

  /* ───── 页面 ───── */
  function render() {
    if (!root) return;
    root.innerHTML = `<div class="wb">
      <div class="wb-tabs">${[["home", "首页"], ["hot", "热搜"], ["topic", "超话"], ["me", "我"]].map(([k, n]) => `<button type="button" data-tab="${k}" class="${tab === k ? "is-on" : ""}">${n}</button>`).join("")}</div>
      <div class="wb-panel" id="wb-panel"></div></div>`;
    const p = root.querySelector("#wb-panel");
    ({ home: renderHome, hot: renderHot, topic: renderTopics, me: renderMe })[tab](p);
  }

  function renderHome(p) {
    p.innerHTML = `<div class="wb-compose-btn"><button type="button" class="fun-btn ghost sm" data-a="compose">✏️ 发喵博</button><button type="button" class="fun-btn solid sm" data-a="refresh" ${busy ? "disabled" : ""}>${busy ? "刷新中…" : "刷新"}</button></div>
      ${S.feed.length ? S.feed.map((x) => postHtml(x, "feed")).join("") : `<div class="sh-empty"><div class="sh-empty-ico">📰</div><p>首页还没有内容</p><small>点「刷新」看看大家在发什么</small></div>`}`;
  }

  function renderHot(p) {
    p.innerHTML = `<div class="wb-hot-head"><span>🔥 喵博热搜${S.hotAt ? ` · 更新于${ago(S.hotAt)}` : ""}</span><button type="button" class="fun-btn solid sm" data-a="hot" ${busy ? "disabled" : ""}>${busy ? "刷新中…" : "刷新热搜"}</button></div>
      ${
        S.hot.length
          ? `<ol class="wb-hot">${S.hot.map((h, i) => `<li data-hid="${h.id}"><span class="wb-rank r${i < 3 ? i + 1 : ""}">${i + 1}</span><span class="wb-ht">${esc(h.title)}</span><small>${fmtN(h.heat)}</small>${h.tag ? `<em class="wb-hot-tag t-${esc(h.tag)}">${esc(h.tag)}</em>` : ""}</li>`).join("")}</ol>`
          : `<div class="sh-empty"><div class="sh-empty-ico">🔥</div><p>热搜榜还是空的</p><small>新闻和八卦都是 AI 按你的角色们所在的世界编的</small></div>`
      }
      <div class="wb-world"><button type="button" class="sh-link" data-a="world">设定这个世界（${S.world ? "已设定" : "可选"}）</button></div>`;
  }

  async function openHot(h) {
    const sh = F.openSheet(`<p class="wb-hot-desc">${esc(h.desc)}</p><div id="wb-hp">${h.posts.length ? "" : `<p class="fun-note"><span class="fun-spin"></span> 正在加载讨论…</p>`}</div>`, { title: `#${h.title}#` });
    sh.el.classList.add("fun-sheet--tall");
    const box = sh.body.querySelector("#wb-hp");
    const draw = () => {
      box.innerHTML = h.posts.map((x) => postHtml(x, "hot")).join("");
    };
    if (h.posts.length) return draw();
    if (needKey()) return;
    try {
      const arr = await genPosts(`热搜话题：#${h.title}#\n导语：${h.desc}\n请写关于这个话题的微博（媒体首发、当事人或相关角色回应、吃瓜网友、营销号）。`, 5);
      h.posts = arr.map((x) => mkPost(x));
      save();
      if (sh.el.isConnected) draw();
    } catch (err) {
      box.innerHTML = `<p class="fun-note warn">${esc(err.message)}</p>`;
    }
  }

  function topicName(t) {
    return t.kind === "cp" ? t.name : `${t.name}超话`;
  }
  function renderTopics(p) {
    p.innerHTML = `<div class="wb-compose-btn"><button type="button" class="fun-btn solid sm" data-a="newtopic">＋ 创建超话</button></div>
      ${
        S.topics.length
          ? `<div class="wb-topics">${S.topics.map((t) => `<button type="button" class="wb-topic" data-tid="${t.id}"><span class="wb-topic-ico ${t.kind}">${t.kind === "cp" ? "💞" : "⭐"}</span><span><strong>${esc(topicName(t))}</strong><small>${t.kind === "cp" ? "CP 超话" : "个人超话"} · 粉丝 ${fmtN(t.fans)} · 帖子 ${t.posts.length}</small></span>${t.checkin?.last === new Date().toDateString() ? `<em class="wb-signed">已签到</em>` : ""}</button>`).join("")}</div>`
          : `<div class="sh-empty"><div class="sh-empty-ico">💞</div><p>还没有超话</p><small>给你和角色建一个 CP 超话，或者给喜欢的角色建个人超话</small></div>`
      }`;
  }

  async function createTopic() {
    const people = [{ id: "me", name: user.name, avatar: user.avatar }, ...cast];
    const sh = F.openSheet(
      `<div class="sh-chips"><button type="button" class="fun-chip-btn is-on" data-k="cp">💞 CP 超话</button><button type="button" class="fun-chip-btn" data-k="personal">⭐ 个人超话</button></div>
       <p class="fun-note" id="wb-tn">选两个人（可以选你自己）</p>
       <div class="fun-cast-list">${people.map((c) => `<button type="button" class="fun-cast-item" data-id="${esc(c.id)}">${avHtml(c, "fun-av")}<span class="fun-cast-name">${esc(c.name)}${c.id === "me" ? "（我）" : ""}</span><i class="fun-check"></i></button>`).join("")}</div>
       <label class="fun-field"><span>超话名（CP 名可以留空，让 AI 起）</span><input id="wb-tname" maxlength="16" /></label>
       <div class="fun-sheet-actions"><button type="button" class="fun-btn solid" data-a="ok">创建</button></div>`,
      { title: "创建超话" }
    );
    let kind = "cp";
    const sel = [];
    sh.body.addEventListener("click", async (e) => {
      const k = e.target.closest("[data-k]")?.dataset.k;
      if (k) {
        kind = k;
        sel.length = 0;
        sh.body.querySelectorAll("[data-k]").forEach((b) => b.classList.toggle("is-on", b.dataset.k === k));
        sh.body.querySelector("#wb-tn").textContent = k === "cp" ? "选两个人（可以选你自己）" : "选一个人";
      }
      const it = e.target.closest(".fun-cast-item");
      if (it) {
        const id = it.dataset.id;
        const max = kind === "cp" ? 2 : 1;
        const i = sel.indexOf(id);
        if (i >= 0) sel.splice(i, 1);
        else {
          sel.push(id);
          if (sel.length > max) sel.shift();
        }
      }
      sh.body.querySelectorAll(".fun-cast-item").forEach((b) => b.classList.toggle("is-on", sel.includes(b.dataset.id)));
      if (e.target.closest('[data-a="ok"]')) {
        const need = kind === "cp" ? 2 : 1;
        if (sel.length !== need) return toast(kind === "cp" ? "选两个人" : "选一个人");
        const members = sel.map((id) => people.find((x) => x.id === id));
        let name = sh.body.querySelector("#wb-tname").value.trim();
        const btn = e.target.closest("button");
        btn.disabled = true;
        if (!name && kind === "cp") {
          name = members.map((m) => m.name.slice(-1)).join("");
          if (F.hasApiKey()) {
            try {
              const t = await F.aiText([{ role: "user", content: `给「${members[0].name}」和「${members[1].name}」这对 CP 起一个饭圈风格的 CP 名（2~4 个字，可以取名字里的字、谐音或者梗）。只输出名字。` }], { maxTokens: 100 });
              name = F.cleanLine(t, 8).replace(/[#超话]/g, "") || name;
            } catch (_) {
              /* 用默认 */
            }
          }
        }
        if (!name) name = members[0].name;
        const t = { id: uid(), kind, name, members: members.map((m) => ({ id: m.id, name: m.name })), fans: 1000 + rnd(80000), posts: [], checkin: { days: 0, last: "" } };
        S.topics.unshift(t);
        save();
        sh.close();
        render();
        openTopic(t);
      }
    });
  }

  function openTopic(t) {
    const lv = Math.min(18, 1 + Math.floor((t.checkin?.days || 0) / 3));
    const signed = t.checkin?.last === new Date().toDateString();
    const sh = F.openSheet(
      `<div class="wb-th ${t.kind}"><span class="wb-topic-ico ${t.kind}">${t.kind === "cp" ? "💞" : "⭐"}</span><div><strong>${esc(topicName(t))} <button type="button" class="wb-rename" data-a="trename">✎ 改名</button></strong><small>${t.members.map((m) => esc(m.name)).join(" × ")} · 粉丝 ${fmtN(t.fans)}</small></div>
         <button type="button" class="fun-btn ${signed ? "ghost" : "solid"} sm" data-a="sign" ${signed ? "disabled" : ""}>${signed ? `已签到 · Lv.${lv}` : "签到"}</button></div>
       <div class="ww-row wb-trow"><button type="button" class="fun-btn ghost sm" data-a="tpost">✏️ 发帖</button><button type="button" class="fun-btn solid sm" data-a="tgen">看看大家发了什么</button></div>
       <div id="wb-tp">${t.posts.map((x) => postHtml(x, "topic")).join("") || `<p class="fun-note">还没有帖子</p>`}</div>`,
      { title: t.kind === "cp" ? "CP 超话" : "个人超话" }
    );
    sh.el.classList.add("fun-sheet--tall");
    sh.body.addEventListener("click", async (e) => {
      const a = e.target.closest("[data-a]")?.dataset.a;
      const btn = e.target.closest("button");
      if (a === "sign") {
        t.checkin = { days: (t.checkin?.days || 0) + 1, last: new Date().toDateString() };
        t.fans += 1;
        save();
        toast(`签到成功！连续签到 ${t.checkin.days} 天`);
        sh.close();
        openTopic(t);
      }
      if (a === "trename") {
        const r = F.openSheet(
          `<label class="fun-field"><span>超话名${t.kind === "cp" ? "（CP 名）" : "（后面会自动加「超话」两个字）"}</span><input id="wb-rn" maxlength="16" value="${esc(t.name)}" /></label>
           <div class="fun-sheet-actions"><button type="button" class="fun-btn solid" data-ok>保存</button></div>`,
          { title: "给超话改名" }
        );
        const inp = r.body.querySelector("#wb-rn");
        setTimeout(() => inp.focus(), 200);
        r.body.querySelector("[data-ok]").onclick = () => {
          const v = inp.value.trim().replace(/超话$/, "").replace(/[#]/g, "");
          if (!v) return toast("名字不能空着");
          const old = topicName(t);
          t.name = v;
          const now = topicName(t);
          // 帖子上「来自 xx」也一起改
          t.posts.forEach((x) => x.topic === old && (x.topic = now));
          save();
          r.close();
          sh.close();
          toast("已改名为「" + now + "」");
          openTopic(t);
          if (root) render();
        };
        return;
      }
      if (a === "tpost") {
        sh.close();
        compose(t);
      }
      if (a === "tgen") {
        if (needKey()) return;
        btn.disabled = true;
        btn.textContent = "加载中…";
        try {
          const names = t.members.map((m) => m.name).join(" 和 ");
          const about =
            t.kind === "cp"
              ? `这是「${t.name}」CP 超话（${names}）。写 CP 粉的帖子：嗑糖、分析细节、产粮（小段子）、日常发疯，偶尔有正主本人路过（如果是角色就按人设说话）。${t.members.some((m) => m.id === "me") ? `其中一位正主就是玩家${user.name}。` : ""}`
              : `这是「${t.name}」的个人超话。写粉丝的帖子：打卡、夸夸、分享 TA 的日常、应援、偶尔 TA 本人发帖或回复（按人设说话）。`;
          const arr = await genPosts(about + (t.posts.length ? `\n已有帖子（别重复）：${t.posts.slice(0, 4).map((p) => p.text.slice(0, 30)).join(" / ")}` : ""), 4);
          t.posts.unshift(...arr.map((x) => mkPost(x, { topic: topicName(t) })));
          save();
          sh.close();
          openTopic(t);
        } catch (err) {
          toast("失败：" + err.message);
          btn.disabled = false;
          btn.textContent = "看看大家发了什么";
        }
      }
      onPostOp(e);
    });
  }

  function compose(topic) {
    let image = "";
    const sh = F.openSheet(
      `<textarea class="wb-ta" id="wb-ctext" rows="4" maxlength="300" placeholder="${topic ? `在 ${esc(topicName(topic))} 发帖…` : "分享新鲜事…"}"></textarea>
       <div class="sv-c-img"><button type="button" class="fun-btn ghost sm" data-a="img">🖼 配图</button><img hidden alt="" /></div><input type="file" accept="image/*" hidden />
       <div class="fun-sheet-actions"><button type="button" class="fun-btn solid" data-a="send">发送</button></div>`,
      { title: topic ? topicName(topic) : "发喵博" }
    );
    const fi = sh.body.querySelector("input[type=file]");
    fi.onchange = async () => {
      const f = fi.files?.[0];
      if (!f) return;
      image = await compress(f);
      const im = sh.body.querySelector(".sv-c-img img");
      im.src = image;
      im.hidden = false;
    };
    sh.body.addEventListener("click", async (e) => {
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (a === "img") fi.click();
      if (a !== "send") return;
      const text = sh.body.querySelector("#wb-ctext").value.trim();
      if (!text && !image) return toast("写点什么吧");
      const p = { id: uid(), author: user.name, kind: "me", v: false, text, image, at: Date.now(), likes: 0, reposts: 0, liked: false, comments: [], topic: topic ? topicName(topic) : "" };
      if (topic) topic.posts.unshift(p);
      else S.feed.unshift(p);
      save();
      sh.close();
      if (topic) openTopic(topic);
      else {
        tab = "home";
        render();
      }
      if (!F.hasApiKey()) return;
      try {
        const txt = await F.aiText(
          [
            { role: "system", content: `你在模拟微博评论区，角色按各自人设说话，路人也要像真网友。${worldLine()}角色：\n${castDesc(8)}\n只输出 JSON。` },
            { role: "user", content: `${user.name}${topic ? `在「${topicName(topic)}」里` : ""}发了一条微博：「${text}」${image ? "（配了一张图）" : ""}\n生成 3~6 条评论（认识${user.name}的角色要出现），再给出点赞和转发数。格式：{"comments":[{"name":"","text":""}],"likes":整数,"reposts":整数}` }
          ],
          { maxTokens: 1000 }
        );
        const o = F.parseJsonLoose(txt) || {};
        (o.comments || []).forEach((c) => c && c.text && p.comments.push({ name: String(c.name || "网友").slice(0, 20), text: String(c.text).slice(0, 150) }));
        p.likes = parseInt(o.likes, 10) || rnd(300);
        p.reposts = parseInt(o.reposts, 10) || rnd(40);
        save();
        toast(`收到 ${p.comments.length} 条评论`);
        if (!topic) render();
      } catch (_) {
        /* ignore */
      }
    });
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
        resolve(c.toDataURL("image/jpeg", 0.8));
      };
      im.onerror = reject;
      im.src = url;
    });
  }

  function renderMe(p) {
    const mine = [...S.feed, ...S.topics.flatMap((t) => t.posts)].filter((x) => x.kind === "me").sort((a, b) => b.at - a.at);
    const likes = mine.reduce((s, x) => s + x.likes, 0);
    p.innerHTML = `<div class="wb-me">${avHtml(user, "fun-av sv-prof-av")}<strong>${esc(user.name)}</strong>
        <div class="sv-prof-stats"><span><b>${mine.length}</b>喵博</span><span><b>${S.topics.length}</b>超话</span><span><b>${fmtN(likes)}</b>获赞</span></div></div>
      ${mine.map((x) => postHtml(x, "me")).join("") || `<p class="fun-note cp-center">还没发过喵博</p>`}`;
  }

  function onPostOp(e) {
    const op = e.target.closest("[data-op]")?.dataset.op;
    const card = e.target.closest(".wb-post");
    if (!card) return false;
    const p = findPost(card.dataset.pid);
    if (!p) return false;
    if (op === "like") {
      p.liked = !p.liked;
      save();
      const b = e.target.closest("[data-op]");
      b.classList.toggle("is-on", p.liked);
      b.textContent = `${p.liked ? "❤" : "♡"} ${fmtN(p.likes + (p.liked ? 1 : 0))}`;
      return true;
    }
    if (op === "repost") {
      const text = `转发喵博 //@${p.author}: ${p.text.slice(0, 80)}`;
      S.feed.unshift({ id: uid(), author: user.name, kind: "me", v: false, text, at: Date.now(), likes: 0, reposts: 0, liked: false, comments: [] });
      p.reposts++;
      save();
      toast("已转发到首页");
      if (tab !== "hot") render();
      return true;
    }
    openComments(p);
    return true;
  }

  async function onClick(e) {
    const t = e.target.closest("[data-tab]");
    if (t && t.closest(".wb-tabs")) {
      tab = t.dataset.tab;
      return render();
    }
    if (onPostOp(e)) return;
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "compose") return compose(null);
    if (a === "newtopic") return void createTopic();
    if (a === "world") {
      const sh = F.openSheet(`<p class="fun-note">比如：「现代都市，江城」「仙侠世界，青云宗」「末日废土基地」。热搜和喵博会按这个世界来写。</p><textarea class="wb-ta" rows="3" maxlength="200">${esc(S.world)}</textarea><div class="fun-sheet-actions"><button type="button" class="fun-btn solid">保存</button></div>`, { title: "世界设定" });
      sh.body.querySelector("button").onclick = () => {
        S.world = sh.body.querySelector("textarea").value.trim();
        save();
        sh.close();
        render();
      };
      return;
    }
    if ((a === "refresh" || a === "hot") && !busy) {
      if (needKey()) return;
      busy = true;
      render();
      try {
        if (a === "hot") {
          const old = new Map(S.hot.map((h) => [h.title, h]));
          S.hot = (await genHot()).map((h) => old.get(h.title) || h);
          S.hotAt = Date.now();
        } else {
          const hot = S.hot.slice(0, 5).map((h) => h.title).join("、");
          const arr = await genPosts(`写首页信息流：角色们的日常微博为主，夹杂新闻媒体、娱乐博主、路人的微博。${hot ? `可以蹭这些热搜：${hot}。` : ""}`, 6);
          S.feed.unshift(...shuffle(arr.map((x) => mkPost(x))));
        }
        save();
      } catch (err) {
        toast("刷新失败：" + err.message);
      } finally {
        busy = false;
        render();
      }
      return;
    }
    const h = e.target.closest("[data-hid]");
    if (h) return void openHot(S.hot.find((x) => x.id === h.dataset.hid));
    const tp = e.target.closest("[data-tid]");
    if (tp) return openTopic(S.topics.find((x) => x.id === tp.dataset.tid));
  }

  F.register("微博", {
    title: "喵博",
    kicker: "MEOWBO",
    async mount(body) {
      root = document.createElement("div");
      root.className = "wb-root";
      body.appendChild(root);
      root.addEventListener("click", onClick);
      document.getElementById("fun-sheet-host")?.addEventListener("click", sheetOps);
      [cast, user] = await Promise.all([F.loadCast(), F.loadUser()]);
      await load();
      if (root) render();
    },
    unmount() {
      document.getElementById("fun-sheet-host")?.removeEventListener("click", sheetOps);
      root = null;
    }
  });

  /** 热搜详情弹层里的帖子按钮（超话弹层自己处理） */
  function sheetOps(e) {
    if (!root) return;
    const card = e.target.closest('.wb-post[data-where="hot"]');
    if (card) onPostOp(e);
  }
})();
