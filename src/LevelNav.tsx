import { useMemo } from "react";
import { findMapExits, type MapExit } from "./exits.ts";
import { KINDS } from "./objects.ts";
import type { Pickup } from "./pickups.ts";
import { LEVELS, MAP_HEIGHT, type RomDoc } from "./rom.ts";
import { chrSetName, describeChrPacks } from "./settings.ts";

export const EXIT_DIR_LABEL: Record<MapExit["dir"], string> = {
  up: "▲ Up",
  down: "▼ Down",
  left: "◀ Left",
  right: "▶ Right",
};

/** Off-canvas exit navigation — never overlaps the paint surface. */
export function ExitsRail({
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
export function LevelHub({
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
