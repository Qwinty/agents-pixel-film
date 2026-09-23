// Shot 11 (bars 14–17, 24.375–31.875) — ДИРИЖЁР. Wide, the camera sways on the beat.
// The hero stands at HERO_STAND and conducts: a 4/4 baton pattern with a crisp ictus on every
// beat. On each bar's downbeat he points the baton at one bot → it flashes its colour, sings its
// ♪ and adds its layer; from then on it does its job ON the beat, and the light comes back in steps.
//   b(14,1) coder     — power on, first stroke; types 16ths, code lands on the screen, progress climbs
//   b(15,1) barista   — the lamp snaps on; gulps the pink river into its kettle on beats 1–4 (story),
//                       the last gulp bounces the mug back onto the desk (lands on the 16th b(15,4.75))
//   b(16,1) designer  — flings gold paint on every beat: the wall wipes pink → plum-with-stars (story),
//                       beat 3's blob hits the hero and cleans the paint off him
//   b(17,1) tester    — hammer taps the dried power strip on every beat (LED green, tape bands),
//                       the garland chases, dawn starts
import { storyState } from '../story.js';
import { composeRoom, lightRoom, camClamp, blink, hit, prog, sparks, W, H, L, BOTS, BEAT, BAR, b } from './common.js';
import { STATION, HERO_STAND } from './blocking.js';
import { WALLS, drawMug } from '../assets/room.js';
import { clamp, hash, ease, lerp } from '../engine/util.js';
import { noteBurst, noteFlash } from './dark_lib.js';
import {
  LAYERS, T11, beatOf, onBeat, conductorPose, rhythmAmbient, glint, screenLog, stripTape, slurp, sparkArc,
} from './conductor_lib.js';

const CUES11 = [[LAYERS.coder, 'coder'], [LAYERS.barista, 'barista'], [LAYERS.designer, 'designer'], [LAYERS.tester, 'tester']];
const BAR_BOT = ['coder', 'barista', 'designer', 'tester'];
const GOLD = 0xffd98a;

// barista's bass line (16th slot → bounce strength) — the bounce IS the bass
const BASS_BOUNCE = [[0, 0.5], [6, 0.22], [8, 0.36], [12, 0.22], [14, 0.3]];
// mug hop: bumped by the last gulp, lands on the desk on a 16th
const MUG_T0 = b(15, 4) + 0.05, MUG_T1 = b(15, 4.75);
// hero gets cleaned by the designer's beat-3 blob
const CLEAN_T = b(16, 3);

// wall wipe: the story wipe runs linearly over the bar; here it advances in four eased steps,
// each landing a moment after a flung blob hits the wall (same start/end as story.js)
function wipeK(t) {
  let k = 0;
  for (let n = 0; n < 4; n++) k += 0.25 * ease.outCubic(prog(t, b(16, 1 + n) + 0.05, b(16, 1 + n) + 0.3));
  return k;
}
const wipeEdge = (k, y) => k * (W + 40) - 20 + Math.sin(y * 0.35) * 4 - (y - 60) * 0.15;

// ---- bots -----------------------------------------------------------------------------------------
function coderBot(t) {
  const cue = noteFlash(t, LAYERS.coder);
  return {
    name: 'coder', ...STATION.coder,
    t: (t - T11) / BAR,              // warped clock: the bot's typing phase flips exactly on the 16ths
    face: t < LAYERS.coder + 0.22 ? undefined : 'code',
    eyes: 'happy', pose: 'type', antennaWobble: 0.8,
    flash: cue, squash: 0.45 * cue + 0.2 * onBeat(t, 0.16),
  };
}

