import { LEVELS, refreshMapMeta, type Edit, type RomDoc } from "./rom.ts";
import {
  RUN_TABLE_LEN,
  RUN_TABLE_MAX,
  patchRobin,
  readRobin,
  resetRunTable,
  runTablePixelStep,
  runTableSpeedPx,
  setRunEntry,
  type RobinStats,
} from "./settings.ts";
import { ChrSetPanel } from "./TileChrome.tsx";
import { Num } from "./ObjectPanel.tsx";

/** Mapinfo / castle-header fields for the current level. */
export function CastlePanel({
  doc,
  level,
  onCommit,
  onOpenOverview,
  onPlayMap,
}: {
  doc: RomDoc;
  level: number;
  onCommit: (edits: Edit[]) => void;
  onOpenOverview: () => void;
  onPlayMap: () => void;
}) {
  const map = doc.maps[level];
  /** Commit one mapinfo byte and refresh cached map meta. */
  function setField(index: number, value: number) {
    const off = map.infoFileOff + index;
    onCommit([{ off, prev: doc.bytes[off], next: value & 255 }]);
    refreshMapMeta(doc, level);
  }
  return (
    <div className="panel">
      <h2>Castle</h2>
      <button className="primary overview-open" onClick={onOpenOverview}>
        Castle Map
      </button>
      <button
        type="button"
        className="play-from-map"
        title={`Boot FCEUX on ${LEVELS[level].name} (title skipped)`}
        onClick={onPlayMap}
      >
        Play this map
      </button>
      <p className="muted">
        {LEVELS[level].name} · height {map.height} · world X {map.worldX} · width {map.width}{" "}
        (width packed end-to-end)
      </p>
      <ChrSetPanel doc={doc} level={level} onChr={(n) => setField(5, n)} />
      <Num
        label="World X"
        value={map.worldX}
        min={0}
        max={255}
        onChange={(n) => setField(2, n)}
      />
      <p className="hint">Palette is at the top of the sidebar. CHR set redraws this level from the ROM tables.</p>
    </div>
  );
}

/** Lives / hearts / jump / run-table editor. */
export function RobinPanel({
  doc,
  stats,
  onCommit,
  rev,
}: {
  doc: RomDoc;
  stats: RobinStats | null;
  onCommit: (edits: Edit[]) => void;
  rev: number;
}) {
  if (!stats) {
    return (
      <div className="panel">
        <h2>ROBIN</h2>
        <p className="hint">Could not find Robin constants in this ROM.</p>
      </div>
    );
  }
  const found = stats;
  void rev;
  const values = readRobin(doc, found);
  /** Commit a Robin stats field edit. */
  function setField(field: keyof typeof values, value: number) {
    onCommit(patchRobin(doc, found, field, value));
  }
  return (
    <div className="panel">
      <h2>ROBIN</h2>
      <Num label="Starting lives" value={values.lives} min={1} max={9} onChange={(n) => setField("lives", n)} />
      <Num
        label="Cheat lives"
        value={values.cheatLives}
        min={1}
        max={9}
        onChange={(n) => setField("cheatLives", n)}
      />
      <Num
        label="Starting hearts"
        value={values.startHearts}
        min={0}
        max={9}
        onChange={(n) => setField("startHearts", n)}
      />
      <Num
        label="Max hearts"
        value={values.maxHearts}
        min={1}
        max={9}
        onChange={(n) => setField("maxHearts", n)}
      />
      <Num
        label="Hearts after extra life"
        value={values.afterExtra}
        min={-9}
        max={9}
        onChange={(n) => setField("afterExtra", n)}
      />
      <Num
        label="Jump strength"
        value={values.jump}
        min={-64}
        max={-1}
        onChange={(n) => setField("jump", n)}
      />
      <div className="run-table-head">
        <p className="muted">Run table · runtablelo ({RUN_TABLE_LEN} bytes)</p>
        <button
          type="button"
          title="Restore stock CONTROL.ROU curve: i×5 for vel 0–46, then 0 at max"
          onClick={() => {
            const edits = resetRunTable(doc, found);
            if (edits.length) onCommit(edits);
          }}
        >
          Reset stock ×5
        </button>
      </div>
      <p className="hint">
        Indexed by runcount (velocity, caps at {RUN_TABLE_MAX}). Each frame adds the subpixel δ to
        robindx and 1 whole pixel (2 at max). Slot 0 is unused (idle early-out).
      </p>
      <div className="run-table" role="table" aria-label="Run acceleration table">
        <div className="run-table-row head" role="row">
          <span role="columnheader">vel</span>
          <span role="columnheader">subpixel δ</span>
          <span role="columnheader">≈ px/frame</span>
          <span role="columnheader">note</span>
        </div>
        {values.runTable.map((v, i) => {
          const speed = runTableSpeedPx(i, v);
          const note =
            i === 0 ? "unused / idle" : i === RUN_TABLE_MAX ? "max · +2 px step" : `+${runTablePixelStep(i)} px base`;
          return (
            <label key={i} className="run-table-row" role="row" title={`runcount=${i}`}>
              <span className="run-vel" role="cell">
                {i}
              </span>
              <input
                role="cell"
                type="number"
                min={0}
                max={255}
                value={v}
                aria-label={`Velocity ${i} subpixel`}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  onCommit([setRunEntry(doc, found, i, Math.max(0, Math.min(255, Math.round(n))))]);
                }}
              />
              <span className="run-speed muted" role="cell">
                {i === 0 ? "—" : speed.toFixed(3)}
              </span>
              <span className="run-note muted" role="cell">
                {note}
              </span>
            </label>
          );
        })}
      </div>
      <p className="hint">More negative jump = higher. Cheat lives apply when Left+A is held at start.</p>
    </div>
  );
}
