import { LEVELS, type RomDoc } from "./rom.ts";

/**
 * Production start map — `startlevel equ 5` in MACROS.PDS (0-based Map 6).
 * CONTROL.ROU `resetrobinvars` sets robinxl=290, robiny=208 before gointonewmap.
 */
export const START_LEVEL = 5;
export const ROBIN_START_X = 290;
export const ROBIN_START_Y = 208;

export interface RobinSpawn {
  level: number;
  /** Pixel X within the level (world X already subtracted). */
  x: number;
  /** Pixel Y (feet / sprite origin, same as guards). */
  y: number;
  note: string;
}

/** Robin's start pose on the start level, or null if he doesn't begin here. */
export function robinSpawnOnLevel(doc: RomDoc, level: number): RobinSpawn | null {
  if (level !== START_LEVEL) return null;
  const map = doc.maps[level];
  const worldPx = map.worldX * 16;
  const x = ROBIN_START_X - worldPx;
  if (x < -16 || x > map.width * 16 + 16) return null;
  return {
    level,
    x,
    y: ROBIN_START_Y,
    note: `Starts on ${LEVELS[level].name} at pixel (${ROBIN_START_X}, ${ROBIN_START_Y}) — CONTROL.ROU resetrobinvars.`,
  };
}

/** Always-available start pose (falls back if world-X remap is off-map). */
export function robinSpawnInfo(doc: RomDoc): RobinSpawn {
  const on = robinSpawnOnLevel(doc, START_LEVEL);
  if (on) return on;
  return {
    level: START_LEVEL,
    x: 0,
    y: ROBIN_START_Y,
    note: `Start level ${LEVELS[START_LEVEL]?.name ?? START_LEVEL} (startlevel=5).`,
  };
}
