// Shot 12 (bars 18–19, 31.875–35.625) — МОНТАЖ: всё сходится. Four hard-cut close-ups, one per
// half bar; in each the bot finishes its part with ONE action landing on the cut (the score puts
// that bot's accent on the cut: key clack · cup clink · brush swish · tink), a squash and a flash
// of its colour, then a satisfied beat.
//   b(18,1) coder    — slams the last key (squash, blue flash, "✓ done" on the screen) → salutes on beat 2
//   b(18,3) barista  — at the top of a hop, the last drop from its kettle lands in the fresh mug
//                      (clean floor, steam) → lands back on the floor on beat 4
//   b(19,1) designer — the last brush stroke flings gold onto the plum wall → a gold star pops on
//                      the "and", the brush glints on beat 2
//   b(19,3) tester   — taps the dry strip (LED green) → leaps and whacks the monitor on
//                      montage.progress100 b(19,4): 100 %, clock 05:59 → lands on the desk right of
//                      the monitor at (246,139) for shot 13
import { storyState } from '../story.js';
import { composeRoom, lightRoom, camClamp, camKeys, blink, hit, prog, sparks, shake, ring, W, H, L, BOTS, BEAT, CUES } from './common.js';
import { STATION, HERO_STAND, DESK_Y } from './blocking.js';
import { clamp, hash, ease, lerp } from '../engine/util.js';
import { mix } from '../engine/color.js';
import { starBurst } from './dark_lib.js';
import { LAYERS, beatOf, onBeat, conductorPose, glint, goldStar, screenLog, stripTape, sparkArc } from './conductor_lib.js';

const M = CUES.montage;
const [C0, C1, C2, C3] = M.cuts;
const P100 = M.progress100;
const GOLD = 0xffd98a;
const panelOf = (t) => (t < C1 ? 0 : t < C2 ? 1 : t < C3 ? 2 : 3);

// ---- barista hop (panel 2): at the apex on the cut, lands on the next beat ------------------------
const BAR_APEX = { x: 195, y: 137 };
function baristaHop(t) {
  const land = C1 + BEAT;
  if (t < C1 + 0.12) return { x: BAR_APEX.x, y: BAR_APEX.y, air: true };
  if (t < land) {
    const u = prog(t, C1 + 0.12, land);
    return { x: lerp(BAR_APEX.x, STATION.barista.x, u), y: lerp(BAR_APEX.y, STATION.barista.y, ease.inQuad(u)), air: true };
  }
  return { x: STATION.barista.x, y: STATION.barista.y, air: false };
}

// ---- tester leap (panel 4): tap the strip on the cut → leap → whack on P100 → land on the desk -----
const WHACK = { x: 215, y: 83 };   // on top of the monitor: bonk from above
export const TESTER_END = { x: 246, y: DESK_Y };
const T_OFF = C3 + 0.15, T_HOP = P100 + 0.12, T_LAND = P100 + 0.38;
function testerLeap(t) {
  if (t < T_OFF) return { x: STATION.tester.x, y: STATION.tester.y, phase: 'tap' };
  if (t < P100) {
    const u = prog(t, T_OFF, P100);
    const e = ease.outQuad(u);
    return { x: lerp(STATION.tester.x, WHACK.x, e), y: lerp(STATION.tester.y, WHACK.y, e) - Math.sin(u * Math.PI) * 14, phase: 'fly', u };
  }
  if (t < T_HOP) return { ...WHACK, phase: 'whack' };
  if (t < T_LAND) {
    const u = prog(t, T_HOP, T_LAND);
    return { x: lerp(WHACK.x, TESTER_END.x, u), y: lerp(WHACK.y, TESTER_END.y, ease.inQuad(u)) - Math.sin(u * Math.PI) * 10, phase: 'hop', u };
  }
  return { ...TESTER_END, phase: 'done' };
}

