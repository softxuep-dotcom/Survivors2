// 敌人：对象池 + 空间网格 + 刷怪导演。位移纯数学，无物理引擎（GDD §8.2）。
import Phaser from 'phaser';
import {
  ENEMY_TYPES, ENEMY_VARIANTS, PERF, SPAWN_TIMELINE, SPAWN_EVENTS, SPAWN_RING,
  BOSS_HP_MULT, ELITE_HP_MULT, BOSS_SKILL, FINAL_BOSS, PLAYER, WEAPONS, EVOLUTIONS, SKILLS,
  ELEMENT_SYNERGY, ENEMY_BEHAVIOR, ENEMY_HIT_FX,
  hpGrowth, specialHpGrowth,
} from '../config.js';
import { Pool } from '../core/Pool.js';
import { SpatialGrid } from '../core/SpatialGrid.js';
import { Sfx } from '../audio.js';
import {
  enemyAtlasKey, enemyAnimKey, enemyAnimationSource, enemyDirectionFlipX,
  enemyPlaybackDirection,
} from '../textures.js';

const ANIM_REFRESH = 0.12; // 朝向动画刷新间隔（错帧分摊）
const FLIGHT_APPROACH = 0;
const FLIGHT_WINDUP = 1;
const FLIGHT_DASH = 2;
const FLIGHT_RECOVER = 3;
const RUNNER_CHASE = 0;
const RUNNER_WINDUP = 1;
const RUNNER_DASH = 2;
const RUNNER_RECOVER = 3;
const MAX_ENEMY_RADIUS = 52;
const BOSS_CHASE = 0;
const BOSS_WINDUP = 1;
const BOSS_CHARGE = 2;
// 冲锋预警危险度配色：蓄力开始琥珀 → 临释放血红。
const WARN_AMBER = { r: 0xff, g: 0xb0, b: 0x20 };
const WARN_RED = { r: 0xff, g: 0x2a, b: 0x12 };
const CHARGE_TRAIL_TINT = 0xff7a44;
const CHARGE_TRAIL_TINT_FINAL = 0xff4a3a;
const CHARGE_TRAIL_INTERVAL = 0.03;
const BOSS_RECOVER = 3;
const ARMORED_OPTIONS = Object.freeze({
  variant: 'armored', hpMult: ENEMY_VARIANTS.armored.hpMult,
  scale: ENEMY_VARIANTS.armored.scale, tint: ENEMY_VARIANTS.armored.tint,
});
const TREASURE_OPTIONS = Object.freeze({
  variant: 'treasure', treasure: true, rewardChest: true,
  hpMult: ENEMY_VARIANTS.treasure.hpMult, scale: ENEMY_VARIANTS.treasure.scale,
  tint: ENEMY_VARIANTS.treasure.tint,
});

export class EnemyManager {
  constructor(scene) {
    this.scene = scene;
    this.grid = new SpatialGrid(PERF.gridCell);
    this.active = [];
    this.deadBuffer = []; // 本帧死亡的敌人，下帧网格重建后才回池（防止残留引用被复用）
    this.maxAlive = PERF.maxEnemies;
    this.spawnAcc = 0;
    this.firedEvents = new Set();
    this.treasureSpawned = 0;
    this.bossCastLock = 0;
    this.poisonFireFrameTime = -1;
    this.poisonFireFrameCount = 0;
    this.poisonFireQueue = Array.from({ length: ELEMENT_SYNERGY.poisonFire.maxQueue }, () => ({
      x: 0, y: 0, damage: 0, labelY: 0, source: '',
    }));
    this.poisonFireQueueHead = 0;
    this.poisonFireQueueTail = 0;
    this.poisonFireQueueCount = 0;
    this.poisonFireVictims = [];
    this.poisonFireVisualCells = Array.from({ length: 6 }, () => ({ x: 0, y: 0, expiresAt: 0 }));
    this.bossWarnings = [];
    for (let i = 0; i < 4; i++) {
      // ADD 混合让危险带在暗色地面上发光；渐变纹理带羽化边与末端淡出。
      const lane = scene.add.image(0, 0, 'charge_lane').setOrigin(0, 0.5).setDepth(1.81)
        .setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setActive(false);
      const core = scene.add.image(0, 0, 'charge_core').setOrigin(0, 0.5).setDepth(1.82)
        .setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setActive(false);
      const arrow = scene.add.image(0, 0, 'charge_arrow').setOrigin(0.5, 0.5).setDepth(1.83)
        .setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setActive(false);
      this.bossWarnings.push({ lane, core, arrow, owner: null });
    }
    this.bossFireballs = [];
    this.bossFireballPool = new Pool(() => ({
      x: 0, y: 0, vx: 0, vy: 0, life: 0, trailT: 0, damage: 0,
      kind: 'fireball', final: false, radius: 0, explosionRadius: 0,
      spr: scene.add.image(0, 0, 'fireball').setDepth(3.35).setVisible(false).setActive(false),
    }));
    this.bossFireballPool.warm(Math.max(BOSS_SKILL.fireball.maxActive, FINAL_BOSS.maxProjectiles));

    this.pool = new Pool(
      () => {
        const spr = scene.add.sprite(0, 0, enemyAtlasKey('slime')).setVisible(false).setActive(false).setDepth(2);
        const shadow = scene.add.image(0, 0, 'shadow').setVisible(false).setActive(false).setDepth(1.5);
        const statusSpr = scene.add.image(0, 0, 'status_poison').setVisible(false).setActive(false).setDepth(3.15);
        return {
          x: 0, y: 0, hp: 0, maxHp: 0, type: null, radius: 20,
          hitCd: 0, flashT: 0, flashDuration: 0, flashStyle: '', flashPhase: -1,
          animT: 0, animDir: '', spr, shadow,
          elite: false, bossTier: 0, final: false, rewardChest: false,
          finalCharacter: '', mirrorWeapon: '', mirrorAttackCd: 0,
          mirrorWindup: 0, mirrorAimAngle: 0,
          visualType: '', variant: '', treasure: false,
          scale: 1, spriteScale: 1, speedMult: 1, baseTint: null,
          lastMoveX: 1, lastMoveY: 0,
          runnerState: RUNNER_CHASE, runnerT: 0, runnerCd: 0, runnerDashX: 0, runnerDashY: 0,
          flightState: FLIGHT_APPROACH, flightT: 0, flightPhase: 0, dashX: 0, dashY: 0,
          bossState: BOSS_CHASE, bossSkillT: 0, bossWindupTotal: 0, bossTargetX: 0, bossTargetY: 0,
          bossCastCount: 0, bossChainRemaining: 0, bossChargeHit: false, bossTrailT: 0,
          bossRoarT: 0, bossRoarCd: 0, bossRoarFxT: 0,
          bossSummonT: 0, bossSummonCount: 0,
          bossFireballCd: 0, bossFireballWindup: 0, bossFireballTargetX: 0, bossFireballTargetY: 0,
          bossWarning: null,
          slowT: 0, slow: 0, freezeT: 0, freezeFxActive: false,
          freezeFxAge: 0, stunT: 0,
          poisonT: 0, poisonTick: 0, poisonDps: 0, poisonSource: '', plague: false,
          plagueDepth: 0, plagueMaxDepth: 0,
          vulnT: 0, vuln: 0, vulnFxT: 0,
          shieldFxT: 0,
          igniteNextT: 0,
          fireZoneNextHit: 0, poisonZoneNextHit: 0,
          statusStyle: '', statusPhase: 0, statusSpr,
        };
      },
    );
    // 正常局一次性预热到同屏预算；刷怪过程中不再创建 Phaser 对象。
    this.pool.warm(PERF.maxEnemies);
  }

  get aliveCount() { return this.active.length; }

  skipEventsBefore(timeSec) {
    for (let i = 0; i < SPAWN_EVENTS.length; i++) {
      if (SPAWN_EVENTS[i].at < timeSec) this.firedEvents.add(i);
    }
  }

  // 新一帧刷怪前回收上帧死亡对象；随后 update 会立即重建网格，不会残留旧引用。
  recycleDead() {
    for (let i = 0; i < this.deadBuffer.length; i++) this.pool.release(this.deadBuffer[i]);
    this.deadBuffer.length = 0;
  }

  // ---------- 刷怪 ----------
  currentPhase(timeSec) {
    let phase = SPAWN_TIMELINE[0];
    for (const ph of SPAWN_TIMELINE) {
      if (timeSec >= ph.from) phase = ph;
      else break;
    }
    return phase;
  }

  pickType(types) {
    let total = 0;
    for (const w of Object.values(types)) total += w;
    let r = Math.random() * total;
    for (const [key, w] of Object.entries(types)) {
      r -= w;
      if (r <= 0) return key;
    }
    return Object.keys(types)[0];
  }

