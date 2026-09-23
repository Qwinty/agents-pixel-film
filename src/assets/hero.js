// The hero, built from the canonical 24×45 sprite (footage/character/Char_sprite_24x45.png).
// The sprite is decoded into a character grid (one char per palette color). New poses are edits
// of that grid in the same 1 px = 1 art-pixel grid: eyes, arms (puppet sleeves in sweater colors),
// back view, legs for walking. Anchor (x,y) = bottom centre between the feet.
import { mix } from '../engine/color.js';
import { hash } from '../engine/util.js';

export const HP = {}; // hero palette by char
const KEYS = {
  outline: '#', sweater: 'p', sweater_shadow: 'P', skin: 's', hair: 'H',
  hair_mid: 'h', hair_shadow: 'd', blush: 'b', pants: 'g', pants_shadow: 'G',
};
let BASE = null; // array of 45 strings × 24 chars

export function initHero(rgba, w, h, palette) {
  const lut = new Map();
  for (const [name, ch] of Object.entries(KEYS)) {
    const c = parseInt(palette[name].slice(1), 16);
    HP[ch] = c;
    lut.set(c, ch);
  }
  const rows = [];
  for (let y = 0; y < h; y++) {
    let r = '';
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (rgba[o + 3] < 128) { r += '.'; continue; }
      const c = (rgba[o] << 16) | (rgba[o + 1] << 8) | rgba[o + 2];
      let ch = lut.get(c);
      if (!ch) { // nearest palette color (robustness)
        let best = 1e9;
        for (const [pc, pch] of lut) {
          const d = (((pc >> 16) & 255) - rgba[o]) ** 2 + (((pc >> 8) & 255) - rgba[o + 1]) ** 2 + ((pc & 255) - rgba[o + 2]) ** 2;
          if (d < best) { best = d; ch = pch; }
        }
      }
      r += ch;
    }
    rows.push(r);
  }
  BASE = rows;
  HP.white = 0xffffff;
  HP.shoe = HP['#'];
}

export const heroBase = () => BASE;
export const HERO_W = 24, HERO_H = 45, HERO_AX = 12;
export const HERO_TAG = 10;

// ---- grid helpers ------------------------------------------------------------------------
const grid = (rows) => rows.map((r) => r.split(''));
const setc = (g, x, y, ch) => { if (y >= 0 && y < g.length && x >= 0 && x < g[y].length) g[y][x] = ch; };
const getc = (g, x, y) => (y >= 0 && y < g.length && x >= 0 && x < g[y].length ? g[y][x] : '.');

// Eye blocks in the canonical sprite: 2×3 at x=10..11 and x=17..18, rows 13..15.
const EYES = [10, 17];
function clearEyes(g) {
  for (const ex of EYES) for (let y = 12; y <= 16; y++) for (let x = ex - 1; x <= ex + 2; x++) {
    if (getc(g, x, y) === '#' && y >= 13 && y <= 15 && x >= ex && x <= ex + 1) setc(g, x, y, 's');
  }
}
function applyEyes(g, eyes, lookX = 0, lookY = 0) {
  if (eyes === 'normal' && !lookX && !lookY) return [];
  clearEyes(g);
  const extra = []; // emissive/white overlay pixels [x,y,color]
  for (const ex0 of EYES) {
    const ex = ex0 + lookX, ey = 13 + lookY;
    if (eyes === 'normal') {
      for (let y = 0; y < 3; y++) for (let x = 0; x < 2; x++) setc(g, ex + x, ey + y, '#');
    } else if (eyes === 'half') {
      for (let y = 1; y < 3; y++) for (let x = 0; x < 2; x++) setc(g, ex + x, ey + y, '#');
    } else if (eyes === 'blink') {
      for (let x = 0; x < 2; x++) setc(g, ex + x, ey + 2, '#');
    } else if (eyes === 'squint') {
      for (let x = -0; x < 2; x++) setc(g, ex + x, ey + 1, '#');
    } else if (eyes === 'happy') { // ^ ^
      setc(g, ex, ey + 2, '#'); setc(g, ex + 1, ey + 1, '#'); setc(g, ex + 2 > ex0 + 2 ? ex + 1 : ex + 1, ey + 1, '#');
    } else if (eyes === 'round' || eyes === 'idea') {
      // 4×4 round eyes with a white glint
      const bx = ex - 1, by = ey - 1;
      const shape = ['.##.', '####', '####', '.##.'];
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (shape[y][x] === '#') setc(g, bx + x, by + y, '#');
      extra.push([bx + 1, by + 1, eyes === 'idea' ? 'glint' : 'white']);
    } else if (eyes === 'wide') { // 3×4 tall eyes
      const bx = ex, by = ey - 1;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 2; x++) setc(g, bx + x, by + y, '#');
      extra.push([bx, by, 'white']);
    }
  }
  return extra;
}

