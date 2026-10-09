// 高清渲染：画布像素与屏幕物理像素对齐，逻辑坐标（720×1280 EXPAND）保持不变。
// Phaser 4 已移除 resolution 配置；EXPAND 模式下画布像素 = 逻辑尺寸，再由浏览器/小游戏宿主
// 用 CSS 拉伸到屏幕。手机 DPR 2–3 时 720 宽画布会被放大 1.6 倍左右，桌面横屏则被缩小，
// 文字和描边因此发虚。这里让画布像素等于物理像素（受像素预算约束），并在 WebGL 状态层
// 把默认帧缓冲（画布）的 viewport / scissor 按同一倍率换算；离屏 framebuffer 不受影响。
// 投影矩阵、相机、输入与所有 UI 布局仍然只看逻辑尺寸。
import Phaser from 'phaser';
import { resolveVfxQuality } from './game/vfx/VfxRuntime.js';

// 像素预算：高档约 2560×1440，低档约 1280×1250；最大倍率限制极端 DPR/超大窗口的填充率开销。
// 小游戏无法按设备分档且真机多为中低端安卓，倍率上限放到 1.5（DPR 3 手机仅剩约 1.08 倍放大）。
const RESOLUTION_BUDGETS = Object.freeze({
  high: Object.freeze({ maxScale: 2, maxPixels: 3_700_000 }),
  minigame: Object.freeze({ maxScale: 1.5, maxPixels: 2_600_000 }),
  low: Object.freeze({ maxScale: 1.25, maxPixels: 1_600_000 }),
});
const MIN_SCALE = 0.5;

let renderScale = 1;
let notifiedScale = 1;
const listeners = new Set();

export function getRenderScale() {
  return renderScale;
}

export function onRenderScaleChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function searchParams() {
  try { return new URLSearchParams(globalThis.location?.search || ''); } catch (_) { return new URLSearchParams(); }
}

function resolveBudget() {
  const quality = resolveVfxQuality({ webgl: true });
  if (quality.key !== 'high') return RESOLUTION_BUDGETS.low;
  return globalThis.__HORDE_MINIGAME__ ? RESOLUTION_BUDGETS.minigame : RESOLUTION_BUDGETS.high;
}

// 小游戏构建把 globalThis 换成私有宿主作用域，devicePixelRatio 只挂在词法绑定的 window 上。
function devicePixelRatio() {
  const ratio = typeof window !== 'undefined' ? Number(window.devicePixelRatio) : 0;
  return Math.max(1, ratio || Number(globalThis.devicePixelRatio) || 1);
}

// 物理像素 / 逻辑像素。displaySize 是画布的 CSS 尺寸，DPR 换算到物理像素。
// 未触及预算时取精确值，画布像素与屏幕一一对应、浏览器不再二次重采样。
function computeRenderScale(scale, budget, forced) {
  const logicalW = scale.gameSize.width;
  const logicalH = scale.gameSize.height;
  if (!(logicalW > 0 && logicalH > 0)) return 1;
  if (forced > 0) return Phaser.Math.Clamp(forced, MIN_SCALE, 3);
  const dpr = devicePixelRatio();
  const physicalW = Math.round((scale.displaySize.width || logicalW) * dpr);
  let next = Math.min(physicalW / logicalW, budget.maxScale);
  const pixels = logicalW * logicalH * next * next;
  if (pixels > budget.maxPixels) next *= Math.sqrt(budget.maxPixels / pixels);
  return Phaser.Math.Clamp(next, MIN_SCALE, budget.maxScale);
}

// 把逻辑 [x, y, w, h]（GL 左下原点）换算成画布物理像素；边缘取整后相邻区域不留缝。
function toCanvasPixels(box, factor) {
  const x0 = Math.round(box[0] * factor);
  const y0 = Math.round(box[1] * factor);
  return [x0, y0, Math.round((box[0] + box[2]) * factor) - x0, Math.round((box[1] + box[3]) * factor) - y0];
}

