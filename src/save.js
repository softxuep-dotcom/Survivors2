// localStorage 存档（结构沿用 Merge Towers save.js：版本迁移 + 坏档容错 + 兜底写档）
const KEY = 'hb_save_v1';
const SAVE_VERSION = 3;

const DEFAULT = {
  v: SAVE_VERSION,
  bestTime: 0,      // 历史最长存活秒数
  bestKills: 0,     // 历史最高击杀
  diamonds: 0,      // 局外货币（M3 天赋树用）
  runs: 0,          // 总局数
  tutorialDone: false,
  tutorialGem: false, // 首次经验宝石提示已看过
  up: {},           // 局外天赋档位 { id: tier }（M3）
  selectedCharacter: 'witch',
  unlockedCharacters: ['witch', 'knight'],
  analytics: [],    // 最近 20 局本地运行分析
  lastSeen: 0,
  muted: false,
};

function asInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function asBool(value) {
  return value === true;
}

function cleanUpgrades(up) {
  const out = {};
  if (!up || typeof up !== 'object' || Array.isArray(up)) return out;
  for (const [id, value] of Object.entries(up)) out[id] = asInt(value);
  return out;
}

function cleanCharacters(value) {
  const valid = new Set(['knight', 'witch']);
  const list = Array.isArray(value) ? value.filter(key => valid.has(key)) : [];
  return [...new Set(['witch', 'knight', ...list])];
}

function cleanAnalytics(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(v => v && typeof v === 'object' && !Array.isArray(v)).slice(-20);
}

export function sanitizeSave(raw = {}) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const unlockedCharacters = cleanCharacters(src.unlockedCharacters);
  const selectedCharacter = unlockedCharacters.includes(src.selectedCharacter) ? src.selectedCharacter : 'witch';
  return {
    ...DEFAULT,
    v: SAVE_VERSION,
    bestTime: asInt(src.bestTime),
    bestKills: asInt(src.bestKills),
    diamonds: asInt(src.diamonds),
    runs: asInt(src.runs),
    tutorialDone: asBool(src.tutorialDone) || asInt(src.runs) > 0,
    tutorialGem: asBool(src.tutorialGem),
    up: cleanUpgrades(src.up),
    selectedCharacter,
    unlockedCharacters,
    analytics: cleanAnalytics(src.analytics),
    lastSeen: asInt(src.lastSeen),
    muted: asBool(src.muted),
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return sanitizeSave();
    const parsed = JSON.parse(raw);
    const save = sanitizeSave(parsed);
    if (save.v !== parsed.v) writeSave(save);
    return save;
  } catch (e) {
    const clean = sanitizeSave();
    try { localStorage.setItem(KEY, JSON.stringify(clean)); } catch (_) {}
    return clean;
  }
}

export function writeSave(s) {
  const clean = sanitizeSave(s);
  if (s && typeof s === 'object') Object.assign(s, clean);
  try { localStorage.setItem(KEY, JSON.stringify(clean)); } catch (e) {}
  return clean;
}

export function touchSave(s, patch = {}) {
  if (!s || typeof s !== 'object') return sanitizeSave();
  Object.assign(s, patch, { lastSeen: Date.now() });
  return writeSave(s);
}

export function resetSave() {
  const clean = sanitizeSave();
  try { localStorage.setItem(KEY, JSON.stringify(clean)); } catch (e) {}
  return clean;
}

export function tier(s, id) { return s?.up?.[id] || 0; }
