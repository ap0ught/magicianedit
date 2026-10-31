/**
 * Magician level document.
 *
 * Pack file offsets come from the 16-byte descriptors in the opened cart
 * (bank byte + CPU pointer in the $A000 window). The journal 11 table is the
 * Beta 1 measurement of those same fields, not a second layout. Beta 1's
 * `ld10` file offset is used only when the body SHA1 matches.
 *
 * Title, password, and panel (`TIT.DAT` / `PW.DAT` / `PAN.DAT`) are not levels
 * and are never written back.
 */

import { levelName } from "./names.ts";
import {
  A000,
  BETA1_LD10,
  CHR_PAGE,
  DESCRIPTOR_BYTES,
  INES_HEADER,
  LEVEL_COUNT,
  PAL_BYTES,
  PAN_DAT_BYTES,
  PRG_BYTES,
  PRG_SLOT,
  PRG_SLOTS,
  PW_DAT_BYTES,
  TIT_DAT_BYTES,
  TOWN_SIGNATURE,
  chrPageOff,
  decodeMapByte,
  encodeMapByte,
  fixedWindowOff,
  inspectInes,
  rangesOverlap,
  type InesInfo,
} from "./format.ts";

class LoadError extends Error {
  code: "title" | "table" | "palette";

  constructor(code: "title" | "table" | "palette", message: string) {
    super(message);
    this.name = "LoadError";
    this.code = code;
  }
}

export interface MapPack {
  /** File offset of the 4-byte big-endian width/height header. */
  fileOff: number;
  width: number;
  height: number;
  /** Decoded metatile indices, row-major. Shared by every level that uses this map. */
  blocks: Uint8Array;
}

export interface BytePack {
  kind: "blk" | "col" | "pal" | "chr";
  fileOff: number;
  /** Mutable copy of the on-cart bytes. Shared when several levels use the same pack. */
  bytes: Uint8Array;
}

export interface MagicianLevel {
  index: number;
  name: string;
  descriptorOff: number;
  mapBank: number;
  colBank: number;
  chrBank: number;
  xorg: number;
  yorg: number;
  xlim: number;
  ylim: number;
  palIndex: number;
  map: MapPack;
  blk: BytePack;
  col: BytePack;
  chr: BytePack;
  pal: BytePack;
}

/** Packed nametable scenes. Present on Beta 1; the USA release has no `TIT.DAT`. */
export interface TitleScene {
  titOff: number;
  titLen: number;
  pwOff: number;
  pwLen: number;
  panOff: number;
  panLen: number;
}

export interface MagicianDoc {
  name: string;
  /** Cart bytes at open. Save copies this and overlays edited packs only. */
  original: Uint8Array;
  sha1: string;
  beta1: boolean;
  warning: string | null;
  ld10Off: number;
  scene: TitleScene | null;
  levels: MagicianLevel[];
  maps: MapPack[];
  packs: BytePack[];
}

export interface CellEdit {
  kind: "map" | "blk" | "col" | "pal" | "chr";
  fileOff: number;
  index: number;
  prev: number;
  next: number;
}

export interface LevelWindow {
  x: number;
  y: number;
  cols: number;
  rows: number;
}

