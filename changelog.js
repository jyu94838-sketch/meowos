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
      v: 10,
      date: "2026-11-08",
      title: "换装小屋",
      items: [
        "游戏厅新增「换装小屋」：你和角色各有一个 Q 版小人，可以给自己换装，也可以给 TA 换；发型、眼睛、上衣、裙子、鞋子、配饰、背景都能选颜色",
        "让 TA 给自己搭一身、给你搭一身，TA 会按自己的审美挑，还会说一句；点「给 TA 看看」听 TA 评价你搭的衣服",
        "两个小人可以存成一张图片",
        "惩罚尺度的选项名字改成「刺激大胆」"
      ]
    },
    {
      v: 9,
      date: "2026-11-08",
      title: "改名 Meow · 两个新小游戏",
      items: [
        "名字改成 Meow 啦：开屏、标题、桌面图标名字、各处文字都换了（网址不变）",
        "游戏厅新增「喵了个喵」：叠层消除，点没被压住的牌放进槽里，凑齐 3 张就消掉；一共 3 关，每关能用一次移出、撤回、洗牌",
        "游戏厅新增「钢琴块」：只点黑块，越弹越快，弹对会放出小星星、欢乐颂、卡农、致爱丽丝的旋律"
      ]
    },
    {
      v: 8,
      date: "2026-11-08",
      title: "联机 · 网易云会员 · 聊天页细节",
      items: [
        "新应用「联机」：建房间把房间号发给朋友，或者去公共大厅；每个人可以带上自己的角色，TA 会一起聊天，还能一起玩掷骰子、数字炸弹、真心话大冒险",
        "网易云：可以扫码登录你自己的网易云账号，会员歌曲在小手机里也能听完整版；还能一键导入你的歌单，网易云的歌会自动带上歌词",
        "聊天设置里可以调聊天字体大小（所有聊天通用）",
        "微信 / QQ 风格：每条气泡都带头像，点头像就能看心声；夜间模式下引用的内容也看得清了",
        "角色发图锁脸修好了：没设参考立绘时用头像兜底，常见的中转生图模型也会带上立绘",
        "角色人设和你的面具都可以设置性别",
        "音乐、情侣小屋小组件可以换背景图（小组件 → 设置）",
        "更新公告、微博超话内容显示完整；Bubble 的人设不限字数",
        "角色档案底部的「导入 / 导出 Meow 卡」按钮变大了"
      ]
    },
    {
      v: 7,
      date: "2026-11-08",
      title: "网易云曲库 · 小组件随便放",
      items: [
        "音乐搜歌直接搜网易云曲库，免费歌曲在小手机里就能听完整版；标了 VIP 的点「去听」跳网易云 App",
        "小组件可以随便放了：长按桌面进入编辑，小组件和图标一样拖到任意位置，被挤开的图标会自动让位",
        "聊天页整体跟着风格走：微信风 / QQ 风下，顶栏、输入框也换成对应样式，去掉了原来的角色大卡片（点顶栏名字还能看心声）",
        "下载的图片、导出的文件名改成 Meow，通知标题也改成 Meow"
      ]
    },
    {
      v: 6,
      date: "2026-11-08",
      title: "开屏和桌面加载提速",
      items: [
        "开屏提速：打开过一次之后，脚本和图标都直接从手机本地读，不再每个文件都去网上问一遍",
        "所有脚本改成一起下载，第一次打开和更新后也快很多",
        "网络很慢时最多等 3 秒就先用本地版本，不会一直卡在开屏",
        "开屏提前点了也没关系，会显示「马上就好」，加载完自动进入",
        "第二页的应用在加载完之前点了不会再没反应：会提示「正在打开」，加载好自动打开"
      ]
    },
    {
      v: 5,
      date: "2026-11-08",
      title: "网易云 · 风格包修复",
      items: [
        "音乐：搜歌里新增「去网易云搜，听完整版」，每首歌后面也有 ☁；在网易云复制分享链接后回来，会提示「粘贴并播放」",
        "音乐歌单上方新增「📋 粘贴网易云」：复制了网易云链接，点一下直接加进歌单播放",
        "修复：自己设置过聊天 CSS 主题时，微信风 / QQ 风气泡不生效的问题",
        "修复：国内 / 安卓打开时图标全白；iPhone 开屏底部闪白条",
        "小组件放进桌面格子里：小号占 2×2、中号占一行两格高，旁边空出来的地方可以放应用",
        "「让 TA 选」的选歌、穿什么、想文案、自定义可以上传真图片，TA 能直接看图（需要模型支持识图）"
      ]
    },
    {
      v: 4,
      date: "2026-11-07",
      title: "柚子 · 名字生成器",
      items: [
        "新应用「柚子」：记录经期、自动预测下次经期和易孕期；可以选一位角色在经期快来时提醒你，开「与记忆共通」提醒会发进你们的聊天里",
        "新应用「名字生成器」：从诗经、楚辞、唐诗宋词里取名字，附出处原句和寓意，可以收藏、复制",
        "「让 TA 选」新增「想文案」：让 TA 帮你想朋友圈、小红书、签名、祝福的文案"
      ]
    },
    {
      v: 3,
      date: "2026-11-07",
      title: "让 TA 选 · 朋友圈分享音乐",
      items: [
        "聊天「+」里新增「让 TA 选」：选歌（可以附一张图）、吃什么、穿什么、喝什么、自定义，TA 按自己的性格帮你选，聊天和记忆是同一份",
        "TA 推荐歌时会冒出「去听《歌名》」按钮，一点就去音乐里搜",
        "聊天设置新增「分享音乐到朋友圈」：TA 发朋友圈时会分享一首歌并配应景的文案，也可以点「让 TA 现在分享一首」；朋友圈里点歌曲卡片就能去听"
      ]
    },
    {
      v: 2,
      date: "2026-11-07",
      title: "风格包 · 小猫卡片",
      items: [
        "装扮页最上面新增「风格包」：聊天可以换成微信风、QQ 风（气泡 + 聊天列表一起换），桌面可以换成奶油小猫；每套都能查看源码、复制去改",
        "聊天设置新增「隐藏头像」，只对这个聊天生效",
        "桌面第二页整页都是格子，图标可以拖到任何空位（可以留空位），拖到别的图标上会互换位置",
        "资源卡 PNG 换成可爱小猫系列（每种资源一只不同的猫），标题不会再和副标题叠在一起",
        "弥弥可以换头像了：点她的头像或右上角「换头像」"
      ]
    },
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
