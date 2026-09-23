// Review sheets decoded from the encoded MP4 itself (not from the renderer), so what gets checked
// is what the viewer gets: cuts, colours after yuv420p/bt709, compression, the final frames.
//   node tools/mp4sheet.js [out/film.mp4]
//     → out/sheets/mp4_cuts.png  last frame of every shot | first frame of the next (15 cut pairs)
//     → out/sheets/mp4_film.png  48 frames across the film (every half bar)
//     → out/frames/mp4_last.png  the very last frame at full 1920×1080
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { ROOT } from '../src/assets/load-node.js';
import { SHOTS, BAR, BEAT, FPS, FRAMES } from '../src/timeline.js';
import { writePNG } from '../src/engine/png.js';
import { FONTS } from '../src/engine/font.js';

const file = path.resolve(ROOT, process.argv[2] ?? 'out/film.mp4');
const outDir = path.join(ROOT, 'out/sheets');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.join(ROOT, 'out/frames'), { recursive: true });

// ---- probe ------------------------------------------------------------------------------------
const probe = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries',
  'stream=codec_type,codec_name,width,height,pix_fmt,color_space,r_frame_rate,nb_read_frames,duration,sample_rate,channels,start_time',
  '-of', 'json', file], { encoding: 'utf8' });
if (probe.status) { console.error(probe.stderr); process.exit(1); }
for (const s of JSON.parse(probe.stdout).streams) {
  if (s.codec_type === 'video') console.log(`video: ${s.codec_name} ${s.width}×${s.height} ${s.pix_fmt} ${s.color_space} ${s.r_frame_rate} fps, ${s.nb_read_frames} frames (expected ${FRAMES}), ${s.duration} s, start ${s.start_time}`);
  else console.log(`audio: ${s.codec_name} ${s.sample_rate} Hz ×${s.channels}, ${s.duration} s, start ${s.start_time}`);
}

// ---- decode selected frames -----------------------------------------------------------------------
function decode(frames, w, h) {
  const uniq = [...new Set(frames)].sort((a, b) => a - b);
  const sel = uniq.map((n) => `eq(n,${n})`).join('+');
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-i', file,
      '-vf', `select='${sel}',scale=${w}:${h}:flags=area:in_color_matrix=bt709:in_range=tv`,
      '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
    const chunks = [];
    let err = '';
    p.stdout.on('data', (c) => chunks.push(c));
    p.stderr.on('data', (c) => (err += c));
    p.on('close', (code) => {
      if (code) return reject(new Error(err));
      const buf = Buffer.concat(chunks), sz = w * h * 3, byN = new Map();
      uniq.forEach((n, i) => byN.set(n, buf.subarray(i * sz, (i + 1) * sz)));
      if (buf.length < uniq.length * sz) console.warn(`only ${buf.length / sz} of ${uniq.length} frames decoded`);
      resolve(frames.map((n) => byN.get(n)));
    });
  });
}

function label(buf, W, x, y, str, color) {
  let cx = x;
  for (const ch of str) {
    const g = FONTS.tiny.glyphs[ch] || FONTS.tiny.glyphs[ch.toLowerCase()] || FONTS.tiny.glyphs['?'];
    for (let j = 0; j < g.rows.length; j++) for (let i = 0; i < g.rows[j].length; i++) {
      if (g.rows[j][i] !== '#') continue;
      for (let v = 0; v < 2; v++) for (let u = 0; u < 2; u++) {
        const px = cx + i * 2 + u, k = ((y + (j + g.dy) * 2 + v) * W + px) * 3;
        if (px >= 0 && px < W && k >= 0 && k + 2 < buf.length) buf.set(color, k);
      }
    }
    cx += (g.w + 1) * 2;
  }
}

async function sheet(name, frames, labels, tw, th, ncols, gapEvery = 0) {
  const tiles = await decode(frames, tw, th);
  const pad = 4, lab = 16, gap = gapEvery ? 12 : 0;
  const rows = Math.ceil(frames.length / ncols);
  const colX = (c) => pad + c * (tw + pad) + (gapEvery ? Math.floor(c / gapEvery) * gap : 0);
  const SW = colX(ncols - 1) + tw + pad, SH = rows * (th + pad + lab) + pad;
  const buf = new Uint8Array(SW * SH * 3).fill(24);
  tiles.forEach((tile, i) => {
    if (!tile) return;
    const cx = colX(i % ncols), cy = pad + Math.floor(i / ncols) * (th + pad + lab) + lab;
    for (let y = 0; y < th; y++) buf.set(tile.subarray(y * tw * 3, (y + 1) * tw * 3), ((cy + y) * SW + cx) * 3);
    label(buf, SW, cx, cy - lab + 3, labels[i], [220, 220, 230]);
  });
  const out = path.join(outDir, name + '.png');
  writePNG(out, SW, SH, buf);
  console.log(out, `${frames.length} tiles`);
}

const t0 = performance.now();
const lastOf = (s) => Math.ceil(s.end * FPS - 0.5) - 1; // frame n shows t = (n + 0.5) / FPS

// cut pairs: [last of shot k | first of shot k+1]
const cf = [], cl = [];
for (let k = 0; k + 1 < SHOTS.length; k++) {
  const n = lastOf(SHOTS[k]);
  cf.push(n, n + 1);
  cl.push(`${SHOTS[k].id} end f${n}`, `${SHOTS[k + 1].id} start f${n + 1} ${((n + 1) / FPS).toFixed(2)}s`);
}
await sheet('mp4_cuts', cf, cl, 480, 270, 4, 2);

// the whole film, every half bar (+ an 8th note so it lands after the hit)
const ff = [], fl = [];
for (let k = 0; k < 48; k++) {
  const n = Math.min(FRAMES - 1, Math.round((k * BAR / 2 + BEAT / 2) * FPS));
  ff.push(n);
  fl.push(`f${n} ${((n + 0.5) / FPS).toFixed(2)}s`);
}
await sheet('mp4_film', ff, fl, 320, 180, 8);

// the last frame at native size (the QR must be crisp there)
const last = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', `select='eq(n,${FRAMES - 1})'`,
  '-fps_mode', 'passthrough', '-frames:v', '1', path.join(ROOT, 'out/frames/mp4_last.png')]);
if (last.status) console.error(String(last.stderr));
else console.log(path.join(ROOT, 'out/frames/mp4_last.png'));
console.log(`done in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
