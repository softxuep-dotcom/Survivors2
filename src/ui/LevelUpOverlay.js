// 升级四选一覆盖层：竖屏使用全宽横向技能卡，横屏四卡并排。
// 横屏逻辑高度固定 1280，卡片按此设计尺寸排版（原 224×310 只占屏幕一小块，中文仅约 9 CSS 像素）。
import Phaser from 'phaser';
import { WEAPONS, EVOLUTIONS, SKILLS, PASSIVES, THEME, MAXED_BONUS } from '../config.js';
import { t } from '../i18n.js';
import { Sfx } from '../audio.js';
import { makeButton } from './widgets.js';
import { UI_FONT, UI_FONT_BOLD, isCjkLocale, mobileSafeArea, uiFontSize } from './layout.js';
import { TOUCH_ONLY_HINTS } from './controlHints.js';

const DESKTOP_CARD_W = 390;
const DESKTOP_CARD_H = 490;
const DESKTOP_GAP = 28;
const DESKTOP_ICON_BOX = 160;
const CARD_FILL = 0x111a13;
const CARD_LINE = 0x49633e;
const CARD_SUB = '#c9d8c4';
const BADGE_FILL = 0x26351d;
const BADGE_H = 42;

// ---- 中文换行 ----
// Phaser 的 advancedWordWrap 只在空格处断行：中文里夹一个“Boss”或“+5.1”就会整段甩到下一行。
// CJK 语言改用自定义回调：汉字/假名之间可断，拉丁单词与数字保持整体，并做简单避头尾。
// 韩文按空格分词断行（符合韩文排版习惯），因此谚文不计入可任意断行的字符。
// 注意：抖音 Android VM 不支持 Unicode 属性转义，这里只用显式码段。
const CJK_BREAKABLE = /[\u2E80-\u2FFF\u3000-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]/;
const NO_LINE_START = '，。、：；！？）」』》〉】〕…·・ーぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ%％,.:;!?)]}';
const NO_LINE_END = '（「『《〈【〔([{“‘';

function wrapTokens(paragraph) {
  const tokens = [];
  let word = '';
  for (const ch of paragraph) {
    const space = ch === ' ' || ch === '\t';
    if (space || CJK_BREAKABLE.test(ch)) {
      if (word) tokens.push(word);
      word = '';
      tokens.push(space ? ' ' : ch);
    } else {
      word += ch;
    }
  }
  if (word) tokens.push(word);
  return tokens;
}

export function wrapCjkLines(text, context, width) {
  const lines = [];
  const measure = parts => context.measureText(parts.join('')).width;
  for (const paragraph of String(text).split('\n')) {
    const rows = [];
    let line = [];
    const flush = () => {
      while (line.length && line[line.length - 1] === ' ') line.pop();
      rows.push(line);
      line = [];
    };
    for (const token of wrapTokens(paragraph)) {
      if (token === ' ' && !line.length) continue;
      if (!line.length || measure([...line, token]) <= width) {
        // 单个拉丁长词比整行还宽时按字符硬拆，保证不溢出。
        if (!line.length && token.length > 1 && measure([token]) > width) {
          let chunk = '';
          for (const ch of token) {
            if (chunk && measure([chunk + ch]) > width) {
              rows.push([chunk]);
              chunk = '';
            }
            chunk += ch;
          }
          line = [chunk];
        } else {
          line.push(token);
        }
        continue;
      }
      if (token === ' ') {
        flush();
        continue;
      }
      // 避头：标点不能出现在行首，把上一行末字一起带下来；避尾：开括号不留在行尾。
      const carry = [];
      while (carry.length < 3 && line.length > 1 && line[line.length - 1] !== ' ' && NO_LINE_START.includes((carry[0] ?? token)[0])) {
        carry.unshift(line.pop());
      }
      while (line.length > 1 && NO_LINE_END.includes(line[line.length - 1])) carry.unshift(line.pop());
      flush();
      line = [...carry, token];
    }
    flush();
    // 末行只剩一个汉字（孤字）时，从上一行借一个字下来，如“传染毒/素”→“传染/毒素”。
    const last = rows[rows.length - 1];
    const prev = rows[rows.length - 2];
    const lonely = last && last.every(tok => tok.length === 1 && CJK_BREAKABLE.test(tok))
      && last.filter(tok => !NO_LINE_START.includes(tok)).length === 1;
    if (lonely && prev && prev.length > 3) {
      let moved = 0;
      while (moved < 2 && prev.length > 3 && prev[prev.length - 1] !== ' ') {
        last.unshift(prev.pop());
        moved++;
        if (!NO_LINE_START.includes(last[0][0])) break;
      }
    }
    for (const row of rows) lines.push(row.join(''));
  }
  return lines;
}

