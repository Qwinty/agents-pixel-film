// Node CLI: render the soundtrack (48 kHz, 16-bit PCM, stereo, 45.000 s).
//
//   node src/audio/render.js [--lang en|ru] [--no-voice] [--voice-dir voice] [outPath]
//
// Default output: out/audio.<lang>.wav (out/audio.music.wav with --no-voice or for a language
// without narration). The narration take voice/<lang>/take.mp3 is decoded with ffmpeg and mixed
// over the score.
// Prints render time, sample peak, per-shot and per-bar RMS, where every line landed, and
// verifies that the two mandated silence windows are exact digital zeros wherever no one speaks.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderAudio, SILENCE_WINDOWS } from './score.js';
import { renderVoice } from './voiceover.js';
import { decodeAudio } from './decode-node.js';
import { VOICE_FREE, NARRATED } from '../narration.js';
import { LANGS, DEFAULT_LANG } from '../lang.js';
import { CUES, BAR, BARS, DURATION, SHOTS, b } from '../timeline.js';
import { rmsDb, peakDb, gainToDb } from './synth.js';

const SR = 48000;
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const lang = opt('--lang', DEFAULT_LANG);
if (!LANGS.includes(lang)) { console.error(`unknown language "${lang}" (expected ${LANGS.join(' | ')})`); process.exit(1); }
const withVoice = NARRATED.includes(lang) && !args.includes('--no-voice');
const voiceDir = resolve(root, opt('--voice-dir', 'voice'));   // another take set, e.g. a voice audition
const positional = args.filter((a, i) => !a.startsWith('--') && !['--lang', '--voice-dir'].includes(args[i - 1]));
const out = resolve(root, positional[0] ?? (withVoice ? `out/audio.${lang}.wav` : 'out/audio.music.wav'));

/** The narration take → mono Float32 at the mix rate (ffmpeg decodes and resamples). */
function loadTake(lang) {
  const dir = resolve(voiceDir, lang);
  const take = JSON.parse(readFileSync(resolve(dir, 'take.json'), 'utf8'));
  return { take, samples: decodeAudio(resolve(dir, 'take.mp3'), SR) };
}

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
const expected = Math.round(DURATION * SR);
let vo = null;
if (withVoice) {
  const { take, samples } = loadTake(lang);
  vo = renderVoice(take, samples, SR, expected);
  vo.take = take;
}
const { left, right } = renderAudio(SR, vo);
const renderMs = performance.now() - t0;

if (left.length !== expected) throw new Error(`length ${left.length} != expected ${expected}`);

// --- checks ----------------------------------------------------------------------------------
const problems = [];
const clips = vo ? vo.clips : [];
const speaking = (i) => clips.some(([c0, c1]) => i >= Math.round(c0 * SR) && i < Math.round(c1 * SR));
for (const [s, e] of SILENCE_WINDOWS) {
  const i0 = Math.round(s * SR), i1 = Math.round(e * SR);
  let bad = 0, worst = 0, voiced = 0;
  for (let i = i0; i < i1; i++) {
    if (speaking(i)) { voiced++; continue; }
    if (left[i] !== 0 || right[i] !== 0) { bad++; worst = Math.max(worst, Math.abs(left[i]), Math.abs(right[i])); }
  }
  const label = `[${s.toFixed(5)}, ${e.toFixed(5)})`;
  if (bad) problems.push(`silence window ${label}: ${bad} non-zero samples (max ${worst})`);
  else console.log(`  silence ${label.padEnd(22)} ${(i1 - i0 - voiced).toString().padStart(7)} samples — exact zeros OK${voiced ? `  (+${voiced} under the narrator)` : ''}`);
}
if (vo) {
  for (const [s, e] of VOICE_FREE) {
    let bad = 0;
    for (let i = Math.round(s * SR); i < Math.min(expected, Math.round(e * SR)); i++) if (vo.voice[i] !== 0) bad++;
    if (bad) problems.push(`voice-free window [${s.toFixed(3)}, ${e.toFixed(3)}): ${bad} voice samples`);
  }
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

if (vo) {
  console.log(`\n  narration (${lang}, ${vo.take.voiceName ?? vo.take.voiceId}, ${vo.take.model})`);
  vo.take.lines.forEach((l, k) => {
    const [s, e] = vo.spans[k];
    const r = rmsDb(left, right, Math.round(s * SR), Math.round(e * SR));
    console.log(`   ${l.id.padEnd(10)} ${s.toFixed(2).padStart(6)}–${e.toFixed(2).padStart(6)}s  mix RMS ${r.toFixed(1).padStart(6)}  ${l.text}`);
  });
}

if (problems.length) {
  console.error('\n  PROBLEMS:');
  for (const p of problems) console.error(`   ! ${p}`);
  process.exitCode = 1;
} else {
  console.log('\n  all checks passed');
}
