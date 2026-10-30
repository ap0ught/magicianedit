# Local ROMs

Drop `.nes` carts here for the empty-screen list. **Do not commit them** — `roms/*.nes` is gitignored. Keep this folder (and `.gitkeep`) in git.

Magician dump policy (Beta 1 first, no committed carts): **[`docs/ROMS.md`](../docs/ROMS.md)**.

Until Magician load/save lands, the inherited shell only opens mapper 71 carts. A Magician image in this folder will show up in the list and then fail that guard.

- Dev: served as `/roms/<name>.nes`, listed by `GET /api/roms`.
- Production build: copies present `.nes` files into `dist/roms/` and writes `manifest.json`. That output stays local.
