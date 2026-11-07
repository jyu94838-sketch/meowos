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
  const HOME_SLOT = { chat: "聊天", checkup: "查岗", relation: "关系", char: "人设", roam: "漫游", my: "我的" };

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
  const fun = (k) => () => {
    if (typeof window.openFunApp === "function") window.openFunApp(k);
    else if (typeof showToast === "function") showToast("还在加载，稍等一下");
  };
  const call = (fn) => () => {
    const f = window[fn];
    if (typeof f === "function") f();
    else if (typeof showToast === "function") showToast("还在加载，稍等一下");
  };
  /** key: [名称, Phosphor 图标, 色相, 英文小标, 打开方式] */
  const APPS = {
    chat: ["聊天", "ph-chat-circle-text", 215, "Chat", call("openChatListScreen")],
    bubble: ["Bubble", "ph-chat-teardrop-dots", 280, "Idol", fun("Bubble")],
    char: ["角色人设", "ph-identification-card", 250, "Persona", call("openCharScreen")],
    wb: ["世界书", "ph-book-open-text", 30, "Lore", call("openWorldBookScreen")],
    relation: ["关系", "ph-heart-straight", 345, "Bond", call("openRelationScreen")],
    checkup: ["查岗", "ph-device-mobile-camera", 190, "Audit", call("openCheckupScreen")],
    roam: ["漫游", "ph-footprints", 140, "Roam", call("openRoamScreen")],
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
    my: ["我的", "ph-user-circle", 230, "Mine", call("openMyScreen")],
    news: ["更新公告", "ph-megaphone", 40, "News", call("openChangelog")]
  };
  const DEFAULT = [Object.keys(APPS)];

  /* ───── 布局 ───── */
  function loadLayout() {
    let pages = null;
    try {
      pages = JSON.parse(localStorage.getItem(LAYOUT_KEY) || "null");
    } catch (_) {
      pages = null;
    }
    if (!Array.isArray(pages) || !pages.length) pages = DEFAULT.map((p) => p.slice());
    const seen = new Set();
    pages = pages.map((pg) => (Array.isArray(pg) ? pg : []).filter((k) => APPS[k] && !seen.has(k) && seen.add(k)));
    for (const k of Object.keys(APPS)) if (!seen.has(k)) pages[pages.length - 1].push(k); // 新增的应用放最后
    return pages;
  }
  function saveLayout() {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
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
  editBar.innerHTML = `<span>拖动图标调整位置 · 拖到边缘可以翻页</span><button type="button" class="desk-icons-btn">图标</button><button type="button" class="desk-done">完成</button>`;
  phone.appendChild(editBar);

  const dots = document.createElement("div");
  dots.className = "desk-dots";
  phone.appendChild(dots);

  // 和第一页一样的卡片样式：英文小标 + 斜体名字 + 右上角线条图标
  const iconHtml = (k) => {
    const [name, icon, , kicker] = APPS[k];
    const img = icons[k];
    const ico = img ? `<img class="home-app-icon" src="${img}" alt="" />` : `<i class="ph ${icon}"></i>`;
    return `<button type="button" class="desk-app app-nora${img ? " has-home-app-icon" : ""}" data-k="${k}"><span class="app-nora-k">${kicker}</span><strong>${name}</strong>${ico}</button>`;
  };

  function render() {
    const keepLeft = pager.scrollLeft;
    pager.querySelectorAll(".desk-apps, .desk-newpage").forEach((n) => n.remove());
    layout.forEach((keys, i) => {
      const pg = document.createElement("section");
      pg.className = "desk-page desk-apps";
      pg.dataset.pg = String(i);
      pg.innerHTML = `${editing && i > 0 ? `<button type="button" class="desk-delpage" data-delpage="${i}">删除这一页</button>` : ""}<div class="desk-apps-grid" data-grid="${i}">${keys.map(iconHtml).join("")}</div>${
        !keys.length ? `<p class="desk-empty">${editing ? "把图标拖到这里" : "这一页还空着，长按进入编辑，把图标拖过来"}</p>` : ""
      }`;
      if (i === 0) pg.insertBefore(widgetSlot, pg.firstChild);
      pager.appendChild(pg);
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
      while (layout.length > 1 && !layout[layout.length - 1].length) layout.pop();
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
  editBar.querySelector(".desk-icons-btn").addEventListener("click", () => {
    setEditing(false);
    if (typeof window.openDeskIcons === "function") window.openDeskIcons(false);
  });

  /** 从 DOM 顺序读回布局 */
  function readLayoutFromDom() {
    layout = [...pager.querySelectorAll(".desk-apps-grid")].map((g) => [...g.querySelectorAll(".desk-app")].map((b) => b.dataset.k));
  }

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
        layout[i - 1].push(...layout[i]);
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

  /* 拖动排序 */
  let drag = null;
  pager.addEventListener("pointerdown", (e) => {
    if (!editing) return;
    const app = e.target.closest(".desk-app");
    if (!app) return;
    e.preventDefault();
    drag = { el: app, sx: e.clientX, sy: e.clientY, started: false, ghost: null, edgeTimer: 0, edgeDir: 0 };
    app.setPointerCapture?.(e.pointerId);
  });
  document.addEventListener(
    "pointermove",
    (e) => {
      if (!drag) return;
      if (!drag.started) {
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
        drag.started = true;
        const r = drag.el.getBoundingClientRect();
        const g = drag.el.cloneNode(true);
        g.className = "desk-app app-nora desk-ghost";
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
            const lastAppPage = layout.length; // 不能拖到第 1 页（原桌面），也不进「新建一页」
            if (next >= 1 && next <= lastAppPage) {
              goPage(next);
              setTimeout(() => {
                const grid = pager.querySelector(`[data-grid="${next - 1}"]`);
                if (grid && drag) grid.appendChild(drag.el);
              }, 320);
            }
            drag.edgeTimer = setTimeout(flip, 900);
          }, 600);
        }
      }
      // 插到指针下的图标前后
      drag.ghost.style.visibility = "hidden";
      const under = document.elementFromPoint(e.clientX, e.clientY);
      drag.ghost.style.visibility = "";
      const target = under?.closest(".desk-app");
      if (target && target !== drag.el && pager.contains(target)) {
        const tr = target.getBoundingClientRect();
        const after = e.clientX > tr.left + tr.width / 2;
        target.parentNode.insertBefore(drag.el, after ? target.nextSibling : target);
      } else {
        const grid = under?.closest(".desk-apps")?.querySelector(".desk-apps-grid");
        if (grid && !grid.contains(drag.el) && !grid.querySelector(".desk-app")) grid.appendChild(drag.el);
      }
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
      readLayoutFromDom();
      saveLayout();
      render();
    }
    drag = null;
  };
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);

  render();
  window.addEventListener("resize", renderDots);
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
