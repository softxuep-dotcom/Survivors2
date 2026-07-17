# 战利品道具 · 美术需求与生成提示词

> 机制:视野周边散布可破坏道具(木箱 1 击 / 火盆 2 击 / 墓碑 3 击),与敌人同等参与技能索敌和伤害,打碎可掉约当前升级需求 25% 的经验宝石 / 3 颗小经验宝石 / 治疗药 / 磁石(全场吸取)。完整玩法规则以主设计文档 `GDD-HordeBreaker.md` §3.7 为准。
> 现状:5 张正式图已生成并接入;程序化占位图保留为资源加载失败时的兜底。
> 参考工作流:与 `chest-jackpot.webp` 相同(ChatGPT 生成 → 透明底 → WebP → 入 `public/assets/`)。

---

## 一、全局风格规范(每条提示词都要带)

- **视角**:俯视 3/4(约 45°),单个物件,正面朝下方玩家视角
- **风格**:2.5D 手绘暗黑森林风,厚涂质感,与现有敌人图集(smooth-v2 系列)同类;**不要像素风、不要写实照片**
- **光照**:主光源来自上方偏左,底部有一小片贴地软阴影(烘焙在图内)
- **背景**:**完全透明**(alpha 通道),无地面、无场景、无文字水印
- **轮廓**:外缘清晰(可带极细深色描边),保证在深绿色暗底(#0e1410~#18291d)上可读
- **构图**:物件居中,四周留 ~8% 空白边距
- **导出**:道具 512×512、拾取物 256×256;PNG 转 **WebP**(有损 80~90,单文件 <60KB)

英文风格后缀(通用,拼在每条 prompt 末尾):
> hand-painted dark fantasy forest style, 3/4 top-down view, single game prop centered, soft baked ground shadow beneath, transparent background, clean silhouette readable on dark green ground, no text, no watermark, 2.5D stylized game asset

---

## 二、逐件提示词

### 1) 木箱 `prop-crate.webp`(512×512,1 击碎)
**中文**:一只破旧的深棕色木板箱,木纹清晰、板缝略歪,四角有生锈铁皮包边和铆钉,顶面受光略亮,箱体有一两道裂口透出暗色,底部一片贴地软阴影。暗黑森林手绘风,俯视 3/4 视角,透明背景,居中单体。
**EN**: A weathered dark-brown wooden loot crate with crooked planks, visible wood grain, rusty iron corner brackets and rivets, one or two small cracks, slightly brighter top face + 通用后缀

### 2) 火盆 `prop-brazier.webp`(512×512,2 击碎,微发光)
**中文**:一座矮石质火盆,深灰石座与浅口石碗,碗中燃着橙黄色余烬火焰(火苗小而温暖,不夸张),火光在碗沿投出淡淡暖色辉光,石座有轻微苔痕,底部贴地软阴影。暗黑森林手绘风,俯视 3/4,透明背景。
**EN**: A short stone brazier bowl with warm orange embers and a small flickering flame, subtle warm glow on the rim, mossy weathered stone base + 通用后缀

### 3) 墓碑 `prop-gravestone.webp`(512×512,3 击碎)
**中文**:一块圆顶青灰色石墓碑,表面风化有两三道裂纹与浅浮雕刻痕(不要可读文字),底部边缘攀着少量青苔,左上受光、右侧偏暗,底部贴地软阴影。暗黑森林手绘风,俯视 3/4,透明背景。
**EN**: A rounded-top weathered gravestone, grey-blue stone with cracks and faint carved lines (no readable letters), moss creeping at the base + 通用后缀

### 4) 治疗药 `pickup-heal.webp`(256×256,拾取物)
**中文**:一只小巧的圆肚玻璃药瓶,鲜红色药液微微发光,软木塞,瓶身一颗小小的白色十字标记,轮廓干净明亮(拾取物要一眼可见),透明背景。手绘暗黑森林风。
**EN**: A small round glass potion bottle with glowing bright red liquid, cork stopper, tiny white cross emblem, bright readable pickup silhouette + 通用后缀

### 5) 磁石 `pickup-magnet.webp`(256×256,拾取物)
**中文**:一块经典 U 形磁铁,红色主体、银白色两极,两极间跳动一两道淡青色小电弧,微微发光,轮廓干净明亮,透明背景。手绘暗黑森林风。
**EN**: A classic U-shaped horseshoe magnet, red body with silver tips, faint cyan energy arcs between poles, slight glow, bright pickup silhouette + 通用后缀

---

## 三、接入状态（已完成）

1. 文件已放入 `public/assets/props/`,命名如下:
   `prop-crate.webp` · `prop-brazier.webp` · `prop-gravestone.webp` · `pickup-heal.webp` · `pickup-magnet.webp`
2. `src/scenes/BootScene.js` 的 `preload()` 已加入 5 行:
   ```js
   this.load.image('prop_crate_art', 'assets/props/prop-crate.webp');
   this.load.image('prop_brazier_art', 'assets/props/prop-brazier.webp');
   this.load.image('prop_gravestone_art', 'assets/props/prop-gravestone.webp');
   this.load.image('pickup_heal_art', 'assets/props/pickup-heal.webp');
   this.load.image('pickup_magnet_art', 'assets/props/pickup-magnet.webp');
   ```
3. 代码按 `_art` 键自动优先使用正式图(`PropManager.textureFor` / `PickupManager.dropHeal/dropMagnet`),尺寸由 `config.PROPS.types[].spriteH` 控制,与源图分辨率无关。

## 四、验收

- `?testProps=1&god=1&debug=1`:玩家上方一排三件道具;走近后武器可将其作为普通目标自动索敌并打碎 → 碎屑 + 掉落(大经验宝石/小经验宝石/药瓶/磁铁)。
- 磁石拾取 → 弹 "全场吸取!" 且全场经验宝石飞向玩家;药瓶拾取 → 绿色 +HP 飘字。
- 检查:三件道具在暗底上轮廓清晰;体积感 ≤ 铁盾兵;阴影方向一致朝下;火盆辉光不刺眼。
- 正常局:开局 12 秒一次生成首批 5 件,之后场上目标 5 件、上限 7 件,每 3 秒最多补 1 件;`?stress=1` 压测不刷道具(性能门禁口径不变)。
- 技能验收:飞刃/火球/毒瓶/猎首追踪可把道具选为普通目标;雷链、雷云和棱镜分光可把道具纳入多目标;脉冲、光环、毒池和火区可直接减少道具命中次数。
