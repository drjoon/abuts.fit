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

function decodeFacesWithMode(data, faceCount, vertexCount, mode) {
  const faces = new Uint32Array(faceCount * 3);
  let n = 0;
  let edges = [];
  let cur = 0;
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
