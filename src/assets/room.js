// The set: the hero's room at night, one 320×180 world in the art grid. Every shot frames it with
// its own camera; the story state (clock, rain, paint, coffee, sparks, dawn...) is passed in.
// Layers: back (sky/window/wall/floor/socket) → [hero] → desk (desk, monitor, props) → [bots] → fx.
import { mix, scale } from '../engine/color.js';
import { hash, clamp, fract, noise1, TAU, bayer } from '../engine/util.js';
import { FONTS, drawText, textWidth } from '../engine/font.js';
import { RING } from './brand.js';

export const W = 320, H = 180;
/** Tag of the monitor body + deadline sticker: the screen's own light does not fall on them. */
export const TAG_MONITOR = 20;
const OUT = 0x020302;

// ---- layout (art px) ---------------------------------------------------------------------------
export const L = {
  ceilingY: 7, wallBaseY: 132, floorFront: 180,
  window: { x: 104, y: 14, w: 116, h: 60 },          // glass area
  sillY: 76,                                          // windowsill top surface y
  desk: { x0: 84, x1: 266, backY: 130, frontY: 142, legY: 158 },
  hero: { x: 134, y: 144 },                           // hero feet anchor when seated behind the desk (hem at desk edge)
  monitor: { x: 164, y: 84, w: 74, h: 50 },           // body box
  screen: { x: 171, y: 90, w: 60, h: 34 },            // emissive screen
  keyboard: { x: 112, y: 133, w: 46, h: 7 },
  enterKey: { x: 150, y: 134, w: 6, h: 3 },
  mug: { x: 206, y: 136 },                            // mug bottom-centre on the desk (in front of the monitor stand)
  lamp: { x: 256, y: 136 },
  stickies: { x: 102, y: 141 },                       // the "mountain" of sticky notes on the desk (left end)
  socket: { x: 292, y: 116 },
  strip: { x: 272, y: 152, w: 22, h: 5 },             // power strip on the floor
  floorLineY: 172,                                    // where bots usually stand (feet)
  mugFloor: { x: 206, y: 171 },                      // where the mug lands
  river: [[206, 171], [218, 170], [232, 169], [246, 167], [258, 165], [268, 162], [276, 158]],
};

// ---- palettes ------------------------------------------------------------------------------
export const WALLS = {
  night: { base: 0x33365c, dark: 0x262847, pattern: 0x3b3f6a, trim: 0x1e1f36 },
  pink: { base: 0xe86fb4, dark: 0xc25493, pattern: 0xf28cc6, trim: 0x9b3d74 },
  lime: { base: 0xa4e04a, dark: 0x7fb835, pattern: 0xbff06a, trim: 0x5b8a24 },
  teal: { base: 0x33c2b0, dark: 0x25998b, pattern: 0x57d8c6, trim: 0x1b6f66 },
  orange: { base: 0xff9a3c, dark: 0xd8782a, pattern: 0xffb866, trim: 0xa8561c },
  cyan: { base: 0x5ec8ff, dark: 0x3fa0d6, pattern: 0x8adaff, trim: 0x2f72a0 },
  // the "beautiful" repaint in act IV: deep plum with soft gold stars
  pretty: { base: 0x4a3a78, dark: 0x3a2d62, pattern: 0xffd98a, trim: 0x2b2150, stars: true },
};
const FLOOR = { base: 0x5a3d2e, dark: 0x45301f, light: 0x6e4c38, gap: 0x2e1f16 };
const WOOD = { hi: 0xc28a58, light: 0xa8744a, base: 0x8a5a3a, shade: 0x6a432a, dark: 0x4a2e1c };
const BEIGE = { hi: 0xf4ecd6, light: 0xe6dcc0, base: 0xd2c6a4, shade: 0xaea17e, dark: 0x7e735a };

