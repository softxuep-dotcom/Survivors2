// 无头验证钩子（仅 dev 加载，见 main.js 的 import.meta.env.DEV 分支）。
// 页面不可见时 RAF 不触发，用 __pump 手动驱动游戏循环做自动化验证：
//   __pump(n)        推进 n 帧（16.667ms/帧），返回真实耗时 ms
//   __shoot(name)    渲染快照 POST 到 localhost:8082（tools 下的 snap 服务）
//   __tap(gx, gy)    在游戏坐标 (gx,gy) 派发一次点击
//   __key(code, kc, down)  键盘事件
export function installTestHooks(game) {
  window.__pump = (frames = 1, ms = 16.667) => {
    const start = performance.now();
    let t = window.__vt || performance.now();
    for (let i = 0; i < frames; i++) {
      t += ms;
      game.loop.step(t);
    }
    window.__vt = t;
    return +(performance.now() - start).toFixed(1);
  };

  window.__shoot = async (name) => {
    const p = new Promise(res => game.renderer.snapshot(img => {
      const c = document.createElement('canvas');
      const s = 0.5;
      c.width = img.width * s;
      c.height = img.height * s;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', 0.75));
    }));
    window.__pump(2);
    const dataUrl = await p;
    try {
      const r = await fetch('http://localhost:8082/', { method: 'POST', body: JSON.stringify({ name, dataUrl }) });
      return await r.text();
    } catch (e) {
      return 'no snap server';
    }
  };

  window.__tap = (gx, gy) => {
    const canvas = game.canvas;
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width / game.scale.width, sy = rect.height / game.scale.height;
    const opts = {
      clientX: rect.left + gx * sx, clientY: rect.top + gy * sy,
      button: 0, buttons: 1, bubbles: true, cancelable: true, view: window,
    };
    canvas.dispatchEvent(new MouseEvent('mousemove', opts));
    window.__pump(2);
    canvas.dispatchEvent(new MouseEvent('mousedown', opts));
    window.__pump(3);
    canvas.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
    window.__pump(3);
  };

  window.__key = (code, keyCode, down = true) => {
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {
      code, keyCode, which: keyCode, bubbles: true, cancelable: true,
    }));
  };
}
