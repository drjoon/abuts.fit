// related files:
// - bg/pc1/rhino-server/compute/scripts/fill_screwholes.py
// - web/backend/services/abutmentStl/cuffBlend.js
// - web/backend/controllers/requests/common.files.controller.js
// - web/backend/tests/unit/screwHoleFill.test.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
//
// filled STL(정렬 완료, 스크류홀 축 = 원점 Z축)의 상부 스크류홀 개구를 메운다.
// 채널 벽 바로 밖의 좁은 모따기(0.01mm)와 길쭉한 부채꼴 삼각형을 원기둥 절단면(splitByLevel)으로 걷어내고,
// CuffBlend처럼 둘레 저역 통과·경계 법선 기울기(G1) 맞춤 곡면으로 메운다.
// 외측 면은 하나도 밖으로 나가지 않고, 칼라 구간은 안쪽으로 최대 5µm만 당긴다.

/** 이 값의 attribute를 가진 삼각형은 HF 패치다(재실행 시 교체). */
export const HOLE_FILL_PATCH_ATTRIBUTE = 0x4846;

const WELD_EPS = 1e-5;
const WALL_MAX_RADIUS = 2.0;
const WALL_MIN_INWARD = 0.85;
/** 채널 벽은 수직 원기둥(|nz|≈0)이다. 기울어진 외측 포스트 면(0.3~0.5)이 섞이지 않게 0.2로 제한한다. */
const WALL_MAX_ABS_NZ = 0.2;
const WALL_MAX_RADIAL_STD = 0.25;
const MIN_AZIMUTH_COVERAGE = 0.85;
/** 채널 반경에서 벗어난(나팔 입구) 정점 비율 상한. */
const WALL_MAX_FLARE_SHARE = 0.3;
/** 포스트 다듬기 패치(0x5053)는 외측 포스트 면이므로 채널 벽 후보에서 뺀다. */
const POST_SMOOTH_PATCH_ATTRIBUTE = 0x5053;
/** 채널 벽 반경에서 이만큼 바깥 원기둥으로 잘라 0.01mm 모따기 띠를 걷어낸다. */
const CUT_COLLAR_MM = 0.025;
/** 둘레 각도 격자(2° 간격, 180열). */
const CAP_COLUMNS = 180;
/** 반경 방향 고리 수. */
const RADIAL_STEPS = 12;
/** 칼라 구간에서 안쪽으로 당기는 최대 깊이(5µm). 외측으로는 나가지 않는다. */
const MAX_INWARD_MM = 0.005;
const TWO_PI = Math.PI * 2;

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
  for (let fi = 0; fi < triIndices.length; fi += 1) {
    const t = triIndices[fi];
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
  }
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
      for (let i = 0; i < list.length; i += 1) keptFaces.push(list[i]);
      continue;
    }
    if (dropDetached || isLooseScrewCap(verts, faces, list, mainMaxZ)) {
      removedDetached += list.length;
    } else {
      for (let i = 0; i < list.length; i += 1) keptFaces.push(list[i]);
    }
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

