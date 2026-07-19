// ============================================================
// Horde Breaker 全部平衡数值与调优参数集中在此（对应 GDD-HordeBreaker.md）
// 原则：改玩法数值只动这个文件；系统代码不写魔法数字。
// 所有 [TUNE] 标记的数值等 M4 playtest 数据校准。
// ============================================================

export const W = 720, H = 1280; // 逻辑分辨率（EXPAND 模式，实际视口随屏幕扩展）

// ---------- 性能预算（GDD §8.2，硬红线） ----------
export const PERF = {
  maxEnemies: 400,        // 同屏敌人上限
  maxProjectiles: 300,    // 投射物上限
  maxZones: 48,           // 毒池/烈焰火区长期区域上限（满时抢占最旧）
  maxGems: 200,           // 经验宝石上限（超出合并成大宝石）
  maxDamageTexts: 36,     // 伤害数字池
  maxParticles: 180,      // 命中/爆炸/飞行拖尾共用粒子池
  maxPoolBubbles: 24,     // 毒池气泡的全局可见上限
  maxGroundFlames: 48,    // 烈焰路径火苗/火星的独立可见上限
  maxPoisonFlightParticles: 24, // 毒瓶飞行滴液/微光上限
  maxPoisonImpactParticles: 48, // 玻璃破碎/毒液飞溅上限
  maxPoisonShaders: 12, // 同屏独立毒池 GLSL 槽；满时单个 Zone 自动退回 Sprite
  maxElementFieldShaders: 16, // 烈焰路径热浪材质槽；满时保留现有 Sprite 地面火
  maxElementBurstShaders: 12, // 暴风雪/寒霜脉冲/火球热扭曲共享的瞬时 GLSL 槽
  maxCombatPolishShaders: 12, // 圣辉光环/刃风暴共用的瞬时 GLSL 圆形材质槽
  maxBeamSlots: 24,    // 雷链/垂直雷击/棱镜共用的三层 Mesh2D + GLSL 光束槽
  maxIceParticles: 72, // 暴风雪雪花与寒霜脉冲冰屑的独立可见上限
  maxPhysicalParticles: 72, // 飞刃命中、刀光和处决反馈的独立可见上限
  maxElectricParticles: 64, // 雷击命中电火花的独立可见上限
  maxFireTrailParticles: 48, // 火球彗尾/火星的独立可见上限
  maxFireImpactParticles: 72, // 火球爆炸/烈焰喷发的独立可见上限
  maxHolyTrailParticles: 36, // 圣光弹彗尾/光屑的独立可见上限
  maxDeathParticles: 60,  // 高击杀率下死亡爆点不可独占总粒子池
  maxPlagueParticles: 56, // 瘟疫尸爆环/传染轨迹的独立可见上限
  maxBossChargeParticles: 40, // Boss 冲锋尘土拖尾/冲击碎屑的独立可见上限
  maxPropParticles: 24,   // 战利品道具破坏碎屑的独立可见上限
  maxPlagueQueue: 48,     // 尸爆玩法结算积压上限（与视觉采样分离）
  maxPlagueSettlementsPerFrame: 12, // 每帧尸爆玩法结算上限
  maxPlagueBurstsPerFrame: 2, // 单帧最多显示的代表性尸爆
  plagueVisualBurstsPerSec: 12, // 尸爆视觉令牌恢复速率
  plagueVisualMergeRadius: 96,  // 近距离连锁视觉合并半径
  plagueVisualMergeSec: 0.1,    // 同一区域视觉合并时间窗
  plagueVisualMergeSlots: 8,    // 固定空间采样槽，避免运行时分配
  gridCell: 96,           // 空间网格格宽 ≈ 最大敌人直径
  separationNeighbors: 5, // 每敌人每帧最多推挤的邻居数
};

// ---------- 敌人受击表现 ----------
// 受击不用纯白长闪：先以约一帧元素色建立辨识，再用 MULTIPLY 回落恢复原图细节。
export const ENEMY_HIT_FX = Object.freeze({
  normal: Object.freeze({
    duration: 0.085,
    phaseSplit: 0.065,
    pulseScale: 0.03,
    palettes: Object.freeze({
      default: Object.freeze({
        tintA: Object.freeze([0xffaa82, 0xff7f6e, 0xffc09e, 0xffd3b6]),
        tintB: Object.freeze([0xffd8c6, 0xf1c1b2, 0xe7b4a5, 0xffe3d6]),
      }),
      physical: Object.freeze({
        tintA: Object.freeze([0x9ec6ff, 0x5e92e8, 0x7fb1ff, 0xc0dbff]),
        tintB: Object.freeze([0xd9e8ff, 0xbcd2f0, 0xabc5e8, 0xe8f2ff]),
      }),
      fire: Object.freeze({
        tintA: Object.freeze([0xff9a45, 0xe94f32, 0xff6f3c, 0xffc75c]),
        tintB: Object.freeze([0xffd2a4, 0xf1a386, 0xe58b72, 0xffdfb5]),
      }),
      ice: Object.freeze({
        tintA: Object.freeze([0x83e8ff, 0x3db9ed, 0x6bd4ff, 0xb9f6ff]),
        tintB: Object.freeze([0xd2f7ff, 0xa9dcec, 0x92cfe5, 0xe7fcff]),
      }),
      poison: Object.freeze({
        tintA: Object.freeze([0xa7e85c, 0x5fb44e, 0xd1f36a, 0x9d72c4]),
        tintB: Object.freeze([0xd9f0bd, 0xb5d6a7, 0xc7e5ae, 0xd6c4e5]),
      }),
      light: Object.freeze({
        tintA: Object.freeze([0xffdc62, 0xe7a936, 0xffc94f, 0xfff0a3]),
        tintB: Object.freeze([0xffedbf, 0xe9d49d, 0xdfc47e, 0xfff5d5]),
      }),
    }),
  }),
  lightning: Object.freeze({
    duration: 0.12,
    phaseSplit: 0.102,
    pulseScale: 0.052,
    tintA: Object.freeze([0xa897ff, 0x6652d9, 0x806bff, 0x9edcff]),
    tintB: Object.freeze([0xc1b5ff, 0x9686e8, 0x8374d4, 0xc7d5ff]),
  }),
});

// ---------- 元素协同（跨武器 build 钩子） ----------
export const ELEMENT_SYNERGY = {
  lightningChill: {
    slowMult: 1.5,
    freezeMult: 2.0,
    slowLabel: '×1.5',
    freezeLabel: '×2',
    color: '#c9f5ff',
  },
  poisonFire: {
    radius: 82,
    damageMult: 0.38,
    minDamage: 8,
    cooldownSec: 0.35,
    maxTriggersPerFrame: 4,
    maxQueue: 32,
    maxVictims: 8,
    visualMergeRadius: 118,
    visualMergeSec: 0.18,
    source: 'ignite',
    label: 'BLOOM!',
    color: '#ffcf55',
  },
  corrosion: {
    label: 'VULN!',
    color: '#dfff62',
  },
};

// 只为已经落地的跨技能协同提供开局配装提示；没有 Combo 的元素不提示。
export const ELEMENT_COMBO_TIPS = Object.freeze({
  ice: 'combo.tip.ice',
  lightning: 'combo.tip.lightning',
  poison: 'combo.tip.poison',
  fire: 'combo.tip.fire',
});

// ---------- 玩家 ----------
export const PLAYER = {
  speed: 250,             // px/s [TUNE]
  maxHp: 100,
  radius: 18,             // 碰撞半径
  pickupRadius: 90,       // 基础拾取半径 [TUNE]
  magnetSpeed: 560,       // 宝石被吸附的飞行速度
  hurtFlashMs: 120,
  bodyH: 76,              // 立绘目标高度
};

// ---------- 敌人表（M1：7 类敌人） ----------
// dmg=接触伤害，hitCd=同一敌人两次伤害间隔秒，xp=掉落经验值
export const ENEMY_TYPES = {
  slime: {
    key: 'slime', hp: 9.2, dmg: 8, speed: 62, radius: 20, xp: 1,
    hitCd: 0.8, spriteH: 54, tint: null,
  },
  runner: {
    key: 'runner', hp: 6.4, dmg: 6, speed: 112, radius: 18, xp: 1,
    hitCd: 0.7, spriteH: 58, shadowW: 62, tint: null,
  },
  tank: {
    key: 'tank', hp: 27.4, dmg: 14, speed: 40, radius: 28, xp: 3,
    hitCd: 1.0, spriteH: 74, bakedShadow: true, tint: null,
  },
  flyer: {
    key: 'flyer', hp: 19.9, dmg: 10, speed: 92, radius: 19, xp: 2,
    hitCd: 0.75, spriteH: 62, tint: null, flying: true,
    engageRange: 320, windupSec: 0.5, dashSpeed: 380, dashSec: 0.55, recoverSec: 1.2,
  },
  splitter: {
    key: 'splitter', hp: 23.9, dmg: 11, speed: 54, radius: 24, xp: 2,
    hitCd: 0.85, spriteH: 68, tint: null, splits: 2,
  },
  mini: {
    key: 'mini', hp: 4.6, dmg: 4, speed: 98, radius: 12, xp: 1,
    hitCd: 0.65, spriteH: 36, tint: null,
  },
  boss: {
    key: 'boss', hp: 300, dmg: 20, speed: 54, radius: 42, xp: 30,
    hitCd: 0.7, spriteH: 120, bakedShadow: true, tint: null, boss: true,
  },
};

