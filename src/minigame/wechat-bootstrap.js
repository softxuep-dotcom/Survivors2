// Load the resource subpackage before Phaser can request any files.
// No Canvas2D loading screen: taking a 2D context would lock the onscreen canvas.
export function loadWechatResources(api, start) {
  let attempt = 0;
  let started = false;
  function load() {
    const current = ++attempt;
    let settled = false;
    let lastProgress = -1;
    const finish = (error) => {
      if (settled || current !== attempt || started) return;
      settled = true;
      clearTimeout(timer);
      api.hideLoading?.();
      if (!error) {
        started = true;
        try { start(); }
        catch (bootError) {
          console.error('[wechat-boot]', bootError);
          api.showModal?.({ title: '启动失败', content: '请关闭小游戏后重试。', showCancel: false });
        }
        return;
      }
      console.warn('[wechat-subpackage]', error);
      api.showModal?.({ title: '资源加载失败', content: '请检查网络后重试。',
        confirmText: '重试', cancelText: '暂不重试',
        success: result => { if (result.confirm && current === attempt) load(); } });
    };
    const timer = setTimeout(() => finish(new Error('Resource download timed out')), 30000);
    api.showLoading?.({ title: '加载游戏资源', mask: true });
    try {
      if (!api.loadSubpackage) throw new Error('Please update WeChat to load subpackages');
      const task = api.loadSubpackage({ name: 'resources',
        success: () => finish(), fail: finish });
      task?.onProgressUpdate?.(event => {
        if (settled || current !== attempt) return;
        const progress = Math.floor(Math.min(100, Math.max(0, event.progress || 0)) / 10) * 10;
        if (progress === lastProgress) return;
        lastProgress = progress;
        api.showLoading?.({ title: `加载资源 ${progress}%`, mask: true });
      });
    } catch (error) { finish(error); }
  }
  load();
}
