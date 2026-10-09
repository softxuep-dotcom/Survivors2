// 局内双操作弹窗：主操作始终绿色且不小于次操作；次操作用于广告奖励或退出。
// 面板高度随文案行数自适应（复活说明 + 广告不可用提示可能三行），内容放在 box 子容器里统一缩放，
// 按钮自身的悬停缩放不会和布局缩放冲突。
import { THEME } from '../config.js';
import { makeButton, makePanel } from './widgets.js';
import { UI_FONT, UI_FONT_BOLD, isCjkLocale, mobileSafeArea } from './layout.js';
import { stripLeadingIcon as stripLabelIcon } from './labelText.js';
import { fitTextToBox } from './LevelUpOverlay.js';

function stripLeadingIcon(label) {
  return stripLabelIcon(label, '↻◆♦');
}

// 逻辑像素设计尺寸：竖屏 720 宽贴底，横屏 1280 高居中。CJK 正文 ≥24，按钮文字 ≥26。
function modalDesign(portrait, cjk) {
  return portrait
    ? {
      w: 600, emblem: 60, title: cjk ? 42 : 36, desc: cjk ? 25 : 21,
      btnW: 450, primaryH: 78, secondaryH: 68, primaryFont: cjk ? 30 : 26, secondaryFont: cjk ? 26 : 22,
    }
    : {
      w: 700, emblem: 72, title: cjk ? 52 : 46, desc: cjk ? 29 : 25,
      btnW: 500, primaryH: 86, secondaryH: 74, primaryFont: cjk ? 33 : 29, secondaryFont: cjk ? 29 : 25,
    };
}

export class ActionModal {
  constructor(scene) {
    this.scene = scene;
    this.safe = mobileSafeArea(scene);
    this.cjk = isCjkLocale();
    this.design = modalDesign(this.safe.portrait, this.cjk);
    const d = this.design;
    this.root = scene.add.container(0, 0).setDepth(260).setVisible(false).setScrollFactor(0);
    this.dim = scene.add.rectangle(0, 0, 10, 10, 0x050806, this.safe.portrait ? 0.7 : 0.78).setOrigin(0).setInteractive();
    this.box = scene.add.container(0, 0);
    this.panelH = 0;
    this.panel = this.makeModalPanel(400);
    this.emblem = scene.add.image(0, 0, 'ui_enhance_badge').setDisplaySize(d.emblem, d.emblem);
    this.title = scene.add.text(0, 0, '', {
      fontFamily: UI_FONT_BOLD, fontSize: `${d.title}px`, color: THEME.goldCss,
      align: 'center', stroke: '#10160f', strokeThickness: 6,
    }).setOrigin(0.5);
    this.description = scene.add.text(0, 0, '', {
      fontFamily: UI_FONT, fontSize: `${d.desc}px`, color: '#c4dcc8',
      align: 'center',
    }).setOrigin(0.5);
    this.primary = makeButton(scene, 0, 0, d.btnW, d.primaryH, '', () => this.onPrimary?.(), {
      fontSize: `${d.primaryFont}px`, minFontSize: this.cjk ? 20 : 14,
      fill: 0x31452c, line: THEME.gold, lineWidth: 2,
      color: '#f2e4b9', chamfer: 12, shadow: true, icon: 'ui_enhance_badge', iconSize: Math.round(d.primaryH * 0.56),
    });
    this.secondary = makeButton(scene, 0, 0, d.btnW, d.secondaryH, '', () => this.onSecondary?.(), {
      fontSize: `${d.secondaryFont}px`, minFontSize: this.cjk ? 19 : 13,
      fill: 0x141b16, line: 0x8c681f, lineWidth: 2, color: '#d9cfad', chamfer: 10,
      triggerOnPointerDown: true,
    });
    this.box.add([this.panel, this.emblem, this.title, this.description, this.primary, this.secondary]);
    this.root.add([this.dim, this.box]);
    this.layout();
  }

  makeModalPanel(height) {
    return makePanel(this.scene, this.design.w, height, {
      fill: 0x101612, line: THEME.gold, lineWidth: 3, chamfer: this.safe.portrait ? 24 : 22,
      shadow: true, shadowAlpha: 0.5, highlight: true, highlightAlpha: 0.24,
    });
  }

  show({ title, description = '', primaryLabel, onPrimary, secondaryLabel, onSecondary }) {
    this.title.setText(title);
    this.description.setText(description);
    this.primary.setLabel(stripLeadingIcon(primaryLabel));
    this.secondary.setLabel(stripLeadingIcon(secondaryLabel || ''));
    this.secondary.setVisible(!!secondaryLabel);
    this.secondary.setInteractive({ useHandCursor: true }).setAlpha(1);
    this.onPrimary = onPrimary;
    this.onSecondary = onSecondary;
    this.layout();
    this.root.setVisible(true);
  }

  setSecondaryBusy(label) {
    this.secondary
      .setLabel(stripLeadingIcon(label))
      .setVisible(true)
      .disableInteractive()
      .setAlpha(0.62);
    this.layout();
  }

  hide() { this.root.setVisible(false); }

  // 自上而下堆叠：徽记 → 标题 → 说明 → 主按钮 → 次按钮，面板高度取内容总高。
  layoutContent() {
    const d = this.design;
    const innerW = d.w - 64;
    fitTextToBox(this.title, {
      width: innerW, height: d.title * 2.8, fontSize: d.title, minFontSize: Math.round(d.title * 0.7),
      maxLines: 2, lineSpacing: 0,
    });
    fitTextToBox(this.description, {
      width: innerW, height: d.desc * 5.6, fontSize: d.desc, minFontSize: this.cjk ? 21 : 15,
      maxLines: 5, lineSpacing: 5,
    });
    const hasDesc = !!this.description.text;
    this.description.setVisible(hasDesc);
    const secondary = this.secondary.visible;
    const parts = [
      { item: this.emblem, h: d.emblem, gap: 0 },
      { item: this.title, h: this.title.height, gap: 6 },
      ...(hasDesc ? [{ item: this.description, h: this.description.height, gap: 14 }] : []),
      { item: this.primary, h: d.primaryH, gap: 26 },
      ...(secondary ? [{ item: this.secondary, h: d.secondaryH, gap: 14 }] : []),
    ];
    const padTop = 24, padBottom = 30;
    const height = padTop + padBottom + parts.reduce((sum, part) => sum + part.gap + part.h, 0);
    let y = -height / 2 + padTop;
    for (const part of parts) {
      y += part.gap;
      part.item.setY(y + part.h / 2);
      y += part.h;
    }
    if (Math.abs(height - this.panelH) > 0.5) {
      const next = this.makeModalPanel(height);
      this.box.addAt(next, this.box.getIndex(this.panel));
      this.box.remove(this.panel, true);
      this.panel = next;
      this.panelH = height;
    }
    return height;
  }

  layout() {
    const w = this.scene.scale.width, h = this.scene.scale.height;
    const height = this.layoutContent();
    const scale = Math.min(1, (w - 24) / this.design.w, (h - this.safe.top - this.safe.bottom - 24) / height);
    // 竖屏贴底但留出左下角 DOM 版本号角标的高度。
    const centerY = this.safe.portrait ? h - this.safe.bottom - 36 - height * scale / 2 : h / 2;
    this.root.setPosition(w / 2, centerY);
    this.dim.setPosition(-w / 2, -centerY).setSize(w, h);
    this.box.setScale(scale);
  }

  destroy() { this.root.destroy(true); }
}
