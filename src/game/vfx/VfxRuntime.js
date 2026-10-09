import Phaser from 'phaser';
import { assetPath } from '../../assetPath.js';

export const VFX_SHADER_KEYS = Object.freeze({
  foundation: 'vfx-foundation',
  poisonPool: 'vfx-poison-pool',
  electricBeam: 'vfx-electric-beam',
  elementField: 'vfx-element-field',
  combatPolish: 'vfx-combat-polish',
});

export const VFX_SHADER_ASSETS = Object.freeze({
  [VFX_SHADER_KEYS.foundation]: 'assets/shaders/vfx-foundation.frag',
  [VFX_SHADER_KEYS.poisonPool]: 'assets/shaders/vfx-poison-pool.frag',
  [VFX_SHADER_KEYS.electricBeam]: 'assets/shaders/vfx-electric-beam.frag',
  [VFX_SHADER_KEYS.elementField]: 'assets/shaders/vfx-element-field.frag',
  [VFX_SHADER_KEYS.combatPolish]: 'assets/shaders/vfx-combat-polish.frag',
});

const QUALITY_PROFILES = Object.freeze({
  high: Object.freeze({
    key: 'high', shaderScale: 1, renderScale: 1, particleScale: 1,
    filters: true, distortion: true,
  }),
  low: Object.freeze({
    key: 'low', shaderScale: 0.75, renderScale: 0.5, particleScale: 0.6,
    filters: false, distortion: false,
  }),
  fallback: Object.freeze({
    key: 'fallback', shaderScale: 0, renderScale: 0.5, particleScale: 0.45,
    filters: false, distortion: false,
  }),
});

