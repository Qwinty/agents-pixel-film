// Shot 16 (bars 23–24, 41.250–45.000) — the ending card.
// A cream card (the logo's own white), static camera at zoom 2 (nn, 1 art px = 12 output px).
// b(23,1) eyeOpen: the logo-eye opens (lids part from a closed line).
// end.iris: 12 × 16ths — the ring segments light up clockwise from the top, each with a white blip.
// end.qrReveal: the QR (modules of 2×2 art px) develops in place over three beats: every module fades
//   in through two soft tones to ink, the finder squares first, then the data modules in ordered-dither
//   order all over the code at once — complete exactly on the bar-24 downbeat.
// end.cursorBlink: the "_" of the ">_" in the pupil blinks on every beat.
// end.caption: "t.me/p_by_p" types in under the eye.
// end.still (b(24,3)) → 45.0: nothing moves; the QR is complete, the cursor is frozen visible.
import { Art } from '../engine/art.js';
import { light } from '../engine/light.js';
import { mix } from '../engine/color.js';
import { clamp, ease, hash } from '../engine/util.js';
import { FONTS, drawText, textWidth } from '../engine/font.js';
import { EYE, QR, RING } from '../assets/brand.js';
import { W, H, CUES, BEAT, camClamp } from './common.js';

const E = CUES.end;
const BG = 0xf4f0e8, INK = 0x141218, UNLIT = 0xd9d4ca;
const CAM = { x: 160, y: 90, zoom: 2, nn: true };     // view: x 80..240, y 45..135
// layout (art px): eye 70×39 on the left, caption under it, QR (25 modules × 2 px) on the right
const EX = 93, EY = 60;                                // eye top-left
const QM = 2, QX = 177, QY = 65;                       // QR module size and top-left (quiet zone ≥ 8 px of BG)
const CAPTION = 't.me/p_by_p';

// ---- eye analysis (once): bracket vs eye outline, per-column lid extents, glyph parts ----------------
let EYE_INFO = null;
function eyeInfo() {
  if (EYE_INFO) return EYE_INFO;
  const { w, h, cells, cy } = EYE;
  const isOut = (i, j) => i >= 0 && j >= 0 && i < w && j < h && cells[j][i].part === 'outline';
  // the "{" bracket = the outline component that contains the top-left bracket cell
  const bracket = new Set();
  let seed = null;
  for (let i = 0; i < 12 && !seed; i++) if (isOut(i, 0)) seed = [i, 0];
  const stack = seed ? [seed] : [];
  while (stack.length) {
    const [i, j] = stack.pop();
    const k = j * w + i;
    if (bracket.has(k) || !isOut(i, j)) continue;
    bracket.add(k);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (di || dj) stack.push([i + di, j + dj]);
  }
  // per column: the eye's outermost outline rows above / below the centre line
  const top = new Array(w).fill(null), bot = new Array(w).fill(null);
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) {
    if (!isOut(i, j) || bracket.has(j * w + i)) continue;
    if (j < cy) top[i] = top[i] === null ? j : Math.min(top[i], j);
    else bot[i] = bot[i] === null ? j : Math.max(bot[i], j);
  }
  EYE_INFO = { bracket, top, bot };
  return EYE_INFO;
}

/** Colour of an eye cell at time t (null = background). */
function cellColor(c, i, j, t, info) {
  switch (c.part) {
    case 'outline': case 'ringdot': case 'pupil': return INK;
    case 'seg': {
      const tOn = E.iris[c.seg];
      if (t < tOn) return UNLIT;
      if (t < tOn + 0.05) return 0xffffff;                  // the blip
      return RING[c.seg];
    }
    case 'glyph': {
      const underscore = j >= 21;
      if (!underscore) return 0xffffff;
      // "_" steady until cursorBlink, then on for the first half of every beat; frozen on at `still`
      if (t < E.cursorBlink || t >= E.still) return 0xffffff;
      const ph = ((t - E.cursorBlink) / BEAT) % 1;
      return ph < 0.5 ? 0xffffff : INK;
    }
    default: return null;
  }
}

