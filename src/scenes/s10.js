// Shot 10 (bars 12–13) — ДОГАДКА.
// Dark room: only the monitor (boot, 12%) and the bots' eyes glow. The barista hiccups its note,
// the hero looks, then points at three bots in turn — each answers with its own note. The tester's
// high C completes the chord, the hero's eyes turn into an idea and his hand goes up like a
// conductor's. One slow, accelerating push-in onto the hero across the two bars.
//
// Beats: dark.start b(12,1) · dark.hiccup b(12,2) · dark.look b(12,3)
//        dark.points b(12,4)/b(13,1)/b(13,2) · dark.idea b(13,3) · dark.raise b(13,4)
import { storyState } from '../story.js';
import {
  composeRoom, lightRoom, camClamp, blink, hit, prog, heroShoulder, ik2, sparks,
  W, H, CUES, BOTS, b,
} from './common.js';
import { STATION, HERO_STAND } from './blocking.js';
import { EYE_GLOW } from '../assets/bots.js';
import { hash, ease, lerp, keys } from '../engine/util.js';
import { noteBurst, noteFlash, twinkle } from './dark_lib.js';

const D = CUES.dark;
const T0 = b(12), T1 = b(14);
const HX = HERO_STAND.x, HY = HERO_STAND.y;

// ---- camera: one slow, accelerating push 1.12 → 2.2, pinned to the floor line ------------------
// z(u) = 1.12 + 1.08·u⁴ keeps the whole cast in frame through the tester's note (z ≈ 1.46 at the
// idea; x leans right so the tester is in), then the push accelerates onto the hero raising his hand.
function camAt(t) {
  const u = prog(t, T0, T1);
  const z = 1.12 + 1.08 * u * u * u * u;
  const x = keys(u, [[0, 160], [0.75, 172, ease.inOutQuad], [1, 148, ease.inOutQuad]]);
  return { x, y: 180 - 90 / z, zoom: z };
}

// every note event of the shot: [time, bot]
const EVENTS = [[D.hiccup, 'barista'], ...D.points.map((p, i) => [p, D.pointBots[i]]), [D.idea, 'tester']];

// what the hero points at (a point on each bot's face) and with which arm
const TARGET = {
  barista: { side: 'far', p: [STATION.barista.x, STATION.barista.y - 10] },
  coder: { side: 'far', p: [STATION.coder.x, STATION.coder.y - 10] },
  designer: { side: 'near', p: [STATION.designer.x, STATION.designer.y - 8] },
};
const REST = { near: Math.PI / 2 + 0.17, far: Math.PI / 2 - 0.17 };

