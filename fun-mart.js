"use strict";

/**
 * Meow Mart：喵淘（网购）+ 喵喵外卖
 * - 商品和店铺由 AI 生成；用「我的 → 钱包」余额付款，自动记账单
 * - 可以买给自己，也可以送给角色；订单会按时间推进物流/配送状态
 * - 送达后，收到礼物/外卖的角色会给你回应
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast, rnd, pick, uid, avHtml } = F;

  const KV = "mart_v1";
  const CATS = ["猜你喜欢", "女装", "男装", "美妆", "数码", "零食", "家居", "礼物", "宠物"];
  const MALL_STEPS = [
    [0, "已付款", "商家正在打包"],
    [2, "已发货", "包裹已交给快递"],
    [5, "运输中", "包裹正在路上"],
    [9, "派送中", "快递员正在派送"],
    [13, "已签收", "包裹已签收"]
  ];
  const FOOD_STEPS = [
    [0, "商家已接单", "后厨正在制作"],
    [1.5, "骑手已取餐", "骑手正赶往目的地"],
    [3.5, "配送中", "骑手离你不远了"],
    [6, "已送达", "外卖已送达，祝用餐愉快"]
  ];

  let S = null;
  let root = null;
  let tab = "mall";
  let cat = "猜你喜欢";
  let query = "";
  let cast = [];
  let user = null;
  let busy = false;
  let timer = 0;

  async function load() {
    try {
      S = (await F.FunDB.get(KV)) || null;
    } catch (_) {
      S = null;
    }
    if (!S) S = { goods: {}, cart: [], orders: [], shops: [], address: "" };
  }
  function save() {
    const keys = Object.keys(S.goods);
    if (keys.length > 20) keys.slice(0, keys.length - 20).forEach((k) => delete S.goods[k]);
    if (S.orders.length > 60) S.orders = S.orders.slice(0, 60);
    F.FunDB.set(KV, S).catch(() => toast("保存失败"));
  }
  const yuan = (c) => (Math.round(c) / 100).toFixed(2);

  /* ───── 钱包（复用「我的」钱包） ───── */
  function walletCents() {
    try {
      if (typeof ensureMyMaskBucket !== "function") return null;
      const { bucket } = ensureMyMaskBucket(getActiveMaskIdForInbox());
      return Number(bucket.walletCents) || 0;
    } catch (_) {
      return null;
    }
  }
  function pay(cents, note) {
    const bal = walletCents();
    if (bal == null) return true; // 没有钱包模块时不扣款
    if (bal < cents) return false;
    adjustWalletCentsBy(-cents);
    try {
      pushWalletBill({ type: "购物", note: note.slice(0, 60), deltaCents: -cents, balanceCentsAfter: walletCents() });
    } catch (_) {
      /* ignore */
    }
    return true;
  }

  /* ───── AI ───── */
  async function genGoods(q) {
    const txt = await F.aiText(
      [
        { role: "system", content: "你在模拟一个网购平台的商品列表。商品要真实可信：标题像真的淘宝标题（带卖点关键词），价格合理（人民币），店铺名有生活感。虚构品牌，不要使用真实品牌名。只输出 JSON。" },
        { role: "user", content: `${q.startsWith("cat:") ? `分类：${q.slice(4)}` : `搜索：${q}`}\n生成 8 个商品。格式：[{"name":"商品标题，20~30字","price":价格元,"orig":原价元,"shop":"店铺名","sales":"已售数量，如 1万+","emoji":"一个 emoji","desc":"商品介绍 40~80 字","specs":["规格1","规格2","规格3"],"rating":4.0~5.0,"reviews":[{"name":"买家昵称","text":"评价"}]}]，每个 2 条评价。` }
      ],
      { maxTokens: 3500, temperature: 0.9 }
    );
    const arr = F.parseJsonLoose(txt);
    if (!Array.isArray(arr) || !arr.length) throw new Error("格式不对，再试一次");
    return arr
      .filter((x) => x && x.name && x.price)
      .map((x) => ({
        id: uid(),
        name: String(x.name).slice(0, 60),
        price: Math.max(1, Math.round(Number(x.price) * 100) || 990),
        orig: Math.round(Number(x.orig) * 100) || 0,
        shop: String(x.shop || "喵喵小店").slice(0, 20),
        sales: String(x.sales || rnd(5000) + "+").slice(0, 10),
        emoji: String(x.emoji || "🛍").slice(0, 4),
        desc: String(x.desc || "").slice(0, 200),
        specs: (Array.isArray(x.specs) ? x.specs : []).map((s) => String(s).slice(0, 16)).slice(0, 6),
        rating: Math.min(5, Math.max(3, Number(x.rating) || 4.8)),
        reviews: (Array.isArray(x.reviews) ? x.reviews : []).filter((r) => r && r.text).slice(0, 3).map((r) => ({ name: String(r.name || "买家").slice(0, 16), text: String(r.text).slice(0, 100) }))
      }));
  }

  async function genShops() {
    const txt = await F.aiText(
      [
        { role: "system", content: "你在模拟外卖平台的附近商家列表。店名要有生活感，菜品和价格（人民币）合理。虚构店名，不要真实连锁品牌。只输出 JSON。" },
        { role: "user", content: `生成 8 家风格各异的店（中餐、奶茶、甜品、快餐、夜宵、轻食、日料、烧烤等），每家 5~7 道菜。\n格式：[{"name":"店名","emoji":"","tags":["",""],"rating":4.0~5.0,"sales":"月售","eta":配送分钟,"fee":配送费元,"min":起送价元,"menu":[{"name":"","price":元,"emoji":"","desc":"一句话"}]}]` }
      ],
      { maxTokens: 4000, temperature: 0.9 }
    );
    const arr = F.parseJsonLoose(txt);
    if (!Array.isArray(arr) || !arr.length) throw new Error("格式不对，再试一次");
    return arr
      .filter((x) => x && x.name && Array.isArray(x.menu))
      .map((x) => ({
        id: uid(),
        name: String(x.name).slice(0, 20),
        emoji: String(x.emoji || "🍱").slice(0, 4),
        tags: (x.tags || []).map((t) => String(t).slice(0, 8)).slice(0, 3),
        rating: Math.min(5, Math.max(3, Number(x.rating) || 4.7)),
        sales: String(x.sales || "月售" + rnd(3000)).slice(0, 12),
        eta: Math.max(15, parseInt(x.eta, 10) || 30),
        fee: Math.round((Number(x.fee) || 3) * 100),
        min: Math.round((Number(x.min) || 20) * 100),
        menu: x.menu.filter((m) => m && m.name).map((m) => ({ id: uid(), name: String(m.name).slice(0, 20), price: Math.max(1, Math.round(Number(m.price) * 100) || 1500), emoji: String(m.emoji || "🍽").slice(0, 4), desc: String(m.desc || "").slice(0, 40) }))
      }));
  }

  async function reactTo(o) {
    const c = cast.find((x) => x.id === o.to);
    if (!c || o.reaction || !F.hasApiKey()) return;
    const what = o.items.map((i) => `${i.name}${i.spec ? "（" + i.spec + "）" : ""}×${i.qty}`).join("、");
    try {
      const txt = await F.aiText(
        [
          { role: "system", content: `你是「${c.name}」。${c.persona ? "人设：\n" + c.persona + "\n" : ""}${F.recordSummary(c.name)}\n用你的口吻自然回应，1~3 句，只输出你说的话。` },
          { role: "user", content: `${user.name}${o.kind === "food" ? "给你点了外卖" : "给你买了礼物"}：${what}（共 ¥${yuan(o.total)}）${o.note ? `，留言：「${o.note}」` : ""}。${o.kind === "food" ? "外卖刚送到。" : "包裹刚签收，你拆开了。"}` }
        ],
        { maxTokens: 500 }
      );
      o.reaction = F.cleanLine(txt, 300, c.name);
      save();
      if (tab === "orders") render();
      toast(`${c.name} 收到了！`);
    } catch (_) {
      /* ignore */
    }
  }

  /* ───── 订单状态 ───── */
  function stepOf(o) {
    const steps = o.kind === "food" ? FOOD_STEPS : MALL_STEPS;
    const mins = (Date.now() - o.at) / 60000;
    let i = 0;
    for (let k = 0; k < steps.length; k++) if (mins >= steps[k][0]) i = k;
    return { i, steps, done: i === steps.length - 1 };
  }
  function tick() {
    if (!S) return;
    for (const o of S.orders) {
      const { done } = stepOf(o);
      if (done && !o.doneAt) {
        o.doneAt = Date.now();
        save();
        if (o.to !== "me") void reactTo(o);
        else toast(o.kind === "food" ? "🛵 你的外卖到了" : "📦 你的包裹已签收");
      }
    }
    if (tab === "orders" && root) render();
  }

  /* ───── 渲染 ───── */
  function render() {
    if (!root) return;
    const bal = walletCents();
    const cartN = S.cart.reduce((s, x) => s + x.qty, 0);
    root.innerHTML = `<div class="mm">
      <div class="mm-tabs">${[["mall", "🛍 喵淘"], ["food", "🛵 外卖"], ["cart", `🛒 购物车${cartN ? `(${cartN})` : ""}`], ["orders", "📦 订单"]].map(([k, n]) => `<button type="button" data-tab="${k}" class="${tab === k ? "is-on" : ""}">${n}</button>`).join("")}</div>
      <div class="mm-wallet">钱包余额 <b>${bal == null ? "—" : "¥" + yuan(bal)}</b><small>（「我的 → 钱包」里充值）</small></div>
      <div class="mm-panel" id="mm-panel"></div></div>`;
    const p = root.querySelector("#mm-panel");
    ({ mall: renderMall, food: renderFood, cart: renderCart, orders: renderOrders })[tab](p);
  }

  function renderMall(p) {
    const key = query ? query : "cat:" + cat;
    const list = S.goods[key] || [];
    p.innerHTML = `<div class="mm-search"><input type="search" placeholder="搜索宝贝" value="${esc(query)}" /><button type="button" class="fun-btn solid sm" data-a="search">搜索</button></div>
      ${query ? `<p class="sp-qhead">「${esc(query)}」<button type="button" class="sh-link" data-a="clearq">返回分类</button></p>` : `<div class="sp-chan">${CATS.map((c) => `<button type="button" data-cat="${c}" class="${c === cat ? "is-on" : ""}">${c}</button>`).join("")}</div>`}
      ${list.length ? `<div class="mm-goods">${list.map((g) => `<button type="button" class="mm-good" data-g="${g.id}"><span class="mm-gimg">${esc(g.emoji)}</span><strong>${esc(g.name)}</strong><span class="mm-price">¥<b>${yuan(g.price)}</b>${g.orig > g.price ? `<s>¥${yuan(g.orig)}</s>` : ""}</span><small>${esc(g.sales)}人付款 · ${esc(g.shop)}</small></button>`).join("")}</div>` : ""}
      <div class="sp-more"><button type="button" class="fun-btn solid" data-a="loadgoods" ${busy ? "disabled" : ""}>${busy ? "加载中…" : list.length ? "换一批" : "看看有什么"}</button></div>`;
    const inp = p.querySelector("input");
    inp.addEventListener("keydown", (e) => e.key === "Enter" && !e.isComposing && p.querySelector('[data-a="search"]').click());
  }

  function renderFood(p) {
    p.innerHTML = `<div class="mm-addr">📍 送至：<b>${esc(S.address || "未设置地址")}</b> <button type="button" class="sh-link" data-a="addr">修改</button></div>
      ${S.shops.length ? `<div class="mm-shops">${S.shops.map((s) => `<button type="button" class="mm-shop" data-s="${s.id}"><span class="mm-semoji">${esc(s.emoji)}</span><span><strong>${esc(s.name)}</strong><small>⭐${s.rating.toFixed(1)} · ${esc(s.sales)} · ${s.eta}分钟</small><small>起送 ¥${yuan(s.min)} · 配送 ¥${yuan(s.fee)}</small><span class="mm-stags">${s.tags.map((t) => `<em>${esc(t)}</em>`).join("")}</span></span></button>`).join("")}</div>` : `<div class="sh-empty"><div class="sh-empty-ico">🛵</div><p>看看附近有什么好吃的</p></div>`}
      <div class="sp-more"><button type="button" class="fun-btn solid" data-a="loadshops" ${busy ? "disabled" : ""}>${busy ? "加载中…" : S.shops.length ? "换一批商家" : "附近商家"}</button></div>`;
  }

  function renderCart(p) {
    if (!S.cart.length) {
      p.innerHTML = `<div class="sh-empty"><div class="sh-empty-ico">🛒</div><p>购物车是空的</p></div>`;
      return;
    }
    const total = S.cart.filter((x) => x.on !== false).reduce((s, x) => s + x.price * x.qty, 0);
    p.innerHTML = `<div class="mm-cart">${S.cart
      .map(
        (x, i) => `<div class="mm-ci"><input type="checkbox" data-ck="${i}" ${x.on !== false ? "checked" : ""}/><span class="mm-gimg sm">${esc(x.emoji)}</span><span class="mm-cinfo"><strong>${esc(x.name)}</strong><small>${esc(x.spec || "")}</small><b>¥${yuan(x.price)}</b></span>
        <span class="mm-qty"><button type="button" data-q="${i}:-1">−</button>${x.qty}<button type="button" data-q="${i}:1">＋</button></span></div>`
      )
      .join("")}</div>
      <div class="mm-checkout"><span>合计 <b>¥${yuan(total)}</b></span><button type="button" class="fun-btn solid" data-a="checkout" ${total ? "" : "disabled"}>结算</button></div>`;
  }

  function renderOrders(p) {
    if (!S.orders.length) {
      p.innerHTML = `<div class="sh-empty"><div class="sh-empty-ico">📦</div><p>还没有订单</p></div>`;
      return;
    }
    p.innerHTML = S.orders
      .map((o) => {
        const { i, steps, done } = stepOf(o);
        const to = o.to === "me" ? null : cast.find((c) => c.id === o.to);
        return `<div class="mm-order"><div class="mm-oh"><span>${o.kind === "food" ? "🛵 " + esc(o.shop) : "🛍 喵淘"}</span><em class="${done ? "is-done" : ""}">${steps[i][1]}</em></div>
          <p class="mm-oitems">${o.items.map((it) => `${esc(it.emoji)} ${esc(it.name)}${it.spec ? `（${esc(it.spec)}）` : ""} ×${it.qty}`).join("<br/>")}</p>
          <div class="mm-steps">${steps.map((s, k) => `<span class="${k <= i ? "is-on" : ""}"><i></i>${s[1]}</span>`).join("")}</div>
          <small class="mm-ometa">${steps[i][2]} · 实付 ¥${yuan(o.total)} · ${to ? `送给 ${esc(to.name)}` : "给自己"} · ${new Date(o.at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small>
          ${o.reaction ? `<div class="mm-react">${avHtml(to, "fun-av sm")}<span><b>${esc(to.name)}：</b>${esc(o.reaction)}</span></div>` : to && done ? `<p class="fun-note">${esc(to.name)} 收到了…</p>` : ""}</div>`;
      })
      .join("");
  }

  /* ───── 商品详情 / 下单 ───── */
  function openGood(g) {
    let spec = g.specs[0] || "";
    let qty = 1;
    const sh = F.openSheet(
      `<div class="mm-detail"><div class="mm-dimg">${esc(g.emoji)}</div>
        <p class="mm-price big">¥<b>${yuan(g.price)}</b>${g.orig > g.price ? `<s>¥${yuan(g.orig)}</s>` : ""}<small>${esc(g.sales)}人付款</small></p>
        <h3>${esc(g.name)}</h3><p class="fun-note">${esc(g.desc)}</p>
        ${g.specs.length ? `<p class="fun-kicker">规格</p><div class="mm-specs">${g.specs.map((s) => `<button type="button" data-spec="${esc(s)}" class="${s === spec ? "is-on" : ""}">${esc(s)}</button>`).join("")}</div>` : ""}
        <p class="fun-kicker">🏪 ${esc(g.shop)} · ⭐${g.rating.toFixed(1)}</p>
        ${g.reviews.map((r) => `<p class="mm-rev"><b>${esc(r.name)}：</b>${esc(r.text)}</p>`).join("")}
      </div>
      <div class="mm-dbar"><span class="mm-qty"><button type="button" data-dq="-1">−</button><b id="mm-q">1</b><button type="button" data-dq="1">＋</button></span>
        <button type="button" class="fun-btn ghost sm" data-a="cart">加入购物车</button><button type="button" class="fun-btn solid sm" data-a="buy">立即购买</button></div>`,
      { title: "" }
    );
    sh.el.classList.add("fun-sheet--tall");
    sh.body.addEventListener("click", (e) => {
      const sp = e.target.closest("[data-spec]");
      if (sp) {
        spec = sp.dataset.spec;
        sh.body.querySelectorAll("[data-spec]").forEach((b) => b.classList.toggle("is-on", b === sp));
      }
      const dq = e.target.closest("[data-dq]");
      if (dq) {
        qty = Math.max(1, Math.min(99, qty + Number(dq.dataset.dq)));
        sh.body.querySelector("#mm-q").textContent = qty;
      }
      const a = e.target.closest("[data-a]")?.dataset.a;
      const item = { gid: g.id, name: g.name, emoji: g.emoji, price: g.price, spec, qty };
      if (a === "cart") {
        const ex = S.cart.find((x) => x.gid === g.id && x.spec === spec);
        if (ex) ex.qty += qty;
        else S.cart.push(item);
        save();
        toast("已加入购物车");
        sh.close();
        render();
      }
      if (a === "buy") {
        sh.close();
        checkout("mall", [item]);
      }
    });
  }

  function openShop(s) {
    const cnt = {};
    const sh = F.openSheet(
      `<div class="mm-shophead"><span class="mm-semoji">${esc(s.emoji)}</span><div><strong>${esc(s.name)}</strong><small>⭐${s.rating.toFixed(1)} · 约${s.eta}分钟 · 配送 ¥${yuan(s.fee)}</small></div></div>
       <div class="mm-menu">${s.menu.map((m) => `<div class="mm-dish"><span class="mm-gimg sm">${esc(m.emoji)}</span><span class="mm-cinfo"><strong>${esc(m.name)}</strong><small>${esc(m.desc)}</small><b>¥${yuan(m.price)}</b></span><span class="mm-qty"><button type="button" data-m="${m.id}:-1">−</button><b data-mc="${m.id}">0</b><button type="button" data-m="${m.id}:1">＋</button></span></div>`).join("")}</div>
       <div class="mm-checkout"><span>¥<b id="mm-ft">0.00</b> <small id="mm-fmin">起送 ¥${yuan(s.min)}</small></span><button type="button" class="fun-btn solid" data-a="go" disabled>去结算</button></div>`,
      { title: "" }
    );
    sh.el.classList.add("fun-sheet--tall");
    sh.body.addEventListener("click", (e) => {
      const m = e.target.closest("[data-m]");
      if (m) {
        const [id, d] = m.dataset.m.split(":");
        cnt[id] = Math.max(0, (cnt[id] || 0) + Number(d));
        sh.body.querySelector(`[data-mc="${id}"]`).textContent = cnt[id];
        const sum = s.menu.reduce((t, x) => t + x.price * (cnt[x.id] || 0), 0);
        sh.body.querySelector("#mm-ft").textContent = yuan(sum);
        sh.body.querySelector("#mm-fmin").textContent = sum >= s.min ? `+配送 ¥${yuan(s.fee)}` : `还差 ¥${yuan(s.min - sum)} 起送`;
        sh.body.querySelector('[data-a="go"]').disabled = sum < s.min;
      }
      if (e.target.closest('[data-a="go"]')) {
        const items = s.menu.filter((x) => cnt[x.id]).map((x) => ({ name: x.name, emoji: x.emoji, price: x.price, qty: cnt[x.id] }));
        sh.close();
        checkout("food", items, s);
      }
    });
  }

  function checkout(kind, items, shop) {
    const sub = items.reduce((t, x) => t + x.price * x.qty, 0);
    const fee = kind === "food" ? shop.fee : 0;
    const total = sub + fee;
    const sh = F.openSheet(
      `<p class="fun-kicker">送给谁</p>
       <div class="mm-to"><button type="button" class="pt-person is-on" data-to="me">${avHtml(user, "fun-av")}<strong>自己</strong></button>${cast.map((c) => `<button type="button" class="pt-person" data-to="${esc(c.id)}">${avHtml(c, "fun-av")}<strong>${esc(c.name)}</strong></button>`).join("")}</div>
       <label class="fun-field"><span>留言（选填，送人时 TA 能看到）</span><input id="mm-note" maxlength="50" placeholder="${kind === "food" ? "多吃点，别饿着" : "生日快乐～"}" /></label>
       <div class="mm-sum"><p>商品 <span>¥${yuan(sub)}</span></p>${fee ? `<p>配送费 <span>¥${yuan(fee)}</span></p>` : ""}<p class="mm-total">实付 <span>¥${yuan(total)}</span></p></div>
       <div class="fun-sheet-actions"><button type="button" class="fun-btn solid" data-a="pay">确认支付 ¥${yuan(total)}</button></div>`,
      { title: kind === "food" ? "提交外卖订单" : "确认订单" }
    );
    let to = "me";
    sh.body.addEventListener("click", (e) => {
      const t = e.target.closest("[data-to]");
      if (t) {
        to = t.dataset.to;
        sh.body.querySelectorAll("[data-to]").forEach((b) => b.classList.toggle("is-on", b === t));
      }
      if (!e.target.closest('[data-a="pay"]')) return;
      const toName = to === "me" ? "自己" : cast.find((c) => c.id === to)?.name || "TA";
      if (!pay(total, `${kind === "food" ? "外卖·" + shop.name : "喵淘"}：${items[0].name}${items.length > 1 ? "等" : ""}（给${toName}）`)) {
        toast(`余额不足，还差 ¥${yuan(total - walletCents())}，去「我的 → 钱包」充值吧`);
        return;
      }
      S.orders.unshift({ id: uid(), kind, shop: shop?.name || "", items, total, to, note: sh.body.querySelector("#mm-note").value.trim(), at: Date.now() });
      if (kind === "mall") S.cart = S.cart.filter((x) => !items.includes(x));
      save();
      sh.close();
      toast("支付成功");
      tab = "orders";
      render();
    });
  }

  /* ───── 事件 ───── */
  async function onClick(e) {
    const t = e.target.closest("[data-tab]");
    if (t) {
      tab = t.dataset.tab;
      return render();
    }
    const c = e.target.closest("[data-cat]");
    if (c) {
      cat = c.dataset.cat;
      return render();
    }
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "search") {
      query = root.querySelector(".mm-search input").value.trim();
      render();
      if (query && !S.goods[query]) return void loadGoods();
      return;
    }
    if (a === "clearq") {
      query = "";
      return render();
    }
    if (a === "loadgoods") return void loadGoods();
    if (a === "loadshops") {
      if (!F.hasApiKey()) return toast("请先在设置里填写 API Key");
      busy = true;
      render();
      try {
        S.shops = await genShops();
        save();
      } catch (err) {
        toast("加载失败：" + err.message);
      }
      busy = false;
      return render();
    }
    if (a === "addr") {
      const sh = F.openSheet(`<input class="wb-ta" maxlength="40" value="${esc(S.address)}" placeholder="比如：江城大学 3 号宿舍楼" /><div class="fun-sheet-actions"><button type="button" class="fun-btn solid">保存</button></div>`, { title: "收货地址" });
      sh.body.querySelector("button").onclick = () => {
        S.address = sh.body.querySelector("input").value.trim();
        save();
        sh.close();
        render();
      };
      return;
    }
    if (a === "checkout") return checkout("mall", S.cart.filter((x) => x.on !== false));
    const ck = e.target.closest("[data-ck]");
    if (ck) {
      S.cart[Number(ck.dataset.ck)].on = ck.checked;
      save();
      return render();
    }
    const q = e.target.closest("[data-q]");
    if (q) {
      const [i, d] = q.dataset.q.split(":").map(Number);
      S.cart[i].qty += d;
      if (S.cart[i].qty <= 0) S.cart.splice(i, 1);
      save();
      return render();
    }
    const g = e.target.closest("[data-g]");
    if (g) return openGood((S.goods[query || "cat:" + cat] || []).find((x) => x.id === g.dataset.g));
    const s = e.target.closest("[data-s]");
    if (s) return openShop(S.shops.find((x) => x.id === s.dataset.s));
  }

  async function loadGoods() {
    if (busy) return;
    if (!F.hasApiKey()) return toast("请先在设置里填写 API Key");
    busy = true;
    render();
    const key = query || "cat:" + cat;
    try {
      S.goods[key] = await genGoods(key === "cat:猜你喜欢" ? "cat:综合热销好物" : key);
      save();
    } catch (err) {
      toast("加载失败：" + err.message);
    }
    busy = false;
    render();
  }

  F.register("Meow Mart", {
    title: "Meow Mart",
    kicker: "SHOP · 喵淘 + 外卖",
    async mount(body) {
      root = document.createElement("div");
      root.className = "mm-root";
      body.appendChild(root);
      root.addEventListener("click", onClick);
      [cast, user] = await Promise.all([F.loadCast(), F.loadUser()]);
      await load();
      if (!root) return;
      render();
      clearInterval(timer);
      timer = setInterval(tick, 15000);
      tick();
    },
    unmount() {
      clearInterval(timer);
      root = null;
    }
  });
})();
