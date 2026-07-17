import assert from 'node:assert/strict';
import {
  ACTIVE_SKILL_KEYS, DEFAULT_MAIN_SKILL, SKILLS, PASSIVES, SKILL_MODULE_MAX_RANK, SKILL_POWER_PER_RANK,
  MAX_ACTIVE_SKILLS, skillParamsFor, xpToNext,
} from '../src/config.js';
import { LevelSystem } from '../src/game/LevelSystem.js';
import { WeaponManager } from '../src/game/WeaponManager.js';

const ORIGINAL = ['bladestorm', 'headhunter', 'lavatrail', 'cluster', 'blizzard', 'icecage'];
const ELECTRIC = ['stormeye', 'thunderjudgment'];
const POISON = ['plague', 'corrosion'];
const LIGHT = ['holyhalo', 'prism'];
const EXPECTED = [...ORIGINAL, ...ELECTRIC, ...POISON, ...LIGHT];
assert.deepEqual(ACTIVE_SKILL_KEYS, EXPECTED, 'only the approved twelve skills may enter the run pool');
assert.equal(DEFAULT_MAIN_SKILL, 'lavatrail', 'the opening skill focus must default to Flame Trail');
assert.equal(MAX_ACTIVE_SKILLS, 4, 'run must cap active skills at four');
assert.equal(SKILL_MODULE_MAX_RANK, 4, 'every module route must cap at rank four');
assert.equal(SKILL_POWER_PER_RANK, 0.375, 'power must add 37.5% of base damage per rank');
assert.deepEqual(
  [1, 8, 9, 14, 15, 16, 17].map(xpToNext),
  [12, 139, 161, 270, 295, 320, 345],
  'XP curve must preserve the early game and flatten after Lv8',
);
for (const key of EXPECTED) {
  const def = SKILLS[key];
  assert.ok(def, `${key} definition missing`);
  assert.equal(def.maxLv, 8, `${key} must cap at Lv8`);
  assert.equal(def.modules.scale.length, 4, `${key} scale track must have four ranks`);
  assert.equal(def.modules.trait.length, 4, `${key} trait track must have four ranks`);
  assert.equal(def.capstone, undefined, `${key} must not gain an unapproved Lv8 fixed effect`);
}

