# 抖音小游戏接入（2026-10-09）

当前状态：已实现独立小游戏构建及 Phaser 4 宿主适配，通过本地 `tt` 模拟环境测试；修复 Android 的 Unicode 属性正则及全局 `screen` 缺失问题后，用户已确认真机能运行。**iOS、真实广告、完整战斗闭环与启动性能仍未完成真机验收，不能视为可提审版本**。已配置「元素破潮」AppID `ttca1abca7546376da02`，广告位 ID 尚未配置。

## 构建与导入

```powershell
npm run prepare:douyin
```

导入目录为仓库下的 `dist/douyin`，包含 `game.js`、`game.json`、`project.config.json`、`adapter.js`、`horde.js` 与本地 `assets/`。在抖音**小游戏**开发者工具中选择/创建小游戏，将工程绑定到真实 AppID；不是普通小程序 WebView 工程。

AppID 和游戏名称保存在 `config/douyin.json`，抖音版首页标题、IDE 工程名和工程描述统一从这里生成，当前为「元素破潮」。普通构建无需再设置环境变量。需要覆盖 AppID 或接入广告时，在 PowerShell 中执行：

```powershell
$env:DOUYIN_APP_ID = '替换为后台的tt开头AppID'
$env:DOUYIN_REWARDED_AD_UNIT_ID = '替换为激励视频广告位ID'
npm run prepare:douyin
```

构建优先使用 `DOUYIN_APP_ID` 环境变量，否则使用 `config/douyin.json`。未配置广告位时隐藏奖励广告按钮，不模拟发奖。每次构建会重新生成输出目录，不要只改 dist。App Secret 不需要进入客户端。

当前单包约 **4.10 MiB / 63 文件**，全部资源在包内，不依赖 CDN，无 HTML、CrazyGames/GD SDK。构建按项目首包 5 MiB 红线检查。官方代码包说明与 IDE 更新记录对非分包上限存在不同表述（20MB / 16MB），本包低于两者；分包主包 4MB 规则不用于当前单包。若后台实际提示 4MB 门禁，需先拆分资源包，不能直接宣称已满足该门禁。

抖音官方开发指南的资源后缀白名单未列出 `.webp` / `.frag`。抖音构建使用 sharp 将 WebP 副本转换为透明调色板 PNG（原始素材不改动），GLSL 文本以 `.txt` 打包，`assetPath()` 统一映射加载路径；输出按后缀白名单检查。构建先在独立暂存目录完成转换和校验，再按资源→脚本→入口的顺序更新 `dist/douyin`，不清空 IDE 已导入的项目目录，并保留 IDE 私有配置。仍须等待构建完成后再手动编译。资源失败时输出具体路径并显示重试入口，角色动画帧不齐时禁止进入首页。原生图片/文件错误额外打印 `[douyin-resource]` JSON，保留 `errMsg/errNo` 以区分找不到文件、解码失败与宿主接口错误。

## 已接入能力与边界

- 保持 Phaser 4 + Vite、原战斗系统及数值；微信端尚未实施。
- `src/minigame/douyin-adapter.js` 在 Phaser 前加载：上屏 Canvas、离屏纹理 Canvas、Image、本地文件读取、XHR、触摸与窗口事件、中文语言环境。
- WebGL1 的 VAO/instancing 能力探测及 Phaser 类型桥接；缺少扩展时选择 Canvas 降级，保留玩法。首个 Canvas 始终用于上屏。
- `src/platforms/douyin.js` 复用既有 Platform 接口，接入 `tt` 同步本地存储。**不是跨设备云存档**，不与浏览器档案共享。
- `onHide/onShow` 转换为可见性事件：后台保存并暂停，返回前台保留继续按钮，不自动插广告。静音和广告暂停沿用现有音频控制。
- 激励广告复用重摇、复活、结算加钻入口；仅 `onClose({isEnded:true})` 发奖。取消、报错、超时均不发奖，并发请求拒绝。超时后隔离本会话广告实例，避免旧回调误奖下一次请求。首版不接开屏/插屏。
- WebAudio 对接 `tt.getAudioContext()`；不支持完整合成能力时使用最多 6 个 InnerAudio 实例播放现有武器/Boss 音效。该降级不包含程序化背景音乐与纯合成 UI 音效，需真机检查音频能力。
- 安全区及胶囊底部接入 `mobileSafeArea`；竖屏菜单整体重排，HUD/技能选择避开顶部。

## 本地验证

Android 抖音 40.6.0 / SDK 4.33.0.1 真机日志曾报 `Invalid property name in character class`：运行环境不支持 UI 原先使用的 `Extended_Pictographic` Unicode 属性正则，导致整段脚本在启动前解析失败。四处 UI 共用 `src/ui/labelText.js` 的明确图标列表，保持各页面对重试/钻石符号的处理差异。契约检查逐条对比全部语言词条的新旧结果；构建在发布前检查所有输出 JS，拒绝 Unicode 属性转义再次进入包内。Vite 的 ES2019 目标并不能保证真机支持该语法。

