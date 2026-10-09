// WebAudio 程序化音效：零资源文件（引擎层沿用 Merge Towers audio.js，Sfx 为割草定制）
let ctx = null;
let muted = false;
let unlocked = false;
let masterGain = null;
let sfxGain = null;
let combatGain = null;
let musicGain = null;
let ambienceGain = null;
let ambience = null;
let sharedNoiseBuffer = null;
let assetFetchPromise = null;
let assetDecodePromise = null;
let musicTimer = null;
let nextBeatTime = 0;
let beatStep = 0;
let stageActive = false;
let stageKey = 'day';
let activeCombatVoices = 0;
const pauseReasons = new Set();
const rawSfxAssets = new Map();
const decodedSfxAssets = new Map();
let miniWebAudioUnavailable = false;
let miniVoices = null;

function playMiniSample(key, volume) {
  if (!globalThis.__HORDE_MINIGAME__ || !unlocked || muted || audioPaused()) return false;
  const api = globalThis.tt;
  if (!api?.createInnerAudioContext) return false;
  if (!miniVoices) {
    miniVoices = [];
    for (let i = 0; i < 6; i++) {
      try {
        const audio = api.createInnerAudioContext();
        const voice = { audio, busy: false };
        audio.onEnded(() => { voice.busy = false; });
        audio.onError(() => { voice.busy = false; });
        miniVoices.push(voice);
      } catch (_) { break; }
    }
  }
  const voice = miniVoices.find(item => !item.busy);
  if (!voice) return true; // Fixed budget: drop excess effects.
  try {
    voice.busy = true;
    voice.audio.src = `assets/audio/sfx/${key}.wav`;
    voice.audio.volume = Math.min(1, Math.max(0, volume));
    voice.audio.play();
  } catch (_) { voice.busy = false; }
  return true;
}

const SFX_ASSETS = Object.freeze([
  'weapon-blade-cast', 'weapon-blade-impact',
  'weapon-fire-cast', 'weapon-fire-impact',
  'weapon-ice-cast', 'weapon-ice-impact',
  'weapon-lightning-cast', 'weapon-lightning-impact',
  'weapon-holy-cast', 'weapon-holy-impact',
  'boss-entry', 'boss-charge-warn', 'boss-charge-start', 'boss-charge-impact',
  'boss-fireball-warn', 'boss-fireball-cast', 'boss-fireball-impact',
  'boss-roar', 'boss-mirror-warn', 'boss-summon',
]);
const SFX_CACHE_PREFIX = 'horde-sfx-';

// 阶段变奏：day=开局蜜月，dusk=中盘，night=后段，blood=血月终盘（GDD §7）
const PHASE_AUDIO = {
  day: {
    root: 261.63, tempo: 88, lead: 'triangle', musicVol: 0.034, ambienceVol: 0.026,
    droneVol: 0.012, fifthVol: 0.007, noiseVol: 0.009, noiseFreq: 1800,
    pattern: [0, 2, 4, 7, 9, 7, 4, 2], bass: [-12, null, -5, null],
  },
  dusk: {
    root: 220, tempo: 96, lead: 'triangle', musicVol: 0.038, ambienceVol: 0.032,
    droneVol: 0.018, fifthVol: 0.012, noiseVol: 0.013, noiseFreq: 1200,
    pattern: [0, 3, 5, 7, 10, 7, 5, 3], bass: [-12, null, -7, null],
  },
  night: {
    root: 196, tempo: 104, lead: 'sine', musicVol: 0.041, ambienceVol: 0.038,
    droneVol: 0.025, fifthVol: 0.018, noiseVol: 0.017, noiseFreq: 780,
    pattern: [0, 2, 3, 7, 10, 7, 3, 2], bass: [-12, null, -5, -10],
  },
  blood: {
    root: 174.61, tempo: 118, lead: 'sawtooth', musicVol: 0.045, ambienceVol: 0.047,
    droneVol: 0.034, fifthVol: 0.026, noiseVol: 0.024, noiseFreq: 430,
    pattern: [0, 1, 6, 7, 10, 7, 6, 1], bass: [-12, -12, -6, -13],
  },
};

// 六个武器家族共享听觉血统；进阶形态继承家族音色，避免 18 套声音同时争抢注意力。
const WEAPON_FAMILY = Object.freeze({
  blade: 'blade', bladestorm: 'blade', headhunter: 'blade',
  fireball: 'fire', lavatrail: 'fire', cluster: 'fire',
  frostpulse: 'ice', blizzard: 'ice', icecage: 'ice',
  chainlightning: 'lightning', stormeye: 'lightning', thunderjudgment: 'lightning',
  venomflask: 'poison', plague: 'poison', corrosion: 'poison',
  holyorb: 'holy', holyhalo: 'holy', prism: 'holy',
});

