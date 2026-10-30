import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { playBridge } from "./vite.play-bridge.ts";
import { romsPlugin } from "./vite.roms.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Canonical dumps named on the empty screen. Same strings as docs/ROMS.md. */
const BETA1_ROM = "Magician (USA) (Beta 1) (1990-03-02).nes";
const USA_ROM = "Magician (USA).nes";

export default defineConfig({
  plugins: [react(), playBridge(), romsPlugin()],
  server: { fs: { allow: [here] } },
  define: {
    __SAMPLE_ROMS__: JSON.stringify([
      { label: "Beta 1 (pin)", file: `/roms/${encodeURIComponent(BETA1_ROM)}` },
      { label: "USA release", file: `/roms/${encodeURIComponent(USA_ROM)}` },
    ]),
  },
});
