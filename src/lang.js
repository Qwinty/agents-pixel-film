// Film language. English is the main version, Russian the alternative. In the picture only the
// word on the deadline stickers changes; the narration comes from voice/<lang>/ (src/narration.js).
// Environment-agnostic: render workers call setLang() before their first frame.
export const LANGS = ['en', 'ru'];
export const DEFAULT_LANG = 'en';

const STRINGS = {
  en: { deadline: 'DEADLINE' },
  ru: { deadline: 'ДЕДЛАЙН' },
};

let current = DEFAULT_LANG;

export function setLang(lang) {
  if (!LANGS.includes(lang)) throw new Error(`unknown language "${lang}" (expected ${LANGS.join(' | ')})`);
  current = lang;
}
export const getLang = () => current;

/** On-screen word in the current language. */
export const tr = (key) => STRINGS[current][key];
