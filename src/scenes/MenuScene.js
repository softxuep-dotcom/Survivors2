import Phaser from 'phaser';
import { THEME, DIFFICULTIES, CHARACTERS, WEAPONS, AD_REWARDS } from '../config.js';
import { t, fmtTime, getLocale, setLocale, LOCALES } from '../i18n.js';
import { unlockAudio, setMuted, isMuted, Sfx } from '../audio.js';
import { touchSave } from '../save.js';
import { Platform } from '../platform.js';
import { isCharacterUnlocked, unlockCharacter, selectedCharacter } from '../game/MetaProgression.js';
import { enemyAtlasKey, enemyFrameKey } from '../textures.js';
import { makeButton, makePanel } from '../ui/widgets.js';
import { StartBoostOverlay } from '../ui/StartBoostOverlay.js';
import { UI_FONT, UI_FONT_BOLD, mobileSafeArea, uiFontSize, isCjkLocale } from '../ui/layout.js';
import { stripLeadingIcon } from '../ui/labelText.js';
import { controlHint } from '../ui/controlHints.js';

// 单行文字超宽时逐级缩小（不低于 minPx），用于长语言（de/ru）兜底，正常情况下不触发。
function shrinkToWidth(text, maxWidth, minPx) {
  let size = Number.parseFloat(text.style.fontSize);
  while (text.width > maxWidth && size > minPx) text.setFontSize(--size);
  return text;
}

const DEFAULT_START_BUFF = 'fury';
const GAME_NAME = typeof __GAME_NAME__ === 'string' ? __GAME_NAME__ : 'Horde Spark';
const GOLD_DARK = 0x8c681f;
const CTA_FILL = 0xc99a28;
const CTA_LINE = 0xffe29a;
const CTA_TEXT = '#15180e';
// 首页预览按角色的实际非透明边界缩放，不能直接比较两套不同尺寸的帧画布。
const HERO_PREVIEW_VISIBLE_Y = Object.freeze({
  knight: Object.freeze({ top: 22, bottom: 150 }),
  witch: Object.freeze({ top: 0, bottom: 112 }),
});

function chamferedPoints(w, h, cut, offsetY = 0) {
  const x = w / 2;
  const y = h / 2;
  return [
    { x: -x + cut, y: -y + offsetY }, { x: x - cut, y: -y + offsetY },
    { x, y: -y + cut + offsetY }, { x, y: y - cut + offsetY },
    { x: x - cut, y: y + offsetY }, { x: -x + cut, y: y + offsetY },
    { x: -x, y: y - cut + offsetY }, { x: -x, y: -y + cut + offsetY },
  ];
}

function makeChamferedPanel(scene, w, h, {
  fill, line, lineWidth = 2, alpha = 0.97, cut = 14, selected = false,
} = {}) {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, selected ? 0.5 : 0.3);
  g.fillPoints(chamferedPoints(w, h, cut, 7), true);
  g.fillStyle(fill, alpha);
  g.fillPoints(chamferedPoints(w, h, cut), true);
  g.lineStyle(lineWidth, line, selected ? 1 : 0.72);
  g.strokePoints(chamferedPoints(w, h, cut), true, true);
  g.lineStyle(1, selected ? 0xfff1a6 : line, selected ? 0.42 : 0.16);
  g.strokePoints(chamferedPoints(w - 12, h - 12, Math.max(5, cut - 5)), true, true);
  return g;
}

