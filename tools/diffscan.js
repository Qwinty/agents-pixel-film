// Motion sanity scan of the encoded film: decodes every frame of the MP4 (downscaled to 160×90),
// measures the mean difference between neighbouring frames and reports
//   - the largest jumps, marked C when they fall on a shot cut (everything else should be a planned hit);
//   - one-frame "pops": frame n differs a lot from both neighbours while n−1 and n+1 look alike.
//   node tools/diffscan.js [out/film.mp4]      → exit code 1 if any pop is found
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT } from '../src/assets/load-node.js';
import { SHOTS, FPS } from '../src/timeline.js';

const file = path.resolve(ROOT, process.argv[2] ?? 'out/film.mp4');
const W = 160, H = 90, SZ = W * H * 3;
const p = spawn('ffmpeg', ['-v', 'error', '-i', file, '-vf', `scale=${W}:${H}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
const chunks = [];
p.stdout.on('data', (c) => chunks.push(c));
p.stderr.on('data', (c) => process.stderr.write(c));
const code = await new Promise((r) => p.on('close', r));
if (code) process.exit(code);
const buf = Buffer.concat(chunks), n = Math.floor(buf.length / SZ);
const mad = (i, j) => {
  let s = 0;
  for (let k = 0, a = i * SZ, b = j * SZ; k < SZ; k++) s += Math.abs(buf[a + k] - buf[b + k]);
  return s / SZ;
};
const cuts = new Set(SHOTS.slice(1).map((s) => Math.ceil(s.start * FPS - 0.5)));
const d = [0];
for (let i = 1; i < n; i++) d.push(mad(i - 1, i));

console.log(`${n} frames; largest frame-to-frame differences (C = shot cut):`);
[...d.keys()].slice(1).sort((a, b) => d[b] - d[a]).slice(0, 20)
  .forEach((i) => console.log(`  f${i}  ${(i / FPS).toFixed(2)} s  ${d[i].toFixed(1)}  ${cuts.has(i) ? 'C' : ''}`));

let pops = 0;
for (let i = 1; i < n - 1; i++) {
  if (d[i] > 8 && d[i + 1] > 8 && mad(i - 1, i + 1) < 0.35 * Math.min(d[i], d[i + 1])) {
    pops++;
    console.log(`  POP f${i} ${(i / FPS).toFixed(2)} s: in ${d[i].toFixed(1)}, out ${d[i + 1].toFixed(1)}`);
  }
}
console.log(pops ? `${pops} one-frame pops` : 'no one-frame pops');
process.exit(pops ? 1 : 0);