const close = (actual, expected, label) => assert.ok(
  Math.abs(actual - expected) < 0.001,
  `${label}: expected ${expected}, got ${actual}`,
);
const typical = key => skillParamsFor(SKILLS[key], { scale: 3, power: 2, trait: 2 });
const fullRoutes = key => skillParamsFor(SKILLS[key], { scale: 4, power: 4, trait: 4 });
const lv1Expected = {
  bladestorm: { dmg: 14 },
  headhunter: { dmg: 34, bossMult: 1.5 },
  lavatrail: { dmg: 13.5, count: 2, trailDmg: 2.5 },
  cluster: { dmg: 17, count: 2, fragmentDmg: 8.5 },
  blizzard: { dmg: 6 },
  icecage: { dmg: 29 },
  stormeye: { dmg: 15.5, bolts: 2 },
  thunderjudgment: { dmg: 27, bounces: 2 },
  plague: { dmg: 11, poisonDps: 11 },
  corrosion: { dmg: 11, poisonDps: 10 },
  holyhalo: { dmg: 12, heal: 0.25 },
  prism: { dmg: 17, rayDmg: 6 },
};
for (const [key, expected] of Object.entries(lv1Expected)) {
  const actual = skillParamsFor(SKILLS[key], { scale: 0, power: 0, trait: 0 });
  for (const [stat, value] of Object.entries(expected)) close(actual[stat], value, `${key} Lv1 ${stat}`);
}
let params = typical('bladestorm');
assert.equal(params.count, 9); close(params.dmg, 24.5, 'bladestorm damage'); close(params.orbitRadius, 126, 'bladestorm radius');
close(params.speed, 3.36, 'bladestorm rotation'); close(params.cd, 0.70, 'bladestorm rehit');
params = typical('headhunter');
assert.equal(params.count, 4); assert.equal(params.pierce, 1); close(params.dmg, 59.5, 'headhunter damage'); close(params.crit, 0.4, 'headhunter crit'); close(params.bossMult, 1.65, 'headhunter boss multiplier'); close(params.cd, 1.2, 'headhunter cooldown');
assert.equal(params.execute, undefined, 'formal headhunter must not keep the non-boss execute route');
close(params.speed, 900, 'headhunter straight-flight speed'); close(params.range, 1050, 'headhunter targeting range');
assert.equal(SKILLS.headhunter.behavior, 'headhunter', 'headhunter must use its direct-target behavior');
params = typical('lavatrail');
assert.equal(params.count, 5); close(params.dmg, 23.625, 'lava direct'); close(params.trailDmg, 4.375, 'lava tick'); close(params.trailLife, 3.6, 'lava duration'); close(params.trailRadius, 63, 'lava width');
params = typical('cluster');
assert.equal(params.count, 3); assert.equal(params.fragments, 7); close(params.dmg, 29.75, 'cluster main'); close(params.fragmentDmg, 14.875, 'cluster fragment'); close(params.aoe, 105.6, 'cluster radius'); close(params.fragmentRange, 216, 'cluster spread');
params = typical('blizzard');
close(params.dmg, 10.5, 'blizzard tick'); close(params.cd, 0.72, 'blizzard interval'); close(params.radius, 352, 'blizzard radius'); close(params.slow, 0.41, 'blizzard slow');
params = typical('icecage');
close(params.dmg, 50.75, 'icecage damage'); close(params.cd, 3, 'icecage cooldown'); close(params.radius, 232, 'icecage radius');
assert.equal(params.slow, undefined, 'icecage must not slow'); assert.equal(params.slowDur, undefined, 'icecage must not carry slow duration');
close(params.freezeChance, 0.4, 'icecage freeze'); close(params.freezeDur, 1.4, 'icecage freeze duration');
params = typical('stormeye');
assert.equal(params.bolts, 5); close(params.dmg, 27.125, 'stormeye damage'); close(params.cd, 0.99, 'stormeye cooldown');
close(params.radius, 562.5, 'stormeye targeting radius'); close(params.splash, 57.6, 'stormeye splash radius');
close(params.splashMult, 0.6, 'stormeye splash multiplier');
params = typical('thunderjudgment');
assert.equal(params.bounces, 5); close(params.dmg, 47.25, 'judgment main damage');
close(params.bounceMult, 0.85, 'judgment bounce multiplier'); close(params.stunChance, 0.24, 'judgment stun chance');
close(params.stunDur, 0.7, 'judgment stun duration');
params = typical('plague');
close(params.dmg, 19.25, 'plague pool damage'); close(params.poisonDps, 19.25, 'plague poison damage');
close(params.radius, 152.25, 'plague radius'); close(params.duration, 4.5, 'plague duration'); close(params.tick, 0.45, 'plague interval');
assert.equal(params.plague, true); assert.equal(params.plagueChainDepth, 1);
params = typical('corrosion');
close(params.dmg, 19.25, 'corrosion pool damage'); close(params.poisonDps, 17.5, 'corrosion poison damage');
close(params.radius, 152.25, 'corrosion radius'); close(params.duration, 4.5, 'corrosion duration');
close(params.vuln, 0.11, 'corrosion vulnerability'); close(params.vulnDur, 1.8, 'corrosion vulnerability duration');
params = typical('holyhalo');
close(params.dmg, 21, 'holy halo damage'); close(params.cd, 0.84, 'holy halo cooldown');
close(params.radius, 174, 'holy halo radius'); close(params.heal, 0.35, 'holy halo healing');
params = typical('prism');
assert.equal(params.count, 2); assert.equal(params.splitRays, 3); close(params.dmg, 29.75, 'prism orb damage');
close(params.rayDmg, 12.6, 'prism ray damage'); close(params.duration, 4.9, 'prism duration');
close(params.speed, 396, 'prism speed'); close(params.rehit, 1.1, 'prism repeat hit');