function sameBox(a, b) {
  return !!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

function patchGlStateForCanvasScale(renderer) {
  const wrapper = renderer.glWrapper;
  const gl = renderer.gl;
  // 实际下发给 GL 的值；wrapper.state 仍缓存 Phaser 期望的逻辑值。
  const applied = { viewport: null, scissor: null };
  const factor = () => {
    const framebuffer = wrapper.state.bindings.framebuffer;
    return !framebuffer || framebuffer.useCanvas ? renderScale : 1;
  };
  const applyViewport = (force) => {
    const next = toCanvasPixels(wrapper.state.viewport, factor());
    if (force || !sameBox(next, applied.viewport)) {
      applied.viewport = next;
      gl.viewport(next[0], next[1], next[2], next[3]);
    }
  };
  const applyScissor = (force) => {
    const next = toCanvasPixels(wrapper.state.scissor.box, factor());
    if (force || !sameBox(next, applied.scissor)) {
      applied.scissor = next;
      gl.scissor(next[0], next[1], next[2], next[3]);
    }
  };

  wrapper.updateViewport = function updateViewport(state, force) {
    const viewport = state.viewport;
    if (!sameBox(viewport, this.state.viewport)) this.state.viewport = [viewport[0], viewport[1], viewport[2], viewport[3]];
    applyViewport(force);
  };
  wrapper.updateScissorBox = function updateScissorBox(state, force) {
    const box = state.scissor.box;
    if (!sameBox(box, this.state.scissor.box)) this.state.scissor.box = [box[0], box[1], box[2], box[3]];
    applyScissor(force);
  };
  // 在画布与离屏 framebuffer 之间切换时，同一组逻辑值对应的物理值不同，需要重新下发。
  const updateBindingsFramebuffer = wrapper.updateBindingsFramebuffer;
  wrapper.updateBindingsFramebuffer = function patchedUpdateBindingsFramebuffer(state, force) {
    const previous = this.state.bindings.framebuffer;
    updateBindingsFramebuffer.call(this, state, force);
    if (this.state.bindings.framebuffer !== previous) {
      applyViewport(false);
      applyScissor(false);
    }
  };
  // 原版用 drawingBufferHeight - height 计算整屏 scissor，画布放大后两者单位不同；
  // 整屏逻辑区域就是 [0, 0, width, height]。
  const resize = renderer.resize;
  renderer.resize = function patchedResize(width, height) {
    resize.call(this, width, height);
    wrapper.update({ scissor: { box: [0, 0, this.width, this.height] }, viewport: [0, 0, this.width, this.height] });
    return this;
  };
  return () => {
    applyViewport(true);
    applyScissor(true);
  };
}

export function installDisplayResolution(game) {
  const renderer = game.renderer;
  if (!renderer || renderer.type !== Phaser.WEBGL || !renderer.glWrapper) return;
  const scale = game.scale;
  const budget = resolveBudget();
  const forced = Number(searchParams().get('res')) || 0;
  const reapplyGlState = patchGlStateForCanvasScale(renderer);

  const syncCanvas = () => {
    const target = computeRenderScale(scale, budget, forced);
    const width = Math.max(1, Math.round(scale.gameSize.width * target));
    const height = Math.max(1, Math.round(scale.gameSize.height * target));
    // GL 换算倍率取画布实际像素 / 逻辑宽度，保证 viewport 恰好铺满画布。
    renderScale = width / scale.gameSize.width;
    // 画布像素随 gameSize 变化由 Phaser 重设为逻辑尺寸；这里统一改回物理尺寸。
    if (game.canvas.width !== width) game.canvas.width = width;
    if (game.canvas.height !== height) game.canvas.height = height;
  };

  const updateScale = scale.updateScale;
  scale.updateScale = function patchedUpdateScale() {
    updateScale.call(this);
    syncCanvas();
    // 逻辑尺寸不变、仅倍率变化（缩放浏览器、跨屏拖动）时 Phaser 不会再 resize 渲染器。
    reapplyGlState();
    // 倍率变化不足 0.5% 时不通知，避免窗口细微抖动反复重建文字纹理。
    if (Math.abs(renderScale - notifiedScale) / notifiedScale >= 0.005) {
      notifiedScale = renderScale;
      for (const listener of listeners) listener(renderScale);
    }
  };
  scale.updateScale();
  notifiedScale = renderScale;
  renderer.resize(scale.gameSize.width, scale.gameSize.height);
}
