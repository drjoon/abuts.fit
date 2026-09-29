// 기공소 AI 크라운 — 대합·인접·치조정 스캔에 맞춰 외면 정점을 깎고 늘린다.
// 좌표는 월드 기하 단위. 간격·깊이는 mm로 받고 unitToMm로 바꾼다.

export type ScanCloud = {
  points: Float32Array;
  /** 스캔 면 바깥 법선. 치아에서 크라운 쪽을 본다. 모르면 0. */
  normals: Float32Array;
};

export type ScanGrid = {
  cloud: ScanCloud;
  cell: number;
  cells: Map<number, number[]>;
};

/** 삽입축에 수직인 평면의 격자. 기둥 안 점의 축 방향 높이를 본다. */
export type ScanColumns = {
  cloud: ScanCloud;
  axis: [number, number, number];
  e1: [number, number, number];
  e2: [number, number, number];
  cell: number;
  cells: Map<number, number[]>;
};

export type SurfaceAdapt = {
  clearanceMm: number;
  trim: boolean;
  fit: boolean;
};

export type CrownAdaptInput = {
  /** 월드 정점. 제자리에서 고친다. */
  positions: Float32Array;
  /** 월드 바깥 법선(단위). */
  normals: Float32Array;
  /** 삽입축. 교합 쪽. */
  axis: [number, number, number];
  unitToMm: number;
  opposing: ScanGrid | null;
  adjacent: ScanGrid | null;
  /** 블록아웃용 인접치 기둥. */
  adjacentColumns: ScanColumns | null;
  /** 폰틱은 치조정, 크라운은 마진 둘레 치은 기둥. */
  ridge: ScanColumns | null;
  occlusal: SurfaceAdapt;
  proximal: SurfaceAdapt & { blockOut: boolean };
  gingival: GingivalAdapt | null;
  /** 인접 보철과 떼어 두는 평면. 정점을 `normal·p <= offset` 쪽에 둔다. */
  discs?: DiscPlane[];
  /** 정점마다 더 깎을 수 있는 깊이(mm). 두께 보상. 없으면 제한이 없다. */
  allowCutMm?: Float32Array | null;
};

export type GingivalAdapt = {
  distanceMm: number;
  fit: boolean;
  /** 정점마다 맞춤 세기(0~1). 없으면 아래를 보는 면(폰틱 기저면)만 쓴다. */
  weight?: Float32Array | null;
  /** 정점마다 내려갈 수 있는 가장 낮은 축 높이(월드). 크라운 마진. 이미 아래면 더 내리지 않는다. */
  floor?: Float32Array | null;
};

export type DiscPlane = {
  normal: [number, number, number];
  /** 월드 단위. 간격 절반을 뺀 값. */
  offset: number;
};

export type CrownAdaptResult = {
  /** 정점마다 안쪽으로 들어간 깊이(mm). 늘렸으면 음수. */
  cutMm: Float32Array;
  /** 맞춘 뒤 대합·인접 중 가까운 쪽까지 거리(mm). 1mm 안에 없으면 NaN. */
  contactMm: Float32Array;
  /** 맞춘 뒤 대합 면까지 부호 거리(mm). 겹치면 음수. 1mm 안에 없으면 NaN. */
  opposingMm: Float32Array;
  /** 맞춘 뒤 인접 면까지 부호 거리(mm). 겹치면 음수. 1mm 안에 없으면 NaN. */
  adjacentMm: Float32Array;
};

/** 닿게 늘릴 때 보는 거리(mm). 이보다 먼 면은 그대로 둔다. */
export const FIT_REACH_MM = 0.8;
const GRID_CELL_MM = 1;
const COLUMN_CELL_MM = 0.5;
const CONTACT_PROBE_MM = 1;

function key3(ix: number, iy: number, iz: number) {
  return (Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663) ^ Math.imul(iz, 83492791)) | 0;
}

