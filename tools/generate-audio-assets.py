"""Generate the original Horde Breaker commercial SFX pack.

The sounds are synthesized offline from deterministic oscillators/noise. No third-party
samples are used, so the generated files are safe to ship with the game.
"""

from __future__ import annotations

import math
import wave
from pathlib import Path

import numpy as np
from scipy import signal


SR = 44_100
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "audio" / "sfx"
RNG = np.random.default_rng(0x484F524445)


def timeline(duration: float) -> np.ndarray:
    return np.arange(max(1, int(SR * duration)), dtype=np.float64) / SR


def curve(points: list[tuple[float, float]], duration: float) -> np.ndarray:
    t = timeline(duration)
    xp = np.array([p[0] for p in points]) * duration
    fp = np.array([p[1] for p in points])
    return np.interp(t, xp, fp)


def osc(freq: float | np.ndarray, duration: float, kind: str = "sine", phase: float = 0.0) -> np.ndarray:
    t = timeline(duration)
    f = np.full_like(t, float(freq)) if np.isscalar(freq) else np.asarray(freq)[: len(t)]
    angle = phase + 2 * np.pi * np.cumsum(f) / SR
    if kind == "triangle":
        return 2 / np.pi * np.arcsin(np.sin(angle))
    if kind == "saw":
        return 2 * ((angle / (2 * np.pi) + 0.5) % 1) - 1
    if kind == "square":
        return np.sign(np.sin(angle))
    return np.sin(angle)


def chirp(start: float, end: float, duration: float, kind: str = "sine") -> np.ndarray:
    return osc(np.geomspace(max(1, start), max(1, end), len(timeline(duration))), duration, kind)


def env(duration: float, attack: float = 0.004, hold: float = 0.0, release: float = 0.12,
        power: float = 1.8) -> np.ndarray:
    n = len(timeline(duration))
    a = min(n, max(1, int(attack * SR)))
    h = min(n - a, max(0, int(hold * SR)))
    r = max(1, n - a - h)
    out = np.empty(n)
    out[:a] = np.linspace(0, 1, a, endpoint=False) ** 0.65
    out[a:a + h] = 1
    out[a + h:] = np.linspace(1, 0, r) ** power
    return out


def noise(duration: float, filter_type: str = "bandpass", cutoff: float | tuple[float, float] = (300, 5000),
          order: int = 3) -> np.ndarray:
    x = RNG.normal(0, 1, len(timeline(duration)))
    nyq = SR * 0.5
    if filter_type == "bandpass":
        lo, hi = cutoff  # type: ignore[misc]
        wn = (max(20, lo) / nyq, min(nyq - 100, hi) / nyq)
        sos = signal.butter(order, wn, btype="bandpass", output="sos")
    elif filter_type == "highpass":
        sos = signal.butter(order, float(cutoff) / nyq, btype="highpass", output="sos")
    else:
        sos = signal.butter(order, float(cutoff) / nyq, btype="lowpass", output="sos")
    return signal.sosfilt(sos, x)


def highpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    sos = signal.butter(3, cutoff / (SR * 0.5), btype="highpass", output="sos")
    return signal.sosfilt(sos, x)


def delayed(x: np.ndarray, seconds: float, length: int) -> np.ndarray:
    out = np.zeros(length)
    start = int(seconds * SR)
    end = min(length, start + len(x))
    if end > start:
        out[start:end] += x[:end - start]
    return out


def shimmer(duration: float, notes: list[float], decay: float = 0.28) -> np.ndarray:
    t = timeline(duration)
    out = np.zeros_like(t)
    for index, freq in enumerate(notes):
        partial = osc(freq, duration, "sine", RNG.random() * np.pi * 2)
        partial += 0.33 * osc(freq * 2.01, duration, "sine")
        partial += 0.16 * osc(freq * 3.98, duration, "sine")
        out += partial * np.exp(-t / (decay * (1 + index * 0.08))) / (1 + index * 0.18)
    return out / max(1, len(notes))


def room(x: np.ndarray, amount: float = 0.1, size: float = 0.16) -> np.ndarray:
    n = max(64, int(size * SR))
    ir_t = np.arange(n) / SR
    ir = RNG.normal(0, 1, n) * np.exp(-ir_t / max(0.02, size * 0.23))
    ir[0] += 4
    wet = signal.fftconvolve(x, ir, mode="full")[: len(x)]
    wet /= max(1e-9, np.max(np.abs(wet)))
    return x * (1 - amount) + wet * amount


