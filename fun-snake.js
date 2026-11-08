"use strict";

/**
 * 小馋猫（原贪吃蛇）
 * - 几只小猫在一块地板上抢吃的，限时 60 秒，看谁抢得多
 * - 单人：自己抢，刷新纪录
 * - 组队：和角色一起抢，分数加在一起
 * - 对战：和角色比谁抢得多（角色由电脑控制，会偶尔走神）
 * - 撞到别的猫会被挤开、愣一下；抢到 🐟 加 1，🍤 加 2，偶尔出现的金色 🍗 加 5（一会儿就消失）
 * - 和联机好友一起玩：在「联机」里开「小馋猫 · 比分 / 组队」，每人在自己手机上玩一局，成绩自动交回群里
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast } = F;
  const N = 13; // 格子数
  const ROUND = 60; // 秒
  const BEST_KEY = "meowos_snake_best";
  const COLORS = ["#f2a65a", "#8fc5f2", "#c9a7f2", "#7fd1a8", "#f4a7b9"];
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const FOODS = [
    { e: "🐟", v: 1, w: 70 },
    { e: "🍤", v: 2, w: 25 },
    { e: "🍗", v: 5, w: 0, gold: true }
  ];

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
    solo: { name: "单人", desc: `${ROUND} 秒里能抢到多少吃的` },
    team: { name: "组队", desc: "和角色一起抢，分数加在一起" },
    versus: { name: "对战", desc: "和角色比谁抢得多，撞到会被挤开" }
  };

  /* ───── 游戏逻辑 ───── */
  const key = (x, y) => y * N + x;
  const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  function newCat(id, name, color, x, y, dir, ai) {
    return { id, name, color, x, y, px: x, py: y, dir, next: dir, moving: !ai, score: 0, ai, stun: 0, eat: 0, lazy: 0 };
  }
  function build(user) {
    const starts = [
      [2, 6, "right"],
      [10, 6, "left"],
      [6, 2, "down"],
      [6, 10, "up"]
    ];
    const cats = [newCat("me", user.name || "我", COLORS[0], ...starts[0], false)];
    if (mode !== "solo") picked.slice(0, 3).forEach((c, i) => cats.push(newCat(c.id, c.name, COLORS[i + 1], ...starts[i + 1], true)));
    const g = { cats, food: [], tick: 0, over: false, paused: false, left: ROUND * 1000, last: 0, pops: [] };
    const nf = 3 + cats.length;
    for (let i = 0; i < nf; i++) addFood(g);
    return g;
  }
  function addFood(g, gold) {
    const occ = new Set();
    g.cats.forEach((c) => occ.add(key(c.x, c.y)));
    g.food.forEach((f) => occ.add(key(f.x, f.y)));
    const total = FOODS.reduce((n, f) => n + f.w, 0);
    let r = Math.random() * total;
    let kind = FOODS[0];
    if (gold) kind = FOODS[2];
    else
      for (const f of FOODS) {
        if (r < f.w) {
          kind = f;
          break;
        }
        r -= f.w;
      }
    for (let t = 0; t < 300; t++) {
      const x = Math.floor(Math.random() * N);
      const y = Math.floor(Math.random() * N);
      if (!occ.has(key(x, y))) {
        g.food.push({ x, y, e: kind.e, v: kind.v, gold: !!kind.gold, ttl: kind.gold ? 20 : 0 });
        return;
      }
    }
  }
  /** 电脑控制的小猫：去离自己最近、而且别人没自己近的吃的 */
  function aiThink(g, c) {
    if (!g.food.length) return;
    const dist = (a, f) => Math.abs(a.x - f.x) + Math.abs(a.y - f.y);
    let bestF = null;
    let bestS = Infinity;
    for (const f of g.food) {
      const d = dist(c, f);
      const rival = Math.min(...g.cats.filter((o) => o !== c && (mode !== "team" || !o.ai)).map((o) => dist(o, f)), 99);
      // 金鸡腿很香；别人明显更近的就不去抢了
      const s = d - f.v * 1.6 + (rival < d ? 4 : 0);
      if (s < bestS) {
        bestS = s;
        bestF = f;
      }
    }
    const dx = bestF.x - c.x;
    const dy = bestF.y - c.y;
    let d;
    if (dx && dy) d = Math.random() < Math.abs(dx) / (Math.abs(dx) + Math.abs(dy)) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    else if (dx) d = dx > 0 ? "right" : "left";
    else d = dy > 0 ? "down" : "up";
    if (Math.random() < 0.08) d = Object.keys(DIRS)[Math.floor(Math.random() * 4)];
    c.next = d;
    c.moving = true;
  }
  function step() {
    const g = G;
    if (!g || g.over || g.paused) return;
    const now = performance.now();
    if (g.last) g.left -= now - g.last;
    g.last = now;
    if (g.left <= 0) {
      g.left = 0;
      return finish();
    }
    g.tick++;
    for (const c of g.cats) {
      c.px = c.x;
      c.py = c.y;
      if (c.eat) c.eat--;
    }
    for (const c of g.cats) if (c.ai) aiThink(g, c);
    // 先算每只猫想去哪
    const want = new Map();
    for (const c of g.cats) {
      if (c.stun > 0) {
        c.stun--;
        continue;
      }
      if (c.ai && Math.random() < 0.3) continue; // 偶尔走神，给你留点机会
      c.dir = c.next;
      if (!c.moving) continue;
      const [dx, dy] = DIRS[c.dir];
      const x = c.x + dx;
      const y = c.y + dy;
      if (!inside(x, y)) continue; // 撞墙就停在边上
      want.set(c, { x, y });
    }
    // 两只猫抢同一个格子 / 撞到别的猫：随机一只挤过去，另一只被挤开愣一下
    for (const [c, p] of want) {
      const rivals = [...want].filter(([o, q]) => o !== c && q.x === p.x && q.y === p.y).map(([o]) => o);
      if (rivals.length) {
        const all = [c, ...rivals];
        const win = all[Math.floor(Math.random() * all.length)];
        for (const o of all) if (o !== win) want.delete(o), (o.stun = mode === "team" ? 0 : 2);
      }
    }
    for (const [c, p] of want) {
      const sitter = g.cats.find((o) => o !== c && o.x === p.x && o.y === p.y && !want.has(o));
      if (sitter) {
        if (mode !== "team") c.stun = 1;
        continue;
      }
      c.x = p.x;
      c.y = p.y;
    }
    // 吃
    for (const c of g.cats) {
      const fi = g.food.findIndex((f) => f.x === c.x && f.y === c.y);
      if (fi < 0) continue;
      const f = g.food.splice(fi, 1)[0];
      c.score += f.v;
      c.eat = 3;
      g.pops.push({ x: f.x, y: f.y, t: `+${f.v}`, color: c.color, life: 6 });
      if (c.id === "me") navigator.vibrate?.(f.gold ? 40 : 15);
      if (!f.gold) addFood(g);
    }
    // 金鸡腿会过期
    g.food = g.food.filter((f) => !f.gold || --f.ttl > 0);
    if (!g.food.some((f) => f.gold) && Math.random() < 0.025) {
      addFood(g, true);
      if (g.cats.length > 1 || Math.random() < 0.5) toast("🍗 金鸡腿出现啦！+5");
    }
    g.pops = g.pops.filter((p) => --p.life > 0);
    draw();
    schedule();
  }
  const SPEED = 260;
  function schedule() {
    clearTimeout(timer);
    if (G && !G.over && !G.paused) timer = setTimeout(step, SPEED);
  }

  /* ───── 画面 ───── */
  function drawCat(ctx, cat, cx, cy, r) {
    const [dx] = DIRS[cat.dir];
    ctx.save();
    ctx.translate(cx, cy);
    if (cat.stun > 0) ctx.rotate(Math.sin(G.tick * 2) * 0.25);
    // 尾巴
    ctx.strokeStyle = cat.color;
    ctx.lineWidth = r * 0.28;
    ctx.lineCap = "round";
    ctx.beginPath();
    const tx = dx > 0 ? -1 : 1;
    ctx.moveTo(tx * r * 0.6, r * 0.45);
    ctx.quadraticCurveTo(tx * r * 1.25, r * 0.3, tx * r * 1.05, -r * 0.35 + Math.sin(G.tick * 0.8) * r * 0.12);
    ctx.stroke();
    // 身体 + 头
    ctx.fillStyle = cat.color;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.38, r * 0.72, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -r * 0.12, r * 0.62, 0, Math.PI * 2);
    ctx.fill();
    // 耳朵
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.58, -r * 0.3);
      ctx.lineTo(s * r * 0.52, -r * 0.98);
      ctx.lineTo(s * r * 0.12, -r * 0.66);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,190,190,.8)";
      ctx.beginPath();
      ctx.moveTo(s * r * 0.48, -r * 0.42);
      ctx.lineTo(s * r * 0.46, -r * 0.82);
      ctx.lineTo(s * r * 0.22, -r * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = cat.color;
    }
    // 脸：吃到东西时眯眼笑，被挤开时晕
    const ey = -r * 0.16;
    const ex = r * 0.24;
    const lookX = dx * r * 0.06;
    ctx.strokeStyle = "#3a2a2a";
    ctx.fillStyle = "#3a2a2a";
    ctx.lineWidth = Math.max(1.2, r * 0.07);
    for (const s of [-1, 1]) {
      const x = s * ex + lookX;
      if (cat.eat) {
        ctx.beginPath();
        ctx.arc(x, ey + r * 0.04, r * 0.09, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      } else if (cat.stun > 0) {
        ctx.beginPath();
        ctx.moveTo(x - r * 0.08, ey - r * 0.08);
        ctx.lineTo(x + r * 0.08, ey + r * 0.08);
        ctx.moveTo(x + r * 0.08, ey - r * 0.08);
        ctx.lineTo(x - r * 0.08, ey + r * 0.08);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(x, ey, r * 0.085, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(x + r * 0.03, ey - r * 0.03, r * 0.03, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#3a2a2a";
      }
    }
    // 鼻子嘴巴
    ctx.fillStyle = "#e88a8a";
    ctx.beginPath();
    ctx.arc(lookX, ey + r * 0.17, r * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3a2a2a";
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.beginPath();
    ctx.arc(lookX - r * 0.07, ey + r * 0.22, r * 0.07, 0, Math.PI * (cat.eat ? 1 : 0.8));
    ctx.arc(lookX + r * 0.07, ey + r * 0.22, r * 0.07, Math.PI * (cat.eat ? 0 : 0.2), Math.PI);
    ctx.stroke();
    // 腮红
    ctx.fillStyle = "rgba(255,140,140,.35)";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * r * 0.36 + lookX, ey + r * 0.2, r * 0.1, r * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
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
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const f of G.food) {
      if (f.gold) {
        ctx.fillStyle = `rgba(255,214,90,${0.35 + 0.25 * Math.sin(G.tick)})`;
        ctx.beginPath();
        ctx.arc(f.x * c + c / 2, f.y * c + c / 2, c * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = `${c * 0.72}px system-ui, "Apple Color Emoji", sans-serif`;
      ctx.fillText(f.e, f.x * c + c / 2, f.y * c + c / 2 + 1);
    }
    for (const cat of G.cats) {
      drawCat(ctx, cat, cat.x * c + c / 2, cat.y * c + c / 2 + c * 0.05, c * 0.48);
      if (G.cats.length > 1) {
        ctx.font = `600 ${Math.max(10, c * 0.32)}px system-ui, sans-serif`;
        ctx.fillStyle = "#5a4636";
        ctx.fillText(cat.name.slice(0, 6), cat.x * c + c / 2, cat.y * c - c * 0.12 < 6 ? cat.y * c + c * 1.05 : cat.y * c - c * 0.12);
      }
    }
    for (const p of G.pops) {
      ctx.globalAlpha = Math.min(1, p.life / 4);
      ctx.font = `800 ${c * 0.42}px system-ui, sans-serif`;
      ctx.fillStyle = p.color;
      ctx.fillText(p.t, p.x * c + c / 2, p.y * c - (6 - p.life) * c * 0.08);
      ctx.globalAlpha = 1;
    }
    const hud = root.querySelector("#sn-hud");
    if (hud) {
      const sec = Math.ceil(G.left / 1000);
      const team = G.cats.reduce((n, s) => n + s.score, 0);
      hud.innerHTML =
        `<b style="margin-right:6px;color:${sec <= 10 ? "#e0533d" : "inherit"}">⏱ ${sec}s</b>` +
        (mode === "team"
          ? `<b>队伍 ${team}</b>${G.cats.map((s) => `<span style="color:${s.color}">●</span>${esc(s.name)} ${s.score}`).join(" ")}`
          : G.cats.map((s) => `<span style="color:${s.color}">●</span><b>${esc(s.name)}</b> ${s.score}`).join("　"));
    }
  }

  function drawMenu() {
    clearTimeout(timer);
    G = null;
    if (!root) return;
    root.innerHTML = `<div class="sn-menu">
      <div class="mlm-logo">😼<span>小馋猫</span></div>
      <p class="fun-note" style="text-align:center;margin:-4px 0 4px">小猫们抢吃的，${ROUND} 秒后看谁抢得多</p>
      <div class="sn-modes">${Object.entries(MODES).map(([k, m]) => `<button type="button" class="${mode === k ? "is-on" : ""}" data-mode="${k}"><b>${m.name}</b><small>${m.desc}</small>${best[k] ? `<em>最高 ${best[k]}</em>` : ""}</button>`).join("")}</div>
      ${
        mode === "solo"
          ? ""
          : `<div class="sn-picked">${picked.length ? picked.map((c, i) => `<span class="fun-chip"><i style="background:${COLORS[i + 1]}"></i>${esc(c.name)}</span>`).join("") : `<p class="fun-note">还没选角色</p>`}<button type="button" class="fun-btn ghost sm" data-a="pick">选角色（最多 3 位）</button></div>`
      }
      <button type="button" class="fun-btn solid wide" data-a="go">开抢</button>
      <button type="button" class="gh-net sn-net" data-a="net"><span>🌐</span><div><b>和联机好友一起玩</b><small>在联机聊天里点 🎲 选「小馋猫 · 比分」各自比谁抢得多，或「小馋猫 · 组队」大家的分数加起来过关；好友带来的角色也会一起</small></div><i>›</i></button>
      <p class="fun-note">滑动屏幕、点方向键或者用键盘方向键 / WASD 控制小猫跑。🐟 +1，🍤 +2，金色 🍗 +5（一会儿就不见）。撞到别的猫会被挤开晕一下。</p>
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
      G.last = performance.now();
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
    const me = G.cats[0];
    me.next = d;
    me.moving = true;
  }
  function finish() {
    const g = G;
    if (!g || g.over) return;
    g.over = true;
    clearTimeout(timer);
    draw();
    const me = g.cats[0];
    const team = g.cats.reduce((n, s) => n + s.score, 0);
    const mine = mode === "team" ? team : me.score;
    const rec = !g.quit && mine > (best[mode] || 0);
    if (rec) {
      best[mode] = mine;
      saveBest();
    }
    // 联机比分挑战：把成绩交回去
    try {
      window.XXJ_NET?.reportScore?.("小馋猫", me.score, `抢到 ${me.score} 分`);
    } catch (_) {
      /* ignore */
    }
    const rank = g.cats.slice().sort((a, b) => b.score - a.score);
    const tie = rank.length > 1 && rank[0].score === rank[1].score;
    const iWin = rank[0] === me && !tie;
    const title =
      mode === "team" ? `队伍一共抢到 ${team} 分` : mode === "versus" ? (tie ? "平局！" : iWin ? "你抢得最多 🎉" : `${rank[0].name} 抢得最多`) : `抢到 ${me.score} 分`;
    const sh = F.openSheet(
      `<div class="mlm-end">${mode === "versus" ? (iWin ? "🏆" : tie ? "🤝" : "😿") : rec ? "🏆" : "😸"}<h3>${esc(title)}</h3><p>${g.quit ? "提前结束" : "时间到"}${rec ? " · 新纪录！" : best[mode] ? ` · 最高 ${best[mode]}` : ""}</p></div>
       ${g.cats.length > 1 ? `<div class="sn-rank">${rank.map((s, i) => `<p><span style="color:${s.color}">●</span> ${i + 1}. ${esc(s.name)} <b>${s.score}</b></p>`).join("")}</div>` : ""}
       <div class="sn-say" id="sn-say"></div>
       <div class="fun-sheet-actions"><button type="button" class="fun-btn solid" data-e="retry">再来</button><button type="button" class="fun-btn ghost" data-e="menu">换模式</button></div>`,
      { title: "小馋猫" }
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
      const res = g.cats.map((s) => `${s.name} ${s.score} 分`).join("，");
      F.aiText(
        [
          { role: "system", content: `你是「${ch.name}」。${ch.persona ? "人设：\n" + ch.persona + "\n" : ""}你们刚${mode === "team" ? "组队" : "比赛"}玩了一局「小馋猫」：大家各自扮成小猫在地板上抢吃的，看谁抢得多。按人设说一两句真实的反应（可以得意、撒娇、不服气、夸对方），口语，不要加名字前缀。` },
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
    const r = await F.pickCast(cast, { min: 1, max: 3, preselect: picked.map((p) => p.id), title: "和谁一起抢？（最多 3 位）" });
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
      G.paused = true;
      e.target.closest("[data-a]").textContent = "▶";
      const sh = F.openSheet(`<div class="fun-sheet-actions"><button type="button" class="fun-btn solid" data-p="go">继续</button><button type="button" class="fun-btn ghost" data-p="end">结束这局</button></div>`, { title: "暂停中" });
      sh.body.addEventListener("click", (ev) => {
        const p = ev.target.closest("[data-p]")?.dataset.p;
        if (!p) return;
        sh.close();
        if (!G) return;
        if (p === "go") {
          G.paused = false;
          G.last = performance.now();
          const pb = root?.querySelector("[data-a=pause]");
          if (pb) pb.textContent = "⏸";
          schedule();
        } else {
          G.quit = true;
          finish();
        }
      });
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

  const app = {
    title: "小馋猫",
    kicker: "GREEDY KITTY",
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
  };
  F.register("小馋猫", app);
  // 旧入口（桌面图标 / 旧链接）也能打开
  F.register("贪吃蛇", app);
})();
