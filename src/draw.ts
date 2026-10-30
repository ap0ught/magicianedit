import {
  SPAWN_TILES,
  kindFromBlockrou,
  pulsePhase,
  spawnTileAccent,
  spawnTileLabel,
  type SpawnTileKind,
  type TileAnim,
} from "./anim.ts";
import type { DoorRec, KeyLinkInfo } from "./keys.ts";
import { describeKeyLink, keyLinkShort, loadDoors } from "./keys.ts";
import { anchorOf, kindOf, readRaw } from "./objects.ts";
import { nesColor } from "./palette.ts";
import type { Pickup } from "./pickups.ts";
import { MAP_HEIGHT, type RomDoc } from "./rom.ts";
import { robinSpawnOnLevel } from "./robinSpawn.ts";
import { secretShort } from "./secrets.ts";
import { flashVisible } from "./settings.ts";
import { doorBounds, drawEnemySprite } from "./sprites.ts";

const TILE_ANIM_COLORS: Partial<Record<TileAnim, string>> = {
  torch: "rgba(255, 160, 40, 0.55)",
  spit: "rgba(80, 220, 255, 0.5)",
  drip: "rgba(255, 80, 40, 0.5)",
  drill: "rgba(180, 180, 200, 0.55)",
  spider: "rgba(160, 80, 255, 0.5)",
  barrel: "rgba(200, 140, 60, 0.5)",
  eyes: "rgba(255, 255, 120, 0.45)",
  bat: "rgba(140, 100, 200, 0.45)",
  rat: "rgba(160, 120, 80, 0.45)",
  tramp: "rgba(100, 200, 120, 0.45)",
  heart: "rgba(255, 80, 120, 0.5)",
  coin: "rgba(255, 220, 60, 0.55)",
};

export interface LevelImage {
  w: number;
  h: number;
  rgba: Uint8ClampedArray;
}

/** Blit one 8×8 NES CHR tile into an RGBA buffer. */
/** Blit one 8×8 NES CHR tile into an RGBA buffer. */
function blitTile(
  rgba: Uint8ClampedArray,
  w: number,
  pattern: Uint8Array,
  tile: number,
  dx: number,
  dy: number,
  rgb: [number, number, number][],
  skipZero = false,
): void {
  const chr = tile * 16;
  for (let row = 0; row < 8; row++) {
    const lo = pattern[chr + row];
    const hi = pattern[chr + row + 8];
    for (let col = 0; col < 8; col++) {
      const bit = 7 - col;
      const ci = (((hi >> bit) & 1) << 1) | ((lo >> bit) & 1);
      if (skipZero && ci === 0) continue;
      const c = rgb[ci];
      const o = ((dy + row) * w + (dx + col)) * 4;
      rgba[o] = c[0];
      rgba[o + 1] = c[1];
      rgba[o + 2] = c[2];
      rgba[o + 3] = 255;
    }
  }
}

/** Fill the level buffer with a subtle checkerboard (transparent-tile backdrop). */
/** Fill the level buffer with a subtle checkerboard (transparent-tile backdrop). */
function fillChecker(rgba: Uint8ClampedArray, w: number, h: number): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const light = ((x >> 3) + (y >> 3)) & 1;
      const c = light ? 0x3a : 0x28;
      const o = (y * w + x) * 4;
      rgba[o] = c;
      rgba[o + 1] = c;
      rgba[o + 2] = c + 8;
      rgba[o + 3] = 255;
    }
  }
}

