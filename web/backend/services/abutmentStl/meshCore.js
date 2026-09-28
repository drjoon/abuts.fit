// related files:
// - web/backend/services/abutmentStl/pipeline.js
// - web/backend/utils/screwHoleFill.js (parseStl / writeBinaryStl)
//
// Rhino 없이 어벗 STL을 다루기 위한 최소 메시 연산.
// 정점은 위치로 용접한다(Rhino TopologyVertices와 같은 기준). 면은 삼각형만 쓴다.
import { parseStl, writeBinaryStl } from "../../utils/screwHoleFill.js";

export { parseStl, writeBinaryStl };

const WELD_EPS = 1e-5;
/** Rhino STL import 기본 용접각. 피니시라인 edge 최소 인접각 23.0°(골든 137건)와 맞다. */
export const RHINO_STL_WELD_ANGLE_DEG = 22.5;

export class Mesh {
  constructor(verts, faces) {
    this.verts = verts;
    this.faces = faces;
    this._faceNormals = null;
    this._edges = null;
    this._zIndex = null;
    this.float32 = true;
  }

  get vertexCount() {
    return this.verts.length / 3;
  }

  get faceCount() {
    return this.faces.length / 3;
  }

  static fromTriangleSoup(positions, eps = WELD_EPS) {
    const triCount = Math.floor(positions.length / 9);
    const keyToIndex = new Map();
    const verts = [];
    const faces = new Int32Array(triCount * 3);
    const inv = 1 / eps;
    for (let t = 0; t < triCount; t += 1) {
      for (let k = 0; k < 3; k += 1) {
        const o = t * 9 + k * 3;
        const x = positions[o];
        const y = positions[o + 1];
        const z = positions[o + 2];
        const key = `${Math.round(x * inv)},${Math.round(y * inv)},${Math.round(z * inv)}`;
        let idx = keyToIndex.get(key);
        if (idx === undefined) {
          idx = verts.length / 3;
          verts.push(x, y, z);
          keyToIndex.set(key, idx);
        }
        faces[t * 3 + k] = idx;
      }
    }
    return new Mesh(Float64Array.from(verts), dropDegenerateFaces(faces));
  }

  static fromStlBuffer(buffer) {
    return Mesh.fromTriangleSoup(parseStl(buffer).positions);
  }

  clone() {
    return new Mesh(Float64Array.from(this.verts), Int32Array.from(this.faces));
  }

  invalidate() {
    this._faceNormals = null;
    this._edges = null;
    this._zIndex = null;
    this._cornerIds = null;
  }

  toTriangleSoup() {
    const n = this.faceCount;
    const out = new Float64Array(n * 9);
    for (let f = 0; f < n; f += 1) {
      for (let k = 0; k < 3; k += 1) {
        const v = this.faces[f * 3 + k] * 3;
        out[f * 9 + k * 3] = this.verts[v];
        out[f * 9 + k * 3 + 1] = this.verts[v + 1];
        out[f * 9 + k * 3 + 2] = this.verts[v + 2];
      }
    }
    return out;
  }

