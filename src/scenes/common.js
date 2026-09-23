// Shared toolkit for all shots. A shot module exports
//
//     export function render(t, shot) → { img, w, h, cam }
//
// where t is GLOBAL film time (s), img is the lit art image (Uint8Array RGB, w×h art pixels,
// usually the 320×180 room world) and cam = { x, y, zoom } (view centre in art px, zoom ≥ 1).
// The film shoots img with the camera: zoom 1 → nearest neighbour (sub-pixel pans), any other
// zoom → 4×4 supersampling of the whole frame. Everything must be a pure function of t.
//
// Typical shot:
//     const st = storyState(t);                        // continuity (clock, paint, river, …)
//     const { art, ctx } = composeRoom(st, { hero: {...}, bots: [...], fx: (art, ctx) => {...} });
//     const img = lightRoom(art, ctx, { flash: … });
//     return { img, w: W, h: H, cam: camClamp({ x, y, zoom }) };
import { Art } from '../engine/art.js';
import { light } from '../engine/light.js';
import { mix } from '../engine/color.js';
import { clamp, hash, noise1, fract, ease, keys, TAU } from '../engine/util.js';
import { FONTS, drawText, textWidth } from '../engine/font.js';
import { W, H, L, drawBack, drawDeskLayer, drawFloorFront, roomLights } from '../assets/room.js';
import { drawHero, HERO_TAG, ARM_SCALE } from '../assets/hero.js';
import { drawBot, TAGS, OUT } from '../assets/bots.js';
import { BOTS, BEAT, BAR, b, CUES } from '../timeline.js';

export { W, H, L, BOTS, BEAT, BAR, b, CUES, TAGS, OUT, HERO_TAG, FONTS, drawText, textWidth };

export const SPRITES = [10, 11, 12, 13, 14];

/** Standard night look. Ambient is the cool room fill; spriteLight keeps the cast readable. */
export const NIGHT = {
  ambient: [0.36, 0.38, 0.58],
  glow: { strength: 0.45, radius: 6 },
  spriteLight: { floor: 0.84, keep: 0.45 },
};
/** Dark room after the short circuit: only the monitor (on UPS) and the bots' eyes. */
export const DARK = {
  ambient: [0.07, 0.075, 0.14],
  glow: { strength: 0.6, radius: 6 },
  spriteLight: { floor: 0.0, keep: 0.7 },
};

/** Ambient for the story state: night → warm dawn; almost black when the power is out. */
export function ambientFor(st) {
  if (st.power === 0) return DARK.ambient;
  const d = st.dawn ?? 0;
  const n = NIGHT.ambient, a = [0.78, 0.66, 0.66];
  return [n[0] + (a[0] - n[0]) * d, n[1] + (a[1] - n[1]) * d, n[2] + (a[2] - n[2]) * d];
}

// ---- blinking ----------------------------------------------------------------------------------
/** Deterministic blinks: ~every 2.4–4 s a 3-frame blink. Returns 'blink' or `base`. */
export function blink(t, base = 'normal', seed = 0) {
  const P = 3.1;
  const u = t + seed * 1.37;
  const k = Math.floor(u / P);
  const tb = k * P + hash(k, seed, 17) * 1.9;
  return u >= tb && u < tb + 0.1 ? 'blink' : base;
}

// ---- hero arm presets for the seated hero (behind the desk) ------------------------------------
export const SEATED_ARMS = {
  // both hands resting on the keyboard
  rest: { near: { a: Math.PI / 2 + 0.15, len: 9, hand: 'open' }, far: { a: 1.2, len: 7, a2: 0.9, len2: 4, hand: 'open' } },
  // index finger hovering above / pressing Enter (lift = art px between fingertip and key top)
  enter: (lift = 0) => ({
    near: { a: Math.PI / 2 + 0.15, len: 9, hand: 'open' },
    far: { ...reachIK(heroShoulder(L.hero.x, L.hero.y, 'far'), [L.enterKey.x + 2, L.enterKey.y - 5.5 - lift], 7, 8), hand: 'point', fingerA: Math.PI / 2, fingerLen: 4.2 },
  }),
  // typing: alternate hands every 16th
  type: (t) => {
    const ph = Math.floor(t / (BEAT / 4)) % 2;
    return {
      near: { a: Math.PI / 2 + 0.15 - ph * 0.12, len: 9 - ph, hand: 'open' },
      far: { a: 1.2 + (1 - ph) * 0.1, len: 7, a2: 0.9, len2: 4 - (1 - ph), hand: 'open' },
    };
  },
};

