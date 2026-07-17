// 玩家：移动、生命、被动加成汇总。所有被动的数值效果都在 recalcStats 一处结算。
import Phaser from 'phaser';
import { PLAYER, PASSIVES } from '../config.js';
import { Sfx } from '../audio.js';

export class Player {
  constructor(scene, x, y, {
    texture = 'player_witch_walk', walkAnimation = null, bakedShadow = false, bonuses = {},
  } = {}) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.hp = PLAYER.maxHp;
    this.dead = false;
    this.facing = 1;          // 1=右 -1=左
    this.moving = false;
    this.bobT = 0;
    this.hurtT = 0;           // 受击红闪剩余时间
    this.invulnerableT = 0;
    this.passives = {};       // { key: lv }
    this.bonusDmg = 0;        // 满配兜底卡的无限叠加加成（%）
    this.bonusSpeed = 0;
    this.meta = bonuses;
    this.walkAnimation = walkAnimation;

    this.shadow = scene.add.image(x, y, 'shadow').setDepth(2.4).setDisplaySize(40, 14).setAlpha(0.4).setVisible(!bakedShadow);
    this.spr = scene.add.sprite(x, y, texture, 0).setDepth(3);
    this.spr.setScale(PLAYER.bodyH / this.spr.height);

    // 头顶血条（跟随世界坐标）
    this.hpBg = scene.add.image(x, y, 'px').setDepth(3.4).setTint(0x25140f).setAlpha(0.85);
    this.hpFill = scene.add.image(x, y, 'px').setDepth(3.5).setTint(0x58c98f);
    this.hpBg.setDisplaySize(46, 6);

    this.recalcStats();
    this.hp = this.maxHp;
  }

  // 被动效果统一结算：新增被动种类时只改这里和 config.PASSIVES
  recalcStats() {
    const lvOf = key => this.passives[key] || 0;
    const val = (key) => {
      const lv = lvOf(key);
      return lv > 0 ? PASSIVES[key].values[lv - 1] : 0;
    };
    const hpRatio = this.maxHp ? this.hp / this.maxHp : 1;
    this.speed = PLAYER.speed * (1 + (val('boots') + this.bonusSpeed + (this.meta.speedPct || 0)) / 100);
    this.maxHp = Math.round(PLAYER.maxHp * (1 + (val('core') + (this.meta.hpPct || 0)) / 100));
    this.regen = lvOf('core') > 0 ? PASSIVES.core.regen[lvOf('core') - 1] : 0;
    this.pickupRadius = PLAYER.pickupRadius * (1 + (val('magnet') + (this.meta.pickupPct || 0)) / 100);
    this.dmgMult = 1 + (val('whetstone') + this.bonusDmg + (this.meta.damagePct || 0)) / 100;
    this.cdMult = Math.max(0.35, 1 - (val('gears') + (this.meta.cooldownPct || 0)) / 100);
    this.xpMult = 1 + (val('rune') + (this.meta.xpPct || 0)) / 100;
    this.hp = Math.min(this.maxHp, Math.max(1, Math.round(this.maxHp * hpRatio)));
  }

  addPassive(key) {
    this.passives[key] = Math.min(PASSIVES[key].maxLv, (this.passives[key] || 0) + 1);
    this.recalcStats();
  }

  takeDamage(amount) {
    if (this.dead || this.invulnerableT > 0) return;
    this.hp -= amount;
    this.hurtT = PLAYER.hurtFlashMs / 1000;
    Sfx.hurt();
    this.scene.cameras.main.shake(90, 0.004);
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      if (this.walkAnimation) {
        this.spr.anims.stop();
        this.spr.setFrame(0);
      }
      this.scene.onPlayerDeath();
    }
  }

  heal(pct) {
    this.hp = Math.min(this.maxHp, this.hp + Math.round(this.maxHp * pct));
  }

  revive({ hpPct = 0.6, invulnerableSec = 0 } = {}) {
    this.dead = false;
    this.hp = Math.max(1, Math.round(this.maxHp * hpPct));
    this.invulnerableT = Math.max(0, invulnerableSec);
    this.hurtT = 0;
    this.spr.clearTint();
  }

  update(dt, moveVec) {
    if (this.dead) return;
    if (this.invulnerableT > 0) this.invulnerableT = Math.max(0, this.invulnerableT - dt);

    // 移动
    this.moving = !!(moveVec.x || moveVec.y);
    if (this.moving) {
      this.x += moveVec.x * this.speed * dt;
      this.y += moveVec.y * this.speed * dt;
      if (Math.abs(moveVec.x) > 0.15) this.facing = moveVec.x > 0 ? 1 : -1;
    }
    if (this.walkAnimation) {
      if (this.moving) this.spr.play(this.walkAnimation, true);
      else if (this.spr.anims.isPlaying) {
        this.spr.anims.stop();
        this.spr.setFrame(0);
      }
    }

    // 回血
    if (this.regen > 0 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.regen * dt);
    }

    // 移动小跳 + 受击红闪
    this.bobT += dt * (this.moving ? 11 : 4);
    const bob = this.walkAnimation ? 0 : (this.moving ? Math.abs(Math.sin(this.bobT)) * 4 : Math.sin(this.bobT) * 1.2);
    this.spr.setPosition(this.x, this.y - bob);
    this.spr.setFlipX(this.facing < 0);
    this.spr.rotation = !this.walkAnimation && this.moving ? Math.sin(this.bobT) * 0.05 : 0;
    if (this.hurtT > 0) {
      this.hurtT -= dt;
      this.spr.setTint(0xff5a4a).setTintMode(Phaser.TintModes.FILL);
      if (this.hurtT <= 0) this.spr.clearTint();
    }

    this.shadow.setPosition(this.x, this.y + PLAYER.bodyH * 0.42);

    // 血条
    const barY = this.y + PLAYER.bodyH * 0.62;
    const ratio = Math.max(0, this.hp / this.maxHp);
    this.hpBg.setPosition(this.x, barY);
    this.hpFill.setDisplaySize(Math.max(0.001, 44 * ratio), 4);
    this.hpFill.setPosition(this.x - 22 + 22 * ratio, barY);
    this.hpFill.setTint(ratio > 0.5 ? 0x58c98f : ratio > 0.25 ? 0xffd34e : 0xff6a5e);
  }
}
