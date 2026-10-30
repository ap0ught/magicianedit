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

`OB2.SRC` section comments cover types 23–43 only (little dragon through twin man). Mushroom, troll, spectre, and winged serpent are types 5, 9, 12, and 20. This vendor drop has no object-AI file for types 0–22.

Shops and spells are not `obchars` types. A shop is `pt_shop` plus `SHOPDAT.SRC` (below). Spell names are `sptxt`.

### Screen triggers use their own ids (`st_*`)

`PROBDAT.SRC` defines `st_msg`…`st_tur` as `$00`–`$18`. `PROBS.SRC` `scnevents` keeps the low 5 bits of the type byte (`and #$1f`) and dispatches through `trvl`/`trvh`. That id is a separate numbering from `obchars`. Each `tr*` handler loads one fixed `obchars` index. `st_obj` is the exception: its data byte is the index.

| `st_*` | id | `obchars` loaded |
|--------|----|------------------|
| `st_msg` | `$00` | none (message) |
| `st_obj` | `$01` | data byte |
| `st_che` | `$02` | `$23` treasure chest |
| `st_sta` | `$03` | `$13` stalagmite |
| `st_bar` | `$04` | `$0F` barbarian |
| `st_adv` | `$05` | `$10` adventurer |
| `st_mon` | `$06` | `$11` monk |
| `st_gid` | `$07` | none (guidance) |
| `st_wiz` | `$08` | `$01` wizard |
| `st_spc` | `$09` | `$0C` spectre |
| `st_dmn` | `$0A` | `$20` demon |
| `st_trl` | `$0B` | `$09` troll |
| `st_beh` | `$0C` | `$12` beholder |
| `st_spi` | `$0D` | `$1C` spider |
| `st_wer` | `$0E` | `$15` werebat |
| `st_ven` | `$0F` | `$16` venworm |
| `st_rat` | `$10` | `$1E` rat |
| `st_wng` | `$11` | `$14` winged serpent |
| `st_arm` | `$12` | `$18` armour |
| `st_skl` | `$13` | `$1A` skeleton |
| `st_pen` | `$14` | `$25` pendulum |
| `st_rok` | `$15` | `$21` spikes on roof |
| `st_sto` | `$16` | `$1D` stoneman |
| `st_vin` | `$17` | `$0E` vines |
| `st_tur` | `$18` | `$0B` turtle |

`tr01` (`st_obj`) copies the data byte into X. Data `$06` (talking tree) and `$19` (wise man) replace that data byte with `%00111100` before `setobp`. The `st_rok` comment says "rock monster", and `tr15` does `ldx #$21`, but no `PROBDAT` row uses `st_rok`. Placed spikes are `st_obj,$21`. No `obchars` comment is named rock monster.

Placement comments: H levels use trigger_x = object x; V uses trigger_y; ground from `obxyst` − type `obyr`.

### Movement classes are not type ids

`TXT/MOVEMENT.TXT` partitions all 44 names into behavior classes. The class number is not stored as the type. The type byte’s high 3 bits are a movement-limit field in `actobxy`, separate from this list. Robin’s PLATFORM (H) and PLATFORM (V) are kinds; Magician’s travel shape is one of these classes.

| class | behavior | kinds |
|-------|----------|-------|
| 0 | specific or no movement | every name not listed below (the file says "old woman" for old lady) |
| 1 | patrol between x limits; spells when the player shares y | wizard, barbarian, adventurer, monk |
| 2 | face the player and chase | troll, venworm, armour, skeleton, spider, stoneman, rat |
| 3 | gentle bob | beholder |
| 4 | winged flying | winged serpent, werebat |
| 5 | ghostly | spectre, demon |

### Player trigger kinds (`pt_*`)

`pt_dmap`, `pt_left`/`pt_rigt`/`pt_uppp`/`pt_down`, `pt_dyn0`/`pt_dyn1`/`pt_dyn2`, `pt_shop`, `pt_maze`, `pt_tree`, `pt_holy`, `pt_mult`, `pt_weak`, `pt_fill`, `pt_fire`, `pt_upex`.

These are Magician’s counterpart to Robin exits/secrets rails (#18, #21) — not MAPSCROL exit chips. They are not `obchars` types.

## Robin KINDS that do **not** apply

From `magicianedit/src/objects.ts`: FLASH BLOCK, ARCHER, PLATFORM H/V, KEY, CANNON, SECRET, MARION, WATER — plus `pickups.ts` coinco, `keys.ts` LINK, `secrets.ts`. Those ids are neither `obchars` indices nor `st_*` values. `MISC.SRC` `obtxt` has an inventory KEY string; it is not a placed object and has no door LINK. Gate/delete in #23 once Magician object UX exists.

Object-panel actions (`src/ObjectPanel.tsx`, `src/objects.ts`) against that numbering:

| Action | What carries over |
|--------|-------------------|
| Insert | A new marker is a screen-trigger record. `st_obj` stores the `obchars` index in the data byte. Every other `st_*` loads the fixed index in the table above. Robin KINDS ids 1–9 are not written. |
| Delete | Removes that trigger record. `scnevents` ends the list when the first byte is `$81`. |
| Move | Changes the trigger coordinate. `moveObject` (column, pixel y, platform ends) has no matching fields. |
| Inspectors | The slot still shows the selected marker. Flash, archer, cannon, key LINK, secret script, and water fields have no Magician layout. The fields are the `st_*` or `pt_*` id and the `obchars` index the handler loads. |
| Kind checkboxes | A Magician filter is an `obchars` index or a movement class. |
| Spawn-tile buttons | Heart, coin, spider, bat, and rat are Robin blockrous tiles. Magician spider (28), rat (30), and werebat (21) are `obchars` types. |

## PROBS editor (#21)

Parse `ptl`/`pth` per `curlevind`; show AABB + `pt_*` type + data byte; edit carefully (8-byte stride). Runtime handler: `plrevents` in `PROBS.SRC`.

## Shop / inventory / spells (#22)

- `SHOPDAT.SRC`: `shopdatum` 7-byte rows, `shoplist` bytecode (`buy`, `emp`, `exit`, `g1`, `mana10`, `yn`, `msg`, `set`/`clr`/`tst`, `addob`/`delob`, …), `shopx`/`shopy`.
- Spell names: `MISC.SRC` `sptxt`; Beta 1 matches source (`RAZORSTORM`, …) with bit-7 terminator on last char — `tools/spelltab.py`. Release/guide renames (`BOOMERAXE`, …) are **not** Beta 1.
- MVP: **read-only inspectors** first; writes risk breaking shop bytecode and inventory flags.

## Castle overview (#18)

Robin `overview.ts` / `CastleRobinPanels` / exit chips: retire for Magician. Optional later: world map from `pt_dmap` / logical `curlev` graph — only after connectivity research.
