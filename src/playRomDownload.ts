import { playRomFileName, romForPlayFromMap } from "./play.ts";
import { copyBytes, download } from "./playBridge.ts";
import type { RomDoc } from "./rom.ts";

/** True when Play should download a patched ROM instead of calling `/api/play`. */
export function playUsesRomDownload(): boolean {
  return __PLAY_ROM_DOWNLOAD__;
}

/**
 * Patch the open cart with `romForPlayFromMap` and hand the user a `.nes` file.
 * Prefers `POST /api/play-rom` (Content-Disposition attachment, no emulator).
 * If that route is absent — a static Vercel deploy — the same function runs
 * in the browser and the file is still downloaded. `/api/play` is not called.
 */
export async function downloadPlayFromMap(
  doc: RomDoc,
  level: number,
  onError: (msg: string | null) => void,
  spawn?: { x: number; y: number } | null,
): Promise<void> {
  onError(null);
  const name = playRomFileName(level);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
      "X-Play-Level": String(level),
    };
    if (spawn) {
      headers["X-Play-X"] = String(Math.round(spawn.x));
      headers["X-Play-Y"] = String(Math.round(spawn.y));
    }
    const res = await fetch("/api/play-rom", {
      method: "POST",
      headers,
      body: copyBytes(doc.bytes),
    });
    if (res.ok) {
      const payload = new Uint8Array(await res.arrayBuffer());
      if (isInes(payload)) {
        const filename = filenameFromDisposition(res.headers.get("Content-Disposition")) ?? name;
        download(payload, filename);
        return;
      }
    }
  } catch {
    /* No local Vite hook (static host). Patch below. */
  }

  try {
    download(copyBytes(romForPlayFromMap(doc, level, spawn)), name);
  } catch (err) {
    onError(err instanceof Error ? err.message : String(err));
  }
}

function isInes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 16 &&
    bytes[0] === 0x4e &&
    bytes[1] === 0x45 &&
    bytes[2] === 0x53 &&
    bytes[3] === 0x1a
  );
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="([^"]+\.nes)"/i.exec(header);
  if (!match) return null;
  const filename = match[1];
  if (filename.includes("/") || filename.includes("\\") || filename.includes("\0")) return null;
  return filename;
}
