import Phaser from 'phaser';
import {
  ENEMY_ATLAS_KEYS,
  createEnemyAnimations,
  enemyAnimationSource,
  enemyAnimKey,
  enemyAtlasKey,
  enemyAtlasImage,
  enemyAtlasJson,
  enemyDirectionFlipX,
  enemyPlaybackDirection,
} from '../textures.js';

const requestedType = new URLSearchParams(window.location.search).get('type');
const TYPE_KEY = ENEMY_ATLAS_KEYS.includes(requestedType) ? requestedType : 'mini';
const DIRECTIONS = [
  { label: '↓ front', dx: 0, dy: 1 },
  { label: '↙ front_left', dx: -1, dy: 1 },
  { label: '← left', dx: -1, dy: 0 },
  { label: '↖ back_left', dx: -1, dy: -1 },
  { label: '↑ back', dx: 0, dy: -1 },
  { label: '↗ back_right', dx: 1, dy: -1 },
  { label: '→ right', dx: 1, dy: 0 },
  { label: '↘ front_right', dx: 1, dy: 1 },
];

class EnemyDirectionPreviewScene extends Phaser.Scene {
  constructor() { super('EnemyDirectionPreview'); }

  preload() {
    this.load.atlas(
      enemyAtlasKey(TYPE_KEY),
      enemyAtlasImage(TYPE_KEY),
      enemyAtlasJson(TYPE_KEY),
    );
  }

  create() {
    createEnemyAnimations(this);
    const atlas = this.textures.get(enemyAtlasKey(TYPE_KEY));
    const frameNames = Object.keys(atlas.frames).filter(name => name !== '__BASE');
    const report = [];

    this.cameras.main.setBackgroundColor('#101710');
    this.add.text(480, 35, `${TYPE_KEY} · Phaser 4 八方向运行时验收`, {
      fontFamily: 'Arial, sans-serif', fontSize: '25px', color: '#e8f6e5',
    }).setOrigin(0.5);
    this.add.text(480, 66, '右向由左向水平镜像 · 缺少的方向自动回退到侧身动画 · 横线为统一底部基线', {
      fontFamily: 'Arial, sans-serif', fontSize: '15px', color: '#9bb59a',
    }).setOrigin(0.5);

    DIRECTIONS.forEach((entry, index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      const x = 135 + column * 230;
      const y = 215 + row * 245;
      const direction = enemyPlaybackDirection(entry.dx, entry.dy);
      const source = enemyAnimationSource(this, TYPE_KEY, direction);
      const flipX = enemyDirectionFlipX(direction);
      const animKey = enemyAnimKey(TYPE_KEY, source);
      const framePrefix = `${TYPE_KEY}_${source}_`;
      const frameKeys = frameNames
        .filter(frame => frame.startsWith(framePrefix))
        .sort((a, b) => Number(a.slice(framePrefix.length)) - Number(b.slice(framePrefix.length)));

      this.add.rectangle(x, y, 190, 190, 0x172218, 1).setStrokeStyle(1, 0x39513b, 1);
      this.add.rectangle(x, y + 67, 130, 1, 0x749778, 0.8);
      const sprite = this.add.sprite(x, y + 8, enemyAtlasKey(TYPE_KEY), frameKeys[0]);
      const previewHeight = TYPE_KEY === 'boss' ? 150 : TYPE_KEY === 'tank' ? 112 : 92;
      sprite.setScale(previewHeight / sprite.height);
      sprite.play(animKey);
      sprite.setFlipX(flipX);
      this.add.text(x, y - 78, entry.label, {
        fontFamily: 'Arial, sans-serif', fontSize: '17px', color: '#e5f4e2',
      }).setOrigin(0.5);
      this.add.text(x, y + 84, `source: ${source}${flipX ? '  ⇄' : ''}`, {
        fontFamily: 'Consolas, monospace', fontSize: '13px', color: '#9fbd9e',
      }).setOrigin(0.5);

      report.push({
        vector: [entry.dx, entry.dy], direction, source, flipX, animKey,
        animationExists: this.anims.exists(animKey), frameCount: frameKeys.length,
      });
    });

    window.__enemyPreviewReport = {
      phaserVersion: Phaser.VERSION,
      atlasSize: [atlas.source[0].width, atlas.source[0].height],
      frameCount: frameNames.length,
      directions: report,
      passed: frameNames.length >= 5 && report.every(item => item.animationExists && item.frameCount >= 5),
    };
    document.body.dataset.enemyPreviewReport = JSON.stringify(window.__enemyPreviewReport);
  }
}

window.__enemyPreviewGame = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'preview',
  width: 960,
  height: 620,
  backgroundColor: '#101710',
  scene: [EnemyDirectionPreviewScene],
});
