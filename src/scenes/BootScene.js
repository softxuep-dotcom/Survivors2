// 启动：加载当前可刷出的敌人图集，确保进入 Game 前动画已经可用。
import Phaser from 'phaser';
import { assetPath } from '../assetPath.js';
import { generateTextures, createEnemyAnimations, enemyAtlasKey, enemyAtlasImage, enemyAtlasJson } from '../textures.js';
import { loadSave, touchSave } from '../save.js';
import { registerPreloadedSfxAsset, setMuted, sfxAssetEntries } from '../audio.js';
import { Platform } from '../platform.js';
import { ACTIVE_SKILL_KEYS, STRESS_QUERY } from '../config.js';
import { preloadVfxAssets, warmupVfxShaders } from '../game/vfx/VfxRuntime.js';

const BOOT_ENEMIES = ['slime', 'mini', 'runner', 'tank', 'flyer', 'splitter', 'boss', 'boss2'];
const SKILL_ICON_FRAMES = [
  'icon_blade', 'icon_fireball', 'icon_frostpulse', 'icon_chainlightning',
  'icon_venomflask', 'icon_holyorb', 'icon_boots', 'icon_magnet',
  'icon_gears', 'icon_battle_emblem', 'icon_core', 'icon_rune',
  'icon_heal', 'ui_upgrade_arrow', 'ui_reroll', 'ui_enhance_badge',
];
// 12 个主动技能各自独立的图标（tools/build-skill-icons.mjs 按 ACTIVE_SKILL_KEYS 顺序生成 4×3 图集）
const ACTIVE_SKILL_ICON_FRAMES = ACTIVE_SKILL_KEYS.map(key => `icon_skill_${key}`);
const PLAYER_WALK_ANIMATIONS = [
  {
    texture: 'player_knight_walk', animation: 'player_knight_walk_right',
    file: 'assets/players/player-knight-smooth-v3.webp', frames: 10, frameSize: 160, frameRate: 12,
  },
  {
    texture: 'player_witch_walk', animation: 'player_witch_walk_right',
    file: 'assets/players/player-witch-smooth-v2.webp', frames: 8, frameSize: 112, frameRate: 12,
  },
];

function installSkillIconTextures(scene, atlasKey = 'skill_icon_atlas', frames = SKILL_ICON_FRAMES) {
  const source = scene.textures.get(atlasKey).getSourceImage();
  if (!source) return;
  const frameSize = source.width / 4;
  for (let index = 0; index < frames.length; index++) {
    const key = frames[index];
    if (scene.textures.exists(key)) continue;
    const texture = scene.textures.createCanvas(key, 256, 256);
    const context = texture.getContext();
    context.drawImage(
      source,
      (index % 4) * frameSize,
      Math.floor(index / 4) * frameSize,
      frameSize,
      frameSize,
      0,
      0,
      256,
      256,
    );
    texture.refresh();
  }
}

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    this.failedAssets = [];
    this.load.on('loaderror', file => {
      const detail = `${file.key}: ${file.url}`;
      this.failedAssets.push(detail);
      console.error('[boot] Asset load failed:', detail);
    });
    this.load.on('progress', (value) => window.setLoadingProgress?.(value));
    for (const asset of sfxAssetEntries()) this.load.binary(asset.cacheKey, asset.url);
    preloadVfxAssets(this);
    this.load.image('snowflake', 'assets/vfx/snowflake.png');
    this.load.image('ice_shard', 'assets/vfx/ice-shard.png');
    this.load.image('holy_star', 'assets/vfx/holy-star.png');
    this.load.image('blade_slash', 'assets/vfx/blade-slash.png');
    this.load.image('blade', 'assets/weapons/flying-blade-v2.png');
    this.load.image('chest_jackpot', assetPath('assets/ui/chest-jackpot.webp'));
    this.load.image('prop_crate_art', assetPath('assets/props/prop-crate.webp'));
    this.load.image('prop_brazier_art', assetPath('assets/props/prop-brazier.webp'));
    this.load.image('prop_gravestone_art', assetPath('assets/props/prop-gravestone.webp'));
    this.load.image('pickup_heal_art', assetPath('assets/props/pickup-heal.webp'));
    this.load.image('pickup_magnet_art', assetPath('assets/props/pickup-magnet.webp'));
    this.load.image('skill_icon_atlas', assetPath('assets/ui/skill-icons-atlas-v2.webp'));
    this.load.image('skill_icon_active_atlas', assetPath('assets/ui/skill-icons-active-v1.webp'));
    for (const key of BOOT_ENEMIES) {
      this.load.atlas(enemyAtlasKey(key), enemyAtlasImage(key), enemyAtlasJson(key));
    }
    for (const def of PLAYER_WALK_ANIMATIONS) {
      this.load.spritesheet(def.texture, assetPath(def.file), {
        frameWidth: def.frameSize,
        frameHeight: def.frameSize,
      });
    }
  }

  create() {
    const missing = PLAYER_WALK_ANIMATIONS.filter(def => !this.textures.exists(def.texture)
      || Array.from({ length: def.frames }, (_, i) => i).some(i => !this.textures.get(def.texture).has(i)));
    if (this.failedAssets.length || missing.length) {
      console.error('[boot] Startup stopped: incomplete assets', this.failedAssets, missing.map(def => def.texture));
      const { width, height } = this.scale;
      this.add.text(width / 2, height / 2, '资源加载失败\n请重新编译小游戏后重试\n\n点击此处重新加载', {
        fontFamily: 'sans-serif', fontSize: '24px', color: '#ffffff', align: 'center',
        wordWrap: { width: width - 48 },
      }).setOrigin(0.5).setInteractive().once('pointerup', () => this.scene.restart());
      window.finishLoading?.();
      return;
    }
    installSkillIconTextures(this);
    installSkillIconTextures(this, 'skill_icon_active_atlas', ACTIVE_SKILL_ICON_FRAMES);
    for (const asset of sfxAssetEntries()) {
      registerPreloadedSfxAsset(asset.key, this.cache.binary.get(asset.cacheKey));
      this.cache.binary.remove(asset.cacheKey);
    }
    generateTextures(this);
    warmupVfxShaders(this);
    createEnemyAnimations(this);
    for (const def of PLAYER_WALK_ANIMATIONS) {
      if (this.anims.exists(def.animation)) continue;
      this.anims.create({
        key: def.animation,
        frames: this.anims.generateFrameNumbers(def.texture, { start: 0, end: def.frames - 1 }),
        frameRate: def.frameRate,
        duration: def.duration,
        repeat: -1,
      });
    }
    const save = loadSave();
    // M3 浏览器验收入口：仅开发环境可注入钻石，生产构建会整段剔除。
    if (import.meta.env.DEV) {
      const devDiamonds = Math.max(0, Number(new URLSearchParams(window.location.search).get('diamonds')) || 0);
      if (devDiamonds > save.diamonds) touchSave(save, { diamonds: devDiamonds });
    }
    setMuted(save.muted);
    this.registry.set('save', save);
    Platform.loadingStop();
    // 开发构建可直达压测/VFX Lab；生产包始终从正式菜单进入。
    const params = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null;
    const stress = !!params && params.has(STRESS_QUERY);
    const vfxLab = !!params && params.has('vfxlab');
    const captureVideo = !!params && params.has('captureVideo');
    this.scene.start(vfxLab ? 'VfxLab' : stress || captureVideo ? 'Game' : 'Menu');
    window.finishLoading?.();
  }
}
