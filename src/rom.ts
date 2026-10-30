import { unpackTiles } from "./pp1.ts";

export const MAP_HEIGHT = 14;

/** Map strips in mapinfo order. Names follow the original editor's map numbering. */
export const LEVELS: { name: string; area: string }[] = [
  { name: "Map 1", area: "Lava cavern" },
  { name: "Map 2", area: "Water caves" },
  { name: "Map 3", area: "Water caves" },
  { name: "Map 4", area: "Water caves" },
  { name: "Map 5", area: "Dungeon" },
  { name: "Map 6", area: "Kitchen / halls" },
  { name: "Map 7", area: "Halls" },
  { name: "Map 8", area: "Church" },
  { name: "Map 9", area: "Bedrooms" },
  { name: "Map 10", area: "Sky battlements" },
  { name: "Map 11", area: "Sky towers" },
  { name: "Map 12", area: "Church loft" },
  { name: "Map 13", area: "Sky walk" },
];

const WIDTHS = [72, 32, 16, 64, 208, 176, 176, 160, 40, 32, 24, 32, 16];

const BLOCK_SIG = [
  0x00, 0x01, 0x03, 0x05, 0x07, 0x08, 0x0b, 0x08, 0x07, 0x0d, 0x08, 0x11, 0x13,
  0x17, 0x1b, 0x1f,
];

export interface MapInfo {
  /** CPU pointer, which addresses the column before the first one. */
  pointer: number;
  /** File offset of this level's 6-byte mapinfo record. */
  infoFileOff: number;
  /** File offset of column 0, row 0. Columns are 14 bytes, top to bottom. */
  dataFileOff: number;
  worldX: number;
  width: number;
  /** Vertical strip index from mapheights (0 = bottom of the castle). */
  height: number;
  palIndex: number;
  chrIndex: number;
  palette: Uint8Array;
  chrList: number[];
}

export interface ObjRec {
  fileOff: number;
  type: number;
  length: number;
}

export interface BlockGfx {
  tl: Uint8Array;
  tr: Uint8Array;
  bl: Uint8Array;
  br: Uint8Array;
  attr: Uint8Array;
  solid: Uint8Array;
}

export class RomDoc {
  readonly bytes: Uint8Array;
  readonly name: string;
  readonly blkstl: number;
  readonly prgStart: number;
  readonly banks: number;
  readonly chrTable: number;
  readonly fixedFile: number;
  readonly objectTable: number;
  /** Inclusive start / exclusive end of the contiguous object lists in the file. */
  readonly objectRegionStart: number;
  objectRegionEnd: number;
  /** 256-byte ONSCREEN.ROU blockrous table, or null. */
  readonly blockrous: Uint8Array | null;
  readonly maps: MapInfo[];
  objects: ObjRec[][];
  readonly blocks: BlockGfx;
  readonly mapBytes: number;
  readonly mapFree: number;
  private patterns = new Map<number, Uint8Array>();

  constructor(
    bytes: Uint8Array,
    name: string,
    blkstl: number,
    prgStart: number,
    banks: number,
    chrTable: number,
    fixedFile: number,
    objectTable: number,
    maps: MapInfo[],
    objects: ObjRec[][],
    blockrous: Uint8Array | null,
  ) {
    this.bytes = bytes;
    this.name = name;
    this.blkstl = blkstl;
    this.prgStart = prgStart;
    this.banks = banks;
    this.chrTable = chrTable;
    this.fixedFile = fixedFile;
    this.objectTable = objectTable;
    this.maps = maps;
    this.objects = objects;
    this.blockrous = blockrous;
    this.blocks = {
      tl: bytes.subarray(blkstl, blkstl + 256),
      tr: bytes.subarray(blkstl + 256, blkstl + 512),
      bl: bytes.subarray(blkstl + 512, blkstl + 768),
      br: bytes.subarray(blkstl + 768, blkstl + 1024),
      attr: bytes.subarray(blkstl + 1024, blkstl + 1280),
      solid: bytes.subarray(blkstl + 0x500, blkstl + 0x600),
    };
    const last = maps[maps.length - 1];
    const end = last.dataFileOff + last.width * MAP_HEIGHT;
    this.mapBytes = maps.reduce((n, m) => n + m.width * MAP_HEIGHT, 0);
    this.mapFree = blkstl + 0x4000 - end;
    const firstPtr = bytes[objectTable] | (bytes[objectTable + 1] << 8);
    this.objectRegionStart = fixedFile + (firstPtr - 0xc000);
    let regionEnd = this.objectRegionStart;
    for (const list of objects) {
      for (const r of list) regionEnd = Math.max(regionEnd, r.fileOff + r.length);
      // terminator byte after last record (or alone if empty)
    }
    // include final level's 0 terminator
    const lastPtr = bytes[objectTable + (LEVELS.length - 1) * 2] | (bytes[objectTable + (LEVELS.length - 1) * 2 + 1] << 8);
    let scan = fixedFile + (lastPtr - 0xc000);
    while (scan < fixedFile + 0x4000 && bytes[scan] !== 0) {
      const len = bytes[scan + 1];
      if (len < 2 || len > 32) break;
      scan += len;
    }
    regionEnd = Math.max(regionEnd, scan + 1);
    this.objectRegionEnd = regionEnd;
  }