function addAtmosphere(scene, w, h, portrait) {
  const haze = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  const cx = portrait ? w / 2 : w * 0.3;
  const cy = portrait ? h * 0.36 : h * 0.52;
  const radius = Math.min(portrait ? w * 0.56 : h * 0.5, 430);
  haze.fillStyle(0x6f9a5c, 0.045);
  haze.fillCircle(cx, cy, radius * 1.28);
  haze.fillStyle(THEME.gold, 0.035);
  haze.fillCircle(cx, cy, radius * 0.74);

  const enemySpecs = portrait
    ? [
      ['boss', 0.09, 0.17, 0.11, 0.05], ['boss', 0.9, 0.17, 0.11, 0.05],
      ['slime', 0.08, 0.28, 0.09, 0.16], ['slime', 0.92, 0.31, 0.1, 0.13],
      ['slime', 0.05, 0.89, 0.11, 0.12], ['slime', 0.93, 0.87, 0.1, 0.1],
    ]
    : [
      ['boss', 0.06, 0.26, 0.16, 0.05], ['slime', 0.48, 0.12, 0.08, 0.12],
      ['slime', 0.47, 0.88, 0.1, 0.09], ['boss', 0.94, 0.77, 0.15, 0.04],
    ];
  for (const [type, nx, ny, scale, alpha] of enemySpecs) {
    const texture = enemyAtlasKey(type);
    const frame = enemyFrameKey(type, type === 'boss' ? 'left' : 'front', 1);
    if (!scene.textures.exists(texture)) continue;
    scene.add.image(w * nx, h * ny, texture, frame)
      .setScale(scale).setAlpha(alpha).setTint(0x70866d);
  }

  const specks = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  for (let i = 0; i < 16; i++) {
    const x = ((i * 137) % Math.max(1, w - 40)) + 20;
    const y = ((i * 223) % Math.max(1, h - 100)) + 50;
    specks.fillStyle(i % 4 === 0 ? THEME.gold : 0x7faf78, 0.11 + (i % 3) * 0.04);
    specks.fillCircle(x, y, 1 + (i % 3) * 0.5);
  }
}

function addBrand(scene, x, y, width, portrait) {
  const chineseBrand = /[\u3400-\u9fff]/u.test(GAME_NAME);
  // \u6a2a\u5c4f\u753b\u9762\u7559\u767d\u5927\uff0c\u6807\u9898\u653e\u5927\u5230 \u226492\uff08\u539f 61\uff09\uff0c\u9876\u90e8\u88c5\u9970\u7ebf\u968f\u5b57\u53f7\u4e0a\u79fb\u3002
  const fontPx = chineseBrand ? Math.min(72, width / (GAME_NAME.length + 1))
    : portrait ? Math.min(66, width / 6.25) : Math.min(92, width / 9.4);
  const ornament = scene.add.graphics();
  const lineY = y - (portrait && !chineseBrand ? 64 : chineseBrand ? 46 : Math.round(46 * Math.max(1, fontPx / 61)));
  ornament.lineStyle(1, THEME.gold, 0.55);
  ornament.lineBetween(x - width * 0.38, lineY, x - 20, lineY);
  ornament.lineBetween(x + 20, lineY, x + width * 0.38, lineY);
  ornament.fillStyle(THEME.gold, 0.9);
  ornament.fillTriangle(x, lineY - 16, x - 5, lineY + 3, x + 5, lineY + 3);
  ornament.fillRect(x - 2, lineY - 28, 4, 36);
  ornament.fillTriangle(x - 10, lineY - 16, x + 10, lineY - 16, x, lineY - 8);
  ornament.fillTriangle(x, lineY + 9, x - 5, lineY + 2, x + 5, lineY + 2);

  const label = GAME_NAME === 'Horde Spark' ? (portrait ? 'HORDE\nSPARK' : 'HORDE SPARK') : GAME_NAME;
  const title = scene.add.text(x, y, label, {
    fontFamily: UI_FONT_BOLD,
    fontSize: `${fontPx}px`,
    color: '#ece8db',
    stroke: '#15160f',
    strokeThickness: portrait ? 7 : Math.max(8, Math.round(fontPx / 8)),
    align: 'center',
    lineSpacing: portrait ? -18 : 0,
    shadow: { offsetY: 6, color: '#000000', blur: 9, fill: true },
  }).setOrigin(0.5);

  ornament.lineStyle(2, GOLD_DARK, 0.7);
  const bottomY = y + title.height / 2 + (portrait ? 7 : 10);
  ornament.lineBetween(x - width * 0.29, bottomY, x - 8, bottomY);
  ornament.lineBetween(x + 8, bottomY, x + width * 0.29, bottomY);
  ornament.fillStyle(THEME.gold, 0.76);
  ornament.fillPoints([
    { x, y: bottomY - 5 }, { x: x + 6, y: bottomY },
    { x, y: bottomY + 5 }, { x: x - 6, y: bottomY },
  ], true);
  return title;
}

