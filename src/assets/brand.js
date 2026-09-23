// Brand assets (footage/brand) re-gridded into the art grid at load time:
//  - qr-code.png: 25×25 modules (8 px each, 2-module quiet zone) → boolean module matrix
//  - Eye_Final_Transparent.png: pixel-art logo, native pixel ≈ 11.5 px → 70×39 art-pixel grid,
//    split into parts (outline, 12 ring segments with their colors, pupil, ">_" glyph) for animation.

export const QR = { n: 0, m: null };           // m[j][i] = true for dark module
export const EYE = { w: 0, h: 0, cells: null, segColors: [], cx: 0, cy: 0 };

function sampleMedian(img, cx, cy, r = 2) {
  const { width, height, data } = img;
  const rs = [], gs = [], bs = [], as = [];
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    const xx = Math.max(0, Math.min(width - 1, x)), yy = Math.max(0, Math.min(height - 1, y));
    const o = (yy * width + xx) * 4;
    rs.push(data[o]); gs.push(data[o + 1]); bs.push(data[o + 2]); as.push(data[o + 3]);
  }
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  return [med(rs), med(gs), med(bs), med(as)];
}

function initQR(img) {
  // find the dark bounding box, then sample module centres
  const { width, height, data } = img;
  let x0 = width, x1 = -1, y0 = height, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const o = (y * width + x) * 4;
    const lum = data[o] + data[o + 1] + data[o + 2];
    if (data[o + 3] > 128 && lum < 384) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  const n = 25;
  const mod = (x1 - x0 + 1) / n;
  const m = [];
  for (let j = 0; j < n; j++) {
    const row = [];
    for (let i = 0; i < n; i++) {
      const [r, g, b] = sampleMedian(img, Math.floor(x0 + (i + 0.5) * mod), Math.floor(y0 + (j + 0.5) * mod), 1);
      row.push(r + g + b < 384);
    }
    m.push(row);
  }
  QR.n = n; QR.m = m;
}

// Ring segment colors sampled from the logo, clockwise from 12 o'clock.
export const RING = [0xff532b, 0xffab1f, 0xfbfb34, 0xa3ec31, 0x48be37, 0x43c1a1,
  0x2dbcf6, 0x4079c9, 0x3e3ca1, 0x863da3, 0xce46a0, 0xff1622];

function initEye(img) {
  const P = 11.5, OFF = 8.25;
  const nx = Math.floor((img.width - OFF) / P), ny = Math.floor((img.height - OFF) / P);
  const raw = [];
  let gx0 = nx, gx1 = -1, gy0 = ny, gy1 = -1;
  for (let j = 0; j < ny; j++) {
    const row = [];
    for (let i = 0; i < nx; i++) {
      const [r, g, b, a] = sampleMedian(img, Math.floor(OFF + (i + 0.5) * P), Math.floor(OFF + (j + 0.5) * P), 2);
      let k = '.';
      if (a >= 128) {
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const sat = mx ? (mx - mn) / mx : 0;
        if (r + g + b < 200) k = '#';
        else if (sat < 0.25 && mx > 200) k = 'w';
        else k = 'c';
      }
      row.push({ k, rgb: (r << 16) | (g << 8) | b });
      if (k !== '.') { gx0 = Math.min(gx0, i); gx1 = Math.max(gx1, i); gy0 = Math.min(gy0, j); gy1 = Math.max(gy1, j); }
    }
    raw.push(row);
  }
  const w = gx1 - gx0 + 1, h = gy1 - gy0 + 1;
  const cells = [];
  // ring centre = centroid of colored cells
  let sx = 0, sy = 0, sn = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = raw[gy0 + j][gx0 + i];
    if (c.k === 'c') { sx += i + 0.5; sy += j + 0.5; sn++; }
  }
  const cx = sx / sn, cy = sy / sn;
  let rMin = 1e9, rMax = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = raw[gy0 + j][gx0 + i];
    if (c.k === 'c') { const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cy); rMin = Math.min(rMin, d); rMax = Math.max(rMax, d); }
  }
  for (let j = 0; j < h; j++) {
    const row = [];
    for (let i = 0; i < w; i++) {
      const c = raw[gy0 + j][gx0 + i];
      const dx = i + 0.5 - cx, dy = j + 0.5 - cy, d = Math.hypot(dx, dy);
      // angle clockwise from 12 o'clock → segment 0..11
      let ang = Math.atan2(dx, -dy); if (ang < 0) ang += Math.PI * 2;
      const seg = Math.floor((ang / (Math.PI * 2)) * 12 + 0.5) % 12;
      let part = 'bg';
      if (c.k === '#') part = d < rMin - 0.5 ? 'pupil' : d <= rMax + 0.5 ? 'ringdot' : 'outline';
      else if (c.k === 'c') part = 'seg';
      else if (c.k === 'w') part = d < rMin ? 'glyph' : d <= rMax + 1 ? 'seg' : 'bg';
      else if (d < rMin - 0.5) part = 'glyph'; // transparent hole inside the pupil = part of ">_"
      row.push({ part, seg, rgb: c.rgb });
    }
    cells.push(row);
  }
  // ring dots (black squares inside segments) and pupil adjacency: keep as 'ringdot' only if within ring band
  EYE.w = w; EYE.h = h; EYE.cells = cells; EYE.cx = cx; EYE.cy = cy; EYE.rMin = rMin; EYE.rMax = rMax;
  EYE.segColors = RING;
}

export function initBrand({ qr, eye }) {
  initQR(qr);
  initEye(eye);
}
