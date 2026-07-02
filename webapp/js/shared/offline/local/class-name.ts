/**
 * Term identity token — a port of the server `StringUtils::toClassName`, so the
 * offline reader produces the exact same `data_hex` values the rendering code
 * keys on (every occurrence of a term shares one token so a status change can
 * restyle them all in a single client-side pass).
 *
 * The token is a truncated SHA-256 of the (lower-cased) term: deterministic,
 * never reversed back to text, and pure `[0-9a-f]` so it is selector-safe with
 * no escaping. It must stay byte-for-byte identical to the PHP implementation
 * (`substr(hash('sha256', $s), 0, 16)`) so server-rendered spans and tokens the
 * client recomputes line up in the hybrid PWA. See issue #237.
 *
 * SHA-256 is implemented synchronously here on purpose: every caller is
 * synchronous, and the Web Crypto digest API is async-only.
 *
 * @license Unlicense <http://unlicense.org/>
 */

const encoder = new TextEncoder();

/** Uppercase hex of a string's UTF-8 bytes (port of `StringUtils::toHex`). */
export function toHex(value: string): string {
  let hex = '';
  for (const byte of encoder.encode(value)) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex.toUpperCase();
}

// SHA-256 round constants (first 32 bits of the fractional parts of the cube
// roots of the first 64 primes).
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

/** Synchronous SHA-256 over raw bytes, returning the lowercase hex digest. */
function sha256Hex(bytes: Uint8Array): string {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ]);

  // Pre-process: append 0x80, pad with zeros to 56 mod 64, then the 64-bit
  // big-endian bit length.
  const bitLen = bytes.length * 8;
  const withOne = bytes.length + 1;
  const padZeros = (56 - (withOne % 64) + 64) % 64;
  const total = withOne + padZeros + 8;
  const m = new Uint8Array(total);
  m.set(bytes);
  m[bytes.length] = 0x80;
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  m[total - 8] = (hi >>> 24) & 0xff;
  m[total - 7] = (hi >>> 16) & 0xff;
  m[total - 6] = (hi >>> 8) & 0xff;
  m[total - 5] = hi & 0xff;
  m[total - 4] = (lo >>> 24) & 0xff;
  m[total - 3] = (lo >>> 16) & 0xff;
  m[total - 2] = (lo >>> 8) & 0xff;
  m[total - 1] = lo & 0xff;

  const w = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] =
        (m[off + i * 4] << 24) |
        (m[off + i * 4 + 1] << 16) |
        (m[off + i * 4 + 2] << 8) |
        m[off + i * 4 + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let a = h[0], b = h[1], c = h[2], d = h[3];
    let e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let i = 0; i < 64; i++) {
      const big1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + big1 + ch + K[i] + w[i]) | 0;
      const big0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (big0 + maj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }

    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }

  let hex = '';
  for (let i = 0; i < 8; i++) {
    hex += (h[i] >>> 0).toString(16).padStart(8, '0');
  }
  return hex;
}

/**
 * Encode a (lower-cased) term to its identity token, matching
 * `StringUtils::toClassName`: the first 16 hex chars of the SHA-256 of the
 * term's UTF-8 bytes. Stable across the server and the offline path so DOM
 * lookups (`[data_hex="…"]`) line up.
 */
export function toClassName(value: string): string {
  return sha256Hex(encoder.encode(value)).slice(0, 16);
}
