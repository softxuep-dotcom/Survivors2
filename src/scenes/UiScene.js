// 并行 UI 场景：跑在 GameScene 之上，相机不缩放（zoom 只作用于世界层）。
// HUD / 升级四选一 / 摇杆可视件 / 暗角 / 教学提示都在这里。
import Phaser from 'phaser';
import { THEME } from '../config.js';
import { t } from '../i18n.js';
import { Hud } from '../ui/Hud.js';
import { LevelUpOverlay } from '../ui/LevelUpOverlay.js';
import { MainSkillOverlay } from '../ui/MainSkillOverlay.js';
import { ActionModal } from '../ui/ActionModal.js';
import { makeButton, makePanel } from '../ui/widgets.js';
import { UI_FONT, isCjkLocale, mobileSafeArea } from '../ui/layout.js';

// 提示条字号：[竖屏, 横屏]。中日韩单独一档（竖屏 390 宽 ×0.54 ≈ 13 CSS px，横屏 1280×720 ×0.56 ≈ 16 CSS px）。
const NOTICE_SIZES = Object.freeze({ base: [18, 22], cjk: [24, 28] });
function noticeFontSize(scene) {
  const portrait = mobileSafeArea(scene).portrait;
  return (isCjkLocale() ? NOTICE_SIZES.cjk : NOTICE_SIZES.base)[portrait ? 0 : 1];
}

function makeNotice(scene, text, fontSize, maxWidth) {
  const cjk = isCjkLocale();
  // 中文没有空格，必须用 advancedWrap 才能按字换行；行首“ℹ ”用不换行空格粘住，避免图标单独占一行。
  const label = scene.add.text(0, 0, String(text).replace(/^ℹ /, 'ℹ '), {
    fontFamily: UI_FONT, fontSize: `${fontSize}px`, color: '#f2e8c8',
    align: 'center', lineSpacing: cjk ? 4 : 0,
    wordWrap: { width: maxWidth - 40, useAdvancedWrap: true },
  }).setOrigin(0.5);
  const padX = Math.round(fontSize * 0.8), padY = Math.round(fontSize * 0.5);
  const width = Math.min(maxWidth, Math.max(190, label.width + padX * 2));
  const height = label.height + padY * 2;
  const root = scene.add.container(0, 0);
  root.add(makePanel(scene, width, height, {
    fill: 0x0d1410, line: 0x8c681f, lineWidth: 1, chamfer: 8,
    alpha: 0.94, shadow: true, highlight: true, highlightAlpha: 0.12,
  }));
  root.add(label);
  root.label = label;
  root.setSize(width, height);
  return root;
}

export class UiScene extends Phaser.Scene {
  constructor() { super('GameUi'); }

  create() {
    this.vignette = this.add.image(0, 0, 'vignette').setDepth(60);
    this.hud = new Hud(this);
    this.overlay = new LevelUpOverlay(this);
    this.mainSkillOverlay = new MainSkillOverlay(this);
    this.actionModal = new ActionModal(this);
    this.pauseBtn = makeButton(this, 0, 0, 52, 46, 'Ⅱ', () => this.onPause?.(), {
      fontSize: '20px', fill: 0x111813, line: 0x8c681f, color: '#e7dab4',
      chamfer: 8, shadow: true, highlight: true,
    }).setDepth(150);

    // 虚拟摇杆可视件（逻辑在 GameScene 的 InputController）
    this.joyBase = this.add.image(0, 0, 'joy_base').setDepth(90).setVisible(false);
    this.joyKnob = this.add.image(0, 0, 'joy_knob').setDepth(91).setVisible(false);

    this.moveHint = null;
    this.toasts = [];
    this.layout();
    this._onResize = this.layout.bind(this);
    this.scale.on('resize', this._onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this._onResize);
      this.hud.destroy();
      this.overlay.destroy();
      this.mainSkillOverlay.destroy();
      this.actionModal.destroy();
    });
  }

  layout() {
    const w = this.scale.width, h = this.scale.height;
    const safe = mobileSafeArea(this);
    this.vignette.setPosition(w / 2, h / 2).setDisplaySize(w * 1.06, h * 1.06);
    this.overlay.layout();
    this.mainSkillOverlay.layout();
    this.actionModal.layout();
    // 竖屏在顶栏下方、Boss 条右侧；横屏让开右上角击杀数（行中心 46、34px 字）。
    this.pauseBtn.setPosition(w - (safe.portrait ? 37 : 44), safe.portrait ? safe.top + 105 : 108);
    this.layoutToasts();
  }

  setPauseHandler(handler) { this.onPause = handler; }

  showActionModal(options) {
    this.pauseBtn.setVisible(false);
    this.actionModal.show(options);
  }

  hideActionModal() {
    this.actionModal.hide();
    this.pauseBtn.setVisible(true);
  }

  setPauseVisible(visible) { this.pauseBtn.setVisible(visible); }

  showMoveHint() {
    if (this.moveHint) return;
    this.moveHint = makeNotice(
      this,
      t('tutorial.move'),
      noticeFontSize(this),
      this.scale.width - 48,
    ).setPosition(this.scale.width / 2, this.scale.height * 0.68).setDepth(110);
    this.tweens.add({ targets: this.moveHint, alpha: 0.55, duration: 700, yoyo: true, repeat: -1 });
  }

  hideMoveHint() {
    if (!this.moveHint) return;
    const hint = this.moveHint;
    this.moveHint = null;
    this.tweens.killTweensOf(hint);
    this.tweens.add({ targets: hint, alpha: 0, duration: 400, onComplete: () => hint.destroy() });
  }

  // 一次性提示条（事件式教学，GDD §2），自动淡出
  layoutToasts() {
    const gap = 10;
    const safe = mobileSafeArea(this);
    // 从 HUD 事件横幅下沿开始排（竖屏 top+154 起约 46 高，横屏 162 起约 60 高），小游戏胶囊下移时同样不重叠。
    let top = Math.max(safe.top + (safe.portrait ? 212 : 236), this.scale.height * 0.18);
    for (const toast of this.toasts) {
      toast.setPosition(this.scale.width / 2, top + toast.height / 2);
      top += toast.height + gap;
    }
  }

  showToast(text, duration = 6.5) {
    const toast = makeNotice(
      this,
      text,
      noticeFontSize(this),
      Math.min(this.scale.width - 44, 1200),
    ).setPosition(this.scale.width / 2, 0).setDepth(110).setAlpha(0);
    this.toasts.push(toast);
    this.layoutToasts();
    this.tweens.add({ targets: toast, alpha: 1, duration: 250 });
    this.time.delayedCall(duration * 1000, () => {
      this.tweens.add({ targets: toast, alpha: 0, duration: 400, onComplete: () => {
        this.toasts = this.toasts.filter(item => item !== toast);
        toast.destroy();
        this.layoutToasts();
      } });
    });
    return toast;
  }
}
