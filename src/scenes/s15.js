// Shot 15 (bar 22, 39.375–41.250) — "Пинг!"
// Static wide: the team on the sill (backs to us) against the sunrise, the monitor below them.
// b(22,1) ping: the screen flashes, a yellow sticker "v2 · DEADLINE 08:00" slides up on it, rings pulse.
// b(22,2)..b(22,3) headTurn: one by one (tester → barista → coder → designer) the bots slowly turn
//   around and stare at the hero.
// b(22,3) heroEyes: the hero turns around too — round eyes, down at the screen, a bead of sweat.
// b(22,4) cutToBlack: hard cut to pure black (0,0,0) until b(23,1) — the score is silent there.
import { lightRoom, camClamp, hit, prog, ring, W, H, L, CUES, BEAT, OUT, FONTS, drawText, textWidth } from './common.js';
import { ease, clamp } from '../engine/util.js';
import { mix } from '../engine/color.js';
import { TAG_MONITOR } from '../assets/room.js';
import { sillScene, SILL } from './dawn_lib.js';
import { tr } from '../lang.js';

const T_P = CUES.ping, T_T = CUES.headTurn, T_E = CUES.heroEyes, T_B = CUES.cutToBlack;
const BLACK_FRAME = new Uint8Array(W * H * 3);
// turn order and start times across the beat b(22,2)..b(22,3)
const TURN = { tester: 0, barista: 0.26, coder: 0.52, designer: 0.78 };
const CAM = { x: 164, y: 77, zoom: 1.55 };

export function render(t, shot) {
  if (t >= T_B) return { img: BLACK_FRAME, w: W, h: H, cam: camClamp({ x: W / 2, y: H / 2, zoom: 1 }) };

  // the bots' turn: back → a beat of side-glance (front, eyes hard to one side, squashed) → full stare
  const bots = {};
  for (const [name, k] of Object.entries(TURN)) {
    const t0 = T_T + k * BEAT;
    const toHero = SILL.hero > SILL[name] ? 1 : -1;
    if (t < t0) { bots[name] = {}; continue; }
    const u = (t - t0) / 0.12;
    bots[name] = {
      back: false, lookX: toHero, eyes: 'normal', mouth: name === 'coder' ? undefined : 'none', squash: u < 1 ? 0.25 : 0,
      x: SILL[name] + (u < 1 ? toHero : 0), steam: false, face: undefined, glow: false,
    };
  }
  // the hero: frozen at the ping, turns around on heroEyes
  let hero = {};
  const jolt = hit(t, T_E, 0.16, 1);
  if (t >= T_E) hero = { back: false, eyes: 'round', lookX: 1, lookY: 1, y: SILL.heroY - Math.round(jolt * 2) };

  const pingFlash = hit(t, T_P, 0.2, 1.5);
  const { art, ctx, st } = sillScene(t, {
    hero,
    bots,
    trailFade: 0.8,
    // the room's built-in v2 note overflows the screen; we slap our own sticky note on instead
    st: (s) => { s.screen = { ...s.screen, flashAmt: pingFlash, v2: 0 }; },
    afterDesk: (a) => v2Sticker(a, t),
    fx: (a, c) => {
      const cx = NX + NW / 2, cy = NY + NH / 2; // the v2 sticker's centre
      ring(a, cx, cy, prog(t, T_P, T_P + 0.35), 0xffe066, 30);
      ring(a, cx, cy, prog(t, T_P + 0.12, T_P + 0.5), 0xfff2a8, 22);
      // "!" popping over the sticker's corner for a beat and a half
      if (t >= T_P + 0.03 && t < T_P + BEAT * 1.5) bang(a, L.monitor.x + L.monitor.w + 4, L.monitor.y + 6 - (t < T_P + 0.1 ? 2 : 0));
      // a bead of sweat slides down the hero's temple after he turns
      const sw = t - T_E - 0.12;
      if (sw > 0 && c.hero) {
        const [hx, hy] = c.hero.head;
        const sx = hx + 11, sy = hy - 3 + Math.min(4, Math.floor(sw * 10));
        a.emit(() => { a.put(sx, sy, 0xbfe8ff); a.put(sx, sy + 1, 0x8ec8ff); a.put(sx - 1, sy + 1, 0xdff4ff); a.put(sx, sy + 2, 0x6aa8e8); });
      }
    },
  });

  // warm dawn room (not backlit here: the stares have to read); the ping washes it in yellow
  const img = lightRoom(art, ctx, {
    ambient: [0.6, 0.5, 0.56],
    rig: { lamp: 0, windowLight: 0.5, monitorColor: pingFlash > 0 ? 0xffe066 : undefined, monitorLight: 1 + pingFlash },
    spriteLight: { floor: 0.6, keep: 0.6 },
    lights: [{ x: 139, y: 58, r: 110, ry: 80, color: 0xffb070, i: 0.35, pow: 1.5 }],
    flash: 0.1 * pingFlash, flashColor: 0xfff2a8,
  });
  return { img, w: W, h: H, cam: camClamp(CAM) };
}

// ---- the new sticky note, slapped onto the screen on the ping --------------------------------------
const NX = 176, NY = 101, NW = 50, NH = 20;
function v2Sticker(a, t) {
  if (t < T_P) return;
  const k = ease.outBack(clamp((t - T_P) / 0.14), 2.2);
  const ny = Math.round(NY + (1 - k) * 8);
  const white = t < T_P + 0.07;                         // one bright pop frame or two
  // self-lit like the screen it is stuck on, so it reads at once
  a.tagged(TAG_MONITOR, () => a.emit(() => {
    const c = white ? 0xffffff : 0xffe066;
    a.rect(NX - 1, ny - 1, NW + 2, NH + 2, OUT);
    a.rect(NX, ny, NW, NH, c);
    a.hline(NX, NX + NW - 1, ny, white ? 0xffffff : 0xfff2a8);
    a.rect(NX, ny + NH - 2, NW, 2, mix(c, 0xd8a820, 0.45));  // curled bottom edge
    a.put(NX + NW - 1, ny + NH - 1, OUT);
    a.rect(NX + 21, ny - 2, 9, 3, 0xd8e8f0); a.hline(NX + 21, NX + 29, ny - 2, 0xffffff); // tape
    if (white) return;
    drawText(a, FONTS.tiny, 'v2', NX + 3, ny + 4, 0x2a3a6a);
    a.put(NX + 11, ny + 6, 0x2a2a3a);
    drawText(a, FONTS.tiny, tr('deadline'), NX + 14, ny + 4, 0xc0282a);
    const tw = textWidth(FONTS.big, '08:00');
    drawText(a, FONTS.big, '08:00', NX + Math.round((NW - tw) / 2), ny + 11, 0xc0282a);
  }));
}

/** A chunky outlined "!" (2 px wide), self-lit. */
function bang(a, x, y) {
  a.emit(() => {
    a.rect(x - 1, y - 1, 4, 7, OUT); a.rect(x - 1, y + 7, 4, 4, OUT);
    a.rect(x, y, 2, 5, 0xffe066); a.rect(x, y + 8, 2, 2, 0xffe066);
  });
}
