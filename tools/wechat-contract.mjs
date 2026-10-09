globalThis.__GAME_PORTAL__ = 'wechat';
import assert from 'node:assert/strict';
import { createWechatPlatform } from '../src/platforms/wechat.js';
import { installWechatAdapter, createWechatHost } from '../src/minigame/wechat-adapter.js';
import { unlockAudio, Sfx, setMuted } from '../src/audio.js';
import { stripLeadingIcon } from '../src/ui/labelText.js';
import { EN, ZH } from '../src/i18n.js';
import { GENERATED_LOCALES } from '../src/locales.generated.js';
import { loadWechatResources } from '../src/minigame/wechat-bootstrap.js';

// A download failure never boots Phaser. Retrying ignores callbacks from the
// old attempt and starts the game exactly once after the resource package loads.
let download, retryModal, boots = 0;
const loader = {
  loadSubpackage(options) { download = options; assert.equal(options.name, 'resources');
    return { onProgressUpdate(fn) { fn({ progress: 50 }); } }; },
  showLoading() {}, hideLoading() {}, showModal(options) { retryModal = options; },
};
loadWechatResources(loader, () => boots++);
assert.equal(boots, 0);
const oldDownload = download;
download.fail({ errMsg: 'offline' });
assert.equal(boots, 0);
retryModal.success({ confirm: true });
oldDownload.success();
assert.equal(boots, 0, 'Stale success cannot start the game');
download.success(); download.success();
assert.equal(boots, 1);

// The reference regexp runs only in Node. Native game code must not use it.
// Compare every translation so new decorative prefixes cannot silently regress.
for (const extraIcons of ['', '◆♦', '↻◆♦']) {
  const previous = new RegExp(`^\\s*[\\p{Extended_Pictographic}\\uFE0F\\u200D${extraIcons}]+\\s*`, 'u');
  for (const dict of [EN, ZH, ...Object.values(GENERATED_LOCALES)]) {
    for (const label of Object.values(dict)) {
      assert.equal(stripLeadingIcon(label, extraIcons), label.replace(previous, ''), label);
    }
  }
}
assert.equal(stripLeadingIcon('  🎬️ 观看广告 · 额外 ◆10', '↻◆♦'), '观看广告 · 额外 ◆10');
assert.equal(stripLeadingIcon('  元素破潮'), '  元素破潮');
assert.equal(stripLeadingIcon('🏆🏆 新纪录！'), '新纪录！');
assert.equal(stripLeadingIcon('◆ 10'), '◆ 10');
assert.equal(stripLeadingIcon('◆ 10', '◆♦'), '10');
assert.equal(stripLeadingIcon('𠮷野家'), '𠮷野家', 'Do not strip supplementary CJK characters');
assert.equal(stripLeadingIcon(''), '');

const callbacks = {};
const values = new Map();
let canvasCount = 0;
const api = {
  getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844, screenWidth: 400, screenHeight: 890,
    platform: 'ios', system: 'iOS 18' }),
  createCanvas: () => ({ number: ++canvasCount, getContext: () => ({}) }),
  createImage: () => ({}),
  getStorageSync: key => values.get(key) ?? '',
  setStorageSync: (key, value) => values.set(key, value),
  removeStorageSync: key => values.delete(key),
  onTouchStart: fn => { callbacks.touch = fn; },
  onHide: fn => { callbacks.hide = fn; }, onShow: fn => { callbacks.show = fn; },
  getFileSystemManager: () => ({ readFile: options => options.filePath === 'missing'
    ? options.fail(new Error('missing')) : options.success({ data: options.encoding ? '{"ok":true}' : new ArrayBuffer(4) }) }),
};
const root = {};
const runtime = installWechatAdapter(api, root);
const readonlyEnvironment = {};
const nativeGlobals = {};
for (const name of ['window', 'self', 'document', 'navigator', 'location', 'screen']) {
  nativeGlobals[name] = { native: name };
  Object.defineProperty(readonlyEnvironment, name, { get: () => nativeGlobals[name] });
}
Object.preventExtensions(readonlyEnvironment);
const isolatedHost = createWechatHost({ ...api,
  createCanvas: () => ({ getContext: () => ({}) }),
  onTouchStart() {}, onHide() {}, onShow() {},
}, readonlyEnvironment);
assert.equal(isolatedHost.wx.createImage, api.createImage, 'The private scope retains the wx API');
for (const name of Object.keys(nativeGlobals)) {
  assert.equal(readonlyEnvironment[name], nativeGlobals[name], `Native ${name} remains unchanged`);
  assert.notEqual(isolatedHost[name], nativeGlobals[name], `${name} uses the game shim`);
}
assert.equal(root.wx, api);
assert.equal(root.tt, undefined, 'WeChat does not impersonate the Douyin API');
const webAudio = { state: 'running' };
const webAudioRoot = {};
installWechatAdapter({ ...api, createCanvas: () => ({ getContext: () => ({}) }),
  onTouchStart() {}, onHide() {}, onShow() {}, createWebAudioContext: () => webAudio }, webAudioRoot);
