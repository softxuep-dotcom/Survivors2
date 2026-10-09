import { setAudioPaused } from '../audio.js';

// Factory keeps SDK state isolated and makes callback races testable without tt.
export function createDouyinPlatform(api, adUnitId = '', timeoutMs = 120_000) {
  let ready = false;
  let gameplay = false;
  let ad = null;
  let pending = null;
  let active = false;
  const notify = value => {
    active = value;
    setAudioPaused(value, 'douyin-ad');
    globalThis.window?.dispatchEvent(new CustomEvent('platform-ad-state', { detail: { active: value } }));
  };
  const storage = {
    getItem(key) { const value = api.getStorageSync(key); return value === '' || value == null ? null : String(value); },
    setItem(key, value) { api.setStorageSync(key, String(value)); },
    removeItem(key) { api.removeStorageSync(key); },
  };
  return {
    async init() {
      if (ready) return true;
      ready = !!api;
      if (adUnitId && api?.createRewardedVideoAd) {
        try { ad = api.createRewardedVideoAd({ adUnitId }); }
        catch (error) { console.warn('[douyin] rewarded unavailable', error); }
      }
      return ready;
    },
    loadingStart() {}, loadingStop() {},
    gameplayStart() { gameplay = true; },
    gameplayStop() { gameplay = false; },
    async midgameAd() { return false; },
    async prerollAd() { return false; },
    async rewardedAd() {
      if (!ad || pending) return false;
      const video = ad;
      let resolveResult;
      pending = new Promise(resolve => { resolveResult = resolve; });
      const result = pending;
      let settled = false;
      const finish = rewarded => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        video.offClose?.(onClose);
        video.offError?.(onError);
        notify(false);
        pending = null;
        resolveResult(rewarded);
      };
      const onClose = result => finish(result?.isEnded === true);
      const onError = () => finish(false);
      const timer = setTimeout(() => {
        // The SDK singleton may still emit a late close. Quarantine it for
        // this session so that callback cannot reward a subsequent request.
        ad = null;
        finish(false);
      }, timeoutMs);
      notify(true);
      try {
        video.onClose(onClose);
        video.onError(onError);
        // No automatic second show: a failed/late request must never open an ad
        // after the caller has already returned to play.
        Promise.resolve(video.show()).catch(onError);
      } catch (_) { onError(); }
      return result;
    },
    happytime() {}, reportCompletion() {},
    dataStorage() { return ready ? storage : null; },
    portal() { return 'douyin'; },
    supportsRewardedAds() { return !!ad; },
    supportsMidgameAds() { return false; },
    supportsPrerollAds() { return false; },
    isAdPlaying() { return active; },
    isGameplayActive() { return gameplay; },
    isReady() { return ready; },
  };
}

export const Douyin = createDouyinPlatform(globalThis.tt,
  typeof __DOUYIN_REWARDED_AD_UNIT_ID__ === 'string' ? __DOUYIN_REWARDED_AD_UNIT_ID__ : '');
