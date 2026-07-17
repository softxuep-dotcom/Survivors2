import assert from 'node:assert/strict';
import {
  ACTIVE_SKILL_KEYS, SKILLS, SKILL_MODULE_MAX_RANK, SKILL_POWER_PER_RANK,
  MAX_WEAPONS, skillParamsFor,
} from '../src/config.js';
import { LevelSystem } from '../src/game/LevelSystem.js';
import { WeaponManager } from '../src/game/WeaponManager.js';

const ORIGINAL = ['bladestorm', 'headhunter', 'lavatrail', 'cluster', 'blizzard', 'icecage'];
const ELECTRIC = ['stormeye', 'thunderjudgment'];
const EXPECTED = [...ORIGINAL, ...ELECTRIC];
assert.deepEqual(ACTIVE_SKILL_KEYS, EXPECTED, 'only the approved eight skills may enter the run pool');
assert.equal(MAX_WEAPONS, 4, 'run must cap direct skills at four');
assert.equal(SKILL_MODULE_MAX_RANK, 4, 'every module route must cap at rank four');
assert.equal(SKILL_POWER_PER_RANK, 0.375, 'power must follow the 8 → 11 → 14 → 17 → 20 blade benchmark');
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
let params = typical('bladestorm');
assert.equal(params.count, 9); close(params.dmg, 14, 'bladestorm damage'); close(params.orbitRadius, 126, 'bladestorm radius');
close(params.speed, 3.36, 'bladestorm rotation'); close(params.cd, 0.75, 'bladestorm rehit');
params = typical('headhunter');
assert.equal(params.count, 4); assert.equal(params.pierce, 1); close(params.dmg, 31.5, 'headhunter damage'); close(params.crit, 0.4, 'headhunter crit'); close(params.execute, 0.13, 'headhunter execute');
params = typical('lavatrail');
assert.equal(params.count, 4); close(params.dmg, 28, 'lava direct'); close(params.trailDmg, 5.25, 'lava tick'); close(params.trailLife, 3.6, 'lava duration'); close(params.trailRadius, 63, 'lava width');
params = typical('cluster');
assert.equal(params.count, 2); assert.equal(params.fragments, 7); close(params.dmg, 35, 'cluster main'); close(params.fragmentDmg, 17.5, 'cluster fragment'); close(params.aoe, 105.6, 'cluster radius'); close(params.fragmentRange, 216, 'cluster spread');
params = typical('blizzard');
close(params.dmg, 8.75, 'blizzard tick'); close(params.cd, 0.72, 'blizzard interval'); close(params.radius, 352, 'blizzard radius'); close(params.slow, 0.41, 'blizzard slow');
params = typical('icecage');
close(params.dmg, 42, 'icecage damage'); close(params.cd, 3, 'icecage cooldown'); close(params.radius, 232, 'icecage radius');
assert.equal(params.slow, undefined, 'icecage must not slow'); assert.equal(params.slowDur, undefined, 'icecage must not carry slow duration');
close(params.freezeChance, 0.4, 'icecage freeze'); close(params.freezeDur, 1.4, 'icecage freeze duration');
params = typical('stormeye');
assert.equal(params.bolts, 4); close(params.dmg, 31.5, 'stormeye damage'); close(params.cd, 0.99, 'stormeye cooldown');
close(params.radius, 562.5, 'stormeye targeting radius'); close(params.splash, 57.6, 'stormeye splash radius');
close(params.splashMult, 0.6, 'stormeye splash multiplier');
params = typical('thunderjudgment');
assert.equal(params.bounces, 4); close(params.dmg, 56, 'judgment main damage');
close(params.bounceMult, 0.85, 'judgment bounce multiplier'); close(params.stunChance, 0.24, 'judgment stun chance');
close(params.stunDur, 0.7, 'judgment stun duration');

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
assert.deepEqual(clusterShotFragments, [7, 7], 'each main cluster fireball must keep all seven fragments');

