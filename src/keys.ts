import { readRaw } from "./objects.ts";
import { LEVELS, type RomDoc } from "./rom.ts";

/** First two door records from XTRACONT.ROU `doordata`. */
const DOOR_SIG = [5, 14, 69, 5, 79, 44];

/**
 * Door count used by `cmp #255-noofdoors`. Source: `((end-start)/3)+1` with 17
 * records → 18. Door link bytes are 239…255 (door index = 255 - link).
 */
export const NO_OF_DOORS = 18;
export const DOOR_LINK_MIN = 255 - NO_OF_DOORS; // 237

export interface DoorRec {
  /** Key link byte that opens this door (255, 254, …). */
  link: number;
  /** Index into doordata (0 = link 255). */
  index: number;
  level: number;
  column: number;
  /**
   * Bottom tile row (low nibble of packed `y+height*16`).
   * closedoor / doorrou grow the door upward from this row.
   */
  row: number;
  /** Door height in map tiles (high nibble). */
  tileHeight: number;
  /** Top row of the closed door (inclusive). */
  topRow: number;
  /** Pixel top of the door rectangle. */
  pixelY: number;
  /** Pixel height of the door rectangle. */
  pixelH: number;
}

export interface KeyLinkInfo {
  link: number;
  kind: "unlinked" | "door" | "platform" | "unknown";
  summary: string;
  /** Matching platform/lift object indices on any level. */
  platforms: { level: number; index: number; id: number; horizontal: boolean }[];
  door: DoorRec | null;
}

/** File offset of XTRACONT.ROU `doordata`, or -1 if missing. */
export function findDoordata(bytes: Uint8Array): number {
  outer: for (let i = 0; i <= bytes.length - DOOR_SIG.length; i++) {
    for (let j = 0; j < DOOR_SIG.length; j++) {
      if (bytes[i + j] !== DOOR_SIG[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/** Parse door rectangles (link 255, 254, …) from doordata. */
export function loadDoors(doc: RomDoc): DoorRec[] {
  const off = findDoordata(doc.bytes);
  if (off < 0) return [];
  const doors: DoorRec[] = [];
  for (let n = 0; n < NO_OF_DOORS - 1; n++) {
    const base = off + n * 3;
    const level = doc.bytes[base];
    const column = doc.bytes[base + 1];
    const yh = doc.bytes[base + 2];
    if (level >= LEVELS.length) break;
    const bottom = yh & 15;
    const tileHeight = Math.max(1, (yh >> 4) & 15);
    const topRow = Math.max(0, bottom - tileHeight + 1);
    doors.push({
      link: 255 - n,
      index: n,
      level,
      column,
      row: bottom,
      tileHeight,
      topRow,
      pixelY: topRow * 16,
      pixelH: (bottom - topRow + 1) * 16,
    });
  }
  return doors;
}

/** Platforms / lifts whose id byte matches a key UNLINK target. */
function findPlatforms(doc: RomDoc, id: number) {
  const hits: KeyLinkInfo["platforms"] = [];
  for (let lv = 0; lv < LEVELS.length; lv++) {
    doc.objects[lv].forEach((rec, index) => {
      if (rec.type !== 3 && rec.type !== 4) return;
      const raw = readRaw(doc, rec);
      if (raw[2] !== id) return;
      hits.push({ level: lv, index, id, horizontal: rec.type === 3 });
    });
  }
  return hits;
}

/** Explain a key's link byte the way the game branches in keyrou. */
export function describeKeyLink(doc: RomDoc, link: number, doors?: DoorRec[]): KeyLinkInfo {
  const table = doors ?? loadDoors(doc);
  if (link === 0) {
    return {
      link,
      kind: "unlinked",
      summary: "Unlinked — picking up this key does nothing to doors or lifts.",
      platforms: [],
      door: null,
    };
  }
  if (link >= DOOR_LINK_MIN) {
    const door = table.find((d) => d.link === link) ?? null;
    if (door) {
      const h = Math.max(1, door.tileHeight);
      return {
        link,
        kind: "door",
        summary: `Opens door #${door.link} on ${LEVELS[door.level].name} at column ${door.column}, rows ${door.topRow}–${door.row} (${h} tile${h === 1 ? "" : "s"} tall, from bottom).`,
        platforms: [],
        door,
      };
    }
    return {
      link,
      kind: "door",
      summary: `Door link ${link} (index ${255 - link}) — not in this ROM's doordata table.`,
      platforms: [],
      door: null,
    };
  }
  const platforms = findPlatforms(doc, link);
  if (platforms.length) {
    const parts = platforms.map(
      (p) =>
        `${LEVELS[p.level].name} ${p.horizontal ? "platform" : "lift"} #${p.index} (id ${p.id})`,
    );
    return {
      link,
      kind: "platform",
      summary: `Enables / unlocks ${parts.join("; ")}.`,
      platforms,
      door: null,
    };
  }
  return {
    link,
    kind: "unknown",
    summary: `Toggles extra id ${link} (lift/door flag). No platform with that id was found in the object lists.`,
    platforms: [],
    door: null,
  };
}

/** Short label for object lists / canvas. */
export function keyLinkShort(info: KeyLinkInfo): string {
  if (info.kind === "unlinked") return "unlinked";
  if (info.kind === "door" && info.door) {
    return `→ door ${info.door.link} @${LEVELS[info.door.level].name.replace(/^Map /, "M")} c${info.door.column}`;
  }
  if (info.kind === "door") return `→ door link ${info.link}`;
  if (info.kind === "platform" && info.platforms.length) {
    const p = info.platforms[0];
    return `→ ${p.horizontal ? "plat" : "lift"} id ${p.id}`;
  }
  return `→ id ${info.link}`;
}