function bots(t) {
  const p = panelOf(t);
  const groove = 0.18 * onBeat(t, 0.18);
  // ---- coder ----
  const coder = { name: 'coder', ...STATION.coder, t, eyes: 'happy', squash: groove };
  if (t < C0 + 0.16) {
    coder.face = 'code'; coder.pose = undefined; coder.squash = 0.65 * hit(t, C0, 0.3, 1.3);
    coder.flash = hit(t, C0, 0.4, 1.4);
  } else {
    coder.flash = hit(t, C0, 0.4, 1.4);
    coder.squash = Math.max(groove, 0.4 * hit(t, C0 + BEAT, 0.25, 1.5));
    if (t >= C0 + BEAT) coder.pose = 'salute';
    if (t < C0 + BEAT) coder.squash = Math.max(coder.squash, 0.65 * hit(t, C0, 0.3, 1.3));
  }
  // ---- barista ----
  const hop = p >= 1 ? baristaHop(t) : { ...STATION.barista, air: false };
  const barista = { name: 'barista', x: hop.x, y: hop.y, t, eyes: 'happy', steam: false, tilt: 0, squash: groove };
  if (p >= 1) {
    barista.flash = 0.55 * hit(t, C1 + 0.03, 0.4, 1.4);
    if (hop.air) {
      barista.tilt = 1 - prog(t, C1 + 0.1, C1 + 0.26);
      barista.squash = t < C1 + 0.12 ? 0.2 * hit(t, C1, 0.12) : -0.3;
      barista.eyes = t < C1 + 0.12 ? 'closed' : 'happy';
    } else {
      barista.squash = Math.max(groove, 0.6 * hit(t, C1 + BEAT, 0.3, 1.5));
      barista.steam = true;
    }
  }
  // ---- designer ----
  const designer = { name: 'designer', ...STATION.designer, t, eyes: 'happy', paint: GOLD, squash: groove, lookX: 1 };
  if (p >= 2) {
    designer.flash = hit(t, C2, 0.4, 1.4);
    const u = prog(t, C2, C2 + 0.07, ease.outCubic);
    designer.brush = lerp(-1.2, 1.3, u) - 0.9 * prog(t, C2 + 0.2, C2 + BEAT, ease.inOutQuad);
    designer.brushLen = 15;
    designer.squash = Math.max(groove, 0.45 * hit(t, C2, 0.26, 1.6));
  }
  // ---- tester ----
  const tl = p >= 3 ? testerLeap(t) : { ...STATION.tester, phase: 'idle' };
  const tester = { name: 'tester', x: tl.x, y: tl.y, t, eyes: 'happy', squash: groove, hammer: -0.2 + Math.sin(t * 3) * 0.08, lookX: 1 };
  if (p >= 3) {
    tester.flash = Math.max(0.8 * hit(t, C3, 0.35, 1.4), 0.5 * hit(t, P100 + 0.04, 0.45, 1.3));
    if (tl.phase === 'tap') {
      tester.hammer = lerp(-0.55, 1.35, prog(t, C3, C3 + 0.04)) - 1.2 * prog(t, C3 + 0.07, T_OFF);
      tester.squash = 0.5 * hit(t, C3, 0.1, 1) + 0.4 * prog(t, C3 + 0.06, T_OFF);   // tap → crouch
      tester.eyes = t < C3 + 0.08 ? 'closed' : 'normal';
    } else if (tl.phase === 'fly') {
      tester.hammer = lerp(0.15, -0.9, ease.outQuad(tl.u));   // winds the hammer up and back
      tester.squash = tl.u < 0.85 ? -0.5 : 0.2;
      tester.eyes = 'angry';
    } else if (tl.phase === 'whack') {
      tester.hammer = lerp(-0.9, 2.0, prog(t, P100, P100 + 0.035));   // BONK on the monitor's top
      tester.squash = 0.5 * hit(t, P100, 0.12, 1);
      tester.eyes = 'closed';
    } else if (tl.phase === 'hop') {
      tester.hammer = lerp(2.0, 0.3, tl.u);
      tester.squash = -0.3;
      tester.eyes = 'happy';
    } else {
      tester.hammer = 0.3 - 0.5 * prog(t, T_LAND, T_LAND + 0.15, ease.outBack);   // hammer up, proud
      tester.squash = Math.max(groove, 0.55 * hit(t, T_LAND, 0.25, 1.5));
      tester.eyes = 'happy';
    }
  }
  return [coder, barista, designer, tester];
}