  /** Unpack (and cache) the 256-tile CHR pattern for a level's chrIndex. */
  patternFor(level: number): Uint8Array {
    const map = this.maps[level];
    const cached = this.patterns.get(map.chrIndex);
    if (cached) return cached;
    const pattern = new Uint8Array(256 * 16);
    for (const index of map.chrList) {
      const entry = this.chrTable + index * 4;
      const ptr = this.bytes[entry] | (this.bytes[entry + 1] << 8);
      const startTile = this.bytes[entry + 2];
      const bank = this.bytes[entry + 3] & 15;
      const off = this.banked(ptr, bank);
      const tiles = unpackTiles(this.bytes, off);
      for (let i = 0; i < tiles.length && startTile + i < 256; i++) {
        pattern.set(tiles[i], (startTile + i) * 16);
      }
    }
    this.patterns.set(map.chrIndex, pattern);
    return pattern;
  }

  /** CPU address in the switched $8000 window, for a logical bank number. */
  banked(ptr: number, bank: number): number {
    const slot = bank & (this.banks - 1);
    return this.prgStart + slot * 0x4000 + (ptr - 0x8000);
  }

  /** Metatile id at map column x, row y. */
  blockAt(level: number, x: number, y: number): number {
    const map = this.maps[level];
    return this.bytes[map.dataFileOff + x * MAP_HEIGHT + y];
  }

  /** Drop cached CHR patterns after a chr-set / pack change. */
  invalidatePatterns(): void {
    this.patterns.clear();
  }
}

/** Little-endian u16 at a file offset. */
function u16(file: Uint8Array, off: number): number {
  return file[off] | (file[off + 1] << 8);
}

/** First offset of an exact byte signature, or -1. */
function findBytes(file: Uint8Array, sig: number[]): number {
  outer: for (let i = 0; i <= file.length - sig.length; i++) {
    for (let j = 0; j < sig.length; j++) if (file[i + j] !== sig[j]) continue outer;
    return i;
  }
  return -1;
}

/** Locate MAPDATA.DAT `blkstl` (block graphics + map tables). */
function findBlkstl(file: Uint8Array): number {
  let from = 0;
  while (from < file.length) {
    const slice = file.subarray(from);
    const rel = findBytes(slice, BLOCK_SIG);
    if (rel < 0) break;
    const at = from + rel;
    if (
      file[at + 0x500] === 0x00 &&
      file[at + 0x501] === 0xf0 &&
      file[at + 0x502] === 0xff &&
      file[at + 0x60e] === 0x05 &&
      file[at + 0x60f] === 0x09 &&
      file[at + 0x610] === 0xff
    ) {
      return at;
    }
    from = at + 1;
  }
  throw new Error("This ROM does not contain Super Robin Hood block graphics.");
}

