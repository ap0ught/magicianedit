import { useEffect, useRef, useState } from "react";
import { Empty } from "./EmptyScreen.tsx";
import { BlockStage } from "./magician/BlockStage.tsx";
import {
  applyEdit,
  editPackByte,
  levelWindow,
  loadMagician,
  paintMapCell,
  saveMagician,
  type CellEdit,
  type MagicianDoc,
} from "./magician/document.ts";

/** MagicianEdit shell. Open goes through the MMC3 loader, not the mapper 71 parser. */
export function App() {
  const fileRef = useRef<HTMLInputElement>(null);
  const undoStack = useRef<CellEdit[]>([]);
  const redoStack = useRef<CellEdit[]>([]);
  const api = useRef({ undo: () => {}, redo: () => {}, save: () => {} });

  const [doc, setDoc] = useState<MagicianDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [brush, setBrush] = useState(1);
  const [rev, setRev] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const [hover, setHover] = useState("");
  const [about, setAbout] = useState(false);

  function resetHistory() {
    undoStack.current = [];
    redoStack.current = [];
    setHistory({ undo: 0, redo: 0 });
  }

  function openBytes(bytes: Uint8Array, name: string) {
    try {
      const next = loadMagician(bytes, name);
      setDoc(next);
      setError(null);
      setLevel(0);
      setDirty(false);
      setHover("");
      resetHistory();
      setRev((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function readFile(file: File) {
    void file.arrayBuffer().then((buf) => openBytes(new Uint8Array(buf), file.name));
  }

  function commit(edit: CellEdit | null) {
    if (!edit) return;
    undoStack.current.push(edit);
    redoStack.current = [];
    setHistory({ undo: undoStack.current.length, redo: 0 });
    setDirty(true);
    setRev((n) => n + 1);
  }

  function undo() {
    if (!doc) return;
    const edit = undoStack.current.pop();
    if (!edit) return;
    applyEdit(doc, edit, true);
    redoStack.current.push(edit);
    setHistory({ undo: undoStack.current.length, redo: redoStack.current.length });
    setDirty(true);
    setRev((n) => n + 1);
  }

  function redo() {
    if (!doc) return;
    const edit = redoStack.current.pop();
    if (!edit) return;
    applyEdit(doc, edit, false);
    undoStack.current.push(edit);
    setHistory({ undo: undoStack.current.length, redo: redoStack.current.length });
    setDirty(true);
    setRev((n) => n + 1);
  }

  async function writeRom(forcePicker: boolean) {
    if (!doc) return;
    const bytes = saveMagician(doc);
    const base = doc.name.toLowerCase().endsWith(".nes") ? doc.name : `${doc.name}.nes`;
    const suggested = forcePicker ? base.replace(/\.nes$/i, "-edit.nes") : base;
    const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
    try {
      if (picker) {
        const handle = await picker({
          suggestedName: suggested,
          types: [{ description: "NES ROM", accept: { "application/octet-stream": [".nes"] } }],
        });
        const writable = await handle.createWritable();
        const copy = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(copy).set(bytes);
        await writable.write(copy);
        await writable.close();
      } else {
        download(bytes, suggested);
      }
      setDirty(false);
      resetHistory();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  api.current = { undo, redo, save: () => void writeRom(false) };

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const el = event.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && key === "z") {
        event.preventDefault();
        if (event.shiftKey) api.current.redo();
        else api.current.undo();
        return;
      }
      if (mod && key === "y") {
        event.preventDefault();
        api.current.redo();
        return;
      }
      if (mod && key === "s") {
        event.preventDefault();
        api.current.save();
        return;
      }
      if (!doc) return;
      if (event.key === "[") setLevel((n) => Math.max(0, n - 1));
      else if (event.key === "]") setLevel((n) => Math.min(doc.levels.length - 1, n + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doc]);

  useEffect(() => {
    if (!dirty) return;
    const fn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [dirty]);

  const current = doc?.levels[level] ?? null;
  const view = current ? levelWindow(current) : null;

  return (
    <div
      className="app"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) readFile(file);
      }}
    >
      <header className="bar">
        <div className="brand">
          <strong>MagicianEdit</strong>
          <span>0.1.0</span>
        </div>
        <button onClick={() => fileRef.current?.click()}>Open</button>
        <button disabled={!doc} onClick={() => void writeRom(false)}>
          Save{dirty ? " *" : ""}
        </button>
        <button disabled={!doc} onClick={() => void writeRom(true)}>
          Save as
        </button>
        <button disabled={!doc || !history.undo} onClick={undo} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button disabled={!doc || !history.redo} onClick={redo} title="Redo (Ctrl+Shift+Z)">
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
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) readFile(file);
            event.target.value = "";
          }}
        />
      </header>

      {!doc && (
        <Empty
          error={error}
          onOpen={() => fileRef.current?.click()}
          onSample={(url, label) => {
            void fetch(url)
              .then((res) => {
                if (!res.ok) throw new Error(`Could not read ${label}`);
                return res.arrayBuffer();
              })
              .then((buf) => openBytes(new Uint8Array(buf), label))
              .catch((err) => setError(err instanceof Error ? err.message : String(err)));
          }}
          onAbout={() => setAbout(true)}
        />
      )}

      {doc && current && view && (
        <>
          <div className="bar sub">
            <label>
              Level
              <select
                value={level}
                onChange={(event) => {
                  setLevel(Number(event.target.value));
                  setHover("");
                }}
              >
                {doc.levels.map((entry) => (
                  <option key={entry.index} value={entry.index}>
                    {entry.index.toString(16).padStart(2, "0")} {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Brush
              <input
                type="number"
                min={0}
                max={255}
                value={brush}
                onChange={(event) => setBrush(Math.max(0, Math.min(255, Number(event.target.value) || 0)))}
              />
            </label>
            <span className="hint">
              window {current.xorg},{current.yorg} {view.cols}×{view.rows} in map {current.map.width}×
              {current.map.height}
            </span>
            <span className="spacer" />
            <span className="hover-status">{hover}</span>
          </div>
          {doc.warning && <p className="warn">{doc.warning}</p>}
          {error && <p className="error">{error}</p>}
          <div className="workspace">
            <div className="stage-column">
              <div className="stage">
                {view.cols > 0 && view.rows > 0 ? (
                  <BlockStage
                    level={current}
                    revision={rev}
                    onPaint={(x, y) => commit(paintMapCell(current, x, y, brush))}
                    onPick={setBrush}
                    onHover={setHover}
                  />
                ) : (
                  <p className="hint">This descriptor's window does not cover any map cells.</p>
                )}
              </div>
            </div>
            <aside className="side">
              <div className="side-body">
                <p>
                  <strong>{current.name}</strong>
                </p>
                <p className="hint">
                  PRG banks ${current.mapBank.toString(16)} map/blocks, ${current.colBank.toString(16)} colour.
                  CHR bank {current.chrBank} ({current.chr.bytes.length} bytes).
                </p>
                <p className="hint">
                  {current.blk.bytes.length / 4} metatiles. {current.col.bytes.length} colour bytes (attribute, not
                  collision), stride {current.map.width / 2}.
                </p>
                <p className="hint">Background palette {current.palIndex}, 12 bytes. Backdrop $0F is added at runtime.</p>
                <div className="pal-bytes">
                  {Array.from(current.pal.bytes, (byte, index) => (
                    <input
                      key={`${current.pal.fileOff}-${index}-${byte}`}
                      aria-label={`Palette byte ${index}`}
                      defaultValue={byte.toString(16).padStart(2, "0")}
                      onBlur={(event) => {
                        const text = event.target.value.trim();
                        if (!/^[0-9a-fA-F]{1,2}$/.test(text)) return;
                        commit(editPackByte(current.pal, index, Number.parseInt(text, 16)));
                      }}
                    />
                  ))}
                </div>
                <p className="hint">Left click paints the brush. Right click picks a block index. [ and ] change level.</p>
              </div>
            </aside>
          </div>
        </>
      )}

      {about && (
        <div className="modal-backdrop" onClick={() => setAbout(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Author">
            <h2>Author</h2>
            <p>
              MagicianEdit opens Magician MMC3 carts (mapper 4, 128 KiB PRG + 128 KiB CHR) and round-trips
              map, block, colour, palette, and CHR packs. The title scene is not part of that document.
            </p>
            <button className="primary" onClick={() => setAbout(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface SavePicker {
  (opts: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }): Promise<{
    createWritable: () => Promise<{ write: (data: ArrayBuffer) => Promise<void>; close: () => Promise<void> }>;
  }>;
}

function download(bytes: Uint8Array, name: string) {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const url = URL.createObjectURL(new Blob([copy]));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