function baristaBot(t) {
  const s = { name: 'barista', ...STATION.barista, t, lookX: -1, eyes: blink(t, 'normal', 2), tilt: 0.1, steam: false };
  s.squash = 0.04 * Math.sin(t * 2.4);
  if (t < LAYERS.barista - 0.2) return s;
  const cue = noteFlash(t, LAYERS.barista);
  s.flash = cue;
  s.lookX = 1;
  if (t < b(16)) {
    // four gulps on the beats: lean in (stretch, spout down to the river) → GULP (squash)
    const { n, tb } = beatOf(t + 0.17, b(15));
    const g = Math.min(3, Math.max(0, n));
    const tg = b(15) + g * BEAT;
    if (t < tg) { // anticipation
      const u = prog(t, tg - 0.17, tg);
      s.squash = -0.35 * ease.outQuad(u); s.tilt = 0.1 + 0.8 * u; s.eyes = 'normal';
    } else {
      const k = hit(t, tg, 0.3, 1.5);
      s.squash = 0.6 * k; s.tilt = 0.9 * hit(t, tg, 0.12, 1); s.eyes = t < tg + 0.18 ? 'closed' : 'happy';
    }
    if (t >= b(15, 4) && t < MUG_T1 + 0.3) { s.eyes = t < b(15, 4) + 0.18 ? 'closed' : 'surprise'; s.lookX = 1; }
    return s;
  }
  // bass bounce + a steam puff on every beat
  const { tb } = beatOf(t, b(16));
  const s16 = BEAT / 4;
  let sq = 0;
  const bar0 = b(16) + Math.floor((t - b(16)) / BAR) * BAR;
  for (const [slot, a] of BASS_BOUNCE) sq = Math.max(sq, a * hit(t, bar0 + slot * s16, 0.2, 1.6));
  s.squash = sq;
  s.steam = t - tb < 0.3;
  s.eyes = blink(t, 'happy', 2);
  s.lookX = -1;
  return s;
}

function designerBot(t) {
  const s = { name: 'designer', ...STATION.designer, t, lookX: 1, eyes: blink(t, 'normal', 3), paint: GOLD };
  if (t < LAYERS.designer - 0.2) { s.paint = 0xff7ad0; return s; }
  const cue = noteFlash(t, LAYERS.designer);
  s.flash = cue;
  const { n, tb } = beatOf(t + 0.16, b(16));
  if (t < b(17) - 0.16) {
    // alternating big strokes: wind up (stretch) → fling on the beat (squash)
    const dir = n % 2 === 0 ? 1 : -1;
    const from = dir > 0 ? -1.2 : 1.5, to = dir > 0 ? 1.35 : -1.05;
    const prevEnd = n <= 0 ? 0.45 : (dir > 0 ? -1.05 : 1.35);
    if (t < tb) { // anticipation: pull the brush back a little further than the last stroke ended
      const u = prog(t, tb - 0.16, tb - 0.04, ease.outQuad);
      s.brush = lerp(prevEnd, from, u);
      s.squash = -0.3 * u; s.eyes = 'normal';
    } else {
      const u = prog(t, tb, tb + 0.07, ease.outCubic);
      s.brush = lerp(from, to, u);
      s.squash = 0.4 * hit(t, tb, 0.26, 1.6);
      s.eyes = 'happy';
    }
    s.brushLen = 15;
    return s;
  }
  // bar 17: a little flourish on every beat
  const k = hit(t, beatOf(t, b(17)).tb, 0.25, 1.4);
  const side = beatOf(t, b(17)).n % 2 ? -1 : 1;
  s.brush = 0.45 + side * 0.5 * k;
  s.squash = 0.22 * k;
  s.eyes = 'happy';
  return s;
}

function testerBot(t) {
  const s = { name: 'tester', ...STATION.tester, t, eyes: blink(t, 'normal', 5), lookX: 0 };
  if (t < LAYERS.tester - 0.2) {
    s.hammer = -0.2 + Math.sin(t * 3) * 0.08;
    // restless: eyes on the dripping strip, a nervous hop on bar 16's beats
    if (t >= b(16)) s.squash = 0.15 * onBeat(t, 0.14);
    s.lookX = 1;
    return s;
  }
  const cue = noteFlash(t, LAYERS.tester);
  s.flash = cue;
  const { tb } = beatOf(t + 0.16, b(17));
  if (t < tb) { // wind up
    const u = prog(t, tb - 0.16, tb - 0.03, ease.outQuad);
    s.hammer = lerp(0.9, -0.55, u); s.squash = -0.25 * u; s.eyes = 'normal';
  } else { // TINK
    const u = prog(t, tb, tb + 0.05);
    s.hammer = lerp(-0.55, 1.35, u) - 0.25 * prog(t, tb + 0.1, tb + 0.35, ease.outQuad);
    s.squash = 0.5 * hit(t, tb, 0.22, 1.6);
    s.eyes = t < tb + 0.1 ? 'closed' : 'happy';
  }
  s.lookX = 1;
  return s;
}