// 持续/高频进阶技能只播“节奏标记”，不为每个伤害周期完整发声。
const WEAPON_CAST_GAP_MS = Object.freeze({
  bladestorm: 520,
  blizzard: 780,
  stormeye: 820,
  holyhalo: 900,
  lavatrail: 240,
  cluster: 240,
  plague: 300,
  corrosion: 300,
});

function weaponFamilyOf(key) {
  return WEAPON_FAMILY[key] || 'blade';
}

function noiseBuffer(c) {
  if (sharedNoiseBuffer) return sharedNoiseBuffer;
  const len = Math.floor(c.sampleRate * 2);
  sharedNoiseBuffer = c.createBuffer(1, len, c.sampleRate);
  const data = sharedNoiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return sharedNoiseBuffer;
}

// Boot 阶段先拉取二进制；首次用户手势创建 AudioContext 后再解码，兼容浏览器自动播放策略。
export function preloadSfxAssets() {
  if (rawSfxAssets.size === SFX_ASSETS.length) return Promise.resolve(true);
  if (assetFetchPromise) return assetFetchPromise;
  if (typeof fetch !== 'function') return Promise.resolve(false);
  assetFetchPromise = Promise.all(SFX_ASSETS.map(async key => {
    const response = await fetch(`assets/audio/sfx/${key}.wav`, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`Audio asset ${key} failed: ${response.status}`);
    rawSfxAssets.set(key, await response.arrayBuffer());
  })).then(() => true).catch(() => false);
  return assetFetchPromise;
}

export function sfxAssetEntries() {
  return SFX_ASSETS.map(key => ({
    key,
    cacheKey: `${SFX_CACHE_PREFIX}${key}`,
    url: `assets/audio/sfx/${key}.wav`,
  }));
}

export function registerPreloadedSfxAsset(key, raw) {
  if (raw instanceof ArrayBuffer) rawSfxAssets.set(key, raw);
  else if (ArrayBuffer.isView(raw)) {
    rawSfxAssets.set(key, raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  }
}

async function decodeSfxAssets(c) {
  if (assetDecodePromise) return assetDecodePromise;
  assetDecodePromise = (async () => {
    const loaded = await preloadSfxAssets();
    if (!loaded) return false;
    const results = await Promise.allSettled(SFX_ASSETS.map(async key => {
      const raw = rawSfxAssets.get(key);
      if (!raw) return;
      decodedSfxAssets.set(key, await c.decodeAudioData(raw.slice(0)));
    }));
    if (import.meta.env.DEV) {
      console.info(`[audio] decoded ${decodedSfxAssets.size}/${SFX_ASSETS.length} SFX assets`);
      document.documentElement.dataset.audioSfx = `${decodedSfxAssets.size}/${SFX_ASSETS.length}`;
    }
    return results.some(result => result.status === 'fulfilled');
  })();
  return assetDecodePromise;
}

function playSample(key, {
  vol = 0.65, rate = 1, delay = 0, combat = false, importance = 'normal', maxDur = 0,
} = {}) {
  const c = ac(false);
  if (!c && globalThis.__HORDE_MINIGAME__) return playMiniSample(key, vol);
  const buffer = decodedSfxAssets.get(key);
  if (!c || !buffer || muted || audioPaused()) return false;
  if (combat && activeCombatVoices >= (importance === 'heavy' ? 7 : 5)) return true;
  const source = c.createBufferSource();
  const gain = c.createGain();
  const t0 = c.currentTime + delay;
  const densityScale = combat ? 1 / Math.sqrt(1 + activeCombatVoices * 0.82) : 1;
  const effectiveVol = Math.max(0.0001, vol * densityScale);
  source.buffer = buffer;
  source.playbackRate.value = Math.max(0.5, Math.min(2, rate));
  gain.gain.setValueAtTime(effectiveVol, t0);
  source.connect(gain).connect((combat ? combatGain : sfxGain) || c.destination);
  if (combat) {
    activeCombatVoices++;
    source.onended = () => { activeCombatVoices = Math.max(0, activeCombatVoices - 1); };
  }
  source.start(t0);
  const naturalDur = buffer.duration / source.playbackRate.value;
  if (maxDur > 0 && maxDur < naturalDur) {
    const stopAt = t0 + maxDur;
    gain.gain.setValueAtTime(effectiveVol, Math.max(t0, stopAt - 0.025));
    gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
    source.stop(stopAt + 0.005);
  }
  return true;
}

function phaseKeyOf(phase) {
  return PHASE_AUDIO[phase] ? phase : 'day';
}

function ramp(param, value, dur = 0.15) {
  if (!ctx || !param) return;
  const now = ctx.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(Math.max(0.0001, param.value || 0.0001), now);
  param.linearRampToValueAtTime(value, now + dur);
}

function audioPaused() {
  return pauseReasons.size > 0 || (typeof document !== 'undefined' && document.hidden);
}

function updateMasterGain() {
  if (muted || audioPaused()) for (const voice of miniVoices || []) {
    try { voice.audio.stop(); } catch (_) {}
    voice.busy = false;
  }
  if (!masterGain || !ctx) return;
  ramp(masterGain.gain, muted || audioPaused() ? 0 : 1, 0.12);
}

function setupBuses(c) {
  masterGain = c.createGain();
  sfxGain = c.createGain();
  combatGain = c.createGain();
  musicGain = c.createGain();
  ambienceGain = c.createGain();
  const combatComp = c.createDynamicsCompressor();
  const comp = c.createDynamicsCompressor();
  masterGain.gain.value = muted || audioPaused() ? 0 : 1;
  sfxGain.gain.value = 0.85;
  combatGain.gain.value = 0.68;
  musicGain.gain.value = 0;
  ambienceGain.gain.value = 0;
  combatComp.threshold.value = -24;
  combatComp.knee.value = 14;
  combatComp.ratio.value = 7;
  combatComp.attack.value = 0.004;
  combatComp.release.value = 0.13;
  combatGain.connect(combatComp).connect(sfxGain);
  sfxGain.connect(masterGain);
  musicGain.connect(masterGain);
  ambienceGain.connect(masterGain);
  masterGain.connect(comp).connect(c.destination);
}

function ac(create = unlocked) {
  if (miniWebAudioUnavailable) return null;
  if (!ctx) {
    if (!create || muted || typeof window === 'undefined') return null;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (globalThis.__HORDE_MINIGAME__ && ['createGain', 'createDynamicsCompressor', 'createOscillator',
        'createBuffer', 'createBufferSource', 'createBiquadFilter', 'decodeAudioData'].some(key => typeof ctx[key] !== 'function')) {
        throw new Error('Mini-game WebAudio synthesis unavailable');
      }
      setupBuses(ctx);
    } catch (e) {
      ctx = null;
      if (globalThis.__HORDE_MINIGAME__) miniWebAudioUnavailable = true;
      return null;
    }
  }
  if (ctx.state === 'suspended') {
    const resume = ctx.resume();
    if (resume?.catch) resume.catch(() => {});
  }
  return ctx;
}

