// Shared drawing helpers for the chaos chain (shots 4–7): the code avalanche, liquid pours and
// splashes, paint splats, footstep dust and the tester's hammer envelope.
// Everything here is a pure function of time — no state, no Math.random.
import { hash, clamp, smooth, ease, keys, noise1, TAU } from '../engine/util.js';
import { mix } from '../engine/color.js';

export const OUT = 0x020302;
export const CODE_COLORS = [0x7dff9a, 0x9ad8ff, 0xe8f0ff];
/** Weighted pick from the code palette: mostly green, some cyan, a little white. */
export const codeColor = (h) => (h < 0.62 ? CODE_COLORS[0] : h < 0.92 ? CODE_COLORS[1] : CODE_COLORS[2]);

// ---- code avalanche (shot 4) --------------------------------------------------------------
/**
 * The heap of code on the desk: a mound in front of the monitor.
 * spec = { cx, wL, wR, h, baseY, surge? }  — centre x, half-widths to the left / right, peak height,
 * front baseline y (where it sits on the desk), surge = x of a bright wave front (the shove).
 */
export function heapHeight(x, spec, t = 0) {
  const { cx, wL, wR, h } = spec;
  if (!(h > 0.3)) return 0;
  const u = (x - cx) / (x < cx ? wL : wR);
  if (u <= -1 || u >= 1) return 0;
  const p = Math.pow(1 - u * u, 0.8);
  const churn = noise1(x * 0.45 + t * 6, 3) * 1.1 + (hash(Math.floor(x), 41) - 0.5) * 0.8;
  let v = h * p + churn * clamp(h / 5) * (0.35 + p * 0.65);
  if (spec.surge != null) v += 2.5 * Math.max(0, 1 - Math.abs(x - spec.surge) / 4) * clamp(h / 6);
  return Math.max(0, v);
}
/** Surface y of the heap at x (what falling glyphs land on). */
export const heapSurface = (x, spec, t) => spec.baseY - heapHeight(x, spec, t);

const HEAP_BODY = 0x0b2017;
/**
 * The heap itself: a solid dark-green mass packed with rows of glyph dashes that churn outward
 * and down the slopes; the crest is emissive so it glows like the screen it came out of.
 */
export function codeHeap(art, t, spec) {
  const x0 = Math.floor(spec.cx - spec.wL) - 1, x1 = Math.ceil(spec.cx + spec.wR) + 1;
  const flow = t * 18;
  for (let x = x0; x <= x1; x++) {
    const n = Math.round(heapHeight(x, spec, t));
    if (n < 1) continue;
    const dir = x < spec.cx ? -1 : 1;
    const wave = spec.surge != null && Math.abs(x - spec.surge) < 3;
    for (let j = 0; j < n; j++) {
      const y = spec.baseY - j;
      const sx = x - dir * Math.floor(flow * (0.6 + (j % 3) * 0.3));
      const cell = Math.floor(sx / 3);
      const c = codeColor(hash(cell, j, 5));
      if (j >= n - 1) {
        art.emit(() => art.put(x, y, wave ? 0xe8fff0 : c));
        art.put(x, y - 1, OUT);
        continue;
      }
      if (hash(cell, j, 11) < 0.3 || (sx % 3 + 3) % 3 === 2 && hash(cell, j, 12) < 0.5) { art.put(x, y, HEAP_BODY); continue; }
      const deep = 1 - j / n;                     // 1 at the desk → darker (self-shadow)
      if (hash(cell, j, Math.floor(t * 10)) > 0.93 || (wave && j > n - 4)) art.emit(() => art.put(x, y, c));
      else art.put(x, y, mix(c, HEAP_BODY, 0.2 + 0.45 * deep));
    }
  }
}

/**
 * The avalanche leaving the screen: rain of code dashes (lines of code seen falling) sliding out
 * of the bottom of the screen, over the monitor chin, onto the heap. k = density 0..1.
 */
