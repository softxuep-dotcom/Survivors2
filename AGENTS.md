# Horde Breaker（Vampire-Survivors-like 割草，Poki 平台）

新会话先读 `GDD-HordeBreaker.md`（当前程序校正版，含立项调研、机制、技能/敌人表、开放式 VFX 管线与里程碑）。

## 硬约束
- 引擎：Phaser 4 + Vite（与 Merge Towers 同栈，不换）
- 包体：初始 <5MB、总计 <8MB；加载 <3s；手机优先 60fps（当前 dist ≈1.50MB / gzip ≈409KB ✓）
- Poki 生死线：25% 玩家玩满 3 分钟 → GDD §4.3 前 3 分钟节奏表是最高优先级
- 性能：不用物理引擎，全量对象池，同屏敌人 ≤400（GDD §8.2）
- VFX：不限定 Graphics/自研粒子池；以 GLSL Custom Shader 为材质升级重点，按需组合 ParticleEmitter、Filters、Rope/Mesh、RenderTexture、Sprite/序列帧和镜头反馈。WebGL 为主路径，低能力设备必须可玩降级（GDD §7.1）。

## 当前进度
- **M0 手感原型：已完成**。移动（摇杆/鼠标/WASD）+ 飞刃自动开火 + 环形刷怪 + 经验/升级四选一 + 结算/存档/Poki 事件全链路。
- **500 敌压测已通过**：`?stress=1` 混编 500 敌全管线 ≈0.85ms/帧（60fps 预算 16.7ms）。
- **M1 核心循环：已完成并切换为直接技能制**。正式局开放刃风暴、猎首镖、烈焰路径、爆裂集束、暴风雪、碎冰牢笼、风暴之眼、雷枢裁决、瘟疫、腐蚀、圣辉光环、审判棱镜 12 个基础技能；开局强制十二选一主技能，同时最多持有 4 个主动技能。6 种被动不占主动技能槽，均可获取并升至 Lv3。技能从 Lv1 直接升到 Lv8，升级卡把规模/威力/特性模块和效果合为一次选择，不再出现第二层进阶菜单；旧基础/进阶定义仅保留给镜像 Boss 与 VFX Lab。
- Game Studio 浏览器 playtest 已通过：桌面与 390×844 移动端的开局主技能选择、统一四选一升级、选择后立即回战斗均无报错；既有 10:30 胜利结算闭环保持正常。
- **M2 Poki 化：已完成**。SDK 初始化与 loading/gameplay 生命周期、开局三选一增益、升级广告重摇、死亡复活清场、结算钻石双倍、广告期间静音/禁输入及离线/拦截 fail-safe 均已接通；`commercialBreak` 仅在退出暂停并返回玩法时触发。
- M2 Game Studio 验收已通过：桌面/390×844 移动端四个奖励位、暂停恢复、中文文案与结算布局正常；本地首屏约 503ms，Poki 契约检查及生产构建通过，控制台无游戏错误。
- **M3 内容与平衡：已完成**。存档 v2、钻石结算、9 节点天赋树、角色专属被动、精英/Boss 宝箱免费升级（不再叠加动态百分比经验）、复活/开局经验/重摇、森林→血月皮肤、完整程序化音效、本地 30 秒运行分析均已接通。角色不再决定开局技能，主技能进入战斗后单独选择。
- M3 Game Studio 验收已通过：桌面/390×844 移动端布局、角色解锁、天赋购买、开局经验与重摇、复活反馈、7:30 血月双提示排队、10:30 钻石结算均无游戏控制台错误。
- **M4 短事件池：已接通**。每局 1:30 随机触发悬赏目标 / 屠戮挑战 / 守住符文圈之一，20 秒内完成统一掉落宝箱，失败无惩罚；桌面与 390×844 移动端 HUD、三事件完成链路均已验收。
- **M4 Boss 火球：已接通**。全部 Boss 会在震地间隙施放玩家同源火球；固定伤害 10（基础女巫 10 发、骑士 11 发），8 槽对象池、锁定后不追踪，并与震地共用施法锁。
- **元素协同第一批：已接通**。雷击冰冻/减速目标触发 `SHATTER!` 2 倍伤害；火打中毒目标触发 `BLOOM!` 小燃爆；腐蚀/易伤作为全伤害 `vuln` 标记并弹 `VULN!`。数值入口在 `src/config.js` 的 `ELEMENT_SYNERGY`。
- **宝箱免费升级：已接通**。宝箱拾取直接进入与经验升级相同的统一卡池，不再触发 Lv4 二选一或第二层菜单。宝箱拾取图使用透明 WebP 资产 `public/assets/ui/chest-jackpot.webp`，源图保留在 `artifacts/chest/`。
- **敌人行为差异第一批：已接通**。疾行者接近后蓄力闪光并锁定方向冲刺；铁盾兵正面扇区减伤并弹 `BLOCK`，范围伤害可绕过；飞行兵精英蓄力/恢复更短、俯冲更快；分裂怪精英额外多裂 1 只。调参入口在 `src/config.js` 的 `ENEMY_BEHAVIOR`。
- **可破坏战利品道具：已接通**。木箱(1击)/火盆(2击)/墓碑(3击)在开局 12 秒一次生成首批 5 件，之后场上目标 5 件、上限 7 件，每 3 秒最多补 1 件（压测不刷）；与敌人同等参与自动索敌、追踪、连锁和范围技能，直射弹命中不消耗穿透。打碎可掉约当前升级需求 25% 的经验宝石、3 颗小经验宝石、治疗药(+16%HP 绿飘字)或磁石(玩家周围 520px 吸取+toast)。数值入口 `config.PROPS`；完整规则见 GDD §3.7，美术规格见 `design/props-assets.md`。验收：`?testProps=1&god=1&debug=1`。
- **VFX 管线升级：技术底座、毒系、雷电/棱镜、火焰/寒霜和圣光/物理批次已完成。**`VfxRuntime` 已接入 WebGL/质量档位检测、本地 GLSL 加载与透明预热、统一 uniform、预建 ParticleEmitter、全局活跃预算、诊断和 Sprite 降级。毒瓶使用旋转 Sprite + 原生毒滴/玻璃/气泡/毒雾 Emitter + 12 槽毒池 GLSL。雷链、风暴之眼、雷枢裁决、审判棱镜与猎首镖锁敌线共用固定拓扑 Mesh2D 光束池。猎首镖每轮按 Boss → 带宝箱精英 → 普通敌人选取同一目标，多枚飞镖延迟 55ms 沿同一方向直飞，离手后不追踪。火冰共用 `vfx-element-field.frag`；圣辉光环和刃风暴共用 `vfx-combat-polish.frag`（高/低档 12/6 槽），圣光球、圆形刀光、普通飞刃命中和猎首 Boss 增伤反馈配合 ChatGPT 生成的圣星/刀光 Sprite 与预建 Emitter；所有批次在 `fallback` 保留 Sprite/Graphics 可玩反馈。

