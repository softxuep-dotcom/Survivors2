// 局内 HUD：顶部经验条 + 等级 / 计时 / 击杀 + 连杀弹字。挂在 UiScene（不受世界相机 zoom 影响）。
import { THEME } from '../config.js';
import { t, fmtTime } from '../i18n.js';
import { makePanel } from './widgets.js';
import { UI_FONT_BOLD, mobileSafeArea } from './layout.js';

export class Hud {
  constructor(scene) {
    this.scene = scene;
    const width = scene.scale.width;
    this.safe = mobileSafeArea(scene);
    this.topPanelBaseW = Math.max(260, width - 20);
    this.topPanel = makePanel(scene, this.topPanelBaseW, 82, {
      fill: 0x0d1410, line: 0x8c681f, lineAlpha: 0.72, lineWidth: 1,
      radius: 25, alpha: 0.86, shadow: true, shadowAlpha: 0.32, highlight: true,
      highlightColor: 0xffe29a, highlightAlpha: 0.1,
    }).setDepth(99).setVisible(this.safe.portrait);
    this.xpFrame = scene.add.graphics().setDepth(102);

    this.xpBg = scene.add.image(0, 0, 'px').setOrigin(0, 0).setDepth(100)
      .setTint(0x10160f).setAlpha(0.8);
    this.xpFill = scene.add.image(0, 0, 'px').setOrigin(0, 0).setDepth(101)
      .setTint(THEME.gold);

    const textStyle = {
      fontFamily: UI_FONT_BOLD,
      fontSize: '22px',
      color: THEME.text,
      stroke: '#10160f',
      strokeThickness: 4,
    };
    this.lvText = scene.add.text(14, 18, '', textStyle).setDepth(102);
    this.timerText = scene.add.text(width / 2, 18, '', { ...textStyle, fontSize: '30px', color: THEME.goldCss })
      .setOrigin(0.5, 0).setDepth(102);
    this.killText = scene.add.text(width - 14, 18, '', textStyle)
      .setOrigin(1, 0).setDepth(102);
    this.killIcon = scene.add.image(width - 82, 31, 'icon_blade').setDisplaySize(26, 26).setDepth(102);

    this.bossBg = scene.add.image(width / 2, 72, 'px').setDepth(100)
      .setTint(0x351519).setDisplaySize(Math.min(420, width - 100), 12).setVisible(false);
    this.bossFill = scene.add.image(width / 2, 72, 'px').setDepth(101)
      .setTint(THEME.red).setVisible(false);
    this.bossFrame = scene.add.graphics().setDepth(102).setVisible(false);
    this.bossText = scene.add.text(width / 2, 82, '', {
      ...textStyle, fontSize: '15px', color: '#ffd7d2', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(102).setVisible(false);

    this.eventText = scene.add.text(width / 2, 112, '', {
      ...textStyle,
      fontSize: '16px',
      color: '#fff1a8',
      strokeThickness: 3,
      backgroundColor: '#10160fbb',
      padding: { x: 10, y: 6 },
      align: 'center',
    }).setOrigin(0.5, 0).setDepth(103).setVisible(false);

    // 连杀大字（复用单个 Text，GDD §4.3 连杀弹字）
    this.comboText = scene.add.text(0, 0, '', {
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: '44px',
      color: '#ffd34e',
      stroke: '#10160f',
      strokeThickness: 8,
    }).setDepth(120).setOrigin(0.5).setVisible(false);

    // 调试信息（?debug=1 / ?stress=1 时显示）
    this.debugText = scene.add.text(14, scene.scale.height - 14, '', {
      fontFamily: 'Consolas, monospace',
      fontSize: '15px',
      color: '#9ef3b0',
      stroke: '#10160f',
      strokeThickness: 3,
    }).setOrigin(0, 1).setDepth(102).setVisible(false);

    this._cache = { lv: -1, time: -1, kills: -1, event: '' };
    this._onResize = this.layout.bind(this);
    this.layout();
    scene.scale.on('resize', this._onResize);
  }

  layout() {
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    this.safe = mobileSafeArea(this.scene);
    const portrait = this.safe.portrait;
    this.topPanel.setVisible(portrait);
    if (portrait) {
      const panelW = width - this.safe.side * 2;
      this.topPanel.setPosition(width / 2, this.safe.top + 43).setScale(panelW / this.topPanelBaseW, 1);
      this.xpWidth = panelW - 22;
      this.xpX = this.safe.side + 11;
      this.xpY = this.safe.top + 74;
      this.xpBg.setPosition(this.xpX, this.xpY).setDisplaySize(this.xpWidth, 6);
      this.lvText.setPosition(this.safe.side + 14, this.safe.top + 15).setFontSize(17);
      this.timerText.setPosition(width / 2, this.safe.top + 12).setFontSize(24);
      this.killText.setPosition(width - this.safe.side - 14, this.safe.top + 15).setFontSize(17);
      this.killIcon.setPosition(width - this.safe.side - 78, this.safe.top + 28).setDisplaySize(22, 22);
      this.bossY = this.safe.top + 103;
      this.bossWidth = Math.max(180, width - 92);
      this.eventY = this.safe.top + 133;
    } else {
      this.xpWidth = width;
      this.xpX = 0;
      this.xpY = 0;
      this.xpBg.setPosition(0, 0).setDisplaySize(width, 10);
      this.lvText.setPosition(14, 18).setFontSize(22);
      this.timerText.setPosition(width / 2, 18).setFontSize(30);
      this.killText.setPosition(width - 14, 18).setFontSize(22);
      this.killIcon.setPosition(width - 92, 33).setDisplaySize(28, 28);
      this.bossY = 72;
      this.bossWidth = Math.min(420, width - 100);
      this.eventY = 112;
    }
    this.xpFill.setPosition(this.xpX, this.xpY).setDisplaySize(Math.max(0.001, this.xpWidth * (this._cache.progress || 0)), portrait ? 6 : 10);
    this.xpFrame.clear().lineStyle(1, THEME.gold, portrait ? 0.62 : 0.78)
      .strokeRoundedRect(this.xpX - 1, this.xpY - 1, this.xpWidth + 2, (portrait ? 6 : 10) + 2, 3);
    this.bossBg.setPosition(width / 2, this.bossY).setDisplaySize(this.bossWidth, portrait ? 9 : 12);
    this.bossFrame.clear().lineStyle(1, 0xffc76b, 0.72)
      .strokeRoundedRect(width / 2 - this.bossWidth / 2 - 1, this.bossY - (portrait ? 5 : 7), this.bossWidth + 2, portrait ? 11 : 14, 5);
    this.bossText.setX(width / 2);
    this.bossText.setY(this.bossY + 10);
    this.eventText.setPosition(width / 2, this.eventY).setFontSize(portrait ? 13 : 16).setWordWrapWidth(Math.max(220, width - 44), true);
    this.debugText.setY(height - 14);
    this._cache.progress = -1;
  }

  update(state) {
    const { lv, progress, time, kills, boss, event, finalBossRemaining = 0 } = state;
    if (progress !== this._cache.progress) {
      this._cache.progress = progress;
      this.xpFill.setDisplaySize(Math.max(0.001, this.xpWidth * progress), this.safe.portrait ? 6 : 10);
    }
    if (lv !== this._cache.lv) {
      this._cache.lv = lv;
      this.lvText.setText(t('hud.lv', { lv }));
    }
    const sec = Math.floor(time);
    if (sec !== this._cache.time) {
      this._cache.time = sec;
      this.timerText.setText(fmtTime(sec));
    }
    if (kills !== this._cache.kills) {
      this._cache.kills = kills;
      this.killText.setText(`${kills}`);
    }
    if (boss) {
      const fullW = this.bossWidth;
      const ratio = Math.max(0, boss.hp / boss.maxHp);
      this.bossBg.setVisible(true);
      this.bossFill.setVisible(true).setDisplaySize(Math.max(0.001, fullW * ratio), 8)
        .setPosition(this.scene.scale.width / 2 - fullW / 2 + fullW * ratio / 2, this.bossY);
      this.bossFrame.setVisible(true);
      const label = t(boss.final ? 'hud.finalBoss' : 'hud.boss', { tier: boss.bossTier });
      this.bossText.setVisible(true).setText(
        boss.final ? `${label} · ${fmtTime(Math.ceil(finalBossRemaining))}` : label,
      );
    } else {
      this.bossBg.setVisible(false);
      this.bossFill.setVisible(false);
      this.bossFrame.setVisible(false);
      this.bossText.setVisible(false);
    }
    if (event) {
      const eventText = t(`runEvent.${event.key}.hud`, {
        progress: event.progress,
        target: event.target,
        time: event.remaining,
      });
      if (eventText !== this._cache.event) {
        this._cache.event = eventText;
        this.eventText.setText(eventText);
      }
      this.eventText.setVisible(true);
    } else {
      this._cache.event = '';
      this.eventText.setVisible(false);
    }
  }

  setDebug(text) {
    if (!this.debugText.visible) this.debugText.setVisible(true);
    this.debugText.setText(text);
  }

  comboPopup(count) {
    this.comboText
      .setText(t('combo.kills', { value: count }))
      .setPosition(this.scene.scale.width / 2, this.scene.scale.height * 0.3)
      .setScale(0.4).setAlpha(1).setVisible(true);
    this.scene.tweens.add({
      targets: this.comboText,
      scale: 1,
      duration: 180,
      ease: 'Back.Out',
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.comboText,
          alpha: 0,
          delay: 500,
          duration: 300,
          onComplete: () => this.comboText.setVisible(false),
        });
      },
    });
  }

  destroy() {
    this.scene.scale.off('resize', this._onResize);
  }
}
