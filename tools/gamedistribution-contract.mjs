import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const calls = [];
const adStates = [];
let rewardNext = false;
let rejectNext = false;

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
  __GD_EVENT_QUEUE__: [{ name: 'SDK_READY' }],
  dispatchEvent(event) {
    if (event.type === 'platform-ad-state') adStates.push(event.detail.active);
  },
  gdsdk: {
    preloadAd(type) {
      calls.push(`preload:${type}`);
      return Promise.resolve();
    },
    showAd(type) {
      calls.push(type === 'rewarded' ? 'ad:rewarded' : 'ad:midgame');
      if (rejectNext) {
        rejectNext = false;
        return Promise.reject(new Error('unfilled'));
      }
      window.__GD_EVENT_BRIDGE__({ name: 'SDK_GAME_PAUSE' });
      queueMicrotask(() => {
        if (type === 'rewarded' && rewardNext) {
          rewardNext = false;
          window.__GD_EVENT_BRIDGE__({ name: 'SDK_REWARDED_WATCH_COMPLETE' });
        }
        window.__GD_EVENT_BRIDGE__({ name: 'SDK_GAME_START' });
      });
      return Promise.resolve();
    },
  },
};

const { GameDistribution } = await import('../src/gamedistribution.js');

assert.equal(await GameDistribution.init({ timeoutMs: 50 }), true, 'queued SDK_READY must initialize the adapter');
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(GameDistribution.isReady(), true);
assert.equal(GameDistribution.dataStorage(), null, 'GameDistribution builds must keep localStorage saves');
assert.equal(GameDistribution.supportsRewardedAds(), true);
assert.equal(GameDistribution.supportsMidgameAds(), true);

GameDistribution.gameplayStart();
assert.equal(GameDistribution.isGameplayActive(), true);
assert.equal(await GameDistribution.prerollAd(), true, 'the first Play action must support a GD preroll');
GameDistribution.gameplayStart();
assert.equal(await GameDistribution.midgameAd(), true, 'SDK_GAME_START must complete an interstitial');
assert.equal(GameDistribution.isGameplayActive(), false, 'midgame ads must stop gameplay first');

rewardNext = true;
assert.equal(await GameDistribution.rewardedAd(), true,
  'SDK_REWARDED_WATCH_COMPLETE followed by SDK_GAME_START must grant the reward');
assert.equal(await GameDistribution.rewardedAd(), false,
  'closing a rewarded ad without SDK_REWARDED_WATCH_COMPLETE must not grant the reward');

rejectNext = true;
assert.equal(await GameDistribution.rewardedAd(), false, 'rejected or unfilled ads must fail open without a reward');
await new Promise(resolve => setTimeout(resolve, 0));

assert.deepEqual(adStates, [true, false, true, false, true, false, true, false],
  'served ads must disable and restore the game surface exactly once');
assert.equal(GameDistribution.isAdPlaying(), false);
assert.equal(calls.filter(call => call === 'ad:rewarded').length, 3);
assert.ok(calls.filter(call => call === 'preload:rewarded').length >= 3,
  'rewarded inventory must be preloaded initially and refreshed after completed requests');

delete window.gdsdk;
delete window.__GD_EVENT_BRIDGE__;
window.__GD_EVENT_QUEUE__ = [];
const { GameDistribution: MissingSdk } = await import('../src/gamedistribution.js?missing-sdk');
assert.equal(await MissingSdk.init({ timeoutMs: 5 }), false, 'missing SDK initialization must time out fail-open');
assert.equal(await MissingSdk.rewardedAd(), false, 'missing SDK must never grant a rewarded placement');

