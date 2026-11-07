"use strict";

/**
 * 预设 / 提示词导入：给各个板块的提示词输入框加一个「导入文件」按钮
 * 支持 .txt .md（纯文本）、.json（包括 SillyTavern 的预设、角色卡、世界书）、.docx（Word）
 * 导入后会触发输入事件，原来的自动保存 / 保存按钮照常工作
 */
(function () {
  /** 要加导入按钮的输入框，后面是在按钮上显示的名字 */
  const TARGETS = {
    "settings-global-thinking-chain-im": "思维链 · 即时密谈",
    "settings-global-thinking-chain-offline": "思维链 · 当面晤面",
    "settings-global-thinking-chain-group": "思维链 · 群聊",
    "settings-theater-add-instruction": "小剧场预设",
    "settings-theater-add-html": "小剧场 HTML",
    "chat-offline-prose-style-custom": "文风",
    "chat-offline-prose-pov-custom": "人称视角",
    "chat-offline-prose-length-custom": "篇幅",
    "chat-memo-prompt-summary": "总结提示词",
    "chat-memo-prompt-merge": "合并提示词",
    "image-gen-style": "生图风格",
    "image-gen-negative": "负面提示词",
    "chat-detail-imgstyle-ta": "风格后缀",
    "chat-detail-char-img-prompt-ta": "角色提示词",
    "chat-offline-imgstyle-ta": "风格后缀",
    "char-summary": "角色摘要",
    "char-alt-persona": "角色人设",
    "char-voice": "说话方式",
    "char-boundaries": "边界",
    "char-npc-relations": "人物关系",
    "char-image-gen-prompt": "外貌提示词",
    "user-mask-persona": "我的人设",
    "user-mask-summary": "我的摘要",
    "user-mask-voice": "我的说话方式",
    "user-mask-boundaries": "我的边界",
    "user-mask-image-gen-prompt": "我的外貌提示词",
    "world-book-edit-content": "世界书条目",
    "ward-chat-css-input": "聊天 CSS",
    "roam-worldview-text": "世界观",
    "forum-sector-custom-prompt": "版块提示词",
    "roleplay-custom-world": "世界设定",
    "ext-sb-editor-text": "小剧场文本",
    "ext-sb-editor-html": "小剧场 HTML"
  };
  const ACCEPT = ".txt,.md,.markdown,.json,.docx,.text,.csv,.css,.html,text/plain,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const MAX = 8 * 1024 * 1024;

  const toast = (m) => {
    try {
      if (typeof showToast === "function") return showToast(m);
    } catch (_) {
      /* ignore */
    }
    window.XXJ_FUN?.toast?.(m);
  };

  /* ───── 读文件 ───── */
  function decodeXml(s) {
    return s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&amp;/g, "&");
  }
  async function docxText(buf) {
    const ff = window.fflate;
    if (!ff || !ff.unzipSync) throw new Error("读 Word 的组件还没加载好，稍等几秒再试");
    let files;
    try {
      files = ff.unzipSync(new Uint8Array(buf), { filter: (f) => /^word\/(document|footnotes)\.xml$/.test(f.name) });
    } catch (_) {
      throw new Error("这个 Word 文件打不开（只支持 .docx，老的 .doc 请另存为 .docx）");
    }
    const xmlBytes = files["word/document.xml"];
    if (!xmlBytes) throw new Error("没在 Word 里找到正文");
    const xml = new TextDecoder("utf-8").decode(xmlBytes);
    const body = xml
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br[^>]*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:p[ >][\s\S]*?(?=<w:r|<\/w:p>)/g, (m) => (/<w:numPr>/.test(m) ? "· " : ""))
      .replace(/<[^>]+>/g, "");
    return decodeXml(body)
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  /** JSON → 文字：认得酒馆预设 / 角色卡 / 世界书，其他就挑常见字段 */
  function jsonText(j, hint) {
    if (j == null) return "";
    if (typeof j === "string") return j;
    if (Array.isArray(j)) return j.map((x) => jsonText(x, hint)).filter(Boolean).join("\n\n");
    if (typeof j !== "object") return String(j);
    // 酒馆对话预设：prompts[]
    if (Array.isArray(j.prompts)) {
      const order = Array.isArray(j.prompt_order) ? j.prompt_order.flatMap((o) => (Array.isArray(o?.order) ? o.order : [])) : [];
      const enabled = new Map(order.map((o) => [o.identifier, o.enabled !== false]));
      const parts = j.prompts
        .filter((p) => p && typeof p.content === "string" && p.content.trim() && (enabled.size ? enabled.get(p.identifier) !== false : p.enabled !== false))
        .map((p) => (p.name ? `【${p.name}】\n` : "") + p.content.trim());
      if (parts.length) return parts.join("\n\n");
    }
    // 酒馆角色卡
    const d = j.data && typeof j.data === "object" ? j.data : j;
    if (d.description || d.personality || d.scenario || d.first_mes) {
      return [d.description, d.personality && "性格：" + d.personality, d.scenario && "场景：" + d.scenario, d.mes_example && "对话示例：\n" + d.mes_example, d.system_prompt]
        .filter(Boolean)
        .join("\n\n");
    }
    // 酒馆世界书
    if (j.entries && typeof j.entries === "object") {
      const es = Object.values(j.entries).filter((e) => e && e.content);
      if (es.length) return es.map((e) => (e.comment || (e.key || e.keys || []).join?.("、") ? `【${e.comment || (e.key || e.keys).join("、")}】\n` : "") + e.content).join("\n\n");
    }
    for (const k of ["content", "prompt", "text", "system_prompt", "instruction", "value", "main_prompt", "jailbreak", "css", "style", "persona", "description"]) {
      if (typeof j[k] === "string" && j[k].trim()) return j[k];
    }
    // 思维链三栏一起导入：{ im, offline, group }
    if (hint && typeof j[hint] === "string") return j[hint];
    return JSON.stringify(j, null, 2);
  }
  async function readFileAsText(file, hint) {
    if (file.size > MAX) throw new Error("文件太大了（超过 8MB）");
    const name = file.name.toLowerCase();
    if (/\.docx$/.test(name)) return docxText(await file.arrayBuffer());
    if (/\.doc$/.test(name)) throw new Error("老的 .doc 读不了，请在 Word / WPS 里另存为 .docx");
    if (/\.(pdf|pages)$/.test(name)) throw new Error("暂不支持这个格式，请复制成 txt 或另存为 docx");
    const raw = await file.text();
    if (/\.json$/.test(name) || /^\s*[{[]/.test(raw)) {
      try {
        return { json: JSON.parse(raw), text: jsonText(JSON.parse(raw), hint) };
      } catch (_) {
        if (/\.json$/.test(name)) throw new Error("JSON 格式有错，打不开");
      }
    }
    return raw.replace(/^﻿/, "");
  }

  /* ───── 填进输入框 ───── */
  function fill(ta, text, mode) {
    const v = mode === "append" && ta.value.trim() ? ta.value.replace(/\s+$/, "") + "\n\n" + text : text;
    ta.value = v;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.dispatchEvent(new Event("change", { bubbles: true }));
    try {
      ta.focus();
      ta.setSelectionRange(0, 0);
      ta.scrollTop = 0;
    } catch (_) {
      /* ignore */
    }
  }
  function askMode(label) {
    return new Promise((ok) => {
      const F = window.XXJ_FUN;
      if (!F?.openSheet) return ok(confirm(`「${label}」里已经有内容了。\n确定 = 替换掉；取消 = 接在后面`) ? "replace" : "append");
      const sh = F.openSheet(
        `<p class="fun-note">「${label}」里已经有内容了，导入的内容要怎么放？</p>
         <div class="fun-sheet-actions"><button type="button" class="fun-btn ghost" data-m="append">接在后面</button><button type="button" class="fun-btn solid" data-m="replace">替换掉</button></div>`,
        { title: "导入" }
      );
      let done = false;
      sh.body.addEventListener("click", (e) => {
        const m = e.target.closest("[data-m]")?.dataset.m;
        if (!m) return;
        done = true;
        sh.close();
        ok(m);
      });
      const oc = sh.close;
      sh.close = () => {
        oc();
        if (!done) ok("");
      };
    });
  }
  const THINK = { "settings-global-thinking-chain-im": "im", "settings-global-thinking-chain-offline": "offline", "settings-global-thinking-chain-group": "group" };

  async function importInto(id, label) {
    const ta = document.getElementById(id);
    if (!ta) return;
    const fi = document.createElement("input");
    fi.type = "file";
    fi.accept = ACCEPT;
    fi.onchange = async () => {
      const f = fi.files?.[0];
      if (!f) return;
      try {
        const got = await readFileAsText(f, THINK[id]);
        const json = typeof got === "object" ? got.json : null;
        let text = String(typeof got === "object" ? got.text : got || "").trim();
        // 思维链 JSON 里三栏都有：一次填三个
        if (json && THINK[id] && typeof json === "object" && ["im", "offline", "group"].some((k) => typeof json[k] === "string")) {
          for (const [tid, k] of Object.entries(THINK)) {
            const t2 = document.getElementById(tid);
            if (t2 && typeof json[k] === "string") fill(t2, json[k], "replace");
          }
          toast("思维链三栏都导入了，记得点「保存」");
          return;
        }
        if (!text) return toast("文件里没有读到文字");
        let mode = "replace";
        if (ta.value.trim()) {
          mode = await askMode(label);
          if (!mode) return;
        }
        fill(ta, text, mode);
        toast(`已导入「${f.name}」（${text.length} 字）${hasSaveBtnNear(ta) ? "，记得点保存" : ""}`);
      } catch (err) {
        toast(err.message || "导入失败");
      }
    };
    fi.click();
  }
  function hasSaveBtnNear(ta) {
    const box = ta.closest("section, .settings-section, .chat-detail-field, .modal, form, .widget") || ta.parentElement;
    return !!box && /保存|应用|确定/.test(box.textContent || "");
  }

  /* ───── 加按钮 ───── */
  function addBtn(id, label) {
    const ta = document.getElementById(id);
    if (!ta || ta.dataset.mxImp) return;
    ta.dataset.mxImp = "1";
    const bar = document.createElement("div");
    bar.className = "mx-imp-bar";
    bar.innerHTML = `<button type="button" class="mx-imp-btn" title="导入 txt / json / docx"><i class="ph ph-file-arrow-up" aria-hidden="true"></i>导入文件<small>txt · json · docx</small></button>`;
    bar.querySelector("button").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void importInto(id, label);
    });
    ta.insertAdjacentElement("afterend", bar);
  }
  function scan() {
    for (const [id, label] of Object.entries(TARGETS)) addBtn(id, label);
  }
  scan();
  // 有些输入框是后面才画出来的
  if (window.MutationObserver) {
    let t = 0;
    new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(scan, 300);
    }).observe(document.body, { childList: true, subtree: true });
  }

  window.MX_IMPORT = { readFileAsText, jsonText, importInto, docxText };
})();
