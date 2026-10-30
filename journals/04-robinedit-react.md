# RobinEdit 0.4.4 → React

## Why

`tools/` had two archives: `RobinEdit v0.3.rar` (2013) and `RobinEdit.rar` (2024). The newer one is **0.4.4** — `NewRobinEditor 0.4.4.exe` by Łukasz Kur (dizzy9), distributed on [romhacking.net/utilities/1828](https://www.romhacking.net/utilities/1828/). It is a Windows PE, Clickteam Multimedia Fusion 2 (`mmfs2.dll`), so it does not run here. The goal was a native editor that reads and writes the same mapper 71 cart.

## What the EXE actually is

Sidecar files matter more than the EXE body for orientation:

- `lang/eng.ini` — menus and object panel labels (FLASH BLOCK, ARCHER, PLATFORM, KEY, CANNON, ROBIN, SECRET, MARION, WATER).
- `master.pal` — 64 NES RGB triples (192 bytes). GDI palette path in the EXE (`CreatePalette` / `SelectPalette`).
- Main MMF2 map frame is **992×448**, which is 31×14 metatiles at **2×** with square pixels. No stretch-to-fill.

It edits the Asia-style ROM in place: map strips, object lists, and the Robin stats the original “Settings / Robin” panel touched.

## Map layout (from `pds_src` + cart)

Thirteen live strips (`mapb`…`mapo`; `mapa` / `mapk` / `mapp` unused). Each column is **14** block IDs, top to bottom. `mapinfo` is six bytes per level: pointer (to the column *before* column 0), world X, width, palette index into `gamepallettes`, CHR set index into `mapchrsdefs`.

Block graphics sit at bank 0: `blkstl` / `blkstr` / `blksbl` / `blksbr` / `blksattr` / `solidchrs`. CHR is Codemasters **PP1** packed data; `compactedchrstable` + `mapchrsdefs` say which packs to unpack into the 256-tile pattern for that level.

Objects live in the fixed bank as typed records (`xflashblock`, `xstandguard`, `xplatformh` / `v`, `xkey`, `xcanon`, `xsecret`, `xmarion`, `xwater`) listed from `maprouspointer`. Formats are documented in `XTRAROUS.ROU` comments.

Keys (type 5) use `raw[5]` as LINK: `0` = unlink; `≥ 255−noofdoors` opens a `doordata` door (`openadoor`); other values toggle platform/lift extras by id (`turnoffdoor`). Doors are `map,x,y+height*16` with the low nibble as the **bottom** row (closedoor grows upward).

Animated map tiles (torch, spit, drip, drill, spider, barrel, …) are classified by the 256-byte `blockrous` table in `ONSCREEN.ROU`. Treasures and hearts are not typed objects: `coinco` in `NEWBITS.ROU` is 48+48 `(column, mapIndex)` pairs.

Robin starts on `startlevel equ 5` (Map 6) with `robinxl=290`, `robiny=208` from `CONTROL.ROU` `resetrobinvars`.

Map exits follow `MAPSCROL.ROU` `checkoffscreen`: vertical neighbors at height ±1 with overlapping world X; horizontal neighbors on the same height tier that abut or overlap.

## React app (`robinedit/`)

Vite + React + TypeScript. Run with:

```bash
cd robinedit && make
```

That serves `http://127.0.0.1:5173/`. `make check` loads the Asia cart and `srh-rebuilt.nes` and asserts map widths, PP1 tiles, overview hits, `blockrous`, `coinco` pickups, collectables, and object insert/delete.

### Done (parity with eng.ini / usable 0.4.4)

- Open / **Save** / **Save as**, undo/redo (toolbar + Ctrl/⌘Z, Shift+Z, Y), PNG **Export Map** with layer toggles.
- Background paint (left drag) and eyedrop (right click).
- Object move + inspectors; **Insert** / **Delete** when free bytes exist after the packed object region.
- View → **Animate**: flash blocks, archers, cannons, torches, spitters, drips, drills, spider, barrel (and All / None) as pulsing overlays from `blockrous`.
- Grid styles, collision overlay, object markers.
- Always-visible **Palette** and **CHR** switches (mapinfo bytes); CHR panel lists active set first + loaded pack slots. Stacking new packs into `mapchrsdefs` is not offered (fixed terminator lists).
- Robin stats panel (lives, cheat lives, hearts, jump, run table).
- Dynamic castle overview from live map data; click to jump.
- Jump dropdowns on their **own toolbar row**: Enemy, Collectable, Treasure/heart.
- Mode segment (**Background / Objects / Castle / Robin**) at the **top of the right sidebar**.
- Level hub in the sidebar (palette swatches, CHR packs, object counts, exits, Robin start).
- Hover status: column/row/block plus object/pickup/door under the cursor.
- Key LINK/UNLINK inspector with plain-language target; linked door/platform highlight on canvas.
- Enemies (archer/cannon) as CHR sprites + standing hit boxes at pixel Y.
- Collectables (KEY/SECRET/MARION) always drawn at pixel Y; coinco treasures/hearts as markers.
- Robin start marker on Map 6; exit poses as direction arrows (MAPSCROL ±`$D0` / ladder shafts).
- Map exits as **off-canvas** rail + sidebar chips — **one chip per rim ladder shaft** (e.g. Map 3 → two ups, two downs), not one per destination.
- Background tile panel: fixed 96×96 corner preview (hover peeks, else selected paint tile).
- Castle Map overview fills the viewport at max integer scale; numbering is `mapinfo` order (sky band reads 9·12·10 / 11·13 geographically — see journal 08).
- **Play map**: patches `startlevel` + Robin floor spawn, NOPs title, opens via FCEUX (`xdg-open`); heals `AutoLoadState=99`.
- Author credit (dizzy9) via **Author** / About modal only — not a permanent sidebar block.

### Still limited

- No Wine path; React is the native stand-in.
- Object insert needs prior deletes (or other free zeros) — the stock cart packs the object lists with almost no slack.
- Tile “animation” for torch/spit/etc. is a pulsing overlay from `blockrous`, not a full CHR frame cycle like the game’s on-screen routines.
- Robin markers are editor glyphs (start diamond / exit arrows), not the full in-game multi-part sprite.
- Cannot safely append packs into `mapchrsdefs` lists without rewriting ROM tables; only switch among Dungeon/Hall/Church/Sky.
- Play-from-map needs local Vite (`make`) + FCEUX; spawn is a heuristic floor near the left of the strip.

## Credit

Original editor: **Łukasz Kur** (`dizzy9@tlen.pl`), **dizzy9** on romhacking.net — https://www.romhacking.net/utilities/1828/