interface RawLevel {
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

interface Built {
  levels: MagicianLevel[];
  maps: MapPack[];
  packs: BytePack[];
}

/** Level window inside the shared map. Clamped so a short synthetic map still draws. */
export function levelWindow(level: MagicianLevel): LevelWindow {
  const x = Math.min(Math.max(level.xorg, 0), level.map.width);
  const y = Math.min(Math.max(level.yorg, 0), level.map.height);
  return {
    x,
    y,
    cols: Math.max(0, Math.min(level.xlim, level.map.width - x)),
    rows: Math.max(0, Math.min(level.ylim, level.map.height - y)),
  };
}

/** Parse a Magician MMC3 image into an editable document. */
export function loadMagician(bytes: Uint8Array, name: string): MagicianDoc {
  const info: InesInfo = inspectInes(bytes);
  const rom = new Uint8Array(bytes);
  const scene = findScene(rom);
  const chrpals = findChrpals(rom);
  const located = locateLevels(rom, info.beta1, scene, chrpals);
  return {
    name,
    original: rom,
    sha1: info.sha1,
    beta1: info.beta1,
    warning: info.warning,
    ld10Off: located.ld,
    scene,
    levels: located.built.levels,
    maps: located.built.maps,
    packs: located.built.packs,
  };
}

/**
 * Copy the opened cart and write MAP/BLK/COL/PAL/CHR buffers back.
 * Unedited buffers encode to the original bytes, so a clean save matches the file.
 */
export function saveMagician(doc: MagicianDoc): Uint8Array {
  const out = new Uint8Array(doc.original);
  for (const map of doc.maps) {
    const off = map.fileOff + 4;
    guardScene(doc, off, map.blocks.length);
    for (let i = 0; i < map.blocks.length; i++) out[off + i] = encodeMapByte(map.blocks[i]);
  }
  for (const pack of doc.packs) {
    guardScene(doc, pack.fileOff, pack.bytes.length);
    out.set(pack.bytes, pack.fileOff);
  }
  return out;
}

/** Metatiles in this level's block pack. The game reads each one at `index * 4`. */
export function metatileCount(level: MagicianLevel): number {
  return Math.floor(level.blk.bytes.length / 4);
}

/**
 * Brush index that still addresses this level's block pack.
 * A value past the pack clamps to the last metatile; an empty pack clears to 0.
 */
export function clampBrush(index: number, level: MagicianLevel): number {
  const count = metatileCount(level);
  if (count <= 0) return 0;
  const max = count - 1;
  if (!Number.isInteger(index) || index < 0) return 0;
  if (index > max) return max;
  return index;
}

/**
 * Paint one cell in the level window. `x`/`y` are window coordinates, not map origin.
 * `index` has to be a metatile in this level's block pack. A value that fits in the
 * map byte can still read past the pack, and that paint is refused.
 */
export function paintMapCell(level: MagicianLevel, x: number, y: number, index: number): CellEdit | null {
  const view = levelWindow(level);
  if (x < 0 || y < 0 || x >= view.cols || y >= view.rows) return null;
  const tiles = metatileCount(level);
  if (!Number.isInteger(index) || index < 0 || index >= tiles) return null;
  const cell = (view.y + y) * level.map.width + (view.x + x);
  return writeBuffer(level.map.blocks, "map", level.map.fileOff, cell, index);
}

/** Change one byte of a BLK, COL, PAL, or CHR pack. */
export function editPackByte(pack: BytePack, index: number, value: number): CellEdit | null {
  return writeBuffer(pack.bytes, pack.kind, pack.fileOff, index, value);
}

/** Apply or reverse a cell edit. Map edits store the decoded index, not the swizzled byte. */
export function applyEdit(doc: MagicianDoc, edit: CellEdit, reverse = false): void {
  const buf = bufferFor(doc, edit);
  if (edit.index < 0 || edit.index >= buf.length) {
    throw new Error(`Edit index ${edit.index} is outside ${edit.kind} at ${edit.fileOff}`);
  }
  buf[edit.index] = reverse ? edit.prev : edit.next;
}

function writeBuffer(
  buf: Uint8Array,
  kind: CellEdit["kind"],
  fileOff: number,
  index: number,
  value: number,
): CellEdit | null {
  if (index < 0 || index >= buf.length) return null;
  const next = value & 0xff;
  const prev = buf[index];
  if (prev === next) return null;
  buf[index] = next;
  return { kind, fileOff, index, prev, next };
}

function bufferFor(doc: MagicianDoc, edit: CellEdit): Uint8Array {
  if (edit.kind === "map") {
    const map = doc.maps.find((item) => item.fileOff === edit.fileOff);
    if (!map) throw new Error(`No map at file offset ${edit.fileOff}`);
    return map.blocks;
  }
  const pack = doc.packs.find((item) => item.kind === edit.kind && item.fileOff === edit.fileOff);
  if (!pack) throw new Error(`No ${edit.kind} pack at file offset ${edit.fileOff}`);
  return pack.bytes;
}

function guardScene(doc: MagicianDoc, off: number, length: number): void {
  if (!doc.scene) return;
  const span = TIT_DAT_BYTES + PW_DAT_BYTES + PAN_DAT_BYTES;
  if (rangesOverlap(off, length, doc.scene.titOff, span)) {
    throw new Error("MagicianEdit refused to write the title, password, or panel scene.");
  }
}

/**
 * `TIT.DAT` / `PW.DAT` / `PAN.DAT` sit end to end. The three headers are enough
 * to find that span without treating the bytes as a map.
 */
function findScene(rom: Uint8Array): TitleScene | null {
  const end = INES_HEADER + PRG_BYTES - (TIT_DAT_BYTES + PW_DAT_BYTES + PAN_DAT_BYTES);
  for (let off = INES_HEADER; off <= end; off++) {
    if (rom[off] !== 0x00 || rom[off + 1] !== 0xfc || rom[off + 2] !== 0xe0) continue;
    const pw = off + TIT_DAT_BYTES;
    if (rom[pw] !== 0x00 || rom[pw + 1] !== 0xfc || rom[pw + 2] !== 0x01) continue;
    const pan = pw + PW_DAT_BYTES;
    if (rom[pan] !== 0x00 || rom[pan + 1] !== 0xff || rom[pan + 2] !== 0x00) continue;
    return {
      titOff: off,
      titLen: TIT_DAT_BYTES,
      pwOff: pw,
      pwLen: PW_DAT_BYTES,
      panOff: pan,
      panLen: PAN_DAT_BYTES,
    };
  }
  return null;
}

/**
 * `initlev` does `index * 12` then `ADC #<chrpals` / `ADC #>chrpals` before `LDX #$0F`.
 * The immediates are the palette table's CPU address in the fixed bank.
 */
function findChrpals(rom: Uint8Array): number {
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
    const cpu = rom[s + 11] | (rom[s + 17] << 8);
    const file = fixedWindowOff(cpu);
    if (file == null) continue;
    return file;
  }
  throw new LoadError(
    "palette",
    "MagicianEdit could not find the Magician background palette table in this cart.",
  );
}

