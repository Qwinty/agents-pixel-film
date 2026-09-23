// Render worker: receives { id, t, w, h } and posts back { id, buf } (transferred RGB frame).
import { parentPort } from 'node:worker_threads';
import { loadAssets } from '../src/assets/load-node.js';
import { renderFrameAt } from '../src/film.js';

loadAssets();
parentPort.on('message', (m) => {
  if (m === 'exit') process.exit(0);
  try {
    const buf = renderFrameAt(m.t, m.w, m.h);
    parentPort.postMessage({ id: m.id, buf }, [buf.buffer]);
  } catch (e) {
    parentPort.postMessage({ id: m.id, error: String(e && e.stack || e) });
  }
});
