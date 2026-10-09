// GameDistribution HTML5 SDK boundary: event-driven pause/resume, mutually
// exclusive ad requests, rewarded completion validation, and fail-open startup.
import { setAudioPaused } from './audio.js';

const IS_DEV = !!import.meta.env?.DEV;
const AD_START_TIMEOUT_MS = 8_000;
const AD_TIMEOUT_MS = 120_000;
const AD_STATE_EVENT = 'platform-ad-state';
const useMockAds = () => IS_DEV
  && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('mockAds');
const sdk = () => (typeof window !== 'undefined' ? window.gdsdk : null);

let initPromise = null;
let initResolve = null;
let sdkReady = false;
let gameplayActive = false;
let adActive = false;
let adPromise = null;
let currentAd = null;

function setAdActive(active) {
  if (adActive === active) return;
  adActive = active;
  setAudioPaused(active, 'gamedistribution-ad');
  if (typeof document !== 'undefined') {
    document.body?.classList.toggle('platform-ad-active', active);
    const root = typeof document.getElementById === 'function' ? document.getElementById('game') : null;
    if (root) root.style.zIndex = active ? '0' : '2147483000';
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function'
    && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AD_STATE_EVENT, { detail: { active } }));
  }
}

function preloadRewarded() {
  const currentSdk = sdkReady ? sdk() : null;
  if (typeof currentSdk?.preloadAd !== 'function') return;
  Promise.resolve()
    .then(() => currentSdk.preloadAd('rewarded'))
    .catch(() => false);
}

function finishCurrentAd(value) {
  const request = currentAd;
  if (!request || request.settled) return;
  request.settled = true;
  clearTimeout(request.timeoutId);
  currentAd = null;
  setAdActive(false);
  request.resolve(value);
  if (request.type === 'rewarded') preloadRewarded();
}

function handleSdkEvent(event = {}) {
  switch (event.name) {
    case 'SDK_READY':
      sdkReady = true;
      initResolve?.(true);
      initResolve = null;
      preloadRewarded();
      break;
    case 'SDK_ERROR':
      initResolve?.(false);
      initResolve = null;
      if (currentAd) finishCurrentAd(false);
      break;
    case 'SDK_GAME_PAUSE':
      if (currentAd) {
        currentAd.pauseObserved = true;
        clearTimeout(currentAd.timeoutId);
        currentAd.timeoutId = setTimeout(() => finishCurrentAd(false), AD_TIMEOUT_MS);
      }
      setAdActive(true);
      break;
    case 'SDK_REWARDED_WATCH_COMPLETE':
      if (currentAd?.type === 'rewarded') currentAd.rewardGranted = true;
      break;
    case 'SDK_GAME_START':
      setAdActive(false);
      if (currentAd?.pauseObserved) {
        finishCurrentAd(currentAd.type === 'rewarded' ? currentAd.rewardGranted : true);
      }
      break;
    default:
      break;
  }
}

function installSdkEvents() {
  if (typeof window === 'undefined' || window.__GD_EVENT_BRIDGE__ === handleSdkEvent) return;
  window.__GD_EVENT_BRIDGE__ = handleSdkEvent;
  const queued = Array.isArray(window.__GD_EVENT_QUEUE__) ? window.__GD_EVENT_QUEUE__.splice(0) : [];
  queued.forEach(handleSdkEvent);
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

  const currentSdk = sdkReady ? sdk() : null;
  if (typeof currentSdk?.showAd !== 'function') return false;

  adPromise = new Promise(resolve => {
    const request = {
      type,
      resolve,
      rewardGranted: false,
      pauseObserved: false,
      settled: false,
      timeoutId: null,
    };
    request.timeoutId = setTimeout(() => finishCurrentAd(false), AD_START_TIMEOUT_MS);
    currentAd = request;

    try {
      const result = type === 'rewarded' ? currentSdk.showAd('rewarded') : currentSdk.showAd();
      Promise.resolve(result)
        .then(() => {
          if (currentAd !== request || request.settled || request.pauseObserved) return;
          finishCurrentAd(type === 'rewarded' ? request.rewardGranted : true);
        })
        .catch(() => finishCurrentAd(false));
    } catch (_) {
      finishCurrentAd(false);
    }
  });

  try { return await adPromise; }
  finally { adPromise = null; }
}

export const GameDistribution = {
  async init({ timeoutMs = 2200 } = {}) {
    if (initPromise) return initPromise;
    installSdkEvents();
    if (sdkReady) return true;
    if (typeof window === 'undefined') {
      initPromise = Promise.resolve(false);
      return initPromise;
    }

    initPromise = new Promise(resolve => {
      let settled = false;
      initResolve = result => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(result);
      };
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        initResolve = null;
        resolve(false);
      }, timeoutMs);
    });
    return initPromise;
  },

  loadingStart() {},
  loadingStop() {},

  gameplayStart() {
    if (adActive) return;
    gameplayActive = true;
  },

  gameplayStop() {
    gameplayActive = false;
  },

  async midgameAd() {
    this.gameplayStop();
    return requestAd('midgame');
  },

  async prerollAd() {
    this.gameplayStop();
    return requestAd('preroll');
  },

  async rewardedAd() {
    return requestAd('rewarded');
  },

  happytime() {},
  reportCompletion() {},
  dataStorage() { return null; },
  portal() { return 'gamedistribution'; },
  supportsRewardedAds() { return true; },
  supportsMidgameAds() { return true; },
  supportsPrerollAds() { return true; },
  isAdPlaying() { return adActive; },
  isGameplayActive() { return gameplayActive; },
  isReady() { return sdkReady; },
};