const clusterVolley = Object.create(WeaponManager.prototype);
const clusterShotFragments = [];
clusterVolley.scene = {
  player: { x: 0, y: 0, facing: 1 },
  enemies: { nearest: () => ({ x: 100, y: 0 }) },
};
clusterVolley.queueShot = (_delay, fire) => fire();
clusterVolley.fireProjectile = (_def, _x, _y, _angle, shotParams, overrides) => {
  clusterShotFragments.push(overrides.fragments ?? shotParams.fragments ?? 0);
};
clusterVolley.fireAimed({ def: SKILLS.cluster, baseDef: SKILLS.cluster }, typical('cluster'), { mode: 'cluster' });
assert.deepEqual(clusterShotFragments, [7, 7, 7], 'each main cluster fireball must keep all seven fragments');

const headhunterTargets = [
  { key: 'normal', x: 100, y: 0, hp: 100 },
  { key: 'chestElite', x: 0, y: 120, hp: 100, elite: true, rewardChest: true },
  { key: 'boss', x: -140, y: 0, hp: 100, bossTier: 1 },
  { key: 'prop', x: 20, y: 0, hp: 100, isProp: true },
];
const headhunterShots = [];
const headhunterDelays = [];
const headhunterVolley = Object.create(WeaponManager.prototype);
headhunterVolley.scene = {
  player: { x: 0, y: 0, facing: 1 },
  enemies: {
    grid: {
      nearestInCircle(x, y, radius, predicate) {
        return headhunterTargets
          .filter(predicate)
          .sort((a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2))[0] || null;
      },
    },
  },
  vfx: { headhunterTrack() {} },
};
headhunterVolley.queueShot = (delay, fire) => { headhunterDelays.push(delay); fire(); };
headhunterVolley.fireProjectile = (_def, x, y, angle) => {
  headhunterShots.push({ x, y, angle });
};
headhunterVolley.fireHeadhunter({ def: SKILLS.headhunter }, typical('headhunter'));
assert.equal(headhunterShots.length, 4, 'headhunter must fire its full volley');
assert.ok(headhunterShots.every(shot => Math.abs(Math.abs(shot.angle) - Math.PI) < 0.001),
  'all headhunter blades must fly in the same straight direction toward the boss');
assert.deepEqual(headhunterDelays, [0, 0.055, 0.11, 0.165], 'headhunter volley stagger changed');
assert.equal(headhunterVolley.findHeadhunterTarget(0, 0, 1050).key, 'boss', 'headhunter must prioritize bosses');
headhunterTargets.find(target => target.key === 'boss').hp = 0;
assert.equal(headhunterVolley.findHeadhunterTarget(0, 0, 1050).key, 'chestElite', 'headhunter must prioritize chest elites after bosses');
headhunterTargets.find(target => target.key === 'chestElite').hp = 0;
assert.equal(headhunterVolley.findHeadhunterTarget(0, 0, 1050).key, 'normal', 'headhunter must ignore props and fall back to a normal enemy');

const bossDamage = [];
const headhunterHit = Object.create(WeaponManager.prototype);
headhunterHit.scene = {
  enemies: { damage: (_enemy, amount) => { bossDamage.push(amount); } },
  vfx: { bladeImpact() {}, hitSpark() {} },
};
const bossTarget = { hp: 1000, maxHp: 1000, bossTier: 1, type: { boss: true } };
for (let i = 0; i < 2; i++) {
  headhunterHit.handleHit({
    dmg: 30, bossMult: 1.5, crit: 0, execute: 0, aoe: 0, sourceKey: 'headhunter',
    visualStyle: 'headhunter', x: 0, y: 0, vx: 900, vy: 0, pierce: 0, mode: 'normal',
  }, bossTarget);
}
assert.deepEqual(bossDamage, [45, 45], 'two headhunter blades must each deal their own boss-amplified hit');

