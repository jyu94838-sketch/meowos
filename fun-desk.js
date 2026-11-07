"use strict";

/**
 * 桌面翻页 + 应用页
 * - 第 1 页是原来的桌面（.layout-shell 原样搬进翻页容器）
 * - 第 2 页起是应用页：小组件和应用图标都放在格子里，长按后都能随便拖
 * - 长按进入编辑：拖动图标换位置 / 拖到边缘翻页；可以新建、删除应用页；布局存在本机
 * 这个文件在 index.html 末尾直接加载（不排在娱乐模块后面），所以进桌面就能看到
 */
(function () {
  const phone = document.getElementById("phone");
  const shell = phone && phone.querySelector(".layout-shell");
  if (!phone || !shell || document.getElementById("desk-pager")) return;

  const LAYOUT_KEY = "meowos_desk_layout_v1";
  const ICONS_KEY = "meowos_desk_icons_v1";
  const SIZE_KEY = "meowos_icon_size";
  /** 第二页里和第一页同一个应用的格子：换图标时两边一起换（第一页用原版装扮里的图标设置） */
  const HOME_SLOT = {}; // 第一页已有的应用不再放第二页

  function readIcons() {
    try {
      const o = JSON.parse(localStorage.getItem(ICONS_KEY) || "{}");
      return o && typeof o === "object" ? o : {};
    } catch (_) {
      return {};
    }
  }
  let icons = readIcons();
  // 图标大小功能已取消：清掉之前存过的设置，恢复默认大小
  try {
    localStorage.removeItem(SIZE_KEY);
  } catch (_) {
    /* ignore */
  }
  // 应用还没加载完时点了：记住，加载好马上自动打开（不再点了没反应）
  let pendingApp = null;
  const toastSoon = () => {
    const msg = "正在打开，马上就好…";
    if (window.XXJ_FUN && window.XXJ_FUN.toast) window.XXJ_FUN.toast(msg);
    else if (typeof showToast === "function") showToast(msg);
  };
  const flushPending = () => {
    if (!pendingApp || !window.__xxjFunReady || typeof window.openFunApp !== "function") return;
    const k = pendingApp;
    pendingApp = null;
    window.openFunApp(k);
  };
  window.addEventListener("xxj-fun-ready", flushPending);
  const fun = (k) => () => {
    if (window.__xxjFunReady && typeof window.openFunApp === "function") {
      window.openFunApp(k);
      return;
    }
    if (!pendingApp) toastSoon();
    pendingApp = k;
  };
  const call = (fn) => () => {
    const f = window[fn];
    if (typeof f === "function") f();
    else if (typeof showToast === "function") showToast("还在加载，稍等一下");
  };
  /** key: [名称, Phosphor 图标, 色相, 英文小标, 打开方式] */
  const APPS = {
    bubble: ["Bubble", "ph-chat-teardrop-dots", 280, "Idol", fun("Bubble")],
    wb: ["世界书", "ph-book-open-text", 30, "Lore", call("openWorldBookScreen")],
    couple: ["情侣小屋", "ph-house-simple", 335, "Couple", fun("情侣小屋")],
    music: ["音乐", "ph-music-notes", 260, "Music", fun("音乐")],
    video: ["刷刷", "ph-film-strip", 0, "Shorts", fun("短视频")],
    weibo: ["微博", "ph-fire", 22, "Trend", fun("微博")],
    sprout: ["Sprout", "ph-plant", 120, "Notes", fun("Sprout")],
    forum: ["论坛", "ph-newspaper", 205, "Square", call("openForumScreen")],
    mart: ["Meow Mart", "ph-shopping-bag", 18, "Shop", fun("Meow Mart")],
    town: ["Pocket Town", "ph-house-line", 95, "Town", fun("Pocket Town")],
    astro: ["星座", "ph-moon-stars", 265, "Stars", fun("星座")],
    games: ["游戏厅", "ph-game-controller", 300, "Arcade", fun("游戏厅")],
    share: ["资源站", "ph-package", 175, "Share", fun("资源站")],
    yuzu: ["柚子", "ph-drop", 15, "Cycle", fun("柚子")],
    names: ["名字生成器", "ph-feather", 40, "Names", fun("名字生成器")],
    mimi: ["弥弥", "ph-cat", 0, "Butler", fun("弥弥")],
    net: ["联机", "ph-globe-hemisphere-east", 200, "Online", fun("联机")],
    news: ["更新公告", "ph-megaphone", 40, "News", call("openChangelog")]
  };
  const DEFAULT = [Object.keys(APPS)];
  const LAYOUT_KEY2 = "meowos_desk_layout_v2"; // 每页是「格子数组」，空格子为 null，可以留空位

  /* ───── 布局 ───── */
  // 小组件在布局里记成 "w:<id>:<s|m|l>"，锚在左上角那一格；小 2×2、中 4×2、大 4×4
  const isW = (k) => typeof k === "string" && k.startsWith("w:");
  const wid = (k) => String(k).split(":")[1] || "";
  const wsize = (k) => String(k).split(":")[2] || "s";
  const WDIM = { s: [2, 2], m: [4, 2], l: [4, 4] };
  const dims = (k) => (isW(k) ? WDIM[wsize(k)] || WDIM.s : [1, 1]);
  function loadLayout() {
    let pages = null;
    try {
      pages = JSON.parse(localStorage.getItem(LAYOUT_KEY2) || "null");
      if (!Array.isArray(pages)) pages = JSON.parse(localStorage.getItem(LAYOUT_KEY) || "null"); // 旧版：紧凑数组
    } catch (_) {
      pages = null;
    }
    if (!Array.isArray(pages) || !pages.length) pages = DEFAULT.map((p) => p.slice());
    const seen = new Set();
    pages = pages.map((pg) => (Array.isArray(pg) ? pg : []).map((k) => (k && (APPS[k] || isW(k)) && !seen.has(k) && seen.add(k) ? k : null)));
    const seenW = new Set();
    pages = pages.map((pg) => pg.map((k) => (isW(k) ? (seenW.has(wid(k)) ? null : (seenW.add(wid(k)), k)) : k)));
    const last = pages[pages.length - 1];
    for (const k of Object.keys(APPS))
      if (!seen.has(k)) {
        // 新增的应用：放进最后一页第一个空位
        const e = last.indexOf(null);
        if (e >= 0) last[e] = k;
        else last.push(k);
      }
    return pages;
  }
  function saveLayout() {
    try {
      const out = layout.map((pg) => {
        const a = pg.slice();
        while (a.length && !a[a.length - 1]) a.pop();
        return a;
      });
      localStorage.setItem(LAYOUT_KEY2, JSON.stringify(out));
    } catch (_) {
      /* ignore */
    }
  }
  let layout = loadLayout();
  let editing = false;

  /* ───── DOM ───── */
  const pager = document.createElement("section");
  pager.id = "desk-pager";
  pager.className = "desk-pager";
  shell.parentNode.insertBefore(pager, shell);
  pager.appendChild(shell);
  shell.classList.add("desk-page");

  // 小组件内容由 fun-widgets.js 画进格子里的 .desk-wg-host（这里只管位置）
  let widgetList = null; // [{id,size}]，小组件模块加载好之前是 null（先按布局里记的位置留出空位）

  const editBar = document.createElement("div");
  editBar.className = "desk-editbar";
  editBar.innerHTML = `<span>图标和小组件都能拖 · 拖到边缘翻页</span><button type="button" class="desk-icons-btn" data-wg>小组件</button><button type="button" class="desk-icons-btn">图标</button><button type="button" class="desk-done">完成</button>`;
  phone.appendChild(editBar);

  const dots = document.createElement("div");
  dots.className = "desk-dots";
  phone.appendChild(dots);

  // 方形图标（第一页的配色）；自定义图标铺满整个方块
  const iconHtml = (k) => {
    const [name, icon] = APPS[k];
    const img = icons[k];
    return `<button type="button" class="desk-app" data-k="${k}"><span class="desk-app-ico${img ? " has-img" : ""}">${img ? `<img src="${img}" alt="" />` : `<i class="ph ${icon}"></i>`}</span><span class="desk-app-name">${name}</span></button>`;
  };

  const ROW_H = 92; // 一行格子的高度（图标 + 名字 + 行距）
  /** 这一页一屏放得下几个格子 */
  function slotsFor(pgEl, grid) {
    const h = pager.clientHeight || 600;
    const top = grid.getBoundingClientRect().top - pgEl.getBoundingClientRect().top;
    const rows = Math.max(3, Math.floor((h - top - 26 + 10) / ROW_H));
    return Math.max(4, rows * 4);
  }
  /**
   * 把一页整理好：小组件按锚点占位（放不下就往后找空位），图标放自己的格子，
   * 被小组件盖住的图标挪到最近的空格。返回 { keys, cover }，cover[i] = 盖住这格的小组件
   */
  function arrange(keys, minCells) {
    const occ = [];
    const cover = [];
    const out = [];
    const fits = (r, c, w, h) => {
      if (c < 0 || c + w > 4) return false;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (occ[(r + y) * 4 + c + x]) return false;
      return true;
    };
    const mark = (r, c, w, h, k) => {
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          occ[(r + y) * 4 + c + x] = true;
          cover[(r + y) * 4 + c + x] = k;
        }
    };
    keys.forEach((k, i) => {
      if (!isW(k)) return;
      const [w, h] = dims(k);
      let r = Math.floor(i / 4);
      let c = Math.min(i % 4, 4 - w);
      for (let guard = 0; guard < 400 && !fits(r, c, w, h); guard++) {
        c += 1;
        if (c + w > 4) {
          c = 0;
          r += 1;
        }
      }
      mark(r, c, w, h, k);
      out[r * 4 + c] = k;
    });
    const firstFree = (from) => {
      for (let j = from; j < 4000; j++) if (!occ[j]) return j;
      return -1;
    };
    keys.forEach((k, i) => {
      if (!k || isW(k)) return;
      let j = occ[i] ? firstFree(i) : i;
      if (j < 0) j = firstFree(0);
      occ[j] = true;
      out[j] = k;
    });
    let len = Math.max(minCells, occ.length, out.length);
    len = Math.ceil(len / 4) * 4;
    const res = [];
    for (let j = 0; j < len; j++) res.push(out[j] || null);
    // 末尾整行都空、又超过一屏的行去掉
    while (res.length > minCells && res.slice(-4).every((x, n) => !x && !cover[res.length - 4 + n])) res.length -= 4;
    return { keys: res, cover };
  }
  const place = (r, c, w, h) => `grid-row:${r + 1} / span ${h};grid-column:${c + 1} / span ${w}`;
  function render() {
    const keepLeft = pager.scrollLeft;
    pager.querySelectorAll(".desk-apps, .desk-newpage").forEach((n) => n.remove());
    layout.forEach((keys, i) => {
      const pg = document.createElement("section");
      pg.className = "desk-page desk-apps";
      pg.dataset.pg = String(i);
      pg.innerHTML = `${editing && i > 0 ? `<button type="button" class="desk-delpage" data-delpage="${i}">删除这一页</button>` : ""}<div class="desk-apps-grid" data-grid="${i}"></div>`;
      pager.appendChild(pg);
      const grid = pg.querySelector(".desk-apps-grid");
      if (i === 0 && widgetList && !widgetList.length && !editing)
        grid.insertAdjacentHTML("beforebegin", `<button type="button" class="wg-add-tile desk-wg-add">＋ 添加小组件<small>照片、音乐、便签、倒数日…长按可以拖到任意位置</small></button>`);
      const { keys: arranged, cover } = arrange(keys, slotsFor(pg, grid));
      layout[i] = arranged;
      const html = [];
      arranged.forEach((k, j) => {
        const r = Math.floor(j / 4);
        const c = j % 4;
        if (isW(k)) {
          const [w, h] = dims(k);
          html.push(`<div class="desk-wg-host wg-host-${wsize(k)}" data-pg="${i}" data-s="${j}" data-k="${k}" data-wid="${wid(k)}" style="${place(r, c, w, h)}"></div>`);
        } else if (!cover[j]) {
          html.push(`<div class="desk-slot" data-pg="${i}" data-s="${j}" style="${place(r, c, 1, 1)}">${k ? iconHtml(k) : ""}</div>`);
        }
      });
      grid.innerHTML = html.join("");
      if (!editing && !arranged.some(Boolean)) grid.insertAdjacentHTML("beforebegin", `<p class="desk-empty">这一页还空着，长按别的图标进入编辑，把图标拖过来</p>`);
    });
    if (editing) {
      const np = document.createElement("section");
      np.className = "desk-page desk-newpage";
      np.innerHTML = `<button type="button" class="desk-addpage">＋<span>新建一页</span></button>`;
      pager.appendChild(np);
    }
    pager.classList.toggle("is-editing", editing);
    editBar.classList.toggle("is-on", editing);
    pager.scrollLeft = keepLeft;
    renderDots();
    // 小组件内容：用小组件模块缓存的样子先填上，再异步刷新
    if (window.XXJ_WIDGETS && typeof window.XXJ_WIDGETS.paint === "function") window.XXJ_WIDGETS.paint();
  }
  let roT = 0;
  /** 小组件模块告诉桌面现在有哪些小组件（加了 / 删了 / 换大小） */
  function setWidgets(list) {
    const next = (Array.isArray(list) ? list : []).map((w) => ({ id: String(w.id), size: WDIM[w.size] ? w.size : "s" }));
    const sig = next.map((w) => w.id + ":" + w.size).join("|");
    const had = widgetList;
    widgetList = next;
    const want = new Map(next.map((w) => [w.id, "w:" + w.id + ":" + w.size]));
    let changed = !had;
    let hasAnyW = false;
    // 更新 / 去掉
    layout.forEach((pg) =>
      pg.forEach((k, j) => {
        if (!isW(k)) return;
        hasAnyW = true;
        const nk = want.get(wid(k));
        if (nk !== k) {
          pg[j] = nk || null;
          changed = true;
        }
        want.delete(wid(k));
      })
    );
    // 新加的
    if (want.size) {
      changed = true;
      if (!hasAnyW && had === null) {
        // 第一次（从旧版升级）：小组件排在第一个应用页最上面，原来的图标按顺序往下排
        const old = layout[0];
        const used = arrange([...want.values()], 0); // 依次挤着放
        const res = used.keys.slice();
        let j = 0;
        for (const k of old) {
          while (used.cover[j] || res[j]) j++;
          res[j] = k;
          j++;
        }
        layout[0] = res;
      } else {
        for (const k of want.values()) {
          const [w, h] = dims(k);
          let done = false;
          // 先找一块完全空着的地方
          for (let p = 0; p < layout.length && !done; p++) {
            const { keys, cover } = arrange(layout[p], 0);
            const rows = Math.ceil(keys.length / 4);
            for (let r = 0; r + h <= rows && !done; r++)
              for (let c = 0; c + w <= 4 && !done; c++) {
                let ok = true;
                for (let y = 0; y < h && ok; y++) for (let x = 0; x < w && ok; x++) if (keys[(r + y) * 4 + c + x] || cover[(r + y) * 4 + c + x]) ok = false;
                if (ok) {
                  layout[p] = keys;
                  layout[p][r * 4 + c] = k;
                  done = true;
                }
              }
          }
          // 没有空地方：放第一个应用页最上面，图标往后挪
          if (!done) layout[0] = [k, ...layout[0]];
        }
      }
    }
    if (!changed) {
      // 内容没变（比如时钟刷新）：只是第一次知道列表时补一次画面
      if (!had) render();
      return;
    }
    saveLayout();
    clearTimeout(roT);
    if (drag) return;
    render();
  }

  function pageCount() {
    return pager.querySelectorAll(".desk-page").length;
  }
  function curPage() {
    return Math.round(pager.scrollLeft / Math.max(1, pager.clientWidth));
  }
  function renderDots() {
    const n = pageCount();
    const c = curPage();
    dots.innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i === c ? "is-on" : ""}"></i>`).join("");
  }
  function goPage(i, smooth) {
    pager.scrollTo({ left: i * pager.clientWidth, behavior: smooth === false ? "auto" : "smooth" });
  }

  pager.addEventListener("scroll", () => {
    const c = curPage();
    [...dots.children].forEach((d, i) => d.classList.toggle("is-on", i === c));
  }, { passive: true });
  dots.addEventListener("click", (e) => {
    const k = [...dots.children].indexOf(e.target);
    if (k >= 0) goPage(k);
  });
  // 电脑上用触控板横向滑动翻页
  pager.addEventListener(
    "wheel",
    (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 20 && !drag) {
        e.preventDefault();
        if (wheelLock) return;
        wheelLock = true;
        setTimeout(() => (wheelLock = false), 450);
        goPage(Math.max(0, Math.min(pageCount() - 1, curPage() + (e.deltaX > 0 ? 1 : -1))));
      }
    },
    { passive: false }
  );
  let wheelLock = false;

  /* ───── 编辑模式 ───── */
  function setEditing(on) {
    if (editing === on) return;
    editing = on;
    if (!on) {
      // 去掉末尾的空页
      while (layout.length > 1 && !layout[layout.length - 1].some(Boolean)) layout.pop();
      saveLayout();
    }
    render();
    if (on && navigator.vibrate) {
      try {
        navigator.vibrate(15);
      } catch (_) {
        /* ignore */
      }
    }
  }
  editBar.querySelector(".desk-done").addEventListener("click", () => setEditing(false));
  editBar.querySelector("[data-wg]").addEventListener("click", () => {
    setEditing(false);
    if (typeof window.openFunApp === "function") window.openFunApp("小组件");
  });
  editBar.querySelector(".desk-icons-btn:not([data-wg])").addEventListener("click", () => {
    setEditing(false);
    if (typeof window.openDeskIcons === "function") window.openDeskIcons(false);
  });

  /* 长按进入编辑 */
  let pressTimer = 0;
  let pressStart = null;
  pager.addEventListener("pointerdown", (e) => {
    if (editing || !e.target.closest(".desk-apps")) return;
    if (e.target.closest(".wg-add-tile")) return;
    pressStart = { x: e.clientX, y: e.clientY };
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      pressStart = null;
      suppressClick = true;
      setEditing(true);
    }, 520);
  });
  const cancelPress = (e) => {
    if (!pressStart) return;
    if (e.type === "pointermove" && Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) < 8) return;
    clearTimeout(pressTimer);
    pressStart = null;
  };
  pager.addEventListener("pointermove", cancelPress);
  pager.addEventListener("pointerup", cancelPress);
  pager.addEventListener("pointercancel", cancelPress);
  pager.addEventListener("pointerup", () => {
    if (suppressClick) setTimeout(() => (suppressClick = false), 60);
  });
  pager.addEventListener("contextmenu", (e) => {
    if (e.target.closest(".desk-apps")) e.preventDefault();
  });

  /* 点击：打开应用 / 编辑操作 */
  let suppressClick = false;
  pager.addEventListener(
    "click",
    (e) => {
      if (suppressClick) {
        suppressClick = false;
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      if (e.target.closest(".desk-addpage")) {
        layout.push([]);
        render();
        goPage(layout.length); // 第 1 页是原桌面，所以新页序号 = layout.length
        return;
      }
      const del = e.target.closest("[data-delpage]");
      if (del) {
        const i = Number(del.dataset.delpage);
        for (const k of layout[i]) {
          if (!k) continue;
          const e = layout[i - 1].indexOf(null);
          if (e >= 0) layout[i - 1][e] = k;
          else layout[i - 1].push(k);
        }
        layout.splice(i, 1);
        saveLayout();
        render();
        return;
      }
      if (e.target.closest(".desk-wg-add")) {
        fun("小组件")();
        return;
      }
      if (editing && e.target.closest(".desk-wg-host")) {
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      const app = e.target.closest(".desk-app");
      if (!app || editing) return;
      APPS[app.dataset.k]?.[4]();
    },
    true
  );

  /* 拖动：图标放进手指下面的格子（空格子直接放，有图标就互换）；小组件按左上角对齐到格子 */
  let drag = null;
  pager.addEventListener("pointerdown", (e) => {
    if (!editing) return;
    const host = e.target.closest(".desk-wg-host");
    const app = host ? null : e.target.closest(".desk-app");
    const el = host || app;
    const slot = host || app?.closest(".desk-slot");
    if (!el || !slot) return;
    e.preventDefault();
    const k = host ? host.dataset.k : app.dataset.k;
    drag = { el, isW: !!host, k, from: { pg: Number(slot.dataset.pg), s: Number(slot.dataset.s) }, sx: e.clientX, sy: e.clientY, started: false, ghost: null, edgeTimer: 0, edgeDir: 0, target: null, pv: null };
    el.setPointerCapture?.(e.pointerId);
  });
  /** 坐标 → 当前页的第几格 */
  function cellAt(x, y) {
    const gi = curPage() - 1;
    const grid = pager.querySelector(`[data-grid="${gi}"]`);
    if (!grid) return null;
    const r = grid.getBoundingClientRect();
    const cs = getComputedStyle(grid);
    const cg = parseFloat(cs.columnGap) || 6;
    const rg = parseFloat(cs.rowGap) || 10;
    const rh = parseFloat(cs.gridAutoRows) || 82;
    const cw = (r.width - 3 * cg) / 4;
    if (x < r.left - 30 || x > r.right + 30 || y < r.top - 40) return null;
    const c = Math.max(0, Math.min(3, Math.floor((x - r.left) / (cw + cg))));
    const rows = Math.max(1, Math.ceil(layout[gi].length / 4));
    const row = Math.max(0, Math.min(rows - 1, Math.floor((y - r.top) / (rh + rg))));
    return { pg: gi, r: row, c, grid };
  }
  /** 这一格被哪个小组件盖住（不算正在拖的） */
  function coveredBy(pg, idx, except) {
    const { cover } = arrange(layout[pg], 0);
    const k = cover[idx];
    return k && k !== except ? k : null;
  }
  function showTarget(t) {
    if (drag.pv && (!t || drag.pv.parentNode !== t.grid)) {
      drag.pv.remove();
      drag.pv = null;
    }
    drag.target = t;
    if (!t) return;
    if (!drag.pv) {
      drag.pv = document.createElement("div");
      drag.pv.className = "desk-drop-pv";
      t.grid.appendChild(drag.pv);
    }
    const [w, h] = dims(drag.k);
    drag.pv.style.cssText = place(t.r, t.c, w, h);
    drag.pv.classList.toggle("is-bad", !!t.bad);
  }
  document.addEventListener(
    "pointermove",
    (e) => {
      if (!drag) return;
      if (!drag.started) {
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
        drag.started = true;
        const r = drag.el.getBoundingClientRect();
        const g = drag.el.cloneNode(true);
        g.className = (drag.isW ? "desk-wg-host " : "desk-app ") + "desk-ghost";
        g.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
        document.body.appendChild(g);
        drag.ghost = g;
        drag.ox = e.clientX - r.left;
        drag.oy = e.clientY - r.top;
        drag.cell = { w: r.width, h: r.height };
        drag.el.classList.add("is-dragging");
        pager.classList.add("is-dragging");
      }
      e.preventDefault();
      const gx = e.clientX - drag.ox;
      const gy = e.clientY - drag.oy;
      drag.ghost.style.left = gx + "px";
      drag.ghost.style.top = gy + "px";
      // 拖到边缘：停留一会儿翻页
      const pr = pager.getBoundingClientRect();
      const dir = e.clientX < pr.left + 26 ? -1 : e.clientX > pr.right - 26 ? 1 : 0;
      if (dir !== drag.edgeDir) {
        drag.edgeDir = dir;
        clearTimeout(drag.edgeTimer);
        if (dir) {
          drag.edgeTimer = setTimeout(function flip() {
            if (!drag) return;
            const next = curPage() + dir;
            if (next >= 1 && next <= layout.length) goPage(next); // 第 1 页是原桌面，不能放
            drag.edgeTimer = setTimeout(flip, 900);
          }, 600);
        }
      }
      let t;
      if (drag.isW) {
        // 小组件：用它左上角那一格对齐
        const [w] = dims(drag.k);
        t = cellAt(gx + 30, gy + 30);
        if (t) {
          t.c = Math.min(t.c, 4 - w);
          const [, h] = dims(drag.k);
          let bad = false;
          for (let y = 0; y < h && !bad; y++) for (let x = 0; x < w && !bad; x++) if (coveredBy(t.pg, (t.r + y) * 4 + t.c + x, drag.k)) bad = true;
          t.bad = bad;
        }
      } else {
        t = cellAt(e.clientX, e.clientY);
        if (t) t.bad = !!coveredBy(t.pg, t.r * 4 + t.c, null);
      }
      showTarget(t);
    },
    { passive: false }
  );
  const endDrag = () => {
    if (!drag) return;
    clearTimeout(drag.edgeTimer);
    if (drag.started) {
      drag.ghost.remove();
      drag.pv?.remove();
      drag.el.classList.remove("is-dragging");
      pager.classList.remove("is-dragging");
      const t = drag.target;
      if (t && !t.bad) {
        const tp = t.pg;
        const ts = t.r * 4 + t.c;
        const { pg: fp, s: fs } = drag.from;
        if (tp !== fp || ts !== fs) {
          if (!drag.isW) {
            const other = layout[tp][ts] || null;
            layout[tp][ts] = drag.k;
            layout[fp][fs] = other; // 有图标就互换，空格子就直接放
          } else {
            // 小组件：腾出原来的位置，新位置上的图标挪到空出来的地方
            const [w, h] = dims(drag.k);
            layout[fp][fs] = null;
            const freed = [];
            const fr = Math.floor(fs / 4);
            const fc = fs % 4;
            if (tp === fp) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) freed.push((fr + y) * 4 + fc + x);
            const moved = [];
            const need = (t.r + h) * 4;
            while (layout[tp].length < need) layout[tp].push(null);
            for (let y = 0; y < h; y++)
              for (let x = 0; x < w; x++) {
                const j = (t.r + y) * 4 + t.c + x;
                if (layout[tp][j]) moved.push(layout[tp][j]);
                layout[tp][j] = null;
              }
            layout[tp][ts] = drag.k;
            const inNew = (j) => {
              const r = Math.floor(j / 4);
              const c = j % 4;
              return r >= t.r && r < t.r + h && c >= t.c && c < t.c + w;
            };
            for (const k of moved) {
              const j = freed.find((f) => !inNew(f) && !layout[tp][f]);
              if (j != null) {
                while (layout[tp].length <= j) layout[tp].push(null);
                layout[tp][j] = k;
              } else {
                // 没地方就往后找空格（arrange 会再整理一次）
                const cov = arrange(layout[tp], 0).cover;
                let n = 0;
                while (layout[tp][n] || cov[n] || inNew(n)) n++;
                layout[tp][n] = k;
              }
            }
          }
          saveLayout();
        }
      }
      render();
    }
    drag = null;
  };
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);

  render();
  window.addEventListener("resize", () => {
    renderDots();
    clearTimeout(roT);
    roT = setTimeout(() => !drag && render(), 200);
  });
  /** 换图标：src 为 dataURL，传空则恢复默认 */
  function setIcon(k, src) {
    if (!APPS[k]) return;
    if (src) icons[k] = src;
    else delete icons[k];
    try {
      localStorage.setItem(ICONS_KEY, JSON.stringify(icons));
    } catch (_) {
      if (typeof showToast === "function") showToast("存不下了，图片太大或图标太多");
      icons = readIcons();
      return false;
    }
    // 第一页同名格子也一起换
    const slot = HOME_SLOT[k];
    if (slot && typeof window.mutateDesktopAppIconsKv === "function") {
      try {
        window.mutateDesktopAppIconsKv("home", (pack) => {
          if (src) pack.byApp[slot] = src;
          else delete pack.byApp[slot];
        });
      } catch (_) {
        /* ignore */
      }
    }
    render();
    return true;
  }
  window.XXJ_DESK = {
    render,
    setEditing,
    setWidgets,
    isEditing: () => editing,
    setIcon,
    getIcons: () => ({ ...icons }),
    apps: () => Object.keys(APPS).map((k) => ({ key: k, name: APPS[k][0], icon: APPS[k][1], kicker: APPS[k][3] }))
  };
})();
