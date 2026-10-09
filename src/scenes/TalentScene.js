import Phaser from 'phaser';
import { TALENTS, THEME } from '../config.js';
import { t } from '../i18n.js';
import { touchSave } from '../save.js';
import { nextTalentCost, purchaseTalent, talentLevel, talentValue } from '../game/MetaProgression.js';
import { Sfx } from '../audio.js';
import { makeButton, makePanel } from '../ui/widgets.js';
import { UI_FONT, UI_FONT_BOLD, mobileSafeArea } from '../ui/layout.js';
import { stripLeadingIcon as stripLabelIcon } from '../ui/labelText.js';

const TALENT_ICONS = {
  vitality: 'icon_core', might: 'icon_battle_emblem', haste: 'icon_gears', focus: 'icon_rune',
  wisdom: 'icon_holyorb', reach: 'icon_magnet', secondWind: 'icon_heal', veteran: 'icon_blade',
  reroll: 'ui_reroll',
};

function stripLeadingIcon(label) {
  return stripLabelIcon(label, '◆♦');
}

export class TalentScene extends Phaser.Scene {
  constructor() { super('Talents'); }

  create() {
    this._onResize = () => this.scene.restart();
    this.scale.on('resize', this._onResize);
    this.events.once('shutdown', () => this.scale.off('resize', this._onResize));
    const w = this.scale.width, h = this.scale.height;
    const safe = mobileSafeArea(this);
    const portrait = safe.portrait;
    const save = this.registry.get('save');
    this.cameras.main.setBackgroundColor(THEME.bg);
    this.add.tileSprite(0, 0, w, h, 'ground').setOrigin(0).setAlpha(0.38);
    this.add.image(w / 2, h / 2, 'vignette').setDisplaySize(w * 1.3, h * 1.3);

    this.add.text(w / 2, portrait ? safe.top + 24 : 52, t('talent.title'), {
      fontFamily: UI_FONT_BOLD, fontSize: portrait ? '28px' : '38px', color: THEME.goldCss,
      stroke: '#10160f', strokeThickness: portrait ? 4 : 6,
    }).setOrigin(0.5);
    this.add.text(w / 2, portrait ? safe.top + 61 : 96, t('talent.subtitle'), {
      fontFamily: UI_FONT, fontSize: portrait ? '13px' : '16px', color: THEME.sub,
      align: 'center', wordWrap: { width: portrait ? w - 100 : w - 40 },
    }).setOrigin(0.5);
    const diamondText = this.add.text(12, 0, stripLeadingIcon(t('menu.diamonds', { value: save.diamonds })), {
      fontFamily: UI_FONT_BOLD, fontSize: portrait ? '15px' : '22px', color: THEME.goldCss,
    }).setOrigin(0.5);
    const diamondW = Math.max(portrait ? 112 : 160, diamondText.width + 50);
    const diamondPill = this.add.container(w - safe.side - diamondW / 2, portrait ? safe.top + 4 : 45);
    diamondPill.add(makePanel(this, diamondW, portrait ? 36 : 42, {
      fill: 0x0e1511, line: 0x8c681f, lineWidth: 1, radius: 20, alpha: 0.95, highlight: true,
    }));
    diamondPill.add([
      this.add.image(-diamondW / 2 + 22, 0, 'ui_enhance_badge').setDisplaySize(portrait ? 25 : 30, portrait ? 25 : 30),
      diamondText,
    ]);

    const defs = Object.values(TALENTS);
    const margin = portrait ? safe.side : Math.max(18, w * 0.06);
    const gap = portrait ? 10 : 14;
    const cardW = Math.min(420, (w - margin * 2 - gap) / 2);
    const top = portrait ? 106 : 130, bottom = portrait ? 74 : 96;
    const availableRowH = (h - top - bottom - gap * 4) / 5;
    const rowH = portrait ? Math.min(250, availableRowH) : Math.min(128, availableRowH);
    defs.forEach((def, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = w / 2 + (col ? 1 : -1) * (cardW + gap) / 2;
      const y = top + row * (rowH + gap) + rowH / 2;
      const root = this.add.container(x, y);
      const lv = talentLevel(save, def.key);
      const maxed = lv >= def.maxLv;
      root.add(makePanel(this, cardW, rowH, {
        fill: maxed ? 0x19231a : 0x111813,
        line: maxed ? THEME.gold : 0x53643d, lineWidth: maxed ? 2 : 1,
        chamfer: portrait ? 10 : 12, alpha: 0.96, shadow: true, highlight: true,
        highlightAlpha: maxed ? 0.22 : 0.1,
      }));
      const rawValue = lv > 0 ? talentValue(save, def.key) : def.values[0];
      const shownValue = rawValue;
      root.add(this.add.image(-cardW / 2 + (portrait ? 27 : 30), -rowH / 2 + (portrait ? 27 : 30), TALENT_ICONS[def.key] || 'icon_rune')
        .setDisplaySize(portrait ? 38 : 44, portrait ? 38 : 44));
      root.add(this.add.text(-cardW / 2 + (portrait ? 50 : 58), -rowH / 2 + 13, t(def.nameKey), {
        fontFamily: UI_FONT_BOLD, fontSize: portrait ? '15px' : '17px', color: maxed ? THEME.goldCss : THEME.text,
        wordWrap: { width: cardW - (portrait ? 98 : 112) },
      }));
      root.add(this.add.text(cardW / 2 - 16, -rowH / 2 + 13, `${lv}/${def.maxLv}`, {
        fontFamily: UI_FONT_BOLD, fontSize: portrait ? '14px' : '15px', color: THEME.goldCss,
      }).setOrigin(1, 0));
      const separator = this.add.graphics();
      separator.lineStyle(1, maxed ? THEME.gold : 0x607047, maxed ? 0.35 : 0.2);
      separator.lineBetween(-cardW / 2 + 12, -rowH / 2 + (portrait ? 49 : 55), cardW / 2 - 12, -rowH / 2 + (portrait ? 49 : 55));
      root.add(separator);
      root.add(this.add.text(-cardW / 2 + 14, portrait ? 2 : 5, t(def.descKey, { value: shownValue }), {
        fontFamily: UI_FONT, fontSize: portrait ? '13px' : '14px', color: THEME.sub,
        wordWrap: { width: cardW - 28 }, align: 'left',
      }).setOrigin(0, 0.5));
      const cost = nextTalentCost(save, def.key);
      const label = cost == null ? t('talent.max') : t('talent.buy', { cost });
      const buy = this.add.text(cardW / 2 - 16, rowH / 2 - 14, label, {
        fontFamily: UI_FONT_BOLD, fontSize: portrait ? '13px' : '14px',
        color: cost != null && save.diamonds >= cost ? '#9ef3b0' : '#718a76',
      }).setOrigin(1, 1);
      root.add(buy);
      if (cost != null) {
        root.setSize(cardW, rowH).setInteractive({ useHandCursor: true });
        root.on('pointerup', () => {
          if (!purchaseTalent(save, def.key)) { Sfx.hurt(); return; }
          touchSave(save);
          Sfx.choose();
          this.scene.restart();
        });
      }
    });

    makeButton(this, w / 2, h - (portrait ? 34 : 48), portrait ? w - safe.side * 2 : 250, portrait ? 48 : 58, t('talent.back'), () => this.scene.start('Menu'), {
      fontSize: portrait ? '17px' : '20px', fill: 0x141b16, line: 0x8c681f,
      color: '#dfd3ab', chamfer: portrait ? 9 : 10, shadow: true,
    });
  }
}
