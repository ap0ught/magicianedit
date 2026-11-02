/**
 * Magician level document.
 *
 * Pack file offsets come from the 16-byte descriptors in the opened cart
 * (bank byte + CPU pointer in the $A000 window). The journal 11 table is the
 * Beta 1 measurement of those same fields, not a second layout. Beta 1's
 * `ld10` file offset is a candidate only when the body SHA1 matches. Every
 * other body uses the table `initlev` names, and those descriptor bytes are
 * the banks and pointers. A Beta 1-shaped copy does not replace them.
 *
 * Title, password, and panel (`TIT.DAT` / `PW.DAT` / `PAN.DAT`) are not levels
 * and are never written back.
 */

import { findScene, guardScene } from "./scene.ts";
import { findChrpals } from "./descriptors.ts";
import { loadLevels } from "./loader.ts";
import { bufferFor, writeBuffer } from "./edits.ts";
import { encodeMapByte, inspectInes, type InesInfo } from "./format.ts";

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
  const located = loadLevels(rom, info.beta1, scene, chrpals);
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
