// 교합 정렬 결과를 다시 열고, 이미 고른 스캔바디를 그 프레임으로 옮긴다.
// 작업 스캔은 원본과 파일 이름이 달라도 정점 수가 같으면 같은 메시로 본다.
// related files:
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx
// - web/frontend/src/shared/practice/customAbutmentDesignCache.ts

import type { MatchedScanbodyFixture } from "@/shared/practice/customAbutmentScanbodyMatch";

export type AlignedScanIdentity = {
  fileName: string;
  role: string;
  vertexCount: number;
};

/** 대응 정점의 강체 맞춤이 이보다 크면 스캔바디를 옮기지 않고 다시 고르게 한다. */
const RIGID_RMS_MM = 1;

export type JawPositionCloud = {
  role: string;
  vertexCount: number;
  positions: ArrayLike<number>;
};

export type RigidFit = {
  /** column-major 4x4 */
  elements: number[];
  rms: number;
};

type Vec3 = [number, number, number];

/**
 * 저장한 정렬 스캔을 지금 불러온 악궁에 붙인다.
 * 이름이 같으면 그 파일을 쓰고, 없으면 같은 역할·같은 정점 수가 하나일 때만 쓴다.
 * 하나라도 못 찾으면 null.
 */
export function matchAlignedScans<T extends AlignedScanIdentity>(
  aligned: readonly AlignedScanIdentity[],
  loaded: readonly T[],
): T[] | null {
  if (aligned.length === 0) return null;
  const used = new Set<T>();
  const out: T[] = [];
  for (const row of aligned) {
    if (!(row.vertexCount > 0)) return null;
    const named = loaded.find(
      (scan) =>
        !used.has(scan) &&
        scan.role === row.role &&
        scan.fileName === row.fileName &&
        scan.vertexCount === row.vertexCount,
    );
    if (named) {
      used.add(named);
      out.push(named);
      continue;
    }
    const sameCount = loaded.filter(
      (scan) =>
        !used.has(scan) && scan.role === row.role && scan.vertexCount === row.vertexCount,
    );
    if (sameCount.length !== 1) return null;
    const hit = sameCount[0]!;
    used.add(hit);
    out.push(hit);
  }
  return out;
}

function at(cloud: ArrayLike<number>, index: number): Vec3 {
  return [cloud[index * 3] ?? 0, cloud[index * 3 + 1] ?? 0, cloud[index * 3 + 2] ?? 0];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function unit(v: Vec3): Vec3 | null {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-6) return null;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function applyPoint(m: readonly number[], p: Vec3): Vec3 {
  const [x, y, z] = p;
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
  ];
}

function applyDir(m: readonly number[], p: Vec3): Vec3 {
  const [x, y, z] = p;
  const out: Vec3 = [
    m[0]! * x + m[4]! * y + m[8]! * z,
    m[1]! * x + m[5]! * y + m[9]! * z,
    m[2]! * x + m[6]! * y + m[10]! * z,
  ];
  return unit(out) ?? out;
}

