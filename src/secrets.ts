/**
 * Secret effect scripts from NEWBITS.ROU `secrettable` (secret0…secret23).
 * Object type 7 stores the script index in raw[5].
 */
export const SECRET_DESCS: readonly string[] = [
  "poke ladder",
  "poke hole in shaft",
  "slide under ledge",
  "under ladder",
  "bash thru castle turret",
  "ladder down",
  "make ladder",
  "trap door",
  "ladder extend",
  "opens chain",
  "ladder in wall",
  "knock out wall by ladder",
  "moving stool",
  "get impossible heart",
  "first cheat",
  "knock out ball and chain",
  "ladder grow down",
  "remove wall / gargoyle",
  "knock out slide",
  "grow down ladder",
  "block in front of guard",
  "drop floor away",
  "cheat at beginning",
  "barrels appear",
];

/** Human description of a secrettable script index. */
export function secretDesc(secretId: number): string {
  if (secretId >= 0 && secretId < SECRET_DESCS.length) return SECRET_DESCS[secretId];
  return `unknown script #${secretId}`;
}

/** Short label for lists / hover: `SECRET #10 · ladder in wall`. */
export function secretLabel(secretId: number): string {
  return `SECRET #${secretId} · ${secretDesc(secretId)}`;
}

/** Truncated secret description for tight UI slots. */
export function secretShort(secretId: number): string {
  const d = secretDesc(secretId);
  return d.length > 28 ? `${d.slice(0, 26)}…` : d;
}
