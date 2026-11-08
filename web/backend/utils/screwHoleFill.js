// related files:
// - bg/pc1/rhino-server/compute/scripts/fill_screwholes.py
// - web/backend/controllers/requests/common.files.controller.js
// - web/backend/tests/unit/screwHoleFill.test.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
//
// filled STL(정렬 완료, 스크류홀 축 = 원점 Z축)의 상부 스크류홀 개구를 메운다.
// 채널 벽(법선이 축을 향하는 면)의 위쪽 경계를 찾고, 그 바깥 면에 맞춘 곡면으로 막는다.
// 중심 하나로 모으는 부채꼴은 림의 꺾임을 그대로 받아 홀 근처가 쭈글거린다.
// 메움은 포스트 다듬기 다음에 한다. 먼저 막으면 캡 테두리가 다듬기를 가로막는다.

/** 이 값의 attribute를 가진 삼각형은 HF 패치다(재실행 시 교체). */
export const HOLE_FILL_PATCH_ATTRIBUTE = 0x4846;

const WELD_EPS = 1e-5;
const WALL_MAX_RADIUS = 2.0;
const WALL_MIN_INWARD = 0.8;
const WALL_MAX_ABS_NZ = 0.55;
const WALL_MAX_RADIAL_STD = 0.25;
const MIN_AZIMUTH_COVERAGE = 0.85;
/** 림에서 중심까지 나누는 간격 수. 한 장 부채꼴이면 법선이 한 점에서 꺾인다. */
const RADIAL_STEPS = 6;
/** 림 높이를 주변 곡면으로 당기는 한도. 채널 벽 상단만 움직인다. */
const RIM_MOVE_MAX_MM = 0.08;
/** 림에 붙은 윗면 한 칸. 포스트 다듬기가 채널 모서리라 고정해 둔 자리. */
const LIP_BAND_MM = 0.35;
const LIP_MOVE_MAX_MM = 0.05;
/** 곡면 맞춤에 쓰는 림 바깥 띠. 이 점들은 옮기지 않아 다시 맞춰도 같은 곡면이 나온다. */
const FAR_INNER_MM = 0.4;
const FAR_OUTER_MM = 1.2;
const ALREADY_MM = 1e-4;

function parseAsciiStl(text) {
  const coords = [];
  const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
  let m;
  while ((m = re.exec(text))) {
    coords.push(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  const triCount = Math.floor(coords.length / 9);
  return {
    positions: Float64Array.from(coords.slice(0, triCount * 9)),
    attributes: new Uint16Array(triCount),
  };
}

export function parseStl(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length >= 84) {
    const triCount = buf.readUInt32LE(80);
    if (84 + triCount * 50 === buf.length) {
      const positions = new Float64Array(triCount * 9);
      const attributes = new Uint16Array(triCount);
      for (let t = 0; t < triCount; t += 1) {
        const off = 84 + t * 50 + 12;
        for (let k = 0; k < 9; k += 1) {
          positions[t * 9 + k] = buf.readFloatLE(off + k * 4);
        }
        attributes[t] = buf.readUInt16LE(off + 36);
      }
      return { positions, attributes };
    }
  }
  return parseAsciiStl(buf.toString("utf8"));
}

export function writeBinaryStl({ positions, attributes }) {
  const triCount = Math.floor(positions.length / 9);
  const out = Buffer.alloc(84 + triCount * 50);
  out.write("abuts.fit filled STL (HF)", 0, "ascii");
  out.writeUInt32LE(triCount, 80);
  for (let t = 0; t < triCount; t += 1) {
    const p = t * 9;
    const ux = positions[p + 3] - positions[p];
    const uy = positions[p + 4] - positions[p + 1];
    const uz = positions[p + 5] - positions[p + 2];
    const vx = positions[p + 6] - positions[p];
    const vy = positions[p + 7] - positions[p + 1];
    const vz = positions[p + 8] - positions[p + 2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    const off = 84 + t * 50;
    out.writeFloatLE(nx, off);
    out.writeFloatLE(ny, off + 4);
    out.writeFloatLE(nz, off + 8);
    for (let k = 0; k < 9; k += 1) {
      out.writeFloatLE(positions[p + k], off + 12 + k * 4);
    }
    out.writeUInt16LE(attributes?.[t] || 0, off + 48);
  }
  return out;
}

function weld(positions, triIndices) {
  const keyToIndex = new Map();
  const verts = [];
  const faces = new Int32Array(triIndices.length * 3);
  triIndices.forEach((t, fi) => {
    for (let k = 0; k < 3; k += 1) {
      const x = positions[t * 9 + k * 3];
      const y = positions[t * 9 + k * 3 + 1];
      const z = positions[t * 9 + k * 3 + 2];
      const key = `${Math.round(x / WELD_EPS)},${Math.round(y / WELD_EPS)},${Math.round(z / WELD_EPS)}`;
      let idx = keyToIndex.get(key);
      if (idx === undefined) {
        idx = verts.length / 3;
        verts.push(x, y, z);
        keyToIndex.set(key, idx);
      }
      faces[fi * 3 + k] = idx;
    }
  });
  return { verts: Float64Array.from(verts), faces };
}

function makeUnionFind(n) {
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i += 1) parent[i] = i;
  const find = (a) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  return { find, union };
}

function isLooseScrewCap(verts, faces, faceList, mainMaxZ) {
  if (faceList.length < 8 || faceList.length > 2500) return false;
  const seen = new Set();
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const f of faceList) {
    for (let k = 0; k < 3; k += 1) {
      const v = faces[f * 3 + k];
      if (seen.has(v)) continue;
      seen.add(v);
      if (Math.hypot(verts[v * 3], verts[v * 3 + 1]) > 2.7) return false;
      const z = verts[v * 3 + 2];
      if (z < zMin) zMin = z;
      if (z > zMax) zMax = z;
    }
  }
  return zMax - zMin <= 2.5 && zMin >= mainMaxZ - 2;
}