// ---- sky & city (seen through the window; also used by the dawn shots) ---------------------
/** dawn: 0 = deep night, 1 = full sunrise. Draws into rect (x0,y0,w,h) in absolute coords. */
export function drawOutside(art, x0, y0, w, h, st) {
  const t = st.t ?? 0, dawn = st.dawn ?? 0;
  const night = [0x0b1030, 0x151c46, 0x27275a];
  const dawnC = [0x3a4a9a, 0xe0789a, 0xffc36a];
  for (let y = 0; y < h; y++) {
    const u = y / (h - 1);
    const top = mix(night[0], dawnC[0], dawn), mid = mix(night[1], dawnC[1], dawn), bot = mix(night[2], dawnC[2], dawn);
    const base = u < 0.55 ? mix(top, mid, u / 0.55) : mix(mid, bot, (u - 0.55) / 0.45);
    // banded sky with dithered transitions between bands
    for (let x = 0; x < w; x++) {
      const fb = u * 7, fi = Math.floor(fb), fr = Math.min(1, Math.max(0, (fb - fi - 0.5) / 0.35 + 0.5));
      const band = (fi + (fr > bayer(x0 + x, y0 + y) ? 1 : 0)) / 7;
      const c = band < 0.55 ? mix(top, mid, band / 0.55) : mix(mid, bot, (band - 0.55) / 0.45);
      art.emit(() => art.put(x0 + x, y0 + y, mix(c, base, 0.25)));
    }
  }
  // stars (fade with dawn)
  if (dawn < 0.8) {
    for (let k = 0; k < 40; k++) {
      const sx = Math.floor(hash(k, 1) * w), sy = Math.floor(hash(k, 2) * h * 0.6);
      const tw = 0.5 + 0.5 * Math.sin(t * (2 + hash(k, 3) * 3) + k);
      const a = (1 - dawn / 0.8) * (0.4 + 0.6 * tw);
      if (a > bayer(sx, sy) * 1.1) art.emit(() => art.put(x0 + sx, y0 + sy, hash(k, 4) > 0.8 ? 0xfff2c0 : 0xc8d4ff));
    }
  }
  // moon (night) / sun (dawn)
  if (dawn < 0.6) {
    const mx = x0 + Math.round(w * 0.78), my = y0 + Math.round(h * 0.2);
    const a = 1 - dawn / 0.6;
    art.emit(() => {
      art.disc(mx + 0.5, my + 0.5, 4.2, mix(0x27275a, 0xf4f0d8, a));
      art.disc(mx + 2.5, my - 0.5, 3.6, mix(0x0b1030, 0x151c46, 0.3));
    });
  }
  if (dawn > 0) {
    // below dawn 0.5 the sun is still coming up from behind the skyline, deep red → warm
    const sink = Math.round(Math.max(0, 0.5 - dawn) * 44), warm = Math.min(1, dawn / 0.5);
    const sunY = y0 + h - 8 - Math.round(dawn * 14) + sink + (st.sunOffset ?? 0);
    const sx = x0 + Math.round(w * (st.sunX ?? 0.3));
    art.emit(() => {
      for (let r = 14; r >= 5; r -= 3) art.disc(sx + 0.5, sunY + 0.5, r, mix(0xa8405a, mix(mix(0xffc36a, 0xff8a5a, 0.3), 0xfff2b0, (14 - r) / 12), warm));
      art.disc(sx + 0.5, sunY + 0.5, 5, mix(0xff8a5a, 0xfff8dc, warm));
    });
  }
  // city skyline: 2 depth layers of buildings with lit windows
  const layers = [
    { seed: 11, base: y0 + h, hMin: 10, hMax: 24, col: mix(0x1a1c3c, 0x6a4a78, dawn), win: 0.22, wx: 3 },
    { seed: 23, base: y0 + h, hMin: 4, hMax: 16, col: mix(0x10122a, 0x3a2848, dawn), win: 0.3, wx: 2 },
  ];
  for (const Ly of layers) {
    let bx = x0 - 3;
    let k = 0;
    while (bx < x0 + w) {
      const bw = 7 + Math.floor(hash(k, Ly.seed) * 12);
      const bh = Ly.hMin + Math.floor(hash(k, Ly.seed + 1) * (Ly.hMax - Ly.hMin));
      const top = Ly.base - bh;
      art.emit(() => art.rect(bx, top, bw, bh, Ly.col));
      if (hash(k, Ly.seed + 2) > 0.6) art.emit(() => art.rect(bx + Math.floor(bw / 2) - 1, top - 3, 1, 3, Ly.col)); // antenna
      // windows
      for (let wy = top + 2; wy < Ly.base - 1; wy += 3) for (let wx = bx + 1; wx < bx + bw - 1; wx += Ly.wx) {
        const hsh = hash(wx, wy, Ly.seed);
        const on = hsh < Ly.win * (1 - dawn * 0.8) ? 1 : 0;
        const flick = hash(wx, wy, Math.floor(t * 0.7 + hsh * 10)) > 0.97 ? 0 : 1;
        if (on && flick) art.emit(() => art.put(wx, wy, hsh < 0.05 ? 0x9ad8ff : 0xffd27a));
      }
      if (hash(k, Ly.seed + 5) > 0.75) { // blinking red roof light
        const on = Math.floor(t * 1.2 + k) % 2 === 0;
        if (on) art.emit(() => art.put(bx + 1, top - 1, 0xff4040));
      }
      bx += bw + (hash(k, Ly.seed + 3) > 0.7 ? 1 : 0);
      k++;
    }
  }
}

// ---- window ------------------------------------------------------------------------------------
function drawWindow(art, st) {
  const { x, y, w, h } = L.window;
  const t = st.t ?? 0;
  // outside (clipped to glass)
  art.clip(x, y, x + w, y + h, () => drawOutside(art, x, y, w, h, st));
  // rain on glass: thin diagonal streaks sliding down + a few resting droplets
  const rain = st.rain ?? 0;
  if (rain > 0) {
    art.clip(x, y, x + w, y + h, () => {
      const n = Math.round(22 * rain);
      for (let k = 0; k < n; k++) {
        const speed = 70 + hash(k, 7) * 50;
        const rx = x + Math.floor(hash(k, 5) * (w + 16)) - 8;
        const ry = y + ((hash(k, 6) * (h + 16) + t * speed) % (h + 16)) - 8;
        const len = 4 + Math.floor(hash(k, 8) * 4);
        art.emit(() => {
          for (let j = 0; j < len; j++) art.put(rx - Math.floor(j / 4), ry + j, j < 2 ? 0x7f93c4 : 0xa8bce8);
        });
      }
      for (let k = 0; k < Math.round(10 * rain); k++) {
        const dx = x + Math.floor(hash(k, 31) * w), dy = y + Math.floor(hash(k, 32) * h);
        art.emit(() => { art.put(dx, dy, 0xb8c8f0); art.put(dx, dy + 1, 0x6a7aa8); });
      }
    });
  }
  // frame (painted wood, light)
  const F = st.windowFrame ?? { hi: 0xe8e2d4, base: 0xcfc6b2, shade: 0x9d937e };
  art.rect(x - 3, y - 3, w + 6, 3, F.base); art.hline(x - 3, x + w + 2, y - 3, F.hi);
  art.rect(x - 3, y + h, w + 6, 2, F.shade);
  art.rect(x - 3, y, 3, h, F.base); art.vline(x - 3, y, y + h - 1, F.hi);
  art.rect(x + w, y, 3, h, F.shade);
  // mullions: centre vertical + one horizontal
  const mx = x + Math.floor(w / 2);
  art.rect(mx - 1, y, 3, h, F.base); art.vline(mx - 1, y, y + h - 1, F.hi);
  art.rect(x, y + 22, w, 2, F.base); art.hline(x, x + w - 1, y + 22, F.hi);
  // форточка (small top pane) hinge highlight
  art.put(x + 4, y + 10, F.shade);
  // outline
  art.frame(x - 4, y - 4, w + 8, h + 7, OUT);
  // sill: deep wooden ledge
  const sy = L.sillY;
  art.rect(x - 8, sy, w + 16, 4, WOOD.light); art.hline(x - 8, x + w + 7, sy, WOOD.hi);
  art.rect(x - 8, sy + 4, w + 16, 2, WOOD.shade);
  art.hline(x - 9, x + w + 8, sy + 6, OUT);
  art.vline(x - 9, sy, sy + 5, OUT); art.vline(x + w + 8, sy, sy + 5, OUT);
  // curtains (sway)
  const cur = st.curtain ?? 0x7a2e4a;
  const cl = { base: cur, dark: mix(cur, 0x000000, 0.35), light: mix(cur, 0xffffff, 0.18) };
  for (const side of [-1, 1]) {
    const cx0 = side < 0 ? x - 14 : x + w + 4;
    for (let yy = y - 6; yy < sy + 2; yy++) {
      const sway = Math.round(Math.sin(t * 1.3 + yy * 0.12 + (side > 0 ? 1 : 0)) * 0.8 * (yy - y + 6) / 60);
      for (let i = 0; i < 10; i++) {
        const fold = (i + (yy >> 3)) % 4;
        const c = fold === 0 ? cl.dark : fold === 2 ? cl.light : cl.base;
        art.put(cx0 + i + sway, yy, c);
      }
      art.put(cx0 - 1 + sway, yy, OUT); art.put(cx0 + 10 + sway, yy, OUT);
    }
  }
  // curtain rod
  art.rect(x - 18, y - 8, w + 36, 2, 0x3a3440); art.hline(x - 18, x + w + 17, y - 8, 0x6a6474);
}

