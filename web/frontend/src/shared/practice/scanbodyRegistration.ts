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
export function bestRigid(model: number[], target: number[]): RigidPose {
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

/** 균일 격자 최근접점. 좌표는 원점 ±1000 cell 안이어야 한다(치아 주변 mm 좌표). */
export class PointGrid {
  private readonly cells = new Map<number, number[]>();
  constructor(
    readonly points: Float32Array,
    private readonly cell: number,
  ) {
    for (let i = 0; i < points.length / 3; i += 1) {
      const key = this.key(
        Math.floor(points[i * 3]! / cell),
        Math.floor(points[i * 3 + 1]! / cell),
        Math.floor(points[i * 3 + 2]! / cell),
      );
      const list = this.cells.get(key);
      if (list) list.push(i);
      else this.cells.set(key, [i]);
    }
  }

  private key(cx: number, cy: number, cz: number) {
    return (cx + 1024) * 4194304 + (cy + 1024) * 2048 + (cz + 1024);
  }

  /** maxDist 안의 최근접 점 번호. 없으면 -1. maxDist는 cell 이하로 쓴다. */
  nearest(x: number, y: number, z: number, maxDist: number) {
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    const cz = Math.floor(z / this.cell);
    let best = -1;
    let bestD = maxDist * maxDist;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const list = this.cells.get(this.key(cx + dx, cy + dy, cz + dz));
          if (!list) continue;
          for (const i of list) {
            const ex = this.points[i * 3]! - x;
            const ey = this.points[i * 3 + 1]! - y;
            const ez = this.points[i * 3 + 2]! - z;
            const d = ex * ex + ey * ey + ez * ez;
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          }
        }
      }
    }
    return best;
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
  for (let iter = 0; iter < args.iterations; iter += 1) {
    const pairs: Array<{ d: number; i: number; j: number }> = [];
    for (let i = 0; i < args.model.length / 3; i += 1) {
      const p = applyPose(pose, args.model[i * 3]!, args.model[i * 3 + 1]!, args.model[i * 3 + 2]!);
      const j = args.grid.nearest(p[0], p[1], p[2], args.maxDist);
      if (j < 0) continue;
      const d =
        (args.grid.points[j * 3]! - p[0]) ** 2 +
        (args.grid.points[j * 3 + 1]! - p[1]) ** 2 +
        (args.grid.points[j * 3 + 2]! - p[2]) ** 2;
      pairs.push({ d, i, j });
    }
    if (pairs.length < 12) break;
    pairs.sort((a, b) => a.d - b.d);
    const keep = pairs.slice(0, Math.max(12, Math.floor(pairs.length * trim)));
    const m: number[] = [];
    const t: number[] = [];
    for (const { i, j } of keep) {
      m.push(args.model[i * 3]!, args.model[i * 3 + 1]!, args.model[i * 3 + 2]!);
      t.push(args.grid.points[j * 3]!, args.grid.points[j * 3 + 1]!, args.grid.points[j * 3 + 2]!);
    }
    const next = bestRigid(m, t);
    const moved = Math.hypot(...sub(next.t, pose.t)) + Math.abs(next.r[0] - pose.r[0]) + Math.abs(next.r[4] - pose.r[4]);
    pose = next;
    if (moved < 1e-5) break;
  }
  return { pose, ...evaluate(args.model, args.grid, pose, args.maxDist, args.topY) };
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
  const coarseGrid = new PointGrid(voxelDownsample(args.target, 0.3), 1.5);
  const midGrid = new PointGrid(voxelDownsample(args.target, 0.15), 0.8);
  const fineGrid = new PointGrid(voxelDownsample(args.target, 0.06), 0.4);
  const coarseModel = samplePoints(args.model, 400);
  const model = samplePoints(args.model, 1500);
  let maxY = -Infinity;
  let minY = Infinity;
  for (let i = 1; i < model.length; i += 3) {
    maxY = Math.max(maxY, model[i]!);
    minY = Math.min(minY, model[i]!);
  }
  const topY = maxY - (maxY - minY) * 0.35;
  const base = basisRotation(args.axis, args.ref);
  const seeds = args.seeds ?? 12;
  const coarse: IcpResult[] = [];
  for (let k = 0; k < seeds; k += 1) {
    const r = mul(base, rotY((k / seeds) * Math.PI * 2));
    coarse.push(
      icp({
        model: coarseModel,
        grid: coarseGrid,
        init: { r, t: args.origin },
        maxDist: 1.5,
        iterations: 15,
        topY,
      }),
    );
  }
  coarse.sort((a, b) => a.score - b.score);
  let best: IcpResult | null = null;
  for (const start of coarse.slice(0, 3)) {
    const mid = icp({ model, grid: midGrid, init: start.pose, maxDist: 0.8, iterations: 20, topY });
    const fine = icp({
      model,
      grid: fineGrid,
      init: mid.pose,
      maxDist: 0.4,
      iterations: 30,
      topY,
      trim: 0.9,
    });
    if (!best || fine.score < best.score) best = fine;
  }
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
