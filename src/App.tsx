import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AMBIENT_FOES,
  ANIM_LABELS,
  kindFromBlockrou,
  spawnTileAccent,
  spawnTileEntries,
  spawnTileLabel,
  spawnTileOf,
  spawnTileShort,
  type AmbientFoe,
} from "./anim.ts";
import {
  DEFAULT_EXPORT,
  paintLevel,
  renderMetatile,
  type ExportLayers,
  type GridStyle,
} from "./draw.ts";
import {
  arrivalAfterExit,
  describeSolid,
  exitChipLabel,
  exitsAtColumn,
  exitsUsingTile,
  findMapExits,
  leavePoseOnExit,
  mergeExits,
  type ExitArrival,
  type MapExit,
} from "./exits.ts";
import { describeHoverTarget } from "./hover.ts";
import { playRomFileName, romForPlayFromMap } from "./play.ts";
import { robinSpawnOnLevel, START_LEVEL } from "./robinSpawn.ts";
import {
  DOOR_LINK_MIN,
  describeKeyLink,
  keyLinkShort,
  loadDoors,
  type DoorRec,
  type KeyLinkInfo,
} from "./keys.ts";
import {
  KINDS,
  anchorOf,
  kindOf,
  moveObject,
  readRaw,
  signed,
  unsigned,
  hitObject,
} from "./objects.ts";
import { loadPickups, type Pickup } from "./pickups.ts";
import { SECRET_DESCS, secretDesc, secretLabel, secretShort } from "./secrets.ts";
import {
  buildBytesFromSteps,
  stepsFromBaselineDiff,
  stepsFromUndo,
  totalEditBytes,
  type ChangeStep,
} from "./changelog.ts";
import {
  LEVELS,
  MAP_HEIGHT,
  deleteObject,
  insertObject,
  loadRom,
  objectFreeBytes,
  refreshMapMeta,
  writeEdits,
  type Edit,
  type ObjRec,
  type RomDoc,
} from "./rom.ts";
import {
  hitWorldOverview,
  paintWorldOverview,
  worldLayout,
  type WorldLayout,
} from "./overview.ts";
import { nesColor } from "./palette.ts";
import {
  PAL_SETS,
  RUN_TABLE_LEN,
  RUN_TABLE_MAX,
  chrSetName,
  describeChrPacks,
  findRobinStats,
  orderedChrSets,
  patchRobin,
  readRobin,
  resetRunTable,
  runTablePixelStep,
  runTableSpeedPx,
  setRunEntry,
  type RobinStats,
} from "./settings.ts";

/** Hostile objects you can jump to from the toolbar dropdown. */
const ENEMY_TYPES = new Set([2, 6]); // ARCHER, CANNON
/** Pickups / interactables you can jump to from the toolbar. */
const COLLECTABLE_TYPES = new Set([5, 7, 8]); // KEY, SECRET, MARION

type Mode = "bg" | "obj" | "castle" | "robin";

/** Rebuilt mapper-71 cart published in the parent source repo (download → place in roms/). */
const REBUILT_ROM_URL =
  "https://github.com/ap0ught/SuperRobinHoodNESSource/blob/master/srh-rebuilt.nes";
const REBUILD_ROMS_HINT =
  "Download a rebuilt .nes (srh-rebuilt.nes) from SuperRobinHoodNESSource, then drop it into the project roms/ folder.";

const CREDITS = {
  title: "RobinEdit",
  /** React port (this app) — ap0ught / Christopher Mayfield */
  portAuthor: "Christopher Mayfield",
  portHandle: "ap0ught",
  portUrl: "https://github.com/ap0ught",
  portEmail: "cdm@ap0.org",
  /** Original Windows RobinEdit on romhacking.net */
  upstreamAuthor: "Łukasz Kur",
  upstreamHandle: "dizzy9",
  upstreamEmail: "dizzy9@tlen.pl",
  upstreamSite: "https://www.romhacking.net/utilities/1828/",
  upstreamVersion: "0.4.4",
};

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

  function resetHistory() {
    stacks.current = { undo: [], redo: [] };
    setHistory({ undo: 0, redo: 0 });
  }

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

  function readFile(file: File) {
    file.arrayBuffer().then((buf) => openBytes(new Uint8Array(buf), file.name));
  }

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
          <strong>Super Robin Hood Editor</strong>
          <span>0.4.4</span>
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

function objectColumn(doc: RomDoc, level: number, index: number): number | null {
  const rec = doc.objects[level][index];
  if (!rec) return null;
  const a = anchorOf(rec.type, readRaw(doc, rec));
  if (!a) return null;
  return Math.max(0, Math.min(doc.maps[level].width - 1, Math.floor(a.x / 16)));
}