export function render(t, shot) {
  const st = { ...storyState(t), wallNotes: 0.45 };

  // ---- which bot is sounding right now --------------------------------------------------------
  const flashOf = {};
  for (const [bt, name] of EVENTS) flashOf[name] = Math.max(flashOf[name] || 0, noteFlash(t, bt));
  const answered = (name) => EVENTS.some(([bt, n]) => n === name && t >= bt && bt !== D.hiccup);

  // ---- hero ------------------------------------------------------------------------------------
  let near = { a: REST.near, len: 8, hand: 'open' };
  let far = { a: REST.far, len: 8, hand: 'open' };
  let lookX = 0, lookY = 0;
  let eyes = blink(t, 'half', 4);
  const breathe = t < D.look && Math.sin(t * 2.6) > 0.55 ? -1 : 0; // slow breathing while dazed

  if (t >= D.hiccup + 0.1 && t < D.look) eyes = 'half';           // hears something…
  if (t >= D.look) { lookX = 1; eyes = blink(t, 'round', 4); }     // …and turns his eyes to it

  // pointing: the arm snaps out just before each cue (anticipation) and holds until the next one
  const LEAD = 0.1;
  let pointIdx = -1;
  for (let i = 0; i < D.points.length; i++) if (t >= D.points[i] - LEAD) pointIdx = i;
  if (pointIdx >= 0 && t < D.raise - 0.12) {
    const name = D.pointBots[pointIdx];
    const tg = TARGET[name];
    const S = heroShoulder(HX, HY, tg.side);
    const aim = Math.atan2(tg.p[1] - S[1], tg.p[0] - S[0]);
    const u = ease.outBack(prog(t, D.points[pointIdx] - LEAD, D.points[pointIdx] + 0.1));
    const a = lerp(REST[tg.side], aim, u);
    const arm = { a, len: 8 + u * 2, hand: 'point', fingerA: a, fingerLen: 5 };
    if (tg.side === 'near') { near = arm; lookX = -1; } else { far = arm; lookX = 1; }
    lookY = tg.p[1] < S[1] - 8 ? -1 : 0;
  }
  if (t >= D.idea) { eyes = 'idea'; lookX = 0; lookY = -1; }
  const rise = t >= D.raise ? -1 : 0; // he straightens up on the raise
  if (t >= D.raise - 0.12) {
    // anticipation into the conductor shot: the free hand goes up, a finger for a baton
    const u = ease.outBack(prog(t, D.raise - 0.12, D.raise + 0.18));
    // the hand rises beside his head (two-bone IK), forefinger up like a baton
    const S = heroShoulder(HX, HY + rise, 'far');
    const rest = [S[0] + Math.cos(REST.far) * 12, S[1] + Math.sin(REST.far) * 12];
    const top = [S[0] + 9, S[1] - 11];
    const T = [lerp(rest[0], top[0], u), lerp(rest[1], top[1], u)];
    far = { ...ik2(S, T, 8, 7), hand: 'point', fingerA: lerp(REST.far, -Math.PI / 2 - 0.15, u), fingerLen: 5 };
    near = { a: lerp(near.a, REST.near + 0.2, u), len: 8, hand: 'open' };
    eyes = 'idea'; lookY = -1; lookX = 0;
  }

  // ---- bots (all at STATION, eyes glowing in the dark) -----------------------------------------
  const botState = (name, extra = {}) => {
    const f = flashOf[name] || 0;
    const hic = name === 'barista' && t >= D.hiccup && t < D.hiccup + 0.45;
    return {
      name, ...STATION[name], glow: true, t,
      flash: f,
      squash: f * 0.5 - (hic ? 0.3 * hit(t, D.hiccup, 0.25) : 0),
      eyes: hic ? 'surprise' : f > 0.05 ? 'happy' : answered(name) ? 'normal' : blink(t, 'normal', name.length),
      lookX: answered(name) || (name === 'barista' && t > D.hiccup + 0.45) ? (STATION[name].x > HX ? -1 : 1) : 0,
      ...extra,
    };
  };

  const { art, ctx } = composeRoom(st, {
    hero: { layer: 'floor', x: HX, y: HY + breathe + rise, eyes, lookX, lookY, near, far },
    bots: [
      botState('coder', { face: undefined, antennaWobble: 0.5 }),
      botState('barista', { tilt: 0.1, steam: false, mouth: 'none' }),
      botState('designer', { brush: 0.35 + Math.sin(t * 1.4) * 0.06 }),
      botState('tester', { hammer: -0.25 + Math.sin(t * 1.6) * 0.08 - (flashOf.tester || 0) * 0.8 }),
    ],
    fx: (a, c) => {
      // dust motes drifting in the monitor's light (the room stays alive in the dark)
      a.emit(() => {
        for (let k = 0; k < 26; k++) {
          const ph = (t * (0.05 + hash(k, 2) * 0.05) + hash(k, 1)) % 1;
          const x = 80 + hash(k, 3) * 150 + Math.sin(t * 0.7 + k) * 3;
          const y = 160 - ph * 70;
          a.dput(Math.round(x), Math.round(y), 0x7fa8d8, 0.16 + 0.12 * Math.sin(t * 2 + k));
        }
      });
      // each bot's note: ring + ♪ in its own colour
      for (const [bt, name] of EVENTS) {
        const r = c.bots[name];
        if (!r) continue;
        noteBurst(a, name, r.top[0], r.top[1] + 4, t, bt, { rMax: name === 'tester' ? 12 : 15 });
      }
      // the idea: his eyes spark — twinkles pop at both glints, a few sparks fly off his head
      if (t >= D.idea && c.hero) {
        const oy = Math.round(HY + rise) - 45, ox = HX - 12;
        const k = prog(t, D.idea, D.idea + 0.3);
        const size = k < 1 ? [1, 2, 3, 3, 2][Math.floor(k * 5)] : (Math.floor((t - D.idea) * 6) % 3 === 0 ? 1 : 0);
        twinkle(a, ox + 9, oy + 10, size);
        twinkle(a, ox + 20, oy + 10, size);
        sparks(a, ox + 12, oy + 2, t, D.idea, { n: 10, seed: 71, speed: 30, life: 0.45, gravity: 40, spread: 2.2, dir: -Math.PI / 2, colors: [0xfff6c0, 0xffffff, 0xffe066] });
      }
      // the raise: a glint on the fingertip, like the tip of a baton catching the light
      const tip = c.hero?.far?.finger;
      if (t >= D.raise && tip) {
        const k = prog(t, D.raise, D.raise + 0.25);
        const size = k < 1 ? [1, 2, 3, 2][Math.floor(k * 4)] : 1 + (Math.floor((t - D.raise) * 8) % 2);
        twinkle(a, tip[0], tip[1] - 1, size, 0xfff2b0);
      }
    },
  });

  // ---- light: DARK rig, dim monitor, glowing eyes ------------------------------------------------
  const lights = [
    // soft fill so the hero reads as a silhouette with a lit edge
    { x: 128, y: 148, r: 58, ry: 48, color: 0x4a68b8, i: 0.34, pow: 1.5 },
  ];
  for (const name of ['coder', 'barista', 'designer', 'tester']) {
    const r = ctx.bots[name];
    if (!r) continue;
    const f = flashOf[name] || 0;
    lights.push({ x: r.eyes[0], y: r.eyes[1], r: 11, color: EYE_GLOW[name], i: 0.30, pow: 1.2 });
    if (f > 0) lights.push({ x: r.center[0], y: r.center[1], r: 54, ry: 44, color: BOTS[name].color, i: 1.5 * f, pow: 1.4 });
  }
  // the idea: a warm glow on his face
  // the idea: a warm glow on his face that stays with him (and his raised hand) to the end
  const ig = hit(t, D.idea, 0.5, 1.5);
  if (t >= D.idea) lights.push({ x: HX + 2, y: HY - 34, r: 34, color: 0xfff2b0, i: 0.9 * ig + 0.45, pow: 1.4 });

  const cam = camAt(t);
  const img = lightRoom(art, ctx, {
    rig: { monitorLight: 0.3 },
    spriteLight: { floor: 0.14, keep: 0.62 },
    lights,
    flash: 0.05 * (flashOf.barista || 0) + 0.05 * (flashOf.coder || 0)
      + 0.05 * (flashOf.designer || 0) + 0.08 * (flashOf.tester || 0),
  });
  return { img, w: W, h: H, cam: camClamp(cam) };
}
