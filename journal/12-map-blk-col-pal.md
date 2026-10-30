# 12 — Magician `.MAP` / `.BLK` / `.COL` / `.PAL` / `.CHR` layouts

Milestone **2** format decode + milestone **3–4** editor document model inputs. Contrast: RobinEdit’s 14-row column strips + PP1 (`robinedit/src/rom.ts`, `pp1.ts`).

Local sources: `magician-nes/vendor/Magician-NES/DAT/`, load/size code in `magician-nes/pds-text/x1.pds` (`initlev`), pack list in `pds-text/x7.pds`, palette helper `tools/scenerender.py`, scene RLE (different format) in `tools/datcodec.py`.

## `.MAP` — block index grid

Measured against every vendor `*.MAP`: header is **two big-endian 16-bit sizes** (Atari ST endian), then a `width × height` array of **swizzled block indices** (one byte each). They are not plain `0..N` indices.

`initlev` (`pds-text/x1.pds`) confirms the swap:

```
; set x,y size of landscape in blocks
lda (bmbase),y   ; swapping lo/hi bytes for 68000>6502
sta xsize+1
…
```

After reading sizes, runtime advances `bmbase` by **+4** and treats the rest as the block map.

`x1.pds` does not multiply the map byte by 4. It builds the `.BLK` pointer as:

```
ptr = blbase + (byte & $FC) + ((byte & 3) << 8)
```

That is `blbase + index*4` when the byte stores the index swizzled:

```
index = ((byte & $FC) >> 2) | ((byte & 3) << 6)
byte  = ((index & $3F) << 2) | (index >> 6)
```

Checked on `10.MAP`: decoded indices are `0..158` and every one lands inside `10.BLK` (159 metatiles). Reading the same bytes as plain indices runs off the end of the file 620 times. The editor document should store the decoded index and swizzle again on save.

Examples (local DAT):

| file | BE width | BE height | payload = w×h | file size |
|------|----------|-----------|---------------|-----------|
| `10.MAP` | 236 | 11 | 2596 | 2600 |
| `20.MAP` | 256 | 11 | 2816 | 2820 |
| `21.MAP` | 16 | 27 | 432 | 436 |
| `51.MAP` | 16 | 56 | 896 | 900 |
| `SH.MAP` | 112 | 11 | 1232 | 1236 |

`hvflag` (bit 7 clear = horizontal) is derived by comparing `ylim`/`xlim` after load — Magician has both H and V levels. **Not** Robin’s fixed 14-row × N-column `mapinfo` strips.

Editor document model sketch:

- `width`, `height` (blocks)
- `blocks`: decoded metatile index per cell (`w*h`), not the raw map byte
- orientation from aspect / level descriptor
- optional companion `.COL` colour/attr map (see below)

## `.BLK` — metatile → 4 CHR tiles

Sizes are multiples of **4** (e.g. `10.BLK` 636 → 159 metatiles). Metatile `index` is the four bytes at `index*4`. `x1.pds` reads them with `Y = blokx` (0 left, 1 right) and `Y = blokx | 2` (the comment there calls that the bottom row). So bytes 0–1 are the top row and bytes 2–3 are the bottom row. Same role as a Robin metatile, **not** PP1-packed.

Head of `10.BLK`: `4c 4c 4c 4c d1 d2 d3 d4 …` — four identical `$4C` then a distinct quad. That head is also the first eight bytes of Beta 1 PRG slot `$8`.

Paint/eyedrop (#15) should edit MAP block indices (and optionally BLK definitions later); stage render (#14) expands MAP→BLK→CHR tiles.

## `.COL` — colour / attribute companion

Loaded into a separate MMC3 bank window (`mapbnk71` / `doatrx`/`doatry` in `x1.pds`, pointer `cmbase`). Colour map addressing uses `hxsize` (half x size) and 8-column attribute-style scrolling — **not** the same layout as the block map byte-for-byte, and **not** the collision plane.

Examples: `10.COL` 708 B, `20.COL` 896 B, `SH.COL` 336 B. Some level ids have MAP+COL only (51/52/71/72) and reuse another id’s BLK/CHR.

Walk flags are per pattern tile, in the `ct*` nibble tables in `MISC.SRC` (one nibble per CHR tile, selected with the level’s CHR set):

| nibble | meaning |
|--------|---------|
| 0 | thin air |
| 1 | land / platform that cannot be levitated through |
| 2 | wall / ceiling |
| 3 | castle floor |
| 4 | castle ceiling |
| 5 | marsh |
| 6 | fountain |
| 7 | water (dead) |
| 8 | fire pit (dead) |
| 9 | ceiling spikes (dead) |
| A | caverns weak floor |

Do not invent Robin “solid from the PP1 plane” rules, and do not treat a `.COL` byte as one of these nibbles.

## `.PAL` — 12-byte background packs

Exactly **12 bytes** = 4 sub-palettes × 3 colours. Not RGB and not raw NES `$3Fxx` order.

`movepal` / `tools/scenerender.py` `palette_from_pal()` inserts `$0F` into shared backdrop slots `$3F00/$3F04/$3F08/$3F0C` and places the 12 bytes into the non-backdrop slots. Example `10.PAL`: `28 38 30 10 31 30 28 39 30 00 10 30`.

Title path uses `TIT.PAL` the same way. Shop levels use `SH1`…`SH7.PAL`.

## `.CHR` — 4 KiB pages

Level CHR files are **4096** bytes (one 4 KiB MMC3 CHR page). Title uses `TIT0.CHR`…`TIT2.CHR`. Runtime `setchr` / `setspr` install pages (X7); editor chrome (#16) should list pages tied to the level descriptor’s CHR banks (journal 13), not Robin `mapchrsdefs`.

## Scene `.DAT` (not level maps)

`TIT.DAT` / `PW.DAT` / `PAN.DAT` are **nametable `unrun` streams** (`tools/datcodec.py`) — different from `.MAP`. Do not feed them through the map document model.

## Robin delta (for #11–#17)

| Concern | RobinEdit | Magician |
|---------|-----------|----------|
| Level directory | 13×6-byte `mapinfo` scan | 16-byte descriptors from `ld10` × `curlevind` |
| Geometry | Fixed 14 rows, variable columns | BE w×h grid; map byte is a swizzled metatile index |
| Metatile unpack | PP1 (`pp1.ts`) | `.BLK` quads |
| CHR | CHR-RAM packs / `mapchrsdefs` | CHR-ROM 4 KiB pages |
| Castle overview | `overview.ts` / MAPSCROL | Retire or replace (#18) |