/** Locate the 13×6-byte mapinfo directory by width pattern. */
function findMapInfo(file: Uint8Array): number {
  for (let i = 0; i <= file.length - WIDTHS.length * 6; i++) {
    let ok = true;
    for (let m = 0; m < WIDTHS.length; m++) {
      if (file[i + m * 6 + 3] !== WIDTHS[m]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const p0 = u16(file, i);
    const p1 = u16(file, i + 6);
    if (p0 < 0x8000 || p0 >= 0xc000) continue;
    if (p1 - p0 !== WIDTHS[0] * MAP_HEIGHT) continue;
    return i;
  }
  throw new Error("Could not find the level directory in this ROM.");
}

/** Locate the packed CHR table used by mapchrsdefs. */
function findChrTable(file: Uint8Array, docBanks: { prgStart: number; banks: number }): number {
  for (let i = 0; i < file.length - 26; i++) {
    if (
      file[i] !== 0x9d ||
      file[i + 4] !== 0xf7 ||
      file[i + 8] !== 0x9d ||
      file[i + 12] !== 0x9d ||
      file[i + 16] !== 0xb4 ||
      file[i + 20] !== 0xb4
    ) {
      continue;
    }
    const table = i - 26;
    const ptr = u16(file, table + 5 * 4);
    const bank = file[table + 5 * 4 + 3] & 15;
    if (ptr < 0x8000 || ptr >= 0xc000) continue;
    const off =
      docBanks.prgStart + (bank & (docBanks.banks - 1)) * 0x4000 + (ptr - 0x8000);
    if (file[off] === 157) return table;
  }
  throw new Error("Could not find the compressed character sets in this ROM.");
}

/** Walk maprouspointer lists into per-level object records. */
function parseObjects(
  file: Uint8Array,
  fixedFile: number,
  table: number,
): ObjRec[][] {
  const ptrs: number[] = [];
  for (let m = 0; m < LEVELS.length; m++) ptrs.push(u16(file, table + m * 2));
  const out: ObjRec[][] = [];
  let cpu = ptrs[0];
  for (let m = 0; m < LEVELS.length; m++) {
    if (cpu !== ptrs[m]) throw new Error("object pointer chain broke");
    const recs: ObjRec[] = [];
    for (let guard = 0; guard < 500; guard++) {
      const off = fixedFile + (cpu - 0xc000);
      const type = file[off];
      if (type === 0) {
        cpu += 1;
        break;
      }
      if (type > 9) throw new Error("bad object type");
      const length = file[off + 1];
      if (length < 2 || length > 32) throw new Error("bad object length");
      recs.push({ fileOff: off, type, length });
      cpu += length;
    }
    out.push(recs);
  }
  return out;
}

/** Find maprouspointer by validating increasing CPU pointers + first KEY. */
function findObjectTable(file: Uint8Array, fixedFile: number): { table: number; objects: ObjRec[][] } {
  const end = fixedFile + 0x4000 - LEVELS.length * 2;
  for (let i = fixedFile; i < end; i++) {
    let prev = 0xbfff;
    let ok = true;
    for (let m = 0; m < LEVELS.length; m++) {
      const p = u16(file, i + m * 2);
      if (p <= prev || p >= 0x10000) {
        ok = false;
        break;
      }
      prev = p;
    }
    if (!ok) continue;
    try {
      const objects = parseObjects(file, fixedFile, i);
      if (objects[0].length > 0 && objects[0][0].type === 5) return { table: i, objects };
    } catch {
      continue;
    }
  }
  throw new Error("Could not find the object lists in this ROM.");
}

/** Locate ONSCREEN.ROU `blockrous` via the spit/flame mid-table pattern. */
function findBlockrous(file: Uint8Array): Uint8Array | null {
  // At $30: four zeros, spit, spit, two zeros; then at $38 four zeros + flam.
  const mid = [
    0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0,
  ];
  const at = findBytes(file, mid);
  if (at < 0) return null;
  const start = at - 0x30;
  if (start < 0 || start + 256 > file.length) return null;
  if (file[start + 0x0a] !== 2) return null;
  if (file[start + 0xf3] !== 0x9c && file[start + 0xf3] !== (0x1c + 128)) return null;
  return file.subarray(start, start + 256);
}

/** Re-parse object lists and refresh the packed-region end marker. */
export function reloadObjects(doc: RomDoc): void {
  doc.objects = parseObjects(doc.bytes, doc.fixedFile, doc.objectTable);
  let scan = doc.objectRegionStart;
  const lastPtr = u16(doc.bytes, doc.objectTable + (LEVELS.length - 1) * 2);
  scan = doc.fixedFile + (lastPtr - 0xc000);
  while (scan < doc.fixedFile + 0x4000 && doc.bytes[scan] !== 0) {
    const len = doc.bytes[scan + 1];
    if (len < 2 || len > 32) break;
    scan += len;
  }
  doc.objectRegionEnd = scan + 1;
}

/** Free bytes after the packed object lists (before the next non-zero payload). */
export function objectFreeBytes(doc: RomDoc): number {
  let end = doc.objectRegionEnd;
  while (end < doc.fixedFile + 0x4000 && doc.bytes[end] === 0) end++;
  // Cap: do not eat into code — leave at least the zeros that already exist,
  // plus any trailing zeros we can reclaim after deletes.
  return Math.max(0, end - doc.objectRegionEnd);
}

/** Write one maprouspointer entry (CPU address in the $C000 window). */
function setObjPtr(doc: RomDoc, level: number, cpu: number): void {
  const off = doc.objectTable + level * 2;
  doc.bytes[off] = cpu & 255;
  doc.bytes[off + 1] = (cpu >> 8) & 255;
}

/**
 * Delete one object record. Later lists shift left; maprouspointer entries after
 * the hole are decreased. Freed bytes are zeroed at the end of the object region.
 */
export function deleteObject(doc: RomDoc, level: number, index: number): void {
  const rec = doc.objects[level][index];
  if (!rec) throw new Error("No such object");
  const len = rec.length;
  const from = rec.fileOff;
  const regionEnd = doc.objectRegionEnd;
  for (let i = from; i + len < regionEnd; i++) doc.bytes[i] = doc.bytes[i + len];
  for (let i = regionEnd - len; i < regionEnd; i++) doc.bytes[i] = 0;
  for (let m = 0; m < LEVELS.length; m++) {
    const ptr = u16(doc.bytes, doc.objectTable + m * 2);
    const file = doc.fixedFile + (ptr - 0xc000);
    if (file > from) setObjPtr(doc, m, ptr - len);
  }
  reloadObjects(doc);
}

/** Default parameter bytes (after type+length) for a new object. */
export function defaultObjectPayload(type: number, column: number, width: number): number[] {
  const col = Math.max(0, Math.min(width - 1, column)) & 255;
  const yMid = 8 * 16;
  switch (type) {
    case 1: // flash: col, row, tile, on, off
      return [col, 6, 0x1b, 10, 10];
    case 2: // archer: id, col, y, speed, flags, delay
      return [0x80, col, yMid, 2, 3, 10];
    case 3: {
      // platform h: id, minLE, maxLE, y
      const min = col * 16;
      const max = Math.min(width * 16 - 1, min + 64);
      return [0x20, min & 255, min >> 8, max & 255, max >> 8, yMid];
    }
    case 4: {
      const x = col * 16;
      return [0x30, x & 255, x >> 8, 0, 192, 64];
    }
    case 5: // key: id, col, y, link
      return [0x10, col, yMid - 8, 0];
    case 6: // cannon: col, y, speed, delay
      return [col, yMid, 3, 10];
    case 7: // secret: id, col, y, secret#
      return [0x40, col, yMid - 8, 0];
    case 8: // marion: id, col, y
      return [0, col, yMid];
    case 9: // water: no params (length 2)
      return [];
    default:
      throw new Error(`Unsupported object type ${type}`);
  }
}

/**
 * Insert a new object at the end of a level's list. Requires free zeroed bytes
 * after the object region at least as large as the new record.
 */
export function insertObject(doc: RomDoc, level: number, type: number, column: number): number {
  const payload = defaultObjectPayload(type, column, doc.maps[level].width);
  const length = 2 + payload.length;
  if (type === 9) {
    // water is length 2 with no extra params — payload empty, length field is 2
  }
  const record = new Uint8Array(length);
  record[0] = type;
  record[1] = length;
  for (let i = 0; i < payload.length; i++) record[2 + i] = payload[i];

  if (objectFreeBytes(doc) < length) {
    throw new Error(`Need ${length} free object bytes; only ${objectFreeBytes(doc)} available. Delete something first.`);
  }

  // Find the terminator for this level
  const list = doc.objects[level];
  let termOff: number;
  if (list.length === 0) {
    const ptr = u16(doc.bytes, doc.objectTable + level * 2);
    termOff = doc.fixedFile + (ptr - 0xc000);
  } else {
    const last = list[list.length - 1];
    termOff = last.fileOff + last.length;
  }
  // Insert before terminator: shift [termOff .. regionEnd) right by length
  const regionEnd = doc.objectRegionEnd;
  for (let i = regionEnd - 1; i >= termOff; i--) doc.bytes[i + length] = doc.bytes[i];
  for (let i = 0; i < length; i++) doc.bytes[termOff + i] = record[i];
  // Update pointers for levels after this one (their data shifted)
  for (let m = level + 1; m < LEVELS.length; m++) {
    const ptr = u16(doc.bytes, doc.objectTable + m * 2);
    setObjPtr(doc, m, ptr + length);
  }
  reloadObjects(doc);
  return doc.objects[level].length - 1;
}

/** Validate mapper-71 iNES and build the editor document model. */
export function loadRom(bytes: Uint8Array, name: string): RomDoc {
  if (bytes.length < 16 || bytes[0] !== 0x4e || bytes[1] !== 0x45 || bytes[2] !== 0x53 || bytes[3] !== 0x1a) {
    throw new Error("That file is not an iNES ROM.");
  }
  const mapper = (bytes[7] & 0xf0) | (bytes[6] >> 4);
  if (mapper !== 71) throw new Error(`RobinEdit edits the mapper 71 cart. This ROM is mapper ${mapper}.`);
  const trainer = (bytes[6] & 4) !== 0;
  const prgStart = 16 + (trainer ? 512 : 0);
  const prgBytes = bytes[4] * 16384;
  if (prgBytes < 65536 || (prgBytes & 0x3fff) !== 0) {
    throw new Error("Expected a 64 KiB (or larger, 16 KiB aligned) PRG ROM.");
  }
  const banks = prgBytes / 16384;
  const blkstl = findBlkstl(bytes);
  const info = findMapInfo(bytes);
  const chrTable = findChrTable(bytes, { prgStart, banks });
  const pals = blkstl + 0x61e;
  const defs = blkstl + 0x60e;
  const heights = bytes.subarray(blkstl + 0x600, blkstl + 0x600 + LEVELS.length);
  const maps: MapInfo[] = [];
  for (let m = 0; m < LEVELS.length; m++) {
    const rec = info + m * 6;
    const pointer = u16(bytes, rec);
    const chrIndex = bytes[rec + 5];
    const chrList: number[] = [];
    for (let i = chrIndex; bytes[defs + i] !== 0xff; i++) chrList.push(bytes[defs + i]);
    const palIndex = bytes[rec + 4];
    maps.push({
      pointer,
      infoFileOff: rec,
      dataFileOff: blkstl + (pointer + MAP_HEIGHT - 0x8000),
      worldX: bytes[rec + 2],
      width: bytes[rec + 3],
      height: heights[m],
      palIndex,
      chrIndex,
      palette: bytes.subarray(pals + palIndex, pals + palIndex + 16),
      chrList,
    });
  }
  const fixedFile = prgStart + prgBytes - 0x4000;
  const { table: objectTable, objects } = findObjectTable(bytes, fixedFile);
  const blockrous = findBlockrous(bytes);
  return new RomDoc(
    bytes,
    name,
    blkstl,
    prgStart,
    banks,
    chrTable,
    fixedFile,
    objectTable,
    maps,
    objects,
    blockrous,
  );
}

/** Refresh cached palette/chr views after a castle header edit. */
export function refreshMapMeta(doc: RomDoc, level: number): void {
  const map = doc.maps[level];
  const rec = map.infoFileOff;
  map.worldX = doc.bytes[rec + 2];
  map.width = doc.bytes[rec + 3];
  map.height = doc.bytes[doc.blkstl + 0x600 + level];
  map.palIndex = doc.bytes[rec + 4];
  map.chrIndex = doc.bytes[rec + 5];
  const pals = doc.blkstl + 0x61e;
  const defs = doc.blkstl + 0x60e;
  map.palette = doc.bytes.subarray(pals + map.palIndex, pals + map.palIndex + 16);
  map.chrList = [];
  for (let i = map.chrIndex; doc.bytes[defs + i] !== 0xff; i++) map.chrList.push(doc.bytes[defs + i]);
  doc.invalidatePatterns();
}

export interface Edit {
  off: number;
  prev: number;
  next: number;
}

/** Apply (or reverse) a list of byte patches in place. */
export function writeEdits(bytes: Uint8Array, edits: Edit[], reverse = false): void {
  const list = reverse ? [...edits].reverse() : edits;
  for (const e of list) bytes[e.off] = reverse ? e.prev : e.next;
}
