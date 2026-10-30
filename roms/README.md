# Local ROMs

Drop Magician `.nes` dumps here for the empty-screen list. **Do not commit them** — `roms/*.nes` is gitignored. Keep this folder (and `.gitkeep`) in git.

Pin **Beta 1** first: `Magician (USA) (Beta 1) (1990-03-02).nes`. The USA release is `Magician (USA).nes`. Registry and hashes: **[`docs/ROMS.md`](../docs/ROMS.md)**.

The dev list is every `*.nes` in this folder. MMC3 load is not in this build yet, so a Magician image shows up and then fails the inherited mapper 71 guard.

- Dev: served as `/roms/<name>.nes`, listed by `GET /api/roms`.
- Production build: copies present `.nes` files into `dist/roms/` and writes `manifest.json`. That output stays local.
