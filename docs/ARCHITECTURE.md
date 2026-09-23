# How the code works

[Русская версия](ru/ARCHITECTURE.md)

## Code structure

```
src/
  timeline.js        128 BPM grid, table of the 16 shots, CUES — all sync points (both picture and sound run on them)
  lang.js            film language (en is main, ru): the only on-screen change is "DEADLINE" / "ДЕДЛАЙН" on the stickers
  narration.js       voiceover of the English film: 14 lines on the same CUES, delivery tags, ElevenLabs voice
  story.js           continuity: room state as a pure function of time (clock, progress, rain, dawn,
                     paint, mug, coffee river, sparks, lamp, string lights, monitor screen)
  film.js            time → shot → art image → camera → output frame + subtitles (no Node API)
  subtitles.js       burned-in subtitles: pixel font, word by word as spoken, on the base art grid
  engine/
    art.js           art canvas: albedo / emissive / tag layers, primitives in whole art pixels, Bayer dithering
    light.js         light: albedo × light + emission + glow; stepped bands with a narrow dither edge,
                     characters are lit as a whole (no noise on faces) + a rim pixel
    camera.js        camera: zoom 1 → nearest neighbour with subpixel shift, any other zoom → 4×4 supersampling
    font.js          3×5 and 5×7 pixel fonts (Latin, digits, the Cyrillic letters needed) + the full 5×7 subtitle set
    color.js util.js png.js
  assets/
    hero.js          hero from the canonical 24×45 sprite: emotion eyes, "puppet" arms (point, conduct,
                     press Enter), back view, steps
    bots.js          four agents, procedural, on the hero's grid and in the logo ring colors
    room.js          set: one 320×180 room (window with city and rain, desk, monitor, stickers, string lights,
                     lamp, power strip, coffee river), monitor screen in terminal / code / glitch / boot /
                     progress / deployed modes
    brand.js         25×25 QR and 70×39 eye logo, moved onto the art grid from footage/brand
    load-node.js     asset loading in Node (+ the narration take for the subtitles)
  scenes/
    s01.js … s16.js  16 shots; each is a pure function render(t) → { img, w, h, cam }
    common.js        shared shot tools: composeRoom, lightRoom, camera, envelopes, arm IK, effects
    blocking.js      blocking: where each character stands (joins between shots match)
    intro_lib.js     spawn (shots 1–3)                  chaos_lib.js      chain reaction (4–7)
    dark_lib.js      short circuit and darkness (8–10) conductor_lib.js  conductor and montage (11–12)
    dawn_lib.js      rocket, window, sky, windowsill (13–15)
  audio/
    synth.js         DSP: PolyBLEP oscillators, TPT/ZDF filters, reverb, delay, limiter
    voices.js        instruments and all sound effects
    score.js         score: everything placed on CUES, master bus
    voiceover.js     voice bus: finds each line in the take, puts it on its CUE (tightening pauses and
                     time-compressing if needed); the film time of every word for the subtitles
    render.js        Node wrapper → out/audio.en.wav / out/audio.music.wav (decodes the take via ffmpeg)
    decode-node.js   ffmpeg decode of the take to mono Float32
tools/  build.js worker.js pool.js contact.js frame.js mp4sheet.js diffscan.js qr_check.py
        voice.js         requests the take and its forced alignment from ElevenLabs (the only place that needs an API key)
voice/  en/              the cached take: take.mp3 + take.json (text, settings, word timestamps, line bounds)
```

Determinism works like this:
- `Math.random`, `Date` and state between frames are not used;
- randomness comes only from `hash()` and noise based on coordinates and time;
- frame n is sampled at the middle of its interval, `t = (n + 0.5) / 30`.

So frames can be computed in any order and in parallel, and two renders give bit-identical sound. The voice works the same way: the ElevenLabs take is requested once and stored in the repository; the build only reads it.

## Decisions

**Canvas 320×180, scale ×6.**
- The 45 px hero takes a quarter of the frame height. Wide shots with the hero, four bots, the desk and the window fit in the frame at 1:1.
- Close-ups come from the camera: zoom with 4×4 supersampling.
- At 240×135 the characters would be too big for wide shots; at 480×270 they would be small and "empty".
- The 3×5 font at ×6 gives letters of 18×30 output pixels, which is readable.
- The QR in the ending uses 2×2 art pixels per module at a static ×2 zoom, i.e. 24×24 output pixels per module.

**One set, different cameras.**
- The whole room is one 320×180 world. Shots differ by camera, light and state from `story.js`.
- So the results of the chain reaction carry over across cuts: where the mug fell, where the river flows, what color the walls are.

**Stage convention.**
- The monitor faces the viewer, the hero sits at the desk facing us, the window is behind him.
- This way one shot shows the face, the screen with the clock and the deadline sticker — the hook.

**The mug falls to the floor.**
- Coder knocks the mug off the desk, as in the storyboard. So Barista pours into the mug on the floor, and the coffee river runs across the floor to the power strip.
- In the storyboard the river ran "across the desk onto the floor"; the geography changed, the chain of causes is the same.

**Bot notes and colors.**
- Barista — C3, bass, orange.
- Coder — E4, arpeggio, blue.
- Designer — G4, melody, magenta.
- Tester — C6, "ting" and drums, green.

How the notes work through the film:
- The colors are the segments of the logo ring.
- Together the notes make the dawn chord C-E-G-C.
- At spawn each bot's note is visible: a colored flash, a ring and a ♪ in its color. In the dark the same "color + note" pair plays again when the hero points at the bot.
- Tester (high C) does not beep in the dark: its note completes the chord at the moment of the "idea".

