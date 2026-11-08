"use strict";

/**
 * 弥弥 · 手机小管家
 * - 熟悉 Meow 每个功能，回答「在哪、怎么用」，还能直接帮你打开应用
 * - 有 API Key：用 AI 回答；回答里的 [[打开:应用名]] 会变成按钮
 * - 没有 Key：按关键词从内置说明书里找答案
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast } = F;
  const KV = "mimi_chat_v1";

  /* ───── 能打开的应用 ───── */
  const call = (fn) => () => (typeof window[fn] === "function" ? window[fn]() : toast("还在加载，稍等一下"));
  const fun = (k) => () => window.openFunApp?.(k);
  const OPEN = {
    聊天: call("openChatListScreen"),
    查岗: call("openCheckupScreen"),
    关系: call("openRelationScreen"),
    角色人设: call("openCharScreen"),
    人设: call("openCharScreen"),
    漫游: call("openRoamScreen"),
    我的: call("openMyScreen"),
    设置: call("openSettings"),
    装扮: call("openWardrobeScreen"),
    世界书: call("openWorldBookScreen"),
    论坛: call("openForumScreen"),
    更新公告: call("openChangelog"),
    Bubble: fun("Bubble"),
    情侣小屋: fun("情侣小屋"),
    音乐: fun("音乐"),
    刷刷: fun("短视频"),
    喵博: fun("微博"),
    微博: fun("微博"),
    Sprout: fun("Sprout"),
    "Meow Mart": fun("Meow Mart"),
    "Pocket Town": fun("Pocket Town"),
    星座: fun("星座"),
    游戏厅: fun("游戏厅"),
    联机: fun("联机"),
    天气: fun("天气"),
    喵了个喵: fun("喵了个喵"),
    猫爪琴键: fun("猫爪琴键"),
    换装小屋: fun("换装小屋"),
    情侣扫雷: fun("情侣扫雷"),
    资源站: fun("资源站"),
    柚子: fun("柚子"),
    名字生成器: fun("名字生成器")
  };

  /* ───── 说明书（同时给 AI 当参考、给离线模式查） ───── */
  const GUIDE = [
    ["桌面", "桌面有两页：第一页是聊天、查岗、关系、人设、漫游、我的；左滑到第二页是其他应用。在第二页长按图标进入编辑，可以拖动换位置、拖到边缘翻页、滑到最后「新建一页」，点「完成」保存。"],
    ["小组件", "我的 → 装扮 → 桌面小组件 → 管理小组件。有照片、音乐、便签、倒数日、时钟、情侣天数、角色、今日运势，放在桌面第二页顶部。"],
    ["图标 换图标", "我的 → 装扮 → 04 桌面图标，点应用后面的「上传」选图片就能换，第一页和第二页的应用都在这里。Dock 栏（最底下圆形按钮）的图标在下一块单独设置。桌面编辑模式顶部的「图标」按钮也能直接跳过去。"],
    ["壁纸 背景", "我的 → 装扮 → 桌面主屏墙纸，上传图片就行。时间卡片、应用卡片、Dock 栏也能各自换背景。"],
    ["字体", "我的 → 装扮 → 全局字体：点本地上传选 .ttf/.otf/.woff2 字体文件（30MB 以内），名字会自动填好，再点保存。下面还能调字号。"],
    ["状态栏", "我的 → 装扮 → 隐藏顶部状态栏，打开开关就能隐藏桌面最上面那行时间、电量。"],
    ["装扮 分享 导出 导入", "我的 → 装扮 最上面「装扮卡片」：导出为 PNG 可以把整套装扮发给朋友，导入 PNG 可以用别人的装扮。也可以在资源站分享。"],
    ["API key 模型 接口", "我的 → 设置 里填 AI 的 API 地址、Key 和模型，填好才能和角色聊天。生图在 设置 → 生图 里配置。"],
    ["角色 角色卡 新建", "打开「角色人设」新建角色、写人设。导入 Meow 角色卡点「导入 PNG」，导出点「导出为 PNG」。导入酒馆（SillyTavern）角色卡需要专属激活码。"],
    ["激活码 酒馆 SillyTavern", "「导入 SillyTavern 卡」需要输入专属激活码才能用，激活码要找发码的人要。激活一次这台设备就一直能用。"],
    ["世界书", "打开「世界书」管理设定资料。右上角可以导入 PNG / 导出 PNG。每个聊天要用哪些世界书，在聊天设置里绑定。"],
    ["聊天设置 卷宗", "在聊天界面点右上角 ⋮ 打开聊天设置：可以改备注、记忆条数、主动发消息、异地模式、背景图、绑定世界书等等，每一项下面都有说明。"],
    ["查找 搜索 聊天记录", "在聊天界面点右上角的放大镜，输入关键字就能找聊天记录，点结果会跳到那条消息。"],
    ["锁脸 生图 立绘", "聊天设置 → 角色立绘 · 生图参考：放一张 TA 的参考图，下面「锁脸程度」可以选关闭 / 轻 / 中 / 强 / 强制锁脸。越强生成的图越像参考图里的脸。"],
    ["资源站 广场 上传 分享", "资源站可以下载别人分享的美化、世界书、角色卡、预设、字体。先点赞才能导入。上传：「制作卡片」选内容和分类，或者「批量上传」一次传好几张卡片。"],
    ["音乐 听歌", "音乐 app 可以上传歌曲、贴链接、搜索试听，还能和角色一起听。网易云 VIP 歌曲会跳到网易云 App 播放。"],
    ["游戏 游戏厅", "游戏厅有 UNO、狼人杀、情侣扫雷、谁是卧底、真心话大冒险、你画我猜（和角色一起玩），还有单人的喵了个喵（叠层消除）、猫爪琴键，以及换装小屋（给你和角色的小人换衣服，TA 也会帮你搭）。"],
    ["联机 一起 别的用户 朋友 好友 群聊", "「联机」：把你的 Meow 号发给朋友，互相加好友后就能私聊、拉群。对方不在线也能收到消息。每个人可以带一个自己的角色进来，TA 会一起聊天，还能一起玩掷骰子、数字炸弹、真心话大冒险。[[打开:联机]]"],
    ["天气 温度 穿什么 穿搭 下雨 带伞", "「天气」：看温度、体感温度、风向风力、湿度、紫外线和 7 天预报，还会推荐今天穿什么，也可以让角色帮你搭配。[[打开:天气]]"],
    ["网易云 会员 登录 歌单", "音乐 → 搜歌 → 「登录会员」：用网易云 App 扫码登录你自己的账号，会员歌曲也能在小手机里听完整版；「☁ 网易云歌单」可以一键导入你的歌单。[[打开:音乐]]"],
    ["情侣扫雷", "游戏厅 → 情侣扫雷：你和 TA 各一块雷盘轮流点，先踩雷的输，输的人要接受惩罚。"],
    ["情侣小屋", "情侣小屋是和恋人角色的情侣空间：日记、清单、问答、纪念日、相册、一起养宠物，还能生成小剧场。"],
    ["钱包 购物 外卖 Meow Mart", "Meow Mart 可以逛淘宝、点外卖，用「我的 → 钱包」里的钱付款，没钱了先去钱包充值。"],
    ["喵博 微博 刷刷 Sprout", "喵博（以前叫微博）看热搜和角色动态、CP 超话；刷刷是短视频；Sprout 是种草笔记（像小红书）。"],
    ["星座", "星座 app 有今日运势、角色星座档案、星座合盘和星盘。"],
    ["Pocket Town 小镇", "Pocket Town 里你是镇长，可以看角色和 NPC 每天在小镇里做什么。"],
    ["Bubble 爱豆", "Bubble 里你可以扮演爱豆和粉丝聊天，粉丝由 AI 生成。"],
    ["更新 公告", "第二页的「更新公告」可以看最近更新了什么。如果主屏幕上的图标没更新，把它从后台彻底划掉再打开。"],
    ["柚子 经期 姨妈 例假", "柚子是经期记录：来了点「经期来了」，结束点「经期结束了」，日历上可以补记。会自动预测下次经期。下面「让 TA 提醒我」选一位角色，经期快来时 TA 会提醒你；开「与记忆共通」提醒会发进你们的聊天里。"],
    ["名字 起名 取名", "名字生成器：填姓、选性别和字数、出处（诗经、楚辞、唐诗、宋词…），点「取名」就会给一批有诗词出处的名字，可以收藏、复制。"],
    ["让TA选 选择 想文案 选歌 吃什么 穿什么", "在聊天里点「+」→「让 TA 选」：可以让 TA 帮你选歌、吃什么、穿什么、喝什么，或者帮你想朋友圈 / 小红书文案。会用你的口吻发给 TA，聊天和记忆是同一份。"],
    ["数据 备份 换手机", "数据都存在这台设备的浏览器里。换手机或换网址前，先在 我的 里导出备份，再到新的地方导入。"]
  ];
  const APP_NAMES = Object.keys(OPEN);

  function sysPrompt(user) {
    return `你是「弥弥」，Meow 小手机里的手机小管家，一只白色噪点小猫。说话可爱、简短、耐心，句尾偶尔带「喵」，称呼用户为「${user.name && user.name !== "我" ? user.name : "你"}」。
你的工作：回答用户关于 Meow 怎么用的问题，告诉他在哪里、怎么点；用户想打开某个应用时帮他打开。
规则：
- 只根据下面的说明书回答，不知道就老实说不确定，建议去「更新公告」或问发码的人，不要编造功能。
- 步骤用「A → B → C」的写法，尽量 3 句话以内。
- 需要打开应用时，在回答最后单独写 [[打开:应用名]]，应用名只能是：${APP_NAMES.join("、")}。
- 用户只是闲聊也可以陪他聊两句，但别太长。

【Meow 说明书】
${GUIDE.map(([k, v]) => `· ${k.split(" ")[0]}：${v}`).join("\n")}`;
  }

  /** 没有 Key 时按关键词找 */
  function offlineAnswer(q) {
    const s = q.toLowerCase();
    const openHit = APP_NAMES.find((n) => /打开|进入|去/.test(q) && q.includes(n));
    if (openHit) return `好的喵，帮你打开「${openHit}」~ [[打开:${openHit}]]`;
    let best = null;
    let score = 0;
    for (const [k, v] of GUIDE) {
      const sc = k.split(" ").reduce((n, w) => n + (s.includes(w.toLowerCase()) ? w.length + 1 : 0), 0);
      if (sc > score) {
        score = sc;
        best = v;
      }
    }
    if (best) return best;
    return "这个弥弥还不太懂喵…可以换个说法问问，比如「怎么换壁纸」「怎么导入角色卡」「游戏厅有什么」。（填好 API Key 后弥弥会更聪明哦）";
  }

  let root = null;
  let hist = [];
  let avatar = ""; // 自定义头像（dataURL），空 = 默认小猫
  const AV_KEY = "mimi_avatar_v1";
  const avHtml = () => (avatar ? `<span class="mimi-av has-img"><img src="${avatar}" alt="" /></span>` : `<span class="mimi-av">🐱</span>`);
  /** 选图 → 居中裁成正方形 200px */
  function pickAvatar() {
    return new Promise((resolve) => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = "image/*";
      inp.onchange = () => {
        const f = inp.files && inp.files[0];
        if (!f) return resolve(null);
        const url = URL.createObjectURL(f);
        const img = new Image();
        img.onload = () => {
          const S = 200;
          const c = document.createElement("canvas");
          c.width = c.height = S;
          const m = Math.min(img.naturalWidth, img.naturalHeight);
          c.getContext("2d").drawImage(img, (img.naturalWidth - m) / 2, (img.naturalHeight - m) / 2, m, m, 0, 0, S, S);
          URL.revokeObjectURL(url);
          resolve(c.toDataURL("image/jpeg", 0.88));
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          toast("这张图片打不开");
          resolve(null);
        };
        img.src = url;
      };
      inp.click();
    });
  }
  function avatarMenu() {
    const sh = F.openSheet(
      `<div class="fun-sheet-actions mimi-av-acts">
        <div class="mimi-av-big">${avHtml()}</div>
        <button type="button" class="fun-btn solid" data-av="pick">从相册选一张当头像</button>
        ${avatar ? `<button type="button" class="fun-btn ghost" data-av="reset">换回默认小猫</button>` : ""}
      </div>`,
      { title: "给弥弥换头像" }
    );
    sh.body.addEventListener("click", async (e) => {
      const d = e.target.closest("[data-av]")?.dataset.av;
      if (!d) return;
      sh.close();
      if (d === "reset") avatar = "";
      else {
        const src = await pickAvatar();
        if (!src) return;
        avatar = src;
      }
      try {
        await F.FunDB.set(AV_KEY, avatar);
      } catch (_) {
        /* ignore */
      }
      drawHead();
      draw();
      toast(avatar ? "弥弥换好新头像啦" : "换回默认小猫了");
    });
  }
  function drawHead() {
    const h = root?.querySelector(".mimi-head");
    if (h) h.innerHTML = `${avHtml()}<span><b>弥弥</b><small>手机小管家 · 点头像可以换</small></span><button type="button" class="chip ghost chip-xs" data-avmenu>换头像</button>`;
  }
  async function save() {
    try {
      await F.FunDB.set(KV, hist.slice(-60));
    } catch (_) {
      /* ignore */
    }
  }
  function bubble(m) {
    const acts = [];
    const text = String(m.text || "").replace(/\[\[打开[:：]\s*([^\]]+?)\s*\]\]/g, (_, n) => {
      if (OPEN[n] && !acts.includes(n)) acts.push(n);
      return "";
    });
    return `<div class="mimi-msg${m.me ? " is-me" : ""}">${m.me ? "" : avHtml()}<div class="mimi-b"><p>${esc(text.trim()).replace(/\n/g, "<br>")}</p>${acts
      .map((n) => `<button type="button" class="mimi-open" data-open="${esc(n)}">打开「${esc(n)}」 →</button>`)
      .join("")}</div></div>`;
  }
  function draw() {
    if (!root) return;
    const list = root.querySelector(".mimi-list");
    list.innerHTML = hist.map(bubble).join("") + (busy ? `<div class="mimi-msg">${avHtml()}<div class="mimi-b"><p class="mimi-typing">弥弥在想…</p></div></div>` : "");
    list.scrollTop = list.scrollHeight;
  }
  let busy = false;
  async function ask(q) {
    q = String(q || "").trim();
    if (!q || busy) return;
    hist.push({ me: true, text: q });
    busy = true;
    draw();
    let a = "";
    if (F.hasApiKey()) {
      try {
        const user = await F.loadUser();
        const msgs = [{ role: "system", content: sysPrompt(user) }];
        for (const m of hist.slice(-12)) msgs.push({ role: m.me ? "user" : "assistant", content: m.text });
        a = await F.aiText(msgs, { maxTokens: 500, temperature: 0.6 });
      } catch (err) {
        a = offlineAnswer(q) + `\n（AI 暂时连不上：${err.message}）`;
      }
    } else a = offlineAnswer(q);
    busy = false;
    if (!root) return;
    hist.push({ me: false, text: a });
    draw();
    void save();
  }

  const QUICK = ["这个手机都有什么功能？", "怎么换壁纸和图标？", "怎么导入角色卡？", "API 在哪里填？", "帮我打开音乐"];

  F.register("弥弥", {
    title: "弥弥",
    kicker: "PHONE BUTLER",
    async mount(body) {
      root = document.createElement("div");
      root.className = "mimi";
      root.innerHTML = `<div class="mimi-head"></div><div class="mimi-list"></div>
        <div class="mimi-quick">${QUICK.map((q) => `<button type="button" class="fun-chip-btn" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>
        <form class="mimi-bar"><input type="text" placeholder="问问弥弥，比如：怎么换字体" enterkeyhint="send" /><button type="submit" class="fun-btn solid">发送</button></form>`;
      body.appendChild(root);
      try {
        hist = (await F.FunDB.get(KV)) || [];
        avatar = (await F.FunDB.get(AV_KEY)) || "";
      } catch (_) {
        hist = [];
      }
      drawHead();
      if (!root) return;
      if (!hist.length) {
        const user = await F.loadUser();
        const nm = user.name && user.name !== "我" ? user.name : "你";
        hist.push({ me: false, text: `${nm}好呀，我是弥弥，这台 Meow 的小管家喵~\n哪里不会用、找不到在哪，都可以问我；想打开哪个应用也可以直接跟我说。` });
      }
      draw();
      const inp = root.querySelector(".mimi-bar input");
      root.querySelector(".mimi-bar").addEventListener("submit", (e) => {
        e.preventDefault();
        const v = inp.value;
        inp.value = "";
        void ask(v);
      });
      root.addEventListener("click", (e) => {
        if (e.target.closest("[data-avmenu]") || e.target.closest(".mimi-head .mimi-av, .mimi-msg .mimi-av")) return void avatarMenu();
        const q = e.target.closest("[data-q]");
        if (q) return void ask(q.dataset.q);
        const o = e.target.closest("[data-open]");
        if (o && OPEN[o.dataset.open]) OPEN[o.dataset.open]();
      });
    },
    unmount() {
      root = null;
      busy = false;
    }
  });
})();
