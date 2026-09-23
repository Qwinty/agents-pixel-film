// The instrument + sound-effect library of the film.
//
// Three groups:
//   1. THE FOUR BOT VOICES — `barista` (C3 triangle bass), `coder` (E4 pulse blip),
//      `designer` (G4 vibrato lead), `tester` (C6 metallic tink). These are the film's
//      leitmotifs: identical timbre at spawn, in the dark, as track layers and in the
//      dawn chord. Only gain/length/pan ever change.
//   2. THE KIT — kick / snare / hat / crash / rim, plus pads and blips.
//   3. SFX — one function per gag, all built from the same oscillators and seeded noise.
//
// Every function takes (mix, t, opts) and schedules itself at an exact sample offset.
// No function reads a clock or a global — the score passes every time in from CUES.

import {
  TAU, clamp, lerp, midiToFreq, seedFrom, noiseGen, rng,
  sineOsc, sawOsc, pulseOsc, triOsc, lp1, hp1, svf, crusher, softClip,
  adsr, decayEnv, bellEnv, place,
} from './synth.js';

// =============================================================================================
// 1. THE FOUR BOT VOICES
// =============================================================================================

/**
 * BARISTA — orange, C3, "bass" layer.
 * A warm round triangle "bloop": triangle + sub sine, a tiny downward pitch drop on the head
 * and a lowpass that closes quickly, which is what makes it read as a soft blob rather than a note.
 */
export function barista(mix, t, o = {}) {
  const sr = mix.sr;
  const f0 = midiToFreq(o.midi ?? 48) * (1 + (o.detune ?? 0));
  const hold = o.hold ?? 0.34, rel = o.rel ?? 0.26;
  const tri = triOsc(sr), sub = sineOsc(sr);
  const lp = lp1(sr, 1200);
  const env = adsr(sr, { a: 0.008, d: 0.20, s: 0.60, r: rel }, hold);
  const drop = o.drop ?? 0.06;                       // the little "bl-oop" pitch dip
  const dropTau = 0.032 * sr;
  const wob = o.wobble ?? 0;                         // used when the bass "goes wrong" in chaos
  const glide = o.bend ?? 0;                         // semitones glided across the note (the river)
  const lfo = sineOsc(sr);
  return place(mix, t, hold + rel, (i, u) => {
    const bend = 1 + drop * Math.exp(-i / dropTau) + (wob ? wob * lfo(o.wobRate ?? 5.5) : 0);
    const f = f0 * bend * (glide ? 2 ** ((glide * u) / 12) : 1);
    const s = tri(f) * 0.85 + sub(f * 0.5) * 0.40;
    const cut = 780 + 1500 * Math.exp(-i / (0.09 * sr));
    return lp(s, cut) * env(i);
  }, { gain: o.gain ?? 0.30, pan: o.pan ?? 0, rev: o.rev ?? 0.10, del: o.del ?? 0, bus: o.bus });
}

/**
 * CODER — blue, E4, "arpeggio" layer.
 * A crisp computer beep: two slightly detuned band-limited pulses, fast attack, short body.
 * `crush` turns it into the glitching chaos version without changing its identity.
 */
export function coder(mix, t, o = {}) {
  const sr = mix.sr;
  const f0 = midiToFreq(o.midi ?? 64) * (1 + (o.detune ?? 0));
  const hold = o.hold ?? 0.15, rel = o.rel ?? 0.09;
  const w = o.width ?? 0.5;
  const p1 = pulseOsc(sr, w), p2 = pulseOsc(sr, w, 0.37);
  const hp = hp1(sr, 130);
  const lp = lp1(sr, 6000);
  const env = adsr(sr, { a: 0.0012, d: 0.055, s: 0.55, r: rel }, hold);
  const cr = o.crush ? crusher(sr, o.crushRate ?? 5200, o.crushBits ?? 5) : null;
  const bend = o.bend ?? 0;                          // semitones of glide over the note
  return place(mix, t, hold + rel, (i, u) => {
    const f = f0 * 2 ** ((bend * u) / 12);
    let s = p1(f) * 0.5 + p2(f * 1.004) * 0.34;
    s = lp(hp(s, 130), 6500) * env(i);
    return cr ? cr(s) : s;
  }, { gain: o.gain ?? 0.20, pan: o.pan ?? -0.28, rev: o.rev ?? 0.08, del: o.del ?? 0.10, bus: o.bus });
}

/**
 * DESIGNER — magenta, G4, "melody" layer.
 * Soft sweet lead: sine + triangle + a whisper of narrow pulse, gentle vibrato that fades in
 * after the attack so short notes stay clean and long notes sing.
 */
export function designer(mix, t, o = {}) {
  const sr = mix.sr;
  const f0 = midiToFreq(o.midi ?? 67) * (1 + (o.detune ?? 0));
  const hold = o.hold ?? 0.42, rel = o.rel ?? 0.26;
  const s1 = sineOsc(sr), s2 = triOsc(sr), s3 = pulseOsc(sr, 0.22);
  const vib = sineOsc(sr, 0.25);
  const lp = lp1(sr, 2800);
  const env = adsr(sr, { a: 0.028, d: 0.14, s: 0.82, r: rel }, hold);
  const vibIn = 0.10 * sr;
  const depth = o.vibrato ?? 0.006;                   // ≈10 cents
  const bend = o.bend ?? 0;                           // semitones glided over the note (screech)
  return place(mix, t, hold + rel, (i, u) => {
    const v = 1 + depth * vib(o.vibRate ?? 5.4) * clamp(i / vibIn);
    const f = f0 * v * 2 ** ((bend * u) / 12);
    const s = s1(f) * 0.55 + s2(f) * 0.32 + s3(f * 2) * 0.10;
    return lp(s, 2200 + 1400 * Math.exp(-i / (0.12 * sr))) * env(i);
  }, { gain: o.gain ?? 0.20, pan: o.pan ?? 0.28, rev: o.rev ?? 0.16, del: o.del ?? 0.08, bus: o.bus });
}

/**
 * TESTER — green, C6, "drums/accent" layer.
 * A tiny anvil: inharmonic bell partials (1 : 2.76 : 5.40 : 8.93), each decaying faster than the
 * last, plus a 5 ms bandpassed noise transient for the hammer contact.
 */
