// M3 balance gate: weapon DPS shapes × enemy-wave HP throughput.
// This is intentionally deterministic and imports the shipping config directly.
import {
  WEAPONS, EVOLUTIONS, ENEMY_TYPES, ENEMY_VARIANTS, SPAWN_TIMELINE, SPAWN_EVENTS, DIFFICULTIES,
  PLAYER, BOSS_HP_MULT, BOSS_SKILL, FINAL_BOSS, EVOLUTION_LEVEL_START, EVOLUTION_EARLY_POWER,
  hpGrowth, specialHpGrowth,
} from '../src/config.js';

// Even single-target damage is not permanently focused on the boss because auto-targeting follows the horde.
const BOSS_TARGET_UPTIME = 0.55;

function expectedTargets(level) {
  return level.radius ? Math.max(3, level.radius / 34)
    : level.aoe ? 1 + level.aoe / 64
      : 1;
}

function projectileDps(level) {
  const cd = Math.max(0.1, level.cd || 1);
  const count = level.count || 1;
  const direct = (level.dmg || 0) * (1 + (level.pierce || 0) * 0.45);
  const splashTargets = Math.max(0, expectedTargets(level) - 1);
  const splash = (level.dmg || 0) * (level.aoeMult || 0) * splashTargets;
  return (direct + splash) * count / cd;
}

function dps(def, level) {
  const cd = Math.max(0.1, level.cd || 1);
  const count = level.count || level.bolts || 1;
  const dmg = level.dmg || 0;
  switch (def.behavior) {
    case 'chain': return dmg * (level.chains || 1) / cd;
    case 'pulse': case 'field': case 'aura': return dmg * expectedTargets(level) / cd;
    case 'pool': {
      // 持续区域重叠后共享跳伤间隔；多瓶只增加覆盖，不再线性叠伤。
      const zoneDps = dmg / Math.max(0.1, level.tick || 0.5) + (level.poisonDps || 0);
      const concurrent = Math.min(2.5, (level.duration || 1) / cd);
      const coverage = 1 + Math.max(0, concurrent - 1) * 0.35;
      const plagueValue = level.plague ? 1.18 : 1;
      const vulnValue = 1 + (level.vuln || 0) * 0.5;
      return zoneDps * expectedTargets(level) * coverage * plagueValue * vulnValue;
    }
    case 'orbit': return dmg * count * 2.2;
    case 'storm': return dmg * (level.bolts || 1) * expectedTargets({ aoe: level.splash || 0 }) / cd;
    case 'bounce': {
      // 路程折算不同目标接触数，并对按目标独立冷却后的少量重复接触加权。
      const uniqueHits = Math.max(1, (level.duration || 1) * (level.speed || 300) / 600);
      const revisitHits = Math.max(0, (level.duration || 1) / (level.rehit || 1.1) - 1) * 0.3;
      const splitDamage = (level.rayDmg || 0) * (level.splitRays || 0) * 0.45;
      return (dmg + splitDamage) * count * (uniqueHits + revisitHits) / cd;
    }
    case 'lava': {
      const burnTargets = Math.min(8, 2 + count * 1.5 + (level.trailRadius || 0) / 60);
      const burnDps = (level.trailDmg || 0) / 0.38 * burnTargets;
      return projectileDps(level) + burnDps;
    }
    case 'cluster': {
      // 旧进阶定义中的 fragments 是整轮总数；正式 Lv8 技能由技能契约单独校验。
      const fragmentSplashFactor = 1 + 0.45 * (34 / 64);
      return projectileDps(level)
        + (level.fragmentDmg || 0) * (level.fragments || 0) * fragmentSplashFactor / cd;
    }
    case 'homing': return dmg * count * (1 + (level.crit || 0)) * (1 + (level.pierce || 0) * 0.5) / cd;
    default: return projectileDps(level);
  }
}