function key2(iu: number, iw: number) {
  return (Math.imul(iu, 73856093) ^ Math.imul(iw, 19349663)) | 0;
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / Math.max(edge1 - edge0, 1e-9)));
  return t * t * (3 - 2 * t);
}

/** 한 복셀에 점 하나만 남긴다. 스캔 밀도와 상관없이 격자 조회가 일정하다. */
export function downsampleCloud(cloud: ScanCloud, voxel: number): ScanCloud {
  if (!(voxel > 0)) return cloud;
  const seen = new Set<number>();
  const points: number[] = [];
  const normals: number[] = [];
  const { points: src, normals: nor } = cloud;
  for (let i = 0; i < src.length; i += 3) {
    const key = key3(
      Math.floor(src[i]! / voxel),
      Math.floor(src[i + 1]! / voxel),
      Math.floor(src[i + 2]! / voxel),
    );
    if (seen.has(key)) continue;
    seen.add(key);
    points.push(src[i]!, src[i + 1]!, src[i + 2]!);
    normals.push(nor[i] ?? 0, nor[i + 1] ?? 0, nor[i + 2] ?? 0);
  }
  return { points: new Float32Array(points), normals: new Float32Array(normals) };
}

export function createScanGrid(cloud: ScanCloud, unitToMm: number): ScanGrid | null {
  if (cloud.points.length < 3) return null;
  const unit = unitToMm > 0 ? unitToMm : 1;
  const cell = GRID_CELL_MM / unit;
  const cells = new Map<number, number[]>();
  const src = cloud.points;
  for (let i = 0; i < src.length; i += 3) {
    const key = key3(
      Math.floor(src[i]! / cell),
      Math.floor(src[i + 1]! / cell),
      Math.floor(src[i + 2]! / cell),
    );
    let bucket = cells.get(key);
    if (!bucket) {
      bucket = [];
      cells.set(key, bucket);
    }
    bucket.push(i / 3);
  }
  return { cloud, cell, cells };
}

function planeBasis(axis: [number, number, number]) {
  const [ax, ay, az] = axis;
  const hint: [number, number, number] = Math.abs(ax) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let e1x = hint[0] - ax * (hint[0] * ax + hint[1] * ay + hint[2] * az);
  let e1y = hint[1] - ay * (hint[0] * ax + hint[1] * ay + hint[2] * az);
  let e1z = hint[2] - az * (hint[0] * ax + hint[1] * ay + hint[2] * az);
  const len = Math.hypot(e1x, e1y, e1z) || 1;
  e1x /= len;
  e1y /= len;
  e1z /= len;
  const e2: [number, number, number] = [
    ay * e1z - az * e1y,
    az * e1x - ax * e1z,
    ax * e1y - ay * e1x,
  ];
  return { e1: [e1x, e1y, e1z] as [number, number, number], e2 };
}

export function createScanColumns(
  cloud: ScanCloud,
  axis: [number, number, number],
  unitToMm: number,
): ScanColumns | null {
  if (cloud.points.length < 3) return null;
  const len = Math.hypot(axis[0], axis[1], axis[2]);
  if (len < 1e-9) return null;
  const a: [number, number, number] = [axis[0] / len, axis[1] / len, axis[2] / len];
  const { e1, e2 } = planeBasis(a);
  const unit = unitToMm > 0 ? unitToMm : 1;
  const cell = COLUMN_CELL_MM / unit;
  const cells = new Map<number, number[]>();
  const src = cloud.points;
  for (let i = 0; i < src.length; i += 3) {
    const u = src[i]! * e1[0] + src[i + 1]! * e1[1] + src[i + 2]! * e1[2];
    const w = src[i]! * e2[0] + src[i + 1]! * e2[1] + src[i + 2]! * e2[2];
    const key = key2(Math.floor(u / cell), Math.floor(w / cell));
    let bucket = cells.get(key);
    if (!bucket) {
      bucket = [];
      cells.set(key, bucket);
    }
    bucket.push(i / 3);
  }
  return { cloud, axis: a, e1, e2, cell, cells };
}

