"use strict";

/**
 * 游戏 · 飞行棋（简化版，一局约 10 分钟）
 * - 你 + 1~3 位角色，每人 2 架飞机
 * - 掷到 5 或 6 起飞，掷到 6 再掷一次
 * - 落在对手飞机上把它撞回机库；落在自己颜色的格子上往前跳 4 格
 * - 终点要正好走到，多出来的步数往回退
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast, sleep, rnd, pick, shuffle, avHtml } = F;

  const COLORS = ["r", "y", "g", "b"];
  const CNAME = { r: "红", y: "黄", g: "绿", b: "蓝" };
  const START = [7, 17, 27, 37];
  const FINISH = 43;
  const HANGAR = [
    [[2, 7], [2, 8]],
    [[7, 8], [8, 8]],
    [[8, 2], [8, 3]],
    [[2, 2], [3, 2]]
  ];
  const PRESET = {
    hit: ["啊！我的飞机！", "你给我等着……", "撞我？好啊。", "呜呜呜回家了"],
    attack: ["撞的就是你~", "嘿嘿，回去吧", "不好意思咯", "让路让路！"],
    win: ["我赢啦！", "全部到家~", "承让承让"],
    lose: ["下次一定…", "这骰子有问题！", "再来！"]
  };

  function ringXY(i) {
    if (i <= 10) return [0, i];
    if (i <= 20) return [i - 10, 10];
    if (i <= 30) return [10, 30 - i];
    return [40 - i, 0];
  }
  function homeXY(c, k) {
    return [[k, 5], [5, 10 - k], [10 - k, 5], [5, k]][c];
  }
  const ringIdx = (c, p) => (START[c] + p) % 40;
  function xyOf(c, p, slot) {
    if (p < 0) return HANGAR[c][slot];
    if (p <= 38) return ringXY(ringIdx(c, p));
    if (p < FINISH) return homeXY(c, p - 38);
    return [5, 5];
  }

  let root = null;
  let L = null;
  let lastPicked = [];
  let speaking = false;

  /* ───── 规则 ───── */
  function movable(pl, d) {
    return pl.planes.map((p, i) => ({ p, i })).filter(({ p }) => (p < 0 ? d >= 5 : p < FINISH)).map((x) => x.i);
  }

  function target(c, p, d) {
    if (p < 0) return 0;
    let np = p + d;
    if (np > FINISH) np = FINISH - (np - FINISH);
    return np;
  }

  function captureAt(pi, np) {
    const me = L.players[pi];
    if (np > 38) return [];
    const idx = ringIdx(me.c, np);
    const hits = [];
    L.players.forEach((op, oi) => {
      if (oi === pi) return;
      op.planes.forEach((q, qi) => {
        if (q >= 0 && q <= 38 && ringIdx(op.c, q) === idx) {
          op.planes[qi] = -1;
          hits.push(oi);
        }
      });
    });
    return hits;
  }

  function doMove(pi, planeI, d) {
    const me = L.players[pi];
    let np = target(me.c, me.planes[planeI], d);
    const hits = captureAt(pi, np);
    let jumped = false;
    if (np >= 1 && np <= 34 && ringIdx(me.c, np) % 4 === me.c && !START.includes(ringIdx(me.c, np))) {
      np += 4;
      jumped = true;
      hits.push(...captureAt(pi, np));
    }
    me.planes[planeI] = np;
    const who = me.isUser ? "你" : me.name;
    if (np === FINISH) log(`${who}的一架飞机到家了！`);
    else if (jumped) log(`${who}落在同色格，跳 4 格`);
    if (hits.length) {
      const names = [...new Set(hits)].map((h) => L.players[h].name).join("、");
      log(`💥 ${who}撞回了 ${names} 的飞机`);
      const v = hits[0];
      if (!L.players[v].isUser) void say(v, "hit", `${me.name}把你的飞机撞回机库了。`);
      else if (!me.isUser) void say(pi, "attack", `你刚把${L.players[v].name}的飞机撞回机库。`);
    }
    return hits.length > 0;
  }

  function aiPick(pi, opts, d) {
    const me = L.players[pi];
    let best = opts[0];
    let bestScore = -1e9;
    for (const i of opts) {
      const p = me.planes[i];
      const np = target(me.c, p, d);
      let sc = np;
      if (np === FINISH) sc += 100;
      if (p < 0) sc += 40;
      if (np <= 38) {
        const idx = ringIdx(me.c, np);
        L.players.forEach((op, oi) => {
          if (oi !== pi && op.planes.some((q) => q >= 0 && q <= 38 && ringIdx(op.c, q) === idx)) sc += 80;
        });
      }
      if (np > 38) sc += 20;
      sc += Math.random() * 5;
      if (sc > bestScore) {
        bestScore = sc;
        best = i;
      }
    }
    return best;
  }

  /* ───── 台词 ───── */
  async function say(pi, kind, situation) {
    const p = L?.players[pi];
    if (!p || p.isUser) return;
    let line = pick(PRESET[kind]);
    if (L.useAi && F.hasApiKey() && !speaking) {
      speaking = true;
      try {
        const others = L.players.filter((x) => x !== p).map((x) => x.name).join("、");
        line =
          F.cleanLine(
            await F.aiText(
              [
                { role: "system", content: `你是「${p.name}」。${p.persona ? "人设：" + p.persona + "\n" : ""}${F.recordSummary(p.name)}\n你在和${others}下飞行棋。用你的口吻说一句很短的话（不超过20字），只输出台词。` },
                { role: "user", content: situation }
              ],
              { maxTokens: 300 }
            ),
            40,
            p.name
          ) || line;
      } catch (_) {
        /* 用预设 */
      } finally {
        speaking = false;
      }
    }
    if (!L) return;
    p.bubble = line;
    const at = (p.bubbleAt = Date.now());
    render();
    setTimeout(() => {
      if (L && p.bubbleAt === at) {
        p.bubble = "";
        render();
      }
    }, 4000);
  }

  function log(t) {
    L.log.unshift(t);
    L.log.length = Math.min(L.log.length, 3);
  }

  /* ───── 流程 ───── */
  async function turn() {
    if (!L || L.over) return;
    const tk = L.tk;
    const pi = L.turn;
    const me = L.players[pi];
    L.phase = "roll";
    L.choices = [];
    render();
    if (me.isUser) return; // 等用户点骰子
    await sleep(700);
    if (!L || L.tk !== tk) return;
    await roll(pi);
  }

  async function roll(pi) {
    const tk = L.tk;
    L.phase = "rolling";
    render();
    for (let k = 0; k < 6; k++) {
      L.dice = 1 + rnd(6);
      renderDice();
      await sleep(70);
    }
    const d = 1 + rnd(6);
    L.dice = d;
    if (!L || L.tk !== tk) return;
    const me = L.players[pi];
    const opts = movable(me, d);
    if (!opts.length) {
      log(`${me.isUser ? "你" : me.name}掷出 ${d}，走不了`);
      L.phase = "idle";
      render();
      await sleep(800);
      return next(d === 6);
    }
    let choice;
    if (me.isUser && opts.length > 1) {
      L.phase = "choose";
      L.choices = opts;
      render();
      choice = await new Promise((res) => (L.onChoose = res));
      if (!L || L.tk !== tk) return;
    } else choice = me.isUser ? opts[0] : aiPick(pi, opts, d);
    L.choices = [];
    log(`${me.isUser ? "你" : me.name}掷出 ${d}`);
    doMove(pi, choice, d);
    L.phase = "idle";
    render();
    if (me.planes.every((p) => p === FINISH)) return finish(pi);
    await sleep(600);
    next(d === 6);
  }

  function next(again) {
    if (!L || L.over) return;
    if (again) log(`掷到 6，再来一次！`);
    else L.turn = (L.turn + 1) % L.players.length;
    void turn();
  }

  function finish(pi) {
    L.over = true;
    const w = L.players[pi];
    log(`🏆 ${w.isUser ? "你" : w.name}赢了！`);
    render();
    void F.addRecord({ game: "飞行棋", players: L.players.filter((p) => !p.isUser).map((p) => p.name), winner: w.name, userWon: !!w.isUser });
    if (!w.isUser) void say(pi, "win", "你的飞机全部到家，赢了这局飞行棋！");
    else {
      const li = L.players.findIndex((p) => !p.isUser);
      if (li >= 0) void say(li, "lose", `${w.name}赢了这局飞行棋，你输了。`);
    }
    const sh = F.openSheet(
      `<div class="fun-end"><div class="fun-end-big">${w.isUser ? "🏆" : "✈️"}</div><p><b>${esc(w.name)}</b> 赢了！</p>
        <div class="fun-sheet-actions"><button type="button" class="fun-btn ghost" data-a="setup">换人</button><button type="button" class="fun-btn solid" data-a="again">再来一局</button></div></div>`,
      { title: "对局结束" }
    );
    sh.body.addEventListener("click", (e) => {
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (!a) return;
      sh.close();
      if (a === "again") start(L.players.map(({ planes, bubble, bubbleAt, ...r }) => r), L.useAi);
      else renderSetup();
    });
  }

  function start(players, useAi) {
    L = {
      tk: Symbol(),
      players: players.map((p, i) => ({ ...p, c: i, planes: [-1, -1], bubble: "" })),
      turn: 0,
      dice: 6,
      phase: "roll",
      choices: [],
      log: ["掷到 5 或 6 才能起飞"],
      over: false,
      useAi
    };
    void turn();
  }

  /* ───── 渲染 ───── */
  function renderDice() {
    const el = root?.querySelector(".lu-dice-face");
    if (el) el.textContent = "⚀⚁⚂⚃⚄⚅"[L.dice - 1];
  }

  function render() {
    if (!root || !L) return;
    const cells = [];
    for (let i = 0; i < 40; i++) {
      const [r, c] = ringXY(i);
      const isStart = START.indexOf(i);
      const col = COLORS[isStart >= 0 ? isStart : i % 4];
      cells.push(`<div class="lu-cell lu-ring c-${col}${isStart >= 0 ? " is-start" : ""}" style="grid-area:${r + 1}/${c + 1}">${isStart >= 0 ? "▶" : ""}</div>`);
    }
    for (let ci = 0; ci < 4; ci++) {
      for (let k = 1; k <= 4; k++) {
        const [r, c] = homeXY(ci, k);
        cells.push(`<div class="lu-cell lu-home c-${COLORS[ci]}" style="grid-area:${r + 1}/${c + 1}"></div>`);
      }
      HANGAR[ci].forEach(([r, c]) => cells.push(`<div class="lu-cell lu-hangar c-${COLORS[ci]}" style="grid-area:${r + 1}/${c + 1}"></div>`));
    }
    cells.push(`<div class="lu-cell lu-center" style="grid-area:6/6">🏁</div>`);
    // 飞机：同格叠放
    const at = {};
    L.players.forEach((p, pi) =>
      p.planes.forEach((q, qi) => {
        const [r, c] = xyOf(p.c, q, qi);
        const k = `${r},${c}`;
        (at[k] = at[k] || []).push({ pi, qi, col: COLORS[p.c] });
      })
    );
    const myTurn = L.players[L.turn].isUser;
    for (const [k, list] of Object.entries(at)) {
      const [r, c] = k.split(",").map(Number);
      cells.push(
        `<div class="lu-stack" style="grid-area:${r + 1}/${c + 1}">${list
          .map((x) => {
            const can = myTurn && L.phase === "choose" && x.pi === L.turn && L.choices.includes(x.qi);
            return `<button type="button" class="lu-plane c-${x.col}${can ? " is-can" : ""}" data-q="${x.qi}" ${can ? "" : "tabindex=-1"}>✈</button>`;
          })
          .join("")}</div>`
      );
    }
    const cur = L.players[L.turn];
    root.innerHTML = `<div class="lu">
      <div class="lu-players">${L.players
        .map(
          (p, i) => `<div class="lu-p c-${COLORS[p.c]}${i === L.turn && !L.over ? " is-turn" : ""}">${p.bubble ? `<div class="uno-bubble">${esc(p.bubble)}</div>` : ""}${avHtml(p, "fun-av sm")}<strong>${esc(p.isUser ? "你" : p.name)}</strong><small>${p.planes.filter((q) => q === FINISH).length}/2</small></div>`
        )
        .join("")}</div>
      <div class="lu-board">${cells.join("")}</div>
      <div class="lu-foot">
        <div class="uno-log">${L.log.map((l, i) => `<p style="opacity:${1 - i * 0.28}">${esc(l)}</p>`).join("")}</div>
        <button type="button" class="lu-dice${myTurn && L.phase === "roll" && !L.over ? " is-live" : ""}" id="lu-dice"><span class="lu-dice-face">${"⚀⚁⚂⚃⚄⚅"[L.dice - 1]}</span>
          <small>${L.over ? "结束" : myTurn ? (L.phase === "choose" ? "点一架亮着的飞机" : L.phase === "roll" ? "点我掷骰子" : "…") : `${esc(cur.name)}（${CNAME[COLORS[cur.c]]}）的回合`}</small></button>
      </div></div>`;
  }

  async function renderSetup() {
    L = null;
    root.innerHTML = `<div class="fun-setup"><div class="fun-hero">✈️</div><p class="fun-kicker">AEROPLANE CHESS</p><h2 class="fun-h2">飞行棋</h2>
      <p class="fun-note">你 + 1~3 位角色，每人 2 架飞机。掷到 5 或 6 起飞，掷到 6 再掷一次；撞到别人把 TA 送回机库；停在自己颜色的格子上会往前跳 4 格。</p>
      <div class="fun-picked" id="lu-picked"></div>
      <label class="fun-switch"><input type="checkbox" id="lu-ai" checked /><span>角色台词用 AI 生成</span></label>
      <div class="fun-setup-btns"><button type="button" class="fun-btn ghost" id="lu-pick">选角色</button><button type="button" class="fun-btn solid" id="lu-start">开始</button></div></div>`;
    const cast = await F.loadCast();
    const user = await F.loadUser();
    if (!root) return;
    const pool = cast.length ? cast : [{ id: "lb1", name: "小橘", persona: "" }, { id: "lb2", name: "阿蓝", persona: "" }, { id: "lb3", name: "青青", persona: "" }];
    if (!lastPicked.length || !lastPicked.every((p) => pool.some((c) => c.id === p.id))) lastPicked = shuffle(pool.slice()).slice(0, Math.min(3, pool.length));
    const draw = () => (root.querySelector("#lu-picked").innerHTML = lastPicked.map((p) => `<span class="fun-chip">${avHtml(p, "fun-av sm")}${esc(p.name)}</span>`).join(""));
    draw();
    root.querySelector("#lu-pick").onclick = async () => {
      const r = await F.pickCast(pool, { min: 1, max: 3, preselect: lastPicked.map((p) => p.id), title: "选 1~3 位对手" });
      if (r) {
        lastPicked = r;
        draw();
      }
    };
    root.querySelector("#lu-start").onclick = () => start([{ ...user, id: "me", isUser: true }, ...lastPicked.map((p) => ({ ...p, isUser: false }))], root.querySelector("#lu-ai").checked);
  }

  function onClick(e) {
    if (!L) return;
    if (e.target.closest("#lu-dice")) {
      if (L.players[L.turn].isUser && L.phase === "roll" && !L.over) void roll(L.turn);
      return;
    }
    const pl = e.target.closest(".lu-plane.is-can");
    if (pl && L.onChoose) {
      const f = L.onChoose;
      L.onChoose = null;
      f(Number(pl.dataset.q));
    }
  }

  F.register("飞行棋", {
    title: "飞行棋",
    kicker: "GAME / AEROPLANE",
    parent: "游戏厅",
    mount(body, act) {
      root = document.createElement("div");
      root.className = "g-root";
      body.appendChild(root);
      root.addEventListener("click", onClick);
      act.innerHTML = `<button type="button" class="fun-btn ghost sm">重开</button>`;
      act.querySelector("button").onclick = () => renderSetup();
      void renderSetup();
    },
    unmount() {
      L = null;
      root = null;
    }
  });
})();