  bbox() {
    const v = this.verts;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < v.length; i += 3) {
      for (let k = 0; k < 3; k += 1) {
        if (v[i + k] < min[k]) min[k] = v[i + k];
        if (v[i + k] > max[k]) max[k] = v[i + k];
      }
    }
    return { min, max };
  }

  /**
   * 4x4 행렬(행 우선 16원소)을 정점에 적용한다.
   * Rhino 메시 정점은 float32라 변환마다 반올림된다. 동점 채점이 같은 쪽으로 풀리도록 맞춘다.
   */
  transform(m) {
    const v = this.verts;
    const r = this.float32 ? Math.fround : (x) => x;
    for (let i = 0; i < v.length; i += 3) {
      const x = v[i];
      const y = v[i + 1];
      const z = v[i + 2];
      v[i] = r(m[0] * x + m[1] * y + m[2] * z + m[3]);
      v[i + 1] = r(m[4] * x + m[5] * y + m[6] * z + m[7]);
      v[i + 2] = r(m[8] * x + m[9] * y + m[10] * z + m[11]);
    }
    this.invalidate();
    return true;
  }

  translate(dx, dy, dz) {
    return this.transform(translation(dx, dy, dz));
  }

  /** 단위 면 법선 (nx,ny,nz)과 면적. */
  faceNormals() {
    if (this._faceNormals) return this._faceNormals;
    const n = this.faceCount;
    const normals = new Float64Array(n * 3);
    const areas = new Float64Array(n);
    const v = this.verts;
    const f = this.faces;
    for (let i = 0; i < n; i += 1) {
      const a = f[i * 3] * 3;
      const b = f[i * 3 + 1] * 3;
      const c = f[i * 3 + 2] * 3;
      const ux = v[b] - v[a];
      const uy = v[b + 1] - v[a + 1];
      const uz = v[b + 2] - v[a + 2];
      const wx = v[c] - v[a];
      const wy = v[c + 1] - v[a + 1];
      const wz = v[c + 2] - v[a + 2];
      const nx = uy * wz - uz * wy;
      const ny = uz * wx - ux * wz;
      const nz = ux * wy - uy * wx;
      const len = Math.hypot(nx, ny, nz);
      areas[i] = 0.5 * len;
      if (len > 1e-20) {
        normals[i * 3] = nx / len;
        normals[i * 3 + 1] = ny / len;
        normals[i * 3 + 2] = nz / len;
      }
    }
    this._faceNormals = { normals, areas };
    return this._faceNormals;
  }

  /** 무방향 edge → 인접 면 목록. */
  edges() {
    if (this._edges) return this._edges;
    const nv = this.vertexCount;
    const map = new Map();
    const f = this.faces;
    for (let i = 0; i < this.faceCount; i += 1) {
      for (let k = 0; k < 3; k += 1) {
        const a = f[i * 3 + k];
        const b = f[i * 3 + ((k + 1) % 3)];
        const key = a < b ? a * nv + b : b * nv + a;
        const list = map.get(key);
        if (list) list.push(i);
        else map.set(key, [i]);
      }
    }
    this._edges = { map, nv };
    return this._edges;
  }

  /**
   * Rhino STL import처럼 인접면 각도가 weldAngleDeg를 넘는 edge에서 정점을 가른 코너 id.
   * 정점마다 crease가 아닌 edge로 이어진 면 부채꼴이 같은 id를 갖는다.
   */
  cornerIds(weldAngleDeg = RHINO_STL_WELD_ANGLE_DEG) {
    if (this._cornerIds?.angle === weldAngleDeg) return this._cornerIds.ids;
    const { map, nv } = this.edges();
    const { normals } = this.faceNormals();
    const cosT = Math.cos((weldAngleDeg * Math.PI) / 180);
    const f = this.faces;
    const corner = (fi, vi) => (f[fi * 3] === vi ? 0 : f[fi * 3 + 1] === vi ? 1 : 2);
    const uf = unionFind(f.length);
    for (const [key, list] of map) {
      if (list.length !== 2) continue;
      const [f0, f1] = list;
      const d =
        normals[f0 * 3] * normals[f1 * 3] +
        normals[f0 * 3 + 1] * normals[f1 * 3 + 1] +
        normals[f0 * 3 + 2] * normals[f1 * 3 + 2];
      if (d < cosT) continue;
      const a = Math.floor(key / nv);
      const b = key - a * nv;
      uf.union(f0 * 3 + corner(f0, a), f1 * 3 + corner(f1, a));
      uf.union(f0 * 3 + corner(f0, b), f1 * 3 + corner(f1, b));
    }
    const ids = new Int32Array(f.length);
    const remap = new Map();
    for (let c = 0; c < f.length; c += 1) {
      const r = uf.find(c);
      let id = remap.get(r);
      if (id === undefined) {
        id = remap.size;
        remap.set(r, id);
      }
      ids[c] = id;
    }
    this._cornerIds = { angle: weldAngleDeg, ids, count: remap.size };
    return ids;
  }

  /** cornerIds 기준(=Rhino unwelded 기준)으로 다시 만든 메시. 정점은 복제된다. */
  unweldedByAngle(weldAngleDeg = RHINO_STL_WELD_ANGLE_DEG) {
    const ids = this.cornerIds(weldAngleDeg);
    const count = this._cornerIds.count;
    const verts = new Float64Array(count * 3);
    for (let c = 0; c < ids.length; c += 1) {
      const v = this.faces[c] * 3;
      verts[ids[c] * 3] = this.verts[v];
      verts[ids[c] * 3 + 1] = this.verts[v + 1];
      verts[ids[c] * 3 + 2] = this.verts[v + 2];
    }
    const mesh = new Mesh(verts, Int32Array.from(ids));
    mesh.float32 = this.float32;
    return mesh;
  }

  nakedEdgeCount() {
    let n = 0;
    for (const list of this.edges().map.values()) if (list.length === 1) n += 1;
    return n;
  }

  /** naked edge를 이어 만든 경계 루프(정점 인덱스 배열). */
  boundaryLoops() {
    const { map, nv } = this.edges();
    const adj = new Map();
    const add = (a, b) => {
      const list = adj.get(a);
      if (list) list.push(b);
      else adj.set(a, [b]);
    };
    for (const [key, list] of map) {
      if (list.length !== 1) continue;
      const a = Math.floor(key / nv);
      const b = key - a * nv;
      add(a, b);
      add(b, a);
    }
    return chainAdjacency(adj);
  }

  /** 정점을 공유하는 면끼리 묶은 연결 성분(면 인덱스 배열). */
  faceComponents() {
    const nv = this.vertexCount;
    const uf = unionFind(nv);
    const f = this.faces;
    for (let i = 0; i < this.faceCount; i += 1) {
      uf.union(f[i * 3], f[i * 3 + 1]);
      uf.union(f[i * 3], f[i * 3 + 2]);
    }
    const groups = new Map();
    for (let i = 0; i < this.faceCount; i += 1) {
      const r = uf.find(f[i * 3]);
      const list = groups.get(r);
      if (list) list.push(i);
      else groups.set(r, [i]);
    }
    return [...groups.values()];
  }

  subMesh(faceList) {
    const remap = new Map();
    const verts = [];
    const faces = new Int32Array(faceList.length * 3);
    faceList.forEach((fi, j) => {
      for (let k = 0; k < 3; k += 1) {
        const v = this.faces[fi * 3 + k];
        let idx = remap.get(v);
        if (idx === undefined) {
          idx = verts.length / 3;
          verts.push(this.verts[v * 3], this.verts[v * 3 + 1], this.verts[v * 3 + 2]);
          remap.set(v, idx);
        }
        faces[j * 3 + k] = idx;
      }
    });
    return new Mesh(Float64Array.from(verts), faces);
  }

  /** z 평면 단면용 슬랩 인덱스. */
  zIndex() {
    if (this._zIndex) return this._zIndex;
    const { min, max } = this.bbox();
    const slab = 0.1;
    const count = Math.max(1, Math.ceil((max[2] - min[2]) / slab) + 1);
    const buckets = Array.from({ length: count }, () => []);
    const v = this.verts;
    const f = this.faces;
    for (let i = 0; i < this.faceCount; i += 1) {
      const za = v[f[i * 3] * 3 + 2];
      const zb = v[f[i * 3 + 1] * 3 + 2];
      const zc = v[f[i * 3 + 2] * 3 + 2];
      const lo = Math.floor((Math.min(za, zb, zc) - min[2]) / slab);
      const hi = Math.floor((Math.max(za, zb, zc) - min[2]) / slab);
      for (let s = Math.max(0, lo); s <= Math.min(count - 1, hi); s += 1) {
        buckets[s].push(i);
      }
    }
    this._zIndex = { zMin: min[2], slab, buckets };
    return this._zIndex;
  }
}

