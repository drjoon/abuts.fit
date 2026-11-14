// 매칭된 픽스쳐 자세와 구강스캔(인접치·잇몸·대합치)으로부터:
// 1) 치아 종류별 목표 해부학적 크라운 외형을 먼저 예측하고(스캔 인접 접촉·대합 간격 적응),
// 2) 단일 크라운 삽입축(인접치 평행축) 기준 적절한 도재·지르코니아 두께로 균일 컷백(anatomic reduction)하며,
// 3) 삽입축 방향 언더컷 0° 미만 완전 제거(엄격 단조 축소 테이퍼 5°~7°) + 피니시라인 라운드 숄더 챔퍼를 적용한 뒤,
// 4) 픽스쳐(+Z_implant) 스크류홀 및 제조사 헥스·11° 원뿔 커넥션과 결합해 닫힌 2-매니폴드 이진 STL을 생성한다.
// 로컬 좌표계(제조사 STL SSOT): 플랫폼 원점(0,0,0), +Z 임플란트 장축, +X 헥스 평면 법선.
// related files:
// - web/frontend/src/shared/practice/customAbutmentScanbodyMatch.ts
// - web/frontend/src/shared/practice/toothMorphology.ts
// - web/frontend/src/shared/files/stlBinaryWrite.ts
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx
// - web/backend/services/abutmentStl/cuffConnectionSpecs.js

import * as THREE from "three";
import { encodeBinaryStl } from "@/shared/files/stlBinaryWrite";
import {
  cropScanPointsInFixtureFrame,
  fixturePoseToMatrix4,
  parseFdiTooth,
  type FixtureWorldPose,
  type MatchedScanbodyFixture,
} from "@/shared/practice/customAbutmentScanbodyMatch";
import { toothFormOf, type ToothKind } from "@/shared/practice/toothMorphology";
import type { Vec3 } from "@/shared/practice/scanbodyRegistration";

const TAPER_11_SLOPE = Math.tan((11 * Math.PI) / 180);
const CUFF_START_SLOPE = Math.tan((2 * Math.PI) / 180);
/** 크라운 삽입축 기준 최소 축벽 수렴 각도(편측 5.5° → 전체 11° 테이퍼, 언더컷 완전 방지). */
const MIN_INSERTION_TAPER_SLOPE = Math.tan((5.5 * Math.PI) / 180);
/** 2.5° 간격(144열) — 6각 헥스 모서리(30°+60°k)가 정확히 격자 위에 놓인다. */
const ANGULAR_COLS = 144;
const SECTORS = 36;
const MIN_METAL_WALL_MM = 0.52;

export type CustomAbutmentDesignMetrics = {
  connectionDiameterMm: number;
  maxDiameterMm: number;
  cuffHeightMinMm: number;
  cuffHeightMaxMm: number;
  postHeightMm: number;
  totalLengthMm: number;
  /** 픽스쳐 장축과 크라운 삽입축 사이의 각도(°). */
  angulationDeg: number;
  /** 예측 크라운 대비 평균 축벽·교합 컷백 두께(mm). */
  cutbackMm: number;
  rmsMm: number;
};

export type DesignedCustomAbutment = {
  toothNumber: string;
  jaw: "upper" | "lower";
  fileName: string;
  /** 픽스쳐 로컬 좌표(플랫폼 원점, +Z 장축) 삼각형 정점(9개씩). */
  localPositions: Float32Array;
  stlBlob: Blob;
  /** 스캔 월드 좌표로 배치된 커스텀어벗 BufferGeometry. */
  worldGeometry: THREE.BufferGeometry;
  /** 스캔 월드 좌표로 배치된 예측 해부학 크라운 외형 BufferGeometry(뷰어 반투명 확인용). */
  predictedCrownWorldGeometry: THREE.BufferGeometry;
  /** 스캔 월드 좌표의 피니시라인 폐곡선(x,y,z 반복). */
  marginLoopWorld: Float32Array;
  fixture: MatchedScanbodyFixture;
  metrics: CustomAbutmentDesignMetrics;
};

const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale3 = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm3 = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

function worldDirToFixtureLocal(dir: Vec3, pose: FixtureWorldPose): Vec3 {
  return norm3([
    dot3(dir, pose.hexX),
    dot3(dir, pose.hexY),
    dot3(dir, pose.axis),
  ]);
}

function smootherstep(t: number) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** 저차 푸리에 조화함수(0~maxHarmonic차)로 둘레 배열을 매끄럽게 고른다. */
function lowPassCircular(values: readonly number[], maxHarmonic = 3): number[] {
  const n = values.length;
  let a0 = 0;
  for (const v of values) a0 += v / n;
  const cosC: number[] = [];
  const sinC: number[] = [];
  for (let k = 1; k <= maxHarmonic; k += 1) {
    let ac = 0;
    let bs = 0;
    for (let i = 0; i < n; i += 1) {
      const ang = (i / n) * Math.PI * 2 * k;
      ac += (values[i]! * Math.cos(ang) * 2) / n;
      bs += (values[i]! * Math.sin(ang) * 2) / n;
    }
    cosC.push(ac);
    sinC.push(bs);
  }
  return Array.from({ length: n }, (_, i) => {
    let sum = a0;
    for (let k = 1; k <= maxHarmonic; k += 1) {
      const ang = (i / n) * Math.PI * 2 * k;
      sum += cosC[k - 1]! * Math.cos(ang) + sinC[k - 1]! * Math.sin(ang);
    }
    return sum;
  });
}

function evalPeriodicLinear(samples: readonly number[], theta: number): number {
  const n = samples.length;
  let u = theta / (Math.PI * 2);
  u = u - Math.floor(u);
  const f = u * n;
  const i0 = Math.floor(f) % n;
  const i1 = (i0 + 1) % n;
  const t = f - Math.floor(f);
  return samples[i0]! * (1 - t) + samples[i1]! * t;
}

