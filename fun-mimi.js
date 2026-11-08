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
    小馋猫: fun("小馋猫"),
    贪吃蛇: fun("小馋猫"),
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
    ["联机 一起 别的用户 朋友 好友 群聊", "「联机」：把你的 Meow 号发给朋友，互相加好友后就能私聊、拉群。对方不在线也能收到消息。每个人可以带一个自己的角色进来，TA 会一起聊天，还能一起玩 UNO、谁是卧底、你画我猜、扫雷对战、真心话大冒险、比分挑战，或者晒换装小屋的搭配。[[打开:联机]]"],
    ["小馋猫 贪吃蛇 抢吃的", "「游戏厅 → 小馋猫」：几只小猫抢吃的，60 秒后看谁抢得多。可以单人玩，也可以选角色组队（分数加一起）或者对战；想和联机好友一起，就在联机聊天里点 🎲 选「小馋猫 · 比分」或「小馋猫 · 组队」。[[打开:小馋猫]]"],
    ["弥弥 改人设 改世界书 美化 帮我改", "弥弥（就是我）接上 API 后可以直接帮你改角色人设、你的面具、世界书，还能写 CSS 改界面美化；每次改动都会先给你看，点「确认修改」才生效，改错了可以「撤销」。右上角「API」可以给弥弥单独接一个模型。"],
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
    ["数据 备份 换手机", "数据都存在这台设备的浏览器里。换手机或换网址前，先在 我的 里导出备份，再到新的地方导入。联机的好友、群聊和消息也会跟着「密谈与消息」一起备份。"]
  ];
  const APP_NAMES = Object.keys(OPEN);
  /* ═════════ 弥弥的 API + 动手改东西（人设 / 世界书 / 美化） ═════════ */
  const API_LS = "meowos_mimi_api";
  const CSS_LS = "meowos_mimi_css";
  const lsGet = (k) => {
    try {
      return localStorage.getItem(k);
    } catch (_) {
      return null;
    }
  };
  const lsSet = (k, v) => {
    try {
      if (v == null || v === "") localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch (_) {
      toast("保存失败：存储空间不够了");
    }
  };
  /** 弥弥自己的 API：main=跟随主 API；profile=用某个已保存的 API 档；custom=单独填 */
  function readApi() {
    try {
      const o = JSON.parse(lsGet(API_LS) || "null");
      if (o && typeof o === "object") return { mode: "main", profileId: "", baseUrl: "", apiKey: "", model: "", ...o };
    } catch (_) {
      /* ignore */
    }
    return { mode: "main", profileId: "", baseUrl: "", apiKey: "", model: "" };
  }
  function resolveApi() {
    const a = readApi();
    if (a.mode === "custom" && String(a.apiKey || "").trim()) return { baseUrl: a.baseUrl, apiKey: a.apiKey, model: a.model, temperature: 0.6 };
    if (a.mode === "profile" && a.profileId) {
      const row = (window.XXJ_DB?.profilesList?.() || []).find((r) => r.id === a.profileId);
      if (row && String(row.apiKey || "").trim()) return { baseUrl: row.baseUrl, apiKey: row.apiKey, model: row.model, temperature: 0.6 };
    }
    return null;
  }
  const hasApi = () => !!resolveApi() || F.hasApiKey();
  async function mimiAi(messages, maxTokens) {
    const cfg = resolveApi();
    if (!cfg) return F.aiText(messages, { maxTokens, temperature: 0.6 });
    const data = await window.RP_AI.chatCompletions({ messages, max_tokens: maxTokens }, { completionConfig: cfg });
    const t = String(data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim();
    if (!t) throw new Error("模型没有返回内容");
    return t;
  }
  function apiSheet() {
    const a = readApi();
    const rows = window.XXJ_DB?.profilesList?.() || [];
    const sh = F.openSheet(
      `<div class="settings-panel settings-panel-api settings-panel--shine mimi-api" style="margin:0">
        <p class="settings-ai-blurb">弥弥要帮你改人设、世界书、美化，建议接一个聪明一点的模型。OpenAI 兼容接口，Key 只存在这台手机里。</p>
        <div class="settings-api-field">
          <label class="settings-api-field-k" for="mm-mode">接法</label>
          <select id="mm-mode" class="settings-ai-select">
            <option value="main" ${a.mode === "main" ? "selected" : ""}>跟随「设置」里的主 API</option>
            <option value="profile" ${a.mode === "profile" ? "selected" : ""}>用已保存的配置档案</option>
            <option value="custom" ${a.mode === "custom" ? "selected" : ""}>给弥弥单独接一个</option>
          </select>
        </div>
        <div class="settings-api-field" data-for="profile">
          <label class="settings-api-field-k" for="mm-prof">配置档案</label>
          <select id="mm-prof" class="settings-ai-select" ${rows.length ? "" : "disabled"}>${rows.length ? rows.map((r) => `<option value="${esc(r.id)}" ${r.id === a.profileId ? "selected" : ""}>${esc(r.name || r.model || r.baseUrl)}</option>`).join("") : `<option>还没有保存的配置档案</option>`}</select>
          <p class="settings-ai-key-note">配置档案在「设置 → 连接 API」里保存。</p>
        </div>
        <div class="settings-api-field" data-for="custom">
          <label class="settings-api-field-k" for="mm-base">API Base（含 /v1）</label>
          <input id="mm-base" class="settings-api-input" type="url" placeholder="https://api.openai.com/v1" autocomplete="off" spellcheck="false" value="${esc(a.baseUrl)}"/>
        </div>
        <div class="settings-api-field" data-for="custom">
          <label class="settings-api-field-k" for="mm-key">API Key</label>
          <input id="mm-key" class="settings-api-input" type="password" placeholder="sk-…" autocomplete="off" spellcheck="false" value="${esc(a.apiKey)}"/>
        </div>
        <div class="settings-api-field" data-for="custom">
          <label class="settings-api-field-k" for="mm-model">模型 model</label>
          <input id="mm-model" class="settings-api-input" type="text" list="mm-model-list" placeholder="gpt-4o-mini" autocomplete="off" spellcheck="false" value="${esc(a.model)}"/>
          <datalist id="mm-model-list"></datalist>
          <div class="settings-ai-model-tools"><button type="button" class="chip ghost chip-xs" data-x="models">拉取模型列表</button><span class="settings-ai-model-tools-k">GET /v1/models · 结果进联想</span></div>
        </div>
        <div class="settings-api-actions">
          <button type="button" class="chip solid chip-xs" data-x="ok">保存配置</button>
          <button type="button" class="chip ghost chip-xs" data-x="test">测试对话</button>
        </div>
        <p class="settings-api-line" id="mm-status">${resolveApi() ? "弥弥现在用的是单独的 API" : "弥弥现在跟随主 API"}</p>
      </div>`,
      { title: "给弥弥接 API" }
    );
    const $ = (q) => sh.body.querySelector(q);
    const sync = () => {
      const m = $("#mm-mode").value;
      sh.body.querySelectorAll("[data-for]").forEach((el) => (el.style.display = el.dataset.for === m ? "" : "none"));
    };
    sync();
    $("#mm-mode").addEventListener("change", sync);
    const collect = () => ({
      mode: $("#mm-mode").value || "main",
      profileId: rows.length ? $("#mm-prof").value : "",
      baseUrl: $("#mm-base").value.trim(),
      apiKey: $("#mm-key").value.trim(),
      model: $("#mm-model").value.trim()
    });
    const status = (t) => ($("#mm-status").textContent = t);
    sh.body.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-x]");
      const x = btn?.dataset.x;
      if (!x) return;
      const v = collect();
      if (x === "models") {
        if (!v.baseUrl || !v.apiKey) return toast("先填 API Base 和 Key");
        status("正在拉取模型…");
        try {
          const base = v.baseUrl.replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
          const res = await fetch(base + "/models", { headers: { Authorization: "Bearer " + v.apiKey } });
          const d = await res.json();
          const ids = (d.data || d.models || []).map((m) => m.id || m.name).filter(Boolean);
          if (!ids.length) throw new Error(d.error?.message || "没拉到模型");
          $("#mm-model-list").innerHTML = ids.map((id) => `<option value="${esc(id)}"></option>`).join("");
          if (!$("#mm-model").value) $("#mm-model").value = ids[0];
          status(`拉到 ${ids.length} 个模型，点模型框可以选`);
        } catch (err) {
          status("拉取失败：" + err.message);
        }
        return;
      }
      if (v.mode === "custom" && (!v.baseUrl || !v.apiKey)) return toast("API Base 和 Key 都要填");
      if (v.mode === "profile" && !rows.length) return toast("还没有保存的配置档案");
      const old = lsGet(API_LS);
      lsSet(API_LS, JSON.stringify(v));
      if (x === "ok") {
        sh.close();
        toast("弥弥接好 API 啦");
        drawHead();
        return;
      }
      btn.disabled = true;
      status("测试中…");
      try {
        const t = await mimiAi([{ role: "user", content: "回复两个字：在呢" }], 20);
        status("✅ 通了：" + t.slice(0, 30));
      } catch (err) {
        status("❌ 没通：" + err.message);
      } finally {
        lsSet(API_LS, old);
        btn.disabled = false;
      }
    });
  }

  /* ───── 美化：弥弥写的 CSS 单独存一份，全局生效，随时能清掉 ───── */
  function applyCss() {
    const css = lsGet(CSS_LS) || "";
    let el = document.getElementById("mx-mimi-css");
    if (!css) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement("style");
      el.id = "mx-mimi-css";
    }
    el.textContent = css;
    document.head.appendChild(el); // 放最后，盖过其他样式
  }
  applyCss();
  const CSS_GUIDE = `常用选择器（CSS 写给整台手机，必要时加 !important）：
- 聊天页 #chat-screen；消息区 #chat-screen .chat-messages；顶栏 #chat-screen .chat-screen-topbar
- 所有气泡 #chat-screen .chat-msg-bubble:not(.chat-msg-bubble--sticker):not(.chat-msg-bubble--typing)
- 用户气泡 #chat-screen .chat-msg--user .chat-msg-bubble:not(.chat-msg-bubble--sticker)；角色气泡 #chat-screen .chat-msg--assistant .chat-msg-bubble:not(.chat-msg-bubble--sticker)
- 头像 #chat-screen .chat-msg-avatar；输入框 #chat-screen .chat-composer .chat-input；底部输入区 #chat-screen .chat-composer
- 聊天列表 #chat-list-screen；会话卡片 #chat-list-screen .chat-thread-card；名字 .chat-thread-card-name
- 桌面 #phone；壁纸 #phone .wallpaper；时间卡片 #phone .hero-card；应用名 #phone .desk-app-name；图标 #phone .desk-app-ico；Dock #phone .dock-plate
- 深色模式加 body.dark 前缀。全局字体可写 #phone { font-family: ... }`;

  /* ───── 读取现有内容（给 AI 看） ───── */
  const g = (n) => (typeof window[n] === "function" ? window[n] : null);
  const findChar = (name) => {
    const st = g("readCharPersonaStore")?.() || { items: [] };
    const n = String(name || "").trim();
    return st.items.find((x) => String(x.displayName || "").trim() === n) || st.items.find((x) => n && String(x.displayName || "").includes(n));
  };
  const findVol = (name) => {
    const st = g("readWorldBookStore")?.() || { volumes: [] };
    const n = String(name || "").trim();
    return st.volumes.find((v) => v.title === n) || st.volumes.find((v) => n && v.title.includes(n));
  };
  const CHAR_FIELDS = { displayName: "名字", gender: "性别", aliases: "别名", summary: "人设摘要", tags: "标签", voice: "说话方式", boundaries: "边界/禁忌", npcRelations: "NPC 关系", charImageGenPrompt: "生图外貌 tag" };
  const MASK_FIELDS = { displayName: "名字", gender: "性别", persona: "人设", summary: "简介", voice: "说话方式", boundaries: "边界", region: "地区", userImageGenPrompt: "生图外貌 tag" };
  function overview() {
    const chars = (g("readCharPersonaStore")?.()?.items || []).map((x) => String(x.displayName || "").trim()).filter(Boolean);
    const vols = (g("readWorldBookStore")?.()?.volumes || []).map((v) => `${v.title}（${v.entries.length} 条）`);
    const mask = (() => {
      const st = g("readUserMaskStore")?.();
      const it = st?.items?.find((x) => x.id === st.activeId);
      return it ? String(it.displayName || "未命名") : "（没有）";
    })();
    const css = lsGet(CSS_LS) || "";
    return `【当前数据】\n角色：${chars.join("、") || "（还没有角色）"}\n用户当前面具：${mask}\n世界书：${vols.join("、") || "（还没有世界书）"}\n弥弥写过的美化 CSS：${css ? css.length + " 字" : "（还没有）"}`;
  }
  function readTarget(kind, name) {
    if (kind === "人设") {
      const it = findChar(name);
      if (!it) return `没有找到叫「${name}」的角色。`;
      return `角色「${it.displayName}」现在的设定：\n` + Object.entries(CHAR_FIELDS).map(([k, l]) => `${l}(${k})：${String(it[k] || "").slice(0, 4000) || "（空）"}`).join("\n");
    }
    if (kind === "我的人设") {
      const st = g("readUserMaskStore")?.();
      const it = st?.items?.find((x) => x.id === st.activeId);
      if (!it) return "用户还没有面具。";
      return `用户当前面具的设定：\n` + Object.entries(MASK_FIELDS).map(([k, l]) => `${l}(${k})：${String(it[k] || "").slice(0, 3000) || "（空）"}`).join("\n");
    }
    if (kind === "世界书") {
      const v = findVol(name);
      if (!v) return `没有找到叫「${name}」的世界书。`;
      let out = `世界书「${v.title}」（${v.scope === "global" ? "全局" : "局部"}）的条目：\n`;
      for (const e of v.entries) {
        if (out.length > 9000) {
          out += "……（后面还有，太长省略）";
          break;
        }
        out += `- 标题：${e.title}｜关键词：${e.keywords || "无"}｜${e.enabled ? "启用" : "停用"}\n  内容：${String(e.content || "").slice(0, 1200)}\n`;
      }
      return out;
    }
    if (kind === "美化") return `弥弥之前写的美化 CSS：\n${lsGet(CSS_LS) || "（还没有）"}`;
    return "不认识的查看类型。";
  }
  function toolPrompt() {
    return `

【你还能动手帮用户改东西】
用户让你改人设、世界书、美化（界面样式）时：
1. 需要先看现有内容就只回复查看指令（可以写多行，系统会把内容发给你，然后你再接着回答）：
[[查看:人设:角色名]]  [[查看:我的人设]]  [[查看:世界书:书名]]  [[查看:美化]]
2. 想好改法后，先用一两句话告诉用户你打算怎么改，然后在回答最后附上改动（一次可以附多个），用户点「确认」才会生效，还能撤销：
<<<改动
{"type":"persona","name":"角色名","fields":{"summary":"完整的新人设摘要"}}
>>>
· type=persona：改角色，fields 只写要改的字段，可用 ${Object.keys(CHAR_FIELDS).join(" / ")}；新建角色再加 "new":true。
· type=mask：改用户当前面具，fields 可用 ${Object.keys(MASK_FIELDS).join(" / ")}。
· type=worldbook：{"type":"worldbook","book":"书名","entries":[{"op":"add|update|delete","title":"条目标题","keywords":"关键词，逗号分隔","content":"条目内容"}]}；书不存在会新建。update 按标题找条目。
· type=css：{"type":"css","mode":"append 或 replace","css":"CSS 代码"}，用来改界面美化；append=加在之前的后面，replace=整个换掉；"mode":"clear" 是清掉弥弥写的美化。
3. 改人设 / 世界书要在原来基础上改，保留用户原有设定，只动用户要求的部分；字段值写完整的新内容，不要只写“同上”“略”。
4. JSON 必须合法（字符串里的换行写成 \\n），不要用代码块包。
5. 用户可能会发图片或文件给你：截图就看图帮他找问题、说在哪里点；角色卡 / 设定文档 / 世界书 JSON 可以按内容帮他整理成角色（type=persona 加 "new":true）或世界书；想要某种风格的图可以参考图里的配色写美化 CSS。
${CSS_GUIDE}
${overview()}`;
  }

  /* ───── 解析 / 展示 / 应用改动 ───── */
  function parseChanges(text) {
    const out = [];
    const rest = String(text || "").replace(/<<<\s*改动\s*([\s\S]*?)>>>/g, (_, body) => {
      const j = F.parseJsonLoose(body);
      const arr = Array.isArray(j) ? j : j ? [j] : [];
      for (const c of arr) if (c && typeof c === "object" && c.type) out.push({ ...c, status: "pending" });
      return "";
    });
    return { text: rest.trim(), changes: out };
  }
  const short = (s, n) => {
    const t = String(s ?? "");
    return t.length > n ? t.slice(0, n) + "…" : t;
  };
  function changeHtml(c, mi, ci) {
    let title = "";
    let body = "";
    if (c.type === "persona" || c.type === "mask") {
      const map = c.type === "persona" ? CHAR_FIELDS : MASK_FIELDS;
      title = c.type === "persona" ? `${c.new ? "新建" : "改"}角色「${esc(c.name || "")}」` : "改我的面具";
      body = Object.entries(c.fields || {})
        .filter(([k]) => map[k])
        .map(([k, v]) => `<p><b>${map[k]}</b>：${esc(short(v, 220))}</p>`)
        .join("");
    } else if (c.type === "worldbook") {
      title = `世界书「${esc(c.book || "")}」`;
      body = (c.entries || [])
        .map((e) => `<p><b>${e.op === "delete" ? "删除" : e.op === "update" ? "修改" : "新增"}</b> ${esc(e.title || "")}${e.op !== "delete" && e.content ? "：" + esc(short(e.content, 160)) : ""}</p>`)
        .join("");
    } else if (c.type === "css") {
      title = c.mode === "clear" ? "清掉弥弥写的美化" : `美化（${c.mode === "replace" ? "整个换掉" : "加一段"}）`;
      body = c.mode === "clear" ? "" : `<pre style="white-space:pre-wrap;word-break:break-all;margin:0;font-size:11px">${esc(short(c.css, 700))}</pre>`;
    } else {
      title = "看不懂的改动";
    }
    const st = c.status;
    const btns =
      st === "pending"
        ? `<button type="button" class="fun-btn solid sm" data-chg="${mi}:${ci}:apply">确认修改</button><button type="button" class="fun-btn ghost sm" data-chg="${mi}:${ci}:reject">不要</button>`
        : st === "applied"
          ? `<span class="mimi-chg-st">✅ 已修改</span><button type="button" class="fun-btn ghost sm" data-chg="${mi}:${ci}:undo">撤销</button>`
          : st === "undone"
            ? `<span class="mimi-chg-st">↩️ 已撤销</span>`
            : st === "failed"
              ? `<span class="mimi-chg-st">⚠️ ${esc(c.err || "没改成")}</span>`
              : `<span class="mimi-chg-st">没改</span>`;
    return `<div class="mimi-chg" style="box-sizing:border-box;max-width:100%;overflow-wrap:anywhere;margin-top:8px;padding:10px 12px;border-radius:14px;background:rgba(255,227,166,.28);border:1px solid rgba(240,180,90,.35);font-size:12.5px;line-height:1.55"><div style="font-weight:700;margin-bottom:4px">🛠 ${title}</div><div style="max-height:220px;overflow:auto">${body}</div><div style="display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap">${btns}</div></div>`;
  }
  function applyChange(c) {
    const clone = (o) => JSON.parse(JSON.stringify(o));
    if (c.type === "persona") {
      const rd = g("readCharPersonaStore");
      const wr = g("writeCharPersonaStore");
      if (!rd || !wr) throw new Error("人设模块还没加载");
      const st = rd();
      let it = st.items.find((x) => String(x.displayName || "").trim() === String(c.name || "").trim()) || (!c.new && findChar(c.name));
      let created = false;
      if (!it) {
        if (!c.new && !c.fields?.summary) throw new Error(`没找到角色「${c.name}」`);
        it = { id: g("newEntityId") ? g("newEntityId")() : "c" + Date.now(), ...(g("emptyCharPersona") ? g("emptyCharPersona")() : {}), displayName: String(c.name || "新角色") };
        st.items.push(it);
        created = true;
      }
      const before = clone(it);
      for (const [k, v] of Object.entries(c.fields || {})) if (CHAR_FIELDS[k]) it[k] = String(v ?? "");
      wr(st);
      c.undo = created ? { created: it.id } : { item: before };
      return;
    }
    if (c.type === "mask") {
      const rd = g("readUserMaskStore");
      const wr = g("writeUserMaskStore");
      if (!rd || !wr) throw new Error("面具模块还没加载");
      const st = rd();
      const it = st.items.find((x) => x.id === st.activeId);
      if (!it) throw new Error("还没有面具");
      c.undo = { item: clone(it) };
      for (const [k, v] of Object.entries(c.fields || {})) if (MASK_FIELDS[k]) it[k] = String(v ?? "");
      wr(st);
      return;
    }
    if (c.type === "worldbook") {
      const rd = g("readWorldBookStore");
      const wr = g("writeWorldBookStore");
      if (!rd || !wr) throw new Error("世界书模块还没加载");
      const st = rd();
      const name = String(c.book || "").trim() || "弥弥写的世界书";
      let v = st.volumes.find((x) => x.title === name) || findVol(name);
      let created = false;
      if (!v) {
        v = { id: g("newWorldBookEntryId") ? g("newWorldBookEntryId")() : "wb" + Date.now(), title: name, scope: "local", entries: [] };
        st.volumes.push(v);
        created = true;
      }
      const before = clone(v);
      const nid = () => (g("newWorldBookEntryId") ? g("newWorldBookEntryId")() : "e" + Date.now() + Math.random().toString(36).slice(2, 6));
      for (const e of c.entries || []) {
        const t = String(e.title || "").trim();
        const hit = v.entries.find((x) => x.title === t);
        if (e.op === "delete") {
          v.entries = v.entries.filter((x) => x !== hit);
        } else if (e.op === "update" && hit) {
          if (e.content != null) hit.content = String(e.content);
          if (e.keywords != null) hit.keywords = String(e.keywords);
        } else if (t || e.content) {
          v.entries.push({ id: nid(), title: t || "未命名条目", content: String(e.content || ""), keywords: String(e.keywords || ""), enabled: true });
        }
      }
      // 新建的书会自带一条空的「未命名条目」，有内容了就去掉
      if (v.entries.length > 1) v.entries = v.entries.filter((x) => !(x.title === "未命名条目" && !String(x.content || "").trim()));
      wr(st);
      c.undo = created ? { created: v.id } : { vol: before };
      return;
    }
    if (c.type === "css") {
      const prev = lsGet(CSS_LS) || "";
      const css = String(c.css || "").replace(/<\/?style[^>]*>/gi, "");
      const next = c.mode === "clear" ? "" : c.mode === "replace" ? css : (prev ? prev + "\n\n" : "") + css;
      if (next.length > 200000) throw new Error("CSS 太长了");
      lsSet(CSS_LS, next);
      applyCss();
      c.undo = { css: prev };
      return;
    }
    throw new Error("看不懂这个改动");
  }
  function undoChange(c) {
    const u = c.undo || {};
    if (c.type === "persona") {
      const st = g("readCharPersonaStore")();
      if (u.created) st.items = st.items.filter((x) => x.id !== u.created);
      else if (u.item) st.items = st.items.map((x) => (x.id === u.item.id ? u.item : x));
      g("writeCharPersonaStore")(st);
    } else if (c.type === "mask") {
      const st = g("readUserMaskStore")();
      if (u.item) st.items = st.items.map((x) => (x.id === u.item.id ? u.item : x));
      g("writeUserMaskStore")(st);
    } else if (c.type === "worldbook") {
      const st = g("readWorldBookStore")();
      if (u.created) st.volumes = st.volumes.filter((x) => x.id !== u.created);
      else if (u.vol) st.volumes = st.volumes.map((x) => (x.id === u.vol.id ? u.vol : x));
      g("writeWorldBookStore")(st);
    } else if (c.type === "css") {
      lsSet(CSS_LS, u.css || "");
      applyCss();
    }
    delete c.undo;
  }
  function onChangeClick(btn) {
    const [mi, ci, act] = btn.dataset.chg.split(":");
    const m = hist[Number(mi)];
    const c = m?.changes?.[Number(ci)];
    if (!c) return;
    try {
      if (act === "apply" && c.status === "pending") {
        applyChange(c);
        c.status = "applied";
        toast("改好啦喵");
      } else if (act === "reject" && c.status === "pending") c.status = "rejected";
      else if (act === "undo" && c.status === "applied") {
        undoChange(c);
        c.status = "undone";
        toast("已经撤销了");
      }
    } catch (err) {
      c.status = "failed";
      c.err = err.message;
      toast(err.message);
    }
    draw();
    void save();
  }
  window.XXJ_MIMI = { applyCss, cssKey: CSS_LS, apiKey: API_LS };

  function sysPrompt(user) {
    return `你是「弥弥」，Meow 小手机里的手机小管家，一只白色噪点小猫。说话可爱、简短、耐心，句尾偶尔带「喵」，称呼用户为「${user.name && user.name !== "我" ? user.name : "你"}」。
你的工作：回答用户关于 Meow 怎么用的问题，告诉他在哪里、怎么点；用户想打开某个应用时帮他打开。
规则：
- 只根据下面的说明书回答，不知道就老实说不确定，建议去「更新公告」或问发码的人，不要编造功能。
- 步骤用「A → B → C」的写法，尽量 3 句话以内。
- 需要打开应用时，在回答最后单独写 [[打开:应用名]]，应用名只能是：${APP_NAMES.join("、")}。
- 用户只是闲聊也可以陪他聊两句，但别太长。${toolPrompt()}

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
    if (h) h.innerHTML = `${avHtml()}<span><b>弥弥</b><small>手机小管家 · 点头像可以换</small></span><button type="button" class="chip ghost chip-xs" data-api>${resolveApi() ? "API ✓" : "API"}</button><button type="button" class="chip ghost chip-xs" data-avmenu>换头像</button>`;
  }
  async function save() {
    try {
      // 只给最近 20 条留原图，更早的图和长文件内容不存，省空间
      const keep = hist.slice(-60);
      const cut = keep.length - 20;
      await F.FunDB.set(
        KV,
        keep.map((m, i) =>
          i < cut && m.atts
            ? { ...m, atts: m.atts.map((a) => (a.kind === "image" ? { kind: "image", url: "", name: a.name } : { ...a, text: String(a.text || "").slice(0, 2000) })) }
            : m
        )
      );
    } catch (_) {
      /* ignore */
    }
  }
  function bubble(m, mi) {
    const acts = [];
    const text = String(m.text || "")
      .replace(/\[\[查看[:：][^\]]*\]\]/g, "").replace(/\[\[打开[:：]\s*([^\]]+?)\s*\]\]/g, (_, n) => {
      if (OPEN[n] && !acts.includes(n)) acts.push(n);
      return "";
    });
    return `<div class="mimi-msg${m.me ? " is-me" : ""}">${m.me ? "" : avHtml()}<div class="mimi-b"${m.changes && m.changes.length ? ' style="min-width:0;flex:1"' : ""}>${attHtml(m.atts)}<p>${esc(text.trim()).replace(/\n/g, "<br>")}</p>${acts
      .map((n) => `<button type="button" class="mimi-open" data-open="${esc(n)}">打开「${esc(n)}」 →</button>`)
      .join("")}${(m.changes || []).map((c, ci) => changeHtml(c, mi, ci)).join("")}</div></div>`;
  }
  function draw() {
    if (!root) return;
    const list = root.querySelector(".mimi-list");
    list.innerHTML = hist.map((m, i) => bubble(m, i)).join("") + (busy ? `<div class="mimi-msg">${avHtml()}<div class="mimi-b"><p class="mimi-typing">弥弥在想…</p></div></div>` : "");
    list.scrollTop = list.scrollHeight;
  }

  /* ───── 给弥弥发图片 / 文件 ───── */
  let pending = []; // [{ kind: "image", url, name } | { kind: "file", name, text, cut }]
  const TEXT_EXT = /\.(txt|md|markdown|json|css|html?|csv|tsv|js|ts|yaml|yml|xml|ini|log|srt|lrc)$/i;
  const MAX_TEXT = 60000;
  function shrinkImage(file, max) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.naturalWidth * k));
        c.height = Math.max(1, Math.round(img.naturalHeight * k));
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve("");
      };
      img.src = url;
    });
  }
  /** PNG 角色卡 / 世界书卡：读出 tEXt 里的 chara / ccv3 / 其他文字块 */
  async function pngText(file) {
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const dv = new DataView(buf.buffer);
      let p = 8;
      const out = [];
      while (p + 8 < buf.length) {
        const len = dv.getUint32(p);
        const type = String.fromCharCode(...buf.slice(p + 4, p + 8));
        if (type === "tEXt" || type === "iTXt") {
          const data = buf.slice(p + 8, p + 8 + len);
          const z = data.indexOf(0);
          const kw = new TextDecoder().decode(data.slice(0, z));
          let rest = data.slice(z + 1);
          if (type === "iTXt") {
            // 压缩标志、压缩方法、语言、翻译关键词
            rest = rest.slice(2);
            for (let i = 0; i < 2; i++) rest = rest.slice(rest.indexOf(0) + 1);
          }
          let txt = new TextDecoder().decode(rest);
          if (/^[A-Za-z0-9+/=\s]{40,}$/.test(txt)) {
            try {
              txt = new TextDecoder().decode(Uint8Array.from(atob(txt.replace(/\s+/g, "")), (ch) => ch.charCodeAt(0)));
            } catch (_) {
              /* 不是 base64 */
            }
          }
          if (txt.trim().length > 20) out.push(`[${kw}]\n${txt}`);
        }
        if (type === "IEND") break;
        p += 12 + len;
      }
      return out.join("\n\n");
    } catch (_) {
      return "";
    }
  }
  async function addFiles(files) {
    for (const f of [...(files || [])].slice(0, 6)) {
      if (pending.length >= 6) {
        toast("一次最多 6 个附件");
        break;
      }
      const isImg = /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|heic|bmp)$/i.test(f.name);
      if (isImg) {
        const url = await shrinkImage(f, 1280);
        if (!url) {
          toast(`「${f.name}」打不开`);
          continue;
        }
        pending.push({ kind: "image", url, name: f.name });
        if (/\.png$/i.test(f.name) || f.type === "image/png") {
          const t = await pngText(f);
          if (t) pending.push({ kind: "file", name: f.name + "（卡片里的数据）", text: t.slice(0, MAX_TEXT), cut: t.length > MAX_TEXT });
        }
        continue;
      }
      if (f.size > 3 * 1024 * 1024 && !TEXT_EXT.test(f.name)) {
        toast(`「${f.name}」太大了，弥弥只看得懂文字文件和图片`);
        continue;
      }
      let text = "";
      try {
        text = await f.slice(0, MAX_TEXT * 4).text();
      } catch (_) {
        text = "";
      }
      // 看起来是二进制（大量乱码 / 0 字节）就不收
      const bad = (text.slice(0, 2000).match(/[\u0000-\u0008�]/g) || []).length;
      if (!text.trim() || bad > 20) {
        toast(`「${f.name}」不是文字文件，弥弥看不懂`);
        continue;
      }
      pending.push({ kind: "file", name: f.name, text: text.slice(0, MAX_TEXT), cut: text.length > MAX_TEXT });
    }
    drawPending();
  }
  function drawPending() {
    const box = root?.querySelector(".mimi-pend");
    if (!box) return;
    box.hidden = !pending.length;
    box.innerHTML = pending
      .map(
        (a, i) =>
          `<span style="position:relative;display:inline-flex;align-items:center;gap:6px;max-width:170px;padding:4px 26px 4px 4px;border-radius:12px;border:1px solid var(--line);background:var(--bg-card);font-size:12px">${
            a.kind === "image" ? `<img src="${a.url}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:8px"/>` : `<span style="font-size:22px;padding:0 2px 0 6px">📄</span>`
          }<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.name)}</span><button type="button" data-unpend="${i}" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);border:0;background:none;color:inherit;font-size:14px;opacity:.6">✕</button></span>`
      )
      .join("");
  }
  function attHtml(atts) {
    if (!atts || !atts.length) return "";
    return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px">${atts
      .map((a) =>
        a.kind === "image" && !a.url
          ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:6px 10px;border-radius:10px;background:rgba(127,127,127,.12);font-size:12px">🖼 ${esc(a.name || "图片")}</span>`
          : a.kind === "image"
          ? `<img src="${a.url}" alt="" data-zoom style="max-width:160px;max-height:160px;border-radius:10px;object-fit:cover;cursor:zoom-in"/>`
          : `<span style="display:inline-flex;align-items:center;gap:4px;padding:6px 10px;border-radius:10px;background:rgba(127,127,127,.12);font-size:12px">📄 ${esc(a.name)}${a.cut ? "（太长，只读了前面）" : ""}</span>`
      )
      .join("")}</div>`;
  }
  /** 组装发给模型的内容：最近两条带图的消息带原图，更早的只说「[图片]」 */
  function contentFor(m, recentImg, isLast) {
    const atts = m.atts || [];
    if (!atts.length) return m.text;
    const files = atts.filter((a) => a.kind === "file");
    const imgs = atts.filter((a) => a.kind === "image");
    let text = m.text || "";
    for (const f of files) {
      const body = isLast ? f.text : String(f.text || "").slice(0, 2000) + (f.text.length > 2000 ? "\n……（之前发过，这里省略）" : "");
      text += `\n\n【用户发来的文件：${f.name}${f.cut ? "（太长，只截了前面一部分）" : ""}】\n${body}`;
    }
    if (!imgs.length) return text;
    if (!recentImg) return text + `\n（之前发过 ${imgs.length} 张图片）`;
    if (!imgs.some((a) => a.url)) return text + `\n（之前发过 ${imgs.length} 张图片）`;
    return [{ type: "text", text: text || "看看这张图" }, ...imgs.filter((a) => a.url).map((a) => ({ type: "image_url", image_url: { url: a.url } }))];
  }

  let busy = false;
  async function ask(q) {
    q = String(q || "").trim();
    if (busy) return;
    const atts = pending;
    if (!q && !atts.length) return;
    pending = [];
    drawPending();
    if (!q) q = atts.some((x) => x.kind === "image") ? "看看这个" : "帮我看看这个文件";
    hist.push(atts.length ? { me: true, text: q, atts } : { me: true, text: q });
    busy = true;
    draw();
    let a = "";
    let changes = [];
    if (hasApi()) {
      try {
        const user = await F.loadUser();
        const msgs = [{ role: "system", content: sysPrompt(user) }];
        const recent = hist.slice(-12);
        const imgIdx = recent.map((m, i) => (m.me && (m.atts || []).some((x) => x.kind === "image") ? i : -1)).filter((i) => i >= 0).slice(-2);
        recent.forEach((m, i) => msgs.push({ role: m.me ? "user" : "assistant", content: m.me ? contentFor(m, imgIdx.includes(i), i === recent.length - 1) : m.text }));
        for (let round = 0; round < 4; round++) {
          a = await mimiAi(msgs, 3000);
          const reads = [...a.matchAll(/\[\[查看[:：]\s*(人设|我的人设|世界书|美化)(?:[:：]\s*([^\]]*?))?\s*\]\]/g)];
          if (!reads.length || round === 3) break;
          msgs.push({ role: "assistant", content: a });
          msgs.push({ role: "user", content: "【系统：查看结果，不要给用户复述原文】\n" + reads.map((r) => readTarget(r[1], r[2] || "")).join("\n\n") + "\n\n现在接着回答用户。" });
          const lab = reads.map((r) => (r[2] ? `${r[1]}「${r[2]}」` : r[1])).join("、");
          const typing = root?.querySelector(".mimi-typing");
          if (typing) typing.textContent = `弥弥在翻${lab}…`;
        }
        const pc = parseChanges(a);
        a = pc.text || (pc.changes.length ? "弥弥想好怎么改啦，看看下面，没问题就点「确认修改」喵~" : a);
        changes = pc.changes;
      } catch (err) {
        a = atts.some((x) => x.kind === "image")
          ? `弥弥没看成这张图喵…可能是现在用的模型不支持看图片，换一个能看图的模型试试（比如带 vision / 4o / gemini 的）。\n（${err.message}）`
          : offlineAnswer(q) + `\n（AI 暂时连不上：${err.message}）`;
      }
    } else a = atts.length ? "要先接上 API，弥弥才能看图片和文件喵～点右上角「API」就能接。" : offlineAnswer(q);
    busy = false;
    if (!root) return;
    hist.push(changes.length ? { me: false, text: a, changes } : { me: false, text: a });
    draw();
    void save();
  }

  const QUICK = ["帮我改改角色人设", "帮我写一本世界书", "把聊天气泡改成奶油粉色", "这个手机都有什么功能？", "怎么换壁纸和图标？"];

  F.register("弥弥", {
    title: "弥弥",
    kicker: "PHONE BUTLER",
    async mount(body) {
      root = document.createElement("div");
      root.className = "mimi";
      root.innerHTML = `<div class="mimi-head"></div><div class="mimi-list"></div>
        <div class="mimi-quick">${QUICK.map((q) => `<button type="button" class="fun-chip-btn" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>
        <div class="mimi-pend" hidden style="display:flex;flex-wrap:wrap;gap:6px;padding:6px 14px 0"></div>
        <form class="mimi-bar"><button type="button" class="fun-btn ghost" data-attach title="发图片或文件" style="flex:none;padding:0 12px;font-size:18px">＋</button><input type="file" class="mimi-file" multiple accept="image/*,.txt,.md,.json,.css,.html,.htm,.csv,.js,.yaml,.yml,.xml,.srt,.lrc,.log" hidden /><input type="text" placeholder="问问弥弥，比如：怎么换字体" enterkeyhint="send" /><button type="submit" class="fun-btn solid">发送</button></form>`;
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
        hist.push({ me: false, text: `${nm}好呀，我是弥弥，这台 Meow 的小管家喵~\n哪里不会用、找不到在哪，都可以问我；想打开哪个应用也可以直接跟我说。\n接上 API 以后，我还能帮你改角色人设、世界书和界面美化哦（每次都会先给你看，点确认才改）。` });
      }
      draw();
      const inp = root.querySelector(".mimi-bar input[type=text]");
      const fileInp = root.querySelector(".mimi-file");
      fileInp.addEventListener("change", () => {
        void addFiles(fileInp.files).then(() => (fileInp.value = ""));
      });
      root.querySelector(".mimi-bar").addEventListener("submit", (e) => {
        e.preventDefault();
        const v = inp.value;
        inp.value = "";
        void ask(v);
      });
      root.addEventListener("click", (e) => {
        if (e.target.closest("[data-attach]")) return void fileInp.click();
        const up = e.target.closest("[data-unpend]");
        if (up) {
          pending.splice(Number(up.dataset.unpend), 1);
          return drawPending();
        }
        const zm = e.target.closest("img[data-zoom]");
        if (zm) {
          const sh = F.openSheet(`<img src="${zm.src}" alt="" style="width:100%;border-radius:12px"/>`, { title: "图片" });
          return void sh;
        }
        const chg = e.target.closest("[data-chg]");
        if (chg) return void onChangeClick(chg);
        if (e.target.closest("[data-api]")) return void apiSheet();
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
