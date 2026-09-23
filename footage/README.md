# Source materials

Source: materials of the Pixel by Pixel channel (@p_by_p).

> The public repository holds only `character/` and `brand/`, the files that appear in the frame. The references (`animation_refs/`, `backgrounds/`, `style_refs/`) stay local and are never put in the frame.

## character/ — the hero
- `Char.png` — the original character, 2816×1536, transparent background (AI upscale of the pixel art)
- `CharOnWhite.jpg` — the same on white, 1024×1024
- `Char_sprite_24x45.png` — **the clean native 24×45 px sprite**, extracted from Char.png, 10 colors, transparent background
- `Char_sprite_x20.png` / `_onwhite.png` — the same sprite scaled ×20 (nearest neighbor)
- `palette.json` — the hero's palette:
  outline `#020302`, sweater `#894c97`, sweater_shadow `#4f1c5c`, skin `#fccca2`, hair `#f8db91`,
  hair_mid `#e3a365`, hair_shadow `#c07d4b`, blush `#fc9e79`, pants `#898a84`, pants_shadow `#60615b`

The hero: blond with a sticking-up cowlick, purple sweater, grey trousers, black boots; the eyes are two black dots, no mouth.

## animation_refs/ — ready-made animation of the hero (local only)
- `Char_WalkCycle_greenscreen.mp4` — AI video of a walk cycle (side view, 3/4), 1280×720, 24 fps, 8 s
- `walk_frames_keyed/walk_001…192.png` — the same frames with the background keyed out (RGBA)
- `Char_Walk_inScene_ComfyUI.mp4` — the hero walks left and right in the Stories scene, 704×1280, 10 s
- `PbP_Stories1_final.mp4` — a finished story (1152×2064, 60 fps, 10 s): logo, QR, typing text, walking hero

## backgrounds/ — the Stories scene, vertical (local only)
- `Stories_RetroPC_*.png` — a retro computer frame (keyboard, "PIXEL BY PIXEL >" monitor, floppies, palette), 1152×2064

## brand/
- `Eye_Final(_Transparent).png` — the logo: an eye with a color-wheel iris and `>_` in the pupil
- `ChatIcon_Final.png` — a speech-bubble icon with the same ring
- `qr-code.png` — QR code for t.me/p_by_p

## style_refs/ (local only)
- `Post1_WhoAmI.png` — the "Who am I?" cover (manga/b&w collage + pixel frame)
- `20260203_*.jpg` — cinematic pixel art with the hero (night room, neon, hoodie)
- `image-prompt_SKILL.md` — prompt rules for the channel's generated images (pixel art, 16:9, no text, hero = young man in purple sweater)
