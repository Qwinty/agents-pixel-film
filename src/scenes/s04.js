// Shot 4 (bar 5, 7.500–9.375) — CODER: the avalanche of code. Close-up of coder / screen / mug.
// Opens on the tail of shot 3's whip pan: the camera lands with an overshoot, speed lines decay.
//   b(5,1) coder.typing    — furious 16ths for the whole bar (the coder never stops)
//   b(5,2) coder.avalanche — code bursts out of the bottom of the screen, a heap grows on the desk
//   b(5,3) coder.mugPush   — a surge of the heap shoves the mug toward the desk's front edge
//   b(5,4) coder.mugFall   — the mug tips over the edge; the camera tilts down after it
// The mug lands on the floor on the first frame of shot 5 (barista.mugLand = b(6,1)).
import { storyState } from '../story.js';
import {
  composeRoom, lightRoom, camClamp, camKeys, shake, hit, prog, blink, speedLines,
  W, H, L, CUES, BEAT, b,
} from './common.js';
import { STATION, HERO_SEAT } from './blocking.js';
import { clamp, keys, ease, hash } from '../engine/util.js';
import { mix } from '../engine/color.js';
import { drawMug } from '../assets/room.js';
import { codeHeap, codeCurtain, glyphSpray, heapSurface } from './chaos_lib.js';

const C = CUES.coder;
const T0 = b(5), T1 = b(6);
const A = C.avalanche, P = C.mugPush, F = C.mugFall;
const SIXTEENTH = BEAT / 4;

/** Mug on the desk: shoved in two jolts (the surge, then the heap's slow creep) to the front edge. */
function mugPush(t) {
  return keys(t, [[P, 0], [P + 0.07, 0.4, ease.outCubic], [F - 0.12, 0.7, ease.inOutQuad], [F, 1, ease.inQuad]], ease.linear);
}

/** The heap of code on the desk, sitting against the monitor stand, growing toward the mug. */
function heapSpec(t, mugY) {
  const g = (ks) => keys(t, ks, ease.outCubic);
  return {
    cx: 195,
    wL: g([[A, 5], [A + 0.2, 13], [P, 17], [F, 20], [T1, 22]]),
    wR: g([[A, 5], [A + 0.2, 9], [P - 0.02, 11], [P + 0.07, 18], [F, 21], [T1, 25]]),
    h: g([[A, 0], [A + 0.12, 5], [P - 0.02, 9], [P + 0.08, 14], [F, 15], [T1, 16]]),
    baseY: t < P ? 134 : t < F ? mugY - 1 : 140,
    surge: t >= P - 0.02 && t < P + 0.12 ? 196 + prog(t, P - 0.02, P + 0.1, ease.outCubic) * 14 : null,
  };
}

function baristaHop(t) {
  // waddles back along the floor (never rising above the desk edge, so it never covers the mug)
  const h0 = A + 0.15, h1 = P - 0.05;
  const u = prog(t, h0, h1);
  const x = 236 + (STATION.barista.x - 236) * ease.inOutQuad(u);
  const bob = u > 0 && u < 1 ? Math.round(Math.abs(Math.sin((t - h0) * 20))) : 0;
  return {
    name: 'barista', x: Math.round(x), y: STATION.barista.y - bob, hidden: t < h0, steam: true, walk: u > 0 && u < 1,
    lookX: u < 1 ? -1 : 1, eyes: t >= F + 0.1 ? 'surprise' : blink(t, 'normal', 3),
    squash: 0.3 * hit(t, h1, 0.12) + 0.35 * hit(t, F + 0.1, 0.15),
  };
}

