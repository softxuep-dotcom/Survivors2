// M3 局外成长规则。保持为纯函数，菜单/战斗/结算只负责显示和编排。
import { CHARACTERS, TALENTS, ECONOMY } from '../config.js';

export function talentLevel(save, key) {
  return Math.min(TALENTS[key]?.maxLv || 0, Math.max(0, Number(save?.up?.[key]) || 0));
}

export function talentValue(save, key) {
  const def = TALENTS[key];
  const lv = talentLevel(save, key);
  return lv > 0 ? def.values[lv - 1] : 0;
}

export function nextTalentCost(save, key) {
  const def = TALENTS[key];
  const lv = talentLevel(save, key);
  return !def || lv >= def.maxLv ? null : def.costs[lv];
}

export function purchaseTalent(save, key) {
  const cost = nextTalentCost(save, key);
  if (cost == null || save.diamonds < cost) return false;
  save.diamonds -= cost;
  save.up[key] = talentLevel(save, key) + 1;
  return true;
}

export function isCharacterUnlocked(save, key) {
  return key === 'witch' || key === 'knight' || save?.unlockedCharacters?.includes(key);
}

export function unlockCharacter(save, key) {
  const def = CHARACTERS[key];
  if (!def || isCharacterUnlocked(save, key) || save.diamonds < def.cost) return false;
  save.diamonds -= def.cost;
  save.unlockedCharacters.push(key);
  return true;
}

export function selectedCharacter(save) {
  const key = save?.selectedCharacter;
  return isCharacterUnlocked(save, key) && CHARACTERS[key] ? key : 'witch';
}

export function runBonuses(save, characterKey = selectedCharacter(save)) {
  const char = CHARACTERS[characterKey] || CHARACTERS.witch;
  return {
    hpPct: talentValue(save, 'vitality') + (char.bonuses.hpPct || 0),
    damagePct: talentValue(save, 'might'),
    speedPct: talentValue(save, 'haste') + (char.bonuses.speedPct || 0),
    cooldownPct: talentValue(save, 'focus') + (char.bonuses.cooldownPct || 0),
    xpPct: talentValue(save, 'wisdom'),
    pickupPct: talentValue(save, 'reach') + (char.bonuses.pickupPct || 0),
    revives: talentValue(save, 'secondWind'),
    startXpPct: talentValue(save, 'veteran'),
    rerolls: talentValue(save, 'reroll'),
  };
}

export function calculateRunReward({ time = 0, kills = 0 }) {
  const survival = Math.floor(time / ECONOMY.survivalSecondsPerDiamond);
  const combat = Math.floor(kills / ECONOMY.killsPerDiamond);
  return { survival, combat, total: survival + combat };
}
