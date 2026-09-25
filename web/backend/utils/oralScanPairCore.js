// 바이트 기준 상악·하악 겹침과, 보철이 구강스캔에 닿는 마진 점.
// 좌표는 row-major 4×4. p' = M * [x, y, z, 1].

const IDENTITY = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

const NATIVE_MEDIAN_MM = 1.5;
const ALIGNED_RESIDUAL_MM = 1.5;
const MARGIN_CONTACT_MM = 0.35;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const dist = (a, b) => len(sub(a, b));

function norm(a) {
  const n = len(a);
  if (n < 1e-8) return null;
  return scale(a, 1 / n);
}

export function identityScanMatrix() {
  return [...IDENTITY];
}

export function applyScanMatrix(matrix, point) {
  const m = matrix;
  const p = point;
  return [
    m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
    m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
    m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
  ];
}

function cellKey(p, cell) {
  return `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)},${Math.floor(p[2] / cell)}`;
}

function buildGrid(points, cell) {
  const map = new Map();
  for (const p of points) {
    const key = cellKey(p, cell);
    let bucket = map.get(key);
    if (!bucket) {
      bucket = [];
      map.set(key, bucket);
    }
    bucket.push(p);
  }
  return map;
}

function nearestDistance(grid, point, cell, radiusCells) {
  const ix = Math.floor(point[0] / cell);
  const iy = Math.floor(point[1] / cell);
  const iz = Math.floor(point[2] / cell);
  let best = Infinity;
  for (let dz = -radiusCells; dz <= radiusCells; dz += 1) {
    for (let dy = -radiusCells; dy <= radiusCells; dy += 1) {
      for (let dx = -radiusCells; dx <= radiusCells; dx += 1) {
        const bucket = grid.get(`${ix + dx},${iy + dy},${iz + dz}`);
        if (!bucket) continue;
        for (const q of bucket) {
          const d = dist(point, q);
          if (d < best) best = d;
        }
      }
    }
  }
  return best;
}

function nearestPoint(grid, point, cell) {
  let best = null;
  let bestD = Infinity;
  const ix = Math.floor(point[0] / cell);
  const iy = Math.floor(point[1] / cell);
  const iz = Math.floor(point[2] / cell);
  for (let r = 1; r <= 12; r += 1) {
    for (let dz = -r; dz <= r; dz += 1) {
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r && r > 1) {
            continue;
          }
          const bucket = grid.get(`${ix + dx},${iy + dy},${iz + dz}`);
          if (!bucket) continue;
          for (const q of bucket) {
            const d = dist(point, q);
            if (d < bestD) {
              bestD = d;
              best = q;
            }
          }
        }
      }
    }
    if (best && bestD <= r * cell) return best;
  }
  return best;
}