/** maxDist 안에서 가장 가까운 점 번호. 없으면 -1. */
export function nearestInGrid(
  grid: ScanGrid,
  x: number,
  y: number,
  z: number,
  maxDist: number,
): number {
  const { cell, cells } = grid;
  const pts = grid.cloud.points;
  const ix = Math.floor(x / cell);
  const iy = Math.floor(y / cell);
  const iz = Math.floor(z / cell);
  const rings = Math.ceil(maxDist / cell);
  let best = maxDist * maxDist;
  let bestIndex = -1;
  for (let r = 0; r <= rings; r += 1) {
    for (let dz = -r; dz <= r; dz += 1) {
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (r > 0 && Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
          const bucket = cells.get(key3(ix + dx, iy + dy, iz + dz));
          if (!bucket) continue;
          for (const index of bucket) {
            const ox = pts[index * 3]! - x;
            const oy = pts[index * 3 + 1]! - y;
            const oz = pts[index * 3 + 2]! - z;
            const d2 = ox * ox + oy * oy + oz * oz;
            if (d2 < best) {
              best = d2;
              bestIndex = index;
            }
          }
        }
      }
    }
    if (bestIndex >= 0 && Math.sqrt(best) <= r * cell) break;
  }
  return bestIndex;
}

/**
 * 점에서 스캔 면까지 부호 거리. 스캔 바깥이 +. 법선이 거리 방향과 비슷하면 그 점의 접평면까지
 * 재서 스캔 점 간격만큼 부풀지 않게 한다. 법선을 모르면 거리 그대로.
 */
function signedTo(cloud: ScanCloud, index: number, x: number, y: number, z: number) {
  const dx = x - cloud.points[index * 3]!;
  const dy = y - cloud.points[index * 3 + 1]!;
  const dz = z - cloud.points[index * 3 + 2]!;
  const nx = cloud.normals[index * 3] ?? 0;
  const ny = cloud.normals[index * 3 + 1] ?? 0;
  const nz = cloud.normals[index * 3 + 2] ?? 0;
  const dist = Math.hypot(dx, dy, dz);
  const side = dx * nx + dy * ny + dz * nz;
  const signed = Math.abs(side) > 0.5 * dist ? side : side < 0 ? -dist : dist;
  return { dist, signed, nx, ny, nz, dx, dy, dz };
}

/** 점에서 스캔 면까지 부호 거리(mm). 스캔 바깥이 +. maxDistMm 안에 면이 없으면 NaN. */
export function signedDistanceMm(
  grid: ScanGrid,
  x: number,
  y: number,
  z: number,
  maxDistMm: number,
  unitToMm: number,
): number {
  const unit = unitToMm > 0 ? unitToMm : 1;
  const j = nearestInGrid(grid, x, y, z, maxDistMm / unit);
  if (j < 0) return Number.NaN;
  return signedTo(grid.cloud, j, x, y, z).signed * unit;
}

/** 블록아웃 그림자 밖으로 나갈 때 보는 인접치 옆 거리(mm). 이보다 깊은 언더컷은 한 번에 못 뺀다. */
const BLOCK_OUT_REACH_MM = 1.2;

/**
 * 삽입 방향(축 위쪽)으로 인접치 아래 그늘에 든 정점을 옆으로 빼낸다.
 * 정점 위 기둥에 인접치 면이 간격보다 가까이 있으면 걸린다. 그 면들의 바깥 법선 옆 성분 쪽으로,
 * 모든 면에서 간격이 날 때까지 민다.
 */
