// Renders film frames in the browser with the exact same code as the MP4 build.
import { loadAssets } from './assets.js';
import { renderFrame } from '../src/film.js';

const ready = loadAssets();
self.onmessage = async (e) => {
  const { n, w, h } = e.data;
  await ready;
  const rgb = renderFrame(n, w, h);
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    rgba[j] = rgb[i]; rgba[j + 1] = rgb[i + 1]; rgba[j + 2] = rgb[i + 2]; rgba[j + 3] = 255;
  }
  self.postMessage({ n, w, h, rgba }, [rgba.buffer]);
};