export function unlockAudio() {
  unlocked = true;
  const c = ac(true);
  if (!c) return false;
  void decodeSfxAssets(c);
  updateMasterGain();
  if (stageActive) {
    ensureAmbience();
    applyStageTone(true);
    startMusicClock();
  }
  return true;
}

export function setMuted(m) {
  muted = m;
  if (!muted && unlocked) {
    const c = ac(true);
    if (c && stageActive) {
      ensureAmbience();
      applyStageTone(true);
      startMusicClock();
    }
  }
  updateMasterGain();
}
export function isMuted() { return muted; }

export function setAudioPaused(paused, reason = 'system') {
  if (paused) pauseReasons.add(reason);
  else pauseReasons.delete(reason);
  updateMasterGain();
}

export function startStageAudio(phase = 'day') {
  stageActive = true;
  setAudioPhase(phase, { immediate: true });
  if (ctx) startMusicClock();
}

export function stopStageAudio() {
  stageActive = false;
  if (musicTimer) {
    window.clearInterval(musicTimer);
    musicTimer = null;
  }
  if (ctx) {
    ramp(musicGain?.gain, 0, 0.35);
    ramp(ambienceGain?.gain, 0, 0.5);
  }
}

export function setAudioPhase(phase, opts = {}) {
  const next = phaseKeyOf(phase);
  const changed = next !== stageKey;
  stageKey = next;
  if (!ctx) return;
  ensureAmbience();
  applyStageTone(!!opts.immediate);
  if (stageActive) startMusicClock();
  if (opts.accent && changed) phaseSting(next);
}

function ensureAmbience() {
  const c = ac(false);
  if (!c || ambience) return;

  const drone = c.createOscillator();
  const fifth = c.createOscillator();
  const droneGain = c.createGain();
  const fifthGain = c.createGain();
  drone.type = 'sine';
  fifth.type = 'triangle';
  droneGain.gain.value = 0;
  fifthGain.gain.value = 0;
  drone.connect(droneGain).connect(ambienceGain);
  fifth.connect(fifthGain).connect(ambienceGain);
  drone.start();
  fifth.start();

  const noiseSrc = c.createBufferSource();
  const noiseFilter = c.createBiquadFilter();
  const noiseGain = c.createGain();
  noiseSrc.buffer = noiseBuffer(c);
  noiseSrc.loop = true;
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.value = 1200;
  noiseFilter.Q.value = 0.55;
  noiseGain.gain.value = 0;
  noiseSrc.connect(noiseFilter).connect(noiseGain).connect(ambienceGain);
  noiseSrc.start();

  ambience = { drone, fifth, droneGain, fifthGain, noiseFilter, noiseGain };
}

