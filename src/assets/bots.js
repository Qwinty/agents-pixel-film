// The four agents, drawn procedurally in the same art grid as the hero (1 px = 1 art pixel,
// same near-black outline). Colors are segments of the logo-eye ring. Each bot has a clear
// silhouette: Coder = box with a screen face, Barista = ball with a kettle on its head,
// Tester = small beetle with a hammer, Designer = tall drop with a beret and a long brush.
// Anchor (x, y) = bottom centre (between the feet).
import { ramp, mix } from '../engine/color.js';
import { BOTS } from '../timeline.js';

export const OUT = 0x020302;
export const RAMPS = {
  coder: ramp(BOTS.coder.color),
  barista: ramp(BOTS.barista.color),
  tester: ramp(BOTS.tester.color),
  designer: ramp(BOTS.designer.color),
};
export const EYE_GLOW = { coder: 0x8ff6ff, barista: 0xfff1b0, tester: 0xd8ff9a, designer: 0xffc2ee };

// ---- shading helpers ---------------------------------------------------------------------
// Light comes from the upper-left. Returns ramp key by a quantized lambert term.
function shadeKey(nx, ny, nz) {
  const l = -0.55 * nx - 0.6 * ny + 0.58 * nz;
  if (l > 0.86) return 'hi';
  if (l > 0.55) return 'light';
  if (l > 0.12) return 'base';
  if (l > -0.35) return 'shade';
  return 'dark';
}

/** Outlined, shaded ellipse (sphere-ish). Returns nothing; draws into art. */
export function ball(art, cx, cy, rx, ry, R, opts = {}) {
  const x0 = Math.floor(cx - rx - 2), x1 = Math.ceil(cx + rx + 2);
  const y0 = Math.floor(cy - ry - 2), y1 = Math.ceil(cy + ry + 2);
  const inside = (x, y, grow = 0) => {
    const dx = (x + 0.5 - cx) / (rx + grow), dy = (y + 0.5 - cy) / (ry + grow);
    return dx * dx + dy * dy <= 1;
  };
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!inside(x, y, 1) || inside(x, y)) continue;
    // outline only where a 4-neighbour is inside
    if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) art.put(x, y, opts.outline ?? OUT);
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!inside(x, y)) continue;
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    art.put(x, y, opts.flat ? R.base : R[shadeKey(nx, ny, nz)]);
  }
}

/** Outlined box with a lit left edge, shaded right side face (3/4) and top face. */
export function box(art, x, y, w, h, R, opts = {}) {
  const side = opts.side ?? 2, top = opts.top ?? 2;
  art.rect(x - 1, y - 1, w + side + 2, h + 2, OUT);
  art.rect(x, y, w, h, R.base);
  art.rect(x, y, w, top, R.light);
  art.put(x, y, R.hi); art.put(x + 1, y, R.hi);
  art.vline(x, y + top, y + h - 2, R.light);
  art.rect(x + w, y, side, h, R.shade);
  art.rect(x + w, y, side, 1, R.base);
  art.hline(x, x + w - 1, y + h - 1, R.shade);
  art.put(x + w + side - 1, y + h - 1, R.dark);
}

/** Color flash: the silhouette lights up in the bot's own color (emissive), dithered by amount. */
function flashOverlay(art, x0, y0, x1, y1, color, amt, tag) {
  if (!(amt > 0)) return;
  const k = Math.min(1, amt);
  const light = mix(color, 0xffffff, 0.25);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (art.getTag(x, y) !== tag) continue;
    const c = art.get(x, y);
    if (c < 0) continue;
    const isOutline = c === OUT;
    art.emit(() => art.dput(x, y, isOutline ? mix(color, 0x000000, 0.35) : light, k * 1.25));
  }
}

export const TAGS = { coder: 11, barista: 12, tester: 13, designer: 14 };