function blockOutVertices(
  columns: ScanColumns,
  clearanceMm: number,
  unit: number,
  axis: [number, number, number],
  pos: Float32Array,
  nor: Float32Array,
  count: number,
  move: (i: number, mx: number, my: number, mz: number) => void,
) {
  const c = Math.max(clearanceMm, 0) / unit;
  const radius = c + BLOCK_OUT_REACH_MM / unit;
  const rings = Math.ceil(radius / columns.cell);
  const tol = 0.05 / unit;
  const cp = columns.cloud.points;
  const cn = columns.cloud.normals;
  const [ax, ay, az] = axis;
  const [e1x, e1y, e1z] = columns.e1;
  const [e2x, e2y, e2z] = columns.e2;
  const near: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const nAlong = nor[i * 3]! * ax + nor[i * 3 + 1]! * ay + nor[i * 3 + 2]! * az;
    if (Math.abs(nAlong) > 0.85) continue;
    const x = pos[i * 3]!;
    const y = pos[i * 3 + 1]!;
    const z = pos[i * 3 + 2]!;
    const vA = x * ax + y * ay + z * az;
    const vU = x * e1x + y * e1y + z * e1z;
    const vW = x * e2x + y * e2y + z * e2z;
    const iu = Math.floor(vU / columns.cell);
    const iw = Math.floor(vW / columns.cell);
    near.length = 0;
    let du = 0;
    let dw = 0;
    let hit = false;
    for (let su = -rings; su <= rings; su += 1) {
      for (let sw = -rings; sw <= rings; sw += 1) {
        const bucket = columns.cells.get(key2(iu + su, iw + sw));
        if (!bucket) continue;
        for (const index of bucket) {
          const px = cp[index * 3]!;
          const py = cp[index * 3 + 1]!;
          const pz = cp[index * 3 + 2]!;
          if (px * ax + py * ay + pz * az < vA - tol) continue;
          const qu = px * e1x + py * e1y + pz * e1z - vU;
          const qw = px * e2x + py * e2y + pz * e2z - vW;
          const lateral2 = qu * qu + qw * qw;
          if (lateral2 > radius * radius) continue;
          near.push(qu, qw);
          if (lateral2 >= c * c) continue;
          hit = true;
          const nx = cn[index * 3] ?? 0;
          const ny = cn[index * 3 + 1] ?? 0;
          const nz = cn[index * 3 + 2] ?? 0;
          du += nx * e1x + ny * e1y + nz * e1z;
          dw += nx * e2x + ny * e2y + nz * e2z;
        }
      }
    }
    if (!hit) continue;
    let dl = Math.hypot(du, dw);
    if (dl < 1e-6) {
      // 법선을 모르면 걸린 면에서 멀어지는 쪽.
      for (let k = 0; k < near.length; k += 2) {
        du -= near[k]!;
        dw -= near[k + 1]!;
      }
      dl = Math.hypot(du, dw);
      if (dl < 1e-9) continue;
    }
    du /= dl;
    dw /= dl;
    let push = 0;
    for (let k = 0; k < near.length; k += 2) {
      const qu = near[k]!;
      const qw = near[k + 1]!;
      const along = qu * du + qw * dw;
      const perp2 = qu * qu + qw * qw - along * along;
      if (perp2 >= c * c) continue;
      push = Math.max(push, along + Math.sqrt(c * c - perp2));
    }
    if (push <= 0) continue;
    move(
      i,
      (e1x * du + e2x * dw) * push,
      (e1y * du + e2y * dw) * push,
      (e1z * du + e2z * dw) * push,
    );
  }
}

/**
 * 크라운 정점을 대합·인접·치조정에 맞춘다.
 * 깎기는 목표 간격보다 가까운 정점을 스캔 법선 방향으로 밀어낸다. 늘리기는 크라운이 스캔을 보는
 * 정점만 FIT_REACH_MM 안에서 목표 간격까지 끌어온다. 블록아웃은 삽입 경로(축 위쪽)에 있는 인접치까지
 * 옆 간격을 지킨다. 치은 맞춤은 기둥 꼭대기에서 간격만큼 띄우고 floor 아래로는 내리지 않는다.
 * 디스크는 마지막에 평면 너머 정점을 평면까지 깎는다.
 */