// ---------- 敌人行为差异（每类怪一个明确职责） ----------
export const ENEMY_BEHAVIOR = {
  runner: {
    engageRange: 360,
    windupSec: 0.34,
    dashSec: 0.42,
    recoverSec: 0.72,
    cooldownSec: 2.6,
    dashSpeed: 335,
    eliteWindupMult: 0.78,
    eliteDashSpeedMult: 1.18,
  },
  tank: {
    frontArcDeg: 118,
    frontDamageMult: 0.4,
    eliteFrontDamageMult: 0.25,
    blockLabel: 'BLOCK',
    blockColor: '#b7d7ff',
  },
  flyer: {
    eliteWindupMult: 0.78,
    eliteDashSpeedMult: 1.16,
    eliteRecoverMult: 0.82,
  },
  splitter: {
    eliteExtraSplits: 1,
  },
};

// 敌人生命随局内时间成长：hp × hpGrowth(t)
export function hpGrowth(timeSec) {
  const m = timeSec / 60;
  return 1 + 0.27 * Math.pow(m, 1.12); // [TUNE] 3分钟≈×1.92，5分钟≈×2.64，10分钟≈×4.56
}

// 精英与 Boss 沿用同一条缓和后的成长曲线，再叠加各自倍率维持特殊目标定位。
export function specialHpGrowth(timeSec) {
  return hpGrowth(timeSec);
}

export const ENEMY_VARIANTS = {
  armored: {
    hpMult: 3, scale: 1.23, tint: 0xb97842,
    chanceMultByType: { slime: 1.3, runner: 1, flyer: 1 },
  },
  treasure: {
    hpMult: 5.5, scale: 1.45, tint: 0xffd36d,
    enabledAt: 315, chancePerSpawn: 0.0006, pityAt: 510, maxPerRun: 1,
  },
};

// ---------- 可破坏战利品道具（VS 火盆式战利品，不挡路，作为普通目标参与技能索敌） ----------
// hits=命中次数制（每次伤害事件 -1，与武器数值无关）；直射弹命中道具不消耗穿透。
export const PROPS = {
  firstSpawnAt: 12,       // 开局节奏保护：12 秒后才开始出现
  initialSpawnCount: 5,   // 首次出现时一次铺出，避免慢速补充导致开局地图过空
  targetAlive: 5,         // 首批之后尝试维持的道具数量
  maxAlive: 7,
  spawnIntervalSec: 3,    // 打碎或离开视野后，每次最多补充 1 件
  ringMin: 0.55,         // 生成环 ×viewRadius
  ringMax: 1.12,
  minPlayerDist: 300,    // 不在玩家脚边刷
  minGapPx: 230,         // 道具间最小间距
  despawnMargin: 480,    // 超出 view+margin 静默回收（不掉落）
  types: {
    crate:      { key: 'crate',      hits: 1, radius: 18, spriteH: 44, weight: 0.50 },
    brazier:    { key: 'brazier',    hits: 2, radius: 17, spriteH: 54, weight: 0.30, glow: true },
    gravestone: { key: 'gravestone', hits: 3, radius: 20, spriteH: 56, weight: 0.20 },
  },
  // 掉落权重表 [TUNE]
  loot: {
    xp:     { weight: 40, needPct: 0.25 },
    gems:   { weight: 26, count: 3 },
    heal:   { weight: 19, pct: 0.16 },
    magnet: { weight: 15, radius: 520 }, // 玩家周围的大范围吸取，保留远处宝石的跑图拾取价值
  },
};

// 精英/Boss 已通过宝箱提供一次免费升级，不再叠加动态百分比经验；自身基础经验仍正常掉落。
export const XP_REWARDS = Object.freeze({
  eliteNeedPct: 0,
  bossNeedPct: 0,
});

// ---------- 刷怪时间线（M1 10 分钟完整局；逐段对齐 GDD §4.2/§4.3） ----------
// rate=每秒生成数，maxAlive=该阶段同屏上限，types=权重表
export const SPAWN_TIMELINE = [
  { from: 0,   rate: 1.8,  maxAlive: 60,  types: { slime: 1 } },
  // 0:30 起提前展示战术怪：少量飞行兵和疾行者先进入，不打断新手第一波。
  { from: 30,  rate: 2.5,  maxAlive: 90,  types: { slime: 0.82, runner: 0.10, flyer: 0.08 } },
  { from: 60,  rate: 3.2,  maxAlive: 130, types: { slime: 0.68, runner: 0.20, flyer: 0.12 } },
  // 1:30 起加入铁盾兵；2:30 起加入分裂怪，3 分钟前看齐全部基础兵种。
  { from: 90,  rate: 4.0,  maxAlive: 170, types: { slime: 0.58, runner: 0.24, tank: 0.06, flyer: 0.12 } },
  { from: 150, rate: 4.9,  maxAlive: 220, types: { slime: 0.48, runner: 0.28, tank: 0.10, flyer: 0.10, splitter: 0.04 } },
  { from: 180, rate: 6.0,  maxAlive: 260, types: { slime: 0.44, runner: 0.27, tank: 0.13, flyer: 0.12, splitter: 0.04 } },
  { from: 240, rate: 7.2,  maxAlive: 300, armoredChance: 0.06, types: { slime: 0.40, runner: 0.26, tank: 0.16, flyer: 0.13, splitter: 0.05 } },
  { from: 270, rate: 7.7,  maxAlive: 315, armoredChance: 0.09, types: { slime: 0.38, runner: 0.25, tank: 0.15, flyer: 0.16, splitter: 0.06 } },
  { from: 300, rate: 8.2,  maxAlive: 330, armoredChance: 0.12, types: { slime: 0.34, runner: 0.24, tank: 0.13, flyer: 0.22, splitter: 0.07 } },
  { from: 360, rate: 9.2,  maxAlive: 360, armoredChance: 0.18, types: { slime: 0.32, runner: 0.25, tank: 0.11, flyer: 0.25, splitter: 0.07 } },
  // 7:00 提前提高战术怪占比，为 7:30 双 Boss 预热。
  { from: 420, rate: 10.0, maxAlive: 380, armoredChance: 0.24, types: { slime: 0.30, runner: 0.26, tank: 0.10, flyer: 0.27, splitter: 0.07 } },
  { from: 450, rate: 10.5, maxAlive: 390, armoredChance: 0.27, types: { slime: 0.28, runner: 0.27, tank: 0.09, flyer: 0.29, splitter: 0.07 } },
  { from: 480, rate: 10.5, maxAlive: 390, armoredChance: 0.30, types: { slime: 0.28, runner: 0.27, tank: 0.09, flyer: 0.29, splitter: 0.07 } },
  { from: 540, rate: 11.5, maxAlive: 400, armoredChance: 0.33, types: { slime: 0.26, runner: 0.28, tank: 0.08, flyer: 0.30, splitter: 0.08 } },
  { from: 600, rate: 11.5, maxAlive: 400, armoredChance: 0.36, types: { slime: 0.26, runner: 0.28, tank: 0.08, flyer: 0.30, splitter: 0.08 } },
];

