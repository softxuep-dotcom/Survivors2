// 武器系统：正式局使用直接技能制；旧基础/进阶定义保留给镜像 Boss 与 VFX Lab。
// 场景只负责调度；投射物/持续区域均池化，伤害与状态统一交给 EnemyManager 结算。
import {
  WEAPONS, EVOLUTIONS, SKILLS, skillParamsFor, PERF,
} from '../config.js';
import { Pool } from '../core/Pool.js';
import { Sfx } from '../audio.js';
import { t } from '../i18n.js';

const MAX_ENEMY_RADIUS = 52;
const TAU = Math.PI * 2;

const BEHAVIORS = {
  projectile(ctx) { ctx.wm.fireAimed(ctx.weapon, ctx.params); },
  homing(ctx) { ctx.wm.fireAimed(ctx.weapon, ctx.params, { mode: 'homing' }); },
  lava(ctx) { ctx.wm.fireAimed(ctx.weapon, ctx.params, { mode: 'firetrail' }); },
  cluster(ctx) { ctx.wm.fireAimed(ctx.weapon, ctx.params, { mode: 'cluster' }); },
  pulse(ctx) {
    const { wm, weapon, params, player } = ctx;
    wm.scene.vfx.frostPulse(player.x, player.y, params.radius, weapon.def.key === 'icecage');
    wm.areaDamage(player.x, player.y, params.radius, params.dmg, weapon.def.key, {
      slow: params.slow, slowDur: params.slowDur,
      freezeChance: params.freezeChance, freezeDur: params.freezeDur,
    });
    Sfx.weaponCast(weapon.def.key);
  },
  chain(ctx) { ctx.wm.fireChain(ctx.weapon, ctx.params); },
  pool(ctx) { ctx.wm.throwPool(ctx.weapon, ctx.params); },
  bounce(ctx) { ctx.wm.fireBounce(ctx.weapon, ctx.params); },
  orbit(ctx) {
    ctx.wm.ensureOrbitals(ctx.weapon, ctx.params);
    ctx.wm.scene.vfx.bladeStormRing(ctx.player.x, ctx.player.y, ctx.params.orbitRadius);
    Sfx.weaponCast(ctx.weapon.def.key);
  },
  field(ctx) {
    const { wm, weapon, params, player } = ctx;
    wm.scene.vfx.blizzardField(player.x, player.y, params.radius);
    wm.areaDamage(player.x, player.y, params.radius, params.dmg, weapon.def.key, {
      slow: params.slow, slowDur: params.slowDur,
    });
    Sfx.weaponCast(weapon.def.key);
  },
  storm(ctx) { ctx.wm.fireStorm(ctx.weapon, ctx.params); },
  aura(ctx) {
    const { wm, weapon, params, player } = ctx;
    wm.scene.vfx.holyAura(player.x, player.y, params.radius);
    wm.areaDamage(player.x, player.y, params.radius, params.dmg, weapon.def.key);
    player.hp = Math.min(player.maxHp, player.hp + params.heal * params.cd);
    Sfx.weaponCast(weapon.def.key);
  },
};

export class WeaponManager {
  constructor(scene) {
    this.scene = scene;
    this.weapons = [];
    this.pendingShots = [];
    this.active = [];
    this.zones = [];
    this.plagueQueue = [];
    this.plagueQueueHead = 0;
    this.plagueQueueTail = 0;
    this.plagueQueueCount = 0;
    for (let i = 0; i < PERF.maxPlagueQueue; i++) {
      this.plagueQueue.push({ x: 0, y: 0, dmg: 0, poisonDps: 0, depth: 0, maxDepth: 0 });
    }
    this.plagueVictims = [];
    this.plagueDamageOptions = {
      source: 'plague', hitX: 0, hitY: 0, aoe: true,
      status: { poisonDps: 0, poisonDur: 2.2, plague: true },
    };
    this.plagueVisualTokens = PERF.maxPlagueBurstsPerFrame;
    this.plagueVisualCells = [];
    this.plagueVisualCursor = 0;
    for (let i = 0; i < PERF.plagueVisualMergeSlots; i++) {
      this.plagueVisualCells.push({ x: 0, y: 0, life: 0 });
    }

    this.pool = new Pool(() => ({
      x: 0, y: 0, vx: 0, vy: 0, dmg: 0, pierce: 0, radius: 10, life: 0,
      aoe: 0, aoeMult: 0, mode: 'normal', sourceKey: '', speed: 0,
      homing: 0, crit: 0, execute: 0, collision: true, spin: 0,
      trailT: 0, vfxT: 0, trailRadius: 0, trailDmg: 0, trailLife: 0, trailTick: 0.5,
      fragments: 0, fragmentDmg: 0, fragmentAoe: 34, fragmentRange: 270, fragmented: false,
      splitRays: 0, rayDmg: 0, rehitT: 0, rehitInterval: 0, owner: null, angle: 0,
      initialLife: 0, age: 0, baseScale: 1, visualStyle: '', arcHeight: 0,
      expire: null, hit: new Set(), hitCooldowns: new Map(),
      spr: scene.add.image(0, 0, 'blade').setVisible(false).setActive(false).setDepth(3.6),
    }));
    this.pool.warm(PERF.maxProjectiles);

    this.zonePool = new Pool(() => ({
      x: 0, y: 0, radius: 0, dmg: 0, tick: 0.5, tickT: 0, life: 0, initialLife: 0,
      sourceKey: '', color: 0xffffff, followPlayer: false, status: null, sharedHitKey: '',
      style: 'generic', pulse: 0, bubbleT: 0, detailRotation: 0, rotation: 0, introT: 0, introDur: 0,
      visualAspect: 1, visualFlipY: false, visualVariant: 0, visualHot: false,
      shader: null,
      base: scene.add.image(0, 0, 'pool_base').setVisible(false).setActive(false).setDepth(1.12),
      edge: scene.add.image(0, 0, 'pool_edge').setVisible(false).setActive(false).setDepth(1.18),
      detail: scene.add.image(0, 0, 'pool_patch').setVisible(false).setActive(false).setDepth(1.16),
    }));
    this.zonePool.warm(PERF.maxZones);
  }

