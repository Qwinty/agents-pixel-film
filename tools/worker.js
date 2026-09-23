// Render worker: receives { id, t, w, h } and posts back { id, buf } (transferred RGB frame).
import { parentPort, workerData } from 'node:worker_threads';
import { loadAssets, loadSubtitles } from '../src/assets/load-node.js';
import { renderFrameAt } from '../src/film.js';
import { setLang, DEFAULT_LANG } from '../src/lang.js';

loadAssets();
setLang(workerData?.lang ?? DEFAULT_LANG);
if (workerData?.subs) loadSubtitles(workerData.lang ?? DEFAULT_LANG);
parentPort.on('message', (m) => {
  if (m === 'exit') process.exit(0);
  try {
    const buf = renderFrameAt(m.t, m.w, m.h);
    parentPort.postMessage({ id: m.id, buf }, [buf.buffer]);
  } catch (e) {
    parentPort.postMessage({ id: m.id, error: String(e && e.stack || e) });
  }
});