const TINK_PARTIALS = [[1, 1.00, 1.00], [2.76, 0.52, 0.55], [5.40, 0.30, 0.34], [8.93, 0.16, 0.22], [13.34, 0.08, 0.15]];

export function tester(mix, t, o = {}) {
  const sr = mix.sr;
  const f0 = midiToFreq(o.midi ?? 84) * (1 + (o.detune ?? 0));
  const tau = o.decay ?? 0.55;
  const dur = o.dur ?? Math.min(2.2, tau * 4.5);
  const oscs = TINK_PARTIALS.map(() => sineOsc(sr));
  const envs = TINK_PARTIALS.map(([, , dm]) => decayEnv(sr, tau * dm, 0.0008));
  const nz = noiseGen(seedFrom(t, 11));
  const nbp = svf(sr, 'bp', 1.6);
  const nEnv = decayEnv(sr, 0.004, 0.0003);
  const bend = o.bend ?? 0;
  return place(mix, t, dur, (i, u) => {
    let s = 0;
    for (let k = 0; k < TINK_PARTIALS.length; k++) {
      const [r, g] = TINK_PARTIALS[k];
      s += oscs[k](f0 * r * 2 ** ((bend * u) / 12)) * g * envs[k](i);
    }
    return s * 0.30 + nbp(nz(), 4800, 1.6) * nEnv(i) * 0.5;
  }, { gain: o.gain ?? 0.24, pan: o.pan ?? 0.10, rev: o.rev ?? 0.22, del: o.del ?? 0.12, bus: o.bus });
}

/** Dispatch by bot id — used wherever the score says "that bot's note". */
export const BOT_VOICE = { barista, coder, designer, tester };

// =============================================================================================
// 2. THE KIT AND GENERAL-PURPOSE MUSICAL BITS
// =============================================================================================

/** Kick: sine with a fast pitch sweep + a click. Registers itself for the sidechain duck. */
export function kick(mix, t, o = {}) {
  const sr = mix.sr;
  const s = sineOsc(sr);
  const f1 = o.f1 ?? 46, f0 = o.f0 ?? 128;
  const pTau = (o.pitchTau ?? 0.030) * sr;
  const env = decayEnv(sr, o.decay ?? 0.20, 0.0012);
  const nz = noiseGen(seedFrom(t, 3));
  const clickEnv = decayEnv(sr, 0.0025, 0.0002);
  const hp = hp1(sr, 900);
  if (!o.noDuck) mix.kicks.push(t);
  return place(mix, t, (o.decay ?? 0.20) * 4, (i) => {
    const f = f1 + (f0 - f1) * Math.exp(-i / pTau);
    return softClip(s(f) * 1.25) * env(i) + hp(nz(), 900) * clickEnv(i) * (o.click ?? 0.25);
  }, { gain: o.gain ?? 0.62, pan: o.pan ?? 0, rev: o.rev ?? 0.03, bus: o.bus });
}

/** Snare: bandpassed noise + two detuned body tones. */
export function snare(mix, t, o = {}) {
  const sr = mix.sr;
  const tau = o.decay ?? 0.14;
  const nz = noiseGen(seedFrom(t, 5));
  const bp = svf(sr, 'bp', 0.9);
  const hp = hp1(sr, 400);
  const t1 = triOsc(sr), t2 = triOsc(sr, 0.4);
  const eN = decayEnv(sr, tau, 0.0008), eT = decayEnv(sr, tau * 0.5, 0.0008);
  return place(mix, t, tau * 5, (i) => {
    const n = hp(bp(nz(), o.tone ?? 1900, 0.9), 400) * eN(i);
    const body = (t1(185) + t2(248) * 0.7) * eT(i) * 0.35;
    return n * 0.9 + body;
  }, { gain: o.gain ?? 0.34, pan: o.pan ?? 0, rev: o.rev ?? 0.12, bus: o.bus });
}

/** Hi-hat: highpassed noise. `open` lengthens the decay. */
export function hat(mix, t, o = {}) {
  const sr = mix.sr;
  const tau = o.open ? (o.decay ?? 0.16) : (o.decay ?? 0.028);
  const nz = noiseGen(seedFrom(t, 7));
  const hp = hp1(sr, o.cut ?? 7200);
  const env = decayEnv(sr, tau, 0.0004);
  return place(mix, t, tau * 5, (i) => hp(nz(), o.cut ?? 7200) * env(i), {
    gain: o.gain ?? 0.13, pan: o.pan ?? 0.3, rev: o.rev ?? 0.05, bus: o.bus,
  });
}

/** Crash / white accent cymbal. */
export function crash(mix, t, o = {}) {
  const sr = mix.sr;
  const tau = o.decay ?? 0.9;
  const nz = noiseGen(seedFrom(t, 9));
  const hp = hp1(sr, 2600);
  const bp = svf(sr, 'bp', 0.7);
  const env = decayEnv(sr, tau, 0.0015);
  return place(mix, t, tau * 3, (i) => (hp(nz(), 2600) * 0.7 + bp(nz(), 5400, 0.7) * 0.5) * env(i), {
    gain: o.gain ?? 0.22, pan: o.pan ?? 0, rev: o.rev ?? 0.3, bus: o.bus,
  });
}

/** Rim / stick click — the quiet ticking pulse of the calm sections. */
export function rim(mix, t, o = {}) {
  const sr = mix.sr;
  const nz = noiseGen(seedFrom(t, 13));
  const bp = svf(sr, 'bp', 3.2);
  const env = decayEnv(sr, 0.012, 0.0003);
  const s = sineOsc(sr);
  return place(mix, t, 0.07, (i) => (bp(nz(), o.tone ?? 2100, 3.2) * 0.8 + s(o.tone ?? 2100) * 0.3) * env(i), {
    gain: o.gain ?? 0.16, pan: o.pan ?? -0.1, rev: o.rev ?? 0.08, bus: o.bus,
  });
}

