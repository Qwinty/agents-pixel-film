// «Агенты» — browser player. Frames are rendered live by a pool of module workers running the
// exact same scene code as the MP4 build (src/film.js); the soundtrack is synthesized in a worker
// by the same score (src/audio/score.js). Playback is clocked by the audio.
import { FRAMES, FPS, DURATION, shotAt, frameTime } from '../src/timeline.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#screen'), g = canvas.getContext('2d');
const playBtn = $('#play'), seek = $('#seek'), timeEl = $('#time'), shotEl = $('#shot'), statusEl = $('#status'), resSel = $('#res');

let RW = 960, RH = 540, shown = -1;
const setRes = (v) => { [RW, RH] = v.split('x').map(Number); canvas.width = RW; canvas.height = RH; cache.clear(); pending.clear(); shown = -1; };

// ---- frame workers ------------------------------------------------------------------------------
const N = Math.max(2, Math.min(12, (navigator.hardwareConcurrency || 4) - 1));
const AHEAD = 45;
const cache = new Map();     // frame → ImageData
const pending = new Set();
const idle = [];
for (let i = 0; i < N; i++) {
  const w = new Worker(new URL('./frame-worker.js', import.meta.url), { type: 'module' });
  w.onmessage = (e) => {
    const { n, w: fw, h: fh, rgba } = e.data;
    pending.delete(n);
    if (fw === RW && fh === RH) cache.set(n, new ImageData(rgba, fw, fh));
    idle.push(w);
    pump();
  };
  w.onerror = (e) => { statusEl.textContent = 'render error: ' + e.message; console.error('frame worker', e.message, e.filename, e.lineno); };
  idle.push(w);
}
globalThis.__player = { cache, pending, idle, get frame() { return currentFrame(); } };
function pump() {
  const cur = currentFrame();
  for (let k = 0; k < AHEAD && idle.length; k++) {
    const n = cur + k;
    if (n >= FRAMES) break;
    if (cache.has(n) || pending.has(n)) continue;
    pending.add(n);
    idle.pop().postMessage({ n, w: RW, h: RH });
  }
  for (const n of cache.keys()) if (n < cur - 3 || n > cur + AHEAD + 15) cache.delete(n);
}

// ---- audio ------------------------------------------------------------------------------------------
const actx = new AudioContext();
let buffer = null, source = null, startedAt = 0, offset = 0, playing = false;
statusEl.textContent = 'синтез звука…';
const aw = new Worker(new URL('./audio-worker.js', import.meta.url), { type: 'module' });
aw.onmessage = (e) => {
  const { left, right } = e.data;
  buffer = actx.createBuffer(2, left.length, actx.sampleRate);
  buffer.copyToChannel(left, 0); buffer.copyToChannel(right, 1);
  statusEl.textContent = `звук готов · ${N} потоков рендера`;
  playBtn.disabled = false;
};
aw.postMessage({ sampleRate: actx.sampleRate });

// ---- transport ----------------------------------------------------------------------------------
function now() { return playing ? Math.min(DURATION, actx.currentTime - startedAt) : offset; }
function currentFrame() { return Math.min(FRAMES - 1, Math.max(0, Math.floor(now() * FPS))); }
function play() {
  if (!buffer) return;
  if (offset >= DURATION - 0.05) offset = 0;
  actx.resume();
  source = actx.createBufferSource();
  source.buffer = buffer;
  source.connect(actx.destination);
  source.start(0, offset);
  startedAt = actx.currentTime - offset;
  playing = true;
  source.onended = () => { if (playing && now() >= DURATION - 0.05) { pause(); offset = DURATION; } };
  playBtn.textContent = '❚❚';
}
function pause() {
  if (!playing) return;
  offset = now();
  playing = false;
  try { source.stop(); } catch {}
  playBtn.textContent = '▶';
}
playBtn.onclick = () => (playing ? pause() : play());
seek.max = String(FRAMES - 1);
seek.oninput = () => { const was = playing; pause(); offset = frameTime(Number(seek.value)) - 0.5 / FPS; if (was) play(); pump(); };
resSel.onchange = () => { setRes(resSel.value); pump(); };
addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(); }
  if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
    pause();
    offset = Math.max(0, Math.min(DURATION - 1 / FPS, offset + (e.code === 'ArrowRight' ? 1 : -1) / FPS));
    pump();
  }
});

// ---- display loop -------------------------------------------------------------------------------
function tick() {
  const n = currentFrame();
  pump();
  // show the newest ready frame ≤ n (drop frames rather than stall the audio)
  let k = n;
  while (k >= 0 && k > n - 6 && !cache.has(k)) k--;
  if (cache.has(k) && k !== shown) { g.putImageData(cache.get(k), 0, 0); shown = k; }
  const t = now();
  timeEl.textContent = `${t.toFixed(2)} / ${DURATION.toFixed(2)} s`;
  const s = shotAt(t);
  shotEl.textContent = `${s.id}. ${s.title}`;
  if (playing) seek.value = String(n);
  requestAnimationFrame(tick);
}
setRes(resSel.value);
setInterval(pump, 100); // keep prefetching even when rAF is throttled (background tab)
requestAnimationFrame(tick);
globalThis.__player.tick = tick;
