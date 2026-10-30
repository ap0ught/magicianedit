import { useEffect, useMemo, useRef } from "react";
import { paintLevel, type GridStyle } from "./draw.ts";
import {
  describeSolid,
  exitChipLabel,
  exitsAtColumn,
  exitsUsingTile,
  mergeExits,
} from "./exits.ts";
import { describeHoverTarget } from "./hover.ts";
import { describeKeyLink, loadDoors, type KeyLinkInfo } from "./keys.ts";
import { hitObject, moveObject, readRaw } from "./objects.ts";
import type { Pickup } from "./pickups.ts";
import { MAP_HEIGHT, type Edit, type RomDoc } from "./rom.ts";

/** Zoomable level canvas — paint, object drag, hover, and exits. */
export function Stage({
  doc,
  level,
  mode,
  tile,
  zoom,
  grid,
  collision,
  markers,
  animKinds,
  animTick,
  hidden,
  selected,
  pickups,
  robinPreview,
  rev,
  focusColumn,
  onFocusHandled,
  onHover,
  onPickTile,
  onSelect,
  onPaintStroke,
  onRev,
}: {
  doc: RomDoc;
  level: number;
  mode: "bg" | "obj";
  tile: number;
  zoom: number;
  grid: GridStyle;
  collision: boolean;
  markers: boolean;
  animKinds: Set<string>;
  animTick: number;
  hidden: Set<number>;
  selected: number | null;
  pickups: Pickup[];
  robinPreview?: { x: number; y: number; dir?: "up" | "down" | "left" | "right" } | null;
  rev: number;
  focusColumn: number | null;
  onFocusHandled: () => void;
  onHover: (text: string) => void;
  onPickTile: (id: number, column: number) => void;
  onSelect: (index: number | null) => void;
  onPaintStroke: (edits: Edit[]) => void;
  onRev: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stroke = useRef<Edit[] | null>(null);
  const drag = useRef<{ index: number; px: number; py: number; orig: number[] } | null>(null);

  const doors = useMemo(() => loadDoors(doc), [doc, rev]);
  const keyLink = useMemo((): KeyLinkInfo | null => {
    if (selected === null) return null;
    const rec = doc.objects[level][selected];
    if (!rec || rec.type !== 5) return null;
    return describeKeyLink(doc, readRaw(doc, rec)[5] ?? 0, doors);
  }, [doc, level, selected, rev, doors]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const map = doc.maps[level];
    canvas.width = map.width * 16 * zoom;
    canvas.height = MAP_HEIGHT * 16 * zoom;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    paintLevel(ctx, doc, level, {
      zoom,
      grid,
      collision,
      objects: markers,
      hidden,
      selected,
      animKinds,
      animTick,
      pickups,
      doors,
      keyLink,
      robinPreview: robinPreview ?? null,
    });
  }, [
    doc,
    level,
    zoom,
    grid,
    collision,
    markers,
    hidden,
    selected,
    rev,
    animKinds,
    animTick,
    pickups,
    doors,
    keyLink,
    robinPreview,
  ]);

  useEffect(() => {
    if (focusColumn === null) return;
    const scroller = scrollRef.current;
    if (!scroller) {
      onFocusHandled();
      return;
    }
    const target = focusColumn * 16 * zoom - scroller.clientWidth / 2 + 8 * zoom;
    scroller.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
    onFocusHandled();
  }, [focusColumn, level, zoom, onFocusHandled]);

  /** Convert a pointer event to map cell / pixel coordinates. */
  function cell(e: React.PointerEvent<HTMLCanvasElement>) {
    const px = e.nativeEvent.offsetX / zoom;
    const py = e.nativeEvent.offsetY / zoom;
    return {
      px,
      py,
      x: Math.floor(px / 16),
      y: Math.floor(py / 16),
    };
  }

  /** Stroke one background metatile into the pending paint edits. */
  function paint(x: number, y: number) {
    const map = doc.maps[level];
    if (!stroke.current || x < 0 || y < 0 || x >= map.width || y >= MAP_HEIGHT) return;
    const off = map.dataFileOff + x * MAP_HEIGHT + y;
    if (doc.bytes[off] === tile) return;
    const prior = stroke.current.find((ed) => ed.off === off);
    if (prior) prior.next = tile;
    else stroke.current.push({ off, prev: doc.bytes[off], next: tile });
    doc.bytes[off] = tile;
    onRev();
  }

  return (
    <div className="stage" ref={scrollRef}>
      <canvas
        ref={ref}
        className={mode === "bg" ? "cross" : "arrow"}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          const c = cell(e);
          if (e.button === 2) {
            if (c.x >= 0 && c.y >= 0 && c.x < doc.maps[level].width && c.y >= 0 && c.y < MAP_HEIGHT) {
              onPickTile(doc.blockAt(level, c.x, c.y), c.x);
            }
            return;
          }
          if (e.button !== 0) return;
          // Exits live off-canvas — never start paint from an exit click.
          e.currentTarget.setPointerCapture(e.pointerId);
          if (mode === "bg") {
            stroke.current = [];
            paint(c.x, c.y);
            return;
          }
          const hit = markers ? hitObject(doc, level, c.px, c.py, hidden) : null;
          onSelect(hit);
          if (hit !== null) {
            const rec = doc.objects[level][hit];
            drag.current = { index: hit, px: c.px, py: c.py, orig: readRaw(doc, rec) };
          }
        }}
        onPointerMove={(e) => {
          const c = cell(e);
          const map = doc.maps[level];
          if (c.x >= 0 && c.y >= 0 && c.x < map.width && c.y < MAP_HEIGHT) {
            const id = doc.blockAt(level, c.x, c.y);
            const solid = describeSolid(doc.blocks.solid[id]);
            const exits = mergeExits(
              exitsAtColumn(doc, level, c.x),
              exitsUsingTile(doc, level, id),
            );
            const exitNote = exits.length
              ? ` · ${exits.map(exitChipLabel).join(" · ")}`
              : "";
            const block = `column ${c.x}  row ${c.y}  block $${id.toString(16).toUpperCase().padStart(2, "0")} · ${solid}${exitNote}`;
            const under = describeHoverTarget(doc, level, c.px, c.py, hidden, pickups, doors);
            onHover(`${block}\n${under}`);
          } else {
            onHover("");
          }
          if (stroke.current) paint(c.x, c.y);
          const d = drag.current;
          if (!d) return;
          const rec = doc.objects[level][d.index];
          const next = d.orig.slice();
          moveObject(rec.type, next, c.px - d.px, c.py - d.py, map.width);
          for (let i = 0; i < next.length; i++) doc.bytes[rec.fileOff + i] = next[i];
          onRev();
        }}
        onPointerUp={() => {
          if (stroke.current) {
            onPaintStroke(stroke.current.filter((ed) => ed.prev !== ed.next));
            stroke.current = null;
          }
          const d = drag.current;
          if (d) {
            const rec = doc.objects[level][d.index];
            const edits: Edit[] = [];
            for (let i = 0; i < d.orig.length; i++) {
              const next = doc.bytes[rec.fileOff + i];
              if (next !== d.orig[i]) edits.push({ off: rec.fileOff + i, prev: d.orig[i], next });
            }
            onPaintStroke(edits);
            drag.current = null;
          }
        }}
      />
    </div>
  );
}
