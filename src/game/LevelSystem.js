// 经验与单层升级卡池。
// 正式局使用直接技能：开局强制主技能，最多持有 4 个；每张成长卡直接应用模块并升级。
import {
  SKILLS, ACTIVE_SKILL_KEYS, SKILL_MODULE_KEYS, SKILL_MODULE_MAX_RANK,
  SKILL_POWER_PER_RANK, PASSIVES, xpToNext, MAX_ACTIVE_SKILLS, MAXED_BONUS,
} from '../config.js';
import { getLocale } from '../i18n.js';

const REGULAR_CHOICE_COUNT = 4;

function weightedPick(candidates) {
  if (!candidates.length) return null;
  let total = 0;
  for (const candidate of candidates) total += Math.max(0, candidate.weight || 0);
  if (total <= 0) return candidates[0];
  let roll = Math.random() * total;
  for (const candidate of candidates) {
    roll -= Math.max(0, candidate.weight || 0);
    if (roll <= 0) return candidate;
  }
  return candidates.at(-1);
}

function localizedText(text) {
  return getLocale() === 'zh-CN' ? text.zh : text.en;
}

function powerRankText() {
  const pct = SKILL_POWER_PER_RANK * 100;
  return Number.isInteger(pct) ? `${pct}` : pct.toFixed(1).replace(/\.0$/, '');
}

export class LevelSystem {
  constructor(scene) {
    this.scene = scene;
    this.lv = 1;
    this.xp = 0;
    this.need = xpToNext(1);
    this.mainSkillKey = null;
    this.missedAppearances = Object.fromEntries(ACTIVE_SKILL_KEYS.map(key => [key, 0]));
  }

  addXp(value) {
    this.xp += value;
    while (this.xp >= this.need) {
      this.xp -= this.need;
      this.lv++;
      this.need = xpToNext(this.lv);
      this.scene.onLevelUp();
    }
  }

  get progress() { return Math.min(1, this.xp / this.need); }

  rewardXpValue(needPct = 0.5) {
    return Math.max(1, Math.round(this.need * needPct));
  }

  mainSkillChoices() {
    return ACTIVE_SKILL_KEYS.map(key => ({ kind: 'skill', key, toLv: 1, main: true }));
  }

  selectMainSkill(key) {
    if (this.mainSkillKey || !SKILLS[key]) return false;
    if (!this.scene.weapons.addSkill(key, { main: true })) return false;
    this.mainSkillKey = key;
    this.missedAppearances[key] = 0;
    return true;
  }

  ownedSkills() {
    return this.scene.weapons.weapons.filter(weapon => !!weapon.skillKey);
  }

  moduleChoice(weapon, moduleKey) {
    const rank = weapon.modules[moduleKey] || 0;
    if (rank >= SKILL_MODULE_MAX_RANK || weapon.lv >= weapon.def.maxLv) return null;
    const zh = moduleKey === 'scale' ? '规模' : moduleKey === 'power' ? '威力' : '特性';
    const en = moduleKey === 'scale' ? 'SCALE' : moduleKey === 'power' ? 'POWER' : 'TRAIT';
    const effect = moduleKey === 'power' ? null : weapon.def.modules[moduleKey]?.[rank];
    return {
      kind: 'module', key: weapon.skillKey, moduleKey, moduleRank: rank + 1, toLv: weapon.lv + 1,
      moduleLabel: getLocale() === 'zh-CN' ? zh : en,
      description: effect
        ? localizedText(effect.text)
        : (getLocale() === 'zh-CN'
          ? `该技能全部伤害 +${powerRankText()}%`
          : `All damage from this skill +${powerRankText()}%`),
      weight: 1 + rank * 0.5,
    };
  }

  moduleCandidates(weapon, excluded = new Set()) {
    return SKILL_MODULE_KEYS
      .map(moduleKey => this.moduleChoice(weapon, moduleKey))
      .filter(choice => choice && !excluded.has(`${choice.key}:${choice.moduleKey}`));
  }

