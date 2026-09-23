// The narration bus: cut the single ElevenLabs take into lines and put each line on its cue from
// src/narration.js, so it starts to sound exactly on `at`.
//
// Where a line sits in the take comes from word timestamps (ElevenLabs forced alignment of the
// take against its own text, done once by tools/voice.js), refined by the audio itself:
//   - a tagged line starts where its tag's performance starts ([laughs], [gasps] happen before
//     the first word), found as the first sustained sound in the pause before that word;
//   - a line ends where its last sound fades, not where the last word's timestamp says.
// A reading that is too long for its slot first moves up to `early` s before its cue, then has
// its inner pauses (a laugh → the words, "Then... silence") tightened to KEEP_PAUSE, then is
// compressed in time (WSOLA, pitch unchanged) by at most MAX_RATE; beyond that it is an error.
// Environment-agnostic: the caller decodes take.mp3 to mono Float32 at the mix rate.
import { LINES, VOICE_FREE } from '../narration.js';
import { DURATION } from '../timeline.js';
import { dbToGain } from './synth.js';

const PRE = 0.04;          // s of take kept before a line's onset
const POST = 0.12;         // s kept after its last sound
const FADE_IN = 0.008;
const FADE_OUT = 0.06;
const GAP = 0.08;          // minimum air between two lines / before a voice-free window
const EARLY = 0.2;         // s a line may start before its cue when the reading runs long
const MAX_RATE = 1.25;     // strongest time compression allowed for a line that is still too long
const TARGET_RMS = -16;    // dBFS, loudness of the speech while it is actually speaking
const LINE_EVEN = 3;       // dB, how far a single line may be pulled towards TARGET_RMS
const HPF = 80;            // Hz, clears rumble below the voice
const WIN = 0.01;          // s, analysis window of the onset/offset detector
const FLOOR = 30;          // dB below the take's speech level that still counts as sound
const LEAD_MAX = 1.2;      // s, longest tag performance searched for before the first word
const TAIL_MAX = 0.4;      // s, longest decay followed after the last word
const PAUSE_MIN = 0.2;     // s, a quiet stretch inside a line at least this long is a pause
const KEEP_PAUSE = 0.15;   // s a pause is tightened to when the line does not fit
const XFADE = 0.01;        // s, crossfade where a pause is tightened

/**
 * Find every line of the script in the take → [{id, text, start, end, words: [first, last], pauses}]
 * in take seconds: `start`/`end` bound what is audible, `words` the spoken text, `pauses` the
 * quiet stretches inside the line.
 * @param words    forced-alignment words of the take, in order: [{text, start, end}]
 * @param lines    [{id, text, tag}] — the script in the same order
 * @param samples  the decoded take (mono Float32 at sr)
 */
