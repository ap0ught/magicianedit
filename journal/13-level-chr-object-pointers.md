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

Editor must locate `ld10` / level table in the chosen dump (symbol from rebuild `asm/out/mag.sym` when available; else signature search against Beta 1). CHR page installs: `setchr` / `setspr` (X7) — page indices come from those descriptor bytes + DAT `##.CHR`.

## Object runtime (not packed Robin lists)

`maxob equ $04`, `pi equ maxob-1` → **4 slots**, player = slot 3.

Beta 1 (`src/play/zpmap.txt` / `ram.py`):

- `obtyp` `$04F4` — type / active; bit 7 set = unused (`ror` in `initob`)
- Related: `obmod`, `obstat`, `obxl`/`obxh`, `obyl`/`obyh`, `obchr`, `obhel`, …
- `actob` (X6, characteristics from `obchars` in `MISC.SRC`) activates a slot

**Placed enemies/NPCs are not a Robin packed object list in MAP.** Level spawns come from **PROBDAT screen triggers** (`st_*`) and runtime activation — see journal 14. Editor “objects on stage” should parse PROBDAT / event banks for the current `curlevind`, not invent a coinco-style table.

## Player-triggered events

`PROBS.SRC` `plrevents`: bank `bev` (#7), `ptl`/`pth`/`ptbas` indexed by `curlevind`. Each event record **8 bytes** (AABB + type + data); type dispatches via `prvl`/`prvh`. End marker `$81` on first byte (comment says FF — verify against data).

## Assembler / rebuild entrypoints

- Assemble: `magician-nes/asm/build.py`, `Makefile` (`make -C asm rom`)
- PDS: vendored via `asm/pds6502.py` (sibling [`pds6502`](https://github.com/ap0ught/pds6502))
- Cart registry: `asm/patches.py`, `tools/carts.py`, `tools/cartref.py`
- Do not commit rebuild `.nes`; MagicianEdit consumes user dumps under `roms/`