function dropDegenerateFaces(faces) {
  const out = [];
  for (let i = 0; i < faces.length; i += 3) {
    const a = faces[i];
    const b = faces[i + 1];
    const c = faces[i + 2];
    if (a === b || b === c || a === c) continue;
    out.push(a, b, c);
  }
  return Int32Array.from(out);
}

export function unionFind(n) {
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i += 1) parent[i] = i;
  const find = (a) => {
    let x = a;
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  return { find, union };
}

/**
 * 인접 리스트를 경로로 잇는다. 차수 2 정점은 통과, 그 외는 끊는다.
 * 반환: [{ vertices: number[], closed: boolean }]
 */
export function chainAdjacency(adj) {
  const used = new Set();
  const edgeId = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  const out = [];
  const walk = (start, next) => {
    const path = [start];
    let prev = start;
    let cur = next;
    used.add(edgeId(start, next));
    while (true) {
      path.push(cur);
      if (cur === start) return { vertices: path, closed: true };
      const nbrs = adj.get(cur) || [];
      if (nbrs.length !== 2) return { vertices: path, closed: false };
      const nxt = nbrs[0] === prev ? nbrs[1] : nbrs[0];
      const id = edgeId(cur, nxt);
      if (used.has(id)) return { vertices: path, closed: false };
      used.add(id);
      prev = cur;
      cur = nxt;
    }
  };
  // 끝점(차수 != 2)부터 열린 경로를 먼저 뽑고, 남은 것은 닫힌 루프다.
  for (const [v, nbrs] of adj) {
    if (nbrs.length === 2) continue;
    for (const w of nbrs) {
      if (used.has(edgeId(v, w))) continue;
      out.push(walk(v, w));
    }
  }
  for (const [v, nbrs] of adj) {
    for (const w of nbrs) {
      if (used.has(edgeId(v, w))) continue;
      out.push(walk(v, w));
    }
  }
  return out;
}

