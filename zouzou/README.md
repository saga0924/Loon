# 出去走走 · Loon 自动步数插件

每天自动提交 Zepp 步数到「出去走走」, 不用再打开网页手动点。
分时段渐进: 8:00 / 12:00 / 16:00 / 20:00 慢慢涨, 22:30 提交最终步数 (默认 18000-30000 随机)。

## 文件
- `zouzou.js` — 脚本本体 (不含任何账号密码)
- `chuquzouzou-online.lpx` — 在线插件, 导入后在 Loon 里填一次账号/密码即可 (只存本机)

## 用法
1. 把这两个文件传到你的 GitHub 仓库根目录 (仓库需设为 Public, 否则 Loon 拉不到 raw 文件)。
2. 确认插件里的 script-path 是你的 raw 地址:
   https://raw.githubusercontent.com/<你的用户名>/<仓库名>/main/zouzou.js
3. Loon → 插件 → 从 URL 导入:
   https://raw.githubusercontent.com/<你的用户名>/<仓库名>/main/chuquzouzou-online.lpx
4. 打开插件, 填账号/密码, 先手动运行任意一条「出去走走」脚本, 看通知是否成功。

## 安全
- 账号密码只填在 Loon 插件参数里, 只保存在你手机本地, 不在这个仓库里。
- 本仓库两个文件不含任何私人信息, 可以放心公开。
