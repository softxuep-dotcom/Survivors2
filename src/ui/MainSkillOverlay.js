// 开局主技能选择：全部正式直接技能一次点击进入战斗，无确认层。
import { ACTIVE_SKILL_KEYS, DEFAULT_MAIN_SKILL, SKILLS, THEME } from '../config.js';
import { getLocale, t } from '../i18n.js';
import { Sfx } from '../audio.js';
import { makeButton } from './widgets.js';
import { UI_FONT, UI_FONT_BOLD, mobileSafeArea } from './layout.js';

const CARD_W = 270;
const CARD_H = 210;

export class MainSkillOverlay {
  constructor(scene) {
    this.scene = scene;
    this.safe = mobileSafeArea(scene);
    this.portrait = this.safe.portrait;
    this.visible = false;
    this.busy = false;
    this.root = scene.add.container(0, 0).setDepth(310).setScrollFactor(0).setVisible(false);
    this.dim = scene.add.rectangle(0, 0, 10, 10, 0x050806, this.portrait ? 0.84 : 0.88)
      .setOrigin(0).setInteractive();
    const zh = getLocale() === 'zh-CN';
    this.title = scene.add.text(0, 0, zh ? '选择主技能' : 'CHOOSE YOUR MAIN SKILL', {
      fontFamily: UI_FONT_BOLD, fontSize: this.portrait ? '31px' : '38px', color: THEME.goldCss,
      stroke: '#120e07', strokeThickness: this.portrait ? 5 : 6, align: 'center',
    }).setOrigin(0.5);
    this.subtitle = scene.add.text(0, 0, zh ? '点击一个技能，立即开始战斗' : 'Pick one skill to begin the run', {
      fontFamily: UI_FONT, fontSize: this.portrait ? '15px' : '18px', color: THEME.sub, align: 'center',
    }).setOrigin(0.5);
    this.root.add([this.dim, this.title, this.subtitle]);

    const displayKeys = [DEFAULT_MAIN_SKILL, ...ACTIVE_SKILL_KEYS.filter(key => key !== DEFAULT_MAIN_SKILL)];
    this.cards = displayKeys.map((key) => {
      const def = SKILLS[key];
      const card = makeButton(scene, 0, 0, CARD_W, CARD_H, t(def.nameKey), () => this.pick(key), {
        fontSize: '21px', minFontSize: 13, fill: 0x111a13, line: def.color,
        color: THEME.text, chamfer: 12, shadow: true,
        icon: def.icon, iconSize: 76, iconX: 0, iconY: -54,
      });
      card.label.setPosition(0, 27).setWordWrapWidth(244, true).setMaxLines(2);
      const description = scene.add.text(0, 71, t(def.descKey), {
        fontFamily: UI_FONT, fontSize: '15px', color: '#b9cbb7', align: 'center',
        wordWrap: { width: 238, useAdvancedWrap: true },
      }).setOrigin(0.5).setMaxLines(2);
      card.add(description);
      card.skillKey = key;
      card.description = description;
      if (key === DEFAULT_MAIN_SKILL) {
        const defaultFrame = scene.add.rectangle(0, 0, CARD_W - 8, CARD_H - 8, 0x000000, 0)
          .setStrokeStyle(4, THEME.gold, 0.95);
        const defaultStar = scene.add.text(-CARD_W / 2 + 18, -CARD_H / 2 + 15, '★', {
          fontFamily: UI_FONT_BOLD, fontSize: '21px', color: THEME.goldCss,
        }).setOrigin(0.5);
        card.add([defaultFrame, defaultStar]);
      }
      this.root.add(card);
      return card;
    });
    this._onKeyDown = event => {
      if (this.visible && event.key === 'Enter') this.pick(DEFAULT_MAIN_SKILL);
    };
    scene.input.keyboard?.on('keydown', this._onKeyDown);
    this.layout();
  }

  show(onPick) {
    this.onPick = onPick;
    this.busy = false;
    this.visible = true;
    for (const card of this.cards) card.setAlpha(1).setInteractive({ useHandCursor: true });
    this.root.setVisible(true);
    Sfx.levelup();
  }

  pick(key) {
    if (!this.visible || this.busy || !SKILLS[key]) return;
    this.busy = true;
    this.visible = false;
    Sfx.choose();
    for (const card of this.cards) {
      card.disableInteractive();
      card.setAlpha(card.skillKey === key ? 1 : 0.35);
    }
    const selected = this.cards.find(card => card.skillKey === key);
    this.scene.tweens.add({
      targets: selected, scale: (selected.scale || 1) * 1.06, duration: 100, yoyo: true,
      onComplete: () => {
        this.root.setVisible(false);
        this.onPick?.(key);
      },
    });
  }

  layout() {
    const w = this.scene.scale.width, h = this.scene.scale.height;
    this.dim.setSize(w, h);
    this.title.setPosition(w / 2, this.safe.top + (this.portrait ? 46 : 50));
    this.subtitle.setPosition(w / 2, this.safe.top + (this.portrait ? 82 : 96));
    if (this.portrait) {
      const columns = 2;
      const rows = Math.ceil(this.cards.length / columns);
      const gap = 10;
      const cardW = Math.min(CARD_W, (w - this.safe.side * 2 - gap) / columns);
      const availableH = h - this.safe.top - this.safe.bottom - 122;
      const cardH = Math.min(CARD_H, (availableH - gap * (rows - 1)) / rows);
      const scale = Math.min(cardW / CARD_W, cardH / CARD_H);
      const gridW = CARD_W * scale * columns + gap * (columns - 1);
      const gridH = CARD_H * scale * rows + gap * (rows - 1);
      const left = (w - gridW) / 2 + CARD_W * scale / 2;
      const top = this.safe.top + 106 + Math.max(0, (availableH - gridH) / 2);
      this.cards.forEach((card, index) => {
        const col = index % columns, row = Math.floor(index / columns);
        card.setPosition(left + col * (CARD_W * scale + gap), top + CARD_H * scale / 2 + row * (CARD_H * scale + gap)).setScale(scale);
      });
      return;
    }
    const columns = Math.min(4, Math.ceil(this.cards.length / 2));
    const rows = Math.ceil(this.cards.length / columns);
    const gap = 16;
    const scale = Math.min(1,
      (w - 36) / (CARD_W * columns + gap * (columns - 1)),
      (h - 160) / (CARD_H * rows + gap * (rows - 1)));
    const gridW = CARD_W * scale * columns + gap * (columns - 1);
    const gridH = CARD_H * scale * rows + gap * (rows - 1);
    const left = (w - gridW) / 2 + CARD_W * scale / 2;
    const top = 126 + Math.max(0, (h - 126 - gridH) / 2);
    this.cards.forEach((card, index) => {
      const col = index % columns, row = Math.floor(index / columns);
      card.setPosition(left + col * (CARD_W * scale + gap), top + CARD_H * scale / 2 + row * (CARD_H * scale + gap)).setScale(scale);
    });
  }

  hide() {
    this.visible = false;
    this.busy = false;
    this.root.setVisible(false);
  }

  destroy() {
    this.scene.input.keyboard?.off('keydown', this._onKeyDown);
    this.root.destroy(true);
  }
}
