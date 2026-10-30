# Super Robin Hood ROMs used by RobinEdit

RobinEdit edits **mapper 71** Super Robin Hood carts in place. It does **not** ship `.nes` files (they are gitignored). You supply a dump under project-root `roms/`, via drag/Open, or optional local samples `public/asia.nes` / `public/rebuilt.nes`.

Two stock images matter for development and `make check`. Both are **65 552** bytes (16-byte iNES header + **64 KiB PRG**, **CHR-RAM**). Both use the same iNES / NES 2.0 header shape: **mapper 71**, vertical mirroring, 4×16 KiB PRG banks, 0 CHR-ROM banks.

| Role | Local names (not committed here) | Typical source |
|------|----------------------------------|----------------|
| Commercial Asia dump | `asia.nes`, `Super Robin Hood (Asia) (En) (Unl).nes` | User-supplied dump; also kept as `vendor/…` in [SuperRobinHoodNESSource](https://github.com/ap0ught/SuperRobinHoodNESSource) |
| PDS rebuild | `rebuilt.nes`, `srh-rebuilt.nes` | Assembled from `pds_src` via `asm/build_srh.py`; prefer the [Releases](https://github.com/ap0ught/SuperRobinHoodNESSource/releases/latest) asset |

Related sibling image (different bytes): [`prerelease.nes`](https://github.com/ap0ught/SuperRobinHood/tree/master/roms) in [ap0ught/SuperRobinHood](https://github.com/ap0ught/SuperRobinHood) — clean rebuild from that repo’s recovered PDS tree; **not** byte-identical to `srh-rebuilt.nes`.

## Fingerprints (headered `.nes`)

Measured on the Asia dump and `srh-rebuilt.nes` copies used with this editor:

| Image | Size | CRC-32 | SHA-256 |
|-------|------|--------|---------|
| Asia (`…(Asia) (En) (Unl).nes` / `asia.nes`) | 65552 | `D9114282` | `ae6c7a412732cba05490a4d355b7a619e201583b7f5b99d0148d888293a88076` |
| Rebuild (`srh-rebuilt.nes` / `rebuilt.nes`) | 65552 | `C0E5DBCD` | `0d87e02ab4b0a89d9510feddde32ba8615b165ad429582657347e2f8d8d4998e` |
| SuperRobinHood `prerelease.nes` (related) | 65552 | `44F27107` | `c9882d5415788bc144b7669d27a3ffe42275ab0d1f9aa671d069169dec690582` |

### iNES header (Asia and `srh-rebuilt` share these 16 bytes)

```
4E 45 53 1A  04 00 71 48  00 00 00 07  02 00 00 01
```

- Magic `NES<EOF>`
- PRG ROM size = **4** × 16 KiB = **64 KiB**
- CHR ROM size = **0** → **CHR-RAM**
- Mapper **71** (Camerica / Codemasters-style), vertical nametable mirroring
- NES 2.0–style trailer bytes matching the Asia dump (not a plain iNES 1.0 zero pad)

## How each image is produced

### Asia dump

Commercial **Asia / English / unlicensed** cartridge dump, commonly titled:

`Super Robin Hood (Asia) (En) (Unl).nes`

It is **not** built from this repo. Obtain a dump you are allowed to use. In SuperRobinHoodNESSource the verified copy lives under `vendor/` (and may appear as a root-level duplicate). For RobinEdit, copy it to `roms/` or `public/asia.nes`.

### `srh-rebuilt.nes` / `rebuilt.nes`

Produced in [SuperRobinHoodNESSource](https://github.com/ap0ught/SuperRobinHoodNESSource) by assembling the official PDS tree:

```bash
python3 asm/build_srh.py
# → srh-rebuilt.nes at repo root (INES_HEADER + 64 KiB placed PRG)
```

`asm/build_srh.py` runs `pds_src/src/ROBIN.PRJ` through `asm/pds6502.py`, places mapper-71 banks (switchable `$8000` bank + fixed `$C000`), and writes the same 16-byte header as the Asia cart. Details and remaining cart mismatches: parent journals [`01`](https://github.com/ap0ught/SuperRobinHoodNESSource/blob/master/journal/01-pds-build-attempt.md)–[`03`](https://github.com/ap0ught/SuperRobinHoodNESSource/blob/master/journal/03-cart-differences.md).

Download from [SuperRobinHoodNESSource Releases](https://github.com/ap0ught/SuperRobinHoodNESSource/releases/latest) (or build locally) into RobinEdit as `roms/srh-rebuilt.nes` or `public/rebuilt.nes`.

## Asia vs rebuild — what the editor cares about

Same-offset byte match is only ~**40%**: one inserted/removed opcode shifts every later address. Known assembler/cart gaps (palette black `$0E` vs `$0D`, zero-page vs absolute, `add16toval` of negatives, one `flybackvar` branch, Taiwan lock / logo order) are documented in parent [`journal/03-cart-differences.md`](https://github.com/ap0ught/SuperRobinHoodNESSource/blob/master/journal/03-cart-differences.md). **Nothing there blocks RobinEdit.**

RobinEdit finds `mapinfo`, block/solid/`mapchrsdefs`, CHR tables, and object lists by **PRG signature**, not hard-coded Asia file offsets, so both images load. Play-from-map patches also use opcode signatures for the same reason.

`make check` / `src/selftest.ts` exercises both `public/asia.nes` and `public/rebuilt.nes` when present:

| Check | Asia | Rebuild |
|-------|------|---------|
| Map count / widths | 13 maps, same width list | same |
| Object counts per map | `14,8,4,11,29,23,18,31,5,5,4,3,2` | same |
| Map-4 overview “ink” (non-zero RGB pixels after render) | ~**277 673** | ~**745 472** |
| Ink threshold | must be ≥ 1000 (both pass) | same |
| PP1 rock/sky tile probes, exits, pickups, insert/delete | ok | ok |

Higher rebuild ink is expected (different CHR / code layout still yields a full painted map); a near-zero ink value would mean a blank/broken render.

## Which ROM to use with RobinEdit

| Goal | Prefer |
|------|--------|
| Match the common dumped cart / dizzy9’s Asia-oriented tool | **Asia** dump |
| Work from assembled PDS source / iterate after `build_srh.py` | **`srh-rebuilt.nes`** |
| Empty-screen one-click list | Drop either (or both) into **`roms/`** |
| Local `make check` | Optional copies as `public/asia.nes` and `public/rebuilt.nes` |

Either image is fine for day-to-day editing. Keep commercial dumps **out of git** in this repo (`*.nes`, `public/*.nes`, `roms/*.nes` are ignored).

## Licensing / copyright caution

- The **commercial ROM** and its assets remain third-party IP (Codemasters / Camerica / related). Obtain a dump you are allowed to use; do **not** commit or redistribute `.nes` binaries from this repository.
- The **PDS source** rebuild path is tied to the published Codemasters / Wireframe source recovery story; see SuperRobinHoodNESSource and [ap0ught/SuperRobinHood](https://github.com/ap0ught/SuperRobinHood) for how those trees attribute Wireframe / Oliver Twins material. Rebuilt binaries are still game code — treat redistribution carefully.
- RobinEdit’s React source is separate from cart IP; see the root README credits.

## Where files live across repos

| Path | Repo |
|------|------|
| `vendor/Super Robin Hood (Asia) (En) (Unl).nes` | SuperRobinHoodNESSource |
| `srh-rebuilt.nes` (build output; may be published there) | SuperRobinHoodNESSource |
| `roms/prerelease.nes` | ap0ught/SuperRobinHood |
| `roms/*.nes`, `public/asia.nes`, `public/rebuilt.nes` | Local only in **robinedit** (gitignored) |

Parent mirror of this note: [SuperRobinHoodNESSource `docs/ROMS.md`](https://github.com/ap0ught/SuperRobinHoodNESSource/blob/master/docs/ROMS.md).
