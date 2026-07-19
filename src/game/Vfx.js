// 世界层反馈：伤害数字 / 命中火花 / 死亡爆点。全部池化（GDD §8.2）。
// 连杀弹字在 Hud（UI 层）。
import { PERF, COMBO } from '../config.js';
import { VFX_SHADER_KEYS, VfxRuntime } from './vfx/VfxRuntime.js';
import { BeamSystem } from './vfx/BeamSystem.js';

const POISON_STYLE = Object.freeze({
  poison: Object.freeze({
    trail: 'poisonTrail', impact: 'poisonImpact', bubbles: 'poisonBubbles', mist: 'poisonMist',
    colorA: [0.018, 0.10, 0.04, 1], colorB: [0.25, 0.72, 0.15, 1], opacity: 0.82,
  }),
  plague: Object.freeze({
    trail: 'plagueTrail', impact: 'plagueImpact', bubbles: 'plagueBubbles', mist: 'plagueMist',
    colorA: [0.035, 0.085, 0.04, 1], colorB: [0.43, 0.25, 0.54, 1], opacity: 0.82,
  }),
  corrosion: Object.freeze({
    trail: 'corrosionTrail', impact: 'corrosionImpact', bubbles: 'corrosionBubbles', mist: 'corrosionMist',
    colorA: [0.09, 0.12, 0.015, 1], colorB: [0.59, 0.82, 0.08, 1], opacity: 0.84,
  }),
});

const ELEMENT_STYLE = Object.freeze({
  fireground: Object.freeze({
    variant: 0, colorA: [0.78, 0.12, 0.025, 1], colorB: [1, 0.68, 0.16, 1],
    opacity: 0.62, depth: 1.145, aspect: 0.9, life: 0,
  }),
  blizzard: Object.freeze({
    variant: 1, colorA: [0.035, 0.13, 0.24, 1], colorB: [0.62, 0.94, 1, 1],
    opacity: 0.46, depth: 1.34, aspect: 0.9, life: 0.64,
  }),
  frostpulse: Object.freeze({
    variant: 2, colorA: [0.08, 0.3, 0.58, 1], colorB: [0.78, 0.97, 1, 1],
    opacity: 0.9, depth: 3.5, aspect: 1, life: 0.46,
  }),
  icecage: Object.freeze({
    variant: 2, colorA: [0.12, 0.34, 0.7, 1], colorB: [0.9, 1, 1, 1],
    opacity: 1, depth: 3.5, aspect: 1, life: 0.54,
  }),
  fireburst: Object.freeze({
    variant: 3, colorA: [0.85, 0.16, 0.035, 1], colorB: [1, 0.82, 0.28, 1],
    opacity: 0.72, depth: 3.76, aspect: 1, life: 0.34,
  }),
});

const COMBAT_STYLE = Object.freeze({
  holyhalo: Object.freeze({
    variant: 0, colorA: [0.72, 0.42, 0.08, 1], colorB: [1, 0.96, 0.7, 1],
    opacity: 0.9, depth: 1.82, life: 0.78,
  }),
  bladestorm: Object.freeze({
    variant: 1, colorA: [0.2, 0.58, 0.86, 1], colorB: [0.92, 0.98, 1, 1],
    opacity: 0.88, depth: 3.32, life: 0.46,
  }),
});

export class Vfx {
  constructor(scene) {
    this.scene = scene;
    this.runtime = new VfxRuntime(scene, { particleBudget: PERF.maxParticles });
    this.poisonShaderSlots = [];
    this.poisonShaderFree = [];
    this.preparePoisonShaders();
    this.elementFieldSlots = [];
    this.elementFieldFree = [];
    this.elementBurstSlots = [];
    this.elementBurstFree = [];
    this.elementBursts = [];
    this.prepareElementShaders();
    this.combatShaderSlots = [];
    this.combatShaderFree = [];
    this.combatBursts = [];
    this.prepareCombatShaders();

    // 伤害数字池（Text 复用，round-robin 抢占最旧的）
    this.texts = [];
    this.textCursor = 0;
    for (let i = 0; i < PERF.maxDamageTexts; i++) {
      const txt = scene.add.text(0, 0, '', {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: '17px',
        color: '#ffffff',
        stroke: '#10160f',
        strokeThickness: 4,
      }).setDepth(5).setOrigin(0.5).setVisible(false);
      this.texts.push({ txt, life: 0 });
    }

    // 粒子池（命中火花 + 死亡爆点共用）
    this.particles = [];
    this.freeParticles = [];
    this.kindCounts = Object.create(null);
    for (let i = 0; i < PERF.maxParticles; i++) {
      const spr = scene.add.image(0, 0, 'spark').setDepth(4).setVisible(false).setActive(false);
      this.freeParticles.push({
        spr, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
        startScale: 1, endScale: 0.5, startAlpha: 1, endAlpha: 0,
        rotation: 0, spin: 0, kind: '',
      });
    }
    this.beams = new BeamSystem(scene, this.runtime, () => this.particles.length);
  }

  damageText(x, y, amount, options = {}) {
    const slot = this.texts[this.textCursor];
    this.textCursor = (this.textCursor + 1) % this.texts.length;
    slot.txt
      .setText(String(amount))
      .setPosition(x + (Math.random() * 12 - 6), y)
      .setAlpha(1)
      .setColor(options.color || '#ffffff')
      .setFontSize(options.fontSize || '17px')
      .setVisible(true);
    slot.life = options.life || 0.45;
  }

  spawnParticle(x, y, vx, vy, life, scale, tint, texture = 'spark', options = {}) {
    const pt = this.freeParticles.pop();
    if (!pt) return false;
    const kind = options.kind || '';
    if (kind && options.kindLimit && (this.kindCounts[kind] || 0) >= options.kindLimit) {
      this.freeParticles.push(pt);
      return false;
    }
    pt.x = x; pt.y = y; pt.vx = vx; pt.vy = vy;
    pt.life = life; pt.maxLife = life;
    pt.startScale = options.startScale ?? scale;
    pt.endScale = options.endScale ?? scale * 0.45;
    pt.startAlpha = options.startAlpha ?? 1;
    pt.endAlpha = options.endAlpha ?? 0;
    pt.rotation = options.rotation || 0;
    pt.spin = options.spin || 0;
    pt.kind = kind;
    if (kind) this.kindCounts[kind] = (this.kindCounts[kind] || 0) + 1;
    pt.spr.setTexture(texture).setActive(true).setVisible(true).setPosition(x, y)
      .setDepth(options.depth ?? 4).setRotation(pt.rotation).setScale(pt.startScale)
      .setAlpha(pt.startAlpha).clearTint().setTint(tint);
    this.particles.push(pt);
    return true;
  }