export function locateLines(words, lines, samples, sr) {
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  let w = 0;
  const spans = lines.map((l) => {
    const tokens = l.text.split(/\s+/).filter(Boolean);
    const ws = words.slice(w, w + tokens.length);
    if (ws.length !== tokens.length || ws.some((x, i) => norm(x.text) !== norm(tokens[i]))) {
      throw new Error(`line "${l.id}" ("${l.text}") does not match the aligned words: ${ws.map((x) => x.text).join(' ')}`);
    }
    w += tokens.length;
    return { id: l.id, text: l.text, tag: l.tag, first: ws[0].start, last: ws[ws.length - 1].end };
  });

  // energy envelope in WIN windows, threshold relative to the take's speech level (95th percentile)
  const n = Math.round(WIN * sr), nw = Math.floor(samples.length / n);
  const lvl = new Float32Array(nw);
  for (let i = 0; i < nw; i++) {
    let acc = 0;
    for (let j = i * n; j < (i + 1) * n; j++) acc += samples[j] * samples[j];
    lvl[i] = 10 * Math.log10(acc / n + 1e-12);
  }
  const thr = Float32Array.from(lvl).sort()[Math.floor(nw * 0.95)] - FLOOR;
  const loud = (i) => i >= 0 && i < nw && lvl[i] > thr;
  const sustained = (i) => loud(i) && loud(i + 1) && loud(i + 2);       // ≥ 30 ms: not a click
  const win = (t) => Math.max(0, Math.min(nw - 1, Math.floor(t / WIN)));

  return spans.map((s, k) => {
    const prevLast = k > 0 ? spans[k - 1].last : 0;
    const nextFirst = k + 1 < spans.length ? spans[k + 1].first : samples.length / sr;
    // onset: for a tagged line, the first sustained sound in the pause before its first word
    let start = s.first;
    if (s.tag) {
      const from = Math.max(prevLast + 0.15, s.first - LEAD_MAX);
      for (let i = win(from); i < win(s.first); i++) if (sustained(i)) { start = i * WIN; break; }
    }
    // offset: follow the decay after the last word while it stays above the floor
    let end = s.last;
    const stop = Math.min(s.last + TAIL_MAX, nextFirst - 0.1);
    for (let i = win(s.last), quiet = 0; i < win(stop); i++) {
      if (loud(i)) { end = (i + 1) * WIN; quiet = 0; } else if (++quiet > 6) break;
    }
    end = Math.max(end, s.last);
    const pauses = [];
    for (let i = win(start), run = -1; i <= win(end); i++) {
      if (!loud(i) && i < win(end)) { if (run < 0) run = i; continue; }
      if (run >= 0 && (i - run) * WIN >= PAUSE_MIN) pauses.push([run * WIN, i * WIN]);
      run = -1;
    }
    return { id: s.id, text: s.text, start, end, words: [s.first, s.last], pauses };
  });
}

/** The first voice-free window at or after t. */
const nextFree = (t) => Math.min(...VOICE_FREE.filter(([w0]) => w0 >= t).map(([w0]) => w0), DURATION - 0.5);

/**
 * Where each line lands in the film: on its cue if it fits; else up to `early` (default EARLY)
 * seconds before it, never closer than GAP to the previous line; else with its pauses tightened;
 * else compressed in time by up to MAX_RATE. Lines that still do not fit are reported as problems.
 * @returns {{ rows: Array<{id, text, cue, at, dur, end, tight, rate, limit}>, problems: string[] }}
 */
export function placementReport(take) {
  const rows = [];
  const problems = [];
  const byId = Object.fromEntries(take.lines.map((l) => [l.id, l]));
  let prevEnd = -Infinity;
  LINES.forEach((line, i) => {
    const t = byId[line.id];
    if (!t) { problems.push(`line "${line.id}" missing from the ${take.lang} take — run node tools/voice.js ${take.lang}`); return; }
    if (t.text !== line[take.lang]) problems.push(`line "${line.id}" changed since the ${take.lang} take — run node tools/voice.js ${take.lang}`);
    const cue = line.at;
    let limit = nextFree(cue);
    if (i + 1 < LINES.length) limit = Math.min(limit, LINES[i + 1].at);
    const earliest = Math.max(cue - (line.early ?? EARLY), prevEnd + GAP, 0);
    const place = (len) => Math.max(earliest, Math.min(cue, limit - GAP - len));
    let len = t.end - t.start;
    let at = place(len);
    const tight = len > limit - GAP - at && (t.pauses ?? []).some(([p0, p1]) => p1 - p0 > KEEP_PAUSE);
    if (tight) { len -= t.pauses.reduce((a, [p0, p1]) => a + Math.max(0, p1 - p0 - KEEP_PAUSE), 0); at = place(len); }
    const room = limit - GAP - at;
    const rate = len > room ? len / Math.max(room, 1e-3) : 1;
    if (rate > MAX_RATE) problems.push(`line "${line.id}" is ${(len - room * MAX_RATE).toFixed(2)} s too long for its slot even at ${MAX_RATE}× speed`);
    const dur = len / rate;
    const end = at + dur;
    for (const [w0, w1] of VOICE_FREE) {
      if (at < w1 && end > w0 + 1e-9) problems.push(`line "${line.id}" [${at.toFixed(2)}–${end.toFixed(2)}] enters the voice-free window [${w0.toFixed(2)}–${w1.toFixed(2)})`);
    }
    rows.push({ id: line.id, text: t.text, cue, at, dur, end, tight, rate, limit });
    prevEnd = end;
  });
  return { rows, problems };
}