const [viteConfig, main, boot, menu, game, result, platform, adapter, packageJson, uploadCheck] = await Promise.all([
  readFile(new URL('../vite.config.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/scenes/BootScene.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/scenes/MenuScene.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/scenes/GameScene.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/scenes/ResultScene.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/platform.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/gamedistribution.js', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
  readFile(new URL('./gamedistribution-upload.mjs', import.meta.url), 'utf8'),
]);

assert.match(viteConfig, /mode === 'gamedistribution'/);
assert.match(viteConfig, /window\["GD_OPTIONS"\]/, 'GD_OPTIONS must be assigned before the SDK script');
assert.match(viteConfig, /https:\/\/html5\.api\.gamedistribution\.com\/main\.min\.js/);
assert.match(viteConfig, /gamedistribution-jssdk" async/,
  'a blocked SDK CDN must not prevent the game module from starting fail-open');
assert.match(viteConfig, /__GD_EVENT_QUEUE__/,
  'SDK events fired before the module graph loads must be retained for the adapter');
assert.match(viteConfig, /GD_GAME_ID/, 'the platform game ID must be supplied as build configuration');
assert.match(main, /await Platform\.init\(\);[\s\S]*?Platform\.loadingStart\(\);/,
  'platform initialization must happen before Phaser starts');
assert.match(boot, /Platform\.loadingStop\(\)/);
assert.match(menu, /Platform\.supportsPrerollAds\(\)[\s\S]*?Platform\.prerollAd\(\)/,
  'GameDistribution builds must request a preroll from the player Play action');
assert.match(platform, /BUILD_PORTAL === 'gamedistribution'[\s\S]*?GameDistribution/,
  'the shared facade must select the GameDistribution adapter');
assert.equal((game.match(/Platform\.rewardedAd\(\)/g) || []).length, 2,
  'gameplay must retain rewarded reroll and revive placements');
assert.match(game, /onAdState\(event\)[\s\S]*?pauseGameplay\('ad'\)[\s\S]*?resumeGameplay\(\)/,
  'an SDK-driven ad that arrives during active gameplay must pause and resume the simulation');
assert.match(game, /pauseReason = 'ad-revive-ready'[\s\S]*?primaryLabel: t\('pause\.resume'\)[\s\S]*?onPrimary: continueAfterReward/,
  'rewarded revive must wait on a player-controlled Resume action after the ad returns');
assert.equal((result.match(/Platform\.rewardedAd\(\)/g) || []).length, 1,
  'results must retain the rewarded diamond placement');
assert.match(result, /Platform\.supportsMidgameAds\(\)[\s\S]*?Platform\.midgameAd\(\)/,
  'replay must request an interstitial at the completed-run boundary');
assert.match(adapter, /SDK_REWARDED_WATCH_COMPLETE[\s\S]*?rewardGranted = true/,
  'only the rewarded completion event may mark the reward as earned');
assert.match(adapter, /SDK_GAME_PAUSE[\s\S]*?setAdActive\(true\)/,
  'SDK pause events must mute and lock the game');
assert.match(adapter, /SDK_GAME_START[\s\S]*?setAdActive\(false\)/,
  'SDK start events must restore the game');
assert.match(packageJson, /"build:gamedistribution"/);
assert.match(packageJson, /"prepare:gamedistribution"/);
assert.match(uploadCheck, /__GD_GAME_ID_REQUIRED__/,
  'the upload gate must reject builds made without a real dashboard game ID');

const [{ EN, ZH }, { GENERATED_LOCALES }] = await Promise.all([
  import('../src/i18n.js'),
  import('../src/locales.generated.js'),
]);
const adDisclosureTokens = {
  en: 'WATCH AD',
  'zh-CN': '观看广告',
  fr: 'PUB',
  it: 'PUBBLICITÀ',
  de: 'WERBUNG',
  es: 'ANUNCIO',
  tr: 'REKLAM',
  ja: '広告',
  ko: '광고',
  'pt-BR': 'ANÚNCIO',
  ru: 'РЕКЛАМУ',
};
const dictionaries = { en: EN, 'zh-CN': ZH, ...GENERATED_LOCALES };
for (const [locale, token] of Object.entries(adDisclosureTokens)) {
  for (const key of ['ad.reroll', 'ad.revive', 'result.double']) {
    assert.match(dictionaries[locale][key], new RegExp(token, 'iu'),
      `${locale} ${key} must explicitly disclose that an ad will be watched`);
  }
}

console.log('GameDistribution contract OK: SDK lifecycle, Play preroll, replay interstitial, 3 rewarded placements, local saves, and fail-open behavior verified.');
