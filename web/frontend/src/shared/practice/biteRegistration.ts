// 협측 바이트에 상악·하악을 붙인다. 바이트는 그대로 두고 악궁만 강체 변환한다.
// 바이트는 치아의 일부만 겹치므로, 가까운 대응만 남기는 trimmed ICP로 맞춘다.
// 어긋남이 크면 FPFH 특징 + RANSAC으로 처음 자세를 잡고, point-to-plane으로 다듬는다.
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

const FEATURE_BINS = 11;
const FEATURE_LEN = FEATURE_BINS * 3;

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
  return { nearest, around };
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
  for (let col = 0; col < 3; col += 1) {
    const srcCol = order[col] ?? col;
    const sigma = Math.sqrt(Math.max(eigen.values[srcCol] ?? 0, 0));
    for (let row = 0; row < 3; row += 1) {
      vMat[row][col] = eigen.vectors[row]?.[srcCol] ?? (row === srcCol ? 1 : 0);
    }
    if (sigma > 1e-8) {
      for (let row = 0; row < 3; row += 1) {
        uMat[row][col] =
          ((h[row]?.[0] ?? 0) * (vMat[0]?.[col] ?? 0) +
            (h[row]?.[1] ?? 0) * (vMat[1]?.[col] ?? 0) +
            (h[row]?.[2] ?? 0) * (vMat[2]?.[col] ?? 0)) /
          sigma;
      }
    }
  }
  if ((uMat[0]?.[2] ?? 0) === 0 && (uMat[1]?.[2] ?? 0) === 0 && (uMat[2]?.[2] ?? 0) === 0) {
    const c0 = [uMat[0]?.[0] ?? 1, uMat[1]?.[0] ?? 0, uMat[2]?.[0] ?? 0];
    const c1 = [uMat[0]?.[1] ?? 0, uMat[1]?.[1] ?? 1, uMat[2]?.[1] ?? 0];
    uMat[0][2] = (c0[1] ?? 0) * (c1[2] ?? 0) - (c0[2] ?? 0) * (c1[1] ?? 0);
    uMat[1][2] = (c0[2] ?? 0) * (c1[0] ?? 0) - (c0[0] ?? 0) * (c1[2] ?? 0);
    uMat[2][2] = (c0[0] ?? 0) * (c1[1] ?? 0) - (c0[1] ?? 0) * (c1[0] ?? 0);
  }
  let r = mul33(vMat, transpose33(uMat));
  if (det33(r) < 0) {
    vMat[0][2] = -(vMat[0]?.[2] ?? 0);
    vMat[1][2] = -(vMat[1]?.[2] ?? 0);
    vMat[2][2] = -(vMat[2]?.[2] ?? 0);
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

type Fitness = { mean: number; inliers: number; coverage: number };

/** 가장 가까운 일부만 본다. 바이트는 악궁 전체와 겹치지 않는다. */
function overlapFitness(
  source: Cloud,
  target: Cloud,
  grid: Grid,
  unitToMm: number,
): Fitness {
  const limit = mmToUnits(14, unitToMm);
  const tight = mmToUnits(0.4, unitToMm);
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
  if (dists.length === 0) return { mean: limit, inliers: 0, coverage: 0 };
  const sourceGrid = buildGrid(source, mmToUnits(1.1, unitToMm));
  let covered = 0;
  const step = Math.max(1, Math.floor(target.count / 500));
  let seen = 0;
  for (let i = 0; i < target.count; i += step) {
    const hit = sourceGrid.nearest(
      target.xyz[i * 3] ?? 0,
      target.xyz[i * 3 + 1] ?? 0,
      target.xyz[i * 3 + 2] ?? 0,
      tight,
    );
    seen += 1;
    if (hit < 0) continue;
    const d = Math.hypot(
      (target.xyz[i * 3] ?? 0) - (source.xyz[hit * 3] ?? 0),
      (target.xyz[i * 3 + 1] ?? 0) - (source.xyz[hit * 3 + 1] ?? 0),
      (target.xyz[i * 3 + 2] ?? 0) - (source.xyz[hit * 3 + 2] ?? 0),
    );
    if (d <= tight) covered += 1;
  }
  const coverage = seen > 0 ? covered / seen : 0;
  if (inliers >= 20) return { mean: inlierSum / inliers, inliers, coverage };
  dists.sort((a, b) => a - b);
  const keep = Math.max(24, Math.floor(dists.length * 0.08));
  let sum = 0;
  for (let i = 0; i < keep; i += 1) sum += dists[i] ?? 0;
  return { mean: sum / keep, inliers, coverage };
}

function sameSurfaceFraction(a: Cloud, b: Cloud, unitToMm: number) {
  if (a.count < 20 || b.count < 20) return 0;
  const grid = buildGrid(b, mmToUnits(1.2, unitToMm));
  const tight = mmToUnits(0.45, unitToMm);
  const limit = mmToUnits(2, unitToMm);
  let close = 0;
  const step = Math.max(1, Math.floor(a.count / 400));
  let seen = 0;
  for (let i = 0; i < a.count; i += step) {
    const hit = grid.nearest(
      a.xyz[i * 3] ?? 0,
      a.xyz[i * 3 + 1] ?? 0,
      a.xyz[i * 3 + 2] ?? 0,
      limit,
    );
    seen += 1;
    if (hit < 0) continue;
    const d = Math.hypot(
      (a.xyz[i * 3] ?? 0) - (b.xyz[hit * 3] ?? 0),
      (a.xyz[i * 3 + 1] ?? 0) - (b.xyz[hit * 3 + 1] ?? 0),
      (a.xyz[i * 3 + 2] ?? 0) - (b.xyz[hit * 3 + 2] ?? 0),
    );
    if (d <= tight) close += 1;
  }
  return seen > 0 ? close / seen : 0;
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
    ? [2.2, 1.5, 1, 0.7, 0.5]
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
    if (move > mmToUnits(18, unitToMm)) continue;
    applyRigid(source, rigid);
    compose(total, rigid);
  }
  return total;
}

