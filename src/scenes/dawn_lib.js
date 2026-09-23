// Shared helpers for the dawn block (shots 13–15): the pixel rocket and its smoke trail, the
// window whose two sashes swing open onto the sunrise, birds, and the team sitting on the sill.
// Everything is drawn in the room's art grid (1 art px = 1 hero sprite px), a pure function of t.
import { Art } from '../engine/art.js';
import { mix } from '../engine/color.js';
import { clamp, hash, ease, fract } from '../engine/util.js';
import { W, H, L, drawOutside, drawMug } from '../assets/room.js';
import { storyState } from '../story.js';
import { composeRoom } from './common.js';
import { CUES, BEAT } from '../timeline.js';

const OUT = 0x020302;

// ---- rocket ------------------------------------------------------------------------------------
// Three hand-drawn sizes (never scaled): big (in the room), small (just outside), tiny (far away).
// Anchor = the nozzle's bottom centre.
const RK_PAL = {
  '#': OUT, R: 0xff532b, r: 0xc23a2a, W: 0xf4f0e6, s: 0xb8b2c4, B: 0x5a6a8a,
  G: 0x2dbcf6, g: 0xd8f6ff, n: 0x6a6a78,
};
const RK_BIG = [
  '......#......',
  '.....#R#.....',
  '....#RRr#....',
  '...#RRRrr#...',
  '..#WWWWWWs#..',
  '..#WWBBBWs#..',
  '..#WBgGGBs#..',
  '..#WBGGGBs#..',
  '..#WWBBBWs#..',
  '..#WWWWWWs#..',
  '.##WWWWWWs##.',
  '#R#RRRRRRr#r#',
  '#RR#WWWWs#rr#',
  '###.#nnn#.###',
  '.....###.....',
];
const RK_SMALL = [
  '...#...',
  '..#R#..',
  '.#RRr#.',
  '.#WWs#.',
  '.#WGs#.',
  '.#WWs#.',
  '##RRr##',
  '#R#n#r#',
  '##.#.##',
];
const RK_TINY = ['.R.', 'WWs', 'WGs', 'R.r'];
export const ROCKET = { big: RK_BIG, small: RK_SMALL, tiny: RK_TINY };

/** Draw the rocket with its nozzle at (x, y). size: 'big'|'small'|'tiny'. flame 0..1. */
export function drawRocket(art, x, y, size, t, flame = 1) {
  const rows = ROCKET[size];
  const w = rows[0].length, h = rows.length;
  x = Math.round(x); y = Math.round(y);
  art.sprite(rows, RK_PAL, x - (w >> 1), y - h + 1);
  // porthole glint is self-lit so the rocket reads in any light
  if (size === 'big') art.emit(() => art.put(x - 2, y - 8, 0xffffff));
  if (!(flame > 0)) return;
  const fr = Math.floor(t * 30);
  const flick = hash(fr, 71);
  const len = size === 'big' ? Math.round((3 + flick * 4) * flame) : size === 'small' ? Math.round((2 + flick * 2) * flame) : 1 + (flick > 0.5 ? 1 : 0);
  art.emit(() => {
    if (size === 'big') {
      for (let j = 0; j < len + 2; j++) {
        const u = j / (len + 1);
        const c = u < 0.3 ? 0xfff6c8 : u < 0.65 ? 0xffc23a : 0xff6a2a;
        art.put(x, y + 1 + j, c);
        if (j < len) { art.put(x - 1, y + 1 + j, u < 0.3 ? 0xffd860 : 0xff8a2a); art.put(x + 1, y + 1 + j, u < 0.3 ? 0xffd860 : 0xff8a2a); }
      }
      if (hash(fr, 72) > 0.5) art.put(x + (hash(fr, 73) > 0.5 ? 2 : -2), y + 2 + Math.floor(hash(fr, 74) * len), 0xffa040);
    } else {
      for (let j = 0; j < len; j++) art.put(x, y + 1 + j, j === 0 ? 0xfff2b0 : 0xff9a3a);
    }
  });
}

