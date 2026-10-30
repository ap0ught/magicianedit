# 12 — Magician `.MAP` / `.BLK` / `.COL` / `.PAL` / `.CHR` layouts

Milestone **2** format decode + milestone **3–4** editor document model inputs. Contrast: RobinEdit’s 14-row column strips + PP1 (`robinedit/src/rom.ts`, `pp1.ts`).

Local sources: `magician-nes/vendor/Magician-NES/DAT/`, load/size code in `magician-nes/pds-text/x1.pds` (`initlev`), pack list in `pds-text/x7.pds`, palette helper `tools/scenerender.py`, scene RLE (different format) in `tools/datcodec.py`.

## `.MAP` — block index grid

Measured against every vendor `*.MAP`: header is **two big-endian 16-bit sizes** (Atari ST endian), then a raw `width × height` array of **block indices**.

`initlev` (`pds-text/x1.pds`) confirms the swap:

```
; set x,y size of landscape in blocks
lda (bmbase),y   ; swapping lo/hi bytes for 68000>6502
sta xsize+1
…
```

After reading sizes, runtime advances `bmbase` by **+4** and treats the rest as the block map.

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
- `blocks: Uint8Array` length `w*h` (index into `.BLK`)
- orientation from aspect / level descriptor
- optional companion `.COL` colour/attr map (see below)

## `.BLK` — metatile → 4 CHR tiles

Sizes are multiples of **4** (e.g. `10.BLK` 636 → 159 metatiles). Each metatile is four tile indices (NES pattern tiles), analogous in *role* to Robin metatiles but **not** PP1-packed.

Head of `10.BLK`: `4c 4c 4c 4c d1 d2 d3 d4 …` — four identical `$4C` then a distinct quad.

Paint/eyedrop (#15) should edit MAP block indices (and optionally BLK definitions later); stage render (#14) expands MAP→BLK→CHR tiles.

## `.COL` — colour / attribute companion

Loaded into a separate MMC3 bank window (`mapbnk71` / `doatrx`/`doatry` in `x1.pds`). Colour map addressing uses `hxsize` (half x size) and 8-column attribute-style scrolling — **not** the same layout as the block map byte-for-byte.

Examples: `10.COL` 708 B, `20.COL` 896 B, `SH.COL` 336 B. Some level ids have MAP+COL only (51/52/71/72) and reuse another id’s BLK/CHR.

Collision overlay (#17): solid flags may live in block properties / separate tables — do not assume Robin “solid from PP1 plane” rules. Re-read collision entry points in magician-nes journals (`18-draw-layer-scaffold.md`) before inventing flags.

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
| Geometry | Fixed 14 rows, variable columns | BE w×h block grid |
| Metatile unpack | PP1 (`pp1.ts`) | `.BLK` quads |
| CHR | CHR-RAM packs / `mapchrsdefs` | CHR-ROM 4 KiB pages |
| Castle overview | `overview.ts` / MAPSCROL | Retire or replace (#18) |
