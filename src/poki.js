// Poki SDK 边界：生命周期去重、广告互斥、静音/禁输入与离线 fail-safe。
import { setAudioPaused } from './audio.js';

const IS_DEV = !!import.meta.env?.DEV;
const useMockAds = () => IS_DEV
  && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('mockAds');
const sdk = () => (!useMockAds() && typeof window !== 'undefined' && window.PokiSDK) ? window.PokiSDK : null;

let initPromise = null;
let sdkInitTask = null;
let sdkReady = false;
let loadingFinished = false;
let gameplayActive = false;
let adActive = false;
let adPromise = null;

function safeCall(call) {
  try { return call(); } catch (_) { return undefined; }
}

function afterSdkInit(call) {
  if (!initPromise) return;
  if (sdkReady) {
    safeCall(call);
    return;
  }
  // The game deliberately fails open when SDK init rejects or times out.
  // Flush lifecycle events after that same boundary so Poki Inspector still
  // receives them even when the underlying init promise remains pending.
  initPromise.then(() => safeCall(call));
}

function setAdActive(active) {
  if (adActive === active) return;
  adActive = active;
  setAudioPaused(active, 'poki');
  if (typeof document !== 'undefined') {
    document.body?.classList.toggle('poki-ad-active', active);
    const root = typeof document.getElementById === 'function' ? document.getElementById('game') : null;
    if (root) root.style.zIndex = active ? '0' : '2147483000';
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('poki-ad-state', { detail: { active } }));
  }
}

async function runAd(task, fallback) {
  if (adPromise) return fallback;
  adPromise = (async () => {
    let started = false;
    const onStart = () => {
      started = true;
      setAdActive(true);
    };
    try {
      return await task(onStart);
    } catch (_) {
      return fallback;
    }
    finally {
      if (started) setAdActive(false);
    }
  })();
  try { return await adPromise; }
  finally { adPromise = null; }
}

export const Poki = {
  async init({ timeoutMs = 2200 } = {}) {
    if (initPromise) return initPromise;
    const s = sdk();
    if (!s?.init) {
      sdkInitTask = Promise.resolve(false);
      initPromise = Promise.resolve(false);
      return initPromise;
    }

    sdkInitTask = Promise.resolve().then(() => s.init()).then(() => {
      sdkReady = true;
      return true;
    }).catch(() => false);
    initPromise = Promise.race([
      sdkInitTask,
      new Promise(resolve => setTimeout(() => resolve(false), timeoutMs)),
    ]);
    return initPromise;
  },

  gameLoadingFinished() {
    if (loadingFinished) return;
    loadingFinished = true;
    afterSdkInit(() => sdk()?.gameLoadingFinished?.());
  },

  gameplayStart() {
    if (gameplayActive || adActive) return;
    gameplayActive = true;
    afterSdkInit(() => sdk()?.gameplayStart?.());
  },

  gameplayStop() {
    if (!gameplayActive) return;
    gameplayActive = false;
    afterSdkInit(() => sdk()?.gameplayStop?.());
  },

  async commercialBreak() {
    this.gameplayStop();
    const s = sdk();
    if (!s?.commercialBreak) return;
    await runAd((onStart) => s.commercialBreak(onStart), undefined);
  },

  async rewardedBreak({ size = 'medium' } = {}) {
    const s = sdk();
    // 本地开发直接成功便于验收；生产缺 SDK / 广告被拦截时绝不发奖。
    if (!s?.rewardedBreak) return IS_DEV;
    return !!(await runAd((onStart) => s.rewardedBreak({ size, onStart }), false));
  },

  isAdPlaying() { return adActive; },
  isGameplayActive() { return gameplayActive; },
};
