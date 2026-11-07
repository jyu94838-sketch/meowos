/**
 * Meow OS 开场动画：白色噪点小猫
 * 黑底雪花 → 噪点聚成一团毛茸茸、若隐若现的小猫轮廓 → 淡出到原开屏
 * 点击任意处跳过；系统开启「减少动态效果」时不播放。
 */
(function () {
  "use strict";
  var reduced = false;
  try {
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (_) {}
  if (reduced) return;

  var wrap = document.createElement("div");
  wrap.id = "boot-cat";
  wrap.setAttribute("aria-hidden", "true");
  wrap.style.cssText =
    "position:fixed;inset:0;z-index:10060;background:#0b0b0e;transition:opacity .7s ease;cursor:pointer;-webkit-tap-highlight-color:transparent";
  var cv = document.createElement("canvas");
  cv.style.cssText = "width:100%;height:100%;display:block";
  wrap.appendChild(cv);
  (document.body || document.documentElement).appendChild(wrap);
  var ctx = cv.getContext("2d");

  var W = 0,
    H = 0,
    DPR = Math.min(2, window.devicePixelRatio || 1);
  var pts = [];
  var cx = 0,
    cy = 0,
    S = 1; // 小猫的中心和缩放
  var tailBase = { x: 0, y: 0 };
  var start = performance.now();
  var done = false;

  /* ── 用路径画一只坐着的小猫轮廓（原创几何造型），再采样成点 ── */
  function drawCat(c, size) {
    var u = size / 100; // 以 100×100 为设计稿
    c.save();
    c.fillStyle = "#fff";
    c.beginPath();
    // 身体（坐姿，水滴形）
    c.moveTo(50 * u, 40 * u);
    c.bezierCurveTo(74 * u, 42 * u, 80 * u, 72 * u, 76 * u, 92 * u);
    c.quadraticCurveTo(50 * u, 98 * u, 24 * u, 92 * u);
    c.bezierCurveTo(20 * u, 72 * u, 26 * u, 42 * u, 50 * u, 40 * u);
    c.fill();
    // 头
    c.beginPath();
    c.ellipse(50 * u, 32 * u, 21 * u, 18 * u, 0, 0, Math.PI * 2);
    c.fill();
    // 耳朵
    c.beginPath();
    c.moveTo(31 * u, 26 * u);
    c.lineTo(30 * u, 6 * u);
    c.lineTo(45 * u, 17 * u);
    c.closePath();
    c.moveTo(69 * u, 26 * u);
    c.lineTo(70 * u, 6 * u);
    c.lineTo(55 * u, 17 * u);
    c.closePath();
    c.fill();
    // 前爪
    c.beginPath();
    c.ellipse(41 * u, 93 * u, 7 * u, 4 * u, 0, 0, Math.PI * 2);
    c.ellipse(59 * u, 93 * u, 7 * u, 4 * u, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
  function drawTail(c, size) {
    var u = size / 100;
    c.save();
    c.strokeStyle = "#fff";
    c.lineCap = "round";
    c.lineWidth = 7 * u;
    c.beginPath();
    c.moveTo(74 * u, 88 * u);
    c.bezierCurveTo(96 * u, 86 * u, 98 * u, 62 * u, 86 * u, 52 * u);
    c.stroke();
    c.restore();
  }
  // 圆眼睛：平时是空的，眨眼时被噪点填上；左上角留一点噪点当高光
  function inEye(x, y) {
    var e = [
      [41, 31],
      [59, 31]
    ];
    for (var i = 0; i < 2; i++) {
      var hx = x - (e[i][0] - 1.4),
        hy = y - (e[i][1] - 1.6);
      if (hx * hx + hy * hy <= 1.6) return false; // 高光
      var dx = (x - e[i][0]) / 4.4,
        dy = (y - e[i][1]) / 4.8;
      if (dx * dx + dy * dy <= 1) return true;
    }
    return false;
  }
  // 鼻子小三角也留空
  function inNose(x, y) {
    return y > 37 && y < 40.5 && Math.abs(x - 50) < (40.5 - y) * 0.9;
  }

  function sample() {
    var size = Math.min(W, H) * 0.62;
    S = size;
    cx = W / 2 - size * 0.52;
    cy = H / 2 - size * 0.62;
    var off = document.createElement("canvas");
    var n = 220;
    off.width = off.height = n;
    var oc = off.getContext("2d");
    var gap = Math.max(2, Math.round(n / 95)); // 采样密度
    var make = function (isTail) {
      oc.clearRect(0, 0, n, n);
      if (isTail) drawTail(oc, n);
      else drawCat(oc, n);
      var data = oc.getImageData(0, 0, n, n).data;
      var out = [];
      for (var y = 0; y < n; y += gap) {
        for (var x = 0; x < n; x += gap) {
          if (data[(y * n + x) * 4 + 3] > 128) {
            var jx = x + Math.random() * gap,
              jy = y + Math.random() * gap;
            out.push([(jx / n) * 100, (jy / n) * 100]);
          }
        }
      }
      return out;
    };
    var body = make(false);
    var tail = make(true);
    pts = [];
    var push = function (p, kind) {
      var tx = cx + (p[0] / 100) * size,
        ty = cy + (p[1] / 100) * size;
      pts.push({
        tx: tx,
        ty: ty,
        ux: p[0],
        uy: p[1],
        sx: Math.random() * W,
        sy: Math.random() * H,
        d: Math.random() * 0.55, // 每个点的出发延迟
        cap: Math.random() < 0.2 ? 0.55 + Math.random() * 0.35 : 1, // 大部分点聚成轮廓，约两成散在外面形成毛茸茸的边
        ph: Math.random() * Math.PI * 2,
        a: 0.55 + Math.random() * 0.45,
        r: (0.9 + Math.random() * 1.1) * DPR,
        k: kind
      });
    };
    body.forEach(function (p) {
      if (inNose(p[0], p[1])) return;
      push(p, inEye(p[0], p[1]) ? "eye" : "body");
    });
    tail.forEach(function (p) {
      push(p, "tail");
    });
    tailBase = { x: cx + 0.74 * size, y: cy + 0.88 * size };
  }

  function resize() {
    W = Math.round(window.innerWidth * DPR);
    H = Math.round(window.innerHeight * DPR);
    cv.width = W;
    cv.height = H;
    sample();
  }

  var ease = function (t) {
    return t < 0 ? 0 : t > 1 ? 1 : 1 - Math.pow(1 - t, 3);
  };

  function frame(now) {
    if (done) return;
    var t = (now - start) / 1000;
    ctx.fillStyle = "#0b0b0e";
    ctx.fillRect(0, 0, W, H);

    // 1) 背景雪花：开头满屏，随后逐渐褪去
    var staticAmt = t < 0.9 ? 1 : Math.max(0.12, 1 - (t - 0.9) / 1.3);
    var nStatic = Math.floor((W * H) / (900 * DPR * DPR) * staticAmt);
    for (var i = 0; i < nStatic; i++) {
      var g = (Math.random() * 255) | 0;
      ctx.fillStyle = "rgba(" + g + "," + g + "," + g + "," + (0.35 * staticAmt).toFixed(3) + ")";
      ctx.fillRect(Math.random() * W, Math.random() * H, 1.5 * DPR, 1.5 * DPR);
    }

    // 2) 噪点聚成小猫
    var gather = (t - 0.7) / 1.6; // 0.7s 开始聚拢，约 2.3s 成形
    var sway = Math.sin(t * 2.2) * 0.12 * ease((t - 1.4) / 0.6);
    var cs = Math.cos(sway),
      sn = Math.sin(sway);
    for (var j = 0; j < pts.length; j++) {
      var p = pts[j];
      var e = ease((gather - p.d) / (1 - 0.55)) * p.cap;
      var tx = p.tx,
        ty = p.ty;
      if (p.k === "tail") {
        var dx = tx - tailBase.x,
          dy = ty - tailBase.y;
        tx = tailBase.x + dx * cs - dy * sn;
        ty = tailBase.y + dx * sn + dy * cs;
      }
      // 没完全聚拢的点继续缓缓飘动
      var drift = (1 - e) * 6 * DPR;
      var x = p.sx + (tx - p.sx) * e + Math.sin(t * 1.3 + p.ph) * drift + (Math.random() - 0.5) * 1.4 * DPR;
      var y = p.sy + (ty - p.sy) * e + Math.cos(t * 1.1 + p.ph) * drift + (Math.random() - 0.5) * 1.4 * DPR;
      var flick = 0.75 + Math.random() * 0.25;
      ctx.fillStyle = "rgba(255,255,255," + (p.a * flick).toFixed(3) + ")";
      ctx.fillRect(x, y, p.r, p.r);
    }

    if (t > 3.5) return finish();
    requestAnimationFrame(frame);
  }

  function finish() {
    if (done) return;
    done = true;
    wrap.style.opacity = "0";
    wrap.style.pointerEvents = "none";
    setTimeout(function () {
      wrap.remove();
    }, 750);
    window.removeEventListener("resize", resize);
  }

  wrap.addEventListener("click", finish);
  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(frame);
})();
