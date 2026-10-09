// 开局主技能选择：全部正式直接技能一次点击进入战斗，无确认层。
// 卡片按设计尺寸排版，再按可用空间统一缩放（只缩不放，避免文字纹理被放大发虚）。
// 竖屏：图标与名称横排、描述通栏（两列×六行）；横屏：图标居中的竖排卡（四列×三行铺满高度）。
import { ACTIVE_SKILL_KEYS, DEFAULT_MAIN_SKILL, SKILLS, THEME } from '../config.js';
import { getLocale, t } from '../i18n.js';
import { Sfx } from '../audio.js';
import { makePanel } from './widgets.js';
import { UI_FONT, UI_FONT_BOLD, isCjkLocale, mobileSafeArea, uiFontSize } from './layout.js';
import { fitTextToBox } from './LevelUpOverlay.js';

// 设计尺寸（逻辑像素）：竖屏 720 宽两列铺满，横屏 1280 高三行铺满。
const PORTRAIT_CARD = { w: 340, h: 220, pad: 12, icon: 96 };
const LANDSCAPE_CARD = { w: 460, h: 336, pad: 16, icon: 124 };
const DESC_COLOR = '#c9d8c4';

export class MainSkillOverlay {
  constructor(scene) {
    this.scene = scene;
    this.safe = mobileSafeArea(scene);
    this.portrait = this.safe.portrait;
    this.card = this.portrait ? PORTRAIT_CARD : LANDSCAPE_CARD;
    this.touchUi = this.portrait || !!scene.sys.game.device.input.touch;
    this.cardScale = 1;
    this.visible = false;
    this.busy = false;
    this.root = scene.add.container(0, 0).setDepth(310).setScrollFactor(0).setVisible(false);
    this.dim = scene.add.rectangle(0, 0, 10, 10, 0x050806, this.portrait ? 0.86 : 0.88)
      .setOrigin(0).setInteractive();
    const zh = getLocale() === 'zh-CN';
    const cjk = isCjkLocale();
    this.title = scene.add.text(0, 0, zh ? '选择主技能' : 'CHOOSE YOUR MAIN SKILL', {
      fontFamily: UI_FONT_BOLD, color: THEME.goldCss,
      fontSize: this.portrait ? uiFontSize(34, 42) : uiFontSize(46, 52),
      stroke: '#120e07', strokeThickness: this.portrait ? 6 : 7, align: 'center',
    }).setOrigin(0.5);
    this.subtitle = scene.add.text(0, 0, zh ? '点击一个技能，立即开始战斗' : 'Pick one skill to begin the run', {
      fontFamily: cjk ? UI_FONT_BOLD : UI_FONT, color: THEME.sub, align: 'center',
      fontSize: this.portrait ? uiFontSize(19, 23) : uiFontSize(24, 27),
      stroke: '#0b0f0c', strokeThickness: 3,
    }).setOrigin(0.5);
    this.root.add([this.dim, this.title, this.subtitle]);

    const displayKeys = [DEFAULT_MAIN_SKILL, ...ACTIVE_SKILL_KEYS.filter(key => key !== DEFAULT_MAIN_SKILL)];
    this.cards = displayKeys.map(key => this.buildCard(key));
    this._onKeyDown = event => {
      if (this.visible && event.key === 'Enter') this.pick(DEFAULT_MAIN_SKILL);
    };
    scene.input.keyboard?.on('keydown', this._onKeyDown);
    this.layout();
  }

