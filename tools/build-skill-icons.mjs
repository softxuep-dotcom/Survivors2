// 生成 12 个主动技能的独立图标图集：public/assets/ui/skill-icons-active-v1.webp（4×3，每格 256）。
// 没有生图模型可用，因此以旧图集 skill-icons-atlas-v2.webp 的手绘元素（圆章外框、飞刃、火球、雪花、雷柱）
// 为母版，裁切/旋转/调色后与手写 SVG 图层（渐变、模糊辉光、粒子、运动轨迹）合成；全部随机量使用固定种子，
// 重复运行结果一致：node tools/build-skill-icons.mjs
// 产物：图集 + artifacts/skill-icons/（逐图标 PNG、SVG 图层源、母版裁切、对比联系表、调色板 PNG 预览）。
import sharp from 'sharp';
import { mkdir, rm, writeFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTIVE_SKILL_KEYS, SKILLS } from '../src/config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ATLAS = resolve(ROOT, 'public/assets/ui/skill-icons-atlas-v2.webp');
const OUTPUT_ATLAS = resolve(ROOT, 'public/assets/ui/skill-icons-active-v1.webp');
const ART = resolve(ROOT, 'artifacts/skill-icons');
const TILE = 256;
const SS = 2; // 内部 2 倍超采样，最后 lanczos3 缩回 256
const W = TILE * SS;
const COLS = 4;
const RAW = { width: W, height: W, channels: 4 };
// 旧图集中对应元素的基础技能图标格（联系表对照用）：飞刃/火球/寒霜/雷链/毒瓶/圣光
const OLD_ICON_INDEX = { physical: 0, fire: 1, ice: 2, lightning: 3, poison: 4, light: 5 };

sharp.cache(false);

// ---------- 通用工具 ----------
function rng(seed) { // mulberry32，保证图层随机量可复现
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const rgbOf = c => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const hex = c => `#${(c >>> 0).toString(16).padStart(6, '0')}`;
function mix(a, b, t) {
  const A = rgbOf(a), B = rgbOf(b);
  return (Math.round(A[0] + (B[0] - A[0]) * t) << 16) | (Math.round(A[1] + (B[1] - A[1]) * t) << 8) | Math.round(A[2] + (B[2] - A[2]) * t);
}
const rad = d => d * Math.PI / 180;
const f = n => Number(n.toFixed(2));
const pt = (cx, cy, r, deg) => [cx + Math.cos(rad(deg)) * r, cy + Math.sin(rad(deg)) * r];
const poly = pts => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)},${f(y)}`).join(' ') + ' Z';
const line = pts => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)},${f(y)}`).join(' ');

// SVG 文档：viewBox 固定 256 设计单位，按 W 像素栅格化。滤镜统一用 userSpaceOnUse，避免细线包围盒为 0 时被裁掉。
class Svg {
  constructor(name) { this.name = name; this.defs = []; this.ids = new Set(); this.body = []; this.n = 0; }
  def(id, xml) { if (!this.ids.has(id)) { this.ids.add(id); this.defs.push(xml); } return `url(#${id})`; }
  uid(p) { return `${p}${this.n++}`; }
  blur(sd) {
    const id = `blur${String(sd).replace('.', '_')}`;
    return this.def(id, `<filter id="${id}" filterUnits="userSpaceOnUse" x="-256" y="-256" width="768" height="768"><feGaussianBlur stdDeviation="${sd}"/></filter>`);
  }
  // 湍流位移：让矢量边缘变成手绘的不规则边
  rough(scale, freq = 0.05, seed = 3, oct = 2) {
    const id = `rough${String(scale).replace('.', '_')}_${String(freq).replace('.', '_')}_${seed}`;
    return this.def(id, `<filter id="${id}" filterUnits="userSpaceOnUse" x="-256" y="-256" width="768" height="768"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${oct}" seed="${seed}"/><feDisplacementMap in="SourceGraphic" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/></filter>`);
  }
  roughBlur(scale, sd, freq = 0.05, seed = 3) {
    const id = `rb${String(scale).replace('.', '_')}_${String(sd).replace('.', '_')}_${seed}`;
    return this.def(id, `<filter id="${id}" filterUnits="userSpaceOnUse" x="-256" y="-256" width="768" height="768"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" seed="${seed}"/><feDisplacementMap in="SourceGraphic" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="${sd}"/></filter>`);
  }
  // 手绘颗粒：用分形噪声对图形做 overlay 明暗扰动，再按原 alpha 裁回，弱化矢量的“塑料感”
  paint(seed = 1, amount = 0.45, freq = 0.11) {
    const id = `paint${seed}_${String(amount).replace('.', '_')}_${String(freq).replace('.', '_')}`;
    return this.def(id, `<filter id="${id}" filterUnits="userSpaceOnUse" x="-256" y="-256" width="768" height="768"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="3" seed="${seed}" result="t"/><feColorMatrix in="t" type="matrix" values="0.4 0.4 0.4 0 -0.1  0.4 0.4 0.4 0 -0.1  0.4 0.4 0.4 0 -0.1  0 0 0 0 ${amount}" result="g"/><feBlend in="g" in2="SourceGraphic" mode="overlay" result="b"/><feComposite in="b" in2="SourceGraphic" operator="in"/></filter>`);
  }
  // 填充型烟雾：形状内的分形噪声着色（瘴气/雷云体积感）
  smoke(seed, color, freq = 0.035, gain = 2.2, bias = -0.9) {
    const [r, g, b] = rgbOf(color).map(v => (v / 255).toFixed(3));
    const id = `smk${seed}_${color.toString(16)}_${String(freq).replace('.', '_')}`;
    return this.def(id, `<filter id="${id}" filterUnits="userSpaceOnUse" x="-256" y="-256" width="768" height="768"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="4" seed="${seed}" result="t"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} ${gain} 0 0 0 ${bias}" result="c"/><feComposite in="c" in2="SourceGraphic" operator="in"/></filter>`);
  }
  linear(stops, x1, y1, x2, y2) {
    const id = this.uid('lg');
    this.def(id, `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}">${stopsXml(stops)}</linearGradient>`);
    return `url(#${id})`;
  }
  radial(stops, cx, cy, r, fx = cx, fy = cy) {
    const id = this.uid('rg');
    this.def(id, `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fx="${f(fx)}" fy="${f(fy)}">${stopsXml(stops)}</radialGradient>`);
    return `url(#${id})`;
  }
  add(xml) { this.body.push(xml); return this; }
  toString() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 256 256"><defs>${this.defs.join('')}</defs>${this.body.join('\n')}</svg>`;
  }
}
function stopsXml(stops) {
  return stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${typeof c === 'number' ? hex(c) : c}" stop-opacity="${a}"/>`).join('');
}

// ---------- 旧图集母版 ----------
const atlas = await sharp(SOURCE_ATLAS).removeAlpha().raw().toBuffer({ resolveWithObject: true });
function tileRGB(index) {
  const out = Buffer.alloc(TILE * TILE * 3);
  const ox = (index % 4) * TILE, oy = Math.floor(index / 4) * TILE, aw = atlas.info.width;
  for (let y = 0; y < TILE; y++) atlas.data.copy(out, y * TILE * 3, ((oy + y) * aw + ox) * 3, ((oy + y) * aw + ox + TILE) * 3);
  return out;
}
async function maskRaster(shapes, feather) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" viewBox="0 0 ${TILE} ${TILE}"><rect width="${TILE}" height="${TILE}" fill="#000"/><g fill="#fff">${shapes}</g></svg>`;
  let img = sharp(Buffer.from(svg));
  if (feather >= 0.3) img = img.blur(feather);
  return img.extractChannel(0).raw().toBuffer();
}
// 裁出手绘主体：遮罩 × 亮度键控（暗底自动变透明，深色手柄等仍由遮罩保持不透明）
async function cutout(tile, { mask, feather = 1.2, key = null }) {
  const rgb = tileRGB(tile);
  const m = mask ? await maskRaster(mask, feather) : null;
  const data = Buffer.alloc(TILE * TILE * 4);
  for (let i = 0; i < TILE * TILE; i++) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    let a = 1;
    if (key) a *= smooth(key[0], key[1], Math.max(r, g, b));
    if (m) a *= m[i] / 255;
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = Math.round(a * 255);
  }
  return { data, width: TILE, height: TILE };
}
const toRaw = async img => {
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
};
const fromRaw = p => sharp(p.data, { raw: { width: p.width, height: p.height, channels: 4 } });
// 以 pivot 为中心裁方块 → 缩放(含超采样) → 镜像 → 旋转(顺时针为正) → 调色；pivot 始终位于结果中心
async function xform(src, { pivot, radius, scale = 1, rotate = 0, flop = false, flip = false, adjust = null }) {
  const size = Math.ceil(radius * 2);
  const crop = Buffer.alloc(size * size * 4);
  const x0 = Math.round(pivot[0] - radius), y0 = Math.round(pivot[1] - radius);
  for (let y = 0; y < size; y++) {
    const sy = y0 + y;
    if (sy < 0 || sy >= src.height) continue;
    for (let x = 0; x < size; x++) {
      const sx = x0 + x;
      if (sx < 0 || sx >= src.width) continue;
      src.data.copy(crop, (y * size + x) * 4, (sy * src.width + sx) * 4, (sy * src.width + sx) * 4 + 4);
    }
  }
  let p = { data: crop, width: size, height: size };
  const target = Math.max(2, Math.round(size * scale * SS));
  p = await toRaw(fromRaw(p).resize(target, target, { kernel: 'lanczos3' }));
  if (flop || flip) { let s = fromRaw(p); if (flop) s = s.flop(); if (flip) s = s.flip(); p = await toRaw(s); }
  if (rotate) p = await toRaw(fromRaw(p).rotate(rotate, { background: { r: 0, g: 0, b: 0, alpha: 0 } }));
  if (adjust) p = await toRaw(adjust(fromRaw(p)));
  return p;
}
// 把变换后的部件放到 W×W 透明画布（设计坐标 x,y 为部件中心）
function place(p, x, y, opacity = 1) {
  const out = Buffer.alloc(W * W * 4);
  const left = Math.round(x * SS - p.width / 2), top = Math.round(y * SS - p.height / 2);
  for (let py = 0; py < p.height; py++) {
    const oy = top + py;
    if (oy < 0 || oy >= W) continue;
    for (let px = 0; px < p.width; px++) {
      const ox = left + px;
      if (ox < 0 || ox >= W) continue;
      const si = (py * p.width + px) * 4, di = (oy * W + ox) * 4;
      out[di] = p.data[si]; out[di + 1] = p.data[si + 1]; out[di + 2] = p.data[si + 2];
      out[di + 3] = Math.round(p.data[si + 3] * opacity);
    }
  }
  return out;
}
async function svgLayer(s) {
  return sharp(Buffer.from(s.toString())).ensureAlpha().raw().toBuffer();
}
async function compose(base, layers) {
  if (!layers.length) return base;
  return sharp(base, { raw: RAW })
    .composite(layers.map(l => ({ input: l.data, raw: RAW, blend: l.blend || 'over' })))
    .raw().toBuffer();
}
function mulAlpha(buf, mask) {
  const out = Buffer.from(buf);
  for (let i = 0; i < W * W; i++) out[i * 4 + 3] = Math.round(out[i * 4 + 3] * mask[i] / 255);
  return out;
}

