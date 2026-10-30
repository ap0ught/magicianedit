---
name: robinedit-exits-play
description: >-
  Explains RobinEdit map exits, ladder shafts, Robin spawn, and Play-from-map
  FCEUX bridge. Use when wiring exits, placing Robin, debugging play patches,
  AutoLoadState blank screens, or CHR set switching limits.
---

# RobinEdit exits, spawn, play

## Exits (no table)

Exits are **derived**: overlapping **world‑X** ranges between strips at neighboring **height** tiers, using climbable **ladder shafts**. There is no exit ID list in the ROM.

- Vertical leave: rim Y wrap (`EXIT_Y_WRAP` / `$D0` band) + height ±1 + world overlap.
- Ladder detection: `solidchrs` quadrant code **1** (`blockHasLadder`).
- Tile / column UI should report `exitsUsingTile` / column exits when a cell is part of a shaft (including mid-shaft masonry), not only when the rim ladder tile is selected.

See `src/exits.ts` and `journals/07-map-exits-and-shafts.md`.

## Robin placement / play-from-map

`romForPlayFromMap` (`src/play.ts`):

1. Skip title screen.
2. Patch **`startlevel`** immediate to the target map.
3. Patch **Robin** `robinxl` / `xh` / `y` (world X = strip `worldX×16` + local X).

Optional spawn: exit-arrival pose, else a scored left-side floor (`spawnPose`).

## FCEUX pitfalls

- Prefer the Vite **play bridge** (`vite.play-bridge.ts` → `/api/play`): writes `.play/*.nes`, opens via desktop handler, **avoids `--loadstate`**.
- `SDL.AutoLoadState` in `~/.fceux/fceux.cfg`: values **0–9** auto-load that slot; a missing slot → blank bar screen. Bridge heals this to **99** (disabled).
- Do not launch with `--loadstate` for play-from-map.

## CHR switching (related limit)

Only **switch** among known `mapchrsdefs` sets (Dungeon / Hall / Church / Sky). Lists are **`0xFF`-terminated**; the editor cannot safely append packs. More CHR/map/object room → rebuild from `pds_src` or a remapping hack — [issue #1](https://github.com/ap0ught/robinedit/issues/1).

## Save

When dirty, prefer the **change timeline** review UI before writing the ROM (discard unchecked steps).

## Code anchors

- `src/exits.ts`, `src/play.ts`, `src/robinSpawn.ts`, `vite.play-bridge.ts`
- `src/settings.ts` — `CHR_SETS` / `orderedChrSets`
