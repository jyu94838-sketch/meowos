"use strict";

/**
 * 第二页应用的自定义图标：直接加进「我的 → 装扮 → 04 桌面图标」原版列表里
 * （第一页 6 个应用仍用原版那几行；这里只补第二页的应用）
 * 数据由 fun-desk.js 保存（localStorage）
 */
(function () {
  const F = window.XXJ_FUN;
  const toast = (m) => (F ? F.toast(m) : typeof showToast === "function" && showToast(m));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const D = () => window.XXJ_DESK;

  /** 选图 → 居中裁成正方形，缩到 160px */
  function pickImage() {
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
          const S = 160;
          const c = document.createElement("canvas");
          c.width = c.height = S;
          const m = Math.min(img.naturalWidth, img.naturalHeight);
          c.getContext("2d").drawImage(img, (img.naturalWidth - m) / 2, (img.naturalHeight - m) / 2, m, m, 0, 0, S, S);
          URL.revokeObjectURL(url);
          let out = c.toDataURL("image/webp", 0.9);
          if (!out.startsWith("data:image/webp")) out = c.toDataURL("image/png");
          resolve(out);
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

  let box = null;
  function render() {
    const desk = D();
    if (!box || !desk) return;
    const icons = desk.getIcons();
    box.innerHTML =
      `<p class="mx-p2-icons-k">第二页的应用</p>` +
      desk
        .apps()
        .map(
          (a) =>
            `<div class="ward-desktop-icon-row mx-p2-icon-row" data-mx-k="${a.key}" role="listitem">` +
            `<div class="ward-desktop-icon-meta"><span class="ward-desktop-icon-name">${esc(a.name)}</span><span class="ward-desktop-icon-hint">第二页</span></div>` +
            (icons[a.key] ? `<img class="ward-desktop-icon-preview" alt="" width="40" height="40" src="${icons[a.key]}" />` : `<img class="ward-desktop-icon-preview is-empty" alt="" width="40" height="40" />`) +
            `<button type="button" class="chip ghost chip-xs" data-mx-do="pick">上传</button>` +
            `<button type="button" class="chip ghost chip-xs" data-mx-do="clear">清除</button></div>`
        )
        .join("");
  }

  function inject() {
    const mount = document.getElementById("ward-desktop-home-icons-mount");
    if (!mount || !D()) return false;
    if (document.getElementById("mx-p2-icons")) return true;
    box = document.createElement("div");
    box.id = "mx-p2-icons";
    box.className = "ward-desktop-icons";
    box.setAttribute("role", "list");
    mount.after(box);
    box.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-mx-do]");
      if (!b) return;
      const k = b.closest("[data-mx-k]").dataset.mxK;
      if (b.dataset.mxDo === "clear") {
        D().setIcon(k, null);
        toast("已恢复默认图标");
      } else {
        const src = await pickImage();
        if (!src) return;
        if (D().setIcon(k, src) !== false) toast("图标已更换");
      }
      render();
    });
    // 原版「清除全部主屏自定义图标」也把第二页的一起清掉
    document.getElementById("ward-desktop-home-icons-clear-all")?.addEventListener("click", () => {
      const desk = D();
      for (const k of Object.keys(desk.getIcons())) desk.setIcon(k, null);
      render();
    });
    render();
    return true;
  }

  /** 桌面编辑模式里的「图标」按钮：打开装扮页并滚到桌面图标 */
  window.openDeskIcons = function () {
    if (typeof window.openWardrobeScreen === "function") window.openWardrobeScreen();
    setTimeout(() => {
      inject();
      document.getElementById("ward-desktop-home-icons-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 350);
  };

  if (!inject()) {
    let n = 0;
    const t = setInterval(() => {
      if (inject() || ++n > 40) clearInterval(t);
    }, 500);
  }
})();
