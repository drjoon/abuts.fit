// 협측 바이트에 상악·하악을 붙인다. 바이트는 그대로 두고 악궁만 강체 변환한다.
// 점 3개는 한 평면이라 세 번째 축이 비는데, 그 축을 0으로 두면 악궁이 평평해진다.
// 바이트는 치아 일부만 겹치고 위·아래가 한 메시에 있다.
// 어긋남이 크면 점쌍 특징(Drost PPF)으로 처음 자세를 잡고, 겹치는 면만 trimmed ICP로 다듬는다.
import * as THREE from "three";

type Cloud = {
  xyz: Float32Array;
  nrm: Float32Array;
  count: number;
};

type Rigid = {
  r: number[][];
  t: [number, number, number];
};

function mmToUnits(mm: number, unitToMm: number) {
  return mm / (unitToMm > 0 ? unitToMm : 1);
}

function yieldFrame() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

function cloudRadius(cloud: Cloud) {
  let cx = 0;
  let cy = 0;
  let cz = 0;
  const n = cloud.count;
  if (n === 0) return 0;
  for (let i = 0; i < n; i += 1) {
    cx += cloud.xyz[i * 3] ?? 0;
    cy += cloud.xyz[i * 3 + 1] ?? 0;
    cz += cloud.xyz[i * 3 + 2] ?? 0;
  }
  cx /= n;
  cy /= n;
  cz /= n;
  let max = 0;
  for (let i = 0; i < n; i += 1) {
    const d = Math.hypot(
      (cloud.xyz[i * 3] ?? 0) - cx,
      (cloud.xyz[i * 3 + 1] ?? 0) - cy,
      (cloud.xyz[i * 3 + 2] ?? 0) - cz,
    );
    if (d > max) max = d;
  }
  return max;
}

function sampleGeometry(
  geometry: THREE.BufferGeometry,
  voxel: number,
  cap: number,
): Cloud {
  const pos = geometry.getAttribute("position");
  const nrm = geometry.getAttribute("normal");
  const empty = { xyz: new Float32Array(0), nrm: new Float32Array(0), count: 0 };
  if (!pos || pos.count === 0) return empty;
  const stride = Math.max(1, Math.ceil(pos.count / Math.max(cap, 1)));
  const cell = Math.max(voxel, 1e-6);
  const seen = new Map<number, number>();
  const xyz: number[] = [];
  const normals: number[] = [];
  for (let i = 0; i < pos.count; i += stride) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ix = Math.floor(x / cell);
    const iy = Math.floor(y / cell);
    const iz = Math.floor(z / cell);
    const key = (ix + 4096) + (iy + 4096) * 8192 + (iz + 4096) * 8192 * 8192;
    if (seen.has(key)) continue;
    let nx = 0;
    let ny = 0;
    let nz = 1;
    if (nrm && nrm.count === pos.count) {
      nx = nrm.getX(i);
      ny = nrm.getY(i);
      nz = nrm.getZ(i);
    }
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-8) continue;
    seen.set(key, xyz.length / 3);
    xyz.push(x, y, z);
    normals.push(nx / len, ny / len, nz / len);
  }
  return {
    xyz: Float32Array.from(xyz),
    nrm: Float32Array.from(normals),
    count: xyz.length / 3,
  };
}

function cloneCloud(cloud: Cloud): Cloud {
  return {
    xyz: new Float32Array(cloud.xyz),
    nrm: new Float32Array(cloud.nrm),
    count: cloud.count,
  };
}

type Grid = {
  nearest: (x: number, y: number, z: number, maxDist: number) => number;
  around: (x: number, y: number, z: number, radius: number, limit: number) => number[];
  band: (x: number, y: number, z: number, minDist: number, maxDist: number, limit: number) => number[];
};

function cellKey(ix: number, iy: number, iz: number) {
  return (ix + 4096) + (iy + 4096) * 8192 + (iz + 4096) * 8192 * 8192;
}

function buildGrid(cloud: Cloud, cell: number): Grid {
  const size = Math.max(cell, 1e-6);
  const buckets = new Map<number, number[]>();
  for (let i = 0; i < cloud.count; i += 1) {
    const ix = Math.floor((cloud.xyz[i * 3] ?? 0) / size);
    const iy = Math.floor((cloud.xyz[i * 3 + 1] ?? 0) / size);
    const iz = Math.floor((cloud.xyz[i * 3 + 2] ?? 0) / size);
    const key = cellKey(ix, iy, iz);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(i);
    else buckets.set(key, [i]);
  }
  const visit = (
    x: number,
    y: number,
    z: number,
    maxDist: number,
    onPoint: (index: number, dist2: number) => void,
    stopAfterRing?: (ring: number) => boolean,
  ) => {
    const ix = Math.floor(x / size);
    const iy = Math.floor(y / size);
    const iz = Math.floor(z / size);
    const maxRing = Math.max(1, Math.ceil(maxDist / size));
    for (let ring = 0; ring <= maxRing; ring += 1) {
      for (let dz = -ring; dz <= ring; dz += 1) {
        for (let dy = -ring; dy <= ring; dy += 1) {
          for (let dx = -ring; dx <= ring; dx += 1) {
            if (ring > 0 && Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== ring) {
              continue;
            }
            const bucket = buckets.get(cellKey(ix + dx, iy + dy, iz + dz));
            if (!bucket) continue;
            for (const index of bucket) {
              const ox = (cloud.xyz[index * 3] ?? 0) - x;
              const oy = (cloud.xyz[index * 3 + 1] ?? 0) - y;
              const oz = (cloud.xyz[index * 3 + 2] ?? 0) - z;
              onPoint(index, ox * ox + oy * oy + oz * oz);
            }
          }
        }
      }
      if (stopAfterRing?.(ring)) return;
    }
  };
  const nearest = (x: number, y: number, z: number, maxDist: number) => {
    let best = -1;
    let bestD = maxDist * maxDist;
    visit(
      x,
      y,
      z,
      maxDist,
      (index, dist2) => {
        if (dist2 < bestD) {
          bestD = dist2;
          best = index;
        }
      },
      (ring) => best >= 0 && bestD <= ring * ring * size * size,
    );
    return best;
  };
  const around = (x: number, y: number, z: number, radius: number, limit: number) => {
    const found: Array<{ index: number; dist2: number }> = [];
    visit(x, y, z, radius, (index, dist2) => {
      if (dist2 > 1e-10 && dist2 <= radius * radius) found.push({ index, dist2 });
    });
    found.sort((a, b) => a.dist2 - b.dist2);
    return found.slice(0, limit).map((row) => row.index);
  };
  const band = (
    x: number,
    y: number,
    z: number,
    minDist: number,
    maxDist: number,
    limit: number,
  ) => {
    const inner: number[] = [];
    const outer: number[] = [];
    const mid2 = ((minDist + maxDist) * 0.5) ** 2;
    const min2 = minDist * minDist;
    const max2 = maxDist * maxDist;
    visit(x, y, z, maxDist, (index, dist2) => {
      if (dist2 < min2 || dist2 > max2) return;
      if (dist2 <= mid2) {
        if (inner.length < limit) inner.push(index);
      } else if (outer.length < limit) outer.push(index);
    });
    const mixed: number[] = [];
    const span = Math.max(inner.length, outer.length);
    for (let i = 0; i < span && mixed.length < limit; i += 1) {
      const near = inner[i];
      const far = outer[i];
      if (near != null) mixed.push(near);
      if (mixed.length >= limit) break;
      if (far != null) mixed.push(far);
    }
    return mixed;
  };
  return { nearest, around, band };
}

function mul33(a: number[][], b: number[][]) {
  const out = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      out[r][c] =
        (a[r]?.[0] ?? 0) * (b[0]?.[c] ?? 0) +
        (a[r]?.[1] ?? 0) * (b[1]?.[c] ?? 0) +
        (a[r]?.[2] ?? 0) * (b[2]?.[c] ?? 0);
    }
  }
  return out;
}

function transpose33(a: number[][]) {
  return [
    [a[0]?.[0] ?? 0, a[1]?.[0] ?? 0, a[2]?.[0] ?? 0],
    [a[0]?.[1] ?? 0, a[1]?.[1] ?? 0, a[2]?.[1] ?? 0],
    [a[0]?.[2] ?? 0, a[1]?.[2] ?? 0, a[2]?.[2] ?? 0],
  ];
}

function det33(a: number[][]) {
  const a00 = a[0]?.[0] ?? 0;
  const a01 = a[0]?.[1] ?? 0;
  const a02 = a[0]?.[2] ?? 0;
  const a10 = a[1]?.[0] ?? 0;
  const a11 = a[1]?.[1] ?? 0;
  const a12 = a[1]?.[2] ?? 0;
  const a20 = a[2]?.[0] ?? 0;
  const a21 = a[2]?.[1] ?? 0;
  const a22 = a[2]?.[2] ?? 0;
  return a00 * (a11 * a22 - a12 * a21) - a01 * (a10 * a22 - a12 * a20) + a02 * (a10 * a21 - a11 * a20);
}