params = fullRoutes('bladestorm');
assert.equal(params.count, 11); close(params.dmg, 20, 'bladestorm full power'); close(params.speed, 4.32, 'bladestorm full rotation');
close(params.orbitRadius, 147, 'bladestorm full radius'); close(params.cd, 0.65, 'bladestorm full rehit');
params = fullRoutes('headhunter');
assert.equal(params.count, 5); assert.equal(params.pierce, 2); close(params.dmg, 45, 'headhunter full power'); close(params.crit, 0.6, 'headhunter full crit'); close(params.execute, 0.2, 'headhunter full execute');
params = fullRoutes('lavatrail');
assert.equal(params.count, 5); close(params.dmg, 40, 'lava full direct'); close(params.trailDmg, 7.5, 'lava full tick'); close(params.trailLife, 5.2, 'lava full duration'); close(params.trailRadius, 81, 'lava full width'); close(params.trailTick, 0.4, 'lava full interval');
params = fullRoutes('cluster');
assert.equal(params.count, 2); assert.equal(params.fragments, 11); close(params.dmg, 50, 'cluster full main'); close(params.fragmentDmg, 25, 'cluster full fragment'); close(params.aoe, 123.2, 'cluster full radius'); close(params.fragmentAoe, 57.2, 'cluster full fragment radius');
params = fullRoutes('blizzard');
close(params.dmg, 12.5, 'blizzard full damage'); close(params.radius, 396, 'blizzard full radius'); close(params.slow, 0.57, 'blizzard full slow'); close(params.cd, 0.6, 'blizzard full interval');
params = fullRoutes('icecage');
close(params.dmg, 60, 'icecage full damage'); close(params.cd, 2.4, 'icecage full cooldown'); close(params.radius, 256, 'icecage full radius');
assert.equal(params.slow, undefined, 'full icecage must not slow'); assert.equal(params.slowDur, undefined, 'full icecage must not carry slow duration');
close(params.freezeChance, 0.7, 'icecage full freeze'); close(params.freezeDur, 1.8, 'icecage full freeze duration');
params = fullRoutes('stormeye');
assert.equal(params.bolts, 5); close(params.dmg, 45, 'stormeye full power damage'); close(params.cd, 0.715, 'stormeye full trait cooldown'); close(params.radius, 675, 'stormeye full targeting'); close(params.splash, 67.2, 'stormeye full splash');
params = fullRoutes('thunderjudgment');
assert.equal(params.bounces, 5); close(params.dmg, 80, 'judgment full power damage'); close(params.bounceMult, 1, 'judgment full bounce multiplier'); close(params.stunChance, 0.5, 'judgment full stun chance'); close(params.stunDur, 0.9, 'judgment full stun duration');

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

const stormHarness = makeRuntimeHarness([{ x: 100, y: 0, hp: 10_000 }]);
const stormWeapon = {
  skillKey: 'stormeye', def: SKILLS.stormeye, lv: 7,
};
for (let i = 0; i < 6; i++) stormHarness.wm.fireStorm(stormWeapon, skillParamsFor(SKILLS.stormeye, {
  scale: 0, power: 0, trait: 0,
}));
assert.equal(stormHarness.damage.length, 6, 'stormeye must deal one direct hit per base strike');
assert.equal(stormHarness.areas.length, 6, 'stormeye must add one splash per strike without a fixed-level trigger');
assert.equal(stormHarness.beams.length, 6, 'stormeye must not add a fixed-level bonus beam');
close(stormHarness.areas[0][3], 10.8, 'stormeye base splash damage');

const judgmentHarness = makeRuntimeHarness([
  { x: 100, y: 0, hp: 10_000 },
  { x: 200, y: 0, hp: 10_000 },
]);
const judgmentWeapon = {
  skillKey: 'thunderjudgment', def: SKILLS.thunderjudgment, lv: 7,
};
const judgmentParams = skillParamsFor(SKILLS.thunderjudgment, { scale: 0, power: 0, trait: 0 });
for (let i = 0; i < 4; i++) judgmentHarness.wm.fireJudgment(judgmentWeapon, judgmentParams);
assert.equal(judgmentHarness.damage.length, 8, 'four judgments must deal only four main and four bounce hits');
close(judgmentHarness.damage[0].amount, 32, 'judgment base main damage');
close(judgmentHarness.damage[1].amount, 22.4, 'judgment base bounce damage');
assert.equal(judgmentHarness.beams.length, 8, 'judgment must not add a fourth-cast bonus beam');

class MockWeaponManager {
  constructor() { this.weapons = []; }
  getWeapon(key) { return this.weapons.find(weapon => weapon.skillKey === key); }
  addSkill(key, { main = false } = {}) {
    if (!SKILLS[key] || this.getWeapon(key)) return false;
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
const first = levels.buildChoices();
assert.equal(first.length, 3);
assert.ok(first.every(choice => choice.kind === 'module' && choice.key === 'bladestorm'), 'first upgrade must be three main-skill modules');
assert.deepEqual(new Set(first.map(choice => choice.moduleKey)), new Set(['scale', 'power', 'trait']));
levels.noteOfferedChoices(first);
levels.apply(first[0]);

for (const key of ['headhunter', 'lavatrail', 'blizzard']) scene.weapons.addSkill(key);
assert.equal(scene.weapons.weapons.length, 4);
for (let run = 0; run < 200; run++) {
  const choices = levels.buildChoices();
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

console.log('Skill system contract OK: eight Lv8/four-rank skills, target stats, no fixed effects, main opener, controlled cards, pity, and four-slot cap.');
