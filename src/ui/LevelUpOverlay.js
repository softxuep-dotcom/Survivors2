// 升级三选一覆盖层：竖屏使用全宽横向技能卡，横屏保留三卡并排。
import Phaser from 'phaser';
import { WEAPONS, EVOLUTIONS, SKILLS, PASSIVES, THEME, MAXED_BONUS } from '../config.js';
import { t } from '../i18n.js';
import { Sfx } from '../audio.js';
import { makeButton } from './widgets.js';
import { UI_FONT, UI_FONT_BOLD, mobileSafeArea } from './layout.js';

const DESKTOP_CARD_W = 224;
const DESKTOP_CARD_H = 310;
const DESKTOP_GAP = 18;
const CARD_FILL = 0x111a13;
const CARD_LINE = 0x49633e;
const CARD_SUB = '#c9d8c4';
const BADGE_FILL = 0x26351d;

function fitTextToBox(text, {
  width, height, fontSize, minFontSize, maxLines = 0, wrap = true, lineSpacing = 2,
}) {
  text.setMaxLines(0).setLineSpacing(lineSpacing);
  if (wrap) text.setWordWrapWidth(width, true);
  else text.setWordWrapWidth(0, false);

  for (let size = fontSize; size >= minFontSize; size--) {
    text.setFontSize(size);
    if (text.width <= width + 1 && text.height <= height + 1) return;
  }
  if (maxLines > 0) text.setMaxLines(maxLines);
}

function drawRays(graphics, x, y, width) {
  graphics.clear();
  graphics.lineStyle(2, THEME.gold, 0.14);
  for (let i = 0; i < 14; i++) {
    const angle = Phaser.Math.DegToRad(-162 + i * 24);
    const inner = width * 0.08;
    const outer = width * (i % 2 ? 0.25 : 0.31);
    graphics.lineBetween(
      x + Math.cos(angle) * inner,
      y + Math.sin(angle) * inner,
      x + Math.cos(angle) * outer,
      y + Math.sin(angle) * outer,
    );
  }
  graphics.fillStyle(THEME.gold, 0.09);
  graphics.fillCircle(x, y, width * 0.13);
}

export class LevelUpOverlay {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this.busy = false;
    this.onPick = null;
    this.choices = [];
    this.safe = mobileSafeArea(scene);
    this.portrait = this.safe.portrait;
    this.touchUi = this.portrait || !!scene.sys.game.device.input.touch;
    this.cardW = this.portrait ? Math.min(scene.scale.width - 44, 620) : DESKTOP_CARD_W;
    this.cardH = this.portrait
      ? Math.min(230, Math.max(196, scene.scale.height * 0.16))
      : DESKTOP_CARD_H;

    this.root = scene.add.container(0, 0).setDepth(200).setScrollFactor(0).setVisible(false);
    this.dim = scene.add.rectangle(0, 0, 10, 10, 0x050806, this.portrait ? 0.68 : 0.72)
      .setOrigin(0).setInteractive();
    this.rays = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.title = scene.add.text(0, 0, '', {
      fontFamily: UI_FONT_BOLD,
      fontSize: this.portrait ? '51px' : '36px',
      color: THEME.goldCss,
      stroke: '#160f05',
      strokeThickness: this.portrait ? 8 : 6,
      shadow: { offsetY: 5, color: '#000000', blur: 8, fill: true },
      align: 'center',
    }).setOrigin(0.5);
    this.subtitle = scene.add.text(0, 0, '', {
      fontFamily: UI_FONT_BOLD,
      fontSize: this.portrait ? '18px' : '17px',
      color: '#f1eee4',
      stroke: '#0b0f0c',
      strokeThickness: 4,
      align: 'center',
    }).setOrigin(0.5);
    this.root.add([this.dim, this.rays, this.title, this.subtitle]);

    this.reroll = makeButton(scene, 0, 0, this.portrait ? 300 : 280, this.portrait ? 58 : 52, '', () => {
      if (!this.busy) this.rerollAction?.();
    }, {
      fontSize: this.portrait ? '18px' : '17px',
      minFontSize: 12,
      fill: 0x151c16,
      line: 0xa67a28,
      color: '#eadab4',
      radius: this.portrait ? 22 : 16,
      shadow: true,
    }).setVisible(false);
    this.rerollIcon = scene.add.image(-116, 0, 'ui_reroll').setDisplaySize(30, 30);
    this.reroll.add(this.rerollIcon);
    this.reroll.label.setX(12);
    this.root.add(this.reroll);

