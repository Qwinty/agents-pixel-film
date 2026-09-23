// Render single frames to PNG.
//   node tools/frame.js 12.5 b5.3 f120 [--size 1920x1080] [--out out/frames]
//   12.5 = seconds, b5.3 = bar 5 beat 3 (+ one frame), f120 = frame 120
import fs from 'node:fs';
import path from 'node:path';
import { loadAssets, ROOT } from '../src/assets/load-node.js';
import { renderFrameAt } from '../src/film.js';
import { writePNG } from '../src/engine/png.js';
import { b, FPS, frameTime } from '../src/timeline.js';

const args = process.argv.slice(2);
let size = [1920, 1080], outDir = path.join(ROOT, 'out/frames');
const times = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--size') { size = args[++i].split('x').map(Number); continue; }
  if (a === '--out') { outDir = path.resolve(args[++i]); continue; }
  times.push(parseTime(a));
}
export function parseTime(a) {
  if (a.startsWith('b')) { const [bar, beat] = a.slice(1).split('.').map(Number); return frameTime(Math.round(b(bar, beat || 1) * FPS)); }
  if (a.startsWith('f')) return frameTime(Number(a.slice(1)));
  return Number(a);
}
loadAssets();
fs.mkdirSync(outDir, { recursive: true });
for (const t of times) {
  const t0 = performance.now();
  const img = renderFrameAt(t, size[0], size[1]);
  const name = path.join(outDir, `t${t.toFixed(3)}.png`);
  writePNG(name, size[0], size[1], img);
  console.log(`${name}  (${(performance.now() - t0).toFixed(0)} ms)`);
}
