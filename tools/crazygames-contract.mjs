import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const calls = [];
const adStates = [];
let settingsListener = null;
const localData = new Map([['hb_save_v1', JSON.stringify({ v: 3, diamonds: 42 })]]);
const cloudData = new Map();

globalThis.localStorage = {
  getItem(key) { return localData.get(key) ?? null; },
  setItem(key, value) { localData.set(key, String(value)); },
  removeItem(key) { localData.delete(key); },
  clear() { localData.clear(); },
};

globalThis.CustomEvent = class CustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
};

globalThis.document = {
  hidden: false,
  body: { classList: { toggle() {} } },
  getElementById() { return { style: {} }; },
  addEventListener() {},
  removeEventListener() {},
};

globalThis.window = {
  location: { search: '' },
  dispatchEvent(event) {
    if (event.type === 'platform-ad-state') adStates.push(event.detail.active);
  },
  CrazyGames: {
    SDK: {
      async init() { calls.push('init'); },
      environment: 'local',
      data: {
        getItem(key) { return cloudData.get(key) ?? null; },
        setItem(key, value) { cloudData.set(key, String(value)); },
        removeItem(key) { cloudData.delete(key); },
        clear() { cloudData.clear(); },
      },
      game: {
        settings: { muteAudio: false },
        addSettingsChangeListener(listener) { settingsListener = listener; },
        loadingStart() { calls.push('loading-start'); },
        loadingStop() { calls.push('loading-stop'); },
        gameplayStart() { calls.push('gameplay-start'); },
        gameplayStop() { calls.push('gameplay-stop'); },
        happytime() { calls.push('happytime'); },
        reportGameCompletedPercentage(value) { calls.push(`completion:${value}`); },
      },
      ad: {
        requestAd(type, callbacks) {
          calls.push(`ad:${type}`);
          callbacks.adStarted?.();
          callbacks.adFinished?.();
        },
      },
    },
  },
};

const { CrazyGames } = await import('../src/crazygames.js');

assert.equal(await CrazyGames.init({ timeoutMs: 50 }), true, 'SDK init should resolve');
assert.equal(typeof settingsListener, 'function', 'SDK game settings listener must be installed');
const { configureSaveStorage, loadSave } = await import('../src/save.js');
assert.equal(configureSaveStorage(CrazyGames.dataStorage()), true, 'SDK Data must become the save backend');
assert.equal(JSON.parse(cloudData.get('hb_save_v1')).diamonds, 42, 'legacy local progress must migrate once');
assert.equal(loadSave().diamonds, 42, 'save loading must read through the SDK Data backend');
CrazyGames.loadingStart();
CrazyGames.loadingStart();
CrazyGames.loadingStop();
CrazyGames.loadingStop();
CrazyGames.gameplayStart();
CrazyGames.gameplayStart();
CrazyGames.gameplayStop();
CrazyGames.gameplayStop();
await CrazyGames.midgameAd();
CrazyGames.gameplayStart();
CrazyGames.gameplayStop();
assert.equal(await CrazyGames.rewardedAd(), true, 'adFinished must grant the rewarded placement');
CrazyGames.happytime();
CrazyGames.reportCompletion(100);

assert.deepEqual(calls, [
  'init',
  'loading-start',
  'loading-stop',
  'gameplay-start',
  'gameplay-stop',
  'ad:midgame',
  'gameplay-start',
  'gameplay-stop',
  'ad:rewarded',
  'happytime',
  'completion:100',
], 'lifecycle calls must be ordered and deduplicated');
assert.deepEqual(adStates, [true, false, true, false], 'each ad must disable and restore the game exactly once');
assert.equal(CrazyGames.isAdPlaying(), false);
assert.equal(CrazyGames.isGameplayActive(), false);
assert.equal(CrazyGames.isReady(), true);

let finishPendingAd;
window.CrazyGames.SDK.ad.requestAd = (_type, callbacks) => {
  callbacks.adStarted?.();
  finishPendingAd = callbacks.adFinished;
};
const pendingAd = CrazyGames.midgameAd();
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(CrazyGames.isAdPlaying(), true, 'an active ad must stay locked until an SDK terminal callback');
finishPendingAd();
assert.equal(await pendingAd, true);
assert.equal(CrazyGames.isAdPlaying(), false, 'the ad lock must release after adFinished');

window.CrazyGames.SDK.ad.requestAd = (_type, callbacks) => callbacks.adError?.({ code: 'unfilled' });
assert.equal(await CrazyGames.rewardedAd(), false, 'adError must never grant a rewarded placement');

const timedOutInitCalls = [];
let resolveLateInit;
window.CrazyGames = {
  SDK: {
    init() {
      timedOutInitCalls.push('init');
      return new Promise(resolve => { resolveLateInit = resolve; });
    },
    game: {
      settings: { muteAudio: false },
      addSettingsChangeListener() {},
      loadingStart() { timedOutInitCalls.push('loading-start'); },
      loadingStop() { timedOutInitCalls.push('loading-stop'); },
      gameplayStart() { timedOutInitCalls.push('gameplay-start'); },
      gameplayStop() { timedOutInitCalls.push('gameplay-stop'); },
    },
  },
};
const { CrazyGames: TimedOutCrazyGames } = await import('../src/crazygames.js?timed-out-init');
assert.equal(await TimedOutCrazyGames.init({ timeoutMs: 5 }), false, 'hung SDK init must fail open');
TimedOutCrazyGames.loadingStart();
TimedOutCrazyGames.loadingStop();
TimedOutCrazyGames.gameplayStart();
assert.deepEqual(timedOutInitCalls, ['init'], 'SDK methods must wait for actual initialization');
resolveLateInit();
await new Promise(resolve => setTimeout(resolve, 0));
assert.deepEqual(timedOutInitCalls, [
  'init',
  'loading-start',
  'loading-stop',
  'gameplay-start',
], 'queued lifecycle state must flush if a timed-out SDK eventually initializes');
TimedOutCrazyGames.gameplayStop();
assert.equal(timedOutInitCalls.at(-1), 'gameplay-stop');

