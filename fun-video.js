"use strict";

/**
 * 娱乐 · 短视频（刷视频）
 * 角色们按人设发「视频帖」：镜头画面描述 + 文案 + 话题 + BGM + 评论区。
 * 你也可以自己发（可配图），角色们会来评论；在评论区留言，作者会回复。
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast, rnd, pick, shuffle, hue, uid, avHtml } = F;

  const KV = "video_feed_v1";
  const MAX_POSTS = 80;
  let posts = [];
  let cast = [];
  let user = null;
  let root = null;
  let busy = false;
  let observer = null;
  let follows = new Set();
  let tab = "rec"; // rec | follow

  async function load() {
    try {
      const v = await F.FunDB.get(KV);
      posts = Array.isArray(v) ? v : [];
      follows = new Set((await F.FunDB.get("video_follow")) || []);
    } catch (_) {
      posts = [];
    }
  }
  function saveFollows() {
    F.FunDB.set("video_follow", [...follows]).catch(() => {});
  }
  function toggleFollow(name) {
    if (follows.has(name)) follows.delete(name);
    else follows.add(name);
    saveFollows();
    toast(follows.has(name) ? `已关注 ${name}` : `已取消关注 ${name}`);
  }
  function save() {
    posts = posts.slice(0, MAX_POSTS);
    F.FunDB.set(KV, posts).catch(() => toast("保存失败：存储空间不足"));
  }

  const castByName = (name) => cast.find((c) => c.name === name);
  const avatarOf = (name, isUser) => (isUser ? user?.avatar : castByName(name)?.avatar) || "";
  const fmtNum = (n) => (n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, "") + "w" : String(n));

  /* ───── AI 生成 ───── */
  async function generate(count) {
    if (busy) return;
    if (!F.hasApiKey()) {
      toast("请先在设置里填写 API Key");
      return;
    }
    busy = true;
    renderTopBusy(true);
    try {
      const base = tab === "follow" ? cast.filter((c) => follows.has(c.name)) : cast;
      if (tab === "follow" && !base.length) throw new Error("你关注的人里还没有角色，先去推荐页关注几个");
      const authors = shuffle(base.slice()).slice(0, Math.min(count, base.length));
      const castDesc = cast.length
        ? cast.map((c) => `- ${c.name}：${(c.persona || "（无人设）").replace(/\n/g, " ").slice(0, 160)}`).join("\n")
        : "（没有角色，全部用虚构网友）";
      const want = authors.length
        ? `本次请让这几位各发 1 条：${authors.map((a) => a.name).join("、")}${count > authors.length && tab !== "follow" ? `；再补 ${count - authors.length} 条路人网友的视频` : ""}。`
        : `请生成 ${count} 条路人网友的视频。`;
      const recent = posts.slice(0, 6).map((p) => `${p.author}：${p.caption}`).join("\n");
      const txt = await F.aiText(
        [
          {
            role: "system",
            content:
              "你是一个短视频平台（类似抖音）的内容生成器。根据角色人设，生成他们会发的短视频。视频无法真的拍出来，所以用「画面」字段描述镜头里看到的内容，要具体、有画面感、有生活气息。评论区要像真实网友，也可以有其他角色出现、按各自性格互动。只输出 JSON 数组。"
          },
          {
            role: "user",
            content: `角色列表：\n${castDesc}\n\n${want}${recent ? `\n\n最近已经发过的（避免重复）：\n${recent}` : ""}\n\n每条格式：{"author":"作者名（角色必须用原名）","emoji":"一个代表画面的emoji","scene":"画面描述，40~80字","caption":"视频文案，口语化，不超过40字","tags":["话题1","话题2"],"bgm":"背景音乐名","likes":点赞数(整数),"comments":[{"name":"评论者昵称或角色原名","text":"评论"}]} ，每条 3~5 条评论。`
          }
        ],
        { maxTokens: 2600, temperature: 0.95 }
      );
      const arr = F.parseJsonLoose(txt);
      if (!Array.isArray(arr) || !arr.length) throw new Error("生成格式不对，再试一次");
      const now = Date.now();
      const fresh = arr
        .filter((x) => x && x.author && (x.scene || x.caption))
        .map((x, i) => ({
          id: uid(),
          author: String(x.author).slice(0, 20),
          emoji: String(x.emoji || "🎬").slice(0, 4),
          scene: String(x.scene || "").slice(0, 200),
          caption: String(x.caption || "").slice(0, 80),
          tags: (Array.isArray(x.tags) ? x.tags : []).map((t) => String(t).replace(/^#/, "").slice(0, 16)).slice(0, 4),
          bgm: String(x.bgm || "原声").slice(0, 30),
          likes: Math.max(0, Math.min(9999999, parseInt(x.likes, 10) || rnd(5000))),
          liked: false,
          hue: hue(x.author + i + now),
          at: now - i * 1000,
          comments: (Array.isArray(x.comments) ? x.comments : []).filter((c) => c && c.text).map((c) => ({ name: String(c.name || "网友").slice(0, 20), text: String(c.text).slice(0, 120), at: now })),
          mine: false
        }));
      if (!fresh.length) throw new Error("没有生成出内容");
      const firstNew = posts.length;
      posts = posts.concat(fresh);
      save();
      renderFeed(firstNew);
      toast(`刷到 ${fresh.length} 条新视频`);
    } catch (err) {
      console.warn("[video] gen", err);
      toast("生成失败：" + (err.message || err));
    } finally {
      busy = false;
      renderTopBusy(false);
    }
  }

  async function aiReplies(post, userText) {
    if (!F.hasApiKey()) return [];
    const authorChar = castByName(post.author);
    const others = cast.filter((c) => c.name !== post.author).slice(0, 6);
    const txt = await F.aiText(
      [
        {
          role: "system",
          content: `你在模拟短视频评论区。视频作者是「${post.author}」${authorChar?.persona ? "，人设：" + authorChar.persona.replace(/\n/g, " ") : ""}。${others.length ? "其他可能出现的角色：" + others.map((c) => c.name + "（" + (c.persona || "").replace(/\n/g, " ").slice(0, 60) + "）").join("；") + "。" : ""}只输出 JSON 数组。`
        },
        {
          role: "user",
          content: `视频画面：${post.scene}\n文案：${post.caption}\n已有评论：\n${post.comments.slice(-8).map((c) => c.name + "：" + c.text).join("\n")}\n\n${user.name} 刚评论：「${userText}」\n\n请生成 1~2 条回复（作者优先回复，可以再有一位角色或网友接话）。格式：[{"name":"名字","text":"回复内容"}]`
        }
      ],
      { maxTokens: 700 }
    );
    const arr = F.parseJsonLoose(txt);
    return Array.isArray(arr) ? arr.filter((c) => c && c.text).slice(0, 2) : [];
  }

  async function aiCommentsForMine(post) {
    if (!F.hasApiKey()) return [];
    const castDesc = cast.slice(0, 8).map((c) => `${c.name}（${(c.persona || "").replace(/\n/g, " ").slice(0, 80)}）`).join("；");
    const txt = await F.aiText(
      [
        { role: "system", content: "你在模拟短视频评论区，评论要像真实网友，角色要符合各自性格。只输出 JSON 数组。" },
        {
          role: "user",
          content: `${user.name} 发了一条视频。\n内容：${post.scene || "（见图）"}\n文案：${post.caption}\n${castDesc ? "认识TA的角色：" + castDesc : ""}\n\n生成 4~6 条评论（角色和路人都要有），格式：[{"name":"名字","text":"评论"}]，再在最后加一个对象 {"likes":点赞数}。`
        }
      ],
      { maxTokens: 900 }
    );
    const arr = F.parseJsonLoose(txt);
    if (!Array.isArray(arr)) return [];
    const lk = arr.find((x) => x && x.likes != null);
    if (lk) post.likes = Math.max(post.likes, parseInt(lk.likes, 10) || 0);
    return arr.filter((c) => c && c.text);
  }

  /* ───── 渲染 ───── */
  function slideHtml(p, i) {
    const av = avatarOf(p.author, p.mine);
    return `<article class="sv-slide" data-i="${i}" style="--h:${p.hue}">
      <div class="sv-bg">${p.image ? `<img src="${esc(p.image)}" alt="" />` : `<span class="sv-emoji">${esc(p.emoji)}</span>`}</div>
      ${p.scene ? `<div class="sv-scene"><small>画面</small>${esc(p.scene)}</div>` : ""}
      <div class="sv-heart-pop"></div>
      <div class="sv-rail">
        <button type="button" class="sv-av-wrap" data-prof>${avHtml({ name: p.author, avatar: av }, "fun-av sv-av")}${!p.mine && !follows.has(p.author) ? `<span class="sv-follow-plus" data-follow>+</span>` : ""}</button>
        <button type="button" class="sv-rbtn${p.liked ? " is-on" : ""}" data-like><i class="ph-fill ph-heart"></i><span>${fmtNum(p.likes + (p.liked ? 1 : 0))}</span></button>
        <button type="button" class="sv-rbtn" data-cmt><i class="ph-fill ph-chat-circle-dots"></i><span>${fmtNum(p.comments.length)}</span></button>
        <button type="button" class="sv-rbtn" data-share><i class="ph-fill ph-share-fat"></i><span>分享</span></button>
        ${!p.mine && F.hasImageGen() ? `<button type="button" class="sv-rbtn" data-genimg><span class="sv-gi">🎨</span><span>${p.image ? "重画" : "画面"}</span></button>` : ""}
        ${p.mine ? `<button type="button" class="sv-rbtn" data-del><i class="ph ph-trash"></i><span>删除</span></button>` : ""}
      </div>
      <div class="sv-info">
        <strong data-prof>@${esc(p.author)}</strong>${p.likedBy && p.likedBy.length ? `<span class="sv-likedby">❤ ${esc(p.likedBy.join("、"))} 赞过</span>` : ""}
        <p>${esc(p.caption)} ${p.tags.map((t) => `<b>#${esc(t)}</b>`).join(" ")}</p>
        <span class="sv-bgm"><i class="sv-note">♪</i><span class="sv-marquee"><span>${esc(p.bgm)} - ${esc(p.author)}</span></span></span>
      </div>
      <div class="sv-prog"><i></i></div>
    </article>`;
  }

  function renderFeed(scrollTo) {
    if (!root) return;
    const feed = root.querySelector("#sv-feed");
    root.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("is-on", b.dataset.tab === tab));
    const list = posts.map((p, i) => ({ p, i })).filter(({ p }) => tab === "rec" || follows.has(p.author));
    if (tab === "follow" && !list.length) {
      feed.innerHTML = `<div class="sv-empty"><div class="sv-empty-ico">👀</div><p>${follows.size ? "关注的人还没发视频" : "还没有关注任何人"}</p><small>${follows.size ? "点下面让 TA 们发一批" : "在推荐页点头像下面的 + 关注角色"}</small>${follows.size ? `<button type="button" class="fun-btn solid" data-gen>让关注的人发视频</button>` : ""}</div>`;
      return;
    }
    if (!posts.length) {
      feed.innerHTML = `<div class="sv-empty"><div class="sv-empty-ico">📱</div><p>还没有视频</p><small>${cast.length ? `点下面让 ${cast.length} 位角色发视频` : "角色库里还没有角色，先刷路人的视频"}</small>
        <button type="button" class="fun-btn solid" data-gen>开始刷</button></div>`;
      return;
    }
    feed.innerHTML =
      list.map(({ p, i }) => slideHtml(p, i)).join("") +
      `<article class="sv-slide sv-more"><div class="sv-empty"><div class="sv-empty-ico">✨</div><p>刷完啦</p><button type="button" class="fun-btn solid" data-gen>再刷一批</button></div></article>`;
    bindObserver();
    if (scrollTo != null) {
      const el = feed.querySelector(`.sv-slide[data-i="${scrollTo}"]`);
      if (el) feed.scrollTo({ top: el.offsetTop, behavior: "smooth" });
    }
  }

  function bindObserver() {
    if (observer) observer.disconnect();
    const feed = root.querySelector("#sv-feed");
    observer = new IntersectionObserver(
      (entries) => entries.forEach((en) => en.target.classList.toggle("is-active", en.isIntersecting && en.intersectionRatio > 0.6)),
      { root: feed, threshold: [0.6] }
    );
    feed.querySelectorAll(".sv-slide").forEach((s) => observer.observe(s));
  }

  function renderTopBusy(on) {
    const b = document.querySelector("#sv-refresh");
    if (b) {
      b.disabled = on;
      b.innerHTML = on ? `<span class="fun-spin"></span>` : `<i class="ph ph-arrows-clockwise"></i>`;
    }
    const gens = root?.querySelectorAll("[data-gen]") || [];
    gens.forEach((g) => {
      g.disabled = on;
      g.textContent = on ? "正在生成…" : g.closest(".sv-more") ? "再刷一批" : "开始刷";
    });
  }

  function updateSlide(i) {
    const el = root?.querySelector(`.sv-slide[data-i="${i}"]`);
    if (!el) return;
    const wasActive = el.classList.contains("is-active");
    el.outerHTML = slideHtml(posts[i], i);
    const n = root.querySelector(`.sv-slide[data-i="${i}"]`);
    if (wasActive) n.classList.add("is-active");
    observer?.observe(n);
  }

  function toggleLike(i, forceOn) {
    const p = posts[i];
    p.liked = forceOn ? true : !p.liked;
    save();
    updateSlide(i);
  }

  function openComments(i) {
    const p = posts[i];
    const sh = F.openSheet(
      `<div class="sv-cmts" id="sv-cmts"></div>
       <div class="sv-cmt-input"><input type="text" placeholder="说点什么…" maxlength="100" /><button type="button" class="fun-btn solid sm" data-send>发送</button></div>`,
      { title: `${p.comments.length} 条评论` }
    );
    sh.el.classList.add("fun-sheet--tall");
    const list = sh.body.querySelector("#sv-cmts");
    const draw = () => {
      list.innerHTML = p.comments.length
        ? p.comments
            .map((c) => {
              const isAuthor = c.name === p.author;
              return `<div class="sv-cmt">${avHtml({ name: c.name, avatar: avatarOf(c.name, c.isUser) }, "fun-av sm")}<div><small>${esc(c.name)}${isAuthor ? ' <em>作者</em>' : ""}${castByName(c.name) && !isAuthor ? ' <em class="is-char">角色</em>' : ""}</small><p>${esc(c.text)}</p></div></div>`;
            })
            .join("")
        : `<p class="fun-note">还没有评论，来抢沙发</p>`;
      list.scrollTop = list.scrollHeight;
      sh.el.querySelector(".fun-sheet-title").textContent = `${p.comments.length} 条评论`;
    };
    draw();
    const input = sh.body.querySelector("input");
    const send = async () => {
      const t = input.value.trim();
      if (!t) return;
      input.value = "";
      p.comments.push({ name: user.name, text: t, isUser: true, at: Date.now() });
      save();
      draw();
      updateSlide(i);
      if (!F.hasApiKey()) return;
      list.insertAdjacentHTML("beforeend", `<p class="fun-note" data-typing>对方正在输入…</p>`);
      list.scrollTop = list.scrollHeight;
      try {
        const reps = await aiReplies(p, t);
        reps.forEach((r) => p.comments.push({ name: String(r.name || p.author).slice(0, 20), text: String(r.text).slice(0, 160), at: Date.now() }));
        save();
      } catch (err) {
        toast("回复失败：" + (err.message || err));
      }
      if (sh.el.isConnected) draw();
      updateSlide(i);
    };
    sh.body.querySelector("[data-send]").onclick = send;
    input.addEventListener("keydown", (e) => e.key === "Enter" && send());
  }

  function openProfile(name) {
    const c = castByName(name);
    const isMe = name === user.name;
    const theirs = posts.map((p, i) => ({ p, i })).filter(({ p }) => p.author === name);
    const likes = theirs.reduce((s, { p }) => s + p.likes + (p.liked ? 1 : 0), 0);
    const sh = F.openSheet(
      `<div class="sv-prof">
        ${avHtml({ name, avatar: avatarOf(name, isMe) }, "fun-av sv-prof-av")}
        <strong>${esc(name)}</strong>
        <p class="fun-note">${esc((c?.persona || (isMe ? "这是你自己" : "路人网友")).split("\n")[0].slice(0, 60))}</p>
        <div class="sv-prof-stats"><span><b>${theirs.length}</b>作品</span><span><b>${fmtNum(likes)}</b>获赞</span></div>
        ${isMe ? "" : `<button type="button" class="fun-btn ${follows.has(name) ? "ghost" : "solid"}" data-f>${follows.has(name) ? "已关注" : "+ 关注"}</button>`}
      </div>
      <div class="sv-prof-grid">${theirs
        .map(({ p, i }) => `<button type="button" class="sv-prof-item" data-go="${i}" style="--h:${p.hue}">${p.image ? `<img src="${esc(p.image)}" alt=""/>` : `<span>${esc(p.emoji)}</span>`}<small>♥ ${fmtNum(p.likes)}</small></button>`)
        .join("") || `<p class="fun-note">还没有作品</p>`}</div>`,
      { title: isMe ? "我的主页" : "主页" }
    );
    sh.el.classList.add("fun-sheet--tall");
    sh.body.addEventListener("click", (e) => {
      const f = e.target.closest("[data-f]");
      if (f) {
        toggleFollow(name);
        f.className = `fun-btn ${follows.has(name) ? "ghost" : "solid"}`;
        f.textContent = follows.has(name) ? "已关注" : "+ 关注";
        renderFeed();
        return;
      }
      const g = e.target.closest("[data-go]");
      if (g) {
        sh.close();
        if (tab === "follow" && !follows.has(name)) tab = "rec";
        renderFeed(Number(g.dataset.go));
      }
    });
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 720;
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("图片读取失败"));
      };
      img.src = url;
    });
  }

  function openCompose() {
    let image = "";
    const sh = F.openSheet(
      `<label class="fun-field"><span>视频内容（画面里拍了什么）</span><textarea id="sv-c-scene" rows="3" placeholder="比如：下班路上拍的晚霞，镜头慢慢从路灯摇到天空…"></textarea></label>
       <label class="fun-field"><span>文案</span><input id="sv-c-cap" type="text" maxlength="60" placeholder="配一句话" /></label>
       <label class="fun-field"><span>话题（空格分隔，可不填）</span><input id="sv-c-tags" type="text" placeholder="日常 晚霞" /></label>
       <div class="sv-c-img"><button type="button" class="fun-btn ghost sm" data-img><i class="ph ph-image"></i> 选封面图</button><img hidden alt="" /></div>
       <input type="file" accept="image/*" hidden />
       <div class="fun-sheet-actions"><button type="button" class="fun-btn ghost" data-cancel>取消</button><button type="button" class="fun-btn solid" data-post>发布</button></div>`,
      { title: "发视频" }
    );
    const fileIn = sh.body.querySelector("input[type=file]");
    sh.body.querySelector("[data-img]").onclick = () => fileIn.click();
    fileIn.onchange = async () => {
      const f = fileIn.files?.[0];
      if (!f) return;
      try {
        image = await compressImage(f);
        const im = sh.body.querySelector(".sv-c-img img");
        im.src = image;
        im.hidden = false;
      } catch (err) {
        toast(err.message);
      }
    };
    sh.body.querySelector("[data-cancel]").onclick = () => sh.close();
    sh.body.querySelector("[data-post]").onclick = async () => {
      const scene = sh.body.querySelector("#sv-c-scene").value.trim();
      const caption = sh.body.querySelector("#sv-c-cap").value.trim();
      if (!scene && !caption && !image) {
        toast("写点内容或者选张图");
        return;
      }
      const post = {
        id: uid(),
        author: user.name,
        mine: true,
        emoji: "🎬",
        scene,
        caption,
        image,
        tags: sh.body.querySelector("#sv-c-tags").value.trim().split(/\s+/).filter(Boolean).map((t) => t.replace(/^#/, "")).slice(0, 4),
        bgm: "原声",
        likes: 0,
        liked: false,
        hue: rnd(360),
        at: Date.now(),
        comments: []
      };
      posts.unshift(post);
      save();
      sh.close();
      renderFeed(0);
      root.querySelector("#sv-feed").scrollTo({ top: 0 });
      if (F.hasApiKey()) {
        toast("发布成功，等大家来评论…");
        try {
          const cm = await aiCommentsForMine(post);
          const fans = shuffle(cast.filter((c) => cm.some((x) => x.name === c.name) || Math.random() < 0.3).map((c) => c.name)).slice(0, 4);
          if (fans.length) post.likedBy = fans;
          post.comments.push(...cm.map((c) => ({ name: String(c.name || "网友").slice(0, 20), text: String(c.text).slice(0, 120), at: Date.now() })));
          save();
          const i = posts.indexOf(post);
          if (i >= 0) updateSlide(i);
          toast(`收到 ${cm.length} 条评论`);
        } catch (err) {
          toast("评论生成失败：" + (err.message || err));
        }
      } else toast("发布成功");
    };
  }

  /* ───── 事件 ───── */
  let lastTap = 0;
  function onClick(e) {
    if (e.target.closest("[data-gen]")) return void generate(4);
    const slide = e.target.closest(".sv-slide[data-i]");
    if (!slide) return;
    const i = Number(slide.dataset.i);
    if (e.target.closest("[data-follow]")) {
      toggleFollow(posts[i].author);
      return renderFeed();
    }
    if (e.target.closest("[data-prof]")) return openProfile(posts[i].author);
    if (e.target.closest("[data-like]")) return toggleLike(i);
    const gi = e.target.closest("[data-genimg]");
    if (gi) {
      if (gi.dataset.busy) return;
      gi.dataset.busy = "1";
      gi.querySelector("span:last-child").textContent = "生成中";
      const p = posts[i];
      const c = castByName(p.author);
      F.genImage(`短视频画面截图（竖屏 9:16）。${p.scene}。文案：${p.caption}`, { chars: c ? [c] : [], style: "vertical video frame, cinematic, candid" })
        .then((img) => {
          p.image = img;
          save();
          updateSlide(i);
        })
        .catch((err) => {
          toast(err.message);
          updateSlide(i);
        });
      return;
    }
    if (e.target.closest("[data-cmt]")) return openComments(i);
    if (e.target.closest("[data-share]")) {
      const p = posts[i];
      const text = `@${p.author}：${p.caption} ${p.tags.map((t) => "#" + t).join(" ")}`;
      navigator.clipboard?.writeText(text).then(
        () => toast("文案已复制"),
        () => toast(text)
      );
      return;
    }
    if (e.target.closest("[data-del]")) {
      if (Date.now() - (onClick.delAt || 0) < 2500) {
        posts.splice(i, 1);
        save();
        renderFeed();
      } else {
        onClick.delAt = Date.now();
        toast("再点一次删除");
      }
      return;
    }
    // 双击点赞
    const now = Date.now();
    if (now - lastTap < 320) {
      if (!posts[i].liked) toggleLike(i, true);
      const s = root.querySelector(`.sv-slide[data-i="${i}"] .sv-heart-pop`);
      if (s) {
        s.classList.remove("go");
        void s.offsetWidth;
        s.classList.add("go");
      }
      lastTap = 0;
    } else lastTap = now;
  }

  F.register("短视频", {
    title: "刷刷",
    kicker: "SHORT VIDEO",
    theme: "dark",
    async mount(body, act) {
      root = document.createElement("div");
      root.className = "sv-root";
      root.innerHTML = `<div class="sv-tabs"><button type="button" data-tab="follow">关注</button><button type="button" data-tab="rec" class="is-on">推荐</button><button type="button" data-tab="me">我</button></div><div class="sv-feed" id="sv-feed"><div class="sv-empty"><span class="fun-spin"></span></div></div>`;
      root.querySelector(".sv-tabs").addEventListener("click", (e) => {
        const t = e.target.closest("[data-tab]")?.dataset.tab;
        if (!t) return;
        if (t === "me") return user && openProfile(user.name);
        tab = t;
        renderFeed();
        root.querySelector("#sv-feed").scrollTo({ top: 0 });
      });
      body.appendChild(root);
      root.addEventListener("click", onClick);
      act.innerHTML = `<button type="button" class="fun-icon-btn" id="sv-refresh" aria-label="刷新"><i class="ph ph-arrows-clockwise"></i></button><button type="button" class="fun-icon-btn" id="sv-post" aria-label="发视频"><i class="ph ph-plus"></i></button>`;
      act.querySelector("#sv-refresh").onclick = () => void generate(4);
      act.querySelector("#sv-post").onclick = openCompose;
      [cast, user] = await Promise.all([F.loadCast(), F.loadUser()]);
      await load();
      if (!root) return;
      renderFeed();
    },
    unmount() {
      observer?.disconnect();
      observer = null;
      root = null;
    }
  });
})();
