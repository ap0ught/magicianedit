# Local ROMs

Drop `.nes` carts here for the empty-screen list. **Do not commit them** — `roms/*.nes` is gitignored. Keep this folder (and `.gitkeep`) in git.

Magician dump policy (Beta 1 first, no committed carts): **[`docs/ROMS.md`](../docs/ROMS.md)**.

The empty screen opens Magician MMC3 dumps from this folder. A mapper 71 cart is rejected.

- Dev: served as `/roms/<name>.nes`, listed by `GET /api/roms`.
- Production build: copies present `.nes` files into `dist/roms/` and writes `manifest.json`. That output stays local.
