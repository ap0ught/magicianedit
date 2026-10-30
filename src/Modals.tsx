import { useEffect, useRef, useState } from "react";
import { type ExportLayers } from "./draw.ts";
import { totalEditBytes, type ChangeStep } from "./changelog.ts";
import {
  hitWorldOverview,
  paintWorldOverview,
  worldLayout,
  type WorldLayout,
} from "./overview.ts";
import { LEVELS, MAP_HEIGHT, type RomDoc } from "./rom.ts";
import { CREDITS, CreditsBlock } from "./EmptyScreen.tsx";

/** Version / credits dialog. */
export function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Author">
        <h2>Author</h2>
        <CreditsBlock />
        <p className="hint">
          This React port edits the same mapper 71 Super Robin Hood ROM layouts as dizzy9’s Windows
          RobinEdit {CREDITS.upstreamVersion} tool.
        </p>
        <button className="primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

/** Pre-save timeline — uncheck steps to drop them before writing the ROM. */
export function SaveReviewModal({
  steps,
  onClose,
  onConfirm,
}: {
  steps: ChangeStep[];
  onClose: () => void;
  onConfirm: (kept: ChangeStep[]) => void;
}) {
  const [kept, setKept] = useState<Set<string>>(() => new Set(steps.map((s) => s.id)));
  const keptSteps = steps.filter((s) => kept.has(s.id));
  const byteCount = totalEditBytes(keptSteps);

  /** Include or exclude one timeline step from the save. */
  function toggle(id: string) {
    setKept((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal save-review-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Review changes before save"
      >
        <h2>Review changes</h2>
        <p className="hint">
          Timeline since last save. Uncheck anything you do not want written to the ROM — those
          edits are discarded from the working copy when you confirm.
        </p>
        <div className="save-review-actions">
          <button type="button" onClick={() => setKept(new Set(steps.map((s) => s.id)))}>
            Keep all
          </button>
          <button type="button" onClick={() => setKept(new Set())}>
            Keep none
          </button>
        </div>
        <ol className="save-timeline">
          {steps.map((step) => {
            const on = kept.has(step.id);
            return (
              <li key={step.id} className={on ? "on" : "off"}>
                <label className="save-timeline-row">
                  <input type="checkbox" checked={on} onChange={() => toggle(step.id)} />
                  <span className="save-timeline-index">{step.index}</span>
                  <span className="save-timeline-body">
                    <strong>{step.label}</strong>
                    {step.detail ? <span className="muted">{step.detail}</span> : null}
                    <span className="muted save-timeline-bytes">
                      {step.edits.length
                        ? `${step.edits.length} write${step.edits.length === 1 ? "" : "s"}`
                        : "structural"}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ol>
        <p className="muted save-review-summary">
          {keptSteps.length} of {steps.length} step{steps.length === 1 ? "" : "s"} · {byteCount}{" "}
          unique byte{byteCount === 1 ? "" : "s"}
        </p>
        <div className="save-review-foot">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={() => onConfirm(keptSteps)}>
            {keptSteps.length === 0 ? "Revert all & close" : "Save kept changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Full-castle overview canvas for jumping between map strips. */
export function OverviewModal({
  doc,
  level,
  rev,
  onClose,
  onJump,
}: {
  doc: RomDoc;
  level: number;
  rev: number;
  onClose: () => void;
  onJump: (level: number, column: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<WorldLayout | null>(null);
  const [tip, setTip] = useState(LEVELS[level].name);

  useEffect(() => {
    const canvas = canvasRef.current;
    const scroller = scrollRef.current;
    if (!canvas || !scroller) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    /** Fit and redraw the overview to the scroll viewport. */
    const paint = () => {
      const unit = worldLayout(doc, 1);
      const aw = Math.max(1, scroller.clientWidth);
      const ah = Math.max(1, scroller.clientHeight);
      const sx = Math.floor(aw / unit.worldCols);
      const sy = Math.floor(ah / (unit.tiers * MAP_HEIGHT));
      const scale = Math.max(2, Math.min(sx, sy) || 2);
      layoutRef.current = paintWorldOverview(ctx, doc, { scale, selected: level, rev });
    };

    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(scroller);
    return () => ro.disconnect();
  }, [doc, level, rev]);

  return (
    <div className="modal-backdrop overview-backdrop" onClick={onClose}>
      <div
        className="modal overview-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Castle Map"
      >
        <div className="overview-head">
          <h2>Castle Map</h2>
          <p className="muted">
            Live from the ROM · click a strip to open that map. Edits redraw this overview.
          </p>
        </div>
        <div className="overview-scroll" ref={scrollRef}>
          <canvas
            ref={canvasRef}
            className="overview-canvas"
            onPointerMove={(e) => {
              const layout = layoutRef.current;
              if (!layout) return;
              const hit = hitWorldOverview(doc, layout, e.nativeEvent.offsetX, e.nativeEvent.offsetY);
              setTip(hit ? `${hit.label} · col ${hit.column}` : "Click a map strip");
            }}
            onClick={(e) => {
              const layout = layoutRef.current;
              if (!layout) return;
              const hit = hitWorldOverview(doc, layout, e.nativeEvent.offsetX, e.nativeEvent.offsetY);
              if (hit) onJump(hit.level, hit.column);
            }}
          />
        </div>
        <div className="overview-foot">
          <span className="muted">{tip}</span>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/** PNG export options (zoom, layers, checkerboard). */
export function ExportModal({
  layers,
  board,
  onLayers,
  onBoard,
  onClose,
  onExport,
}: {
  layers: ExportLayers;
  board: boolean;
  onLayers: (next: ExportLayers) => void;
  onBoard: (v: boolean) => void;
  onClose: () => void;
  onExport: () => void;
}) {
  const entries: { key: keyof ExportLayers; label: string }[] = [
    { key: "treasure", label: "Treasure" },
    { key: "robin", label: "Robin Hood" },
    { key: "gate", label: "Gates" },
    { key: "platform", label: "Moving platforms" },
    { key: "key", label: "Keys" },
    { key: "cannon", label: "Cannons" },
    { key: "archer", label: "Archers" },
    { key: "torch", label: "Torches" },
    { key: "marion", label: "Marion" },
  ];
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Export map</h2>
        <div className="export-grid">
          {entries.map((e) => (
            <label key={e.key} className="check">
              <input
                type="checkbox"
                checked={layers[e.key]}
                onChange={(ev) => onLayers({ ...layers, [e.key]: ev.target.checked })}
              />
              {e.label}
            </label>
          ))}
          <label className="check">
            <input type="checkbox" checked={board} onChange={(e) => onBoard(e.target.checked)} />
            Checkerboard as background
          </label>
        </div>
        <div className="overview-foot">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={onExport}>
            Export map
          </button>
        </div>
      </div>
    </div>
  );
}
