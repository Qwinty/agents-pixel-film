// Per-art-pixel lighting: out = albedo × light + emissive + glow.
// Light falloff is quantized into bands with 4×4 Bayer dithering, so light reads like
// hand-dithered pixel-art shading, never like a smooth airbrush.
import { bayer } from './util.js';

const OUTLINE = 0x020302;
const toF = (c) => Array.isArray(c) ? c : [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];

/**
 * scene: {
 *   ambient: color|[r,g,b],            base light everywhere (default dim blue night)
 *   lights: [{ x, y, r, color, i, ry?, dir?, spread?, pow? }],
 *   levels: quantization bands for falloff (default 5),
 *   glow: { strength, radius } bloom from emissive layer (dithered),
 *   flash: 0..1 mix toward white, fade: 0..1 mix toward black, tint: color multiply
 * }
 * Returns Uint8Array RGB of art.w × art.h.
 */
export function light(art, scene = {}) {
  const { w, h, col, emi } = art;
  const n = w * h;
  const L = new Float32Array(n * 3);
  const amb = toF(scene.ambient ?? [0.35, 0.38, 0.55]);
  for (let i = 0; i < n; i++) { L[i * 3] = amb[0]; L[i * 3 + 1] = amb[1]; L[i * 3 + 2] = amb[2]; }
  const levels = scene.levels ?? 5;

  for (const lt of scene.lights || []) {
    if (!lt || !(lt.i > 0)) continue;
    const c = toF(lt.color ?? 0xffffff);
    const rx = lt.r, ry = lt.ry ?? lt.r, pow = lt.pow ?? 1.6;
    const x0 = Math.max(0, Math.floor(lt.x - rx)), x1 = Math.min(w - 1, Math.ceil(lt.x + rx));
    const y0 = Math.max(0, Math.floor(lt.y - ry)), y1 = Math.min(h - 1, Math.ceil(lt.y + ry));
    const hasCone = lt.dir !== undefined;
    const cdx = hasCone ? Math.cos(lt.dir) : 0, cdy = hasCone ? Math.sin(lt.dir) : 0;
    const cosSpread = hasCone ? Math.cos(lt.spread ?? 0.8) : 0;
    const lv = lt.levels ?? levels;
    const dw = lt.dither ?? scene.dither ?? 0.45;
    const excl = lt.exclude ? new Set(lt.exclude) : null; // tags this light does not reach (e.g. the monitor's own body)
    const tagArr = art.tag;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - lt.x) / rx, dy = (y + 0.5 - lt.y) / ry;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= 1) continue;
        if (excl && excl.has(tagArr[y * w + x])) continue;
        let f = Math.pow(1 - d, pow);
        if (hasCone) {
          const ddx = x + 0.5 - lt.x, ddy = y + 0.5 - lt.y;
          const len = Math.hypot(ddx, ddy) || 1;
          const cs = (ddx * cdx + ddy * cdy) / len;
          if (cs < cosSpread) {
            const soft = lt.soft ?? 0.25;
            const k = 1 - (cosSpread - cs) / soft;
            if (k <= 0) continue;
            f *= k;
          }
        }
        // quantize to bands; dither only near band edges (clean bands, crisp transitions)
        const fl = f * lv, fi = Math.floor(fl);
        const fr = Math.min(1, Math.max(0, (fl - fi - 0.5) / dw + 0.5));
        const q = (fi + (fr > bayer(x, y) ? 1 : 0)) / lv;
        if (q <= 0) continue;
        const k = (y * w + x) * 3, s = q * lt.i;
        L[k] += c[0] * s; L[k + 1] += c[1] * s; L[k + 2] += c[2] * s;
      }
    }
  }

  // Sprites (characters) are lit as a whole: one light value sampled at the sprite's centroid
  // (no dither grain on faces), plus a 1-px rim of the dominant light on the side facing it.
  if (scene.sprites && scene.sprites.length) litSprites(art, scene, L, amb);

  const out = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = col[i], e = emi[i];
    const k = i * 3;
    out[k] = Math.min(255, ((a >> 16) & 255) * L[k] + ((e >> 16) & 255));
    out[k + 1] = Math.min(255, ((a >> 8) & 255) * L[k + 1] + ((e >> 8) & 255));
    out[k + 2] = Math.min(255, (a & 255) * L[k + 2] + (e & 255));
  }

  if (scene.glow && scene.glow.strength > 0) addGlow(out, art, scene.glow);

  if (scene.tint !== undefined) {
    const t = toF(scene.tint);
    for (let i = 0; i < n; i++) { const k = i * 3; out[k] *= t[0]; out[k + 1] *= t[1]; out[k + 2] *= t[2]; }
  }
  if (scene.flash > 0) {
    const f = Math.min(1, scene.flash), fc = toF(scene.flashColor ?? 0xffffff);
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      out[k] += (fc[0] * 255 - out[k]) * f; out[k + 1] += (fc[1] * 255 - out[k + 1]) * f; out[k + 2] += (fc[2] * 255 - out[k + 2]) * f;
    }
  }
  if (scene.fade > 0) {
    // Fade to black in dithered steps (keeps pixels flat)
    const f = Math.min(1, scene.fade);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const q = Math.floor(f * 6 + bayer(x, y)) / 6;
      const k = (y * w + x) * 3, m = 1 - q;
      out[k] *= m; out[k + 1] *= m; out[k + 2] *= m;
    }
  }
  return out;
}