function column3(m: number[][], col: number) {
  return [m[0]?.[col] ?? 0, m[1]?.[col] ?? 0, m[2]?.[col] ?? 0];
}

function writeColumn3(m: number[][], col: number, v: number[]) {
  if (m[0]) m[0][col] = v[0] ?? 0;
  if (m[1]) m[1][col] = v[1] ?? 0;
  if (m[2]) m[2][col] = v[2] ?? 0;
}

function len3(v: number[]) {
  return Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
}

function dot3(a: number[], b: number[]) {
  return (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);
}

function cross3(a: number[], b: number[]) {
  return [
    (a[1] ?? 0) * (b[2] ?? 0) - (a[2] ?? 0) * (b[1] ?? 0),
    (a[2] ?? 0) * (b[0] ?? 0) - (a[0] ?? 0) * (b[2] ?? 0),
    (a[0] ?? 0) * (b[1] ?? 0) - (a[1] ?? 0) * (b[0] ?? 0),
  ];
}

/**
 * 점 3개는 한 평면이라 세 번째 특이값이 0이다.
 * 빈 열을 앞의 두 열의 외적으로 채워야 악궁 두께가 남고, 찍은 점도 맞는다.
 */
function completeWeakColumn(m: number[][]): number | null {
  const cols = [0, 1, 2].map((col) => column3(m, col));
  const lengths = cols.map(len3);
  const strong = [0, 1, 2].filter((index) => (lengths[index] ?? 0) > 0.5);
  const weak = [0, 1, 2].filter((index) => (lengths[index] ?? 0) <= 0.5);
  if (strong.length < 2) return null;
  const i = strong[0] ?? 0;
  const j = strong[1] ?? 1;
  const a = (cols[i] ?? [1, 0, 0]).map((value) => value / (lengths[i] || 1));
  const bRaw = (cols[j] ?? [0, 1, 0]).map((value) => value / (lengths[j] || 1));
  const along = dot3(a, bRaw);
  let b = [bRaw[0] - a[0] * along, bRaw[1] - a[1] * along, bRaw[2] - a[2] * along];
  const bLen = len3(b);
  if (bLen < 1e-6) return null;
  b = b.map((value) => value / bLen);
  const c = cross3(a, b);
  if (len3(c) < 1e-8) return null;
  writeColumn3(m, i, a);
  writeColumn3(m, j, b);
  const k = weak[0] ?? strong[2] ?? 2;
  writeColumn3(m, k, c);
  return k;
}