// ---- rocket flight path (global time) -------------------------------------------------------------
const T_L = CUES.rocketLaunch;
export const T_O = CUES.rocketOut;
export const T_IGNITE = T_L + 0.02;     // flame on (the pop is done)
export const T_LIFT = T_L + 0.2;        // hover → climbing
export const T_EXIT = T_O + 0.1;        // passes the window plane (nozzle at the glass bottom)
export const ROCKET_HOME = [201, 118];  // nozzle when it pops out of the screen (screen centre)
// outside: the arc across the dawn sky, drifting away (it shrinks) and curling left over the team
const SKY_KEYS = [
  [T_O, 201, 97], [T_EXIT, 200, 74], [T_O + 0.22, 197, 55], [T_O + 0.47, 191, 42],
  [T_O + 0.95, 180, 32], [T_O + 1.5, 167, 26], [T_O + 2.1, 153, 23], [T_O + 2.8, 140, 22],
  [T_O + 3.6, 128, 23], [T_O + 4.4, 119, 25],
];
const cr = (p0, p1, p2, p3, u) => {
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
};
/** Rocket nozzle position at time ts (null before it exists). */
export function rocketPos(ts) {
  if (ts < T_L - 0.16) return null;
  const [hx, hy] = ROCKET_HOME;
  if (ts < T_LIFT) {
    // ignition: shakes on the spot
    const sh = ts >= T_IGNITE ? (hash(Math.floor(ts * 30), 5) > 0.5 ? 1 : -1) * (hash(Math.floor(ts * 30), 6) > 0.4 ? 1 : 0) : 0;
    return [hx + sh, hy];
  }
  if (ts < T_O) {
    const u = ease.inOutQuad((ts - T_LIFT) / (T_O - T_LIFT));
    const sh = hash(Math.floor(ts * 30), 5) > 0.7 ? 1 : 0;
    return [hx + sh, hy + (97 - hy) * u];
  }
  const K = SKY_KEYS;
  if (ts >= K[K.length - 1][0]) return [K[K.length - 1][1], K[K.length - 1][2]];
  let i = 0;
  while (i < K.length - 2 && ts >= K[i + 1][0]) i++;
  const u = (ts - K[i][0]) / (K[i + 1][0] - K[i][0]);
  const P = (k) => K[Math.max(0, Math.min(K.length - 1, k))];
  return [cr(P(i - 1)[1], P(i)[1], P(i + 1)[1], P(i + 2)[1], u), cr(P(i - 1)[2], P(i)[2], P(i + 1)[2], P(i + 2)[2], u)];
}
/** Which sprite at time ts. */
export const rocketSize = (ts) => (ts < T_O + 0.2 ? 'big' : ts < T_O + 0.42 ? 'small' : 'tiny');

// ---- smoke ---------------------------------------------------------------------------------------
/** Smoke inside the room: the launch-pad billow at ignition + puffs from the nozzle while it climbs. */
export function roomSmoke(art, t) {
  if (t < T_IGNITE) return;
  // solid pixel puffs: they grow, then shrink away (no dither noise over the screen text)
  const puff = (x, y, r, a, c) => {
    r *= Math.min(1, a * 1.6);
    if (r < 0.6) return;
    const x0 = Math.floor(x - r - 1), x1 = Math.ceil(x + r + 1), y0 = Math.floor(y - r - 1), y1 = Math.ceil(y + r + 1);
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y);
      if (d > r) continue;
      const shade = yy + 0.5 > y + r * 0.3 ? mix(c, 0x7a7090, 0.5) : yy + 0.5 < y - r * 0.45 ? mix(c, 0xffffff, 0.5) : c;
      art.put(xx, yy, shade);
    }
  };
  // billow at the base: 10 puffs rolling out left and right along the screen bottom
  const [hx, hy] = ROCKET_HOME;
  for (let k = 0; k < 10; k++) {
    const age = t - T_IGNITE - hash(k, 81) * 0.12;
    if (age < 0 || age > 0.9) continue;
    const side = k % 2 ? 1 : -1;
    const v = 30 + hash(k, 82) * 40;
    const x = hx + side * (3 + v * (1 - Math.exp(-age * 3)) * 0.33);
    const y = hy + 2 - hash(k, 83) * 4 - age * 6;
    puff(x, y, 1.5 + age * 4.5, 0.95 * (1 - age / 0.9), 0xcfc8dc);
  }
  // nozzle puffs while climbing (until it leaves through the window)
  const dt = 1 / 45;
  const i0 = Math.max(0, Math.floor((t - 0.8 - T_LIFT) / dt)), i1 = Math.floor((Math.min(t, T_EXIT) - T_LIFT) / dt);
  for (let i = i0; i <= i1; i++) {
    const tb = T_LIFT + i * dt;
    const age = t - tb;
    if (age < 0 || age > 0.8) continue;
    const p = rocketPos(tb);
    if (!p) continue;
    const drift = (hash(i, 84) - 0.5) * 10 * age;
    puff(p[0] + drift, p[1] + 6 + age * 8, 1 + age * 5, 0.9 * (1 - age / 0.8), 0xd6d0e2);
  }
}

