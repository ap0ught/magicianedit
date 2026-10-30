# RobinEdit

Browser-based map / object editor for **Super Robin Hood** (NES, Codemasters, mapper 71).

This is a Vite + React + TypeScript remake of the Windows [RobinEdit 0.4.4](https://www.romhacking.net/utilities/1828/) utility by **Łukasz Kur / dizzy9** (upstream tool author on romhacking.net). It aims at the same Asia-style cart layout: map strips, typed objects, PP1 CHR packs, and Robin stats.

**Versioning:** dizzy9’s Windows tool is **0.4.4**. This React app’s first milestone release is **v0.5.0** (React port of that utility). Original Windows archives live in [`upstream/`](upstream/) with attribution — see [`docs/RELEASE.md`](docs/RELEASE.md) for GitHub Actions builds and desktop-exe options.

## ROM requirement

RobinEdit does **not** ship Super Robin Hood ROMs. You need a mapper-71 Super Robin Hood `.nes` dump (the common Asia/En unlicensed cart works; rebuilt/reassembled images with the same layout also work).

Ways to open a cart:

1. **Drop** a `.nes` file onto the editor window, or use **Open**.
2. Optional quick-load buttons: place sample files at `public/asia.nes` and/or `public/rebuilt.nes` (gitignored). Then `make` and use the empty-state sample links.

`make check` expects those same `public/*.nes` files and asserts map widths, PP1 tiles, exits, pickups, and object insert/delete.

## Journals / agent notes

Editor session notes (ROM layouts, exits, tiles, port status) live in [`journals/`](journals/). Start with [`journals/README.md`](journals/README.md). Agent guidance: [`AGENTS.md`](AGENTS.md).

## Relation to the parent project

This editor grew inside [ap0ught/SuperRobinHoodNESSource](https://github.com/ap0ught/SuperRobinHoodNESSource) (official PDS source, cc65 rewrite notes, docs, and tooling). It was split out so the React editor can version and ship on its own.

Useful companions:

- [SuperRobinHoodNESSource](https://github.com/ap0ught/SuperRobinHoodNESSource) — cart source / docs where this editor started
- [ap0ught/SuperRobinHood](https://github.com/ap0ught/SuperRobinHood) — byte-identical rebuild, PP1 codec, music, and map tooling

## Run

```bash
make          # npm install if needed, then http://127.0.0.1:5173/
make check    # ROM selftest (needs public/*.nes)
make build    # production build → dist/
```

Requires Node.js and npm.

## Upstream Windows RobinEdit

Original Clickteam/MMF2 Windows editor by **dizzy9** (Łukasz Kur): archives and credit notes in [`upstream/`](upstream/). Also attached to GitHub Releases when published.

## Build / release

- Local: `make build` → static `dist/` SPA.
- GitHub Actions: tag `v*` → [`.github/workflows/release.yml`](.github/workflows/release.yml) runs `npm ci && npm run build` and attaches a dist tarball to the release.
- Native Win/Mac/Linux **exe**: React stays web; wrap later with Tauri (preferred light shell), Electron, PWA, or Capacitor — see [`docs/RELEASE.md`](docs/RELEASE.md). Not required for the browser editor.

## License / cart IP

Editor source in this repo is yours to use under whatever terms you apply here. The Super Robin Hood ROM and original game assets remain third-party IP — obtain a dump you are allowed to use; do not commit `.nes` files to this repository. Upstream Windows RobinEdit remains dizzy9’s work.
