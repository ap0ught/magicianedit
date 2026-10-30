import { nesColor } from "./palette.ts";
import type { RomDoc } from "./rom.ts";

/** Pixel AABB for an on-map overlay (top-left origin). */
export interface SpriteBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Guard / archer (type 2): raw[3]=column, raw[4]=pixel Y (feet).
 * SPRITESD `guardlow` / `guardhigh`: body 2×4 tiles at (−8,−32), arm tile to the right.
 * High shot when raw[6] bit 7 set.
 */
export function archerBounds(raw: number[]): SpriteBounds {
  const feetY = raw[4] ?? 0;
  const colX = (raw[3] ?? 0) * 16;
  return { x: colX - 8, y: feetY - 32, w: 24, h: 32 };
}

/**
 * Cannon (type 6): raw[2]=column, raw[3]=pixel Y.
 * SPRITESD `canons`: 3×2 tiles at (−12, 0).
 */
export function cannonBounds(raw: number[]): SpriteBounds {
  const y = raw[3] ?? 0;
  const colX = (raw[2] ?? 0) * 16;
  return { x: colX - 12, y, w: 24, h: 16 };
}

export function enemyBounds(type: number, raw: number[]): SpriteBounds | null {
  if (type === 2) return archerBounds(raw);
  if (type === 6) return cannonBounds(raw);
  return null;
}

/** Door overlay from doordata: low nibble = bottom row, high nibble = height in tiles (grows up). */
export function doorBounds(column: number, bottomRow: number, tileHeight: number): SpriteBounds {
  const h = Math.max(1, tileHeight);
  const top = Math.max(0, bottomRow - h + 1);
  return { x: column * 16, y: top * 16, w: 16, h: (bottomRow - top + 1) * 16 };
}

function blitTile(
  ctx: CanvasRenderingContext2D,
  pattern: Uint8Array,
  tile: number,
  dx: number,
  dy: number,
  z: number,
  rgb: [number, number, number][],
): void {
  const chr = (tile & 255) * 16;
  for (let row = 0; row < 8; row++) {
    const lo = pattern[chr + row] ?? 0;
    const hi = pattern[chr + row + 8] ?? 0;
    for (let col = 0; col < 8; col++) {
      const bit = 7 - col;
      const ci = (((hi >> bit) & 1) << 1) | ((lo >> bit) & 1);
      if (ci === 0) continue;
      const c = rgb[ci] ?? rgb[1];
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.fillRect((dx + col) * z, (dy + row) * z, z, z);
    }
  }
}

function frameTiles(header: number, ids: number[]): { w: number; h: number; tiles: number[] } {
  return { w: (header >> 4) & 15, h: header & 15, tiles: ids };
}

/** Guard body + bow from SPRITESD.DAT (standing / firing pose). */
function guardFrame(high: boolean): { body: ReturnType<typeof frameTiles>; armTile: number; armY: number } {
  if (high) {
    return {
      body: frameTiles(0x24, [0xe4, 0xe5, 0xed, 0xee, 0xef, 0xf0, 0xea, 0xeb]),
      armTile: 0xf1,
      armY: -24,
    };
  }
  return {
    body: frameTiles(0x24, [0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xeb]),
    armTile: 0xec,
    armY: -18,
  };
}

const CANON = frameTiles(0x32, [0xb7, 0xb8, 0xb9, 0xba, 0xbb, 0xbc]);

/** Sprite-ish palette: BG set 0 (game loads matching sprite tones per map). */
function spriteRgb(doc: RomDoc, level: number): [number, number, number][] {
  const pal = doc.maps[level]?.palette;
  return [0, 1, 2, 3].map((i) => nesColor(pal?.[i] ?? (i === 0 ? 0x0e : 0x30 - i * 0x10)));
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  pattern: Uint8Array,
  originX: number,
  originY: number,
  ox: number,
  oy: number,
  frame: { w: number; h: number; tiles: number[] },
  z: number,
  rgb: [number, number, number][],
): void {
  let i = 0;
  for (let ty = 0; ty < frame.h; ty++) {
    for (let tx = 0; tx < frame.w; tx++) {
      const tile = frame.tiles[i++] ?? 0;
      blitTile(ctx, pattern, tile, originX + ox + tx * 8, originY + oy + ty * 8, z, rgb);
    }
  }
}

/** Blit archer/cannon NES CHR into the level canvas at game sprite offsets. */
export function drawEnemySprite(
  ctx: CanvasRenderingContext2D,
  doc: RomDoc,
  level: number,
  type: number,
  raw: number[],
  zoom: number,
): SpriteBounds | null {
  const pattern = doc.patternFor(level);
  const rgb = spriteRgb(doc, level);
  const z = zoom;

  if (type === 2) {
    const feetY = raw[4] ?? 0;
    const colX = (raw[3] ?? 0) * 16;
    const high = ((raw[6] ?? 0) & 0x80) !== 0;
    const { body, armTile, armY } = guardFrame(high);
    drawFrame(ctx, pattern, colX, feetY, -8, -32, body, z, rgb);
    blitTile(ctx, pattern, armTile, colX + 8, feetY + armY, z, rgb);
    return archerBounds(raw);
  }

  if (type === 6) {
    const y = raw[3] ?? 0;
    const colX = (raw[2] ?? 0) * 16;
    drawFrame(ctx, pattern, colX, y, -12, 0, CANON, z, rgb);
    return cannonBounds(raw);
  }

  return null;
}