// 脚本事件：精英必掉宝箱；Boss tier 决定生命倍率/演出，final 为终局 Boss。
export const BOSS_HP_MULT = [1, 1.55, 2.2, 2.9, 4.8];
export const ELITE_HP_MULT = 6;
export const BOSS_SKILL = {
  windupSec: 0.8,
  chainWindupSec: 0.65,
  sharedCastGapSec: 2.2,
  engageRange: 620,
  moveSpeedByTier: [0, 62, 62, 62, 0], // 前三关普通追击速度与史莱姆相当；终极 Boss 读 FINAL_BOSS
  chargeSpeedByTier: [0, 500, 525, 550, 600],
  chargeSecByTier: [0, 0.62, 0.65, 0.68, 0.72],
  chargeWidthByTier: [0, 132, 136, 140, 150],
  damageByTier: [0, 18, 20, 22, 25],
  cooldownByTier: [0, 6.5, 6.0, 5.5, 5.0],
  recoverSec: 0.55,
  tier2RunnerCount: 2,
  tier2FireballCooldownMult: 0.5,
  tier2Roar: {
    speedMult: 1.20,
    durationSec: 3,
    cooldownSec: 10,
    firstDelaySec: 4,
    pulseIntervalSec: 0.65,
  },
  finalGuardCount: 6,
  finalGuardCooldownSec: 11,
  finalGuardMaxCasts: 2,
  fireball: {
    damage: 15,
    damagePerTier: 2,      // Tier 1–4：15 / 17 / 19 / 21
    speed: 255,
    projectileRadius: 16,
    explosionRadius: 76,
    castRange: 1300,
    windupSec: 0.55,
    firstDelaySec: 1.6,
    cooldownSec: 5.0,
    minChargeGapSec: 1.7,
    sharedCastLockSec: 1.2,
    trailIntervalSec: 0.045,
    maxActive: 8,
  },
};
export const SPAWN_EVENTS = [
  { at: 0,   kind: 'burst', type: 'slime', count: 8,  ringMin: 520, ringMax: 680 },
  { at: 75,  kind: 'burst', type: 'flyer', count: 6, ringMin: 430, ringMax: 590 },
  { at: 120, kind: 'elite', type: 'runner' },
  { at: 150, kind: 'burst', type: 'slime', count: 36, ringMin: 420, ringMax: 560 },
  { at: 165, kind: 'elite', type: 'tank' },
  { at: 180, kind: 'boss', tier: 1, count: 1 },
  { at: 240, kind: 'elite', type: 'flyer' },
  { at: 285, kind: 'elite', type: 'splitter' },
  { at: 300, kind: 'boss', tier: 2, count: 1, guards: 8 },
  { at: 330, kind: 'burst', type: 'splitter', count: 24, ringMin: 500, ringMax: 680 },
  { at: 450, kind: 'boss', tier: 3, count: 2 },
  { at: 510, kind: 'burst', type: 'splitter', count: 32, ringMin: 500, ringMax: 680 },
  { at: 600, kind: 'boss', tier: 4, count: 1, final: true },
];

// 每局一次的短事件池：1:30 开始、1:50 前结算，给 2:00 精英留出节奏间隔。
// 三种事件统一奖励一个宝箱，确保随机事件不会造成局间成长预算差异。
export const RUN_EVENTS = {
  at: 90,
  keys: ['bounty', 'slaughter', 'rune'],
  bounty: {
    duration: 20,
    type: 'runner',
    hpMult: 8.3, // runner 基础生命下调后，仍保证事件目标相比旧版约 ×2 HP
    speedMult: 1.08,
    scale: 1.5,
    // 保留冰狼原本的蓝白高光；悬赏身份交给独立世界标记表现，避免整只染橙后像低清放大杂兵。
    tint: null,
  },
  slaughter: {
    duration: 20,
    targetKills: 25,
    burstCount: 22,
    burstRingMin: 380,
    burstRingMax: 540,
    burstTypes: { slime: 0.78, runner: 0.22 },
  },
  rune: {
    duration: 20,
    holdSec: 8,
    radius: 135,
    distance: 270,
    guardCount: 10,
    guardRingMin: 210,
    guardRingMax: 300,
  },
};

// 10:00 镜像最终战。玩家进阶提前到 Lv4 后，镜像射击仍固定沿用调整前的基础 Lv5 档，避免终 Boss 被连带削弱。
export const FINAL_BOSS = {
  hp: 5000,
  timeLimitSec: 120,
  projectileDamage: 30,
  moveSpeed: PLAYER.speed,
  windupSec: 0.42,
  maxProjectiles: 16,
  mirrorWeaponLevels: {
    blade: { dmg: 28, count: 4, pierce: 4, cd: 0.78, speed: 720, range: 800 },
    fireball: { dmg: 42, count: 2, pierce: 0, cd: 1.15, speed: 500, range: 760, aoe: 124, aoeMult: 0.70 },
  },
};

export const RUN = {
  duration: 600,
  finalBossTimeLimitSec: FINAL_BOSS.timeLimitSec,
};

export const DIFFICULTIES = {
  easy: { key: 'easy', hpMult: 0.9 },
  normal: { key: 'normal', hpMult: 1.0 },
  hard: { key: 'hard', hpMult: 1.2 },
};

// ---------- M3 局外成长与角色 ----------
export const CHARACTERS = {
  knight: {
    key: 'knight', nameKey: 'character.knight', descKey: 'character.knightDesc',
    texture: 'player_knight_walk', walkAnimation: 'player_knight_walk_right',
    startWeapon: 'blade', cost: 0,
    bonuses: { hpPct: 10 }, color: 0xd8ecff,
  },
  witch: {
    key: 'witch', nameKey: 'character.witch', descKey: 'character.witchDesc',
    texture: 'player_witch_walk', walkAnimation: 'player_witch_walk_right', bakedShadow: true,
    startWeapon: 'fireball', cost: 0,
    bonuses: { cooldownPct: 5 }, color: 0xc998ff,
  },
};

// values 为每级累计收益；costs 为购买该级所需钻石。规则层只读取此表。
export const TALENTS = {
  vitality: { key: 'vitality', nameKey: 'talent.vitality', descKey: 'talent.vitalityDesc', maxLv: 5, values: [3, 5, 8, 10, 13], costs: [20, 35, 55, 80, 115] },
  might: { key: 'might', nameKey: 'talent.might', descKey: 'talent.mightDesc', maxLv: 5, values: [2, 4, 6, 8, 10], costs: [25, 40, 60, 85, 120] },
  haste: { key: 'haste', nameKey: 'talent.haste', descKey: 'talent.hasteDesc', maxLv: 4, values: [2, 3, 5, 6], costs: [25, 45, 70, 105] },
  focus: { key: 'focus', nameKey: 'talent.focus', descKey: 'talent.focusDesc', maxLv: 4, values: [2, 3, 5, 6], costs: [30, 50, 80, 120] },
  wisdom: { key: 'wisdom', nameKey: 'talent.wisdom', descKey: 'talent.wisdomDesc', maxLv: 4, values: [3, 5, 8, 10], costs: [20, 40, 65, 95] },
  reach: { key: 'reach', nameKey: 'talent.reach', descKey: 'talent.reachDesc', maxLv: 4, values: [5, 10, 15, 20], costs: [20, 35, 55, 85] },
  secondWind: {
    key: 'secondWind', nameKey: 'talent.secondWind', descKey: 'talent.secondWindDesc',
    maxLv: 1, values: [1], costs: [500], reviveHpPct: 0.35, reviveInvulnerableSec: 0.8,
  },
  veteran: { key: 'veteran', nameKey: 'talent.veteran', descKey: 'talent.veteranDesc', maxLv: 1, values: [50], costs: [260] },
  reroll: { key: 'reroll', nameKey: 'talent.reroll', descKey: 'talent.rerollDesc', maxLv: 3, values: [1, 2, 3], costs: [80, 150, 240] },
};

export const ECONOMY = {
  survivalSecondsPerDiamond: 20,
  killsPerDiamond: 30,
};

// ---------- 开局增益与激励广告奖励 ----------
export const AD_REWARDS = {
  startBuffs: {
    vitality: { key: 'vitality', hpPct: 15, nameKey: 'ad.buffVitality', descKey: 'ad.buffVitalityDesc' },
    fury: { key: 'fury', damagePct: 12, nameKey: 'ad.buffFury', descKey: 'ad.buffFuryDesc' },
    haste: { key: 'haste', speedPct: 10, pickupPct: 15, nameKey: 'ad.buffHaste', descKey: 'ad.buffHasteDesc' },
  },
  revive: { hpPct: 0.35, invulnerableSec: 1.0, clearRadius: 360 },
  resultBonusPct: 50,
};

export const WORLD_SKINS = {
  forest: { key: 'forest', at: 0, ground: 'ground', tint: 0xffffff },
  blood: { key: 'blood', at: 450, ground: 'ground_blood', tint: 0xd98989 },
};

// 刷怪环：屏幕外环形（GDD §4.1）
export const SPAWN_RING = { min: 820, max: 980 };

// ---------- 经验与升级 ----------
export const XP_GEMS = {
  small: { value: 1,  tier: 0 },
  mid:   { value: 5,  tier: 1 },
  large: { value: 20, tier: 2 },
};
// 升到下一级所需经验 [TUNE]：目标节奏 升级①≈0:30 ②≈1:15 ③≈2:30（GDD §4.3）
export function xpToNext(lv) {
  if (lv <= 8) {
    return Math.round(12 + (lv - 1) * 9 + Math.pow(lv - 1, 2) * 1.3);
  }
  // Lv9–14 平滑过渡到后期曲线；Lv14 起每级仅增加 25 经验。
  if (lv <= 14) return Math.round(139 + (lv - 8) * (131 / 6));
  return 270 + (lv - 14) * 25;
}
export const GEM_MERGE_RADIUS = 240; // 宝石池满时向最近宝石合并的搜索半径