// Arm regions to erase for puppet arms. Near arm = screen-left (wide), far arm = screen-right (narrow).
function removeNearArm(g) {
  for (let y = 24; y <= 34; y++) for (let x = 0; x <= 5; x++) setc(g, x, y, '.');
  for (let y = 25; y <= 33; y++) setc(g, 6, y, '#');
  for (let y = 25; y <= 32; y++) if (getc(g, 7, y) !== '#') setc(g, 7, y, 'P');
  // shoulder cap: keep rows 21..23 but round it off
  setc(g, 1, 24, '.'); setc(g, 2, 24, '#'); setc(g, 3, 24, '#'); setc(g, 4, 24, '#'); setc(g, 5, 24, '#');
  setc(g, 2, 23, '#'); setc(g, 3, 23, 'P');
  setc(g, 6, 34, '#');
}
function removeFarArm(g) {
  for (let y = 25; y <= 34; y++) for (let x = 20; x <= 23; x++) setc(g, x, y, '.');
  for (let y = 25; y <= 33; y++) setc(g, 19, y, '#');
  for (let y = 25; y <= 32; y++) if (getc(g, 18, y) !== '#') setc(g, 18, y, 'P');
  setc(g, 20, 24, '#'); setc(g, 21, 24, '.'); setc(g, 21, 23, '.'); setc(g, 20, 23, '#');
  setc(g, 19, 34, '#');
}

// Shoulder pivots (sprite coords, pixel centres)
const SHOULDER = { near: [3.5, 25.5], far: [19.5, 25.5] };
/**
 * Puppet arms are drawn at ARM_SCALE × the nominal lengths the shots pass (len, len2), so a raised
 * or pointing arm is as long as the sprite's own hanging arm (≈ 10 px shoulder → hand), not longer.
 * Poses keep their angles; IK aimed at an absolute point must use reachIK() (scenes/common.js).
 */
export const ARM_SCALE = 0.74;

/**
 * Draw one puppet arm onto art in sprite-local coords (ox,oy = sprite top-left in art coords).
 * arm: { a: angle (rad, 0 = right, π/2 = down), len, a2?: forearm angle, len2?, hand: 'open'|'point'|'fist'|'baton', far?: bool }
 */
