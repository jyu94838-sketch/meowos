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
      v: 6,
      date: "2026-11-08",
      title: "天气 + 柚子社区",
      items: [
        "新应用「天气」：温度、体感温度、风向风力、湿度、紫外线、降水概率、日出日落，逐小时和 7 天预报；可以定位或搜索城市，存多个城市",
        "天气里会推荐 uu 今天穿什么出门（按体感、下雨、风力、紫外线），还能让角色用自己的语气帮你搭配",
        "柚子的「女性健康」变成了大家一起交流的社区：匿名发帖分享经验、提问，按分类浏览，评论、点赞、回复、举报，自己发的可以删除",
        "原来的阶段小贴士、身体记录、健康小知识挪到柚子的「我的身体」页"
      ]
    },
    {
      v: 5,
      date: "2026-11-08",
      title: "关于 Meow · 新开屏和图标",
      items: [
        "设置里新增「关于 Meow」：Meow 是基于 Ruiya 的「没心机」二次创作的，再次感谢 Ruiya，再次感谢没心机 🤍",
        "开屏换回没心机最初的浅色开屏，标题改为 Meow OS",
        "新图标：淡淡的奶油吐司小猫，下面是奶油字 meow（主屏图标要删掉后重新添加才会换）",
        "新版本装好后，如果还停在开屏会自动刷新一次"
      ]
    },
    {
      v: 4,
      date: "2026-11-08",
      title: "联机：加好友、私聊、群聊",
      items: [
        "联机改成好友制：每人一个 8 位 Meow 号，输入对方的号就能加好友，可以私聊、拉群、改群名",
        "消息和好友申请存在服务器上：对方不在线也能收到，打开 Meow 就自动拉取；对方还没用过新版时，申请会自动等待重发",
        "每个人都能把自己的角色带进聊天，TA 会接话；还能一起玩掷骰子、数字炸弹、真心话大冒险",
        "旧版留在手机里的聊天记录会自动补传给对方",
        "联机首页新增「检测」，一步步告诉你连不上卡在哪里"
      ]
    },
    {
      v: 3,
      date: "2026-11-08",
      title: "换装小屋大改版",
      items: [
        "小人重画：头发改成一缕一缕的发束，有渐变和高光；五官改成圆圆的大眼睛、小嘴巴，更可爱",
        "男生女生分开：衣柜可以切换女生款 / 男生款，小人性别按人设自动设置",
        "新增男生发型：经典中分、后梳大背头、轻薄碎刘海、侧分卷发、低马尾、短发清爽款、长层次狼尾、纹理侧分、慵懒微卷",
        "新增女生发型：公主切、高马尾、侧编发；男生衣服、鞋子、配饰也多了很多"
      ]
    },
    {
      v: 2,
      date: "2026-11-08",
      title: "聊天体验修复",
      items: [
        "修复朋友圈等地方冒出一大段英文思考过程的问题",
        "角色写「【图片：…】」时现在会真的去生图，不再只显示文字",
        "你连发的气泡间隔和角色连发的一样了，聊天气泡整体间距调宽",
        "小剧场的群聊截屏、求助论坛完整显示，不再被截掉一半",
        "锁脸：参考图坏掉时会提示，并自动改用角色头像",
        "调字体大小和查找聊天记录都放进了聊天的「＋」面板"
      ]
    },
    {
      v: 1,
      date: "2026-11-08",
      title: "预设导入、柚子、小游戏",
      items: [
        "各处的预设和提示词框都可以直接导入 txt / json / docx 文件；保存的预设可以改名字",
        "柚子：可以自己设置经期长度和平均周期；身体不舒服时可以让角色知道并来关心你",
        "微博改名「喵博」，超话可以改名字",
        "人设和用户面具新增「性别」",
        "新游戏：喵了个喵、猫爪琴键、换装小屋",
        "情侣小屋的宠物可以选种类、生成图片、改名字"
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
