// Shot 7 (bar 8, 13.125–15.000) — TESTER: the wet power strip. Close-up, tracking the tester.
//   b(8,1)      tester.walk — four 8th-note steps along the pink river, from the puddle to the strip
//               (the score's 5th and 6th footsteps land with the first two taps: the tester stamps)
//   b(8,3)      tap — tink        ┐ each with a wind-up of the hammer before it,
//   b(8,3.5)    tap — tink        │ the camera pushing in a notch per tap
//   b(8,4)      tap — TINK        ┘
//   b(8,4.125)  sparks — the strip bursts, the river goes live (story), the tester is blown back;
//               the camera punches out — shot 8 opens wide on the sparks racing along the river.
import { storyState } from '../story.js';
import {
  composeRoom, lightRoom, camClamp, camKeys, shake, hit, prog, blink, sparks,
  W, H, L, CUES, BEAT, b,
} from './common.js';
import { STATION, FLOOR_Y } from './blocking.js';
import { clamp, keys, ease, hash, TAU } from '../engine/util.js';
import { mix } from '../engine/color.js';
import { hammerAngle, tink, dust, riverYAt, wetGlints, OUT } from './chaos_lib.js';

const C = CUES.tester;
const T0 = b(8), T1 = b(9);
const S8 = BEAT / 2;
const X0 = 222, X1 = STATION.tester.x;       // from the puddle (end of shot 6) to the strip
const STEPS = 4, STEP_T = 0.13;
const TAPS = C.taps, SPARK = C.sparks;
const STRIP = L.strip;
const HOT = [STRIP.x + 11, STRIP.y + 1];     // where the sparks come out

/** Tester x along the river: a hop-step on every 8th. */
function testerX(t) {
  const k = Math.floor((t - T0) / S8);
  if (t < T0) return X0;
  if (k >= STEPS) return X1;
  const u = ease.outQuad(clamp((t - T0 - k * S8) / STEP_T));
  return X0 + (X1 - X0) * (k + u) / STEPS;
}

/** A jagged electric arc between two points, re-rolled every frame. */
function bolt(art, t, x0, y0, x1, y1, seed, color = 0xbff6ff) {
  const n = 7, fr = Math.floor(t * 30);
  let px = x0, py = y0;
  art.emit(() => {
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      const j = i === n ? 0 : (hash(i, seed, fr) - 0.5) * 7;
      const nx = x0 + (x1 - x0) * u + j * 0.4, ny = y0 + (y1 - y0) * u + j;
      art.line(Math.round(px), Math.round(py), Math.round(nx), Math.round(ny), i % 2 ? color : 0xffffff);
      px = nx; py = ny;
    }
  });
}

