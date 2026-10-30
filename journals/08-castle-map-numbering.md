# Castle map numbering vs geography

On the Castle Map overview the lower strips climb 1→8 in a natural stack, but the **sky / upper church** band reads left-to-right as **9 · 12 · 10**, with **11 · 13** on top — not 9·10·11·12·13. That is not a drawing bug. Editor “Map N” is the **live `mapinfo` slot index + 1**, while the overview places strips by **`mapheights` + world X**. Those two orders disagree above the church.

## What the overview draws

`paintWorldOverview` (`overview.ts`) puts each strip at:

- **X** = `worldX × scale`
- **Y** = `(maxTier − 1 − height) × 14 × scale`

So geography is pure ROM layout. Labels are still “Map 1”…“Map 13” from table order.

## Live table order (editor Map 1–13)

Thirteen live rows in `MAPSCROL.ROU` `mapinfo` (Asia cart matches). Commented-out slots **`mapa`**, **`mapk`**, **`mapp`** are not in the table — letter names skip them, but editor numbers do **not** skip; they renumber contiguously:

| Slot | Editor | PDS label | Tier | World X | Width | Area |
|------|--------|-----------|------|---------|-------|------|
| 0 | Map 1 | `mapb` | 0 | 88 | 72 | Lava cavern |
| 1 | Map 2 | `mapc` | 1 | 32 | 32 | Water caves |
| 2 | Map 3 | `mapd` | 1 | 80 | 16 | Water caves |
| 3 | Map 4 | `mape` | 1 | 128 | 64 | Water caves |
| 4 | Map 5 | `mapf` | 2 | 0 | 208 | Dungeon |
| 5 | Map 6 | `mapg` | 3 | 0 | 176 | Kitchen / halls |
| 6 | Map 7 | `maph` | 4 | 0 | 176 | Halls |
| 7 | Map 8 | `mapi` | 5 | 16 | 160 | Church |
| 8 | Map 9 | `mapj` | 6 | 16 | 40 | Bedrooms |
| 9 | Map 10 | `mapl` | 6 | **144** | 32 | Sky battlements |
| 10 | Map 11 | `mapm` | 7 | **24** | 24 | Sky towers |
| 11 | Map 12 | `mapn` | 6 | **88** | 32 | Church loft |
| 12 | Map 13 | `mapo` | 7 | **106** | 16 | Sky walk |

`mapheights` in `MAPDATA.DAT` is `0,1,1,1,2,3,4,5,6,6,7,6,7` for those thirteen (a trailing `8` sits after the live list).

## Spatial order (what you see)

**Tier 6** (middle “towers” row), left → right by world X:

1. **Map 9** bedrooms `[16, 56)`
2. **Map 12** church loft `[88, 120)` ← middle tower, number **12**
3. **Map 10** sky battlements `[144, 176)` ← right, number **10**

**Tier 7** (top), left → right:

1. **Map 11** sky towers `[24, 48)` — sits over Map 9
2. **Map 13** sky walk `[106, 122)` — sits over Map 12

So the overview reads **9 – 12 – 10** then **11 – 13**. Sky content is split across non-consecutive numbers; the middle loft is “12” because it is the 12th live slot (`mapn`), not because it is the second sky piece geographically.

```
tier 7:   [ 11 towers ]           [ 13 walk ]
tier 6:   [ 9 bedrooms ]  [ 12 loft ]  [ 10 battlements ]
tier 5:   [============ 8 church =======================]
```

Connections follow geography (and ladders), not number order: Map 8 ups into 9, 12, and 10; Map 9 ups into 11; Map 12 ups into 13. See [`07-map-exits-and-shafts.md`](07-map-exits-and-shafts.md).

## Why the table is “out of order”

`mapno` / object lists / `tuneforstrip` / `maprouspointer` all index the **same** dense 0…12 table the game walks in `checkoffscreen`. Authors ordered rows by how content was added and by which letter labels were free after dropping unused strips — **not** by sorting on world X.

In particular, after bedrooms (`mapj`):

- next live row is **`mapl`** (battlements, far right, tier 6) → editor Map **10**
- then **`mapm`** (towers, left top, tier 7) → Map **11**
- then **`mapn`** (loft, middle, tier 6) → Map **12**
- then **`mapo`** (walk, middle-top, tier 7) → Map **13**

`mapk` is commented out in source (would have been another strip; never shipped in the live list). Dizzy9’s RobinEdit and this port both number **1…13 in table order**, so they inherit the same “swapped middle tower” look on a geographic castle view.

Lower castle (Maps 1–8) mostly rises with tier as index increases, so numbering *looks* sequential until the sky fork.

## Takeaway

- **Map N** = Nth strip in `mapinfo` (game index + 1).
- **Castle Map position** = `(worldX, mapheights)`.
- Sky towers are not one numbered group: battlements are 10, loft is 12, towers/walk are 11/13, interleaved in the table so the middle tower is labeled 12 between 9 and 10.

No ROM bug — two different sort keys. If the UI ever showed “geographic order” numbers it would disagree with every `mapno` reference in objects, secrets, and doors.
