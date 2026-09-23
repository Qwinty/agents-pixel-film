# Process and results

[Русская версия](ru/RESULTS.md)

## Process

- I wrote the engine, the set, the characters, continuity, the pipeline, shots 1–3 and the player myself.
- A separate agent wrote the soundtrack.
- Shots 4–16 were made by four parallel agents in groups: 4–7, 8–10, 11–12, 13–16. They shared an API (`common.js`, `blocking.js`, `story.js`) and were not allowed to touch the shared modules.
- Every shot was checked by eye on contact sheets (a tile for every eighth) and on full-size frames at the sync points. Then came the sheet of the whole film, a viewing of the finished MP4 and the QR check.
- Fixes after the first viewing:
  - the hero's arms became thicker and shorter, like the sprite's;
  - on the windowsill, with his back to us, the hero now sits: his legs hang outside, the seat on the ledge is visible;
  - the QR no longer "spits out" of the pupil in batches but fades in smoothly in place. The eight knocks in the sound were replaced with a soft "pixel stream" — the same motif as at the bot spawn.

## What worked

- **Checks of the finished `out/film.mp4`.**
  - File: 1920×1080, H.264 yuv420p bt709, 30 fps, AAC 48 kHz stereo. Exactly 1350 frames, video and audio 45.000 s each, both start at zero.
  - The QR is complete on the downbeat of bar 24 (43.125 s). OpenCV reads it from the MP4 on all checked frames from 43.17 s to the last one: at full size, at half size and in grayscale. The text is `https://t.me/p_by_p`.
  - An automatic scan of all adjacent frame pairs (`tools/diffscan.js`) found no single-frame spikes. All large jumps fall on cuts or on intended hits in the grid: the code avalanche, the pink "punch", the sparks, the short circuit, the cut to black.
  - Sound in AAC: peak −2.4 dBFS, mean volume −16.7 dB, no clipping.
- **Structure from the brief.**
  - Hook: Enter at 1.875 s — frame 56, the downbeat of the second bar.
  - All 15 cuts are on the grid. The joins were checked on frame pairs taken straight from the MP4.
  - The clock is visible on screen: 02:00 → 04:30 (flashes on the monitor during the chaos) → 05:59 → 06:00.
  - Chain of causes: code → mug → coffee → paint → power strip → short circuit.
  - Setup and payoff: each bot's color and note — at spawn, in the dark and during the conducting.
  - The button: "v2 · DEADLINE 08:00" and straight into the cut to black.
- **One pixel density.** In every shot the set, props, effects and text are drawn on the grid of the hero sprite. Camera zoom changes the on-screen pixel size for the whole frame at once.

## Voiceover, subtitles and two versions

- The English (main) and Russian versions are each built with one command. English has the narration and the subtitles; Russian is music and effects only. Apart from the subtitles, the pictures differ only in the word on the two deadline stickers.
- Both MP4s: 1920×1080, 1350 frames, video and audio 45.000 s each. The English audio track is tagged `eng`. Loudness −14.3 LUFS, peak −2.3 dBFS (English); −15.3 LUFS, peak −2.0 dBFS (Russian).
- The QR reads in both versions on all checked frames of the ending.
- Speech recognition (ElevenLabs Scribe) on the final English mix finds all 14 lines. The recognized word times agree with the subtitle times within ~0.1 s, except "Six" in "Six a.m. Deployed!": its subtitle word appears ~0.25 s before recognition hears it.
- The voice is 7–16 dB louder than the music under it. The smallest margin is on "Extremely helpful!" (7 dB, over the chaos).
- The voice does not enter the Enter slam, the tester's taps, the discovery in the dark or the cut to black. `render.js` checks this by the digital zeros.
- The subtitles never cross a cut. Checked on frames decoded from the MP4: the hop of a new word, the dissolve, the top placement over the dawn, the rainbow sign-off on the end card.

## What did not work or came out weaker

- **No Russian narration.** The first narration (George, `eleven_multilingual_v2`, deadpan) came out flat. On v3 with delivery tags three female voices were auditioned (Jessica, Laura, Lily). Lily was chosen for English; none of them sounded right in Russian, so the Russian film was left without a voice. To add one: a voice in `NARRATOR.voices`, the Russian text of the lines in `narration.js`, `npm run voice ru`.
- **Only the user judged the voice by ear.** I checked intelligibility by recognition, timing by alignment and loudness by measurements.
- **Bottom subtitles overlap a little** in the spawn and chaos shots: they cover the bots' feet on the rug.

- **Small characters in wide shots** (chaos, conductor). The hero is 45 px in a frame 180 px high. Actions read through flashes, rings and notes, but facial expressions are barely visible there.
- **Shot 5** is shot low: the front of the desk takes up the top half of the frame.
- **Designer cannot look left:** the brush is always on his right. Throws up and to the left go across his body.
- **Shot 6:** the walls are repainted with a wipe from left to right, not from the point of impact.
- **Shot 11:** on Designer's cue the hero points with the baton across himself, because the baton stays in the same hand as in shot 10.
- **Shot 12:** Tester's jump onto the monitor has no motion lines and looks a bit "floating".
- **The pink river** in bar 15 (Barista drinks it) has low contrast on the pinkish floor. The running highlights help, but it is still quiet.
- **Motion** I checked frame by frame: contact sheets, joins straight from the MP4, the diff scan, the player. There was no real-time viewing by eye.
- **Bugs in the shared code**, found during the build and fixed:
  - the sun rose before the dawn;
  - the river highlights did not run because of a negative remainder from division;
  - the window opening and the v2 sticker were drawn broken in the set — now shots 13 and 15 draw them themselves, and the dead code was removed;
  - on the contact sheets the last tile of a scene showed the first frame of the next one.

← [README](../README.md)