// ---- puppet-arm IK -----------------------------------------------------------------------------
/** Shoulder pivot (art coords) of the hero drawn with feet at (x, y). side: 'near' | 'far'. */
export function heroShoulder(x, y, side = 'far', flip = false) {
  const sx0 = side === 'near' ? 3.5 : 19.5;
  const sx = flip ? 24 - sx0 : sx0;
  return [Math.round(x) - 12 + sx, Math.round(y) - 45 + 25.5];
}
/**
 * Two-bone IK: angles {a, a2} (hero-arm convention, unflipped) so that an arm from shoulder S with
 * lengths l1, l2 ends at target T. elbowUp flips the bend. For a flipped hero pass flip = true.
 */
export function ik2(S, T, l1 = 7, l2 = 8, { elbowUp = false, flip = false } = {}) {
  const fl = flip ? -1 : 1;
  const dx = (T[0] - S[0]) * fl, dy = T[1] - S[1];
  const d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.01);
  const base = Math.atan2(dy, dx);
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * Math.max(d, 1e-3)), -1, 1));
  const a = base + (elbowUp ? -A : A);
  const ex = Math.cos(a) * l1, ey = Math.sin(a) * l1;
  const a2 = Math.atan2(dy - ey, dx - ex);
  return { a, len: l1, a2, len2: l2 };
}
/**
 * ik2 for an absolute target (a key, a bot): puppet arms are drawn at ARM_SCALE × their nominal
 * lengths, so the target is pushed out by 1 / ARM_SCALE for the solve and the drawn hand lands on T.
 * (Plain ik2 targets are pose-relative: the drawn pose keeps its angles and shrinks with the arm.)
 */
export function reachIK(S, T, l1 = 7, l2 = 8, o = {}) {
  const k = 1 / ARM_SCALE;
  return ik2(S, [S[0] + (T[0] - S[0]) * k, S[1] + (T[1] - S[1]) * k], l1, l2, o);
}

// ---- composition --------------------------------------------------------------------------------
/**
 * Build the room world for story state st.
 * spec = {
 *   hero: null | { x?, y?, layer: 'seat' (default, behind the desk) | 'floor' (in front of the desk),
 *                  ...drawHero opts (eyes, lookX, lookY, near, far, flip, back, legs, paint) }
 *         — the seated hero's puppet arms are re-drawn over the desk (hands on the keyboard);
 *           st.heroPaint is applied automatically unless paint is given.
 *   bots: [{ name, x, y, layer: 'floor' (default) | 'desk' | 'back' | 'top', ...bot state s }]
 *         layers: back = before the hero (e.g. on the windowsill), desk = after the desk,
 *                 floor = after the river/floor props, top = after everything (over fx too)
 *   afterBack, afterDesk, afterFloor, fx : (art, ctx) => void  — custom drawing hooks
 * }
 * Returns { art, ctx } with ctx = { st, bulbs, pile, riverPts, hero, bots: { name: res } }.
 */
export function composeRoom(st, spec = {}) {
  const art = new Art(W, H, 0);
  const ctx = { st, bots: {}, hero: null, bulbs: [] };
  const back = drawBack(art, st);
  ctx.bulbs = back.bulbs;
  spec.afterBack?.(art, ctx);
  drawBotsLayer(art, ctx, spec.bots, 'back');
  const hs = spec.hero;
  const heroOpts = hs ? { paint: st.heroPaint ?? undefined, ...hs } : null;
  const hx = hs ? hs.x ?? L.hero.x : 0, hy = hs ? hs.y ?? L.hero.y : 0;
  if (hs && (hs.layer ?? 'seat') === 'seat') ctx.hero = drawHero(art, hx, hy, heroOpts);
  const desk = drawDeskLayer(art, st);
  ctx.pile = desk.pile;
  if (hs && (hs.layer ?? 'seat') === 'seat' && (hs.near || hs.far) && hs.armsFront !== false) {
    const r = drawHero(art, hx, hy, { ...heroOpts, armsOnly: true });
    ctx.hero = { ...ctx.hero, ...r };
  }
  spec.afterDesk?.(art, ctx);
  drawBotsLayer(art, ctx, spec.bots, 'desk');
  const ff = drawFloorFront(art, st);
  ctx.riverPts = ff.riverPts;
  spec.afterFloor?.(art, ctx);
  if (hs && hs.layer === 'floor') ctx.hero = drawHero(art, hx, hy, heroOpts);
  drawBotsLayer(art, ctx, spec.bots, 'floor');
  spec.fx?.(art, ctx);
  drawBotsLayer(art, ctx, spec.bots, 'top');
  return { art, ctx };
}

