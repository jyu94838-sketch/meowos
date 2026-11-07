"use strict";

/**
 * 风格包：聊天风格（默认 / 微信 / QQ）+ 主页风格（默认 / 奶油小猫）
 * - 每套风格就是一段 CSS 源码：可以一键套用，也可以「查看源码」复制去改
 * - 入口：我的 → 装扮 → 最上面「风格包」
 * - 微信 / QQ 风格下，聊天列表会额外显示头像
 */
(function () {
  // 这个文件在页面一开始就加载（避免先闪一下默认样式），娱乐模块晚点才有，所以用到时再取
  const FUN = () => window.XXJ_FUN;
  const toast = (m) => (FUN() ? FUN().toast(m) : typeof showToast === "function" && showToast(m));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const KEY_CHAT = "meowos_skin_chat";
  const KEY_HOME = "meowos_skin_home";

  /* ═════════ 源码 ═════════ */
  const CSS = {
    wechat: `/* ===== Meow · 微信风格聊天（可以复制去改颜色） ===== */
/* 聊天背景 */
#chat-screen .chat-scroll,
#chat-screen .chat-messages { background: #ededed !important; }
body.dark #chat-screen .chat-scroll,
body.dark #chat-screen .chat-messages { background: #111 !important; }

/* 气泡：直角小圆角、无边框、带小尖角 */
#chat-screen .chat-msg-bubble:not(.chat-msg-bubble--sticker):not(.chat-msg-bubble--typing) {
  border: none !important;
  border-radius: 5px !important;
  box-shadow: none !important;
  background: #fff !important;
  color: #191919 !important;
  font-size: 0.95rem !important;
  line-height: 1.55 !important;
  padding: 9px 12px !important;
}
#chat-screen .chat-msg--assistant .chat-msg-bubble { border-left: none !important; }
#chat-screen .chat-msg--user .chat-msg-bubble:not(.chat-msg-bubble--sticker):not(.chat-msg-bubble--typing) {
  background: #95ec69 !important;
}
#chat-screen .chat-msg-bubble-stack > .chat-msg-bubble:not(.chat-msg-bubble--sticker):not(.chat-msg-bubble--typing)::before {
  content: ""; position: absolute; top: 13px; width: 0; height: 0;
  border: 6px solid transparent;
}
#chat-screen .chat-msg--assistant .chat-msg-bubble-stack > .chat-msg-bubble:not(.chat-msg-bubble--sticker):not(.chat-msg-bubble--typing)::before {
  left: -11px; border-right-color: #fff;
}
#chat-screen .chat-msg--user .chat-msg-bubble-stack > .chat-msg-bubble:not(.chat-msg-bubble--sticker):not(.chat-msg-bubble--typing)::before {
  right: -11px; border-left-color: #95ec69;
}
body.dark #chat-screen .chat-msg-bubble:not(.chat-msg-bubble--sticker):not(.chat-msg-bubble--typing) { background: #2c2c2c !important; color: #e6e6e6 !important; }
body.dark #chat-screen .chat-msg--user .chat-msg-bubble:not(.chat-msg-bubble--sticker):not(.chat-msg-bubble--typing) { background: #3eb575 !important; color: #111 !important; }
body.dark #chat-screen .chat-msg--assistant .chat-msg-bubble-stack > .chat-msg-bubble:not(.chat-msg-bubble--sticker):not(.chat-msg-bubble--typing)::before { border-right-color: #2c2c2c; }
body.dark #chat-screen .chat-msg--user .chat-msg-bubble-stack > .chat-msg-bubble:not(.chat-msg-bubble--sticker):not(.chat-msg-bubble--typing)::before { border-left-color: #3eb575; }

/* 头像：方形小圆角（聊天设置里开了「隐藏头像」就不显示） */
#chat-screen .chat-msg-avatar { display: grid !important; width: 40px !important; height: 40px !important; border-radius: 5px !important; border: none !important; box-shadow: none !important; background: #c9d6e8; color: #fff; }
#chat-screen img.chat-msg-avatar { display: block !important; object-fit: cover; }
#chat-screen .chat-msg-inner { gap: 10px; align-items: flex-start; }
#chat-screen .chat-msg--user .chat-msg-inner { flex-direction: row !important; justify-content: flex-end; }

/* 聊天列表：白色通栏 + 方形头像 */
#chat-list-screen .chat-thread-li { transform: none !important; margin: 0 !important; }
#chat-list-screen .chat-thread-card { display: flex !important; align-items: center; gap: 12px; padding: 12px 14px !important; background: #fff !important; border-bottom: 1px solid #ececec !important; border-radius: 0 !important; }
#chat-list-screen .chat-thread-card .chat-slab-spine,
#chat-list-screen .chat-thread-card .chat-thread-top,
#chat-list-screen .chat-thread-card .chat-slab-tape,
#chat-list-screen .chat-thread-card .chat-corner-stamp,
#chat-list-screen .chat-thread-card .chat-thread-card-k { display: none !important; }
#chat-list-screen .chat-thread-card .chat-thread-shell,
#chat-list-screen .chat-thread-card .chat-thread-slab,
#chat-list-screen .chat-thread-card .chat-slab-stack,
#chat-list-screen .chat-thread-card .chat-slab-mat,
#chat-list-screen .chat-thread-card .chat-thread-panel { all: unset; display: block; flex: 1; min-width: 0; }
#chat-list-screen .chat-thread-card .mx-list-av { display: grid !important; width: 48px; height: 48px; border-radius: 6px; }
#chat-list-screen .chat-thread-card-name { font-size: 1rem !important; font-weight: 500 !important; font-style: normal !important; color: #191919 !important; margin: 0 0 4px !important; }
#chat-list-screen .chat-thread-card-snippet { font-size: 0.8rem !important; color: #999 !important; margin: 0 !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#chat-list-screen .chat-thread-card-meta { position: absolute; top: 14px; right: 14px; font-size: 0.68rem !important; color: #b2b2b2 !important; }
#chat-list-screen .chat-thread-card { position: relative; }
body.dark #chat-list-screen .chat-thread-card { background: #191919 !important; border-bottom-color: #2a2a2a !important; }
body.dark #chat-list-screen .chat-thread-card-name { color: #e6e6e6 !important; }
`,
    qq: `/* ===== Meow · QQ 风格聊天（可以复制去改颜色） ===== */
/* 聊天背景：淡淡的蓝灰 */
#chat-screen .chat-scroll,
#chat-screen .chat-messages { background: linear-gradient(180deg, #f3f6fb, #eef1f7) !important; }
body.dark #chat-screen .chat-scroll,
body.dark #chat-screen .chat-messages { background: #17181c !important; }

/* 气泡：大圆角，对方白色，自己蓝色 */
#chat-screen .chat-msg-bubble:not(.chat-msg-bubble--sticker):not(.chat-msg-bubble--typing) {
  border: none !important;
  border-radius: 18px !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05) !important;
  background: #fff !important;
  color: #1f1f1f !important;
  font-size: 0.95rem !important;
  line-height: 1.55 !important;
  padding: 10px 14px !important;
}
#chat-screen .chat-msg--assistant .chat-msg-bubble { border-left: none !important; }
#chat-screen .chat-msg--assistant .chat-msg-bubble-stack > .chat-msg-bubble:first-child:not(.chat-msg-bubble--sticker) { border-top-left-radius: 4px !important; }
#chat-screen .chat-msg--user .chat-msg-bubble:not(.chat-msg-bubble--sticker):not(.chat-msg-bubble--typing) {
  background: linear-gradient(135deg, #3fb2ff, #1888ff) !important;
  color: #fff !important;
}
#chat-screen .chat-msg--user .chat-msg-bubble-stack > .chat-msg-bubble:first-child:not(.chat-msg-bubble--sticker) { border-top-right-radius: 4px !important; }
#chat-screen .chat-msg--user .chat-msg-bubble * { color: inherit; }
body.dark #chat-screen .chat-msg-bubble:not(.chat-msg-bubble--sticker):not(.chat-msg-bubble--typing) { background: #26272c !important; color: #e8e8e8 !important; }
body.dark #chat-screen .chat-msg--user .chat-msg-bubble:not(.chat-msg-bubble--sticker):not(.chat-msg-bubble--typing) { background: linear-gradient(135deg, #2c8fe0, #1670d6) !important; color: #fff !important; }

/* 头像：圆形（聊天设置里开了「隐藏头像」就不显示） */
#chat-screen .chat-msg-avatar { display: grid !important; width: 40px !important; height: 40px !important; border-radius: 50% !important; border: 2px solid #fff !important; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08) !important; background: #b9d7f5; color: #fff; }
#chat-screen img.chat-msg-avatar { display: block !important; object-fit: cover; }
#chat-screen .chat-msg-inner { gap: 10px; align-items: flex-start; }
#chat-screen .chat-msg--user .chat-msg-inner { flex-direction: row !important; justify-content: flex-end; }

/* 聊天列表：圆头像 + 浅蓝选中 */
#chat-list-screen .chat-thread-li { transform: none !important; margin: 0 !important; }
#chat-list-screen .chat-thread-card { display: flex !important; align-items: center; gap: 12px; padding: 12px 16px !important; background: #fff !important; border-radius: 0 !important; position: relative; }
#chat-list-screen .chat-thread-card:active { background: #eaf4ff !important; }
#chat-list-screen .chat-thread-card .chat-slab-spine,
#chat-list-screen .chat-thread-card .chat-thread-top,
#chat-list-screen .chat-thread-card .chat-slab-tape,
#chat-list-screen .chat-thread-card .chat-corner-stamp,
#chat-list-screen .chat-thread-card .chat-thread-card-k { display: none !important; }
#chat-list-screen .chat-thread-card .chat-thread-shell,
#chat-list-screen .chat-thread-card .chat-thread-slab,
#chat-list-screen .chat-thread-card .chat-slab-stack,
#chat-list-screen .chat-thread-card .chat-slab-mat,
#chat-list-screen .chat-thread-card .chat-thread-panel { all: unset; display: block; flex: 1; min-width: 0; }
#chat-list-screen .chat-thread-card .mx-list-av { display: grid !important; width: 50px; height: 50px; border-radius: 50%; }
#chat-list-screen .chat-thread-card-name { font-size: 1rem !important; font-weight: 500 !important; font-style: normal !important; color: #1f1f1f !important; margin: 0 0 4px !important; }
#chat-list-screen .chat-thread-card-snippet { font-size: 0.8rem !important; color: #8c8c8c !important; margin: 0 !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#chat-list-screen .chat-thread-card-meta { position: absolute; top: 14px; right: 16px; font-size: 0.68rem !important; color: #a8a8a8 !important; }
body.dark #chat-list-screen .chat-thread-card { background: #1c1d21 !important; }
body.dark #chat-list-screen .chat-thread-card-name { color: #e8e8e8 !important; }
`,
    cute: `/* ===== Meow · 奶油小猫主页（可以复制去改颜色） ===== */
/* 桌面底色：奶油粉 + 小爪印 */
#phone .wallpaper:not([style*="url"]) {
  background:
    radial-gradient(circle at 20% 15%, rgba(255, 255, 255, 0.9) 0 6px, transparent 7px),
    radial-gradient(circle at 80% 70%, rgba(255, 255, 255, 0.9) 0 5px, transparent 6px),
    linear-gradient(160deg, #fff4f0 0%, #ffe3ec 55%, #f6e7ff 100%) !important;
}
/* 顶部时间卡片 */
#phone .hero-card {
  border-radius: 28px !important;
  border: 2px solid #ffd3e1 !important;
  background: rgba(255, 252, 250, 0.92) !important;
  box-shadow: 0 8px 24px -10px rgba(255, 140, 170, 0.45) !important;
}
#phone .hero-card h1 { color: #e0789b !important; }
/* 第一页应用卡片 */
#phone .app-tower {
  border-radius: 28px !important;
  border: 2px dashed #ffc8d9 !important;
  background: rgba(255, 250, 252, 0.85) !important;
}
#phone .app-nora {
  border-radius: 20px !important;
  border: 1.5px solid #ffd6e3 !important;
  background: #fffafb !important;
}
#phone .app-nora i { color: #e889a8 !important; }
/* 第二页方形图标 */
#phone .desk-app-ico:not(.has-img) {
  border-radius: 20px !important;
  border: 1.5px solid #ffd3e1 !important;
  background: linear-gradient(160deg, #fffdfb, #ffeef4) !important;
  color: #e0789b !important;
  box-shadow: 0 4px 12px -6px rgba(255, 130, 165, 0.5) !important;
}
#phone .desk-app-name { color: #8a5a6a !important; font-weight: 600; }
/* 底部 Dock 栏 */
#phone .dock-plate {
  border-radius: 999px !important;
  border: 2px solid #ffd3e1 !important;
  background: rgba(255, 250, 252, 0.92) !important;
}
`
  };
  // 聊天页整体（顶栏、角色卡、输入框）也跟着风格走
  const frame = (o) => `
/* ===== 聊天页顶栏 / 输入框 ===== */
/* 去掉原主题的角色大卡片、背景装饰（点顶栏名字仍可看心声） */
#chat-screen .chat-identity-wrap,
#chat-screen .settings-ambient,
#chat-screen .chat-filmgrain,
#chat-screen .chat-watermark { display: none !important; }
#chat-screen .settings-inner,
#chat-screen .chat-body-stack,
#chat-screen .chat-main { background: ${o.bg} !important; }
#chat-screen { background: ${o.bg} !important; }

/* 顶栏：居中显示名字 */
#chat-screen .chat-screen-topbar {
  background: ${o.top} !important;
  border-bottom: 1px solid ${o.line} !important;
  box-shadow: none !important;
}
#chat-screen #chat-meta-label { display: none !important; }
#chat-screen #chat-meta-eyebrow { display: none !important; }
#chat-screen .mx-chat-title {
  display: block !important; font-size: 1.05rem; font-weight: 600; letter-spacing: 0;
  color: ${o.text}; text-transform: none; font-style: normal; cursor: pointer;
  max-width: 52vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
#chat-screen .chat-thread-detail-tape-btn,
#chat-screen #mx-chat-search-btn {
  background: transparent !important; border: none !important; box-shadow: none !important; transform: none !important;
}
#chat-screen .chat-thread-detail-tape-btn-sheen { display: none !important; }

/* 输入区：通栏浅灰底 + 白色输入框 */
#chat-screen .chat-composer {
  background: ${o.bar} !important;
  border-top: 1px solid ${o.line} !important;
  box-shadow: none !important;
  padding: 8px 10px calc(8px + env(safe-area-inset-bottom, 0px)) !important;
}
#chat-screen .chat-composer .chat-slab-spine,
#chat-screen .chat-composer .chat-slab-tape,
#chat-screen .chat-composer .chat-composer-cap { display: none !important; }
#chat-screen .chat-composer .chat-slab,
#chat-screen .chat-composer .chat-slab-stack,
#chat-screen .chat-composer .chat-slab-mat {
  display: block !important; padding: 0 !important; margin: 0 !important;
  border: none !important; background: none !important; box-shadow: none !important; transform: none !important;
}
#chat-screen .chat-composer .chat-composer-panel {
  display: flex !important; align-items: flex-end; gap: 8px;
  padding: 0 !important; margin: 0 !important;
  border: none !important; background: none !important; box-shadow: none !important; border-radius: 0 !important; transform: none !important;
}
#chat-screen .chat-composer .chat-input-ruled {
  flex: 1; min-width: 0; background: ${o.input} !important; border: none !important;
  border-radius: ${o.inputRadius} !important; box-shadow: none !important; padding: 0 !important;
}
#chat-screen .chat-composer .chat-input {
  background: transparent !important; background-image: none !important; border: none !important;
  min-height: 40px !important; height: 40px; max-height: 110px !important; field-sizing: content; resize: none !important; padding: 9px 12px !important; font-size: 1rem !important; line-height: 1.4 !important;
  color: ${o.text} !important; font-style: normal !important;
}
#chat-screen .chat-composer .chat-input::placeholder { color: ${o.ph} !important; font-style: normal !important; }
#chat-screen .chat-composer .chat-composer-fabs { display: flex !important; gap: 8px; align-items: center; flex-direction: row !important; padding-bottom: 3px; margin: 0 !important; }
#chat-screen .chat-composer .chat-more-btn {
  width: 34px !important; height: 34px !important; min-width: 34px; border-radius: 50% !important;
  border: 1.6px solid ${o.icon} !important; background: transparent !important; color: ${o.icon} !important;
  box-shadow: none !important; transform: none !important; padding: 0 !important; font-size: 1.1rem;
}
#chat-screen .chat-composer .chat-send-fab {
  width: auto !important; min-width: 56px; height: 34px !important; border-radius: ${o.sendRadius} !important;
  border: none !important; background: ${o.send} !important; color: #fff !important;
  box-shadow: none !important; transform: none !important; padding: 0 12px !important;
}
body.dark #chat-screen,
body.dark #chat-screen .settings-inner,
body.dark #chat-screen .chat-body-stack,
body.dark #chat-screen .chat-main { background: ${o.dbg} !important; }
body.dark #chat-screen .chat-screen-topbar,
body.dark #chat-screen .chat-composer { background: ${o.dbar} !important; border-color: #2a2a2a !important; }
body.dark #chat-screen .chat-composer .chat-input-ruled { background: #2c2c2c !important; }
body.dark #chat-screen .mx-chat-title,
body.dark #chat-screen .chat-composer .chat-input { color: #e6e6e6 !important; }
`;
  // 每条气泡都带头像 + 引用块在浅色 / 深色下都看得清
  const perBubble = (o) => `
#chat-screen .chat-msg-bubble-stack { position: relative; }
#chat-screen .mx-av-rep { position: absolute !important; top: 0; margin: 0 !important; pointer-events: auto; }
#chat-screen .chat-msg--assistant .mx-av-rep { left: calc(-10px - var(--mx-av, 40px)); }
#chat-screen .chat-msg--user .mx-av-rep { right: calc(-10px - var(--mx-av, 40px)); }
#chat-screen.mx-hide-av .mx-av-rep { display: none !important; }
#chat-screen .chat-msg--user .chat-msg-bubble--composer-quote .chat-msg-bubble-quote { color: ${o.uq} !important; border-bottom-color: ${o.uqLine} !important; opacity: 1 !important; }
#chat-screen .chat-msg--assistant .chat-msg-bubble--composer-quote .chat-msg-bubble-quote { color: #7d7d7d !important; border-bottom-color: rgba(0,0,0,.1) !important; opacity: 1 !important; }
#chat-screen .chat-msg--user .chat-msg-bubble--composer-quote .chat-msg-bubble-body { color: ${o.ut} !important; }
#chat-screen .chat-msg--assistant .chat-msg-bubble--composer-quote .chat-msg-bubble-body { color: #191919 !important; }
body.dark #chat-screen .chat-msg--user .chat-msg-bubble--composer-quote .chat-msg-bubble-quote { color: ${o.duq} !important; border-bottom-color: ${o.duqLine} !important; }
body.dark #chat-screen .chat-msg--user .chat-msg-bubble--composer-quote .chat-msg-bubble-body { color: ${o.dut} !important; }
body.dark #chat-screen .chat-msg--assistant .chat-msg-bubble--composer-quote .chat-msg-bubble-quote { color: #a8a8a8 !important; border-bottom-color: rgba(255,255,255,.12) !important; }
body.dark #chat-screen .chat-msg--assistant .chat-msg-bubble--composer-quote .chat-msg-bubble-body { color: #e6e6e6 !important; }
#chat-screen .chat-msg-bubble-quote-who { color: inherit !important; font-weight: 600; }
`;
  CSS.wechat += perBubble({ uq: "rgba(0,0,0,.55)", uqLine: "rgba(0,0,0,.14)", ut: "#111", duq: "rgba(0,0,0,.62)", duqLine: "rgba(0,0,0,.18)", dut: "#111" });
  CSS.qq += perBubble({ uq: "rgba(255,255,255,.82)", uqLine: "rgba(255,255,255,.3)", ut: "#fff", duq: "rgba(255,255,255,.82)", duqLine: "rgba(255,255,255,.3)", dut: "#fff" });
  CSS.wechat += frame({ bg: "#ededed", top: "#ededed", bar: "#f7f7f7", line: "#e0e0e0", input: "#fff", inputRadius: "6px", text: "#191919", ph: "#b2b2b2", icon: "#181818", send: "#07c160", sendRadius: "6px", dbg: "#111", dbar: "#1e1e1e" });
  CSS.qq += frame({ bg: "#f1f4f9", top: "#ffffffee", bar: "#f5f7fa", line: "#e3e8f0", input: "#fff", inputRadius: "18px", text: "#1f1f1f", ph: "#a9b2bf", icon: "#4a5568", send: "linear-gradient(135deg, #3fb2ff, #1888ff)", sendRadius: "17px", dbg: "#17181c", dbar: "#1c1d21" });

  const CHAT_SKINS = [
    ["default", "默认", "Meow 原来的样子"],
    ["wechat", "微信风", "绿色气泡、方形头像"],
    ["qq", "QQ 风", "蓝色气泡、圆形头像"]
  ];
  const HOME_SKINS = [
    ["default", "默认", "原来的桌面"],
    ["cute", "奶油小猫", "粉粉的奶油色桌面"]
  ];

  const get = (k, d) => {
    try {
      return localStorage.getItem(k) || d;
    } catch (_) {
      return d;
    }
  };
  let styleEl = null;
  const boost = (css) => css.replace(/(body\.dark\s+)?#(chat-screen|chat-list-screen|phone)\b/g, (m, dark, id) => `html body${dark ? ".dark" : ""} #${id}#${id}`);
  function keepLast() {
    if (!styleEl || !document.body) return;
    if (document.body.lastElementChild !== styleEl) document.body.appendChild(styleEl);
  }
  // 别的模块后来插进来的样式表 → 把风格包再挪到最后
  const watchLast = () => {
    if (!document.body || !window.MutationObserver) return;
    let t = 0;
    new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(keepLast, 50);
    }).observe(document.body, { childList: true });
  };
  if (document.body) watchLast();
  else document.addEventListener("DOMContentLoaded", watchLast);
  function apply() {
    const chat = get(KEY_CHAT, "default");
    const home = get(KEY_HOME, "default");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "mx-skin-css";
      (document.body || document.head).appendChild(styleEl);
    }
    // 套用时把选择器加强（双 id），并放在页面最后：自定义主题 / 卷宗 CSS 也盖不过风格包
    styleEl.textContent = boost((CSS[chat] || "") + "\n" + (CSS[home] || ""));
    keepLast();
    document.documentElement.dataset.mxChatSkin = chat;
    if (chat !== "default") decorateList();
    if (typeof decorateBubbles === "function") setTimeout(decorateBubbles, 0);
  }

  /* 微信 / QQ 风格：聊天列表加头像 */
  function decorateList() {
    if (get(KEY_CHAT, "default") === "default") return;
    document.querySelectorAll("#chat-list-screen .chat-thread-card").forEach((btn) => {
      if (btn.querySelector(".mx-list-av")) return;
      const av = document.createElement("span");
      av.className = "mx-list-av";
      const name = btn.querySelector(".chat-thread-card-name")?.textContent?.trim() || "?";
      let url = "";
      try {
        const it = btn.dataset.charId && typeof getCharPersonaItemById === "function" ? getCharPersonaItemById(btn.dataset.charId) : null;
        url = it && it.avatar ? String(it.avatar) : "";
      } catch (_) {
        url = "";
      }
      if (url && typeof applyChatAvatarUrlToImg === "function") {
        const im = document.createElement("img");
        im.alt = "";
        av.appendChild(im);
        try {
          applyChatAvatarUrlToImg(im, url);
        } catch (_) {
          im.remove();
          av.textContent = name.slice(0, 1);
        }
      } else av.textContent = name.slice(0, 1);
      btn.insertBefore(av, btn.firstChild);
    });
  }
  /* 每条气泡旁边都放一个头像（复制第一条的头像，点它一样能看心声） */
  const repRO = window.ResizeObserver ? new ResizeObserver((ents) => ents.forEach((en) => placeReps(en.target))) : null;
  function placeReps(stack) {
    stack.querySelectorAll(":scope > .mx-av-rep").forEach((rep) => {
      const b = rep.__for;
      if (!b || !b.isConnected) return rep.remove();
      rep.style.top = b.offsetTop + "px";
    });
  }
  function decorateBubbles() {
    const scr = document.getElementById("chat-screen");
    if (!scr) return;
    const on = get(KEY_CHAT, "default") !== "default";
    if (!on) {
      scr.querySelectorAll(".mx-av-rep").forEach((n) => n.remove());
      return;
    }
    scr.querySelectorAll(".chat-msg--assistant > .chat-msg-inner, .chat-msg--user > .chat-msg-inner").forEach((inner) => {
      const av = inner.querySelector(":scope > .chat-msg-avatar");
      const stack = inner.querySelector(":scope > .chat-msg-bubble-stack");
      if (!av || !stack) return;
      const items = [...stack.children].filter(
        (c) => (c.classList.contains("chat-msg-bubble") || c.classList.contains("chat-msg-card")) && !c.classList.contains("chat-msg-bubble--typing")
      );
      const have = new Set([...stack.querySelectorAll(":scope > .mx-av-rep")].map((r) => r.__for));
      items.slice(1).forEach((b) => {
        if (have.has(b)) return;
        const rep = av.cloneNode(true);
        rep.removeAttribute("id");
        rep.classList.add("mx-av-rep");
        rep.setAttribute("aria-hidden", "true");
        rep.__for = b;
        stack.appendChild(rep);
      });
      placeReps(stack);
      if (repRO && !stack.__mxRO) {
        stack.__mxRO = 1;
        repRO.observe(stack);
      }
    });
  }
  let decoT = 0;
  const chatScr = document.getElementById("chat-screen");
  if (chatScr && window.MutationObserver) {
    new MutationObserver((muts) => {
      if (muts.every((m) => [...m.addedNodes].every((n) => n.nodeType === 1 && n.classList?.contains("mx-av-rep")))) return;
      clearTimeout(decoT);
      decoT = setTimeout(decorateBubbles, 60);
    }).observe(chatScr, { childList: true, subtree: true });
  }

  /* 聊天字体大小（所有聊天通用） */
  const FS_KEY = "meowos_chat_fs";
  function applyFs() {
    const v = Math.min(150, Math.max(80, Number(localStorage.getItem(FS_KEY)) || 100));
    let st = document.getElementById("mx-chat-fs-style");
    if (v === 100) {
      st?.remove();
    } else {
      if (!st) {
        st = document.createElement("style");
        st.id = "mx-chat-fs-style";
        document.head.appendChild(st);
      }
      const k = v / 100;
      st.textContent = (`html body #chat-screen .chat-msg-bubble,html body #chat-screen .chat-msg-bubble-body,html body #chat-screen .chat-msg-bubble-text,html body #chat-screen .chat-msg-bubble p{font-size:calc(${(0.95 * k).toFixed(3)}rem) !important;line-height:1.5 !important}
html body #chat-screen .chat-msg-bubble-quote{font-size:calc(${(0.76 * k).toFixed(3)}rem) !important}
html body #chat-screen{--mx-av:${Math.round(40 * Math.min(k, 1.25))}px}
html body #chat-screen .chat-msg-avatar{width:${Math.round(40 * Math.min(k, 1.25))}px !important;height:${Math.round(40 * Math.min(k, 1.25))}px !important}
html body #chat-screen .chat-input{font-size:calc(${(1 * Math.min(k, 1.3)).toFixed(3)}rem) !important}`).replace(/#chat-screen/g, "#chat-screen#chat-screen#chat-screen");
      if (st.parentNode !== document.body) document.body.appendChild(st);
    }
    const r = document.getElementById("mx-chat-fs");
    const lab = document.getElementById("mx-chat-fs-val");
    if (r) r.value = String(v);
    if (lab) lab.textContent = v + "%";
  }
  document.getElementById("mx-chat-fs")?.addEventListener("input", (e) => {
    localStorage.setItem(FS_KEY, e.target.value);
    applyFs();
  });
  document.getElementById("mx-chat-fs-reset")?.addEventListener("click", () => {
    localStorage.removeItem(FS_KEY);
    applyFs();
  });
  applyFs();

  /* 微信 / QQ 风格：顶栏中间显示角色名字，点名字看心声 */
  function syncTitle() {
    const eb = document.getElementById("chat-meta-eyebrow");
    if (!eb) return;
    let t = document.querySelector("#chat-screen .mx-chat-title");
    if (!t) {
      t = document.createElement("span");
      t.className = "mx-chat-title";
      t.style.display = "none";
      t.setAttribute("role", "button");
      t.addEventListener("click", () => document.getElementById("chat-header-char-face")?.click());
      eb.parentNode.appendChild(t);
    }
    const raw = String(eb.textContent || "").trim();
    const m = raw.match(/「(.+)」/);
    t.textContent = m ? m[1] : raw.replace(/^与/, "");
  }
  const eb0 = document.getElementById("chat-meta-eyebrow");
  if (eb0 && window.MutationObserver) {
    new MutationObserver(syncTitle).observe(eb0, { childList: true, characterData: true, subtree: true });
    syncTitle();
  }
  const listRoot = document.getElementById("chat-thread-list-root");
  if (listRoot && window.MutationObserver) new MutationObserver(() => decorateList()).observe(listRoot, { childList: true, subtree: true });

  /* ═════════ 装扮页「风格包」 ═════════ */
  function preview(kind) {
    if (kind === "cute") return `<span class="mxk-pv mxk-pv--cute"><i></i><i></i><i></i><i></i></span>`;
    if (kind === "default" && this === "home") return `<span class="mxk-pv mxk-pv--home"><i></i><i></i><i></i><i></i></span>`;
    return `<span class="mxk-pv mxk-pv--${kind}"><b></b><em></em><b></b></span>`;
  }
  function render(box) {
    const chat = get(KEY_CHAT, "default");
    const home = get(KEY_HOME, "default");
    box.innerHTML = `<div><p class="widget-label"><i class="ph ph-paint-bucket" aria-hidden="true"></i> 风格包</p>
      <p class="settings-ai-blurb wardrobe-panel-lead">一键换聊天和桌面的样子。每套都附带源码，可以复制下来改颜色。</p></div>
      <p class="mxk-k">聊天风格（气泡 + 聊天列表）</p>
      <div class="mxk-row">${CHAT_SKINS.map(([k, n, d]) => `<button type="button" class="mxk-opt${chat === k ? " is-on" : ""}" data-chat="${k}">${preview.call("chat", k)}<b>${n}</b><small>${d}</small></button>`).join("")}</div>
      <p class="mxk-k">主页风格</p>
      <div class="mxk-row">${HOME_SKINS.map(([k, n, d]) => `<button type="button" class="mxk-opt${home === k ? " is-on" : ""}" data-home="${k}">${preview.call("home", k)}<b>${n}</b><small>${d}</small></button>`).join("")}</div>
      <div class="mxk-src"><span>查看源码：</span><button type="button" class="chip ghost chip-xs" data-src="wechat">微信风</button><button type="button" class="chip ghost chip-xs" data-src="qq">QQ 风</button><button type="button" class="chip ghost chip-xs" data-src="cute">奶油小猫</button></div>`;
  }
  function showSource(k) {
    const name = { wechat: "微信风", qq: "QQ 风", cute: "奶油小猫" }[k];
    const F = FUN();
    if (!F) return toast("还在加载，稍等一下");
    const sh = F.openSheet(
      `<div class="mxk-code"><p class="fun-note">这就是「${name}」的全部 CSS 源码。可以复制下来改颜色，改好后粘进「装扮 → 聊天界面样式 · CSS」的代码框，再点「保存并应用」。</p>
        <textarea readonly spellcheck="false">${esc(CSS[k])}</textarea>
        <div class="fun-setup-btns"><button type="button" class="fun-btn ghost" data-do="fill">放进 CSS 框里改</button><button type="button" class="fun-btn solid" data-do="copy">复制源码</button></div></div>`,
      { title: `${name} · 源码` }
    );
    sh.body.addEventListener("click", async (e) => {
      const d = e.target.closest("[data-do]")?.dataset.do;
      if (d === "copy") {
        try {
          await navigator.clipboard.writeText(CSS[k]);
          toast("已复制");
        } catch (_) {
          const ta = sh.body.querySelector("textarea");
          ta.select();
          document.execCommand?.("copy");
          toast("已复制");
        }
      } else if (d === "fill") {
        const ta = document.getElementById("ward-chat-css-input");
        if (!ta) return toast("先打开「我的 → 装扮」再试");
        ta.value = CSS[k];
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        sh.close();
        ta.scrollIntoView({ behavior: "smooth", block: "center" });
        toast("已放进代码框，改好后点「保存并应用」");
      }
    });
  }
  function inject() {
    const host = document.getElementById("ward-widgets-entry");
    if (!host) return false;
    if (document.getElementById("mx-skin-panel")) return true;
    const box = document.createElement("div");
    box.id = "mx-skin-panel";
    box.className = "settings-panel wardrobe-panel mxk";
    host.insertBefore(box, host.firstChild);
    render(box);
    box.addEventListener("click", (e) => {
      const c = e.target.closest("[data-chat]");
      const h = e.target.closest("[data-home]");
      const s = e.target.closest("[data-src]");
      if (s) return showSource(s.dataset.src);
      if (!c && !h) return;
      try {
        if (c) localStorage.setItem(KEY_CHAT, c.dataset.chat);
        if (h) localStorage.setItem(KEY_HOME, h.dataset.home);
      } catch (_) {
        /* ignore */
      }
      apply();
      render(box);
      toast("已换好，去聊天 / 桌面看看吧");
    });
    return true;
  }
  apply();
  if (!inject()) {
    let n = 0;
    const t = setInterval(() => {
      if (inject() || ++n > 120) clearInterval(t);
    }, 500);
  }
  window.XXJ_SKINS = { apply: () => (apply(), applyFs()), css: CSS };
})();
