// change-log:
// - 2026-09-10: Sync MD5 hex for HPS CE PackageLockList key derive (no SubtleCrypto MD5).
// related files:
// - web/frontend/src/shared/files/hpsDcmPreview.ts

/** Minimal MD5 → lowercase hex. Enough for short ASCII PackageLockList strings. */
export function md5(message: string): string {
  const bytes = unescape(encodeURIComponent(message));
  const msgLen = bytes.length;
  const words: number[] = [];
  for (let i = 0; i < msgLen; i += 1) {
    words[i >> 2] =
      (words[i >> 2] || 0) | (bytes.charCodeAt(i) << ((i % 4) * 8));
  }
  words[msgLen >> 2] =
    (words[msgLen >> 2] || 0) | (0x80 << ((msgLen % 4) * 8));
  const bitLen = msgLen * 8;
  const size = (((msgLen + 8) >> 6) + 1) * 16;
  words[size - 2] = bitLen;
  words[size - 1] = 0;
  for (let i = 0; i < size; i += 1) words[i] = words[i] || 0;

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
    9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
    16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10,
    15, 21,
  ];
  const K = new Array(64);
  for (let i = 0; i < 64; i += 1) {
    K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) | 0;
  }

  const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));

  for (let i = 0; i < size; i += 16) {
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;
    for (let j = 0; j < 64; j += 1) {
      let F: number;
      let g: number;
      if (j < 16) {
        F = (B & C) | (~B & D);
        g = j;
      } else if (j < 32) {
        F = (D & B) | (~D & C);
        g = (5 * j + 1) % 16;
      } else if (j < 48) {
        F = B ^ C ^ D;
        g = (3 * j + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * j) % 16;
      }
      const tmp = D;
      D = C;
      C = B;
      B = (B + rotl((A + F + K[j]! + words[i + g]!) | 0, S[j]!)) | 0;
      A = tmp;
    }
    a0 = (a0 + A) | 0;
    b0 = (b0 + B) | 0;
    c0 = (c0 + C) | 0;
    d0 = (d0 + D) | 0;
  }

  const toHex = (n: number) => {
    let s = "";
    for (let i = 0; i < 4; i += 1) {
      s += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, "0");
    }
    return s;
  };
  return toHex(a0) + toHex(b0) + toHex(c0) + toHex(d0);
}