function addSectionLabel(scene, x, y, label, width, fontSize = 16) {
  const text = scene.add.text(x, y, label, {
    fontFamily: UI_FONT_BOLD, fontSize: `${fontSize}px`, color: '#f4e2ad',
    stroke: '#0a0e0b', strokeThickness: Math.max(3, Math.round(fontSize / 7)),
  }).setOrigin(0.5).setDepth(1);
  shrinkToWidth(text, width - 100, Math.min(fontSize, 14));
  // 两侧装饰线按实际文字宽度留白，字号变大或长语言时不压字。
  const lineW = Math.max(30, (width - text.width - 64) / 2);
  const g = scene.add.graphics();
  g.lineStyle(1, THEME.gold, 0.45);
  g.lineBetween(x - width / 2, y, x - width / 2 + lineW, y);
  g.lineBetween(x + width / 2 - lineW, y, x + width / 2, y);
  g.fillStyle(THEME.gold, 0.8);
  for (const markX of [x - width / 2 + lineW + 7, x + width / 2 - lineW - 7]) {
    g.fillPoints([
      { x: markX, y: y - 4 }, { x: markX + 4, y },
      { x: markX, y: y + 4 }, { x: markX - 4, y },
    ], true);
  }
  return text;
}

function makePrimaryButton(scene, x, y, w, h, label, onClick, fontSize) {
  const button = scene.add.container(x, y);
  const glow = scene.add.graphics();
  glow.fillStyle(THEME.gold, 0.07);
  glow.fillPoints(chamferedPoints(w + 18, h + 18, 22), true);
  glow.lineStyle(2, THEME.gold, 0.28);
  glow.strokePoints(chamferedPoints(w + 10, h + 10, 19), true, true);
  const panel = makeChamferedPanel(scene, w, h, {
    fill: CTA_FILL, line: CTA_LINE, lineWidth: 3, alpha: 1, cut: 17, selected: true,
  });
  const shine = scene.add.graphics();
  shine.fillStyle(0xfff2b2, 0.1);
  shine.fillPoints(chamferedPoints(w - 16, h * 0.42, 8, -h * 0.2), true);
  const text = scene.add.text(0, 0, label, {
    fontFamily: UI_FONT_BOLD, fontSize: `${fontSize}px`, color: CTA_TEXT,
    stroke: '#f5d879', strokeThickness: 1, align: 'center',
  }).setOrigin(0.5);
  let nextSize = fontSize;
  while (text.width > w - 42 && nextSize > 18) text.setFontSize(--nextSize);
  button.add([glow, panel, shine, text]);
  button.setSize(w, h).setInteractive({ useHandCursor: true });
  button.on('pointerover', () => scene.tweens.add({ targets: button, scale: 1.025, duration: 100 }));
  button.on('pointerout', () => scene.tweens.add({ targets: button, scale: 1, duration: 100 }));
  button.on('pointerdown', () => button.setScale(0.98));
  button.on('pointerup', () => { button.setScale(1); Sfx.uiClick(); onClick?.(); });
  scene.tweens.add({ targets: glow, alpha: { from: 0.58, to: 1 }, duration: 900, yoyo: true, repeat: -1 });
  return button;
}

// 角色特性行：最多两行，超出时缩字号（中文不低于 18）。布局前先量出所有卡片的最大高度，
// 让两张卡的徽章/名字对齐（日文、俄文等长文案会折成两行）。
function makePerkText(scene, def, unlocked, selected, w, portrait) {
  const cjk = isCjkLocale();
  const k = w / (portrait ? 280 : 330);
  const perkPx = Math.round((portrait ? (cjk ? 22 : 17) : (cjk ? 26 : 21)) * Math.min(1, k));
  const perk = scene.add.text(0, 0, unlocked ? t(def.descKey) : t('menu.locked', { cost: def.cost }), {
    fontFamily: UI_FONT,
    fontSize: `${perkPx}px`,
    color: selected ? '#e6dcb8' : '#c2dcc6',
    align: 'center',
    wordWrap: { width: w - 24, useAdvancedWrap: true },
  }).setOrigin(0.5, 0);
  let perkSize = perkPx;
  while (perk.height > perkPx * 2.6 && perkSize > (cjk ? 18 : 13)) perk.setFontSize(--perkSize);
  return perk;
}

