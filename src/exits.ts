import { LEVELS, MAP_HEIGHT, type RomDoc } from "./rom.ts";

export type ExitDir = "up" | "down" | "left" | "right";

export interface MapExit {
  dir: ExitDir;
  toLevel: number;
  /** Local column on the current map (ladder shaft when vertical). */
  fromColumn: number;
  /** Column to focus on the destination map. */
  toColumn: number;
  /** Overlap width in map columns (≥1). */
  overlapCols: number;
  /** Left edge of overlap on the current map (local column). */
  fromCol0: number;
  label: string;
}

/** Inclusive-exclusive overlap of two world-column ranges, or null. */
/** Inclusive-exclusive overlap of two world-column ranges, or null. */
function overlapRange(
  a0: number,
  a1: number,
  b0: number,
  b1: number,
): { start: number; end: number } | null {
  const start = Math.max(a0, b0);
  const end = Math.min(a1, b1);
  if (end <= start) return null;
  return { start, end };
}

/** Compact exit chip text like `→ 6 Water caves · c12`. */
/** Compact exit chip text like `→ 6 Water caves · c12`. */
function shortLabel(level: number, fromColumn?: number): string {
  const lv = LEVELS[level];
  const num = lv.name.replace(/^Map\s+/, "");
  const base = `→ ${num} ${lv.area}`;
  return fromColumn === undefined ? base : `${base} · c${fromColumn}`;
}

/**
 * solidchrs packs four 2-bit quadrant codes (MAPSCROL `findsolid` / CONTROL.ROU):
 * 0 = air, 1 = ladder, 2 = semifloor (fall-through when crouching), 3 = solid.
 */
export function solidQuadrants(solidByte: number): [number, number, number, number] {
  return [
    (solidByte >> 6) & 3,
    (solidByte >> 4) & 3,
    (solidByte >> 2) & 3,
    solidByte & 3,
  ];
}

/** True when any solidchrs quadrant is a ladder (code 1). */
export function blockHasLadder(solidByte: number): boolean {
  return solidQuadrants(solidByte).some((q) => q === 1);
}

/** True when any solidchrs quadrant is a crouch-through floor (code 2). */
export function blockHasSemifloor(solidByte: number): boolean {
  return solidQuadrants(solidByte).some((q) => q === 2);
}

/** Whether the metatile at (col, row) has a ladder quadrant. */
function isLadderAt(doc: RomDoc, level: number, col: number, row: number): boolean {
  const map = doc.maps[level];
  if (col < 0 || col >= map.width || row < 0 || row >= MAP_HEIGHT) return false;
  const id = doc.bytes[map.dataFileOff + col * MAP_HEIGHT + row];
  return blockHasLadder(doc.blocks.solid[id]);
}

/** Count ladder cells among the given rows of one column. */
function ladderCountInRows(doc: RomDoc, level: number, col: number, rows: number[]): number {
  let n = 0;
  for (const r of rows) if (isLadderAt(doc, level, col, r)) n++;
  return n;
}

/** How many ladder tiles in the whole column (prefer long playable shafts). */
function ladderRunLength(doc: RomDoc, level: number, col: number): number {
  let n = 0;
  for (let r = 0; r < MAP_HEIGHT; r++) if (isLadderAt(doc, level, col, r)) n++;
  return n;
}

/**
 * Every climbable world column in the overlap that can leave the screen:
 * ladder on the extreme edge row (0 = up, 13 = down). Mid-room ladders that
 * only graze rows 1–3 are skipped. Far-side ladder preferred but not required
 * (MAPSCROL wraps on world X + height alone).
 */
function listVerticalShafts(
  doc: RomDoc,
  fromLevel: number,
  toLevel: number,
  world0: number,
  world1: number,
  dir: "up" | "down",
): { world: number; both: boolean }[] {
  const from = doc.maps[fromLevel];
  const to = doc.maps[toLevel];
  const edgeRow = dir === "up" ? 0 : MAP_HEIGHT - 1;
  const fromNear = dir === "up" ? [0, 1, 2, 3] : [10, 11, 12, 13];
  const toNear = dir === "up" ? [10, 11, 12, 13] : [0, 1, 2, 3];
  const shafts: { world: number; both: boolean; score: number }[] = [];

  for (let world = world0; world < world1; world++) {
    const fc = world - from.worldX;
    const tc = world - to.worldX;
    // Must actually reach the screen rim — otherwise it is not an exit shaft.
    if (!isLadderAt(doc, fromLevel, fc, edgeRow)) continue;
    const fromEdge = ladderCountInRows(doc, fromLevel, fc, fromNear);
    const toEdge = ladderCountInRows(doc, toLevel, tc, toNear);
    const both = toEdge > 0;
    const run =
      ladderRunLength(doc, fromLevel, fc) + ladderRunLength(doc, toLevel, tc);
    shafts.push({
      world,
      both,
      score: (both ? 1000 : 0) + run * 10 + fromEdge + toEdge,
    });
  }

  shafts.sort((a, b) => b.score - a.score || a.world - b.world);
  return shafts.map(({ world, both }) => ({ world, both }));
}