/**
 * HF 패치를 뺀 본체 삼각형.
 * dropDetached면 가장 큰 조각만 남긴다(채널 안에 떨어진 옛 원판).
 * 아니면 윗면에 떠 있는 스크류 캡만 뺀다. 원점 근처 수직 솔리드는 남긴다.
 */
function selectHostTriangles(positions, attributes, { dropDetached = true } = {}) {
  const triCount = Math.floor(positions.length / 9);
  const candidates = [];
  for (let t = 0; t < triCount; t += 1) {
    if (attributes[t] !== HOLE_FILL_PATCH_ATTRIBUTE) candidates.push(t);
  }
  const { verts, faces } = weld(positions, candidates);
  const uf = makeUnionFind(verts.length / 3);
  for (let f = 0; f < candidates.length; f += 1) {
    uf.union(faces[f * 3], faces[f * 3 + 1]);
    uf.union(faces[f * 3], faces[f * 3 + 2]);
  }
  const groups = new Map();
  for (let f = 0; f < candidates.length; f += 1) {
    const root = uf.find(faces[f * 3]);
    const list = groups.get(root);
    if (list) list.push(f);
    else groups.set(root, [f]);
  }
  let mainRoot = -1;
  let mainCount = -1;
  for (const [root, list] of groups) {
    if (list.length > mainCount) {
      mainRoot = root;
      mainCount = list.length;
    }
  }
  let mainMaxZ = -Infinity;
  if (mainRoot >= 0) {
    const seen = new Set();
    for (const f of groups.get(mainRoot)) {
      for (let k = 0; k < 3; k += 1) {
        const v = faces[f * 3 + k];
        if (seen.has(v)) continue;
        seen.add(v);
        if (verts[v * 3 + 2] > mainMaxZ) mainMaxZ = verts[v * 3 + 2];
      }
    }
  }
  const keptFaces = [];
  let removedDetached = 0;
  for (const [root, list] of groups) {
    if (root === mainRoot) {
      keptFaces.push(...list);
      continue;
    }
    if (dropDetached || isLooseScrewCap(verts, faces, list, mainMaxZ)) removedDetached += list.length;
    else keptFaces.push(...list);
  }
  keptFaces.sort((a, b) => a - b);
  return {
    kept: keptFaces.map((f) => candidates[f]),
    removedPatchTriangles: triCount - candidates.length,
    removedDetachedTriangles: removedDetached,
  };
}