function findUpperRimLoop(verts, faces, attributes, kept) {
  const faceCount = faces.length / 3;
  const isWall = new Uint8Array(faceCount);
  for (let f = 0; f < faceCount; f += 1) {
    if (kept && attributes?.[kept[f]] === POST_SMOOTH_PATCH_ATTRIBUTE) continue;
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
    if (
      rc > 1e-6 &&
      rc <= WALL_MAX_RADIUS &&
      inward >= WALL_MIN_INWARD &&
      Math.abs(nz / len) <= WALL_MAX_ABS_NZ
    ) {
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
    const radii = [];
    for (const v of vset) {
      const x = verts[v * 3];
      const y = verts[v * 3 + 1];
      radii.push(Math.hypot(x, y));
      zMax = Math.max(zMax, verts[v * 3 + 2]);
      const ang = Math.atan2(y, x);
      covered[Math.min(bins - 1, Math.floor(((ang + Math.PI) / TWO_PI) * bins))] = 1;
    }
    // 입구가 나팔처럼 벌어진 채널도 있어서 중앙값 근처 정점으로 채널 반경을 잰다.
    // 정상 반경(중앙값 ±0.25mm) 정점이 대부분이면 채널 벽이다.
    const sortedR = radii.slice().sort((x, y) => x - y);
    const rMed = sortedR[Math.floor(sortedR.length / 2)];
    const inliers = radii.filter((r) => Math.abs(r - rMed) <= WALL_MAX_RADIAL_STD);
    let sum = 0;
    let sumSq = 0;
    for (const r of inliers) {
      sum += r;
      sumSq += r * r;
    }
    const n = inliers.length || 1;
    const rMean = sum / n;
    const rStd = Math.sqrt(Math.max(0, sumSq / n - rMean * rMean));
    const flareShare = 1 - inliers.length / radii.length;
    const coverage = covered.reduce((s, v) => s + v, 0) / bins;
    if (coverage < MIN_AZIMUTH_COVERAGE || rStd > WALL_MAX_RADIAL_STD || flareShare > WALL_MAX_FLARE_SHARE) continue;
    if (!best || zMax > best.zMax) {
      best = { faces: list, zMax, rMean, rStd };
    }
  }
  if (!best) return { ok: false, reason: "스크류홀 채널을 찾지 못했습니다." };

  const inChannel = new Set(best.faces);
  const channelWall = new Uint8Array(faceCount);
  for (const f of best.faces) channelWall[f] = 1;
  const adjacency = new Map();
  const addAdj = (a, b) => {
    const list = adjacency.get(a);
    if (list) list.push(b);
    else adjacency.set(a, [b]);
  };
  for (const [key, list] of edgeFaces) {
    const inside = list.filter((f) => inChannel.has(f)).length;
    if (inside === 0) continue;
    // 이전 HF 패치를 걷어낸 자리라 바깥 비벽 면이 이미 잘려 나간 경우에도
    // 채널 벽의 열린 테두리(inside === list.length === 1)는 상부 개구 경계다.
    if (inside === list.length && list.length > 1) continue;
    const [a, b] = key.split("_").map(Number);
    addAdj(a, b);
    addAdj(b, a);
  }

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
    // 나팔 입구 끝에 붙은 작은 조각이 가장 높아도 둘레를 두르지 못하면 개구 후보가 아니다.
    const compCovered = new Uint8Array(bins);
    for (const v of comp) {
      const ang = Math.atan2(verts[v * 3 + 1], verts[v * 3]);
      compCovered[Math.min(bins - 1, Math.floor(((ang + Math.PI) / TWO_PI) * bins))] = 1;
    }
    const compCoverage = compCovered.reduce((s, v) => s + v, 0) / bins;
    if (compCoverage < MIN_AZIMUTH_COVERAGE) continue;
    if (!upper || zMean > upper.zMean) upper = { vertices: comp, zMean };
  }
  if (!upper) return { ok: false, reason: "스크류홀 상부 개구를 찾지 못했습니다." };

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
    covered[Math.min(bins - 1, Math.floor(((ang + Math.PI) / TWO_PI) * bins))] = 1;
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
    isWall: channelWall,
  };
}

function wrapAngle(a) {
  let t = a % TWO_PI;
  if (t < 0) t += TWO_PI;
  return t;
}

function fourierCoeffs(arr, K) {
  const N = arr.length;
  const re = new Float64Array(K + 1);
  const im = new Float64Array(K + 1);
  for (let h = 0; h <= K; h += 1) {
    let r = 0;
    let m = 0;
    for (let j = 0; j < N; j += 1) {
      const ang = h * (-Math.PI + (TWO_PI * j) / N);
      r += arr[j] * Math.cos(ang);
      m += arr[j] * Math.sin(ang);
    }
    const w = (h === 0 ? 1 : 2) / N;
    re[h] = r * w;
    im[h] = m * w;
  }
  return { re, im };
}

function evalFourierGrid(c, K, N, sPow = () => 1) {
  const out = new Float64Array(N);
  for (let h = 0; h <= K; h += 1) {
    const p = sPow(h);
    for (let j = 0; j < N; j += 1) {
      const ang = h * (-Math.PI + (TWO_PI * j) / N);
      out[j] += p * (c.re[h] * Math.cos(ang) + c.im[h] * Math.sin(ang));
    }
  }
  return out;
}

/**
 * CuffBlend의 angularRow + zipperRows와 같은 방식으로 바깥 절단 루프와 첫 내부 고리를 빈틈없이 잇는다.
 */
function angularRowFromLoop(loop, vs) {
  const ang = loop.map((v) => Math.atan2(vs[v * 3 + 1], vs[v * 3]));
  const steps = ang.map((a, i) => {
    let d = ang[(i + 1) % ang.length] - a;
    if (d > Math.PI) d -= TWO_PI;
    if (d < -Math.PI) d += TWO_PI;
    return d;
  });
  const turn = steps.reduce((s, d) => s + d, 0);
  const dir = Math.sign(turn);
  if (!dir) return null;
  let order = loop.map((_, i) => i);
  if (dir < 0) order = order.reverse();
  let start = 0;
  for (let i = 1; i < order.length; i += 1) {
    if (wrapAngle(ang[order[i]]) < wrapAngle(ang[order[start]])) start = i;
  }
  order = [...order.slice(start), ...order.slice(0, start)];
  const out = [];
  let acc = wrapAngle(ang[order[0]]);
  for (let i = 0; i < order.length; i += 1) {
    if (i > 0) {
      let d = ang[order[i]] - ang[order[i - 1]];
      if (d > Math.PI) d -= TWO_PI;
      if (d < -Math.PI) d += TWO_PI;
      if (d <= 0) d = 1e-5;
      acc += d;
    }
    const v = loop[order[i]];
    out.push({ p: [vs[v * 3], vs[v * 3 + 1], vs[v * 3 + 2]], a: acc });
  }
  return out;
}

