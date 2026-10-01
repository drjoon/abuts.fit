// 스캔바디 형상 → 검증한 좌표로 새로 만든 이진 STL(mm).
// 원본(.dcm XML·.stl) 바이트는 저장하지 않는다. 좌표와 면만 꺼내 범위를 확인하고 다시 쓴다.
// 모델 좌표: 플랫폼 원점, +Y 임플란트 축, +X 기준 방향(3Shape UseImplantCoords와 같다).
// related files:
// - web/backend/services/scanbodyLibraryImport.service.js
// - web/frontend/src/shared/files/hpsDcmPreview.ts (parseFacesWithMode — 같은 면 인코딩)
// - web/frontend/src/shared/practice/scanbodyLibraryApi.ts (loadScanbodyGeometry)
import crypto from "crypto";

export class ScanbodyInputError extends Error {}

const MAX_TRIANGLES = 1_500_000;
const MAX_VERTICES = 1_500_000;
const MAX_ABS_COORD_MM = 200;
const MAX_XML_BYTES = 64 * 1024 * 1024;
const BASE64 = /^[A-Za-z0-9+/=\s]*$/;

function fail(message) {
  throw new ScanbodyInputError(message);
}

function decodeBase64(text, label) {
  if (!BASE64.test(text)) fail(`${label} 데이터가 올바르지 않습니다.`);
  return Buffer.from(text.replace(/\s+/g, ""), "base64");
}

function readElement(xml, tag) {
  const m = new RegExp(`<${tag}\\b([^>]*)>([^<]*)</${tag}>`).exec(xml);
  if (!m) return null;
  const attrs = {};
  for (const a of m[1].matchAll(/([A-Za-z_][\w.-]*)="([^"]*)"/g)) attrs[a[1]] = a[2];
  return { attrs, text: m[2] };
}

function positiveInt(value, max, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0 || n > max) fail(`${label} 개수가 올바르지 않습니다.`);
  return n;
}

/** HPS 면 스트림(3Shape Packed_geometry CA/CC). 16비트 → 32비트 순으로 시도한다. */
function decodeFaces(data, faceCount, vertexCount) {
  let lastError = null;
  for (const mode of [16, 32]) {
    try {
      return decodeFacesWithMode(data, faceCount, vertexCount, mode);
    } catch (error) {
      lastError = error;
    }
  }
  fail(`면 데이터를 읽지 못했습니다. (${lastError?.message || "unknown"})`);
}

/**
 * 경계 모서리 고리를 배열 대신 이중 연결 리스트로 둔다(splice면 면 수의 제곱).
 * 고리 순서·커서 이동은 예전 배열 구현과 같다(tests/unit/scanbodyGeometry.test.js가 비교).
 */