function edgeKey(a, b) {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

function findUpperRimLoop(verts, faces) {
  const faceCount = faces.length / 3;
  const isWall = new Uint8Array(faceCount);
  for (let f = 0; f < faceCount; f += 1) {
    const a = faces[f * 3] * 3;
    const b = faces[f * 3 + 1] * 3;
    const c = faces[f * 3 + 2] * 3;
    const cx = (verts[a] + verts[b] + verts[c]) / 3;
    const cy = (verts[a + 1] + verts[b + 1] + verts[c + 1]) / 3;
    const rc = Math.hypot(cx, cy);
    if (rc < 1e-6 || rc > WALL_MAX_RADIUS) continue;
    const ux = verts[b] - verts[a];
    const uy = verts[b + 1] - verts[a + 1];
    const uz = verts[b + 2] - verts[a + 2];
    const vx = verts[c] - verts[a];
    const vy = verts[c + 1] - verts[a + 1];
    const vz = verts[c + 2] - verts[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-12) continue;
    const inward = -(nx * cx + ny * cy) / (len * rc);
    if (inward >= WALL_MIN_INWARD && Math.abs(nz / len) <= WALL_MAX_ABS_NZ) {
      isWall[f] = 1;
    }
  }

  const edgeFaces = new Map();
  for (let f = 0; f < faceCount; f += 1) {
    for (let k = 0; k < 3; k += 1) {
      const key = edgeKey(faces[f * 3 + k], faces[f * 3 + ((k + 1) % 3)]);
      const list = edgeFaces.get(key);
      if (list) list.push(f);
      else edgeFaces.set(key, [f]);
    }
  }

  // 벽 삼각형을 모서리 공유로 묶는다.
  const uf = makeUnionFind(faceCount);
  for (const list of edgeFaces.values()) {
    const walls = list.filter((f) => isWall[f]);
    for (let i = 1; i < walls.length; i += 1) uf.union(walls[0], walls[i]);
  }
  const components = new Map();
  for (let f = 0; f < faceCount; f += 1) {
    if (!isWall[f]) continue;
    const root = uf.find(f);
    const list = components.get(root);
    if (list) list.push(f);
    else components.set(root, [f]);
  }

  const bins = 72;
  let best = null;
  for (const list of components.values()) {
    const vset = new Set();
    for (const f of list) {
      vset.add(faces[f * 3]);
      vset.add(faces[f * 3 + 1]);
      vset.add(faces[f * 3 + 2]);
    }
    const covered = new Uint8Array(bins);
    let zMax = -Infinity;
    let sum = 0;
    let sumSq = 0;
    for (const v of vset) {
      const x = verts[v * 3];
      const y = verts[v * 3 + 1];
      const r = Math.hypot(x, y);
      sum += r;
      sumSq += r * r;
      zMax = Math.max(zMax, verts[v * 3 + 2]);
      const ang = Math.atan2(y, x);
      covered[Math.min(bins - 1, Math.floor(((ang + Math.PI) / (2 * Math.PI)) * bins))] = 1;
    }
    const n = vset.size;
    const rMean = sum / n;
    const rStd = Math.sqrt(Math.max(0, sumSq / n - rMean * rMean));
    const coverage = covered.reduce((s, v) => s + v, 0) / bins;
    if (coverage < MIN_AZIMUTH_COVERAGE || rStd > WALL_MAX_RADIAL_STD) continue;
    if (!best || zMax > best.zMax) {
      best = { faces: list, zMax, rMean, rStd };
    }
  }
  if (!best) return { ok: false, reason: "스크류홀 채널을 찾지 못했습니다." };

  const inChannel = new Set(best.faces);
  const adjacency = new Map();
  const addAdj = (a, b) => {
    const list = adjacency.get(a);
    if (list) list.push(b);
    else adjacency.set(a, [b]);
  };
  for (const [key, list] of edgeFaces) {
    const inside = list.filter((f) => inChannel.has(f)).length;
    if (inside === 0 || inside === list.length) continue;
    const [a, b] = key.split("_").map(Number);
    addAdj(a, b);
    addAdj(b, a);
  }

  // 경계 정점을 연결 성분(루프)으로 나눠 가장 높은 루프를 상부 개구로 본다.
  const seen = new Set();
  let upper = null;
  for (const start of adjacency.keys()) {
    if (seen.has(start)) continue;
    const comp = [];
    const stack = [start];
    while (stack.length) {
      const v = stack.pop();
      if (seen.has(v)) continue;
      seen.add(v);
      comp.push(v);
      for (const w of adjacency.get(v) || []) if (!seen.has(w)) stack.push(w);
    }
    if (comp.length < 8) continue;
    const zMean = comp.reduce((s, v) => s + verts[v * 3 + 2], 0) / comp.length;
    if (!upper || zMean > upper.zMean) upper = { vertices: comp, zMean };
  }
  if (!upper) return { ok: false, reason: "스크류홀 상부 개구를 찾지 못했습니다." };

  // 원기둥 위 루프라 축 기준 방위각 순서가 곧 루프 순서다(반시계).
  const ordered = upper.vertices
    .map((v) => ({
      v,
      ang: Math.atan2(verts[v * 3 + 1], verts[v * 3]),
    }))
    .sort((a, b) => a.ang - b.ang)
    .map((item) => item.v);

  const covered = new Uint8Array(bins);
  for (const v of ordered) {
    const ang = Math.atan2(verts[v * 3 + 1], verts[v * 3]);
    covered[Math.min(bins - 1, Math.floor(((ang + Math.PI) / (2 * Math.PI)) * bins))] = 1;
  }
  if (covered.reduce((s, v) => s + v, 0) / bins < MIN_AZIMUTH_COVERAGE) {
    return { ok: false, reason: "스크류홀 상부 개구가 닫힌 루프가 아닙니다." };
  }

  return {
    ok: true,
    loop: ordered,
    channelRadius: best.rMean,
    channelRadialStd: best.rStd,
    channelTopZ: best.zMax,
    isWall,
  };
}

function solveLinear(n, matrix, rhs) {
  const m = n + 1;
  const a = new Float64Array(n * m);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) a[i * m + j] = matrix[i * n + j];
    a[i * m + n] = rhs[i];
  }
  for (let col = 0; col < n; col += 1) {
    let piv = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(a[r * m + col]) > Math.abs(a[piv * m + col])) piv = r;
    }
    if (Math.abs(a[piv * m + col]) < 1e-14) return null;
    if (piv !== col) {
      for (let j = 0; j < m; j += 1) {
        const t = a[col * m + j];
        a[col * m + j] = a[piv * m + j];
        a[piv * m + j] = t;
      }
    }
    const div = a[col * m + col];
    for (let r = col + 1; r < n; r += 1) {
      const f = a[r * m + col] / div;
      if (!f) continue;
      for (let j = col; j < m; j += 1) a[r * m + j] -= f * a[col * m + j];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r -= 1) {
    let s = a[r * m + n];
    for (let j = r + 1; j < n; j += 1) s -= a[r * m + j] * x[j];
    x[r] = s / a[r * m + r];
  }
  return x;
}

