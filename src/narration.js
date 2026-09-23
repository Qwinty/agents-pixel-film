// The voice-over of the English film: a lively narrator who reacts to the chaos, one short line
// per story beat. The Russian film has no narration (music and effects only).
// Every line is placed on the same CUES as the picture and the score: `at` is the moment its
// sound is heard: its first word, or the laugh/gasp its tag asks for. A reading that runs long
// may start up to `early` seconds sooner (default 0.2 s, src/audio/voiceover.js).
// `tag` is the delivery direction, an ElevenLabs v3 audio tag read before the line ([excited],
// [whispers], [laughs]…); it is performed, never spoken.
// The words themselves are ElevenLabs TTS (tools/voice.js → voice/<lang>/), the only sound in
// the film that is not synthesized by our own code. The same lines are the burned-in subtitles
// (src/subtitles.js), word by word as they are spoken.
//
// Placement rules:
//   - the Enter slam and the four spawn notes stay clean: each bot's name comes an eighth AFTER its note;
//   - the tester's three taps that cause the short circuit stay clean;
//   - the dark "discovery" (bars 12–13) and the first layer entry of the conductor stay voice-free;
//   - nothing crosses the hard cut to black before the ending (CUES.cutToBlack).
import { CUES, BEAT, b } from './timeline.js';

const C = CUES;

export const NARRATOR = {
  model: 'eleven_v3',                        // the expressive model: understands the audio tags
  voices: {                                  // ElevenLabs premade voices; a language without one has no narration
    en: { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily' },
  },
  settings: { stability: 0.5, similarity_boost: 0.75 },   // v3 stability: 0 creative · 0.5 natural · 1 robust
  seed: 4242,
  joiner: '\n\n',                            // between lines inside the single take
};

/** Languages whose film is narrated (and subtitled). */
export const NARRATED = Object.keys(NARRATOR.voices);

export const LINES = [
  { id: 'hook',      at: b(1, 1.25),                   tag: 'nervous',                    en: 'Two a.m., deadline at six.' },
  { id: 'barista',   at: C.spawn.pop[0] + BEAT / 2,    tag: 'excited',       early: 0.1,  en: 'Barista!' },
  { id: 'coder',     at: C.spawn.pop[1] + BEAT / 2,                          early: 0.1,  en: 'Coder!' },
  { id: 'designer',  at: C.spawn.pop[2] + BEAT / 2,                          early: 0.1,  en: 'Designer!' },
  { id: 'tester',    at: C.spawn.pop[3] + BEAT / 2,                          early: 0.1,  en: 'Tester!' },
  { id: 'wrong',     at: b(4, 2.5),                    tag: 'mischievously',              en: 'What could possibly go wrong?' },
  { id: 'helpful1',  at: C.barista.mugLand + BEAT / 2, tag: 'sarcastic',                  en: 'Helpful.' },
  { id: 'helpful2',  at: C.designer.paint[2],          tag: 'laughs',                     en: 'Very helpful.' },
  { id: 'helpful3',  at: b(9, 1.5),                    tag: 'shouting',                   en: 'Extremely helpful!' },
  { id: 'silence',   at: C.blackout + BEAT / 3,        tag: 'whispers',      early: BEAT / 3, en: 'Then... silence.' },
  { id: 'conductor', at: b(14, 2),                     tag: 'amazed',                     en: 'They just needed a conductor!' },
  { id: 'deployed',  at: C.dawn + BEAT / 2,            tag: 'cheerfully',                 en: 'Six a.m. Deployed!' },
  { id: 'v2',        at: C.ping + BEAT / 4,            tag: 'gasps',                      en: 'Version two?!' },
  { id: 'outro',     at: b(23, 2),                     tag: 'warmly',                     en: 'Pixel by Pixel.' },
];

/** The text sent to ElevenLabs for one line: its delivery tag, then the words. */
export const lineScript = (line, lang) => (line.tag ? `[${line.tag}] ` : '') + line[lang];

/** Hard limits a line may not cross: [from, to) windows where the voice must stay silent. */
export const VOICE_FREE = [
  [C.enter, C.enter + BEAT / 2],            // the Enter slam of the hook
  [C.tester.taps[0] - 0.05, C.chaos.start], // tink, tink, TINK → sparks: the cause is heard clean
  [C.dark.hiccup - 0.05, C.layers.coder],   // the discovery in the dark: notes alone
  [C.cutToBlack, C.end.eyeOpen],            // the button's hard cut stays digital silence
];