params = fullRoutes('bladestorm');
assert.equal(params.count, 11); close(params.dmg, 35, 'bladestorm full power'); close(params.speed, 4.32, 'bladestorm full rotation');
close(params.orbitRadius, 147, 'bladestorm full radius'); close(params.cd, 0.60, 'bladestorm full rehit');
params = fullRoutes('headhunter');
assert.equal(params.count, 5); assert.equal(params.pierce, 2); close(params.dmg, 85, 'headhunter full power'); close(params.crit, 0.6, 'headhunter full crit'); close(params.bossMult, 2, 'headhunter full boss multiplier'); close(params.cd, 1.2, 'headhunter full cooldown');
params = fullRoutes('lavatrail');
assert.equal(params.count, 6); close(params.dmg, 33.75, 'lava full direct'); close(params.trailDmg, 6.25, 'lava full tick'); close(params.trailLife, 5.2, 'lava full duration'); close(params.trailRadius, 81, 'lava full width'); close(params.trailTick, 0.4, 'lava full interval');
params = fullRoutes('cluster');
assert.equal(params.count, 3); assert.equal(params.fragments, 11); close(params.dmg, 42.5, 'cluster full main'); close(params.fragmentDmg, 21.25, 'cluster full fragment'); close(params.aoe, 123.2, 'cluster full radius'); close(params.fragmentAoe, 57.2, 'cluster full fragment radius');
params = fullRoutes('blizzard');
close(params.dmg, 15, 'blizzard full damage'); close(params.radius, 396, 'blizzard full radius'); close(params.slow, 0.57, 'blizzard full slow'); close(params.cd, 0.6, 'blizzard full interval');
params = fullRoutes('icecage');
close(params.dmg, 72.5, 'icecage full damage'); close(params.cd, 2.4, 'icecage full cooldown'); close(params.radius, 256, 'icecage full radius');
assert.equal(params.slow, undefined, 'full icecage must not slow'); assert.equal(params.slowDur, undefined, 'full icecage must not carry slow duration');
close(params.freezeChance, 0.7, 'icecage full freeze'); close(params.freezeDur, 1.8, 'icecage full freeze duration');
params = fullRoutes('stormeye');
assert.equal(params.bolts, 6); close(params.dmg, 38.75, 'stormeye full power damage'); close(params.cd, 0.715, 'stormeye full trait cooldown'); close(params.radius, 675, 'stormeye full targeting'); close(params.splash, 67.2, 'stormeye full splash');
params = fullRoutes('thunderjudgment');
assert.equal(params.bounces, 6); close(params.dmg, 67.5, 'judgment full power damage'); close(params.bounceMult, 1, 'judgment full bounce multiplier'); close(params.stunChance, 0.5, 'judgment full stun chance'); close(params.stunDur, 0.9, 'judgment full stun duration');
params = fullRoutes('plague');
close(params.dmg, 27.5, 'plague full pool damage'); close(params.poisonDps, 33, 'plague full poison damage');
close(params.radius, 168, 'plague full radius'); close(params.duration, 5.5, 'plague full duration'); close(params.tick, 0.4, 'plague full interval');
params = fullRoutes('corrosion');
close(params.dmg, 27.5, 'corrosion full pool damage'); close(params.poisonDps, 25, 'corrosion full poison damage');
close(params.radius, 168, 'corrosion full radius'); close(params.duration, 5.5, 'corrosion full duration');
close(params.vuln, 0.18, 'corrosion full vulnerability'); close(params.vulnDur, 2.2, 'corrosion full vulnerability duration'); close(params.tick, 0.4, 'corrosion full interval');
params = fullRoutes('holyhalo');
close(params.dmg, 30, 'holy halo full damage'); close(params.cd, 0.62, 'holy halo full cooldown');
close(params.radius, 192, 'holy halo full radius'); close(params.heal, 0.45, 'holy halo full healing');
params = fullRoutes('prism');
assert.equal(params.count, 3); assert.equal(params.splitRays, 3); close(params.dmg, 42.5, 'prism full orb damage');
close(params.rayDmg, 21, 'prism full ray damage'); close(params.duration, 5.3, 'prism full duration');
close(params.speed, 432, 'prism full speed'); close(params.rehit, 1, 'prism full repeat hit');

