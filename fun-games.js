"use strict";

/**
 * 游戏厅：入口 + 战绩，以及三个 AI 小游戏
 *   - 真心话大冒险（转瓶子）
 *   - 你画我猜（我画 TA 猜：需要模型能看图；TA 出题我来猜：纯文字）
 *   - 谁是卧底
 * UNO / 狼人杀 / 飞行棋 在各自文件里，这里只做入口。
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast, sleep, rnd, pick, shuffle, avHtml } = F;

  const GAMES = [
    { key: "UNO", icon: "🃏", name: "UNO", desc: "经典卡牌，角色会嘴炮" },
    { key: "狼人杀", icon: "🐺", name: "狼人杀", desc: "6~9 人，AI 发言投票" },
    { key: "飞行棋", icon: "✈️", name: "飞行棋", desc: "掷骰子，撞飞对手" },
    { key: "谁是卧底", icon: "🕵️", name: "谁是卧底", desc: "描述词语，揪出卧底" },
    { key: "真心话大冒险", icon: "🍾", name: "真心话大冒险", desc: "转瓶子，敢不敢" },
    { key: "你画我猜", icon: "🎨", name: "你画我猜", desc: "画给 TA 猜 / 猜 TA 的词" }
  ];

  const needKey = () => {
    if (F.hasApiKey()) return false;
    toast("这个游戏需要 AI，请先在设置里填写 API Key");
    return true;
  };

  /** 选角色的公共开局页 */
  async function setupPage(root, opt) {
    const cast = await F.loadCast();
    const user = await F.loadUser();
    if (!root.isConnected) return;
    let picked = opt.lastPicked && opt.lastPicked.length ? opt.lastPicked.filter((p) => cast.some((c) => c.id === p.id)) : [];
    if (picked.length < opt.min) picked = shuffle(cast.slice()).slice(0, Math.min(opt.def || opt.min, cast.length));
    root.innerHTML = `<div class="fun-setup"><div class="fun-hero">${opt.icon}</div>
      <p class="fun-kicker">${esc(opt.kicker)}</p><h2 class="fun-h2">${esc(opt.title)}</h2>
      <p class="fun-note">${opt.note}</p>
      <div class="fun-picked" id="gp-picked"></div>
      ${opt.extra || ""}
      ${F.hasApiKey() ? "" : `<p class="fun-note warn">需要先在设置里填写 API Key。</p>`}
      <div class="fun-setup-btns"><button type="button" class="fun-btn ghost" id="gp-pick">选角色</button><button type="button" class="fun-btn solid" id="gp-start">开始</button></div></div>`;
    const draw = () =>
      (root.querySelector("#gp-picked").innerHTML = picked.length
        ? picked.map((p) => `<span class="fun-chip">${avHtml(p, "fun-av sm")}${esc(p.name)}</span>`).join("")
        : `<p class="fun-note warn">角色库里至少需要 ${opt.min} 位角色</p>`);
    draw();
    root.querySelector("#gp-pick").onclick = async () => {
      if (cast.length < opt.min) return toast(`角色库里至少需要 ${opt.min} 位角色`);
      const r = await F.pickCast(cast, { min: opt.min, max: opt.max, preselect: picked.map((p) => p.id), title: `选 ${opt.min}~${opt.max} 位` });
      if (r) {
        picked = r;
        draw();
      }
    };
    return new Promise((resolve) => {
      root.querySelector("#gp-start").onclick = () => {
        if (needKey()) return;
        if (picked.length < opt.min) return toast(`至少选 ${opt.min} 位角色`);
        opt.lastPicked = picked;
        resolve({ user, picked, root });
      };
    });
  }

  function persona(p) {
    return `${p.persona ? "人设：\n" + p.persona + "\n" : ""}${F.recordSummary(p.name)}`;
  }

  /* ═════════ 游戏厅 ═════════ */
  F.register("游戏厅", {
    title: "游戏厅",
    kicker: "GAME CENTER",
    async mount(body) {
      const recs = await F.loadRecords();
      const won = recs.filter((r) => r.userWon).length;
      const byName = {};
      for (const r of recs) for (const n of r.players) {
        const x = (byName[n] = byName[n] || { n: 0, w: 0 });
        x.n++;
        if (r.userWon) x.w++;
      }
      const rivals = Object.entries(byName).sort((a, b) => b[1].n - a[1].n).slice(0, 6);
      body.innerHTML = `<div class="gh">
        <div class="gh-grid">${GAMES.map((g) => `<button type="button" class="gh-card" data-g="${g.key}"><span class="gh-ico">${g.icon}</span><strong>${g.name}</strong><small>${g.desc}</small></button>`).join("")}</div>
        <div class="gh-rec">
          <div class="gh-rec-head"><span class="fun-kicker">RECORDS · 战绩</span><span class="gh-total">${recs.length} 局 · 胜 ${won} · 胜率 ${recs.length ? Math.round((won / recs.length) * 100) : 0}%</span></div>
          ${rivals.length ? `<div class="gh-rivals">${rivals.map(([n, v]) => `<span class="fun-chip">${esc(n)} · 同局 ${v.n} · 你赢 ${v.w}</span>`).join("")}</div>` : ""}
          <ul class="gh-list">${
            recs.length
              ? recs
                  .slice(-15)
                  .reverse()
                  .map((r) => `<li><span class="gh-res ${r.userWon ? "is-win" : ""}">${r.userWon ? "胜" : "负"}</span><span><strong>${esc(r.game)}</strong><small>${esc(r.players.join("、"))}${r.note ? " · " + esc(r.note) : ""}</small></span><small>${new Date(r.at).toLocaleDateString()}</small></li>`)
                  .join("")
              : `<li class="gh-none">还没有战绩，去玩一局吧。角色们会记住和你的输赢。</li>`
          }</ul>
        </div></div>`;
      body.querySelectorAll("[data-g]").forEach((b) => (b.onclick = () => F.open(b.dataset.g)));
    },
    unmount() {}
  });

  /* ═════════ 真心话大冒险 ═════════ */
  (function () {
    const opt = { icon: "🍾", kicker: "TRUTH OR DARE", title: "真心话大冒险", min: 2, max: 5, def: 3, note: "转瓶子选人。被选中的人选真心话还是大冒险，由上一位出题。角色会按人设回答，也会给你出难题。" };
    let root = null;
    let T = null;

    const say = (who, text, cls) => {
      if (!T) return;
      T.log.push({ who, text, cls });
      drawLog();
    };
    function drawSeats() {
      const el = root?.querySelector("#td-ring");
      if (!el) return;
      const n = T.players.length;
      el.innerHTML =
        T.players
          .map((p, i) => {
            const a = (i / n) * Math.PI * 2 - Math.PI / 2;
            return `<div class="td-seat${T.target === i ? " is-on" : ""}" style="left:${50 + 40 * Math.cos(a)}%;top:${50 + 40 * Math.sin(a)}%">${avHtml(p, "fun-av")}<small>${esc(p.name)}</small></div>`;
          })
          .join("") + `<div class="td-bottle" id="td-bottle" style="transform:rotate(${T.angle}deg)">🍾</div>`;
    }
    function drawLog() {
      const el = root?.querySelector("#td-log");
      if (!el) return;
      el.innerHTML = T.log
        .map((l) => (l.who ? `<div class="ww-msg${l.who.isUser ? " is-me" : ""}">${avHtml(l.who, "fun-av sm")}<div><small>${esc(l.who.name)}</small><p>${esc(l.text)}</p></div></div>` : `<div class="ww-sys ${l.cls || ""}">${esc(l.text)}</div>`))
        .join("");
      el.scrollTop = el.scrollHeight;
    }
    function act(html) {
      const el = root?.querySelector("#td-act") || document.createElement("div");
      el.innerHTML = html;
      return el;
    }
    const waitBtn = (html) =>
      new Promise((res) => {
        const el = act(html);
        el.querySelectorAll("[data-v]").forEach((b) => (b.onclick = () => res(b.dataset.v)));
      });
    const waitText = (ph) =>
      new Promise((res) => {
        const el = act(`<div class="ww-input"><textarea rows="2" placeholder="${esc(ph)}"></textarea><div class="ww-row"><button type="button" class="fun-btn solid" data-send>发送</button></div></div>`);
        const ta = el.querySelector("textarea");
        ta.focus();
        el.querySelector("[data-send]").onclick = () => {
          if (!ta.value.trim()) return toast("说点什么吧");
          res(ta.value.trim());
        };
      });

    async function ai(p, sys, usr, max) {
      const others = T.players.filter((x) => x !== p).map((x) => x.name).join("、");
      const txt = await F.aiText(
        [
          { role: "system", content: `你是「${p.name}」，正在和${others}玩真心话大冒险（尺度：${T.level}）。${persona(p)}\n${sys}\n只输出你说的话，口语化，可以有很短的动作描写。` },
          { role: "user", content: `最近发生的：\n${T.log.slice(-10).map((l) => (l.who ? l.who.name + "：" : "【】") + l.text).join("\n")}\n\n${usr}` }
        ],
        { maxTokens: max || 500 }
      );
      return F.cleanLine(txt, 300, p.name);
    }

    async function round(tk) {
      const n = T.players.length;
      let target;
      do target = rnd(n);
      while (target === T.last && n > 1);
      const asker = T.last >= 0 ? T.last : (target + 1) % n;
      T.angle += 720 + ((target / n) * 360 - (T.angle % 360) + 360) % 360;
      T.target = -1;
      drawSeats();
      act(`<p class="ww-ask">瓶子在转…</p>`);
      await sleep(1700);
      if ((!T || T.tk !== tk)) return;
      T.target = target;
      drawSeats();
      const tp = T.players[target];
      const ap = T.players[asker];
      say(null, `瓶口指向了 ${tp.name}！由 ${ap.name} 出题`);
      let choice;
      if (tp.isUser) choice = (await waitBtn(`<p class="ww-ask">轮到你了，选哪个？</p><div class="ww-row"><button type="button" class="fun-btn ghost" data-v="真心话">真心话</button><button type="button" class="fun-btn solid" data-v="大冒险">大冒险</button></div>`));
      else {
        choice = Math.random() < 0.55 ? "真心话" : "大冒险";
        act(`<p class="ww-ask">${esc(tp.name)} 在想…</p>`);
        await sleep(600);
      }
      if ((!T || T.tk !== tk)) return;
      say(tp, `我选${choice}！`);
      // 出题
      let q;
      if (ap.isUser) q = await waitText(`给 ${tp.name} 出一个${choice}题目…`);
      else {
        act(`<p class="ww-ask">${esc(ap.name)} 正在出题…</p>`);
        q = await ai(ap, `现在由你给「${tp.name}」出一道${choice}题。${choice === "真心话" ? "问一个让人有点难回答、但很想知道答案的问题" : "出一个能在现场或手机上完成的挑战"}，结合你们的关系和性格，别太老套。`, "出题吧。");
      }
      if ((!T || T.tk !== tk)) return;
      say(ap, q);
      // 回答 / 执行
      let ans;
      if (tp.isUser) ans = await waitText(choice === "真心话" ? "老实回答…" : "描述一下你怎么完成的…");
      else {
        act(`<p class="ww-ask">${esc(tp.name)} 正在${choice === "真心话" ? "回答" : "挑战"}…</p>`);
        ans = await ai(tp, `你被「${ap.name}」问了${choice}。${choice === "真心话" ? "按你的性格回答：可以害羞、嘴硬、坦白、反问，但要真的回答。" : "描述你怎么完成这个挑战（可以耍赖但最后要做）。"}`, `题目是：${q}`);
      }
      if ((!T || T.tk !== tk)) return;
      say(tp, ans);
      // 围观反应
      const watchers = T.players.filter((x) => !x.isUser && x !== tp && x !== ap);
      if (watchers.length && Math.random() < 0.8) {
        const w = pick(watchers);
        try {
          say(w, await ai(w, "你在旁边围观，对刚才的回答起哄或吐槽一句，不超过25字。", "说一句。", 300));
        } catch (_) {
          /* ignore */
        }
      }
      T.last = target;
      T.rounds++;
    }

    async function loop(tk) {
      while (T && T.tk === tk) {
        try {
          await round(tk);
        } catch (err) {
          toast("出错了：" + err.message);
        }
        if (!T || (!T || T.tk !== tk)) return;
        const v = await waitBtn(`<div class="ww-row"><button type="button" class="fun-btn ghost" data-v="end">不玩了</button><button type="button" class="fun-btn solid" data-v="go">再转一次</button></div>`);
        if (v === "end") {
          void F.addRecord({ game: "真心话大冒险", players: T.players.filter((p) => !p.isUser).map((p) => p.name), winner: "", userWon: true, note: `玩了${T.rounds}轮` });
          return start();
        }
      }
    }

    async function start() {
      T = null;
      const s = await setupPage(root, {
        ...opt,
        extra: `<label class="fun-field"><span>尺度</span><select id="td-level"><option>温和日常</option><option>心动暧昧</option><option>刺激大胆（不涉黄）</option></select></label>`
      });
      if (!root) return;
      const level = root.querySelector("#td-level").value;
      T = { tk: Symbol(), players: [{ ...s.user, isUser: true }, ...s.picked], log: [], angle: 0, target: -1, last: -1, level, rounds: 0 };
      root.innerHTML = `<div class="td"><div class="td-ring" id="td-ring"></div><div class="ww-log" id="td-log"></div><div class="ww-act" id="td-act"></div></div>`;
      drawSeats();
      say(null, `尺度：${level}。转瓶子开始！`);
      void loop(T.tk);
    }

    F.register("真心话大冒险", {
      title: "真心话大冒险",
      kicker: "GAME / TRUTH OR DARE",
      parent: "游戏厅",
      mount(body) {
        root = document.createElement("div");
        root.className = "g-root";
        body.appendChild(root);
        void start();
      },
      unmount() {
        T = null;
        root = null;
      }
    });
  })();

  /* ═════════ 你画我猜 ═════════ */
  (function () {
    const WORDS = ["猫", "西瓜", "火锅", "长颈鹿", "彩虹", "雪人", "钢琴", "眼镜", "冰淇淋", "月亮", "企鹅", "雨伞", "蛋糕", "自行车", "向日葵", "灯塔", "章鱼", "热气球", "仙人掌", "耳机", "汉堡", "恐龙", "风筝", "城堡", "蜗牛", "奶茶", "吉他", "外星人", "帆船", "蝴蝶"];
    let root = null;
    let buddy = null;
    let score = { me: 0, ta: 0 };
    let canvasState = null;

    async function start() {
      const s = await setupPage(root, {
        icon: "🎨",
        kicker: "DRAW & GUESS",
        title: "你画我猜",
        min: 1,
        max: 1,
        def: 1,
        note: "选一位角色。<b>我画 TA 猜</b>：需要你的模型能看图（如 GPT-4o、Claude、Gemini 等）；<b>TA 出题我来猜</b>：任何模型都行。",
        extra: `<label class="fun-field"><span>玩法</span><select id="dg-mode"><option value="draw">我画 TA 猜</option><option value="guess">TA 出题我来猜</option></select></label>`
      });
      if (!root) return;
      const mode = root.querySelector("#dg-mode").value;
      buddy = s.picked[0];
      score = { me: 0, ta: 0, rounds: 0 };
      mode === "draw" ? drawRound() : guessRound();
    }

    function header() {
      return `<div class="dg-head">${avHtml(buddy, "fun-av sm")}<strong>${esc(buddy.name)}</strong><span class="dg-score">回合 ${score.rounds} · 猜中 ${score.hit || 0}</span><button type="button" class="sh-link" data-end>结束</button></div>`;
    }
    function bindEnd() {
      root.querySelector("[data-end]").onclick = () => {
        if (score.rounds) void F.addRecord({ game: "你画我猜", players: [buddy.name], winner: (score.hit || 0) * 2 >= score.rounds ? "你" : buddy.name, userWon: (score.hit || 0) * 2 >= score.rounds, note: `${score.rounds}轮猜中${score.hit || 0}次` });
        start();
      };
    }

    function drawRound() {
      const word = pick(WORDS);
      score.rounds++;
      root.innerHTML = `<div class="dg">${header()}
        <p class="dg-word">请画：<b>${esc(word)}</b> <button type="button" class="sh-link" data-skip>换一个</button></p>
        <canvas class="dg-canvas" width="600" height="600"></canvas>
        <div class="dg-tools">${["#17191c", "#e5484d", "#f2b705", "#2fa36b", "#2f74d0", "#8e4ec6"].map((c, i) => `<button type="button" class="dg-color${i === 0 ? " is-on" : ""}" data-c="${c}" style="background:${c}"></button>`).join("")}
          <button type="button" class="dg-tool" data-t="eraser">橡皮</button><button type="button" class="dg-tool" data-t="undo">撤销</button><button type="button" class="dg-tool" data-t="clear">清空</button></div>
        <div class="dg-bubble" id="dg-bubble"></div>
        <div class="ww-act"><button type="button" class="fun-btn solid wide" data-send>画好了，让 ${esc(buddy.name)} 猜</button></div></div>`;
      bindEnd();
      const cv = root.querySelector("canvas");
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 600, 600);
      canvasState = { color: "#17191c", erase: false, strokes: [], tries: 0, guesses: [] };
      const st = canvasState;
      const redraw = () => {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, 600, 600);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        for (const s of st.strokes) {
          ctx.strokeStyle = s.c;
          ctx.lineWidth = s.w;
          ctx.beginPath();
          s.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
          if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]);
          ctx.stroke();
        }
      };
      const pos = (e) => {
        const r = cv.getBoundingClientRect();
        return [((e.clientX - r.left) / r.width) * 600, ((e.clientY - r.top) / r.height) * 600];
      };
      let cur = null;
      cv.addEventListener("pointerdown", (e) => {
        cv.setPointerCapture(e.pointerId);
        cur = { c: st.erase ? "#fff" : st.color, w: st.erase ? 36 : 8, pts: [pos(e)] };
        st.strokes.push(cur);
        redraw();
      });
      cv.addEventListener("pointermove", (e) => {
        if (!cur) return;
        cur.pts.push(pos(e));
        redraw();
      });
      const end = () => (cur = null);
      cv.addEventListener("pointerup", end);
      cv.addEventListener("pointercancel", end);
      root.querySelector(".dg-tools").addEventListener("click", (e) => {
        const c = e.target.closest("[data-c]");
        if (c) {
          st.color = c.dataset.c;
          st.erase = false;
          root.querySelectorAll(".dg-color,.dg-tool").forEach((x) => x.classList.toggle("is-on", x === c));
        }
        const t = e.target.closest("[data-t]")?.dataset.t;
        if (t === "eraser") {
          st.erase = true;
          root.querySelectorAll(".dg-color,.dg-tool").forEach((x) => x.classList.toggle("is-on", x.dataset.t === "eraser"));
        }
        if (t === "undo") st.strokes.pop(), redraw();
        if (t === "clear") (st.strokes = []), redraw();
      });
      root.querySelector("[data-skip]").onclick = () => {
        score.rounds--;
        drawRound();
      };
      const bubble = root.querySelector("#dg-bubble");
      const actEl = root.querySelector(".ww-act");
      async function guessOnce() {
        if (!st.strokes.length) return toast("先画点什么");
        actEl.innerHTML = `<p class="ww-ask">${esc(buddy.name)} 正在看你的画…</p>`;
        bubble.innerHTML = `<span class="is-typing"><i></i><i></i><i></i></span>`;
        try {
          const img = cv.toDataURL("image/jpeg", 0.8);
          const txt = await F.aiText(
            [
              { role: "system", content: `你是「${buddy.name}」。${persona(buddy)}\n你在和对方玩你画我猜，对方画了一幅画让你猜是什么东西。只输出 JSON：{"guess":"你猜的词（一个具体名词）","say":"你说的话，带上你的性格，20字以内"}` },
              {
                role: "user",
                content: [
                  { type: "text", text: st.guesses.length ? `你之前猜了「${st.guesses.join("」「")}」都不对，再猜一个不同的。` : "猜猜我画的是什么？" },
                  { type: "image_url", image_url: { url: img } }
                ]
              }
            ],
            { maxTokens: 400 }
          );
          if (!root) return;
          const o = F.parseJsonLoose(txt) || { guess: F.cleanLine(txt, 10), say: "" };
          const g = String(o.guess || "").trim();
          st.guesses.push(g);
          st.tries++;
          const hit = !!g && (g.includes(word) || word.includes(g));
          bubble.innerHTML = `<p><b>${esc(buddy.name)}：</b>${esc(o.say || "")}</p><p class="dg-guess ${hit ? "is-hit" : ""}">「${esc(g || "？")}」${hit ? " ✔ 猜对了！" : " ✘"}</p>`;
          if (hit) score.hit = (score.hit || 0) + 1;
          if (hit || st.tries >= 3) {
            actEl.innerHTML = `<p class="ww-ask">${hit ? "🎉 默契满分" : `答案是「${esc(word)}」`}</p><button type="button" class="fun-btn solid wide">下一题</button>`;
            actEl.querySelector("button").onclick = drawRound;
          } else {
            actEl.innerHTML = `<button type="button" class="fun-btn solid wide">不对哦，补几笔再让 TA 猜（还剩 ${3 - st.tries} 次）</button>`;
            actEl.querySelector("button").onclick = guessOnce;
          }
        } catch (err) {
          bubble.innerHTML = `<p class="fun-note warn">没猜成：${esc(err.message)}<br/>如果提示不支持图片，换一个能看图的模型，或者改玩「TA 出题我来猜」。</p>`;
          actEl.innerHTML = `<button type="button" class="fun-btn solid wide">再试一次</button>`;
          actEl.querySelector("button").onclick = guessOnce;
        }
      }
      root.querySelector("[data-send]").onclick = guessOnce;
    }

    async function guessRound() {
      score.rounds++;
      root.innerHTML = `<div class="dg">${header()}<div class="dg-bubble" id="dg-bubble"><span class="is-typing"><i></i><i></i><i></i></span> ${esc(buddy.name)} 正在想题目…</div><div class="ww-act" id="dg-act"></div></div>`;
      bindEnd();
      let o;
      try {
        const txt = await F.aiText(
          [
            { role: "system", content: `你是「${buddy.name}」。${persona(buddy)}\n你在和对方玩猜词游戏：你心里想一个常见的具体名词，然后给出 4 条由难到易的提示（不能出现这个词本身），提示要带你的性格和说话方式。只输出 JSON：{"word":"词","hints":["提示1","提示2","提示3","提示4"]}` },
            { role: "user", content: `出题吧，别出${pick(WORDS)}这种太简单的。随机种子：${rnd(99999)}` }
          ],
          { maxTokens: 600, temperature: 1 }
        );
        o = F.parseJsonLoose(txt);
        if (!o || !o.word || !Array.isArray(o.hints)) throw new Error("题目格式不对");
      } catch (err) {
        root.querySelector("#dg-bubble").innerHTML = `<p class="fun-note warn">出题失败：${esc(err.message)}</p>`;
        root.querySelector("#dg-act").innerHTML = `<button type="button" class="fun-btn solid wide">重试</button>`;
        root.querySelector("#dg-act button").onclick = () => (score.rounds--, guessRound());
        return;
      }
      const word = String(o.word).trim();
      let shown = 1;
      const draw = (msg) => {
        root.querySelector("#dg-bubble").innerHTML = o.hints
          .slice(0, shown)
          .map((h, i) => `<p><b>提示 ${i + 1}：</b>${esc(h)}</p>`)
          .join("") + (msg ? `<p class="dg-guess">${msg}</p>` : "");
      };
      draw();
      const actEl = root.querySelector("#dg-act");
      actEl.innerHTML = `<div class="ww-input"><textarea rows="1" placeholder="你猜是…"></textarea><div class="ww-row"><button type="button" class="fun-btn ghost" data-more>再给个提示</button><button type="button" class="fun-btn solid" data-try>猜</button></div></div>`;
      const ta = actEl.querySelector("textarea");
      const finish = (hit) => {
        if (hit) score.hit = (score.hit || 0) + 1;
        shown = o.hints.length;
        draw(hit ? `🎉 猜对了！就是「${esc(word)}」` : `答案是「${esc(word)}」`);
        actEl.innerHTML = `<button type="button" class="fun-btn solid wide">下一题</button>`;
        actEl.querySelector("button").onclick = guessRound;
      };
      actEl.querySelector("[data-more]").onclick = () => {
        if (shown < o.hints.length) {
          shown++;
          draw();
        } else finish(false);
      };
      actEl.querySelector("[data-try]").onclick = () => {
        const g = ta.value.trim();
        if (!g) return;
        ta.value = "";
        if (g === word || (g.length >= 2 && (word.includes(g) || g.includes(word)))) finish(true);
        else draw(`「${esc(g)}」不对哦～`);
      };
    }

    F.register("你画我猜", {
      title: "你画我猜",
      kicker: "GAME / DRAW & GUESS",
      parent: "游戏厅",
      mount(body) {
        root = document.createElement("div");
        root.className = "g-root";
        body.appendChild(root);
        void start();
      },
      unmount() {
        root = null;
      }
    });
  })();

  /* ═════════ 谁是卧底 ═════════ */
  (function () {
    const PAIRS = [
      ["牛奶", "豆浆"], ["火锅", "麻辣烫"], ["眼镜", "隐形眼镜"], ["包子", "饺子"], ["蝴蝶", "蜜蜂"], ["猫", "老虎"],
      ["地铁", "公交"], ["奶茶", "咖啡"], ["口红", "唇膏"], ["枕头", "抱枕"], ["微信", "QQ"], ["电影院", "剧场"],
      ["橙子", "橘子"], ["雨伞", "雨衣"], ["钢琴", "电子琴"], ["婚纱", "旗袍"], ["蛋糕", "面包"], ["游泳", "潜水"],
      ["月亮", "太阳"], ["情书", "日记"], ["保安", "警察"], ["演唱会", "音乐节"], ["烧烤", "铁板烧"], ["香水", "花露水"]
    ];
    let root = null;
    let U = null;

    function drawSeats() {
      const el = root?.querySelector("#uc-seats");
      if (!el) return;
      el.innerHTML = U.players
        .map(
          (p, i) => `<button type="button" class="ww-seat${p.alive ? "" : " is-dead"}${U.sel ? (p.alive && !p.isUser ? " is-sel" : "") : ""}${U.speaking === i ? " is-speak" : ""}${p.isUser ? " is-me" : ""}" data-i="${i}">
            <span class="ww-no">${i + 1}</span>${avHtml(p, "fun-av ww-av")}<strong>${esc(p.name)}</strong>${U.over ? `<em class="ww-badge${p.spy ? " is-bad" : ""}">${p.spy ? "卧底" : "平民"}·${esc(p.word)}</em>` : p.isUser ? `<em class="ww-badge">你</em>` : ""}</button>`
        )
        .join("");
    }
    function drawLog() {
      const el = root?.querySelector("#uc-log");
      if (!el) return;
      el.innerHTML = U.log
        .map((l) => (l.p ? `<div class="ww-msg${l.p.isUser ? " is-me" : ""}">${avHtml(l.p, "fun-av sm")}<div><small>${esc(l.p.name)}</small><p>${esc(l.text)}</p></div></div>` : `<div class="ww-sys${l.priv ? " is-priv" : ""}">${esc(l.text)}</div>`))
        .join("");
      el.scrollTop = el.scrollHeight;
    }
    const sys = (text, priv) => U && (U.log.push({ text, priv }), drawLog());
    const act = (html) => {
      const el = root?.querySelector("#uc-act") || document.createElement("div");
      el.innerHTML = html;
      return el;
    };
    const transcript = () => U.log.filter((l) => !l.priv).map((l) => (l.p ? `${U.players.indexOf(l.p) + 1}号${l.p.name}：${l.text}` : `【法官】${l.text}`)).join("\n");

    async function describe(p) {
      const i = U.players.indexOf(p);
      const txt = await F.aiText(
        [
          {
            role: "system",
            content: `你是「${p.name}」，在玩谁是卧底。${persona(p)}\n规则：大部分人拿到同一个词，有一个卧底拿到相近但不同的词，没人知道自己是不是卧底。你的词是「${p.word}」。\n描述要求：一句话（10~25字），不能说出词本身或其中的字；不要太直白（会被卧底蹭到），也不要太偏（会被怀疑）。如果你发现别人的描述跟你的词对不上，你可能就是卧底，要悄悄模仿大家的方向。用你的说话风格。只输出描述。`
          },
          { role: "user", content: `目前的记录：\n${transcript() || "（你第一个说）"}\n\n轮到你（${i + 1}号）描述。` }
        ],
        { maxTokens: 400 }
      );
      let t = F.cleanLine(txt, 60, p.name);
      if (t.includes(p.word)) t = t.split(p.word).join("某个东西");
      return t;
    }

    async function votes() {
      const alive = U.players.filter((p) => p.alive);
      const voters = alive.filter((p) => !p.isUser);
      const fallback = () => voters.map((p) => ({ from: p, to: pick(alive.filter((x) => x !== p)) }));
      try {
        const txt = await F.aiText(
          [
            { role: "system", content: "你是谁是卧底的游戏引擎，替多位玩家各自独立投票。每位玩家只知道自己的词，根据描述找出和自己的词最不一致的人。只输出 JSON。" },
            {
              role: "user",
              content: `记录：\n${transcript()}\n\n存活：${alive.map((p) => U.players.indexOf(p) + 1 + "号").join("、")}\n投票者：\n${voters.map((p) => `- ${U.players.indexOf(p) + 1}号${p.name}，自己的词是「${p.word}」`).join("\n")}\n\n输出 {"投票者号码": 被投号码}，不能投自己。`
            }
          ],
          { maxTokens: 400, temperature: 0.6 }
        );
        const o = F.parseJsonLoose(txt) || {};
        const fb = fallback();
        return voters.map((p, k) => {
          const to = U.players[Number(o[U.players.indexOf(p) + 1]) - 1];
          return to && to.alive && to !== p ? { from: p, to } : fb[k];
        });
      } catch (_) {
        return fallback();
      }
    }

    async function game(tk) {
      const u = U.players.find((p) => p.isUser);
      sys(`${U.players.length} 人局，其中 1 个卧底。`);
      sys(`你的词是「${u.word}」（你不知道自己是不是卧底）`, true);
      for (let round = 1; U && U.tk === tk; round++) {
        sys(`第 ${round} 轮描述`);
        for (const p of U.players) {
          if ((!U || U.tk !== tk)) return;
          if (!p.alive) continue;
          U.speaking = U.players.indexOf(p);
          drawSeats();
          if (p.isUser) {
            const t = await new Promise((res) => {
              const el = act(`<p class="ww-ask">轮到你描述「${esc(u.word)}」：</p><div class="ww-input"><textarea rows="1" placeholder="一句话，不能说出词"></textarea><div class="ww-row"><button type="button" class="fun-btn solid" data-s>说</button></div></div>`);
              const ta = el.querySelector("textarea");
              ta.focus();
              el.querySelector("[data-s]").onclick = () => {
                const v = ta.value.trim();
                if (!v) return toast("说一句吧");
                if (v.includes(u.word)) return toast("不能直接说出词哦");
                res(v);
              };
            });
            U.log.push({ p, text: t });
          } else {
            act(`<p class="ww-ask">${esc(p.name)} 在想怎么说…</p>`);
            let t;
            try {
              t = await describe(p);
            } catch (_) {
              t = "嗯……这个很常见。";
            }
            if ((!U || U.tk !== tk)) return;
            U.log.push({ p, text: t });
          }
          drawLog();
        }
        U.speaking = -1;
        // 投票
        const all = [];
        if (u.alive) {
          U.sel = true;
          drawSeats();
          const to = await new Promise((res) => {
            act(`<p class="ww-ask">点头像投出你怀疑的卧底</p>`);
            U.onSel = res;
          });
          U.sel = false;
          all.push({ from: u, to });
        }
        act(`<p class="ww-ask">大家在投票…</p>`);
        all.push(...(await votes()));
        if ((!U || U.tk !== tk)) return;
        const tally = new Map();
        all.forEach((v) => tally.set(v.to, (tally.get(v.to) || 0) + 1));
        sys("投票：" + [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p.name} ${n}票`).join("，"));
        const max = Math.max(...tally.values());
        const tops = [...tally.entries()].filter(([, n]) => n === max).map(([p]) => p);
        if (tops.length > 1) sys("平票，没有人出局");
        else {
          tops[0].alive = false;
          sys(`${tops[0].name} 出局，TA ${tops[0].spy ? "是卧底！" : "不是卧底……"}`);
        }
        drawSeats();
        const spy = U.players.find((p) => p.spy);
        const alive = U.players.filter((p) => p.alive);
        if (!spy.alive || alive.length <= 3) {
          const civWin = !spy.alive;
          U.over = true;
          sys(civWin ? `平民胜利！卧底是 ${spy.name}` : `卧底 ${spy.name} 活到了最后，卧底胜利！`);
          sys(`平民词「${U.pair[0]}」，卧底词「${U.pair[1]}」`);
          drawSeats();
          const userWon = u.spy ? !civWin : civWin;
          void F.addRecord({ game: "谁是卧底", players: U.players.filter((p) => !p.isUser).map((p) => p.name), winner: civWin ? "平民" : spy.name, userWon, note: u.spy ? "你是卧底" : "你是平民" });
          const el = act(`<p class="ww-ask">${userWon ? "🎉 你赢了" : "😵 你输了"}</p><button type="button" class="fun-btn solid wide">再来一局</button>`);
          el.querySelector("button").onclick = start;
          return;
        }
      }
    }

    async function start() {
      U = null;
      const s = await setupPage(root, { icon: "🕵️", kicker: "WHO IS THE SPY", title: "谁是卧底", min: 3, max: 6, def: 4, note: "你 + 3~6 位角色。大家拿到同一个词，只有卧底的词不一样（卧底自己也不知道）。轮流描述，投票揪出卧底。" });
      if (!root) return;
      const pair = shuffle(pick(PAIRS).slice());
      const players = shuffle([{ ...s.user, isUser: true }, ...s.picked].map((p) => ({ ...p, alive: true })));
      const spyI = rnd(players.length);
      players.forEach((p, i) => {
        p.spy = i === spyI;
        p.word = p.spy ? pair[1] : pair[0];
      });
      U = { tk: Symbol(), players, pair, log: [], sel: false, speaking: -1, over: false };
      root.innerHTML = `<div class="ww ww--day"><div class="ww-seats" id="uc-seats"></div><div class="ww-log" id="uc-log"></div><div class="ww-act" id="uc-act"></div></div>`;
      root.querySelector("#uc-seats").addEventListener("click", (e) => {
        const b = e.target.closest(".ww-seat.is-sel");
        if (b && U.onSel) {
          const f = U.onSel;
          U.onSel = null;
          f(U.players[Number(b.dataset.i)]);
        }
      });
      drawSeats();
      void game(U.tk);
    }

    F.register("谁是卧底", {
      title: "谁是卧底",
      kicker: "GAME / UNDERCOVER",
      parent: "游戏厅",
      mount(body) {
        root = document.createElement("div");
        root.className = "g-root";
        body.appendChild(root);
        void start();
      },
      unmount() {
        U = null;
        root = null;
      }
    });
  })();
})();
