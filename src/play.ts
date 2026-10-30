import { blockHasLadder } from "./exits.ts";
import { LEVELS, MAP_HEIGHT, type RomDoc } from "./rom.ts";

export interface PlaySpawn {
  /** Local pixel X on the level (sprite center / feet X). */
  x: number;
  /** Pixel Y (robiny / feet). */
  y: number;
}

/**
 * Patch a ROM copy so a cold boot skips the title and begins on `level`.
 * Uses `spawn` when given (e.g. exit-arrival pose); otherwise a left-side floor.
 * Patch sites are found by opcode signature so Asia and rebuilt offsets both work.
 */
export function romForPlayFromMap(
  doc: RomDoc,
  level: number,
  at?: PlaySpawn | null,
): Uint8Array {
  if (level < 0 || level >= LEVELS.length) {
    throw new Error(`Bad level ${level}`);
  }
  const out = new Uint8Array(doc.bytes);
  const map = doc.maps[level];
  const pose = at ?? spawnPose(doc, level);
  const localX = pose.x;
  const localY = pose.y;
  // resetrobinvars leaves minmap=0; gointonewmap rebases by −worldX×16.
  // Seed robinxl as *world* pixels so local X after remap is localX.
  const worldX = map.worldX * 16 + localX;

  skipTitleScreen(out);

  const startImm = findStartLevelImmediate(out);
  if (startImm === null) throw new Error("Could not find startlevel lda #imm in ROM");
  out[startImm] = level & 0xff;

  const imm = findRobinSpawnImmediates(out);
  if (!imm) throw new Error("Could not find resetrobinvars robinxl/y stores in ROM");
  out[imm.xl] = worldX & 0xff;
  out[imm.xh] = (worldX >> 8) & 0xff;
  out[imm.y] = localY & 0xff;

  return out;
}

export function playRomFileName(level: number): string {
  const slug = LEVELS[level].name.replace(/\s+/g, "-").toLowerCase();
  return `srh-play-${slug}.nes`;
}

/** Walkable feet pose on this strip (pixel X centered on a column, Y on a floor). */
export function spawnPose(doc: RomDoc, level: number): { x: number; y: number } {
  const map = doc.maps[level];
  let best: { col: number; y: number; score: number } | null = null;

  for (let c = 1; c < map.width - 1; c++) {
    const floorRow = floorRowInColumn(doc, level, c);
    if (floorRow === null) continue;
    const y = floorRow * 16;
    // Prefer early (left) columns — where a strip’s progress usually begins —
    // with a real floor (not a ladder shaft) and room to stand.
    const nearLadder =
      columnHasLadder(doc, level, c) ||
      columnHasLadder(doc, level, c - 1) ||
      columnHasLadder(doc, level, c + 1)
        ? 5
        : 0;
    const onLadderOnly = columnHasLadder(doc, level, c) && nearLadder === 5 ? -40 : 0;
    const score = 2000 - c * 2 + nearLadder + onLadderOnly + floorRow;
    if (!best || score > best.score) best = { col: c, y, score };
  }

  if (best) return { x: best.col * 16 + 8, y: Math.max(0x30, Math.min(0xf0, best.y)) };

  // Absolute fallback — stock-ish mid-bottom.
  return {
    x: Math.min(map.width * 16 - 16, Math.max(32, (map.width >> 2) * 16 + 8)),
    y: 0xd0,
  };
}

function isBlocking(solid: number): boolean {
  return solid !== 0 && !blockHasLadder(solid);
}

/** Top row of a standable floor: solid cell with non-solid cell above. */
function floorRowInColumn(doc: RomDoc, level: number, col: number): number | null {
  const map = doc.maps[level];
  let found: number | null = null;
  for (let row = 1; row < MAP_HEIGHT; row++) {
    const below = doc.blocks.solid[doc.bytes[map.dataFileOff + col * MAP_HEIGHT + row]];
    const above = doc.blocks.solid[doc.bytes[map.dataFileOff + col * MAP_HEIGHT + (row - 1)]];
    if (!isBlocking(below)) continue;
    if (isBlocking(above)) continue;
    found = row; // keep going — prefer the lowest platform in the column
  }
  return found;
}

function columnHasLadder(doc: RomDoc, level: number, col: number): boolean {
  const map = doc.maps[level];
  if (col < 0 || col >= map.width) return false;
  for (let r = 0; r < MAP_HEIGHT; r++) {
    const id = doc.bytes[map.dataFileOff + col * MAP_HEIGHT + r];
    if (blockHasLadder(doc.blocks.solid[id])) return true;
  }
  return false;
}

/**
 * MAINLOOP title block: jsr changebank13 / jsr titlescreen / jsr changebank12
 * (bytes `20 ?? C2  20 ?? 9D  20 ?? C2`). NOP all three so Play drops straight
 * into anewgame; gointonewmap still turns the screen back on.
 */
function skipTitleScreen(bytes: Uint8Array): void {
  for (let i = 0; i < bytes.length - 9; i++) {
    if (
      bytes[i] === 0x20 &&
      bytes[i + 2] === 0xc2 &&
      bytes[i + 3] === 0x20 &&
      bytes[i + 5] === 0x9d &&
      bytes[i + 6] === 0x20 &&
      bytes[i + 8] === 0xc2
    ) {
      for (let k = 0; k < 9; k++) bytes[i + k] = 0xea;
      return;
    }
  }
}

/** `lda #imm / sta $42 (mapno) / jsr …` — startlevel load in MAINLOOP. */
function findStartLevelImmediate(bytes: Uint8Array): number | null {
  for (let i = 0; i < bytes.length - 6; i++) {
    if (
      bytes[i] === 0xa9 &&
      bytes[i + 2] === 0x85 &&
      bytes[i + 3] === 0x42 &&
      bytes[i + 4] === 0x20
    ) {
      return i + 1;
    }
  }
  return null;
}

/**
 * `lda #xl / sta robinxl / lda #xh / sta robinxh / lda #y / sta robiny`
 * inside resetrobinvars (robinxl=$0308, xh=$0309, y=$030A).
 */
function findRobinSpawnImmediates(
  bytes: Uint8Array,
): { xl: number; xh: number; y: number } | null {
  for (let i = 0; i < bytes.length - 16; i++) {
    if (bytes[i] !== 0xa9) continue;
    if (bytes[i + 2] !== 0x8d || bytes[i + 3] !== 0x08 || bytes[i + 4] !== 0x03) continue;
    if (bytes[i + 5] !== 0xa9) continue;
    if (bytes[i + 7] !== 0x8d || bytes[i + 8] !== 0x09 || bytes[i + 9] !== 0x03) continue;
    if (bytes[i + 10] !== 0xa9) continue;
    if (bytes[i + 12] !== 0x8d || bytes[i + 13] !== 0x0a || bytes[i + 14] !== 0x03) continue;
    return { xl: i + 1, xh: i + 6, y: i + 11 };
  }
  return null;
}
