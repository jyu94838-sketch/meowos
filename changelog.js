"use strict";

/**
 * 更新公告
 * - 每次发版在 CHANGELOG 最前面加一条（v 递增）
 * - 打开网站进入桌面后，如果有没看过的版本，就弹出这些版本的更新内容
 * - 桌面第二页「更新公告」可以随时查看全部历史
 */
(function () {
  const CHANGELOG = [
    {
      v: 11,
      date: "2026-11-07",
      title: "桌面可以自己排了",
      items: [
        "桌面第二页现在一进来就有，不用再等几秒",
        "在应用页长按图标进入编辑：拖动换位置，拖到屏幕边缘可以翻到别的页",
        "编辑时滑到最后可以「新建一页」，第三页、第四页都行；不要的页可以删除（图标会放回前一页）",
        "布局会保存在这台设备上，点「完成」退出编辑"
      ]
    },
    {
      v: 10,
      date: "2026-11-07",
      title: "星盘 · 情侣小剧场 · AI 配图",
      items: [
        "星座新增「星盘」：填出生日期、时间、城市，算出行星落座、上升、宫位和相位，AI 帮你解读；角色也能排星盘，合盘会参考双方星盘",
        "情侣小屋新增「小剧场」：选主题或自己写设定，还能套用你的小剧场预设",
        "配好「设置 → 生图」后，Sprout 笔记、刷刷视频、情侣小剧场都能一键 AI 配图",
        "「我的 → 装扮」可以隐藏顶部状态栏"
      ]
    },
    {
      v: 9,
      date: "2026-11-07",
      title: "资源站支持预设和字体 · 更新公告",
      items: [
        "资源站新增「🧩 预设」：小剧场、晤面文风、密谈样式、晤面样式、生图预设都能做成资源卡分享",
        "资源站新增「🔤 字体」：分享你的字体设置（可带字体文件），卡片封面会用这款字体写示例",
        "新增更新公告：每次更新后打开会告诉你更新了什么，桌面第二页也能随时翻看"
      ]
    },
    {
      v: 8,
      date: "2026-11-07",
      title: "桌面小组件",
      items: ["「我的 → 装扮」新增桌面小组件：照片、音乐、便签、倒数日、时钟、情侣天数、角色、今日运势", "小组件显示在桌面第二页，可调大小和顺序"]
    },
    {
      v: 7,
      date: "2026-11-07",
      title: "全新开屏 · 桌面第二页",
      items: ["开屏换成白色噪点小猫（背影）", "新图标", "桌面左右滑动翻页，第二页放全部应用"]
    },
    {
      v: 6,
      date: "2026-11-07",
      title: "Sprout · Meow Mart · 音乐搜歌",
      items: [
        "Sprout 种草社区：瀑布流笔记、搜索、收藏、评论",
        "Meow Mart：喵淘网购 + 外卖，用钱包付款，可以送给角色",
        "音乐：在线搜歌试听、粘贴网易云分享链接完整播放免费歌曲，VIP 歌一键跳网易云"
      ]
    },
    {
      v: 5,
      date: "2026-11-07",
      title: "星座 · 情侣小屋 · 微博",
      items: ["星座：今日运势、角色星座档案、星座合盘", "情侣小屋：恋爱日记、清单、每日一问、纪念日、相册、一起养宠物", "微博：热搜、首页、CP 超话和个人超话"]
    },
    {
      v: 4,
      date: "2026-11-07",
      title: "Pocket Town · 改名 Meow OS",
      items: ["Pocket Town 口袋小镇：你是镇长，看角色和 NPC 的工作日常", "网站正式改名 Meow OS"]
    },
    {
      v: 3,
      date: "2026-11-07",
      title: "资源站 · Bubble · 游戏厅",
      items: [
        "资源站：美化 / 世界书 / 角色卡做成专属 PNG，共享广场上传下载",
        "Bubble：你当爱豆，粉丝读懂你的每句话",
        "游戏厅：飞行棋、谁是卧底、真心话大冒险、你画我猜，战绩会被角色记住",
        "音乐：歌词、和角色一起听"
      ]
    },
    {
      v: 1,
      date: "2026-11-07",
      title: "音乐 · 刷刷 · UNO · 狼人杀",
      items: ["音乐播放器", "刷刷短视频", "和角色玩 UNO、狼人杀"]
    }
  ];
  const LATEST = CHANGELOG[0].v;
  const SEEN_KEY = "meowos_seen_version";

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
        <div class="mx-cl-list">${entries
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
    if (seen >= LATEST) return;
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