function drawArm(art, ox, oy, arm, side, flip, recol) {
  const P = (ch) => recol(HP[ch], ch);
  const res = {};
  const far = side === 'far';
  const [sx0, sy0] = SHOULDER[side];
  const sx = flip ? 24 - sx0 : sx0;
  const fl = flip ? -1 : 1;
  // sleeve as thick as the sprite's own: near arm 5 px of fabric, far arm 3 px (+ 1 px outline)
  const r = far ? 1.5 : 2.1;
  const L1 = (arm.len ?? 8) * ARM_SCALE, a1 = arm.a;
  const ex = sx + Math.cos(a1) * L1 * fl, ey = sy0 + Math.sin(a1) * L1;
  let hx = ex, hy = ey;
  if (arm.a2 !== undefined) {
    const L2 = (arm.len2 ?? 5) * ARM_SCALE;
    hx = ex + Math.cos(arm.a2) * L2 * fl; hy = ey + Math.sin(arm.a2) * L2;
  }
  const seg = (x0, y0, x1, y1, rad, c) => art.thick(ox + x0, oy + y0, ox + x1, oy + y1, rad, c);
  const la = arm.a2 ?? a1;
  const hcx = hx + Math.cos(la) * fl * 1.4, hcy = hy + Math.sin(la) * 1.4; // hand centre, past the cuff
  // outline pass, fill pass, shade pass
  seg(sx, sy0, ex, ey, r + 1, P('#'));
  if (arm.a2 !== undefined) seg(ex, ey, hx, hy, r + 1, P('#'));
  art.disc(ox + hcx, oy + hcy, far ? 2.5 : 3.0, P('#')); // hand outline
  seg(sx, sy0, ex, ey, r, P('p'));
  if (arm.a2 !== undefined) seg(ex, ey, hx, hy, r, P('p'));
  // shade: a 1-px fold along the lower side of the sleeve
  const nx = -Math.sin(la) * fl, ny = Math.cos(la);
  const sgn = ny >= 0 ? 1 : -1;
  if (!far) {
    const o = r - 0.6;
    if (arm.a2 !== undefined) seg(ex + nx * sgn * o, ey + ny * sgn * o, hx + nx * sgn * o, hy + ny * sgn * o, 0.5, P('P'));
    else seg(sx + nx * sgn * o, sy0 + ny * sgn * o, hx + nx * sgn * o, hy + ny * sgn * o, 0.5, P('P'));
  }
  // cuff: a ribbed band across the sleeve end, like the sprite's
  const cfx = hx - Math.cos(la) * fl * 0.4, cfy = hy - Math.sin(la) * 0.4;
  seg(cfx - nx * r * 0.9, cfy - ny * r * 0.9, cfx + nx * r * 0.9, cfy + ny * r * 0.9, 0.7, P('P'));
  // hand: a mitten as wide as the sleeve
  art.disc(ox + hcx, oy + hcy, far ? 1.5 : 2.0, P('s'));
  art.put(ox + Math.round(hcx - 0.5 - fl * 0.5), oy + Math.round(hcy + 0.5), P('b'));
  if (arm.hand === 'point') {
    // index finger: short line from the fist (direction fingerA or the forearm), outlined
    const fa = arm.fingerA ?? la;
    const fx0 = hcx + Math.cos(fa) * fl * 1.5, fy0 = hcy + Math.sin(fa) * 1.5;
    const fx1 = hcx + Math.cos(fa) * fl * (arm.fingerLen ?? 4.2), fy1 = hcy + Math.sin(fa) * (arm.fingerLen ?? 4.2);
    art.thick(ox + fx0, oy + fy0, ox + fx1, oy + fy1, 1.0, P('#'));
    art.line(ox + fx0, oy + fy0, ox + fx1 - Math.cos(fa) * fl * 0.8, oy + fy1 - Math.sin(fa) * 0.8, P('s'));
    res.finger = [ox + fx1, oy + fy1];
  }
  if (arm.hand === 'baton') {
    const ba = arm.batonA ?? la - 0.5 * fl;
    const bl = arm.batonLen ?? 9;
    const bx1 = hcx + Math.cos(ba) * fl * bl, by1 = hcy + Math.sin(ba) * bl;
    art.line(ox + hcx, oy + hcy, ox + bx1, oy + by1, arm.batonColor ?? 0xf4f0e0);
    art.put(ox + bx1, oy + by1, arm.batonTip ?? 0xffffff);
    res.batonTip = [ox + bx1, oy + by1];
  }
  res.hand = [ox + hcx, oy + hcy];
  return res;
}