/** The stretches of take time [a, b) that tightenPauses cuts out of a line. */
const pauseCuts = (l) => (l.pauses ?? []).filter(([p0, p1]) => p1 - p0 > KEEP_PAUSE).map(([p0, p1]) => [p0 + KEEP_PAUSE / 2, p1 - KEEP_PAUSE / 2]);

/**
 * When every word is heard in the film: the placement of each line (placementReport) applied to
 * the take's forced-alignment words — pauses tightened, then compressed by the line's rate.
 * @returns Array<{id, text, at, end, words: Array<{text, t}>}>  (t in film seconds, `text` from the script)
 */
export function lineWords(take) {
  const { rows } = placementReport(take);
  const byId = Object.fromEntries(take.lines.map((l) => [l.id, l]));
  const tokens = {};
  let w = 0;
  for (const line of LINES) {
    const ts = line[take.lang].split(/\s+/).filter(Boolean);
    tokens[line.id] = ts.map((text, i) => ({ text, start: take.words[w + i].start }));
    w += ts.length;
  }
  return rows.map((row) => {
    const l = byId[row.id];
    const cuts = row.tight ? pauseCuts(l) : [];
    const film = (tau) => {
      let x = tau;
      for (const [a, b] of cuts) if (tau > a) x -= Math.min(tau, b) - a;
      return row.at + Math.max(0, x - l.start) / row.rate;
    };
    return { id: row.id, text: row.text, at: row.at, end: row.end, words: tokens[row.id].map((tk) => ({ text: tk.text, t: film(tk.start) })) };
  });
}

/** Cut the middle out of every pause in [c0, c1) longer than KEEP_PAUSE, with short crossfades. */
function tightenPauses(samples, c0, c1, l, sr) {
  const keep = [];
  let from = c0;
  for (const [a, b] of pauseCuts(l)) {
    if (a < c0 || b > c1) continue;
    keep.push([from, a]);
    from = b;
  }
  keep.push([from, c1]);
  const xf = Math.round(XFADE * sr);
  const parts = keep.map(([a, b]) => samples.subarray(Math.round(a * sr), Math.min(samples.length, Math.round(b * sr))));
  const out = new Float32Array(parts.reduce((a, p) => a + p.length, 0) - xf * (parts.length - 1));
  let o = 0;
  parts.forEach((p, k) => {
    for (let j = 0; j < p.length; j++) {
      let g = 1;
      if (k > 0 && j < xf) g = j / xf;                              // fade in over the previous tail
      if (k < parts.length - 1 && j >= p.length - xf) g = (p.length - j) / xf;
      out[o + j] += p[j] * g;
    }
    o += p.length - xf;
  });
  return out;
}

/**
 * Time compression by WSOLA: overlap-added 30 ms Hann frames read `rate` times faster than they
 * are written, each nudged (±8 ms) to the offset that best continues the waveform of the previous
 * frame, so pitch and timbre stay put. Returns round(x.length / rate) samples.
 */
export function timeCompress(x, rate, sr) {
  if (rate <= 1.0001) return x;
  const N = 2 * Math.round(0.015 * sr), Hs = N / 2, tol = Math.round(0.008 * sr);
  const outLen = Math.round(x.length / rate);
  const y = new Float32Array(outLen + N), wsum = new Float32Array(outLen + N);
  const hann = Float32Array.from({ length: N }, (_, j) => 0.5 - 0.5 * Math.cos(2 * Math.PI * j / N));
  let prev = -1;
  for (let k = 0; k * Hs < outLen; k++) {
    const nominal = Math.min(x.length - N, Math.round(k * Hs * rate));
    let p = Math.max(0, nominal);
    const nat = prev + Hs;                                  // where the previous frame would continue
    if (prev >= 0 && nat + N <= x.length) {
      let best = -Infinity;
      for (let d = -tol; d <= tol; d += 2) {
        const q = nominal + d;
        if (q < 0 || q + N > x.length) continue;
        let c = 0;
        for (let j = 0; j < N; j += 3) c += x[nat + j] * x[q + j];
        if (c > best) { best = c; p = q; }
      }
    }
    for (let j = 0; j < N; j++) { y[k * Hs + j] += x[p + j] * hann[j]; wsum[k * Hs + j] += hann[j]; }
    prev = p;
  }
  for (let i = 0; i < outLen; i++) if (wsum[i] > 1e-3) y[i] /= wsum[i];
  return y.subarray(0, outLen);
}

