// Contact sheets for visual review.
//   node tools/contact.js                 → every shot (out/sheets/sNN.png) + the whole film (out/sheets/film.png)
//   node tools/contact.js s04 s05         → only those shots
//   node tools/contact.js film            → only the film sheet
//   options: --step 0.5  (beats between tiles, default 0.5 = every 8th note)
//            --cols 4    (tiles per row)
// Shot tiles are sampled one frame after each grid point, so they show the state right after
// every hit. Tiles are rendered at 960×540 and box-downsampled to 480×270; film tiles 320×180.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../src/assets/load-node.js';
import { SHOTS, BEAT, BAR, FPS, FRAMES, frameTime } from '../src/timeline.js';
import { writePNG } from '../src/engine/png.js';
import { FONTS } from '../src/engine/font.js';
import { createPool } from './pool.js';

const args = process.argv.slice(2);
let step = 0.5, cols = 4;
const which = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--step') { step = Number(args[++i]); continue; }
  if (args[i] === '--cols') { cols = Number(args[++i]); continue; }
  which.push(args[i]);
}
const doAll = which.length === 0;
const outDir = path.join(ROOT, 'out/sheets');
fs.mkdirSync(outDir, { recursive: true });
const pool = createPool();

function downsample(src, sw, sh, f) {
  const dw = sw / f, dh = sh / f, out = new Uint8Array(dw * dh * 3);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    let r = 0, g = 0, bl = 0;
    for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) {
      const k = ((y * f + j) * sw + x * f + i) * 3;
      r += src[k]; g += src[k + 1]; bl += src[k + 2];
    }
    const n = f * f, d = (y * dw + x) * 3;
    out[d] = r / n; out[d + 1] = g / n; out[d + 2] = bl / n;
  }
  return out;
}

function label(buf, W, x, y, str, scale = 2, color = [255, 255, 255]) {
  let cx = x;
  for (const ch of str) {
    const g = FONTS.tiny.glyphs[ch] || FONTS.tiny.glyphs[ch.toLowerCase()] || FONTS.tiny.glyphs['?'];
    for (let j = 0; j < g.rows.length; j++) for (let i = 0; i < g.rows[j].length; i++) {
      if (g.rows[j][i] !== '#') continue;
      for (let v = 0; v < scale; v++) for (let u = 0; u < scale; u++) {
        const px = cx + i * scale + u, py = y + (j + g.dy) * scale + v;
        const k = (py * W + px) * 3;
        if (px < 0 || py < 0 || px >= W || k + 2 >= buf.length) continue;
        buf[k] = color[0]; buf[k + 1] = color[1]; buf[k + 2] = color[2];
      }
    }
    cx += (g.w + 1) * scale;
  }
}

async function sheet(name, times, tileW, tileH, factor, ncols, labels) {
  const pad = 4, lab = 16;
  const rows = Math.ceil(times.length / ncols);
  const SW = ncols * (tileW + pad) + pad, SH = rows * (tileH + pad + lab) + pad;
  const buf = new Uint8Array(SW * SH * 3).fill(24);
  const frames = await Promise.all(times.map((t) => pool.render(t, tileW * factor, tileH * factor)));
  frames.forEach((fr, i) => {
    const tile = factor === 1 ? fr : downsample(fr, tileW * factor, tileH * factor, factor);
    const cx = pad + (i % ncols) * (tileW + pad), cy = pad + Math.floor(i / ncols) * (tileH + pad + lab) + lab;
    for (let y = 0; y < tileH; y++) buf.set(tile.subarray(y * tileW * 3, (y + 1) * tileW * 3), ((cy + y) * SW + cx) * 3);
    label(buf, SW, cx, cy - lab + 3, labels[i], 2, [220, 220, 230]);
  });
  const file = path.join(outDir, name + '.png');
  writePNG(file, SW, SH, buf);
  console.log(file, `${times.length} tiles`);
}

const fmt = (t) => {
  const bar = Math.floor(t / BAR) + 1, beat = (t - (bar - 1) * BAR) / BEAT + 1;
  return `${t.toFixed(2)}s b${bar}.${beat.toFixed(1)}`;
};

const t0 = performance.now();
for (const s of SHOTS) {
  if (!doAll && !which.includes(s.key)) continue;
  const times = [];
  const last = Math.ceil(s.end * FPS - 0.5) - 1; // frame n shows t = (n + 0.5) / FPS
  for (let u = s.start; u < s.end - 1e-6; u += step * BEAT) {
    const n = Math.min(Math.round(u * FPS) + 1, last);
    times.push(frameTime(n));
  }
  // always include the very last frame of the shot
  times.push(frameTime(last));
  await sheet(s.key, times, 480, 270, 2, cols, times.map((t) => `${s.key} ${fmt(t)}`));
}
if (doAll || which.includes('film')) {
  const times = [];
  for (let k = 0; k < 48; k++) times.push(frameTime(Math.min(FRAMES - 1, Math.round((k * BAR / 2 + BEAT / 2) * FPS))));
  await sheet('film', times, 320, 180, 3, 8, times.map((t) => fmt(t)));
}
await pool.close();
console.log(`done in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