function applyStageTone(immediate = false) {
  if (!ctx || !ambience) return;
  const p = PHASE_AUDIO[stageKey] || PHASE_AUDIO.day;
  const dur = immediate ? 0.08 : 1.6;
  const now = ctx.currentTime;
  ambience.drone.frequency.cancelScheduledValues(now);
  ambience.fifth.frequency.cancelScheduledValues(now);
  ambience.noiseFilter.frequency.cancelScheduledValues(now);
  ambience.drone.frequency.setValueAtTime(Math.max(20, ambience.drone.frequency.value), now);
  ambience.fifth.frequency.setValueAtTime(Math.max(20, ambience.fifth.frequency.value), now);
  ambience.noiseFilter.frequency.setValueAtTime(Math.max(80, ambience.noiseFilter.frequency.value), now);
  ambience.drone.frequency.exponentialRampToValueAtTime(Math.max(20, p.root / 2), now + dur);
  ambience.fifth.frequency.exponentialRampToValueAtTime(Math.max(20, p.root * 0.75), now + dur);
  ambience.noiseFilter.frequency.exponentialRampToValueAtTime(Math.max(80, p.noiseFreq), now + dur);
  ramp(ambience.droneGain.gain, stageActive ? p.droneVol : 0, dur);
  ramp(ambience.fifthGain.gain, stageActive ? p.fifthVol : 0, dur);
  ramp(ambience.noiseGain.gain, stageActive ? p.noiseVol : 0, dur);
  ramp(ambienceGain.gain, stageActive ? p.ambienceVol : 0, dur);
  ramp(musicGain.gain, stageActive ? p.musicVol : 0, dur);
  if (!nextBeatTime || nextBeatTime < now) nextBeatTime = now + 0.12;
  else nextBeatTime = Math.min(nextBeatTime, now + 0.12);
}

function startMusicClock() {
  const c = ac(false);
  if (!c || musicTimer || !stageActive) return;
  nextBeatTime = c.currentTime + 0.08;
  beatStep = 0;
  scheduleMusic();
  musicTimer = window.setInterval(scheduleMusic, 160);
}

function scheduleMusic() {
  const c = ac(false);
  if (!c || !stageActive) return;
  const p = PHASE_AUDIO[stageKey] || PHASE_AUDIO.day;
  const beatDur = 60 / p.tempo / 2;
  if (nextBeatTime < c.currentTime - 0.5) nextBeatTime = c.currentTime + 0.05;
  while (nextBeatTime < c.currentTime + 0.45) {
    scheduleBeat(nextBeatTime, beatStep, p);
    nextBeatTime += beatDur;
    beatStep++;
  }
}

function note(root, semi) {
  return root * Math.pow(2, semi / 12);
}

function pluckAt(freq, t0, dur, type, vol, bus = musicGain) {
  const c = ac(false);
  if (!c || muted || audioPaused()) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(bus);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

function noiseAt(t0, dur, vol, bus = musicGain) {
  const c = ac(false);
  if (!c || muted || audioPaused()) return;
  const src = c.createBufferSource();
  const g = c.createGain();
  const buf = noiseBuffer(c);
  src.buffer = buf;
  g.gain.setValueAtTime(Math.max(0.0001, vol), t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(g).connect(bus);
  src.start(t0, Math.random() * Math.max(0.001, buf.duration - dur), dur);
}

function scheduleBeat(t0, step, p) {
  if (muted || audioPaused()) return;
  const leadSemi = p.pattern[step % p.pattern.length];
  if (leadSemi != null && step % 2 === 0) {
    pluckAt(note(p.root, leadSemi + 12), t0, 0.22, p.lead, stageKey === 'blood' ? 0.06 : 0.045);
  }
  const bassSemi = p.bass[step % p.bass.length];
  if (bassSemi != null && step % 4 === 0) {
    pluckAt(note(p.root, bassSemi), t0, 0.36, 'sine', stageKey === 'blood' ? 0.08 : 0.055);
  }
  if (stageKey === 'blood' && step % 8 === 4) noiseAt(t0, 0.09, 0.018);
}

function phaseSting(key) {
  const p = PHASE_AUDIO[key] || PHASE_AUDIO.day;
  const semis = key === 'blood' ? [-12, -6, -13] : key === 'night' ? [7, 3, 0] : [0, 5, 7, 12];
  semis.forEach((s, i) => pluckAt(note(p.root, s + 12), (ctx?.currentTime || 0) + i * 0.08, 0.28, p.lead, 0.16, sfxGain));
  if (key === 'blood') noise({ dur: 0.28, vol: 0.12, delay: 0.04 });
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', updateMasterGain);
}

if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  window.__audioDebug = () => ({
    context: ctx?.state || 'none',
    fetched: rawSfxAssets.size,
    decoded: decodedSfxAssets.size,
    expected: SFX_ASSETS.length,
    combatVoices: activeCombatVoices,
    stageActive,
    muted,
    paused: audioPaused(),
  });
}

function tone({
  freq = 440, end = null, dur = 0.15, type = 'sine', vol = 0.25, delay = 0,
  attack = 0.003, detune = 0, filterType = '', filterFreq = 0, q = 0.7,
}) {
  const c = ac();
  if (!c || muted || audioPaused()) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.detune.value = detune;
  o.frequency.setValueAtTime(freq, t0);
  if (end) o.frequency.exponentialRampToValueAtTime(end, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), t0 + Math.min(attack, dur * 0.35));
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  if (filterType && filterFreq > 0) {
    const filter = c.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    filter.Q.value = q;
    o.connect(filter).connect(g).connect(sfxGain || c.destination);
  } else {
    o.connect(g).connect(sfxGain || c.destination);
  }
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise({
  dur = 0.08, vol = 0.15, delay = 0, attack = 0.001,
  filterType = '', filterFreq = 0, q = 0.7,
}) {
  const c = ac();
  if (!c || muted || audioPaused()) return;
  const t0 = c.currentTime + delay;
  const src = c.createBufferSource();
  const buf = noiseBuffer(c);
  src.buffer = buf;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), t0 + Math.min(attack, dur * 0.25));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  if (filterType && filterFreq > 0) {
    const filter = c.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    filter.Q.value = q;
    src.connect(filter).connect(g).connect(sfxGain || c.destination);
  } else {
    src.connect(g).connect(sfxGain || c.destination);
  }
  src.start(t0, Math.random() * Math.max(0.001, buf.duration - dur), dur);
}