function locateLevels(
  rom: Uint8Array,
  beta1: boolean,
  scene: TitleScene | null,
  chrpals: number,
): { ld: number; built: Built } {
  const candidates: number[] = [];
  if (beta1 && matchesAt(rom, BETA1_LD10, TOWN_SIGNATURE)) candidates.push(BETA1_LD10);
  const prgEnd = INES_HEADER + PRG_BYTES;
  const tableBytes = LEVEL_COUNT * DESCRIPTOR_BYTES;
  for (let off = INES_HEADER; off + tableBytes <= prgEnd; off++) {
    if (!matchesAt(rom, off, TOWN_SIGNATURE)) continue;
    if (!candidates.includes(off)) candidates.push(off);
  }
  let titleError: LoadError | null = null;
  for (const off of candidates) {
    try {
      return { ld: off, built: buildAt(rom, off, scene, chrpals) };
    } catch (err) {
      if (err instanceof LoadError && err.code === "title") titleError = err;
      else if (err instanceof LoadError && err.code === "table") continue;
      else throw err;
    }
  }
  if (titleError) throw titleError;
  if (candidates.length) {
    throw new LoadError(
      "table",
      `MagicianEdit found a town descriptor but the following records are not ${LEVEL_COUNT} Magician levels.`,
    );
  }
  throw new LoadError(
    "table",
    "MagicianEdit did not find a Magician level table. The town descriptor is not in this cart.",
  );
}

