// Placeholder shot: the room in its story state, hero at the desk, bots on the floor (after spawn).
// Used by shots that are not implemented yet so the whole film always builds end to end.
import { storyState } from '../story.js';
import { composeRoom, lightRoom, camClamp, blink, SEATED_ARMS, W, H, L, CUES } from './common.js';
import { FONTS, drawText } from '../engine/font.js';

export function stubRender(t, shot) {
  const st = storyState(t);
  const spawned = t >= CUES.spawn.pop[3];
  const Y = L.floorLineY;
  const bots = spawned && st.power !== 0 ? [
    { name: 'barista', x: 118, y: Y }, { name: 'coder', x: 148, y: Y },
    { name: 'designer', x: 178, y: Y }, { name: 'tester', x: 206, y: Y },
  ] : [];
  const { art, ctx } = composeRoom(st, {
    hero: { eyes: blink(t), lookX: 1, ...SEATED_ARMS.rest },
    bots,
    fx: (a) => a.emit(() => drawText(a, FONTS.tiny, 'SHOT ' + shot.id, 4, 170, 0xff5a5a)),
  });
  const img = lightRoom(art, ctx);
  return { img, w: W, h: H, cam: camClamp({ x: 160, y: 90, zoom: 1 }) };
}