function zipperPointRows(outerRow, innerRow, emit) {
  const A = outerRow.length;
  const B = innerRow.length;
  let i = 0;
  let j = 0;
  const angA = (k) => outerRow[k % A].a + Math.floor(k / A) * TWO_PI;
  const angB = (k) => innerRow[k % B].a + Math.floor(k / B) * TWO_PI;
  while (i < A || j < B) {
    const nextA = i < A ? (angA(i) + angA(i + 1)) / 2 : Infinity;
    const nextB = j < B ? (angB(j) + angB(j + 1)) / 2 : Infinity;
    if (nextA <= nextB) {
      emit(outerRow[i % A].p, outerRow[(i + 1) % A].p, innerRow[j % B].p);
      i += 1;
    } else {
      emit(outerRow[i % A].p, innerRow[(j + 1) % B].p, innerRow[j % B].p);
      j += 1;
    }
  }
}

/**
 * 채널 림 바로 밖(r = rChan + CUT_COLLAR_MM)을 원기둥으로 잘라 0.01mm 모따기 띠와 길쭉한 부채꼴 면을 걷어내고,
 * 둘레 저역 통과 + 경계 법선 기울기(G1) 맞춤 곡면으로 메운다.
 * 절단이 닫힌 루프를 만들지 못하는 합성 메시(단순 원통 튜브 등)는 림 정점 그대로 메운다.
 */
