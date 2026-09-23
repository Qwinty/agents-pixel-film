// THE SCORE — the whole 45-second soundtrack, written against `src/timeline.js`.
//
// Not one time value is hardcoded here: every event is `CUES.something`, or something derived
// from a cue with BEAT / BAR arithmetic. Move a cue in timeline.js, re-render, and the music
// follows the picture.
//
// Dramaturgy (see PROMPT_B_nogen.md → "Музыка ведёт сюжет"):
//   bar 1        night pulse, clock, rain, drone            → riser
//   bars 2–3     Enter, four bots spawn, each its own NOTE   (the setup)
//   bar 4        salute, ding, four whooshes
//   bars 5–10    the chain reaction: every link its own sound, the music falls apart
//   bar 11       short circuit → TOTAL SILENCE
//   bars 12–13   the four notes come back, alone, in the dark (the payoff)
//   bars 14–17   the track is assembled from those four voices, one layer per bar
//   bars 18–19   full track + montage accents
//   bar 20       the bright C major chord, the rocket
//   bar 21       dawn: pad, birds
//   bar 22       ping → thin pad → "uh-oh" → hard cut to silence
//   bars 23–24   the eye, the QR, the last chord ringing out to 45.000

import { CUES, BEAT, BAR, b, DURATION, BOTS } from '../timeline.js';
import { createMix, makeReverb, makeDelay, limiter, dbToGain, clamp, lerp, rng, TAU } from './synth.js';
import * as V from './voices.js';

// ---------------------------------------------------------------------------------------------
// Harmony
// ---------------------------------------------------------------------------------------------

// Each chord carries: the bass root, the 4 notes the coder's arpeggio runs through,
// and the pad voicing. All diatonic to C major, so the designer's motif fits over every bar.
const PROG = {
  C:  { root: 48, arp: [60, 64, 67, 72], pad: [55, 60, 64, 67] },
  Am: { root: 45, arp: [57, 60, 64, 69], pad: [52, 57, 60, 64] },
  F:  { root: 41, arp: [57, 60, 65, 69], pad: [53, 57, 60, 65] },
  G:  { root: 43, arp: [59, 62, 67, 71], pad: [50, 55, 59, 62] },
};

const S16 = () => BEAT / 4;                 // one sixteenth
const S8 = () => BEAT / 2;                  // one eighth

// Coder's arpeggio: 16 sixteenths per bar. 4 = the root an octave up (the sparkle at the top).
const ARP16 = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 4, 3, 2, 1];

// Barista's bass: [sixteenth slot, semitones above the root, hold in seconds]
const BASS16 = [[0, 0, 0.26], [6, 0, 0.16], [8, 7, 0.20], [12, 0, 0.16], [14, 12, 0.13]];

// Designer's melody — one catchy bar built from E / G / C: G4 · E4 G4 · C5 ····· G4
const MOTIF = [[0, 67, 0.75], [4, 64, 0.45], [6, 67, 0.45], [8, 72, 1.35], [14, 67, 0.45]];

// Tester's kit: four-on-the-floor with a backbeat, hats on every eighth.
const KICK16 = [0, 4, 8, 12];
const SNARE16 = [4, 12];
const HAT16 = [0, 2, 4, 6, 8, 10, 12, 14];

// Stereo home of each bot — kept for the whole film so the ear can place them.
const PAN = { barista: -0.10, coder: -0.32, designer: 0.32, tester: 0.14 };
const SPAWN_PAN = { barista: -0.55, coder: -0.25, designer: 0.25, tester: 0.55 };

// ---------------------------------------------------------------------------------------------
// Reusable bar-level arrangement
// ---------------------------------------------------------------------------------------------

/** One bar of the assembled track. `f` switches the four bot layers on and off. */
function arrangeBar(mix, t0, chordName, f = {}) {
  const ch = PROG[chordName];
  const s = S16();

  if (f.arp) {
    for (let k = 0; k < 16; k++) {
      const idx = ARP16[k];
      const midi = idx === 4 ? ch.arp[0] + 12 : ch.arp[idx];
      V.coder(mix, t0 + k * s, {
        midi, hold: 0.062, rel: 0.055,
        gain: (f.arp === true ? 0.125 : f.arp) * (k % 4 === 0 ? 1.18 : 0.88),
        pan: PAN.coder, rev: f.arpRev ?? 0.10, del: 0.12, bus: 'pad',
      });
    }
  }

  if (f.bass) {
    for (const [slot, off, hold] of BASS16) {
      V.barista(mix, t0 + slot * s, {
        midi: ch.root + off, hold, rel: 0.14,
        gain: (f.bass === true ? 0.30 : f.bass) * (slot === 0 ? 1.15 : 0.9),
        pan: PAN.barista, rev: 0.06,
      });
    }
  }

  if (f.mel) {
    for (const [slot, midi, holdBeats] of MOTIF) {
      V.designer(mix, t0 + slot * s, {
        midi: midi + (f.melOct ?? 0), hold: holdBeats * BEAT, rel: 0.2,
        gain: (f.mel === true ? 0.19 : f.mel), pan: PAN.designer, rev: 0.20, del: 0.10, bus: 'pad',
      });
    }
  }

  if (f.drums) {
    const g = f.drums === true ? 1 : f.drums;
    for (const k of KICK16) V.kick(mix, t0 + k * s, { gain: 0.58 * g });
    for (const k of SNARE16) V.snare(mix, t0 + k * s, { gain: 0.30 * g });
    for (const k of HAT16) {
      V.hat(mix, t0 + k * s, {
        gain: (k % 4 === 0 ? 0.075 : 0.105) * g, open: k === 14,
        pan: k % 4 === 2 ? 0.38 : -0.30,
      });
    }
    if (f.ghost) V.kick(mix, t0 + 14 * s, { gain: 0.26 * g, noDuck: true });
  }

  if (f.pad) V.pad(mix, t0, BAR * 0.98, f.padVoicing ?? ch.pad, { gain: f.pad === true ? 0.15 : f.pad, cut: f.padCut ?? 1500 });

  // Tester's tinks as accents on top of the full groove
  if (f.tink) {
    V.tester(mix, t0 + 14 * s, { midi: 84, decay: 0.28, gain: 0.13, pan: PAN.tester, rev: 0.25 });
    V.tester(mix, t0 + 7 * s, { midi: 79, decay: 0.20, gain: 0.08, pan: -PAN.tester, rev: 0.22 });
  }
}