// Legs: rows 34..44. Walking frames shift one leg up by 1–2 px.
function legsFrame(g, legs) {
  if (!legs || legs === 'stand') return;
  // left leg columns 5..11, right leg columns 13..20 (rows 35..44)
  const L = [5, 12], Rr = [13, 21];
  const lift = (x0, x1, dy) => {
    for (let y = 35; y <= 44; y++) for (let x = x0; x <= x1; x++) {
      const src = y + dy <= 44 ? getc(BASEG, x, y + dy) : '.';
      setc(g, x, y, y + dy <= 44 ? src : '.');
    }
  };
  if (legs === 'walkA') lift(L[0], L[1], 2);
  if (legs === 'walkB') lift(Rr[0], Rr[1], 2);
  if (legs === 'hopA') { lift(L[0], L[1], 1); }
  if (legs === 'hopB') { lift(Rr[0], Rr[1], 1); }
}
let BASEG = null;

// Sitting on a ledge seen from behind: the legs go over the far side of the ledge, so below the
// sweater only the seat of the trousers shows (rows 34..35) with its bottom outline on row 36.
function seatFrame(g) {
  const row35 = '.....#GGgggggggGggg#....', row36 = '.....###############....';
  for (let x = 0; x < 24; x++) { setc(g, x, 35, row35[x]); setc(g, x, 36, row36[x]); }
  for (let y = 37; y < g.length; y++) for (let x = 0; x < 24; x++) setc(g, x, y, '.');
}

// Back view: same silhouette mirrored, face -> hair, collar -> sweater, nape of the neck.
function backView(g) {
  // head interior (rows 0..19): everything that is not transparent becomes hair, except the outline ring
  const inHead = (x, y) => getc(g, x, y) !== '.';
  const src = g.map((r) => r.slice());
  for (let y = 0; y < 20; y++) for (let x = 0; x < 24; x++) {
    const c = src[y][x];
    if (c === '.') continue;
    const edge = !inHead(x - 1, y) || !inHead(x + 1, y) || !inHead(x, y - 1) || !inHead(x, y + 1);
    if (c === '#' && edge) continue; // keep silhouette outline
    // hair texture: strands of mid/shadow tone, darker toward the nape
    let ch = 'H';
    const strand = (x * 7 + (y >> 1) * 3) % 9 === 0;
    if (y >= 12) ch = 'h';
    if (y >= 16) ch = 'd';
    if (strand && y > 3) ch = y >= 12 ? 'd' : 'h';
    if (x <= 3 || x >= 19) ch = y > 8 ? 'd' : 'h';
    g[y][x] = ch;
  }
  // nape: skin under the hair line
  for (let x = 8; x <= 17; x++) { if (getc(g, x, 18) !== '#' && getc(g, x, 18) !== '.') setc(g, x, 18, 's'); }
  for (let x = 9; x <= 16; x++) { if (getc(g, x, 19) !== '#' && getc(g, x, 19) !== '.') setc(g, x, 19, 'b'); }
  // ear
  for (let y = 13; y <= 15; y++) for (let x = 1; x <= 3; x++) if (getc(g, x, y) !== '.' && getc(g, x, y) !== '#') setc(g, x, y, y === 14 ? 'b' : 's');
  // sweater back: collar becomes shadow
  for (let x = 0; x < 24; x++) if (getc(g, x, 21) === 'b') setc(g, x, 21, 'P');
  for (let x = 0; x < 24; x++) if (getc(g, x, 22) === 'P' && x > 9 && x < 17) setc(g, x, 22, 'p');
  // remove chest crease lines (they belong to the front)
  for (let y = 25; y <= 30; y++) if (getc(g, 7, y) === 'P' && getc(g, 6, y) !== '#') setc(g, 7, y, 'p');
  for (let y = 25; y <= 27; y++) if (getc(g, 18, y) === 'P') setc(g, 18, y, 'p');
  return g.map((r) => r.reverse());
}

