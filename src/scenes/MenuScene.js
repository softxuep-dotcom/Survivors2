import Phaser from 'phaser';
import { THEME, DIFFICULTIES, CHARACTERS, WEAPONS, AD_REWARDS } from '../config.js';
import { t, fmtTime, getLocale, setLocale, LOCALES } from '../i18n.js';
import { unlockAudio, setMuted, isMuted, Sfx } from '../audio.js';
import { touchSave } from '../save.js';
import { isCharacterUnlocked, unlockCharacter, selectedCharacter } from '../game/MetaProgression.js';
import { enemyAtlasKey, enemyFrameKey } from '../textures.js';
import { makeButton, makePanel } from '../ui/widgets.js';
import { StartBoostOverlay } from '../ui/StartBoostOverlay.js';
import { UI_FONT, UI_FONT_BOLD, mobileSafeArea } from '../ui/layout.js';

const DEFAULT_START_BUFF = 'fury';
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

function stripLeadingIcon(label) {
  return label.replace(/^\s*[\p{Extended_Pictographic}\uFE0F\u200D]+\s*/u, '');
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
  const ornament = scene.add.graphics();
  const lineY = y - (portrait ? 64 : 46);
  ornament.lineStyle(1, THEME.gold, 0.55);
  ornament.lineBetween(x - width * 0.38, lineY, x - 20, lineY);
  ornament.lineBetween(x + 20, lineY, x + width * 0.38, lineY);
  ornament.fillStyle(THEME.gold, 0.9);
  ornament.fillTriangle(x, lineY - 16, x - 5, lineY + 3, x + 5, lineY + 3);
  ornament.fillRect(x - 2, lineY - 28, 4, 36);
  ornament.fillTriangle(x - 10, lineY - 16, x + 10, lineY - 16, x, lineY - 8);
  ornament.fillTriangle(x, lineY + 9, x - 5, lineY + 2, x + 5, lineY + 2);

  const title = scene.add.text(x, y, portrait ? 'HORDE\nSPARK' : 'HORDE SPARK', {
    fontFamily: UI_FONT_BOLD,
    fontSize: portrait ? `${Math.min(66, width / 6.25)}px` : `${Math.min(61, width / 9.4)}px`,
    color: '#ece8db',
    stroke: '#15160f',
    strokeThickness: portrait ? 7 : 8,
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
  const lineW = Math.max(38, (width - 160) / 2);
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
  return scene.add.text(x, y, label, {
    fontFamily: UI_FONT_BOLD, fontSize: `${fontSize}px`, color: '#f4e2ad',
    stroke: '#0a0e0b', strokeThickness: 3,
  }).setOrigin(0.5);
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

function makeHeroCard(scene, x, y, w, h, def, unlocked, selected, onSelect, portrait) {
  const root = scene.add.container(x, y);
  const accent = selected ? THEME.gold : def.color;
  root.add(makeChamferedPanel(scene, w, h, {
    fill: selected ? 0x20271d : 0x121814,
    line: accent, lineWidth: selected ? 3 : 2,
    cut: portrait ? 14 : 17, selected,
  }));

  const inner = scene.add.graphics();
  inner.fillStyle(accent, selected ? 0.08 : 0.035);
  inner.fillCircle(0, -h * 0.2, Math.min(w, h) * 0.42);
  root.add(inner);

  const heroVisibleHeight = Math.min(w * 0.78, h * (portrait ? 0.52 : 0.54));
  const heroBaselineY = h * 0.11;
  const visibleY = HERO_PREVIEW_VISIBLE_Y[def.key]
    || { top: 0, bottom: scene.textures.getFrame(def.texture, 0)?.realHeight || 1 };
  const heroScale = heroVisibleHeight / Math.max(1, visibleY.bottom - visibleY.top);
  const hero = scene.add.sprite(0, heroBaselineY - visibleY.bottom * heroScale, def.texture, 0)
    .setOrigin(0.5, 0)
    .setScale(heroScale)
    .setAlpha(unlocked ? 1 : 0.34);
  if (unlocked && def.walkAnimation && scene.anims.exists(def.walkAnimation)) hero.play(def.walkAnimation);
  root.add(hero);

  const badgeY = h * 0.12;
  const badge = scene.add.graphics();
  badge.fillStyle(selected ? 0x2b321d : 0x151b16, 0.98);
  badge.lineStyle(2, accent, selected ? 1 : 0.72);
  badge.fillCircle(0, badgeY, portrait ? 24 : 28);
  badge.strokeCircle(0, badgeY, portrait ? 24 : 28);
  root.add(badge);
  if (selected) {
    root.add(scene.add.text(0, badgeY, '✓', {
      fontFamily: UI_FONT_BOLD, fontSize: portrait ? '25px' : '29px', color: THEME.goldCss,
    }).setOrigin(0.5));
  } else {
    const weaponIcon = WEAPONS[def.startWeapon]?.icon || 'icon_blade';
    root.add(scene.add.image(0, badgeY, weaponIcon).setDisplaySize(portrait ? 28 : 32, portrait ? 28 : 32).setAlpha(unlocked ? 0.9 : 0.35));
  }

  root.add(scene.add.text(0, h * 0.27, t(def.nameKey), {
    fontFamily: UI_FONT_BOLD,
    fontSize: portrait ? '22px' : '25px',
    color: unlocked ? (selected ? THEME.goldCss : THEME.text) : '#718077',
    stroke: '#0a0d0b', strokeThickness: 3,
  }).setOrigin(0.5));
  root.add(scene.add.text(0, h * 0.37, unlocked ? t(def.descKey) : t('menu.locked', { cost: def.cost }), {
    fontFamily: UI_FONT,
    fontSize: portrait ? '12px' : '13px',
    color: selected ? '#dfd3ac' : THEME.sub,
    align: 'center',
    wordWrap: { width: w - 22 },
  }).setOrigin(0.5));

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
      fontSize: `${Math.max(12, Math.min(17, height * 0.36))}px`,
      color: selected ? THEME.text : '#b4ad91',
    }).setOrigin(0.5);
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

    const diamondText = this.add.text(13, 0, `${save.diamonds}`, {
      fontFamily: UI_FONT_BOLD,
      fontSize: portrait ? '17px' : '18px',
      color: '#f2e6bd',
    }).setOrigin(0.5);
    const diamondW = Math.max(portrait ? 112 : 124, diamondText.width + 62);
    const diamondBadge = this.add.container(w - safe.side - diamondW / 2, safe.top + (portrait ? 22 : 18));
    diamondBadge.add(makePanel(this, diamondW, portrait ? 43 : 40, {
      fill: 0x0e1511, line: GOLD_DARK, lineWidth: 1, alpha: 0.94, radius: 20,
    }));
    diamondBadge.add([
      this.add.image(-diamondW / 2 + 24, 0, 'ui_enhance_badge').setDisplaySize(31, 31),
      diamondText,
    ]);

    if (portrait) this.createPortraitLayout({ w, h, safe, save, difficulty, chosen, characters });
    else this.createLandscapeLayout({ w, h, safe, save, difficulty, chosen, characters });

    this.boostOverlay = new StartBoostOverlay(this);
    this.installFooterTools(w, h, safe, save, portrait);

    const startRun = (startBuff = this.selectedStartBuff) => {
      unlockAudio();
      this.scene.start('Game', { difficulty: this.registry.get('difficulty') || difficulty, character: selectedCharacter(save), startBuff });
    };
    this.startRun = startRun;
    this.input.keyboard?.once('keydown-ENTER', () => { if (!this.adBusy) startRun(); });
    this.input.keyboard?.once('keydown-SPACE', () => { if (!this.adBusy) startRun(); });
    this.input.once('pointerdown', unlockAudio);
  }

  createPortraitLayout({ w, h, safe, save, difficulty, chosen, characters }) {
    const contentW = Math.min(w - safe.side * 2 - 24, 620);
    addBrand(this, w / 2, safe.top + h * 0.075, Math.min(contentW, 500), true);

    const best = save.bestTime ? t('menu.bestValue', { time: fmtTime(save.bestTime), kills: save.bestKills }) : t('menu.none');
    this.addBestPill(w / 2, h * 0.19, `${t('menu.best')}  ${best}`, contentW, true);
    addSectionLabel(this, w / 2, h * 0.25, t('menu.character'), contentW * 0.9, 18);

    const cardGap = 16;
    const cardW = Math.min(246, (contentW - cardGap) / 2);
    const cardH = Math.min(366, h * 0.3);
    const cardY = h * 0.43;
    characters.forEach((def, i) => {
      const unlocked = isCharacterUnlocked(save, def.key);
      const x = w / 2 + (i - (characters.length - 1) / 2) * (cardW + cardGap);
      makeHeroCard(this, x, cardY, cardW, cardH, def, unlocked, chosen === def.key, () => {
        this.selectCharacter(save, def, unlocked);
      }, true);
    });

    makeDifficultySelector(this, w / 2, h * 0.655, contentW * 0.92, 52, difficulty);
    const start = makePrimaryButton(this, w / 2, h * 0.75, contentW * 0.76, 82, t('menu.start'), () => {
      if (!this.adBusy) this.startRun?.();
    }, 29);
    start.setDepth(2);

    const secondaryY = h * 0.835;
    const secondaryGap = 14;
    const secondaryW = (contentW * 0.92 - secondaryGap) / 2;
    const boost = makeButton(this, w / 2 - (secondaryW + secondaryGap) / 2, secondaryY, secondaryW, 50, stripLeadingIcon(t('menu.startBoost')), () => this.showStartBoost(), {
      fontSize: '15px', minFontSize: 12, fill: 0x121a15, line: GOLD_DARK, color: '#dfd3ab', radius: 23,
    });
    boost.add(this.add.image(-secondaryW / 2 + 27, 0, 'ui_enhance_badge').setDisplaySize(26, 26));
    boost.label.setX(12);
    const talents = makeButton(this, w / 2 + (secondaryW + secondaryGap) / 2, secondaryY, secondaryW, 50, t('menu.talents'), () => this.scene.start('Talents'), {
      fontSize: '15px', minFontSize: 12, fill: 0x121a15, line: GOLD_DARK, color: '#dfd3ab', radius: 23,
    });
    talents.add(this.add.image(-secondaryW / 2 + 27, 0, 'icon_rune').setDisplaySize(26, 26));
    talents.label.setX(12);
    this.add.text(w / 2, h * 0.887, t('menu.howto'), {
      fontFamily: UI_FONT, fontSize: '12px', color: '#718876', align: 'center', wordWrap: { width: contentW },
    }).setOrigin(0.5);
  }

  createLandscapeLayout({ w, h, safe, save, difficulty, chosen, characters }) {
    const leftX = w * 0.28;
    const rightX = w * 0.72;
    const leftW = Math.min(w * 0.48, 660);
    const rightW = Math.min(w * 0.4, 570);
    addBrand(this, leftX, h * 0.15, leftW * 0.88, false);
    const best = save.bestTime ? t('menu.bestValue', { time: fmtTime(save.bestTime), kills: save.bestKills }) : t('menu.none');
    this.addBestPill(leftX, h * 0.3, `${t('menu.best')}  ${best}`, leftW, false);
    addSectionLabel(this, leftX, h * 0.39, t('menu.character'), leftW * 0.86, 17);

    const cardGap = 16;
    const cardW = Math.min(230, (leftW - cardGap - 24) / 2);
    const cardH = Math.min(330, h * 0.48);
    const cardY = h * 0.67;
    characters.forEach((def, i) => {
      const unlocked = isCharacterUnlocked(save, def.key);
      const x = leftX + (i - (characters.length - 1) / 2) * (cardW + cardGap);
      makeHeroCard(this, x, cardY, cardW, cardH, def, unlocked, chosen === def.key, () => {
        this.selectCharacter(save, def, unlocked);
      }, false);
    });

    addSectionLabel(this, rightX, h * 0.28, t('difficulty.label'), rightW * 0.9, 16);
    makeDifficultySelector(this, rightX, h * 0.37, rightW * 0.92, 50, difficulty);
    const start = makePrimaryButton(this, rightX, h * 0.53, rightW * 0.86, 82, t('menu.start'), () => {
      if (!this.adBusy) this.startRun?.();
    }, 29);
    start.setDepth(2);
    const boost = makeButton(this, rightX, h * 0.69, rightW * 0.7, 50, stripLeadingIcon(t('menu.startBoost')), () => this.showStartBoost(), {
      fontSize: '16px', minFontSize: 12, fill: 0x121a15, line: GOLD_DARK, color: '#dfd3ab', radius: 22,
    });
    boost.add(this.add.image(-rightW * 0.35 + 28, 0, 'ui_enhance_badge').setDisplaySize(26, 26));
    boost.label.setX(12);
    const talents = makeButton(this, rightX, h * 0.8, rightW * 0.7, 50, t('menu.talents'), () => this.scene.start('Talents'), {
      fontSize: '16px', fill: 0x121a15, line: GOLD_DARK, color: '#dfd3ab', radius: 22,
    });
    talents.add(this.add.image(-rightW * 0.35 + 28, 0, 'icon_rune').setDisplaySize(26, 26));
    talents.label.setX(12);
  }

  addBestPill(x, y, label, maxW, portrait) {
    const text = this.add.text(14, 0, label, {
      fontFamily: UI_FONT_BOLD,
      fontSize: portrait ? '13px' : '14px',
      color: '#cfc5a4',
    }).setOrigin(0.5);
    const width = Math.min(maxW, Math.max(210, text.width + 66));
    const pill = this.add.container(x, y);
    pill.add(makePanel(this, width, portrait ? 38 : 36, {
      fill: 0x0e1511, line: GOLD_DARK, lineWidth: 1, alpha: 0.88, radius: 19,
    }));
    pill.add([
      this.add.image(-width / 2 + 24, 0, 'ui_enhance_badge').setDisplaySize(portrait ? 26 : 25, portrait ? 26 : 25),
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
    const toolY = h - safe.bottom - (portrait ? 50 : 48);
    this.muteBtn = makeButton(this, safe.side + (portrait ? 26 : 31), toolY, portrait ? 46 : 54, portrait ? 42 : 40, isMuted() ? '🔇' : '🔊', () => {
      const next = !isMuted();
      setMuted(next);
      touchSave(save, { muted: next });
      this.muteBtn.label.setText(next ? '🔇' : '🔊');
    }, { fontSize: portrait ? '17px' : '18px', fill: 0x101612, line: GOLD_DARK, radius: 20 });

    const localeIndex = Math.max(0, LOCALES.findIndex(l => l.code === getLocale()));
    const localeInfo = LOCALES[localeIndex];
    makeButton(this, w - safe.side - (portrait ? 38 : 43), toolY, portrait ? 72 : 80, portrait ? 42 : 40, `🌐 ${localeInfo.short}`, () => {
      setLocale(LOCALES[(localeIndex + 1) % LOCALES.length].code);
      this.scene.restart();
    }, { fontSize: portrait ? '13px' : '14px', fill: 0x101612, line: GOLD_DARK, radius: 20 });
  }
}
