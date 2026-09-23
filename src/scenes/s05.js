// Shot 5 (bar 6, 9.375–11.250) — BARISTA: the coffee river. Close-up on the rug.
//   b(6,1)   barista.mugLand — clonk: the mug (from shot 4) lands upright on the rug, empty
//   b(6,1.5) notice          — "!" — the barista sees the empty mug, hops over to it
//   b(6,2)   pour            — kettle tips, coffee streams into the mug (happy barista)
//   b(6,3)   overflow        — the mug overflows, splash — the barista panics but can't stop pouring
//   b(6,4)   river           — the puddle breaks away and runs across the floor toward the power strip;
//                              the camera follows it right (the tester by the strip sees it coming)
import { storyState, COFFEE as COFFEE0 } from '../story.js';
import {
  composeRoom, lightRoom, camClamp, camKeys, shake, hit, prog, blink,
  W, H, L, CUES, BEAT, b,
} from './common.js';
import { STATION, HERO_SEAT } from './blocking.js';
import { clamp, keys, ease, hash } from '../engine/util.js';
import { mix } from '../engine/color.js';
import { drawMug, drawRiver } from '../assets/room.js';
import { stream, droplets, dust, tink, bang, sweat, codeHeap, glyphSpray, wetGlints, HEAP_FINAL, OUT } from './chaos_lib.js';

const C = CUES.barista;
/** Coffee as painted in this close-up: a notch lighter than the story colour so it reads on the dark rug. */
const COFFEE = 0x94603a;
const T0 = b(6), T1 = b(7);
const MX = L.mugFloor.x, MY = L.mugFloor.y;
const BX0 = STATION.barista.x, BX1 = MX - 12;   // the barista hops next to the mug to pour