/** Sustained pad chord — soft detuned saws through a slow filter, always on the `pad` bus. */
export function pad(mix, t, dur, midis, o = {}) {
  const sr = mix.sr;
  const voices = [];
  for (const m of midis) {
    const f = midiToFreq(m);
    voices.push({ f, a: sawOsc(sr), b: sawOsc(sr, 0.33), c: sineOsc(sr) });
  }
  const lp = lp1(sr, 1800);
  const att = o.attack ?? 0.25, rel = o.release ?? 0.8;
  const env = adsr(sr, { a: att, d: 0.4, s: 0.85, r: rel }, dur);
  const drift = sineOsc(sr, 0.1);
  return place(mix, t, dur + rel, (i) => {
    const d = 1 + 0.0016 * drift(0.17);
    let s = 0;
    for (const v of voices) s += (v.a(v.f * d) * 0.28 + v.b(v.f * 1.006 / d) * 0.24 + v.c(v.f) * 0.30);
    s /= voices.length;
    return lp(s, o.cut ?? 1700) * env(i);
  }, { gain: o.gain ?? 0.26, pan: o.pan ?? 0, rev: o.rev ?? 0.30, bus: 'pad' });
}

/** Generic short bright blip (pulse) — irises, jingles, streams, alarms. */
export function blip(mix, t, o = {}) {
  const sr = mix.sr;
  const f0 = o.freq ?? midiToFreq(o.midi ?? 72);
  const dur = o.dur ?? 0.09;
  const p = pulseOsc(sr, o.width ?? 0.42);
  const env = decayEnv(sr, o.decay ?? dur * 0.45, 0.0008);
  const bend = o.bend ?? 0;
  const hp = hp1(sr, 180);
  return place(mix, t, dur, (i, u) => hp(p(f0 * 2 ** ((bend * u) / 12)), 180) * env(i), {
    gain: o.gain ?? 0.16, pan: o.pan ?? 0, rev: o.rev ?? 0.10, del: o.del ?? 0.06, bus: o.bus,
  });
}

/** Glassy bell (ping, clink, ding) — a few harmonic-ish partials with long decay. */
export function bell(mix, t, o = {}) {
  const sr = mix.sr;
  const f0 = o.freq ?? midiToFreq(o.midi ?? 84);
  const parts = o.parts ?? [[1, 1, 1], [2.40, 0.42, 0.6], [4.10, 0.22, 0.38], [6.30, 0.10, 0.25]];
  const tau = o.decay ?? 0.7;
  const oscs = parts.map(() => sineOsc(sr));
  const envs = parts.map(([, , d]) => decayEnv(sr, tau * d, 0.001));
  const dur = o.dur ?? Math.min(2.4, tau * 4);
  return place(mix, t, dur, (i) => {
    let s = 0;
    for (let k = 0; k < parts.length; k++) s += oscs[k](f0 * parts[k][0]) * parts[k][1] * envs[k](i);
    return s * 0.34;
  }, { gain: o.gain ?? 0.22, pan: o.pan ?? 0, rev: o.rev ?? 0.3, del: o.del ?? 0.1, bus: o.bus });
}

/** Noise-based whoosh with a swept bandpass. Used for every whip-pan, flyoff and riser. */
export function whoosh(mix, t, o = {}) {
  const sr = mix.sr;
  const dur = o.dur ?? 0.4;
  const nz = noiseGen(seedFrom(t, o.salt ?? 17));
  const bp = svf(sr, o.type ?? 'bp', o.q ?? 2.0);
  const f0 = o.f0 ?? 350, f1 = o.f1 ?? 3200;
  return place(mix, t, dur, (i, u) => {
    const fc = f0 * (f1 / f0) ** (o.curve ? u ** o.curve : u);
    return bp(nz(), fc, o.q ?? 2.0) * bellEnv(u, o.shape ?? 1.3);
  }, { gain: o.gain ?? 0.18, pan: o.pan ?? 0, rev: o.rev ?? 0.14, bus: o.bus });
}

/** Broadband noise burst with a falling filter — zaps, splashes, flashes. */
export function zap(mix, t, o = {}) {
  const sr = mix.sr;
  const dur = o.dur ?? 0.3;
  const nz = noiseGen(seedFrom(t, o.salt ?? 23));
  const sw = svf(sr, 'lp', o.q ?? 1.4);
  const hp = hp1(sr, 60);
  const env = decayEnv(sr, o.decay ?? dur * 0.3, 0.0004);
  const tone = o.tone ? sawOsc(sr) : null;
  return place(mix, t, dur, (i, u) => {
    const fc = (o.f0 ?? 9000) * ((o.f1 ?? 500) / (o.f0 ?? 9000)) ** u;
    let s = sw(nz(), fc, o.q ?? 1.4);
    if (tone) s += tone((o.toneF0 ?? 1600) * ((o.toneF1 ?? 200) / (o.toneF0 ?? 1600)) ** u) * 0.35;
    return hp(s, 60) * env(i);
  }, { gain: o.gain ?? 0.3, pan: o.pan ?? 0, rev: o.rev ?? 0.18, bus: o.bus });
}

// =============================================================================================
// 3. SFX — one per gag, named after its cue
// =============================================================================================

/** Night pulse: a soft low heartbeat thump (lub) — used in pairs for lub-dub. */
export function heartbeat(mix, t, o = {}) {
  const sr = mix.sr;
  const s = sineOsc(sr);
  const env = decayEnv(sr, o.decay ?? 0.11, 0.006);
  return place(mix, t, 0.5, (i) => s(lerp(58, 34, clamp(i / (0.10 * sr)))) * env(i), {
    gain: o.gain ?? 0.30, pan: 0, rev: 0.02,
  });
}

/** Clock tick (high) / tock (low): a dry mechanical click, no reverb — it sits in the room. */
export function clockTick(mix, t, high, o = {}) {
  const sr = mix.sr;
  const nz = noiseGen(seedFrom(t, 29));
  const bp = svf(sr, 'bp', 4.5);
  const s = sineOsc(sr);
  const f = high ? 2650 : 1750;
  const env = decayEnv(sr, high ? 0.008 : 0.011, 0.0002);
  return place(mix, t, 0.06, (i) => (bp(nz(), f, 4.5) * 0.9 + s(f * 0.5) * 0.25) * env(i), {
    gain: o.gain ?? 0.085, pan: o.pan ?? -0.18, rev: 0.03,
  });
}

