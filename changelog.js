"use strict";

/**
 * 更新公告
 * - 每次发版在 CHANGELOG 最前面加一条（v 递增）
 * - 打开网站进入桌面后，如果有没看过的版本，就弹出这些版本的更新内容
 * - 桌面第二页「更新公告」可以随时查看全部历史
 */
(function () {
  // 每次发版在最前面加一条，例如：
  // { v: 1, date: "2026-11-08", title: "标题", items: ["改了什么"] },
  const CHANGELOG = [
    {
      v: 1,
      date: "2026-11-07",
      title: "弥弥来啦 · 一大波改进",
      items: [
        "新应用「弥弥」：手机小管家，哪里不会用都可以问她，还能直接帮你打开应用",
        "聊天界面右上角新增放大镜：查找聊天记录",
        "聊天设置里每一项都加了白话说明；新增「锁脸程度」（关闭 / 轻 / 中 / 强 / 强制锁脸）",
        "世界书、角色人设、装扮都能「导出为 PNG」；装扮页最上面新增「装扮卡片」导入 / 导出",
        "资源站分类按类型分开（美化、世界书、角色卡各有自己的分类），选了类型才显示分类",
        "装扮页说明改成大白话；字体文件上限提高到 30MB，上传时自动填字体名",
        "桌面拖动图标修好了：空白处、两个图标之间都能放",
        "第二页应用的图标并进了「装扮 → 桌面图标」原来的列表里"
      ]
    }
  ];
  const LATEST = CHANGELOG.length ? CHANGELOG[0].v : 0;
  const SEEN_KEY = "meowos_seen_v3"; // 清空后重新计数

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function show(entries, isUpdate) {
    if (document.getElementById("mx-changelog")) return;
    const box = document.createElement("div");
    box.id = "mx-changelog";
    box.className = "mx-cl";
    box.innerHTML = `<div class="mx-cl-mask"></div>
      <div class="mx-cl-card" role="dialog" aria-label="更新公告">
        <p class="mx-cl-k">${isUpdate ? "WHAT'S NEW" : "CHANGELOG"}</p>
        <h3>${isUpdate ? "Meow OS 更新啦" : "更新公告"}</h3>
        <div class="mx-cl-list">${entries.length ? "" : `<p class="mx-cl-empty">暂时还没有更新公告</p>`}${entries
          .map(
            (e) => `<section><p class="mx-cl-ver"><b>${esc(e.title)}</b><small>v${e.v} · ${esc(e.date)}</small></p><ul>${e.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></section>`
          )
          .join("")}</div>
        <button type="button" class="mx-cl-ok">知道了</button>
      </div>`;
    (document.getElementById("phone") || document.body).appendChild(box);
    requestAnimationFrame(() => box.classList.add("is-open"));
    const close = () => {
      box.classList.remove("is-open");
      setTimeout(() => box.remove(), 250);
      try {
        localStorage.setItem(SEEN_KEY, String(LATEST));
      } catch (_) {
        /* ignore */
      }
    };
    box.querySelector(".mx-cl-ok").onclick = close;
    box.querySelector(".mx-cl-mask").onclick = close;
  }

  function maybeShowOnBoot() {
    let seen = 0;
    try {
      seen = Number(localStorage.getItem(SEEN_KEY)) || 0;
    } catch (_) {
      return;
    }
    if (!LATEST || seen >= LATEST) return;
    const entries = seen ? CHANGELOG.filter((e) => e.v > seen) : CHANGELOG.slice(0, 1);
    // 等开屏结束、桌面出来以后再弹
    const wait = () => {
      const splash = document.getElementById("boot-splash");
      if (splash && !splash.classList.contains("boot-splash--out")) return setTimeout(wait, 500);
      setTimeout(() => show(entries, true), 700);
    };
    wait();
  }

  window.openChangelog = () => show(CHANGELOG, false);
  maybeShowOnBoot();
})();
