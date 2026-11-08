"use strict";

/**
 * 天气 · 温度、体感温度、风向风力、湿度、紫外线、逐小时 / 7 天预报
 * 还会根据体感温度、下雨、风和紫外线推荐 uu 今天穿什么出门；也可以让角色按人设帮你搭
 * 数据来自 Open-Meteo（免费、不用 Key）；城市可以搜，也可以用手机定位
 */
(function () {
  const F = window.XXJ_FUN;
  if (!F) return;
  const { esc, toast } = F;
  const KEY = "meowos_weather_v1";

  let S;
  try {
    S = JSON.parse(localStorage.getItem(KEY) || "null");
  } catch (_) {
    S = null;
  }
  if (!S || typeof S !== "object") S = {};
  S.cities ||= [];
  S.cur ||= 0;
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch (_) {
      /* ignore */
    }
  };

  /* ───── 天气代码 ───── */
  const WMO = {
    0: ["晴", "☀️", "🌙"],
    1: ["大致晴朗", "🌤️", "🌙"],
    2: ["多云", "⛅", "☁️"],
    3: ["阴", "☁️", "☁️"],
    45: ["雾", "🌫️"],
    48: ["雾凇", "🌫️"],
    51: ["小毛毛雨", "🌦️"],
    53: ["毛毛雨", "🌦️"],
    55: ["较大毛毛雨", "🌧️"],
    56: ["冻毛毛雨", "🌧️"],
    57: ["冻毛毛雨", "🌧️"],
    61: ["小雨", "🌦️"],
    63: ["中雨", "🌧️"],
    65: ["大雨", "🌧️"],
    66: ["冻雨", "🌧️"],
    67: ["冻雨", "🌧️"],
    71: ["小雪", "🌨️"],
    73: ["中雪", "🌨️"],
    75: ["大雪", "❄️"],
    77: ["雪粒", "🌨️"],
    80: ["阵雨", "🌦️"],
    81: ["阵雨", "🌧️"],
    82: ["强阵雨", "⛈️"],
    85: ["阵雪", "🌨️"],
    86: ["强阵雪", "❄️"],
    95: ["雷阵雨", "⛈️"],
    96: ["雷阵雨伴冰雹", "⛈️"],
    99: ["强雷阵雨伴冰雹", "⛈️"]
  };
  const wText = (c) => (WMO[c] || ["未知"])[0];
  const wIcon = (c, day) => {
    const w = WMO[c] || ["", "🌡️"];
    return day === 0 && w[2] ? w[2] : w[1];
  };
  const isRain = (c) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;
  const isSnow = (c) => (c >= 71 && c <= 77) || c === 85 || c === 86;
  const DIRS = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  const windDir = (deg) => DIRS[Math.round(((Number(deg) || 0) % 360) / 45) % 8] + "风";
  /** km/h → 风力等级 */
  const beaufort = (kmh) => {
    const ms = (Number(kmh) || 0) / 3.6;
    const lim = [0.3, 1.6, 3.4, 5.5, 8, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
    let i = 0;
    while (i < lim.length && ms >= lim[i]) i++;
    return i;
  };
  const uvText = (u) => (u < 3 ? "弱" : u < 6 ? "中等" : u < 8 ? "强" : u < 11 ? "很强" : "极强");

  /* ───── 接口 ───── */
  async function getJson(url) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 12000);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }
  async function searchCity(q) {
    const j = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=zh&format=json`);
    return (j.results || []).map((x) => ({ name: x.name, area: [x.admin1, x.country].filter(Boolean).join(" · "), lat: x.latitude, lon: x.longitude }));
  }
  async function reverseName(lat, lon) {
    try {
      const j = await getJson(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`);
      return { name: j.city || j.locality || j.principalSubdivision || "我的位置", area: [j.principalSubdivision, j.countryName].filter(Boolean).join(" · ") };
    } catch (_) {
      return { name: "我的位置", area: `${lat.toFixed(2)}, ${lon.toFixed(2)}` };
    }
  }
  const cache = new Map();
  async function forecast(c, force) {
    const k = `${c.lat.toFixed(3)},${c.lon.toFixed(3)}`;
    const hit = cache.get(k);
    if (hit && !force && Date.now() - hit.at < 10 * 60 * 1000) return hit.data;
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,is_day,uv_index,pressure_msl` +
      `&hourly=temperature_2m,apparent_temperature,weather_code,precipitation_probability,is_day` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,uv_index_max,sunrise,sunset,wind_speed_10m_max` +
      `&timezone=auto&forecast_days=7`;
    const data = await getJson(url);
    cache.set(k, { at: Date.now(), data });
    return data;
  }

  /* ───── 穿搭推荐 ───── */
  function outfit(d) {
    const cur = d.current;
    const D = d.daily;
    const lo = Math.min(cur.apparent_temperature, D.apparent_temperature_min[0]);
    const hi = Math.max(cur.apparent_temperature, D.apparent_temperature_max[0]);
    const feel = cur.apparent_temperature;
    const rainP = D.precipitation_probability_max[0] || 0;
    const uv = D.uv_index_max[0] || 0;
    const wind = beaufort(Math.max(cur.wind_speed_10m, D.wind_speed_10m_max[0] || 0));
    const code = cur.weather_code;
    let level;
    let main;
    let items;
    if (feel >= 30) {
      level = "炎热";
      main = "怎么凉快怎么穿";
      items = ["短袖 / 吊带 / 背心", "短裤、短裙或薄款阔腿裤", "凉鞋或透气的帆布鞋", "浅色、宽松、棉麻或速干面料"];
    } else if (feel >= 25) {
      level = "热";
      main = "短袖就好";
      items = ["短袖 T 恤或薄衬衫", "薄长裤、牛仔短裤或半身裙", "透气运动鞋 / 凉鞋"];
    } else if (feel >= 20) {
      level = "舒适";
      main = "长袖薄款正合适";
      items = ["长袖 T 恤 / 薄衬衫 / 薄针织", "牛仔裤、休闲裤或长裙", "运动鞋 / 小白鞋"];
    } else if (feel >= 15) {
      level = "微凉";
      main = "加一件薄外套";
      items = ["长袖打底 + 薄外套（牛仔外套、开衫、风衣）", "长裤", "运动鞋 / 乐福鞋"];
    } else if (feel >= 10) {
      level = "凉";
      main = "外套要带上";
      items = ["卫衣 / 毛衣", "夹克、风衣或薄呢大衣", "长裤，裙子记得搭厚一点的袜子", "包脚的鞋"];
    } else if (feel >= 5) {
      level = "冷";
      main = "该穿厚外套了";
      items = ["毛衣或加绒卫衣", "呢大衣 / 薄羽绒服 / 棉服", "加绒裤或保暖打底", "短靴 / 运动鞋"];
    } else if (feel >= -5) {
      level = "很冷";
      main = "羽绒服安排上";
      items = ["保暖内衣 + 毛衣", "厚羽绒服", "加厚长裤", "围巾、手套、帽子", "防滑保暖的鞋"];
    } else {
      level = "严寒";
      main = "能穿多厚穿多厚";
      items = ["保暖内衣 + 厚毛衣", "长款加厚羽绒服", "加厚棉裤", "帽子、围巾、手套、口罩全副武装", "雪地靴"];
    }
    const extra = [];
    if (hi - lo >= 8) extra.push(`早晚和中午差得多（体感 ${Math.round(lo)}° ~ ${Math.round(hi)}°），穿方便穿脱的外套，洋葱式穿法`);
    if (isRain(code) || rainP >= 50) extra.push(`今天下雨概率 ${rainP}%，记得带伞☔，鞋子别穿怕湿的`);
    else if (rainP >= 30) extra.push(`可能会下雨（${rainP}%），包里塞把折叠伞`);
    if (isSnow(code)) extra.push("下雪啦，穿防滑的鞋，小心路面");
    if (wind >= 5) extra.push(`风比较大（${wind} 级），外套选防风的，长发可以扎起来`);
    if (uv >= 6) extra.push(`紫外线${uvText(uv)}，出门涂防晒，戴帽子或带遮阳伞🕶️`);
    else if (uv >= 3 && feel >= 20) extra.push("有点晒，记得涂防晒");
    if (cur.relative_humidity_2m >= 85 && feel >= 25) extra.push("又闷又潮，选透气速干的面料");
    if (cur.relative_humidity_2m <= 30) extra.push("空气很干，多喝水、带上润唇膏");
    return { level, main, items, extra, feel };
  }

  /* ───── 界面 ───── */
  let root = null;
  let busy = false;
  let lastData = null;
  let advice = "";
  const curCity = () => S.cities[S.cur] || S.cities[0] || null;
  const fmtH = (s) => String(s).slice(11, 13) + "时";
  const fmtD = (s, i) => (i === 0 ? "今天" : i === 1 ? "明天" : "周" + "日一二三四五六"[new Date(s + "T00:00").getDay()]);
  const bgOf = (code, day) => {
    if (!day) return "wx-night";
    if (isRain(code)) return "wx-rain";
    if (isSnow(code)) return "wx-snow";
    if (code >= 2) return "wx-cloud";
    return "wx-sun";
  };

  async function render(force) {
    if (!root) return;
    const c = curCity();
    if (!c) {
      root.innerHTML = `<div class="wx wx-empty"><div class="wx-hero wx-sun"><div class="wx-big">⛅</div><p>先选一个城市吧</p></div>
        <button type="button" class="fun-btn solid wide" data-a="locate">📍 用我现在的位置</button>
        <button type="button" class="fun-btn ghost wide" data-a="add">🔍 搜索城市</button>
        <p class="fun-note">天气数据来自 Open-Meteo。定位只用来查天气，不会存到别处。</p></div>`;
      return;
    }
    if (!lastData || force) root.innerHTML = `<div class="wx"><p class="fun-note" style="text-align:center;padding:40px 0">正在获取 ${esc(c.name)} 的天气…</p></div>`;
    let d;
    try {
      d = await forecast(c, force);
    } catch (e) {
      root.innerHTML = `<div class="wx"><p class="fun-note" style="text-align:center;padding:30px 0">天气获取失败：${esc(e.message || "网络问题")}<br>换个网络或者稍后再试</p><button type="button" class="fun-btn solid wide" data-a="refresh">重试</button>${citiesBar()}</div>`;
      return;
    }
    lastData = d;
    const cur = d.current;
    const D = d.daily;
    const H = d.hourly;
    const day = cur.is_day;
    const nowIdx = Math.max(0, H.time.findIndex((t) => t >= cur.time.slice(0, 13)));
    const hours = H.time.slice(nowIdx, nowIdx + 24).map((t, i) => ({ t, temp: H.temperature_2m[nowIdx + i], code: H.weather_code[nowIdx + i], p: H.precipitation_probability[nowIdx + i], day: H.is_day[nowIdx + i] }));
    const o = outfit(d);
    const gMin = Math.min(...D.temperature_2m_min);
    const gMax = Math.max(...D.temperature_2m_max);
    const wl = beaufort(cur.wind_speed_10m);
    root.innerHTML = `<div class="wx">
      ${citiesBar()}
      <section class="wx-hero ${bgOf(cur.weather_code, day)}">
        <div class="wx-loc"><b>${esc(c.name)}</b><small>${esc(c.area || "")}</small></div>
        <div class="wx-now"><span class="wx-big">${wIcon(cur.weather_code, day)}</span><div><b class="wx-t">${Math.round(cur.temperature_2m)}°</b><span>${wText(cur.weather_code)}</span></div></div>
        <p class="wx-range">最高 ${Math.round(D.temperature_2m_max[0])}° · 最低 ${Math.round(D.temperature_2m_min[0])}°</p>
        <button type="button" class="wx-refresh" data-a="refresh" title="刷新">↻</button>
      </section>
      <section class="wx-grid">
        <div><small>体感温度</small><b>${Math.round(cur.apparent_temperature)}°</b><em>${cur.apparent_temperature < cur.temperature_2m - 1 ? "比实际冷" : cur.apparent_temperature > cur.temperature_2m + 1 ? "比实际热" : "和实际差不多"}</em></div>
        <div><small>风向风力</small><b>${windDir(cur.wind_direction_10m)} ${wl} 级</b><em>${Math.round(cur.wind_speed_10m)} km/h${cur.wind_gusts_10m ? ` · 阵风 ${beaufort(cur.wind_gusts_10m)} 级` : ""}</em></div>
        <div><small>湿度</small><b>${Math.round(cur.relative_humidity_2m)}%</b><em>${cur.relative_humidity_2m >= 80 ? "潮湿" : cur.relative_humidity_2m <= 35 ? "干燥" : "适中"}</em></div>
        <div><small>紫外线</small><b>${uvText(D.uv_index_max[0] || 0)}</b><em>指数 ${Math.round(D.uv_index_max[0] || 0)}</em></div>
        <div><small>降水概率</small><b>${D.precipitation_probability_max[0] ?? 0}%</b><em>${cur.precipitation ? `现在 ${cur.precipitation} mm` : "今天最高"}</em></div>
        <div><small>日出 / 日落</small><b>${String(D.sunrise[0]).slice(11)}</b><em>${String(D.sunset[0]).slice(11)} 日落</em></div>
      </section>
      <section class="wx-card wx-outfit">
        <h3>👗 今天推荐 uu 穿什么</h3>
        <p class="wx-o-main"><span class="wx-tag">${o.level}</span>体感 ${Math.round(o.feel)}°，${o.main}</p>
        <ul>${o.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        ${o.extra.length ? `<div class="wx-tips">${o.extra.map((x) => `<p>💡 ${esc(x)}</p>`).join("")}</div>` : ""}
        ${advice ? `<div class="wx-say">${advice}</div>` : ""}
        <button type="button" class="fun-btn ghost wide" data-a="ask" ${busy ? "disabled" : ""}>${busy ? "TA 正在想…" : "💌 让 TA 帮我搭配一下"}</button>
      </section>
      <section class="wx-card"><h3>逐小时</h3><div class="wx-hours">${hours
        .map((h, i) => `<div><small>${i === 0 ? "现在" : fmtH(h.t)}</small><span>${wIcon(h.code, h.day)}</span><b>${Math.round(h.temp)}°</b>${h.p >= 20 ? `<em>${h.p}%</em>` : "<em></em>"}</div>`)
        .join("")}</div></section>
      <section class="wx-card"><h3>7 天预报</h3>${D.time
        .map((t, i) => {
          const a = ((D.temperature_2m_min[i] - gMin) / Math.max(1, gMax - gMin)) * 100;
          const b = ((D.temperature_2m_max[i] - gMin) / Math.max(1, gMax - gMin)) * 100;
          return `<div class="wx-day"><span class="wx-dn">${fmtD(t, i)}</span><span class="wx-di">${wIcon(D.weather_code[i], 1)}</span><span class="wx-dp">${D.precipitation_probability_max[i] >= 20 ? D.precipitation_probability_max[i] + "%" : ""}</span><span class="wx-dl">${Math.round(D.temperature_2m_min[i])}°</span><span class="wx-bar"><i style="left:${a}%;right:${100 - b}%"></i></span><span class="wx-dh">${Math.round(D.temperature_2m_max[i])}°</span></div>`;
        })
        .join("")}</section>
      <p class="fun-note">数据来自 Open-Meteo，每 10 分钟更新。穿搭建议按体感温度、下雨、风力和紫外线推算，仅供参考～</p>
    </div>`;
  }
  function citiesBar() {
    return `<div class="wx-cities">${S.cities
      .map((c, i) => `<button type="button" class="${i === S.cur ? "is-on" : ""}" data-city="${i}">${c.gps ? "📍" : ""}${esc(c.name)}</button>`)
      .join("")}<button type="button" data-a="add">＋</button>${S.cities.length ? `<button type="button" data-a="manage">⋯</button>` : ""}</div>`;
  }

  function locate() {
    if (!navigator.geolocation) return toast("这个浏览器不支持定位，搜城市吧");
    toast("正在定位…");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const n = await reverseName(lat, lon);
        S.cities = S.cities.filter((c) => !c.gps);
        S.cities.unshift({ ...n, lat, lon, gps: true });
        S.cur = 0;
        save();
        lastData = null;
        advice = "";
        render(true);
      },
      (err) => toast(err && err.code === 1 ? "没有定位权限，可以在系统设置里打开，或者直接搜城市" : "定位失败，搜城市吧"),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60 * 1000 }
    );
  }
  function addCity() {
    const sh = F.openSheet(
      `<div class="wx-search"><input type="search" id="wx-q" placeholder="城市名，比如 上海 / 杭州 / Tokyo" enterkeyhint="search"/><button type="button" class="fun-btn solid sm" data-x="go">搜索</button></div>
       <button type="button" class="fun-btn ghost wide" data-x="gps">📍 用我现在的位置</button>
       <div class="wx-res" id="wx-res"></div>`,
      { title: "添加城市" }
    );
    const q = sh.body.querySelector("#wx-q");
    const res = sh.body.querySelector("#wx-res");
    let list = [];
    const go = async () => {
      const v = q.value.trim();
      if (!v) return;
      res.innerHTML = `<p class="fun-note">搜索中…</p>`;
      try {
        list = await searchCity(v);
        res.innerHTML = list.length ? list.map((c, i) => `<button type="button" data-pick="${i}"><b>${esc(c.name)}</b><small>${esc(c.area)}</small></button>`).join("") : `<p class="fun-note">没找到，换个写法试试（中文或拼音都可以）</p>`;
      } catch (_) {
        res.innerHTML = `<p class="fun-note">网络有点问题，稍后再试</p>`;
      }
    };
    q.addEventListener("keydown", (e) => e.key === "Enter" && go());
    sh.body.addEventListener("click", (e) => {
      const x = e.target.closest("[data-x]")?.dataset.x;
      if (x === "go") return go();
      if (x === "gps") {
        sh.close();
        return locate();
      }
      const p = e.target.closest("[data-pick]");
      if (p) {
        const c = list[Number(p.dataset.pick)];
        const i = S.cities.findIndex((y) => Math.abs(y.lat - c.lat) < 0.01 && Math.abs(y.lon - c.lon) < 0.01);
        if (i >= 0) S.cur = i;
        else {
          S.cities.push(c);
          S.cur = S.cities.length - 1;
        }
        save();
        sh.close();
        lastData = null;
        advice = "";
        render(true);
      }
    });
    setTimeout(() => q.focus(), 200);
  }
  function manage() {
    const sh = F.openSheet(
      `<div class="wx-res">${S.cities.map((c, i) => `<div class="wx-mrow"><b>${c.gps ? "📍" : ""}${esc(c.name)}</b><small>${esc(c.area || "")}</small><button type="button" class="fun-btn ghost sm" data-del="${i}">删除</button></div>`).join("")}</div>`,
      { title: "管理城市" }
    );
    sh.body.addEventListener("click", (e) => {
      const d = e.target.closest("[data-del]");
      if (!d) return;
      S.cities.splice(Number(d.dataset.del), 1);
      S.cur = 0;
      save();
      sh.close();
      lastData = null;
      advice = "";
      render(true);
    });
  }
  async function askChar() {
    if (!lastData) return;
    if (!F.hasApiKey()) return toast("要先在设置里填 API Key，TA 才能帮你搭");
    const cast = await F.loadCast();
    if (!cast.length) return toast("角色库里还没有角色");
    const sh = F.openSheet(`<div class="mm-to">${cast.map((c) => `<button type="button" class="pt-person" data-char="${esc(c.id)}">${F.avHtml(c, "fun-av")}<strong>${esc(c.name)}</strong></button>`).join("")}</div>`, { title: "让谁帮你搭？" });
    sh.body.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-char]");
      if (!b) return;
      const ch = cast.find((c) => c.id === b.dataset.char);
      sh.close();
      const user = await F.loadUser();
      const d = lastData;
      const o = outfit(d);
      const c = curCity();
      busy = true;
      render();
      try {
        const txt = await F.aiText(
          [
            {
              role: "system",
              content: `你是「${ch.name}」。${ch.persona ? "人设：\n" + ch.persona + "\n" : ""}现在「${user.name || "uu"}」${user.gender ? `（${user.gender}生）` : ""}要出门，你看了天气，用你的人设和语气关心 TA，并给出具体的穿搭建议（上衣、外套、下装、鞋、配件），可以带一点撒娇或碎碎念。口语化，3~5 句，不要分点列表，不要加名字前缀，不要输出思考过程。`
            },
            {
              role: "user",
              content: `${c.name}现在 ${Math.round(d.current.temperature_2m)}°，体感 ${Math.round(d.current.apparent_temperature)}°，${wText(d.current.weather_code)}，${windDir(d.current.wind_direction_10m)} ${beaufort(d.current.wind_speed_10m)} 级，湿度 ${Math.round(d.current.relative_humidity_2m)}%。今天最高 ${Math.round(d.daily.temperature_2m_max[0])}°、最低 ${Math.round(d.daily.temperature_2m_min[0])}°，降水概率 ${d.daily.precipitation_probability_max[0] ?? 0}%，紫外线${uvText(d.daily.uv_index_max[0] || 0)}。参考：${o.main}；${o.extra.join("；")}`
            }
          ],
          { maxTokens: 500, temperature: 0.9 }
        );
        advice = `${F.avHtml(ch, "fun-av sm")}<p><b>${esc(ch.name)}</b>：${esc(F.cleanLine(txt, 400, ch.name))}</p>`;
      } catch (err) {
        toast(err.message || "TA 没想好，再试一次");
      } finally {
        busy = false;
        render();
      }
    });
  }

  function onClick(e) {
    const ci = e.target.closest("[data-city]");
    if (ci) {
      S.cur = Number(ci.dataset.city);
      save();
      lastData = null;
      advice = "";
      return render(false);
    }
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "locate") return locate();
    if (a === "add") return addCity();
    if (a === "manage") return manage();
    if (a === "refresh") {
      lastData = null;
      return render(true);
    }
    if (a === "ask") return void askChar();
  }

  F.register("天气", {
    title: "天气",
    kicker: "WEATHER",
    async mount(body) {
      root = document.createElement("div");
      body.appendChild(root);
      root.addEventListener("click", onClick);
      render(false);
    },
    unmount() {
      root = null;
    }
  });
})();