function buildAt(rom: Uint8Array, ld: number, scene: TitleScene | null, chrpals: number): Built {
  const raw = readDescriptors(rom, ld);
  const regions = sizeRegions(rom, raw);
  const maps = new Map<number, MapPack>();
  const bytePacks = new Map<string, BytePack>();

  const takeBytes = (kind: BytePack["kind"], off: number, size: number): BytePack => {
    const key = `${kind}:${off}`;
    const found = bytePacks.get(key);
    if (found) return found;
    refuseScene(scene, off, size);
    const pack: BytePack = { kind, fileOff: off, bytes: rom.slice(off, off + size) };
    bytePacks.set(key, pack);
    return pack;
  };

  for (const region of regions) {
    if (region.kind === "map") {
      refuseScene(scene, region.fileOff, region.size);
      if (!maps.has(region.fileOff)) {
        const blocks = new Uint8Array(region.width * region.height);
        for (let i = 0; i < blocks.length; i++) blocks[i] = decodeMapByte(rom[region.fileOff + 4 + i]);
        maps.set(region.fileOff, {
          fileOff: region.fileOff,
          width: region.width,
          height: region.height,
          blocks,
        });
      }
    } else {
      takeBytes(region.kind, region.fileOff, region.size);
    }
  }

  const levels: MagicianLevel[] = raw.map((level) => {
    const map = maps.get(level.mapOff);
    const blk = bytePacks.get(`blk:${level.blkOff}`);
    const col = bytePacks.get(`col:${level.colOff}`);
    if (!map || !blk || !col) badTable("level pack was not sized");
    const chrOff = chrPageOff(level.chrBank);
    if (chrOff + CHR_PAGE > rom.length) badTable(`CHR bank ${level.chrBank} does not fit in CHR ROM`);
    const palOff = chrpals + level.palIndex * PAL_BYTES;
    if (palOff < INES_HEADER || palOff + PAL_BYTES > INES_HEADER + PRG_BYTES) {
      badTable(`palette index ${level.palIndex} is outside PRG`);
    }
    return {
      index: level.index,
      name: levelName(level.index),
      descriptorOff: ld + level.index * DESCRIPTOR_BYTES,
      mapBank: level.mapBank,
      colBank: level.colBank,
      chrBank: level.chrBank,
      xorg: level.xorg,
      yorg: level.yorg,
      xlim: level.xlim,
      ylim: level.ylim,
      palIndex: level.palIndex,
      map,
      blk,
      col,
      chr: takeBytes("chr", chrOff, CHR_PAGE),
      pal: takeBytes("pal", palOff, PAL_BYTES),
    };
  });

  return {
    levels,
    maps: [...maps.values()],
    packs: [...bytePacks.values()],
  };
}

function readDescriptors(rom: Uint8Array, ld: number): RawLevel[] {
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
    levels.push({
      index,
      mapBank,
      colBank,
      chrBank,
      xorg,
      yorg,
      xlim,
      ylim,
      palIndex,
      blkOff,
      mapOff,
      colOff,
      width,
      height,
    });
  }
  return levels;
}

interface Region {
  kind: "blk" | "map" | "col";
  fileOff: number;
  size: number;
  width: number;
  height: number;
}