// ---------- 武器表（数据驱动；M1 扩到 6 武器 ×2 进阶，见 GDD §3.5） ----------
// behavior 对应 WeaponManager 中的行为函数；基础形态为 Lv1–3，Lv4 开始进入二选一进阶。
export const WEAPONS = {
  blade: {
    key: 'blade',
    nameKey: 'weapon.blade', descKey: 'weapon.bladeDesc', lvDescKey: 'weapon.blade.lv',
    element: 'physical', color: 0xd8ecff, icon: 'icon_blade',
    behavior: 'projectile', projTexture: 'blade', projRadius: 18,
    maxLv: 3,
    levels: [
      { dmg: 12, count: 1, pierce: 2, cd: 1.05, speed: 640, range: 880 },
      { dmg: 14, count: 2, pierce: 2, cd: 1.00, speed: 660, range: 920 },
      { dmg: 18, count: 2, pierce: 3, cd: 0.92, speed: 680, range: 960 },
    ],
    volleySpreadDeg: 9,   // 多发时扇形夹角
    volleyStaggerMs: 70,  // 多发时逐发间隔
    evolutions: ['bladestorm', 'headhunter'], // M1 进阶二选一占位
  },
  fireball: {
    key: 'fireball',
    nameKey: 'weapon.fireball', descKey: 'weapon.fireballDesc', lvDescKey: 'weapon.fireball.lv',
    element: 'fire', color: 0xff8a3c, icon: 'icon_fireball',
    behavior: 'projectile', projTexture: 'fireball', projRadius: 14,
    maxLv: 3,
    // aoe=爆炸半径，aoeMult=溅射伤害系数（GDD §3.5 抛射爆炸溅射）
    levels: [
      { dmg: 16, count: 1, pierce: 0, cd: 1.70, speed: 460, range: 680, aoe: 84,  aoeMult: 0.60 },
      { dmg: 20, count: 1, pierce: 0, cd: 1.55, speed: 470, range: 700, aoe: 92,  aoeMult: 0.60 },
      { dmg: 26, count: 1, pierce: 0, cd: 1.40, speed: 480, range: 720, aoe: 102, aoeMult: 0.65 },
    ],
    volleySpreadDeg: 14,
    volleyStaggerMs: 90,
    evolutions: ['lavatrail', 'cluster'], // M1 进阶二选一占位
  },
  frostpulse: {
    key: 'frostpulse', nameKey: 'weapon.frostpulse', descKey: 'weapon.frostpulseDesc', lvDescKey: 'weapon.frostpulse.lv',
    element: 'ice', color: 0x72d8ff, icon: 'icon_frostpulse', behavior: 'pulse', maxLv: 3,
    levels: [
      { dmg: 8, cd: 2.35, radius: 185, slow: 0.28, slowDur: 1.3 },
      { dmg: 11, cd: 2.15, radius: 205, slow: 0.31, slowDur: 1.4 },
      { dmg: 15, cd: 1.95, radius: 225, slow: 0.34, slowDur: 1.5 },
    ],
    evolutions: ['blizzard', 'icecage'],
  },
  chainlightning: {
    key: 'chainlightning', nameKey: 'weapon.chainlightning', descKey: 'weapon.chainlightningDesc', lvDescKey: 'weapon.chainlightning.lv',
    element: 'lightning', color: 0xb8a7ff, icon: 'icon_chainlightning', behavior: 'chain', maxLv: 3,
    levels: [
      { dmg: 13, cd: 1.65, chains: 4, jump: 210 },
      { dmg: 17, cd: 1.52, chains: 4, jump: 220 },
      { dmg: 22, cd: 1.38, chains: 5, jump: 230 },
    ],
    evolutions: ['stormeye', 'thunderjudgment'],
  },
  venomflask: {
    key: 'venomflask', nameKey: 'weapon.venomflask', descKey: 'weapon.venomflaskDesc', lvDescKey: 'weapon.venomflask.lv',
    element: 'poison', color: 0x78e05c, icon: 'icon_venomflask', behavior: 'pool', projTexture: 'venom_flask', maxLv: 3,
    levels: [
      { dmg: 5, cd: 2.30, radius: 92, duration: 3.2, tick: 0.5, poisonDps: 5, speed: 420 },
      { dmg: 7, cd: 2.10, radius: 102, duration: 3.4, tick: 0.5, poisonDps: 7, speed: 430 },
      { dmg: 9, cd: 1.90, radius: 112, duration: 3.7, tick: 0.45, poisonDps: 9, speed: 440 },
    ],
    evolutions: ['plague', 'corrosion'],
  },
  holyorb: {
    key: 'holyorb', nameKey: 'weapon.holyorb', descKey: 'weapon.holyorbDesc', lvDescKey: 'weapon.holyorb.lv',
    element: 'light', color: 0xffef91, icon: 'icon_holyorb', behavior: 'bounce', projTexture: 'holy_orb', projRadius: 14, maxLv: 3,
    levels: [
      { dmg: 11, count: 1, cd: 2.40, speed: 320, duration: 4.5, rehit: 1.1 },
      { dmg: 14, count: 1, cd: 2.20, speed: 335, duration: 4.6, rehit: 1.1 },
      { dmg: 17, count: 1, cd: 2.05, speed: 350, duration: 4.8, rehit: 1.1 },
    ],
    evolutions: ['holyhalo', 'prism'],
  },
};

export const EVOLUTION_LEVEL_START = 4;
export const EVOLUTION_EARLY_POWER = Object.freeze({ lv4: 0.60, lv5: 0.80 });
const EVOLUTION_POWER_KEYS = Object.freeze(['dmg', 'trailDmg', 'fragmentDmg', 'rayDmg', 'poisonDps', 'heal']);

function scaledEvolutionLevel(lv6, scale) {
  const level = { ...lv6 };
  for (const key of EVOLUTION_POWER_KEYS) {
    const value = level[key];
    if (!Number.isFinite(value)) continue;
    const scaled = value * scale;
    level[key] = Number.isInteger(value)
      ? Math.max(1, Math.round(scaled))
      : Math.round(scaled * 1000) / 1000;
  }
  return level;
}

function evolutionLevels(lv6, lv7) {
  return [
    scaledEvolutionLevel(lv6, EVOLUTION_EARLY_POWER.lv4),
    scaledEvolutionLevel(lv6, EVOLUTION_EARLY_POWER.lv5),
    lv6,
    lv7,
  ];
}

