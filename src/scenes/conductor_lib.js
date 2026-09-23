// Helpers shared by the conductor (shot 11) and the montage (shot 12): the hero's baton pattern
// and cue pointing, the rhythmic light level, the bots' on-beat actions and small FX
// (glints, gold stars, code log on the screen, tape on the power strip).
// Everything is a pure function of global time t, drawn in the art grid (1 px = 1 hero px).
import { mix } from '../engine/color.js';
import { clamp, hash, ease, lerp, fract, TAU } from '../engine/util.js';
import { ik2, heroShoulder, hit, prog, ambientFor, DARK, OUT, L, CUES, BEAT, BAR, b } from './common.js';
import { HERO_STAND, STATION } from './blocking.js';
import { FONTS, drawText } from '../engine/font.js';

export const LAYERS = CUES.layers;
export const T11 = b(14);          // the grid origin of the conductor section
export const CUE_ORDER = ['coder', 'barista', 'designer', 'tester'];

/** Beat index since `t0` (integer) and phase in the beat (0..1). */
export function beatOf(t, t0 = T11) {
  const q = (t - t0) / BEAT;
  const n = Math.floor(q + 1e-6);
  return { n, u: q - n, tb: t0 + n * BEAT };
}

/** Envelope that jumps at every beat and decays (dur s). */
export function onBeat(t, dur = 0.2, curve = 2, t0 = T11) {
  const { tb } = beatOf(t, t0);
  return hit(t, tb, dur, curve);
}

// ---- the hero's baton ----------------------------------------------------------------------------
export const SH_FAR = heroShoulder(HERO_STAND.x, HERO_STAND.y, 'far');   // [125.5, 151.5]
const ARM1 = 6.5, ARM2 = 6.5;

// 4/4 conducting pattern: ictus of each beat relative to the far shoulder (down · in · out · up)
const PAT = [[6, 4], [0, 1], [11, 0], [7, -5]];

/** Where the baton hand is in the standard 4/4 pattern at time t (relative to the shoulder). */
function patternHand(t) {
  const { n, u } = beatOf(t);
  const k = ((n % 4) + 4) % 4;
  const P0 = PAT[k], P1 = PAT[(k + 1) % 4];
  const R = k === 3 ? 10 : 3.5;                 // the big up-swing into every downbeat
  const e = Math.pow(u, 1.55);                  // accelerate INTO the ictus (crisp beat point)
  const arc = Math.sin(Math.PI * Math.pow(u, 0.72));
  return [lerp(P0[0], P1[0], e), lerp(P0[1], P1[1], e) - R * arc];
}

/** Aim point (world) the hero cues for each bot: its body centre. */
export const CUE_AIM = {
  coder: [STATION.coder.x + 1, STATION.coder.y - 12],
  barista: [STATION.barista.x, STATION.barista.y - 11],
  designer: [STATION.designer.x, STATION.designer.y - 12],
  tester: [STATION.tester.x, STATION.tester.y - 8],
};

/** Weight 0..1 of the "point at the bot" gesture for a cue at tc (snap in, hold ~a beat, release). */
export function cueWeight(t, tc) {
  if (t < tc - 0.13 || t > tc + BEAT) return 0;
  const inn = ease.outBack(prog(t, tc - 0.12, tc + 0.02));
  const out = 1 - ease.inOutQuad(prog(t, tc + BEAT * 0.6, tc + BEAT * 0.97));
  return Math.min(inn, out);
}

/**
 * The hero's conductor pose at t. cues: [[time, botName], ...]. Returns drawHero opts
 * (far = baton arm, near = free hand) plus the name of the bot currently being cued.
 */
