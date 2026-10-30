# AGENTS

Guidance for assistants working on **RobinEdit** (Vite + React + TypeScript editor for Super Robin Hood NES, mapper 71).

## Do not commit ROMs

Never add `.nes` files. Users supply their own cart dump (`public/asia.nes` / `public/rebuilt.nes` are gitignored samples).

## Quick commands

```bash
make          # install + http://127.0.0.1:5173/
make check    # ROM selftest (needs public/*.nes)
make build    # dist/
```

## Journals

Session notes for the port and ROM layouts the editor depends on (`mapinfo`, exits, `blockrous` / ONSCREEN, objects / keys / secrets, CHR / `mapchrsdefs`, `coinco`, play-from-map):

→ **[`journals/`](journals/)** — start with [`journals/README.md`](journals/README.md).

Full game source and assembler journals live in [SuperRobinHoodNESSource](https://github.com/ap0ught/SuperRobinHoodNESSource) (`journal/`, `pds_src/`).

## Skills

Project skills under [`.cursor/skills/`](.cursor/skills/) (if present). Prefer those for ROM-edit workflows; keep this file as the map of where to look.

## Source of truth

Standalone repo: [ap0ught/robinedit](https://github.com/ap0ught/robinedit). Parent tree may keep a lagging `robinedit/` copy — see `MOVED.md` there.
