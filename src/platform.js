import { CrazyGames } from './crazygames.js';
import { GameDistribution } from './gamedistribution.js';
import { Douyin } from './platforms/douyin.js';

const BUILD_PORTAL = typeof __GAME_PORTAL__ === 'string' ? __GAME_PORTAL__ : 'crazygames';

const Standalone = Object.freeze({
  async init() { return false; },
  loadingStart() {},
  loadingStop() {},
  gameplayStart() {},
  gameplayStop() {},
  async midgameAd() { return false; },
  async prerollAd() { return false; },
  async rewardedAd() { return false; },
  happytime() {},
  reportCompletion() {},
  dataStorage() { return null; },
  portal() { return BUILD_PORTAL; },
  supportsRewardedAds() { return false; },
  supportsMidgameAds() { return false; },
  supportsPrerollAds() { return false; },
  isAdPlaying() { return false; },
  isGameplayActive() { return false; },
  isReady() { return false; },
});

export const Platform = BUILD_PORTAL === 'crazygames'
  ? CrazyGames
  : BUILD_PORTAL === 'douyin'
    ? Douyin
  : BUILD_PORTAL === 'gamedistribution'
    ? GameDistribution
    : Standalone;
