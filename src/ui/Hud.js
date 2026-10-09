// 局内 HUD：顶部经验条 + 等级 / 计时 / 击杀 + 连杀弹字。挂在 UiScene（不受世界相机 zoom 影响）。
// 字号按“逻辑像素 × 屏幕缩放”核算：竖屏 390 宽约 ×0.54，横屏 1280×720 约 ×0.56、1366×768 约 ×0.6。
// 中日韩文字单独加大（正文 ≥22、标签 ≥20），描边收窄到 3：粗体汉字笔画间隙小，描边过粗会糊成一团。
import { THEME } from '../config.js';
import { t, fmtTime } from '../i18n.js';
import { makePanel } from './widgets.js';
import { UI_FONT_BOLD, isCjkLocale, mobileSafeArea } from './layout.js';

// [竖屏, 横屏] 逻辑字号。等级/计时/击杀是数字，各语言通用；带文字的条目中日韩单独一档。
const HUD_SIZES = Object.freeze({
  lv: [26, 34], timer: [36, 48], kills: [26, 34], killIcon: [26, 36],
  boss: [17, 20], bossCjk: [22, 28],
  event: [16, 22], eventCjk: [22, 28],
  combo: [44, 44], comboCjk: [48, 56],
});
const pick = (pair, portrait) => pair[portrait ? 0 : 1];

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
      fontSize: '26px',
      color: THEME.text,
      stroke: '#10160f',
      strokeThickness: 4,
    };
    // 一行三项按垂直中心对齐，字号变化时不用再手调 y。
    this.lvText = scene.add.text(14, 18, '', textStyle).setOrigin(0, 0.5).setDepth(102);
    this.timerText = scene.add.text(width / 2, 18, '', { ...textStyle, fontSize: '36px', color: THEME.goldCss })
      .setOrigin(0.5, 0.5).setDepth(102);
    this.killText = scene.add.text(width - 14, 18, '', textStyle)
      .setOrigin(1, 0.5).setDepth(102);
    this.killIcon = scene.add.image(width - 82, 31, 'icon_blade').setDisplaySize(26, 26).setDepth(102);

    this.bossBg = scene.add.image(width / 2, 72, 'px').setDepth(100)
      .setTint(0x351519).setDisplaySize(Math.min(420, width - 100), 12).setVisible(false);
    this.bossFill = scene.add.image(width / 2, 72, 'px').setDepth(101)
      .setTint(THEME.red).setVisible(false);
    this.bossFrame = scene.add.graphics().setDepth(102).setVisible(false);
    this.bossText = scene.add.text(width / 2, 82, '', {
      ...textStyle, fontSize: '17px', color: '#ffd7d2', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(102).setVisible(false);

    // 事件横幅底板用 Graphics 画：Phaser Text 的 backgroundColor 在 resolution<1（桌面横屏）时只填满一部分。
    this.eventPlate = scene.add.graphics().setDepth(102.5).setVisible(false);
    this.eventText = scene.add.text(width / 2, 112, '', {
      ...textStyle,
      fontSize: '16px',
      color: '#fff1a8',
      strokeThickness: 3,
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
    const cjk = isCjkLocale();
    const top = this.safe.top;
    this.topPanel.setVisible(portrait);
    let rowY, edge;
    if (portrait) {
      // 竖屏：顶栏 82 高（top+2 ~ top+84），文字行中心 top+33，经验条 top+69；
      // Boss 条两端让开右侧暂停键（x ≥ width-63），事件横幅压在 Boss 名下方。
      const panelW = width - this.safe.side * 2;
      this.topPanel.setPosition(width / 2, top + 43).setScale(panelW / this.topPanelBaseW, 1);
      this.xpH = 8;
      this.xpWidth = panelW - 24;
      this.xpX = this.safe.side + 12;
      this.xpY = top + 69;
      rowY = top + 33;
      edge = this.safe.side + 16;
      this.bossH = 10;
      this.bossY = top + 106;
      this.bossWidth = Math.max(180, width - 160);
      this.eventY = top + 154;
    } else {
      // 横屏（高 1280，屏上约 ×0.56–0.84）：经验条贴顶，文字行中心 46；Boss 条 100，Boss 名 111 起，事件横幅 162 起。
      this.xpH = 12;
      this.xpWidth = width;
      this.xpX = 0;
      this.xpY = 0;
      rowY = 46;
      edge = 22;
      this.bossH = 14;
      this.bossY = 100;
      this.bossWidth = Math.max(180, Math.min(680, width - 480));
      this.eventY = 162;
    }
    this.xpBg.setPosition(this.xpX, this.xpY).setDisplaySize(this.xpWidth, this.xpH);
    this.lvText.setPosition(edge, rowY).setFontSize(pick(HUD_SIZES.lv, portrait));
    this.timerText.setPosition(width / 2, rowY).setFontSize(pick(HUD_SIZES.timer, portrait));
    this.killText.setPosition(width - edge, rowY).setFontSize(pick(HUD_SIZES.kills, portrait));
    this.killIconSize = pick(HUD_SIZES.killIcon, portrait);
    this.killIcon.setDisplaySize(this.killIconSize, this.killIconSize);
    this.placeKillIcon();

    this.xpFill.setPosition(this.xpX, this.xpY).setDisplaySize(Math.max(0.001, this.xpWidth * (this._cache.progress || 0)), this.xpH);
    this.xpFrame.clear().lineStyle(1, THEME.gold, portrait ? 0.62 : 0.78)
      .strokeRoundedRect(this.xpX - 1, this.xpY - 1, this.xpWidth + 2, this.xpH + 2, 3);
    this.bossBg.setPosition(width / 2, this.bossY).setDisplaySize(this.bossWidth, this.bossH);
    this.bossFrame.clear().lineStyle(1, 0xffc76b, 0.72)
      .strokeRoundedRect(width / 2 - this.bossWidth / 2 - 1, this.bossY - this.bossH / 2 - 1, this.bossWidth + 2, this.bossH + 2, 5);
    // 横屏桌面画布倍率常 <1（1280×720 约 0.56），粗体汉字 + 粗描边会糊：中文描边在横屏再收一档，事件横幅有底板可不描边。
    this.bossText.setPosition(width / 2, this.bossY + this.bossH / 2 + 4)
      .setFontSize(pick(cjk ? HUD_SIZES.bossCjk : HUD_SIZES.boss, portrait))
      .setStroke('#10160f', cjk && !portrait ? 2 : 3);
    this.eventPadX = portrait ? 14 : 18;
    this.eventPadY = portrait ? 6 : 8;
    this.eventText.setPosition(width / 2, this.eventY + this.eventPadY)
      .setFontSize(pick(cjk ? HUD_SIZES.eventCjk : HUD_SIZES.event, portrait))
      .setStroke('#10160f', cjk ? (portrait ? 2 : 0) : 3)
      .setWordWrapWidth(Math.max(220, (portrait ? width : Math.min(width, 1400)) - 60), true);
    this.drawEventPlate();
    this.comboText.setFontSize(pick(cjk ? HUD_SIZES.comboCjk : HUD_SIZES.combo, portrait))
      .setStroke('#10160f', cjk ? 7 : 8);
    this.debugText.setY(height - 14);
    this._cache.progress = -1;
  }

  drawEventPlate() {
    const text = this.eventText;
    const w = text.width + this.eventPadX * 2;
    const h = text.height + this.eventPadY * 2;
    const x = text.x - w / 2, y = text.y - this.eventPadY;
    this.eventPlate.clear()
      .fillStyle(0x0d1410, 0.84).fillRoundedRect(x, y, w, h, 8)
      .lineStyle(1, 0x8c681f, 0.72).strokeRoundedRect(x, y, w, h, 8);
  }

  // 击杀图标贴在数字左侧，位数变多时跟着左移，不会和数字重叠。
  placeKillIcon() {
    const iconX = this.killText.x - this.killText.width - 6 - this.killIconSize / 2;
    this.killIcon.setPosition(iconX, this.killText.y);
  }

  update(state) {
    const { lv, progress, time, kills, boss, event, finalBossRemaining = 0 } = state;
    if (progress !== this._cache.progress) {
      this._cache.progress = progress;
      this.xpFill.setDisplaySize(Math.max(0.001, this.xpWidth * progress), this.xpH);
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
      this.placeKillIcon();
    }
    if (boss) {
      const fullW = this.bossWidth;
      const ratio = Math.max(0, boss.hp / boss.maxHp);
      this.bossBg.setVisible(true);
      this.bossFill.setVisible(true).setDisplaySize(Math.max(0.001, fullW * ratio), this.bossH - 2)
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
        this.drawEventPlate();
      }
      this.eventText.setVisible(true);
      this.eventPlate.setVisible(true);
    } else {
      this._cache.event = '';
      this.eventText.setVisible(false);
      this.eventPlate.setVisible(false);
    }
  }

  setDebug(text) {
    if (!this.debugText.visible) this.debugText.setVisible(true);
    this.debugText.setText(text);
  }

  comboPopup(count) {
    this.comboText
      .setText(t('combo.kills', { value: count }))
      .setPosition(this.scene.scale.width / 2, this.scene.scale.height * 0.34)
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