/** 주변 점의 높이를 평면 또는 2차 곡면으로 맞춘다. 홀 안은 이 곡면의 연장이다. */
function fitSurface(samples) {
  const n = samples.length;
  if (n < 3) return null;
  let cx = 0;
  let cy = 0;
  let zMean = 0;
  for (const p of samples) {
    cx += p[0];
    cy += p[1];
    zMean += p[2];
  }
  cx /= n;
  cy /= n;
  zMean /= n;
  const quad = n >= 12;
  const terms = quad ? 6 : 3;
  const matrix = new Float64Array(terms * terms);
  const rhs = new Float64Array(terms);
  for (const p of samples) {
    const x = p[0] - cx;
    const y = p[1] - cy;
    const basis = quad ? [1, x, y, x * x, x * y, y * y] : [1, x, y];
    for (let i = 0; i < terms; i += 1) {
      rhs[i] += basis[i] * p[2];
      for (let j = 0; j < terms; j += 1) matrix[i * terms + j] += basis[i] * basis[j];
    }
  }
  if (quad) {
    const ridge = 1e-4 * n;
    matrix[3 * terms + 3] += ridge;
    matrix[4 * terms + 4] += ridge;
    matrix[5 * terms + 5] += ridge;
  }
  const coef = solveLinear(terms, matrix, rhs);
  if (!coef) return () => zMean;
  return (x, y) => {
    const u = x - cx;
    const v = y - cy;
    let z = coef[0] + coef[1] * u + coef[2] * v;
    if (quad) z += coef[3] * u * u + coef[4] * u * v + coef[5] * v * v;
    return z;
  };
}