/** 같은 인덱스 정점의 회전·이동. 순서가 다르면 rms가 커서 null. */
export function rigidFitCorresponding(
  src: ArrayLike<number>,
  dst: ArrayLike<number>,
): RigidFit | null {
  const n = Math.min((src.length / 3) | 0, (dst.length / 3) | 0);
  if (n < 3) return null;
  const stride = Math.max(1, Math.floor(n / 48));
  const sample: number[] = [];
  for (let i = 0; i < n && sample.length < 48; i += stride) sample.push(i);
  if (sample.length < 3) return null;

  let far = sample[1] ?? 0;
  let farDist = -1;
  const origin = at(src, sample[0]!);
  for (const index of sample) {
    const d = at(src, index);
    const dist = Math.hypot(d[0] - origin[0], d[1] - origin[1], d[2] - origin[2]);
    if (dist > farDist) {
      farDist = dist;
      far = index;
    }
  }
  const axis = sub(at(src, far), origin);
  const axisLen = Math.hypot(axis[0], axis[1], axis[2]);
  if (axisLen < 1e-4) return null;
  let side = sample[0]!;
  let sideDist = -1;
  for (const index of sample) {
    const rel = sub(at(src, index), origin);
    const along = dot(rel, axis) / (axisLen * axisLen);
    const off = Math.hypot(
      rel[0] - axis[0] * along,
      rel[1] - axis[1] * along,
      rel[2] - axis[2] * along,
    );
    if (off > sideDist) {
      sideDist = off;
      side = index;
    }
  }
  if (sideDist < 1e-4) return null;

  const srcX = unit(sub(at(src, far), origin));
  const dstX = unit(sub(at(dst, far), at(dst, sample[0]!)));
  const srcZ = srcX ? unit(cross(srcX, sub(at(src, side), origin))) : null;
  const dstZ = dstX ? unit(cross(dstX, sub(at(dst, side), at(dst, sample[0]!)))) : null;
  if (!srcX || !dstX || !srcZ || !dstZ) return null;
  const srcY = cross(srcZ, srcX);
  const dstY = cross(dstZ, dstX);
  // R = Fdst * Fsrc^T. F columns are the basis.
  const r00 = dstX[0] * srcX[0] + dstY[0] * srcY[0] + dstZ[0] * srcZ[0];
  const r01 = dstX[0] * srcX[1] + dstY[0] * srcY[1] + dstZ[0] * srcZ[1];
  const r02 = dstX[0] * srcX[2] + dstY[0] * srcY[2] + dstZ[0] * srcZ[2];
  const r10 = dstX[1] * srcX[0] + dstY[1] * srcY[0] + dstZ[1] * srcZ[0];
  const r11 = dstX[1] * srcX[1] + dstY[1] * srcY[1] + dstZ[1] * srcZ[1];
  const r12 = dstX[1] * srcX[2] + dstY[1] * srcY[2] + dstZ[1] * srcZ[2];
  const r20 = dstX[2] * srcX[0] + dstY[2] * srcY[0] + dstZ[2] * srcZ[0];
  const r21 = dstX[2] * srcX[1] + dstY[2] * srcY[1] + dstZ[2] * srcZ[1];
  const r22 = dstX[2] * srcX[2] + dstY[2] * srcY[2] + dstZ[2] * srcZ[2];
  const srcOrigin = origin;
  const dstOrigin = at(dst, sample[0]!);
  const tx = dstOrigin[0] - (r00 * srcOrigin[0] + r01 * srcOrigin[1] + r02 * srcOrigin[2]);
  const ty = dstOrigin[1] - (r10 * srcOrigin[0] + r11 * srcOrigin[1] + r12 * srcOrigin[2]);
  const tz = dstOrigin[2] - (r20 * srcOrigin[0] + r21 * srcOrigin[1] + r22 * srcOrigin[2]);
  const elements = [r00, r10, r20, 0, r01, r11, r21, 0, r02, r12, r22, 0, tx, ty, tz, 1];

  let err = 0;
  for (const index of sample) {
    const moved = applyPoint(elements, at(src, index));
    const target = at(dst, index);
    err += Math.hypot(moved[0] - target[0], moved[1] - target[1], moved[2] - target[2]);
  }
  const rms = err / sample.length;
  if (rms > RIGID_RMS_MM) return null;
  return { elements, rms };
}

export function transformFixture(
  fixture: MatchedScanbodyFixture,
  elements: readonly number[],
): MatchedScanbodyFixture {
  const pose = fixture.fixturePose;
  return {
    ...fixture,
    scanbodyTop: applyPoint(elements, fixture.scanbodyTop),
    archOcclusalDir: applyDir(elements, fixture.archOcclusalDir),
    labialDir: applyDir(elements, fixture.labialDir),
    mesialDir: applyDir(elements, fixture.mesialDir),
    fixturePose: {
      origin: applyPoint(elements, pose.origin),
      axis: applyDir(elements, pose.axis),
      hexX: applyDir(elements, pose.hexX),
      hexY: applyDir(elements, pose.hexY),
    },
  };
}

