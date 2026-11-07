"use strict";

/**
 * 桌面第二页：左右滑动切换，把所有 app 做成图标铺在桌面上
 * 第一页是原来的桌面（.layout-shell 原样搬进翻页容器，不改内部结构）
 */
(function () {
  const phone = document.getElementById("phone");
  const shell = phone && phone.querySelector(".layout-shell");
  if (!phone || !shell || document.getElementById("desk-pager")) return;

  const fun = (k) => () => (typeof window.openFunApp === "function" ? window.openFunApp(k) : null);
  const call = (fn) => () => {
    const f = window[fn];
    if (typeof f === "function") f();
    else if (typeof showToast === "function") showToast("模块还在加载，稍等一下");
  };
  /** [名称, Phosphor 图标, 色相, 打开方式] */
  const SECTIONS = [
    {
      title: "聊天与角色",
      apps: [
        ["聊天", "ph-chat-circle-text", 215, call("openChatListScreen")],
        ["Bubble", "ph-chat-teardrop-dots", 280, fun("Bubble")],
        ["角色人设", "ph-identification-card", 250, call("openCharScreen")],
        ["世界书", "ph-book-open-text", 30, call("openWorldBookScreen")],
        ["关系", "ph-heart-straight", 345, call("openRelationScreen")],
        ["查岗", "ph-device-mobile-camera", 190, call("openCheckupScreen")],
        ["漫游", "ph-footprints", 140, call("openRoamScreen")],
        ["情侣小屋", "ph-house-simple", 335, fun("情侣小屋")]
      ]
    },
    {
      title: "生活与娱乐",
      apps: [
        ["音乐", "ph-music-notes", 260, fun("音乐")],
        ["刷刷", "ph-film-strip", 0, fun("短视频")],
        ["微博", "ph-fire", 22, fun("微博")],
        ["Sprout", "ph-plant", 120, fun("Sprout")],
        ["论坛", "ph-newspaper", 205, call("openForumScreen")],
        ["Meow Mart", "ph-shopping-bag", 18, fun("Meow Mart")],
        ["Pocket Town", "ph-house-line", 95, fun("Pocket Town")],
        ["星座", "ph-moon-stars", 265, fun("星座")]
      ]
    },
    {
      title: "游戏与工具",
      apps: [
        ["游戏厅", "ph-game-controller", 300, fun("游戏厅")],
        ["资源站", "ph-package", 175, fun("资源站")],
        ["我的", "ph-user-circle", 230, call("openMyScreen")],
        ["设置", "ph-gear-six", 220, call("openSettings")]
      ]
    }
  ];

  const pager = document.createElement("section");
  pager.id = "desk-pager";
  pager.className = "desk-pager";
  shell.parentNode.insertBefore(pager, shell);
  pager.appendChild(shell);
  shell.classList.add("desk-page");

  const page2 = document.createElement("section");
  page2.className = "desk-page desk-apps";
  page2.setAttribute("aria-label", "全部应用");
  let i = 0;
  const handlers = [];
  page2.innerHTML = SECTIONS.map(
    (sec) =>
      `<p class="desk-apps-k">${sec.title}</p><div class="desk-apps-grid">${sec.apps
        .map(([name, icon, h, fn]) => {
          handlers.push(fn);
          return `<button type="button" class="desk-app" data-i="${i++}" style="--h:${h}"><span class="desk-app-ico"><i class="ph ${icon}"></i></span><span class="desk-app-name">${name}</span></button>`;
        })
        .join("")}</div>`
  ).join("");
  pager.appendChild(page2);
  page2.addEventListener("click", (e) => {
    const b = e.target.closest(".desk-app");
    if (b) handlers[Number(b.dataset.i)]();
  });

  const dots = document.createElement("div");
  dots.className = "desk-dots";
  dots.innerHTML = `<i class="is-on"></i><i></i>`;
  phone.appendChild(dots);
  const sync = () => {
    const p = Math.round(pager.scrollLeft / Math.max(1, pager.clientWidth));
    dots.children[0].classList.toggle("is-on", p === 0);
    dots.children[1].classList.toggle("is-on", p === 1);
  };
  pager.addEventListener("scroll", sync, { passive: true });
  dots.addEventListener("click", (e) => {
    const k = [...dots.children].indexOf(e.target);
    if (k >= 0) pager.scrollTo({ left: k * pager.clientWidth, behavior: "smooth" });
  });
  // 电脑上用鼠标滚轮横向切页
  pager.addEventListener(
    "wheel",
    (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 20) {
        e.preventDefault();
        pager.scrollTo({ left: (e.deltaX > 0 ? 1 : 0) * pager.clientWidth, behavior: "smooth" });
      }
    },
    { passive: false }
  );
})();