const EMITTER_LANES = Object.freeze({
  trails: Object.freeze({
    budget: 48, depth: 3.4, blendMode: Phaser.BlendModes.ADD,
    config: {
      lifespan: { min: 120, max: 280 }, speed: { min: 18, max: 85 }, angle: { min: 0, max: 360 },
      scale: { start: 0.65, end: 0 }, alpha: { start: 0.85, end: 0 },
    },
  }),
  impacts: Object.freeze({
    budget: 72, depth: 3.9, blendMode: Phaser.BlendModes.ADD,
    config: {
      lifespan: { min: 140, max: 360 }, speed: { min: 85, max: 260 }, angle: { min: 0, max: 360 },
      scale: { start: 0.9, end: 0.08 }, alpha: { start: 1, end: 0 },
    },
  }),
  electricImpact: Object.freeze({
    texture: 'electric_spark', budget: 64, depth: 4.08, blendMode: Phaser.BlendModes.ADD,
    config: {
      lifespan: { min: 110, max: 260 }, speed: { min: 105, max: 310 }, angle: { min: 0, max: 360 },
      rotate: { min: -180, max: 180 }, tint: [0x806bff, 0xb8a7ff, 0xe8e3ff, 0xffffff],
      scale: { start: 0.92, end: 0.06 }, alpha: { start: 1, end: 0 },
    },
  }),
  prismImpact: Object.freeze({
    texture: 'electric_spark', budget: 48, depth: 4.08, blendMode: Phaser.BlendModes.ADD,
    config: {
      lifespan: { min: 130, max: 290 }, speed: { min: 90, max: 260 }, angle: { min: 0, max: 360 },
      rotate: { min: -150, max: 150 }, tint: [0xffd86a, 0xfff4c2, 0xffffff, 0x9ee8ff],
      scale: { start: 0.88, end: 0.05 }, alpha: { start: 1, end: 0 },
    },
  }),
  ambient: Object.freeze({
    budget: 36, depth: 1.75, blendMode: Phaser.BlendModes.NORMAL,
    config: {
      lifespan: { min: 450, max: 900 }, speedX: { min: -18, max: 18 }, speedY: { min: -34, max: -8 },
      scale: { start: 0.5, end: 1.05 }, alpha: { start: 0.42, end: 0 },
    },
  }),
  debris: Object.freeze({
    budget: 24, depth: 4, blendMode: Phaser.BlendModes.NORMAL,
    config: {
      lifespan: { min: 240, max: 520 }, speed: { min: 70, max: 190 }, angle: { min: 0, max: 360 },
      gravityY: 180, rotate: { min: -180, max: 180 },
      scale: { start: 0.75, end: 0.22 }, alpha: { start: 1, end: 0 },
    },
  }),
  poisonTrail: Object.freeze({
    texture: 'poison_drop', budget: 24, depth: 3.34, blendMode: Phaser.BlendModes.NORMAL,
    config: {
      lifespan: { min: 180, max: 320 }, speedX: { min: -18, max: 18 }, speedY: { min: 18, max: 42 },
      gravityY: 55, rotate: { min: -45, max: 45 }, tint: 0x78e05c,
      scale: { start: 0.72, end: 0.1 }, alpha: { start: 0.82, end: 0 },
    },
  }),
  plagueTrail: Object.freeze({
    texture: 'poison_drop', budget: 24, depth: 3.34, blendMode: Phaser.BlendModes.NORMAL,
    config: {
      lifespan: { min: 180, max: 320 }, speedX: { min: -18, max: 18 }, speedY: { min: 18, max: 42 },
      gravityY: 55, rotate: { min: -45, max: 45 }, tint: 0x9a6db1,
      scale: { start: 0.72, end: 0.1 }, alpha: { start: 0.82, end: 0 },
    },
  }),
  corrosionTrail: Object.freeze({
    texture: 'poison_drop', budget: 24, depth: 3.34, blendMode: Phaser.BlendModes.ADD,
    config: {
      lifespan: { min: 180, max: 320 }, speedX: { min: -18, max: 18 }, speedY: { min: 18, max: 42 },
      gravityY: 55, rotate: { min: -45, max: 45 }, tint: 0xdfff62,
      scale: { start: 0.72, end: 0.1 }, alpha: { start: 0.86, end: 0 },
    },
  }),
  poisonImpact: Object.freeze({
    texture: 'poison_drop', budget: 36, depth: 3.02, blendMode: Phaser.BlendModes.NORMAL,
    config: {
      lifespan: { min: 260, max: 440 }, speed: { min: 78, max: 185 }, angle: { min: 0, max: 360 },
      gravityY: 170, rotate: { min: -180, max: 180 }, tint: [0x246f38, 0x78e05c, 0xcaff8b],
      scale: { start: 0.78, end: 0.16 }, alpha: { start: 0.9, end: 0 },
    },
  }),
  plagueImpact: Object.freeze({
    texture: 'poison_drop', budget: 36, depth: 3.02, blendMode: Phaser.BlendModes.NORMAL,
    config: {
      lifespan: { min: 260, max: 440 }, speed: { min: 78, max: 185 }, angle: { min: 0, max: 360 },
      gravityY: 170, rotate: { min: -180, max: 180 }, tint: [0x30452a, 0x8d65a6, 0xa6d35f],
      scale: { start: 0.78, end: 0.16 }, alpha: { start: 0.9, end: 0 },
    },
  }),
  corrosionImpact: Object.freeze({
    texture: 'poison_drop', budget: 36, depth: 3.02, blendMode: Phaser.BlendModes.ADD,
    config: {
      lifespan: { min: 260, max: 440 }, speed: { min: 78, max: 185 }, angle: { min: 0, max: 360 },
      gravityY: 170, rotate: { min: -180, max: 180 }, tint: [0x6f861c, 0xb7da3d, 0xdfff62],
      scale: { start: 0.78, end: 0.16 }, alpha: { start: 0.92, end: 0 },
    },
  }),
  poisonGlass: Object.freeze({
    texture: 'glass_shard', budget: 28, depth: 3.12, blendMode: Phaser.BlendModes.ADD,
    config: {
      lifespan: { min: 460, max: 760 }, speed: { min: 105, max: 225 }, angle: { min: 0, max: 360 },
      gravityY: 230, rotate: { min: -280, max: 280 }, tint: [0xd8f4e0, 0xffffff, 0x9bd6aa],
      scale: { start: 1.3, end: 0.28 }, alpha: { start: 1, end: 0 },
    },
  }),
  poisonBubbles: Object.freeze({
    texture: 'poison_bubble', budget: 24, depth: 1.76, blendMode: Phaser.BlendModes.NORMAL,
    config: {
      lifespan: { min: 430, max: 720 }, speedX: { min: -9, max: 9 }, speedY: { min: -28, max: -13 },
      tint: 0x89ee69, scale: { start: 0.82, end: 0.16 }, alpha: { start: 0.76, end: 0 },
    },
  }),
  plagueBubbles: Object.freeze({
    texture: 'poison_bubble', budget: 24, depth: 1.76, blendMode: Phaser.BlendModes.NORMAL,
    config: {
      lifespan: { min: 430, max: 720 }, speedX: { min: -9, max: 9 }, speedY: { min: -28, max: -13 },
      tint: 0x9d77b3, scale: { start: 0.82, end: 0.16 }, alpha: { start: 0.76, end: 0 },
    },
  }),
  corrosionBubbles: Object.freeze({
    texture: 'poison_bubble', budget: 24, depth: 1.76, blendMode: Phaser.BlendModes.ADD,
    config: {
      lifespan: { min: 430, max: 720 }, speedX: { min: -9, max: 9 }, speedY: { min: -28, max: -13 },
      tint: 0xdfff62, scale: { start: 0.82, end: 0.16 }, alpha: { start: 0.78, end: 0 },
    },
  }),
  poisonMist: Object.freeze({
    texture: 'poison_mist', budget: 24, depth: 1.72, blendMode: Phaser.BlendModes.NORMAL,
    config: {
      lifespan: { min: 620, max: 980 }, speedX: { min: -16, max: 16 }, speedY: { min: -16, max: -7 },
      tint: 0x3c9f4e, scale: { start: 0.82, end: 1.35 },
      alpha: { start: 0.34, end: 0 },
    },
  }),
  plagueMist: Object.freeze({
    texture: 'poison_mist', budget: 24, depth: 1.72, blendMode: Phaser.BlendModes.NORMAL,
    config: {
      lifespan: { min: 620, max: 980 }, speedX: { min: -16, max: 16 }, speedY: { min: -16, max: -7 },
      tint: 0x78558f, scale: { start: 0.82, end: 1.35 }, alpha: { start: 0.32, end: 0 },
    },
  }),
  corrosionMist: Object.freeze({
    texture: 'poison_mist', budget: 24, depth: 1.72, blendMode: Phaser.BlendModes.ADD,
    config: {
      lifespan: { min: 620, max: 980 }, speedX: { min: -16, max: 16 }, speedY: { min: -16, max: -7 },
      tint: 0xb7da3d, scale: { start: 0.82, end: 1.35 }, alpha: { start: 0.3, end: 0 },
    },
  }),
  fireEmbers: Object.freeze({
    texture: 'spark', budget: 48, depth: 3.46, blendMode: Phaser.BlendModes.ADD,
    config: {
      lifespan: { min: 180, max: 360 }, speedX: { min: -24, max: 24 }, speedY: { min: -76, max: -24 },
      tint: [0xff6a17, 0xffb52d, 0xffe06a], scale: { start: 0.46, end: 0.05 },
      alpha: { start: 0.88, end: 0 },
    },
  }),
  snow: Object.freeze({
    texture: 'snowflake', budget: 30, depth: 1.9, blendMode: Phaser.BlendModes.ADD,
    config: {
      lifespan: { min: 380, max: 660 }, speedX: { min: -95, max: -42 }, speedY: { min: 24, max: 64 },
      rotate: { min: -150, max: 150 }, tint: [0xb9efff, 0xe8fbff, 0xffffff],
      scale: { start: 0.56, end: 0.1 }, alpha: { start: 0.62, end: 0 },
    },
  }),
  iceShards: Object.freeze({
    texture: 'ice_shard', budget: 72, depth: 3.72, blendMode: Phaser.BlendModes.ADD,
    config: {
      lifespan: { min: 220, max: 430 }, speed: { min: 95, max: 260 }, angle: { min: 0, max: 360 },
      rotate: { min: -260, max: 260 }, tint: [0x72d8ff, 0xb9efff, 0xffffff],
      scale: { start: 0.92, end: 0.12 }, alpha: { start: 1, end: 0 },
    },
  }),
  holyMotes: Object.freeze({
    texture: 'holy_star', budget: 40, depth: 3.48, blendMode: Phaser.BlendModes.ADD,
    config: {
      lifespan: { min: 180, max: 360 }, speed: { min: 20, max: 92 }, angle: { min: 0, max: 360 },
      rotate: { min: -120, max: 120 }, tint: [0xffd45a, 0xffef91, 0xffffff],
      scale: { start: 0.46, end: 0.06 }, alpha: { start: 0.9, end: 0 },
    },
  }),
  bladeImpact: Object.freeze({
    texture: 'blade_slash', budget: 52, depth: 3.86, blendMode: Phaser.BlendModes.ADD,
    config: {
      lifespan: { min: 130, max: 260 }, speed: { min: 12, max: 48 }, angle: { min: 0, max: 360 },
      rotate: { min: -35, max: 35 }, tint: [0x9ddcff, 0xd8ecff, 0xffffff],
      scale: { start: 0.62, end: 0.18 }, alpha: { start: 0.96, end: 0 },
    },
  }),
  executeSlash: Object.freeze({
    texture: 'blade_slash', budget: 24, depth: 4.12, blendMode: Phaser.BlendModes.ADD,
    config: {
      lifespan: { min: 210, max: 340 }, speed: { min: 18, max: 64 }, angle: { min: 0, max: 360 },
      rotate: { min: -70, max: 70 }, tint: [0xffd36d, 0xffefb0, 0xffffff],
      scale: { start: 0.9, end: 0.24 }, alpha: { start: 1, end: 0 },
    },
  }),
});

