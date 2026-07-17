// 每局一次的 20 秒短事件：悬赏目标 / 屠戮挑战 / 守住符文圈。
// 只复用移动、自动攻击、敌人与宝箱系统，不增加新的操作按钮。
import Phaser from 'phaser';
import { RUN_EVENTS } from '../config.js';
import { t } from '../i18n.js';
import { Sfx } from '../audio.js';

const VALID_KEYS = new Set(RUN_EVENTS.keys);

export function chooseRunEvent(forcedKey = '', random = Math.random) {
  if (VALID_KEYS.has(forcedKey)) return forcedKey;
  return RUN_EVENTS.keys[Math.min(RUN_EVENTS.keys.length - 1, Math.floor(random() * RUN_EVENTS.keys.length))];
}

export class RunEventManager {
  constructor(scene, { forcedKey = '', initialTime = 0, disabled = false } = {}) {
    this.scene = scene;
    this.key = chooseRunEvent(forcedKey);
    this.forced = VALID_KEYS.has(forcedKey);
    this.started = false;
    this.active = false;
    this.finished = disabled || (!this.forced && initialTime > RUN_EVENTS.at + 24);
    this.startedAt = 0;
    this.lastTime = initialTime;
    this.progress = 0;
    this.target = null;
    this.bountyFxT = 0;
    this.runeX = 0;
    this.runeY = 0;

    // 悬赏目标使用“背光 + 地面法阵 + 头顶徽记”，不再用一个大圆圈压在角色正面。
    this.bountyGlow = scene.add.image(0, 0, 'glow').setDepth(1.68)
      .setTint(0xff7a32).setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false).setActive(false);
    this.bountyRing = scene.add.image(0, 0, 'fx_ring').setDepth(1.76)
      .setTint(0xffc45c).setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false).setActive(false);
    this.bountyCrest = scene.add.image(0, 0, 'icon_battle_emblem').setDepth(3.25)
      .setDisplaySize(30, 30).setVisible(false).setActive(false);
    this.runeGlow = scene.add.image(0, 0, 'glow').setDepth(1.68)
      .setTint(0x5acb8a).setAlpha(0).setVisible(false).setActive(false);
    this.runeRing = scene.add.image(0, 0, 'fx_ring').setDepth(1.72)
      .setTint(0x71e8a3).setVisible(false).setActive(false);
  }

  update(dt, timeSec) {
    this.lastTime = timeSec;
    if (!this.started && !this.finished && timeSec >= RUN_EVENTS.at) this.start(timeSec);
    if (!this.active) return;

    const cfg = RUN_EVENTS[this.key];
    if (this.key === 'bounty') {
      if (!this.target || this.target.hp <= 0 || !this.scene.enemies.active.includes(this.target)) {
        this.fail();
        return;
      }
      const spriteH = this.target.type.spriteH * this.target.scale;
      const pulse = Math.sin(timeSec * 5.4);
      this.bountyGlow.setPosition(this.target.x, this.target.y - spriteH * 0.08)
        .setScale((spriteH / 64) * (1.22 + pulse * 0.05))
        .setAlpha(0.12 + pulse * 0.025);
      this.bountyRing.setPosition(this.target.x, this.target.y + spriteH * 0.38)
        .setScale(0.82 + pulse * 0.035, 0.27 + pulse * 0.012)
        .setAlpha(0.74 + pulse * 0.10);
      this.bountyCrest.setPosition(this.target.x, this.target.y - spriteH * 0.70)
        .setDisplaySize(29 + pulse * 1.5, 29 + pulse * 1.5)
        .setAngle(Math.sin(timeSec * 2.6) * 4)
        .setAlpha(0.86 + pulse * 0.08);
      this.bountyFxT -= dt;
      if (this.bountyFxT <= 0) {
        this.bountyFxT = 0.12;
        const phase = timeSec * 4.2;
        this.scene.vfx?.bountyMote(
          this.target.x + Math.cos(phase) * spriteH * 0.53,
          this.target.y - spriteH * 0.12 + Math.sin(phase) * spriteH * 0.22,
          phase,
        );
      }
    } else if (this.key === 'rune') {
      const dx = this.scene.player.x - this.runeX;
      const dy = this.scene.player.y - this.runeY;
      const inside = dx * dx + dy * dy <= cfg.radius * cfg.radius;
      if (inside) this.progress = Math.min(cfg.holdSec, this.progress + dt);
      const ratio = this.progress / cfg.holdSec;
      const pulse = 1 + Math.sin(timeSec * 5) * 0.035;
      this.runeRing.setTint(inside ? 0x71e8a3 : 0x82bfff)
        .setScale((cfg.radius / 58) * pulse)
        .setAlpha(inside ? 0.82 : 0.58);
      this.runeGlow.setScale((cfg.radius * (0.82 + ratio * 0.18)) / 32)
        .setAlpha((inside ? 0.14 : 0.07) + ratio * 0.08);
      if (this.progress >= cfg.holdSec) {
        this.complete();
        return;
      }
    }

    if (timeSec - this.startedAt >= cfg.duration) this.fail();
  }

  start(timeSec) {
    const cfg = RUN_EVENTS[this.key];
    let started = true;
    if (this.key === 'bounty') started = this.startBounty(cfg, timeSec);
    else if (this.key === 'slaughter') this.startSlaughter(cfg, timeSec);
    else if (this.key === 'rune') this.startRune(cfg, timeSec);
    if (!started) return;

    this.started = true;
    this.active = true;
    this.startedAt = timeSec;
    this.progress = 0;
    this.scene.ui?.showToast(t(`runEvent.${this.key}.start`, {
      target: cfg.targetKills || cfg.holdSec || '',
    }), 3.2);
    this.scene.analytics?.event('run_event_start', timeSec, { key: this.key });
    Sfx.choose();
  }

  startBounty(cfg, timeSec) {
    if (!this.scene.enemies.makeRoomForSpecial(this.scene.player, 1)) return false;
    this.target = this.scene.enemies.spawnAround(
      this.scene.player,
      cfg.type,
      timeSec,
      undefined,
      undefined,
      {
        elite: true,
        hpMult: cfg.hpMult,
        speedMult: cfg.speedMult,
        scale: cfg.scale,
        tint: cfg.tint,
        rewardChest: false,
      },
    );
    if (!this.target) return false;
    this.bountyFxT = 0;
    this.bountyGlow.setActive(true).setVisible(true).setPosition(this.target.x, this.target.y);
    this.bountyRing.setActive(true).setVisible(true).setPosition(this.target.x, this.target.y);
    this.bountyCrest.setActive(true).setVisible(true).setPosition(this.target.x, this.target.y);
    return true;
  }

  startSlaughter(cfg, timeSec) {
    for (let i = 0; i < cfg.burstCount; i++) {
      const type = this.scene.enemies.pickType(cfg.burstTypes);
      this.scene.enemies.spawnAround(
        this.scene.player,
        type,
        timeSec,
        cfg.burstRingMin,
        cfg.burstRingMax,
      );
    }
  }

  startRune(cfg, timeSec) {
    // 强制事件查询固定在玩家右侧，便于桌面/移动端自动化复现；正常局仍随机方位。
    const angle = this.forced ? 0 : Math.random() * Math.PI * 2;
    this.runeX = this.scene.player.x + Math.cos(angle) * cfg.distance;
    this.runeY = this.scene.player.y + Math.sin(angle) * cfg.distance;
    this.runeGlow.setActive(true).setVisible(true).setPosition(this.runeX, this.runeY);
    this.runeRing.setActive(true).setVisible(true).setPosition(this.runeX, this.runeY)
      .setScale(cfg.radius / 58);

    for (let i = 0; i < cfg.guardCount; i++) {
      const a = (i / cfg.guardCount) * Math.PI * 2 + Math.random() * 0.25;
      const r = cfg.guardRingMin + Math.random() * (cfg.guardRingMax - cfg.guardRingMin);
      this.scene.enemies.spawn(
        i % 4 === 0 ? 'runner' : 'slime',
        this.runeX + Math.cos(a) * r,
        this.runeY + Math.sin(a) * r,
        timeSec,
      );
    }
  }

  onEnemyKilled(enemy) {
    if (!this.active) return;
    if (this.key === 'bounty' && enemy === this.target) {
      this.complete();
    } else if (this.key === 'slaughter') {
      this.progress++;
      if (this.progress >= RUN_EVENTS.slaughter.targetKills) this.complete();
    }
  }

  complete() {
    if (!this.active) return;
    const elapsed = Math.max(0, this.lastTime - this.startedAt);
    this.active = false;
    this.finished = true;
    this.scene.pickups.dropChest(this.scene.player.x + 54, this.scene.player.y);
    this.cleanupVisuals();
    this.scene.ui?.showToast(t('runEvent.complete'), 3.0);
    this.scene.analytics?.event('run_event_complete', this.lastTime, {
      key: this.key,
      elapsed: +elapsed.toFixed(1),
    });
    this.scene.cameras.main.flash(280, 105, 220, 145);
    Sfx.choose();
    this.target = null;
  }

  fail() {
    if (!this.active) return;
    this.active = false;
    this.finished = true;
    if (this.key === 'bounty' && this.target) {
      const index = this.scene.enemies.active.indexOf(this.target);
      if (index >= 0) this.scene.enemies.releaseActiveAt(index);
    }
    this.cleanupVisuals();
    this.scene.ui?.showToast(t('runEvent.failed'), 2.6);
    this.scene.analytics?.event('run_event_fail', this.lastTime, {
      key: this.key,
      progress: +this.progress.toFixed(1),
    });
    this.target = null;
  }

  hudState() {
    if (!this.active) return null;
    const cfg = RUN_EVENTS[this.key];
    return {
      key: this.key,
      remaining: Math.max(0, Math.ceil(cfg.duration - (this.lastTime - this.startedAt))),
      progress: this.key === 'rune' ? Math.floor(this.progress) : this.progress,
      target: cfg.targetKills || cfg.holdSec || 1,
    };
  }

  // 仅供开发构建的 ?autoplay=1 复现符文事件；正常玩家输入不经过这里。
  autoplayMoveVector(fallback) {
    if (!this.scene.autoplay || !this.active || this.key !== 'rune') return fallback;
    const dx = this.runeX - this.scene.player.x;
    const dy = this.runeY - this.scene.player.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= RUN_EVENTS.rune.radius * 0.55) return { x: 0, y: 0 };
    return { x: dx / distance, y: dy / distance };
  }

  cleanupVisuals() {
    this.bountyFxT = 0;
    this.bountyGlow.setActive(false).setVisible(false).setAlpha(0);
    this.bountyRing.setActive(false).setVisible(false).setAlpha(0);
    this.bountyCrest.setActive(false).setVisible(false).setAlpha(0);
    this.runeGlow.setActive(false).setVisible(false).setAlpha(0);
    this.runeRing.setActive(false).setVisible(false).setAlpha(0);
  }

  destroy() {
    this.bountyGlow.destroy();
    this.bountyRing.destroy();
    this.bountyCrest.destroy();
    this.runeGlow.destroy();
    this.runeRing.destroy();
  }
}
