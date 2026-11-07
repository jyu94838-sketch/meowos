"use strict";

/**
 * 聊天界面右上角的「查找聊天记录」
 * - 搜当前聊天里的消息文字；点结果：消息在屏幕上就直接跳过去并闪一下，否则展开上下文
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast } = F;

  function plain(m) {
    let t = "";
    if (typeof m.content === "string") t = m.content;
    else if (Array.isArray(m.content)) t = m.content.map((x) => (typeof x === "string" ? x : x && x.text) || "").join(" ");
    if (!t && m.image && m.image.desc) t = "[图片] " + m.image.desc;
    try {
      if (typeof htmlToPlainTextForPrompt === "function" && /<[a-z]/i.test(t)) t = htmlToPlainTextForPrompt(t);
    } catch (_) {
      /* ignore */
    }
    return String(t || "").replace(/\s+/g, " ").trim();
  }
  function fmtTime(at) {
    const d = new Date(Number(at) || 0);
    if (!Number(at) || isNaN(d)) return "";
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function who(m) {
    if (m.role === "user") return "我";
    if (m.role === "system") return "系统";
    try {
      const t = document.getElementById("chat-meta-eyebrow")?.textContent || "";
      const n = (t.match(/「(.+?)」/) || [])[1];
      if (n) return n;
    } catch (_) {
      /* ignore */
    }
    return "TA";
  }
  const mark = (text, q) => {
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(text.slice(0, 80));
    const from = Math.max(0, i - 24);
    return (from ? "…" : "") + esc(text.slice(from, i)) + `<mark>${esc(text.slice(i, i + q.length))}</mark>` + esc(text.slice(i + q.length, i + q.length + 60)) + (i + q.length + 60 < text.length ? "…" : "");
  };

  function open() {
    if (typeof readChatLog !== "function") return toast("还在加载，稍等一下");
    const log = readChatLog() || [];
    const sh = F.openSheet(
      `<div class="mxs">
        <input class="mxs-in" type="search" placeholder="输入要找的字，比如：生日" enterkeyhint="search" />
        <p class="fun-note mxs-count">共 ${log.length} 条消息可以搜</p>
        <div class="mxs-list"></div>
      </div>`,
      { title: "查找聊天记录" }
    );
    const inp = sh.body.querySelector(".mxs-in");
    const list = sh.body.querySelector(".mxs-list");
    const count = sh.body.querySelector(".mxs-count");
    let timer = 0;
    function run() {
      const q = inp.value.trim();
      if (!q) {
        list.innerHTML = "";
        count.textContent = `共 ${log.length} 条消息可以搜`;
        return;
      }
      const hits = [];
      for (let i = log.length - 1; i >= 0 && hits.length < 200; i--) {
        const t = plain(log[i]);
        if (t && t.toLowerCase().includes(q.toLowerCase())) hits.push({ i, t });
      }
      count.textContent = hits.length ? `找到 ${hits.length} 条${hits.length >= 200 ? "（只显示最近 200 条）" : ""}` : "没找到，换个词试试";
      list.innerHTML = hits
        .map(
          (h) => `<button type="button" class="mxs-item" data-i="${h.i}"><span class="mxs-meta"><b>${esc(who(log[h.i]))}</b>${esc(fmtTime(log[h.i].at))}</span><span class="mxs-text">${mark(h.t, q)}</span><span class="mxs-ctx" hidden></span></button>`
        )
        .join("");
    }
    inp.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(run, 180);
    });
    list.addEventListener("click", (e) => {
      const b = e.target.closest(".mxs-item");
      if (!b) return;
      const i = Number(b.dataset.i);
      const el = document.querySelector(`#chat-messages [data-chat-msg-idx="${i}"]`);
      if (el) {
        sh.close();
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("mxs-flash");
          setTimeout(() => el.classList.remove("mxs-flash"), 1800);
        }, 260);
        return;
      }
      // 不在屏幕上（比较早的消息）：直接在这里展开前后几条
      const ctx = b.querySelector(".mxs-ctx");
      if (!ctx.hidden) return (ctx.hidden = true);
      const rows = [];
      for (let k = Math.max(0, i - 2); k <= Math.min(log.length - 1, i + 2); k++) {
        const t = plain(log[k]);
        if (t) rows.push(`<span class="${k === i ? "is-hit" : ""}"><b>${esc(who(log[k]))}：</b>${esc(t.slice(0, 160))}</span>`);
      }
      ctx.innerHTML = rows.join("") + `<small>这条比较早，在聊天里往上翻「更早的消息」就能看到原文</small>`;
      ctx.hidden = false;
    });
    setTimeout(() => inp.focus(), 250);
  }

  function inject() {
    const right = document.querySelector("#chat-screen .chat-topbar-right");
    if (!right) return false;
    if (document.getElementById("mx-chat-search-btn")) return true;
    const b = document.createElement("button");
    b.type = "button";
    b.id = "mx-chat-search-btn";
    b.className = "mx-chat-search-btn";
    b.setAttribute("aria-label", "查找聊天记录");
    b.innerHTML = `<i class="ph ph-magnifying-glass" aria-hidden="true"></i>`;
    b.addEventListener("click", open);
    right.insertBefore(b, right.firstChild);
    return true;
  }
  if (!inject()) {
    let n = 0;
    const t = setInterval(() => {
      if (inject() || ++n > 40) clearInterval(t);
    }, 500);
  }
  window.openChatSearch = open;
})();