// ---- wall --------------------------------------------------------------------------------------
function drawWall(art, st) {
  const wipe = st.wallWipe;
  const WcAt = (x, y) => {
    if (!wipe) return st.wall ?? WALLS.night;
    // the designer's brush sweeps left → right, a ragged diagonal edge
    const edge = wipe.k * (W + 40) - 20 + Math.sin(y * 0.35) * 4 - (y - 60) * 0.15;
    return x < edge ? wipe.to : wipe.from;
  };
  const Wc = WcAt(W / 2, 60);
  const t = st.t ?? 0;
  const y0 = L.ceilingY, y1 = L.wallBaseY;
  for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
    const Wc = WcAt(x, y);
    // wallpaper: soft vertical stripes + small diamond pattern
    let c = (x >> 3) % 2 === 0 ? Wc.base : mix(Wc.base, Wc.dark, 0.35);
    if (Wc.stars) {
      const cell = hash(x >> 4, y >> 4, 5);
      if (cell > 0.55 && (x & 15) === 7 && (y & 15) === 7) c = Wc.pattern;
      if (cell > 0.55 && (((x & 15) === 7 && ((y & 15) === 6 || (y & 15) === 8)) || ((y & 15) === 7 && ((x & 15) === 6 || (x & 15) === 8)))) c = mix(Wc.pattern, Wc.base, 0.5);
    } else if ((x + 4) % 16 === 0 && (y + 4) % 16 === 0) c = Wc.pattern;
    art.put(x, y, c);
  }
  // ceiling band + crown molding
  art.rect(0, 0, W, y0, mix(Wc.trim, 0x000000, 0.4));
  art.hline(0, W - 1, y0 - 1, Wc.trim);
  art.hline(0, W - 1, y0, mix(Wc.base, 0xffffff, 0.12));
  // baseboard
  art.rect(0, y1 - 4, W, 4, mix(Wc.trim, 0xffffff, 0.12));
  art.hline(0, W - 1, y1 - 4, mix(Wc.trim, 0xffffff, 0.35));
  art.hline(0, W - 1, y1 - 1, Wc.trim);
  // corner shading at the far left/right (room depth)
  for (let y = y0; y < y1; y++) for (let x = 0; x < 6; x++) art.dput(x, y, Wc.dark, (6 - x) / 7);
  for (let y = y0; y < y1; y++) for (let x = W - 6; x < W; x++) art.dput(x, y, Wc.dark, (x - W + 7) / 7);

  // bookshelf (left)
  const bx = 12, by = 30, bw = 44, bh = 102;
  art.rect(bx - 1, by - 1, bw + 2, bh + 1, OUT);
  art.rect(bx, by, bw, bh, WOOD.shade);
  art.rect(bx, by, bw, 3, WOOD.light); art.hline(bx, bx + bw - 1, by, WOOD.hi);
  art.rect(bx, by + 3, 3, bh - 3, WOOD.base); art.rect(bx + bw - 3, by + 3, 3, bh - 3, WOOD.dark);
  for (let k = 0; k < 4; k++) {
    const sy = by + 26 + k * 24;
    art.rect(bx + 3, sy, bw - 6, 3, WOOD.light); art.hline(bx + 3, bx + bw - 4, sy, WOOD.hi);
    art.rect(bx + 3, sy - 21, bw - 6, 21, WOOD.dark);
    // books
    let xx = bx + 4;
    let i = 0;
    while (xx < bx + bw - 6) {
      const bwid = 2 + Math.floor(hash(k, i, 3) * 3), bht = 12 + Math.floor(hash(k, i, 4) * 8);
      if (hash(k, i, 9) < 0.12) { xx += 3; i++; continue; }
      const hue = RING[Math.floor(hash(k, i, 5) * 12)];
      const col = mix(hue, 0x2a2438, 0.45);
      art.rect(xx, sy - bht, bwid, bht, col);
      art.vline(xx, sy - bht, sy - 1, mix(col, 0xffffff, 0.2));
      art.hline(xx, xx + bwid - 1, sy - bht + 3, mix(col, 0xffffff, 0.3));
      xx += bwid + (hash(k, i, 6) < 0.2 ? 1 : 0);
      i++;
    }
  }
  // a small plant on top of the shelf
  art.rect(bx + 30, by - 7, 8, 7, 0xb0643a); art.hline(bx + 30, bx + 37, by - 7, 0xd08050);
  art.frame(bx + 29, by - 8, 10, 8, OUT);
  for (let k = 0; k < 7; k++) {
    const lx = bx + 31 + Math.round(Math.sin(k * 1.7) * 4), ly = by - 10 - Math.round(hash(k, 44) * 7);
    const sw = Math.round(Math.sin(t * 1.1 + k) * 0.6);
    art.line(bx + 34, by - 8, lx + sw, ly, k % 2 ? 0x3f8a4a : 0x5aad5a);
  }

  // poster (right of the shelf): a retro "PIXEL BY PIXEL" style poster, framed
  const px = 64, py = 36;
  art.rect(px - 1, py - 1, 26, 34, OUT);
  art.rect(px, py, 24, 32, 0x1b2438);
  art.emit(() => {}); // poster is not emissive
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU - Math.PI / 2;
    art.put(px + 12 + Math.round(Math.cos(a) * 6), py + 12 + Math.round(Math.sin(a) * 6), RING[k]);
    art.put(px + 12 + Math.round(Math.cos(a) * 5), py + 12 + Math.round(Math.sin(a) * 5), mix(RING[k], 0x000000, 0.3));
  }
  art.rect(px + 10, py + 10, 5, 5, 0x05070c);
  art.put(px + 11, py + 11, 0xffffff); art.put(px + 12, py + 12, 0xffffff); art.put(px + 11, py + 13, 0xffffff);
  drawText(art, FONTS.tiny, 'P×P', px + 7, py + 23, 0xe8e2d4);

  // sticky notes on the wall near the desk (tasks) — the "mountain" continues on the wall
  const wallNotes = st.wallNotes ?? 1;
  const NOTE = [0xffe066, 0xff9ec8, 0x9ee8ff, 0xb8f28a];
  for (let k = 0; k < Math.round(9 * wallNotes); k++) {
    const nx = 58 + Math.floor(hash(k, 61) * 28), ny = 78 + Math.floor(hash(k, 62) * 34);
    const c = NOTE[k % 4];
    art.rect(nx, ny, 7, 6, c); art.hline(nx, nx + 6, ny, mix(c, 0xffffff, 0.3));
    art.hline(nx + 1, nx + 4, ny + 2, mix(c, 0x000000, 0.4)); art.hline(nx + 1, nx + 3, ny + 4, mix(c, 0x000000, 0.4));
    art.put(nx + 6, ny + 5, mix(c, 0x000000, 0.25));
  }

  // wall socket (right, low)
  const so = L.socket;
  art.rect(so.x - 1, so.y - 1, 10, 12, OUT);
  art.rect(so.x, so.y, 8, 10, 0xe8e2d4); art.hline(so.x, so.x + 7, so.y, 0xffffff);
  art.put(so.x + 2, so.y + 4, OUT); art.put(so.x + 5, so.y + 4, OUT);
  art.put(so.x + 2, so.y + 5, OUT); art.put(so.x + 5, so.y + 5, OUT);

  // wall clock? (no — the clock lives on the monitor). A framed photo right of the window
  const fx = 244, fy = 30;
  art.rect(fx - 1, fy - 1, 22, 18, OUT); art.rect(fx, fy, 20, 16, 0xd8cdb0);
  art.rect(fx + 2, fy + 2, 16, 12, 0x6a8ac8);
  art.rect(fx + 2, fy + 9, 16, 5, 0x4a8a5a); art.disc(fx + 14.5, fy + 5.5, 2, 0xffe890);
  art.line(fx + 2, fy + 10, fx + 8, fy + 6, 0x7a6a5a); art.line(fx + 8, fy + 6, fx + 12, fy + 10, 0x7a6a5a);
}

