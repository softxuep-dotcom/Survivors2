import { chromium } from 'file:///C:/Users/zhifu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const out=resolve(import.meta.dirname,'../备案截图-角色专用');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
const errors=[],shots=[];
page.on('pageerror',e=>errors.push(String(e)));
async function menu(){
  await page.goto('http://127.0.0.1:8083/');
  await page.waitForFunction(()=>window.miniTest?.root.window?.__game?.scene.isActive('Menu'));
  await page.waitForTimeout(400);
}
async function shot(name){
  const file=resolve(out,name);
  await page.locator('canvas').first().screenshot({path:file});
  const bytes=(await stat(file)).size;
  if(bytes<61440||bytes>5242880)throw new Error('Image outside upload size range');
  shots.push({name,bytes});console.log(JSON.stringify({name,bytes}));
}
async function start(skillIndex){
  await page.mouse.click(195,653,{delay:80});
  await page.waitForFunction(()=>miniTest.root.window.__game.scene.isActive('Game'));
  await page.waitForTimeout(350);
  const p=await page.evaluate(i=>{
    const game=miniTest.root.window.__game;
    const overlay=Object.values(game.scene.getScene('GameUi')).find(v=>v?.cards?.[0]?.skillKey);
    const b=overlay.cards[i].getBounds();
    return {x:b.centerX*390/game.scale.width,y:b.centerY*844/game.scale.height};
  },skillIndex);
  await page.mouse.click(p.x,p.y,{delay:80});
  // Natural gameplay time only; no modified stats or injected enemies.
  await page.waitForFunction(()=>{
    const s=miniTest.root.window.__game.scene.getScene('Game');
    return s.state.time>=17 && !s.paused;
  },null,{timeout:35000});
}
try {
  await menu();
  await page.mouse.click(113,400,{delay:80});
  await page.waitForFunction(()=>miniTest.root.window.__game.registry.get('save').selectedCharacter==='knight');
  await page.waitForTimeout(500);
  await shot('01-铁壁骑士选择.png');
  await start(1);
  await shot('02-铁壁骑士战斗.png');
  await menu();
  await page.waitForFunction(()=>miniTest.root.window.__game.registry.get('save').selectedCharacter==='witch');
  await start(4);
  await shot('03-余烬女巫战斗.png');
  if(errors.length)throw new Error(errors.join('\n'));
  await writeFile(resolve(import.meta.dirname,'characters-report.json'),JSON.stringify({source:'Local server running unchanged WeChat package with simulated wx APIs',shots,errors},null,2));
}catch(e){await page.screenshot({path:resolve(import.meta.dirname,'characters-debug.png')});throw e;}
finally {await browser.close();}
