// The film's single source of truth for time: 128 BPM grid, 24 bars, 16 shots, named cues.
// Video shots and the audio score BOTH read event times from here — never hardcode seconds elsewhere.

export const BPM = 128;
export const BEAT = 60 / BPM;          // 0.46875 s
export const BAR = BEAT * 4;           // 1.875 s
export const BARS = 24;
export const DURATION = BAR * BARS;    // 45.0 s
export const FPS = 30;
export const FRAMES = Math.round(DURATION * FPS); // 1350

/** Time of bar (1-based), beat (1-based, may be fractional). b(2) = 1.875, b(2,3) = 2.8125 */
export const b = (bar, beat = 1) => (bar - 1) * BAR + (beat - 1) * BEAT;

/** Frame n is shown during [n/FPS, (n+1)/FPS); we sample motion at its centre. */
export const frameTime = (n) => (n + 0.5) / FPS;

// Bot identities: color = segment of the logo-eye ring, note = the bot's "voice" (set up at spawn,
// paid off in the dark, then each voice becomes a layer of the track; together = the dawn chord C-E-G-C).
export const BOTS = {
  barista:  { name: 'Бариста',  color: 0xffab1f, note: 'C3', midi: 48, voice: 'triangle bass', layer: 'bass' },
  coder:    { name: 'Кодер',    color: 0x4079c9, note: 'E4', midi: 64, voice: 'square/pulse arpeggio', layer: 'arp' },
  designer: { name: 'Дизайнер', color: 0xce46a0, note: 'G4', midi: 67, voice: 'soft lead with vibrato', layer: 'melody' },
  tester:   { name: 'Тестер',   color: 0x48be37, note: 'C6', midi: 84, voice: 'metallic tink / drum kit', layer: 'drums' },
};
export const SPAWN_ORDER = ['barista', 'coder', 'designer', 'tester'];

// Shot list — [startBar, endBar) on the grid. Times in seconds are derived.
export const SHOTS = [
  { id: 1, key: 's01', title: 'Хук: монитор и дедлайн', bars: [1, 2] },
  { id: 2, key: 's02', title: 'Enter и спавн агентов', bars: [2, 4] },
  { id: 3, key: 's03', title: 'Боты отдают честь, разлёт', bars: [4, 5] },
  { id: 4, key: 's04', title: 'Кодер: лавина кода', bars: [5, 6] },
  { id: 5, key: 's05', title: 'Бариста: кофейная река', bars: [6, 7] },
  { id: 6, key: 's06', title: 'Дизайнер: всё в розовый', bars: [7, 8] },
  { id: 7, key: 's07', title: 'Тестер: удлинитель', bars: [8, 9] },
  { id: 8, key: 's08', title: 'Хаос', bars: [9, 11] },
  { id: 9, key: 's09', title: 'Замыкание', bars: [11, 12] },
  { id: 10, key: 's10', title: 'Догадка', bars: [12, 14] },
  { id: 11, key: 's11', title: 'Дирижёр', bars: [14, 18] },
  { id: 12, key: 's12', title: 'Монтаж: всё сходится', bars: [18, 20] },
  { id: 13, key: 's13', title: '06:00 — deployed, ракета', bars: [20, 21] },
  { id: 14, key: 's14', title: 'Рассвет на подоконнике', bars: [21, 22] },
  { id: 15, key: 's15', title: 'Пинг: v2', bars: [22, 23] },
  { id: 16, key: 's16', title: 'Концовка: глаз и QR', bars: [23, 25] },
].map((s) => ({ ...s, start: b(s.bars[0]), end: b(s.bars[1]) }));