function searchParams() {
  if (!import.meta.env.DEV) return new URLSearchParams();
  try {
    return new URLSearchParams(window.location.search);
  } catch {
    return new URLSearchParams();
  }
}

export function preloadVfxAssets(scene) {
  for (const [key, url] of Object.entries(VFX_SHADER_ASSETS)) {
    if (!scene.cache.shader.exists(key)) scene.load.glsl(key, assetPath(url));
  }
}

export function detectVfxCapabilities(scene) {
  const renderer = scene.sys.renderer;
  const webgl = renderer?.type === Phaser.WEBGL;
  let maxTextureSize = 2048;
  try {
    if (webgl && renderer.gl) maxTextureSize = renderer.gl.getParameter(renderer.gl.MAX_TEXTURE_SIZE) || maxTextureSize;
  } catch {
    // Capability probing must never prevent the game from starting.
  }
  return Object.freeze({
    renderer: webgl ? 'webgl' : 'canvas',
    webgl,
    shader: webgl && typeof scene.add.shader === 'function',
    filters: webgl,
    rope: webgl && typeof scene.add.rope === 'function',
    mesh: webgl && typeof scene.add.mesh2d === 'function',
    renderTexture: typeof scene.add.renderTexture === 'function',
    particles: typeof scene.add.particles === 'function',
    maxTextureSize,
  });
}