delete window.CrazyGames;
const { CrazyGames: MissingSdkCrazyGames } = await import('../src/crazygames.js?missing-sdk');
assert.equal(await MissingSdkCrazyGames.init({ timeoutMs: 10 }), false, 'missing SDK must fail open into gameplay');
assert.equal(await MissingSdkCrazyGames.rewardedAd(), false,
  'production-like missing SDK must never grant a rewarded placement');

const [html, menu, game, result, boot, main, adapter, packageJson, vfxRuntime, uploadCheck] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/scenes/MenuScene.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/scenes/GameScene.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/scenes/ResultScene.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/scenes/BootScene.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/crazygames.js', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../src/game/vfx/VfxRuntime.js', import.meta.url), 'utf8'),
  readFile(new URL('./crazygames-upload.mjs', import.meta.url), 'utf8'),
]);

assert.match(html, /https:\/\/sdk\.crazygames\.com\/crazygames-sdk-v3\.js/);
assert.match(main, /await Platform\.init\(\);[\s\S]*?Platform\.loadingStart\(\);/,
  'SDK init and loadingStart must happen before Phaser starts');
assert.match(main, /configureSaveStorage\(Platform\.dataStorage\(\)\)/,
  'the save backend must switch to CrazyGames Data after SDK initialization');
assert.match(boot, /Platform\.loadingStop\(\)/, 'Boot must report completed game loading');
assert.doesNotMatch(menu, /rewardedAd\(/, 'start boost selection must not trigger a rewarded ad');
assert.match(menu, /DEFAULT_START_BUFF = 'fury'/, 'a default start boost must be selected');
assert.match(menu, /startBuff = this\.selectedStartBuff/, 'standard starts must carry the selected boost');
assert.doesNotMatch(menu, /midgameAd\(/, 'menu navigation must not contain a hidden midgame trigger');
assert.equal((game.match(/rewardedAd\(\)/g) || []).length, 2,
  'gameplay must retain reroll and revive rewarded placements');
assert.doesNotMatch(game, /midgameAd\(/, 'midgame ads must not run when resuming a manual pause');
assert.doesNotMatch(game, /unlockAudio\(\);\s*Platform\.gameplayStart\(\)/,
  'initial gameplayStart must wait for the player to choose a main skill');
assert.match(game, /onMainSkillSelected\(key\)[\s\S]*?resumeGameplay\(\);\s*else Platform\.gameplayStart\(\)/,
  'initial gameplayStart must fire when main-skill selection enters active gameplay');
assert.match(game, /setSecondaryBusy\(t\('ad\.loading'\)\)/,
  'rewarded revive must show an immediate loading state after the click');
assert.match(game, /t\('ad\.unavailable'\)/,
  'rewarded revive failures must be visible instead of looking unresponsive');
assert.match(game, /Platform\.happytime\(\)[\s\S]*?Platform\.reportCompletion\(100\)/,
  'a completed run must report the sparse victory milestone');
assert.equal((result.match(/rewardedAd\(\)/g) || []).length, 1,
  'result must retain its rewarded diamond placement');
assert.match(result, /retryButton[\s\S]*?await Platform\.midgameAd\(\)[\s\S]*?this\.scene\.start\('Game'/,
  'replay must request a midgame ad at the completed-run boundary and always continue');
assert.match(adapter, /game\.settings[\s\S]*?addSettingsChangeListener/,
  'CrazyGames muteAudio settings must be applied and observed');
assert.match(adapter, /dataStorage\(\)[\s\S]*?sdk\(\)\?\.data/,
  'the adapter must expose the initialized CrazyGames Data module');
assert.match(adapter, /adFinished: \(\) => finish\(true\)/,
  'only the adFinished callback may grant a reward');
assert.match(packageJson, /"check:crazygames"/);
assert.match(packageJson, /"prepare:crazygames": "npm run build && node tools\/crazygames-upload\.mjs"/,
  'the CrazyGames handoff must build and validate the direct-upload directory');
assert.doesNotMatch(packageJson, /package-crazygames|\.zip/i,
  'CrazyGames delivery must not create a ZIP archive');
assert.match(uploadCheck, /dist[\\/]client|new URL\('\.\.\/dist\/client\/'/,
  'the upload check must validate dist/client directly');
assert.doesNotMatch(uploadCheck, /ZipFile|createWriteStream|archiv/i,
  'the upload check must not create an archive');
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

console.log('CrazyGames contract OK: SDK v3 lifecycle, platform mute, natural-break midgame ad, 3 rewarded placements, and fail-open behavior verified.');
