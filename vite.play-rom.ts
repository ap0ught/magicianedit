import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";
import { playRomFileName, romForPlayFromMap, type PlaySpawn } from "./src/play.ts";
import { LEVELS, loadRom } from "./src/rom.ts";

/** Reject carts larger than a normal iNES image (Magician / Robin are far smaller). */
const MAX_ROM_BYTES = 2 * 1024 * 1024;

/**
 * Vercel-safe Play path. `POST /api/play-rom` takes the cart the editor has
 * open plus `X-Play-Level` (optional `X-Play-X` / `X-Play-Y` spawn) and
 * returns that cart patched by `romForPlayFromMap` — the same entry patch
 * the local `/api/play` bridge launches in FCEUX.
 *
 * The response is a `.nes` attachment. This route does not write a file and
 * does not spawn an emulator, so it can run where `/api/play` cannot.
 * `/api/play` stays the localhost FCEUX/BizHawk launch used by `make`.
 *
 * Dev: `configureServer` (including `npm run play`, which forces `play-rom` mode).
 * After `vite build`: `configurePreviewServer` on `vite preview`.
 * Production bundles point Play at this download instead of `/api/play`.
 */
export function playRomDownload(): Plugin {
  const attach = (middlewares: Connect.Server) => {
    middlewares.use("/api/play-rom", playRomMiddleware());
  };

  return {
    name: "srh-play-rom",
    configureServer(server) {
      attach(server.middlewares);
    },
    configurePreviewServer(server) {
      attach(server.middlewares);
    },
  };
}

function playRomMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (req.method !== "POST") {
      next();
      return;
    }
    void handlePlayRom(req, res).catch((err: unknown) => {
      if (res.headersSent || res.writableEnded) return;
      const message = err instanceof Error ? err.message : String(err);
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(message);
    });
  };
}

async function handlePlayRom(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req);
  const level = readLevel(req.headers["x-play-level"]);
  const spawn = readSpawn(req.headers["x-play-x"], req.headers["x-play-y"]);
  const doc = loadRom(new Uint8Array(body), "open.nes");
  const patched = romForPlayFromMap(doc, level, spawn);
  const filename = playRomFileName(level);

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Length", String(patched.byteLength));
  res.end(Buffer.from(patched));
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let failed = false;
    const fail = (err: Error) => {
      if (failed) return;
      failed = true;
      reject(err);
      req.destroy();
    };
    req.on("data", (chunk: Buffer) => {
      if (failed) return;
      total += chunk.length;
      if (total > MAX_ROM_BYTES) {
        fail(new Error("ROM is too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (failed) return;
      resolve(Buffer.concat(chunks));
    });
    req.on("error", (err: Error) => fail(err));
  });
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function readLevel(value: string | string[] | undefined): number {
  const raw = headerValue(value)?.trim() ?? "";
  if (!/^\d+$/.test(raw)) throw new Error("Missing or bad X-Play-Level");
  const level = Number(raw);
  if (level < 0 || level >= LEVELS.length) throw new Error(`Bad level ${level}`);
  return level;
}

/** Pixel spawn, or null so `romForPlayFromMap` picks the floor pose. */
function readSpawn(
  xValue: string | string[] | undefined,
  yValue: string | string[] | undefined,
): PlaySpawn | null {
  const xs = headerValue(xValue)?.trim();
  const ys = headerValue(yValue)?.trim();
  if (xs === undefined && ys === undefined) return null;
  if (xs === undefined || ys === undefined) {
    throw new Error("X-Play-X and X-Play-Y must be sent together");
  }
  if (!/^\d{1,5}$/.test(xs) || !/^\d{1,5}$/.test(ys)) throw new Error("Bad play spawn");
  const x = Number(xs);
  const y = Number(ys);
  if (x > 0xffff || y > 0xffff) throw new Error("Bad play spawn");
  return { x, y };
}