function jacobiEigen3(source: number[][]) {
  const m = source.map((row) => [...row]);
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let sweep = 0; sweep < 16; sweep += 1) {
    let p = 0;
    let q = 1;
    let max = Math.abs(m[0]?.[1] ?? 0);
    if (Math.abs(m[0]?.[2] ?? 0) > max) {
      max = Math.abs(m[0]?.[2] ?? 0);
      p = 0;
      q = 2;
    }
    if (Math.abs(m[1]?.[2] ?? 0) > max) {
      max = Math.abs(m[1]?.[2] ?? 0);
      p = 1;
      q = 2;
    }
    if (max < 1e-12) break;
    const app = m[p]?.[p] ?? 0;
    const aqq = m[q]?.[q] ?? 0;
    const apq = m[p]?.[q] ?? 0;
    if (Math.abs(apq) < 1e-15) break;
    const tau = (aqq - app) / (2 * apq);
    const tt = Math.sign(tau) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
    const c = 1 / Math.sqrt(1 + tt * tt);
    const s = tt * c;
    for (let k = 0; k < 3; k += 1) {
      if (k === p || k === q) continue;
      const aik = m[k]?.[p] ?? 0;
      const akq = m[k]?.[q] ?? 0;
      const nip = c * aik - s * akq;
      const niq = s * aik + c * akq;
      if (m[k]) {
        m[k][p] = nip;
        m[k][q] = niq;
      }
      if (m[p]) m[p][k] = nip;
      if (m[q]) m[q][k] = niq;
    }
    if (m[p]) m[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    if (m[q]) m[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    if (m[p]) m[p][q] = 0;
    if (m[q]) m[q][p] = 0;
    for (let k = 0; k < 3; k += 1) {
      const vip = v[k]?.[p] ?? 0;
      const viq = v[k]?.[q] ?? 0;
      if (!v[k]) continue;
      v[k][p] = c * vip - s * viq;
      v[k][q] = s * vip + c * viq;
    }
  }
  return {
    values: [m[0]?.[0] ?? 0, m[1]?.[1] ?? 0, m[2]?.[2] ?? 0],
    vectors: v,
  };
}

/** 대응점의 강체 변환. R * source + t ≈ target. */
function kabsch(
  src: Float32Array,
  dst: Float32Array,
  pairs: Array<{ s: number; d: number }>,
): Rigid | null {
  if (pairs.length < 3) return null;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let dx = 0;
  let dy = 0;
  let dz = 0;
  for (const pair of pairs) {
    sx += src[pair.s * 3] ?? 0;
    sy += src[pair.s * 3 + 1] ?? 0;
    sz += src[pair.s * 3 + 2] ?? 0;
    dx += dst[pair.d * 3] ?? 0;
    dy += dst[pair.d * 3 + 1] ?? 0;
    dz += dst[pair.d * 3 + 2] ?? 0;
  }
  const n = pairs.length;
  sx /= n;
  sy /= n;
  sz /= n;
  dx /= n;
  dy /= n;
  dz /= n;
  const h = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (const pair of pairs) {
    const px = (src[pair.s * 3] ?? 0) - sx;
    const py = (src[pair.s * 3 + 1] ?? 0) - sy;
    const pz = (src[pair.s * 3 + 2] ?? 0) - sz;
    const qx = (dst[pair.d * 3] ?? 0) - dx;
    const qy = (dst[pair.d * 3 + 1] ?? 0) - dy;
    const qz = (dst[pair.d * 3 + 2] ?? 0) - dz;
    h[0][0] += px * qx;
    h[0][1] += px * qy;
    h[0][2] += px * qz;
    h[1][0] += py * qx;
    h[1][1] += py * qy;
    h[1][2] += py * qz;
    h[2][0] += pz * qx;
    h[2][1] += pz * qy;
    h[2][2] += pz * qz;
  }
  const cov = mul33(transpose33(h), h);
  const eigen = jacobiEigen3(cov);
  const order = [0, 1, 2].sort(
    (a, b) => (eigen.values[b] ?? 0) - (eigen.values[a] ?? 0),
  );
  const vMat = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const uMat = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const sigmas = [0, 1, 2].map((col) => {
    const srcCol = order[col] ?? col;
    return Math.sqrt(Math.max(eigen.values[srcCol] ?? 0, 0));
  });
  const sigmaMax = Math.max(sigmas[0] ?? 0, sigmas[1] ?? 0, sigmas[2] ?? 0);
  const sigmaFloor = Math.max(sigmaMax * 1e-4, 1e-8);
  for (let col = 0; col < 3; col += 1) {
    const srcCol = order[col] ?? col;
    const sigma = sigmas[col] ?? 0;
    for (let row = 0; row < 3; row += 1) {
      vMat[row][col] = eigen.vectors[row]?.[srcCol] ?? (row === srcCol ? 1 : 0);
    }
    if (sigma <= sigmaFloor) continue;
    for (let row = 0; row < 3; row += 1) {
      uMat[row][col] =
        ((h[row]?.[0] ?? 0) * (vMat[0]?.[col] ?? 0) +
          (h[row]?.[1] ?? 0) * (vMat[1]?.[col] ?? 0) +
          (h[row]?.[2] ?? 0) * (vMat[2]?.[col] ?? 0)) /
        sigma;
    }
    const colLen = Math.hypot(uMat[0]?.[col] ?? 0, uMat[1]?.[col] ?? 0, uMat[2]?.[col] ?? 0);
    if (colLen < 1e-8) {
      if (uMat[0]) uMat[0][col] = 0;
      if (uMat[1]) uMat[1][col] = 0;
      if (uMat[2]) uMat[2][col] = 0;
      continue;
    }
    for (let row = 0; row < 3; row += 1) {
      if (uMat[row]) uMat[row][col] = (uMat[row][col] ?? 0) / colLen;
    }
  }
  const weakCol = completeWeakColumn(uMat);
  if (weakCol == null) return null;
  let r = mul33(vMat, transpose33(uMat));
  if (det33(r) < 0) {
    writeColumn3(uMat, weakCol, column3(uMat, weakCol).map((value) => -value));
    r = mul33(vMat, transpose33(uMat));
  }
  const t0 =
    dx - ((r[0]?.[0] ?? 0) * sx + (r[0]?.[1] ?? 0) * sy + (r[0]?.[2] ?? 0) * sz);
  const t1 =
    dy - ((r[1]?.[0] ?? 0) * sx + (r[1]?.[1] ?? 0) * sy + (r[1]?.[2] ?? 0) * sz);
  const t2 =
    dz - ((r[2]?.[0] ?? 0) * sx + (r[2]?.[1] ?? 0) * sy + (r[2]?.[2] ?? 0) * sz);
  return { r, t: [t0, t1, t2] };
}

function applyRigid(cloud: Cloud, rigid: Rigid) {
  const r = rigid.r;
  for (let i = 0; i < cloud.count; i += 1) {
    const x = cloud.xyz[i * 3] ?? 0;
    const y = cloud.xyz[i * 3 + 1] ?? 0;
    const z = cloud.xyz[i * 3 + 2] ?? 0;
    cloud.xyz[i * 3] =
      (r[0]?.[0] ?? 1) * x + (r[0]?.[1] ?? 0) * y + (r[0]?.[2] ?? 0) * z + rigid.t[0];
    cloud.xyz[i * 3 + 1] =
      (r[1]?.[0] ?? 0) * x + (r[1]?.[1] ?? 1) * y + (r[1]?.[2] ?? 0) * z + rigid.t[1];
    cloud.xyz[i * 3 + 2] =
      (r[2]?.[0] ?? 0) * x + (r[2]?.[1] ?? 0) * y + (r[2]?.[2] ?? 1) * z + rigid.t[2];
    const nx = cloud.nrm[i * 3] ?? 0;
    const ny = cloud.nrm[i * 3 + 1] ?? 0;
    const nz = cloud.nrm[i * 3 + 2] ?? 0;
    const nnx = (r[0]?.[0] ?? 1) * nx + (r[0]?.[1] ?? 0) * ny + (r[0]?.[2] ?? 0) * nz;
    const nny = (r[1]?.[0] ?? 0) * nx + (r[1]?.[1] ?? 1) * ny + (r[1]?.[2] ?? 0) * nz;
    const nnz = (r[2]?.[0] ?? 0) * nx + (r[2]?.[1] ?? 0) * ny + (r[2]?.[2] ?? 1) * nz;
    const len = Math.hypot(nnx, nny, nnz) || 1;
    cloud.nrm[i * 3] = nnx / len;
    cloud.nrm[i * 3 + 1] = nny / len;
    cloud.nrm[i * 3 + 2] = nnz / len;
  }
}

/** 열 길이·행렬식이 1에서 벗어나면 한 축이 사라진 변환이다. */
function matrixKeepsVolume(matrix: THREE.Matrix4) {
  const e = matrix.elements;
  const col = (index: number) =>
    Math.hypot(e[index] ?? 0, e[index + 1] ?? 0, e[index + 2] ?? 0);
  const near = (value: number) => value > 0.92 && value < 1.08;
  if (!near(col(0)) || !near(col(4)) || !near(col(8))) return false;
  const det =
    (e[0] ?? 0) * ((e[5] ?? 0) * (e[10] ?? 0) - (e[6] ?? 0) * (e[9] ?? 0)) -
    (e[4] ?? 0) * ((e[1] ?? 0) * (e[10] ?? 0) - (e[2] ?? 0) * (e[9] ?? 0)) +
    (e[8] ?? 0) * ((e[1] ?? 0) * (e[6] ?? 0) - (e[2] ?? 0) * (e[5] ?? 0));
  return det > 0.85;
}

function compose(base: THREE.Matrix4, rigid: Rigid) {
  const delta = new THREE.Matrix4().set(
    rigid.r[0]?.[0] ?? 1,
    rigid.r[0]?.[1] ?? 0,
    rigid.r[0]?.[2] ?? 0,
    rigid.t[0],
    rigid.r[1]?.[0] ?? 0,
    rigid.r[1]?.[1] ?? 1,
    rigid.r[1]?.[2] ?? 0,
    rigid.t[1],
    rigid.r[2]?.[0] ?? 0,
    rigid.r[2]?.[1] ?? 0,
    rigid.r[2]?.[2] ?? 1,
    rigid.t[2],
    0,
    0,
    0,
    1,
  );
  base.premultiply(delta);
}

function solve6(a: number[][], b: number[]) {
  const m = a.map((row, i) => [...row, b[i] ?? 0]);
  for (let col = 0; col < 6; col += 1) {
    let pivot = col;
    let best = Math.abs(m[col]?.[col] ?? 0);
    for (let row = col + 1; row < 6; row += 1) {
      const value = Math.abs(m[row]?.[col] ?? 0);
      if (value > best) {
        best = value;
        pivot = row;
      }
    }
    if (best < 1e-12) return null;
    if (pivot !== col) {
      const swap = m[col];
      m[col] = m[pivot] ?? [];
      m[pivot] = swap ?? [];
    }
    const div = m[col]?.[col] ?? 1;
    for (let k = col; k < 7; k += 1) {
      if (m[col]) m[col][k] = (m[col][k] ?? 0) / div;
    }
    for (let row = 0; row < 6; row += 1) {
      if (row === col) continue;
      const factor = m[row]?.[col] ?? 0;
      for (let k = col; k < 7; k += 1) {
        if (m[row]) m[row][k] = (m[row][k] ?? 0) - factor * (m[col]?.[k] ?? 0);
      }
    }
  }
  return [0, 1, 2, 3, 4, 5].map((i) => m[i]?.[6] ?? 0);
}

function rodrigues(rx: number, ry: number, rz: number): number[][] {
  const theta = Math.hypot(rx, ry, rz);
  if (theta < 1e-12) {
    return [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
  }
  const x = rx / theta;
  const y = ry / theta;
  const z = rz / theta;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const cc = 1 - c;
  return [
    [c + x * x * cc, x * y * cc - z * s, x * z * cc + y * s],
    [y * x * cc + z * s, c + y * y * cc, y * z * cc - x * s],
    [z * x * cc - y * s, z * y * cc + x * s, c + z * z * cc],
  ];
}

/** 평면까지 거리를 줄이는 작은 회전·이동. */
function pointToPlane(
  src: Float32Array,
  dstXyz: Float32Array,
  dstNrm: Float32Array,
  pairs: Array<{ s: number; d: number }>,
): Rigid | null {
  const ata = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => 0));
  const atb = [0, 0, 0, 0, 0, 0];
  for (const pair of pairs) {
    const px = src[pair.s * 3] ?? 0;
    const py = src[pair.s * 3 + 1] ?? 0;
    const pz = src[pair.s * 3 + 2] ?? 0;
    const qx = dstXyz[pair.d * 3] ?? 0;
    const qy = dstXyz[pair.d * 3 + 1] ?? 0;
    const qz = dstXyz[pair.d * 3 + 2] ?? 0;
    let nx = dstNrm[pair.d * 3] ?? 0;
    let ny = dstNrm[pair.d * 3 + 1] ?? 0;
    let nz = dstNrm[pair.d * 3 + 2] ?? 0;
    const nlen = Math.hypot(nx, ny, nz);
    if (nlen < 1e-8) continue;
    nx /= nlen;
    ny /= nlen;
    nz /= nlen;
    const row = [
      py * nz - pz * ny,
      pz * nx - px * nz,
      px * ny - py * nx,
      nx,
      ny,
      nz,
    ];
    const rhs = (qx - px) * nx + (qy - py) * ny + (qz - pz) * nz;
    for (let r = 0; r < 6; r += 1) {
      atb[r] = (atb[r] ?? 0) + (row[r] ?? 0) * rhs;
      for (let c = 0; c < 6; c += 1) {
        const line = ata[r];
        if (line) line[c] = (line[c] ?? 0) + (row[r] ?? 0) * (row[c] ?? 0);
      }
    }
  }
  for (let i = 0; i < 6; i += 1) {
    const line = ata[i];
    if (line) line[i] = (line[i] ?? 0) + 1e-6;
  }
  const solved = solve6(ata, atb);
  if (!solved) return null;
  let rx = solved[0] ?? 0;
  let ry = solved[1] ?? 0;
  let rz = solved[2] ?? 0;
  let tx = solved[3] ?? 0;
  let ty = solved[4] ?? 0;
  let tz = solved[5] ?? 0;
  const angle = Math.hypot(rx, ry, rz);
  if (angle > 0.18) {
    const scale = 0.18 / angle;
    rx *= scale;
    ry *= scale;
    rz *= scale;
    tx *= scale;
    ty *= scale;
    tz *= scale;
  }
  return { r: rodrigues(rx, ry, rz), t: [tx, ty, tz] };
}

type Fitness = { mean: number; inliers: number; coverage: number; sideMean: number };