function drawBotsLayer(art, ctx, bots, layer) {
  if (!bots) return;
  for (const bt of bots) {
    if (!bt || (bt.layer ?? 'floor') !== layer) continue;
    if (bt.hidden) continue;
    const { name, x, y, layer: _l, ...s } = bt;
    if (s.t === undefined) s.t = ctx.st.t;
    ctx.bots[name] = drawBot(name, art, x, y, s);
  }
}

/**
 * Light the room. o = { ambient, lights (extra), rig (overrides for roomLights: monitorLight, lamp,
 * windowLight, monitorColor), glow, spriteLight, rim, flash, flashColor, fade, tint, dither }
 */
export function lightRoom(art, ctx, o = {}) {
  const st = ctx.st;
  const rig = { ...st, bulbs: ctx.bulbs, ...(o.rig || {}) };
  if (st.power === 0 && !o.rig?.keepPower) { rig.lamp = 0; rig.bulbs = []; rig.garlandOff = true; }
  const lights = roomLights(rig).concat(o.lights || []);
  return light(art, {
    ambient: o.ambient ?? ambientFor(st),
    lights,
    glow: o.glow ?? (st.power === 0 ? DARK.glow : NIGHT.glow),
    sprites: SPRITES,
    spriteLight: o.spriteLight ?? (st.power === 0 ? DARK.spriteLight : NIGHT.spriteLight),
    rim: o.rim,
    dither: o.dither,
    flash: o.flash, flashColor: o.flashColor,
    fade: o.fade, tint: o.tint,
  });
}

// ---- camera ------------------------------------------------------------------------------------
/** Keep the view inside the world (w×h). */
export function camClamp(cam, w = W, h = H) {
  const zoom = Math.max(1, cam.zoom ?? 1);
  const hw = w / 2 / zoom, hh = h / 2 / zoom;
  return { ...cam, zoom, x: clamp(cam.x, hw, w - hw), y: clamp(cam.y, hh, h - hh) };
}
/** Keyframed camera: ks = [[t, {x, y, zoom}, easeFn?], ...]. */
export function camKeys(t, ks, easeFn = ease.inOutCubic) {
  const pick = (k) => ks.map(([kt, v, e]) => [kt, v[k], e]);
  return { x: keys(t, pick('x'), easeFn), y: keys(t, pick('y'), easeFn), zoom: keys(t, pick('zoom'), easeFn) };
}
/** Deterministic camera shake offset in art px. */
export function shake(t, amp, seed = 0, freq = 18) {
  if (!(amp > 0)) return [0, 0];
  return [noise1(t * freq, seed * 7 + 1) * 2 * amp - amp, noise1(t * freq, seed * 7 + 2) * 2 * amp - amp];
}
/** Envelope that jumps to 1 at t0 and decays over dur (for flashes, squash, shake). */
export function hit(t, t0, dur = 0.25, curve = 2) {
  if (t < t0 || t >= t0 + dur) return 0;
  return Math.pow(1 - (t - t0) / dur, curve);
}
/** 0..1 progress of t through [t0, t1] (clamped), optionally eased. */
export function prog(t, t0, t1, e = null) {
  const u = clamp((t - t0) / (t1 - t0));
  return e ? e(u) : u;
}
/** Bounce on the beat: 1 at each beat, decaying. */
export function beatPulse(t, t0 = 0, decay = 3) {
  const ph = fract((t - t0) / BEAT);
  return Math.exp(-ph * decay);
}

// ---- effects (all drawn in the art grid) --------------------------------------------------------
/** Burst of sparks from (x,y) starting at t0. Emissive pixels with gravity; returns nothing. */
export function sparks(art, x, y, t, t0, { n = 14, seed = 1, speed = 40, life = 0.5, colors = [0xffffff, 0xfff27a, 0x9af0ff], gravity = 90, spread = TAU, dir = -Math.PI / 2 } = {}) {
  const dt = t - t0;
  if (dt < 0 || dt > life * 1.6) return;
  art.emit(() => {
    for (let k = 0; k < n; k++) {
      const lifeK = life * (0.5 + hash(k, seed, 3) * 0.9);
      if (dt > lifeK) continue;
      const a = dir + (hash(k, seed, 1) - 0.5) * spread;
      const v = speed * (0.4 + hash(k, seed, 2) * 0.9);
      const px = x + Math.cos(a) * v * dt, py = y + Math.sin(a) * v * dt + 0.5 * gravity * dt * dt;
      const c = colors[Math.floor(hash(k, seed, 4) * colors.length)];
      art.put(Math.round(px), Math.round(py), c);
      if (dt < lifeK * 0.4) art.put(Math.round(px - Math.cos(a)), Math.round(py - Math.sin(a)), mix(c, 0x000000, 0.4));
    }
  });
}