// ---- garland of fairy lights in the 12 ring colors -----------------------------------------------
/** levels: array(12) of 0..1 brightness, or undefined → gentle idle twinkle */
function drawGarland(art, st) {
  const t = st.t ?? 0;
  const x0 = 8, x1 = W - 8, yTop = 12;
  const N = 24;
  const pts = [];
  for (let i = 0; i <= 96; i++) {
    const u = i / 96;
    const x = x0 + (x1 - x0) * u;
    const sag = Math.sin(fract(u * 3) * Math.PI) * 7;
    pts.push([x, yTop + sag]);
  }
  for (let i = 0; i < pts.length - 1; i++) art.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 0x1c1a24);
  const bulbs = [];
  for (let k = 0; k < N; k++) {
    const u = (k + 0.5) / N;
    const x = x0 + (x1 - x0) * u, y = yTop + Math.sin(fract(u * 3) * Math.PI) * 7 + 2;
    const col = RING[k % 12];
    let lv = st.garland ? st.garland[k % 12] : 0.55 + 0.45 * Math.sin(t * 2 + k * 1.3);
    if (st.garlandOff) lv = 0;
    const bx = Math.round(x), by = Math.round(y);
    art.put(bx, by - 1, 0x1c1a24);
    if (lv > 0.08) {
      const c = mix(mix(col, 0x000000, 0.55), mix(col, 0xffffff, 0.2), clamp(lv));
      art.emit(() => { art.put(bx, by, c); art.put(bx, by + 1, mix(c, 0x000000, 0.25)); });
    } else {
      art.put(bx, by, mix(col, 0x000000, 0.6)); art.put(bx, by + 1, mix(col, 0x000000, 0.7));
    }
    bulbs.push({ x: bx, y: by, col, lv });
  }
  return bulbs;
}

// ---- floor ---------------------------------------------------------------------------------------
function drawFloor(art, st) {
  const y0 = L.wallBaseY;
  // planks parallel to the wall, rows get taller toward the viewer (perspective)
  let y = y0, row = 0;
  while (y < H) {
    const hgt = 3 + Math.floor(row * 0.9);
    for (let yy = y; yy < Math.min(H, y + hgt); yy++) {
      const off = (row * 37) % 60;
      for (let x = 0; x < W; x++) {
        let c = FLOOR.base;
        if (yy === y) c = FLOOR.gap;
        else if (yy === y + 1) c = FLOOR.light;
        else if (((x + off) % 60) === 0) c = FLOOR.gap;
        else if (hash(x >> 2, row, 3) > 0.8) c = FLOOR.dark;
        art.put(x, yy, st.floorTint ? mix(c, st.floorTint, 0.5) : c);
      }
    }
    y += hgt; row++;
  }
  // rug in front of the desk
  const rx = 96, ry = 162, rw = 150, rh = 16;
  const RUG = st.rug ?? { a: 0x2f5a78, b: 0x3f7294, c: 0xe8d8a8 };
  for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) {
    const border = j < 2 || j >= rh - 2 || i < 3 || i >= rw - 3;
    let c = border ? RUG.c : ((i >> 2) + (j >> 1)) % 2 ? RUG.a : RUG.b;
    if (!border && (j === 5 || j === rh - 6)) c = RUG.c;
    art.put(rx + i, ry + j, c);
  }
}

// ---- power strip + cables ----------------------------------------------------------------------
function drawStrip(art, st) {
  const s = L.strip;
  const wet = st.stripWet ?? 0;
  // cable to the wall socket
  art.line(s.x + s.w, s.y + 2, L.socket.x + 3, L.socket.y + 10, 0x1a1a1a);
  art.line(s.x + s.w, s.y + 3, L.socket.x + 4, L.socket.y + 11, 0x2a2a2a);
  // cables from the desk (monitor, lamp) into the strip
  art.line(L.desk.x1 - 20, L.desk.legY, s.x + 4, s.y, 0x1a1a1a);
  art.line(L.desk.x1 - 6, L.desk.legY - 2, s.x + 10, s.y, 0x1a1a1a);
  art.rect(s.x - 1, s.y - 1, s.w + 2, s.h + 2, OUT);
  art.rect(s.x, s.y, s.w, s.h, 0xe8e2d4); art.hline(s.x, s.x + s.w - 1, s.y, 0xffffff);
  art.hline(s.x, s.x + s.w - 1, s.y + s.h - 1, 0xb8b0a0);
  for (let k = 0; k < 3; k++) { art.put(s.x + 5 + k * 5, s.y + 2, OUT); art.put(s.x + 7 + k * 5, s.y + 2, OUT); }
  // switch LED
  const led = st.stripLed ?? 'red';
  const ledC = led === 'green' ? 0x5cff6a : led === 'off' ? 0x4a1a1a : 0xff4a3a;
  art.emit(() => art.put(s.x + 1, s.y + 2, ledC));
  if (wet > 0) {
    for (let k = 0; k < 6; k++) art.dput(s.x + 2 + k * 3, s.y + s.h, 0x9ad8ff, wet);
  }
}