// ---- eyes --------------------------------------------------------------------------------
/** Draw a pair of eyes. kind: normal|blink|happy|dizzy|surprise|closed|angry|panic ; glow → emissive */
function eyes(art, lx, rx, y, kind, col, s = {}) {
  const put = (x, yy, c) => (s.glow ? art.emit(() => art.put(x, yy, c)) : art.put(x, yy, c));
  const lk = s.lookX || 0, ly = s.lookY || 0;
  for (const ex0 of [lx, rx]) {
    const ex = ex0 + lk, ey = y + ly;
    switch (kind) {
      case 'blink': case 'closed': put(ex, ey + 1, col); put(ex + 1, ey + 1, col); break;
      case 'happy': put(ex, ey + 1, col); put(ex + 1, ey, col); put(ex + 2 > ex0 + 2 ? ex + 1 : ex + 1, ey, col); put(ex + 2, ey + 1, col); break;
      case 'dizzy': put(ex, ey - 1, col); put(ex + 1, ey, col); put(ex, ey + 1, col); put(ex - 1 + 2, ey - 1 + 0, col); put(ex + 2 - 1, ey + 1, col); break;
      case 'surprise': for (let j = -1; j < 2; j++) for (let i = 0; i < 2; i++) put(ex + i, ey + j, col); break;
      case 'angry': put(ex, ey, col); put(ex + 1, ey + 1, col); break;
      default: put(ex, ey, col); put(ex + 1, ey, col); put(ex, ey + 1, col); put(ex + 1, ey + 1, col);
    }
  }
}

// ---- CODER: blue box, screen face, antenna -------------------------------------------------
export function drawCoder(art, x, y, s = {}) {
  const R = RAMPS.coder, t = s.t ?? 0;
  const sq = s.squash ?? 0; // + squash, - stretch
  const W = 15, H = Math.round(14 * (1 - sq * 0.25));
  const bx = Math.round(x - 8), by = Math.round(y - 3 - H);
  const res = {};
  art.tagged(TAGS.coder, () => {
    // legs + feet
    if (!s.noLegs) {
      const step = s.walk ? (Math.floor(t * 8) % 2) : 0;
      for (const [lx, up] of [[bx + 3, step], [bx + 11, 1 - step]]) {
        art.rect(lx - 1, y - 3 - (s.walk ? up : 0), 3, 3, OUT);
        art.put(lx, y - 3 - (s.walk ? up : 0), R.dark);
        art.put(lx, y - 2 - (s.walk ? up : 0), R.shade);
        art.rect(lx - 2, y - 1 - (s.walk ? up : 0), 5, 1, OUT);
      }
    }
    if (s.back) {
      box(art, bx, by, W, H, R, { side: 2 });
      // vent grille on the back
      for (let k = 0; k < 4; k++) art.hline(bx + 4, bx + 10, by + 4 + k * 2, R.shade);
    } else {
      box(art, bx, by, W, H, R, { side: 2 });
      // screen bezel + screen
      const sx = bx + 2, sy = by + 3, sw = W - 4, sh = Math.max(5, H - 7);
      art.rect(sx - 1, sy - 1, sw + 2, sh + 2, OUT);
      art.emit(() => art.rect(sx, sy, sw, sh, s.screenBg ?? 0x0b2233));
      const ec = s.flash > 0.5 ? 0xffffff : EYE_GLOW.coder;
      if (s.face === 'code') {
        // tiny scrolling code lines instead of eyes
        art.emit(() => {
          for (let k = 0; k < sh; k++) {
            const len = 2 + ((k * 7 + Math.floor(t * 30)) % (sw - 3));
            const c = (k + Math.floor(t * 30)) % 3 === 0 ? 0x7dff9a : 0x8ff6ff;
            if (k % 2 === 0) art.hline(sx + 1, sx + len, sy + k, c);
          }
        });
      } else {
        art.emit(() => eyes(art, sx + 2, sx + sw - 4, sy + Math.floor(sh / 2) - 1, s.eyes || 'normal', ec, { ...s, glow: false }));
        if (s.mouth) art.emit(() => art.hline(sx + 4, sx + sw - 5, sy + sh - 1, ec));
      }
      // LEDs on the chin
      art.put(bx + 3, by + H - 3, 0x9df08a);
      art.put(bx + 5, by + H - 3, R.dark);
      art.put(bx + 7, by + H - 3, R.dark);
    }
    // antenna
    const ax = bx + 7, ay = by - 1;
    const wob = Math.round(Math.sin(t * 9) * (s.antennaWobble ?? 0.4));
    art.vline(ax, ay - 4, ay - 1, OUT);
    art.put(ax + wob, ay - 5, OUT); art.put(ax + wob - 1, ay - 6, OUT); art.put(ax + wob + 1, ay - 6, OUT); art.put(ax + wob, ay - 7, OUT);
    const blink = s.antenna ?? (Math.floor(t * 2.5) % 2 === 0);
    art.emit(() => art.put(ax + wob, ay - 6, blink ? 0xff5a5a : 0x7a2a2a));
    // stubby arms
    const armY = by + H - 5;
    const typing = s.pose === 'type';
    const salute = s.pose === 'salute';
    const phase = typing ? Math.floor(t * 16) % 2 : 0;
    // left arm
    if (salute) {
      art.rect(bx - 3, by - 1, 3, 6, OUT); art.rect(bx - 2, by, 1, 4, R.light);
      art.rect(bx - 4, by - 3, 4, 3, OUT); art.rect(bx - 3, by - 2, 2, 1, R.hi);
    } else {
      const ly = armY + (typing ? (phase ? -2 : 0) : 0);
      art.rect(bx - 3, ly - 1, 3, 5, OUT); art.rect(bx - 2, ly, 1, 3, R.light);
    }
    const ry = armY + (typing ? (phase ? 0 : -2) : 0);
    art.rect(bx + W + 2, ry - 1, 3, 5, OUT); art.rect(bx + W + 3, ry, 1, 3, R.shade);
    res.hands = [[bx - 2, armY + 3], [bx + W + 3, ry + 3]];
  });
  flashOverlay(art, bx - 5, by - 9, bx + W + 6, y, BOTS.coder.color, s.flash, TAGS.coder);
  res.eyes = [bx + 7, by + 6]; res.top = [bx + 7, by - 8]; res.center = [bx + 8, by + H / 2];
  return res;
}

