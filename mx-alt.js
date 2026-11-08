"use strict";

/**
 * 小号 / 马甲
 * - 「我的小号」：用户在这个聊天里开一个小号（名字、头像、对外人设），一键切换用小号发消息；
 *   可以设定 TA 认不认得出是你（完全不知道 / 隐约怀疑 / 一眼看穿）
 * - 「TA 主动开马甲」：角色已经在人设里开了马甲时，打开后 TA 会偶尔自己切到马甲来找你
 * 入口都在聊天输入框旁边的「＋」面板里
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast } = F;
  const thread = () => (typeof readActiveThread === "function" ? readActiveThread() : null);
  const patch = (fn) => {
    if (typeof patchActiveThread === "function") patchActiveThread(fn);
  };
  const rerender = () => {
    try {
      if (typeof scheduleRenderChatMessages === "function") scheduleRenderChatMessages();
    } catch (_) {
      /* ignore */
    }
    syncPill();
    syncBtns();
  };
  const charOf = (th) => (th?.charId && typeof getCharPersonaItemById === "function" ? getCharPersonaItemById(th.charId) : null);
  const hasAlt = (th) => {
    const ci = charOf(th);
    return !!(ci && typeof charHasAltPersona === "function" && charHasAltPersona(ci));
  };
  const altName = (th) => {
    const ci = charOf(th);
    return ci && typeof resolvePersonaDisplayName === "function" ? resolvePersonaDisplayName(ci, "alt") : "马甲";
  };
  const REC = {
    unknown: ["完全不知道", "把小号当成另一个人"],
    suspect: ["隐约怀疑", "觉得有点像你，会试探"],
    know: ["一眼看穿", "知道是你，可能配合演也可能拆穿"]
  };

  function shrink(file) {
    return new Promise((ok) => {
      const fr = new FileReader();
      fr.onload = () => {
        const im = new Image();
        im.onload = () => {
          const c = document.createElement("canvas");
          c.width = c.height = 160;
          const s = Math.min(im.width, im.height);
          c.getContext("2d").drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 160, 160);
          ok(c.toDataURL("image/jpeg", 0.82));
        };
        im.onerror = () => ok("");
        im.src = fr.result;
      };
      fr.onerror = () => ok("");
      fr.readAsDataURL(file);
    });
  }

  /* ───── 我的小号 ───── */
  function openUserAlt() {
    const th = thread();
    if (!th) return toast("先打开一个聊天");
    if (th.kind === "group") return toast("群聊里暂时不能用小号");
    const ua = th.userAlt || {};
    const isSet = !!ua.name;
    let av = ua.avatar || "";
    let rec = ua.recognize || "unknown";
    const sh = F.openSheet(
      `<div class="ua-form">
        ${isSet ? `<div class="ua-now ${th.userAltOn ? "is-on" : ""}"><b>${th.userAltOn ? `正在用小号「${esc(ua.name)}」发消息` : "现在用的是大号（你本人）"}</b><button type="button" class="fun-btn ${th.userAltOn ? "ghost" : "solid"} sm" data-x="toggle">${th.userAltOn ? "切回大号" : "切到小号"}</button></div>` : `<p class="fun-note">开一个小号，用另一个身份给 TA 发消息。TA 看到的是小号的名字和头像，至于认不认得出是你，由你来定。</p>`}
        <div class="ua-row"><button type="button" class="ua-av" data-x="av">${av ? `<img src="${av}" alt="">` : "＋<small>头像</small>"}</button>
          <div class="ua-fields"><input type="text" id="ua-name" maxlength="20" placeholder="小号名字" value="${esc(ua.name || "")}"/></div></div>
        <textarea id="ua-persona" rows="3" maxlength="300" placeholder="小号对外的样子（可不填）：比如「自称是隔壁班的同学，说话很冷淡」">${esc(ua.persona || "")}</textarea>
        <p class="ua-k">TA 认得出这是你吗？</p>
        <div class="ua-rec">${Object.entries(REC).map(([k, [a, b]]) => `<button type="button" data-rec="${k}" class="${rec === k ? "is-on" : ""}"><b>${a}</b><small>${b}</small></button>`).join("")}</div>
        <input type="file" id="ua-file" accept="image/*" hidden/>
        <div class="fun-sheet-actions">
          <button type="button" class="fun-btn solid" data-x="save">${isSet ? "保存" : "保存并切到小号"}</button>
          ${isSet ? `<button type="button" class="fun-btn ghost" data-x="del">删掉小号</button>` : ""}
        </div>
        <p class="fun-note">小号只在这个聊天里用。切换后输入框上方会有提示条，点一下就能换回大号。</p>
      </div>`,
      { title: "我的小号" }
    );
    const file = sh.body.querySelector("#ua-file");
    file.addEventListener("change", async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      av = await shrink(f);
      sh.body.querySelector("[data-x=av]").innerHTML = av ? `<img src="${av}" alt="">` : "＋<small>头像</small>";
    });
    sh.body.addEventListener("click", (e) => {
      const r = e.target.closest("[data-rec]");
      if (r) {
        rec = r.dataset.rec;
        sh.body.querySelectorAll("[data-rec]").forEach((b) => b.classList.toggle("is-on", b === r));
        return;
      }
      const x = e.target.closest("[data-x]")?.dataset.x;
      if (x === "av") return file.click();
      if (x === "toggle") {
        const on = !thread()?.userAltOn;
        patch((t) => (t.userAltOn = on));
        sh.close();
        toast(on ? `已切到小号「${ua.name}」` : "已切回大号");
        return rerender();
      }
      if (x === "del") {
        if (!confirm("删掉这个小号？以前用小号发的消息还在，只是不再显示小号头像。")) return;
        patch((t) => {
          delete t.userAlt;
          delete t.userAltOn;
        });
        sh.close();
        return rerender();
      }
      if (x === "save") {
        const name = sh.body.querySelector("#ua-name").value.trim().slice(0, 20);
        if (!name) return toast("给小号起个名字");
        const persona = sh.body.querySelector("#ua-persona").value.trim().slice(0, 300);
        patch((t) => {
          t.userAlt = { name, avatar: av, persona, recognize: rec };
          if (!isSet) t.userAltOn = true;
        });
        sh.close();
        toast(isSet ? "小号已保存" : `已切到小号「${name}」，现在发的消息都是小号发的`);
        rerender();
      }
    });
  }

  /* ───── TA 主动开马甲 ───── */
  function toggleCharAuto() {
    const th = thread();
    if (!th) return;
    if (th.kind === "group") return toast("群聊里不能用");
    if (!hasAlt(th)) {
      toast("TA 还没有马甲：先去角色设置里打开「启用马甲」，写好马甲的名字和人设");
      return;
    }
    const on = !th.charAltAuto;
    patch((t) => (t.charAltAuto = on));
    toast(on ? `打开了：${altName(th)}（TA 的马甲）会偶尔主动来找你` : "关掉了：TA 不会主动切马甲");
    syncBtns();
  }

  /* ───── 输入框上方的提示条 ───── */
  function syncPill() {
    const scr = document.getElementById("chat-screen");
    const comp = scr?.querySelector(".chat-composer");
    if (!comp) return;
    let pill = document.getElementById("ua-pill");
    const th = thread();
    const show = !!(th && th.kind !== "group" && th.userAltOn && th.userAlt?.name);
    if (!show) {
      pill?.remove();
      return;
    }
    if (!pill) {
      pill = document.createElement("div");
      pill.id = "ua-pill";
      pill.className = "ua-pill";
      comp.parentNode.insertBefore(pill, comp);
      pill.addEventListener("click", (e) => {
        if (e.target.closest("[data-ua=off]")) {
          patch((t) => (t.userAltOn = false));
          toast("已切回大号");
          rerender();
        } else openUserAlt();
      });
    }
    const ua = th.userAlt;
    pill.innerHTML = `${ua.avatar ? `<img src="${ua.avatar}" alt="">` : "🎭"}<span>正在用小号「<b>${esc(ua.name)}</b>」发消息</span><button type="button" data-ua="off">切回大号</button>`;
  }

  /* ───── 「＋」面板里的按钮 ───── */
  function syncBtns() {
    const th = thread();
    const b1 = document.getElementById("mx-more-ualt");
    const b2 = document.getElementById("mx-more-calt");
    const grp = th?.kind === "group";
    if (b1) {
      b1.hidden = grp;
      b1.style.display = grp ? "none" : "";
      b1.classList.toggle("is-active", !!th?.userAltOn);
      const s = b1.querySelector("span");
      if (s) s.textContent = th?.userAltOn ? "小号中" : "我的小号";
    }
    if (b2) {
      b2.hidden = grp;
      b2.style.display = grp ? "none" : "";
      b2.classList.toggle("is-active", !!th?.charAltAuto && hasAlt(th));
      const s = b2.querySelector("span");
      if (s) s.textContent = th?.charAltAuto && hasAlt(th) ? "TA 会开马甲" : "TA 主动开马甲";
    }
  }
  function inject() {
    const grid = document.querySelector("#chat-more-drawer .chat-more-drawer-grid");
    if (!grid) return false;
    if (document.getElementById("mx-more-ualt")) return true;
    const mk = (id, icon, label, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      b.id = id;
      b.className = "drawer-item chat-more-drawer-item";
      b.innerHTML = `<i class="ph ${icon}" aria-hidden="true"></i><span>${label}</span>`;
      b.addEventListener(
        "click",
        (e) => {
          e.stopPropagation();
          e.preventDefault();
          try {
            if (typeof closeChatMoreSheet === "function") closeChatMoreSheet();
          } catch (_) {
            /* ignore */
          }
          setTimeout(fn, 120);
        },
        true
      );
      return b;
    };
    const persona = document.getElementById("chat-more-persona-wrap");
    grid.insertBefore(mk("mx-more-ualt", "ph-user-switch", "我的小号", openUserAlt), persona || null);
    grid.insertBefore(mk("mx-more-calt", "ph-detective", "TA 主动开马甲", toggleCharAuto), persona || null);
    syncBtns();
    return true;
  }
  if (!inject()) {
    let n = 0;
    const t = setInterval(() => {
      if (inject() || ++n > 40) clearInterval(t);
    }, 500);
  }
  // 换了聊天 / 打开「＋」面板时同步一下
  let lastKey = "";
  setInterval(() => {
    const scr = document.getElementById("chat-screen");
    if (!scr || scr.getAttribute("aria-hidden") === "true" || getComputedStyle(scr).visibility === "hidden") return;
    const th = thread();
    const k = `${th?.id || ""}|${th?.userAltOn ? 1 : 0}|${th?.userAlt?.name || ""}|${th?.charAltAuto ? 1 : 0}`;
    if (k === lastKey && (document.getElementById("ua-pill") ? 1 : 0) === (th?.userAltOn ? 1 : 0)) return;
    lastKey = k;
    syncPill();
    syncBtns();
  }, 1200);

  window.XXJ_ALT = { openUserAlt, toggleCharAuto };
})();