/** 바이트 점 중 악궁에 붙은 비율과, 더 가까운 40%의 거리. 바이트 절반은 반대 악궁이다. */
function overlapFitness(
  source: Cloud,
  target: Cloud,
  grid: Grid,
  unitToMm: number,
): Fitness {
  const limit = mmToUnits(14, unitToMm);
  const tight = mmToUnits(0.45, unitToMm);
  const wide = mmToUnits(6, unitToMm);
  const dists: number[] = [];
  let inliers = 0;
  let inlierSum = 0;
  for (let i = 0; i < source.count; i += 1) {
    const hit = grid.nearest(
      source.xyz[i * 3] ?? 0,
      source.xyz[i * 3 + 1] ?? 0,
      source.xyz[i * 3 + 2] ?? 0,
      limit,
    );
    if (hit < 0) {
      dists.push(limit);
      continue;
    }
    const d = Math.hypot(
      (source.xyz[i * 3] ?? 0) - (target.xyz[hit * 3] ?? 0),
      (source.xyz[i * 3 + 1] ?? 0) - (target.xyz[hit * 3 + 1] ?? 0),
      (source.xyz[i * 3 + 2] ?? 0) - (target.xyz[hit * 3 + 2] ?? 0),
    );
    dists.push(d);
    if (d <= tight) {
      inliers += 1;
      inlierSum += d;
    }
  }
  if (dists.length === 0) return { mean: limit, inliers: 0, coverage: 0, sideMean: limit };
  const sourceGrid = buildGrid(source, mmToUnits(1.1, unitToMm));
  let covered = 0;
  const step = Math.max(1, Math.floor(target.count / 500));
  const targetDists: number[] = [];
  for (let i = 0; i < target.count; i += step) {
    const hit = sourceGrid.nearest(
      target.xyz[i * 3] ?? 0,
      target.xyz[i * 3 + 1] ?? 0,
      target.xyz[i * 3 + 2] ?? 0,
      wide,
    );
    if (hit < 0) {
      targetDists.push(wide);
      continue;
    }
    const d = Math.hypot(
      (target.xyz[i * 3] ?? 0) - (source.xyz[hit * 3] ?? 0),
      (target.xyz[i * 3 + 1] ?? 0) - (source.xyz[hit * 3 + 1] ?? 0),
      (target.xyz[i * 3 + 2] ?? 0) - (source.xyz[hit * 3 + 2] ?? 0),
    );
    targetDists.push(Math.min(d, wide));
    if (d <= tight) covered += 1;
  }
  const seen = targetDists.length;
  const coverage = seen > 0 ? covered / seen : 0;
  targetDists.sort((a, b) => a - b);
  const sideN = Math.max(12, Math.floor(seen * 0.4));
  let sideSum = 0;
  for (let i = 0; i < sideN; i += 1) sideSum += targetDists[i] ?? wide;
  const sideMean = sideN > 0 ? sideSum / sideN : wide;
  if (inliers >= 20) return { mean: inlierSum / inliers, inliers, coverage, sideMean };
  dists.sort((a, b) => a - b);
  const keep = Math.max(24, Math.floor(dists.length * 0.08));
  let sum = 0;
  for (let i = 0; i < keep; i += 1) sum += dists[i] ?? 0;
  return { mean: sum / keep, inliers, coverage, sideMean };
}

function orientNormals(source: Cloud, target: Cloud, grid: Grid, unitToMm: number) {
  const limit = mmToUnits(8, unitToMm);
  const dots: number[] = [];
  const step = Math.max(1, Math.floor(source.count / 250));
  for (let i = 0; i < source.count; i += step) {
    const hit = grid.nearest(
      source.xyz[i * 3] ?? 0,
      source.xyz[i * 3 + 1] ?? 0,
      source.xyz[i * 3 + 2] ?? 0,
      limit,
    );
    if (hit < 0) continue;
    dots.push(
      (source.nrm[i * 3] ?? 0) * (target.nrm[hit * 3] ?? 0) +
        (source.nrm[i * 3 + 1] ?? 0) * (target.nrm[hit * 3 + 1] ?? 0) +
        (source.nrm[i * 3 + 2] ?? 0) * (target.nrm[hit * 3 + 2] ?? 0),
    );
  }
  if (dots.length < 12) return;
  dots.sort((a, b) => a - b);
  if ((dots[Math.floor(dots.length / 2)] ?? 0) >= 0) return;
  for (let i = 0; i < source.count; i += 1) {
    source.nrm[i * 3] = -(source.nrm[i * 3] ?? 0);
    source.nrm[i * 3 + 1] = -(source.nrm[i * 3 + 1] ?? 0);
    source.nrm[i * 3 + 2] = -(source.nrm[i * 3 + 2] ?? 0);
  }
}

function collectPairs(
  source: Cloud,
  target: Cloud,
  grid: Grid,
  gate: number,
  normalMin: number,
  keepFraction: number,
) {
  const found: Array<{ s: number; d: number; dist: number }> = [];
  for (let i = 0; i < source.count; i += 1) {
    const hit = grid.nearest(
      source.xyz[i * 3] ?? 0,
      source.xyz[i * 3 + 1] ?? 0,
      source.xyz[i * 3 + 2] ?? 0,
      gate,
    );
    if (hit < 0) continue;
    const dx = (source.xyz[i * 3] ?? 0) - (target.xyz[hit * 3] ?? 0);
    const dy = (source.xyz[i * 3 + 1] ?? 0) - (target.xyz[hit * 3 + 1] ?? 0);
    const dz = (source.xyz[i * 3 + 2] ?? 0) - (target.xyz[hit * 3 + 2] ?? 0);
    const dist = Math.hypot(dx, dy, dz);
    if (dist > gate) continue;
    const dot =
      (source.nrm[i * 3] ?? 0) * (target.nrm[hit * 3] ?? 0) +
      (source.nrm[i * 3 + 1] ?? 0) * (target.nrm[hit * 3 + 1] ?? 0) +
      (source.nrm[i * 3 + 2] ?? 0) * (target.nrm[hit * 3 + 2] ?? 0);
    if (dot < normalMin) continue;
    found.push({ s: i, d: hit, dist });
  }
  found.sort((a, b) => a.dist - b.dist);
  const keep = Math.min(
    found.length,
    Math.max(40, Math.floor(source.count * keepFraction)),
  );
  return found.slice(0, keep);
}

/** 겹치는 쪽만 남겨 가며 바이트 표면에 붙인다. */
function refineToTarget(source: Cloud, target: Cloud, unitToMm: number, tightStart = false) {
  const total = new THREE.Matrix4();
  const cell = mmToUnits(1.1, unitToMm);
  const grid = buildGrid(target, cell);
  orientNormals(source, target, grid, unitToMm);
  const gates = tightStart
    ? [4.5, 3, 2, 1.3, 0.8, 0.5]
    : [12, 8, 5, 3.5, 2.4, 1.6, 1.1, 0.75, 0.55];
  for (let iter = 0; iter < gates.length; iter += 1) {
    const gate = mmToUnits(gates[iter] ?? 1, unitToMm);
    const pairs = collectPairs(source, target, grid, gate, iter < 4 ? 0.15 : 0.45, 0.22);
    if (pairs.length < 30) break;
    const fine = (gates[iter] ?? 1) <= 1.6;
    const rigid = fine
      ? pointToPlane(source.xyz, target.xyz, target.nrm, pairs)
      : kabsch(source.xyz, target.xyz, pairs);
    if (!rigid) break;
    const move = Math.hypot(rigid.t[0], rigid.t[1], rigid.t[2]);
    if (move > gate) continue;
    if (move > mmToUnits(18, unitToMm)) continue;
    applyRigid(source, rigid);
    compose(total, rigid);
  }
  return total;
}

const PPF_ANGLE_BINS = 15;
const PPF_ALPHA_BINS = 30;

function clampUnit(value: number) {
  return Math.max(-1, Math.min(1, value));
}

/** 법선을 +X 로 보내는 회전. */
function rotationToX(nx: number, ny: number, nz: number) {
  const vy = nz;
  const vz = -ny;
  const s2 = vy * vy + vz * vz;
  const c = nx;
  if (s2 < 1e-12) {
    if (c > 0) {
      return [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ];
    }
    return [
      [-1, 0, 0],
      [0, 1, 0],
      [0, 0, -1],
    ];
  }
  const k = (1 - c) / s2;
  const skew = [
    [0, -vz, vy],
    [vz, 0, 0],
    [-vy, 0, 0],
  ];
  const out = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const ident = row === col ? 1 : 0;
      const vx = row === 0 ? 0 : row === 1 ? vy : vz;
      const ux = col === 0 ? 0 : col === 1 ? vy : vz;
      out[row][col] =
        ident + (skew[row]?.[col] ?? 0) + k * (vx * ux - (row === col ? s2 : 0));
    }
  }
  return out;
}