/** 6각 헥스 단면 반경(모서리 라운드 포함). +X가 평면 법선(0°, 60°, ...). */
function hexOuterRadiusAt(theta: number, hexSizeMm: number): number {
  const flatR = hexSizeMm / 2;
  const cornerMaxR = (flatR / Math.cos(Math.PI / 6)) * 0.982;
  const sector = Math.PI / 3;
  let local = ((theta % sector) + sector) % sector;
  if (local > sector / 2) local = sector - local;
  return Math.min(flatR / Math.cos(local), cornerMaxR);
}

type ToothCrownSpec = {
  kind: ToothKind;
  upper: boolean;
  /** 치경부(마진) 기본 반경: 순협측(BL) / 근원심(MD), mm */
  cervicalBlMm: number;
  cervicalMdMm: number;
  /** 최대 풍융부(치관 외형) 기본 반경: 순협측(BL) / 근원심(MD), mm */
  equatorBlMm: number;
  equatorMdMm: number;
  /** 기본 임상 치관 높이(마진 평균 ~ 절단·교두정), mm */
  nominalCrownHeightMm: number;
  /** 지르코니아 크라운 축벽 컷백 두께: 순협측 / 설측 / 인접면, mm */
  cutbackLabialMm: number;
  cutbackLingualMm: number;
  cutbackProximalMm: number;
  /** 절단연·교합면 컷백 두께, mm (실측 우리·알토란 기공소 평균 1.8~2.3mm) */
  cutbackOcclusalMm: number;
  /** 피니시라인 챔퍼 폭, mm */
  chamferWidthMm: number;
};

/** FDI 치아 번호별 해부학적 치관 치수 및 기공소 표준 지르코니아 컷백 두께. */
function crownSpecForTooth(toothNumber: string): ToothCrownSpec {
  const parsed = parseFdiTooth(toothNumber);
  const form = toothFormOf(toothNumber);
  const pos = parsed?.pos ?? 6;
  const upper = form?.upper ?? true;
  const kind: ToothKind = form?.kind ?? "molar";

  if (kind === "incisor") {
    const isLateral = pos === 2;
    return {
      kind,
      upper,
      cervicalBlMm: upper ? (isLateral ? 2.55 : 2.95) : 2.35,
      cervicalMdMm: upper ? (isLateral ? 2.25 : 2.75) : 1.95,
      equatorBlMm: upper ? (isLateral ? 3.15 : 3.55) : 2.95,
      equatorMdMm: upper ? (isLateral ? 3.25 : 4.15) : 2.65,
      nominalCrownHeightMm: upper ? (isLateral ? 8.6 : 9.6) : 8.2,
      cutbackLabialMm: 1.35,
      cutbackLingualMm: 1.15,
      cutbackProximalMm: 1.15,
      cutbackOcclusalMm: 2.0,
      chamferWidthMm: 0.48,
    };
  }
  if (kind === "canine") {
    return {
      kind,
      upper,
      cervicalBlMm: upper ? 3.05 : 2.85,
      cervicalMdMm: upper ? 2.65 : 2.45,
      equatorBlMm: upper ? 3.95 : 3.65,
      equatorMdMm: upper ? 3.75 : 3.4,
      nominalCrownHeightMm: upper ? 9.4 : 9.0,
      cutbackLabialMm: 1.4,
      cutbackLingualMm: 1.2,
      cutbackProximalMm: 1.2,
      cutbackOcclusalMm: 2.1,
      chamferWidthMm: 0.52,
    };
  }
  if (kind === "premolar") {
    return {
      kind,
      upper,
      cervicalBlMm: upper ? 3.45 : 3.2,
      cervicalMdMm: 2.65,
      equatorBlMm: upper ? 4.45 : 4.1,
      equatorMdMm: 3.55,
      nominalCrownHeightMm: 7.8,
      cutbackLabialMm: 1.45,
      cutbackLingualMm: 1.35,
      cutbackProximalMm: 1.3,
      cutbackOcclusalMm: 2.0,
      chamferWidthMm: 0.55,
    };
  }
  return {
    kind: "molar",
    upper,
    cervicalBlMm: 4.15,
    cervicalMdMm: 3.95,
    equatorBlMm: 5.35,
    equatorMdMm: 5.2,
    nominalCrownHeightMm: 7.4,
    cutbackLabialMm: 1.65,
    cutbackLingualMm: 1.6,
    cutbackProximalMm: 1.55,
    cutbackOcclusalMm: 2.2,
    chamferWidthMm: 0.62,
  };
}

/**
 * 해부학적 크라운 외면 높이 프로파일(s ∈ [0,1], 0=마진, 1=절단/교합정).
 * cLab = cos(φ)(+1 순협측, -1 설구개측), sMes = sin(φ)(±1 근원심).
 */
function crownOuterRadiusRatio(kind: ToothKind, s: number, cLab: number): number {
  // 치경부(s=0)에서 최대풍융부(s≈0.32~0.42)로 완만히 불어난 뒤 절단·교합면으로 자연스럽게 모인다.
  const bulgePeakS = kind === "incisor" || kind === "canine" ? 0.28 : 0.38;
  if (s <= bulgePeakS) {
    return smootherstep(s / bulgePeakS);
  }
  const u = (s - bulgePeakS) / Math.max(1 - bulgePeakS, 1e-5);
  if (kind === "incisor") {
    // 전치는 순설 폭이 절단연 쪽으로 좁아져 쐐기 형태가 되고, 설면 결절(cingulum) 위쪽이 오목해진다.
    const lingualScoop = cLab < 0 ? (-cLab) * Math.sin(Math.PI * Math.min(1, u * 1.15)) * 0.34 : 0;
    const incisalNarrow = Math.abs(cLab) * smootherstep(u) * 0.48 + (1 - Math.abs(cLab)) * smootherstep(u) * 0.1;
    return Math.max(0.18, 1 - lingualScoop - incisalNarrow);
  }
  if (kind === "canine") {
    const lingualScoop = cLab < 0 ? (-cLab) * Math.sin(Math.PI * Math.min(1, u * 1.1)) * 0.28 : 0;
    const cuspNarrow = Math.abs(cLab) * smootherstep(u) * 0.42 + (1 - Math.abs(cLab)) * smootherstep(u) * 0.2;
    return Math.max(0.22, 1 - lingualScoop - cuspNarrow);
  }
  if (kind === "premolar") {
    return Math.max(0.45, 1 - smootherstep(u) * 0.26);
  }
  return Math.max(0.52, 1 - smootherstep(u) * 0.22);
}

