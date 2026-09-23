// Burned-in subtitles of the narration, in the film's own pixel font (FONTS.sub, 5×7).
// Drawn over the finished frame on the base art grid (1 art px = outW / 320 output px, the hero's
// pixel at zoom 1), so camera zooms never scale the text and the frame keeps one pixel density.
// Each word pops in (a 1 px hop, a flash of white) the moment it is heard; the line stays a
// little after the last word and leaves with an ordered-dither dissolve, never across a cut.
// Timing comes from the narration take (src/audio/voiceover.js → lineWords); a film without
// narration has no subtitles. Environment-agnostic: setSubtitles(take) before the first frame.
import { FONTS, textWidth } from './engine/font.js';
import { BASE_W, BASE_H } from './engine/camera.js';
import { mix } from './engine/color.js';
import { SHOTS, CUES, BOTS, FPS } from './timeline.js';
import { RING } from './assets/brand.js';
import { lineWords } from './audio/voiceover.js';

const FONT = FONTS.sub;
const INK = 0xfff4e2;          // warm white
const EDGE = 0x100c1e;         // outline and drop shadow: the night's deepest navy
const HUSH = 0xa9a2cc;         // a whisper is set dimmer
const HOLD = 0.5;              // s the line stays after its last word
const HOP = 2 / FPS;           // a new word sits 1 px high (and flashes) for two frames
const FADE = 3 / FPS;          // dither dissolve at the end
const MARGIN = 9;              // art px from the frame edge to the cap line / descender line
const tint = (c) => mix(c, 0xffffff, 0.3);

// per-line look: bot names in the bot's color; the shout shakes; the whisper is dim; lines over
// the dawn and the v2 sticker move to the top (the DEADLINE sticker and the v2 note sit low);
// the sign-off takes the colors of the logo ring
const STYLE = {
  barista: { color: tint(BOTS.barista.color) },
  coder: { color: tint(BOTS.coder.color) },
  designer: { color: tint(BOTS.designer.color) },
  tester: { color: tint(BOTS.tester.color) },
  helpful3: { shake: true },
  silence: { color: HUSH },
  deployed: { top: true },
  v2: { top: true },
  outro: { rainbow: true },
};

// a line never survives a cut: shot boundaries and the hard cut to black
const CUTS = [...SHOTS.map((s) => s.end), CUES.cutToBlack].sort((a, b) => a - b);

let SUBS = [];

/** Build the subtitle track from a narration take (null: no subtitles). */
export function setSubtitles(take) {
  if (!take) { SUBS = []; return; }
  const rows = lineWords(take);
  SUBS = rows.map((r, k) => {
    const next = k + 1 < rows.length ? rows[k + 1].words[0].t : Infinity;
    const cut = CUTS.find((c) => c >= r.end - 1e-6) ?? Infinity;
    return { ...r, show: r.words[0].t, hide: Math.min(r.end + HOLD, next, cut), ...STYLE[r.id] };
  });
}
export const subtitleTrack = () => SUBS;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const hash = (n) => { n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; return (Math.imul(n, 0xc2b2ae35) ^ (n >>> 16)) >>> 0; };

/** Draw the subtitle due at film time t onto an output RGB frame (outW×outH). */
export function drawSubtitles(out, outW, outH, t) {
  const sub = SUBS.find((s) => t >= s.show && t < s.hide);
  if (!sub) return;
  const s = outW / BASE_W;                       // output px per art px
  const artH = Math.round(outH / s);

  // layout in art px: the whole line is centred once, so words never shift as they appear
  const width = textWidth(FONT, sub.text);
  let x = Math.round((BASE_W - width) / 2);
  const y = sub.top ? MARGIN : Math.min(BASE_H, artH) - MARGIN - FONT.capH - 2;
  let dx = 0, dy = 0;
  if (sub.shake && t < sub.end) {
    const h = hash(Math.floor(t * FPS));
    dx = (h % 3) - 1; dy = ((h >> 4) % 3) - 1;
  }

  // fill layer: every heard word, letter by letter
  const fill = new Map();                        // "x,y" → color
  let letter = 0;
  for (const w of sub.words) {
    const age = t - w.t;
    if (age >= 0) {
      const hop = age < HOP ? 1 : 0;
      let cx = x;
      for (const ch of w.text) {
        const g = FONT.glyphs[ch] || FONT.glyphs[ch.toLowerCase()] || FONT.glyphs['?'];
        let c = sub.rainbow ? tint(RING[letter % RING.length]) : sub.color ?? INK;
        if (hop) c = mix(c, 0xffffff, 0.6);
        for (let j = 0; j < g.rows.length; j++) {
          for (let i = 0; i < g.rows[j].length; i++) {
            if (g.rows[j][i] === '#') fill.set(`${cx + i + dx},${y + j + g.dy - hop + dy}`, c);
          }
        }
        cx += g.w + 1;
        letter++;
      }
    }
    x += textWidth(FONT, w.text) + textWidth(FONT, ' ') + 2;
  }

  // outline (8-neighbourhood) and a drop shadow one pixel lower, under the fill
  const px = new Map();
  for (const key of fill.keys()) {
    const [fx, fy] = key.split(',').map(Number);
    for (let j = -1; j <= 2; j++) for (let i = -1; i <= 1; i++) px.set(`${fx + i},${fy + j}`, EDGE);
  }
  for (const [key, c] of fill) px.set(key, c);

  // dissolve: pixels drop out in Bayer order over the last FADE seconds
  const keep = Math.min(1, (sub.hide - t) / FADE);
  for (const [key, c] of px) {
    const [ax, ay] = key.split(',').map(Number);
    if (keep < 1 && (BAYER[(ay & 3) * 4 + (ax & 3)] + 0.5) / 16 >= keep) continue;
    const X0 = Math.max(0, Math.round(ax * s)), X1 = Math.min(outW, Math.round((ax + 1) * s));
    const Y0 = Math.max(0, Math.round(ay * s)), Y1 = Math.min(outH, Math.round((ay + 1) * s));
    const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    for (let Y = Y0; Y < Y1; Y++) {
      for (let X = X0; X < X1; X++) { const o = (Y * outW + X) * 3; out[o] = r; out[o + 1] = g; out[o + 2] = b; }
    }
  }
}
