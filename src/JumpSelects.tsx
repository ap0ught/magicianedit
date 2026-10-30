import { useMemo } from "react";
import {
  AMBIENT_FOES,
  kindFromBlockrou,
  spawnTileLabel,
  type AmbientFoe,
} from "./anim.ts";
import {
  describeKeyLink,
  keyLinkShort,
} from "./keys.ts";
import {
  KINDS,
  anchorOf,
  kindOf,
  readRaw,
} from "./objects.ts";
import { type Pickup } from "./pickups.ts";
import { secretLabel } from "./secrets.ts";
import { LEVELS, MAP_HEIGHT, type RomDoc } from "./rom.ts";
import { objectColumn } from "./ObjectPanel.tsx";

/** Hostile objects you can jump to from the toolbar dropdown. */
export const ENEMY_TYPES = new Set([2, 6]); // ARCHER, CANNON

/** Pickups / interactables you can jump to from the toolbar. */
export const COLLECTABLE_TYPES = new Set([5, 7, 8]); // KEY, SECRET, MARION

/** Toolbar dropdown to jump the stage to a hostile object. */
export function ObjectJumpSelect({
  label,
  emptyLabel,
  placeholder,
  types,
  doc,
  rev,
  level,
  selected,
  onJump,
}: {
  label: string;
  emptyLabel: string;
  placeholder: string;
  types: Set<number>;
  doc: RomDoc;
  rev: number;
  level: number;
  selected: number | null;
  onJump: (level: number, index: number, column: number) => void;
}) {
  const entries = useMemo(() => {
    const list: {
      key: string;
      level: number;
      index: number;
      type: number;
      label: string;
    }[] = [];
    for (let lv = 0; lv < LEVELS.length; lv++) {
      doc.objects[lv].forEach((rec, index) => {
        if (!types.has(rec.type)) return;
        const raw = readRaw(doc, rec);
        const a = anchorOf(rec.type, raw);
        const col = a ? Math.floor(a.x / 16) : 0;
        const kind = kindOf(rec.type);
        let detail = `${kind.name} #${index}`;
        if (rec.type === 5) {
          const link = keyLinkShort(describeKeyLink(doc, raw[5] ?? 0));
          const mate = doc.objects[lv].find(
            (o, j) =>
              j !== index &&
              o.type === 7 &&
              readRaw(doc, o)[3] === raw[3] &&
              Math.abs(readRaw(doc, o)[4] - raw[4]) <= 8,
          );
          const withSec = mate
            ? ` · with SECRET #${readRaw(doc, mate)[5] ?? 0}`
            : "";
          detail = `KEY ${link}${withSec} #${index}`;
        } else if (rec.type === 7) {
          const row = Math.floor((raw[4] ?? 0) / 16);
          const onAir =
            row >= 0 &&
            row < MAP_HEIGHT &&
            col < doc.maps[lv].width &&
            doc.blockAt(lv, col, row) === 0;
          detail = `${secretLabel(raw[5] ?? 0)}${onAir ? " · on air" : ""} (obj #${index})`;
        } else if (rec.type === 8) {
          detail = `MARION #${index}`;
        }
        list.push({
          key: `${lv}:${index}`,
          level: lv,
          index,
          type: rec.type,
          label: `${LEVELS[lv].name} · ${detail} · col ${col}`,
        });
      });
    }
    return list;
  }, [doc, types, rev]);

  const groups = useMemo(() => {
    const order = KINDS.filter((k) => types.has(k.id));
    return order
      .map((k) => ({
        id: k.id,
        name: k.name,
        items: entries.filter((e) => e.type === k.id),
      }))
      .filter((g) => g.items.length > 0);
  }, [entries, types]);

  const current =
    selected !== null && types.has(doc.objects[level][selected]?.type ?? -1)
      ? `${level}:${selected}`
      : "";
  const hint = entries.length ? `${placeholder} (${entries.length})` : emptyLabel;
  return (
    <label>
      {label}
      <select
        value={current}
        disabled={entries.length === 0}
        onChange={(e) => {
          const key = e.target.value;
          if (!key) return;
          const hit = entries.find((en) => en.key === key);
          if (!hit) return;
          const col = objectColumn(doc, hit.level, hit.index) ?? 0;
          onJump(hit.level, hit.index, col);
        }}
      >
        <option value="">{hint}</option>
        {groups.map((g) => (
          <optgroup key={g.id} label={`${g.name} (${g.items.length})`}>
            {g.items.map((en) => (
              <option key={en.key} value={en.key}>
                {en.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

/** Display label for a coinco pickup (coin pad vs treasure chest). */
export function pickupPadLabel(doc: RomDoc, p: Pickup): "Coin" | "Heart" | "Treasure" {
  if (!doc.blockrous) return p.kind === "heart" ? "Heart" : "Treasure";
  const tile = doc.blockAt(p.level, p.markColumn, p.row);
  const kind = kindFromBlockrou(doc.blockrous[tile]);
  if (kind === "coin") return "Coin";
  if (kind === "heart" || p.kind === "heart") return "Heart";
  return "Treasure";
}

/** Toolbar dropdown to jump to treasures / hearts. */
export function PickupJumpSelect({
  doc,
  pickups,
  onJump,
}: {
  doc: RomDoc;
  pickups: Pickup[];
  onJump: (p: Pickup) => void;
}) {
  const groups = useMemo(() => {
    const coins: Pickup[] = [];
    const hearts: Pickup[] = [];
    const treasures: Pickup[] = [];
    for (const p of pickups) {
      const label = pickupPadLabel(doc, p);
      if (label === "Coin") coins.push(p);
      else if (label === "Heart") hearts.push(p);
      else treasures.push(p);
    }
    return { coins, hearts, treasures };
  }, [doc, pickups]);

  const total = pickups.length;
  return (
    <label>
      Treasure
      <select
        value=""
        disabled={total === 0}
        title="Coinco coins / hearts (and any non-pad treasures)"
        onChange={(e) => {
          const key = e.target.value;
          e.target.value = "";
          if (!key) return;
          const [kind, index] = key.split(":");
          const hit = pickups.find((p) => p.kind === kind && String(p.index) === index);
          if (hit) onJump(hit);
        }}
      >
        <option value="">
          {total ? `Go to coin/heart… (${total})` : "No coinco table"}
        </option>
        {groups.coins.length > 0 && (
          <optgroup label={`Coins (${groups.coins.length})`}>
            {groups.coins.map((p) => (
              <option key={`treasure:${p.index}`} value={`treasure:${p.index}`}>
                {LEVELS[p.level].name} · Coin #{p.index + 1} · col {p.markColumn} row {p.row}
              </option>
            ))}
          </optgroup>
        )}
        {groups.hearts.length > 0 && (
          <optgroup label={`Hearts (${groups.hearts.length})`}>
            {groups.hearts.map((p) => (
              <option
                key={`${p.kind}:${p.index}`}
                value={`${p.kind}:${p.index}`}
              >
                {LEVELS[p.level].name} · Heart #{p.index + 1} · col {p.markColumn} row {p.row}
              </option>
            ))}
          </optgroup>
        )}
        {groups.treasures.length > 0 && (
          <optgroup label={`Treasure (${groups.treasures.length})`}>
            {groups.treasures.map((p) => (
              <option key={`treasure:${p.index}`} value={`treasure:${p.index}`}>
                {LEVELS[p.level].name} · Treasure #{p.index + 1} · col {p.markColumn} row {p.row}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}

export interface SpawnEnemyHit {
  key: string;
  level: number;
  column: number;
  row: number;
  kind: AmbientFoe;
  tileId: number;
}

/** Collect spider/bat/rat blockrous pads across all levels. */
export function listSpawnEnemyHits(doc: RomDoc): SpawnEnemyHit[] {
  if (!doc.blockrous) return [];
  const out: SpawnEnemyHit[] = [];
  for (let lv = 0; lv < LEVELS.length; lv++) {
    const map = doc.maps[lv];
    for (let x = 0; x < map.width; x++) {
      for (let y = 0; y < MAP_HEIGHT; y++) {
        const tileId = doc.bytes[map.dataFileOff + x * MAP_HEIGHT + y];
        const kind = kindFromBlockrou(doc.blockrous[tileId]);
        if (!kind || !AMBIENT_FOES.has(kind)) continue;
        out.push({
          key: `${lv}:${x}:${y}`,
          level: lv,
          column: x,
          row: y,
          kind: kind as AmbientFoe,
          tileId,
        });
      }
    }
  }
  return out;
}

/** Jump to spider / bat / rat blockrous pads (not object-list enemies). */
export function SpawnEnemyJumpSelect({
  doc,
  rev,
  onJump,
}: {
  doc: RomDoc;
  rev: number;
  onJump: (hit: SpawnEnemyHit) => void;
}) {
  const entries = useMemo(() => listSpawnEnemyHits(doc), [doc, rev]);
  const byKind = useMemo(() => {
    const spider = entries.filter((e) => e.kind === "spider");
    const bat = entries.filter((e) => e.kind === "bat");
    const rat = entries.filter((e) => e.kind === "rat");
    return { spider, bat, rat };
  }, [entries]);
  return (
    <label>
      Spawn enemy
      <select
        value=""
        disabled={entries.length === 0}
        title="Spiders, bats, and rats placed as background tiles"
        onChange={(e) => {
          const key = e.target.value;
          e.target.value = "";
          if (!key) return;
          const hit = entries.find((en) => en.key === key);
          if (hit) onJump(hit);
        }}
      >
        <option value="">
          {entries.length ? `Go to spider/bat/rat… (${entries.length})` : "No spawn enemies"}
        </option>
        {(
          [
            ["Spiders", byKind.spider],
            ["Bats", byKind.bat],
            ["Rats", byKind.rat],
          ] as const
        ).map(([label, list]) =>
          list.length === 0 ? null : (
            <optgroup key={label} label={`${label} (${list.length})`}>
              {list.map((en) => (
                <option key={en.key} value={en.key}>
                  {LEVELS[en.level].name} · {spawnTileLabel(en.kind)} · col {en.column} row{" "}
                  {en.row}
                </option>
              ))}
            </optgroup>
          ),
        )}
      </select>
    </label>
  );
}
