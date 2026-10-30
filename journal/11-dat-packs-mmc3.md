# 11 — Vendor DAT packs and MMC3 vs Robin mapper 71

Milestone **2** research: asset inventory and banking contrast.

## DAT level packs (issue #5)

Path: `magician-nes/vendor/Magician-NES/DAT/` (**100** files). **17** `.MAP` files totaling **31820** bytes. Companion sizes below were re-measured from that directory (13 `.BLK`, 18 `.CHR`, 18 `.COL`, 29 `.PAL`, 3 `.DAT`, plus `SPR` and `MUS` with no extension).

Companion pattern (sizes measured locally):

| id | MAP | BLK | CHR | COL | PAL | Notes |
|----|-----|-----|-----|-----|-----|-------|
| 10 | 2600 | 636 | 4096 | 708 | 12 | Town / early game |
| 20 | 2820 | 936 | 4096 | 896 | 12 | |
| 21 | 436 | 160 | 4096 | 120 | 12 | Small / sub |
| 30 | 3524 | 660 | 4096 | 960 | 12 | |
| 40 | 3524 | 892 | 4096 | 960 | 12 | |
| 50 | 356 | 620 | 4096 | 96 | 12 | + `50D.PAL` / `50L.PAL` |
| 51 | 900 | — | — | 248 | — | MAP+COL only (shares BLK/CHR) |
| 52 | 1764 | — | — | 480 | — | MAP+COL only |
| 53 | 3524 | 676 | 4096 | 960 | 12 | |
| 60 | 3040 | 320 | 4096 | 828 | 12 | |
| 70 | 2424 | 624 | 4096 | 660 | 12 | |
| 71 | 2424 | — | — | 660 | — | MAP+COL only |
| 72 | 1300 | — | — | 352 | — | MAP+COL only |
| 73 | 1060 | 360 | 4096 | 288 | 12 | |
| 80 | 356 | 276 | 4096 | 96 | 12 | |
| IN | 532 | 992 | 4096 | 144 | 12 | Interior |
| SH | 1236 | 536 | 4096 | 336 | — | Shop; palettes `SH1`…`SH7.PAL` |

Non-level assets also in DAT: `TIT0/1/2.CHR`, `TIT.DAT`/`PW.DAT`/`PAN.DAT` (scene `unrun` packs — see `tools/datcodec.py`), `MAP.CHR`/`MAP.PAL`, `SU.CHR`, `SPR.PAL`, `INV.COL`/`INV.PAL`, `MUS`, etc.

### How packs land in the cart

`pds-text/x7.pds` keeps a `load` list inside `if 0=1` (not assembled). The `else` branch is the layout the source actually uses: 8 KiB PRG bank number plus a CPU address in the `$A000` window. File offset on an iNES image is `16 + bank*8192 + (cpu - $A000)`.

Every file in this table matches **Beta 1** at that offset (full-file compare, 47 packs). The USA release does **not**: slot 8 there begins `4A 4A 4A 4A …`, while `10.BLK` and Beta 1 begin `4C 4C 4C 4C …`. Do not reuse these offsets on the release.

| Bank | CPU `$A000` window | Files |
|------|--------------------|-------|
| `$8` | `$A000` `10.BLK`, `$A27C` `10.MAP`, `$ACA4` `20.BLK`, `$B04C` `20.MAP`, `$BB50` `21.COL`, `$BBC8` `73.COL`, `$BCE8` `80.BLK`, `$BDFC` `80.MAP`, `$BF60` `80.COL` | town, wilderness, well colour, castle-sub colour, final battle |
| `$9` | `$A000` `50.BLK`, `$A26C` `50.MAP`, `$A3D0` `51.MAP`, `$A754` `51.COL`, `$A84C` `52.MAP`, `$AF30` `53.BLK`, `$B1D4` `53.MAP` | caverns; 51/52 share `50.BLK` |
| `$A` | `$A000` `40.BLK`, `$A37C` `40.MAP`, `$B140` `IN.BLK`, `$B520` `IN.MAP`, `$B734` `IN.COL`, `$B7C4` `SH.BLK`, `$B9DC` `SH.MAP`, `$BEB0` `SH.COL` | forest, interior, shop |
| `$B` | `$A000` `30.BLK`, `$A294` `30.MAP`, `$B058` `30.COL`, `$B418` `10.COL`, `$B6DC` `20.COL`, `$BA5C` `40.COL`, `$BE1C` `50.COL` | lake plus town/wilderness/forest/cavern colours |
| `$C` | `$A000` `21.BLK`, `$A0A0` `21.MAP`, `$A254` `52.COL`, `$A434` `53.COL`, `$A7F4` `60.BLK`, `$A934` `60.MAP`, `$B514` `60.COL`, `$B850` `70.COL`, `$BAE4` `71.COL`, `$BD78` `72.COL` | well, maze colour, dungeon, castle colours |
| `$D` | `$A000` `70.BLK`, `$A270` `70.MAP`, `$ABE8` `71.MAP`, `$B560` `72.MAP`, `$BA74` `73.BLK`, `$BBDC` `73.MAP` | castle passages; 71/72 share `70.BLK` |

