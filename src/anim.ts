/** On-screen block kinds from ONSCREEN.ROU `blockrous` (type codes, not routine indices). */
export type TileAnim =
  | "flash"
  | "torch"
  | "spit"
  | "drip"
  | "drill"
  | "spider"
  | "barrel"
  | "eyes"
  | "bat"
  | "rat"
  | "tramp"
  | "heart"
  | "coin";

/** Map blockrous type byte → animation family used by View → Animate. */
export function kindFromBlockrou(code: number): TileAnim | null {
  const t = code & 0x7e; // ignore 128/64 flags for matching the equ values' low bits
  // Raw codes as stored in the table (with flags):
  switch (code) {
    case 2:
      return "torch"; // bflam
    case 4:
      return "spit";
    case 6:
      return "eyes";
    case 8:
      return "drip";
    case 0x0a:
      return "tramp";
    case 0x0c + 128:
    case 0x8c:
      return "drill";
    case 0x0e + 128:
    case 0x8e:
      return "drill";
    case 0x10 + 128 + 64:
    case 0xd0:
      return "bat";
    case 0x12 + 128:
    case 0x92:
      return "rat";
    case 0x14 + 128:
    case 0x94:
      return "spider";
    case 0x16 + 128:
    case 0x96:
      return "heart";
    case 0x18 + 64:
    case 0x58:
      return "barrel";
    case 0x1a + 128:
    case 0x9a:
      return "tramp";
    case 0x1c + 128:
    case 0x9c:
      return "coin";
    default:
      break;
  }
  // Fallback on low nibble families if flags differ by cart version
  if (t === 2) return "torch";
  if (t === 4) return "spit";
  if (t === 8) return "drip";
  return null;
}

export const ANIM_LABELS: { id: TileAnim | "archers" | "cannons"; label: string }[] = [
  { id: "flash", label: "Flash blocks" },
  { id: "archers", label: "Archers" },
  { id: "cannons", label: "Cannons" },
  { id: "torch", label: "Torches" },
  { id: "spit", label: "Spitters" },
  { id: "drip", label: "Fire / drips" },
  { id: "drill", label: "Drills" },
  { id: "spider", label: "Spiders" },
  { id: "bat", label: "Bats" },
  { id: "rat", label: "Rats" },
  { id: "heart", label: "Hearts" },
  { id: "coin", label: "Coins" },
  { id: "barrel", label: "Barrel" },
];

/**
 * Special map tiles from blockrous — often blank CHR (drawn at runtime).
 * Includes ambient foes and heart/coin spawn pads.
 */
export type SpawnTileKind = "spider" | "bat" | "rat" | "heart" | "coin";

export const SPAWN_TILES: ReadonlySet<TileAnim> = new Set([
  "spider",
  "bat",
  "rat",
  "heart",
  "coin",
]);

/** @deprecated use SPAWN_TILES — foes only */
export const AMBIENT_FOES: ReadonlySet<TileAnim> = new Set(["spider", "bat", "rat"]);

export type AmbientFoe = "spider" | "bat" | "rat";

const SPAWN_ORDER: SpawnTileKind[] = ["spider", "bat", "rat", "heart", "coin"];

/** Metatile IDs for blockrous spawn pads (first id per kind). */
export function spawnTiles(
  blockrous: Uint8Array | null | undefined,
): Partial<Record<SpawnTileKind, number>> {
  if (!blockrous) return {};
  const out: Partial<Record<SpawnTileKind, number>> = {};
  for (let id = 0; id < blockrous.length; id++) {
    const kind = kindFromBlockrou(blockrous[id]);
    if (kind && SPAWN_TILES.has(kind) && out[kind as SpawnTileKind] === undefined) {
      out[kind as SpawnTileKind] = id;
    }
  }
  return out;
}

/** Spawn-pad kind for a metatile id, or null if it is not a special pad. */
export function spawnTileOf(
  blockrous: Uint8Array | null | undefined,
  tileId: number,
): SpawnTileKind | null {
  if (!blockrous || tileId < 0 || tileId >= blockrous.length) return null;
  const kind = kindFromBlockrou(blockrous[tileId]);
  return kind && SPAWN_TILES.has(kind) ? (kind as SpawnTileKind) : null;
}

/** Full UI label for a spawn-pad kind (e.g. "Spider"). */
export function spawnTileLabel(kind: SpawnTileKind): string {
  switch (kind) {
    case "spider":
      return "Spider";
    case "bat":
      return "Bat";
    case "rat":
      return "Rat";
    case "heart":
      return "Heart";
    case "coin":
      return "Coin";
  }
}

/** Compact badge text for spawn pads on the canvas / lists. */
export function spawnTileShort(kind: SpawnTileKind): string {
  switch (kind) {
    case "spider":
      return "SP";
    case "bat":
      return "BAT";
    case "rat":
      return "RAT";
    case "heart":
      return "♥";
    case "coin":
      return "$";
  }
}

/** Accent color used when drawing / highlighting a spawn pad. */
export function spawnTileAccent(kind: SpawnTileKind): string {
  switch (kind) {
    case "spider":
      return "#c090ff";
    case "bat":
      return "#a8b0ff";
    case "rat":
      return "#d4a574";
    case "heart":
      return "#ff6a8a";
    case "coin":
      return "#ffd23c";
  }
}

/** Prefer this order in Ambient foes / special-tile pick rows. */
export function spawnTileEntries(
  blockrous: Uint8Array | null | undefined,
): { kind: SpawnTileKind; id: number }[] {
  const tiles = spawnTiles(blockrous);
  return SPAWN_ORDER.filter((k) => tiles[k] !== undefined).map((kind) => ({
    kind,
    id: tiles[kind]!,
  }));
}

/** Back-compat aliases used by earlier ambient-foe UI. */
export const ambientFoeTiles = spawnTiles as (
  blockrous: Uint8Array | null | undefined,
) => Partial<Record<AmbientFoe, number>>;
export const ambientFoeOfTile = spawnTileOf as (
  blockrous: Uint8Array | null | undefined,
  tileId: number,
) => AmbientFoe | null;
export const ambientFoeLabel = spawnTileLabel as (kind: AmbientFoe) => string;

/** 0→1→0 triangle wave for View → Animate pulse overlays. */
export function pulsePhase(tick: number, period = 16): number {
  const p = tick % period;
  return p < period / 2 ? p / (period / 2) : 2 - p / (period / 2);
}
