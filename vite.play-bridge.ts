import type { Plugin } from "vite";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const playDir = path.join(here, ".play");

function healFceuxAutoload(): void {
  // --loadstate N persists into ~/.fceux/fceux.cfg. Values 0–9 mean "load that
  // slot on open"; a missing slot yields the blank bar screen. 99 = disabled.
  const cfg = path.join(os.homedir(), ".fceux", "fceux.cfg");
  try {
    if (!fs.existsSync(cfg)) return;
    const text = fs.readFileSync(cfg, "utf8");
    const next = text.replace(/^SDL\.AutoLoadState = .*$/m, "SDL.AutoLoadState = 99");
    if (next !== text) fs.writeFileSync(cfg, next);
  } catch {
    /* ignore */
  }
}

function killFceux(): void {
  try {
    execFileSync("pkill", ["-x", "fceux"], { stdio: "ignore" });
  } catch {
    /* no process */
  }
}

/**
 * Dev-only bridge: POST /api/play with a raw .nes body → write `.play/*.nes`
 * → open with the desktop handler (xdg-open → fceux). Avoids --loadstate, which
 * rewrites AutoLoadState and can blank the emulator window.
 */
export function playBridge(): Plugin {
  return {
    name: "srh-play-bridge",
    configureServer(server) {
      server.middlewares.use("/api/play", (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }

        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          try {
            const body = Buffer.concat(chunks);
            if (body.length < 16 || body[0] !== 0x4e || body[1] !== 0x45 || body[2] !== 0x53) {
              res.statusCode = 400;
              res.end("Expected an iNES ROM body");
              return;
            }

            fs.mkdirSync(playDir, { recursive: true });
            const label = String(req.headers["x-play-label"] ?? "map").replace(/[^\w.-]+/g, "_");
            const file = path.join(playDir, `${label}.nes`);
            fs.writeFileSync(file, body);
            fs.writeFileSync(path.join(playDir, "current.nes"), body);

            healFceuxAutoload();
            killFceux();

            const emu = process.env.SRH_EMULATOR?.trim() || "";
            const env = {
              ...process.env,
              // Prefer X11 for the Qt build when Wayland plugins mis-init a blank surface.
              QT_QPA_PLATFORM: process.env.QT_QPA_PLATFORM || "xcb",
              SDL_VIDEODRIVER: process.env.SDL_VIDEODRIVER || "x11",
            };

            let launched: string;
            if (emu) {
              spawn(emu, [file], { detached: true, stdio: "ignore", env }).unref();
              launched = `${emu} ${file}`;
            } else {
              // xdg-open uses the same mime path as double-clicking the .nes in a file manager.
              const opener = spawn("xdg-open", [file], { detached: true, stdio: "ignore", env });
              opener.on("error", () => {
                spawn("fceux", [file], { detached: true, stdio: "ignore", env }).unref();
              });
              opener.unref();
              launched = `xdg-open ${file}`;
            }

            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                ok: true,
                launched,
                file,
                bytes: body.length,
                note: "Title skipped — should drop into the chosen map.",
              }),
            );
          } catch (err) {
            res.statusCode = 500;
            res.end(err instanceof Error ? err.message : String(err));
          }
        });
      });
    },
  };
}