// ---------- 母版部件（旧图集坐标，单位 px@256） ----------
// 飞刃：柄尾 (62,200) → 刃尖 (219,47)，轴向 -44.3°；pivot 取中点
const BLADE = { pivot: [141, 124], radius: 120, axis: -44.3 };
// 火球彗星：球心 (89,165)，尾焰指向 (228,38)，飞行方向 137.6°
const COMET = { pivot: [89, 165], radius: 192, axis: 137.6 };
// 雷柱主体：上尖 (185,28) → 下尖 (72,222)，方向 120.2°
const BOLT = { pivot: [128, 125], radius: 118, axis: 120.2 };
const SOURCES = {};
async function loadSources() {
  SOURCES.blade = await cutout(0, {
    mask: `<path d="${poly([[221, 43], [178, 127], [176, 141], [150, 157], [141, 151], [88, 192], [84, 206], [58, 207], [57, 190], [69, 180], [99, 154], [109, 143], [111, 132], [110, 119], [127, 94]])}"/>`,
    feather: 1.1, key: [16, 46],
  });
  SOURCES.comet = await cutout(1, { mask: '<circle cx="128" cy="128" r="91"/>', feather: 6, key: [10, 34] });
  SOURCES.ball = await cutout(1, { mask: '<circle cx="90" cy="163" r="37"/>', feather: 4, key: [10, 30] });
  // 彗尾单独裁出（挖掉火球本体），竖起来就是一簇手绘火舌
  SOURCES.tail = await cutout(1, { mask: '<circle cx="128" cy="128" r="91"/><circle cx="89" cy="165" r="38" fill="#000"/>', feather: 7, key: [12, 40] });
  SOURCES.snowflake = await cutout(2, { mask: '<circle cx="128" cy="128" r="93"/>', feather: 3, key: [26, 80] });
  SOURCES.bolt = await cutout(3, {
    mask: `<path d="${poly([[192, 22], [110, 72], [90, 134], [126, 126], [62, 230], [86, 230], [152, 140], [174, 98], [142, 104], [162, 60]])}"/>`,
    feather: 2.5, key: [30, 110],
  });
  for (const [name, p] of Object.entries(SOURCES)) {
    await fromRaw(p).png().toFile(resolve(ART, 'sources', `${name}.png`));
  }
}
const blade = (x, y, { dir, scale, opacity = 1, adjust = null }) =>
  xform(SOURCES.blade, { pivot: BLADE.pivot, radius: BLADE.radius, scale, rotate: dir - BLADE.axis, adjust }).then(p => place(p, x, y, opacity));
// 彗星以球心定位：x,y 为火球头部中心
const comet = (x, y, { dir, scale, opacity = 1, adjust = null, src = 'comet' }) =>
  xform(SOURCES[src], { pivot: COMET.pivot, radius: COMET.radius, scale, rotate: dir - COMET.axis, adjust }).then(p => place(p, x, y, opacity));

// 火舌：以彗尾根部 (113,142) 为底点，尾焰方向 -42.4° 旋到竖直向上（lean 为向右偏转角）
const TAIL = { pivot: [113, 142], radius: 158, axis: -42.4 };
const tongue = (x, y, { h, lean = 0, opacity = 1, adjust = null, flop = false }) =>
  xform(SOURCES.tail, { pivot: TAIL.pivot, radius: TAIL.radius, scale: h / 150, rotate: -90 + lean - (flop ? 180 - TAIL.axis : TAIL.axis), flop, adjust })
    .then(p => place(p, x, y, opacity));
// 发光部件的柔光底：同一部件模糊后着色叠加
const glowOf = (color, sigma) => img => img.blur(sigma).tint(rgbObj(color)).modulate({ brightness: 1.6 });
const rgbObj = c => { const [r, g, b] = rgbOf(c); return { r, g, b }; };

// ---------- 圆章：外框取旧图集干净的荆棘环，内底按元素重绘 ----------
const FRAME_RADIUS = 97.5; // 内底遮罩半径（旧图集荆棘环峰值在 r≈100）
async function frameBase(tile, flop) {
  let img = sharp(tileRGB(tile), { raw: { width: TILE, height: TILE, channels: 3 } }).resize(W, W, { kernel: 'lanczos3' });
  if (flop) img = img.flop();
  return img.ensureAlpha().raw().toBuffer();
}
let interiorMask;
async function interiorMaskRaster() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 256 256"><rect width="256" height="256" fill="#000"/><circle cx="128" cy="128" r="${FRAME_RADIUS - 0.8}" fill="#fff"/></svg>`;
  return sharp(Buffer.from(svg)).blur(2.2).extractChannel(0).raw().toBuffer();
}