export function resolveVfxQuality(capabilities, params = searchParams()) {
  const requested = params.get('vfx');
  if (!capabilities.webgl || requested === 'fallback' || requested === 'off') return QUALITY_PROFILES.fallback;
  if (requested === 'high') return QUALITY_PROFILES.high;
  if (requested === 'low') return QUALITY_PROFILES.low;

  const memory = Number(globalThis.navigator?.deviceMemory) || 0;
  const cores = Number(globalThis.navigator?.hardwareConcurrency) || 0;
  return (memory > 0 && memory <= 2) || (cores > 0 && cores <= 2)
    ? QUALITY_PROFILES.low
    : QUALITY_PROFILES.high;
}

export function createVfxUniformState(overrides = {}) {
  return {
    time: 0,
    progress: 0,
    intensity: 1,
    resolution: [128, 128],
    direction: [1, 0],
    colorA: [1, 1, 1, 1],
    colorB: [1, 1, 1, 1],
    opacity: 1,
    variant: 0,
    ...overrides,
  };
}

export function createVfxShaderConfig(fragmentKey, state) {
  return {
    name: fragmentKey,
    fragmentKey,
    setupUniforms: (setUniform) => {
      setUniform('uTime', state.time);
      setUniform('uProgress', state.progress);
      setUniform('uIntensity', state.intensity);
      setUniform('uResolution', state.resolution);
      setUniform('uDirection', state.direction);
      setUniform('uColorA', state.colorA);
      setUniform('uColorB', state.colorB);
      setUniform('uOpacity', state.opacity);
      setUniform('uVariant', state.variant);
      setUniform('uNoise', 0);
    },
  };
}

export function warmupVfxShaders(scene) {
  const capabilities = detectVfxCapabilities(scene);
  const quality = resolveVfxQuality(capabilities);
  if (!capabilities.shader || quality.shaderScale <= 0
    || !scene.textures.exists('vfx_noise')) return null;

  const warmed = [];
  for (const fragmentKey of Object.values(VFX_SHADER_KEYS)) {
    if (!scene.cache.shader.exists(fragmentKey)) continue;
    const state = createVfxUniformState({ opacity: 0, resolution: [2, 2] });
    try {
      const shader = scene.add.shader(
        createVfxShaderConfig(fragmentKey, state),
        1, 1, 2, 2, ['vfx_noise'],
      ).setScrollFactor(0).setDepth(-10000);
      warmed.push(shader);
    } catch (error) {
      console.warn(`[VFX] Shader warmup failed for "${fragmentKey}"; Sprite fallback remains active.`, error);
    }
  }
  const dispose = () => warmed.splice(0).forEach(shader => shader.scene && shader.destroy());
  scene.game.events.once('postrender', dispose);
  scene.events.once('shutdown', dispose);
  return warmed;
}

