"use strict";

/**
 * 游戏厅 · 单人小游戏
 *   - 喵了个喵：叠层消除，点没被压住的牌放进下面的 7 格槽，凑够 3 张一样的就消掉；槽满就输
 *   - 猫爪琴键：只点黑块，别点白块、别漏掉；越弹越快，弹的时候会放出旋律
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast } = F;

  const BEST_KEY = "arcade_best_v1";
  let best = {};
  const loadBest = async () => {
    try {
      best = (await F.FunDB.get(BEST_KEY)) || {};
    } catch (_) {
      best = {};
    }
  };
  const saveBest = () => F.FunDB.set(BEST_KEY, best).catch(() => {});

  /* ═════════════ 喵了个喵 ═════════════ */
  (function () {
    const ICONS = ["🐟", "🧶", "🐾", "🥛", "🐭", "🎀", "🍤", "🌸", "🔔", "🍓", "🧁", "🐱", "🦴", "🪶", "🍥", "🌙"];
    const LEVELS = [
      { name: "第 1 关", sub: "热热身", cols: 6, rows: 6, layers: 2, types: 4, per: 6, piles: 0 },
      { name: "第 2 关", sub: "有点难", cols: 7, rows: 7, layers: 4, types: 6, per: 9, piles: 2 },
      { name: "第 3 关", sub: "地狱喵", cols: 7, rows: 8, layers: 7, types: 10, per: 12, piles: 2 }
    ];
    const SLOT_MAX = 7;
    let root = null;
    let G = null;

    function build(lv) {
      const L = LEVELS[lv];
      // 先摆位置
      const spots = [];
      for (let z = 0; z < L.layers; z++) {
        const off = z % 2 ? 0.5 : 0; // 奇数层错开半格，压住下面
        const cw = L.cols - (off ? 1 : 0);
        const rh = L.rows - (off ? 1 : 0);
        const shrink = Math.min(Math.floor(z / 3), 2); // 越往上越集中
        for (let y = shrink; y < rh - shrink; y++)
          for (let x = shrink; x < cw - shrink; x++) if (Math.random() < 0.62 - z * 0.02) spots.push({ x: x + off, y: y + off, z });
      }
      // 两侧的牌堆
      for (let p = 0; p < L.piles; p++) {
        const px = p === 0 ? 0.6 : L.cols - 1.6;
        for (let i = 0; i < 9; i++) spots.push({ x: px + (p === 0 ? i * 0.07 : -i * 0.07), y: L.rows + 0.35, z: 20 + i, pile: true });
      }
      // 总数凑成 3 的倍数，并且每种图案都是 3 的倍数
      const total = Math.min(spots.length - (spots.length % 3), L.types * L.per);
      spots.sort((a, b) => a.z - b.z);
      // 优先保留上层和牌堆，去掉多出来的底层
      while (spots.length > total) spots.splice(Math.floor(Math.random() * Math.min(spots.length, 20)), 1);
      const kinds = [];
      for (let i = 0; kinds.length < spots.length; i++) {
        const k = i % L.types;
        kinds.push(k, k, k);
      }
      kinds.length = spots.length;
      for (let i = kinds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
      }
      const tiles = spots.map((s, i) => ({ id: i, ...s, k: kinds[i], gone: false }));
      return { lv, L, tiles, slot: [], out: [], hist: [], props: { out: 1, undo: 1, shuffle: 1 }, t0: Date.now(), over: false, cleared: 0 };
    }
    const covered = (t) => G.tiles.some((o) => !o.gone && !o.inSlot && !o.inOut && o.z > t.z && Math.abs(o.x - t.x) < 0.98 && Math.abs(o.y - t.y) < 0.98);

    function drawMenu() {
      if (!root) return;
      root.innerHTML = `<div class="mlm-menu"><div class="mlm-logo">🐱<span>喵了个喵</span></div>
        <p class="fun-note">点<b>没被压住</b>的牌放进下面的槽里，凑齐 3 张一样的就会消掉。槽里放满 7 张就输了。每关有一次「移出」「撤回」「洗牌」可以用。</p>
        <div class="mlm-levels">${LEVELS.map((l, i) => `<button type="button" data-lv="${i}"><strong>${l.name}</strong><small>${l.sub}${best["mlm" + i] ? ` · 最快 ${best["mlm" + i]} 秒` : ""}</small></button>`).join("")}</div></div>`;
    }
    function draw() {
      if (!root || !G) return;
      const L = G.L;
      const boardRows = L.rows + (L.piles ? 1.5 : 0);
      const wrapW = Math.min(root.clientWidth || 360, 460) - 8;
      const cell = Math.floor(wrapW / (L.cols + 0.2));
      const left = G.tiles.filter((t) => !t.gone && !t.inSlot).length;
      root.innerHTML = `<div class="mlm">
        <div class="mlm-top"><button type="button" class="fun-btn ghost sm" data-a="menu">‹ 选关</button><strong>${L.name}</strong><small>还剩 ${left} 张</small></div>
        <div class="mlm-board" style="width:${cell * L.cols}px;height:${Math.ceil(cell * boardRows) + 4}px;--c:${cell}px">${G.tiles
          .filter((t) => !t.gone && !t.inSlot && !t.inOut)
          .map((t) => {
            const cov = covered(t);
            return `<button type="button" class="mlm-tile${cov ? " is-cov" : ""}" data-t="${t.id}" style="left:${t.x * cell}px;top:${t.y * cell}px;z-index:${t.z + 1}" ${cov ? "disabled" : ""}>${ICONS[t.k]}</button>`;
          })
          .join("")}</div>
        <div class="mlm-out">${G.out.map((t) => `<button type="button" class="mlm-tile" data-o="${t.id}">${ICONS[t.k]}</button>`).join("")}</div>
        <div class="mlm-slot">${Array.from({ length: SLOT_MAX }, (_, i) => {
          const t = G.slot[i];
          return `<span class="mlm-cell">${t ? `<b class="mlm-tile in">${ICONS[t.k]}</b>` : ""}</span>`;
        }).join("")}</div>
        <div class="mlm-props">
          <button type="button" data-p="out" ${G.props.out ? "" : "disabled"}>⤴ 移出 3 张</button>
          <button type="button" data-p="undo" ${G.props.undo && G.hist.length ? "" : "disabled"}>↶ 撤回</button>
          <button type="button" data-p="shuffle" ${G.props.shuffle ? "" : "disabled"}>🔀 洗牌</button>
        </div></div>`;
    }
    function putInSlot(t) {
      // 放到同样图案的后面
      let at = G.slot.length;
      for (let i = G.slot.length - 1; i >= 0; i--)
        if (G.slot[i].k === t.k) {
          at = i + 1;
          break;
        }
      G.slot.splice(at, 0, t);
      t.inSlot = true;
      const same = G.slot.filter((x) => x.k === t.k);
      if (same.length >= 3) {
        const kill = same.slice(0, 3);
        G.slot = G.slot.filter((x) => !kill.includes(x));
        kill.forEach((x) => {
          x.gone = true;
          x.inSlot = false;
        });
        G.hist = []; // 消掉之后不能撤回
        G.cleared += 3;
      }
    }
    function check() {
      const left = G.tiles.filter((t) => !t.gone).length;
      if (!left) {
        G.over = true;
        const sec = Math.round((Date.now() - G.t0) / 1000);
        const k = "mlm" + G.lv;
        const rec = !best[k] || sec < best[k];
        if (rec) {
          best[k] = sec;
          saveBest();
        }
        setTimeout(() => endSheet(true, sec, rec), 250);
        return;
      }
      if (G.slot.length >= SLOT_MAX) {
        G.over = true;
        setTimeout(() => endSheet(false), 250);
      }
    }
    function endSheet(win, sec, rec) {
      const sh = F.openSheet(
        win
          ? `<div class="mlm-end">🎉<h3>通关啦！</h3><p>用时 ${sec} 秒${rec ? " · 新纪录！" : ""}</p></div><div class="fun-sheet-actions">${G.lv < LEVELS.length - 1 ? `<button type="button" class="fun-btn solid" data-e="next">下一关</button>` : ""}<button type="button" class="fun-btn ghost" data-e="menu">选关</button></div>`
          : `<div class="mlm-end">😿<h3>槽满啦</h3><p>消掉了 ${G.cleared} 张，再来一次吧</p></div><div class="fun-sheet-actions"><button type="button" class="fun-btn solid" data-e="retry">再来</button><button type="button" class="fun-btn ghost" data-e="menu">选关</button></div>`,
        { title: "喵了个喵" }
      );
      sh.body.addEventListener("click", (e) => {
        const a = e.target.closest("[data-e]")?.dataset.e;
        if (!a) return;
        sh.close();
        if (a === "next") start(G.lv + 1);
        if (a === "retry") start(G.lv);
        if (a === "menu") {
          G = null;
          drawMenu();
        }
      });
    }
    function start(lv) {
      G = build(lv);
      draw();
    }
    function onClick(e) {
      const lvb = e.target.closest("[data-lv]");
      if (lvb) return start(Number(lvb.dataset.lv));
      if (!G) return;
      if (e.target.closest("[data-a=menu]")) {
        G = null;
        return drawMenu();
      }
      if (G.over) return;
      const tb = e.target.closest("[data-t]");
      const ob = e.target.closest("[data-o]");
      const pb = e.target.closest("[data-p]");
      if (tb) {
        const t = G.tiles.find((x) => x.id === Number(tb.dataset.t));
        if (!t || t.gone || t.inSlot || covered(t)) return;
        G.hist.push(t);
        putInSlot(t);
      } else if (ob) {
        const t = G.out.find((x) => x.id === Number(ob.dataset.o));
        if (!t) return;
        G.out = G.out.filter((x) => x !== t);
        t.inOut = false;
        putInSlot(t);
      } else if (pb) {
        const p = pb.dataset.p;
        if (!G.props[p]) return;
        if (p === "out") {
          if (!G.slot.length) return toast("槽里还没有牌");
          const take = G.slot.splice(0, 3);
          take.forEach((t) => {
            t.inSlot = false;
            t.inOut = true;
          });
          G.out.push(...take);
          G.hist = [];
        }
        if (p === "undo") {
          const t = G.hist.pop();
          if (!t) return;
          G.slot = G.slot.filter((x) => x !== t);
          t.inSlot = false;
        }
        if (p === "shuffle") {
          const live = G.tiles.filter((t) => !t.gone && !t.inSlot && !t.inOut);
          const ks = live.map((t) => t.k);
          for (let i = ks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [ks[i], ks[j]] = [ks[j], ks[i]];
          }
          live.forEach((t, i) => (t.k = ks[i]));
        }
        G.props[p] -= 1;
      } else return;
      draw();
      check();
    }
    F.register("喵了个喵", {
      title: "喵了个喵",
      kicker: "MEOW MATCH",
      async mount(body) {
        root = document.createElement("div");
        root.className = "mlm-root";
        body.appendChild(root);
        root.addEventListener("click", onClick);
        await loadBest();
        if (G) draw();
        else drawMenu();
      },
      unmount() {
        root = null;
      }
    });
  })();

  /* ═════════════ 猫爪琴键 ═════════════ */
  (function () {
    // 曲子都是公有领域的旋律（音名 → 频率）
    const NOTE = { C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0 };
    const SONGS = {
      小星星: "C4 C4 G4 G4 A4 A4 G4 F4 F4 E4 E4 D4 D4 C4 G4 G4 F4 F4 E4 E4 D4 G4 G4 F4 F4 E4 E4 D4",
      欢乐颂: "E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4 D4 D4 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4 C4 C4",
      卡农: "E5 D5 C5 B4 A4 G4 A4 B4 C5 B4 A4 G4 F4 E4 F4 D4 C4 E4 G4 F4 E4 C4 E4 D4 C4 A4 C5 G4 A4 B4",
      致爱丽丝: "E5 D5 E5 D5 E5 B4 D5 C5 A4 C4 E4 A4 B4 E4 G4 B4 C5 E4 E5 D5 E5 D5 E5 B4 D5 C5 A4 C4 E4 A4 B4 E4 C5 B4 A4"
    };
    let root = null;
    let ac = null;
    let P = null;
    let song = "小星星";
    let raf = 0;

    function tone(freq) {
      try {
        if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
        if (ac.state === "suspended") ac.resume();
        const t = ac.currentTime;
        const o = ac.createOscillator();
        const o2 = ac.createOscillator();
        const g = ac.createGain();
        o.type = "triangle";
        o2.type = "sine";
        o.frequency.value = freq;
        o2.frequency.value = freq * 2;
        const g2 = ac.createGain();
        g2.gain.value = 0.18;
        o.connect(g);
        o2.connect(g2).connect(g);
        g.connect(ac.destination);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        o.start(t);
        o2.start(t);
        o.stop(t + 0.95);
        o2.stop(t + 0.95);
      } catch (_) {
        /* 没声音也能玩 */
      }
    }
    function buzz() {
      try {
        if (!ac) return;
        const t = ac.currentTime;
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = "sawtooth";
        o.frequency.value = 110;
        o.connect(g).connect(ac.destination);
        g.gain.setValueAtTime(0.25, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        o.start(t);
        o.stop(t + 0.5);
      } catch (_) {
        /* ignore */
      }
      navigator.vibrate?.(120);
    }

    function drawMenu() {
      cancelAnimationFrame(raf);
      if (!root) return;
      root.innerHTML = `<div class="pt-menu"><div class="mlm-logo">🐾<span>猫爪琴键</span></div>
        <p class="fun-note">只点<b>黑块</b>，从最下面那块开始点。点到白块、或者让黑块溜出屏幕就输了。越弹越快，弹对的时候会放出整首曲子。</p>
        <p class="fun-kicker">选一首曲子</p>
        <div class="pt-songs">${Object.keys(SONGS).map((k) => `<button type="button" data-song="${esc(k)}" class="${k === song ? "is-on" : ""}">${esc(k)}${best["pt" + k] ? `<small>最高 ${best["pt" + k]}</small>` : ""}</button>`).join("")}</div>
        <button type="button" class="fun-btn solid wide" data-a="go">开始</button></div>`;
    }

    function startGame() {
      const notes = SONGS[song].split(/\s+/).map((n) => NOTE[n] || 440);
      root.innerHTML = `<div class="pt-game"><div class="pt-hud"><button type="button" class="fun-btn ghost sm" data-a="menu">‹</button><b id="pt-score">0</b><small id="pt-speed"></small></div><canvas id="pt-cv"></canvas></div>`;
      const cv = root.querySelector("#pt-cv");
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = cv.clientWidth;
      const H = cv.clientHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      const ctx = cv.getContext("2d");
      ctx.scale(dpr, dpr);
      const rowH = H / 4;
      const rows = [];
      let lastCol = -1;
      const newRow = () => {
        let c = Math.floor(Math.random() * 4);
        if (c === lastCol && Math.random() < 0.6) c = (c + 1 + Math.floor(Math.random() * 3)) % 4;
        lastCol = c;
        return { col: c, hit: false };
      };
      for (let i = 0; i < 6; i++) rows.push(newRow());
      // rows[0] 在最下面（起始那一行在屏幕第 3 行的位置）
      P = { rows, offset: 0, speed: 0, started: false, over: false, score: 0, notes, ni: 0, rowH, W, H, ctx, cv, failRow: -1, failCol: -1, t: 0 };
      const baseY = (i) => H - rowH * (i + 1) - rowH + P.offset; // 第 i 行顶部 y
      const render = () => {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = "#fbfbfd";
        ctx.fillRect(0, 0, W, H);
        P.rows.forEach((r, i) => {
          const y = baseY(i);
          if (y > H || y + rowH < 0) return;
          const x = (r.col * W) / 4;
          ctx.fillStyle = r.hit ? "rgba(30,30,40,0.12)" : "#16161c";
          ctx.fillRect(x + 1, y + 1, W / 4 - 2, rowH - 2);
          if (!r.hit && (P.started || i !== 0)) {
            // 黑键上画一个小猫爪
            const cx = x + W / 8;
            const cy = y + rowH * 0.62;
            const u = Math.min(W / 4, rowH) * 0.09;
            ctx.fillStyle = "rgba(255,255,255,0.16)";
            ctx.beginPath();
            ctx.ellipse(cx, cy, u * 1.6, u * 1.3, 0, 0, 7);
            ctx.fill();
            [[-1.7, -1.5], [-0.6, -2.4], [0.6, -2.4], [1.7, -1.5]].forEach(([dx, dy]) => {
              ctx.beginPath();
              ctx.ellipse(cx + dx * u, cy + dy * u, u * 0.55, u * 0.7, 0, 0, 7);
              ctx.fill();
            });
          }
          if (!P.started && i === 0) {
            ctx.fillStyle = "#fff";
            ctx.font = "600 16px system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("开始", x + W / 8, y + rowH / 2 + 6);
          }
          if (P.failRow === i) {
            ctx.fillStyle = "rgba(230,60,60,0.85)";
            ctx.fillRect((P.failCol * W) / 4 + 1, y + 1, W / 4 - 2, rowH - 2);
          }
        });
        ctx.strokeStyle = "rgba(0,0,0,0.08)";
        for (let c = 1; c < 4; c++) {
          ctx.beginPath();
          ctx.moveTo((c * W) / 4, 0);
          ctx.lineTo((c * W) / 4, H);
          ctx.stroke();
        }
      };
      let last = performance.now();
      const loop = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (P.started && !P.over) {
          P.speed = rowH * (2.2 + Math.min(4.2, P.score * 0.035)); // 每秒滚过多少像素
          P.offset += P.speed * dt;
          // 最下面一行完全离开屏幕
          while (baseY(0) > H) {
            if (!P.rows[0].hit) {
              // 漏掉了：往回滚一点让玩家看到
              P.failRow = 0;
              P.failCol = P.rows[0].col;
              P.offset -= rowH * 0.8;
              return lose("漏掉了一块");
            }
            P.rows.shift();
            P.offset -= rowH;
            P.rows.push(newRow());
          }
          const sp = root?.querySelector("#pt-speed");
          if (sp) sp.textContent = (P.speed / rowH).toFixed(1) + " 块/秒";
        }
        render();
        if (!P.over && root) raf = requestAnimationFrame(loop);
      };
      cv.addEventListener("pointerdown", (e) => {
        if (P.over) return;
        e.preventDefault();
        const r = cv.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        const col = Math.floor((x / W) * 4);
        // 找第一行还没点的
        const i = P.rows.findIndex((row) => !row.hit);
        if (i < 0) return;
        const top = baseY(i);
        const row = P.rows[i];
        // 只认点在这一行附近（允许点到上一行一点点）
        if (y < top - rowH * 0.35 || y > top + rowH * 1.25) {
          // 点到别的行的白块
          const ri = Math.floor((H + P.offset - y) / rowH) - 1;
          if (P.rows[ri] && P.rows[ri].col !== col) {
            P.failRow = ri;
            P.failCol = col;
            return lose("点到白块了");
          }
          return;
        }
        if (col !== row.col) {
          P.failRow = i;
          P.failCol = col;
          return lose("点到白块了");
        }
        row.hit = true;
        P.started = true;
        tone(P.notes[P.ni % P.notes.length]);
        P.ni++;
        P.score++;
        const sc = root?.querySelector("#pt-score");
        if (sc) sc.textContent = String(P.score);
      });
      raf = requestAnimationFrame(loop);
    }
    function lose(why) {
      P.over = true;
      buzz();
      cancelAnimationFrame(raf);
      // 再画一帧把红块显示出来
      requestAnimationFrame(() => {
        if (!root || !P) return;
        const { ctx, W, rowH, H } = P;
        const y = H - rowH * (P.failRow + 1) - rowH + P.offset;
        ctx.fillStyle = "rgba(230,60,60,0.85)";
        ctx.fillRect((P.failCol * W) / 4 + 1, y + 1, W / 4 - 2, rowH - 2);
      });
      const k = "pt" + song;
      const rec = P.score > (best[k] || 0);
      if (rec) {
        best[k] = P.score;
        saveBest();
      }
      setTimeout(() => {
        const sh = F.openSheet(
          `<div class="mlm-end">${rec ? "🏆" : "🎹"}<h3>${P.score} 块</h3><p>${esc(why)}${rec ? " · 新纪录！" : best[k] ? ` · 最高 ${best[k]}` : ""}</p></div>
           <div class="fun-sheet-actions"><button type="button" class="fun-btn solid" data-e="retry">再来</button><button type="button" class="fun-btn ghost" data-e="menu">换曲子</button></div>`,
          { title: "猫爪琴键" }
        );
        sh.body.addEventListener("click", (e) => {
          const a = e.target.closest("[data-e]")?.dataset.e;
          if (!a) return;
          sh.close();
          if (!root) return;
          if (a === "retry") startGame();
          else drawMenu();
        });
      }, 700);
    }
    function onClick(e) {
      const s = e.target.closest("[data-song]");
      if (s) {
        song = s.dataset.song;
        root.querySelectorAll("[data-song]").forEach((b) => b.classList.toggle("is-on", b === s));
        return;
      }
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (a === "go") {
        tone(0.0001); // 先在点击里解锁声音（iPhone 需要）
        startGame();
      }
      if (a === "menu") {
        if (P) P.over = true;
        drawMenu();
      }
    }
    F.register("猫爪琴键", {
      title: "猫爪琴键",
      kicker: "CAT PAW KEYS",
      async mount(body) {
        root = document.createElement("div");
        root.className = "pt-root";
        body.appendChild(root);
        root.addEventListener("click", onClick);
        await loadBest();
        drawMenu();
      },
      unmount() {
        cancelAnimationFrame(raf);
        if (P) P.over = true;
        root = null;
      }
    });
  })();
})();
