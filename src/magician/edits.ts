/** Shared mutable-buffer edit helpers. */
import type { CellEdit, MagicianDoc } from "./document.ts";

export function writeBuffer(buf: Uint8Array, kind: CellEdit["kind"], fileOff: number, index: number, value: number): CellEdit | null {
  if (index < 0 || index >= buf.length) return null;
  const next = value & 0xff;
  const prev = buf[index];
  if (prev === next) return null;
  buf[index] = next;
  return { kind, fileOff, index, prev, next };
}

export function bufferFor(doc: MagicianDoc, edit: CellEdit): Uint8Array {
  if (edit.kind === "map") {
    const map = doc.maps.find((item) => item.fileOff === edit.fileOff);
    if (!map) throw new Error(`No map at file offset ${edit.fileOff}`);
    return map.blocks;
  }
  const pack = doc.packs.find((item) => item.kind === edit.kind && item.fileOff === edit.fileOff);
  if (!pack) throw new Error(`No ${edit.kind} pack at file offset ${edit.fileOff}`);
  return pack.bytes;
}
