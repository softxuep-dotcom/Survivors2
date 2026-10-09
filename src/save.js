// 存档后端默认使用 localStorage；支持云存档的平台 SDK 就绪后切换到同接口
// 的平台存储，从而兼容游客本地档与登录用户跨设备同步。
const KEY = 'hb_save_v1';
const SAVE_VERSION = 3;
let activeStorage = null;

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

function fallbackStorage() {
  return typeof globalThis !== 'undefined' ? globalThis.localStorage || null : null;
}

function storage() {
  return activeStorage || fallbackStorage();
}

export function configureSaveStorage(nextStorage) {
  const fallback = fallbackStorage();
  if (!nextStorage || typeof nextStorage.getItem !== 'function' || typeof nextStorage.setItem !== 'function') {
    activeStorage = fallback;
    return false;
  }
  try {
    const platformSave = nextStorage.getItem(KEY);
    const legacySave = fallback?.getItem(KEY);
    // One-time migration for players who already had a browser-local save.
    // Existing platform/cloud data always wins and is never overwritten here.
    if (platformSave == null && legacySave != null) nextStorage.setItem(KEY, legacySave);
    activeStorage = nextStorage;
    return true;
  } catch (_) {
    activeStorage = fallback;
    return false;
  }
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
    const raw = storage()?.getItem(KEY);
    if (!raw) return sanitizeSave();
    const parsed = JSON.parse(raw);
    const save = sanitizeSave(parsed);
    if (save.v !== parsed.v) writeSave(save);
    return save;
  } catch (e) {
    const clean = sanitizeSave();
    try { storage()?.setItem(KEY, JSON.stringify(clean)); } catch (_) {}
    return clean;
  }
}

export function writeSave(s) {
  const clean = sanitizeSave(s);
  if (s && typeof s === 'object') Object.assign(s, clean);
  try { storage()?.setItem(KEY, JSON.stringify(clean)); } catch (e) {}
  return clean;
}

export function touchSave(s, patch = {}) {
  if (!s || typeof s !== 'object') return sanitizeSave();
  Object.assign(s, patch, { lastSeen: Date.now() });
  return writeSave(s);
}

export function resetSave() {
  const clean = sanitizeSave();
  try { storage()?.setItem(KEY, JSON.stringify(clean)); } catch (e) {}
  return clean;
}

export function tier(s, id) { return s?.up?.[id] || 0; }
