"use strict";

/**
 * 情侣扫雷（游戏厅，替代原来的飞行棋）
 * - 你和一位角色各一块雷盘，轮流在自己的盘上点一格
 * - 先踩雷的人输；先把自己盘上的安全格全翻开的人赢
 * - 输的人接受惩罚：你输了由 TA 出惩罚，TA 输了你来出（或随机抽）
 * - 没填 API Key 也能玩：惩罚用内置题库，角色不说话
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast, sleep, rnd, pick, avHtml } = F;

  const LEVELS = {
    easy: { name: "简单", n: 6, mines: 6 },
    normal: { name: "普通", n: 7, mines: 9 },
    hard: { name: "困难", n: 8, mines: 13 }
  };
  const HEAT = ["温和撒娇", "心动暧昧", "刺激大胆"];
  const PUNISH = {
    温和撒娇: ["学三声猫叫", "夸对方三句，不许重样", "给对方唱一句歌", "用最嗲的声音叫一声对方的名字", "说出对方最可爱的一个小习惯", "接下来十分钟说话结尾都要加「喵」", "给对方讲一个冷笑话", "发一条消息：今天也很喜欢你"],
    心动暧昧: ["说一句最肉麻的情话", "给对方一个十秒钟的拥抱", "让对方捏脸三下", "说出第一次心动是什么时候", "牵手直到下一局结束", "在对方耳边说晚安", "用三个词形容对方，必须都是夸奖", "录一段撒娇语音发给对方"],
    "刺激大胆": ["今天的晚饭你请", "让对方翻你相册一分钟", "把对方的备注改成对方指定的名字", "对着窗外大喊「我输了」", "下一局开始前给对方表演一段才艺", "主动坦白一件没告诉过对方的小事", "让对方在你脸上画一笔", "一整天都要听对方的安排（合理范围内）"]
  };

  let root = null;
  let G = null; // 当前对局
  let last = { charId: "", level: "easy", heat: HEAT[0] };

  /* ───── 雷盘 ───── */
  function newBoard(n, mines) {
    return { n, mines, cells: Array.from({ length: n * n }, () => ({ mine: false, open: false, num: 0 })), placed: false, opened: 0, boom: -1 };
  }
  const nbrs = (b, i) => {
    const out = [];
    const r = Math.floor(i / b.n);
    const c = i % b.n;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && rr < b.n && cc >= 0 && cc < b.n) out.push(rr * b.n + cc);
      }
    return out;
  };
  /** 第一下点的格子和周围一圈不放雷 */
  function placeMines(b, first) {
    const safe = new Set([first, ...nbrs(b, first)]);
    const pool = b.cells.map((_, i) => i).filter((i) => !safe.has(i));
    for (let k = 0; k < b.mines && pool.length; k++) b.cells[pool.splice(rnd(pool.length), 1)[0]].mine = true;
    b.cells.forEach((c, i) => (c.num = nbrs(b, i).filter((j) => b.cells[j].mine).length));
    b.placed = true;
  }
  /** 翻开一格：返回 "boom" | "ok" */
  function reveal(b, i) {
    if (!b.placed) placeMines(b, i);
    const c = b.cells[i];
    if (c.open) return "ok";
    if (c.mine) {
      c.open = true;
      b.boom = i;
      return "boom";
    }
    const stack = [i];
    while (stack.length) {
      const k = stack.pop();
      const x = b.cells[k];
      if (x.open || x.mine) continue;
      x.open = true;
      b.opened++;
      if (x.num === 0) stack.push(...nbrs(b, k));
    }
    return "ok";
  }
  const cleared = (b) => b.opened >= b.n * b.n - b.mines;

  /** 角色怎么点：先用已翻开的数字推理出一定安全的格子，推不出来就猜 */
  function charChoose(b) {
    if (!b.placed) return Math.floor((b.n * b.n) / 2) + (rnd(3) - 1);
    const mine = new Set();
    const safe = new Set();
    for (let pass = 0; pass < 4; pass++) {
      b.cells.forEach((c, i) => {
        if (!c.open || c.mine || !c.num) return;
        const hidden = nbrs(b, i).filter((j) => !b.cells[j].open);
        const knownMines = hidden.filter((j) => mine.has(j)).length;
        const unknown = hidden.filter((j) => !mine.has(j) && !safe.has(j));
        if (unknown.length && c.num - knownMines === unknown.length) unknown.forEach((j) => mine.add(j));
        else if (unknown.length && c.num === knownMines) unknown.forEach((j) => safe.add(j));
      });
    }
    const safeList = [...safe].filter((j) => !b.cells[j].open);
    if (safeList.length && Math.random() < 0.9) return pick(safeList); // 偶尔也会手滑
    const rest = b.cells.map((c, i) => i).filter((i) => !b.cells[i].open && !mine.has(i));
    return pick(rest.length ? rest : b.cells.map((c, i) => i).filter((i) => !b.cells[i].open));
  }

  /* ───── AI 台词 ───── */
  function persona(p) {
    return `${p.persona ? "人设：\n" + p.persona + "\n" : ""}${F.recordSummary(p.name)}`;
  }
  async function aiSay(sys, usr, max) {
    if (!G || !F.hasApiKey()) return "";
    const tk = G.tk;
    try {
      const t = await F.aiText(
        [
          { role: "system", content: `你是「${G.ch.name}」，正在和恋人「${G.user.name}」玩情侣扫雷：两人各一块雷盘，轮流点，先踩雷的人输，输了要接受惩罚（尺度：${G.heat}）。${persona(G.ch)}\n${sys}\n只输出你说的话，口语化，可以有很短的动作描写，不要加引号。` },
          { role: "user", content: usr }
        ],
        { maxTokens: max || 300 }
      );
      if (!G || G.tk !== tk) return "";
      return F.cleanLine(t, 200, G.ch.name);
    } catch (_) {
      return "";
    }
  }

  /* ───── 界面 ───── */
  function boardHtml(b, mine, live) {
    return `<div class="ms-board${mine ? " is-mine" : ""}${live ? " is-live" : ""}" style="--n:${b.n}">${b.cells
      .map((c, i) => {
        const cls = c.open ? (c.mine ? "is-boom" : "is-open n" + c.num) : b.boom >= 0 && c.mine ? "is-mine-show" : "";
        const txt = c.open ? (c.mine ? "💣" : c.num || "") : b.boom >= 0 && c.mine ? "💣" : "";
        return `<button type="button" class="ms-cell ${cls}" data-i="${i}" ${mine && live && !c.open ? "" : "disabled"}>${txt}</button>`;
      })
      .join("")}</div>`;
  }
  function draw() {
    if (!root || !G) return;
    // 外壳只建一次，底部操作区（#ms-act）不会被重绘冲掉
    if (!G.shell || !G.shell.isConnected) {
      root.innerHTML = `<div class="ms"><div class="ms-top" id="ms-top"></div><div class="ms-mini" id="ms-mini"></div><div class="ms-log" id="ms-log"></div><p class="ms-turn" id="ms-turn"></p><div class="ms-mainboard" id="ms-main"></div><div class="ms-act" id="ms-act"></div></div>`;
      G.shell = root.firstElementChild;
    }
    const $ = (id) => G.shell.querySelector(id);
    const userTurn = G.turn === "user" && !G.over;
    $("#ms-top").innerHTML = `
        <div class="ms-side${G.turn === "char" && !G.over ? " is-turn" : ""}">${avHtml(G.ch, "fun-av sm")}<span><strong>${esc(G.ch.name)}</strong><small>翻开 ${G.cb.opened}/${G.cb.n * G.cb.n - G.cb.mines}</small></span></div>
        <div class="ms-vs">VS<small>${esc(LEVELS[G.level].name)} · ${G.cb.mines} 雷</small></div>
        <div class="ms-side is-me${userTurn ? " is-turn" : ""}"><span><strong>${esc(G.user.name)}</strong><small>翻开 ${G.ub.opened}/${G.ub.n * G.ub.n - G.ub.mines}</small></span>${avHtml(G.user, "fun-av sm")}</div>`;
    $("#ms-mini").innerHTML = `<p class="fun-kicker">${esc(G.ch.name)} 的雷盘</p>${boardHtml(G.cb, false, false)}`;
    const lg = $("#ms-log");
    lg.innerHTML = G.log
      .slice(-8)
      .map((l) => (l.who ? `<div class="ww-msg${l.who === G.user ? " is-me" : ""}">${avHtml(l.who, "fun-av sm")}<div><small>${esc(l.who.name)}</small><p>${esc(l.text)}</p></div></div>` : `<div class="ww-sys">${esc(l.text)}</div>`))
      .join("");
    lg.scrollTop = lg.scrollHeight;
    $("#ms-turn").textContent = G.over ? "" : userTurn ? "轮到你了，点一格 👇" : `${G.ch.name} 在想…`;
    $("#ms-main").innerHTML = `<p class="fun-kicker">你的雷盘</p>${boardHtml(G.ub, true, userTurn)}`;
    $("#ms-main").querySelectorAll(".ms-cell:not([disabled])").forEach((b) => (b.onclick = () => userClick(Number(b.dataset.i))));
  }
  const say = (who, text) => {
    if (!G || !text) return;
    G.log.push({ who, text });
    draw();
  };

  async function userClick(i) {
    if (!G || G.over || G.turn !== "user") return;
    const r = reveal(G.ub, i);
    if (r === "boom") return end("char", "user-boom");
    if (cleared(G.ub)) return end("user", "user-clear");
    G.turn = "char";
    draw();
    void charTurn(G.tk);
  }

  async function charTurn(tk) {
    await sleep(700 + rnd(600));
    if (!G || G.tk !== tk || G.over) return;
    const i = charChoose(G.cb);
    const r = reveal(G.cb, i);
    if (r === "boom") return end("user", "char-boom");
    if (cleared(G.cb)) return end("char", "char-clear");
    G.turns++;
    G.turn = "user";
    draw();
    // 偶尔嘴两句，不挡着玩
    if (G.turns % 4 === 2 && Math.random() < 0.7) {
      const lead = G.ub.opened - G.cb.opened;
      say(G.ch, await aiSay("游戏进行中，你随口说一句（不超过25字），可以挑衅、撒娇、紧张、放狠话。", `现在你翻开了 ${G.cb.opened} 格，对方翻开了 ${G.ub.opened} 格（${lead > 0 ? "对方领先" : lead < 0 ? "你领先" : "打平"}）。说一句。`, 200));
    }
  }

  const actEl = () => {
    const a = G?.shell?.querySelector("#ms-act");
    if (a) setTimeout(() => a.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
    return a;
  };
  async function end(winner, why) {
    if (!G || G.over) return;
    G.over = true;
    G.turn = "";
    const tk = G.tk;
    const userWon = winner === "user";
    const reason = { "user-boom": `${G.user.name} 踩到雷了 💥`, "char-boom": `${G.ch.name} 踩到雷了 💥`, "user-clear": `${G.user.name} 先扫完了整盘！`, "char-clear": `${G.ch.name} 先扫完了整盘！` }[why];
    G.log.push({ text: reason + (userWon ? `  你赢了，${G.ch.name} 要接受惩罚` : `  你输了，要接受 ${G.ch.name} 的惩罚`) });
    draw();
    void F.addRecord({ game: "情侣扫雷", players: [G.ch.name], winner: userWon ? G.user.name : G.ch.name, userWon, note: why.endsWith("boom") ? "踩雷" : "扫完全盘" });

    if (!userWon) {
      // TA 出惩罚
      const a = actEl();
      if (a) a.innerHTML = `<p class="ms-turn">${esc(G.ch.name)} 正在想怎么罚你…</p>`;
      let pun = await aiSay("你赢了！给对方出一个惩罚：要具体、能马上做到（现实或手机上），符合尺度和你的性格，带点得意或宠溺。一两句话。", `你赢了（${reason}）。出惩罚吧。`, 300);
      if (!G || G.tk !== tk) return;
      if (!pun) pun = `惩罚：${pick(PUNISH[G.heat])}！`;
      say(G.ch, pun);
      showPunishReply(tk, pun);
    } else {
      showPickPunish(tk);
    }
  }

  /** 你输了：可以回一句，TA 再反应 */
  function showPunishReply(tk, pun) {
    const a = actEl();
    if (!a) return;
    a.innerHTML = `<div class="ww-input"><textarea rows="2" placeholder="接受惩罚，说说你怎么做的（选填）"></textarea>
      <div class="ww-row"><button type="button" class="fun-btn ghost" data-v="again">再来一局</button><button type="button" class="fun-btn solid" data-v="send">发送</button></div></div>`;
    const ta = a.querySelector("textarea");
    a.querySelector('[data-v="again"]').onclick = () => start(true);
    a.querySelector('[data-v="send"]').onclick = async () => {
      const t = ta.value.trim();
      if (!t) return toast("说点什么吧");
      say(G.user, t);
      a.innerHTML = `<p class="ms-turn">${esc(G.ch.name)} 在看你…</p>`;
      const r = await aiSay("对方正在接受你出的惩罚，你对此做出反应（一两句，可以害羞、得意、心软、起哄）。", `你出的惩罚：${pun}\n对方：${t}`, 300);
      if (!G || G.tk !== tk) return;
      say(G.ch, r);
      againBtns();
    };
  }

  /** 你赢了：你来出惩罚，或者随机抽一个 */
  function showPickPunish(tk) {
    const a = actEl();
    if (!a) return;
    a.innerHTML = `<div class="ww-input"><textarea rows="2" placeholder="给 ${esc(G.ch.name)} 出个惩罚…"></textarea>
      <div class="ww-row"><button type="button" class="fun-btn ghost" data-v="rand">随机抽一个</button><button type="button" class="fun-btn solid" data-v="send">就罚这个</button></div></div>`;
    const ta = a.querySelector("textarea");
    a.querySelector('[data-v="rand"]').onclick = () => (ta.value = pick(PUNISH[G.heat]));
    a.querySelector('[data-v="send"]').onclick = async () => {
      const t = ta.value.trim();
      if (!t) return toast("写一个惩罚，或者点「随机抽一个」");
      say(G.user, `惩罚：${t}`);
      a.innerHTML = `<p class="ms-turn">${esc(G.ch.name)} 正在接受惩罚…</p>`;
      let r = await aiSay("你输了，正在执行对方给你的惩罚。按你的性格描述你怎么完成的（可以嘴硬、害羞、耍赖，但最后要做到），两三句。", `对方给你的惩罚：${t}`, 400);
      if (!G || G.tk !== tk) return;
      if (!r && !F.hasApiKey()) r = "（愿赌服输，乖乖照做了）";
      say(G.ch, r);
      againBtns();
    };
  }
  function againBtns() {
    const a = actEl();
    if (!a) return;
    a.innerHTML = `<div class="ww-row"><button type="button" class="fun-btn ghost" data-v="setup">换人 / 换难度</button><button type="button" class="fun-btn solid" data-v="again">再来一局</button></div>`;
    a.querySelector('[data-v="setup"]').onclick = () => start(false);
    a.querySelector('[data-v="again"]').onclick = () => start(true);
  }

  /* ───── 开局 ───── */
  async function start(quick) {
    const cast = await F.loadCast();
    const user = await F.loadUser();
    if (!root) return;
    if (!cast.length) {
      root.innerHTML = `<div class="fun-setup"><div class="fun-hero">💣</div><p class="fun-note warn">角色库里还没有角色，先去「角色人设」建一个吧。</p></div>`;
      return;
    }
    const ch0 = cast.find((c) => c.id === last.charId);
    if (quick && ch0) return begin(user, ch0);
    let sel = ch0 ? ch0.id : cast[0].id;
    root.innerHTML = `<div class="fun-setup"><div class="fun-hero">💣</div>
      <p class="fun-kicker">COUPLE MINESWEEPER</p><h2 class="fun-h2">情侣扫雷</h2>
      <p class="fun-note">你和 TA 各一块雷盘，轮流在自己的盘上点一格。先踩雷的人输，先把安全格全翻开的人赢。输的人要接受惩罚！第一下一定不会踩雷。</p>
      <p class="fun-kicker">和谁玩</p>
      <div class="ms-cast">${cast.map((c) => `<button type="button" class="fun-chip-btn${c.id === sel ? " is-on" : ""}" data-c="${esc(c.id)}">${avHtml(c, "fun-av sm")}${esc(c.name)}</button>`).join("")}</div>
      <label class="fun-field"><span>难度</span><select id="ms-level">${Object.entries(LEVELS).map(([k, v]) => `<option value="${k}"${k === last.level ? " selected" : ""}>${v.name}（${v.n}×${v.n}，${v.mines} 个雷）</option>`).join("")}</select></label>
      <label class="fun-field"><span>惩罚尺度</span><select id="ms-heat">${HEAT.map((h) => `<option${h === last.heat ? " selected" : ""}>${h}</option>`).join("")}</select></label>
      ${F.hasApiKey() ? "" : `<p class="fun-note">没填 API Key 也能玩，只是 TA 不会说话，惩罚从题库里抽。</p>`}
      <div class="fun-setup-btns"><button type="button" class="fun-btn solid" id="ms-go">开始</button></div></div>`;
    root.querySelectorAll("[data-c]").forEach(
      (b) =>
        (b.onclick = () => {
          sel = b.dataset.c;
          root.querySelectorAll("[data-c]").forEach((x) => x.classList.toggle("is-on", x === b));
        })
    );
    root.querySelector("#ms-go").onclick = () => {
      last = { charId: sel, level: root.querySelector("#ms-level").value, heat: root.querySelector("#ms-heat").value };
      begin(user, cast.find((c) => c.id === sel));
    };
  }

  function begin(user, ch) {
    const L = LEVELS[last.level] || LEVELS.easy;
    G = { tk: Symbol(), user: { ...user, isUser: true }, ch, level: last.level, heat: last.heat, ub: newBoard(L.n, L.mines), cb: newBoard(L.n, L.mines), turn: "user", over: false, turns: 0, log: [] };
    G.log.push({ text: `开局！你先点。惩罚尺度：${G.heat}` });
    draw();
    G.shell.querySelector("#ms-act").innerHTML = "";
    const tk = G.tk;
    void aiSay("游戏刚开始，说一句开场（不超过25字），可以放狠话或者撒娇。", "开始了，说一句。", 200).then((t) => G && G.tk === tk && say(G.ch, t));
  }

  F.register("情侣扫雷", {
    title: "情侣扫雷",
    kicker: "GAME / MINESWEEPER",
    parent: "游戏厅",
    mount(body) {
      root = document.createElement("div");
      root.className = "g-root";
      body.appendChild(root);
      void start(false);
    },
    unmount() {
      G = null;
      root = null;
    }
  });
})();
