// 程序化纹理 + 敌人图集辅助。
// 敌人图集（front/front_left/left/back_left/back 五方向 ×5 帧，其余方向水平镜像）。
// 其余全部 Graphics 代码生成，包体零美术文件（GDD §8.2 包体红线）。
import Phaser from 'phaser';

// ---------------- 敌人图集（沿用 ssa/src/textures.js 的方案） ----------------
export const ENEMY_ATLAS_KEYS = ['slime', 'mini', 'runner', 'tank', 'flyer', 'splitter', 'boss', 'boss2'];
export const ENEMY_SOURCE_DIRECTIONS = ['front', 'front_left', 'left', 'back_left', 'back'];
const ENEMY_MIN_FRAMES = 5;
const ENEMY_MAX_FRAMES = 8;

const MIRROR_SOURCES = {
  right: 'left',
  front_right: 'front_left',
  back_right: 'back_left',
};
const SOURCE_FALLBACKS = {
  front: ['front', 'front_left', 'left'],
  left: ['left', 'front_left', 'front'],
  front_left: ['front_left', 'left', 'front'],
  back_left: ['back_left', 'left', 'front_left', 'back', 'front'],
  back: ['back', 'back_left', 'front', 'front_left', 'left'],
};

export function enemyAtlasKey(typeKey) { return `enemy_atlas_${typeKey}`; }

export function enemyAtlasImage(typeKey) {
  if (typeKey === 'boss2') return 'assets/enemies/enemy-boss2-smooth-v1.png';
  const version = typeKey === 'boss' ? 'v6' : 'v2';
  return `assets/enemies/enemy-${typeKey}-smooth-${version}.webp`;
}

export function enemyAtlasJson(typeKey) {
  if (typeKey === 'boss2') return 'assets/enemies/enemy-boss2-smooth-v1.json';
  const version = typeKey === 'boss' ? 'v6' : 'v2';
  return `assets/enemies/enemy-${typeKey}-smooth-${version}.json`;
}

export function enemyAnimKey(typeKey, direction) { return `enemy_${typeKey}_${direction}`; }
export function enemyFrameKey(typeKey, direction, frame) { return `${typeKey}_${direction}_${frame}`; }
export function enemyDirectionFlipX(direction) {
  return direction === 'right' || direction === 'front_right' || direction === 'back_right';
}

// 按移动向量选完整八方向；Phaser 屏幕坐标中 dy<0 为向上/背面。
export function enemyPlaybackDirection(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < 0.25 && ay < 0.25) return null;

  if (dy > 0) {
    if (ax <= ay * 0.45) return 'front';
    if (ax <= ay * 1.6) return dx > 0 ? 'front_right' : 'front_left';
  } else if (dy < 0) {
    if (ax <= ay * 0.45) return 'back';
    if (ax <= ay * 1.6) return dx > 0 ? 'back_right' : 'back_left';
  }
  return dx > 0 ? 'right' : 'left';
}

function enemyFrameNumbers(scene, typeKey, direction) {
  const atlas = enemyAtlasKey(typeKey);
  if (!scene.textures.exists(atlas)) return [];
  const texture = scene.textures.get(atlas);
  const frames = [];
  for (let i = 1; i <= ENEMY_MAX_FRAMES; i++) {
    if (!texture?.frames?.[enemyFrameKey(typeKey, direction, i)]) break;
    frames.push(i);
  }
  return frames;
}

export function enemyAnimationSource(scene, typeKey, direction) {
  const source = MIRROR_SOURCES[direction] || direction;
  const fallbacks = SOURCE_FALLBACKS[source] || [source, 'left', 'front'];
  return fallbacks.find(c => enemyFrameNumbers(scene, typeKey, c).length >= ENEMY_MIN_FRAMES) || null;
}

export function createEnemyAnimations(scene) {
  for (const key of ENEMY_ATLAS_KEYS) {
    if (!scene.textures.exists(enemyAtlasKey(key))) continue;
    for (const direction of ENEMY_SOURCE_DIRECTIONS) {
      const frameNumbers = enemyFrameNumbers(scene, key, direction);
      if (frameNumbers.length < ENEMY_MIN_FRAMES) continue;
      const animKey = enemyAnimKey(key, direction);
      if (scene.anims.exists(animKey)) continue;
      const cyclesPerSecond = key === 'runner' || key === 'flyer' ? 2.25 : 1.75;
      scene.anims.create({
        key: animKey,
        frames: frameNumbers.map(i => ({ key: enemyAtlasKey(key), frame: enemyFrameKey(key, direction, i) })),
        frameRate: Math.max(1, Math.round(frameNumbers.length * cyclesPerSecond)),
        repeat: -1,
      });
    }
  }
}

// ---------------- 程序化绘制辅助 ----------------
function shade(color, f) {
  const c = Phaser.Display.Color.IntegerToColor(color);
  return Phaser.Display.Color.GetColor(
    Math.min(255, Math.round(c.red * f)),
    Math.min(255, Math.round(c.green * f)),
    Math.min(255, Math.round(c.blue * f)),
  );
}

function p(points) { return points.map(([x, y]) => ({ x, y })); }

