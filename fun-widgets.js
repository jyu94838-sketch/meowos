"use strict";

/**
 * 桌面小组件
 * - 放在桌面应用页的格子里（和图标一起），小 2×2、中 4×2、大 4×4；长按桌面后可以拖到任意位置
 * - 在「我的 → 装扮」里点「桌面小组件」管理，也可以点桌面上的「编辑」
 * - 类型：照片、音乐、便签、倒数日、时钟、情侣天数、角色、今日运势
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast, uid, avHtml } = F;

  const KV = "desk_widgets_v1";
  const TYPES = {
    photo: { name: "照片", icon: "🖼", sizes: ["s", "m", "l"], desc: "放一张喜欢的图" },
    music: { name: "音乐", icon: "🎵", sizes: ["s", "m"], desc: "正在播放 + 播放控制" },
    note: { name: "便签", icon: "📝", sizes: ["s", "m"], desc: "写一句话贴在桌面" },
    countdown: { name: "倒数日", icon: "📅", sizes: ["s", "m"], desc: "距离某天还有几天" },
    clock: { name: "时钟", icon: "🕰", sizes: ["s", "m"], desc: "小号是表盘，中号是日期时间" },
    couple: { name: "情侣天数", icon: "💞", sizes: ["s", "m"], desc: "情侣小屋里在一起的天数" },
    char: { name: "角色", icon: "🎭", sizes: ["s", "m", "l"], desc: "角色头像 + 一句话" },
    astro: { name: "今日运势", icon: "🔮", sizes: ["m"], desc: "星座 app 里今天的运势" }
  };
  const SIZE_NAME = { s: "小", m: "中", l: "大" };
  const NOTE_COLORS = { yellow: "#fff3b0", pink: "#ffd6e0", blue: "#d6ecff", green: "#d9f5dc", dark: "#2b2b33" };

  let widgets = [];
  let cast = [];
  let area = null;
  let clockTimer = 0;

  async function load() {
    try {
      widgets = (await F.FunDB.get(KV)) || [];
    } catch (_) {
      widgets = [];
    }
  }
  function save() {
    F.FunDB.set(KV, widgets).catch(() => toast("保存失败：存储空间不足"));
    renderDesk();
  }

  function compress(file, max) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      const url = URL.createObjectURL(file);
      im.onload = () => {
        const s = Math.min(1, (max || 900) / Math.max(im.width, im.height));
        const c = document.createElement("canvas");
        c.width = Math.round(im.width * s);
        c.height = Math.round(im.height * s);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      im.onerror = reject;
      im.src = url;
    });
  }
  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
  const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  /* ───── 单个小组件的内容 ───── */
  async function widgetInner(w) {
    const d = w.data || {};
    switch (w.type) {
      case "photo":
        return d.img
          ? `<img class="wg-photo" src="${esc(d.img)}" alt="" />${d.cap ? `<span class="wg-cap">${esc(d.cap)}</span>` : ""}`
          : `<div class="wg-empty">🖼<small>点编辑选图</small></div>`;
      case "music": {
        const M = window.XXJ_MUSIC;
        const t = M?.current();
        const playing = M?.playing();
        if (w.size === "s")
          return `<div class="wg-music s${playing ? " is-playing" : ""}"><span class="wg-disc${t?.cover ? " has-cover" : ""}" style="${t?.cover ? `--cover:url('${esc(t.cover)}')` : ""}">${t?.cover ? "" : "♪"}</span><strong>${esc(t?.title || "没有在放")}</strong><button type="button" class="wg-btn" data-mu="toggle">${playing ? "❚❚" : "▶"}</button></div>`;
        return `<div class="wg-music m${playing ? " is-playing" : ""}"><span class="wg-disc${t?.cover ? " has-cover" : ""}" style="${t?.cover ? `--cover:url('${esc(t.cover)}')` : ""}">${t?.cover ? "" : "♪"}</span>
          <div class="wg-music-meta"><small>${playing ? "正在播放" : "Meow 音乐"}</small><strong>${esc(t?.title || "没有在放的歌")}</strong><span>${esc(t?.artist || "点 ▶ 播放歌单")}</span>
          <i class="wg-prog"><b style="width:${Math.round((M?.progress() || 0) * 100)}%"></b></i>
          <div class="wg-ctrls"><button type="button" class="wg-btn" data-mu="prev">⏮</button><button type="button" class="wg-btn big" data-mu="toggle">${playing ? "❚❚" : "▶"}</button><button type="button" class="wg-btn" data-mu="next">⏭</button></div></div></div>`;
      }
      case "note":
        return `<div class="wg-note c-${esc(d.color || "yellow")}"><p>${esc(d.text || "写点什么…").replace(/\n/g, "<br/>")}</p></div>`;
      case "countdown": {
        if (!d.date) return `<div class="wg-empty">📅<small>点编辑设置日期</small></div>`;
        let target = d.date;
        if (d.yearly) {
          const [, m, dd] = d.date.split("-");
          const y = new Date().getFullYear();
          target = `${y}-${m}-${dd}`;
          if (target < todayIso()) target = `${y + 1}-${m}-${dd}`;
        }
        const n = daysBetween(todayIso(), target);
        return `<div class="wg-count"><small>${esc(d.name || "倒数日")}${n >= 0 ? " 还有" : " 已经"}</small><b>${Math.abs(n)}</b><span>天</span>${w.size === "m" ? `<em>${target.replace(/-/g, ".")}</em>` : ""}</div>`;
      }
      case "clock": {
        const now = new Date();
        if (w.size === "s") {
          const h = (now.getHours() % 12) * 30 + now.getMinutes() * 0.5;
          const m = now.getMinutes() * 6;
          return `<div class="wg-analog">${Array.from({ length: 12 }, (_, i) => `<i style="transform:rotate(${i * 30}deg)"></i>`).join("")}<b class="h" style="transform:rotate(${h}deg)"></b><b class="m" style="transform:rotate(${m}deg)"></b><span></span></div>`;
        }
        const wk = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][now.getDay()];
        return `<div class="wg-digital"><small>${now.getMonth() + 1}月${now.getDate()}日 · ${wk}</small><b>${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}</b></div>`;
      }
      case "couple": {
        const S = await F.FunDB.get("couple_v1").catch(() => null);
        const id = d.charId || S?.partnerId;
        const room = S?.by?.[id];
        const c = cast.find((x) => x.id === id);
        if (!room || !c) return `<div class="wg-empty">💞<small>先去情侣小屋选恋人</small></div>`;
        const user = await F.loadUser();
        const n = daysBetween(room.start, todayIso()) + 1;
        return `<div class="wg-couple"><div class="wg-cavs">${avHtml(user, "fun-av sm")}<span>❤</span>${avHtml(c, "fun-av sm")}</div><b>${n}</b><small>${w.size === "m" ? `${esc(user.name)} & ${esc(c.name)} 在一起` : "天"}</small></div>`;
      }
      case "char": {
        const c = cast.find((x) => x.id === d.charId);
        if (!c) return `<div class="wg-empty">🎭<small>点编辑选角色</small></div>`;
        const line = d.line || String(c.persona || "").split("\n")[0].slice(0, 40);
        if (w.size === "l" && c.avatar) return `<div class="wg-char l"><img src="${esc(c.avatar)}" alt="" /><div><strong>${esc(c.name)}</strong><p>${esc(line)}</p></div></div>`;
        return `<div class="wg-char ${w.size}">${avHtml(c, "fun-av wg-char-av")}<div><strong>${esc(c.name)}</strong>${w.size !== "s" ? `<p>${esc(line)}</p>` : ""}</div></div>`;
      }
      case "astro": {
        const A = await F.FunDB.get("astro_v1").catch(() => null);
        const f = A?.mySign && A.fortune?.[dayKey(new Date()) + "|" + A.mySign];
        if (!A?.mySign) return `<div class="wg-empty">🔮<small>先去星座 app 设置星座</small></div>`;
        if (!f) return `<div class="wg-astro"><small>${esc(A.mySign)} · 今日运势</small><p>点我去揭晓今天的运势 ✨</p></div>`;
        const st = (n) => "★★★★★".slice(0, Math.round(n)) + "☆☆☆☆☆".slice(0, 5 - Math.round(n));
        return `<div class="wg-astro"><small>${esc(A.mySign)} · 今日运势 <b>${st(f.overall)}</b></small><p>${esc(f.tip || f.summary || "")}</p><span>幸运色 ${esc(f.lucky_color || "-")} · 幸运数字 ${esc(f.lucky_number || "-")}</span></div>`;
      }
    }
    return "";
  }

  async function widgetHtml(w, editing) {
    const bg = (w.type === "music" || w.type === "couple") && w.data && w.data.bg ? String(w.data.bg) : "";
    return `<div class="wg wg-${w.size} wg-t-${w.type}${bg ? " wg-has-bg" : ""}" data-wid="${w.id}"${bg ? ` style="--wg-bg:url('${esc(bg)}')"` : ""}>${await widgetInner(w)}${editing ? `<button type="button" class="wg-del" data-del="${w.id}">✕</button>` : ""}</div>`;
  }

  /* ───── 桌面：位置交给 fun-desk.js，这里只负责画内容 ───── */
  const htmlCache = {};
  let paintSeq = 0;
  function fillHost(host, html) {
    if (host.__wgHtml === html) return;
    host.__wgHtml = html;
    host.innerHTML = html;
  }
  async function paint() {
    const hosts = [...document.querySelectorAll(".desk-wg-host[data-wid]:not(.desk-ghost)")];
    // 先用上次的样子填上，不闪
    hosts.forEach((h) => htmlCache[h.dataset.wid] && fillHost(h, htmlCache[h.dataset.wid]));
    const seq = ++paintSeq;
    for (const w of widgets) {
      try {
        htmlCache[w.id] = await widgetHtml(w, false);
      } catch (_) {
        /* ignore */
      }
    }
    if (seq !== paintSeq) return;
    document.querySelectorAll(".desk-wg-host[data-wid]:not(.desk-ghost)").forEach((h) => htmlCache[h.dataset.wid] && fillHost(h, htmlCache[h.dataset.wid]));
  }
  let deskClickBound = false;
  async function renderDesk() {
    const D = window.XXJ_DESK;
    if (D && typeof D.setWidgets === "function") {
      if (!deskClickBound) {
        deskClickBound = true;
        document.addEventListener("click", (e) => {
          if (!e.target.closest(".desk-wg-host")) return;
          if (D.isEditing && D.isEditing()) return;
          onDeskClick(e);
        });
      }
      D.setWidgets(widgets.map((w) => ({ id: w.id, size: w.size })));
      await paint();
      return;
    }
    if (!area) {
      area = document.getElementById("desk-widgets-slot");
      if (!area) {
        const page = document.querySelector(".desk-apps");
        if (!page) return;
        area = document.createElement("div");
        area.className = "wg-area";
        page.insertBefore(area, page.firstChild);
      }
      area.addEventListener("click", onDeskClick);
    }
    if (!widgets.length) {
      area.innerHTML = `<button type="button" class="wg-add-tile" data-edit>＋ 添加小组件<small>照片、音乐、便签、倒数日…</small></button>`;
      return;
    }
    const html = (await Promise.all(widgets.map((w) => widgetHtml(w, false)))).join("");
    area.innerHTML = `<div class="wg-head"><span class="desk-apps-k">小组件</span><button type="button" class="wg-edit" data-edit>编辑</button></div><div class="wg-grid">${html}</div>`;
  }

  function onDeskClick(e) {
    if (e.target.closest("[data-edit]")) return openManager(false);
    const mu = e.target.closest("[data-mu]")?.dataset.mu;
    if (mu) {
      const M = window.XXJ_MUSIC;
      if (!M) return;
      void M.ready().then(() => M[mu]());
      return;
    }
    const wEl = e.target.closest(".wg");
    if (!wEl) return;
    const w = widgets.find((x) => x.id === wEl.dataset.wid);
    if (!w) return;
    const open = window.openFunApp;
    if (w.type === "music") open?.("音乐");
    if (w.type === "couple") open?.("情侣小屋");
    if (w.type === "astro") open?.("星座");
    if (w.type === "countdown" || w.type === "note" || w.type === "photo" || w.type === "char") {
      openManager(false);
      setTimeout(() => openEditor(w, false), 260);
    }
  }

  /* ───── 管理页 ───── */
  let mroot = null;
  let fromWardrobe = false;

  async function renderManager() {
    if (!mroot) return;
    const rows = await Promise.all(
      widgets.map(
        async (w, i) => `<div class="wgm-row">
          <div class="wgm-prev">${await widgetHtml(w, false)}</div>
          <div class="wgm-info"><strong>${TYPES[w.type].icon} ${TYPES[w.type].name}</strong>
            <div class="wgm-sizes">${TYPES[w.type].sizes.map((s) => `<button type="button" class="${w.size === s ? "is-on" : ""}" data-size="${w.id}:${s}">${SIZE_NAME[s]}</button>`).join("")}</div>
            <div class="wgm-ops"><button type="button" data-up="${i}" ${i ? "" : "disabled"}>↑</button><button type="button" data-down="${i}" ${i < widgets.length - 1 ? "" : "disabled"}>↓</button>${["photo", "note", "countdown", "char", "couple", "music"].includes(w.type) ? `<button type="button" data-cfg="${w.id}">设置</button>` : ""}<button type="button" class="is-del" data-rm="${w.id}">删除</button></div>
          </div></div>`
      )
    );
    mroot.innerHTML = `<div class="wgm">
      <p class="fun-note">小组件显示在桌面<b>第二页</b>的最上面（桌面左右滑动翻页）。可以调大小、排顺序。</p>
      <p class="fun-kicker">添加</p>
      <div class="wgm-types">${Object.entries(TYPES).map(([k, t]) => `<button type="button" data-add="${k}"><span>${t.icon}</span><strong>${t.name}</strong><small>${t.desc}</small></button>`).join("")}</div>
      <p class="fun-kicker">已添加 · ${widgets.length}</p>
      ${rows.join("") || `<p class="fun-note">还没有小组件</p>`}
    </div>`;
  }

  async function onManagerClick(e) {
    const b = e.target.closest("button");
    if (!b) return;
    const d = b.dataset;
    if (d.add) {
      const t = TYPES[d.add];
      const w = { id: uid(), type: d.add, size: t.sizes.includes("m") ? "m" : t.sizes[0], data: {} };
      if (["photo", "note", "countdown", "char"].includes(d.add)) return openEditor(w, true);
      widgets.push(w);
      save();
      toast(`已添加「${t.name}」`);
      return renderManager();
    }
    if (d.size) {
      const [id, s] = d.size.split(":");
      const w = widgets.find((x) => x.id === id);
      if (w) w.size = s;
    }
    if (d.up) {
      const i = Number(d.up);
      [widgets[i - 1], widgets[i]] = [widgets[i], widgets[i - 1]];
    }
    if (d.down) {
      const i = Number(d.down);
      [widgets[i + 1], widgets[i]] = [widgets[i], widgets[i + 1]];
    }
    if (d.rm) widgets = widgets.filter((x) => x.id !== d.rm);
    if (d.cfg) return openEditor(widgets.find((x) => x.id === d.cfg), false);
    if (d.size || d.up || d.down || d.rm) {
      save();
      renderManager();
    }
  }

  /** 设置单个小组件（照片 / 便签 / 倒数日 / 角色 / 情侣） */
  function openEditor(w, isNew) {
    const d = w.data || (w.data = {});
    const t = TYPES[w.type];
    let body = "";
    if (w.type === "photo")
      body = `<div class="wge-photo">${d.img ? `<img src="${esc(d.img)}" alt="" />` : `<span>还没选图</span>`}</div><button type="button" class="fun-btn ghost sm" data-pick>选择图片</button><input type="file" accept="image/*" hidden />
        <label class="fun-field"><span>配一句话（选填）</span><input id="wge-cap" maxlength="20" value="${esc(d.cap || "")}" /></label>`;
    if (w.type === "note")
      body = `<label class="fun-field"><span>便签内容</span><textarea id="wge-text" rows="4" maxlength="120">${esc(d.text || "")}</textarea></label>
        <div class="wge-colors">${Object.entries(NOTE_COLORS).map(([k, c]) => `<button type="button" data-color="${k}" class="${(d.color || "yellow") === k ? "is-on" : ""}" style="background:${c}"></button>`).join("")}</div>`;
    if (w.type === "countdown")
      body = `<label class="fun-field"><span>名称</span><input id="wge-name" maxlength="12" value="${esc(d.name || "")}" placeholder="比如：生日 / 考试 / 见面" /></label>
        <label class="fun-field"><span>日期</span><input id="wge-date" type="date" value="${esc(d.date || "")}" /></label>
        <label class="fun-switch"><input type="checkbox" id="wge-yearly" ${d.yearly ? "checked" : ""}/><span>每年重复（生日、纪念日）</span></label>`;
    if (w.type === "char" || w.type === "couple")
      body = `<p class="fun-kicker">选择角色</p><div class="mm-to">${cast.map((c) => `<button type="button" class="pt-person${d.charId === c.id ? " is-on" : ""}" data-char="${esc(c.id)}">${avHtml(c, "fun-av")}<strong>${esc(c.name)}</strong></button>`).join("") || `<p class="fun-note">角色库里还没有角色</p>`}</div>
        ${w.type === "char" ? `<label class="fun-field"><span>想显示的一句话（选填，不填就用人设第一句）</span><input id="wge-line" maxlength="40" value="${esc(d.line || "")}" /></label>` : `<p class="fun-note">不选就显示情侣小屋里当前的恋人。</p>`}`;
    if (w.type === "music" || w.type === "couple")
      body += `<p class="fun-kicker">背景图（选填）</p><div class="wge-photo wge-bg">${d.bg ? `<img src="${esc(d.bg)}" alt="" />` : `<span>默认背景</span>`}</div>
        <div class="ww-row"><button type="button" class="fun-btn ghost sm" data-pickbg>选择背景图</button><button type="button" class="fun-btn ghost sm" data-clearbg>恢复默认</button></div><input type="file" accept="image/*" hidden data-bgfile />
        <p class="fun-note">图片会自动加一层暗色，保证上面的字看得清。</p>`;
    const sh = F.openSheet(`${body}<div class="fun-sheet-actions"><button type="button" class="fun-btn solid" data-ok>${isNew ? "添加到桌面" : "保存"}</button></div>`, { title: `${t.icon} ${t.name}` });
    const fi = sh.body.querySelector("input[type=file]:not([data-bgfile])");
    const bgfi = sh.body.querySelector("input[data-bgfile]");
    if (bgfi)
      bgfi.onchange = async () => {
        const f = bgfi.files?.[0];
        if (!f) return;
        d.bg = await compress(f, 1000);
        sh.body.querySelector(".wge-bg").innerHTML = `<img src="${esc(d.bg)}" alt="" />`;
      };
    if (fi)
      fi.onchange = async () => {
        const f = fi.files?.[0];
        if (!f) return;
        d.img = await compress(f, 900);
        sh.body.querySelector(".wge-photo").innerHTML = `<img src="${esc(d.img)}" alt="" />`;
      };
    sh.body.addEventListener("click", (e) => {
      if (e.target.closest("[data-pick]")) fi?.click();
      if (e.target.closest("[data-pickbg]")) bgfi?.click();
      if (e.target.closest("[data-clearbg]")) {
        delete d.bg;
        sh.body.querySelector(".wge-bg").innerHTML = `<span>默认背景</span>`;
      }
      const col = e.target.closest("[data-color]");
      if (col) {
        d.color = col.dataset.color;
        sh.body.querySelectorAll("[data-color]").forEach((x) => x.classList.toggle("is-on", x === col));
      }
      const ch = e.target.closest("[data-char]");
      if (ch) {
        d.charId = ch.dataset.char;
        sh.body.querySelectorAll("[data-char]").forEach((x) => x.classList.toggle("is-on", x === ch));
      }
      if (!e.target.closest("[data-ok]")) return;
      if (w.type === "photo") {
        if (!d.img) return toast("先选一张图");
        d.cap = sh.body.querySelector("#wge-cap").value.trim();
      }
      if (w.type === "note") d.text = sh.body.querySelector("#wge-text").value;
      if (w.type === "countdown") {
        d.name = sh.body.querySelector("#wge-name").value.trim();
        d.date = sh.body.querySelector("#wge-date").value;
        d.yearly = sh.body.querySelector("#wge-yearly").checked;
        if (!d.date) return toast("选一个日期");
      }
      if (w.type === "char") {
        if (!d.charId) return toast("选一个角色");
        d.line = sh.body.querySelector("#wge-line").value.trim();
      }
      if (isNew) widgets.push(w);
      save();
      sh.close();
      renderManager();
      if (isNew) toast(`已添加「${t.name}」到桌面第二页`);
    });
  }

  function openManager(wardrobe) {
    fromWardrobe = !!wardrobe;
    window.openFunApp?.("小组件");
  }

  F.register("小组件", {
    title: "桌面小组件",
    kicker: "WIDGETS",
    get back() {
      return fromWardrobe && typeof window.openWardrobeScreen === "function" ? () => window.openWardrobeScreen() : null;
    },
    async mount(body) {
      mroot = document.createElement("div");
      mroot.className = "wgm-root";
      body.appendChild(mroot);
      mroot.addEventListener("click", onManagerClick);
      cast = await F.loadCast();
      renderManager();
    },
    unmount() {
      mroot = null;
    }
  });

  /* ───── 装扮页入口 ───── */
  function injectWardrobeEntry() {
    const mast = document.querySelector("#wardrobe-screen .wardrobe-masthead");
    if (!mast || document.getElementById("ward-widgets-entry")) return;
    const sec = document.createElement("section");
    sec.className = "settings-section wardrobe-section";
    sec.id = "ward-widgets-entry";
    sec.innerHTML = `<div class="settings-panel wardrobe-panel wg-ward">
      <div><p class="widget-label"><i class="ph ph-squares-four" aria-hidden="true"></i> 桌面小组件</p>
      <p class="settings-ai-blurb wardrobe-panel-lead">照片、音乐、便签、倒数日、时钟、情侣天数、角色、今日运势，放在桌面第二页。</p></div>
      <button type="button" class="chip solid" id="ward-widgets-open">管理小组件</button></div>
      <div class="settings-panel wardrobe-panel wg-ward">
      <div><p class="widget-label"><i class="ph ph-eye-slash" aria-hidden="true"></i> 隐藏顶部状态栏</p>
      <p class="settings-ai-blurb wardrobe-panel-lead">桌面最上面那行时间、5G、电量。添加到手机主屏后，手机自己的状态栏已经有这些了。</p></div>
      <label class="wg-switch"><input type="checkbox" id="ward-hide-status" /><span></span></label></div>`;
    mast.after(sec);
    sec.querySelector("#ward-widgets-open").addEventListener("click", () => openManager(true));
    const sw = sec.querySelector("#ward-hide-status");
    sw.checked = document.documentElement.classList.contains("mx-hide-status");
    sw.addEventListener("change", () => {
      document.documentElement.classList.toggle("mx-hide-status", sw.checked);
      try {
        localStorage.setItem("meowos_hide_status", sw.checked ? "1" : "0");
      } catch (_) {
        /* ignore */
      }
    });
  }

  /* ───── 启动 ───── */
  async function boot() {
    cast = await F.loadCast();
    await load();
    injectWardrobeEntry();
    await renderDesk();
    window.XXJ_MUSIC?.subscribe(() => {
      if (widgets.some((w) => w.type === "music")) void renderDesk();
    });
    clearInterval(clockTimer);
    clockTimer = setInterval(() => {
      if (document.documentElement.classList.contains("mx-fun-open")) return;
      if (widgets.some((w) => w.type === "clock" || w.type === "music")) void renderDesk();
    }, 20000);
    // 角色库可能稍后才加载完
    setTimeout(async () => {
      cast = await F.loadCast();
      void renderDesk();
    }, 4000);
  }
  window.XXJ_WIDGETS = { paint: () => void paint() };
  void boot();
})();
