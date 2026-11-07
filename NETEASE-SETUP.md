# 网易云曲库接入（一次性设置，5 分钟）

Meow OS 的「音乐 → 搜歌」要借 Supabase 的一个小函数去网易云搜歌（浏览器不能直接访问网易云接口）。
只需要站长设置一次，所有用户都能用。

## 步骤

1. 打开 Supabase 控制台，进入你的项目（和资源站同一个项目）。
2. 左边栏点 **Edge Functions** → 右上角 **Deploy a new function** → 选 **Via Editor**。
3. 函数名字填 **`netease`**（必须是这个名字，全小写）。
4. 把编辑器里原来的代码全删掉，粘贴仓库里 `supabase/functions/netease/index.ts` 的全部内容。
5. 点 **Deploy function**，等它显示部署成功。
6. 进入这个函数的 **Details / Settings**，把 **Enforce JWT verification（验证 JWT）关掉**，保存。
   （资源站用的是新版 publishable key，不关的话会被拦住。）

## 检查

浏览器打开（把网址换成你自己的）：

```
https://hmnfcbkrzfwsofhhpmxu.supabase.co/functions/v1/netease?type=search&s=晴天
```

能看到一串带歌名的文字，就成功了。回到 Meow OS → 音乐 → 搜歌，默认就是网易云曲库。

## 说明

- 免费歌曲可以在 Meow OS 里直接听完整版（用的是网易云官方外链）。
- VIP / 付费歌曲**不做破解**：会标「VIP」，点了会跳到网易云 App 用你自己的会员听。
- 函数免费额度：每月 50 万次调用，个人用完全够。
