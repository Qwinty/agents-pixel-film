// Shot 13 (bar 20, 35.625–37.500) — 06:00, "deployed ✓".
// b(20,1) deploy: the final chord — the screen flashes, confetti in the ring colours bursts out of
//   the monitor, the hero throws both arms up (happy eyes), the four bots hop and flash their colours.
// b(20,2) a second, smaller hop on the beat.
// b(20,2.5) rocketLaunch: a pixel rocket assembles out of the screen's pixels, ignites, smoke billows.
// b(20,3) windowOpen: both sashes swing open onto the dawn; the rocket climbs, everyone looks up.
// b(20,4) rocketOut: it blasts up through the open window into the sky, leaving a trail.
// Camera: medium on the cheer → zooms in and tilts up, following the rocket out of the window.
import { storyState } from '../story.js';
import { composeRoom, lightRoom, camClamp, hit, prog, sparks, assemble, shake, W, H, L, CUES, BEAT, BOTS } from './common.js';
import { STATION, HERO_STAND } from './blocking.js';
import { RING } from '../assets/brand.js';
import { ease, clamp, lerp } from '../engine/util.js';
import { mix } from '../engine/color.js';
import {
  drawRocket, rocketPos, rocketSize, roomSmoke, skyTrail, windowView, windowOpenAt,
  T_IGNITE, T_EXIT, ROCKET_HOME,
} from './dawn_lib.js';
import { SCREEN_SRC } from './intro_lib.js';

const T_D = CUES.deploy, T_L = CUES.rocketLaunch, T_W = CUES.windowOpen, T_O = CUES.rocketOut;
const T_END = T_D + BEAT * 4;
const ORDER = ['designer', 'coder', 'barista', 'tester'];

/** Hop on beats 1 and 2 (the second smaller): returns [lift px, squash]. */
function hopAt(t, delay, big = 5) {
  let lift = 0, sq = 0;
  for (const [tb, amp] of [[T_D + delay, big], [T_D + BEAT + delay, big * 0.55]]) {
    const u = (t - tb) / 0.3;
    if (u >= 0 && u < 1) { lift = Math.sin(u * Math.PI) * amp; sq = u < 0.15 ? 0.4 : -0.35; }
    const land = hit(t, tb + 0.3, 0.12, 1.2);
    if (land > 0) sq = 0.45 * land;
  }
  if (t >= T_D - 0.07 && t < T_D + delay) sq = 0.4; // anticipation crouch
  return [lift, sq];
}

