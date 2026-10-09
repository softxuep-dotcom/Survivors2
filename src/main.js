import Phaser from 'phaser';
import { W, H, THEME } from './config.js';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GameScene } from './scenes/GameScene.js';
import { UiScene } from './scenes/UiScene.js';
import { ResultScene } from './scenes/ResultScene.js';
import { TalentScene } from './scenes/TalentScene.js';
import { VfxLabScene } from './scenes/VfxLabScene.js';
import { VersionBadgeScene } from './scenes/VersionBadgeScene.js';
import { configureSaveStorage, touchSave } from './save.js';
import { isMuted } from './audio.js';
import { Platform } from './platform.js';
import { installDisplayResolution } from './displayResolution.js';
import { installTextDefaults } from './ui/textDefaults.js';

async function startGame() {
const mini = globalThis.__HORDE_MINIGAME__;
const wechat = typeof __GAME_PORTAL__ === 'string' && __GAME_PORTAL__ === 'wechat';
if (!wechat) {
  const versionBadge = document.createElement('div');
  versionBadge.id = 'game-version';
  versionBadge.textContent = `v${__GAME_VERSION__}`;
  versionBadge.setAttribute('aria-label', `Version ${__GAME_VERSION__}`);
  document.body.appendChild(versionBadge);
}

// 平台构建在资源加载前初始化对应 SDK；独立构建不加载外部 SDK。
// SDK 缺失、被拦截或初始化超时均 fail-open，不阻断本地玩法。
await Platform.init();
configureSaveStorage(Platform.dataStorage());
Platform.loadingStart();

// dev 环境装载无头验证钩子（生产构建自动剔除）
const game = window.__game = new Phaser.Game({
  type: mini ? (mini.webgl ? Phaser.WEBGL : Phaser.CANVAS) : Phaser.AUTO,
  ...(mini ? { canvas: mini.canvas, context: mini.context, customEnvironment: true,
    audio: { noAudio: true }, loader: { imageLoadType: 'HTMLImageElement' },
    input: { touch: { capture: true }, mouse: false } } : {}),
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#0e1410',
  scale: {
    mode: Phaser.Scale.EXPAND,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MenuScene, TalentScene, GameScene, UiScene, ResultScene, VfxLabScene,
    ...(wechat ? [VersionBadgeScene] : [])],
});
// 高清画布与文字默认值必须在首个场景创建文字前装好；DOM 就绪时 Phaser 在构造函数内同步 boot。
const installRenderQuality = () => {
  installDisplayResolution(game);
  installTextDefaults(game);
};
if (game.renderer) installRenderQuality();
else game.events.once(Phaser.Core.Events.BOOT, installRenderQuality);

// 移动端 WebView 看完广告后偶发两类问题：
// 1) 广告 DOM/iframe 黑色遮罩没有及时退场，仍盖在 canvas 上；
// 2) WebGL canvas 已恢复逻辑循环但没有重绘，用户能听到战斗声却看到黑屏。
// 因此广告结束/页面重新可见后，连续几帧把 #game 拉回顶层并强制触发 canvas/Scale 重绘。
function recoverGameSurface(reason = 'unknown') {
  const root = document.getElementById('game');
  const canvas = game.canvas;
  document.body?.classList.remove('platform-ad-active');
  if (root) {
    root.style.zIndex = '2147483000';
    root.style.visibility = 'visible';
    root.style.opacity = '1';
    root.style.display = 'block';
  }
  if (canvas) {
    canvas.style.visibility = 'visible';
    canvas.style.opacity = '1';
    canvas.style.display = 'block';
    canvas.style.transform = 'translateZ(0)';
  }
  const refresh = () => {
    try { game.scale?.refresh?.(); } catch (_) {}
    try { game.renderer?.resize?.(game.scale.width, game.scale.height); } catch (_) {}
    try { window.dispatchEvent(new Event('resize')); } catch (_) {}
    try {
      const scene = game.scene?.getScene?.('Game');
      scene?.cameras?.main?.setBackgroundColor?.(scene.worldSkin === 'blood' ? '#16090c' : '#0e1410');
    } catch (_) {}
  };
  refresh();
  requestAnimationFrame(refresh);
  setTimeout(refresh, 80);
  setTimeout(refresh, 240);
  if (import.meta.env.DEV) console.info(`[surface] recovered after ${reason}`);
}

window.addEventListener('platform-ad-state', (event) => {
  if (!event.detail?.active) recoverGameSurface('ad');
});
window.addEventListener('pageshow', () => recoverGameSurface('pageshow'));
window.addEventListener('focus', () => recoverGameSurface('focus'));
game.canvas?.addEventListener?.('webglcontextlost', (event) => {
  event.preventDefault();
  console.warn('[surface] WebGL context lost during page/ad transition');
});
game.canvas?.addEventListener?.('webglcontextrestored', () => recoverGameSurface('webgl-restored'));

// 开发环境装载自动化试玩钩子；生产构建会剔除该分支。
if (import.meta.env.DEV) {
  import('./dev/testHooks.js').then(({ installTestHooks }) => installTestHooks(game));
  if (new URLSearchParams(window.location.search).has('captureVideo')) {
    import('./dev/videoCapture.js').then(({ installVideoCapture }) => installVideoCapture(game));
  }
}

// 离页写档兜底（沿用 Merge Towers 方案）
function persistSessionExit() {
  const s = game.registry.get('save');
  if (s) touchSave(s, { muted: isMuted() });
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) persistSessionExit();
  else recoverGameSurface('visibility');
});
window.addEventListener('pagehide', persistSessionExit);
window.addEventListener('beforeunload', persistSessionExit);
}

startGame().catch(error => {
  console.error('[boot]', error);
  (typeof __GAME_PORTAL__ === 'string' && __GAME_PORTAL__ === 'wechat' ? globalThis.wx : globalThis.tt)?.showModal?.({ title: '启动失败', content: '请关闭小游戏后重试。', showCancel: false });
});
