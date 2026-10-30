# MagicianEdit journals

Research and port notes for **MagicianEdit** — a planned React/Vite editor for **Magician** (NES, Taxan / Eurocom, **MMC3**), cloned from [RobinEdit](https://github.com/ap0ught/robinedit).

Primary local source for Magician facts: [`magician-nes`](https://github.com/ap0ught/magician-nes-re) (`/home/cmayfield/code/games/magician-nes`). Assembler sibling: [`pds6502`](https://github.com/ap0ught/pds6502). Robin contrast: this fork’s inherited `src/` plus [`robinedit`](https://github.com/ap0ught/robinedit) / [`SuperRobinHoodNESSource`](https://github.com/ap0ught/SuperRobinHoodNESSource).

Inherited Robin-only session notes remain under [`journals/`](../journals/) (`04`–`09`) until Magician I/O replaces those workflows. Prefer **this** `journal/` for MagicianEdit milestones.

| File | Topic | Issues (approx.) |
|------|--------|------------------|
| [10-scaffold-dump-policy.md](10-scaffold-dump-policy.md) | Rebrand, dump policy, Robin quarantine | #1–#4, #29 |
| [11-dat-packs-mmc3.md](11-dat-packs-mmc3.md) | Vendor DAT packs; MMC3 vs mapper 71 | #5, #6, #10 |
| [12-map-blk-col-pal.md](12-map-blk-col-pal.md) | `.MAP` / `.BLK` / `.COL` / `.PAL` / `.CHR` layouts | #7, #11–#17 |
| [13-level-chr-object-pointers.md](13-level-chr-object-pointers.md) | `curlev`/`curlevind`, level descriptors, CHR, `actob` | #8, #16, #24 |
| [14-objects-events-shops.md](14-objects-events-shops.md) | `obchars` / OB2 / PROBS / SHOPDAT vs Robin KINDS | #9, #18–#23 |
| [15-play-ci-releases.md](15-play-ci-releases.md) | Play bridge, BizHawk/FCEUX, selftest, release CI | #13, #25–#28 |
| [16-title-screen.md](16-title-screen.md) | Title scene: `dotitle`, `TIT.DAT`, CHR splits | #32 |

Do **not** commit `.nes` dumps. Pin MagicianEdit research against **Beta 1** first (see journal 10 / magician-nes `asm/patches.py`).
