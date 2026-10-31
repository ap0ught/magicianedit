/**
 * `npm run play` — boot the Vite dev server in `play-rom` mode.
 *
 * That mode loads `playRomDownload` (`vite.play-rom.ts`): its `configureServer`
 * hook serves `POST /api/play-rom`, and the Play button downloads that
 * attachment instead of calling `/api/play`. The FCEUX bridge stays registered.
 */
import { createServer } from "vite";

const port = Number(process.env.PORT);
const server = await createServer({
  mode: "play-rom",
  server: {
    host: process.env.HOST || "127.0.0.1",
    port: Number.isFinite(port) && port > 0 ? port : 5173,
  },
});

const names = server.config.plugins.map((plugin) => plugin.name);
if (!names.includes("srh-play-rom")) {
  await server.close();
  throw new Error("srh-play-rom plugin did not load");
}
if (!names.includes("srh-play-bridge")) {
  await server.close();
  throw new Error("srh-play-bridge plugin is missing (/api/play)");
}

await server.listen();
server.printUrls();
const local = server.resolvedUrls?.local[0] ?? `http://127.0.0.1:${server.config.server.port}/`;
console.log(`Play ROM download: POST ${local}api/play-rom`);
