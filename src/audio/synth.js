// A tiny deterministic synth library for the film's soundtrack.
//
// Everything here is environment-agnostic (no `node:` imports, no Web Audio, no Math.random),
// so the same code can be used by the Node renderer and by a browser HTML player.
//
// The model is dead simple and fully offline:
//   * `createMix(sr, dur)` allocates a handful of stereo buses (Float32Array pairs).
//   * `place(mix, t, dur, gen, opts)` renders one mono generator into the buses at an exact
//     sample offset, with equal-power panning and reverb/delay send amounts.
//   * the score builds the whole film as a few thousand `place()` calls, then `master()`
//     folds the buses down, applies reverb/delay/ducking/limiting and cuts the silences.
//
// All randomness is seeded (mulberry32) and derived from the event's own start time,
// so two renders of the same score are bit-identical.

export const TAU = Math.PI * 2;

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dbToGain = (db) => 10 ** (db / 20);
export const gainToDb = (g) => 20 * Math.log10(Math.max(Math.abs(g), 1e-12));

// ---------------------------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------------------------

export const midiToFreq = (m) => 440 * 2 ** ((m - 69) / 12);

const PITCH_CLASS = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

/** "C3" → 48, "E4" → 64, "G4" → 67, "C6" → 84 (MIDI convention, C4 = 60). */
export function note(name) {
  const m = /^([A-G](?:#|b)?)(-?\d+)$/.exec(name);
  if (!m) throw new Error(`bad note name: ${name}`);
  return PITCH_CLASS[m[1]] + (parseInt(m[2], 10) + 1) * 12;
}

// ---------------------------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------------------------

/** mulberry32 — small, fast, good enough for noise. */
export function rng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed that depends only on WHEN a sound happens (+ a salt), so re-ordering the score is safe. */
export function seedFrom(t, salt = 0) {
  const a = Math.round(t * 1e4) | 0;
  let h = Math.imul(a ^ 0x2545f491, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) || 1;
}

/** White noise in [-1, 1). */
export function noiseGen(seed) {
  const r = rng(seed);
  return () => r() * 2 - 1;
}

// ---------------------------------------------------------------------------------------------
// Band-limited oscillators (PolyBLEP)
// ---------------------------------------------------------------------------------------------

function polyBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

/** Sine. Returns a stepper `(freq) => sample`. */
export function sineOsc(sr, phase = 0) {
  let p = phase;
  return (freq) => { p += freq / sr; if (p >= 1) p -= 1; return Math.sin(TAU * p); };
}

/** Band-limited saw. */
export function sawOsc(sr, phase = 0) {
  let p = phase;
  return (freq) => {
    const dt = Math.abs(freq) / sr;
    p += dt; if (p >= 1) p -= 1;
    return 2 * p - 1 - polyBlep(p, dt);
  };
}

/** Band-limited pulse. `width` is the duty cycle; 0.5 = square. */
export function pulseOsc(sr, width = 0.5, phase = 0) {
  let p = phase;
  return (freq, w = width) => {
    const dt = Math.abs(freq) / sr;
    p += dt; if (p >= 1) p -= 1;
    let v = p < w ? 1 : -1;
    v += polyBlep(p, dt);
    let p2 = p - w; if (p2 < 0) p2 += 1;
    v -= polyBlep(p2, dt);
    return v;
  };
}

/** Triangle: a band-limited square run through a leaky integrator. Amplitude ≈ 1. */
export function triOsc(sr, phase = 0) {
  let p = phase, y = 0;
  return (freq) => {
    const dt = Math.abs(freq) / sr;
    p += dt; if (p >= 1) p -= 1;
    let v = p < 0.5 ? 1 : -1;
    v += polyBlep(p, dt);
    let p2 = p - 0.5; if (p2 < 0) p2 += 1;
    v -= polyBlep(p2, dt);
    y = y * 0.9995 + v * dt * 4;
    return y;
  };
}

// ---------------------------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------------------------

/** One-pole lowpass. `(x, fc) => y`; fc may change every sample (cheap coefficient). */
export function lp1(sr, fc0 = 1000) {
  let y = 0;
  return (x, fc = fc0) => { const c = fc >= sr * 0.45 ? 1 : Math.min(1, TAU * fc / sr); y += (x - y) * c; return y; };
}

/** One-pole highpass. */
export function hp1(sr, fc0 = 100) {
  const lp = lp1(sr, fc0);
  return (x, fc = fc0) => x - lp(x, fc);
}

/**
 * State-variable filter, TPT / zero-delay-feedback topology (Zavalishin).
 * Unconditionally stable at any cutoff and Q — which matters here, because several effects
 * sweep the cutoff from 15 kHz down to 300 Hz inside a single event.
 * `(x, fc, q) => y` of the chosen type.
 */
export function svf(sr, type = 'lp', q0 = 1) {
  let ic1 = 0, ic2 = 0;
  let cFc = -1, cQ = -1, a1 = 0, a2 = 0, a3 = 0, k = 0;
  const maxFc = sr * 0.48;
  return (x, fc, q = q0) => {
    const f = fc < 10 ? 10 : fc > maxFc ? maxFc : fc;
    if (f !== cFc || q !== cQ) {
      cFc = f; cQ = q;
      const g = Math.tan(Math.PI * f / sr);
      k = 1 / (q < 0.05 ? 0.05 : q);
      a1 = 1 / (1 + g * (g + k));
      a2 = g * a1;
      a3 = g * a2;
    }
    const v3 = x - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    if (!Number.isFinite(ic1) || !Number.isFinite(ic2)) { ic1 = 0; ic2 = 0; return 0; }
    return type === 'lp' ? v2 : type === 'hp' ? (x - k * v1 - v2) : type === 'bp' ? v1 : v2;
  };
}

/** Sample-rate + bit-depth reducer for the chaos section. */
export function crusher(sr, rate = 8000, bits = 6) {
  const step = Math.min(1, rate / sr);
  const levels = 2 ** (bits - 1);
  let acc = 1, hold = 0;
  return (x) => { acc += step; if (acc >= 1) { acc -= 1; hold = Math.round(x * levels) / levels; } return hold; };
}

/**
 * Gentle saturation. Transparent (unity) below 0.75, then a smooth parabolic knee that
 * reaches exactly 1.0 with zero slope — continuous in value and derivative, so it colours
 * only the peaks it is actually catching.
 */
export function softClip(x) {
  const a = x < 0 ? -x : x;
  if (a <= 0.75) return x;
  if (a >= 1.25) return x < 0 ? -1 : 1;
  const t = (a - 0.75) * 2;                     // 0 → 1 across the knee
  const y = 0.75 + 0.25 * t * (2 - t);
  return x < 0 ? -y : y;
}

// ---------------------------------------------------------------------------------------------
// Envelopes
// ---------------------------------------------------------------------------------------------

/**
 * ADSR as a function of sample index. `hold` = seconds the note is held before release.
 * Total length of the event is `hold + r`.
 */
export function adsr(sr, { a = 0.005, d = 0.08, s = 0.5, r = 0.12 }, hold) {
  const A = Math.max(1, a * sr), D = Math.max(1, d * sr), R = Math.max(1, r * sr);
  const G = Math.max(A, hold * sr);
  const levelAt = (i) => { const k = (i - A) / D; return k >= 1 ? s : 1 + (s - 1) * Math.max(0, k); };
  const relLevel = levelAt(G);
  return (i) => {
    if (i < A) return i / A;
    if (i < G) return levelAt(i);
    const k = (i - G) / R;
    return k >= 1 ? 0 : relLevel * (1 - k) ** 1.6;
  };
}
export const adsrLen = (o, hold) => hold + (o.r ?? 0.12);

/** Percussive exponential decay with a short click-free attack. */
export function decayEnv(sr, tau, attack = 0.0015) {
  const A = Math.max(1, attack * sr), k = -1 / Math.max(1, tau * sr);
  return (i) => (i < A ? i / A : 1) * Math.exp(k * i);
}

/** Bell-shaped 0→1→0 over the event (u = i/N). */
export const bellEnv = (u, shape = 1.4) => Math.sin(Math.PI * clamp(u)) ** shape;

// ---------------------------------------------------------------------------------------------
// The mix: a few stereo buses everything is rendered into
// ---------------------------------------------------------------------------------------------

const stereo = (n) => ({ L: new Float32Array(n), R: new Float32Array(n) });

export function createMix(sr, dur) {
  const n = Math.round(sr * dur);
  return {
    sr, n, dur,
    main: stereo(n),   // everything except pads
    pad: stereo(n),    // pads/arps — gets ducked under the kick
    rev: stereo(n),    // reverb send
    del: stereo(n),    // delay send
    kicks: [],         // kick times, for the sidechain duck
    cuts: [],          // ascending hard-cut times: no sound is allowed to cross one
  };
}

/** Equal-power pan: -1 = hard left, 0 = centre, +1 = hard right. */
export function panGains(pan) {
  const a = (clamp(pan, -1, 1) + 1) * (Math.PI / 4);
  return [Math.cos(a), Math.sin(a)];
}

/**
 * Render one mono generator into the mix.
 *
 * @param mix   from createMix()
 * @param t     start time in seconds (snapped to the nearest sample — every cue lands < 0.02 ms off)
 * @param dur   length in seconds
 * @param gen   (i, u) => sample, where i is the sample index and u = i/N
 * @param o     { gain, pan (number|(u)=>number), rev, del, bus: 'main'|'pad' }
 */
export function place(mix, t, dur, gen, o = {}) {
  const i0 = Math.round(t * mix.sr);
  const N = Math.max(1, Math.round(dur * mix.sr));
  // Hard cuts: a sound that started before a cut is truncated at it and never resumes on the
  // other side. This is what keeps the blackout and the cut-to-black absolutely dead — without
  // it, the 1.4-second crash of the short circuit would still be ringing when the lights come
  // back up on the dark room. N itself is left alone so envelopes keep their intended shape.
  let stopAt = N;
  for (const c of mix.cuts) {
    if (t >= c) continue;
    stopAt = Math.max(0, Math.min(N, Math.round(c * mix.sr) - i0));
    break;
  }
  const gain = o.gain ?? 1;
  const revAmt = o.rev ?? 0, delAmt = o.del ?? 0;
  const bus = o.bus === 'pad' ? mix.pad : mix.main;
  const bL = bus.L, bR = bus.R, rL = mix.rev.L, rR = mix.rev.R, dL = mix.del.L, dR = mix.del.R;
  const panFn = typeof o.pan === 'function' ? o.pan : null;
  let gl = 1, gr = 1;
  if (!panFn) { const g = panGains(o.pan ?? 0); gl = g[0] * gain; gr = g[1] * gain; }

  const start = Math.max(0, -i0);
  const end = Math.min(stopAt, mix.n - i0);
  for (let i = start; i < end; i++) {
    const u = i / N;
    let s = gen(i, u);
    if (!(s > 0 || s < 0)) continue;              // skips exact zeros and any stray NaN
    if (s > 8) s = 8; else if (s < -8) s = -8;    // belt-and-braces: never poison a bus
    if (panFn) { const g = panGains(panFn(u)); gl = g[0] * gain; gr = g[1] * gain; }
    const j = i0 + i;
    const l = s * gl, r = s * gr;
    bL[j] += l; bR[j] += r;
    if (revAmt !== 0) { rL[j] += l * revAmt; rR[j] += r * revAmt; }
    if (delAmt !== 0) { dL[j] += l * delAmt; dR[j] += r * delAmt; }
  }
}

// ---------------------------------------------------------------------------------------------
// Reverb — a compact Freeverb (8 combs + 4 allpasses per channel)
// ---------------------------------------------------------------------------------------------

const COMB_T = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const AP_T = [556, 441, 341, 225];
const SPREAD = 23;

export function makeReverb(sr, { room = 0.85, damp = 0.3 } = {}) {
  const sc = sr / 44100;
  const fb = 0.7 + clamp(room) * 0.28;
  const build = (off) => ({
    combs: COMB_T.map((t) => ({ buf: new Float32Array(Math.round(t * sc) + off), i: 0, store: 0 })),
    aps: AP_T.map((t) => ({ buf: new Float32Array(Math.round(t * sc) + off), i: 0 })),
  });
  const ch = [build(0), build(Math.round(SPREAD * sc))];
  const d1 = clamp(damp), d2 = 1 - d1;

  const one = (c, x) => {
    let out = 0;
    for (const k of c.combs) {
      const y = k.buf[k.i];
      k.store = y * d2 + k.store * d1;
      k.buf[k.i] = x + k.store * fb;
      if (++k.i >= k.buf.length) k.i = 0;
      out += y;
    }
    out *= 0.16;
    for (const a of c.aps) {
      const y = a.buf[a.i];
      a.buf[a.i] = out + y * 0.5;
      if (++a.i >= a.buf.length) a.i = 0;
      out = y - out;
    }
    return out;
  };

  return {
    tickL: (x) => one(ch[0], x),
    tickR: (x) => one(ch[1], x),
    reset() {
      for (const c of ch) {
        for (const k of c.combs) { k.buf.fill(0); k.store = 0; }
        for (const a of c.aps) a.buf.fill(0);
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Stereo ping-pong delay
// ---------------------------------------------------------------------------------------------

export function makeDelay(sr, { time = 0.234375, feedback = 0.34, damp = 3200 } = {}) {
  const n = Math.max(2, Math.round(time * sr));
  const bl = new Float32Array(n), br = new Float32Array(n);
  let i = 0;
  const fl = lp1(sr, damp), fr = lp1(sr, damp);
  return {
    tick(l, r) {
      const yl = bl[i], yr = br[i];
      // ping-pong: left feeds right and vice versa
      bl[i] = l + fl(yr, damp) * feedback;
      br[i] = r + fr(yl, damp) * feedback;
      if (++i >= n) i = 0;
      return [yl, yr];
    },
    reset() { bl.fill(0); br.fill(0); },
  };
}

// ---------------------------------------------------------------------------------------------
// Lookahead limiter (offline: we can simply look forward in the array)
// ---------------------------------------------------------------------------------------------

export function limiter(L, R, sr, { ceiling = dbToGain(-1.6), lookahead = 0.006, release = 0.18 } = {}) {
  const n = L.length;
  const LA = Math.max(1, Math.round(lookahead * sr));
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    g[i] = p > ceiling ? ceiling / p : 1;
  }
  // gm[i] = min(g[i .. i+LA]) — gain reduction starts LA samples *before* the peak lands.
  // Implemented as a plain backward-looking sliding-window minimum over the reversed array.
  const gm = new Float32Array(n);
  const dq = new Int32Array(n + 1);
  let head = 0, tail = 0;
  for (let k = 0; k < n; k++) {
    const v = g[n - 1 - k];
    while (tail > head && g[n - 1 - dq[tail - 1]] >= v) tail--;
    dq[tail++] = k;
    while (dq[head] < k - LA) head++;
    gm[n - 1 - k] = g[n - 1 - dq[head]];
  }
  const aC = 1 - Math.exp(-1 / (0.0012 * sr));
  const rC = 1 - Math.exp(-1 / (release * sr));
  let gs = 1;
  for (let i = 0; i < n; i++) {
    const target = gm[i];
    gs += (target - gs) * (target < gs ? aC : rC);
    L[i] = softClip(L[i] * gs / ceiling) * ceiling;
    R[i] = softClip(R[i] * gs / ceiling) * ceiling;
  }
}

// ---------------------------------------------------------------------------------------------
// Measurement helpers
// ---------------------------------------------------------------------------------------------

export function rmsDb(L, R, i0, i1) {
  let acc = 0; const n = Math.max(1, i1 - i0);
  for (let i = i0; i < i1; i++) acc += L[i] * L[i] + R[i] * R[i];
  return gainToDb(Math.sqrt(acc / (2 * n)));
}
export function peakDb(L, R, i0 = 0, i1 = L.length) {
  let p = 0;
  for (let i = i0; i < i1; i++) { const a = Math.abs(L[i]), b = Math.abs(R[i]); if (a > p) p = a; if (b > p) p = b; }
  return gainToDb(p);
}