function drawEye(art, t) {
  const info = eyeInfo();
  const { w, h, cells, cy } = EYE;
  const k = t < E.eyeOpen + 0.06 ? 0 : ease.outCubic(clamp((t - E.eyeOpen - 0.06) / 0.24));
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = cells[j][i];
    const x = EX + i, y = EY + j;
    if (info.bracket.has(j * w + i)) { art.put(x, y, INK); continue; }
    const T = info.top[i], B = info.bot[i];
    if (k < 1 && T !== null && B !== null) {
      const yT = cy - k * (cy - T), yB = cy + k * (B + 1 - cy);
      if (j + 0.5 < yT || j + 0.5 > yB) continue;           // under the lids
    }
    const col = cellColor(c, i, j, t, info);
    if (col !== null) art.put(x, y, col);
  }
  // the lids' edges while opening (2 px thick, like the logo's outline)
  if (k < 1) {
    for (let i = 0; i < w; i++) {
      const T = info.top[i], B = info.bot[i];
      if (T === null || B === null) continue;
      const yT = Math.floor(cy - k * (cy - T)), yB = Math.ceil(cy + k * (B + 1 - cy)) - 1;
      art.put(EX + i, EY + yT, INK); art.put(EX + i, EY + yT + 1, INK);
      art.put(EX + i, EY + yB, INK); art.put(EX + i, EY + yB - 1, INK);
    }
  }
}

// ---- QR: develops in place — every module fades in through two soft tones ------------------------
const [QR0, QR1] = E.qrReveal;
const FADE = 0.2;                                          // one module's fade, fraction of the reveal
const TONES = [mix(BG, INK, 0.2), mix(BG, INK, 0.52), INK];
// 8×8 ordered-dither matrix: consecutive thresholds are spread evenly over the grid
const BAYER8 = (() => {
  let m = [[0]];
  while (m.length < 8) {
    const n = m.length;
    m = Array.from({ length: 2 * n }, (_, y) => Array.from({ length: 2 * n }, (_, x) =>
      4 * m[y % n][x % n] + [[0, 2], [3, 1]][(y / n) | 0][(x / n) | 0]));
  }
  return m;
})();
/** When module (i, j) starts to appear, as a fraction of the reveal in [0, 1 − FADE]. */
function moduleStart(i, j, n) {
  const finder = (i < 7 || i >= n - 7) && (j < 7 || j >= n - 7) && !(i >= n - 7 && j >= n - 7);
  if (finder) return 0.14 * hash(i, j, 5);                  // the three finder squares lead
  const d = BAYER8[j & 7][i & 7] / 64, drift = (i + j) / (2 * (n - 1));
  return 0.12 + (1 - FADE - 0.12) * (0.62 * d + 0.28 * drift + 0.1 * hash(i, j, 6));
}
function drawQR(art, t) {
  if (t < QR0) return;
  const n = QR.n, u = (t - QR0) / (QR1 - QR0);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (!QR.m[j][i]) continue;
    const v = u >= 1 ? 1 : (u - moduleStart(i, j, n)) / FADE;
    if (v <= 0) continue;
    art.rect(QX + i * QM, QY + j * QM, QM, QM, TONES[Math.min(2, Math.floor(v * 3))]);
  }
}

function drawCaption(art, t) {
  const n = Math.min(CAPTION.length, Math.floor((t - E.caption) / (0.4 / CAPTION.length)) + 1);
  if (t < E.caption) return;
  const s = CAPTION.slice(0, n);
  const cw = textWidth(FONTS.big, CAPTION);
  const x = EX + Math.round((EYE.w - cw) / 2), y = EY + EYE.h + 8;
  const wpx = drawText(art, FONTS.big, s, x, y, INK);
  // typing cursor while the caption types in
  if (n < CAPTION.length || t < E.caption + 0.45) art.rect(x + wpx + 2, y, 4, 7, mix(RING[6], INK, 0.2));
}

export function render(t, shot) {
  // after `still` the frame is literally the same picture
  const tt = Math.min(t, E.still);
  const art = new Art(W, H, BG);
  drawEye(art, tt);
  drawQR(art, tt);
  drawCaption(art, tt);
  const img = light(art, { ambient: [1, 1, 1], lights: [], glow: { strength: 0 } });
  return { img, w: W, h: H, cam: camClamp(CAM) };
}