// ---- desk & props --------------------------------------------------------------------------------
export function drawMonitor(art, st) {
  const prev = art.curTag;
  art.curTag = TAG_MONITOR;
  drawMonitorBody(art, st);
  art.curTag = prev;
}
function drawMonitorBody(art, st) {
  const m = L.monitor, sc = L.screen;
  const M = st.monitorBody ?? BEIGE;
  // side (depth) on the left: monitor turned toward the hero
  art.rect(m.x - 7, m.y + 3, 8, m.h - 12, OUT);
  art.rect(m.x - 6, m.y + 4, 7, m.h - 14, M.shade);
  art.vline(m.x - 6, m.y + 4, m.y + m.h - 11, M.dark);
  for (let k = 0; k < 4; k++) art.hline(m.x - 5, m.x - 1, m.y + 10 + k * 5, M.dark); // vents
  // front bezel
  art.rect(m.x - 1, m.y - 1, m.w + 2, m.h - 6, OUT);
  art.rect(m.x, m.y, m.w, m.h - 8, M.base);
  art.hline(m.x, m.x + m.w - 1, m.y, M.hi); art.vline(m.x, m.y, m.y + m.h - 9, M.light);
  art.vline(m.x + m.w - 1, m.y + 1, m.y + m.h - 9, M.shade); art.hline(m.x, m.x + m.w - 1, m.y + m.h - 9, M.shade);
  // screen recess
  art.rect(sc.x - 2, sc.y - 2, sc.w + 4, sc.h + 4, M.dark);
  art.rect(sc.x - 1, sc.y - 1, sc.w + 2, sc.h + 2, OUT);
  // brand strip + power LED on the chin
  art.hline(m.x + 6, m.x + 20, m.y + m.h - 11, M.shade);
  const powered = st.power ?? 1;
  art.emit(() => art.put(m.x + m.w - 6, m.y + m.h - 11, powered > 0.5 ? 0x7dff7a : 0x3a1a1a));
  // stand
  art.rect(m.x + 26, m.y + m.h - 8, 22, 5, OUT);
  art.rect(m.x + 27, m.y + m.h - 8, 20, 4, M.shade);
  art.rect(m.x + 18, m.y + m.h - 4, 38, 4, OUT);
  art.rect(m.x + 19, m.y + m.h - 4, 36, 3, M.light); art.hline(m.x + 19, m.x + 54, m.y + m.h - 4, M.hi);
  // screen contents
  art.clip(sc.x, sc.y, sc.x + sc.w, sc.y + sc.h, () => drawScreen(art, st.screen ?? {}, st));
}

/** Screen modes: terminal | code | progress | deployed | glitch | off | boot */
function drawScreen(art, S, st) {
  const sc = L.screen;
  const t = st.t ?? 0;
  const mode = S.mode ?? 'terminal';
  const bg = S.bg ?? 0x0c1a2c;
  const x = sc.x, y = sc.y;
  art.emit(() => {
    if (mode === 'off') { art.rect(x, y, sc.w, sc.h, 0x06080c); return; }
    art.rect(x, y, sc.w, sc.h, bg);
    // scanline shimmer (every other row slightly darker) — in art pixels
    for (let yy = 1; yy < sc.h; yy += 2) art.hline(x, x + sc.w - 1, y + yy, mix(bg, 0x000000, 0.25));
    // title bar with clock
    art.rect(x, y, sc.w, 7, 0x1d3350);
    art.put(x + 2, y + 3, 0xff5f56); art.put(x + 4, y + 3, 0xffbd2e); art.put(x + 6, y + 3, 0x27c93f);
    const clock = S.clock ?? '02:00';
    const clockCol = S.clockColor ?? 0xe8f0ff;
    const cw = textWidth(FONTS.tiny, clock);
    if (!S.clockHidden) drawText(art, FONTS.tiny, clock, x + sc.w - cw - 2, y + 1, clockCol);
  });
  const G = 0x7dff9a, C = 0x9ad8ff, Wt = 0xe8f0ff, DIM = 0x4a6a8a;
  art.emit(() => {
    if (mode === 'terminal') {
      const lines = S.lines ?? ['$ git status', '42 tasks open', ''];
      let ly = y + 9;
      for (const ln of lines) { drawText(art, FONTS.tiny, ln, x + 2, ly, DIM); ly += 7; }
      const cmd = S.cmd ?? '> spawn agents';
      const n = S.typed ?? cmd.length;
      const shown = cmd.slice(0, n);
      const wpx = drawText(art, FONTS.tiny, shown, x + 2, y + 27 - (S.cmdLift ?? 0), G);
      const cursorOn = S.cursor ?? (Math.floor(t / 0.234375) % 2 === 0);
      if (cursorOn) art.rect(x + 2 + wpx + 2, y + 27 - (S.cmdLift ?? 0), 3, 5, G);
    } else if (mode === 'code') {
      // fast-scrolling code (Coder at work)
      const scroll = S.scroll ?? t * 40;
      const rowsN = 4;
      for (let r = 0; r < rowsN; r++) {
        const li = Math.floor(scroll) + r;
        const indent = (hash(li, 3) * 4) | 0;
        const len = 6 + ((hash(li, 4) * 40) | 0);
        const col = hash(li, 5) > 0.7 ? G : hash(li, 5) > 0.4 ? C : Wt;
        const yy = y + 9 + r * 6 - Math.round(fract(scroll) * 6);
        for (let k = 0; k < len; k += 1) {
          if (hash(li, k, 6) < 0.18) continue;
          art.put(x + 2 + indent * 2 + k, yy + 2, col);
          if (hash(li, k, 7) < 0.5) art.put(x + 2 + indent * 2 + k, yy + 1, col);
        }
      }
    } else if (mode === 'progress') {
      const p = clamp(S.progress ?? 0.12);
      drawText(art, FONTS.tiny, S.label ?? 'deploying', x + 3, y + 11, C);
      const bx = x + 3, by = y + 20, bw = sc.w - 6;
      art.rect(bx, by, bw, 6, 0x1d3350);
      art.rect(bx + 1, by + 1, Math.round((bw - 2) * p), 4, S.barColor ?? G);
      const pct = Math.round(p * 100) + '%';
      drawText(art, FONTS.tiny, pct, x + sc.w - textWidth(FONTS.tiny, pct) - 3, y + 11, Wt);
    } else if (mode === 'deployed') {
      const s = 'deployed ✓';
      const wpx = textWidth(FONTS.big, s);
      drawText(art, FONTS.big, s, x + Math.round((sc.w - wpx) / 2), y + 13, S.flash ? 0xffffff : G);
    } else if (mode === 'glitch') {
      for (let k = 0; k < 40; k++) {
        const gx = x + Math.floor(hash(k, Math.floor(t * 24)) * sc.w), gy = y + 7 + Math.floor(hash(k, Math.floor(t * 24), 2) * (sc.h - 7));
        art.hline(gx, gx + 2 + Math.floor(hash(k, 9) * 8), gy, hash(k, 3) > 0.5 ? 0xff4a7a : C);
      }
      if (S.big) { const wpx = textWidth(FONTS.big, S.big); drawText(art, FONTS.big, S.big, x + Math.round((sc.w - wpx) / 2), y + 14, 0xff5a5a); }
    } else if (mode === 'boot') {
      const p = clamp(S.progress ?? 0.12);
      drawText(art, FONTS.tiny, 'progress', x + 3, y + 11, DIM);
      const bx = x + 3, by = y + 20, bw = sc.w - 6;
      art.rect(bx, by, bw, 5, 0x14243a);
      art.rect(bx + 1, by + 1, Math.round((bw - 2) * p), 3, 0x3a8a5a);
      drawText(art, FONTS.tiny, Math.round(p * 100) + '%', x + sc.w - 14, y + 11, 0x7a9aba);
    }
    if (S.flashAmt > 0) {
      for (let yy = 0; yy < sc.h; yy++) for (let xx = 0; xx < sc.w; xx++) art.dput(x + xx, y + yy, 0xffffff, S.flashAmt);
    }
  });
}

