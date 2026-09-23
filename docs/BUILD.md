# Build and tools

[Русская версия](ru/BUILD.md)

```bash
npm run build        # English version, narration + subtitles → out/film.mp4
npm run build:ru     # Russian version, music only → out/film.ru.mp4
npm run build:all    # both
```

This is `node tools/build.js [--lang en|ru]`:
1. synthesizes the soundtrack and, for English, mixes in the voiceover from `voice/en/` → `out/audio.en.wav` (Russian: `out/audio.music.wav`);
2. renders 1350 frames in parallel in `worker_threads`, with the subtitles burned in for English;
3. feeds them to ffmpeg in order → `out/film.mp4` or `out/film.ru.mp4`.

The build does not need an ElevenLabs key: the voiceover takes are in `voice/`. The key is needed only to re-record the voiceover after editing the text in `src/narration.js`:

```bash
npm run voice        # node tools/voice.js [en] [--force]
```

The script reads `ELEVENLABS_API_KEY` from the environment or from `.env` (it is in `.gitignore`). A new take is requested only if the text, the voice or the settings changed; then the script also gets its forced alignment (word times). It prints how each line fits into its window.

To try another voice without touching `voice/`: `node tools/voice.js en --voice <voiceId> --dir voice-audition/<name>`, then `node src/audio/render.js --voice-dir voice-audition/<name> out/audition.wav`. A v3 take of the script costs ~360 characters of the ElevenLabs quota.

On a 16-thread CPU (Ryzen 7 8845HS) a full build takes about 40 seconds: sound takes a couple of seconds, 1350 frames at 1920×1080 render at ~38 frames/s. Requires Node ≥ 20 and `ffmpeg` in PATH; there are no npm dependencies.

QR check on the finished MP4 (Python via uv, nothing is installed system-wide):

```bash
npm run qr
```

For the Russian version: `uv run --with opencv-python --with numpy python tools/qr_check.py out/film.ru.mp4`.

Other commands:

| Command | What it does |
|---|---|
| `node tools/contact.js [s01 … s16 \| film] [--subs]` | contact sheets in `out/sheets/`: a tile for every eighth within a scene + a sheet of the whole film; `--subs` burns in the subtitles |
| `node tools/mp4sheet.js` | check of the finished MP4 (frames are decoded from the file): frame pairs at every cut, 48 frames across the film, the last frame at 1920×1080 |
| `node tools/diffscan.js` | motion scan of the finished MP4: the largest jumps between adjacent frames (a cut or an intended hit) and single-frame spikes |
| `node tools/frame.js 12.5 b5.3 f120 --size 1920x1080` | single frames in `out/frames/`: by seconds, by bar/beat, by frame number; with the subtitles, as in the film (`--no-subs` hides them) |
| `node tools/build.js --no-audio --frames 225:450 --size 960x540 --out out/test.mp4` | quick partial render |
| `npm run audio` / `npm run audio:music` | sound only → `out/audio.en.wav` / `out/audio.music.wav` |
| `node tools/build.js --no-voice` | English picture without voiceover and subtitles (music only) → `out/film.novoice.mp4` |
| `node tools/build.js --no-subs` | English film with the voiceover but without subtitles |
| `--lang ru` for `frame.js` and `contact.js` | frames and contact sheets of the Russian version (English by default) |

← [README](../README.md)
