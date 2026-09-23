// Shot 8 (bars 9–10) — ХАОС.
// Wide, fast pans, escalating shake. The hero vaults over the desk, sparks race along the
// electrified river, the lamp blinks, sticky notes fly, bots bonk into each other, the hero dashes
// between them and the monitor flashes 04:30. Everything piles up into the short circuit.
//
// Beats: chaos.start b(9,1)  vault + river sparks      · b(9,2) dash right (lamp blink)
//        chaos.papers b(9,3) papers fly, whip left     · chaos.collide b(9,4) designer × barista
//        b(10,1) dash right                            · chaos.clock0430 b(10,2) camera catches 04:30
//        chaos.collide b(10,3) barista × tester        · chaos.peak b(10,4) wide, everything spits
import { storyState } from '../story.js';
import {
  composeRoom, lightRoom, camClamp, camKeys, shake, hit, prog, sparks, speedLines,
  W, H, L, CUES, BEAT, b,
} from './common.js';
import { FLOOR_Y, DESK_Y, HERO_STAND, HERO_SEAT } from './blocking.js';
import { clamp, hash, ease, keys, TAU } from '../engine/util.js';
import { flyingPapers, starBurst, dizzyStars, boltArc } from './dark_lib.js';
import { TAG_MONITOR } from '../assets/room.js';

const C = CUES.chaos;
const T0 = b(9), T1 = b(11);
const [COL0, COL1] = C.collide;
const BOT = (hh) => 180 - 90 / hh; // camera y that pins the frame to the floor at zoom hh

// ---- camera: river → dash → whip left (papers) → punch on bonk → monitor 04:30 → bonk → wide ---
const CAM = [
  [T0, { x: 190, y: BOT(1.42), zoom: 1.42 }],
  [b(9, 2), { x: 182, y: BOT(1.40), zoom: 1.40 }, ease.inOutQuad],
  [b(9, 2.7), { x: 176, y: BOT(1.40), zoom: 1.40 }, ease.linear],
  [b(9, 3), { x: 124, y: 110, zoom: 1.36 }, ease.inOutCubic],       // whip to the pile
  [b(9, 3.8), { x: 136, y: 112, zoom: 1.40 }, ease.linear],
  [b(9, 4), { x: 146, y: BOT(1.75), zoom: 1.75 }, ease.outCubic],   // punch in on the bonk
  [b(9, 4.7), { x: 150, y: BOT(1.70), zoom: 1.70 }, ease.linear],
  [b(10, 1), { x: 170, y: BOT(1.40), zoom: 1.40 }, ease.inOutCubic],
  [b(10, 2), { x: 198, y: 106, zoom: 1.62 }, ease.outCubic],        // catch the 04:30
  [b(10, 2.8), { x: 200, y: 105, zoom: 1.66 }, ease.linear],
  [b(10, 3), { x: 214, y: BOT(1.72), zoom: 1.72 }, ease.outCubic],  // bonk #2
  [b(10, 3.7), { x: 210, y: BOT(1.66), zoom: 1.66 }, ease.linear],
  [b(10, 4), { x: 162, y: 100, zoom: 1.18 }, ease.inOutCubic],      // wide: the peak
  [T1, { x: 160, y: 98, zoom: 1.15 }, ease.linear],                 // = shot 9's static camera
];
const camAt = (t) => camKeys(t, CAM, ease.inOutCubic);

// ---- paths (art px). Into a bonk: accelerate (inQuad); out of it: recoil (outCubic) -----------
const I = ease.inQuad, O = ease.outCubic;
const VAULT = 0.36; // seat → floor
const HERO_X = [[T0, HERO_SEAT.x], [T0 + VAULT, 150, ease.outQuad], [b(9, 2), 150],
  [b(9, 3) - 0.04, 174], [b(9, 3) + 0.06, 172], [b(9, 4) - 0.04, 112], [b(10, 1) + 0.04, 115],
  [b(10, 2) - 0.04, 180], [b(10, 3) + 0.08, 180], [b(10, 4) - 0.03, HERO_STAND.x], [T1, HERO_STAND.x]];
const BARISTA_X = [[T0, 190], [b(9, 2), 204], [b(9, 3), 184], [COL0, 160, I], [COL0 + 0.3, 180, O],
  [b(10, 1), 178], [b(10, 2), 198], [COL1, 216, I], [COL1 + 0.3, 196, O], [b(10, 4), 192], [T1, 190]];
const DESIGNER_X = [[T0, 80], [b(9, 2), 90], [b(9, 3), 104], [COL0, 147, I], [COL0 + 0.3, 128, O],
  [b(10, 1), 106], [b(10, 2), 92], [b(10, 3), 84], [b(10, 4), 82], [T1, 80]];
