/**
 * Codemasters PP1 (Markov) tile unpacker.
 *
 * Matches the scheme documented on NESdev and implemented by
 * romhack/codemastersMarkov, which is what Super Robin Hood's packed CHR
 * actually uses. The earlier port from UNPACK.ROU had inverted mode-3
 * pixel codes and drifted from the bitstream, so sky/hall CHR looked like noise.
 */

class Bits {
  buf = 0x80;
  data: Uint8Array;
  i: number;
  constructor(data: Uint8Array, i: number) {
    this.data = data;
    this.i = i;
  }

  /** Next bit, MSB-first within each byte (same refill as the 6502 PP1_GETC). */
  getc(): number {
    const carry = this.buf & 0x80 ? 1 : 0;
    this.buf = (this.buf << 1) & 0xff;
    if (this.buf === 0) {
      const b = this.data[this.i++];
      const next = b & 0x80 ? 1 : 0;
      this.buf = ((b << 1) & 0xff) | carry;
      return next;
    }
    return carry;
  }

  /** Read `n` bits MSB-first into an integer. */
  getN(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | this.getc();
    return v;
  }

  /**
   * Truncated Golomb-ish code used for LUT pivot and pixel transitions.
   * count=0 → 0; otherwise read until a 1 or count bits, returning the index.
   */
  golomb(count: number): number {
    if (count === 0) return 0;
    let n = count;
    let ones = 0;
    for (;;) {
      const bit = this.getc();
      if (n === 1) return ones + bit;
      if (bit === 1) return ones;
      ones += 1;
      n -= 1;
    }
  }
}

interface Lut {
  mode: number;
  nexts: number[];
}

/** Read the 4-color Markov LUT block from the bitstream. */
function parseLuts(bits: Bits): Lut[] {
  const luts: Lut[] = [{ mode: 0, nexts: [] }, { mode: 0, nexts: [] }, { mode: 0, nexts: [] }, { mode: 0, nexts: [] }];
  // Colors 3..0 (reverse order), matching the cart unpacker / Markov tool.
  for (let color = 3; color >= 0; color--) {
    const mode = bits.getN(2);
    if (mode === 0) {
      luts[color] = { mode, nexts: [] };
      continue;
    }
    const remain3 = [0, 1, 2, 3].filter((c) => c !== color);
    const a = remain3[bits.golomb(2)];
    const remain2 = remain3.filter((c) => c !== a);
    if (mode === 1) luts[color] = { mode, nexts: [a] };
    else if (mode === 2) luts[color] = { mode, nexts: [a, remain2[bits.golomb(1)]] };
    else luts[color] = { mode, nexts: [a, ...remain2] };
  }
  return luts;
}

/** Decode one pixel color from the previous color via the LUT. */
function parsePixel(bits: Bits, luts: Lut[], prev: number): number {
  const { mode, nexts } = luts[prev];
  const code = bits.golomb(mode);
  if (mode === 0) return prev;
  if (mode === 1) return [nexts[0], prev][code];
  return [prev, ...nexts][code];
}

/** Decode one 8-pixel tile row (or copy the previous row). */
function parseRow(bits: Bits, luts: Lut[], prevRow: number[]): number[] {
  if (bits.getc()) return prevRow.slice();
  const row = [bits.getN(2)];
  for (let i = 0; i < 7; i++) row.push(parsePixel(bits, luts, row[i]));
  return row;
}

/** Pack 8 color indices into NES bitplane bytes. */
function rowToPlanes(row: number[]): { lo: number; hi: number } {
  let lo = 0;
  let hi = 0;
  for (let c = 0; c < 8; c++) {
    const color = row[c] & 3;
    lo = (lo << 1) | (color & 1);
    hi = (hi << 1) | ((color >> 1) & 1);
  }
  return { lo, hi };
}

/** Unpack `count` NES 2bpp tiles. `start` points at the count byte. */
export function unpackTiles(data: Uint8Array, start: number): Uint8Array[] {
  const countByte = data[start];
  const count = countByte === 0 ? 256 : countByte;
  const bits = new Bits(data, start + 1);
  let luts: Lut[] = [
    { mode: 0, nexts: [] },
    { mode: 0, nexts: [] },
    { mode: 0, nexts: [] },
    { mode: 0, nexts: [] },
  ];
  let prevRow = [0, 0, 0, 0, 0, 0, 0, 0];
  const tiles: Uint8Array[] = [];

  for (let n = 0; n < count; n++) {
    // 1 = keep LUTs, 0 = read new LUT block (same polarity as UNPACK.ROU / Markov).
    if (!bits.getc()) luts = parseLuts(bits);

    const plane0: number[] = [];
    const plane1: number[] = [];
    for (let line = 0; line < 8; line++) {
      prevRow = parseRow(bits, luts, prevRow);
      const { lo, hi } = rowToPlanes(prevRow);
      plane0.push(lo);
      plane1.push(hi);
    }
    tiles.push(Uint8Array.from([...plane0, ...plane1]));
  }
  return tiles;
}
