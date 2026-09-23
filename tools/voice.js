// Fetch the narration from ElevenLabs: one take per narrated language (NARRATOR.voices), all lines
// read in one go (so the narrator keeps one voice and one arc), then word timestamps for it from
// ElevenLabs forced alignment (the v3 model's own character timestamps drift by up to half a second).
// The take is cached in voice/<lang>/ (take.mp3 + take.json) and committed, so building the film
// needs no API key. A take is fetched again only when its text, voice or settings change (or with
// --force); a cached take is only re-cut (line bounds found again from its words and audio), free.
// v3 now and then skips a line (most often the last one): a take where any line got no time in
// the alignment is thrown away and asked for again with the next seed, up to TRIES times.
//
//   node tools/voice.js                 every narrated language
//   node tools/voice.js en --force      one language, ignore the cache
//   node tools/voice.js en --voice <voiceId> --dir voice-audition/laura
//                                       try another voice without touching voice/ (→ <dir>/<lang>/);
//                                       later runs on that <dir> keep its voice without --voice
//
// Key: ELEVENLABS_API_KEY from the environment or from .env in the repo root.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from '../src/assets/load-node.js';
import { NARRATOR, NARRATED, LINES, lineScript } from '../src/narration.js';
import { locateLines, placementReport } from '../src/audio/voiceover.js';
import { decodeAudio } from '../src/audio/decode-node.js';

const FORMAT = 'mp3_44100_128';
const API = 'https://api.elevenlabs.io/v1';
const SR = 48000;
const TRIES = 3;
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const force = args.includes('--force');
const voiceOverride = opt('--voice');
const root = path.resolve(ROOT, opt('--dir') ?? 'voice');
const langs = args.filter((a, i) => !a.startsWith('--') && !['--voice', '--dir'].includes(args[i - 1]));
for (const l of langs) if (!NARRATED.includes(l)) { console.error(`"${l}" is not a narrated language (expected ${NARRATED.join(' | ')})`); process.exit(1); }

function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  const envFile = path.join(ROOT, '.env');
  if (!fs.existsSync(envFile)) return null;
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*ELEVENLABS_API_KEY\s*=\s*(.*?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  return null;
}
const key = apiKey();
const needKey = () => { if (!key) throw new Error('ELEVENLABS_API_KEY is not set (environment or .env)'); return key; };

/** take.json: readable metadata; one line per aligned word. */
function formatTake(take) {
  const { words, ...meta } = take;
  const ws = words.map((w) => `  ${JSON.stringify(w)}`).join(',\n');
  return JSON.stringify(meta, null, 1).replace(/\n}$/, `,\n "words": [\n${ws}\n ]\n}\n`);
}

/** Lines of the script that the take did not actually say (their words got no time). */
function skippedLines(words, script) {
  const out = [];
  let w = 0;
  for (const l of script) {
    const n = l.text.split(/\s+/).filter(Boolean).length;
    const ws = words.slice(w, w + n);
    w += n;
    if (ws.reduce((a, x) => a + (x.end - x.start), 0) < 0.08 * n) out.push(l.id);
  }
  return out;
}

/** Word timestamps of an audio file against its known text (ElevenLabs forced alignment). */
async function forcedAlign(file, text) {
  const fd = new FormData();
  fd.append('file', new Blob([fs.readFileSync(file)], { type: 'audio/mpeg' }), path.basename(file));
  fd.append('text', text);
  const res = await fetch(`${API}/forced-alignment`, { method: 'POST', headers: { 'xi-api-key': needKey() }, body: fd });
  if (!res.ok) throw new Error(`ElevenLabs forced alignment ${res.status}: ${await res.text()}`);
  const { words } = await res.json();
  return words.filter((w) => w.text.trim()).map((w) => ({ text: w.text, start: w.start, end: w.end }));
}

/** Display name of a voice id (a free API call); the id itself if the lookup fails. */
async function voiceName(id) {
  const res = await fetch(`${API}/voices/${id}`, { headers: { 'xi-api-key': needKey() } }).catch(() => null);
  return res?.ok ? (await res.json()).name.split(' - ')[0] : id;
}

