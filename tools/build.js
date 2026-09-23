// One-command build: synthesize the soundtrack, render all 1350 frames in parallel worker
// threads, pipe them in order into ffmpeg → out/film.mp4 (1920×1080, 30 fps, H.264 + AAC).
//   node tools/build.js                 full film
//   node tools/build.js --no-audio      reuse out/audio.wav
//   node tools/build.js --frames 0:300 --size 960x540 --out out/test.mp4   quick partial preview
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { ROOT } from '../src/assets/load-node.js';
import { FRAMES, FPS, frameTime } from '../src/timeline.js';
import { createPool } from './pool.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const [W, H] = opt('--size', '1920x1080').split('x').map(Number);
const [f0, f1] = opt('--frames', `0:${FRAMES}`).split(':').map(Number);
const outFile = path.resolve(ROOT, opt('--out', 'out/film.mp4'));
const crf = opt('--crf', '14');
const wav = path.join(ROOT, 'out/audio.wav');
fs.mkdirSync(path.dirname(outFile), { recursive: true });

const T0 = performance.now();
if (!args.includes('--no-audio')) {
  console.log('▸ audio: node src/audio/render.js');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'src/audio/render.js')], { stdio: 'inherit', cwd: ROOT });
  if (r.status !== 0) { console.error('audio render failed'); process.exit(1); }
}
const withAudio = fs.existsSync(wav);

const ff = [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-framerate', String(FPS), '-i', 'pipe:0',
];
if (withAudio) ff.push('-ss', (f0 / FPS).toFixed(4), '-i', wav);
ff.push(
  '-map', '0:v',
  ...(withAudio ? ['-map', '1:a'] : []),
  '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', crf,
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
  ...(withAudio ? ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000'] : []),
  '-t', ((f1 - f0) / FPS).toFixed(4),
  '-movflags', '+faststart', outFile,
);
console.log(`▸ video: ${f1 - f0} frames ${W}×${H} → ${path.relative(ROOT, outFile)}`);
const proc = spawn('ffmpeg', ff, { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((res, rej) => proc.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));

const pool = createPool();
const WINDOW = pool.size * 3;
let next = f0;                 // next frame to submit
const inflight = new Map();    // frame → promise
const tv = performance.now();
for (let n = f0; n < f1; n++) {
  while (next < f1 && next - n < WINDOW) { inflight.set(next, pool.render(frameTime(next), W, H)); next++; }
  const buf = await inflight.get(n);
  inflight.delete(n);
  if (!proc.stdin.write(buf)) await new Promise((r) => proc.stdin.once('drain', r));
  if ((n - f0 + 1) % 60 === 0 || n === f1 - 1) {
    const el = (performance.now() - tv) / 1000;
    process.stdout.write(`\r  ${n - f0 + 1}/${f1 - f0} frames  ${((n - f0 + 1) / el).toFixed(1)} fps   `);
  }
}
proc.stdin.end();
await pool.close();
await done;
console.log(`\n✓ ${path.relative(ROOT, outFile)} in ${((performance.now() - T0) / 1000).toFixed(1)} s`);