/** The deadline sticker stuck on the monitor's top-left corner. */
function drawDeadlineSticker(art, st) {
  const nw = 38, nh = 18;
  const nx = L.monitor.x - 14, ny = L.monitor.y - 8;
  const c = 0xffe066;
  art.rect(nx - 1, ny - 1, nw + 2, nh + 2, OUT);
  art.rect(nx, ny, nw, nh, c);
  art.hline(nx, nx + nw - 1, ny, 0xfff2a8);
  art.rect(nx, ny + nh - 2, nw, 2, mix(c, 0xd8a820, 0.45)); // curled bottom edge
  art.put(nx + nw - 1, ny + nh - 1, OUT);
  drawText(art, FONTS.tiny, 'ДЕДЛАЙН', nx + 3, ny + 4, 0xc0282a);
  drawText(art, FONTS.tiny, '06:00', nx + 10, ny + 11, 0x2a2a3a);
  art.rect(nx + 15, ny - 2, 8, 3, 0xd8e8f0); // tape
  art.hline(nx + 15, nx + 22, ny - 2, 0xffffff);
}

export function drawMug(art, x, y, st = {}) {
  // (x,y) = bottom centre. A white mug with the orange ring stripe, handle on the right.
  const tilt = st.tilt ?? 0; // 0 upright, 1 on its side
  const M = { hi: 0xffffff, base: 0xe8e4dc, shade: 0xb8b2a8 };
  if (tilt > 0.5) {
    // lying on its side (for falling frames)
    art.rect(x - 5, y - 6, 10, 7, OUT); art.rect(x - 4, y - 5, 8, 5, M.base); art.hline(x - 4, x + 3, y - 5, M.hi);
    art.rect(x - 4, y - 3, 8, 1, 0xff9a3c);
    art.rect(x + 4, y - 5, 2, 5, OUT);
    return;
  }
  art.rect(x - 4, y - 9, 9, 10, OUT);
  art.rect(x - 3, y - 8, 7, 8, M.base);
  art.vline(x - 3, y - 8, y - 1, M.hi); art.vline(x + 3, y - 8, y - 1, M.shade);
  art.hline(x - 3, x + 3, y - 4, 0xff9a3c);
  // handle
  art.rect(x + 5, y - 7, 3, 5, OUT); art.put(x + 6, y - 6, M.base); art.put(x + 6, y - 5, -1); art.put(x + 6, y - 4, M.base);
  art.put(x + 5, y - 5, M.shade);
  // contents
  const fill = st.fill ?? 0.8;
  if (fill > 0) {
    art.hline(x - 3, x + 3, y - 8, st.liquid ?? 0x5a3522);
    if (fill > 1) art.hline(x - 3, x + 3, y - 9, st.liquid ?? 0x5a3522);
  } else {
    art.hline(x - 3, x + 3, y - 8, 0x3a3630);
  }
  // steam: two wisps curling up
  if (st.steam) {
    const t = st.t ?? 0;
    art.emit(() => {
      for (let w = 0; w < 2; w++) for (let k = 0; k < 5; k++) {
        const ph = fract(t * 0.55 + k / 5 + w * 0.37);
        const sx = x - 1 + w * 2 + Math.round(Math.sin(ph * 6 + w * 2.4 + t * 1.3) * 1.6), sy = y - 10 - Math.round(ph * 12);
        art.dput(sx, sy, ph < 0.5 ? 0x9aa2b4 : 0x7a8296, 0.95 * (1 - ph));
      }
    });
  }
}