/** Room tone: rain behind the glass + air. A long, very quiet bed. */
export function roomTone(mix, t, dur, o = {}) {
  const sr = mix.sr;
  const nzL = noiseGen(seedFrom(t, 31)), nzR = noiseGen(seedFrom(t, 32));
  const lpL = lp1(sr, 900), lpR = lp1(sr, 900);
  const bpL = svf(sr, 'bp', 0.6), bpR = svf(sr, 'bp', 0.6);
  const fadeIn = (o.fade ?? 0.6) * sr, N = dur * sr;
  const gen = (nz, lp, bp) => (i) => {
    const a = clamp(i / fadeIn) * clamp((N - i) / fadeIn);
    return (lp(nz(), 820) * 1.6 + bp(nz(), 2400, 0.6) * 0.35) * a;
  };
  place(mix, t, dur, gen(nzL, lpL, bpL), { gain: o.gain ?? 0.055, pan: -0.55, rev: 0.06 });
  place(mix, t, dur, gen(nzR, lpR, bpR), { gain: o.gain ?? 0.055, pan: 0.55, rev: 0.06 });
}

/** Low tension drone (bar 1) — two slow-beating saws way down, filtered almost shut. */
export function drone(mix, t, dur, o = {}) {
  const sr = mix.sr;
  const a = sawOsc(sr), b = sawOsc(sr, 0.5), c = sineOsc(sr);
  const lp = lp1(sr, 260);
  const mv = sineOsc(sr, 0.2);
  const f0 = o.freq ?? midiToFreq(36);            // C2
  const env = adsr(sr, { a: 0.8, d: 0.5, s: 0.9, r: o.release ?? 0.5 }, dur);
  return place(mix, t, dur + (o.release ?? 0.5), (i) => {
    const s = a(f0) * 0.4 + b(f0 * 1.007) * 0.4 + c(f0 * 0.5) * 0.5;
    return lp(s, 190 + 120 * (0.5 + 0.5 * mv(0.13))) * env(i);
  }, { gain: o.gain ?? 0.20, pan: 0, rev: 0.10, bus: 'pad' });
}

/** Monitor hum for the dark section: mains harmonics + a faint high whine. ~-45 dBFS. */
export function monitorHum(mix, t, dur, o = {}) {
  const sr = mix.sr;
  const h1 = sineOsc(sr), h2 = sineOsc(sr, 0.3), h3 = sineOsc(sr, 0.7), w = sineOsc(sr, 0.11);
  const nz = noiseGen(seedFrom(t, 41));
  const lp = lp1(sr, 300);
  const fade = 0.25 * sr, N = dur * sr;
  return place(mix, t, dur, (i) => {
    const a = clamp(i / fade) * clamp((N - i) / (0.4 * sr));
    return (h1(50) * 0.8 + h2(100) * 0.45 + h3(150) * 0.18 + w(8200) * 0.05 + lp(nz(), 300) * 0.5) * a;
  }, { gain: o.gain ?? 0.020, pan: o.pan ?? 0.12, rev: 0.05 });
}

/** A single water drip in a big empty room. */
export function drip(mix, t, o = {}) {
  const sr = mix.sr;
  const s = sineOsc(sr);
  const env = decayEnv(sr, 0.035, 0.0006);
  const f0 = o.freq ?? 1500;
  return place(mix, t, 0.2, (i) => s(f0 * (1 + 0.55 * Math.exp(-i / (0.012 * sr)))) * env(i), {
    gain: o.gain ?? 0.05, pan: o.pan ?? 0, rev: o.rev ?? 0.55,
  });
}

/** Mechanical key clack — the Enter, the typing, the "job done" press. */
export function keyClack(mix, t, o = {}) {
  const sr = mix.sr;
  const nz = noiseGen(seedFrom(t, 43));
  const bp = svf(sr, 'bp', 2.2);
  const hp = hp1(sr, 1500);
  const body = triOsc(sr);
  const eClick = decayEnv(sr, o.tight ?? 0.006, 0.0002);
  const eBody = decayEnv(sr, o.thock ?? 0.045, 0.0006);
  const f = o.tone ?? 1500;
  return place(mix, t, 0.25, (i) => (
    hp(nz(), 1800) * eClick(i) * 0.8 +
    bp(nz(), f, 2.2) * eClick(i) * 0.9 +
    body(o.bodyF ?? 150) * eBody(i) * 0.55
  ), { gain: o.gain ?? 0.30, pan: o.pan ?? -0.2, rev: o.rev ?? 0.06 });
}

/** Tiny typing click (16ths/32nds of the coder's furious bar). */
export function typeClick(mix, t, o = {}) {
  const sr = mix.sr;
  const nz = noiseGen(seedFrom(t, 47));
  const bp = svf(sr, 'bp', 3.0);
  const env = decayEnv(sr, 0.0055, 0.0002);
  const f = o.tone ?? 2400;
  return place(mix, t, 0.04, (i) => bp(nz(), f, 3.0) * env(i), {
    gain: o.gain ?? 0.13, pan: o.pan ?? -0.35, rev: 0.04,
  });
}

/** Pixel stream: fast rising blips flying out of the terminal, ending on the bot's note. */
export function pixelStream(mix, t, dur, targetMidi, o = {}) {
  const r = rng(seedFrom(t, 53));
  const n = o.count ?? 13;
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1);
    const tt = t + dur * (u ** 1.15) * 0.94;
    const m = lerp((o.fromMidi ?? targetMidi - 19), targetMidi + 12, u) + (r() - 0.5) * 2.2;
    blip(mix, tt, {
      midi: m, dur: 0.055, decay: 0.02, width: 0.3,
      gain: (o.gain ?? 0.075) * (0.55 + 0.45 * u),
      pan: clamp((o.pan ?? 0) + (r() - 0.5) * 1.0, -0.9, 0.9),
      rev: 0.14, del: 0.05,
    });
  }
  // a shimmer of air under the stream
  const sr = mix.sr;
  const nz = noiseGen(seedFrom(t, 59));
  const bp = svf(sr, 'bp', 1.2);
  place(mix, t, dur, (i, u) => bp(nz(), 3000 * (1 + 2.2 * u), 1.2) * bellEnv(u, 1.8), {
    gain: 0.07, pan: o.pan ?? 0, rev: 0.2,
  });
}

