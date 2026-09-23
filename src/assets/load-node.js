// Node-side asset loading: only files from footage/character and footage/brand are ever read,
// plus the narration take (voice/<lang>/take.json) for the subtitles.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPNG } from '../engine/png.js';
import { initHero } from './hero.js';
import { initBrand } from './brand.js';
import { NARRATED } from '../narration.js';
import { setSubtitles } from '../subtitles.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let loaded = false;

export function loadAssets() {
  if (loaded) return;
  const sprite = readPNG(path.join(ROOT, 'footage/character/Char_sprite_24x45.png'));
  const palette = JSON.parse(fs.readFileSync(path.join(ROOT, 'footage/character/palette.json'), 'utf8'));
  initHero(sprite.data, sprite.width, sprite.height, palette);
  const qr = readPNG(path.join(ROOT, 'footage/brand/qr-code.png'));
  const eye = readPNG(path.join(ROOT, 'footage/brand/Eye_Final_Transparent.png'));
  initBrand({ qr, eye });
  loaded = true;
}

/** Subtitles for a film language: its narration take, if the language is narrated. */
export function loadSubtitles(lang) {
  setSubtitles(NARRATED.includes(lang) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'voice', lang, 'take.json'), 'utf8')) : null);
}

export { ROOT };