function makeRuntimeHarness(targets) {
  const damage = [];
  const areas = [];
  const beams = [];
  const wm = Object.create(WeaponManager.prototype);
  wm.scene = {
    player: { x: 0, y: 0, dmgMult: 1 },
    enemies: {
      grid: {
        nearestInCircle(x, y, radius, predicate) {
          let best = null;
          let bestD2 = radius * radius;
          for (const target of targets) {
            if (!predicate(target)) continue;
            const d2 = (target.x - x) ** 2 + (target.y - y) ** 2;
            if (d2 <= bestD2) { best = target; bestD2 = d2; }
          }
          return best;
        },
      },
      damage(target, amount, options) {
        damage.push({ target, amount, options });
        return false;
      },
    },
    vfx: {
      lightning(...args) { beams.push(args); },
    },
  };
  wm.areaDamage = (...args) => { areas.push(args); return 0; };
  return { wm, damage, areas, beams };
}

const stormHarness = makeRuntimeHarness([
  { x: 100, y: 0, hp: 10_000 },
  { x: -100, y: 0, hp: 10_000 },
]);
const stormWeapon = {
  skillKey: 'stormeye', def: SKILLS.stormeye, lv: 7,
};
for (let i = 0; i < 6; i++) stormHarness.wm.fireStorm(stormWeapon, skillParamsFor(SKILLS.stormeye, {
  scale: 0, power: 0, trait: 0,
}));
assert.equal(stormHarness.damage.length, 12, 'stormeye must deal two direct hits per base strike');
assert.equal(stormHarness.areas.length, 12, 'stormeye must add one splash per strike without a fixed-level trigger');
assert.equal(stormHarness.beams.length, 12, 'stormeye must render two base lightning beams per cast');
close(stormHarness.areas[0][3], 9.3, 'stormeye base splash damage');

const judgmentHarness = makeRuntimeHarness([
  { x: 100, y: 0, hp: 10_000 },
  { x: 200, y: 0, hp: 10_000 },
  { x: 300, y: 0, hp: 10_000 },
]);
const judgmentWeapon = {
  skillKey: 'thunderjudgment', def: SKILLS.thunderjudgment, lv: 7,
};
const judgmentParams = skillParamsFor(SKILLS.thunderjudgment, { scale: 0, power: 0, trait: 0 });
for (let i = 0; i < 4; i++) judgmentHarness.wm.fireJudgment(judgmentWeapon, judgmentParams);
assert.equal(judgmentHarness.damage.length, 12, 'four judgments must deal four main and eight bounce hits');
close(judgmentHarness.damage[0].amount, 27, 'judgment base main damage');
close(judgmentHarness.damage[1].amount, 18.9, 'judgment base bounce damage');
assert.equal(judgmentHarness.beams.length, 12, 'judgment must render three chained beams per base cast');

class MockWeaponManager {
  constructor() { this.weapons = []; }
  getWeapon(key) { return this.weapons.find(weapon => weapon.skillKey === key); }
  addSkill(key, { main = false } = {}) {
    if (!SKILLS[key] || this.getWeapon(key) || this.weapons.length >= MAX_ACTIVE_SKILLS) return false;
    this.weapons.push({
      skillKey: key, def: SKILLS[key], lv: 1, main,
      modules: { scale: 0, power: 0, trait: 0 },
    });
    return true;
  }
  upgradeSkill(key, moduleKey) {
    const weapon = this.getWeapon(key);
    if (!weapon || weapon.lv >= 8 || weapon.modules[moduleKey] >= SKILL_MODULE_MAX_RANK) return false;
    weapon.modules[moduleKey]++;
    weapon.lv++;
    return true;
  }
}

