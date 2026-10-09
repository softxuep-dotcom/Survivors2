import { isCjkLocale } from './textDefaults.js';

export { isCjkLocale };
export const UI_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';
export const UI_FONT_BOLD = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial Black, sans-serif';

// 中日韩字形笔画密，同字号下比拉丁字母难辨认；CJK 语言传入单独的逻辑字号。
// 逻辑像素到屏幕：竖屏 390 宽手机约 ×0.54，1366×768 横屏约 ×0.6，CJK 正文应 ≥22 逻辑像素。
export function uiFontSize(px, cjkPx = px) {
  return `${isCjkLocale() ? cjkPx : px}px`;
}

export function isPortrait(scene) {
  return scene.scale.height > scene.scale.width * 1.12;
}

export function mobileSafeArea(scene) {
  const portrait = isPortrait(scene);
  const mini = globalThis.__HORDE_MINIGAME__;
  const scaleY = mini ? scene.scale.height / window.innerHeight : 1;
  const top = mini ? Math.max(mini.info.safeArea?.top || 0, mini.capsule?.bottom || 0) * scaleY + 8 : 0;
  const bottom = mini ? Math.max(0, window.innerHeight - (mini.info.safeArea?.bottom || window.innerHeight)) * scaleY : 0;
  return {
    portrait,
    top: Math.max(portrait ? 18 : 10, top),
    bottom: Math.max(portrait ? 14 : 10, bottom),
    side: portrait ? 14 : 18,
  };
}