export function decodeFacesWithMode(data, faceCount, vertexCount, mode) {
  const faces = new Uint32Array(faceCount * 3);
  let n = 0;
  // 모서리 노드: 시작 S, 끝 E, 고리 다음 NX·이전 PV. restart 때 비운다.
  let S = [];
  let E = [];
  let NX = [];
  let PV = [];
  let len = 0;
  let cur = -1;
  let ptr = 0;
  let pos = 0;

  const push = (a, b, c) => {
    if (n + 3 > faces.length) throw new Error("face overflow");
    faces[n] = a;
    faces[n + 1] = b;
    faces[n + 2] = c;
    n += 3;
  };
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
  const node = (s, e) => {
    S.push(s);
    E.push(e);
    NX.push(-1);
    PV.push(-1);
    return S.length - 1;
  };
  const link = (a, b) => {
    NX[a] = b;
    PV[b] = a;
  };
  const restart = (a, b, c) => {
    push(a, b, c);
    S = [];
    E = [];
    NX = [];
    PV = [];
    const x = node(a, b);
    const y = node(b, c);
    const z = node(c, a);
    link(x, y);
    link(y, z);
    link(z, x);
    len = 3;
    cur = x;
  };
  const extend = (v) => {
    if (len === 0) throw new Error("no edge");
    const cs = S[cur];
    const ceEnd = E[cur];
    push(v, ceEnd, cs);
    const a = node(cs, v);
    const b = node(v, ceEnd);
    if (len === 1) {
      link(a, b);
      link(b, a);
      cur = a;
    } else {
      const next = NX[cur];
      link(PV[cur], a);
      link(a, b);
      link(b, next);
      cur = next;
    }
    len += 1;
  };
  /** 고리에서 이웃한 first → second 두 모서리를 (s, e) 하나로 바꾸고 그 다음으로 간다. */
  const joinPair = (first, second, s, e) => {
    const x = node(s, e);
    if (len === 2) {
      link(x, x);
      cur = x;
    } else {
      const next = NX[second];
      link(PV[first], x);
      link(x, next);
      cur = next;
    }
    len -= 1;
  };

  while (pos < data.length) {
    const cmd = u8();
    if (cmd >> 4 !== 0) throw new Error("bad command");
    switch (cmd & 0x0f) {
      case 0:
        extend(ptr++);
        break;
      case 1: {
        if (len < 2) throw new Error("prev");
        const prev = PV[cur];
        push(S[cur], S[prev], E[cur]);
        joinPair(prev, cur, S[prev], E[cur]);
        break;
      }
      case 2: {
        if (len < 2) throw new Error("next");
        const next = NX[cur];
        push(S[cur], E[next], E[cur]);
        joinPair(cur, next, S[cur], E[next]);
        break;
      }
      case 3:
        if (len === 0) throw new Error("skip");
        cur = NX[cur];
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
        if (len === 0) throw new Error("remove");
        const prev = PV[cur];
        if (S[prev] === E[cur] && len > 2) {
          const np = PV[prev];
          const nc = NX[cur];
          link(np, nc);
          E[np] = S[nc];
          cur = nc;
          len -= 2;
        } else {
          E[prev] = E[cur];
          if (len === 1) {
            cur = -1;
          } else {
            const next = NX[cur];
            link(prev, next);
            cur = next;
          }
          len -= 1;
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
  if (n !== faces.length) throw new Error(`face count ${n / 3} != ${faceCount}`);
  for (let i = 0; i < n; i += 1) if (faces[i] >= vertexCount) throw new Error("index out of range");
  return faces;
}

/** 3Shape HPS(.dcm) → 삼각형 좌표(9개씩). 암호화(CE)는 읽지 않는다. */
export function trianglesFromHps(buffer) {
  if (buffer.length > MAX_XML_BYTES) fail("형상 파일이 너무 큽니다.");
  const xml = buffer.toString("utf8");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) fail("허용하지 않는 XML 선언이 있습니다.");
  if (!/<HPS[\s>]/.test(xml)) fail("3Shape 형상(.dcm)이 아닙니다.");
  const schema = /<Schema>\s*([A-Za-z]+)\s*<\/Schema>/.exec(xml)?.[1]?.toUpperCase() ?? "";
  if (schema === "CE") fail("암호화된 형상(CE)은 읽을 수 없습니다.");
  if (schema !== "CA" && schema !== "CC") fail(`지원하지 않는 형상 형식입니다(${schema || "없음"}).`);

  const vertices = readElement(xml, "Vertices");
  const facets = readElement(xml, "Facets");
  if (!vertices || !facets) fail("꼭짓점·면 데이터가 없습니다.");
  const vertexCount = positiveInt(vertices.attrs.vertex_count, MAX_VERTICES, "꼭짓점");
  const faceCount = positiveInt(facets.attrs.facet_count, MAX_TRIANGLES, "면");
  const vertexBytes = decodeBase64(vertices.text, "꼭짓점");
  if (vertexBytes.length < vertexCount * 12) fail("꼭짓점 데이터가 짧습니다.");
  const faces = decodeFaces(decodeBase64(facets.text, "면"), faceCount, vertexCount);

  const out = new Float32Array(faceCount * 9);
  for (let f = 0; f < faceCount; f += 1) {
    for (let k = 0; k < 3; k += 1) {
      const v = faces[f * 3 + k];
      for (let c = 0; c < 3; c += 1) out[f * 9 + k * 3 + c] = vertexBytes.readFloatLE(v * 12 + c * 4);
    }
  }
  return out;
}

/** 이진·ASCII STL → 삼각형 좌표(9개씩). */
export function trianglesFromStl(buffer) {
  if (buffer.length >= 84) {
    const count = buffer.readUInt32LE(80);
    if (count > 0 && count <= MAX_TRIANGLES && buffer.length === 84 + count * 50) {
      const out = new Float32Array(count * 9);
      for (let i = 0; i < count; i += 1) {
        const base = 84 + i * 50 + 12;
        for (let k = 0; k < 9; k += 1) out[i * 9 + k] = buffer.readFloatLE(base + k * 4);
      }
      return out;
    }
  }
  const head = buffer.subarray(0, 512).toString("latin1");
  if (!/^\s*solid\b/.test(head) || buffer.length > MAX_XML_BYTES) fail("STL 형식이 올바르지 않습니다.");
  const values = [];
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
  const text = buffer.toString("latin1");
  let m;
  while ((m = re.exec(text))) {
    values.push(Number(m[1]), Number(m[2]), Number(m[3]));
    if (values.length > MAX_TRIANGLES * 9) fail("STL 면이 너무 많습니다.");
  }
  if (values.length === 0 || values.length % 9 !== 0) fail("STL 형식이 올바르지 않습니다.");
  return Float32Array.from(values);
}

const PLY_TYPES = {
  char: [1, "readInt8"],
  int8: [1, "readInt8"],
  uchar: [1, "readUInt8"],
  uint8: [1, "readUInt8"],
  short: [2, "readInt16"],
  int16: [2, "readInt16"],
  ushort: [2, "readUInt16"],
  uint16: [2, "readUInt16"],
  int: [4, "readInt32"],
  int32: [4, "readInt32"],
  uint: [4, "readUInt32"],
  uint32: [4, "readUInt32"],
  float: [4, "readFloat"],
  float32: [4, "readFloat"],
  double: [8, "readDouble"],
  float64: [8, "readDouble"],
};

function plyType(name) {
  const type = PLY_TYPES[name];
  if (!type) fail(`PLY 형식(${name})을 읽을 수 없습니다.`);
  return type;
}

/** PLY(ASCII·이진) → 삼각형 좌표(9개씩). 다각형 면은 부채꼴로 나눈다. */
export function trianglesFromPly(buffer) {
  const headEnd = buffer.indexOf("end_header", 0, "latin1");
  if (headEnd < 0 || headEnd > 64 * 1024) fail("PLY 형식이 올바르지 않습니다.");
  const bodyStart = buffer.indexOf(0x0a, headEnd) + 1;
  const lines = buffer.subarray(0, headEnd).toString("latin1").split(/\r?\n/);
  if (lines[0]?.trim() !== "ply") fail("PLY 형식이 올바르지 않습니다.");
  let format = "";
  const elements = [];
  for (const line of lines) {
    const t = line.trim().split(/\s+/);
    if (t[0] === "format") format = t[1];
    else if (t[0] === "element") {
      const count = Number(t[2]);
      if (!Number.isInteger(count) || count < 0 || count > MAX_VERTICES * 4) fail("PLY 요소 개수가 올바르지 않습니다.");
      elements.push({ name: t[1], count, props: [] });
    }
    else if (t[0] === "property" && elements.length) {
      const el = elements[elements.length - 1];
      if (t[1] === "list") el.props.push({ name: t[4], list: true, countType: plyType(t[2]), type: plyType(t[3]) });
      else el.props.push({ name: t[2], list: false, type: plyType(t[1]) });
    }
  }
  if (!["ascii", "binary_little_endian", "binary_big_endian"].includes(format)) fail("PLY 형식이 올바르지 않습니다.");
  const vertexEl = elements.find((el) => el.name === "vertex");
  const faceEl = elements.find((el) => el.name === "face");
  if (!vertexEl || !faceEl) fail("PLY에 꼭짓점·면이 없습니다.");
  if (vertexEl.count > MAX_VERTICES) fail("꼭짓점이 너무 많습니다.");
  const xyz = ["x", "y", "z"].map((name) => vertexEl.props.findIndex((p) => p.name === name && !p.list));
  if (xyz.some((i) => i < 0)) fail("PLY 꼭짓점에 x·y·z가 없습니다.");
  const faceProp = faceEl.props.findIndex((p) => p.list && /^vertex_ind(ex|ices)$/.test(p.name));
  if (faceProp < 0) fail("PLY 면에 vertex_indices가 없습니다.");

  const verts = new Float32Array(vertexEl.count * 3);
  const tris = [];
  const pushFace = (ids) => {
    for (let k = 1; k + 1 < ids.length; k += 1) {
      for (const id of [ids[0], ids[k], ids[k + 1]]) {
        if (!(id >= 0 && id < vertexEl.count)) fail("PLY 면 번호가 범위를 벗어납니다.");
        tris.push(verts[id * 3], verts[id * 3 + 1], verts[id * 3 + 2]);
      }
      if (tris.length > MAX_TRIANGLES * 9) fail("면이 너무 많습니다.");
    }
  };

  if (format === "ascii") {
    const tokens = buffer.subarray(bodyStart).toString("latin1").split(/\s+/).filter(Boolean);
    let at = 0;
    const next = () => {
      if (at >= tokens.length) fail("PLY 데이터가 짧습니다.");
      return Number(tokens[at++]);
    };
    for (const el of elements) {
      for (let r = 0; r < el.count; r += 1) {
        const ids = [];
        el.props.forEach((p, pi) => {
          if (p.list) {
            const n = next();
            for (let k = 0; k < n; k += 1) {
              const v = next();
              if (el === faceEl && pi === faceProp) ids.push(v);
            }
          } else {
            const v = next();
            if (el === vertexEl) {
              const c = xyz.indexOf(pi);
              if (c >= 0) verts[r * 3 + c] = v;
            }
          }
        });
        if (el === faceEl) pushFace(ids);
      }
    }
  } else {
    const suffix = format === "binary_little_endian" ? "LE" : "BE";
    const read = ([size, fn], off) => {
      if (off + size > buffer.length) fail("PLY 데이터가 짧습니다.");
      return size === 1 ? buffer[fn](off) : buffer[`${fn}${suffix}`](off);
    };
    let off = bodyStart;
    for (const el of elements) {
      for (let r = 0; r < el.count; r += 1) {
        const ids = [];
        el.props.forEach((p, pi) => {
          if (p.list) {
            const n = read(p.countType, off);
            off += p.countType[0];
            for (let k = 0; k < n; k += 1) {
              const v = read(p.type, off);
              off += p.type[0];
              if (el === faceEl && pi === faceProp) ids.push(v);
            }
          } else {
            const v = read(p.type, off);
            off += p.type[0];
            if (el === vertexEl) {
              const c = xyz.indexOf(pi);
              if (c >= 0) verts[r * 3 + c] = v;
            }
          }
        });
        if (el === faceEl) pushFace(ids);
      }
    }
  }
  if (tris.length === 0) fail("PLY에 면이 없습니다.");
  return Float32Array.from(tris);
}

/** OBJ(텍스트) → 삼각형 좌표(9개씩). v·f만 읽고 다각형 면은 부채꼴로 나눈다. */
export function trianglesFromObj(buffer) {
  if (buffer.length > MAX_XML_BYTES * 2) fail("형상 파일이 너무 큽니다.");
  const verts = [];
  const tris = [];
  for (const raw of buffer.toString("latin1").split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("v ")) {
      const t = line.split(/\s+/);
      verts.push([Number(t[1]), Number(t[2]), Number(t[3])]);
      if (verts.length > MAX_VERTICES) fail("꼭짓점이 너무 많습니다.");
    } else if (line.startsWith("f ")) {
      const ids = line
        .split(/\s+/)
        .slice(1)
        .map((tok) => {
          const n = Number.parseInt(tok.split("/")[0], 10);
          return n < 0 ? verts.length + n : n - 1;
        });
      for (let k = 1; k + 1 < ids.length; k += 1) {
        for (const id of [ids[0], ids[k], ids[k + 1]]) {
          const v = verts[id];
          if (!v) fail("OBJ 면 번호가 범위를 벗어납니다.");
          tris.push(v[0], v[1], v[2]);
        }
        if (tris.length > MAX_TRIANGLES * 9) fail("면이 너무 많습니다.");
      }
    }
  }
  if (tris.length === 0) fail("OBJ에 면이 없습니다.");
  return Float32Array.from(tris);
}

export const MESH_FILE_PATTERN = /\.(dcm|stl|ply|obj)$/i;
/** 라이브러리 묶음으로 받는 형상. STEP(.stp·.step)은 면을 만들어 읽는다. */
export const LIBRARY_SHAPE_PATTERN = /\.(dcm|stl|stp|step)$/i;

let occtPromise;

/** STEP(.stp·.step) → 삼각형 좌표(9개씩). 단위는 보통 mm. */
export async function trianglesFromStep(buffer) {
  if (buffer.length > MAX_XML_BYTES) fail("형상 파일이 너무 큽니다.");
  if (!occtPromise) {
    const { createRequire } = await import("module");
    const require = createRequire(import.meta.url);
    occtPromise = require("occt-import-js")();
  }
  const occt = await occtPromise;
  const result = occt.ReadStepFile(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.length), null);
  if (!result?.success) fail("STEP 형상을 읽지 못했습니다.");
  const tris = [];
  for (const mesh of result.meshes ?? []) {
    const pos = mesh.attributes?.position?.array;
    const idx = mesh.index?.array;
    if (!pos?.length) continue;
    if (idx?.length) {
      for (let i = 0; i + 2 < idx.length; i += 3) {
        for (const id of [idx[i], idx[i + 1], idx[i + 2]]) {
          const at = id * 3;
          tris.push(pos[at], pos[at + 1], pos[at + 2]);
        }
        if (tris.length > MAX_TRIANGLES * 9) fail("면이 너무 많습니다.");
      }
    } else {
      for (let i = 0; i < pos.length; i += 1) tris.push(pos[i]);
      if (tris.length > MAX_TRIANGLES * 9) fail("면이 너무 많습니다.");
    }
  }
  if (tris.length < 36) fail("STEP에 면이 없습니다.");
  return Float32Array.from(tris);
}

