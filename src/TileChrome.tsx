import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  spawnTileAccent,
  spawnTileEntries,
  spawnTileLabel,
  spawnTileOf,
  spawnTileShort,
} from "./anim.ts";
import { renderMetatile } from "./draw.ts";
import {
  describeSolid,
  exitChipLabel,
  exitsAtColumn,
  exitsUsingTile,
  mergeExits,
} from "./exits.ts";
import { nesColor } from "./palette.ts";
import type { RomDoc } from "./rom.ts";
import {
  PAL_SETS,
  chrSetName,
  describeChrPacks,
  orderedChrSets,
} from "./settings.ts";

/** CSS `rgb()` string for an NES palette index. */
export function nesColorCss(index: number): string {
  const [r, g, b] = nesColor(index);
  return `${r},${g},${b}`;
}

/** Fixed corner preview of the active / hovered metatile. */
export const TILE_PREVIEW = 96;

export const MAG_SWATCH = 64;

export const MAG_OFFSET = 14;

/** Keep a fixed-size magnifier on-screen near the cursor. */
export function magnifierStyle(clientX: number, clientY: number, size: number): React.CSSProperties {
  let left = clientX + MAG_OFFSET;
  let top = clientY + MAG_OFFSET;
  if (left + size > window.innerWidth - 8) left = clientX - size - MAG_OFFSET;
  if (top + size > window.innerHeight - 8) top = clientY - size - MAG_OFFSET;
  return {
    left: Math.max(8, left),
    top: Math.max(8, top),
    width: size,
    height: size,
  };
}

/** First content module in the sidebar — level palette select + swatches. */
export function PaletteModule({
  doc,
  level,
  onPalette,
}: {
  doc: RomDoc;
  level: number;
  onPalette: (palIndex: number) => void;
}) {
  const map = doc.maps[level];
  const [mag, setMag] = useState<{
    color: number;
    slot: number;
    x: number;
    y: number;
  } | null>(null);

  const setName =
    PAL_SETS.find((p) => p.index === map.palIndex)?.name ?? `Custom (${map.palIndex})`;

  return (
    <details className="palette-module side-fold">
      <summary className="chr-set-head">
        <strong>Palette</strong>
        <span className="muted">
          {setName} · {map.palIndex}
        </span>
      </summary>
      <label className="field palette-select">
        <span>Set</span>
        <select value={map.palIndex} onChange={(e) => onPalette(Number(e.target.value))}>
          {PAL_SETS.map((p) => (
            <option key={p.index} value={p.index}>
              {p.name}
            </option>
          ))}
          {!PAL_SETS.some((p) => p.index === map.palIndex) && (
            <option value={map.palIndex}>Custom ({map.palIndex})</option>
          )}
        </select>
      </label>
      <div
        className="pal-swatches"
        aria-label="Active palette (16 NES colors)"
        onMouseLeave={() => setMag(null)}
      >
        {Array.from(map.palette).map((c, i) => (
          <span
            key={i}
            className="pal-swatch"
            style={{ background: `rgb(${nesColorCss(c)})` }}
            aria-label={`$${c.toString(16).padStart(2, "0")}`}
            onMouseEnter={(e) =>
              setMag({ color: c, slot: i, x: e.clientX, y: e.clientY })
            }
            onMouseMove={(e) =>
              setMag({ color: c, slot: i, x: e.clientX, y: e.clientY })
            }
          />
        ))}
      </div>
      {mag &&
        createPortal(
          <div
            className="palette-magnifier swatch-magnifier"
            style={magnifierStyle(mag.x, mag.y, MAG_SWATCH)}
            aria-hidden
          >
            <span
              className="swatch-magnifier-chip"
              style={{ background: `rgb(${nesColorCss(mag.color)})` }}
            />
            <span className="palette-magnifier-label">
              #{mag.slot} · ${mag.color.toString(16).padStart(2, "0").toUpperCase()}
            </span>
          </div>,
          document.body,
        )}
    </details>
  );
}