// ---- camera: drifts toward the bar's bot, sways on 2 beats, nods on every beat --------------------
const CAM_BAR = [
  { x: 166, y: 116, zoom: 1.22 },   // bar 14: coder + monitor
  { x: 176, y: 120, zoom: 1.2 },    // bar 15: barista + river
  { x: 158, y: 106, zoom: 1.1 },    // bar 16: the whole wall (the wipe)
  { x: 182, y: 118, zoom: 1.2 },    // bar 17: tester + strip
];
function camera(t) {
  const bi = clamp(Math.floor((t - T11) / BAR), 0, 3);
  let c = CAM_BAR[bi];
  // glide into the next bar's framing across the last beat (arrives on the downbeat)
  if (bi < 3) {
    const tn = T11 + (bi + 1) * BAR;
    const u = ease.inOutCubic(prog(t, tn - BEAT * 0.9, tn + 0.05));
    const d = CAM_BAR[bi + 1];
    c = { x: lerp(c.x, d.x, u), y: lerp(c.y, d.y, u), zoom: lerp(c.zoom, d.zoom, u) };
  }
  const sway = Math.sin(((t - T11) / (2 * BEAT)) * Math.PI) * 1.6;
  const nod = 1.2 * onBeat(t, 0.28, 2);
  return camClamp({ x: c.x + sway, y: c.y + nod, zoom: c.zoom + 0.01 * onBeat(t, 0.2) });
}

