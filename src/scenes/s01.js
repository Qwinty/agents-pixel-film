// Shot 1 (bar 1, 0.000–1.875) — the hook. Cold open, close: the hero's face in the monitor light,
// `> spawn agents_` with a blinking cursor, the ДЕДЛАЙН 06:00 sticker, clock 02:00.
// The finger rises over Enter, the eyes flick to the deadline, the finger pulls up (anticipation)
// — Enter lands on the downbeat of bar 2 (shot 2). Camera: static with a slight push-in.
import { storyState } from '../story.js';
import { composeRoom, lightRoom, camClamp, camKeys, prog, W, H, CUES, SEATED_ARMS } from './common.js';
import { hash, ease } from '../engine/util.js';

const C = CUES.hook;

export function render(t) {
  const st = storyState(t);
  // finger: resting → hovering over Enter (fingerRise) → pulled up high (fingerLift), trembling
  let lift = 0;
  if (t >= C.fingerRise) lift = 3 * ease.outBack(prog(t, C.fingerRise, C.fingerRise + 0.18));
  if (t >= C.fingerLift) lift = 3 + 4 * ease.outCubic(prog(t, C.fingerLift, C.fingerLift + 0.16));
  if (t >= C.fingerLift + 0.2) lift += hash(Math.floor(t * 15), 3) > 0.5 ? 1 : 0; // tension tremble
  const arms = t < C.fingerRise ? SEATED_ARMS.rest : SEATED_ARMS.enter(lift);
  // eyes: on the screen → blink → flick to the deadline sticker → down to the Enter key
  let eyes = 'normal', lookX = 1, lookY = 0;
  if (t >= C.blink && t < C.blink + 0.1) eyes = 'blink';
  if (t >= C.lookSticker) { lookX = 1; lookY = -1; }
  if (t >= C.lookSticker + 0.3) { lookX = 0; lookY = 1; }
  if (t >= C.fingerLift) eyes = 'half'; // determined squint before the slam
  // the sticker's loose corner flutters when he looks at it
  const { art, ctx } = composeRoom(st, {
    hero: { eyes, lookX, lookY, ...arms },
  });
  const img = lightRoom(art, ctx, {
    // a soft key from the monitor on the hero's face
    lights: [
      { x: 168, y: 112, r: 52, ry: 40, color: 0x8ec8ff, i: 0.45, pow: 1.2 },
      { x: 168, y: 84, r: 34, ry: 18, color: 0xffe6b0, i: 0.6, pow: 1.1 }, // warm spill on the deadline
    ],
  });
  const cam = camKeys(t, [
    [0, { x: 174, y: 110, zoom: 2.2 }],
    [C.fingerLift, { x: 172, y: 111, zoom: 2.34 }, ease.inOutQuad],
    [CUES.enter, { x: 170, y: 113, zoom: 2.5 }, ease.inQuad],
  ]);
  return { img, w: W, h: H, cam: camClamp(cam) };
}
