import { paintLevel, type ExportLayers } from "./draw.ts";
import type { Pickup } from "./pickups.ts";
import { LEVELS, MAP_HEIGHT, type RomDoc } from "./rom.ts";
import { download } from "./playBridge.ts";

/** Rasterize the current level view and download a PNG. */
export function exportPng(
  doc: RomDoc,
  level: number,
  collision: boolean,
  markers: boolean,
  hidden: Set<number>,
  animKinds: Set<string>,
  animTick: number,
  checkerboard: boolean,
  pickups: Pickup[],
  exportLayers: ExportLayers,
) {
  const map = doc.maps[level];
  const canvas = document.createElement("canvas");
  canvas.width = map.width * 16;
  canvas.height = MAP_HEIGHT * 16;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  paintLevel(ctx, doc, level, {
    zoom: 1,
    grid: "none",
    collision,
    objects: markers,
    hidden,
    selected: null,
    animKinds,
    animTick,
    checkerboard,
    pickups,
    exportLayers,
  });
  canvas.toBlob((blob) => {
    if (!blob) return;
    download(blob, `${LEVELS[level].name.replace(/\s+/g, "-").toLowerCase()}.png`);
  });
}