function posKey(x, y, z) {
  return `${Math.round(x / WELD_EPS)},${Math.round(y / WELD_EPS)},${Math.round(z / WELD_EPS)}`;
}

function clampHeight(z, target, maxMove, already = ALREADY_MM) {
  const dz = target - z;
  if (Math.abs(dz) < already) return z;
  const clamped = Math.max(-maxMove, Math.min(maxMove, dz));
  return Math.fround(z + clamped);
}

function triNz(a, b, c) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  return ux * vy - uy * vx;
}

/**
 * 림 바깥 면에 맞춘 곡면 캡. 경계는 림 정점(높이는 곡면으로 살짝 당김)이라 본체와 맞닿는다.
 * @returns {{ replace: Map<string, number>, tris: number[][][], movedMax: number } | null}
 */
function buildSmoothCap(verts, faces, rim) {
  const loop = rim.loop;
  const n = loop.length;
  const faceCount = faces.length / 3;
  const isWall = rim.isWall;
  const rimSet = new Set(loop);
  const adj = new Map();
  const link = (a, b) => {
    const list = adj.get(a);
    if (list) list.push(b);
    else adj.set(a, [b]);
  };
  for (let f = 0; f < faceCount; f += 1) {
    if (isWall?.[f]) continue;
    const a = faces[f * 3];
    const b = faces[f * 3 + 1];
    const c = faces[f * 3 + 2];
    link(a, b);
    link(b, a);
    link(b, c);
    link(c, b);
    link(c, a);
    link(a, c);
  }
  const dist = new Map();
  const queue = [];
  for (const v of loop) {
    dist.set(v, 0);
    queue.push(v);
  }
  let head = 0;
  while (head < queue.length) {
    const v = queue[head];
    head += 1;
    const base = dist.get(v);
    if (base > FAR_OUTER_MM) continue;
    for (const nb of adj.get(v) || []) {
      if (dist.has(nb)) continue;
      const step = Math.hypot(verts[nb * 3] - verts[v * 3], verts[nb * 3 + 1] - verts[v * 3 + 1], verts[nb * 3 + 2] - verts[v * 3 + 2]);
      const next = base + step;
      if (next > FAR_OUTER_MM + 0.25) continue;
      dist.set(nb, next);
      queue.push(nb);
    }
  }
  const far = [];
  const lip = [];
  for (const [v, d] of dist) {
    if (rimSet.has(v)) continue;
    if (d > 0 && d <= LIP_BAND_MM) lip.push(v);
    else if (d >= FAR_INNER_MM && d <= FAR_OUTER_MM) far.push([verts[v * 3], verts[v * 3 + 1], verts[v * 3 + 2]]);
  }
  const samples = far.length >= 8 ? far : loop.map((v) => [verts[v * 3], verts[v * 3 + 1], verts[v * 3 + 2]]);
  const surface = fitSurface(samples);
  if (!surface) return null;

  const replace = new Map();
  let movedMax = 0;
  const remember = (v, z1) => {
    const z0 = verts[v * 3 + 2];
    if (z1 === z0) return;
    movedMax = Math.max(movedMax, Math.abs(z1 - z0));
    replace.set(posKey(verts[v * 3], verts[v * 3 + 1], z0), z1);
  };
  const faired = loop.map((v) => {
    const x = verts[v * 3];
    const y = verts[v * 3 + 1];
    const z = clampHeight(verts[v * 3 + 2], surface(x, y), RIM_MOVE_MAX_MM);
    remember(v, z);
    return [x, y, z];
  });
  // 이미 다듬어진 꼭짓점(곡면에서 0.02mm 안)은 그대로 둔다. 그보다 거친 림 옆만 곡면으로 당긴다.
  for (const v of lip) {
    const x = verts[v * 3];
    const y = verts[v * 3 + 1];
    const z = clampHeight(verts[v * 3 + 2], surface(x, y), LIP_MOVE_MAX_MM, 0.02);
    remember(v, z);
  }

  let cx = 0;
  let cy = 0;
  for (const p of faired) {
    cx += p[0];
    cy += p[1];
  }
  cx = Math.fround(cx / n);
  cy = Math.fround(cy / n);
  const rings = [faired];
  for (let k = 1; k < RADIAL_STEPS; k += 1) {
    const s = 1 - k / RADIAL_STEPS;
    const ring = [];
    for (let i = 0; i < n; i += 1) {
      const [rx, ry, rz] = faired[i];
      const x = Math.fround(cx + s * (rx - cx));
      const y = Math.fround(cy + s * (ry - cy));
      const residual = rz - surface(rx, ry);
      ring.push([x, y, Math.fround(surface(x, y) + residual * s ** 4)]);
    }
    rings.push(ring);
  }
  const center = [cx, cy, Math.fround(surface(cx, cy))];
  const tris = [];
  for (let k = 0; k < RADIAL_STEPS - 1; k += 1) {
    const outer = rings[k];
    const inner = rings[k + 1];
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      tris.push([outer[i], outer[j], inner[j]], [outer[i], inner[j], inner[i]]);
    }
  }
  const last = rings[RADIAL_STEPS - 1];
  for (let i = 0; i < n; i += 1) tris.push([last[i], last[(i + 1) % n], center]);
  if (tris.length && triNz(tris[0][0], tris[0][1], tris[0][2]) < 0) {
    for (const t of tris) [t[1], t[2]] = [t[2], t[1]];
  }
  return { replace, tris, movedMax, faired };
}