## 架构（改哪里）
- `src/config.js` —— **全部数值**（武器/敌人/刷怪时间线/经验曲线/性能预算/主题色）。调平衡只动这里。
- `src/game/` —— 系统层：Player / EnemyManager（池+空间网格+刷怪导演）/ WeaponManager（数据驱动，行为函数按 `behavior` 分派）/ PickupManager / LevelSystem（主技能选择、模块权重、四技能上限与保底受控卡池）/ MetaProgression（局外纯规则）/ RunAnalytics / Vfx / InputController。`game/vfx/VfxRuntime.js` 是统一 VFX Director 底座，集中管理 GLSL、Emitter、能力/质量档位、活跃预算与降级；`game/vfx/BeamSystem.js` 是雷电/棱镜共用的固定拓扑 Mesh2D 光束池。RenderTexture、Filter 在对应技能迁移时接入。
- `src/scenes/` —— Boot / Menu / Talent（9 节点局外树）/ Game（编排，不写系统逻辑）/ **UiScene（并行 UI 场景，世界相机 zoom 不影响 UI）** / Result。
- `src/ui/` —— Hud / MainSkillOverlay / LevelUpOverlay / StartBoostOverlay / ActionModal / widgets（按钮/面板）。
- `src/core/` —— Pool（对象池）/ SpatialGrid（均匀网格，全部碰撞查询走这里）。
- `src/textures.js` —— 当前程序化纹理（玩家/飞刃/宝石/地面/图标）+ 敌人图集动画辅助（front/left/front_left ×5 帧，右向镜像）；新增 VFX 应允许使用本地 `.frag`、噪声纹理和正式特效图集，不得被程序化纹理方案限制。
- 复用自 Merge Towers：save.js/i18n.js/audio.js（已适配）；`poki.js` 已升级为生命周期去重、广告互斥和 fail-safe 边界。
- `artifacts/` —— 美术素材管线产物（源图/抠像/QA/预览），**入库保留**，勿加 ignore。

## 常用命令与调试
- `npm run dev`（端口 8081）；`npm run check:skills`；`npm run balance`；`npm run check:poki`；`npm run build`；`npm run package:poki`
- URL 开关：`?stress=1` 500 敌压测（M0 门禁）· `?debug=1` FPS/实体数 · `?god=1` 无敌 · `?mockAds=1` 本地广告验收（仅开发构建）
- 特效房（仅开发构建）：`?vfxlab=1` 直接进入轻量 VFX Lab；6 个静止高血史莱姆 + 1 个静止 Boss，技能列表复用正式 `WeaponManager`/`Vfx`，支持锁定目标、单次/循环释放和清场重置。直达示例：`&skill=venomflask|chainlightning|stormeye|thunderjudgment|prism|fireball|lavatrail|frostpulse|blizzard|holyorb|holyhalo|bladestorm|headhunter|blade&vfx=high|low|fallback`。
- VFX 开关：`?vfx=high|low|fallback` 强制质量档位；默认 WebGL 高档，极低规格自动低档，Canvas/`fallback` 保留 Sprite/Graphics 可玩路径。debug 面板显示 `vfx renderer/quality` 与 `fx legacy+native`。
- Boss 火球快速验收：`?start=179&god=1&autoplay=1&debug=1`，开局后约 4–8 秒可看到 Boss① 的蓄力、火球轨迹与爆炸。
- 首次升级快速验收：`?god=1&testChest=fireball&debug=1`，选择主技能后拾取脚边宝箱，应进入与后续升级一致的四选一卡池，可出现已有技能模块、新主动或新被动；点击后立即回战斗。
- 战利品道具快速验收：`?testProps=1&god=1&debug=1`，玩家上方一排 木箱/火盆/墓碑，武器可将其作为普通目标自动索敌，打碎后掉战利品。
- 无头验证：dev 构建自动挂 `window.__pump(n)`（手动泵帧，面板隐藏时 RAF 不跑）、`__shoot(name)`（快照 POST 到本地 8082）、`__tap(x,y)`、`__key(code,kc,down)`——见 `src/dev/testHooks.js`。Phaser 输入用 MouseEvent（不认 PointerEvent）。

## 里程碑
M0 手感原型(✓) → M1 核心循环(✓) → M2 Poki 化(✓) → M3 内容平衡(✓) → M4 playtest 调优。
