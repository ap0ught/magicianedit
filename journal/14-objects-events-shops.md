# 14 — Objects, events, shops vs Robin KINDS

Milestone **5**. Magician has **no** Robin coinco treasures/hearts, key LINK/UNLINK, or MARION kinds.

## `obchars` type survey (issue #9)

Authoritative labels: trailing comments on `obchars` in `magician-nes/vendor/Magician-NES/MISC.SRC` (order = type index). Checked against that table (types 0–43); the names below match the comments.

| # | Name | # | Name |
|---|------|---|------|
| 0 | plr | 20 | winged serpent |
| 1 | wizard | 21 | werebat |
| 2 | spitting plant | 22 | venworm |
| 3 | boatman | 23 | little dragon |
| 4 | victory machine | 24 | armour |
| 5 | mushroom | 25 | wise man |
| 6 | talking tree | 26 | skeleton |
| 7 | talking snake | 27 | young woman |
| 8 | beggar | 28 | spider |
| 9 | troll | 29 | stoneman |
| 10 | old lady | 30 | rat |
| 11 | turtle | 31 | fire elemental |
| 12 | spectre | 32 | demon |
| 13 | marsh gas | 33 | spikes on roof |
| 14 | vines | 34 | abadon |
| 15 | barbarian | 35 | treasure chest |
| 16 | adventurer | 36 | slab |
| 17 | monk | 37 | pendulum |
| 18 | beholder | 38 | fountain |
| 19 | stalagmite | 39 | statue |
| | | 40 | sphinx |
| | | 41 | final sp machine |
| | | 42 | statue of wizard |
| | | 43 | twin man |

Animation / AI bodies: `OB2.SRC` (comments: Little dragon, Armour, Wise old man, Skeleton, Young woman, Spider, Stoneman, Rat, Fire elemental, Demon, Spikes, Abadon, Treasure chest, Slab, Pendulum, Fountain, Statue, Sphinx, Final spell machine, Twin man, …).

### PROBDAT screen-trigger kinds (`st_*`)

`PROBDAT.SRC`: `st_msg`, `st_obj`, `st_che`, `st_sta`, `st_bar`, `st_adv`, `st_mon`, `st_gid`, `st_wiz`, `st_spc`, `st_dmn`, `st_trl`, `st_beh`, `st_spi`, `st_wer`, `st_ven`, `st_rat`, `st_wng`, `st_arm`, `st_skl`, `st_pen`, `st_rok`, `st_sto`, `st_vin`, `st_tur`.

Placement comments: H levels use trigger_x = object x; V uses trigger_y; ground from `obxyst` − type `obyr`.

### Player trigger kinds (`pt_*`)

`pt_dmap`, `pt_left`/`pt_rigt`/`pt_uppp`/`pt_down`, `pt_dyn0`/`pt_dyn1`/`pt_dyn2`, `pt_shop`, `pt_maze`, `pt_tree`, `pt_holy`, `pt_mult`, `pt_weak`, `pt_fill`, `pt_fire`, `pt_upex`.

These are Magician’s counterpart to Robin exits/secrets rails (#18, #21) — not MAPSCROL exit chips.

## Robin KINDS that do **not** apply

From `magicianedit/src/objects.ts`: FLASH BLOCK, ARCHER, PLATFORM H/V, KEY, CANNON, SECRET, MARION, WATER — plus `pickups.ts` coinco, `keys.ts` LINK, `secrets.ts`. Gate/delete in #23 once Magician object UX exists.

UX that **does** still apply in spirit: move / inspect / insert / delete markers on a stage (#19–#20), but records are PROBDAT/event-bank shaped with free-space constraints unlike Robin packed lists.

## PROBS editor (#21)

Parse `ptl`/`pth` per `curlevind`; show AABB + `pt_*` type + data byte; edit carefully (8-byte stride). Runtime handler: `plrevents` in `PROBS.SRC`.

## Shop / inventory / spells (#22)

- `SHOPDAT.SRC`: `shopdatum` 7-byte rows, `shoplist` bytecode (`buy`, `emp`, `exit`, `g1`, `mana10`, `yn`, `msg`, `set`/`clr`/`tst`, `addob`/`delob`, …), `shopx`/`shopy`.
- Spell names: `MISC.SRC` `sptxt`; Beta 1 matches source (`RAZORSTORM`, …) with bit-7 terminator on last char — `tools/spelltab.py`. Release/guide renames (`BOOMERAXE`, …) are **not** Beta 1.
- MVP: **read-only inspectors** first; writes risk breaking shop bytecode and inventory flags.

## Castle overview (#18)

Robin `overview.ts` / `CastleRobinPanels` / exit chips: retire for Magician. Optional later: world map from `pt_dmap` / logical `curlev` graph — only after connectivity research.
