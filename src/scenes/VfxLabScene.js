import Phaser from 'phaser';
import { CHARACTERS, EVOLUTIONS, THEME, WEAPONS } from '../config.js';
import { EnemyManager } from '../game/EnemyManager.js';
import { Player } from '../game/Player.js';
import { Vfx } from '../game/Vfx.js';
import { WeaponManager } from '../game/WeaponManager.js';
import { t } from '../i18n.js';
import { unlockAudio } from '../audio.js';
import { makeButton, makePanel } from '../ui/widgets.js';
import { UI_FONT, UI_FONT_BOLD } from '../ui/layout.js';

const DUMMY_HP = 1_000_000_000;
const BASE_SKILLS = Object.keys(WEAPONS);
const EVOLVED_SKILLS = Object.keys(EVOLUTIONS);

export class VfxLabScene extends Phaser.Scene {
  constructor() { super('VfxLab'); }

  init(data = {}) {
    const params = new URLSearchParams(window.location.search);
    const requested = data.skill || params.get('skill') || 'fireball';
    this.selectedSkill = WEAPONS[requested] || EVOLUTIONS[requested] ? requested : 'fireball';
    this.autoFire = data.autoFire ?? true;
    this.focusKind = data.focusKind || 'slime';
    this.fireOnce = false;
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.state = { time: 0, kills: 0, damage: {} };
    this.difficulty = { hpMult: 1 };
    this.cameras.main.setBackgroundColor(THEME.bg);

    this.ground = this.add.tileSprite(0, 0, w, h, 'ground').setOrigin(0).setDepth(-10).setAlpha(0.82);
    this.add.image(w * 0.66, h * 0.5, 'vignette').setDisplaySize(w * 1.05, h * 1.05).setDepth(20).setAlpha(0.35);

    const panelW = Math.min(270, Math.max(224, w * 0.34));
    this.panelW = panelW;
    makePanel(this, panelW - 12, h - 20, {
      fill: 0x101a13, line: 0x3d5a44, alpha: 0.96, radius: 18, shadow: true,
    }).setPosition(panelW / 2, h / 2).setDepth(50);

    this.createArena(panelW, w, h);
    this.createSkillList(panelW, h);
    this.createControls(panelW, w, h);
    this.configureSkill(this.selectedSkill);
    this.setFocus(this.focusKind);

    this._onResize = () => {
      this._resizeTimer?.remove();
      this._resizeTimer = this.time.delayedCall(120, () => this.restartLab());
    };
    this.scale.on('resize', this._onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this._onResize);
      this._resizeTimer?.remove();
      this.vfx?.destroy();
    });
    this.input.once('pointerdown', unlockAudio);
  }

  createArena(panelW, w, h) {
    const arenaW = w - panelW;
    const arenaX = panelW + arenaW / 2;
    const playerX = panelW + arenaW * 0.20;
    const playerY = h * 0.49;
    // 超宽桌面下仍要保持在所有正式武器的索敌/射程内，否则会退回朝前空放。
    const targetX = Math.min(panelW + arenaW * 0.68, playerX + 520);
    const targetY = h * 0.46;
    const character = CHARACTERS.witch;

    this.add.text(arenaX, 28, 'VFX LAB · 特效房间', {
      fontFamily: UI_FONT_BOLD, fontSize: `${Math.min(25, arenaW / 18)}px`, color: THEME.goldCss,
      stroke: '#10160f', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(60);

    this.player = new Player(this, playerX, playerY, {
      texture: character.texture,
      walkAnimation: character.walkAnimation,
      bakedShadow: character.bakedShadow,
      bonuses: {},
    });
    this.player.invulnerableT = Number.POSITIVE_INFINITY;
    this.player.facing = 1;

    this.vfx = new Vfx(this);
    this.enemies = new EnemyManager(this);
    this.weapons = new WeaponManager(this);

    const spreadX = Math.min(74, arenaW * 0.15);
    const spreadY = Math.min(76, h * 0.065);
    const slimeOffsets = [
      [0, 0], [spreadX, -spreadY], [spreadX, spreadY],
      [-spreadX * 0.55, -spreadY], [-spreadX * 0.55, spreadY], [spreadX * 0.3, spreadY * 1.75],
    ];
    this.slimes = slimeOffsets.map(([dx, dy]) => this.spawnDummy('slime', targetX + dx, targetY + dy, {
      fixedHp: DUMMY_HP,
    }));

    this.boss = this.spawnDummy('boss', targetX + spreadX * 0.25, h * 0.72, {
      fixedHp: DUMMY_HP, bossTier: 1, scale: 0.88,
    });

    this.selectionRing = this.add.image(0, 0, 'fx_ring')
      .setDepth(1.35).setTint(THEME.gold).setAlpha(0.72).setBlendMode(Phaser.BlendModes.ADD);

    this.add.text(targetX, targetY - spreadY * 1.72, `训练史莱姆 ×${this.slimes.length} · 10亿 HP`, {
      fontFamily: UI_FONT_BOLD, fontSize: '14px', color: '#b8d8bd',
      backgroundColor: '#10160fcc', padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setDepth(45);
    this.add.text(this.boss.x, this.boss.y - 88, '训练 Boss · 10亿 HP', {
      fontFamily: UI_FONT_BOLD, fontSize: '14px', color: '#ffc07a',
      backgroundColor: '#10160fcc', padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setDepth(45);
    this.add.text(arenaX, h - 25, '点击史莱姆或 Boss 可切换锁定目标', {
      fontFamily: UI_FONT, fontSize: '13px', color: '#7da585',
    }).setOrigin(0.5).setDepth(60);

    const gridNearest = this.enemies.nearest.bind(this.enemies);
    this.enemies.nearest = (x, y, maxR) => {
      const target = this.focusTarget;
      if (target?.hp > 0) return target;
      return gridNearest(x, y, maxR);
    };
  }

  spawnDummy(type, x, y, options) {
    const enemy = this.enemies.spawn(type, x, y, 0, options);
    enemy.freezeT = Number.POSITIVE_INFINITY;
    enemy.spr.setInteractive({ useHandCursor: true });
    enemy.spr.on('pointerup', () => this.setFocus(type === 'boss' ? 'boss' : 'slime', enemy));
    return enemy;
  }

  createSkillList(panelW, h) {
    const buttonGap = 8;
    const buttonW = (panelW - 34 - buttonGap) / 2;
    const rowH = Math.min(40, Math.max(34, (h - 230) / 10));
    const leftX = 17 + buttonW / 2;
    const rightX = leftX + buttonW + buttonGap;
    const headingStyle = { fontFamily: UI_FONT_BOLD, fontSize: '13px', color: '#7da585' };

    this.add.text(18, 27, '技能列表', {
      fontFamily: UI_FONT_BOLD, fontSize: '22px', color: THEME.text,
    }).setOrigin(0, 0.5).setDepth(60);
    this.add.text(18, 58, '基础技能 · 满级', headingStyle).setDepth(60);

    let y = 92;
    BASE_SKILLS.forEach((key, index) => {
      const def = WEAPONS[key];
      const x = index % 2 ? rightX : leftX;
      if (index > 0 && index % 2 === 0) y += rowH;
      this.makeSkillButton(x, y, buttonW, rowH - 6, key, t(def.nameKey));
    });

    y += rowH + 4;
    this.add.text(18, y, '进化技能 · 满级', headingStyle).setDepth(60);
    y += 31;
    EVOLVED_SKILLS.forEach((key, index) => {
      const def = EVOLUTIONS[key];
      const x = index % 2 ? rightX : leftX;
      if (index > 0 && index % 2 === 0) y += rowH;
      this.makeSkillButton(x, y, buttonW, rowH - 6, key, t(def.nameKey));
    });

    const def = WEAPONS[this.selectedSkill] || EVOLUTIONS[this.selectedSkill];
    this.add.text(panelW / 2, h - 48, `当前：${t(def.nameKey)} · Lv${def.maxLv}`, {
      fontFamily: UI_FONT_BOLD, fontSize: '14px', color: THEME.goldCss,
      wordWrap: { width: panelW - 28 }, align: 'center',
    }).setOrigin(0.5).setDepth(60);
  }

  makeSkillButton(x, y, w, h, key, label) {
    const selected = key === this.selectedSkill;
    return makeButton(this, x, y, w, h, label, () => this.selectSkill(key), {
      fontSize: '13px', minFontSize: 10, radius: 10,
      fill: selected ? 0x315b3c : 0x1b2a20,
      line: selected ? THEME.gold : 0x3d5a44,
      color: selected ? THEME.goldCss : THEME.text,
    }).setDepth(60);
  }

  createControls(panelW, w, h) {
    const arenaW = w - panelW;
    const centerX = panelW + arenaW / 2;
    const targetButtonW = Math.min(132, (arenaW - 32) / 2);
    const actionButtonW = Math.min(116, (arenaW - 40) / 3);

    this.slimeTargetButton = makeButton(this, centerX - targetButtonW / 2 - 5, 72, targetButtonW, 36,
      '目标：史莱姆', () => this.setFocus('slime'), { fontSize: '13px', radius: 10 }).setDepth(60);
    this.bossTargetButton = makeButton(this, centerX + targetButtonW / 2 + 5, 72, targetButtonW, 36,
      '目标：Boss', () => this.setFocus('boss'), { fontSize: '13px', radius: 10 }).setDepth(60);

    this.singleButton = makeButton(this, centerX - actionButtonW - 6, 116, actionButtonW, 36,
      '释放一次', () => this.releaseOnce(), { fontSize: '13px', radius: 10 }).setDepth(60);
    this.autoButton = makeButton(this, centerX, 116, actionButtonW, 36,
      '', () => this.toggleAuto(), { fontSize: '13px', radius: 10 }).setDepth(60);
    makeButton(this, centerX + actionButtonW + 6, 116, actionButtonW, 36,
      '清场重置', () => this.restartLab(), { fontSize: '13px', radius: 10, fill: 0x2d2520, line: 0x8f6745 }).setDepth(60);
    this.updateAutoLabel();

    this.statsText = this.add.text(w - 12, 158, '', {
      fontFamily: 'Consolas, monospace', fontSize: '12px', color: '#9fc9a6', align: 'right',
      backgroundColor: '#10160fcc', padding: { x: 7, y: 5 },
    }).setOrigin(1, 0).setDepth(60);

    makeButton(this, w - 54, h - 25, 88, 30, '返回菜单', () => this.scene.start('Menu'), {
      fontSize: '12px', radius: 9, fill: 0x1b2a20, line: 0x3d5a44,
    }).setDepth(60);
  }

  configureSkill(key) {
    const base = WEAPONS[key];
    if (base) {
      this.weapons.addWeapon(key);
      const weapon = this.weapons.getWeapon(key);
      weapon.lv = base.maxLv;
      weapon.cd = 0.08;
      return;
    }

    const evolution = EVOLUTIONS[key];
    if (!evolution) return;
    this.weapons.addWeapon(evolution.baseKey);
    const weapon = this.weapons.getWeapon(evolution.baseKey);
    weapon.lv = weapon.baseDef.maxLv;
    this.weapons.evolve(evolution.baseKey, key);
    weapon.lv = evolution.maxLv;
    weapon.cd = 0.08;
  }

  selectSkill(key) {
    if (key === this.selectedSkill) return;
    const url = new URL(window.location.href);
    url.searchParams.set('skill', key);
    window.history.replaceState(null, '', url);
    this.scene.restart({ skill: key, autoFire: this.autoFire, focusKind: this.focusKind });
  }

  setFocus(kind, explicitTarget = null) {
    this.focusKind = kind === 'boss' ? 'boss' : 'slime';
    this.focusTarget = explicitTarget || (this.focusKind === 'boss' ? this.boss : this.slimes[0]);
    if (!this.focusTarget) return;
    const size = (this.focusTarget.radius + 18) * 2;
    this.selectionRing.setPosition(this.focusTarget.x, this.focusTarget.y).setDisplaySize(size, size);
    this.slimeTargetButton?.setLabel(`${this.focusKind === 'slime' ? '● ' : ''}目标：史莱姆`);
    this.bossTargetButton?.setLabel(`${this.focusKind === 'boss' ? '● ' : ''}目标：Boss`);
  }

  releaseOnce() {
    this.fireOnce = true;
    const weapon = this.weapons.weapons[0];
    if (weapon) weapon.cd = 0;
  }

  toggleAuto() {
    this.autoFire = !this.autoFire;
    if (this.autoFire) {
      const weapon = this.weapons.weapons[0];
      if (weapon) weapon.cd = 0;
    }
    this.updateAutoLabel();
  }

  updateAutoLabel() {
    this.autoButton?.setLabel(`自动：${this.autoFire ? '开' : '关'}`);
  }

  restartLab() {
    this.scene.restart({ skill: this.selectedSkill, autoFire: this.autoFire, focusKind: this.focusKind });
  }

  recordDamage(source, amount) {
    this.state.damage[source] = (this.state.damage[source] || 0) + amount;
  }

  onEnemyKilled(enemy) {
    this.weapons?.onEnemyKilled(enemy);
  }

  onPlayerDeath() {
    this.player.revive({ hpPct: 1, invulnerableSec: Number.POSITIVE_INFINITY });
  }

  update(_, deltaMs) {
    if (!this.player || !this.enemies || !this.weapons || !this.vfx) return;
    const dt = Math.min(deltaMs / 1000, 0.05);
    this.state.time += dt;

    this.player.invulnerableT = Number.POSITIVE_INFINITY;
    this.player.update(dt, { x: 0, y: 0 });
    for (const enemy of this.enemies.active) enemy.freezeT = Number.POSITIVE_INFINITY;
    this.enemies.update(dt, this.player, this.state.time);

    const weapon = this.weapons.weapons[0];
    if (weapon) {
      if (this.fireOnce) weapon.cd = 0;
      else if (!this.autoFire) weapon.cd = Math.max(weapon.cd, 3600);
    }
    this.weapons.update(dt);
    this.fireOnce = false;
    this.vfx.update(dt);

    if (this.selectionRing && this.focusTarget) {
      this.selectionRing.setPosition(this.focusTarget.x, this.focusTarget.y)
        .setAlpha(0.52 + Math.sin(this.state.time * 5) * 0.18);
    }

    if (!this._statsAt || this.state.time >= this._statsAt) {
      this._statsAt = this.state.time + 0.25;
      const stats = this.vfx.diagnostics();
      this.statsText?.setText(
        `FPS ${Math.round(this.game.loop.actualFps)}  VFX ${stats.renderer}/${stats.quality}\n` +
        `投射物 ${this.weapons.active.length}  区域 ${this.weapons.zones.length}  粒子 ${this.vfx.particles.length + stats.nativeParticles}`,
      );
    }
  }
}