function ObjectJumpSelect({
  label,
  emptyLabel,
  placeholder,
  types,
  doc,
  rev,
  level,
  selected,
  onJump,
}: {
  label: string;
  emptyLabel: string;
  placeholder: string;
  types: Set<number>;
  doc: RomDoc;
  rev: number;
  level: number;
  selected: number | null;
  onJump: (level: number, index: number, column: number) => void;
}) {
  const entries = useMemo(() => {
    const list: {
      key: string;
      level: number;
      index: number;
      type: number;
      label: string;
    }[] = [];
    for (let lv = 0; lv < LEVELS.length; lv++) {
      doc.objects[lv].forEach((rec, index) => {
        if (!types.has(rec.type)) return;
        const raw = readRaw(doc, rec);
        const a = anchorOf(rec.type, raw);
        const col = a ? Math.floor(a.x / 16) : 0;
        const kind = kindOf(rec.type);
        let detail = `${kind.name} #${index}`;
        if (rec.type === 5) {
          const link = keyLinkShort(describeKeyLink(doc, raw[5] ?? 0));
          const mate = doc.objects[lv].find(
            (o, j) =>
              j !== index &&
              o.type === 7 &&
              readRaw(doc, o)[3] === raw[3] &&
              Math.abs(readRaw(doc, o)[4] - raw[4]) <= 8,
          );
          const withSec = mate
            ? ` · with SECRET #${readRaw(doc, mate)[5] ?? 0}`
            : "";
          detail = `KEY ${link}${withSec} #${index}`;
        } else if (rec.type === 7) {
          const row = Math.floor((raw[4] ?? 0) / 16);
          const onAir =
            row >= 0 &&
            row < MAP_HEIGHT &&
            col < doc.maps[lv].width &&
            doc.blockAt(lv, col, row) === 0;
          detail = `${secretLabel(raw[5] ?? 0)}${onAir ? " · on air" : ""} (obj #${index})`;
        } else if (rec.type === 8) {
          detail = `MARION #${index}`;
        }
        list.push({
          key: `${lv}:${index}`,
          level: lv,
          index,
          type: rec.type,
          label: `${LEVELS[lv].name} · ${detail} · col ${col}`,
        });
      });
    }
    return list;
  }, [doc, types, rev]);

  const groups = useMemo(() => {
    const order = KINDS.filter((k) => types.has(k.id));
    return order
      .map((k) => ({
        id: k.id,
        name: k.name,
        items: entries.filter((e) => e.type === k.id),
      }))
      .filter((g) => g.items.length > 0);
  }, [entries, types]);

  const current =
    selected !== null && types.has(doc.objects[level][selected]?.type ?? -1)
      ? `${level}:${selected}`
      : "";
  const hint = entries.length ? `${placeholder} (${entries.length})` : emptyLabel;
  return (
    <label>
      {label}
      <select
        value={current}
        disabled={entries.length === 0}
        onChange={(e) => {
          const key = e.target.value;
          if (!key) return;
          const hit = entries.find((en) => en.key === key);
          if (!hit) return;
          const col = objectColumn(doc, hit.level, hit.index) ?? 0;
          onJump(hit.level, hit.index, col);
        }}
      >
        <option value="">{hint}</option>
        {groups.map((g) => (
          <optgroup key={g.id} label={`${g.name} (${g.items.length})`}>
            {g.items.map((en) => (
              <option key={en.key} value={en.key}>
                {en.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function CreditsBlock() {
  return (
    <div className="credits">
      <p>
        <strong>{CREDITS.title}</strong> (React port)
      </p>
      <p>
        React port by {CREDITS.portAuthor} (
        <a href={CREDITS.portUrl} target="_blank" rel="noreferrer">
          {CREDITS.portHandle}
        </a>
        )
        <br />
        <span className="muted">{CREDITS.portEmail}</span>
      </p>
      <p>
        Based on Windows RobinEdit {CREDITS.upstreamVersion} by {CREDITS.upstreamAuthor} (
        <strong>{CREDITS.upstreamHandle}</strong>)
        <br />
        <span className="muted">{CREDITS.upstreamEmail}</span>
        <br />
        <a href={CREDITS.upstreamSite} target="_blank" rel="noreferrer">
          romhacking.net/utilities/1828
        </a>
      </p>
    </div>
  );
}

function AboutModal({ onClose }: { onClose: () => void }) {
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
function SaveReviewModal({
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

function OverviewModal({
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

function Empty({
  error,
  onOpen,
  onSample,
  onAbout,
}: {
  error: string | null;
  onOpen: () => void;
  onSample: (url: string, label: string) => void;
  onAbout: () => void;
}) {
  const samples = typeof __SAMPLE_ROMS__ === "undefined" ? [] : __SAMPLE_ROMS__;
  const [roms, setRoms] = useState<string[]>([]);

  const refreshRoms = () => {
    void (async () => {
      try {
        const api = await fetch("/api/roms");
        if (api.ok) {
          const data = (await api.json()) as { roms?: string[] };
          setRoms(Array.isArray(data.roms) ? data.roms : []);
          return;
        }
      } catch {
        /* fall through to production manifest */
      }
      try {
        const man = await fetch("/roms/manifest.json");
        if (man.ok) {
          const data = (await man.json()) as { roms?: string[] };
          setRoms(Array.isArray(data.roms) ? data.roms : []);
        } else {
          setRoms([]);
        }
      } catch {
        setRoms([]);
      }
    })();
  };

  useEffect(() => {
    refreshRoms();
    const hot = import.meta.hot;
    if (!hot) return;
    const onChange = () => refreshRoms();
    hot.on("srh:roms-changed", onChange);
    return () => {
      hot.off("srh:roms-changed", onChange);
    };
  }, []);

  return (
    <div className="empty">
      <h1>{CREDITS.title}</h1>
      <p className="empty-sub">
        Open a mapper 71 ROM. Paint background blocks, move objects, then save the same cart the NES
        build reads.
      </p>
      <button className="primary" onClick={onOpen}>
        Open
      </button>
      <div className="rom-picker" title={REBUILD_ROMS_HINT}>
        <div className="rom-picker-head">
          <span className="rom-picker-title">ROMs in roms/</span>
          <a
            className="rom-picker-link"
            href={REBUILT_ROM_URL}
            target="_blank"
            rel="noreferrer"
            title={REBUILD_ROMS_HINT}
          >
            Get rebuilt ROM
          </a>
        </div>
        {roms.length > 0 ? (
          <div className="rom-grid">
            {roms.map((name) => {
              const label = name.replace(/\.nes$/i, "");
              return (
                <button
                  key={name}
                  type="button"
                  title={`Load ${name}`}
                  onClick={() => onSample(`/roms/${encodeURIComponent(name)}`, label)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="rom-empty-hint">
            No local carts yet. Download{" "}
            <a href={REBUILT_ROM_URL} target="_blank" rel="noreferrer">
              srh-rebuilt.nes
            </a>{" "}
            (or your Asia dump) and place it in the project <code>roms/</code> folder, then refresh.
          </p>
        )}
      </div>
      {samples.length > 0 && (
        <div className="samples">
          {samples.map((s) => (
            <button key={s.file} onClick={() => onSample(s.file, s.label)}>
              {s.label}
            </button>
          ))}
        </div>
      )}
      <button onClick={onAbout}>Author / credit</button>
      {error && <p className="error">{error}</p>}
      <p className="hint">You can also drop a .nes file onto this window.</p>
    </div>
  );
}

function Stage({
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

const EXIT_DIR_LABEL: Record<MapExit["dir"], string> = {
  up: "▲ Up",
  down: "▼ Down",
  left: "◀ Left",
  right: "▶ Right",
};

/** Off-canvas exit navigation — never overlaps the paint surface. */
function ExitsRail({
  doc,
  level,
  onGoDestination,
  onFocusHere,
}: {
  doc: RomDoc;
  level: number;
  /** Left-click: switch map; Robin at real-game arrival pose. */
  onGoDestination: (exit: MapExit) => void;
  /** Right-click: stay here; Robin at this map's exit edge. */
  onFocusHere: (exit: MapExit) => void;
}) {
  const exits = useMemo(() => findMapExits(doc, level), [doc, level]);
  if (!exits.length) {
    return (
      <div className="exits-rail empty">
        <span className="muted">No map exits from this level</span>
      </div>
    );
  }
  return (
    <div className="exits-rail" role="navigation" aria-label="Map exits">
      <span className="exits-rail-title">Exits</span>
      {exits.map((e) => (
        <button
          key={`${e.dir}-${e.toLevel}-${e.fromColumn}`}
          type="button"
          className={`exit-chip exit-${e.dir}`}
          title={`Left-click: go to ${LEVELS[e.toLevel].name} with Robin at arrival. Right-click: Robin at this exit (col ${e.fromColumn}).`}
          onClick={() => onGoDestination(e)}
          onContextMenu={(ev) => {
            ev.preventDefault();
            onFocusHere(e);
          }}
        >
          {EXIT_DIR_LABEL[e.dir]} {e.label}
        </button>
      ))}
    </div>
  );
}

/** Always-visible level summary so the sidebar is never a blank void. */
function LevelHub({
  doc,
  level,
  pickups,
  showExits,
  onGoDestination,
  onFocusHere,
}: {
  doc: RomDoc;
  level: number;
  pickups: Pickup[];
  showExits: boolean;
  onGoDestination: (exit: MapExit) => void;
  onFocusHere: (exit: MapExit) => void;
}) {
  const map = doc.maps[level];
  const exits = useMemo(() => findMapExits(doc, level), [doc, level]);
  const packs = describeChrPacks(doc, level);
  const objCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const o of doc.objects[level]) counts.set(o.type, (counts.get(o.type) ?? 0) + 1);
    return KINDS.map((k) => ({ k, n: counts.get(k.id) ?? 0 })).filter((x) => x.n > 0);
  }, [doc, level]);
  const levelPickups = pickups.filter((p) => p.level === level);

  return (
    <details className="level-hub side-fold">
      <summary className="level-hub-head">
        <strong>{LEVELS[level].name}</strong>
        <span className="muted">{LEVELS[level].area}</span>
      </summary>
      <p className="muted level-hub-stats">
        {map.width}×{MAP_HEIGHT} · world X {map.worldX} · height tier {map.height} · pal{" "}
        {map.palIndex} · CHR {chrSetName(map.chrIndex)}
      </p>
      <div className="chr-packs compact">
        <span className="muted">CHR packs</span>
        <ul>
          {packs.map((p) => (
            <li key={p.slot}>{p.tileCountHint}</li>
          ))}
        </ul>
      </div>
      {objCounts.length > 0 && (
        <p className="muted">
          Objects:{" "}
          {objCounts.map(({ k, n }) => `${k.short}×${n}`).join(" · ")}
          {levelPickups.length ? ` · coinco ${levelPickups.length}` : ""}
        </p>
      )}
      {showExits && (
        <div className="exits-side">
          <strong>Exits</strong>
          <p className="hint">Left-click: arrive with Robin · right-click: Robin at exit here</p>
          {exits.length === 0 ? (
            <p className="hint">None from this level.</p>
          ) : (
            <ul>
              {exits.map((e) => (
                <li key={`${e.dir}-${e.toLevel}`}>
                  <button
                    type="button"
                    title={`Left: ${LEVELS[e.toLevel].name} with Robin arrival. Right: Robin at col ${e.fromColumn}.`}
                    onClick={() => onGoDestination(e)}
                    onContextMenu={(ev) => {
                      ev.preventDefault();
                      onFocusHere(e);
                    }}
                  >
                    {EXIT_DIR_LABEL[e.dir]} {LEVELS[e.toLevel].name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </details>
  );
}

function nesColorCss(index: number): string {
  const [r, g, b] = nesColor(index);
  return `${r},${g},${b}`;
}

/** Fixed corner preview of the active / hovered metatile. */
const TILE_PREVIEW = 96;
const MAG_SWATCH = 64;
const MAG_OFFSET = 14;

/** Keep a fixed-size magnifier on-screen near the cursor. */
function magnifierStyle(clientX: number, clientY: number, size: number): React.CSSProperties {
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
function PaletteModule({
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

function TilePanel({
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
function ChrSetPanel({
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

function CastlePanel({
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

function RobinPanel({
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

function ObjectPanel({
  doc,
  level,
  selected,
  hidden,
  onSelect,
  onHidden,
  onCommit,
  onMutate,
  onError,
  onPaintAmbient,
}: {
  doc: RomDoc;
  level: number;
  selected: number | null;
  hidden: Set<number>;
  onSelect: (index: number | null) => void;
  onHidden: (next: Set<number>) => void;
  onCommit: (edits: Edit[]) => void;
  onMutate: () => void;
  onError: (msg: string) => void;
  onPaintAmbient: (tileId: number) => void;
}) {
  const list = doc.objects[level];
  const rec = selected !== null ? list[selected] : null;
  const free = objectFreeBytes(doc);
  const doors = useMemo(() => loadDoors(doc), [doc]);
  const spawnEntries = useMemo(() => spawnTileEntries(doc.blockrous), [doc]);
  const selectedLink =
    rec?.type === 5 ? describeKeyLink(doc, readRaw(doc, rec)[5] ?? 0, doors) : null;
  const linkedHere = new Set(
    (selectedLink?.platforms ?? []).filter((p) => p.level === level).map((p) => p.index),
  );
  return (
    <div className="panel">
      <h2>Objects</h2>
      <div className="kind-row">
        {KINDS.map((k) => (
          <label key={k.id} className="check" title={k.name}>
            <input
              type="checkbox"
              checked={!hidden.has(k.id)}
              onChange={(e) => {
                const next = new Set(hidden);
                if (e.target.checked) next.delete(k.id);
                else next.add(k.id);
                onHidden(next);
              }}
            />
            <i style={{ background: k.color }} />
            {k.short}
          </label>
        ))}
      </div>
      {spawnEntries.length > 0 && (
        <div className="ambient-obj-block">
          <strong>Spawn tiles</strong>
          <p className="hint">
            Heart, coin, spider, bat, and rat are background tiles (often blank CHR), not Insert
            objects. Pick one to switch to Background paint mode.
          </p>
          <div className="ambient-tile-picks">
            {spawnEntries.map(({ kind, id }) => (
              <button
                key={kind}
                type="button"
                title={`Paint tile $${id.toString(16).toUpperCase()}`}
                onClick={() => onPaintAmbient(id)}
              >
                {spawnTileLabel(kind)}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="obj-tools">
        <label>
          Add
          <select
            value=""
            onChange={(e) => {
              const type = Number(e.target.value);
              e.target.value = "";
              if (!type) return;
              try {
                const idx = insertObject(doc, level, type, Math.floor(doc.maps[level].width / 2));
                onMutate();
                onSelect(idx);
              } catch (err) {
                onError(err instanceof Error ? err.message : String(err));
              }
            }}
          >
            <option value="">Insert… ({free}B free)</option>
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={selected === null}
          onClick={() => {
            if (selected === null) return;
            try {
              deleteObject(doc, level, selected);
              onMutate();
            } catch (err) {
              onError(err instanceof Error ? err.message : String(err));
            }
          }}
        >
          Delete
        </button>
      </div>
      <ul className="obj-list">
        {list.map((item, i) => {
          const kind = kindOf(item.type);
          const raw = readRaw(doc, item);
          let label = kind.name;
          let title: string | undefined = linkedHere.has(i) ? "Linked from selected key" : undefined;
          if (item.type === 5) {
            const info = describeKeyLink(doc, raw[5] ?? 0, doors);
            const col = raw[3];
            const y = raw[4];
            const mate = list.find(
              (o, j) =>
                j !== i &&
                o.type === 7 &&
                readRaw(doc, o)[3] === col &&
                Math.abs(readRaw(doc, o)[4] - y) <= 8,
            );
            const mateSid = mate ? (readRaw(doc, mate)[5] ?? 0) : null;
            label = `KEY ${keyLinkShort(info)}`;
            if (mateSid !== null) {
              label += ` · SECRET #${mateSid}`;
              title = `${keyLinkShort(info)} key shares cell with ${secretLabel(mateSid)}`;
            }
          } else if (item.type === 7) {
            const sid = raw[5] ?? 0;
            const col = raw[3];
            const row = Math.floor(raw[4] / 16);
            const onAir =
              row >= 0 &&
              row < MAP_HEIGHT &&
              col < doc.maps[level].width &&
              doc.blockAt(level, col, row) === 0;
            label = `SECRET #${sid}`;
            title = onAir ? `${secretLabel(sid)} · trigger on air` : secretLabel(sid);
          } else if (item.type === 8) {
            label = "MARION";
          }
          const linked = linkedHere.has(i);
          return (
            <li key={item.fileOff}>
              <button
                className={i === selected ? "on" : linked ? "linked" : ""}
                onClick={() => onSelect(i)}
                title={title}
              >
                <i style={{ background: linked ? "#ffe066" : kind.color }} />
                {label}
                {item.type === 7 ? (
                  <span className="secret-list-desc">{secretShort(raw[5] ?? 0)}</span>
                ) : (
                  <span>#{i}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {rec ? (
        <Inspector doc={doc} rec={rec} width={doc.maps[level].width} onCommit={onCommit} />
      ) : (
        <p className="hint">Select an object on the map, or from the list. Drag it to move it.</p>
      )}
    </div>
  );
}

function Inspector({
  doc,
  rec,
  width,
  onCommit,
}: {
  doc: RomDoc;
  rec: ObjRec;
  width: number;
  onCommit: (edits: Edit[]) => void;
}) {
  const raw = readRaw(doc, rec);
  function setByte(index: number, value: number) {
    const off = rec.fileOff + index;
    const next = value & 255;
    onCommit([{ off, prev: doc.bytes[off], next }]);
  }
  function setPair(index: number, value: number) {
    const n = Math.max(0, Math.min(0xffff, Math.round(value)));
    onCommit([
      { off: rec.fileOff + index, prev: doc.bytes[rec.fileOff + index], next: n & 255 },
      { off: rec.fileOff + index + 1, prev: doc.bytes[rec.fileOff + index + 1], next: n >> 8 },
    ]);
  }
  const kind = kindOf(rec.type);
  return (
    <div className="inspector">
      <h3 style={{ color: kind.color }}>{kind.name}</h3>
      <p className="muted">
        ${rec.fileOff.toString(16).toUpperCase()} · {rec.length} bytes
      </p>
      {rec.type === 1 && (
        <>
          <Num label="Column" value={raw[2]} min={0} max={width - 1} onChange={(n) => setByte(2, n)} />
          <Num
            label="Row"
            value={raw[3] & 31}
            min={0}
            max={13}
            onChange={(n) => setByte(3, (raw[3] & 0x80) | (n & 31))}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={(raw[3] & 128) === 0}
              onChange={(e) => setByte(3, e.target.checked ? raw[3] & 0x7f : raw[3] | 0x80)}
            />
            Start visible
          </label>
          <Num label="Tile" value={raw[4]} min={0} max={255} onChange={(n) => setByte(4, n)} />
          <Num label="Visible for" value={raw[5]} min={0} max={255} onChange={(n) => setByte(5, n)} />
          <Num
            label="Not visible for"
            value={raw[6]}
            min={0}
            max={255}
            onChange={(n) => setByte(6, n)}
          />
          <Tail raw={raw} from={7} label="Timing" setByte={setByte} />
        </>
      )}
      {rec.type === 2 && <ArcherFields raw={raw} width={width} setByte={setByte} />}
      {rec.type === 3 && (
        <>
          <Num label="Id" value={raw[2]} min={0} max={255} onChange={(n) => setByte(2, n)} />
          <Num
            label="Range start"
            value={raw[3] | (raw[4] << 8)}
            min={0}
            max={65535}
            onChange={(n) => setPair(3, n)}
          />
          <Num
            label="Range end"
            value={raw[5] | (raw[6] << 8)}
            min={0}
            max={65535}
            onChange={(n) => setPair(5, n)}
          />
          <Num label="Y" value={raw[7]} min={0} max={255} onChange={(n) => setByte(7, n)} />
        </>
      )}
      {rec.type === 4 && (
        <>
          <Num label="Id" value={raw[2]} min={0} max={255} onChange={(n) => setByte(2, n)} />
          <Num
            label="X"
            value={raw[3] | (raw[4] << 8)}
            min={0}
            max={65535}
            onChange={(n) => setPair(3, n)}
          />
          <Num label="Top" value={raw[7]} min={0} max={255} onChange={(n) => setByte(7, n)} />
          <Num label="Bottom" value={raw[6]} min={0} max={255} onChange={(n) => setByte(6, n)} />
        </>
      )}
      {(rec.type === 5 || rec.type === 7 || rec.type === 8) && (
        <>
          <Num label="Id" value={raw[2]} min={0} max={255} onChange={(n) => setByte(2, n)} />
          <Num label="Column" value={raw[3]} min={0} max={width - 1} onChange={(n) => setByte(3, n)} />
          <Num label="Y" value={raw[4]} min={0} max={255} onChange={(n) => setByte(4, n)} />
          {rec.type === 5 && (
            <KeyLinkFields doc={doc} link={raw[5] ?? 0} onChange={(n) => setByte(5, n)} />
          )}
          {rec.type === 7 && (
            <SecretScriptFields value={raw[5] ?? 0} onChange={(n) => setByte(5, n)} />
          )}
        </>
      )}
      {rec.type === 6 && <CannonFields raw={raw} width={width} setByte={setByte} />}
      {rec.type === 9 && <p className="hint">No parameters. This level uses the water bank.</p>}
    </div>
  );
}

/** Secret script picker — raw[5] indexes NEWBITS.ROU secrettable. */
function SecretScriptFields({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const known = value < SECRET_DESCS.length;
  return (
    <div className="secret-script">
      <label className="field">
        <span>Secret script</span>
        <select
          value={known ? String(value) : ""}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
        >
          {!known && <option value="">Custom #{value}</option>}
          {SECRET_DESCS.map((desc, i) => (
            <option key={i} value={i}>
              #{i} — {desc}
            </option>
          ))}
        </select>
      </label>
      <Num label="Script #" value={value} min={0} max={255} onChange={onChange} />
      <p className="hint secret-script-hint">{secretDesc(value)}</p>
    </div>
  );
}

/** Key LINK / UNLINK — raw[5] opens a door (≥237) or toggles a platform/lift id. */
function KeyLinkFields({
  doc,
  link,
  onChange,
}: {
  doc: RomDoc;
  link: number;
  onChange: (n: number) => void;
}) {
  const doors = useMemo(() => loadDoors(doc), [doc]);
  const info = describeKeyLink(doc, link, doors);
  const platformIds = useMemo(() => {
    const ids = new Set<number>();
    for (const list of doc.objects) {
      for (const rec of list) {
        if (rec.type !== 3 && rec.type !== 4) continue;
        ids.add(readRaw(doc, rec)[2] ?? 0);
      }
    }
    return [...ids].filter((n) => n > 0 && n < DOOR_LINK_MIN).sort((a, b) => a - b);
  }, [doc]);

  return (
    <div className="key-link">
      <div className="key-link-head">
        <span className="key-link-badge">{info.kind === "unlinked" ? "UNLINK" : "LINK"}</span>
        <Num label="Link byte" value={link} min={0} max={255} onChange={onChange} />
      </div>
      <p className="key-link-summary">{info.summary}</p>
      <div className="key-link-actions">
        <button type="button" disabled={link === 0} onClick={() => onChange(0)} title="Set link to 0">
          Unlink
        </button>
        <label>
          Door
          <select
            value={info.kind === "door" ? String(link) : ""}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v) onChange(v);
            }}
          >
            <option value="">Open door…</option>
            {doors.map((d: DoorRec) => (
              <option key={d.link} value={d.link}>
                #{d.link} · {LEVELS[d.level].name} c{d.column} r{d.row}
              </option>
            ))}
          </select>
        </label>
        <label>
          Lift / platform
          <select
            value={info.kind === "platform" || info.kind === "unknown" ? String(link) : ""}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v) onChange(v);
            }}
          >
            <option value="">Link id…</option>
            {platformIds.map((id) => (
              <option key={id} value={id}>
                id {id}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint">
        0 = unlink. Values {DOOR_LINK_MIN}–255 open doors (door index = 255 − link). Lower values
        match platform/lift id (raw[2] on types 3/4).
      </p>
    </div>
  );
}

function ArcherFields({
  raw,
  width,
  setByte,
}: {
  raw: number[];
  width: number;
  setByte: (index: number, value: number) => void;
}) {
  const speed = signed(raw[5]);
  const flags = raw[6];
  function setFlags(next: number) {
    setByte(6, next & 255);
  }
  return (
    <>
      <Num label="Id" value={raw[2]} min={0} max={255} onChange={(n) => setByte(2, n)} />
      <Num label="Column" value={raw[3]} min={0} max={width - 1} onChange={(n) => setByte(3, n)} />
      <Num label="Y" value={raw[4]} min={0} max={255} onChange={(n) => setByte(4, n)} />
      <Num
        label="Arrow speed"
        value={Math.abs(speed)}
        min={0}
        max={127}
        onChange={(n) => setByte(5, unsigned((speed < 0 ? -1 : 1) * Math.abs(n)))}
      />
      <label className="check">
        <input
          type="checkbox"
          checked={speed < 0}
          onChange={(e) =>
            setByte(5, unsigned(e.target.checked ? -Math.abs(speed || 1) : Math.abs(speed)))
          }
        />
        Look left
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={(flags & 128) !== 0}
          onChange={(e) => setFlags(e.target.checked ? flags | 128 : flags & 127)}
        />
        Shooting high
      </label>
      <Num
        label="Health"
        value={flags & 15}
        min={0}
        max={15}
        onChange={(n) => setFlags((flags & 0xf0) | (n & 15))}
      />
      <Num label="Delay" value={raw[7]} min={0} max={255} onChange={(n) => setByte(7, n)} />
      <Tail raw={raw} from={8} label="Delay" setByte={setByte} />
    </>
  );
}

function CannonFields({
  raw,
  width,
  setByte,
}: {
  raw: number[];
  width: number;
  setByte: (index: number, value: number) => void;
}) {
  const speed = signed(raw[4]);
  return (
    <>
      <Num label="Column" value={raw[2]} min={0} max={width - 1} onChange={(n) => setByte(2, n)} />
      <Num label="Y" value={raw[3]} min={0} max={255} onChange={(n) => setByte(3, n)} />
      <Num
        label="Ball speed"
        value={Math.abs(speed)}
        min={0}
        max={127}
        onChange={(n) => setByte(4, unsigned((speed < 0 ? -1 : 1) * Math.abs(n)))}
      />
      <label className="check">
        <input
          type="checkbox"
          checked={speed < 0}
          onChange={(e) =>
            setByte(4, unsigned(e.target.checked ? -Math.abs(speed || 1) : Math.abs(speed)))
          }
        />
        Look left
      </label>
      <Num label="Delay" value={raw[5]} min={0} max={255} onChange={(n) => setByte(5, n)} />
      <Tail raw={raw} from={6} label="Delay" setByte={setByte} />
    </>
  );
}

function Tail({
  raw,
  from,
  label,
  setByte,
}: {
  raw: number[];
  from: number;
  label: string;
  setByte: (index: number, value: number) => void;
}) {
  if (raw.length <= from) return null;
  return (
    <>
      {raw.slice(from).map((value, i) => (
        <Num
          key={from + i}
          label={`${label} ${i + 2}`}
          value={value}
          min={0}
          max={255}
          onChange={(n) => setByte(from + i, n)}
        />
      ))}
    </>
  );
}

function Num({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, Math.round(n))));
        }}
      />
    </label>
  );
}

function exportPng(
  doc: RomDoc,
  level: number,
  collision: boolean,
  markers: boolean,
  hidden: Set<number>,
  animKinds: Set<string>,
  animTick: number,
  checkerboard: boolean,
  pickups: Pickup[],
  exportLayers: ExportLayers,
) {
  const map = doc.maps[level];
  const canvas = document.createElement("canvas");
  canvas.width = map.width * 16;
  canvas.height = MAP_HEIGHT * 16;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  paintLevel(ctx, doc, level, {
    zoom: 1,
    grid: "none",
    collision,
    objects: markers,
    hidden,
    selected: null,
    animKinds,
    animTick,
    checkerboard,
    pickups,
    exportLayers,
  });
  canvas.toBlob((blob) => {
    if (!blob) return;
    download(blob, `${LEVELS[level].name.replace(/\s+/g, "-").toLowerCase()}.png`);
  });
}

function pickupPadLabel(doc: RomDoc, p: Pickup): "Coin" | "Heart" | "Treasure" {
  if (!doc.blockrous) return p.kind === "heart" ? "Heart" : "Treasure";
  const tile = doc.blockAt(p.level, p.markColumn, p.row);
  const kind = kindFromBlockrou(doc.blockrous[tile]);
  if (kind === "coin") return "Coin";
  if (kind === "heart" || p.kind === "heart") return "Heart";
  return "Treasure";
}

function PickupJumpSelect({
  doc,
  pickups,
  onJump,
}: {
  doc: RomDoc;
  pickups: Pickup[];
  onJump: (p: Pickup) => void;
}) {
  const groups = useMemo(() => {
    const coins: Pickup[] = [];
    const hearts: Pickup[] = [];
    const treasures: Pickup[] = [];
    for (const p of pickups) {
      const label = pickupPadLabel(doc, p);
      if (label === "Coin") coins.push(p);
      else if (label === "Heart") hearts.push(p);
      else treasures.push(p);
    }
    return { coins, hearts, treasures };
  }, [doc, pickups]);

  const total = pickups.length;
  return (
    <label>
      Treasure
      <select
        value=""
        disabled={total === 0}
        title="Coinco coins / hearts (and any non-pad treasures)"
        onChange={(e) => {
          const key = e.target.value;
          e.target.value = "";
          if (!key) return;
          const [kind, index] = key.split(":");
          const hit = pickups.find((p) => p.kind === kind && String(p.index) === index);
          if (hit) onJump(hit);
        }}
      >
        <option value="">
          {total ? `Go to coin/heart… (${total})` : "No coinco table"}
        </option>
        {groups.coins.length > 0 && (
          <optgroup label={`Coins (${groups.coins.length})`}>
            {groups.coins.map((p) => (
              <option key={`treasure:${p.index}`} value={`treasure:${p.index}`}>
                {LEVELS[p.level].name} · Coin #{p.index + 1} · col {p.markColumn} row {p.row}
              </option>
            ))}
          </optgroup>
        )}
        {groups.hearts.length > 0 && (
          <optgroup label={`Hearts (${groups.hearts.length})`}>
            {groups.hearts.map((p) => (
              <option
                key={`${p.kind}:${p.index}`}
                value={`${p.kind}:${p.index}`}
              >
                {LEVELS[p.level].name} · Heart #{p.index + 1} · col {p.markColumn} row {p.row}
              </option>
            ))}
          </optgroup>
        )}
        {groups.treasures.length > 0 && (
          <optgroup label={`Treasure (${groups.treasures.length})`}>
            {groups.treasures.map((p) => (
              <option key={`treasure:${p.index}`} value={`treasure:${p.index}`}>
                {LEVELS[p.level].name} · Treasure #{p.index + 1} · col {p.markColumn} row {p.row}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}

interface SpawnEnemyHit {
  key: string;
  level: number;
  column: number;
  row: number;
  kind: AmbientFoe;
  tileId: number;
}

function listSpawnEnemyHits(doc: RomDoc): SpawnEnemyHit[] {
  if (!doc.blockrous) return [];
  const out: SpawnEnemyHit[] = [];
  for (let lv = 0; lv < LEVELS.length; lv++) {
    const map = doc.maps[lv];
    for (let x = 0; x < map.width; x++) {
      for (let y = 0; y < MAP_HEIGHT; y++) {
        const tileId = doc.bytes[map.dataFileOff + x * MAP_HEIGHT + y];
        const kind = kindFromBlockrou(doc.blockrous[tileId]);
        if (!kind || !AMBIENT_FOES.has(kind)) continue;
        out.push({
          key: `${lv}:${x}:${y}`,
          level: lv,
          column: x,
          row: y,
          kind: kind as AmbientFoe,
          tileId,
        });
      }
    }
  }
  return out;
}

/** Jump to spider / bat / rat blockrous pads (not object-list enemies). */
function SpawnEnemyJumpSelect({
  doc,
  rev,
  onJump,
}: {
  doc: RomDoc;
  rev: number;
  onJump: (hit: SpawnEnemyHit) => void;
}) {
  const entries = useMemo(() => listSpawnEnemyHits(doc), [doc, rev]);
  const byKind = useMemo(() => {
    const spider = entries.filter((e) => e.kind === "spider");
    const bat = entries.filter((e) => e.kind === "bat");
    const rat = entries.filter((e) => e.kind === "rat");
    return { spider, bat, rat };
  }, [entries]);
  return (
    <label>
      Spawn enemy
      <select
        value=""
        disabled={entries.length === 0}
        title="Spiders, bats, and rats placed as background tiles"
        onChange={(e) => {
          const key = e.target.value;
          e.target.value = "";
          if (!key) return;
          const hit = entries.find((en) => en.key === key);
          if (hit) onJump(hit);
        }}
      >
        <option value="">
          {entries.length ? `Go to spider/bat/rat… (${entries.length})` : "No spawn enemies"}
        </option>
        {(
          [
            ["Spiders", byKind.spider],
            ["Bats", byKind.bat],
            ["Rats", byKind.rat],
          ] as const
        ).map(([label, list]) =>
          list.length === 0 ? null : (
            <optgroup key={label} label={`${label} (${list.length})`}>
              {list.map((en) => (
                <option key={en.key} value={en.key}>
                  {LEVELS[en.level].name} · {spawnTileLabel(en.kind)} · col {en.column} row{" "}
                  {en.row}
                </option>
              ))}
            </optgroup>
          ),
        )}
      </select>
    </label>
  );
}

function ExportModal({
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

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

/** Patch startlevel + Robin spawn, then ask the Vite play bridge to open FCEUX. */
async function playFromMap(
  doc: RomDoc,
  level: number,
  onError: (msg: string | null) => void,
  spawn?: { x: number; y: number } | null,
): Promise<void> {
  onError(null);
  try {
    const patched = romForPlayFromMap(doc, level, spawn);
    const name = playRomFileName(level);
    const res = await fetch("/api/play", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Play-Label": name.replace(/\.nes$/i, ""),
      },
      body: copyBytes(patched),
    });
    if (!res.ok) {
      const detail = await res.text();
      // Fallback: still hand the user a bootable ROM if the bridge is down.
      download(copyBytes(patched), name);
      throw new Error(
        detail ||
          `Play bridge failed (${res.status}). Downloaded ${name} — open it in FCEUX.`,
      );
    }
  } catch (err) {
    if (err instanceof TypeError) {
      try {
        const patched = romForPlayFromMap(doc, level, spawn);
        download(copyBytes(patched), playRomFileName(level));
      } catch {
        /* ignore secondary failure */
      }
      onError(
        "Play bridge unreachable (is `make` / Vite running?). Downloaded a patched ROM instead.",
      );
      return;
    }
    onError(err instanceof Error ? err.message : String(err));
  }
}

function download(data: BlobPart, name: string) {
  const blob = data instanceof Blob ? data : new Blob([data]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

interface SavePicker {
  (opts: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }): Promise<{
    createWritable: () => Promise<{
      write: (data: BufferSource) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}
