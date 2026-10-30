# Tiles: RobinEdit 0.4.4.exe vs the React port

How dizzy9’s Windows editor ([romhacking.net/utilities/1828](https://www.romhacking.net/utilities/1828/)) got metatiles onto the screen, and what `robinedit/` had to rebuild in the browser. Sidecars and ROM layout are **seen**. Exact MMF2 object graph and GDI call sites are only as deep as strings / FrameHeaders — anything past that is **inferred**.

## What the EXE shows (seen)

`NewRobinEditor 0.4.4.exe` is a PE32 GUI linked to Clickteam **MMF2** (`mmfs2.dll` ships beside it; `MMFS2` / `GDI32` appear in the import strings). It is not a browser canvas app.

Palette path is explicit in the binary and the install tree:

- Sidecar `master.pal` — **192 bytes**, 64 NES RGB triples (same bytes embedded as base64 in `robinedit/src/palette.ts`).
- EXE strings include `CreatePalette`, `SelectPalette`, `RealizePalette` (Windows GDI logical palette). The file name `master.pal` is **not** embedded in the EXE body; the editor loads it from disk next to the binary.

Main map frames dump as **992×448** (`FrameHeader` width/height in the unpacked MMF frame chunks). That is exactly **31×14** metatiles at **2×** (31×16×2 = 992, 14×16×2 = 448) with square pixels. No CSS-style stretch-to-fill — the stage size is fixed in the frame.

`lang/eng.ini` `[view]` lists the animate toggles the EXE overlays on that bitmap path: Flash blocks, Archers, Cannons, Torches, Spitters, Fire, Drills, Spider, Barrel (plus All / None). Those labels drove the React View-menu parity list in `anim.ts`.

## What the EXE must be reading (seen in ROM / `pds_src`, inferred in the EXE)

The cart / source layout the editor edits is not ambiguous; whether 0.4.4 hardcodes Asia offsets or scans is **not** established here.

- Metatile defs in bank 0: `blkstl` / `blkstr` / `blksbl` / `blksbr` / `blksattr` (+ `solidchrs`). Each map cell is one block ID; four CHR indices + attribute nibble make a 16×16.
- Map strips: columns **14** tall (`MAP_HEIGHT`), widths from `mapinfo`.
- `mapinfo`: six bytes per level — pointer, world X, width, palette index (`gamepallettes`), CHR-set index into `mapchrsdefs`.
- CHR: Codemasters **PP1** packs via `compactedchrstable` / `mapchrsdefs` (`UNPACK.ROU` → `pp1_unpack`).

**Inferred:** MMF2 draws that decoded bitmap through Active Objects / runtime bitmaps (standard MMF2 path), then flips animate flags from the View menu on top. We did not reverse the event editor to prove object names.

## What React had to do instead

No Wine path, no GDI palette, no fixed 992×448 frame. The port rebuilds the same picture on a canvas.

### Unpack and locate

- `pp1.ts` — TypeScript PP1 unpacker aligned with the Markov / cart scheme (an earlier straight port of `UNPACK.ROU` inverted mode-3 codes and made sky/hall CHR look like noise; `selftest.ts` still asserts rock + sky tile ink).
- `rom.ts` — find tables by **signature** in the iNES PRG: `blkstl` (block + solid + `mapchrsdefs` prologue), `mapinfo` (known widths + pointer spacing), `compactedchrstable`-shaped CHR table, object pointer chains. Offsets float with rebuilds; hardcoding Asia file offsets would break `srh-rebuilt.nes`.

### Compose and scale

- `draw.ts` blits four 8×8 tiles per metatile into an RGBA buffer, then `drawImage`s at integer zoom with `imageSmoothingEnabled = false`.
- Zoom UI is **1× / 2× / 3×** only (`App.tsx`). CSS on the stage canvas is `image-rendering: pixelated` / `crisp-edges` and **explicitly forbids CSS stretch** (`width`/`height` auto from `canvas.width`/`height` only — comment in `styles.css`).
- A user screenshot of a sky strip (Level Map 13) showed corrupted colors and wrong aspect when the canvas was stretched or the wrong PP1 packs were bound. The EXE never hit that class of bug: fixed 2× frame + square pixels. Matching `master.pal` RGB alone was not enough until unpack order and non-stretched sizing were correct.

### Palette, overview, overlays

- Same `master.pal` mapping in `palette.ts` (`nesColor`).
- Castle overview (`overview.ts`) is **live**: every strip re-rendered from current ROM bytes, placed by `mapheights` + `worldX` / width — not a static screenshot asset.
- Object markers are canvas overlays on the zoomed bitmap (`paintLevel`): archers/cannons use level CHR sprite tiles at pixel Y; keys/secrets/Marion and coinco pickups are always drawn; Robin start spawn is marked on Map 6. Flash-block blink is JS (`animateFlash` + `flashVisible` / anim tick). Other View-menu tile anim kinds (`anim.ts` ← `ONSCREEN.ROU` `blockrous`: torch, spit, drip, drill, …) pulse as colored overlays when toggled — not full CHR frame cycles. `RomDoc.blockrous` is loaded from the ROM. Map exits are **off-canvas** UI so navigation clicks never paint tiles.

## Bottom line

The EXE is a fixed-size MMF2 + GDI bitmap viewer over the Asia-style ROM tables, with `master.pal` and eng.ini animate flags as the visible contract. React had to reimplement PP1, signature-find the tables, compose metatiles to RGBA, and keep **integer zoom / no CSS stretch** — or sky levels look like the broken screenshot again.