  addWeapon(key) {
    if (SKILLS[key]) return this.addSkill(key);
    const def = WEAPONS[key];
    if (!def || this.getWeapon(key)) return;
    this.weapons.push({
      baseKey: key, baseDef: def, def, lv: 1, cd: 0.2, evolved: false,
      orbitals: [], orbitLayoutCount: 0,
    });
  }

  addSkill(key, { main = false } = {}) {
    const def = SKILLS[key];
    if (!def || this.getWeapon(key)) return false;
    const weapon = {
      skillKey: key, baseKey: key, baseDef: def, def, lv: 1, cd: 0.2, evolved: true, main,
      modules: { scale: 0, power: 0, trait: 0 }, params: null,
      orbitals: [], orbitLayoutCount: 0,
    };
    this.refreshSkillParams(weapon);
    this.weapons.push(weapon);
    return true;
  }

  getWeapon(key) {
    return this.weapons.find(w => w.skillKey === key || w.baseKey === key || w.def.key === key);
  }

  getLevel(key) { return this.getWeapon(key)?.lv || 0; }

  upgrade(key) {
    const w = this.getWeapon(key);
    if (w && w.lv < w.def.maxLv) {
      w.lv++;
      w.cd = Math.min(w.cd, 0.15);
    }
  }

  upgradeSkill(key, moduleKey) {
    const weapon = this.getWeapon(key);
    if (!weapon?.skillKey || weapon.lv >= weapon.def.maxLv) return false;
    if (!Object.hasOwn(weapon.modules, moduleKey) || weapon.modules[moduleKey] >= 3) return false;
    weapon.modules[moduleKey]++;
    weapon.lv++;
    weapon.cd = Math.min(weapon.cd, 0.15);
    this.refreshSkillParams(weapon);
    return true;
  }

  refreshSkillParams(weapon) {
    const def = SKILLS[weapon.skillKey];
    if (!def) return;
    weapon.params = skillParamsFor(def, weapon.modules);
  }

  evolve(baseKey, evolutionKey) {
    const w = this.getWeapon(baseKey);
    const def = EVOLUTIONS[evolutionKey];
    if (!w || w.evolved || !def || def.baseKey !== w.baseKey || w.lv < w.baseDef.maxLv) return false;
    w.def = def;
    w.lv = def.levelStart;
    w.evolved = true;
    w.cd = 0.05;
    this.scene.ui?.showToast?.(`${t(def.nameKey)} — ${t(def.descKey)}`, 4.5);
    return true;
  }

  paramsFor(w) {
    if (w.skillKey) return w.params;
    const start = w.def.levelStart || 1;
    return w.def.levels[Math.max(0, w.lv - start)];
  }

  queueShot(delay, fire) {
    if (delay <= 0) fire();
    else this.pendingShots.push({ t: delay, fire });
  }

  aimedAngle(player) {
    const target = this.scene.enemies.nearest(player.x, player.y, 1100);
    return target ? Math.atan2(target.y - player.y, target.x - player.x) : (player.facing < 0 ? Math.PI : 0);
  }

  fireAimed(weapon, params, overrides = {}) {
    const player = this.scene.player;
    const baseAngle = this.aimedAngle(player);
    const count = params.count || 1;
    const spread = ((weapon.def.volleySpreadDeg ?? weapon.baseDef.volleySpreadDeg) || 10) * Math.PI / 180;
    const stagger = ((weapon.def.volleyStaggerMs ?? weapon.baseDef.volleyStaggerMs) || 55) / 1000;
    Sfx.weaponCast(weapon.def.key);
    for (let i = 0; i < count; i++) {
      const angle = baseAngle + (i - (count - 1) / 2) * spread;
      const totalFragments = params.fragments || 0;
      const shotFragments = totalFragments > 0
        ? Math.floor(totalFragments / count) + (i < totalFragments % count ? 1 : 0)
        : 0;
      this.queueShot(i * stagger, () => {
        this.fireProjectile(weapon.def, player.x, player.y - 14, angle, params,
          totalFragments > 0 ? { ...overrides, fragments: shotFragments } : overrides);
      });
    }
  }

