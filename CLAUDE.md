# Meow 开发约定

- 用户用中文交流，回复用中文。
- **每次发版都要在 `changelog.js` 的 `CHANGELOG` 最前面加一条更新公告**（`v` 递增、写日期、用户看得懂的大白话），并把 `db.js` 里 `changelog.js?v=` 加 1。
- 改了 app.js 要把 `db.js` 的 `ASSET_V` 加 1；改了别的带 `?v=` 的文件要把版本号加 1；每次发版把 `sw.js` 的 `CACHE_NAME` 加 1（手机端是缓存优先）。
- 只能内嵌 Supabase 的 anon / publishable key，不能放 service_role。
- 不做破解 / 绕过会员的音乐源。
