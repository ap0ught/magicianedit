import type { Plugin, PreviewServer } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const romsDir = path.join(here, "roms");

function ensureRomsDir(): void {
  fs.mkdirSync(romsDir, { recursive: true });
}

/** Basenames of `.nes` files in project-root `roms/` (sorted). */
export function listRoms(): string[] {
  ensureRomsDir();
  return fs
    .readdirSync(romsDir)
    .filter((name) => {
      if (!/\.nes$/i.test(name)) return false;
      try {
        return fs.statSync(path.join(romsDir, name)).isFile();
      } catch {
        return false;
      }
    })
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function isSafeRomName(name: string): boolean {
  return name === path.basename(name) && /\.nes$/i.test(name) && !name.includes("\0");
}

function writeManifestAndCopy(outDir: string): void {
  const dest = path.join(outDir, "roms");
  fs.mkdirSync(dest, { recursive: true });
  const roms = listRoms();
  for (const name of roms) {
    fs.copyFileSync(path.join(romsDir, name), path.join(dest, name));
  }
  fs.writeFileSync(path.join(dest, "manifest.json"), `${JSON.stringify({ roms }, null, 2)}\n`);
}

/**
 * Project-root `roms/*.nes`:
 * - Dev: `GET /api/roms` → `{ roms: string[] }`, static `GET /roms/<file>`
 * - Build: copy into `dist/roms/` and write `dist/roms/manifest.json`
 */
export function romsPlugin(): Plugin {
  let outDir = path.join(here, "dist");

  return {
    name: "magicianedit-roms",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      ensureRomsDir();
      server.watcher.add(romsDir);

      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";

        if (url === "/api/roms") {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify({ roms: listRoms() }));
          return;
        }

        const match = /^\/roms\/([^/]+)$/.exec(url);
        if (match) {
          let name: string;
          try {
            name = decodeURIComponent(match[1]);
          } catch {
            res.statusCode = 400;
            res.end("Bad ROM name");
            return;
          }
          if (!isSafeRomName(name)) {
            res.statusCode = 400;
            res.end("Bad ROM name");
            return;
          }
          const file = path.join(romsDir, name);
          if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
            res.statusCode = 404;
            res.end("ROM not found");
            return;
          }
          res.setHeader("Content-Type", "application/octet-stream");
          res.setHeader("Cache-Control", "no-store");
          fs.createReadStream(file).pipe(res);
          return;
        }

        next();
      });

      // Soft-reload empty-state clients when files appear/disappear under roms/
      const notify = (file: string) => {
        if (!file.startsWith(romsDir) || !/\.nes$/i.test(file)) return;
        server.ws.send({ type: "custom", event: "magicianedit:roms-changed" });
      };
      server.watcher.on("add", notify);
      server.watcher.on("unlink", notify);
    },
    closeBundle() {
      writeManifestAndCopy(outDir);
    },
    // `vite preview` has no configureServer hook from this plugin path for /api;
    // production clients use /roms/manifest.json written at build time.
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use((req, res, next) => {
        if ((req.url?.split("?")[0] ?? "") !== "/api/roms") {
          next();
          return;
        }
        // Prefer built manifest if present; else live list from source roms/
        const built = path.join(outDir, "roms", "manifest.json");
        try {
          if (fs.existsSync(built)) {
            res.setHeader("Content-Type", "application/json");
            res.end(fs.readFileSync(built));
            return;
          }
        } catch {
          /* fall through */
        }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ roms: listRoms() }));
      });
    },
  };
}
