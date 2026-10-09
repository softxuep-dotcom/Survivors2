# GameDistribution 发布说明

Horde Spark 的 GameDistribution 版本使用独立构建目录与官方 HTML5 SDK。场景只调用 `src/platform.js`；GD 构建自动选择 `src/gamedistribution.js`，不会加载 CrazyGames SDK。

## 生成上传包

先在 GameDistribution 开发者后台创建游戏，复制该游戏的 32 位 `gameId`。PowerShell 中执行：

```powershell
$env:GD_GAME_ID='后台显示的32位gameId'
npm run prepare:gamedistribution
```

输出为 `dist/horde-spark-gamedistribution-v<version>.zip`，其中 `index.html` 位于 ZIP 根目录。门禁会检查：

- `GD_OPTIONS.gameId` 已替换为真实 ID；
- 只加载 GameDistribution SDK，不加载 CrazyGames SDK；
- 资源路径为相对路径；
- 文件数与解压总大小符合项目内部 1500 文件 / 8 MiB 红线；
- 包内没有符号链接，且平台编译常量已经替换。

不设置 `GD_GAME_ID` 时仍可执行 `npm run build:gamedistribution` 检查编译，但 `prepare:gamedistribution` 会拒绝生成可上传包，避免误传占位 ID。

## 广告映射

| 游戏位置 | GD 调用 | 发奖条件 |
|---|---|---|
| 首页“开始游戏” | `gdsdk.showAd()` | 不发奖；失败立即开局 |
| 完整一局后“再来一局” | `gdsdk.showAd()` | 不发奖；失败立即重开 |
| 升级完整重抽 | `preloadAd('rewarded')` + `showAd('rewarded')` | 仅 `SDK_REWARDED_WATCH_COMPLETE` |
| 死亡复活 | 同上 | 仅完整观看 |
| 结算追加钻石 | 同上 | 仅完整观看 |

所有 rewarded 入口均以当前语言明确标注“观看广告”，不能只依赖视频图标暗示。`SDK_GAME_PAUSE` 会静音、禁输入并把游戏画布置于广告下方；`SDK_GAME_START` 恢复广告层，但广告复活成功后仍停在确认弹窗，只有玩家再次点击“继续”才恢复战斗。广告无填充、SDK 被拦截或初始化超时均 fail-open，且 rewarded 不会误发奖励。

GD 没有接入本项目的 CrazyGames Data 后端，因此进度继续保存在浏览器 `localStorage`。

## 后台 iframe 验收

1. 上传 ZIP，并从后台的游戏预览/iframe 打开，不要只双击本地 `index.html`。
2. 关闭广告拦截器，点击首页“开始游戏”，完整观看测试 preroll。
3. 分别验证升级重抽、死亡复活、结算钻石三个 rewarded 位；中途关闭不得发奖。
4. 完成一局后点击“再来一局”，确认 interstitial 结束或无填充后都能进入下一局。
5. 广告过程中确认游戏暂停且静音，返回后画面、音频、输入和 WebGL 均正常。
6. 用 390×844 移动视口复测触控、横竖屏与广告回前台。

自动验证入口：

```powershell
npm run check:gamedistribution
npm run build:gamedistribution
```
