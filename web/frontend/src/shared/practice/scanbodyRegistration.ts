// 스캔바디·심플어벗 형상을 구강스캔에 맞춘다(ICP). three 없이 mm 좌표로 계산한다.
// 모델 좌표: 플랫폼 원점, +Y 임플란트 축(3Shape 라이브러리 UseImplantCoords와 같다).
// related files:
// - web/frontend/src/shared/components/practice/OralScanOverlayViewer.tsx (fitScanbodyMesh)
// - web/frontend/src/shared/practice/scanbodyLibraryApi.ts

export type Vec3 = [number, number, number];
/** 행 우선 3×3. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];
/** world = r · model + t */
export type RigidPose = { r: Mat3; t: Vec3 };

export type ScanbodyMesh = {
  positions: Float32Array;
  indices: Uint32Array;
};

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export function applyPose(pose: RigidPose, x: number, y: number, z: number): Vec3 {
  const r = pose.r;
  return [
    r[0] * x + r[1] * y + r[2] * z + pose.t[0],
    r[3] * x + r[4] * y + r[5] * z + pose.t[1],
    r[6] * x + r[7] * y + r[8] * z + pose.t[2],
  ];
}

export function poseColumn(pose: RigidPose, index: 0 | 1 | 2): Vec3 {
  return [pose.r[index], pose.r[3 + index], pose.r[6 + index]];
}

/** 축(model +Y)과 기준 방향(model +X)으로 회전을 만든다. */
export function basisRotation(axis: Vec3, ref: Vec3): Mat3 {
  const y = norm(axis);
  let x = sub(ref, scale(y, dot(ref, y)));
  if (Math.hypot(...x) < 1e-6) x = Math.abs(y[2]) < 0.9 ? cross(y, [0, 0, 1]) : cross(y, [1, 0, 0]);
  x = norm(x);
  const z = cross(x, y);
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
}

function mul(a: Mat3, b: Mat3): Mat3 {
  const out = new Array(9).fill(0) as Mat3;
  for (let i = 0; i < 3; i += 1)
    for (let j = 0; j < 3; j += 1)
      out[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return out;
}

function rotY(rad: number): Mat3 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}

