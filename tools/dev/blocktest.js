import { loadAssets } from '../../src/assets/load-node.js';
import { storyState } from '../../src/story.js';
import { composeRoom, lightRoom, W, H } from '../../src/scenes/common.js';
import { STATION, HERO_STAND } from '../../src/scenes/blocking.js';
import { shoot } from '../../src/engine/camera.js';
import { writePNG } from '../../src/engine/png.js';
loadAssets();
for (const [name, t] of [['conduct', 27.0], ['dark', 22.0], ['chaos', 16.0]]) {
  const st = storyState(t);
  const glow = st.power === 0;
  const { art, ctx } = composeRoom(st, {
    hero: { layer: 'floor', ...HERO_STAND, eyes: 'normal', lookX: 1,
      far: { a: -1.1, len: 8, a2: -1.4, len2: 5, hand: 'baton', batonA: -1.9 }, near: { a: Math.PI / 2 + 0.3, len: 8, hand: 'open' } },
    bots: Object.entries(STATION).map(([n, p]) => ({ name: n, ...p, glow, eyes: 'normal' })),
  });
  const img = lightRoom(art, ctx);
  writePNG(`out/dev/block_${name}.png`, 1920, 1080, shoot(img, W, H, { x: 160, y: 90, zoom: 1 }));
}
console.log('ok');
