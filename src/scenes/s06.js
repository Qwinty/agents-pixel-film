// Shot 6 (bar 7, 11.250–13.125) — DESIGNER: everything goes pink. Medium shot.
// The designer stands on the rug and "fixes" things with its brush: on every beat a wind-up, a big
// swipe and a glob of paint that lands exactly on the cue, and the colour spreads from the impact.
//   b(7,1) river → pink   (cut in on the impact; the colour runs down the river from the puddle)
//   b(7,2) walls → lime   (glob hits the left wall, the colour sweeps across the room)
//   b(7,3) the hero       (pink glob in the face → st.heroPaint; a teal fan of paint re-does the walls)
//   b(7,4) whole room     (the designer spins, paint everywhere: walls + floor go pink)
// Meanwhile the tester trots over from the strip to inspect the river (it walks back in shot 7).
import { storyState, PINK } from '../story.js';
import {
  composeRoom, lightRoom, camClamp, camKeys, shake, hit, prog, blink, sparks,
  W, H, L, CUES, BEAT, b,
} from './common.js';
import { STATION, HERO_SEAT, FLOOR_Y } from './blocking.js';
import { clamp, keys, ease, hash, TAU } from '../engine/util.js';
import { mix } from '../engine/color.js';
import { drawMug, drawRiver, WALLS } from '../assets/room.js';
import { glob, splat, paintSpray, droplets, dust, wetGlints } from './chaos_lib.js';

const P = CUES.designer.paint;
const T0 = b(7), T1 = b(8);
const COFFEE = 0x94603a;              // as painted in shot 5
const LIME = WALLS.lime.base, TEAL = WALLS.teal.base;
const DX = 158, DY = FLOOR_Y;          // the designer's spot on the rug
// per beat: wind-up [T−0.3, T−0.16] → swipe [T−0.16, T−0.12] → glob flies [T−0.12, T] → impact on
// the cue → hold the follow-through → back to idle by T+0.17, just in time for the next wind-up
const W0 = 0.3, S0 = 0.16, FLIGHT = 0.12, HOLD = 0.05, REC = 0.17;

// per beat: brush angle wound back → swung through, the glob's target and colour
const BEATS = [
  { back: -1.3, thru: 2.0, to: [L.mugFloor.x - 2, L.mugFloor.y - 2], color: PINK, arc: 8 },
  { back: 1.7, thru: -1.1, to: [92, 70], color: LIME, arc: 22 },
  { back: 1.4, thru: -0.7, to: [HERO_SEAT.x + 1, 117], color: PINK, arc: 10 },
  { back: 0, thru: 0, to: null, color: PINK, arc: 0 },                 // the spin
];
const IDLE = 0.45;

/** Designer brush angle + squash at time t. */
function designerPose(t) {
  let ba = IDLE + Math.sin(t * 2.2) * 0.08, sq = 0, spin = false;
  for (let k = 0; k < 4; k++) {
    const T = P[k], B = BEATS[k];
    if (k === 3) {
      // the spin: one full turn of the brush over the half beat before the cue, then a second after
      if (t >= T - BEAT / 2 && t < T + 0.25) {
        const u = (t - (T - BEAT / 2)) / (BEAT / 2 + 0.25);
        ba = IDLE + ease.inOutQuad(u) * TAU * 2;
        sq = t < T - 0.08 ? 0.3 * prog(t, T - BEAT / 2, T - 0.08) : -0.35 * hit(t, T - 0.08, 0.3, 1);
        spin = true;
      }
      continue;
    }
    if (t >= T - W0 && t < T - S0) {
      const u = ease.outCubic(prog(t, T - W0, T - S0));
      ba = IDLE + (B.back - IDLE) * u; sq = 0.3 * u;
    } else if (t >= T - S0 && t < T + HOLD) {
      const u = ease.outExpo(prog(t, T - S0, T - FLIGHT));
      ba = B.back + (B.thru - B.back) * u + (B.thru - B.back) * 0.1 * hit(t, T - FLIGHT, 0.08);
      sq = -0.35;
    } else if (t >= T + HOLD && t < T + REC) {
      const u = ease.outQuad(prog(t, T + HOLD, T + REC));
      ba = B.thru + (IDLE - B.thru) * u; sq = -0.35 * (1 - u) + 0.15 * Math.sin(u * Math.PI);
    }
  }
  return { ba, sq, spin };
}

/** Paint colour loaded on the brush: the colour of the next throw. */
function brushPaint(t) {
  for (let k = 0; k < 4; k++) if (t < P[k] + 0.1) return BEATS[k].color;
  return PINK;
}

/** Wall wipe: the new colour sweeps left → right, starting already past the impact point. */
function wallWipe(t, T, from, to, k0, dur = 0.32) {
  if (t < T || t >= T + dur) return null;
  return { from, to, k: k0 + (1 - k0) * ease.outQuad((t - T) / dur) };
}