  fireProjectile(def, x, y, angle, params, overrides = {}) {
    if (this.active.length >= PERF.maxProjectiles) return null;
    const p = this.pool.get();
    const speed = overrides.speed || params.speed || 420;
    p.x = x; p.y = y;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.speed = speed;
    p.dmg = (overrides.dmg ?? params.dmg) * this.scene.player.dmgMult;
    p.pierce = overrides.pierce ?? params.pierce ?? 0;
    p.radius = overrides.radius ?? def.projRadius ?? 12;
    p.life = overrides.life ?? ((params.range || speed * (params.duration || 1.5)) / speed);
    p.initialLife = p.life;
    p.age = 0;
    p.aoe = overrides.aoe ?? params.aoe ?? 0;
    p.aoeMult = overrides.aoeMult ?? params.aoeMult ?? 0;
    p.mode = overrides.mode || 'normal';
    p.sourceKey = def.key;
    p.homing = params.homing || 0;
    p.crit = params.crit || 0;
    p.execute = params.execute || 0;
    p.collision = overrides.collision ?? true;
    p.spin = overrides.spin || 0;
    p.trailT = 0;
    p.vfxT = 0;
    p.trailRadius = params.trailRadius || 0;
    p.trailDmg = (params.trailDmg || 0) * this.scene.player.dmgMult;
    p.trailLife = params.trailLife || 0;
    p.trailTick = params.trailTick || 0.5;
    p.fragments = overrides.fragments ?? params.fragments ?? 0;
    p.fragmentDmg = (params.fragmentDmg || 0) * this.scene.player.dmgMult;
    p.fragmentAoe = params.fragmentAoe || 34;
    p.fragmentRange = params.fragmentRange || 270;
    p.fragmented = false;
    p.splitRays = params.splitRays || 0;
    p.rayDmg = (params.rayDmg || 0) * this.scene.player.dmgMult;
    p.rehitT = 0;
    p.rehitInterval = params.rehit || 0;
    p.owner = overrides.owner || null;
    p.angle = angle;
    p.baseScale = overrides.scale || 1;
    p.visualStyle = overrides.visualStyle || (
      def.key === 'lavatrail' ? 'fireground'
        : def.key === 'cluster' ? 'cluster'
          : def.key === 'fireball' ? 'fire'
            : def.key === 'plague' ? 'plague'
              : def.key === 'corrosion' ? 'corrosion'
                : def.key === 'venomflask' ? 'poison'
                  : def.key === 'holyorb' || def.key === 'prism' ? 'holy'
                    : def.key === 'headhunter' ? 'headhunter'
                      : def.key === 'blade' || def.key === 'bladestorm' ? 'blade' : ''
    );
    p.arcHeight = overrides.arcHeight || 0;
    p.expire = overrides.expire || null;
    p.hit.clear();
    p.hitCooldowns.clear();
    const texture = overrides.texture || def.projTexture || 'blade';
    p.spr.setTexture(texture);
    p.spr.setActive(true).setVisible(true).setPosition(x, y).setRotation(angle).setScale(p.baseScale).setAlpha(1).clearTint();
    if (!texture.startsWith('fireball') && !texture.startsWith('fire_fragment')
      && !texture.startsWith('venom_flask') && texture !== 'holy_orb') {
      p.spr.setTint(def.color || 0xffffff);
    }
    this.active.push(p);
    return p;
  }

  throwPool(weapon, params) {
    const player = this.scene.player;
    const target = this.scene.enemies.nearest(player.x, player.y, 760);
    const tx = target?.x ?? player.x + player.facing * 300;
    const ty = target?.y ?? player.y;
    const dx = tx - player.x, dy = ty - player.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    this.fireProjectile(weapon.def, player.x, player.y - 18, Math.atan2(dy, dx), params, {
      collision: false,
      life: dist / params.speed,
      spin: 7,
      mode: 'flask',
      visualStyle: weapon.def.key === 'plague' ? 'plague' : weapon.def.key === 'corrosion' ? 'corrosion' : 'poison',
      arcHeight: Math.min(88, 42 + dist * 0.08),
      expire: { kind: 'zone', x: tx, y: ty, params, def: weapon.def },
    });
    Sfx.weaponCast(weapon.def.key);
  }

  fireBounce(weapon, params) {
    const player = this.scene.player;
    for (let i = 0; i < params.count; i++) {
      const angle = (i / params.count) * TAU + Math.random() * 0.55;
      this.fireProjectile(weapon.def, player.x, player.y, angle, params, {
        mode: 'bounce', life: params.duration, pierce: 999,
      });
    }
    Sfx.weaponCast(weapon.def.key);
  }

  ensureOrbitals(weapon, params) {
    while (weapon.orbitals.length < params.count && this.active.length < PERF.maxProjectiles) {
      const i = weapon.orbitals.length;
      const p = this.fireProjectile(weapon.def, this.scene.player.x, this.scene.player.y, 0, params, {
        mode: 'orbit', life: Number.POSITIVE_INFINITY, pierce: 999, owner: weapon,
        texture: 'blade', scale: 0.9,
      });
      if (!p) break;
      p.angle = (i / params.count) * TAU;
      weapon.orbitals.push(p);
    }
    if (weapon.orbitLayoutCount !== weapon.orbitals.length && weapon.orbitals.length > 0) {
      const phase = weapon.orbitals[0].angle;
      const count = weapon.orbitals.length;
      for (let i = 0; i < count; i++) weapon.orbitals[i].angle = phase + (i / count) * TAU;
      weapon.orbitLayoutCount = count;
    }
  }