function median(values) {
  if (!values.length) return Infinity;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function medianNearest(source, target, cell = 1) {
  const grid = buildGrid(target, cell);
  const step = Math.max(1, Math.floor(source.length / 400));
  const samples = [];
  for (let i = 0; i < source.length; i += step) {
    const d = nearestDistance(grid, source[i], cell, 3);
    if (Number.isFinite(d)) samples.push(d);
  }
  return median(samples);
}

function farthest3(points) {
  if (points.length < 3) return null;
  const seed = points[Math.floor(points.length / 2)];
  let a = points[0];
  let best = -1;
  for (const p of points) {
    const d = dist(seed, p);
    if (d > best) {
      best = d;
      a = p;
    }
  }
  let b = points[0];
  best = -1;
  for (const p of points) {
    const d = dist(a, p);
    if (d > best) {
      best = d;
      b = p;
    }
  }
  let c = null;
  best = -1;
  for (const p of points) {
    const d = Math.min(dist(a, p), dist(b, p));
    if (d > best) {
      best = d;
      c = p;
    }
  }
  if (!c || best < 1) return null;
  return [a, b, c];
}

function basis(p0, p1, p2) {
  const x = norm(sub(p1, p0));
  if (!x) return null;
  const z = norm(cross(x, sub(p2, p0)));
  if (!z) return null;
  const y = norm(cross(z, x));
  if (!y) return null;
  return { o: p0, x, y, z };
}

function rigidMatrix(srcPts, dstPts) {
  const src = basis(srcPts[0], srcPts[1], srcPts[2]);
  const dst = basis(dstPts[0], dstPts[1], dstPts[2]);
  if (!src || !dst) return null;
  const S = [src.x, src.y, src.z];
  const D = [dst.x, dst.y, dst.z];
  const R = new Array(9);
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      R[i * 3 + j] = D[0][i] * S[j][0] + D[1][i] * S[j][1] + D[2][i] * S[j][2];
    }
  }
  const origin = [
    R[0] * src.o[0] + R[1] * src.o[1] + R[2] * src.o[2],
    R[3] * src.o[0] + R[4] * src.o[1] + R[5] * src.o[2],
    R[6] * src.o[0] + R[7] * src.o[1] + R[8] * src.o[2],
  ];
  const t = sub(dst.o, origin);
  return [
    R[0], R[1], R[2], t[0],
    R[3], R[4], R[5], t[1],
    R[6], R[7], R[8], t[2],
    0, 0, 0, 1,
  ];
}

function alignArchOntoBite(bitePoints, archPoints) {
  if (!bitePoints?.length || !archPoints?.length) {
    return { matrix: null, residualMm: null, method: "" };
  }
  const nativeMedian = medianNearest(bitePoints, archPoints, 1);
  if (nativeMedian <= NATIVE_MEDIAN_MM) {
    return {
      matrix: identityScanMatrix(),
      residualMm: round3(nativeMedian),
      method: "identity",
    };
  }
  const bite3 = farthest3(bitePoints);
  if (!bite3) {
    return { matrix: null, residualMm: round3(nativeMedian), method: "" };
  }
  const grid = buildGrid(archPoints, 2);
  const arch3 = bite3.map((p) => nearestPoint(grid, p, 2));
  if (arch3.some((p) => !p)) {
    return { matrix: null, residualMm: round3(nativeMedian), method: "" };
  }
  const matrix = rigidMatrix(arch3, bite3);
  if (!matrix) {
    return { matrix: null, residualMm: round3(nativeMedian), method: "" };
  }
  const moved = archPoints.map((p) => applyScanMatrix(matrix, p));
  const residual = medianNearest(bitePoints, moved, 1);
  return {
    matrix,
    residualMm: round3(residual),
    method: "three-point",
  };
}

function round3(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}

/**
 * 바이트 좌표계로 상악·하악을 보낸다.
 * 이미 겹쳐 있으면 단위행렬. 아니면 바이트에서 떨어진 점 3개로 강체변환.
 */
export function alignJawsToBite({ upper, lower, bite } = {}) {
  const upperFit = alignArchOntoBite(bite, upper);
  const lowerFit = alignArchOntoBite(bite, lower);
  const fits = [upperFit, lowerFit].filter((row) => row.matrix);
  if (!fits.length) {
    return {
      status: "unavailable",
      method: "",
      upperMatrix: null,
      lowerMatrix: null,
      residualUpperMm: upperFit.residualMm,
      residualLowerMm: lowerFit.residualMm,
    };
  }
  const residuals = fits
    .map((row) => row.residualMm)
    .filter((value) => Number.isFinite(value));
  const worst = residuals.length ? Math.max(...residuals) : Infinity;
  const allIdentity = fits.every((row) => row.method === "identity");
  let status = "weak";
  if (allIdentity && worst <= NATIVE_MEDIAN_MM) status = "native";
  else if (worst <= ALIGNED_RESIDUAL_MM) status = "aligned";
  const method = allIdentity
    ? "identity"
    : fits.some((row) => row.method === "three-point")
      ? "three-point"
      : "identity";
  return {
    status,
    method,
    upperMatrix: upperFit.matrix,
    lowerMatrix: lowerFit.matrix,
    residualUpperMm: upperFit.residualMm,
    residualLowerMm: lowerFit.residualMm,
  };
}

