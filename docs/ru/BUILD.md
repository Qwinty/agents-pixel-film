# Сборка и инструменты

[English](../BUILD.md)

```bash
npm run build        # английская версия, озвучка + субтитры → out/film.mp4
npm run build:ru     # русская версия, только музыка        → out/film.ru.mp4
npm run build:all    # обе
```

Это `node tools/build.js [--lang en|ru]`:
1. синтезирует саундтрек и для английской версии подмешивает озвучку из `voice/en/` → `out/audio.en.wav` (русская: `out/audio.music.wav`);
2. считает 1350 кадров параллельно в `worker_threads`, для английской версии — с вшитыми субтитрами;
3. по порядку отдаёт их в ffmpeg → `out/film.mp4` или `out/film.ru.mp4`.

Ключ ElevenLabs для сборки не нужен: дубли озвучки лежат в `voice/`. Ключ нужен, только чтобы перезаписать озвучку после правки текста в `src/narration.js`:

```bash
npm run voice        # node tools/voice.js [en] [--force]
```

Скрипт берёт `ELEVENLABS_API_KEY` из окружения или из `.env` (он в `.gitignore`). Новый дубль запрашивается, только если изменились текст, голос или настройки; тогда скрипт получает и его принудительное выравнивание (время слов). Он печатает, как каждая реплика ложится в своё окно.

Попробовать другой голос, не трогая `voice/`: `node tools/voice.js en --voice <voiceId> --dir voice-audition/<name>`, затем `node src/audio/render.js --voice-dir voice-audition/<name> out/audition.wav`. Дубль v3 всего текста стоит ~360 символов квоты ElevenLabs.

На 16-поточном CPU (Ryzen 7 8845HS) полная сборка занимает около 40 секунд: звук — пара секунд, 1350 кадров 1920×1080 — ~38 кадров/с. Нужны Node ≥ 20 и `ffmpeg` в PATH; npm-зависимостей нет.

Проверка QR в готовом MP4 (Python через uv, в систему ничего не ставится):

```bash
npm run qr
```

Для русской версии: `uv run --with opencv-python --with numpy python tools/qr_check.py out/film.ru.mp4`.

Остальные команды:

| Команда | Что делает |
|---|---|
| `node tools/contact.js [s01 … s16 \| film] [--subs]` | контакт-листы в `out/sheets/`: тайл на каждую восьмую внутри сцены + лист всего фильма; `--subs` вшивает субтитры |
| `node tools/mp4sheet.js` | проверка готового MP4 (кадры декодируются из файла): пары кадров на каждой склейке, 48 кадров по фильму, последний кадр 1920×1080 |
| `node tools/diffscan.js` | скан движения готового MP4: самые большие скачки между соседними кадрами (склейка или задуманный удар) и однокадровые «выскоки» |
| `node tools/frame.js 12.5 b5.3 f120 --size 1920x1080` | отдельные кадры в `out/frames/`: по секундам, по такту/доле, по номеру кадра; с субтитрами, как в фильме (`--no-subs` их прячет) |
| `node tools/build.js --no-audio --frames 225:450 --size 960x540 --out out/test.mp4` | быстрый частичный рендер |
| `npm run audio` / `npm run audio:music` | только звук → `out/audio.en.wav` / `out/audio.music.wav` |
| `node tools/build.js --no-voice` | английская картинка без озвучки и субтитров (только музыка) → `out/film.novoice.mp4` |
| `node tools/build.js --no-subs` | английская версия с озвучкой, но без субтитров |
| `--lang ru` у `frame.js` и `contact.js` | кадры и контакт-листы русской версии (по умолчанию английская) |

← [README](../../README.ru.md)
