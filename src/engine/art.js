// Art-space canvas: one cell = one art pixel. Two layers:
//   col — albedo (lit by scene lights),  emi — emissive (self-lit: screens, eyes, sparks).
// Everything is drawn in whole art pixels; there is no anti-aliasing anywhere in the art.
import { bayer } from './util.js';

export const MODE_ALBEDO = 0; // lit surface
export const MODE_EMIT = 1;   // pure light (screens, LEDs): albedo black + emissive color
export const MODE_BOTH = 2;   // surface color that also glows (albedo = emissive = c)

export class Art {
  constructor(w, h, bg = 0) {
    this.w = w; this.h = h;
    this.col = new Uint32Array(w * h).fill(bg);
    this.emi = new Uint32Array(w * h);
    this.tag = new Uint8Array(w * h);
    this.mode = MODE_ALBEDO;
    this.curTag = 0;
    this.ox = 0; this.oy = 0;
    this.clipR = null; // [x0,y0,x1,y1) in absolute coords
  }

  // ---- state helpers -------------------------------------------------------
  emit(fn) { const m = this.mode; this.mode = MODE_EMIT; fn(); this.mode = m; }
  both(fn) { const m = this.mode; this.mode = MODE_BOTH; fn(); this.mode = m; }
  tagged(t, fn) { const o = this.curTag; this.curTag = t; fn(); this.curTag = o; }
  at(x, y, fn) { const ox = this.ox, oy = this.oy; this.ox += Math.round(x); this.oy += Math.round(y); fn(); this.ox = ox; this.oy = oy; }
  clip(x0, y0, x1, y1, fn) {
    const o = this.clipR;
    const a = [x0 + this.ox, y0 + this.oy, x1 + this.ox, y1 + this.oy];
    this.clipR = o ? [Math.max(a[0], o[0]), Math.max(a[1], o[1]), Math.min(a[2], o[2]), Math.min(a[3], o[3])] : a;
    fn();
    this.clipR = o;
  }

  // ---- pixels --------------------------------------------------------------
  /** Put one pixel (relative coords). c < 0 → skip (transparent). */
  put(x, y, c) {
    if (c < 0 || c === undefined) return;
    x = Math.floor(x) + this.ox; y = Math.floor(y) + this.oy;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const cr = this.clipR;
    if (cr && (x < cr[0] || y < cr[1] || x >= cr[2] || y >= cr[3])) return;
    const i = y * this.w + x;
    if (this.mode === MODE_ALBEDO) { this.col[i] = c; this.emi[i] = 0; }
    else if (this.mode === MODE_EMIT) { this.col[i] = 0; this.emi[i] = c; }
    else { this.col[i] = c; this.emi[i] = c; }
    this.tag[i] = this.curTag;
  }
  /** Add glow on top of whatever is there (keeps albedo). */
  addGlow(x, y, c) {
    x = Math.floor(x) + this.ox; y = Math.floor(y) + this.oy;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    const e = this.emi[i];
    const r = Math.min(255, ((e >> 16) & 255) + ((c >> 16) & 255));
    const g = Math.min(255, ((e >> 8) & 255) + ((c >> 8) & 255));
    const b = Math.min(255, (e & 255) + (c & 255));
    this.emi[i] = (r << 16) | (g << 8) | b;
  }
  get(x, y) {
    x = Math.floor(x) + this.ox; y = Math.floor(y) + this.oy;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return this.col[y * this.w + x];
  }
  getTag(x, y) {
    x = Math.floor(x) + this.ox; y = Math.floor(y) + this.oy;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.tag[y * this.w + x];
  }
  /** Dithered put: draws only where alpha beats the Bayer threshold (pixel-art transparency). */
  dput(x, y, c, alpha) {
    if (alpha <= 0) return;
    const ax = Math.floor(x) + this.ox, ay = Math.floor(y) + this.oy;
    if (alpha >= 1 || alpha > bayer(ax, ay)) this.put(x, y, c);
  }

