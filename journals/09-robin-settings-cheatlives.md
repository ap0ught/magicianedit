# Robin settings / cheatLives — cart vs dizzy9 vs React

Short answer: **cheat lives are a game feature** (Left+A at start in Codemasters’ cart / PDS source). dizzy9’s RobinEdit **0.4.4** only **exposes** those immediates (and related Robin stats) in a Settings/Robin panel. The React port’s `findRobinStats` / `patchRobin` **re-find the same ROM bytes by opcode signature**, then name them from `pds_src` (`MAINLOOP.ROU`, `GENERAL.ROU`, `CONTROL.ROU`).

## What the React editor does

`src/settings.ts` + `RobinPanel` in `App.tsx` (sidebar mode **Robin**):

| UI label | Field | Locator |
|----------|--------|---------|
| Starting lives | `lives` | `ldx #imm` in the startlives sequence |
| Cheat lives | `cheatLives` | second `ldx #imm` after Left+A test |
| Starting hearts | `startHearts` | `lda #imm` / `sta hearts` right after `stx lives` |
| Max hearts | `maxHearts` | `cmp #imm` in `addtohearts` |
| Hearts after extra life | `afterExtra` | signed `adc #imm` after `inc lives` |
| Jump strength | `jump` | signed `adc #imm` → `sta robingravity` |
| Run table | `runTable[0..47]` | stock `00 05 0a …` curve → `runtablelo` |

`findRobinStats` scans the PRG for fixed machine-code patterns (wildcards for the editable immediates). `patchRobin` / `setRunEntry` / `resetRunTable` write those bytes. Selftest expects stock Asia values: lives **3**, cheat lives **4**, jump **−13**, run table = `i×5` for vel 0–46 then trailing **0**.

There is **no jump table** in the ROM — only a single jump-strength immediate. “Jump tables” in casual talk usually means this constant, not a lookup array. The **run** table is the 48-byte `runtablelo`.

`play.ts` does **not** touch these stats; Play-from-map only patches `startlevel` + Robin spawn.

## Game source (authoritative)

### Cheat lives — `MAINLOOP.ROU` `startlives`

```asm
startlives	ldx #3
	lda pad
	and #lmask+amask
	cmp #lmask+amask ; Left + A?
	bne normal3lives
	ldx #4
normal3lives
	stx lives
	lda #0
	sta hearts
```

- `lmask` = `%00000010`, `amask` = `%10000000` → mask/compare **`$82`** (`GENERAL.ROU`).
- That matches the React signature: `ldx #?` / `lda $07` / `and #$82` / `cmp #$82` / `bne +2` / `ldx #?` / `stx $48`.
- `lives` / `hearts` are ZP (`VARS.PDS` `zvar`); Asia cart uses **`$48` / `$49`**.
- Stock: **3** normal, **4** with Left+A. The editor can change either immediate; the **button combo is stock game logic**, not an editor invention.

Unrelated: `NEWBITS.ROU` / `XTRACONT.ROU` comments about “cheat” / “cheat at beginning” refer to **secret scripts** (map tile effects), not this lives code.

### Hearts — `GENERAL.ROU` `addtohearts`

```asm
addtohearts	lda hearts
	add #1
	sta hearts
	cmp #5          ; max hearts (stock)
	bcc !2
	inc lives
	add #-3         ; hearts kept after extra life (stock)
	sta hearts
```

Stock start hearts = **0** (`lda #0` after `stx lives`). Max = **5**; after-extra delta = **−3**.

### Jump strength — `CONTROL.ROU` (jump takeoff)

```asm
	lda runcount
	lsr
	lsr
	lsr
	eor #255
	add #-13        ; jump strength (stock)
	sta robingravity
```

More negative → higher jump. React matches `lsr×3` / `eor #$FF` / `adc #?` / `sta $0318` (`robingravity`).

### Run table — `CONTROL.ROU` `runtablelo`

```asm
runaccel	= 256/48          ; → 5
runtablelo	do 47
	defb runcounter
runcounter	= runcounter+runaccel
	loop
	defb 0                 ; 48th byte (index 47)
```

- Length **48** (`RUN_TABLE_LEN`); max `runcount` **47** (`cmp #48` → force 47).
- Indexed by `runcount`; slot **0** unused (early-out when idle).
- Whole-pixel step is **1**, or **2** when `runcount == $2F` (47); table bytes are subpixel δ into `robindx`.

## dizzy9 RobinEdit 0.4.4 (editor UX)

Upstream archive: `upstream/RobinEdit.rar` → `lang/eng.ini` `[robin]`:

| eng.ini key | English label |
|-------------|----------------|
| `lives` | STARTING LIVES: |
| `cheatlives` | CHEAT LIVES: |
| `hp` | STARTING HEARTS: |
| `maxhearts` | MAX HEARTS: |
| `jump` | JUMP STRENGHT: *(typo in upstream)* |
| `exlifecost` | HEARTS AFTER EXTRA LIFE: |
| `runtable` / `editruntable` | *(empty strings)* |

So **0.4.4 already had a Robin stats panel** covering the same fields the React port patches. Run-table labels are blank in `eng.ini` (UI may still open an editor via hardcoded MMF strings). v0.3 changelog mentions start **position/map**, not lives/hearts/jump/run — Robin **constants** editing is a later (0.4.x) surface.

dizzy9 shipped **no game source**; the Windows tool found these bytes by reverse engineering the cart. He did **not** invent the Left+A lives behavior — he labeled and patched the existing immediates.

Credits in the React app (`CREDITS` / Author modal) correctly call out dizzy9 for the **Windows editor**, not for inventing cart cheats.

## Provenance summary

| Concern | In the cart / `pds_src`? | dizzy9 0.4.4? | React port? |
|---------|-------------------------|---------------|-------------|
| Left+A → extra start lives | Yes (`startlives`) | Exposes as “Cheat lives” | Same, signature scan + hint text |
| Start/max/after-extra hearts | Yes (`MAINLOOP` / `addtohearts`) | Yes (`eng.ini`) | Yes + PDS symbol comments |
| Jump strength immediate | Yes (`CONTROL`) | Yes | Yes |
| `runtablelo` 48-byte curve | Yes (`CONTROL`) | Panel keys exist (empty labels) | Full 48-row editor + “Reset stock ×5” |
| Opcode signatures / ZP hardcodes | Implicit in assembled ROM | Unknown (closed EXE) | Reimplemented in `findRobinStats` |
| Naming (`runtablelo`, `runcount`, …) | PDS symbols | Not in `eng.ini` | From reading `pds_src` during the port |

**Editor UX vs game feature:** changing “Cheat lives” only edits the `ldx #4` (or `#3`) immediates. Holding Left+A still has to pass the stock pad test for that second value to apply. No Game Genie / external cheat device is involved — it is baked into `MAINLOOP.ROU`.
