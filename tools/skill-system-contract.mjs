import assert from 'node:assert/strict';
import {
  ACTIVE_SKILL_KEYS, SKILLS, MAX_WEAPONS, skillParamsFor,
} from '../src/config.js';
import { LevelSystem } from '../src/game/LevelSystem.js';

const EXPECTED = ['bladestorm', 'headhunter', 'lavatrail', 'cluster', 'blizzard', 'icecage'];
assert.deepEqual(ACTIVE_SKILL_KEYS, EXPECTED, 'only the approved six skills may enter the run pool');
assert.equal(MAX_WEAPONS, 4, 'run must cap direct skills at four');
for (const key of EXPECTED) {
  const def = SKILLS[key];
  assert.ok(def, `${key} definition missing`);
  assert.equal(def.maxLv, 7, `${key} must cap at Lv7`);
  assert.equal(def.modules.scale.length, 3, `${key} scale track must have three ranks`);
  assert.equal(def.modules.trait.length, 3, `${key} trait track must have three ranks`);
  assert.ok(
    !Object.keys(def.baseParams).some(param => param.toLowerCase().includes('capstone')),
    `${key} must not add an unapproved Lv7 fixed effect`,
  );
}

const close = (actual, expected, label) => assert.ok(
  Math.abs(actual - expected) < 0.001,
  `${label}: expected ${expected}, got ${actual}`,
);
const typical = key => skillParamsFor(SKILLS[key], { scale: 2, power: 2, trait: 2 });
let params = typical('bladestorm');
assert.equal(params.count, 4); close(params.dmg, 10.4, 'bladestorm damage'); close(params.orbitRadius, 120.75, 'bladestorm radius'); close(params.cd, 0.65, 'bladestorm rehit');
params = typical('headhunter');
assert.equal(params.count, 2); assert.equal(params.pierce, 1); close(params.dmg, 23.4, 'headhunter damage'); close(params.crit, 0.32, 'headhunter crit'); close(params.execute, 0.13, 'headhunter execute');
params = typical('lavatrail');
assert.equal(params.count, 2); close(params.dmg, 20.8, 'lava direct'); close(params.trailDmg, 3.9, 'lava tick'); close(params.trailLife, 3.4, 'lava duration');
params = typical('cluster');
assert.equal(params.fragments, 7); close(params.dmg, 26, 'cluster main'); close(params.fragmentDmg, 7.8, 'cluster fragment'); close(params.aoe, 98.56, 'cluster radius');
params = typical('blizzard');
close(params.dmg, 6.5, 'blizzard tick'); close(params.cd, 0.7, 'blizzard interval'); close(params.radius, 286, 'blizzard radius'); close(params.slow, 0.31, 'blizzard slow');
params = typical('icecage');
close(params.dmg, 15.6, 'icecage damage'); close(params.radius, 247, 'icecage radius'); close(params.freezeChance, 0.18, 'icecage freeze'); close(params.freezeDur, 1.3, 'icecage freeze duration');

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
    if (!weapon || weapon.lv >= 7 || weapon.modules[moduleKey] >= 3) return false;
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
blade.modules.scale = 2; blade.lv = 3;
assert.equal(levels.moduleChoice(blade, 'scale').weight, 2, 'chosen module weight must grow 1 → 1.5 → 2');

console.log('Skill system contract OK: six-skill pool, target stats, no Lv7 capstones, main opener, controlled cards, pity, and four-slot cap.');