function histBin(value: number, min: number, max: number) {
  const t = (value - min) / (max - min);
  return Math.min(FEATURE_BINS - 1, Math.max(0, Math.floor(t * FEATURE_BINS)));
}

function neighborIds(cloud: Cloud, grid: Grid, index: number, radius: number, limit: number) {
  return grid.around(
    cloud.xyz[index * 3] ?? 0,
    cloud.xyz[index * 3 + 1] ?? 0,
    cloud.xyz[index * 3 + 2] ?? 0,
    radius,
    limit,
  );
}

function featureCloud(cloud: Cloud, unitToMm: number, indices: number[]) {
  const radius = mmToUnits(6.5, unitToMm);
  const grid = buildGrid(cloud, mmToUnits(1.6, unitToMm));
  const out: Float32Array[] = [];
  for (const i of indices) {
    const ids = neighborIds(cloud, grid, i, radius, 16);
    const hist = new Float32Array(FEATURE_LEN);
    const nx = cloud.nrm[i * 3] ?? 0;
    const ny = cloud.nrm[i * 3 + 1] ?? 0;
    const nz = cloud.nrm[i * 3 + 2] ?? 0;
    for (const j of ids) {
      let dx = (cloud.xyz[j * 3] ?? 0) - (cloud.xyz[i * 3] ?? 0);
      let dy = (cloud.xyz[j * 3 + 1] ?? 0) - (cloud.xyz[i * 3 + 1] ?? 0);
      let dz = (cloud.xyz[j * 3 + 2] ?? 0) - (cloud.xyz[i * 3 + 2] ?? 0);
      const len = Math.hypot(dx, dy, dz);
      if (len < 1e-6) continue;
      dx /= len;
      dy /= len;
      dz /= len;
      const n2x = cloud.nrm[j * 3] ?? 0;
      const n2y = cloud.nrm[j * 3 + 1] ?? 0;
      const n2z = cloud.nrm[j * 3 + 2] ?? 0;
      let vx = dy * nz - dz * ny;
      let vy = dz * nx - dx * nz;
      let vz = dx * ny - dy * nx;
      const vlen = Math.hypot(vx, vy, vz);
      if (vlen < 1e-6) continue;
      vx /= vlen;
      vy /= vlen;
      vz /= vlen;
      const wx = ny * vz - nz * vy;
      const wy = nz * vx - nx * vz;
      const wz = nx * vy - ny * vx;
      const f1 = vx * n2x + vy * n2y + vz * n2z;
      const f2 = nx * dx + ny * dy + nz * dz;
      const f3 = Math.atan2(wx * n2x + wy * n2y + wz * n2z, nx * n2x + ny * n2y + nz * n2z);
      hist[histBin(f1, -1, 1)] += 1;
      hist[FEATURE_BINS + histBin(f2, -1, 1)] += 1;
      hist[FEATURE_BINS * 2 + histBin(f3, -Math.PI, Math.PI)] += 1;
    }
    let sum = 0;
    for (let k = 0; k < FEATURE_LEN; k += 1) sum += hist[k] ?? 0;
    if (sum > 0) {
      for (let k = 0; k < FEATURE_LEN; k += 1) hist[k] = (hist[k] ?? 0) / sum;
    }
    out.push(hist);
  }
  return out;
}

