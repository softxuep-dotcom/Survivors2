// 开局增益三选一。默认选择一项，切换选择不触发广告或直接开始游戏。
// 名称与效果拆成两段文字（名称粗体、效果常规），CJK 字号单独放大；横屏按 1280 逻辑高度放大面板。
import { AD_REWARDS, THEME } from '../config.js';
import { t } from '../i18n.js';
import { makeButton, makePanel } from './widgets.js';
import { UI_FONT, UI_FONT_BOLD, isCjkLocale, mobileSafeArea } from './layout.js';
import { fitTextToBox } from './LevelUpOverlay.js';

const LANDSCAPE_PANEL = { w: 1000, h: 680 };
const BOOST_DESC_COLOR = '#c4d8c0';

export class StartBoostOverlay {
  constructor(scene) {
    this.scene = scene;
    this.safe = mobileSafeArea(scene);
    this.portrait = this.safe.portrait;
    const cjk = isCjkLocale();
    this.panelW = this.portrait ? scene.scale.width - this.safe.side * 2 : LANDSCAPE_PANEL.w;
    this.panelH = this.portrait ? Math.min(720, scene.scale.height - this.safe.top - this.safe.bottom - 12) : LANDSCAPE_PANEL.h;
    this.root = scene.add.container(0, 0).setDepth(300).setVisible(false);
    this.busy = false;
    this.dim = scene.add.rectangle(0, 0, 10, 10, 0x050806, this.portrait ? 0.7 : 0.82).setOrigin(0).setInteractive();
    this.panel = makePanel(scene, this.panelW, this.panelH, {
      fill: 0x101612, line: THEME.gold, lineWidth: 3, chamfer: this.portrait ? 24 : 22,
      alpha: 0.97, shadow: true, shadowAlpha: 0.52, highlight: true, highlightAlpha: 0.22,
    });
    const panelTop = -this.panelH / 2;
    // 横屏各元素的基准 y（未缩放）；layout() 按缩放系数统一换算。
    this.landscapeY = { emblem: -284, title: -222, subtitle: -170, cards: 12, cancel: 254 };
    const emblemSize = this.portrait ? 58 : 72;
    this.emblem = scene.add.image(0, this.portrait ? panelTop + 46 : this.landscapeY.emblem, 'ui_enhance_badge')
      .setDisplaySize(emblemSize, emblemSize);
    this.emblemSize = emblemSize;
    this.title = scene.add.text(0, this.portrait ? panelTop + 104 : this.landscapeY.title, t('ad.startTitle'), {
      fontFamily: UI_FONT_BOLD, color: THEME.goldCss,
      stroke: '#10160f', strokeThickness: this.portrait ? 5 : 6, align: 'center',
    }).setOrigin(0.5);
    fitTextToBox(this.title, {
      width: this.panelW - 48, height: this.portrait ? 50 : 62,
      fontSize: this.portrait ? (cjk ? 36 : 30) : (cjk ? 46 : 40), minFontSize: cjk ? 26 : 20, maxLines: 2, lineSpacing: 0,
    });
    this.subtitle = scene.add.text(0, this.portrait ? panelTop + 150 : this.landscapeY.subtitle, t('ad.startSubtitle'), {
      fontFamily: UI_FONT, color: THEME.sub, align: 'center',
    }).setOrigin(0.5);
    fitTextToBox(this.subtitle, {
      width: this.panelW - 56, height: this.portrait ? 58 : 70,
      fontSize: this.portrait ? (cjk ? 23 : 19) : (cjk ? 27 : 23), minFontSize: cjk ? 20 : 14, maxLines: 2, lineSpacing: 2,
    });
    this.root.add([this.dim, this.panel, this.emblem, this.title, this.subtitle]);

    const boostIcons = ['icon_core', 'icon_battle_emblem', 'icon_boots'];
    const cardW = this.portrait ? this.panelW - 32 : 296;
    const cardH = this.portrait ? 132 : 300;
    this.cards = Object.values(AD_REWARDS.startBuffs).map((buff, i) => {
      const x = this.portrait ? 0 : (i - 1) * 318;
      const y = this.portrait ? panelTop + 248 + i * 146 : this.landscapeY.cards;
      const iconSize = this.portrait ? 100 : 116;
      const card = makeButton(scene, x, y, cardW, cardH, t(buff.nameKey), () => this.pick(buff.key), {
        fontSize: '28px', minFontSize: 14,
        fill: 0x151d17, line: 0x5d743e,
        color: THEME.text, chamfer: this.portrait ? 12 : 14, shadow: true,
        icon: boostIcons[i], iconSize,
        iconX: this.portrait ? -cardW / 2 + 18 + iconSize / 2 : 0,
        iconY: this.portrait ? 0 : -cardH / 2 + 20 + iconSize / 2,
      });
      const desc = scene.add.text(0, 0, t(buff.descKey), {
        fontFamily: UI_FONT, color: BOOST_DESC_COLOR, align: this.portrait ? 'left' : 'center',
      });
      const name = card.label;
      if (this.portrait) {
        // 图标右侧：名称 + 效果作为一个整体垂直居中（踏风的效果有两行）。
        const textX = -cardW / 2 + 18 + iconSize + 20;
        const textW = cardW / 2 - 48 - textX;
        name.setOrigin(0, 0).setAlign('left');
        desc.setOrigin(0, 0);
        fitTextToBox(name, {
          width: textW, height: 44, fontSize: cjk ? 31 : 26, minFontSize: cjk ? 24 : 16, maxLines: 1, lineSpacing: 0,
        });
        fitTextToBox(desc, {
          width: textW, height: cardH - 24 - name.height - 6, fontSize: cjk ? 24 : 21, minFontSize: cjk ? 20 : 14,
          maxLines: 3, lineSpacing: 3,
        });
        const blockH = name.height + 6 + desc.height;
        name.setPosition(textX, -blockH / 2);
        desc.setPosition(textX, -blockH / 2 + name.height + 6);
      } else {
        // 名称优先单行，放不下折两行；效果文字跟在名称实际高度之后。
        const nameTop = -cardH / 2 + 20 + iconSize + 12;
        name.setOrigin(0.5, 0).setPosition(0, nameTop);
        fitTextToBox(name, {
          width: cardW - 32, height: 80, fontSize: cjk ? 33 : 28, minFontSize: cjk ? 24 : 17, maxLines: 2, lineSpacing: 0,
          preferSingleLine: true, singleLineMin: cjk ? 26 : 21,
        });
        const descTop = nameTop + name.height + 4;
        desc.setOrigin(0.5, 0).setPosition(0, descTop);
        fitTextToBox(desc, {
          width: cardW - 32, height: cardH / 2 - 14 - descTop, fontSize: cjk ? 26 : 22, minFontSize: cjk ? 21 : 15,
          maxLines: 4, lineSpacing: 4,
        });
      }
      const selectionFrame = makePanel(scene, cardW, cardH, {
        fill: 0x151d17, alpha: 0, line: THEME.gold, lineWidth: 3,
        chamfer: this.portrait ? 12 : 14, highlight: true, highlightAlpha: 0.4,
      }).setVisible(false);
      const selectedMark = scene.add.text(
        cardW / 2 - (this.portrait ? 26 : 24),
        -cardH / 2 + (this.portrait ? 24 : 24),
        '✓',
        { fontFamily: UI_FONT_BOLD, fontSize: this.portrait ? '28px' : '32px', color: THEME.goldCss },
      ).setOrigin(0.5).setVisible(false);
      card.add([desc, selectionFrame, selectedMark]);
      card.buffKey = buff.key;
      card.desc = desc;
      card.selectionFrame = selectionFrame;
      card.selectedMark = selectedMark;
      this.root.add(card);
      return card;
    });
    const cancelW = this.portrait ? this.panelW - 32 : 360;
    const cancelH = this.portrait ? 66 : 70;
    this.cancel = makeButton(scene, 0, this.portrait ? this.panelH / 2 - 52 : this.landscapeY.cancel, cancelW, cancelH, t('ad.cancel'), () => this.hide(), {
      fontSize: this.portrait ? (cjk ? '27px' : '23px') : (cjk ? '29px' : '25px'), minFontSize: cjk ? 20 : 14,
      fill: 0x141b16, line: 0x8c681f, lineWidth: 2,
      color: '#e2d6b2', chamfer: this.portrait ? 10 : 10,
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
      card.desc.setColor(selected ? '#f1e6c2' : BOOST_DESC_COLOR);
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
    const scale = Math.min(1, (w - 24) / LANDSCAPE_PANEL.w, (h - 24) / LANDSCAPE_PANEL.h);
    const y = this.landscapeY;
    this.panel.setScale(scale);
    this.emblem.setDisplaySize(this.emblemSize * scale, this.emblemSize * scale).setY(y.emblem * scale);
    this.title.setScale(scale).setY(y.title * scale);
    this.subtitle.setScale(scale).setY(y.subtitle * scale);
    this.cards.forEach((card, i) => card.setPosition((i - 1) * 318 * scale, y.cards * scale).setScale(scale));
    this.cancel.setPosition(0, y.cancel * scale).setScale(scale);
  }

  destroy() { this.root.destroy(true); }
}
