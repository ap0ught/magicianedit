import { kindFromBlockrou, type TileAnim } from "./anim.ts";
import { MAP_HEIGHT, type RomDoc } from "./rom.ts";

export interface Pickup {
  index: number;
  kind: "treasure" | "heart";
  level: number;
  /** Authoritative coinco column (what the game stores). */
  column: number;
  /** Editor marker cell — may snap to a nearby heart/coin blockrous pad. */
  markColumn: number;
  row: number;
}

const TREASURE_SIG = [17, 5, 44, 5, 89, 5, 50, 4, 42, 4, 22, 4, 10, 4, 25, 1];

export function findCoinco(bytes: Uint8Array): number {
  outer: for (let i = 0; i <= bytes.length - TREASURE_SIG.length; i++) {
    for (let j = 0; j < TREASURE_SIG.length; j++) {
      if (bytes[i + j] !== TREASURE_SIG[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function blockKind(doc: RomDoc, level: number, column: number, row: number): TileAnim | null {
  if (!doc.blockrous) return null;
  return kindFromBlockrou(doc.blockrous[doc.blockAt(level, column, row)]);
}

/** Prefer the real heart/coin blockrous pad; coinco column can be ±1 off the pad. */
function guessPickupMark(
  doc: RomDoc,
  level: number,
  column: number,
  kind: "treasure" | "heart",
): { markColumn: number; row: number } {
  const map = doc.maps[level];
  const want: TileAnim = kind === "heart" ? "heart" : "coin";
  const cols = [column, column - 1, column + 1].filter((c) => c >= 0 && c < map.width);

  for (const c of cols) {
    for (let y = 0; y < MAP_HEIGHT; y++) {
      if (blockKind(doc, level, c, y) === want) return { markColumn: c, row: y };
    }
  }
  if (kind === "treasure") {
    for (const c of cols) {
      for (let y = 0; y < MAP_HEIGHT; y++) {
        if (doc.blockAt(level, c, y) === 0xf3) return { markColumn: c, row: y };
      }
    }
  }
  if (column >= 0 && column < map.width) {
    for (let y = 12; y >= 2; y--) {
      const here = doc.blockAt(level, column, y);
      const below = y < MAP_HEIGHT - 1 ? doc.blockAt(level, column, y + 1) : 0;
      if (here === 0 && below !== 0) return { markColumn: column, row: y };
    }
  }
  return { markColumn: column, row: 7 };
}

/** 48 treasures then 48 hearts from NEWBITS.ROU `coinco` (column, mapIndex). */
export function loadPickups(doc: RomDoc): Pickup[] {
  const off = findCoinco(doc.bytes);
  if (off < 0) return [];
  const out: Pickup[] = [];
  for (let i = 0; i < 96; i++) {
    const column = doc.bytes[off + i * 2];
    const level = doc.bytes[off + i * 2 + 1];
    if (level >= 13 || column >= doc.maps[level].width) continue;
    const kind = i < 48 ? "treasure" : "heart";
    const mark = guessPickupMark(doc, level, column, kind);
    out.push({
      index: i < 48 ? i : i - 48,
      kind,
      level,
      column,
      markColumn: mark.markColumn,
      row: mark.row,
    });
  }
  return out;
}

export function writePickupColumn(
  doc: RomDoc,
  _pickups: Pickup[],
  which: Pickup,
  column: number,
): { off: number; prev: number; next: number } | null {
  const base = findCoinco(doc.bytes);
  if (base < 0) return null;
  const slot = which.kind === "treasure" ? which.index : which.index + 48;
  const off = base + slot * 2;
  const next = Math.max(0, Math.min(doc.maps[which.level].width - 1, column)) & 255;
  return { off, prev: doc.bytes[off], next };
}
