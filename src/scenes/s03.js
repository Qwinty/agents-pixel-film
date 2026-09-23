// Shot 3 (bar 4, 5.625–7.500) — the four bots salute in a row (beat 1). On beat 3 the hero points
// at the mountain of sticky notes and every bot turns to look at it. On beat 4 they scatter in four
// directions (coder ↑ onto the desk, designer ←, barista →, tester ↘ to the power strip) and the
// camera whips right into shot 4. Camera: low on the row → up to include the hero → whip pan.
import { storyState } from '../story.js';
import { composeRoom, lightRoom, camClamp, camKeys, hit, prog, speedLines, sparks, W, H, CUES, SEATED_ARMS, BEAT, heroShoulder } from './common.js';
import { SPAWN_X, FLOOR_Y, STATION } from './blocking.js';
import { SPAWN_ORDER } from '../timeline.js';
import { ease, clamp, hash } from '../engine/util.js';
import { L } from '../assets/room.js';
import { RAMPS, OUT } from '../assets/bots.js';

// salute arm per bot, relative to its feet anchor: shoulder → elbow (out & up) → flat hand at the brow
const SALUTE = {
  coder: { s: [-9, -9], e: [-13, -14], h: [-6, -17] },
  barista: { s: [-8, -10], e: [-13, -15], h: [-6, -16] },
  designer: { s: [-4, -10], e: [-9, -14], h: [-3, -17] },
  tester: { s: [-5, -5], e: [-9, -8], h: [-4, -10] },
};
function saluteArm(art, name, x, y, k) {
  const A = SALUTE[name], R = RAMPS[name];
  const lerp2 = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
  // k 0..1: the hand swings up from the side to the brow
  const rest = [A.s[0] - 1, A.s[1] + 5];
  const e = lerp2(rest, A.e, k), h = lerp2([rest[0] - 1, rest[1] + 3], A.h, k);
  const P = (p) => [x + p[0], y + p[1]];
  const [sx, sy] = P(A.s), [ex, ey] = P(e), [hx, hy] = P(h);
  art.thick(sx, sy, ex, ey, 1.4, OUT); art.thick(ex, ey, hx, hy, 1.4, OUT);
  art.rect(Math.round(hx) - 2, Math.round(hy) - 2, 5, 4, OUT);
  art.thick(sx, sy, ex, ey, 0.5, R.light); art.thick(ex, ey, hx, hy, 0.5, R.light);
  art.rect(Math.round(hx) - 1, Math.round(hy) - 1, 3, 2, R.hi);
}

const tS = CUES.salute, tP = CUES.heroPoint, tF = CUES.flyoff, tEnd = CUES.coder.typing;
const WHIP0 = tF + BEAT / 2;

// fly-off: four directions — coder ↑ onto the desk, designer ← out of frame, barista ↗ big hop
// out to the right, tester → scuttling low to the strip. (They reach their STATIONs off-screen.)
const FLY = {
  coder: { dur: 0.3, arc: 16, to: null },
  designer: { dur: 0.34, arc: 12, to: [44, 172] },
  barista: { dur: 0.36, arc: 26, to: [236, 172] },
  tester: { dur: 0.3, arc: 3, to: [262, 164] },
};

