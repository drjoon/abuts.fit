// 브라우저에서 스캔바디 모델 STL을 만든다. 서버 scanbodyGeometry.alignScanbodyToModel·encodeCanonicalStl과 같게.
// 결과 바이트가 S3에 들어가고, 메타데이터만 MongoDB에 들어간다.
import wasmUrl from "occt-import-js/dist/occt-import-js.wasm?url";
import { parseHpsDcmMeshData } from "@/shared/files/hpsDcmPreview";

const MAX_TRIANGLES = 1_500_000;
const MAX_ABS_MM = 200;
const HEADER = "abuts scanbody model mm (+Y implant axis)";

type OcctModule = {
  ReadStepFile: (
    data: Uint8Array,
    params: null,
  ) => {
    success?: boolean;
    meshes?: Array<{
      attributes?: { position?: { array?: ArrayLike<number> } };
      index?: { array?: ArrayLike<number> };
    }>;
  };
};

let occtPromise: Promise<OcctModule> | null = null;

function fail(message: string): never {
  throw new Error(message);
}

function soupFromIndexed(positions: ArrayLike<number>, indices: ArrayLike<number> | null | undefined) {
  const tris: number[] = [];
  if (indices && indices.length) {
    for (let i = 0; i + 2 < indices.length; i += 3) {
      for (const id of [indices[i]!, indices[i + 1]!, indices[i + 2]!]) {
        const at = id * 3;
        tris.push(Number(positions[at]), Number(positions[at + 1]), Number(positions[at + 2]));
      }
      if (tris.length > MAX_TRIANGLES * 9) fail("면이 너무 많습니다.");
    }
  } else {
    for (let i = 0; i < positions.length; i += 1) tris.push(Number(positions[i]));
  }
  if (tris.length === 0 || tris.length % 9 !== 0) fail("형상 면이 없습니다.");
  return Float32Array.from(tris);
}

function trianglesFromStl(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  if (buffer.byteLength >= 84) {
    const count = view.getUint32(80, true);
    if (count > 0 && count <= MAX_TRIANGLES && buffer.byteLength === 84 + count * 50) {
      const out = new Float32Array(count * 9);
      for (let i = 0; i < count; i += 1) {
        const base = 84 + i * 50 + 12;
        for (let k = 0; k < 9; k += 1) out[i * 9 + k] = view.getFloat32(base + k * 4, true);
      }
      return out;
    }
  }
  const head = new TextDecoder("latin1").decode(buffer.slice(0, 512));
  if (!/^\s*solid\b/.test(head)) fail("STL 형식이 올바르지 않습니다.");
  const text = new TextDecoder("latin1").decode(buffer);
  const values: number[] = [];
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    values.push(Number(match[1]), Number(match[2]), Number(match[3]));
    if (values.length > MAX_TRIANGLES * 9) fail("STL 면이 너무 많습니다.");
  }
  if (values.length === 0 || values.length % 9 !== 0) fail("STL 형식이 올바르지 않습니다.");
  return Float32Array.from(values);
}

async function trianglesFromStep(buffer: ArrayBuffer) {
  if (!occtPromise) {
    occtPromise = import("occt-import-js").then(async ({ default: factory }) => {
      const create = factory as (opts?: { locateFile?: (file: string) => string }) => Promise<OcctModule>;
      return create({ locateFile: (file) => (file.endsWith(".wasm") ? wasmUrl : file) });
    });
  }
  const occt = await occtPromise;
  const result = occt.ReadStepFile(new Uint8Array(buffer), null);
  if (!result?.success) fail("STEP 형상을 읽지 못했습니다.");
  const tris: number[] = [];
  for (const mesh of result.meshes ?? []) {
    const pos = mesh.attributes?.position?.array;
    if (!pos?.length) continue;
    const part = soupFromIndexed(pos, mesh.index?.array);
    for (let i = 0; i < part.length; i += 1) tris.push(part[i]!);
    if (tris.length > MAX_TRIANGLES * 9) fail("면이 너무 많습니다.");
  }
  if (tris.length < 36) fail("STEP에 면이 없습니다.");
  return Float32Array.from(tris);
}

async function trianglesFromFile(file: File) {
  const buffer = await file.arrayBuffer();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "dcm") {
    const mesh = await parseHpsDcmMeshData(buffer);
    return soupFromIndexed(mesh.positions, mesh.indices);
  }
  if (ext === "stl") return trianglesFromStl(buffer);
  if (ext === "stp" || ext === "step") return trianglesFromStep(buffer);
  fail("STEP, STL, DCM 파일만 만들 수 있습니다.");
}

