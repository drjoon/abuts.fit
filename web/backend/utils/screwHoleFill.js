// related files:
// - bg/pc1/rhino-server/compute/scripts/fill_screwholes.py
// - web/backend/controllers/requests/common.files.controller.js
// - web/backend/tests/unit/screwHoleFill.test.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
//
// filled STL(정렬 완료, 스크류홀 축 = 원점 Z축)의 상부 스크류홀 개구를 메운다.
// Rhino fill_screwholes.py는 지름 2.5mm 탐사 원을 -Z로 투사해 루프를 찾는데,
// 채널이 그보다 넓으면 원이 채널로 떨어져 시트 턱에 패치가 붙는다.
// 여기서는 채널 벽(법선이 축을 향하는 면)의 위쪽 경계를 메시 정점 그대로 찾아 캡을 붙인다.

/** 이 값의 attribute를 가진 삼각형은 HF 패치다(재실행 시 교체). */
export const HOLE_FILL_PATCH_ATTRIBUTE = 0x4846;

const WELD_EPS = 1e-5;
const WALL_MAX_RADIUS = 2.0;
const WALL_MIN_INWARD = 0.8;
const WALL_MAX_ABS_NZ = 0.55;
const WALL_MAX_RADIAL_STD = 0.25;
const MIN_AZIMUTH_COVERAGE = 0.85;

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

/** HF 패치와 본체에서 떨어진 조각(이전 Rhino 패치 등)을 제거한 삼각형 인덱스. */
function selectHostTriangles(positions, attributes) {
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
  const counts = new Map();
  for (let f = 0; f < candidates.length; f += 1) {
    const root = uf.find(faces[f * 3]);
    counts.set(root, (counts.get(root) || 0) + 1);
  }
  let mainRoot = -1;
  let mainCount = -1;
  for (const [root, count] of counts) {
    if (count > mainCount) {
      mainRoot = root;
      mainCount = count;
    }
  }
  const kept = candidates.filter((_, f) => uf.find(faces[f * 3]) === mainRoot);
  return {
    kept,
    removedPatchTriangles: triCount - candidates.length,
    removedDetachedTriangles: candidates.length - kept.length,
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
  };
}

/**
 * filled STL 버퍼의 상부 스크류홀을 메운 새 STL 버퍼를 만든다.
 * 이전 HF 패치와 본체에서 떨어진 조각(Rhino 패치)은 교체한다.
 */
export function fillUpperScrewHole(buffer) {
  const { positions, attributes } = parseStl(buffer);
  const triCount = Math.floor(positions.length / 9);
  if (triCount < 100) {
    return { ok: false, reason: "STL 삼각형이 너무 적습니다." };
  }

  const host = selectHostTriangles(positions, attributes);
  const { verts, faces } = weld(positions, host.kept);
  const rim = findUpperRimLoop(verts, faces);
  if (!rim.ok) return { ok: false, reason: rim.reason };

  const loop = rim.loop;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const v of loop) {
    cx += verts[v * 3];
    cy += verts[v * 3 + 1];
    cz += verts[v * 3 + 2];
  }
  cx /= loop.length;
  cy /= loop.length;
  cz /= loop.length;

  const patchCount = loop.length;
  const outCount = host.kept.length + patchCount;
  const outPositions = new Float64Array(outCount * 9);
  const outAttributes = new Uint16Array(outCount);
  host.kept.forEach((t, i) => {
    for (let k = 0; k < 9; k += 1) outPositions[i * 9 + k] = positions[t * 9 + k];
  });
  // 반시계 루프 + 중심 부채꼴 → 법선 +Z(상부 캡 바깥쪽)
  for (let i = 0; i < patchCount; i += 1) {
    const a = loop[i];
    const b = loop[(i + 1) % patchCount];
    const o = (host.kept.length + i) * 9;
    outPositions.set(
      [
        cx, cy, cz,
        verts[a * 3], verts[a * 3 + 1], verts[a * 3 + 2],
        verts[b * 3], verts[b * 3 + 1], verts[b * 3 + 2],
      ],
      o,
    );
    outAttributes[host.kept.length + i] = HOLE_FILL_PATCH_ATTRIBUTE;
  }

  let rimZMin = Infinity;
  let rimZMax = -Infinity;
  for (const v of loop) {
    rimZMin = Math.min(rimZMin, verts[v * 3 + 2]);
    rimZMax = Math.max(rimZMax, verts[v * 3 + 2]);
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
      channelDiameter: Number((rim.channelRadius * 2).toFixed(3)),
      rimZMin: Number(rimZMin.toFixed(3)),
      rimZMax: Number(rimZMax.toFixed(3)),
    },
  };
}
