// 结算页：数据 + 再来一局 / 主菜单 + M2 激励广告额外钻石。
import Phaser from 'phaser';
import { THEME, WEAPONS, EVOLUTIONS, AD_REWARDS } from '../config.js';
import { t, fmtTime } from '../i18n.js';
import { Platform } from '../platform.js';
import { touchSave } from '../save.js';
import { makeButton, makePanel } from '../ui/widgets.js';
import { UI_FONT, UI_FONT_BOLD, mobileSafeArea } from '../ui/layout.js';
import { stripLeadingIcon as stripLabelIcon } from '../ui/labelText.js';

function stripLeadingIcon(label) {
  return stripLabelIcon(label, '↻◆♦');
}

export class ResultScene extends Phaser.Scene {
  constructor() { super('Result'); }

  init(data) {
    this.result = data || {
      time: 0, kills: 0, lv: 1, newBest: false, victory: false, difficulty: 'easy', damage: {},
    };
  }

  create() {
    this._onResize = () => {
      this._resizeTimer?.remove();
      this._resizeTimer = this.time.delayedCall(120, () => this.scene.restart(this.result));
    };
    this.scale.on('resize', this._onResize);
    this.events.once('shutdown', () => this.scale.off('resize', this._onResize));

    const w = this.scale.width, h = this.scale.height;
    const safe = mobileSafeArea(this);
    const portrait = safe.portrait;
    this.cameras.main.setBackgroundColor(THEME.bg);
    this.cameras.main.fadeIn(400, 6, 10, 7);
    this.add.tileSprite(0, 0, w, h, 'ground').setOrigin(0).setAlpha(0.4);
    this.add.image(w / 2, h / 2, 'vignette').setDisplaySize(w * 1.25, h * 1.25);

    const panelCenterY = portrait ? h / 2 - 52 : h / 2 - 65;
    const panelW = portrait ? w - safe.side * 2 : 500;
    const panelH = portrait ? Math.min(570, h - 250) : 630;
    const panel = this.add.container(w / 2, panelCenterY);
    panel.add(makePanel(this, panelW, panelH, {
      fill: 0x101612, line: THEME.gold, lineWidth: 3, chamfer: portrait ? 24 : 20,
      alpha: 0.97, shadow: true, shadowAlpha: 0.52, highlight: true, highlightAlpha: 0.22,
    }));

    const save = this.registry.get('save');
    const r = this.result;
    const rewardTotal = Math.max(0, Math.floor(r.reward?.total || 0));
    const bonusDiamonds = Math.floor(rewardTotal * AD_REWARDS.resultBonusPct / 100);
    let displayedDiamonds = rewardTotal;
    let adBusy = false;
    let doubled = false;

    const title = stripLeadingIcon(r.victory ? t('result.victory') : r.newBest ? t('result.newBest') : t('result.over'));
    panel.add(this.add.image(0, -271, r.victory || r.newBest ? 'ui_enhance_badge' : 'icon_battle_emblem')
      .setDisplaySize(portrait ? 52 : 60, portrait ? 52 : 60));
    panel.add(this.add.text(0, -232, title, {
      fontFamily: UI_FONT_BOLD, fontSize: portrait ? '30px' : '38px',
      color: r.victory || r.newBest ? THEME.goldCss : '#f2f7ef', stroke: '#10160f', strokeThickness: portrait ? 4 : 6,
    }).setOrigin(0.5));

    panel.add(this.add.text(0, -166, t('result.time', { time: fmtTime(r.time) }), {
      fontFamily: UI_FONT_BOLD, fontSize: portrait ? '25px' : '30px', color: THEME.goldCss,
    }).setOrigin(0.5));

    const lines = [
      t('result.kills', { value: r.kills }),
      t('result.level', { value: r.lv }),
      t('result.diamonds', { value: displayedDiamonds }),
      t('result.best', { time: fmtTime(save.bestTime), kills: save.bestKills }),
    ];
    const statIcons = ['icon_holyorb', 'icon_blade', 'ui_enhance_badge', 'icon_rune'];
    let diamondText = null;
    lines.forEach((line, i) => {
      panel.add(this.add.image(-panelW / 2 + (portrait ? 32 : 42), -112 + i * 36, statIcons[i])
        .setDisplaySize(portrait ? 24 : 28, portrait ? 24 : 28));
      const row = this.add.text(0, -112 + i * 36, stripLeadingIcon(line), {
        fontFamily: UI_FONT, fontSize: portrait ? '17px' : '21px', color: THEME.sub,
      }).setOrigin(0.5);
      if (i === 2) diamondText = row;
      panel.add(row);
    });

    panel.add(this.add.text(0, 82, t('result.damage'), {
      fontFamily: UI_FONT_BOLD, fontSize: portrait ? '16px' : '18px', color: THEME.goldCss,
    }).setOrigin(0.5));
    const damageRows = Object.entries(r.damage || {}).sort((a, b) => b[1] - a[1]).slice(0, 4);
    damageRows.forEach(([key, value], i) => {
      const def = WEAPONS[key] || EVOLUTIONS[key];
      const name = def ? t(def.nameKey) : key.toUpperCase();
      if (def?.icon) panel.add(this.add.image(-panelW / 2 + (portrait ? 34 : 44), 116 + i * 31, def.icon)
        .setDisplaySize(portrait ? 25 : 28, portrait ? 25 : 28));
      panel.add(this.add.text(8, 116 + i * 31, `${name}  ·  ${Math.round(value)}`, {
        fontFamily: UI_FONT, fontSize: portrait ? '15px' : '18px', color: THEME.sub,
      }).setOrigin(0.5));
    });

    const rewardedAds = Platform.supportsRewardedAds();
    const actionY = portrait ? h - (rewardedAds ? 176 : 111) : h / 2 + 250;
    const buttonW = portrait ? w - safe.side * 2 : Math.min(260, (w - 54) / 2);
    const actionGap = 14;
    const actionOffset = (buttonW + actionGap) / 2;

    const retryButton = makeButton(this, portrait || !rewardedAds ? w / 2 : w / 2 - actionOffset, actionY, buttonW, portrait ? 56 : 76, stripLeadingIcon(t('result.retry')), async () => {
      if (adBusy) return;
      adBusy = true;
      retryButton.disableInteractive().setAlpha(0.6);
      try {
        // A completed run is a natural midgame boundary. Errors and unavailable
        // ads fail open so replay is never blocked.
        if (Platform.supportsMidgameAds()) await Platform.midgameAd();
      } finally {
        this.input.enabled = true;
      }
      this.scene.start('Game', { difficulty: r.difficulty, character: r.character });
    }, {
      fontSize: portrait ? '20px' : '28px', fill: 0x31452c, line: THEME.gold,
      color: '#f2e4b9', chamfer: portrait ? 10 : 12, shadow: true,
      icon: 'ui_reroll', iconSize: portrait ? 34 : 42,
    });

    const doubleButton = makeButton(this, portrait ? w / 2 : w / 2 + actionOffset, portrait ? h - 111 : actionY, buttonW, portrait ? 54 : 76,
      stripLeadingIcon(t('result.double', { value: bonusDiamonds, percent: AD_REWARDS.resultBonusPct })), async () => {
        if (adBusy || doubled || bonusDiamonds <= 0) return;
        adBusy = true;
        doubled = true;
        doubleButton.disableInteractive().setAlpha(0.55);
        retryButton.disableInteractive().setAlpha(0.6);

        let rewarded = false;
        try {
          rewarded = await Platform.rewardedAd();
        } finally {
          adBusy = false;
          this.input.enabled = true;
          retryButton.setInteractive({ useHandCursor: true }).setAlpha(1);
        }
        if (!rewarded) {
          doubled = false;
          doubleButton.setInteractive({ useHandCursor: true }).setAlpha(1);
          return;
        }
        doubleButton.setVisible(false);

        displayedDiamonds += bonusDiamonds;
        touchSave(save, { diamonds: save.diamonds + bonusDiamonds });
        diamondText?.setText(t('result.diamonds', { value: displayedDiamonds }));
      }, {
        fontSize: portrait ? '18px' : buttonW < 210 ? '20px' : '23px',
        fill: 0x382d16,
        line: THEME.gold,
        color: THEME.goldCss, chamfer: portrait ? 10 : 12,
        shadow: true, icon: 'ui_enhance_badge', iconSize: portrait ? 34 : 42,
      });
    if (!rewardedAds || bonusDiamonds <= 0) doubleButton.setVisible(false);

    makeButton(this, w / 2, portrait ? h - 48 : h / 2 + 342, portrait ? buttonW : 340, portrait ? 48 : 60, t('result.menu'), () => {
      if (adBusy) return;
      this.scene.start('Menu');
    }, {
      fontSize: portrait ? '17px' : '22px', fill: 0x141b16, line: 0x8c681f,
      color: '#d9cfad', chamfer: portrait ? 9 : 10,
    });
  }
}