  buildChoices() {
    const player = this.scene.player;
    const owned = this.ownedSkills();
    const eligible = owned.filter(weapon => weapon.lv < weapon.def.maxLv);
    const picks = [];
    const pickedModules = new Set();
    const skillCounts = new Map();

    const addModuleFor = (weapon) => {
      const candidates = this.moduleCandidates(weapon, pickedModules);
      const choice = weightedPick(candidates);
      if (!choice) return false;
      picks.push(choice);
      pickedModules.add(`${choice.key}:${choice.moduleKey}`);
      skillCounts.set(choice.key, (skillCounts.get(choice.key) || 0) + 1);
      return true;
    };

    // 连续 3 次未上卡面的技能，优先占据第一张成长卡。
    const overdue = eligible
      .filter(weapon => (this.missedAppearances[weapon.skillKey] || 0) >= 3)
      .sort((a, b) => this.missedAppearances[b.skillKey] - this.missedAppearances[a.skillKey]);
    if (overdue.length) addModuleFor(overdue[0]);

    // 前两张必定是已拥有技能的成长卡；有两个可成长技能时优先来自不同技能。
    while (picks.length < 2) {
      const usedSkills = new Set(picks.filter(choice => choice.kind === 'module').map(choice => choice.key));
      let candidates = eligible.filter(weapon =>
        (skillCounts.get(weapon.skillKey) || 0) < 2
        && this.moduleCandidates(weapon, pickedModules).length > 0);
      const unused = candidates.filter(weapon => !usedSkills.has(weapon.skillKey));
      if (unused.length && usedSkills.size < eligible.length) candidates = unused;
      const weapon = weightedPick(candidates.map(candidate => ({
        ...candidate,
        weight: this.moduleCandidates(candidate, pickedModules).reduce((sum, choice) => sum + choice.weight, 0),
      })));
      if (!weapon || !addModuleFor(this.scene.weapons.getWeapon(weapon.skillKey))) break;
    }

    // 后两张进入统一内容池：成长模块 / 新技能 / 被动。
    const contentPool = [];
    for (const weapon of eligible) {
      if ((skillCounts.get(weapon.skillKey) || 0) >= 2) continue;
      contentPool.push(...this.moduleCandidates(weapon, pickedModules));
    }
    if (owned.length < MAX_ACTIVE_SKILLS) {
      for (const key of ACTIVE_SKILL_KEYS) {
        if (!this.scene.weapons.getWeapon(key)) contentPool.push({ kind: 'skill', key, toLv: 1, weight: 1.8 });
      }
    }
    for (const def of Object.values(PASSIVES)) {
      const lv = player.passives[def.key] || 0;
      if (lv >= def.maxLv) continue;
      contentPool.push({ kind: 'passive', key: def.key, toLv: lv + 1, weight: lv > 0 ? 1.5 : 1 });
    }

    // 前期主动/被动正常混抽；满 4 个主动后只移除未获得的主动技能，已有主动成长与被动仍保留。
    // 从统一池无放回抽取，避免同一升级项在同一手牌重复出现。
    while (picks.length < REGULAR_CHOICE_COUNT && contentPool.length) {
      const availablePool = contentPool.filter(choice =>
        choice.kind !== 'module' || (skillCounts.get(choice.key) || 0) < 2);
      const choice = weightedPick(availablePool);
      if (!choice) break;
      picks.push(choice);
      if (choice.kind === 'module') {
        skillCounts.set(choice.key, (skillCounts.get(choice.key) || 0) + 1);
      }
      contentPool.splice(contentPool.indexOf(choice), 1);
    }

    const fillers = [{ kind: 'heal' }, { kind: 'bonus', key: 'dmg' }, { kind: 'bonus', key: 'speed' }];
    let fillerIndex = 0;
    while (picks.length < REGULAR_CHOICE_COUNT) picks.push(fillers[fillerIndex++ % fillers.length]);
    return picks;
  }

  noteOfferedChoices(choices) {
    const appeared = new Set(choices.filter(choice => choice.kind === 'module').map(choice => choice.key));
    for (const weapon of this.ownedSkills()) {
      if (weapon.lv >= weapon.def.maxLv) continue;
      this.missedAppearances[weapon.skillKey] = appeared.has(weapon.skillKey)
        ? 0
        : (this.missedAppearances[weapon.skillKey] || 0) + 1;
    }
  }

  apply(choice) {
    const player = this.scene.player;
    if (choice.kind === 'module') {
      this.scene.weapons.upgradeSkill(choice.key, choice.moduleKey);
    } else if (choice.kind === 'skill') {
      this.scene.weapons.addSkill(choice.key);
      this.missedAppearances[choice.key] = 0;
    } else if (choice.kind === 'passive') {
      player.addPassive(choice.key);
    } else if (choice.kind === 'heal') {
      player.heal(MAXED_BONUS.healPct);
    } else if (choice.kind === 'bonus') {
      if (choice.key === 'dmg') player.bonusDmg += MAXED_BONUS.dmgPct;
      else player.bonusSpeed += MAXED_BONUS.speedPct;
      player.recalcStats();
    }
  }
}