// ---- BARISTA: orange ball + kettle on its head ---------------------------------------------
const KETTLE = { base: 0xe9e1cf, light: 0xfbf7ea, hi: 0xffffff, shade: 0xb9ae9a, dark: 0x7d735f };
export function drawBarista(art, x, y, s = {}) {
  const R = RAMPS.barista, t = s.t ?? 0;
  const sq = s.squash ?? 0;
  const rx = 8.5 * (1 + sq * 0.18), ry = 8 * (1 - sq * 0.22);
  const cx = x, cy = y - 3 - ry;
  const res = {};
  art.tagged(TAGS.barista, () => {
    // feet
    if (!s.noLegs) {
      const step = s.walk ? Math.floor(t * 8) % 2 : 0;
      art.rect(Math.round(cx - 6), y - 3 - (s.walk ? step : 0), 4, 3, OUT); art.rect(Math.round(cx - 5), y - 3 - (s.walk ? step : 0), 2, 1, R.dark);
      art.rect(Math.round(cx + 2), y - 3 - (s.walk ? 1 - step : 0), 4, 3, OUT); art.rect(Math.round(cx + 3), y - 3 - (s.walk ? 1 - step : 0), 2, 1, R.dark);
    }
    ball(art, cx, cy, rx, ry, R);
    // eyes / face
    if (!s.back) {
      const ex = Math.round(cx - 5), ey = Math.round(cy - 1);
      const ec = s.glow ? EYE_GLOW.barista : 0xfff6d8;
      const kind = s.eyes || 'normal';
      if (s.glow) art.emit(() => eyes(art, ex, ex + 7, ey, kind, s.flash > 0.5 ? 0xffffff : ec, s));
      else {
        // round cartoon eyes: 4x4 white with a 2x2 pupil
        if (kind === 'normal' || kind === 'surprise') {
          const lk = s.lookX > 0 ? 1 : s.lookX < 0 ? -1 : 0;
          for (const e of [ex - 1, ex + 6]) {
            art.hline(e + 1, e + 2, ey - 2, 0xfff6d8); art.hline(e, e + 3, ey - 1, 0xfff6d8);
            art.hline(e, e + 3, ey, 0xfff6d8); art.hline(e + 1, e + 2, ey + 1, 0xfff6d8);
            if (kind === 'surprise') { art.put(e + 1, ey - 1, OUT); art.put(e + 2, ey, OUT); art.put(e + 1, ey, OUT); art.put(e + 2, ey - 1, OUT); }
            else art.rect(e + 1 + lk, ey - 1, 2, 2, OUT);
          }
        } else eyes(art, ex, ex + 7, ey, kind, OUT, s);
      }
      // cheeks
      art.put(Math.round(cx - 6), Math.round(cy + 2), R.hi);
      art.put(Math.round(cx + 5), Math.round(cy + 2), R.light);
      if (s.mouth === 'o') { art.rect(Math.round(cx - 1), Math.round(cy + 3), 2, 2, OUT); }
      else if (s.mouth !== 'none') { art.hline(Math.round(cx - 1), Math.round(cx + 1), Math.round(cy + 3), R.dark); }
    }
    // kettle on the head, can tilt (pour): tilt 0..1 → spout lowers to the right
    const tilt = s.tilt ?? 0;
    const kx = Math.round(cx - 5), ky = Math.round(cy - ry - 7 + tilt * 2);
    const K = KETTLE;
    // body (a squat drum shape); tilt skews the rows
    const rows = 7;
    for (let j = 0; j < rows; j++) {
      const sk = Math.round((rows - 1 - j) * tilt * 0.9);
      const wv = j === 0 || j === rows - 1 ? 8 : 10;
      const off = j === 0 || j === rows - 1 ? 1 : 0;
      art.hline(kx + off + sk - 1, kx + off + sk + wv, ky + j, OUT);
    }
    for (let j = 1; j < rows - 1; j++) {
      const sk = Math.round((rows - 1 - j) * tilt * 0.9);
      const wv = j === 1 || j === rows - 2 ? 8 : 10;
      const off = j === 1 || j === rows - 2 ? 1 : 0;
      for (let i = 0; i < wv; i++) {
        const u = i / (wv - 1);
        const c = u < 0.2 ? K.light : u > 0.78 ? K.shade : K.base;
        art.put(kx + off + sk + i, ky + j, j === 1 && i === 1 ? K.hi : c);
      }
      // orange band
      if (j === 3) for (let i = 0; i < wv; i++) art.put(kx + off + sk + i, ky + j, i < 2 ? R.light : i > wv - 3 ? R.shade : R.base);
    }
    // lid + knob
    const lsk = Math.round(rows * tilt * 0.9);
    art.hline(kx + 2 + lsk, kx + 7 + lsk, ky - 1, OUT);
    art.put(kx + 4 + lsk, ky - 2, OUT); art.put(kx + 5 + lsk, ky - 2, OUT);
    art.put(kx + 4 + lsk, ky - 3, OUT); art.put(kx + 5 + lsk, ky - 3, R.base);
    // spout on the right: rises when upright, points down-right when tilted
    const spx = kx + 10 + Math.round(3 * tilt * 0.9);
    const spy = ky + 4;
    let tipx, tipy;
    if (tilt < 0.5) {
      art.put(spx, spy, OUT); art.put(spx + 1, spy - 1, OUT); art.put(spx + 2, spy - 2, OUT); art.put(spx + 2, spy - 3, OUT);
      art.put(spx, spy - 1, K.base); art.put(spx + 1, spy - 2, K.base);
      art.put(spx + 1, spy, OUT); art.put(spx + 2, spy - 1, OUT); art.put(spx + 3, spy - 2, OUT); art.put(spx + 3, spy - 3, OUT);
      tipx = spx + 3; tipy = spy - 3;
    } else {
      art.put(spx, spy, OUT); art.put(spx + 1, spy + 1, OUT); art.put(spx + 2, spy + 2, OUT);
      art.put(spx + 1, spy, K.base); art.put(spx + 2, spy + 1, K.base);
      art.put(spx + 2, spy, OUT); art.put(spx + 3, spy + 1, OUT); art.put(spx + 3, spy + 2, OUT);
      tipx = spx + 3; tipy = spy + 3;
    }
    // handle on the left
    art.put(kx - 2, ky + 2, OUT); art.put(kx - 3, ky + 3, OUT); art.put(kx - 3, ky + 4, OUT); art.put(kx - 2, ky + 5, OUT);
    res.spout = [tipx, tipy];
    // steam from the spout
    if (s.steam) {
      art.emit(() => {
        for (let k = 0; k < 3; k++) {
          const ph = (t * 1.3 + k / 3) % 1;
          const sx = tipx + Math.round(Math.sin(ph * 6 + k) * 1.2), sy = tipy - 1 - Math.round(ph * 6);
          art.dput(sx, sy, 0x6a6f80, 0.55 * (1 - ph));
        }
      });
    }
    // little arms
    if (s.pose === 'salute') {
      art.rect(Math.round(cx - rx - 2), Math.round(cy - 8), 3, 7, OUT); art.put(Math.round(cx - rx - 1), Math.round(cy - 6), R.light);
    } else if (!s.noArms) {
      const ay = Math.round(cy + 1 + (s.armsUp ? -5 : 0));
      art.rect(Math.round(cx - rx - 3), ay, 3, 3, OUT); art.put(Math.round(cx - rx - 2), ay + 1, R.light);
      art.rect(Math.round(cx + rx), ay, 3, 3, OUT); art.put(Math.round(cx + rx + 1), ay + 1, R.shade);
      res.hands = [[Math.round(cx - rx - 2), ay + 1], [Math.round(cx + rx + 1), ay + 1]];
    }
  });
  flashOverlay(art, Math.round(cx - 13), Math.round(cy - ry - 12), Math.round(cx + 14), y, BOTS.barista.color, s.flash, TAGS.barista);
  res.eyes = [Math.round(cx), Math.round(cy - 1)]; res.top = [Math.round(cx), Math.round(cy - ry - 11)]; res.center = [cx, cy];
  return res;
}