export function render(t) {
  const st = storyState(t);

  // ---- the mug: lands with a clonk and a tiny bounce, then fills and overflows ----------------
  const bounce = t < T0 + 0.2 ? Math.round(Math.abs(Math.sin((t - T0) / 0.2 * Math.PI)) * 2 * (1 - (t - T0) / 0.2)) : 0;
  const fill = t < C.pour + 0.1 ? 0 : t < C.overflow - 0.05 ? 1 : 1.2;
  st.mug = { ...st.mug, where: 'shot5' };

  // ---- barista --------------------------------------------------------------------------------
  let bx = BX0, by = STATION.barista.y, squash = 0, eyes = blink(t, 'normal', 5), lookX = 0, tilt = 0, mouth;
  // startled by the clonk
  squash += 0.35 * hit(t, T0, 0.18);
  if (t >= T0 + 0.05 && t < C.notice) { eyes = 'blink'; if (t > T0 + 0.12) eyes = 'normal'; lookX = 1; }
  if (t >= C.notice) {
    // "!" → hop to the mug
    lookX = 1;
    eyes = 'surprise'; mouth = 'o';
    squash += 0.4 * hit(t, C.notice, 0.14);
    const hop0 = C.notice + 0.1, hop1 = C.pour - 0.1;
    const u = prog(t, hop0, hop1);
    bx = BX0 + (BX1 - BX0) * ease.inOutQuad(u);
    by -= Math.round(Math.sin(u * Math.PI) * 5);
    if (u > 0 && u < 1) squash -= 0.35; else if (t >= hop1) squash += 0.3 * hit(t, hop1, 0.12);
  }
  if (t >= C.pour - 0.1) {
    // anticipation: lean back, then tip the kettle on the beat
    tilt = t < C.pour ? 0 : ease.outBack(prog(t, C.pour, C.pour + 0.1));
    eyes = 'happy'; mouth = undefined;
    squash += t < C.pour ? 0.25 : -0.2 * hit(t, C.pour, 0.15);
    if (t >= C.pour) squash += 0.08 * Math.sin((t - C.pour) * Math.PI * 2 / (BEAT / 2)); // glug glug
  }
  if (t >= C.overflow) {
    // panic: can't stop — the kettle is stuck tipped, the barista jitters
    eyes = t < C.river ? 'surprise' : 'dizzy';
    mouth = 'o';
    tilt = 1;
    squash = 0.25 * hit(t, C.overflow, 0.15) + 0.12 * Math.sin(t * 55);
    bx = BX1 + (hash(Math.floor(t * 30), 3) > 0.5 ? 1 : 0);
    lookX = t >= C.river + 0.08 ? 1 : 0;
  }
  const barista = { name: 'barista', x: Math.round(bx), y: by, squash, eyes, lookX, tilt, mouth, steam: t < C.pour, armsUp: t >= C.overflow };

  // ---- tester by the strip: sees the river coming (a setup for shot 7) ---------------------------
  const tester = { name: 'tester', ...STATION.tester, lookX: -1, eyes: t >= C.river + 0.3 ? 'surprise' : blink(t, 'normal', 7), squash: 0.3 * hit(t, C.river + 0.3, 0.15), hammer: -0.3 + Math.sin(t * 3.1) * 0.08 };

  const { art, ctx } = composeRoom(st, {
    hero: { ...HERO_SEAT, eyes: 'wide', lookX: 1, lookY: 1 },
    bots: [barista, tester],
    afterDesk: (a) => {
      // shot 4's heap of code on the desk evaporates (garbage-collected) in the first half beat
      const hk = 1 - ease.inQuad(prog(t, T0 + 0.08, C.notice + 0.12));
      if (hk > 0) codeHeap(a, t, { ...HEAP_FINAL, h: HEAP_FINAL.h * hk, wL: HEAP_FINAL.wL * (0.5 + 0.5 * hk), wR: HEAP_FINAL.wR * (0.5 + 0.5 * hk) });
      if (hk > 0 && hk < 1) glyphSpray(a, t, T0 + 0.08, C.notice + 0.12, { x0: 176, x1: 218, y0: 140 - HEAP_FINAL.h * hk, vx: [-5, 5], vy: [-40, -15], g: -20, rate: 70, life: 0.25, seed: 12 });
    },
    afterFloor: (a) => {
      if (st.river) {
        const pts = drawRiver(a, { ...st.river, color: COFFEE }, t);
        wetGlints(a, pts, t);
      }
      drawMug(a, MX, MY - bounce, { fill, liquid: COFFEE, t });
      // overflow: a dome of coffee over the rim, streams running down the mug's sides
      if (t >= C.overflow - 0.05) {
        const k = prog(t, C.overflow - 0.05, C.overflow + 0.15, ease.outQuad);
        const hi = mix(COFFEE, 0xffffff, 0.35), dk = mix(COFFEE, 0x000000, 0.3);
        a.hline(MX - 5, MX + 5, MY - 10, OUT);
        a.hline(MX - 4, MX + 4, MY - 10, COFFEE);
        a.hline(MX - 3, MX + 2, MY - 11, OUT);
        a.hline(MX - 2, MX + 1, MY - 11, COFFEE);
        a.put(MX - 2 + (Math.floor(t * 12) % 3), MY - 11, hi);
        for (const [sx, len] of [[MX - 5, 10], [MX - 2, 6], [MX + 1, 8], [MX + 5, 9]]) {
          const n = Math.round(len * k * (0.8 + 0.2 * Math.sin(t * 9 + sx)));
          for (let j = 0; j < n; j++) a.put(sx, MY - 9 + j, j === n - 1 ? hi : sx === MX + 5 ? dk : COFFEE);
        }
      }
    },
    fx: (a, c) => {
      // clonk: impact dust + little stars
      dust(a, MX, MY, t, T0, { n: 10, r: 9, life: 0.35 });
      tink(a, MX, MY - 6, hit(t, T0, 0.16), 0xfff6c0);
      // "!" over the barista
      const nk = t >= C.notice && t < C.pour ? ease.outBack(prog(t, C.notice, C.notice + 0.1)) : 0;
      const top = c.bots.barista?.top;
      if (top) bang(a, top[0] - 1, top[1] - 3, nk);
      // the pour: stream from the spout into the mug
      const sp = c.bots.barista?.spout;
      if (sp && t >= C.pour) {
        const wob = t >= C.overflow ? 1.3 : 0.7;
        stream(a, sp[0], sp[1], MX, MY - 9 - (fill > 1 ? 1 : 0), t, { color: COFFEE, w: t >= C.overflow ? 1.2 : 0.8, wob: wob * 0.6 });
        droplets(a, MX, MY - 9, t, C.pour + Math.floor((t - C.pour) / 0.12) * 0.12, { n: 3, seed: Math.floor((t - C.pour) / 0.12), speed: 16, life: 0.18, color: COFFEE, gravity: 160 });
      }
      // overflow splash, then a continuous trickle of splashes where the stream lands
      droplets(a, MX, MY - 11, t, C.overflow, { n: 26, seed: 9, speed: 58, life: 0.55, color: COFFEE, gravity: 260, spread: 2.9, floorY: MY + 1 });
      if (t >= C.overflow) sweat(a, c.bots.barista.top[0], c.bots.barista.top[1] + 6, t, { n: 2, seed: 3 });
      // the river's leading edge: a frothy bright lip as it runs
      if (t >= C.river - 0.05 && c.riverPts?.length) {
        const [ex, ey] = c.riverPts[c.riverPts.length - 1];
        const hi = mix(COFFEE, 0xffffff, 0.45);
        a.put(Math.round(ex) + 1, Math.round(ey), hi); a.put(Math.round(ex), Math.round(ey) - 1, hi);
        droplets(a, ex, ey, t, C.river + Math.floor((t - C.river) / 0.1) * 0.1, { n: 2, seed: Math.floor(t * 10), speed: 14, life: 0.14, color: COFFEE, gravity: 120 });
      }
    },
  });

  const img = lightRoom(art, ctx, {
    // warm lamp spill on the rug so the coffee reads as coffee (not as a cold grey smear)
    lights: [
      { x: MX - 4, y: MY - 14, r: 42, ry: 22, color: 0xffc070, i: 0.45, pow: 1.2 },
      { x: 244, y: 164, r: 50, ry: 16, color: 0xffb070, i: 0.4 * clamp(st.river?.len * 3 || 0), pow: 1.2 },
    ],
  });

  // ---- camera: close on the landing → push in on the pour → follow the river right ---------------
  const cam = camKeys(t, [
    [T0, { x: 200, y: 150, zoom: 3.0 }],
    [C.notice, { x: 199, y: 150, zoom: 3.1 }, ease.outCubic],
    [C.pour, { x: 202, y: 151, zoom: 3.25 }, ease.inOutQuad],
    [C.overflow, { x: 204, y: 151, zoom: 3.3 }, ease.linear],
    [C.overflow + 0.2, { x: 205, y: 150, zoom: 3.05 }, ease.outCubic],
    [C.river, { x: 207, y: 150, zoom: 2.9 }, ease.inOutQuad],
    [T1, { x: 238, y: 148, zoom: 2.45 }, ease.inOutCubic],
  ], ease.inOutCubic);
  const amp = hit(t, T0, 0.22) * 2.2 + hit(t, C.overflow, 0.2) * 1.0 + hit(t, C.river, 0.2) * 0.6 + 0.12;
  const [sx, sy] = shake(t, amp, 5, 26);
  return { img, w: W, h: H, cam: camClamp({ x: cam.x + sx, y: cam.y + sy, zoom: cam.zoom }) };
}
