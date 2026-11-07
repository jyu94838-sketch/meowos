"use strict";

/**
 * 名字生成器：从诗词歌赋里取好听、不俗的名字
 * - 有 API Key：AI 按条件现取（要求出处真实、避开俗字）
 * - 没有 Key：从内置的诗词名字库里挑
 * - 可以收藏、复制
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast } = F;
  const KV = "names_fav_v1";

  /** 内置名字库：[名, 性别 f/m/n, 出处, 原句, 寓意] —— 出处都核对过 */
  const LIB = [
    ["清扬", "f", "《诗经·郑风·野有蔓草》", "有美一人，清扬婉兮", "眉目清秀、神采飞扬"],
    ["婉清", "f", "《诗经·郑风·野有蔓草》", "有美一人，清扬婉兮", "温婉清丽"],
    ["静姝", "f", "《诗经·邶风·静女》", "静女其姝，俟我于城隅", "娴静美好"],
    ["灼华", "f", "《诗经·周南·桃夭》", "桃之夭夭，灼灼其华", "像盛开的桃花一样明艳"],
    ["子衿", "n", "《诗经·郑风·子衿》", "青青子衿，悠悠我心", "被人深深惦念的人"],
    ["思齐", "n", "《诗经·大雅·思齐》", "思齐大任，文王之母", "端庄贤德，见贤思齐"],
    ["如琢", "m", "《诗经·卫风·淇奥》", "如切如磋，如琢如磨", "精益求精，温润如玉"],
    ["景行", "m", "《诗经·小雅·车舝》", "高山仰止，景行行止", "品行高尚、光明正大"],
    ["南乔", "n", "《诗经·周南·汉广》", "南有乔木，不可休思", "挺拔高远"],
    ["采薇", "f", "《诗经·小雅·采薇》", "采薇采薇，薇亦作止", "清新自然，有古意"],
    ["依依", "f", "《诗经·小雅·采薇》", "昔我往矣，杨柳依依", "温柔缱绻"],
    ["宛央", "f", "《诗经·秦风·蒹葭》", "溯游从之，宛在水中央", "可望而不可即的美好"],
    ["舒窈", "f", "《诗经·陈风·月出》", "月出皎兮，佼人僚兮，舒窈纠兮", "体态轻盈、从容美好"],
    ["怀瑾", "n", "《楚辞·九章·怀沙》", "怀瑾握瑜兮，穷不知所示", "品德美好如玉"],
    ["若英", "f", "《楚辞·九歌·云中君》", "华采衣兮若英", "像花一样鲜妍"],
    ["灵均", "m", "《楚辞·离骚》", "名余曰正则兮，字余曰灵均", "灵秀而公正，屈原的字"],
    ["修远", "m", "《楚辞·离骚》", "路漫漫其修远兮，吾将上下而求索", "志向远大、坚持求索"],
    ["望舒", "n", "《楚辞·离骚》", "前望舒使先驱兮", "望舒是为月亮驾车的神，清朗如月"],
    ["沅芷", "f", "《楚辞·九歌·湘夫人》", "沅有芷兮澧有兰", "像香草一样高洁"],
    ["杜若", "f", "《楚辞·九歌·湘夫人》", "搴汀洲兮杜若", "香草名，芬芳高洁"],
    ["安歌", "n", "《楚辞·九歌·东皇太一》", "疏缓节兮安歌", "从容安然、歌声悠扬"],
    ["木兰", "f", "《楚辞·离骚》", "朝搴阰之木兰兮", "香木，坚韧高洁"],
    ["惊鸿", "f", "曹植《洛神赋》", "翩若惊鸿，婉若游龙", "身姿轻盈、惊艳"],
    ["回雪", "f", "曹植《洛神赋》", "飘飖兮若流风之回雪", "轻盈飘逸"],
    ["清和", "n", "谢灵运《游赤石进帆海》", "首夏犹清和，芳草亦未歇", "清朗和暖"],
    ["澄江", "m", "谢朓《晚登三山还望京邑》", "余霞散成绮，澄江静如练", "清澈宁静"],
    ["致远", "m", "诸葛亮《诫子书》", "非淡泊无以明志，非宁静无以致远", "志存高远"],
    ["明志", "m", "诸葛亮《诫子书》", "非淡泊无以明志，非宁静无以致远", "心志清明"],
    ["长风", "m", "李白《行路难·其一》", "长风破浪会有时，直挂云帆济沧海", "乘风破浪、前程远大"],
    ["晚晴", "f", "李商隐《晚晴》", "天意怜幽草，人间重晚晴", "雨后放晴，温柔珍贵"],
    ["星河", "n", "李清照《渔家傲》", "天接云涛连晓雾，星河欲转千帆舞", "辽阔浪漫"],
    ["疏影", "f", "林逋《山园小梅》", "疏影横斜水清浅，暗香浮动月黄昏", "清雅如梅"],
    ["清浅", "f", "林逋《山园小梅》", "疏影横斜水清浅", "清澈淡然"],
    ["疏桐", "n", "苏轼《卜算子·黄州定慧院寓居作》", "缺月挂疏桐，漏断人初静", "清冷疏朗"],
    ["清欢", "f", "苏轼《浣溪沙·细雨斜风作晓寒》", "人间有味是清欢", "平淡中的欢喜"],
    ["景明", "m", "范仲淹《岳阳楼记》", "至若春和景明，波澜不惊", "光明美好"],
    ["春和", "n", "范仲淹《岳阳楼记》", "至若春和景明", "温和舒展"],
    ["知微", "n", "《周易·系辞下》", "君子知微知彰，知柔知刚", "见微知著、聪慧"],
    ["予安", "n", "苏轼《定风波·常羡人间琢玉郎》（化用）", "此心安处是吾乡", "心安自在"],
    ["听澜", "m", "《孟子·尽心上》（化用）", "观水有术，必观其澜", "胸怀宽广"],
    ["时雨", "n", "《孟子·尽心上》", "有如时雨化之者", "恰逢其时、润物无声"]
  ];

  let opts = { sur: "", gender: "f", len: 2, src: "不限", mood: "" };
  let results = [];
  let favs = [];
  let root = null;
  let busy = false;

  async function aiNames() {
    const want = opts.gender === "f" ? "女孩" : opts.gender === "m" ? "男孩" : "不限性别（中性）";
    const t = await F.aiText(
      [
        {
          role: "system",
          content: `你是精通古典诗词的起名先生，取名雅致、有出处、不落俗套。
硬性要求：
1. 名字（不含姓）${opts.len === 1 ? "1 个字" : "2 个字"}，${want}。
2. 出处必须是**真实存在**的诗词文赋原句，原句一字不能编；拿不准出处的名字就不要给。
3. 不要俗字和烂大街的名字：避开 涵、轩、萱、梓、睿、浩、宇、欣、怡、婷、伟、强、丽、娜、俊、杰、子涵、梓涵、雨涵、浩然、一诺 之类。
4. 读起来顺口，声调有起伏，${opts.sur ? `和姓「${opts.sur}」连读要好听，不能谐音尴尬` : "单独念也好听"}。
5. 出处范围：${opts.src}。${opts.mood ? `想要的意境：${opts.mood}。` : ""}
只输出 JSON 数组，8 个：[{"name":"名","src":"作者《篇名》","line":"原句","mean":"寓意，15 字以内"}]`
        },
        { role: "user", content: "请取名。" }
      ],
      { maxTokens: 1200, temperature: 0.95 }
    );
    const arr = F.parseJsonLoose(t);
    if (!Array.isArray(arr)) throw new Error("没解析出名字，再试一次");
    return arr
      .filter((x) => x && x.name)
      .slice(0, 10)
      .map((x) => ({ name: String(x.name).replace(opts.sur, "").trim().slice(0, 3), src: String(x.src || ""), line: String(x.line || ""), mean: String(x.mean || "") }));
  }
  function libNames() {
    let list = LIB.filter((x) => (opts.gender === "n" ? true : x[1] === opts.gender || x[1] === "n"));
    if (opts.len === 1) list = list.map((x) => [x[0][x[0].length - 1], ...x.slice(1)]);
    if (opts.src !== "不限") {
      const key = { 诗经: "诗经", 楚辞: "楚辞", 唐诗: ["李白", "李商隐", "杜甫", "王维"], 宋词: ["苏轼", "李清照", "林逋", "范仲淹"], 古文: ["曹植", "诸葛亮", "周易", "孟子", "谢"] }[opts.src];
      const ks = Array.isArray(key) ? key : [key];
      const f = list.filter((x) => ks.some((k) => x[2].includes(k)));
      if (f.length) list = f;
    }
    list = list.slice().sort(() => Math.random() - 0.5).slice(0, 8);
    return list.map((x) => ({ name: x[0], src: x[2], line: x[3], mean: x[4] }));
  }

  async function gen() {
    if (busy) return;
    busy = true;
    draw();
    try {
      results = F.hasApiKey() ? await aiNames() : libNames();
    } catch (err) {
      toast("AI 取名失败，先用内置名字库：" + err.message);
      results = libNames();
    }
    busy = false;
    draw();
  }
  const isFav = (n) => favs.some((f) => f.name === n.name && f.src === n.src);
  function card(n, i, fav) {
    const full = (opts.sur || "") + n.name;
    return `<div class="nm-card"><div class="nm-top"><b>${esc(fav ? n.full || n.name : full)}</b><span>
      <button type="button" class="nm-ic" data-copy="${esc(fav ? n.full || n.name : full)}" aria-label="复制">⧉</button>
      <button type="button" class="nm-ic${fav || isFav(n) ? " is-on" : ""}" data-fav="${i}" data-isfav="${fav ? 1 : 0}" aria-label="收藏">${fav || isFav(n) ? "♥" : "♡"}</button></span></div>
      ${n.line && n.line !== "—" ? `<p class="nm-line">「${esc(n.line)}」</p>` : ""}<small>${esc(n.src)}</small>${n.mean ? `<p class="nm-mean">${esc(n.mean)}</p>` : ""}</div>`;
  }
  function draw() {
    if (!root) return;
    const chip = (k, v, label) => `<button type="button" class="fun-chip-btn${opts[k] === v ? " is-on" : ""}" data-k="${k}" data-v="${v}">${label}</button>`;
    root.innerHTML = `<div class="nm">
      <div class="nm-hero"><b>好名字</b><small>取自诗经楚辞、唐诗宋词，不土不俗</small></div>
      <label class="fun-field"><span>姓（可不填）</span><input id="nm-sur" maxlength="2" value="${esc(opts.sur)}" placeholder="比如：沈" /></label>
      <div class="nm-row"><span>性别</span>${chip("gender", "f", "女孩")}${chip("gender", "m", "男孩")}${chip("gender", "n", "中性")}</div>
      <div class="nm-row"><span>字数</span>${chip("len", 2, "两个字")}${chip("len", 1, "一个字")}</div>
      <div class="nm-row nm-wrap"><span>出处</span>${["不限", "诗经", "楚辞", "唐诗", "宋词", "古文"].map((s) => chip("src", s, s)).join("")}</div>
      <label class="fun-field"><span>想要的意境（可不填）</span><input id="nm-mood" maxlength="30" value="${esc(opts.mood)}" placeholder="比如：清冷、月亮、温柔、山水" /></label>
      <button type="button" class="fun-btn solid nm-go" ${busy ? "disabled" : ""}>${busy ? "正在翻诗词…" : results.length ? "换一批" : "取名"}</button>
      ${F.hasApiKey() ? "" : `<p class="fun-note">没填 API Key，现在从内置的 ${LIB.length} 个诗词名字里挑；填了 Key 会现取，选择更多。</p>`}
      <div class="nm-list">${results.map((n, i) => card(n, i, false)).join("")}</div>
      ${favs.length ? `<p class="fun-kicker">收藏的名字</p><div class="nm-list">${favs.map((n, i) => card(n, i, true)).join("")}</div>` : ""}
      <p class="fun-note">AI 给的出处偶尔会记错，正式起名前建议再查一下原文。</p>
    </div>`;
  }
  async function onClick(e) {
    const c = e.target.closest("[data-k]");
    if (c) {
      opts[c.dataset.k] = c.dataset.k === "len" ? Number(c.dataset.v) : c.dataset.v;
      return draw();
    }
    if (e.target.closest(".nm-go")) {
      opts.sur = root.querySelector("#nm-sur").value.trim();
      opts.mood = root.querySelector("#nm-mood").value.trim();
      return gen();
    }
    const cp = e.target.closest("[data-copy]");
    if (cp) {
      try {
        await navigator.clipboard.writeText(cp.dataset.copy);
      } catch (_) {
        /* ignore */
      }
      return toast(`已复制：${cp.dataset.copy}`);
    }
    const fv = e.target.closest("[data-fav]");
    if (fv) {
      const i = Number(fv.dataset.fav);
      if (fv.dataset.isfav === "1") favs.splice(i, 1);
      else {
        const n = results[i];
        if (isFav(n)) favs = favs.filter((f) => !(f.name === n.name && f.src === n.src));
        else favs.unshift({ ...n, full: (opts.sur || "") + n.name });
      }
      F.FunDB.set(KV, favs.slice(0, 100)).catch(() => {});
      return draw();
    }
  }

  F.register("名字生成器", {
    title: "名字生成器",
    kicker: "NAMES · 诗词取名",
    async mount(body) {
      root = document.createElement("div");
      body.appendChild(root);
      try {
        favs = (await F.FunDB.get(KV)) || [];
      } catch (_) {
        favs = [];
      }
      root.addEventListener("click", (e) => void onClick(e));
      draw();
    },
    unmount() {
      root = null;
    }
  });
})();