/**
 * 제조사 STL·STEP은 긴 축을 임플란트 축으로, 더 가는 쪽을 플랫폼으로 둔다.
 * 결과 좌표는 플랫폼 원점·+Y 축이다.
 */
export function alignScanbodyToModel(triangles) {
  const count = triangles.length / 3;
  if (!Number.isInteger(count) || count < 4) fail("형상 면이 너무 적습니다.");
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const mid = [0, 0, 0];
  for (let i = 0; i < triangles.length; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      const x = triangles[i + k];
      if (!Number.isFinite(x)) fail("형상 좌표가 올바르지 않습니다.");
      if (x < min[k]) min[k] = x;
      if (x > max[k]) max[k] = x;
      mid[k] += x;
    }
  }
  for (let k = 0; k < 3; k += 1) mid[k] /= count;
  const ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const span = Math.max(...ext);
  if (!(span > 0)) fail("형상 크기가 없습니다.");
  const scale = span < 0.5 ? 1000 : span > 2000 ? 0.001 : 1;
  let axisIndex = 0;
  if (ext[1] >= ext[0] && ext[1] >= ext[2]) axisIndex = 1;
  else if (ext[2] >= ext[0] && ext[2] >= ext[1]) axisIndex = 2;
  const low = min[axisIndex];
  const high = max[axisIndex];
  const band = Math.max((high - low) * 0.2, span * 1e-4);
  let lowR = 0;
  let highR = 0;
  let lowN = 0;
  let highN = 0;
  for (let i = 0; i < triangles.length; i += 3) {
    const along = triangles[i + axisIndex];
    let radial = 0;
    for (let k = 0; k < 3; k += 1) {
      if (k === axisIndex) continue;
      const d = triangles[i + k] - mid[k];
      radial += d * d;
    }
    radial = Math.sqrt(radial);
    if (along <= low + band) {
      lowR += radial;
      lowN += 1;
    } else if (along >= high - band) {
      highR += radial;
      highN += 1;
    }
  }
  const platformAtLow = lowR / Math.max(lowN, 1) <= highR / Math.max(highN, 1);
  const axis = [0, 0, 0];
  axis[axisIndex] = platformAtLow ? 1 : -1;
  const origin = [mid[0], mid[1], mid[2]];
  origin[axisIndex] = platformAtLow ? low : high;
  const scaled = scale === 1 ? triangles : Float32Array.from(triangles, (value) => value * scale);
  const originScaled = origin.map((value) => value * scale);
  const ref = axisIndex === 0 ? [0, 1, 0] : [1, 0, 0];
  return frameToModel(scaled, { origin: originScaled, axis, ref });
}

