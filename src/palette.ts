/** 64 NES colors, RGB, taken from RobinEdit 0.4.4's master.pal. */
const MASTER_B64 =
  "XFxcABaLIQGYRQCHagFibwEXYAEAQBkAHzIBAEQAAEsBAEMiADhaAAAACgoKCgoKoaGhAEnQQCTtcg3eqQK2tgZSqSAAgT8BW2ABC3oBBIcCAYA/AHWKCgoKCgoKCgoK7+/vPqD/fHf/r17+6VT//k61+2RT24ARuKMBZ8ADN9ElHM90KMm9SEhICgoKCgoK7+/vqdH8wcH/1Lf/67L/963e+Le06cKX29CMvd2KqOScnOS6neDaq6urCgoKCgoK";

export const MASTER_PAL: Uint8Array = Uint8Array.from(atob(MASTER_B64), (c) =>
  c.charCodeAt(0),
);

export function nesColor(index: number): [number, number, number] {
  const i = (index & 63) * 3;
  return [MASTER_PAL[i], MASTER_PAL[i + 1], MASTER_PAL[i + 2]];
}