// 进阶形态从 Lv4 开始、Lv7 封顶；Lv4/Lv5 为削弱档，Lv6/Lv7 保留原数值。
export const EVOLUTIONS = {
  bladestorm: {
    key: 'bladestorm', baseKey: 'blade', nameKey: 'evo.bladestorm', descKey: 'evo.bladestormDesc',
    icon: 'icon_blade', color: 0x9ddcff, behavior: 'orbit', levelStart: EVOLUTION_LEVEL_START, maxLv: 7,
    levels: evolutionLevels(
      { dmg: 34, count: 6, cd: 0.36, orbitRadius: 116, speed: 2.8 },
      { dmg: 38, count: 7, cd: 0.34, orbitRadius: 128, speed: 3.0 },
    ),
  },
  headhunter: {
    key: 'headhunter', baseKey: 'blade', nameKey: 'evo.headhunter', descKey: 'evo.headhunterDesc',
    icon: 'icon_blade', color: 0xffd36d, behavior: 'homing', projTexture: 'blade', projRadius: 18, levelStart: EVOLUTION_LEVEL_START, maxLv: 7,
    levels: evolutionLevels(
      { dmg: 58, count: 2, cd: 0.72, speed: 610, range: 1150, pierce: 1, homing: 5.0, crit: 0.30, execute: 0.18 },
      { dmg: 68, count: 2, cd: 0.64, speed: 640, range: 1220, pierce: 1, homing: 5.6, crit: 0.34, execute: 0.20 },
    ),
  },
  lavatrail: {
    key: 'lavatrail', baseKey: 'fireball', nameKey: 'evo.lavatrail', descKey: 'evo.lavatrailDesc',
    // 内部 key 保留以兼容旧存档；玩家可见名称已改为“烈焰路径”。
    icon: 'icon_fireball', color: 0xff5d2e, behavior: 'lava', projTexture: 'fireball_blazing', projRadius: 16, levelStart: EVOLUTION_LEVEL_START, maxLv: 7,
    levels: evolutionLevels(
      { dmg: 44, count: 2, cd: 1.12, speed: 500, range: 840, pierce: 0, aoe: 128, aoeMult: 0.65, trailRadius: 62, trailDmg: 7, trailLife: 2.6 },
      { dmg: 38, count: 3, cd: 1.05, speed: 530, range: 900, pierce: 0, aoe: 140, aoeMult: 0.65, trailRadius: 70, trailDmg: 9, trailLife: 3.0 },
    ),
  },
  cluster: {
    key: 'cluster', baseKey: 'fireball', nameKey: 'evo.cluster', descKey: 'evo.clusterDesc',
    icon: 'icon_fireball', color: 0xffb23f, behavior: 'cluster', projTexture: 'fireball_cluster', projRadius: 17, levelStart: EVOLUTION_LEVEL_START, maxLv: 7,
    levels: evolutionLevels(
      { dmg: 60, count: 1, cd: 1.05, speed: 500, range: 820, pierce: 0, aoe: 124, aoeMult: 0.68, fragments: 5, fragmentDmg: 20 },
      { dmg: 44, count: 2, cd: 1.02, speed: 520, range: 880, pierce: 0, aoe: 132, aoeMult: 0.70, fragments: 7, fragmentDmg: 20 },
    ),
  },
  blizzard: {
    key: 'blizzard', baseKey: 'frostpulse', nameKey: 'evo.blizzard', descKey: 'evo.blizzardDesc',
    icon: 'icon_frostpulse', color: 0x7adfff, behavior: 'field', levelStart: EVOLUTION_LEVEL_START, maxLv: 7,
    levels: evolutionLevels(
      { dmg: 15, cd: 0.65, radius: 330, slow: 0.48, slowDur: 1.2 },
      { dmg: 18, cd: 0.58, radius: 365, slow: 0.52, slowDur: 1.4 },
    ),
  },
  icecage: {
    key: 'icecage', baseKey: 'frostpulse', nameKey: 'evo.icecage', descKey: 'evo.icecageDesc',
    icon: 'icon_frostpulse', color: 0xb9f1ff, behavior: 'pulse', levelStart: EVOLUTION_LEVEL_START, maxLv: 7,
    levels: evolutionLevels(
      { dmg: 34, cd: 1.35, radius: 295, slow: 0.45, slowDur: 2.0, freezeChance: 0.20, freezeDur: 1.2 },
      { dmg: 42, cd: 1.18, radius: 325, slow: 0.48, slowDur: 2.2, freezeChance: 0.28, freezeDur: 1.3 },
    ),
  },
  stormeye: {
    key: 'stormeye', baseKey: 'chainlightning', nameKey: 'evo.stormeye', descKey: 'evo.stormeyeDesc',
    icon: 'icon_chainlightning', color: 0xa897ff, behavior: 'storm', levelStart: EVOLUTION_LEVEL_START, maxLv: 7,
    levels: evolutionLevels(
      { dmg: 36, cd: 0.72, bolts: 2, radius: 520, splash: 68 },
      { dmg: 36, cd: 0.72, bolts: 3, radius: 600, splash: 76 },
    ),
  },
  thunderjudgment: {
    key: 'thunderjudgment', baseKey: 'chainlightning', nameKey: 'evo.thunderjudgment', descKey: 'evo.thunderjudgmentDesc',
    icon: 'icon_chainlightning', color: 0xe2d7ff, behavior: 'chain', levelStart: EVOLUTION_LEVEL_START, maxLv: 7,
    levels: evolutionLevels(
      { dmg: 104, cd: 0.96, chains: 2, jump: 280, stunChance: 0.36, stunDur: 0.65 },
      { dmg: 106, cd: 0.92, chains: 3, jump: 320, stunChance: 0.46, stunDur: 0.80 },
    ),
  },
  plague: {
    key: 'plague', baseKey: 'venomflask', nameKey: 'evo.plague', descKey: 'evo.plagueDesc',
    icon: 'icon_venomflask', color: 0x7f6aa8, behavior: 'pool', projTexture: 'venom_flask_plague', levelStart: EVOLUTION_LEVEL_START, maxLv: 7,
    levels: evolutionLevels(
      { dmg: 16, cd: 1.25, radius: 150, duration: 4.8, tick: 0.40, poisonDps: 20, speed: 480, plague: true, plagueChainDepth: 1 },
      { dmg: 18, cd: 1.10, radius: 168, duration: 5.2, tick: 0.36, poisonDps: 24, speed: 500, plague: true, plagueChainDepth: 1 },
    ),
  },
  corrosion: {
    key: 'corrosion', baseKey: 'venomflask', nameKey: 'evo.corrosion', descKey: 'evo.corrosionDesc',
    icon: 'icon_venomflask', color: 0xc9f24b, behavior: 'pool', projTexture: 'venom_flask_corrosion', levelStart: EVOLUTION_LEVEL_START, maxLv: 7,
    levels: evolutionLevels(
      { dmg: 16, cd: 1.25, radius: 152, duration: 4.8, tick: 0.40, poisonDps: 18, speed: 480, vuln: 0.14, vulnDur: 1.8 },
      { dmg: 18, cd: 1.10, radius: 170, duration: 5.2, tick: 0.36, poisonDps: 22, speed: 510, vuln: 0.20, vulnDur: 2.2 },
    ),
  },
  holyhalo: {
    key: 'holyhalo', baseKey: 'holyorb', nameKey: 'evo.holyhalo', descKey: 'evo.holyhaloDesc',
    icon: 'icon_holyorb', color: 0xffef9a, behavior: 'aura', levelStart: EVOLUTION_LEVEL_START, maxLv: 7,
    levels: evolutionLevels(
      { dmg: 22, cd: 0.72, radius: 168, heal: 0.50 },
      { dmg: 26, cd: 0.62, radius: 190, heal: 0.75 },
    ),
  },
  prism: {
    key: 'prism', baseKey: 'holyorb', nameKey: 'evo.prism', descKey: 'evo.prismDesc',
    icon: 'icon_holyorb', color: 0xfff4c2, behavior: 'bounce', projTexture: 'holy_orb', projRadius: 16, levelStart: EVOLUTION_LEVEL_START, maxLv: 7,
    levels: evolutionLevels(
      { dmg: 26, count: 2, cd: 1.45, speed: 410, duration: 5.1, rehit: 1.2, splitRays: 2, rayDmg: 8 },
      { dmg: 29, count: 2, cd: 1.32, speed: 435, duration: 5.5, rehit: 1.15, splitRays: 3, rayDmg: 8 },
    ),
  },
};

// ---------- 直接技能制（当前 12 个；不再走 Lv4 二选一进阶） ----------
// 每个技能从 Lv1 就拥有完整行为，Lv1→Lv8 共选择 7 次模块。
// 模块分为规模 / 威力 / 特性，每类最多 4 级；技能在 Lv8 封顶，因此每局只能取得 7 次模块成长。
// 威力模块每级增加基础伤害的 37.5%；Lv1 基础输出已经包含统一的前期强化。
export const ACTIVE_SKILL_KEYS = Object.freeze([
  'bladestorm', 'headhunter', 'lavatrail', 'cluster', 'blizzard', 'icecage',
  'stormeye', 'thunderjudgment', 'plague', 'corrosion', 'holyhalo', 'prism',
]);
export const DEFAULT_MAIN_SKILL = 'lavatrail';
export const SKILL_MODULE_KEYS = Object.freeze(['scale', 'power', 'trait']);
export const SKILL_POWER_PER_RANK = 0.375;
export const SKILL_MODULE_MAX_RANK = 4;