/** Metatile picker + corner magnifier for the paint tool. */
export function TilePanel({
  doc,
  level,
  tile,
  pickColumn,
  rev,
  onPick,
}: {
  doc: RomDoc;
  level: number;
  tile: number;
  /** Column of a map right-click pick; keeps shaft exit context for non-rim tiles. */
  pickColumn: number | null;
  rev: number;
  onPick: (id: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const scale = 2;
  /** Hover overrides the corner preview; null → show selected paint tile. */
  const [hoverId, setHoverId] = useState<number | null>(null);
  void rev;

  const previewId = hoverId ?? tile;
  const spawnEntries = useMemo(() => spawnTileEntries(doc.blockrous), [doc]);
  const previewSpawn = spawnTileOf(doc.blockrous, previewId);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = 16 * 16 * scale;
    canvas.height = 16 * 16 * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    for (let id = 0; id < 256; id++) {
      const dx = (id % 16) * 16 * scale;
      const dy = Math.floor(id / 16) * 16 * scale;
      ctx.drawImage(renderMetatile(doc, level, id), dx, dy, 16 * scale, 16 * scale);
      const spawn = spawnTileOf(doc.blockrous, id);
      if (spawn) {
        const accent = spawnTileAccent(spawn);
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(dx, dy + 16 * scale - 10, 16 * scale, 10);
        ctx.fillStyle = accent;
        ctx.font = "bold 8px ui-sans-serif, system-ui, sans-serif";
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        ctx.fillText(spawnTileShort(spawn), dx + 8 * scale, dy + 16 * scale - 5);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(dx + 1, dy + 1, 16 * scale - 2, 16 * scale - 2);
      }
    }
    ctx.strokeStyle = "#fff4c2";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      (tile % 16) * 16 * scale + 1,
      Math.floor(tile / 16) * 16 * scale + 1,
      16 * scale - 2,
      16 * scale - 2,
    );
  }, [doc, level, tile, rev]);

  useLayoutEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    canvas.width = TILE_PREVIEW;
    canvas.height = TILE_PREVIEW;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, TILE_PREVIEW, TILE_PREVIEW);
    ctx.drawImage(renderMetatile(doc, level, previewId), 0, 0, TILE_PREVIEW, TILE_PREVIEW);
  }, [previewId, doc, level, rev]);

  /** Metatile id under the pointer in the tile-palette canvas. */
  function tileIdAt(e: React.MouseEvent<HTMLCanvasElement>): number | null {
    const canvas = e.currentTarget;
    const sx = canvas.width / Math.max(1, canvas.clientWidth);
    const sy = canvas.height / Math.max(1, canvas.clientHeight);
    const x = e.nativeEvent.offsetX * sx;
    const y = e.nativeEvent.offsetY * sy;
    const id = Math.floor(x / (16 * scale)) + Math.floor(y / (16 * scale)) * 16;
    return id >= 0 && id < 256 ? id : null;
  }

  const solid = doc.blocks.solid[previewId];
  const hovering = hoverId !== null && hoverId !== tile;
  const collision =
    describeSolid(solid) === "passable" && previewId === 0
      ? "air"
      : describeSolid(solid);
  const spawnNote = previewSpawn ? ` · ${spawnTileLabel(previewSpawn)} spawn` : "";
  const tileExits = useMemo(() => {
    const rim = exitsUsingTile(doc, level, previewId);
    // Right-click pick: keep the shaft exit even when the cell is mid-column masonry
    // (e.g. $27 in a ladder shaft) rather than the rim ladder tile.
    const fromPick =
      !hovering && pickColumn !== null && previewId === tile
        ? exitsAtColumn(doc, level, pickColumn)
        : [];
    return mergeExits(rim, fromPick);
  }, [doc, level, previewId, tile, pickColumn, hovering, rev]);
  const exitNote =
    tileExits.length > 0
      ? ` · ${tileExits.map(exitChipLabel).join(" · ")}`
      : "";
  return (
    <div className="panel tile-panel">
      <div className="tile-panel-head">
        <div className="tile-panel-meta">
          <h2>Background</h2>
          <p className="muted tile-panel-status" title={tileExits.map(exitChipLabel).join("\n")}>
            Tile ${previewId.toString(16).toUpperCase().padStart(2, "0")} ({previewId})
            {" · "}
            {collision}
            {spawnNote}
            {exitNote}
            {hovering ? " · peek" : ""}
          </p>
        </div>
        <div
          className={`tile-preview${hovering ? " peek" : ""}`}
          title={
            hovering
              ? `Hover preview $${previewId.toString(16).toUpperCase().padStart(2, "0")}`
              : `Selected paint tile $${tile.toString(16).toUpperCase().padStart(2, "0")}`
          }
        >
          <canvas ref={previewRef} width={TILE_PREVIEW} height={TILE_PREVIEW} />
        </div>
      </div>
      {spawnEntries.length > 0 && (
        <div className="ambient-tile-picks">
          <span className="muted">Spawn tiles (often blank CHR)</span>
          {spawnEntries.map(({ kind, id }) => (
            <button
              key={kind}
              type="button"
              className={tile === id ? "on" : ""}
              title={`Select tile $${id.toString(16).toUpperCase()} — paint to place ${kind}`}
              onClick={() => onPick(id)}
            >
              {spawnTileLabel(kind)} ${id.toString(16).toUpperCase()}
            </button>
          ))}
        </div>
      )}
      <div className="palette-scroll">
        <canvas
          ref={ref}
          onClick={(e) => {
            const id = tileIdAt(e);
            if (id !== null) onPick(id);
          }}
          onMouseMove={(e) => {
            const id = tileIdAt(e);
            setHoverId(id);
          }}
          onMouseLeave={() => setHoverId(null)}
        />
      </div>
      <p className="hint">
        Left drag paints. Right click picks up a block. Heart / spider / bat / rat / coin are
        special background tiles (blank art in CHR) — use the buttons above, then paint.
      </p>
    </div>
  );
}