/** The sparkle that fires the instant a bot finishes assembling. */
export function sparkle(mix, t, o = {}) {
  const sr = mix.sr;
  const nz = noiseGen(seedFrom(t, 61));
  const hp = hp1(sr, 5000);
  const env = decayEnv(sr, 0.05, 0.0005);
  place(mix, t, 0.25, (i) => hp(nz(), 6000) * env(i), { gain: o.gain ?? 0.16, pan: o.pan ?? 0, rev: 0.3 });
  const r = rng(seedFrom(t, 67));
  const n = o.count ?? 4;
  for (let k = 0; k < n; k++) {
    bell(mix, t + k * 0.022, {
      midi: 88 + Math.floor(r() * 12), decay: 0.16, gain: (o.gain ?? 0.16) * 0.42,
      pan: clamp((o.pan ?? 0) + (r() - 0.5), -0.9, 0.9), rev: 0.4,
    });
  }
}

/** Rising glissando of tiny bells — the light-bulb moment, the "deployed" jingle tail, sparkles. */
export function glissUp(mix, t, o = {}) {
  const n = o.count ?? 10;
  const step = o.step ?? 0.024;
  const scale = o.scale ?? [0, 2, 4, 7, 9];          // C major pentatonic
  for (let k = 0; k < n; k++) {
    const deg = scale[k % scale.length] + 12 * Math.floor(k / scale.length);
    bell(mix, t + k * step, {
      midi: (o.baseMidi ?? 72) + deg, decay: o.decay ?? 0.30,
      gain: (o.gain ?? 0.10) * (0.6 + 0.4 * (k / n)),
      pan: (o.pan ?? 0) + (o.spread ?? 0.25) * Math.sin((k / n) * Math.PI * 1.5),
      rev: o.rev ?? 0.45, del: 0.12,
    });
  }
}

/** Riser: noise sweeping up + a pitch riser, landing exactly on the next downbeat. */
export function riser(mix, t, dur, o = {}) {
  const sr = mix.sr;
  const nz = noiseGen(seedFrom(t, 71));
  const bp = svf(sr, 'bp', o.q ?? 1.6);
  const saw = sawOsc(sr);
  const lp = lp1(sr, 4000);
  return place(mix, t, dur, (i, u) => {
    const a = u ** (o.curve ?? 2.0);
    const nsc = bp(nz(), lerp(o.f0 ?? 500, o.f1 ?? 8000, u ** 1.5), o.q ?? 1.6) * 0.8;
    const tone = lp(saw(lerp(o.tone0 ?? 130, o.tone1 ?? 720, u ** 1.7)), 2500) * (o.tonal ?? 0.35);
    return (nsc + tone) * a;
  }, { gain: o.gain ?? 0.24, pan: o.pan ?? 0, rev: o.rev ?? 0.15 });
}

/** Reverse swell — amplitude grows and the filter opens; the "raise your hand" cue. */
export function reverseSwell(mix, t, dur, o = {}) {
  const sr = mix.sr;
  const nz = noiseGen(seedFrom(t, 73));
  const bp = svf(sr, 'bp', 0.8);
  const a = sawOsc(sr), b = sawOsc(sr, 0.4);
  const lp = lp1(sr, 3000);
  const f0 = midiToFreq(o.midi ?? 60);
  return place(mix, t, dur, (i, u) => {
    const g = u ** 2.4;
    const n = bp(nz(), lerp(700, 6500, u), 0.8) * 0.7;
    const tone = lp((a(f0) + b(f0 * 1.005)) * 0.3, lerp(600, 4200, u)) * 0.8;
    return (n + tone) * g;
  }, { gain: o.gain ?? 0.26, pan: 0, rev: 0.25 });
}

/** Avalanche of code: a low rumble plus a cascade of bit-crushed falling blips. */
export function avalanche(mix, t, dur, o = {}) {
  const sr = mix.sr;
  const nz = noiseGen(seedFrom(t, 79));
  const lp = lp1(sr, 300);
  place(mix, t, dur, (i, u) => lp(nz(), 120 + 400 * u) * bellEnv(u, 0.8) * (1 + 0.5 * Math.sin(u * 40)), {
    gain: o.gain ?? 0.45, pan: o.pan ?? -0.2, rev: 0.15,
  });
  const r = rng(seedFrom(t, 83));
  const n = o.count ?? 22;
  for (let k = 0; k < n; k++) {
    const u = k / n;
    coder(mix, t + dur * u * 0.95, {
      midi: 76 - u * 26 + (r() - 0.5) * 5, hold: 0.03, rel: 0.05,
      gain: 0.085 * (1 - 0.35 * u), pan: clamp(-0.3 + (r() - 0.5) * 1.1, -0.9, 0.9),
      crush: true, crushRate: 3800, crushBits: 4, rev: 0.12,
    });
  }
}

/** Scrape — gritty bandpassed noise with a wandering formant (the mug shoved along the desk). */
export function scrape(mix, t, dur, o = {}) {
  const sr = mix.sr;
  const nz = noiseGen(seedFrom(t, 89));
  const bp = svf(sr, 'bp', 6.0);
  const wob = sineOsc(sr);
  const cr = crusher(sr, 6000, 5);
  return place(mix, t, dur, (i, u) => {
    const fc = lerp(600, 1500, u) * (1 + 0.35 * wob(23));
    return cr(bp(nz(), fc, 6.0)) * bellEnv(u, 0.7);
  }, { gain: o.gain ?? 0.18, pan: o.pan ?? -0.35, rev: 0.12 });
}

/** Cartoon falling whistle. */
export function fallWhistle(mix, t, dur, o = {}) {
  const sr = mix.sr;
  const s = sineOsc(sr), v = sineOsc(sr, 0.2);
  const f0 = o.f0 ?? 1500, f1 = o.f1 ?? 260;
  return place(mix, t, dur, (i, u) => {
    const f = f0 * (f1 / f0) ** (u ** 0.85) * (1 + 0.012 * v(5.5));
    return s(f) * (0.35 + 0.65 * bellEnv(u, 0.5));
  }, { gain: o.gain ?? 0.17, pan: o.pan ?? 0.1, rev: 0.16, del: 0.1 });
}

