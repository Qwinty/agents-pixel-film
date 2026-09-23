// Shot 2 (bars 2–3, 1.875–5.625) — Enter on the downbeat: the finger slams the key, the screen
// flashes white. Pixels stream out of the terminal and assemble into the four bots, one every two
// beats (stream → pop). On its pop each bot flashes its own colour and "sings" its note (a ring and
// a ♪ in its colour) — the setup paid off in the dark. Camera: pulls back to a medium shot.
import { storyState } from '../story.js';
import { composeRoom, lightRoom, camClamp, camKeys, hit, prog, assemble, W, H, CUES, SEATED_ARMS, BEAT } from './common.js';
import { drawBot } from '../assets/bots.js';
import { SPAWN_X, FLOOR_Y } from './blocking.js';
import { popState, popNote, SCREEN_SRC } from './intro_lib.js';
import { BOTS, SPAWN_ORDER } from '../timeline.js';
import { mix } from '../engine/color.js';
import { ease } from '../engine/util.js';

const S = CUES.spawn;

export function render(t) {
  const st = storyState(t);
  const tE = CUES.enter;
  // the Enter slam: key down for ~5 frames, then the hand bounces up and settles back to rest
  st.enterDown = t < tE + 0.16 ? 1 : 0;
  const flashE = hit(t, tE, 0.32, 1.5);
  st.screen = { ...st.screen, flashAmt: flashE };
  let arms;
  if (t < tE + 0.16) arms = SEATED_ARMS.enter(0);
  else if (t < tE + BEAT) arms = SEATED_ARMS.enter(2 + 2 * ease.outCubic(prog(t, tE + 0.16, tE + 0.3)));
  else arms = SEATED_ARMS.rest;

  // which bot is the newest / being streamed → the hero's eyes follow the pixels down to it
  let newest = -1;
  for (let k = 0; k < 4; k++) if (t >= S.stream[k]) newest = k;
  const tx = newest >= 0 ? SPAWN_X[SPAWN_ORDER[newest]] : 170;
  let eyes = t < tE + 0.3 ? 'wide' : 'round';
  if (t >= S.pop[3] + 0.25) eyes = 'normal';
  const lookX = tx < 128 ? -1 : tx > 150 ? 1 : 0;
  const lookY = t < tE + 0.3 ? 0 : 1;

  // bots that have popped (drawn as real sprites), with pop reaction + an idle bob on the beat
  const bots = [];
  SPAWN_ORDER.forEach((name, k) => {
    if (t < S.pop[k]) return;
    const ps = popState(t, S.pop[k]);
    const bob = Math.floor((t - S.pop[k]) / BEAT) % 2 === 0 ? 0 : 1;
    const look = t > S.pop[k] + 0.5 && newest > k ? (SPAWN_X[SPAWN_ORDER[newest]] > SPAWN_X[name] ? 1 : -1) : 0;
    bots.push({ name, x: SPAWN_X[name], y: FLOOR_Y - (ps.squash === 0 ? bob * 0 : 0), ...ps, lookX: look, steam: name === 'barista', t });
  });

  const { art, ctx } = composeRoom(st, {
    hero: { eyes, lookX, lookY, ...arms },
    bots,
    fx: (a, c) => {
      // pixel streams assembling the next bots
      SPAWN_ORDER.forEach((name, k) => {
        const k01 = (t - S.stream[k]) / (S.pop[k] - S.stream[k]);
        if (k01 > 0 && k01 < 1) {
          assemble(a, (tmp) => drawBot(name, tmp, SPAWN_X[name], FLOOR_Y, { t }), k01, SCREEN_SRC, { color: mix(BOTS[name].color, 0xffffff, 0.3), seed: 11 + k, arc: 10 });
        }
        if (t >= S.pop[k] && c.bots[name]) popNote(a, t, S.pop[k], name, c.bots[name].top, c.bots[name].center);
      });
    },
  });
  const img = lightRoom(art, ctx, {
    flash: flashE * 0.55,
    flashColor: 0xdff4ff,
    lights: [{ x: 168, y: 112, r: 52, ry: 40, color: 0x8ec8ff, i: 0.4, pow: 1.2 }],
  });
  const cam = camKeys(t, [
    [tE, { x: 170, y: 113, zoom: 2.5 }],
    [S.pop[0] - 0.05, { x: 166, y: 128, zoom: 1.92 }, ease.outCubic],
    [S.pop[3] + 0.3, { x: 162, y: 127, zoom: 1.74 }, ease.inOutQuad],
    [CUES.salute, { x: 162, y: 127, zoom: 1.72 }, ease.linear],
  ]);
  return { img, w: W, h: H, cam: camClamp(cam) };
}
