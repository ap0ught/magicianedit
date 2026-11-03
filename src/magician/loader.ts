/** Magician level loading assembly. */
import { levelName } from "./names.ts";
import { refuseScene, SceneLoadError } from "./scene.ts";
import { findLd10, readDescriptors, DescriptorError } from "./descriptors.ts";
import { sizeRegions } from "./packs.ts";
import { BETA1_LD10, CHR_PAGE, DESCRIPTOR_BYTES, INES_HEADER, LEVEL_COUNT, PAL_BYTES, PRG_BYTES, TOWN_SIGNATURE, chrPageOff, decodeMapByte } from "./format.ts";
import type { BytePack, MagicianLevel, MapPack, TitleScene } from "./document.ts";

export class LoadError extends Error {
  code: "title" | "table" | "palette";
  constructor(code: "title" | "table" | "palette", message: string) { super(message); this.name = "LoadError"; this.code = code; }
}
export interface Built { levels: MagicianLevel[]; maps: MapPack[]; packs: BytePack[]; }

export function loadLevels(
  rom: Uint8Array,
  beta1: boolean,
  scene: TitleScene | null,
  chrpals: number,
): { ld: number; built: Built } {
  const candidates: number[] = [];
  // Journal 11 measured this file offset on the Beta 1 pin only.
  if (beta1 && matchesAt(rom, BETA1_LD10, TOWN_SIGNATURE)) candidates.push(BETA1_LD10);
  for (const off of findLd10(rom)) {
    if (!candidates.includes(off)) candidates.push(off);
  }
  const prgEnd = INES_HEADER + PRG_BYTES;
  const tableBytes = LEVEL_COUNT * DESCRIPTOR_BYTES;
  for (let off = INES_HEADER; off + tableBytes <= prgEnd; off++) {
    if (!matchesAt(rom, off, TOWN_SIGNATURE)) continue;
    if (!candidates.includes(off)) candidates.push(off);
  }
  let titleError: LoadError | null = null;
  for (const off of candidates) {
    try {
      return { ld: off, built: buildAt(rom, off, scene, chrpals) };
    } catch (err) {
      if (err instanceof LoadError && err.code === "title") titleError = err;
      else if (err instanceof LoadError && err.code === "table") continue;
      else if (err instanceof DescriptorError) continue;
      else if (err instanceof SceneLoadError) titleError = new LoadError("title", err.message);
      else throw err;
    }
  }
  if (titleError) throw titleError;
  if (candidates.length) {
    throw new LoadError(
      "table",
      `MagicianEdit found a town descriptor but the following records are not ${LEVEL_COUNT} Magician levels.`,
    );
  }
  throw new LoadError(
    "table",
    "MagicianEdit did not find a Magician level table. The town descriptor is not in this cart.",
  );
}

function buildAt(rom: Uint8Array, ld: number, scene: TitleScene | null, chrpals: number): Built {
  const raw = readDescriptors(rom, ld);
  const regions = sizeRegions(rom, raw);
  const maps = new Map<number, MapPack>();
  const bytePacks = new Map<string, BytePack>();

  const takeBytes = (kind: BytePack["kind"], off: number, size: number): BytePack => {
    const key = `${kind}:${off}`;
    const found = bytePacks.get(key);
    if (found) return found;
    refuseScene(scene, off, size);
    const pack: BytePack = { kind, fileOff: off, bytes: rom.slice(off, off + size) };
    bytePacks.set(key, pack);
    return pack;
  };

  for (const region of regions) {
    if (region.kind === "map") {
      refuseScene(scene, region.fileOff, region.size);
      if (!maps.has(region.fileOff)) {
        const blocks = new Uint8Array(region.width * region.height);
        for (let i = 0; i < blocks.length; i++) blocks[i] = decodeMapByte(rom[region.fileOff + 4 + i]);
        maps.set(region.fileOff, {
          fileOff: region.fileOff,
          width: region.width,
          height: region.height,
          blocks,
        });
      }
    } else {
      takeBytes(region.kind, region.fileOff, region.size);
    }
  }

  const levels: MagicianLevel[] = raw.map((level) => {
    const map = maps.get(level.mapOff);
    const blk = bytePacks.get(`blk:${level.blkOff}`);
    const col = bytePacks.get(`col:${level.colOff}`);
    if (!map || !blk || !col) badTable("level pack was not sized");
    const chrOff = chrPageOff(level.chrBank);
    if (chrOff + CHR_PAGE > rom.length) badTable(`CHR bank ${level.chrBank} does not fit in CHR ROM`);
    const palOff = chrpals + level.palIndex * PAL_BYTES;
    if (palOff < INES_HEADER || palOff + PAL_BYTES > INES_HEADER + PRG_BYTES) {
      badTable(`palette index ${level.palIndex} is outside PRG`);
    }
    return {
      index: level.index,
      name: levelName(level.index),
      descriptorOff: ld + level.index * DESCRIPTOR_BYTES,
      mapBank: level.mapBank,
      colBank: level.colBank,
      chrBank: level.chrBank,
      xorg: level.xorg,
      yorg: level.yorg,
      xlim: level.xlim,
      ylim: level.ylim,
      palIndex: level.palIndex,
      map,
      blk,
      col,
      chr: takeBytes("chr", chrOff, CHR_PAGE),
      pal: takeBytes("pal", palOff, PAL_BYTES),
    };
  });

  return {
    levels,
    maps: [...maps.values()],
    packs: [...bytePacks.values()],
  };
}


function matchesAt(rom: Uint8Array, off: number, sig: Uint8Array): boolean {
  if (off < 0 || off + sig.length > rom.length) return false;
  for (let i = 0; i < sig.length; i++) if (rom[off + i] !== sig[i]) return false;
  return true;
}

function badTable(message: string): never { throw new LoadError("table", `MagicianEdit could not read the level table: ${message}.`); }
