// 局内主场景：组装各系统并驱动主循环。系统逻辑都在 game/ 下，这里只做编排。
// UI（HUD/升级四选一/摇杆可视件）在并行的 UiScene——世界相机 zoom 不影响 UI。
import Phaser from 'phaser';
import {
  THEME, AUDIO_PHASES, DEBUG_QUERY, STRESS_QUERY, STRESS_COUNT, STRESS_TYPES,
  RUN, DIFFICULTIES, EVOLUTIONS, CHARACTERS, TALENTS, WORLD_SKINS, AD_REWARDS, PROPS, XP_REWARDS,
  SKILLS, ELEMENT_COMBO_TIPS, DEFAULT_MAIN_SKILL,
} from '../config.js';
import { Platform } from '../platform.js';
import { touchSave } from '../save.js';
import { t } from '../i18n.js';
import { startStageAudio, stopStageAudio, setAudioPhase, setAudioPaused, Sfx, unlockAudio } from '../audio.js';
import { InputController } from '../game/InputController.js';
import { Player } from '../game/Player.js';
import { EnemyManager } from '../game/EnemyManager.js';
import { WeaponManager } from '../game/WeaponManager.js';
import { PickupManager } from '../game/PickupManager.js';
import { PropManager } from '../game/PropManager.js';
import { LevelSystem } from '../game/LevelSystem.js';
import { Vfx, ComboTracker } from '../game/Vfx.js';
import { runBonuses, selectedCharacter, calculateRunReward } from '../game/MetaProgression.js';
import { RunAnalytics } from '../game/RunAnalytics.js';
import { RunEventManager } from '../game/RunEventManager.js';

const DECOR_COUNT = 26;
const DECOR_WRAP = 1100; // 装饰件环绕玩家的半径（超出即绕回，制造无限地图错觉）