  buildCard(key) {
    const scene = this.scene;
    const def = SKILLS[key];
    const { w, h, pad, icon: iconSize } = this.card;
    const cjk = isCjkLocale();
    const card = scene.add.container(0, 0);
    const frame = makePanel(scene, w, h, {
      fill: 0x111a13, line: def.color, lineWidth: 2, chamfer: 12,
      shadow: true, highlight: true, alpha: 0.97,
    });
    // 图标底：深色圆角框 + 技能主色微光，让新图标在暗色卡面上更突出。
    const iconX = this.portrait ? -w / 2 + pad + iconSize / 2 : 0;
    const iconY = -h / 2 + pad + iconSize / 2;
    const glow = scene.add.graphics();
    glow.fillStyle(0x070a08, 0.9);
    glow.fillRoundedRect(iconX - iconSize / 2 - 3, iconY - iconSize / 2 - 3, iconSize + 6, iconSize + 6, 14);
    glow.fillStyle(def.color, 0.1);
    glow.fillCircle(iconX, iconY, iconSize * 0.44);
    glow.lineStyle(2, def.color, 0.55);
    glow.strokeRoundedRect(iconX - iconSize / 2 - 3, iconY - iconSize / 2 - 3, iconSize + 6, iconSize + 6, 14);
    const icon = scene.add.image(iconX, iconY, def.icon).setDisplaySize(iconSize, iconSize);
    const name = scene.add.text(0, 0, t(def.nameKey), {
      fontFamily: UI_FONT_BOLD, color: THEME.text, align: this.portrait ? 'left' : 'center',
      stroke: '#0a0d0b', strokeThickness: 3,
    });
    const description = scene.add.text(0, 0, t(def.descKey), {
      fontFamily: UI_FONT, color: DESC_COLOR, align: this.portrait ? 'left' : 'center',
    });
    const right = w / 2 - pad - 2;
    if (this.portrait) {
      // 名称在图标右侧垂直居中；描述在图标下方通栏左对齐，CJK 两行放得下全部中文描述。
      const nameX = iconX + iconSize / 2 + 14;
      name.setOrigin(0, 0.5).setPosition(nameX, iconY);
      fitTextToBox(name, {
        width: right - nameX, height: iconSize - 8,
        fontSize: cjk ? 31 : 26, minFontSize: cjk ? 22 : 17, maxLines: 2, lineSpacing: 0, preferSingleLine: cjk,
      });
      const descTop = iconY + iconSize / 2 + 10;
      description.setOrigin(0, 0).setPosition(-w / 2 + pad + 2, descTop);
      fitTextToBox(description, {
        width: w - pad * 2 - 4, height: h / 2 - pad + 2 - descTop,
        fontSize: cjk ? 22 : 20, minFontSize: cjk ? 19 : 15, maxLines: 3, lineSpacing: 3,
      });
    } else {
      // 名称优先单行；长语言放不下时折成两行，描述随名称实际高度下移，互不重叠。
      const nameTop = iconY + iconSize / 2 + 12;
      name.setOrigin(0.5, 0).setPosition(0, nameTop);
      fitTextToBox(name, {
        width: w - pad * 2 - 8, height: 84, fontSize: cjk ? 36 : 31, minFontSize: cjk ? 24 : 18,
        maxLines: 2, lineSpacing: 0, preferSingleLine: true, singleLineMin: cjk ? 26 : 22,
      });
      const descTop = nameTop + name.height + 4;
      description.setOrigin(0.5, 0).setPosition(0, descTop);
      fitTextToBox(description, {
        width: w - pad * 2 - 12, height: h / 2 - pad - descTop,
        fontSize: cjk ? 27 : 23, minFontSize: cjk ? 21 : 16, maxLines: 4, lineSpacing: 4,
      });
    }
    card.add([frame, glow, icon, name, description]);
    if (key === DEFAULT_MAIN_SKILL) {
      const defaultFrame = scene.add.rectangle(0, 0, w - 8, h - 8, 0x000000, 0)
        .setStrokeStyle(4, THEME.gold, 0.95);
      const defaultStar = scene.add.text(w / 2 - 22, -h / 2 + 21, '★', {
        fontFamily: UI_FONT_BOLD, fontSize: this.portrait ? '26px' : '30px', color: THEME.goldCss,
      }).setOrigin(0.5);
      card.add([defaultFrame, defaultStar]);
    }
    card.setSize(w, h).setInteractive({ useHandCursor: true });
    // 交互缩放都以布局缩放为基准，避免悬停/按压把缩放后的卡片弹回 1 倍。
    card.on('pointerover', () => {
      if (this.touchUi || !this.visible || this.busy) return;
      scene.tweens.add({ targets: card, scale: this.cardScale * 1.035, duration: 90 });
    });
    card.on('pointerout', () => {
      if (!this.visible || this.busy) return;
      scene.tweens.add({ targets: card, scale: this.cardScale, duration: 90 });
    });
    card.on('pointerdown', () => {
      if (this.visible && !this.busy) card.setScale(this.cardScale * 0.97);
    });
    card.on('pointerup', () => {
      if (!this.visible || this.busy) return;
      Sfx.uiClick();
      this.pick(key);
    });
    card.skillKey = key;
    card.nameText = name;
    card.description = description;
    this.root.add(card);
    return card;
  }