/** 확장자로 형상 파일(.dcm·.stl·.ply·.obj)을 읽는다. */
export function trianglesFromMeshFile(buffer, fileName) {
  const ext = String(fileName || "").toLowerCase().split(".").pop();
  if (ext === "dcm") return trianglesFromHps(buffer);
  if (ext === "stl") return trianglesFromStl(buffer);
  if (ext === "ply") return trianglesFromPly(buffer);
  if (ext === "obj") return trianglesFromObj(buffer);
  fail(".dcm·.stl·.ply·.obj 형상만 읽을 수 있습니다.");
}

/** 라이브러리로 받는 형상(.dcm·.stl·.stp). STEP은 비동기. */
export async function trianglesFromLibraryShape(buffer, fileName) {
  const ext = String(fileName || "").toLowerCase().split(".").pop();
  if (ext === "stp" || ext === "step") return trianglesFromStep(buffer);
  return trianglesFromMeshFile(buffer, fileName);
}

/** 스캔 좌표 형상을 플랫폼 원점(origin)으로 옮긴 뒤 모델 좌표로 돌린다. */
export function frameToModel(triangles, { origin, axis, ref }) {
  const moved = new Float32Array(triangles.length);
  for (let i = 0; i < triangles.length; i += 3) {
    moved[i] = triangles[i] - origin[0];
    moved[i + 1] = triangles[i + 1] - origin[1];
    moved[i + 2] = triangles[i + 2] - origin[2];
  }
  return transformToModel(moved, axis, ref);
}

