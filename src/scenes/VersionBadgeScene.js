import Phaser from 'phaser';
import { UI_FONT } from '../ui/layout.js';

// 微信没有可见 DOM；使用独立常驻场景，版本号不受世界相机、场景切换或暂停影响。
export class VersionBadgeScene extends Phaser.Scene {
  constructor() { super({ key: 'VersionBadge', active: true }); }

  create() {
    this.plate = this.add.graphics();
    this.label = this.add.text(0, 0, `v${__GAME_VERSION__}`, {
      fontFamily: UI_FONT, fontStyle: 'bold', color: '#b9c7bb',
    }).setOrigin(0, 1);
    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
  }

  layout() {
    const mini = globalThis.__HORDE_MINIGAME__;
    const units = this.scale.width / Math.max(1, window.innerWidth);
    const bottom = Math.max(0, window.innerHeight - (mini?.info.safeArea?.bottom || window.innerHeight));
    const left = Math.max(10, mini?.info.safeArea?.left || 0) * units;
    const padX = 6 * units, padY = units;
    const y = this.scale.height - Math.max(bottom, 7) * units;
    this.label.setFontSize(11 * units).setPosition(left + padX, y - padY);
    const width = this.label.width + padX * 2, height = this.label.height + padY * 2;
    this.plate.clear()
      .fillStyle(0x0b100c, 0.78).fillRoundedRect(left, y - height, width, height, height / 2)
      .lineStyle(units, 0x6f8975, 0.4).strokeRoundedRect(left, y - height, width, height, height / 2);
  }

  update() {
    const scenes = this.sys.game.scene.scenes;
    if (scenes[scenes.length - 1] !== this) this.scene.bringToTop();
  }
}