/** Continuous (undithered) light at a point: ambient + Σ lights. Returns [r,g,b] and the dominant light. */
function lightAt(scene, amb, px, py) {
  const L = [amb[0], amb[1], amb[2]];
  let best = null, bestV = 0;
  for (const lt of scene.lights || []) {
    if (!lt || !(lt.i > 0)) continue;
    const rx = lt.r, ry = lt.ry ?? lt.r;
    const dx = (px - lt.x) / rx, dy = (py - lt.y) / ry;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d >= 1) continue;
    let f = Math.pow(1 - d, lt.pow ?? 1.6);
    if (lt.dir !== undefined) {
      const ddx = px - lt.x, ddy = py - lt.y, len = Math.hypot(ddx, ddy) || 1;
      const cs = (ddx * Math.cos(lt.dir) + ddy * Math.sin(lt.dir)) / len;
      const cosSpread = Math.cos(lt.spread ?? 0.8);
      if (cs < cosSpread) { const k = 1 - (cosSpread - cs) / (lt.soft ?? 0.25); if (k <= 0) continue; f *= k; }
    }
    const c = toF(lt.color ?? 0xffffff), s = f * lt.i;
    L[0] += c[0] * s; L[1] += c[1] * s; L[2] += c[2] * s;
    const v = s * (c[0] + c[1] + c[2]);
    if (v > bestV) { bestV = v; best = { lt, c, s }; }
  }
  return { L, best };
}

function litSprites(art, scene, L, amb) {
  const { w, h, tag } = art;
  const want = new Set(scene.sprites);
  const acc = new Map(); // tag → [sx, sy, n, x0, y0, x1, y1]
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const tg = tag[y * w + x];
    if (!want.has(tg)) continue;
    let a = acc.get(tg);
    if (!a) { a = [0, 0, 0, x, y, x, y]; acc.set(tg, a); }
    a[0] += x; a[1] += y; a[2]++;
    if (x < a[3]) a[3] = x; if (y < a[4]) a[4] = y; if (x > a[5]) a[5] = x; if (y > a[6]) a[6] = y;
  }
  const rimK = scene.rim ?? 0.9;
  for (const [tg, a] of acc) {
    const cx = a[0] / a[2] + 0.5, cy = a[1] / a[2] + 0.5;
    let { L: Lc, best } = lightAt(scene, amb, cx, cy);
    // character readability: keep only part of the environment's hue and never drop below a
    // brightness floor (a "key light" on the cast), per scene or per tag
    const sl = (scene.spriteLight && scene.spriteLight.byTag && scene.spriteLight.byTag[tg]) || scene.spriteLight;
    if (sl) {
      const lum = Lc[0] * 0.3 + Lc[1] * 0.59 + Lc[2] * 0.11;
      const keep = sl.keep ?? 0.5;
      const target = Math.max(lum, sl.floor ?? 0);
      const k = lum > 1e-6 ? target / lum : 0;
      Lc = [0, 1, 2].map((c) => (lum + (Lc[c] - lum) * keep) * k);
      if (sl.warm) { Lc[0] *= 1 + sl.warm * 0.12; Lc[2] *= 1 - sl.warm * 0.1; }
    }
    let rdx = 0, rdy = 0, rim = null;
    if (best && rimK > 0) {
      const dx = best.lt.x - cx, dy = best.lt.y - cy, len = Math.hypot(dx, dy) || 1;
      rdx = Math.abs(dx / len) > 0.38 ? Math.sign(dx) : 0;
      rdy = Math.abs(dy / len) > 0.38 ? Math.sign(dy) : 0;
      rim = [best.c[0] * best.s * rimK, best.c[1] * best.s * rimK, best.c[2] * best.s * rimK];
    }
    for (let y = a[4]; y <= a[6]; y++) for (let x = a[3]; x <= a[5]; x++) {
      const i = y * w + x;
      if (tag[i] !== tg) continue;
      const k = i * 3;
      L[k] = Lc[0]; L[k + 1] = Lc[1]; L[k + 2] = Lc[2];
      if (rim && (rdx || rdy) && art.col[i] !== OUTLINE) {
        const out1 = (xx, yy) => xx < 0 || yy < 0 || xx >= w || yy >= h || tag[yy * w + xx] !== tg;
        const nx = x + rdx, ny = y + rdy;
        const isRim = out1(nx, ny) || (art.col[ny * w + nx] === OUTLINE && out1(nx + rdx, ny + rdy));
        if (isRim) { L[k] += rim[0]; L[k + 1] += rim[1]; L[k + 2] += rim[2]; }
      }
    }
  }
}

