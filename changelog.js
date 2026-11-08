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
      v: 5,
      date: "2026-11-08",
      title: "朋友圈配图开关 · 柚子论坛更热闹 · 线下生图",
      items: [
        "朋友圈「让谁发朋友圈」里可以选配图：「看角色自己」（TA 想配才配，不是每条都有图）或「关闭」",
        "朋友圈发动态后，角色卡「NPC 关系」里写到的 NPC 会先自动来评论（同一个面板里可以关掉）",
        "柚子的英文名改成 YOUZI",
        "女性健康论坛：点「刷新路人帖」会有路人网友来发帖、互相评论；你可以在路人帖下面评论，楼主还会回你",
        "女性健康论坛：点「让 TA 来求助」，角色可以帮你问（根据你记录的身体情况），也可以问 TA 自己的问题；可以发到社区让真人回复，也可以只在自己这儿让路人回复",
        "线下模式菜单新增「线下生图」：视情况自动生图 / 我自己点「现在给这一幕生一张图」/ 关闭生图"
      ]
    },
    {
      v: 4,
      date: "2026-11-08",
      title: "小号 / 马甲 · 游戏更流畅",
      items: [
        "聊天「＋」面板新增「我的小号」：开一个小号（名字、头像、对外人设），一键切换用小号给 TA 发消息；还能设定 TA 认不认得出是你",
        "聊天「＋」面板新增「TA 主动开马甲」：角色开了马甲的话，打开后 TA 会偶尔自己换成马甲来找你",
        "游戏厅玩游戏更流畅：打开游戏时不再在后台画桌面；减少了后台反复保存聊天记录造成的卡顿"
      ]
    },
    {
      v: 3,
      date: "2026-11-08",
      title: "新游戏：贪吃蛇",
      items: [
        "游戏厅新增贪吃蛇：单人、和角色组队（分数加在一起）、和角色对战（撞到别人也会挂）",
        "联机聊天里可以开「贪吃蛇 · 比分」各自比分，或「贪吃蛇 · 组队」大家的分数加起来过关，好友带来的角色也会一起"
      ]
    },
    {
      v: 2,
      date: "2026-11-08",
      title: "新图标",
      items: ["图标换成奶黄色底上一层雾蒙蒙的白色小猫背影（主屏图标要删掉后重新添加才会换）"]
    },
    {
      v: 1,
      date: "2026-11-08",
      title: "关于 Meow",
      items: ["「我的」里点「关于」，就能看到关于 Meow：Meow 是基于 Ruiya 的「没心机」二次创作的，再次感谢 Ruiya，再次感谢没心机 🤍"]
    }
  ];
  const LATEST = CHANGELOG.length ? CHANGELOG[0].v : 0;
  const SEEN_KEY = "meowos_seen_v4"; // 清空后重新计数

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function show(entries, isUpdate) {
    if (document.getElementById("mx-changelog")) return;
    const box = document.createElement("div");
    box.id = "mx-changelog";
    box.className = "mx-cl";
    box.innerHTML = `<div class="mx-cl-mask"></div>
      <div class="mx-cl-card" role="dialog" aria-label="更新公告">
        <p class="mx-cl-k">${isUpdate ? "WHAT'S NEW" : "CHANGELOG"}</p>
        <h3>${isUpdate ? "Meow 更新啦" : "更新公告"}</h3>
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
