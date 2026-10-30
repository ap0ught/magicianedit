# Local ROMs

Drop mapper-71 **Super Robin Hood** `.nes` carts here. RobinEdit lists them on the empty/start screen for one-click open.

A rebuilt cart (`srh-rebuilt.nes`) is published on [SuperRobinHoodNESSource Releases](https://github.com/ap0ught/SuperRobinHoodNESSource/releases/latest) — download the release asset, then place the file in this folder. Prefer that over any raw blob URL. The byte-identical rebuild project also ships [`prerelease.nes`](https://github.com/ap0ught/SuperRobinHood/tree/master/roms).

- Dev: served as `/roms/<name>.nes`, listed by `GET /api/roms`.
- Production build: copies present `.nes` files into `dist/roms/` and writes `manifest.json`.
- **Do not commit** `.nes` dumps — `roms/*.nes` is gitignored. Keep this folder (and `.gitkeep`) in git.
