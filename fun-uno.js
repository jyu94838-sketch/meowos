"use strict";

/**
 * 娱乐 · UNO
 * 出牌逻辑由程序计算；角色台词可选用 AI 生成（没有 API Key 时用预设台词）。
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast, sleep, rnd, pick, shuffle, avHtml } = F;

  const COLORS = ["r", "y", "g", "b"];
  const COLOR_NAME = { r: "红", y: "黄", g: "绿", b: "蓝", w: "万能" };
  const LABEL = { skip: "⊘", rev: "⇄", "+2": "+2", wild: "★", "+4": "+4" };
  const DEFAULT_BOTS = [
    { id: "bot1", name: "小橘", persona: "活泼爱闹，输了会耍赖", avatar: "" },
    { id: "bot2", name: "阿蓝", persona: "冷静理性，话不多", avatar: "" },
    { id: "bot3", name: "青青", persona: "温柔但胜负心很强", avatar: "" }
  ];
  const PRESET = {
    hit: ["可恶！", "你给我等着！", "又要摸牌……", "过分了啊！", "我记住你了。"],
    attack: ["嘿嘿，接招吧~", "不好意思啦", "摸牌吧你", "这张送你。"],
    uno: ["UNO！", "就剩一张咯~", "要赢咯！"],
    win: ["我赢啦！", "承让承让~", "就这？"],
    lose: ["下把一定赢……", "哼，再来！", "运气而已。"]
  };

  let G = null; // 当前对局
  let root = null;
  let cast = [];
  let useAi = true;
  let speaking = false;

  function buildDeck() {
    const d = [];
    let n = 0;
    for (const c of COLORS) {
      d.push({ id: n++, c, v: "0" });
      for (let k = 0; k < 2; k++) {
        for (let v = 1; v <= 9; v++) d.push({ id: n++, c, v: String(v) });
        d.push({ id: n++, c, v: "skip" }, { id: n++, c, v: "rev" }, { id: n++, c, v: "+2" });
      }
    }
    for (let k = 0; k < 4; k++) d.push({ id: n++, c: "w", v: "wild" }, { id: n++, c: "w", v: "+4" });
    return shuffle(d);
  }

  const top = () => G.discard[G.discard.length - 1];
  const canPlay = (card) => card.c === "w" || card.c === G.color || card.v === top().v;
  const nextIdx = (from, steps) => {
    const n = G.players.length;
    return (((from + G.dir * (steps || 1)) % n) + n) % n;
  };

  function drawCards(pi, k) {
    const got = [];
    for (let i = 0; i < k; i++) {
      if (!G.deck.length) {
        const keep = G.discard.pop();
        G.deck = shuffle(G.discard);
        G.discard = [keep];
        if (!G.deck.length) break;
      }
      got.push(G.deck.pop());
    }
    G.players[pi].hand.push(...got);
    return got;
  }

  function sortHand(h) {
    const co = { r: 0, y: 1, g: 2, b: 3, w: 4 };
    const vo = (v) => (/^\d$/.test(v) ? Number(v) : { skip: 10, rev: 11, "+2": 12, wild: 13, "+4": 14 }[v]);
    h.sort((a, b) => co[a.c] - co[b.c] || vo(a.v) - vo(b.v));
  }

  function cardHtml(card, extra) {
    const v = LABEL[card.v] || card.v;
    return `<span class="uno-card c-${card.c}${extra || ""}" data-id="${card.id}"><span class="uno-card-corner">${esc(v)}</span><span class="uno-card-v">${esc(v)}</span></span>`;
  }

  function log(text) {
    G.log.unshift(text);
    G.log.length = Math.min(G.log.length, 4);
  }

  /* ───── 台词 ───── */
  async function say(pi, kind, situation) {
    const p = G.players[pi];
    if (!p || p.isUser) return;
    let line = pick(PRESET[kind] || PRESET.hit);
    if (useAi && F.hasApiKey() && !speaking) {
      speaking = true;
      try {
        const others = G.players.filter((x) => x !== p).map((x) => x.name).join("、");
        const txt = await F.aiText(
          [
            {
              role: "system",
              content: `你在扮演「${p.name}」。${p.persona ? "人设：\n" + p.persona + "\n" : ""}你正在和${others}一起玩 UNO 纸牌。用${p.name}的口吻说一句很短的话（不超过20个字），只输出这句台词本身，不要引号、不要动作描写。`
            },
            { role: "user", content: situation }
          ],
          { maxTokens: 300 }
        );
        line = F.cleanLine(txt, 40, p.name) || line;
      } catch (err) {
        console.warn("[uno] line", err);
      } finally {
        speaking = false;
      }
    }
    if (!G) return;
    p.bubble = line;
    p.bubbleAt = Date.now();
    render();
    const at = p.bubbleAt;
    setTimeout(() => {
      if (G && p.bubbleAt === at) {
        p.bubble = "";
        render();
      }
    }, 4200);
  }

  /* ───── 规则 ───── */
  function startGame(players) {
    const deck = buildDeck();
    G = {
      players: players.map((p) => ({ ...p, hand: [], bubble: "" })),
      deck,
      discard: [],
      color: "r",
      dir: 1,
      turn: 0,
      over: false,
      drawnId: null,
      unoArmed: false,
      log: [],
      token: Symbol("uno")
    };
    for (let i = 0; i < 7; i++) G.players.forEach((_, pi) => drawCards(pi, 1));
    // 首张必须是数字牌
    let first = G.deck.pop();
    while (!/^\d$/.test(first.v)) {
      G.deck.unshift(first);
      first = G.deck.pop();
    }
    G.discard.push(first);
    G.color = first.c;
    sortHand(G.players[0].hand);
    G.turn = rnd(G.players.length);
    log(`${G.players[G.turn].name} 先出牌`);
    render();
    const starter = G.players.find((p) => !p.isUser);
    if (starter) void say(G.players.indexOf(starter), "attack", "牌局刚开始，说一句开场的话。");
    scheduleAi();
  }

  function playCard(pi, cardId, chosenColor) {
    const p = G.players[pi];
    const i = p.hand.findIndex((c) => c.id === cardId);
    if (i < 0) return;
    const card = p.hand.splice(i, 1)[0];
    G.discard.push(card);
    G.color = card.c === "w" ? chosenColor || "r" : card.c;
    G.drawnId = null;
    const nm = card.c === "w" ? `${LABEL[card.v]}（选${COLOR_NAME[G.color]}）` : `${COLOR_NAME[card.c]}${LABEL[card.v] || card.v}`;
    log(`${p.name} 出了 ${nm}`);

    if (!p.hand.length) {
      finish(pi);
      return;
    }
    if (p.hand.length === 1) {
      if (p.isUser && !G.unoArmed) {
        drawCards(pi, 2);
        sortHand(p.hand);
        log(`${p.name} 忘喊 UNO，罚摸 2 张`);
        toast("忘记喊 UNO！罚摸 2 张");
      } else {
        log(`${p.name}：UNO！`);
        if (!p.isUser) void say(pi, "uno", "你手里只剩最后一张牌了，喊出 UNO。");
      }
    }
    G.unoArmed = false;

    let stepN = 1;
    const n = G.players.length;
    if (card.v === "skip") stepN = 2;
    if (card.v === "rev") {
      G.dir *= -1;
      if (n === 2) stepN = 2;
    }
    if (card.v === "+2" || card.v === "+4") {
      const victim = nextIdx(pi, 1);
      const k = card.v === "+2" ? 2 : 4;
      drawCards(victim, k);
      if (G.players[victim].isUser) sortHand(G.players[victim].hand);
      log(`${G.players[victim].name} 摸 ${k} 张并跳过`);
      stepN = 2;
      reactToHit(pi, victim, card.v);
    } else if (card.v === "skip") {
      const victim = nextIdx(pi, 1);
      log(`${G.players[victim].name} 被跳过`);
      if (Math.random() < 0.4) reactToHit(pi, victim, "跳过");
    }
    G.turn = nextIdx(pi, stepN);
    render();
    scheduleAi();
  }

  function reactToHit(attacker, victim, what) {
    const a = G.players[attacker];
    const v = G.players[victim];
    if (!v.isUser) void say(victim, "hit", `${a.name}刚对你出了一张「${what}」${what.startsWith("+") ? "，你要摸" + what.slice(1) + "张牌" : "，你被跳过了"}。你手里还有${v.hand.length}张牌。`);
    else if (!a.isUser) void say(attacker, "attack", `你刚对${v.name}出了一张「${what}」，得意一下。`);
  }

  function finish(winner) {
    G.over = true;
    const w = G.players[winner];
    log(`${w.name} 赢了！`);
    render();
    if (!w.isUser) void say(winner, "win", "你打出最后一张牌，赢了这局 UNO！");
    else {
      const loser = G.players.findIndex((p) => !p.isUser);
      if (loser >= 0) void say(loser, "lose", `${w.name}赢了这局 UNO，你输了。`);
    }
    showEnd(w);
  }

  function chooseColorFor(hand) {
    const cnt = { r: 0, y: 0, g: 0, b: 0 };
    hand.forEach((c) => c.c !== "w" && cnt[c.c]++);
    const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
    return best[1] > 0 ? best[0] : pick(COLORS);
  }

  function aiChoose(pi) {
    const hand = G.players[pi].hand;
    const playable = hand.filter(canPlay);
    if (!playable.length) return null;
    const nextP = G.players[nextIdx(pi, 1)];
    const danger = nextP.hand.length <= 2;
    const actions = playable.filter((c) => ["+2", "skip", "rev", "+4"].includes(c.v));
    if (danger && actions.length) return actions.find((c) => c.c !== "w") || actions[0];
    const nonWild = playable.filter((c) => c.c !== "w");
    if (nonWild.length) {
      const cnt = {};
      hand.forEach((c) => (cnt[c.c] = (cnt[c.c] || 0) + 1));
      nonWild.sort((a, b) => (cnt[b.c] || 0) - (cnt[a.c] || 0) || (/\d/.test(b.v) ? Number(b.v) : 10) - (/\d/.test(a.v) ? Number(a.v) : 10));
      return nonWild[0];
    }
    return playable.find((c) => c.v === "wild") || playable[0];
  }

  function scheduleAi() {
    if (!G || G.over) return;
    const p = G.players[G.turn];
    if (p.isUser) return;
    const tk = G.token;
    setTimeout(async () => {
      if (!G || G.token !== tk || G.over || G.players[G.turn] !== p) return;
      const pi = G.turn;
      let card = aiChoose(pi);
      if (!card) {
        const [got] = drawCards(pi, 1);
        log(`${p.name} 摸了一张`);
        render();
        await sleep(600);
        if (!G || G.token !== tk) return;
        if (got && canPlay(got)) card = got;
        else {
          G.turn = nextIdx(pi, 1);
          render();
          scheduleAi();
          return;
        }
      }
      playCard(pi, card.id, card.c === "w" ? chooseColorFor(p.hand.filter((c) => c.id !== card.id)) : null);
    }, 900 + rnd(700));
  }

  /* ───── 用户操作 ───── */
  function userPlay(cardId) {
    if (!G || G.over || G.turn !== 0) return;
    const card = G.players[0].hand.find((c) => c.id === cardId);
    if (!card) return;
    if (G.drawnId != null && card.id !== G.drawnId) {
      toast("刚摸的牌才能出，或者点「过」");
      return;
    }
    if (!canPlay(card)) {
      toast("这张不能出");
      return;
    }
    if (card.c === "w") {
      const sh = F.openSheet(
        `<div class="uno-colors">${COLORS.map((c) => `<button type="button" class="uno-color-btn c-${c}" data-c="${c}">${COLOR_NAME[c]}</button>`).join("")}</div>`,
        { title: "选一个颜色" }
      );
      sh.body.addEventListener("click", (e) => {
        const c = e.target.closest("[data-c]")?.dataset.c;
        if (!c) return;
        sh.close();
        playCard(0, card.id, c);
      });
      return;
    }
    playCard(0, card.id);
  }

  function userDraw() {
    if (!G || G.over || G.turn !== 0) return;
    if (G.drawnId != null) {
      // 已经摸过 → 过
      G.drawnId = null;
      log(`${G.players[0].name} 过`);
      G.turn = nextIdx(0, 1);
      render();
      scheduleAi();
      return;
    }
    const [got] = drawCards(0, 1);
    sortHand(G.players[0].hand);
    if (got && canPlay(got)) {
      G.drawnId = got.id;
      log(`你摸到一张能出的牌`);
      render();
      return;
    }
    log(`${G.players[0].name} 摸了一张`);
    G.turn = nextIdx(0, 1);
    render();
    scheduleAi();
  }

  /* ───── 渲染 ───── */
  function render() {
    if (!root || !G) return;
    const me = G.players[0];
    const myTurn = G.turn === 0 && !G.over;
    const opps = G.players
      .map((p, i) => ({ p, i }))
      .filter((x) => !x.p.isUser);
    root.innerHTML = `
      <div class="uno uno--${G.color}">
        <div class="uno-opps">
          ${opps
            .map(
              ({ p, i }) => `<div class="uno-seat${G.turn === i && !G.over ? " is-turn" : ""}">
                ${p.bubble ? `<div class="uno-bubble">${esc(p.bubble)}</div>` : ""}
                ${avHtml(p, "fun-av uno-av")}
                <strong>${esc(p.name)}</strong>
                <span class="uno-count${p.hand.length === 1 ? " is-uno" : ""}">${p.hand.length === 1 ? "UNO" : p.hand.length + " 张"}</span>
                <span class="uno-backs">${Array.from({ length: Math.min(p.hand.length, 8) }, () => "<i></i>").join("")}</span>
              </div>`
            )
            .join("")}
        </div>
        <div class="uno-table">
          <span class="uno-dir${G.dir < 0 ? " is-rev" : ""}" title="出牌方向">↻</span>
          <button type="button" class="uno-deck${myTurn ? " is-live" : ""}" id="uno-deck">
            <span class="uno-card uno-card--back"><span class="uno-card-v">UNO</span></span>
            <small>${G.drawnId != null ? "过" : "摸牌"} · ${G.deck.length}</small>
          </button>
          <div class="uno-pile">${cardHtml(top())}<small class="uno-cur">当前：<b class="dot c-${G.color}"></b>${COLOR_NAME[G.color]}色</small></div>
        </div>
        <div class="uno-log">${G.log.map((l, i) => `<p style="opacity:${1 - i * 0.22}">${esc(l)}</p>`).join("")}</div>
        <div class="uno-me${myTurn ? " is-turn" : ""}">
          <div class="uno-me-bar">
            <span class="uno-me-name">${myTurn ? "轮到你了" : G.over ? "对局结束" : `等待 ${esc(G.players[G.turn].name)}…`}</span>
            <button type="button" class="fun-btn sm ${G.unoArmed ? "solid" : "ghost"} uno-call" id="uno-call" ${me.hand.length === 2 && myTurn ? "" : "disabled"}>UNO!</button>
          </div>
          <div class="uno-hand">${me.hand
            .map((c) => {
              const ok = myTurn && canPlay(c) && (G.drawnId == null || c.id === G.drawnId);
              return cardHtml(c, ok ? " is-ok" : myTurn ? " is-dim" : "");
            })
            .join("")}</div>
        </div>
      </div>`;
  }

  function showEnd(w) {
    const sh = F.openSheet(
      `<div class="fun-end"><div class="fun-end-big">${w.isUser ? "🎉" : "🃏"}</div>
        <p><b>${esc(w.name)}</b> ${w.isUser ? "赢了！太强了" : "赢了这局"}</p>
        <div class="fun-sheet-actions"><button type="button" class="fun-btn ghost" data-act="setup">换人</button><button type="button" class="fun-btn solid" data-act="again">再来一局</button></div></div>`,
      { title: "对局结束" }
    );
    sh.body.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (!act) return;
      sh.close();
      if (act === "again") startGame(G.players.map(({ hand, bubble, ...rest }) => rest));
      else renderSetup();
    });
  }

  let lastPicked = [];
  async function renderSetup() {
    G = null;
    root.innerHTML = `<div class="fun-setup"><div class="fun-hero uno-hero"><span class="uno-card c-r"><span class="uno-card-v">U</span></span><span class="uno-card c-y"><span class="uno-card-v">N</span></span><span class="uno-card c-b"><span class="uno-card-v">O</span></span></div>
      <p class="fun-kicker">CARD GAME</p><h2 class="fun-h2">和角色们打一局 UNO</h2>
      <p class="fun-note">选 1~3 位角色当对手。出牌是程序算的，角色会在被 +4、喊 UNO、赢牌时说话。</p>
      <div class="fun-picked" id="uno-picked"></div>
      <label class="fun-switch"><input type="checkbox" id="uno-ai" ${useAi ? "checked" : ""}/><span>角色台词用 AI 生成（消耗少量 API）</span></label>
      <div class="fun-setup-btns"><button type="button" class="fun-btn ghost" id="uno-pick">选角色</button><button type="button" class="fun-btn solid" id="uno-start">开始</button></div></div>`;
    cast = await F.loadCast();
    const user = await F.loadUser();
    if (!root) return;
    const pool = cast.length ? cast : DEFAULT_BOTS;
    if (!lastPicked.length || !lastPicked.every((p) => pool.some((c) => c.id === p.id))) lastPicked = shuffle(pool.slice()).slice(0, Math.min(3, pool.length));
    const renderPicked = () => {
      root.querySelector("#uno-picked").innerHTML =
        lastPicked.map((p) => `<span class="fun-chip">${avHtml(p, "fun-av sm")}${esc(p.name)}</span>`).join("") +
        (cast.length ? "" : `<p class="fun-note">角色库里还没有角色，先用电脑对手。</p>`);
    };
    renderPicked();
    root.querySelector("#uno-pick").onclick = async () => {
      const res = await F.pickCast(pool, { min: 1, max: 3, preselect: lastPicked.map((p) => p.id), title: "选择对手" });
      if (res) {
        lastPicked = res;
        renderPicked();
      }
    };
    root.querySelector("#uno-ai").onchange = (e) => (useAi = e.target.checked);
    root.querySelector("#uno-start").onclick = () => {
      if (useAi && !F.hasApiKey()) toast("没有填 API Key，角色会用预设台词");
      startGame([{ ...user, id: "me", isUser: true }, ...lastPicked.map((p) => ({ ...p, isUser: false }))]);
    };
  }

  function onClick(e) {
    if (!G) return;
    if (e.target.closest("#uno-deck")) return userDraw();
    if (e.target.closest("#uno-call")) {
      G.unoArmed = !G.unoArmed;
      render();
      return;
    }
    const c = e.target.closest(".uno-hand .uno-card");
    if (c) userPlay(Number(c.dataset.id));
  }

  F.register("UNO", {
    title: "UNO",
    kicker: "GAME / CARDS",
    mount(body, act) {
      root = document.createElement("div");
      root.className = "uno-root";
      body.appendChild(root);
      root.addEventListener("click", onClick);
      act.innerHTML = `<button type="button" class="fun-btn ghost sm" id="uno-restart">重开</button>`;
      act.querySelector("#uno-restart").onclick = () => renderSetup();
      void renderSetup();
    },
    unmount() {
      G = null;
      root = null;
    }
  });
})();