function drawLamp(art, st) {
  const { x, y } = L.lamp;
  const on = st.lamp ?? 1;
  // base
  art.rect(x - 6, y - 2, 12, 3, OUT); art.rect(x - 5, y - 2, 10, 2, 0x3a3a48); art.hline(x - 5, x + 4, y - 2, 0x5a5a6a);
  // arm
  art.thick(x, y - 2, x - 3, y - 20, 0.8, OUT); art.line(x, y - 2, x - 3, y - 20, 0x6a6a7a);
  art.thick(x - 3, y - 20, x - 12, y - 26, 0.8, OUT); art.line(x - 3, y - 20, x - 12, y - 26, 0x6a6a7a);
  // shade (cone pointing down-left)
  art.poly([[x - 18, y - 30], [x - 9, y - 30], [x - 6, y - 22], [x - 21, y - 22]], OUT);
  art.poly([[x - 17, y - 29], [x - 10, y - 29], [x - 7, y - 23], [x - 20, y - 23]], 0x2f6a5a);
  art.hline(x - 17, x - 10, y - 29, 0x4a8a78);
  // bulb glow at the shade opening
  if (on > 0.05) art.emit(() => { art.hline(x - 19, x - 8, y - 22, mix(0x5a4a20, 0xffe6a0, on)); art.hline(x - 17, x - 10, y - 21, mix(0x3a3010, 0xfff2c8, on)); });
  else art.hline(x - 19, x - 8, y - 22, 0x2a2a2a);
}

function drawStickyPile(art, st) {
  const { x, y } = L.stickies;
  const NOTE = [0xffe066, 0xff9ec8, 0x9ee8ff, 0xb8f28a];
  const amount = st.pile ?? 1;
  const layers = Math.round(11 * amount);
  let topY = y;
  for (let layer = 0; layer < layers; layer++) {
    const width = Math.max(1, 5 - Math.floor(layer / 2.5)); // notes per layer (pyramid)
    const py = y - 3 - layer * 2;
    for (let i = 0; i < width; i++) {
      const k = layer * 7 + i;
      const px = x - Math.round(width * 3.5) + i * 7 + Math.round((hash(k, 71) - 0.5) * 3);
      const c = NOTE[Math.floor(hash(k, 72) * 4)];
      const tilt = hash(k, 73) > 0.6 ? 1 : 0;
      art.rect(px - 1, py - 1 - tilt, 9, 4 + tilt, OUT);
      art.rect(px, py - tilt, 7, 2, c);
      art.put(px + 7 * (hash(k, 74) > 0.5 ? 1 : 0) - (hash(k, 74) > 0.5 ? 1 : 0), py - tilt, mix(c, 0xffffff, 0.4));
      art.hline(px, px + 6, py + 2 - tilt, mix(c, 0x000000, 0.3));
      art.put(px + 2, py - tilt, mix(c, 0x000000, 0.35)); art.put(px + 4, py + 1 - tilt, mix(c, 0x000000, 0.35));
    }
    topY = py - 2;
  }
  return { top: [x, topY] };
}

function drawKeyboard(art, st) {
  const k = L.keyboard;
  art.rect(k.x - 1, k.y - 1, k.w + 2, k.h + 2, OUT);
  art.rect(k.x, k.y, k.w, k.h, 0x3a3a48);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 15; c++) {
    const kx = k.x + 1 + c * 3, ky = k.y + 1 + r * 2;
    if (kx + 1 >= k.x + k.w - 1) continue;
    const pressed = st.keysPressed && hash(r, c, Math.floor((st.t ?? 0) * 20)) < st.keysPressed;
    art.put(kx, ky, pressed ? 0x9aa0b0 : 0xd8d8e0); art.put(kx + 1, ky, pressed ? 0x7a8090 : 0xb8b8c8);
  }
  // Enter key
  const e = L.enterKey;
  const down = st.enterDown ?? 0;
  art.rect(e.x, e.y + down, e.w, e.h, down ? 0x8ad8a0 : 0xe8e8f0);
  art.hline(e.x, e.x + e.w - 1, e.y + e.h + down - 1, 0x9a9aa8);
}

function drawDesk(art, st) {
  const d = L.desk;
  // top surface
  for (let y = d.backY; y < d.frontY; y++) {
    const u = (y - d.backY) / (d.frontY - d.backY);
    for (let x = d.x0; x <= d.x1; x++) {
      let c = u < 0.15 ? WOOD.shade : WOOD.base;
      if ((x * 3 + y * 7) % 23 === 0) c = WOOD.light;
      if (((x + (y >> 2) * 13) % 41) === 0) c = WOOD.shade;
      art.put(x, y, c);
    }
  }
  art.hline(d.x0, d.x1, d.backY, OUT);
  art.hline(d.x0, d.x1, d.frontY - 1, WOOD.hi);
  // front apron + drawers
  art.rect(d.x0, d.frontY, d.x1 - d.x0 + 1, 7, WOOD.shade);
  art.hline(d.x0, d.x1, d.frontY, WOOD.light);
  art.hline(d.x0, d.x1, d.frontY + 7, OUT);
  // drawer block (left)
  art.rect(d.x0 + 2, d.frontY + 7, 30, d.legY - d.frontY - 7, WOOD.base);
  art.frame(d.x0 + 2, d.frontY + 7, 30, d.legY - d.frontY - 7, OUT);
  art.hline(d.x0 + 3, d.x0 + 30, d.frontY + 14, OUT);
  art.rect(d.x0 + 14, d.frontY + 10, 6, 1, 0xd8c8a0); art.rect(d.x0 + 14, d.frontY + 17, 6, 1, 0xd8c8a0);
  // legs
  art.rect(d.x1 - 5, d.frontY + 7, 5, d.legY - d.frontY - 7 + 4, WOOD.dark);
  art.vline(d.x1 - 5, d.frontY + 7, d.legY + 3, OUT); art.vline(d.x1, d.frontY + 7, d.legY + 3, OUT);
  art.hline(d.x1 - 5, d.x1, d.legY + 4, OUT);
  // left & right outline of the top/front
  art.vline(d.x0 - 1, d.backY, d.frontY + 7, OUT); art.vline(d.x1 + 1, d.backY, d.frontY + 7, OUT);
  // shadow under the desk
  for (let x = d.x0 + 30; x < d.x1 - 6; x++) for (let y = d.frontY + 8; y < d.legY + 3; y++) art.put(x, y, mix(FLOOR.dark, 0x000000, 0.45));
}

