// 全局文字默认值：所有 scene.add.text 统一经过这里。
// 1) 文字纹理分辨率跟随画布物理倍率（见 displayResolution.js），放大/缩小都按 1:1 像素栅格化；
// 2) 字体栈补齐中日韩字体。拉丁字体（Arial/SF）没有汉字，原先由系统随机兜底且丢失粗体；
// 3) 以 Arial Black 表示“粗体”的样式补上 bold 字重，否则中文会退化成常规字重。
import Phaser from 'phaser';
import { getLocale } from '../i18n.js';
import { getRenderScale, onRenderScaleChange } from '../displayResolution.js';

const CJK_FONTS = Object.freeze({
  zh: ['"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', '"Noto Sans CJK SC"', '"Source Han Sans SC"'],
  ja: ['"Hiragino Sans"', '"Hiragino Kaku Gothic ProN"', '"Yu Gothic"', 'Meiryo', '"Noto Sans CJK JP"'],
  ko: ['"Apple SD Gothic Neo"', '"Malgun Gothic"', '"Noto Sans CJK KR"'],
});
const GENERIC_FAMILIES = new Set(['sans-serif', 'serif', 'monospace', 'system-ui', 'cursive', 'fantasy']);
const MAX_TEXT_RESOLUTION = 3;

export function isCjkLocale(locale = getLocale()) {
  return locale === 'zh-CN' || locale === 'ja' || locale === 'ko';
}

// 当前语言的字体放在其他 CJK 字体前面，避免日文汉字落到简中字形上。
function cjkFallback(locale) {
  const order = locale === 'ja' ? ['ja', 'zh', 'ko'] : locale === 'ko' ? ['ko', 'zh', 'ja'] : ['zh', 'ja', 'ko'];
  return order.flatMap(key => CJK_FONTS[key]);
}

const familyCache = new Map();
export function withCjkFallback(fontFamily, locale = getLocale()) {
  const cacheKey = `${locale}|${fontFamily}`;
  let resolved = familyCache.get(cacheKey);
  if (resolved) return resolved;
  const families = String(fontFamily || 'sans-serif').split(',').map(part => part.trim()).filter(Boolean);
  const existing = new Set(families.map(name => name.replace(/["']/g, '').toLowerCase()));
  const extra = cjkFallback(locale).filter(name => !existing.has(name.replace(/["']/g, '').toLowerCase()));
  const genericIndex = families.findIndex(name => GENERIC_FAMILIES.has(name.toLowerCase()));
  if (genericIndex < 0) families.push(...extra, 'sans-serif');
  else families.splice(genericIndex, 0, ...extra);
  resolved = families.join(', ');
  familyCache.set(cacheKey, resolved);
  return resolved;
}

function textResolution() {
  return Phaser.Math.Clamp(getRenderScale(), 0.5, MAX_TEXT_RESOLUTION);
}

function withTextDefaults(style) {
  const next = { ...(style || {}) };
  if (next.fontFamily) next.fontFamily = withCjkFallback(next.fontFamily);
  else if (!next.font) next.fontFamily = withCjkFallback('Arial, sans-serif');
  if (!next.fontStyle && /arial black/i.test(next.fontFamily || '')) next.fontStyle = 'bold';
  return next;
}

function eachText(gameObjects, visit) {
  for (const gameObject of gameObjects) {
    if (gameObject instanceof Phaser.GameObjects.Text) visit(gameObject);
    else if (gameObject.list) eachText(gameObject.list, visit);
  }
}

let installed = false;
export function installTextDefaults(game) {
  if (installed) return;
  installed = true;
  const factory = Phaser.GameObjects.GameObjectFactory.prototype;
  const createText = factory.text;
  factory.text = function textWithDefaults(x, y, text, style) {
    const styled = withTextDefaults(style);
    const autoResolution = !(styled.resolution > 0);
    if (autoResolution) styled.resolution = textResolution();
    const gameObject = createText.call(this, x, y, text, styled);
    gameObject.autoResolution = autoResolution;
    return gameObject;
  };
  // 窗口缩放/旋转后倍率变化：已有文字按新倍率重新栅格化（只在倍率变化时触发）。
  onRenderScaleChange(() => {
    const resolution = textResolution();
    for (const scene of game.scene.scenes) {
      const list = scene.sys?.displayList?.list;
      if (!list) continue;
      eachText(list, (gameObject) => {
        if (gameObject.autoResolution && gameObject.style.resolution !== resolution) gameObject.setResolution(resolution);
      });
    }
  });
}