/** Bloom from the emissive layer: separable box blur ×2, quantized + dithered, added. */
function addGlow(out, art, { strength = 0.5, radius = 4, levels = 6, threshold = 150 }) {
  const { w, h, emi } = art;
  const n = w * h;
  let a = new Float32Array(n * 3), b = new Float32Array(n * 3);
  // only bright emissive pixels bloom (screen text, bulbs, eyes, sparks) — not dark screens or sky
  for (let i = 0; i < n; i++) {
    const e = emi[i];
    const r0 = (e >> 16) & 255, g0 = (e >> 8) & 255, b0 = e & 255;
    const lum = r0 * 0.3 + g0 * 0.59 + b0 * 0.11;
    const k = lum > threshold ? 1 : 0;
    a[i * 3] = r0 * k; a[i * 3 + 1] = g0 * k; a[i * 3 + 2] = b0 * k;
  }
  const r = Math.max(1, Math.round(radius / 2));
  const passH = (src, dst) => {
    const inv = 1 / (2 * r + 1);
    for (let y = 0; y < h; y++) {
      for (let ch = 0; ch < 3; ch++) {
        let s = 0;
        for (let x = -r; x <= r; x++) s += src[(y * w + Math.min(w - 1, Math.max(0, x))) * 3 + ch];
        for (let x = 0; x < w; x++) {
          dst[(y * w + x) * 3 + ch] = s * inv;
          const xa = Math.min(w - 1, x + r + 1), xr = Math.max(0, x - r);
          s += src[(y * w + xa) * 3 + ch] - src[(y * w + xr) * 3 + ch];
        }
      }
    }
  };
  const passV = (src, dst) => {
    const inv = 1 / (2 * r + 1);
    for (let x = 0; x < w; x++) {
      for (let ch = 0; ch < 3; ch++) {
        let s = 0;
        for (let y = -r; y <= r; y++) s += src[(Math.min(h - 1, Math.max(0, y)) * w + x) * 3 + ch];
        for (let y = 0; y < h; y++) {
          dst[(y * w + x) * 3 + ch] = s * inv;
          const ya = Math.min(h - 1, y + r + 1), yr = Math.max(0, y - r);
          s += src[(ya * w + x) * 3 + ch] - src[(yr * w + x) * 3 + ch];
        }
      }
    }
  };
  passH(a, b); passV(b, a); passH(a, b); passV(b, a);
  // Banded halo: the glow is quantized into clean concentric bands, dithered only in a narrow
  // strip at each band edge (like hand-drawn pixel-art glows, no speckle noise).
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = (y * w + x) * 3;
    const th = bayer(x, y);
    // glow shows on dark surroundings; bright surfaces barely take it (no glitter on lit bodies)
    const lum = (out[k] * 0.3 + out[k + 1] * 0.59 + out[k + 2] * 0.11) / 255;
    const room = Math.max(0, 1 - lum * 1.4);
    const m = Math.max(a[k], a[k + 1], a[k + 2]) * strength * room / 255;
    if (m <= 0) continue;
    const fl = m * levels, fi = Math.floor(fl);
    const fr = Math.min(1, Math.max(0, (fl - fi - 0.5) / 0.3 + 0.5));
    const q = (fi + (fr > th ? 1 : 0)) / levels;
    if (q <= 0) continue;
    const s = q / m; // scale the colour so its brightest channel sits on the band
    for (let ch = 0; ch < 3; ch++) {
      const v = a[k + ch] * strength * room / 255 * s;
      out[k + ch] = Math.min(255, out[k + ch] + v * 255);
    }
  }
}
