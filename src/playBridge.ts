import { playRomFileName, romForPlayFromMap } from "./play.ts";
import type { RomDoc } from "./rom.ts";

/** Detached ArrayBuffer copy safe for Blob / download. */
export function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

/** Patch startlevel + Robin spawn, then ask the Vite play bridge to open FCEUX. */
export async function playFromMap(
  doc: RomDoc,
  level: number,
  onError: (msg: string | null) => void,
  spawn?: { x: number; y: number } | null,
): Promise<void> {
  onError(null);
  try {
    const patched = romForPlayFromMap(doc, level, spawn);
    const name = playRomFileName(level);
    const res = await fetch("/api/play", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Play-Label": name.replace(/\.nes$/i, ""),
      },
      body: copyBytes(patched),
    });
    if (!res.ok) {
      const detail = await res.text();
      // Fallback: still hand the user a bootable ROM if the bridge is down.
      download(copyBytes(patched), name);
      throw new Error(
        detail ||
          `Play bridge failed (${res.status}). Downloaded ${name} — open it in FCEUX.`,
      );
    }
  } catch (err) {
    if (err instanceof TypeError) {
      try {
        const patched = romForPlayFromMap(doc, level, spawn);
        download(copyBytes(patched), playRomFileName(level));
      } catch {
        /* ignore secondary failure */
      }
      onError(
        "Play bridge unreachable (is `make` / Vite running?). Downloaded a patched ROM instead.",
      );
      return;
    }
    onError(err instanceof Error ? err.message : String(err));
  }
}

/** Trigger a browser download of the given blob data. */
export function download(data: BlobPart, name: string) {
  const blob = data instanceof Blob ? data : new Blob([data]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export interface SavePicker {
  (opts: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }): Promise<{
    createWritable: () => Promise<{
      write: (data: BufferSource) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}