// ---- cameras: one fixed close-up per panel with a slight push-in (hard cuts between) ---------------
const CAMS = [
  [[C0, { x: 180, y: 117, zoom: 2.7 }], [C1, { x: 180, y: 118, zoom: 2.85 }]],
  [[C1, { x: 200, y: 139, zoom: 2.5 }], [C2, { x: 199, y: 140, zoom: 2.62 }]],
  [[C2, { x: 104, y: 128, zoom: 2.05 }], [C3, { x: 106, y: 127, zoom: 2.16 }]],
  [[C3 + 0.12, { x: 244, y: 124, zoom: 2.0 }], [P100 - 0.08, { x: 238, y: 110, zoom: 2.05 }, ease.inOutQuad], [T_LAND, { x: 240, y: 116, zoom: 2.1 }, ease.inOutQuad], [CUES.deploy, { x: 240, y: 117, zoom: 2.14 }]],
];

export function render(t) {
  const st = { ...storyState(t) };
  const p = panelOf(t);
  if (p === 1 && t >= C1) st.mug = { ...st.mug, fill: 1.2, steam: true };
  if (p === 3) st.screen = { ...st.screen, barColor: t >= P100 && t < P100 + 0.12 ? 0xffffff : undefined };

  // hero keeps conducting the full track; looks at whoever is finishing
  const pose = conductorPose(t, []);
  let eyes = blink(t, 'happy', 1), lookX = [1, 1, -1, 1][p], lookY = [-1, 0, 0, -1][p];
  if (p === 2 && t >= C2 + BEAT / 2) { lookX = 0; lookY = -1; eyes = t < C2 + BEAT ? 'round' : 'happy'; }
  const hero = { layer: 'floor', ...HERO_STAND, y: HERO_STAND.y + pose.bob, eyes, lookX, lookY, near: pose.near, far: pose.far };

  const STAR_AT = [128, 100];
  const { art, ctx } = composeRoom(st, {
    hero,
    bots: bots(t),
    afterBack: (a) => {
      // the designer's last star on the wall (pops on the "and" after its stroke)
      if (t >= C2 + BEAT / 2) {
        const k = prog(t, C2 + BEAT / 2, C2 + BEAT / 2 + 0.12);
        goldStar(a, STAR_AT[0], STAR_AT[1], { big: k > 0.5 });
      }
    },
    afterDesk: (a) => {
      screenLog(a, t, LAYERS.coder, { rows: 2, doneAt: C0 });
    },
    afterFloor: (a) => {
      stripTape(a, 3, 0);
    },
    fx: (a, c) => {
      // ---- 1. coder: key sparks under its hands on the slam ----
      if (p === 0) {
        const r = c.bots.coder;
        for (const [hx, hy] of r?.hands ?? []) sparks(a, hx, hy + 1, t, C0, { n: 6, seed: 5 + hx, speed: 22, life: 0.25, gravity: 60, colors: [0xffffff, 0x8ff6ff] });
        ring(a, r.center[0], r.center[1], prog(t, C0, C0 + 0.35), BOTS.coder.color, 14);
      }
      // ---- 2. barista: the last drop → splash crown in the mug ----
      if (p === 1) {
        const r = c.bots.barista;
        const mx = L.mug.x, my = L.mug.y - 9;
        if (r && t < C1 + 0.07) {
          const [sx, sy] = r.spout;
          a.line(sx, sy + 1, sx, my - 1, 0x5a3522); a.put(sx, my - 2, 0x8a5a3a);
        }
        if (r && t >= C1 + 0.07 && t < C1 + 0.22) { // the very last drop falls from the spout
          const [sx, sy] = r.spout;
          const u = prog(t, C1 + 0.07, C1 + 0.2, ease.inQuad);
          a.rect(sx, Math.round(lerp(sy + 1, my - 1, u)), 1, 2, 0x5a3522);
        }
        sparks(a, mx, my, t, C1, { n: 10, seed: 17, speed: 26, life: 0.3, gravity: 120, spread: 1.6, colors: [0x8a5a3a, 0xc88a5a, 0xfff2c8] });
        sparks(a, mx, my, t, C1 + 0.2, { n: 5, seed: 18, speed: 14, life: 0.22, gravity: 120, spread: 1.2, colors: [0x8a5a3a, 0xfff2c8] });
        ring(a, mx, my, prog(t, C1, C1 + 0.3), BOTS.barista.color, 9);
        glint(a, mx - 2, my + 3, prog(t, C1 + BEAT, C1 + BEAT + 0.3), 0xffffff, 3);
      }
      // ---- 3. designer: gold flung from the brush → star; brush glint on beat 2 ----
      if (p === 2) {
        const r = c.bots.designer;
        if (r) {
          sparkArc(a, t, C2 + 0.02, r.brushTip, STAR_AT, { dur: BEAT / 2 - 0.02, arc: 16, color: GOLD, n: 9 });
          glint(a, r.brushTip[0], r.brushTip[1], prog(t, C2 + BEAT, C2 + BEAT + 0.34), 0xfff2c8, 4);
        }
        ring(a, STAR_AT[0], STAR_AT[1], prog(t, C2 + BEAT / 2, C2 + BEAT / 2 + 0.3), GOLD, 10);
        glint(a, STAR_AT[0] + 3, STAR_AT[1] - 3, prog(t, C2 + BEAT + 0.08, C2 + BEAT + 0.4), 0xffffff, 3);
        sparks(a, STAR_AT[0], STAR_AT[1], t, C2 + BEAT / 2, { n: 10, seed: 23, speed: 24, life: 0.35, gravity: 20, colors: [0xffffff, GOLD] });
      }
      // ---- 4. tester: tink on the strip, then the WHACK ----
      if (p === 3) {
        const r = c.bots.tester;
        sparks(a, 279, 153, t, C3, { n: 9, seed: 31, speed: 30, life: 0.28, gravity: 80, colors: [0xffffff, 0xd8ff9a, 0x5cff6a] });
        const hx = 229, hy = 83;
        starBurst(a, hx, hy, t, P100, { n: 8, seed: 9, r: 12, life: 0.5, color: 0xd8ff9a });
        sparks(a, hx, hy, t, P100, { n: 16, seed: 33, speed: 46, life: 0.4, gravity: 90, colors: [0xffffff, 0xfff27a, 0x5cff6a] });
        ring(a, 201, 108, prog(t, P100 + 0.03, P100 + 0.4), 0x7dff9a, 18);
        if (r && t >= T_LAND) glint(a, r.hammerHead[0], r.hammerHead[1] - 1, prog(t, T_LAND + 0.15, T_LAND + 0.45), 0xffffff, 3);
      }
    },
  });

  // ---- light: each panel's bot glows in its colour on its hit ----
  const lights = [];
  const hitT = [C0, C1, C2, C3][p], name = M.bots[p];
  const r = ctx.bots[name];
  const f = Math.max(hit(t, hitT, 0.4, 1.4), p === 3 ? hit(t, P100, 0.5, 1.3) : 0);
  if (r && f > 0) lights.push({ x: r.center[0], y: r.center[1], r: 46, ry: 38, color: BOTS[name].color, i: 1.3 * f, pow: 1.4 });
  if (p === 2 && t >= C2 + BEAT / 2) lights.push({ x: STAR_AT[0], y: STAR_AT[1], r: 22, color: GOLD, i: 0.5 + 0.9 * hit(t, C2 + BEAT / 2, 0.4, 1.5), pow: 1.3 });
  if (p === 3) lights.push({ x: L.strip.x + 1, y: L.strip.y + 2, r: 14, color: 0x5cff6a, i: 0.6 + 0.8 * hit(t, C3, 0.3), pow: 1.2 });
  if (p === 3 && t >= P100) lights.push({ x: 201, y: 108, r: 70, ry: 50, color: 0x9affb0, i: 1.2 * hit(t, P100, 0.5, 1.4), pow: 1.3 });
  const img = lightRoom(art, ctx, {
    lights,
    flash: 0.1 * hit(t, hitT, 0.12, 1) + (p === 3 ? 0.18 * hit(t, P100, 0.2, 1.5) : 0),
    flashColor: mix(BOTS[name].color, 0xffffff, 0.6),
  });

  let cam = camKeys(t, CAMS[p], ease.linear);
  if (p === 3) {
    const [sx, sy] = shake(t, 2.2 * hit(t, P100, 0.35, 1.5), 4, 22);
    cam = { ...cam, x: cam.x + sx, y: cam.y + sy };
  }
  return { img, w: W, h: H, cam: camClamp(cam) };
}
