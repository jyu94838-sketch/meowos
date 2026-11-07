"use strict";

/**
 * 聊天「+」面板 →「让 TA 选」：选歌 / 吃什么 / 穿什么 / 喝什么 / 自定义
 * - 就是用你的口吻发一条普通聊天消息，TA 按人设正常回复 → 聊天记录、记忆都在同一个聊天里
 * - 选歌可以附一张图（写图片里是什么），TA 回复里提到《歌名》时会冒出「去听」按钮
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast } = F;

  const TYPES = {
    music: { icon: "🎵", name: "选歌", q: "帮我挑一首歌听" },
    food: { icon: "🍜", name: "吃什么", q: "今天吃什么" },
    wear: { icon: "👗", name: "穿什么", q: "今天穿什么" },
    drink: { icon: "🧋", name: "喝什么", q: "喝点什么" },
    custom: { icon: "✨", name: "自定义", q: "" }
  };
  const splitOpts = (s) =>
    String(s || "")
      .split(/[\s,，、/|；;]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 8);

  function compose(type, f) {
    const opts = splitOpts(f.opts);
    const note = String(f.note || "").trim();
    const img = String(f.img || "").trim();
    if (type === "music") {
      let t = `【让你帮我选】${img ? "看看这张图，" : ""}帮我挑一首歌听吧${note ? `，${note}` : ""}～说一下歌名和歌手哦`;
      if (opts.length) t += `\n我在这几首里纠结：${opts.join(" / ")}`;
      if (img) t += `\n【图片】${img}`;
      return t;
    }
    const what = type === "custom" ? String(f.what || "").trim() : TYPES[type].q;
    if (!what) return "";
    let t = `【让你帮我选】${what}？`;
    t += opts.length ? `我在纠结：${opts.join(" / ")}，你帮我挑一个` : "你帮我想一个吧";
    if (note) t += `（${note}）`;
    return t;
  }

  function open() {
    if (typeof sendChatFromInput !== "function") return toast("还在加载，稍等一下");
    try {
      if (typeof closeChatMoreSheet === "function") closeChatMoreSheet();
    } catch (_) {
      /* ignore */
    }
    let type = "music";
    const sh = F.openSheet(`<div class="mxc"><div class="mxc-types"></div><div class="mxc-form"></div>
      <p class="fun-note">会用你的口吻发一条消息给 TA，TA 按自己的性格帮你选，聊天记录和记忆都在这个聊天里。</p>
      <button type="button" class="fun-btn solid mxc-go">发给 TA</button></div>`, { title: "让 TA 帮你选" });
    const typesEl = sh.body.querySelector(".mxc-types");
    const form = sh.body.querySelector(".mxc-form");
    function draw() {
      typesEl.innerHTML = Object.entries(TYPES)
        .map(([k, t]) => `<button type="button" class="mxc-type${k === type ? " is-on" : ""}" data-t="${k}"><span>${t.icon}</span>${t.name}</button>`)
        .join("");
      form.innerHTML =
        type === "music"
          ? `<label class="fun-field"><span>配一张图（可选）：写写图里是什么</span><textarea class="mxc-img" rows="2" placeholder="比如：傍晚的海边，天空是粉色的"></textarea></label>
             <label class="fun-field"><span>现在的心情 / 场景（可选）</span><input class="mxc-note" placeholder="比如：下雨天一个人在家" /></label>
             <label class="fun-field"><span>候选歌曲（可选）</span><input class="mxc-opts" placeholder="不填就让 TA 自己推荐" /></label>`
          : `${type === "custom" ? `<label class="fun-field"><span>让 TA 帮你选什么？</span><input class="mxc-what" placeholder="比如：周末去哪玩" /></label>` : ""}
             <label class="fun-field"><span>候选（可选，用空格或逗号隔开）</span><input class="mxc-opts" placeholder="${type === "food" ? "火锅 烧烤 寿司" : type === "wear" ? "白裙子 牛仔裤 卫衣" : type === "drink" ? "奶茶 咖啡 柠檬水" : "选项 A 选项 B"}" /></label>
             <label class="fun-field"><span>补充一句（可选）</span><input class="mxc-note" placeholder="${type === "wear" ? "比如：今天要去约会，外面有点冷" : "比如：不想太辣 / 在减肥"}" /></label>`;
    }
    draw();
    typesEl.addEventListener("click", (e) => {
      const b = e.target.closest("[data-t]");
      if (!b) return;
      type = b.dataset.t;
      draw();
    });
    sh.body.querySelector(".mxc-go").onclick = async () => {
      const val = (c) => sh.body.querySelector(c)?.value || "";
      const text = compose(type, { img: val(".mxc-img"), note: val(".mxc-note"), opts: val(".mxc-opts"), what: val(".mxc-what") });
      if (!text) return toast("写一下要 TA 帮你选什么");
      const input = document.getElementById("chat-input");
      if (!input) return toast("先打开一个聊天");
      sh.close();
      input.value = text;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const before = lastAssistantIdx();
      await sendChatFromInput(); // 先把你的消息发出去
      let offline = false;
      try {
        offline = typeof getActiveChatDmSurfaceForContext === "function" && getActiveChatDmSurfaceForContext() === "offline";
      } catch (_) {
        offline = false;
      }
      if (!offline) await sendChatFromInput(); // 空发送 = 让 TA 回复
      if (type === "music") offerListen(before);
    };
  }

  function lastAssistantIdx() {
    try {
      const log = typeof readChatLog === "function" ? readChatLog() : [];
      for (let i = log.length - 1; i >= 0; i--) if (log[i]?.role === "assistant") return i;
    } catch (_) {
      /* ignore */
    }
    return -1;
  }
  /** TA 回复里提到《歌名》：冒出「去听」按钮 */
  function offerListen(beforeIdx) {
    let log = [];
    try {
      log = readChatLog() || [];
    } catch (_) {
      return;
    }
    let text = "";
    for (let i = log.length - 1; i > beforeIdx && i >= 0; i--) if (log[i]?.role === "assistant") text = String(log[i].content || "") + " " + text;
    const m = text.match(/《([^》]{1,40})》/);
    if (!m) return;
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 30);
    const artist = (after.match(/^\s*[-—–·by\s]*([^\s，。,.!！？?|]{1,20})/) || [])[1] || "";
    document.getElementById("mxc-listen")?.remove();
    const b = document.createElement("button");
    b.type = "button";
    b.id = "mxc-listen";
    b.className = "mxc-listen";
    b.innerHTML = `🎵 去听《${esc(m[1])}》`;
    b.onclick = () => {
      b.remove();
      window.XXJ_MUSIC?.search?.(`${m[1]} ${artist}`.trim());
    };
    (document.getElementById("chat-screen") || document.body).appendChild(b);
    setTimeout(() => b.remove(), 20000);
  }

  function inject() {
    const grid = document.querySelector("#chat-more-drawer .chat-more-drawer-grid");
    if (!grid) return false;
    if (document.getElementById("mxc-drawer-item")) return true;
    const b = document.createElement("button");
    b.type = "button";
    b.id = "mxc-drawer-item";
    b.className = "drawer-item chat-more-drawer-item";
    b.dataset.action = "mx-choose";
    b.setAttribute("data-chat-more-dm-only", "");
    b.innerHTML = `<i class="ph ph-hand-pointing" aria-hidden="true"></i><span>让 TA 选</span>`;
    b.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        e.preventDefault();
        open();
      },
      true
    );
    const persona = document.getElementById("chat-more-persona-wrap");
    grid.insertBefore(b, persona || null);
    return true;
  }
  if (!inject()) {
    let n = 0;
    const t = setInterval(() => {
      if (inject() || ++n > 40) clearInterval(t);
    }, 500);
  }
  window.openChatChoose = open;
})();