async function fetchTake(lang) {
  const text = LINES.map((l) => lineScript(l, lang)).join(NARRATOR.joiner);      // with delivery tags
  const spoken = LINES.map((l) => l[lang]).join('\n');                            // what is actually said
  const dir = path.join(root, lang);
  const jsonFile = path.join(dir, 'take.json'), mp3File = path.join(dir, 'take.mp3');
  const script = LINES.map((l) => ({ id: l.id, text: l[lang], tag: l.tag }));
  let take = fs.existsSync(jsonFile) ? JSON.parse(fs.readFileSync(jsonFile, 'utf8')) : null;

  // the voice: --voice, else (outside voice/) the one the cached take was read by, else NARRATOR's
  const voice = voiceOverride ? { id: voiceOverride, name: take?.voiceId === voiceOverride ? take.voiceName : await voiceName(voiceOverride) }
    : opt('--dir') && take?.voiceId ? { id: take.voiceId, name: take.voiceName }
    : NARRATOR.voices[lang];
  const request = { text, model_id: NARRATOR.model, voice_settings: NARRATOR.settings };
  const hash = crypto.createHash('sha256').update(JSON.stringify({ request, seed: NARRATOR.seed, voice: voice.id, FORMAT })).digest('hex').slice(0, 16);

  if (force || !take || take.hash !== hash || !fs.existsSync(mp3File)) {
    fs.mkdirSync(dir, { recursive: true });
    for (let attempt = 0; ; attempt++) {
      const seed = NARRATOR.seed + attempt;
      console.log(`▸ ${lang}: requesting ${text.length} characters from ElevenLabs (${voice.name}, ${NARRATOR.model}, seed ${seed})…`);
      const res = await fetch(`${API}/text-to-speech/${voice.id}?output_format=${FORMAT}`, {
        method: 'POST', headers: { 'xi-api-key': needKey(), 'content-type': 'application/json' }, body: JSON.stringify({ ...request, seed }),
      });
      if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
      fs.writeFileSync(mp3File, Buffer.from(await res.arrayBuffer()));
      take = { lang, hash, voiceId: voice.id, voiceName: voice.name, model: NARRATOR.model, settings: NARRATOR.settings, seed, format: FORMAT, text, spoken };
      console.log('  aligning words…');
      take.words = await forcedAlign(mp3File, spoken);
      const skipped = skippedLines(take.words, script);
      if (!skipped.length) break;
      console.log(`  ! the take skipped ${skipped.join(', ')}`);
      if (attempt + 1 >= TRIES) throw new Error(`${lang}: every take skipped a line after ${TRIES} tries`);
    }
  } else {
    console.log(`▸ ${lang}: cached (${hash}, ${take.voiceName ?? take.voiceId}, seed ${take.seed})`);
  }
  if (!take.words || take.spoken !== spoken) {
    console.log('  aligning words…');
    take.words = await forcedAlign(mp3File, spoken);
    take.spoken = spoken;
  }
  delete take.alignment;
  take.lines = locateLines(take.words, script, decodeAudio(mp3File, SR), SR);
  fs.writeFileSync(jsonFile, formatTake(take));
  return take;
}

let bad = 0;
for (const lang of langs.length ? langs : NARRATED) {
  const take = await fetchTake(lang);
  const { rows, problems } = placementReport(take);
  for (const r of rows) {
    const notes = [r.at < r.cue - 1e-6 ? `${(r.at - r.cue).toFixed(2)} s early` : '', r.tight ? 'pauses tightened' : '', r.rate > 1 ? `×${r.rate.toFixed(2)} faster` : ''].filter(Boolean).join(', ');
    console.log(`   ${r.id.padEnd(10)} ${r.at.toFixed(2).padStart(6)}s  ${r.dur.toFixed(2)}s → ${r.end.toFixed(2).padStart(6)}s  ${r.text}${notes ? `  (${notes})` : ''}`);
  }
  for (const p of problems) console.log(`   ! ${p}`);
  bad += problems.length;
}
if (bad) process.exitCode = 1;
