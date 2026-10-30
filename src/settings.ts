import type { Edit, RomDoc } from "./rom.ts";

/** Named palette bases from MAPDATA.DAT's gamepallettes. */
export const PAL_SETS: { name: string; index: number }[] = [
  { name: "Sky / Kitchen", index: 0 },
  { name: "Water", index: 16 },
  { name: "Lava", index: 32 },
  { name: "Dungeon", index: 48 },
  { name: "Hall", index: 64 },
  { name: "Bedroom", index: 80 },
  { name: "Church", index: 96 },
];

/** Character-set list offsets from mapchrsdefs. */
export const CHR_SETS: { name: string; index: number }[] = [
  { name: "Dungeon", index: 0 },
  { name: "Hall", index: 3 },
  { name: "Church", index: 7 },
  { name: "Sky", index: 11 },
];

/** Active set first, then the rest of the predefined mapchrsdefs lists. */
export function orderedChrSets(activeIndex: number): { name: string; index: number; active: boolean }[] {
  const known = CHR_SETS.map((c) => ({ ...c, active: c.index === activeIndex }));
  const active = known.filter((c) => c.active);
  const rest = known.filter((c) => !c.active);
  if (active.length) return [...active, ...rest];
  return [{ name: `Custom`, index: activeIndex, active: true }, ...known];
}

/** Display name for a mapchrsdefs list index. */
export function chrSetName(chrIndex: number): string {
  return CHR_SETS.find((c) => c.index === chrIndex)?.name ?? `Custom (${chrIndex})`;
}

/** Describe packs loaded by the current level's chrList (chr-table slot → start tile). */
export function describeChrPacks(
  doc: RomDoc,
  level: number,
): { slot: number; startTile: number; tileCountHint: string }[] {
  const map = doc.maps[level];
  return map.chrList.map((slot) => {
    const entry = doc.chrTable + slot * 4;
    const startTile = doc.bytes[entry + 2];
    return {
      slot,
      startTile,
      tileCountHint: `table#${slot} → tiles from $${startTile.toString(16).toUpperCase().padStart(2, "0")}`,
    };
  });
}

export interface RobinStats {
  livesOff: number;
  cheatLivesOff: number;
  startHeartsOff: number;
  maxHeartsOff: number;
  afterExtraOff: number;
  jumpOff: number;
  runTableOff: number;
}

/**
 * `runtablelo` in CONTROL.ROU: `do 47` generated entries + trailing `defb 0`.
 * Indexed by `runcount` (velocity). Cap is 47; slot 0 is never read (idle early-out).
 */
export const RUN_TABLE_LEN = 48;
/** Max `runcount` / last table index (`cmp #48` then force 47). */
export const RUN_TABLE_MAX = 47;
/** Stock generator step: `runaccel = 256/48` → 5. */
export const RUN_ACCEL = 5;

/** Stock curve: indices 0..46 = i×5, index 47 = 0 (max-speed subpixel slot). */
export function stockRunTable(): number[] {
  const out = Array.from({ length: RUN_TABLE_LEN }, (_, i) =>
    i < RUN_TABLE_MAX ? (i * RUN_ACCEL) & 255 : 0,
  );
  return out;
}

/**
 * Whole pixels added to robinxl each frame at this velocity, before subpixel carry.
 * CONTROL.ROU: Y starts at 1, `iny` when `runcount == $2F` (47).
 */
export function runTablePixelStep(index: number): number {
  if (index <= 0) return 0;
  if (index >= RUN_TABLE_MAX) return 2;
  return 1;
}

/** Approximate horizontal speed in pixels/frame for UI display. */
export function runTableSpeedPx(index: number, subpixel: number): number {
  return runTablePixelStep(index) + (subpixel & 255) / 256;
}

