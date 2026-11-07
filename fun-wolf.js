"use strict";

/**
 * 娱乐 · 狼人杀
 * 你 + 5~8 位角色。夜晚行动由程序决定（你的身份需要你自己操作），
 * 白天发言、遗言、投票由 AI 按角色人设和各自掌握的信息生成。
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast, sleep, rnd, pick, shuffle, avHtml } = F;

  const ROLE = {
    wolf: { name: "狼人", icon: "🐺", good: false, tip: "你要隐藏身份，把怀疑引向好人，可以伪装成村民甚至假装预言家（悍跳）。保护队友，但必要时也可以踩队友做身份。" },
    seer: { name: "预言家", icon: "🔮", good: true, tip: "每晚可以查验一人是好人还是狼人。你可以选择合适时机跳出来公布查验结果，带领好人投票。" },
    witch: { name: "女巫", icon: "🧪", good: true, tip: "你有一瓶解药和一瓶毒药，各只能用一次。一般不急着暴露身份。" },
    hunter: { name: "猎人", icon: "🏹", good: true, tip: "你出局时（被毒死除外）可以开枪带走一人。可以用身份威慑狼人。" },
    villager: { name: "村民", icon: "🧑‍🌾", good: true, tip: "你没有技能，靠分析发言找出狼人。" }
  };
  const SETUP = {
    6: ["wolf", "wolf", "seer", "witch", "villager", "villager"],
    7: ["wolf", "wolf", "seer", "witch", "hunter", "villager", "villager"],
    8: ["wolf", "wolf", "wolf", "seer", "witch", "hunter", "villager", "villager"],
    9: ["wolf", "wolf", "wolf", "seer", "witch", "hunter", "villager", "villager", "villager"]
  };
  const FALLBACK_SPEECH = [
    "我是好人，第一轮信息太少了，我先听听后面的人怎么说。",
    "我感觉{x}号刚才说话有点躲闪，先标记一下。",
    "大家别乱投，我站边先跳出来的预言家。",
    "{x}号的发言逻辑有问题，我这轮会投他。",
    "我是平民，没什么信息，过了。"
  ];
  const DEFAULT_BOTS = ["阿青", "小满", "老周", "Mia", "阿杰", "糖糖", "陈默", "Kiki"].map((n, i) => ({ id: "wb" + i, name: n, persona: "", avatar: "" }));

  let root = null;
  let W = null; // 当前对局
  let pickedIds = [];
  let wantRole = "random";

  const alive = () => W.players.filter((p) => p.alive);
  const bySeat = (s) => W.players.find((p) => p.seat === s);
  const me = () => W.players.find((p) => p.isUser);
  const roleList = () => {
    const cnt = {};
    W.players.forEach((p) => (cnt[p.role] = (cnt[p.role] || 0) + 1));
    return Object.keys(ROLE)
      .filter((r) => cnt[r])
      .map((r) => ROLE[r].name + "×" + cnt[r])
      .join("、");
  };
  const tag = (p) => `${p.seat}号${p.name}`;

  function stopped(tk) {
    return !W || W.token !== tk;
  }

  /* ───── 记录 ───── */
  function pushLog(kind, text, seat) {
    const e = { kind, text, seat, day: W.day };
    W.log.push(e);
    renderLog();
    return e;
  }
  const sys = (t) => pushLog("sys", t);
  const priv = (t) => pushLog("priv", t);

  function transcript() {
    const lines = W.log
      .filter((e) => e.kind !== "priv" && !e.pending)
      .map((e) => (e.kind === "say" ? `${tag(bySeat(e.seat))}：${e.text}` : `【法官】${e.text}`));
    let s = lines.join("\n");
    if (s.length > 6000) s = "……\n" + s.slice(-6000);
    return s || "（暂无）";
  }

  function knowledge(p) {
    const k = [];
    if (p.role === "wolf") {
      const mates = W.players.filter((x) => x.role === "wolf" && x !== p);
      k.push("你的狼队友：" + (mates.length ? mates.map((m) => tag(m) + (m.alive ? "" : "（已出局）")).join("、") : "无"));
    }
    if (p.role === "witch") k.push(`解药：${W.antidote ? "还在" : "已用"}；毒药：${W.poison ? "还在" : "已用"}`);
    return k.concat(p.notes).join("\n") || "无";
  }

  function systemPrompt(p) {
    const r = ROLE[p.role];
    return [
      `你正在参加一局${W.players.length}人狼人杀，板子：${roleList()}。狼人全部出局则好人胜；狼人数量≥好人数量则狼人胜。`,
      `你是${tag(p)}。你的真实身份：${r.name}。${r.tip}`,
      p.persona ? `你的角色人设（发言要符合这个人的性格和说话方式）：\n${p.persona}` : "",
      F.recordSummary(p.name),
      `只有你知道的私密信息：\n${knowledge(p)}`,
      "要求：只依据公开记录和你的私密信息推理；像真人玩家一样口语化发言；不要用括号描写动作；不要说自己是AI；直接输出发言内容，不要加「x号：」前缀。"
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  async function aiSpeak(p, instruction, maxLen) {
    if (!F.hasApiKey()) {
      const others = alive().filter((x) => x !== p);
      return pick(FALLBACK_SPEECH).replace("{x}", others.length ? pick(others).seat : "1");
    }
    try {
      const txt = await F.aiText(
        [
          { role: "system", content: systemPrompt(p) },
          { role: "user", content: `公开记录：\n${transcript()}\n\n${instruction}` }
        ],
        { maxTokens: 900 }
      );
      return F.cleanLine(txt, maxLen || 260, p.name) || "过。";
    } catch (err) {
      console.warn("[wolf] speak", err);
      return "（网络不太好）我先过。";
    }
  }

  /* ───── 交互：等待用户 ───── */
  function setAct(html) {
    const el = root?.querySelector("#ww-act");
    if (el) el.innerHTML = html;
    return el;
  }

  /** 让用户在座位上选人 */
  function askSeat(title, candidates, skipLabel) {
    return new Promise((resolve) => {
      W.selectable = new Set(candidates.map((p) => p.seat));
      renderSeats();
      const el = setAct(`<p class="ww-ask">${esc(title)}</p>${skipLabel ? `<button type="button" class="fun-btn ghost" data-skip>${esc(skipLabel)}</button>` : ""}`);
      W.onSeat = (seat) => {
        W.selectable = null;
        W.onSeat = null;
        renderSeats();
        setAct("");
        resolve(seat);
      };
      el?.querySelector("[data-skip]")?.addEventListener("click", () => W.onSeat && W.onSeat(0));
    });
  }

  function askYesNo(title, yes, no) {
    return new Promise((resolve) => {
      const el = setAct(`<p class="ww-ask">${esc(title)}</p><div class="ww-row"><button type="button" class="fun-btn ghost" data-v="0">${esc(no)}</button><button type="button" class="fun-btn solid" data-v="1">${esc(yes)}</button></div>`);
      el.querySelectorAll("[data-v]").forEach((b) =>
        b.addEventListener("click", () => {
          setAct("");
          resolve(b.dataset.v === "1");
        })
      );
    });
  }

  function askText(title, placeholder) {
    return new Promise((resolve) => {
      const el = setAct(`<p class="ww-ask">${esc(title)}</p>
        <div class="ww-input"><textarea rows="2" placeholder="${esc(placeholder || "说点什么…")}"></textarea>
        <div class="ww-row"><button type="button" class="fun-btn ghost" data-skip>过</button><button type="button" class="fun-btn solid" data-send>发言</button></div></div>`);
      const ta = el.querySelector("textarea");
      setTimeout(() => ta.focus(), 50);
      el.querySelector("[data-skip]").onclick = () => {
        setAct("");
        resolve("");
      };
      el.querySelector("[data-send]").onclick = () => {
        const v = ta.value.trim();
        setAct("");
        resolve(v);
      };
    });
  }

  function waitNext(label) {
    return new Promise((resolve) => {
      const el = setAct(`<button type="button" class="fun-btn solid wide">${esc(label || "继续")}</button>`);
      el.querySelector("button").onclick = () => {
        setAct("");
        resolve();
      };
    });
  }

  /* ───── 夜晚 ───── */
  function claimedSeers() {
    return W.log.filter((e) => e.kind === "say" && /预言家/.test(e.text) && /(查验|验了|金水|查杀|验到)/.test(e.text)).map((e) => e.seat);
  }

  async function night(tk) {
    W.phase = "night";
    renderAll();
    sys(`第 ${W.day} 夜，天黑请闭眼。`);
    await sleep(700);
    if (stopped(tk)) return null;
    const u = me();

    // 狼人
    const wolves = alive().filter((p) => p.role === "wolf");
    const prey = alive().filter((p) => p.role !== "wolf");
    let kill = 0;
    if (u.alive && u.role === "wolf") {
      const mates = wolves.filter((p) => !p.isUser);
      if (mates.length && W.day === 1) priv(`狼队友：${mates.map(tag).join("、")}`);
      kill = await askSeat("狼人请睁眼。选择今晚要刀的人：", prey, null);
    } else {
      const seers = claimedSeers().map(bySeat).filter((p) => p && p.alive && p.role !== "wolf");
      kill = (seers.length && Math.random() < 0.7 ? pick(seers) : pick(prey)).seat;
    }
    if (stopped(tk)) return null;
    wolves.forEach((w) => w.notes.push(`第${W.day}夜，你们狼队刀了${tag(bySeat(kill))}。`));
    if (u.role === "wolf" && u.alive) priv(`你们刀了 ${tag(bySeat(kill))}`);

    // 预言家
    const seer = alive().find((p) => p.role === "seer");
    if (seer) {
      const unchecked = alive().filter((p) => p !== seer && !seer.checked.has(p.seat));
      let target = 0;
      if (seer.isUser) {
        target = await askSeat("预言家请睁眼。选择要查验的人：", alive().filter((p) => p !== seer), null);
      } else if (unchecked.length) target = pick(unchecked).seat;
      if (stopped(tk)) return null;
      if (target) {
        const t = bySeat(target);
        seer.checked.add(target);
        const res = t.role === "wolf" ? "狼人" : "好人";
        seer.notes.push(`第${W.day}夜你查验了${tag(t)}：${res}。`);
        if (seer.isUser) {
          priv(`查验结果：${tag(t)} 是 ${res}`);
          t.mark = res === "狼人" ? "查杀" : "金水";
          renderSeats();
        }
      }
    }

    // 女巫
    const witch = alive().find((p) => p.role === "witch");
    let saved = false;
    let poisoned = 0;
    if (witch) {
      const victim = bySeat(kill);
      if (witch.isUser) {
        if (W.antidote) {
          saved = await askYesNo(`女巫请睁眼。今晚 ${tag(victim)} 倒牌了，要用解药救吗？`, "救", "不救");
        } else priv(`今晚 ${tag(victim)} 倒牌了（解药已用完）`);
        if (stopped(tk)) return null;
        if (!saved && W.poison) {
          const t = await askSeat("要用毒药吗？点选目标，或者不用。", alive().filter((p) => p !== witch), "不用毒药");
          if (t) poisoned = t;
        }
      } else {
        if (W.antidote && victim !== witch && Math.random() < (W.day === 1 ? 0.85 : 0.45)) saved = true;
        else if (W.poison && W.day >= 2 && Math.random() < 0.3) {
          const seers = new Set(claimedSeers());
          const cands = alive().filter((p) => p !== witch && !seers.has(p.seat));
          if (cands.length) poisoned = pick(cands).seat;
        }
      }
      if (stopped(tk)) return null;
      if (saved) {
        W.antidote = false;
        witch.notes.push(`第${W.day}夜你用解药救了${tag(victim)}。`);
      }
      if (poisoned) {
        W.poison = false;
        witch.notes.push(`第${W.day}夜你毒了${tag(bySeat(poisoned))}。`);
      }
    }

    const deaths = [];
    if (!saved) deaths.push({ seat: kill, by: "wolf" });
    if (poisoned) {
      const same = deaths.find((d) => d.seat === poisoned);
      if (same) same.by = "poison";
      else deaths.push({ seat: poisoned, by: "poison" });
    }
    return deaths;
  }

  /* ───── 出局 / 猎人 ───── */
  async function eliminate(seat, by, tk, allowLastWords) {
    const p = bySeat(seat);
    if (!p || !p.alive) return;
    p.alive = false;
    renderSeats();
    if (allowLastWords) {
      if (p.isUser) {
        const t = await askText("你出局了，留下遗言吧：", "遗言…");
        if (stopped(tk)) return;
        pushLog("say", t || "（没有遗言）", p.seat);
      } else {
        const e = pushLog("say", "…", p.seat);
        e.pending = true;
        renderLog();
        const t = await aiSpeak(p, `你已经出局了（${by === "vote" ? "被投票放逐" : "昨晚死亡"}），请发表遗言，30~80字。`, 200);
        if (stopped(tk)) return;
        e.text = t;
        e.pending = false;
        renderLog();
      }
    }
    if (p.role === "hunter" && by !== "poison") await hunterShoot(p, tk);
  }

  async function hunterShoot(h, tk) {
    const cands = alive().filter((x) => x !== h);
    if (!cands.length) return;
    let target = 0;
    if (h.isUser) {
      target = await askSeat("你是猎人，可以开枪带走一人：", cands, "不开枪");
    } else {
      const voters = (W.lastVotes || []).filter((v) => v.to === h.seat).map((v) => bySeat(v.from)).filter((x) => x && x.alive);
      target = (voters.length ? pick(voters) : pick(cands)).seat;
    }
    if (stopped(tk) || !target) return;
    sys(`${tag(h)} 亮出猎人身份，开枪带走了 ${tag(bySeat(target))}！`);
    await eliminate(target, "shot", tk, false);
  }

  function winner() {
    const a = alive();
    const wolves = a.filter((p) => p.role === "wolf").length;
    if (!wolves) return "good";
    if (wolves >= a.length - wolves) return "wolf";
    return null;
  }

  /* ───── 白天 ───── */
  async function dayPhase(deaths, tk) {
    W.phase = "day";
    renderAll();
    if (!deaths.length) sys(`第 ${W.day} 天，天亮了。昨晚是平安夜。`);
    else sys(`第 ${W.day} 天，天亮了。昨晚 ${deaths.map((d) => tag(bySeat(d.seat))).join("、")} 死亡。`);
    for (const d of deaths) {
      await eliminate(d.seat, d.by, tk, W.day === 1);
      if (stopped(tk)) return;
    }
    if (winner()) return;

    sys("请按座位顺序发言。");
    const start = deaths.length ? deaths[0].seat : 1;
    const n = W.players.length;
    const ord = (seat) => (((seat - start) % n) + n) % n;
    const order = alive().slice().sort((a, b) => ord(a.seat) - ord(b.seat));
    for (const p of order) {
      if (stopped(tk)) return;
      if (!p.alive) continue;
      W.speaking = p.seat;
      renderSeats();
      if (p.isUser) {
        const t = await askText(`轮到你（${p.seat}号）发言：`, "说说你的判断…");
        if (stopped(tk)) return;
        pushLog("say", t || "过。", p.seat);
      } else {
        const e = pushLog("say", "…", p.seat);
        e.pending = true;
        renderLog();
        const t = await aiSpeak(p, `现在是第${W.day}天白天，轮到你（${p.seat}号）发言。请发言，60~120字。`);
        if (stopped(tk)) return;
        e.text = t;
        e.pending = false;
        renderLog();
        await sleep(350);
      }
    }
    W.speaking = 0;
    renderSeats();

    // 投票
    sys("发言结束，开始投票。");
    const votes = [];
    const u = me();
    if (u.alive) {
      const t = await askSeat("点选你要投出的人：", alive().filter((p) => p !== u), "弃票");
      if (stopped(tk)) return;
      votes.push({ from: u.seat, to: t });
    }
    setAct(`<p class="ww-ask">大家正在投票…</p>`);
    const aiVotes = await collectAiVotes();
    if (stopped(tk)) return;
    setAct("");
    votes.push(...aiVotes);
    W.lastVotes = votes;
    const tally = {};
    votes.forEach((v) => v.to && (tally[v.to] = (tally[v.to] || 0) + 1));
    const lines = Object.entries(tally)
      .sort((a, b) => b[1] - a[1])
      .map(([to, n]) => `${to}号 ${n}票（${votes.filter((v) => v.to === Number(to)).map((v) => v.from).join("、")}）`);
    const abst = votes.filter((v) => !v.to).map((v) => v.from);
    sys("投票结果：" + (lines.join("；") || "全部弃票") + (abst.length ? `；弃票：${abst.join("、")}号` : ""));
    const max = Math.max(0, ...Object.values(tally));
    const tops = Object.keys(tally).filter((k) => tally[k] === max).map(Number);
    if (!max || tops.length > 1) {
      sys(max ? "平票，今天无人出局。" : "无人出局。");
      return;
    }
    sys(`${tag(bySeat(tops[0]))} 被放逐。`);
    await eliminate(tops[0], "vote", tk, true);
  }

  async function collectAiVotes() {
    const voters = alive().filter((p) => !p.isUser);
    const cands = alive().map((p) => p.seat);
    const fallback = () =>
      voters.map((p) => {
        const pool = alive().filter((x) => x !== p && (p.role !== "wolf" || x.role !== "wolf"));
        return { from: p.seat, to: pool.length ? pick(pool).seat : 0 };
      });
    if (!F.hasApiKey()) return fallback();
    try {
      const desc = voters
        .map((p) => `- ${tag(p)}，身份：${ROLE[p.role].name}；私密信息：${knowledge(p).replace(/\n/g, "；")}${p.persona ? `；性格：${p.persona.slice(0, 80).replace(/\n/g, " ")}` : ""}`)
        .join("\n");
      const txt = await F.aiText(
        [
          {
            role: "system",
            content:
              "你是狼人杀的游戏引擎，替多位玩家各自独立地决定投票。每位玩家只能依据公开记录和他自己的私密信息判断：狼人会投好人、尽量保护队友（必要时可以倒钩）；预言家会投自己查杀的狼；其他好人投他们最怀疑的人。只输出 JSON。"
          },
          {
            role: "user",
            content: `公开记录：\n${transcript()}\n\n存活座位：${cands.join("、")}\n需要投票的玩家：\n${desc}\n\n输出格式：{"投票者座位号": 被投座位号}，例如 {"2":5,"3":5}。不能投自己，0 表示弃票。`
          }
        ],
        { maxTokens: 600, temperature: 0.7 }
      );
      const obj = F.parseJsonLoose(txt);
      if (!obj || typeof obj !== "object") return fallback();
      const fb = fallback();
      return voters.map((p, i) => {
        const to = Number(obj[p.seat] ?? obj[String(p.seat)]);
        return Number.isInteger(to) && (to === 0 || (to !== p.seat && cands.includes(to))) ? { from: p.seat, to } : fb[i];
      });
    } catch (err) {
      console.warn("[wolf] vote", err);
      return fallback();
    }
  }

  /* ───── 主流程 ───── */
  async function runGame() {
    const tk = W.token;
    const u = me();
    sys(`游戏开始！本局 ${W.players.length} 人：${roleList()}。`);
    priv(`你是 ${u.seat} 号，身份：${ROLE[u.role].icon} ${ROLE[u.role].name}。${ROLE[u.role].tip}`);
    if (u.role === "wolf") W.players.forEach((p) => p.role === "wolf" && !p.isUser && (p.mark = "队友"));
    renderSeats();
    await waitNext("天黑请闭眼");
    while (!stopped(tk)) {
      W.day++;
      const deaths = await night(tk);
      if (stopped(tk) || !deaths) return;
      await dayPhase(deaths, tk);
      if (stopped(tk)) return;
      const w = winner();
      if (w) return endGame(w);
      await waitNext(me().alive ? "进入下一夜" : "继续（你已出局，观战中）");
    }
  }

  function endGame(w) {
    W.phase = "end";
    W.over = true;
    sys(w === "good" ? "狼人全部出局，好人阵营胜利！" : "狼人数量已不少于好人，狼人阵营胜利！");
    sys("身份公布：" + W.players.map((p) => `${p.seat}号${p.name}-${ROLE[p.role].name}`).join("，"));
    const mine = ROLE[me().role].good ? "good" : "wolf";
    renderAll();
    const u = me();
    void F.addRecord({
      game: "狼人杀",
      players: W.players.filter((p) => !p.isUser).map((p) => p.name),
      winner: w === "good" ? "好人阵营" : "狼人阵营",
      userWon: mine === w,
      note: `${u.name}当${ROLE[u.role].name}，${mine === w ? "赢了" : "输了"}`
    });
    const el = setAct(`<p class="ww-ask">${mine === w ? "🎉 你所在的阵营赢了！" : "😵 你所在的阵营输了"}</p><div class="ww-row"><button type="button" class="fun-btn ghost" data-a="setup">换人</button><button type="button" class="fun-btn solid" data-a="again">再来一局</button></div>`);
    el.querySelector('[data-a="setup"]').onclick = () => renderSetup();
    el.querySelector('[data-a="again"]').onclick = () => startGame(W.players.map((p) => ({ id: p.id, name: p.name, persona: p.persona, avatar: p.avatar, isUser: p.isUser })));
  }

  /* ───── 渲染 ───── */
  function renderSeats() {
    const el = root?.querySelector("#ww-seats");
    if (!el || !W) return;
    const show = W.over;
    el.innerHTML = W.players
      .map((p) => {
        const sel = W.selectable && W.selectable.has(p.seat);
        const badge = show ? ROLE[p.role].icon + ROLE[p.role].name : p.isUser ? "你" : p.mark || "";
        return `<button type="button" class="ww-seat${p.alive ? "" : " is-dead"}${sel ? " is-sel" : ""}${W.speaking === p.seat ? " is-speak" : ""}${p.isUser ? " is-me" : ""}" data-seat="${p.seat}" ${sel ? "" : "tabindex=-1"}>
          <span class="ww-no">${p.seat}</span>${avHtml(p, "fun-av ww-av")}
          <strong>${esc(p.name)}</strong>${badge ? `<em class="ww-badge${p.mark === "查杀" ? " is-bad" : ""}">${esc(badge)}</em>` : ""}
        </button>`;
      })
      .join("");
  }

  function renderLog() {
    const el = root?.querySelector("#ww-log");
    if (!el || !W) return;
    el.innerHTML = W.log
      .map((e) => {
        if (e.kind === "say") {
          const p = bySeat(e.seat);
          return `<div class="ww-msg${p.isUser ? " is-me" : ""}">${avHtml(p, "fun-av sm")}<div><small>${p.seat}号 ${esc(p.name)}</small><p class="${e.pending ? "is-typing" : ""}">${e.pending ? "<i></i><i></i><i></i>" : esc(e.text)}</p></div></div>`;
        }
        return `<div class="ww-sys${e.kind === "priv" ? " is-priv" : ""}">${e.kind === "priv" ? "🔒 " : ""}${esc(e.text)}</div>`;
      })
      .join("");
    el.scrollTop = el.scrollHeight;
  }

  function renderAll() {
    if (!root || !W) return;
    const u = me();
    root.innerHTML = `<div class="ww ww--${W.phase}">
      <div class="ww-head"><span class="ww-phase">${W.phase === "night" ? "🌙 第" + W.day + "夜" : W.phase === "day" ? "☀️ 第" + W.day + "天" : W.phase === "end" ? "🏁 结束" : "准备"}</span>
        <span class="ww-myrole">${ROLE[u.role].icon} 我是 ${u.seat} 号 · ${ROLE[u.role].name}${u.alive ? "" : "（已出局）"}</span></div>
      <div class="ww-seats" id="ww-seats"></div>
      <div class="ww-log" id="ww-log"></div>
      <div class="ww-act" id="ww-act"></div>
    </div>`;
    renderSeats();
    renderLog();
  }

  function startGame(people) {
    const n = people.length;
    const roles = shuffle(SETUP[n].slice());
    const ui = people.findIndex((p) => p.isUser);
    if (wantRole !== "random") {
      const j = roles.indexOf(wantRole);
      if (j >= 0) [roles[ui], roles[j]] = [roles[j], roles[ui]];
    }
    const seats = shuffle(people.map((_, i) => i + 1));
    W = {
      token: Symbol("wolf"),
      players: people
        .map((p, i) => ({ ...p, seat: seats[i], role: roles[i], alive: true, notes: [], checked: new Set(), mark: "" }))
        .sort((a, b) => a.seat - b.seat),
      log: [],
      day: 0,
      phase: "ready",
      antidote: true,
      poison: true,
      selectable: null,
      onSeat: null,
      speaking: 0,
      over: false
    };
    renderAll();
    void runGame();
  }

  async function renderSetup() {
    W = null;
    root.innerHTML = `<div class="fun-setup"><div class="fun-hero ww-hero">🐺</div>
      <p class="fun-kicker">SOCIAL DEDUCTION</p><h2 class="fun-h2">和角色们玩狼人杀</h2>
      <p class="fun-note">你 + 5~8 位角色（6~9 人局）。角色们会按各自人设发言、投票，狼人会骗人，预言家会报查验。</p>
      <div class="fun-picked" id="ww-picked"></div>
      <label class="fun-field"><span>我的身份</span><select id="ww-role">
        <option value="random">随机</option><option value="wolf">狼人</option><option value="seer">预言家</option><option value="witch">女巫</option><option value="hunter">猎人</option><option value="villager">村民</option>
      </select></label>
      ${F.hasApiKey() ? `<p class="fun-note">每天约调用 API 人数+2 次。</p>` : `<p class="fun-note warn">没有填 API Key：角色只会说预设的套话，建议先去设置里填好。</p>`}
      <div class="fun-setup-btns"><button type="button" class="fun-btn ghost" id="ww-pick">选角色</button><button type="button" class="fun-btn solid" id="ww-start">开始</button></div></div>`;
    root.querySelector("#ww-role").value = wantRole;
    root.querySelector("#ww-role").onchange = (e) => (wantRole = e.target.value);
    const cast = await F.loadCast();
    const user = await F.loadUser();
    if (!root) return;
    const pool = cast.length >= 5 ? cast : cast.concat(DEFAULT_BOTS.filter((b) => !cast.some((c) => c.name === b.name)));
    let picked = pool.filter((c) => pickedIds.includes(c.id));
    if (picked.length < 5) picked = cast.slice(0, 7).concat(DEFAULT_BOTS).slice(0, Math.max(5, Math.min(7, cast.length)));
    const renderPicked = () => {
      root.querySelector("#ww-picked").innerHTML =
        picked.map((p) => `<span class="fun-chip">${avHtml(p, "fun-av sm")}${esc(p.name)}</span>`).join("") +
        `<p class="fun-note">共 ${picked.length + 1} 人局${cast.length < 5 ? "（角色不够 5 位，用路人补位）" : ""}</p>`;
    };
    renderPicked();
    root.querySelector("#ww-pick").onclick = async () => {
      const res = await F.pickCast(pool, { min: 5, max: 8, preselect: picked.map((p) => p.id), title: "选 5~8 位玩家" });
      if (res) {
        picked = res;
        pickedIds = res.map((p) => p.id);
        renderPicked();
      }
    };
    root.querySelector("#ww-start").onclick = () => startGame([{ ...user, id: "me", isUser: true }, ...picked.map((p) => ({ ...p, isUser: false }))]);
  }

  function onClick(e) {
    const s = e.target.closest(".ww-seat");
    if (s && W && W.onSeat && W.selectable && W.selectable.has(Number(s.dataset.seat))) W.onSeat(Number(s.dataset.seat));
  }

  F.register("狼人杀", {
    title: "狼人杀",
    kicker: "GAME / WEREWOLF",
    parent: "游戏厅",
    mount(body, act) {
      root = document.createElement("div");
      root.className = "ww-root";
      body.appendChild(root);
      root.addEventListener("click", onClick);
      act.innerHTML = `<button type="button" class="fun-btn ghost sm" id="ww-restart">重开</button>`;
      act.querySelector("#ww-restart").onclick = () => renderSetup();
      void renderSetup();
    },
    unmount() {
      W = null;
      root = null;
    }
  });
})();