export function render(t) {
  const st = { ...storyState(t) };
  const s16 = BEAT / 4;

  // ---- local continuity overrides (choreography) ----
  if (t >= b(16) && t < b(17)) st.wallWipe = { from: WALLS.pink, to: WALLS.pretty, k: wipeK(t) };
  if (t >= CLEAN_T && t < CLEAN_T + 0.1) st.heroPaint = { color: 0xff5fc8, amount: 0.55, seed: 3 };
  if (t >= b(15) && t < MUG_T0) st.mug = { where: 'floor', fill: 0 };
  else if (t >= MUG_T0 && t < MUG_T1) st.mug = { where: 'none' };
  st.stripWet = t < LAYERS.tester ? st.stripWet : 0;

  // ---- hero ----
  const pose = conductorPose(t, CUES11);
  const bi = clamp(Math.floor((t - T11) / BAR), 0, 3);
  let eyes = blink(t, 'normal', 1);
  let lookX = BAR_BOT[bi] === 'designer' ? -1 : 1, lookY = pose.lookY;
  if (pose.cued) lookX = pose.lookX;
  for (const [tc] of CUES11) if (t >= tc + 0.3 && t < tc + 0.72) eyes = 'happy';
  if (t < LAYERS.coder + 0.3) eyes = 'happy';   // from shot 10's 'idea' straight into joy on the first stroke
  if (t >= CLEAN_T + 0.08 && t < CLEAN_T + 0.4) { eyes = 'round'; lookX = 0; lookY = 1; }
  else if (t >= CLEAN_T + 0.4 && t < CLEAN_T + 0.8) eyes = 'happy';
  if (t >= b(15, 4) + 0.1 && t < MUG_T1 + 0.1) { lookX = 1; lookY = -1; } // follows the flying mug
  const hero = { layer: 'floor', x: HERO_STAND.x, y: HERO_STAND.y + pose.bob, eyes, lookX, lookY, near: pose.near, far: pose.far };

  const bots = [coderBot(t), baristaBot(t), designerBot(t), testerBot(t)];

  const { art, ctx } = composeRoom(st, {
    hero,
    bots,
    afterBack: (a) => {
      // the designer's paint front: a band of gold sparkles riding the wipe edge (on the wall only)
      if (st.wallWipe) {
        const k = st.wallWipe.k;
        const fr = Math.floor(t * 30);
        a.emit(() => {
          for (let y = L.ceilingY + 1; y < L.wallBaseY - 4; y++) {
            const x = Math.round(wipeEdge(k, y));
            if (x < 0 || x >= W) continue;
            const inWin = x >= 84 && x <= 240 && y <= 80;
            const inShelf = x >= 10 && x <= 58 && y >= 22;
            if (inWin || inShelf) continue;
            const hv = hash(y, fr, 7);
            if (hv < 0.35) a.put(x, y, hv < 0.08 ? 0xffffff : GOLD);
            else if (hv < 0.5) a.put(x - 1, y, 0xc89a50);
          }
        });
      }
      // bar 17: stars on the new wall twinkle on the beat
      if (t >= b(17)) {
        const { n, tb } = beatOf(t, b(17));
        for (let j = 0; j < 3; j++) {
          const cx = Math.floor(hash(n, j, 81) * 20), cy = Math.floor(hash(n, j, 82) * 8);
          if (hash(cx, cy, 5) <= 0.55) continue;
          const x = cx * 16 + 7, y = cy * 16 + 7;
          if (y < L.ceilingY + 3 || y > L.wallBaseY - 6 || (x >= 84 && x <= 240 && y <= 80) || (x >= 10 && x <= 58 && y >= 22)) continue;
          glint(a, x, y, prog(t, tb + j * 0.05, tb + j * 0.05 + 0.3), GOLD, 3);
        }
      }
    },
    afterDesk: (a) => {
      // code lands on the monitor in rhythm (one glyph per 16th, a new line per beat)
      screenLog(a, t, LAYERS.coder, { rows: 2 });
    },
    afterFloor: (a) => {
      if (st.mug.where === 'none') {
        // the mug hops from the floor back onto the desk
        const u = prog(t, MUG_T0, MUG_T1);
        const x = Math.round(lerp(L.mugFloor.x, L.mug.x, u));
        const y = Math.round(lerp(L.mugFloor.y, L.mug.y, u) - Math.sin(u * Math.PI) * 18);
        drawMugFly(a, x, y, u);
      }
      if (t >= b(17)) stripTape(a, Math.min(3, beatOf(t, b(17)).n), hit(t, beatOf(t, b(17)).tb, 0.2, 1));
    },
    fx: (a, c) => {
      // ---- cue notes ----
      for (const [tc, name] of CUES11) {
        const r = c.bots[name];
        if (r) noteBurst(a, name, r.top[0], r.top[1], t, tc, { rMax: 15 });
      }
      // ---- the first stroke: a smear arc from shot 10's raised hand down to the pointing baton ----
      if (c.hero?.far?.batonTip && t < LAYERS.coder + 0.1) {
        const [bx, by] = c.hero.far.batonTip;
        const k = 1 - prog(t, LAYERS.coder, LAYERS.coder + 0.1);
        a.emit(() => {
          for (let i = 0; i < 10; i++) {
            const u = i / 10;
            const x = lerp(127, bx, u) - Math.sin(u * Math.PI) * 4, y = lerp(118, by, u);
            a.dput(Math.round(x), Math.round(y), i % 2 ? 0xfff2b0 : 0xffffff, k * (0.35 + 0.65 * u));
          }
        });
      }
      // ---- baton tip sparkle on every ictus ----
      if (c.hero?.far?.batonTip) {
        const [bx, by] = c.hero.far.batonTip;
        const { tb } = beatOf(t);
        if (t - tb < 0.1) a.emit(() => { a.put(Math.round(bx), Math.round(by), 0xffffff); a.put(Math.round(bx) + 1, Math.round(by), 0xfff2b0); a.put(Math.round(bx), Math.round(by) - 1, 0xfff2b0); });
      }
      // ---- coder: a code packet hops from its face to the screen on every beat ----
      if (t >= LAYERS.coder) {
        const { tb } = beatOf(t + 0.18);
        const u = prog(t, tb - 0.18, tb);
        if (u > 0 && u < 1) {
          const x = lerp(158, 186, ease.inQuad(u)), y = lerp(126, 118, u) - Math.sin(u * Math.PI) * 9;
          a.emit(() => { a.rect(Math.round(x), Math.round(y), 2, 1, 0x8ff6ff); a.put(Math.round(x) + 2, Math.round(y), 0x7dff9a); });
        }
      }
      // ---- barista: the river is slurped up into the kettle on each gulp ----
      if (t >= b(15) && t < b(16)) {
        const g = Math.floor((t - b(15)) / BEAT);
        const tg = b(15) + g * BEAT;
        const P = L.river;
        // the stretch removed by this gulp (story: the far end retracts 25 % per beat)
        const i0 = Math.max(0, Math.floor((3 - g) / 4 * (P.length - 1))), i1 = Math.min(P.length - 1, Math.ceil((4 - g) / 4 * (P.length - 1)));
        const from = P.slice(i0, i1 + 1).map(([x, y]) => [x, y - 1]);
        if (g === 3) from.push([L.mugFloor.x - 6, L.mugFloor.y], [L.mugFloor.x + 6, L.mugFloor.y]);
        const r = c.bots.barista;
        if (r) slurp(a, t, tg, from, r.spout, { seed: 20 + g, n: 26, dur: 0.24 });
      }
      // ---- designer: flung gold paint (to the wall edge, beat 3 at the hero) ----
      if (t >= LAYERS.designer - 0.05 && t < b(17)) {
        const { n, tb } = beatOf(t + 0.02, b(16));
        const r = c.bots.designer;
        if (r && n >= 0 && n < 4) {
          const toHero = n === 2;
          const dest = toHero ? [HERO_STAND.x, HERO_STAND.y - 26] : [clamp(wipeEdge((n + 1) / 4 - 0.1, 92), 20, 300), 92];
          sparkArc(a, t, tb, r.brushTip, dest, { dur: toHero ? 0.1 : 0.2, arc: toHero ? 6 : 26, color: GOLD, n: 8 });
        }
      }
      // ---- the hero gets cleaned: a sparkle sweep down his body ----
      if (t >= CLEAN_T + 0.08 && t < CLEAN_T + 0.6) {
        const u = prog(t, CLEAN_T + 0.08, CLEAN_T + 0.5);
        const y = Math.round(HERO_STAND.y - 46 + u * 46);
        a.emit(() => {
          for (let x = HERO_STAND.x - 13; x <= HERO_STAND.x + 13; x++) if (hash(x, Math.floor(t * 30), 3) > 0.55) a.put(x, y, hash(x, 5) > 0.5 ? 0xffffff : 0xffc2ee);
        });
        sparks(a, HERO_STAND.x, HERO_STAND.y - 26, t, CLEAN_T + 0.08, { n: 14, seed: 61, speed: 34, life: 0.45, gravity: 30, colors: [0xffffff, 0xffc2ee, GOLD] });
      }
      // ---- tester: tink sparks off the strip on every beat ----
      if (t >= LAYERS.tester) {
        const { tb } = beatOf(t, b(17));
        const r = c.bots.tester;
        const hx = r?.hammerHead?.[0] ?? 278, hy = r?.hammerHead?.[1] ?? 155;
        sparks(a, hx, hy - 2, t, tb, { n: 9, seed: 70 + Math.round(tb * 10), speed: 34, life: 0.28, gravity: 80, colors: [0xffffff, 0xd8ff9a, 0x5cff6a] });
      }
    },
  });

  // ---- light: comes back in steps with every layer, a small lift on every beat ----
  const lights = [];
  for (const [tc, name] of CUES11) {
    const f = noteFlash(t, tc, 0.4);
    const r = ctx.bots[name];
    if (f > 0 && r) lights.push({ x: r.center[0], y: r.center[1], r: 60, ry: 48, color: BOTS[name].color, i: 1.4 * f, pow: 1.4 });
  }
  if (t >= LAYERS.tester) lights.push({ x: L.strip.x + 1, y: L.strip.y + 2, r: 14, color: 0x5cff6a, i: 0.5 + 0.5 * onBeat(t, 0.2), pow: 1.2 });
  if (t >= CLEAN_T + 0.08) lights.push({ x: HERO_STAND.x, y: HERO_STAND.y - 24, r: 40, color: 0xffc2ee, i: 1.2 * hit(t, CLEAN_T + 0.08, 0.35, 1.5), pow: 1.3 });
  const img = lightRoom(art, ctx, {
    ambient: rhythmAmbient(st, t),
    lights,
    flash: 0.28 * hit(t, LAYERS.coder, 0.3, 2),   // power back on
    flashColor: 0xdff4ff,
  });
  return { img, w: W, h: H, cam: camera(t) };
}

// the mug in flight: spins once (drawn on its side mid-air), full of fresh coffee when it lands
function drawMugFly(a, x, y, u) {
  drawMug(a, x, y, { tilt: u > 0.2 && u < 0.75 ? 1 : 0, fill: 0.9 });
}
