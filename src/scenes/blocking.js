// Blocking: where the cast stands, shared by all shots so hand-offs between shots match.
// World coords (art px) in the 320×180 room. Feet anchors (bottom centre).
import { L } from '../assets/room.js';

export const FLOOR_Y = L.floorLineY;    // 172 — feet of characters standing on the floor (front row)
export const DESK_Y = 139;               // feet of bots standing on the desk top (front half)

/** Shots 2–3: the four freshly spawned bots in a row on the floor (left→right: designer, coder,
 *  barista, tester — so the fly-off to their stations never crosses paths). */
export const SPAWN_X = { designer: 112, coder: 140, barista: 172, tester: 204 };

/**
 * Stations: where each bot goes after the fly-off (end of shot 3) and where they stand again in
 * the dark (shot 10) and while the hero conducts (shot 11).
 *   coder    — on the desk, left of the monitor, at the keyboard's right end (types, code pours)
 *   barista  — on the floor next to the mug's landing spot / river source (L.mugFloor = 206,171)
 *   designer — on the floor at the left, by the bookshelf & poster wall (repaints walls)
 *   tester   — on the floor by the power strip (L.strip = 272,152, 22×5)
 */
export const STATION = {
  coder: { x: 160, y: DESK_Y, layer: 'desk' },
  barista: { x: 190, y: FLOOR_Y, layer: 'floor' },
  designer: { x: 80, y: FLOOR_Y, layer: 'floor' },
  tester: { x: 262, y: 164, layer: 'floor' },
};

/** The hero standing on the floor in front of the desk (from the chaos on: shots 8–13). */
export const HERO_STAND = { x: 118, y: 171 };
/** The hero seated behind the desk (shots 1–7): feet anchor hidden by the desk. */
export const HERO_SEAT = { x: L.hero.x, y: L.hero.y };