/**
 * Render the narration bus.
 * @param take     voice/<lang>/take.json
 * @param samples  the take decoded to mono Float32 at `sr`
 * @returns {{ voice: Float32Array, spans: Array<[number, number]>, clips: Array<[number, number]>, rows }}
 *   voice: n samples; spans: audible [start, end) of each line in film seconds; clips: the audio actually placed
 */
export function renderVoice(take, samples, sr, n) {
  const { rows, problems } = placementReport(take);
  if (problems.length) throw new Error(`narration (${take.lang}) does not fit the film:\n  ${problems.join('\n  ')}`);
  const voice = new Float32Array(n);
  const spans = [], clips = [];
  const tl = take.lines;

  // loudness: scale the whole take so speech sits at TARGET_RMS, then pull each line up to
  // LINE_EVEN dB towards the target (a one-word line read softly would drown in the music)
  const power = (l) => {
    let acc = 0, cnt = 0;
    for (let i = Math.round(l.start * sr); i < Math.min(samples.length, Math.round(l.end * sr)); i++) { acc += samples[i] * samples[i]; cnt++; }
    return [acc, cnt];
  };
  const tot = tl.map(power).reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
  const rms = ([acc, cnt]) => Math.max(1e-9, Math.sqrt(acc / Math.max(1, cnt)));
  const takeGain = dbToGain(TARGET_RMS) / rms(tot);

  const byId = Object.fromEntries(tl.map((l, i) => [l.id, i]));
  const hpA = Math.exp(-2 * Math.PI * HPF / sr);
  rows.forEach((row) => {
    const k = byId[row.id];
    const l = tl[k];
    // cut points: PRE/POST around the line, never past the midpoint of the pause to a neighbour
    const lo = k > 0 ? (tl[k - 1].end + l.start) / 2 : 0;
    const hi = k + 1 < tl.length ? (l.end + tl[k + 1].start) / 2 : samples.length / sr;
    const c0 = Math.max(lo, l.start - PRE), c1 = Math.min(hi, l.end + POST);
    const raw = row.tight ? tightenPauses(samples, c0, c1, l, sr) :samples.subarray(Math.round(c0 * sr), Math.min(samples.length, Math.round(c1 * sr)));
    const clip = timeCompress(raw, row.rate, sr);
    const o0 = Math.round((row.at - (l.start - c0) / row.rate) * sr);
    // the decay never runs into the next boundary in the film
    const len = Math.min(clip.length, Math.round(row.limit * sr) - o0);
    const even = Math.min(dbToGain(LINE_EVEN), Math.max(dbToGain(-LINE_EVEN), dbToGain(TARGET_RMS) / (rms(power(l)) * takeGain)));
    const gain = takeGain * even;
    const fi = Math.round(FADE_IN * sr), fo = Math.round(FADE_OUT * sr);
    let x1 = 0, y1 = 0;                                   // one-pole high-pass state
    for (let j = 0; j < len; j++) {
      const o = o0 + j;
      const x = clip[j];
      const y = hpA * (y1 + x - x1); x1 = x; y1 = y;
      if (o < 0 || o >= n) continue;
      let g = gain;
      if (j < fi) g *= 0.5 - 0.5 * Math.cos(Math.PI * j / fi);
      if (j >= len - fo) g *= 0.5 - 0.5 * Math.cos(Math.PI * (len - j) / fo);
      voice[o] += y * g;
    }
    spans.push([row.at, row.end]);
    clips.push([o0 / sr, (o0 + len) / sr]);
  });
  return { voice, spans, clips, rows };
}