export function render(t) {
  const st = storyState(t);
  const bots = [];
  SPAWN_ORDER.forEach((name, k) => {
    const x0 = SPAWN_X[name], y0 = FLOOR_Y;
    // salute snaps in on the beat (tiny stagger for comedy), held until the fly-off
    const tSal = tS + k * 0.03;
    const saluting = t >= tSal && t < tF;
    const land = hit(t, tSal, 0.2, 1.5);
    const hop = t >= tSal && t < tSal + 0.12 ? -2 : 0;
    let x = x0, y = y0 + hop, squash = saluting ? 0.35 * land : 0, layer = 'floor';
    // everyone looks at the sticky mountain when the hero points at it
    let lookX = t >= tP + 0.06 && t < tF ? -1 : 0;
    let eyes = saluting && t < tSal + 0.25 ? 'happy' : 'normal';
    if (t >= tF) {
      const f = FLY[name], dest = f.to ? { x: f.to[0], y: f.to[1] } : STATION[name];
      const u = clamp((t - tF - k * 0.02) / f.dur);
      const e = ease.inOutQuad(u);
      x = x0 + (dest.x - x0) * e;
      y = y0 + (dest.y - y0) * e - Math.sin(u * Math.PI) * f.arc;
      squash = u > 0 && u < 1 ? -0.5 : u >= 1 ? 0.4 * hit(t, tF + k * 0.02 + f.dur, 0.18) : 0;
      layer = name === 'coder' && u > 0.5 ? 'desk' : 'floor';
      eyes = u < 1 ? 'closed' : 'normal';
      lookX = dest.x > x0 ? 1 : -1;
    } else if (t >= tF - 0.1) {
      squash = 0.35; // anticipation crouch before the jump
    }
    bots.push({ name, x, y, layer, squash, eyes, lookX, steam: name === 'barista', t, salute: saluting ? ease.outBack(prog(t, tSal, tSal + 0.12)) : 0 });
  });

  // the hero: pleased by the salute, then points left at the sticky mountain
  let arms = SEATED_ARMS.rest, eyes = 'normal', lookX = 0, lookY = 1;
  if (t >= tS && t < tS + 0.3) eyes = 'happy';
  if (t >= tP) {
    const S = heroShoulder(L.hero.x, L.hero.y, 'near');
    const k = ease.outBack(prog(t, tP, tP + 0.14));
    const aim = Math.atan2(L.stickies.y - 22 - S[1], L.stickies.x - S[0]);
    arms = { near: { a: Math.PI / 2 + 0.15 + (aim - Math.PI / 2 - 0.15) * k, len: 9, hand: 'point' }, far: SEATED_ARMS.rest.far };
    lookX = -1; lookY = 0;
  }
  if (t >= tF + 0.1) { eyes = 'round'; lookX = 1; lookY = 1; } // watches them zoom off
  const whip = Math.min(1, prog(t, WHIP0, tEnd) * 1.8);

  const { art, ctx } = composeRoom(st, {
    hero: { eyes, lookX, lookY, ...arms },
    bots: bots.map(({ salute, ...b }) => b),
    fx: (a, c) => {
      for (const b of bots) if (b.salute > 0) a.tagged({ coder: 11, barista: 12, tester: 13, designer: 14 }[b.name], () => saluteArm(a, b.name, Math.round(b.x), Math.round(b.y), b.salute));
      // dust puffs at the launch spots
      SPAWN_ORDER.forEach((name, k) => sparks(a, SPAWN_X[name], FLOOR_Y - 1, t, tF + k * 0.02, { n: 8, seed: 40 + k, speed: 22, life: 0.3, gravity: -10, spread: Math.PI * 0.9, dir: -Math.PI / 2, colors: [0xb8b0c8, 0x8a8298] }));
      // a sticky note flutters off the pile when he points at it
      const dn = t - tP - 0.1;
      if (dn > 0 && dn < 0.9) {
        const nx = L.stickies.x + 4 + dn * 18 + Math.sin(dn * 14) * 2, ny = L.stickies.y - 24 + dn * dn * 30;
        a.rect(Math.round(nx) - 1, Math.round(ny) - 1, 6, 5, 0x020302);
        a.rect(Math.round(nx), Math.round(ny), 4, 3, hash(Math.floor(dn * 10), 3) > 0.5 ? 0xffe066 : 0xfff2a8);
      }
      speedLines(a, t, whip, { seed: 9 });
    },
  });
  const img = lightRoom(art, ctx);
  const cam = camKeys(t, [
    [tS, { x: 162, y: 142, zoom: 2.25 }],
    [tP - 0.02, { x: 162, y: 141, zoom: 2.3 }, ease.linear],
    [tP + 0.3, { x: 140, y: 128, zoom: 1.95 }, ease.outCubic],
    [WHIP0, { x: 146, y: 130, zoom: 1.95 }, ease.inOutQuad],
    [tEnd, { x: 205, y: 122, zoom: 2.2 }, ease.inExpo],
  ]);
  return { img, w: W, h: H, cam: camClamp(cam) };
}