/**
 * Draw the hero. (x, y) = feet anchor (bottom centre) in art coords.
 * opts: eyes ('normal'|'blink'|'half'|'round'|'idea'|'wide'|'happy'|'squint'), lookX, lookY,
 *       near/far: puppet arm spec (see drawArm) or null for canonical arms,
 *       flip, back, legs ('stand'|'walkA'|'walkB'), paint: {color, amount, seed},
 *       seat: sitting on a ledge, legs over its far side (only the seat of the trousers shows),
 *       tint: fn(c)→c for lighting-independent recolor
 */
export function drawHero(art, x, y, opts = {}) {
  if (!BASEG) BASEG = grid(BASE);
  let g = grid(BASE);
  const extra = applyEyes(g, opts.eyes || 'normal', opts.lookX || 0, opts.lookY || 0);
  if (opts.near) removeNearArm(g);
  if (opts.far) removeFarArm(g);
  legsFrame(g, opts.legs);
  if (opts.seat) seatFrame(g);
  let flip = !!opts.flip;
  if (opts.back) { g = backView(g); }
  const ox = Math.round(x) - HERO_AX, oy = Math.round(y) - HERO_H;
  const paint = opts.paint;
  const recol = (c, ch, i, j) => {
    let out = c;
    if (paint && paint.amount > 0 && ch !== '#' && i !== undefined) {
      // splotchy paint: deterministic blobs
      const n = hash(Math.floor((i + paint.seed) / 3), Math.floor((j + paint.seed * 3) / 3), 77);
      const n2 = hash(i, j, 91);
      if (n < paint.amount * 0.9 || (n2 < paint.amount * 0.25)) {
        const lum = ((out >> 16) & 255) * 0.3 + ((out >> 8) & 255) * 0.59 + (out & 255) * 0.11;
        out = mix(mix(paint.color, 0x000000, 0.35), mix(paint.color, 0xffffff, 0.35), lum / 255);
      }
    }
    if (opts.tint) out = opts.tint(out, ch);
    return out;
  };
  const rows = g.map((r) => r.join(''));
  const pal = { ...HP };
  const drawBody = () => art.sprite(rows, pal, ox, oy, { flip, recolor: recol });
  const armRecol = (c, ch) => (opts.tint ? opts.tint(c, ch) : c);
  const res = {};
  const prevTag = art.curTag;
  art.curTag = opts.tag ?? HERO_TAG;
  try {
  if (opts.armsOnly) {
    if (opts.far) res.far = drawArm(art, ox, oy, opts.far, 'far', flip, armRecol);
    if (opts.near) res.near = drawArm(art, ox, oy, opts.near, 'near', flip, armRecol);
    return res;
  }
  if (opts.far && opts.far.behind) res.far = drawArm(art, ox, oy, opts.far, 'far', flip, armRecol);
  if (opts.near && opts.near.behind) res.near = drawArm(art, ox, oy, opts.near, 'near', flip, armRecol);
  drawBody();
  if (opts.far && !opts.far.behind) res.far = drawArm(art, ox, oy, opts.far, 'far', flip, armRecol);
  if (opts.near && !opts.near.behind) res.near = drawArm(art, ox, oy, opts.near, 'near', flip, armRecol);
  for (const [ex, ey, kind] of extra) {
    const px = flip ? ox + 23 - ex : ox + ex;
    if (kind === 'white') art.put(px, oy + ey, 0xffffff);
    else if (kind === 'glint') art.emit(() => art.put(px, oy + ey, 0xffffff));
  }
  res.head = [ox + (flip ? 24 - 12 : 12), oy + 10];
  res.eyes = [ox + (flip ? 24 - 14 : 14), oy + 14];
  return res;
  } finally { art.curTag = prevTag; }
}

/** Convenience arm presets (angles in radians; 0 = pointing screen-right, π/2 = down). */
export const ARMS = {
  pointRight: { a: -0.12, len: 9, hand: 'point' },
  pointLeft: { a: Math.PI + 0.12, len: 9, hand: 'point' },
  up: { a: -Math.PI / 2 - 0.25, len: 9, hand: 'open' },
  down: { a: Math.PI / 2 - 0.08, len: 8, hand: 'open' },
};