function farthestSubset(points, max) {
  if (points.length <= max) return points;
  const chosen = [points[0]];
  while (chosen.length < max) {
    let best = null;
    let bestD = -1;
    for (const p of points) {
      let near = Infinity;
      for (const c of chosen) near = Math.min(near, dist(p, c));
      if (near > bestD) {
        bestD = near;
        best = p;
      }
    }
    if (!best) break;
    chosen.push(best);
  }
  return chosen;
}

/** 보철 점 중 구강스캔과 0.35mm 이내로 만나는 곳. 마진 라인 샘플. */
export function sampleProsthesisMargin(prosthesisPoints, scanPoints, max = 48) {
  if (!prosthesisPoints?.length || !scanPoints?.length) return [];
  const grid = buildGrid(scanPoints, 0.5);
  const step = Math.max(1, Math.floor(prosthesisPoints.length / 8000));
  const hits = [];
  for (let i = 0; i < prosthesisPoints.length; i += step) {
    const d = nearestDistance(grid, prosthesisPoints[i], 0.5, 2);
    if (d <= MARGIN_CONTACT_MM) hits.push(prosthesisPoints[i]);
  }
  return farthestSubset(hits, max).map((p) => ({
    x: round3(p[0]),
    y: round3(p[1]),
    z: round3(p[2]),
  }));
}

function fileExt(fileName) {
  const raw = String(fileName || "").trim().toLowerCase();
  const idx = raw.lastIndexOf(".");
  return idx >= 0 ? raw.slice(idx) : "";
}

function subsample(points, max) {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  const out = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]);
  return out;
}

function parseBinaryStl(buffer, maxPoints) {
  if (buffer.length < 84) return null;
  const count = buffer.readUInt32LE(80);
  if (count <= 0 || buffer.length < 84 + count * 50) return null;
  const points = [];
  const step = Math.max(1, Math.ceil(count / maxPoints));
  for (let i = 0; i < count; i += step) {
    const off = 84 + i * 50 + 12;
    const x = buffer.readFloatLE(off);
    const y = buffer.readFloatLE(off + 4);
    const z = buffer.readFloatLE(off + 8);
    if (![x, y, z].every(Number.isFinite)) continue;
    points.push([x, y, z]);
  }
  return points.length ? points : null;
}

