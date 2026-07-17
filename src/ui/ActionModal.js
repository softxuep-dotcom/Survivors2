// 局内双操作弹窗：主操作始终绿色且不小于次操作；次操作用于广告奖励或退出。
import { THEME } from '../config.js';
import { makeButton, makePanel } from './widgets.js';
import { UI_FONT, UI_FONT_BOLD, mobileSafeArea } from './layout.js';

function stripLeadingIcon(label) {
  return label.replace(/^\s*[\p{Extended_Pictographic}\uFE0F\u200D↻◆♦]+\s*/u, '');
}

export class ActionModal {
  constructor(scene) {
    this.scene = scene;
    this.safe = mobileSafeArea(scene);
    this.root = scene.add.container(0, 0).setDepth(260).setVisible(false).setScrollFactor(0);
    this.dim = scene.add.rectangle(0, 0, 10, 10, 0x050806, this.safe.portrait ? 0.62 : 0.78).setOrigin(0).setInteractive();
    this.panel = makePanel(scene, 470, 360, {
      fill: 0x101612, line: THEME.gold, lineWidth: 3, chamfer: this.safe.portrait ? 24 : 20,
      shadow: true, shadowAlpha: 0.5, highlight: true, highlightAlpha: 0.24,
    });
    this.emblem = scene.add.image(0, -151, 'ui_enhance_badge').setDisplaySize(54, 54);
    this.title = scene.add.text(0, -118, '', {
      fontFamily: UI_FONT_BOLD, fontSize: '34px', color: THEME.goldCss,
      align: 'center', stroke: '#10160f', strokeThickness: 5,
    }).setOrigin(0.5);
    this.description = scene.add.text(0, -55, '', {
      fontFamily: UI_FONT, fontSize: '18px', color: THEME.sub,
      align: 'center', wordWrap: { width: 410 },
    }).setOrigin(0.5);
    this.primary = makeButton(scene, 0, 38, 330, 64, '', () => this.onPrimary?.(), {
      fontSize: '22px', fill: 0x31452c, line: THEME.gold, lineWidth: 2,
      color: '#f2e4b9', chamfer: 11, shadow: true, icon: 'ui_enhance_badge', iconSize: 36,
    });
    this.secondary = makeButton(scene, 0, 116, 330, 58, '', () => this.onSecondary?.(), {
      fontSize: '19px', fill: 0x141b16, line: 0x8c681f, color: '#d9cfad', chamfer: 9,
    });
    this.root.add([this.dim, this.panel, this.emblem, this.title, this.description, this.primary, this.secondary]);
    this.layout();
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
    this.root.setVisible(true);
  }

  disableSecondary() {
    this.secondary.disableInteractive().setVisible(false);
  }

  hide() { this.root.setVisible(false); }

  layout() {
    const w = this.scene.scale.width, h = this.scene.scale.height;
    this.dim.setSize(w, h);
    const scale = this.safe.portrait ? Math.min(1, (w - 24) / 470) : 1;
    const centerY = this.safe.portrait ? h - 180 * scale - this.safe.bottom : h / 2;
    this.root.setPosition(w / 2, centerY);
    this.dim.setPosition(-w / 2, -centerY);
    this.panel.setScale(scale);
    this.emblem.setDisplaySize(54 * scale, 54 * scale).setY(-151 * scale);
    this.title.setScale(scale).setY(-118 * scale);
    this.description.setScale(scale).setY(-55 * scale);
    this.primary.setScale(scale).setY(38 * scale);
    this.secondary.setScale(scale).setY(116 * scale);
  }

  destroy() { this.root.destroy(true); }
}