export const SKILLS = Object.freeze({
  bladestorm: {
    key: 'bladestorm', nameKey: 'evo.bladestorm', descKey: 'evo.bladestormDesc',
    element: 'physical', icon: 'icon_blade', color: 0x9ddcff,
    behavior: 'orbit', projTexture: 'blade', projRadius: 18, maxLv: 8,
    baseParams: {
      dmg: 14, count: 3, cd: 0.70, orbitRadius: 105, speed: 2.4,
    },
    modules: {
      scale: [
        { add: { count: 2 }, text: { en: 'Orbiting blades +2', zh: '环绕飞刃 +2' } },
        { add: { count: 2 }, text: { en: 'Orbiting blades +2', zh: '环绕飞刃 +2' } },
        { add: { count: 2 }, text: { en: 'Orbiting blades +2', zh: '环绕飞刃 +2' } },
        { add: { count: 2 }, text: { en: 'Orbiting blades +2', zh: '环绕飞刃 +2' } },
      ],
      trait: [
        { basePct: { speed: 20, orbitRadius: 10 }, set: { cd: 0.65 }, text: { en: 'Speed +20%, radius +10%, repeat-hit interval: 0.65s', zh: '旋转速度 +20%，环绕半径 +10%，复击降至 0.65 秒' } },
        { basePct: { speed: 20, orbitRadius: 10 }, set: { cd: 0.60 }, text: { en: 'Speed +20%, radius +10%, repeat-hit interval: 0.60s', zh: '旋转速度 +20%，环绕半径 +10%，复击降至 0.60 秒' } },
        { basePct: { speed: 20, orbitRadius: 10 }, set: { cd: 0.55 }, text: { en: 'Speed +20%, radius +10%, repeat-hit interval: 0.55s', zh: '旋转速度 +20%，环绕半径 +10%，复击降至 0.55 秒' } },
        { basePct: { speed: 20, orbitRadius: 10 }, set: { cd: 0.50 }, text: { en: 'Speed +20%, radius +10%, repeat-hit interval: 0.50s', zh: '旋转速度 +20%，环绕半径 +10%，复击降至 0.50 秒' } },
      ],
    },
  },
  headhunter: {
    key: 'headhunter', nameKey: 'evo.headhunter', descKey: 'evo.headhunterDesc',
    element: 'physical', icon: 'icon_blade', color: 0xffd36d,
    behavior: 'headhunter', projTexture: 'blade', projRadius: 18, maxLv: 8,
    volleyStaggerMs: 55,
    baseParams: {
      dmg: 34, count: 1, pierce: 1, cd: 1.20, speed: 900, range: 1200,
      crit: 0.20, bossMult: 1.50,
    },
    modules: {
      scale: [
        { add: { count: 1 }, text: { en: 'Targeted blade +1', zh: '锁敌飞镖 +1' } },
        { add: { count: 1 }, text: { en: 'Targeted blade +1', zh: '锁敌飞镖 +1' } },
        { add: { count: 1 }, text: { en: 'Targeted blade +1', zh: '锁敌飞镖 +1' } },
        { add: { count: 1 }, text: { en: 'Targeted blade +1', zh: '锁敌飞镖 +1' } },
      ],
      trait: [
        { add: { crit: 0.10, bossMult: 0.10 }, set: { cd: 1.10 }, text: { en: 'Crit +10%, boss damage +10%, cooldown: 1.10s', zh: '暴击率 +10%，Boss 伤害 +10%，冷却降至 1.10 秒' } },
        { add: { crit: 0.10, bossMult: 0.15 }, text: { en: 'Crit +10%, boss damage +15%', zh: '暴击率 +10%，Boss 伤害 +15%' } },
        { add: { crit: 0.10, bossMult: 0.15 }, text: { en: 'Crit +10%, boss damage +15%', zh: '暴击率 +10%，Boss 伤害 +15%' } },
        { add: { crit: 0.10, bossMult: 0.20 }, text: { en: 'Crit +10%, boss damage +20%', zh: '暴击率 +10%，Boss 伤害 +20%' } },
      ],
    },
  },
  lavatrail: {
    key: 'lavatrail', nameKey: 'evo.lavatrail', descKey: 'evo.lavatrailDesc',
    element: 'fire', icon: 'icon_fireball', color: 0xff5d2e,
    behavior: 'lava', projTexture: 'fireball_blazing', projRadius: 16, maxLv: 8,
    volleySpreadDeg: 14, volleyStaggerMs: 90,
    baseParams: {
      dmg: 13.5, count: 2, pierce: 0, cd: 1.70, speed: 460, range: 720,
      aoe: 72, aoeMult: 0.60,
      trailRadius: 45, trailDmg: 2.5, trailLife: 2, trailTick: 0.5,
    },
    modules: {
      scale: [
        { add: { count: 1 }, text: { en: 'Fireball +1', zh: '火球 +1' } },
        { add: { count: 1 }, text: { en: 'Fireball +1', zh: '火球 +1' } },
        { add: { count: 1 }, text: { en: 'Fireball +1', zh: '火球 +1' } },
        { add: { count: 1 }, text: { en: 'Fireball +1', zh: '火球 +1' } },
      ],
      trait: [
        { add: { trailLife: 0.8 }, basePct: { trailRadius: 20 }, text: { en: 'Path width +20%, duration +0.8s', zh: '路径宽度 +20%，火区持续 +0.8 秒' } },
        { add: { trailLife: 0.8 }, basePct: { trailRadius: 20 }, text: { en: 'Path width +20%, duration +0.8s', zh: '路径宽度 +20%，火区持续 +0.8 秒' } },
        { add: { trailLife: 0.8 }, basePct: { trailRadius: 20 }, text: { en: 'Path width +20%, duration +0.8s', zh: '路径宽度 +20%，火区持续 +0.8 秒' } },
        { add: { trailLife: 0.8 }, basePct: { trailRadius: 20 }, set: { trailTick: 0.4 }, text: { en: 'Width +20%, duration +0.8s, damage interval: 0.40s', zh: '路径宽度 +20%，持续 +0.8 秒，跳伤间隔降至 0.40 秒' } },
      ],
    },
  },
  cluster: {
    key: 'cluster', nameKey: 'evo.cluster', descKey: 'evo.clusterDesc',
    element: 'fire', icon: 'icon_fireball', color: 0xffb23f,
    behavior: 'cluster', projTexture: 'fireball_cluster', projRadius: 17, maxLv: 8,
    fragmentsPerProjectile: true,
    volleySpreadDeg: 14, volleyStaggerMs: 90,
    baseParams: {
      dmg: 17, count: 2, pierce: 0, cd: 1.80, speed: 470, range: 720,
      aoe: 88, aoeMult: 0.65, fragments: 3, fragmentDmg: 8.5,
      fragmentAoe: 44, fragmentRange: 270,
    },
    modules: {
      scale: [
        { add: { fragments: 2 }, text: { en: 'Fragments per fireball +2', zh: '每颗火球的爆裂碎片 +2' } },
        { add: { fragments: 2 }, text: { en: 'Fragments per fireball +2', zh: '每颗火球的爆裂碎片 +2' } },
        { add: { count: 1 }, text: { en: 'Main fireball +1', zh: '主火球 +1' } },
        { add: { fragments: 4 }, text: { en: 'Fragments per fireball +4', zh: '每颗火球的爆裂碎片 +4' } },
      ],
      trait: [
        { basePct: { aoe: 20 }, text: { en: 'Explosion radius +20%', zh: '爆炸范围 +20%' } },
        { set: { aoeMult: 0.80 }, text: { en: 'Main explosion splash damage: 80%', zh: '主爆炸溅射伤害升至 80%' } },
        { basePct: { aoe: 20 }, text: { en: 'Explosion radius +20%', zh: '爆炸范围 +20%' } },
        { basePct: { fragmentAoe: 30 }, text: { en: 'Fragment explosion radius +30%', zh: '碎片爆炸范围 +30%' } },
      ],
    },
  },
  blizzard: {
    key: 'blizzard', nameKey: 'evo.blizzard', descKey: 'evo.blizzardDesc',
    element: 'ice', icon: 'icon_frostpulse', color: 0x7adfff,
    behavior: 'field', maxLv: 8,
    baseParams: {
      dmg: 6, cd: 0.8, radius: 220, slow: 0.25, slowDur: 1,
    },
    modules: {
      scale: [
        { basePct: { radius: 20 }, text: { en: 'Blizzard radius +20%', zh: '暴风雪范围 +20%' } },
        { basePct: { radius: 20 }, text: { en: 'Blizzard radius +20%', zh: '暴风雪范围 +20%' } },
        { basePct: { radius: 20 }, text: { en: 'Blizzard radius +20%', zh: '暴风雪范围 +20%' } },
        { basePct: { radius: 20 }, text: { en: 'Blizzard radius +20%', zh: '暴风雪范围 +20%' } },
      ],
      trait: [
        { add: { slow: 0.08 }, text: { en: 'Slow strength +8%', zh: '减速强度 +8%' } },
        { add: { slow: 0.08 }, set: { cd: 0.72 }, text: { en: 'Slow +8%, damage interval: 0.72s', zh: '减速强度 +8%，伤害间隔降至 0.72 秒' } },
        { add: { slow: 0.08 }, text: { en: 'Slow strength +8%', zh: '减速强度 +8%' } },
        { add: { slow: 0.08 }, set: { cd: 0.60 }, text: { en: 'Slow +8%, damage interval: 0.60s', zh: '减速强度 +8%，伤害间隔降至 0.60 秒' } },
      ],
    },
  },
  icecage: {
    key: 'icecage', nameKey: 'evo.icecage', descKey: 'evo.icecageDesc',
    element: 'ice', icon: 'icon_frostpulse', color: 0xb9f1ff,
    behavior: 'pulse', maxLv: 8,
    baseParams: {
      dmg: 29, cd: 3.0, radius: 180,
      freezeChance: 0.25, freezeDur: 1.1,
    },
    modules: {
      scale: [
        { basePct: { radius: 15 }, text: { en: 'Cage radius +15%', zh: '牢笼范围 +15%' } },
        { basePct: { radius: 15 }, text: { en: 'Cage radius +15%', zh: '牢笼范围 +15%' } },
        { basePct: { radius: 15 }, text: { en: 'Cage radius +15%', zh: '牢笼范围 +15%' } },
        { basePct: { radius: 15 }, text: { en: 'Cage radius +15%', zh: '牢笼范围 +15%' } },
      ],
      trait: [
        { add: { freezeChance: 0.15 }, set: { cd: 2.8 }, text: { en: 'Freeze chance +15%, cooldown: 2.8s', zh: '冻结概率 +15%，冷却降至 2.8 秒' } },
        { add: { freezeDur: 0.3 }, set: { cd: 2.6 }, text: { en: 'Freeze duration +0.3s, cooldown: 2.6s', zh: '冻结时间 +0.3 秒，冷却降至 2.6 秒' } },
        { add: { freezeChance: 0.15 }, set: { cd: 2.4 }, text: { en: 'Freeze chance +15%, cooldown: 2.4s', zh: '冻结概率 +15%，冷却降至 2.4 秒' } },
        { add: { freezeChance: 0.15, freezeDur: 0.4 }, set: { cd: 2.1 }, text: { en: 'Cooldown: 2.1s, freeze +15% for +0.4s', zh: '冷却降至 2.1 秒，冻结概率 +15%、时间 +0.4 秒' } },
      ],
    },
  },
  stormeye: {
    key: 'stormeye', nameKey: 'evo.stormeye', descKey: 'evo.stormeyeDesc',
    element: 'lightning', icon: 'icon_chainlightning', color: 0xa897ff,
    behavior: 'storm', maxLv: 8,
    baseParams: {
      dmg: 15.5, cd: 1.1, bolts: 2, radius: 450,
      splash: 48, splashMult: 0.60,
    },
    modules: {
      scale: [
        { add: { bolts: 1 }, text: { en: 'Lightning strike +1 per volley', zh: '每轮雷击 +1' } },
        { add: { bolts: 1 }, text: { en: 'Lightning strike +1 per volley', zh: '每轮雷击 +1' } },
        { add: { bolts: 1 }, text: { en: 'Lightning strike +1 per volley', zh: '每轮雷击 +1' } },
        { add: { bolts: 1 }, text: { en: 'Lightning strike +1 per volley', zh: '每轮雷击 +1' } },
      ],
      trait: [
        { basePct: { cd: -10, splash: 15 }, text: { en: 'Cooldown -10%, splash radius +15%', zh: '冷却 -10%，溅射范围 +15%' } },
        { basePct: { radius: 25, splash: 15 }, set: { splashMult: 0.70 }, text: { en: 'Targeting +25%, splash +15%, splash damage: 70%', zh: '索敌 +25%，溅射范围 +15%，溅射伤害升至 70%' } },
        { basePct: { cd: -15, splash: 15 }, text: { en: 'Cooldown -15%, splash radius +15%', zh: '冷却 -15%，溅射范围 +15%' } },
        { basePct: { cd: -15, radius: 25, splash: 15 }, set: { splashMult: 0.80 }, text: { en: 'Cooldown -15%, targeting +25%, splash +15%, splash damage: 80%', zh: '冷却 -15%，索敌 +25%，溅射 +15%，溅射伤害升至 80%' } },
      ],
    },
  },
  thunderjudgment: {
    key: 'thunderjudgment', nameKey: 'evo.thunderjudgment', descKey: 'evo.thunderjudgmentDesc',
    element: 'lightning', icon: 'icon_chainlightning', color: 0xe2d7ff,
    behavior: 'judgment', maxLv: 8,
    baseParams: {
      dmg: 27, cd: 1.8, radius: 900,
      bounces: 2, jump: 280, bounceMult: 0.70,
      stunChance: 0.14, stunDur: 0.5,
    },
    modules: {
      scale: [
        { add: { bounces: 1 }, text: { en: 'Bounce target +1', zh: '弹射目标 +1' } },
        { add: { bounces: 1 }, text: { en: 'Bounce target +1', zh: '弹射目标 +1' } },
        { add: { bounces: 1 }, text: { en: 'Bounce target +1', zh: '弹射目标 +1' } },
        { add: { bounces: 1 }, text: { en: 'Bounce target +1', zh: '弹射目标 +1' } },
      ],
      trait: [
        { add: { stunChance: 0.10 }, set: { bounceMult: 0.775 }, text: { en: 'Stun +10%, bounce damage: 77.5%', zh: '眩晕率 +10%，弹射伤害升至 77.5%' } },
        { add: { stunDur: 0.2 }, set: { bounceMult: 0.85 }, text: { en: 'Stun duration +0.2s, bounce damage: 85%', zh: '眩晕时间 +0.2 秒，弹射伤害升至 85%' } },
        { add: { stunChance: 0.12 }, set: { bounceMult: 0.925 }, text: { en: 'Stun +12%, bounce damage: 92.5%', zh: '眩晕率 +12%，弹射伤害升至 92.5%' } },
        { add: { stunChance: 0.14, stunDur: 0.2 }, set: { bounceMult: 1 }, text: { en: 'Stun +14%/+0.2s, bounce damage: 100%', zh: '眩晕率 +14%、时间 +0.2 秒，弹射伤害升至 100%' } },
      ],
    },
  },
  plague: {
    key: 'plague', nameKey: 'evo.plague', descKey: 'evo.plagueDesc',
    element: 'poison', icon: 'icon_venomflask', color: 0x7f6aa8,
    behavior: 'pool', projTexture: 'venom_flask_plague', projRadius: 12, maxLv: 8,
    baseParams: {
      dmg: 11, cd: 1.75, radius: 110, duration: 3.5, tick: 0.5,
      poisonDps: 11, speed: 450, plague: true, plagueChainDepth: 1,
    },
    modules: {
      scale: [
        { basePct: { radius: 16 }, text: { en: 'Plague pool radius +16%', zh: '瘟疫毒池范围 +16%' } },
        { basePct: { radius: 16 }, text: { en: 'Plague pool radius +16%', zh: '瘟疫毒池范围 +16%' } },
        { basePct: { radius: 16 }, text: { en: 'Plague pool radius +16%', zh: '瘟疫毒池范围 +16%' } },
        { basePct: { radius: 16 }, text: { en: 'Plague pool radius +16%', zh: '瘟疫毒池范围 +16%' } },
      ],
      trait: [
        { add: { duration: 0.5 }, basePct: { poisonDps: 15 }, text: { en: 'Pool duration +0.5s, poison damage +15%', zh: '毒池持续 +0.5 秒，中毒伤害 +15%' } },
        { add: { duration: 0.5 }, set: { tick: 0.45 }, text: { en: 'Duration +0.5s, damage interval: 0.45s', zh: '持续时间 +0.5 秒，跳伤间隔降至 0.45 秒' } },
        { add: { duration: 0.5 }, basePct: { poisonDps: 20 }, text: { en: 'Duration +0.5s, poison damage +20%', zh: '持续时间 +0.5 秒，中毒伤害 +20%' } },
        { add: { duration: 0.5 }, set: { tick: 0.40 }, text: { en: 'Duration +0.5s, damage interval: 0.40s', zh: '持续时间 +0.5 秒，跳伤间隔降至 0.40 秒' } },
      ],
    },
  },
  corrosion: {
    key: 'corrosion', nameKey: 'evo.corrosion', descKey: 'evo.corrosionDesc',
    element: 'poison', icon: 'icon_venomflask', color: 0xc9f24b,
    behavior: 'pool', projTexture: 'venom_flask_corrosion', projRadius: 12, maxLv: 8,
    baseParams: {
      dmg: 11, cd: 1.75, radius: 110, duration: 3.5, tick: 0.5,
      poisonDps: 10, speed: 450, vuln: 0.08, vulnDur: 1.5,
    },
    modules: {
      scale: [
        { basePct: { radius: 16 }, text: { en: 'Corrosion pool radius +16%', zh: '腐蚀毒池范围 +16%' } },
        { basePct: { radius: 16 }, text: { en: 'Corrosion pool radius +16%', zh: '腐蚀毒池范围 +16%' } },
        { basePct: { radius: 16 }, text: { en: 'Corrosion pool radius +16%', zh: '腐蚀毒池范围 +16%' } },
        { basePct: { radius: 16 }, text: { en: 'Corrosion pool radius +16%', zh: '腐蚀毒池范围 +16%' } },
      ],
      trait: [
        { add: { duration: 0.5, vuln: 0.03 }, text: { en: 'Duration +0.5s, vulnerability +3%', zh: '持续时间 +0.5 秒，易伤 +3%' } },
        { add: { duration: 0.5, vulnDur: 0.3 }, text: { en: 'Duration +0.5s, vulnerability duration +0.3s', zh: '持续时间 +0.5 秒，易伤持续 +0.3 秒' } },
        { add: { duration: 0.5, vuln: 0.03 }, set: { tick: 0.45 }, text: { en: 'Duration +0.5s, vulnerability +3%, interval: 0.45s', zh: '持续时间 +0.5 秒，易伤 +3%，跳伤间隔 0.45 秒' } },
        { add: { duration: 0.5, vuln: 0.04, vulnDur: 0.4 }, set: { tick: 0.40 }, text: { en: 'Duration +0.5s, vulnerability +4%/+0.4s, interval: 0.40s', zh: '持续时间 +0.5 秒，易伤 +4%/+0.4 秒，跳伤间隔 0.40 秒' } },
      ],
    },
  },
  holyhalo: {
    key: 'holyhalo', nameKey: 'evo.holyhalo', descKey: 'evo.holyhaloDesc',
    element: 'light', icon: 'icon_holyorb', color: 0xffef9a,
    behavior: 'aura', maxLv: 8,
    baseParams: { dmg: 12, cd: 1.0, radius: 120, heal: 0.25 },
    modules: {
      scale: [
        { basePct: { radius: 15 }, text: { en: 'Holy aura radius +15%', zh: '圣辉光环范围 +15%' } },
        { basePct: { radius: 15 }, text: { en: 'Holy aura radius +15%', zh: '圣辉光环范围 +15%' } },
        { basePct: { radius: 15 }, text: { en: 'Holy aura radius +15%', zh: '圣辉光环范围 +15%' } },
        { basePct: { radius: 15 }, text: { en: 'Holy aura radius +15%', zh: '圣辉光环范围 +15%' } },
      ],
      trait: [
        { add: { heal: 0.05 }, basePct: { cd: -8 }, text: { en: 'Cooldown -8%, healing +0.05/s', zh: '冷却 -8%，每秒回复 +0.05' } },
        { add: { heal: 0.05 }, basePct: { cd: -8 }, text: { en: 'Cooldown -8%, healing +0.05/s', zh: '冷却 -8%，每秒回复 +0.05' } },
        { add: { heal: 0.05 }, basePct: { cd: -10 }, text: { en: 'Cooldown -10%, healing +0.05/s', zh: '冷却 -10%，每秒回复 +0.05' } },
        { add: { heal: 0.05 }, basePct: { cd: -12 }, text: { en: 'Cooldown -12%, healing +0.05/s', zh: '冷却 -12%，每秒回复 +0.05' } },
      ],
    },
  },
  prism: {
    key: 'prism', nameKey: 'evo.prism', descKey: 'evo.prismDesc',
    element: 'light', icon: 'icon_holyorb', color: 0xfff4c2,
    behavior: 'bounce', projTexture: 'holy_orb', projRadius: 16, maxLv: 8,
    baseParams: {
      dmg: 17, count: 1, cd: 2.0, speed: 360, duration: 4.5,
      rehit: 1.2, splitRays: 1, rayDmg: 6,
    },
    modules: {
      scale: [
        { add: { splitRays: 1 }, text: { en: 'Radiant beam +1 per hit', zh: '每次命中的圣光束 +1' } },
        { add: { count: 1 }, text: { en: 'Prism orb +1', zh: '棱镜光球 +1' } },
        { add: { splitRays: 1 }, text: { en: 'Radiant beam +1 per hit', zh: '每次命中的圣光束 +1' } },
        { add: { count: 1 }, text: { en: 'Prism orb +1', zh: '棱镜光球 +1' } },
      ],
      trait: [
        { add: { duration: 0.5 }, basePct: { speed: 10, cd: -8 }, text: { en: 'Duration +0.5s, speed +10%, cooldown -8%', zh: '持续 +0.5 秒，速度 +10%，冷却 -8%' } },
        { set: { rehit: 1.1 }, basePct: { rayDmg: 20 }, text: { en: 'Repeat hit: 1.1s, beam damage +20%', zh: '复击间隔 1.1 秒，光束伤害 +20%' } },
        { add: { duration: 0.5 }, basePct: { speed: 10, cd: -10 }, text: { en: 'Duration +0.5s, speed +10%, cooldown -10%', zh: '持续 +0.5 秒，速度 +10%，冷却 -10%' } },
        { set: { rehit: 0.9 }, basePct: { rayDmg: 25 }, text: { en: 'Repeat hit: 0.9s, beam damage +25%', zh: '复击间隔 0.9 秒，光束伤害 +25%' } },
      ],
    },
  },
});

