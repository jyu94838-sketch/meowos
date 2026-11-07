"use strict";

/**
 * 桌面图标：给每个应用换自己的图标
 * 入口：我的 → 装扮 →「桌面图标」；桌面编辑模式顶栏的「图标」
 * 数据由 fun-desk.js 保存（localStorage），这里只是管理界面
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast } = F;
  let fromWardrobe = false;
  let root = null;

  const D = () => window.XXJ_DESK;
  /** 选图 → 居中裁成正方形，缩到 128px */
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
          const S = 128;
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

  function tile(a, src, extra) {
    return `<button type="button" class="desk-app ico-tile" ${extra || ""}><span class="desk-app-ico${src ? " has-img" : ""}">${src ? `<img src="${src}" alt="" />` : `<i class="ph ${a.icon}"></i>`}</span><span class="desk-app-name">${esc(a.name)}</span></button>`;
  }

  function render() {
    if (!root) return;
    const desk = D();
    if (!desk) {
      root.innerHTML = `<p class="fun-note">桌面还没加载好，退出再进一次试试。</p>`;
      return;
    }
    const icons = desk.getIcons();
    const apps = desk.apps();
    root.innerHTML = `<div class="ico-m">
      <p class="fun-kicker">APP ICONS · 换图标</p>
      <p class="fun-note">点一个应用，从相册选一张图当它的图标（会自动裁成正方形）。聊天、查岗、关系、角色人设、漫游、我的会和第一页一起换。</p>
      <div class="desk-apps-grid ico-grid">${apps.map((a) => tile(a, icons[a.key], `data-k="${a.key}"`)).join("")}</div>
      ${Object.keys(icons).length ? `<button type="button" class="fun-btn ghost ico-reset-all" id="ico-reset-all">全部恢复默认图标</button>` : ""}
    </div>`;
  }

  async function onClick(e) {
    const desk = D();
    if (!desk) return;
    if (e.target.closest("#ico-reset-all")) {
      for (const k of Object.keys(desk.getIcons())) desk.setIcon(k, null);
      toast("已全部恢复默认");
      render();
      return;
    }
    const t = e.target.closest("[data-k]");
    if (!t) return;
    const k = t.dataset.k;
    const a = desk.apps().find((x) => x.key === k);
    const has = !!desk.getIcons()[k];
    const sh = F.openSheet(
      `<div class="fun-sheet-actions ico-acts">
        <button type="button" class="fun-btn solid" data-do="pick">从相册选图片</button>
        ${has ? `<button type="button" class="fun-btn ghost" data-do="reset">恢复默认图标</button>` : ""}
      </div>`,
      { title: a ? a.name : "换图标" }
    );
    sh.body.addEventListener("click", async (ev) => {
      const d = ev.target.closest("[data-do]")?.dataset.do;
      if (!d) return;
      sh.close();
      if (d === "reset") {
        desk.setIcon(k, null);
        toast("已恢复默认图标");
      } else {
        const src = await pickImage();
        if (!src) return;
        if (desk.setIcon(k, src) !== false) toast("图标已更换");
      }
      render();
    });
  }

  F.register("桌面图标", {
    title: "桌面图标",
    kicker: "ICONS",
    get back() {
      return fromWardrobe && typeof window.openWardrobeScreen === "function" ? () => window.openWardrobeScreen() : null;
    },
    mount(body) {
      root = document.createElement("div");
      body.appendChild(root);
      root.addEventListener("click", onClick);
      render();
    },
    unmount() {
      root = null;
    }
  });

  function open(wardrobe) {
    fromWardrobe = !!wardrobe;
    window.openFunApp?.("桌面图标");
  }
  window.openDeskIcons = open;

  /* 装扮页入口：放在「桌面小组件」那一块里 */
  function inject() {
    const host = document.getElementById("ward-widgets-entry");
    if (!host) return false;
    if (document.getElementById("ward-icons-open")) return true;
    const panel = document.createElement("div");
    panel.className = "settings-panel wardrobe-panel wg-ward";
    panel.innerHTML = `<div><p class="widget-label"><i class="ph ph-app-window" aria-hidden="true"></i> 桌面图标</p>
      <p class="settings-ai-blurb wardrobe-panel-lead">给桌面上每个应用换成你自己的图片当图标。</p></div>
      <button type="button" class="chip solid" id="ward-icons-open">设置图标</button>`;
    host.insertBefore(panel, host.children[1] || null);
    panel.querySelector("#ward-icons-open").addEventListener("click", () => open(true));
    return true;
  }
  if (!inject()) {
    let n = 0;
    const t = setInterval(() => {
      if (inject() || ++n > 40) clearInterval(t);
    }, 500);
  }
})();
