# AGENTS.md — RobinEdit

Guidance for assistants working on **RobinEdit** (Vite + React + TypeScript editor for Super Robin Hood NES, **mapper 71**).

**Credits:** React port by [ap0ught](https://github.com/ap0ught) / Christopher Mayfield; based on Windows RobinEdit by **dizzy9** (Łukasz Kur) on romhacking.net. Prefer this standalone repo: [ap0ught/robinedit](https://github.com/ap0ught/robinedit). Parent cart/docs: [ap0ught/SuperRobinHoodNESSource](https://github.com/ap0ught/SuperRobinHoodNESSource). Parent trees may keep a lagging `robinedit/` copy — see `MOVED.md` there; prefer committing/pushing **this** repo.

## Non‑negotiables

- **Edit in place** on an Asia-style layout. Do not invent object types, invent exit tables, or invent CHR-list growth.
- **Never commit `.nes` files** (or secrets). Users supply a dump; `roms/*.nes` and `public/*.nes` are gitignored. Empty-screen list comes from project-root `roms/` (`vite.roms.ts`: `/api/roms`, `/roms/*`, build manifest).
- Prefer **change-timeline review before Save** when the UI offers it.
- Validate with `npx tsc --noEmit` and `make check` when sample ROMs exist under `public/`.

## Journals

Session notes for the port and ROM layouts the editor depends on (`mapinfo`, exits, `blockrous` / ONSCREEN, objects / keys / secrets, CHR / `mapchrsdefs`, `coinco`, play-from-map):

→ **[`journals/`](journals/)** — start with [`journals/README.md`](journals/README.md).

Full game source and assembler journals (`01`–`03`, `pds_src/`) live in the parent SuperRobinHoodNESSource `journal/`.

## Skills

| Skill | Use when |
|-------|----------|
| [`.cursor/skills/robinedit-ambient-tiles`](.cursor/skills/robinedit-ambient-tiles/SKILL.md) | Spiders/bats/rats/hearts/coins as **blockrous map tiles** |
| [`.cursor/skills/robinedit-objects-secrets-keys`](.cursor/skills/robinedit-objects-secrets-keys/SKILL.md) | Object types 1–9, secrets, key links, coinco |
| [`.cursor/skills/robinedit-exits-play`](.cursor/skills/robinedit-exits-play/SKILL.md) | Exits/ladder shafts, Robin spawn, Play → FCEUX, CHR limits |

Always-on constraints: [`.cursor/rules/robinedit-core.mdc`](.cursor/rules/robinedit-core.mdc).

## Domain map (short)

| Concern | Truth |
|---------|--------|
| Ambient foes + heart/coin pads | **blockrous** metatiles (paint tiles), not Insert enemies |
| Tile panel empty/solid/passable/air/ladder | **Collision** (`solidchrs` quadrants). Ladder = quadrant code **1**. Not “no enemy” |
| Blank CHR spawn pads | Still spawn at runtime — label them |
| Treasures/hearts | `coinco` + nearby blockrous pads; `markColumn` may snap ±1 |
| Secrets | Type **7**; `raw[5]` → `NEWBITS` `secrettable`; show script descriptions |
| Keys | Type **5**; can be **unlinked** and stacked on the same cell as secrets (esp. on air) |
| Exits | Derived from **world‑X / height** + ladder shafts — no exit table. Tile status should mention `exitsUsingTile` |
| CHR | Switch only known `mapchrsdefs` sets. Cannot safely append packs (`0xFF` terminators). More data → rebuild `pds_src` or remapping hack — [issue #1](https://github.com/ap0ught/robinedit/issues/1) |
| Play from map | Patch `startlevel` + Robin spawn; title skip; avoid FCEUX `AutoLoadState` pitfalls |

## Quick commands

```bash
make          # install + http://127.0.0.1:5173/
make check    # ROM selftest (needs public/*.nes)
make build    # dist/
```

Play bridge: `vite.play-bridge.ts` (dev `/api/play`). Local ROM list: `vite.roms.ts` + `roms/`. Source under `src/`.
