// Shared drawing helpers for the chaos → short circuit → dark discovery block (shots 8, 9, 10).
// Everything here is drawn in the art grid (1 px = 1 hero sprite px) and is a pure function of t.
import { mix } from '../engine/color.js';
import { clamp, hash, ease, TAU } from '../engine/util.js';
import { ring, note, hit, OUT, BOTS } from './common.js';

const NOTE_COLORS = [0xffe066, 0xff9ec8, 0x9ee8ff, 0xb8f28a];

/**
 * Sticky notes blown off the desk pile and the wall, tumbling through the air.
 * They spin (the rect narrows to an edge-on sliver), flutter and settle on the floor.
 */
export function flyingPapers(art, t, t0, { n = 24, seed = 41, floorY = 171 } = {}) {
  const dt0 = t - t0;
  if (dt0 < 0) return;
  for (let k = 0; k < n; k++) {
    const dt = dt0 - hash(k, seed, 1) * 0.3;
    if (dt < 0) continue;
    const fromPile = k % 3 !== 0;
    const x0 = fromPile ? 88 + hash(k, seed, 2) * 30 : 58 + hash(k, seed, 2) * 34;
    const y0 = fromPile ? 126 + hash(k, seed, 3) * 12 : 78 + hash(k, seed, 3) * 36;
    const vx = (hash(k, seed, 4) - 0.42) * 70;
    const vy = -46 - hash(k, seed, 5) * 60;
    const g = 30;
    let x = x0 + vx * dt + Math.sin(dt * 5.5 + k) * 3.5;
    let y = y0 + vy * dt + 0.5 * g * dt * dt + Math.sin(dt * 4.1 + k * 2) * 1.6;
    const c = NOTE_COLORS[k % 4];
    let ph = Math.floor(dt * 7 + k) % 4;
    let landed = false;
    if (y > floorY - 1) { y = floorY - 1 - (k % 4); x = x0 + vx * 0.9; ph = 0; landed = true; }
    if (x < -8 || x > 328) continue;
    const wv = [6, 4, 1, 4][ph];
    const hv = landed ? 2 : [5, 5, 5, 3][ph];
    const xi = Math.round(x), yi = Math.round(y);
    art.rect(xi - 1, yi - 1, wv + 2, hv + 2, OUT);
    art.rect(xi, yi, wv, hv, ph === 2 ? mix(c, 0x000000, 0.5) : c);
    art.hline(xi, xi + wv - 1, yi, mix(c, 0xffffff, 0.3));
    if (wv > 3 && !landed) art.hline(xi + 1, xi + wv - 2, yi + 2, mix(c, 0x000000, 0.4));
  }
}

/** Cartoon "bonk" stars spiralling out of a collision point. */
export function starBurst(art, x, y, t, t0, { n = 7, seed = 7, r = 11, life = 0.55, color = 0xfff27a } = {}) {
  const dt = t - t0;
  if (dt < 0 || dt > life) return;
  const u = dt / life;
  const a0 = 1 - u;
  art.emit(() => {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + u * 2.0 + hash(k, seed) * 0.7;
      const rr = r * ease.outCubic(u) * (0.55 + hash(k, seed, 2) * 0.9);
      const sx = Math.round(x + Math.cos(a) * rr), sy = Math.round(y + Math.sin(a) * rr * 0.72 - u * 5);
      const c = k % 2 ? color : 0xffffff;
      art.dput(sx, sy, c, a0);
      art.dput(sx - 1, sy, c, a0 * 0.65); art.dput(sx + 1, sy, c, a0 * 0.65);
      art.dput(sx, sy - 1, c, a0 * 0.65); art.dput(sx, sy + 1, c, a0 * 0.65);
    }
  });
}

/** Jagged electric arc between two points (the short circuit). */
export function boltArc(art, x0, y0, x1, y1, t, { seed = 3, color = 0xffffff, jitter = 8, n = 8 } = {}) {
  const fr = Math.floor(t * 60);
  art.emit(() => {
    let px = x0, py = y0;
    for (let k = 1; k <= n; k++) {
      const u = k / n;
      const w = Math.sin(u * Math.PI);
      const nx = x0 + (x1 - x0) * u + (hash(k, seed, fr) - 0.5) * jitter * w;
      const ny = y0 + (y1 - y0) * u + (hash(k, seed + 1, fr) - 0.5) * jitter * w;
      art.line(px, py, nx, ny, k % 2 ? color : mix(color, 0x9af0ff, 0.6));
      px = nx; py = ny;
    }
  });
}

/** Flash amount for a bot that has just sounded its note. */
export const noteFlash = (t, t0, dur = 0.34) => hit(t, t0, dur, 1.4);

/**
 * The visual of a bot's note: an expanding ring at its head plus a ♪ floating up,
 * both in the bot's own colour. (The colour flash itself goes through the bot's `flash` state.)
 */
export function noteBurst(art, name, x, y, t, t0, { rMax = 15, dur = 0.5 } = {}) {
  const dt = t - t0;
  if (dt < 0 || dt > dur + 0.5) return;
  const col = BOTS[name].color;
  ring(art, x, y, clamp(dt / dur), col, rMax);
  const a = clamp(1.15 - (dt - 0.06) / (dur + 0.45));
  note(art, Math.round(x + 5), Math.round(y - 7 - dt * 13), col, a);
}

/** Classic dizzy stars circling over a bonked head for `dur` seconds after t0. */
export function dizzyStars(art, x, y, t, t0, { dur = 0.7, n = 3, r = 6, seed = 1, color = 0xfff27a } = {}) {
  const dt = t - t0;
  if (dt < 0.08 || dt > dur) return;
  const a0 = clamp((dur - dt) / 0.2);
  art.emit(() => {
    for (let k = 0; k < n; k++) {
      const a = dt * 11 + (k / n) * TAU + seed;
      const sx = Math.round(x + Math.cos(a) * r), sy = Math.round(y + Math.sin(a) * r * 0.35);
      const c = k % 2 ? 0xffffff : color;
      art.dput(sx, sy, c, a0);
      art.dput(sx - 1, sy, c, a0); art.dput(sx + 1, sy, c, a0);
      art.dput(sx, sy - 1, c, a0); art.dput(sx, sy + 1, c, a0);
    }
  });
}

/** A 4-point pixel twinkle (the "idea" glint). size 1..3. Emissive. */
export function twinkle(art, x, y, size, color = 0xfff6c0, alpha = 1) {
  if (!(alpha > 0) || size < 1) return;
  x = Math.round(x); y = Math.round(y);
  art.emit(() => {
    art.dput(x, y, 0xffffff, alpha);
    for (let i = 1; i <= size; i++) {
      const c = i === size ? color : 0xffffff;
      art.dput(x - i, y, c, alpha); art.dput(x + i, y, c, alpha);
      art.dput(x, y - i, c, alpha); art.dput(x, y + i, c, alpha);
    }
  });
}

/**
 * Electrocution frame: the lit image becomes a white field with the tagged cast as black
 * silhouettes (hero + bots). Mutates and returns img (RGB, art.w × art.h).
 */
export function silhouetteFrame(img, art, tags, { bg = 0xf4f8ff, fg = 0x06040c } = {}) {
  const set = new Set(tags);
  const n = art.w * art.h;
  for (let i = 0; i < n; i++) {
    const c = set.has(art.tag[i]) ? fg : bg;
    img[i * 3] = (c >> 16) & 255; img[i * 3 + 1] = (c >> 8) & 255; img[i * 3 + 2] = c & 255;
  }
  return img;
}