function rotationX(alpha: number) {
  const c = Math.cos(alpha);
  const s = Math.sin(alpha);
  return [
    [1, 0, 0],
    [0, c, -s],
    [0, s, c],
  ];
}

function pairAlpha(
  rot: number[][],
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const y =
    (rot[1]?.[0] ?? 0) * dx + (rot[1]?.[1] ?? 1) * dy + (rot[1]?.[2] ?? 0) * dz;
  const z =
    (rot[2]?.[0] ?? 0) * dx + (rot[2]?.[1] ?? 0) * dy + (rot[2]?.[2] ?? 1) * dz;
  return Math.atan2(z, y);
}

function strideIds(count: number, cap: number) {
  const stride = Math.max(1, Math.ceil(count / Math.max(cap, 1)));
  const ids: number[] = [];
  for (let i = 0; i < count; i += stride) ids.push(i);
  return ids;
}

function pointPair(cloud: Cloud, i: number, j: number) {
  const ax = cloud.xyz[i * 3] ?? 0;
  const ay = cloud.xyz[i * 3 + 1] ?? 0;
  const az = cloud.xyz[i * 3 + 2] ?? 0;
  const bx = cloud.xyz[j * 3] ?? 0;
  const by = cloud.xyz[j * 3 + 1] ?? 0;
  const bz = cloud.xyz[j * 3 + 2] ?? 0;
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-8) return null;
  const inv = 1 / dist;
  const ux = dx * inv;
  const uy = dy * inv;
  const uz = dz * inv;
  const nix = cloud.nrm[i * 3] ?? 0;
  const niy = cloud.nrm[i * 3 + 1] ?? 0;
  const niz = cloud.nrm[i * 3 + 2] ?? 0;
  const njx = cloud.nrm[j * 3] ?? 0;
  const njy = cloud.nrm[j * 3 + 1] ?? 0;
  const njz = cloud.nrm[j * 3 + 2] ?? 0;
  return {
    dist,
    a1: Math.acos(clampUnit(nix * ux + niy * uy + niz * uz)),
    a2: Math.acos(clampUnit(njx * ux + njy * uy + njz * uz)),
    a3: Math.acos(clampUnit(nix * njx + niy * njy + niz * njz)),
  };
}

function angleBin(angle: number) {
  let bin = Math.floor((angle / Math.PI) * PPF_ANGLE_BINS);
  if (bin < 0) bin = 0;
  if (bin >= PPF_ANGLE_BINS) bin = PPF_ANGLE_BINS - 1;
  return bin;
}

function featureKey(dist: number, a1: number, a2: number, a3: number, distStep: number) {
  const d = Math.max(0, Math.round(dist / distStep));
  const bins = PPF_ANGLE_BINS;
  return ((d * bins + angleBin(a1)) * bins + angleBin(a2)) * bins + angleBin(a3);
}

function flipCloudNormals(cloud: Cloud): Cloud {
  const nrm = new Float32Array(cloud.nrm.length);
  for (let i = 0; i < nrm.length; i += 1) nrm[i] = -(cloud.nrm[i] ?? 0);
  return { xyz: cloud.xyz, nrm, count: cloud.count };
}

type PpfEntry = { ref: number; alpha: number };

function buildPpfHash(
  model: Cloud,
  ids: number[],
  minD: number,
  maxD: number,
  distStep: number,
) {
  const grid = buildGrid(model, Math.max(maxD / 5, 1e-4));
  const hash = new Map<number, PpfEntry[]>();
  const rots: Array<number[][] | undefined> = [];
  for (const ref of ids) {
    const rot = rotationToX(
      model.nrm[ref * 3] ?? 0,
      model.nrm[ref * 3 + 1] ?? 0,
      model.nrm[ref * 3 + 2] ?? 0,
    );
    rots[ref] = rot;
    const mates = grid.band(
      model.xyz[ref * 3] ?? 0,
      model.xyz[ref * 3 + 1] ?? 0,
      model.xyz[ref * 3 + 2] ?? 0,
      minD,
      maxD,
      18,
    );
    for (const other of mates) {
      const pair = pointPair(model, ref, other);
      if (!pair || pair.dist < minD || pair.dist > maxD) continue;
      const key = featureKey(pair.dist, pair.a1, pair.a2, pair.a3, distStep);
      const alpha = pairAlpha(
        rot,
        model.xyz[ref * 3] ?? 0,
        model.xyz[ref * 3 + 1] ?? 0,
        model.xyz[ref * 3 + 2] ?? 0,
        model.xyz[other * 3] ?? 0,
        model.xyz[other * 3 + 1] ?? 0,
        model.xyz[other * 3 + 2] ?? 0,
      );
      const bucket = hash.get(key);
      if (bucket) {
        if (bucket.length < 48) bucket.push({ ref, alpha });
      } else hash.set(key, [{ ref, alpha }]);
    }
  }
  return { hash, rots };
}

function poseFromAlignment(
  model: Cloud,
  modelRef: number,
  modelRot: number[][],
  scene: Cloud,
  sceneRef: number,
  alpha: number,
): Rigid {
  const sceneRot = rotationToX(
    scene.nrm[sceneRef * 3] ?? 0,
    scene.nrm[sceneRef * 3 + 1] ?? 0,
    scene.nrm[sceneRef * 3 + 2] ?? 0,
  );
  const r = mul33(transpose33(sceneRot), mul33(rotationX(alpha), modelRot));
  const mx = model.xyz[modelRef * 3] ?? 0;
  const my = model.xyz[modelRef * 3 + 1] ?? 0;
  const mz = model.xyz[modelRef * 3 + 2] ?? 0;
  const sx = scene.xyz[sceneRef * 3] ?? 0;
  const sy = scene.xyz[sceneRef * 3 + 1] ?? 0;
  const sz = scene.xyz[sceneRef * 3 + 2] ?? 0;
  return {
    r,
    t: [
      sx - ((r[0]?.[0] ?? 1) * mx + (r[0]?.[1] ?? 0) * my + (r[0]?.[2] ?? 0) * mz),
      sy - ((r[1]?.[0] ?? 0) * mx + (r[1]?.[1] ?? 1) * my + (r[1]?.[2] ?? 0) * mz),
      sz - ((r[2]?.[0] ?? 0) * mx + (r[2]?.[1] ?? 0) * my + (r[2]?.[2] ?? 1) * mz),
    ],
  };
}

function poseTightness(model: Cloud, scene: Cloud, rigid: Rigid, unitToMm: number) {
  const moved = cloneCloud(model);
  applyRigid(moved, rigid);
  const tight = mmToUnits(4, unitToMm);
  const grid = buildGrid(moved, mmToUnits(1.1, unitToMm));
  const step = Math.max(1, Math.floor(scene.count / 420));
  const dists: number[] = [];
  let covered = 0;
  for (let i = 0; i < scene.count; i += step) {
    const index = grid.nearest(
      scene.xyz[i * 3] ?? 0,
      scene.xyz[i * 3 + 1] ?? 0,
      scene.xyz[i * 3 + 2] ?? 0,
      tight,
    );
    if (index < 0) {
      dists.push(tight);
      continue;
    }
    const d = Math.hypot(
      (scene.xyz[i * 3] ?? 0) - (moved.xyz[index * 3] ?? 0),
      (scene.xyz[i * 3 + 1] ?? 0) - (moved.xyz[index * 3 + 1] ?? 0),
      (scene.xyz[i * 3 + 2] ?? 0) - (moved.xyz[index * 3 + 2] ?? 0),
    );
    dists.push(Math.min(d, tight));
    if (d <= mmToUnits(1.2, unitToMm)) covered += 1;
  }
  dists.sort((a, b) => a - b);
  const sideN = Math.max(8, Math.floor(dists.length * 0.4));
  let sum = 0;
  for (let i = 0; i < sideN; i += 1) sum += dists[i] ?? tight;
  return {
    side: dists.length ? sum / sideN : tight,
    cover: dists.length ? covered / dists.length : 0,
  };
}

function rotationVector(r: number[][]) {
  const trace = (r[0]?.[0] ?? 1) + (r[1]?.[1] ?? 1) + (r[2]?.[2] ?? 1);
  const angle = Math.acos(Math.max(-1, Math.min(1, (trace - 1) / 2)));
  if (angle < 1e-5) return [0, 0, 0];
  const scale = angle / (2 * Math.sin(angle));
  return [
    ((r[2]?.[1] ?? 0) - (r[1]?.[2] ?? 0)) * scale,
    ((r[0]?.[2] ?? 0) - (r[2]?.[0] ?? 0)) * scale,
    ((r[1]?.[0] ?? 0) - (r[0]?.[1] ?? 0)) * scale,
  ];
}

function cloudCentroid(cloud: Cloud): [number, number, number] {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < cloud.count; i += 1) {
    x += cloud.xyz[i * 3] ?? 0;
    y += cloud.xyz[i * 3 + 1] ?? 0;
    z += cloud.xyz[i * 3 + 2] ?? 0;
  }
  const n = Math.max(cloud.count, 1);
  return [x / n, y / n, z / n];
}