function featureDistance(a: Float32Array, b: Float32Array) {
  let sum = 0;
  for (let i = 0; i < FEATURE_LEN; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    const den = av + bv + 1e-4;
    const diff = av - bv;
    sum += (diff * diff) / den;
  }
  return sum;
}

function salientIds(cloud: Cloud, unitToMm: number, cap: number) {
  const grid = buildGrid(cloud, mmToUnits(1.4, unitToMm));
  const radius = mmToUnits(2.4, unitToMm);
  const step = Math.max(1, Math.floor(cloud.count / 700));
  const scores: Array<{ index: number; bend: number }> = [];
  for (let i = 0; i < cloud.count; i += step) {
    const ids = grid.around(
      cloud.xyz[i * 3] ?? 0,
      cloud.xyz[i * 3 + 1] ?? 0,
      cloud.xyz[i * 3 + 2] ?? 0,
      radius,
      12,
    );
    if (ids.length < 4) continue;
    const nx = cloud.nrm[i * 3] ?? 0;
    const ny = cloud.nrm[i * 3 + 1] ?? 0;
    const nz = cloud.nrm[i * 3 + 2] ?? 0;
    let bend = 0;
    for (const j of ids) {
      bend +=
        1 -
        ((nx * (cloud.nrm[j * 3] ?? 0)) +
          (ny * (cloud.nrm[j * 3 + 1] ?? 0)) +
          (nz * (cloud.nrm[j * 3 + 2] ?? 0)));
    }
    scores.push({ index: i, bend: bend / ids.length });
  }
  scores.sort((a, b) => b.bend - a.bend);
  const keep = scores.slice(0, cap);
  // 언덕만 모이면 한 교두에 몰린다. 점수 큰 쪽을 띄엄띄엄 고른다.
  const picked: number[] = [];
  const minDist = mmToUnits(3.5, unitToMm);
  for (const row of keep) {
    let close = false;
    for (const index of picked) {
      const d = Math.hypot(
        (cloud.xyz[row.index * 3] ?? 0) - (cloud.xyz[index * 3] ?? 0),
        (cloud.xyz[row.index * 3 + 1] ?? 0) - (cloud.xyz[index * 3 + 1] ?? 0),
        (cloud.xyz[row.index * 3 + 2] ?? 0) - (cloud.xyz[index * 3 + 2] ?? 0),
      );
      if (d < minDist) {
        close = true;
        break;
      }
    }
    if (close) continue;
    picked.push(row.index);
    if (picked.length >= cap) break;
  }
  return picked.length >= 12 ? picked : scores.slice(0, cap).map((row) => row.index);
}