function duckMusic(level = 0.56, hold = 0.22, release = 0.5) {
  if (!ctx || !musicGain || !stageActive || muted || audioPaused()) return;
  const p = PHASE_AUDIO[stageKey] || PHASE_AUDIO.day;
  const now = ctx.currentTime;
  const current = Math.max(0.0001, musicGain.gain.value || p.musicVol);
  musicGain.gain.cancelScheduledValues(now);
  musicGain.gain.setValueAtTime(current, now);
  musicGain.gain.linearRampToValueAtTime(p.musicVol * level, now + 0.035);
  musicGain.gain.setValueAtTime(p.musicVol * level, now + hold);
  musicGain.gain.linearRampToValueAtTime(p.musicVol, now + hold + release);
}

// 高频事件节流：割草每秒上百次命中，音效必须限流（毫秒）
const lastPlay = {};
function throttled(key, ms) {
  const now = performance.now();
  if (lastPlay[key] && now - lastPlay[key] < ms) return true;
  lastPlay[key] = now;
  return false;
}

// 击杀声 8 连击内音高递增（GDD §7：割草爽感的一半在这）
const SCALE = [0, 2, 4, 5, 7, 9, 11, 12];

export const Sfx = {
  shoot() {
    if (throttled('shoot', 90)) return;
    tone({ freq: 620, end: 340, dur: 0.05, type: 'triangle', vol: 0.035 });
  },
  weaponCast(key) {
    const family = weaponFamilyOf(key);
    // 毒瓶、瘟疫、腐蚀暂不播放武器音效，等待质量达标的新素材。
    if (family === 'poison') return;
    const castGap = WEAPON_CAST_GAP_MS[key] || 150;
    if (throttled(`weapon-cast-${key}`, castGap)) return;
    if (throttled('weapon-cast-global', 60)) return;
    if (playSample(`weapon-${family}-cast`, {
      vol: family === 'holy' ? 0.32 : family === 'fire' ? 0.36 : 0.39,
      rate: 0.975 + Math.random() * 0.05,
      combat: true,
      maxDur: family === 'holy' ? 0.24 : 0.2,
    })) return;
    const detune = (Math.random() - 0.5) * 34;
    switch (family) {
      case 'fire':
        noise({ dur: 0.065, vol: 0.028, filterType: 'bandpass', filterFreq: 2200, q: 0.7 });
        tone({ freq: 680, end: 280, dur: 0.09, type: 'triangle', vol: 0.026, detune, filterType: 'highpass', filterFreq: 180 });
        break;
      case 'ice':
        noise({ dur: 0.095, vol: 0.035, attack: 0.018, filterType: 'highpass', filterFreq: 3200 });
        tone({ freq: 1568, end: 1046, dur: 0.13, type: 'triangle', vol: 0.046, detune });
        tone({ freq: 2349, dur: 0.055, type: 'sine', vol: 0.025, delay: 0.018, detune: -detune });
        break;
      case 'lightning':
        noise({ dur: 0.045, vol: 0.058, filterType: 'bandpass', filterFreq: 3600, q: 1.8 });
        tone({ freq: 1380, end: 190, dur: 0.07, type: 'sawtooth', vol: 0.052, detune, filterType: 'highpass', filterFreq: 260 });
        tone({ freq: 92, end: 58, dur: 0.12, type: 'sine', vol: 0.034, delay: 0.012 });
        break;
      case 'poison':
        tone({ freq: 1320, end: 980, dur: 0.055, type: 'triangle', vol: 0.039, detune });
        tone({ freq: 390, end: 185, dur: 0.13, type: 'sine', vol: 0.043, delay: 0.018, detune: -detune });
        noise({ dur: 0.075, vol: 0.029, delay: 0.02, filterType: 'lowpass', filterFreq: 760 });
        break;
      case 'holy':
        tone({ freq: 784, dur: 0.19, type: 'sine', vol: 0.043, detune });
        tone({ freq: 1175, dur: 0.16, type: 'sine', vol: 0.031, delay: 0.025, detune: -detune });
        tone({ freq: 1568, dur: 0.11, type: 'triangle', vol: 0.021, delay: 0.05 });
        break;
      default:
        noise({ dur: 0.055, vol: 0.034, filterType: 'bandpass', filterFreq: 2700, q: 1.1 });
        tone({ freq: 1180, end: 430, dur: 0.075, type: 'triangle', vol: 0.045, detune, filterType: 'highpass', filterFreq: 320 });
        break;
    }
  },
  weaponImpact(key, weight = 'light') {
    const family = weaponFamilyOf(key);
    if (family === 'poison') return;
    const heavy = weight === 'heavy';
    if (throttled(`weapon-impact-${family}`, heavy ? 135 : 115)) return;
    if (throttled('weapon-impact-global', heavy ? 82 : 92)) return;
    if (playSample(`weapon-${family}-impact`, {
      vol: heavy ? 0.52 : 0.3,
      rate: (heavy ? 0.96 : 1.025) + (Math.random() - 0.5) * 0.045,
      combat: true,
      importance: heavy ? 'heavy' : 'normal',
      maxDur: heavy ? 0.24 : 0.14,
    })) return;
    const scale = heavy ? 1.45 : 1;
    switch (family) {
      case 'fire':
        noise({ dur: heavy ? 0.11 : 0.05, vol: 0.038 * scale, filterType: 'bandpass', filterFreq: heavy ? 1300 : 2100, q: 0.65 });
        tone({ freq: heavy ? 330 : 440, end: heavy ? 125 : 210, dur: heavy ? 0.14 : 0.07, type: 'triangle', vol: 0.03 * scale, filterType: 'highpass', filterFreq: 95 });
        break;
      case 'ice':
        noise({ dur: heavy ? 0.14 : 0.055, vol: 0.042 * scale, filterType: 'highpass', filterFreq: 3900 });
        [1760, 2217, 2637].slice(0, heavy ? 3 : 2).forEach((f, i) =>
          tone({ freq: f, end: f * 0.82, dur: 0.08 + i * 0.025, type: 'triangle', vol: 0.026 * scale, delay: i * 0.012 }));
        break;
      case 'lightning':
        noise({ dur: heavy ? 0.11 : 0.04, vol: 0.055 * scale, filterType: 'bandpass', filterFreq: 4300, q: 1.5 });
        tone({ freq: 720, end: 82, dur: heavy ? 0.16 : 0.065, type: 'square', vol: 0.038 * scale, filterType: 'highpass', filterFreq: 240 });
        break;
      case 'poison':
        noise({ dur: heavy ? 0.13 : 0.055, vol: 0.042 * scale, filterType: 'lowpass', filterFreq: 680 });
        tone({ freq: heavy ? 260 : 410, end: 115, dur: heavy ? 0.18 : 0.09, type: 'sine', vol: 0.048 * scale });
        if (heavy) tone({ freq: 1680, end: 920, dur: 0.07, type: 'triangle', vol: 0.038, delay: 0.01 });
        break;
      case 'holy':
        tone({ freq: 1046, dur: heavy ? 0.24 : 0.11, type: 'sine', vol: 0.04 * scale });
        tone({ freq: 1568, dur: heavy ? 0.19 : 0.08, type: 'sine', vol: 0.027 * scale, delay: 0.018 });
        break;
      default:
        noise({ dur: heavy ? 0.105 : 0.035, vol: 0.046 * scale, filterType: 'bandpass', filterFreq: heavy ? 1350 : 2400, q: 1 });
        tone({ freq: heavy ? 260 : 520, end: heavy ? 95 : 260, dur: heavy ? 0.16 : 0.065, type: 'triangle', vol: 0.044 * scale });
        break;
    }
  },
  hit() {
    if (throttled('hit', 70)) return;
    noise({ dur: 0.028, vol: 0.038, filterType: 'bandpass', filterFreq: 2100 });
  },
  kill(combo = 0) {
    if (throttled('kill', 65)) return;
    const semi = SCALE[Math.min(7, Math.max(0, combo - 1)) % SCALE.length];
    const f = 392 * Math.pow(2, semi / 12);
    noise({ dur: 0.026, vol: 0.034, filterType: 'bandpass', filterFreq: 1900 });
    tone({ freq: f, dur: 0.075, type: 'square', vol: 0.04 });
    tone({ freq: f * 1.5, dur: 0.06, type: 'sine', vol: 0.027, delay: 0.018 });
  },
  gem() {
    if (throttled('gem', 85)) return;
    const f = 1046 + Math.random() * 240;
    tone({ freq: f, end: f * 1.3, dur: 0.052, type: 'sine', vol: 0.036 });
  },
  chest() {
    [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.18, type: 'triangle', vol: 0.17, delay: i * 0.07 }));
  },
  evolve() {
    [392, 523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.28, type: 'sawtooth', vol: 0.12, delay: i * 0.08 }));
  },
  revive() {
    [220, 330, 440, 660].forEach((f, i) => tone({ freq: f, end: f * 1.1, dur: 0.22, type: 'triangle', vol: 0.16, delay: i * 0.09 }));
  },
  bloodMoon() {
    noise({ dur: 0.32, vol: 0.16 });
    [110, 82, 123].forEach((f, i) => tone({ freq: f, dur: 0.5, type: 'sawtooth', vol: 0.16, delay: i * 0.12 }));
  },
  levelup() {
    [0, 4, 7, 12].forEach((s, i) => tone({ freq: 523 * Math.pow(2, s / 12), dur: 0.16, type: 'triangle', vol: 0.24, delay: i * 0.055 }));
  },
  choose() { tone({ freq: 440, end: 660, dur: 0.1, type: 'triangle', vol: 0.18 }); },
  hurt() {
    if (throttled('hurt', 220)) return;
    noise({ dur: 0.07, vol: 0.14 });
    tone({ freq: 210, end: 120, dur: 0.14, type: 'sawtooth', vol: 0.14 });
  },
  boom() {
    if (throttled('boom', 110)) return;
    noise({ dur: 0.12, vol: 0.12 });
    tone({ freq: 150, end: 55, dur: 0.22, type: 'sawtooth', vol: 0.11 });
  },
  uiClick() { tone({ freq: 660, dur: 0.06, type: 'triangle', vol: 0.12 }); },
  bossIn(final = false) {
    duckMusic(final ? 0.34 : 0.48, 0.42, 0.85);
    if (playSample('boss-entry', { vol: final ? 0.9 : 0.74, rate: final ? 0.91 : 1 })) return;
    noise({ dur: final ? 0.48 : 0.32, vol: final ? 0.19 : 0.14, filterType: 'lowpass', filterFreq: 520 });
    tone({ freq: final ? 52 : 65, end: 42, dur: final ? 0.85 : 0.6, type: 'sawtooth', vol: final ? 0.34 : 0.27, filterType: 'lowpass', filterFreq: 680 });
    tone({ freq: final ? 78 : 98, end: final ? 58 : 72, dur: 0.5, type: 'sawtooth', vol: final ? 0.25 : 0.19, delay: 0.15, filterType: 'lowpass', filterFreq: 760 });
    if (final) tone({ freq: 196, end: 92, dur: 0.72, type: 'triangle', vol: 0.12, delay: 0.08 });
  },
  bossChargeWarn(final = false, chained = false) {
    if (throttled('boss-charge-warn', chained ? 280 : 420)) return;
    duckMusic(final ? 0.42 : 0.55, 0.2, 0.42);
    if (playSample('boss-charge-warn', { vol: final ? 0.84 : 0.7, rate: chained ? 1.11 : (final ? 0.94 : 1) })) return;
    tone({ freq: final ? 72 : 88, end: final ? 210 : 176, dur: chained ? 0.48 : 0.68, type: 'sawtooth', vol: final ? 0.19 : 0.15, attack: 0.025, filterType: 'lowpass', filterFreq: 780 });
    tone({ freq: 660, end: 990, dur: 0.16, type: 'square', vol: 0.055, delay: chained ? 0.3 : 0.5, filterType: 'bandpass', filterFreq: 1200, q: 1.4 });
  },
  bossChargeStart(final = false) {
    if (throttled('boss-charge-start', 180)) return;
    if (playSample('boss-charge-start', { vol: final ? 0.88 : 0.72, rate: final ? 0.93 : 1 })) return;
    noise({ dur: 0.12, vol: final ? 0.16 : 0.12, filterType: 'lowpass', filterFreq: 900 });
    tone({ freq: final ? 95 : 120, end: 48, dur: 0.2, type: 'sawtooth', vol: final ? 0.19 : 0.145, filterType: 'lowpass', filterFreq: 760 });
  },
  bossChargeImpact(final = false) {
    if (throttled('boss-charge-impact', 130)) return;
    if (playSample('boss-charge-impact', { vol: final ? 0.94 : 0.78, rate: final ? 0.9 : 1 })) return;
    noise({ dur: 0.2, vol: final ? 0.2 : 0.155, filterType: 'lowpass', filterFreq: 820 });
    tone({ freq: final ? 105 : 130, end: 38, dur: 0.3, type: 'sawtooth', vol: final ? 0.22 : 0.17, filterType: 'lowpass', filterFreq: 650 });
  },
  bossFireballWarn(final = false) {
    if (throttled('boss-fireball-warn', 260)) return;
    duckMusic(final ? 0.48 : 0.6, 0.14, 0.34);
    if (playSample('boss-fireball-warn', { vol: final ? 0.82 : 0.68, rate: final ? 0.94 : 1 })) return;
    tone({ freq: final ? 135 : 165, end: final ? 610 : 520, dur: 0.5, type: 'sawtooth', vol: final ? 0.13 : 0.105, attack: 0.035, filterType: 'lowpass', filterFreq: 1250 });
    noise({ dur: 0.42, vol: 0.045, attack: 0.16, filterType: 'bandpass', filterFreq: 980, q: 0.9 });
  },
  bossFireball(final = false) {
    if (throttled('boss-fireball', 120)) return;
    if (playSample('boss-fireball-cast', { vol: final ? 0.88 : 0.72, rate: final ? 0.93 : 1 })) return;
    noise({ dur: 0.13, vol: final ? 0.13 : 0.1, filterType: 'lowpass', filterFreq: 1450 });
    tone({ freq: final ? 240 : 285, end: 72, dur: 0.2, type: 'sawtooth', vol: final ? 0.145 : 0.11, filterType: 'lowpass', filterFreq: 1150 });
  },
  bossFireballImpact(final = false) {
    if (throttled('boss-fireball-impact', 120)) return;
    if (playSample('boss-fireball-impact', { vol: final ? 0.94 : 0.78, rate: final ? 0.9 : 1 })) return;
    noise({ dur: 0.18, vol: final ? 0.2 : 0.16, filterType: 'lowpass', filterFreq: 980 });
    tone({ freq: final ? 132 : 158, end: 42, dur: 0.28, type: 'sawtooth', vol: final ? 0.22 : 0.175, filterType: 'lowpass', filterFreq: 760 });
  },
  bossRoar(final = false) {
    if (throttled('boss-roar', 900)) return;
    duckMusic(0.38, 0.45, 0.75);
    if (playSample('boss-roar', { vol: final ? 0.96 : 0.82, rate: final ? 0.9 : 1 })) return;
    noise({ dur: 0.48, vol: final ? 0.2 : 0.17, attack: 0.025, filterType: 'lowpass', filterFreq: 620, q: 1.2 });
    tone({ freq: final ? 76 : 92, end: 48, dur: 0.58, type: 'sawtooth', vol: final ? 0.24 : 0.2, attack: 0.018, filterType: 'lowpass', filterFreq: 720 });
    tone({ freq: 138, end: 62, dur: 0.42, type: 'square', vol: 0.08, delay: 0.055, filterType: 'lowpass', filterFreq: 540 });
  },
  bossMirrorWarn(key) {
    if (throttled('boss-mirror-warn', 260)) return;
    duckMusic(0.48, 0.12, 0.3);
    const sampled = playSample('boss-mirror-warn', { vol: 0.8 });
    Sfx.weaponCast(key);
    if (sampled) return;
    tone({ freq: 330, end: 880, dur: 0.36, type: 'triangle', vol: 0.11, attack: 0.025 });
    tone({ freq: 165, end: 110, dur: 0.38, type: 'sawtooth', vol: 0.08, filterType: 'lowpass', filterFreq: 620 });
  },
  bossSummon(final = false) {
    if (throttled('boss-summon', 500)) return;
    duckMusic(0.5, 0.18, 0.38);
    if (playSample('boss-summon', { vol: final ? 0.9 : 0.74, rate: final ? 0.92 : 1 })) return;
    [0, 3, 7].forEach((semi, i) => tone({
      freq: (final ? 110 : 138) * Math.pow(2, semi / 12), end: final ? 72 : 92,
      dur: 0.34, type: 'triangle', vol: final ? 0.105 : 0.08, delay: i * 0.045,
    }));
    noise({ dur: 0.22, vol: final ? 0.12 : 0.085, filterType: 'bandpass', filterFreq: 720, q: 1.2 });
  },
  victory() { [392, 523, 659, 784, 1046, 1318].forEach((f, i) => tone({ freq: f, dur: 0.32, type: 'triangle', vol: 0.18, delay: i * 0.09 })); },
  gameOver() { [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, dur: 0.3, type: 'triangle', vol: 0.22, delay: i * 0.18 })); },
};