export function conductorPose(t, cues, { amp = 1 } = {}) {
  let [hx, hy] = patternHand(t);
  hx *= amp; hy *= amp;
  let w = 0, cued = null;
  for (const [tc, name] of cues) {
    const wc = cueWeight(t, tc);
    if (wc > w) { w = wc; cued = name; }
  }
  // baton: points up-right, flicks down through every ictus
  const { tb } = beatOf(t);
  const flick = hit(t, tb, 0.2, 1.6);
  let batonA = -0.85 + 1.0 * flick;
  let batonLen = 9;
  if (cued) {
    const [ax, ay] = CUE_AIM[cued];
    const dir = Math.atan2(ay - SH_FAR[1], ax - SH_FAR[0]);
    const px = Math.cos(dir) * 12.6, py = Math.sin(dir) * 12.6;
    const wc = Math.min(1.08, w);
    hx = lerp(hx, px, wc); hy = lerp(hy, py, wc);
    // baton aligns with the pointing direction (normalised angle blend)
    let d = dir - batonA; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
    batonA += d * clamp(w);
    batonLen = 9 + 3 * clamp(w);
  }
  // two IK solutions: take the one with the elbow down/out (natural conductor's elbow)
  const S = SH_FAR, T = [S[0] + hx, S[1] + hy];
  const A = ik2(S, T, ARM1, ARM2), B = ik2(S, T, ARM1, ARM2, { elbowUp: true });
  const sc = (s) => Math.sin(s.a) + 0.6 * Math.cos(s.a);
  const arm = sc(A) >= sc(B) ? A : B;
  const far = { ...arm, hand: 'baton', batonA, batonLen };

  // free hand: shapes the dynamics — a soft bob on each beat, opens toward the cued bot
  let near = { a: Math.PI / 2 + 0.34 - 0.14 * flick, len: 8, hand: 'open' };
  if (cued) {
    const open = cued === 'designer' ? Math.PI + 0.35 : Math.PI / 2 + 0.95;
    near = { a: lerp(near.a, open, clamp(w)), len: 8 + clamp(w), hand: 'open' };
  }
  const lookX = cued ? (cued === 'designer' ? -1 : 1) : 0;
  const lookY = cued === 'coder' ? -1 : 0;
  return { far, near, cued, w, lookX, lookY, bob: flick > 0.55 ? 1 : 0 };
}

// ---- light returns in rhythm ---------------------------------------------------------------------
/**
 * Room ambient for the conductor: from the dark-room level up to the full night/dawn level in
 * steps on every layer downbeat, plus a small lift on every beat.
 */
export function rhythmAmbient(st, t) {
  const full = ambientFor(st), dark = DARK.ambient;
  const steps = [[LAYERS.coder, 0.55], [LAYERS.barista, 0.72], [LAYERS.designer, 0.86], [LAYERS.tester, 1.0]];
  let lv = 0;
  for (const [ts, v] of steps) if (t >= ts) lv = v;
  // each step overshoots a little and settles (the lights "kick in")
  for (const [ts] of steps) lv += 0.12 * hit(t, ts, 0.35, 2);
  lv += 0.05 * onBeat(t, 0.22, 2);
  lv = Math.min(1.12, lv);
  return [0, 1, 2].map((i) => dark[i] + (full[i] - dark[i]) * lv);
}

// ---- small FX -----------------------------------------------------------------------------------
/** A 4-point glint (emissive cross) at (x,y); k 0..1 (grows then shrinks). */
export function glint(art, x, y, k, color = 0xffffff, size = 4) {
  if (!(k > 0 && k < 1)) return;
  const r = Math.round(Math.sin(k * Math.PI) * size);
  x = Math.round(x); y = Math.round(y);
  art.emit(() => {
    art.put(x, y, 0xffffff);
    for (let i = 1; i <= r; i++) {
      const c = i === r ? mix(color, 0x000000, 0.25) : color;
      art.put(x + i, y, c); art.put(x - i, y, c); art.put(x, y + i, c); art.put(x, y - i, c);
    }
    if (r >= 2) { art.put(x + 1, y + 1, color); art.put(x - 1, y - 1, color); art.put(x + 1, y - 1, color); art.put(x - 1, y + 1, color); }
  });
}

const STAR5 = ['..#..', '..#..', '#####', '.###.', '.#.#.'];
const STAR7 = ['...#...', '...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'];
/** A gold star on the wall (outlined, emissive when `glow`). */
export function goldStar(art, x, y, { big = false, color = 0xffd98a, glow = 1 } = {}) {
  const G = big ? STAR7 : STAR5;
  const ox = Math.round(x) - (G[0].length >> 1), oy = Math.round(y) - (G.length >> 1);
  const inG = (i, j) => G[j]?.[i] === '#';
  const draw = () => {
    for (let j = -1; j <= G.length; j++) for (let i = -1; i <= G[0].length; i++) {
      if (inG(i, j)) continue;
      if (inG(i - 1, j) || inG(i + 1, j) || inG(i, j - 1) || inG(i, j + 1)) art.put(ox + i, oy + j, mix(color, 0x2b2150, 0.7));
    }
    for (let j = 0; j < G.length; j++) for (let i = 0; i < G[0].length; i++) if (inG(i, j)) {
      art.put(ox + i, oy + j, j <= 2 ? mix(color, 0xffffff, 0.45) : color);
    }
  };
  if (glow > 0) art.both(draw); else draw();
}