export function render(t, shot) {
  const st = { ...storyState(t) };
  const openK = windowOpenAt(t);
  st.windowOpen = 0; // we draw the swinging sashes ourselves (dawn_lib.windowView)

  // the screen: white flash on the chord, the text flashes white for a moment
  st.screen = { ...st.screen, flashAmt: hit(t, T_D, 0.35, 1.6), flash: t < T_D + 0.12 ? 1 : 0 };

  const rp = rocketPos(t);
  const inRoom = rp && t < T_EXIT;
  const lookUp = t >= T_L + 0.05;                       // everyone watches the rocket
  const rx = rp ? rp[0] : ROCKET_HOME[0], ry = rp ? rp[1] - 8 : ROCKET_HOME[1];

  // ---- hero: arms thrown up on the chord, pumping on the beat, then watching the rocket ----------
  const [hl, hsq] = hopAt(t, 0, 3);
  const pump = Math.sin(clamp((t - T_D) / BEAT) * Math.PI * 2) * 0.12;
  const up = ease.outBack(prog(t, T_D - 0.02, T_D + 0.12));
  let near = { a: lerp(Math.PI / 2 + 0.2, -Math.PI / 2 - 0.55 + pump, up), len: 9, hand: 'open' };
  let far = { a: lerp(Math.PI / 2 - 0.2, -Math.PI / 2 + 0.55 - pump, up), len: 9, hand: 'open' };
  let eyes = 'happy', lookX = 0, lookY = 0;
  if (lookUp) {
    // arms lower a little, one hand stays up pointing at the rocket
    const k = ease.outCubic(prog(t, T_L + 0.05, T_L + 0.25));
    const aim = Math.atan2(ry - (HERO_STAND.y - 20), rx - (HERO_STAND.x + 7));
    far = { a: lerp(far.a, aim, k), len: 9 + k, hand: k > 0.5 ? 'point' : 'open', fingerA: aim };
    near = { a: lerp(near.a, -Math.PI / 2 - 0.9, k), len: 9, hand: 'open' };
    eyes = t < T_O ? 'round' : 'happy'; lookX = 1; lookY = -1;
  }

  // ---- bots at their stations: hop + colour flash on the chord, then look at the rocket -------------
  const bots = ORDER.map((name, k) => {
    const s = STATION[name];
    const [lift, sq] = hopAt(t, k * 0.035, name === 'tester' ? 4 : 5);
    const flash = hit(t, T_D + k * 0.035, 0.45, 1.4) + 0.6 * hit(t, T_D + BEAT + k * 0.035, 0.3, 1.6);
    const lk = lookUp ? (rx > s.x ? 1 : -1) : 0;
    return {
      name, x: s.x, y: s.y - Math.round(lift), layer: s.layer, t, flash, squash: sq,
      eyes: t < T_L + 0.05 ? 'happy' : t < T_O ? 'surprise' : 'happy', lookX: lk, lookY: lookUp ? -1 : 0,
      armsUp: name === 'barista', steam: name === 'barista', pose: name === 'coder' && t < T_L ? 'salute' : undefined,
      face: undefined, brush: name === 'designer' ? -0.5 + Math.sin(t * 9) * 0.25 : undefined,
      hammer: name === 'tester' ? -1.0 + Math.sin(t * 11) * 0.3 : undefined,
    };
  });

  const { art, ctx } = composeRoom(st, {
    afterBack: (a) => windowView(a, st, openK, (sky) => {
      skyTrail(sky, t);
      if (rp && !inRoom) drawRocket(sky, rp[0], rp[1], rocketSize(t), t, 1);
    }),
    hero: { layer: 'floor', x: HERO_STAND.x, y: HERO_STAND.y - Math.round(hl), eyes, lookX, lookY, near, far, legs: hl > 1 ? 'hopA' : undefined },
    bots,
    fx: (a) => {
      // confetti in the logo's ring colours out of the monitor on the chord
      for (let k = 0; k < 6; k++) {
        sparks(a, L.screen.x + 10 + k * 8, L.screen.y + 4, t, T_D + k * 0.02, {
          n: 14, seed: 500 + k, speed: 70, life: 1.1, gravity: 60, spread: 2.2, dir: -Math.PI / 2 + (k - 2.5) * 0.18,
          colors: [RING[(k * 2) % 12], RING[(k * 2 + 5) % 12], RING[(k * 2 + 9) % 12], 0xffffff],
        });
      }
      // the rocket pops out of the screen (its pixels fly out of the display), then ignites
      const k01 = (t - (T_L - 0.16)) / 0.18;
      if (k01 > 0 && k01 < 1) {
        assemble(a, (tmp) => drawRocket(tmp, ROCKET_HOME[0], ROCKET_HOME[1], 'big', t, 0), k01,
          { x: SCREEN_SRC.x + 16, y: SCREEN_SRC.y + 6, w: SCREEN_SRC.w - 32, h: SCREEN_SRC.h - 8 }, { color: 0xffe6c0, seed: 31, arc: 5 });
      }
      roomSmoke(a, t);
      if (inRoom && k01 >= 1) drawRocket(a, rp[0], rp[1], 'big', t, t >= T_IGNITE ? (t < T_L + 0.08 ? 0.5 : 1) : 0);
      // ignition sparks and the blast-off burst at the window
      sparks(a, ROCKET_HOME[0], ROCKET_HOME[1] + 2, t, T_IGNITE, { n: 16, seed: 77, speed: 46, life: 0.4, gravity: 70, spread: 2.6, dir: Math.PI / 2, colors: [0xfff2b0, 0xffb040, 0xff7a2a] });
      sparks(a, 201, 99, t, T_O, { n: 18, seed: 78, speed: 50, life: 0.45, gravity: 40, spread: 2.2, dir: Math.PI / 2, colors: [0xfff2b0, 0xffb040, 0xff7a2a, 0xffffff] });
    },
  });

  // ---- light: dawn room + the rocket's flame + the chord flash --------------------------------------
  const lights = [];
  if (inRoom && t >= T_IGNITE) {
    const fl = 0.85 + 0.3 * (Math.floor(t * 30) % 2);
    lights.push({ x: rp[0], y: rp[1] + 3, r: 64, ry: 54, color: 0xffa04a, i: 1.1 * fl, pow: 1.4 });
  }
  if (t >= T_EXIT) lights.push({ x: 201, y: 60, r: 70, color: 0xffc080, i: 0.8 * hit(t, T_EXIT, 0.4, 1.2), pow: 1.3 });
  // the bots' colour flashes spill onto the room
  ORDER.forEach((name, k) => {
    const f = hit(t, T_D + k * 0.035, 0.45, 1.4);
    const r = ctx.bots[name];
    if (f > 0 && r) lights.push({ x: r.center[0], y: r.center[1], r: 36, color: BOTS[name].color, i: 1.1 * f, pow: 1.4 });
  });
  const img = lightRoom(art, ctx, {
    lights,
    flash: 0.22 * hit(t, T_D, 0.3, 2),
    flashColor: 0xfff6e0,
  });

  // ---- camera: the cheer → tilt up and zoom in following the rocket out of the window ---------------
  const wide = { x: 168, y: 122, zoom: 1.55 };
  const follow = ease.inOutCubic(prog(t, T_L - 0.1, T_O + 0.1));
  const out = ease.inOutQuad(prog(t, T_O, T_END + 0.2));
  const fy = rp ? rp[1] - 10 : 110;
  const cam = {
    x: lerp(lerp(wide.x, 194, follow), 184, out),
    y: lerp(lerp(wide.y, Math.min(112, fy + 6), follow), 48, out),
    zoom: lerp(lerp(wide.zoom, 2.05, follow), 2.35, out),
  };
  const [sx, sy] = shake(t, 1.2 * hit(t, T_O, 0.3, 1.5), 13);
  cam.x += sx; cam.y += sy;
  return { img, w: W, h: H, cam: camClamp(cam) };
}
