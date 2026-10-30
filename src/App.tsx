import { useEffect, useMemo, useRef, useState } from "react";
import {
  ANIM_LABELS,
} from "./anim.ts";
import {
  DEFAULT_EXPORT,
  type ExportLayers,
  type GridStyle,
} from "./draw.ts";
import {
  arrivalAfterExit,
  leavePoseOnExit,
  type ExitArrival,
} from "./exits.ts";
import { robinSpawnOnLevel, START_LEVEL } from "./robinSpawn.ts";
import { loadPickups } from "./pickups.ts";
import {
  buildBytesFromSteps,
  stepsFromBaselineDiff,
  stepsFromUndo,
  type ChangeStep,
} from "./changelog.ts";
import {
  LEVELS,
  MAP_HEIGHT,
  loadRom,
  refreshMapMeta,
  writeEdits,
  type Edit,
  type RomDoc,
} from "./rom.ts";
import {
  PAL_SETS,
  findRobinStats,
  orderedChrSets,
  type RobinStats,
} from "./settings.ts";
import { CastlePanel, RobinPanel } from "./CastleRobinPanels.tsx";
import { Empty } from "./EmptyScreen.tsx";
import { exportPng } from "./exportPng.ts";
import {
  COLLECTABLE_TYPES,
  ENEMY_TYPES,
  ObjectJumpSelect,
  PickupJumpSelect,
  SpawnEnemyJumpSelect,
} from "./JumpSelects.tsx";
import { ExitsRail, LevelHub } from "./LevelNav.tsx";
import { AboutModal, ExportModal, OverviewModal, SaveReviewModal } from "./Modals.tsx";
import { ObjectPanel, objectColumn } from "./ObjectPanel.tsx";
import { copyBytes, download, playFromMap, type SavePicker } from "./playBridge.ts";
import { Stage } from "./Stage.tsx";
import { ChrSetPanel, PaletteModule, TilePanel } from "./TileChrome.tsx";

type Mode = "bg" | "obj" | "castle" | "robin";

