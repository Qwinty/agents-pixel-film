// Shot 14 (bar 21, 37.500–39.375) — dawn on the windowsill.
// The hero and the four bots sit on the sill with their backs to us, silhouetted against the
// sunrise (dawn 0.82 → 0.91); the sun sits just behind the hero's head. The rocket's trail arcs
// over their heads toward the sun, birds glide past, the mug and the barista's kettle steam.
// The only "event" is calm: on beat 3 the coder leans in toward the hero, on beat 4 the designer's
// brush and the hero's head settle. Camera: starts close on the hero + mug, pulls back to the whole
// window.
import { lightRoom, camClamp, camKeys, prog, W, H, L, BEAT, b } from './common.js';
import { ease } from '../engine/util.js';
import { sillScene, SILL } from './dawn_lib.js';

const T0 = b(21), T1 = b(22);

export function render(t, shot) {
  // slow breathing: a 1-px rise every other beat, staggered across the team
  const breath = (k) => (Math.floor((t - T0) / (BEAT * 2) + k * 0.37) % 2 === 0 ? 0 : 1);
  const lean = prog(t, b(21, 3), b(21, 3) + 0.4, ease.inOutQuad);
  const { art, ctx, st } = sillScene(t, {
    hero: { y: SILL.heroY - breath(0) + 1 },
    bots: {
      designer: { y: SILL.botY - breath(1) },
      coder: { x: SILL.coder - Math.round(lean * 2), y: SILL.botY - breath(2) },
      barista: { y: SILL.botY - breath(3) },
      tester: { y: SILL.botY - breath(4), hammer: -0.3 + Math.sin(t * 0.8) * 0.06 },
    },
  });
  const img = lightRoom(art, ctx, silhouetteLight(st));
  const cam = camKeys(t, [
    [T0, { x: 136, y: 62, zoom: 3.3 }],
    [T0 + 0.25, { x: 137, y: 61, zoom: 3.2 }, ease.linear],
    [T1, { x: 162, y: 50, zoom: 1.95 }, ease.inOutQuad],
  ], ease.inOutQuad);
  return { img, w: W, h: H, cam: camClamp(cam) };
}

/** Backlit by the sunrise: a dim warm room, the cast as dark shapes with bright warm rims. */
export function silhouetteLight(st, extra = {}) {
  const sunX = L.window.x + Math.round(L.window.w * 0.3), sunY = L.window.y + L.window.h - 8 - Math.round(st.dawn * 14);
  return {
    ambient: [0.3, 0.24, 0.33],
    rig: { monitorLight: 0.25, lamp: 0, windowLight: 0.35 },
    lights: [
      { x: sunX, y: sunY, r: 120, ry: 90, color: 0xffb070, i: 0.32, pow: 1.6 },
      ...(extra.lights || []),
    ],
    spriteLight: { floor: 0.22, keep: 0.75 },
    rim: 3.2,
    flash: extra.flash, flashColor: extra.flashColor,
  };
}