/** Expanding pixel ring (pop / note wave) at (x,y); k 0..1. */
export function ring(art, x, y, k, color, rMax = 14) {
  if (!(k > 0 && k < 1)) return;
  const r = 2 + k * rMax;
  const n = Math.max(8, Math.round(r * 5));
  art.emit(() => {
    for (let i = 0; i < n; i++) {
      if ((i + Math.floor(k * 6)) % 3 === 0 && k > 0.5) continue;
      const a = (i / n) * TAU;
      art.put(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.8), color);
    }
  });
}

const NOTE_GLYPH = ['..##', '..#.', '..#.', '###.', '###.'];
/** A small ♪ in the bot's colour (the visual of its note). Outlined, emissive. */
export function note(art, x, y, color, alpha = 1) {
  if (!(alpha > 0)) return;
  x = Math.round(x); y = Math.round(y);
  art.emit(() => {
    for (let j = -1; j <= NOTE_GLYPH.length; j++) for (let i = -1; i <= 4; i++) {
      let near = false;
      for (let dj = -1; dj <= 1 && !near; dj++) for (let di = -1; di <= 1; di++) if (NOTE_GLYPH[j + dj]?.[i + di] === '#') { near = true; break; }
      if (near && NOTE_GLYPH[j]?.[i] !== '#') art.dput(x + i, y + j, mix(color, 0x000000, 0.6), alpha);
    }
    for (let j = 0; j < NOTE_GLYPH.length; j++) for (let i = 0; i < 4; i++) if (NOTE_GLYPH[j][i] === '#') art.dput(x + i, y + j, j === 3 && i === 0 ? mix(color, 0xffffff, 0.5) : color, alpha);
  });
}

/** Horizontal speed lines across the view (whip pans): solid 1-px streaks, new every frame. amount 0..1. */
export function speedLines(art, t, amount, { seed = 3, color = 0xe8f0ff, x0 = 0, x1 = W, y0 = 0, y1 = H } = {}) {
  if (!(amount > 0)) return;
  const n = Math.round(40 * amount);
  const fr = Math.floor(t * 30);
  art.emit(() => {
    for (let k = 0; k < n; k++) {
      const y = y0 + Math.floor(hash(k, seed, fr) * (y1 - y0));
      const len = 8 + Math.floor(hash(k, seed, fr, 2) * 50 * amount);
      const x = x0 + Math.floor(hash(k, seed, fr, 3) * (x1 - x0 + len)) - len;
      const c = hash(k, seed, 5) > 0.5 ? color : mix(color, 0x8aa0c8, 0.5);
      for (let i = 0; i < len; i++) art.put(x + i, y, i < len * 0.3 ? mix(c, 0x404860, 0.5) : c);
    }
  });
}

/**
 * Assemble a sprite from flying pixels. drawFn(scratchArt) draws the finished sprite into a
 * scratch canvas; every pixel of it flies from a random point of `src` (rect {x,y,w,h}) to its
 * place. k 0..1 = progress; k ≥ 1 draws nothing (caller draws the real sprite). Flying pixels
 * glow in `color`; they land in their true colours.
 */
export function assemble(art, drawFn, k, src, { color = 0xffffff, seed = 5, arc = 18 } = {}) {
  if (k <= 0 || k >= 1) return;
  const tmp = new Art(art.w, art.h, -1);
  tmp.col.fill(0xffffffff);
  drawFn(tmp);
  art.emit(() => {
    for (let y = 0; y < tmp.h; y++) for (let x = 0; x < tmp.w; x++) {
      const i = y * tmp.w + x;
      const c = tmp.col[i], e = tmp.emi[i];
      if (c === 0xffffffff && !e) continue;
      const h1 = hash(x, y, seed), h2 = hash(x, y, seed + 1), h3 = hash(x, y, seed + 2);
      const start = h1 * 0.55, dur = 0.45;
      const u = clamp((k - start) / dur);
      if (u <= 0) continue;
      const sx = src.x + h2 * src.w, sy = src.y + h3 * src.h;
      const e2 = ease.outCubic(u);
      const px = sx + (x - sx) * e2;
      const py = sy + (y - sy) * e2 - Math.sin(u * Math.PI) * arc * (0.5 + h1);
      const landed = u >= 1;
      const fc = landed ? (e || c) : mix(color, 0xffffff, h2 * 0.5);
      art.put(Math.round(px), Math.round(py), fc & 0xffffff);
    }
  });
}

/** Screen-space-ish pixel text label on an object (e.g. a "!" over a bot). */
export function exclaim(art, x, y, color = 0xffffff, alpha = 1) {
  if (!(alpha > 0)) return;
  art.emit(() => {
    for (let j = 0; j < 5; j++) art.dput(x, y + j, color, alpha);
    art.dput(x, y + 6, color, alpha);
  });
}
