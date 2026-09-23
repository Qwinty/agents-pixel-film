# Материалы для мультика

Источник: материалы канала Pixel by Pixel (@p_by_p).

> В публичном репозитории лежат только `character/` и `brand/` — то, что идёт в кадр. Референсы (`animation_refs/`, `backgrounds/`, `style_refs/`) остались локально.

## character/ — герой
- `Char.png` — оригинал персонажа, 2816×1536, прозрачный фон (AI-апскейл пиксель-арта)
- `CharOnWhite.jpg` — то же на белом, 1024×1024
- `Char_sprite_24x45.png` — **чистый нативный спрайт 24×45 px**, извлечён из Char.png, 10 цветов, прозрачный фон
- `Char_sprite_x20.png` / `_onwhite.png` — он же, увеличен ×20 (nearest neighbor)
- `palette.json` — палитра героя:
  outline `#020302`, sweater `#894c97`, sweater_shadow `#4f1c5c`, skin `#fccca2`, hair `#f8db91`,
  hair_mid `#e3a365`, hair_shadow `#c07d4b`, blush `#fc9e79`, pants `#898a84`, pants_shadow `#60615b`

Герой: блондин с торчащим вихром, фиолетовый свитер, серые штаны, чёрные ботинки; глаза — две чёрные точки, рта нет.

## animation_refs/ — готовая анимация героя
- `Char_WalkCycle_greenscreen.mp4` — AI-видео цикла ходьбы (вид сбоку, 3/4), 1280×720, 24 fps, 8 с
- `walk_frames_keyed/walk_001…192.png` — эти кадры с вырезанным фоном (RGBA)
- `Char_Walk_inScene_ComfyUI.mp4` — герой ходит влево-вправо в сцене Stories, 704×1280, 10 с
- `PbP_Stories1_final.mp4` — готовая сторис (1152×2064, 60 fps, 10 с): лого, QR, печатающийся текст, идущий герой

## backgrounds/ — сцена из Stories (вертикальная)
- `Stories_RetroPC_*.png` — рамка ретро-компьютера (клавиатура, монитор «PIXEL BY PIXEL >», дискеты, палитра), 1152×2064

## brand/
- `Eye_Final(_Transparent).png` — логотип: глаз с радужкой-цветовым кругом и `>_` в зрачке
- `ChatIcon_Final.png` — иконка-облачко с тем же кругом
- `qr-code.png` — QR на t.me/p_by_p

## style_refs/
- `Post1_WhoAmI.png` — обложка «Кто я?» (манга/ч-б коллаж + пиксельная рамка)
- `20260203_*.jpg` — кинематографичный пиксель-арт с героем (ночная комната, неон, худи)
- `image-prompt_SKILL.md` — правила промптов для генерации картинок канала (pixel art, 16:9, без текста, герой = young man in purple sweater)