export function codeCurtain(art, t, spec, o = {}) {
  const { x0 = 176, x1 = 226, y0 = 118, k = 1, speed = 80 } = o;
  if (!(k > 0)) return;
  for (let cx = x0; cx <= x1; cx += 4) {
    const col = cx >> 2;
    const u = (cx - x0) / Math.max(1, x1 - x0);
    const dens = k * Math.min(1, Math.min(u, 1 - u) * 5 + 0.25);
    const v = speed * (0.8 + hash(col, 32) * 0.5);
    const off = hash(col, 35) * 40;
    for (let y = y0; y < spec.baseY; y++) {
      const ys = y - t * v + off;
      const row = Math.floor(ys / 3);
      if (((ys % 3) + 3) % 3 >= 1) continue;             // one dash every 3 rows
      if (hash(col, row, 33) > dens) continue;
      const len = 1 + Math.floor(hash(col, row, 36) * 3);
      const dx = Math.floor(hash(col, row, 37) * (4 - len));
      const c = codeColor(hash(col, row, 34));
      for (let i = 0; i < len; i++) {
        const x = cx + dx + i;
        const yEnd = Math.min(spec.baseY, Math.floor(heapSurface(x, spec, t)));
        if (y >= yEnd) continue;
        art.emit(() => art.put(x, y, y >= yEnd - 2 ? mix(c, 0xffffff, 0.35) : c));
      }
    }
  }
}

/**
 * Loose glyphs flung out of the avalanche: emitted from the rect [x0..x1]×[y0] with a velocity
 * spread, falling with gravity until they hit `landY(x)` (then they are part of whatever they hit).
 */
export function glyphSpray(art, t, t0, t1, o = {}) {
  const { x0, x1, y0, vx = [-20, 20], vy = [-30, 0], rate = 90, g = 320, life = 0.9, seed = 1,
    landY = () => 999 } = o;
  if (t <= t0) return;
  const kNow = Math.floor((Math.min(t, t1) - t0) * rate);
  const kMin = Math.max(0, Math.floor((t - life - t0) * rate));
  for (let k = kMin; k <= kNow; k++) {
    const ts = t0 + k / rate, age = t - ts;
    if (age < 0 || age > life) continue;
    const sx = x0 + hash(k, seed, 1) * (x1 - x0);
    const x = sx + (vx[0] + hash(k, seed, 2) * (vx[1] - vx[0])) * age;
    const y = y0 + (vy[0] + hash(k, seed, 3) * (vy[1] - vy[0])) * age + 0.5 * g * age * age;
    if (y > landY(x)) continue;
    const w = 1 + Math.floor(hash(k, seed, 4) * 3);
    const c = codeColor(hash(k, seed, 5));
    const xi = Math.round(x), yi = Math.round(y);
    art.emit(() => { for (let i = 0; i < w; i++) art.put(xi + i, yi, c); });
  }
}

// ---- liquids (shots 5–6) -------------------------------------------------------------------
/** A wobbling liquid ribbon from (x0,y0) to (x1,y1). */
export function stream(art, x0, y0, x1, y1, t, o = {}) {
  const col = o.color ?? 0x5a3522;
  const hi = mix(col, 0xffffff, 0.4), dk = mix(col, 0x000000, 0.35);
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const wob = Math.sin(u * 5.5 - t * 22) * (o.wob ?? 0.9) * (0.3 + u * 0.7);
    const x = x0 + (x1 - x0) * u + wob;
    const y = y0 + (y1 - y0) * u;
    const wd = Math.max(0, Math.round((o.w ?? 1.4) * (1 - u * 0.2)));
    for (let j = -wd; j <= wd; j++) art.put(Math.round(x) + j, Math.round(y), j === -wd ? hi : j === wd ? dk : col);
    // a pearl running down the stream
    if (((u * 3 - t * 3.2) % 1 + 1) % 1 < 0.08) art.put(Math.round(x), Math.round(y), hi);
  }
}