/** Clonk — something hard landing upright on the floor. */
export function clonk(mix, t, o = {}) {
  const sr = mix.sr;
  const t1 = triOsc(sr), t2 = sineOsc(sr);
  const nz = noiseGen(seedFrom(t, 97));
  const bp = svf(sr, 'bp', 2.5);
  const e1 = decayEnv(sr, 0.09, 0.0008), e2 = decayEnv(sr, 0.006, 0.0002);
  const f = o.freq ?? 190;
  return place(mix, t, 0.45, (i) => (
    (t1(f) * 0.7 + t2(f * 2.4) * 0.3) * e1(i) + bp(nz(), 1100, 2.5) * e2(i) * 0.9
  ), { gain: o.gain ?? 0.30, pan: o.pan ?? 0.15, rev: o.rev ?? 0.18 });
}

/** Glug-glug: bubbles of liquid, pitch rising as the vessel fills. */
export function pour(mix, t, dur, o = {}) {
  const sr = mix.sr;
  // continuous stream
  const nz = noiseGen(seedFrom(t, 101));
  const bp = svf(sr, 'bp', 1.1);
  place(mix, t, dur, (i, u) => bp(nz(), lerp(900, 2000, u), 1.1) * clamp(u * 8) * clamp((1 - u) * 6), {
    gain: (o.gain ?? 0.20) * 0.5, pan: o.pan ?? 0.2, rev: 0.12,
  });
  // the glugs themselves
  const n = o.count ?? 9;
  const r = rng(seedFrom(t, 103));
  for (let k = 0; k < n; k++) {
    const u = k / n;
    const tt = t + dur * u;
    const f0 = lerp(o.f0 ?? 220, o.f1 ?? 700, u) * (1 + (r() - 0.5) * 0.12);
    const s = sineOsc(sr);
    const env = decayEnv(sr, 0.035, 0.001);
    place(mix, tt, 0.14, (i) => s(f0 * (1 + 0.8 * Math.exp(-i / (0.02 * sr)))) * env(i), {
      gain: (o.gain ?? 0.20) * 0.9, pan: (o.pan ?? 0.2) + (r() - 0.5) * 0.2, rev: 0.16,
    });
  }
}

/** Splash — the overflow. */
export function splash(mix, t, o = {}) {
  const sr = mix.sr;
  const nz = noiseGen(seedFrom(t, 107));
  const bp = svf(sr, 'bp', 0.8);
  const dur = o.dur ?? 0.45;
  return place(mix, t, dur, (i, u) => {
    const fc = u < 0.25 ? lerp(1200, 5000, u / 0.25) : lerp(5000, 900, (u - 0.25) / 0.75);
    return bp(nz(), fc, 0.8) * bellEnv(u, 0.55);
  }, { gain: o.gain ?? 0.28, pan: o.pan ?? 0.25, rev: 0.25 });
}

/** A river of coffee: slow flowing noise bed. */
export function flow(mix, t, dur, o = {}) {
  const sr = mix.sr;
  const nzL = noiseGen(seedFrom(t, 109)), nzR = noiseGen(seedFrom(t, 113));
  const mk = (nz, seed) => {
    const bp = svf(sr, 'bp', 0.7), lp = lp1(sr, 700), m = sineOsc(sr, seed);
    const N = dur * sr;
    return (i) => {
      const u = i / N;
      const fc = 700 * (1 + 0.5 * m(0.7));
      return (bp(nz(), fc, 0.7) * 0.7 + lp(nz(), 500) * 0.8) * clamp(u * 6) * clamp((1 - u) * 4);
    };
  };
  place(mix, t, dur, mk(nzL, 0.1), { gain: o.gain ?? 0.10, pan: -0.5, rev: 0.12 });
  place(mix, t, dur, mk(nzR, 0.6), { gain: o.gain ?? 0.10, pan: 0.5, rev: 0.12 });
}

/** Paint splat + swoosh of a brush. */
export function splat(mix, t, o = {}) {
  const sr = mix.sr;
  const nz = noiseGen(seedFrom(t, 127));
  const bp = svf(sr, 'bp', 1.6);
  const body = triOsc(sr);
  const e = decayEnv(sr, 0.055, 0.0006);
  const dur = 0.35;
  place(mix, t, dur, (i, u) => bp(nz(), lerp(2800, 450, u ** 0.6), 1.6) * e(i) * 1.1 + body(lerp(320, 110, u)) * e(i) * 0.35, {
    gain: o.gain ?? 0.26, pan: o.pan ?? 0, rev: 0.18,
  });
  whoosh(mix, t, { dur: 0.22, f0: 900, f1: 4200, q: 1.1, gain: (o.gain ?? 0.26) * 0.45, pan: (o.pan ?? 0) * -0.7, salt: 131 });
}

/** Tiny footstep. */
export function footstep(mix, t, o = {}) {
  const sr = mix.sr;
  const nz = noiseGen(seedFrom(t, 137));
  const bp = svf(sr, 'bp', 1.8);
  const s = sineOsc(sr);
  const e = decayEnv(sr, 0.022, 0.0006);
  return place(mix, t, 0.12, (i) => bp(nz(), o.tone ?? 1600, 1.8) * e(i) * 0.7 + s(o.body ?? 130) * e(i) * 0.5, {
    gain: o.gain ?? 0.10, pan: o.pan ?? 0, rev: 0.10,
  });
}

/** Electric crackle — dense seeded clicks through a highpass. */
export function crackle(mix, t, dur, o = {}) {
  const sr = mix.sr;
  const r = rng(seedFrom(t, 139));
  const hp = hp1(sr, 2200);
  const density = (o.density ?? 90) / sr;
  let env = 0;
  const N = dur * sr;
  return place(mix, t, dur, (i, u) => {
    if (r() < density) env = 1;
    env *= 0.9985;
    const s = hp((r() * 2 - 1) * (r() < 0.25 ? 1 : 0.15), 2200) * env;
    return s * clamp((N - i) / (0.15 * sr));
  }, { gain: o.gain ?? 0.30, pan: o.pan ?? 0, rev: 0.2 });
}