function alignScanbodyToModel(triangles: Float32Array) {
  const count = triangles.length / 3;
  if (!Number.isInteger(count) || count < 4) fail("형상 면이 너무 적습니다.");
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const mid = [0, 0, 0];
  for (let i = 0; i < triangles.length; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      const x = triangles[i + k]!;
      if (!Number.isFinite(x)) fail("형상 좌표가 올바르지 않습니다.");
      if (x < min[k]!) min[k] = x;
      if (x > max[k]!) max[k] = x;
      mid[k]! += x;
    }
  }
  for (let k = 0; k < 3; k += 1) mid[k]! /= count;
  const ext = [max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!];
  const span = Math.max(...ext);
  if (!(span > 0)) fail("형상 크기가 없습니다.");
  const scale = span < 0.5 ? 1000 : span > 2000 ? 0.001 : 1;
  let axisIndex = 0;
  if (ext[1]! >= ext[0]! && ext[1]! >= ext[2]!) axisIndex = 1;
  else if (ext[2]! >= ext[0]! && ext[2]! >= ext[1]!) axisIndex = 2;
  const low = min[axisIndex]!;
  const high = max[axisIndex]!;
  const band = Math.max((high - low) * 0.2, span * 1e-4);
  let lowR = 0;
  let highR = 0;
  let lowN = 0;
  let highN = 0;
  for (let i = 0; i < triangles.length; i += 3) {
    const along = triangles[i + axisIndex]!;
    let radial = 0;
    for (let k = 0; k < 3; k += 1) {
      if (k === axisIndex) continue;
      const d = triangles[i + k]! - mid[k]!;
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
  const origin = [mid[0]!, mid[1]!, mid[2]!];
  origin[axisIndex] = platformAtLow ? low : high;
  const scaled = scale === 1 ? triangles : Float32Array.from(triangles, (value) => value * scale);
  const originScaled = origin.map((value) => value * scale);
  const ref = axisIndex === 0 ? [0, 1, 0] : [1, 0, 0];
  return frameToModel(scaled, originScaled, axis, ref);
}

function frameToModel(triangles: Float32Array, origin: number[], axis: number[], ref: number[]) {
  const moved = new Float32Array(triangles.length);
  for (let i = 0; i < triangles.length; i += 3) {
    moved[i] = triangles[i]! - origin[0]!;
    moved[i + 1] = triangles[i + 1]! - origin[1]!;
    moved[i + 2] = triangles[i + 2]! - origin[2]!;
  }
  const norm = (v: number[]) => {
    const l = Math.hypot(v[0]!, v[1]!, v[2]!);
    if (!(l > 1e-9)) fail("축 방향이 올바르지 않습니다.");
    return [v[0]! / l, v[1]! / l, v[2]! / l];
  };
  const y = norm(axis);
  const d = ref[0]! * y[0]! + ref[1]! * y[1]! + ref[2]! * y[2]!;
  let x = [ref[0]! - y[0]! * d, ref[1]! - y[1]! * d, ref[2]! - y[2]! * d];
  if (Math.hypot(...x) < 1e-6) x = Math.abs(y[2]!) < 0.9 ? [y[1]!, -y[0]!, 0] : [0, y[2]!, -y[1]!];
  x = norm(x);
  const z = [x[1]! * y[2]! - x[2]! * y[1]!, x[2]! * y[0]! - x[0]! * y[2]!, x[0]! * y[1]! - x[1]! * y[0]!];
  const out = new Float32Array(moved.length);
  for (let i = 0; i < moved.length; i += 3) {
    const p0 = moved[i]!;
    const p1 = moved[i + 1]!;
    const p2 = moved[i + 2]!;
    out[i] = p0 * x[0]! + p1 * x[1]! + p2 * x[2]!;
    out[i + 1] = p0 * y[0]! + p1 * y[1]! + p2 * y[2]!;
    out[i + 2] = p0 * z[0]! + p1 * z[1]! + p2 * z[2]!;
  }
  return out;
}

function encodeCanonicalStl(triangles: Float32Array) {
  const count = triangles.length / 9;
  if (!Number.isInteger(count) || count < 4) fail("형상 면이 너무 적습니다.");
  if (count > MAX_TRIANGLES) fail("형상 면이 너무 많습니다.");
  const out = new ArrayBuffer(84 + count * 50);
  const bytes = new Uint8Array(out);
  bytes.set(new TextEncoder().encode(HEADER).subarray(0, 80));
  const view = new DataView(out);
  view.setUint32(80, count, true);
  for (let i = 0; i < count; i += 1) {
    const base = 84 + i * 50 + 12;
    for (let k = 0; k < 9; k += 1) {
      const value = triangles[i * 9 + k]!;
      if (!Number.isFinite(value) || Math.abs(value) > MAX_ABS_MM) fail("형상 좌표가 허용 범위를 벗어났습니다.");
      view.setFloat32(base + k * 4, value, true);
    }
  }
  return out;
}

/** 원본 STEP·STL·DCM을 플랫폼 원점·+Y 축 모델 STL로 만든다. */
export async function generateScanbodyStl(file: File) {
  const aligned = alignScanbodyToModel(await trianglesFromFile(file));
  return new Blob([encodeCanonicalStl(aligned)], { type: "model/stl" });
}