// ---- TESTER: little beetle with a hammer ---------------------------------------------------
const BUG_HEAD = { hi: 0x4a5a44, light: 0x34412f, base: 0x252e22, shade: 0x181e16, dark: 0x0e120d };
export function drawTester(art, x, y, s = {}) {
  const R = RAMPS.tester, t = s.t ?? 0;
  const sq = s.squash ?? 0;
  const res = {};
  const cx = x, shellY = y - 8 + Math.round(sq * 1.5);
  art.tagged(TAGS.tester, () => {
    // legs (3 per side), animated when walking
    if (!s.noLegs) {
      const ph = s.walk ? Math.floor(t * 12) % 2 : 0;
      for (let k = 0; k < 3; k++) {
        const up = s.walk ? (k + ph) % 2 : 0;
        const dn = s.walk ? 1 - up : 0;
        const lxL = Math.round(cx - 3 - k * 2.5), lxR = Math.round(cx + 2 + k * 2.5);
        art.put(lxL, y - 3 - up, OUT); art.put(lxL - 1, y - 2 - up, OUT); art.put(lxL - 1, y - 1 - up, OUT);
        art.put(lxR, y - 3 - dn, OUT); art.put(lxR + 1, y - 2 - dn, OUT); art.put(lxR + 1, y - 1 - dn, OUT);
      }
    }
    // shell dome with a split line and spots (ladybug-like beetle)
    ball(art, cx, shellY, 7.5, 6, R);
    art.vline(Math.round(cx), Math.round(shellY - 6), Math.round(shellY + 5), OUT);
    for (const [dx, dy] of [[-4, -2], [-3, 2], [3, -3], [4, 1], [-6, 0], [6, -1]]) art.put(Math.round(cx + dx), Math.round(shellY + dy), R.dark);
    art.put(Math.round(cx - 4), Math.round(shellY - 4), R.hi);
    if (!s.back) {
      // small dark head at the front with big white eyes
      ball(art, cx, shellY + 3, 4.5, 3, BUG_HEAD);
      const ey = Math.round(shellY + 2);
      const kind = s.eyes || 'normal';
      if (s.glow) art.emit(() => eyes(art, Math.round(cx - 3), Math.round(cx + 1), ey, kind, s.flash > 0.5 ? 0xffffff : EYE_GLOW.tester, s));
      else if (kind === 'normal' || kind === 'surprise') {
        const lk = s.lookX > 0 ? 1 : 0;
        for (const e of [Math.round(cx - 3), Math.round(cx + 1)]) {
          art.rect(e, ey, 2, 2, 0xf4ffe8);
          art.put(e + lk, ey + 1, OUT);
        }
      } else eyes(art, Math.round(cx - 3), Math.round(cx + 1), ey, kind, 0xd8ff9a, s);
    }
    // antennae curling up in front of the shell
    const wob = Math.round(Math.sin(t * 7) * 0.6);
    const ay = Math.round(shellY - 6);
    art.put(Math.round(cx - 2), ay, OUT); art.put(Math.round(cx - 3), ay - 1, OUT); art.put(Math.round(cx - 4) + wob, ay - 2, OUT); art.put(Math.round(cx - 5) + wob, ay - 3, OUT);
    art.put(Math.round(cx + 2), ay, OUT); art.put(Math.round(cx + 3), ay - 1, OUT); art.put(Math.round(cx + 4) + wob, ay - 2, OUT); art.put(Math.round(cx + 5) + wob, ay - 3, OUT);
    art.emit(() => { art.put(Math.round(cx - 5) + wob, ay - 4, 0xd8ff9a); art.put(Math.round(cx + 5) + wob, ay - 4, 0xd8ff9a); });
    // hammer in the right front leg: angle ha (rad): 0 = up, + = swung down to the right
    if (!s.noHammer) {
      const ha = s.hammer ?? (Math.sin(t * 3) * 0.1 - 0.2);
      const hx0 = Math.round(cx + 8), hy0 = Math.round(shellY + 1);
      art.line(Math.round(cx + 5), Math.round(shellY + 3), hx0, hy0, OUT);
      art.rect(hx0 - 1, hy0 - 1, 3, 3, OUT); art.put(hx0, hy0, R.light);
      const L = 8;
      const tx = hx0 + Math.sin(ha) * L, ty = hy0 - Math.cos(ha) * L;
      art.thick(hx0, hy0, tx, ty, 0.9, OUT);
      art.line(hx0, hy0, tx, ty, 0xa06a3a);
      const px = Math.cos(ha), py = Math.sin(ha);
      const h1x = tx - px * 3, h1y = ty - py * 3, h2x = tx + px * 3, h2y = ty + py * 3;
      art.thick(h1x, h1y, h2x, h2y, 1.9, OUT);
      art.thick(h1x, h1y, h2x, h2y, 1.0, 0x9aa3ad);
      art.put(Math.round(h1x), Math.round(h1y), 0xd9e2ea);
      res.hammerHead = [Math.round(h2x), Math.round(h2y)];
      res.hammerTip = [Math.round(tx), Math.round(ty)];
    }
    if (s.pose === 'salute') {
      art.line(Math.round(cx - 5), Math.round(shellY + 3), Math.round(cx - 9), Math.round(shellY - 4), OUT);
      art.rect(Math.round(cx - 10), Math.round(shellY - 6), 2, 2, OUT);
    }
  });
  flashOverlay(art, Math.round(cx - 12), Math.round(shellY - 20), Math.round(cx + 18), y, BOTS.tester.color, s.flash, TAGS.tester);
  res.eyes = [Math.round(cx), Math.round(shellY + 2)]; res.top = [Math.round(cx), Math.round(shellY - 10)]; res.center = [cx, shellY];
  return res;
}