function background(s, spec) {
  const { tint, seed, glow = 0.3, focus = [128, 128], motes = 'dust' } = spec;
  const r = rng(seed * 7919 + 17);
  const [tr, tg, tb] = rgbOf(tint).map(v => (v / 255).toFixed(3));
  s.add(`<rect width="256" height="256" fill="#020403"/>`);
  s.add(`<circle cx="128" cy="128" r="100" fill="${s.radial([[0, mix(0x040605, tint, glow)], [0.42, mix(0x040605, tint, glow * 0.42)], [0.78, 0x050807], [1, 0x020303]], focus[0], focus[1], 104)}"/>`);
  const smoke = s.def(`smoke${seed}`, `<filter id="smoke${seed}" filterUnits="userSpaceOnUse" x="-256" y="-256" width="768" height="768"><feTurbulence type="fractalNoise" baseFrequency="0.021" numOctaves="4" seed="${seed}"/><feColorMatrix type="matrix" values="0 0 0 0 ${tr} 0 0 0 0 ${tg} 0 0 0 0 ${tb} 1.9 0 0 0 -0.78"/></filter>`);
  const fade = s.uid('fade');
  s.def(fade, `<mask id="${fade}"><circle cx="128" cy="128" r="98" fill="${s.radial([[0, '#fff', 0.55], [0.6, '#fff', 0.4], [1, '#000', 0]], 128, 128, 98)}"/></mask>`);
  s.add(`<g mask="url(#${fade})"><rect width="256" height="256" filter="${smoke}"/></g>`);
  // 细碎尘点/星点，与旧图集的星尘质感一致
  const n = motes === 'none' ? 0 : 26;
  const light = mix(tint, 0xffffff, 0.55);
  for (let i = 0; i < n; i++) {
    const a = r() * 360, d = 18 + Math.sqrt(r()) * 72;
    const [x, y] = pt(128, 128, d, a);
    const size = 0.45 + r() * 1.1;
    const op = 0.25 + r() * 0.6;
    if (r() < 0.18) {
      s.add(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(size * 2.4)}" fill="${hex(tint)}" opacity="${f(op * 0.5)}" filter="${s.blur(1.6)}"/>`);
    }
    s.add(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(size)}" fill="${hex(light)}" opacity="${f(op)}"/>`);
  }
}
function vignette(s, strength = 0.75) {
  s.add(`<circle cx="128" cy="128" r="99" fill="${s.radial([[0, '#000', 0], [0.72, '#000', 0], [0.93, '#000', strength * 0.55], [1, '#000', strength]], 128, 128, 99)}"/>`);
}
// 四角星芒（圣光/闪点）
function glint(s, x, y, size, color, opacity = 1, rot = 0) {
  const k = size * 0.16;
  const d = `M${f(x)},${f(y - size)} Q${f(x + k)},${f(y - k)} ${f(x + size)},${f(y)} Q${f(x + k)},${f(y + k)} ${f(x)},${f(y + size)} Q${f(x - k)},${f(y + k)} ${f(x - size)},${f(y)} Q${f(x - k)},${f(y - k)} ${f(x)},${f(y - size)} Z`;
  s.add(`<g transform="rotate(${rot} ${f(x)} ${f(y)})" opacity="${opacity}"><circle cx="${f(x)}" cy="${f(y)}" r="${f(size * 0.55)}" fill="${hex(color)}" opacity="0.55" filter="${s.blur(size * 0.3)}"/><path d="${d}" fill="${hex(mix(color, 0xffffff, 0.75))}"/></g>`);
}
// 沿圆弧的锥形拖尾（头部亮、尾部透明），分段绘制后轻微模糊消缝
function arcTrail(s, { cx = 128, cy = 128, r, a0, a1, w0, w1, color, opacity = 1, steps = 28, blur = 0.6 }) {
  const parts = [];
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1.35) / steps;
    const aa = a0 + (a1 - a0) * t0, ab = a0 + (a1 - a0) * Math.min(1, t1);
    const wa = w0 + (w1 - w0) * t0, wb = w0 + (w1 - w0) * Math.min(1, t1);
    const q = [pt(cx, cy, r + wa / 2, aa), pt(cx, cy, r + wb / 2, ab), pt(cx, cy, r - wb / 2, ab), pt(cx, cy, r - wa / 2, aa)];
    parts.push(`<path d="${poly(q)}" fill="${hex(color)}" fill-opacity="${f(Math.pow((i + 1) / steps, 1.6) * opacity)}"/>`);
  }
  s.add(`<g filter="${s.blur(blur)}">${parts.join('')}</g>`);
}
// 锯齿闪电折线
function boltPoints(r, x0, y0, x1, y1, segs, jitter) {
  const pts = [[x0, y0]];
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
  for (let i = 1; i < segs; i++) {
    const t = i / segs + (r() - 0.5) * 0.35 / segs;
    const off = (i % 2 ? 1 : -1) * jitter * (0.45 + r() * 0.75);
    pts.push([x0 + dx * t + nx * off, y0 + dy * t + ny * off]);
  }
  pts.push([x1, y1]);
  return pts;
}
function drawBolt(s, pts, { glow, mid, core = 0xffffff, width = 1, glowOpacity = 0.85 }) {
  const d = line(pts);
  s.add(`<path d="${d}" fill="none" stroke="${hex(glow)}" stroke-width="${f(9 * width)}" stroke-linejoin="round" stroke-linecap="round" opacity="${glowOpacity}" filter="${s.blur(3.2 * width)}"/>`);
  s.add(`<path d="${d}" fill="none" stroke="${hex(mid)}" stroke-width="${f(3.6 * width)}" stroke-linejoin="round" stroke-linecap="round"/>`);
  s.add(`<path d="${d}" fill="none" stroke="${hex(core)}" stroke-width="${f(1.5 * width)}" stroke-linejoin="round" stroke-linecap="round"/>`);
}
// ---------- 12 个技能图标 ----------
const ICONS = {
  // 刃风暴：三把飞刃沿同一轨道顺时针环绕，带圆形刀光拖尾（环形轮廓）
  bladestorm: {
    frame: [14, false], tint: 0x5f9cd0, seed: 11, glow: 0.3,
    async layers(ctx) {
      const s = ctx.svg('trails');
      const col = 0x9ddcff, R = 56;
      s.add(`<circle cx="128" cy="128" r="${R}" fill="none" stroke="${hex(col)}" stroke-width="30" opacity="0.13" filter="${s.blur(8)}"/>`);
      for (let i = 0; i < 3; i++) {
        const a = -90 + i * 120;
        arcTrail(s, { r: R, a0: a - 125, a1: a - 2, w0: 1, w1: 30, color: 0x3f8fd8, opacity: 0.7, blur: 4 });
        arcTrail(s, { r: R + 1, a0: a - 115, a1: a - 2, w0: 0.5, w1: 15, color: 0xbfe8ff, opacity: 1, blur: 1 });
        arcTrail(s, { r: R + 5, a0: a - 80, a1: a - 2, w0: 0.3, w1: 4, color: 0xffffff, opacity: 1, blur: 0.4 });
        arcTrail(s, { r: R - 9, a0: a - 60, a1: a - 6, w0: 0.3, w1: 2.4, color: 0xe6f6ff, opacity: 0.8, blur: 0.4 });
      }
      // 中心：刀阵核心的冷光旋涡
      s.add(`<circle cx="128" cy="128" r="30" fill="${s.radial([[0, 0xe9f7ff, 0.9], [0.3, 0x9ddcff, 0.5], [1, 0x4f9fe0, 0]], 128, 128, 30)}"/>`);
      for (let i = 0; i < 3; i++) arcTrail(s, { r: 15, a0: -90 + i * 120 - 110, a1: -90 + i * 120, w0: 0.3, w1: 3.2, color: 0xffffff, opacity: 0.9, blur: 0.5, steps: 16 });
      const layers = [{ data: await svgLayer(s), blend: 'screen' }];
      const tintBlade = img => img.modulate({ brightness: 1.3, saturation: 0.85 }).linear([1.05, 1.1, 1.2, 1], [6, 10, 18, 0]);
      for (let i = 0; i < 3; i++) {
        const a = -90 + i * 120;
        const [x, y] = pt(128, 128, R, a);
        layers.push({ data: await blade(x, y, { dir: a + 90, scale: 0.56, adjust: glowOf(0x8fd2ff, 4) }), blend: 'screen' });
        layers.push({ data: await blade(x, y, { dir: a + 90, scale: 0.56, adjust: tintBlade }) });
      }
      const g = ctx.svg('glints');
      for (let i = 0; i < 3; i++) {
        const a = -90 + i * 120;
        const [x, y] = pt(128, 128, R, a);
        const [tx, ty] = pt(x, y, 54, a + 90);
        glint(g, tx, ty, 9, 0xbfe8ff, 1, 45);
      }
      glint(g, 128, 128, 11, 0xd9f2ff, 0.95);
      layers.push({ data: await svgLayer(g), blend: 'screen' });
      return layers;
    },
  },

  // 猎首镖：金色锁定准星 + 一枚飞镖与残影沿直线俯冲命中准星中心
  headhunter: {
    frame: [13, false], tint: 0xc98a2a, seed: 12, glow: 0.3, focus: [150, 146],
    async layers(ctx) {
      const tx = 152, ty = 150, dir = 45;
      const s = ctx.svg('reticle');
      const gold = 0xffd36d;
      s.add(`<circle cx="${tx}" cy="${ty}" r="54" fill="${s.radial([[0, 0xff7a2a, 0.35], [0.6, 0xc9661a, 0.12], [1, 0x000000, 0]], tx, ty, 54)}"/>`);
      const ring = (r, w, color, extra = '') => `<circle cx="${tx}" cy="${ty}" r="${r}" fill="none" stroke="${hex(color)}" stroke-width="${w}" ${extra}/>`;
      const circ = 2 * Math.PI * 40;
      const dash = `stroke-dasharray="${f(circ / 4 - 11)} 11" stroke-dashoffset="${f(-5.5 + circ / 8)}"`;
      s.add(`<g filter="${s.blur(3)}" opacity="0.9">${ring(40, 9, 0xff9a2a, dash)}</g>`);
      s.add(ring(40, 7.5, 0x2a1604, dash));
      s.add(ring(40, 5, gold, dash));
      s.add(ring(40, 1.6, 0xfff3c4, dash));
      s.add(ring(54, 1.6, gold, 'opacity="0.55" stroke-dasharray="2 5"'));
      for (const a of [0, 90, 180, 270]) {
        const [x0, y0] = pt(tx, ty, 26, a), [x1, y1] = pt(tx, ty, 60, a);
        s.add(`<path d="M${f(x0)},${f(y0)} L${f(x1)},${f(y1)}" stroke="#2a1604" stroke-width="6.5" stroke-linecap="round"/>`);
        s.add(`<path d="M${f(x0)},${f(y0)} L${f(x1)},${f(y1)}" stroke="${hex(gold)}" stroke-width="3.6" stroke-linecap="round"/>`);
      }
      // 锁敌线 + 速度线
      const [lx, ly] = pt(tx, ty, 150, dir + 180);
      s.add(`<path d="M${f(lx)},${f(ly)} L${tx},${ty}" stroke="${hex(gold)}" stroke-width="6" opacity="0.35" filter="${s.blur(2.5)}"/>`);
      for (const off of [-17, 17]) {
        const [ox, oy] = pt(0, 0, off, dir + 90);
        const [a0x, a0y] = pt(tx + ox, ty + oy, 120, dir + 180), [a1x, a1y] = pt(tx + ox, ty + oy, 46, dir + 180);
        s.add(`<path d="M${f(a0x)},${f(a0y)} L${f(a1x)},${f(a1y)}" stroke="${s.linear([[0, gold, 0], [1, 0xfff1c0, 0.85]], a0x, a0y, a1x, a1y)}" stroke-width="2.2" stroke-linecap="round"/>`);
      }
      const layers = [{ data: await svgLayer(s), blend: 'over' }];
      // 两道残影 + 本体：同一方向直线齐射
      const goldBlade = img => img.modulate({ brightness: 1.32, saturation: 1.1 }).linear([1.1, 1.04, 0.86, 1], [16, 10, 0, 0]);
      const ghost = img => img.modulate({ brightness: 1.1, saturation: 0.6 }).tint({ r: 255, g: 196, b: 92 });
      for (const [d, op] of [[70, 0.32], [40, 0.55]]) {
        const [gx, gy] = pt(tx, ty, d + 50, dir + 180);
        layers.push({ data: await blade(gx, gy, { dir, scale: 0.54, opacity: op, adjust: ghost }), blend: 'screen' });
      }
      const [bx, by] = pt(tx, ty, 52, dir + 180);
      layers.push({ data: await blade(bx, by, { dir, scale: 0.62, adjust: glowOf(0xffb347, 5) }), blend: 'screen' });
      layers.push({ data: await blade(bx, by, { dir, scale: 0.62, adjust: goldBlade }) });
      const g = ctx.svg('impact');
      g.add(`<circle cx="${tx}" cy="${ty}" r="11" fill="${g.radial([[0, 0xffffff, 1], [0.4, 0xffe08a, 0.8], [1, 0xff8a2a, 0]], tx, ty, 11)}"/>`);
      glint(g, tx + 2, ty + 2, 15, 0xffd36d, 1, 0);
      layers.push({ data: await svgLayer(g), blend: 'screen' });
      return layers;
    },
  },

  // 烈焰路径：贴地掠过的火球，身后留下一条斜向燃烧的火焰路径
  lavatrail: {
    frame: [12, false], tint: 0xb3321a, seed: 13, glow: 0.32, focus: [120, 170],
    async layers(ctx) {
      const s = ctx.svg('ground');
      const p0 = [40, 204], p1 = [100, 190], p2 = [168, 150];
      const qb = t => [(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]];
      const r = rng(1301);
      // 地面灼烧斑：一串互相重叠的不规则椭圆（越新越亮）
      for (let i = 0; i < 9; i++) {
        const t = i / 8, [x, y] = qb(t);
        const rx = 14 + t * 12, ry = 7 + t * 4;
        s.add(`<ellipse cx="${f(x)}" cy="${f(y + 4)}" rx="${f(rx * 1.5)}" ry="${f(ry * 1.6)}" fill="#a3220a" opacity="${f(0.35 + t * 0.4)}" filter="${s.roughBlur(9, 4, 0.05, 7 + i)}"/>`);
        s.add(`<ellipse cx="${f(x)}" cy="${f(y + 4)}" rx="${f(rx)}" ry="${f(ry)}" fill="${s.radial([[0, 0xffd27a, 0.9], [0.5, 0xff7a2a, 0.75], [1, 0xb3260a, 0]], x, y + 4, rx)}" filter="${s.rough(8, 0.07, 11 + i)}"/>`);
      }
      for (let i = 0; i < 22; i++) {
        const [x, y] = qb(r());
        s.add(`<circle cx="${f(x + (r() - 0.5) * 26)}" cy="${f(y + 4 + (r() - 0.5) * 10)}" r="${f(0.8 + r() * 1.6)}" fill="#ffe7a0" opacity="${f(0.5 + r() * 0.5)}"/>`);
      }
      const layers = [{ data: await svgLayer(s), blend: 'screen' }];
      // 手绘火舌：沿路径越靠近火球越高，整体向后（左）倾
      const hot = img => img.modulate({ brightness: 1.15, saturation: 1.1 });
      const tongues = [[0.04, 30, -20], [0.2, 40, -16], [0.36, 52, -12], [0.52, 62, -14], [0.68, 70, -10], [0.84, 74, -8]];
      for (const [t, h, lean] of tongues) {
        const [x, y] = qb(t);
        layers.push({ data: await tongue(x, y + 6, { h, lean, adjust: hot, flop: t > 0.3 && t < 0.6 }), blend: 'screen' });
      }
      layers.push({ data: await comet(180, 108, { dir: -30, scale: 0.6, adjust: hot }), blend: 'screen' });
      layers.push({ data: await comet(180, 108, { dir: -30, scale: 0.6, adjust: hot, src: 'ball' }), blend: 'over' });
      const g = ctx.svg('core');
      g.add(`<circle cx="184" cy="106" r="15" fill="${g.radial([[0, 0xfffbe6, 0.95], [0.5, 0xffd24a, 0.55], [1, 0xff6a1a, 0]], 184, 106, 15)}"/>`);
      for (let i = 0; i < 14; i++) {
        const [x, y] = qb(0.1 + r() * 0.85);
        const x2 = x + (r() - 0.6) * 34, y2 = y - 34 - r() * 46;
        g.add(`<path d="M${f(x2)},${f(y2)} l${f(-1.5 + r() * 3)},${f(3 + r() * 4)}" stroke="#ffc46a" stroke-width="1.7" stroke-linecap="round" opacity="${f(0.45 + r() * 0.5)}"/>`);
      }
      layers.push({ data: await svgLayer(g), blend: 'screen' });
      return layers;
    },
  },

  // 爆裂集束：中心主爆 + 冲击环，五枚碎片火球呈放射状飞散（星爆轮廓）
  cluster: {
    frame: [8, false], tint: 0xc0721a, seed: 14, glow: 0.34,
    async layers(ctx) {
      const layers = [];
      const amber = img => img.modulate({ brightness: 1.12, saturation: 1.05, hue: 8 });
      for (let i = 0; i < 5; i++) {
        const a = -90 + i * 72;
        const [x, y] = pt(128, 128, 66, a);
        layers.push({ data: await comet(x, y, { dir: a, scale: 0.31, adjust: amber }), blend: 'screen' });
      }
      const s = ctx.svg('burst');
      s.add(`<circle cx="128" cy="128" r="58" fill="${s.radial([[0, 0xffe7a0, 0.7], [0.35, 0xffb23f, 0.45], [0.75, 0xc0501a, 0.12], [1, 0x000000, 0]], 128, 128, 58)}"/>`);
      s.add(`<circle cx="128" cy="128" r="40" fill="none" stroke="#ffcf6a" stroke-width="5" opacity="0.65" filter="${s.roughBlur(5, 1.5, 0.08, 4)}"/>`);
      s.add(`<circle cx="128" cy="128" r="40" fill="none" stroke="#fff1c4" stroke-width="1.4" opacity="0.8" filter="${s.rough(5, 0.08, 4)}"/>`);
      const r = rng(1401);
      for (let i = 0; i < 5; i++) {
        const a = -90 + 36 + i * 72;
        for (let k = 0; k < 3; k++) {
          const aa = a + (r() - 0.5) * 30, d0 = 30 + r() * 8, d1 = d0 + 16 + r() * 22;
          const [x0, y0] = pt(128, 128, d0, aa), [x1, y1] = pt(128, 128, d1, aa);
          s.add(`<path d="M${f(x0)},${f(y0)} L${f(x1)},${f(y1)}" stroke="${s.linear([[0, 0xfff1c4, 0.9], [1, 0xff8a2a, 0]], x0, y0, x1, y1)}" stroke-width="${f(1.4 + r() * 1.4)}" stroke-linecap="round"/>`);
        }
      }
      layers.push({ data: await svgLayer(s), blend: 'screen' });
      layers.push({ data: await comet(128, 128, { dir: 137.6, scale: 0.95, adjust: amber, src: 'ball' }), blend: 'screen' });
      const g = ctx.svg('core');
      g.add(`<circle cx="128" cy="128" r="24" fill="${g.radial([[0, 0xffffff, 1], [0.3, 0xfff1b0, 0.95], [0.65, 0xffb23f, 0.55], [1, 0xff6a1a, 0]], 128, 128, 24)}"/>`);
      glint(g, 128, 128, 22, 0xffd27a, 0.9, 0);
      layers.push({ data: await svgLayer(g), blend: 'screen' });
      return layers;
    },
  },

  // 暴风雪：三条旋臂卷成冰风漩涡，中心雪花，外圈飞雪（漩涡轮廓）
  blizzard: {
    frame: [14, true], tint: 0x2f8fbf, seed: 15, glow: 0.3, motes: 'none',
    async layers(ctx) {
      const s = ctx.svg('vortex');
      const arms = [];
      for (let k = 0; k < 3; k++) {
        const a0 = -60 + k * 120;
        const outer = [], inner = [], spine = [];
        const steps = 48;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const a = a0 + 250 * t;
          const r = 92 - 76 * Math.pow(t, 0.85);
          const w = 2 + 17 * Math.sin(Math.PI * Math.pow(t, 0.7)) * (1 - t * 0.35);
          outer.push(pt(128, 128, r + w * 0.55, a));
          inner.push(pt(128, 128, r - w * 0.45, a));
          spine.push(pt(128, 128, r + w * 0.25, a));
        }
        arms.push({ d: poly([...outer, ...inner.reverse()]), spine });
      }
      const armFill = s.radial([[0, 0xffffff, 0.95], [0.3, 0xd8f6ff, 0.85], [0.7, 0x7adfff, 0.55], [1, 0x2f8fbf, 0]], 128, 128, 96);
      for (const a of arms) s.add(`<path d="${a.d}" fill="#3aa8e0" opacity="0.55" filter="${s.blur(4)}"/>`);
      for (const a of arms) s.add(`<path d="${a.d}" fill="${armFill}" filter="${s.roughBlur(3, 0.7, 0.09, 6)}"/>`);
      for (const a of arms) s.add(`<path d="${line(a.spine.slice(10, 44))}" fill="none" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round" opacity="0.85"/>`);
      // 顺着旋臂的飞雪
      const r = rng(1501);
      for (let i = 0; i < 34; i++) {
        const a = r() * 360, d = 26 + r() * 64;
        const [x, y] = pt(128, 128, d, a);
        const len = 2 + r() * 5;
        s.add(`<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(len)}" ry="${f(0.8 + r() * 0.6)}" transform="rotate(${f(a + 100)} ${f(x)} ${f(y)})" fill="#eefaff" opacity="${f(0.45 + r() * 0.5)}"/>`);
      }
      const layers = [{ data: await svgLayer(s), blend: 'screen' }];
      const icy = img => img.modulate({ brightness: 1.15, saturation: 0.85 });
      const flake = (x, y, scale, rot, op = 1) => xform(SOURCES.snowflake, { pivot: [128, 128], radius: 96, scale, rotate: rot, adjust: icy }).then(p => place(p, x, y, op));
      layers.push({ data: await flake(128, 128, 0.4, 10), blend: 'screen' });
      layers.push({ data: await flake(58, 92, 0.15, 25, 0.95), blend: 'screen' });
      layers.push({ data: await flake(190, 168, 0.13, 40, 0.9), blend: 'screen' });
      layers.push({ data: await flake(176, 64, 0.1, 5, 0.85), blend: 'screen' });
      layers.push({ data: await flake(82, 196, 0.1, 15, 0.8), blend: 'screen' });
      return layers;
    },
  },

  // 碎冰牢笼：一圈向内合拢的锯齿冰晶獠牙，围住发光的冻结核心（尖刺环轮廓）
  icecage: {
    frame: [8, true], tint: 0x4aa0c8, seed: 16, glow: 0.26,
    async layers(ctx) {
      const s = ctx.svg('cage');
      const r = rng(1601);
      // 结霜外环
      s.add(`<circle cx="128" cy="128" r="86" fill="none" stroke="#7adfff" stroke-width="16" opacity="0.35" filter="${s.roughBlur(8, 4, 0.06, 8)}"/>`);
      s.add(`<circle cx="128" cy="128" r="88" fill="none" stroke="#e6fbff" stroke-width="3" opacity="0.55" filter="${s.roughBlur(6, 0.8, 0.09, 9)}"/>`);
      const paint = s.paint(16, 0.35, 0.09);
      const shard = (a, r0, r1, w, light, dark) => {
        const tip = pt(128, 128, r1, a + (r() - 0.5) * 5);
        const bl = pt(128, 128, r0 + r() * 3, a - w), br = pt(128, 128, r0 + r() * 3, a + w);
        const kink = 0.45 + r() * 0.2;
        const midL = pt(128, 128, r0 + (r1 - r0) * kink, a - w * (0.5 + r() * 0.25)), midR = pt(128, 128, r0 + (r1 - r0) * (kink + 0.08), a + w * (0.55 + r() * 0.25));
        const ridge = pt(128, 128, r0 + (r1 - r0) * 0.15, a + (r() - 0.5) * w * 0.4);
        s.add(`<g filter="${paint}"><path d="${poly([ridge, bl, midL, tip])}" fill="${s.linear([[0, light], [0.7, 0xe9fbff], [1, 0xffffff]], ridge[0], ridge[1], tip[0], tip[1])}"/>`
          + `<path d="${poly([ridge, tip, midR, br])}" fill="${s.linear([[0, dark], [0.8, 0x7cc4ea], [1, 0xd5f4ff]], ridge[0], ridge[1], tip[0], tip[1])}"/></g>`);
        s.add(`<path d="${poly([bl, midL, tip, midR, br])}" fill="none" stroke="#f2fdff" stroke-width="1" stroke-linejoin="round" opacity="0.9"/>`);
        s.add(`<path d="${line([ridge, tip])}" stroke="#ffffff" stroke-width="0.8" opacity="0.7"/>`);
      };
      const glowRing = [];
      for (let i = 0; i < 9; i++) {
        const a = -90 + i * 40;
        glowRing.push(`<path d="${poly([pt(128, 128, 94, a - 11), pt(128, 128, 38, a), pt(128, 128, 94, a + 11)])}" fill="#7adfff"/>`);
      }
      s.add(`<g opacity="0.7" filter="${s.blur(5)}">${glowRing.join('')}</g>`);
      // 短晶刺（后）与长獠牙（前），9 个方向略带随机
      for (let i = 0; i < 9; i++) shard(-90 + 20 + i * 40 + (r() - 0.5) * 6, 92, 64 - r() * 8, 6 + r() * 2, 0x8fd6f5, 0x1b557f);
      for (let i = 0; i < 9; i++) shard(-90 + i * 40 + (r() - 0.5) * 4, 95, 40 + r() * 8, 10 + r() * 2, 0xb5ecff, 0x1f5a8a);
      // 冻结核心：冰球
      s.add(`<circle cx="128" cy="128" r="36" fill="#9ddcff" opacity="0.65" filter="${s.blur(7)}"/>`);
      s.add(`<circle cx="128" cy="128" r="23" fill="${s.radial([[0, 0xf4fdff], [0.55, 0x9fdcff], [0.9, 0x2f7fb8], [1, 0x1b4d7a]], 121, 120, 26, 120, 118)}" stroke="#e9fbff" stroke-width="1.6"/>`);
      const layers = [{ data: await svgLayer(s), blend: 'over' }];
      const flake = await xform(SOURCES.snowflake, { pivot: [128, 128], radius: 96, scale: 0.25, rotate: 15, adjust: img => img.modulate({ brightness: 1.3, saturation: 0.7 }) });
      layers.push({ data: place(flake, 128, 128), blend: 'screen' });
      const g = ctx.svg('glints');
      g.add(`<ellipse cx="120" cy="118" rx="8" ry="5" fill="#ffffff" opacity="0.75" transform="rotate(-30 120 118)" filter="${g.blur(1.2)}"/>`);
      glint(g, 146, 106, 8, 0xe9fbff, 1, 0);
      layers.push({ data: await svgLayer(g), blend: 'screen' });
      return layers;
    },
  },

  // 风暴之眼：雷云中央睁开的电光之眼，三道雷向下劈落（云团+竖雷轮廓）
  stormeye: {
    frame: [11, false], tint: 0x4b3a9a, seed: 17, glow: 0.28, focus: [128, 96],
    async layers(ctx) {
      const s = ctx.svg('storm');
      const r = rng(1701);
      // 雷柱先画，被云层压住根部
      const strikes = [[80, 198, 1.0], [130, 212, 1.3], [178, 196, 1.0]];
      s.add(`<ellipse cx="128" cy="204" rx="80" ry="16" fill="#8a6dff" opacity="0.35" filter="${s.blur(8)}"/>`);
      strikes.forEach(([x, y, w], i) => {
        const pts = boltPoints(r, x + (i - 1) * 12, 116, x, y, 6, 8 * w);
        drawBolt(s, pts, { glow: 0x8a6dff, mid: 0xcfc2ff, width: w });
        const k = pts[3];
        drawBolt(s, boltPoints(r, k[0], k[1], k[0] + (i - 1 || 1) * 18, k[1] + 22, 3, 4), { glow: 0x8a6dff, mid: 0xb9a8ff, width: 0.5, glowOpacity: 0.6 });
        s.add(`<ellipse cx="${x}" cy="${y}" rx="${f(17 * w)}" ry="${f(5.5 * w)}" fill="${s.radial([[0, 0xffffff, 1], [0.4, 0xd2c6ff, 0.75], [1, 0x6a4bff, 0]], x, y, 17 * w)}"/>`);
      });
      const blobs = [[64, 102, 26], [92, 80, 32], [130, 68, 38], [168, 80, 31], [194, 104, 24], [152, 104, 34], [106, 106, 34], [80, 116, 22], [178, 116, 22], [128, 114, 30]];
      const circles = () => blobs.map(([x, y, rr]) => `<circle cx="${x}" cy="${y}" r="${rr}"/>`).join('');
      // 底部被眼光/雷光照亮的轮廓 → 暗色云体 → 体积噪声 → 顶部冷光
      s.add(`<g fill="#b9a8ff" opacity="0.9" filter="${s.roughBlur(7, 3, 0.05, 12)}" transform="translate(0 5)">${circles()}</g>`);
      s.add(`<g fill="${s.linear([[0, 0x161030], [0.55, 0x2a1f5c], [1, 0x4a3a90]], 0, 40, 0, 140)}" filter="${s.rough(7, 0.05, 12)}">${circles()}</g>`);
      s.add(`<g fill="#000" filter="${s.smoke(41, 0x8f7ae8, 0.04, 2.0, -0.95)}"><g filter="${s.rough(7, 0.05, 12)}">${circles()}</g></g>`);
      s.add(`<g fill="none" stroke="#9c88ee" stroke-width="2.4" opacity="0.6" filter="${s.roughBlur(7, 1.2, 0.05, 12)}">${blobs.slice(0, 5).map(([x, y, rr]) => `<path d="M${f(x - rr * 0.75)},${f(y - rr * 0.5)} A${rr},${rr} 0 0 1 ${f(x + rr * 0.6)},${f(y - rr * 0.72)}"/>`).join('')}</g>`);
      // 眼睛
      const ex = 128, ey = 96;
      s.add(`<ellipse cx="${ex}" cy="${ey}" rx="46" ry="24" fill="#a897ff" opacity="0.75" filter="${s.blur(7)}"/>`);
      s.add(`<path d="M${ex - 38},${ey} Q${ex},${ey - 30} ${ex + 38},${ey} Q${ex},${ey + 30} ${ex - 38},${ey} Z" fill="${s.radial([[0, 0xffffff], [0.55, 0xe6ddff], [1, 0x9d86ff]], ex, ey, 38)}"/>`);
      s.add(`<circle cx="${ex}" cy="${ey}" r="14" fill="${s.radial([[0, 0xf4efff], [0.45, 0xb49cff], [1, 0x5a3fd0]], ex, ey, 14)}"/>`);
      s.add(`<ellipse cx="${ex}" cy="${ey}" rx="3.6" ry="11" fill="#140a33"/>`);
      s.add(`<path d="M${ex - 38},${ey} Q${ex},${ey - 30} ${ex + 38},${ey} Q${ex},${ey + 30} ${ex - 38},${ey} Z" fill="none" stroke="#2a1a5c" stroke-width="2.4"/>`);
      s.add(`<circle cx="${ex - 5}" cy="${ey - 5}" r="3" fill="#ffffff"/>`);
      return [{ data: await svgLayer(s), blend: 'over' }];
    },
  },

  // 雷枢裁决：从天而降的巨型裁决雷柱击中地面，冲击环向两侧弹射（单柱+地环轮廓）
  thunderjudgment: {
    frame: [11, true], tint: 0x6a5aa8, seed: 18, glow: 0.26,
    async layers(ctx) {
      const s = ctx.svg('column');
      const r = rng(1801);
      s.add(`<path d="M124,196 L108,14 L196,14 Z" fill="${s.linear([[0, 0xe2d7ff, 0], [0.6, 0xb9a8ff, 0.3], [1, 0xe2d7ff, 0.6]], 0, 14, 0, 200)}" filter="${s.blur(10)}"/>`);
      // 两侧弹射
      for (const [x1, y1] of [[46, 158], [208, 166]]) {
        drawBolt(s, boltPoints(r, 124, 192, x1, y1, 5, 6), { glow: 0x9d86ff, mid: 0xd7ccff, width: 0.75 });
        s.add(`<circle cx="${x1}" cy="${y1}" r="8" fill="${s.radial([[0, 0xffffff, 1], [1, 0x9d86ff, 0]], x1, y1, 8)}"/>`);
      }
      // 地面冲击环
      s.add(`<ellipse cx="124" cy="194" rx="66" ry="18" fill="none" stroke="#b9a8ff" stroke-width="10" opacity="0.75" filter="${s.blur(4)}"/>`);
      s.add(`<ellipse cx="124" cy="194" rx="62" ry="16" fill="none" stroke="#efeaff" stroke-width="2.8"/>`);
      s.add(`<ellipse cx="124" cy="194" rx="40" ry="10" fill="none" stroke="#d7ccff" stroke-width="1.6" opacity="0.8"/>`);
      s.add(`<ellipse cx="124" cy="192" rx="36" ry="12" fill="${s.radial([[0, 0xffffff, 1], [0.5, 0xe2d7ff, 0.75], [1, 0x9d86ff, 0]], 124, 192, 36)}"/>`);
      const layers = [{ data: await svgLayer(s), blend: 'screen' }];
      // 巨型裁决雷柱：经典 Z 形晶体雷，左亮右暗两个切面 + 手绘雷纹叠加
      const b = ctx.svg('bolt');
      const P = [[132, 22], [184, 22], [160, 86], [188, 86], [124, 192], [142, 118], [110, 118]];
      const left = [[132, 22], [158, 22], [138, 92], [164, 92], [124, 192], [142, 118], [110, 118]];
      b.add(`<path d="${poly(P)}" fill="#b9a8ff" opacity="0.9" filter="${b.blur(7)}"/>`);
      b.add(`<path d="${poly(P)}" fill="#2a1d5a" stroke="#2a1d5a" stroke-width="5" stroke-linejoin="round"/>`);
      b.add(`<g filter="${b.paint(18, 0.3, 0.08)}"><path d="${poly(P)}" fill="${b.linear([[0, 0xc9bbff], [1, 0x7a62e0]], 150, 20, 150, 190)}"/>`
        + `<path d="${poly(left)}" fill="${b.linear([[0, 0xffffff], [0.5, 0xf1ecff], [1, 0xc9bbff]], 130, 20, 130, 190)}"/></g>`);
      b.add(`<path d="${poly(P)}" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/>`);
      layers.push({ data: await svgLayer(b), blend: 'over' });
      const pale = img => img.modulate({ brightness: 1.2, saturation: 0.45, hue: -8 });
      const boltPiece = await xform(SOURCES.bolt, { pivot: BOLT.pivot, radius: BOLT.radius, scale: 0.78, rotate: 90 - BOLT.axis + 14, adjust: pale });
      layers.push({ data: place(boltPiece, 150, 104, 0.45), blend: 'screen' });
      const g = ctx.svg('flash');
      g.add(`<circle cx="124" cy="190" r="18" fill="${g.radial([[0, 0xffffff, 1], [1, 0xe2d7ff, 0]], 124, 190, 18)}"/>`);
      glint(g, 124, 188, 24, 0xe2d7ff, 1, 0);
      layers.push({ data: await svgLayer(g), blend: 'screen' });
      return layers;
    },
  },

  // 瘟疫：紫绿瘴气中的骷髅，眼窝冒毒光，孢子向外传染（骷髅轮廓）
  plague: {
    frame: [4, false], tint: 0x5a3f8a, seed: 19, glow: 0.32,
    async layers(ctx) {
      const s = ctx.svg('skull');
      const r = rng(1901);
      // 瘴气：紫色体积烟 + 底部毒绿辉光 + 上升毒雾触须
      const miasma = [[70, 172, 34], [114, 192, 38], [162, 182, 34], [194, 148, 24], [58, 136, 22], [100, 156, 28], [154, 154, 28], [128, 172, 30]];
      const blobs = miasma.map(([x, y, rr]) => `<circle cx="${x}" cy="${y}" r="${rr}"/>`).join('');
      s.add(`<g fill="#5b3f8a" opacity="0.85" filter="${s.roughBlur(12, 6, 0.04, 21)}">${blobs}</g>`);
      s.add(`<g fill="#000" filter="${s.smoke(42, 0xa98ad8, 0.03, 2.4, -0.95)}"><g filter="${s.roughBlur(12, 3, 0.04, 21)}">${blobs}</g></g>`);
      s.add(`<ellipse cx="128" cy="190" rx="70" ry="22" fill="#7be04a" opacity="0.4" filter="${s.roughBlur(14, 7, 0.05, 22)}"/>`);
      for (const d of ['M60,192 C36,170 76,152 52,122 C44,112 50,102 58,98', 'M196,190 C220,168 180,148 204,122 C212,112 206,102 198,98', 'M100,210 C84,198 108,186 92,170']) {
        s.add(`<path d="${d}" fill="none" stroke="#9dff5a" stroke-width="7" opacity="0.45" stroke-linecap="round" filter="${s.roughBlur(5, 2.5, 0.06, 23)}"/>`);
        s.add(`<path d="${d}" fill="none" stroke="#d8ff9a" stroke-width="1.6" opacity="0.65" stroke-linecap="round" filter="${s.rough(5, 0.06, 23)}"/>`);
      }
      // 骷髅（局部坐标，中心 0,0）
      const sk = (body) => `<g transform="translate(128 112) scale(0.96)">${body}</g>`;
      const cranium = 'M0,-56 C30,-56 46,-36 46,-10 C46,6 40,16 34,22 C32,30 28,34 24,36 L22,46 L-22,46 L-24,36 C-28,34 -32,30 -34,22 C-40,16 -46,6 -46,-10 C-46,-36 -30,-56 0,-56 Z';
      const jaw = 'M-21,48 L21,48 L19,60 C13,68 -13,68 -19,60 Z';
      const bone = s.radial([[0, 0xfffaea], [0.45, 0xe6dcbc], [0.8, 0xa29676], [1, 0x5a5044]], -14, -26, 84, -18, -34); // 骷髅局部坐标
      const paint = s.paint(19, 0.5, 0.12);
      s.add(sk(`<path d="${cranium}" fill="#c9ff7a" opacity="0.45" filter="${s.blur(7)}"/>`));
      s.add(sk(`<path d="${cranium}" fill="#140c1c" stroke="#140c1c" stroke-width="6"/><path d="${jaw}" fill="#140c1c" stroke="#140c1c" stroke-width="6"/>`));
      s.add(sk(`<g filter="${paint}"><path d="${cranium}" fill="${bone}"/><path d="${jaw}" fill="${bone}"/></g>`));
      // 颧骨下方与太阳穴的阴影
      s.add(sk(`<g fill="#3a2a48" opacity="0.4" filter="${s.blur(3)}"><path d="M-44,0 C-42,16 -34,26 -26,32 L-24,40 L-14,40 C-18,30 -26,22 -30,12 Z"/><path d="M44,0 C42,16 34,26 26,32 L24,40 L14,40 C18,30 26,22 30,12 Z"/></g>`));
      s.add(sk(`<path d="M-31,-3 C-31,-18 -6,-21 -5,-5 C-4,9 -29,14 -31,-3 Z M31,-3 C31,-18 6,-21 5,-5 C4,9 29,14 31,-3 Z" fill="#160c1c" stroke="#5a4a3a" stroke-width="1.2"/>`));
      s.add(sk(`<path d="M0,10 L-6,25 Q0,21 6,25 Z" fill="#160c1c"/>`));
      // 牙齿：上下两排独立齿块
      s.add(sk(`<path d="M-19,41 L19,41 L19,48 L-19,48 Z" fill="#160c1c"/>`
        + [-15, -7.5, 0, 7.5, 15].map(x => `<rect x="${x - 3.2}" y="38" width="6.4" height="9" rx="2" fill="#efe6c8" stroke="#2a2030" stroke-width="1"/>`).join('')
        + [-11, -3.7, 3.7, 11].map(x => `<rect x="${x - 3}" y="49" width="6" height="8" rx="2" fill="#d9cfae" stroke="#2a2030" stroke-width="1"/>`).join('')));
      s.add(sk(`<path d="M12,-55 L7,-44 L13,-36 L9,-27" stroke="#3a3040" stroke-width="1.6" fill="none"/>`));
      s.add(sk(`<ellipse cx="-16" cy="-34" rx="14" ry="8" fill="#ffffff" opacity="0.3" filter="${s.blur(3)}"/>`));
      // 毒光眼
      for (const ex of [-18, 18]) {
        s.add(sk(`<circle cx="${ex}" cy="-3" r="8" fill="#9dff5a" opacity="0.75" filter="${s.blur(3)}"/><circle cx="${ex}" cy="-3" r="4.4" fill="#c8ff7a"/><circle cx="${ex}" cy="-3" r="2" fill="#ffffff"/>`));
      }
      // 孢子与气泡
      for (let i = 0; i < 16; i++) {
        const a = r() * 360, d = 62 + r() * 26;
        const [x, y] = pt(128, 128, d, a);
        const rr = 1.5 + r() * 3.5;
        const green = r() < 0.55;
        s.add(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(rr)}" fill="${green ? '#9dff5a' : '#b59cff'}" opacity="${f(0.35 + r() * 0.4)}" stroke="${green ? '#e3ffc4' : '#e8ddff'}" stroke-width="0.7"/>`);
      }
      return [{ data: await svgLayer(s), blend: 'over' }];
    },
  },

  // 腐蚀：酸液从上方滴落，蚀穿开裂的铁盾（盾牌轮廓）
  corrosion: {
    frame: [7, false], tint: 0x7f9a1a, seed: 20, glow: 0.3,
    async layers(ctx) {
      const s = ctx.svg('shield');
      const r = rng(2001);
      const shieldD = 'M78,78 L178,78 L178,124 C178,164 154,190 128,206 C102,190 78,164 78,124 Z';
      const innerD = 'M88,88 L168,88 L168,124 C168,158 148,180 128,194 C108,180 88,158 88,124 Z';
      const holes = [[150, 150, 13], [112, 170, 9], [160, 112, 7], [104, 122, 6]];
      const holeShapes = holes.map(([x, y, rr]) => `<circle cx="${x}" cy="${y}" r="${rr}"/>`).join('');
      const bite = s.uid('bite');
      s.def(bite, `<mask id="${bite}" maskUnits="userSpaceOnUse" x="0" y="0" width="256" height="256"><rect width="256" height="256" fill="#fff"/><g fill="#000" filter="${s.rough(9, 0.09, 31)}">${holeShapes}<circle cx="178" cy="176" r="18"/><circle cx="96" cy="78" r="9"/></g></mask>`);
      s.add(`<path d="${shieldD}" fill="#c9f24b" opacity="0.4" filter="${s.blur(8)}"/>`);
      s.add(`<g mask="url(#${bite})"><path d="${shieldD}" fill="#0e130c" stroke="#0e130c" stroke-width="5" stroke-linejoin="round"/>`
        + `<g filter="${s.paint(20, 0.45, 0.1)}"><path d="${shieldD}" fill="${s.linear([[0, 0xf2f5ec], [0.35, 0xaab4a8], [1, 0x3c443e]], 90, 70, 160, 210)}"/>`
        + `<path d="${innerD}" fill="${s.linear([[0, 0x6f7d72], [0.5, 0x404c43], [1, 0x1c241e]], 100, 80, 150, 200)}"/></g>`
        + `<path d="${innerD}" fill="none" stroke="#11160f" stroke-width="1.6"/>`
        + `<path d="M128,90 L128,192" stroke="#8a988d" stroke-width="3.4" opacity="0.6"/>`
        + `<path d="M96,98 C100,94 112,93 120,94" stroke="#e1e8dc" stroke-width="2.4" opacity="0.6" stroke-linecap="round"/>`
        + [[84, 84], [172, 84], [84, 120], [172, 120]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="#d9e0d4" stroke="#1a2018" stroke-width="1"/>`).join('')
        + `<path d="M140,92 L132,114 L146,128 L138,150 M132,114 L116,120 L110,140 M146,128 L162,134" fill="none" stroke="#0b0f07" stroke-width="2.2" stroke-linejoin="round"/>`
        + `<path d="M140,92 L132,114 L146,128 L138,150 M132,114 L116,120 L110,140 M146,128 L162,134" fill="none" stroke="#c9f24b" stroke-width="5" opacity="0.35" filter="${s.blur(1.6)}"/>`
        + `</g>`);
      // 蚀洞的酸光边
      s.add(`<g fill="none" stroke="#d7ff57" stroke-width="2.4" opacity="0.95" filter="${s.rough(9, 0.09, 31)}">${holeShapes}</g>`);
      s.add(`<g fill="none" stroke="#c9f24b" stroke-width="6" opacity="0.5" filter="${s.roughBlur(9, 2, 0.09, 31)}">${holeShapes}</g>`);
      // 酸液沿盾面流下
      const acid = s.linear([[0, 0xf2ff9a], [0.4, 0xc9f24b], [1, 0x6f9a12]], 0, 70, 0, 200);
      // 顶边酸液 + 长短不一、末端鼓起的流痕
      const drips = [[102, 86, 26, 6], [121, 88, 50, 7], [148, 86, 18, 5], [162, 84, 36, 6]];
      const dripD = drips.map(([x, y, len, w]) => `M${f(x - w * 0.5)},${y} C${f(x - w * 0.12)},${f(y + len * 0.35)} ${f(x - w * 0.18)},${f(y + len * 0.7)} ${f(x - w * 0.5)},${f(y + len)} A${f(w * 0.55)},${f(w * 0.55)} 0 1 0 ${f(x + w * 0.5)},${f(y + len)} C${f(x + w * 0.18)},${f(y + len * 0.7)} ${f(x + w * 0.12)},${f(y + len * 0.35)} ${f(x + w * 0.5)},${y} Z`).join(' ');
      const topD = 'M76,74 Q92,68 106,74 Q120,66 134,74 Q150,68 164,73 Q174,70 180,75 L179,88 Q164,93 150,90 Q136,95 122,91 Q104,95 92,90 Q80,92 77,88 Z';
      s.add(`<path d="${topD} ${dripD}" fill="#c9f24b" opacity="0.6" filter="${s.blur(4)}"/>`);
      s.add(`<path d="${topD} ${dripD}" fill="${acid}" stroke="#2c3a08" stroke-width="1.2" filter="${s.rough(2.5, 0.08, 33)}"/>`);
      for (const [x, y, len, w] of drips) {
        s.add(`<circle cx="${f(x - w * 0.2)}" cy="${f(y + len - w * 0.05)}" r="${f(w * 0.18)}" fill="#fbffd6" opacity="0.9"/>`);
      }
      s.add(`<path d="M86,78 Q104,72 122,78" stroke="#fbffd6" stroke-width="1.6" opacity="0.8" fill="none" stroke-linecap="round"/>`);
      // 蒸汽
      s.add(`<g fill="#d7ff57" opacity="0.28" filter="${s.roughBlur(10, 4, 0.05, 34)}"><ellipse cx="152" cy="140" rx="14" ry="20"/><ellipse cx="108" cy="164" rx="10" ry="16"/><ellipse cx="186" cy="174" rx="12" ry="14"/></g>`);
      // 上方落下的酸滴
      for (const [x, y, sz] of [[110, 44, 6], [146, 36, 7.5], [128, 58, 5]]) {
        s.add(`<path d="M${x},${y - sz * 1.6} C${x + sz * 0.3},${y - sz * 0.6} ${x + sz},${y - sz * 0.1} ${x + sz},${y + sz * 0.4} A${sz},${sz} 0 0 1 ${x - sz},${y + sz * 0.4} C${x - sz},${y - sz * 0.1} ${x - sz * 0.3},${y - sz * 0.6} ${x},${y - sz * 1.6} Z" fill="${acid}" stroke="#2c3a08" stroke-width="0.8"/>`);
        s.add(`<circle cx="${f(x - sz * 0.35)}" cy="${f(y + sz * 0.15)}" r="${f(sz * 0.28)}" fill="#ffffff" opacity="0.8"/>`);
      }
      // 酸泡与蒸汽
      for (let i = 0; i < 12; i++) {
        const x = 92 + r() * 80, y = 150 + r() * 50;
        s.add(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(1.2 + r() * 2.6)}" fill="none" stroke="#e3ff8a" stroke-width="0.9" opacity="${f(0.45 + r() * 0.5)}"/>`);
      }
      return [{ data: await svgLayer(s), blend: 'over' }];
    },
  },

  // 圣辉光环：金白双环 + 放射辉芒 + 环上旋转星点，中心治愈之光（空心环轮廓）
  holyhalo: {
    frame: [5, false], tint: 0xb08a2a, seed: 21, glow: 0.3,
    async layers(ctx) {
      const s = ctx.svg('halo');
      const rays = [];
      for (let i = 0; i < 16; i++) {
        const a = -90 + i * 22.5 + 11.25;
        const long = i % 2 === 0;
        const r1 = long ? 92 : 78, w = long ? 4.2 : 3;
        const b0 = pt(128, 128, 56, a - w), b1 = pt(128, 128, 56, a + w), tip = pt(128, 128, r1, a);
        rays.push(`<path d="${poly([b0, tip, b1])}"/>`);
      }
      s.add(`<g fill="#ffd36d" opacity="0.75" filter="${s.blur(3.5)}">${rays.join('')}</g>`);
      s.add(`<g fill="${s.radial([[0.55, 0xfffbe6, 1], [0.8, 0xffe08a, 0.75], [1, 0xffc94a, 0]], 128, 128, 94)}">${rays.join('')}</g>`);
      // 光环本体：金色宽辉光上叠两道细亮环（金白双环），环内保持通透
      s.add(`<circle cx="128" cy="128" r="50" fill="none" stroke="#ffcf4a" stroke-width="30" opacity="0.6" filter="${s.blur(8)}"/>`);
      s.add(`<circle cx="128" cy="128" r="50" fill="none" stroke="#ffe08a" stroke-width="13" opacity="0.85" filter="${s.blur(2.5)}"/>`);
      s.add(`<circle cx="128" cy="128" r="50" fill="none" stroke="${s.linear([[0, 0xffffff], [0.5, 0xfff1b8], [1, 0xffcf5a]], 0, 76, 0, 180)}" stroke-width="6"/>`);
      s.add(`<circle cx="128" cy="128" r="50" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.95"/>`);
      s.add(`<circle cx="128" cy="128" r="63" fill="none" stroke="#ffe9a8" stroke-width="2.2" opacity="0.8" stroke-dasharray="26 8 4 8"/>`);
      s.add(`<circle cx="128" cy="128" r="37" fill="none" stroke="#fff6cf" stroke-width="1.4" opacity="0.6"/>`);
      s.add(`<circle cx="128" cy="128" r="34" fill="${s.radial([[0, 0xfff7d6, 0.55], [0.6, 0xffe08a, 0.18], [1, 0xffd36d, 0]], 128, 128, 34)}"/>`);
      // 环内上升的治愈光点
      for (const [x, y, sz] of [[120, 140, 5.5], [138, 122, 4.2], [126, 112, 3.2]]) {
        s.add(`<path d="M${x},${y - sz} L${x},${y + sz} M${x - sz},${y} L${x + sz},${y}" stroke="#fffbe6" stroke-width="${f(sz * 0.55)}" stroke-linecap="round"/>`);
        s.add(`<circle cx="${x}" cy="${y}" r="${f(sz * 1.4)}" fill="#ffe08a" opacity="0.5" filter="${s.blur(2)}"/>`);
      }
      for (const a of [-50, 70, 190]) {
        const [x, y] = pt(128, 128, 50, a);
        glint(s, x, y, 12, 0xffef9a, 1, 0);
      }
      return [{ data: await svgLayer(s), blend: 'over' }];
    },
  },

  // 审判棱镜：光球射出的一束圣光穿过三棱镜，分裂成三道光束（三角+扇形光束轮廓）
  prism: {
    frame: [13, true], tint: 0xb39a52, seed: 22, glow: 0.28, focus: [118, 132],
    async layers(ctx) {
      const s = ctx.svg('prism');
      const top = [118, 62], bl = [68, 166], br = [168, 166];
      const entry = [93 - 1, 114], exit = [143 + 1, 114];
      // 出射光束
      const beams = [[-26, 0xffd36d], [0, 0xfffbe8], [26, 0xffa468]];
      for (const [a, c] of beams) {
        const end = pt(exit[0], exit[1], 130, a);
        const e0 = pt(end[0], end[1], 11, a - 90), e1 = pt(end[0], end[1], 11, a + 90);
        const s0 = pt(exit[0], exit[1], 2, a - 90), s1 = pt(exit[0], exit[1], 2, a + 90);
        s.add(`<path d="${poly([s0, e0, e1, s1])}" fill="${hex(c)}" opacity="0.55" filter="${s.blur(4)}"/>`);
        s.add(`<path d="${poly([s0, e0, e1, s1])}" fill="${s.linear([[0, 0xffffff, 1], [0.5, c, 0.85], [1, c, 0.15]], exit[0], exit[1], end[0], end[1])}"/>`);
        const c0 = pt(exit[0], exit[1], 0.8, a - 90), c1 = pt(exit[0], exit[1], 0.8, a + 90), ce0 = pt(end[0], end[1], 2.5, a - 90), ce1 = pt(end[0], end[1], 2.5, a + 90);
        s.add(`<path d="${poly([c0, ce0, ce1, c1])}" fill="${s.linear([[0, 0xffffff, 1], [1, 0xffffff, 0]], exit[0], exit[1], end[0], end[1])}"/>`);
      }
      // 入射光束与光球
      const orb = [46, 136];
      s.add(`<path d="M${orb[0]},${orb[1]} L${entry[0]},${entry[1]}" stroke="#fff1c4" stroke-width="10" opacity="0.6" filter="${s.blur(3)}"/>`);
      s.add(`<path d="M${orb[0]},${orb[1]} L${entry[0]},${entry[1]}" stroke="#ffffff" stroke-width="3.2" stroke-linecap="round"/>`);
      s.add(`<circle cx="${orb[0]}" cy="${orb[1]}" r="16" fill="#ffe08a" opacity="0.75" filter="${s.blur(5)}"/>`);
      s.add(`<circle cx="${orb[0]}" cy="${orb[1]}" r="9" fill="${s.radial([[0, 0xffffff], [0.6, 0xfff4c2], [1, 0xffc94a]], orb[0] - 2, orb[1] - 2, 10)}"/>`);
      // 棱镜本体：三个切面
      const cen = [118, 132];
      s.add(`<path d="${poly([top, bl, br])}" fill="#fff4c2" opacity="0.55" filter="${s.blur(7)}"/>`);
      s.add(`<path d="${poly([top, bl, br])}" fill="#1c1406" stroke="#1c1406" stroke-width="5" stroke-linejoin="round"/>`);
      s.add(`<g filter="${s.paint(22, 0.3, 0.07)}">`
        + `<path d="${poly([top, bl, cen])}" fill="${s.linear([[0, 0xfffdf2], [0.6, 0xf3e3a8], [1, 0xc9a85a]], 90, 70, 110, 160)}" opacity="0.95"/>`
        + `<path d="${poly([top, cen, br])}" fill="${s.linear([[0, 0xf4e6b4], [0.5, 0xd8bb6a], [1, 0x8a6a2a]], 130, 70, 160, 160)}" opacity="0.95"/>`
        + `<path d="${poly([bl, br, cen])}" fill="${s.linear([[0, 0x9a7a32], [1, 0x4a3612]], 0, 140, 0, 168)}" opacity="0.95"/></g>`);
      s.add(`<path d="${poly([[top[0], top[1] + 14], [bl[0] + 16, bl[1] - 8], [cen[0] - 6, cen[1] - 4]])}" fill="#ffffff" opacity="0.35" filter="${s.blur(2)}"/>`);
      s.add(`<path d="M${entry[0]},${entry[1]} L${exit[0]},${exit[1]}" stroke="#ffffff" stroke-width="3" opacity="0.9" filter="${s.blur(0.8)}"/>`);
      s.add(`<path d="${poly([top, bl, br])}" fill="none" stroke="#fffaf0" stroke-width="2.4" stroke-linejoin="round"/>`);
      s.add(`<path d="M${top[0]},${top[1]} L${cen[0]},${cen[1]} M${bl[0]},${bl[1]} L${cen[0]},${cen[1]} M${br[0]},${br[1]} L${cen[0]},${cen[1]}" stroke="#fffaf0" stroke-width="1.1" opacity="0.6"/>`);
      glint(s, top[0], top[1] + 4, 13, 0xfff4c2, 1, 0);
      glint(s, exit[0], exit[1], 10, 0xffffff, 1, 45);
      return [{ data: await svgLayer(s), blend: 'over' }];
    },
  },
};

