// 可破坏战利品道具（VS 火盆式）：视野周边散布木箱/火盆/墓碑，打碎掉战利品。
// 设计约束（对应"障碍物"讨论的结论）：
//   - 不阻挡移动，作为普通可攻击目标参与自动索敌与多目标技能；
//   - 进敌人空间网格 → 现有武器命中/范围伤害天然覆盖，敌人分离推挤会自然绕流；
//   - 命中次数制：每次伤害事件 -1 hits，与武器数值无关；直射弹命中不消耗穿透（WeaponManager 分支）。
import Phaser from 'phaser';
import { PERF, PROPS } from '../config.js';
import { Pool } from '../core/Pool.js';
import { Sfx } from '../audio.js';

const CHIP_TINTS = {
  crate: [0xa8763e, 0x6b4a2a, 0x815c34],
  brazier: [0x8a8f96, 0xffb040, 0x666c75],
  gravestone: [0x9aa3ad, 0x76865f, 0x59616a],
};

export class PropManager {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
    this.deadBuffer = []; // 与 EnemyManager 同款：本帧销毁、下帧回池，防网格残留引用被复用
    this.spawnT = 0;
    this.initialSpawned = false;
    this.pool = new Pool(() => ({
      isProp: true,
      x: 0, y: 0, hp: 0, maxHp: 0, radius: 18,
      type: null, // { key, spriteH, boss:false } 鸭子类型，兼容共享管线对 e.type 的读取
      flashT: 0, wobbleT: 0, phase: 0,
      spr: scene.add.image(0, 0, 'prop_crate').setVisible(false).setActive(false).setDepth(1.6),
      shadow: scene.add.image(0, 0, 'shadow').setVisible(false).setActive(false).setDepth(1.55),
    }));
    this.pool.warm(PROPS.maxAlive);
  }

  textureFor(key) {
    const art = `prop_${key}_art`; // 正式美术资产键（见 design/props-assets.md）
    return this.scene.textures.exists(art) ? art : `prop_${key}`;
  }

  pickTypeKey() {
    let total = 0;
    for (const def of Object.values(PROPS.types)) total += def.weight;
    let r = Math.random() * total;
    for (const [key, def] of Object.entries(PROPS.types)) {
      r -= def.weight;
      if (r <= 0) return key;
    }
    return 'crate';
  }

  spawnAt(typeKey, x, y) {
    if (this.active.length >= PROPS.maxAlive) return null;
    const def = PROPS.types[typeKey] || PROPS.types.crate;
    const prop = this.pool.get();
    prop.x = x; prop.y = y;
    prop.type = { key: def.key, spriteH: def.spriteH, boss: false };
    prop.maxHp = def.hits;
    prop.hp = def.hits;
    prop.radius = def.radius;
    prop.flashT = 0;
    prop.wobbleT = 0;
    prop.phase = Math.random() * Math.PI * 2;
    prop.spr.setTexture(this.textureFor(def.key))
      .setActive(true).setVisible(true).setPosition(x, y)
      .setRotation(0).setAlpha(1)
      .setTintMode(Phaser.TintModes.MULTIPLY).clearTint();
    prop.spr.setScale(def.spriteH / (prop.spr.height || 48));
    prop.shadow.setActive(true).setVisible(true)
      .setDisplaySize(def.radius * 2.3, def.radius * 0.8)
      .setAlpha(0.3)
      .setPosition(x, y + def.spriteH * 0.44);
    this.active.push(prop);
    return prop;
  }

  trySpawnAround(player) {
    const view = this.scene.enemies.viewRadius();
    for (let attempt = 0; attempt < 4; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const r = view * (PROPS.ringMin + Math.random() * (PROPS.ringMax - PROPS.ringMin));
      const x = player.x + Math.cos(a) * r;
      const y = player.y + Math.sin(a) * r;
      const dxp = x - player.x, dyp = y - player.y;
      if (dxp * dxp + dyp * dyp < PROPS.minPlayerDist * PROPS.minPlayerDist) continue;
      let crowded = false;
      for (const other of this.active) {
        const dx = other.x - x, dy = other.y - y;
        if (dx * dx + dy * dy < PROPS.minGapPx * PROPS.minGapPx) { crowded = true; break; }
      }
      if (crowded) continue;
      return this.spawnAt(this.pickTypeKey(), x, y);
    }
    return null;
  }

  update(dt, player, timeSec) {
    // 上帧销毁的道具此刻安全回池
    for (let i = 0; i < this.deadBuffer.length; i++) this.pool.release(this.deadBuffer[i]);
    this.deadBuffer.length = 0;

    // 12 秒时一次铺出首批；后续无论打碎还是离开视野，每个补位都走同一冷却。
    if (!this.initialSpawned && timeSec >= PROPS.firstSpawnAt) {
      this.initialSpawned = true;
      const initialTarget = Math.min(PROPS.initialSpawnCount, PROPS.targetAlive, PROPS.maxAlive);
      for (let attempt = 0; attempt < initialTarget * 4 && this.active.length < initialTarget; attempt++) {
        this.trySpawnAround(player);
      }
      this.spawnT = PROPS.spawnIntervalSec;
    }
    if (this.initialSpawned && this.active.length < PROPS.targetAlive) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = PROPS.spawnIntervalSec;
        this.trySpawnAround(player);
      }
    }

    const view = this.scene.enemies.viewRadius();
    const farR = view + PROPS.despawnMargin;
    const far2 = farR * farR;

    for (let i = this.active.length - 1; i >= 0; i--) {
      const prop = this.active[i];
      const dx = prop.x - player.x, dy = prop.y - player.y;
      // 被甩远：静默回收（未破坏不掉落），换个位置再生
      if (dx * dx + dy * dy > far2) {
        this.releaseAt(i);
        continue;
      }
      // 受击白闪恢复 + 受击晃动衰减
      if (prop.flashT > 0) {
        prop.flashT -= dt;
        if (prop.flashT <= 0) prop.spr.setTintMode(Phaser.TintModes.MULTIPLY).clearTint();
      }
      if (prop.wobbleT > 0) {
        prop.wobbleT = Math.max(0, prop.wobbleT - dt);
        prop.spr.setRotation(Math.sin(prop.wobbleT * 42) * 0.55 * prop.wobbleT);
      }
      // 火盆余烬呼吸
      if (PROPS.types[prop.type.key]?.glow) {
        prop.spr.setAlpha(0.93 + 0.07 * Math.sin(timeSec * 4.6 + prop.phase));
      }
    }
  }

  // 由 EnemyManager.damage 路由进来：命中次数制，无视伤害数值
  damage(prop) {
    if (prop.hp <= 0) return false;
    prop.hp -= 1;
    prop.flashT = 0.07;
    prop.wobbleT = 0.2;
    prop.spr.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    Sfx.hit();
    if (prop.hp <= 0) {
      this.destroy(prop);
      return true;
    }
    return false;
  }

  destroy(prop) {
    const idx = this.active.indexOf(prop);
    if (idx === -1) return;
    this.active[idx] = this.active[this.active.length - 1];
    this.active.pop();
    prop.spr.setActive(false).setVisible(false).setRotation(0);
    prop.shadow.setActive(false).setVisible(false);
    this.deadBuffer.push(prop);

    // 破坏反馈：碎屑 + 轻冲击环（走旧粒子池，kind 限流）
    const tints = CHIP_TINTS[prop.type.key] || CHIP_TINTS.crate;
    const vfx = this.scene.vfx;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.random() * 0.6;
      const spd = 90 + Math.random() * 120;
      vfx.spawnParticle(prop.x, prop.y - prop.type.spriteH * 0.3,
        Math.cos(a) * spd, Math.sin(a) * spd - 40, 0.34,
        0.5 + Math.random() * 0.4, tints[i % tints.length], 'spark', {
          kind: 'prop', kindLimit: PERF.maxPropParticles,
          rotation: a, spin: (Math.random() - 0.5) * 10, endScale: 0.1,
        });
    }
    vfx.spawnParticle(prop.x, prop.y - prop.type.spriteH * 0.25, 0, 0, 0.2, 0.5, tints[0], 'fx_ring', {
      kind: 'prop', kindLimit: PERF.maxPropParticles,
      startScale: 0.14, endScale: 0.6, startAlpha: 0.8,
    });
    Sfx.boom();

    this.rollLoot(prop.x, prop.y);
  }

  rollLoot(x, y) {
    const table = PROPS.loot;
    let total = 0;
    for (const entry of Object.values(table)) total += entry.weight;
    let r = Math.random() * total;
    let picked = 'xp';
    for (const [key, entry] of Object.entries(table)) {
      r -= entry.weight;
      if (r <= 0) { picked = key; break; }
    }
    const pickups = this.scene.pickups;
    if (picked === 'xp') {
      pickups.dropGem(x, y + 6, this.scene.levelSystem.rewardXpValue(table.xp.needPct));
    } else if (picked === 'gems') {
      for (let i = 0; i < table.gems.count; i++) {
        pickups.dropGem(x + (Math.random() - 0.5) * 44, y + (Math.random() - 0.5) * 34, 1);
      }
    } else if (picked === 'heal') {
      pickups.dropHeal(x, y + 6, table.heal.pct);
    } else {
      pickups.dropMagnet(x, y + 6);
    }
  }

  releaseAt(index) {
    const prop = this.active[index];
    this.active[index] = this.active[this.active.length - 1];
    this.active.pop();
    prop.spr.setActive(false).setVisible(false).setRotation(0);
    prop.shadow.setActive(false).setVisible(false);
    this.pool.release(prop);
  }
}
