// 비압축(store) ZIP. Vite optimizeDeps 캐시가 깨져 jszip 동적 import가
// HTML(SPA)을 받을 때도 크라운 작업 스캔 등 소수 파일 묶음을 받을 수 있게 한다.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u16(n: number): Uint8Array {
  const out = new Uint8Array(2);
  out[0] = n & 0xff;
  out[1] = (n >>> 8) & 0xff;
  return out;
}

function u32(n: number): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = n & 0xff;
  out[1] = (n >>> 8) & 0xff;
  out[2] = (n >>> 16) & 0xff;
  out[3] = (n >>> 24) & 0xff;
  return out;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** 파일 몇 개를 store 방식 ZIP blob으로 묶는다. */
export async function zipStoreBlobs(
  files: readonly { name: string; blob: Blob }[],
): Promise<Blob> {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name.replace(/\\/g, "/"));
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const crc = crc32(data);
    const local = concat([
      // local file header
      u32(0x04034b50),
      u16(20), // version needed
      u16(0), // flags
      u16(0), // store
      u16(0), // time
      u16(0), // date
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0), // extra
      name,
      data,
    ]);
    const central = concat([
      u32(0x02014b50),
      u16(20), // version made by
      u16(20), // version needed
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0), // extra
      u16(0), // comment
      u16(0), // disk
      u16(0), // int attr
      u32(0), // ext attr
      u32(offset),
      name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const centralDir = concat(centrals);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);

  return new Blob([concat([...locals, centralDir, end])], {
    type: "application/zip",
  });
}