/**
 * 메시 × 평면 단면. Rhino Intersection.MeshPlane처럼 닫힌 루프는 첫 점을 끝에 한 번 더 둔다.
 * @param {Mesh} mesh
 * @param {number[]} origin
 * @param {number[]} normal 단위 벡터
 * @param {Iterable<number>|null} faceSubset 후보 면
 * @returns {number[][][]} polyline 배열([x,y,z] 목록)
 */
export function meshPlaneSection(mesh, origin, normal, faceSubset = null) {
  const v = mesh.verts;
  const f = mesh.faces;
  const nv = mesh.vertexCount;
  const [nx, ny, nz] = normal;
  const d0 = nx * origin[0] + ny * origin[1] + nz * origin[2];
  const dist = new Map();
  const signed = (vi) => {
    let d = dist.get(vi);
    if (d === undefined) {
      d = nx * v[vi * 3] + ny * v[vi * 3 + 1] + nz * v[vi * 3 + 2] - d0;
      // 평면 위 정점은 +쪽으로 민다(교차점이 정점에 겹쳐 두 번 잡히는 것 방지).
      if (d === 0) d = 1e-12;
      dist.set(vi, d);
    }
    return d;
  };
  const points = new Map();
  const pointOf = (a, b, da, db) => {
    const key = a < b ? a * nv + b : b * nv + a;
    let p = points.get(key);
    if (!p) {
      const t = da / (da - db);
      p = [
        v[a * 3] + t * (v[b * 3] - v[a * 3]),
        v[a * 3 + 1] + t * (v[b * 3 + 1] - v[a * 3 + 1]),
        v[a * 3 + 2] + t * (v[b * 3 + 2] - v[a * 3 + 2]),
      ];
      points.set(key, p);
    }
    return key;
  };
  const adj = new Map();
  const link = (a, b) => {
    const la = adj.get(a);
    if (la) la.push(b);
    else adj.set(a, [b]);
    const lb = adj.get(b);
    if (lb) lb.push(a);
    else adj.set(b, [a]);
  };
  const visit = (i) => {
    const a = f[i * 3];
    const b = f[i * 3 + 1];
    const c = f[i * 3 + 2];
    const da = signed(a);
    const db = signed(b);
    const dc = signed(c);
    const crossings = [];
    if (da > 0 !== db > 0) crossings.push(pointOf(a, b, da, db));
    if (db > 0 !== dc > 0) crossings.push(pointOf(b, c, db, dc));
    if (dc > 0 !== da > 0) crossings.push(pointOf(c, a, dc, da));
    if (crossings.length === 2 && crossings[0] !== crossings[1]) {
      link(crossings[0], crossings[1]);
    }
  };
  if (faceSubset) for (const i of faceSubset) visit(i);
  else for (let i = 0; i < mesh.faceCount; i += 1) visit(i);

  return chainAdjacency(adj).map(({ vertices }) =>
    vertices.map((key) => points.get(key)),
  );
}

