# Inherited RobinEdit journals (historical)

Session notes copied with the RobinEdit shell for Super Robin Hood (mapper 71). They remain useful while Magician I/O is incomplete, but **MagicianEdit port research lives in [`../journal/`](../journal/)**.

Asia dump vs `srh-rebuilt.nes` (Robin): see old [`docs/ROMS.md`](../docs/ROMS.md) until rewritten for Magician (issue #3 / [`journal/10-scaffold-dump-policy.md`](../journal/10-scaffold-dump-policy.md)).

| File | Topic |
|------|--------|
| [04-robinedit-react.md](04-robinedit-react.md) | Port overview: EXE → React, ROM map/object layout, feature parity |
| [05-tiles-exe-vs-react.md](05-tiles-exe-vs-react.md) | Metatiles / PP1 / palette: 0.4.4.exe vs canvas path |
| [06-robin-room-spawn.md](06-robin-room-spawn.md) | Room transitions: ±`$D0` Y wrap, ladder shafts, spawn pose |
| [07-map-exits-and-shafts.md](07-map-exits-and-shafts.md) | No exit table — geometry + rim ladders; Exits rail |
| [08-castle-map-numbering.md](08-castle-map-numbering.md) | Map N vs geographic castle overview (`mapheights` + world X) |
| [09-robin-settings-cheatlives.md](09-robin-settings-cheatlives.md) | Robin stats / cheatLives: cart vs dizzy9 vs `patchRobin` |

Agent entry: [`AGENTS.md`](../AGENTS.md) (still Robin-branded until issue #2) and [`../journal/README.md`](../journal/README.md).
