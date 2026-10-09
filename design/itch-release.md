# itch.io 发布说明

Horde Spark 的 itch.io 版本是独立 HTML5 构建。它不会加载 CrazyGames SDK，不显示不可用的广告重摇、广告复活或广告钻石奖励，并使用浏览器 `localStorage` 保存进度。CrazyGames 原构建保持不变。

## 生成上传包

在项目根目录运行：

```powershell
npm run prepare:itch
```

成功后上传 `dist/horde-spark-itch-v<版本号>.zip`。脚本会检查：

- ZIP 根目录直接包含 `index.html`；
- 所有资源路径均为相对路径，适合 itch.io iframe；
- 页面没有 CrazyGames SDK 或其他远程脚本；
- itch 版不展示无法兑现的广告入口；
- 文件总量继续满足项目内部 8 MiB 红线。

## itch.io 页面设置

- Kind of project：`HTML`
- Upload：上传生成的 ZIP，并勾选 `This file will be played in the browser`
- Embed options：`Embed in page`
- Viewport dimensions：建议 `960 × 540`
- Mobile friendly：开启
- Fullscreen button：开启
- Automatically start on page load：开启
- SharedArrayBuffer support：关闭（本项目不需要）
- Orientation：不锁定；游戏会自动适配横屏与竖屏

Genre 选 `Survival`。标签建议使用 `2D`、`Action`、`Roguelite`、`Bullet Hell`、`Top-Down`、`Singleplayer`、`Arcade`、`Casual`，不要再重复添加 `Survival`。AI generation disclosure 必须选 `Yes`。

## 发布前人工验收

1. 在 itch.io 草稿页启动游戏，确认首屏不超过 3 秒且没有黑屏。
2. 桌面端验证鼠标跟随、WASD、暂停和重新开始。
3. 手机端验证竖屏、动态摇杆、安全区和音频首次触摸解锁。
4. 完成一次升级，确认无局外重摇次数时不出现广告重摇。
5. 死亡且无“再起”次数时直接进入结算，不出现广告复活。
6. 结算页只显示“再来一局”和“主菜单”，不出现广告钻石按钮。
7. 刷新页面，确认语言、角色、天赋和钻石存档仍在。