// ---------------- 纹理生成 ----------------
export function generateTextures(scene) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  // --- 1px 白块（血条/纯色矩形通用） ---
  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, 4, 4);
  g.generateTexture('px', 4, 4);
  generateVfxNoiseTexture(scene);
  generateBeamTextures(scene);

  // --- 地面平铺块 256×256（森林俯视；斑块低对比 + 高密度草点，平铺不显 pattern） ---
  g.clear();
  g.fillStyle(0x18291d, 1);
  g.fillRect(0, 0, 256, 256);
  const rng = new Phaser.Math.RandomDataGenerator(['hb-ground']);
  // 低对比明暗斑（小而多，避免平铺后出现规律大圆斑）
  for (let i = 0; i < 14; i++) {
    const x = rng.between(0, 256), y = rng.between(0, 256);
    g.fillStyle(rng.pick([0x16261b, 0x1a2c1f]), 1);
    g.fillEllipse(x, y, rng.between(36, 70), rng.between(26, 50));
  }
  // 草点
  for (let i = 0; i < 150; i++) {
    const x = rng.between(4, 252), y = rng.between(4, 252);
    g.fillStyle(rng.pick([0x223a29, 0x1e3324, 0x25402c]), rng.realInRange(0.45, 0.85));
    g.fillRect(x, y, rng.between(2, 4), rng.between(2, 3));
  }
  // 草叶短撇
  for (let i = 0; i < 34; i++) {
    const x = rng.between(8, 248), y = rng.between(8, 248);
    g.lineStyle(2, 0x2a4630, rng.realInRange(0.35, 0.65));
    g.lineBetween(x, y, x + rng.between(-3, 3), y - rng.between(4, 7));
  }
  g.generateTexture('ground', 256, 256);

  // 血月地表：保持障碍/拾取物对比度，仅改变低频环境色。
  g.clear();
  g.fillStyle(0x291719, 1);
  g.fillRect(0, 0, 256, 256);
  const bloodRng = new Phaser.Math.RandomDataGenerator(['hb-blood-ground']);
  for (let i = 0; i < 90; i++) {
    g.fillStyle(bloodRng.pick([0x341b1d, 0x3c2021, 0x251619]), bloodRng.realInRange(0.35, 0.75));
    g.fillEllipse(bloodRng.between(0, 256), bloodRng.between(0, 256), bloodRng.between(3, 18), bloodRng.between(2, 10));
  }
  g.generateTexture('ground_blood', 256, 256);

  // --- 装饰件：灌木 / 岩石 / 草丛 ---
  g.clear();
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(26, 42, 44, 12);
  g.fillStyle(0x1d3826, 1);
  g.fillCircle(18, 30, 15);
  g.fillCircle(34, 28, 17);
  g.fillCircle(26, 18, 14);
  g.fillStyle(0x2a4f33, 1);
  g.fillCircle(22, 22, 10);
  g.fillCircle(33, 21, 9);
  g.fillStyle(0x39683f, 0.9);
  g.fillCircle(26, 16, 6);
  g.generateTexture('decor_bush', 52, 48);

  g.clear();
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(20, 26, 34, 10);
  g.fillStyle(0x3a4148, 1);
  g.fillPoints(p([[6, 24], [4, 14], [14, 5], [30, 6], [36, 16], [32, 25]]), true);
  g.fillStyle(0x555e66, 1);
  g.fillPoints(p([[8, 22], [7, 14], [15, 7], [27, 8], [31, 15]]), true);
  g.fillStyle(0x6d7780, 0.9);
  g.fillPoints(p([[12, 12], [18, 8], [24, 10], [18, 14]]), true);
  g.fillStyle(0x76865f, 0.6);
  g.fillEllipse(12, 22, 10, 5);
  g.generateTexture('decor_rock', 40, 30);

  g.clear();
  g.lineStyle(3, 0x2b4a32, 1);
  g.lineBetween(12, 20, 8, 6);
  g.lineBetween(12, 20, 12, 4);
  g.lineBetween(12, 20, 17, 7);
  g.lineStyle(2, 0x3a6242, 1);
  g.lineBetween(12, 20, 5, 10);
  g.lineBetween(12, 20, 19, 11);
  g.generateTexture('decor_tuft', 24, 22);

  // --- 可破坏战利品道具（占位；正式图见 design/props-assets.md，键名 prop_*_art） ---
  // 木箱：旧木板 + 铁角包边
  g.clear();
  g.fillStyle(0x000000, 0.22);
  g.fillEllipse(24, 42, 40, 11);
  g.fillStyle(0x4a331f, 1);
  g.fillRoundedRect(6, 10, 36, 33, 3);
  g.fillStyle(0x6b4a2a, 1);
  g.fillRoundedRect(8, 12, 32, 29, 2);
  g.fillStyle(0x815c34, 1);
  g.fillRect(8, 12, 32, 6);
  g.fillStyle(0x59401f, 1);
  g.fillRect(8, 24, 32, 2);
  g.fillRect(8, 33, 32, 2);
  g.fillStyle(0x8a6238, 0.8);
  g.fillRect(10, 14, 6, 26);
  g.fillStyle(0x3b3a42, 1);
  g.fillRect(6, 10, 6, 6); g.fillRect(36, 10, 6, 6);
  g.fillRect(6, 37, 6, 6); g.fillRect(36, 37, 6, 6);
  g.fillStyle(0x9aa3ad, 0.9);
  g.fillRect(8, 12, 2, 2); g.fillRect(38, 12, 2, 2);
  g.generateTexture('prop_crate', 48, 48);

  // 火盆：石座 + 燃烧余烬（发光道具，掉率表更偏功能奖励）
  g.clear();
  g.fillStyle(0x000000, 0.22);
  g.fillEllipse(24, 52, 38, 10);
  g.fillStyle(0x3a4148, 1);
  g.fillRoundedRect(16, 42, 16, 10, 3);
  g.fillStyle(0x4a4f57, 1);
  g.fillRoundedRect(12, 30, 24, 14, 4);
  g.fillStyle(0x666c75, 1);
  g.fillEllipse(24, 30, 30, 12);
  g.fillStyle(0x2b2f35, 1);
  g.fillEllipse(24, 29, 24, 8);
  // 火焰
  g.fillStyle(0xb5341a, 0.9);
  g.fillPoints(p([[24, 4], [31, 15], [33, 23], [24, 28], [15, 23], [17, 14]]), true);
  g.fillStyle(0xff7a20, 1);
  g.fillPoints(p([[24, 9], [29, 17], [29, 24], [24, 27], [19, 23], [20, 16]]), true);
  g.fillStyle(0xffd54d, 1);
  g.fillPoints(p([[24, 15], [27, 20], [25, 25], [22, 24], [21, 19]]), true);
  g.fillStyle(0xfff8ce, 0.95);
  g.fillEllipse(24, 22, 5, 6);
  g.generateTexture('prop_brazier', 48, 58);

  // 墓碑：圆顶石板 + 裂纹 + 苔痕
  g.clear();
  g.fillStyle(0x000000, 0.22);
  g.fillEllipse(23, 52, 38, 10);
  g.fillStyle(0x59616a, 1);
  g.fillRoundedRect(8, 6, 30, 44, { tl: 15, tr: 15, bl: 3, br: 3 });
  g.fillStyle(0x7d8791, 1);
  g.fillRoundedRect(10, 8, 26, 40, { tl: 13, tr: 13, bl: 2, br: 2 });
  g.fillStyle(0x99a3ac, 0.85);
  g.fillRoundedRect(12, 10, 10, 34, { tl: 10, tr: 4, bl: 2, br: 2 });
  g.lineStyle(2, 0x555d66, 0.9);
  g.lineBetween(24, 16, 28, 24);
  g.lineBetween(28, 24, 25, 32);
  g.lineStyle(2, 0x4b535b, 0.65);
  g.lineBetween(15, 20, 31, 20);
  g.lineBetween(17, 27, 29, 27);
  g.fillStyle(0x76865f, 0.85);
  g.fillEllipse(14, 44, 12, 7);
  g.fillEllipse(30, 47, 9, 5);
  g.generateTexture('prop_gravestone', 46, 56);

  // --- 玩家：骑士（GDD §5.3 默认角色），正面 3/4 视角，代码起稿 ---
  g.clear();
  // 披风
  g.fillStyle(0x7e2f2a, 1);
  g.fillPoints(p([[14, 22], [30, 22], [33, 46], [22, 51], [11, 46]]), true);
  g.fillStyle(0x99423a, 1);
  g.fillPoints(p([[16, 24], [28, 24], [30, 43], [22, 47], [14, 43]]), true);
  // 腿
  g.fillStyle(0x2c3340, 1);
  g.fillRoundedRect(15, 40, 6, 12, 2);
  g.fillRoundedRect(23, 40, 6, 12, 2);
  g.fillStyle(0x454f61, 1);
  g.fillRoundedRect(15, 40, 6, 5, 2);
  g.fillRoundedRect(23, 40, 6, 5, 2);
  // 躯干铠甲
  g.fillStyle(0x8d9db5, 1);
  g.fillRoundedRect(12, 20, 20, 22, 7);
  g.fillStyle(0xb9c9de, 1);
  g.fillRoundedRect(14, 21, 12, 18, 6);
  g.fillStyle(0xdde9f7, 0.85);
  g.fillRoundedRect(15, 22, 6, 12, 3);
  // 肩甲
  g.fillStyle(0x6f7f96, 1);
  g.fillEllipse(12, 24, 10, 9);
  g.fillEllipse(32, 24, 10, 9);
  g.fillStyle(0xa8b8cf, 1);
  g.fillEllipse(12, 23, 7, 6);
  g.fillEllipse(32, 23, 7, 6);
  // 腰带
  g.fillStyle(0x584a33, 1);
  g.fillRect(13, 36, 18, 4);
  g.fillStyle(0xd8b25a, 1);
  g.fillRect(20, 36, 5, 4);
  // 头盔
  g.fillStyle(0x9fb0c8, 1);
  g.fillRoundedRect(13, 6, 18, 16, 8);
  g.fillStyle(0xc6d6ea, 1);
  g.fillRoundedRect(14, 7, 12, 9, 6);
  // 面缝
  g.fillStyle(0x1a2129, 1);
  g.fillRoundedRect(16, 13, 12, 4, 2);
  g.fillStyle(0x7fd8ff, 0.9);
  g.fillRect(18, 14, 3, 2);
  g.fillRect(24, 14, 3, 2);
  // 盔顶金饰 + 红缨
  g.fillStyle(0xd8b25a, 1);
  g.fillRect(20, 4, 4, 4);
  g.fillStyle(0xc23b32, 1);
  g.fillPoints(p([[22, 4], [27, 0], [30, 4], [25, 6]]), true);
  g.generateTexture('player_knight', 44, 54);

  // 余烬女巫：尖帽与紫袍形成独立剪影。
  g.clear();
  g.fillStyle(0x351d49, 1); g.fillPoints(p([[8, 49], [14, 20], [31, 20], [37, 49]]), true);
  g.fillStyle(0x69378a, 1); g.fillPoints(p([[13, 47], [17, 23], [28, 23], [33, 47]]), true);
  g.fillStyle(0xf0c8a8, 1); g.fillCircle(22, 19, 9);
  g.fillStyle(0x241332, 1); g.fillPoints(p([[5, 17], [39, 17], [29, 12], [22, 0], [15, 13]]), true);
  g.fillStyle(0x8e50b8, 1); g.fillRect(8, 14, 29, 5);
  g.fillStyle(0xff9b43, 1); g.fillCircle(32, 34, 5);
  g.fillStyle(0xffe28a, 1); g.fillCircle(32, 34, 2);
  g.generateTexture('player_witch', 44, 54);

  // 雷霆游侠：兜帽、长弓与绿披风。
  g.clear();
  g.fillStyle(0x173f2d, 1); g.fillPoints(p([[10, 48], [13, 18], [31, 18], [35, 48], [23, 52]]), true);
  g.fillStyle(0x2d7450, 1); g.fillRoundedRect(13, 18, 19, 27, 6);
  g.fillStyle(0x214b36, 1); g.fillPoints(p([[10, 19], [22, 3], [35, 19], [29, 25], [16, 25]]), true);
  g.fillStyle(0xe7bd98, 1); g.fillEllipse(22, 18, 13, 10);
  g.fillStyle(0x75d8ff, 1); g.fillRect(17, 17, 3, 2); g.fillRect(24, 17, 3, 2);
  g.lineStyle(2, 0xc89447, 1); g.beginPath(); g.arc(38, 28, 15, -1.35, 1.35); g.strokePath();
  g.lineStyle(1, 0xe9d8aa, 1); g.lineBetween(41, 13, 41, 43);
  g.generateTexture('player_ranger', 48, 54);

  // --- 飞刃投射物（朝右，运行时按方向旋转） ---
  g.clear();
  g.fillStyle(0x22303f, 0.55);
  g.fillPoints(p([[0, 6], [8, 1], [34, 4], [40, 6], [34, 8], [8, 11]]), true);
  g.fillStyle(0xc9dcef, 1);
  g.fillPoints(p([[2, 6], [9, 2], [34, 4.5], [40, 6], [34, 7.5], [9, 10]]), true);
  g.fillStyle(0xffffff, 0.95);
  g.fillPoints(p([[10, 5.5], [34, 5], [40, 6], [12, 6.5]]), true);
  g.fillStyle(0x8fa7bd, 1);
  g.fillRect(2, 3, 4, 6);
  g.fillStyle(0xd8b25a, 1);
  g.fillRect(5, 2.5, 2, 7);
  g.generateTexture('blade', 40, 12);

  // --- 经验宝石 ×3 档（青/绿/金），带发光底晕（playtest 反馈：辨识度不足） ---
  const gemSpec = [
    { key: 'gem_small', size: 18, color: 0x3cd6f5 },
    { key: 'gem_mid',   size: 22, color: 0x58e07a },
    { key: 'gem_large', size: 27, color: 0xffd34e },
  ];
  for (const spec of gemSpec) {
    const s = spec.size, c = spec.color;
    const tex = Math.round(s * 2.1);            // 画布比宝石大，容纳光晕
    const cx = tex / 2, cy = tex / 2;
    g.clear();
    // 发光底晕（同色系径向渐变）
    for (let r = tex / 2; r > s * 0.42; r -= 1.5) {
      g.fillStyle(c, 0.028);
      g.fillCircle(cx, cy, r);
    }
    // 菱形宝石本体
    const half = s / 2;
    const top = cy - half, bottom = cy + half;
    g.fillStyle(shade(c, 0.45), 1);
    g.fillPoints(p([[cx, top], [cx + half, cy - half * 0.15], [cx, bottom], [cx - half, cy - half * 0.15]]), true);
    g.fillStyle(c, 1);
    g.fillPoints(p([[cx, top], [cx + half * 0.82, cy - half * 0.2], [cx, cy + half * 0.1], [cx - half * 0.82, cy - half * 0.2]]), true);
    g.fillStyle(shade(c, 1.5), 1);
    g.fillPoints(p([[cx, top + s * 0.08], [cx + half * 0.4, cy - half * 0.28], [cx, cy - half * 0.05], [cx - half * 0.4, cy - half * 0.28]]), true);
    g.fillStyle(0xffffff, 0.85);
    g.fillTriangle(cx - half * 0.28, cy - half * 0.5, cx, top + s * 0.14, cx - half * 0.05, cy - half * 0.38);
    g.lineStyle(1.5, shade(c, 1.6), 0.9);
    g.strokePoints(p([[cx, top], [cx + half, cy - half * 0.15], [cx, bottom], [cx - half, cy - half * 0.15]]), true, true);
    g.generateTexture(spec.key, tex, tex);
  }

  // --- 火球投射物（朝右）：长焰尾收束到白黄弹头，飞行方向一眼可读。 ---
  g.clear();
  g.fillStyle(0x5a100c, 0.96);
  g.fillPoints(p([[1, 15], [18, 7], [28, 2], [35, 8], [46, 4], [67, 15], [46, 27], [36, 22], [27, 29], [19, 21]]), true);
  g.fillStyle(0xc72b12, 1);
  g.fillPoints(p([[9, 15], [27, 9], [35, 5], [43, 10], [64, 15], [43, 22], [33, 19], [24, 24]]), true);
  g.fillStyle(0xff6a17, 1);
  g.fillPoints(p([[20, 15], [37, 10], [44, 8], [63, 15], [44, 21], [35, 18]]), true);
  g.fillEllipse(51, 15, 29, 23);
  g.fillStyle(0xffc52e, 1); g.fillEllipse(54, 15, 21, 16);
  g.fillStyle(0xffff9a, 1); g.fillEllipse(57, 14, 13, 10);
  g.fillStyle(0xffffff, 0.96); g.fillEllipse(60, 13, 7, 6);
  g.generateTexture('fireball', 68, 30);

  // 烈焰路径形态：更粗、更亮的纵火弹头，尾部夹带火舌与暗红火星。
  g.clear();
  g.fillStyle(0x3f0b09, 1);
  g.fillPoints(p([[0, 18], [19, 7], [28, 1], [36, 9], [48, 4], [77, 18], [51, 33], [40, 25], [29, 35], [22, 25], [10, 29]]), true);
  g.fillStyle(0x9f1d10, 1);
  g.fillPoints(p([[8, 18], [28, 10], [38, 6], [47, 12], [74, 18], [48, 27], [37, 23], [25, 29]]), true);
  g.fillStyle(0xf04a16, 1);
  g.fillPoints(p([[20, 18], [40, 11], [48, 9], [72, 18], [48, 26], [37, 22]]), true);
  g.fillEllipse(58, 18, 34, 27);
  g.fillStyle(0xff9121, 1); g.fillEllipse(61, 18, 24, 19);
  g.fillStyle(0xffe052, 1); g.fillEllipse(65, 17, 15, 12);
  g.fillStyle(0xffffff, 0.94); g.fillEllipse(69, 16, 8, 7);
  g.fillStyle(0xff6a17, 1); g.fillCircle(31, 31, 3); g.fillCircle(18, 7, 2.5); g.fillCircle(9, 24, 2);
  g.generateTexture('fireball_blazing', 78, 36);

  // 池化彗尾纹理：白色遮罩由运行时 tint 成暗红/橙/金黄。
  g.clear();
  g.fillStyle(0xffffff, 0.2); g.fillPoints(p([[0, 9], [53, 1], [72, 9], [53, 17]]), true);
  g.fillStyle(0xffffff, 0.58); g.fillPoints(p([[10, 9], [57, 4], [72, 9], [57, 14]]), true);
  g.fillStyle(0xffffff, 1); g.fillPoints(p([[28, 9], [61, 6], [72, 9], [61, 12]]), true);
  g.generateTexture('fire_streak', 72, 18);

  // 集束形态：三枚火瓣围绕主核心，形状语言强调“即将分裂”。
  g.clear();
  g.fillStyle(0x7a1710, 1);
  g.fillPoints(p([[1, 17], [13, 5], [20, 10], [26, 1], [31, 10], [43, 6], [49, 17], [42, 28], [31, 24], [25, 33], [19, 24], [10, 28]]), true);
  g.fillStyle(0xf05a18, 1);
  g.fillCircle(23, 9, 8); g.fillCircle(23, 25, 8); g.fillEllipse(34, 17, 25, 20);
  g.fillStyle(0xffb52d, 1);
  g.fillCircle(25, 10, 4.5); g.fillCircle(25, 24, 4.5); g.fillEllipse(37, 17, 16, 12);
  g.fillStyle(0xfff2a8, 1); g.fillEllipse(40, 16, 8, 6);
  g.lineStyle(2, 0xffe06a, 0.9); g.strokeCircle(31, 17, 11);
  g.generateTexture('fireball_cluster', 50, 34);

  g.clear();
  g.fillStyle(0x7a1710, 1); g.fillPoints(p([[0, 9], [10, 2], [26, 9], [10, 16]]), true);
  g.fillStyle(0xff6a1f, 1); g.fillEllipse(17, 9, 18, 13);
  g.fillStyle(0xffd34e, 1); g.fillEllipse(20, 9, 10, 7);
  g.fillStyle(0xfff7c2, 1); g.fillCircle(23, 8, 2.5);
  g.generateTexture('fire_fragment', 28, 18);

  // --- 药瓶：瓶塞、细颈、厚玻璃和高亮药液在旋转飞行时仍保持可读。 ---
  const drawVenomFlask = (key, dark, liquid, bright, glass, branch) => {
    g.clear();
    g.fillStyle(0x5a371c, 1); g.fillRoundedRect(17, 0, 10, 7, 2);
    g.fillStyle(0x9b6735, 1); g.fillRect(18, 1, 8, 2);
    g.fillStyle(glass, 0.26); g.fillRoundedRect(14, 6, 16, 12, 4); g.fillRoundedRect(5, 13, 34, 29, 12);
    g.lineStyle(2.4, glass, 0.96); g.strokeRoundedRect(14, 6, 16, 12, 4); g.strokeRoundedRect(5, 13, 34, 29, 12);
    g.fillStyle(dark, 0.98); g.fillRoundedRect(7, 23, 30, 17, 9);
    g.fillStyle(liquid, 1); g.fillEllipse(22, 31, 29, 17);
    g.fillStyle(bright, 0.96); g.fillEllipse(16, 27, 9, 7); g.fillCircle(28, 34, 3);
    g.fillStyle(0xffffff, 0.72); g.fillRoundedRect(10, 16, 4, 12, 2); g.fillCircle(16, 12, 1.6);
    if (branch === 'plague') {
      g.fillStyle(0xa6d35f, 0.9); g.fillCircle(18, 34, 2.5); g.fillCircle(28, 27, 2);
    } else if (branch === 'corrosion') {
      g.lineStyle(1.6, 0x6b8117, 1); g.lineBetween(12, 35, 31, 24); g.lineBetween(20, 39, 29, 21);
    } else {
      g.lineStyle(1.2, 0xdfff9a, 0.86); g.strokeCircle(22, 31, 7);
    }
    g.generateTexture(key, 44, 44);
  };
  drawVenomFlask('venom_flask', 0x1e5b31, 0x5bd84f, 0xd8ff88, 0xe9fff0, 'poison');
  drawVenomFlask('venom_flask_plague', 0x263d29, 0x78558f, 0xa6d35f, 0xd8f0dc, 'plague');
  drawVenomFlask('venom_flask_corrosion', 0x647d18, 0xc9f24b, 0xffffc5, 0xf5ffd7, 'corrosion');

  // 圣光弹：以移动方向为正前方的“圣印慧星”，不再是没有方向感的同心圆。
  g.clear();
  g.fillStyle(0xffd45a, 0.08); g.fillEllipse(31, 22, 54, 39);
  g.fillStyle(0xffe889, 0.13); g.fillEllipse(32, 22, 43, 31);
  // 向后展开的三束光羽，让高速反弹时仍能读出轨迹。
  g.fillStyle(0xf2b93f, 0.58);
  g.fillPoints(p([[2, 22], [20, 15], [27, 22], [20, 29]]), true);
  g.fillStyle(0xffed91, 0.82);
  g.fillPoints(p([[8, 8], [25, 17], [22, 22], [13, 18]]), true);
  g.fillPoints(p([[8, 36], [25, 27], [22, 22], [13, 26]]), true);
  g.fillStyle(0xffffff, 0.76);
  g.fillPoints(p([[12, 22], [27, 19], [31, 22], [27, 25]]), true);
  // 金色外环、八向圣印和白炽核心。
  g.lineStyle(3, 0xeeb83e, 0.96); g.strokeCircle(34, 22, 13);
  g.lineStyle(1.5, 0xfff1a6, 0.98); g.strokeEllipse(34, 22, 31, 18);
  g.fillStyle(0xffd45a, 1);
  g.fillPoints(p([[34, 3], [38, 13], [34, 17], [30, 13]]), true);
  g.fillPoints(p([[34, 41], [38, 31], [34, 27], [30, 31]]), true);
  g.fillPoints(p([[15, 22], [25, 18], [29, 22], [25, 26]]), true);
  g.fillPoints(p([[53, 22], [43, 18], [39, 22], [43, 26]]), true);
  g.fillStyle(0xfff1a6, 1); g.fillCircle(34, 22, 10);
  g.fillStyle(0xffffff, 1); g.fillCircle(34, 22, 6);
  g.fillRect(32.5, 10, 3, 24); g.fillRect(22, 20.5, 24, 3);
  g.generateTexture('holy_orb', 56, 44);

  g.clear();
  g.fillStyle(0x56331c, 1);
  g.fillRoundedRect(2, 11, 44, 31, 5);
  g.fillStyle(0x9a5b28, 1);
  g.fillRoundedRect(4, 4, 40, 20, 8);
  g.fillStyle(0xd89a3e, 1);
  g.fillRect(4, 19, 40, 6);
  g.fillStyle(0xffd34e, 1);
  g.fillRoundedRect(20, 17, 9, 14, 2);
  g.fillStyle(0x6b451e, 1);
  g.fillCircle(24.5, 23, 2);
  g.generateTexture('chest', 48, 44);

  // --- 阴影 / 光点 / 辉光 ---
  g.clear();
  g.fillStyle(0x000000, 0.32);
  g.fillEllipse(24, 10, 48, 20);
  g.generateTexture('shadow', 48, 20);

  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillCircle(5, 5, 5);
  g.generateTexture('spark', 10, 10);

  g.clear();
  for (let r = 32; r > 0; r -= 2) {
    g.fillStyle(0xffffff, 0.045);
    g.fillCircle(32, 32, r);
  }
  g.generateTexture('glow', 64, 64);

  // --- 战斗 VFX 纹理（运行时只复用 Image，不创建 Graphics） ---
  g.clear();
  g.lineStyle(5, 0xffffff, 1);
  g.strokeCircle(64, 64, 58);
  g.lineStyle(2, 0xffffff, 0.55);
  g.strokeCircle(64, 64, 50);
  g.generateTexture('fx_ring', 128, 128);

  g.clear();
  g.fillStyle(0x1b100d, 0.78); g.fillEllipse(48, 25, 82, 34);
  g.fillStyle(0x5e2515, 0.34); g.fillEllipse(48, 24, 62, 23);
  g.fillStyle(0xff7a20, 0.55);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    g.fillCircle(48 + Math.cos(a) * (19 + (i % 3) * 5), 24 + Math.sin(a) * (7 + (i % 2) * 3), 2 + (i % 2));
  }
  g.generateTexture('scorch', 96, 52);

  // 火焰爆发遮罩：中心白闪、锯齿火舌和外扩火环由池化粒子缩放播放。
  const fireBurstOuter = [], fireBurstMid = [];
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const outerR = i % 4 === 0 ? 59 : i % 2 === 0 ? 47 : 36;
    const midR = i % 4 === 0 ? 39 : i % 2 === 0 ? 31 : 24;
    fireBurstOuter.push([64 + Math.cos(a) * outerR, 64 + Math.sin(a) * outerR]);
    fireBurstMid.push([64 + Math.cos(a) * midR, 64 + Math.sin(a) * midR]);
  }
  g.clear();
  g.fillStyle(0x8f160d, 0.92); g.fillPoints(p(fireBurstOuter), true);
  g.fillStyle(0xff4a12, 1); g.fillPoints(p(fireBurstMid), true);
  g.fillStyle(0xffa31f, 1); g.fillCircle(64, 64, 27);
  g.fillStyle(0xffee72, 1); g.fillCircle(64, 64, 18);
  g.fillStyle(0xffffff, 0.96); g.fillCircle(64, 62, 9);
  g.generateTexture('fire_burst', 128, 128);

  // Boss 冲锋预警箭头：双层雪佛龙（白色可染色，运行时按危险度上色 + 脉动）。
  g.clear();
  const chevron = (ox, w) => p([
    [ox, 6], [ox + w, 28], [ox, 50], [ox + 11, 50], [ox + w + 11, 28], [ox + 11, 6],
  ]);
  g.fillStyle(0x140804, 0.5); g.fillPoints(chevron(8, 20), true);
  g.fillStyle(0xffffff, 1); g.fillPoints(chevron(10, 20), true);
  g.fillStyle(0xffffff, 0.9); g.fillPoints(chevron(28, 18), true);
  g.generateTexture('charge_arrow', 62, 56);

  // 烈焰路径底面：只承担范围与热度，不再表现岩壳、熔缝或道路。
  const fireFieldShape = p([[64, 5], [87, 10], [104, 20], [119, 39], [116, 58], [123, 78], [104, 102], [83, 115], [61, 121], [38, 115], [18, 101], [7, 82], [11, 62], [5, 43], [23, 23], [44, 12]]);
  g.clear();
  g.fillStyle(0x4a0b04, 0.24); g.fillPoints(fireFieldShape, true);
  g.fillStyle(0xa62308, 0.15);
  g.fillEllipse(43, 48, 59, 46); g.fillEllipse(83, 78, 70, 47); g.fillEllipse(91, 38, 45, 34);
  g.fillStyle(0xff5b0e, 0.07);
  g.fillEllipse(45, 49, 35, 20); g.fillEllipse(84, 79, 43, 21);
  g.fillStyle(0x170503, 0.28);
  g.fillEllipse(31, 81, 27, 13); g.fillEllipse(76, 28, 33, 14); g.fillEllipse(101, 68, 24, 12);
  g.generateTexture('fire_field_base', 128, 128);

  g.clear();
  const fireFieldEdges = [
    [[10, 59], [6, 43], [23, 24], [42, 13]], [[68, 6], [87, 11], [104, 21]],
    [[115, 41], [117, 58], [122, 78]], [[105, 100], [84, 114], [62, 120]],
    [[39, 114], [19, 100], [8, 82]],
  ];
  for (const edge of fireFieldEdges) {
    g.lineStyle(5, 0xb52b0a, 0.36); g.strokePoints(p(edge), false, false);
    g.lineStyle(1.4, 0xff7a18, 0.64); g.strokePoints(p(edge), false, false);
  }
  g.generateTexture('fire_field_edge', 128, 128);

  const coalSets = [
    [[30, 54, 2], [68, 35, 2], [91, 80, 3]],
    [[38, 83, 3], [74, 61, 2], [101, 43, 2]],
    [[29, 39, 2], [63, 91, 2], [96, 68, 3]],
  ];
  for (let variant = 0; variant < coalSets.length; variant++) {
    g.clear();
    for (const [cx, cy, r] of coalSets[variant]) {
      g.fillStyle(0x9b1d07, 0.46); g.fillCircle(cx, cy, r * 2.2);
      g.fillStyle(0xff6412, 0.82); g.fillCircle(cx, cy, r);
      g.fillStyle(0xffd45a, 0.9); g.fillCircle(cx - 0.5, cy - 0.5, Math.max(0.8, r * 0.38));
    }
    g.generateTexture(`fire_field_coals_${variant}`, 128, 128);
  }

  // 三种火舌由粒子池随机播放，依靠缩放/上升/淡出制造持续燃烧动画。
  const groundFlames = [
    [[15, 47], [5, 37], [10, 27], [8, 16], [16, 23], [20, 5], [26, 20], [24, 31], [31, 39]],
    [[14, 47], [4, 39], [9, 30], [6, 21], [15, 25], [12, 8], [22, 17], [27, 31], [30, 40]],
    [[15, 47], [5, 40], [8, 31], [14, 26], [11, 14], [19, 20], [24, 7], [27, 27], [31, 39]],
  ];
  for (let variant = 0; variant < groundFlames.length; variant++) {
    const shape = groundFlames[variant];
    g.clear();
    g.fillStyle(0xff3d08, 0.24); g.fillEllipse(16, 44, 31, 12);
    g.fillStyle(0x8f1608, 0.94); g.fillPoints(p(shape), true);
    g.fillStyle(0xff4b0c, 1); g.fillPoints(p(shape.map(([fx, fy]) => [16 + (fx - 16) * 0.7, 47 + (fy - 47) * 0.76])), true);
    g.fillStyle(0xffa51f, 1); g.fillEllipse(16, 37, 13, 19);
    g.fillStyle(0xffed76, 1); g.fillEllipse(16, 40, 6, 10);
    g.generateTexture(`ground_flame_${variant}`, 34, 50);
  }

  const poolShape = p([[64, 7], [87, 12], [103, 24], [119, 43], [116, 66], [122, 84], [101, 105], [82, 116], [60, 120], [37, 114], [19, 100], [8, 81], [12, 61], [5, 43], [25, 23], [45, 13]]);
  g.clear();
  g.fillStyle(0xffffff, 1); g.fillPoints(poolShape, true);
  g.generateTexture('pool_base', 128, 128);

  g.clear();
  g.lineStyle(3, 0xffffff, 1); g.strokePoints(poolShape, true, true);
  g.lineStyle(1, 0xffffff, 0.4); g.strokeEllipse(65, 64, 95, 77);
  g.generateTexture('pool_edge', 128, 128);

  g.clear();
  g.fillStyle(0xffffff, 0.85);
  g.fillEllipse(40, 49, 31, 16); g.fillEllipse(79, 78, 40, 19); g.fillEllipse(91, 38, 21, 12);
  g.fillStyle(0xffffff, 0.42);
  g.fillEllipse(51, 88, 24, 11); g.fillEllipse(69, 48, 18, 9); g.fillEllipse(28, 72, 16, 10);
  g.generateTexture('pool_patch', 128, 128);

  // 扁鹊式基础毒液区：深绿液体、亮边、缓慢流动的内部药液斑块。
  g.clear();
  g.fillStyle(0x0b2b17, 0.96); g.fillPoints(poolShape, true);
  g.fillStyle(0x16572c, 0.72);
  g.fillEllipse(43, 50, 56, 34); g.fillEllipse(83, 79, 67, 37); g.fillEllipse(91, 37, 39, 24);
  g.fillStyle(0x071b10, 0.62); g.fillEllipse(67, 67, 57, 31);
  g.generateTexture('poison_pool_base', 128, 128);

  g.clear();
  g.lineStyle(7, 0x123e21, 0.92); g.strokePoints(poolShape, true, true);
  g.lineStyle(2.4, 0x62d84f, 0.94); g.strokePoints(poolShape, true, true);
  g.lineStyle(1, 0xcaff8b, 0.58); g.strokeEllipse(65, 65, 99, 82);
  g.generateTexture('poison_pool_edge', 128, 128);

  g.clear();
  g.fillStyle(0x68df57, 0.54);
  g.fillEllipse(38, 46, 31, 13); g.fillEllipse(84, 81, 42, 16); g.fillEllipse(93, 39, 22, 10);
  g.fillStyle(0xd8ff88, 0.52);
  g.fillEllipse(48, 88, 18, 6); g.fillEllipse(69, 50, 16, 7); g.fillCircle(29, 72, 4);
  g.generateTexture('poison_pool_flow', 128, 128);

  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillPoints(p([[48, 31], [59, 15], [63, 29], [83, 19], [76, 36], [94, 42], [75, 48], [84, 65], [63, 55], [50, 69], [45, 54], [24, 62], [31, 46], [7, 39], [32, 34], [25, 20]]), true);
  g.fillEllipse(49, 40, 55, 30);
  g.generateTexture('poison_splash', 96, 72);

  g.clear();
  g.fillStyle(0xffffff, 0.24); g.fillEllipse(16, 22, 27, 15); g.fillEllipse(35, 18, 34, 20); g.fillEllipse(48, 23, 20, 13);
  g.fillStyle(0xffffff, 0.42); g.fillEllipse(27, 16, 21, 12); g.fillEllipse(43, 14, 17, 10);
  g.generateTexture('poison_mist', 58, 34);

  g.clear();
  g.fillStyle(0xffffff, 1); g.fillPoints(p([[1, 5], [13, 1], [10, 11]]), true);
  g.generateTexture('glass_shard', 14, 12);

  g.clear();
  g.fillStyle(0xffffff, 1); g.fillCircle(6, 8, 5); g.fillTriangle(3, 5, 9, 5, 6, 0);
  g.generateTexture('poison_drop', 12, 13);

  g.clear();
  g.fillStyle(0xffffff, 0.38); g.fillCircle(8, 8, 7);
  g.lineStyle(2, 0xffffff, 0.95); g.strokeCircle(8, 8, 6);
  g.fillStyle(0xffffff, 0.85); g.fillCircle(5.5, 5.5, 2);
  g.generateTexture('poison_bubble', 16, 16);

  g.clear();
  g.fillStyle(0xffffff, 1); g.fillPoints(p([[8, 0], [14, 5], [11, 8], [15, 14], [8, 11], [3, 15], [4, 9], [0, 6], [6, 5]]), true);
  g.generateTexture('corrosion_shard', 16, 16);

  g.clear();
  g.lineStyle(3, 0xffffff, 1);
  g.beginPath();
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 ? 50 : 60;
    const x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath(); g.strokePath();
  g.generateTexture('plague_ring', 128, 128);

  // 敌人自带的低成本状态标记；随敌人池一起复用。
  g.clear();
  g.fillStyle(0x16391e, 0.92); g.fillCircle(9, 10, 8);
  g.fillStyle(0x78e05c, 1); g.fillCircle(7, 10, 4); g.fillCircle(12, 7, 3);
  g.lineStyle(1.5, 0xd9ff9b, 1); g.strokeCircle(7, 10, 4); g.strokeCircle(12, 7, 3);
  g.generateTexture('status_poison', 18, 18);

  g.clear();
  g.fillStyle(0x261d2e, 0.94); g.fillCircle(9, 10, 8);
  g.fillStyle(0x8d65a6, 1); g.fillCircle(6, 11, 4); g.fillCircle(12, 7, 3.5);
  g.fillStyle(0xa6d35f, 1); g.fillCircle(12, 12, 2.5);
  g.generateTexture('status_plague', 18, 18);

  g.clear();
  g.fillStyle(0x34420e, 0.94); g.fillPoints(p([[9, 1], [16, 5], [14, 14], [9, 18], [3, 14], [2, 5]]), true);
  g.lineStyle(2, 0xdfff62, 1); g.lineBetween(5, 5, 12, 14); g.lineBetween(12, 4, 7, 15);
  g.generateTexture('status_corrosion', 18, 18);

  // --- 虚拟摇杆 ---
  g.clear();
  g.lineStyle(3, 0xffffff, 0.28);
  g.strokeCircle(60, 60, 56);
  g.fillStyle(0xffffff, 0.05);
  g.fillCircle(60, 60, 56);
  g.generateTexture('joy_base', 120, 120);

  g.clear();
  g.fillStyle(0xffffff, 0.32);
  g.fillCircle(26, 26, 24);
  g.lineStyle(2, 0xffffff, 0.5);
  g.strokeCircle(26, 26, 24);
  g.generateTexture('joy_knob', 52, 52);

  // --- 三选一卡片图标（占位质量，M3 换正式图；GDD M0"占位卡"） ---
  const icon = (key, draw) => {
    if (scene.textures.exists(key)) return;
    g.clear();
    draw();
    g.generateTexture(key, 40, 40);
  };

  icon('icon_blade', () => {
    g.save?.();
    g.fillStyle(0xc9dcef, 1);
    g.fillPoints(p([[6, 34], [26, 8], [34, 4], [30, 12], [10, 38]]), true);
    g.fillStyle(0xffffff, 0.9);
    g.fillPoints(p([[26, 8], [34, 4], [30, 12]]), true);
    g.fillStyle(0xd8b25a, 1);
    g.fillRect(4, 32, 8, 4);
  });

  icon('icon_fireball', () => {
    g.fillStyle(0x9f1c12, 0.92);
    g.fillPoints(p([[20, 2], [29, 14], [33, 24], [28, 34], [20, 38], [12, 34], [7, 24], [11, 13]]), true);
    g.fillStyle(0xff6a1f, 1);
    g.fillPoints(p([[20, 8], [26, 17], [26, 27], [20, 34], [14, 28], [14, 19]]), true);
    g.fillStyle(0xffd34e, 1);
    g.fillPoints(p([[20, 16], [23, 23], [21, 30], [17, 31], [16, 25], [18, 20]]), true);
    g.fillStyle(0xfff7c2, 0.96);
    g.fillPoints(p([[20, 22], [21, 26], [19, 29], [18, 26]]), true);
  });

  icon('icon_frostpulse', () => {
    g.lineStyle(4, 0x72d8ff, 1);
    g.lineBetween(20, 3, 20, 37);
    g.lineBetween(3, 20, 37, 20);
    g.lineBetween(7, 7, 33, 33);
    g.lineBetween(33, 7, 7, 33);
    g.fillStyle(0xe8fbff, 1);
    g.fillCircle(20, 20, 5);
    g.fillStyle(0x72d8ff, 0.45);
    g.fillCircle(20, 20, 12);
  });

  icon('icon_chainlightning', () => {
    g.fillStyle(0xb8a7ff, 1);
    g.fillPoints(p([[24, 1], [9, 22], [18, 22], [13, 39], [32, 16], [23, 16]]), true);
    g.fillStyle(0xf0eaff, 0.9);
    g.fillPoints(p([[23, 6], [14, 19], [21, 19], [18, 30], [28, 18], [21, 18]]), true);
  });

  icon('icon_venomflask', () => {
    g.fillStyle(0xd8e6d5, 1);
    g.fillRoundedRect(16, 2, 8, 8, 2);
    g.fillStyle(0x3f8f4b, 1);
    g.fillRoundedRect(7, 9, 26, 28, 8);
    g.fillStyle(0x78e05c, 1);
    g.fillRoundedRect(10, 16, 20, 17, 5);
    g.fillStyle(0xd9ff9b, 0.9);
    g.fillCircle(16, 20, 4);
  });

  icon('icon_holyorb', () => {
    g.fillStyle(0xffd34e, 0.18); g.fillCircle(20, 20, 19);
    g.lineStyle(3, 0xeeb83e, 1); g.strokeCircle(20, 20, 12);
    g.lineStyle(1.5, 0xfff0a1, 0.95); g.strokeEllipse(20, 20, 33, 19);
    g.fillStyle(0xffd45a, 1);
    g.fillPoints(p([[20, 1], [24, 12], [20, 16], [16, 12]]), true);
    g.fillPoints(p([[20, 39], [24, 28], [20, 24], [16, 28]]), true);
    g.fillPoints(p([[1, 20], [12, 16], [16, 20], [12, 24]]), true);
    g.fillPoints(p([[39, 20], [28, 16], [24, 20], [28, 24]]), true);
    g.fillStyle(0xfff1a6, 1); g.fillCircle(20, 20, 8);
    g.fillStyle(0xffffff, 1); g.fillCircle(20, 20, 4.5);
    g.fillRect(18.5, 9, 3, 22); g.fillRect(9, 18.5, 22, 3);
  });

  icon('icon_boots', () => {
    g.fillStyle(0xd8b25a, 1);
    g.fillPoints(p([[10, 6], [20, 6], [20, 22], [32, 26], [32, 34], [10, 34]]), true);
    g.fillStyle(0xfff0b8, 0.9);
    g.fillRect(10, 6, 10, 5);
    g.fillStyle(0xffffff, 0.75);
    g.lineStyle(2, 0xffffff, 0.75);
    g.lineBetween(4, 14, 12, 14);
    g.lineBetween(2, 20, 10, 20);
    g.lineBetween(4, 26, 10, 26);
  });

  icon('icon_magnet', () => {
    g.lineStyle(9, 0xc23b32, 1);
    g.beginPath();
    g.arc(20, 18, 11, Math.PI, 0, false);
    g.strokePath();
    g.fillStyle(0xc23b32, 1);
    g.fillRect(4.5, 18, 9, 12);
    g.fillRect(26.5, 18, 9, 12);
    g.fillStyle(0xe8ecf2, 1);
    g.fillRect(4.5, 30, 9, 5);
    g.fillRect(26.5, 30, 9, 5);
  });

  icon('icon_gears', () => {
    const teeth = 8;
    g.fillStyle(0x9fb0c8, 1);
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      g.fillRect(19 + Math.cos(a) * 13 - 3, 19 + Math.sin(a) * 13 - 3, 7, 7);
    }
    g.fillCircle(20, 20, 12);
    g.fillStyle(0xc6d6ea, 1);
    g.fillCircle(20, 20, 9);
    g.fillStyle(0x16211a, 1);
    g.fillCircle(20, 20, 4.5);
  });

  icon('icon_battle_emblem', () => {
    // 通用战徽 + 上升箭头，表达全部伤害提升，而非某类武器强化。
    g.fillStyle(0x7a351f, 1);
    g.fillPoints(p([[20, 2], [34, 8], [36, 24], [28, 35], [20, 39], [12, 35], [4, 24], [6, 8]]), true);
    g.lineStyle(2, 0xf4c85c, 1);
    g.strokePoints(p([[20, 2], [34, 8], [36, 24], [28, 35], [20, 39], [12, 35], [4, 24], [6, 8]]), true, true);
    g.fillStyle(0xffdd78, 1);
    g.fillTriangle(20, 7, 30, 19, 24, 19);
    g.fillRect(17, 17, 7, 14);
    g.fillStyle(0xfff1b5, 0.9);
    g.fillTriangle(20, 8, 24, 17, 20, 17);
  });

  icon('icon_core', () => {
    g.fillStyle(0xc23b32, 1);
    g.fillCircle(13, 14, 9);
    g.fillCircle(27, 14, 9);
    g.fillTriangle(4.5, 18, 35.5, 18, 20, 36);
    g.fillStyle(0xff8a7a, 0.9);
    g.fillCircle(13, 12, 4);
  });

  icon('icon_rune', () => {
    g.fillStyle(0x8a6fd8, 1);
    g.fillPoints(p([[20, 2], [36, 20], [20, 38], [4, 20]]), true);
    g.fillStyle(0xb59df0, 1);
    g.fillPoints(p([[20, 6], [32, 20], [20, 34], [8, 20]]), true);
    g.lineStyle(3, 0xf2ecff, 0.95);
    g.lineBetween(20, 11, 20, 29);
    g.lineBetween(14, 17, 26, 23);
    g.lineBetween(26, 17, 14, 23);
  });

  icon('icon_heal', () => {
    g.fillStyle(0x58c98f, 1);
    g.fillCircle(20, 20, 17);
    g.fillStyle(0x7fe3ae, 1);
    g.fillCircle(20, 20, 14);
    g.fillStyle(0xffffff, 1);
    g.fillRect(16, 9, 8, 22);
    g.fillRect(9, 16, 22, 8);
  });

  g.destroy();

  // --- 暗角（canvas 径向渐变，盖在镜头上增加纵深） ---
  if (!scene.textures.exists('vignette')) {
    const size = 512;
    const canvas = scene.textures.createCanvas('vignette', size, size);
    const ctx = canvas.getContext();
    const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.32, size / 2, size / 2, size * 0.52);
    grad.addColorStop(0, 'rgba(6,10,7,0)');
    grad.addColorStop(1, 'rgba(6,10,7,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    canvas.refresh();
  }

  // Boss 冲锋预警：真渐变危险带 + 柔光核心（白色 RGB，运行时染色）。
  // 用 ImageData 逐像素成型：横向从 Boss 端渐亮、末端淡出；纵向羽化，替掉硬边白块。
  makeChargeTexture(scene, 'charge_lane', 256, 64, (hx, vy) => {
    const horiz = hx < 0.06 ? hx / 0.06 : hx > 0.7 ? Math.max(0, (1 - hx) / 0.3) : 1;
    let vert = vy < 0.52 ? 1 : Math.max(0, (1 - vy) / 0.48);
    vert *= vert;                       // 边缘更软
    const rail = Math.max(0, 1 - Math.abs(vy - 0.86) / 0.16) * 0.5; // 两侧亮轨
    return Math.min(1, horiz * (vert * 0.8 + rail)) * 0.9;
  });
  makeChargeTexture(scene, 'charge_core', 256, 14, (hx, vy) => {
    const horiz = hx > 0.88 ? Math.max(0, (1 - hx) / 0.12) : 0.55 + hx * 0.45;
    const gauss = Math.exp(-(vy * vy) * 3.4);
    return horiz * gauss;
  });
}

