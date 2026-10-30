import { MAP_HEIGHT, type ObjRec, type RomDoc } from "./rom.ts";
import { enemyBounds } from "./sprites.ts";

export interface Kind {
  id: number;
  name: string;
  short: string;
  color: string;
}

/** Labels match eng.ini object panel titles from RobinEdit 0.4.4. */
export const KINDS: Kind[] = [
  { id: 1, name: "FLASH BLOCK", short: "F", color: "#f0d24a" },
  { id: 2, name: "ARCHER", short: "A", color: "#e15a4a" },
  { id: 3, name: "PLATFORM", short: "H", color: "#4aa3e0" },
  { id: 4, name: "PLATFORM", short: "V", color: "#7d8cff" },
  { id: 5, name: "KEY", short: "K", color: "#e0b15a" },
  { id: 6, name: "CANNON", short: "C", color: "#e07a3a" },
  { id: 7, name: "SECRET", short: "S", color: "#c47ad4" },
  { id: 8, name: "MARION", short: "M", color: "#ef87b2" },
  { id: 9, name: "WATER", short: "W", color: "#3ec6d4" },
];

/** Look up the eng.ini-style label / color for an object type byte. */
export function kindOf(type: number): Kind {
  return KINDS.find((k) => k.id === type) ?? { id: type, name: `Type ${type}`, short: "?", color: "#ffffff" };
}

/** Copy the packed object record bytes from the ROM. */
export function readRaw(doc: RomDoc, rec: ObjRec): number[] {
  return Array.from(doc.bytes.subarray(rec.fileOff, rec.fileOff + rec.length));
}

export interface Anchor {
  x: number;
  y: number;
  /** Second point for a horizontal platform (pixel x) or a lift (pixel y). */
  x2?: number;
  y2?: number;
}

/** Pixel anchor. Column-based objects sit on a 16px grid; y is already pixels except flash blocks. */
export function anchorOf(type: number, raw: number[]): Anchor | null {
  if (type === 1) return { x: raw[2] * 16, y: (raw[3] & 31) * 16 };
  if (type === 2) return { x: raw[3] * 16, y: raw[4] };
  if (type === 3) {
    const min = raw[3] | (raw[4] << 8);
    const max = raw[5] | (raw[6] << 8);
    return { x: min, y: raw[7], x2: max };
  }
  if (type === 4) {
    const x = raw[3] | (raw[4] << 8);
    return { x, y: raw[7], y2: raw[6] };
  }
  if (type === 5 || type === 7 || type === 8) return { x: raw[3] * 16, y: raw[4] };
  if (type === 6) return { x: raw[2] * 16, y: raw[3] };
  return null;
}

/** Round and clamp a number into [lo, hi]. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/** Shift an object by a pixel delta, snapped the way that object stores its position. */
export function moveObject(type: number, raw: number[], dx: number, dy: number, width: number): void {
  const col = (n: number) => clamp(n, 0, width - 1);
  const pix = (n: number) => clamp(n, 0, 255);
  const wide = (n: number) => clamp(n, 0, 0xffff);
  if (type === 1) {
    raw[2] = col(raw[2] + dx / 16);
    raw[3] = (raw[3] & 0x80) | clamp((raw[3] & 31) + dy / 16, 0, MAP_HEIGHT - 1);
  } else if (type === 2) {
    raw[3] = col(raw[3] + dx / 16);
    raw[4] = pix(raw[4] + dy);
  } else if (type === 3) {
    const min = wide((raw[3] | (raw[4] << 8)) + dx);
    const max = wide((raw[5] | (raw[6] << 8)) + dx);
    raw[3] = min & 255;
    raw[4] = min >> 8;
    raw[5] = max & 255;
    raw[6] = max >> 8;
    raw[7] = pix(raw[7] + dy);
  } else if (type === 4) {
    const x = wide((raw[3] | (raw[4] << 8)) + dx);
    raw[3] = x & 255;
    raw[4] = x >> 8;
    raw[6] = pix(raw[6] + dy);
    raw[7] = pix(raw[7] + dy);
  } else if (type === 5 || type === 7 || type === 8) {
    raw[3] = col(raw[3] + dx / 16);
    raw[4] = pix(raw[4] + dy);
  } else if (type === 6) {
    raw[2] = col(raw[2] + dx / 16);
    raw[3] = pix(raw[3] + dy);
  }
}

/** Topmost object index under a pixel, respecting the hidden-type set. */
export function hitObject(
  doc: RomDoc,
  level: number,
  px: number,
  py: number,
  hidden: Set<number>,
): number | null {
  const list = doc.objects[level];
  for (let i = list.length - 1; i >= 0; i--) {
    const rec = list[i];
    if (hidden.has(rec.type)) continue;
    const raw = readRaw(doc, rec);
    const enemy = enemyBounds(rec.type, raw);
    if (enemy) {
      if (
        px >= enemy.x &&
        px < enemy.x + enemy.w &&
        py >= enemy.y &&
        py < enemy.y + enemy.h
      ) {
        return i;
      }
      continue;
    }
    const a = anchorOf(rec.type, raw);
    if (!a) continue;
    if (a.x2 !== undefined) {
      const x0 = Math.min(a.x, a.x2);
      const x1 = Math.max(a.x, a.x2);
      if (px >= x0 - 6 && px <= x1 + 6 && Math.abs(py - a.y) <= 10) return i;
    } else if (a.y2 !== undefined) {
      const y0 = Math.min(a.y, a.y2);
      const y1 = Math.max(a.y, a.y2);
      if (py >= y0 - 6 && py <= y1 + 6 && Math.abs(px - a.x) <= 10) return i;
    } else if (px >= a.x - 2 && px < a.x + 18 && py >= a.y - 2 && py < a.y + 18) {
      return i;
    }
  }
  return null;
}

/** Interpret a byte as signed (−128…127). */
export function signed(n: number): number {
  return n < 128 ? n : n - 256;
}

/** Fold a signed value into an unsigned byte (0…255). */
export function unsigned(n: number): number {
  return n < 0 ? n + 256 : n;
}
