import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ELEMENT_COMBO_TIPS, SKILLS } from '../src/config.js';

const enemyManager = await readFile(new URL('../src/game/EnemyManager.js', import.meta.url), 'utf8');
const gameScene = await readFile(new URL('../src/scenes/GameScene.js', import.meta.url), 'utf8');

assert.match(enemyManager, /const MAX_ENEMY_RADIUS = 52;/,
  'poison-fire blast queries require a defined enemy-radius margin');
assert.match(enemyManager, /cfg\.radius \+ MAX_ENEMY_RADIUS/,
  'poison-fire blast query must include the enemy collision radius');
assert.match(enemyManager, /source: cfg\.source, noSynergy: true/,
  'poison-fire blast damage must not recursively trigger another synergy');

assert.deepEqual(Object.keys(ELEMENT_COMBO_TIPS).sort(), ['fire', 'ice', 'lightning', 'poison'],
  'only implemented elemental combos should receive a build tip');
for (const def of Object.values(SKILLS)) {
  const shouldHaveTip = ['fire', 'ice', 'lightning', 'poison'].includes(def.element);
  assert.equal(Boolean(ELEMENT_COMBO_TIPS[def.element]), shouldHaveTip,
    `${def.key} combo-tip eligibility no longer matches its element`);
}
assert.match(gameScene, /ELEMENT_COMBO_TIPS\[SKILLS\[key\]\?\.element\]/,
  'main-skill selection must resolve the combo tip from the selected skill element');
assert.match(gameScene, /showToast\(t\(comboTipKey\), 7\.5\)/,
  'the combo build tip must be shown once after selecting the main skill');

console.log('Element synergy contract OK: runtime effects and selective main-skill build tips are present.');