  show(onPick) {
    this.onPick = onPick;
    this.busy = false;
    this.visible = true;
    for (const card of this.cards) {
      this.scene.tweens.killTweensOf(card);
      card.setAlpha(1).setScale(this.cardScale).setInteractive({ useHandCursor: true });
    }
    this.root.setVisible(true);
    Sfx.levelup();
  }

  pick(key) {
    if (!this.visible || this.busy || !SKILLS[key]) return;
    this.busy = true;
    this.visible = false;
    Sfx.choose();
    for (const card of this.cards) {
      this.scene.tweens.killTweensOf(card);
      card.disableInteractive();
      card.setScale(this.cardScale).setAlpha(card.skillKey === key ? 1 : 0.35);
    }
    const selected = this.cards.find(card => card.skillKey === key);
    this.scene.tweens.add({
      targets: selected, scale: this.cardScale * 1.06, duration: 100, yoyo: true,
      onComplete: () => {
        this.root.setVisible(false);
        this.onPick?.(key);
      },
    });
  }

  // 在候选列数里选缩放最大的一种（并列时保留默认列数），保证 12 张卡一屏放下且尽量大。
  gridFor(columnsList, availableW, availableH, gapX, gapY) {
    const { w: cardW, h: cardH } = this.card;
    let best = null;
    for (const columns of columnsList) {
      const rows = Math.ceil(this.cards.length / columns);
      const gridW = cardW * columns + gapX * (columns - 1);
      const gridH = cardH * rows + gapY * (rows - 1);
      const scale = Math.min(1, availableW / gridW, availableH / gridH);
      if (!best || scale > best.scale + 0.02) best = { columns, rows, scale };
    }
    return best;
  }

  layout() {
    const w = this.scene.scale.width, h = this.scene.scale.height;
    const { w: cardW, h: cardH } = this.card;
    this.dim.setSize(w, h);
    const headerTop = this.safe.top;
    this.title.setPosition(w / 2, headerTop + (this.portrait ? 40 : 54));
    this.subtitle.setPosition(w / 2, headerTop + (this.portrait ? 84 : 110));
    const gridTop = headerTop + (this.portrait ? 106 : 144);
    const gapX = this.portrait ? 12 : 22;
    const gapY = this.portrait ? 8 : 20;
    const availableW = w - this.safe.side * 2;
    // 底部留出 DOM 版本号角标的位置（约 46 逻辑像素），避免压住最后一行卡片。
    const availableH = h - gridTop - this.safe.bottom - (this.portrait ? 26 : 30);
    const { columns, rows, scale } = this.gridFor(this.portrait ? [2, 3] : [4, 3, 6], availableW, availableH, gapX, gapY);
    this.cardScale = scale;
    const stepX = cardW * scale + gapX * scale;
    const stepY = cardH * scale + gapY * scale;
    const gridW = stepX * columns - gapX * scale;
    const gridH = stepY * rows - gapY * scale;
    const left = (w - gridW) / 2 + cardW * scale / 2;
    const top = gridTop + Math.max(0, (availableH - gridH) / 2) + cardH * scale / 2;
    this.cards.forEach((card, index) => {
      const col = index % columns, row = Math.floor(index / columns);
      card.setPosition(left + col * stepX, top + row * stepY).setScale(scale);
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