/** Flying droplets with gravity; they stop at floorY. */
export function droplets(art, x, y, t, t0, o = {}) {
  const { n = 14, seed = 1, speed = 28, life = 0.7, color = 0x5a3522, gravity = 200,
    spread = 2.6, dir = -Math.PI / 2, floorY = null, size = 1 } = o;
  const dt = t - t0;
  if (dt < 0 || dt > life * 1.7) return;
  const hi = mix(color, 0xffffff, 0.35);
  for (let k = 0; k < n; k++) {
    const lk = life * (0.45 + hash(k, seed, 3) * 0.95);
    if (dt > lk) continue;
    const a = dir + (hash(k, seed, 1) - 0.5) * spread;
    const v = speed * (0.35 + hash(k, seed, 2) * 1.0);
    let px = x + Math.cos(a) * v * dt;
    let py = y + Math.sin(a) * v * dt + 0.5 * gravity * dt * dt;
    if (floorY !== null && py > floorY) py = floorY;
    const s = size + (hash(k, seed, 7) > 0.75 ? 1 : 0);
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) art.put(Math.round(px) + i, Math.round(py) + j, i + j === 0 ? hi : color);
  }
}

/** Soft grey puff (footsteps, impacts). */
export function dust(art, x, y, t, t0, o = {}) {
  const { n = 7, seed = 2, life = 0.3, r = 6, color = 0x8a8496 } = o;
  const dt = t - t0;
  if (dt < 0 || dt > life) return;
  const u = dt / life;
  for (let k = 0; k < n; k++) {
    const a = (hash(k, seed, 1) - 0.5) * 3.2 - Math.PI / 2;
    const d = r * u * (0.4 + hash(k, seed, 2));
    const px = Math.round(x + Math.cos(a) * d), py = Math.round(y + Math.sin(a) * d * 0.45);
    art.dput(px, py, color, (1 - u) * 0.7);
  }
}

/** Wet shine: a few glints of the monitor light sliding along the liquid (emissive, sparse). */
export function wetGlints(art, pts, t, color = 0xe8d8c0) {
  if (!pts || pts.length < 4) return;
  art.emit(() => {
    for (let k = 0; k < 5; k++) {
      const u = ((hash(k, 61) + t * (0.35 + hash(k, 62) * 0.3)) % 1);
      const p = pts[Math.min(pts.length - 1, Math.floor(u * pts.length))];
      if (hash(k, Math.floor(t * 6), 63) < 0.25) continue;
      art.put(Math.round(p[0]), Math.round(p[1]) - 1, color);
    }
  });
}

// ---- paint (shot 6) -------------------------------------------------------------------------
/** An irregular blob of paint that grows in over ~0.1 s and stays. */
export function splat(art, x, y, k, color, seed = 0, rMax = 3) {
  if (k <= 0) return;
  const r = rMax * Math.min(1, k);
  const hi = mix(color, 0xffffff, 0.3), dk = mix(color, 0x000000, 0.28);
  const x0 = Math.floor(x - r - 2), x1 = Math.ceil(x + r + 2);
  const y0 = Math.floor(y - r - 2), y1 = Math.ceil(y + r + 2);
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
    const dx = xx + 0.5 - x, dy = (yy + 0.5 - y) * 1.25;
    const wob = 1 + (hash(xx, yy, seed) - 0.5) * 0.75;
    if (dx * dx + dy * dy <= r * r * wob) art.put(xx, yy, dy < -r * 0.3 ? hi : dx > r * 0.4 ? dk : color);
  }
}

/** A sweep of paint flung off a brush tip: a fan of splats along the swipe direction. */
export function paintSpray(art, x, y, t, t0, color, o = {}) {
  const { n = 18, seed = 4, speed = 70, life = 0.45, gravity = 90, dir = 0, spread = 1.5 } = o;
  const dt = t - t0;
  if (dt < 0 || dt > life * 1.5) return;
  for (let k = 0; k < n; k++) {
    const lk = life * (0.4 + hash(k, seed, 3) * 1.0);
    if (dt > lk) continue;
    const a = dir + (hash(k, seed, 1) - 0.5) * spread;
    const v = speed * (0.3 + hash(k, seed, 2) * 1.1);
    const px = x + Math.cos(a) * v * dt, py = y + Math.sin(a) * v * dt + 0.5 * gravity * dt * dt;
    const s = hash(k, seed, 5) > 0.7 ? 2 : 1;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) art.put(Math.round(px) + i, Math.round(py) + j, color);
  }
}

// ---- tester (shot 7) --------------------------------------------------------------------------
/**
 * Hammer angle over time (0 = straight up, + = swung down to the right).
 * Anticipation → strike on the cue → hold the contact pose → recoil.
 */
