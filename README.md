# Agents — a pixel-art film computed entirely by code

[Русская версия](README.ru.md)

[![Frames from the film](docs/poster.png)](https://qwinty.github.io/agents-pixel-film/)

**▶ [Watch the film](https://qwinty.github.io/agents-pixel-film/)** ·
[MP4, English, 39 MB](https://github.com/Qwinty/agents-pixel-film/raw/main/out/film.mp4) ·
[MP4, Russian, music only](https://github.com/Qwinty/agents-pixel-film/raw/main/out/film.ru.mp4)

45 seconds, 1920×1080, 30 fps. Night, the deadline is at 06:00. The hero of the
[Pixel by Pixel](https://t.me/p_by_p) channel launches four AI agents. They wreck the room in a
chain reaction, and in the dark after the short circuit the hero starts conducting them.

Every frame, the music and every sound effect are computed by the program. There is no video
editor, no image generation and no samples. The only ready-made files in the frame are the 24×45
hero sprite (`footage/character/`) and the logo with the QR code (`footage/brand/`). Everything
else is drawn by code, pixel by pixel, on the same grid. The one exception is the narrator's
voice in the English version: it is ElevenLabs text-to-speech.

## Versions

| | File | Narration | Subtitles |
|---|---|---|---|
| **English** (main) | `out/film.mp4` | English, voice Lily | pixel, burned in |
| Russian | `out/film.ru.mp4` | none: music and effects only | none |

Apart from the subtitles, the picture of the two versions differs only in the word on two
deadline stickers (DEADLINE / ДЕДЛАЙН). All other on-screen text is English in both.

## Build

```bash
npm run build        # English → out/film.mp4
npm run build:ru     # Russian, music only → out/film.ru.mp4
```

You need Node ≥ 20 and `ffmpeg` on PATH; there are no npm dependencies. The command synthesizes
the score, mixes in the narration, renders 1350 frames in parallel (with the subtitles) and
muxes the MP4. On 16 threads one version builds in under a minute. The narration take is
committed in `voice/`, so the build needs no API key. Other commands are in
[docs/BUILD.md](docs/BUILD.md).

## How it works

- **A frame is a pure function of time.** Each of the 16 shots is a `render(t)`. The state of the
  room (clock, rain, coffee, paint, dawn) is computed from `t` as well. So frames can be rendered
  in any order and in parallel, and the result is always the same.
- **A 320×180 art-pixel canvas, scaled ×6.** Lighting, Bayer dithering and the zooming camera all
  work on the hero's pixel grid.
- **One musical grid for picture and sound.** Cuts, hits and notes sit on a 128 BPM grid. Each
  bot has its own note, and together they make the dawn chord.
- **The sound is our own DSP code:** oscillators, filters, reverb and a limiter.
- **The narration sits on the same grid.** A lively narrator reacts to the chaos in 14 short
  lines, each with its own delivery: nervous, excited, laughing, shouting, whispering, gasping.
  It is one ElevenLabs v3 take; forced alignment gives the time of every word. The code cuts the
  take into lines and puts each exactly on its cue. A line too long for its slot gets its pauses
  tightened or is sped up slightly with the pitch kept. The music ducks under the voice. The
  Enter slam, the four spawn notes, the tester's taps and the discovery in the dark stay voice-free.
- **Pixel subtitles.** The English film has subtitles in the film's own 5×7 pixel font, on the
  hero's pixel grid. Every word appears the moment it is heard. Bot names are in the bot's color,
  the whisper is dimmer, the shout shakes, and the sign-off is in the colors of the logo.

More:
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — the code and the decisions behind it;
- [docs/SCENES.md](docs/SCENES.md) — all 16 shots and the narration script;
- [docs/RESULTS.md](docs/RESULTS.md) — checks, what worked and what didn't.

## Narration

- Voice: ElevenLabs `eleven_v3`, premade voice Lily. The delivery is set by v3 audio tags
  (`[nervous]`, `[laughs]`, `[whispers]`…). The Russian version has no narration.
- The script and its cues are in [src/narration.js](src/narration.js). After editing the text,
  record a new take with `npm run voice`. It reads `ELEVENLABS_API_KEY` from the environment or
  from `.env`.
- Narration generated with [ElevenLabs](https://elevenlabs.io).

## Claude Code session

The film was made in one Claude Code session from the brief
[PROMPT_B_nogen.md](PROMPT_B_nogen.md) (in Russian). The main agent wrote the engine, the set,
the hero, the pipeline and the first shots. The soundtrack and four groups of shots were done by
parallel subagents.

| | |
|---|---|
| Time | **1 h 52 min**: 1 h 34 min to the first version and 14 min of fixes |
| Models | Claude Opus 5.5 (main agent), Opus 5 and Opus 5.5 (9 subagents) |
| API calls | 582 |
| Tokens | **120.2 M**: 116.2 M cache reads, 3.0 M cache writes, 1.07 M output |
| Cost at API prices | **≈ $69** |
| Code | ~9.5k lines of JS |

Time per stage, tokens per subagent and the cost calculation are in
[docs/SESSION.md](docs/SESSION.md). The English version, the narration and the subtitles were
added later in a separate session; they are not counted in these numbers.
