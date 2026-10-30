# 11 — Vendor DAT packs and MMC3 vs Robin mapper 71

Milestone **2** research: asset inventory and banking contrast.

## DAT level packs (issue #5)

Path: `magician-nes/vendor/Magician-NES/DAT/` (98 files). **17** `.MAP` files totaling **31820** bytes.

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

`magician-nes/pds-text/x7.pds` (disabled `if 0=1` load list, still the layout map) packs BLK+MAP into banks `$8`…`$d` at `$8000`/`$A000`, and COL packs into companion colour banks. Runtime: `mapbnk70` / `mapbnk71` (see `initlev` in `pds-text/x1.pds`). Editor may load vendor DAT for authoring **or** carve PRG regions once pointers are known (journal 13).

## MMC3 PRG/CHR banking (issue #6)

Magician (from magician-nes `README.md` / `GAPMAP.md` / `asm/build.py`):

- Mapper **4**, 16 × **8 KiB** PRG slots; CHR **128 KiB** (4 KiB pages).
- MMC3 windows (X5.PDS notes): `$8000`=reg6, `$A000`=reg7, fixed `$C000`=slot 14, `$E000`=slot 15.
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
if (mapper !== 71) throw new Error(`RobinEdit edits the mapper 71 cart…`);
```

Magician accept path should require approximately:

- Magic `NES\x1a`
- Mapper **4**
- PRG size **8** × 16 KiB (= 128 KiB), CHR size **16** × 8 KiB (= 128 KiB) — iNES header bytes matching dumps in journal 10
- Prefer verifying body SHA1 against the Beta 1 pin when present (optional soft warn)
- Reject mapper 71 / 64 KiB SRH images with a message pointing at RobinEdit

Until Magician parsers exist, detection can hard-fail Magician loads while Robin path remains for local smoke — or refuse Robin entirely once Magician I/O is primary.