/** Coffee (later pink, later electric) river on the floor: puddle at the mug → stream to the power strip. */
export function drawRiver(art, river, t = 0) {
  if (!river || !(river.len > 0)) return [];
  const P = L.river;
  const col = river.color ?? 0x5a3522;
  const hi = mix(col, 0xffffff, 0.35), dk = mix(col, 0x000000, 0.35);
  // polyline length
  const seg = [];
  let total = 0;
  for (let i = 0; i < P.length - 1; i++) { const d = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); seg.push(d); total += d; }
  const drawLen = total * clamp(river.len);
  const pts = [];
  let acc = 0;
  for (let i = 0; i < P.length - 1 && acc < drawLen; i++) {
    const n = Math.ceil(seg[i]);
    for (let k = 0; k <= n; k++) {
      const u = k / n, dist = acc + seg[i] * u;
      if (dist > drawLen) break;
      pts.push([P[i][0] + (P[i + 1][0] - P[i][0]) * u, P[i][1] + (P[i + 1][1] - P[i][1]) * u, dist / total]);
    }
    acc += seg[i];
  }
  const electric = river.electric ?? 0;
  const put = (x, y, c) => (electric > 0 ? art.both(() => art.put(x, y, c)) : art.put(x, y, c));
  // puddle around the mug
  const pr = 3 + 7 * clamp(river.len * 2.5);
  for (let y = -3; y <= 3; y++) for (let x = -Math.ceil(pr) - 2; x <= Math.ceil(pr) + 2; x++) {
    const dx = x / (pr + 1.5), dy = y / 2.6;
    if (dx * dx + dy * dy <= 1) put(P[0][0] + x, P[0][1] + y, col);
  }
  // stream: width tapers, gentle wobble
  for (const [x, y, u] of pts) {
    const wdt = 2.6 - u * 1.2 + Math.sin(u * 20 + t * 3) * 0.3;
    for (let j = -Math.ceil(wdt); j <= Math.ceil(wdt); j++) if (Math.abs(j) <= wdt) put(Math.round(x), Math.round(y + j * 0.6), col);
  }
  // highlights & ripples flowing along the stream; the highlights are a glossy reflection, a bit emissive
  const gloss = mix(hi, 0x000000, 0.55);
  for (const [x, y, u] of pts) {
    const ph = (((u * 9 - t * 2.2) % 1) + 1) % 1;
    if (ph < 0.12 || (ph > 0.5 && ph < 0.56)) {
      put(Math.round(x), Math.round(y - 1), hi);
      if (!(electric > 0)) art.addGlow(Math.round(x), Math.round(y - 1), gloss);
    } else if (ph > 0.8 && ph < 0.86) put(Math.round(x), Math.round(y + 1), dk);
  }
  if (electric > 0) {
    // electricity crawls along the river: bright cyan/white pulses (emissive)
    art.emit(() => {
      for (const [x, y, u] of pts) {
        const ph = (u * 5 - t * 6) % 1;
        if (ph < 0.08 && hash(Math.round(x), Math.floor(t * 30)) > 0.3) art.put(Math.round(x), Math.round(y + (hash(Math.round(x), 9, Math.floor(t * 30)) > 0.5 ? -1 : 0)), hash(Math.round(x), 7) > 0.5 ? 0xffffff : 0x9af0ff);
      }
    });
  }
  return pts;
}

/** Everything behind the hero. */
export function drawBack(art, st) {
  drawWall(art, st);
  drawWindow(art, st);
  const bulbs = drawGarland(art, st);
  drawFloor(art, st);
  drawStrip(art, st);
  return { bulbs };
}

/** Desk layer (drawn over the seated hero). */
export function drawDeskLayer(art, st) {
  drawDesk(art, st);
  const pile = drawStickyPile(art, st);
  drawKeyboard(art, st);
  drawMonitor(art, st);
  if (st.sticker !== false) art.tagged(TAG_MONITOR, () => drawDeadlineSticker(art, st));
  drawLamp(art, st);
  const mug = st.mug ?? { where: 'desk' };
  // mug.push 0..1: shoved toward the desk's front edge (y 136 → 141) by the code avalanche
  if (mug.where === 'desk') drawMug(art, L.mug.x, L.mug.y + Math.round(clamp(mug.push ?? 0) * 5), { ...mug, t: st.t, steam: mug.steam ?? true });
  return { pile };
}

/** Floor layer in front of the desk: river, the mug on the floor, the falling mug. */
export function drawFloorFront(art, st) {
  const pts = drawRiver(art, st.river, st.t ?? 0);
  const mug = st.mug ?? {};
  if (mug.where === 'falling') {
    // tumbles off the desk's front edge (y 141) down to the floor (y 171), turning over on the way
    const k = clamp(mug.k ?? 0);
    const y = L.mug.y + 5 + Math.round((L.mugFloor.y - L.mug.y - 5) * k * k);
    drawMug(art, L.mug.x, y, { tilt: k > 0.12 && k < 0.8 ? 1 : 0, fill: 0 });
  }
  if (mug.where === 'floor') drawMug(art, L.mugFloor.x, L.mugFloor.y, { fill: mug.fill ?? 0, liquid: mug.liquid ?? (st.river ? st.river.color : 0x5a3522), t: st.t, steam: mug.steam });
  return { riverPts: pts };
}

/** Standard light rig for the room at night. */
export function roomLights(st) {
  const lights = [];
  const sc = L.screen;
  const mon = st.monitorLight ?? 1;
  if (mon > 0) lights.push({ x: sc.x + sc.w / 2, y: sc.y + sc.h / 2 + 4, r: 95, ry: 80, color: st.monitorColor ?? 0x6ab8ff, i: 0.95 * mon, pow: 1.3, exclude: [TAG_MONITOR] });
  const lamp = st.lamp ?? 1;
  if (lamp > 0) lights.push({ x: L.lamp.x - 13, y: L.lamp.y - 20, r: 70, ry: 55, color: 0xffc070, i: 1.0 * lamp, dir: Math.PI / 2 + 0.25, spread: 0.85, soft: 0.5, pow: 1.2 });
  const win = st.windowLight ?? 1;
  const dawn = st.dawn ?? 0;
  if (win > 0) lights.push({ x: L.window.x + L.window.w / 2, y: L.window.y + L.window.h / 2, r: 110, ry: 100, color: mix(0x5a6ac8, 0xffb070, dawn), i: (0.35 + dawn * 1.1) * win, pow: 1.5 });
  if (st.bulbs && !st.garlandOff) {
    for (const b of st.bulbs) if (b.lv > 0.3) lights.push({ x: b.x, y: b.y + 1, r: 9, color: b.col, i: 0.5 * b.lv, pow: 1 });
  }
  return lights;
}