export class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  init(data = {}) {
    const key = data.difficulty || this.registry.get('difficulty') || 'easy';
    this.difficulty = DIFFICULTIES[key] || DIFFICULTIES.easy;
    this.registry.set('difficulty', this.difficulty.key);
    const save = this.registry.get('save');
    const params = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null;
    const captureCharacter = params?.has('captureVideo') ? params.get('captureCharacter') : null;
    this.characterKey = CHARACTERS[data.character]
      ? data.character
      : CHARACTERS[captureCharacter]
        ? captureCharacter
        : selectedCharacter(save);
    this.startBuffKey = AD_REWARDS.startBuffs[data.startBuff] ? data.startBuff : null;
  }

  create() {
    // 调试 URL 只在开发构建中解析，生产包不能通过查询参数开启无敌、压测或调试 HUD。
    const params = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null;
    if (import.meta.env.DEV) {
      this.debugMode = !!params && (params.has(DEBUG_QUERY) || params.has(STRESS_QUERY));
      this.stressMode = !!params && params.has(STRESS_QUERY);
      this.captureVideo = !!params && params.has('captureVideo');
      this.godMode = !!params && (this.stressMode || this.captureVideo || params.has('god'));
      this.autoplay = !!params && (this.captureVideo || params.has('autoplay'));
      this.devStart = params ? Math.max(0, Number(params.get('start')) || 0) : 0;
      this.captureEnemyMin = this.captureVideo
        ? Phaser.Math.Clamp(Number(params.get('captureEnemyMin')) || 0, 0, 180)
        : 0;
      this.devRunEvent = params?.get('event') || '';
      if (this.autoplay) this.godMode = true;
    }

    const save = this.registry.get('save');
    this.character = CHARACTERS[this.characterKey] || CHARACTERS.witch;
    this.meta = runBonuses(save, this.character.key);
    const startBuff = AD_REWARDS.startBuffs[this.startBuffKey];
    if (startBuff) {
      for (const key of ['hpPct', 'damagePct', 'speedPct', 'pickupPct']) {
        this.meta[key] = (this.meta[key] || 0) + (startBuff[key] || 0);
      }
    }
    this.state = { time: import.meta.env.DEV ? this.devStart : 0, kills: 0, damage: {} };
    this.paused = false;
    this.over = false;
    this.pendingLevelUps = 0;
    this.pendingChoiceSources = [];
    this.seenChestEvolution = false;
    this.audioPhaseIdx = 0;
    this.revives = this.meta.revives;
    this.rerolls = this.meta.rerolls;
    this.pauseReason = null;
    this.adBusy = false;
    this.adReviveUsed = false;
    this.adRerollUsed = false;
    this.mainSkillChosen = false;
    this.analytics = new RunAnalytics({ character: this.character.key, difficulty: this.difficulty.key });
    if (this.startBuffKey) this.analytics.event('start_buff', 0, { key: this.startBuffKey });
    this.ui = null; // UiScene 引用（其 create 在下一帧，update 里完成接线）

    const cam = this.cameras.main;
    cam.setBackgroundColor(THEME.bg);
    this.applyZoom();

    // 地面：世界锁定的 tileSprite，跟着镜头走、按世界坐标偏移贴图 → 无限地图
    this.ground = this.add.tileSprite(0, 0, cam.displayWidth + 320, cam.displayHeight + 320, 'ground')
      .setDepth(-10);

    // 装饰件散布
    this.decor = [];
    const decorKeys = ['decor_bush', 'decor_rock', 'decor_tuft', 'decor_tuft'];
    for (let i = 0; i < DECOR_COUNT; i++) {
      const img = this.add.image(
        Phaser.Math.Between(-DECOR_WRAP, DECOR_WRAP),
        Phaser.Math.Between(-DECOR_WRAP, DECOR_WRAP),
        decorKeys[i % decorKeys.length],
      ).setDepth(0.5).setAlpha(0.9);
      this.decor.push(img);
    }

    // 实体与系统
    this.player = new Player(this, 0, 0, {
      texture: this.character.texture,
      walkAnimation: this.character.walkAnimation,
      bakedShadow: this.character.bakedShadow,
      bonuses: this.meta,
    });
    this.enemies = new EnemyManager(this);
    this.weapons = new WeaponManager(this);
    this.pickups = new PickupManager(this);
    this.props = new PropManager(this);
    this.levelSystem = new LevelSystem(this);
    this.vfx = new Vfx(this);
    this.combo = new ComboTracker();
    this.xpGuidePulse = this.add.circle(0, 0, 21, 0x5ff7ff, 0)
      .setStrokeStyle(3, 0x5ff7ff, 0.92)
      .setDepth(4.35)
      .setVisible(false);
    this.runEvents = new RunEventManager(this, {
      forcedKey: import.meta.env.DEV ? this.devRunEvent : '',
      initialTime: import.meta.env.DEV ? this.devStart : 0,
      disabled: import.meta.env.DEV && this.stressMode,
    });

    // 仅开发构建：为单武器视觉验收注入指定基础武器（?weapon=venomflask）。
    if (import.meta.env.DEV && params.has('weapon')) this.weapons.addWeapon(params.get('weapon'));
    this.devMainSkill = import.meta.env.DEV && SKILLS[params?.get('skill')]
      ? params.get('skill')
      : DEFAULT_MAIN_SKILL;
    this.captureSkillKeys = import.meta.env.DEV && this.captureVideo
      ? (params.get('captureSkills') || this.devMainSkill)
        .split(',')
        .map(skillKey => skillKey.trim())
        .filter(skillKey => SKILLS[skillKey])
      : [];
    if (this.meta.startXpPct > 0) {
      this.levelSystem.xp = Math.floor(this.levelSystem.need * this.meta.startXpPct / 100);
    }
    if (import.meta.env.DEV && this.devStart > 0) this.enemies.skipEventsBefore(this.devStart);
    if (import.meta.env.DEV && params.has('evo')) {
      const evolutionKey = params.get('evo');
      const evolution = EVOLUTIONS[evolutionKey];
      if (evolution) {
        if (!this.weapons.getWeapon(evolution.baseKey)) this.weapons.addWeapon(evolution.baseKey);
        const weapon = this.weapons.getWeapon(evolution.baseKey);
        weapon.lv = weapon.baseDef.maxLv;
        this.weapons.evolve(evolution.baseKey, evolutionKey);
      }
    }
    if (import.meta.env.DEV && params.has('ready')) {
      const baseKey = params.get('ready');
      if (!this.weapons.getWeapon(baseKey)) this.weapons.addWeapon(baseKey);
      const weapon = this.weapons.getWeapon(baseKey);
      if (weapon) weapon.lv = weapon.baseDef.maxLv;
      this.time.delayedCall(700, () => this.levelSystem.addXp(this.levelSystem.need));
    }
    if (import.meta.env.DEV && params.has('testChest')) {
      const baseKey = params.get('testChest') || this.character.startWeapon;
      if (!this.weapons.getWeapon(baseKey)) this.weapons.addWeapon(baseKey);
      const weapon = this.weapons.getWeapon(baseKey);
      if (weapon) weapon.lv = weapon.baseDef.maxLv;
      this.time.delayedCall(700, () => this.pickups.dropChest(this.player.x + 8, this.player.y));
    }
    if (import.meta.env.DEV && params.has('testXp')) {
      this.time.delayedCall(900, () => this.pickups.dropGem(
        this.player.x + 8, this.player.y,
        this.levelSystem.rewardXpValue(0.5),
      ));
    }
    // 战利品道具美术验收位：三件道具立在玩家上方一排（?testProps=1&god=1）
    if (import.meta.env.DEV && params.has('testProps')) {
      this.time.delayedCall(900, () => {
        Object.keys(PROPS.types).forEach((key, i) => {
          this.props.spawnAt(key, this.player.x - 150 + i * 150, this.player.y - 130);
        });
      });
    }
    if (import.meta.env.DEV && params.has('testAdRevive')) {
      this.revives = 0;
      this.time.delayedCall(1800, () => this.player.takeDamage(this.player.maxHp + 1));
    } else if (import.meta.env.DEV && params.has('testRevive')) {
      this.time.delayedCall(1800, () => this.player.takeDamage(this.player.maxHp + 1));
    }

    // 镜头：手动平滑跟随
    this.camX = 0;
    this.camY = 0;
    cam.centerOn(0, 0);

    // 压测：开局铺满 500 敌（GDD §8.2 M0 门禁）
    if (import.meta.env.DEV && this.stressMode) {
      this.enemies.maxAlive = STRESS_COUNT;
      this.enemies.pool.warm(STRESS_COUNT);
      for (let i = 0; i < STRESS_COUNT; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 260 + Math.random() * 750;
        const type = this.enemies.pickType(STRESS_TYPES);
        this.enemies.spawn(type, Math.cos(a) * r, Math.sin(a) * r, 0);
      }
    }

    this.scene.launch('GameUi');

    this.audioPhaseIdx = Math.max(0, AUDIO_PHASES.findLastIndex(p => this.state.time >= p.at));
    const initialPhase = AUDIO_PHASES[this.audioPhaseIdx]?.phase || 'day';
    startStageAudio(initialPhase);
    this.applyWorldSkin(this.state.time >= WORLD_SKINS.blood.at ? 'blood' : 'forest', false);
    unlockAudio();

    this._onResize = this.onResize.bind(this);
    this.scale.on('resize', this._onResize);
    this._onPauseKey = this.onPauseKey.bind(this);
    this._onVisibility = this.onVisibilityChange.bind(this);
    this._onAdState = this.onAdState.bind(this);
    window.addEventListener('keydown', this._onPauseKey);
    window.addEventListener('platform-ad-state', this._onAdState);
    document.addEventListener('visibilitychange', this._onVisibility);
    this.events.once('shutdown', () => this.onShutdown());
  }

  // ---------- 布局 ----------
  // 面积归一化 zoom：不同屏幕可见世界面积接近 720×1280，刷怪环/难度/性能口径一致
  applyZoom() {
    const w = this.scale.width, h = this.scale.height;
    const zoom = Phaser.Math.Clamp(Math.sqrt((w * h) / (720 * 1280)), 1, 2.4);
    this.cameras.main.setZoom(zoom);
  }

  onResize() {
    this.applyZoom();
    const cam = this.cameras.main;
    this.ground.setSize(cam.displayWidth + 320, cam.displayHeight + 320);
  }

  // ---------- 主循环 ----------
  update(_, deltaMs) {
    // UiScene 的 create 晚一帧，接线完成前不开局
    if (!this.ui) {
      const ui = this.scene.get('GameUi');
      if (!ui?.hud) return;
      this.ui = ui;
      this.inputCtl = new InputController(this, ui);
      ui.setPauseHandler(() => this.pauseManually('manual'));
      if (import.meta.env.DEV && (this.stressMode || this.autoplay)) {
        this.onMainSkillSelected(this.devMainSkill);
      } else {
        this.pauseGameplay('main-skill');
        ui.mainSkillOverlay.show(key => this.onMainSkillSelected(key));
      }
      return;
    }

    const dt = Math.min(deltaMs / 1000, 0.05);

    this.vfx.update(dt);
    if (this.over || this.paused) return;

    this.state.time += dt;
    const time = this.state.time;

    // 镜像最终 Boss 必须在两分钟内击杀；仅存活到超时不再算胜利。
    if (!(import.meta.env.DEV && this.stressMode) && time >= RUN.duration + RUN.finalBossTimeLimitSec) {
      this.finishRun(false, 'timeout');
      return;
    }

    // BGM 阶段推进
    const nextPhase = AUDIO_PHASES[this.audioPhaseIdx + 1];
    if (nextPhase && time >= nextPhase.at) {
      this.audioPhaseIdx++;
      setAudioPhase(nextPhase.phase, { accent: true });
      if (nextPhase.phase === 'blood') this.applyWorldSkin('blood', true);
    }

    // 输入与玩家
    let moveVec = this.inputCtl.getMoveVector(this.player.x, this.player.y);
    if (import.meta.env.DEV && this.captureVideo) {
      // 录制模式只用于宣传片 QA：稳定绕圈移动，展示怪群、掉落物与 VFX。
      moveVec = { x: Math.cos(time * 0.72), y: Math.sin(time * 0.72) };
      this.inputCtl.moved = true;
      this.ui.hideMoveHint();
    } else if (import.meta.env.DEV && this.autoplay) {
      moveVec = this.runEvents.autoplayMoveVector(moveVec);
    }
    this.player.update(dt, moveVec);
    if (this.inputCtl.moved && this.ui.moveHint) {
      this.ui.hideMoveHint();
      touchSave(this.registry.get('save'), { tutorialDone: true });
    }
    if (import.meta.env.DEV && this.godMode) this.player.hp = this.player.maxHp;

    // 系统更新（顺序：刷怪 → 敌人（重建网格）→ 武器 → 拾取）
    if (import.meta.env.DEV && this.stressMode) {
      this.enemies.recycleDead();
      while (this.enemies.aliveCount < STRESS_COUNT) {
        this.enemies.spawnAround(this.player, this.enemies.pickType(STRESS_TYPES), time);
      }
    } else {
      this.runEvents.update(dt, time);
      this.enemies.updateSpawner(dt, time, this.player);
      // 宣传片录制时保持可读的敌群密度。敌人照常受击和死亡，只从屏幕外补充，
      // 避免高等级展示技能把画面瞬间清空；仅开发构建的 captureVideo 参数可启用。
      if (import.meta.env.DEV && this.captureVideo && this.captureEnemyMin > 0) {
        const phase = this.enemies.currentPhase(time);
        const target = Math.min(this.captureEnemyMin, phase.maxAlive, this.enemies.maxAlive);
        for (let attempt = 0; this.enemies.aliveCount < target && attempt < target * 2; attempt++) {
          const typeKey = this.enemies.pickType(phase.types);
          if (!this.enemies.spawnAround(this.player, typeKey, time)) break;
        }
      }
      // 道具先于敌人更新：新刷的道具当帧进网格，可被本帧武器命中
      this.props.update(dt, this.player, time);
    }
    this.enemies.update(dt, this.player, time);
    this.weapons.update(dt);
    this.pickups.update(dt);
    this.updateXpGuide(time);
    this.combo.update(dt);

    // 镜头平滑跟随 + 地面世界锁定
    const k = Math.min(1, dt * 7);
    this.camX += (this.player.x - this.camX) * k;
    this.camY += (this.player.y - this.camY) * k;
    const cam = this.cameras.main;
    cam.centerOn(this.camX, this.camY);
    this.ground.setPosition(this.camX, this.camY);
    this.ground.setTilePosition(this.camX - this.ground.width / 2, this.camY - this.ground.height / 2);

    // 装饰件环绕回绕
    for (const d of this.decor) {
      if (d.x - this.player.x > DECOR_WRAP) d.x -= DECOR_WRAP * 2;
      else if (this.player.x - d.x > DECOR_WRAP) d.x += DECOR_WRAP * 2;
      if (d.y - this.player.y > DECOR_WRAP) d.y -= DECOR_WRAP * 2;
      else if (this.player.y - d.y > DECOR_WRAP) d.y += DECOR_WRAP * 2;
    }

    // HUD
    this.ui.hud.update({
      lv: this.levelSystem.lv,
      progress: this.levelSystem.progress,
      time,
      kills: this.state.kills,
      boss: this.enemies.primaryBoss(),
      finalBossRemaining: Math.max(0, RUN.duration + RUN.finalBossTimeLimitSec - time),
      event: this.runEvents.hudState(),
    });
    if (this.analytics.shouldSnapshot(time)) {
      this.analytics.update(time, {
        kills: this.state.kills, level: this.levelSystem.lv, hp: Math.round(this.player.hp),
        enemies: this.enemies.aliveCount,
        weapons: this.weapons.weapons.map(w => `${w.def.key}:${w.lv}`),
      });
    }
    if (import.meta.env.DEV && this.debugMode) {
      const vfxStats = this.vfx.diagnostics();
      const typeCounts = { slime: 0, runner: 0, tank: 0, flyer: 0, splitter: 0, mini: 0, boss: 0 };
      for (const enemy of this.enemies.active) typeCounts[enemy.type.key]++;
      this.ui.hud.setDebug(
        `fps ${Math.round(this.game.loop.actualFps)}  ` +
        `enemies ${this.enemies.aliveCount}  proj ${this.weapons.active.length}  hostile ${this.enemies.bossFireballs.length}  ` +
        `zones ${this.weapons.zones.length}  fx ${this.vfx.particles.length}+${vfxStats.nativeParticles}  ` +
        `vfx ${vfxStats.renderer}/${vfxStats.quality}  ` +
        `gems ${this.pickups.active.length}  props ${this.props.active.length}  pool ${this.enemies.pool.created}\n` +
        `slime ${typeCounts.slime}  runner ${typeCounts.runner}  tank ${typeCounts.tank}  ` +
        `fly ${typeCounts.flyer} split ${typeCounts.splitter} mini ${typeCounts.mini} boss ${typeCounts.boss}`,
      );
    }
  }

  inputLocked() { return this.paused || this.over; }

  pauseGameplay(reason) {
    if (this.over) return false;
    this.paused = true;
    this.pauseReason = reason;
    this.anims.pauseAll();
    if (reason !== 'level') setAudioPaused(true, 'game-pause');
    Platform.gameplayStop();
    this.ui?.setPauseVisible(false);
    this.inputCtl?.onUp();
    return true;
  }

  resumeGameplay() {
    if (this.over) return;
    this.paused = false;
    this.pauseReason = null;
    this.anims.resumeAll();
    setAudioPaused(false, 'game-pause');
    this.ui?.setPauseVisible(true);
    Platform.gameplayStart();
  }

  pauseManually(reason = 'manual') {
    if (this.paused || this.over || this.adBusy) return;
    this.pauseGameplay(reason);
    this.ui?.showActionModal({
      title: t('pause.title'), description: t('pause.desc'),
      primaryLabel: t('pause.resume'), onPrimary: () => this.resumeFromManualPause(),
      secondaryLabel: t('pause.menu'), onSecondary: () => this.quitToMenu(),
    });
  }

  resumeFromManualPause() {
    if (!['manual', 'visibility'].includes(this.pauseReason) || this.adBusy) return;
    this.ui?.hideActionModal();
    if (this.over || !['manual', 'visibility'].includes(this.pauseReason)) return;
    this.resumeGameplay();
  }

  quitToMenu() {
    if (this.adBusy) return;
    Platform.gameplayStop();
    stopStageAudio();
    setAudioPaused(false, 'game-pause');
    this.scene.start('Menu');
  }

  onPauseKey(event) {
    if (Platform.isAdPlaying() || !['Escape', 'Space'].includes(event.code)) return;
    event.preventDefault();
    if (['manual', 'visibility'].includes(this.pauseReason)) this.resumeFromManualPause();
    else if (!this.paused) this.pauseManually('manual');
  }

  onVisibilityChange() {
    if (document.hidden && !this.paused && !this.over) this.pauseManually('visibility');
  }

  onAdState(event) {
    const active = !!event.detail?.active;
    const enabled = !active;
    this.input.enabled = enabled;
    if (this.ui?.input) this.ui.input.enabled = enabled;
    if (active && !this.paused && !this.over) this.pauseGameplay('ad');
    else if (!active && this.pauseReason === 'ad' && !this.over) this.resumeGameplay();
  }

  applyWorldSkin(key, announce = true) {
    const skin = WORLD_SKINS[key] || WORLD_SKINS.forest;
    this.worldSkin = skin.key;
    this.ground?.setTexture(skin.ground);
    for (const item of this.decor || []) item.setTint(skin.tint);
    if (announce) {
      this.ui?.showToast(t('event.bloodMoon'), 3.5);
      this.cameras.main.flash(650, 105, 12, 20);
      Sfx.bloodMoon();
      this.analytics.event('skin_change', this.state.time, { skin: key });
    }
  }

  // ---------- 事件 ----------
  onEnemyKilled(e) {
    this.state.kills++;
    this.runEvents.onEnemyKilled(e);
    this.weapons.onEnemyKilled(e);
    const popup = this.combo.onKill();
    Sfx.kill(this.combo.count);
    if (popup) this.ui?.hud.comboPopup(popup);
    this.vfx.deathPoof(e.x, e.y, e.final ? 0xff6a5e : e.treasure ? 0xffe58a : e.elite ? 0xffd36d : 0x8fd6a5);
    this.pickups.dropGem(e.x, e.y, e.type.xp);
    const rewardPct = e.bossTier ? XP_REWARDS.bossNeedPct : e.elite ? XP_REWARDS.eliteNeedPct : 0;
    if (rewardPct) {
      this.pickups.dropGem(e.x + 18, e.y, this.levelSystem.rewardXpValue(rewardPct));
    }
    if (e.rewardChest) this.pickups.dropChest(e.x, e.y);
    if (e.final) this.time.delayedCall(280, () => this.finishRun(true, 'boss'));

  }

  updateXpGuide(time) {
    const done = time > 30 || this.levelSystem.lv > 1 || this.levelSystem.xp > 0 || this.over;
    if (done) {
      this.xpGuidePulse?.setVisible(false);
      return;
    }
    let best = null;
    let bestD2 = Infinity;
    for (const gem of this.pickups.active) {
      if (gem.kind !== 'gem') continue;
      const dx = gem.x - this.player.x, dy = gem.y - this.player.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = gem;
      }
    }
    if (!best) {
      this.xpGuidePulse?.setVisible(false);
      return;
    }
    const wave = 0.5 + 0.5 * Math.sin(time * 6.5);
    const r = Math.round(Phaser.Math.Linear(95, 255, wave));
    const g = Math.round(Phaser.Math.Linear(247, 211, wave));
    const b = Math.round(Phaser.Math.Linear(255, 92, wave));
    const color = (r << 16) | (g << 8) | b;
    this.xpGuidePulse
      .setPosition(best.x, best.y)
      .setVisible(true)
      .setScale(0.88 + wave * 0.38)
      .setAlpha(0.48 + wave * 0.42)
      .setStrokeStyle(2 + wave * 2, color, 0.96);
  }

  onLevelUp() {
    // 压测必须持续跑满主循环，不能被升级选卡弹窗暂停。
    if (import.meta.env.DEV && this.stressMode) return;
    this.pendingLevelUps++;
    this.pendingChoiceSources.push('level');
    this.tryShowLevelUp();
  }

  onMainSkillSelected(key) {
    if (this.mainSkillChosen || !this.levelSystem.selectMainSkill(key)) return;
    this.mainSkillChosen = true;
    if (import.meta.env.DEV && this.captureVideo) this.applyCaptureLoadout();
    this.analytics.event('main_skill', this.state.time, { key });
    if (this.pauseReason === 'main-skill') this.resumeGameplay();
    else Platform.gameplayStart();
    const save = this.registry.get('save');
    if (!save.tutorialDone && !(import.meta.env.DEV && this.stressMode)) this.ui?.showMoveHint();
    if (!save.tutorialGem && !(import.meta.env.DEV && this.stressMode)) {
      const showGemHint = () => {
        if (this.over) return;
        if (this.paused || this.pickups.gemCount === 0) {
          this.time.delayedCall(650, showGemHint);
          return;
        }
        this.ui?.showToast(t('tutorial.gem'), 3.6);
        touchSave(save, { tutorialGem: true });
      };
      // Combo 提示先展示；经验提示稍后接上，避免同时堆叠遮挡战场。
      this.time.delayedCall(5200, showGemHint);
    }
    const comboTipKey = ELEMENT_COMBO_TIPS[SKILLS[key]?.element];
    if (comboTipKey && !(import.meta.env.DEV && this.stressMode)) {
      this.ui?.showToast(t(comboTipKey), 5);
    }
    if (this.startBuffKey) {
      const buff = AD_REWARDS.startBuffs[this.startBuffKey];
      this.ui?.showToast(t('ad.buffActive', { name: t(buff.nameKey) }), 3.2);
    }
    if (this.pendingLevelUps > 0) this.time.delayedCall(120, () => this.tryShowLevelUp());
  }

  // 开发环境宣传片录制专用：直接注入高等级元素技能，不影响正式局成长。
  applyCaptureLoadout() {
    const keys = [...new Set([this.devMainSkill, ...this.captureSkillKeys])].slice(0, 4);
    for (const skillKey of keys) {
      if (!this.weapons.getWeapon(skillKey)) this.weapons.addSkill(skillKey);
      const weapon = this.weapons.getWeapon(skillKey);
      if (!weapon?.skillKey) continue;
      weapon.modules = { scale: 2, power: 3, trait: 2 };
      weapon.lv = Math.min(weapon.def.maxLv, 8);
      weapon.cd = 0.05;
      this.weapons.refreshSkillParams(weapon);
    }
  }

  onChestCollected() {
    if (this.over) return;
    this.pendingLevelUps++;
    this.pendingChoiceSources.push('chest');
    Sfx.chest();
    this.ui?.showToast(t('event.chest'), 2.3);
    this.tryShowLevelUp();
  }

  onSpecialSpawn(kind, event) {
    if (import.meta.env.DEV && this.stressMode) return;
    const key = kind === 'elite' ? 'event.elite'
      : kind === 'treasure' ? 'event.treasure'
        : kind === 'final' ? 'event.finalBoss' : 'event.boss';
    this.ui?.showToast(t(key, { tier: event.tier || '' }), kind === 'final' ? 4.5 : 3.2);
    this.analytics.event('spawn', this.state.time, { kind, tier: event.tier || 0 });
    if (kind !== 'elite' && kind !== 'treasure') Sfx.bossIn(kind === 'final');
    if (kind !== 'elite' && kind !== 'treasure') this.cameras.main.shake(260, kind === 'final' ? 0.012 : 0.007);
  }

  recordDamage(source, amount) {
    this.state.damage[source] = (this.state.damage[source] || 0) + amount;
  }

  // 局外重摇保留一张旧选项、替换其余三张，避免局外资源直接控制整组 build。
  buildPartialReroll(choices) {
    if (!choices?.length) return this.levelSystem.buildChoices();
    const keep = choices[Math.floor(Math.random() * choices.length)];
    const identity = choice => `${choice.kind}:${choice.key || choice.baseKey || ''}:${choice.moduleKey || ''}:${choice.toLv || 0}`;
    const oldIds = new Set(choices.map(identity));
    const seen = new Set([identity(keep)]);
    const next = [keep];
    for (let attempt = 0; attempt < 4 && next.length < choices.length; attempt++) {
      for (const choice of this.levelSystem.buildChoices()) {
        const id = identity(choice);
        if (seen.has(id) || oldIds.has(id)) continue;
        seen.add(id);
        next.push(choice);
        if (next.length >= choices.length) break;
      }
    }
    // 可选池太小时允许旧卡回填，保证 UI 始终有完整选项。
    for (const choice of choices) {
      if (next.length >= choices.length) break;
      const id = identity(choice);
      if (!seen.has(id)) next.push(choice);
    }
    return next;
  }

  tryShowLevelUp() {
    if (this.paused || this.over || this.pendingLevelUps <= 0 || !this.ui) return;
    const source = this.pendingChoiceSources[0] || 'level';
    if (import.meta.env.DEV && this.autoplay) {
      const choices = this.levelSystem.buildChoices();
      this.levelSystem.noteOfferedChoices(choices);
      this.levelSystem.apply(choices[0]);
      this.pendingLevelUps--;
      this.pendingChoiceSources.shift();
      if (this.pendingLevelUps > 0) this.time.delayedCall(20, () => this.tryShowLevelUp());
      return;
    }
    this.adRerollUsed = false;
    this.pauseGameplay('level');
    const firstChoices = this.levelSystem.buildChoices();
    const showChoices = (choices = firstChoices) => this.ui.overlay.show(choices, (choice) => {
      if (this.adBusy) return;
      this.levelSystem.noteOfferedChoices(choices);
      this.levelSystem.apply(choice);
      this.analytics.event('upgrade', this.state.time, {
        kind: choice.kind, key: choice.key || 'heal', level: choice.toLv || 0, source,
      });
      this.pendingLevelUps--;
      this.pendingChoiceSources.shift();
      this.resumeGameplay();
      if (this.pendingLevelUps > 0) this.time.delayedCall(60, () => this.tryShowLevelUp());
    }, {
      rerolls: this.rerolls,
      onReroll: () => {
        if (this.rerolls <= 0) return;
        this.rerolls--;
        this.analytics.event('reroll', this.state.time, { remaining: this.rerolls });
        showChoices(this.buildPartialReroll(choices));
      },
      adReroll: Platform.supportsRewardedAds() && !this.adRerollUsed,
      onAdReroll: async () => {
        if (this.adBusy || this.adRerollUsed) return;
        this.adBusy = true;
        this.adRerollUsed = true;
        this.ui.overlay.setBusy(true);
        let rewarded = false;
        try {
          rewarded = await Platform.rewardedAd();
        } finally {
          this.adBusy = false;
          this.input.enabled = true;
          if (this.ui?.input) this.ui.input.enabled = true;
        }
        if (rewarded) {
          this.analytics.event('reroll_ad', this.state.time);
          showChoices(this.levelSystem.buildChoices());
        } else {
          showChoices(choices);
        }
      },
      jackpot: false,
      playOpenSfx: source !== 'chest',
    });
    showChoices(firstChoices);
  }

  onPlayerDeath() {
    if (this.over) return;
    if (this.pauseReason === 'level') this.ui?.overlay.hide();
    this.pauseGameplay('death');
    if (this.revives > 0 && !this.over) {
      this.revives--;
      this.analytics.event('revive', this.state.time, { remaining: this.revives });
      this.time.delayedCall(700, () => {
        this.player.revive({
          hpPct: TALENTS.secondWind.reviveHpPct,
          invulnerableSec: TALENTS.secondWind.reviveInvulnerableSec,
        });
        this.resumeGameplay();
        if (this.pendingLevelUps > 0) this.time.delayedCall(60, () => this.tryShowLevelUp());
        this.ui?.showToast(t('event.revive'), 2.5);
        Sfx.revive();
        this.cameras.main.flash(450, 210, 240, 170);
      });
      return;
    }
    if (Platform.supportsRewardedAds() && !this.adReviveUsed) {
      this.ui?.showActionModal({
        title: t('ad.reviveTitle'), description: t('ad.reviveDesc'),
        primaryLabel: t('ad.endRun'), onPrimary: () => this.finishRun(false, 'death'),
        secondaryLabel: t('ad.revive'), onSecondary: () => this.tryAdRevive(),
      });
      return;
    }
    this.finishRun(false, 'death');
  }

  async tryAdRevive() {
    if (this.adBusy || this.adReviveUsed || this.over) return;
    this.adBusy = true;
    this.adReviveUsed = true;
    this.ui?.actionModal.setSecondaryBusy(t('ad.loading'));
    let rewarded = false;
    try {
      rewarded = await Platform.rewardedAd();
    } finally {
      this.adBusy = false;
      this.input.enabled = true;
      if (this.ui?.input) this.ui.input.enabled = true;
    }
    if (this.over) return;
    if (!rewarded) {
      this.ui?.showActionModal({
        title: t('ad.reviveTitle'),
        description: `${t('ad.reviveDesc')}\n${t('ad.unavailable')}`,
        primaryLabel: t('ad.endRun'), onPrimary: () => this.finishRun(false, 'death'),
        secondaryLabel: t('ad.revive'), onSecondary: () => this.tryAdRevive(),
      });
      this.ui?.showToast(t('ad.unavailable'), 2.8);
      this.adReviveUsed = false;
      return;
    }
    const cfg = AD_REWARDS.revive;
    const cleared = this.enemies.clearAround(this.player.x, this.player.y, cfg.clearRadius);
    this.player.revive({ hpPct: cfg.hpPct, invulnerableSec: cfg.invulnerableSec });
    this.analytics.event('revive_ad', this.state.time, { cleared });
    this.pauseReason = 'ad-revive-ready';
    const continueAfterReward = () => {
      if (this.over || this.pauseReason !== 'ad-revive-ready') return;
      this.ui?.hideActionModal();
      this.resumeGameplay();
      if (this.pendingLevelUps > 0) this.time.delayedCall(60, () => this.tryShowLevelUp());
      this.ui?.showToast(t('event.revive'), 2.5);
      Sfx.revive();
      this.cameras.main.flash(520, 210, 240, 170);
    };
    if (!this.ui) {
      continueAfterReward();
      return;
    }
    this.ui.showActionModal({
      title: t('event.revive'),
      description: t('pause.desc'),
      primaryLabel: t('pause.resume'),
      onPrimary: continueAfterReward,
    });
  }

  finishRun(victory, reason) {
    if (this.over) return;
    this.over = true;
    Platform.gameplayStop();
    if (victory) {
      Platform.happytime();
      Platform.reportCompletion(100);
    }
    setAudioPaused(false, 'game-pause');
    stopStageAudio();
    if (victory) Sfx.victory();
    else Sfx.gameOver();

    // 结算与存档
    const save = this.registry.get('save');
    const time = Math.floor(this.state.time);
    const newBest = time > save.bestTime;
    const reward = calculateRunReward({ time, kills: this.state.kills });
    const analysis = this.analytics.finish({
      victory, reason, time, x: this.player.x, y: this.player.y, kills: this.state.kills,
      level: this.levelSystem.lv, damage: this.state.damage,
    });
    touchSave(save, {
      bestTime: Math.max(save.bestTime, time),
      bestKills: Math.max(save.bestKills, this.state.kills),
      runs: save.runs + 1,
      diamonds: save.diamonds + reward.total,
      analytics: [...(save.analytics || []), analysis].slice(-20),
    });

    this.player.spr.setTint(victory ? 0xffd34e : 0x666666);
    this.cameras.main.fadeOut(700, 6, 10, 7);
    this.time.delayedCall(750, () => {
      this.scene.start('Result', {
        time,
        kills: this.state.kills,
        lv: this.levelSystem.lv,
        newBest,
        victory,
        reason,
        difficulty: this.difficulty.key,
        damage: this.state.damage,
        reward,
        character: this.character.key,
      });
    });
  }

  onShutdown() {
    this.scale.off('resize', this._onResize);
    window.removeEventListener('keydown', this._onPauseKey);
    window.removeEventListener('platform-ad-state', this._onAdState);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.inputCtl?.destroy();
    this.runEvents?.destroy();
    this.vfx?.destroy();
    this.anims.resumeAll();
    setAudioPaused(false, 'game-pause');
    this.scene.stop('GameUi');
  }
}
