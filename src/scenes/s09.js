// Shot 9 (bar 11) — ЗАМЫКАНИЕ.
// Static camera (= the end of shot 8). On b(11,1) the frame goes white, then two frames of
// cartoon electrocution (white field, black silhouettes of the cast), then the room is lit only by
// the dying strip/socket blast and huge spark bursts, stutters, and fades out within the beat.
// From b(11,2) to b(12,1) the frame is pure black (the score is digital silence there).
import { storyState } from '../story.js';
import {
  composeRoom, lightRoom, camClamp, hit, prog, sparks, NIGHT, DARK,
  W, H, L, CUES, TAGS, HERO_TAG,
} from './common.js';
import { STATION, HERO_STAND } from './blocking.js';
import { ease, hash, TAU } from '../engine/util.js';
import { boltArc, silhouetteFrame } from './dark_lib.js';

const SHORT = CUES.short, BLACK = CUES.blackout;
const CAM = { x: 160, y: 98, zoom: 1.15 };
const BLACK_FRAME = new Uint8Array(W * H * 3); // exactly (0,0,0) everywhere
const F = 1 / 30;
const CAST = [HERO_TAG, TAGS.coder, TAGS.barista, TAGS.tester, TAGS.designer];

const lerp3 = (a, b1, k) => [a[0] + (b1[0] - a[0]) * k, a[1] + (b1[1] - a[1]) * k, a[2] + (b1[2] - a[2]) * k];

export function render(t, shot) {
  // ---- total blackout: pure black, nothing else -----------------------------------------------
  if (t >= BLACK) return { img: BLACK_FRAME, w: W, h: H, cam: camClamp({ x: 160, y: 90, zoom: 1 }) };

  const st = { ...storyState(t), wallNotes: 0.45 };
  const dt = t - SHORT;
  const die = prog(t, SHORT + 0.1, SHORT + 0.36, ease.outQuad); // the room's light dying
  const zap = dt < 0.1 ? 1 : 0;                                   // cast is electrified
  const jolt = hit(t, SHORT, 0.4, 1.5);
  const buzz = zap || dt < 0.2 ? (Math.floor(t * 60) % 2 ? 1 : -1) : 0; // 1-px zap jitter

  const sp = L.strip, so = L.socket;
  const { art, ctx } = composeRoom(st, {
    hero: {
      layer: 'floor', x: HERO_STAND.x + buzz, y: HERO_STAND.y - jolt * 3, eyes: 'wide', lookX: 1,
      near: { a: -Math.PI / 2 - 0.55 + buzz * 0.12, len: 9, hand: 'open' },
      far: { a: -Math.PI / 2 + 0.5 - buzz * 0.12, len: 9, hand: 'open' },
    },
    bots: [
      { name: 'coder', ...STATION.coder, x: STATION.coder.x - buzz, face: undefined, eyes: 'surprise', squash: -0.55 * jolt, antennaWobble: 3 },
      { name: 'barista', ...STATION.barista, x: STATION.barista.x + buzz, eyes: 'surprise', mouth: 'o', squash: -0.5 * jolt, armsUp: true, tilt: 0.2 },
      { name: 'designer', ...STATION.designer, x: STATION.designer.x - buzz, eyes: 'surprise', squash: -0.5 * jolt, brush: -0.6 },
      { name: 'tester', ...STATION.tester, x: STATION.tester.x + buzz, eyes: 'surprise', squash: -0.65 * jolt, hammer: -0.9 },
    ],
    fx: (a, c) => {
      // the arc jumping strip → socket for the first frames
      if (dt >= 0 && dt < 0.22) {
        boltArc(a, sp.x + sp.w, sp.y + 1, so.x + 4, so.y + 10, t, { seed: 3, jitter: 9 });
        boltArc(a, sp.x + 2, sp.y, so.x + 2, so.y + 9, t, { seed: 8, jitter: 12, color: 0x9af0ff });
        boltArc(a, sp.x + 8, sp.y, sp.x - 30, sp.y - 26, t, { seed: 21, jitter: 10, n: 6 });
      }
      // huge bursts out of the strip and the socket
      for (let k = 0; k < 6; k++) {
        sparks(a, sp.x + 2 + k * 4, sp.y - 1, t, SHORT + k * 0.045, {
          n: 22, seed: 300 + k, speed: 84 - k * 6, life: 0.6, gravity: 110, spread: 2.8, dir: -Math.PI / 2,
        });
      }
      for (let k = 0; k < 4; k++) {
        sparks(a, so.x + 4, so.y + 5, t, SHORT + 0.02 + k * 0.06, {
          n: 18, seed: 400 + k, speed: 74, life: 0.55, gravity: 95, spread: TAU,
        });
      }
      // the whole river discharges at once
      const pts = c.riverPts || [];
      for (let k = 0; k < 9; k++) {
        const p = pts[Math.floor((k / 9) * pts.length)] || L.river[0];
        sparks(a, p[0], p[1] - 1, t, SHORT + hash(k, 55) * 0.12, {
          n: 10, seed: 500 + k, speed: 48, life: 0.45, gravity: 90, spread: 2.4, dir: -Math.PI / 2,
        });
      }
      // the lamp bulb pops
      sparks(a, L.lamp.x - 6, L.lamp.y - 12, t, SHORT + 0.05, { n: 10, seed: 610, speed: 30, life: 0.4, gravity: 80, colors: [0xffffff, 0xffe7a0] });
      // dying afterglow: a couple of stutters before it all goes out
      if (dt > 0.2) {
        const fr = Math.floor(t * 22);
        if (hash(fr, 9) > 0.62) a.emit(() => {
          for (let k = 0; k < 24; k++) {
            const x = Math.floor(hash(k, fr, 2) * W);
            const y = 150 + Math.floor(hash(k, fr, 3) * 26);
            a.dput(x, y, 0x9af0ff, 0.35 * (1 - die));
          }
        });
      }
    },
  });

  const amb = lerp3(NIGHT.ambient, DARK.ambient, die);
  const stutter = dt > 0.16 && dt < 0.3 && hash(Math.floor(t * 30), 4) > 0.5 ? 0.35 : 1;
  let img = lightRoom(art, ctx, {
    ambient: amb,
    rig: { monitorLight: 0, lamp: 0, windowLight: 1 - die * 0.55, garlandOff: true, bulbs: [] },
    spriteLight: { floor: 0.84 * (1 - die), keep: 0.45 },
    lights: [
      { x: sp.x + 10, y: sp.y - 2, r: 110, ry: 70, color: 0xdff6ff, i: 2.2 * hit(t, SHORT, 0.4, 1.3) * stutter, pow: 1.3 },
      { x: so.x + 4, y: so.y + 5, r: 80, ry: 60, color: 0xbfe8ff, i: 1.8 * hit(t, SHORT, 0.35, 1.3) * stutter, pow: 1.4 },
    ],
    flash: 0.75 * hit(t, SHORT + 2 * F, 0.16, 1.6),
    fade: prog(t, SHORT + 0.3, BLACK - 0.03, ease.inQuad),
  });
  // frame 0: everything white; frames 1–2: white field with the cast as black silhouettes
  if (dt < 0.5 * F) img = silhouetteFrame(img, art, [], { bg: 0xffffff });
  else if (dt < 2.5 * F) img = silhouetteFrame(img, art, CAST);
  return { img, w: W, h: H, cam: camClamp(CAM) };
}
