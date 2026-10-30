# 13 — Level tables, CHR pages, object/event pointers

Issue **#8** (and play spawn **#24**, level nav **#16**). Pin dumps: **Beta 1** first (journal 10). Release RAM symbols differ — magician-nes README lists the shift (`obtyp` `$048C` release vs `$04F4` Beta 1).

## Logical vs physical level index

From `pds-text/x6.pds` / `src/play/ram.py`:

| Symbol | Role (Beta 1 zp / RAM map) |
|--------|----------------------------|
| `curlev` | Logical level (`$61`) — high nibble = main, low = sub (e.g. `$13` = 1.3) |
| `curlevind` | Physical index (`$63`) from `convind()` |
| `oldlev` | Level being left / `newlev` staging |
| `mapind` | Tower floor 1..A; `initvars` sets from `stlev` |
| `stlev` | Start level byte (source `$01`; Beta 1 cart uses `$00` so new game → `curlev` `$10`) |

`convind`: treat `$F0+` as subgames; index via `ldatl`/`ldath` main-level bases; physical index = byte offset from `ld10` / 16.

Play-from-map (#24): **do not** patch Robin `startlevel` / `mapno` `$42`. Prefer Magician `newlev` / `curlev` / player object position (`obxl`/`obxh`/`obyl`/`obyh` at slot `pi`). Entry after title: `start` does `lda #$0a / ldx #$e2 / jsr newlev` (phase + level) — see `src/play/recon.py` notes.

## 16-byte level descriptors (`initlev`)

`initlev` (`pds-text/x1.pds`):

1. `curlevind * 16 + ld10` → copy **16 bytes** into `mapbnk70`… (bank numbers, bases, CHR/palette selectors, limits).
2. Derive palette pointer into `chrpals` and `jsr movepal`.
3. Bank `mapbnk70`, read BE width/height from `.MAP` at `bmbase`, set `xsize`/`ysize`/`hxsize`, advance base +4.

CHR page installs: `setchr` / `setspr` (X7). The descriptor’s third byte is the MMC3 CHR bank (`s00` = 0, `s01` = 4, … in `x0.pds`), i.e. which 4 KiB page from journal 11. `setchr` stores Y in `mapbnk0`. `setspr` is the sprite-side install: Y is the first MMC3 sprite bank, written as Y through Y+3 into `r2`–`r5`, and A/X is the sprite palette pointer.

### Descriptor bytes (`l0` / `l1` in `x0.pds`)

`initlev` copies these 16 bytes onto `mapbnk70` (`$65` on Beta 1). `l0` is 9 bytes, `l1` is 7.

| Offset | Lands on | Contents |
|--------|----------|----------|
| 0 | `mapbnk70` | PRG bank of `.BLK` + `.MAP` |
| 1 | `mapbnk71` | PRG bank of `.COL` |
| 2 | `mapbnk0` | CHR bank (`sNN`) |
| 3–4 | `xorg` | X block origin (word) |
| 5 | `yorg` | Y block origin |
| 6–7 | `xlim` | X size in blocks (word) |
| 8 | `ylim` | Y size in blocks |
| 9–10 | `blbase` | CPU pointer to `.BLK` |
| 11–12 | `bmbase` | CPU pointer to `.MAP` (header included; `initlev` then adds 4) |
| 13–14 | `cmbase` | CPU pointer to `.COL` |
| 15 | `xsize` at copy time | Palette index. `initlev` does `chrpals + index*12`, then overwrites `xsize` from the `.MAP` header |

Town (`ld10`, first record) is `08 0B 00 00 00 00 EC 00 0B 00 A0 7C A2 18 B4 00`: bank `$8` / `$B`, CHR 0, origin 0, size 236×11, pointers `$A000` / `$A27C` / `$B418`, palette 0. That matches `10.MAP` / `10.BLK` / `10.COL` and the bank table in journal 11.

### Measured addresses (Beta 1 vs USA release)

Searched the headered dumps. Same 16-byte town signature, different places. **66** records start at `ld10` on both carts (the `ld10`…`lde0` span, including shops and inventory). Do not reuse a Beta 1 file offset on the release.

| Symbol | Beta 1 CPU | Beta 1 file | Release CPU | Release file |
|--------|------------|-------------|-------------|--------------|
| `ld10` | `$CF4D` (slot 14, `$C000` window) | `$1CF5D` | `$CADD` | `$1CAED` |
| `pt10` (first player-trigger record) | `$8E1D` (slot 7 at `$8000`) | `$EE2D` | `$924E` | `$F25E` |
| `ptl` (56 low bytes, one per `dl` in `PROBDAT.SRC`) | `$95F5` | `$F605` | not re-measured | |
| `pth` | immediately after `ptl` | `$F63D` | | |
| `actob` | `$EB8F` (slot 15) | `$1EB9F` | routine bytes differ (`obtyp` is not `$04F4`) | |
| `setchr` | `$F52F` (slot 15) | `$1F53F` | not the same byte sequence | |
| `setspr` | `$F51C` (slot 15) | `$1F52C` | not re-measured | |

`ptl`/`pth` are indexed by `curlevind`. Bank number `bev` is **7** (`bnk 6,#bev` maps that slot at `$8000`). `actob` on Beta 1 begins `A2 03 BC F4 04` (`LDX #3` / `LDY obtyp,X` with `obtyp` = `$04F4`). `setspr` is the 19 bytes immediately before `setchr` and begins `84 15 84 02 C8 84 03` (`STY t2` / `STY r2` / `INY` / `STY r3`); its last instruction is `D0 08`, a branch into `setchr`’s `movpal` tail. A rebuild whose reset is Beta 1’s `$F930` places that label at `$F51C`, in the same image where `setchr`, `ld10`, `actob`, and `ptl` match the dump rows above.

## Object runtime (not packed Robin lists)

`maxob equ $04`, `pi equ maxob-1` → **4 slots**, player = slot 3.

Beta 1 (`src/play/zpmap.txt` / `ram.py`):

- `obtyp` `$04F4` — type / active; bit 7 set = unused (`ror` in `initob`)
- Related: `obmod`, `obstat`, `obxl`/`obxh`, `obyl`/`obyh`, `obchr`, `obhel`, …
- `actob` (X6, characteristics from `obchars` in `MISC.SRC`) activates a slot

**Placed enemies/NPCs are not a Robin packed object list in MAP.** Level spawns come from **PROBDAT screen triggers** (`st_*`) and runtime activation — see journal 14. Editor “objects on stage” should parse PROBDAT / event banks for the current `curlevind`, not invent a coinco-style table.

## Player-triggered events

`PROBS.SRC` `plrevents`: bank `bev` (#7), `ptl`/`pth`/`ptbas` indexed by `curlevind`. Each event record **8 bytes** (AABB + type + data); type dispatches via `prvl`/`prvh`. End marker is `$81` (`e` macro, and `cmp #$81`). The comment above that compare says FF; the byte the code tests is `$81`.

## Assembler / rebuild entrypoints

- Assemble: `magician-nes/asm/build.py`, `Makefile` (`make -C asm rom`)
- PDS: vendored via `asm/pds6502.py` (sibling [`pds6502`](https://github.com/ap0ught/pds6502))
- Cart registry: `asm/patches.py`, `tools/carts.py`, `tools/cartref.py`
- Do not commit rebuild `.nes`; MagicianEdit consumes user dumps under `roms/`
