import { renderLevelRGBA } from "./draw.ts";
import { LEVELS, MAP_HEIGHT, type RomDoc } from "./rom.ts";

export interface WorldLayout {
  /** Pixels per map column (and per map row). */
  scale: number;
  worldCols: number;
  tiers: number;
  width: number;
  height: number;
}

/** Pixel size of the multi-strip castle overview canvas. */
export function worldLayout(doc: RomDoc, scale = 2): WorldLayout {
  let worldCols = 0;
  let tiers = 0;
  for (const map of doc.maps) {
    worldCols = Math.max(worldCols, map.worldX + map.width);
    tiers = Math.max(tiers, map.height + 1);
  }
  return {
    scale,
    worldCols,
    tiers,
    width: worldCols * scale,
    height: tiers * MAP_HEIGHT * scale,
  };
}

/** Draw every map strip into one castle overview, live from current ROM bytes. */
export function paintWorldOverview(
  ctx: CanvasRenderingContext2D,
  doc: RomDoc,
  opts: { scale?: number; selected?: number | null; rev?: number } = {},
): WorldLayout {
  void opts.rev;
  const layout = worldLayout(doc, opts.scale ?? 2);
  const { scale, width, height, tiers } = layout;
  ctx.canvas.width = width;
  ctx.canvas.height = height;
  ctx.fillStyle = "#0a1624";
  ctx.fillRect(0, 0, width, height);

  // Soft sky gradient for empty space above the castle.
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#1a4a7a");
  sky.addColorStop(0.35, "#0f2a44");
  sky.addColorStop(1, "#0a1624");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  doc.maps.forEach((map, index) => {
    const img = renderLevelRGBA(doc, index);
    const off = document.createElement("canvas");
    off.width = img.w;
    off.height = img.h;
    const pixels = new Uint8ClampedArray(new ArrayBuffer(img.rgba.byteLength));
    pixels.set(img.rgba);
    off.getContext("2d")!.putImageData(new ImageData(pixels, img.w, img.h), 0, 0);

    const x = map.worldX * scale;
    const y = (tiers - 1 - map.height) * MAP_HEIGHT * scale;
    const w = map.width * scale;
    const h = MAP_HEIGHT * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, x, y, w, h);

    if (opts.selected === index) {
      ctx.strokeStyle = "#fff4c2";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    } else {
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
  });

  return layout;
}

export interface OverviewHit {
  level: number;
  /** Column within the selected map. */
  column: number;
  label: string;
}

/** Hit-test a click on the overview canvas. */
export function hitWorldOverview(
  doc: RomDoc,
  layout: WorldLayout,
  px: number,
  py: number,
): OverviewHit | null {
  const { scale, tiers } = layout;
  const worldCol = Math.floor(px / scale);
  const tierFromTop = Math.floor(py / (MAP_HEIGHT * scale));
  const height = tiers - 1 - tierFromTop;
  if (height < 0 || worldCol < 0) return null;

  // Prefer the selected strip that contains this column at this height.
  // If several share a height band, the one covering worldCol wins.
  for (let i = doc.maps.length - 1; i >= 0; i--) {
    const map = doc.maps[i];
    if (map.height !== height) continue;
    if (worldCol < map.worldX || worldCol >= map.worldX + map.width) continue;
    return {
      level: i,
      column: worldCol - map.worldX,
      label: `${LEVELS[i].name} · ${LEVELS[i].area}`,
    };
  }
  return null;
}
