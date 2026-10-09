// Layout/input QA of the packaged WeChat game in a simulated wx host.
// These screenshots are browser QA evidence, not native WeChat filing screenshots.
import { chromium } from 'file:///C:/Users/zhifu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
const repo = resolve(import.meta.dirname, '../../..');
const root = resolve(repo, 'dist/wechat');
const source = await readFile(resolve(repo, 'tools/wechat-smoke.mjs'), 'utf8');
const begin = source.indexOf('await page.evaluate(async fallback => {');
const end = source.indexOf('}, fallback);', begin);
assert.ok(begin >= 0 && end > begin);
let host = source.slice(begin + 'await page.evaluate('.length, end + 1);
host = host.replace('windowWidth: 390, windowHeight: 844', 'windowWidth: __qa.width, windowHeight: __qa.height, pixelRatio: __qa.dpr')
  .replace('top: 44, bottom: 810', 'top: __qa.top, bottom: __qa.height - __qa.bottom')
  .replace('bottom: 80', 'bottom: __qa.capsule');
const hostFn = new Function(`return (${host})`)();
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  if (req.url === '/favicon.ico') { res.writeHead(204).end(); return; }
  try {
    const types = { '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
    res.setHeader('Content-Type', file === root ? 'text/html' : types[extname(file)] || 'application/octet-stream');
    res.end(file === root ? '<html><style>body{margin:0;background:#111}canvas{width:100vw!important;height:100vh!important}</style></html>' : await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ headless: true });
const reports = [];
try {
  for (const profile of [
    { name: 'phone-dpr3', width: 390, height: 844, dpr: 3, top: 44, bottom: 34, capsule: 80 },
    { name: 'small-phone', width: 360, height: 640, dpr: 2, top: 24, bottom: 0, capsule: 64 },
    { name: 'landscape', width: 1280, height: 720, dpr: 1, top: 0, bottom: 0, capsule: 0 },
  ]) {
    const page = await browser.newPage({ viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: profile.dpr });
    const report = { profile, errors: [], screens: {} };
    reports.push(report);
    page.on('pageerror', e => report.errors.push(e.stack));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(p => { window.__qa = p; }, profile);
    await page.evaluate(hostFn, false);
    const waitScene = name => page.waitForFunction(name => window.miniTest?.root.window?.__game?.scene.isActive(name), name);
    const tap = async (x, y) => {
      await page.evaluate(({x,y}) => { const p={identifier:0,x,y}; miniTest.hooks.onTouchStart({touches:[p],changedTouches:[p]}); }, {x,y});
      await page.waitForTimeout(70);
      await page.evaluate(({x,y}) => { const p={identifier:0,x,y}; miniTest.hooks.onTouchEnd({touches:[],changedTouches:[p]}); }, {x,y});
    };
    const tapNode = async expression => {
      const point = await page.evaluate(expression => {
        const game = miniTest.root.window.__game;
        const node = new Function('game', `return ${expression}`)(game);
        if (!node) throw new Error(`Missing click target: ${expression}`);
        const b = node.getBounds();
        return {x:b.centerX*__qa.width/game.scale.width,y:b.centerY*__qa.height/game.scale.height};
      }, expression);
      await tap(point.x, point.y);
    };
    const capture = async (name, sceneName) => {
      await page.waitForTimeout(550);
      report.screens[name] = await page.evaluate(sceneName => {
        const game = miniTest.root.window.__game;
        const scene = game.scene.getScene(sceneName);
        const texts=[];
        function scan(node, visible=true, alpha=1) {
          visible = visible && node.visible !== false;
          alpha *= node.alpha ?? 1;
          if (!visible || alpha < .1) return;
          if (node.type === 'Text' && node.text) {
            const b = node.getBounds();
            texts.push({text:node.text,font:node.style.fontSize,resolution:node.style.resolution,x:b.x,y:b.y,w:b.width,h:b.height,
              outside:b.left < -1 || b.top < -1 || b.right > game.scale.width+1 || b.bottom > game.scale.height+1});
          }
          for (const child of node.list || []) scan(child, visible, alpha);
        }
        for (const node of scene.children.list) scan(node);
        return {logical:[game.scale.width,game.scale.height],canvas:[game.canvas.width,game.canvas.height],
          viewport:game.renderer.gl ? [...game.renderer.gl.getParameter(game.renderer.gl.VIEWPORT)] : null,texts};
      }, sceneName);
      await page.screenshot({ path: resolve(import.meta.dirname, `${profile.name}-${name}.png`), scale:'css' });
    };
    const findButton = (scene, label) => `game.scene.getScene('${scene}').children.list.find(n=>n.input && n.list?.some(c=>c.text === '${label}'))`;
    await waitScene('Menu');
    await capture('menu','Menu');
    // Use actual touch hooks and text-labelled interactive targets at every scale.
    await tapNode(findButton('Menu','局外天赋树'));
    await waitScene('Talents');
    await capture('talents','Talents');
    await tapNode(findButton('Talents','返回'));
    await waitScene('Menu');
    await page.evaluate(() => miniTest.root.window.__game.scene.getScene('Menu').showStartBoost());
    await capture('boost','Menu');
    await tapNode("game.scene.getScene('Menu').boostOverlay.cards[1]");
    await tapNode("game.scene.getScene('Menu').boostOverlay.cancel");
    await page.waitForTimeout(250);
    await tapNode(findButton('Menu','开始游戏'));
    await waitScene('Game');
    await capture('main-skill','GameUi');
    await tapNode("game.scene.getScene('GameUi').mainSkillOverlay.cards[1]");
    await page.waitForTimeout(700);
    await page.evaluate(() => { const s=miniTest.root.window.__game.scene.getScene('Game');s.player.invincible=999;s.levelSystem.addXp(s.levelSystem.need); });
    await page.waitForFunction(()=>miniTest.root.window.__game.scene.getScene('GameUi').overlay.root.visible);
    await capture('upgrade','GameUi');
    await tapNode("game.scene.getScene('GameUi').overlay.cards[0]");
    await page.waitForFunction(()=>!miniTest.root.window.__game.scene.getScene('Game').paused);
    await page.evaluate(() => miniTest.hooks.onHide());
    await capture('pause','GameUi');
    await page.evaluate(() => miniTest.hooks.onShow());
    await tapNode("game.scene.getScene('GameUi').actionModal.primary");
    await page.waitForFunction(()=>!miniTest.root.window.__game.scene.getScene('Game').paused);
    await page.waitForTimeout(800);
    await capture('combat','GameUi');
    // Deterministic late-run result exercises four damage rows and long counters.
    await page.evaluate(() => {
      const game=miniTest.root.window.__game,s=game.scene.getScene('Game');
      s.state.time=630;s.state.kills=12345;s.finishRun(true,'layout-review');
    });
    await waitScene('Result');
    await page.evaluate(() => {
      const s=miniTest.root.window.__game.scene.getScene('Result');
      s.scene.restart({...s.result,damage:{fireball:1234567,bladestorm:456789,blizzard:234567,holyhalo:12345}});
    });
    await capture('result','Result');
    assert.deepEqual(report.errors, [], profile.name+' runtime errors');
    console.log(profile.name, JSON.stringify(Object.fromEntries(Object.entries(report.screens).map(([k,v])=>[k,{canvas:v.canvas,outside:v.texts.filter(t=>t.outside).map(t=>t.text)}]))));
    await writeFile(resolve(import.meta.dirname,'report.json'),JSON.stringify(reports,null,2));
    await page.close();
  }
} finally {
  await writeFile(resolve(import.meta.dirname,'report.json'),JSON.stringify(reports,null,2));
  await browser.close();await new Promise(r=>server.close(r));
}
