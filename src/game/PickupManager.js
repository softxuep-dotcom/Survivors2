// 经验宝石：掉落 → 磁吸 → 拾取。
// 上限策略（GDD §8.2 ≤200）：
//   1) 远离视野的孤儿宝石定期回收，其价值累进 carryValue，随下一颗掉落返还
//      （修复 playtest 反馈：跑图甩下的宝石占满池子后，新击杀"看起来不掉宝石"）
//   2) 池仍满时并入最近宝石并升档显示
import { PERF, XP_GEMS, PLAYER, PROPS } from '../config.js';
import { Pool } from '../core/Pool.js';
import { Sfx } from '../audio.js';
import { t } from '../i18n.js';

const PICKUP_DIST = 26;
const SWEEP_INTERVAL = 0.6; // 孤儿回收扫描间隔（秒）
const SWEEP_MARGIN = 380;   // 视野半径外再加这么多才算孤儿

function tierOf(value) {
  if (value >= XP_GEMS.large.value) return 2;
  if (value >= XP_GEMS.mid.value) return 1;
  return 0;
}
const TIER_TEXTURE = ['gem_small', 'gem_mid', 'gem_large'];

export class PickupManager {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
    this.gemCount = 0;
    this.carryValue = 0; // 被回收孤儿宝石的暂存价值
    this.sweepT = SWEEP_INTERVAL;
    this.t = 0;          // 脉动相位时钟
    this.pool = new Pool(
      () => ({
        x: 0, y: 0, value: 0, kind: 'gem', pulling: false, age: 0, phase: 0, baseScale: 1,
        spr: scene.add.image(0, 0, 'gem_small').setVisible(false).setActive(false).setDepth(1),
      }),
    );
    this.pool.warm(PERF.maxGems + 8);
  }

  dropGem(x, y, value) {
    // 返还此前回收的孤儿价值
    if (this.carryValue > 0) {
      value += this.carryValue;
      this.carryValue = 0;
    }
    if (this.gemCount >= PERF.maxGems) {
      // 池满：并入最近的宝石并升档显示
      let best = null, bestD2 = Infinity;
      for (const gem of this.active) {
        if (gem.kind !== 'gem') continue;
        const dx = gem.x - x, dy = gem.y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; best = gem; }
      }
      if (best) {
        best.value += value;
        best.spr.setTexture(TIER_TEXTURE[tierOf(best.value)]);
        best.age = 0; // 重播弹出动画，提示"这里有新掉落"
        best.x = x; best.y = y;
        best.pulling = false;
        best.spr.setPosition(x, y).setAlpha(1);
        return best;
      }
      return null;
    }
    const gem = this.pool.get();
    gem.x = x; gem.y = y;
    gem.value = value;
    gem.kind = 'gem';
    gem.pulling = false;
    gem.age = 0;
    gem.phase = Math.random() * Math.PI * 2;
    gem.baseScale = 1;
    gem.spr.setTexture(TIER_TEXTURE[tierOf(value)]);
    gem.spr.setActive(true).setVisible(true).setPosition(x, y).setAlpha(1);
    this.active.push(gem);
    this.gemCount++;
    return gem;
  }

  dropChest(x, y) {
    const chest = this.pool.get();
    chest.x = x; chest.y = y;
    chest.value = 0;
    chest.kind = 'chest';
    chest.pulling = false;
    chest.age = 0;
    chest.phase = Math.random() * Math.PI * 2;
    chest.baseScale = 0.42;
    chest.spr.setTexture(this.scene.textures.exists('chest_jackpot') ? 'chest_jackpot' : 'chest')
      .setActive(true).setVisible(true).setPosition(x, y).setAlpha(1).setScale(0.38);
    this.active.push(chest);
    return chest;
  }

  // 治疗药（战利品道具掉落）：value=回复比例
  dropHeal(x, y, pct) {
    const drop = this.pool.get();
    drop.x = x; drop.y = y; drop.value = pct; drop.kind = 'heal';
    drop.pulling = false; drop.age = 0; drop.phase = Math.random() * Math.PI * 2;
    const art = this.scene.textures.exists('pickup_heal_art');
    drop.baseScale = 30 / 256; // 占位 icon_heal 与正式图都按 256 版式导出
    drop.spr.setTexture(art ? 'pickup_heal_art' : 'icon_heal')
      .setActive(true).setVisible(true).setPosition(x, y).setAlpha(1)
      .setScale(0.4 * drop.baseScale); // 暂停中掉落时 update 不跑，spawn 帧就要给正确初始缩放
    this.active.push(drop);
    return drop;
  }

  // 磁石（战利品道具掉落）：拾取后大范围经验吸向玩家
  dropMagnet(x, y) {
    const drop = this.pool.get();
    drop.x = x; drop.y = y; drop.value = 0; drop.kind = 'magnet';
    drop.pulling = false; drop.age = 0; drop.phase = Math.random() * Math.PI * 2;
    const art = this.scene.textures.exists('pickup_magnet_art');
    drop.baseScale = 30 / 256;
    drop.spr.setTexture(art ? 'pickup_magnet_art' : 'icon_magnet')
      .setActive(true).setVisible(true).setPosition(x, y).setAlpha(1)
      .setScale(0.4 * drop.baseScale);
    this.active.push(drop);
    return drop;
  }

  // 范围吸取：只让半径内经验飞向玩家（宝箱等功能拾取物不受影响）
  vacuumWithin(radius) {
    const px = this.scene.player.x;
    const py = this.scene.player.y;
    const radius2 = radius * radius;
    for (const gem of this.active) {
      const dx = gem.x - px;
      const dy = gem.y - py;
      if (gem.kind === 'gem' && dx * dx + dy * dy <= radius2) gem.pulling = true;
    }
  }

  update(dt) {
    const player = this.scene.player;
    const px = player.x, py = player.y;
    const pullR2 = player.pickupRadius * player.pickupRadius;
    this.t += dt;

    // 孤儿宝石回收（价值不丢，随下次掉落返还）
    this.sweepT -= dt;
    if (this.sweepT <= 0) {
      this.sweepT = SWEEP_INTERVAL;
      const sweepR = this.scene.enemies.viewRadius() + SWEEP_MARGIN;
      const sweepR2 = sweepR * sweepR;
      for (let i = this.active.length - 1; i >= 0; i--) {
        const gem = this.active[i];
        const dx = px - gem.x, dy = py - gem.y;
        if (gem.kind === 'gem' && dx * dx + dy * dy > sweepR2) {
          this.carryValue += gem.value;
          this.release(i, gem);
        }
      }
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const gem = this.active[i];
      const dx = px - gem.x, dy = py - gem.y;
      const d2 = dx * dx + dy * dy;

      if (!gem.pulling && d2 < pullR2) gem.pulling = true;

      if (gem.pulling) {
        const d = Math.sqrt(d2) || 0.001;
        if (d < PICKUP_DIST) {
          this.collect(i, gem);
          continue;
        }
        gem.x += (dx / d) * PLAYER.magnetSpeed * dt;
        gem.y += (dy / d) * PLAYER.magnetSpeed * dt;
        gem.spr.setPosition(gem.x, gem.y);
      }

      // 弹出 + 呼吸脉动（手动驱动，不用 tween）
      gem.age += dt;
      const pop = Math.min(1, gem.age / 0.16);
      const pulse = 1 + 0.09 * Math.sin(this.t * 3.2 + gem.phase);
      gem.spr.setScale((0.4 + 0.6 * pop) * pulse * gem.baseScale);
    }
  }

  release(index, gem) {
    this.active[index] = this.active[this.active.length - 1];
    this.active.pop();
    if (gem.kind === 'gem') this.gemCount--;
    gem.spr.setActive(false).setVisible(false);
    this.pool.release(gem);
  }

  collect(index, gem) {
    this.release(index, gem);
    if (gem.kind === 'chest') {
      this.scene.onChestCollected();
    } else if (gem.kind === 'heal') {
      Sfx.gem();
      const player = this.scene.player;
      const amount = Math.round(player.maxHp * gem.value);
      player.heal(gem.value);
      this.scene.vfx.damageText(player.x, player.y - 52, `+${amount}`, { color: '#7fe3ae' });
    } else if (gem.kind === 'magnet') {
      Sfx.chest?.();
      const radius = PROPS.loot.magnet.radius;
      this.vacuumWithin(radius);
      this.scene.ui?.showToast?.(t('event.vacuum'), 1.8);
      this.scene.vfx.areaPulse(this.scene.player.x, this.scene.player.y, radius, 0x5ff7ff);
    } else {
      Sfx.gem();
      this.scene.levelSystem.addXp(gem.value * this.scene.player.xpMult);
    }
  }
}