/** CHR set switcher — active mapchrsdefs list pinned first; shows loaded pack slots. */
export function ChrSetPanel({
  doc,
  level,
  onChr,
}: {
  doc: RomDoc;
  level: number;
  onChr: (chrIndex: number) => void;
}) {
  const map = doc.maps[level];
  const sets = orderedChrSets(map.chrIndex);
  const packs = describeChrPacks(doc, level);
  return (
    <details className="chr-set-panel side-fold">
      <summary className="chr-set-head">
        <strong>CHR set</strong>
        <span className="chr-active-badge" title={`mapinfo chrIndex = ${map.chrIndex}`}>
          Active · {chrSetName(map.chrIndex)}
        </span>
      </summary>
      <ul className="chr-set-list">
        {sets.map((c) => (
          <li key={c.index}>
            <button
              type="button"
              className={c.active ? "on" : ""}
              onClick={() => onChr(c.index)}
              title={`mapchrsdefs offset ${c.index}`}
            >
              {c.active ? "★ " : ""}
              {c.name}
              <span>#{c.index}</span>
            </button>
          </li>
        ))}
      </ul>
      <label className="field">
        <span>Switch set</span>
        <select value={map.chrIndex} onChange={(e) => onChr(Number(e.target.value))}>
          {sets.map((c) => (
            <option key={c.index} value={c.index}>
              {c.active ? `★ ${c.name} (active)` : c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="chr-packs">
        <span className="muted">Loaded packs (chrList)</span>
        {packs.length === 0 ? (
          <p className="hint">No packs in this list.</p>
        ) : (
          <ul>
            {packs.map((p) => (
              <li key={p.slot}>
                {p.tileCountHint}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="hint">
        Switching points this level at a predefined mapchrsdefs list (Dungeon / Hall / Church / Sky).
        Adding extra packs into a list would rewrite fixed ROM terminator tables — not safe here; use
        Switch set instead of “add chrset”.
      </p>
    </details>
  );
}