  // ---- shapes --------------------------------------------------------------
  rect(x, y, w, h, c) {
    x = Math.round(x); y = Math.round(y);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.put(x + i, y + j, c);
  }
  drect(x, y, w, h, c, alpha) {
    x = Math.round(x); y = Math.round(y);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.dput(x + i, y + j, c, alpha);
  }
  frame(x, y, w, h, c) {
    x = Math.round(x); y = Math.round(y);
    this.hline(x, x + w - 1, y, c); this.hline(x, x + w - 1, y + h - 1, c);
    this.vline(x, y, y + h - 1, c); this.vline(x + w - 1, y, y + h - 1, c);
  }
  hline(x0, x1, y, c) { if (x0 > x1) [x0, x1] = [x1, x0]; for (let x = Math.round(x0); x <= Math.round(x1); x++) this.put(x, y, c); }
  vline(x, y0, y1, c) { if (y0 > y1) [y0, y1] = [y1, y0]; for (let y = Math.round(y0); y <= Math.round(y1); y++) this.put(x, y, c); }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.put(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  /** Thick line: stamps a disc of radius r along a Bresenham path. */
  thick(x0, y0, x1, y1, r, c) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      this.disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, c);
    }
  }
  /** Filled disc; (cx,cy) is the geometric center in pixel units (use .5 for pixel centers). */
  disc(cx, cy, r, c) {
    const x0 = Math.floor(cx - r - 1), x1 = Math.ceil(cx + r + 1);
    const y0 = Math.floor(cy - r - 1), y1 = Math.ceil(cy + r + 1);
    const r2 = r * r;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) this.put(x, y, c);
    }
  }
  ellipse(cx, cy, rx, ry, c) {
    const x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx + 1);
    const y0 = Math.floor(cy - ry - 1), y1 = Math.ceil(cy + ry + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) this.put(x, y, c);
    }
  }
  /** Ring (outline of an ellipse), 1px, pixel-perfect-ish. */
  ellipseRing(cx, cy, rx, ry, c) {
    const x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx + 1);
    const y0 = Math.floor(cy - ry - 1), y1 = Math.ceil(cy + ry + 1);
    const inside = (x, y) => { const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; return dx * dx + dy * dy <= 1; };
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (inside(x, y) && (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1))) this.put(x, y, c);
    }
  }
  /** Polygon fill using pixel centers. pts = [[x,y],...] */
  poly(pts, c) {
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + (yc - ay) / (by - ay) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) this.put(x, y, c);
      }
    }
  }

  /**
   * Blit a character-grid sprite. rows: array of strings; pal: {char: color|-1}.
   * opts: flip (mirror X), emit: set of chars drawn as emissive, recolor(c,ch,x,y) → c
   */
  sprite(rows, pal, x, y, opts = {}) {
    x = Math.round(x); y = Math.round(y);
    const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
    const flip = !!opts.flip, emit = opts.emit, rec = opts.recolor, both = opts.both;
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '.' || ch === ' ') continue;
        let c = pal[ch];
        if (c === undefined || c < 0) continue;
        const px = flip ? x + (w - 1 - i) : x + i;
        if (rec) c = rec(c, ch, i, j);
        if (c < 0) continue;
        if (emit && emit.includes(ch)) { const m = this.mode; this.mode = MODE_EMIT; this.put(px, y + j, c); this.mode = m; }
        else if (both && both.includes(ch)) { const m = this.mode; this.mode = MODE_BOTH; this.put(px, y + j, c); this.mode = m; }
        else this.put(px, y + j, c);
      }
    }
  }

  /** Copy another Art onto this one (non-zero-tag or opaque mask: pixels where src.tag !== 255 are copied). */
  blit(src, x, y, mask) {
    for (let j = 0; j < src.h; j++) for (let i = 0; i < src.w; i++) {
      const k = j * src.w + i;
      if (mask && !mask[k]) continue;
      const tx = i + x + this.ox, ty = j + y + this.oy;
      if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue;
      const d = ty * this.w + tx;
      this.col[d] = src.col[k]; this.emi[d] = src.emi[k]; this.tag[d] = src.tag[k];
    }
  }
}
