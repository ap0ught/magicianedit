/**
 * Magician load/save checks. The synthetic cart is the CI case.
 * A local Beta 1 dump is optional and is never copied into the repo.
 */
import { existsSync, readFileSync } from "node:fs";
import { LEVEL_NAMES } from "./names.ts";
import {
  applyEdit,
  clampBrush,
  editPackByte,
  loadMagician,
  metatileCount,
  paintMapCell,
  saveMagician,
  type MagicianDoc,
  type MagicianLevel,
} from "./document.ts";
import {
  BETA1_LD10,
  BETA1_SHA1,
  PAN_DAT_BYTES,
  PW_DAT_BYTES,
  ROM_BYTES,
  TIT_DAT_BYTES,
  decodeMapByte,
  encodeMapByte,
  sha1Hex,
} from "./format.ts";

let failed = 0;

function check(cond: boolean, message: string) {
  if (!cond) {
    console.error(`FAIL ${message}`);
    failed++;
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function diffOffsets(a: Uint8Array, b: Uint8Array): number[] {
  const out: number[] = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) out.push(i);
  return out;
}

function expectThrow(fn: () => void, needle: string) {
  try {
    fn();
    check(false, `expected throw containing ${needle}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    check(message.includes(needle), `throw "${message}" should include "${needle}"`);
  }
}

check(sha1Hex(new Uint8Array()) === "da39a3ee5e6b4b0d3255bfef95601890afd80709", "sha1 empty");
check(sha1Hex(new TextEncoder().encode("abc")) === "a9993e364706816aba3e25717850c26c9cd0d89d", "sha1 abc");
for (let byte = 0; byte < 256; byte++) {
  if (encodeMapByte(decodeMapByte(byte)) !== byte) {
    check(false, `swizzle ${byte}`);
    break;
  }
}

expectThrow(() => loadMagician(new Uint8Array([1, 2, 3, 4]), "nope.nes"), "not an iNES");
expectThrow(() => {
  const robin = new Uint8Array(64);
  robin.set([0x4e, 0x45, 0x53, 0x1a, 0x04, 0x00, 0x70, 0x40]);
  loadMagician(robin, "robin.nes");
}, "mapper 71");
expectThrow(() => {
  const bad = new Uint8Array(1000);
  bad.set([0x4e, 0x45, 0x53, 0x1a, 0x08, 0x10, 0x40, 0x00]);
  loadMagician(bad, "short.nes");
}, "262160");

const TOWN = new Uint8Array([
  0x08, 0x0b, 0x00, 0x00, 0x00, 0x00, 0xec, 0x00, 0x0b, 0x00, 0xa0, 0x7c, 0xa2, 0x18, 0xb4, 0x00,
]);
const LD = 0x1c210;
const MAP = 0x1028c;
const COL = 0x17428;
const TIT = 0xe010;
const PAL = 0x1f9cb;
const CHR = 16 + 128 * 1024;

function buildSynthetic(patch?: (rom: Uint8Array) => void): Uint8Array {
  const rom = new Uint8Array(ROM_BYTES);
  rom.fill(0xff);
  rom.set([0x4e, 0x45, 0x53, 0x1a, 0x08, 0x10, 0x40, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]);
  for (let i = 0; i < 66; i++) rom.set(TOWN, LD + i * 16);
  rom.set([0x00, 0x04, 0x00, 0x02], MAP);
  for (let i = 0; i < 8; i++) rom[MAP + 4 + i] = encodeMapByte(i);
  rom.set([0x11, 0x22, 0x33, 0x44], COL);
  rom.set(
    [
      0xa5, 0x14, 0x29, 0x01, 0x69, 0x00, 0x85, 0x14, 0xa5, 0x13, 0x69, 0xbb, 0x85, 0x13, 0xa5, 0x14, 0x69,
      0xf9, 0x85, 0x14, 0xa2, 0x0f, 0x20,
    ],
    0x1e010,
  );
  rom.set([0x28, 0x38, 0x30, 0x10, 0x31, 0x30, 0x28, 0x39, 0x30, 0x00, 0x10, 0x30], PAL);
  rom[CHR] = 0x5a;
  rom[TIT] = 0x00;
  rom[TIT + 1] = 0xfc;
  rom[TIT + 2] = 0xe0;
  rom[TIT + 10] = 0xa5;
  rom[TIT + TIT_DAT_BYTES] = 0x00;
  rom[TIT + TIT_DAT_BYTES + 1] = 0xfc;
  rom[TIT + TIT_DAT_BYTES + 2] = 0x01;
  rom[TIT + TIT_DAT_BYTES + PW_DAT_BYTES] = 0x00;
  rom[TIT + TIT_DAT_BYTES + PW_DAT_BYTES + 1] = 0xff;
  rom[TIT + TIT_DAT_BYTES + PW_DAT_BYTES + 2] = 0x00;
  patch?.(rom);
  return rom;
}

const sceneLen = TIT_DAT_BYTES + PW_DAT_BYTES + PAN_DAT_BYTES;
const synthetic = buildSynthetic();
const doc = loadMagician(synthetic, "synthetic.nes");
check(doc.levels.length === 66, `levels ${doc.levels.length}`);
check(LEVEL_NAMES.length === 66, `names ${LEVEL_NAMES.length}`);
check(doc.ld10Off === LD, `ld10 ${doc.ld10Off.toString(16)}`);
check(doc.beta1 === false && doc.warning != null, "soft warning");
check(doc.scene?.titOff === TIT && doc.scene.titLen === 314, "title span");
check(doc.levels[0].map === doc.levels[1].map, "shared map");
check(doc.levels[0].blk === doc.levels[1].blk, "shared blk");
check(doc.levels[0].pal === doc.levels[65].pal, "shared pal");
check(doc.levels[0].map.width === 4 && doc.levels[0].map.height === 2, "map size");
check(doc.levels[0].map.blocks[3] === 3, "decoded index");
check(doc.levels[0].col.bytes.length === 4, `col ${doc.levels[0].col.bytes.length}`);
check(doc.levels[0].blk.bytes.length === 0x27c, `blk ${doc.levels[0].blk.bytes.length}`);
check(doc.levels[0].chr.bytes.length === 4096 && doc.levels[0].chr.bytes[0] === 0x5a, "chr");
check(doc.levels[0].pal.bytes.length === 12 && doc.levels[0].pal.bytes[0] === 0x28, "pal");
check(sameBytes(saveMagician(doc), synthetic), "clean save");

const scene = synthetic.subarray(TIT, TIT + sceneLen);
check(sameBytes(saveMagician(doc).subarray(TIT, TIT + sceneLen), scene), "clean save keeps title");

const painted = paintMapCell(doc.levels[0], 0, 0, 7);
check(painted != null && doc.levels[0].map.blocks[0] === 7, "paint");
const palEdit = editPackByte(doc.levels[0].pal, 1, 0x11);
const chrEdit = editPackByte(doc.levels[0].chr, 0, 0x10);
const blkEdit = editPackByte(doc.levels[0].blk, 0, 0x22);
const colEdit = editPackByte(doc.levels[0].col, 3, 0x55);
const edited = saveMagician(doc);
const diffs = diffOffsets(synthetic, edited);
check(
  diffs.length === 5 &&
    diffs.includes(MAP + 4) &&
    edited[MAP + 4] === encodeMapByte(7) &&
    diffs.includes(PAL + 1) &&
    diffs.includes(CHR) &&
    diffs.includes(doc.levels[0].blk.fileOff) &&
    diffs.includes(COL + 3),
  `edited diffs ${diffs.map((n) => n.toString(16)).join(",")}`,
);
check(sameBytes(edited.subarray(TIT, TIT + sceneLen), scene), "edits do not touch title");
check(edited[TIT + 10] === 0xa5, "title marker");
if (painted) applyEdit(doc, painted, true);
if (palEdit) applyEdit(doc, palEdit, true);
if (chrEdit) applyEdit(doc, chrEdit, true);
if (blkEdit) applyEdit(doc, blkEdit, true);
if (colEdit) applyEdit(doc, colEdit, true);
check(sameBytes(saveMagician(doc), synthetic), "undo restores bytes");

const town = doc.levels[0];
const townTiles = metatileCount(town);
check(townTiles === 159, `synthetic metatiles ${townTiles}`);
const kept = town.map.blocks[0];
check(paintMapCell(town, 0, 0, townTiles) == null, "paint index == count");
check(paintMapCell(town, 0, 0, 255) == null, "paint 255");
check(paintMapCell(town, 0, 0, -1) == null, "paint -1");
check(paintMapCell(town, 0, 0, 1.5) == null, "paint fractional index");
check(town.map.blocks[0] === kept, "out of range paint does not write");
const last = paintMapCell(town, 0, 0, townTiles - 1);
check(last != null && town.map.blocks[0] === townTiles - 1, "paint last metatile");
if (last) applyEdit(doc, last, true);
check(town.map.blocks[0] === kept, "last metatile undo");

const shortBlocks = new Uint8Array(town.map.blocks);
const short = levelWithPack(town, shortBlocks, town.blk.bytes.subarray(0, 8));
check(metatileCount(short) === 2, `short pack ${metatileCount(short)}`);
check(paintMapCell(short, 0, 0, 2) == null && shortBlocks[0] === kept, "byte-sized index past a 2-metatile pack");
check(paintMapCell(short, 0, 0, 255) == null && shortBlocks[0] === kept, "255 past a 2-metatile pack");
const shortPaint = paintMapCell(short, 0, 0, 1);
check(shortPaint != null && shortBlocks[0] === 1, "last index of a short pack");
check(town.map.blocks[0] === kept, "short pack paint leaves the document map");

const wideBlocks = new Uint8Array([0]);
const wide = levelWithPack(town, wideBlocks, new Uint8Array(256 * 4));
check(metatileCount(wide) === 256, `wide pack ${metatileCount(wide)}`);
const widePaint = paintMapCell(wide, 0, 0, 255);
check(widePaint != null && wideBlocks[0] === 255, "255 fits a 256-metatile pack");
check(paintMapCell(wide, 0, 0, 256) == null && wideBlocks[0] === 255, "256 does not fit a 256-metatile pack");

check(clampBrush(200, town) === 158, "clamp 200 onto 159 metatiles");
check(clampBrush(158, town) === 158, "clamp keeps the last metatile");
check(clampBrush(7, town) === 7, "clamp keeps an in-range brush");
check(clampBrush(255, wide) === 255, "clamp keeps 255 on a 256-metatile pack");
check(clampBrush(200, short) === 1, "clamp 200 onto a 2-metatile pack");
check(clampBrush(-4, town) === 0, "clamp clears a negative brush");
check(sameBytes(saveMagician(doc), synthetic), "bounds checks leave the cart");

expectThrow(
  () =>
    loadMagician(
      buildSynthetic((rom) => {
        const desc = LD + 16;
        rom.set(
          [0x07, 0x0b, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x02, 0x00, 0xa0, 0x90, 0xa1, 0x1c, 0xb4, 0x00],
          desc,
        );
        rom.set([0x00, 0x02, 0x00, 0x02, 1, 2, 3, 4], TIT + 0x190);
      }),
      "title-overlap.nes",
    ),
  "title",
);

function levelWithPack(level: MagicianLevel, blocks: Uint8Array, blk: Uint8Array): MagicianLevel {
  return {
    ...level,
    xorg: 0,
    yorg: 0,
    xlim: blocks.length,
    ylim: 1,
    map: { ...level.map, width: blocks.length, height: 1, blocks },
    blk: { ...level.blk, bytes: blk },
  };
}

function golden(path: string, label: string, expect: (doc: MagicianDoc, rom: Uint8Array) => void) {
  if (!existsSync(path)) {
    console.log(`SKIP ${label} golden (missing ${path})`);
    return;
  }
  const failedBefore = failed;
  const rom = new Uint8Array(readFileSync(path));
  const loaded = loadMagician(rom, label);
  expect(loaded, rom);
  check(sameBytes(saveMagician(loaded), rom), `${label} clean save`);
  const before = rom[loaded.levels[0].map.fileOff + 4];
  const prevIndex = loaded.levels[0].map.blocks[0];
  const count = metatileCount(loaded.levels[0]);
  check(paintMapCell(loaded.levels[0], 0, 0, count) == null, `${label} rejects metatile count`);
  if (255 >= count) check(paintMapCell(loaded.levels[0], 0, 0, 255) == null, `${label} rejects 255`);
  check(loaded.levels[0].map.blocks[0] === prevIndex, `${label} rejected paint keeps the cell`);
  const nextIndex = prevIndex === 0 ? 1 : prevIndex - 1;
  const edit = paintMapCell(loaded.levels[0], 0, 0, nextIndex);
  const saved = saveMagician(loaded);
  const changed = diffOffsets(rom, saved);
  check(edit != null && changed.length === 1 && changed[0] === loaded.levels[0].map.fileOff + 4, `${label} one map byte`);
  check(saved[changed[0]] === encodeMapByte(loaded.levels[0].map.blocks[0]), `${label} reswizzle`);
  check(saved[changed[0]] !== before, `${label} byte changed`);
  if (loaded.scene) {
    const off = loaded.scene.titOff;
    const len = loaded.scene.titLen + loaded.scene.pwLen + loaded.scene.panLen;
    check(sameBytes(saved.subarray(off, off + len), rom.subarray(off, off + len)), `${label} scene unchanged`);
    check(changed[0] < off || changed[0] >= off + len, `${label} edit outside scene`);
  }
  if (edit) applyEdit(loaded, edit, true);
  check(sameBytes(saveMagician(loaded), rom), `${label} revert`);
  if (failed === failedBefore) console.log(`${label} golden ok`);
}

golden(
  "/extdrive/backups/SHARE/roms/nes/Magician (USA) (Beta 1) (1990-03-02).nes",
  "beta1",
  (loaded, rom) => {
    check(loaded.beta1 && loaded.warning == null, "beta1 pin");
    check(loaded.sha1 === BETA1_SHA1, "beta1 sha");
    check(loaded.ld10Off === BETA1_LD10, `beta1 ld10 ${loaded.ld10Off.toString(16)}`);
    check(loaded.levels.length === 66, "beta1 levels");
    check(loaded.levels[0].name === "10 Town", loaded.levels[0].name);
    check(loaded.levels[0].map.width === 236 && loaded.levels[0].map.height === 11, "town map");
    check(loaded.levels[0].xlim === 236 && loaded.levels[0].ylim === 11, "town window");
    check(loaded.levels[1].xlim === 256 && loaded.levels[1].map.width === 256, "wilderness");
    check(loaded.levels[2].xlim === 16 && loaded.levels[2].ylim === 27, "well window");
    check(loaded.levels[0].blk.bytes.length === 636, `town blk ${loaded.levels[0].blk.bytes.length}`);
    check(loaded.levels[0].col.bytes.length === 708, `town col ${loaded.levels[0].col.bytes.length}`);
    check(loaded.levels[1].col.bytes.length === 896, `wild col ${loaded.levels[1].col.bytes.length}`);
    check(loaded.levels[2].col.bytes.length === 120, `well col ${loaded.levels[2].col.bytes.length}`);
    check(loaded.levels[8].col.bytes.length === 96, `cavern col ${loaded.levels[8].col.bytes.length}`);
    check(loaded.levels[9].col.bytes.length === 248, `cavern2 col ${loaded.levels[9].col.bytes.length}`);
    check(loaded.levels[27].name === "72 Passage 3", loaded.levels[27].name);
    check(loaded.levels[25].col === loaded.levels[27].col, "passage 3 shares 70.COL");
    check(loaded.levels[27].col.bytes.length === 660, `passage col ${loaded.levels[27].col.bytes.length}`);
    check(loaded.levels[32].name === "80 Tower", loaded.levels[32].name);
    check(loaded.levels[32].map.width === 16 && loaded.levels[32].map.height === 81, "tower map");
    check(loaded.levels[32].col.bytes.length === 352, `tower col ${loaded.levels[32].col.bytes.length}`);
    check(loaded.levels[39].name === "90 Final battle", loaded.levels[39].name);
    check(loaded.levels[39].col.bytes.length === 96, `80 col ${loaded.levels[39].col.bytes.length}`);
    check(loaded.levels[0].pal.bytes[0] === 0x28 && loaded.levels[0].pal.bytes.length === 12, "town pal");
    check(loaded.levels[0].chr.bytes.length === 4096, "town chr");
    check(loaded.scene?.titOff === 0xeb6f && loaded.scene.titLen === 314, "beta1 titdat");
    check(loaded.scene?.pwLen === 292 && loaded.scene?.panLen === 96, "beta1 pw/pan");
    const span = loaded.scene ? { off: loaded.scene.titOff, len: 314 + 292 + 96 } : null;
    if (span) {
      for (const map of loaded.maps) {
        check(map.fileOff + 4 + map.blocks.length <= span.off || map.fileOff >= span.off + span.len, "map vs title");
      }
      for (const pack of loaded.packs) {
        const hits =
          pack.fileOff < span.off + span.len && span.off < pack.fileOff + pack.bytes.length;
        check(!hits, `${pack.kind} overlaps title`);
      }
    }
    check(rom.length === ROM_BYTES, "beta1 size");
  },
);

golden("/extdrive/backups/SHARE/roms/nes/Magician (USA).nes", "release", (loaded) => {
  check(!loaded.beta1 && loaded.warning != null, "release warning");
  check(loaded.ld10Off === 0x1caed, `release ld10 ${loaded.ld10Off.toString(16)}`);
  check(loaded.scene == null, "release has no title dat");
  check(loaded.levels.length === 66, "release levels");
});

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log("magician load/save ok");
