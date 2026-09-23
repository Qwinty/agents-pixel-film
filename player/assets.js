// Browser-side asset loading (same files as src/assets/load-node.js: only footage/character and
// footage/brand). Works in the page and in module workers (OffscreenCanvas).
import { initHero } from '../src/assets/hero.js';
import { initBrand } from '../src/assets/brand.js';

const base = new URL('../', import.meta.url);

async function png(path) {
  const blob = await (await fetch(new URL(path, base))).blob();
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  const { data } = g.getImageData(0, 0, bmp.width, bmp.height);
  return { width: bmp.width, height: bmp.height, data: new Uint8Array(data.buffer) };
}

let loaded = null;
export function loadAssets() {
  if (!loaded) loaded = (async () => {
    const [sprite, palette, qr, eye] = await Promise.all([
      png('footage/character/Char_sprite_24x45.png'),
      fetch(new URL('footage/character/palette.json', base)).then((r) => r.json()),
      png('footage/brand/qr-code.png'),
      png('footage/brand/Eye_Final_Transparent.png'),
    ]);
    initHero(sprite.data, sprite.width, sprite.height, palette);
    initBrand({ qr, eye });
  })();
  return loaded;
}