function sizeRegions(rom: Uint8Array, levels: RawLevel[]): Region[] {
  const byBank = new Map<number, Map<number, { kind: "blk" | "map" | "col"; levels: RawLevel[] }>>();
  const add = (bank: number, off: number, kind: "blk" | "map" | "col", level: RawLevel) => {
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
        if (rec.levels.some((level) => level.width !== width || level.height !== height)) {
          badTable(`shared map at $${off.toString(16)} has two sizes`);
        }
        const size = 4 + width * height;
        if (next != null && off + size > next) badTable(`map at $${off.toString(16)} overlaps the next pack`);
        regions.push({ kind: "map", fileOff: off, size, width, height });
        continue;
      }
      let size: number;
      if (next != null) {
        size = next - off;
      } else if (rec.kind === "col") {
        size = trailingColourSize(rom, off, bankEnd, rec.levels);
      } else {
        size = trailingBlockSize(rom, off, bankEnd);
      }
      if (size <= 0) badTable(`empty ${rec.kind} at $${off.toString(16)}`);
      if (rec.kind === "blk" && size % 4 !== 0) badTable(`block pack at $${off.toString(16)} is ${size} bytes`);
      if (rec.kind === "col") {
        const stride = rec.levels[0].width / 2;
        if (rec.levels.some((level) => level.width !== rec.levels[0].width)) {
          badTable(`colour pack at $${off.toString(16)} is shared by maps of different widths`);
        }
        if (stride <= 0 || size % stride !== 0) badTable(`colour pack at $${off.toString(16)} does not match its map stride`);
      }
      regions.push({
        kind: rec.kind,
        fileOff: off,
        size,
        width: rec.levels[0].width,
        height: rec.levels[0].height,
      });
    }
  }
  return regions;
}

/**
 * Rows `setad` can touch: `(landy + landy/15) >> 1`.
 * A last-in-bank colour pack may keep one extra row (journal 12). Padding after
 * that row is `$FF` on the carts measured for this loader, so further rows are
 * taken only while they are not a solid `$FF` fill.
 */
function trailingColourSize(rom: Uint8Array, off: number, bankEnd: number, levels: RawLevel[]): number {
  const width = levels[0].width;
  const height = levels[0].height;
  if (levels.some((level) => level.width !== width || level.height !== height)) {
    badTable(`colour pack at $${off.toString(16)} is shared by different maps`);
  }
  const stride = width / 2;
  let rows = attributeRows(height);
  let size = rows * stride;
  if (size > bankEnd - off) badTable(`colour pack at $${off.toString(16)} does not fit in its bank`);
  while (size + stride <= bankEnd - off) {
    let solid = true;
    for (let i = 0; i < stride; i++) {
      if (rom[off + size + i] !== 0xff) {
        solid = false;
        break;
      }
    }
    if (solid) break;
    size += stride;
  }
  return size;
}

function trailingBlockSize(rom: Uint8Array, off: number, bankEnd: number): number {
  let end = bankEnd;
  while (end > off && rom[end - 1] === 0xff) end--;
  return end - off - ((end - off) % 4);
}

function attributeRows(height: number): number {
  let max = 0;
  for (let y = 0; y < height; y++) {
    const row = (y + Math.floor(y / 15)) >> 1;
    if (row > max) max = row;
  }
  return max + 1;
}

function windowOff(bank: number, cpu: number): number {
  if (bank < 0 || bank >= PRG_SLOTS || cpu < A000 || cpu > 0xbfff) {
    badTable(`descriptor pointer bank $${bank.toString(16)} cpu $${cpu.toString(16)} is not an $A000 pack`);
  }
  return INES_HEADER + bank * PRG_SLOT + (cpu - A000);
}

function refuseScene(scene: TitleScene | null, off: number, length: number): void {
  if (!scene) return;
  const span = TIT_DAT_BYTES + PW_DAT_BYTES + PAN_DAT_BYTES;
  if (rangesOverlap(off, length, scene.titOff, span)) {
    throw new LoadError(
      "title",
      "MagicianEdit will not load the title, password, or panel scene as a level pack.",
    );
  }
}

function matchesAt(rom: Uint8Array, off: number, sig: Uint8Array): boolean {
  if (off < 0 || off + sig.length > rom.length) return false;
  for (let i = 0; i < sig.length; i++) if (rom[off + i] !== sig[i]) return false;
  return true;
}

function badTable(message: string): never {
  throw new LoadError("table", `MagicianEdit could not read the level table: ${message}.`);
}
