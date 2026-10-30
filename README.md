# RobinEdit

Browser-based map / object editor for **Super Robin Hood** (NES, Codemasters, mapper 71).

This is a Vite + React + TypeScript remake of the Windows [RobinEdit 0.4.4](https://www.romhacking.net/utilities/1828/) utility (Łukasz Kur / dizzy9), aimed at reading and writing the same Asia-style cart layout: map strips, typed objects, PP1 CHR packs, and Robin stats.

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

## License / cart IP

Editor source in this repo is yours to use under whatever terms you apply here. The Super Robin Hood ROM and original game assets remain third-party IP — obtain a dump you are allowed to use; do not commit `.nes` files to this repository.