function heroPerkSlot(scene, save, characters, w, portrait) {
  return Math.max(0, ...characters.map((def) => {
    const probe = makePerkText(scene, def, isCharacterUnlocked(save, def.key), false, w, portrait);
    const height = probe.height;
    probe.destroy();
    return height;
  }));
}

function makeHeroCard(scene, x, y, w, h, def, unlocked, selected, onSelect, portrait, perkSlot = 0) {
  const root = scene.add.container(x, y);
  const accent = selected ? THEME.gold : def.color;
  root.add(makeChamferedPanel(scene, w, h, {
    fill: selected ? 0x20271d : 0x121814,
    line: accent, lineWidth: selected ? 3 : 2,
    cut: portrait ? 14 : 17, selected,
  }));

  // 名字/特性按卡片宽度等比放大（横屏卡片更大，中文另给更大字号），文字块贴卡片底部，
  // 徽章压在文字块上方，角色立绘用剩下的高度，避免文字下方大片空白。
  const cjk = isCjkLocale();
  const k = w / (portrait ? 280 : 330);
  const namePx = Math.round((portrait ? (cjk ? 30 : 25) : (cjk ? 36 : 30)) * Math.min(1, k));
  const name = scene.add.text(0, 0, t(def.nameKey), {
    fontFamily: UI_FONT_BOLD,
    fontSize: `${namePx}px`,
    color: unlocked ? (selected ? THEME.goldCss : THEME.text) : '#718077',
    stroke: '#0a0d0b', strokeThickness: cjk ? 4 : 3,
  }).setOrigin(0.5, 0);
  shrinkToWidth(name, w - 20, cjk ? 20 : 15);
  const perk = makePerkText(scene, def, unlocked, selected, w, portrait);
  const blockBottom = h / 2 - Math.round(h * 0.045);
  perk.setY(blockBottom - Math.max(perk.height, perkSlot));
  name.setY(perk.y - 2 - name.height);
  const badgeR = Math.round((portrait ? 26 : 32) * k);
  const badgeY = name.y - 6 - badgeR;

  const heroBaselineY = badgeY - badgeR * 0.2;
  const heroVisibleHeight = Math.min(w * 0.8, heroBaselineY + h / 2 - 16);
  const inner = scene.add.graphics();
  inner.fillStyle(accent, selected ? 0.08 : 0.035);
  inner.fillCircle(0, heroBaselineY - heroVisibleHeight * 0.48, Math.min(w * 0.44, heroVisibleHeight * 0.56));
  root.add(inner);

  const visibleY = HERO_PREVIEW_VISIBLE_Y[def.key]
    || { top: 0, bottom: scene.textures.getFrame(def.texture, 0)?.realHeight || 1 };
  const heroScale = heroVisibleHeight / Math.max(1, visibleY.bottom - visibleY.top);
  const hero = scene.add.sprite(0, heroBaselineY - visibleY.bottom * heroScale, def.texture, 0)
    .setOrigin(0.5, 0)
    .setScale(heroScale)
    .setAlpha(unlocked ? 1 : 0.34);
  if (unlocked && def.walkAnimation && scene.anims.exists(def.walkAnimation)) hero.play(def.walkAnimation);
  root.add(hero);

  const badge = scene.add.graphics();
  badge.fillStyle(selected ? 0x2b321d : 0x151b16, 0.98);
  badge.lineStyle(2, accent, selected ? 1 : 0.72);
  badge.fillCircle(0, badgeY, badgeR);
  badge.strokeCircle(0, badgeY, badgeR);
  root.add(badge);
  if (selected) {
    root.add(scene.add.text(0, badgeY, '✓', {
      fontFamily: UI_FONT_BOLD, fontSize: `${Math.round(badgeR * 1.08)}px`, color: THEME.goldCss,
    }).setOrigin(0.5));
  } else {
    const weaponIcon = WEAPONS[def.startWeapon]?.icon || 'icon_blade';
    const iconSize = Math.round(badgeR * 1.2);
    root.add(scene.add.image(0, badgeY, weaponIcon).setDisplaySize(iconSize, iconSize).setAlpha(unlocked ? 0.9 : 0.35));
  }
  root.add([name, perk]);

  root.setSize(w, h).setInteractive({ useHandCursor: true });
  root.on('pointerover', () => scene.tweens.add({ targets: root, scale: 1.025, duration: 100 }));
  root.on('pointerout', () => scene.tweens.add({ targets: root, scale: 1, duration: 100 }));
  root.on('pointerdown', () => root.setScale(0.98));
  root.on('pointerup', () => { root.setScale(1); onSelect(); });
  return root;
}

