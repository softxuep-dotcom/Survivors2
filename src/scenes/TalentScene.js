import Phaser from 'phaser';
import { TALENTS, THEME } from '../config.js';
import { t } from '../i18n.js';
import { touchSave } from '../save.js';
import { nextTalentCost, purchaseTalent, talentLevel, talentValue } from '../game/MetaProgression.js';
import { Sfx } from '../audio.js';
import { makeButton, makePanel } from '../ui/widgets.js';
import { UI_FONT, UI_FONT_BOLD, mobileSafeArea, isCjkLocale } from '../ui/layout.js';
import { stripLeadingIcon as stripLabelIcon } from '../ui/labelText.js';

const TALENT_ICONS = {
  vitality: 'icon_core', might: 'icon_battle_emblem', haste: 'icon_gears', focus: 'icon_rune',
  wisdom: 'icon_holyorb', reach: 'icon_magnet', secondWind: 'icon_heal', veteran: 'icon_blade',
  reroll: 'ui_reroll',
};

function stripLeadingIcon(label) {
  return stripLabelIcon(label, '◆♦');
}

function shrinkToWidth(text, maxWidth, minPx) {
  let size = Number.parseFloat(text.style.fontSize);
  while (text.width > maxWidth && size > minPx) text.setFontSize(--size);
  return text;
}

