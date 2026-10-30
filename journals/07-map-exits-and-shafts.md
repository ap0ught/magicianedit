# Map exits and ladder shafts

There is **no exit table** in the ROM. Super Robin Hood invents “doors between rooms” from strip geometry + ladders. RobinEdit’s Exits rail is a live view of that same rule. Spawn pose after a wrap is covered in [`06-robin-room-spawn.md`](06-robin-room-spawn.md); this note is about *which* connections exist and how the editor lists them.

Sources: `MAPSCROL.ROU` (`checkoffscreen`, `gointonewmap`, `mapinfo`, `mapheights`), `CONTROL.ROU` / `solidchrs` for ladders, editor `robinedit/src/exits.ts`.

## How the game does it

### Strips, not rooms with portals

Live maps are thirteen horizontal strips (`mapb`…`mapo` in source; editor Map 1–13). Each has:

- `mapinfo`: pointer, **world X**, **width**, palette, CHR set
- `mapheights`: vertical **tier** (0 = bottom of the castle)

Robin’s true horizontal place is **world X** = local `robinxl` + `16 ×` current strip’s world X. Leaving a strip does not look up an exit ID; it asks “is there another strip at the new height whose world range covers me?”

### Vertical leave (`checkoffscreen`)

| `robiny` | Effect |
|---------|--------|
| `< $20` | Off **top** → `robiny += $D0`, height tier **+1** |
| `≥ $F0` | Off **bottom** → `robiny -= $D0`, height tier **−1** |
| `$D8`…`$EF` | Ladder comfort band (`setonladdervars`), no map change |

Then scan maps high→low for `mapheights == new tier` and world X ∈ `[worldX, worldX+width)`. First hit wins → `gointonewmap`.

Important: the destination search **does not require a ladder** on the far side. Climbing (or falling) off the rim at a world column that only overlaps a neighbor is enough. A matching ladder on the other strip is what makes the climb *feel* continuous; without it you still wrap and may land in empty air / solid.

### Horizontal leave

Same height tier, strips that abut or overlap in world X. Y is not wrapped; `gointonewmap` only rebases local X to the new `minmap`.

### Ladders (`solidchrs`)

Each metatile’s solid byte holds four 2-bit quadrant codes. After `findsolid`, **1 = ladder**. Full ladder blocks on the Asia cart are IDs **$20–$24** (`solid` `$55`). Secrets in `NEWBITS.ROU` can poke more ladder tiles into a strip at runtime; the editor’s exit list reads **stock** map bytes only.

### Case study: Map 3 (water caves spur)

Map 3 is `mapd`: **16** columns at world X `[80, 96)`, height tier **1**. Used in the cart (keys, guard, water) — not dead data.

| Local col | Rim ladders | Role |
|-----------|-------------|------|
| 3 | top rows 0–2 | **Up** shaft → Map 5 (dungeon also has bottom ladder at world 83) |
| 5 | mid rows 1–6 | In-room climb only (never reaches row 0) |
| 9 | bottom row 13 | **Down** stub → Map 1 world range (no top ladder on Map 1 there) |
| 11 | top rows 0–2 | **Up** shaft → Map 5 (world 91) |
| 13 | bottom 12–13 | **Down** shaft → Map 1 (Map 1 has top ladder at world 93) |

So two ups and two downs to the *same* neighbors, on different columns. From Map 5, enter Map 3 by climbing down near world **91** (or the alternate top stub at 83). From Map 1, climb up near the **left** of the lava strip (world ~93).

## How the editor mirrors it

`findMapExits` rebuilds the neighbor graph from `worldX` / width / `mapheights`:

1. **Vertical neighbor** = height ±1 with overlapping world X.
2. Within that overlap, emit **one exit chip per shaft**: a column where *this* map has a ladder on the **extreme rim** (row 0 for up, row 13 for down). Mid ladders that only touch rows 1–3 are ignored so they are not fake “ups.”
3. Far-side ladder is scored higher but **not required** (matches the game’s world-X-only search). Labels include the column (`→ 5 Dungeon · c3`) so two shafts to the same map stay distinct.
4. Horizontal neighbors stay one chip per abut/overlap (no shaft scan).

Earlier the rail kept **one exit per destination map** (best shaft only). That hid Map 3’s second up/down and made a neighboring bottom ladder look “missing an exit” when it was simply the other shaft — or a non-connecting stub beside the marked one.

Clicking a chip still uses `arrivalAfterExit` / `leavePoseOnExit`: continuous world X on that column, Y from ±`$D0` / ladder feet, marker drawn as a direction arrow (see journal 06).

## Adding exits (design implication)

You do not paint an “exit object.” You:

1. Move strips in **world X** / tier (`mapheights`) so they overlap or abut the neighbor, and/or
2. Paint rim **ladder** tiles where the climb should leave the screen.

The Exits rail updates from geometry. Width is packed in `mapinfo` and awkward to grow in the current UI; World X is editable under Castle mode.

## Takeaway

The game’s “exit” is: **leave the Y rim (usually on a ladder) at a world X that another strip owns on the next height tier.** Multiple ladders on one strip are multiple ways to take that wrap — same destination, different columns. The editor must list shafts, not destinations, or short maps like Map 3 look under-connected.