随后真机报 `[boot] ReferenceError: screen is not defined`，栈位于 Phaser `ScaleManager.startListeners`。原适配层只有 `window.screen`，现在全局 `screen` 与 `window.screen` 共享屏幕尺寸对象；窗口缩放继续走已有 resize 桥接。回归测试屏蔽浏览器自带的 `screen`，旧包会复现启动弹窗，新包在 WebGL/Canvas 两条路径均完成菜单→选技能→移动→后台保存暂停且无启动弹窗。启动异常提示保留，没有以隐藏弹窗替代修复。

收到这类启动修复后，IDE 点击 Compile，再重新生成 Preview 二维码并用手机扫码；旧二维码可能仍指向旧预览包。本地通过不代表这次真机复测通过。

```powershell
npm run check:douyin
npm run check:build-output
npm run check:crazygames
npm run check:gamedistribution
npm run check:skills
npm run build
```

可选模拟宿主集成测试（需要 Playwright，仓库不新增此依赖）：

```powershell
$env:PLAYWRIGHT_MODULE = '本机playwright/index.mjs的绝对路径'
node tools/douyin-smoke.mjs
node tools/douyin-smoke.mjs --fallback
```

证据保存在 `artifacts/douyin/`：390×844 主菜单、主技能选择、战斗截图，以及检查结果 JSON。测试使用真实 Phaser 和 Canvas/WebGL，但 `tt` 是模拟对象，因此不证明原生宿主兼容性、真机性能或广告可用性。

## 取得账号后的验收顺序

1. IDE 导入绑定 AppID，检查启动日志、资源加载（PNG/GLSL 文本/WAV）及真实宿主全局对象兼容性。更新包后重新编译；必要时退出项目再重新导入，避免旧资源索引。
2. Android/iOS 真机冷启动，测首次可交互时间和帧率；完整跑前三分钟、升级和结算。
3. 验证多点触摸/取消、刘海与胶囊安全区、切后台/锁屏/回前台、音效静音与恢复。
4. 验证重启后存档、天赋和货币保持。
5. 配置真实广告位，逐项测试完整观看、提前关闭、无填充、断网、回前台、重复点击，确认每次最多发奖一次。
6. 在后台确认当前主体所需资质、隐私说明和提审材料后再上传提审。

## 构建目录隔离

`npm run build` 的 Sites 收尾脚本只写入 `dist/server/index.js`，不清理其他发行平台目录。`check:build-output` 校验重复执行时保留抖音、GD、itch 和其他已有输出，避免 IDE 因 `project.config.json` 被删除而出现 ENOENT / Remote Debug Failed。已用真实网页构建前后 SHA-256 对比确认抖音包全部 63 个文件保持一致。

## 微信适配前保存基线（2026-10-09）

- 保存当前全部平台实现及美术素材；`dist/` 继续作为可重新生成的输出，不提交 Git。当前提交可用于微信适配后的对比与回退。
- 发布图标选用明亮风格的紫帽女巫，原图和提示词保留为 `artifacts/douyin/icon-witch-bright-v1-source.png`、`icon-witch-bright-v1-prompt.txt`。保存时检查发现，同目录的 `icon-witch-bright-600-v1.png` 当前实际为 144×144、带透明通道、58,099 字节，已按现状保存；后续上传应从源图重新导出 600×600，不能依据文件名判断尺寸。此前骑士方案仅作为历史素材保留。
- 抖音后台基础资料、自审自查、侧边栏复访能力、流量主申请及真实广告位仍需完成；本次没有上传提审或发布。
- 微信端尚未实施，AppID 尚未提供。下一阶段先接微信基础运行、中文、资源、触摸、存档和前后台恢复；无广告位时隐藏广告入口。先保留抖音现有实现，微信跑通后再评估共用适配层。
- 微信构建必须写入独立目录，并验证不会删除或覆盖抖音工程；双端分别验证开局、升级、复活、结算和音频恢复，广告另验完整观看、取消和失败分支。

本次保存前验证结果：`npm run prepare:douyin` 通过（63 文件、4.10 MiB）；`check:build-output`、`check:skills`、`check:i18n`、`check:synergy`、`check:crazygames`、`check:gamedistribution` 与网页 `build` 均通过。重新构建后，`douyin-smoke.mjs` 的 WebGL 和 `--fallback` 两种模式均通过启动、选技能、移动、后台存档及暂停恢复检查，证据更新在 `artifacts/douyin/`。构建只有现有的大于 500 kB chunk 提示，无构建错误。

## 官方依据

- [小游戏开发指南与运行环境](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/dev-guide/bytedance-mini-game)
- [代码包说明](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/basic-function/subpackages/introduction)
- [开发者工具下载与更新记录](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/dev-tools/developer-instrument-update-and-download)
- [激励视频 API](https://partner.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/ads/tt-create-rewarded-video-ad)
- [小游戏音频](https://partner.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/basic-function/audio)
