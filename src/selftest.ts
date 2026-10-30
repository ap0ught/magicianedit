import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderLevelRGBA } from "./draw.ts";
import { findMapExits } from "./exits.ts";
import { hitWorldOverview, worldLayout } from "./overview.ts";
import { loadPickups } from "./pickups.ts";
import { romForPlayFromMap } from "./play.ts";
import { deleteObject, insertObject, loadRom, objectFreeBytes } from "./rom.ts";
import {
  RUN_TABLE_LEN,
  findRobinStats,
  flashVisible,
  readRobin,
  stockRunTable,
} from "./settings.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const carts = ["public/asia.nes", "public/rebuilt.nes"];

let failed = 0;
for (const rel of carts) {
  const file = path.join(root, rel);
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(readFileSync(file));
  } catch {
    console.error(`SKIP ${rel} (inherited shell: place a mapper 71 cart at ${rel})`);
    failed++;
    continue;
  }
  const doc = loadRom(bytes, rel);
  const map = doc.maps[0];
  const first = Array.from(bytes.subarray(map.dataFileOff, map.dataFileOff + 14));
  const expect = [0x1a, 0x1d, 0x1c, 0x1f, 0x1a, 0x1d, 0x1c, 0x1f, 0x1b, 0x1b, 0x1c, 0x1f, 0x1a, 0x1d];
  const key = doc.objects[0][0];
  const keyBytes = Array.from(bytes.subarray(key.fileOff, key.fileOff + 6));
  const img = renderLevelRGBA(doc, 4);
  let ink = 0;
  for (let i = 0; i < img.rgba.length; i += 4) if (img.rgba[i] | img.rgba[i + 1] | img.rgba[i + 2]) ink++;
  const problems: string[] = [];
  if (doc.maps.length !== 13) problems.push(`maps ${doc.maps.length}`);
  if (doc.maps.map((m) => m.width).join() !== "72,32,16,64,208,176,176,160,40,32,24,32,16") {
    problems.push("widths");
  }
  if (first.join() !== expect.join()) problems.push(`col0 ${first.map((n) => n.toString(16)).join(" ")}`);
  if (key.type !== 5 || keyBytes.join() !== [5, 6, 0x15, 0x25, 0x38, 0xf9].join()) {
    problems.push(`key ${keyBytes.map((n) => n.toString(16)).join(" ")}`);
  }
  if (ink < 1000) problems.push(`blank render ${ink}`);
  const pattern = doc.patternFor(4);
  if (pattern.length !== 4096) problems.push("pattern");
  // PP1 sanity: dungeon rock tile 157 is solid color-2 (plane0=0, plane1=0xFF).
  const rock0 = pattern.subarray(157 * 16, 157 * 16 + 16);
  if (![...rock0.slice(0, 8)].every((b) => b === 0) || ![...rock0.slice(8)].every((b) => b === 0xff)) {
    problems.push("pp1 rock tile");
  }
  const sky = doc.patternFor(12);
  // Sky empty metatile uses tile 168; after a correct PP1 unpack it is mostly color 2 (teal).
  let c2 = 0;
  for (let r = 0; r < 8; r++) {
    const lo = sky[168 * 16 + r];
    const hi = sky[168 * 16 + r + 8];
    for (let c = 0; c < 8; c++) {
      const bit = 7 - c;
      if (((((hi >> bit) & 1) << 1) | ((lo >> bit) & 1)) === 2) c2++;
    }
  }
  if (c2 < 48) problems.push(`pp1 sky tile168 c2=${c2}`);
  if (!map.infoFileOff) problems.push("infoFileOff");
  const robin = findRobinStats(bytes);
  if (!robin) problems.push("robin stats");
  else {
    const vals = readRobin(doc, robin);
    if (vals.lives !== 3 || vals.cheatLives !== 4 || vals.jump !== -13) {
      problems.push(`robin vals ${JSON.stringify(vals)}`);
    }
    if (vals.runTable.length !== RUN_TABLE_LEN) {
      problems.push(`run table len ${vals.runTable.length}`);
    } else {
      const stock = stockRunTable();
      if (vals.runTable.some((v, i) => v !== stock[i])) {
        problems.push("run table not stock ×5 curve");
      }
    }
  }
  const flash = doc.objects[0].find((o) => o.type === 1);
  if (flash) {
    const raw = Array.from(bytes.subarray(flash.fileOff, flash.fileOff + flash.length));
    const on = Math.max(1, raw[5] || 1);
    if (flashVisible(raw, 0) === flashVisible(raw, on)) problems.push("flash period");
  }
  if (doc.maps.some((m) => m.height === undefined)) problems.push("heights");
  const layout = worldLayout(doc, 2);
  const dungeon = doc.maps[4];
  const hit = hitWorldOverview(
    doc,
    layout,
    (dungeon.worldX + 10) * 2 + 1,
    (layout.tiers - 1 - dungeon.height) * 14 * 2 + 4,
  );
  if (!hit || hit.level !== 4) problems.push(`overview hit ${hit?.level}`);
  if (!doc.blockrous) problems.push("blockrous");
  else if (doc.blockrous[0x34] !== 4 || doc.blockrous[0xf3] !== 0x9c) {
    problems.push(`blockrous ${doc.blockrous[0x34]},${doc.blockrous[0xf3]}`);
  }
  if (!doc.objectTable) problems.push("objectTable");
  const pickups = loadPickups(doc);
  // coinco has 48 treasures + up to 48 hearts; some heart slots are unused/commented in source.
  if (pickups.length < 70) problems.push(`pickups ${pickups.length}`);
  const collectables = doc.objects.flat().filter((o) => o.type === 5 || o.type === 7 || o.type === 8);
  if (collectables.length < 20) problems.push(`collectables ${collectables.length}`);
  const dungeonKeys = doc.objects[4].filter((o) => o.type === 5);
  if (!dungeonKeys.length) problems.push("no dungeon keys");
  const dungeonPickups = pickups.filter((p) => p.level === 4);
  if (dungeonPickups.length < 5) problems.push(`dungeon pickups ${dungeonPickups.length}`);
  // insert/delete on a scratch copy so the printed object counts stay pristine
  try {
    const scratch = loadRom(bytes.slice(), rel + ".scratch");
    const busy = scratch.objects[0].findIndex((o) => o.type === 1);
    if (busy >= 0) {
      const before0 = scratch.objects[0].length;
      deleteObject(scratch, 0, busy);
      if (scratch.objects[0].length !== before0 - 1) problems.push("delete count");
      if (objectFreeBytes(scratch) < 2) problems.push("no free after delete");
      const idx = insertObject(scratch, 12, 5, 4);
      if (scratch.objects[12][idx]?.type !== 5) problems.push("insert type");
      deleteObject(scratch, 12, idx);
    }
  } catch (err) {
    problems.push(`mutate ${err instanceof Error ? err.message : err}`);
  }
  // Map 3 has two rim ladder shafts up and two down (not one chip per destination).
  const map3 = findMapExits(doc, 2);
  const up3 = map3.filter((e) => e.dir === "up");
  const down3 = map3.filter((e) => e.dir === "down");
  if (up3.length < 2 || down3.length < 2) {
    problems.push(`map3 exits up=${up3.length} down=${down3.length}`);
  }
  if (up3.some((e) => e.toLevel !== 4) || down3.some((e) => e.toLevel !== 0)) {
    problems.push("map3 exit targets");
  }
  // Play-from-map patch: startlevel imm + robinxl/xh/y + title nop.
  try {
    const play = romForPlayFromMap(doc, 0);
    let startImm: number | null = null;
    for (let i = 0; i < play.length - 6; i++) {
      if (
        play[i] === 0xa9 &&
        play[i + 2] === 0x85 &&
        play[i + 3] === 0x42 &&
        play[i + 4] === 0x20
      ) {
        startImm = play[i + 1];
        break;
      }
    }
    if (startImm !== 0) problems.push(`play startlevel ${startImm}`);
    let titleNop = false;
    for (let i = 0; i < play.length - 9; i++) {
      if (
        bytes[i] === 0x20 &&
        bytes[i + 2] === 0xc2 &&
        bytes[i + 3] === 0x20 &&
        bytes[i + 5] === 0x9d &&
        bytes[i + 6] === 0x20 &&
        bytes[i + 8] === 0xc2 &&
        [...play.subarray(i, i + 9)].every((b) => b === 0xea)
      ) {
        titleNop = true;
        break;
      }
    }
    if (!titleNop) problems.push("play title skip");
  } catch (err) {
    problems.push(`play ${err instanceof Error ? err.message : err}`);
  }
  console.log(`${rel}: objects ${doc.objects.map((o) => o.length).join(",")} ink ${ink} ${problems.length ? "FAIL " + problems.join("; ") : "ok"}`);
  if (problems.length) failed++;
}
if (failed) process.exit(1);
