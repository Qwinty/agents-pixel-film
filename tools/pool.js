// A small worker_threads pool: render(t, w, h) → Promise<Uint8Array RGB>. Frames are independent,
// so any number render in parallel and in any order. `lang` picks the on-screen language,
// `subs` burns in that language's narration subtitles.
import { Worker } from 'node:worker_threads';
import os from 'node:os';
import { DEFAULT_LANG } from '../src/lang.js';

export function createPool(n = Math.max(1, os.cpus().length - 1), { lang = DEFAULT_LANG, subs = false } = {}) {
  const url = new URL('./worker.js', import.meta.url);
  const workers = [];
  const idle = [];
  const queue = [];
  const pending = new Map();
  let nextId = 0;
  const pump = () => {
    while (idle.length && queue.length) {
      const w = idle.pop();
      const job = queue.shift();
      pending.set(job.id, { ...job, w });
      w.postMessage({ id: job.id, t: job.t, w: job.W, h: job.H });
    }
  };
  for (let i = 0; i < n; i++) {
    const w = new Worker(url, { workerData: { lang, subs } });
    w.on('message', (m) => {
      const job = pending.get(m.id);
      pending.delete(m.id);
      idle.push(w);
      if (m.error) job.reject(new Error(m.error));
      else job.resolve(m.buf);
      pump();
    });
    w.on('error', (e) => { for (const j of pending.values()) j.reject(e); });
    workers.push(w);
    idle.push(w);
  }
  return {
    size: n,
    render(t, W = 1920, H = 1080) {
      return new Promise((resolve, reject) => { queue.push({ id: nextId++, t, W, H, resolve, reject }); pump(); });
    },
    async close() { for (const w of workers) w.postMessage('exit'); await Promise.all(workers.map((w) => new Promise((r) => w.once('exit', r)))); },
  };
}
