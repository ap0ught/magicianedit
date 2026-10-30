import { SPAWN_TILES, kindFromBlockrou, spawnTileLabel, type SpawnTileKind } from "./anim.ts";
import { describeKeyLink, keyLinkShort, loadDoors, type DoorRec } from "./keys.ts";
import { kindOf, readRaw } from "./objects.ts";
import type { Pickup } from "./pickups.ts";
import { MAP_HEIGHT, type RomDoc } from "./rom.ts";
import { secretLabel } from "./secrets.ts";
import { doorBounds, enemyBounds } from "./sprites.ts";

function inBox(px: number, py: number, x: number, y: number, w: number, h: number): boolean {
  return px >= x && px < x + w && py >= y && py < y + h;
}

/** Collect every object / marker under the cursor (stacked KEY+SECRET on air, etc.). */
export function describeHoverTarget(
  doc: RomDoc,
  level: number,
  px: number,
  py: number,
  hidden: Set<number>,
  pickups: Pickup[],
  doors?: DoorRec[],
): string {
  const table = doors ?? loadDoors(doc);
  const list = doc.objects[level];
  const hits: string[] = [];

  for (let i = list.length - 1; i >= 0; i--) {
    const rec = list[i];
    if (hidden.has(rec.type)) continue;
    const raw = readRaw(doc, rec);
    const kind = kindOf(rec.type);

    if (rec.type === 2 || rec.type === 6) {
      const b = enemyBounds(rec.type, raw);
      if (!b || !inBox(px, py, b.x, b.y, b.w, b.h)) continue;
      if (rec.type === 2) {
        const high = ((raw[6] ?? 0) & 0x80) !== 0;
        hits.push(`${kind.name} #${i} · Y ${raw[4]} (${high ? "high" : "low"} shot)`);
      } else {
        hits.push(`${kind.name} #${i} · Y ${raw[3]}`);
      }
      continue;
    }

    if (rec.type === 3) {
      const min = raw[3] | (raw[4] << 8);
      const max = raw[5] | (raw[6] << 8);
      const y = raw[7];
      const x0 = Math.min(min, max);
      const x1 = Math.max(min, max);
      if (px >= x0 - 6 && px <= x1 + 6 && Math.abs(py - y) <= 10) {
        hits.push(`${kind.name} #${i} · id ${raw[2]} (horizontal)`);
      }
      continue;
    }

    if (rec.type === 4) {
      const x = raw[3] | (raw[4] << 8);
      const y0 = Math.min(raw[6], raw[7]);
      const y1 = Math.max(raw[6], raw[7]);
      if (py >= y0 - 6 && py <= y1 + 6 && Math.abs(px - x) <= 10) {
        hits.push(`${kind.name} #${i} · id ${raw[2]} (lift)`);
      }
      continue;
    }

    if (rec.type === 5) {
      const x = raw[3] * 16;
      const y = raw[4];
      if (!inBox(px, py, x - 2, y - 2, 20, 20)) continue;
      const info = describeKeyLink(doc, raw[5] ?? 0, table);
      const col = raw[3];
      const mate = list.findIndex(
        (o, j) =>
          j !== i &&
          o.type === 7 &&
          readRaw(doc, o)[3] === col &&
          Math.abs(readRaw(doc, o)[4] - y) <= 8,
      );
      const withSecret =
        mate >= 0 ? ` · with SECRET #${readRaw(doc, list[mate])[5] ?? 0}` : "";
      hits.push(`KEY #${i} ${keyLinkShort(info)}${withSecret}`);
      continue;
    }

    if (rec.type === 1) {
      const x = raw[2] * 16;
      const y = (raw[3] & 31) * 16;
      if (!inBox(px, py, x - 2, y - 2, 20, 20)) continue;
      hits.push(`${kind.name} #${i} · tile ${raw[4]}`);
      continue;
    }

    if (rec.type === 7) {
      const x = raw[3] * 16;
      const y = raw[4];
      if (!inBox(px, py, x - 2, y - 2, 20, 20)) continue;
      const col = raw[3];
      const row = Math.floor(y / 16);
      const tile =
        col >= 0 && col < doc.maps[level].width && row >= 0 && row < MAP_HEIGHT
          ? doc.blockAt(level, col, row)
          : -1;
      const onAir = tile === 0 ? " · on air" : "";
      hits.push(`${secretLabel(raw[5] ?? 0)} · obj #${i} · col ${col}${onAir}`);
      continue;
    }

    if (rec.type === 8) {
      const x = raw[3] * 16;
      const y = raw[4];
      if (!inBox(px, py, x - 2, y - 2, 20, 20)) continue;
      hits.push(`${kind.name} #${i}`);
      continue;
    }
  }

  for (const d of table) {
    if (d.level !== level) continue;
    const b = doorBounds(d.column, d.row, d.tileHeight);
    if (!inBox(px, py, b.x, b.y, b.w, b.h)) continue;
    hits.push(`DOOR #${d.link} · col ${d.column} rows ${d.topRow}–${d.row}`);
  }

  for (const p of pickups) {
    if (p.level !== level) continue;
    if (!inBox(px, py, p.markColumn * 16, p.row * 16, 16, 16)) continue;
    const label = p.kind === "treasure" ? "TREASURE" : "HEART";
    const snapped = p.markColumn !== p.column ? ` (coinco col ${p.column})` : "";
    hits.push(`${label} #${p.index + 1} · col ${p.markColumn} row ${p.row}${snapped}`);
  }

  if (doc.blockrous) {
    const map = doc.maps[level];
    const col = Math.floor(px / 16);
    const row = Math.floor(py / 16);
    if (col >= 0 && col < map.width && row >= 0 && row < MAP_HEIGHT) {
      const id = doc.bytes[map.dataFileOff + col * MAP_HEIGHT + row];
      const kind = kindFromBlockrou(doc.blockrous[id]);
      if (kind && SPAWN_TILES.has(kind)) {
        hits.push(
          `${spawnTileLabel(kind as SpawnTileKind).toUpperCase()} · spawn tile col ${col} row ${row}`,
        );
      }
    }
  }

  if (hits.length) return hits.join(" · ");
  return "empty";
}
