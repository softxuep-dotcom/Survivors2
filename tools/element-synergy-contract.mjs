import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const enemyManager = await readFile(new URL('../src/game/EnemyManager.js', import.meta.url), 'utf8');

assert.match(enemyManager, /const MAX_ENEMY_RADIUS = 52;/,
  'poison-fire blast queries require a defined enemy-radius margin');
assert.match(enemyManager, /cfg\.radius \+ MAX_ENEMY_RADIUS/,
  'poison-fire blast query must include the enemy collision radius');
assert.match(enemyManager, /source: cfg\.source, noSynergy: true/,
  'poison-fire blast damage must not recursively trigger another synergy');

console.log('Element synergy contract OK: poison-fire blast dependencies and recursion guard are present.');