// ---- DESIGNER: tall magenta drop with a beret and a long brush -----------------------------
export function drawDesigner(art, x, y, s = {}) {
  const R = RAMPS.designer, t = s.t ?? 0;
  const sq = s.squash ?? 0;
  const res = {};
  const bodyH = Math.round(17 * (1 - sq * 0.25));
  const cx = x, bottom = y - 3;
  const top = bottom - bodyH;
  art.tagged(TAGS.designer, () => {
    if (!s.noLegs) {
      const step = s.walk ? Math.floor(t * 8) % 2 : 0;
      art.rect(Math.round(cx - 4), bottom - (s.walk ? step : 0), 3, 3, OUT); art.put(Math.round(cx - 3), bottom - (s.walk ? step : 0), R.dark);
      art.rect(Math.round(cx + 1), bottom - (s.walk ? 1 - step : 0), 3, 3, OUT); art.put(Math.round(cx + 2), bottom - (s.walk ? 1 - step : 0), R.dark);
      art.hline(Math.round(cx - 5), Math.round(cx - 2), y - 1, OUT); art.hline(Math.round(cx + 1), Math.round(cx + 4), y - 1, OUT);
    }
    // drop body: width grows from top (narrow head) to bottom (round belly)
    const halfW = (j) => {
      const u = j / bodyH; // 0 top .. 1 bottom
      if (u < 0.12) return 1.5 + u * 18;
      return 3.6 + Math.sin(Math.min(1, (u - 0.12) / 0.8) * Math.PI * 0.62) * 3.4 - (u > 0.9 ? (u - 0.9) * 22 : 0);
    };
    for (let j = -1; j <= bodyH; j++) {
      const hw = Math.max(1, halfW(Math.max(0, Math.min(bodyH - 1, j))) + (j < 0 || j === bodyH ? -0.6 : 1));
      art.hline(Math.round(cx - hw), Math.round(cx + hw - 1), top + j, OUT);
    }
    for (let j = 0; j < bodyH; j++) {
      const hw = halfW(j);
      const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw - 1);
      for (let xx = x0; xx <= x1; xx++) {
        const nx = (xx + 0.5 - cx) / Math.max(1, hw), ny = (j / bodyH - 0.55) * 1.2;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx * 0.8));
        let k = shadeKey(nx, ny * 0.6, nz);
        if (j > bodyH - 3) k = k === 'hi' ? 'light' : 'shade';
        art.put(xx, top + j, R[k]);
      }
    }
    // beret (dark plum), tilted
    const by = top - 3;
    const B1 = 0x3b1747, B2 = 0x5a2470;
    art.hline(Math.round(cx - 5), Math.round(cx + 4), by + 2, OUT);
    art.hline(Math.round(cx - 6), Math.round(cx + 5), by + 1, OUT);
    art.hline(Math.round(cx - 5), Math.round(cx + 4), by, OUT);
    art.hline(Math.round(cx - 4), Math.round(cx + 3), by - 1, OUT);
    art.hline(Math.round(cx - 5), Math.round(cx + 4), by + 1, B2);
    art.hline(Math.round(cx - 4), Math.round(cx + 3), by, B2);
    art.put(Math.round(cx - 3), by, 0x7a3a92);
    art.hline(Math.round(cx - 4), Math.round(cx + 4), by + 2, B1);
    art.put(Math.round(cx + 1), by - 2, OUT); art.put(Math.round(cx + 2), by - 3, OUT);
    // face
    if (!s.back) {
      const ey = top + 5;
      const kind = s.eyes || 'normal';
      if (s.glow) art.emit(() => eyes(art, Math.round(cx - 3), Math.round(cx + 1), ey, kind, s.flash > 0.5 ? 0xffffff : EYE_GLOW.designer, s));
      else if (kind === 'normal' || kind === 'surprise') {
        for (const e of [Math.round(cx - 3), Math.round(cx + 1)]) {
          art.rect(e, ey, 2, 2, OUT);
          art.put(e + (s.lookX > 0 ? 1 : 0), ey, 0xffffff);
        }
      } else eyes(art, Math.round(cx - 3), Math.round(cx + 1), ey, kind, OUT, s);
      // blush + tiny smile
      art.put(Math.round(cx - 4), ey + 3, R.hi); art.put(Math.round(cx + 3), ey + 3, R.light);
      if (s.mouth !== 'none') art.hline(Math.round(cx - 1), Math.round(cx), ey + 4, R.dark);
    }
    // brush: from the hand at the right side, angle ba (0 = straight up, + = tilt right)
    if (!s.noBrush) {
      const ba = s.brush ?? (0.45 + Math.sin(t * 2.2) * 0.08);
      const hx = Math.round(cx + 5), hy = top + 11;
      art.rect(hx - 1, hy - 1, 3, 3, OUT); art.put(hx, hy, R.light);
      const L = s.brushLen ?? 13;
      const tx = hx + Math.sin(ba) * L, ty = hy - Math.cos(ba) * L;
      const bx0 = hx - Math.sin(ba) * 3, by0 = hy + Math.cos(ba) * 3;
      art.thick(bx0, by0, tx, ty, 0.9, OUT);
      art.line(bx0, by0, tx, ty, 0xd8b27a);
      // ferrule + bristles in paint color
      const pc = s.paint ?? 0xff7ad0;
      const fx = hx + Math.sin(ba) * (L - 2), fy = hy - Math.cos(ba) * (L - 2);
      art.disc(fx + 0.5, fy + 0.5, 1.4, 0x9aa3ad);
      art.disc(tx + Math.sin(ba) * 1.5 + 0.5, ty - Math.cos(ba) * 1.5 + 0.5, 2.3, OUT);
      art.disc(tx + Math.sin(ba) * 1.5 + 0.5, ty - Math.cos(ba) * 1.5 + 0.5, 1.5, pc);
      res.brushTip = [Math.round(tx + Math.sin(ba) * 3), Math.round(ty - Math.cos(ba) * 3)];
    }
    if (s.pose === 'salute') {
      art.rect(Math.round(cx - 7), top + 1, 2, 6, OUT); art.put(Math.round(cx - 6), top + 2, R.light);
    }
  });
  flashOverlay(art, Math.round(cx - 10), top - 8, Math.round(cx + 22), y, BOTS.designer.color, s.flash, TAGS.designer);
  res.eyes = [Math.round(cx), top + 5]; res.top = [Math.round(cx), top - 6]; res.center = [cx, top + bodyH / 2];
  return res;
}

export const DRAW = { coder: drawCoder, barista: drawBarista, tester: drawTester, designer: drawDesigner };
export const drawBot = (name, art, x, y, s) => DRAW[name](art, x, y, s);
