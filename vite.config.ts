import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { playBridge } from "./vite.play-bridge.ts";
import { playRomDownload } from "./vite.play-rom.ts";
import { romsPlugin } from "./vite.roms.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Canonical dumps named on the empty screen. Same strings as docs/ROMS.md. */
const BETA1_ROM = "Magician (USA) (Beta 1) (1990-03-02).nes";
const USA_ROM = "Magician (USA).nes";

export default defineConfig(({ command, mode }) => ({
  plugins: [react(), playBridge(), playRomDownload(), romsPlugin()],
  server: { fs: { allow: [here] } },
  define: {
    __SAMPLE_ROMS__: JSON.stringify([
      { label: "Beta 1 (pin)", file: `/roms/${encodeURIComponent(BETA1_ROM)}` },
      { label: "USA release", file: `/roms/${encodeURIComponent(USA_ROM)}` },
    ]),
    // Production (Vercel) and `npm run play` download a patched ROM.
    // Plain `vite` / `make` still launches FCEUX through `/api/play`.
    __PLAY_ROM_DOWNLOAD__: JSON.stringify(command === "build" || mode === "play-rom"),
  },
}));
