import { LEVELS, MAP_HEIGHT, type Edit, type RomDoc, writeEdits } from "./rom.ts";

export interface ChangeStep {
  /** Stable id for React keys / selection. */
  id: string;
  /** 1-based chronological index (oldest = 1). */
  index: number;
  label: string;
  detail: string;
  edits: Edit[];
}

/** Human label for one undo-stack step. */
export function describeEditStep(doc: RomDoc, edits: Edit[]): { label: string; detail: string } {
  if (!edits.length) return { label: "Empty", detail: "" };

  const mapHits = new Map<number, number>();
  let infoPal = 0;
  let infoChr = 0;
  let infoOther = 0;
  let objectBytes = 0;
  let other = 0;

  for (const e of edits) {
    let classified = false;
    for (let lv = 0; lv < doc.maps.length; lv++) {
      const map = doc.maps[lv];
      const mapEnd = map.dataFileOff + map.width * MAP_HEIGHT;
      if (e.off >= map.dataFileOff && e.off < mapEnd) {
        mapHits.set(lv, (mapHits.get(lv) ?? 0) + 1);
        classified = true;
        break;
      }
      if (e.off >= map.infoFileOff && e.off < map.infoFileOff + 6) {
        const field = e.off - map.infoFileOff;
        if (field === 4) infoPal++;
        else if (field === 5) infoChr++;
        else infoOther++;
        classified = true;
        break;
      }
    }
    if (classified) continue;
    if (e.off >= doc.objectRegionStart && e.off < doc.objectRegionEnd) {
      objectBytes++;
      continue;
    }
    other++;
  }

  const parts: string[] = [];
  const details: string[] = [];

  if (mapHits.size) {
    const tiles = [...mapHits.values()].reduce((a, b) => a + b, 0);
    const maps = [...mapHits.keys()]
      .sort((a, b) => a - b)
      .map((lv) => `${LEVELS[lv].name}×${mapHits.get(lv)}`);
    parts.push(tiles === 1 ? "Paint 1 tile" : `Paint ${tiles} tiles`);
    details.push(maps.join(", "));
  }
  if (infoPal) {
    parts.push(infoPal === 1 ? "Palette" : `Palette ×${infoPal}`);
  }
  if (infoChr) {
    parts.push(infoChr === 1 ? "CHR set" : `CHR set ×${infoChr}`);
  }
  if (infoOther) {
    parts.push(`Map info ×${infoOther}`);
  }
  if (objectBytes) {
    parts.push(objectBytes === 1 ? "Object byte" : `Object · ${objectBytes} bytes`);
  }
  if (other) {
    parts.push(other === 1 ? "ROM byte" : `ROM · ${other} bytes`);
  }

  return {
    label: parts.join(" · ") || `${edits.length} byte(s)`,
    detail: details.join(" · "),
  };
}

/** Turn the undo stack into a chronological timeline (oldest first). */
export function stepsFromUndo(doc: RomDoc, undo: Edit[][]): ChangeStep[] {
  return undo.map((edits, i) => {
    const { label, detail } = describeEditStep(doc, edits);
    return {
      id: `step-${i}-${edits[0]?.off ?? 0}-${edits.length}`,
      index: i + 1,
      label,
      detail,
      edits,
    };
  });
}

/**
 * When history was cleared (e.g. insert/delete object) but the ROM still
 * differs from the last-saved baseline, summarize as one synthetic step.
 */
export function stepsFromBaselineDiff(doc: RomDoc, baseline: Uint8Array): ChangeStep[] {
  if (baseline.length !== doc.bytes.length) {
    return [
      {
        id: "baseline-size",
        index: 1,
        label: "ROM size changed",
        detail: `${baseline.length} → ${doc.bytes.length}`,
        edits: [],
      },
    ];
  }
  const edits: Edit[] = [];
  for (let off = 0; off < doc.bytes.length; off++) {
    const prev = baseline[off];
    const next = doc.bytes[off];
    if (prev !== next) edits.push({ off, prev, next });
  }
  if (!edits.length) return [];
  const { label, detail } = describeEditStep(doc, edits);
  return [
    {
      id: "baseline-diff",
      index: 1,
      label: `${label} (since last save)`,
      detail: detail || `${edits.length} bytes differ`,
      edits,
    },
  ];
}

/** Replay kept steps onto a copy of baseline → working bytes. */
export function buildBytesFromSteps(baseline: Uint8Array, steps: ChangeStep[]): Uint8Array {
  const out = new Uint8Array(baseline);
  for (const step of steps) {
    if (step.edits.length) writeEdits(out, step.edits);
  }
  return out;
}

/** Count of unique ROM offsets touched across timeline steps. */
export function totalEditBytes(steps: ChangeStep[]): number {
  const offs = new Set<number>();
  for (const s of steps) for (const e of s.edits) offs.add(e.off);
  return offs.size;
}
