// Helpers shared by shots 1–3 (spawn and salute).
import { note, ring, hit, prog, BOTS, L } from './common.js';
import { ease, clamp } from '../engine/util.js';

/** Bot state right after its pop: colour flash, landing squash, surprised then normal eyes. */
export function popState(t, tPop) {
  const dt = t - tPop;
  return {
    flash: hit(t, tPop, 0.34, 1.6),
    squash: dt < 0.28 ? Math.sin(clamp(dt / 0.28) * Math.PI) * 0.55 * (1 - dt / 0.28) + (dt < 0.06 ? 0.4 : 0) : 0,
    eyes: dt < 0.22 ? 'surprise' : 'normal',
  };
}

/** The visual of a bot's note: a ring on the pop and a ♪ rising from its head, fading. */
export function popNote(art, t, tPop, name, top, center) {
  const col = BOTS[name].color;
  const dt = t - tPop;
  if (dt < 0) return;
  ring(art, center[0], center[1], prog(t, tPop, tPop + 0.36), col, 16);
  if (dt < 0.9) {
    const rise = ease.outCubic(clamp(dt / 0.9)) * 12;
    const a = dt < 0.6 ? 1 : 1 - (dt - 0.6) / 0.3;
    note(art, top[0] + 3, top[1] - 7 - rise, col, a);
  }
}

/** The screen rectangle (source of the flying pixels). */
export const SCREEN_SRC = { x: L.screen.x + 4, y: L.screen.y + 8, w: L.screen.w - 8, h: L.screen.h - 12 };
