/** Title/password/panel scene detection and write guards. */

import {
  INES_HEADER,
  PAN_DAT_BYTES,
  PRG_BYTES,
  PW_DAT_BYTES,
  TIT_DAT_BYTES,
  rangesOverlap,
} from "./format.ts";
import type { TitleScene } from "./document.ts";

export class SceneLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SceneLoadError";
  }
}

/** Find the packed TIT.DAT, PW.DAT, and PAN.DAT span, if present. */
export function findScene(rom: Uint8Array): TitleScene | null {
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

/** Refuse to load a pack that overlaps the title scene. */
export function refuseScene(scene: TitleScene | null, off: number, length: number): void {
  if (!scene) return;
  const span = TIT_DAT_BYTES + PW_DAT_BYTES + PAN_DAT_BYTES;
  if (rangesOverlap(off, length, scene.titOff, span)) {
    throw new SceneLoadError("MagicianEdit will not load the title, password, or panel scene as a level pack.");
  }
}

/** Refuse a save that would overwrite the title scene. */
export function guardScene(doc: { scene: TitleScene | null }, off: number, length: number): void {
  if (!doc.scene) return;
  const span = TIT_DAT_BYTES + PW_DAT_BYTES + PAN_DAT_BYTES;
  if (rangesOverlap(off, length, doc.scene.titOff, span)) {
    throw new Error("MagicianEdit refused to write the title, password, or panel scene.");
  }
}