// Damage that one boss can actually receive; excludes chains, splash and extra targets from horde DPS.
function bossDps(def, level) {
  const cd = Math.max(0.1, level.cd || 1);
  const count = level.count || 1;
  const dmg = level.dmg || 0;
  switch (def.behavior) {
    case 'chain': case 'pulse': case 'field': case 'aura': return dmg / cd;
    case 'pool': return dmg / Math.max(0.1, level.tick || 0.5) + (level.poisonDps || 0);
    case 'orbit': return dmg * count * 2.2;
    case 'storm': return dmg / cd;
    case 'bounce': {
      const revisits = 1 + Math.max(0, (level.duration || 1) / (level.rehit || 1.1) - 1) * 0.3;
      return dmg * count * revisits / cd;
    }
    case 'lava': return dmg * count / cd + (level.trailDmg || 0) / 0.38;
    case 'cluster': return dmg * count / cd;
    case 'homing': return dmg * count * (1 + (level.crit || 0)) / cd;
    default: return dmg * count / cd;
  }
}

function stageAt(time) {
  return [...SPAWN_TIMELINE].reverse().find(stage => time >= stage.from) || SPAWN_TIMELINE[0];
}

function waveHpPerSecond(time, difficulty) {
  const stage = stageAt(time);
  const totalWeight = Object.values(stage.types).reduce((a, b) => a + b, 0);
  const avgHp = Object.entries(stage.types).reduce((sum, [key, weight]) => {
    const typeChanceMult = ENEMY_VARIANTS.armored.chanceMultByType?.[key] || 1;
    const armoredChance = Math.min(1, (stage.armoredChance || 0) * typeChanceMult);
    const variantHpMult = 1 + armoredChance * (ENEMY_VARIANTS.armored.hpMult - 1);
    return sum + ENEMY_TYPES[key].hp * weight * variantHpMult;
  }, 0) / totalWeight;
  return stage.rate * avgHp * hpGrowth(time) * difficulty.hpMult;
}

