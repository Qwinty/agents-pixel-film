// Camera: maps the lit art buffer onto the output raster.
//  - zoom === 1: pure nearest neighbour at a fractional camera offset → every art pixel is exactly
//    6×6 output pixels, the whole frame slides smoothly in 1-output-pixel steps (sub-art-pixel pan).
//  - zoom !== 1: 4×4 supersampling per output pixel (each subsample = nearest art pixel), averaged.
//    Applied to the whole frame at once. Implemented separably (exact same result as 16 taps).

export const BASE_W = 320, BASE_H = 180;

/**
 * img: Uint8Array RGB (aw×ah), cam: { x, y, zoom } — (x,y) = art coords of the view center.
 * outW/outH: output size (1920×1080 for the film). Returns Uint8Array RGB outW×outH.
 */
export function shoot(img, aw, ah, cam, outW = 1920, outH = 1080, out = null) {
  const zoom = cam.zoom ?? 1;
  const s = (outW / BASE_W) * zoom;           // output px per art px
  const cx = cam.x ?? aw / 2, cy = cam.y ?? ah / 2;
  out = out || new Uint8Array(outW * outH * 3);
  const integerScale = Math.abs(s - Math.round(s)) < 1e-9;
  const useSS = !(Math.abs(zoom - 1) < 1e-9) && !(cam.nn && integerScale);

  if (!useSS) {
    const colIdx = new Int32Array(outW);
    for (let X = 0; X < outW; X++) {
      let ax = Math.floor(cx + (X + 0.5 - outW / 2) / s);
      colIdx[X] = ax < 0 ? 0 : ax >= aw ? aw - 1 : ax;
    }
    let prevRow = -1, prevOff = 0;
    for (let Y = 0; Y < outH; Y++) {
      let ay = Math.floor(cy + (Y + 0.5 - outH / 2) / s);
      ay = ay < 0 ? 0 : ay >= ah ? ah - 1 : ay;
      const o = Y * outW * 3;
      if (ay === prevRow) { out.copyWithin(o, prevOff, prevOff + outW * 3); continue; }
      const base = ay * aw * 3;
      for (let X = 0; X < outW; X++) {
        const k = base + colIdx[X] * 3, d = o + X * 3;
        out[d] = img[k]; out[d + 1] = img[k + 1]; out[d + 2] = img[k + 2];
      }
      prevRow = ay; prevOff = o;
    }
    return out;
  }

  // 4×4 supersampling, separable: horizontal sums per needed art row, then vertical sums.
  const SS = 4;
  const colIdx = new Int32Array(outW * SS);
  for (let X = 0; X < outW; X++) for (let i = 0; i < SS; i++) {
    let ax = Math.floor(cx + (X + (i + 0.5) / SS - outW / 2) / s);
    colIdx[X * SS + i] = (ax < 0 ? 0 : ax >= aw ? aw - 1 : ax) * 3;
  }
  const rowCache = new Map();
  const hrow = (ay) => {
    let r = rowCache.get(ay);
    if (r) return r;
    r = new Uint16Array(outW * 3);
    const base = ay * aw * 3;
    for (let X = 0; X < outW; X++) {
      let sr = 0, sg = 0, sb = 0;
      for (let i = 0; i < SS; i++) {
        const k = base + colIdx[X * SS + i];
        sr += img[k]; sg += img[k + 1]; sb += img[k + 2];
      }
      r[X * 3] = sr; r[X * 3 + 1] = sg; r[X * 3 + 2] = sb;
    }
    rowCache.set(ay, r);
    return r;
  };
  const rows = new Array(SS);
  for (let Y = 0; Y < outH; Y++) {
    for (let j = 0; j < SS; j++) {
      let ay = Math.floor(cy + (Y + (j + 0.5) / SS - outH / 2) / s);
      ay = ay < 0 ? 0 : ay >= ah ? ah - 1 : ay;
      rows[j] = hrow(ay);
    }
    const o = Y * outW * 3;
    const r0 = rows[0], r1 = rows[1], r2 = rows[2], r3 = rows[3];
    if (r0 === r3) {
      for (let k = 0; k < outW * 3; k++) out[o + k] = (r0[k] + 2) >> 2;
    } else {
      for (let k = 0; k < outW * 3; k++) out[o + k] = (r0[k] + r1[k] + r2[k] + r3[k] + 8) >> 4;
    }
  }
  return out;
}