/** Rasterize one map strip to RGBA (metatiles + optional flash overrides). */
/** Rasterize one map strip to RGBA (metatiles + optional flash overrides). */
export function renderLevelRGBA(
  doc: RomDoc,
  level: number,
  animTick = 0,
  animateFlash = false,
  checkerboard = false,
): LevelImage {
  const map = doc.maps[level];
  const w = map.width * 16;
  const h = MAP_HEIGHT * 16;
  const rgba = new Uint8ClampedArray(w * h * 4);
  if (checkerboard) fillChecker(rgba, w, h);
  const pattern = doc.patternFor(level);
  const pals: [number, number, number][][] = [];
  for (let p = 0; p < 4; p++) {
    pals.push([0, 1, 2, 3].map((i) => nesColor(map.palette[p * 4 + i])));
  }
  const { tl, tr, bl, br, attr } = doc.blocks;
  const overrides = new Map<string, number>();
  if (animateFlash) {
    for (const rec of doc.objects[level]) {
      if (rec.type !== 1) continue;
      const raw = readRaw(doc, rec);
      if (!flashVisible(raw, animTick)) continue;
      overrides.set(`${raw[2]},${raw[3] & 31}`, raw[4]);
    }
  }
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < MAP_HEIGHT; y++) {
      const id = overrides.get(`${x},${y}`) ?? doc.bytes[map.dataFileOff + x * MAP_HEIGHT + y];
      const pal = pals[(attr[id] >> 2) & 3];
      blitTile(rgba, w, pattern, tl[id], x * 16, y * 16, pal, checkerboard);
      blitTile(rgba, w, pattern, tr[id], x * 16 + 8, y * 16, pal, checkerboard);
      blitTile(rgba, w, pattern, bl[id], x * 16, y * 16 + 8, pal, checkerboard);
      blitTile(rgba, w, pattern, br[id], x * 16 + 8, y * 16 + 8, pal, checkerboard);
    }
  }
  return { w, h, rgba };
}

export type GridStyle = "none" | "line" | "dash" | "dots" | "corner";

export interface DrawOpts {
  zoom: number;
  grid: GridStyle;
  collision: boolean;
  objects: boolean;
  hidden: Set<number>;
  selected: number | null;
  /** Which View→Animate families are on. */
  animKinds?: Set<string>;
  animTick?: number;
  checkerboard?: boolean;
  pickups?: Pickup[];
  /**
   * When set, object/pickup drawing is filtered by these export toggles.
   * Live editor omits this so collectables always paint.
   */
  exportLayers?: ExportLayers;
  /** When a key is selected, highlight its linked door / platform. */
  keyLink?: KeyLinkInfo | null;
  doors?: DoorRec[];
  /** Temporary Robin pose (e.g. after taking a map exit). */
  robinPreview?: { x: number; y: number; dir?: "up" | "down" | "left" | "right" } | null;
}

/** KEY / SECRET / MARION — always drawn in the editor (not gated by Objects). */
const COLLECTABLE_TYPES = new Set([5, 7, 8]);

export interface ExportLayers {
  treasure: boolean;
  robin: boolean;
  gate: boolean;
  platform: boolean;
  key: boolean;
  cannon: boolean;
  archer: boolean;
  torch: boolean;
  marion: boolean;
}

export const DEFAULT_EXPORT: ExportLayers = {
  treasure: true,
  robin: true,
  gate: true,
  platform: true,
  key: true,
  cannon: true,
  archer: true,
  torch: true,
  marion: true,
};