export type OcclusionCarry = {
  fixtures: MatchedScanbodyFixture[];
  jaws: JawPositionCloud[];
};

/** 교합을 다시 맞추기 직전 스캔바디와 그 프레임의 정점. 정점은 복사본이다. */
export function captureOcclusionCarry(
  fixtures: readonly MatchedScanbodyFixture[],
  jaws: readonly JawPositionCloud[],
): OcclusionCarry | null {
  if (fixtures.length === 0) return null;
  const kept = jaws.filter((jaw) => jaw.vertexCount >= 3 && jaw.positions.length >= jaw.vertexCount * 3);
  if (kept.length === 0) return null;
  return {
    fixtures: fixtures.map((fixture) => ({
      ...fixture,
      scanbodyTop: [...fixture.scanbodyTop] as Vec3,
      archOcclusalDir: [...fixture.archOcclusalDir] as Vec3,
      labialDir: [...fixture.labialDir] as Vec3,
      mesialDir: [...fixture.mesialDir] as Vec3,
      fixturePose: {
        origin: [...fixture.fixturePose.origin] as Vec3,
        axis: [...fixture.fixturePose.axis] as Vec3,
        hexX: [...fixture.fixturePose.hexX] as Vec3,
        hexY: [...fixture.fixturePose.hexY] as Vec3,
      },
    })),
    jaws: kept.map((jaw) => ({
      role: jaw.role,
      vertexCount: jaw.vertexCount,
      positions: new Float32Array(jaw.positions),
    })),
  };
}

/** 교합 전·후 악궁 정점으로 역할별 강체 행렬을 구한다. */
export function resolveCarryJawMatrices(
  carry: OcclusionCarry | null,
  jaws: readonly JawPositionCloud[],
): Map<string, readonly number[]> {
  const matrixByRole = new Map<string, readonly number[]>();
  if (!carry) return matrixByRole;
  const used = new Set<JawPositionCloud>();
  for (const src of carry.jaws) {
    const candidates = jaws.filter(
      (jaw) => !used.has(jaw) && jaw.role === src.role && jaw.vertexCount === src.vertexCount,
    );
    let best: { jaw: JawPositionCloud; fit: RigidFit } | null = null;
    for (const jaw of candidates) {
      const fit = rigidFitCorresponding(src.positions, jaw.positions);
      if (!fit) continue;
      if (!best || fit.rms < best.fit.rms) best = { jaw, fit };
    }
    if (!best) continue;
    used.add(best.jaw);
    matrixByRole.set(src.role, best.fit.elements);
  }
  return matrixByRole;
}

/** 다시 맞춘 악궁으로 스캔바디를 옮긴다. 강체가 아니면 그 악은 빼서 다시 고르게 둔다. */
export function rebaseCarriedFixtures(
  carry: OcclusionCarry | null,
  jaws: readonly JawPositionCloud[],
): MatchedScanbodyFixture[] {
  const matrixByRole = resolveCarryJawMatrices(carry, jaws);
  if (!carry || matrixByRole.size === 0) return [];
  const out: MatchedScanbodyFixture[] = [];
  for (const fixture of carry.fixtures) {
    const matrix = matrixByRole.get(fixture.jaw);
    if (!matrix) continue;
    out.push(transformFixture(fixture, matrix));
  }
  return out;
}

/** 월드 방향 벡터에 강체 회전만 적용한다. */
export function transformDirection(
  elements: readonly number[],
  dir: readonly [number, number, number],
): [number, number, number] {
  return applyDir(elements, [dir[0], dir[1], dir[2]]);
}
