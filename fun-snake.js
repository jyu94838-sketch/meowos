"use strict";

/**
 * 贪吃蛇
 * - 单人：经典玩法
 * - 组队：你和选中的角色在同一块地图上一起吃，分数加在一起；队友之间可以穿过去，撞墙或咬到自己才算挂
 * - 对战：每条蛇各吃各的，撞到别人也会挂，最后比谁吃得多（角色由电脑控制，也会犯小错）
 * - 和联机好友一起玩：在「联机」里开「贪吃蛇 · 比分 / 组队」，每人在自己手机上玩一局，成绩自动交回群里
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast } = F;
  const N = 20; // 格子数
  const BEST_KEY = "meowos_snake_best";
  const COLORS = ["#f2a65a", "#8fc5f2", "#c9a7f2", "#7fd1a8", "#f4a7b9"];
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const OPP = { up: "down", down: "up", left: "right", right: "left" };

  let root = null;
  let G = null;
  let timer = 0;
  let mode = "solo";
  let picked = [];
  let best = {};
  try {
    best = JSON.parse(localStorage.getItem(BEST_KEY) || "{}") || {};
  } catch (_) {
    best = {};
  }
  const saveBest = () => {
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(best));
    } catch (_) {
      /* ignore */
    }
  };
  const MODES = {
    solo: { name: "单人", desc: "经典贪吃蛇，越吃越长越快" },
    team: { name: "组队", desc: "和角色一起吃，分数加在一起；队友之间可以穿过" },
    versus: { name: "对战", desc: "和角色比谁吃得多，撞到别人也会挂" }
  };

  /* ───── 游戏逻辑 ───── */
  const key = (x, y) => y * N + x;
  function newSnake(id, name, color, x, y, dir, ai) {
    const [dx, dy] = DIRS[dir];
    return { id, name, color, body: [{ x, y }, { x: x - dx, y: y - dy }, { x: x - 2 * dx, y: y - 2 * dy }], dir, next: dir, alive: true, score: 0, ai, grow: 0 };
  }
  function build(user) {
    const starts = [
      [5, 10, "right"],
      [14, 9, "left"],
      [10, 4, "down"],
      [9, 15, "up"]
    ];
    const snakes = [newSnake("me", user.name || "我", COLORS[0], ...starts[0], false)];
    if (mode !== "solo") picked.slice(0, 3).forEach((c, i) => snakes.push(newSnake(c.id, c.name, COLORS[i + 1], ...starts[i + 1], true)));
    const g = { snakes, food: [], tick: 0, over: false, paused: false, startAt: Date.now() };
    const nf = 1 + Math.floor(snakes.length / 2);
    for (let i = 0; i < nf; i++) addFood(g);
    return g;
  }
  function occupied(g) {
    const s = new Set();
    for (const sn of g.snakes) if (sn.alive) sn.body.forEach((p) => s.add(key(p.x, p.y)));
    g.food.forEach((f) => s.add(key(f.x, f.y)));
    return s;
  }
  function addFood(g) {
    const occ = occupied(g);
    for (let t = 0; t < 400; t++) {
      const x = Math.floor(Math.random() * N);
      const y = Math.floor(Math.random() * N);
      if (!occ.has(key(x, y))) {
        g.food.push({ x, y, v: Math.random() < 0.12 ? 3 : 1 });
        return;
      }
    }
  }
  const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  /** 这条蛇眼里的障碍（组队时队友不算障碍） */
  function blocked(g, me) {
    const s = new Set();
    for (const sn of g.snakes) {
      if (!sn.alive) continue;
      if (mode === "team" && sn !== me) continue;
      sn.body.forEach((p, i) => {
        if (i === sn.body.length - 1 && !sn.grow) return; // 尾巴下一步会挪开
        s.add(key(p.x, p.y));
      });
    }
    return s;
  }
  function floodSize(start, block, limit) {
    const seen = new Set([key(start.x, start.y)]);
    const q = [start];
    while (q.length && seen.size < limit) {
      const p = q.shift();
      for (const [dx, dy] of Object.values(DIRS)) {
        const x = p.x + dx;
        const y = p.y + dy;
        const k = key(x, y);
        if (!inside(x, y) || block.has(k) || seen.has(k)) continue;
        seen.add(k);
        q.push({ x, y });
      }
    }
    return seen.size;
  }
  /** 电脑控制的蛇：找最近的食物，路上避开障碍；偶尔犯迷糊 */
  function aiThink(g, sn) {
    const head = sn.body[0];
    const block = blocked(g, sn);
    const opts = Object.keys(DIRS).filter((d) => d !== OPP[sn.dir]);
    const safe = opts.filter((d) => {
      const [dx, dy] = DIRS[d];
      const x = head.x + dx;
      const y = head.y + dy;
      return inside(x, y) && !block.has(key(x, y));
    });
    if (!safe.length) return;
    const prev = new Map();
    const start = key(head.x, head.y);
    prev.set(start, null);
    const q = [head];
    const foods = new Set(g.food.map((f) => key(f.x, f.y)));
    let goal = null;
    while (q.length) {
      const p = q.shift();
      const k = key(p.x, p.y);
      if (foods.has(k) && k !== start) {
        goal = k;
        break;
      }
      for (const [dx, dy] of Object.values(DIRS)) {
        const x = p.x + dx;
        const y = p.y + dy;
        const nk = key(x, y);
        if (!inside(x, y) || block.has(nk) || prev.has(nk)) continue;
        prev.set(nk, k);
        q.push({ x, y });
      }
    }
    let choice = null;
    if (goal != null) {
      let k = goal;
      while (prev.get(k) !== start && prev.get(k) != null) k = prev.get(k);
      const nx = k % N;
      const ny = Math.floor(k / N);
      choice = Object.keys(DIRS).find((d) => DIRS[d][0] === nx - head.x && DIRS[d][1] === ny - head.y);
    }
    const room = (d) => {
      const [dx, dy] = DIRS[d];
      return floodSize({ x: head.x + dx, y: head.y + dy }, block, sn.body.length + 8);
    };
    if (!choice || !safe.includes(choice) || room(choice) < sn.body.length) {
      choice = safe.slice().sort((a, b) => room(b) - room(a))[0];
    }
    if (Math.random() < 0.07 && safe.length > 1) choice = safe[Math.floor(Math.random() * safe.length)];
    sn.next = choice;
  }
  function step() {
    const g = G;
    if (!g || g.over || g.paused) return;
    g.tick++;
    for (const sn of g.snakes) if (sn.alive && sn.ai) aiThink(g, sn);
    const heads = new Map();
    for (const sn of g.snakes) {
      if (!sn.alive) continue;
      if (sn.next !== OPP[sn.dir]) sn.dir = sn.next;
      const [dx, dy] = DIRS[sn.dir];
      heads.set(sn, { x: sn.body[0].x + dx, y: sn.body[0].y + dy });
    }
    for (const [sn, h] of heads) {
      sn.body.unshift(h);
      const fi = g.food.findIndex((f) => f.x === h.x && f.y === h.y);
      if (fi >= 0) {
        const f = g.food.splice(fi, 1)[0];
        sn.score += f.v;
        sn.grow += f.v;
        addFood(g);
        if (sn.id === "me") navigator.vibrate?.(15);
      }
      if (sn.grow > 0) sn.grow--;
      else sn.body.pop();
    }
    const dead = [];
    for (const [sn, h] of heads) {
      if (!inside(h.x, h.y)) {
        dead.push([sn, "撞墙了"]);
        continue;
      }
      if (sn.body.slice(1).some((p) => p.x === h.x && p.y === h.y)) {
        dead.push([sn, "咬到自己了"]);
        continue;
      }
      if (mode === "versus") {
        for (const o of g.snakes) {
          if (o === sn || !o.alive) continue;
          const hitIdx = o.body.findIndex((p) => p.x === h.x && p.y === h.y);
          if (hitIdx >= 0) {
            dead.push([sn, hitIdx === 0 ? `和${o.name}撞头了` : `撞到了${o.name}`]);
            break;
          }
        }
      }
    }
    for (const [sn, why] of dead) {
      sn.alive = false;
      sn.why = why;
      if (mode === "versus") for (const p of sn.body.slice(1)) if (Math.random() < 0.3 && inside(p.x, p.y)) g.food.push({ x: p.x, y: p.y, v: 1 });
    }
    const me = g.snakes[0];
    const aliveAi = g.snakes.filter((s) => s.ai && s.alive).length;
    if (!me.alive && (mode !== "team" || !aliveAi)) return finish();
    if (mode === "versus" && me.alive && !aliveAi && g.snakes.length > 1 && !g.soloOn) {
      g.soloOn = true;
      toast("角色们都挂了，你继续吃，吃到不想吃就点暂停结束");
    }
    draw();
    schedule();
  }
  function speed() {
    const len = G ? G.snakes[0].body.length : 3;
    return Math.max(75, 150 - len * 2.5);
  }
  function schedule() {
    clearTimeout(timer);
    if (G && !G.over && !G.paused) timer = setTimeout(step, speed());
  }

  /* ───── 画面 ───── */
  function draw() {
    const cv = root?.querySelector("#sn-cv");
    if (!cv || !G) return;
    const ctx = cv.getContext("2d");
    const W = cv.width;
    const c = W / N;
    ctx.fillStyle = "#fff8ec";
    ctx.fillRect(0, 0, W, W);
    ctx.fillStyle = "#fbefdc";
    for (let y = 0; y < N; y++) for (let x = y % 2; x < N; x += 2) ctx.fillRect(x * c, y * c, c, c);
    for (const f of G.food) {
      ctx.font = `${c * 0.85}px system-ui, "Apple Color Emoji", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(f.v > 1 ? "🐟" : "🍓", f.x * c + c / 2, f.y * c + c / 2 + 1);
    }
    for (const sn of G.snakes) {
      ctx.globalAlpha = sn.alive ? (mode === "team" && sn.ai ? 0.85 : 1) : 0.25;
      ctx.strokeStyle = sn.color;
      ctx.lineWidth = c * 0.78;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      sn.body.forEach((p, i) => (i ? ctx.lineTo(p.x * c + c / 2, p.y * c + c / 2) : ctx.moveTo(p.x * c + c / 2, p.y * c + c / 2)));
      ctx.stroke();
      // 身上的奶油色小斑点
      ctx.fillStyle = "rgba(255,255,255,.35)";
      sn.body.forEach((p, i) => {
        if (i && i % 3 === 0) {
          ctx.beginPath();
          ctx.arc(p.x * c + c / 2, p.y * c + c / 2, c * 0.13, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.fillStyle = sn.color;
      ctx.beginPath();
      ctx.arc(sn.body[0].x * c + c / 2, sn.body[0].y * c + c / 2, c * 0.5, 0, Math.PI * 2);
      ctx.fill();
      // 眼睛
      const h = sn.body[0];
      const [dx, dy] = DIRS[sn.dir];
      const ex = h.x * c + c / 2;
      const ey = h.y * c + c / 2;
      const px = -dy * c * 0.2;
      const py = dx * c * 0.2;
      for (const s of [1, -1]) {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(ex + px * s + dx * c * 0.12, ey + py * s + dy * c * 0.12, c * 0.14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#3a2a2a";
        ctx.beginPath();
        ctx.arc(ex + px * s + dx * c * 0.17, ey + py * s + dy * c * 0.17, c * 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
      // 名字
      if (G.snakes.length > 1) {
        ctx.globalAlpha = sn.alive ? 0.9 : 0.3;
        ctx.font = `600 ${Math.max(10, c * 0.5)}px system-ui, sans-serif`;
        ctx.fillStyle = "#5a4636";
        ctx.textAlign = "center";
        ctx.fillText(sn.name.slice(0, 6), ex, ey - c * 0.85);
      }
      ctx.globalAlpha = 1;
    }
    const hud = root.querySelector("#sn-hud");
    if (hud) {
      const team = G.snakes.reduce((n, s) => n + s.score, 0);
      hud.innerHTML =
        mode === "team"
          ? `<b>队伍 ${team}</b>${G.snakes.map((s) => `<span style="color:${s.color}">●</span>${esc(s.name)} ${s.score}${s.alive ? "" : "💤"}`).join(" ")}`
          : G.snakes.map((s) => `<span style="color:${s.color}">●</span><b>${esc(s.name)}</b> ${s.score}${s.alive ? "" : "💤"}`).join("　");
    }
  }

  function drawMenu() {
    clearTimeout(timer);
    G = null;
    if (!root) return;
    root.innerHTML = `<div class="sn-menu">
      <div class="mlm-logo">🐍<span>贪吃蛇</span></div>
      <div class="sn-modes">${Object.entries(MODES).map(([k, m]) => `<button type="button" class="${mode === k ? "is-on" : ""}" data-mode="${k}"><b>${m.name}</b><small>${m.desc}</small>${best[k] ? `<em>最高 ${best[k]}</em>` : ""}</button>`).join("")}</div>
      ${
        mode === "solo"
          ? ""
          : `<div class="sn-picked">${picked.length ? picked.map((c, i) => `<span class="fun-chip"><i style="background:${COLORS[i + 1]}"></i>${esc(c.name)}</span>`).join("") : `<p class="fun-note">还没选角色</p>`}<button type="button" class="fun-btn ghost sm" data-a="pick">选角色（最多 3 位）</button></div>`
      }
      <button type="button" class="fun-btn solid wide" data-a="go">开始</button>
      <button type="button" class="gh-net sn-net" data-a="net"><span>🌐</span><div><b>和联机好友一起玩</b><small>在联机聊天里点 🎲 选「贪吃蛇 · 比分」各自比分，或「贪吃蛇 · 组队」大家的分数加起来过关；好友带来的角色也会一起</small></div><i>›</i></button>
      <p class="fun-note">滑动屏幕、点方向键或者用键盘方向键 / WASD 控制。🍓 加 1 分，🐟 加 3 分。</p>
    </div>`;
  }
  async function start() {
    const user = await F.loadUser();
    if (mode !== "solo" && !picked.length) {
      const cast = await F.loadCast();
      if (!cast.length) {
        toast("角色库里没有角色，先玩单人吧");
        mode = "solo";
      } else picked = cast.slice(0, 1);
    }
    G = build(user);
    root.innerHTML = `<div class="sn-game">
      <div class="sn-top"><button type="button" class="fun-btn ghost sm" data-a="menu">‹</button><div class="sn-hud" id="sn-hud"></div><button type="button" class="fun-btn ghost sm" data-a="pause">⏸</button></div>
      <canvas id="sn-cv" class="sn-cv"></canvas>
      <div class="sn-pad"><button type="button" data-d="up">▲</button><button type="button" data-d="left">◀</button><button type="button" data-d="down">▼</button><button type="button" data-d="right">▶</button></div>
    </div>`;
    const cv = root.querySelector("#sn-cv");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.min(cv.clientWidth || 340, 520);
    cv.width = Math.round(w * dpr);
    cv.height = cv.width;
    let sx = 0;
    let sy = 0;
    cv.addEventListener("pointerdown", (e) => {
      sx = e.clientX;
      sy = e.clientY;
    });
    cv.addEventListener("pointerup", (e) => {
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
      turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
    });
    cv.style.touchAction = "none";
    draw();
    G.paused = true;
    countdown(3);
  }
  function countdown(n) {
    const cv = root?.querySelector("#sn-cv");
    if (!cv || !G) return;
    draw();
    if (n <= 0) {
      G.paused = false;
      return schedule();
    }
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "rgba(255,248,236,.6)";
    ctx.fillRect(0, 0, cv.width, cv.width);
    ctx.fillStyle = "#c4664a";
    ctx.font = `800 ${cv.width / 4}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(n), cv.width / 2, cv.width / 2);
    setTimeout(() => countdown(n - 1), 600);
  }
  function turn(d) {
    if (!G || G.over) return;
    const me = G.snakes[0];
    if (!me.alive || d === OPP[me.dir]) return;
    me.next = d;
  }
  function finish() {
    const g = G;
    if (!g || g.over) return;
    g.over = true;
    clearTimeout(timer);
    draw();
    const me = g.snakes[0];
    const team = g.snakes.reduce((n, s) => n + s.score, 0);
    const mine = mode === "team" ? team : me.score;
    const rec = mine > (best[mode] || 0);
    if (rec) {
      best[mode] = mine;
      saveBest();
    }
    // 联机比分挑战：把成绩交回去
    try {
      window.XXJ_NET?.reportScore?.("贪吃蛇", me.score, `${me.score} 分`);
    } catch (_) {
      /* ignore */
    }
    // 分数高的排前面；同分时活到最后的排前面
    const rank = g.snakes.slice().sort((a, b) => b.score - a.score || Number(b.alive) - Number(a.alive));
    const topScore = rank[0].score;
    const tie = rank.filter((x) => x.score === topScore).length > 1 && !rank.some((x) => x.alive && x.score === topScore && !rank.some((y) => y !== x && y.score === topScore && y.alive));
    const iWin = rank[0] === me && !tie;
    const title =
      mode === "team" ? `队伍一共 ${team} 分` : mode === "versus" ? (tie ? "平局！" : iWin ? "你赢啦 🎉" : `${rank[0].name} 赢了`) : `${me.score} 分`;
    const sh = F.openSheet(
      `<div class="mlm-end">${mode === "versus" ? (iWin ? "🏆" : tie ? "🤝" : "😿") : rec ? "🏆" : "🐍"}<h3>${esc(title)}</h3><p>${esc(me.why || "")}${rec ? " · 新纪录！" : best[mode] ? ` · 最高 ${best[mode]}` : ""}</p></div>
       ${g.snakes.length > 1 ? `<div class="sn-rank">${rank.map((s, i) => `<p><span style="color:${s.color}">●</span> ${i + 1}. ${esc(s.name)} <b>${s.score}</b></p>`).join("")}</div>` : ""}
       <div class="sn-say" id="sn-say"></div>
       <div class="fun-sheet-actions"><button type="button" class="fun-btn solid" data-e="retry">再来</button><button type="button" class="fun-btn ghost" data-e="menu">换模式</button></div>`,
      { title: "贪吃蛇" }
    );
    sh.body.addEventListener("click", (e) => {
      const a = e.target.closest("[data-e]")?.dataset.e;
      if (!a) return;
      sh.close();
      if (!root) return;
      if (a === "retry") start();
      else drawMenu();
    });
    // 角色说一句
    const ch = picked[0];
    if (mode !== "solo" && ch && F.hasApiKey()) {
      const box = sh.body.querySelector("#sn-say");
      box.innerHTML = `<p class="fun-note">${esc(ch.name)} 在想说什么…</p>`;
      const res = g.snakes.map((s) => `${s.name} ${s.score} 分${s.alive ? "" : "（" + s.why + "）"}`).join("，");
      F.aiText(
        [
          { role: "system", content: `你是「${ch.name}」。${ch.persona ? "人设：\n" + ch.persona + "\n" : ""}你刚和对方${mode === "team" ? "组队" : "对战"}玩了一局贪吃蛇。按人设说一两句真实的反应（可以得意、撒娇、不服气、夸对方），口语，不要加名字前缀。` },
          { role: "user", content: `结果：${res}。${mode === "team" ? `队伍一共 ${team} 分。` : ""}` }
        ],
        { maxTokens: 200, temperature: 0.95 }
      )
        .then((t) => {
          if (box.isConnected) box.innerHTML = `<div class="wx-say">${F.avHtml(ch, "fun-av sm")}<p><b>${esc(ch.name)}</b>：${esc(F.cleanLine(t, 160, ch.name))}</p></div>`;
        })
        .catch(() => {
          if (box.isConnected) box.innerHTML = "";
        });
    }
  }

  async function pickChars() {
    const cast = await F.loadCast();
    if (!cast.length) return toast("角色库里还没有角色");
    const r = await F.pickCast(cast, { min: 1, max: 3, preselect: picked.map((p) => p.id), title: "和谁一起玩？（最多 3 位）" });
    if (r) {
      picked = r;
      drawMenu();
    }
  }

  function onClick(e) {
    const md = e.target.closest("[data-mode]");
    if (md) {
      mode = md.dataset.mode;
      return drawMenu();
    }
    const d = e.target.closest("[data-d]");
    if (d) return turn(d.dataset.d);
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "pick") return void pickChars();
    if (a === "go") return void start();
    if (a === "net") return F.open("联机");
    if (a === "menu") return drawMenu();
    if (a === "pause" && G && !G.over) {
      G.paused = !G.paused;
      e.target.closest("[data-a]").textContent = G.paused ? "▶" : "⏸";
      if (!G.paused) schedule();
      else {
        const sh = F.openSheet(`<div class="fun-sheet-actions"><button type="button" class="fun-btn solid" data-p="go">继续</button><button type="button" class="fun-btn ghost" data-p="end">结束这局</button></div>`, { title: "暂停中" });
        sh.body.addEventListener("click", (ev) => {
          const p = ev.target.closest("[data-p]")?.dataset.p;
          if (!p) return;
          sh.close();
          if (!G) return;
          if (p === "go") {
            G.paused = false;
            const pb = root?.querySelector("[data-a=pause]");
            if (pb) pb.textContent = "⏸";
            schedule();
          } else {
            G.snakes[0].alive = false;
            G.snakes[0].why = "主动结束";
            finish();
          }
        });
      }
    }
  }
  function onKey(e) {
    if (!root || !G) return;
    const m = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right" }[e.key];
    if (m) {
      e.preventDefault();
      turn(m);
    }
  }

  F.register("贪吃蛇", {
    title: "贪吃蛇",
    kicker: "SNAKE",
    async mount(body) {
      root = document.createElement("div");
      root.className = "sn-root";
      body.appendChild(root);
      root.addEventListener("click", onClick);
      document.addEventListener("keydown", onKey);
      drawMenu();
    },
    unmount() {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
      G = null;
      root = null;
    }
  });
})();