export function meshZSection(mesh, z) {
  const { zMin, slab, buckets } = mesh.zIndex();
  const s = Math.floor((z - zMin) / slab);
  if (s < 0 || s >= buckets.length) return [];
  return meshPlaneSection(mesh, [0, 0, z], [0, 0, 1], buckets[s]);
}

export function isClosedPolyline(pl, tol = 1e-9) {
  if (!pl || pl.length < 3) return false;
  const a = pl[0];
  const b = pl[pl.length - 1];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= tol;
}

export function polylineLength(pl) {
  let s = 0;
  for (let i = 1; i < pl.length; i += 1) {
    s += Math.hypot(
      pl[i][0] - pl[i - 1][0],
      pl[i][1] - pl[i - 1][1],
      pl[i][2] - pl[i - 1][2],
    );
  }
  return s;
}

// ---------- 변환 행렬 (행 우선 4x4) ----------

export function identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

export function translation(dx, dy, dz) {
  return [1, 0, 0, dx, 0, 1, 0, dy, 0, 0, 1, dz, 0, 0, 0, 1];
}

export function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      let s = 0;
      for (let k = 0; k < 4; k += 1) s += a[r * 4 + k] * b[k * 4 + c];
      out[r * 4 + c] = s;
    }
  }
  return out;
}

/** 축(단위)·각(rad)·중심 회전. */
export function rotationAxisAngle(axis, angle, center = [0, 0, 0]) {
  const [x, y, z] = normalize(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  const r = [
    t * x * x + c, t * x * y - s * z, t * x * z + s * y,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c,
  ];
  const [cx, cy, cz] = center;
  return [
    r[0], r[1], r[2], cx - (r[0] * cx + r[1] * cy + r[2] * cz),
    r[3], r[4], r[5], cy - (r[3] * cx + r[4] * cy + r[5] * cz),
    r[6], r[7], r[8], cz - (r[6] * cx + r[7] * cy + r[8] * cz),
    0, 0, 0, 1,
  ];
}

/** Rhino Transform.Rotation(from, to, center): from을 to로 보내는 최소 회전. */
export function rotationFromTo(from, to, center = [0, 0, 0]) {
  const a = normalize(from);
  const b = normalize(to);
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const axis = cross(a, b);
  const len = Math.hypot(axis[0], axis[1], axis[2]);
  if (len < 1e-12) {
    if (dot > 0) return identity();
    const helper = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    return rotationAxisAngle(cross(a, helper), Math.PI, center);
  }
  return rotationAxisAngle(axis, Math.atan2(len, dot), center);
}

export function applyToPoint(m, p) {
  return [
    m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
    m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
    m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
  ];
}

export function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function normalize(a) {
  const len = Math.hypot(a[0], a[1], a[2]);
  if (len < 1e-300) return [0, 0, 0];
  return [a[0] / len, a[1] / len, a[2] / len];
}

export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m]);
}
