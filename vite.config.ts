import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { playBridge } from "./vite.play-bridge.ts";
import { playRomDownload } from "./vite.play-rom.ts";
import { romsPlugin } from "./vite.roms.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command, mode }) => ({
  plugins: [react(), playBridge(), playRomDownload(), romsPlugin()],
  server: { fs: { allow: [here] } },
  define: {
    __SAMPLE_ROMS__: JSON.stringify([
      { label: "Inherited mapper 71", file: "/asia.nes" },
      { label: "Inherited rebuild", file: "/rebuilt.nes" },
    ]),
    // Production (Vercel) and `npm run play` download a patched ROM.
    // Plain `vite` / `make` still launches FCEUX through `/api/play`.
    __PLAY_ROM_DOWNLOAD__: JSON.stringify(command === "build" || mode === "play-rom"),
  },
}));