export function adaptCrownVertices(input: CrownAdaptInput): CrownAdaptResult {
  const { positions: pos, normals: nor, axis, allowCutMm } = input;
  const unit = input.unitToMm > 0 ? input.unitToMm : 1;
  const count = Math.floor(pos.length / 3);
  const cutMm = new Float32Array(count);
  const contactMm = new Float32Array(count).fill(Number.NaN);
  const reach = FIT_REACH_MM / unit;
  const [ax, ay, az] = axis;

  const move = (i: number, mx: number, my: number, mz: number) => {
    const nx = nor[i * 3]!;
    const ny = nor[i * 3 + 1]!;
    const nz = nor[i * 3 + 2]!;
    const inward = -(mx * nx + my * ny + mz * nz) * unit;
    let k = 1;
    if (allowCutMm && inward > 1e-6) {
      const room = Math.max(0, allowCutMm[i]! - cutMm[i]!);
      k = Math.min(1, room / inward);
    }
    if (k <= 0) return;
    pos[i * 3] = pos[i * 3]! + mx * k;
    pos[i * 3 + 1] = pos[i * 3 + 1]! + my * k;
    pos[i * 3 + 2] = pos[i * 3 + 2]! + mz * k;
    cutMm[i] = cutMm[i]! + inward * k;
  };

  const surfaces: Array<[ScanGrid | null, SurfaceAdapt]> = [
    [input.opposing, input.occlusal],
    [input.adjacent, input.proximal],
  ];
  for (const [grid, spec] of surfaces) {
    if (!grid || (!spec.trim && !spec.fit)) continue;
    const c = spec.clearanceMm / unit;
    const probe = Math.max(c, 0) + reach + 0.3 / unit;
    for (let i = 0; i < count; i += 1) {
      for (let iter = 0; iter < 2; iter += 1) {
        const x = pos[i * 3]!;
        const y = pos[i * 3 + 1]!;
        const z = pos[i * 3 + 2]!;
        const j = nearestInGrid(grid, x, y, z, probe);
        if (j < 0) break;
        const hit = signedTo(grid.cloud, j, x, y, z);
        const hasNormal = hit.nx !== 0 || hit.ny !== 0 || hit.nz !== 0;
        const dirX = hasNormal ? hit.nx : hit.dx / Math.max(hit.dist, 1e-9);
        const dirY = hasNormal ? hit.ny : hit.dy / Math.max(hit.dist, 1e-9);
        const dirZ = hasNormal ? hit.nz : hit.dz / Math.max(hit.dist, 1e-9);
        if (spec.trim && hit.signed < c - 1e-6) {
          const push = c - hit.signed;
          move(i, dirX * push, dirY * push, dirZ * push);
          continue;
        }
        if (spec.fit && hit.signed > c + 1e-6) {
          const facing =
            -(nor[i * 3]! * hit.dx + nor[i * 3 + 1]! * hit.dy + nor[i * 3 + 2]! * hit.dz) >
            0.2 * hit.dist;
          if (!facing) break;
          const gap = hit.signed - c;
          const w = 1 - smoothstep(reach * 0.5, reach, gap);
          if (w <= 0) break;
          move(i, -dirX * gap * w, -dirY * gap * w, -dirZ * gap * w);
          continue;
        }
        break;
      }
    }
  }

  const columns = input.adjacentColumns;
  if (columns && input.proximal.trim && input.proximal.blockOut) {
    blockOutVertices(columns, input.proximal.clearanceMm, unit, axis, pos, nor, count, move);
  }

  const ridge = input.ridge;
  const gingival = input.gingival;
  if (ridge && gingival?.fit) {
    const g = gingival.distanceMm / unit;
    const radius = 0.4 / unit;
    const rings = Math.ceil(radius / ridge.cell);
    const limit = 3 / unit;
    const rp = ridge.cloud.points;
    const [e1x, e1y, e1z] = ridge.e1;
    const [e2x, e2y, e2z] = ridge.e2;
    for (let i = 0; i < count; i += 1) {
      const nAlong = nor[i * 3]! * ax + nor[i * 3 + 1]! * ay + nor[i * 3 + 2]! * az;
      const w = gingival.weight ? gingival.weight[i]! : smoothstep(0.15, 0.6, -nAlong);
      if (w <= 0) continue;
      const x = pos[i * 3]!;
      const y = pos[i * 3 + 1]!;
      const z = pos[i * 3 + 2]!;
      const vU = x * e1x + y * e1y + z * e1z;
      const vW = x * e2x + y * e2y + z * e2z;
      const iu = Math.floor(vU / ridge.cell);
      const iw = Math.floor(vW / ridge.cell);
      let top = -Infinity;
      for (let du = -rings; du <= rings; du += 1) {
        for (let dw = -rings; dw <= rings; dw += 1) {
          const bucket = ridge.cells.get(key2(iu + du, iw + dw));
          if (!bucket) continue;
          for (const index of bucket) {
            const px = rp[index * 3]!;
            const py = rp[index * 3 + 1]!;
            const pz = rp[index * 3 + 2]!;
            const ou = vU - (px * e1x + py * e1y + pz * e1z);
            const ow = vW - (px * e2x + py * e2y + pz * e2z);
            if (ou * ou + ow * ow > radius * radius) continue;
            top = Math.max(top, px * ax + py * ay + pz * az);
          }
        }
      }
      if (!Number.isFinite(top)) continue;
      const along = x * ax + y * ay + z * az;
      const delta = top + g - along;
      if (Math.abs(delta) > limit) continue;
      let step = delta * w;
      const floor = gingival.floor?.[i];
      if (floor != null && Number.isFinite(floor) && step < 0) {
        step = Math.max(step, Math.min(0, floor - along));
      }
      if (step === 0) continue;
      move(i, ax * step, ay * step, az * step);
    }
  }

  for (const disc of input.discs ?? []) {
    const [dx, dy, dz] = disc.normal;
    for (let i = 0; i < count; i += 1) {
      const over = pos[i * 3]! * dx + pos[i * 3 + 1]! * dy + pos[i * 3 + 2]! * dz - disc.offset;
      if (over <= 0) continue;
      // 디스크는 두께 보상보다 앞선다. 붙어 나오면 브리지를 끈 뜻이 사라진다.
      pos[i * 3] = pos[i * 3]! - dx * over;
      pos[i * 3 + 1] = pos[i * 3 + 1]! - dy * over;
      pos[i * 3 + 2] = pos[i * 3 + 2]! - dz * over;
      cutMm[i] =
        cutMm[i]! + over * (nor[i * 3]! * dx + nor[i * 3 + 1]! * dy + nor[i * 3 + 2]! * dz) * unit;
    }
  }

  const opposingMm = new Float32Array(count).fill(Number.NaN);
  const adjacentMm = new Float32Array(count).fill(Number.NaN);
  const probe = CONTACT_PROBE_MM / unit;
  for (let i = 0; i < count; i += 1) {
    const x = pos[i * 3]!;
    const y = pos[i * 3 + 1]!;
    const z = pos[i * 3 + 2]!;
    let best = Number.NaN;
    const grids: Array<[ScanGrid | null, Float32Array]> = [
      [input.opposing, opposingMm],
      [input.adjacent, adjacentMm],
    ];
    for (const [grid, signedOut] of grids) {
      if (!grid) continue;
      const j = nearestInGrid(grid, x, y, z, probe);
      if (j < 0) continue;
      const signed = signedTo(grid.cloud, j, x, y, z).signed * unit;
      signedOut[i] = signed;
      const mm = Math.max(0, signed);
      if (!(mm >= best)) best = mm;
    }
    contactMm[i] = best;
  }

  return { cutMm, contactMm, opposingMm, adjacentMm };
}