class VfxEmitterBank {
  constructor(scene, quality, activeBudget) {
    this.scene = scene;
    this.activeBudget = activeBudget;
    this.emitters = new Map();
    if (quality.key === 'fallback') return;

    for (const [key, lane] of Object.entries(EMITTER_LANES)) {
      const capacity = Math.max(1, Math.floor(lane.budget * quality.particleScale));
      const emitter = scene.add.particles(0, 0, lane.texture || 'spark', {
        ...lane.config,
        name: `vfx-${key}`,
        emitting: false,
        frequency: -1,
        maxParticles: capacity,
        maxAliveParticles: capacity,
      });
      emitter.setDepth(lane.depth).setBlendMode(lane.blendMode);
      this.emitters.set(key, emitter);
    }
  }

  aliveCount() {
    let count = 0;
    for (const emitter of this.emitters.values()) count += emitter.getAliveParticleCount();
    return count;
  }

  emitAt(channel, x, y, count = 1, legacyActive = 0) {
    const emitter = this.emitters.get(channel);
    if (!emitter) return 0;
    const available = Math.max(0, this.activeBudget - legacyActive - this.aliveCount());
    const quantity = Math.min(Math.max(0, Math.floor(count)), available);
    if (quantity <= 0) return 0;
    const before = emitter.getAliveParticleCount();
    emitter.emitParticleAt(x, y, quantity);
    return emitter.getAliveParticleCount() - before;
  }

  destroy() {
    for (const emitter of this.emitters.values()) emitter.destroy();
    this.emitters.clear();
  }
}

export class VfxRuntime {
  constructor(scene, { particleBudget = 180 } = {}) {
    this.scene = scene;
    this.capabilities = detectVfxCapabilities(scene);
    this.quality = resolveVfxQuality(this.capabilities);
    this.clock = 0;
    this.shaderHandles = new Set();
    this.emitters = this.capabilities.particles
      ? new VfxEmitterBank(scene, this.quality, particleBudget)
      : null;
  }

  update(dt) {
    this.clock += dt;
    for (const handle of this.shaderHandles) handle.state.time = this.clock;
  }

  createShader(fragmentKey, options = {}) {
    if (!this.capabilities.shader || this.quality.shaderScale <= 0
      || !this.scene.cache.shader.exists(fragmentKey)) return null;

    const displayWidth = Math.max(1, options.width || 128);
    const displayHeight = Math.max(1, options.height || 128);
    const shaderScale = options.fixedResolution ? 1 : this.quality.shaderScale;
    const width = Math.max(1, Math.round(displayWidth * shaderScale));
    const height = Math.max(1, Math.round(displayHeight * shaderScale));
    const state = createVfxUniformState({
      resolution: [width, height],
      ...(options.uniforms || {}),
    });
    try {
      const shader = this.scene.add.shader(
        createVfxShaderConfig(fragmentKey, state),
        options.x || 0, options.y || 0, width, height,
        options.textures || ['vfx_noise'],
      );
      if (width !== displayWidth || height !== displayHeight) shader.setDisplaySize(displayWidth, displayHeight);
      shader.setDepth(options.depth ?? 3);
      if (options.blendMode !== undefined) shader.setBlendMode(options.blendMode);
      const handle = {
        shader,
        state,
        set: (values) => Object.assign(state, values),
        destroy: () => {
          this.shaderHandles.delete(handle);
          if (shader.scene) shader.destroy();
        },
      };
      this.shaderHandles.add(handle);
      return handle;
    } catch (error) {
      console.warn(`[VFX] Shader "${fragmentKey}" failed; using fallback.`, error);
      return null;
    }
  }

  emitAt(channel, x, y, count = 1, legacyActive = 0) {
    return this.emitters?.emitAt(channel, x, y, count, legacyActive) || 0;
  }

  diagnostics() {
    return {
      renderer: this.capabilities.renderer,
      quality: this.quality.key,
      shaders: [...this.shaderHandles].filter(handle => handle.shader.visible).length,
      nativeParticles: this.emitters?.aliveCount() || 0,
      maxTextureSize: this.capabilities.maxTextureSize,
    };
  }

  destroy() {
    for (const handle of [...this.shaderHandles]) handle.destroy();
    this.emitters?.destroy();
    this.emitters = null;
  }
}