function ppfSearch(model: Cloud, scene: Cloud, unitToMm: number): Rigid | null {
  if (model.count < 40 || scene.count < 40) return null;
  const minD = mmToUnits(3.2, unitToMm);
  const maxD = mmToUnits(14, unitToMm);
  const distStep = mmToUnits(2.4, unitToMm);
  const modelIds = strideIds(model.count, 900);
  const sceneIds = strideIds(scene.count, 220);
  const { hash, rots } = buildPpfHash(model, modelIds, minD, maxD, distStep);
  const sceneGrid = buildGrid(scene, Math.max(maxD / 5, 1e-4));
  const votes = new Int32Array(model.count * PPF_ALPHA_BINS);
  const clustered = new Map<string, { votes: number; peak: number; rigid: Rigid }>();
  const clusterStep = Math.max(mmToUnits(3.5, unitToMm), 1e-4);
  const centroid = cloudCentroid(model);

  for (const ref of sceneIds) {
    votes.fill(0);
    const mates = sceneGrid.band(
      scene.xyz[ref * 3] ?? 0,
      scene.xyz[ref * 3 + 1] ?? 0,
      scene.xyz[ref * 3 + 2] ?? 0,
      minD,
      maxD,
      16,
    );
    const sceneRot = rotationToX(
      scene.nrm[ref * 3] ?? 0,
      scene.nrm[ref * 3 + 1] ?? 0,
      scene.nrm[ref * 3 + 2] ?? 0,
    );
    for (const other of mates) {
      const pair = pointPair(scene, ref, other);
      if (!pair || pair.dist < minD || pair.dist > maxD) continue;
      const key = featureKey(pair.dist, pair.a1, pair.a2, pair.a3, distStep);
      const bucket = hash.get(key);
      if (!bucket) continue;
      const alphaS = pairAlpha(
        sceneRot,
        scene.xyz[ref * 3] ?? 0,
        scene.xyz[ref * 3 + 1] ?? 0,
        scene.xyz[ref * 3 + 2] ?? 0,
        scene.xyz[other * 3] ?? 0,
        scene.xyz[other * 3 + 1] ?? 0,
        scene.xyz[other * 3 + 2] ?? 0,
      );
      for (const entry of bucket) {
        let delta = alphaS - entry.alpha;
        delta %= Math.PI * 2;
        if (delta < 0) delta += Math.PI * 2;
        const bin = Math.round((delta / (Math.PI * 2)) * PPF_ALPHA_BINS) % PPF_ALPHA_BINS;
        votes[entry.ref * PPF_ALPHA_BINS + bin] += 1;
      }
    }
    let bestVotes = 0;
    let bestIndex = -1;
    let bestBin = 0;
    for (let m = 0; m < model.count; m += 1) {
      const base = m * PPF_ALPHA_BINS;
      for (let bin = 0; bin < PPF_ALPHA_BINS; bin += 1) {
        const prev = votes[base + ((bin + PPF_ALPHA_BINS - 1) % PPF_ALPHA_BINS)] ?? 0;
        const cur = votes[base + bin] ?? 0;
        const next = votes[base + ((bin + 1) % PPF_ALPHA_BINS)] ?? 0;
        const score = prev + cur + next;
        if (score > bestVotes) {
          bestVotes = score;
          bestIndex = m;
          bestBin = bin;
        }
      }
    }
    if (bestVotes < 4 || bestIndex < 0) continue;
    const modelRot = rots[bestIndex];
    if (!modelRot) continue;
    const alpha = (bestBin / PPF_ALPHA_BINS) * Math.PI * 2;
    const rigid = poseFromAlignment(model, bestIndex, modelRot, scene, ref, alpha);
    const rv = rotationVector(rigid.r);
    const mx = centroid[0];
    const my = centroid[1];
    const mz = centroid[2];
    const px =
      (rigid.r[0]?.[0] ?? 1) * mx +
      (rigid.r[0]?.[1] ?? 0) * my +
      (rigid.r[0]?.[2] ?? 0) * mz +
      rigid.t[0];
    const py =
      (rigid.r[1]?.[0] ?? 0) * mx +
      (rigid.r[1]?.[1] ?? 1) * my +
      (rigid.r[1]?.[2] ?? 0) * mz +
      rigid.t[1];
    const pz =
      (rigid.r[2]?.[0] ?? 0) * mx +
      (rigid.r[2]?.[1] ?? 0) * my +
      (rigid.r[2]?.[2] ?? 1) * mz +
      rigid.t[2];
    const cell = [
      Math.round(px / clusterStep),
      Math.round(py / clusterStep),
      Math.round(pz / clusterStep),
      Math.round((rv[0] ?? 0) / 0.2),
      Math.round((rv[1] ?? 0) / 0.2),
      Math.round((rv[2] ?? 0) / 0.2),
    ].join(":");
    const prev = clustered.get(cell);
    if (!prev || bestVotes > prev.peak) {
      clustered.set(cell, { votes: (prev?.votes ?? 0) + bestVotes, peak: bestVotes, rigid });
    } else {
      prev.votes += bestVotes;
    }
  }

  const ranked = [...clustered.values()].sort((a, b) => b.votes - a.votes).slice(0, 20);
  let best: Rigid | null = null;
  let bestSide = mmToUnits(1.15, unitToMm);
  for (const row of ranked) {
    const quality = poseTightness(model, scene, row.rigid, unitToMm);
    if (quality.cover < 0.1) continue;
    if (quality.side < bestSide) {
      bestSide = quality.side;
      best = row.rigid;
    }
  }
  return best;
}

/** 악궁을 바이트 위로 보내는 처음 자세. 법선이 뒤집혀 있으면 한 번 더 본다. */
function globalPose(source: Cloud, target: Cloud, unitToMm: number) {
  const first = ppfSearch(source, target, unitToMm);
  const firstQ = first ? poseTightness(source, target, first, unitToMm) : null;
  if (first && firstQ && firstQ.side <= mmToUnits(0.8, unitToMm) && firstQ.cover >= 0.14) {
    return first;
  }
  const flipped = ppfSearch(flipCloudNormals(source), target, unitToMm);
  if (!flipped) return first;
  const flippedQ = poseTightness(source, target, flipped, unitToMm);
  if (!firstQ || flippedQ.side < firstQ.side) return flipped;
  return first;
}
function excludeMatched(target: Cloud, aligned: Cloud, unitToMm: number): Cloud {
  const thresh = mmToUnits(0.7, unitToMm);
  const grid = buildGrid(aligned, mmToUnits(1, unitToMm));
  const xyz: number[] = [];
  const nrm: number[] = [];
  for (let i = 0; i < target.count; i += 1) {
    const hit = grid.nearest(
      target.xyz[i * 3] ?? 0,
      target.xyz[i * 3 + 1] ?? 0,
      target.xyz[i * 3 + 2] ?? 0,
      thresh,
    );
    if (hit >= 0) {
      const d = Math.hypot(
        (target.xyz[i * 3] ?? 0) - (aligned.xyz[hit * 3] ?? 0),
        (target.xyz[i * 3 + 1] ?? 0) - (aligned.xyz[hit * 3 + 1] ?? 0),
        (target.xyz[i * 3 + 2] ?? 0) - (aligned.xyz[hit * 3 + 2] ?? 0),
      );
      if (d <= thresh) continue;
    }
    xyz.push(
      target.xyz[i * 3] ?? 0,
      target.xyz[i * 3 + 1] ?? 0,
      target.xyz[i * 3 + 2] ?? 0,
    );
    nrm.push(
      target.nrm[i * 3] ?? 0,
      target.nrm[i * 3 + 1] ?? 0,
      target.nrm[i * 3 + 2] ?? 0,
    );
  }
  if (xyz.length / 3 < 80) return target;
  return { xyz: Float32Array.from(xyz), nrm: Float32Array.from(nrm), count: xyz.length / 3 };
}

type ArchFit = {
  geometry: THREE.BufferGeometry;
  role: string;
  matrix: THREE.Matrix4;
  before: number;
  after: number;
  inliers: number;
  aligned: Cloud;
  original: Cloud;
  seated: boolean;
  side: number;
};


function seatedFit(fit: Fitness, unitToMm: number) {
  // 바이트의 가까운 40%가 붙으면 그 악궁 쪽이다. 반대 악궁이 나머지 절반이라 전체를 요구하지 않는다.
  return fit.sideMean <= mmToUnits(0.72, unitToMm) && fit.coverage >= 0.05;
}