/** 대칭 행렬 고유분해(Jacobi). 고유벡터는 열. */
function jacobiEigen(input: number[], n: number) {
  const a = input.slice();
  const v = Array.from({ length: n * n }, (_, i): number => (i % (n + 1) === 0 ? 1 : 0));
  for (let sweep = 0; sweep < 60; sweep += 1) {
    let off = 0;
    for (let p = 0; p < n; p += 1) for (let q = p + 1; q < n; q += 1) off += a[p * n + q]! ** 2;
    if (off < 1e-18) break;
    for (let p = 0; p < n; p += 1) {
      for (let q = p + 1; q < n; q += 1) {
        const apq = a[p * n + q]!;
        if (Math.abs(apq) < 1e-15) continue;
        const theta = (a[q * n + q]! - a[p * n + p]!) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k += 1) {
          const akp = a[k * n + p]!;
          const akq = a[k * n + q]!;
          a[k * n + p] = c * akp - s * akq;
          a[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k += 1) {
          const apk = a[p * n + k]!;
          const aqk = a[q * n + k]!;
          a[p * n + k] = c * apk - s * aqk;
          a[q * n + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k += 1) {
          const vkp = v[k * n + p]!;
          const vkq = v[k * n + q]!;
          v[k * n + p] = c * vkp - s * vkq;
          v[k * n + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const values = Array.from({ length: n }, (_, i) => a[i * n + i]!);
  const vector = (i: number) => Array.from({ length: n }, (_, k) => v[k * n + i]!);
  return { values, vector };
}

/** 대응점 쌍의 최적 강체 변환(Horn 사원수). */
export function bestRigid(model: ArrayLike<number>, target: ArrayLike<number>): RigidPose {
  const count = model.length / 3;
  const mc: Vec3 = [0, 0, 0];
  const tc: Vec3 = [0, 0, 0];
  for (let i = 0; i < count; i += 1) {
    for (let k = 0; k < 3; k += 1) {
      mc[k] += model[i * 3 + k]!;
      tc[k] += target[i * 3 + k]!;
    }
  }
  for (let k = 0; k < 3; k += 1) {
    mc[k] /= count;
    tc[k] /= count;
  }
  const s = new Array(9).fill(0);
  for (let i = 0; i < count; i += 1) {
    const mx = model[i * 3]! - mc[0];
    const my = model[i * 3 + 1]! - mc[1];
    const mz = model[i * 3 + 2]! - mc[2];
    const tx = target[i * 3]! - tc[0];
    const ty = target[i * 3 + 1]! - tc[1];
    const tz = target[i * 3 + 2]! - tc[2];
    s[0] += mx * tx; s[1] += mx * ty; s[2] += mx * tz;
    s[3] += my * tx; s[4] += my * ty; s[5] += my * tz;
    s[6] += mz * tx; s[7] += mz * ty; s[8] += mz * tz;
  }
  const [sxx, sxy, sxz, syx, syy, syz, szx, szy, szz] = s as number[] as Mat3;
  const n = [
    sxx + syy + szz, syz - szy, szx - sxz, sxy - syx,
    syz - szy, sxx - syy - szz, sxy + syx, szx + sxz,
    szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy,
    sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz,
  ];
  const { values, vector } = jacobiEigen(n, 4);
  let best = 0;
  for (let i = 1; i < 4; i += 1) if (values[i]! > values[best]!) best = i;
  const [w, x, y, z] = vector(best) as [number, number, number, number];
  const r: Mat3 = [
    w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z,
  ];
  const rm = applyPose({ r, t: [0, 0, 0] }, mc[0], mc[1], mc[2]);
  return { r, t: sub(tc, rm) };
}

/** 칸 수가 이보다 많으면(점이 넓게 퍼짐) 해시 칸으로 둔다. */
const DENSE_GRID_MAX_CELLS = 6_000_000;

/**
 * 균일 격자 최근접점. 점이 모인 범위는 칸별 연속 배열(CSR)로 둔다.
 * 칸 안 점 순서는 원래 번호 순이라 같은 거리면 앞 번호가 이긴다.
 */
export class PointGrid {
  private readonly minX: number;
  private readonly minY: number;
  private readonly minZ: number;
  private readonly nx: number;
  private readonly ny: number;
  private readonly nz: number;
  /** 칸별 시작 위치(nx·ny·nz + 1). */
  private readonly start: Int32Array;
  /** 칸 순서로 늘어놓은 원래 점 번호. */
  private readonly order: Int32Array;
  /** order 순서의 좌표. */
  private readonly sorted: Float32Array;

  constructor(
    readonly points: Float32Array,
    private readonly cell: number,
  ) {
    const count = Math.floor(points.length / 3);
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < count; i += 1) {
      const x = points[i * 3]!;
      const y = points[i * 3 + 1]!;
      const z = points[i * 3 + 2]!;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
    if (count === 0) {
      minX = minY = minZ = 0;
      maxX = maxY = maxZ = 0;
    }
    let c = cell;
    let nx = Math.floor((maxX - minX) / c) + 1;
    let ny = Math.floor((maxY - minY) / c) + 1;
    let nz = Math.floor((maxZ - minZ) / c) + 1;
    // 너무 넓으면 칸을 키운다. 반경 검색은 이웃 칸까지 보므로 maxDist ≤ cell 조건은 그대로 성립한다.
    while (nx * ny * nz > DENSE_GRID_MAX_CELLS) {
      c *= 1.5;
      nx = Math.floor((maxX - minX) / c) + 1;
      ny = Math.floor((maxY - minY) / c) + 1;
      nz = Math.floor((maxZ - minZ) / c) + 1;
    }
    this.cell = c;
    this.minX = minX;
    this.minY = minY;
    this.minZ = minZ;
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
    const cellOf = new Int32Array(count);
    const start = new Int32Array(nx * ny * nz + 1);
    for (let i = 0; i < count; i += 1) {
      const k =
        (Math.floor((points[i * 3]! - minX) / c) * ny + Math.floor((points[i * 3 + 1]! - minY) / c)) * nz +
        Math.floor((points[i * 3 + 2]! - minZ) / c);
      cellOf[i] = k;
      start[k + 1] += 1;
    }
    for (let k = 0; k < nx * ny * nz; k += 1) start[k + 1] += start[k]!;
    const fill = start.slice(0, nx * ny * nz);
    const order = new Int32Array(count);
    const sorted = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const at = fill[cellOf[i]!]!;
      fill[cellOf[i]!] = at + 1;
      order[at] = i;
      sorted[at * 3] = points[i * 3]!;
      sorted[at * 3 + 1] = points[i * 3 + 1]!;
      sorted[at * 3 + 2] = points[i * 3 + 2]!;
    }
    this.start = start;
    this.order = order;
    this.sorted = sorted;
  }

  /** maxDist 안의 최근접 점 번호. 없으면 -1. maxDist는 cell 이하로 쓴다. */
  nearest(x: number, y: number, z: number, maxDist: number) {
    const c = this.cell;
    const cx = Math.floor((x - this.minX) / c);
    const cy = Math.floor((y - this.minY) / c);
    const cz = Math.floor((z - this.minZ) / c);
    const { nx, ny, nz, start, sorted } = this;
    if (cx < -1 || cy < -1 || cz < -1 || cx > nx || cy > ny || cz > nz) return -1;
    let best = -1;
    let bestD = maxDist * maxDist;
    // 칸 경계까지 거리(축별). 이웃 칸은 지금 최선보다 멀면 건너뛴다.
    const lowX = x - (this.minX + cx * c);
    const lowY = y - (this.minY + cy * c);
    const lowZ = z - (this.minZ + cz * c);
    const gapX = [lowX * lowX, 0, (c - lowX) * (c - lowX)];
    const gapY = [lowY * lowY, 0, (c - lowY) * (c - lowY)];
    const gapZ = [lowZ * lowZ, 0, (c - lowZ) * (c - lowZ)];
    const scan = (k: number) => {
      const end = start[k + 1]!;
      for (let s = start[k]!; s < end; s += 1) {
        const ex = sorted[s * 3]! - x;
        const ey = sorted[s * 3 + 1]! - y;
        const ez = sorted[s * 3 + 2]! - z;
        const d = ex * ex + ey * ey + ez * ez;
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
    };
    const inside = cx >= 0 && cy >= 0 && cz >= 0 && cx < nx && cy < ny && cz < nz;
    if (inside) scan((cx * ny + cy) * nz + cz);
    for (let dx = -1; dx <= 1; dx += 1) {
      const ix = cx + dx;
      if (ix < 0 || ix >= nx) continue;
      const gx = gapX[dx + 1]!;
      if (gx >= bestD) continue;
      for (let dy = -1; dy <= 1; dy += 1) {
        const iy = cy + dy;
        if (iy < 0 || iy >= ny) continue;
        const gxy = gx + gapY[dy + 1]!;
        if (gxy >= bestD) continue;
        const row = (ix * ny + iy) * nz;
        for (let dz = -1; dz <= 1; dz += 1) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          const iz = cz + dz;
          if (iz < 0 || iz >= nz) continue;
          if (gxy + gapZ[dz + 1]! >= bestD) continue;
          scan(row + iz);
        }
      }
    }
    return best < 0 ? -1 : this.order[best]!;
  }
}

/** 복셀마다 점 하나만 남긴다. */
export function voxelDownsample(points: Float32Array, voxel: number): Float32Array {
  const seen = new Set<number>();
  const out: number[] = [];
  for (let i = 0; i < points.length; i += 3) {
    const key =
      (Math.floor(points[i]! / voxel) + 4096) * 67108864 +
      (Math.floor(points[i + 1]! / voxel) + 4096) * 8192 +
      (Math.floor(points[i + 2]! / voxel) + 4096);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(points[i]!, points[i + 1]!, points[i + 2]!);
  }
  return new Float32Array(out);
}

/** 꼭짓점을 고르게 추린다. */
export function samplePoints(positions: Float32Array, max: number): Float32Array {
  const count = positions.length / 3;
  if (count <= max) return positions.slice();
  const out = new Float32Array(max * 3);
  const step = count / max;
  for (let i = 0; i < max; i += 1) {
    const j = Math.floor(i * step);
    out.set(positions.subarray(j * 3, j * 3 + 3), i * 3);
  }
  return out;
}

export type IcpResult = {
  pose: RigidPose;
  /** 맞은 점들의 RMS(mm). */
  rmsMm: number;
  /** 모델 윗부분(스캔에 드러나는 쪽) 중 맞은 비율. */
  topCoverage: number;
  score: number;
};

function evaluate(model: Float32Array, grid: PointGrid, pose: RigidPose, maxDist: number, topY: number) {
  let sum = 0;
  let matched = 0;
  let top = 0;
  let topHit = 0;
  for (let i = 0; i < model.length / 3; i += 1) {
    const my = model[i * 3 + 1]!;
    const p = applyPose(pose, model[i * 3]!, my, model[i * 3 + 2]!);
    const j = grid.nearest(p[0], p[1], p[2], maxDist);
    const isTop = my >= topY;
    if (isTop) top += 1;
    if (j < 0) continue;
    const d2 =
      (grid.points[j * 3]! - p[0]) ** 2 +
      (grid.points[j * 3 + 1]! - p[1]) ** 2 +
      (grid.points[j * 3 + 2]! - p[2]) ** 2;
    sum += d2;
    matched += 1;
    if (isTop) topHit += 1;
  }
  const rmsMm = matched > 0 ? Math.sqrt(sum / matched) : Infinity;
  const topCoverage = top > 0 ? topHit / top : 0;
  return { rmsMm, topCoverage, score: rmsMm + (1 - topCoverage) * 0.5 };
}

/** 잘라낸(trimmed) 점대점 ICP. 스캔에 안 보이는 잇몸 아래 부분은 거리 제한과 trim으로 빠진다. */
export function icp(args: {
  model: Float32Array;
  grid: PointGrid;
  init: RigidPose;
  maxDist: number;
  iterations: number;
  trim?: number;
  topY: number;
}): IcpResult {
  let pose = args.init;
  const trim = args.trim ?? 0.85;
  const { model, grid, maxDist } = args;
  const gp = grid.points;
  const n = Math.floor(model.length / 3);
  const pairD = new Float64Array(n);
  const pairI = new Int32Array(n);
  const pairJ = new Int32Array(n);
  const rank: number[] = [];
  const m = new Float64Array(n * 3);
  const t = new Float64Array(n * 3);
  for (let iter = 0; iter < args.iterations; iter += 1) {
    const r = pose.r;
    const [t0, t1, t2] = pose.t;
    let count = 0;
    for (let i = 0; i < n; i += 1) {
      const x = model[i * 3]!;
      const y = model[i * 3 + 1]!;
      const z = model[i * 3 + 2]!;
      const px = r[0] * x + r[1] * y + r[2] * z + t0;
      const py = r[3] * x + r[4] * y + r[5] * z + t1;
      const pz = r[6] * x + r[7] * y + r[8] * z + t2;
      const j = grid.nearest(px, py, pz, maxDist);
      if (j < 0) continue;
      pairD[count] = (gp[j * 3]! - px) ** 2 + (gp[j * 3 + 1]! - py) ** 2 + (gp[j * 3 + 2]! - pz) ** 2;
      pairI[count] = i;
      pairJ[count] = j;
      count += 1;
    }
    if (count < 12) break;
    rank.length = count;
    for (let k = 0; k < count; k += 1) rank[k] = k;
    rank.sort((a, b) => pairD[a]! - pairD[b]! || a - b);
    const keep = Math.min(count, Math.max(12, Math.floor(count * trim)));
    for (let k = 0; k < keep; k += 1) {
      const i = pairI[rank[k]!]!;
      const j = pairJ[rank[k]!]!;
      m[k * 3] = model[i * 3]!;
      m[k * 3 + 1] = model[i * 3 + 1]!;
      m[k * 3 + 2] = model[i * 3 + 2]!;
      t[k * 3] = gp[j * 3]!;
      t[k * 3 + 1] = gp[j * 3 + 1]!;
      t[k * 3 + 2] = gp[j * 3 + 2]!;
    }
    const next = bestRigid(m.subarray(0, keep * 3), t.subarray(0, keep * 3));
    const moved = Math.hypot(...sub(next.t, pose.t)) + Math.abs(next.r[0] - pose.r[0]) + Math.abs(next.r[4] - pose.r[4]);
    pose = next;
    if (moved < 1e-5) break;
  }
  return { pose, ...evaluate(args.model, args.grid, pose, args.maxDist, args.topY) };
}

type TargetGrids = { coarse: PointGrid; mid: PointGrid; fine: PointGrid };

/** 같은 target(한 치아 주변 스캔)을 후보·형상마다 다시 격자화하지 않는다. */
const targetGridCache = new WeakMap<Float32Array, TargetGrids>();

function targetGrids(target: Float32Array): TargetGrids {
  const hit = targetGridCache.get(target);
  if (hit) return hit;
  const grids = {
    coarse: new PointGrid(voxelDownsample(target, 0.3), 1.5),
    mid: new PointGrid(voxelDownsample(target, 0.15), 0.8),
    fine: new PointGrid(voxelDownsample(target, 0.06), 0.4),
  };
  targetGridCache.set(target, grids);
  return grids;
}

type PreparedModel = { coarse: Float32Array; full: Float32Array; topY: number };

function prepareModel(positions: Float32Array): PreparedModel {
  const full = samplePoints(positions, 1500);
  let maxY = -Infinity;
  let minY = Infinity;
  for (let i = 1; i < full.length; i += 3) {
    maxY = Math.max(maxY, full[i]!);
    minY = Math.min(minY, full[i]!);
  }
  return { coarse: samplePoints(positions, 400), full, topY: maxY - (maxY - minY) * 0.35 };
}

function coarseFits(model: PreparedModel, grids: TargetGrids, base: Mat3, origin: Vec3, seeds: number) {
  const out: IcpResult[] = [];
  for (let k = 0; k < seeds; k += 1) {
    const r = mul(base, rotY((k / seeds) * Math.PI * 2));
    out.push(
      icp({ model: model.coarse, grid: grids.coarse, init: { r, t: origin }, maxDist: 1.5, iterations: 15, topY: model.topY }),
    );
  }
  return out.sort((a, b) => a.score - b.score);
}

function refineFit(model: PreparedModel, grids: TargetGrids, start: RigidPose): IcpResult {
  const mid = icp({ model: model.full, grid: grids.mid, init: start, maxDist: 0.8, iterations: 20, topY: model.topY });
  return icp({
    model: model.full,
    grid: grids.fine,
    init: mid.pose,
    maxDist: 0.4,
    iterations: 30,
    topY: model.topY,
    trim: 0.9,
  });
}

/**
 * 축 둘레 회전 여러 개에서 시작해 가장 잘 맞는 자세를 고른다.
 * axis·origin은 원기둥 맞춤이나 점 3개로 잡은 초기값(mm, target과 같은 좌표).
 */
export function registerScanbody(args: {
  model: Float32Array;
  target: Float32Array;
  axis: Vec3;
  origin: Vec3;
  ref: Vec3;
  seeds?: number;
}): IcpResult | null {
  if (args.model.length < 36 || args.target.length < 90) return null;
  const grids = targetGrids(args.target);
  const model = prepareModel(args.model);
  const coarse = coarseFits(model, grids, basisRotation(args.axis, args.ref), args.origin, args.seeds ?? 12);
  let best: IcpResult | null = null;
  for (const start of coarse.slice(0, 3)) {
    const fine = refineFit(model, grids, start.pose);
    if (!best || fine.score < best.score) best = fine;
  }
  return best;
}

/** 형상이 맞았다고 볼 정합 오차·윗면 덮임. 다른 형상이면 0.13 mm 넘게 벌어진다. */
export const SCANBODY_MATCH_RMS_MM = 0.1;
export const SCANBODY_MATCH_COVERAGE = 0.8;

export const isScanbodyMatch = (fit: Pick<IcpResult, "rmsMm" | "topCoverage">) =>
  fit.rmsMm <= SCANBODY_MATCH_RMS_MM && fit.topCoverage >= SCANBODY_MATCH_COVERAGE;

/** 형상 축(model +Y)이 삽입축과 벌어진 각도. */
export function poseTiltDeg(pose: RigidPose, axis: Vec3) {
  const a = norm(axis);
  const y = norm(poseColumn(pose, 1));
  return (Math.acos(Math.min(1, Math.max(-1, dot(a, y)))) * 180) / Math.PI;
}

export type ScanbodySearchHit = {
  /** models 번호. */
  index: number;
  result: IcpResult;
  /** 형상 윗면 가운데(target 좌표). */
  top: Vec3;
};

/** 축에 수직인 높이 지도에서 높은 곳부터 2.5 mm 간격 후보(탐색 원점에서 가까운 순). */
export function scanbodyTopCandidates(args: {
  target: Float32Array;
  axis: Vec3;
  searchMm: number;
  exclude?: readonly Vec3[];
}) {
  const axis = norm(args.axis);
  const e1 = norm(Math.abs(axis[2]) < 0.9 ? cross(axis, [0, 0, 1]) : cross(axis, [1, 0, 0]));
  const e2 = cross(axis, e1);
  const cell = 0.5;
  const half = args.searchMm + 2;
  const size = Math.ceil((2 * half) / cell);
  const heights = new Float32Array(size * size).fill(-Infinity);
  for (let i = 0; i < args.target.length; i += 3) {
    const p: Vec3 = [args.target[i]!, args.target[i + 1]!, args.target[i + 2]!];
    const gx = Math.floor((dot(p, e1) + half) / cell);
    const gy = Math.floor((dot(p, e2) + half) / cell);
    if (gx < 0 || gy < 0 || gx >= size || gy >= size) continue;
    const k = gy * size + gx;
    const h = dot(p, axis);
    if (h > heights[k]!) heights[k] = h;
  }
  const excluded = (args.exclude ?? []).map((p) => [dot(p, e1), dot(p, e2)] as const);
  const cells: Array<{ gx: number; gy: number; h: number }> = [];
  for (let gy = 0; gy < size; gy += 1) {
    for (let gx = 0; gx < size; gx += 1) {
      const h = heights[gy * size + gx]!;
      if (!Number.isFinite(h)) continue;
      const u = (gx + 0.5) * cell - half;
      const v = (gy + 0.5) * cell - half;
      if (Math.hypot(u, v) > args.searchMm) continue;
      if (excluded.some(([eu, ev]) => Math.hypot(u - eu, v - ev) < 3)) continue;
      cells.push({ gx, gy, h });
    }
  }
  // 높은 곳부터 2.5 mm 안에 하나씩. 윗면이 축에서 기울면 가장 높은 점은 가장자리라, 그 둘레 윗면(1.8 mm 안)의 가운데를 쓴다.
  cells.sort((a, b) => b.h - a.h);
  const peaks: Array<{ u: number; v: number; h: number; d: number }> = [];
  const plateau = Math.ceil(3 / cell);
  for (const c of cells) {
    if (peaks.length >= 24) break;
    const u0 = (c.gx + 0.5) * cell - half;
    const v0 = (c.gy + 0.5) * cell - half;
    if (peaks.some((p) => Math.hypot(p.u - u0, p.v - v0) < 2.5)) continue;
    let su = 0;
    let sv = 0;
    let n = 0;
    for (let dy = -plateau; dy <= plateau; dy += 1) {
      for (let dx = -plateau; dx <= plateau; dx += 1) {
        const x = c.gx + dx;
        const y = c.gy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size || Math.hypot(dx, dy) * cell > 3) continue;
        if (heights[y * size + x]! < c.h - 1.8) continue;
        su += (x + 0.5) * cell - half;
        sv += (y + 0.5) * cell - half;
        n += 1;
      }
    }
    const u = su / n;
    const v = sv / n;
    peaks.push({ u, v, h: c.h, d: Math.hypot(u, v) });
  }
  peaks.sort((a, b) => a.d - b.d);
  return peaks.map((peak) => {
    const guess: Vec3 = [
      e1[0] * peak.u + e2[0] * peak.v + axis[0] * peak.h,
      e1[1] * peak.u + e2[1] * peak.v + axis[1] * peak.h,
      e1[2] * peak.u + e2[2] * peak.v + axis[2] * peak.h,
    ];
    return { ...fitTopPlateau(args.target, guess, axis), distanceMm: peak.d };
  });
}

/**
 * 봉우리 둘레 윗면 점으로 평면을 맞춰 그 스캔바디의 축과 윗면 가운데를 잡는다.
 * 임플란트는 삽입축과 20° 넘게 벌어지기도 해서, 삽입축 그대로 ICP를 시작하면 엉뚱한 곳으로 수렴한다.
 */
function fitTopPlateau(target: Float32Array, guess: Vec3, axis: Vec3): { top: Vec3; axis: Vec3 } {
  let center = guess;
  let n = axis;
  for (let iter = 0; iter < 3; iter += 1) {
    const rows: Vec3[] = [];
    let maxH = -Infinity;
    for (let i = 0; i < target.length; i += 3) {
      const d = sub([target[i]!, target[i + 1]!, target[i + 2]!], center);
      const h = dot(d, n);
      if (h < -2.5 || h > 2.5) continue;
      if (Math.hypot(...sub(d, scale(n, h))) > 2.4) continue;
      rows.push(d);
      if (h > maxH) maxH = h;
    }
    const top = rows.filter((d) => dot(d, n) >= maxH - (iter === 0 ? 1.8 : 1));
    if (top.length < 12) break;
    const c: Vec3 = [0, 0, 0];
    for (const d of top) for (let k = 0; k < 3; k += 1) c[k] += d[k]! / top.length;
    const cov = new Array(9).fill(0);
    for (const d of top) {
      const e = sub(d, c);
      for (let a = 0; a < 3; a += 1) for (let b = 0; b < 3; b += 1) cov[a * 3 + b] += e[a]! * e[b]!;
    }
    const { values, vector } = jacobiEigen(cov, 3);
    let least = 0;
    for (let k = 1; k < 3; k += 1) if (values[k]! < values[least]!) least = k;
    let normal = norm(vector(least) as Vec3);
    if (dot(normal, axis) < 0) normal = scale(normal, -1);
    // 윗면이 아니라 옆면을 잡았으면(삽입축과 45° 넘게) 버린다.
    if (dot(normal, axis) < Math.cos(Math.PI / 4)) break;
    n = normal;
    center = [center[0] + c[0], center[1] + c[1], center[2] + c[2]];
  }
  return { top: center, axis: n };
}

/**
 * 삽입축 근처에서 스캔바디를 찾는다. 축에 수직인 높이 지도의 봉우리를 후보로 잡고,
 * 후보마다 라이브러리 형상을 ICP로 대 본 뒤 가장 잘 맞는 자리를 고른다.
 * 스캔바디가 잇몸에 묻혀 조금만 드러나도 형상이 맞는 곳을 고른다. 안 맞으면 null(점 찍기로 넘긴다).
 * target은 탐색 원점 기준 mm, axis는 교합 쪽. exclude는 이미 맞춘 스캔바디 윗면(같은 좌표).
 */
export function searchScanbody(args: {
  models: readonly Float32Array[];
  target: Float32Array;
  axis: Vec3;
  ref: Vec3;
  searchMm: number;
  exclude?: readonly Vec3[];
  maxTiltDeg?: number;
}): ScanbodySearchHit | null {
  if (args.models.length === 0 || args.target.length < 90) return null;
  const axis = norm(args.axis);
  const e1 = norm(Math.abs(axis[2]) < 0.9 ? cross(axis, [0, 0, 1]) : cross(axis, [1, 0, 0]));
  const e2 = cross(axis, e1);
  const excluded = (args.exclude ?? []).map((p) => [dot(p, e1), dot(p, e2)] as const);
  const peaks = scanbodyTopCandidates(args);
  const grids = targetGrids(args.target);
  const models = args.models.map((positions) => ({ prepared: prepareModel(positions), topMm: meshExtent(positions).topMm }));
  const maxTilt = args.maxTiltDeg ?? 30;
  // 거친 ICP 점수는 자리를 가리지 못한다(어디서나 비슷하다). 자리마다 정밀 ICP까지 대 본다.
  // 형상이 맞은 자리 중 탐색 원점에 가장 가까운 것. 옆 스캔바디가 더 잘 맞아도 가까운 쪽이 그 치아다.
  let best: ScanbodySearchHit | null = null;
  let match: (ScanbodySearchHit & { distance: number }) | null = null;
  for (const peak of peaks.slice(0, 10)) {
    if (match && peak.distanceMm > match.distance + 2) break;
    const peakBase = basisRotation(peak.axis, args.ref);
    if (poseTiltDeg({ r: peakBase, t: [0, 0, 0] }, axis) > maxTilt) continue;
    models.forEach((model, index) => {
      const origin = sub(peak.top, scale(peak.axis, model.topMm));
      const fits = coarseFits(model.prepared, grids, peakBase, origin, 6).filter(
        (row) => poseTiltDeg(row.pose, axis) <= maxTilt,
      );
      for (const fit of fits.slice(0, 2)) {
        const result = refineFit(model.prepared, grids, fit.pose);
        if (poseTiltDeg(result.pose, axis) > maxTilt) continue;
        const top = applyPose(result.pose, 0, model.topMm, 0);
        const distance = Math.hypot(dot(top, e1), dot(top, e2));
        if (distance > args.searchMm + 1) continue;
        if (excluded.some(([eu, ev]) => Math.hypot(dot(top, e1) - eu, dot(top, e2) - ev) < 3)) continue;
        const hit = { index, result, top };
        if (!best || result.score < best.result.score) best = hit;
        if (isScanbodyMatch(result) && (!match || distance < match.distance - 1 || (distance < match.distance + 1 && result.score < match.result.score))) {
          match = { ...hit, distance };
        }
      }
    });
  }
  if (match) return { index: match.index, result: match.result, top: match.top };
  return best;
}

/** 모델(mm) 최대 반경과 높이. 원기둥 초기 맞춤과 표시 치수에 쓴다. */
export function meshExtent(positions: Float32Array) {
  let radius = 0;
  let top = -Infinity;
  let bottom = Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1]!;
    top = Math.max(top, y);
    bottom = Math.min(bottom, y);
    radius = Math.max(radius, Math.hypot(positions[i]!, positions[i + 2]!));
  }
  return { radiusMm: radius, topMm: top, bottomMm: bottom };
}

export type AbutmentTemplateFrame = {
  origin: Vec3;
  axis: Vec3;
  ref: Vec3;
  marginHeightMm: number;
  maxDiameterMm: number;
  heightMm: number;
};

/**
 * 심플어벗 스캔의 축과 플랫폼. 다이 스캔은 아래가 열려 있어서 열린 경계의 평면 법선을 축으로,
 * 스캔 맨 아래를 플랫폼 원점으로 쓴다. 마진은 반경이 가장 큰 어깨 높이.
 */
export function computeAbutmentTemplateFrame(mesh: ScanbodyMesh): AbutmentTemplateFrame {
  const pos = mesh.positions;
  const vc = pos.length / 3;
  const point = (i: number): Vec3 => [pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!];
  const centroid: Vec3 = [0, 0, 0];
  for (let i = 0; i < vc; i += 1) for (let k = 0; k < 3; k += 1) centroid[k] += pos[i * 3 + k]! / vc;

  const edges = new Map<number, number>();
  const idx = mesh.indices;
  for (let f = 0; f < idx.length; f += 3) {
    for (let e = 0; e < 3; e += 1) {
      const a = idx[f + e]!;
      const b = idx[f + ((e + 1) % 3)]!;
      const key = a < b ? a * vc + b : b * vc + a;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  // 열린 경계가 여러 고리(스크류홀 등)면 가장 큰 고리가 바닥이다.
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (const [key, count] of edges) {
    if (count !== 1) continue;
    const a = Math.floor(key / vc);
    const b = key % vc;
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    parent.set(find(a), find(b));
  }
  const loops = new Map<number, number[]>();
  for (const v of parent.keys()) {
    const r = find(v);
    const list = loops.get(r);
    if (list) list.push(v);
    else loops.set(r, [v]);
  }
  const boundary = new Set<number>(
    [...loops.values()].sort((a, b) => b.length - a.length)[0] ?? [],
  );

  const covariance = (ids: Iterable<number>, center: Vec3) => {
    const c = new Array(9).fill(0);
    let n = 0;
    for (const i of ids) {
      const d = sub(point(i), center);
      for (let r = 0; r < 3; r += 1) for (let s = 0; s < 3; s += 1) c[r * 3 + s] += d[r]! * d[s]!;
      n += 1;
    }
    return c.map((v) => v / Math.max(n, 1));
  };

  let axis: Vec3;
  let base: Vec3;
  if (boundary.size >= 12) {
    base = [0, 0, 0];
    for (const i of boundary) for (let k = 0; k < 3; k += 1) base[k] += pos[i * 3 + k]! / boundary.size;
    const { values, vector } = jacobiEigen(covariance(boundary, base), 3);
    let min = 0;
    for (let i = 1; i < 3; i += 1) if (values[i]! < values[min]!) min = i;
    axis = norm(vector(min) as Vec3);
    if (dot(sub(centroid, base), axis) < 0) axis = scale(axis, -1);
  } else {
    base = centroid;
    const all = Array.from({ length: vc }, (_, i) => i);
    const { values, vector } = jacobiEigen(covariance(all, centroid), 3);
    let max = 0;
    for (let i = 1; i < 3; i += 1) if (values[i]! > values[max]!) max = i;
    axis = norm(vector(max) as Vec3);
    if (axis[2] < 0) axis = scale(axis, -1);
  }

  let minA = Infinity;
  let maxA = -Infinity;
  const along = new Float64Array(vc);
  for (let i = 0; i < vc; i += 1) {
    along[i] = dot(sub(point(i), base), axis);
    minA = Math.min(minA, along[i]!);
    maxA = Math.max(maxA, along[i]!);
  }
  const origin: Vec3 = [
    base[0] + axis[0] * minA,
    base[1] + axis[1] * minA,
    base[2] + axis[2] * minA,
  ];
  const heightMm = maxA - minA;
  const bin = 0.1;
  const bins = Math.max(1, Math.ceil(heightMm / bin) + 1);
  const radii = new Float64Array(bins);
  for (let i = 0; i < vc; i += 1) {
    const a = along[i]! - minA;
    const radial = sub(sub(point(i), origin), scale(axis, a));
    const b = Math.min(bins - 1, Math.floor(a / bin));
    radii[b] = Math.max(radii[b]!, Math.hypot(...radial));
  }
  let shoulder = 0;
  for (let b = 1; b < bins; b += 1) if (radii[b]! > radii[shoulder]! + 1e-6) shoulder = b;
  const ref = basisRotation(axis, [1, 0, 0]);
  return {
    origin,
    axis,
    ref: [ref[0], ref[3], ref[6]],
    marginHeightMm: (shoulder + 0.5) * bin,
    maxDiameterMm: radii[shoulder]! * 2,
    heightMm,
  };
}

/** 스캔 좌표 템플릿을 모델 좌표(플랫폼 원점, +Y 축)로 옮긴다. */
export function toTemplateModel(
  mesh: ScanbodyMesh,
  frame: Pick<AbutmentTemplateFrame, "origin" | "axis" | "ref">,
): ScanbodyMesh {
  const r = basisRotation(frame.axis, frame.ref);
  const out = new Float32Array(mesh.positions.length);
  for (let i = 0; i < out.length; i += 3) {
    const d = sub(
      [mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!],
      frame.origin,
    );
    out[i] = d[0] * r[0] + d[1] * r[3] + d[2] * r[6];
    out[i + 1] = d[0] * r[1] + d[1] * r[4] + d[2] * r[7];
    out[i + 2] = d[0] * r[2] + d[1] * r[5] + d[2] * r[8];
  }
  return { positions: out, indices: mesh.indices };
}
