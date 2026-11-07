"use strict";

/**
 * 「导入 SillyTavern 卡」专属激活码
 * - 激活码存在 Supabase（st-codes.sql），网页只能调用兑换函数 mx_redeem_code
 * - 每台设备一个随机 ID，同一台设备重复激活不重复计数
 * - 激活成功后记在本机 localStorage("meowos_st_unlock")
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast } = F;
  const UNLOCK_KEY = "meowos_st_unlock";
  const DEVICE_KEY = "meowos_device_id";

  function deviceId() {
    let id = "";
    try {
      id = localStorage.getItem(DEVICE_KEY) || "";
      if (!id) {
        id = "d_" + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
        localStorage.setItem(DEVICE_KEY, id);
      }
    } catch (_) {
      id = "d_" + Date.now().toString(36) + Math.random().toString(36).slice(2);
    }
    return id;
  }

  async function redeem(code) {
    const c = window.MX_SHARE_CONFIG || {};
    const url = String(c.url || "").replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
    const key = c.anonKey || "";
    if (!url || !key) throw new Error("还没有配置激活服务");
    const headers = { "Content-Type": "application/json", apikey: key };
    if (key.startsWith("eyJ")) headers.Authorization = "Bearer " + key;
    const res = await fetch(url + "/rest/v1/rpc/mx_redeem_code", {
      method: "POST",
      headers,
      body: JSON.stringify({ p_code: code, p_device: deviceId() })
    });
    if (res.status === 404) throw new Error("激活服务还没开通（需要先在 Supabase 运行 st-codes.sql）");
    if (!res.ok) throw new Error("网络出错（" + res.status + "）");
    return res.json();
  }

  function openActivate() {
    const sh = F.openSheet(
      `<div class="stg">
        <div class="stg-ico">🔒</div>
        <p class="stg-lead">「导入 SillyTavern 卡」需要专属激活码才能使用。</p>
        <input class="fun-input stg-input" type="text" placeholder="MEOW-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="40" />
        <p class="stg-err" hidden></p>
        <button type="button" class="fun-btn solid stg-go">激活</button>
        <p class="fun-note stg-foot">激活码找发码的人要。激活一次后这台设备就一直能用；清除浏览器数据后需要重新输入（同一台设备不会多占次数）。</p>
      </div>`,
      { title: "输入激活码" }
    );
    const inp = sh.body.querySelector(".stg-input");
    const err = sh.body.querySelector(".stg-err");
    const btn = sh.body.querySelector(".stg-go");
    const showErr = (m) => {
      err.textContent = m;
      err.hidden = !m;
    };
    inp.addEventListener("input", () => {
      const v = inp.value.toUpperCase();
      if (v !== inp.value) inp.value = v;
      showErr("");
    });
    async function go() {
      const code = inp.value.trim();
      if (!code) return showErr("请输入激活码");
      btn.disabled = true;
      btn.textContent = "验证中…";
      try {
        const r = await redeem(code);
        if (!r || !r.ok) {
          showErr((r && r.msg) || "激活码不对");
          return;
        }
        localStorage.setItem(UNLOCK_KEY, "1");
        try {
          if (typeof syncCharStTavernImportLockUi === "function") syncCharStTavernImportLockUi();
        } catch (_) {
          /* ignore */
        }
        sh.close();
        toast("激活成功 🎉 现在可以导入 SillyTavern 卡了");
        setTimeout(() => {
          try {
            if (typeof openCharTavernImportPicker === "function") openCharTavernImportPicker();
          } catch (_) {
            /* ignore */
          }
        }, 300);
      } catch (e) {
        showErr(e.message || "激活失败");
      } finally {
        btn.disabled = false;
        btn.textContent = "激活";
      }
    }
    btn.addEventListener("click", go);
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") go();
    });
    setTimeout(() => inp.focus(), 250);
  }

  window.openMeowStActivate = openActivate;
  // 启动时同步一次按钮的锁定样式
  try {
    if (typeof syncCharStTavernImportLockUi === "function") syncCharStTavernImportLockUi();
  } catch (_) {
    /* ignore */
  }
  void esc;
})();
