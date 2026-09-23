// change-log:
// - 2026-09-23: 벽면 등반인데 반경이 일정한 경우(BKV 박영옥) — 연속 |Δz| 급변(dzMax)으로 검출.
// - 2026-09-17: BKA 오탐 수정 — Z폭(벽면 등반) 없으면 희소 루프도 정상. BJZ만 불량.
// - 2026-09-17: Rhino 피니시라인 points 기하로 불량(지그재그·반경 급변) 검출. BJZ 샘플 기준.
// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/FilledStlCardThumbnail.tsx
// - bg/pc1/rhino-server/compute/scripts/finishline_detection.py

export type FinishLineQualityMetrics = {
  pointCount: number;
  /** XY 중심 대비 반경 변동계수 */
  radiusCv: number;
  /** 연속 점 반경 급변(>0.25mm) 비율 */
  radiusJumpRate: number;
  /** 폴리라인 평균 꺾임각(deg) */
  avgTurnDeg: number;
  /** 꺾임각 >45° 비율 */
  sharpTurnRate: number;
  /** max_z - min_z (mm). 해부학적 스캘럽도 커질 수 있어 단독 불량 신호는 아님 */
  zRange: number;
  /** 폐곡선 포함 연속 점 |Δz| 최댓값(mm). 벽면으로 튀면 급증 */
  dzMax: number;
};

export type FinishLineQualityAssessment = {
  defective: boolean;
  reason: string | null;
  metrics: FinishLineQualityMetrics | null;
};

const RADIUS_JUMP_MM = 0.25;
/** 어깨 루프는 Z폭이 작다. 벽면으로 튀면 Z폭이 커진다(BJZ≈3.2, BKA≈0.07). */
const DEFECT_MIN_Z_RANGE_MM = 1.0;
/**
 * 정상 스캘럽은 Z폭이 커도 연속 |Δz|가 완만(대개 <0.3mm).
 * 벽면 등반은 한 구간에 수 mm 점프(BKV≈2.98, 윤정희≈4.1).
 */
const DEFECT_MIN_DZ_MAX_MM = 1.0;

function toXyz(points: unknown): number[][] {
  if (!Array.isArray(points)) return [];
  const out: number[][] = [];
  for (const raw of points) {
    if (!Array.isArray(raw) || raw.length < 3) continue;
    const x = Number(raw[0]);
    const y = Number(raw[1]);
    const z = Number(raw[2]);
    if (![x, y, z].every(Number.isFinite)) continue;
    out.push([x, y, z]);
  }
  return out;
}

function computeMetrics(pts: number[][]): FinishLineQualityMetrics | null {
  const n = pts.length;
  if (n < 4) return null;

  let cx = 0;
  let cy = 0;
  let zMin = Number.POSITIVE_INFINITY;
  let zMax = Number.NEGATIVE_INFINITY;
  for (const p of pts) {
    cx += p[0];
    cy += p[1];
    if (p[2] < zMin) zMin = p[2];
    if (p[2] > zMax) zMax = p[2];
  }
  cx /= n;
  cy /= n;
  const zRange = Number.isFinite(zMin) && Number.isFinite(zMax) ? zMax - zMin : 0;

  const radii = pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy));
  const rMean = radii.reduce((a, b) => a + b, 0) / n;
  const rStd = Math.sqrt(
    radii.reduce((a, b) => a + (b - rMean) ** 2, 0) / n,
  );
  const radiusCv = rMean > 1e-6 ? rStd / rMean : 0;

  let jumps = 0;
  for (let i = 1; i < radii.length; i += 1) {
    if (Math.abs(radii[i] - radii[i - 1]) > RADIUS_JUMP_MM) jumps += 1;
  }
  const radiusJumpRate = jumps / Math.max(1, radii.length - 1);

  let turnSum = 0;
  let sharp = 0;
  let turns = 0;
  for (let i = 1; i < n - 1; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const v1: [number, number, number] = [
      b[0] - a[0],
      b[1] - a[1],
      b[2] - a[2],
    ];
    const v2: [number, number, number] = [
      c[0] - b[0],
      c[1] - b[1],
      c[2] - b[2],
    ];
    const n1 = Math.hypot(v1[0], v1[1], v1[2]);
    const n2 = Math.hypot(v2[0], v2[1], v2[2]);
    if (n1 < 1e-9 || n2 < 1e-9) continue;
    const dot = Math.max(
      -1,
      Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]) / (n1 * n2)),
    );
    const ang = (Math.acos(dot) * 180) / Math.PI;
    turnSum += ang;
    turns += 1;
    if (ang > 45) sharp += 1;
  }

  let dzMax = 0;
  for (let i = 0; i < n; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dz = Math.abs(a[2] - b[2]);
    if (dz > dzMax) dzMax = dz;
  }

  return {
    pointCount: n,
    radiusCv,
    radiusJumpRate,
    avgTurnDeg: turns ? turnSum / turns : 0,
    sharpTurnRate: turns ? sharp / turns : 0,
    zRange,
    dzMax,
  };
}

/**
 * Rhino가 잡은 finishLine.points가 어깨를 따라가지 않고 벽면으로 튀는 패턴을 검출한다.
 * (썸네일/프리뷰의 빨간 FL 오버레이와 동일 소스)
 *
 * 희소 점(8점 등)만으로 정상 원형 루프를 그리는 경우(BKA)는 Z폭이 작아 제외한다.
 * 해부학적 스캘럽은 Z폭이 커도 연속 |Δz|가 완만하다. 벽면 등반은 dzMax로 잡는다.
 */
export function assessFinishLineQuality(
  points: unknown,
): FinishLineQualityAssessment {
  const pts = toXyz(points);
  if (pts.length < 4) {
    return { defective: false, reason: null, metrics: null };
  }

  const metrics = computeMetrics(pts);
  if (!metrics) {
    return { defective: false, reason: null, metrics: null };
  }

  const {
    radiusCv,
    radiusJumpRate,
    avgTurnDeg,
    sharpTurnRate,
    pointCount,
    zRange,
    dzMax,
  } = metrics;

  // 벽면 등반 없이 Z가 평탄하면(정상 어깨) 희소/각진 루프라도 불량 아님.
  if (zRange < DEFECT_MIN_Z_RANGE_MM) {
    return { defective: false, reason: null, metrics };
  }

  // 원통 벽면 등반: XY 반경은 일정해도 연속 Z가 급변(BKV 등).
  if (dzMax >= DEFECT_MIN_DZ_MAX_MM) {
    return { defective: true, reason: "z_jump", metrics };
  }

  if (radiusJumpRate >= 0.2 && radiusCv >= 0.2) {
    return { defective: true, reason: "radius_jump", metrics };
  }
  if (radiusCv >= 0.35) {
    return { defective: true, reason: "radius_cv", metrics };
  }
  if (
    radiusCv >= 0.2 &&
    avgTurnDeg >= 18 &&
    sharpTurnRate >= 0.1 &&
    pointCount >= 12
  ) {
    return { defective: true, reason: "jagged_loop", metrics };
  }

  return { defective: false, reason: null, metrics };
}

export function isFinishLineDefective(points: unknown): boolean {
  return assessFinishLineQuality(points).defective;
}

export function resolveFinishLinePointsFromRequest(request: {
  caseInfos?: { finishLine?: { points?: unknown } | null } | null;
} | null | undefined): number[][] | null {
  const points = request?.caseInfos?.finishLine?.points;
  const pts = toXyz(points);
  return pts.length >= 2 ? pts : null;
}
