# Robin spawning into a new room

How Super Robin Hood places Robin when he leaves one map strip and enters another, and what that means for the RobinEdit exit preview. Source of truth: `pds_src/src/MAPSCROL.ROU` (`checkoffscreen`, `gointonewmap`) plus `CONTROL.ROU` ladder / `solidchrs` use. Editor side: `robinedit/src/exits.ts`, `robinSpawn.ts`.

## Game start (not a room exit)

`CONTROL.ROU` `resetrobinvars` sets `robinxl = 290`, `robiny = 208`, then `MAINLOOP` calls `gointonewmap` with `startlevel equ 5` (Map 6). That is a one-shot spawn, not the strip-transition path. The React editor draws that pose only on Map 6 (`robinSpawn.ts`).

## What triggers a room change

Each frame `MAINLOOP` calls `checkoffscreen`. With Robin alive:

| Condition | Action |
|-----------|--------|
| `robiny < $20` | Going off **top**: `robiny += $D0`, height tier `+1` |
| `robiny ≥ $F0` | Going off **bottom**: `robiny -= $D0`, height tier `−1` |
| `$D8 ≤ robiny < $F0` | Ladder band — `setonladdervars`, no map change |

So vertical wrap is always **±$D0** on `robiny`. Typical arrivals:

- From below (exit **up** into the map above): ~`$10 + $D0` → **~$E0** (near bottom of the new strip).
- From above (exit **down**): ~`$F0 − $D0` → **~$20** (near top of the new strip).

Horizontal neighbors do **not** wrap Y; X is remapped only.

## How the destination map is chosen

Still in `checkoffscreen` → `changingscreen`:

1. Build Robin’s **world X** as `robinxl + times16(current map’s worldX)` (the `mapinfo+2` offset for the strip he is leaving).
2. Scan maps `0…12` for one whose `mapheights` equals the new tier **and** whose `[worldX, worldX+width)` contains that world X.
3. On match: `mapno =` that index, `jmp gointonewmap`.

If nothing matches (jumped off into void), Y is clamped (`$08` / `$F7`) and he stays on the current map.

So adjacency in the editor is the same rule we already used: **height ±1 + overlapping world X** (vertical), or **same height + abut/overlap** (horizontal). Mid-overlap alone is *not* where Robin stands.

## What `gointonewmap` does to X (and not to Y)

`gointonewmap` reloads pointer / palette / CHR, then remaps local X:

- `minmap` becomes the new strip’s world X.
- `robinxl` / `robinxh` are adjusted by the difference between old and new `minmap` (ASL×4 → pixel space), so **world X stays continuous**.
- **`robiny` is left as whatever `checkoffscreen` already wrote** — no second Y fixup.

Camera: `scrxl` tracks Robin; `y.scroll` is forced to `$EF−12`. Doors / secrets / extras reset for the new strip.

## Ladders — why mid-overlap was wrong

Vertical strip changes almost always happen while climbing. `solidchrs` stores **four 2-bit quadrant codes** per metatile; after `findsolid` masks/shifts, **value `1` = ladder** (`CONTROL.ROU` compares `solidfound` to `#1`). Full-ladder blocks on the Asia cart are IDs **$20–$24** (`solid` byte `$55` = `01010101`).

Connecting **ladder shafts** exist inside every live vertical overlap: a world column that has ladder tiles near the top of the lower map and the bottom of the upper map (or the reverse). Placing Robin at the geometric midpoint of a wide overlap often lands him on solid floor beside a door — that is what the exit-button preview was doing, and it looked wrong next to real play.

Correct editor pose for a vertical exit:

1. Pick the ladder shaft closest to the overlap mid (prefer columns that are ladders on **both** strips).
2. Pixel X = `column×16+8` (sprite center on that tile).
3. Pixel Y = wrap result (~`$E0` arriving from below, ~`$20` from above).

Horizontal exits keep continuous X at the abut/overlap column; feet Y is approximated by standing on the first non-ladder solid in that column (game does not wrap Y).

## Editor wiring

- `findMapExits` — neighbor list; vertical `fromColumn` / `toColumn` snapped to a shaft.
- `arrivalAfterExit` — left-click exit → destination map + pose above.
- `leavePoseOnExit` — right-click → same map, Robin at the exit edge (`y≈$18` top / `$F0` bottom, on the shaft).
- Stage draws that as a blue “ROBIN ← …” figure distinct from the green Map 6 start marker.

## Takeaway

Robin does not “spawn” at a door or at the center of two maps’ overlap. He keeps world X, adjusts Y by **±$D0** on vertical leave, then `gointonewmap` only rebases local X to the new `minmap`. In practice that means: **on the connecting ladder, near the bottom or top of the strip he just entered.**