/** The trail in the sky (drawn into the outside view). fade scales its opacity (shots 14/15). */
export function skyTrail(art, t, fade = 1) {
  if (t < T_EXIT - 0.05) return;
  const dt = 1 / 90;
  const i1 = Math.floor((t - (T_EXIT - 0.05)) / dt);
  for (let i = 0; i <= i1; i++) {
    const tb = T_EXIT - 0.05 + i * dt;
    const age = t - tb;
    if (age < 0) continue;
    const p = rocketPos(tb);
    // the far part of the trail is thinner (perspective)
    const far = clamp((tb - T_EXIT) / 2.5);
    const life = clamp(1 - age / 9) * fade;              // 1 → 0 over ~9 s
    const r = Math.min(2.6, (1.0 - far * 0.35) + age * 0.7 * (1 - far * 0.5)) * Math.min(1, life * 2.5);
    const a = life > 0.25 ? 1 : life * 4;
    if (!(a > 0.02) || r < 0.5) continue;
    const x = p[0] + age * 1.4, y = p[1] + 1 + age * 0.35; // wind drifts it right, it sinks a little
    const x0 = Math.floor(x - r - 1), x1 = Math.ceil(x + r + 1), y0 = Math.floor(y - r - 1), y1 = Math.ceil(y + r + 1);
    art.emit(() => {
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
        const dy = yy + 0.5 - y, d = Math.hypot(xx + 0.5 - x, dy);
        if (d > r) continue;
        // lit by the sunrise from below: warm underside, pale pink top
        const c = dy > r * 0.35 ? 0xffc08a : dy < -r * 0.35 ? 0xfff4f0 : 0xffdcd8;
        art.dput(xx, yy, c, a);
      }
    });
  }
}

// ---- birds ---------------------------------------------------------------------------------------
const BIRD = [['#...#', '.#.#.', '..#..'], ['.....', '##.##', '..#..'], ['..#..', '.#.#.', '#...#'], ['.....', '##.##', '..#..']];
/** A loose flock gliding across the rect (x0..x1). */
export function birds(art, t, { x0 = 104, x1 = 220, y = 30, n = 4, seed = 5, speed = 7, color = 0x3a2440 } = {}) {
  for (let k = 0; k < n; k++) {
    const span = x1 - x0 + 30;
    const bx = x0 - 15 + fract(hash(k, seed) + t * speed / span) * span;
    const by = y + (hash(k, seed, 2) - 0.5) * 14 + Math.sin(t * 1.3 + k * 2) * 1.5;
    const fr = BIRD[Math.floor(t * (6 + k) + k) % 4];
    art.emit(() => {
      for (let j = 0; j < fr.length; j++) for (let i = 0; i < 5; i++) if (fr[j][i] === '#') art.put(Math.round(bx) + i - 2, Math.round(by) + j, color);
    });
  }
}

/** Long flat clouds lit pink from below by the rising sun. */
export function clouds(art, t, dawn) {
  const { x, y, w } = L.window;
  const C = [[x + 8, y + 12, 26], [x + 60, y + 7, 34], [x + 84, y + 24, 20], [x + 30, y + 30, 16]];
  C.forEach(([cx, cy, cw], k) => {
    const dx = fract(hash(k, 91) + t * 0.004 * (1 + k * 0.3)) * (w + 40) - 20;
    const px = Math.round(x + fract((cx - x + dx) / (w + 40)) * (w + 40) - 20);
    const top = mix(0x9a7ab0, 0xffd6d0, dawn), bot = mix(0x6a5a90, 0xffa27a, dawn);
    art.emit(() => {
      art.hline(px + 3, px + cw - 5, cy, top);
      art.hline(px, px + cw, cy + 1, top);
      art.hline(px + 1, px + cw - 2, cy + 2, bot);
      art.hline(px + 6, px + Math.round(cw * 0.6), cy - 1, top);
    });
  });
}

// ---- the window opening onto the sunrise ------------------------------------------------------------
const FRAME_COLS = new Set([0xe8e2d4, 0xcfc6b2, 0x9d937e]);
const F = { hi: 0xe8e2d4, base: 0xcfc6b2, shade: 0x9d937e };