// 纯函数：把模块等级解析成当前技能参数，供运行时与平衡检查共同使用。
export function skillParamsFor(def, modules) {
  const base = def.baseParams;
  const params = { ...base };
  const basePct = {};
  for (const moduleKey of ['scale', 'trait']) {
    const steps = def.modules[moduleKey] || [];
    for (let i = 0; i < (modules[moduleKey] || 0); i++) {
      const effect = steps[i];
      for (const [key, value] of Object.entries(effect?.add || {})) params[key] = (params[key] || 0) + value;
      for (const [key, value] of Object.entries(effect?.basePct || {})) basePct[key] = (basePct[key] || 0) + value;
      for (const [key, value] of Object.entries(effect?.set || {})) params[key] = value;
    }
  }
  for (const [key, pct] of Object.entries(basePct)) params[key] = base[key] * (1 + pct / 100);
  const power = 1 + (modules.power || 0) * SKILL_POWER_PER_RANK;
  for (const key of ['dmg', 'trailDmg', 'fragmentDmg', 'poisonDps', 'rayDmg']) {
    if (Number.isFinite(params[key])) params[key] = Math.round(params[key] * power * 1000) / 1000;
  }
  return params;
}

// ---------- 被动表（GDD §3.6，Lv1–3） ----------
export const PASSIVES = {
  boots:     { key: 'boots',     nameKey: 'passive.boots',     descKey: 'passive.bootsDesc',     icon: 'icon_boots',     maxLv: 3, values: [8, 14, 20] },
  magnet:    { key: 'magnet',    nameKey: 'passive.magnet',    descKey: 'passive.magnetDesc',    icon: 'icon_magnet',    maxLv: 3, values: [40, 80, 140] },
  gears:     { key: 'gears',     nameKey: 'passive.gears',     descKey: 'passive.gearsDesc',     icon: 'icon_gears',     maxLv: 3, values: [6, 10, 15] },
  whetstone: { key: 'whetstone', nameKey: 'passive.whetstone', descKey: 'passive.whetstoneDesc', icon: 'icon_battle_emblem', maxLv: 3, values: [8, 14, 20] },
  core:      { key: 'core',      nameKey: 'passive.core',      descKey: 'passive.coreDesc',      icon: 'icon_core',      maxLv: 3, values: [20, 35, 50], regen: [0.5, 1, 1.5] },
  rune:      { key: 'rune',      nameKey: 'passive.rune',      descKey: 'passive.runeDesc',      icon: 'icon_rune',      maxLv: 3, values: [10, 18, 28] },
};
// 只限制刃风暴这类主动技能；被动不占主动技能槽，6 种均可在局内升至 Lv3。
export const MAX_ACTIVE_SKILLS = 4;
// 全部学满后的无限兜底卡（保证每次升级都有意义，playtest 反馈 2026-07-13）
export const MAXED_BONUS = { healPct: 0.30, dmgPct: 4, speedPct: 2 };