  updateSpawner(dt, timeSec, player) {
    this.recycleDead();
    // 脚本事件（开局围怪 / 小尸潮）
    for (let i = 0; i < SPAWN_EVENTS.length; i++) {
      const ev = SPAWN_EVENTS[i];
      if (timeSec >= ev.at && !this.firedEvents.has(i)) {
        if (ev.kind === 'burst') {
          for (let n = 0; n < ev.count; n++) {
            this.spawnAround(player, ev.type || 'slime', timeSec, ev.ringMin, ev.ringMax);
          }
          this.firedEvents.add(i);
        } else if (ev.kind === 'elite') {
          if (!this.makeRoomForSpecial(player, 1)) continue;
          const elite = this.spawnAround(player, ev.type, timeSec, undefined, undefined, {
            elite: true, hpMult: ELITE_HP_MULT, speedMult: 1.08, scale: 1.6, rewardChest: true,
          });
          if (!elite) continue;
          this.firedEvents.add(i);
          this.scene.onSpecialSpawn?.('elite', ev);
        } else if (ev.kind === 'boss') {
          const bossCount = ev.count || 1;
          if (!this.makeRoomForSpecial(player, bossCount)) continue;
          const hpMult = BOSS_HP_MULT[ev.tier] || 1;
          let spawned = 0;
          for (let n = 0; n < bossCount; n++) {
            if (this.spawnAround(player, 'boss', timeSec, undefined, undefined, {
              bossTier: ev.tier, final: !!ev.final, hpMult, speedMult: 1 + ev.tier * 0.04,
              scale: ev.final ? 1.35 : 1 + ev.tier * 0.06,
              fixedHp: ev.final ? FINAL_BOSS.hp : 0,
              finalCharacter: ev.final ? (this.scene.characterKey === 'witch' ? 'knight' : 'witch') : '',
              mirrorWeapon: ev.final ? (this.scene.characterKey === 'witch' ? 'blade' : 'fireball') : '',
              tint: ev.final ? null : undefined,
              bossSkillDelay: 2.4 + n * 2.5,
              // 双 Boss 共用一份宝箱预算，把另一份转移给每局一次的宝藏变体。
              rewardChest: !ev.final && n === 0,
            })) spawned++;
          }
          if (spawned !== bossCount) continue;
          for (let n = 0; n < (ev.guards || 0); n++) {
            this.spawnAround(player, 'tank', timeSec, 500, 650);
          }
          this.firedEvents.add(i);
          this.scene.onSpecialSpawn?.(ev.final ? 'final' : 'boss', ev);
        }
      }
    }
    // 时间线持续生成
    const phase = this.currentPhase(timeSec);
    const cap = Math.min(phase.maxAlive, this.maxAlive);
    this.spawnAcc += phase.rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.active.length >= cap) continue;
      const typeKey = this.pickType(phase.types);
      let options;
      const treasureCfg = ENEMY_VARIANTS.treasure;
      const treasureEligible = this.treasureSpawned < treasureCfg.maxPerRun && timeSec >= treasureCfg.enabledAt;
      const treasureRoll = treasureEligible
        && (timeSec >= treasureCfg.pityAt || Math.random() < treasureCfg.chancePerSpawn);
      if (treasureRoll) options = TREASURE_OPTIONS;
      else if (phase.armoredChance) {
        const typeChanceMult = ENEMY_VARIANTS.armored.chanceMultByType?.[typeKey] || 1;
        if (Math.random() < Math.min(1, phase.armoredChance * typeChanceMult)) options = ARMORED_OPTIONS;
      }