/**
 * Replace the room's window view: the sky (with `extras(skyArt)` drawn on top: trail, rocket,
 * birds…) shows through the glass where the room drew sky or mullions (the garland stays), then the
 * two sashes are drawn swung inward by `open` (0..1). Call from composeRoom's afterBack with the
 * same st the room was composed with (the room itself always draws the window shut).
 */
export function windowView(art, st, open, extras) {
  const { x, y, w, h } = L.window;
  if (!(open > 0) && !extras) return;
  const sky = new Art(W, H, 0), ref = new Art(W, H, 0);
  sky.clip(x, y, x + w, y + h, () => { drawOutside(sky, x, y, w, h, st); extras?.(sky); });
  ref.clip(x, y, x + w, y + h, () => drawOutside(ref, x, y, w, h, st));
  const mx = x + Math.floor(w / 2);
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    const i = yy * W + xx;
    const isSky = art.col[i] === ref.col[i] && art.emi[i] === ref.emi[i];
    const isBar = art.emi[i] === 0 && FRAME_COLS.has(art.col[i]);
    // with the window shut, keep the room's own mullions
    if (isSky || (isBar && open > 0)) { art.col[i] = sky.col[i]; art.emi[i] = sky.emi[i]; art.tag[i] = 0; }
  }
  if (open > 0) {
    const th = open * 1.32;
    sash(art, x, mx - 1, y, y + h - 1, th, st);      // left sash, hinged on the left
    sash(art, x + w - 1, mx + 1, y, y + h - 1, th, st); // right sash, hinged on the right
  }
}

/** One casement sash rotated by th about its hinge edge xh; its free edge was at xf0 when shut. */
function sash(art, xh, xf0, y0, y1, th, st) {
  const half = xf0 - xh;                                   // signed width
  const xf = xh + half * Math.cos(th);
  const d = Math.abs(half) * Math.sin(th) * 0.16;          // the free edge comes closer → taller
  const sgn = Math.sign(half);
  const xa = Math.min(xh, xf), xb = Math.max(xh, xf);
  const bw = Math.abs(xf - xh);
  const glassTint = mix(0xcfe8ff, 0xffe0c0, st.dawn ?? 0);
  for (let yy = Math.floor(y0 - d - 1); yy <= Math.ceil(y1 + d + 1); yy++) {
    for (let xx = Math.floor(xa) - 1; xx <= Math.ceil(xb) + 1; xx++) {
      const u = bw < 0.5 ? 0 : clamp(((xx + 0.5) - xh) / (xf - xh), -0.2, 1.2); // 0 hinge .. 1 free edge
      const top = y0 - d * u, bot = y1 + d * u;
      const v = (yy + 0.5 - top) / (bot - top);
      const inU = u >= 0 && u <= 1, inV = v >= 0 && v <= 1;
      if (!inU || !inV) continue;
      const pxU = Math.abs(u * bw);                          // px from the hinge
      const edge = pxU < 1 || pxU > bw - 1 || yy + 0.5 - top < 1 || bot - (yy + 0.5) < 1;
      const stile = pxU < 3 || pxU > bw - 3;
      const rail = yy + 0.5 - top < 3 || bot - (yy + 0.5) < 3 || Math.abs(v - 0.37) < 1.2 / (bot - top);
      if (edge) art.put(xx, yy, OUT);
      else if (stile || rail) art.put(xx, yy, (sgn > 0 ? pxU < 2 : pxU > bw - 2) || yy + 0.5 - top < 2 ? F.hi : F.base);
      else if ((xx + yy) % 23 === 0 || (xx + yy) % 23 === 2) art.put(xx, yy, mix(glassTint, 0xffffff, 0.5));
    }
  }
}

/** The window's open amount for shot 13+ (the cue plus an outBack swing). */
export const windowOpenAt = (t) => (t < CUES.windowOpen ? 0 : ease.outBack(clamp((t - CUES.windowOpen) / 0.3), 1.2));

// ---- the team on the windowsill ------------------------------------------------------------------
// Left → right on the sill (x 96..228, top y 76). Facing out (back to us) the hero's legs go over the
// far side of the sill, out of the open window: only the seat of his trousers rests on the ledge.
// Turned to face the room (shot 15) his legs dangle down the sill's face instead.
export const SILL = {
  designer: 104, hero: 126, coder: 162, barista: 192, tester: 216,
  mug: 144, cup: 178,
  heroY: 87,       // feet anchor so that his hips rest on the sill top (y 76)
  botY: 79,        // feet anchor for legless (sitting) bots
};