export function hammerAngle(t, taps, o = {}) {
  const { idle = -0.25, up = -0.8, hit = 1.0, wind = 0.2, hold = 0.075, back = 0.13 } = o;
  let a = idle + Math.sin(t * 3.4) * 0.07;
  for (const T of taps) {
    if (t >= T - wind && t < T) {
      a = idle + (up - idle) * ease.outCubic((t - (T - wind)) / wind);
    } else if (t >= T && t < T + hold) {
      a = up + (hit - up) * ease.outExpo(clamp((t - T) / 0.028));
    } else if (t >= T + hold && t < T + hold + back) {
      a = hit + (idle - hit) * ease.outQuad((t - T - hold) / back);
    }
  }
  return a;
}

/** Short bright impact stars (the "tink"). */
export function tink(art, x, y, k, color = 0xfff6c0) {
  if (!(k > 0)) return;
  const r = 1 + k * 4;
  art.emit(() => {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1], [0.7, -0.7], [-0.7, -0.7]]) {
      art.put(Math.round(x + dx * r), Math.round(y + dy * r * 0.8), color);
      if (k > 0.5) art.put(Math.round(x + dx * r * 0.5), Math.round(y + dy * r * 0.4), mix(color, 0xffffff, 0.5));
    }
  });
}

/** y of the coffee river's centre line at art-x (matches L.river). */
export function riverYAt(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      return ay + (by - ay) * (x - ax) / (bx - ax);
    }
  }
  return pts[pts.length - 1][1];
}

// ---- reactions ------------------------------------------------------------------------------
/** A chunky outlined "!" popping in over a character (k 0..1 = pop-in scale, then holds). */
export function bang(art, x, y, k, color = 0xffe066) {
  if (!(k > 0)) return;
  const hgt = Math.max(2, Math.round(6 * Math.min(1.25, k)));
  x = Math.round(x); y = Math.round(y);
  art.rect(x - 1, y - hgt - 4, 4, hgt + 2, OUT);
  art.rect(x - 1, y - 1, 4, 4, OUT);
  art.emit(() => {
    art.rect(x, y - hgt - 3, 2, hgt, color);
    art.put(x, y - hgt - 3, mix(color, 0xffffff, 0.6));
    art.rect(x, y, 2, 2, color);
  });
}

/** Sweat drops flicking off a worried character's head (cyclic). */
export function sweat(art, x, y, t, o = {}) {
  const { n = 2, seed = 5, period = 0.32, color = 0x9ad8ff } = o;
  for (let k = 0; k < n; k++) {
    const ph = ((t / period + hash(k, seed)) % 1 + 1) % 1;
    const side = k % 2 ? 1 : -1;
    const px = x + side * (3 + ph * 7), py = y - 2 - ph * 6 + ph * ph * 12;
    art.put(Math.round(px), Math.round(py), OUT);
    art.put(Math.round(px), Math.round(py) + 1, color);
    art.put(Math.round(px) + side, Math.round(py) + 1, OUT);
  }
}

// ---- paint globs (shot 6) -------------------------------------------------------------------
/**
 * A glob of paint flung from `from` to `to` along a parabola (peak `arc` px above the chord).
 * u 0..1 = flight progress. Outlined blob + a short trail of drops behind it.
 */
export function glob(art, from, to, u, color, arc = 14) {
  if (!(u >= 0 && u < 1)) return;
  const at = (v) => [from[0] + (to[0] - from[0]) * v, from[1] + (to[1] - from[1]) * v - Math.sin(v * Math.PI) * arc];
  const hi = mix(color, 0xffffff, 0.45);
  for (let k = 3; k >= 1; k--) {
    const [tx, ty] = at(Math.max(0, u - k * 0.07));
    art.put(Math.round(tx), Math.round(ty), k === 3 ? mix(color, 0x000000, 0.2) : color);
  }
  const [x, y] = at(u);
  art.disc(x, y, 2.6, OUT);
  art.disc(x, y, 1.8, color);
  art.put(Math.round(x - 1), Math.round(y - 1), hi);
}

/** Where shot 4 left the heap of code on the desk (shot 5 lets it evaporate). */
export const HEAP_FINAL = { cx: 195, wL: 22, wR: 25, h: 16, baseY: 140 };