const TESTER_X = [[T0, 262], [b(9, 2), 250], [b(9, 3), 256], [b(9, 4), 248], [b(10, 1), 244],
  [b(10, 2), 238], [COL1, 226, I], [COL1 + 0.3, 248, O], [b(10, 4), 256], [T1, 262]];
const CODER_X = [[T0, 160], [b(9, 2), 176], [b(9, 3), 140], [b(9, 4), 128], [b(10, 1), 146],
  [b(10, 2), 132], [b(10, 3), 152], [b(10, 4), 164], [T1, 160]];

const DT = 1 / 60;
const at = (ks, t) => keys(t, ks, ease.inOutQuad);
const vel = (ks, t) => (at(ks, t) - at(ks, t - DT)) / DT;

/** Escalation 0..1 across the two bars (steps up on every beat). */
const heat = (t) => clamp((Math.floor((t - T0) / BEAT) + 1) / 8 * 0.8 + prog(t, T0, C.peak) * 0.2);

export function render(t, shot) {
  const st = { ...storyState(t) };
  // the wall notes are torn off with the flying papers (shots 9–10 keep them gone)
  st.wallNotes = keys(t, [[C.papers, 1], [C.papers + 0.35, 0.45]], ease.linear);

  const H1 = heat(t);
  const bonk0 = hit(t, COL0, 0.45, 2), bonk1 = hit(t, COL1, 0.45, 2);
  const dizzy0 = t >= COL0 && t < COL0 + 0.7, dizzy1 = t >= COL1 && t < COL1 + 0.7;
  const peak = hit(t, C.peak, 0.47, 1.1);
  const at0430 = t >= C.clock0430 && t < C.clock0430 + BEAT * 1.6;

  // ---- hero ----------------------------------------------------------------------------------
  const hx = at(HERO_X, t), hv = vel(HERO_X, t);
  let hy = HERO_STAND.y, layer = 'floor', legs = 'stand';
  const moving = Math.abs(hv) > 14;
  const run = Math.floor(t / (BEAT / 4)) % 2;
  const swing = Math.sin((t / (BEAT / 2)) * TAU) * (moving ? 0.9 : 0.2);
  let near = { a: Math.PI / 2 + swing, len: 8, hand: 'open' };
  let far = { a: Math.PI / 2 - swing, len: 8, hand: 'open' };
  let eyes = 'squint', lookX = clamp(Math.round(hv / 40), -1, 1), lookY = 0;
  if (moving) { legs = run ? 'walkA' : 'walkB'; hy -= Math.abs(Math.sin((t / (BEAT / 4)) * Math.PI)) * 1.4; }

  const tv = t - T0;
  if (tv < VAULT) {
    // vault: up from the chair, over the desk top, down onto the floor
    const u = tv / VAULT;
    const apex = 0.42;
    const yApex = 124;
    hy = u < apex
      ? HERO_SEAT.y + (yApex - HERO_SEAT.y) * ease.outQuad(u / apex)
      : yApex + (HERO_STAND.y - yApex) * ease.inQuad((u - apex) / (1 - apex));
    layer = u < apex ? 'seat' : 'floor';
    legs = 'hopA';
    near = { a: -Math.PI / 2 - 0.7, len: 8, hand: 'open' };
    far = { a: -Math.PI / 2 + 0.7, len: 8, hand: 'open' };
    eyes = 'wide'; lookX = 1; lookY = 0;
  } else if (tv < VAULT + 0.1) {
    hy += 1; legs = 'stand'; eyes = 'wide'; // landing dip
  }
  // papers: he snatches at them over his head while running
  if (t >= C.papers && t < COL0 - 0.05) {
    const g = Math.sin(t * 26) * 0.35;
    near = { a: -Math.PI / 2 - 0.5 + g, len: 8, hand: 'open' };
    lookY = -1;
  }
  // bonk #1 right next to him: flinch, arms up to shield
  if (bonk0 > 0.15) {
    near = { a: -Math.PI / 2 - 0.9, len: 7, hand: 'open' };
    far = { a: -Math.PI / 2 + 0.4, len: 7, hand: 'open' };
    eyes = 'wide'; lookX = 1; hy += 1;
  }
  // 04:30: freezes, stares up at the monitor
  if (at0430 && !moving) { eyes = 'round'; lookX = 1; lookY = -1; near = { a: Math.PI / 2 + 0.25, len: 8, hand: 'open' }; far = { a: Math.PI / 2 - 0.25, len: 8, hand: 'open' }; }
  // bonk #2: jumps
  if (bonk1 > 0.1) { eyes = 'wide'; lookX = 1; lookY = 0; hy -= 3 * bonk1; }
  // the peak: back at his mark, both arms flailing overhead
  if (t >= C.peak - 0.03) {
    const u = ease.outBack(prog(t, C.peak - 0.03, C.peak + 0.16));
    const fl = Math.sin(t * 30) * 0.25;
    near = { a: Math.PI / 2 - u * (Math.PI + 0.45) + fl, len: 8 + u, hand: 'open' };
    far = { a: Math.PI / 2 - u * (Math.PI - 0.45) - fl, len: 8 + u, hand: 'open' };
    eyes = 'wide'; lookX = 1; lookY = 0; legs = 'stand'; hy = HERO_STAND.y;
  }
  if (!moving && tv >= VAULT + 0.1 && eyes === 'squint') eyes = 'wide';

  // ---- bots ----------------------------------------------------------------------------------
  const bx = at(BARISTA_X, t), dx = at(DESIGNER_X, t), tx = at(TESTER_X, t), cx = at(CODER_X, t);
  const bV = vel(BARISTA_X, t), dV = vel(DESIGNER_X, t), tV = vel(TESTER_X, t), cV = vel(CODER_X, t);
  const bounce = (seed) => Math.abs(Math.sin(t * 9 + seed)) * (0.6 + H1 * 1.6);
  const dir = (v) => (v > 12 ? 1 : v < -12 ? -1 : 0);

  const barista = {
    name: 'barista', x: bx, y: FLOOR_Y - (bonk0 || bonk1 ? 0 : bounce(0)), layer: 'floor',
    walk: Math.abs(bV) > 12, squash: 0.7 * Math.max(bonk0, bonk1) - peak * 0.35,
    eyes: dizzy0 || dizzy1 ? 'dizzy' : t >= C.peak ? 'surprise' : 'panic',
    lookX: dir(bV), tilt: 0.55 + Math.sin(t * 4) * 0.35, steam: true,
    mouth: 'o', armsUp: t >= C.peak || Math.abs(bV) > 40,
  };
  const designer = {
    name: 'designer', x: dx, y: FLOOR_Y - (bonk0 ? 0 : bounce(1.7)), layer: 'floor',
    walk: Math.abs(dV) > 12, squash: bonk0 * 0.75 - peak * 0.35,
    eyes: dizzy0 ? 'dizzy' : t >= C.peak ? 'surprise' : 'panic',
    lookX: dir(dV) || -1, brush: 0.4 + Math.sin(t * 7) * 0.7, brushLen: 13, paint: 0xff7ad0,
  };
  const tester = {
    name: 'tester', x: tx, y: 164 - (bonk1 ? 0 : bounce(3.1) * 1.6), layer: 'floor',
    walk: Math.abs(tV) > 12, squash: bonk1 * 0.8 - peak * 0.3,
    eyes: dizzy1 ? 'dizzy' : 'surprise',
    hammer: Math.sin(t * 16) * 0.9 + 0.3,
  };
  const coder = {
    name: 'coder', x: cx, y: DESK_Y - bounce(5.4) * 0.8, layer: 'desk',
    walk: Math.abs(cV) > 12, squash: -peak * 0.45,
    face: t >= C.peak ? undefined : 'code', eyes: 'surprise', pose: 'type',
    antennaWobble: 1.6 + H1 * 2.5,
  };
  const b0x = (bx + dx) / 2, b1x = (bx + tx) / 2;

  // ---- composition ---------------------------------------------------------------------------
  const { art, ctx } = composeRoom(st, {
    hero: { layer, x: hx, y: hy, eyes, lookX, lookY, legs, near, far, flip: hv < -14, armsFront: false },
    bots: [coder, barista, designer, tester],
    fx: (a, c) => {
      // sparks racing along the electrified river: a new burst every 16th, more with the heat
      const pts = c.riverPts || [];
      if (pts.length) {
        const per = BEAT / 4 * (1.2 - H1 * 0.5);
        const i1 = Math.floor((t - C.start) / per);
        for (let i = Math.max(0, i1 - 3); i <= i1; i++) {
          const bt = C.start + i * per;
          // each burst runs a little way along the river (the spark "races")
          const run = clamp((t - bt) / 0.25);
          const p0 = Math.floor(hash(i, 17) * pts.length * 0.7);
          const p = pts[Math.min(pts.length - 1, p0 + Math.floor(run * pts.length * 0.3))];
          sparks(a, p[0], p[1] - 1, t, bt, {
            n: 6 + Math.round(H1 * 10), seed: i * 3 + 1, speed: 28 + H1 * 34, life: 0.32,
            gravity: 80, spread: 2.4, dir: -Math.PI / 2,
          });
        }
        // the racing head: a bright blob chasing down the river, one lap per beat
        const ph = ((t - C.start) / BEAT) % 1;
        const k = Math.floor(ph * (pts.length - 1));
        a.emit(() => {
          for (let j = 0; j < 4; j++) {
            const q = pts[Math.max(0, k - j * 2)];
            if (q) a.put(q[0], q[1] - 1, j ? 0x9af0ff : 0xffffff);
          }
        });
      }
      // the power strip keeps spitting
      const per2 = 0.26 - H1 * 0.08;
      const j1 = Math.floor((t - C.start) / per2);
      for (let j = Math.max(0, j1 - 1); j <= j1; j++) {
        const bt = C.start + j * per2;
        sparks(a, L.strip.x + 4 + (j % 3) * 7, L.strip.y - 1, t, bt, {
          n: 6 + Math.round(H1 * 10), seed: 90 + j, speed: 36 + H1 * 20, life: 0.4, gravity: 100, spread: 2.0, dir: -Math.PI / 2,
        });
      }
      // sticky notes torn off the pile and the wall
      flyingPapers(a, t, C.papers, { n: 28 });
      // bonks: stars + sparks at contact, then dizzy stars over the heads
      starBurst(a, b0x, FLOOR_Y - 14, t, COL0, { seed: 11, r: 15, n: 9 });
      starBurst(a, b1x, FLOOR_Y - 12, t, COL1, { seed: 23, r: 15, n: 9, color: 0xb8ffa0 });
      sparks(a, b0x, FLOOR_Y - 12, t, COL0, { n: 14, seed: 5, speed: 42, life: 0.3, colors: [0xffffff, 0xfff27a] });
      sparks(a, b1x, FLOOR_Y - 10, t, COL1, { n: 14, seed: 6, speed: 42, life: 0.3, colors: [0xffffff, 0xb8ffa0] });
      const top = (n) => c.bots[n]?.top;
      if (top('barista')) dizzyStars(a, top('barista')[0], top('barista')[1] - 1, t, dizzy0 ? COL0 : COL1, { seed: 1 });
      if (top('designer')) dizzyStars(a, top('designer')[0], top('designer')[1] + 1, t, COL0, { seed: 2, r: 5 });
      if (top('tester')) dizzyStars(a, top('tester')[0], top('tester')[1] + 4, t, COL1, { seed: 3, r: 5, color: 0xb8ffa0 });
      // the peak: everything spits at once
      if (t >= C.peak) {
        for (let k = 0; k < 6; k++) {
          const px = 50 + k * 46, py = 168 - (k % 2) * 8;
          sparks(a, px, py, t, C.peak + k * 0.03, { n: 14, seed: 200 + k, speed: 58, life: 0.42, gravity: 70, spread: TAU });
        }
        sparks(a, L.socket.x + 4, L.socket.y + 6, t, C.peak, { n: 18, seed: 260, speed: 50, life: 0.45, spread: TAU });
        // the strip starts arcing to the socket: a foretaste of the short circuit
        if (hash(Math.floor(t * 30), 77) > 0.35) boltArc(a, L.strip.x + L.strip.w - 2, L.strip.y, L.socket.x + 3, L.socket.y + 9, t, { seed: 12, jitter: 7, n: 6, color: 0xdff6ff });
      }
      // whip-pan speed lines from the camera's own velocity
      const c0 = camAt(t), cm = camAt(t - DT);
      const vx = (c0.x - cm.x) / DT;
      speedLines(a, t, clamp((Math.abs(vx) - 90) / 160) * 0.9);
    },
  });

  // ---- light ---------------------------------------------------------------------------------
  const cam = camAt(t);
  const amp = 0.3 + H1 * 1.0 + bonk0 * 2.4 + bonk1 * 2.6 + peak * 3.2;
  const [sx, sy] = shake(t, amp, 8, 22);
  const flash = 0.08 * bonk0 + 0.08 * bonk1 + 0.12 * peak
    + (t >= C.clock0430 && t < C.clock0430 + 0.07 ? 0.12 : 0);
  const img = lightRoom(art, ctx, {
    lights: [
      { x: L.strip.x + 10, y: L.strip.y - 2, r: 40, ry: 26, color: 0x9af0ff, i: 0.4 + 0.5 * Math.abs(Math.sin(t * 21)), pow: 1.6 },
      { x: 240, y: 166, r: 52, ry: 22, color: 0xa8e8ff, i: 0.22 + 0.3 * H1, pow: 1.8 },
      // the 04:30 flash throws red light off the screen
      { x: 201, y: 107, r: 70, ry: 50, color: 0xff6a6a, i: at0430 ? 0.5 * (1 - prog(t, C.clock0430, C.clock0430 + BEAT * 1.6)) + 0.15 : 0, pow: 1.4, exclude: [TAG_MONITOR] },
    ],
    rig: { monitorLight: 1 + 0.4 * (at0430 ? 1 : 0) },
    flash,
  });
  return { img, w: W, h: H, cam: camClamp({ x: cam.x + sx, y: cam.y + sy, zoom: cam.zoom }) };
}
