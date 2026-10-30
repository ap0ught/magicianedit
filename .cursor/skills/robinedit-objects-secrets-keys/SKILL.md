---
name: robinedit-objects-secrets-keys
description: >-
  Edits RobinEdit object-list types, secrets, key links, and coinco treasures.
  Use when inserting or inspecting KEY/SECRET/MARION/archer objects, linking
  keys to doors, stacking keys on secrets, or editing coinco hearts/treasures.
---

# RobinEdit objects, secrets, keys

## Known object types (do not invent)

| Type | Name |
|------|------|
| 1 | FLASH BLOCK |
| 2 | ARCHER |
| 3 | PLATFORM (H) |
| 4 | PLATFORM (V) |
| 5 | KEY |
| 6 | CANNON |
| 7 | SECRET |
| 8 | MARION |
| 9 | WATER |

Insert only when the level has free object bytes. Ambient spider/bat/rat are **not** these types — see `robinedit-ambient-tiles`.

## Secrets (type 7)

- `raw[5]` indexes `NEWBITS.ROU` **`secrettable`** (`secret0`…`secret23`).
- Always surface the **script description** (`secretDesc` / `SECRET_DESCS` in `src/secrets.ts`), not only the index.
- Secrets often sit on **air**; that is valid.

## Keys (type 5)

- `raw[5]` is LINK: `0` = **unlinked**; `≥ 237` opens a `doordata` door; other values toggle platform/lift extras by id (`src/keys.ts`).
- Keys **can be unlinked** and **stacked on the same cell as secrets** (especially on air). Do not “fix” that by forcing a door link or moving them apart unless asked.

## coinco treasures / hearts vs blockrous pads

- Authoritative table: `NEWBITS.ROU` **`coinco`** (48 treasures + 48 hearts: column + map index).
- Editor markers use **`markColumn`**, which may **snap ±1** to a nearby heart/coin **blockrous** pad (`src/pickups.ts`).
- Editing pickups = coinco + ensuring the visible pad tile matches; do not Insert a typed “treasure” object.

## Code anchors

- `src/objects.ts` — `KINDS`, anchors, move/hit
- `src/secrets.ts` — script descriptions
- `src/keys.ts` — doors / link decode
- `src/pickups.ts` — coinco + markColumn snap