/**
 * filled STL 버퍼의 상부 스크류홀을 메운 새 STL 버퍼를 만든다.
 * 이전 HF 패치와, dropDetached면 본체에서 떨어진 조각(Rhino 패치)을 교체한다.
 * 파이프라인은 dropDetached를 끄고 윗면에 떠 있는 캡만 바꾼다.
 */
export function fillUpperScrewHole(buffer, { dropDetached = true } = {}) {
  const { positions, attributes } = parseStl(buffer);
  const triCount = Math.floor(positions.length / 9);
  if (triCount < 100) {
    return { ok: false, reason: "STL 삼각형이 너무 적습니다." };
  }

  const host = selectHostTriangles(positions, attributes, { dropDetached });
  const { verts, faces } = weld(positions, host.kept);
  const rim = findUpperRimLoop(verts, faces);
  if (!rim.ok) return { ok: false, reason: rim.reason };
  const cap = buildSmoothCap(verts, faces, rim);
  if (!cap) return { ok: false, reason: "스크류홀 캡 곡면을 만들지 못했습니다." };

  const patchCount = cap.tris.length;
  const outCount = host.kept.length + patchCount;
  const outPositions = new Float64Array(outCount * 9);
  const outAttributes = new Uint16Array(outCount);
  host.kept.forEach((t, i) => {
    for (let k = 0; k < 3; k += 1) {
      const o = i * 9 + k * 3;
      const x = positions[t * 9 + k * 3];
      const y = positions[t * 9 + k * 3 + 1];
      const z = positions[t * 9 + k * 3 + 2];
      const z1 = cap.replace.get(posKey(x, y, z));
      outPositions[o] = x;
      outPositions[o + 1] = y;
      outPositions[o + 2] = z1 === undefined ? z : z1;
    }
    outAttributes[i] = attributes[t] || 0;
  });
  cap.tris.forEach((tri, i) => {
    const o = (host.kept.length + i) * 9;
    outPositions.set(tri.flat(), o);
    outAttributes[host.kept.length + i] = HOLE_FILL_PATCH_ATTRIBUTE;
  });

  let rimZMin = Infinity;
  let rimZMax = -Infinity;
  for (const p of cap.faired) {
    rimZMin = Math.min(rimZMin, p[2]);
    rimZMax = Math.max(rimZMax, p[2]);
  }

  return {
    ok: true,
    buffer: writeBinaryStl({ positions: outPositions, attributes: outAttributes }),
    stats: {
      inputTriangles: triCount,
      outputTriangles: outCount,
      removedPatchTriangles: host.removedPatchTriangles,
      removedDetachedTriangles: host.removedDetachedTriangles,
      patchTriangles: patchCount,
      radialSteps: RADIAL_STEPS,
      channelDiameter: Number((rim.channelRadius * 2).toFixed(3)),
      rimZMin: Number(rimZMin.toFixed(3)),
      rimZMax: Number(rimZMax.toFixed(3)),
      rimMovedMaxUm: Math.round(cap.movedMax * 1e4) / 10,
    },
  };
}