/** A light beat used under the spawn (bars 2–4) — kick on 1 & 3, soft snare on 3, hats on eighths. */
function lightBeat(mix, t0, { gain = 1, snareOn3 = true } = {}) {
  const s = S16();
  V.kick(mix, t0, { gain: 0.46 * gain });
  V.kick(mix, t0 + 8 * s, { gain: 0.40 * gain });
  if (snareOn3) V.snare(mix, t0 + 8 * s, { gain: 0.15 * gain, decay: 0.10, tone: 2300 });
  for (const k of HAT16) V.hat(mix, t0 + k * s, { gain: (k % 4 === 0 ? 0.05 : 0.075) * gain, pan: k % 4 === 2 ? 0.35 : -0.28 });
}

/** The broken, syncopated kit of the chaos bars — deliberately off the obvious grid. */
function brokenBeat(mix, t0, seed, { gain = 1, doubleTime = false } = {}) {
  const r = rng(seed);
  const s = S16();
  const kicks = doubleTime ? [0, 2, 4, 6, 8, 10, 12, 14] : [0, 5, 8, 11];
  const snares = doubleTime ? [3, 7, 11, 15] : [6, 13];
  for (const k of kicks) V.kick(mix, t0 + k * s, { gain: (0.42 + r() * 0.16) * gain, f0: 110 + r() * 60, decay: 0.14 });
  for (const k of snares) V.snare(mix, t0 + k * s, { gain: (0.22 + r() * 0.12) * gain, tone: 1500 + r() * 1400, pan: (r() - 0.5) * 0.5 });
  for (let k = 0; k < 16; k++) {
    if (r() < (doubleTime ? 0.95 : 0.6)) {
      V.hat(mix, t0 + k * s + (r() < 0.2 ? s / 2 : 0), { gain: (0.05 + r() * 0.08) * gain, pan: (r() - 0.5) * 1.3, cut: 6000 + r() * 4000 });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// THE SCORE
// ---------------------------------------------------------------------------------------------

function buildScore(mix) {
  const C = CUES;
  const s16 = S16(), s8 = S8();

  // The film's two hard cuts. Every sound is truncated here, whenever it started.
  mix.cuts = SILENCE_WINDOWS.map(([t0]) => t0);

  // ==========================================================================================
  // I. Bar 1 — the hook: night, a clock, rain behind the glass, a low drone
  // ==========================================================================================
  V.roomTone(mix, C.hook.start, BAR + BEAT * 1.2, { gain: 0.05, fade: 0.5 });
  V.drone(mix, C.hook.start, BAR - 0.08, { gain: 0.17, release: 0.35 });

  // heartbeat: lub-dub on beats 1 and 3
  for (const beatIdx of [1, 3]) {
    const t = b(1, beatIdx);
    V.heartbeat(mix, t, { gain: 0.26 });
    V.heartbeat(mix, t + 0.135, { gain: 0.15 });
  }
  // clock on eighths, tick/tock alternating
  for (let k = 0; k < 8; k++) V.clockTick(mix, C.hook.start + k * s8, k % 2 === 0, { gain: 0.08 });

  V.whoosh(mix, C.hook.fingerRise, { dur: 0.2, f0: 260, f1: 1100, q: 1.2, gain: 0.05, pan: 0.2, salt: 2 });
  V.clockTick(mix, C.hook.blink, true, { gain: 0.028, pan: 0.3 });
  V.whoosh(mix, C.hook.lookSticker, { dur: 0.13, f0: 1800, f1: 4200, q: 2.0, gain: 0.05, pan: 0.45, salt: 3 });

  // beat 4: the riser that lands exactly on Enter
  V.riser(mix, C.hook.fingerLift, BEAT, { gain: 0.30, f0: 420, f1: 7000, tone0: 120, tone1: 640, tonal: 0.3, curve: 2.3 });

  // ==========================================================================================
  // II. `enter` — the key slam and the white screen flash
  // ==========================================================================================
  V.keyClack(mix, C.enter, { gain: 0.50, tone: 1250, bodyF: 125, thock: 0.07, pan: -0.15 });
  V.zap(mix, C.enter, { dur: 0.55, f0: 13000, f1: 700, decay: 0.10, gain: 0.30, tone: true, toneF0: 2200, toneF1: 260 });
  V.boom(mix, C.enter, { gain: 0.42, decay: 0.30, f0: 120, f1: 40 });
  V.crash(mix, C.enter, { gain: 0.20, decay: 1.0 });
  for (const m of [60, 64, 67, 72]) {                       // a bright stab of the film's own chord
    V.coder(mix, C.enter, { midi: m, hold: 0.10, rel: 0.16, gain: 0.11, pan: (m - 66) * 0.07, rev: 0.25, width: 0.35 });
  }

  // ==========================================================================================
  // Bars 2–3 — the spawn: the four notes the whole film is built on
  // ==========================================================================================
  lightBeat(mix, b(2, 1), { gain: 0.85 });
  lightBeat(mix, b(3, 1), { gain: 0.95 });
  V.barista(mix, b(2, 1), { midi: 36, hold: 0.30, rel: 0.2, gain: 0.20, rev: 0.05 });
  V.barista(mix, b(3, 1), { midi: 36, hold: 0.30, rel: 0.2, gain: 0.20, rev: 0.05 });

  const POP_OPTS = {
    barista: { hold: 0.50, rel: 0.42, gain: 0.36, rev: 0.28, drop: 0.075 },
    coder: { hold: 0.32, rel: 0.26, gain: 0.40, rev: 0.26, del: 0.16 },
    designer: { hold: 0.54, rel: 0.38, gain: 0.40, rev: 0.30, del: 0.12 },
    tester: { decay: 0.95, gain: 0.56, rev: 0.36, del: 0.16 },
  };
  C.spawn.order.forEach((botId, i) => {
    const bot = BOTS[botId];
    const pan = SPAWN_PAN[botId];
    const t0 = C.spawn.stream[i], t1 = C.spawn.pop[i];
    V.pixelStream(mix, t0, t1 - t0, bot.midi, { pan, gain: 0.075 });
    V.BOT_VOICE[botId](mix, t1, { midi: bot.midi, pan, ...POP_OPTS[botId] });
    V.sparkle(mix, t1, { pan, gain: 0.15 });
  });

  // ==========================================================================================
  // Bar 4 — salute, the ding, and the four-way flyoff
  // ==========================================================================================
  lightBeat(mix, b(4, 1), { gain: 1.0, snareOn3: false });
  // salute: a two-note fanfare stab (a fifth, NOT the dawn chord) over a tiny snare flourish
  V.snare(mix, C.salute, { gain: 0.30, decay: 0.09 });
  V.coder(mix, C.salute, { midi: 67, hold: 0.10, rel: 0.12, gain: 0.17, pan: -0.2 });
  V.coder(mix, C.salute, { midi: 72, hold: 0.10, rel: 0.12, gain: 0.15, pan: 0.2 });
  V.coder(mix, C.salute + s16 * 2, { midi: 74, hold: 0.16, rel: 0.18, gain: 0.16, pan: 0 });
  for (let k = 0; k < 6; k++) {                              // the roll into beat 2
    V.snare(mix, C.salute + BEAT + k * (BEAT / 6), { gain: 0.09 + k * 0.026, decay: 0.05, pan: (k % 2 ? 0.22 : -0.22) });
  }
  V.bell(mix, C.heroPoint, { midi: 84, decay: 1.0, gain: 0.26, pan: 0.15, rev: 0.42, del: 0.18 });

  // flyoff: L / R / high / low + a whip pan across the stereo field
  V.whoosh(mix, C.flyoff, { dur: 0.34, f0: 520, f1: 2600, q: 1.5, gain: 0.27, pan: -0.85, salt: 41 });
  V.whoosh(mix, C.flyoff + 0.02, { dur: 0.34, f0: 520, f1: 2600, q: 1.5, gain: 0.27, pan: 0.85, salt: 42 });
  V.whoosh(mix, C.flyoff + 0.04, { dur: 0.30, f0: 2200, f1: 7000, q: 1.8, gain: 0.20, pan: 0.0, salt: 43 });
  V.whoosh(mix, C.flyoff + 0.04, { dur: 0.36, f0: 900, f1: 160, q: 2.4, gain: 0.26, pan: 0.0, salt: 44 });
  V.whoosh(mix, C.flyoff, { dur: 0.40, f0: 700, f1: 3800, q: 1.1, gain: 0.29, pan: (u) => lerp(-0.95, 0.95, u), salt: 45 });
  V.crash(mix, C.flyoff, { gain: 0.14, decay: 0.7 });

  // ==========================================================================================
  // Bar 5 — the coder: furious typing, the avalanche, the mug goes over the edge
  // ==========================================================================================
  brokenBeat(mix, b(5, 1), 5001, { gain: 0.95 });
  // typing: sixteenths all bar, with extra thirty-seconds sprinkled in
  {
    const r = rng(9001);
    for (let k = 0; k < 16; k++) {
      V.typeClick(mix, C.coder.typing + k * s16, { gain: 0.10 + r() * 0.05, tone: 1900 + r() * 1600, pan: -0.45 + r() * 0.24 });
      if (r() < 0.55) V.typeClick(mix, C.coder.typing + k * s16 + s16 / 2, { gain: 0.06 + r() * 0.04, tone: 2100 + r() * 1800, pan: -0.45 + r() * 0.24 });
    }
    // the coder's own arpeggio, double speed and already glitching
    for (let k = 0; k < 32; k++) {
      const midi = [64, 67, 71, 76][k % 4] + (r() < 0.15 ? Math.floor(r() * 5) - 2 : 0);
      V.coder(mix, C.coder.typing + k * (s16 / 2), {
        midi, hold: 0.032, rel: 0.04, gain: 0.075, pan: -0.34, crush: r() < 0.4, rev: 0.08, del: 0.1,
      });
    }
  }
  V.avalanche(mix, C.coder.avalanche, BEAT * 1.25, { gain: 0.40, count: 24 });
  V.scrape(mix, C.coder.mugPush, BEAT * 0.9, { gain: 0.20 });
  V.fallWhistle(mix, C.coder.mugFall, BEAT, { gain: 0.18, f0: 1600, f1: 250 });

  // ==========================================================================================
  // Bar 6 — the barista: the mug lands, the pour never stops, the coffee river
  // ==========================================================================================
  brokenBeat(mix, b(6, 1), 6001, { gain: 0.95 });
  V.clonk(mix, C.barista.mugLand, { gain: 0.38, freq: 205 });
  V.blip(mix, C.barista.notice, { midi: 72, dur: 0.05, gain: 0.12, pan: 0.3 });
  V.blip(mix, C.barista.notice + 0.055, { midi: 84, dur: 0.06, gain: 0.13, pan: 0.3 });
  V.pour(mix, C.barista.pour, BEAT * 2, { gain: 0.20, f0: 210, f1: 760, pan: 0.22, count: 10 });
  V.splash(mix, C.barista.overflow, { gain: 0.30, dur: 0.5 });
  // the river: the bass slides two octaves down and the flow keeps running until the blackout
  V.barista(mix, C.barista.river, { midi: 48, bend: -24, hold: BEAT * 0.9, rel: 0.4, gain: 0.34, wobble: 0.012, rev: 0.12 });
  V.flow(mix, C.barista.river, C.short - C.barista.river, { gain: 0.085 });
  // and the bass under the bar goes progressively wrong
  for (let k = 0; k < 4; k++) {
    V.barista(mix, b(6, 1 + k), { midi: 48, hold: 0.22, rel: 0.16, gain: 0.22, detune: k * 0.012, wobble: k * 0.006, wobRate: 4 + k * 3 });
  }

  // ==========================================================================================
  // Bar 7 — the designer: four splats, each more dissonant than the last
  // ==========================================================================================
  brokenBeat(mix, b(7, 1), 7001, { gain: 1.0 });
  const PAINT_CHORDS = [[67], [67, 68], [67, 73], [66, 67, 73, 74]];
  C.designer.paint.forEach((t, k) => {
    const pan = k % 2 === 0 ? 0.4 : -0.4;
    V.splat(mix, t, { gain: 0.26, pan });
    const chord = PAINT_CHORDS[k];
    for (const m of chord) {
      V.designer(mix, t, {
        midi: m, hold: BEAT * 0.75, rel: 0.2, gain: 0.20 / Math.sqrt(chord.length),
        pan: pan * 0.6, vibrato: 0.006 + k * 0.004, rev: 0.2,
      });
    }
    V.whoosh(mix, t, { dur: 0.25, f0: 500 + k * 400, f1: 3000 + k * 900, q: 1.2, gain: 0.10, pan: -pan * 0.5, salt: 50 + k });
    V.barista(mix, t, { midi: 48, hold: 0.20, rel: 0.14, gain: 0.20, detune: 0.05 + k * 0.012, wobble: 0.02, wobRate: 6 + k * 2 });
  });

  // ==========================================================================================
  // Bar 8 — the tester: footsteps, tink · tink · TINK, sparks
  // ==========================================================================================
  brokenBeat(mix, b(8, 1), 8001, { gain: 0.9 });
  for (let k = 0; k < 6; k++) {
    V.footstep(mix, C.tester.walk + k * s8, { gain: 0.10, pan: k % 2 === 0 ? -0.22 : 0.22, tone: 1500 + (k % 2) * 400 });
  }
  const TAP = [
    { gain: 0.24, detune: 0.000, decay: 0.45, bend: 0 },
    { gain: 0.27, detune: 0.013, decay: 0.45, bend: 0 },
    { gain: 0.44, detune: 0.032, decay: 0.95, bend: -2.5 },
  ];
  C.tester.taps.forEach((t, k) => {
    V.tester(mix, t, { midi: 84, pan: PAN.tester, rev: 0.3, ...TAP[k] });
    V.clonk(mix, t, { gain: 0.10 * (k === 2 ? 2 : 1), freq: 380, pan: PAN.tester });
  });
  V.crackle(mix, C.tester.sparks, BEAT * 3.2, { gain: 0.26, pan: 0.35, density: 110 });
  V.mainsBuzz(mix, C.tester.sparks, C.short - C.tester.sparks, { gain: 0.13, pan: -0.2 });

  // ==========================================================================================
  // Bars 9–10 — full chaos
  // ==========================================================================================
  brokenBeat(mix, b(9, 1), 9001, { gain: 1.0, doubleTime: true });
  brokenBeat(mix, b(10, 1), 9002, { gain: 1.05, doubleTime: true });
  {
    const r = rng(9100);
    // arpeggio at thirty-seconds, detuning and crushing further as it goes
    const n = 64, t0 = C.chaos.start, step = s16 / 2;
    for (let k = 0; k < n; k++) {
      const u = k / n;
      V.coder(mix, t0 + k * step, {
        midi: [64, 67, 70, 73, 66][k % 5] + (r() < 0.2 ? 12 : 0),
        detune: (r() - 0.5) * 0.06 * (0.4 + u), hold: 0.028, rel: 0.035,
        gain: 0.065, pan: clamp(-0.34 + (r() - 0.5) * 0.7, -0.9, 0.9),
        crush: true, crushRate: 5200 - 3000 * u, crushBits: 5 - Math.floor(u * 2), rev: 0.06,
      });
    }
    // the bass wobbles and detunes on every eighth
    for (let k = 0; k < 16; k++) {
      const u = k / 16;
      V.barista(mix, t0 + k * s8, {
        midi: 48 - (k % 4 === 3 ? 5 : 0), hold: 0.18, rel: 0.14, gain: 0.24,
        detune: (r() - 0.5) * 0.05, wobble: 0.01 + 0.03 * u, wobRate: 5 + 9 * u,
      });
    }
    // screeching lead bends
    for (const [tt, bend] of [[b(9, 2.5), 14], [b(9, 4.5), -18], [b(10, 1.75), 20], [b(10, 3.5), -22]]) {
      V.designer(mix, tt, { midi: 67 + Math.floor(r() * 5), bend, hold: BEAT * 0.8, rel: 0.18, gain: 0.17, vibrato: 0.02, vibRate: 8, pan: 0.3, rev: 0.2 });
    }
  }
  // the two-tone alarm, one "wee-oo" per half bar
  for (const t of [b(9, 1), b(9, 3), b(10, 1), b(10, 3)]) V.alarm(mix, t, { gain: 0.085, step: BEAT / 2 });
  // every link of the chain gets its hit
  C.chaos.lampBlink.forEach((t, k) => {
    V.zap(mix, t, { dur: 0.22, f0: 11000, f1: 900, decay: 0.045, gain: 0.24, pan: k % 2 ? 0.55 : -0.55, salt: 60 + k });
  });
  V.paperFlutter(mix, C.chaos.papers, BEAT * 1.8, { gain: 0.15, count: 20 });
  C.chaos.collide.forEach((t, k) => {
    V.bonk(mix, t, { gain: 0.30, freq: k === 0 ? 330 : 270, pan: k === 0 ? -0.4 : 0.4 });
  });
  V.glitchBeep(mix, C.chaos.clock0430, BEAT * 0.8, { gain: 0.17, freq: 900, gate: 0.019 });
  // the peak: a riser plus an accelerating snare roll straight into the short circuit
  V.riser(mix, C.chaos.peak, BEAT, { gain: 0.30, f0: 600, f1: 9000, tone0: 200, tone1: 900, tonal: 0.35, curve: 1.8 });
  {
    let t = C.chaos.peak, step = BEAT / 6, k = 0;
    while (t < C.short - 1e-6) {
      V.snare(mix, t, { gain: 0.12 + 0.03 * k, decay: 0.05, pan: (k % 2 ? 0.3 : -0.3) });
      step *= 0.88; t += step; k++;
    }
  }

  // ==========================================================================================
  // Bar 11 — the short circuit, then nothing
  // ==========================================================================================
  V.zap(mix, C.short, { dur: BEAT, f0: 15000, f1: 320, decay: 0.16, gain: 0.55, tone: true, toneF0: 3000, toneF1: 150, q: 0.9 });
  V.boom(mix, C.short, { gain: 0.72, decay: 0.55, f0: 130, f1: 26 });
  V.crash(mix, C.short, { gain: 0.30, decay: 1.4 });
  V.designer(mix, C.short, { midi: 79, bend: -30, hold: BEAT * 0.7, rel: 0.2, gain: 0.22, vibrato: 0.03, vibRate: 11, pan: 0.2 });
  V.crackle(mix, C.short, BEAT * 0.9, { gain: 0.32, pan: 0, density: 220 });
  // [C.blackout, C.dark.start) is forced to exact zeros by master() below.

  // ==========================================================================================
  // III. Bars 12–13 — the discovery: four notes alone in the dark
  // ==========================================================================================
  V.monitorHum(mix, C.dark.start, C.layers.coder - C.dark.start, { gain: 0.012 });
  V.drip(mix, C.dark.start + BEAT * 1.25, { gain: 0.045, freq: 1500, pan: -0.4 });
  V.drip(mix, C.dark.look + BEAT * 0.55, { gain: 0.038, freq: 1750, pan: 0.45 });
  V.drip(mix, C.dark.points[1] + BEAT * 0.5, { gain: 0.032, freq: 1350, pan: -0.25 });

  // the barista beeps its own note by accident — small, shy, a bit wobbly
  V.barista(mix, C.dark.hiccup, { midi: 48, hold: 0.12, rel: 0.30, gain: 0.17, drop: 0.11, rev: 0.45, pan: -0.3 });

  // the hero points: three notes, in their spawn voices, ringing in the silence
  const POINT_GAIN = { barista: 0.36, coder: 0.27, designer: 0.27 };
  C.dark.points.forEach((t, k) => {
    const botId = C.dark.pointBots[k];
    V.BOT_VOICE[botId](mix, t, {
      midi: BOTS[botId].midi, pan: SPAWN_PAN[botId], gain: POINT_GAIN[botId],
      hold: 0.45, rel: 0.55, rev: 0.58, del: 0.20, decay: 1.1,
    });
  });
  // the idea: the tester's high C completes C–E–G–C
  V.tester(mix, C.dark.idea, { midi: 84, decay: 1.25, gain: 0.34, pan: SPAWN_PAN.tester, rev: 0.62, del: 0.22 });
  V.glissUp(mix, C.dark.idea + 0.03, { count: 12, step: 0.021, baseMidi: 72, gain: 0.085, decay: 0.32, rev: 0.5, spread: 0.4 });
  // and the hero raises his hand
  V.reverseSwell(mix, C.dark.raise, BEAT, { gain: 0.26, midi: 60 });
  V.riser(mix, C.dark.raise, BEAT, { gain: 0.14, f0: 400, f1: 6000, tonal: 0.2, curve: 2.6 });

  // ==========================================================================================
  // IV. Bars 14–17 — the conductor: one layer per bar, each entering on its own cue
  // ==========================================================================================
  const L = C.layers;
  arrangeBar(mix, L.coder, 'C', { arp: 0.165, arpRev: 0.28 });                            // bar 14
  arrangeBar(mix, L.barista, 'Am', { arp: true, bass: true });                           // bar 15
  arrangeBar(mix, L.designer, 'F', { arp: true, bass: true, mel: true, pad: 0.10 });     // bar 16
  arrangeBar(mix, L.tester, 'G', { arp: true, bass: true, mel: true, pad: 0.12, drums: true, tink: true }); // bar 17
  // each layer announces itself with its own bot's note on the downbeat
  V.coder(mix, L.coder, { midi: 64, hold: 0.28, rel: 0.24, gain: 0.26, pan: PAN.coder, rev: 0.25, del: 0.18 });
  V.barista(mix, L.barista, { midi: 48, hold: 0.42, rel: 0.30, gain: 0.34, rev: 0.16 });
  V.designer(mix, L.designer, { midi: 67, hold: 0.45, rel: 0.3, gain: 0.24, pan: PAN.designer, rev: 0.26 });
  V.tester(mix, L.tester, { midi: 84, decay: 0.7, gain: 0.28, pan: PAN.tester, rev: 0.3 });
  V.crash(mix, L.tester, { gain: 0.15, decay: 1.1 });

  // ==========================================================================================
  // Bars 18–19 — the montage: every bot finishes its job, on the cut
  // ==========================================================================================
  const bar18 = C.montage.cuts[0], bar19 = C.montage.cuts[2];
  arrangeBar(mix, bar18, 'F', { arp: true, bass: true, mel: true, pad: 0.12, drums: true, tink: true, ghost: true });
  arrangeBar(mix, bar19, 'G', { arp: true, bass: true, mel: true, melOct: 12, pad: 0.12, drums: true, tink: true, ghost: true });

  C.montage.cuts.forEach((t, k) => {
    const botId = C.montage.bots[k];
    V.crash(mix, t, { gain: k % 2 === 0 ? 0.17 : 0.12, decay: 0.8, pan: PAN[botId] * 0.8 });
    if (botId === 'coder') {
      V.keyClack(mix, t, { gain: 0.36, tone: 1150, bodyF: 118, thock: 0.07, pan: PAN.coder });
      V.coder(mix, t + s16, { midi: 76, hold: 0.09, rel: 0.1, gain: 0.16, pan: PAN.coder });
    } else if (botId === 'barista') {
      V.cupClink(mix, t, { gain: 0.22, pan: 0.18 });
      V.barista(mix, t, { midi: 48, hold: 0.30, rel: 0.24, gain: 0.26 });
    } else if (botId === 'designer') {
      V.brushSwish(mix, t, { gain: 0.19, pan: PAN.designer });
      V.glissUp(mix, t + 0.06, { count: 6, step: 0.028, baseMidi: 79, gain: 0.07, decay: 0.24, pan: 0.3 });
    } else {
      V.tester(mix, t, { midi: 84, decay: 0.55, gain: 0.26, pan: PAN.tester, rev: 0.3 });
      V.blip(mix, t + s16, { midi: 79, dur: 0.09, gain: 0.13, pan: PAN.tester });
    }
  });
  // progress 100 %: the tester whacks the monitor, a success blip, and a fill into bar 20
  V.tester(mix, C.montage.progress100, { midi: 84, decay: 0.9, gain: 0.34, pan: PAN.tester, rev: 0.35 });
  V.clonk(mix, C.montage.progress100, { gain: 0.16, freq: 420, pan: PAN.tester });
  V.blip(mix, C.montage.progress100 + s16 * 1.5, { midi: 72, dur: 0.10, gain: 0.15, pan: 0.1 });
  V.blip(mix, C.montage.progress100 + s16 * 2.5, { midi: 79, dur: 0.14, gain: 0.16, pan: 0.1 });
  for (let k = 0; k < 8; k++) {
    V.snare(mix, C.montage.progress100 + k * (BEAT / 8), { gain: 0.10 + k * 0.025, decay: 0.05, pan: k % 2 ? 0.3 : -0.3 });
  }

  // ==========================================================================================
  // V. Bar 20 — deploy: the bright C major chord, and the rocket
  // ==========================================================================================
  arrangeBar(mix, C.deploy, 'C', { arp: 0.10, bass: 0.26, drums: 0.85, pad: 0.17, padVoicing: [48, 55, 60, 64, 67, 72], padCut: 2200 });
  V.crash(mix, C.deploy, { gain: 0.24, decay: 1.6 });
  // the four voices, together, as the chord the whole film has been promising
  V.barista(mix, C.deploy, { midi: 48, hold: 1.30, rel: 0.85, gain: 0.42, rev: 0.22 });
  V.coder(mix, C.deploy, { midi: 64, hold: 1.05, rel: 0.60, gain: 0.26, pan: PAN.coder, rev: 0.28, del: 0.14 });
  V.designer(mix, C.deploy, { midi: 67, hold: 1.30, rel: 0.75, gain: 0.29, pan: PAN.designer, rev: 0.32, del: 0.10 });
  V.tester(mix, C.deploy, { midi: 84, decay: 1.6, gain: 0.32, pan: PAN.tester, rev: 0.45, del: 0.16 });
  // the "deployed ✓" jingle: C–E–G–C running up in sixteenths
  [60, 64, 67, 72].forEach((m, k) => {
    V.blip(mix, C.deploy + BEAT / 2 + k * s16, { midi: m + 12, dur: 0.10, decay: 0.05, gain: 0.15, pan: -0.2 + k * 0.13, rev: 0.28, del: 0.16 });
  });
  V.rocketRoar(mix, C.rocketLaunch, BEAT * 2.6, { gain: 0.28 });
  V.creak(mix, C.windowOpen, 0.36, { gain: 0.13, pan: 0.45 });
  V.whoosh(mix, C.windowOpen, { dur: 0.3, f0: 400, f1: 2000, q: 1.2, gain: 0.10, pan: 0.5, salt: 71 });
  V.rocketAway(mix, C.rocketOut, BEAT * 2.8, { gain: 0.26 });

  // ==========================================================================================
  // Bar 21 — dawn: the chord keeps glowing, birds, a sip of coffee
  // ==========================================================================================
  V.pad(mix, C.dawn, BAR * 1.05, [48, 55, 60, 64, 67, 74], { gain: 0.18, cut: 1900, attack: 0.35, release: 0.7 });
  arrangeBar(mix, C.dawn, 'C', { arp: 0.055, bass: 0.17 });
  V.rim(mix, C.dawn + BEAT, { gain: 0.09 });
  V.rim(mix, C.dawn + BEAT * 3, { gain: 0.09 });
  for (const k of [1, 3, 5, 7]) V.hat(mix, C.dawn + k * s8, { gain: 0.045, pan: 0.35, cut: 8500 });
  V.designer(mix, C.dawn + BEAT * 2, { midi: 72, hold: BEAT * 1.6, rel: 0.5, gain: 0.16, pan: PAN.designer, rev: 0.4 });
  [[0.55, -0.5], [1.7, 0.55], [2.5, -0.25], [3.3, 0.4]].forEach(([k, pan], i) => {
    V.birdChirp(mix, C.dawn + BEAT * k, { gain: 0.055, pan });
  });
  V.sip(mix, C.dawn + BEAT * 2.3, { gain: 0.085, pan: -0.35 });

  // ==========================================================================================
  // VI. Bar 22 — the ping, the heads turning, and the hard cut
  // ==========================================================================================
  // the notification, two bright tones
  V.bell(mix, C.ping, { midi: 81, decay: 0.55, gain: 0.30, pan: 0.2, rev: 0.4, del: 0.18 });
  V.bell(mix, C.ping + 0.115, { midi: 88, decay: 0.75, gain: 0.30, pan: 0.2, rev: 0.45, del: 0.2 });
  V.kick(mix, C.ping, { gain: 0.34 });
  // the music thins down to one held suspended pad
  V.pad(mix, C.ping, C.cutToBlack - C.ping, [55, 60, 62, 67], { gain: 0.15, cut: 1500, attack: 0.15, release: 0.6 });
  V.barista(mix, C.ping, { midi: 48, hold: 0.5, rel: 0.4, gain: 0.22 });
  // four heads turning
  for (let k = 0; k < 4; k++) {
    V.servo(mix, C.headTurn + k * s16, (C.heroEyes - C.headTurn) * 0.34, { gain: 0.10, pan: -0.6 + k * 0.4, freq: 74 + k * 6, stepHz: 40 + k * 4 });
  }
  // the hero's eyes go round: a C minor stab
  for (const m of [60, 63, 67]) {
    V.designer(mix, C.heroEyes, { midi: m, bend: -1.5, hold: 0.22, rel: 0.22, gain: 0.17, pan: (m - 63) * 0.08, vibrato: 0.004, rev: 0.25 });
  }
  V.barista(mix, C.heroEyes, { midi: 36, hold: 0.28, rel: 0.3, gain: 0.30, bend: -3 });
  V.snare(mix, C.heroEyes, { gain: 0.20, decay: 0.12 });
  V.tester(mix, C.heroEyes + BEAT * 0.5, { midi: 75, decay: 0.35, gain: 0.14, detune: 0.02, pan: 0.3 });
  // [C.cutToBlack, C.end.eyeOpen) is forced to exact zeros by master() below.

  // ==========================================================================================
  // Bars 23–24 — the ending: the eye opens, the QR assembles, the last chord
  // ==========================================================================================
  const E = C.end;
  V.whoosh(mix, E.eyeOpen, { dur: 0.36, f0: 260, f1: 3400, q: 1.0, gain: 0.20, pan: 0, salt: 81, shape: 0.9 });
  V.boom(mix, E.eyeOpen, { gain: 0.30, decay: 0.32, f0: 100, f1: 34 });
  V.kick(mix, E.eyeOpen, { gain: 0.46 });
  V.pad(mix, E.eyeOpen, BAR * 0.95, PROG.C.pad, { gain: 0.10, cut: 1500, attack: 0.12, release: 0.4 });
  V.barista(mix, E.eyeOpen, { midi: 48, hold: 0.30, rel: 0.2, gain: 0.26 });
  V.barista(mix, E.eyeOpen + BEAT * 2, { midi: 48, hold: 0.26, rel: 0.18, gain: 0.22 });
  V.kick(mix, E.eyeOpen + BEAT * 2, { gain: 0.42 });
  for (let k = 0; k < 8; k++) V.hat(mix, E.eyeOpen + k * s8, { gain: k % 2 ? 0.075 : 0.05, pan: k % 2 ? 0.35 : -0.28 });

  // the iris: twelve segments lighting up clockwise, rising through the C major scale
  const IRIS_SCALE = [72, 74, 76, 77, 79, 81, 83, 84, 86, 88, 89, 91];
  E.iris.forEach((t, k) => {
    V.blip(mix, t, {
      midi: IRIS_SCALE[k], dur: 0.10, decay: 0.045, gain: 0.155 * (0.82 + 0.18 * (k / 11)),
      pan: 0.7 * Math.sin(TAU * (k / 12)), rev: 0.24, del: 0.10, width: 0.36,
    });
  });
  // the QR develops in place: the spawn's pixel-stream motif, long and soft, rising into C6,
  // and a sparkle the instant it is complete (the bar-24 downbeat)
  {
    const [q0, q1] = E.qrReveal;
    V.pixelStream(mix, q0, q1 - q0, 84, { count: 24, gain: 0.05, pan: 0.35, fromMidi: 67 });
    V.sparkle(mix, q1, { gain: 0.11, pan: 0.35, count: 3 });
  }
  // bar 24 pulls to G and back home
  const bar24 = E.eyeOpen + BAR;
  V.barista(mix, bar24, { midi: 43, hold: 0.30, rel: 0.2, gain: 0.26 });
  V.kick(mix, bar24, { gain: 0.44 });
  V.snare(mix, bar24 + BEAT, { gain: 0.20, decay: 0.10 });
  V.pad(mix, bar24, BEAT * 2, PROG.G.pad, { gain: 0.09, cut: 1400, attack: 0.1, release: 0.3 });
  for (let k = 0; k < 4; k++) V.hat(mix, bar24 + k * s8, { gain: k % 2 ? 0.065 : 0.045, pan: k % 2 ? 0.35 : -0.28 });
  // the blinking ">_" cursor ticks quietly on every beat
  for (let t = E.cursorBlink; t < E.still - 1e-6; t += BEAT) V.rim(mix, t, { gain: 0.05, tone: 2600, pan: 0.25 });
  // "t.me/p_by_p" types itself in
  {
    const r = rng(2401);
    for (let k = 0; k < 10; k++) {
      V.typeClick(mix, E.caption + k * 0.042, { gain: 0.085 + r() * 0.03, tone: 2200 + r() * 1500, pan: -0.25 + r() * 0.5 });
    }
  }
  // the last chord: the same four voices, ringing out into the fade at 45.000
  V.barista(mix, E.finalChord, { midi: 48, hold: 0.30, rel: 0.42, gain: 0.40, rev: 0.20 });
  V.coder(mix, E.finalChord, { midi: 64, hold: 0.24, rel: 0.36, gain: 0.24, pan: PAN.coder, rev: 0.24, del: 0.10 });
  V.designer(mix, E.finalChord, { midi: 67, hold: 0.32, rel: 0.38, gain: 0.26, pan: PAN.designer, rev: 0.26 });
  V.tester(mix, E.finalChord, { midi: 84, decay: 0.34, gain: 0.30, pan: PAN.tester, rev: 0.30 });
  V.pad(mix, E.finalChord, 0.34, [48, 55, 60, 64, 67, 72], { gain: 0.16, cut: 2000, attack: 0.02, release: 0.34 });
  V.crash(mix, E.finalChord, { gain: 0.10, decay: 0.35 });
}

// ---------------------------------------------------------------------------------------------
// Master bus
// ---------------------------------------------------------------------------------------------

const MASTER_GAIN = 1.02;
const REV_WET = 0.80;
const DLY_WET = 0.55;
const FADE_OUT = 0.34;           // gentle tail so the last chord never clicks at 45.000
const CUT_FADE = 0.0018;         // 1.8 ms taper right before each hard cut to silence

/** The two windows of absolute digital silence the film demands. */
export const SILENCE_WINDOWS = [
  [CUES.blackout, CUES.dark.start],
  [CUES.cutToBlack, CUES.end.eyeOpen],
];

function master(mix) {
  const { sr, n } = mix;

  // sidechain-ish duck: pads and arps dip under every kick
  const duck = new Float32Array(n).fill(1);
  const duckLen = Math.round(0.20 * sr), duckTau = 0.070 * sr;
  for (const t of mix.kicks) {
    const i0 = Math.round(t * sr);
    for (let k = 0; k < duckLen; k++) {
      const j = i0 + k;
      if (j < 0) continue;
      if (j >= n) break;
      const d = 1 - 0.48 * Math.exp(-k / duckTau);
      if (d < duck[j]) duck[j] = d;
    }
  }

  // The two hard cuts. At the first sample of a window the reverb and delay memories are wiped;
  // for the whole window they are then fed silence and their output is discarded. Without this
  // the tail of the short circuit would keep ringing through the blackout and reappear, very
  // audibly, the moment the dark room fades up.
  const kill = new Uint8Array(n);
  const mute = new Uint8Array(n);
  for (const [t0, t1] of SILENCE_WINDOWS) {
    const i0 = Math.round(t0 * sr), i1 = Math.min(n, Math.round(t1 * sr));
    if (i0 >= 0 && i0 < n) kill[i0] = 1;
    mute.fill(1, Math.max(0, i0), i1);
  }

  const rev = makeReverb(sr, { room: 0.86, damp: 0.33 });
  const dly = makeDelay(sr, { time: BEAT / 2, feedback: 0.33, damp: 3000 });
  const L = new Float32Array(n), R = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    if (kill[i]) { rev.reset(); dly.reset(); }
    if (mute[i]) { dly.tick(0, 0); rev.tickL(0); rev.tickR(0); continue; }  // L/R already 0
    const d = duck[i];
    const dryL = mix.main.L[i] + mix.pad.L[i] * d;
    const dryR = mix.main.R[i] + mix.pad.R[i] * d;
    const [dl, dr] = dly.tick(mix.del.L[i], mix.del.R[i]);
    const wl = rev.tickL(mix.rev.L[i] + dl * 0.25);
    const wr = rev.tickR(mix.rev.R[i] + dr * 0.25);
    L[i] = (dryL + dl * DLY_WET + wl * REV_WET) * MASTER_GAIN;
    R[i] = (dryR + dr * DLY_WET + wr * REV_WET) * MASTER_GAIN;
  }

  limiter(L, R, sr, { ceiling: dbToGain(-2.3), lookahead: 0.006, release: 0.18 });

  // hard cuts → exact zeros, with a sub-2 ms taper just before so the cut has no DC pop
  for (const [t0, t1] of SILENCE_WINDOWS) {
    const i0 = Math.round(t0 * sr), i1 = Math.round(t1 * sr);
    const f = Math.round(CUT_FADE * sr);
    for (let k = 0; k < f; k++) {
      const j = i0 - f + k;
      if (j < 0) continue;
      const g = k / f;
      L[j] *= 1 - g; R[j] *= 1 - g;
    }
    L.fill(0, Math.max(0, i0), Math.min(n, i1));
    R.fill(0, Math.max(0, i0), Math.min(n, i1));
  }

  // final fade to silence at exactly DURATION
  const f = Math.round(FADE_OUT * sr);
  for (let k = 0; k < f; k++) {
    const j = n - f + k;
    const g = 0.5 + 0.5 * Math.cos(Math.PI * (k / f));
    L[j] *= g; R[j] *= g;
  }
  L[n - 1] = 0; R[n - 1] = 0;

  return { left: L, right: R };
}

/**
 * Render the complete soundtrack.
 * @param {number} sampleRate
 * @returns {{left: Float32Array, right: Float32Array}} exactly DURATION seconds of stereo audio
 */
export function renderAudio(sampleRate = 48000) {
  const mix = createMix(sampleRate, DURATION);
  buildScore(mix);
  return master(mix);
}

export { DURATION };
