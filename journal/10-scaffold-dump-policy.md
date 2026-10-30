# 10 — Scaffold, branding, and Magician dump policy

Milestone **1** (scaffold / rebrand) plus guardrails that belong in docs before Magician I/O lands.

## Package / UI identity (issue #1)

At clone time the tree carried RobinEdit npm metadata. Safe renames without Magician I/O:

| Location | Current (fork) | Recommended |
|----------|----------------|-------------|
| `package.json` `name` | `robinedit` | `magicianedit` |
| `package.json` `description` | Super Robin Hood / mapper 71 | Magician NES editor (MMC3); planned RobinEdit port |
| `package.json` `version` | `0.6.1` (Robin line) | **Reset to `0.1.0`** — new MagicianEdit line, not RobinEdit 0.6.x (`docs/RELEASE.md`) |
| `index.html` `<title>` | `RobinEdit` | `MagicianEdit` |
| `Makefile` banner | “RobinEdit → http://…” | MagicianEdit |
| `AGENTS.md` header | RobinEdit / mapper 71 | MagicianEdit + pointers to magician-nes-re / pds6502 |
| `src/App.tsx` comment | “Main RobinEdit shell” | MagicianEdit shell (logic can stay Robin until load lands) |

User-visible strings in panels (`CastleRobinPanels`, JumpSelects “Marion”, etc.) can wait for milestones 4–5; do not rewrite `App.tsx` Magician formats in #1.

**Landed with milestone 1:** `name` `magicianedit`, description as in the table, version **0.1.0**, `index.html` title, Makefile banner, AGENTS header, and the App shell comment. The header badge is `0.1.0` (the old `0.4.4` badge was dizzy9’s tool version; About still credits that). Panel copy stays.

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

**Decision:** keep the Robin format modules compiling **in place**. Do not move or delete them in this milestone. No `src/robin/` vs `src/magician/` split, no dead-path unplug, and no gradual deletion.

There is no Magician loader to replace them. `rom.ts`, `objects.ts`, `pickups.ts`, `secrets.ts`, `exits.ts`, and `play.ts` are the live editor. `pp1.ts` is only imported by `rom.ts`. `App`, `Stage`, the panels, `LevelNav`, `selftest`, and `playBridge` all import that set. Unplugging it would remove the only editor this tree has.

Also frozen, same rule, even though they were left off the issue list: `settings.ts`, `robinSpawn.ts`, `keys.ts`, `anim.ts`, `sprites.ts`, `draw.ts`, `CastleRobinPanels.tsx`.

New Magician format code goes in **new files** and must not grow these. A folder move waits until the first Magician document type exists.

## `.nes` gitignore / CI (issue #29)

Already present:

```
*.nes
public/*.nes
roms/*.nes
.play/
```

Optional CI: fail if `git ls-files '*.nes'` is non-empty; document in README + rewritten `docs/ROMS.md`. See also magician-nes `tools/guard_staged.sh`.