// ---------- 连杀反馈（GDD §4.3 连杀计数弹字 / §7 击杀音高递增） ----------
export const COMBO = {
  windowSec: 0.9,          // 距上次击杀超过该时长则连杀清零
  popupEvery: 25,          // 每 N 连杀弹一次大字
};

// ---------- BGM 阶段切换（M0 仅音频变奏；M2 加血月皮肤） ----------
export const AUDIO_PHASES = [
  { at: 0,   phase: 'day' },
  { at: 180, phase: 'dusk' },
  { at: 360, phase: 'night' },
  { at: 450, phase: 'blood' },
];

// ---------- UI 主题色 ----------
export const THEME = {
  bg: 0x0e1410,
  panel: 0x16211a,
  panelLine: 0x3d5a44,
  gold: 0xffd34e,
  green: 0x58c98f,
  red: 0xff6a5e,
  text: '#f2f7ef',
  sub: '#aed0b4',
  goldCss: '#ffd34e',
  redCss: '#ff6a5e',
};

// ---------- 调试 ----------
export const DEBUG_QUERY = 'debug';   // ?debug=1 显示 FPS/实体数
export const STRESS_QUERY = 'stress'; // ?stress=1 开局 500 敌人压测（M0 验收门禁）
export const STRESS_COUNT = 500;
export const STRESS_TYPES = { slime: 0.5, runner: 0.3, tank: 0.2 };