/** 대응 특징 3점으로 처음 자세를 고른다. 겹치는 영역만 맞아도 된다. */
function globalPose(source: Cloud, target: Cloud, unitToMm: number) {
  if (source.count < 40 || target.count < 40) return null;
  const srcIds = salientIds(source, unitToMm, 140);
  const dstIds = salientIds(target, unitToMm, 140);
  const srcFeat = featureCloud(source, unitToMm, srcIds);
  const dstFeat = featureCloud(target, unitToMm, dstIds);
  const matches: Array<{ s: number; d: number }> = [];
  for (let i = 0; i < srcIds.length; i += 1) {
    const feat = srcFeat[i];
    const srcIndex = srcIds[i];
    if (!feat || srcIndex == null) continue;
    let best = Infinity;
    let second = Infinity;
    let bestJ = -1;
    for (let j = 0; j < dstIds.length; j += 1) {
      const other = dstFeat[j];
      if (!other) continue;
      const dist = featureDistance(feat, other);
      if (dist < best) {
        second = best;
        best = dist;
        bestJ = dstIds[j] ?? -1;
      } else if (dist < second) second = dist;
    }
    if (bestJ >= 0 && best < second * 0.9) matches.push({ s: srcIndex, d: bestJ });
  }
  if (matches.length < 12) {
    return null;
  }
  const gate = mmToUnits(1.6, unitToMm);
  const grid = buildGrid(source, mmToUnits(1.2, unitToMm));
  let bestInliers = 0;
  let bestRigid: Rigid | null = null;
  const step = Math.max(1, Math.floor(target.count / 160));
  const trials = Math.min(420, Math.max(matches.length, 1) * 6);
  for (let trial = 0; trial < trials; trial += 1) {
    const a = matches[(trial * 17) % matches.length];
    const b = matches[(trial * 29 + 3) % matches.length];
    const c = matches[(trial * 43 + 11) % matches.length];
    if (!a || !b || !c || a.s === b.s || a.s === c.s || b.s === c.s) continue;
    const rigid = kabsch(source.xyz, target.xyz, [
      { s: a.s, d: a.d },
      { s: b.s, d: b.d },
      { s: c.s, d: c.d },
    ]);
    if (!rigid) continue;
    const ax = source.xyz[a.s * 3] ?? 0;
    const ay = source.xyz[a.s * 3 + 1] ?? 0;
    const az = source.xyz[a.s * 3 + 2] ?? 0;
    const landed =
      Math.hypot(
        (rigid.r[0]?.[0] ?? 1) * ax + (rigid.r[0]?.[1] ?? 0) * ay + (rigid.r[0]?.[2] ?? 0) * az + rigid.t[0] - (target.xyz[a.d * 3] ?? 0),
        (rigid.r[1]?.[0] ?? 0) * ax + (rigid.r[1]?.[1] ?? 1) * ay + (rigid.r[1]?.[2] ?? 0) * az + rigid.t[1] - (target.xyz[a.d * 3 + 1] ?? 0),
        (rigid.r[2]?.[0] ?? 0) * ax + (rigid.r[2]?.[1] ?? 0) * ay + (rigid.r[2]?.[2] ?? 1) * az + rigid.t[2] - (target.xyz[a.d * 3 + 2] ?? 0),
      );
    if (landed > mmToUnits(4, unitToMm)) continue;
    let inliers = 0;
    for (let i = 0; i < target.count; i += step) {
      const qx = (target.xyz[i * 3] ?? 0) - rigid.t[0];
      const qy = (target.xyz[i * 3 + 1] ?? 0) - rigid.t[1];
      const qz = (target.xyz[i * 3 + 2] ?? 0) - rigid.t[2];
      const px =
        (rigid.r[0]?.[0] ?? 1) * qx + (rigid.r[1]?.[0] ?? 0) * qy + (rigid.r[2]?.[0] ?? 0) * qz;
      const py =
        (rigid.r[0]?.[1] ?? 0) * qx + (rigid.r[1]?.[1] ?? 1) * qy + (rigid.r[2]?.[1] ?? 0) * qz;
      const pz =
        (rigid.r[0]?.[2] ?? 0) * qx + (rigid.r[1]?.[2] ?? 0) * qy + (rigid.r[2]?.[2] ?? 1) * qz;
      const hit = grid.nearest(px, py, pz, gate);
      if (hit < 0) continue;
      const d = Math.hypot(
        px - (source.xyz[hit * 3] ?? 0),
        py - (source.xyz[hit * 3 + 1] ?? 0),
        pz - (source.xyz[hit * 3 + 2] ?? 0),
      );
      if (d <= gate) inliers += 1;
    }
    if (inliers > bestInliers) {
      bestInliers = inliers;
      bestRigid = rigid;
    }
  }
  if (!bestRigid || bestInliers < 10) return null;
  return bestRigid;
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
};