def master(x: np.ndarray, peak_db: float = -4.5, drive: float = 1.35, hp: float = 38) -> np.ndarray:
    x = np.nan_to_num(x.astype(np.float64))
    x -= np.mean(x)
    sos = signal.butter(2, hp / (SR * 0.5), btype="highpass", output="sos")
    x = signal.sosfilt(sos, x)
    x = np.tanh(x * drive) / np.tanh(drive)
    fade = min(len(x) // 4, int(0.008 * SR))
    if fade:
        x[:fade] *= np.linspace(0, 1, fade)
        x[-fade:] *= np.linspace(1, 0, fade)
    peak = np.max(np.abs(x)) or 1
    return x / peak * (10 ** (peak_db / 20))


def write(name: str, x: np.ndarray, peak_db: float = -4.5) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    mastered = master(x, peak_db=peak_db)
    pcm = np.clip(mastered * 32767, -32768, 32767).astype("<i2")
    with wave.open(str(OUT / f"{name}.wav"), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SR)
        wav.writeframes(pcm.tobytes())


def blade_cast() -> np.ndarray:
    d = 0.19
    whoosh = noise(d, "bandpass", (650, 7800)) * curve([(0, 0), (.12, .4), (.34, 1), (1, 0)], d)
    metal = shimmer(d, [1180, 1770, 2460], .06) * env(d, .002, 0, .12, 2.7)
    return room(whoosh * .55 + metal * .75, .05, .08)


def blade_impact() -> np.ndarray:
    d = 0.18
    hit = noise(d, "bandpass", (900, 9000)) * env(d, .001, .004, .15, 3)
    ring = shimmer(d, [760, 1210, 2130, 3410], .09) * env(d, .001, 0, .16, 2.5)
    body = chirp(310, 150, d, "triangle") * env(d, .001, 0, .09)
    return hit * .62 + ring * .7 + body * .28


def fire_cast() -> np.ndarray:
    d = 0.21
    # 火系以中高频燃烧瞬态为主体；不再用持续的低频锯齿下扫压住整个混音。
    air = noise(d, "bandpass", (520, 5200)) * curve([(0, 0), (.08, .75), (.28, 1), (1, 0)], d)
    core = chirp(780, 280, d, "triangle") * env(d, .003, 0, .17, 2.8)
    crackle = noise(d, "highpass", 3200) * (RNG.random(len(timeline(d))) > .968) * env(d, .003, 0, .16, 3.5)
    return room(highpass(air * .58 + core * .26 + crackle * .38, 150), .045, .09)


def fire_impact() -> np.ndarray:
    d = 0.29
    punch = chirp(310, 115, d, "sine") * env(d, .001, .006, .22, 3.2)
    burst = noise(d, "bandpass", (260, 3900)) * env(d, .001, .006, .23, 3.5)
    grit = noise(d, "highpass", 2400) * env(d, .001, 0, .12, 4.2)
    spark = shimmer(d, [920, 1380, 2070], .055) * env(d, .001, 0, .13, 3.5)
    return room(highpass(punch * .38 + burst * .68 + grit * .2 + spark * .22, 105), .06, .12)


def ice_cast() -> np.ndarray:
    d = 0.34
    air = noise(d, "highpass", 2600) * curve([(0, 0), (.42, .8), (.7, 1), (1, 0)], d)
    crystal = shimmer(d, [1046, 1568, 2093, 3136], .18) * env(d, .012, 0, .3, 2.4)
    sweep = chirp(1900, 620, d, "triangle") * env(d, .008, 0, .2)
    return room(air * .32 + crystal * .75 + sweep * .22, .17, .28)


def ice_impact() -> np.ndarray:
    d = 0.32
    shard = noise(d, "highpass", 3500) * env(d, .001, .003, .23, 3.3)
    out = shard * .44
    for i, f in enumerate([1320, 1760, 2349, 3136, 3951]):
        ping_d = d - i * .018
        ping = osc(f * (1 + RNG.uniform(-.012, .012)), ping_d, "triangle") * env(ping_d, .001, 0, ping_d - .006, 3)
        out += delayed(ping * (.31 / (1 + i * .17)), i * .018, len(out))
    return room(out, .2, .31)


def lightning_cast() -> np.ndarray:
    d = 0.22
    crack = noise(d, "bandpass", (1400, 11_000)) * env(d, .001, .002, .09, 4)
    buzz_freq = 520 + 260 * np.sin(2 * np.pi * 47 * timeline(d))
    buzz = osc(buzz_freq, d, "square") * env(d, .001, 0, .16, 2.8)
    zap = chirp(3200, 130, d, "saw") * env(d, .001, 0, .08, 3)
    return crack * .72 + buzz * .16 + zap * .3


def lightning_impact() -> np.ndarray:
    d = 0.34
    snap = noise(d, "highpass", 2500) * env(d, .001, .003, .11, 4)
    thunder = noise(d, "bandpass", (70, 900)) * env(d, .003, .015, .3, 2.4)
    sub = chirp(145, 46, d) * env(d, .001, .018, .31, 2.5)
    return room(snap * .55 + thunder * .7 + sub * .68, .1, .2)


def poison_cast() -> np.ndarray:
    d = 0.34
    glass = shimmer(d, [1280, 1920, 2870], .08) * env(d, .001, 0, .13, 3)
    liquid = noise(d, "bandpass", (120, 760)) * curve([(0, 0), (.12, 1), (.58, .45), (1, 0)], d)
    glug = (osc(240 + 55 * np.sin(2 * np.pi * 9 * timeline(d)), d) * env(d, .012, .03, .27, 2.4))
    return room(glass * .57 + liquid * .72 + glug * .34, .08, .16)


def poison_impact() -> np.ndarray:
    d = 0.46
    splat = noise(d, "bandpass", (90, 1100)) * env(d, .001, .025, .39, 2.8)
    glass = noise(d, "highpass", 4200) * env(d, .001, 0, .14, 4)
    bubbles = np.zeros_like(timeline(d))
    for i in range(7):
        start = .05 + i * .043 + RNG.uniform(0, .018)
        bd = min(.09, d - start)
        bubble = chirp(170 + i * 21, 330 + i * 27, bd) * env(bd, .002, 0, bd - .004, 2.5)
        bubbles += delayed(bubble * (.19 - i * .012), start, len(bubbles))
    return room(splat * .74 + glass * .22 + bubbles, .14, .22)


def holy_cast() -> np.ndarray:
    d = 0.52
    bell = shimmer(d, [523.25, 784.88, 1046.5, 1567.98], .34) * env(d, .005, 0, .49, 2.2)
    air = noise(d, "highpass", 5000) * curve([(0, 0), (.2, .42), (.48, 1), (1, 0)], d)
    return room(bell * .88 + air * .17, .28, .46)


def holy_impact() -> np.ndarray:
    d = 0.38
    chime = shimmer(d, [784.88, 1174.66, 1567.98, 2093], .25) * env(d, .002, 0, .36, 2.5)
    sparkle = noise(d, "highpass", 6200) * env(d, .001, 0, .17, 3.8)
    body = chirp(390, 210, d, "sine") * env(d, .002, 0, .23)
    return room(chime * .82 + sparkle * .18 + body * .22, .24, .4)


def boss_entry() -> np.ndarray:
    d = 1.2
    sub = chirp(92, 35, d) * env(d, .004, .12, 1.0, 2.1)
    braam = (osc(58, d, "saw") + .5 * osc(87, d, "saw") + .25 * osc(116, d, "square")) * env(d, .018, .13, 1.0, 2.4)
    dirt = noise(d, "bandpass", (45, 1100)) * env(d, .002, .08, 1.08, 2.7)
    return room(sub * .9 + braam * .34 + dirt * .48, .22, .58)


def boss_charge_warn() -> np.ndarray:
    d = 0.82
    freq = np.geomspace(82, 270, len(timeline(d))) * (1 + .045 * np.sin(2 * np.pi * 8 * timeline(d)))
    rise = osc(freq, d, "saw") * env(d, .018, .06, .72, 1.3)
    pulse = osc(740, d, "square") * (np.sin(2 * np.pi * np.geomspace(3, 13, len(timeline(d))) * timeline(d)) > .72) * env(d, .03, 0, .7)
    air = noise(d, "bandpass", (120, 1500)) * curve([(0, 0), (.65, .45), (1, 1)], d)
    return room(rise * .53 + pulse * .12 + air * .32, .08, .18)


def boss_charge_start() -> np.ndarray:
    d = 0.31
    rush = noise(d, "bandpass", (70, 2400)) * curve([(0, .2), (.12, 1), (1, 0)], d)
    body = chirp(180, 48, d, "saw") * env(d, .001, .012, .28, 2.7)
    return room(rush * .68 + body * .68, .08, .16)


def boss_charge_impact() -> np.ndarray:
    d = 0.58
    sub = chirp(130, 34, d) * env(d, .001, .025, .54, 2.4)
    slam = noise(d, "bandpass", (45, 1250)) * env(d, .001, .016, .5, 3)
    crack = noise(d, "highpass", 2200) * env(d, .001, 0, .14, 4)
    return room(sub * .95 + slam * .78 + crack * .22, .18, .35)


def boss_fireball_warn() -> np.ndarray:
    d = 0.62
    core = chirp(240, 760, d, "triangle") * env(d, .028, .05, .52, 1.6)
    ember = noise(d, "bandpass", (480, 3300)) * curve([(0, 0), (.3, .3), (1, 1)], d)
    pulse = osc(320, d) * (0.5 + .5 * np.sin(2 * np.pi * 12 * timeline(d))) * env(d, .03, 0, .53)
    return room(highpass(core * .4 + ember * .45 + pulse * .08, 150), .07, .16)


def boss_fireball_cast() -> np.ndarray:
    base = fire_cast()
    return base * .8 + delayed(chirp(150, 44, .31, "saw") * env(.31, .001, .02, .28), 0, len(base)) * .58


def boss_fireball_impact() -> np.ndarray:
    base = fire_impact()
    accent = chirp(360, 130, len(base) / SR) * env(len(base) / SR, .001, .012, len(base) / SR - .018)
    return room(highpass(base + accent * .26, 110), .09, .16)


def boss_roar() -> np.ndarray:
    d = 0.92
    raw = noise(d, "bandpass", (70, 1800))
    formants = np.zeros_like(raw)
    for center, gain in [(170, .9), (360, .55), (710, .34)]:
        sos = signal.butter(2, (center * .72 / (SR / 2), center * 1.28 / (SR / 2)), btype="bandpass", output="sos")
        formants += signal.sosfilt(sos, raw) * gain
    growl = osc(78 + 13 * np.sin(2 * np.pi * 24 * timeline(d)), d, "saw")
    shape = curve([(0, 0), (.07, 1), (.28, .7), (.5, 1), (1, 0)], d)
    return room((formants * 1.8 + growl * .33) * shape, .18, .42)


def boss_mirror_warn() -> np.ndarray:
    d = 0.54
    reverse = shimmer(d, [330, 494, 660, 990], .3)[::-1] * curve([(0, 0), (.72, 1), (1, 0)], d)
    alarm = chirp(280, 920, d, "triangle") * env(d, .025, 0, .46, 1.8)
    low = chirp(160, 86, d, "saw") * env(d, .005, .02, .48)
    return room(reverse * .65 + alarm * .42 + low * .3, .2, .38)


def boss_summon() -> np.ndarray:
    d = 0.7
    chord = shimmer(d, [110, 130.81, 164.81, 220], .5) * env(d, .025, .05, .6, 1.7)
    rise = chirp(75, 310, d, "saw") * env(d, .035, 0, .58, 1.5)
    dust = noise(d, "bandpass", (80, 1400)) * curve([(0, 0), (.58, .42), (1, 0)], d)
    return room(chord * .58 + rise * .3 + dust * .38, .21, .48)


ASSETS = {
    "weapon-blade-cast": blade_cast,
    "weapon-blade-impact": blade_impact,
    "weapon-fire-cast": fire_cast,
    "weapon-fire-impact": fire_impact,
    "weapon-ice-cast": ice_cast,
    "weapon-ice-impact": ice_impact,
    "weapon-lightning-cast": lightning_cast,
    "weapon-lightning-impact": lightning_impact,
    "weapon-poison-cast": poison_cast,
    "weapon-poison-impact": poison_impact,
    "weapon-holy-cast": holy_cast,
    "weapon-holy-impact": holy_impact,
    "boss-entry": boss_entry,
    "boss-charge-warn": boss_charge_warn,
    "boss-charge-start": boss_charge_start,
    "boss-charge-impact": boss_charge_impact,
    "boss-fireball-warn": boss_fireball_warn,
    "boss-fireball-cast": boss_fireball_cast,
    "boss-fireball-impact": boss_fireball_impact,
    "boss-roar": boss_roar,
    "boss-mirror-warn": boss_mirror_warn,
    "boss-summon": boss_summon,
}


def main() -> None:
    for name, make in ASSETS.items():
        peak = -3.5 if name.startswith("boss-") else (-5 if name.endswith("impact") else -6)
        write(name, make(), peak_db=peak)
    total = sum(path.stat().st_size for path in OUT.glob("*.wav"))
    print(f"Generated {len(ASSETS)} original SFX in {OUT} ({total / 1024:.1f} KiB)")


if __name__ == "__main__":
    main()