assert.equal(new webAudioRoot.window.AudioContext(), webAudio);
assert.deepEqual(root.screen, { width: 400, height: 890 }, 'Native global screen is supplied by the adapter');
assert.equal(root.screen, root.window.screen, 'Phaser uses both screen and window.screen');
assert.equal(runtime.canvas.number, 1);
assert.equal(root.document.createElement('canvas').number, 3);
assert.ok(runtime.canvas instanceof root.HTMLCanvasElement);
assert.ok(new root.Image() instanceof root.HTMLImageElement);
let touch;
runtime.canvas.addEventListener('touchstart', event => { touch = event; });
callbacks.touch({ touches: [{ identifier: 1, x: 12, y: 24 }], changedTouches: [{ identifier: 1, x: 12, y: 24 }] });
assert.equal(touch.changedTouches[0].clientX, 12);
assert.equal(touch.target, runtime.canvas);
callbacks.hide(); assert.equal(root.document.hidden, true);
callbacks.show(); assert.equal(root.document.hidden, false);
for (const type of ['text', 'arraybuffer']) {
  const xhr = new root.XMLHttpRequest();
  xhr.open('GET', 'assets/test'); xhr.responseType = type;
  await new Promise(resolve => { xhr.onload = resolve; xhr.send(); });
  assert.equal(xhr.status, 200);
  assert.ok(type === 'text' ? xhr.responseText.includes('ok') : xhr.response instanceof ArrayBuffer);
}
const missing = new root.XMLHttpRequest(); missing.open('GET', 'missing');
await new Promise(resolve => { missing.onerror = resolve; missing.send(); });
globalThis.window = root.window;
globalThis.CustomEvent = root.CustomEvent;
let close, error, mode = 'normal';
api.createRewardedVideoAd = () => ({
  onClose: fn => { close = fn; }, offClose: fn => { if (close === fn) close = null; },
  onError: fn => { error = fn; }, offError: fn => { if (error === fn) error = null; },
  show: () => mode === 'reject' ? Promise.reject(new Error('no fill')) : Promise.resolve(),
});
const platform = createWechatPlatform(api, 'test', 30);
await platform.init();
platform.dataStorage().setItem('save', '{"diamonds":7}');
assert.equal(platform.dataStorage().getItem('save'), '{"diamonds":7}');
const first = platform.rewardedAd();
assert.equal(platform.isAdPlaying(), true);
assert.equal(await platform.rewardedAd(), false, 'Concurrent request rejected');
const staleClose = close;
close({ isEnded: true });
assert.equal(await first, true);
assert.equal(platform.isAdPlaying(), false);
for (const result of [undefined, {}, { isEnded: false }]) {
  const request = platform.rewardedAd(); close(result); assert.equal(await request, false);
}
const failure = platform.rewardedAd(); error({ errCode: 1 }); assert.equal(await failure, false);
mode = 'reject'; assert.equal(await platform.rewardedAd(), false);
mode = 'normal'; assert.equal(await platform.rewardedAd(), false, 'Missing callbacks time out');
staleClose({ isEnded: true }); assert.equal(platform.isAdPlaying(), false);
const disabled = createWechatPlatform(api); await disabled.init();
assert.equal(disabled.supportsRewardedAds(), false);
assert.equal(await disabled.rewardedAd(), false);
globalThis.__HORDE_MINIGAME__ = runtime;
globalThis.wx = api;
const nativeAudio = [];
api.createInnerAudioContext = () => {
  const audio = { onEnded() {}, onError() {}, play() { this.played = true; }, stop() { this.stopped = true; } };
  nativeAudio.push(audio); return audio;
};
unlockAudio();
Sfx.weaponCast('blade');
assert.equal(nativeAudio.length, 6, 'Fallback creates only a fixed six-voice pool');
assert.equal(nativeAudio[0].played, true);
setMuted(true);
assert.ok(nativeAudio.every(voice => voice.stopped), 'Mute stops all native voices');
console.log('Wechat contracts passed: locale icon prefixes, canvas, touch, lifecycle, storage, local text/binary, ads complete/cancel/error/concurrency/timeout.');