**Light.**
- Model: albedo × light + emission + glow.
- Light falloff is quantized into clean bands with a narrow Bayer dither edge, like hand-made pixel shading.
- Characters are lit as a whole, by the light at the sprite center, plus a 1-px rim light from the side of the main source. Otherwise dither noise appears on faces.
- Monitor light does not fall on the monitor itself.
- Glow comes only from bright emissive pixels, as stepped halos.

**The hero's arms.**
- The "puppet" arms are drawn as a sleeve of the same thickness as in the sprite: 5 px of cloth for the near arm and 3 px for the far one, plus outline, cuff and a mitten hand.
- Length is `ARM_SCALE` = 0.74 of the nominal length set by the shot. A raised or extended arm is no longer than the sprite's own lowered arm.
- Poses keep their angles. IK to a specific point (for example, a finger on Enter) goes through `reachIK`: the target is recomputed for the shorter arm.

**Camera.**
- Pans at zoom 1 are pure nearest neighbour: the whole frame shifts in steps of 1 output pixel, i.e. 1/6 of an art pixel.
- Any other zoom is 4×4 supersampling of the whole frame.
- Whip pan is a fast camera move with solid pixel speed lines.

**Sound.**
- The same `CUES` is the only source of timing for both picture and sound.
- Loudness −15.3 LUFS, true peak −1.9 dBTP, no clipping.
- In the blackout (19.22–20.63 s) and in the cut to black (40.78–41.25 s) the music is exact digital zeros. In the English film the narrator is heard in the blackout ("Then... silence."); outside her line it is zeros there too. The cut to black is fully silent.

**Voiceover (English film).**
- A lively narrator who reacts to the chaos: 14 short lines, ~18 s of speech over 45 s of film.
- Voice: ElevenLabs `eleven_v3`, the premade voice Lily. Each line carries a v3 audio tag with its delivery: `[nervous]`, `[excited]`, `[mischievously]`, `[sarcastic]`, `[laughs]`, `[shouting]`, `[whispers]`, `[amazed]`, `[cheerfully]`, `[gasps]`, `[warmly]`. The tag is performed, never spoken.
- The film is **one take**: all lines in a row, so the narrator keeps one voice and one arc. The model's own timestamps drift by up to half a second, so `tools/voice.js` takes word times from ElevenLabs forced alignment of the take against its text. v3 now and then skips a line; a take where a line got no time is requested again with the next seed.
- `voiceover.js` refines the bounds by the audio itself: a tagged line starts where its laugh or gasp starts (the first sustained sound before the first word) and ends where its last sound fades.
- Placement: a line starts on its `at` from `narration.js`. If it does not fit before the next boundary, it may start up to `early` seconds sooner (0.2 s by default); then its inner pauses are tightened to 0.15 s; then it is compressed in time by WSOLA (pitch unchanged) by at most 1.25×. Beyond that the build fails. In the current take the hook plays 1.10× faster, and "Version two?!" 1.17× faster with the pause after the gasp tightened.
- Voice-free windows (`VOICE_FREE`): the Enter slam; a bot's name comes an eighth after its spawn note; the tester's three taps up to the sparks; the discovery in the dark up to the conductor's first layer; the cut to black.
- `tools/voice.js` and the audio render check the placement and fail if a line does not fit.
- The music ducks under the voice by −10 dB (attack 35 ms, release 220 ms). Each line is level-matched to −16 dBFS RMS (by no more than ±3 dB). The voice goes through the shared limiter.
- Result: −14.3 LUFS, peak −2.3 dBFS. The voice is 7–16 dB above the music under it. Speech recognition (ElevenLabs Scribe) on the final mix finds all 14 lines.
- The take is the only sound not synthesized by our code.

**Subtitles (English film).**
- `src/subtitles.js` draws them over the finished frame on the base art grid: 1 art pixel = 6 output pixels, the hero's pixel at zoom 1. Camera zooms do not scale the text.
- Font `FONTS.sub`: 5×7 caps and lowercase with two-row descenders, 1 px strokes. Warm white fill, a dark navy outline and a 1 px drop shadow, so it reads both on the black of the blackout and on the light end card.
- Timing comes from the take: the same placement as the sound (early start, tightened pauses, rate) turns every aligned word into film time (`lineWords` in `voiceover.js`). A word appears when it is heard, with a 1 px hop and a white flash for two frames. The whole line is laid out from the start, so words do not shift.
- A line stays 0.5 s after its last word, but never past the next line, a cut or the cut to black. It leaves with a 3-frame Bayer dither dissolve.
- Per-line style: bot names in the bot's color; the whisper is dimmer; the shout shakes by 1 px; "Six a.m. Deployed!" and "Version two?!" move to the top (the deadline sticker and the v2 note are at the bottom); "Pixel by Pixel." is in the colors of the logo ring.
- `build.js` passes `subs` to the render workers; `--no-subs` turns them off.

**Language.**
- `src/lang.js` holds the language; render workers get it through `workerData`.
- On screen only the word on the two deadline stickers changes. The rest of the on-screen text is in English anyway (`> spawn agents`, `deployed ✓`).
- The main version is English, `out/film.mp4`, with narration and subtitles. The Russian one, `out/film.ru.mp4`, has no narration: music and effects only. A language is narrated when `NARRATOR.voices` in `narration.js` has a voice for it.

**Grid fixes after the sound pass.**
- The sparks lag the last hammer hit by 1/32 (cause first, then effect).
- The rocket launches half a beat after the `deployed` hit, so the final chord has time to sound.

← [README](../README.md)
