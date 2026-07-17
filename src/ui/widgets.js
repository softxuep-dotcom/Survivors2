// 通用 UI 小件：按钮 / 面板（风格延续 Merge Towers：深色圆角 + 描边 + 按压反馈）
import Phaser from 'phaser';
import { THEME } from '../config.js';
import { Sfx } from '../audio.js';
import { UI_FONT_BOLD } from './layout.js';

function chamferedPoints(w, h, cut, offsetY = 0) {
  const x = w / 2;
  const y = h / 2;
  return [
    { x: -x + cut, y: -y + offsetY }, { x: x - cut, y: -y + offsetY },
    { x, y: -y + cut + offsetY }, { x, y: y - cut + offsetY },
    { x: x - cut, y: y + offsetY }, { x: -x + cut, y: y + offsetY },
    { x: -x, y: y - cut + offsetY }, { x: -x, y: -y + cut + offsetY },
  ];
}

export function makePanel(scene, w, h, opts = {}) {
  const g = scene.add.graphics();
  const fill = opts.fill ?? THEME.panel;
  const line = opts.line ?? THEME.panelLine;
  const radius = opts.radius ?? 18;
  const chamfer = opts.chamfer ?? 0;
  if (opts.shadow) {
    g.fillStyle(0x000000, opts.shadowAlpha ?? 0.3);
    if (chamfer) g.fillPoints(chamferedPoints(w, h, chamfer, opts.shadowY ?? 6), true);
    else g.fillRoundedRect(-w / 2, -h / 2 + (opts.shadowY ?? 5), w, h, radius);
  }
  g.fillStyle(fill, opts.alpha ?? 0.96);
  if (chamfer) g.fillPoints(chamferedPoints(w, h, chamfer), true);
  else g.fillRoundedRect(-w / 2, -h / 2, w, h, radius);
  g.lineStyle(opts.lineWidth ?? 2, line, opts.lineAlpha ?? 1);
  if (chamfer) g.strokePoints(chamferedPoints(w, h, chamfer), true, true);
  else g.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
  if (opts.highlight) {
    g.lineStyle(1, opts.highlightColor ?? 0xffefb0, opts.highlightAlpha ?? 0.12);
    if (chamfer) g.strokePoints(chamferedPoints(w - 10, h - 10, Math.max(4, chamfer - 4)), true, true);
    else g.strokeRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, Math.max(1, radius - 2));
  }
  return g;
}

export function makeButton(scene, x, y, w, h, label, onClick, opts = {}) {
  const container = scene.add.container(x, y);
  const bg = makePanel(scene, w, h, {
    fill: opts.fill ?? 0x24402c,
    line: opts.line ?? THEME.green,
    radius: opts.radius ?? 14,
    alpha: opts.alpha,
    lineAlpha: opts.lineAlpha,
    shadow: opts.shadow,
    shadowAlpha: opts.shadowAlpha,
    highlight: opts.highlight ?? opts.shadow,
    highlightColor: opts.highlightColor,
    highlightAlpha: opts.highlightAlpha,
    lineWidth: opts.lineWidth,
    chamfer: opts.chamfer,
  });
  const txt = scene.add.text(0, 0, label, {
    fontFamily: opts.fontFamily ?? UI_FONT_BOLD,
    fontSize: opts.fontSize ?? '24px',
    color: opts.color ?? THEME.text,
    align: 'center',
  }).setOrigin(0.5);
  const icon = opts.icon
    ? scene.add.image(opts.iconX ?? (-w / 2 + Math.max(24, h * 0.52)), opts.iconY ?? 0, opts.icon)
      .setDisplaySize(opts.iconSize ?? Math.min(34, h * 0.58), opts.iconSize ?? Math.min(34, h * 0.58))
    : null;
  const labelOffsetX = opts.labelOffsetX ?? (icon ? Math.min(18, h * 0.24) : 0);
  txt.setX(labelOffsetX);
  // Localized labels can be substantially wider than English. Keep every line
  // inside the button without requiring per-language font-size exceptions.
  const baseFontSize = Number.parseFloat(opts.fontSize ?? '24px');
  let fontSize = baseFontSize;
  const minFontSize = opts.minFontSize ?? 11;
  const textWidth = w - 16 - (icon ? (opts.iconSpace ?? Math.min(52, h * 0.85)) : 0);
  while (txt.width > textWidth && fontSize > minFontSize) {
    fontSize -= 1;
    txt.setFontSize(fontSize);
  }
  container.add(icon ? [bg, icon, txt] : [bg, txt]);
  container.setSize(w, h);
  container.setInteractive({ useHandCursor: true });

  container.on('pointerover', () => scene.tweens.add({ targets: container, scale: 1.04, duration: 90 }));
  container.on('pointerout', () => scene.tweens.add({ targets: container, scale: 1, duration: 90 }));
  container.on('pointerdown', () => container.setScale(0.96));
  container.on('pointerup', () => {
    container.setScale(1);
    Sfx.uiClick();
    onClick?.();
  });

  container.label = txt;
  container.background = bg;
  container.icon = icon;
  container.setLabel = (nextLabel) => {
    txt.setFontSize(baseFontSize).setText(nextLabel);
    let nextSize = baseFontSize;
    while (txt.width > textWidth && nextSize > minFontSize) {
      nextSize -= 1;
      txt.setFontSize(nextSize);
    }
    return container;
  };
  return container;
}
