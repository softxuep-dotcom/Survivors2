// Optional integration check. Set PLAYWRIGHT_MODULE to an installed playwright
// entry file, then run after build:wechat. Real wx / device QA is still required.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const root = resolve(import.meta.dirname, '../dist/wechat');
const out = resolve(import.meta.dirname, '../artifacts/wechat');
const fallback = process.argv.includes('--fallback');
const missingAsset = process.argv.includes('--missing-asset');
const suffix = fallback ? '-fallback' : '';
await mkdir(out, { recursive: true });
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    // Match the supported suffixes of the native package, rather than letting
    // the browser silently accept WebP / .frag that an IDE may omit.
    if (path !== root && !['.js', '.json', '.png', '.wav', '.txt'].includes(extname(path))) {
      res.writeHead(404).end(); return;
    }
    if (missingAsset && path.endsWith('player-knight-smooth-v3.png')) { res.writeHead(404).end(); return; }
    const data = path === root ? '<html><style>body{margin:0;background:#111}canvas{width:100vw!important;height:100vh!important}</style><body></body></html>' : await readFile(path);
    const types = { '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp' };
    res.setHeader('Content-Type', path === root ? 'text/html' : types[extname(path)] || 'application/octet-stream');
    res.end(data);
  } catch (_) { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => { errors.push(error.stack); console.error(error.stack); });
  page.on('console', message => { if (message.type() === 'error') { errors.push(message.text()); console.error(message.text()); } });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(async fallback => {
    const native = { Image, AudioContext, requestAnimationFrame, cancelAnimationFrame, performance };
    const store = new Map(); const hooks = {}; const startupErrors = [];
    const root = { performance, requestAnimationFrame: requestAnimationFrame.bind(window),
      cancelAnimationFrame: cancelAnimationFrame.bind(window) };
    // WeChat IDE exposes Window accessor properties without setters. Do not
    // give the adapter a freely writable mock that hides this real failure.
    for (const key of ['window', 'self', 'document', 'navigator', 'location', 'screen']) {
      const value = window[key];
      Object.defineProperty(root, key, { get: () => value, configurable: false });
    }
    let count = 0;
    const wx = {
      getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844, platform: 'ios', system: 'iOS 18',
        safeArea: { top: 44, bottom: 810 } }),
      getMenuButtonBoundingClientRect: () => ({ bottom: 80 }),
      createCanvas: () => {
        const c = document.createElement('canvas');
        if (fallback) { const get = c.getContext.bind(c); c.getContext = (type, ...args) => type.includes('webgl') ? null : get(type, ...args); }
        if (!count++) document.body.appendChild(c); return c;
      },
      createImage: () => new native.Image(), createWebAudioContext: () => new native.AudioContext(),
      getStorageSync: key => store.get(key) ?? '', setStorageSync: (key, value) => store.set(key, value),
      removeStorageSync: key => store.delete(key),
      getFileSystemManager: () => ({ readFile: options => fetch(options.filePath).then(async res => {
        if (!res.ok) throw new Error(options.filePath);
        options.success({ data: options.encoding ? await res.text() : await res.arrayBuffer() });
      }).catch(options.fail) }),
      showModal: options => { startupErrors.push(options); console.error('Modal:', options.content); }, setKeepScreenOn() {},
    };
    for (const key of ['onTouchStart', 'onTouchMove', 'onTouchEnd', 'onTouchCancel', 'onHide', 'onShow', 'onWindowResize']) {
      wx[key] = fn => { hooks[key] = fn; };
    }
    root.wx = wx;
    let resourcesReady = false;
    wx.showLoading = () => {};
    wx.hideLoading = () => {};
    wx.loadSubpackage = options => {
      if (options.name !== 'resources') throw new Error('Wrong resource subpackage');
      setTimeout(() => { resourcesReady = true; options.success(); }, 20);
      return { onProgressUpdate(fn) { fn({ progress: 50 }); } };
    };
    const sources = Object.fromEntries(await Promise.all(['game.js', 'adapter.js', 'bootstrap.js', 'horde.js']
      .map(async name => [name, await (await fetch(name)).text()])));
    const cache = {};
    function requireModule(name) {
      name = name.replace(/^\.\//, '');
      if (cache[name]) return cache[name].exports;
      if (name === 'horde.js' && !resourcesReady) throw new Error('Game started before subpackage');
      const module = cache[name] = { exports: {} };
      // Shadow browser globals to expose missing native host shims.
      const hostGlobals = { screen: undefined, tt: undefined, fetch: undefined, ...root };
      new Function('globalThis', 'module', 'exports', 'require', ...Object.keys(hostGlobals), sources[name])
        (root, module, module.exports, requireModule, ...Object.values(hostGlobals));
      return module.exports;
    }
    requireModule('game.js');
    window.miniTest = { get root() { return cache['adapter.js']?.exports.host || root; }, hooks, store, startupErrors };
  }, fallback);
  if (missingAsset) {
    await page.waitForFunction(() => miniTest.root.window?.__game?.scene.getScene('Boot')?.children?.list
      .some(child => child.text?.includes('资源加载失败')));
    assert.equal(await page.evaluate(() => miniTest.root.window?.__game.scene.isActive('Menu')), false);
    assert.ok(!errors.some(error => /duration|TypeError/.test(error)));
    await page.screenshot({ path: resolve(out, 'asset-load-error.png') });
    console.log('Missing texture safely stops startup with retry UI (no empty animation).');
  } else {
  await page.waitForFunction(() => window.miniTest?.startupErrors.length
    || window.miniTest?.root.window?.__game?.scene.isActive('Menu'), null, { timeout: 20000 });
  assert.deepEqual(await page.evaluate(() => miniTest.startupErrors), [], 'Startup completes without a failure modal');
  const textureCheck = await page.evaluate(() => {
    const game = miniTest.root.window?.__game;
    return ['player_knight_walk_right', 'player_witch_walk_right'].map(key => game.anims.get(key)?.frames.length);
  });
  assert.deepEqual(textureCheck, [10, 8], 'All player animation frames loaded from packaged PNGs');
  await page.screenshot({ path: resolve(out, `menu${suffix}.png`) });
  console.log('Menu booted', await page.evaluate(() => ({ width: miniTest.root.window?.__game.scale.width,
    height: miniTest.root.window?.__game.scale.height })));
  const tap = async (x, y) => {
    await page.evaluate(({ x, y }) => {
      const point = { identifier: 0, x, y };
      miniTest.hooks.onTouchStart({ touches: [point], changedTouches: [point] });
    }, { x, y });
    await page.waitForTimeout(50);
    await page.evaluate(({ x, y }) => miniTest.hooks.onTouchEnd({ touches: [], changedTouches: [{ identifier: 0, x, y }] }), { x, y });
  };
  await tap(195, 653);
  await page.waitForFunction(() => miniTest.root.window?.__game.scene.isActive('Game'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(out, `main-skill${suffix}.png`) });
  const card = await page.evaluate(() => {
    const game = miniTest.root.window?.__game;
    const ui = game.scene.getScene('GameUi');
    const overlay = Object.values(ui).find(value => value?.cards?.[0]?.skillKey);
    const bounds = overlay.cards[0].getBounds();
    return { x: bounds.centerX * 390 / game.scale.width, y: bounds.centerY * 844 / game.scale.height };
  });
  await tap(card.x, card.y);
  await page.waitForTimeout(600);
  const startX = await page.evaluate(() => miniTest.root.window?.__game.scene.getScene('Game').player.x);
  await page.evaluate(() => {
    const p = { identifier: 0, x: 160, y: 500 };
    miniTest.hooks.onTouchStart({ touches: [p], changedTouches: [p] });
    const q = { ...p, x: 235 };
    miniTest.hooks.onTouchMove({ touches: [q], changedTouches: [q] });
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(out, `combat${suffix}.png`) });
  const state = await page.evaluate(() => {
    const game = miniTest.root.window?.__game.scene.getScene('Game');
    const before = { paused: game.paused, mode: game.inputCtl.mode, x: game.player.x };
    miniTest.hooks.onHide();
    const hidden = game.paused;
    miniTest.hooks.onShow();
    return { before, hidden, after: game.paused, saved: miniTest.store.has('hb_save_v1') };
  });
  console.log('Lifecycle', state);
  assert.equal(state.before.paused, false);
  assert.equal(state.before.mode, 'joystick');
  assert.ok(state.before.x > startX + 10, 'Touch drag moves the player');
  assert.equal(state.hidden, true);
  assert.equal(state.after, true, 'Returning to foreground keeps manual resume overlay');
  assert.equal(state.saved, true);
  const tapObject = async expression => {
    const point = await page.evaluate(expression => {
      const game = miniTest.root.window.__game;
      const node = new Function('game', `return ${expression}`)(game);
      const bounds = node.getBounds();
      return { x: bounds.centerX * 390 / game.scale.width, y: bounds.centerY * 844 / game.scale.height };
    }, expression);
    await tap(point.x, point.y);
  };
  await tapObject("game.scene.getScene('GameUi').actionModal.primary");
  await page.waitForFunction(() => !miniTest.root.window.__game.scene.getScene('Game').paused);
  // Trigger deterministic gameplay events, then exercise the real choice UI.
  await page.evaluate(() => {
    const scene = miniTest.root.window.__game.scene.getScene('Game');
    scene.levelSystem.addXp(scene.levelSystem.need);
  });
  await page.waitForFunction(() => miniTest.root.window.__game.scene.getScene('GameUi').overlay.root.visible);
  await page.screenshot({ path: resolve(out, `upgrade${suffix}.png`) });
  await tapObject("game.scene.getScene('GameUi').overlay.cards[0]");
  await page.waitForFunction(() => !miniTest.root.window.__game.scene.getScene('Game').paused);
  await page.evaluate(() => {
    const scene = miniTest.root.window.__game.scene.getScene('Game');
    scene.revives = 1; scene.player.hp = 0; scene.onPlayerDeath();
  });
  await page.waitForFunction(() => {
    const scene = miniTest.root.window.__game.scene.getScene('Game');
    return !scene.paused && scene.player.hp > 0 && scene.revives === 0;
  });
  await page.evaluate(() => {
    const scene = miniTest.root.window.__game.scene.getScene('Game');
    scene.state.time = 180; scene.finishRun(false, 'smoke');
  });
  await page.waitForFunction(() => miniTest.root.window.__game.scene.isActive('Result'));
  await page.waitForTimeout(450);
  await page.screenshot({ path: resolve(out, `result${suffix}.png`) });
  const saved = await page.evaluate(() => JSON.parse(miniTest.store.get('hb_save_v1')));
  assert.equal(saved.runs, 1, 'Settlement persists exactly one run');
  assert.ok(saved.bestTime >= 180);
  // Reload Boot to verify storage hydration, without sharing the previous save object.
  await page.evaluate(() => {
    const game = miniTest.root.window.__game;
    game.registry.remove('save');
    game.scene.getScene('Result').scene.start('Boot');
  });
  await page.waitForFunction(() => miniTest.root.window.__game.scene.isActive('Menu'));
  assert.equal(await page.evaluate(() => miniTest.root.window.__game.registry.get('save').runs), 1);
  await writeFile(resolve(out, `smoke${suffix}.json`), JSON.stringify({ simulatedHost: true, fallback, state, errors }, null, 2));
  assert.deepEqual(errors, []);
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