function alignArch(source: Cloud, target: Cloud, unitToMm: number) {
  const grid = buildGrid(target, mmToUnits(1.2, unitToMm));
  const before = overlapFitness(source, target, grid, unitToMm);
  const already = before.coverage >= 0.55 && before.mean <= mmToUnits(0.3, unitToMm);
  if (already) {
    return {
      matrix: new THREE.Matrix4(),
      before: before.mean,
      after: before.mean,
      inliers: before.inliers,
      cloud: source,
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
  const deepEnough = localFit.coverage >= 0.62 && localFit.mean < mmToUnits(0.3, unitToMm);
  if (!deepEnough && bestFit.coverage < 0.5) {
    const pose = globalPose(source, target, unitToMm);
    if (pose) {
      const globalCloud = cloneCloud(source);
      applyRigid(globalCloud, pose);
      const matrix = new THREE.Matrix4();
      compose(matrix, pose);
      const refined = refineToTarget(globalCloud, target, unitToMm, true);
      matrix.premultiply(refined);
      const fit = overlapFitness(
        globalCloud,
        target,
        buildGrid(target, mmToUnits(1.2, unitToMm)),
        unitToMm,
      );
      if (
        fit.coverage > bestFit.coverage + 0.08 ||
        (fit.coverage >= bestFit.coverage - 0.02 && fit.mean < bestFit.mean)
      ) {
        bestCloud = globalCloud;
        bestMatrix = matrix;
        bestFit = fit;
      }
    }
  }
  const accept =
    bestFit.coverage >= 0.5 &&
    bestFit.mean < mmToUnits(0.35, unitToMm) &&
    bestFit.coverage > before.coverage + 0.12;
  if (!accept) {
    return {
      matrix: new THREE.Matrix4(),
      before: before.mean,
      after: before.mean,
      inliers: before.inliers,
      cloud: source,
    };
  }
  return {
    matrix: bestMatrix,
    before: before.mean,
    after: bestFit.mean,
    inliers: bestFit.inliers,
    cloud: bestCloud,
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

/**
 * 바이트가 있으면 상악·하악을 그 표면에 맞춘다.
 * 이미 맞거나, 맞춰도 더 나아지지 않으면 좌표를 건드리지 않는다.
 */
export async function registerJawsToBite(
  entries: Array<{ role: string; geometry: THREE.BufferGeometry }>,
  options?: { cancelled?: () => boolean },
) {
  const bite = entries.filter((entry) => entry.role === "bite");
  const arches = entries.filter(
    (entry) => entry.role === "upper" || entry.role === "lower",
  );
  if (bite.length === 0 || arches.length === 0) return;
  for (const entry of entries) {
    if (!entry.geometry.getAttribute("normal")) entry.geometry.computeVertexNormals();
  }
  await yieldFrame();
  if (options?.cancelled?.()) return;
  const biteCloud = mergeGeometries(bite.map((entry) => entry.geometry));
  if (biteCloud.count < 80) return;
  const unitToMm = geometryUnits(biteCloud, arches.map((entry) => entry.geometry));
  const order = [...arches].sort((a, b) => {
    const af = roughGap(a.geometry, biteCloud, unitToMm);
    const bf = roughGap(b.geometry, biteCloud, unitToMm);
    return af - bf;
  });
  let target = biteCloud;
  const fitted: ArchFit[] = [];
  for (const entry of order) {
    if (options?.cancelled?.()) return;
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
    });
    if (aligned.after + mmToUnits(0.08, unitToMm) < aligned.before) {
      target = excludeMatched(target, aligned.cloud, unitToMm);
    }
    await yieldFrame();
  }
  const uppers = fitted.filter((row) => row.role === "upper" && row.after < row.before);
  const lowers = fitted.filter((row) => row.role === "lower" && row.after < row.before);
  if (uppers.length && lowers.length) {
    const upperCloud = uppers[0]?.aligned;
    const lowerCloud = lowers[0]?.aligned;
    const upperWas = uppers[0]?.original;
    const lowerWas = lowers[0]?.original;
    if (upperCloud && lowerCloud && upperWas && lowerWas) {
      const after = sameSurfaceFraction(lowerCloud, upperCloud, unitToMm);
      const before = sameSurfaceFraction(lowerWas, upperWas, unitToMm);
      if (after > 0.32 && after > before + 0.12) {
        const drop = (uppers[0]?.after ?? 0) > (lowers[0]?.after ?? 0) ? uppers[0] : lowers[0];
        if (drop) drop.matrix.identity();
      }
    }
  }
  for (const row of fitted) {
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