      const spawned = this.spawnAround(player, typeKey, timeSec, undefined, undefined, options);
      if (spawned?.treasure) {
        this.treasureSpawned++;
        this.scene.onSpecialSpawn?.('treasure', { variant: typeKey });
      }
    }
  }

  // 特殊事件必须生成成功。满池时优先回收离玩家最远的普通敌人，复用其池对象腾槽。
  makeRoomForSpecial(player, requiredSlots) {
    while (this.active.length + requiredSlots > this.maxAlive) {
      let farthestIndex = -1;
      let farthestD2 = -1;
      for (let i = 0; i < this.active.length; i++) {
        const e = this.active[i];
        if (e.elite || e.bossTier || e.rewardChest) continue;
        const dx = e.x - player.x, dy = e.y - player.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > farthestD2) { farthestD2 = d2; farthestIndex = i; }
      }
      if (farthestIndex < 0) return false;
      this.releaseActiveAt(farthestIndex);
    }
    return true;
  }

  // 广告复活清屏不计击杀/掉落，直接回收范围内敌人。
  clearAround(x, y, radius) {
    const r2 = radius * radius;
    let cleared = 0;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      if (e.bossTier) continue;
      const dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy > r2) continue;
      this.releaseActiveAt(i);
      cleared++;
    }
    for (let i = this.bossFireballs.length - 1; i >= 0; i--) {
      const fireball = this.bossFireballs[i];
      const dx = fireball.x - x, dy = fireball.y - y;
      if (dx * dx + dy * dy <= r2) this.releaseBossFireball(i);
    }
    return cleared;
  }

  releaseActiveAt(index) {
    const e = this.active[index];
    if (!e) return null;
    this.releaseBossWarning(e);
    this.active[index] = this.active[this.active.length - 1];
    this.active.pop();
    e.spr.setActive(false).setVisible(false);
    e.shadow.setActive(false).setVisible(false);
    e.statusSpr.setActive(false).setVisible(false).clearTint().setScale(1).setAlpha(1);
    e.statusStyle = '';
    this.pool.release(e);
    return e;
  }

  // 相机可视半径（半对角线）：刷怪环与回收距离都以它为基准，保证任何屏幕尺寸下敌人在屏幕外生成
  viewRadius() {
    const cam = this.scene.cameras.main;
    return Math.hypot(cam.displayWidth, cam.displayHeight) / 2;
  }

  spawnAround(player, typeKey, timeSec, ringMin = SPAWN_RING.min, ringMax = SPAWN_RING.max, options = {}) {
    if (this.active.length >= this.maxAlive) return null;
    const view = this.viewRadius();
    const lo = Math.max(ringMin, view + 70);
    const hi = Math.max(ringMax, lo + 150);
    const a = Math.random() * Math.PI * 2;
    const r = lo + Math.random() * (hi - lo);
    return this.spawn(typeKey, player.x + Math.cos(a) * r, player.y + Math.sin(a) * r, timeSec, options);
  }

  spawn(typeKey, x, y, timeSec = 0, options = {}) {
    if (this.active.length >= this.maxAlive) return null;
    const type = ENEMY_TYPES[typeKey];
    if (!type) throw new Error(`Unknown enemy type: ${typeKey}`);
    const e = this.pool.get();
    e.x = x; e.y = y;
    e.type = type;
    const difficultyHp = this.scene.difficulty?.hpMult || 1;
    const growth = options.elite || options.bossTier || options.treasure
      ? specialHpGrowth(timeSec)
      : hpGrowth(timeSec);
    e.maxHp = options.fixedHp || Math.round(type.hp * growth * difficultyHp * (options.hpMult || 1));
    e.hp = e.maxHp;
    e.scale = options.scale || 1;
    e.radius = type.radius * Math.sqrt(e.scale);
    e.hitCd = 0;
    e.flashT = 0;
    e.flashDuration = 0;
    e.flashStyle = '';
    e.flashPhase = -1;
    e.animT = Math.random() * ANIM_REFRESH;
    e.animDir = '';
    e.elite = !!options.elite;
    e.bossTier = options.bossTier || 0;
    e.final = !!options.final;
    e.finalCharacter = options.finalCharacter || '';
    e.mirrorWeapon = options.mirrorWeapon || '';
    e.visualType = e.bossTier === 2 && !e.final ? 'boss2' : type.key;
    e.mirrorAttackCd = 1.0;
    e.mirrorWindup = 0;
    e.mirrorAimAngle = 0;
    e.rewardChest = !!options.rewardChest;
    e.variant = options.variant || '';
    e.treasure = !!options.treasure;
    e.speedMult = options.speedMult || 1;
    e.lastMoveX = 1; e.lastMoveY = 0;
    e.baseTint = options.tint !== undefined
      ? options.tint
      : (e.elite ? 0xffd36d : (e.final ? 0xff6a5e : null));
    e.runnerState = RUNNER_CHASE;
    e.runnerT = 0;
    e.runnerCd = Math.random() * (ENEMY_BEHAVIOR.runner.cooldownSec || 2.5);
    e.runnerDashX = 0; e.runnerDashY = 0;
    e.flightState = FLIGHT_APPROACH;
    e.flightT = Math.random() * 0.8;
    e.flightPhase = Math.random() * Math.PI * 2;
    e.dashX = 0; e.dashY = 0;
    e.bossState = BOSS_CHASE;
    e.bossSkillT = options.bossSkillDelay ?? 2.4;
    e.bossWindupTotal = 0;
    e.bossTargetX = 0; e.bossTargetY = 0;
    e.bossCastCount = 0; e.bossChainRemaining = 0; e.bossChargeHit = false; e.bossTrailT = 0;
    e.bossRoarT = 0;
    e.bossRoarCd = e.bossTier === 2 ? BOSS_SKILL.tier2Roar.firstDelaySec : 0;
    e.bossRoarFxT = 0;
    e.bossSummonT = e.final ? 7 : 0;
    e.bossSummonCount = 0;
    e.bossFireballCd = BOSS_SKILL.fireball.firstDelaySec;
    e.bossFireballWindup = 0;
    e.bossFireballTargetX = 0; e.bossFireballTargetY = 0;
    e.bossWarning = null;
    e.slowT = 0; e.slow = 0; e.freezeT = 0; e.freezeFxActive = false;
    e.freezeFxAge = 0; e.stunT = 0;
    e.poisonT = 0; e.poisonTick = 0; e.poisonDps = 0; e.poisonSource = ''; e.plague = false;
    e.plagueDepth = 0; e.plagueMaxDepth = 0;
    e.vulnT = 0; e.vuln = 0; e.vulnFxT = 0;
    e.shieldFxT = 0;
    e.igniteNextT = 0;
    e.fireZoneNextHit = 0; e.poisonZoneNextHit = 0;
    e.statusStyle = ''; e.statusPhase = Math.random() * Math.PI * 2;
    e.statusSpr.setActive(false).setVisible(false).clearTint().setScale(1).setAlpha(1);

    // 同一池对象可能刚刚属于另一敌人类型；换图集后再派生朝向动画。
    const spriteTexture = e.finalCharacter ? `player_${e.finalCharacter}_walk` : enemyAtlasKey(e.visualType);
    e.spr.stop().setTexture(spriteTexture)
      .setActive(true).setVisible(true).setPosition(x, y)
      .setTintMode(Phaser.TintModes.MULTIPLY).clearTint();
    if (e.baseTint != null) e.spr.setTint(e.baseTint);
    this.playDirection(e, 1, 0);
    e.spriteScale = type.spriteH / (e.spr.height || 72) * e.scale;
    e.spr.setScale(e.spriteScale).setAlpha(1);
    e.shadow.setTexture('shadow').setActive(true).setVisible(!type.bakedShadow)
      .setDisplaySize((type.shadowW || type.radius * 2) * e.scale, type.radius * 0.7 * e.scale)
      .setAlpha(0.35)
      .setPosition(x, y + type.spriteH * 0.42 * e.scale);

    this.active.push(e);
    return e;
  }

  playDirection(e, dx, dy) {
    if (e.freezeFxActive || e.freezeT > 0) {
      e.spr.anims.pause();
      return;
    }
    if (e.finalCharacter) {
      const animKey = `player_${e.finalCharacter}_walk_right`;
      if (this.scene.anims.exists(animKey) && e.spr.anims.currentAnim?.key !== animKey) {
        e.spr.play(animKey, true);
      }
      if (Math.abs(dx) > 0.05) e.spr.setFlipX(dx < 0);
      return;
    }
    const dir = enemyPlaybackDirection(dx, dy);
    if (!dir || dir === e.animDir) return;
    const visualType = e.visualType || e.type.key;
    const source = enemyAnimationSource(this.scene, visualType, dir);
    if (!source) return;
    e.animDir = dir;
    e.spr.play(enemyAnimKey(visualType, source), true);
    e.spr.setFlipX(enemyDirectionFlipX(dir));
  }

  acquireBossWarning(e) {
    if (e.bossWarning) return e.bossWarning;
    const slot = this.bossWarnings.find(entry => !entry.owner);
    if (!slot) return null;
    slot.owner = e;
    e.bossWarning = slot;
    slot.lane.setActive(true).setVisible(true).setAlpha(0.32);
    slot.core.setActive(true).setVisible(true).setAlpha(0.72);
    slot.arrow.setActive(true).setVisible(true).setAlpha(0.9);
    return slot;
  }

  releaseBossWarning(e) {
    const slot = e?.bossWarning;
    if (!slot) return;
    slot.owner = null;
    slot.lane.setActive(false).setVisible(false).setAlpha(0);
    slot.core.setActive(false).setVisible(false).setAlpha(0);
    slot.arrow.setActive(false).setVisible(false).setAlpha(0);
    e.bossWarning = null;
  }

  startBossCharge(e, player, chained = false) {
    const warning = this.acquireBossWarning(e);
    if (!warning) return false;
    e.bossState = BOSS_WINDUP;
    e.bossSkillT = chained ? BOSS_SKILL.chainWindupSec : BOSS_SKILL.windupSec;
    e.bossWindupTotal = e.bossSkillT;
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const distance = Math.hypot(dx, dy) || 1;
    e.bossTargetX = dx / distance;
    e.bossTargetY = dy / distance;
    e.bossChargeHit = false;
    this.updateBossWarning(e, 0);
    Sfx.bossChargeWarn(e.final, chained);
    return true;
  }

  updateBossWarning(e, timeSec) {
    const warning = e.bossWarning;
    if (!warning) return;
    const speed = BOSS_SKILL.chargeSpeedByTier[e.bossTier] || BOSS_SKILL.chargeSpeedByTier[1];
    const duration = BOSS_SKILL.chargeSecByTier[e.bossTier] || BOSS_SKILL.chargeSecByTier[1];
    const width = BOSS_SKILL.chargeWidthByTier[e.bossTier] || BOSS_SKILL.chargeWidthByTier[1];
    const length = speed * duration;
    const angle = Math.atan2(e.bossTargetY, e.bossTargetX);
    const total = e.bossWindupTotal || BOSS_SKILL.windupSec;
    const progress = Math.max(0, Math.min(1, 1 - e.bossSkillT / total));
    // 危险度配色：琥珀→血红；临释放脉动频率越来越快，制造"要来了"的紧迫感。
    const step = Math.round(progress * 100);
    const tint = Phaser.Display.Color.GetColor(
      Math.round(WARN_AMBER.r + (WARN_RED.r - WARN_AMBER.r) * step / 100),
      Math.round(WARN_AMBER.g + (WARN_RED.g - WARN_AMBER.g) * step / 100),
      Math.round(WARN_AMBER.b + (WARN_RED.b - WARN_AMBER.b) * step / 100),
    );
    const pulse = 0.5 + 0.5 * Math.sin(timeSec * (11 + progress * 24));
    warning.lane.setPosition(e.x, e.y).setRotation(angle).setTint(tint)
      .setDisplaySize(length, width).setAlpha(0.26 + progress * 0.3);
    warning.core.setPosition(e.x, e.y).setRotation(angle).setTint(tint)
      .setDisplaySize(length, 7 + progress * 7)
      .setAlpha(0.5 + progress * 0.32 + pulse * 0.12);
    // 末端箭头：指向冲锋方向，随蓄力放大并脉动，一眼看清"往哪冲"。
    warning.arrow.setPosition(e.x + e.bossTargetX * length, e.y + e.bossTargetY * length)
      .setRotation(angle).setTint(tint)
      .setScale((0.75 + progress * 0.5) + pulse * 0.14)
      .setAlpha(0.7 + progress * 0.3);
  }

  spawnBossGuards(e, timeSec, count, forcedType = '') {
    const phase = this.currentPhase(timeSec);
    for (let n = 0; n < count; n++) {
      const a = (n / count) * Math.PI * 2 + Math.random() * 0.35;
      const r = 110 + Math.random() * 55;
      const typeKey = forcedType || this.pickType(phase.types);
      this.spawn(typeKey, e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, timeSec);
    }
  }

  beginBossCharge(e) {
    this.releaseBossWarning(e);
    e.bossState = BOSS_CHARGE;
    e.bossSkillT = BOSS_SKILL.chargeSecByTier[e.bossTier] || BOSS_SKILL.chargeSecByTier[1];
    e.bossChargeHit = false;
    this.scene.cameras.main.shake(90, e.final ? 0.006 : 0.004);
    Sfx.bossChargeStart(e.final);
  }

  finishBossCharge(e, player, timeSec) {
    e.bossCastCount++;

    if (e.bossTier === 2) {
      this.spawnBossGuards(e, timeSec, BOSS_SKILL.tier2RunnerCount, 'runner');
      Sfx.bossSummon(false);
    }
    if (e.bossChainRemaining > 0) {
      e.bossChainRemaining--;
      this.startBossCharge(e, player, true);
      return;
    }
    e.bossState = BOSS_RECOVER;
    e.bossSkillT = BOSS_SKILL.recoverSec;
  }

  bossCooldown(e) {
    const base = BOSS_SKILL.cooldownByTier[e.bossTier] || BOSS_SKILL.cooldownByTier[1];
    return e.final && e.hp / e.maxHp <= 0.5 ? base * 0.8 : base;
  }

  startBossFireball(e, player) {
    const cfg = BOSS_SKILL.fireball;
    e.bossFireballWindup = cfg.windupSec;
    e.bossFireballTargetX = player.x;
    e.bossFireballTargetY = player.y;
    this.bossCastLock = cfg.windupSec + cfg.sharedCastLockSec;
    this.scene.vfx.areaPulse(e.x, e.y - e.type.spriteH * 0.2 * e.scale, 58, 0xff8a3c);
    Sfx.bossFireballWarn(e.final);
  }

  launchBossFireball(e) {
    const cfg = BOSS_SKILL.fireball;
    const cooldownMult = e.bossTier === 2 ? BOSS_SKILL.tier2FireballCooldownMult : 1;
    e.bossFireballCd = cfg.cooldownSec * cooldownMult;
    if (this.bossFireballs.length >= cfg.maxActive) return;
    const x = e.x;
    const y = e.y - e.type.spriteH * 0.2 * e.scale;
    const dx = e.bossFireballTargetX - x;
    const dy = e.bossFireballTargetY - y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    const fireball = this.bossFireballPool.get();
    fireball.x = x; fireball.y = y;
    fireball.vx = Math.cos(angle) * cfg.speed;
    fireball.vy = Math.sin(angle) * cfg.speed;
    fireball.damage = cfg.damage + Math.max(0, e.bossTier - 1) * cfg.damagePerTier;
    fireball.kind = 'fireball';
    fireball.final = e.final;
    fireball.radius = cfg.projectileRadius;
    fireball.explosionRadius = cfg.explosionRadius;
    fireball.life = Math.max(0.18, distance / cfg.speed);
    fireball.trailT = 0;
    fireball.spr.setActive(true).setVisible(true).setPosition(x, y)
      .setRotation(angle).setScale(1.06).setAlpha(1).clearTint();
    this.bossFireballs.push(fireball);
    Sfx.bossFireball(e.final);
  }

  startBossRoar(e) {
    const cfg = BOSS_SKILL.tier2Roar;
    e.bossRoarT = cfg.durationSec;
    e.bossRoarCd = cfg.cooldownSec;
    e.bossRoarFxT = 0;
    this.scene.vfx.areaPulse(e.x, e.y, 118, 0xffb24d);
    this.scene.cameras.main.shake(110, 0.0045);
    Sfx.bossRoar(e.final);
  }

  startMirrorVolley(e, player) {
    e.mirrorWindup = FINAL_BOSS.windupSec;
    e.mirrorAimAngle = Math.atan2(player.y - e.y, player.x - e.x);
    const color = e.mirrorWeapon === 'blade' ? 0xd8ecff : 0xff8a3c;
    this.scene.vfx.areaPulse(e.x, e.y - e.type.spriteH * 0.2 * e.scale, 62, color);
    Sfx.bossMirrorWarn(e.mirrorWeapon);
  }

  launchMirrorVolley(e) {
    const def = WEAPONS[e.mirrorWeapon];
    const level = FINAL_BOSS.mirrorWeaponLevels[e.mirrorWeapon] || def?.levels?.[def.levels.length - 1];
    if (!def || !level) return;
    const count = level.count || 1;
    const spread = Phaser.Math.DegToRad(def.volleySpreadDeg || 0);
    const start = -spread * (count - 1) / 2;
    const texture = def.projTexture || e.mirrorWeapon;
    const radius = def.projRadius || 12;
    for (let i = 0; i < count; i++) {
      if (this.bossFireballs.length >= FINAL_BOSS.maxProjectiles) break;
      const angle = e.mirrorAimAngle + start + spread * i;
      const projectile = this.bossFireballPool.get();
      projectile.x = e.x;
      projectile.y = e.y - e.type.spriteH * 0.2 * e.scale;
      projectile.vx = Math.cos(angle) * level.speed;
      projectile.vy = Math.sin(angle) * level.speed;
      projectile.damage = FINAL_BOSS.projectileDamage;
      projectile.kind = e.mirrorWeapon;
      projectile.final = true;
      projectile.radius = radius;
      projectile.explosionRadius = e.mirrorWeapon === 'fireball' ? level.aoe : 0;
      projectile.life = level.range / level.speed;
      projectile.trailT = 0;
      projectile.spr.setTexture(texture).setActive(true).setVisible(true)
        .setPosition(projectile.x, projectile.y).setRotation(angle)
        .setScale(e.mirrorWeapon === 'fireball' ? 1.08 : 1).setAlpha(1).clearTint();
      this.bossFireballs.push(projectile);
    }
    Sfx.weaponCast(e.mirrorWeapon);
  }

  releaseBossFireball(index) {
    const fireball = this.bossFireballs[index];
    if (!fireball) return;
    this.bossFireballs[index] = this.bossFireballs[this.bossFireballs.length - 1];
    this.bossFireballs.pop();
    fireball.spr.setActive(false).setVisible(false).setAlpha(0);
    fireball.final = false;
    this.bossFireballPool.release(fireball);
  }

  explodeBossFireball(index, player) {
    const fireball = this.bossFireballs[index];
    if (!fireball) return;
    const explosionRadius = fireball.explosionRadius || BOSS_SKILL.fireball.explosionRadius;
    this.scene.vfx.fireExplosion(fireball.x, fireball.y, explosionRadius, 0xff6d32, false, 'fire');
    Sfx.bossFireballImpact(fireball.final);
    if (Math.hypot(player.x - fireball.x, player.y - fireball.y) <= explosionRadius + 18) {
      player.takeDamage(fireball.damage);
    }
    this.releaseBossFireball(index);
  }

  updateBossFireballs(dt, player) {
    const cfg = BOSS_SKILL.fireball;
    for (let i = this.bossFireballs.length - 1; i >= 0; i--) {
      const fireball = this.bossFireballs[i];
      fireball.life -= dt;
      fireball.x += fireball.vx * dt;
      fireball.y += fireball.vy * dt;
      fireball.spr.setPosition(fireball.x, fireball.y);
      fireball.trailT -= dt;
      if (fireball.kind === 'fireball' && fireball.trailT <= 0) {
        fireball.trailT += cfg.trailIntervalSec;
        this.scene.vfx.fireTrail(fireball.x, fireball.y, Math.atan2(fireball.vy, fireball.vx), 'fire', 1.06);
      }
      const hitPlayer = Math.hypot(player.x - fireball.x, player.y - fireball.y)
        <= fireball.radius + 18;
      if (fireball.kind === 'blade') {
        if (hitPlayer) {
          player.takeDamage(fireball.damage);
          this.releaseBossFireball(i);
        } else if (fireball.life <= 0) {
          this.releaseBossFireball(i);
        }
      } else if (hitPlayer || fireball.life <= 0) {
        this.explodeBossFireball(i, player);
      }
    }
  }

  // ---------- 主循环 ----------
  update(dt, player, timeSec) {
    // stress 模式不走 updateSpawner，因此这里保留兜底回收。
    this.recycleDead();
    this.bossCastLock = Math.max(0, this.bossCastLock - dt);
    this.updateBossFireballs(dt, player);

    // 重建空间网格（本帧所有碰撞查询共用）
    this.grid.clear();
    for (let i = 0; i < this.active.length; i++) this.grid.insert(this.active[i]);
    // 战利品道具进同一张网格：武器命中/范围伤害天然覆盖，分离推挤让敌潮自然绕流
    const props = this.scene.props;
    if (props) {
      for (let i = 0; i < props.active.length; i++) this.grid.insert(props.active[i]);
    }
    this.processPoisonFireQueue();

    const px = player.x, py = player.y;
    const maxNb = PERF.separationNeighbors;
    const view = this.viewRadius();
    const farDist = view + 750;        // 被甩太远 → 回收重摆
    const ringLo = view + 90;

    for (let i = 0; i < this.active.length; i++) {
      const e = this.active[i];

      // 持续状态统一在敌人系统结算，武器只提交状态参数。
      if (e.slowT > 0) {
        e.slowT = Math.max(0, e.slowT - dt);
        if (e.slowT === 0) e.slow = 0;
      }
      if (e.freezeT > 0) {
        e.freezeT = Math.max(0, e.freezeT - dt);
        e.freezeFxAge += dt;
        if (e.freezeFxActive && e.freezeT === 0) {
          this.scene.vfx.freezeBreak?.(e.x, e.y, e.radius);
          e.freezeFxActive = false;
          this.refreshStatusVisual(e);
        }
      }
      if (e.stunT > 0) e.stunT -= dt;
      if (e.vulnT > 0) {
        e.vulnT -= dt;
        if (e.vulnT <= 0) { e.vuln = 0; this.refreshStatusVisual(e); }
      }
      if (e.vulnFxT > 0) e.vulnFxT -= dt;
      if (e.shieldFxT > 0) e.shieldFxT -= dt;
      if (e.poisonT > 0) {
        e.poisonT -= dt;
        e.poisonTick -= dt;
        if (e.poisonT <= 0) {
          e.poisonT = 0; e.poisonTick = 0; e.poisonDps = 0; e.poisonSource = ''; e.plague = false;
          e.plagueDepth = 0; e.plagueMaxDepth = 0;
          this.refreshStatusVisual(e);
        } else if (e.poisonTick <= 0) {
          e.poisonTick += 0.25;
          if (this.damage(e, e.poisonDps * 0.25, { source: e.poisonSource || 'poison', quiet: true })) {
            i--;
            continue;
          }
        }
      }
      let dx = px - e.x, dy = py - e.y;
      const dist = Math.hypot(dx, dy) || 0.001;

      // 被甩太远：回收重摆到玩家身边的环上（保持敌潮密度）
      if (dist > farDist) {
        const a = Math.random() * Math.PI * 2;
        const r = ringLo + Math.random() * 160;
        e.x = px + Math.cos(a) * r;
        e.y = py + Math.sin(a) * r;
        continue;
      }

      dx /= dist; dy /= dist;

      // 邻居分离：地面与空中分层；飞行怪只受较弱的同层推挤，避免俯冲预警叠成一团。
      let pushX = 0, pushY = 0, nb = 0;
      const flying = !!e.type.flying;
      const sepR = e.radius * 1.7;
      this.grid.forEachInCircle(e.x, e.y, sepR, (o, d2) => {
        if (o === e || !!o.type.flying !== flying) return false;
        const d = Math.sqrt(d2) || 0.001;
        const overlap = (e.radius + o.radius) * 0.62 - d;
        if (overlap > 0) {
          const layerStrength = flying ? 0.3 : 1;
          pushX += ((e.x - o.x) / d) * overlap * layerStrength;
          pushY += ((e.y - o.y) / d) * overlap * layerStrength;
          nb++;
        }
        return nb >= maxNb;
      });

      const disabled = e.freezeT > 0 || e.stunT > 0;
      const slowMult = e.slowT > 0 ? Math.max(0.2, 1 - e.slow) : 1;
      let moveX = dx, moveY = dy;
      const bossMoveSpeed = e.bossTier && !e.final
        ? (BOSS_SKILL.moveSpeedByTier[e.bossTier] || e.type.speed * e.speedMult)
        : e.type.speed * e.speedMult;
      let spd = disabled ? 0 : bossMoveSpeed * slowMult;

      if (!e.bossTier && e.type.key === 'runner') {
        const cfg = ENEMY_BEHAVIOR.runner;
        if (disabled) {
          e.runnerState = RUNNER_CHASE;
          e.runnerT = 0;
        } else if (e.runnerState === RUNNER_CHASE) {
          e.runnerCd -= dt;
          if (dist <= cfg.engageRange && e.runnerCd <= 0) {
            e.runnerState = RUNNER_WINDUP;
            e.runnerT = cfg.windupSec * (e.elite ? cfg.eliteWindupMult : 1);
            e.runnerDashX = dx; e.runnerDashY = dy;
            this.scene.vfx.areaPulse(e.x, e.y, e.radius * (e.elite ? 2.6 : 2.15), e.elite ? 0xffd36d : 0x9ef3b0);
          }
        } else if (e.runnerState === RUNNER_WINDUP) {
          moveX = e.runnerDashX; moveY = e.runnerDashY;
          spd = 0;
          e.runnerT -= dt;
          if (e.runnerT <= 0) {
            e.runnerState = RUNNER_DASH;
            e.runnerT = cfg.dashSec;
          }
        } else if (e.runnerState === RUNNER_DASH) {
          moveX = e.runnerDashX; moveY = e.runnerDashY;
          spd = cfg.dashSpeed * e.speedMult * slowMult * (e.elite ? cfg.eliteDashSpeedMult : 1);
          e.runnerT -= dt;
          if (e.runnerT <= 0) {
            e.runnerState = RUNNER_RECOVER;
            e.runnerT = cfg.recoverSec;
          }
        } else if (e.runnerState === RUNNER_RECOVER) {
          spd *= 0.42;
          e.runnerT -= dt;
          if (e.runnerT <= 0) {
            e.runnerState = RUNNER_CHASE;
            e.runnerCd = cfg.cooldownSec * (0.82 + Math.random() * 0.28);
          }
        }
      }

      if (e.bossTier === 2 && !e.final) {
        e.bossRoarCd -= dt;
        if (e.bossRoarT > 0) {
          e.bossRoarT = Math.max(0, e.bossRoarT - dt);
          e.bossRoarFxT -= dt;
          if (e.bossRoarFxT <= 0) {
            e.bossRoarFxT = BOSS_SKILL.tier2Roar.pulseIntervalSec;
            this.scene.vfx.areaPulse(e.x, e.y, 104, 0xffb24d);
          }
        } else if (!disabled && e.bossRoarCd <= 0 && e.bossState === BOSS_CHASE
          && e.bossFireballWindup <= 0) {
          this.startBossRoar(e);
        }
        if (e.bossRoarT > 0) spd *= BOSS_SKILL.tier2Roar.speedMult;
      }

      if (flying) {
        const cfg = e.type;
        if (disabled && (e.flightState === FLIGHT_WINDUP || e.flightState === FLIGHT_DASH)) {
          e.flightState = FLIGHT_RECOVER;
          e.flightT = cfg.recoverSec * 0.6;
        }

        if (!disabled && e.flightState === FLIGHT_APPROACH) {
          e.flightT -= dt;
          const weave = Math.sin(timeSec * 4.5 + e.flightPhase) * 0.34;
          moveX = dx - dy * weave;
          moveY = dy + dx * weave;
          const moveLen = Math.hypot(moveX, moveY) || 1;
          moveX /= moveLen; moveY /= moveLen;
          if (dist <= cfg.engageRange && e.flightT <= 0) {
            e.flightState = FLIGHT_WINDUP;
            e.flightT = cfg.windupSec * (e.elite ? ENEMY_BEHAVIOR.flyer.eliteWindupMult : 1);
            e.dashX = dx; e.dashY = dy; // 蓄力开始即锁定方向，俯冲不追踪玩家。
            spd = 0;
          }
        } else if (!disabled && e.flightState === FLIGHT_WINDUP) {
          moveX = e.dashX; moveY = e.dashY;
          spd = 0;
          e.flightT -= dt;
          if (e.flightT <= 0) {
            e.flightState = FLIGHT_DASH;
            e.flightT = cfg.dashSec;
          }
        } else if (!disabled && e.flightState === FLIGHT_DASH) {
          moveX = e.dashX; moveY = e.dashY;
          const dashSlowMult = e.slowT > 0 ? Math.max(0.6, 1 - e.slow * 0.5) : 1;
          spd = cfg.dashSpeed * e.speedMult * dashSlowMult * (e.elite ? ENEMY_BEHAVIOR.flyer.eliteDashSpeedMult : 1);
          e.flightT -= dt;
          if (e.flightT <= 0) {
            e.flightState = FLIGHT_RECOVER;
            e.flightT = cfg.recoverSec * (e.elite ? ENEMY_BEHAVIOR.flyer.eliteRecoverMult : 1);
          }
        } else if (!disabled && e.flightState === FLIGHT_RECOVER) {
          const weave = Math.sin(timeSec * 3.2 + e.flightPhase) * 0.18;
          moveX = dx - dy * weave;
          moveY = dy + dx * weave;
          spd *= 0.55;
          e.flightT -= dt;
          if (e.flightT <= 0) {
            e.flightState = FLIGHT_APPROACH;
            e.flightT = 0.6 + Math.random() * 0.5;
          }
        }
      }

      if (e.bossTier && e.final && e.mirrorWeapon) {
        spd = disabled ? 0 : FINAL_BOSS.moveSpeed * slowMult;
        if (!disabled) e.mirrorAttackCd -= dt;
        if (e.mirrorWindup > 0) {
          spd *= 0.35;
          if (!disabled) e.mirrorWindup -= dt;
          if (!disabled && e.mirrorWindup <= 0) this.launchMirrorVolley(e);
        } else if (!disabled && e.mirrorAttackCd <= 0) {
          const level = FINAL_BOSS.mirrorWeaponLevels[e.mirrorWeapon] || WEAPONS[e.mirrorWeapon].levels.at(-1);
          if (dist <= level.range) {
            this.startMirrorVolley(e, player);
            e.mirrorAttackCd = level.cd;
          }
        }
      } else if (e.bossTier) {
        // 终 Boss 最多召唤两轮普通护卫；不走导演变体抽取，不产生额外宝箱。
        if (e.final && !disabled && e.bossSummonCount < BOSS_SKILL.finalGuardMaxCasts) {
          e.bossSummonT -= dt;
          if (e.bossSummonT <= 0) {
            this.spawnBossGuards(e, timeSec, BOSS_SKILL.finalGuardCount);
            e.bossSummonCount++;
            e.bossSummonT = BOSS_SKILL.finalGuardCooldownSec;
            Sfx.bossSummon(true);
          }
        }

        if (e.bossState === BOSS_CHASE) {
          if (e.bossFireballWindup > 0) {
            spd = 0;
            if (!disabled) e.bossFireballWindup -= dt;
            if (!disabled && e.bossFireballWindup <= 0) this.launchBossFireball(e);
          } else {
            if (!disabled) {
              e.bossSkillT -= dt;
              e.bossFireballCd -= dt;
            }
            if (!disabled && e.bossSkillT <= 0 && dist <= BOSS_SKILL.engageRange
              && this.bossCastLock <= 0) {
              e.bossChainRemaining = e.final ? 1 : 0;
              if (this.startBossCharge(e, player)) {
                this.bossCastLock = BOSS_SKILL.sharedCastGapSec;
                spd = 0;
              }
            } else if (!disabled && e.bossFireballCd <= 0
              && dist <= BOSS_SKILL.fireball.castRange
              && (e.bossSkillT > BOSS_SKILL.fireball.minChargeGapSec || dist > BOSS_SKILL.engageRange)
              && this.bossCastLock <= 0) {
              this.startBossFireball(e, player);
              spd = 0;
            }
          }
        } else if (e.bossState === BOSS_WINDUP) {
          spd = 0;
          if (!disabled) e.bossSkillT -= dt;
          this.updateBossWarning(e, timeSec);
          if (!disabled && e.bossSkillT <= 0) this.beginBossCharge(e);
        } else if (e.bossState === BOSS_CHARGE) {
          moveX = e.bossTargetX;
          moveY = e.bossTargetY;
          spd = disabled ? 0
            : (BOSS_SKILL.chargeSpeedByTier[e.bossTier] || BOSS_SKILL.chargeSpeedByTier[1]);
          if (!disabled) {
            e.bossSkillT -= dt;
            // 冲锋拖尾：尘土 + 能量速度线（节流），给冲锋速度感与重量。
            e.bossTrailT -= dt;
            if (e.bossTrailT <= 0) {
              e.bossTrailT = CHARGE_TRAIL_INTERVAL;
              const ang = Math.atan2(e.bossTargetY, e.bossTargetX);
              this.scene.vfx.bossChargeTrail(e.x, e.y + e.type.spriteH * 0.22 * e.scale, ang,
                e.scale, e.final ? CHARGE_TRAIL_TINT_FINAL : CHARGE_TRAIL_TINT);
            }
          }
          if (!disabled && e.bossSkillT <= 0) {
            spd = 0;
            // 未命中玩家而冲锋结束 → 在 Boss 前方砸出一次冲击（撞地感）。
            if (!e.bossChargeHit) {
              const ang = Math.atan2(e.bossTargetY, e.bossTargetX);
              this.scene.vfx.bossChargeImpact(e.x + e.bossTargetX * e.radius, e.y + e.bossTargetY * e.radius,
                ang, e.final ? CHARGE_TRAIL_TINT_FINAL : CHARGE_TRAIL_TINT);
              Sfx.bossChargeImpact(e.final);
            }
            this.finishBossCharge(e, player, timeSec);
          }
        } else if (e.bossState === BOSS_RECOVER) {
          spd *= 0.35;
          if (!disabled) e.bossSkillT -= dt;
          if (!disabled && e.bossSkillT <= 0) {
            e.bossState = BOSS_CHASE;
            e.bossSkillT = this.bossCooldown(e);
          }
        }
      }

      e.x += (moveX * spd) * dt + pushX * 0.5;
      e.y += (moveY * spd) * dt + pushY * 0.5;
      if (Math.abs(moveX) + Math.abs(moveY) > 0.05) {
        e.lastMoveX = moveX;
        e.lastMoveY = moveY;
      }

      // 接触伤害
      e.hitCd -= dt;
      const contactDist = Math.hypot(px - e.x, py - e.y);
      const chargeWidth = BOSS_SKILL.chargeWidthByTier[e.bossTier] || 0;
      if (e.bossState === BOSS_CHARGE && !e.bossChargeHit && contactDist < chargeWidth * 0.5) {
        const damage = BOSS_SKILL.damageByTier[e.bossTier] || BOSS_SKILL.damageByTier[1];
        player.takeDamage(damage);
        e.bossChargeHit = true;
        e.hitCd = Math.max(e.hitCd, e.type.hitCd);
        this.scene.cameras.main.shake(130, e.final ? 0.008 : 0.005);
        // 命中玩家 → 在接触点沿冲锋方向砸出定向冲击。
        this.scene.vfx.bossChargeImpact(px, py, Math.atan2(e.bossTargetY, e.bossTargetX),
          e.final ? CHARGE_TRAIL_TINT_FINAL : CHARGE_TRAIL_TINT);
        Sfx.bossChargeImpact(e.final);
      }
      if (e.hitCd <= 0 && contactDist < e.radius + 18) {
        player.takeDamage(e.type.dmg);
        e.hitCd = e.type.hitCd;
      }

      // 普通攻击短白闪；雷击用保留纹理细节的两段蓝紫电染。
      this.updateHitFlash(e, dt);

      // 朝向动画（错帧刷新）
      e.animT -= dt;
      if (!disabled && e.animT <= 0) {
        e.animT = ANIM_REFRESH;
        const lockedFlight = flying && (e.flightState === FLIGHT_WINDUP || e.flightState === FLIGHT_DASH);
        const lockedBoss = e.bossTier && (e.bossState === BOSS_WINDUP || e.bossState === BOSS_CHARGE);
        this.playDirection(e, lockedFlight ? e.dashX : lockedBoss ? e.bossTargetX : moveX,
          lockedFlight ? e.dashY : lockedBoss ? e.bossTargetY : moveY);
      }

      const frozen = e.freezeFxActive || e.freezeT > 0;
      if (frozen) e.spr.anims.pause();
      const bob = frozen ? 0 : flying ? Math.sin(timeSec * 6 + e.flightPhase) * 5 : 0;
      const runnerWindupPulse = !frozen && e.type.key === 'runner' && e.runnerState === RUNNER_WINDUP
        ? 1 + 0.12 * Math.sin(timeSec * 34 + e.statusPhase)
        : 1;
      const runnerDashPulse = !frozen && e.type.key === 'runner' && e.runnerState === RUNNER_DASH ? 1.08 : 1;
      const windupPulse = !frozen && flying && e.flightState === FLIGHT_WINDUP
        ? 1 + 0.10 * Math.sin(timeSec * 30 + e.flightPhase)
        : 1;
      const bossWindupPulse = !frozen && e.bossTier && e.bossState === BOSS_WINDUP
        ? 1 + 0.09 * Math.sin(timeSec * 24 + e.statusPhase)
        : 1;
      const bossWindupAlpha = !frozen && e.bossTier && e.bossState === BOSS_WINDUP
        ? 0.68 + 0.3 * Math.abs(Math.sin(timeSec * 20 + e.statusPhase))
        : 1;
      const bossRoarPulse = !frozen && e.bossRoarT > 0
        ? 1.035 + 0.025 * Math.sin(timeSec * 18 + e.statusPhase)
        : 1;
      const treasurePulse = !frozen && e.treasure ? 1 + 0.05 * Math.sin(timeSec * 5 + e.flightPhase) : 1;
      const hitPulseScale = e.flashStyle === 'lightning'
        ? ENEMY_HIT_FX.lightning.pulseScale
        : ENEMY_HIT_FX.normal.pulseScale;
      const hitPulse = !frozen && e.flashT > 0
        ? 1 + hitPulseScale
          * Math.sin(Math.PI * (1 - e.flashT / e.flashDuration))
        : 1;
      e.spr.setPosition(e.x, e.y + bob)
        .setScale(e.spriteScale * runnerWindupPulse * runnerDashPulse * windupPulse
          * bossWindupPulse * bossRoarPulse * treasurePulse * hitPulse)
        .setAlpha(flying && e.flightState === FLIGHT_WINDUP
          ? 0.72 + 0.24 * Math.abs(Math.sin(timeSec * 22))
          : e.type.key === 'runner' && e.runnerState === RUNNER_WINDUP
            ? 0.74 + 0.24 * Math.abs(Math.sin(timeSec * 24))
            : bossWindupAlpha);
      if (e.statusStyle === 'freeze') {
        const entry = Math.min(1, e.freezeFxAge / 0.16);
        const ease = 1 - ((1 - entry) ** 3);
        const bodyWidth = Math.max(e.radius * 2.3, e.type.spriteH * 0.72 * e.scale);
        const bodyHeight = e.type.spriteH * 1.04 * e.scale;
        e.shadow.setPosition(e.x, e.y + e.type.spriteH * 0.42 * e.scale)
          .setAlpha(flying ? 0.2 : 0.35);
        const compact = e.statusSpr.texture.key === 'status_freeze_small';
        e.statusSpr.setPosition(e.x, e.y + e.type.spriteH * 0.02 * e.scale)
          .setDisplaySize(bodyWidth * (1.08 - ease * 0.08), bodyHeight * (1.08 - ease * 0.08))
          .setAlpha(((compact ? 0.82 : 0.66) + Math.sin(timeSec * 2.2 + e.statusPhase) * 0.025) * entry)
          .setRotation(0);
      } else if (e.statusStyle) {
        e.shadow.setPosition(e.x, e.y + e.type.spriteH * 0.42 * e.scale)
          .setAlpha(flying ? 0.20 + 0.06 * Math.sin(timeSec * 6 + e.flightPhase) : 0.35);
        e.statusSpr.setPosition(e.x, e.y + bob - e.type.spriteH * 0.64 * e.scale)
          .setAlpha(0.68 + Math.sin(timeSec * 5.2 + e.statusPhase) * 0.18)
          .setScale((e.bossTier ? 1.15 : 0.88) + Math.sin(timeSec * 4.1 + e.statusPhase) * 0.06)
          .setRotation(0);
      } else {
        e.shadow.setPosition(e.x, e.y + e.type.spriteH * 0.42 * e.scale)
          .setAlpha(flying ? 0.20 + 0.06 * Math.sin(timeSec * 6 + e.flightPhase) : 0.35);
      }
    }
  }

  restoreTint(e) {
    e.spr.clearTint();
    if (e.statusStyle === 'freeze') {
      const compact = !e.bossTier && e.type.spriteH * e.scale < 72;
      e.spr.setTintMode(compact ? Phaser.TintModes.FILL : Phaser.TintModes.MULTIPLY)
        .setTint(compact ? 0x86cde4 : 0xa6d9eb);
      return;
    }
    e.spr.setTintMode(Phaser.TintModes.MULTIPLY);
    if (e.baseTint != null) e.spr.setTint(e.baseTint);
    else if (e.statusStyle === 'plague') e.spr.setTint(0xb9a4ca);
    else if (e.statusStyle === 'corrosion') e.spr.setTint(0xdff58d);
    else if (e.statusStyle === 'poison') e.spr.setTint(0xb8e6ad);
  }

  applyHitFlash(e, element) {
    const lightning = element === 'lightning';
    const fx = lightning ? ENEMY_HIT_FX.lightning : ENEMY_HIT_FX.normal;
    e.flashT = fx.duration;
    e.flashDuration = e.flashT;
    e.flashStyle = lightning
      ? 'lightning'
      : (ENEMY_HIT_FX.normal.palettes[element] ? element : 'default');
    e.flashPhase = -1;
    this.applyHitTint(e, 0);
  }

  applyHitTint(e, phase) {
    if (e.flashPhase === phase) return;
    e.flashPhase = phase;
    const palette = e.flashStyle === 'lightning'
      ? ENEMY_HIT_FX.lightning
      : (ENEMY_HIT_FX.normal.palettes[e.flashStyle] || ENEMY_HIT_FX.normal.palettes.default);
    const tint = phase === 0 ? palette.tintA : palette.tintB;
    // 第一段极短 FILL 保证任何底色都能读出元素；第二段 MULTIPLY 立刻还回纹理明暗。
    e.spr.setTintMode(phase === 0 ? Phaser.TintModes.FILL : Phaser.TintModes.MULTIPLY)
      .setTint(tint[0], tint[1], tint[2], tint[3]);
  }

  updateHitFlash(e, dt) {
    if (e.flashT <= 0) return;
    e.flashT -= dt;
    if (e.flashT <= 0) {
      e.flashT = 0;
      e.flashDuration = 0;
      e.flashStyle = '';
      e.flashPhase = -1;
      this.restoreTint(e);
      return;
    }
    const fx = e.flashStyle === 'lightning' ? ENEMY_HIT_FX.lightning : ENEMY_HIT_FX.normal;
    if (e.flashT <= fx.phaseSplit) {
      this.applyHitTint(e, 1);
    }
  }

  refreshStatusVisual(e) {
    const wasFrozen = e.statusStyle === 'freeze';
    const style = e.freezeFxActive ? 'freeze'
      : e.poisonT > 0
        ? (e.poisonSource === 'plague' || e.plague ? 'plague' : e.poisonSource === 'corrosion' ? 'corrosion' : 'poison')
        : e.vulnT > 0 ? 'corrosion' : '';
    if (style === e.statusStyle) return;
    e.statusStyle = style;
    if (!style) {
      e.statusSpr.setActive(false).setVisible(false).setRotation(0);
    } else {
      const texture = style === 'freeze' && !e.bossTier && e.type.spriteH * e.scale < 72
        ? 'status_freeze_small'
        : `status_${style}`;
      e.statusSpr.setTexture(texture).setActive(true).setVisible(true)
        .setAlpha(1).setScale(1).setRotation(0);
    }
    if (style === 'freeze' && !wasFrozen) {
      e.shadow.setTexture('shadow')
        .setDisplaySize((e.type.shadowW || e.type.radius * 2) * e.scale, e.type.radius * 0.7 * e.scale)
        .setVisible(!e.type.bakedShadow);
      e.spr.anims.pause();
    } else if (wasFrozen && style !== 'freeze') {
      e.shadow.setTexture('shadow')
        .setDisplaySize((e.type.shadowW || e.type.radius * 2) * e.scale, e.type.radius * 0.7 * e.scale)
        .setVisible(!e.type.bakedShadow);
      e.spr.anims.resume();
    }
    if (e.flashT <= 0) this.restoreTint(e);
  }

  applyStatus(e, status, source = '') {
    if (!status) return;
    if (status.slow) { e.slow = Math.max(e.slow, status.slow); e.slowT = Math.max(e.slowT, status.slowDur || 1); }
    if (status.freezeChance && Math.random() < status.freezeChance) {
      e.freezeT = Math.max(e.freezeT, status.freezeDur || 1.2);
      if (!e.freezeFxActive) {
        e.freezeFxActive = true;
        e.freezeFxAge = 0;
        this.scene.vfx.freezeLock?.(e.x, e.y, e.radius);
      }
    }
    if (status.stunChance && Math.random() < status.stunChance) e.stunT = Math.max(e.stunT, status.stunDur || 0.7);
    if (status.poisonDps) {
      e.poisonDps = Math.max(e.poisonDps, status.poisonDps * this.scene.player.dmgMult);
      e.poisonT = Math.max(e.poisonT, status.poisonDur || 1.5);
      e.poisonTick = Math.min(e.poisonTick, 0.08);
      e.poisonSource = source;
    }
    if (status.plague) {
      const depth = status.plagueDepth || 0;
      if (!e.plague || depth < e.plagueDepth) e.plagueDepth = depth;
      e.plague = true;
      e.plagueMaxDepth = Math.max(e.plagueMaxDepth, status.plagueMaxDepth || 0);
    }
    if (status.vuln) {
      e.vuln = Math.max(e.vuln, status.vuln);
      e.vulnT = Math.max(e.vulnT, status.vulnDur || 2);
      if (e.vulnFxT <= 0) {
        this.scene.vfx.corrosionHit(e.x, e.y - e.type.spriteH * 0.18 * e.scale);
        this.scene.vfx.damageText(e.x, e.y - e.type.spriteH * 0.86, ELEMENT_SYNERGY.corrosion.label, {
          color: ELEMENT_SYNERGY.corrosion.color,
          fontSize: '15px',
          life: 0.5,
        });
        e.vulnFxT = 0.62;
      }
    }
    this.refreshStatusVisual(e);
  }

  sourceElement(source) {
    const baseKey = EVOLUTIONS[source]?.baseKey || source;
    return SKILLS[source]?.element || WEAPONS[baseKey]?.element || '';
  }

  triggerPoisonFire(e, amount, source = '') {
    const cfg = ELEMENT_SYNERGY.poisonFire;
    const now = this.scene.state.time;
    if (e.poisonT <= 0 || e.igniteNextT > now) return;
    e.igniteNextT = now + cfg.cooldownSec;
    if (this.poisonFireQueueCount >= this.poisonFireQueue.length) return;
    const blast = this.poisonFireQueue[this.poisonFireQueueTail];
    this.poisonFireQueueTail = (this.poisonFireQueueTail + 1) % this.poisonFireQueue.length;
    this.poisonFireQueueCount++;
    blast.x = e.x;
    blast.y = e.y;
    blast.labelY = e.y - e.type.spriteH * 0.96;
    blast.damage = Math.max(cfg.minDamage, amount * cfg.damageMult);
    blast.source = source || cfg.source;
  }

  processPoisonFireQueue() {
    const cfg = ELEMENT_SYNERGY.poisonFire;
    const now = this.scene.state.time;
    const count = Math.min(cfg.maxTriggersPerFrame, this.poisonFireQueueCount);
    if (count <= 0) return;
    if (this.poisonFireFrameTime !== now) {
      this.poisonFireFrameTime = now;
      this.poisonFireFrameCount = 0;
    }
    for (let n = 0; n < count; n++) {
      const blast = this.poisonFireQueue[this.poisonFireQueueHead];
      const blastX = blast.x, blastY = blast.y, labelY = blast.labelY;
      const damage = blast.damage, source = blast.source;
      this.poisonFireQueueHead = (this.poisonFireQueueHead + 1) % this.poisonFireQueue.length;
      this.poisonFireQueueCount--;
      this.poisonFireFrameCount++;
      let showVisual = true;
      const mergeRadius2 = cfg.visualMergeRadius * cfg.visualMergeRadius;
      for (let i = 0; i < this.poisonFireVisualCells.length; i++) {
        const cell = this.poisonFireVisualCells[i];
        if (cell.expiresAt <= now) continue;
        const dx = blastX - cell.x, dy = blastY - cell.y;
        if (dx * dx + dy * dy <= mergeRadius2) {
          showVisual = false;
          break;
        }
      }
      if (showVisual) {
        const cell = this.poisonFireVisualCells[(this.poisonFireFrameCount - 1) % this.poisonFireVisualCells.length];
        cell.x = blastX;
        cell.y = blastY;
        cell.expiresAt = now + cfg.visualMergeSec;
        this.scene.vfx.damageText(blastX, labelY, cfg.label, {
          color: cfg.color,
          fontSize: '15px',
          life: 0.5,
        });
        this.scene.vfx.fireExplosion(blastX, blastY, cfg.radius, 0xffb23f, true, 'fire');
      }
      const victims = this.poisonFireVictims;
      victims.length = 0;
      const rr = cfg.radius + MAX_ENEMY_RADIUS;
      this.grid.forEachInCircle(blastX, blastY, rr, (victim, d2) => {
        if (victim.hp <= 0) return false;
        const hitR = cfg.radius + victim.radius;
        if (d2 <= hitR * hitR) victims.push(victim);
        return victims.length >= cfg.maxVictims;
      });
      for (const victim of victims) {
        this.damage(victim, damage, { source, noSynergy: true });
      }
      victims.length = 0;
    }
  }

  applyTankShield(e, amount, options) {
    if (e.type.key !== 'tank' || options.aoe || options.noShield) return amount;
    if (options.hitX == null || options.hitY == null) return amount;
    const cfg = ENEMY_BEHAVIOR.tank;
    const facingX = e.lastMoveX || 1;
    const facingY = e.lastMoveY || 0;
    const attackX = options.hitX - e.x;
    const attackY = options.hitY - e.y;
    const attackLen = Math.hypot(attackX, attackY) || 1;
    const dot = (facingX * attackX + facingY * attackY) / attackLen;
    const threshold = Math.cos((cfg.frontArcDeg * Math.PI / 180) * 0.5);
    if (dot < threshold) return amount;
    const mult = e.elite ? cfg.eliteFrontDamageMult : cfg.frontDamageMult;
    if (!options.quiet && e.shieldFxT <= 0) {
      this.scene.vfx.damageText(e.x, e.y - e.type.spriteH * 0.78, cfg.blockLabel, {
        color: cfg.blockColor,
        fontSize: '14px',
        life: 0.42,
      });
      this.scene.vfx.areaPulse(e.x + facingX * e.radius * 0.7, e.y + facingY * e.radius * 0.7, e.radius * 1.15, 0xb7d7ff);
      e.shieldFxT = 0.38;
    }
    return amount * mult;
  }

  // 造成伤害；击杀返回 true
  damage(e, amount, options = {}) {
    // 战利品道具：命中次数制，绕过状态/协同/统计，直接路由给 PropManager
    if (e.isProp) return this.scene.props ? this.scene.props.damage(e) : false;
    if (e.hp <= 0) return false;
    this.applyStatus(e, options.status, options.source);
    amount = this.applyTankShield(e, amount, options);
    const element = options.element || this.sourceElement(options.source || '');
    const lightningChill = ELEMENT_SYNERGY.lightningChill;
    const frozenLightning = !options.noSynergy && element === 'lightning' && e.freezeT > 0;
    const slowedLightning = !frozenLightning && !options.noSynergy && element === 'lightning' && e.slowT > 0;
    const synergyMult = frozenLightning ? lightningChill.freezeMult
      : slowedLightning ? lightningChill.slowMult : 1;
    const synergyLabel = frozenLightning ? lightningChill.freezeLabel
      : slowedLightning ? lightningChill.slowLabel : '';
    const dealt = Math.max(0, amount * synergyMult * (1 + e.vuln));
    const recorded = Math.min(e.hp, dealt);
    e.hp -= dealt;
    this.scene.recordDamage?.(options.source || 'unknown', recorded);
    this.applyHitFlash(e, element);
    if (!options.quiet) {
      this.scene.vfx.damageText(e.x, e.y - e.type.spriteH * 0.6, Math.round(dealt), {
        color: synergyLabel ? lightningChill.color : undefined,
      });
      if (synergyLabel) {
        this.scene.vfx.damageText(e.x, e.y - e.type.spriteH * 0.92, synergyLabel, {
          color: lightningChill.color,
          fontSize: '15px',
          life: 0.5,
        });
      }
    }
    if (!options.noSynergy && element === 'fire') this.triggerPoisonFire(e, dealt, options.source);
    if (e.hp <= 0) {
      this.kill(e);
      return true;
    }
    return false;
  }

  kill(e) {
    const idx = this.active.indexOf(e);
    if (idx === -1) return;
    this.active[idx] = this.active[this.active.length - 1];
    this.active.pop();
    this.releaseBossWarning(e);
    if (e.freezeFxActive || e.freezeT > 0) this.scene.vfx.freezeBreak?.(e.x, e.y, e.radius, true);
    e.spr.setActive(false).setVisible(false);
    e.shadow.setActive(false).setVisible(false);
    e.statusSpr.setActive(false).setVisible(false);
    e.statusStyle = '';
    this.deadBuffer.push(e);
    this.scene.onEnemyKilled(e);

    if (e.type.splits) {
      const count = e.type.splits + (e.elite ? ENEMY_BEHAVIOR.splitter.eliteExtraSplits : 0);
      for (let n = 0; n < count; n++) {
        const a = (n / count) * Math.PI * 2 + Math.random() * 0.6;
        this.spawn('mini', e.x + Math.cos(a) * 28, e.y + Math.sin(a) * 28, this.scene.state.time);
      }
    }
  }

  nearest(x, y, maxR) {
    // 战利品道具与敌人使用同一套最近目标规则；伤害入口再按 isProp 路由命中次数制。
    return this.grid.nearestInCircle(x, y, maxR, e => e.hp > 0);
  }

  primaryBoss() {
    let best = null;
    for (const e of this.active) {
      if (!e.bossTier || e.hp <= 0) continue;
      if (!best || e.bossTier > best.bossTier || (e.bossTier === best.bossTier && e.hp > best.hp)) best = e;
    }
    return best;
  }
}