const forms = [
  ...Object.values(WEAPONS).map(def => ({ key: def.key, kind: 'base', dps: def.levels.map(lv => dps(def, lv)) })),
  ...Object.values(EVOLUTIONS).map(def => ({ key: def.key, kind: 'evolution', dps: def.levels.map(lv => dps(def, lv)) })),
];
const transitions = Object.values(WEAPONS).flatMap(base => {
  const baseLv3 = dps(base, base.levels.at(-1));
  return base.evolutions.map(key => {
    const evo = EVOLUTIONS[key];
    const [lv4, lv5, lv6, lv7] = evo.levels.map(level => dps(evo, level));
    return {
      base: base.key, evolution: key, baseLv3, lv4, lv5, lv6, lv7,
      branchRatio: lv4 / baseLv3,
      lv4PowerRatio: lv4 / lv6,
      lv5PowerRatio: lv5 / lv6,
      lv7Ratio: lv7 / lv6,
    };
  });
});
const baseAverage = levelIndex => Object.values(WEAPONS).reduce((sum, def) => sum + dps(def, def.levels[Math.min(levelIndex, def.levels.length - 1)]), 0) / Object.keys(WEAPONS).length;
const evoAverage = levelIndex => Object.values(EVOLUTIONS).reduce((sum, def) => sum + dps(def, def.levels[Math.min(levelIndex, def.levels.length - 1)]), 0) / Object.keys(EVOLUTIONS).length;
const bossBaseAverage = levelIndex => Object.values(WEAPONS).reduce((sum, def) => sum + bossDps(def, def.levels[Math.min(levelIndex, def.levels.length - 1)]), 0) / Object.keys(WEAPONS).length;
const bossEvoAverage = levelIndex => Object.values(EVOLUTIONS).reduce((sum, def) => sum + bossDps(def, def.levels[Math.min(levelIndex, def.levels.length - 1)]), 0) / Object.keys(EVOLUTIONS).length;
function expectedBuildDps(time) {
  if (time < 30) return baseAverage(0);
  if (time < 75) return baseAverage(1);
  if (time < 120) return baseAverage(1) + baseAverage(0);
  if (time < 180) return baseAverage(2) + baseAverage(0);
  if (time < 240) return evoAverage(0) + baseAverage(0);
  if (time < 300) return evoAverage(0) + baseAverage(2) + baseAverage(0);
  if (time < 360) return evoAverage(1) * 2 + baseAverage(2) + baseAverage(0);
  if (time < 450) return evoAverage(2) + evoAverage(1) + baseAverage(2) + baseAverage(0);
  if (time < 540) return evoAverage(3) * 2 + baseAverage(2) + baseAverage(1);
  if (time < 600) return evoAverage(3) * 3 + evoAverage(2);
  return evoAverage(3) * 4;
}
function expectedBossBuildDps(time) {
  if (time < 30) return bossBaseAverage(0);
  if (time < 75) return bossBaseAverage(1);
  if (time < 120) return bossBaseAverage(1) + bossBaseAverage(0);
  if (time < 180) return bossBaseAverage(2) + bossBaseAverage(0);
  if (time < 240) return bossEvoAverage(0) + bossBaseAverage(0);
  if (time < 300) return bossEvoAverage(0) + bossBaseAverage(2) + bossBaseAverage(0);
  if (time < 360) return bossEvoAverage(1) * 2 + bossBaseAverage(2) + bossBaseAverage(0);
  if (time < 450) return bossEvoAverage(2) + bossEvoAverage(1) + bossBaseAverage(2) + bossBaseAverage(0);
  if (time < 540) return bossEvoAverage(3) * 2 + bossBaseAverage(2) + bossBaseAverage(1);
  if (time < 600) return bossEvoAverage(3) * 3 + bossEvoAverage(2);
  return bossEvoAverage(3) * 4;
}
const checkpoints = [0, 30, 60, 90, 120, 150, 180, 240, 300, 360, 450, 540, 600].map(time => ({
  time,
  waveHp: Object.fromEntries(Object.entries(DIFFICULTIES).map(([key, value]) => [key, Math.round(waveHpPerSecond(time, value))])),
  rate: stageAt(time).rate,
  maxAlive: stageAt(time).maxAlive,
  buildDps: Math.round(expectedBuildDps(time)),
  normalCoverage: Math.round(expectedBuildDps(time) / waveHpPerSecond(time, DIFFICULTIES.normal) * 100) / 100,
}));
const bossCheckpoints = SPAWN_EVENTS.filter(event => event.kind === 'boss').map(event => {
  const hp = event.final
    ? FINAL_BOSS.hp
    : ENEMY_TYPES.boss.hp * specialHpGrowth(event.at) * DIFFICULTIES.normal.hpMult
      * (BOSS_HP_MULT[event.tier] || 1);
  // Boss 战计入局外天赋与局内伤害/冷却被动的保守综合增益。
  const buildDps = expectedBossBuildDps(event.at) * (1 + Math.min(0.22, event.at / 600 * 0.22))
    * BOSS_TARGET_UPTIME;
  return {
    sec: event.at, tier: event.tier, count: event.count || 1,
    hpEach: Math.round(hp), estimatedTtkSec: Math.round(hp / Math.max(1, buildDps) * 10) / 10,
  };
});