/** Byte-signature scan; negative sig entries are wildcards. */
function find(bytes: Uint8Array, sig: number[], from = 0): number {
  outer: for (let i = from; i <= bytes.length - sig.length; i++) {
    for (let j = 0; j < sig.length; j++) {
      if (sig[j] >= 0 && bytes[i + j] !== sig[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/** Locate Robin constants the original editor exposed. Wildcards are -1. */
export function findRobinStats(bytes: Uint8Array): RobinStats | null {
  // ldx #lives … ldx #cheat … stx lives
  const lives = find(bytes, [0xa2, -1, 0xa5, 0x07, 0x29, 0x82, 0xc9, 0x82, 0xd0, 0x02, 0xa2, -1, 0x86, 0x48]);
  if (lives < 0) return null;
  // lda #startHearts / sta hearts, immediately after stx lives
  const startHeartsOp = lives + 14;
  if (
    bytes[startHeartsOp] !== 0xa9 ||
    bytes[startHeartsOp + 2] !== 0x85 ||
    bytes[startHeartsOp + 3] !== 0x49
  ) {
    return null;
  }
  // addtohearts: lda hearts / clc / adc #1 / sta hearts / cmp #max
  const hearts = find(bytes, [0xa5, 0x49, 0x18, 0x69, 0x01, 0x85, 0x49, 0xc9, -1, 0x90]);
  if (hearts < 0) return null;
  // after the branch, typically: inc lives / clc / adc #-N / sta hearts
  const after = find(bytes, [0xe6, 0x48, 0x18, 0x69, -1, 0x85, 0x49], hearts);
  if (after < 0) return null;
  // jump: lsr×3 / eor #$FF / clc / adc #strength / sta robingravity ($0318)
  const jump = find(bytes, [0x4a, 0x4a, 0x4a, 0x49, 0xff, 0x18, 0x69, -1, 0x8d, 0x18, 0x03]);
  if (jump < 0) return null;
  // runtablelo: 00 05 0a 0f … (stock ×5 curve)
  const run = find(bytes, [0x00, 0x05, 0x0a, 0x0f, 0x14, 0x19, 0x1e, 0x23]);
  if (run < 0) return null;

  return {
    livesOff: lives + 1,
    cheatLivesOff: lives + 11,
    startHeartsOff: startHeartsOp + 1,
    maxHeartsOff: hearts + 8,
    afterExtraOff: after + 4,
    jumpOff: jump + 7,
    runTableOff: run,
  };
}

/** Read lives / hearts / jump / run-table values from located offsets. */
export function readRobin(doc: RomDoc, stats: RobinStats) {
  const b = doc.bytes;
  const after = b[stats.afterExtraOff];
  return {
    lives: b[stats.livesOff],
    cheatLives: b[stats.cheatLivesOff],
    startHearts: b[stats.startHeartsOff],
    maxHearts: b[stats.maxHeartsOff],
    /** Hearts kept after an extra life (encoded as a signed ADC immediate). */
    afterExtra: after < 128 ? after : after - 256,
    /** Jump impulse (signed ADC immediate; more negative = higher jump). */
    jump: (() => {
      const n = b[stats.jumpOff];
      return n < 128 ? n : n - 256;
    })(),
    /** Full `runtablelo` including the trailing max-speed byte. */
    runTable: Array.from(b.subarray(stats.runTableOff, stats.runTableOff + RUN_TABLE_LEN)),
  };
}

/** Build ROM edits for one Robin stats field (not the full run table). */
export function patchRobin(
  doc: RomDoc,
  stats: RobinStats,
  field: keyof ReturnType<typeof readRobin>,
  value: number,
): Edit[] {
  const edits: Edit[] = [];
  const put = (off: number, next: number) => {
    edits.push({ off, prev: doc.bytes[off], next: next & 255 });
  };
  if (field === "lives") put(stats.livesOff, value);
  else if (field === "cheatLives") put(stats.cheatLivesOff, value);
  else if (field === "startHearts") put(stats.startHeartsOff, value);
  else if (field === "maxHearts") put(stats.maxHeartsOff, value);
  else if (field === "afterExtra") put(stats.afterExtraOff, value < 0 ? value + 256 : value);
  else if (field === "jump") put(stats.jumpOff, value < 0 ? value + 256 : value);
  else if (field === "runTable") {
    /* edited through setRunEntry / setRunTable */
  }
  return edits;
}

/** Single-byte edit for one `runtablelo` slot. */
export function setRunEntry(doc: RomDoc, stats: RobinStats, index: number, value: number): Edit {
  if (index < 0 || index >= RUN_TABLE_LEN) {
    throw new RangeError(`run table index ${index} out of range`);
  }
  const off = stats.runTableOff + index;
  return { off, prev: doc.bytes[off], next: value & 255 };
}

/** Patch the whole table (only emits edits where bytes differ). */
export function setRunTable(doc: RomDoc, stats: RobinStats, values: number[]): Edit[] {
  const edits: Edit[] = [];
  const n = Math.min(RUN_TABLE_LEN, values.length);
  for (let i = 0; i < n; i++) {
    const next = values[i]! & 255;
    const off = stats.runTableOff + i;
    const prev = doc.bytes[off];
    if (prev !== next) edits.push({ off, prev, next });
  }
  return edits;
}

/** Restore the stock ×5 run acceleration curve. */
export function resetRunTable(doc: RomDoc, stats: RobinStats): Edit[] {
  return setRunTable(doc, stats, stockRunTable());
}

/** Whether a flash block should show its replacement tile at this animation tick. */
export function flashVisible(raw: number[], tick: number): boolean {
  const on = Math.max(1, raw[5] || 1);
  const off = Math.max(1, raw[6] || 1);
  const period = on + off;
  const phase = tick % period;
  const startOff = (raw[3] & 0x80) !== 0;
  const inOn = phase < on;
  return startOff ? !inOn : inOn;
}