    this.cards = [];
    for (let i = 0; i < 3; i++) this.cards.push(this.buildCard(i));

    this.keyHandler = (event) => {
      if (!this.visible || this.busy) return;
      const idx = { Digit1: 0, Digit2: 1, Digit3: 2 }[event.code];
      if (idx != null && this.choices[idx]) this.pick(idx);
    };
    scene.input.keyboard.on('keydown', this.keyHandler);
  }

  buildCard(index) {
    const scene = this.scene;
    const cardW = this.cardW;
    const cardH = this.cardH;
    const card = scene.add.container(0, 0);
    const frame = scene.add.graphics();
    const iconFrame = scene.add.graphics();
    const badgeFrame = scene.add.graphics();
    const separator = scene.add.graphics();
    const arrow = scene.add.image(0, 0, 'ui_upgrade_arrow')
      .setDisplaySize(this.portrait ? 48 : 40, this.portrait ? 48 : 40)
      .setAlpha(0);

    let icon;
    let badge;
    let name;
    let desc;
    let hotkey;
    if (this.portrait) {
      const iconSize = Math.min(142, cardH - 46);
      const iconX = -cardW / 2 + iconSize / 2 + 22;
      const copyX = -cardW / 2 + iconSize + 46;
      icon = scene.add.image(iconX, 0, 'icon_blade').setDisplaySize(iconSize - 10, iconSize - 10);
      name = scene.add.text(copyX, -cardH / 2 + 41, '', {
        fontFamily: UI_FONT_BOLD, fontSize: '27px', color: THEME.text, align: 'left',
        stroke: '#0a0d0b', strokeThickness: 3,
      }).setOrigin(0, 0.5);
      badge = scene.add.text(cardW / 2 - 34, -cardH / 2 + 41, '', {
        fontFamily: UI_FONT_BOLD, fontSize: '17px', color: '#d7e99d', align: 'center',
      }).setOrigin(1, 0.5);
      desc = scene.add.text(copyX, 19, '', {
        fontFamily: UI_FONT, fontSize: '19px', color: CARD_SUB, align: 'left',
      }).setOrigin(0, 0);
      hotkey = scene.add.text(-cardW / 2 + 12, -cardH / 2 + 10, `${index + 1}`, {
        fontFamily: UI_FONT_BOLD, fontSize: '12px', color: '#7f957f',
      });
      arrow.setPosition(cardW / 2 - 22, cardH / 2 - 28);
      card.parts = { frame, iconFrame, badgeFrame, separator, arrow, icon, badge, name, desc, hotkey, iconSize, iconX, copyX };
    } else {
      icon = scene.add.image(0, -cardH / 2 + 72, 'icon_blade').setDisplaySize(98, 98);
      badge = scene.add.text(0, -cardH / 2 + 127, '', {
        fontFamily: UI_FONT_BOLD, fontSize: '16px', color: '#d7e99d', align: 'center',
      }).setOrigin(0.5);
      name = scene.add.text(0, -cardH / 2 + 165, '', {
        fontFamily: UI_FONT_BOLD, fontSize: '23px', color: THEME.text, align: 'center',
      }).setOrigin(0.5);
      desc = scene.add.text(0, -cardH / 2 + 212, '', {
        fontFamily: UI_FONT, fontSize: '16px', color: CARD_SUB, align: 'center',
      }).setOrigin(0.5, 0);
      hotkey = scene.add.text(-cardW / 2 + 13, -cardH / 2 + 10, `${index + 1}`, {
        fontFamily: UI_FONT_BOLD, fontSize: '13px', color: '#7f957f',
      });
      arrow.setPosition(cardW / 2 - 21, cardH / 2 - 25);
      card.parts = { frame, iconFrame, badgeFrame, separator, arrow, icon, badge, name, desc, hotkey, iconSize: 108, iconX: 0, copyX: 0 };
    }

    card.parts.accent = THEME.green;
    card.add([frame, iconFrame, badgeFrame, separator, icon, badge, name, desc, hotkey, arrow]);
    this.drawCard(card, false);
    card.setSize(cardW, cardH).setInteractive({ useHandCursor: true });
    card.on('pointerover', () => {
      if (this.touchUi || !this.visible || this.busy) return;
      for (let i = 0; i < this.cards.length; i++) this.drawCard(this.cards[i], i === index);
      scene.tweens.add({ targets: card, scale: (this._layoutScale ?? 1) * 1.025, duration: 100 });
    });
    card.on('pointerout', () => {
      if (this.touchUi || !this.visible || this.busy) return;
      for (let i = 0; i < this.cards.length; i++) this.drawCard(this.cards[i], i === 0);
      scene.tweens.add({ targets: card, scale: this._layoutScale ?? 1, duration: 100 });
    });
    card.on('pointerdown', () => {
      if (this.visible && !this.busy) card.setScale((this._layoutScale ?? 1) * 0.985);
    });
    card.on('pointerup', () => this.pick(index));
    this.root.add(card);
    return card;
  }

  drawCard(card, active) {
    const { frame, iconFrame, badgeFrame, separator, arrow, accent, iconSize, iconX, copyX } = card.parts;
    const cardW = this.cardW;
    const cardH = this.cardH;
    const line = active ? THEME.gold : CARD_LINE;
    const radius = this.portrait ? 22 : 17;
    frame.clear();
    frame.fillStyle(0x000000, active ? 0.48 : 0.34);
    frame.fillRoundedRect(-cardW / 2, -cardH / 2 + 7, cardW, cardH, radius);
    frame.fillStyle(active ? 0x1c2117 : CARD_FILL, 0.97);
    frame.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, radius);
    frame.lineStyle(active ? 4 : 2, line, active ? 1 : 0.9);
    frame.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, radius);
    frame.lineStyle(1, active ? 0xfff0a4 : 0x8da483, active ? 0.35 : 0.12);
    frame.strokeRoundedRect(-cardW / 2 + 6, -cardH / 2 + 6, cardW - 12, cardH - 12, radius - 5);

    iconFrame.clear();
    const iconBox = this.portrait ? iconSize : 108;
    const iconY = this.portrait ? 0 : -cardH / 2 + 72;
    iconFrame.fillStyle(0x090d0a, 0.94);
    iconFrame.fillRoundedRect(iconX - iconBox / 2, iconY - iconBox / 2, iconBox, iconBox, 18);
    iconFrame.fillStyle(accent, active ? 0.12 : 0.07);
    iconFrame.fillCircle(iconX, iconY, iconBox * 0.37);
    iconFrame.lineStyle(2, active ? THEME.gold : accent, active ? 0.9 : 0.72);
    iconFrame.strokeRoundedRect(iconX - iconBox / 2, iconY - iconBox / 2, iconBox, iconBox, 18);

    badgeFrame.clear();
    if (this.portrait) {
      const badgeW = 122;
      const badgeH = 38;
      const badgeX = cardW / 2 - 28 - badgeW;
      const badgeY = -cardH / 2 + 22;
      badgeFrame.fillStyle(BADGE_FILL, 0.98);
      badgeFrame.fillRoundedRect(badgeX, badgeY, badgeW, badgeH, 16);
      badgeFrame.lineStyle(1, active ? THEME.gold : accent, active ? 0.75 : 0.5);
      badgeFrame.strokeRoundedRect(badgeX, badgeY, badgeW, badgeH, 16);
    } else {
      badgeFrame.fillStyle(BADGE_FILL, 0.95);
      badgeFrame.fillRoundedRect(-64, -cardH / 2 + 108, 128, 38, 16);
      badgeFrame.lineStyle(1, active ? THEME.gold : accent, active ? 0.75 : 0.5);
      badgeFrame.strokeRoundedRect(-64, -cardH / 2 + 108, 128, 38, 16);
    }

    separator.clear();
    separator.lineStyle(1, active ? THEME.gold : accent, active ? 0.4 : 0.22);
    if (this.portrait) separator.lineBetween(copyX, -3, cardW / 2 - 30, -3);
    else separator.lineBetween(-cardW / 2 + 28, -cardH / 2 + 190, cardW / 2 - 28, -cardH / 2 + 190);
    arrow.setAlpha(active ? 1 : 0);
  }

  fitCardCopy(card) {
    const { badge, name, desc, copyX } = card.parts;
    if (this.portrait) {
      const right = this.cardW / 2 - 28;
      const badgeW = 118;
      fitTextToBox(badge, {
        width: badgeW - 12, height: 30, fontSize: 17, minFontSize: 11, maxLines: 1, wrap: false, lineSpacing: 0,
      });
      fitTextToBox(name, {
        width: right - badgeW - 16 - copyX, height: 43,
        fontSize: 27, minFontSize: 16, maxLines: 2, lineSpacing: 0,
      });
      fitTextToBox(desc, {
        width: right - copyX, height: this.cardH / 2 - 34,
        fontSize: 19, minFontSize: 13, maxLines: 4, lineSpacing: 3,
      });
      return;
    }
    fitTextToBox(badge, {
      width: this.cardW - 42, height: 29, fontSize: 16, minFontSize: 11, maxLines: 1, wrap: false, lineSpacing: 0,
    });
    fitTextToBox(name, {
      width: this.cardW - 28, height: 42, fontSize: 23, minFontSize: 14, maxLines: 2, lineSpacing: 0,
    });
    fitTextToBox(desc, {
      width: this.cardW - 34, height: 76, fontSize: 16, minFontSize: 11, maxLines: 5, lineSpacing: 3,
    });
  }

  fillCard(card, choice) {
    const { icon, badge, name, desc, arrow } = card.parts;
    let accent = THEME.green;
    if (choice.kind === 'module') {
      const def = SKILLS[choice.key];
      icon.setTexture(def.icon);
      badge.setText(t('levelup.lvup', { lv: choice.toLv }));
      name.setText(`${t(def.nameKey)} · ${choice.moduleLabel}`);
      desc.setText(choice.description);
      accent = def.color || THEME.green;
    } else if (choice.kind === 'skill') {
      const def = SKILLS[choice.key];
      icon.setTexture(def.icon);
      badge.setText(t('levelup.newWeapon'));
      name.setText(t(def.nameKey));
      desc.setText(t(def.descKey));
      accent = def.color || THEME.green;
    } else if (choice.kind === 'weapon') {
      const def = choice.evolutionKey ? EVOLUTIONS[choice.evolutionKey] : WEAPONS[choice.key];
      icon.setTexture(def.icon);
      badge.setText(choice.toLv === 1 ? t('levelup.newWeapon') : t('levelup.lvup', { lv: choice.toLv }));
      name.setText(t(def.nameKey));
      desc.setText(choice.toLv === 1 ? t(def.descKey) : t(def.lvDescKey || def.descKey));
      accent = def.color || THEME.green;
    } else if (choice.kind === 'evolution') {
      const def = EVOLUTIONS[choice.key];
      icon.setTexture(def.icon);
      badge.setText(t('levelup.evolution'));
      name.setText(t(def.nameKey));
      desc.setText(t(def.descKey));
      accent = def.color || THEME.gold;
    } else if (choice.kind === 'passive') {
      const def = PASSIVES[choice.key];
      icon.setTexture(def.icon);
      badge.setText(choice.toLv === 1 ? t('levelup.newWeapon') : t('levelup.lvup', { lv: choice.toLv }));
      name.setText(t(def.nameKey));
      desc.setText(t(def.descKey, {
        value: def.values[choice.toLv - 1],
        regen: def.regen ? def.regen[choice.toLv - 1] : '',
      }));
      accent = THEME.green;
    } else if (choice.kind === 'bonus') {
      const isDmg = choice.key === 'dmg';
      icon.setTexture(isDmg ? 'icon_battle_emblem' : 'icon_boots');
      badge.setText(t('levelup.endless'));
      name.setText(t(isDmg ? 'bonus.dmg' : 'bonus.speed'));
      desc.setText(t(isDmg ? 'bonus.dmgDesc' : 'bonus.speedDesc', {
        value: isDmg ? MAXED_BONUS.dmgPct : MAXED_BONUS.speedPct,
      }));
      accent = isDmg ? THEME.gold : THEME.green;
    } else {
      icon.setTexture('icon_heal');
      badge.setText(t('levelup.endless'));
      name.setText(t('bonus.heal'));
      desc.setText(t('bonus.healDesc'));
      accent = THEME.red;
    }
    card.parts.accent = accent;
    this.drawCard(card, false);
    this.fitCardCopy(card);
  }

  show(choices, onPick, {
    rerolls = 0, onReroll = null, adReroll = false, onAdReroll = null, jackpot = false, playOpenSfx = true,
  } = {}) {
    this.choices = choices;
    this.onPick = onPick;
    this.onReroll = onReroll;
    this.busy = false;
    this.visible = true;
    const evolution = choices[0]?.kind === 'evolution';
    this.title
      .setText(jackpot ? t('levelup.jackpotTitle') : evolution ? t('levelup.evolutionTitle') : t('levelup.title'))
      .setColor(jackpot ? '#fff1a8' : THEME.goldCss);
    this.subtitle.setText(evolution || jackpot ? t('levelup.evolution') : t('tutorial.levelup'));
    this.layout();

    const canReroll = !evolution && (rerolls > 0 || adReroll);
    this.rerollAction = rerolls > 0 ? onReroll : onAdReroll;
    this.reroll.setVisible(canReroll)
      .setLabel(rerolls > 0 ? t('levelup.reroll', { value: rerolls }) : t('ad.reroll'))
      .setAlpha(1);
    this.reroll.label.setColor(rerolls > 0 ? '#eadab4' : THEME.goldCss);

    for (let i = 0; i < 3; i++) {
      const card = this.cards[i];
      const choice = choices[i];
      card.setVisible(!!choice);
      if (!choice) continue;
      this.fillCard(card, choice);
      this.drawCard(card, !this.touchUi && i === 0);
      const targetScale = this._layoutScale ?? 1;
      card.setScale(targetScale * 0.84).setAlpha(0).setAngle(0);
      this.scene.tweens.add({
        targets: card, scale: targetScale, alpha: 1, duration: 190, delay: i * 60, ease: 'Back.Out',
      });
      if (jackpot) {
        this.scene.tweens.add({
          targets: card, angle: { from: i % 2 ? 1.5 : -1.5, to: 0 }, duration: 230, delay: i * 60, ease: 'Sine.Out',
        });
      }
    }
    this.root.setVisible(true);
    if (playOpenSfx) Sfx.levelup();
  }

  layout() {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    this.dim.setSize(w, h);
    const count = Math.max(1, Math.min(3, this.choices.length || 3));
    if (this.portrait) {
      const gap = 16;
      const totalH = this.cardH * count + gap * (count - 1);
      const top = Math.max(this.safe.top + 166, (h - totalH) / 2 - 24);
      const titleY = top - 116;
      this.title.setPosition(w / 2, titleY).setWordWrapWidth(w - 42, true);
      const subtitleY = titleY + this.title.height / 2 + 36;
      this.subtitle.setPosition(w / 2, subtitleY).setWordWrapWidth(w - 56, true);
      drawRays(this.rays, w / 2, titleY, Math.min(w, 590));
      this._layoutScale = 1;
      for (let i = 0; i < 3; i++) {
        this.cards[i].setPosition(w / 2, top + this.cardH / 2 + i * (this.cardH + gap)).setScale(1);
      }
      this.reroll.setPosition(w / 2, Math.min(h - this.safe.bottom - 36, top + totalH + 54));
      return;
    }

    const titleY = h / 2 - DESKTOP_CARD_H / 2 - 74;
    this.title.setPosition(w / 2, titleY);
    this.subtitle.setPosition(w / 2, titleY + 46);
    drawRays(this.rays, w / 2, titleY, Math.min(w * 0.55, 620));
    const totalW = DESKTOP_CARD_W * count + DESKTOP_GAP * (count - 1);
    const scale = Math.min(1, (w - 24) / totalW, (h - 170) / DESKTOP_CARD_H);
    this._layoutScale = scale;
    for (let i = 0; i < 3; i++) {
      const x = w / 2 + (i - (count - 1) / 2) * (DESKTOP_CARD_W + DESKTOP_GAP) * scale;
      this.cards[i].setPosition(x, h / 2 + 25).setScale(scale);
    }
    this.reroll.setPosition(w / 2, Math.min(h - 34, h / 2 + DESKTOP_CARD_H * scale / 2 + 76));
  }

  pick(index) {
    if (!this.visible || this.busy || !this.choices[index]) return;
    const choice = this.choices[index];
    this.visible = false;
    Sfx.choose();
    const card = this.cards[index];
    const baseScale = this._layoutScale ?? 1;
    for (let i = 0; i < this.cards.length; i++) {
      this.scene.tweens.killTweensOf(this.cards[i]);
      this.drawCard(this.cards[i], i === index);
      this.cards[i].setAlpha(i === index ? 1 : 0.55);
    }
    card.setScale(baseScale);
    this.scene.tweens.add({
      targets: card, scale: baseScale * 1.07, duration: 110, yoyo: true,
      onComplete: () => {
        this.root.setVisible(false);
        for (const item of this.cards) item.setAlpha(1);
        this.onPick?.(choice);
      },
    });
  }

  setBusy(busy) {
    this.busy = busy;
    this.reroll.setAlpha(busy ? 0.45 : 1);
    for (const card of this.cards) card.setAlpha(busy ? 0.55 : 1);
  }

  hide() {
    this.visible = false;
    this.busy = false;
    for (const card of this.cards) this.scene.tweens.killTweensOf(card);
    this.root.setVisible(false);
  }

  destroy() {
    this.scene.input.keyboard.off('keydown', this.keyHandler);
  }
}
