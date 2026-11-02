/** Level descriptor and initlev table discovery. */

import {
  A000,
  DESCRIPTOR_BYTES,
  INES_HEADER,
  LEVEL_COUNT,
  PRG_BYTES,
  PRG_SLOTS,
  PRG_SLOT,
  TOWN_SIGNATURE,
  fixedWindowOff,
} from "./format.ts";

export interface RawLevel {
  index: number;
  mapBank: number;
  colBank: number;
  chrBank: number;
  xorg: number;
  yorg: number;
  xlim: number;
  ylim: number;
  palIndex: number;
  blkOff: number;
  mapOff: number;
  colOff: number;
  width: number;
  height: number;
}

export class DescriptorError extends Error {
  constructor(message: string) {
    super(`MagicianEdit could not read the level table: ${message}.`);
    this.name = "DescriptorError";
  }
}

/** Locate the palette table named by the initlev immediates. */
export function findChrpals(rom: Uint8Array): number {
  const prgEnd = INES_HEADER + PRG_BYTES;
  for (let s = INES_HEADER; s + 22 < prgEnd; s++) {
    if (rom[s] !== 0xa5) continue;
    const high = rom[s + 1];
    if (rom[s + 2] !== 0x29 || rom[s + 3] !== 0x01 || rom[s + 4] !== 0x69 || rom[s + 5] !== 0x00) continue;
    if (rom[s + 6] !== 0x85 || rom[s + 7] !== high || rom[s + 8] !== 0xa5) continue;
    const low = rom[s + 9];
    if (rom[s + 10] !== 0x69 || rom[s + 12] !== 0x85 || rom[s + 13] !== low) continue;
    if (rom[s + 14] !== 0xa5 || rom[s + 15] !== high || rom[s + 16] !== 0x69) continue;
    if (rom[s + 18] !== 0x85 || rom[s + 19] !== high || rom[s + 20] !== 0xa2 || rom[s + 21] !== 0x0f) continue;
    const file = fixedWindowOff(rom[s + 11] | (rom[s + 17] << 8));
    if (file != null) return file;
  }
  throw new DescriptorError("MagicianEdit could not find the Magician background palette table in this cart");
}

/** Find candidate ld10 file offsets from the initlev code and town signature. */
export function findLd10(rom: Uint8Array): number[] {
  const found: number[] = [];
  const prgEnd = INES_HEADER + PRG_BYTES;
  for (let s = INES_HEADER; s + 26 <= prgEnd; s++) {
    if (rom[s] !== 0x0a || rom[s + 1] !== 0x26) continue;
    const t1 = rom[s + 2];
    if (rom[s + 3] !== 0x0a || rom[s + 4] !== 0x26 || rom[s + 5] !== t1) continue;
    if (rom[s + 6] !== 0x0a || rom[s + 7] !== 0x26 || rom[s + 8] !== t1) continue;
    if (rom[s + 9] !== 0x0a || rom[s + 10] !== 0x26 || rom[s + 11] !== t1) continue;
    if (rom[s + 12] !== 0x18 || rom[s + 13] !== 0x69 || rom[s + 15] !== 0x85) continue;
    if (rom[s + 17] !== 0xa9 || rom[s + 18] !== 0x0f || rom[s + 19] !== 0xa8) continue;
    if (rom[s + 20] !== 0x25 || rom[s + 21] !== t1 || rom[s + 22] !== 0x69) continue;
    if (rom[s + 24] !== 0x85 || rom[s + 25] !== t1) continue;
    const file = fixedWindowOff(rom[s + 14] | (rom[s + 23] << 8));
    if (file != null && !found.includes(file)) found.push(file);
  }
  return found;
}

/** Parse all 66 descriptor records and validate their map headers. */
export function readDescriptors(rom: Uint8Array, ld: number): RawLevel[] {
  const levels: RawLevel[] = [];
  for (let index = 0; index < LEVEL_COUNT; index++) {
    const off = ld + index * DESCRIPTOR_BYTES;
    if (off + DESCRIPTOR_BYTES > rom.length) badTable("level table runs past the end of the cart");
    const mapBank = rom[off];
    const colBank = rom[off + 1];
    const chrBank = rom[off + 2];
    const xorg = rom[off + 3] | (rom[off + 4] << 8);
    const yorg = rom[off + 5];
    const xlim = rom[off + 6] | (rom[off + 7] << 8);
    const ylim = rom[off + 8];
    const blCpu = rom[off + 9] | (rom[off + 10] << 8);
    const bmCpu = rom[off + 11] | (rom[off + 12] << 8);
    const cmCpu = rom[off + 13] | (rom[off + 14] << 8);
    const palIndex = rom[off + 15];
    const blkOff = windowOff(mapBank, blCpu);
    const mapOff = windowOff(mapBank, bmCpu);
    const colOff = windowOff(colBank, cmCpu);
    const width = (rom[mapOff] << 8) | rom[mapOff + 1];
    const height = (rom[mapOff + 2] << 8) | rom[mapOff + 3];
    if (width === 0 || height === 0 || width % 2 !== 0 || width > 1024 || height > 512) {
      badTable(`level ${index} map at $${mapOff.toString(16)} is ${width}×${height}`);
    }
    const mapBytes = 4 + width * height;
    const bankEnd = INES_HEADER + (mapBank + 1) * PRG_SLOT;
    if (mapOff + mapBytes > bankEnd) badTable(`level ${index} map runs past its PRG bank`);
    levels.push({ index, mapBank, colBank, chrBank, xorg, yorg, xlim, ylim, palIndex, blkOff, mapOff, colOff, width, height });
  }
  return levels;
}

function windowOff(bank: number, cpu: number): number {
  if (bank < 0 || bank >= PRG_SLOTS || cpu < A000 || cpu > 0xbfff) {
    badTable(`descriptor pointer bank $${bank.toString(16)} cpu $${cpu.toString(16)} is not an $A000 pack`);
  }
  return INES_HEADER + bank * PRG_SLOT + (cpu - A000);
}

function badTable(message: string): never {
  throw new DescriptorError(message);
}

export { TOWN_SIGNATURE };