// 字号/尺寸表（逻辑像素）。竖屏 390 宽手机约 ×0.54、横屏 1280×720 约 ×0.56 到屏幕；
// 中文正文 ≥22（竖屏）/ ≥26（横屏），最小不低于 18。横屏 9 个天赋排成 3×3，卡片放大填满留白。
function talentMetrics(portrait, cjk) {
  return portrait ? {
    cols: 2, gap: 12, maxRowH: 236,
    title: cjk ? 40 : 34, subtitle: cjk ? 21 : 17, diamond: 24, pillH: 50,
    name: cjk ? 26 : 21, level: cjk ? 22 : 19, desc: cjk ? 22 : 18, buy: cjk ? 21 : 17,
    icon: 52, pad: 14, chipH: cjk ? 38 : 34, minText: cjk ? 18 : 13,
    backW: 420, backH: 66, backFont: cjk ? 27 : 24,
  } : {
    cols: 3, gap: 24, maxRowH: 270,
    title: cjk ? 56 : 48, subtitle: cjk ? 27 : 23, diamond: 30, pillH: 60,
    name: cjk ? 34 : 28, level: cjk ? 28 : 24, desc: cjk ? 28 : 23, buy: cjk ? 26 : 22,
    icon: 68, pad: 20, chipH: cjk ? 46 : 42, minText: cjk ? 20 : 15,
    backW: 380, backH: 84, backFont: cjk ? 32 : 28,
  };
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
    const cjk = isCjkLocale();
    const m = talentMetrics(portrait, cjk);
    const save = this.registry.get('save');
    this.cameras.main.setBackgroundColor(THEME.bg);
    this.add.tileSprite(0, 0, w, h, 'ground').setOrigin(0).setAlpha(0.38);
    this.add.image(w / 2, h / 2, 'vignette').setDisplaySize(w * 1.3, h * 1.3);

    // 顶栏：标题居中，钻石徽章靠右，与标题同一水平线。
    const titleY = safe.top + m.pillH / 2 + (portrait ? 8 : 20);
    const diamondIcon = Math.round(m.pillH * 0.68);
    const diamondText = this.add.text(0, 0, stripLeadingIcon(t('menu.diamonds', { value: save.diamonds })), {
      fontFamily: UI_FONT_BOLD, fontSize: `${m.diamond}px`, color: THEME.goldCss,
    }).setOrigin(0.5);
    const diamondW = Math.max(portrait ? 128 : 170, diamondText.width + diamondIcon + 52);
    diamondText.setX((diamondIcon + 4) / 2);
    const diamondPill = this.add.container(w - safe.side - diamondW / 2, titleY);
    diamondPill.add(makePanel(this, diamondW, m.pillH, {
      fill: 0x0e1511, line: 0x8c681f, lineWidth: 1, radius: m.pillH / 2, alpha: 0.95, highlight: true,
    }));
    diamondPill.add([
      this.add.image(-diamondW / 2 + 14 + diamondIcon / 2, 0, 'ui_enhance_badge').setDisplaySize(diamondIcon, diamondIcon),
      diamondText,
    ]);

    const title = this.add.text(w / 2, titleY, t('talent.title'), {
      fontFamily: UI_FONT_BOLD, fontSize: `${m.title}px`, color: THEME.goldCss,
      stroke: '#10160f', strokeThickness: portrait ? 5 : 7,
    }).setOrigin(0.5);
    shrinkToWidth(title, w - (diamondW + safe.side + 16) * 2, portrait ? 24 : 30);
    const subtitle = this.add.text(w / 2, titleY + title.height / 2 + (portrait ? 4 : 6), t('talent.subtitle'), {
      fontFamily: UI_FONT, fontSize: `${m.subtitle}px`, color: '#bcd8c1',
      align: 'center', wordWrap: { width: portrait ? w - 60 : w - 120, useAdvancedWrap: true },
    }).setOrigin(0.5, 0);

    // 返回按钮：竖屏不再铺满整行，避开左下角 DOM 版本号徽标。
    const backY = h - safe.bottom - (portrait ? 40 : 50) - m.backH / 2;
    const backW = Math.min(m.backW, w - safe.side * 2);
    makeButton(this, w / 2, backY, backW, m.backH, t('talent.back'), () => this.scene.start('Menu'), {
      fontSize: `${m.backFont}px`, minFontSize: m.minText, fill: 0x141b16, line: 0x8c681f,
      color: '#e6dab2', chamfer: portrait ? 10 : 12, shadow: true,
    });

    const defs = Object.values(TALENTS);
    const cols = m.cols;
    const rows = Math.ceil(defs.length / cols);
    const gap = m.gap;
    const margin = portrait ? safe.side : Math.max(40, w * 0.05);
    const cardW = Math.min(portrait ? 420 : 560, (w - margin * 2 - gap * (cols - 1)) / cols);
    const gridTop = subtitle.y + subtitle.height + (portrait ? 18 : 24);
    const gridBottom = backY - m.backH / 2 - (portrait ? 18 : 24);
    const rowH = Math.min(m.maxRowH, (gridBottom - gridTop - gap * (rows - 1)) / rows);
    const gridH = rows * rowH + (rows - 1) * gap;
    const top = gridTop + Math.max(0, (gridBottom - gridTop - gridH) / 2);
    defs.forEach((def, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const inRow = Math.min(cols, defs.length - row * cols); // 末行不满时居中（竖屏第 9 个）
      const x = w / 2 + (col - (inRow - 1) / 2) * (cardW + gap);
      const y = top + row * (rowH + gap) + rowH / 2;
      this.addTalentCard(x, y, cardW, rowH, def, save, m, portrait, cjk);
    });
  }

  addTalentCard(x, y, cardW, rowH, def, save, m, portrait, cjk) {
    const root = this.add.container(x, y);
    const lv = talentLevel(save, def.key);
    const maxed = lv >= def.maxLv;
    const cost = nextTalentCost(save, def.key);
    const affordable = cost != null && save.diamonds >= cost;
    root.add(makePanel(this, cardW, rowH, {
      fill: maxed ? 0x19231a : 0x111813,
      line: maxed ? THEME.gold : affordable ? 0x6f8a4a : 0x53643d, lineWidth: maxed || affordable ? 2 : 1,
      chamfer: portrait ? 10 : 14, alpha: 0.96, shadow: true, highlight: true,
      highlightAlpha: maxed ? 0.22 : 0.1,
    }));
    const { pad, icon } = m;
    const left = -cardW / 2 + pad;
    const right = cardW / 2 - pad;
    const headerY = -rowH / 2 + pad + icon / 2;
    root.add(this.add.image(left + icon / 2, headerY, TALENT_ICONS[def.key] || 'icon_rune').setDisplaySize(icon, icon));
    const level = this.add.text(right, headerY, `${lv}/${def.maxLv}`, {
      fontFamily: UI_FONT_BOLD, fontSize: `${m.level}px`, color: THEME.goldCss,
    }).setOrigin(1, 0.5);
    const nameX = left + icon + 12;
    const name = this.add.text(nameX, headerY, t(def.nameKey), {
      fontFamily: UI_FONT_BOLD, fontSize: `${m.name}px`, color: maxed ? THEME.goldCss : THEME.text,
    }).setOrigin(0, 0.5);
    shrinkToWidth(name, right - level.width - 10 - nameX, m.minText);
    root.add([level, name]);

    const sepY = -rowH / 2 + pad + icon + (portrait ? 8 : 12);
    const separator = this.add.graphics();
    separator.lineStyle(1, maxed ? THEME.gold : 0x607047, maxed ? 0.35 : 0.24);
    separator.lineBetween(-cardW / 2 + 12, sepY, cardW / 2 - 12, sepY);
    root.add(separator);

    // 购买/满级标签做成小胶囊，可购买时绿底高亮，一眼区分。
    const label = cost == null ? t('talent.max') : t('talent.buy', { cost });
    const chipText = this.add.text(0, 0, label, {
      fontFamily: UI_FONT_BOLD, fontSize: `${m.buy}px`,
      color: maxed ? THEME.goldCss : affordable ? '#b4f7c2' : '#8fa294',
    }).setOrigin(0.5);
    shrinkToWidth(chipText, cardW - pad * 2 - 28, m.minText);
    const chipW = chipText.width + (portrait ? 26 : 34);
    const chipX = right - chipW / 2;
    const chipY = rowH / 2 - pad - m.chipH / 2;
    const chip = makePanel(this, chipW, m.chipH, {
      fill: maxed ? 0x2a2814 : affordable ? 0x24442b : 0x161d18,
      line: maxed ? THEME.gold : affordable ? THEME.green : 0x4a5a4c,
      lineWidth: 1, lineAlpha: affordable || maxed ? 0.9 : 0.6, radius: m.chipH / 2, alpha: 0.95,
    }).setPosition(chipX, chipY);
    chipText.setPosition(chipX, chipY);
    root.add([chip, chipText]);

    // 描述占分隔线与胶囊之间的区域；中文无空格需 advancedWrap 才能折行，放不下再缩字号。
    const rawValue = lv > 0 ? talentValue(save, def.key) : def.values[0];
    const descTop = sepY + (portrait ? 6 : 10);
    const descBottom = chipY - m.chipH / 2 - 4;
    const desc = this.add.text(left, (descTop + descBottom) / 2, t(def.descKey, { value: rawValue }), {
      fontFamily: UI_FONT, fontSize: `${m.desc}px`, color: '#c2dcc6',
      wordWrap: { width: cardW - pad * 2, useAdvancedWrap: true }, align: 'left',
      lineSpacing: portrait ? 2 : 4,
    }).setOrigin(0, 0.5);
    let descSize = m.desc;
    while (desc.height > descBottom - descTop && descSize > m.minText) desc.setFontSize(--descSize);
    root.add(desc);

    if (cost != null) {
      root.setSize(cardW, rowH).setInteractive({ useHandCursor: true });
      root.on('pointerup', () => {
        if (!purchaseTalent(save, def.key)) { Sfx.hurt(); return; }
        touchSave(save);
        Sfx.choose();
        this.scene.restart();
      });
    }
  }
}
