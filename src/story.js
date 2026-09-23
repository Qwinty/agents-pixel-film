// Story continuity: the state of the room as a pure function of global film time t.
// Shots start from storyState(t) and override only what their choreography needs, so every
// consequence of the chain reaction (mug, coffee, paint, sparks, blackout, dawn) stays consistent.
import { CUES, b, BEAT, BAR } from './timeline.js';
import { clamp, keys, step, hash, ease } from './engine/util.js';
import { WALLS } from './assets/room.js';

export const COFFEE = 0x94603a;
export const PINK = 0xff5fc8;

/** Story clock in minutes since midnight → "HH:MM". */
export function clockMinutes(t) {
  return keys(t, [
    [0, 120],
    [b(5), 120],                         // 02:00 through act I
    [b(9), 250, ease.linear],            // chaos burns the night: 02:00 → 04:10
    [CUES.chaos.clock0430, 270, ease.linear], // 04:30 exactly when the monitor flashes it
    [b(12), 276, ease.linear],
    [b(14), 280, ease.linear],           // 04:40 in the dark
    [b(18), 340, ease.linear],           // conductor: → 05:40
    [CUES.montage.cuts[3], 359, ease.linear], // montage: → 05:59
    [b(20) - 0.001, 359, ease.linear],
    [b(20), 360, ease.linear],           // 06:00 on the downbeat of bar 20
    [b(22), 362, ease.linear],
    [b(25), 363, ease.linear],
  ], ease.linear);
}
export function clockText(t) {
  const m = Math.floor(clockMinutes(t) + 1e-6);
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

/** Deploy progress 0..1 (visible from the dark scene on). */
export function progress(t) {
  if (t < b(12)) return 0;
  if (t < b(14)) return 0.12;
  // conductor: climbs a notch on every beat
  if (t < b(18)) {
    const beats = Math.floor((t - b(14)) / BEAT);
    return Math.min(0.7, 0.12 + beats * (0.58 / 16));
  }
  if (t < CUES.montage.progress100) {
    const beats = Math.floor((t - b(18)) / (BEAT / 2));
    return Math.min(0.99, 0.7 + beats * 0.021);
  }
  return 1;
}

export function storyState(t) {
  const C = CUES;
  const s = { t };
  s.clock = clockText(t);
  s.progress = progress(t);
  // weather & time of day
  s.rain = keys(t, [[0, 1], [b(14), 1], [b(16), 0.35], [b(17), 0]], ease.linear);
  s.dawn = keys(t, [[0, 0], [b(17), 0], [b(20), 0.5, ease.inOutQuad], [b(21), 0.82], [b(23), 1]], ease.linear);
  // power: everything dies at the blackout; the monitor alone comes back (UPS) in the dark
  s.power = t >= C.blackout && t < b(14) ? 0 : 1;
  s.blackout = t >= C.blackout && t < C.dark.start;

  // walls: the designer's per-beat repaint (bar 7), stays garish until the beautiful repaint (bar 16)
  const P = C.designer.paint;
  s.wall = step(t, [[0, WALLS.night], [P[1], WALLS.lime], [P[2], WALLS.teal], [P[3], WALLS.pink]]);
  s.wallWipe = null;
  if (t >= b(16) && t < b(17)) s.wallWipe = { from: WALLS.pink, to: WALLS.pretty, k: clamp((t - b(16)) / (BAR * 0.9)) };
  if (t >= b(17)) s.wall = WALLS.pretty;
  s.floorTint = t >= P[3] && t < b(16) ? 0xff8ad8 : null;

  // hero paint (bar 7 beat 3) until the designer "fixes" him too in bar 16
  s.heroPaint = t >= P[2] && t < b(16, 3) ? { color: PINK, amount: 0.55, seed: 3 } : null;

  // mug
  if (t < C.coder.mugFall) s.mug = { where: 'desk', fill: 0.3, steam: true, push: keys(t, [[C.coder.mugPush, 0], [C.coder.mugFall, 1]], ease.inQuad) };
  else if (t < C.barista.mugLand) s.mug = { where: 'falling', k: (t - C.coder.mugFall) / (C.barista.mugLand - C.coder.mugFall) };
  else if (t < b(15)) s.mug = { where: 'floor', fill: t < C.barista.pour ? 0 : 1.2 };
  else s.mug = { where: 'desk', fill: 0.9, steam: true, push: 0 };

  // coffee river on the floor: flows (bar 6), turns pink (bar 7), electrified (bars 8–11), sucked up (bar 15)
  const riverLen = keys(t, [[C.barista.overflow, 0], [C.barista.river, 0.35, ease.outQuad], [b(7), 1, ease.inOutQuad],
    [b(15), 1], [b(16), 0, ease.inOutQuad]], ease.linear);
  s.river = riverLen > 0 ? {
    len: riverLen,
    color: t < P[0] ? COFFEE : PINK,
    electric: t >= C.tester.sparks && t < C.blackout ? 1 : 0,
  } : null;
  // cleaning in bar 15 happens in 4 gulps on the beat (barista's bass notes)
  if (t >= b(15) && t < b(16)) {
    const beatsDone = Math.floor((t - b(15)) / BEAT) + 1;
    s.river = { len: Math.max(0, 1 - beatsDone * 0.25), color: PINK, electric: 0 };
    if (beatsDone >= 4) s.river = null;
  }

  // power strip
  s.stripWet = t >= b(6, 4.5) && t < b(17) ? 1 : 0;
  s.stripLed = t < C.tester.sparks ? 'red' : t < C.blackout ? (Math.floor(t * 12) % 2 ? 'red' : 'off') : t < b(17) ? 'off' : 'green';

  // desk lamp: steady, blinks in the chaos, dead in the dark, snaps back on with the bass (bar 15)
  s.lamp = 1;
  if (t >= C.chaos.start && t < C.short) {
    const blinks = C.chaos.lampBlink;
    let on = 1;
    for (const bt of blinks) if (t >= bt && t < bt + 0.12) on = 0.05;
    if (t > b(10, 3)) on = hash(Math.floor(t * 20), 5) > 0.35 ? 1 : 0.1;
    s.lamp = on;
  }
  if (t >= C.short) s.lamp = 0;
  if (t >= C.layers.barista) s.lamp = 1;

  // fairy lights: idle twinkle → chaos flicker → off → rhythmic from the conductor on
  s.garland = null; // null = idle twinkle (room.js default)
  if (t >= C.tester.sparks && t < C.short) {
    s.garland = Array.from({ length: 12 }, (_, k) => (hash(k, Math.floor(t * 16)) > 0.45 ? 1 : 0.05));
  }
  s.garlandOff = t >= C.short && t < b(14);
  if (t >= b(14)) {
    // each bot's layer lights its own bulbs on the beat; everything chases once the drums enter
    const ph = ((t - b(14)) / BEAT) % 1;
    const pulse = 0.35 + 0.65 * Math.max(0, 1 - ph * 1.6);
    const on = (seg) => {
      const bot = seg <= 1 || seg === 11 ? 'barista' : seg >= 6 && seg <= 8 ? 'coder' : seg >= 9 ? 'designer' : 'tester';
      return t >= C.layers[bot];
    };
    s.garland = Array.from({ length: 12 }, (_, k) => {
      if (t >= C.layers.tester) { const chase = ((Math.floor((t - C.layers.tester) / (BEAT / 2)) + k) % 3 === 0) ? 1 : 0.55; return chase; }
      return on(k) ? pulse : 0.06;
    });
  }

  // stickies: the pile shrinks as the work gets done in the conductor & montage; the wall notes
  // are blown off in the chaos (papers) and the rest come down as tasks get done
  s.pile = keys(t, [[0, 1], [C.chaos.papers, 1], [C.chaos.papers + 0.3, 0.8], [b(14), 0.8], [b(20), 0.12]], ease.linear);
  s.wallNotes = keys(t, [[0, 1], [C.chaos.papers, 1], [C.chaos.papers + 0.3, 0.45], [b(14), 0.45], [b(20), 0.12]], ease.linear);

  // monitor screen content
  s.screen = screenFor(t, s);
  return s;
}

function screenFor(t, s) {
  const C = CUES;
  const clock = s.clock;
  if (t < C.enter) return { mode: 'terminal', clock, cmd: '> spawn agents', lines: ['$ git status', '42 tasks open'] };
  if (t < b(4)) return { mode: 'terminal', clock, cmd: '> spawning...', lines: ['agents: ' + Math.min(4, Math.max(0, C.spawn.pop.filter((p) => t >= p).length)) + '/4', ''], cursor: true };
  if (t < b(5)) return { mode: 'terminal', clock, cmd: '> go!', lines: ['4 agents online', ''] };
  if (t < C.chaos.start) return { mode: 'code', clock, scroll: (t - b(5)) * 48 };
  if (t < C.short) {
    const flash0430 = t >= C.chaos.clock0430 && t < C.chaos.clock0430 + BEAT;
    return { mode: 'glitch', clock, big: flash0430 ? '04:30' : null, clockColor: 0xff6a6a };
  }
  if (t < C.dark.start) return { mode: 'off' };
  if (t < b(14)) return { mode: 'boot', clock, progress: s.progress, bg: 0x08121e };
  if (t < C.deploy) return { mode: 'progress', clock, progress: s.progress, label: t < b(18) ? 'deploying' : 'almost...' };
  return { mode: 'deployed', clock }; // the v2 note (shot 15) and the open window (shot 13) are drawn by those shots
}
