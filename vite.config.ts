import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { playBridge } from "./vite.play-bridge.ts";
import { romsPlugin } from "./vite.roms.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), playBridge(), romsPlugin()],
  server: { fs: { allow: [here] } },
  define: {
    __SAMPLE_ROMS__: JSON.stringify([
      { label: "Inherited mapper 71", file: "/asia.nes" },
      { label: "Inherited rebuild", file: "/rebuilt.nes" },
    ]),
  },
});
