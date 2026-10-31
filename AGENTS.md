# AGENTS.md — MagicianEdit

Guidance for assistants working on **MagicianEdit** (Vite + React + TypeScript editor for **Magician**, NES, Taxan / Eurocom, **MMC3**). This tree started as a port of RobinEdit. Magician load/save lives in **`src/magician/`**. The open path must use that loader. Mapper 71 carts are rejected.

**Credits:** [ap0ught](https://github.com/ap0ught) / Christopher Mayfield. The shell comes from [ap0ught/robinedit](https://github.com/ap0ught/robinedit) (React port of Windows RobinEdit by **dizzy9** / Łukasz Kur). Commit and push **this** repo.

## Related repos

| Repo | Role |
|------|------|
| [ap0ught/magician-nes-re](https://github.com/ap0ught/magician-nes-re) | Magician rebuild and cart registry (`asm/patches.py`, `tools/carts.py`). Local checkout is often `magician-nes`. |
| [ap0ught/pds6502](https://github.com/ap0ught/pds6502) | PDS assembler used by the Magician rebuild |
| [ap0ught/robinedit](https://github.com/ap0ught/robinedit) | Inherited editor (mapper 71) |
| [ap0ught/SuperRobinHoodNESSource](https://github.com/ap0ught/SuperRobinHoodNESSource) | Where RobinEdit originally lived |

Cite magician-nes journals instead of copying them (`19-between-beta1-and-release.md`, `18-draw-layer-scaffold.md`, `05-bizhawk-is-the-instrument.md`).

## Non-negotiables

- **Never commit `.nes` files** (or secrets). Users supply a dump; `roms/*.nes` and `public/*.nes` are gitignored. Policy: [`docs/ROMS.md`](docs/ROMS.md). Pin research to **Beta 1** first.
- **Do not grow the frozen Robin format modules.** Magician load/save is `src/magician/`. Leave the mapper 71 modules compiling in place; do not move or delete them. Decision: [`journal/10-scaffold-dump-policy.md`](journal/10-scaffold-dump-policy.md).
- Prefer **change-timeline review before Save** when the UI offers it.
- Validate with `npx tsc --noEmit` and `make check` when sample ROMs exist under `public/`.

## Journals

MagicianEdit port notes: **[`journal/`](journal/)** — start with [`journal/README.md`](journal/README.md).

Inherited Robin session notes (historical, still useful while mapper 71 code is live): **[`journals/`](journals/)** — [`journals/README.md`](journals/README.md) through [`09-robin-settings-cheatlives.md`](journals/09-robin-settings-cheatlives.md).

## Inherited Robin domain (mapper 71)

That domain is **not** on the open path. Skills and the table below describe the frozen mapper 71 modules only.

| Skill | Use when |
|-------|----------|
| [`.cursor/skills/robinedit-ambient-tiles`](.cursor/skills/robinedit-ambient-tiles/SKILL.md) | Spiders/bats/rats/hearts/coins as **blockrous map tiles** |
| [`.cursor/skills/robinedit-objects-secrets-keys`](.cursor/skills/robinedit-objects-secrets-keys/SKILL.md) | Object types 1–9, secrets, key links, coinco |
| [`.cursor/skills/robinedit-exits-play`](.cursor/skills/robinedit-exits-play/SKILL.md) | Exits/ladder shafts, Robin spawn, Play → FCEUX, CHR limits |

Always-on constraints for that shell: [`.cursor/rules/robinedit-core.mdc`](.cursor/rules/robinedit-core.mdc).

| Concern | Truth (inherited cart only) |
|---------|------------------------------|
| Ambient foes + heart/coin pads | **blockrous** metatiles (paint tiles), not Insert enemies |
| Tile panel empty/solid/passable/air/ladder | **Collision** (`solidchrs` quadrants). Ladder = quadrant code **1**. Not “no enemy” |
| Blank CHR spawn pads | Still spawn at runtime — label them |
| Treasures/hearts | `coinco` + nearby blockrous pads; `markColumn` may snap ±1 |
| Secrets | Type **7**; `raw[5]` → `NEWBITS` `secrettable`; show script descriptions |
| Keys | Type **5**; can be **unlinked** and stacked on the same cell as secrets (esp. on air) |
| Exits | Derived from **world‑X / height** + ladder shafts — no exit table. Tile status should mention `exitsUsingTile` |
| CHR | Switch only known `mapchrsdefs` sets. Cannot safely append packs (`0xFF` terminators). More data → rebuild `pds_src` or remapping hack — [robinedit issue #1](https://github.com/ap0ught/robinedit/issues/1) |
| Play from map | Patch `startlevel` + Robin spawn; title skip; avoid FCEUX `AutoLoadState` pitfalls |
| Robin lives / hearts / jump / run table | Cart immediates (`MAINLOOP` / `GENERAL` / `CONTROL`); editor UX from dizzy9 `[robin]`; React `findRobinStats` / `patchRobin` — [journal 09](journals/09-robin-settings-cheatlives.md) |

## Quick commands

```bash
make          # install + http://127.0.0.1:5173/
make check    # Magician synthetic load/save, then the inherited mapper 71 selftest
make build    # dist/
```

Play bridge: `vite.play-bridge.ts` (dev `/api/play`). Local ROM list: `vite.roms.ts` + `roms/`. Source under `src/`.