const firstThreeBeatTimes = new Set([0, 180]);
SPAWN_TIMELINE.filter(s => s.from <= 180).forEach(s => firstThreeBeatTimes.add(s.from));
SPAWN_EVENTS.filter(e => e.at <= 180).forEach(e => firstThreeBeatTimes.add(e.at));
const beatTimes = [...firstThreeBeatTimes].sort((a, b) => a - b);
const maxGap = Math.max(...beatTimes.slice(1).map((t, i) => t - beatTimes[i]));
const firstThreeCoverage = checkpoints.filter(c => c.time <= 180).map(c => c.normalCoverage);
const lateCoverage = checkpoints.filter(c => c.time >= 360).map(c => c.normalCoverage);
const bossFireballHitsToKill = SPAWN_EVENTS.filter(event => event.kind === 'boss').map(event => {
  const damage = BOSS_SKILL.fireball.damage + Math.max(0, event.tier - 1) * BOSS_SKILL.fireball.damagePerTier;
  return { tier: event.tier, damage, hits: Math.ceil(PLAYER.maxHp / damage) };
});
const report = {
  generatedAt: new Date().toISOString(),
  forms: forms.map(f => ({ ...f, dps: f.dps.map(v => Math.round(v * 10) / 10) })),
  transitions,
  checkpoints,
  bossCheckpoints,
  gates: {
    formCount: forms.length,
    formCountPass: forms.length === 18,
    baseLevelShapePass: Object.values(WEAPONS).every(def => def.maxLv === 3 && def.levels.length === 3),
    evolutionLevelShapePass: Object.values(EVOLUTIONS).every(def => def.levelStart === EVOLUTION_LEVEL_START
      && def.levelStart === 4 && def.maxLv === 7 && def.levels.length === 4),
    firstThreeMinuteMaxBeatGapSec: maxGap,
    firstThreeMinuteRhythmPass: maxGap <= 45,
    finiteDpsPass: forms.every(f => f.dps.every(Number.isFinite)),
    evolutionEarlyPowerPass: transitions.every(t => t.lv4 < t.lv5 && t.lv5 < t.lv6
      && t.lv4PowerRatio >= EVOLUTION_EARLY_POWER.lv4 - 0.06
      && t.lv4PowerRatio <= EVOLUTION_EARLY_POWER.lv4 + 0.06
      && t.lv5PowerRatio >= EVOLUTION_EARLY_POWER.lv5 - 0.05
      && t.lv5PowerRatio <= EVOLUTION_EARLY_POWER.lv5 + 0.05),
    evolutionLv7CurvePass: transitions.every(t => t.lv7Ratio >= 1.2 && t.lv7Ratio <= 1.75),
    firstThreeMinuteCoverageRange: [Math.min(...firstThreeCoverage), Math.max(...firstThreeCoverage)],
    firstThreeMinuteCoveragePass: Math.min(...firstThreeCoverage) >= 0.85 && Math.max(...firstThreeCoverage) <= 6,
    lateCoverageRange: [Math.min(...lateCoverage), Math.max(...lateCoverage)],
    lateCoveragePass: Math.min(...lateCoverage) >= 0.9 && Math.max(...lateCoverage) <= 3.2,
    bossTtkPass: bossCheckpoints.every(check => check.estimatedTtkSec >= 10 && check.estimatedTtkSec <= 90),
    bossFireballHitsToKill,
    bossFireballDamagePass: bossFireballHitsToKill.every(check => check.hits >= 5 && check.hits <= 7),
  },
};

if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  console.log('Horde Breaker M3 balance simulation');
  console.table(report.checkpoints.map(c => ({ sec: c.time, spawnRate: c.rate, maxAlive: c.maxAlive, buildDps: c.buildDps, coverage: c.normalCoverage, ...c.waveHp })));
  console.table(report.forms.map(f => ({ form: f.key, kind: f.kind, startDps: f.dps[0], endDps: f.dps.at(-1) })));
  console.table(transitions.map(t => ({
    base: t.base, evolution: t.evolution,
    baseLv3: Math.round(t.baseLv3 * 10) / 10,
    lv4: Math.round(t.lv4 * 10) / 10,
    lv4vs6: `${Math.round(t.lv4PowerRatio * 100)}%`,
    lv5: Math.round(t.lv5 * 10) / 10,
    lv5vs6: `${Math.round(t.lv5PowerRatio * 100)}%`,
    lv6: Math.round(t.lv6 * 10) / 10,
    lv7: Math.round(t.lv7 * 10) / 10,
    lv7Step: `${Math.round(t.lv7Ratio * 100)}%`,
  })));
  console.table(report.bossCheckpoints);
  console.log(`Gates: 18 forms=${report.gates.formCountPass}, first 3m max beat gap=${maxGap}s, coverage=${report.gates.firstThreeMinuteCoverageRange.join('–')}x, late=${report.gates.lateCoverageRange.join('–')}x, finite DPS=${report.gates.finiteDpsPass}, boss TTK=${report.gates.bossTtkPass}, boss fireball=${bossFireballHitsToKill.map(check => `T${check.tier}:${check.hits}`).join('/')} hits`);
}

if (!report.gates.formCountPass || !report.gates.baseLevelShapePass || !report.gates.evolutionLevelShapePass
  || !report.gates.firstThreeMinuteRhythmPass || !report.gates.firstThreeMinuteCoveragePass
  || !report.gates.evolutionEarlyPowerPass || !report.gates.evolutionLv7CurvePass
  || !report.gates.lateCoveragePass || !report.gates.finiteDpsPass || !report.gates.bossTtkPass
  || !report.gates.bossFireballDamagePass) process.exitCode = 1;