`51`, `52`, `71`, and `72` have no own `.BLK` / `.CHR`. Their descriptors point at another id’s block bank (journal 13).

CHR is not in these PRG banks. `asm/build.py` `CHR_SEND_ORDER` places 4 KiB pages in the 128 KiB CHR ROM. `10.CHR` is the first page (file offset `16+131072`) and matches Beta 1; `20.CHR` matches the next 4096 bytes. Descriptor field `sNN` (`x0.pds`) is `N*4`, the MMC3 1 KiB bank number for that page. Runtime `mapbnk70` / `mapbnk71` select the PRG banks above (`initlev` in `x1.pds`). An editor can load vendor DAT directly, or slice these Beta 1 offsets. Release slices are a different measurement.

## MMC3 PRG/CHR banking (issue #6)

Magician (from magician-nes `README.md` / `GAPMAP.md` / `asm/build.py`):

- Mapper **4**, 16 × **8 KiB** PRG slots; CHR **128 KiB** (4 KiB pages). Slot `N` is file offset `16 + N*8192` in the PRG. Beta 1 slot `$8` is `10.BLK` (see the table above).
- MMC3 windows (`GAPMAP.md`, X5 notes): `$8000`=reg6, `$A000`=reg7, fixed `$C000`=slot 14, `$E000`=slot 15. The pack pointers above are addresses in the `$A000` window, so the matching slot is mapped through reg7.
- Modules: `X0`…`X7.PDS` + `SEQ.SRC`; X5/X6/X7 compete for slot 15; X6 forced origin `$E605` (`MODULE_ORIGINS`) so `reset` → `initcols` at `$EEC7` hits fixed `$E000`.
- Beta 1 vectors in slot 15: reset `$F930`, X7 anchor `$F0D5`.

RobinEdit / Super Robin Hood contrast (`robinedit/src/rom.ts`, SRH rebuild):

- Mapper **71**, **64 KiB PRG**, **CHR-RAM** (0 CHR-ROM banks), image **65552** bytes.
- Switchable `$8000` bank + fixed `$C000` — **not** MMC3 8 KiB slots.
- **Do not reuse** Robin bank file offsets, `mapinfo` scan heuristics, or PP1 CHR assumptions.

Deliverable for #6 is this note + links to `magician-nes/GAPMAP.md` and Robin `rom.ts`.

## Detect Magician MMC3 iNES (issue #10)

`magicianedit/src/rom.ts` today:

```ts
if (mapper !== 71) throw new Error(`MagicianEdit does not load this cart yet. The inherited shell edits mapper 71; this ROM is mapper ${mapper}.`);
```

Magician accept path should require approximately:

- Magic `NES\x1a`
- Mapper **4**
- PRG size **8** × 16 KiB (= 128 KiB), CHR size **16** × 8 KiB (= 128 KiB) — iNES header bytes matching dumps in journal 10
- Prefer verifying body SHA1 against the Beta 1 pin when present (optional soft warn)
- Reject mapper 71 / 64 KiB SRH images with a message pointing at RobinEdit

Until Magician parsers exist, detection can hard-fail Magician loads while Robin path remains for local smoke — or refuse Robin entirely once Magician I/O is primary.
