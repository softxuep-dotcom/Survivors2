// Local preview of the unchanged WeChat build. wx APIs are simulated in Chromium.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const repo = resolve(import.meta.dirname, '../../..');
const root = resolve(repo, 'dist/wechat');
// Reuse the already-tested host instead of changing the shipped game's adapter.
const smoke = await readFile(resolve(repo, 'tools/wechat-smoke.mjs'), 'utf8');
const begin = smoke.indexOf('await page.evaluate(async fallback => {');
const end = smoke.indexOf('}, fallback);', begin);
if (begin < 0 || end < 0) throw new Error('WeChat smoke host not found');
const host = smoke.slice(begin + 'await page.evaluate('.length, end + 1);
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<title>元素破潮 — 微信构建本地预览</title>
<style>html,body{margin:0;background:#111810;min-height:100%;overscroll-behavior:none}body{display:grid;place-items:center}canvas{display:block;width:min(390px,100vw)!important;height:auto!important;aspect-ratio:390/844;touch-action:none}</style>
</head><body><script type="module">
await (${host})(false);
while(!document.querySelector('canvas')) await new Promise(r=>setTimeout(r,20));
const c=document.querySelector('canvas');
const listen=(type,fn)=>EventTarget.prototype.addEventListener.call(c,type,fn);
let down=false;
function pointer(e){const r=Element.prototype.getBoundingClientRect.call(c);return {identifier:0,x:(e.clientX-r.left)*390/r.width,y:(e.clientY-r.top)*844/r.height};}
listen('pointerdown',e=>{e.preventDefault();down=true;c.setPointerCapture(e.pointerId);const p=pointer(e);miniTest.hooks.onTouchStart({touches:[p],changedTouches:[p]});});
listen('pointermove',e=>{if(!down)return;const p=pointer(e);miniTest.hooks.onTouchMove({touches:[p],changedTouches:[p]});});
listen('pointerup',e=>{down=false;const p=pointer(e);miniTest.hooks.onTouchEnd({touches:[],changedTouches:[p]});});
listen('pointercancel',e=>{down=false;miniTest.hooks.onTouchCancel({touches:[],changedTouches:[pointer(e)]});});
</script></body></html>`;

createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    if (pathname === '/') { res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}).end(html); return; }
    if (pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
    const file = resolve(root, '.' + pathname);
    if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    const mime = {'.js':'text/javascript','.json':'application/json','.png':'image/png','.wav':'audio/wav','.txt':'text/plain'};
    res.writeHead(200, {'Content-Type':mime[extname(file)] || 'application/octet-stream','Cache-Control':'no-store'}).end(data);
  } catch { res.writeHead(404).end(); }
}).listen(8083, '127.0.0.1', () => console.log('WeChat build preview: http://127.0.0.1:8083/'));