/** Pixel "code" typing into the free strip of the monitor under the progress bar. */
export function screenLog(art, t, t0, { rows = 2, doneAt = null } = {}) {
  const sc = L.screen;
  const x0 = sc.x + 3, y0 = sc.y + 27, wmax = sc.w - 6;
  const s16 = BEAT / 4;
  const tt = doneAt !== null ? Math.min(t, doneAt) : t;
  const typed = Math.max(0, Math.floor((tt - t0) / s16));  // one glyph per sixteenth
  const perLine = 4;                                       // a line per beat
  art.emit(() => {
    for (let r = 0; r < rows; r++) {
      const li = Math.floor(typed / perLine) - (rows - 1 - r);
      if (li < 0) continue;
      const n = r === rows - 1 ? (typed % perLine) + 1 : perLine;
      const indent = Math.floor(hash(li, 31) * 3) * 3;
      let x = x0 + indent;
      for (let k = 0; k < n && x < x0 + wmax; k++) {
        const len = 2 + Math.floor(hash(li, k, 32) * 6);
        const col = k === 0 ? 0x9ad8ff : hash(li, k, 33) > 0.6 ? 0x7dff9a : 0xc8d8f0;
        const yy = y0 + r * 3;
        art.hline(x, Math.min(x0 + wmax - 1, x + len - 1), yy, r === rows - 1 ? col : mix(col, 0x0c1a2c, 0.45));
        x += len + 2;
      }
    }
    if (doneAt !== null && t >= doneAt) {
      const k = hit(t, doneAt, 0.3, 1);
      drawText(art, FONTS.tiny, '✓ done', x0 + wmax - 26, y0 - 1, mix(0x7dff9a, 0xffffff, k));
    }
  });
}

/** Grey duct-tape bands wrapped around the power strip (n bands, the newest one flashing). */
export function stripTape(art, n, flash = 0) {
  const s = L.strip;
  const xs = [s.x + 8, s.x + 13, s.x + 18];
  for (let i = 0; i < Math.min(n, xs.length); i++) {
    const x = xs[i];
    art.rect(x - 1, s.y - 2, 4, s.h + 4, OUT);
    art.rect(x, s.y - 1, 2, s.h + 2, 0xa8b0b8);
    art.vline(x, s.y - 1, s.y + s.h, 0xd0d8e0);
    art.put(x + 1, s.y + s.h, 0x80888f);
    if (i === n - 1 && flash > 0) art.emit(() => art.drect(x, s.y - 1, 2, s.h + 2, 0xeaffd8, flash));
  }
}

/** Pink droplets pulled from a stretch of river into a spout (the barista's gulp). */
export function slurp(art, t, t0, from, to, { n = 14, dur = 0.2, seed = 3, color = 0xff5fc8 } = {}) {
  const dt = t - t0;
  if (dt < 0 || dt > dur + 0.1) return;
  art.both(() => {
    for (let k = 0; k < n; k++) {
      const u = clamp((dt - hash(k, seed) * 0.1) / dur);
      if (u <= 0 || u >= 1) continue;
      const src = from[Math.floor(hash(k, seed, 1) * from.length)];
      const e = ease.inQuad(u);
      const x = lerp(src[0], to[0], e), y = lerp(src[1], to[1], e) - Math.sin(u * Math.PI) * (6 + hash(k, seed, 2) * 6);
      const c = k % 3 ? color : mix(color, 0xffffff, 0.45);
      art.put(Math.round(x), Math.round(y), c);
      if (k % 2 === 0) art.put(Math.round(x) + 1, Math.round(y), mix(color, 0x000000, 0.2));
    }
  });
}

/** An arc of sparkles flying from a to b over [t0, t0+dur] (paint flung by the brush). */
export function sparkArc(art, t, t0, a, bpt, { dur = 0.16, arc = 10, color = 0xffd98a, n = 7 } = {}) {
  const u = (t - t0) / dur;
  if (u < 0 || u > 1.25) return;
  art.emit(() => {
    for (let k = 0; k < n; k++) {
      const v = clamp(u - k * 0.06);
      if (v <= 0 || v >= 1) continue;
      const x = lerp(a[0], bpt[0], v), y = lerp(a[1], bpt[1], v) - Math.sin(v * Math.PI) * arc;
      art.put(Math.round(x), Math.round(y), k === 0 ? 0xffffff : k < 3 ? color : mix(color, 0x5a3a20, 0.4));
    }
  });
}

export { hit, prog, fract };
