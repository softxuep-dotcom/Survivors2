// 启动：加载当前可刷出的敌人图集，确保进入 Game 前动画已经可用。
import Phaser from 'phaser';
import { generateTextures, createEnemyAnimations, enemyAtlasKey, enemyAtlasImage, enemyAtlasJson } from '../textures.js';
import { loadSave, touchSave } from '../save.js';
import { registerPreloadedSfxAsset, setMuted, sfxAssetEntries } from '../audio.js';
import { Poki } from '../poki.js';
import { STRESS_QUERY } from '../config.js';
import { preloadVfxAssets, warmupVfxShaders } from '../game/vfx/VfxRuntime.js';

const BOOT_ENEMIES = ['slime', 'mini', 'runner', 'tank', 'flyer', 'splitter', 'boss', 'boss2'];
const SKILL_ICON_FRAMES = [
  'icon_blade', 'icon_fireball', 'icon_frostpulse', 'icon_chainlightning',
  'icon_venomflask', 'icon_holyorb', 'icon_boots', 'icon_magnet',
  'icon_gears', 'icon_battle_emblem', 'icon_core', 'icon_rune',
  'icon_heal', 'ui_upgrade_arrow', 'ui_reroll', 'ui_enhance_badge',
];
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

function installSkillIconTextures(scene) {
  const source = scene.textures.get('skill_icon_atlas').getSourceImage();
  if (!source) return;
  const frameSize = source.width / 4;
  for (let index = 0; index < SKILL_ICON_FRAMES.length; index++) {
    const key = SKILL_ICON_FRAMES[index];
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
    this.load.on('progress', (value) => window.setLoadingProgress?.(value));
    for (const asset of sfxAssetEntries()) this.load.binary(asset.cacheKey, asset.url);
    preloadVfxAssets(this);
    this.load.image('snowflake', 'assets/vfx/snowflake.png');
    this.load.image('ice_shard', 'assets/vfx/ice-shard.png');
    this.load.image('holy_star', 'assets/vfx/holy-star.png');
    this.load.image('blade_slash', 'assets/vfx/blade-slash.png');
    this.load.image('chest_jackpot', 'assets/ui/chest-jackpot.webp');
    this.load.image('prop_crate_art', 'assets/props/prop-crate.webp');
    this.load.image('prop_brazier_art', 'assets/props/prop-brazier.webp');
    this.load.image('prop_gravestone_art', 'assets/props/prop-gravestone.webp');
    this.load.image('pickup_heal_art', 'assets/props/pickup-heal.webp');
    this.load.image('pickup_magnet_art', 'assets/props/pickup-magnet.webp');
    this.load.image('skill_icon_atlas', 'assets/ui/skill-icons-atlas-v2.webp');
    for (const key of BOOT_ENEMIES) {
      this.load.atlas(enemyAtlasKey(key), enemyAtlasImage(key), enemyAtlasJson(key));
    }
    for (const def of PLAYER_WALK_ANIMATIONS) {
      this.load.spritesheet(def.texture, def.file, {
        frameWidth: def.frameSize,
        frameHeight: def.frameSize,
      });
    }
  }

  create() {
    installSkillIconTextures(this);
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
    // SDK 初始化失败/超时仍继续游戏；loadingFinished 只在游戏与平台边界都就绪后触发一次。
    Poki.init().finally(() => {
      Poki.gameLoadingFinished();
      // 开发构建可直达压测/VFX Lab；生产包始终从正式菜单进入。
      const params = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null;
      const stress = !!params && params.has(STRESS_QUERY);
      const vfxLab = !!params && params.has('vfxlab');
      this.scene.start(vfxLab ? 'VfxLab' : stress ? 'Game' : 'Menu');
      window.finishLoading?.();
    });
  }
}
