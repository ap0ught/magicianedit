---
name: robinedit-ambient-tiles
description: >-
  Places and recognizes Super Robin Hood ambient foes and heart/coin pads as
  blockrous map tiles in RobinEdit. Use when painting spiders, bats, rats,
  hearts, or coins; when Insert enemies look wrong; when blank CHR tiles still
  spawn; or when the tile panel collision labels are confusing.
---

# RobinEdit ambient / spawn tiles

## Rule

Spider, bat, rat, heart, and coin spawns are **map metatiles** classified by `ONSCREEN.ROU` **`blockrous`**, not object-list enemies. Paint them in Background mode; do **not** use Objects → Insert for ambient foes.

## How to place

1. Open Background mode.
2. Use the ambient / special-tile pick row (or eyedrop an existing pad) so the paint tile is the blockrous spawn ID for that kind.
3. Paint the cell. Runtime draws the foe/pickup even when CHR for that metatile looks blank.

Discover IDs from the loaded ROM via `spawnTileEntries(doc.blockrous)` / the UI picks — do not hardcode inventively. On typical Asia carts, examples include pads around `$5B`, `$B2`, `$B3`, `$5C`, `$F3` (exact IDs follow the cart’s `blockrous` table; `$F3` is commonly the coin pad).

## Collision panel is not “empty of enemies”

Tile status **empty / solid / passable / air / ladder** comes from **`solidchrs`** quadrant codes:

| Code | Meaning |
|------|---------|
| 0 | air |
| 1 | ladder |
| 2 | semifloor |
| 3 | solid |

`describeSolid` summaries: ladder / semifloor / solid / passable (tile `$00` often shown as **air**). That label is **collision**, not “this cell has no foe.”

Blank CHR spawn pads still need **spawn labels** in the UI (`spawnTileLabel` / overlays in `draw.ts`).

## Code anchors

- `src/anim.ts` — `kindFromBlockrou`, `SPAWN_TILES`, `spawnTiles`
- `src/draw.ts` — blockrous spawn overlays
- `src/App.tsx` — ambient tile picks + tile panel status