export function render(t) {
  const st = storyState(t);
  st.keysPressed = t >= A ? 0.5 : 0.35;
  // the screen scrolls faster and faster; it flashes as the code bursts out of it
  st.screen = { ...st.screen, scroll: (t - T0) * 48 + Math.max(0, t - (A - BEAT / 2)) * 120 + Math.max(0, t - A) ** 2 * 200, flashAmt: hit(t, A, 0.2) * 0.5 };

  const push = mugPush(t);
  const mugY = L.mug.y + Math.round(push * 5);
  const onDesk = st.mug.where === 'desk';
  if (onDesk) st.mug = { ...st.mug, where: 'shot4' }; // drawn by this shot (in front of the heap)
  const spec = heapSpec(t, mugY);

  // ---- hero: startled at the burst, jaw-drop "wide" when the mug goes ---------------------------
  let eyes = blink(t, 'normal', 2), lookX = 1, lookY = 0, near, far;
  if (t < A) {
    // he watches the coder type; half-lidded suspicion as the screen scrolls out of control
    near = { a: Math.PI / 2 + 0.15, len: 9, hand: 'open' };
    far = { a: 1.2, len: 7, a2: 0.9, len2: 4, hand: 'open' };
    if (t > A - BEAT / 2) eyes = 'half';
  } else if (t < F) {
    const k = ease.outBack(prog(t, A, A + 0.14));
    eyes = t < P ? 'round' : 'wide';
    lookY = t < P ? 0 : 1;
    near = { a: Math.PI / 2 + 0.2 - 0.3 * k, len: 7, a2: 0.9 - k * 2.0, len2: 6, hand: 'open' };
    far = { a: 1.15 - 0.2 * k, len: 6, a2: 0.9 - k * 1.7, len2: 6, hand: 'open' };
  } else {
    const k = ease.outBack(prog(t, F, F + 0.16));
    eyes = 'wide'; lookY = 1;
    near = { a: Math.PI / 2 - 0.1, len: 7, a2: -1.1, len2: 6, hand: 'open' };
    far = { a: 0.95 - k * 0.7, len: 6 + k * 3, a2: -0.8 + k * 1.1, len2: 6, hand: 'open' };
  }

  // ---- coder: never stops typing; glances at the mug only when it goes over -----------------
  const ph16 = Math.floor(t / SIXTEENTH) % 2;
  const glance = t >= F + 0.06 && t < F + 0.36;
  const coder = {
    name: 'coder', ...STATION.coder, pose: 'type',
    face: glance ? null : 'code', eyes: glance ? 'surprise' : 'normal', lookX: 1,
    squash: (t >= A ? 0.14 : 0.08) * ph16 - (glance ? 0.25 * hit(t, F + 0.06, 0.2) : 0),
    antennaWobble: t >= A ? 2 : 1.2,
    flash: hit(t, A, 0.2) * 0.6,
  };

  const { art, ctx } = composeRoom(st, {
    hero: { ...HERO_SEAT, eyes, lookX, lookY, near, far },
    bots: [coder,
      // on the floor below (seen when the camera tilts down after the mug): they look up at it
      // the barista (it hopped off to the right in shot 3) bounces back to its station under the mug
      baristaHop(t),
      { name: 'tester', ...STATION.tester, lookX: 0, eyes: blink(t, 'normal', 8) },
    ],
    afterDesk: (a) => {
      if (t >= A) {
        codeHeap(a, t, spec);
        // the curtain of code sliding out of the screen, thick at the burst, steady afterwards
        const k = t < A + 0.06 ? prog(t, A, A + 0.06) : 0.75 + 0.25 * hit(t, P, 0.25);
        codeCurtain(a, t, spec, { x0: 177, x1: 225, y0: 119, k, speed: 90 });
      }
      if (st.mug.where === 'shot4') {
        const jit = t >= P && t < F ? Math.round(Math.sin(t * 60) * 0.8 * (1 - push * 0.5)) : 0;
        drawMug(a, L.mug.x + jit, mugY, { fill: 0.3, steam: true, t });
      }
    },
    fx: (a) => {
      // loose glyphs flung out of the burst onto the desk / heap
      glyphSpray(a, t, A, F + 0.2, {
        x0: 180, x1: 222, y0: 122, vx: [-45, 45], vy: [-55, -5], rate: 110, g: 380, life: 0.6, seed: 3,
        landY: (x) => (x > 184 && x < 216 ? heapSurface(x, spec, t) : 139),
      });
      // on the fall a lip of code follows the mug over the front edge
      glyphSpray(a, t, F - 0.03, T1, {
        x0: 199, x1: 214, y0: 140, vx: [-8, 10], vy: [0, 20], rate: 70, g: 420, life: 0.5, seed: 8,
        landY: () => 171,
      });
      // shot 3's whip pan arriving: streaks decay as the camera lands
      const whip = 1 - prog(t, T0, T0 + 0.22, ease.outQuad);
      if (whip > 0) speedLines(a, t, whip, { seed: 7 });
    },
  });

  const glowI = 0.55 * clamp(spec.h / 8) + 0.4 * hit(t, A, 0.25) + 0.3 * hit(t, P, 0.2);
  const img = lightRoom(art, ctx, {
    flash: hit(t, A, 0.12) * 0.3 + hit(t, P, 0.1) * 0.15,
    flashColor: 0xbfffd8,
    rig: { monitorColor: t >= A ? mix(0x6ab8ff, 0x7dffb0, 0.45) : undefined },
    lights: t >= A ? [{ x: 198, y: 128, r: 48, ry: 30, color: 0x6dffa8, i: glowI, pow: 1.4 }] : [],
  });

  // ---- camera: whip lands (overshoot → settle) · push in on the mug · tilt down after it --------
  const cam = camKeys(t, [
    [T0, { x: 197, y: 121, zoom: 2.2 }],
    [T0 + 0.1, { x: 204, y: 119, zoom: 2.2 }, ease.outCubic],     // the whip decelerates past its mark…
    [T0 + 0.42, { x: 193, y: 117, zoom: 2.2 }, ease.inOutQuad],   // …and eases back onto it
    [A, { x: 191, y: 118, zoom: 2.26 }, ease.inOutQuad],
    [A + 0.2, { x: 191, y: 119, zoom: 2.18 }, ease.outCubic],
    [P, { x: 195, y: 122, zoom: 2.24 }, ease.inOutQuad],
    [P + 0.25, { x: 204, y: 126, zoom: 2.45 }, ease.outCubic],
    [F, { x: 205, y: 127, zoom: 2.45 }, ease.linear],
    [T1, { x: 206, y: 148, zoom: 2.4 }, ease.inQuad],
  ], ease.inOutCubic);
  const amp = hit(t, T0, 0.2) * 1.5 + hit(t, A, 0.3) * 1.4 + hit(t, P, 0.25) * 1.6 + hit(t, F, 0.2) * 0.8
    + (t >= A && t < F ? 0.25 : 0.1);
  const [sx, sy] = shake(t, amp, 4, 24);
  return { img, w: W, h: H, cam: camClamp({ x: cam.x + sx, y: cam.y + sy, zoom: cam.zoom }) };
}