  hitSpark(x, y, tint = 0xfff2c8) {
    this.spawnParticle(x, y, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, 0.14, 0.8, tint || 0xfff2c8);
  }

  deathPoof(x, y, tint = 0x8fd6a5) {
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      const spd = 90 + Math.random() * 110;
      this.spawnParticle(x, y, Math.cos(a) * spd, Math.sin(a) * spd, 0.3,
        0.7 + Math.random() * 0.6, tint, 'spark', {
          kind: 'death', kindLimit: PERF.maxDeathParticles,
        });
    }
  }

  fireTrail(x, y, angle, style = 'normal', scale = 1) {
    const backX = -Math.cos(angle), backY = -Math.sin(angle);
    const outer = style === 'fireground' ? 0xc62d12 : style === 'cluster' ? 0xe95a18 : 0xe24714;
    const core = style === 'fireground' ? 0xff9a24 : style === 'cluster' ? 0xffc43d : 0xffb52d;
    const streakScale = (style === 'fireground' ? 0.78 : 0.68) * scale;
    this.spawnParticle(x + backX * 24, y + backY * 24, backX * 72, backY * 72,
      0.2, streakScale, outer, 'fire_streak', {
        kind: 'fireFlight', kindLimit: PERF.maxFireTrailParticles,
        startScale: streakScale, endScale: streakScale * 0.24,
        startAlpha: 0.78, endAlpha: 0, rotation: angle, depth: 3.42,
      });
    this.spawnParticle(x + backX * 14, y + backY * 14, backX * 54, backY * 54,
      0.14, streakScale * 0.56, core, 'fire_streak', {
        kind: 'fireFlight', kindLimit: PERF.maxFireTrailParticles,
        startScale: streakScale * 0.56, endScale: streakScale * 0.12,
        startAlpha: 0.9, endAlpha: 0, rotation: angle, depth: 3.44,
      });
    if (Math.random() < 0.36) {
      const side = (Math.random() - 0.5) * 82;
      this.spawnParticle(x + backX * 15, y + backY * 15,
        backX * (82 + Math.random() * 48) - backY * side,
        backY * (82 + Math.random() * 48) + backX * side,
        0.22, 0.38 * scale, Math.random() < 0.62 ? 0xffd34e : 0xa82c17, 'spark', {
          kind: 'fireFlight', kindLimit: PERF.maxFireTrailParticles,
          endScale: 0.08 * scale, startAlpha: 0.9,
        });
    }
    if (Math.random() < 0.42) this.emitNative('fireEmbers', x + backX * 10, y + backY * 10, 1);
  }

  holyTrail(x, y, angle, scale = 1) {
    const backX = -Math.cos(angle), backY = -Math.sin(angle);
    this.spawnParticle(x + backX * 15, y + backY * 15, backX * 34, backY * 34,
      0.18, 0.2 * scale, 0xffe37a, 'glow', {
        kind: 'holyFlight', kindLimit: PERF.maxHolyTrailParticles,
        startScale: 0.2 * scale, endScale: 0.5 * scale,
      startAlpha: 0.42, endAlpha: 0, depth: 3.36,
      });
    if (Math.random() < 0.62) this.emitNative('holyMotes', x + backX * 11, y + backY * 11, 1);
    if (Math.random() < 0.48) {
      const side = (Math.random() - 0.5) * 34;
      this.spawnParticle(x + backX * 10 - backY * side * 0.25, y + backY * 10 + backX * side * 0.25,
        backX * (46 + Math.random() * 25) - backY * side,
        backY * (46 + Math.random() * 25) + backX * side,
        0.24, 0.32 * scale, Math.random() < 0.55 ? 0xffffff : 0xffd45a, 'spark', {
          kind: 'holyFlight', kindLimit: PERF.maxHolyTrailParticles,
          startScale: 0.32 * scale, endScale: 0.06 * scale,
          startAlpha: 0.88, endAlpha: 0, spin: 5, depth: 3.38,
        });
    }
  }

  holyImpact(x, y) {
    const native = this.emitNative('holyMotes', x, y, 6);
    if (native === 0) {
      this.spawnParticle(x, y, 0, -18, 0.22, 0.54, 0xffffff, 'holy_star', {
        kind: 'holyFlight', kindLimit: PERF.maxHolyTrailParticles,
        endScale: 0.12, startAlpha: 0.95, spin: 3.5, depth: 3.94,
      });
    }
    this.spawnParticle(x, y, 0, 0, 0.2, 0.12, 0xffed91, 'fx_ring', {
      kind: 'holyFlight', kindLimit: PERF.maxHolyTrailParticles,
      startScale: 0.12, endScale: 0.42, startAlpha: 0.9, depth: 3.9,
    });
    this.spawnParticle(x, y, 0, 0, 0.14, 0.18, 0xffffff, 'glow', {
      kind: 'holyFlight', kindLimit: PERF.maxHolyTrailParticles,
      startScale: 0.18, endScale: 0.62, startAlpha: 0.86, depth: 3.88,
    });
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI * 0.5 + Math.PI * 0.25;
      this.spawnParticle(x, y, Math.cos(a) * 92, Math.sin(a) * 92, 0.18,
        0.42, i % 2 ? 0xffffff : 0xffd45a, 'spark', {
          kind: 'holyFlight', kindLimit: PERF.maxHolyTrailParticles,
          endScale: 0.08, startAlpha: 0.92, depth: 3.92,
        });
    }
  }

  clusterBurst(x, y, count) {
    this.spawnParticle(x, y, 0, 0, 0.18, 0.34, 0xffd34e, 'fx_ring', {
      startScale: 0.08, endScale: 0.42, startAlpha: 0.86,
    });
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const spd = 155 + (i % 2) * 35;
      this.spawnParticle(x, y, Math.cos(a) * spd, Math.sin(a) * spd, 0.22,
        0.48, i % 2 ? 0xff8a20 : 0xffed86, 'spark', { endScale: 0.14, startAlpha: 0.92 });
    }
  }

  // 三阶段火焰爆炸：中心闪光 → 与 AOE 对齐的冲击环 → 放射火星。
  fireExplosion(x, y, radius, color = 0xff8a3c, small = false, style = 'fire') {
    const ringScale = radius / 64;
    const isFireGround = style === 'fireground';
    if (!small) this.spawnElementBurst('fireburst', x, y, radius * 1.08);
    this.spawnParticle(x, y, 0, 0, small ? 0.12 : 0.16, 0.18, 0xfff2b0, 'glow', {
      kind: 'fireImpact', kindLimit: PERF.maxFireImpactParticles,
      startScale: 0.18, endScale: Math.max(0.65, ringScale * 0.72), startAlpha: 0.95,
    });
    this.spawnParticle(x, y, 0, 0, small ? 0.15 : 0.24, ringScale, 0xffffff, 'fire_burst', {
      kind: 'fireImpact', kindLimit: PERF.maxFireImpactParticles,
      startScale: ringScale * 0.16, endScale: ringScale * (isFireGround ? 0.92 : 0.78),
      startAlpha: small ? 0.76 : 0.94, depth: 3.82, rotation: Math.random() * 0.35,
    });
    this.spawnParticle(x, y, 0, 0, small ? 0.18 : 0.25, ringScale, color, 'fx_ring', {
      kind: 'fireImpact', kindLimit: PERF.maxFireImpactParticles,
      startScale: ringScale * 0.16, endScale: ringScale, startAlpha: 0.9, depth: 3.85,
    });
    if (!small) {
      const residueScale = radius / (isFireGround ? 58 : 52);
      this.spawnParticle(x, y + 5, 0, 0, isFireGround ? 1.05 : 0.78, residueScale, 0xffffff, 'scorch', {
        kind: 'fireImpact', kindLimit: PERF.maxFireImpactParticles,
        startScale: residueScale * (isFireGround ? 0.86 : 1), endScale: residueScale,
        startAlpha: isFireGround ? 0.38 : 0.27, depth: 1.32, rotation: Math.random() * Math.PI,
      });
    }
    const n = small ? 5 : isFireGround ? 14 : 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const spd = (small ? 90 : 140) + Math.random() * (small ? 110 : 170);
      const flame = !small && i % 3 === 0;
      this.spawnParticle(x, y, Math.cos(a) * spd, Math.sin(a) * spd, small ? 0.2 : flame ? 0.28 : 0.34,
        flame ? 0.42 + Math.random() * 0.2 : 0.55 + Math.random() * 0.55,
        i % 3 ? color : 0xfff2b0, flame ? 'fire_streak' : 'spark', {
          kind: 'fireImpact', kindLimit: PERF.maxFireImpactParticles,
          rotation: a, endScale: flame ? 0.12 : 0.14, startAlpha: 0.95,
        });
    }
  }

  explosion(x, y, radius, color = 0xff8a3c) { this.fireExplosion(x, y, radius, color, false, 'fire'); }

  flaskTrail(x, y, style = 'poison') {
    const nativeStyle = POISON_STYLE[style] || POISON_STYLE.poison;
    if (this.emitNative(nativeStyle.trail, x, y + 4, 1) > 0) return true;
    const tint = style === 'plague' ? 0x9a6db1 : style === 'corrosion' ? 0xdfff62 : 0x78e05c;
    if (Math.random() < 0.58) {
      return this.spawnParticle(x, y + 4, (Math.random() - 0.5) * 18, 18 + Math.random() * 14,
        0.24, 0.34 + Math.random() * 0.18, tint, 'poison_drop', {
          kind: 'poisonFlight', kindLimit: PERF.maxPoisonFlightParticles,
          endScale: 0.08, startAlpha: 0.72, depth: 3.34, rotation: Math.random() * Math.PI,
        });
    }
    return this.spawnParticle(x, y, 0, 4, 0.18, 0.18, tint, 'glow', {
      kind: 'poisonFlight', kindLimit: PERF.maxPoisonFlightParticles,
      startScale: 0.18, endScale: 0.42, startAlpha: 0.28, depth: 3.32,
    });
  }

  flaskBreak(x, y, style = 'poison', radius = 96) {
    const color = style === 'plague' ? 0x8d65a6 : style === 'corrosion' ? 0xdfff62 : 0x78e05c;
    const dark = style === 'plague' ? 0x30452a : style === 'corrosion' ? 0x6f861c : 0x246f38;
    const splashScale = radius / 48;
    const nativeStyle = POISON_STYLE[style] || POISON_STYLE.poison;
    const nativeDrops = this.emitNative(nativeStyle.impact, x, y, 8);
    const nativeGlass = this.emitNative('poisonGlass', x, y, 7);
    if (nativeDrops + nativeGlass > 0) {
      this.spawnParticle(x, y - 3, 0, 0, 0.16, 0.18, 0xeaffdf, 'glow', {
        kind: 'poisonImpact', kindLimit: PERF.maxPoisonImpactParticles,
        startScale: 0.18, endScale: Math.max(0.72, radius / 110), startAlpha: 0.82, depth: 3.05,
      });
      return true;
    }
    this.spawnParticle(x, y, 0, 0, 0.3, splashScale, color, 'poison_splash', {
      kind: 'poisonImpact', kindLimit: PERF.maxPoisonImpactParticles,
      startScale: splashScale * 0.16, endScale: splashScale,
      startAlpha: 0.76, depth: 2.86, rotation: Math.random() * Math.PI,
    });
    this.spawnParticle(x, y - 3, 0, 0, 0.16, 0.18, 0xeaffdf, 'glow', {
      kind: 'poisonImpact', kindLimit: PERF.maxPoisonImpactParticles,
      startScale: 0.18, endScale: Math.max(0.72, radius / 110), startAlpha: 0.82, depth: 3.05,
    });
    this.spawnParticle(x, y, 0, 0, 0.28, radius / 64, color, 'fx_ring', {
      kind: 'poisonImpact', kindLimit: PERF.maxPoisonImpactParticles,
      startScale: radius / 64 * 0.18, endScale: radius / 64, startAlpha: 0.8, depth: 2.9,
    });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + Math.random() * 0.55;
      const spd = 85 + Math.random() * 90;
      this.spawnParticle(x, y, Math.cos(a) * spd, Math.sin(a) * spd, 0.32,
        0.75 + Math.random() * 0.5, 0xe7fff0, 'glass_shard', {
          kind: 'poisonImpact', kindLimit: PERF.maxPoisonImpactParticles,
          rotation: a, spin: (Math.random() - 0.5) * 13,
        });
      this.spawnParticle(x, y, Math.cos(a) * spd * 0.72, Math.sin(a) * spd * 0.72, 0.3,
        0.7 + Math.random() * 0.45, i % 2 ? color : dark, 'poison_drop', {
          kind: 'poisonImpact', kindLimit: PERF.maxPoisonImpactParticles,
          rotation: a + Math.PI / 2,
        });
    }
  }

  poolBubble(x, y, style = 'poison') {
    const nativeStyle = POISON_STYLE[style] || POISON_STYLE.poison;
    if (this.emitNative(nativeStyle.bubbles, x, y, 1) > 0) return true;
    const tint = style === 'plague' ? 0x9d77b3 : style === 'corrosion' ? 0xdfff62 : 0x89ee69;
    return this.spawnParticle(x, y, 0, -18, 0.52, 0.42 + Math.random() * 0.25, tint, 'poison_bubble', {
      kind: 'poolAmbient', kindLimit: PERF.maxPoolBubbles, endScale: 0.18, startAlpha: 0.66, depth: 1.75,
    });
  }

  poisonMist(x, y, style = 'poison') {
    const nativeStyle = POISON_STYLE[style] || POISON_STYLE.poison;
    if (this.emitNative(nativeStyle.mist, x, y, 1) > 0) return true;
    const tint = style === 'plague' ? 0x78558f : style === 'corrosion' ? 0xb7da3d : 0x3c9f4e;
    const scale = 0.58 + Math.random() * 0.38;
    return this.spawnParticle(x, y, (Math.random() - 0.5) * 14, -7 - Math.random() * 8,
      0.72 + Math.random() * 0.25, scale, tint, 'poison_mist', {
        kind: 'poolAmbient', kindLimit: PERF.maxPoolBubbles,
        startScale: scale, endScale: scale * 1.24, startAlpha: 0.24, depth: 1.72,
      });
  }

  groundFlame(x, y) {
    if (Math.random() < 0.88) {
      const variant = Math.floor(Math.random() * 3);
      const scale = 0.9 + Math.random() * 0.38;
      return this.spawnParticle(x, y, (Math.random() - 0.5) * 9, -9 - Math.random() * 11,
        0.5 + Math.random() * 0.18, scale, 0xffffff, `ground_flame_${variant}`, {
          kind: 'groundFire', kindLimit: PERF.maxGroundFlames,
          startScale: scale, endScale: scale * 0.42, startAlpha: 0.94,
          depth: 1.8, rotation: (Math.random() - 0.5) * 0.16,
        });
    }
    return this.spawnParticle(x, y, (Math.random() - 0.5) * 34, -22 - Math.random() * 28,
      0.4, 0.38 + Math.random() * 0.25, Math.random() < 0.55 ? 0xffd84d : 0xff6218, 'spark', {
        kind: 'groundFire', kindLimit: PERF.maxGroundFlames,
        endScale: 0.08, startAlpha: 0.82, depth: 1.82,
      });
  }

  plagueBurst(x, y, radius) {
    const ringScale = radius / 64;
    this.spawnParticle(x, y, 0, 0, 0.34, ringScale, 0x8d65a6, 'plague_ring', {
      kind: 'plague', kindLimit: PERF.maxPlagueParticles,
      startScale: ringScale * 0.12, endScale: ringScale, startAlpha: 0.92, depth: 3.7, rotation: Math.random() * Math.PI,
    });
    this.spawnParticle(x, y, 0, 0, 0.22, 0.25, 0xa6d35f, 'glow', {
      kind: 'plague', kindLimit: PERF.maxPlagueParticles,
      startScale: 0.25, endScale: ringScale * 0.7, startAlpha: 0.72,
    });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + Math.random() * 0.4;
      const spd = 75 + Math.random() * 95;
      this.spawnParticle(x, y, Math.cos(a) * spd, Math.sin(a) * spd, 0.42,
        0.55 + Math.random() * 0.45, i % 2 ? 0x8d65a6 : 0xa6d35f, 'poison_drop', {
          kind: 'plague', kindLimit: PERF.maxPlagueParticles, rotation: a + Math.PI / 2,
        });
    }
  }

  infectionArc(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    for (let i = 0; i < 3; i++) {
      const speedK = 2.5 + i * 0.75;
      this.spawnParticle(x1, y1, dx * speedK, dy * speedK, 0.24, 0.5 - i * 0.06,
        i === 1 ? 0xa6d35f : 0x8d65a6, 'poison_drop', {
          kind: 'plague', kindLimit: PERF.maxPlagueParticles,
          rotation: Math.atan2(dy, dx) + Math.PI / 2, endScale: 0.18, startAlpha: 0.9,
        });
    }
  }

  corrosionHit(x, y) {
    this.spawnParticle(x, y, 0, 0, 0.2, 0.48, 0xdfff62, 'glow', {
      startScale: 0.48, endScale: 0.12, startAlpha: 0.55,
    });
    for (let i = 0; i < 3; i++) {
      const a = -2.5 + i * 0.8 + Math.random() * 0.25;
      const spd = 65 + Math.random() * 55;
      this.spawnParticle(x, y, Math.cos(a) * spd, Math.sin(a) * spd, 0.28,
        0.62 + Math.random() * 0.35, 0xdfff62, 'corrosion_shard', { rotation: a, spin: 7 - i * 3 });
    }
  }

  areaPulse(x, y, radius, color = 0xffffff) {
    const ringScale = radius / 64;
    this.spawnParticle(x, y, 0, 0, 0.24, ringScale, color, 'fx_ring', {
      startScale: ringScale * 0.12, endScale: ringScale, startAlpha: 0.72, depth: 3.55,
    });
  }

  frostPulse(x, y, radius, heavy = false) {
    const style = heavy ? 'icecage' : 'frostpulse';
    const shader = this.spawnElementBurst(style, x, y, radius);
    if (!shader) this.areaPulse(x, y, radius, heavy ? 0xb9efff : 0x72d8ff);
    const count = heavy ? 15 : 11;
    if (this.emitNative('iceShards', x, y, count) > 0) return;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.22;
      const speed = 95 + Math.random() * 155;
      this.spawnParticle(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 0.3,
        0.34 + Math.random() * 0.28, i % 3 ? 0x72d8ff : 0xffffff, 'ice_shard', {
          kind: 'ice', kindLimit: PERF.maxIceParticles, rotation: a + Math.PI * 0.5,
          spin: (Math.random() - 0.5) * 9, endScale: 0.06, depth: 3.72,
        });
    }
  }

  freezeLock(x, y, enemyRadius = 24) {
    const burstRadius = Math.max(38, enemyRadius * 1.9);
    this.areaPulse(x, y, burstRadius, 0xb9efff);
    if (this.emitNative('iceShards', x, y, 8) > 0) return;
    for (let i = 0; i < 8; i++) {
      const a = Math.PI + (i / 7) * Math.PI + (Math.random() - 0.5) * 0.16;
      const speed = 72 + Math.random() * 74;
      this.spawnParticle(x, y + enemyRadius * 0.2, Math.cos(a) * speed, Math.sin(a) * speed - 28,
        0.34, 0.3 + Math.random() * 0.22, i % 2 ? 0xb9efff : 0xffffff, 'ice_shard', {
          kind: 'ice', kindLimit: PERF.maxIceParticles, rotation: a + Math.PI * 0.5,
          spin: (Math.random() - 0.5) * 8, endScale: 0.05, depth: 3.78,
        });
    }
  }

  freezeMote(x, y, enemyRadius = 24) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const px = x + side * enemyRadius * (0.48 + Math.random() * 0.5);
    return this.spawnParticle(px, y + Math.random() * enemyRadius * 0.7,
      -side * (3 + Math.random() * 7), -14 - Math.random() * 13,
      0.52 + Math.random() * 0.22, 0.18 + Math.random() * 0.13,
      Math.random() < 0.3 ? 0xffffff : 0xa8eaff, 'snowflake', {
        kind: 'freezeMote', kindLimit: 18, startAlpha: 0.72, endAlpha: 0,
        endScale: 0.04, spin: side * (1.5 + Math.random() * 2.5), depth: 3.2,
      });
  }

  freezeBreak(x, y, enemyRadius = 24, heavy = false) {
    const count = heavy ? 14 : 9;
    this.areaPulse(x, y, Math.max(34, enemyRadius * (heavy ? 2.05 : 1.65)), 0x75dfff);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.24;
      const speed = 90 + Math.random() * 120;
      this.spawnParticle(x + Math.cos(a) * enemyRadius * 0.38,
        y + enemyRadius * 0.15 + Math.sin(a) * enemyRadius * 0.25,
        Math.cos(a) * speed, Math.sin(a) * speed - 38,
        0.34 + Math.random() * 0.16, 0.28 + Math.random() * 0.24,
        i % 3 ? 0x69d5ff : 0xf4fdff, 'ice_shard', {
          kind: 'ice', kindLimit: PERF.maxIceParticles,
          rotation: a + Math.PI * 0.5, spin: (Math.random() - 0.5) * 11,
          endScale: 0.04, startAlpha: 0.96, depth: 3.8,
        });
    }
  }

  // 悬赏目标的低频轨道碎光：复用世界粒子池，不创建常驻对象，也不占用大面积场域 Shader。
  bountyMote(x, y, phase = 0) {
    const tangentX = -Math.sin(phase) * 18;
    const tangentY = Math.cos(phase) * 6;
    const bright = Math.sin(phase * 1.7) > 0.15;
    return this.spawnParticle(x, y, tangentX, -18 + tangentY, 0.42,
      bright ? 0.42 : 0.3, bright ? 0xfff1a8 : 0xffb548, bright ? 'holy_star' : 'spark', {
        kind: 'bountyMark', kindLimit: 12,
        startScale: bright ? 0.42 : 0.3,
        endScale: 0.06,
        startAlpha: bright ? 0.9 : 0.72,
        endAlpha: 0,
        spin: bright ? 3.5 : -2.4,
        depth: 3.18,
      });
  }

  blizzardField(x, y, radius) {
    const shader = this.spawnElementBurst('blizzard', x, y, radius, { followPlayer: true });
    const count = this.runtime.quality.key === 'low' ? 3 : 5;
    let emitted = 0;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      // 雪花只勾勒技能外缘，避免持续技能在玩家脚下形成高亮遮罩。
      const r = radius * (0.62 + Math.random() * 0.28);
      const sx = x + Math.cos(a) * r;
      const sy = y + Math.sin(a) * r * 0.7;
      emitted += this.emitNative('snow', sx, sy, 1);
      if (emitted === 0) this.spawnParticle(sx, sy, -45 - Math.random() * 55, 26 + Math.random() * 48,
        0.52, 0.2 + Math.random() * 0.18, i % 3 ? 0xb9efff : 0xffffff, 'snowflake', {
          kind: 'ice', kindLimit: PERF.maxIceParticles, spin: (Math.random() - 0.5) * 5,
          endScale: 0.04, startAlpha: 0.58, depth: 1.9,
        });
    }
    if (!shader) this.areaPulse(x, y, radius, 0x72d8ff);
    return emitted;
  }

  holyAura(x, y, radius) {
    const shader = this.spawnCombatBurst('holyhalo', x, y, radius, { followPlayer: true });
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * (0.62 + Math.random() * 0.22);
      this.emitNative('holyMotes', x + Math.cos(a) * r, y + Math.sin(a) * r * 0.78, 1);
    }
    if (!shader) this.areaPulse(x, y, radius, 0xffef91);
  }

  bladeStormRing(x, y, radius) {
    const shader = this.spawnCombatBurst('bladestorm', x, y, radius, { followPlayer: true });
    if (shader) return;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      this.spawnParticle(x + Math.cos(a) * radius * 0.72, y + Math.sin(a) * radius * 0.55,
        0, 0, 0.24, 0.34, 0xd8ecff, 'blade_slash', {
          kind: 'physical', kindLimit: PERF.maxPhysicalParticles,
          rotation: a + Math.PI * 0.5, spin: 3.5, endScale: 0.12, startAlpha: 0.72, depth: 3.3,
        });
    }
  }

  headhunterTrack(x1, y1, x2, y2) {
    if (this.beams?.emit(x1, y1, x2, y2, 0xffd36d, 'tracking')) return;
    for (let i = 1; i < 6; i++) {
      const k = i / 6;
      this.spawnParticle(x1 + (x2 - x1) * k, y1 + (y2 - y1) * k,
        0, 0, 0.1, 0.24, i % 2 ? 0xffd36d : 0xffffff, 'glow', {
          kind: 'physical', kindLimit: PERF.maxPhysicalParticles,
          startScale: 0.24, endScale: 0.05, startAlpha: 0.58, depth: 3.52,
        });
    }
  }

  bladeImpact(x, y, angle, { headhunter = false, critical = false, executed = false } = {}) {
    const tint = executed ? 0xffd36d : headhunter ? 0xffe2a0 : 0xd8ecff;
    const scale = executed ? 0.88 : critical ? 0.66 : 0.5;
    this.spawnParticle(x, y, 0, 0, executed ? 0.3 : 0.2, scale, tint, 'blade_slash', {
      kind: 'physical', kindLimit: PERF.maxPhysicalParticles,
      rotation: angle - 0.25, spin: executed ? 1.8 : 0.8,
      startScale: scale, endScale: scale * 0.46, startAlpha: 0.95, depth: 3.9,
    });
    this.emitNative(executed ? 'executeSlash' : 'bladeImpact', x, y, executed ? 3 : 2);
    this.spawnParticle(x, y, 0, 0, executed ? 0.28 : 0.16, 0.12, tint, 'fx_ring', {
      kind: 'physical', kindLimit: PERF.maxPhysicalParticles,
      startScale: 0.12, endScale: executed ? 0.72 : 0.34,
      startAlpha: executed ? 0.95 : 0.66, depth: 3.88,
    });
    if (!executed) return;
    this.spawnParticle(x, y, 0, 0, 0.32, scale * 0.92, 0xffffff, 'blade_slash', {
      kind: 'physical', kindLimit: PERF.maxPhysicalParticles,
      rotation: angle + Math.PI * 0.5, spin: -1.6,
      startScale: scale * 0.92, endScale: scale * 0.36, startAlpha: 1, depth: 4.02,
    });
    this.spawnParticle(x, y, 0, 0, 0.18, 0.42, 0xffffff, 'holy_star', {
      kind: 'physical', kindLimit: PERF.maxPhysicalParticles,
      startScale: 0.42, endScale: 0.92, startAlpha: 0.9, depth: 4.08,
    });
    this.scene.cameras.main.shake(70, 0.0025);
  }

  // Boss 冲锋拖尾：能量速度线（沿冲锋轴，Boss 色）+ 尘土卷扬（背向甩出）。
  // 逐帧节流调用，kind 限流避免复生压测挤占粒子池。
  bossChargeTrail(x, y, angle, scale = 1, tint = 0xff6a4a) {
    const backX = -Math.cos(angle), backY = -Math.sin(angle);
    const lim = { kind: 'bossCharge', kindLimit: PERF.maxBossChargeParticles };
    // 能量残影：沿冲锋轴对齐的拉伸条，落在 Boss 身后
    this.spawnParticle(x + backX * 22 * scale, y + backY * 22 * scale, backX * 60, backY * 60,
      0.2, 0.9 * scale, tint, 'fire_streak', {
        ...lim, startScale: 0.9 * scale, endScale: 0.3 * scale,
        startAlpha: 0.5, endAlpha: 0, rotation: angle, depth: 1.9,
      });
    // 尘土：向斜后方翻卷、微微上飘
    for (let i = 0; i < 2; i++) {
      const side = (Math.random() - 0.5) * 46;
      this.spawnParticle(
        x + backX * 12 * scale - backY * side * 0.2, y + backY * 12 * scale + backX * side * 0.2 + 4,
        backX * (40 + Math.random() * 34) - backY * side, backY * (40 + Math.random() * 34) + backX * side - 12,
        0.34, (0.5 + Math.random() * 0.4) * scale, i % 2 ? 0xcbb68d : 0x9c8862, 'glow', {
          ...lim, endScale: (0.9 + Math.random() * 0.5) * scale, startAlpha: 0.42, endAlpha: 0, depth: 1.85,
        });
    }
  }

  // 冲锋命中/终点冲击：定向冲击环 + 前向碎屑锥 + 白闪。
  bossChargeImpact(x, y, angle, tint = 0xff6a4a) {
    const lim = { kind: 'bossCharge', kindLimit: PERF.maxBossChargeParticles };
    this.spawnParticle(x, y, 0, 0, 0.26, 1.4, tint, 'fx_ring', {
      ...lim, startScale: 0.2, endScale: 1.55, startAlpha: 0.92, depth: 3.7,
    });
    this.spawnParticle(x, y, 0, 0, 0.16, 0.5, 0xffffff, 'glow', {
      ...lim, startScale: 0.5, endScale: 1.05, startAlpha: 0.9, depth: 3.72,
    });
    for (let i = 0; i < 8; i++) {
      const a = angle + (i / 8 - 0.5) * 1.5; // 前向锥形喷溅
      const spd = 150 + Math.random() * 170;
      this.spawnParticle(x, y, Math.cos(a) * spd, Math.sin(a) * spd, 0.3,
        0.55 + Math.random() * 0.4, i % 2 ? tint : 0xd8c49a, 'spark', {
          ...lim, rotation: a, endScale: 0.12, startAlpha: 0.95,
        });
    }
  }

  // 高画质使用共享双层 Rope + 滚动能量 Shader；Canvas/手动 fallback 保留池化光点。
  lightning(x1, y1, x2, y2, color = 0xb8a7ff, options = {}) {
    if (this.beams?.emit(x1, y1, x2, y2, color, options.profile || 'chain')) return;
    const segments = 7;
    for (let i = 0; i <= segments; i++) {
      const k = i / segments;
      const jitter = i === 0 || i === segments ? 0 : (Math.random() - 0.5) * 22;
      this.spawnParticle(
        x1 + (x2 - x1) * k + jitter,
        y1 + (y2 - y1) * k - jitter * 0.45,
        0, 0, 0.12, 0.65, color,
      );
    }
    for (let i = 0; i < (options.profile === 'vertical' ? 6 : 3); i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 90 + Math.random() * 150;
      this.spawnParticle(x2, y2, Math.cos(angle) * speed, Math.sin(angle) * speed,
        0.16, 0.6, i % 2 ? 0xffffff : color, 'electric_spark');
    }
  }

  update(dt) {
    this.runtime.update(dt);
    this.beams?.update(dt);
    for (let i = this.elementBursts.length - 1; i >= 0; i--) {
      const burst = this.elementBursts[i];
      burst.life -= dt;
      if (burst.life <= 0) {
        burst.handle.set({ opacity: 0, progress: 0, intensity: 1 });
        burst.handle.shader.setVisible(false).setPosition(0, 0);
        this.elementBurstFree.push(burst.handle);
        this.elementBursts[i] = this.elementBursts[this.elementBursts.length - 1];
        this.elementBursts.pop();
        continue;
      }
      if (burst.followPlayer) burst.handle.shader.setPosition(this.scene.player.x, this.scene.player.y);
      burst.handle.set({ progress: 1 - burst.life / burst.maxLife });
    }
    for (let i = this.combatBursts.length - 1; i >= 0; i--) {
      const burst = this.combatBursts[i];
      burst.life -= dt;
      if (burst.life <= 0) {
        burst.handle.set({ opacity: 0, progress: 0, intensity: 1 });
        burst.handle.shader.setVisible(false).setPosition(0, 0);
        this.combatShaderFree.push(burst.handle);
        this.combatBursts[i] = this.combatBursts[this.combatBursts.length - 1];
        this.combatBursts.pop();
        continue;
      }
      if (burst.followPlayer) burst.handle.shader.setPosition(this.scene.player.x, this.scene.player.y);
      burst.handle.set({ progress: 1 - burst.life / burst.maxLife });
    }
    // 伤害数字上浮淡出
    for (const slot of this.texts) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      slot.txt.y -= 46 * dt;
      slot.txt.setAlpha(Math.min(1, slot.life / 0.2));
      if (slot.life <= 0) slot.txt.setVisible(false);
    }

    // 粒子
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        pt.spr.setActive(false).setVisible(false);
        if (pt.kind) this.kindCounts[pt.kind] = Math.max(0, (this.kindCounts[pt.kind] || 1) - 1);
        pt.kind = '';
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
        this.freeParticles.push(pt);
        continue;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.rotation += pt.spin * dt;
      const k = 1 - pt.life / pt.maxLife;
      pt.spr.setPosition(pt.x, pt.y).setRotation(pt.rotation)
        .setAlpha(pt.startAlpha + (pt.endAlpha - pt.startAlpha) * k)
        .setScale(pt.startScale + (pt.endScale - pt.startScale) * k);
    }
  }

  preparePoisonShaders() {
    for (let i = 0; i < PERF.maxPoisonShaders; i++) {
      const handle = this.createShader(VFX_SHADER_KEYS.poisonPool, {
        x: 0, y: 0, width: 384, height: 320, depth: 1.14,
        uniforms: {
          progress: 0, intensity: 1, direction: [1, 0],
          colorA: POISON_STYLE.poison.colorA, colorB: POISON_STYLE.poison.colorB, opacity: 0,
        },
      });
      if (!handle) break;
      handle.shader.setVisible(false);
      this.poisonShaderSlots.push(handle);
      this.poisonShaderFree.push(handle);
    }
  }

  prepareElementShaders() {
    const qualityScale = this.runtime.quality.key === 'low' ? 0.5 : 1;
    const fieldCount = Math.max(1, Math.floor(PERF.maxElementFieldShaders * qualityScale));
    const burstCount = Math.max(1, Math.floor(PERF.maxElementBurstShaders * qualityScale));
    for (let i = 0; i < fieldCount; i++) {
      const handle = this.createShader(VFX_SHADER_KEYS.elementField, {
        x: 0, y: 0, width: 320, height: 288, depth: ELEMENT_STYLE.fireground.depth,
        uniforms: {
          progress: 0, intensity: 1, direction: [1, 0], variant: ELEMENT_STYLE.fireground.variant,
          colorA: ELEMENT_STYLE.fireground.colorA, colorB: ELEMENT_STYLE.fireground.colorB, opacity: 0,
        },
      });
      if (!handle) break;
      handle.shader.setVisible(false);
      this.elementFieldSlots.push(handle);
      this.elementFieldFree.push(handle);
    }
    for (let i = 0; i < burstCount; i++) {
      const handle = this.createShader(VFX_SHADER_KEYS.elementField, {
        x: 0, y: 0, width: 512, height: 512, depth: 3.5,
        uniforms: {
          progress: 0, intensity: 1, direction: [1, 0], variant: 1,
          colorA: ELEMENT_STYLE.blizzard.colorA, colorB: ELEMENT_STYLE.blizzard.colorB, opacity: 0,
        },
      });
      if (!handle) break;
      handle.shader.setVisible(false);
      this.elementBurstSlots.push(handle);
      this.elementBurstFree.push(handle);
    }
  }

  elementField(x, y, radius, style = 'fireground') {
    const palette = ELEMENT_STYLE[style] || ELEMENT_STYLE.fireground;
    const handle = this.elementFieldFree.pop();
    if (!handle) return null;
    const angle = Math.random() * Math.PI * 2;
    handle.shader.setPosition(x, y).setDepth(palette.depth)
      .setDisplaySize(radius * 2.12, radius * 2.12 * palette.aspect).setVisible(true);
    handle.set({
      progress: 0, intensity: 1, variant: palette.variant,
      direction: [Math.cos(angle), Math.sin(angle)],
      colorA: palette.colorA, colorB: palette.colorB, opacity: palette.opacity,
    });
    let active = true;
    return {
      shader: handle.shader,
      set: handle.set,
      destroy: () => {
        if (!active) return;
        active = false;
        handle.set({ opacity: 0, progress: 0, intensity: 1 });
        handle.shader.setVisible(false).setPosition(0, 0);
        this.elementFieldFree.push(handle);
      },
    };
  }

  spawnElementBurst(style, x, y, radius, options = {}) {
    const palette = ELEMENT_STYLE[style];
    const handle = this.elementBurstFree.pop();
    if (!palette || !handle) return false;
    const angle = Math.random() * Math.PI * 2;
    const life = options.life || palette.life;
    handle.shader.setPosition(x, y).setDepth(palette.depth)
      .setDisplaySize(radius * 2.12, radius * 2.12 * palette.aspect).setVisible(true);
    handle.set({
      progress: 0, intensity: options.intensity || 1, variant: palette.variant,
      direction: [Math.cos(angle), Math.sin(angle)],
      colorA: palette.colorA, colorB: palette.colorB, opacity: palette.opacity,
    });
    this.elementBursts.push({ handle, life, maxLife: life, followPlayer: !!options.followPlayer });
    return true;
  }

  prepareCombatShaders() {
    const qualityScale = this.runtime.quality.key === 'low' ? 0.5 : 1;
    const count = Math.max(1, Math.floor(PERF.maxCombatPolishShaders * qualityScale));
    for (let i = 0; i < count; i++) {
      const handle = this.createShader(VFX_SHADER_KEYS.combatPolish, {
        x: 0, y: 0, width: 448, height: 448, depth: 2,
        uniforms: {
          progress: 0, intensity: 1, direction: [1, 0], variant: 0,
          colorA: COMBAT_STYLE.holyhalo.colorA, colorB: COMBAT_STYLE.holyhalo.colorB, opacity: 0,
        },
      });
      if (!handle) break;
      handle.shader.setVisible(false);
      this.combatShaderSlots.push(handle);
      this.combatShaderFree.push(handle);
    }
  }

  spawnCombatBurst(style, x, y, radius, options = {}) {
    const palette = COMBAT_STYLE[style];
    const handle = this.combatShaderFree.pop();
    if (!palette || !handle) return false;
    const life = options.life || palette.life;
    handle.shader.setPosition(x, y).setDepth(palette.depth)
      .setDisplaySize(radius * 2.16, radius * 2.16).setVisible(true);
    handle.set({
      progress: 0, intensity: options.intensity || 1, variant: palette.variant,
      direction: [1, 0], colorA: palette.colorA, colorB: palette.colorB, opacity: palette.opacity,
    });
    this.combatBursts.push({ handle, life, maxLife: life, followPlayer: !!options.followPlayer });
    return true;
  }

  poisonPool(x, y, radius, style = 'poison') {
    const palette = POISON_STYLE[style] || POISON_STYLE.poison;
    const handle = this.poisonShaderFree.pop();
    if (!handle) return null;
    const angle = Math.random() * Math.PI * 2;
    handle.shader.setPosition(x, y).setDisplaySize(radius * 2.16, radius * 1.84).setVisible(true);
    handle.set({
      progress: 0,
      intensity: 1,
      direction: [Math.cos(angle), Math.sin(angle)],
      colorA: palette.colorA,
      colorB: palette.colorB,
      opacity: palette.opacity,
    });
    let active = true;
    return {
      shader: handle.shader,
      set: handle.set,
      destroy: () => {
        if (!active) return;
        active = false;
        handle.set({ opacity: 0, progress: 0, intensity: 1 });
        handle.shader.setVisible(false).setPosition(0, 0);
        this.poisonShaderFree.push(handle);
      },
    };
  }

  createShader(fragmentKey, options) { return this.runtime.createShader(fragmentKey, options); }

  emitNative(channel, x, y, count = 1) {
    return this.runtime.emitAt(channel, x, y, count, this.particles.length);
  }

  diagnostics() {
    return { ...this.runtime.diagnostics(), beams: this.beams?.activeCount() || 0 };
  }

  destroy() {
    this.poisonShaderFree.length = 0;
    this.poisonShaderSlots.length = 0;
    this.elementBursts.length = 0;
    this.elementFieldFree.length = 0;
    this.elementFieldSlots.length = 0;
    this.elementBurstFree.length = 0;
    this.elementBurstSlots.length = 0;
    this.combatBursts.length = 0;
    this.combatShaderFree.length = 0;
    this.combatShaderSlots.length = 0;
    this.beams?.destroy();
    this.beams = null;
    this.runtime.destroy();
  }
}

// 连杀跟踪器：击杀间隔 < window 连击累积；跨过阈值弹字（GDD §4.3 / §7）
export class ComboTracker {
  constructor() {
    this.count = 0;
    this.timer = 0;
    this.lastPopup = 0;
  }

  onKill() {
    this.count++;
    this.timer = COMBO.windowSec;
    if (this.count > 0 && this.count % COMBO.popupEvery === 0 && this.count !== this.lastPopup) {
      this.lastPopup = this.count;
      return this.count; // 需要弹字
    }
    return 0;
  }

  update(dt) {
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.count = 0;
        this.lastPopup = 0;
      }
    }
  }
}
