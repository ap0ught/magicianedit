/** Pack extent inference and shared map/byte-pack region discovery. */

import { INES_HEADER, PRG_SLOT } from "./format.ts";
import { DescriptorError, type RawLevel } from "./descriptors.ts";

export interface Region {
  kind: "blk" | "map" | "col";
  fileOff: number;
  size: number;
  width: number;
  height: number;
}

export function sizeRegions(rom: Uint8Array, levels: RawLevel[]): Region[] {
  const byBank = new Map<number, Map<number, { kind: Region["kind"]; levels: RawLevel[] }>>();
  const add = (bank: number, off: number, kind: Region["kind"], level: RawLevel) => {
    let bankMap = byBank.get(bank);
    if (!bankMap) {
      bankMap = new Map();
      byBank.set(bank, bankMap);
    }
    const existing = bankMap.get(off);
    if (!existing) bankMap.set(off, { kind, levels: [level] });
    else if (existing.kind !== kind) badTable(`file offset $${off.toString(16)} is both ${existing.kind} and ${kind}`);
    else existing.levels.push(level);
  };
  for (const level of levels) {
    add(level.mapBank, level.blkOff, "blk", level);
    add(level.mapBank, level.mapOff, "map", level);
    add(level.colBank, level.colOff, "col", level);
  }

  const regions: Region[] = [];
  for (const [bank, bankMap] of byBank) {
    const offsets = [...bankMap.keys()].sort((a, b) => a - b);
    const bankEnd = INES_HEADER + (bank + 1) * PRG_SLOT;
    for (let i = 0; i < offsets.length; i++) {
      const off = offsets[i];
      const rec = bankMap.get(off)!;
      const next = i + 1 < offsets.length ? offsets[i + 1] : null;
      if (rec.kind === "map") {
        const width = rec.levels[0].width;
        const height = rec.levels[0].height;
        if (rec.levels.some((level) => level.width !== width || level.height !== height)) badTable(`shared map at $${off.toString(16)} has two sizes`);
        const size = 4 + width * height;
        if (next != null && off + size > next) badTable(`map at $${off.toString(16)} overlaps the next pack`);
        regions.push({ kind: "map", fileOff: off, size, width, height });
        continue;
      }
      const size = next != null ? next - off : rec.kind === "col"
        ? trailingColourSize(rom, off, bankEnd, rec.levels)
        : trailingBlockSize(rom, off, bankEnd);
      if (size <= 0) badTable(`empty ${rec.kind} at $${off.toString(16)}`);
      if (rec.kind === "blk" && size % 4 !== 0) badTable(`block pack at $${off.toString(16)} is ${size} bytes`);
      if (rec.kind === "col") {
        const stride = rec.levels[0].width / 2;
        if (rec.levels.some((level) => level.width !== rec.levels[0].width)) badTable(`colour pack at $${off.toString(16)} is shared by maps of different widths`);
        if (stride <= 0 || size % stride !== 0) badTable(`colour pack at $${off.toString(16)} does not match its map stride`);
      }
      regions.push({ kind: rec.kind, fileOff: off, size, width: rec.levels[0].width, height: rec.levels[0].height });
    }
  }
  return regions;
}

export function trailingColourSize(rom: Uint8Array, off: number, bankEnd: number, levels: RawLevel[]): number {
  const width = levels[0].width;
  const height = levels[0].height;
  if (levels.some((level) => level.width !== width || level.height !== height)) badTable(`colour pack at $${off.toString(16)} is shared by different maps`);
  const stride = width / 2;
  let size = attributeRows(height) * stride;
  if (size > bankEnd - off) badTable(`colour pack at $${off.toString(16)} does not fit in its bank`);
  while (size + stride <= bankEnd - off) {
    let solid = true;
    for (let i = 0; i < stride; i++) if (rom[off + size + i] !== 0xff) { solid = false; break; }
    if (solid) break;
    size += stride;
  }
  return size;
}

export function trailingBlockSize(rom: Uint8Array, off: number, bankEnd: number): number {
  let end = bankEnd;
  while (end > off && rom[end - 1] === 0xff) end--;
  return end - off - ((end - off) % 4);
}

export function attributeRows(height: number): number {
  let max = 0;
  for (let y = 0; y < height; y++) max = Math.max(max, (y + Math.floor(y / 15)) >> 1);
  return max + 1;
}

function badTable(message: string): never {
  throw new DescriptorError(message);
}
