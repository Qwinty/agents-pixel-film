// Small deterministic helpers: math, easing, hashing noise. No Math.random anywhere in the film.

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a));
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const fract = (v) => v - Math.floor(v);
export const TAU = Math.PI * 2;

export const ease = {
  linear: (t) => clamp(t),
  inQuad: (t) => { t = clamp(t); return t * t; },
  outQuad: (t) => { t = clamp(t); return 1 - (1 - t) * (1 - t); },
  inOutQuad: (t) => { t = clamp(t); return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); },
  inCubic: (t) => { t = clamp(t); return t * t * t; },
  outCubic: (t) => { t = clamp(t); return 1 - (1 - t) ** 3; },
  inOutCubic: (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2; },
  outExpo: (t) => { t = clamp(t); return t >= 1 ? 1 : 1 - 2 ** (-10 * t); },
  inExpo: (t) => { t = clamp(t); return t <= 0 ? 0 : 2 ** (10 * t - 10); },
  outBack: (t, s = 1.70158) => { t = clamp(t) - 1; return 1 + (s + 1) * t * t * t + s * t * t; },
  outElastic: (t) => {
    t = clamp(t);
    if (t === 0 || t === 1) return t;
    return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1;
  },
  outBounce: (t) => {
    t = clamp(t);
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};

/** Integer hash → [0,1). Pure function of its integer inputs. */
export function hash(...ns) {
  let h = 0x811c9dc5 | 0;
  for (let n of ns) {
    n = Math.floor(n) | 0;
    h = Math.imul(h ^ (n & 0xff), 16777619);
    h = Math.imul(h ^ ((n >>> 8) & 0xff), 16777619);
    h = Math.imul(h ^ ((n >>> 16) & 0xff), 16777619);
    h = Math.imul(h ^ (n >>> 24), 16777619);
  }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Seeded PRNG (mulberry32) — for building static layouts deterministically. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 1D value noise, smooth, in [-1,1]. */
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const a = hash(i, seed) * 2 - 1, b = hash(i + 1, seed) * 2 - 1;
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

/** 2D value noise in [0,1]. */
export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** 4×4 Bayer matrix threshold in (0,1). */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x, y) => (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

/** Piecewise keyframe interpolation: keys = [[t, v], ...] sorted by t. */
export function keys(t, ks, easeFn = ease.inOutQuad) {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i][0]) {
      const [t0, v0] = ks[i - 1], [t1, v1, e] = ks[i];
      const u = (e || easeFn)((t - t0) / (t1 - t0));
      return v0 + (v1 - v0) * u;
    }
  }
  return ks[ks.length - 1][1];
}

/** Step function: returns value of last key whose t <= time. */
export function step(t, ks) {
  let v = ks[0][1];
  for (const [kt, kv] of ks) if (t >= kt) v = kv;
  return v;
}
