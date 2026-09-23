// The film: global time → shot → lit art image → camera → output frame (+ subtitles).
// Environment-agnostic (no Node APIs): assets must be loaded before the first render
// (Node: src/assets/load-node.js, browser: player/).
import { shotAt, frameTime, FRAMES, FPS, DURATION } from './timeline.js';
import { shoot } from './engine/camera.js';
import { SCENES } from './scenes/index.js';
import { drawSubtitles } from './subtitles.js';

export { FRAMES, FPS, DURATION, frameTime };

/** Render the art-space image of the film at global time t. */
export function renderArt(t) {
  const shot = shotAt(t);
  const mod = SCENES[shot.key];
  const r = mod.render(t, shot);
  return { ...r, shot, cam: r.cam ?? { x: r.w / 2, y: r.h / 2, zoom: 1 } };
}

/** Output frame (Uint8Array RGB, outW×outH) at global time t. */
export function renderFrameAt(t, outW = 1920, outH = 1080, out = null) {
  const r = renderArt(t);
  out = shoot(r.img, r.w, r.h, r.cam, outW, outH, out);
  drawSubtitles(out, outW, outH, t);             // no-op unless setSubtitles() got a take
  return out;
}

/** Output frame n (0-based, sampled at the frame centre). */
export function renderFrame(n, outW = 1920, outH = 1080, out = null) {
  return renderFrameAt(frameTime(n), outW, outH, out);
}