/** 치아 종류별 교합면·절단연 높이 윤곽(mm 변화량). */
function crownOcclusalContourMm(kind: ToothKind, upper: boolean, cLab: number, sMes: number): number {
  if (kind === "incisor") {
    // 순측 절단연이 가장 높고 설측 사면으로 낮아진다.
    return 0.25 * cLab - 0.15 * (sMes * sMes);
  }
  if (kind === "canine") {
    // 중앙 첨두(cusp tip)가 솟고 양옆 근·원심 절단연 경사로 내려간다.
    return 0.55 * (1 - 0.85 * Math.abs(sMes)) + 0.2 * cLab - 0.25;
  }
  if (kind === "premolar") {
    // 협측 교두와 설측 교두 + 중심 열구
    const buccalCusp = 0.48 * Math.exp(-((cLab - 0.62) ** 2) / 0.18 - (sMes * sMes) / 0.55);
    const lingualCusp = (upper ? 0.38 : 0.24) * Math.exp(-((cLab + 0.6) ** 2) / 0.18 - (sMes * sMes) / 0.55);
    const centralGroove = -0.32 * Math.exp(-(cLab * cLab) / 0.08);
    return buccalCusp + lingualCusp + centralGroove;
  }
  // 대구치: 4교두(근심협·원심협·근심설·원심설) + 십자 열구와 중심와
  const c1 = 0.46 * Math.exp(-((cLab - 0.58) ** 2 + (sMes - 0.52) ** 2) / 0.22);
  const c2 = 0.42 * Math.exp(-((cLab - 0.58) ** 2 + (sMes + 0.52) ** 2) / 0.22);
  const c3 = 0.45 * Math.exp(-((cLab + 0.58) ** 2 + (sMes - 0.52) ** 2) / 0.22);
  const c4 = 0.36 * Math.exp(-((cLab + 0.58) ** 2 + (sMes + 0.52) ** 2) / 0.22);
  const fossa = -0.38 * Math.exp(-(cLab * cLab + sMes * sMes) / 0.18);
  return c1 + c2 + c3 + c4 + fossa;
}

type InsertionBasis = {
  /** 크라운 삽입축 단위벡터(픽스쳐 로컬 좌표, 교합 방향 +). */
  w: Vec3;
  /** 순협측 단위벡터(w에 수직). */
  uLabial: Vec3;
  /** 근원심 단위벡터(w × uLabial). */
  vMesial: Vec3;
  /** 픽스쳐 장축(+Z)과 크라운 삽입축(w) 사이의 각도(°). */
  angulationDeg: number;
};

/**
 * 픽스쳐 식립축과 악궁 교합·인접치 방향으로부터 단일 크라운 삽입축 틀(uLabial, vMesial, w)을 정한다.
 * 인접치 사이에 크라운이 언더컷 없이 들어가도록 악궁 교합 방향을 따르되, 스크류홀이 포스트 상면 안에 남도록 최대 18°로 제한한다.
 */
function buildCrownInsertionBasis(fixture: MatchedScanbodyFixture): InsertionBasis {
  const occInFix = worldDirToFixtureLocal(fixture.archOcclusalDir, fixture.fixturePose);
  const labInFix = worldDirToFixtureLocal(fixture.labialDir, fixture.fixturePose);

  const rawAngleRad = Math.acos(Math.max(-1, Math.min(1, occInFix[2])));
  const maxTiltRad = (18 * Math.PI) / 180;
  const appliedRad = Math.min(rawAngleRad * 0.9, maxTiltRad);

  let w: Vec3 = [0, 0, 1];
  const latLen = Math.hypot(occInFix[0], occInFix[1]);
  if (latLen > 1e-5 && appliedRad > 1e-4) {
    const s = Math.sin(appliedRad);
    const c = Math.cos(appliedRad);
    w = norm3([(occInFix[0] / latLen) * s, (occInFix[1] / latLen) * s, c]);
  }

  let uLabial = sub3(labInFix, scale3(w, dot3(labInFix, w)));
  if (Math.hypot(...uLabial) < 1e-5) {
    uLabial = Math.abs(w[0]) < 0.9 ? norm3(cross3(w, [1, 0, 0])) : norm3(cross3(w, [0, 1, 0]));
  } else {
    uLabial = norm3(uLabial);
  }
  const vMesial = norm3(cross3(w, uLabial));

  return {
    w,
    uLabial,
    vMesial,
    angulationDeg: Math.round(((appliedRad * 180) / Math.PI) * 10) / 10,
  };
}

/**
 * 구강스캔(잇몸·인접치·대합치)으로 예측 크라운 외형과 컷백된 무언더컷 어벗 포스트 형상을 동시에 설계한다.
 */