function buildCuffStyleCap(verts, faces, attributes, kept, rim, { alreadyPatched = false } = {}) {
  const fc = faces.length / 3;
  const nv = verts.length / 3;
  const isWall = rim.isWall;
  const rimVerts = new Set(rim.loop);
  const rChan = rim.channelRadius;

  // 이전 HF 패치를 걷어낸 자리에 바깥 절단 테두리(열린 비벽 변)가 이미 남아 있으면 그대로 쓴다.
  let existingOuterLoop = null;
  if (alreadyPatched) {
    const nonWallEdgeCount = new Map();
    const openAdj = new Map();
    const addOpen = (a, b) => {
      const list = openAdj.get(a);
      if (list) list.push(b);
      else openAdj.set(a, [b]);
    };
    for (let f = 0; f < fc; f += 1) {
      if (isWall?.[f]) continue;
      const a = faces[f * 3];
      const b = faces[f * 3 + 1];
      const c = faces[f * 3 + 2];
      for (const [u, w] of [[a, b], [b, c], [c, a]]) {
        const key = edgeKey(u, w);
        nonWallEdgeCount.set(key, (nonWallEdgeCount.get(key) || 0) + 1);
      }
    }
    for (let f = 0; f < fc; f += 1) {
      if (isWall?.[f]) continue;
      const a = faces[f * 3];
      const b = faces[f * 3 + 1];
      const c = faces[f * 3 + 2];
      for (const [u, w] of [[a, b], [b, c], [c, a]]) {
        if (nonWallEdgeCount.get(edgeKey(u, w)) !== 1) continue;
        const ru = Math.hypot(verts[u * 3], verts[u * 3 + 1]);
        const rw = Math.hypot(verts[w * 3], verts[w * 3 + 1]);
        if (ru > 2.2 || rw > 2.2) continue;
        if (verts[u * 3 + 2] < Math.max(3.5, rim.channelTopZ - 8)) continue;
        addOpen(u, w);
        addOpen(w, u);
      }
    }
    const seenOpen = new Set();
    let bestComp = null;
    for (const start of openAdj.keys()) {
      if (seenOpen.has(start)) continue;
      const comp = [];
      const stack = [start];
      while (stack.length) {
        const v = stack.pop();
        if (seenOpen.has(v)) continue;
        seenOpen.add(v);
        comp.push(v);
        for (const w of openAdj.get(v) || []) if (!seenOpen.has(w)) stack.push(w);
      }
      if (comp.length < 24) continue;
      const bins = new Uint8Array(72);
      for (const v of comp) {
        const ang = Math.atan2(verts[v * 3 + 1], verts[v * 3]);
        bins[Math.min(71, Math.floor(((ang + Math.PI) / TWO_PI) * 72))] = 1;
      }
      if (bins.reduce((s, v) => s + v, 0) / 72 < MIN_AZIMUTH_COVERAGE) continue;
      if (!bestComp || comp.length > bestComp.length) bestComp = comp;
    }
    if (bestComp) {
      existingOuterLoop = bestComp
        .map((v) => ({ v, ang: Math.atan2(verts[v * 3 + 1], verts[v * 3]) }))
        .sort((a, b) => a.ang - b.ang)
        .map((item) => item.v);
    }
  }

  // 림(또는 이미 잘린 바깥 테두리)에서 비벽 면을 따라 표면 거리를 잰다.
  const dist = new Float64Array(nv).fill(Infinity);
  const queue = existingOuterLoop ? [...existingOuterLoop] : [...rim.loop];
  for (const v of queue) dist[v] = 0;
  const adj = Array.from({ length: nv }, () => []);
  for (let f = 0; f < fc; f += 1) {
    if (isWall?.[f]) continue;
    const a = faces[f * 3];
    const b = faces[f * 3 + 1];
    const c = faces[f * 3 + 2];
    adj[a].push(b, c);
    adj[b].push(a, c);
    adj[c].push(a, b);
  }
  let head = 0;
  while (head < queue.length) {
    const u = queue[head];
    head += 1;
    if (dist[u] > 1.2) continue;
    for (const w of adj[u]) {
      const step = Math.hypot(
        verts[w * 3] - verts[u * 3],
        verts[w * 3 + 1] - verts[u * 3 + 1],
        verts[w * 3 + 2] - verts[u * 3 + 2],
      );
      if (dist[u] + step < dist[w]) {
        dist[w] = dist[u] + step;
        queue.push(w);
      }
    }
  }

  // 0.01mm 모따기 정점이 있는 기공소 메시는 rCut = rChan + 0.025로 자른다.
  let hasMicroChamfer = Boolean(
    existingOuterLoop &&
      Math.hypot(verts[existingOuterLoop[0] * 3], verts[existingOuterLoop[0] * 3 + 1]) - rChan > 0.005,
  );
  if (!existingOuterLoop) {
    for (let v = 0; v < nv; v += 1) {
      if (rimVerts.has(v) || dist[v] > 0.05) continue;
      const dr = Math.hypot(verts[v * 3], verts[v * 3 + 1]) - rChan;
      if (dr > 0.002 && dr < CUT_COLLAR_MM) {
        hasMicroChamfer = true;
        break;
      }
    }
  }

  const rCut = hasMicroChamfer ? rChan + CUT_COLLAR_MM : rChan;
  const vs = Array.from(verts);
  const outHostTris = [];
  const outHostAttrs = [];
  let cutLoop = null;
  let edgeFace = null;

  if (existingOuterLoop) {
    cutLoop = existingOuterLoop;
    edgeFace = new Map();
    for (let f = 0; f < fc; f += 1) {
      const a = faces[f * 3];
      const b = faces[f * 3 + 1];
      const c = faces[f * 3 + 2];
      const fi = outHostTris.length;
      outHostTris.push([a, b, c]);
      outHostAttrs.push(attributes[kept[f]] || 0);
      if (!isWall?.[f]) {
        edgeFace.set(`${a}_${b}`, fi);
        edgeFace.set(`${b}_${c}`, fi);
        edgeFace.set(`${c}_${a}`, fi);
      }
    }
  } else if (hasMicroChamfer) {
    const values = new Float64Array(nv);
    for (let v = 0; v < nv; v += 1) {
      let val = rimVerts.has(v)
        ? -1e-4
        : dist[v] < 1.0
          ? Math.hypot(vs[v * 3], vs[v * 3 + 1]) - rCut
          : 1;
      if (Math.abs(val) < 1e-7) val = 1e-7;
      values[v] = val;
    }
    const cache = new Map();
    const mid = (ia, ib) => {
      const key = ia < ib ? `${ia}_${ib}` : `${ib}_${ia}`;
      if (cache.has(key)) return cache.get(key);
      let lo = 0;
      let hi = 1;
      let flo = values[ia];
      const fhi = values[ib];
      if (flo * fhi < 0 && dist[ia] < 1.0 && dist[ib] < 1.0) {
        for (let i = 0; i < 24; i += 1) {
          const m = (lo + hi) / 2;
          const x = vs[ia * 3] + m * (vs[ib * 3] - vs[ia * 3]);
          const y = vs[ia * 3 + 1] + m * (vs[ib * 3 + 1] - vs[ia * 3 + 1]);
          const f = Math.hypot(x, y) - rCut;
          if (f * flo > 0) {
            lo = m;
            flo = f;
          } else {
            hi = m;
          }
        }
      }
      const t = (lo + hi) / 2;
      const idx = vs.length / 3;
      vs.push(
        Math.fround(vs[ia * 3] + t * (vs[ib * 3] - vs[ia * 3])),
        Math.fround(vs[ia * 3 + 1] + t * (vs[ib * 3 + 1] - vs[ia * 3 + 1])),
        Math.fround(vs[ia * 3 + 2] + t * (vs[ib * 3 + 2] - vs[ia * 3 + 2])),
      );
      cache.set(key, idx);
      return idx;
    };
    const keptEdges = new Map();
    const removedEdges = [];
    for (let f = 0; f < fc; f += 1) {
      const a = faces[f * 3];
      const b = faces[f * 3 + 1];
      const c = faces[f * 3 + 2];
      const attr = attributes[kept[f]] || 0;
      if (isWall?.[f]) {
        outHostTris.push([a, b, c]);
        outHostAttrs.push(attr);
        continue;
      }
      const s = [a, b, c].map((v) => (values[v] > 0 ? 1 : -1));
      const pushTri = (v0, v1, v2, isOuter) => {
        if (isOuter) {
          const fi = outHostTris.length;
          outHostTris.push([v0, v1, v2]);
          outHostAttrs.push(attr);
          keptEdges.set(`${v0}_${v1}`, fi);
          keptEdges.set(`${v1}_${v2}`, fi);
          keptEdges.set(`${v2}_${v0}`, fi);
        } else {
          removedEdges.push([v0, v1], [v1, v2], [v2, v0]);
        }
      };
      if (s[0] === s[1] && s[1] === s[2]) {
        pushTri(a, b, c, s[0] > 0);
        continue;
      }
      let iso = 0;
      if (s[0] === s[1]) iso = 2;
      else if (s[0] === s[2]) iso = 1;
      const tri = [a, b, c];
      const v0 = tri[iso];
      const v1 = tri[(iso + 1) % 3];
      const v2 = tri[(iso + 2) % 3];
      const m1 = mid(v0, v1);
      const m2 = mid(v0, v2);
      pushTri(v0, m1, m2, s[iso] > 0);
      pushTri(m1, v1, v2, s[iso] < 0);
      pushTri(m1, v2, m2, s[iso] < 0);
    }
    const next = new Map();
    edgeFace = new Map();
    for (const [a, b] of removedEdges) {
      if (keptEdges.has(`${b}_${a}`)) {
        next.set(b, a);
        edgeFace.set(`${b}_${a}`, keptEdges.get(`${b}_${a}`));
      }
    }
    const seen = new Set();
    let bestLoop = null;
    for (const start of next.keys()) {
      if (seen.has(start)) continue;
      const loop = [];
      let cur = start;
      while (cur !== undefined && !seen.has(cur)) {
        seen.add(cur);
        loop.push(cur);
        cur = next.get(cur);
      }
      if (cur === start && loop.length >= 24 && (!bestLoop || loop.length > bestLoop.length)) {
        bestLoop = loop;
      }
    }
    cutLoop = bestLoop;
  }

  if (!cutLoop) {
    hasMicroChamfer = false;
    outHostTris.length = 0;
    outHostAttrs.length = 0;
    edgeFace = new Map();
    for (let f = 0; f < fc; f += 1) {
      const a = faces[f * 3];
      const b = faces[f * 3 + 1];
      const c = faces[f * 3 + 2];
      const fi = outHostTris.length;
      outHostTris.push([a, b, c]);
      outHostAttrs.push(attributes[kept[f]] || 0);
      if (!isWall?.[f]) {
        edgeFace.set(`${a}_${b}`, fi);
        edgeFace.set(`${b}_${c}`, fi);
        edgeFace.set(`${c}_${a}`, fi);
      }
    }
    cutLoop = rim.loop.slice();
  }

  const N = CAP_COLUMNS;
  // 절단선에 닿은 작은 삼각형 하나는 현 방향으로 미세하게 기울어 반경 기울기가 튄다.
  // 절단선 바깥 포스트 띠(rChan + 0.04 .. rChan + 0.35mm)의 면적 가중 법선으로 둘레 반경 기울기를 구한다.
  const nxBin = new Float64Array(N);
  const nyBin = new Float64Array(N);
  const nzBin = new Float64Array(N);
  for (let f = 0; f < fc; f += 1) {
    if (isWall?.[f]) continue;
    const a = faces[f * 3];
    const b = faces[f * 3 + 1];
    const c = faces[f * 3 + 2];
    if (dist[a] > 0.45 && dist[b] > 0.45 && dist[c] > 0.45) continue;
    const ax = verts[a * 3];
    const ay = verts[a * 3 + 1];
    const az = verts[a * 3 + 2];
    const bx = verts[b * 3];
    const by = verts[b * 3 + 1];
    const bz = verts[b * 3 + 2];
    const cx = verts[c * 3];
    const cy = verts[c * 3 + 1];
    const cz = verts[c * 3 + 2];
    const mx = (ax + bx + cx) / 3;
    const my = (ay + by + cy) / 3;
    const rc = Math.hypot(mx, my);
    if (rc < rChan + 0.04 || rc > rChan + 0.35) continue;
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    const fnx = uy * vz - uz * vy;
    const fny = uz * vx - ux * vz;
    const fnz = ux * vy - uy * vx;
    if (fnz <= 0) continue;
    const th = Math.atan2(my, mx);
    const j = ((Math.round(((th + Math.PI) / TWO_PI) * N) % N) + N) % N;
    nxBin[j] += fnx;
    nyBin[j] += fny;
    nzBin[j] += fnz;
  }

  const pts = cutLoop
    .map((v, idx) => {
      const w = cutLoop[(idx + 1) % cutLoop.length];
      const fi = edgeFace.get(`${v}_${w}`) ?? edgeFace.get(`${w}_${v}`);
      let slope = 0;
      if (fi !== undefined) {
        const [a, b, c] = outHostTris[fi];
        const fux = vs[b * 3] - vs[a * 3];
        const fuy = vs[b * 3 + 1] - vs[a * 3 + 1];
        const fuz = vs[b * 3 + 2] - vs[a * 3 + 2];
        const fvx = vs[c * 3] - vs[a * 3];
        const fvy = vs[c * 3 + 1] - vs[a * 3 + 1];
        const fvz = vs[c * 3 + 2] - vs[a * 3 + 2];
        const fnx = fuy * fvz - fuz * fvy;
        const fny = fuz * fvx - fux * fvz;
        const fnz = fux * fvy - fuy * fvx;
        const fl = Math.hypot(fnx, fny, fnz) || 1;
        const th = Math.atan2(vs[v * 3 + 1], vs[v * 3]);
        if (Math.abs(fnz / fl) > 0.15) {
          slope = Math.max(-4, Math.min(4, -(fnx * Math.cos(th) + fny * Math.sin(th)) / fnz));
        }
      }
      return {
        v,
        a: Math.atan2(vs[v * 3 + 1], vs[v * 3]),
        r: Math.hypot(vs[v * 3], vs[v * 3 + 1]),
        z: vs[v * 3 + 2],
        slope,
      };
    })
    .sort((p, q) => p.a - q.a);

  const zCut = new Float64Array(N);
  const rLoop = new Float64Array(N);
  const sCut = new Float64Array(N);
  for (let j = 0; j < N; j += 1) {
    const th = -Math.PI + (TWO_PI * j) / N;
    let k = pts.findIndex((p) => p.a >= th);
    if (k < 0) k = 0;
    const p0 = pts[(k - 1 + pts.length) % pts.length];
    const p1 = pts[k];
    let da = p1.a - p0.a;
    if (da <= 0) da += TWO_PI;
    let dt = th - p0.a;
    if (dt < 0) dt += TWO_PI;
    const u = da > 1e-9 ? Math.min(1, Math.max(0, dt / da)) : 0;
    zCut[j] = p0.z + u * (p1.z - p0.z);
    rLoop[j] = p0.r + u * (p1.r - p0.r);
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let d = -3; d <= 3; d += 1) {
      const m = (j + d + N) % N;
      sx += nxBin[m];
      sy += nyBin[m];
      sz += nzBin[m];
    }
    const fl = Math.hypot(sx, sy, sz);
    if (fl > 1e-12 && sz / fl > 0.15) {
      sCut[j] = Math.max(-4, Math.min(4, -(sx * Math.cos(th) + sy * Math.sin(th)) / sz));
    } else {
      sCut[j] = p0.slope + u * (p1.slope - p0.slope);
    }
  }

  const cCut = fourierCoeffs(zCut, 16);
  const zCutLP = evalFourierGrid(cCut, 16, N);
  const dZdsRaw = Float64Array.from(sCut, (sl, j) => sl * rLoop[j]);
  const cD = fourierCoeffs(dZdsRaw, 6);
  const dLP = evalFourierGrid(cD, 6, N);

  // 경계 꼭짓점이 저역 통과 곡면보다 0.002mm 넘게 튀어나와 있을 때만 안쪽으로 최대 5µm 당긴다(외측 이동 0).
  let movedMax = 0;
  for (const p of pts) {
    let zTarget = 0;
    for (let h = 0; h <= 16; h += 1) {
      zTarget += cCut.re[h] * Math.cos(h * p.a) + cCut.im[h] * Math.sin(h * p.a);
    }
    const dz = zTarget - p.z;
    // 이미 HF 패치가 붙었던 메시를 재실행할 때는 호스트 경계 정점을 또 깎지 않는다.
    if (!alreadyPatched && dz < -0.002) {
      const move = Math.max(-MAX_INWARD_MM, dz);
      const z1 = Math.fround(p.z + move);
      movedMax = Math.max(movedMax, Math.abs(z1 - p.z));
      vs[p.v * 3 + 2] = z1;
      p.z = z1;
    }
  }
  for (let j = 0; j < N; j += 1) {
    const th = -Math.PI + (TWO_PI * j) / N;
    let k = pts.findIndex((p) => p.a >= th);
    if (k < 0) k = 0;
    const p0 = pts[(k - 1 + pts.length) % pts.length];
    const p1 = pts[k];
    let da = p1.a - p0.a;
    if (da <= 0) da += TWO_PI;
    let dt = th - p0.a;
    if (dt < 0) dt += TWO_PI;
    const u = da > 1e-9 ? Math.min(1, Math.max(0, dt / da)) : 0;
    zCut[j] = p0.z + u * (p1.z - p0.z);
  }

  const resSmooth = new Float64Array(N);
  const dResSmooth = new Float64Array(N);
  for (let j = 0; j < N; j += 1) {
    let s = 0;
    let ds = 0;
    for (let d = -1; d <= 1; d += 1) {
      const k = (j + d + N) % N;
      s += zCut[k] - zCutLP[k];
      ds += dZdsRaw[k] - dLP[k];
    }
    resSmooth[j] = s / 3;
    dResSmooth[j] = ds / 3;
  }

  const evalDiskBase = (s, th) => {
    const jf = ((th + Math.PI) / TWO_PI) * N;
    const j0 = ((Math.floor(jf) % N) + N) % N;
    const j1 = (j0 + 1) % N;
    const frac = jf - Math.floor(jf);
    let hVal = 0;
    for (let h = 0; h <= 16; h += 1) {
      const ang = h * th;
      hVal += (s ** h) * (cCut.re[h] * Math.cos(ang) + cCut.im[h] * Math.sin(ang));
    }
    let g1 = 0;
    for (let h = 0; h <= 6; h += 1) {
      const ang = h * th;
      const dRe = cD.re[h] - h * cCut.re[h];
      const dIm = cD.im[h] - h * cCut.im[h];
      g1 += (s ** Math.max(2, h)) * (s - 1) * (dRe * Math.cos(ang) + dIm * Math.sin(ang));
    }
    const rS = resSmooth[j0] * (1 - frac) + resSmooth[j1] * frac;
    const dS =
      (dResSmooth[j0] - 12 * resSmooth[j0]) * (1 - frac) +
      (dResSmooth[j1] - 12 * resSmooth[j1]) * frac;
    return hVal + g1 + (s ** 12) * rS + (s ** 12) * (s - 1) * dS;
  };

  // 칼라 구간(rChan .. rCut)에서 원본 꼭짓점보다 위로 나가는 곳이 있으면 최대 5µm 안에서만 내린다.
  // 안쪽 채널 벽이 캡 위로 뚫고 나오지 않는 한도까지만 내린다.
  const exCol = new Float64Array(N);
  if (hasMicroChamfer) {
    for (let v = 0; v < nv; v += 1) {
      if (rimVerts.has(v) || dist[v] > 0.2) continue;
      const r = Math.hypot(verts[v * 3], verts[v * 3 + 1]);
      if (r < rChan + 0.002 || r > rCut - 0.0005) continue;
      const s = r / rCut;
      const u = Math.max(0, Math.min(1, (r - rChan) / CUT_COLLAR_MM));
      const th = Math.atan2(verts[v * 3 + 1], verts[v * 3]);
      const ex = evalDiskBase(s, th) - verts[v * 3 + 2];
      if (ex > 0) {
        const j = ((Math.round(((th + Math.PI) / TWO_PI) * N) % N) + N) % N;
        const w = 1 - u ** 2;
        const need = Math.min(MAX_INWARD_MM, ex / Math.max(w, 0.15));
        if (need > exCol[j]) exCol[j] = need;
      }
    }
  }
  const dil = new Float64Array(N);
  for (let j = 0; j < N; j += 1) {
    let m = 0;
    for (let d = -6; d <= 6; d += 1) m = Math.max(m, exCol[(j + d + N) % N]);
    dil[j] = m > 0 ? Math.min(MAX_INWARD_MM, m * 1.15 + 0.0002) : 0;
  }
  const cLift = fourierCoeffs(dil, 8);
  const evalDiskSafe = (s, th) => {
    if (!hasMicroChamfer) return evalDiskBase(s, th);
    let lft = 0;
    for (let h = 0; h <= 8; h += 1) {
      const ang = h * th;
      lft += (s ** h) * (cLift.re[h] * Math.cos(ang) + cLift.im[h] * Math.sin(ang));
    }
    const r = s * rCut;
    const u = Math.max(0, Math.min(1, (r - rChan) / CUT_COLLAR_MM));
    return evalDiskBase(s, th) - Math.min(MAX_INWARD_MM, Math.max(0, lft)) * (1 - u ** 2);
  };

  // 안쪽 채널 벽 상단 정점이 새 캡 위로 삐져나오면 캡 아래로 내린다.
  if (hasMicroChamfer && cutLoop !== rim.loop) {
    for (const v of rim.loop) {
      const r = Math.hypot(vs[v * 3], vs[v * 3 + 1]);
      const th = Math.atan2(vs[v * 3 + 1], vs[v * 3]);
      const zCap = evalDiskSafe(Math.min(1, r / rCut), th) - 0.002;
      if (vs[v * 3 + 2] > zCap) {
        vs[v * 3 + 2] = Math.fround(zCap);
      }
    }
  }

  const outerRow = angularRowFromLoop(cutLoop, vs);
  if (!outerRow) return null;

  const rings = [];
  for (let k = 1; k < RADIAL_STEPS; k += 1) {
    const s = 1 - k / RADIAL_STEPS;
    const row = [];
    for (let j = 0; j < N; j += 1) {
      const th = -Math.PI + (TWO_PI * j) / N;
      const r = rLoop[j] * s;
      const x = Math.fround(r * Math.cos(th));
      const y = Math.fround(r * Math.sin(th));
      const z = Math.fround(evalDiskSafe(s, th));
      row.push([x, y, z]);
    }
    rings.push(row);
  }

  // outerRow의 시작 각도에 맞춰 첫 내부 고리를 정렬해 지퍼로 잇는다.
  const startAngle = outerRow[0].a;
  const ring1Order = Array.from({ length: N }, (_, j) => {
    const th = wrapAngle(-Math.PI + (TWO_PI * j) / N);
    let d = th - startAngle;
    if (d < 0) d += TWO_PI;
    return { j, a: startAngle + d, p: rings[0][j] };
  }).sort((p, q) => p.a - q.a);

  const capTris = [];
  const emitCap = (a, b, c) => {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const nz = ux * vy - uy * vx;
    if (Math.abs(nz) < 1e-14) return;
    if (nz > 0) capTris.push([a, b, c]);
    else capTris.push([a, c, b]);
  };

  zipperPointRows(outerRow, ring1Order, emitCap);

  for (let k = 0; k + 1 < rings.length; k += 1) {
    const R0 = rings[k];
    const R1 = rings[k + 1];
    for (let j = 0; j < N; j += 1) {
      const jn = (j + 1) % N;
      const a = R0[j];
      const b = R0[jn];
      const c = R1[jn];
      const d = R1[j];
      const d1 = (a[0] - c[0]) ** 2 + (a[1] - c[1]) ** 2 + (a[2] - c[2]) ** 2;
      const d2 = (b[0] - d[0]) ** 2 + (b[1] - d[1]) ** 2 + (b[2] - d[2]) ** 2;
      if (d1 <= d2) {
        emitCap(a, b, c);
        emitCap(a, c, d);
      } else {
        emitCap(a, b, d);
        emitCap(b, c, d);
      }
    }
  }

  const center = [0, 0, Math.fround(evalDiskSafe(0, 0))];
  const Rlast = rings.at(-1);
  for (let j = 0; j < N; j += 1) {
    emitCap(Rlast[j], Rlast[(j + 1) % N], center);
  }

  let rimZMin = Infinity;
  let rimZMax = -Infinity;
  for (const p of pts) {
    if (p.z < rimZMin) rimZMin = p.z;
    if (p.z > rimZMax) rimZMax = p.z;
  }

  return {
    vs,
    outHostTris,
    outHostAttrs,
    capTris,
    movedMax,
    rimZMin,
    rimZMax,
  };
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
  const rim = findUpperRimLoop(verts, faces, attributes, host.kept);
  if (!rim.ok) return { ok: false, reason: rim.reason };
  const cap = buildCuffStyleCap(verts, faces, attributes, host.kept, rim, {
    alreadyPatched: host.removedPatchTriangles > 0,
  });
  if (!cap) return { ok: false, reason: "스크류홀 캡 곡면을 만들지 못했습니다." };

  const hostCount = cap.outHostTris.length;
  const patchCount = cap.capTris.length;
  const outCount = hostCount + patchCount;
  const outPositions = new Float64Array(outCount * 9);
  const outAttributes = new Uint16Array(outCount);
  const { vs } = cap;

  for (let i = 0; i < hostCount; i += 1) {
    const tri = cap.outHostTris[i];
    for (let k = 0; k < 3; k += 1) {
      const v = tri[k] * 3;
      const o = i * 9 + k * 3;
      outPositions[o] = vs[v];
      outPositions[o + 1] = vs[v + 1];
      outPositions[o + 2] = vs[v + 2];
    }
    outAttributes[i] = cap.outHostAttrs[i];
  }
  for (let i = 0; i < patchCount; i += 1) {
    const tri = cap.capTris[i];
    const o = (hostCount + i) * 9;
    outPositions.set(tri.flat(), o);
    outAttributes[hostCount + i] = HOLE_FILL_PATCH_ATTRIBUTE;
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
      rimZMin: Number(cap.rimZMin.toFixed(3)),
      rimZMax: Number(cap.rimZMax.toFixed(3)),
      rimMovedMaxUm: Math.round(cap.movedMax * 1e4) / 10,
    },
  };
}