/** Mains buzz — a nasty 50 Hz saw through a resonant bandpass. */
export function mainsBuzz(mix, t, dur, o = {}) {
  const sr = mix.sr;
  const a = sawOsc(sr);
  const bp = svf(sr, 'bp', 4.0);
  const m = sineOsc(sr, 0.3);
  const N = dur * sr;
  return place(mix, t, dur, (i, u) => {
    const s = a(o.freq ?? 50);
    const fc = (o.tone ?? 900) * (1 + 0.3 * m(0.9));
    return bp(s, fc, 4.0) * clamp(i / (0.05 * sr)) * clamp((N - i) / (0.2 * sr)) * (0.7 + 0.3 * Math.sin(i / sr * 11));
  }, { gain: o.gain ?? 0.16, pan: o.pan ?? -0.15, rev: 0.1 });
}

/** Paper flutter — a flock of short filtered-noise flaps. */
export function paperFlutter(mix, t, dur, o = {}) {
  const sr = mix.sr;
  const r = rng(seedFrom(t, 149));
  const n = o.count ?? 16;
  for (let k = 0; k < n; k++) {
    const tt = t + dur * (k / n) + r() * 0.03;
    const nz = noiseGen(seedFrom(tt, 151 + k));
    const bp = svf(sr, 'bp', 1.3);
    const fc = 1400 + r() * 2600;
    place(mix, tt, 0.11, (i, u) => bp(nz(), fc * (1 + 0.5 * u), 1.3) * bellEnv(u, 0.9), {
      gain: (o.gain ?? 0.16) * (0.5 + r() * 0.5), pan: clamp((r() - 0.5) * 1.6, -0.85, 0.85), rev: 0.2,
    });
  }
}

/** Cartoon bonk — wood-block thunk with a springy boing tail. */
export function bonk(mix, t, o = {}) {
  const sr = mix.sr;
  const t1 = triOsc(sr), s2 = sineOsc(sr), v = sineOsc(sr, 0.3);
  const e1 = decayEnv(sr, 0.055, 0.0004);
  const e2 = decayEnv(sr, 0.22, 0.004);
  const f = o.freq ?? 330;
  return place(mix, t, 0.7, (i) => {
    const thunk = t1(f * (1 + 1.2 * Math.exp(-i / (0.008 * sr)))) * e1(i);
    const boing = s2(f * 1.5 * (1 + 0.28 * v(17)) * Math.exp(-i / (0.5 * sr))) * e2(i) * 0.45;
    return thunk + boing;
  }, { gain: o.gain ?? 0.26, pan: o.pan ?? 0, rev: 0.2, del: 0.08 });
}

/** Two-tone alarm (chaos). One call = one "wee-oo" pair. */
export function alarm(mix, t, o = {}) {
  const sr = mix.sr;
  const d = o.step ?? 0.23;
  for (let k = 0; k < 2; k++) {
    const p = pulseOsc(sr, 0.5);
    const f = k === 0 ? (o.f0 ?? 660) : (o.f1 ?? 880);
    const env = adsr(sr, { a: 0.004, d: 0.02, s: 0.9, r: 0.03 }, d * 0.8);
    place(mix, t + k * d, d * 0.8 + 0.03, (i) => p(f) * env(i), {
      gain: o.gain ?? 0.09, pan: k === 0 ? -(o.spread ?? 0.6) : (o.spread ?? 0.6), rev: 0.15,
    });
  }
}

/** Glitch beep — a square beep chopped by a stutter gate and bit-crushed. */
export function glitchBeep(mix, t, dur, o = {}) {
  const sr = mix.sr;
  const p = pulseOsc(sr, 0.5);
  const cr = crusher(sr, 3200, 4);
  const N = dur * sr;
  const gateN = Math.max(1, Math.round((o.gate ?? 0.022) * sr));
  return place(mix, t, dur, (i, u) => {
    const on = Math.floor(i / gateN) % 2 === 0 ? 1 : 0.15;
    const f = (o.freq ?? 900) * (1 + 0.5 * Math.floor(i / (gateN * 3) % 3));
    return cr(p(f)) * on * clamp((N - i) / (0.03 * sr));
  }, { gain: o.gain ?? 0.16, pan: o.pan ?? 0.3, rev: 0.12 });
}

/** Deep boom — the short circuit's bottom end. */
export function boom(mix, t, o = {}) {
  const sr = mix.sr;
  const s = sineOsc(sr), s2 = sineOsc(sr, 0.5);
  const env = decayEnv(sr, o.decay ?? 0.55, 0.003);
  const f0 = o.f0 ?? 90, f1 = o.f1 ?? 28;
  const tau = 0.18 * sr;
  return place(mix, t, (o.decay ?? 0.55) * 3.5, (i) => {
    const f = f1 + (f0 - f1) * Math.exp(-i / tau);
    return (softClip(s(f) * 1.4) * 0.8 + s2(f * 2) * 0.15) * env(i);
  }, { gain: o.gain ?? 0.55, pan: 0, rev: 0.12 });
}

/** Rocket ignition — a huge filtered-noise roar that swells and settles. */
export function rocketRoar(mix, t, dur, o = {}) {
  const sr = mix.sr;
  const nzL = noiseGen(seedFrom(t, 157)), nzR = noiseGen(seedFrom(t, 163));
  const mk = (nz, ph) => {
    const lp = lp1(sr, 500), bp = svf(sr, 'bp', 2.5), m = sineOsc(sr, ph);
    const N = dur * sr;
    return (i) => {
      const u = i / N;
      const g = clamp(u * 12) * clamp((1 - u) * 2.2) ** 1.2;
      const res = bp(nz(), lerp(160, 420, u) * (1 + 0.15 * m(7)), 2.5) * 0.6;
      return (lp(nz(), lerp(180, 700, u)) * 2.2 + res) * g;
    };
  };
  place(mix, t, dur, mk(nzL, 0.0), { gain: o.gain ?? 0.30, pan: -0.35, rev: 0.2 });
  place(mix, t, dur, mk(nzR, 0.5), { gain: o.gain ?? 0.30, pan: 0.35, rev: 0.2 });
  boom(mix, t, { gain: (o.gain ?? 0.30) * 1.0, decay: 0.4, f0: 110, f1: 34 });
}

