import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PROPS } from '../src/config.js';

const source = fs.readFileSync(new URL('../src/game/PropManager.js', import.meta.url), 'utf8');

assert.ok(PROPS.targetAlive > 0, 'prop target count must remain positive');
assert.ok(PROPS.spawnIntervalSec > 0, 'prop replacement interval must remain positive');
assert.ok(PROPS.despawnMargin > 0, 'prop despawn margin must remain positive');
assert.match(source, /this\.initialSpawned && this\.active\.length < PROPS\.targetAlive/,
  'props below the target count must enter the replacement path');
assert.match(source, /this\.spawnT -= dt[\s\S]*this\.trySpawnAround\(player\)/,
  'missing props must be replenished around the current player position');
assert.match(source, /dx \* dx \+ dy \* dy > far2[\s\S]*this\.releaseAt\(i\)/,
  'props left behind by a moving player must be released');

console.log(`Prop system contract OK: far props recycle beyond view + ${PROPS.despawnMargin}px, then refill toward ${PROPS.targetAlive} at one per ${PROPS.spawnIntervalSec}s.`);
