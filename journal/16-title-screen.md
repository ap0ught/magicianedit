# 16 — Magician title screen

Milestone **2** research for issue **#32**. How Eurocom builds the title picture, before any editor treats it as a level. Level packs (`.MAP` / `.BLK` / `.CHR` / `.COL` / `.PAL`) stay in journals 11 and 12. This note is the other DAT family: the title scene. No loader and no editor I/O.

Checked against the tokenized PDS in [ap0ught/magician-nes](https://github.com/ap0ught/magician-nes) (`X0.PDS`, `X5.PDS`, `X7.PDS`, `DISP.SRC`, `SENDG`) and the readable scene in [ap0ught/magician-nes-re](https://github.com/ap0ught/magician-nes-re) (`src/magician/title/`, `src/magician/TITLE.SRC`, `tools/datcodec.py`, `tools/titletest.py`, `tools/scenerender.py`, `tools/bizhawk/title.lua`, `asm/build.py`). Assembler dialect: [ap0ught/pds6502](https://github.com/ap0ught/pds6502). Pin **Beta 1**.

## Boot

`start` in `X0.PDS` calls the title before a level:

```
start    jsr dotitle     ;do title scn
         jsr initvars    ;init game variables
         lda #$0a        ;start game at map for current level
         ldx #$e2
         jsr newlev
         jsr initob
```

`newlev` (`X6.PDS`) is `sta newphase` / `stx oldlev` / `lda #$01` / `sta phase` / `rts`. The `#$0a` is the phase stored in `newphase`. The `#$e2` is stored in `oldlev`. `start` does not test the carry from `dotitle`, so both returns below land on this same sequence. `initvars` sits between the title and `newlev`.

## `dotitle`

Label `dotitle` in `X0.PDS`, comment “Handle title screen”.

1. **Clear.** `lda #$00`, then `ldx #jt` and `sta $00,x` / `inx` until X wraps. That wipes the tail of zero page from `jt` upward, which includes the music variables. Then `ldx #lastz-ninflag+1` and `sta ninflag-1,x` down to zero, which clears the `ninflag`…`lastz` block. (`lastz` is the zero-page label just before `org $8000`.)
2. **`jsr initdma`**, then **`jsr initcols`**.
3. **Palette.** `lda #<cpti` / `ldx #>cpti` / `jsr setchr`, then `jsr setspr` (comment: “don’t need Y”). `cpti` in `X7.PDS` is `load tit.pal` (“title palete”). `DAT/TIT.PAL` is **12 bytes**: `28 38 30 2A 3A 30 17 27 38 21 31 30`. `setchr` / `movepal` (`tools/scenerender.py`, citing `X7.PDS`) does not copy those bytes straight to `$3F00`. It writes `$0F` into the four backdrop slots and the twelve bytes into `$3F01`–`$3F03`, `$3F05`–`$3F07`, `$3F09`–`$3F0B`, `$3F0D`–`$3F0F` in file order. A BizHawk dump of the cartridge’s `curchrpal` is that image: `0F 28 38 30 0F 2A 3A 30 0F 17 27 38 0F 21 31 30`.
4. **Tune.** `music 01` (“init sound”), then `mus 06` (“init title tune”).
5. **Unpack the picture.** `bnk 7,#btit`, then `lda #<titdat` / `ldx #>titdat` / `jsr unrunscn`, then `bnk 7,#$1`. Register 7 is the MMC3 `$A000` window. `unrunscn` aims `$2006` at `sc0` (`$2000`) and `unrun` writes the expanded scene in order.
6. **CHR select and NMI.** `jsr initspr`. `lda #<tnmi` / `ldx #>tnmi` / `jsr setnmi`. `lda #s0e` / `sta mapbnk0`. `s0e equ $e*$4` (“title scn0”), so `mapbnk0` is `$38`.
7. **Wait, fade, button.** `lda #$08` / `sta second` (“set fade-up delay”), enable NMI (`lda #$80` / `ora p0` / `sta $2000`), `cli`. Spin while `second` is non-zero. `tnmi` does `dec second` once per frame, and a one-second countdown elsewhere stores `#$3b`, so **8 is eight frames**, counted down by the title NMI. Then `clc` / `jsr setfadeud` / `jsr waitbut`. `bcs enterpw`. The `rts` is commented “C=0 start game clean at level 1”.

`waitbut` returns carry clear for START and carry set for SELECT (`lda dsel` / `sec`, else `lda dsta` / `clc`). SELECT (`enterpw`) banks the same window (`bnk 7,#bpw`), uncrunches `pwdat` the same way, restores bank `$1`, and points `setchr` at `cppw` (`pw.pal`) with Y = `s1f`. `bpw` equals `btit`, so the bank byte does not change. After the password grid is drawn, `inc phase` leaves the title IRQ path, which runs only while `phase` is zero. A later `waitbut` on that screen does `jmp dotitle` on SELECT or on an invalid password (`tstpw` carry set, or `mapind >= #$08`). A valid password does `sec` / `rts`, commented “C=1 = restart game from password”. That `rts` is the other return to `start`.

## Packed bytes

`X7.PDS`, in the `b = $6` group, end to end:

```
titdat   load tit.dat        ;title scn chr+col data
pwdat    load pw.dat         ;password scn chr+col data
pandat   load pan.dat        ;panel chr data
```

File sizes in `vendor/Magician-NES/DAT/`: **`TIT.DAT` 314**, **`PW.DAT` 292**, **`PAN.DAT` 96**. The labels are adjacent, so the title window is those 314 bytes. One extra packed byte is the first byte of the password screen. `asm/build.py` (`verify_our_scenes`) refuses a scene whose packed length exceeds `pwdat - titdat`, then decodes the bytes at `titdat` in the finished image back to the grid.

Bank equates immediately after that group, via `memchk c000,b` with `b` still `$6`:

```
bmus    equ b          ; $6, music
bshop   equ b+1        ; $7
btit    equ b+1
bpw     equ b+1
bpan    equ b+1
bev     equ b+1
```

`b` is still the `$6` assigned at the start of the group: `memchk` checks `* > $C000` and then issues `bank b`, and it does not redefine `b`. `bmus` is slot **6** (the `$8000` half). Title, password, panel, and shop data are `b+1`, slot **7**, the `$A000` half of the same pair. `dotitle` selects that half with `bnk 7,#btit`. The level packs are the later `b = $8` … `$d` group (journal 11). `pds6502.py` records the measured reading of this counter: the `b =` assignment is what places the group, and a literal `bank b` at the `memchk` lands the bytes one slot low.

### What 314 bytes expand to

`tools/datcodec.py` is the measured `unrun` format (`X5.PDS`, assembled near `$DC77`). A scene file is a 3-byte header plus records:

| File | Header | Declared length |
|------|--------|-----------------|
| `TIT.DAT` | `00 FC E0` | 1024 (`$10000 - $FC00`) |
| `PW.DAT` | `00 FC 01` | 1024 |
| `PAN.DAT` | `00 FF 00` | 256 |

`TIT.DAT` byte 2 is the token **`$E0`**. A byte equal to the token starts a 3-byte run: count, then value. The run length is `(count & $7F) + 4` (4..131). Bit 7 of the count means each further byte is one higher than the last. Any other byte is a one-byte literal. `TIT.DAT` has **50** run records. The first is `E0 7C 08`, which is 128 copies of `$08` (four rows).

The codec’s own note: the assembled `and #$7F / adc #$03` sequence is a **+3**, and both the source and the release use it, but the files themselves pack for **+4**. +4 consumes each file exactly and hits 1024/1024/256. +3 falls short by one byte per run (50/47/15) and mis-aligns the rows. `decode()` implements +4. `selftest` requires `encode(decode(file))` to match Eurocom’s three files byte for byte.

The 1024 expanded bytes are **960 nametable tiles + 64 attributes**, not a 32×32 tile grid. NES nametable page `$2000` is 32×30 tiles (`$000`–`$3BF`) and the attribute table at `$23C0` (`$3C0`–`$3FF`). `src/magician/title/` splits them:

| File | Contents |
|------|----------|
| `nametable.txt` | **32×30** tile bytes (960). Rows 0–29. |
| `attributes.txt` | **4×16** attribute bytes (64), the `$23C0` table |
| `token.txt` | pack token `$E0` |
| `notes.md` | why this grid is Eurocom’s `TIT.DAT` |

An attribute byte is four 2-bit quadrant selectors. Every value is in range. The failure is a uniform table, or a selector whose sub-palette `TIT.PAL` does not define (4 sub-palettes × 3 colours).

`nametable.txt` and `notes.md` (2026-10-05) say the grid is the expansion of vendor `TIT.DAT`, and that packing it with `$E0` reproduces that file byte for byte. `TITLE.SRC` is `org titdat` plus `incbin` of `asm/out/ours/TIT.DAT`, which `pack_our_scenes` writes and does not commit. `dotitle` is unchanged. The comment at the top of `TITLE.SRC` still says the vendor file “is the starting point but not the finished screen”; the scene directory is the later correction, and it says the overlay is the same picture.

## CHR, and why one page is not the picture

`SENDG` places the three 4096-byte pages by 1KB bank index (`load`’s fourth argument, `bank`):

```
load tit0.chr,$0000,,$0e*4    ;title scn chr sets
load tit1.chr,$0000,,$1d*4
load tit2.chr,$0000,,$1e*4
```

| File | Set | 1KB index | CHR offset | MMC3 R0, R1 |
|------|-----|-----------|------------|-------------|
| `TIT0.CHR` | `$0E` | `$38` | `$E000` (57344) | `$38`, `$3A` |
| `TIT1.CHR` | `$1D` | `$74` | `$1D000` | `$74`, `$76` |
| `TIT2.CHR` | `$1E` | `$78` | `$1E000` | `$78`, `$7A` |

`$0E*4` is `s0e`. magician-nes-re `README.md` records `TIT0.CHR` at CHR offset **57344** in Beta 1, byte-identical to the rebuild. The next page is the shop, `load sh.chr,$0000,,$0f*4`. `TIT1` is set `$1D`, after the sprite pages that start at `$10`.

`setmmc3` in `X5.PDS` writes MMC3 R0 from `mapbnk0` and R1 from `mapbnk0+2`, then sprite banks from `r2`–`r5`. On the title that is R0 = `$38`, R1 = `$3A`: both 2KB halves of `TIT0.CHR`. `tnmi` calls that copy. `DISP.SRC` has another `setmmc3` that forces `$7C` / `$7E`; `pds6502.py` records that `DISP.SRC` is included by no bank.

`tnmi` (still `X0.PDS`), when `phase` is zero, arms the raster split:

```
lda #<tirq0
ldx #>tirq0
jsr setirq
lda #$5f          ; latch
sta $c000
sta $c001         ; reload
sta $e001         ; enable IRQ
cli
```

`tirq0` (“1st title scn split”) stores the next latch **`$3F`**, then:

```
lda #$74
ldx #$0d
!a   dex
     bne !a       ; X ends at 0. $0D is a delay, not a register number.
stx $8000         ; R0
sta $8001         ; $74
inx
lda #$76
stx $8000         ; R1
sta $8001         ; $76
lda #<tirq1
ldx #>tirq1
jsr setirq
```

`tirq1` (“2nd title scn split”) uses the same delay, writes R0 = **`$78`** and R1 = **`$7A`**, then `sta $e000` (“disable MMC3 IRQs”).

So the picture is three horizontal bands of pattern data: `TIT0`, then `TIT1`, then `TIT2`. Nametable indices are only 8-bit, and each band has its own 256 tiles. The same index is a different picture above and below a split. `asm/build.py`’s comment that the three files sit at 4KB banks 14/15/16 (`$E000` / `$F000` / `$10000`) matches `TIT0` and then disagrees with `SENDG`: banks 15 and 16 are `$0F` (shop) and `$10` (sprites), not the title splits.

`tnmi` also rewrites the scroll after the palette upload: `$2005` = 0, then `$2005` = **`$08`** (fine X = 0, fine Y = 8), and it calls `music 00` every frame. `notes.md` leaves the one-scanline residual (below) as an unidentified scroll or `PPUCTRL` write. These are the title NMI’s stores; this note does not claim they are the early write.

## What the rebuild measured

`src/magician/title/notes.md`, BizHawk at frame 60, after the grid was put back to Eurocom’s `TIT.DAT` (the hand-authored grid had been drawn from the **release**, which does not carry `TIT.DAT`):

| What | Hand-authored grid | Authentic `TIT.DAT` |
|------|--------------------|---------------------|
| Nametable `nt0` | 928/1024 | **1024/1024** |
| All of CIRAM | 4000/4096 | **4096/4096** |
| Palette | 32/32 | 32/32 |
| Attributes | 64/64 | 64/64 |
| Pattern table in use | 8192/8192 | 8192/8192 |

The hand-authored miss was the bottom three tile rows. Beta 1 has real tiles there (`nametable.txt` row 27 starts `B0 93 94 95 96 B1 B2 B3 B4 B5 B6 B7 9A B8`). The reconstruction had solid `$08`.

Pixels still differ. `notes.md`: the frame is **64.87%** identical to Beta 1; the top 60 scanlines match; the first difference is **scanline 88**, and from there the rebuild is **one scanline** higher. That is raster-split timing. The nametable, attribute, palette, and pattern bytes match. `title.lua` dumps CIRAM, PALRAM, and CHR. It does not dump OAM or the scroll latches, so the note does not name the early write.

Two older README passages describe earlier conclusions, and the scene note supersedes them:

- “`TIT.DAT` is a solid fill of `$08`” and “`TIT.DAT` is absent from the cartridge” were measurements against the **release**, and against `tools/unrun.py` sticking on the first record. Beta 1 contains `TIT.DAT`, `PW.DAT`, and `PAN.DAT` byte-identical to `vendor/Magician-NES/DAT/`. The release contains only `PAN.DAT` of the three.
- The Status paragraph that still says frame-60 pixels are **40.8%** and that the cartridge’s bottom rows are a copyright the CHR lacks is the other story. `notes.md` is the account the same Status section points at, and it says the PPU bytes match.

`tools/bizhawk/title.lua` (frame 60 by default) reads BizHawk memory domains. `$2006` / `$2007` pokes on this core return zeroes and look like an empty screen. One dump layout detail: the header says `nt0attr.bin` is the attribute table, but the write is `ciram:sub(1025, 1088)`, which is CIRAM `$400`–`$43F` (the next nametable). `nt0`’s attributes are the last 64 bytes of the 1024-byte page, CIRAM `$3C0`–`$3FF`. The 64/64 score in `notes.md` is the measurement; do not take `nt0attr.bin` as `$23C0` without checking that slice. The script also dumps CHR at `$8000` for `$2000` bytes and calls that banks 14/15/16. `$8000` is 4KB set `$08`. The pattern-table score is the 8KB the PPU is showing, which the splits change mid-frame.

`tools/titletest.py` fails the build when:

1. The packed scene is missing from the PRG, or occurs more than once.
2. Decoding those PRG bytes does not return the 960+64 grid.
3. A named tile has no art in **`TIT0.CHR`**, except the blank. Measured at a **16-byte** stride, `TIT0.CHR` has one all-zero tile, and the grid’s blank is **`$08`**. Tile **`$00` is not blank**; it is logo art, and row 29 is entirely `$00`. An 8-byte stride reports 25 blanks and is how an earlier pass called `$08` brick. `asm/build.py` `check_scene_against_art` still uses that 8-byte stride, and only logs it. The gate is `titletest.py`. The check looks only at `TIT0.CHR`. Tiles below the first split are drawn from `TIT1.CHR` / `TIT2.CHR`, so a blank in `TIT0` is not a blank on the lower bands.
4. The attribute table is uniform, or it selects a sub-palette `TIT.PAL` does not define.
5. The packed form does not fit between `titdat` and `pwdat`.

`tools/scenerender.py ours out.png` draws the grid. `python3 tools/datcodec.py selftest` is the codec proof.

## For a later editor

- The title document is this scene: 32×30 tiles, 64 attributes, token `$E0`, packed into the **314-byte** window in bank **7** at `titdat`. It is not a `.MAP` metatile grid and not a Robin map.
- Save must round-trip through the +4 `unrun` format. A +3 decoder paints the wrong rows. Overflow lands on `pwdat`.
- Painting needs all three CHR pages, switched as above. A single `TIT0` page is only the top band.
- Palette source is the 12-byte `TIT.PAL`, expanded by `movepal`, not a raw 16-byte `$3F00` image.
- Author against **Beta 1**. The USA release does not carry `TIT.DAT`.
- The remaining picture error is the scanline-88 split timing. Do not “fix” it by editing the grid.

## References

- magician-nes: `X0.PDS` `start`, `dotitle`, `tnmi`, `tirq0`, `tirq1`; `X5.PDS` `setmmc3`, `unrun`; `X7.PDS` `cpti`, `titdat`, `btit`; `SENDG` `tit0.chr` / `tit1.chr` / `tit2.chr`; `DISP.SRC` the other `setmmc3`
- magician-nes-re: `src/magician/TITLE.SRC`, `src/magician/title/notes.md`, `nametable.txt`, `attributes.txt`, `token.txt`, `tools/datcodec.py`, `tools/titletest.py`, `tools/scenerender.py`, `tools/bizhawk/title.lua`, `asm/build.py` (`pack_our_scenes`, `verify_our_scenes`), `README.md` (Beta 1 contains the three `.DAT` files; `TIT0.CHR` at offset 57344)
- pds6502: PDS 1.26 dialect used to assemble this source