const scene = {
  weapons: new MockWeaponManager(),
  player: {
    passives: {}, bonusDmg: 0, bonusSpeed: 0,
    addPassive(key) { this.passives[key] = (this.passives[key] || 0) + 1; },
    heal() {}, recalcStats() {},
  },
  onLevelUp() {},
};
const levels = new LevelSystem(scene);
assert.equal(levels.selectMainSkill('bladestorm'), true, 'main skill selection failed');
const originalRandom = Math.random;
Math.random = () => 0.999999;
const first = levels.buildChoices();
Math.random = originalRandom;
assert.equal(first.length, 4, 'the first upgrade must use the regular four-choice pool');
assert.ok(first.filter(choice => choice.kind === 'module' && choice.key === 'bladestorm').length >= 2,
  'the first regular pool lost owned-skill growth cards');
assert.ok(first.some(choice => choice.kind === 'passive'), 'the first upgrade cannot offer a passive');

for (const key of Object.keys(PASSIVES)) scene.player.passives[key] = PASSIVES[key].maxLv;
Math.random = () => 0.999999;
const firstWithMaxPassives = levels.buildChoices();
Math.random = originalRandom;
assert.ok(firstWithMaxPassives.some(choice => choice.kind === 'skill'), 'the first upgrade cannot offer a new active skill');
scene.player.passives = {};
levels.noteOfferedChoices(first);
levels.apply(first.find(choice => choice.kind === 'module'));

// 被动与主动技能槽完全独立；先持有被动不会减少四个主动技能名额。
for (const key of ['boots', 'magnet', 'gears']) scene.player.addPassive(key);
for (const key of ['headhunter', 'lavatrail', 'blizzard']) scene.weapons.addSkill(key);
assert.equal(scene.weapons.weapons.length, 4);
assert.equal(scene.weapons.addSkill('cluster'), false, 'a fifth active skill bypassed the four-slot cap');
for (let run = 0; run < 200; run++) {
  const choices = levels.buildChoices();
  assert.equal(choices.length, 4, 'regular upgrades must offer four choices');
  assert.ok(choices.filter(choice => choice.kind === 'module').length >= 2, 'each hand needs at least two growth cards');
  const counts = new Map();
  for (const choice of choices.filter(choice => choice.kind === 'module')) counts.set(choice.key, (counts.get(choice.key) || 0) + 1);
  assert.ok([...counts.values()].every(count => count <= 2), 'one skill occupied more than two cards');
  assert.ok(!choices.some(choice => choice.kind === 'skill'), 'new skill appeared after four slots were full');
}

levels.missedAppearances.blizzard = 3;
assert.ok(levels.buildChoices().some(choice => choice.kind === 'module' && choice.key === 'blizzard'), 'three-miss pity did not force the overdue skill');
const blade = scene.weapons.getWeapon('bladestorm');
blade.modules.scale = 3; blade.lv = 4;
assert.equal(levels.moduleChoice(blade, 'scale').weight, 2.5, 'chosen module weight must grow 1 → 1.5 → 2 → 2.5');

// 即使四个主动技能都已满级，全部六种被动仍在正常卡池中，不应提前落入兜底奖励。
for (const weapon of scene.weapons.weapons) weapon.lv = weapon.def.maxLv;
const ownedPassiveKeys = new Set(Object.keys(scene.player.passives));
const passiveChoices = levels.buildChoices();
assert.equal(passiveChoices.length, 4);
assert.ok(passiveChoices.every(choice => choice.kind === 'passive'), 'available passives were replaced by fallback rewards');
assert.ok(passiveChoices.some(choice => !ownedPassiveKeys.has(choice.key)), 'three owned passives incorrectly blocked the remaining passive table');

console.log('Skill system contract OK: twelve Lv8/four-rank skills, four-choice cards, active-only four-slot cap, independent passives, and fallback gating.');
