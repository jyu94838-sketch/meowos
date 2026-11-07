"use strict";

/**
 * 桌面翻页 + 应用页
 * - 第 1 页是原来的桌面（.layout-shell 原样搬进翻页容器）
 * - 第 2 页起是应用页：小组件固定在第一个应用页顶部，下面是应用图标
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
    news: ["更新公告", "ph-megaphone", 40, "News", call("openChangelog")]
  };
  const DEFAULT = [Object.keys(APPS)];
  const LAYOUT_KEY2 = "meowos_desk_layout_v2"; // 每页是「格子数组」，空格子为 null，可以留空位

  /* ───── 布局 ───── */
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
    pages = pages.map((pg) => (Array.isArray(pg) ? pg : []).map((k) => (k && APPS[k] && !seen.has(k) && seen.add(k) ? k : null)));
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

  // 小组件区：固定节点，重绘应用页时搬过去，不会被清掉
  const widgetSlot = document.createElement("div");
  widgetSlot.id = "desk-widgets-slot";
  widgetSlot.className = "wg-area";

  const editBar = document.createElement("div");
  editBar.className = "desk-editbar";
  editBar.innerHTML = `<span>拖到任意格子 · 拖到边缘可以翻页</span><button type="button" class="desk-icons-btn" data-wg>小组件</button><button type="button" class="desk-icons-btn">图标</button><button type="button" class="desk-done">完成</button>`;
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
  /** 小组件占了多少个格子（小 2×2、中 4×2、大 4×4；还没添加时那条「添加小组件」占一行） */
  function widgetCells() {
    let n = 0;
    widgetSlot.querySelectorAll(".wg").forEach((w) => (n += w.classList.contains("wg-l") ? 16 : w.classList.contains("wg-m") ? 8 : 4));
    if (widgetSlot.querySelector(".wg-add-tile")) n += 4;
    return n;
  }
  function slotsFor(pgEl, grid, withWidgets) {
    const h = pager.clientHeight || 600;
    const top = grid.getBoundingClientRect().top - pgEl.getBoundingClientRect().top;
    const rows = Math.max(3, Math.floor((h - top - 26 + 10) / ROW_H));
    return Math.max(4, rows * 4 - (withWidgets ? widgetCells() : 0));
  }
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
      // 小组件放进格子里：多大占多大，旁边空出来的格子放图标
      if (i === 0) grid.appendChild(widgetSlot);
      let n = slotsFor(pg, grid, i === 0);
      // 屏幕变小、放不下的图标挪进前面的空位
      for (let j = n; j < keys.length; j++) {
        if (!keys[j]) continue;
        const e = keys.indexOf(null);
        if (e >= 0 && e < n) {
          keys[e] = keys[j];
          keys[j] = null;
        }
      }
      while (keys.length && keys.length > n && !keys[keys.length - 1]) keys.pop();
      n = Math.max(n, Math.ceil(keys.length / 4) * 4);
      while (keys.length < n) keys.push(null);
      grid.insertAdjacentHTML("beforeend", keys.map((k, j) => `<div class="desk-slot" data-pg="${i}" data-s="${j}">${k ? iconHtml(k) : ""}</div>`).join(""));
      if (!editing && !keys.some(Boolean)) grid.insertAdjacentHTML("beforebegin", `<p class="desk-empty">这一页还空着，长按别的图标进入编辑，把图标拖过来</p>`);
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
  }
  // 小组件加了 / 删了 / 换大小 → 重新算格子
  let lastWgSig = "";
  let roT = 0;
  if (window.MutationObserver)
    new MutationObserver(() => {
      const sig = [...widgetSlot.querySelectorAll(".wg, .wg-add-tile")].map((w) => w.className).join("|");
      if (sig === lastWgSig || drag) return;
      lastWgSig = sig;
      clearTimeout(roT);
      roT = setTimeout(() => !drag && render(), 120);
    }).observe(widgetSlot, { childList: true, subtree: true });

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
    if (e.target.closest(".wg-area")) return; // 小组件区不触发
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
      const app = e.target.closest(".desk-app");
      if (!app || editing) return;
      APPS[app.dataset.k]?.[4]();
    },
    true
  );

  /* 拖动：放进手指下面的任意格子（空格子直接放，有图标就互换） */
  let drag = null;
  pager.addEventListener("pointerdown", (e) => {
    if (!editing) return;
    const app = e.target.closest(".desk-app");
    const slot = app?.closest(".desk-slot");
    if (!slot) return;
    e.preventDefault();
    drag = { el: app, from: { pg: Number(slot.dataset.pg), s: Number(slot.dataset.s) }, k: app.dataset.k, sx: e.clientX, sy: e.clientY, started: false, ghost: null, edgeTimer: 0, edgeDir: 0, target: null };
    app.setPointerCapture?.(e.pointerId);
  });
  function setTarget(slot) {
    if (drag.target === slot) return;
    drag.target?.classList.remove("is-target");
    drag.target = slot;
    slot?.classList.add("is-target");
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
        g.className = "desk-app desk-ghost";
        g.style.cssText += `;left:${r.left}px;top:${r.top}px;width:${r.width}px`;
        document.body.appendChild(g);
        drag.ghost = g;
        drag.ox = e.clientX - r.left;
        drag.oy = e.clientY - r.top;
        drag.el.classList.add("is-dragging");
        pager.classList.add("is-dragging");
      }
      e.preventDefault();
      drag.ghost.style.left = e.clientX - drag.ox + "px";
      drag.ghost.style.top = e.clientY - drag.oy + "px";
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
      // 找手指下面的格子（找不到就取这一页离手指最近的格子）
      drag.ghost.style.visibility = "hidden";
      const under = document.elementFromPoint(e.clientX, e.clientY);
      drag.ghost.style.visibility = "";
      let slot = under?.closest?.(".desk-slot");
      if (!slot || !pager.contains(slot)) {
        const grid = pager.querySelector(`[data-grid="${curPage() - 1}"]`);
        slot = null;
        if (grid) {
          let best = Infinity;
          for (const c of grid.querySelectorAll(".desk-slot")) {
            const r = c.getBoundingClientRect();
            const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
            if (d < best) {
              best = d;
              slot = c;
            }
          }
          if (best > 140) slot = null;
        }
      }
      setTarget(slot);
    },
    { passive: false }
  );
  const endDrag = () => {
    if (!drag) return;
    clearTimeout(drag.edgeTimer);
    if (drag.started) {
      drag.ghost.remove();
      drag.el.classList.remove("is-dragging");
      pager.classList.remove("is-dragging");
      const t = drag.target;
      if (t) {
        const tp = Number(t.dataset.pg);
        const ts = Number(t.dataset.s);
        const { pg: fp, s: fs } = drag.from;
        if (tp !== fp || ts !== fs) {
          const other = layout[tp][ts] || null;
          layout[tp][ts] = drag.k;
          layout[fp][fs] = other; // 有图标就互换，空格子就直接放
          saveLayout();
        }
      }
      drag.target?.classList.remove("is-target");
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
    setIcon,
    getIcons: () => ({ ...icons }),
    apps: () => Object.keys(APPS).map((k) => ({ key: k, name: APPS[k][0], icon: APPS[k][1], kicker: APPS[k][3] }))
  };
})();
