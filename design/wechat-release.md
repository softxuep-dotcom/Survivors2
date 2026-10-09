# 微信小游戏：元素破潮

AppID：`wxbdb4c3af4927af83`，保存在 `config/wechat.json`。不需要 AppSecret。
微信版版本号也在该文件的 `version` 字段配置，当前为 `1.0.1`。
左下角版本标识由独立画布场景显示，菜单、战斗和结算均可见，不依赖 DOM。

## 构建和导入

```powershell
npm run prepare:wechat
```

微信开发者工具选择小游戏，导入仓库下的 `dist/wechat`，不要导入仓库根目录或 `dist/douyin`。
导入目录已包含 `project.config.json`，应自动填入上面的 AppID。
编译后用「预览」扫码进行真机测试，再通过工具「上传」到后台版本管理。

构建产物：主包包含 `game.js`、`bootstrap.js`、`adapter.js`、`horde.js`；
`assets/` 是名为 `resources` 的普通分包。先加载分包，成功后启动 Phaser，
失败显示重试弹窗。主包约 1.71 MiB，总包约 4.10 MiB。所有美术和音效随包，不需要 CDN。
构建执行主包 <4 MiB、启动总资源 <5 MiB 的门禁；资源副本使用 PNG 和文本 Shader，源文件不变。

## 平台隔离

- 保持 Phaser 4 + Vite、同一套玩法/UI/数值与素材。
- 微信使用独立 adapter、平台实现、AppID 和构建脚本；构建别名只引入微信平台模块。
- 微信宿主使用 `wx`，不设置或伪装 `tt`。音频和启动提示按构建平台选择接口。
- 微信 IDE 的原生 `window/document` 等属性只读。adapter 导出私有宿主对象，游戏包通过静态函数作用域使用兼容对象，不覆盖原生全局属性，也不依赖运行时 eval。
- `prepare:wechat` 只发布到 `dist/wechat`，保留 IDE 私有配置；抖音仍用 `prepare:douyin`。
- 首批有意保留抖音已验证的 adapter，微信 adapter 作为独立实现，修复时分别回归。
- 存档使用 wx 本地存储；两平台各自宿主空间隔离，不自动跨平台同步。

## 广告

当前没有微信广告位 ID，奖励按钮隐藏，基础玩法可正常进行。首版不接插屏。
取得微信激励视频广告位后：

```powershell
$env:WECHAT_REWARDED_AD_UNIT_ID = 'adunit-实际广告位ID'
npm run prepare:wechat
```

接入三个既有奖励入口：升级重摇、死亡复活、结算追加钻石。
只在 `onClose` 明确 `isEnded === true` 时发奖；取消、无填充、错误和超时不发奖，
拦截并发请求，超时后禁用本会话广告对象以防迟到回调误发奖励。
广告位 ID 与抖音完全独立。真实广告必须另做设备测试，不把模拟回调测试当作可变现证明。

## 验证

```powershell
npm run check:wechat
npm run check:build-output
# 已安装 Playwright 时；否则设置 PLAYWRIGHT_MODULE 为其 index.mjs 绝对路径
npm run smoke:wechat
npm run smoke:wechat -- --fallback
npm run smoke:wechat -- --missing-asset
```

`artifacts/wechat/` 保存 390×844 模拟宿主的菜单、主技能、战斗、升级、结算和错误截图。
测试运行真实打包 `game.js`，模拟 wx API、分包回调及 IDE 只读 Window 属性，覆盖启动顺序、移动、后台暂停保存、
升级选择、局外复活、结算及 Boot 重新读档。结算时间由测试注入，并非真实跑完三分钟。
契约测试另覆盖分包失败重试/迟到回调和广告成功/取消/失败/并发/超时。

开发完成后仍需用户在微信 IDE 及 Android/iOS 验收：

1. 首次下载分包、弱网重试、中文/贴图/特效和安全区。
2. 完整前三分钟和完整局、12 技能、真机帧率与内存。
3. 锁屏/切后台/回来手动继续、静音、音效及 BGM。
4. 完全关闭重新打开后的天赋、钻石、最佳纪录。
5. 配置广告位后完整观看/取消/无填充/回前台，一次发奖。
6. 后台类目、隐私指引、适龄、备案和发布材料。

模拟宿主测试不能证明微信原生运行时、真机性能或真实广告已经通过。

### IDE 只读 window 修复（2026-10-09）

用户 IDE 日志出现 `Cannot set property window ... which has only a getter`。
旧模拟宿主使用可写对象，未覆盖该环境差异；新增只读属性后已复现同一启动异常。
修复改为私有宿主对象 + 静态作用域绑定，避免写入微信 IDE 的原生 Window。
重新构建到同一 `dist/wechat`，保留 IDE 私有配置。开发者工具点击「编译」加载新包；
如仍显示旧堆栈，清除编译缓存后重编译。实际 IDE 及真机结果仍需复测。

## 官方依据

- 分包：https://developers.weixin.qq.com/minigame/dev/guide/base-ability/subPackage/useSubPackage.html
- WebAudio：https://developers.weixin.qq.com/minigame/dev/api/media/audio/wx.createWebAudioContext.html
- 激励视频：https://developers.weixin.qq.com/minigame/dev/api/ad/wx.createRewardedVideoAd.html
