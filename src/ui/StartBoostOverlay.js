// 开局增益三选一。默认选择一项，切换选择不触发广告或直接开始游戏。
import { AD_REWARDS, THEME } from '../config.js';
import { t } from '../i18n.js';
import { makeButton, makePanel } from './widgets.js';
import { UI_FONT, UI_FONT_BOLD, mobileSafeArea } from './layout.js';

export class StartBoostOverlay {
  constructor(scene) {
    this.scene = scene;
    this.safe = mobileSafeArea(scene);
    this.portrait = this.safe.portrait;
    this.panelW = this.portrait ? scene.scale.width - this.safe.side * 2 : 660;
    this.panelH = this.portrait ? Math.min(690, scene.scale.height - this.safe.top - this.safe.bottom - 12) : 510;
    this.root = scene.add.container(0, 0).setDepth(300).setVisible(false);
    this.busy = false;
    this.dim = scene.add.rectangle(0, 0, 10, 10, 0x050806, this.portrait ? 0.68 : 0.82).setOrigin(0).setInteractive();
    this.panel = makePanel(scene, this.panelW, this.panelH, {
      fill: 0x101612, line: THEME.gold, lineWidth: 3, chamfer: this.portrait ? 24 : 20,
      alpha: 0.97, shadow: true, shadowAlpha: 0.52, highlight: true, highlightAlpha: 0.22,
    });
    const panelTop = -this.panelH / 2;
    this.emblem = scene.add.image(0, this.portrait ? panelTop + 40 : -216, 'ui_enhance_badge')
      .setDisplaySize(this.portrait ? 48 : 58, this.portrait ? 48 : 58);
    this.title = scene.add.text(0, this.portrait ? panelTop + 78 : -187, t('ad.startTitle'), {
      fontFamily: UI_FONT_BOLD, fontSize: this.portrait ? '23px' : '31px', color: THEME.goldCss,
      stroke: '#10160f', strokeThickness: this.portrait ? 3 : 5, align: 'center',
      wordWrap: { width: this.portrait ? this.panelW - 34 : 620 },
    }).setOrigin(0.5);
    this.subtitle = scene.add.text(0, this.portrait ? panelTop + 113 : -145, t('ad.startSubtitle'), {
      fontFamily: UI_FONT, fontSize: this.portrait ? '13px' : '17px', color: THEME.sub, align: 'center',
      wordWrap: { width: this.portrait ? this.panelW - 42 : 620 },
    }).setOrigin(0.5);
    this.root.add([this.dim, this.panel, this.emblem, this.title, this.subtitle]);

    const boostIcons = ['icon_core', 'icon_battle_emblem', 'icon_boots'];
    this.cards = Object.values(AD_REWARDS.startBuffs).map((buff, i) => {
      const x = this.portrait ? 0 : (i - 1) * 202;
      const y = this.portrait ? panelTop + 190 + i * 119 : 14;
      const cardW = this.portrait ? this.panelW - 28 : 184;
      const cardH = this.portrait ? 106 : 220;
      const label = `${t(buff.nameKey)}\n${t(buff.descKey)}`;
      const card = makeButton(scene, x, y, cardW, cardH, label, () => this.pick(buff.key), {
        fontSize: this.portrait ? '15px' : '16px', minFontSize: 12,
        fill: 0x151d17, line: 0x5d743e,
        color: THEME.text, chamfer: this.portrait ? 12 : 14, shadow: true,
        icon: boostIcons[i], iconSize: this.portrait ? 72 : 78,
        iconX: this.portrait ? -cardW / 2 + 50 : 0,
        iconY: this.portrait ? 0 : -60,
      });
      if (this.portrait) {
        card.label.setOrigin(0, 0.5).setPosition(-cardW / 2 + 96, 0).setAlign('left')
          .setWordWrapWidth(cardW - 116, true).setMaxLines(4);
      } else {
        card.label.setPosition(0, 52).setWordWrapWidth(cardW - 24, true).setMaxLines(5);
      }
      const selectionFrame = makePanel(scene, cardW, cardH, {
        fill: 0x151d17, alpha: 0, line: THEME.gold, lineWidth: 3,
        chamfer: this.portrait ? 12 : 14, highlight: true, highlightAlpha: 0.4,
      }).setVisible(false);
      const selectedMark = scene.add.text(
        cardW / 2 - (this.portrait ? 22 : 20),
        -cardH / 2 + (this.portrait ? 20 : 19),
        '✓',
        { fontFamily: UI_FONT_BOLD, fontSize: this.portrait ? '22px' : '24px', color: THEME.goldCss },
      ).setOrigin(0.5).setVisible(false);
      card.add([selectionFrame, selectedMark]);
      card.buffKey = buff.key;
      card.selectionFrame = selectionFrame;
      card.selectedMark = selectedMark;
      this.root.add(card);
      return card;
    });
    this.cancel = makeButton(scene, 0, this.portrait ? this.panelH / 2 - 42 : 190, this.portrait ? this.panelW - 28 : 260, 52, t('ad.cancel'), () => this.hide(), {
      fontSize: this.portrait ? '16px' : '18px', fill: 0x141b16, line: 0x8c681f,
      color: '#d9cfad', chamfer: this.portrait ? 9 : 8,
    });
    this.root.add(this.cancel);
    this.layout();
  }

  show(onPick, selectedKey) {
    this.onPick = onPick;
    this.setBusy(false);
    this.setSelected(selectedKey);
    this.root.setVisible(true);
  }

  pick(key) {
    if (!this.root.visible || this.busy) return;
    this.setSelected(key);
    this.onPick?.(key);
  }

  setSelected(key) {
    this.selectedKey = AD_REWARDS.startBuffs[key] ? key : 'fury';
    for (const card of this.cards) {
      const selected = card.buffKey === this.selectedKey;
      card.selectionFrame.setVisible(selected);
      card.selectedMark.setVisible(selected);
      card.label.setColor(selected ? THEME.goldCss : THEME.text);
    }
  }

  hide() {
    this.busy = false;
    this.root.setVisible(false);
  }

  setBusy(busy) {
    this.busy = busy;
    for (const card of this.cards) {
      card.setAlpha(busy ? 0.55 : 1);
      if (busy) card.disableInteractive();
      else card.setInteractive({ useHandCursor: true });
    }
    this.cancel.setAlpha(busy ? 0.55 : 1);
    if (busy) this.cancel.disableInteractive();
    else this.cancel.setInteractive({ useHandCursor: true });
  }

  layout() {
    const w = this.scene.scale.width, h = this.scene.scale.height;
    this.root.setPosition(w / 2, h / 2);
    this.dim.setPosition(-w / 2, -h / 2).setSize(w, h);
    if (this.portrait) return;
    const scale = Math.min(1, (w - 24) / 660, (h - 24) / 510);
    this.panel.setScale(scale);
    this.emblem.setDisplaySize(58 * scale, 58 * scale).setY(-216 * scale);
    this.title.setScale(scale).setY(-187 * scale);
    this.subtitle.setScale(scale).setY(-145 * scale);
    this.cards.forEach((card, i) => card.setPosition((i - 1) * 202 * scale, 14 * scale).setScale(scale));
    this.cancel.setPosition(0, 190 * scale).setScale(scale);
  }

  destroy() { this.root.destroy(true); }
}