/** 좌표 → 모델 좌표. y=임플란트 축, x=기준 방향(축에 직교화), z=x×y. */
export function transformToModel(triangles, axis, ref) {
  const norm = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]);
    if (!(l > 1e-9)) fail("축 방향이 올바르지 않습니다.");
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const y = norm(axis);
  const d = ref[0] * y[0] + ref[1] * y[1] + ref[2] * y[2];
  let x = [ref[0] - y[0] * d, ref[1] - y[1] * d, ref[2] - y[2] * d];
  if (Math.hypot(...x) < 1e-6) x = Math.abs(y[2]) < 0.9 ? [y[1], -y[0], 0] : [0, y[2], -y[1]];
  x = norm(x);
  const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  const out = new Float32Array(triangles.length);
  for (let i = 0; i < triangles.length; i += 3) {
    const p0 = triangles[i];
    const p1 = triangles[i + 1];
    const p2 = triangles[i + 2];
    out[i] = p0 * x[0] + p1 * x[1] + p2 * x[2];
    out[i + 1] = p0 * y[0] + p1 * y[1] + p2 * y[2];
    out[i + 2] = p0 * z[0] + p1 * z[1] + p2 * z[2];
  }
  return out;
}

/**
 * 검증 후 이진 STL로 새로 쓴다. 법선은 0(뷰어가 다시 계산).
 * maxAbsMm: 라이브러리 부품은 플랫폼 원점 모델 좌표라 작다. 심플어벗 템플릿은 스캐너 좌표라 넓게 준다.
 */
export function encodeCanonicalStl(triangles, { maxAbsMm = MAX_ABS_COORD_MM } = {}) {
  const count = triangles.length / 9;
  if (!Number.isInteger(count) || count < 4) fail("형상 면이 너무 적습니다.");
  if (count > MAX_TRIANGLES) fail("형상 면이 너무 많습니다.");
  for (let i = 0; i < triangles.length; i += 1) {
    const v = triangles[i];
    if (!Number.isFinite(v) || Math.abs(v) > maxAbsMm) fail("형상 좌표가 허용 범위를 벗어났습니다.");
  }
  const out = Buffer.alloc(84 + count * 50);
  out.write("abuts scanbody model mm (+Y implant axis)", 0, "ascii");
  out.writeUInt32LE(count, 80);
  for (let i = 0; i < count; i += 1) {
    const base = 84 + i * 50 + 12;
    for (let k = 0; k < 9; k += 1) out.writeFloatLE(triangles[i * 9 + k], base + k * 4);
  }
  return out;
}

export function canonicalStlHash(stl) {
  return crypto.createHash("sha256").update(stl).digest("hex");
}