/** Main MagicianEdit shell — ROM load, undo/redo, level stage, and side panels. Logic stays the inherited Robin editor until Magician load lands. */
export function App() {
  const fileRef = useRef<HTMLInputElement>(null);
  const stacks = useRef<{ undo: Edit[][]; redo: Edit[][] }>({ undo: [], redo: [] });
  /** Bytes as of last open / successful save — used for the save-review timeline. */
  const baselineRef = useRef<Uint8Array | null>(null);
  const api = useRef({ undo: () => {}, redo: () => {}, save: () => {} });

  const [doc, setDoc] = useState<RomDoc | null>(null);
  const [robin, setRobin] = useState<RobinStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(4);
  const [mode, setMode] = useState<Mode>("bg");
  const [tile, setTile] = useState(1);
  /** Map column of the last right-click tile pick; null when chosen from the palette. */
  const [tilePickColumn, setTilePickColumn] = useState<number | null>(null);
  const [grid, setGrid] = useState<GridStyle>("corner");
  const [collision, setCollision] = useState(false);
  const [markers, setMarkers] = useState(true);
  const [animKinds, setAnimKinds] = useState<Set<string>>(() => new Set());
  const [exportBoard, setExportBoard] = useState(false);
  const [exportLayers, setExportLayers] = useState<ExportLayers>({ ...DEFAULT_EXPORT });
  const [exportOpen, setExportOpen] = useState(false);
  const [animTick, setAnimTick] = useState(0);
  const [zoom, setZoom] = useState(2);
  const [selected, setSelected] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [rev, setRev] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const [hover, setHover] = useState<string>("");
  const [about, setAbout] = useState(false);
  const [overview, setOverview] = useState(false);
  const [focusColumn, setFocusColumn] = useState<number | null>(null);
  /** Robin pose after using an exit (game wrap / world-X remap). */
  const [robinPreview, setRobinPreview] = useState<ExitArrival | null>(null);
  const [showExits, setShowExits] = useState(true);
  const [saveReview, setSaveReview] = useState<{
    forcePicker: boolean;
    steps: ChangeStep[];
  } | null>(null);

  const pickups = useMemo(() => (doc ? loadPickups(doc) : []), [doc, rev]);

  /** Clear undo/redo stacks after open/save. */
  function resetHistory() {
    stacks.current = { undo: [], redo: [] };
    setHistory({ undo: 0, redo: 0 });
  }

  /** Parse bytes into a RomDoc and reset editor state for a new file. */
  function openBytes(bytes: Uint8Array, name: string) {
    try {
      const next = loadRom(bytes, name);
      baselineRef.current = new Uint8Array(next.bytes);
      setDoc(next);
      setRobin(findRobinStats(next.bytes));
      setError(null);
      setLevel(4);
      setSelected(null);
      setDirty(false);
      setSaveReview(null);
      resetHistory();
      setRev((r) => r + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  /** Read a File as ArrayBuffer and open it as a ROM. */
  function readFile(file: File) {
    file.arrayBuffer().then((buf) => openBytes(new Uint8Array(buf), file.name));
  }

  /** Apply edits to the working ROM, push undo, and mark dirty. */
  function commit(edits: Edit[]) {
    if (!doc) return;
    const real = edits.filter((e) => e.prev !== e.next);
    if (!real.length) return;
    writeEdits(doc.bytes, real);
    stacks.current.undo.push(real);
    stacks.current.redo = [];
    setHistory({ undo: stacks.current.undo.length, redo: 0 });
    setDirty(true);
    setRev((r) => r + 1);
  }

  /** Reverse the last committed edit group. */
  function undo() {
    if (!doc) return;
    const step = stacks.current.undo.pop();
    if (!step) return;
    writeEdits(doc.bytes, step, true);
    for (let i = 0; i < LEVELS.length; i++) refreshMapMeta(doc, i);
    stacks.current.redo.push(step);
    setHistory({ undo: stacks.current.undo.length, redo: stacks.current.redo.length });
    setDirty(true);
    setRev((r) => r + 1);
  }

  /** Re-apply the last undone edit group. */
  function redo() {
    if (!doc) return;
    const step = stacks.current.redo.pop();
    if (!step) return;
    writeEdits(doc.bytes, step);
    for (let i = 0; i < LEVELS.length; i++) refreshMapMeta(doc, i);
    stacks.current.undo.push(step);
    setHistory({ undo: stacks.current.undo.length, redo: stacks.current.redo.length });
    setDirty(true);
    setRev((r) => r + 1);
  }

  /** Switch the current level's mapinfo palette (same byte Castle mode edits). */
  function setLevelPalette(palIndex: number) {
    if (!doc) return;
    const map = doc.maps[level];
    const off = map.infoFileOff + 4;
    const next = palIndex & 255;
    if (doc.bytes[off] === next) return;
    commit([{ off, prev: doc.bytes[off], next }]);
    refreshMapMeta(doc, level);
    setRev((r) => r + 1);
  }

  /** Switch mapinfo chrIndex → which mapchrsdefs list this level loads. */
  function setLevelChr(chrIndex: number) {
    if (!doc) return;
    const map = doc.maps[level];
    const off = map.infoFileOff + 5;
    const next = chrIndex & 255;
    if (doc.bytes[off] === next) return;
    commit([{ off, prev: doc.bytes[off], next }]);
    refreshMapMeta(doc, level);
    setRev((r) => r + 1);
  }

  /** Build the pre-save change timeline from undo + baseline diff. */
  function collectSaveSteps(): ChangeStep[] {
    if (!doc) return [];
    if (stacks.current.undo.length) return stepsFromUndo(doc, stacks.current.undo);
    if (baselineRef.current) return stepsFromBaselineDiff(doc, baselineRef.current);
    return [];
  }

  /** Open the change timeline when dirty; otherwise write immediately. */
  function requestSave(forcePicker = false) {
    if (!doc) return;
    if (!dirty) {
      void writeRomFile(forcePicker);
      return;
    }
    const steps = collectSaveSteps();
    if (!steps.length) {
      void writeRomFile(forcePicker);
      return;
    }
    setSaveReview({ forcePicker, steps });
  }

  /** Apply only the kept timeline steps; write the ROM unless everything was discarded. */
  function confirmSaveReview(kept: ChangeStep[]) {
    if (!doc || !baselineRef.current) {
      setSaveReview(null);
      return;
    }
    const forcePicker = saveReview?.forcePicker ?? false;
    const nextBytes = buildBytesFromSteps(baselineRef.current, kept);
    doc.bytes.set(nextBytes);
    for (let i = 0; i < LEVELS.length; i++) refreshMapMeta(doc, i);
    setRobin(findRobinStats(doc.bytes));
    stacks.current.undo = kept.map((s) => s.edits).filter((e) => e.length > 0);
    stacks.current.redo = [];
    setHistory({ undo: stacks.current.undo.length, redo: 0 });
    setSaveReview(null);
    setRev((r) => r + 1);
    if (kept.length === 0) {
      // Fully reverted to last save — no file write needed.
      setDirty(false);
      resetHistory();
      return;
    }
    void writeRomFile(forcePicker);
  }

  /** Write the working ROM via File System Access API or download fallback. */
  async function writeRomFile(forcePicker = false) {
    if (!doc) return;
    const name = doc.name.toLowerCase().endsWith(".nes") ? doc.name : `${doc.name}.nes`;
    const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
    try {
      if (picker && (forcePicker || true)) {
        const handle = await picker({
          suggestedName: name,
          types: [{ description: "NES ROM", accept: { "application/octet-stream": [".nes"] } }],
        });
        const writable = await handle.createWritable();
        const copy = new ArrayBuffer(doc.bytes.byteLength);
        new Uint8Array(copy).set(doc.bytes);
        await writable.write(copy);
        await writable.close();
      } else {
        download(copyBytes(doc.bytes), forcePicker ? name.replace(/\.nes$/i, "-edit.nes") : name);
      }
      baselineRef.current = new Uint8Array(doc.bytes);
      setDirty(false);
      resetHistory();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  api.current = { undo, redo, save: () => requestSave(false) };

  useEffect(() => {
    /** Global shortcuts: undo/redo/save, map [,], overlays. */
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || el?.isContentEditable) {
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) api.current.redo();
        else api.current.undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        api.current.redo();
        return;
      }
      if (mod && key === "s") {
        e.preventDefault();
        void api.current.save();
        return;
      }
      if (e.key === "[") {
        setLevel((n) => Math.max(0, n - 1));
        setTilePickColumn(null);
      } else if (e.key === "]") {
        setLevel((n) => Math.min(LEVELS.length - 1, n + 1));
        setTilePickColumn(null);
      }
      else if (e.key === "g")
        setGrid((v) =>
          v === "none" ? "line" : v === "line" ? "dash" : v === "dash" ? "dots" : v === "dots" ? "corner" : "none",
        );
      else if (e.key === "c") setCollision((v) => !v);
      else if (e.key === "b") setMode("bg");
      else if (e.key === "o") setMode("obj");
      else if (e.key === "a") {
        setAnimKinds((prev) => {
          const next = new Set(prev);
          if (next.has("flash")) next.delete("flash");
          else next.add("flash");
          return next;
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    /** Warn before closing the tab when the ROM is dirty. */
    const fn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [dirty]);

  useEffect(() => {
    if (animKinds.size === 0) return;
    const id = window.setInterval(() => setAnimTick((t) => t + 1), 80);
    return () => window.clearInterval(id);
  }, [animKinds]);

  const info = doc ? LEVELS[level] : null;

  return (
    <div
      className="app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) readFile(file);
      }}
    >
      <header className="bar">
        <div className="brand">
          <strong>MagicianEdit</strong>
          <span>0.1.0</span>
        </div>
        <button onClick={() => fileRef.current?.click()}>Open</button>
        <button disabled={!doc} onClick={() => requestSave(false)} title="Review changes, then save">
          Save{dirty ? " *" : ""}
        </button>
        <button disabled={!doc} onClick={() => requestSave(true)} title="Review changes, then save as">
          Save as
        </button>
        <button disabled={!doc} onClick={() => setExportOpen(true)}>
          Export Map
        </button>
        <button disabled={!doc} onClick={() => setOverview(true)}>
          Castle Map
        </button>
        <button
          disabled={!doc}
          className="play-from-map"
          title={
            robinPreview && robinPreview.level === level
              ? `Boot FCEUX on ${LEVELS[level].name} at the exit pose (title skipped)`
              : `Boot FCEUX on ${LEVELS[level].name} (title skipped; floor spawn)`
          }
          onClick={() => {
            if (!doc) return;
            void playFromMap(
              doc,
              level,
              setError,
              robinPreview && robinPreview.level === level
                ? { x: robinPreview.x, y: robinPreview.y }
                : null,
            );
          }}
        >
          Play map
        </button>
        <button
          disabled={!doc || !history.undo}
          onClick={undo}
          title="Undo (Ctrl+Z / ⌘Z)"
        >
          Undo
        </button>
        <button
          disabled={!doc || !history.redo}
          onClick={redo}
          title="Redo (Ctrl+Shift+Z / ⌘⇧Z, or Ctrl+Y / ⌘Y)"
        >
          Redo
        </button>
        <button onClick={() => setAbout(true)}>Author</button>
        <span className="spacer" />
        {doc && <span className="filename">{doc.name}</span>}
        <input
          ref={fileRef}
          type="file"
          accept=".nes,application/octet-stream"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) readFile(file);
            e.target.value = "";
          }}
        />
      </header>

      {doc && info && (
        <div className="bar sub">
          <div className="map-controls" role="group" aria-label="Map">
            <label>
              Map
              <select
                value={level}
                onChange={(e) => {
                  setLevel(Number(e.target.value));
                  setSelected(null);
                  setRobinPreview(null);
                  setTilePickColumn(null);
                }}
              >
                {LEVELS.map((lv, i) => (
                  <option key={lv.name} value={i}>
                    {lv.name} · {lv.area} · {doc.maps[i].width}×{MAP_HEIGHT}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Animate
              <select
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  if (v === "all") setAnimKinds(new Set(ANIM_LABELS.map((a) => a.id)));
                  else if (v === "none") setAnimKinds(new Set());
                  else {
                    setAnimKinds((prev) => {
                      const next = new Set(prev);
                      if (next.has(v)) next.delete(v);
                      else next.add(v);
                      return next;
                    });
                  }
                  e.target.value = "";
                }}
              >
                <option value="">
                  {animKinds.size === 0
                    ? "None"
                    : animKinds.size === ANIM_LABELS.length
                      ? "All"
                      : `${animKinds.size} on`}
                </option>
                <option value="all">All</option>
                <option value="none">None</option>
                {ANIM_LABELS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {animKinds.has(a.id) ? "✓ " : ""}
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Zoom
              <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
                {[1, 2, 3].map((z) => (
                  <option key={z} value={z}>
                    {z}×
                  </option>
                ))}
              </select>
            </label>
            <label className="palette-select">
              Palette
              <select
                value={doc.maps[level].palIndex}
                onChange={(e) => setLevelPalette(Number(e.target.value))}
                title="Level palette (mapinfo). Also editable in Castle mode."
              >
                {PAL_SETS.map((p) => (
                  <option key={p.index} value={p.index}>
                    {p.name}
                  </option>
                ))}
                {!PAL_SETS.some((p) => p.index === doc.maps[level].palIndex) && (
                  <option value={doc.maps[level].palIndex}>
                    Custom ({doc.maps[level].palIndex})
                  </option>
                )}
              </select>
            </label>
            <label className="palette-select">
              CHR
              <select
                value={doc.maps[level].chrIndex}
                onChange={(e) => setLevelChr(Number(e.target.value))}
                title="Level CHR set (mapinfo). Active set listed first in the side panel."
              >
                {orderedChrSets(doc.maps[level].chrIndex).map((c) => (
                  <option key={c.index} value={c.index}>
                    {c.active ? `★ ${c.name}` : c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Grid
            <select value={grid} onChange={(e) => setGrid(e.target.value as GridStyle)}>
              <option value="none">None</option>
              <option value="line">Line</option>
              <option value="dash">Dash</option>
              <option value="dots">Dot</option>
              <option value="corner">Corner</option>
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={collision} onChange={(e) => setCollision(e.target.checked)} />
            Collisions
          </label>
          <label className="check">
            <input type="checkbox" checked={markers} onChange={(e) => setMarkers(e.target.checked)} />
            Objects
          </label>
          <label className="check">
            <input type="checkbox" checked={showExits} onChange={(e) => setShowExits(e.target.checked)} />
            Exits
          </label>
          <span className="spacer" />
          <span className="hover-status muted">
            {hover.split("\n").map((line, i) => (
              <span key={i} className="hover-line">
                {line || "\u00a0"}
              </span>
            ))}
          </span>
        </div>
      )}

      {doc && info && (
        <div className="bar sub jumps">
          <button
            type="button"
            className="robin-jump"
            title={`Jump to Robin start on ${LEVELS[START_LEVEL].name} (startlevel=${START_LEVEL})`}
            onClick={() => {
              setLevel(START_LEVEL);
              const spawn = robinSpawnOnLevel(doc, START_LEVEL);
              setFocusColumn(spawn ? Math.floor(spawn.x / 16) : 0);
              setSelected(null);
              setOverview(false);
            }}
          >
            Robin start
          </button>
          <ObjectJumpSelect
            label="Enemy"
            emptyLabel="No archers/cannons"
            placeholder="Go to enemy…"
            types={ENEMY_TYPES}
            doc={doc}
            rev={rev}
            level={level}
            selected={selected}
            onJump={(nextLevel, index, column) => {
              setMode("obj");
              setLevel(nextLevel);
              setSelected(index);
              setFocusColumn(column);
              setOverview(false);
            }}
          />
          <SpawnEnemyJumpSelect
            doc={doc}
            rev={rev}
            onJump={(hit) => {
              setMode("bg");
              setLevel(hit.level);
              setTile(hit.tileId);
              setTilePickColumn(hit.column);
              setSelected(null);
              setFocusColumn(hit.column);
              setOverview(false);
            }}
          />
          <ObjectJumpSelect
            label="Collectable"
            emptyLabel="No keys/secrets/Marion"
            placeholder="Go to collectable…"
            types={COLLECTABLE_TYPES}
            doc={doc}
            rev={rev}
            level={level}
            selected={selected}
            onJump={(nextLevel, index, column) => {
              setMode("obj");
              setLevel(nextLevel);
              setSelected(index);
              setFocusColumn(column);
              setOverview(false);
            }}
          />
          <PickupJumpSelect
            doc={doc}
            pickups={pickups}
            onJump={(p) => {
              setMode("bg");
              setLevel(p.level);
              setSelected(null);
              setFocusColumn(p.markColumn);
              setOverview(false);
              setTile(doc.blockAt(p.level, p.markColumn, p.row));
              setTilePickColumn(p.markColumn);
            }}
          />
        </div>
      )}

      {!doc ? (
        <Empty
          error={error}
          onOpen={() => fileRef.current?.click()}
          onSample={(url, label) => {
            fetch(url)
              .then((res) => {
                if (!res.ok) throw new Error(`Could not read ${label}`);
                return res.arrayBuffer();
              })
              .then((buf) => openBytes(new Uint8Array(buf), `${label}.nes`))
              .catch((err) => setError(err instanceof Error ? err.message : String(err)));
          }}
          onAbout={() => setAbout(true)}
        />
      ) : (
        <div className="workspace">
          <div className="stage-column">
            {showExits && (
              <ExitsRail
                doc={doc}
                level={level}
                onGoDestination={(exit) => {
                  const pose = arrivalAfterExit(doc, level, exit);
                  setLevel(exit.toLevel);
                  setSelected(null);
                  setFocusColumn(Math.floor(pose.x / 16));
                  setRobinPreview(pose);
                }}
                onFocusHere={(exit) => {
                  const pose = leavePoseOnExit(doc, level, exit);
                  setSelected(null);
                  setFocusColumn(exit.fromColumn);
                  setRobinPreview(pose);
                }}
              />
            )}
            <Stage
              doc={doc}
              level={level}
              mode={mode === "obj" ? "obj" : "bg"}
              tile={tile}
              zoom={zoom}
              grid={grid}
              collision={collision}
              markers={markers}
              animKinds={animKinds}
              animTick={animTick}
              hidden={hidden}
              selected={selected}
              pickups={pickups}
              robinPreview={
                robinPreview && robinPreview.level === level
                  ? { x: robinPreview.x, y: robinPreview.y, dir: robinPreview.dir }
                  : null
              }
              rev={rev}
              focusColumn={focusColumn}
              onFocusHandled={() => setFocusColumn(null)}
              onHover={setHover}
              onPickTile={(id, column) => {
                setTile(id);
                setTilePickColumn(column);
              }}
              onSelect={setSelected}
              onPaintStroke={(edits) => {
                if (!edits.length) return;
                stacks.current.undo.push(edits);
                stacks.current.redo = [];
                setHistory({ undo: stacks.current.undo.length, redo: 0 });
                setDirty(true);
              }}
              onRev={() => setRev((r) => r + 1)}
            />
          </div>
          <aside className="side">
            <div className="side-sticky">
              <div className="seg side-modes" role="tablist" aria-label="Edit mode">
                <button
                  type="button"
                  className={mode === "bg" ? "on" : ""}
                  onClick={() => setMode("bg")}
                >
                  Background
                </button>
                <button
                  type="button"
                  className={mode === "obj" ? "on" : ""}
                  onClick={() => setMode("obj")}
                >
                  Objects
                </button>
                <button
                  type="button"
                  className={mode === "castle" ? "on" : ""}
                  onClick={() => setMode("castle")}
                >
                  Castle
                </button>
                <button
                  type="button"
                  className={mode === "robin" ? "on" : ""}
                  onClick={() => setMode("robin")}
                >
                  Robin
                </button>
              </div>
              <PaletteModule
                doc={doc}
                level={level}
                onPalette={setLevelPalette}
              />
            </div>
            <div className="side-body">
              {mode === "bg" && (
                <TilePanel
                  doc={doc}
                  level={level}
                  tile={tile}
                  pickColumn={tilePickColumn}
                  rev={rev}
                  onPick={(id) => {
                    setTile(id);
                    setTilePickColumn(null);
                  }}
                />
              )}
              {mode === "bg" && (
                <ChrSetPanel doc={doc} level={level} onChr={setLevelChr} />
              )}
              <LevelHub
                doc={doc}
                level={level}
                pickups={pickups}
                showExits={showExits}
                onGoDestination={(exit) => {
                  const pose = arrivalAfterExit(doc, level, exit);
                  setLevel(exit.toLevel);
                  setSelected(null);
                  setFocusColumn(Math.floor(pose.x / 16));
                  setRobinPreview(pose);
                }}
                onFocusHere={(exit) => {
                  const pose = leavePoseOnExit(doc, level, exit);
                  setSelected(null);
                  setFocusColumn(exit.fromColumn);
                  setRobinPreview(pose);
                }}
              />
              {mode === "obj" && (
                <ObjectPanel
                  doc={doc}
                  level={level}
                  selected={selected}
                  hidden={hidden}
                  onSelect={(index) => {
                    setSelected(index);
                    if (index === null) return;
                    const col = objectColumn(doc, level, index);
                    if (col !== null) setFocusColumn(col);
                  }}
                  onHidden={setHidden}
                  onCommit={commit}
                  onMutate={() => {
                    setDirty(true);
                    setSelected(null);
                    resetHistory();
                    setRev((r) => r + 1);
                  }}
                  onError={setError}
                  onPaintAmbient={(id) => {
                    setTile(id);
                    setTilePickColumn(null);
                    setMode("bg");
                  }}
                />
              )}
              {mode === "castle" && (
                <CastlePanel
                  doc={doc}
                  level={level}
                  onCommit={commit}
                  onOpenOverview={() => setOverview(true)}
                  onPlayMap={() =>
                    void playFromMap(
                      doc,
                      level,
                      setError,
                      robinPreview && robinPreview.level === level
                        ? { x: robinPreview.x, y: robinPreview.y }
                        : null,
                    )
                  }
                />
              )}
              {mode === "robin" && (
                <RobinPanel doc={doc} stats={robin} onCommit={commit} rev={rev} />
              )}
              <p className="romuse">
                BYTES IN ROM: map {doc.maps[level].width * MAP_HEIGHT}, objects{" "}
                {doc.objects[level].reduce((n, r) => n + r.length, 1)}. {doc.mapFree} bytes free
                after the maps.
              </p>
            </div>
          </aside>
        </div>
      )}
      {doc && error && <p className="toast">{error}</p>}
      {about && <AboutModal onClose={() => setAbout(false)} />}
      {doc && overview && (
        <OverviewModal
          doc={doc}
          level={level}
          rev={rev}
          onClose={() => setOverview(false)}
          onJump={(nextLevel, column) => {
            setLevel(nextLevel);
            setSelected(null);
            setFocusColumn(column);
            setOverview(false);
          }}
        />
      )}
      {doc && exportOpen && (
        <ExportModal
          layers={exportLayers}
          board={exportBoard}
          onLayers={setExportLayers}
          onBoard={setExportBoard}
          onClose={() => setExportOpen(false)}
          onExport={() => {
            exportPng(
              doc,
              level,
              collision,
              markers,
              hidden,
              animKinds,
              animTick,
              exportBoard,
              pickups,
              exportLayers,
            );
            setExportOpen(false);
          }}
        />
      )}
      {doc && saveReview && (
        <SaveReviewModal
          steps={saveReview.steps}
          onClose={() => setSaveReview(null)}
          onConfirm={confirmSaveReview}
        />
      )}
    </div>
  );
}