/** A tiny espresso cup (5 px) for the bots, bottom centre at (x, y), steaming. */
function drawCup(art, x, y, t) {
  art.rect(x - 3, y - 5, 7, 6, OUT);
  art.rect(x - 2, y - 4, 5, 4, 0xe8e4dc); art.vline(x - 2, y - 4, y - 1, 0xffffff); art.vline(x + 2, y - 4, y - 1, 0xb8b2a8);
  art.hline(x - 2, x + 2, y - 4, 0x5a3522);
  art.put(x + 4, y - 3, OUT); art.put(x + 4, y - 2, OUT);
  art.emit(() => {
    for (let k = 0; k < 3; k++) {
      const ph = fract(t * 0.5 + k / 3);
      art.dput(x + Math.round(Math.sin(ph * 6 + t) * 1.2), y - 6 - Math.round(ph * 8), ph < 0.5 ? 0xb8b0c0 : 0x9a92a8, 0.9 * (1 - ph));
    }
  });
}

/**
 * Compose the dawn room with the team sitting on the windowsill (shots 14, 15).
 * o = { hero: drawHero opts (merged), bots: { name: extra bot state }, trailFade, fx, afterDesk,
 *       st: (st) => void — tweak the story state before composing }
 * Returns { art, ctx, st }.
 */
export function sillScene(t, o = {}) {
  const st = { ...storyState(t) };
  st.windowOpen = 0;
  st.mug = { where: 'none' };                // the mugs are up on the sill with the team now
  o.st?.(st);
  const skyExtras = (sky) => {
    clouds(sky, t, st.dawn);
    skyTrail(sky, t, o.trailFade ?? 1);
    const p = rocketPos(t);
    if (p && t < T_O + 4.4) drawRocket(sky, p[0], p[1], 'tiny', t, 1);
    else if (p) {
      // it became a star: a slow, calm twinkle where it vanished
      const tw = 0.5 + 0.5 * Math.sin((t - T_O - 4.4) * 4);
      sky.emit(() => { sky.put(Math.round(p[0]), Math.round(p[1]), 0xfff8e0); if (tw > 0.5) { sky.put(Math.round(p[0]) - 1, Math.round(p[1]), 0xffe0b0); sky.put(Math.round(p[0]) + 1, Math.round(p[1]), 0xffe0b0); sky.put(Math.round(p[0]), Math.round(p[1]) - 1, 0xffe0b0); sky.put(Math.round(p[0]), Math.round(p[1]) + 1, 0xffe0b0); } });
    }
    birds(sky, t, { y: 26, n: 4, seed: 5, speed: 6 });
    birds(sky, t + 7, { y: 20, n: 2, seed: 9, speed: 4, color: 0x5a3a5a });
  };
  const botBase = (name) => ({
    name, x: SILL[name], y: SILL.botY, layer: 'back', t, back: true, noLegs: true,
    steam: name === 'barista', brush: name === 'designer' ? -0.35 + Math.sin(t * 0.9) * 0.05 : undefined,
    hammer: name === 'tester' ? -0.3 : undefined, antennaWobble: 0.3,
    ...(o.bots?.[name] || {}),
  });
  const hero = { layer: 'seat', x: SILL.hero, y: SILL.heroY, back: true, eyes: 'normal', paint: null, ...(o.hero || {}) };
  if (hero.seat === undefined) hero.seat = hero.back;
  const { art, ctx } = composeRoom(st, {
    afterBack: (a) => {
      windowView(a, st, 1, skyExtras);
      // the seat presses a 1-px shadow into the ledge
      if (hero.seat) a.hline(Math.round(hero.x) - 7, Math.round(hero.x) + 6, Math.round(hero.y) - 45 + 37, 0x6a432a);
    },
    bots: ['designer', 'coder', 'barista', 'tester'].map(botBase),
    hero,
    afterDesk: (a, c) => {
      drawMug(a, SILL.mug, L.sillY, { fill: 0.9, steam: true, t });
      drawCup(a, SILL.cup, L.sillY, t + 1.3);
      o.afterDesk?.(a, c);
    },
    fx: o.fx,
  });
  return { art, ctx, st };
}

export const BEAT_S = BEAT;
