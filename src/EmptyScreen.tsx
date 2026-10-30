import { useEffect, useState } from "react";

/** Rebuilt mapper-71 cart from the parent source repo Releases (download → place in roms/). */
export const REBUILT_ROM_URL =
  "https://github.com/ap0ught/SuperRobinHoodNESSource/releases/latest";

export const REBUILD_ROMS_HINT =
  "Download srh-rebuilt.nes from SuperRobinHoodNESSource Releases, then drop it into the project roms/ folder.";

export const CREDITS = {
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

/** Attribution links shown on the empty screen and About modal. */
export function CreditsBlock() {
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

/** Empty-state ROM picker (file open + roms/ listing). */
export function Empty({
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

  /** Reload the roms/ folder listing from the Vite middleware. */
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
    /** HMR hook: refresh the roms/ list when files change. */
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
