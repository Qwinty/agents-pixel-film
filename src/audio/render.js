// Node CLI: render the soundtrack and write out/audio.wav (48 kHz, 16-bit PCM, stereo, 45.000 s).
//
//   node src/audio/render.js [outPath]
//
// Prints render time, sample peak, per-shot and per-bar RMS, and verifies that the two
// mandated silence windows are exact digital zeros.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderAudio, SILENCE_WINDOWS } from './score.js';
import { CUES, BAR, BARS, DURATION, SHOTS, b } from '../timeline.js';
import { rmsDb, peakDb, gainToDb } from './synth.js';

const SR = 48000;
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const out = resolve(root, process.argv[2] ?? 'out/audio.wav');

// ---------------------------------------------------------------------------------------------
// WAV writer (16-bit PCM, interleaved stereo) with TPDF dither
// ---------------------------------------------------------------------------------------------

function writeWav(path, left, right, sampleRate) {
  const frames = left.length;
  const bytes = frames * 4;
  const buf = Buffer.alloc(44 + bytes);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + bytes, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22); buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(bytes, 40);

  // deterministic TPDF dither, suppressed wherever the master is exactly zero so the
  // silence windows survive quantisation untouched.
  let a = 0x1234567 >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (const ch of [left, right]) {
      const x = ch[i];
      let v;
      if (x === 0) v = 0;
      else {
        const d = (rnd() + rnd() - 1) * 0.6;                 // ±0.6 LSB triangular
        v = Math.max(-32768, Math.min(32767, Math.round(x * 32767 + d)));
      }
      buf.writeInt16LE(v, o); o += 2;
    }
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
  return buf.length;
}

// ---------------------------------------------------------------------------------------------

const t0 = performance.now();
const { left, right } = renderAudio(SR);
const renderMs = performance.now() - t0;

const expected = Math.round(DURATION * SR);
if (left.length !== expected) throw new Error(`length ${left.length} != expected ${expected}`);

// --- checks ----------------------------------------------------------------------------------
const problems = [];
for (const [s, e] of SILENCE_WINDOWS) {
  const i0 = Math.round(s * SR), i1 = Math.round(e * SR);
  let bad = 0, worst = 0;
  for (let i = i0; i < i1; i++) {
    if (left[i] !== 0 || right[i] !== 0) { bad++; worst = Math.max(worst, Math.abs(left[i]), Math.abs(right[i])); }
  }
  const label = `[${s.toFixed(5)}, ${e.toFixed(5)})`;
  if (bad) problems.push(`silence window ${label}: ${bad} non-zero samples (max ${worst})`);
  else console.log(`  silence ${label.padEnd(22)} ${(i1 - i0).toString().padStart(7)} samples — exact zeros OK`);
}
let nan = 0;
for (let i = 0; i < left.length; i++) if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) nan++;
if (nan) problems.push(`${nan} non-finite samples`);

const bytes = writeWav(out, left, right, SR);

// --- report ----------------------------------------------------------------------------------
console.log('');
console.log(`  render      ${(renderMs / 1000).toFixed(2)} s`);
console.log(`  output      ${out}  (${(bytes / 1e6).toFixed(2)} MB, ${SR} Hz, 16-bit, stereo, ${(left.length / SR).toFixed(3)} s)`);
console.log(`  sample peak ${peakDb(left, right).toFixed(2)} dBFS`);
console.log(`  overall RMS ${rmsDb(left, right, 0, left.length).toFixed(2)} dBFS`);

console.log('\n  per shot');
for (const s of SHOTS) {
  const i0 = Math.round(s.start * SR), i1 = Math.round(s.end * SR);
  const r = rmsDb(left, right, i0, i1), p = peakDb(left, right, i0, i1);
  const bar = '#'.repeat(Math.max(0, Math.round((r + 60) / 2)));
  console.log(`   ${String(s.id).padStart(2)} ${s.key}  bars ${String(s.bars[0]).padStart(2)}–${String(s.bars[1]).padStart(2)}  ${s.start.toFixed(2).padStart(6)}s  RMS ${r.toFixed(1).padStart(6)}  peak ${p.toFixed(1).padStart(6)}  ${bar}`);
}

console.log('\n  per bar');
for (let k = 0; k < BARS; k++) {
  const i0 = Math.round(b(k + 1) * SR), i1 = Math.round(b(k + 2) * SR);
  const r = rmsDb(left, right, i0, Math.min(i1, left.length));
  const bar = '#'.repeat(Math.max(0, Math.round((r + 60) / 2)));
  console.log(`   bar ${String(k + 1).padStart(2)}  ${b(k + 1).toFixed(3).padStart(7)}s  RMS ${r.toFixed(1).padStart(6)}  ${bar}`);
}

if (problems.length) {
  console.error('\n  PROBLEMS:');
  for (const p of problems) console.error(`   ! ${p}`);
  process.exitCode = 1;
} else {
  console.log('\n  all checks passed');
}