/** Paint a full editor/export view of a level onto a 2D canvas. */
/** Paint a full editor/export view of a level onto a 2D canvas. */
export function paintLevel(
  ctx: CanvasRenderingContext2D,
  doc: RomDoc,
  level: number,
  opts: DrawOpts,
): void {
  const map = doc.maps[level];
  const animKinds = opts.animKinds ?? new Set<string>();
  const layers = opts.exportLayers ?? DEFAULT_EXPORT;
  const tick = opts.animTick ?? 0;
  const img = renderLevelRGBA(
    doc,
    level,
    tick,
    animKinds.has("flash"),
    !!opts.checkerboard,
  );
  const off = document.createElement("canvas");
  off.width = img.w;
  off.height = img.h;
  const pixels = new Uint8ClampedArray(new ArrayBuffer(img.rgba.byteLength));
  pixels.set(img.rgba);
  off.getContext("2d")!.putImageData(new ImageData(pixels, img.w, img.h), 0, 0);
  const z = opts.zoom;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, 0, 0, img.w * z, img.h * z);

  // Pulsing overlays for animated map tiles (torch, spit, drip, …)
  if (doc.blockrous && animKinds.size) {
    const pulse = 0.35 + 0.35 * pulsePhase(tick, 12);
    for (let x = 0; x < map.width; x++) {
      for (let y = 0; y < MAP_HEIGHT; y++) {
        const id = doc.bytes[map.dataFileOff + x * MAP_HEIGHT + y];
        const kind = kindFromBlockrou(doc.blockrous[id]);
        if (!kind || !animKinds.has(kind)) continue;
        // Spawn pads get dedicated markers below — skip double-paint here.
        if (SPAWN_TILES.has(kind)) continue;
        if (kind === "torch" && !layers.torch) continue;
        const color = TILE_ANIM_COLORS[kind];
        if (!color) continue;
        ctx.fillStyle = color.replace(/[\d.]+\)$/, `${pulse})`);
        ctx.fillRect(x * 16 * z, y * 16 * z, 16 * z, 16 * z);
      }
    }
  }

  if (opts.collision) {
    for (let x = 0; x < map.width; x++) {
      for (let y = 0; y < MAP_HEIGHT; y++) {
        const id = doc.bytes[map.dataFileOff + x * MAP_HEIGHT + y];
        const s = doc.blocks.solid[id];
        const pairs = [(s >> 6) & 3, (s >> 4) & 3, (s >> 2) & 3, s & 3];
        pairs.forEach((pair, q) => {
          if (!pair) return;
          // 1 ladder (cyan), 2 semifloor (orange), 3 solid (red) — CONTROL.ROU codes.
          ctx.fillStyle =
            pair === 1
              ? "rgba(64, 200, 220, 0.45)"
              : pair === 2
                ? "rgba(255, 176, 48, 0.45)"
                : "rgba(255, 64, 48, 0.45)";
          const qx = (x * 16 + (q % 2) * 8) * z;
          const qy = (y * 16 + Math.floor(q / 2) * 8) * z;
          ctx.fillRect(qx, qy, 8 * z, 8 * z);
        });
      }
    }
  }

  if (opts.grid !== "none") {
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    if (opts.grid === "dash") ctx.setLineDash([4, 4]);
    else ctx.setLineDash([]);
    for (let x = 0; x <= map.width; x++) {
      for (let y = 0; y <= MAP_HEIGHT; y++) {
        const px = x * 16 * z;
        const py = y * 16 * z;
        if (opts.grid === "dots") {
          if (x < map.width && y < MAP_HEIGHT) ctx.fillRect(px - 1, py - 1, 2, 2);
        } else if (opts.grid === "corner") {
          if (x < map.width && y < MAP_HEIGHT) {
            ctx.beginPath();
            ctx.moveTo(px + 0.5, py + 4);
            ctx.lineTo(px + 0.5, py + 0.5);
            ctx.lineTo(px + 4, py + 0.5);
            ctx.stroke();
          }
        } else if (x === 0 || y === 0 || opts.grid === "line" || opts.grid === "dash") {
          /* drawn below */
        }
      }
    }
    if (opts.grid === "line" || opts.grid === "dash") {
      ctx.beginPath();
      for (let x = 0; x <= map.width; x++) {
        const px = x * 16 * z + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, img.h * z);
      }
      for (let y = 0; y <= MAP_HEIGHT; y++) {
        const py = y * 16 * z + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(img.w * z, py);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  /** Export-only layer filter; live editor always shows kinds (aside from `hidden`). */
  const filtering = opts.exportLayers !== undefined;
  const showType = (type: number) => {
    if (!filtering) return true;
    if (type === 2) return layers.archer;
    if (type === 3 || type === 4) return layers.platform;
    if (type === 5) return layers.key;
    if (type === 6) return layers.cannon;
    if (type === 7) return layers.gate || layers.treasure;
    if (type === 8) return layers.marion;
    return true;
  };

  const doors = opts.doors ?? loadDoors(doc);
  const link = opts.keyLink ?? null;

  // Highlight linked door (doordata bottom row + height growing upward)
  if (link?.door && link.door.level === level) {
    const d = link.door;
    const b = doorBounds(d.column, d.row, d.tileHeight);
    ctx.fillStyle = "rgba(255, 220, 80, 0.35)";
    ctx.strokeStyle = "#ffe066";
    ctx.lineWidth = 2;
    ctx.fillRect(b.x * z, b.y * z, b.w * z, b.h * z);
    ctx.strokeRect(b.x * z + 0.5, b.y * z + 0.5, b.w * z - 1, b.h * z - 1);
    ctx.fillStyle = "#ffe066";
    ctx.font = `${Math.max(11, 8 * z)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(`DOOR ${d.link}`, b.x * z + 2, b.y * z - 12);
  }

  const list = doc.objects[level];
  ctx.font = `${Math.max(11, 8 * z)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textBaseline = "top";
  const linkedPlat = new Set(
    (link?.platforms ?? []).filter((p) => p.level === level).map((p) => p.index),
  );

  const drawCollectableMarker = (
    recType: number,
    raw: number[],
    selected: boolean,
    label: string,
    color: string,
  ) => {
    const a = anchorOf(recType, raw);
    if (!a) return;
    // Pixel Y is feet/origin; draw a 16×16 box centered on the column, top near Y.
    const x = a.x * z;
    const y = a.y * z;
    ctx.lineWidth = selected ? 3 : 2;
    ctx.strokeStyle = selected ? "#fff4c2" : color;
    ctx.fillStyle = selected ? "rgba(255, 244, 194, 0.45)" : "rgba(0,0,0,0.35)";
    ctx.fillRect(x + 1, y + 1, 16 * z - 2, 16 * z - 2);
    ctx.strokeRect(x + 0.5, y + 0.5, 16 * z - 1, 16 * z - 1);
    ctx.fillStyle = color;
    ctx.fillText(label, x + 3, y + 2);
  };

  // Collectables (KEY/SECRET/MARION): always drawn — not gated by Objects checkbox.
  list.forEach((rec, i) => {
    if (!COLLECTABLE_TYPES.has(rec.type)) return;
    if (opts.hidden.has(rec.type)) return;
    if (!showType(rec.type)) return;
    const raw = readRaw(doc, rec);
    const kind = kindOf(rec.type);
    let label = kind.short;
    if (rec.type === 5) {
      const info = describeKeyLink(doc, raw[5] ?? 0, doors);
      label = `K ${keyLinkShort(info)}`;
    }
    drawCollectableMarker(rec.type, raw, opts.selected === i, label, kind.color);
  });

  if (opts.objects) {
    list.forEach((rec, i) => {
      if (COLLECTABLE_TYPES.has(rec.type)) return; // already drawn
      if (opts.hidden.has(rec.type)) return;
      if (!showType(rec.type)) return;
      const raw = readRaw(doc, rec);
      const kind = kindOf(rec.type);
      const selected = opts.selected === i;
      const linked = linkedPlat.has(i);
      let color = kind.color;
      if ((rec.type === 2 && animKinds.has("archers")) || (rec.type === 6 && animKinds.has("cannons"))) {
        const p = pulsePhase(tick, 10);
        color = p > 0.5 ? "#fff4c2" : kind.color;
      }
      if (linked) color = "#ffe066";
      ctx.strokeStyle = selected || linked ? "#fff4c2" : color;
      ctx.fillStyle = color;
      ctx.lineWidth = selected || linked ? 3 : 2;

      // Enemies: real CHR sprites + standing hit box at pixel Y
      if (rec.type === 2 || rec.type === 6) {
        const box = drawEnemySprite(ctx, doc, level, rec.type, raw, z);
        if (box) {
          ctx.strokeRect(box.x * z + 0.5, box.y * z + 0.5, box.w * z - 1, box.h * z - 1);
          ctx.fillText(kind.short, box.x * z + 2, box.y * z - 12);
        }
        return;
      }

      const a = anchorOf(rec.type, raw);
      if (!a) return;
      const label =
        rec.type === 7
          ? `S#${raw[5] ?? 0}`
          : rec.type === 5
            ? "K"
            : kind.short;
      if (a.x2 !== undefined) {
        const x0 = Math.min(a.x, a.x2) * z;
        const x1 = Math.max(a.x, a.x2) * z;
        const y = a.y * z;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        ctx.fillRect(x0 - 3, y - 3, 6, 6);
        ctx.fillRect(x1 - 3, y - 3, 6, 6);
        ctx.fillText(linked ? `${label} ←KEY` : label, x0 + 4, y - 14);
      } else if (a.y2 !== undefined) {
        const y0 = Math.min(a.y, a.y2) * z;
        const y1 = Math.max(a.y, a.y2) * z;
        const x = a.x * z;
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
        ctx.stroke();
        ctx.fillRect(x - 3, y0 - 3, 6, 6);
        ctx.fillRect(x - 3, y1 - 3, 6, 6);
        ctx.fillText(linked ? `${label} ←KEY` : label, x + 6, y0);
      } else {
        ctx.strokeRect(a.x * z + 0.5, a.y * z + 0.5, 16 * z - 1, 16 * z - 1);
        ctx.fillText(label, a.x * z + 3, a.y * z + 2);
        if (rec.type === 7) {
          ctx.fillStyle = color;
          ctx.fillText(secretShort(raw[5] ?? 0), a.x * z + 3, a.y * z + 14 * z);
        }
      }
    });
  }

  // Robin — start spawn and/or exit-arrival preview (arrow marks direction).
  if (!filtering || layers.robin) {
    const figures: {
      x: number;
      y: number;
      dir: "up" | "down" | "left" | "right" | null;
      accent: string;
    }[] = [];
    const spawn = robinSpawnOnLevel(doc, level);
    if (spawn) {
      figures.push({ x: spawn.x, y: spawn.y, dir: null, accent: "#5dce7a" });
    }
    if (opts.robinPreview) {
      figures.push({
        x: opts.robinPreview.x,
        y: opts.robinPreview.y,
        dir: opts.robinPreview.dir ?? null,
        accent: "#7ec8ff",
      });
    }
    for (const fig of figures) {
      const cx = fig.x * z;
      const cy = fig.y * z;
      const size = 14 * z;
      ctx.save();
      ctx.translate(cx, cy - 16 * z);
      ctx.fillStyle = "rgba(20, 40, 60, 0.45)";
      ctx.strokeStyle = fig.accent;
      ctx.lineWidth = Math.max(2, z);
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = fig.accent;
      ctx.beginPath();
      if (fig.dir === "up") {
        ctx.moveTo(0, -size * 0.55);
        ctx.lineTo(size * 0.45, size * 0.35);
        ctx.lineTo(-size * 0.45, size * 0.35);
      } else if (fig.dir === "down") {
        ctx.moveTo(0, size * 0.55);
        ctx.lineTo(size * 0.45, -size * 0.35);
        ctx.lineTo(-size * 0.45, -size * 0.35);
      } else if (fig.dir === "left") {
        ctx.moveTo(-size * 0.55, 0);
        ctx.lineTo(size * 0.35, size * 0.45);
        ctx.lineTo(size * 0.35, -size * 0.45);
      } else if (fig.dir === "right") {
        ctx.moveTo(size * 0.55, 0);
        ctx.lineTo(-size * 0.35, size * 0.45);
        ctx.lineTo(-size * 0.35, -size * 0.45);
      } else {
        // Start spawn — small diamond, no word label.
        ctx.moveTo(0, -size * 0.4);
        ctx.lineTo(size * 0.35, 0);
        ctx.lineTo(0, size * 0.4);
        ctx.lineTo(-size * 0.35, 0);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#0c0b09";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  // Treasures / hearts from coinco — always on in the editor (export can filter).
  if (opts.pickups && (!filtering || layers.treasure)) {
    ctx.font = `${Math.max(11, 8 * z)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    for (const p of opts.pickups) {
      if (p.level !== level) continue;
      const px = (p.markColumn * 16 + 8) * z;
      const py = (p.row * 16 + 8) * z;
      const fill = p.kind === "treasure" ? "#ffd23c" : "#ff5a78";
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.arc(px, py, 8 * z, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(px, py, 6 * z, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1a1208";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#1a1208";
      ctx.fillText(p.kind === "treasure" ? "T" : "♥", px, py + 1);
    }
    ctx.textAlign = "start";
  }

  // Spiders / bats / rats / heart / coin — blockrous pads (often blank CHR).
  if (doc.blockrous && (!filtering || layers.archer || layers.treasure)) {
    const pulseOn = [...SPAWN_TILES].some((k) => animKinds.has(k));
    const pulse = pulseOn ? 0.4 + 0.35 * pulsePhase(tick, 14) : 0.5;
    ctx.font = `${Math.max(10, 7 * z)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    for (let x = 0; x < map.width; x++) {
      for (let y = 0; y < MAP_HEIGHT; y++) {
        const id = doc.bytes[map.dataFileOff + x * MAP_HEIGHT + y];
        const kind = kindFromBlockrou(doc.blockrous[id]) as SpawnTileKind | null;
        if (!kind || !SPAWN_TILES.has(kind)) continue;
        if (filtering) {
          if ((kind === "heart" || kind === "coin") && !layers.treasure) continue;
          if ((kind === "spider" || kind === "bat" || kind === "rat") && !layers.archer) continue;
        }
        const px = x * 16 * z;
        const py = y * 16 * z;
        const accent = spawnTileAccent(kind);
        ctx.fillStyle = (TILE_ANIM_COLORS[kind] ?? "rgba(160,80,255,0.5)").replace(
          /[\d.]+\)$/,
          `${pulse})`,
        );
        ctx.fillRect(px, py, 16 * z, 16 * z);
        ctx.strokeStyle = accent;
        ctx.lineWidth = Math.max(1.5, z);
        ctx.strokeRect(px + 0.5, py + 0.5, 16 * z - 1, 16 * z - 1);
        ctx.fillStyle = accent;
        if (kind === "spider") {
          ctx.beginPath();
          ctx.arc(px + 8 * z, py + 8 * z, 3 * z, 0, Math.PI * 2);
          ctx.fill();
          for (const a of [-1, 1]) {
            ctx.fillRect(px + (8 + a * 5) * z, py + 5 * z, 2 * z, 6 * z);
            ctx.fillRect(px + (8 + a * 5) * z, py + 9 * z, 2 * z, 4 * z);
          }
        } else if (kind === "bat") {
          ctx.beginPath();
          ctx.moveTo(px + 8 * z, py + 10 * z);
          ctx.lineTo(px + 2 * z, py + 5 * z);
          ctx.lineTo(px + 8 * z, py + 7 * z);
          ctx.lineTo(px + 14 * z, py + 5 * z);
          ctx.closePath();
          ctx.fill();
        } else if (kind === "rat") {
          ctx.fillRect(px + 4 * z, py + 7 * z, 10 * z, 5 * z);
          ctx.fillRect(px + 12 * z, py + 5 * z, 3 * z, 3 * z);
        } else if (kind === "heart") {
          ctx.beginPath();
          ctx.moveTo(px + 8 * z, py + 12 * z);
          ctx.bezierCurveTo(px + 2 * z, py + 8 * z, px + 2 * z, py + 4 * z, px + 8 * z, py + 6 * z);
          ctx.bezierCurveTo(px + 14 * z, py + 4 * z, px + 14 * z, py + 8 * z, px + 8 * z, py + 12 * z);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(px + 8 * z, py + 8 * z, 5 * z, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#1a1208";
          ctx.font = `bold ${Math.max(9, 6 * z)}px ui-sans-serif, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("$", px + 8 * z, py + 8 * z + 1);
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          ctx.fillStyle = accent;
        }
        ctx.fillStyle = accent;
        ctx.fillText(spawnTileLabel(kind).toUpperCase(), px + 1, py - 10);
      }
    }
  }
}

/** One metatile, for the tile palette. */
export function renderMetatile(doc: RomDoc, level: number, id: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const rgba = new Uint8ClampedArray(16 * 16 * 4);
  const map = doc.maps[level];
  const pattern = doc.patternFor(level);
  const p = (doc.blocks.attr[id] >> 2) & 3;
  const pal = [0, 1, 2, 3].map((i) => nesColor(map.palette[p * 4 + i]));
  const { tl, tr, bl, br } = doc.blocks;
  blitTile(rgba, 16, pattern, tl[id], 0, 0, pal);
  blitTile(rgba, 16, pattern, tr[id], 8, 0, pal);
  blitTile(rgba, 16, pattern, bl[id], 0, 8, pal);
  blitTile(rgba, 16, pattern, br[id], 8, 8, pal);
  const ctx = canvas.getContext("2d")!;
  const pixels = new Uint8ClampedArray(new ArrayBuffer(rgba.byteLength));
  pixels.set(rgba);
  ctx.putImageData(new ImageData(pixels, 16, 16), 0, 0);
  return canvas;
}