/**
 * Neighbors from mapinfo worldX/width + mapheights, matching MAPSCROL
 * `checkoffscreen`. Vertical: one exit chip per ladder shaft (same destination
 * can appear more than once when several shafts connect).
 */
export function findMapExits(doc: RomDoc, level: number): MapExit[] {
  const cur = doc.maps[level];
  const cur0 = cur.worldX;
  const cur1 = cur.worldX + cur.width;
  const out: MapExit[] = [];

  doc.maps.forEach((other, i) => {
    if (i === level) return;
    const o0 = other.worldX;
    const o1 = other.worldX + other.width;

    if (other.height === cur.height + 1 || other.height === cur.height - 1) {
      const ov = overlapRange(cur0, cur1, o0, o1);
      if (!ov) return;
      const dir: ExitDir = other.height > cur.height ? "up" : "down";
      const fromCol0 = ov.start - cur0;
      const overlapCols = ov.end - ov.start;
      const shafts = listVerticalShafts(doc, level, i, ov.start, ov.end, dir);
      if (!shafts.length) {
        // No edge ladders — still expose the geometric mid (rare).
        const mid = (ov.start + ov.end) >> 1;
        out.push({
          dir,
          toLevel: i,
          fromColumn: mid - cur0,
          toColumn: mid - o0,
          overlapCols,
          fromCol0,
          label: shortLabel(i, mid - cur0),
        });
        return;
      }
      for (const shaft of shafts) {
        const fromColumn = shaft.world - cur0;
        out.push({
          dir,
          toLevel: i,
          fromColumn,
          toColumn: shaft.world - o0,
          overlapCols,
          fromCol0,
          label: shortLabel(i, fromColumn),
        });
      }
      return;
    }

    if (other.height !== cur.height) return;
    const ov = overlapRange(cur0, cur1, o0, o1);
    if (ov) {
      const otherMid = (o0 + o1) / 2;
      const curMid = (cur0 + cur1) / 2;
      const dir: ExitDir = otherMid < curMid ? "left" : "right";
      const midWorld = (ov.start + ov.end) >> 1;
      out.push({
        dir,
        toLevel: i,
        fromColumn: midWorld - cur0,
        toColumn: midWorld - o0,
        overlapCols: Math.max(1, ov.end - ov.start),
        fromCol0: ov.start - cur0,
        label: shortLabel(i),
      });
      return;
    }
    if (o1 >= cur0 - 1 && o1 <= cur0 + 1) {
      out.push({
        dir: "left",
        toLevel: i,
        fromColumn: 0,
        toColumn: Math.max(0, other.width - 1),
        overlapCols: 1,
        fromCol0: 0,
        label: shortLabel(i),
      });
    } else if (o0 >= cur1 - 1 && o0 <= cur1 + 1) {
      out.push({
        dir: "right",
        toLevel: i,
        fromColumn: cur.width - 1,
        toColumn: 0,
        overlapCols: 1,
        fromCol0: cur.width - 1,
        label: shortLabel(i),
      });
    }
  });

  const dirOrder = { up: 0, down: 1, left: 2, right: 3 };
  out.sort(
    (a, b) =>
      dirOrder[a.dir] - dirOrder[b.dir] ||
      a.fromColumn - b.fromColumn ||
      a.toLevel - b.toLevel,
  );
  return out;
}

const EXIT_DIR_PREFIX: Record<ExitDir, string> = {
  up: "▲ Up",
  down: "▼ Down",
  left: "◀ Left",
  right: "▶ Right",
};

/** Same wording as the exit chips / rail (`▼ Down → 4 Water caves · c187`). */
export function exitChipLabel(exit: MapExit): string {
  return `${EXIT_DIR_PREFIX[exit.dir]} ${exit.label}`;
}

/** Exits whose shaft / edge column is `col` (any row). */
export function exitsAtColumn(doc: RomDoc, level: number, col: number): MapExit[] {
  return findMapExits(doc, level).filter((e) => e.fromColumn === col);
}

/** Edge metatile for a vertical/horizontal exit (what you paint at the rim). */
export function exitEdgeTile(doc: RomDoc, level: number, exit: MapExit): number {
  const map = doc.maps[level];
  const col = Math.max(0, Math.min(map.width - 1, exit.fromColumn));
  const row =
    exit.dir === "up" ? 0 : exit.dir === "down" ? MAP_HEIGHT - 1 : Math.min(7, MAP_HEIGHT - 1);
  return doc.bytes[map.dataFileOff + col * MAP_HEIGHT + row];
}

/** Exits on this level whose rim block is metatile `tileId`. */
export function exitsUsingTile(doc: RomDoc, level: number, tileId: number): MapExit[] {
  return findMapExits(doc, level).filter((e) => exitEdgeTile(doc, level, e) === tileId);
}

