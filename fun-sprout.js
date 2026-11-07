"use strict";

/**
 * Sprout · 种草社区（类似小红书）
 * 双列瀑布流笔记：角色和网友发的种草/穿搭/探店/日常/教程；搜索任意关键词会生成相关笔记；
 * 点赞、收藏、评论（角色会回复）、自己发笔记、作者主页、收藏夹。
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast, rnd, pick, shuffle, uid, hue, avHtml } = F;

  const KV = "sprout_v1";
  const CHANNELS = ["推荐", "穿搭", "美食", "探店", "日常", "学习", "情感", "好物"];
  let S = null;
  let root = null;
  let cast = [];
  let user = null;
  let channel = "推荐";
  let view = "feed"; // feed | search | fav | me
  let query = "";
  let busy = false;

  async function load() {
    try {
      S = (await F.FunDB.get(KV)) || null;
    } catch (_) {
      S = null;
    }
    if (!S) S = { notes: [], favs: [], follows: [] };
  }
  function save() {
    if (S.notes.length > 150) S.notes = S.notes.slice(0, 150);
    F.FunDB.set(KV, S).catch(() => toast("保存失败：存储空间不足"));
  }
  const charByName = (n) => cast.find((c) => c.name === n);
  const avOf = (name, isMe) => (isMe ? user.avatar : charByName(name)?.avatar) || "";
  const fmtN = (n) => (n >= 1e4 ? (n / 1e4).toFixed(1).replace(/\.0$/, "") + "w" : String(n));

  async function genNotes(about, n) {
    const txt = await F.aiText(
      [
        {
          role: "system",
          content: `你在模拟一个种草社区（类似小红书）。笔记作者有角色本人（按人设写，自己的风格和生活）和普通网友（博主、学生、上班族、宝妈……）。笔记要有小红书味：标题吸睛带 emoji、正文分段、真实细节和个人体验、结尾带话题标签。评论区像真网友，角色也可能出现。内容虚构。只输出 JSON。`
        },
        {
          role: "user",
          content: `角色：\n${cast.map((c) => `- ${c.name}：${(c.persona || "").replace(/\n/g, " ").slice(0, 120)}`).join("\n") || "（无）"}\n\n${about}\n\n生成 ${n} 篇笔记。格式：[{"author":"作者（角色用原名）","title":"标题 20 字内","emoji":"一个代表封面的 emoji","cover":"封面画面描述 10 字内","text":"正文 80~200 字，可分段","tags":["话题",""],"channel":"${CHANNELS.slice(1).join("/")}之一","likes":点赞数,"comments":[{"name":"","text":""}]}]，每篇 2~4 条评论。`
        }
      ],
      { maxTokens: 3500, temperature: 0.95 }
    );
    const arr = F.parseJsonLoose(txt);
    if (!Array.isArray(arr) || !arr.length) throw new Error("格式不对，再试一次");
    return arr
      .filter((x) => x && x.title)
      .map((x) => ({
        id: uid(),
        author: String(x.author || "路人").slice(0, 20),
        title: String(x.title).slice(0, 40),
        emoji: String(x.emoji || "🌱").slice(0, 4),
        cover: String(x.cover || "").slice(0, 20),
        text: String(x.text || "").slice(0, 800),
        tags: (Array.isArray(x.tags) ? x.tags : []).map((t) => String(t).replace(/^#/, "").slice(0, 14)).slice(0, 5),
        channel: CHANNELS.includes(x.channel) ? x.channel : pick(CHANNELS.slice(1)),
        likes: Math.max(0, parseInt(x.likes, 10) || rnd(3000)),
        favs: rnd(800),
        hue: rnd(360),
        h: 150 + rnd(90),
        at: Date.now() - rnd(86400000 * 3),
        comments: (Array.isArray(x.comments) ? x.comments : []).filter((c) => c && c.text).map((c) => ({ name: String(c.name || "网友").slice(0, 20), text: String(c.text).slice(0, 150) })),
        liked: false,
        q: query || ""
      }));
  }

  /* ───── 渲染 ───── */
  function card(n) {
    return `<button type="button" class="sp-card" data-nid="${n.id}">
      <span class="sp-cover" style="--h:${n.hue};height:${n.h}px">${n.image ? `<img src="${esc(n.image)}" alt="" />` : `<span class="sp-emoji">${esc(n.emoji)}</span>${n.cover ? `<small>${esc(n.cover)}</small>` : ""}`}</span>
      <strong>${esc(n.title)}</strong>
      <span class="sp-meta">${avHtml({ name: n.author, avatar: avOf(n.author, n.mine) }, "fun-av sm")}<span>${esc(n.author)}</span><em class="${n.liked ? "is-on" : ""}">${n.liked ? "❤" : "♡"} ${fmtN(n.likes + (n.liked ? 1 : 0))}</em></span>
    </button>`;
  }
  function waterfall(list) {
    const cols = [[], []];
    const hs = [0, 0];
    for (const n of list) {
      const i = hs[0] <= hs[1] ? 0 : 1;
      cols[i].push(n);
      hs[i] += n.h + 80;
    }
    return `<div class="sp-wf">${cols.map((c) => `<div class="sp-col">${c.map(card).join("")}</div>`).join("")}</div>`;
  }

  function render() {
    if (!root) return;
    let list = S.notes;
    let head = "";
    if (view === "feed") {
      list = channel === "推荐" ? S.notes.filter((n) => !n.q) : S.notes.filter((n) => n.channel === channel && !n.q);
      head = `<div class="sp-chan">${CHANNELS.map((c) => `<button type="button" data-ch="${c}" class="${c === channel ? "is-on" : ""}">${c}</button>`).join("")}</div>`;
    } else if (view === "search") {
      list = S.notes.filter((n) => n.q === query);
      head = `<p class="sp-qhead">「${esc(query)}」的搜索结果 <button type="button" class="sh-link" data-a="back">返回</button></p>`;
    } else if (view === "fav") {
      list = S.notes.filter((n) => S.favs.includes(n.id));
      head = `<p class="sp-qhead">⭐ 我的收藏 <button type="button" class="sh-link" data-a="back">返回</button></p>`;
    } else if (view === "me") {
      list = S.notes.filter((n) => n.mine);
      head = `<div class="wb-me">${avHtml(user, "fun-av sv-prof-av")}<strong>${esc(user.name)}</strong><div class="sv-prof-stats"><span><b>${list.length}</b>笔记</span><span><b>${fmtN(list.reduce((s, n) => s + n.likes, 0))}</b>获赞</span><span><b>${S.favs.length}</b>收藏</span></div><button type="button" class="sh-link" data-a="back">返回</button></div>`;
    }
    root.innerHTML = `<div class="sp">
      <div class="sp-top"><div class="sp-search"><input type="search" placeholder="搜索笔记，比如：秋冬穿搭" value="${esc(view === "search" ? query : "")}" /></div>
        <button type="button" class="fun-icon-btn" data-a="fav" title="收藏">⭐</button><button type="button" class="fun-icon-btn" data-a="me" title="我">👤</button></div>
      ${head}
      <div class="sp-body" id="sp-body">${list.length ? waterfall(list) : `<div class="sh-empty"><div class="sh-empty-ico">🌱</div><p>${view === "feed" ? "这里还空空的" : "没有内容"}</p><small>${view === "feed" ? "点下面刷新，看看大家在种草什么" : ""}</small></div>`}
        ${view === "feed" || view === "search" ? `<div class="sp-more"><button type="button" class="fun-btn solid" data-a="more" ${busy ? "disabled" : ""}>${busy ? "加载中…" : view === "search" ? "再搜一批" : "刷新一批"}</button></div>` : ""}
      </div>
      <button type="button" class="sp-fab" data-a="post">＋</button></div>`;
    const inp = root.querySelector(".sp-search input");
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing && inp.value.trim()) {
        query = inp.value.trim();
        view = "search";
        render();
        if (!S.notes.some((n) => n.q === query)) void more();
      }
    });
  }

  async function more() {
    if (busy) return;
    if (!F.hasApiKey()) return toast("请先在设置里填写 API Key");
    busy = true;
    render();
    try {
      const about =
        view === "search"
          ? `用户搜索了「${query}」，生成与之相关的笔记（各种角度：测评、经验、避雷、推荐）。`
          : channel === "推荐"
            ? `生成首页推荐笔记，频道混搭，角色本人的笔记占一半左右。${S.notes.length ? `已有笔记（别重复）：${S.notes.slice(0, 6).map((n) => n.title).join(" / ")}` : ""}`
            : `生成「${channel}」频道的笔记，角色本人的笔记占一半左右。`;
      const arr = await genNotes(about, 6);
      if (view === "search") arr.forEach((n) => (n.q = query));
      else if (channel !== "推荐") arr.forEach((n) => (n.channel = channel));
      S.notes.unshift(...shuffle(arr));
      save();
    } catch (err) {
      toast("加载失败：" + err.message);
    } finally {
      busy = false;
      render();
    }
  }

  function openNote(n) {
    const isFav = S.favs.includes(n.id);
    const following = S.follows.includes(n.author);
    const sh = F.openSheet(
      `<div class="sp-detail">
        <div class="sp-author">${avHtml({ name: n.author, avatar: avOf(n.author, n.mine) }, "fun-av")}<strong>${esc(n.author)}</strong>${charByName(n.author) ? `<em class="wb-chartag">角色</em>` : ""}${n.mine ? "" : `<button type="button" class="fun-btn ${following ? "ghost" : "solid"} sm sp-follow" data-a="follow">${following ? "已关注" : "关注"}</button>`}</div>
        <div class="sp-dcover" style="--h:${n.hue}">${n.image ? `<img src="${esc(n.image)}" alt="" />` : `<span>${esc(n.emoji)}</span>${n.cover ? `<small>${esc(n.cover)}</small>` : ""}`}
          ${!n.mine && F.hasImageGen() ? `<button type="button" class="sp-genimg" data-a="genimg">🎨 ${n.image ? "重新生成配图" : "生成配图"}</button>` : ""}</div>
        <h3>${esc(n.title)}</h3>
        <p class="sp-text">${esc(n.text).replace(/\n/g, "<br/>")}</p>
        <p class="sp-tags">${n.tags.map((t) => `<b>#${esc(t)}</b>`).join(" ")}</p>
        <small class="sp-date">${new Date(n.at).toLocaleDateString("zh-CN")}</small>
        <p class="fun-kicker">共 ${n.comments.length} 条评论</p>
        <div class="sv-cmts" id="sp-cm"></div>
      </div>
      <div class="sp-dbar"><input type="text" placeholder="说点什么…" maxlength="140" /><button type="button" data-a="like" class="${n.liked ? "is-on" : ""}">${n.liked ? "❤" : "♡"} ${fmtN(n.likes + (n.liked ? 1 : 0))}</button><button type="button" data-a="fav" class="${isFav ? "is-on" : ""}">${isFav ? "★" : "☆"} ${fmtN(n.favs + (isFav ? 1 : 0))}</button>${n.mine ? `<button type="button" data-a="del">🗑</button>` : ""}</div>`,
      { title: "" }
    );
    sh.el.classList.add("fun-sheet--tall", "sp-sheet");
    const cm = sh.body.querySelector("#sp-cm");
    const draw = (typing) => {
      cm.innerHTML =
        n.comments.map((c) => `<div class="sv-cmt">${avHtml({ name: c.name, avatar: avOf(c.name, c.isMe) }, "fun-av sm")}<div><small>${esc(c.name)}${c.name === n.author ? " <em>作者</em>" : ""}${charByName(c.name) && c.name !== n.author ? ' <em class="is-char">角色</em>' : ""}</small><p>${esc(c.text)}</p></div></div>`).join("") +
        (typing ? `<p class="fun-note">对方正在输入…</p>` : "");
    };
    draw();
    const inp = sh.body.querySelector(".sp-dbar input");
    const send = async () => {
      const t = inp.value.trim();
      if (!t) return;
      inp.value = "";
      n.comments.push({ name: user.name, text: t, isMe: true });
      save();
      draw(F.hasApiKey());
      if (!F.hasApiKey()) return;
      try {
        const txt = await F.aiText(
          [
            { role: "system", content: `你在模拟种草社区的评论区。作者「${n.author}」${charByName(n.author)?.persona ? "人设：" + charByName(n.author).persona.replace(/\n/g, " ").slice(0, 200) : ""}。其他角色：${cast.filter((c) => c.name !== n.author).slice(0, 6).map((c) => c.name).join("、")}。只输出 JSON 数组。` },
            { role: "user", content: `笔记：${n.title}\n${n.text.slice(0, 300)}\n已有评论：${n.comments.slice(-6).map((c) => c.name + "：" + c.text).join(" / ")}\n\n${user.name} 刚评论：「${t}」\n生成 1~2 条回复（作者优先）。格式：[{"name":"","text":""}]` }
          ],
          { maxTokens: 600 }
        );
        const arr = F.parseJsonLoose(txt);
        (Array.isArray(arr) ? arr : []).filter((x) => x && x.text).slice(0, 2).forEach((x) => n.comments.push({ name: String(x.name || n.author).slice(0, 20), text: String(x.text).slice(0, 150) }));
        save();
      } catch (err) {
        toast("回复失败：" + err.message);
      }
      if (sh.el.isConnected) draw();
    };
    inp.addEventListener("keydown", (e) => e.key === "Enter" && !e.isComposing && send());
    sh.body.addEventListener("click", (e) => {
      const a = e.target.closest("[data-a]")?.dataset.a;
      const b = e.target.closest("button");
      if (a === "like") {
        n.liked = !n.liked;
        b.className = n.liked ? "is-on" : "";
        b.textContent = `${n.liked ? "❤" : "♡"} ${fmtN(n.likes + (n.liked ? 1 : 0))}`;
      }
      if (a === "fav") {
        const on = !S.favs.includes(n.id);
        S.favs = on ? [n.id, ...S.favs] : S.favs.filter((x) => x !== n.id);
        b.className = on ? "is-on" : "";
        b.textContent = `${on ? "★" : "☆"} ${fmtN(n.favs + (on ? 1 : 0))}`;
      }
      if (a === "follow") {
        const on = !S.follows.includes(n.author);
        S.follows = on ? [...S.follows, n.author] : S.follows.filter((x) => x !== n.author);
        b.className = `fun-btn ${on ? "ghost" : "solid"} sm sp-follow`;
        b.textContent = on ? "已关注" : "关注";
      }
      if (a === "genimg") {
        b.disabled = true;
        b.textContent = "生成中…";
        const c = charByName(n.author);
        F.genImage(`小红书笔记配图。标题：${n.title}。${n.cover ? "画面：" + n.cover + "。" : ""}${n.text.slice(0, 200)}`, { chars: c ? [c] : [], style: "photo, social media post, natural light" })
          .then((img) => {
            n.image = img;
            save();
            const box = sh.body.querySelector(".sp-dcover");
            if (box) box.innerHTML = `<img src="${esc(img)}" alt="" />`;
            render();
          })
          .catch((err) => {
            toast(err.message);
            b.disabled = false;
            b.textContent = "🎨 生成配图";
          });
        return;
      }
      if (a === "del") {
        S.notes = S.notes.filter((x) => x !== n);
        save();
        sh.close();
        return render();
      }
      if (a) {
        save();
        render();
      }
    });
  }

  function compose() {
    let image = "";
    const sh = F.openSheet(
      `<div class="sv-c-img"><button type="button" class="fun-btn ghost sm" data-a="img">🖼 添加封面</button><img hidden alt="" /></div><input type="file" accept="image/*" hidden />
       <label class="fun-field"><span>标题</span><input id="sp-t" maxlength="30" placeholder="填写标题会有更多赞哦～" /></label>
       <label class="fun-field"><span>正文</span><textarea id="sp-x" rows="5" maxlength="800" placeholder="分享你的种草心得…"></textarea></label>
       <label class="fun-field"><span>频道</span><select id="sp-c">${CHANNELS.slice(1).map((c) => `<option>${c}</option>`).join("")}</select></label>
       <div class="fun-sheet-actions"><button type="button" class="fun-btn solid" data-a="post">发布笔记</button></div>`,
      { title: "发笔记" }
    );
    sh.el.classList.add("fun-sheet--tall");
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
      if (a !== "post") return;
      const title = sh.body.querySelector("#sp-t").value.trim();
      const text = sh.body.querySelector("#sp-x").value.trim();
      if (!title) return toast("写个标题吧");
      const n = { id: uid(), author: user.name, mine: true, title, text, image, emoji: "🌱", cover: "", tags: (text.match(/#([^#\s]{1,14})/g) || []).map((t) => t.slice(1)), channel: sh.body.querySelector("#sp-c").value, likes: 0, favs: 0, hue: rnd(360), h: 170 + rnd(60), at: Date.now(), comments: [], liked: false, q: "" };
      S.notes.unshift(n);
      save();
      sh.close();
      view = "feed";
      channel = "推荐";
      render();
      if (!F.hasApiKey()) return;
      try {
        const txt = await F.aiText(
          [
            { role: "system", content: `你在模拟种草社区评论区，角色按人设说话，路人像真网友。角色：${cast.slice(0, 8).map((c) => c.name + "（" + (c.persona || "").replace(/\n/g, " ").slice(0, 60) + "）").join("；")}。只输出 JSON。` },
            { role: "user", content: `${user.name} 发了笔记《${title}》：${text.slice(0, 400)}\n生成 3~6 条评论（认识 TA 的角色要出现），再给点赞收藏数。格式：{"comments":[{"name":"","text":""}],"likes":整数,"favs":整数}` }
          ],
          { maxTokens: 1000 }
        );
        const o = F.parseJsonLoose(txt) || {};
        (o.comments || []).forEach((c) => c && c.text && n.comments.push({ name: String(c.name || "网友").slice(0, 20), text: String(c.text).slice(0, 150) }));
        n.likes = parseInt(o.likes, 10) || rnd(200);
        n.favs = parseInt(o.favs, 10) || rnd(60);
        save();
        toast(`笔记收到 ${n.comments.length} 条评论`);
        render();
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
        const s = Math.min(1, 800 / Math.max(im.width, im.height));
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

  function onClick(e) {
    const ch = e.target.closest("[data-ch]");
    if (ch) {
      channel = ch.dataset.ch;
      return render();
    }
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "more") return void more();
    if (a === "post") return compose();
    if (a === "fav" || a === "me") {
      view = a;
      return render();
    }
    if (a === "back") {
      view = "feed";
      return render();
    }
    const c = e.target.closest("[data-nid]");
    if (c) openNote(S.notes.find((n) => n.id === c.dataset.nid));
  }

  F.register("Sprout", {
    title: "Sprout",
    kicker: "种草 · NOTES",
    async mount(body) {
      root = document.createElement("div");
      root.className = "sp-root";
      body.appendChild(root);
      root.addEventListener("click", onClick);
      [cast, user] = await Promise.all([F.loadCast(), F.loadUser()]);
      await load();
      view = "feed";
      if (root) render();
    },
    unmount() {
      root = null;
    }
  });
})();