function makeDifficultySelector(scene, x, y, width, height, current) {
  const root = scene.add.container(x, y);
  root.add(makePanel(scene, width, height, {
    fill: 0x101612, line: GOLD_DARK, lineWidth: 1, alpha: 0.93, radius: height / 2,
  }));
  const segmentW = width / 3;
  Object.keys(DIFFICULTIES).forEach((key, i) => {
    const selected = key === current;
    const sx = (i - 1) * segmentW;
    if (selected) {
      root.add(makePanel(scene, segmentW - 4, height - 4, {
        fill: 0x31452c, line: THEME.gold, lineWidth: 1, alpha: 0.98, radius: height / 2 - 2,
        highlight: true,
      }).setX(sx));
    }
    const zone = scene.add.zone(sx, 0, segmentW, height).setInteractive({ useHandCursor: true });
    const label = scene.add.text(sx, 0, t(`difficulty.${key}`), {
      fontFamily: UI_FONT_BOLD,
      fontSize: `${Math.round(height * (isCjkLocale() ? 0.4 : 0.34))}px`,
      color: selected ? THEME.text : '#c4bd9f',
    }).setOrigin(0.5);
    shrinkToWidth(label, segmentW - 16, 12);
    zone.on('pointerup', () => {
      if (key === current) return;
      Sfx.uiClick();
      scene.registry.set('difficulty', key);
      scene.scene.restart();
    });
    root.add([zone, label]);
  });
  return root;
}

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    this._onResize = () => {
      this._resizeTimer?.remove();
      this._resizeTimer = this.time.delayedCall(120, () => this.scene.restart());
    };
    this.scale.on('resize', this._onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this._onResize);
      this.boostOverlay?.destroy();
    });

    const w = this.scale.width;
    const h = this.scale.height;
    const safe = mobileSafeArea(this);
    const portrait = safe.portrait;
    const save = this.registry.get('save');
    const difficulty = this.registry.get('difficulty') || 'easy';
    const chosen = selectedCharacter(save);
    const characters = Object.values(CHARACTERS);
    const savedStartBuff = this.registry.get('startBuff');
    this.selectedStartBuff = AD_REWARDS.startBuffs[savedStartBuff] ? savedStartBuff : DEFAULT_START_BUFF;
    this.registry.set('startBuff', this.selectedStartBuff);

    this.cameras.main.setBackgroundColor(THEME.bg);
    this.add.tileSprite(0, 0, w, h, 'ground').setOrigin(0).setAlpha(0.32);
    this.add.image(w / 2, h / 2, 'vignette').setDisplaySize(w * 1.35, h * 1.35).setAlpha(1);
    addAtmosphere(this, w, h, portrait);

    // 钻石数字原 17–18 逻辑像素（屏幕上约 9–10 CSS px），放大到 24/28 并同步加高徽章。
    const diamondH = portrait ? 50 : 56;
    const diamondIcon = Math.round(diamondH * 0.7);
    const diamondText = this.add.text(0, 0, `${save.diamonds}`, {
      fontFamily: UI_FONT_BOLD,
      fontSize: portrait ? '24px' : '28px',
      color: '#f2e6bd',
    }).setOrigin(0.5);
    const diamondW = Math.max(portrait ? 128 : 144, diamondText.width + diamondIcon + 52);
    diamondText.setX((diamondIcon + 4) / 2);
    const diamondBadge = this.add.container(w - safe.side - diamondW / 2, safe.top + (portrait ? 26 : 30));
    diamondBadge.add(makePanel(this, diamondW, diamondH, {
      fill: 0x0e1511, line: GOLD_DARK, lineWidth: 1, alpha: 0.94, radius: diamondH / 2,
    }));
    diamondBadge.add([
      this.add.image(-diamondW / 2 + 14 + diamondIcon / 2, 0, 'ui_enhance_badge').setDisplaySize(diamondIcon, diamondIcon),
      diamondText,
    ]);

    if (portrait) this.createPortraitLayout({ w, h, safe, save, difficulty, chosen, characters });
    else this.createLandscapeLayout({ w, h, safe, save, difficulty, chosen, characters });

    this.boostOverlay = new StartBoostOverlay(this);
    this.installFooterTools(w, h, safe, save, portrait);

    const startRun = async (startBuff = this.selectedStartBuff) => {
      if (this.adBusy) return;
      this.adBusy = true;
      unlockAudio();
      try {
        if (Platform.supportsPrerollAds()) await Platform.prerollAd();
      } finally {
        this.adBusy = false;
        this.input.enabled = true;
      }
      this.scene.start('Game', { difficulty: this.registry.get('difficulty') || difficulty, character: selectedCharacter(save), startBuff });
    };
    this.startRun = startRun;
    this.input.keyboard?.once('keydown-ENTER', () => { if (!this.adBusy) startRun(); });
    this.input.keyboard?.once('keydown-SPACE', () => { if (!this.adBusy) startRun(); });
    this.input.once('pointerdown', unlockAudio);
  }

  createPortraitLayout({ w, h, safe, save, difficulty, chosen, characters }) {
    // Shift the entire menu below a native mini-game capsule, preserving the
    // spacing between the logo, records and character cards.
    const offsetY = Math.max(0, safe.top - 18);
    const firstChild = this.children.list.length;
    h -= offsetY;
    safe = { ...safe, top: 18 };
    const cjk = isCjkLocale();
    const contentW = Math.min(w - safe.side * 2 - 24, 620);
    addBrand(this, w / 2, safe.top + h * 0.075, Math.min(contentW, 500), true);

    const best = save.bestTime ? t('menu.bestValue', { time: fmtTime(save.bestTime), kills: save.bestKills }) : t('menu.none');
    this.addBestPill(w / 2, h * 0.19, `${t('menu.best')}  ${best}`, contentW, true);
    addSectionLabel(this, w / 2, h * 0.25, t('menu.character'), contentW * 0.9, cjk ? 25 : 20);

    // 竖屏 390 宽手机约 ×0.54：中文正文 ≥22、按钮 ≥23 逻辑像素，卡片同步加宽。
    const cardGap = 18;
    const cardW = Math.min(280, (contentW - cardGap) / 2);
    const cardH = Math.min(400, h * 0.3);
    const cardY = h * 0.43;
    const perkSlot = heroPerkSlot(this, save, characters, cardW, true);
    characters.forEach((def, i) => {
      const unlocked = isCharacterUnlocked(save, def.key);
      const x = w / 2 + (i - (characters.length - 1) / 2) * (cardW + cardGap);
      makeHeroCard(this, x, cardY, cardW, cardH, def, unlocked, chosen === def.key, () => {
        this.selectCharacter(save, def, unlocked);
      }, true, perkSlot);
    });

    makeDifficultySelector(this, w / 2, h * 0.655, contentW * 0.94, 60, difficulty);
    const start = makePrimaryButton(this, w / 2, h * 0.75, contentW * 0.8, 88, t('menu.start'), () => {
      if (!this.adBusy) this.startRun?.();
    }, cjk ? 38 : 31);
    start.setDepth(2);

    const secondaryY = h * 0.838;
    const secondaryGap = 16;
    const secondaryW = (contentW * 0.94 - secondaryGap) / 2;
    const secondaryH = 60;
    const secondaryStyle = (icon) => ({
      fontSize: uiFontSize(18, 23), minFontSize: cjk ? 18 : 13, fill: 0x121a15, line: GOLD_DARK,
      color: '#e6dab2', radius: secondaryH / 2, icon, iconX: -secondaryW / 2 + 32, iconSize: 34,
      iconSpace: 62, labelOffsetX: 15,
    });
    makeButton(this, w / 2 - (secondaryW + secondaryGap) / 2, secondaryY, secondaryW, secondaryH, stripLeadingIcon(t('menu.startBoost')),
      () => this.showStartBoost(), secondaryStyle('ui_enhance_badge'));
    makeButton(this, w / 2 + (secondaryW + secondaryGap) / 2, secondaryY, secondaryW, secondaryH, t('menu.talents'),
      () => this.scene.start('Talents'), secondaryStyle('icon_rune'));
    this.add.text(w / 2, h * 0.888, controlHint('menu.howto'), {
      fontFamily: UI_FONT, fontSize: uiFontSize(16, 20), color: '#93ab97', align: 'center',
      wordWrap: { width: contentW, useAdvancedWrap: true },
    }).setOrigin(0.5);
    if (offsetY) for (const child of this.children.list.slice(firstChild)) {
      if (!child.parentContainer) child.y += offsetY;
    }
  }

  createLandscapeLayout({ w, h, safe, save, difficulty, chosen, characters }) {
    // 横屏逻辑高度固定 1280，屏幕上只有 ×0.56–0.84：组件整体放大填满空白，
    // 两栏以画面中线对称收拢，超宽屏不会被拉得过散。
    const cjk = isCjkLocale();
    const colOffset = Math.min(w * 0.22, 560);
    const leftX = w / 2 - colOffset;
    const rightX = w / 2 + colOffset;
    const leftW = Math.min(colOffset * 2 - 60, 900);
    const rightW = Math.min(colOffset * 2 - 80, 640);
    addBrand(this, leftX, h * 0.14, leftW * 0.9, false);
    const best = save.bestTime ? t('menu.bestValue', { time: fmtTime(save.bestTime), kills: save.bestKills }) : t('menu.none');
    this.addBestPill(leftX, h * 0.29, `${t('menu.best')}  ${best}`, leftW, false);
    const sectionY = h * 0.375;
    addSectionLabel(this, leftX, sectionY, t('menu.character'), leftW * 0.86, cjk ? 29 : 24);

    const cardGap = 24;
    const cardW = Math.min(350, (leftW - cardGap) / 2);
    const cardH = Math.min(530, h * 0.42, cardW * 1.55);
    const cardY = sectionY + 46 + cardH / 2;
    const perkSlot = heroPerkSlot(this, save, characters, cardW, false);
    characters.forEach((def, i) => {
      const unlocked = isCharacterUnlocked(save, def.key);
      const x = leftX + (i - (characters.length - 1) / 2) * (cardW + cardGap);
      makeHeroCard(this, x, cardY, cardW, cardH, def, unlocked, chosen === def.key, () => {
        this.selectCharacter(save, def, unlocked);
      }, false, perkSlot);
    });

    addSectionLabel(this, rightX, h * 0.29, t('difficulty.label'), rightW * 0.94, cjk ? 29 : 24);
    makeDifficultySelector(this, rightX, h * 0.375, rightW * 0.94, 72, difficulty);
    const start = makePrimaryButton(this, rightX, h * 0.53, rightW * 0.9, 116, t('menu.start'), () => {
      if (!this.adBusy) this.startRun?.();
    }, cjk ? 46 : 40);
    start.setDepth(2);
    const btnW = rightW * 0.78;
    const btnH = 76;
    const secondaryStyle = (icon) => ({
      fontSize: uiFontSize(24, 28), minFontSize: cjk ? 20 : 15, fill: 0x121a15, line: GOLD_DARK,
      color: '#e6dab2', radius: btnH / 2, icon, iconX: -btnW / 2 + 42, iconSize: 44,
      iconSpace: 80, labelOffsetX: 20,
    });
    makeButton(this, rightX, h * 0.69, btnW, btnH, stripLeadingIcon(t('menu.startBoost')),
      () => this.showStartBoost(), secondaryStyle('ui_enhance_badge'));
    makeButton(this, rightX, h * 0.8, btnW, btnH, t('menu.talents'),
      () => this.scene.start('Talents'), secondaryStyle('icon_rune'));
    this.add.text(rightX, h * 0.885, controlHint('menu.howto'), {
      fontFamily: UI_FONT, fontSize: uiFontSize(19, 24), color: '#93ab97', align: 'center',
      wordWrap: { width: rightW, useAdvancedWrap: true },
    }).setOrigin(0.5);
  }

  addBestPill(x, y, label, maxW, portrait) {
    const cjk = isCjkLocale();
    const pillH = portrait ? (cjk ? 50 : 44) : (cjk ? 58 : 52);
    const iconSize = Math.round(pillH * 0.62);
    const text = this.add.text(0, 0, label, {
      fontFamily: UI_FONT_BOLD,
      fontSize: portrait ? uiFontSize(16, 21) : uiFontSize(20, 26),
      color: '#ddd3b0',
    }).setOrigin(0.5);
    shrinkToWidth(text, maxW - iconSize - 56, cjk ? 18 : 13);
    // 左 16 内边距 + 图标 + 12 间距 + 文字 + 右 24 内边距；文字在图标右侧剩余区域居中。
    const width = Math.min(maxW, Math.max(portrait ? 240 : 280, text.width + iconSize + 52));
    text.setX((iconSize + 4) / 2);
    const pill = this.add.container(x, y);
    pill.add(makePanel(this, width, pillH, {
      fill: 0x0e1511, line: GOLD_DARK, lineWidth: 1, alpha: 0.9, radius: pillH / 2,
    }));
    pill.add([
      this.add.image(-width / 2 + 16 + iconSize / 2, 0, 'ui_enhance_badge').setDisplaySize(iconSize, iconSize),
      text,
    ]);
  }

  selectCharacter(save, def, unlocked) {
    if (!unlocked && !unlockCharacter(save, def.key)) { Sfx.hurt(); return; }
    save.selectedCharacter = def.key;
    touchSave(save);
    Sfx.choose();
    this.scene.restart();
  }

  showStartBoost() {
    if (this.adBusy) return;
    this.boostOverlay.show((key) => {
      this.selectedStartBuff = key;
      this.registry.set('startBuff', key);
    }, this.selectedStartBuff);
  }

  installFooterTools(w, h, safe, save, portrait) {
    // 底部左下角有 DOM 版本号徽标（约 25 CSS px 高），按钮底边留出 ≥48 逻辑像素避免压住。
    const toolH = portrait ? 56 : 58;
    const toolY = h - safe.bottom - (portrait ? 64 : 70);
    const muteW = portrait ? 66 : 74;
    this.muteBtn = makeButton(this, safe.side + muteW / 2, toolY, muteW, toolH, isMuted() ? '🔇' : '🔊', () => {
      const next = !isMuted();
      setMuted(next);
      touchSave(save, { muted: next });
      this.muteBtn.label.setText(next ? '🔇' : '🔊');
    }, { fontSize: portrait ? '24px' : '26px', fill: 0x101612, line: GOLD_DARK, radius: toolH / 2 });

    const localeIndex = Math.max(0, LOCALES.findIndex(l => l.code === getLocale()));
    const localeInfo = LOCALES[localeIndex];
    const localeW = portrait ? 108 : 122;
    makeButton(this, w - safe.side - localeW / 2, toolY, localeW, toolH, `🌐 ${localeInfo.short}`, () => {
      setLocale(LOCALES[(localeIndex + 1) % LOCALES.length].code);
      this.scene.restart();
    }, {
      fontSize: portrait ? uiFontSize(19, 21) : uiFontSize(21, 23), minFontSize: 14,
      fill: 0x101612, line: GOLD_DARK, radius: toolH / 2,
    });
  }
}