/** Rocket receding: whoosh rising in filter, tone dropping (Doppler), fading out. */
export function rocketAway(mix, t, dur, o = {}) {
  const sr = mix.sr;
  const nz = noiseGen(seedFrom(t, 167));
  const bp = svf(sr, 'bp', 1.1);
  const s = sawOsc(sr);
  const lp = lp1(sr, 2000);
  return place(mix, t, dur, (i, u) => {
    const g = (1 - u) ** 2.2;
    const n = bp(nz(), lerp(500, 3800, u ** 0.7), 1.1) * 0.9;
    const tone = lp(s(lerp(420, 120, u ** 0.6)), lerp(1800, 500, u)) * 0.35;
    return (n + tone) * g;
  }, { gain: o.gain ?? 0.26, pan: (u) => lerp(0, 0.5, u), rev: 0.35 });
}

/** Wooden creak — window opening. */
export function creak(mix, t, dur, o = {}) {
  const sr = mix.sr;
  const nz = noiseGen(seedFrom(t, 173));
  const bp = svf(sr, 'bp', 9.0);
  const m = sineOsc(sr, 0.2);
  const N = dur * sr;
  return place(mix, t, dur, (i, u) => {
    const stick = (Math.sin(i / sr * 55) > 0.2 ? 1 : 0.25);
    const fc = lerp(420, 1250, u) * (1 + 0.12 * m(6));
    return bp(nz(), fc, 9.0) * stick * bellEnv(u, 0.6);
  }, { gain: o.gain ?? 0.13, pan: o.pan ?? 0.4, rev: 0.25 });
}

/** Birdsong — 2–4 fast sine sweeps per chirp. */
export function birdChirp(mix, t, o = {}) {
  const sr = mix.sr;
  const r = rng(seedFrom(t, 179));
  const segs = 2 + Math.floor(r() * 3);
  let tt = t;
  for (let k = 0; k < segs; k++) {
    const len = 0.045 + r() * 0.05;
    const f0 = 2300 + r() * 1800;
    const f1 = f0 * (r() < 0.5 ? 1.45 + r() * 0.5 : 0.62 + r() * 0.25);
    const s = sineOsc(sr);
    place(mix, tt, len, (i, u) => s(f0 * (f1 / f0) ** u) * bellEnv(u, 0.9), {
      gain: (o.gain ?? 0.055) * (0.7 + r() * 0.5), pan: o.pan ?? 0, rev: 0.35, del: 0.08,
    });
    tt += len + 0.012 + r() * 0.03;
  }
}

/** Coffee sip. */
export function sip(mix, t, o = {}) {
  const sr = mix.sr;
  const nz = noiseGen(seedFrom(t, 181));
  const bp = svf(sr, 'bp', 2.6);
  const dur = 0.4;
  return place(mix, t, dur, (i, u) => bp(nz(), lerp(700, 1900, u ** 0.7), 2.6) * bellEnv(u, 1.1), {
    gain: o.gain ?? 0.09, pan: o.pan ?? -0.3, rev: 0.12,
  });
}

/** Ceramic cup on a saucer — two bright glassy clinks. */
export function cupClink(mix, t, o = {}) {
  bell(mix, t, { freq: 2450, decay: 0.28, parts: [[1, 1, 1], [2.31, 0.5, 0.55], [3.94, 0.28, 0.35], [5.7, 0.12, 0.2]], gain: (o.gain ?? 0.2), pan: o.pan ?? 0.2, rev: 0.35 });
  bell(mix, t + 0.085, { freq: 2960, decay: 0.22, parts: [[1, 1, 1], [2.31, 0.5, 0.55], [3.94, 0.28, 0.35], [5.7, 0.12, 0.2]], gain: (o.gain ?? 0.2) * 0.75, pan: (o.pan ?? 0.2) + 0.1, rev: 0.35 });
}

/** Brush swish. */
export function brushSwish(mix, t, o = {}) {
  whoosh(mix, t, { dur: 0.3, f0: 1100, f1: 4600, q: 0.9, gain: o.gain ?? 0.20, pan: o.pan ?? 0.35, salt: 191, shape: 1.0 });
  whoosh(mix, t + 0.11, { dur: 0.24, f0: 3800, f1: 1200, q: 1.1, gain: (o.gain ?? 0.20) * 0.6, pan: (o.pan ?? 0.35) - 0.2, salt: 193 });
}

/** Servo / stepper motor — the bots turning their heads. */
export function servo(mix, t, dur, o = {}) {
  const sr = mix.sr;
  const a = sawOsc(sr);
  const bp = svf(sr, 'bp', 5.0);
  const stepHz = o.stepHz ?? 42;
  const N = dur * sr;
  return place(mix, t, dur, (i, u) => {
    const gate = Math.sin(TAU * stepHz * (i / sr)) > -0.1 ? 1 : 0.2;
    const f = (o.freq ?? 78) * (1 + 0.06 * Math.sin(u * 9));
    return bp(a(f), lerp(700, 1150, u), 5.0) * gate * clamp(i / (0.01 * sr)) * clamp((N - i) / (0.03 * sr));
  }, { gain: o.gain ?? 0.10, pan: o.pan ?? 0, rev: 0.18 });
}

/** A short "thock" — the QR modules snapping into the grid. */
export function thock(mix, t, o = {}) {
  const sr = mix.sr;
  const t1 = triOsc(sr);
  const nz = noiseGen(seedFrom(t, 197));
  const bp = svf(sr, 'bp', 2.0);
  const e1 = decayEnv(sr, 0.045, 0.0006), e2 = decayEnv(sr, 0.005, 0.0002);
  const f = o.freq ?? 230;
  return place(mix, t, 0.25, (i) => t1(f * (1 + 0.5 * Math.exp(-i / (0.006 * sr)))) * e1(i) + bp(nz(), 1500, 2.0) * e2(i) * 0.5, {
    gain: o.gain ?? 0.17, pan: o.pan ?? 0, rev: o.rev ?? 0.15,
  });
}
