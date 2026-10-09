// 结算页：数据 + 再来一局 / 主菜单 + M2 激励广告额外钻石。
import Phaser from 'phaser';
import { THEME, WEAPONS, EVOLUTIONS, AD_REWARDS } from '../config.js';
import { t, fmtTime } from '../i18n.js';
import { Platform } from '../platform.js';
import { touchSave } from '../save.js';
import { makeButton, makePanel } from '../ui/widgets.js';
import { UI_FONT, UI_FONT_BOLD, mobileSafeArea, isCjkLocale } from '../ui/layout.js';
import { stripLeadingIcon as stripLabelIcon } from '../ui/labelText.js';

function stripLeadingIcon(label) {
  return stripLabelIcon(label, '↻◆♦');
}

function shrinkToWidth(text, maxWidth, minPx) {
  let size = Number.parseFloat(text.style.fontSize);
  while (text.width > maxWidth && size > minPx) text.setFontSize(--size);
  return text;
}

// 字号/尺寸表（逻辑像素）。竖屏 390 宽手机约 ×0.54、横屏 1280×720 约 ×0.56 到屏幕；
// 中文正文 ≥23、标题 ≥42，最小不低于 18。横屏改为“数据 | 伤害统计”两栏，面板加宽填满留白。
function resultMetrics(portrait, cjk) {
  return portrait ? {
    pad: 30, badge: 72, title: cjk ? 42 : 36, time: cjk ? 34 : 29,
    stat: cjk ? 25 : 21, statIcon: 34, statStep: cjk ? 50 : 44,
    dmgHead: cjk ? 24 : 20, dmg: cjk ? 23 : 19, dmgIcon: 32, dmgStep: cjk ? 48 : 42, minText: cjk ? 18 : 13,
    retryH: 84, retryFont: cjk ? 30 : 25, doubleH: 76, doubleFont: cjk ? 24 : 20,
    menuH: 66, menuFont: cjk ? 26 : 22, btnGap: 16, groupGap: 28,
  } : {
    pad: 42, badge: 92, title: cjk ? 64 : 54, time: cjk ? 46 : 39,
    stat: cjk ? 34 : 29, statIcon: 46, statStep: cjk ? 68 : 62,
    dmgHead: cjk ? 32 : 27, dmg: cjk ? 30 : 25, dmgIcon: 44, dmgStep: cjk ? 64 : 58, minText: cjk ? 20 : 15,
    retryH: 110, retryFont: cjk ? 40 : 34, doubleH: 110, doubleFont: cjk ? 31 : 26,
    menuH: 86, menuFont: cjk ? 31 : 27, btnGap: 22, groupGap: 36,
  };
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
    const cjk = isCjkLocale();
    const m = resultMetrics(portrait, cjk);
    this.cameras.main.setBackgroundColor(THEME.bg);
    this.cameras.main.fadeIn(400, 6, 10, 7);
    this.add.tileSprite(0, 0, w, h, 'ground').setOrigin(0).setAlpha(0.4);
    this.add.image(w / 2, h / 2, 'vignette').setDisplaySize(w * 1.25, h * 1.25);

    const save = this.registry.get('save');
    const r = this.result;
    const rewardTotal = Math.max(0, Math.floor(r.reward?.total || 0));
    const bonusDiamonds = Math.floor(rewardTotal * AD_REWARDS.resultBonusPct / 100);
    let displayedDiamonds = rewardTotal;
    let adBusy = false;
    let doubled = false;

    const damageRows = Object.entries(r.damage || {}).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const twoCol = !portrait && damageRows.length > 0;
    const panelW = portrait ? w - safe.side * 2 : Math.min(w - 160, twoCol ? 1320 : 860);

    // 面板内容以面板顶边为 y=0 自上而下排布，最后按实际内容高度画底板。
    const panel = this.add.container(w / 2, 0);
    const good = r.victory || r.newBest;
    let y = m.pad;
    panel.add(this.add.image(0, y + m.badge / 2, good ? 'ui_enhance_badge' : 'icon_battle_emblem')
      .setDisplaySize(m.badge, m.badge));
    y += m.badge + 6;
    const title = this.add.text(0, y, stripLeadingIcon(r.victory ? t('result.victory') : r.newBest ? t('result.newBest') : t('result.over')), {
      fontFamily: UI_FONT_BOLD, fontSize: `${m.title}px`,
      color: good ? THEME.goldCss : '#f2f7ef', stroke: '#10160f', strokeThickness: portrait ? 5 : 7,
    }).setOrigin(0.5, 0);
    shrinkToWidth(title, panelW - m.pad * 2, m.minText + 8);
    y += title.height + (portrait ? 8 : 10);
    const time = this.add.text(0, y, t('result.time', { time: fmtTime(r.time) }), {
      fontFamily: UI_FONT_BOLD, fontSize: `${m.time}px`, color: THEME.goldCss,
    }).setOrigin(0.5, 0);
    shrinkToWidth(time, panelW - m.pad * 2, m.minText + 4);
    panel.add([title, time]);
    y += time.height + 18;
    const divider = this.add.graphics();
    divider.lineStyle(1, THEME.gold, 0.35);
    divider.lineBetween(-panelW / 2 + m.pad + 10, y, -14, y);
    divider.lineBetween(14, y, panelW / 2 - m.pad - 10, y);
    divider.fillStyle(THEME.gold, 0.7);
    divider.fillPoints([{ x: 0, y: y - 6 }, { x: 6, y }, { x: 0, y: y + 6 }, { x: -6, y }], true);
    panel.add(divider);
    y += 22;

    // 两栏时左栏数据、右栏伤害；单栏时上下排列。
    const gutter = 60;
    const inner = panelW / 2 - m.pad;
    const statsRegion = twoCol ? { left: -inner, right: -gutter / 2 } : { left: -inner, right: inner };
    const dmgRegion = twoCol ? { left: gutter / 2, right: inner } : { left: -inner + 10, right: inner - 10 };

    const statLines = [
      t('result.kills', { value: r.kills }),
      t('result.level', { value: r.lv }),
      t('result.diamonds', { value: displayedDiamonds }),
      t('result.best', { time: fmtTime(save.bestTime), kills: save.bestKills }),
    ];
    const statIcons = ['icon_holyorb', 'icon_blade', 'ui_enhance_badge', 'icon_rune'];
    const statTexts = statLines.map(line => this.add.text(0, 0, stripLeadingIcon(line), {
      fontFamily: UI_FONT, fontSize: `${m.stat}px`, color: '#d0e4d3',
    }).setOrigin(0, 0.5));
    // 图标列对齐、文字左对齐，整块在栏内居中；钻石行加倍后变长也按最宽行预留。
    const statRegionW = statsRegion.right - statsRegion.left;
    const statMaxText = statRegionW - m.statIcon - 14;
    let statSize = m.stat;
    while (Math.max(...statTexts.map(text => text.width)) > statMaxText && statSize > m.minText) {
      statSize -= 1;
      statTexts.forEach(text => text.setFontSize(statSize));
    }
    const diamondText = statTexts[2];
    const widestStat = Math.max(...statTexts.map(text => text.width));
    const statBlockW = Math.min(statRegionW, m.statIcon + 14 + widestStat + (bonusDiamonds > 0 ? m.stat * 1.2 : 0));
    const statX = (statsRegion.left + statsRegion.right) / 2 - statBlockW / 2;
    const statsH = statLines.length * m.statStep;

    let dmgH = 0;
    const dmgParts = [];
    if (damageRows.length) {
      const regionW = dmgRegion.right - dmgRegion.left;
      const cx = (dmgRegion.left + dmgRegion.right) / 2;
      const head = this.add.text(cx, 0, t('result.damage'), {
        fontFamily: UI_FONT_BOLD, fontSize: `${m.dmgHead}px`, color: THEME.goldCss,
      }).setOrigin(0.5, 0);
      shrinkToWidth(head, regionW - 80, m.minText);
      dmgParts.push({ obj: head, dy: 0 });
      const headLines = this.add.graphics();
      const headY = head.height / 2;
      const lineW = Math.max(20, Math.min(160, (regionW - head.width) / 2 - 20));
      headLines.lineStyle(1, THEME.gold, 0.4);
      headLines.lineBetween(cx - head.width / 2 - 14 - lineW, headY, cx - head.width / 2 - 14, headY);
      headLines.lineBetween(cx + head.width / 2 + 14, headY, cx + head.width / 2 + 14 + lineW, headY);
      dmgParts.push({ obj: headLines, dy: 0 });
      const rowsTop = head.height + 14;
      const maxValue = Math.max(1, ...damageRows.map(([, value]) => value));
      damageRows.forEach(([key, value], i) => {
        const def = WEAPONS[key] || EVOLUTIONS[key];
        const name = def ? t(def.nameKey) : key.toUpperCase();
        const rowY = rowsTop + i * m.dmgStep + m.dmgStep / 2 - 4;
        const iconX = dmgRegion.left + m.dmgIcon / 2;
        if (def?.icon) dmgParts.push({ obj: this.add.image(iconX, 0, def.icon).setDisplaySize(m.dmgIcon, m.dmgIcon), dy: rowY });
        const textLeft = dmgRegion.left + m.dmgIcon + 14;
        const valueText = this.add.text(dmgRegion.right, 0, `${Math.round(value)}`, {
          fontFamily: UI_FONT_BOLD, fontSize: `${m.dmg}px`, color: '#e8dcb2',
        }).setOrigin(1, 0.5);
        const nameText = this.add.text(textLeft, 0, name, {
          fontFamily: UI_FONT, fontSize: `${m.dmg}px`, color: '#d0e4d3',
        }).setOrigin(0, 0.5);
        shrinkToWidth(nameText, dmgRegion.right - valueText.width - 16 - textLeft, m.minText);
        // 伤害占比细条：底槽 + 金色填充，按最高伤害归一。
        const barY = Math.round(m.dmg * 0.78);
        const barW = dmgRegion.right - textLeft;
        const bar = this.add.graphics();
        bar.fillStyle(0xffffff, 0.07);
        bar.fillRoundedRect(textLeft, barY, barW, 5, 2.5);
        bar.fillStyle(THEME.gold, 0.55);
        bar.fillRoundedRect(textLeft, barY, Math.max(5, barW * value / maxValue), 5, 2.5);
        dmgParts.push({ obj: bar, dy: rowY }, { obj: nameText, dy: rowY }, { obj: valueText, dy: rowY });
      });
      dmgH = rowsTop + damageRows.length * m.dmgStep;
    }

    let statsTop, dmgTop;
    if (twoCol) {
      const colH = Math.max(statsH, dmgH);
      statsTop = y + (colH - statsH) / 2;
      dmgTop = y + (colH - dmgH) / 2;
      const split = this.add.graphics();
      split.lineStyle(1, THEME.gold, 0.22);
      split.lineBetween(0, y + 6, 0, y + colH - 6);
      panel.add(split);
      y += colH;
    } else {
      statsTop = y;
      y += statsH;
      if (dmgH) {
        y += portrait ? 16 : 22;
        dmgTop = y;
        y += dmgH;
      }
    }
    statTexts.forEach((text, i) => {
      const rowY = statsTop + i * m.statStep + m.statStep / 2;
      panel.add(this.add.image(statX + m.statIcon / 2, rowY, statIcons[i]).setDisplaySize(m.statIcon, m.statIcon));
      panel.add(text.setPosition(statX + m.statIcon + 14, rowY));
    });
    for (const { obj, dy } of dmgParts) {
      obj.y += dmgTop + dy;
      panel.add(obj);
    }
    const panelH = y + m.pad - (dmgH ? 6 : 0);
    panel.addAt(makePanel(this, panelW, panelH, {
      fill: 0x101612, line: THEME.gold, lineWidth: 3, chamfer: portrait ? 24 : 28,
      alpha: 0.97, shadow: true, shadowAlpha: 0.52, highlight: true, highlightAlpha: 0.22,
    }).setY(panelH / 2), 0);

    // 按钮：竖屏纵向堆叠，横屏“再来一局 | 看广告”并排、主菜单在下。
    // 主菜单按钮不铺满整行，避开左下角 DOM 版本号徽标；整组（面板 + 按钮）在安全区内垂直居中。
    const rewardedAds = Platform.supportsRewardedAds();
    const showDouble = rewardedAds && bonusDiamonds > 0;
    const sideBySide = !portrait && showDouble;
    const actionW = portrait ? panelW : sideBySide ? Math.min(560, (panelW - m.btnGap) / 2) : Math.min(560, panelW);
    const menuW = portrait ? Math.min(460, panelW * 0.66) : Math.min(400, panelW);
    const buttonsH = portrait
      ? m.retryH + (showDouble ? m.btnGap + m.doubleH : 0) + m.btnGap + m.menuH
      : Math.max(m.retryH, showDouble ? m.doubleH : 0) + m.btnGap + m.menuH;
    const regionTop = safe.top + (portrait ? 8 : 16);
    const regionBottom = h - safe.bottom - (portrait ? 40 : 46);
    const groupH = panelH + m.groupGap + buttonsH;
    const groupTop = regionTop + Math.max(0, (regionBottom - regionTop - groupH) / 2);
    panel.setY(groupTop);
    let by = groupTop + panelH + m.groupGap;
    const retryY = by + m.retryH / 2;
    const retryX = sideBySide ? w / 2 - (actionW + m.btnGap) / 2 : w / 2;
    const doubleX = sideBySide ? w / 2 + (actionW + m.btnGap) / 2 : w / 2;
    const doubleY = sideBySide ? retryY : by + m.retryH + m.btnGap + m.doubleH / 2;
    by += portrait ? m.retryH + (showDouble ? m.btnGap + m.doubleH : 0) + m.btnGap : Math.max(m.retryH, showDouble ? m.doubleH : 0) + m.btnGap;
    const menuY = by + m.menuH / 2;

    const retryButton = makeButton(this, retryX, retryY, actionW, m.retryH, stripLeadingIcon(t('result.retry')), async () => {
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
      fontSize: `${m.retryFont}px`, minFontSize: m.minText, fill: 0x31452c, line: THEME.gold,
      color: '#f2e4b9', chamfer: portrait ? 10 : 12, shadow: true,
      icon: 'ui_reroll', iconSize: Math.round(m.retryH * 0.52), iconSpace: Math.round(m.retryH * 1.1),
    });

    const doubleButton = makeButton(this, doubleX, doubleY, actionW, m.doubleH,
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
        diamondText?.setText(stripLeadingIcon(t('result.diamonds', { value: displayedDiamonds })));
      }, {
        fontSize: `${m.doubleFont}px`, minFontSize: m.minText,
        fill: 0x382d16,
        line: THEME.gold,
        color: THEME.goldCss, chamfer: portrait ? 10 : 12,
        shadow: true, icon: 'ui_enhance_badge', iconSize: Math.round(m.doubleH * 0.52), iconSpace: Math.round(m.doubleH * 1.1),
      });
    if (!showDouble) doubleButton.setVisible(false);

    makeButton(this, w / 2, menuY, menuW, m.menuH, t('result.menu'), () => {
      if (adBusy) return;
      this.scene.start('Menu');
    }, {
      fontSize: `${m.menuFont}px`, minFontSize: m.minText, fill: 0x141b16, line: 0x8c681f,
      color: '#e2d8b6', chamfer: portrait ? 9 : 10,
    });
  }
}