function alignArch(source: Cloud, target: Cloud, unitToMm: number) {
  const grid = buildGrid(target, mmToUnits(1.2, unitToMm));
  const before = overlapFitness(source, target, grid, unitToMm);
  const already = seatedFit(before, unitToMm) && before.sideMean <= mmToUnits(0.32, unitToMm);
  if (already) {
    return {
      matrix: new THREE.Matrix4(),
      before: before.mean,
      after: before.mean,
      inliers: before.inliers,
      cloud: source,
      seated: true,
      side: before.sideMean,
    };
  }
  const local = cloneCloud(source);
  const localMatrix = refineToTarget(local, target, unitToMm);
  const localFit = overlapFitness(
    local,
    target,
    buildGrid(target, mmToUnits(1.2, unitToMm)),
    unitToMm,
  );
  let bestCloud = local;
  let bestMatrix = localMatrix;
  let bestFit = localFit;
  const deepEnough = localFit.coverage >= 0.28 && localFit.sideMean < mmToUnits(0.28, unitToMm);
  if (!deepEnough) {
    const pose = globalPose(source, target, unitToMm);
    if (pose) {
      let globalCloud = cloneCloud(source);
      applyRigid(globalCloud, pose);
      let matrix = new THREE.Matrix4();
      compose(matrix, pose);
      const coarse = overlapFitness(
        globalCloud,
        target,
        buildGrid(target, mmToUnits(1.2, unitToMm)),
        unitToMm,
      );
      const refined = refineToTarget(globalCloud, target, unitToMm, true);
      matrix.premultiply(refined);
      let fit = overlapFitness(
        globalCloud,
        target,
        buildGrid(target, mmToUnits(1.2, unitToMm)),
        unitToMm,
      );
      if (coarse.sideMean + mmToUnits(0.05, unitToMm) < fit.sideMean) {
        const posed = cloneCloud(source);
        applyRigid(posed, pose);
        globalCloud = posed;
        matrix = new THREE.Matrix4();
        compose(matrix, pose);
        fit = coarse;
      }
      if (
        fit.coverage > bestFit.coverage + 0.05 ||
        (fit.coverage >= bestFit.coverage - 0.02 && fit.sideMean < bestFit.sideMean)
      ) {
        bestCloud = globalCloud;
        bestMatrix = matrix;
        bestFit = fit;
      }
    }
  }
  const improved =
    bestFit.coverage > before.coverage + 0.08 ||
    bestFit.sideMean + mmToUnits(0.15, unitToMm) < before.sideMean;
  if (!seatedFit(bestFit, unitToMm) || !improved) {
    return {
      matrix: new THREE.Matrix4(),
      before: before.mean,
      after: before.mean,
      inliers: before.inliers,
      cloud: source,
      seated: false,
      side: before.sideMean,
    };
  }
  return {
    matrix: bestMatrix,
    before: before.mean,
    after: bestFit.mean,
    inliers: bestFit.inliers,
    cloud: bestCloud,
    seated: true,
    side: bestFit.sideMean,
  };
}


function mergeGeometries(geometries: THREE.BufferGeometry[]) {
  const xyz: number[] = [];
  const nrm: number[] = [];
  for (const geometry of geometries) {
    const cloud = sampleGeometry(geometry, 0.9, 2800);
    for (let i = 0; i < cloud.count; i += 1) {
      xyz.push(cloud.xyz[i * 3] ?? 0, cloud.xyz[i * 3 + 1] ?? 0, cloud.xyz[i * 3 + 2] ?? 0);
      nrm.push(cloud.nrm[i * 3] ?? 0, cloud.nrm[i * 3 + 1] ?? 0, cloud.nrm[i * 3 + 2] ?? 0);
    }
  }
  return { xyz: Float32Array.from(xyz), nrm: Float32Array.from(nrm), count: xyz.length / 3 };
}

function cropNear(cloud: Cloud, ref: Cloud, thresh: number): Cloud {
  const grid = buildGrid(ref, Math.max(thresh * 0.75, 1e-4));
  const xyz: number[] = [];
  const nrm: number[] = [];
  for (let i = 0; i < cloud.count; i += 1) {
    const hit = grid.nearest(
      cloud.xyz[i * 3] ?? 0,
      cloud.xyz[i * 3 + 1] ?? 0,
      cloud.xyz[i * 3 + 2] ?? 0,
      thresh,
    );
    if (hit < 0) continue;
    const d = Math.hypot(
      (cloud.xyz[i * 3] ?? 0) - (ref.xyz[hit * 3] ?? 0),
      (cloud.xyz[i * 3 + 1] ?? 0) - (ref.xyz[hit * 3 + 1] ?? 0),
      (cloud.xyz[i * 3 + 2] ?? 0) - (ref.xyz[hit * 3 + 2] ?? 0),
    );
    if (d > thresh) continue;
    xyz.push(cloud.xyz[i * 3] ?? 0, cloud.xyz[i * 3 + 1] ?? 0, cloud.xyz[i * 3 + 2] ?? 0);
    nrm.push(cloud.nrm[i * 3] ?? 0, cloud.nrm[i * 3 + 1] ?? 0, cloud.nrm[i * 3 + 2] ?? 0);
  }
  return { xyz: Float32Array.from(xyz), nrm: Float32Array.from(nrm), count: xyz.length / 3 };
}

/**
 * 바이트가 있으면 상악·하악을 그 표면에 맞춘다.
 * 이미 맞거나, 맞춰도 더 나아지지 않으면 좌표를 건드리지 않는다.
 */
export async function registerJawsToBite(
  entries: Array<{ role: string; geometry: THREE.BufferGeometry }>,
  options?: { cancelled?: () => boolean },
): Promise<boolean> {
  const bite = entries.filter((entry) => entry.role === "bite");
  const arches = entries.filter(
    (entry) => entry.role === "upper" || entry.role === "lower",
  );
  if (bite.length === 0 || arches.length === 0) return false;
  for (const entry of entries) {
    if (!entry.geometry.getAttribute("normal")) entry.geometry.computeVertexNormals();
  }
  await yieldFrame();
  if (options?.cancelled?.()) return false;
  const biteCloud = mergeGeometries(bite.map((entry) => entry.geometry));
  if (biteCloud.count < 80) return false;
  const unitToMm = geometryUnits(biteCloud, arches.map((entry) => entry.geometry));
  const order = [...arches].sort((a, b) => {
    const af = roughGap(a.geometry, biteCloud, unitToMm);
    const bf = roughGap(b.geometry, biteCloud, unitToMm);
    return af - bf;
  });
  let target = biteCloud;
  const fitted: ArchFit[] = [];
  for (const entry of order) {
    if (options?.cancelled?.()) return false;
    const source = sampleGeometry(entry.geometry, mmToUnits(0.95, unitToMm), 2400);
    if (source.count < 80) continue;
    const radius = cloudRadius(source);
    const biteRadius = cloudRadius(target);
    if (radius > 1 && biteRadius > 1) {
      const ratio = radius / biteRadius;
      if (ratio > 8 || ratio < 0.05) continue;
    }
    const aligned = alignArch(source, target, unitToMm);
    fitted.push({
      geometry: entry.geometry,
      role: entry.role,
      matrix: aligned.matrix,
      before: aligned.before,
      after: aligned.after,
      inliers: aligned.inliers,
      aligned: aligned.cloud,
      original: source,
      seated: aligned.seated,
      side: aligned.side,
    });
    if (aligned.seated) {
      target = excludeMatched(target, aligned.cloud, unitToMm);
    }
    await yieldFrame();
  }
  const upperRow = fitted.find((row) => row.role === "upper" && row.seated);
  const lowerRow = fitted.find((row) => row.role === "lower" && row.seated);
  if (upperRow && lowerRow) {
    const near = mmToUnits(1.2, unitToMm);
    const upperOnBite = cropNear(upperRow.aligned, biteCloud, near);
    const lowerOnBite = cropNear(lowerRow.aligned, biteCloud, near);
    const uc = cloudCentroid(upperOnBite);
    const lc = cloudCentroid(lowerOnBite);
    const gap = Math.hypot(uc[0] - lc[0], uc[1] - lc[1], uc[2] - lc[2]);
    if (gap < mmToUnits(4, unitToMm)) {
      const drop = upperRow.side > lowerRow.side + mmToUnits(0.05, unitToMm) ? upperRow : lowerRow;
      const keep = drop === upperRow ? lowerRow : upperRow;
      const remain = excludeMatched(biteCloud, keep.aligned, unitToMm);
      const again = alignArch(drop.original, remain, unitToMm);
      const againOnBite = cropNear(again.cloud, biteCloud, near);
      const keepOnBite = cropNear(keep.aligned, biteCloud, near);
      const ac = cloudCentroid(againOnBite);
      const kc = cloudCentroid(keepOnBite);
      const againGap = Math.hypot(ac[0] - kc[0], ac[1] - kc[1], ac[2] - kc[2]);
      if (again.seated && againOnBite.count > 30 && againGap >= mmToUnits(4, unitToMm)) {
        drop.matrix.copy(again.matrix);
        drop.aligned = again.cloud;
        drop.side = again.side;
        drop.after = again.after;
        drop.inliers = again.inliers;
        drop.seated = true;
      } else {
        drop.matrix.identity();
      }
    }
  }
  let seated = false;
  for (const row of fitted) {
    if (row.seated) seated = true;
    if (row.matrix.equals(new THREE.Matrix4())) continue;
    row.geometry.applyMatrix4(row.matrix);
    row.geometry.computeVertexNormals();
    row.geometry.computeBoundingBox();
    console.info("[oral-scan] bite-fit", {
      role: row.role,
      beforeMm: Number((row.before * unitToMm).toFixed(3)),
      afterMm: Number((row.after * unitToMm).toFixed(3)),
      inliers: row.inliers,
    });
  }
  return seated;
}

