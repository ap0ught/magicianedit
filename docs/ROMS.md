# Magician dumps used by MagicianEdit

MagicianEdit does **not** ship `.nes` files. They are gitignored (`*.nes`, `public/*.nes`, `roms/*.nes`). You supply a dump you are allowed to use. Place it under project-root `roms/` (dev list and one-click open) or, for local `make check` samples only, under `public/`.

**Do not commit carts or secrets.**

The loader in `src/magician/` accepts mapper **4**, 128 KiB PRG, 128 KiB CHR, **262160** bytes. Mapper 71 is rejected. A body SHA1 other than Beta 1 is a warning, not a refusal. Pack offsets come from the descriptors in the opened file. This document replaces the old Super Robin Hood Asia / rebuild note. Those fingerprints stay in [SuperRobinHoodNESSource `docs/ROMS.md`](https://github.com/ap0ught/SuperRobinHoodNESSource/blob/master/docs/ROMS.md).

## What to pin

Research and future load/save pin **Beta 1** first.

The Eurocom source’s last update is **02/03/90**. That matches the dump dated **1990-03-02**. [magician-nes-re](https://github.com/ap0ught/magician-nes-re) sets `DEFAULT_CART = "beta1"` in `asm/patches.py` for that reason. The 1991 USA release is a later cart: different body, battery bit set, different vectors, and different spell names / RAM addresses (`README.md`, `tools/spelltab.py` in that repo).

Registry and on-disk checks live in magician-nes-re:

- `asm/patches.py` — `CARTS` (file name, body SHA1, whole-file SHA1, battery flag, vectors)
- `tools/carts.py` — checks magic, sizes, both SHA1s, header byte 6 battery bit, and NMI / RESET / IRQ

Body SHA1 is the header-stripped digest. Whole-file SHA1 (`sha1_full` in the registry) is what BizHawk’s `MAGICIAN_EXPECT_SHA1` uses. Do not treat two dumps as the same cart because the 16-byte header matches.

## Image shape

Every dump in the registry is **262160** bytes: 16-byte iNES header + **128 KiB PRG** + **128 KiB CHR**. magician-nes-re documents them as mapper **4 (MMC3)**, horizontal mirroring. PRG count in the header is 8 × 16 KiB; CHR count is 16 × 8 KiB.

The battery bit is header byte 6, bit 1 (`data[6] & 0x02`), not a guess from the filename. **Beta 1 is the dump with that bit clear** (recorded header byte 6 `$40`). The USA release is recorded as `$42` (bit set). A tool that assumes every Magician cart has battery-backed PRG RAM is wrong for Beta 1.

Vectors below are NMI / RESET / IRQ as stored in the registry (RESET is the middle address).

## Registry

Copied from `asm/patches.py` `CARTS`. Re-check with `tools/carts.py` before treating a local file as one of these.

| Key | Typical file | Body SHA1 (header stripped) | Battery | Vectors NMI / RESET / IRQ |
|-----|----------------|------------------------------|---------|----------------------------|
| **`beta1` (pin first)** | `Magician (USA) (Beta 1) (1990-03-02).nes` | `af51e12dbcd6acbdc914f0c63ed67d79165ce304` | **CLEAR** | `$F917` / `$F930` / `$F922` |
| `beta2` | `Magician (USA) (Beta 2).nes` | `e8d8e26ced71709f6a5d3cb5147174dfe50971cf` | SET | `$FA05` / `$FA1B` / `$FA0D` |
| `beta3` | `Magician (USA) (Beta 3).nes` | `2a0a444dae8b5b02f4e5f1b789e16356f3ab08f0` | SET | `$F96E` / `$F984` / `$F976` |
| `beta` | `Magician (USA) (Beta).nes` | `2a0a444dae8b5b02f4e5f1b789e16356f3ab08f0` | SET | `$F96E` / `$F984` / `$F976` |
| `beta4` | `Magician (USA) (Beta 4).nes` | `80c7ffa9bddf50fafd39afc5c4f49d4a9486ba7d` | SET | `$F9AB` / `$F9C1` / `$F9B3` |
| `release` | `Magician (USA).nes` | `bd806d7f7c318b8012433250ca10aa8387a962bb` | SET (`$42`) | `$F9AB` / `$F9C1` / `$F9B3` |

`beta3` and `beta` share a body. `beta4` shares the release’s vectors and does **not** share its body. Beta 2’s vectors sit on a different branch from both Beta 1 and the release.

## Where files live

| Path | Role |
|------|------|
| `roms/*.nes` | Local dumps. Gitignored. Dev server lists them (`GET /api/roms`, `/roms/<name>`). |
| `public/*.nes` | Optional local samples for `make check`. Gitignored. Not the Magician pin. |
| magician-nes-re cart dir | Whatever `asm/patches.py` `CART_DIR` points at on that machine. Not this repo. |

A production build copies whatever `.nes` files are present in `roms/` into `dist/roms/`. That output is local. Do not publish carts from CI.

The empty screen lists that folder and names the Beta 1 pin and the USA release (`Magician (USA) (Beta 1) (1990-03-02).nes`, `Magician (USA).nes`). Sample buttons open those two paths under `/roms/`.

## Checks

`npm run check:magician` builds a synthetic iNES image and round-trips it. It does not read a `.nes` file. If the Beta 1 dump is on disk at the path recorded in that test, the same run also checks a byte-identical save. `npm run check` then runs `src/selftest.ts`, which still looks for mapper 71 samples at `public/asia.nes` and `public/rebuilt.nes`. Those samples are not Magician carts.

## Licensing

Magician cartridge dumps and assets are third-party IP (Taxan / Eurocom). Obtain a dump you are allowed to use. The Chris Shrigley / Eurocom educational source package is a separate tree in magician-nes-re (`vendor/Magician-NES/`). Neither belongs in this repo as a `.nes` file.