export function render(t) {
  const st = storyState(t);
  // colour spreading from the impacts (story switches the colours hard on the cues)
  st.wall = t < P[1] ? WALLS.night : t < P[3] ? WALLS.lime : WALLS.pink;  // lime holds through beat 3
  st.wallWipe = wallWipe(t, P[1], WALLS.night, WALLS.lime, 0.31)
    ?? wallWipe(t, P[2], WALLS.lime, WALLS.teal, 0.43, 0.3)
    ?? wallWipe(t, P[3], WALLS.teal, WALLS.pink, 0.5, 0.22);
  if (t >= P[2] && t < P[3] && !st.wallWipe) st.wall = WALLS.teal;
  if (st.heroPaint) st.heroPaint = { ...st.heroPaint, amount: st.heroPaint.amount * (0.45 + 0.55 * ease.outCubic(prog(t, P[2], P[2] + 0.12))) };
  const riverPink = prog(t, P[0], P[0] + 0.3, ease.outQuad);  // pink runs down the river from the puddle
  const river = st.river;
  st.river = river ? { ...river, color: COFFEE } : null;
  st.mug = { ...st.mug, where: 'shot6' };

  const { ba, sq, spin } = designerPose(t);
  const dz = t >= P[3] - BEAT / 2 && t < P[3] + 0.25 ? -Math.round(Math.sin(prog(t, P[3] - BEAT / 2, P[3] + 0.25) * Math.PI) * 6) : 0;
  const designer = {
    name: 'designer', x: DX, y: DY + dz, brush: ba, paint: brushPaint(t), squash: sq,
    eyes: spin || P.some((T) => t >= T - 0.02 && t < T + 0.25) ? 'happy' : 'normal', lookX: 1, brushLen: 14,
    flash: P.reduce((s, T) => s + hit(t, T, 0.12) * 0.3, 0),
  };

  // barista: stops pouring, flinches at every beat; tester trots over to inspect the river
  const barista = {
    name: 'barista', x: L.mugFloor.x - 12, y: FLOOR_Y, tilt: 1 - ease.outCubic(prog(t, T0, T0 + 0.25)),
    eyes: t < P[3] ? 'surprise' : 'dizzy', lookX: -1, mouth: 'o',
    squash: P.reduce((s, T) => s + hit(t, T, 0.14) * 0.3, 0),
  };
  const tw0 = P[0] + 0.25, tw1 = P[2] - 0.1;
  const tu = prog(t, tw0, tw1);
  const tester = {
    name: 'tester', x: Math.round(STATION.tester.x + (222 - STATION.tester.x) * tu), y: Math.round(STATION.tester.y + (170 - STATION.tester.y) * tu),
    walk: tu > 0 && tu < 1, lookX: 0, eyes: t >= P[3] ? 'surprise' : blink(t, 'normal', 9),
    squash: hit(t, P[3], 0.2) * 0.4, hammer: -0.3 + Math.sin(t * 3.1) * 0.08,
  };

  // coder: keeps typing on the desk, jolts at every splash
  const coder = {
    name: 'coder', ...STATION.coder, pose: 'type', face: t >= P[3] && t < P[3] + 0.4 ? null : 'code', eyes: 'surprise', lookX: 1,
    squash: 0.08 * (Math.floor(t / (BEAT / 4)) % 2) + P.reduce((s, T) => s + hit(t, T, 0.12) * 0.25, 0),
  };

  // hero: watches, gets it in the face on beat 3
  let eyes = 'wide', lookX = 1, lookY = 1;
  if (t >= P[1] - 0.1) { lookY = -1; lookX = -1; eyes = 'round'; }
  if (t >= P[2] - 0.1) { lookX = 1; lookY = 1; eyes = 'wide'; }
  if (t >= P[2]) eyes = t < P[2] + 0.22 ? 'squint' : 'round';
  if (t >= P[3]) { eyes = 'wide'; lookY = 0; lookX = 0; }
  const flinch = hit(t, P[2], 0.2);

  const { art, ctx } = composeRoom(st, {
    hero: { ...HERO_SEAT, y: HERO_SEAT.y + Math.round(flinch * 1), eyes, lookX, lookY,
      near: { a: Math.PI / 2 + 0.15 - flinch * 0.9, len: 9 - flinch * 2, hand: 'open' }, far: { a: 1.2, len: 7, a2: 0.9, len2: 4, hand: 'open' } },
    bots: [coder, barista, tester, designer],
    afterFloor: (a) => {
      // the pink runs down the river from the puddle where the glob landed
      if (river && riverPink > 0) {
        const pts = drawRiver(a, { ...river, color: PINK, len: river.len * riverPink }, t);
        wetGlints(a, pts, t, 0xffe0f4);
      }
      drawMug(a, L.mugFloor.x, L.mugFloor.y, { fill: 1.2, liquid: t >= P[0] ? PINK : COFFEE, t });
    },
    fx: (a, c) => {
      const tip = c.bots.designer?.brushTip ?? [DX + 12, DY - 30];
      // globs in flight (launched from the swiped brush, landing on the cue)
      for (let k = 0; k < 3; k++) {
        const B = BEATS[k], T = P[k];
        const from = [DX + 5 + Math.sin(B.thru) * 17, DY - 9 - Math.cos(B.thru) * 17];
        glob(a, from, B.to, (t - (T - FLIGHT)) / FLIGHT, B.color, B.arc);
        // impact: splat + spray at the target
        const [ix, iy] = B.to;
        paintSpray(a, ix, iy, t, T, B.color, { n: 22, seed: 30 + k, speed: 60, life: 0.4, gravity: 140, spread: TAU, dir: -Math.PI / 2 });
        if (k === 1) splat(a, ix, iy, prog(t, T, T + 0.06) * (1 - prog(t, T + 0.18, T + 0.3)), LIME, 7, 7);
        if (k === 2) splat(a, ix, iy, prog(t, T, T + 0.05) * (1 - prog(t, T + 0.1, T + 0.2)), PINK, 5, 5);
      }
      // beat 1 lands in the puddle: a pink splash
      droplets(a, BEATS[0].to[0], BEATS[0].to[1], t, P[0], { n: 16, seed: 41, speed: 42, life: 0.45, color: PINK, gravity: 240, spread: 2.6, floorY: FLOOR_Y });
      // beat 3: the swipe also throws a teal fan of paint up at the wall
      paintSpray(a, tip[0], tip[1], t, P[2] - 0.03, TEAL, { n: 26, seed: 51, speed: 150, life: 0.35, gravity: 60, spread: 0.9, dir: -Math.PI / 2 - 0.9 });
      // beat 4: the spin flings paint everywhere
      if (t >= P[3] - 0.15) {
        paintSpray(a, tip[0], tip[1], t, P[3] - 0.12, PINK, { n: 18, seed: 61, speed: 120, life: 0.3, gravity: 80, spread: TAU });
        paintSpray(a, DX, DY - 22, t, P[3], PINK, { n: 60, seed: 62, speed: 190, life: 0.5, gravity: 60, spread: TAU });
        paintSpray(a, DX, DY - 22, t, P[3] + 0.02, 0xffc2ee, { n: 30, seed: 63, speed: 120, life: 0.45, gravity: 60, spread: TAU });
      }
      dust(a, DX, DY, t, P[3] + 0.2, { n: 8, r: 10, life: 0.3, color: 0xd8a0c8 });
    },
  });

  const flashC = t >= P[3] ? PINK : t >= P[2] ? PINK : t >= P[1] ? LIME : PINK;
  const flash = hit(t, P[0], 0.14) * 0.22 + hit(t, P[1], 0.16) * 0.3 + hit(t, P[2], 0.14) * 0.25 + hit(t, P[3], 0.22) * 0.45;
  const img = lightRoom(art, ctx, {
    flash, flashColor: flashC,
    lights: [{ x: 244, y: 164, r: 50, ry: 16, color: 0xffb070, i: 0.3, pow: 1.2 }],
  });

  // ---- camera: river → walls → hero → wide room (moves happen during the wind-ups) ----------------
  const cam = camKeys(t, [
    [T0, { x: 190, y: 138, zoom: 2.05 }],
    [P[0] + 0.2, { x: 188, y: 137, zoom: 2.0 }, ease.outCubic],
    [P[1] - 0.06, { x: 150, y: 116, zoom: 1.4 }, ease.inOutCubic],
    [P[1] + 0.25, { x: 152, y: 116, zoom: 1.44 }, ease.outCubic],
    [P[2] - 0.06, { x: 148, y: 131, zoom: 1.85 }, ease.inOutCubic],
    [P[2] + 0.2, { x: 147, y: 131, zoom: 1.92 }, ease.outCubic],
    [P[3] - 0.05, { x: 156, y: 128, zoom: 1.7 }, ease.inOutQuad],
    [P[3] + 0.12, { x: 162, y: 96, zoom: 1.12 }, ease.outExpo],
    [T1, { x: 162, y: 94, zoom: 1.08 }, ease.linear],
  ], ease.inOutCubic);
  const amp = hit(t, P[0], 0.2) * 1.0 + hit(t, P[1], 0.2) * 1.4 + hit(t, P[2], 0.2) * 1.2 + hit(t, P[3], 0.3) * 2.4;
  const [sx, sy] = shake(t, amp, 6, 22);
  return { img, w: W, h: H, cam: camClamp({ x: cam.x + sx, y: cam.y + sy, zoom: cam.zoom }) };
}
