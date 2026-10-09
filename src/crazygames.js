// CrazyGames SDK v3 boundary: lifecycle dedupe, ad mutual exclusion,
// platform audio settings, input lock signaling, and fail-open initialization.
import { setAudioPaused } from './audio.js';

const IS_DEV = !!import.meta.env?.DEV;
const AD_TIMEOUT_MS = 120_000;
const useMockAds = () => IS_DEV
  && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('mockAds');
const sdk = () => (typeof window !== 'undefined' ? window.CrazyGames?.SDK : null);

let initPromise = null;
let sdkReady = false;
let loadingStarted = false;
let loadingFinished = false;
let sdkLoadingStarted = false;
let sdkLoadingFinished = false;
let gameplayActive = false;
let sdkGameplayActive = false;
let adActive = false;
let adPromise = null;
let settingsListener = null;

function safeCall(call) {
  try { return call(); } catch (_) { return undefined; }
}

function applyGameSettings(settings = {}) {
  setAudioPaused(!!settings.muteAudio, 'crazygames-settings');
}

function installGameSettings() {
  const game = sdk()?.game;
  if (!game) return;
  applyGameSettings(game.settings);
  if (!settingsListener && typeof game.addSettingsChangeListener === 'function') {
    settingsListener = settings => applyGameSettings(settings);
    safeCall(() => game.addSettingsChangeListener(settingsListener));
  }
}

function flushLifecycle() {
  if (!sdkReady) return;
  const game = sdk()?.game;
  if (!game) return;

  if (loadingStarted && !sdkLoadingStarted) {
    sdkLoadingStarted = true;
    safeCall(() => game.loadingStart?.());
  }
  if (loadingFinished && !sdkLoadingFinished) {
    if (!sdkLoadingStarted) {
      sdkLoadingStarted = true;
      safeCall(() => game.loadingStart?.());
    }
    sdkLoadingFinished = true;
    safeCall(() => game.loadingStop?.());
  }
  if (gameplayActive !== sdkGameplayActive) {
    sdkGameplayActive = gameplayActive;
    safeCall(() => gameplayActive ? game.gameplayStart?.() : game.gameplayStop?.());
  }
}

function setAdActive(active) {
  if (adActive === active) return;
  adActive = active;
  setAudioPaused(active, 'crazygames-ad');
  if (typeof document !== 'undefined') {
    document.body?.classList.toggle('platform-ad-active', active);
    const root = typeof document.getElementById === 'function' ? document.getElementById('game') : null;
    if (root) root.style.zIndex = active ? '0' : '2147483000';
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('platform-ad-state', { detail: { active } }));
  }
}

async function runMockAd() {
  setAdActive(true);
  await new Promise(resolve => setTimeout(resolve, 250));
  setAdActive(false);
  return true;
}

async function requestAd(type) {
  if (adPromise) return false;
  if (useMockAds()) {
    adPromise = runMockAd();
    try { return await adPromise; }
    finally { adPromise = null; }
  }

  const ad = sdkReady ? sdk()?.ad : null;
  // Development stays easy to exercise if the CDN is unavailable. Production
  // never grants a rewarded placement without an adFinished callback.
  if (!ad?.requestAd) return IS_DEV;

  adPromise = new Promise(resolve => {
    let settled = false;
    let started = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (started) setAdActive(false);
      resolve(value);
    };
    const timeoutId = setTimeout(() => finish(false), AD_TIMEOUT_MS);
    const callbacks = {
      adStarted: () => {
        if (settled || started) return;
        started = true;
        setAdActive(true);
      },
      adFinished: () => finish(true),
      adError: () => finish(false),
    };
    try { ad.requestAd(type, callbacks); }
    catch (_) { finish(false); }
  });

  try { return await adPromise; }
  finally { adPromise = null; }
}

export const CrazyGames = {
  async init({ timeoutMs = 2200 } = {}) {
    if (initPromise) return initPromise;
    const currentSdk = sdk();
    if (!currentSdk?.init) {
      initPromise = Promise.resolve(false);
      return initPromise;
    }

    const sdkInitTask = Promise.resolve()
      .then(() => currentSdk.init())
      .then(() => {
        sdkReady = true;
        installGameSettings();
        flushLifecycle();
        return true;
      })
      .catch(() => false);
    initPromise = new Promise(resolve => {
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(false);
      }, timeoutMs);
      sdkInitTask.then(result => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(result);
      });
    });
    return initPromise;
  },

  loadingStart() {
    if (loadingStarted) return;
    loadingStarted = true;
    flushLifecycle();
  },

  loadingStop() {
    if (loadingFinished) return;
    loadingStarted = true;
    loadingFinished = true;
    flushLifecycle();
  },

  gameplayStart() {
    if (gameplayActive || adActive) return;
    gameplayActive = true;
    flushLifecycle();
  },

  gameplayStop() {
    if (!gameplayActive) return;
    gameplayActive = false;
    flushLifecycle();
  },

  async midgameAd() {
    this.gameplayStop();
    return requestAd('midgame');
  },

  async prerollAd() { return false; },

  async rewardedAd() {
    return requestAd('rewarded');
  },

  happytime() {
    if (sdkReady) safeCall(() => sdk()?.game?.happytime?.());
  },

  reportCompletion(percent) {
    const value = Math.max(0, Math.min(100, Number(percent) || 0));
    if (sdkReady) safeCall(() => sdk()?.game?.reportGameCompletedPercentage?.(value));
  },

  dataStorage() {
    if (!sdkReady || sdk()?.environment === 'disabled') return null;
    const data = sdk()?.data;
    return data && typeof data.getItem === 'function' && typeof data.setItem === 'function' ? data : null;
  },

  portal() { return 'crazygames'; },
  supportsRewardedAds() { return true; },
  supportsMidgameAds() { return true; },
  supportsPrerollAds() { return false; },
  isAdPlaying() { return adActive; },
  isGameplayActive() { return gameplayActive; },
  isReady() { return sdkReady; },
};
