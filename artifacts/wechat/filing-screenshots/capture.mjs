import { chromium } from 'file:///C:/Users/zhifu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
const out = import.meta.dirname;
await mkdir(out, {recursive:true});
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
const errors=[];
const shots=[];
page.on('pageerror',e=>errors.push(String(e)));
const shot = async (name) => {
  await page.locator('canvas').first().screenshot({path:resolve(out,name)});
  const bytes=(await stat(resolve(out,name))).size;
  const record={name,bytes}; shots.push(record); console.log(JSON.stringify(record));
};
const tapObject=async expression=>{
  const point=await page.evaluate(expression=>{
    const game=miniTest.root.window.__game;
    const node=new Function('game',`return ${expression}`)(game);
    const b=node.getBounds();
    return {x:b.centerX*390/game.scale.width,y:b.centerY*844/game.scale.height};
  },expression);
  await page.mouse.click(point.x,point.y,{delay:75});
};
try {
  await page.goto('http://127.0.0.1:8083/');
  await page.waitForFunction(()=>window.miniTest?.root.window?.__game?.scene.isActive('Menu'));
  await page.waitForTimeout(500);
  await shot('01-main-menu.png');
  await page.mouse.click(195,653,{delay:75});
  await page.waitForFunction(()=>miniTest.root.window.__game.scene.isActive('Game'));
  await page.waitForTimeout(500);
  await shot('02-main-skill.png');
  await tapObject("Object.values(game.scene.getScene('GameUi')).find(v=>v?.cards?.[0]?.skillKey).cards[0]");
  let upgradeShot=false,combatShot=false;
  const deadline=Date.now()+100000;
  while(Date.now()<deadline) {
    const current=await page.evaluate(()=>{
      const app=miniTest.root.window.__game;
      if(!app.scene.isActive('Game'))return {ended:true};
      const s=app.scene.getScene('Game'),u=app.scene.getScene('GameUi');
      return {upgrade:!!u.overlay?.root?.visible,paused:s.paused,time:s.state.time,hp:s.player.hp,
        enemies:s.enemies.active.length};
    });
    if(current.ended)break;
    if(current.upgrade){
      await page.waitForTimeout(350);
      if(!upgradeShot){await shot('04-upgrade.png');upgradeShot=true;}
      await tapObject("game.scene.getScene('GameUi').overlay.cards[0]");
    } else if(!current.paused) {
      if(current.time>24 && current.enemies>8 && !combatShot){await shot('03-combat.png');combatShot=true;}
      if(upgradeShot&&combatShot)break;
      // Play using touch input: collect the closest real drop without adding XP,
      // changing the clock, spawning enemies, or changing the player's stats.
      await page.evaluate(()=>{
        const s=miniTest.root.window.__game.scene.getScene('Game');
        const p=s.player;
        const drops=s.pickups.active.filter(g=>!g.pulling);
        drops.sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
        const target=drops[0];
        const dx=target?target.x-p.x:Math.cos(s.state.time*0.7)*80;
        const dy=target?target.y-p.y:Math.sin(s.state.time*0.7)*80;
        const length=Math.max(1,Math.hypot(dx,dy));
        const origin={identifier:0,x:180,y:560};
        miniTest.hooks.onTouchEnd({touches:[],changedTouches:[origin]});
        miniTest.hooks.onTouchStart({touches:[origin],changedTouches:[origin]});
        const q={...origin,x:origin.x+dx/length*38,y:origin.y+dy/length*38};
        miniTest.hooks.onTouchMove({touches:[q],changedTouches:[q]});
      });
    }
    await page.waitForTimeout(350);
  }
  if(!combatShot||!upgradeShot)throw new Error('Did not capture natural combat and upgrade');
  await writeFile(resolve(out,'capture-report.json'),JSON.stringify({source:'Unmodified dist/wechat build, local HTTP preview, simulated wx APIs, Chromium',viewport:{width:390,height:844,scale:2},gameplay:'Natural elapsed time, touch movement and actual pickups; no gameplay-state injection',shots,errors},null,2));
  if(errors.length)throw new Error(errors.join('\n'));
} catch(error) {
  await page.screenshot({path:resolve(out,'capture-debug.png')}).catch(()=>{});
  console.error(JSON.stringify(errors));
  throw error;
} finally {await browser.close();}