export function designCustomAbutmentStl(args: {
  fixture: MatchedScanbodyFixture;
  jawGeometry: THREE.BufferGeometry;
  opposingGeometry: THREE.BufferGeometry | null;
  patientName?: string;
}): DesignedCustomAbutment {
  const { fixture, jawGeometry, opposingGeometry } = args;
  const conn = fixture.connectionSpec;
  const crownSpec = crownSpecForTooth(fixture.toothNumber);
  const basis = buildCrownInsertionBasis(fixture);

  const jawLocalPts = cropScanPointsInFixtureFrame(jawGeometry, fixture.fixturePose, 14.5);
  const opposingLocalPts = cropScanPointsInFixtureFrame(
    opposingGeometry,
    fixture.fixturePose,
    13.5,
  );

  const boreBotR = conn.screwLowerDiameterMm / 2;
  const boreTopR = conn.screwUpperDiameterMm / 2;
  const originR = conn.originDiameterMm / 2;
  const coneTopZ = conn.prcConeTopMm;
  const coneTopR = originR + TAPER_11_SLOPE * coneTopZ;
  const sbR = fixture.scanbodyRadiusMm;
  const sbH = fixture.scanbodyHeightMm;
  const labialAngleFix = Math.atan2(basis.uLabial[1], basis.uLabial[0]);

  // ─────────────────────────────────────────────────────────────
  // Step 1: 픽스쳐 둘레 실제 치은연 높이 z_gingiva(θ) 측정 → 스캘럽 마진 결정
  // ─────────────────────────────────────────────────────────────
  const rawGingivaZ = new Array<number>(SECTORS).fill(Number.NaN);
  const gingivaBuckets: number[][] = Array.from({ length: SECTORS }, () => []);
  for (let i = 0; i < jawLocalPts.length; i += 3) {
    const x = jawLocalPts[i]!;
    const y = jawLocalPts[i + 1]!;
    const z = jawLocalPts[i + 2]!;
    if (z < 0.8 || z > sbH - 0.9) continue;
    const r = Math.hypot(x, y);
    if (r < sbR + 0.35 || r > sbR + 2.4) continue;
    const ang = ((Math.atan2(y, x) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const b = Math.min(SECTORS - 1, Math.floor((ang / (Math.PI * 2)) * SECTORS));
    gingivaBuckets[b]!.push(z);
  }
  const validGingiva: number[] = [];
  for (let b = 0; b < SECTORS; b += 1) {
    const list = gingivaBuckets[b]!;
    if (list.length < 3) continue;
    list.sort((a, c) => a - c);
    const gz = list[Math.floor(list.length * 0.28)]!;
    rawGingivaZ[b] = gz;
    validGingiva.push(gz);
  }
  validGingiva.sort((a, c) => a - c);
  const medianGingivaZ =
    validGingiva.length > 0
      ? validGingiva[Math.floor(validGingiva.length * 0.5)]!
      : Math.max(2.2, fixture.gingivaFloorMm + 0.5);

  // 인접면 스캔 결손이나 원거리 이상치가 마진을 비정상적으로 끌어올리지 않도록 중앙값 기준 ±2.2mm로 제한한다.
  for (let b = 0; b < SECTORS; b += 1) {
    if (Number.isFinite(rawGingivaZ[b]!)) {
      rawGingivaZ[b] = Math.max(
        medianGingivaZ - 2.0,
        Math.min(medianGingivaZ + 2.2, rawGingivaZ[b]!),
      );
      continue;
    }
    let prev = medianGingivaZ;
    let next = medianGingivaZ;
    let dPrev = SECTORS;
    let dNext = SECTORS;
    for (let step = 1; step < SECTORS; step += 1) {
      const lp = rawGingivaZ[(b - step + SECTORS) % SECTORS]!;
      if (dPrev === SECTORS && Number.isFinite(lp)) {
        prev = lp;
        dPrev = step;
      }
      const rn = rawGingivaZ[(b + step) % SECTORS]!;
      if (dNext === SECTORS && Number.isFinite(rn)) {
        next = rn;
        dNext = step;
      }
      if (dPrev < SECTORS && dNext < SECTORS) break;
    }
    rawGingivaZ[b] = (prev * dNext + next * dPrev) / Math.max(dPrev + dNext, 1);
  }

  // 순협측은 심미 서브진지발(치은연 아래 0.5mm), 설측·인접면은 치은연 높이(equigingival)로 자연스러운 스캘럽 마진을 만든다.
  const minMarginZ = Math.max(1.35, coneTopZ + 1.0);
  const maxAllowedMarginZ = Math.min(7.6, medianGingivaZ + 1.8);
  const marginTargetSamples = rawGingivaZ.map((gz, b) => {
    const theta = (b / SECTORS) * Math.PI * 2;
    const cLab = Math.cos(theta - labialAngleFix);
    const subDepth = cLab > 0 ? 0.55 * cLab : 0.1;
    return Math.max(minMarginZ, Math.min(maxAllowedMarginZ, gz - subDepth));
  });
  const smoothMarginZ = lowPassCircular(marginTargetSamples, 2).map((z) =>
    Math.max(minMarginZ, Math.min(maxAllowedMarginZ, z)),
  );
  const meanMarginZ = smoothMarginZ.reduce((s, v) => s + v, 0) / SECTORS;
  const marginOrigin: Vec3 = [0, 0, meanMarginZ];

  // ─────────────────────────────────────────────────────────────
  // Step 2: 크라운 삽입축 틀(uLabial, vMesial, w)에서 인접치·대합치 스캔 측정 → 해부학적 크라운 외형 예측
  // ─────────────────────────────────────────────────────────────
  const crownAdjLimitR = new Array<number>(SECTORS).fill(Infinity);
  const adjTopHeights: number[] = [];
  for (let i = 0; i < jawLocalPts.length; i += 3) {
    const rel: Vec3 = [
      jawLocalPts[i]! - marginOrigin[0],
      jawLocalPts[i + 1]! - marginOrigin[1],
      jawLocalPts[i + 2]! - marginOrigin[2],
    ];
    const h = dot3(rel, basis.w);
    if (h < 1.4 || h > 10.5) continue;
    const u = dot3(rel, basis.uLabial);
    const v = dot3(rel, basis.vMesial);
    const r = Math.hypot(u, v);
    // 스캔바디 기둥(반경 sbR+0.55mm 이내)은 제외하고 실제 인접 자연치 면만 본다.
    const fixR = Math.hypot(jawLocalPts[i]!, jawLocalPts[i + 1]!);
    if (fixR < sbR + 0.65 || r < 2.2 || r > 9.2) continue;
    const phi = ((Math.atan2(v, u) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const b = Math.min(SECTORS - 1, Math.floor((phi / (Math.PI * 2)) * SECTORS));
    if (r < crownAdjLimitR[b]!) crownAdjLimitR[b] = r;
    if (r <= 7.5 && h > 2.5) adjTopHeights.push(h);
  }

  // 대합치 교합면까지 높이 측정(삽입축 w 기준)
  let opposingMinH = Infinity;
  for (let i = 0; i < opposingLocalPts.length; i += 3) {
    const rel: Vec3 = [
      opposingLocalPts[i]! - marginOrigin[0],
      opposingLocalPts[i + 1]! - marginOrigin[1],
      opposingLocalPts[i + 2]! - marginOrigin[2],
    ];
    const h = dot3(rel, basis.w);
    if (h < 3.5 || h > 15) continue;
    const u = dot3(rel, basis.uLabial);
    const v = dot3(rel, basis.vMesial);
    if (Math.hypot(u, v) <= crownSpec.equatorBlMm * 0.92 && h < opposingMinH) {
      opposingMinH = h;
    }
  }

  let crownHeightMm = crownSpec.nominalCrownHeightMm;
  if (Number.isFinite(opposingMinH)) {
    // 대합치와 0.25mm 교합 여유를 둔 실제 크라운 높이
    crownHeightMm = Math.min(crownSpec.nominalCrownHeightMm + 1.4, Math.max(5.4, opposingMinH - 0.25));
  } else if (adjTopHeights.length >= 20) {
    adjTopHeights.sort((a, c) => a - c);
    const adjPeakH = adjTopHeights[Math.floor(adjTopHeights.length * 0.9)]!;
    crownHeightMm = Math.min(crownSpec.nominalCrownHeightMm + 1.2, Math.max(5.4, adjPeakH));
  }

  // 삽입축 방위각 φ별 예측 크라운 최대풍융부 반경 r_crown_eq(φ)와 치경부 마진 반경 r_margin_ins(φ)
  const rawCrownEqR = new Array<number>(SECTORS);
  const rawCervicalR = new Array<number>(SECTORS);
  const minMarginRadius = Math.max(coneTopR + 0.42, boreTopR + MIN_METAL_WALL_MM + 0.35);

  for (let b = 0; b < SECTORS; b += 1) {
    const phi = (b / SECTORS) * Math.PI * 2;
    const cLab = Math.cos(phi);
    const sMes = Math.sin(phi);
    const anatEqR =
      (crownSpec.equatorBlMm * crownSpec.equatorMdMm) /
      Math.hypot(crownSpec.equatorMdMm * cLab, crownSpec.equatorBlMm * sMes);
    const anatCervR =
      (crownSpec.cervicalBlMm * crownSpec.cervicalMdMm) /
      Math.hypot(crownSpec.cervicalMdMm * cLab, crownSpec.cervicalBlMm * sMes);

    // 인접치 스캔 접촉면까지 딱 닿도록(겹침 없이 접촉) 크라운 외경 조정
    const adjR = crownAdjLimitR[b]!;
    const fittedEqR = Number.isFinite(adjR)
      ? Math.max(minMarginRadius + 0.65, Math.min(anatEqR * 1.08, adjR - 0.06))
      : anatEqR;
    const scaleRatio = fittedEqR / Math.max(anatEqR, 1e-5);
    const fittedCervR = Math.max(
      minMarginRadius,
      Math.min(fittedEqR - 0.32, anatCervR * (0.5 + 0.5 * scaleRatio)),
    );

    rawCrownEqR[b] = fittedEqR;
    rawCervicalR[b] = fittedCervR;
  }

  const smoothCrownEqR = lowPassCircular(rawCrownEqR, 3);
  const smoothCervicalR = lowPassCircular(rawCervicalR, 2);

  // ─────────────────────────────────────────────────────────────
  // Step 3: 예측 크라운을 기공소 표준 지르코니아 두께만큼 컷백(reduction)하고,
  //         삽입축(w) 방향 언더컷 0개(엄격 단조 축소 ≥ 5.5° 테이퍼) 포스트 프로파일 산출
  // ─────────────────────────────────────────────────────────────
  const postLevels = 18;
  const crownRows = 16;

  // 포스트 축 중심선 P_axis(h) = marginOrigin + w * h.
  // 경사 식립(w ≠ +Z)이어도 스크류 채널(x²+y² ≤ boreTopR²)이 포스트 상면 외벽 밖으로 뚫고 나오거나
  // 최소 두께 보정 때문에 반대편에 언더컷이 생기지 않도록 포스트 최대 높이(maxSafePostH)를 먼저 정한다.
  const lateralPerMm = Math.hypot(basis.w[0], basis.w[1]);
  const minMetalR = boreTopR + MIN_METAL_WALL_MM;
  const minPostBaseEst = Math.max(
    minMetalR + 0.35,
    Math.min(...smoothCervicalR) - crownSpec.chamferWidthMm,
  );
  // h = 0에서 중심선이 원점에 있으므로, 높이 h에서 스크류축 중심으로부터 포스트 중심선이 lateralPerMm * h 만큼 이동한다.
  // 모든 방향에서 반경 ≥ minMetalR + lateralPerMm * h 를 만족하는 안전한 상단 높이를 구한다.
  const maxSafePostH =
    lateralPerMm > 1e-4
      ? Math.max(
          2.6,
          (minPostBaseEst - minMetalR - 0.12) / (lateralPerMm + MIN_INSERTION_TAPER_SLOPE),
        )
      : 6.4;

  // 각 방위각 col(ANGULAR_COLS)은 픽스쳐 원통 각도 θ를 따른다(하단 6각 헥스와 위상 일치).
  const marginPointByCol: Vec3[] = [];
  const postRingsByCol: Vec3[][] = [];
  const crownRingsByCol: Vec3[][] = [];
  let maxOuterR = 0;
  let cutbackSumMm = 0;
  let cutbackSamples = 0;

  for (let col = 0; col < ANGULAR_COLS; col += 1) {
    const theta = (col / ANGULAR_COLS) * Math.PI * 2;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);

    const zMarginFix = evalPeriodicLinear(smoothMarginZ, theta);
    const radialFix: Vec3 = [ct, st, 0];
    const phiGuess = Math.atan2(dot3(radialFix, basis.vMesial), dot3(radialFix, basis.uLabial));
    const cervR = Math.max(minMarginRadius, evalPeriodicLinear(smoothCervicalR, phiGuess));

    // 마진 점 P_margin(픽스쳐 로컬 좌표)
    const marginPt: Vec3 = [cervR * ct, cervR * st, zMarginFix];
    marginPointByCol.push(marginPt);

    // 마진 점을 삽입축 틀(marginOrigin, uLabial, vMesial, w)에 정확히 투영해 (h0, r0, radDirIns) 산출 — 단차 0 보장!
    const relM = sub3(marginPt, marginOrigin);
    const h0 = dot3(relM, basis.w);
    const uM = dot3(relM, basis.uLabial);
    const vM = dot3(relM, basis.vMesial);
    const r0 = Math.max(minMarginRadius, Math.hypot(uM, vM));
    const phi = Math.atan2(vM, uM);
    const cLab = Math.cos(phi);
    const sMes = Math.sin(phi);
    const radDirIns = norm3(
      add3(scale3(basis.uLabial, cLab), scale3(basis.vMesial, sMes)),
    );
    const eqR = Math.max(r0 + 0.3, evalPeriodicLinear(smoothCrownEqR, phi));

    // 이 방위각에서 예측 크라운의 교합정 높이(hCrownTop)
    const occDelta = crownOcclusalContourMm(crownSpec.kind, crownSpec.upper, cLab, sMes);
    const hCrownTop = Math.max(h0 + 4.4, crownHeightMm + occDelta);

    // 1) 예측 해부학 크라운 외면 링 생성(뷰어 반투명 오버레이용)
    const crownColPts: Vec3[] = [marginPt];
    for (let k = 1; k <= crownRows; k += 1) {
      const s = k / crownRows;
      const h = h0 + (hCrownTop - h0) * s;
      const ratio = crownOuterRadiusRatio(crownSpec.kind, s, cLab);
      const rCrown =
        s <= 0.35
          ? r0 + (eqR - r0) * ratio
          : Math.max(0.4, eqR * ratio);
      const pt = add3(
        marginOrigin,
        add3(scale3(basis.w, h), scale3(radDirIns, rCrown)),
      );
      crownColPts.push(pt);
    }
    crownRingsByCol.push(crownColPts);

    // 2) 방향별 크라운 컷백 두께(순측·설측·인접면 보간)
    const axialCutback =
      (cLab >= 0 ? crownSpec.cutbackLabialMm * cLab : crownSpec.cutbackLingualMm * -cLab) *
        Math.abs(cLab) +
      crownSpec.cutbackProximalMm * (sMes * sMes);

    const lingualDrop =
      (crownSpec.kind === "incisor" || crownSpec.kind === "canine") && cLab < 0
        ? (-cLab) * 0.75
        : 0;
    // 피니시라인 라운드 챔퍼 숄더: 마진 외연(r0)에서 내측으로 chamferWidthMm 들어가 포스트 기저 반경(rPostBase) 형성
    const rPostBase = Math.max(minMetalR + 0.18, r0 - crownSpec.chamferWidthMm);
    const hPostBase = h0 + 0.22;

    // 3) 무언더컷 단조 테이퍼 포스트 반경 계산:
    //    법선이 삽입축과 반대(언더컷)로 뒤집히지 않도록 hPostTop이 반드시 hPostBase + 2.4mm 이상이 되게 보장하고,
    //    삽입축 방향 반경 rIns만으로 엄격 단조 감소(rNext ≤ prevR - slope*dh)시켜 언더컷 0개를 보장한다!
    const hPostTop = Math.max(
      hPostBase + 2.4,
      Math.min(
        hCrownTop - crownSpec.cutbackOcclusalMm - lingualDrop,
        Math.max(hPostBase + 2.6, h0 + maxSafePostH),
        h0 + 6.2,
      ),
    );
    const postColPts: Vec3[] = [];
    const pushPureInsertedPoint = (h: number, rIns: number) => {
      const pt = add3(
        marginOrigin,
        add3(scale3(basis.w, h), scale3(radDirIns, rIns)),
      );
      const fixR = Math.hypot(pt[0], pt[1]);
      if (fixR > maxOuterR) maxOuterR = fixR;
      postColPts.push(pt);
    };

    // 라운드 챔퍼 2단 이행(마진 → 포스트 기저)
    pushPureInsertedPoint(h0 + 0.08, r0 - crownSpec.chamferWidthMm * 0.55);
    pushPureInsertedPoint(hPostBase, rPostBase);

    // 회전방지 평면(순협측 상부 완만한 평탄면)
    const antiRotScale = cLab > 0.35 ? 1 - (cLab - 0.35) * 0.12 : 1;

    let prevR = rPostBase;
    let prevH = hPostBase;
    for (let k = 1; k <= postLevels; k += 1) {
      const u = k / postLevels;
      const h = hPostBase + (hPostTop - hPostBase) * u;
      const dh = Math.max(1e-4, h - prevH);

      const sCrown = Math.max(0, Math.min(1, (h - h0) / Math.max(hCrownTop - h0, 1e-5)));
      const ratio = crownOuterRadiusRatio(crownSpec.kind, sCrown, cLab);
      const rCrownAtH =
        sCrown <= 0.35 ? r0 + (eqR - r0) * ratio : eqR * ratio;

      const rCutback = Math.max(
        0.95,
        (rCrownAtH - axialCutback) * (1 - (1 - antiRotScale) * smootherstep(u)),
      );
      const rTaperMax = prevR - MIN_INSERTION_TAPER_SLOPE * dh;
      const topRound = u > 0.85 ? smootherstep((u - 0.85) / 0.15) * 0.22 : 0;

      const rNext = Math.max(0.85, Math.min(rCutback, rTaperMax) - topRound);
      cutbackSumMm += Math.max(0.6, rCrownAtH - rNext);
      cutbackSamples += 1;

      pushPureInsertedPoint(h, rNext);
      prevR = rNext;
      prevH = h;
    }

    postRingsByCol.push(postColPts);
  }

  // ─────────────────────────────────────────────────────────────
  // Step 4: 하단 커넥션(헥스 + 11° 원뿔) + 치은 출현 커프 + 포스트 + 내부 스크류홀을 하나의 닫힌 2-매니폴드 메시로 조립
  // ─────────────────────────────────────────────────────────────
  const l2 = conn.l2Mm;
  const zBot = -l2;
  const seatZ0 = 0.8;
  const seatZ1 = 1.3;
  const hexFlatR = conn.hexSizeMm ? conn.hexSizeMm / 2 : originR - TAPER_11_SLOPE * (l2 * 0.45);
  const hexCornerR = conn.hexSizeMm ? (hexFlatR / Math.cos(Math.PI / 6)) * 0.982 : hexFlatR;
  const coneStartZ = Math.max(
    zBot + 0.75,
    Math.min(-0.25, (hexCornerR - originR) / TAPER_11_SLOPE),
  );

  const cuffRows = 20;
  const boreRows = 10;
  const columns: Vec3[][] = [];

  for (let col = 0; col < ANGULAR_COLS; col += 1) {
    const theta = (col / ANGULAR_COLS) * Math.PI * 2;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const marginPt = marginPointByCol[col]!;
    const rMarginFix = Math.hypot(marginPt[0], marginPt[1]);
    const zMarginFix = marginPt[2];
    if (rMarginFix > maxOuterR) maxOuterR = rMarginFix;

    const pts: Vec3[] = [];
    const pushFixCyl = (r: number, z: number) => {
      const safeR = Math.max(r, boreBotR + 0.08);
      pts.push([safeR * ct, safeR * st, z]);
    };

    // 1) 바닥 링 → 6각 헥스 → 11° 원뿔 커넥션
    pts.push([boreBotR * ct, boreBotR * st, zBot]);
    const hexR = conn.hexSizeMm ? hexOuterRadiusAt(theta, conn.hexSizeMm) : hexCornerR;
    pushFixCyl(Math.max(boreBotR + 0.14, hexR - 0.16), zBot);
    pushFixCyl(hexR, zBot + 0.14);
    pushFixCyl(hexR, coneStartZ - 0.06);
    pushFixCyl(Math.max(hexR, originR + TAPER_11_SLOPE * coneStartZ), coneStartZ);
    pushFixCyl(originR, 0);
    pushFixCyl(coneTopR, coneTopZ);

    // 2) 치은 출현 커프(coneTopZ → zMarginFix): 하부는 오목/수직에 가깝게 뼈·연조직 압박을 피하고 마진 직전에서 완만히 지지
    const cuffSpan = Math.max(0.35, zMarginFix - coneTopZ);
    for (let k = 1; k <= cuffRows; k += 1) {
      const u = k / cuffRows;
      const z = coneTopZ + cuffSpan * u;
      const linearBase = coneTopR + CUFF_START_SLOPE * (z - coneTopZ);
      const flare = smootherstep(u);
      const r = linearBase + flare * (rMarginFix - linearBase);
      pushFixCyl(r, z);
    }

    // 3) 컷백된 무언더컷 포스트 외벽
    const postPts = postRingsByCol[col]!;
    for (const p of postPts) pts.push(p);

    // 4) 포스트 상단 림 → 픽스쳐 +Z 스크류홀 입구 연결(비스듬한 각도 보정 시에도 교합면 안에 깔끔한 스크류 채널 형성)
    const topPostPt = postPts[postPts.length - 1]!;
    const holeRimZ = Math.max(seatZ1 + 0.9, topPostPt[2] - 0.08);
    pts.push([
      (topPostPt[0] + (boreTopR + 0.14) * ct) * 0.5,
      (topPostPt[1] + (boreTopR + 0.14) * st) * 0.5,
      (topPostPt[2] + holeRimZ) * 0.5 + 0.04,
    ]);
    pts.push([(boreTopR + 0.1) * ct, (boreTopR + 0.1) * st, holeRimZ]);
    pts.push([boreTopR * ct, boreTopR * st, holeRimZ - 0.1]);

    // 5) 내부 스크류 채널 하강
    for (let k = 1; k <= boreRows; k += 1) {
      const u = k / boreRows;
      const z = holeRimZ - 0.1 + (seatZ1 - (holeRimZ - 0.1)) * u;
      pts.push([boreTopR * ct, boreTopR * st, z]);
    }
    pts.push([((boreTopR + boreBotR) * 0.5) * ct, ((boreTopR + boreBotR) * 0.5) * st, (seatZ1 + seatZ0) * 0.5]);
    pts.push([boreBotR * ct, boreBotR * st, seatZ0]);
    pts.push([boreBotR * ct, boreBotR * st, 0]);

    columns.push(pts);
  }

  const ringCount = columns[0]!.length;
  const triCount = ANGULAR_COLS * ringCount * 2;
  const localPositions = new Float32Array(triCount * 9);
  let outOffset = 0;

  const writeTri = (buf: Float32Array, offset: number, a: Vec3, b: Vec3, c: Vec3) => {
    buf[offset] = a[0];
    buf[offset + 1] = a[1];
    buf[offset + 2] = a[2];
    buf[offset + 3] = b[0];
    buf[offset + 4] = b[1];
    buf[offset + 5] = b[2];
    buf[offset + 6] = c[0];
    buf[offset + 7] = c[1];
    buf[offset + 8] = c[2];
    return offset + 9;
  };

  for (let col = 0; col < ANGULAR_COLS; col += 1) {
    const nextCol = (col + 1) % ANGULAR_COLS;
    const colA = columns[col]!;
    const colB = columns[nextCol]!;
    for (let r = 0; r < ringCount; r += 1) {
      const nextR = (r + 1) % ringCount;
      outOffset = writeTri(localPositions, outOffset, colA[r]!, colB[r]!, colB[nextR]!);
      outOffset = writeTri(localPositions, outOffset, colA[r]!, colB[nextR]!, colA[nextR]!);
    }
  }

  // 예측 크라운 외형 메시 생성(상단 교합 중심 캡 포함)
  const crownRingLen = crownRingsByCol[0]!.length;
  const crownApexSum: Vec3 = [0, 0, 0];
  for (let col = 0; col < ANGULAR_COLS; col += 1) {
    const last = crownRingsByCol[col]![crownRingLen - 1]!;
    crownApexSum[0] += last[0] / ANGULAR_COLS;
    crownApexSum[1] += last[1] / ANGULAR_COLS;
    crownApexSum[2] += last[2] / ANGULAR_COLS;
  }
  const crownTriCount = ANGULAR_COLS * ((crownRingLen - 1) * 2 + 1);
  const crownLocalPositions = new Float32Array(crownTriCount * 9);
  let crownOffset = 0;
  for (let col = 0; col < ANGULAR_COLS; col += 1) {
    const nextCol = (col + 1) % ANGULAR_COLS;
    const cA = crownRingsByCol[col]!;
    const cB = crownRingsByCol[nextCol]!;
    for (let r = 0; r < crownRingLen - 1; r += 1) {
      crownOffset = writeTri(crownLocalPositions, crownOffset, cA[r]!, cB[r]!, cB[r + 1]!);
      crownOffset = writeTri(crownLocalPositions, crownOffset, cA[r]!, cB[r + 1]!, cA[r + 1]!);
    }
    crownOffset = writeTri(
      crownLocalPositions,
      crownOffset,
      cA[crownRingLen - 1]!,
      cB[crownRingLen - 1]!,
      crownApexSum,
    );
  }

  const cleanPatient = String(args.patientName || "")
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, "");
  const fileName = cleanPatient
    ? `${cleanPatient}_${fixture.toothNumber}_custom_abutment.stl`
    : `custom_abutment_${fixture.toothNumber}.stl`;
  const stlBlob = encodeBinaryStl(
    localPositions,
    `abuts.fit custom abutment #${fixture.toothNumber}`,
  );

  const toWorld = fixturePoseToMatrix4(fixture.fixturePose);
  const worldGeometry = new THREE.BufferGeometry();
  worldGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(localPositions.slice(), 3),
  );
  worldGeometry.applyMatrix4(toWorld);
  worldGeometry.computeVertexNormals();
  worldGeometry.computeBoundingBox();

  const predictedCrownWorldGeometry = new THREE.BufferGeometry();
  predictedCrownWorldGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(crownLocalPositions, 3),
  );
  predictedCrownWorldGeometry.applyMatrix4(toWorld);
  predictedCrownWorldGeometry.computeVertexNormals();
  predictedCrownWorldGeometry.computeBoundingBox();

  const marginLoopWorld = new Float32Array(ANGULAR_COLS * 3);
  const tmp = new THREE.Vector3();
  for (let col = 0; col < ANGULAR_COLS; col += 1) {
    const mp = marginPointByCol[col]!;
    tmp.set(mp[0], mp[1], mp[2]).applyMatrix4(toWorld);
    marginLoopWorld[col * 3] = tmp.x;
    marginLoopWorld[col * 3 + 1] = tmp.y;
    marginLoopWorld[col * 3 + 2] = tmp.z;
  }

  let zMinLocal = Infinity;
  let zMaxLocal = -Infinity;
  for (let i = 2; i < localPositions.length; i += 3) {
    const z = localPositions[i]!;
    if (z < zMinLocal) zMinLocal = z;
    if (z > zMaxLocal) zMaxLocal = z;
  }

  const cuffMin = Math.min(...smoothMarginZ);
  const cuffMax = Math.max(...smoothMarginZ);
  const meanCutback = cutbackSamples > 0 ? cutbackSumMm / cutbackSamples : 1.5;

  return {
    toothNumber: fixture.toothNumber,
    jaw: fixture.jaw,
    fileName,
    localPositions,
    stlBlob,
    worldGeometry,
    predictedCrownWorldGeometry,
    marginLoopWorld,
    fixture,
    metrics: {
      connectionDiameterMm: conn.originDiameterMm,
      maxDiameterMm: Math.round(maxOuterR * 2 * 100) / 100,
      cuffHeightMinMm: Math.round(cuffMin * 100) / 100,
      cuffHeightMaxMm: Math.round(cuffMax * 100) / 100,
      postHeightMm: Math.round((zMaxLocal - meanMarginZ) * 100) / 100,
      totalLengthMm: Math.round((zMaxLocal - zMinLocal) * 100) / 100,
      angulationDeg: basis.angulationDeg,
      cutbackMm: Math.round(meanCutback * 100) / 100,
      rmsMm: fixture.rmsMm,
    },
  };
}