// ---------------------------------------------------------------------------------------------
// CUES — every sync point of picture and sound. Values are seconds. Arrays are ordered events.
// ---------------------------------------------------------------------------------------------
export const CUES = {
  // I. Hook (bar 1): quiet night pulse, ticking clock, finger hovers, anticipation on beat 4
  hook: {
    start: b(1),
    fingerRise: b(1, 2),
    blink: b(1, 2.5),
    lookSticker: b(1, 3),          // eyes flick to the DEADLINE sticker
    fingerLift: b(1, 4),           // finger pulls up — riser starts
  },
  // Shot 2 (bars 2–3): Enter on the downbeat, then one bot every two beats
  enter: b(2, 1),                  // key slam + white screen flash
  spawn: {
    order: SPAWN_ORDER,
    stream: [b(2, 1), b(2, 3), b(3, 1), b(3, 3)],   // pixels start flying out of the terminal
    pop: [b(2, 2), b(2, 4), b(3, 2), b(3, 4)],      // bot assembled: color flash + its note
  },
  // Shot 3 (bar 4)
  salute: b(4, 1),
  heroPoint: b(4, 3),              // hero points at the mountain of sticky notes
  flyoff: b(4, 4),                 // bots scatter in four directions + whip pan
  // II. Chaos — causal chain, each link its own sound
  coder: {
    typing: b(5, 1),               // furious typing (16ths) for the whole bar
    avalanche: b(5, 2),            // code pours out of the screen
    mugPush: b(5, 3),              // pile of code shoves the mug along the desk
    mugFall: b(5, 4),              // mug tips over the edge (falling whistle)
  },
  barista: {
    mugLand: b(6, 1),              // clonk: mug lands upright on the floor, empty
    notice: b(6, 1.5),             // "!" — barista sees the empty mug
    pour: b(6, 2),                 // pours from its kettle-head (glug, rising pitch as it fills)
    overflow: b(6, 3),             // overflow splash, can't stop
    river: b(6, 4),                // coffee river runs across the floor (bass slide)
  },
  designer: {
    paint: [b(7, 1), b(7, 2), b(7, 3), b(7, 4)],   // puddle→pink, walls, the hero, whole room
  },
  tester: {
    walk: b(8, 1),                 // tiny footsteps along the pink river (8ths)
    taps: [b(8, 3), b(8, 3.5), b(8, 4)],           // tink, tink, TINK
    sparks: b(8, 4.125),           // last tap → sparks one 32nd later (cause, then effect)
  },
  chaos: {
    start: b(9, 1),                // sparks run along the river
    lampBlink: [b(9, 2), b(9, 2.5), b(9, 3.25), b(10, 1.5), b(10, 2.75), b(10, 3.5)],
    papers: b(9, 3),               // sticky notes fly up
    collide: [b(9, 4), b(10, 3)],  // bots bonk into each other
    clock0430: b(10, 2),           // monitor flashes 04:30
    peak: b(10, 4),                // everything escalates into the short circuit
  },
  short: b(11, 1),                 // white flash + zap
  blackout: b(11, 2),              // total black and total SILENCE until b(12,1)
  // III. Discovery (bars 12–13) — single bot notes in silence
  dark: {
    start: b(12, 1),               // dark room, monitor 12%, glowing bot eyes; faint hum only
    hiccup: b(12, 2),              // barista accidentally beeps its note (C3)
    look: b(12, 3),                // hero turns his eyes to it (silence)
    points: [b(12, 4), b(13, 1), b(13, 2)],       // point → barista C3, coder E4, designer G4
    pointBots: ['barista', 'coder', 'designer'],
    idea: b(13, 3),                // hero's eyes change: IDEA (sparkle — tester's high C completes the chord)
    raise: b(13, 4),               // hero raises his hand like a conductor (riser into bar 14)
  },
  // IV. Conductor (bars 14–17) — each wave adds one bot's layer
  layers: {
    coder: b(14, 1),               // arpeggio
    barista: b(15, 1),             // bass
    designer: b(16, 1),            // melody
    tester: b(17, 1),              // drums → full track
  },
  // Montage (bars 18–19): a cut every half bar
  montage: {
    cuts: [b(18, 1), b(18, 3), b(19, 1), b(19, 3)],
    bots: ['coder', 'barista', 'designer', 'tester'],
    progress100: b(19, 4),         // tester whacks the monitor → progress 100%, clock 05:59
  },
  // V. Dawn
  deploy: b(20, 1),                // 06:00 · "deployed ✓" · bright final chord (C-E-G-C) · rocket ignites
  rocketLaunch: b(20, 2.5),        // half a beat after the chord so the payoff can ring
  windowOpen: b(20, 3),
  rocketOut: b(20, 4),
  dawn: b(21, 1),                  // windowsill, sunrise, rocket trail, birds
  // VI. Button
  ping: b(22, 1),                  // "Ping!" new sticky: v2 · ДЕДЛАЙН 08:00
  headTurn: b(22, 2),              // four bots slowly turn their heads to the hero (b(22,2)..b(22,3))
  heroEyes: b(22, 3),              // hero's eyes go round
  cutToBlack: b(22, 4),            // hard cut to black, music stops dead (silence to b(23,1))
  // Ending (bars 23–24)
  end: {
    eyeOpen: b(23, 1),
    iris: Array.from({ length: 12 }, (_, k) => b(23, 1.5) + k * BEAT / 4),   // 16ths, 12 segments light up clockwise
    cursorBlink: b(23, 4),         // ">_" in the pupil blinks on each beat from here until `still`
    qrReveal: [b(23, 2), b(24, 1)], // the QR develops in place (every module fades in), complete on the bar-24 downbeat
    caption: b(24, 2),             // "t.me/p_by_p" types in (fast, ~0.4 s)
    finalChord: b(24, 3),          // everything settles — last chord rings out
    still: b(24, 3),               // from here to the end nothing moves
  },
};

export function shotAt(t) {
  for (const s of SHOTS) if (t >= s.start && t < s.end) return s;
  return SHOTS[SHOTS.length - 1];
}
