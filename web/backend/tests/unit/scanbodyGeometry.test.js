// HPS 면 디코더: 연결 리스트 구현이 예전 배열(splice) 구현과 같은 면·같은 오류를 내는지 비교한다.
// related files:
// - web/backend/utils/scanbodyGeometry.js
import { describe, expect, test } from "@jest/globals";
import {
  decodeFacesWithMode,
  encodeCanonicalStl,
  trianglesFromHps,
} from "../../utils/scanbodyGeometry.js";

/** 예전 구현(배열 + splice). 끝의 면 수·인덱스 검사만 뺐다. */
function referenceDecode(data, mode) {
  const faces = [];
  let edges = [];
  let cur = 0;
  let ptr = 0;
  let pos = 0;
  const push = (a, b, c) => faces.push(a, b, c);
  const u8 = () => {
    if (pos >= data.length) throw new Error("eof");
    return data[pos++];
  };
  const u16 = () => {
    if (pos + 2 > data.length) throw new Error("eof");
    const v = data[pos] | (data[pos + 1] << 8);
    pos += 2;
    return v;
  };
  const u32 = () => {
    if (pos + 4 > data.length) throw new Error("eof");
    const v = (data[pos] | (data[pos + 1] << 8) | (data[pos + 2] << 16) | (data[pos + 3] << 24)) >>> 0;
    pos += 4;
    return v;
  };
  const idx = () => (mode === 32 ? u32() : u16());
  const restart = (a, b, c) => {
    push(a, b, c);
    edges = [
      { s: a, e: b },
      { s: b, e: c },
      { s: c, e: a },
    ];
    cur = 0;
  };
  const extend = (v) => {
    if (edges.length === 0) throw new Error("no edge");
    const ce = edges[cur];
    push(v, ce.e, ce.s);
    edges.splice(cur, 1, { s: ce.s, e: v }, { s: v, e: ce.e });
    cur = (cur + 2) % edges.length;
  };
  const joinAt = (a, b, edge) => {
    const high = Math.max(a, b);
    const low = Math.min(a, b);
    edges.splice(high, 1);
    edges.splice(low, 1);
    edges.splice(low, 0, edge);
    cur = (low + 1) % edges.length;
  };
  while (pos < data.length) {
    const cmd = u8();
    if (cmd >> 4 !== 0) throw new Error("bad command");
    switch (cmd & 0x0f) {
      case 0:
        extend(ptr++);
        break;
      case 1: {
        if (edges.length < 2) throw new Error("prev");
        const prev = (cur - 1 + edges.length) % edges.length;
        const pe = edges[prev];
        const ce = edges[cur];
        push(ce.s, pe.s, ce.e);
        joinAt(cur, prev, { s: pe.s, e: ce.e });
        break;
      }
      case 2: {
        if (edges.length < 2) throw new Error("next");
        const next = (cur + 1) % edges.length;
        const ce = edges[cur];
        const ne = edges[next];
        push(ce.s, ne.e, ce.e);
        joinAt(cur, next, { s: ce.s, e: ne.e });
        break;
      }
      case 3:
        if (edges.length === 0) throw new Error("skip");
        cur = (cur + 1) % edges.length;
        break;
      case 4:
        restart(ptr, ptr + 1, ptr + 2);
        ptr += 3;
        break;
      case 5:
        restart(idx(), idx(), idx());
        break;
      case 6:
        restart(u32(), u32(), u32());
        break;
      case 7:
        extend(idx());
        break;
      case 8:
        extend(u32());
        break;
      case 9: {
        if (edges.length === 0) throw new Error("remove");
        const len = edges.length;
        const prev = (cur - 1 + len) % len;
        const pe = edges[prev];
        const ce = edges[cur];
        if (pe.s === ce.e && len > 2) {
          const high = Math.max(cur, prev);
          const low = Math.min(cur, prev);
          edges.splice(high, 1);
          edges.splice(low, 1);
          if (edges.length > 0) {
            const np = (low - 1 + edges.length) % edges.length;
            const nc = low % edges.length;
            edges[np].e = edges[nc].s;
            cur = nc;
          } else {
            cur = 0;
          }
        } else {
          pe.e = ce.e;
          edges.splice(cur, 1);
          cur = edges.length ? cur % edges.length : 0;
        }
        break;
      }
      case 10:
        ptr += 1;
        break;
      default:
        throw new Error("unknown opcode");
    }
  }
  return faces;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** 대부분 유효한 명령, 가끔 고리를 비우거나 잘못된 바이트를 넣는다. 작은 인덱스라 9번 조건 분기도 탄다. */
function randomStream(rand, mode, { commands, vertexRange, clean = false }) {
  const bytes = [];
  const index = (v) => {
    bytes.push(v & 0xff, (v >> 8) & 0xff);
    if (mode === 32) bytes.push((v >> 16) & 0xff, (v >>> 24) & 0xff);
  };
  const u32 = (v) => bytes.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  const pick = () => Math.floor(rand() * vertexRange);
  if (clean || rand() < 0.95) bytes.push(4);
  for (let i = 0; i < commands; i += 1) {
    if (clean) {
      // 고리가 자라는 쪽으로 기운 유효 명령만: 긴 성공 스트림을 만든다.
      const c = rand();
      if (c < 0.3) bytes.push(0);
      else if (c < 0.4) {
        bytes.push(7);
        index(pick());
      } else if (c < 0.55) bytes.push(1);
      else if (c < 0.7) bytes.push(2);
      else if (c < 0.9) bytes.push(3);
      else if (c < 0.96) bytes.push(9);
      else if (c < 0.98) bytes.push(10);
      else bytes.push(4);
      continue;
    }
    const r = rand();
    if (r < 0.2) bytes.push(0);
    else if (r < 0.3) {
      bytes.push(7);
      index(pick());
    } else if (r < 0.33) {
      bytes.push(8);
      u32(pick());
    } else if (r < 0.45) bytes.push(1);
    else if (r < 0.57) bytes.push(2);
    else if (r < 0.75) bytes.push(3);
    else if (r < 0.9) bytes.push(9);
    else if (r < 0.93) bytes.push(10);
    else if (r < 0.95) bytes.push(4);
    else if (r < 0.97) {
      bytes.push(5);
      index(pick());
      index(pick());
      index(pick());
    } else if (r < 0.985) {
      bytes.push(6);
      u32(pick());
      u32(pick());
      u32(pick());
    } else if (r < 0.9865) bytes.push(Math.floor(rand() * 256));
    // 나머지: 명령 중간에서 잘린 스트림
    else if (i === commands - 1) bytes.push(7);
  }
  return Uint8Array.from(bytes);
}

function compare(data, mode) {
  let expected;
  let expectedError = null;
  try {
    expected = referenceDecode(data, mode);
  } catch (error) {
    expectedError = error.message;
  }
  if (expectedError) {
    // 면 수를 넉넉히 줘서 끝 검사 전에 같은 오류가 나야 한다.
    expect(() => decodeFacesWithMode(data, data.length + 1, Infinity, mode)).toThrow(expectedError);
    return "error";
  }
  const actual = decodeFacesWithMode(data, expected.length / 3, Infinity, mode);
  expect(Array.from(actual)).toEqual(expected);
  return expected.length / 3 >= 100 ? "long" : "ok";
}

describe("decodeFacesWithMode", () => {
  test.each([16, 32])("랜덤 스트림에서 예전 구현과 같다 (mode %i)", (mode) => {
    const rand = rng(mode * 7919);
    const counts = { ok: 0, long: 0, error: 0 };
    for (let i = 0; i < 6000; i += 1) {
      const commands = 1 + Math.floor(rand() * (i % 10 === 0 ? 3000 : 200));
      const vertexRange = i % 3 === 0 ? 6 : 5000;
      const clean = i % 4 === 1;
      counts[compare(randomStream(rand, mode, { commands, vertexRange, clean }), mode)] += 1;
    }
    // 성공·긴 성공·오류가 모두 충분히 나왔는지(비교가 한쪽으로만 쏠리지 않게)
    expect(counts.ok + counts.long).toBeGreaterThan(400);
    expect(counts.long).toBeGreaterThan(30);
    expect(counts.error).toBeGreaterThan(200);
  });

  test("면 수가 다르면 거절한다", () => {
    const data = Uint8Array.from([4, 0, 0]);
    expect(() => decodeFacesWithMode(data, 4, Infinity, 16)).toThrow("face count");
    expect(() => decodeFacesWithMode(data, 2, Infinity, 16)).toThrow("face overflow");
    expect(() => decodeFacesWithMode(data, 3, 5, 16)).not.toThrow();
    expect(() => decodeFacesWithMode(data, 3, 4, 16)).toThrow("index out of range");
  });

  test("20만 면도 선형 시간에 푼다", () => {
    const faces = 200_000;
    const data = new Uint8Array(1 + (faces - 1) * 2);
    data[0] = 4;
    for (let i = 1; i < data.length; i += 2) {
      data[i] = 0;
      data[i + 1] = 3;
    }
    const started = Date.now();
    const out = decodeFacesWithMode(data, faces, faces + 3, 16);
    expect(out.length).toBe(faces * 3);
    expect(Date.now() - started).toBeLessThan(1500);
  });
});

describe("trianglesFromHps", () => {
  function hpsXml(vertices, commands, facetCount) {
    const v = Buffer.alloc(vertices.length * 4);
    vertices.forEach((value, i) => v.writeFloatLE(value, i * 4));
    return Buffer.from(
      `<HPS><Packed_geometry><Schema>CA</Schema><Binary_data><CA version="1.0">` +
        `<Vertices vertex_count="${vertices.length / 3}">${v.toString("base64")}</Vertices>` +
        `<Facets facet_count="${facetCount}">${Buffer.from(commands).toString("base64")}</Facets>` +
        `</CA></Binary_data></Packed_geometry></HPS>`,
      "utf8",
    );
  }

  test("사면체를 풀어 STL로 다시 쓴다", () => {
    // 삼각형 0-1-2에서 시작해 꼭짓점 3으로 세 번 넓히고 닫는다.
    const xml = hpsXml([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], [4, 0, 2, 2], 4);
    const tri = trianglesFromHps(xml);
    expect(tri.length).toBe(4 * 9);
    expect(Array.from(tri.slice(0, 9))).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const stl = encodeCanonicalStl(tri, { maxAbsMm: 2000 });
    expect(stl.readUInt32LE(80)).toBe(4);
  });

  test("암호화·DOCTYPE은 거절한다", () => {
    expect(() => trianglesFromHps(Buffer.from("<!DOCTYPE x><HPS></HPS>"))).toThrow("XML");
    expect(() => trianglesFromHps(Buffer.from("<HPS><Schema>CE</Schema></HPS>"))).toThrow("암호화");
  });
});
