# 15 — Play bridge, roms API, selftest, releases

Milestones **6–7**. Keep Vite `/api/play` pattern from RobinEdit; retarget patches and launchers.

## `roms/` listing API (#13)

Already present: `vite.roms.ts` serves `GET /api/roms` and `/roms/<file>` from project-root `roms/`, copies into `dist/roms/` + `manifest.json` on build. Plugin name still `srh-roms` — rename when convenient.

Magician work: ensure UI lists Magician dumps; no format change required beyond gitignore policy (journal 10). Do not commit `.nes`.

## Play-from-map patch (#24)

Robin (`play.ts`): find `startlevel` imm + floor-spawn heuristics + title NOP.

Magician research targets:

- Set entry via `curlev` / `newlev` / `stlev` / title→game path (journal 13).
- Spawn: player slot `pi` position bytes (`obxl`…`obyh`), not `robinxl`.
- Drop Robin title-NOP assumptions unless measured on Magician title (`dotitle`).

Validate patches against **Beta 1** in BizHawk before advertising Play.

## Launchers (#25–#26)

RobinEdit: `vite.play-bridge.ts` + `playBridge.ts` → FCEUX, download fallback.

Magician-nes harness (prefer integrate):

- `magician-nes/tools/bizhawk/run.sh` — strict SHA1/core/NullHawk/SaveRAM checks; Beta 1 battery clear so SaveRAM refuse logic differs from release.
- Lua probes under `tools/bizhawk/` (`ramprobe.lua`, `title.lua`, …).
- Journal `05-bizhawk-is-the-instrument.md`, `12-play-harness-and-where-our-build-stops.md`.

Keep FCEUX as fallback. UX (#26): clear errors when emulator missing, dump SHA mismatch, or bridge down (existing download fallback is good).

## Selftest / `make check` (#27)

`src/selftest.ts` still asserts Robin Asia/rebuild: mapper 71, PP1 rock/sky, coinco, object insert, play `startlevel`.

Replace with Magician golden checks when dumps present under `roms/` (fail clearly when absent — same SKIP pattern):

- iNES mapper 4 + sizes (journal 11)
- Optional body SHA1 == Beta 1 pin
- After loaders exist: MAP w×h for a known level, `obchars`/event table sanity, play patch round-trip

CI (`ci.yml`) already skips selftest (needs local dumps) — keep that; run selftest only in `make check` locally.

## Release workflow (#28)

`.github/workflows/release.yml` still packs `robinedit-${TAG}-dist.tar.gz`. Update asset name + `docs/RELEASE.md` branding to MagicianEdit. First Magician-capable tag only after load/save + basic map UI, or label pre-port shell releases explicitly.

## Guardrails (#29)

See journal 10 — `*.nes` gitignored; optional CI `git ls-files '*.nes'` fail.
