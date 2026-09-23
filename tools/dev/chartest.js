import { Art } from '../../src/engine/art.js';
import { light } from '../../src/engine/light.js';
import { shoot } from '../../src/engine/camera.js';
import { writePNG } from '../../src/engine/png.js';
import { loadAssets } from '../../src/assets/load-node.js';
import { drawHero, ARMS } from '../../src/assets/hero.js';
import { drawCoder, drawBarista, drawTester, drawDesigner } from '../../src/assets/bots.js';

loadAssets();
const art = new Art(320, 180, 0x9aa6b8);
// row 1: hero poses
const Y1 = 60;
drawHero(art, 16, Y1, {});
drawHero(art, 44, Y1, { eyes: 'blink' });
drawHero(art, 72, Y1, { eyes: 'round' });
drawHero(art, 100, Y1, { eyes: 'normal', lookX: 1 });
drawHero(art, 132, Y1, { far: ARMS.pointRight });
drawHero(art, 172, Y1, { near: ARMS.pointLeft });
drawHero(art, 204, Y1, { near: { a: -Math.PI / 2 - 0.5, len: 8, hand: 'baton' }, far: { a: -0.6, len: 8, hand: 'open' } });
drawHero(art, 236, Y1, { back: true });
drawHero(art, 264, Y1, { legs: 'walkA' });
drawHero(art, 292, Y1, { paint: { color: 0xff5fc8, amount: 0.5, seed: 3 } });
// row 2: bots
const Y2 = 110;
drawBarista(art, 20, Y2, { t: 0 });
drawCoder(art, 50, Y2, { t: 0 });
drawDesigner(art, 80, Y2, { t: 0 });
drawTester(art, 106, Y2, { t: 0 });
drawBarista(art, 140, Y2, { t: 0, tilt: 1, steam: true });
drawCoder(art, 170, Y2, { t: 0.1, pose: 'type', face: 'code' });
drawDesigner(art, 200, Y2, { t: 0, brush: 1.3, paint: 0xff5fc8 });
drawTester(art, 226, Y2, { t: 0, hammer: 1.6 });
drawCoder(art, 256, Y2, { t: 0, pose: 'salute' });
drawBarista(art, 290, Y2, { t: 0, flash: 0.8 });
// row 3: back views + glow eyes on dark
art.rect(0, 120, 320, 60, 0x10131c);
const Y3 = 170;
drawBarista(art, 20, Y3, { back: true });
drawCoder(art, 50, Y3, { back: true });
drawDesigner(art, 80, Y3, { back: true });
drawTester(art, 106, Y3, { back: true });
drawBarista(art, 150, Y3, { glow: true });
drawCoder(art, 180, Y3, { glow: true });
drawDesigner(art, 210, Y3, { glow: true });
drawTester(art, 236, Y3, { glow: true });
drawHero(art, 280, Y3, { eyes: 'idea' });
const img = light(art, { ambient: [1, 1, 1], glow: { strength: 0.5, radius: 4 } });
const out = shoot(img, 320, 180, { x: 160, y: 90, zoom: 1 }, 1920, 1080);
writePNG('out/dev/chars.png', 1920, 1080, out);
for (const [i, [x, y]] of [[80, 40], [240, 40], [80, 95], [240, 95], [80, 150], [240, 150]].entries()) {
  writePNG(`out/dev/chars_z${i}.png`, 1920, 1080, shoot(img, 320, 180, { x, y, zoom: 2 }, 1920, 1080));
}