// ---------- 组装 ----------
async function buildIcon(key) {
  const spec = ICONS[key];
  const color = SKILLS[key].color;
  const sources = [];
  const ctx = {
    svg(name) { const s = new Svg(`${key}-${name}`); sources.push(s); return s; },
  };
  const bg = ctx.svg('background');
  background(bg, spec);
  const layers = await spec.layers(ctx);
  const v = ctx.svg('vignette');
  vignette(v, 0.7);
  let interior = await compose(await svgLayer(bg), [...layers, { data: await svgLayer(v), blend: 'over' }]);
  interior = mulAlpha(interior, interiorMask);
  const [frameTile, flop] = spec.frame;
  const rim = ctx.svg('rim');
  rim.add(`<circle cx="128" cy="128" r="99" fill="none" stroke="${hex(color)}" stroke-width="5" opacity="0.32" filter="${rim.blur(2.5)}"/>`);
  const full = await compose(await frameBase(frameTile, flop), [{ data: interior }, { data: await svgLayer(rim), blend: 'screen' }]);
  const png = await sharp(full, { raw: RAW }).resize(TILE, TILE, { kernel: 'lanczos3' })
    .sharpen({ sigma: 0.55, m1: 0.6, m2: 1.2 }).removeAlpha().png().toBuffer();
  await writeFile(resolve(ART, 'icons', `${key}.png`), png);
  for (const s of sources) await writeFile(resolve(ART, 'layers', `${s.name}.svg`), s.toString());
  return png;
}