// 统一设置换行宽度：CJK 语言走自定义回调，其他语言沿用 Phaser 高级换行。
export function setTextWrap(text, width) {
  if (isCjkLocale() && width > 0) {
    text.setWordWrapWidth(width, true);
    text.setWordWrapCallback((value, textObject) => wrapCjkLines(value, textObject.context, width));
  } else {
    text.setWordWrapCallback(null);
    text.setWordWrapWidth(width > 0 ? width : null, width > 0);
  }
  return text;
}

// 换行时单词被硬拆（如德语“FLAMMENSPU/R”）也算放不下：最长的不可断词必须整体放进一行。
function wordsFit(text, width) {
  const context = text.context;
  for (const paragraph of String(text.text).split('\n')) {
    for (const token of wrapTokens(paragraph)) {
      if (token.length > 1 && context.measureText(token).width > width + 1) return false;
    }
  }
  return true;
}

// 字号逐级缩小直到放进文本框；最小字号仍放不下时才截断行数。供其他覆盖层复用。
// preferSingleLine：名称类短文本先尝试在 singleLineMin 以上缩字号放进一行（避免“ブレードス/トーム”词中折行），放不下再换行。
export function fitTextToBox(text, {
  width, height, fontSize, minFontSize, maxLines = 0, wrap = true, lineSpacing = 2,
  preferSingleLine = false, singleLineMin = minFontSize,
}) {
  text.setMaxLines(0).setLineSpacing(lineSpacing);
  const fits = () => text.width <= width + 1 && text.height <= height + 1;
  if (wrap && preferSingleLine) {
    setTextWrap(text, 0);
    for (let size = fontSize; size >= singleLineMin; size--) {
      text.setFontSize(size);
      if (fits()) return;
    }
  }
  setTextWrap(text, wrap ? width : 0);
  for (let size = fontSize; size >= minFontSize; size--) {
    text.setFontSize(size);
    if (fits() && (!wrap || wordsFit(text, width))) return;
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
    this.cjk = isCjkLocale();
    this.cardW = this.portrait ? Math.min(scene.scale.width - 36, 680) : DESKTOP_CARD_W;
    this.cardH = this.portrait
      ? Math.min(250, Math.max(212, scene.scale.height * 0.16))
      : DESKTOP_CARD_H;

    this.root = scene.add.container(0, 0).setDepth(200).setScrollFactor(0).setVisible(false);
    this.dim = scene.add.rectangle(0, 0, 10, 10, 0x050806, this.portrait ? 0.74 : 0.8)
      .setOrigin(0).setInteractive();
    this.rays = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.title = scene.add.text(0, 0, '', {
      fontFamily: UI_FONT_BOLD,
      fontSize: this.portrait ? uiFontSize(51, 54) : uiFontSize(48, 54),
      color: THEME.goldCss,
      stroke: '#160f05',
      strokeThickness: 8,
      shadow: { offsetY: 5, color: '#000000', blur: 8, fill: true },
      align: 'center',
    }).setOrigin(0.5);
    this.subtitle = scene.add.text(0, 0, '', {
      fontFamily: UI_FONT_BOLD,
      fontSize: this.portrait ? uiFontSize(21, 24) : uiFontSize(24, 28),
      color: '#f1eee4',
      stroke: '#0b0f0c',
      strokeThickness: 5,
      align: 'center',
    }).setOrigin(0.5);
    this.root.add([this.dim, this.rays, this.title, this.subtitle]);

    // 重摇按钮：图标单独放在左侧，文字在剩余宽度内居中并自动缩小。
    const rerollW = this.portrait ? 400 : 440;
    const rerollH = this.portrait ? 72 : 74;
    this.rerollH = rerollH;
    this.rerollFont = this.portrait ? (this.cjk ? 25 : 22) : (this.cjk ? 28 : 24);
    this.rerollMinFont = this.cjk ? 19 : 14;
    this.reroll = makeButton(scene, 0, 0, rerollW, rerollH, '', () => {
      if (!this.busy) this.rerollAction?.();
    }, {
      fontSize: `${this.rerollFont}px`,
      minFontSize: this.rerollMinFont,
      fill: 0x151c16,
      line: 0xa67a28,
      lineWidth: 2,
      color: '#eadab4',
      radius: 24,
      shadow: true,
    }).setVisible(false);
    const rerollIconSize = 40;
    const rerollIconX = -rerollW / 2 + 22 + rerollIconSize / 2;
    this.rerollIcon = scene.add.image(rerollIconX, 0, 'ui_reroll').setDisplaySize(rerollIconSize, rerollIconSize);
    this.reroll.add(this.rerollIcon);
    const labelLeft = rerollIconX + rerollIconSize / 2 + 10;
    this.rerollLabelX = (labelLeft + rerollW / 2 - 18) / 2;
    this.rerollLabelW = rerollW / 2 - 18 - labelLeft;
    this.reroll.label.setX(this.rerollLabelX);
    this.root.add(this.reroll);

    this.cards = [];
    for (let i = 0; i < 4; i++) this.cards.push(this.buildCard(i));

    this.keyHandler = (event) => {
      if (!this.visible || this.busy) return;
      const idx = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[event.code];
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
      .setDisplaySize(this.portrait ? 50 : 46, this.portrait ? 50 : 46)
      .setAlpha(0);

    let geo;
    if (this.portrait) {
      // 竖屏横卡：左图标；右侧上排名称 + 等级徽章，分隔线下为效果描述（在剩余区域垂直居中）。
      const iconSize = Math.min(150, cardH - 52);
      const iconX = -cardW / 2 + iconSize / 2 + 22;
      const copyX = -cardW / 2 + iconSize + 46;
      const headY = -cardH / 2 + 46;
      const sepY = -cardH / 2 + 84;
      geo = {
        iconSize, iconBox: iconSize, iconX, iconY: 0, copyX, headY, sepY,
        right: cardW / 2 - 28, descTop: sepY + 12, descBottom: cardH / 2 - 20,
      };
    } else {
      // 横屏竖卡：图标框在上，徽章压在图标框下沿，名称、分隔线、描述依次向下。
      const iconBox = DESKTOP_ICON_BOX;
      const iconY = -cardH / 2 + 22 + iconBox / 2;
      const iconBottom = iconY + iconBox / 2;
      geo = {
        iconSize: iconBox - 14, iconBox, iconX: 0, iconY, copyX: 0,
        badgeY: iconBottom + 6, nameY: iconBottom + 70, sepY: iconBottom + 120,
        descTop: iconBottom + 136, descBottom: cardH / 2 - 22,
      };
    }
    const icon = scene.add.image(geo.iconX, geo.iconY, 'icon_blade').setDisplaySize(geo.iconSize - 10, geo.iconSize - 10);
    let badge;
    let name;
    let desc;
    if (this.portrait) {
      name = scene.add.text(geo.copyX, geo.headY, '', {
        fontFamily: UI_FONT_BOLD, color: THEME.text, align: 'left',
        stroke: '#0a0d0b', strokeThickness: 3,
      }).setOrigin(0, 0.5);
      badge = scene.add.text(geo.right - 60, geo.headY, '', {
        fontFamily: UI_FONT_BOLD, color: '#d7e99d', align: 'center',
      }).setOrigin(0.5);
      desc = scene.add.text(geo.copyX, (geo.descTop + geo.descBottom) / 2, '', {
        fontFamily: UI_FONT, color: CARD_SUB, align: 'left',
      }).setOrigin(0, 0.5);
      arrow.setPosition(cardW / 2 - 24, cardH / 2 - 28);
    } else {
      badge = scene.add.text(0, geo.badgeY, '', {
        fontFamily: UI_FONT_BOLD, color: '#d7e99d', align: 'center',
      }).setOrigin(0.5);
      name = scene.add.text(0, geo.nameY, '', {
        fontFamily: UI_FONT_BOLD, color: THEME.text, align: 'center',
        stroke: '#0a0d0b', strokeThickness: 3,
      }).setOrigin(0.5);
      desc = scene.add.text(0, geo.descTop, '', {
        fontFamily: UI_FONT, color: CARD_SUB, align: 'center',
      }).setOrigin(0.5, 0);
      arrow.setPosition(cardW / 2 - 26, cardH / 2 - 28);
    }
    const hotkey = scene.add.text(-cardW / 2 + 15, -cardH / 2 + 10, `${index + 1}`, {
      fontFamily: UI_FONT_BOLD, fontSize: this.portrait ? '19px' : '21px', color: '#8fa58f',
    }).setVisible(!TOUCH_ONLY_HINTS);

    card.parts = {
      frame, iconFrame, badgeFrame, separator, arrow, icon, badge, name, desc, hotkey, geo,
      badgeW: 120, accent: THEME.green,
    };
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
    const { frame, iconFrame, badgeFrame, separator, arrow, accent, geo, badgeW } = card.parts;
    const cardW = this.cardW;
    const cardH = this.cardH;
    const line = active ? THEME.gold : CARD_LINE;
    const radius = this.portrait ? 22 : 20;
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
    const { iconBox, iconX, iconY } = geo;
    iconFrame.fillStyle(0x090d0a, 0.94);
    iconFrame.fillRoundedRect(iconX - iconBox / 2, iconY - iconBox / 2, iconBox, iconBox, 18);
    iconFrame.fillStyle(accent, active ? 0.14 : 0.08);
    iconFrame.fillCircle(iconX, iconY, iconBox * 0.4);
    iconFrame.lineStyle(2, active ? THEME.gold : accent, active ? 0.9 : 0.72);
    iconFrame.strokeRoundedRect(iconX - iconBox / 2, iconY - iconBox / 2, iconBox, iconBox, 18);

    badgeFrame.clear();
    const badgeX = this.portrait ? geo.right - badgeW : -badgeW / 2;
    const badgeY = (this.portrait ? geo.headY : geo.badgeY) - BADGE_H / 2;
    badgeFrame.fillStyle(BADGE_FILL, 0.98);
    badgeFrame.fillRoundedRect(badgeX, badgeY, badgeW, BADGE_H, BADGE_H / 2);
    badgeFrame.lineStyle(1, active ? THEME.gold : accent, active ? 0.75 : 0.55);
    badgeFrame.strokeRoundedRect(badgeX, badgeY, badgeW, BADGE_H, BADGE_H / 2);

    separator.clear();
    separator.lineStyle(1, active ? THEME.gold : accent, active ? 0.4 : 0.24);
    if (this.portrait) separator.lineBetween(geo.copyX, geo.sepY, geo.right, geo.sepY);
    else separator.lineBetween(-cardW / 2 + 28, geo.sepY, cardW / 2 - 28, geo.sepY);
    arrow.setAlpha(active ? 1 : 0);
  }

  // CJK 字号下限：正文 ≥20、徽章 ≥18、名称 ≥22（逻辑像素），手机上约 11 CSS 像素以上。
  // 徽章宽度随文字伸缩（“∞ 可无限叠加”比“Lv 2”长得多），名称占用剩余宽度。
  fitCardCopy(card) {
    const { badge, name, desc, geo } = card.parts;
    const cjk = this.cjk;
    if (this.portrait) {
      fitTextToBox(badge, {
        width: 200, height: BADGE_H - 6, fontSize: cjk ? 22 : 19, minFontSize: cjk ? 18 : 13,
        maxLines: 1, wrap: false, lineSpacing: 0,
      });
      card.parts.badgeW = Math.max(108, Math.ceil(badge.width) + 30);
      badge.setX(geo.right - card.parts.badgeW / 2);
      fitTextToBox(name, {
        width: geo.right - card.parts.badgeW - 14 - geo.copyX, height: 60,
        fontSize: cjk ? 33 : 28, minFontSize: cjk ? 22 : 16, maxLines: 2, lineSpacing: 0, preferSingleLine: cjk,
      });
      fitTextToBox(desc, {
        width: geo.right - geo.copyX, height: geo.descBottom - geo.descTop,
        fontSize: cjk ? 24 : 21, minFontSize: cjk ? 20 : 14, maxLines: 4, lineSpacing: 4,
      });
      return;
    }
    fitTextToBox(badge, {
      width: this.cardW - 70, height: BADGE_H - 6, fontSize: cjk ? 24 : 21, minFontSize: cjk ? 18 : 13,
      maxLines: 1, wrap: false, lineSpacing: 0,
    });
    card.parts.badgeW = Math.min(this.cardW - 40, Math.max(132, Math.ceil(badge.width) + 34));
    fitTextToBox(name, {
      width: this.cardW - 36, height: 84, fontSize: cjk ? 36 : 31, minFontSize: cjk ? 24 : 17,
      maxLines: 2, lineSpacing: 0, preferSingleLine: cjk,
    });
    fitTextToBox(desc, {
      width: this.cardW - 40, height: geo.descBottom - geo.descTop,
      fontSize: cjk ? 28 : 24, minFontSize: cjk ? 22 : 15, maxLines: 5, lineSpacing: 4,
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
      badge.setText(choice.toLv === 1 ? t('levelup.newPassive') : t('levelup.lvup', { lv: choice.toLv }));
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
    this.fitCardCopy(card);
    this.drawCard(card, false);
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
    // 文字限定在重摇图标右侧；长语言（俄/德）先缩字号，仍太长则折成两行，不再缩到难以辨认。
    fitTextToBox(this.reroll.label, {
      width: this.rerollLabelW, height: this.rerollH - 12, fontSize: this.rerollFont, minFontSize: this.rerollMinFont,
      maxLines: 2, lineSpacing: 0, preferSingleLine: true, singleLineMin: this.rerollFont - 5,
    });

    for (let i = 0; i < this.cards.length; i++) {
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
    const count = Math.max(1, Math.min(this.cards.length, this.choices.length || this.cards.length));
    // 标题/副标题按实际高度排版：CJK 字号更大、长语言副标题可能折行，都不会压到卡片。
    setTextWrap(this.title, w - (this.portrait ? 42 : 80));
    setTextWrap(this.subtitle, w - (this.portrait ? 56 : 120));
    const titleH = this.title.height;
    const subtitleH = this.subtitle.height;
    if (this.portrait) {
      const gap = count > 3 ? 10 : 16;
      const headerH = titleH + subtitleH + 30;
      const availableH = h - this.safe.top - this.safe.bottom - headerH - 112;
      const scale = Math.min(1, availableH / (this.cardH * count + gap * (count - 1)));
      const scaledGap = gap * scale;
      const totalH = this.cardH * scale * count + scaledGap * (count - 1);
      const top = Math.max(this.safe.top + headerH, (h - totalH) / 2 - 12);
      const titleY = top - headerH + titleH / 2;
      this.title.setPosition(w / 2, titleY);
      this.subtitle.setPosition(w / 2, titleY + titleH / 2 + 6 + subtitleH / 2);
      drawRays(this.rays, w / 2, titleY, Math.min(w, 590));
      this._layoutScale = scale;
      for (let i = 0; i < this.cards.length; i++) {
        this.cards[i].setPosition(w / 2, top + this.cardH * scale / 2 + i * (this.cardH * scale + scaledGap)).setScale(scale);
      }
      this.reroll.setPosition(w / 2, Math.min(h - this.safe.bottom - 40, top + totalH + 60));
      return;
    }

    // 横屏：标题、四张卡、重摇按钮作为一个整体垂直居中；只在窄屏/矮屏时整体缩小卡片。
    const headerH = titleH + subtitleH + 36;
    const rerollSpace = 124;
    const totalW = DESKTOP_CARD_W * count + DESKTOP_GAP * (count - 1);
    const scale = Math.min(1, (w - 40) / totalW,
      (h - this.safe.top - this.safe.bottom - headerH - rerollSpace) / DESKTOP_CARD_H);
    this._layoutScale = scale;
    const cardsH = DESKTOP_CARD_H * scale;
    const blockTop = Math.max(this.safe.top, (h - headerH - cardsH - rerollSpace) / 2);
    const titleY = blockTop + titleH / 2;
    this.title.setPosition(w / 2, titleY);
    this.subtitle.setPosition(w / 2, titleY + titleH / 2 + 8 + subtitleH / 2);
    drawRays(this.rays, w / 2, titleY, Math.min(w * 0.55, 820));
    const cardsY = blockTop + headerH + cardsH / 2;
    for (let i = 0; i < this.cards.length; i++) {
      const x = w / 2 + (i - (count - 1) / 2) * (DESKTOP_CARD_W + DESKTOP_GAP) * scale;
      this.cards[i].setPosition(x, cardsY).setScale(scale);
    }
    this.reroll.setPosition(w / 2, Math.min(h - this.safe.bottom - 40, cardsY + cardsH / 2 + 66));
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
