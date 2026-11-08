# 资源站（共享广场）开通教程

资源站分两部分：

- **专属资源卡（PNG）**：不需要任何配置，打开就能用。在「资源站 → 制作卡片」把美化 / 世界书 / 角色卡做成一张 PNG，发给别人，对方在「资源站 → 导入」里导入。
- **共享广场**：大家把卡片上传到同一个地方互相浏览、下载。需要站长（你）开通一个免费的 Supabase 云数据库，**只做一次**，大约 10 分钟。

---

## 第 1 步：注册 Supabase，新建项目

1. 打开 <https://supabase.com>，点 **Start your project**，用 GitHub 账号登录最方便。
2. 点 **New project**：
   - **Name**：随便填，比如 `meixinji-share`
   - **Database Password**：点 Generate 生成一个，自己存好（之后基本用不到）
   - **Region**：选离用户近的，比如 **Singapore** 或 **Tokyo**
3. 点 **Create new project**，等 1~2 分钟初始化完成。

## 第 2 步：建表

1. 左侧菜单点 **SQL Editor**（图标像 `>_`）。
2. 点 **New query**。
3. 打开仓库里的 [`supabase-setup.sql`](./supabase-setup.sql)，**全选复制**，粘贴进去。
4. 点右下角 **Run**。看到 `Success. No rows returned` 就成功了。

> 这个脚本可以重复运行，不会删数据。

## 第 3 步：复制两个参数

左侧菜单最下面点 **Project Settings**（齿轮）→ **API**（有的版本叫 **Data API** / **API Keys**），找到：

- **Project URL**：形如 `https://abcdefghijk.supabase.co`
- **anon public** key：一长串 `eyJ...` 开头的字符（新版控制台里也可能叫 **Publishable key**，以 `sb_publishable_` 开头）

> ⚠️ 只复制 **anon / publishable** key，它本来就是公开给网页用的。
> **不要**复制 `service_role` / `secret` key，那个泄露了别人能删光你的数据。

## 第 4 步：填进网站

在 GitHub 上打开仓库里的 `share-config.js`，点右上角的铅笔图标编辑，改成：

```js
window.MX_SHARE_CONFIG = {
  url: "https://你的项目.supabase.co",
  anonKey: "你复制的 anon key"
};
```

点 **Commit changes** 保存。Netlify 连着仓库的话会自动重新部署，一两分钟后刷新网站，资源站的「广场」就能用了。

---

## 常见问题

**免费版够用吗？**
Supabase 免费版有 1GB 文件存储、每月 5GB 流量。一张资源卡大约 300~500KB（带图片的美化卡会更大），广场列表只加载约 15KB 的缩略图，个人或小圈子用足够了。

**为什么广场突然打不开了？**
Supabase 免费项目 **连续 7 天没人访问会自动暂停**。登录 Supabase 控制台，点项目里的 **Restore / Resume** 就能恢复，数据不会丢。

**有人上传了不好的东西怎么办？**
- 任何人都可以点「举报」，被举报 5 次会自动隐藏。
- 站长可以在 Supabase 控制台 → **Table Editor → mx_shares** 里直接删掉那一行；对应的图片在 **Storage → mx-shares** 里删。

**上传的人能删除自己的上传吗？**
可以，在「资源站 → 我的上传」里点开删除。删除凭证只存在上传时用的那台设备上，换设备或清缓存后就删不了了，需要找站长删。

**为什么发到 QQ / 微信后导入不了？**
聊天软件不勾选「原图」会重新压缩图片，藏在图片里的数据就丢了。请发 **原图** 或者 **以文件形式发送**。

**别的网站能读取这些卡片吗？**
卡片数据经过压缩和混淆，放在 PNG 里一个自定义的数据块中，SillyTavern 等其它工具读不出来，只有本站的资源站能导入。不过这只是防止「随手读取」，不是加密保护，懂技术的人仍然可以研究出来，所以不要在卡片里放 API Key 之类的敏感信息（导出时本来也不会带上）。

## 「导入 SillyTavern 卡」激活码

1. Supabase 后台 → SQL Editor → New query，把 `st-codes.sql` 全部内容粘进去 → Run（只需要一次）。
2. 要发码时，新建查询运行：`select * from mx_make_codes(5, 3, '');`
   - 5 = 生成几个码，3 = 每个码能激活几台设备，最后的引号里可以写备注（比如发给谁）。
3. 查看所有码和使用情况：`select code, used, max_uses, note, disabled from mx_codes order by created_at desc;`
4. 停用某个码：`update mx_codes set disabled = true where code = 'MEOW-XXXX-XXXX';`

## 资源站分类

Supabase 后台 → SQL Editor → New query，把 `share-category.sql` 全部内容粘进去 → Run（只需要一次）。
没运行之前资源站照常能用，只是没有分类。


## 一个帖子带多张图片和文件（可选）

想让上传的人在一个帖子里附带效果图、别的资源卡或文件，在 Supabase 的 SQL Editor 里再运行一次 `share-attach.sql`（可以重复运行）。
没运行之前，资源站照常能用，只是上传时加了附件会提示「站长需要先运行 share-attach.sql」。
附件和主卡片一样：别人要先点赞才能下载 / 导入。


## 资源站个人账号（可选）

想让大家在资源站有自己的昵称、头像，上传的东西跟着账号走、上传后还能反复编辑，在 SQL Editor 里再运行一次 `share-account.sql`（可以重复运行，它会顺便把附件字段也补上）。
账号不用邮箱密码：手机里随机生成一串密钥，数据库只存它的 sha256；换手机用「登录码」或 Meow 的备份恢复。


## 帖子评论区（可选）

运行过 `share-account.sql` 之后，再运行一次 `share-comments.sql`，资源站帖子下面就有评论区了：用资源站账号评论、回复别人，作者可以删自己帖子下面的评论，被多人举报的评论会自动隐藏。
