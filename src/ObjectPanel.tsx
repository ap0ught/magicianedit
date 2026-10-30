import { useMemo } from "react";
import {
  spawnTileEntries,
  spawnTileLabel,
} from "./anim.ts";
import {
  DOOR_LINK_MIN,
  describeKeyLink,
  keyLinkShort,
  loadDoors,
  type DoorRec,
} from "./keys.ts";
import {
  KINDS,
  anchorOf,
  kindOf,
  readRaw,
  signed,
  unsigned,
} from "./objects.ts";
import { SECRET_DESCS, secretDesc, secretLabel, secretShort } from "./secrets.ts";
import {
  LEVELS,
  MAP_HEIGHT,
  deleteObject,
  insertObject,
  objectFreeBytes,
  type Edit,
  type ObjRec,
  type RomDoc,
} from "./rom.ts";

/** Map column for an object record, or null if it has no column anchor. */
export function objectColumn(doc: RomDoc, level: number, index: number): number | null {
  const rec = doc.objects[level][index];
  if (!rec) return null;
  const a = anchorOf(rec.type, readRaw(doc, rec));
  if (!a) return null;
  return Math.max(0, Math.min(doc.maps[level].width - 1, Math.floor(a.x / 16)));
}

/** Object list, hide toggles, insert/delete for the current level. */
export function ObjectPanel({
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

/** Raw-byte editor for the selected object record. */
export function Inspector({
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
  /** Patch one byte of the selected object via undoable edit. */
  function setByte(index: number, value: number) {
    const off = rec.fileOff + index;
    const next = value & 255;
    onCommit([{ off, prev: doc.bytes[off], next }]);
  }
  /** Patch a little-endian u16 field of the selected object. */
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
export function SecretScriptFields({
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
export function KeyLinkFields({
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

/** Archer-specific inspector controls (speed, aim, delay). */
export function ArcherFields({
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
  /** Write archer flags byte (raw[6]). */
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

/** Cannon-specific inspector controls (speed / delay). */
export function CannonFields({
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

/** Small trailing hint text under a form field. */
export function Tail({
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

/** Labeled numeric input that commits on blur / Enter. */
export function Num({
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