function geometryUnits(bite: Cloud, arches: THREE.BufferGeometry[]) {
  let radius = cloudRadius(bite);
  for (const geometry of arches) {
    geometry.computeBoundingSphere();
    radius = Math.max(radius, geometry.boundingSphere?.radius ?? 0);
  }
  if (radius > 0 && radius < 5) return 1000;
  if (radius > 400) return 0.001;
  return 1;
}

function roughGap(geometry: THREE.BufferGeometry, target: Cloud, unitToMm: number) {
  const source = sampleGeometry(geometry, mmToUnits(1.4, unitToMm), 600);
  const grid = buildGrid(target, mmToUnits(1.4, unitToMm));
  return overlapFitness(source, target, grid, unitToMm).mean;
}

type Xyz = [number, number, number];

function rigidPoint(rigid: Rigid, point: Xyz): Xyz {
  const r = rigid.r;
  const x = point[0];
  const y = point[1];
  const z = point[2];
  return [
    (r[0]?.[0] ?? 1) * x + (r[0]?.[1] ?? 0) * y + (r[0]?.[2] ?? 0) * z + rigid.t[0],
    (r[1]?.[0] ?? 0) * x + (r[1]?.[1] ?? 1) * y + (r[1]?.[2] ?? 0) * z + rigid.t[1],
    (r[2]?.[0] ?? 0) * x + (r[2]?.[1] ?? 0) * y + (r[2]?.[2] ?? 1) * z + rigid.t[2],
  ];
}

function pairCloud(points: Xyz[]): Cloud {
  const xyz = new Float32Array(points.length * 3);
  const nrm = new Float32Array(points.length * 3);
  points.forEach((point, index) => {
    xyz[index * 3] = point[0];
    xyz[index * 3 + 1] = point[1];
    xyz[index * 3 + 2] = point[2];
    nrm[index * 3 + 2] = 1;
  });
  return { xyz, nrm, count: points.length };
}

function cloudPoint(cloud: Cloud, index: number): Xyz {
  return [
    cloud.xyz[index * 3] ?? 0,
    cloud.xyz[index * 3 + 1] ?? 0,
    cloud.xyz[index * 3 + 2] ?? 0,
  ];
}

/**
 * 찍은 바이트 점 근처에서, 악궁 조각과 가장 맞는 대응점을 고른다.
 */
function correlateNearClick(
  patch: Xyz[],
  moved: Xyz,
  userBite: Xyz,
  bite: Cloud,
  biteGrid: Grid,
  unitToMm: number,
): Xyz {
  const search = mmToUnits(3.2, unitToMm);
  const gate = mmToUnits(2.6, unitToMm);
  const candidates = biteGrid.around(userBite[0], userBite[1], userBite[2], search, 56);
  const score = (target: Xyz) => {
    const dx = target[0] - moved[0];
    const dy = target[1] - moved[1];
    const dz = target[2] - moved[2];
    let sum = 0;
    for (const point of patch) {
      const hit = biteGrid.nearest(point[0] + dx, point[1] + dy, point[2] + dz, gate);
      if (hit < 0) {
        sum += gate;
        continue;
      }
      sum += Math.hypot(
        point[0] + dx - (bite.xyz[hit * 3] ?? 0),
        point[1] + dy - (bite.xyz[hit * 3 + 1] ?? 0),
        point[2] + dz - (bite.xyz[hit * 3 + 2] ?? 0),
      );
    }
    return sum / Math.max(patch.length, 1);
  };
  let best = userBite;
  let bestScore = score(userBite);
  for (const index of candidates) {
    const point = cloudPoint(bite, index);
    const next = score(point);
    if (next + mmToUnits(0.02, unitToMm) < bestScore) {
      bestScore = next;
      best = point;
    }
  }
  return best;
}

function cropNearPoints(cloud: Cloud, points: Xyz[], radius: number): Cloud {
  const xyz: number[] = [];
  const nrm: number[] = [];
  for (let i = 0; i < cloud.count; i += 1) {
    const p = cloudPoint(cloud, i);
    let near = false;
    for (const point of points) {
      if (Math.hypot(p[0] - point[0], p[1] - point[1], p[2] - point[2]) <= radius) {
        near = true;
        break;
      }
    }
    if (!near) continue;
    xyz.push(p[0], p[1], p[2]);
    nrm.push(
      cloud.nrm[i * 3] ?? 0,
      cloud.nrm[i * 3 + 1] ?? 0,
      cloud.nrm[i * 3 + 2] ?? 0,
    );
  }
  return { xyz: Float32Array.from(xyz), nrm: Float32Array.from(nrm), count: xyz.length / 3 };
}

/**
 * 모델 점 3개와 바이트 점 3개로 강체를 잡고, 각 점 근처에서 대응점을 고쳐 맞춘다.
 * 바이트는 그대로 두고 악궁 기하에만 변환을 쓴다.
 */
export async function mergeArchToBiteByPoints(
  arches: THREE.BufferGeometry[],
  bites: THREE.BufferGeometry[],
  archPoints: Xyz[],
  bitePoints: Xyz[],
): Promise<boolean> {
  if (arches.length === 0 || bites.length === 0) return false;
  if (archPoints.length < 3 || bitePoints.length < 3) return false;
  for (const geometry of [...arches, ...bites]) {
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  }
  await yieldFrame();
  const archCloud = mergeGeometries(arches);
  const biteCloud = mergeGeometries(bites);
  if (archCloud.count < 40 || biteCloud.count < 40) return false;
  const unitToMm = geometryUnits(biteCloud, arches);
  const src = archPoints.slice(0, 3);
  const dst = bitePoints.slice(0, 3);
  const rough = kabsch(pairCloud(src).xyz, pairCloud(dst).xyz, [
    { s: 0, d: 0 },
    { s: 1, d: 1 },
    { s: 2, d: 2 },
  ]);
  if (!rough) return false;
  const archGrid = buildGrid(archCloud, mmToUnits(1.1, unitToMm));
  const biteGrid = buildGrid(biteCloud, mmToUnits(1.1, unitToMm));
  const patchR = mmToUnits(2.4, unitToMm);
  const refined: Xyz[] = [];
  for (let i = 0; i < 3; i += 1) {
    const origin = src[i] ?? [0, 0, 0];
    const userBite = dst[i] ?? origin;
    const moved = rigidPoint(rough, origin);
    const around = archGrid.around(origin[0], origin[1], origin[2], patchR, 80);
    const patch = around.map((index) => rigidPoint(rough, cloudPoint(archCloud, index)));
    patch.push(moved);
    refined.push(correlateNearClick(patch, moved, userBite, biteCloud, biteGrid, unitToMm));
    await yieldFrame();
  }
  const rigid = kabsch(pairCloud(src).xyz, pairCloud(refined).xyz, [
    { s: 0, d: 0 },
    { s: 1, d: 1 },
    { s: 2, d: 2 },
  ]);
  if (!rigid) return false;
  const posed = cloneCloud(archCloud);
  applyRigid(posed, rigid);
  const marks = src.map((point) => rigidPoint(rigid, point));
  const local = cropNearPoints(posed, marks, mmToUnits(8, unitToMm));
  const matrix = new THREE.Matrix4();
  compose(matrix, rigid);
  if (!matrixKeepsVolume(matrix)) return false;
  if (local.count >= 80) {
    const before = overlapFitness(
      local,
      biteCloud,
      buildGrid(biteCloud, mmToUnits(1.2, unitToMm)),
      unitToMm,
    );
    const seated = cloneCloud(local);
    const icp = refineToTarget(seated, biteCloud, unitToMm, true);
    const after = overlapFitness(
      seated,
      biteCloud,
      buildGrid(biteCloud, mmToUnits(1.2, unitToMm)),
      unitToMm,
    );
    if (after.sideMean <= before.sideMean + mmToUnits(0.04, unitToMm)) {
      matrix.premultiply(icp);
    }
  }
  if (!matrixKeepsVolume(matrix)) return false;
  for (const geometry of arches) {
    geometry.applyMatrix4(matrix);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  return true;
}