/** Dedupe exits for status lines (column hover + rim-tile identity). */
export function mergeExits(...groups: MapExit[][]): MapExit[] {
  const seen = new Set<string>();
  const out: MapExit[] = [];
  for (const group of groups) {
    for (const e of group) {
      const key = `${e.dir}:${e.toLevel}:${e.fromColumn}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
    }
  }
  const dirOrder = { up: 0, down: 1, left: 2, right: 3 };
  out.sort(
    (a, b) =>
      dirOrder[a.dir] - dirOrder[b.dir] ||
      a.fromColumn - b.fromColumn ||
      a.toLevel - b.toLevel,
  );
  return out;
}

/** One-word solidchrs summary for hover / tile inspector. */
/** One-word solidchrs summary for hover / tile inspector. */
export function describeSolid(solidByte: number): string {
  if (blockHasLadder(solidByte)) return "ladder";
  if (blockHasSemifloor(solidByte)) return "semifloor";
  if (solidByte) return "solid";
  return "passable";
}

export interface ExitArrival {
  level: number;
  /** Local pixel X on the destination map (sprite center). */
  x: number;
  /** Pixel Y on the destination map (feet / robiny). */
  y: number;
  /** Exit direction — drawn as an arrow on the stage. */
  dir: ExitDir;
}

/** NES screen wrap used when leaving the top/bottom of a strip. */
export const EXIT_Y_WRAP = 0xd0;

/**
 * Feet Y on a ladder at the top or bottom of a strip.
 * Nudges the 32px marker below ceiling tiles / above the floor so it sits
 * on the visible ladder, not inside the solid edge row.
 */
function feetOnLadderEdge(
  doc: RomDoc,
  level: number,
  col: number,
  edge: "top" | "bottom",
): number {
  const map = doc.maps[level];
  if (col < 0 || col >= map.width) return edge === "top" ? 0x30 : 0xd0;

  if (edge === "top") {
    for (let r = 0; r < MAP_HEIGHT; r++) {
      if (!isLadderAt(doc, level, col, r)) continue;
      // Body is 32px tall with feet at y — clear the ceiling row when ladder
      // starts at row 0, hang on the ladder a couple cells down.
      return Math.min(MAP_HEIGHT * 16 - 8, Math.max(0x28, (r + 2) * 16));
    }
    // Game wrap ≈ $20; keep a little lower so the marker is visible.
    return 0x30;
  }

  for (let r = MAP_HEIGHT - 1; r >= 0; r--) {
    if (!isLadderAt(doc, level, col, r)) continue;
    return Math.max(0x28, Math.min(MAP_HEIGHT * 16 - 8, r * 16 + 8));
  }
  return 0x10 + EXIT_Y_WRAP;
}

/** Robin pose on the destination map after taking this exit (game wrap). */
/** Robin pose on the destination map after taking this exit (game wrap). */
export function arrivalAfterExit(doc: RomDoc, _fromLevel: number, exit: MapExit): ExitArrival {
  const to = doc.maps[exit.toLevel];
  const localCol = exit.toColumn;
  const x = localCol * 16 + 8;
  let y: number;
  if (exit.dir === "up") {
    y = feetOnLadderEdge(doc, exit.toLevel, localCol, "bottom");
  } else if (exit.dir === "down") {
    y = feetOnLadderEdge(doc, exit.toLevel, localCol, "top");
  } else {
    y = standYOnColumn(doc, exit.toLevel, localCol);
  }
  const maxY = MAP_HEIGHT * 16 - 8;
  return {
    level: exit.toLevel,
    x: Math.max(8, Math.min(to.width * 16 - 8, x)),
    y: Math.max(32, Math.min(maxY, y)),
    dir: exit.dir,
  };
}

/** Pose on the *current* map at the exit edge (right-click “show exit here”). */
export function leavePoseOnExit(doc: RomDoc, level: number, exit: MapExit): ExitArrival {
  const map = doc.maps[level];
  const x = Math.max(8, Math.min(map.width * 16 - 8, exit.fromColumn * 16 + 8));
  let y: number;
  if (exit.dir === "up") y = feetOnLadderEdge(doc, level, exit.fromColumn, "top");
  else if (exit.dir === "down") y = feetOnLadderEdge(doc, level, exit.fromColumn, "bottom");
  else y = standYOnColumn(doc, level, exit.fromColumn);
  return { level, x, y, dir: exit.dir };
}

/** Feet Y on the topmost solid (non-ladder) block in a column, else mid-screen. */
function standYOnColumn(doc: RomDoc, level: number, col: number): number {
  const map = doc.maps[level];
  if (col < 0 || col >= map.width) return 0x80;
  for (let row = 0; row < MAP_HEIGHT; row++) {
    const id = doc.bytes[map.dataFileOff + col * MAP_HEIGHT + row];
    const s = doc.blocks.solid[id];
    if (s === 0) continue;
    if (blockHasLadder(s)) continue;
    return Math.max(32, row * 16);
  }
  return 0x80;
}