export function render(t) {
  const st = storyState(t);

  // ---- tester ---------------------------------------------------------------------------------
  let x = testerX(t);
  let y = riverYAt(L.river, x) + 0.5;
  const kStep = Math.floor((t - T0) / S8);
  const stepping = t >= T0 && kStep < STEPS && t - T0 - kStep * S8 < STEP_T;
  const stamp = t >= T0 && kStep >= STEPS && kStep < 6 && t - T0 - kStep * S8 < 0.08; // steps 5–6 = stamps
  let squash = 0, eyes = blink(t, 'normal', 11), lookX = 1;
  let hammer = hammerAngle(t, TAPS, { wind: 0.16, hit: 0.95, up: -0.9 });
  if (stepping) { y -= Math.sin(clamp((t - T0 - kStep * S8) / STEP_T) * Math.PI) * 2; squash = -0.15; }
  squash += 0.3 * hit(t, T0 + Math.max(0, kStep) * S8 + STEP_T, 0.1) * (kStep < STEPS ? 1 : 0);
  if (stamp) squash += 0.2;
  if (t >= TAPS[0] - 0.3) eyes = 'angry';                 // determined
  TAPS.forEach((T, k) => {
    if (t >= T - 0.16 && t < T) squash -= 0.2 * prog(t, T - 0.16, T);   // stretch up with the wind-up
    squash += (0.3 + k * 0.12) * hit(t, T, 0.12);
  });
  // the zap: flash, blown back and up, hammer spinning, dizzy
  const zap = t >= SPARK;
  let flash = 0;
  if (zap) {
    const u = prog(t, SPARK, SPARK + 0.28);
    x = X1 - 6 * Math.sin(u * Math.PI);                     // jolted up and back, lands where it stood
    y = riverYAt(L.river, X1) + 0.5 - Math.sin(u * Math.PI) * 11;
    squash = u < 1 ? -0.4 : 0.35 * hit(t, SPARK + 0.28, 0.15);
    eyes = t < SPARK + 0.3 ? 'surprise' : 'dizzy';
    hammer = u < 1 ? 1 + u * TAU * 1.5 : -0.2 + Math.sin(t * 9) * 0.3;
    flash = hit(t, SPARK, 0.3, 1) * 0.9 + (t < SPARK + 0.5 && Math.floor(t * 30) % 3 === 0 ? 0.5 : 0);
  }
  const tester = { name: 'tester', x: Math.round(x), y: Math.round(y), walk: stepping, squash, eyes, lookX, hammer, flash };

  // barista at the puddle watches it go (visible at the left at the start)
  const barista = { name: 'barista', x: L.mugFloor.x - 12, y: FLOOR_Y, eyes: t >= SPARK ? 'surprise' : blink(t, 'normal', 4), lookX: 1, squash: 0.35 * hit(t, SPARK, 0.2), mouth: t >= SPARK ? 'o' : undefined };

  const { art, ctx } = composeRoom(st, {
    hero: null,
    bots: [barista, tester],
    fx: (a, c) => {
      wetGlints(a, c.riverPts, t, 0xffe0f4);
      // footstep puffs on every step (and the stamps)
      for (let k = 0; k < 6; k++) {
        const ts = T0 + k * S8 + (k < STEPS ? STEP_T : 0);
        const fx = k < STEPS ? X0 + (X1 - X0) * (k + 1) / STEPS : X1;
        dust(a, fx, riverYAt(L.river, fx) + 1, t, ts, { n: 5, seed: 20 + k, r: 5, life: 0.22, color: 0xe0b0d8 });
      }
      // the taps: tink · tink · TINK at the hammer head
      const hh = c.bots.tester?.hammerHead;
      TAPS.forEach((T, k) => {
        if (!hh || zap) return;
        tink(a, hh[0], hh[1], hit(t, T, 0.14 + k * 0.05) * (0.6 + k * 0.35), k === 2 ? 0xfff27a : 0xfff6c0);
        if (k >= 1) sparks(a, hh[0], hh[1], t, T, { n: 3 + k * 4, seed: 70 + k, speed: 30 + k * 12, life: 0.25, colors: [0xfff27a, 0xffffff] });
      });
      // the burst
      if (zap) {
        const dt = t - SPARK;
        sparks(a, HOT[0], HOT[1], t, SPARK, { n: 70, seed: 81, speed: 110, life: 0.8, gravity: 120 });
        sparks(a, HOT[0], HOT[1] - 2, t, SPARK + 0.03, { n: 50, seed: 84, speed: 170, life: 0.45, gravity: 60, spread: Math.PI * 1.2 });
        sparks(a, HOT[0], HOT[1], t, SPARK + 0.2, { n: 30, seed: 82, speed: 70, life: 0.6, gravity: 140, colors: [0x9af0ff, 0xffffff] });
        for (let k = 0; k < 6; k++) sparks(a, HOT[0] + (hash(k, 83) - 0.5) * 16, HOT[1], t, SPARK + 0.3 + k * 0.17, { n: 8, seed: 90 + k, speed: 50, life: 0.35, gravity: 150 });
        // arcs: into the socket cable, down into the river, crackling
        const fl = Math.floor(t * 30);
        if (hash(fl, 5) > 0.25) bolt(a, t, HOT[0], HOT[1], L.socket.x + 3, L.socket.y + 10, 1);
        if (hash(fl, 6) > 0.3) bolt(a, t, HOT[0] - 4, HOT[1] + 2, 266, riverYAt(L.river, 266), 2);
        if (dt < 0.35 && hash(fl, 7) > 0.2) bolt(a, t, HOT[0] + 4, HOT[1] - 1, HOT[0] + 18, HOT[1] - 14, 3, 0xfff27a);
        // a shock ring
        const rk = prog(t, SPARK, SPARK + 0.3);
        if (rk < 1) a.emit(() => {
          const r = 3 + rk * 26;
          for (let i = 0; i < 40; i++) {
            if ((i + fl) % 4 === 0) continue;
            const an = i / 40 * TAU;
            a.put(Math.round(HOT[0] + Math.cos(an) * r), Math.round(HOT[1] + Math.sin(an) * r * 0.6), 0xdff8ff);
          }
        });
      }
    },
  });

  const flick = zap ? 0.7 + 0.5 * hash(Math.floor(t * 30), 9) : 0;
  const img = lightRoom(art, ctx, {
    flash: hit(t, TAPS[2], 0.08) * 0.15 + hit(t, SPARK, 0.2, 1.5) * 0.55,
    flashColor: 0xe8fbff,
    lights: [
      { x: 244, y: 164, r: 50, ry: 16, color: 0xffb0e0, i: 0.3, pow: 1.2 },
      ...(zap ? [{ x: HOT[0], y: HOT[1] - 4, r: 90, ry: 60, color: 0x9ae8ff, i: 1.3 * flick * (0.5 + 0.5 * hit(t, SPARK, 0.6, 1)), pow: 1.3 }] : []),
      ...TAPS.map((T, k) => ({ x: HOT[0] - 6, y: HOT[1] - 4, r: 24 + k * 8, color: 0xfff2b0, i: hit(t, T, 0.1) * (0.6 + k * 0.4), pow: 1.2 })),
    ],
  });

  // ---- camera: track the walk → a notch closer per tap → punch out on the sparks ------------------
  // (the camera glides — it does not copy the tester's hop-steps)
  const cam = camKeys(t, [
    [T0, { x: X0 + 6, y: 149, zoom: 2.9 }],
    [T0 + STEPS * S8, { x: X1 + 6, y: 149, zoom: 2.9 }, ease.inOutQuad],
    [TAPS[0] - 0.2, { x: X1 + 6, y: 149, zoom: 2.9 }, ease.linear],
    [TAPS[0], { x: 268, y: 150, zoom: 3.05 }, ease.outCubic],
    [TAPS[1], { x: 270, y: 151, zoom: 3.2 }, ease.outCubic],
    [TAPS[2], { x: 271, y: 152, zoom: 3.4 }, ease.outCubic],
    [SPARK, { x: 271, y: 152, zoom: 3.4 }, ease.linear],
    [SPARK + 0.2, { x: 252, y: 140, zoom: 2.2 }, ease.outExpo],
    [T1, { x: 248, y: 136, zoom: 2.05 }, ease.linear],
  ], ease.inOutCubic);
  const amp = TAPS.reduce((s, T, k) => s + hit(t, T, 0.12) * (0.5 + k * 0.6), 0) + hit(t, SPARK, 0.5, 1.5) * 3 + (zap ? 0.5 : 0.05);
  const [sx, sy] = shake(t, amp, 7, 28);
  return { img, w: W, h: H, cam: camClamp({ x: cam.x + sx, y: cam.y + sy, zoom: cam.zoom }) };
}
