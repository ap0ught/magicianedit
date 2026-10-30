# MagicianEdit

Browser-based map / object editor for **Magician** (NES, Taxan / Eurocom, MMC3) — **planned** port of [RobinEdit](https://github.com/ap0ught/robinedit).

This repository starts as a same-owner clone of `ap0ught/robinedit` (GitHub does not allow forking a repo you already own). The React + Vite + TypeScript shell remains; Magician ROM formats, map UI, objects, and play-from-map are **not** ported yet. Track work via GitHub **milestones** and **issues**.

## Status

**Planning only.** Package `magicianedit` **0.1.0**. Do not expect Magician load/save or map editing yet. The current tree still embeds Super Robin Hood (mapper 71) editor logic from RobinEdit until those milestones land. Port notes: [`journal/`](journal/). Inherited Robin notes: [`journals/`](journals/). Assistant guide: [`AGENTS.md`](AGENTS.md).

## Related repos

| Repo | Role |
|------|------|
| [ap0ught/robinedit](https://github.com/ap0ught/robinedit) | Source editor (Super Robin Hood / mapper 71) being ported |
| [ap0ught/magician-nes-re](https://github.com/ap0ught/magician-nes-re) | Magician rebuild / research (`magician-nes` locally) |
| [ap0ught/pds6502](https://github.com/ap0ught/pds6502) | PDS assembler tooling used by Magician rebuild |
| [ap0ught/SuperRobinHoodNESSource](https://github.com/ap0ught/SuperRobinHoodNESSource) | Where RobinEdit originally lived |

## ROM requirement

MagicianEdit will **not** ship Magician ROMs. Dump policy (Beta 1 pin, battery bit, vectors, gitignored `roms/`): **[`docs/ROMS.md`](docs/ROMS.md)**. Do **not** commit `.nes` files.

Until Magician I/O lands, the inherited shell still expects a mapper 71 cart for local smoke tests. A Magician dump will not load yet.

## Run (inherited shell)

```bash
make          # npm install if needed, then http://127.0.0.1:5173/
make build    # production build → dist/
```

Requires Node.js and npm.

## Credits

| Role | Who |
|------|-----|
| MagicianEdit (this repo) | [Christopher Mayfield](https://github.com/ap0ught) / **ap0ught** |
| RobinEdit React port | same — [ap0ught/robinedit](https://github.com/ap0ught/robinedit) |
| Upstream Windows RobinEdit | **Łukasz Kur** / **dizzy9** — [romhacking.net/utilities/1828](https://www.romhacking.net/utilities/1828/) |
| Magician source release | **Chris Shrigley** / Eurocom (educational package) |

Magician and Super Robin Hood ROM/assets remain third-party IP — obtain dumps you are allowed to use; do not commit `.nes` files.