function parseAsciiStl(buffer, maxPoints) {
  const text = buffer.toString("utf8");
  if (!/^\s*solid/i.test(text) || !/facet/i.test(text)) return null;
  const points = [];
  const re = /vertex\s+([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s+([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s+([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi;
  let match = re.exec(text);
  let acc = [];
  while (match) {
    acc.push([Number(match[1]), Number(match[2]), Number(match[3])]);
    if (acc.length === 3) {
      const c = [
        (acc[0][0] + acc[1][0] + acc[2][0]) / 3,
        (acc[0][1] + acc[1][1] + acc[2][1]) / 3,
        (acc[0][2] + acc[1][2] + acc[2][2]) / 3,
      ];
      if (c.every(Number.isFinite)) points.push(c);
      acc = [];
    }
    match = re.exec(text);
  }
  return points.length ? subsample(points, maxPoints) : null;
}

function parsePly(buffer, maxPoints) {
  const headerEnd = buffer.indexOf("end_header");
  if (headerEnd < 0) return null;
  const header = buffer.slice(0, headerEnd).toString("utf8");
  const vertexLine = header.match(/element\s+vertex\s+(\d+)/i);
  const count = Number(vertexLine?.[1] || 0);
  if (!count) return null;
  const props = [];
  let inVertex = false;
  for (const line of header.split(/\r?\n/)) {
    if (/^element\s+vertex/i.test(line)) {
      inVertex = true;
      continue;
    }
    if (/^element\s+/i.test(line)) inVertex = false;
    if (!inVertex) continue;
    const prop = line.match(/^property\s+(\w+)\s+(\w+)/i);
    if (prop) props.push({ type: prop[1].toLowerCase(), name: prop[2].toLowerCase() });
  }
  const ix = props.findIndex((p) => p.name === "x");
  const iy = props.findIndex((p) => p.name === "y");
  const iz = props.findIndex((p) => p.name === "z");
  if (ix < 0 || iy < 0 || iz < 0) return null;
  const binary = /format\s+binary_little_endian/i.test(header);
  if (!binary) {
    const body = buffer.slice(headerEnd + "end_header".length).toString("utf8");
    const lines = body.split(/\r?\n/).filter((line) => line.trim());
    const points = [];
    const step = Math.max(1, Math.ceil(count / maxPoints));
    for (let i = 0; i < count; i += step) {
      const cols = String(lines[i] || "").trim().split(/\s+/);
      const p = [Number(cols[ix]), Number(cols[iy]), Number(cols[iz])];
      if (p.every(Number.isFinite)) points.push(p);
    }
    return points.length ? points : null;
  }
  const sizeOf = (type) => {
    if (type === "float" || type === "float32" || type === "int" || type === "uint" || type === "int32" || type === "uint32") {
      return 4;
    }
    if (type === "double" || type === "float64") return 8;
    if (type === "short" || type === "ushort" || type === "int16" || type === "uint16") return 2;
    if (type === "char" || type === "uchar" || type === "int8" || type === "uint8") return 1;
    return 4;
  };
  let stride = 0;
  const offsets = props.map((prop) => {
    const offset = stride;
    stride += sizeOf(prop.type);
    return offset;
  });
  let cursor = headerEnd + "end_header".length;
  if (buffer[cursor] === 0x0a) cursor += 1;
  else if (buffer[cursor] === 0x0d) cursor += buffer[cursor + 1] === 0x0a ? 2 : 1;
  const points = [];
  const step = Math.max(1, Math.ceil(count / maxPoints));
  for (let i = 0; i < count; i += step) {
    const base = cursor + i * stride;
    if (base + stride > buffer.length) break;
    const read = (propIndex) => {
      const prop = props[propIndex];
      const off = base + offsets[propIndex];
      if (prop.type === "double" || prop.type === "float64") return buffer.readDoubleLE(off);
      return buffer.readFloatLE(off);
    };
    const p = [read(ix), read(iy), read(iz)];
    if (p.every(Number.isFinite)) points.push(p);
  }
  return points.length ? points : null;
}

function parseObj(buffer, maxPoints) {
  const text = buffer.toString("utf8");
  const points = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("v ") && !line.startsWith("v\t")) continue;
    const cols = line.trim().split(/\s+/);
    const point = [Number(cols[1]), Number(cols[2]), Number(cols[3])];
    if (point.every(Number.isFinite)) points.push(point);
  }
  return points.length ? subsample(points, maxPoints) : null;
}

/** STL·PLY·OBJ 꼭짓점 표본. DCM·해석 실패는 null. */
export function sampleMeshPoints(buffer, fileName, maxPoints = 2500) {
  if (!buffer || buffer.length < 8) return null;
  const ext = fileExt(fileName);
  if (ext === ".stl") {
    return parseBinaryStl(buffer, maxPoints) || parseAsciiStl(buffer, maxPoints);
  }
  if (ext === ".ply") return parsePly(buffer, maxPoints);
  if (ext === ".obj") return parseObj(buffer, maxPoints);
  return null;
}

export function archRoleFromTooth(tooth) {
  const match = String(tooth || "").match(/\d{2}/);
  if (!match) return "";
  const n = Number(match[0]);
  if (n >= 11 && n <= 28) return "upper";
  if (n >= 31 && n <= 48) return "lower";
  return "";
}