  fireChain(weapon, params) {
    const used = new Set();
    let x = this.scene.player.x, y = this.scene.player.y;
    let radius = 900;
    for (let hop = 0; hop < params.chains; hop++) {
      const best = this.scene.enemies.grid.nearestInCircle(
        x, y, radius, e => e.hp > 0 && !used.has(e),
      );
      if (!best) break;
      this.scene.vfx.lightning(x, y, best.x, best.y, weapon.def.color, {
        profile: weapon.def.key === 'thunderjudgment' ? 'judgment' : 'chain',
      });
      this.scene.enemies.damage(best, params.dmg * this.scene.player.dmgMult, {
        source: weapon.def.key,
        status: { stunChance: params.stunChance, stunDur: params.stunDur },
        hitX: x,
        hitY: y,
      });
      used.add(best);
      x = best.x; y = best.y;
      radius = params.jump;
    }
    if (used.size) {
      Sfx.weaponCast(weapon.def.key);
      Sfx.weaponImpact(weapon.def.key, used.size >= 4 ? 'heavy' : 'light');
    }
  }

  fireStorm(weapon, params) {
    const props = this.scene.props?.active || [];
    const candidates = this.scene.enemies.active.concat(props)
      .filter(e => e.hp > 0)
      .sort((a, b) => {
        const p = this.scene.player;
        return (a.x - p.x) ** 2 + (a.y - p.y) ** 2 - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2);
      });
    for (let i = 0; i < Math.min(params.bolts, candidates.length); i++) {
      const e = candidates[i];
      this.scene.vfx.lightning(e.x, e.y - 260, e.x, e.y, weapon.def.color, { profile: 'vertical' });
      this.areaDamage(e.x, e.y, params.splash, params.dmg, weapon.def.key);
    }
    if (candidates.length) {
      Sfx.weaponCast(weapon.def.key);
      Sfx.weaponImpact(weapon.def.key, candidates.length >= 2 ? 'heavy' : 'light');
    }
  }

  createZone(x, y, params, def, overrides = {}) {
    if (this.zones.length >= PERF.maxZones) this.releaseZone(0);
    const z = this.zonePool.get();
    z.x = x; z.y = y;
    z.radius = overrides.radius || params.radius;
    z.dmg = (overrides.dmg ?? params.dmg) * this.scene.player.dmgMult;
    z.tick = overrides.tick || params.tick || 0.5;
    z.tickT = 0;
    z.life = overrides.life || params.duration || 1;
    z.initialLife = z.life;
    z.sourceKey = def.key;
    z.color = overrides.color || def.color || 0xffffff;
    z.followPlayer = !!overrides.followPlayer;
    z.style = overrides.style || (def.key === 'lavatrail' ? 'fireground'
      : def.key === 'plague' ? 'plague'
        : def.key === 'corrosion' ? 'corrosion'
          : def.key === 'venomflask' ? 'poison' : 'generic');
    z.pulse = 0;
    z.introT = 0;
    z.introDur = (z.style === 'poison' || z.style === 'plague' || z.style === 'corrosion') ? 0.3 : 0;
    z.bubbleT = z.style === 'fireground' ? 0.04 + Math.random() * 0.14 : 0.16 + Math.random() * 0.34;
    z.detailRotation = Math.random() * TAU;
    z.rotation = z.style === 'fireground' ? z.detailRotation : (overrides.rotation || 0);
    z.visualAspect = 1;
    z.visualFlipY = z.style === 'fireground' && Math.random() < 0.5;
    z.visualVariant = z.style === 'fireground' ? Math.floor(Math.random() * 3) : 0;
    z.visualHot = z.style === 'fireground' && Math.random() < 0.7;
    z.status = overrides.status || {
      slow: params.slow, slowDur: params.slowDur,
      poisonDps: params.poisonDps, poisonDur: Math.max(1.2, (params.tick || 0.5) * 3), plague: params.plague,
      plagueDepth: 0, plagueMaxDepth: params.plagueChainDepth || 0,
      vuln: params.vuln, vulnDur: params.vulnDur,
    };
    z.sharedHitKey = z.style === 'fireground' ? 'fireZoneNextHit'
      : (z.style === 'poison' || z.style === 'plague' || z.style === 'corrosion') ? 'poisonZoneNextHit' : '';
    const diameter = z.radius * 2;
    const poisonStyle = z.style === 'poison' || z.style === 'plague' || z.style === 'corrosion';
    z.shader = poisonStyle
      ? this.scene.vfx.poisonPool(x, y, z.radius, z.style)
      : z.style === 'fireground' ? this.scene.vfx.elementField(x, y, z.radius, z.style) : null;
    if (z.style === 'fireground') {
      z.base.setTexture('fire_field_base').clearTint().setAlpha(0.42);
      z.edge.setTexture('fire_field_edge').clearTint().setAlpha(0.06);
      z.detail.setTexture(`fire_field_coals_${z.visualVariant}`).clearTint().setAlpha(z.visualHot ? 0.46 : 0.22);
    } else if (z.style === 'plague') {
      z.base.setTexture('pool_base').setTint(0x243525).setAlpha(0.17);
      z.edge.setTexture('pool_edge').setTint(0x8d65a6).setAlpha(0.56);
      z.detail.setTexture('pool_patch').setTint(0x819e50).setAlpha(0.16);
    } else if (z.style === 'corrosion') {
      z.base.setTexture('pool_base').setTint(0x35450e).setAlpha(0.16);
      z.edge.setTexture('pool_edge').setTint(0xdfff62).setAlpha(0.56);
      z.detail.setTexture('pool_patch').setTint(0x9fca2f).setAlpha(0.15);
    } else if (z.style === 'poison') {
      z.base.setTexture('poison_pool_base').clearTint().setAlpha(0.48);
      z.edge.setTexture('poison_pool_edge').clearTint().setAlpha(0.64);
      z.detail.setTexture('poison_pool_flow').clearTint().setAlpha(0.42);
    } else {
      z.base.setTexture('glow').setTint(z.color).setAlpha(0.16);
      z.edge.setTexture('fx_ring').setTint(z.color).setAlpha(0.5);
      z.detail.setTexture('glow').setTint(z.color).setAlpha(0.1);
    }
    const visualWidth = diameter * (z.style === 'fireground' ? 1.06 : 1);
    const visualHeight = visualWidth * z.visualAspect;
    const introScale = z.introDur > 0 ? 0.16 : 1;
    for (const layer of [z.base, z.edge, z.detail]) {
      layer.setActive(true).setVisible(!(poisonStyle && z.shader)).setPosition(x, y)
        .setDisplaySize(visualWidth * introScale, visualHeight * introScale)
        .setRotation(z.rotation).setFlipY(z.visualFlipY);
    }
    if (z.style !== 'fireground') z.detail.setRotation(z.detailRotation);
    this.zones.push(z);
    return z;
  }

  releaseZone(index) {
    const z = this.zones[index];
    this.zones[index] = this.zones[this.zones.length - 1];
    this.zones.pop();
    z.base.setActive(false).setVisible(false).clearTint().setAlpha(1).setRotation(0).setFlipY(false);
    z.edge.setActive(false).setVisible(false).clearTint().setAlpha(1).setRotation(0).setFlipY(false);
    z.detail.setActive(false).setVisible(false).clearTint().setAlpha(1).setRotation(0).setFlipY(false);
    z.shader?.destroy();
    z.shader = null;
    z.status = null;
    z.style = 'generic';
    z.rotation = 0;
    z.visualAspect = 1;
    z.visualFlipY = false;
    z.visualVariant = 0;
    z.visualHot = false;
    z.introT = 0;
    z.introDur = 0;
    z.sharedHitKey = '';
    this.zonePool.release(z);
  }

  areaDamage(x, y, radius, amount, sourceKey, status = null, exclude = null, sharedHitKey = '', sharedHitInterval = 0) {
    const victims = [];
    const now = this.scene.state.time;
    const rr = radius + MAX_ENEMY_RADIUS;
    this.scene.enemies.grid.forEachInCircle(x, y, rr, (e, d2) => {
      if (e === exclude || e.hp <= 0) return false;
      if (sharedHitKey && e[sharedHitKey] > now) return false;
      const hitR = radius + e.radius;
      if (d2 <= hitR * hitR) victims.push(e);
      return false;
    });
    for (const e of victims) {
      if (sharedHitKey) e[sharedHitKey] = now + sharedHitInterval;
      this.scene.enemies.damage(e, amount, { source: sourceKey, status, hitX: x, hitY: y, aoe: true });
    }
    return victims.length;
  }

  explode(x, y, radius, dmg, exclude, sourceKey, color = 0xff8a3c, small = false, style = 'fire') {
    Sfx.weaponImpact(sourceKey, 'heavy');
    this.scene.vfx.fireExplosion(x, y, radius, color, small, style);
    this.areaDamage(x, y, radius, dmg, sourceKey, null, exclude);
  }

  fireFragments(p, exclude = null) {
    if (!p.fragments || p.fragmented) return;
    p.fragmented = true;
    this.scene.vfx.clusterBurst(p.x, p.y, p.fragments);
    for (let i = 0; i < p.fragments; i++) {
      const a = (i / p.fragments) * TAU + 0.08 * Math.sin(i * 2.7);
      const fragment = this.fireProjectile({ key: p.sourceKey, projTexture: 'fire_fragment', projRadius: 8, color: 0xffb23f }, p.x, p.y, a, {
        dmg: p.fragmentDmg / this.scene.player.dmgMult, speed: 390, range: p.fragmentRange, pierce: 0,
      }, { mode: 'fragment', aoe: p.fragmentAoe, aoeMult: 0.45, scale: 0.96, visualStyle: 'fragment' });
      if (fragment && exclude) fragment.hit.add(exclude);
    }
  }

  prismRays(p, target) {
    if (!p.splitRays) return;
    const props = this.scene.props?.active || [];
    const nearby = this.scene.enemies.active.concat(props)
      .filter(e => e !== target && e.hp > 0 && (e.x - target.x) ** 2 + (e.y - target.y) ** 2 < 280 ** 2)
      .sort((a, b) => (a.x - target.x) ** 2 + (a.y - target.y) ** 2
        - ((b.x - target.x) ** 2 + (b.y - target.y) ** 2))
      .slice(0, p.splitRays);
    for (const e of nearby) {
      this.scene.vfx.lightning(target.x, target.y, e.x, e.y, 0xfff4c2, { profile: 'prism' });
      this.scene.enemies.damage(e, p.rayDmg, { source: p.sourceKey, hitX: target.x, hitY: target.y });
    }
  }

  handleHit(p, e) {
    let dmg = p.dmg;
    const critical = !!p.crit && Math.random() < p.crit;
    if (critical) dmg *= 2;
    const executed = !!p.execute && !e.type.boss && e.hp / e.maxHp <= p.execute;
    if (executed) dmg = Math.max(dmg, e.hp + 1);
    if (p.aoe <= 0) Sfx.weaponImpact(p.sourceKey);
    const fireImpact = p.aoe > 0 && (p.visualStyle === 'fire' || p.visualStyle === 'fireground'
      || p.visualStyle === 'cluster' || p.visualStyle === 'fragment');
    if (p.visualStyle === 'holy') this.scene.vfx.holyImpact(p.x, p.y);
    else if (p.visualStyle === 'blade' || p.visualStyle === 'headhunter') {
      this.scene.vfx.bladeImpact(p.x, p.y, Math.atan2(p.vy, p.vx), {
        headhunter: p.visualStyle === 'headhunter', critical, executed,
      });
    }
    else if (!fireImpact) this.scene.vfx.hitSpark(p.x, p.y, p.spr.tintTopLeft);
    this.scene.enemies.damage(e, dmg, { source: p.sourceKey, hitX: p.x, hitY: p.y });
    if (p.aoe > 0) this.explode(p.x, p.y, p.aoe, p.dmg * p.aoeMult, e, p.sourceKey,
      p.visualStyle === 'fragment' ? 0xffb23f : p.visualStyle === 'fireground' ? 0xff5d2e : 0xff8a3c,
      p.visualStyle === 'fragment', p.visualStyle);
    if (p.mode === 'cluster') this.fireFragments(p, e);
    if (p.mode === 'bounce') this.prismRays(p, e);
    p.pierce--;
    return p.pierce < 0;
  }

  triggerExpire(p) {
    if (p.mode === 'cluster') this.fireFragments(p);
    if (p.expire?.kind === 'zone') {
      this.createZone(p.expire.x, p.expire.y, p.expire.params, p.expire.def);
      this.scene.vfx.flaskBreak(p.expire.x, p.expire.y, p.visualStyle, p.expire.params.radius);
      Sfx.weaponImpact(p.expire.def.key, 'heavy');
    }
  }

  releaseProjectile(index) {
    const p = this.active[index];
    this.active[index] = this.active[this.active.length - 1];
    this.active.pop();
    if (p.owner) {
      const oi = p.owner.orbitals.indexOf(p);
      if (oi >= 0) p.owner.orbitals.splice(oi, 1);
    }
    p.spr.setActive(false).setVisible(false).clearTint().setScale(1).setAlpha(1);
    p.hit.clear();
    p.hitCooldowns.clear();
    p.expire = null;
    p.owner = null;
    p.visualStyle = '';
    p.arcHeight = 0;
    this.pool.release(p);
  }

  updatePending(dt) {
    for (let i = this.pendingShots.length - 1; i >= 0; i--) {
      const s = this.pendingShots[i];
      s.t -= dt;
      if (s.t <= 0) {
        s.fire();
        this.pendingShots[i] = this.pendingShots[this.pendingShots.length - 1];
        this.pendingShots.pop();
      }
    }
  }

  updateZones(dt) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.life -= dt;
      if (z.life <= 0) {
        this.releaseZone(i);
        continue;
      }
      if (z.followPlayer) {
        z.x = this.scene.player.x; z.y = this.scene.player.y;
        z.base.setPosition(z.x, z.y); z.edge.setPosition(z.x, z.y); z.detail.setPosition(z.x, z.y);
        z.shader?.shader.setPosition(z.x, z.y);
      }
      z.tickT -= dt;
      if (z.tickT <= 0) {
        z.tickT += z.tick;
        this.areaDamage(z.x, z.y, z.radius, z.dmg, z.sourceKey, z.status, null, z.sharedHitKey, z.tick);
        z.pulse = 1;
      }
      z.pulse = Math.max(0, z.pulse - dt * 5.5);
      z.shader?.set({
        progress: 1 - z.life / Math.max(0.001, z.initialLife),
        intensity: 1 + z.pulse * 0.12,
      });
      z.introT = Math.min(z.introDur, z.introT + dt);
      const introProgress = z.introDur > 0 ? z.introT / z.introDur : 1;
      const spread = 1 - Math.pow(1 - introProgress, 3);
      const breathe = 1 + z.pulse * 0.045;
      const diameter = z.radius * 2 * breathe;
      const visualWidth = diameter * (z.style === 'fireground' ? 1.06 : 1) * spread;
      const visualHeight = visualWidth * z.visualAspect;
      if (z.style === 'fireground' && z.shader) {
        z.shader.shader.setDisplaySize(visualWidth, visualHeight * 0.9);
      }
      z.base.setDisplaySize(visualWidth, visualHeight);
      z.edge.setDisplaySize(visualWidth, visualHeight)
        .setAlpha((z.style === 'fireground' ? 0.05 : z.style === 'poison' ? 0.6 : 0.48) + z.pulse * 0.05);
      z.detail.setDisplaySize(visualWidth * 0.96, visualHeight * 0.96)
        .setRotation(z.style === 'fireground'
          ? z.rotation
          : z.detailRotation + z.life * (z.style === 'corrosion' ? 0.11 : 0.045))
        .setAlpha(z.style === 'fireground'
          ? (z.visualHot ? 0.43 : 0.2) + z.pulse * 0.12
          : z.style === 'poison' ? 0.4 + z.pulse * 0.1
            : 0.14 + z.pulse * 0.1);

      z.bubbleT -= dt;
      if (z.bubbleT <= 0) {
        z.bubbleT = z.style === 'fireground'
          ? 0.18 + Math.random() * 0.24
          : (z.style === 'poison' || z.style === 'plague' || z.style === 'corrosion')
            ? 0.28 + Math.random() * 0.34
            : 0.42 + Math.random() * 0.46;
        const a = Math.random() * TAU;
        const r = z.radius * (0.14 + Math.random() * (z.style === 'fireground' ? 0.5 : 0.58));
        const bx = z.x + Math.cos(a) * r, by = z.y + Math.sin(a) * r * (z.style === 'fireground' ? 0.82 : 0.72);
        if (z.style === 'fireground') this.scene.vfx.groundFlame(bx, by);
        else if (z.style === 'poison' && Math.random() < 0.62) this.scene.vfx.poisonMist(bx, by, z.style);
        else if (z.style === 'plague' && Math.random() < 0.38) this.scene.vfx.poisonMist(bx, by, z.style);
        else if (z.style !== 'generic') this.scene.vfx.poolBubble(bx, by, z.style);
      }
    }
  }

  updateProjectile(p, dt) {
    p.age += dt;
    if (p.mode === 'orbit') {
      const params = this.paramsFor(p.owner);
      p.angle += params.speed * dt;
      p.x = this.scene.player.x + Math.cos(p.angle) * params.orbitRadius;
      p.y = this.scene.player.y + Math.sin(p.angle) * params.orbitRadius * 0.68;
      p.dmg = params.dmg * this.scene.player.dmgMult;
      p.rehitT -= dt;
      if (p.rehitT <= 0) { p.hit.clear(); p.rehitT = params.cd; }
      p.spr.setPosition(p.x, p.y).setRotation(p.angle + Math.PI / 2);
      return;
    }

    if (p.mode === 'homing') {
      const target = this.scene.enemies.nearest(p.x, p.y, 520);
      if (target) {
        const dx = target.x - p.x, dy = target.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, p.homing * dt);
        let nx = p.vx / p.speed, ny = p.vy / p.speed;
        nx += (dx / d - nx) * k; ny += (dy / d - ny) * k;
        const n = Math.hypot(nx, ny) || 1;
        p.vx = nx / n * p.speed; p.vy = ny / n * p.speed;
        if (p.visualStyle === 'headhunter') {
          p.vfxT -= dt;
          if (p.vfxT <= 0) {
            p.vfxT = 0.11;
            this.scene.vfx.headhunterTrack(p.x, p.y, target.x, target.y);
          }
        }
      }
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.spin) p.spr.rotation += p.spin * dt;
    else p.spr.setRotation(Math.atan2(p.vy, p.vx));

    if (p.mode === 'bounce') {
      const cam = this.scene.cameras.main;
      const hw = cam.displayWidth * 0.48, hh = cam.displayHeight * 0.48;
      const player = this.scene.player;
      if (p.x < player.x - hw || p.x > player.x + hw) { p.vx *= -1; p.x = Math.max(player.x - hw, Math.min(player.x + hw, p.x)); }
      if (p.y < player.y - hh || p.y > player.y + hh) { p.vy *= -1; p.y = Math.max(player.y - hh, Math.min(player.y + hh, p.y)); }
    }

    if (p.mode === 'firetrail') {
      p.trailT -= dt;
      if (p.trailT <= 0) {
        p.trailT = 0.17;
        const pathAngle = Math.atan2(p.vy, p.vx);
        this.createZone(p.x, p.y, {
          radius: p.trailRadius, dmg: p.trailDmg / this.scene.player.dmgMult,
          tick: p.trailTick, duration: p.trailLife,
        }, { key: p.sourceKey, color: 0xff5d2e }, {
          style: 'fireground', rotation: pathAngle,
        });
      }
    }

    const isFire = p.visualStyle === 'fire' || p.visualStyle === 'fireground'
      || p.visualStyle === 'cluster' || p.visualStyle === 'fragment';
    if (isFire) {
      p.vfxT -= dt;
      if (p.vfxT <= 0) {
        p.vfxT = p.visualStyle === 'fragment' ? 0.075 : 0.055;
        this.scene.vfx.fireTrail(p.x, p.y, Math.atan2(p.vy, p.vx), p.visualStyle, p.baseScale);
      }
      p.spr.setScale(p.baseScale * (1 + Math.sin(p.age * 15) * 0.065));
    }

    if (p.visualStyle === 'holy') {
      p.vfxT -= dt;
      if (p.vfxT <= 0) {
        p.vfxT = 0.075;
        this.scene.vfx.holyTrail(p.x, p.y, Math.atan2(p.vy, p.vx), p.baseScale);
      }
      p.spr.setScale(p.baseScale * (1 + Math.sin(p.age * 18) * 0.055));
    }

    if (p.mode === 'flask') {
      const progress = Math.max(0, Math.min(1, 1 - p.life / Math.max(0.001, p.initialLife)));
      const lift = Math.sin(progress * Math.PI);
      const visualY = p.y - lift * p.arcHeight;
      p.spr.setPosition(p.x, visualY).setScale(p.baseScale * (0.9 + lift * 0.34));
      p.vfxT -= dt;
      if (p.vfxT <= 0) {
        p.vfxT = 0.085;
        this.scene.vfx.flaskTrail(p.x, visualY + 5, p.visualStyle);
      }
    } else {
      p.spr.setPosition(p.x, p.y);
    }
  }

  update(dt) {
    const player = this.scene.player;
    for (const w of this.weapons) {
      w.cd -= dt;
      if (w.cd > 0) continue;
      const params = this.paramsFor(w);
      if (!params) continue;
      w.cd = Math.max(0.1, params.cd * player.cdMult);
      BEHAVIORS[w.def.behavior]?.({ scene: this.scene, wm: this, weapon: w, params, player });
    }

    this.updatePending(dt);
    this.updateZones(dt);
    this.processPlagueQueue(dt);

    const enemies = this.scene.enemies;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      this.updateProjectile(p, dt);
      if (p.life <= 0) {
        this.triggerExpire(p);
        this.releaseProjectile(i);
        continue;
      }
      if (!p.collision) continue;

      let spent = false;
      enemies.grid.forEachInCircle(p.x, p.y, p.radius + MAX_ENEMY_RADIUS, (e, d2) => {
        if (e.hp <= 0) return false;
        if (p.mode === 'bounce') {
          if ((p.hitCooldowns.get(e) || 0) > p.age) return false;
        } else if (p.hit.has(e)) return false;
        const rr = e.radius + p.radius;
        if (d2 > rr * rr) return false;
        if (p.mode === 'bounce') p.hitCooldowns.set(e, p.age + p.rehitInterval);
        else p.hit.add(e);
        // 道具完整触发该技能的命中/AoE/分裂行为，但不消耗穿透、不终止投射物。
        if (e.isProp) {
          const pierce = p.pierce;
          this.handleHit(p, e);
          p.pierce = pierce;
          return false;
        }
        spent = this.handleHit(p, e);
        return spent;
      });
      if (spent) {
        this.triggerExpire(p);
        this.releaseProjectile(i);
      }
    }
  }

  onEnemyKilled(e) {
    if (!e.plague || e.poisonT <= 0 || e.plagueDepth >= e.plagueMaxDepth
      || this.plagueQueueCount >= PERF.maxPlagueQueue) return;
    const blast = this.plagueQueue[this.plagueQueueTail];
    this.plagueQueueTail = (this.plagueQueueTail + 1) % this.plagueQueue.length;
    this.plagueQueueCount++;
    blast.x = e.x;
    blast.y = e.y;
    blast.dmg = Math.max(12, e.poisonDps * 0.75);
    blast.poisonDps = e.poisonDps;
    blast.depth = e.plagueDepth + 1;
    blast.maxDepth = e.plagueMaxDepth;
  }

  shouldShowPlagueVisual(x, y) {
    if (this.plagueVisualTokens < 1) return false;
    const mergeRadius2 = PERF.plagueVisualMergeRadius * PERF.plagueVisualMergeRadius;
    for (let i = 0; i < this.plagueVisualCells.length; i++) {
      const cell = this.plagueVisualCells[i];
      if (cell.life <= 0) continue;
      const dx = x - cell.x, dy = y - cell.y;
      if (dx * dx + dy * dy <= mergeRadius2) return false;
    }

    this.plagueVisualTokens -= 1;
    const cell = this.plagueVisualCells[this.plagueVisualCursor];
    this.plagueVisualCursor = (this.plagueVisualCursor + 1) % this.plagueVisualCells.length;
    cell.x = x;
    cell.y = y;
    cell.life = PERF.plagueVisualMergeSec;
    return true;
  }

  processPlagueQueue(dt) {
    for (let i = 0; i < this.plagueVisualCells.length; i++) {
      const cell = this.plagueVisualCells[i];
      if (cell.life > 0) cell.life = Math.max(0, cell.life - dt);
    }
    this.plagueVisualTokens = Math.min(
      PERF.maxPlagueBurstsPerFrame,
      this.plagueVisualTokens + PERF.plagueVisualBurstsPerSec * dt,
    );

    const count = Math.min(PERF.maxPlagueSettlementsPerFrame, this.plagueQueueCount);
    let visibleBursts = 0;
    for (let i = 0; i < count; i++) {
      const blast = this.plagueQueue[this.plagueQueueHead];
      // 队列满时，下面的击杀可能立刻复用当前槽；先拷贝结算标量，避免读到新事件。
      const blastX = blast.x, blastY = blast.y;
      const blastDmg = blast.dmg, blastPoisonDps = blast.poisonDps;
      const blastDepth = blast.depth, blastMaxDepth = blast.maxDepth;
      this.plagueQueueHead = (this.plagueQueueHead + 1) % this.plagueQueue.length;
      this.plagueQueueCount--;
      // 玩法结算保持逐个尸爆；高密度连锁只采样代表性视觉，避免复生压测挤满粒子池。
      const showVisual = visibleBursts < PERF.maxPlagueBurstsPerFrame
        && this.shouldShowPlagueVisual(blastX, blastY);
      if (showVisual) {
        visibleBursts++;
        this.scene.vfx.plagueBurst(blastX, blastY, 112);
      }
      const victims = this.plagueVictims;
      victims.length = 0;
      this.scene.enemies.grid.forEachInCircle(blastX, blastY, 148, (e, d2) => {
        const rr = 96 + e.radius;
        if (e.hp > 0 && d2 <= rr * rr) victims.push(e);
        return false;
      });
      this.plagueDamageOptions.status.poisonDps = blastPoisonDps / this.scene.player.dmgMult;
      this.plagueDamageOptions.status.plagueDepth = blastDepth;
      this.plagueDamageOptions.status.plagueMaxDepth = blastMaxDepth;
      this.plagueDamageOptions.hitX = blastX;
      this.plagueDamageOptions.hitY = blastY;
      for (let victimIndex = 0; victimIndex < victims.length; victimIndex++) {
        const e = victims[victimIndex];
        if (showVisual && victimIndex < 2) this.scene.vfx.infectionArc(blastX, blastY, e.x, e.y);
        this.scene.enemies.damage(e, blastDmg, this.plagueDamageOptions);
      }
    }
    this.plagueVictims.length = 0;
  }
}
