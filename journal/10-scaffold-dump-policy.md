# 10 — Scaffold, branding, and Magician dump policy

Milestone **1** (scaffold / rebrand) plus guardrails that belong in docs before Magician I/O lands.

## Package / UI identity (issue #1)

Clone still carries RobinEdit npm metadata. Safe renames without Magician I/O:

| Location | Current (fork) | Recommended |
|----------|----------------|-------------|
| `package.json` `name` | `robinedit` | `magicianedit` |
| `package.json` `description` | Super Robin Hood / mapper 71 | Magician NES editor (MMC3); planned RobinEdit port |
| `package.json` `version` | `0.6.1` (Robin line) | Keep or reset baseline (e.g. `0.1.0`) — document choice in RELEASE |
| `index.html` `<title>` | `RobinEdit` | `MagicianEdit` |
| `Makefile` banner | “RobinEdit → http://…” | MagicianEdit |
| `AGENTS.md` header | RobinEdit / mapper 71 | MagicianEdit + pointers to magician-nes-re / pds6502 |
| `src/App.tsx` comment | “Main RobinEdit shell” | MagicianEdit shell (logic can stay Robin until load lands) |

User-visible strings in panels (`CastleRobinPanels`, JumpSelects “Marion”, etc.) can wait for milestones 4–5; do not rewrite `App.tsx` Magician formats in #1.

Magician branding anchors in source trees:

- Eurocom package: `magician-nes/vendor/Magician-NES/_READ_ME.TXT` / `README.md` (Chris Shrigley educational release).
- Rebuild docs product name: “Magician Redux” in magician-nes `README.md` (Rust core not started).
- Cart registry keys: `beta1`, `beta2`, `beta3`, `beta4`, `beta`, `release` in `magician-nes/asm/patches.py`.

## Journals + AGENTS (issue #2)

- MagicianEdit research lives in **`journal/`** (this tree).
- Inherited Robin notes stay in **`journals/`** — treat as historical / Robin-only.
- AGENTS.md should point at: `ap0ught/magician-nes-re`, `ap0ught/pds6502`, `ap0ught/robinedit`, `ap0ught/SuperRobinHoodNESSource`.
- magician-nes already has a deep `journal/` (rebuild instrumentation). Cite those instead of copying (`19-between-beta1-and-release.md`, `18-draw-layer-scaffold.md`, `05-bizhawk-is-the-instrument.md`).

## Dump policy for `docs/ROMS.md` (issue #3)

Replace Robin mapper-71 Asia/rebuild docs with Magician policy. Facts from magician-nes (`asm/patches.py` / `tools/carts.py`):

| Dump key | File (typical) | Body SHA1 (header stripped) | Battery (iNES byte 6) | Vectors NMI/RESET/IRQ |
|----------|----------------|------------------------------|------------------------|------------------------|
| **`beta1` (pin first)** | `Magician (USA) (Beta 1) (1990-03-02).nes` | `af51e12dbcd6acbdc914f0c63ed67d79165ce304` | **CLEAR** (`$40`) | `$F917` / `$F930` / `$F922` |
| `release` | `Magician (USA).nes` | `bd806d7f7c318b8012433250ca10aa8387a962bb` | SET (`$42`) | `$F9AB` / `$F9C1` / `$F9B3` |
| `beta3` / `beta` | `(Beta 3).nes` / `(Beta).nes` | `2a0a444d…` (identical bodies) | SET | `$F96E` / `$F984` / `$F976` |

- Size **262160** = 16-byte iNES + **128 KiB PRG** + **128 KiB CHR**; mapper **4 (MMC3)**; horizontal mirroring.
- Source last-update `02/03/90` matches Beta 1 — rebuild `DEFAULT_CART = "beta1"`.
- Dumps under gitignored `roms/` (optional `public/`). **Never commit `.nes`.**
- Beta 1 vs release spell names / RAM addresses: magician-nes README + `tools/spelltab.py`.

## Quarantine Robin modules (issue #4)

Robin modules that must not silently become Magician paths:

`rom.ts`, `pp1.ts`, `objects.ts`, `pickups.ts`, `keys.ts`, `secrets.ts`, `exits.ts`, `overview.ts`, `CastleRobinPanels.tsx`, `play.ts`, `robinSpawn.ts`, `selftest.ts`.

Recommended staging:

1. **Short term:** keep compiling; after #10, reject non-MMC3 Magician loads (or keep Robin path only if explicitly opened as Robin — prefer hard Magician-only once I/O lands).
2. **Medium:** `src/robin/` vs `src/magician/` when map document model (#11) exists; delete Robin-only UX (#18, #23) after Magician panels work.
3. No big-bang rewrite in scaffold milestone.

## `.nes` gitignore / CI (issue #29)

Already present:

```
*.nes
public/*.nes
roms/*.nes
.play/
```

Optional CI: fail if `git ls-files '*.nes'` is non-empty; document in README + rewritten `docs/ROMS.md`. See also magician-nes `tools/guard_staged.sh`.
