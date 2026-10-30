/** Magician iNES shape, pack addressing, and MAP index swizzle. */

export const INES_HEADER = 16;
export const PRG_SLOT = 8192;
export const PRG_BYTES = 128 * 1024;
export const CHR_BYTES = 128 * 1024;
export const ROM_BYTES = INES_HEADER + PRG_BYTES + CHR_BYTES;
export const PRG_SLOTS = 16;
export const LEVEL_COUNT = 66;
export const DESCRIPTOR_BYTES = 16;
export const CHR_PAGE = 4096;
export const PAL_BYTES = 12;
export const A000 = 0xa000;

/** Beta 1 body SHA1 (header stripped) and the `ld10` file offset in that cart. */
export const BETA1_SHA1 = "af51e12dbcd6acbdc914f0c63ed67d79165ce304";
export const BETA1_LD10 = 0x1cf5d;

/** Town (`ld10`) descriptor. Scan for this when the body is not Beta 1. */
export const TOWN_SIGNATURE = new Uint8Array([
  0x08, 0x0b, 0x00, 0x00, 0x00, 0x00, 0xec, 0x00, 0x0b, 0x00, 0xa0, 0x7c, 0xa2, 0x18, 0xb4, 0x00,
]);

export const TIT_DAT_BYTES = 314;
export const PW_DAT_BYTES = 292;
export const PAN_DAT_BYTES = 96;

/**
 * MAP index swizzle used by `initlev` (`blbase + (byte & $FC) + ((byte & 3) << 8)`).
 * `index = ((byte & $FC) >> 2) | ((byte & 3) << 6)`.
 */
export function decodeMapByte(byte: number): number {
  return ((byte & 0xfc) >> 2) | ((byte & 3) << 6);
}

/** Inverse of `decodeMapByte`. `byte = ((index & $3F) << 2) | (index >> 6)`. */
export function encodeMapByte(index: number): number {
  const value = index & 0xff;
  return ((value & 0x3f) << 2) | (value >> 6);
}

/** File offset of a CPU address in the `$A000` window of PRG slot `bank`. */
export function prgWindowOff(bank: number, cpu: number): number {
  if ((bank | 0) !== bank || bank < 0 || bank >= PRG_SLOTS) {
    throw new Error(`PRG bank $${bank.toString(16)} is outside slots 0..15`);
  }
  if (cpu < A000 || cpu > 0xbfff) {
    throw new Error(`CPU address $${cpu.toString(16)} is outside the $A000 window`);
  }
  return INES_HEADER + bank * PRG_SLOT + (cpu - A000);
}

/**
 * File offset of a CPU address in a fixed MMC3 window.
 * `$C000` is slot 14 and `$E000` is slot 15.
 */
export function fixedWindowOff(cpu: number): number | null {
  if (cpu >= 0xe000 && cpu <= 0xffff) return INES_HEADER + 15 * PRG_SLOT + (cpu - 0xe000);
  if (cpu >= 0xc000 && cpu <= 0xdfff) return INES_HEADER + 14 * PRG_SLOT + (cpu - 0xc000);
  return null;
}

/** File offset of a 1 KiB CHR bank. Level pages are four of these (`sNN` in the descriptor). */
export function chrPageOff(bank1k: number): number {
  return INES_HEADER + PRG_BYTES + bank1k * 1024;
}

export function rangesOverlap(off: number, length: number, other: number, otherLength: number): boolean {
  if (length <= 0 || otherLength <= 0) return false;
  return off < other + otherLength && other < off + length;
}

export interface InesInfo {
  sha1: string;
  beta1: boolean;
  /** Set when the header is a Magician cart but the body is not the Beta 1 pin. */
  warning: string | null;
}

/**
 * Accept mapper 4, 128 KiB PRG, 128 KiB CHR, 262160 bytes.
 * Mapper 71 is rejected with a RobinEdit message. SHA1 is a soft check.
 */
export function inspectInes(bytes: Uint8Array): InesInfo {
  if (bytes.length < INES_HEADER || bytes[0] !== 0x4e || bytes[1] !== 0x45 || bytes[2] !== 0x53 || bytes[3] !== 0x1a) {
    throw new Error("MagicianEdit could not open this file. It is not an iNES ROM (missing NES header).");
  }
  const mapper = ((bytes[7] & 0xf0) | (bytes[6] >> 4)) & 0xff;
  if (mapper === 71) {
    throw new Error("MagicianEdit does not edit mapper 71 carts. Open those in RobinEdit (Super Robin Hood).");
  }
  const prgKiB = bytes[4] * 16;
  const chrKiB = bytes[5] * 8;
  if (mapper !== 4 || bytes[4] !== 8 || bytes[5] !== 16 || bytes.length !== ROM_BYTES) {
    throw new Error(
      `MagicianEdit expects a Magician cart (mapper 4, 128 KiB PRG, 128 KiB CHR, ${ROM_BYTES} bytes). ` +
        `This file is mapper ${mapper}, ${prgKiB} KiB PRG, ${chrKiB} KiB CHR, ${bytes.length} bytes.`,
    );
  }
  const sha1 = sha1Hex(bytes.subarray(INES_HEADER));
  const beta1 = sha1 === BETA1_SHA1;
  return {
    sha1,
    beta1,
    warning: beta1
      ? null
      : `This cart is not the Beta 1 pin (body SHA1 ${BETA1_SHA1}). ` +
        "Level banks and pointers come from this file's descriptors. " +
        "The journal 11 offset table is the Beta 1 map only.",
  };
}

/** SHA1 of `data` as a lowercase hex digest. */
export function sha1Hex(data: Uint8Array): string {
  const n = data.length;
  const paddedLen = (n + 9 + 63) & ~63;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[n] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor(n / 0x20000000), false);
  view.setUint32(paddedLen - 4, (n * 8) >>> 0, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);

  for (let i = 0; i < paddedLen; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(i + t * 4, false);
    for (let t = 16; t < 80; t++) {
      const x = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16];
      w[t] = ((x << 1) | (x >>> 31)) >>> 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let t = 0; t < 80; t++) {
      let f: number;
      let k: number;
      if (t < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (t < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (t < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = ((((a << 5) | (a >>> 27)) + f + e + k + w[t]) >>> 0) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((word) => word.toString(16).padStart(8, "0")).join("");
}