function label(text, x, y, size = 14, color = '#d9e3cf', anchor = 'middle') {
  return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" fill="${color}" text-anchor="${anchor}">${text}</text>`;
}
async function oldIcon(index) {
  const p = tileRGB(index);
  return sharp(p, { raw: { width: TILE, height: TILE, channels: 3 } }).png().toBuffer();
}

async function main() {
  // 每次重建生成目录，避免残留旧图层
  for (const dir of ['icons', 'layers', 'sources', 'qa']) await rm(resolve(ART, dir), { recursive: true, force: true });
  for (const dir of ['', 'icons', 'layers', 'sources', 'qa']) await mkdir(resolve(ART, dir), { recursive: true });
  await loadSources();
  interiorMask = await interiorMaskRaster();
  const tiles = {};
  for (const key of ACTIVE_SKILL_KEYS) {
    if (!ICONS[key]) throw new Error(`missing icon spec: ${key}`);
    tiles[key] = await buildIcon(key);
  }
  const rows = Math.ceil(ACTIVE_SKILL_KEYS.length / COLS);
  const atlasImg = sharp({ create: { width: COLS * TILE, height: rows * TILE, channels: 3, background: '#000303' } })
    .composite(ACTIVE_SKILL_KEYS.map((key, i) => ({ input: tiles[key], left: (i % COLS) * TILE, top: Math.floor(i / COLS) * TILE })));
  const atlasPng = await atlasImg.png().toBuffer();
  await writeFile(resolve(ART, 'skill-icons-active-v1.png'), atlasPng);
  await sharp(atlasPng).webp({ quality: 88, effort: 6, smartSubsample: true }).toFile(OUTPUT_ATLAS);
  // 微信/抖音构建会把 webp 转成调色板 PNG；用同一参数生成预览以检查渐变色带
  const webpBuf = await sharp(OUTPUT_ATLAS).toBuffer();
  await sharp(webpBuf).png({ palette: true, quality: 90, effort: 7 }).toFile(resolve(ART, 'qa', 'atlas-wechat-palette.png'));

  // 联系表：每对元素一行，旧图标 | 新图标 256/96/48
  const oldIdx = ACTIVE_SKILL_KEYS.map(key => OLD_ICON_INDEX[SKILLS[key].element]);
  const cellW = 256 + 96 + 48 + 40, rowH = 300, headW = 150;
  const sheetW = headW + cellW * 2, sheetH = rowH * 6 + 40;
  const comps = [];
  let text = label('old', headW / 2, 30, 16) + label('new 256 / 96 / 48 px', headW + cellW, 30, 16);
  for (let i = 0; i < ACTIVE_SKILL_KEYS.length; i++) {
    const key = ACTIVE_SKILL_KEYS[i];
    const row = Math.floor(i / 2), col = i % 2, y = 40 + row * rowH;
    if (col === 0) comps.push({ input: await sharp(await oldIcon(oldIdx[i])).resize(128, 128, { kernel: 'lanczos3' }).toBuffer(), left: 11, top: y + 40 });
    const x = headW + col * cellW;
    comps.push({ input: tiles[key], left: x, top: y + 10 });
    comps.push({ input: await sharp(tiles[key]).resize(96, 96, { kernel: 'lanczos3' }).toBuffer(), left: x + 262, top: y + 10 });
    comps.push({ input: await sharp(tiles[key]).resize(48, 48, { kernel: 'lanczos3' }).toBuffer(), left: x + 364, top: y + 10 });
    text += label(key, x + 128, y + 288, 15);
  }
  await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: '#111a13' } })
    .composite([...comps, { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${sheetW}" height="${sheetH}">${text}</svg>`), left: 0, top: 0 }])
    .png().toFile(resolve(ART, 'qa', 'contact-sheet.png'));

  // 小尺寸对照：游戏横屏选择卡约 46 CSS px、竖屏约 41 CSS px。第 1 行旧图标 48px，第 2 行新图标 48px，
  // 第 3 行新图标 32px（结算伤害列表），其后两行新图标 96px。
  const small = [];
  const gap = 12, smallW = 12 * (48 + gap) + gap;
  const rowsY = [gap, gap * 2 + 48, gap * 3 + 96];
  for (let i = 0; i < 12; i++) {
    const key = ACTIVE_SKILL_KEYS[i], x = gap + i * (48 + gap);
    small.push({ input: await sharp(await oldIcon(oldIdx[i])).resize(48, 48, { kernel: 'lanczos3' }).toBuffer(), left: x, top: rowsY[0] });
    small.push({ input: await sharp(tiles[key]).resize(48, 48, { kernel: 'lanczos3' }).toBuffer(), left: x, top: rowsY[1] });
    small.push({ input: await sharp(tiles[key]).resize(32, 32, { kernel: 'lanczos3' }).toBuffer(), left: x + 8, top: rowsY[2] });
    small.push({ input: await sharp(tiles[key]).resize(96, 96, { kernel: 'lanczos3' }).toBuffer(), left: gap + (i % 6) * (96 + gap * 2), top: gap * 4 + 128 + Math.floor(i / 6) * (96 + gap) });
  }
  await sharp({ create: { width: smallW, height: gap * 6 + 128 + 96 * 2, channels: 3, background: '#111a13' } })
    .composite(small).png().toFile(resolve(ART, 'qa', 'small-sizes.png'));

  const bytes = (await stat(OUTPUT_ATLAS)).size;
  console.log(`skill icons: ${ACTIVE_SKILL_KEYS.length} tiles -> ${OUTPUT_ATLAS} (${(bytes / 1024).toFixed(1)} KiB)`);
  if (bytes > 300 * 1024) throw new Error(`atlas too large: ${bytes} bytes (budget 300 KiB)`);
}

await main();
