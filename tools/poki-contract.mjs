import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const calls = [];
const adStates = [];

globalThis.CustomEvent = class CustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
};

globalThis.document = {
  hidden: false,
  body: { classList: { toggle() {} } },
  addEventListener() {},
  removeEventListener() {},
};

globalThis.window = {
  location: { search: '' },
  dispatchEvent(event) {
    if (event.type === 'poki-ad-state') adStates.push(event.detail.active);
  },
  PokiSDK: {
    async init() { calls.push('init'); },
    gameLoadingFinished() { calls.push('loading-finished'); },
    gameplayStart() { calls.push('gameplay-start'); },
    gameplayStop() { calls.push('gameplay-stop'); },
    async commercialBreak(onStart) {
      calls.push('commercial');
      onStart?.();
    },
    async rewardedBreak({ size, onStart }) {
      calls.push(`rewarded:${size}`);
      onStart?.();
      return true;
    },
  },
};

const { Poki } = await import('../src/poki.js');

assert.equal(await Poki.init({ timeoutMs: 50 }), true, 'SDK init should resolve');
Poki.gameLoadingFinished();
Poki.gameLoadingFinished();
Poki.gameplayStart();
Poki.gameplayStart();
Poki.gameplayStop();
Poki.gameplayStop();
await Poki.commercialBreak();
Poki.gameplayStart();
Poki.gameplayStop();
assert.equal(await Poki.rewardedBreak({ size: 'large' }), true, 'completed rewarded ad should grant reward');
await new Promise(resolve => setTimeout(resolve, 0));

assert.deepEqual(calls, [
  'init',
  'loading-finished',
  'gameplay-start',
  'gameplay-stop',
  'commercial',
  'gameplay-start',
  'gameplay-stop',
  'rewarded:large',
], 'lifecycle calls must be ordered and deduplicated');
assert.deepEqual(adStates, [true, false, true, false], 'each ad must disable and restore the game exactly once');
assert.equal(Poki.isAdPlaying(), false);
assert.equal(Poki.isGameplayActive(), false);

let finishPendingAd;
window.PokiSDK.commercialBreak = (onStart) => {
  onStart?.();
  return new Promise(resolve => { finishPendingAd = resolve; });
};
const pendingAd = Poki.commercialBreak();
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(Poki.isAdPlaying(), true, 'an active ad must stay locked until the SDK promise settles');
finishPendingAd();
await pendingAd;
assert.equal(Poki.isAdPlaying(), false, 'the ad lock must release after the SDK promise settles');

const timedOutInitCalls = [];
window.PokiSDK = {
  init() {
    timedOutInitCalls.push('init');
    return new Promise(() => {});
  },
  gameLoadingFinished() { timedOutInitCalls.push('loading-finished'); },
  gameplayStart() { timedOutInitCalls.push('gameplay-start'); },
  gameplayStop() { timedOutInitCalls.push('gameplay-stop'); },
};
const { Poki: TimedOutInitPoki } = await import('../src/poki.js?timed-out-init');
assert.equal(await TimedOutInitPoki.init({ timeoutMs: 5 }), false, 'hung SDK init must fail open');
TimedOutInitPoki.gameLoadingFinished();
TimedOutInitPoki.gameplayStart();
TimedOutInitPoki.gameplayStop();
await new Promise(resolve => setTimeout(resolve, 0));
assert.deepEqual(timedOutInitCalls, [
  'init',
  'loading-finished',
  'gameplay-start',
  'gameplay-stop',
], 'lifecycle events must flush after the SDK init timeout');

delete window.PokiSDK;
const { Poki: MissingSdkPoki } = await import('../src/poki.js?missing-sdk');
assert.equal(await MissingSdkPoki.init({ timeoutMs: 10 }), false, 'missing SDK must fail open into gameplay');
assert.equal(await MissingSdkPoki.rewardedBreak({ size: 'large' }), false,
  'production-like missing SDK must never grant a rewarded placement');

const [html, menu, game, result, boot, vfxRuntime] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/scenes/MenuScene.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/scenes/GameScene.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/scenes/ResultScene.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/scenes/BootScene.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/game/vfx/VfxRuntime.js', import.meta.url), 'utf8'),
]);

assert.match(html, /https:\/\/game-cdn\.poki\.com\/scripts\/v2\/poki-sdk\.js/);
assert.doesNotMatch(menu, /rewardedBreak\(/, 'start boost selection must not trigger a rewarded ad');
assert.match(menu, /DEFAULT_START_BUFF = 'fury'/, 'a default start boost must be selected');
assert.match(menu, /startBuff = this\.selectedStartBuff/, 'standard starts must carry the selected boost');
assert.doesNotMatch(menu, /commercialBreak\(/, 'menu must not contain a hidden interstitial trigger');
assert.match(game, /rewardedBreak\(\{ size: 'small' \}\)/, 'level-up reroll placement missing');
assert.match(game, /rewardedBreak\(\{ size: 'medium' \}\)/, 'revive placement missing');
assert.match(game, /resumeFromManualPause\(\)[\s\S]*?commercialBreak\(\)[\s\S]*?resumeGameplay\(\)/,
  'commercial break must run while leaving pause and before gameplay resumes');
assert.match(result, /rewardedBreak\(\{ size: 'large' \}\)/, 'result double placement missing');
assert.doesNotMatch(result, /commercialBreak\(/, 'result retry must not trigger an interstitial ad');
assert.match(game, /const params = import\.meta\.env\.DEV \? new URLSearchParams/,
  'gameplay debug query parameters must be gated behind the development build');
assert.match(game, /this\.stressMode = !!params && params\.has\(STRESS_QUERY\)/,
  'stress mode must be disabled when development query parameters are unavailable');
assert.match(game, /if \(import\.meta\.env\.DEV && this\.stressMode\) \{/,
  'stress runtime must be removed from production builds');
assert.match(game, /if \(import\.meta\.env\.DEV && this\.godMode\)/,
  'god mode runtime must be removed from production builds');
assert.match(game, /if \(import\.meta\.env\.DEV && this\.debugMode\) \{/,
  'debug HUD runtime must be removed from production builds');
assert.match(boot, /const params = import\.meta\.env\.DEV \? new URLSearchParams/,
  'boot shortcuts must be gated behind the development build');
assert.match(vfxRuntime, /if \(!import\.meta\.env\.DEV\) return new URLSearchParams\(\)/,
  'forced VFX quality query parameters must be disabled in production');

console.log('Poki contract OK: pause-resume interstitial, lifecycle dedupe, production debug gates, and 3 rewarded placements verified.');