// 逐像素生成白色 alpha 蒙版纹理（可 setTint 染色）。fn(hx,vy)→alpha[0,1]，
// hx=横向 0..1（0 为原点端），vy=距中线 0..1。
function makeChargeTexture(scene, key, w, h, fn) {
  if (scene.textures.exists(key)) return;
  const canvas = scene.textures.createCanvas(key, w, h);
  const ctx = canvas.getContext();
  const img = ctx.createImageData(w, h);
  const data = img.data;
  const midY = (h - 1) / 2;
  for (let y = 0; y < h; y++) {
    const vy = Math.abs(y - midY) / midY;
    for (let x = 0; x < w; x++) {
      const a = Math.max(0, Math.min(1, fn(x / (w - 1), vy)));
      const idx = (y * w + x) * 4;
      data[idx] = 255; data[idx + 1] = 255; data[idx + 2] = 255; data[idx + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  canvas.refresh();
}

// Rope 光束使用的白色 alpha 蒙版；运行时由顶点色染成外层色和白色核心。
function generateBeamTextures(scene) {
  const makeBeam = (key, width, height, corePower) => {
    if (scene.textures.exists(key)) return;
    const canvas = scene.textures.createCanvas(key, width, height);
    const ctx = canvas.getContext();
    const image = ctx.createImageData(width, height);
    const midY = (height - 1) / 2;
    for (let y = 0; y < height; y++) {
      const distance = Math.abs(y - midY) / Math.max(1, midY);
      const alpha = Math.pow(Math.max(0, 1 - distance), corePower);
      for (let x = 0; x < width; x++) {
        const endFade = Math.min(1, x / 3, (width - 1 - x) / 3);
        const offset = (y * width + x) * 4;
        image.data[offset] = 255;
        image.data[offset + 1] = 255;
        image.data[offset + 2] = 255;
        image.data[offset + 3] = Math.round(alpha * Math.max(0, endFade) * 255);
      }
    }
    ctx.putImageData(image, 0, 0);
    canvas.refresh();
  };
  makeBeam('beam_outer', 64, 28, 1.8);
  makeBeam('beam_core', 64, 8, 0.75);
  makeBeam('electric_spark', 28, 7, 0.9);
}

// 所有 GLSL 特效共用的确定性噪声纹理；本地生成，不产生 Poki 外部资源请求。
function generateVfxNoiseTexture(scene) {
  const key = 'vfx_noise';
  if (scene.textures.exists(key)) return;
  const size = 64;
  const canvas = scene.textures.createCanvas(key, size, size);
  const ctx = canvas.getContext();
  const image = ctx.createImageData(size, size);
  let seed = 0x6d2b79f5;
  for (let i = 0; i < size * size; i++) {
    seed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    seed ^= seed + Math.imul(seed ^ (seed >>> 7), 61 | seed);
    const value = ((seed ^ (seed >>> 14)) >>> 24) & 0xff;
    const offset = i * 4;
    image.data[offset] = value;
    image.data[offset + 1] = value;
    image.data[offset + 2] = value;
    image.data[offset + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  canvas.refresh();
}
