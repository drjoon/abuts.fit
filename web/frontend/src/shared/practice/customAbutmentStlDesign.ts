// 매칭된 픽스쳐 자세와 구강스캔(잇몸·인접치·대합치)으로 커스텀어벗 STL을 설계한다.
// 치종별 형상은 추적관리 커스텀어벗 실측(266건) 중앙값 템플릿에서 출발해 스캔에 맞춘다.
// 1) 피니시라인 = 둘레 치은연 아래 marginDepth(기본 0.5mm), 마진 단면 = 치종 템플릿(잇몸 개구부로 크기 보정)
// 2) 삽입축 = 인접 자연치·인접 어벗 장축과 같은 각도(브리지는 더 정확히). 없으면 대합·악궁 방향.
// 3) 예측 크라운 = 포스트 + 축벽 두께. 인접치·이웃 크라운과는 접촉량만 겹치고 대합치와는 접촉만 한다.
// 4) 포스트 = 오목 챔퍼(실측: 45° 시작, 폭 0.5mm, 곡률 ≥ 공구 R) → 편측 테이퍼 축벽(언더컷 없음)
//    → 윗면 라운드. 소·대구치 윗면은 평면, 최정점은 대합치에서 occlusalClearance만큼 아래.
//    예측 크라운 두께(목표 1mm, 공간 없으면 0.65mm)와 스크류 채널 벽을 지키고, 줄이는 양은 둘레로 퍼뜨린다.
// 5) 커프 = cuffBlend 방식(PRC 면 2° 시작 → 4° 유지 → 오목하게 벌어져 실측 각도로 피니시라인, 볼록 없음).
// 6) 포스트 축벽은 솔리드로 두고, 스크류 홀은 그 다음 임플란트 축 원통으로만 뚫는다.
//    원통이 옆면으로 나오지 않게 축벽이 채널을 윗면까지 감싼 뒤 뺀다(manifold).
// 로컬 좌표계(제조사 STL SSOT): 플랫폼 원점(0,0,0), +Z 임플란트 장축, +X 헥스 평면 법선.
// related files:
// - web/frontend/src/shared/practice/customAbutmentDesignParams.ts
// - web/frontend/src/shared/practice/customAbutmentScanbodyMatch.ts
// - web/frontend/src/shared/practice/toothMorphology.ts
// - web/frontend/src/shared/practice/meshUnion.ts
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx
// - web/backend/services/abutmentStl/cuffBlend.js

import * as THREE from "three";
import { encodeBinaryStl } from "@/shared/files/stlBinaryWrite";
import {
  archPlanAxes,
  estimateDentalFrame,
  samplePositions,
  type DentalFrame,
} from "@/shared/practice/dentalFrame";
import {
  cropScanPointsInFixtureFrame,
  fixturePoseToMatrix4,
  locateNominalToothSlot,
  parseFdiTooth,
  type FixtureWorldPose,
  type MatchedScanbodyFixture,
} from "@/shared/practice/customAbutmentScanbodyMatch";
import {
  resolveCustomAbutmentParams,
  type CustomAbutmentDesignParams,
} from "@/shared/practice/customAbutmentDesignParams";
import { subtractTriangleSoups } from "@/shared/practice/meshUnion";
import {
  crownOcclusalReliefRatio,
  toothFormOf,
  type ToothKind,
} from "@/shared/practice/toothMorphology";
import {
  resolveCustomAbutmentSelection,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";
import type { Vec3 } from "@/shared/practice/scanbodyRegistration";

const DEG = Math.PI / 180;
const TAPER_11_SLOPE = Math.tan(11 * DEG);
/**
 * cuffBlend: PRC 면 위 2°로 시작해 골 높이까지 4°를 유지한 뒤 오목하게 벌어진다.
 * 추적관리 실측 마진 직하방 커프는 약 25~30°로 피니시라인에 닿는다(마진 모서리 약 110°).
 */
const CUFF_START_SLOPE = Math.tan(2 * DEG);
const CUFF_HOLD_SLOPE = Math.tan(4 * DEG);
const CUFF_END_SLOPE_MAX = Math.tan(65 * DEG);
const CUFF_BONE_MM = 1.35;
const CUFF_EASE_MM = 0.5;
/** 지르코니아 크라운 두께 하한. 공간이 좁아도 이보다 얇게 두지 않는다(적절 두께 1.0~1.5mm). */
const CROWN_THICKNESS_FLOOR_MM = 0.7;
/** 스크류 채널 둘레 포스트 벽 최소 두께(구치부 360° 칼라 및 전치부 순·근·원심 칼라). 인접 임플란트 근접 시 tight 하한까지 허용. */
const SCREW_WALL_MM = 0.55;
const SCREW_WALL_TIGHT_MM = 0.32;
const ANTERIOR_SCREW_WALL_MM = 0.52;
const ANTERIOR_SCREW_LINGUAL_WALL_MM = 0.44;
/** 윗면 라운드 반경. 축벽에 접선으로 이어진다(턱 없음, 구치 기공소 STL 실측 ~0.32mm). */
const TOP_ROUND_POSTERIOR_MM = 0.32;
const TOP_ROUND_ANTERIOR_MM = 0.45;
const TOP_ROUND_STEPS = 10;
/** 픽스쳐 사이가 이 안이면 붙은 치아로 보고 삽입축을 평행하게 맞춘다. */
const PARALLEL_GROUP_MM = 13;
/** 소·대구치 평평한 윗면의 최대 기울기. */
const FLAT_TOP_MAX_TILT = Math.tan(7 * DEG);
/** 전치에서 크라운 제한 때문에 포스트가 안으로 들어갈 때 아래로 벌어지는 최대 기울기. */
const POST_STEP_SLOPE = Math.tan(25 * DEG);
/** 전치에서 크라운 공간 때문에 깎은 축벽이 아래 원래 벽으로 돌아가는 사선. */
const POST_CUT_SLOPE = Math.tan(12 * DEG);
const POST_BASE_KEEP_MM = 0.12;
const POST_BASE_LEAN = Math.tan(35 * DEG);
const LINGUAL_CONVERGE_EARLIER = 0.2;
/** 임플란트 수직축이 대합치·근접치 중심축에서 이 안에 들면 기울이지 않고 수직(0°)으로 세운다. */
const AXIS_VERTICAL_DEADZONE_POSTERIOR_MM = 0.4;
const AXIS_VERTICAL_DEADZONE_ANTERIOR_MM = 0.85;
/** 스캘럽 마진 진폭(근·원심 높고 협·설 낮음, 반진폭 mm = 최고~최저의 절반). 완만한 곡선만 그린다. */
const SCALLOP_MIN_POSTERIOR_MM = 0.28;
const SCALLOP_MAX_POSTERIOR_MM = 0.85;
const SCALLOP_MIN_ANTERIOR_MM = 0.42;
const SCALLOP_MAX_ANTERIOR_MM = 1.15;
/** 2.5° 간격(144열) — 6각 헥스 모서리(30°+60°k)가 격자 위에 놓인다. */
const ANGULAR_COLS = 144;
const SECTORS = 36;
const SUPERELLIPSE_N = 2.4;
const POST_LEVELS = 24;
const CROWN_LEVELS = 14;
const CHAMFER_STEPS = 7;
const LIMIT_PHI_BINS = 72;
const LIMIT_H_MIN = -3.5;
const LIMIT_H_STEP = 0.5;
const LIMIT_H_BINS = 42;
const OPP_CELL_MM = 0.5;
/** 인접치 스캔으로 크라운을 자르는 높이(국소 마진 위). 치간유두 잇몸 바로 위 실제 인접치 법랑질부터 반영한다. */
const CONTACT_CLIP_FROM_MM = 1.95;
const CONTACT_CLIP_MIN_ABOVE_MEAN_MM = 2.6;
/** 인접치·인접 기성 어벗과 마진 사이의 최소 유격(크라운 장착 시 간섭 방지: 내 크라운 출현 두께 + 인접 크라운 출현 두께 + 장착 여유). */
const ADJACENT_MARGIN_CLEARANCE_MM = 1.6;
/** 인접 디자인 크라운 중간 경계면에서 각 마진까지 띄우는 기본 반유격(여유 있을 때 양쪽 합 1.8mm). */
const NEIGHBOR_PLANE_MARGIN_GAP_MM = 0.9;
/** 인접 픽스쳐가 바짝 붙어 있을 때도 정체결 간섭이 없도록 반드시 지키는 마진 간 최소 물리 간격(양쪽 합 ≥ 0.6mm > 0.5mm). */
const MIN_NEIGHBOR_MARGIN_PAIR_GAP_MM = 0.62;
/** 피니시라인을 스캔 잇몸 안쪽 면보다 이만큼 안에 둔다(잇몸을 누르지 않게). */
const GINGIVA_INSET_MM = 0.2;
/** 픽스쳐가 깊게 식립되어 커프 여유가 있을 때 우선 확보할 최소 포스트 높이(mm)와 최대 치은 하방 깊이(mm). */
const TARGET_RETENTION_POST_HEIGHT_MM = 4.5;
const MARGIN_SUBG_MAX_MM = 2.0;
/** 치은선을 초기 추정하는 범위: 스캔바디 면에서 바깥으로 이만큼(출현 소켓 테두리까지 보되 가파른 인접치 벽 직전에서 멈춘다). */
const GINGIVA_RIM_REACH_MM = 2.1;
const GINGIVA_RIM_BIN_MM = 0.4;
/** 바깥 칸이 이보다 가파르게 솟으면 잇몸이 아니라 인접치 벽이다. */
const GINGIVA_RIM_MAX_STEP_MM = 0.95;
const MIN_POST_HEIGHT_MM = 4;
/** 포스트 윗면은 예측 크라운 교합면(인접치 높이)보다 이만큼 낮다. */
const POST_BELOW_CROWN_MM = 1.5;
const CROWN_TOP_OCC_MAX_MM = 4.5;

export type CustomAbutmentDesignMetrics = {
  connectionDiameterMm: number;
  maxDiameterMm: number;
  cuffHeightMinMm: number;
  cuffHeightMaxMm: number;
  postHeightMm: number;
  totalLengthMm: number;
  /** 픽스쳐 장축과 크라운 삽입축 사이의 각도(°). */
  angulationDeg: number;
  /** 예측 크라운 대비 평균 축벽 컷백 두께(mm). */
  cutbackMm: number;
  rmsMm: number;
  /** 포스트 축벽 평균 편측 테이퍼(°). */
  postTaperDeg: number;
  /** 포스트 윗면 → 대합치 최소 거리(mm). 대합치가 없으면 null. */
  occlusalClearanceMm: number | null;
  marginFilletRadiusMm: number;
  /** opposing: 대합치 중심, arch: 악궁 교합 방향, parallel: 붙은 치아와 평행. */
  axisSource: "opposing" | "arch" | "parallel";
  /** 인접 자연치 교합면 높이(마진 기준 mm). 인접치가 없으면 null. 예전 저장본은 없다. */
  adjacentOcclusalMm?: number | null;
  /** 예측 크라운 교합면 − 포스트 윗면(mm). */
  crownOverPostMm?: number;
};

export type DesignedCustomAbutment = {
  toothNumber: string;
  jaw: "upper" | "lower";
  fileName: string;
  /** 픽스쳐 로컬 좌표(플랫폼 원점, +Z 장축) 삼각형 정점(9개씩). */
  localPositions: Float32Array;
  /** 스크류 홀을 뚫기 전 닫힌 솔리드 외형 삼각형 정점(검볼 변형 후 임플란트 축 스크류 홀 재부울 연산용). */
  solidBodyLocalPositions?: Float32Array;
  /** 픽스쳐 로컬 좌표 예측 크라운 삼각형 정점. */
  crownLocalPositions: Float32Array;
  /** 픽스쳐 로컬 좌표 피니시라인(x,y,z 반복). */
  marginLoopLocal: Float32Array;
  stlBlob: Blob;
  /** 스캔 월드 좌표로 배치된 커스텀어벗 BufferGeometry. */
  worldGeometry: THREE.BufferGeometry;
  /** 스캔 월드 좌표로 배치된 예측 크라운 외형 BufferGeometry(뷰어 반투명 확인용). */
  predictedCrownWorldGeometry: THREE.BufferGeometry;
  /** 스캔 월드 좌표의 피니시라인 폐곡선(x,y,z 반복). */
  marginLoopWorld: Float32Array;
  fixture: MatchedScanbodyFixture;
  params: CustomAbutmentDesignParams;
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
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const wrapAngle = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

function worldDirToFixtureLocal(dir: Vec3, pose: FixtureWorldPose): Vec3 {
  return norm3([dot3(dir, pose.hexX), dot3(dir, pose.hexY), dot3(dir, pose.axis)]);
}

function fixtureLocalDirToWorld(dir: Vec3, pose: FixtureWorldPose): Vec3 {
  return norm3(
    add3(add3(scale3(pose.hexX, dir[0]), scale3(pose.hexY, dir[1])), scale3(pose.axis, dir[2])),
  );
}

function worldPointToFixtureLocal(p: Vec3, pose: FixtureWorldPose): Vec3 {
  const rel = sub3(p, pose.origin);
  return [dot3(rel, pose.hexX), dot3(rel, pose.hexY), dot3(rel, pose.axis)];
}

function smootherstep(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** ∫₀ˣ smootherstep. x=1이면 0.5. */
function smootherstepIntegral(t: number) {
  const x = clamp(t, 0, 1);
  return x ** 4 * (x * x - 3 * x + 2.5);
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

/** 둘레 배열 3탭 평균(passes회). */
function smoothCircular(values: readonly number[], passes: number): number[] {
  let cur = [...values];
  const n = cur.length;
  for (let p = 0; p < passes; p += 1) {
    cur = cur.map((v, i) => (cur[(i - 1 + n) % n]! + v * 2 + cur[(i + 1) % n]!) / 4);
  }
  return cur;
}

function evalPeriodicLinear(samples: readonly number[], theta: number): number {
  const n = samples.length;
  let u = theta / (Math.PI * 2);
  u -= Math.floor(u);
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

/** 반축 a(순설, φ=0/π)·b(근원심, φ=±π/2)인 초타원의 φ 방향 반경. */
function superellipseRadius(a: number, b: number, phi: number, n = SUPERELLIPSE_N) {
  const c = Math.abs(Math.cos(phi)) / a;
  const s = Math.abs(Math.sin(phi)) / b;
  return (c ** n + s ** n) ** (-1 / n);
}

type SectionRole = "margin" | "post" | "crown";

/**
 * 교합면에서 본 치종·역할별 해부 단면 반경(향기로운치과 기공소 커스텀어벗·보철 STL 37건 실측 기반).
 * - 대구치(molar): 포스트 n=3.20·마진 n=3.00의 뚜렷한 둥근 모서리 사각형, 크라운 n=2.60 해부 사각 외형
 * - 소구치(premolar): 협설(BL)이 근원심(MD)보다 긴 대칭 계란형 타원 (n=2.34)
 * - 견치(canine): 순측 호 + 근·원심 우각 + 설측 결절로 수렴하는 대칭 둥근 삼각-타원형
 * - 전치(incisor): 순측 완만한 평면감과 근·원심 유지벽을 가진 대칭 타원형
 */
function toothSectionRadius(
  kind: ToothKind,
  role: SectionRole,
  aBl: number,
  bMd: number,
  phi: number,
): number {
  const cp = Math.cos(phi);
  if (kind === "molar") {
    if (role === "post") return superellipseRadius(aBl, bMd, phi, 3.25);
    if (role === "margin") return superellipseRadius(aBl, bMd, phi, 3.05);
    return superellipseRadius(aBl, bMd * (1 + 0.025 * cp), phi, 2.65);
  }
  if (kind === "premolar") {
    if (role === "post") return superellipseRadius(aBl, bMd, phi, 2.75);
    if (role === "margin") return superellipseRadius(aBl, bMd, phi, 2.65);
    return superellipseRadius(aBl, bMd * (1 + 0.05 * cp), phi, 2.35);
  }
  if (kind === "canine") {
    if (role === "margin") {
      return superellipseRadius(aBl, bMd * (1 + 0.09 * cp), phi, 2.25);
    }
    const triWidth = 1 + (role === "crown" ? 0.14 : 0.11) * cp;
    const base = superellipseRadius(aBl, bMd * triWidth, phi, role === "crown" ? 2.3 : 2.32);
    const corner3 = 1 - (role === "crown" ? 0.022 : 0.006) * Math.cos(3 * phi);
    return base * corner3;
  }
  const incisorWidth = 1 + (role === "crown" ? 0.085 : role === "post" ? 0.07 : 0.05) * cp;
  return superellipseRadius(aBl, bMd * incisorWidth, phi, role === "crown" ? 2.28 : 2.22);
}

function toothOcclusalSectionRadius(kind: ToothKind, aBl: number, bMd: number, phi: number): number {
  return toothSectionRadius(kind, "post", aBl, bMd, phi);
}

/**
 * 중심 (cu, cv)에 놓인 치종 해부 단면(순측 반폭 aBlPos, 설측 반폭 aBlNeg, 근원심 반폭 bMd)과
 * 원점 (0, 0)에서 (du, dv) 방향으로 쏜 반직선이 만나는 정확한 거리를 이분법으로 구한다.
 * 열별 독립 클리핑 대신 중심 이동·반축 스케일만 조정한 해석 단면을 써서 삼각형 찌그러짐을 원천 차단한다.
 */
function analyticSectionRay(
  kind: ToothKind,
  role: SectionRole,
  aBlPos: number,
  aBlNeg: number,
  bMd: number,
  cu: number,
  cv: number,
  du: number,
  dv: number,
): number {
  const evalNorm = (r: number) => {
    const u = r * du - cu;
    const v = r * dv - cv;
    const len = Math.hypot(u, v);
    if (len < 1e-7) return 0;
    const phi = Math.atan2(v, u);
    const aBl =
      Math.abs(aBlPos - aBlNeg) < 1e-6
        ? aBlPos
        : aBlNeg + (aBlPos - aBlNeg) * smootherstep((Math.cos(phi) + 1) * 0.5);
    const secR = toothSectionRadius(kind, role, Math.max(0.35, aBl), Math.max(0.35, bMd), phi);
    return len / Math.max(secR, 1e-4);
  };
  if (evalNorm(0) >= 0.998) return Number.NaN;
  let lo = 0;
  let hi = Math.hypot(cu, cv) + Math.max(aBlPos, aBlNeg, bMd) * 1.48;
  while (evalNorm(hi) < 1 && hi < 24) hi *= 1.5;
  for (let it = 0; it < 16; it += 1) {
    const mid = (lo + hi) * 0.5;
    if (evalNorm(mid) < 1) lo = mid;
    else hi = mid;
  }
  return (lo + hi) * 0.5;
}

/**
 * cuffBlend 커프 단면 r(z). PRC 면에서 2°(곡률 0)로 시작해 골 높이까지 4°를 유지하고,
 * 오목하게 기울기를 올린 뒤(r'' ≥ 0, 볼록 없음) 같은 기울기로 피니시라인에 닿는다.
 * 끝 기울기는 필요한 만큼만 둔다(실측 25~30°). 칼날 마진을 만드는 65° 플레어는 피한다.
 */
function cuffProfile(rStart: number, zStart: number, rEnd: number, zEnd: number) {
  const span = Math.max(0.35, zEnd - zStart);
  const delta = rEnd - rStart;
  if (delta <= 0) {
    return (z: number) => rStart + delta * clamp((z - zStart) / span, 0, 1);
  }
  const s0 = CUFF_START_SLOPE;
  const s1 = CUFF_HOLD_SLOPE;
  type Plan = { e: number; zh: number; lead: number; lr: number; sEnd: number; scale: number };
  const planFor = (holdMm: number): Plan => {
    const zh = Math.min(holdMm, span * 0.25);
    const e = Math.min(CUFF_EASE_MM, zh * 0.6);
    const lead = (e * (s0 + s1)) / 2 + (zh - e) * s1;
    const L = span - zh;
    const need = delta - lead;
    if (L <= 1e-6 || need <= L * s1) {
      // 마진이 가까워 벌어질 필요가 없다. 같은 모양을 비례로 줄인다.
      const full = lead + L * s1;
      return { e, zh, lead, lr: 0, sEnd: s1, scale: full > 0 ? delta / full : 1 };
    }
    const lr = Math.min(L, Math.max(0.4, L * 0.3));
    const sEnd = (need - (lr * s1) / 2) / (L - lr / 2);
    return { e, zh, lead, lr, sEnd, scale: 1 };
  };
  let plan = planFor(CUFF_BONE_MM);
  if (plan.sEnd > CUFF_END_SLOPE_MAX) plan = planFor(CUFF_EASE_MM);
  if (plan.sEnd > CUFF_END_SLOPE_MAX) plan = planFor(0);
  const { e, zh, lead, lr, sEnd, scale } = plan;
  return (z: number) => {
    const u = clamp(z - zStart, 0, span);
    let r: number;
    if (u <= e) {
      r = s0 * u + (e > 0 ? (s1 - s0) * e * smootherstepIntegral(u / e) : 0);
    } else if (u <= zh) {
      r = (e * (s0 + s1)) / 2 + s1 * (u - e);
    } else {
      const x = u - zh;
      if (lr <= 0) r = lead + s1 * x;
      else if (x <= lr) r = lead + s1 * x + (sEnd - s1) * lr * smootherstepIntegral(x / lr);
      else r = lead + s1 * lr + (sEnd - s1) * lr * 0.5 + sEnd * (x - lr);
    }
    return rStart + r * scale;
  };
}

/**
 * 피니시라인 위 오목 챔퍼. 축에서 startDeg로 시작해 축벽 기울기(endSlope)에 접한다.
 * 폭 width·높이를 돌려준다. 곡률 반경은 공구 R보다 작아지지 않게 시작 각을 줄인다.
 */
function chamferGeometry(width: number, toolR: number, endSlope: number) {
  const th1 = Math.atan(endSlope);
  const rho = Math.max(toolR, 0.2);
  // 반경 = 공구 R. 폭이 R보다 넓으면 90°에서 시작하고 나머지는 평평한 숄더다.
  const th0 = Math.max(Math.acos(clamp(Math.cos(th1) - width / rho, 0, 1)), th1 + 5 * DEG);
  return { th0, th1, rho, height: rho * (Math.sin(th0) - Math.sin(th1)) };
}

/** 원점에서 (du, dv) 방향 반직선이 중심 (cu, cv)·반축 a, b 타원과 만나는 거리. 원점이 밖이면 NaN. */
function ellipseRay(du: number, dv: number, a: number, b: number, cu: number, cv: number): number {
  const qa = (du / a) ** 2 + (dv / b) ** 2;
  const qb = -2 * ((du * cu) / (a * a) + (dv * cv) / (b * b));
  const qc = (cu / a) ** 2 + (cv / b) ** 2 - 1;
  if (qc >= 0) return Number.NaN;
  return (-qb + Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa);
}

/** 둘레 배열에서 cap을 넘는 양만 매끄럽게 퍼뜨려 뺀다(열마다 꺾이지 않게). */
function smoothCircularReduce(
  want: readonly number[],
  cap: readonly number[],
  halfWidth: number,
  passes: number,
): number[] {
  const n = want.length;
  const deficit = want.map((v, i) => Math.max(0, v - cap[i]!));
  if (!deficit.some((d) => d > 1e-6)) return [...want];
  const dilated = deficit.map((_, i) => {
    let m = 0;
    for (let k = -halfWidth; k <= halfWidth; k += 1) m = Math.max(m, deficit[(i + k + n) % n]!);
    return m;
  });
  const spread = smoothCircular(dilated, passes);
  return want.map((v, i) => v - Math.max(spread[i]!, deficit[i]!));
}

/**
 * 극좌표 반경 배열 radii(θ_i) 안쪽에 내접하는 매끄럽고 100% 볼록한 곡선 반경을 구한다.
 * - 오목(reflex) 꼭짓점에서 외측 접평면(half-plane)으로 양옆 어깨만 안쪽으로 다듬어 radii 상한을 넘지 않으면서 오목을 모두 없앤다.
 * - 이어서 볼록 다각형 코너 완화로 꺾임 없는 매끄러운 볼록 곡선으로 마감한다.
 */
function convexInscribedSmoothRadii(
  radii: readonly number[],
  minRadii: readonly number[],
  smoothPasses = 14,
  dirs?: ReadonlyArray<[number, number]>,
): number[] {
  const n = radii.length;
  const r = [...radii];
  const cosT = dirs ? dirs.map((d) => d[0]) : Array.from({ length: n }, (_, i) => Math.cos((i / n) * Math.PI * 2));
  const sinT = dirs ? dirs.map((d) => d[1]) : Array.from({ length: n }, (_, i) => Math.sin((i / n) * Math.PI * 2));

  const globalMinR = Math.max(0.25, Math.min(...minRadii));
  for (let iter = 0; iter < 96; iter += 1) {
    let worstCross = 0;
    let worstI = -1;
    for (let i = 0; i < n; i += 1) {
      const i0 = (i - 1 + n) % n;
      const i2 = (i + 1) % n;
      const x0 = r[i0]! * cosT[i0]!;
      const y0 = r[i0]! * sinT[i0]!;
      const x1 = r[i]! * cosT[i]!;
      const y1 = r[i]! * sinT[i]!;
      const x2 = r[i2]! * cosT[i2]!;
      const y2 = r[i2]! * sinT[i2]!;
      const cr = (x1 - x0) * (y2 - y1) - (y1 - y0) * (x2 - x1);
      if (cr < worstCross) {
        worstCross = cr;
        worstI = i;
      }
    }
    if (worstCross >= -1e-6 || worstI < 0) break;
    const i = worstI;
    const i0 = (i - 1 + n) % n;
    const i2 = (i + 1) % n;
    const x0 = r[i0]! * cosT[i0]!;
    const y0 = r[i0]! * sinT[i0]!;
    const x1 = r[i]! * cosT[i]!;
    const y1 = r[i]! * sinT[i]!;
    const x2 = r[i2]! * cosT[i2]!;
    const y2 = r[i2]! * sinT[i2]!;
    const e1l = Math.hypot(x1 - x0, y1 - y0) || 1;
    const e2l = Math.hypot(x2 - x1, y2 - y1) || 1;
    let nx = (y1 - y0) / e1l + (y2 - y1) / e2l;
    let ny = -(x1 - x0) / e1l - (x2 - x1) / e2l;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const hPlane = x1 * nx + y1 * ny;
    if (hPlane <= globalMinR) break;
    // 어떤 열 j의 하한 minRadii[j]도 침범하지 않도록 반평면 거리를 하한 이상으로만 건다.
    let safeH = hPlane;
    for (let j = 0; j < n; j += 1) {
      const denom = cosT[j]! * nx + sinT[j]! * ny;
      if (denom > 0.2) safeH = Math.max(safeH, minRadii[j]! * denom);
    }
    let changed = false;
    for (let j = 0; j < n; j += 1) {
      const denom = cosT[j]! * nx + sinT[j]! * ny;
      if (denom > 0.2) {
        const rPlane = safeH / denom;
        if (rPlane < r[j]! - 1e-6) {
          r[j] = rPlane;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  let pts: Array<[number, number]> = r.map((rad, i) => [rad * cosT[i]!, rad * sinT[i]!]);
  for (let pass = 0; pass < smoothPasses; pass += 1) {
    pts = pts.map((p, i) => {
      const p0 = pts[(i - 1 + n) % n]!;
      const p2 = pts[(i + 1) % n]!;
      return [p[0] * 0.5 + (p0[0] + p2[0]) * 0.25, p[1] * 0.5 + (p0[1] + p2[1]) * 0.25];
    });
  }

  const sampled = r.map((_, i) => {
    const dx = cosT[i]!;
    const dy = sinT[i]!;
    let best = r[i]!;
    for (let off = -6; off <= 6; off += 1) {
      const a = pts[(i + off + n) % n]!;
      const b = pts[(i + off + 1 + n) % n]!;
      const cr1 = dx * a[1] - dy * a[0];
      const cr2 = dx * b[1] - dy * b[0];
      if ((cr1 <= 1e-9 && cr2 >= -1e-9) || (cr1 >= -1e-9 && cr2 <= 1e-9)) {
        const denom = cr2 - cr1;
        const t = Math.abs(denom) > 1e-12 ? -cr1 / denom : 0;
        if (t >= -1e-4 && t <= 1 + 1e-4) {
          best = Math.hypot(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
          break;
        }
      }
    }
    return Math.max(minRadii[i]!, best);
  });
  // 스크류 채널 하한(minRadii) 원호와 직선 벽이 만나는 접점에서 생길 수 있는 미세 오목(0.02mm)까지 볼록 포락선으로 메운다.
  const out = [...sampled];
  for (let iter = 0; iter < 48; iter += 1) {
    let fixedAny = false;
    for (let i = 0; i < n; i += 1) {
      const i0 = (i - 1 + n) % n;
      const i2 = (i + 1) % n;
      const r0 = out[i0]!;
      const r2 = out[i2]!;
      const x0 = r0 * cosT[i0]!;
      const y0 = r0 * sinT[i0]!;
      const dx = cosT[i]!;
      const dy = sinT[i]!;
      const x1 = out[i]! * dx;
      const y1 = out[i]! * dy;
      const x2 = r2 * cosT[i2]!;
      const y2 = r2 * sinT[i2]!;
      if ((x1 - x0) * (y2 - y1) - (y1 - y0) * (x2 - x1) < -1e-7) {
        const ex = x2 - x0;
        const ey = y2 - y0;
        const det = dx * ey - dy * ex;
        if (Math.abs(det) > 1e-8) {
          const chordR = (x0 * ey - y0 * ex) / det;
          if (chordR > out[i]! && chordR < out[i]! + 0.25) {
            out[i] = chordR + 1e-5;
            fixedAny = true;
          }
        }
      }
    }
    if (!fixedAny) break;
  }
  return out;
}

/**
 * 치종별 커스텀어벗 템플릿(mm). 추적관리 디자인 실측 중앙값:
 * 마진 단면(순설·근원심 지름), 포스트 윗면(순측·설측 반폭, 근원심 지름), 마진 평균에서 포스트 높이.
 */
type AbutmentTemplate = {
  kind: ToothKind;
  anterior: boolean;
  marginBlMm: number;
  marginMdMm: number;
  topLabialHalfMm: number;
  topLingualHalfMm: number;
  topMdMm: number;
  postHeightMm: number;
  /** 자연치 근원심 폭 — 인접 간격으로 크기 보정할 때 기준. */
  naturalMdMm: number;
  /** 자연치 순설(협설) 폭(최대 풍융부). 예측 크라운이 이보다 작아지지 않는다. */
  naturalBlMm: number;
  /** 윗면 설측이 순측보다 낮아지는 양(전치 절단 경사). */
  lingualTopDropMm: number;
  /** 크라운 축벽 두께: 순측 / 설측 / 교합·절단. */
  crownLabialMm: number;
  crownLingualMm: number;
  crownOcclusalMm: number;
};

function abutmentTemplateForTooth(toothNumber: string): AbutmentTemplate {
  const parsed = parseFdiTooth(toothNumber);
  const form = toothFormOf(toothNumber);
  const pos = parsed?.pos ?? 6;
  const upper = form?.upper ?? true;
  const kind: ToothKind = form?.kind ?? "molar";

  if (kind === "incisor") {
    if (!upper) {
      return {
        kind, anterior: true,
        marginBlMm: 4.3, marginMdMm: 4.4,
        topLabialHalfMm: 1.0, topLingualHalfMm: 0.72, topMdMm: 3.25,
        postHeightMm: 7.0, naturalMdMm: 5.6, naturalBlMm: 6.2, lingualTopDropMm: 0.28,
        crownLabialMm: 1.1, crownLingualMm: 0.9, crownOcclusalMm: 1.6,
      };
    }
    const lateral = pos === 2;
    return {
      kind, anterior: true,
      marginBlMm: lateral ? 4.4 : 4.7, marginMdMm: lateral ? 4.85 : 5.2,
      topLabialHalfMm: lateral ? 1.1 : 1.18, topLingualHalfMm: lateral ? 0.72 : 0.78, topMdMm: lateral ? 3.55 : 3.85,
      postHeightMm: lateral ? 6.8 : 7.3, naturalMdMm: lateral ? 6.6 : 8.5, naturalBlMm: lateral ? 6.0 : 7.0,
      lingualTopDropMm: 0.35,
      crownLabialMm: 1.2, crownLingualMm: 1.0, crownOcclusalMm: 1.7,
    };
  }
  if (kind === "canine") {
    return {
      kind, anterior: true,
      marginBlMm: upper ? 5.15 : 4.85, marginMdMm: upper ? 5.15 : 4.85,
      topLabialHalfMm: upper ? 1.32 : 1.22, topLingualHalfMm: upper ? 0.85 : 0.8, topMdMm: upper ? 3.85 : 3.55,
      postHeightMm: upper ? 7.4 : 7.2, naturalMdMm: upper ? 7.6 : 6.9, naturalBlMm: upper ? 8.0 : 7.5,
      lingualTopDropMm: 0.35,
      crownLabialMm: 1.2, crownLingualMm: 1.0, crownOcclusalMm: 1.8,
    };
  }
  if (kind === "premolar") {
    return {
      kind, anterior: false,
      marginBlMm: upper ? 6.15 : 5.65, marginMdMm: upper ? 4.95 : 4.75,
      topLabialHalfMm: upper ? 2.45 : 2.25, topLingualHalfMm: upper ? 2.35 : 2.15,
      topMdMm: upper ? 3.85 : 3.65,
      postHeightMm: upper ? 5.6 : 6.0, naturalMdMm: 7.0,
      naturalBlMm: upper ? 9.0 : pos === 4 ? 7.8 : 8.2,
      lingualTopDropMm: 0.18,
      crownLabialMm: 1.2, crownLingualMm: 1.1, crownOcclusalMm: 1.8,
    };
  }
  const second = pos === 7 || pos === 8;
  return {
    kind: "molar", anterior: false,
    marginBlMm: upper ? 6.85 : 6.55, marginMdMm: upper ? 6.75 : 6.65,
    topLabialHalfMm: upper ? 2.85 : 2.75, topLingualHalfMm: upper ? 2.85 : 2.75,
    topMdMm: upper ? 5.65 : 5.55,
    postHeightMm: upper ? 5.5 : 5.3,
    naturalMdMm: upper ? (second ? 9.6 : 10.3) : second ? 10.4 : 10.9,
    naturalBlMm: upper ? (second ? 10.6 : 11.1) : second ? 10.0 : 10.5,
    lingualTopDropMm: 0.12,
    crownLabialMm: 1.3, crownLingualMm: 1.2, crownOcclusalMm: 1.9,
  };
}

type InsertionFrame = {
  w: Vec3;
  uLabial: Vec3;
  vSide: Vec3;
};

function insertionFrame(w: Vec3, labialHint: Vec3): InsertionFrame {
  let uLabial = sub3(labialHint, scale3(w, dot3(labialHint, w)));
  if (Math.hypot(...uLabial) < 1e-5) {
    uLabial = Math.abs(w[0]) < 0.9 ? norm3(cross3(w, [1, 0, 0])) : norm3(cross3(w, [0, 1, 0]));
  } else {
    uLabial = norm3(uLabial);
  }
  return { w, uLabial, vSide: norm3(cross3(w, uLabial)) };
}

/** 이보다 낮으면 그쪽은 자연치가 아니라 잇몸(무치악·이웃 스캔바디 자리)이다. 마진 기준 mm. */
const ADJACENT_TOOTH_MIN_H_MM = 5;

type ContralateralCrownMirror = {
  toothNumber: string;
  blMm: number;
  mdMm: number;
  crownHeightMm: number;
  /** 해부 각도(0=순·협, +π/2=근심, π=설·구개, -π/2=원심) 36칸 타원 대비 반경 배율. */
  contourRatio: number[];
};

const jawFrameCache = new WeakMap<THREE.BufferGeometry, DentalFrame | null>();
const biJawFrameCache = new WeakMap<
  THREE.BufferGeometry,
  WeakMap<THREE.BufferGeometry, DentalFrame | null>
>();

function getBiJawDentalFrame(
  jawGeometry: THREE.BufferGeometry,
  opposingGeometry: THREE.BufferGeometry | null | undefined,
  jaw: "upper" | "lower",
): DentalFrame | null {
  if (!opposingGeometry) return null;
  let subMap = biJawFrameCache.get(jawGeometry);
  if (!subMap) {
    subMap = new WeakMap();
    biJawFrameCache.set(jawGeometry, subMap);
  }
  if (subMap.has(opposingGeometry)) return subMap.get(opposingGeometry) ?? null;
  const computed = estimateDentalFrame([
    { role: jaw, geometry: jawGeometry },
    { role: jaw === "upper" ? "lower" : "upper", geometry: opposingGeometry },
  ]);
  subMap.set(opposingGeometry, computed);
  return computed;
}

function getJawDentalFrame(jawGeometry: THREE.BufferGeometry, fixture: MatchedScanbodyFixture): DentalFrame | null {
  if (jawFrameCache.has(jawGeometry)) return jawFrameCache.get(jawGeometry) ?? null;
  const pts = samplePositions(jawGeometry, 2000);
  const plan = archPlanAxes(pts);
  if (!plan) {
    jawFrameCache.set(jawGeometry, null);
    return null;
  }
  const wantUp =
    fixture.jaw === "upper"
      ? new THREE.Vector3(
          -fixture.archOcclusalDir[0],
          -fixture.archOcclusalDir[1],
          -fixture.archOcclusalDir[2],
        )
      : new THREE.Vector3(...fixture.archOcclusalDir);
  const up = plan.up.clone();
  if (up.dot(wantUp) < 0) up.negate();
  const anterior = plan.anterior.clone().addScaledVector(up, -plan.anterior.dot(up));
  if (anterior.lengthSq() < 1e-6) {
    jawFrameCache.set(jawGeometry, null);
    return null;
  }
  anterior.normalize();
  const right = new THREE.Vector3().crossVectors(anterior, up).normalize();
  const frame: DentalFrame = { up, anterior, right };
  jawFrameCache.set(jawGeometry, frame);
  return frame;
}

/**
 * 같은 악 스캔에 반대측 동일 치아(예: #36 ↔ #46)가 자연치로 있으면 정중면 대칭 거울상으로
 * 순설·근원심 폭, 치관 높이, 단면 윤곽 비율을 잰다. 편측 스캔·무치악·스캔바디면 null.
 */
function measureContralateralMirrorCrown(
  jawGeometry: THREE.BufferGeometry,
  fixture: MatchedScanbodyFixture,
  neighbors: readonly MatchedScanbodyFixture[],
  tpl: AbutmentTemplate,
  meanMarginZ: number,
): ContralateralCrownMirror | null {
  const m = /^([1-4])([1-8])$/.exec(String(fixture.toothNumber).trim());
  if (!m) return null;
  const quad = Number(m[1]);
  const contraQuad = quad === 1 ? 2 : quad === 2 ? 1 : quad === 3 ? 4 : 3;
  const contraTooth = `${contraQuad}${m[2]}`;
  if (neighbors.some((nb) => String(nb.toothNumber).trim() === contraTooth)) return null;

  const frame = getJawDentalFrame(jawGeometry, fixture);
  if (!frame) return null;

  const posAttr = jawGeometry.getAttribute("position");
  if (!posAttr || posAttr.count < 200) return null;
  const sampleStride = Math.max(1, Math.floor(posAttr.count / 2500));
  const rSamples: number[] = [];
  for (let i = 0; i < posAttr.count; i += sampleStride) {
    rSamples.push(
      posAttr.getX(i) * frame.right.x +
        posAttr.getY(i) * frame.right.y +
        posAttr.getZ(i) * frame.right.z,
    );
  }
  rSamples.sort((a, b) => a - b);
  const archSpan =
    rSamples[Math.floor(rSamples.length * 0.97)]! - rSamples[Math.floor(rSamples.length * 0.03)]!;
  if (archSpan < 38) return null;

  const ownSlot = locateNominalToothSlot({
    geometry: jawGeometry,
    frame,
    toothNumber: fixture.toothNumber,
  });
  const contraSlot = locateNominalToothSlot({
    geometry: jawGeometry,
    frame,
    toothNumber: contraTooth,
  });
  if (!ownSlot || !contraSlot) return null;

  const midPt = scale3(add3(ownSlot.center, contraSlot.center), 0.5);
  const midNorm = ownSlot.archRight;
  if (Math.abs(dot3(sub3(contraSlot.center, ownSlot.center), midNorm)) < (m[2] === "1" ? 4 : 11)) {
    return null;
  }
  const reflectPt = (p: Vec3): Vec3 => sub3(p, scale3(midNorm, 2 * dot3(sub3(p, midPt), midNorm)));
  const reflectDir = (v: Vec3): Vec3 => sub3(v, scale3(midNorm, 2 * dot3(v, midNorm)));

  const wOcc = ownSlot.occlusalDir;
  const cOrigin = reflectPt(
    add3(fixture.fixturePose.origin, scale3(fixture.fixturePose.axis, meanMarginZ + 3.0)),
  );
  let uLab = reflectDir(fixture.labialDir);
  uLab = norm3(sub3(uLab, scale3(wOcc, dot3(uLab, wOcc))));
  let vMes = reflectDir(fixture.mesialDir);
  vMes = norm3(sub3(vMes, scale3(wOcc, dot3(vMes, wOcc))));

  const stride = Math.max(1, Math.floor(posAttr.count / 45000));
  const cPts: Array<[number, number, number]> = [];
  for (let i = 0; i < posAttr.count; i += stride) {
    const p: Vec3 = [posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)];
    const rel = sub3(p, cOrigin);
    const h = dot3(rel, wOcc);
    if (h < -4.5 || h > 10.5) continue;
    const u = dot3(rel, uLab);
    if (Math.abs(u) > 8.2) continue;
    const v = dot3(rel, vMes);
    if (Math.abs(v) > 7.8) continue;
    cPts.push([u, v, h]);
  }
  if (cPts.length < 100) return null;

  const hsAll = cPts.map((q) => q[2]).sort((a, b) => a - b);
  const hTop = hsAll[Math.floor(hsAll.length * 0.98)]!;
  const hGing = hsAll[Math.floor(hsAll.length * 0.08)]!;
  const crownHeightMm = hTop - hGing;
  if (crownHeightMm < 4.2) return null;

  const halfMdSearch = Math.min(4.4, tpl.naturalMdMm * 0.44);
  const midBand = cPts.filter(
    (q) => q[2] >= hTop - Math.min(4.5, crownHeightMm * 0.72) && q[2] <= hTop - 0.9,
  );
  const coreBand = midBand.filter((q) => Math.abs(q[1]) <= halfMdSearch);
  if (coreBand.length < 50) return null;
  const us = coreBand.map((q) => q[0]).sort((a, b) => a - b);
  const uLo = us[Math.floor(us.length * 0.03)]!;
  const uHi = us[Math.floor(us.length * 0.97)]!;
  const blMm = uHi - uLo;
  if (blMm < tpl.naturalBlMm * 0.75 || blMm > tpl.naturalBlMm * 1.25) return null;
  const cu = (uLo + uHi) / 2;

  // 근·원심 치간 고랑(협설 폭이 가장 잘록해지는 지점)으로 반대측 치아 하나만 가른다.
  const findEmbrasure = (sign: 1 | -1): number => {
    const targetHalf = tpl.naturalMdMm / 2;
    let bestV = sign * targetHalf;
    let bestScore = Infinity;
    for (let d = Math.max(2.0, targetHalf * 0.72); d <= targetHalf * 1.28; d += 0.4) {
      const slice = midBand.filter((q) => Math.abs(q[1] - sign * d) <= 0.45);
      if (slice.length < 6) {
        bestV = sign * d;
        break;
      }
      const su = slice.map((q) => q[0]).sort((a, b) => a - b);
      const width = su[Math.floor(su.length * 0.92)]! - su[Math.floor(su.length * 0.08)]!;
      const score = width + Math.abs(d - targetHalf) * 0.35;
      if (score < bestScore) {
        bestScore = score;
        bestV = sign * d;
      }
    }
    return bestV;
  };
  const vMesEnd = findEmbrasure(1);
  const vDisEnd = findEmbrasure(-1);
  const mdMm = clamp(vMesEnd - vDisEnd, tpl.naturalMdMm * 0.82, tpl.naturalMdMm * 1.18);
  const cv = clamp((vMesEnd + vDisEnd) / 2, -1.6, 1.6);

  const halfA = blMm / 2;
  const halfB = mdMm / 2;
  const bins: number[][] = Array.from({ length: SECTORS }, () => []);
  for (const q of midBand) {
    const du = q[0] - cu;
    const dv = q[1] - cv;
    if (Math.abs(dv) > halfB * 1.08) continue;
    const r = Math.hypot(du, dv);
    if (r < 1.5) continue;
    const phi = wrapAngle(Math.atan2(dv, du));
    const b = Math.min(SECTORS - 1, Math.floor((phi / (Math.PI * 2)) * SECTORS));
    bins[b]!.push(r);
  }
  const rawRatio = bins.map((list, b) => {
    const phi = ((b + 0.5) / SECTORS) * Math.PI * 2;
    const ref = superellipseRadius(halfA, halfB, phi, 2.1);
    if (list.length < 3 || ref < 1e-3) return 1;
    list.sort((a, c) => a - c);
    return clamp(list[Math.floor(list.length * 0.9)]! / ref, 0.88, 1.12);
  });
  const contourRatio = lowPassCircular(rawRatio, 4).map((v) => clamp(v, 0.9, 1.1));

  return { toothNumber: contraTooth, blMm, mdMm, crownHeightMm, contourRatio };
}

/**
 * 양옆 인접 자연치의 교합면(첨두·절단연) 높이. 마진 중심 c0에서 삽입축 방향 mm.
 * 근원심 방향 띠(순설 ±4.5mm)에서 쪽마다 97% 분위 높이를 잡고, 치아가 있는 쪽만 평균한다.
 * 없으면 NaN.
 */
function adjacentOcclusalHeight(
  pts: Float32Array,
  c0: Vec3,
  frame: InsertionFrame,
  halfMdMm: number,
  ownScanbody: { radius: number; height: number },
  opts?: { mesialSignOnV?: 1 | -1; isWisdom?: boolean; skipPos?: boolean; skipNeg?: boolean },
): number {
  const sides: number[][] = [[], []];
  for (let i = 0; i < pts.length; i += 3) {
    const p: Vec3 = [pts[i]!, pts[i + 1]!, pts[i + 2]!];
    if (Math.hypot(p[0], p[1]) < ownScanbody.radius + 0.7 && p[2] < ownScanbody.height + 1) continue;
    const rel = sub3(p, c0);
    const h = dot3(rel, frame.w);
    if (h < 0 || h > 11.5) continue;
    if (Math.abs(dot3(rel, frame.uLabial)) > 4.5) continue;
    const v = dot3(rel, frame.vSide);
    if (v > 0 && opts?.skipPos) continue;
    if (v < 0 && opts?.skipNeg) continue;
    if (opts?.isWisdom && v * (opts.mesialSignOnV ?? 1) < 0) continue;
    const av = Math.abs(v);
    if (av < halfMdMm + 0.4 || av > halfMdMm + 8) continue;
    sides[v > 0 ? 0 : 1]!.push(h);
  }
  const tops: number[] = [];
  for (const list of sides) {
    if (list.length < 40) continue;
    list.sort((a, b) => a - b);
    const top = list[Math.floor(list.length * 0.97)]!;
    if (top >= ADJACENT_TOOTH_MIN_H_MM) tops.push(top);
  }
  return tops.length ? tops.reduce((s, v) => s + v, 0) / tops.length : Number.NaN;
}

/** 픽스쳐 로컬 Z축을 따르는 닫힌 원뿔대(스크류 채널 cutter). */
/** 악궁 곡률 때문에 양옆 인접치 순측면을 이은 선보다 이만큼 더 나온다(치종별). */
const ARCH_LABIAL_BULGE_MM: Record<ToothKind, number> = {
  incisor: 0.35,
  canine: 0.5,
  premolar: 0.25,
  molar: 0.2,
};
const ADJ_LABIAL_BAND_MM = 2.5;
/** 예측 크라운 근원심 중심을 픽스쳐에서 옮기는 최대량(한쪽 인접치에 닿게 둘 때). */
const NAT_CROWN_SHIFT_MAX_MM = 2;
/** 가상 크라운 안으로 넣으려고 포스트 윗면을 설측으로 옮기는 최대량. */
const AXIS_LINGUAL_SHIFT_MAX_MM = 2;
const ADJ_LABIAL_BIN_MM = 1;

/**
 * 양옆 인접 자연치 순측면(접촉점 쪽 띠의 순측 끝)을 이은 선. 픽스쳐 높이 z → 순측 방향(labXY) 한계.
 * 정상 위치의 가상 크라운은 이보다 순측으로 나오지 않는다. 자연치가 없으면 null.
 */
function adjacentLabialLimit(
  pts: Float32Array,
  o: {
    labXY: Vec3;
    ownRadius: number;
    ownHeight: number;
    reachPos: number;
    reachNeg: number;
    zFrom: number;
    zTo: number;
    bulgeMm: number;
  },
): ((z: number) => number) | null {
  const bins = Math.max(1, Math.ceil((o.zTo - o.zFrom) / ADJ_LABIAL_BIN_MM));
  const lx = o.labXY[0];
  const ly = o.labXY[1];
  const sides = [
    { sign: 1, reach: o.reachPos },
    { sign: -1, reach: o.reachNeg },
  ].map((s) => ({ ...s, buckets: Array.from({ length: bins }, () => [] as number[]), tall: 0 }));
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i]!;
    const y = pts[i + 1]!;
    const z = pts[i + 2]!;
    if (z < o.zFrom || z >= o.zTo) continue;
    if (Math.hypot(x, y) < o.ownRadius + 0.4 && z < o.ownHeight + 1) continue;
    const u = x * lx + y * ly;
    const v = -x * ly + y * lx;
    const b = Math.floor((z - o.zFrom) / ADJ_LABIAL_BIN_MM);
    for (const s of sides) {
      if (!Number.isFinite(s.reach)) continue;
      const sv = v * s.sign;
      if (sv < s.reach || sv > s.reach + ADJ_LABIAL_BAND_MM) continue;
      s.buckets[b]!.push(u);
      if (z > o.zFrom + 4) s.tall += 1;
    }
  }
  const perSide = sides.map((s) =>
    s.tall < 10
      ? null
      : s.buckets.map((list) => {
          if (list.length < 6) return Number.NaN;
          list.sort((a, c) => a - c);
          return list[Math.floor(list.length * 0.95)]!;
        }),
  );
  const [pos, neg] = perSide;
  if (!pos && !neg) return null;
  const vp = o.reachPos + ADJ_LABIAL_BAND_MM / 2;
  const vn = o.reachNeg + ADJ_LABIAL_BAND_MM / 2;
  const line = Array.from({ length: bins }, (_, b) => {
    const a = pos?.[b] ?? Number.NaN;
    const c = neg?.[b] ?? Number.NaN;
    if (Number.isFinite(a) && Number.isFinite(c)) return (a * vn + c * vp) / (vp + vn);
    return Number.isFinite(a) ? a : c;
  });
  if (!line.some(Number.isFinite)) return null;
  for (let b = 0; b < bins; b += 1) {
    if (Number.isFinite(line[b]!)) continue;
    let best = Number.NaN;
    for (let d = 1; d < bins && !Number.isFinite(best); d += 1) {
      if (b - d >= 0 && Number.isFinite(line[b - d]!)) best = line[b - d]!;
      else if (b + d < bins && Number.isFinite(line[b + d]!)) best = line[b + d]!;
    }
    line[b] = best;
  }
  return (z: number) => {
    const f = clamp((z - o.zFrom) / ADJ_LABIAL_BIN_MM - 0.5, 0, bins - 1);
    const i = Math.min(bins - 2, Math.floor(f));
    if (bins === 1) return line[0]! + o.bulgeMm;
    const t = f - Math.max(0, i);
    return line[Math.max(0, i)]! * (1 - t) + line[Math.max(0, i) + 1]! * t + o.bulgeMm;
  };
}

/**
 * 양옆 인접 자연치(또는 스캔 지대치)의 치관 근·원심 벽을 높이대별로 재서
 * 인접치 치축·치간 삽입 통로의 근원심 방향(wCorr)을 구한다.
 * - 양쪽 인접치가 모두 있으면 두 인접면 중앙선 vMid(h) = (vMes(h) - vDis(h))/2의 기울기를 쓴다
 *   (양옆 치관의 대칭 풍융부 벌어짐이 상쇄되어 순수 인접치 근원심 치축 기울기만 남는다).
 * - 한쪽 인접치만 있으면 치경부 돌출 위(h ≥ 3.2mm)의 인접벽·치관 중체 기울기와 오버행 경사를 함께 본다.
 */
/**
 * 인접 자연치 또는 스캔된 인접 어벗·지대치 기둥의 실제 장축(원통/원추 중심선)을 구한다.
 * 하단 치은 치마(gingival skirt) 점이 평균에 섞이면 축이 인접 치은 쪽으로 크게 기울어지므로,
 * 기둥 상단 봉우리에서 아래쪽으로 단면을 자르다가 치은으로 확 퍼지기 직전까지의 순수 축벽 단면 중심선(u(h), v(h))을
 * 반복 수렴시켜 비대칭 치은과 무관하게 인접 어벗·지대치의 정확한 축 각도를 얻는다.
 */
function estimateScannedPillarAxis(
  pts: Float32Array,
  o: {
    wOcc: Vec3;
    labXY: Vec3;
    mesXY: Vec3;
    ownRadius: number;
    ownHeight: number;
    vMin: number;
    vMax: number;
    uMaxAbs: number;
  },
): { axis: Vec3; isNarrowAbutment: boolean } | null {
  const occ0 = insertionFrame(o.wOcc, o.labXY);
  const vMes0 = dot3(occ0.vSide, o.mesXY) >= 0 ? occ0.vSide : scale3(occ0.vSide, -1);
  const cand: Vec3[] = [];
  for (let i = 0; i < pts.length; i += 3) {
    const p: Vec3 = [pts[i]!, pts[i + 1]!, pts[i + 2]!];
    if (Math.hypot(p[0], p[1]) < o.ownRadius + 0.55 && p[2] > -0.4 && p[2] < o.ownHeight + 0.9) continue;
    const h = dot3(p, o.wOcc);
    if (h < 1.2 || h > 16.5) continue;
    const u = dot3(p, occ0.uLabial);
    const v = dot3(p, vMes0);
    if (v < o.vMin || v > o.vMax || Math.abs(u) > o.uMaxAbs) continue;
    cand.push(p);
  }
  if (cand.length < 55) return null;

  let wAx: Vec3 = o.wOcc;
  let converged: { axis: Vec3; isNarrowAbutment: boolean } | null = null;
  for (let iter = 0; iter < 5; iter += 1) {
    const fr = insertionFrame(wAx, o.labXY);
    const vAx = dot3(fr.vSide, o.mesXY) >= 0 ? fr.vSide : scale3(fr.vSide, -1);
    const proj = cand.map((p) => ({
      h: dot3(p, wAx),
      u: dot3(p, fr.uLabial),
      v: dot3(p, vAx),
    }));
    const hs = proj.map((r) => r.h).sort((a, b) => a - b);
    const hPeak = hs[Math.floor(hs.length * 0.97)]!;
    const hBase = hs[Math.floor(hs.length * 0.08)]!;
    if (hPeak - hBase < 2.0) return null;

    const topRows = proj.filter((r) => r.h >= hPeak - 1.2);
    if (topRows.length < 10) return null;
    const usTop = topRows.map((r) => r.u).sort((a, b) => a - b);
    const vsTop = topRows.map((r) => r.v).sort((a, b) => a - b);
    let cuTrack = 0.5 * (usTop[Math.floor(usTop.length * 0.1)]! + usTop[Math.floor(usTop.length * 0.9)]!);
    let cvTrack = 0.5 * (vsTop[Math.floor(vsTop.length * 0.1)]! + vsTop[Math.floor(vsTop.length * 0.9)]!);

    const slices: Array<{ h0: number; cu: number; cv: number; maxSpan: number }> = [];
    let refSpan: number | null = null;
    for (let h0 = hPeak - 0.35; h0 >= Math.max(hBase + 0.5, hPeak - 5.8); h0 -= 0.35) {
      const searchR = refSpan != null ? Math.min(5.2, Math.max(3.2, refSpan * 0.85 + 1.0)) : 5.2;
      const sl = proj.filter(
        (r) => Math.abs(r.h - h0) <= 0.22 && Math.hypot(r.u - cuTrack, r.v - cvTrack) <= searchR,
      );
      if (sl.length < 14) continue;
      const us = sl.map((r) => r.u).sort((a, b) => a - b);
      const vs = sl.map((r) => r.v).sort((a, b) => a - b);
      const uLo = us[Math.floor(us.length * 0.04)]!;
      const uHi = us[Math.floor(us.length * 0.96)]!;
      const vLo = vs[Math.floor(vs.length * 0.04)]!;
      const vHi = vs[Math.floor(vs.length * 0.96)]!;
      const spanU = uHi - uLo;
      const spanV = vHi - vLo;
      const maxSpan = Math.max(spanU, spanV);
      // 윗면 라운드·사선 챔퍼 직하방(1.75mm 미만)은 건너뛰고 실제 원통/원추 몸통부터 잡는다.
      if (Math.min(spanU, spanV) < 1.85) continue;
      if (refSpan == null && slices.length >= 1) refSpan = Math.max(slices[0]!.maxSpan, maxSpan);
      // 상단 기둥 단면 대비 1.28배(+1.05mm)를 넘기 시작하면 마진 치마·잇몸으로 진입한 것이므로 즉시 멈춘다.
      if (refSpan != null && maxSpan > Math.max(refSpan * 1.28, refSpan + 1.05)) break;
      const cu = 0.5 * (uLo + uHi);
      const cv = 0.5 * (vLo + vHi);
      slices.push({ h0, cu, cv, maxSpan });
      cuTrack = cu;
      cvTrack = cv;
    }
    if (slices.length < 4) return null;
    if (slices[0]!.h0 - slices[slices.length - 1]!.h0 < 1.05) return null;

    const mh = slices.reduce((s, r) => s + r.h0, 0) / slices.length;
    const mcu = slices.reduce((s, r) => s + r.cu, 0) / slices.length;
    const mcv = slices.reduce((s, r) => s + r.cv, 0) / slices.length;
    let shh = 0;
    let shu = 0;
    let shv = 0;
    for (const r of slices) {
      shh += (r.h0 - mh) ** 2;
      shu += (r.h0 - mh) * (r.cu - mcu);
      shv += (r.h0 - mh) * (r.cv - mcv);
    }
    if (shh < 0.25) return null;
    const duDh = shu / shh;
    const dvDh = shv / shh;
    let nextW = norm3(add3(wAx, add3(scale3(fr.uLabial, duDh), scale3(vAx, dvDh))));
    if (nextW[2] < 0) nextW = scale3(nextW, -1);
    if (Math.hypot(nextW[0], nextW[1]) > nextW[2] * Math.tan(34 * DEG)) return null;
    if (nextW[2] < 0.35 || dot3(nextW, o.wOcc) < 0.55) return null;
    wAx = nextW;
    const medSpan = slices[Math.floor(slices.length * 0.5)]!.maxSpan;
    converged = { axis: wAx, isNarrowAbutment: medSpan <= 4.8 };
  }
  return converged;
}

function estimateAdjacentLongAxes(
  pts: Float32Array,
  o: {
    wOcc: Vec3;
    labXY: Vec3;
    mesXY: Vec3;
    ownRadius: number;
    ownHeight: number;
    skipDistal: boolean;
    mesialBridgedAbutment?: boolean;
    distalBridgedAbutment?: boolean;
  },
): Vec3[] {
  const found: Array<{ axis: Vec3; weight: number }> = [];
  for (const sign of [1, -1] as const) {
    if (sign < 0 && o.skipDistal) continue;
    const vStart = o.ownRadius + 1.15;
    const res = estimateScannedPillarAxis(pts, {
      wOcc: o.wOcc,
      labXY: o.labXY,
      mesXY: sign > 0 ? o.mesXY : scale3(o.mesXY, -1),
      ownRadius: o.ownRadius,
      ownHeight: o.ownHeight,
      vMin: vStart,
      vMax: 11.2,
      uMaxAbs: 5.6,
    });
    if (!res) continue;
    const bridgedThisSide = sign > 0 ? Boolean(o.mesialBridgedAbutment) : Boolean(o.distalBridgedAbutment);
    const wgt = bridgedThisSide ? (res.isNarrowAbutment ? 4.0 : 2.5) : 1.0;
    found.push({ axis: res.axis, weight: wgt });
  }
  if (found.length <= 1) return found.map((f) => f.axis);
  if (found[0]!.weight >= found[1]!.weight * 2) return [found[0]!.axis];
  if (found[1]!.weight >= found[0]!.weight * 2) return [found[1]!.axis];
  return found.map((f) => f.axis);
}

function adjacentProximalCorridor(
  pts: Float32Array,
  o: {
    c0: Vec3;
    wOccRef: Vec3;
    labXY: Vec3;
    mesXY: Vec3;
    ownRadius: number;
    ownHeight: number;
    coreHalfBlMm: number;
    mesialWallAllowanceMm: number;
    distalWallAllowanceMm: number;
    skipDistal: boolean;
  },
): { wCorr: Vec3; bothSides: boolean } | null {
  const fr = insertionFrame(o.wOccRef, o.labXY);
  const vMes: Vec3 = dot3(fr.vSide, o.mesXY) >= 0 ? fr.vSide : scale3(fr.vSide, -1);
  const hFrom = 2.4;
  const binMm = 1.0;
  const binCount = 6;
  const mesBins: number[][] = Array.from({ length: binCount }, () => []);
  const disBins: number[][] = Array.from({ length: binCount }, () => []);
  let tallMes = 0;
  let tallDis = 0;

  for (let i = 0; i < pts.length; i += 3) {
    const p: Vec3 = [pts[i]!, pts[i + 1]!, pts[i + 2]!];
    if (Math.hypot(p[0], p[1]) < o.ownRadius + 0.6 && p[2] > -0.5 && p[2] < o.ownHeight + 0.85) {
      continue;
    }
    const rel = sub3(p, o.c0);
    const h = dot3(rel, o.wOccRef);
    if (h < hFrom || h >= hFrom + binCount * binMm) continue;
    const u = dot3(rel, fr.uLabial);
    if (Math.abs(u) > o.coreHalfBlMm) continue;
    const v = dot3(rel, vMes);
    const b = Math.min(binCount - 1, Math.floor((h - hFrom) / binMm));
    if (v >= 1.1 && v <= 8.8) {
      mesBins[b]!.push(v);
      if (h >= 3.4 && v <= 7.4) tallMes += 1;
    } else if (!o.skipDistal && v <= -1.1 && v >= -8.8) {
      disBins[b]!.push(-v);
      if (h >= 3.4 && -v <= 7.4) tallDis += 1;
    }
  }

  const hasMes = tallMes >= 15;
  const hasDis = !o.skipDistal && tallDis >= 15;
  if (!hasMes && !hasDis) return null;

  const extractSide = (bins: number[][], wallAllow: number) =>
    bins.map((list) => {
      if (list.length < 5) return null;
      list.sort((a, c) => a - c);
      const wall = list[Math.floor(list.length * 0.05)]! - wallAllow;
      const bodyPts = list.filter((d) => d <= list[Math.floor(list.length * 0.05)]! + 4.6);
      const body =
        (bodyPts.length >= 3
          ? bodyPts[Math.floor(bodyPts.length * 0.5)]!
          : list[Math.floor(list.length * 0.5)]!) - wallAllow;
      return { wall, body };
    });

  const mes = hasMes ? extractSide(mesBins, o.mesialWallAllowanceMm) : null;
  const dis = hasDis ? extractSide(disBins, o.distalWallAllowanceMm) : null;

  const fitLineSlope = (samples: ReadonlyArray<{ h: number; v: number }>): number | null => {
    if (samples.length < 3) return null;
    const hSpan = samples[samples.length - 1]!.h - samples[0]!.h;
    if (hSpan < 1.8) return null;
    const mh = samples.reduce((s, q) => s + q.h, 0) / samples.length;
    const mv = samples.reduce((s, q) => s + q.v, 0) / samples.length;
    let shh = 0;
    let shv = 0;
    for (const q of samples) {
      shh += (q.h - mh) ** 2;
      shv += (q.h - mh) * (q.v - mv);
    }
    return shh > 0.5 ? shv / shh : null;
  };

  if (mes && dis) {
    const midSamples: Array<{ h: number; v: number }> = [];
    for (let b = 0; b < binCount; b += 1) {
      if (!mes[b] || !dis[b]) continue;
      midSamples.push({
        h: hFrom + (b + 0.5) * binMm,
        v: (mes[b]!.wall - dis[b]!.wall) * 0.5,
      });
    }
    const slope = fitLineSlope(midSamples);
    if (slope != null) {
      const capped = clamp(slope, -Math.tan(18 * DEG), Math.tan(18 * DEG));
      return { wCorr: norm3(add3(o.wOccRef, scale3(vMes, capped))), bothSides: true };
    }
  }

  const single = mes ?? dis;
  const sign = mes ? 1 : -1;
  if (!single) return null;
  const bodySamples: Array<{ h: number; v: number }> = [];
  const wallSamples: Array<{ h: number; v: number }> = [];
  for (let b = 0; b < binCount; b += 1) {
    const h = hFrom + (b + 0.5) * binMm;
    const row = single[b];
    if (!row) continue;
    wallSamples.push({ h, v: sign * row.wall });
    if (h >= 3.2) bodySamples.push({ h, v: sign * (row.wall * 0.55 + row.body * 0.45) });
  }
  let slope = fitLineSlope(bodySamples) ?? fitLineSlope(wallSamples);
  if (slope == null) return null;
  const wallSlope = fitLineSlope(wallSamples);
  // 단일 인접치의 인접벽이 내 공간 위로 기울어 덮는(overhang) 경우 언더컷 반대 방향으로 눕지 않게 지킨다.
  if (wallSlope != null && sign * wallSlope < -0.02) {
    slope = sign > 0 ? Math.min(slope, wallSlope * 0.85) : Math.max(slope, wallSlope * 0.85);
  }
  const capped = clamp(slope, -Math.tan(15 * DEG), Math.tan(15 * DEG));
  return { wCorr: norm3(add3(o.wOccRef, scale3(vMes, capped))), bothSides: false };
}

/**
 * 축벽이 임플란트 축 스크류 원통을 감싸도록 단면 반경을 키운다.
 * 포스트 외형은 솔리드로 남고, 스크류 홀은 이후 원통 boolean으로만 뚫린다.
 * 스크류가 벗어난 쪽만 불룩하게 하고, 마진 숄더·인접 한계·언더컷은 넘지 않는다.
 */
function coverPostOverScrew(args: {
  w: Vec3;
  c0: Vec3;
  boreR: number;
  wallMm: number;
  dirs: readonly Vec3[];
  postR: number[][];
  postH: number[][];
  marginCap: readonly number[];
  hardTop: readonly number[];
  topLevel: number;
}) {
  const { w, c0, dirs, postR, postH, topLevel } = args;
  const n = dirs.length;
  if (n < 8 || Math.abs(w[2]) < 0.25 || !(args.boreR > 0.2)) return;

  const scalesAt = (level: number) => {
    let hSum = 0;
    for (let col = 0; col < n; col += 1) hSum += postH[col]![level]!;
    const h = hSum / n;
    const origin = add3(c0, scale3(w, h));
    const screwOnPlane: Vec3 = [0, 0, dot3(origin, w) / w[2]];
    let majorDir = sub3([0, 0, 1], scale3(w, w[2]));
    const majorLen = Math.hypot(...majorDir);
    if (majorLen < 1e-6) majorDir = [1, 0, 0];
    else majorDir = scale3(majorDir, 1 / majorLen);
    const minorDir = norm3(cross3(w, majorDir));
    const tube = args.boreR + args.wallMm;
    const majorR = tube / Math.max(Math.abs(w[2]), 0.45);
    const need = new Array<number>(n).fill(1);
    for (let i = 0; i < 36; i += 1) {
      const ang = (i / 36) * Math.PI * 2;
      const sample = add3(
        screwOnPlane,
        add3(scale3(majorDir, Math.cos(ang) * majorR), scale3(minorDir, Math.sin(ang) * tube)),
      );
      let rel = sub3(sample, origin);
      rel = sub3(rel, scale3(w, dot3(rel, w)));
      const len = Math.hypot(...rel);
      if (len < 1e-5) continue;
      const dir = scale3(rel, 1 / len);
      let best = 0;
      let bestDot = -Infinity;
      for (let col = 0; col < n; col += 1) {
        const dot = dot3(dirs[col]!, dir);
        if (dot > bestDot) {
          bestDot = dot;
          best = col;
        }
      }
      const radius = postR[best]![level]!;
      if (radius > 0.15) need[best] = Math.max(need[best]!, len / radius);
    }
    const spread = new Array<number>(n).fill(1);
    for (let col = 0; col < n; col += 1) {
      let peak = 1;
      for (let d = -8; d <= 8; d += 1) {
        const j = (col + d + n) % n;
        const falloff = 1 - Math.abs(d) / 9;
        peak = Math.max(peak, 1 + (need[j]! - 1) * falloff);
      }
      spread[col] = Math.min(2, peak);
    }
    return spread;
  };

  const topSpread = scalesAt(topLevel);
  const midSpread = scalesAt(Math.round(topLevel * 0.62));
  let grew = false;
  for (let col = 0; col < n; col += 1) {
    let topScale = Math.max(topSpread[col]!, 1 + (midSpread[col]! - 1) / 0.62);
    topScale = clamp(topScale, 1, 2);
    const baseR = postR[col]![0]!;
    const topR = postR[col]![topLevel]!;
    const margin = Math.max(baseR, args.marginCap[col]!);
    let baseScale = 1;
    if (topR > 0.15 && baseR > 0.15 && topR * topScale > baseR) {
      baseScale = (topR * topScale) / baseR;
    }
    if (baseR > 0.15) baseScale = Math.min(baseScale, margin / baseR);
    baseScale = Math.max(1, baseScale);
    if (topR > 0.15) topScale = Math.min(topScale, (baseR * baseScale) / topR);
    const hard = args.hardTop[col]!;
    if (Number.isFinite(hard) && topR > 0.15) topScale = Math.min(topScale, Math.max(1, hard / topR));
    topScale = Math.max(1, topScale);
    if (topScale <= 1.004 && baseScale <= 1.004) continue;
    grew = true;
    for (let k = 0; k <= topLevel; k += 1) {
      const u = k / topLevel;
      postR[col]![k] = postR[col]![k]! * (baseScale * (1 - u) + topScale * u);
    }
  }
  return grew;
}

function screwChannelSoup(
  rBot: number,
  rTop: number,
  zBot: number,
  seatZ0: number,
  seatZ1: number,
  zTop: number,
  segments = 64,
): Float32Array {
  const rings: Array<[number, number]> = [
    [rBot, zBot],
    [rBot, seatZ0],
    [rTop, seatZ1],
    [rTop, zTop],
  ];
  const trisPerSeg = 2 + (rings.length - 1) * 2;
  const out = new Float32Array(segments * trisPerSeg * 9);
  let o = 0;
  const put = (p: Vec3) => {
    out[o++] = p[0];
    out[o++] = p[1];
    out[o++] = p[2];
  };
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const c0 = Math.cos(a0);
    const s0 = Math.sin(a0);
    const c1 = Math.cos(a1);
    const s1 = Math.sin(a1);
    put([0, 0, zBot]);
    put([rBot * c1, rBot * s1, zBot]);
    put([rBot * c0, rBot * s0, zBot]);
    for (let k = 0; k < rings.length - 1; k += 1) {
      const [ra, za] = rings[k]!;
      const [rb, zb] = rings[k + 1]!;
      put([ra * c0, ra * s0, za]);
      put([ra * c1, ra * s1, za]);
      put([rb * c1, rb * s1, zb]);
      put([ra * c0, ra * s0, za]);
      put([rb * c1, rb * s1, zb]);
      put([rb * c0, rb * s0, zb]);
    }
    put([0, 0, zTop]);
    put([rTop * c0, rTop * s0, zTop]);
    put([rTop * c1, rTop * s1, zTop]);
  }
  return out;
}

/**
 * 극점(첫·끝 점이 모든 열에서 같은 점)을 가진 열 묶음을 닫힌 삼각형 메시로 잇는다.
 * 열 안의 점은 바닥 중심 → 외면 → 윗면 중심 순서여야 바깥 법선이 된다.
 */
function stitchPolarColumns(columns: readonly Vec3[][], capped: boolean): Float32Array {
  const ringCount = columns[0]!.length;
  const tris: number[] = [];
  const push = (a: Vec3, b: Vec3, c: Vec3) => tris.push(...a, ...b, ...c);
  for (let col = 0; col < columns.length; col += 1) {
    const A = columns[col]!;
    const B = columns[(col + 1) % columns.length]!;
    for (let r = 0; r < ringCount - 1; r += 1) {
      const bottomPole = capped && r === 0;
      const topPole = r === ringCount - 2;
      if (!bottomPole) push(A[r]!, B[r]!, B[r + 1]!);
      if (!topPole) push(A[r]!, B[r + 1]!, A[r + 1]!);
    }
  }
  return new Float32Array(tris);
}

type NeighborLocal = {
  toothNumber: string;
  origin: Vec3;
  axis: Vec3;
  radius: number;
  height: number;
};

/** 대합치 교합면을 삽입축 평면 격자(0.5mm)로 내려다본 가장 가까운 높이. */
function buildOpposingHeightField(
  pts: Float32Array,
  c0: Vec3,
  frame: InsertionFrame,
  maxLateral: number,
) {
  const cells = new Map<string, { h: number; u: number; v: number }>();
  for (let i = 0; i < pts.length; i += 3) {
    const rel = sub3([pts[i]!, pts[i + 1]!, pts[i + 2]!], c0);
    const h = dot3(rel, frame.w);
    if (h < 1 || h > 18) continue;
    const u = dot3(rel, frame.uLabial);
    const v = dot3(rel, frame.vSide);
    if (Math.hypot(u, v) > maxLateral) continue;
    const key = `${Math.round(u / OPP_CELL_MM)},${Math.round(v / OPP_CELL_MM)}`;
    const prev = cells.get(key);
    if (!prev || h < prev.h) cells.set(key, { h, u, v });
  }
  const list = [...cells.values()];
  const heightAt = (u: number, v: number, radius: number) => {
    let best = Infinity;
    const iu0 = Math.floor((u - radius) / OPP_CELL_MM);
    const iu1 = Math.ceil((u + radius) / OPP_CELL_MM);
    const iv0 = Math.floor((v - radius) / OPP_CELL_MM);
    const iv1 = Math.ceil((v + radius) / OPP_CELL_MM);
    for (let iu = iu0; iu <= iu1; iu += 1) {
      for (let iv = iv0; iv <= iv1; iv += 1) {
        const cell = cells.get(`${iu},${iv}`);
        if (!cell) continue;
        if (Math.hypot(cell.u - u, cell.v - v) > radius) continue;
        if (cell.h < best) best = cell.h;
      }
    }
    return best;
  };
  return { list, heightAt };
}

/**
 * 대합치 치관 교합면(중심와·교합 테이블)의 실제 중심점.
 * 원점 중심의 좁은 가우시안(2.5mm)으로 평균하면 넓은 구치 교합면이 항상 (0,0)으로 끌려오므로,
 * 내 가상 크라운 근원심 폭 구간(|v - vCrown| <= halfMd) 안에서 협설 전체(-8.5~+8.5mm)의 대합 치관 양끝(10%·90%) 중앙을 구한다.
 */
function opposingCenterPoint(
  pts: Float32Array,
  c0: Vec3,
  frame: InsertionFrame,
  opts?: { vCrownMm?: number; halfMdMm?: number; constrainMesiodistal?: boolean },
): Vec3 | null {
  const field = buildOpposingHeightField(pts, c0, frame, 9.0);
  if (field.list.length < 12) return null;
  const vCrown = opts?.vCrownMm ?? 0;
  const vHalf = Math.max(2.6, (opts?.halfMdMm ?? 4.8) * 0.68);
  const inSlice = field.list.filter((cell) => Math.abs(cell.v - vCrown) <= vHalf && Math.abs(cell.u) <= 8.5);
  const pool = inSlice.length >= 10 ? inSlice : field.list.filter((cell) => Math.hypot(cell.u, cell.v) <= 6.5);
  if (pool.length < 10) return null;

  const hs = pool.map((c) => c.h).sort((a, b) => a - b);
  const minH = hs[Math.floor(hs.length * 0.08)]!;
  if (!Number.isFinite(minH)) return null;
  const crownBand = pool.filter((c) => c.h <= minH + 3.2);
  if (crownBand.length < 8) return null;

  const us = crownBand.map((c) => c.u).sort((a, b) => a - b);
  const vs = crownBand.map((c) => c.v).sort((a, b) => a - b);
  const uLo = us[Math.floor(us.length * 0.1)]!;
  const uHi = us[Math.floor(us.length * 0.9)]!;
  const vLo = vs[Math.floor(vs.length * 0.15)]!;
  const vHi = vs[Math.floor(vs.length * 0.85)]!;
  const uCenter = 0.5 * (uLo + uHi);
  const vCenter = opts?.constrainMesiodistal ? vCrown * 0.65 + 0.5 * (vLo + vHi) * 0.35 : 0.5 * (vLo + vHi);

  const nearCenter = crownBand
    .filter((c) => Math.hypot(c.u - uCenter, c.v - vCenter) <= 2.4)
    .map((c) => c.h)
    .sort((a, b) => a - b);
  const hCenter =
    nearCenter.length >= 3
      ? nearCenter[Math.floor(nearCenter.length * 0.35)]!
      : hs[Math.floor(hs.length * 0.25)]!;

  return add3(
    c0,
    add3(
      scale3(frame.w, hCenter),
      add3(scale3(frame.uLabial, uCenter), scale3(frame.vSide, vCenter)),
    ),
  );
}

/** 두 벡터 사이 각도를 t(0~1)만큼 돌린 방향. */
function slerpDir(a: Vec3, b: Vec3, t: number): Vec3 {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return norm3(add3(scale3(a, 1 - t), scale3(b, t)));
}

/** w와 +Z 사이 각을 maxRad 이하로 줄인다. */
function capTilt(w: Vec3, maxRad: number): Vec3 {
  const ang = Math.acos(clamp(w[2], -1, 1));
  if (ang <= maxRad) return w;
  const lat = Math.hypot(w[0], w[1]);
  if (lat < 1e-9) return [0, 0, 1];
  const s = Math.sin(maxRad);
  return [(w[0] / lat) * s, (w[1] / lat) * s, Math.cos(maxRad)];
}

/** 디자인 결과(로컬 좌표)로 월드 메시·STL을 만든다. 저장된 디자인 복원에도 쓴다. */
export function buildDesignedCustomAbutment(input: {
  fixture: MatchedScanbodyFixture;
  fileName: string;
  localPositions: Float32Array;
  solidBodyLocalPositions?: Float32Array;
  crownLocalPositions: Float32Array;
  marginLoopLocal: Float32Array;
  params: CustomAbutmentDesignParams;
  metrics: CustomAbutmentDesignMetrics;
}): DesignedCustomAbutment {
  const { fixture } = input;
  const stlBlob = encodeBinaryStl(
    input.localPositions,
    `abuts.fit custom abutment #${fixture.toothNumber}`,
  );
  const toWorld = fixturePoseToMatrix4(fixture.fixturePose);
  const worldGeometry = new THREE.BufferGeometry();
  worldGeometry.setAttribute("position", new THREE.BufferAttribute(input.localPositions.slice(), 3));
  worldGeometry.applyMatrix4(toWorld);
  worldGeometry.computeVertexNormals();
  worldGeometry.computeBoundingBox();

  const predictedCrownWorldGeometry = new THREE.BufferGeometry();
  predictedCrownWorldGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(input.crownLocalPositions.slice(), 3),
  );
  predictedCrownWorldGeometry.applyMatrix4(toWorld);
  predictedCrownWorldGeometry.computeVertexNormals();
  predictedCrownWorldGeometry.computeBoundingBox();

  const marginLoopWorld = new Float32Array(input.marginLoopLocal.length);
  const tmp = new THREE.Vector3();
  for (let i = 0; i < input.marginLoopLocal.length; i += 3) {
    tmp
      .set(input.marginLoopLocal[i]!, input.marginLoopLocal[i + 1]!, input.marginLoopLocal[i + 2]!)
      .applyMatrix4(toWorld);
    marginLoopWorld[i] = tmp.x;
    marginLoopWorld[i + 1] = tmp.y;
    marginLoopWorld[i + 2] = tmp.z;
  }

  return {
    toothNumber: fixture.toothNumber,
    jaw: fixture.jaw,
    fileName: input.fileName,
    localPositions: input.localPositions,
    solidBodyLocalPositions: input.solidBodyLocalPositions,
    crownLocalPositions: input.crownLocalPositions,
    marginLoopLocal: input.marginLoopLocal,
    stlBlob,
    worldGeometry,
    predictedCrownWorldGeometry,
    marginLoopWorld,
    fixture,
    params: input.params,
    metrics: input.metrics,
  };
}

type DesignArgs = {
  fixture: MatchedScanbodyFixture;
  jawGeometry: THREE.BufferGeometry;
  opposingGeometry: THREE.BufferGeometry | null;
  neighbors?: readonly MatchedScanbodyFixture[];
  /** 의뢰 전체 치아 목록 — 인접 직접어벗(심플어벗)·지대치 크라운 두께 및 브리지 연결 판단용. */
  toothWorks?: readonly ToothWorkSelection[];
  params?: Partial<CustomAbutmentDesignParams> | null;
  patientName?: string;
};

type DesignMode = { probeAxis?: boolean; groupAxisWorld?: Vec3 | null };
type DesignResult =
  | { kind: "axis"; axisWorld: Vec3 }
  | { kind: "design"; design: DesignedCustomAbutment };

/** 자동 삽입축(윗면 이동 전) 캐시. 붙은 치아 평행 축을 구할 때 이웃마다 다시 계산하지 않는다. */
const autoAxisCache = new WeakMap<THREE.BufferGeometry, Map<string, Vec3>>();

async function autoAxisWorld(args: DesignArgs): Promise<Vec3> {
  const p = resolveCustomAbutmentParams(args.fixture.toothNumber, args.params);
  const key = JSON.stringify([
    args.fixture.toothNumber,
    args.fixture.fixturePose.origin,
    args.fixture.fixturePose.axis,
    args.opposingGeometry?.uuid ?? null,
    p.marginDepthMm,
    p.marginScallopMm,
    p.postYawDeg,
    p.axisToOpposing,
    p.axisMaxDeg,
  ]);
  let byKey = autoAxisCache.get(args.jawGeometry);
  if (!byKey) {
    byKey = new Map();
    autoAxisCache.set(args.jawGeometry, byKey);
  }
  const hit = byKey.get(key);
  if (hit) return hit;
  const res = await designImpl(args, { probeAxis: true });
  const axis = res.kind === "axis" ? res.axisWorld : args.fixture.fixturePose.axis;
  byKey.set(key, axis);
  return axis;
}

/** 같은 악에서 브리지로 연결되었거나 픽스쳐 사이가 PARALLEL_GROUP_MM 안으로 이어진 치아 묶음(자신 포함). */
function parallelGroupOf(
  fixture: MatchedScanbodyFixture,
  all: readonly MatchedScanbodyFixture[],
  toothWorks?: readonly ToothWorkSelection[],
): MatchedScanbodyFixture[] {
  const pool = [fixture, ...all.filter((f) => f.toothNumber !== fixture.toothNumber && f.jaw === fixture.jaw)];
  const works = toothWorks ?? [];
  const areBridgeLinked = (toothA: string, toothB: string): boolean => {
    const fdiA = parseFdiTooth(toothA)?.digits;
    const fdiB = parseFdiTooth(toothB)?.digits;
    if (!fdiA || !fdiB) return false;
    // bridgeLinkedTeeth 추이 연결(중간 폰틱 치아를 건너뛰는 3본 이상 브리지 포함)을 따라간다.
    const visited = new Set<string>([fdiA]);
    const queue = [fdiA];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur === fdiB) return true;
      const wCur = works.find((tw) => parseFdiTooth(tw.toothNumber)?.digits === cur);
      for (const linked of wCur?.bridgeLinkedTeeth ?? []) {
        const d = parseFdiTooth(linked)?.digits;
        if (d && !visited.has(d)) {
          visited.add(d);
          queue.push(d);
        }
      }
      for (const tw of works) {
        const d = parseFdiTooth(tw.toothNumber)?.digits;
        if (!d || visited.has(d)) continue;
        if ((tw.bridgeLinkedTeeth ?? []).some((t) => parseFdiTooth(t)?.digits === cur)) {
          visited.add(d);
          queue.push(d);
        }
      }
    }
    const wA = works.find((tw) => parseFdiTooth(tw.toothNumber)?.digits === fdiA);
    const wB = works.find((tw) => parseFdiTooth(tw.toothNumber)?.digits === fdiB);
    return (
      String(wA?.prosthesisType || "").trim() === "브리지" &&
      String(wB?.prosthesisType || "").trim() === "브리지" &&
      fdiA[0] === fdiB[0]
    );
  };

  const group = [fixture];
  const seen = new Set([fixture.toothNumber]);
  for (let i = 0; i < group.length; i += 1) {
    for (const f of pool) {
      if (seen.has(f.toothNumber)) continue;
      const d = Math.hypot(...sub3(f.fixturePose.origin, group[i]!.fixturePose.origin));
      if (d > PARALLEL_GROUP_MM && !areBridgeLinked(group[i]!.toothNumber, f.toothNumber)) continue;
      seen.add(f.toothNumber);
      group.push(f);
    }
  }
  return group;
}

/**
 * 구강스캔(잇몸·인접치·대합치)과 치종 템플릿으로 커스텀어벗과 예측 크라운 외형을 설계한다.
 * neighbors: 같은 악의 다른 디자인 대상 픽스쳐. 두 크라운 경계면으로 서로 떨어뜨리고,
 * 브리지·인접 치아끼리는 삽입축(포스트 패쓰)을 100% 동일한 월드 축으로 평행하게 맞춘다.
 */
export async function designCustomAbutmentStl(args: DesignArgs): Promise<DesignedCustomAbutment> {
  const group = parallelGroupOf(args.fixture, args.neighbors ?? [], args.toothWorks);
  let groupAxisWorld: Vec3 | null = null;
  if (group.length > 1) {
    // 치아 호출 순서에 따라 부동소수 합산이 달라지지 않게 치아 번호 순으로 정렬해 공통 삽입축을 구한다.
    const sortedGroup = [...group].sort((a, b) => a.toothNumber.localeCompare(b.toothNumber));
    const autoParams = { ...(args.params ?? {}), axisShiftLabialMm: 0, axisShiftMesialMm: 0 };
    const allPool = [args.fixture, ...(args.neighbors ?? [])];
    let sum: Vec3 = [0, 0, 0];
    for (const f of sortedGroup) {
      const axis = await autoAxisWorld({
        ...args,
        fixture: f,
        neighbors: allPool.filter((n) => n.toothNumber !== f.toothNumber),
        params: autoParams,
      });
      sum = add3(sum, axis);
    }
    let shared = norm3(sum);
    // 그룹 내 모든 픽스쳐 장축에서 브리지 최대 허용 각도(구치 14°, 전치 18°) 안에 들어오도록 공통 축 자체를 조정한다.
    // 개별 치아에서 따로 capTilt를 걸지 않아 모든 브리지 지대주의 포스트 각도가 0.00° 오차로 완전히 평행해진다.
    const anyAnterior = sortedGroup.some((f) => abutmentTemplateForTooth(f.toothNumber).anterior);
    const bridgeGroup = sortedGroup.some((f) => {
      const digits = parseFdiTooth(f.toothNumber)?.digits;
      const work = (args.toothWorks ?? []).find((tw) => parseFdiTooth(tw.toothNumber)?.digits === digits);
      return String(work?.prosthesisType || "").trim() === "브리지";
    });
    const maxGroupTilt = (anyAnterior ? 30 : bridgeGroup ? 24 : 14) * DEG;
    for (let iter = 0; iter < 8; iter += 1) {
      let moved = false;
      for (const f of sortedGroup) {
        const fAxis = norm3(f.fixturePose.axis);
        const ang = Math.acos(clamp(dot3(shared, fAxis), -1, 1));
        if (ang > maxGroupTilt + 1e-4) {
          shared = slerpDir(shared, fAxis, (ang - maxGroupTilt) / ang);
          moved = true;
        }
      }
      if (!moved) break;
    }
    groupAxisWorld = shared;
  }
  const res = await designImpl(args, { groupAxisWorld });
  if (res.kind !== "design") throw new Error("커스텀어벗 디자인을 만들지 못했습니다.");
  return res.design;
}

async function designImpl(args: DesignArgs, mode: DesignMode): Promise<DesignResult> {
  const { fixture, jawGeometry, opposingGeometry } = args;
  const params = resolveCustomAbutmentParams(fixture.toothNumber, args.params);
  const conn = fixture.connectionSpec;
  const tpl = abutmentTemplateForTooth(fixture.toothNumber);
  const R = params.marginFilletRadiusMm;
  const shoulderW = params.marginShoulderMm;
  let taperSlope = Math.tan(params.postTaperDeg * DEG);
  let chamfer = chamferGeometry(shoulderW, R, taperSlope);
  const posterior = !abutmentTemplateForTooth(fixture.toothNumber).anterior;
  const contact = params.crownContactMm;
  const clearance = params.occlusalClearanceMm;

  const jawLocalAll = cropScanPointsInFixtureFrame(jawGeometry, fixture.fixturePose, 20);
  const opposingLocalPts = cropScanPointsInFixtureFrame(opposingGeometry, fixture.fixturePose, 20);

  const boreBotR = conn.screwLowerDiameterMm / 2;
  const boreTopR = conn.screwUpperDiameterMm / 2;
  const originR = conn.originDiameterMm / 2;
  const coneTopZ = conn.prcConeTopMm;
  const coneTopR = originR + TAPER_11_SLOPE * coneTopZ;
  const sbR = fixture.scanbodyRadiusMm;
  const sbH = fixture.scanbodyHeightMm;

  const neighbors: NeighborLocal[] = (args.neighbors ?? [])
    .filter((nb) => nb.toothNumber !== fixture.toothNumber && nb.jaw === fixture.jaw)
    .map((nb) => ({
      toothNumber: nb.toothNumber,
      origin: worldPointToFixtureLocal(nb.fixturePose.origin, fixture.fixturePose),
      axis: worldDirToFixtureLocal(nb.fixturePose.axis, fixture.fixturePose),
      radius: nb.scanbodyRadiusMm,
      height: nb.scanbodyHeightMm,
    }))
    .filter((nb) => Math.hypot(nb.origin[0], nb.origin[1]) < 16);

  // 이웃 스캔바디 기둥은 인접치가 아니다. 인접 간격·크라운 접촉 계산에서 뺀다.
  const jawKeep: number[] = [];
  for (let i = 0; i < jawLocalAll.length; i += 3) {
    const p: Vec3 = [jawLocalAll[i]!, jawLocalAll[i + 1]!, jawLocalAll[i + 2]!];
    let onNeighbor = false;
    for (const nb of neighbors) {
      const rel = sub3(p, nb.origin);
      const t = dot3(rel, nb.axis);
      if (t < -0.5 || t > nb.height + 1.2) continue;
      if (Math.hypot(...sub3(rel, scale3(nb.axis, t))) < nb.radius + 0.95) {
        onNeighbor = true;
        break;
      }
    }
    if (!onNeighbor) jawKeep.push(p[0], p[1], p[2]);
  }
  const jawLocalPts = new Float32Array(jawKeep);

  const biFrame = getBiJawDentalFrame(jawGeometry, opposingGeometry, fixture.jaw);
  const jawFrame = biFrame ? null : getJawDentalFrame(jawGeometry, fixture);
  const refDentalFrame = biFrame ?? jawFrame;
  const trueOccWorld: Vec3 = refDentalFrame
    ? norm3(
        fixture.jaw === "upper"
          ? [-refDentalFrame.up.x, -refDentalFrame.up.y, -refDentalFrame.up.z]
          : [refDentalFrame.up.x, refDentalFrame.up.y, refDentalFrame.up.z],
      )
    : norm3(fixture.archOcclusalDir);

  const occInFix = norm3(worldDirToFixtureLocal(trueOccWorld, fixture.fixturePose));
  const labInFix = worldDirToFixtureLocal(fixture.labialDir, fixture.fixturePose);
  let labXY = norm3([labInFix[0], labInFix[1], 0]);
  let mesXY: Vec3 = [-labXY[1], labXY[0], 0];
  if (fixture.mesialDir) {
    const mesInFix = worldDirToFixtureLocal(fixture.mesialDir, fixture.fixturePose);
    if (dot3(mesXY, mesInFix) < 0) mesXY = scale3(mesXY, -1);
  }

  // 의뢰 내역(toothWorks)에서 바로 옆 근심·원심 치아가 스캔에 찍힌 직접어벗(심플어벗 등 customAbutmentSelection="abutment")이거나
  // 프렙 지대치(크라운·브리지 보철 대상)인지, 그리고 브리지로 연결되는지 읽어 인접 크라운 벽 두께 여유를 계산한다.
  const ownFdi = parseFdiTooth(fixture.toothNumber);

  // 포스트 수평 회전각(yaw) 정렬:
  // 교합평면(wOccPlane) 위에서 같은 악의 근처 자연치·인접 기성어벗/지대치·이웃 픽스쳐 위치뿐만 아니라
  // 대합치(opposingGeometry) 치관 열의 위치·중심구 곡선까지 함께 2차 악궁 곡선(u = c0 + c1·v + c2·v², c2 ≤ 0)으로 맞춰
  // 내 치아 위치(v = 0)에서의 정확한 악궁 접선(c1)에 포스트를 평행하게 놓는다.
  let alignedLabialWorld: Vec3 = fixture.labialDir;
  let alignedMesialWorld: Vec3 = fixture.mesialDir;
  let jawArchOffsetU = 0;
  {
    const wOccPlane = occInFix;
    let uTargetOcc = sub3(labXY, scale3(wOccPlane, dot3(labXY, wOccPlane)));
    uTargetOcc = Math.hypot(...uTargetOcc) > 1e-5 ? norm3(uTargetOcc) : labXY;
    let vTargetOcc = sub3(mesXY, scale3(wOccPlane, dot3(mesXY, wOccPlane)));
    vTargetOcc = sub3(vTargetOcc, scale3(uTargetOcc, dot3(vTargetOcc, uTargetOcc)));
    vTargetOcc = Math.hypot(...vTargetOcc) > 1e-5 ? norm3(vTargetOcc) : mesXY;

    // 전역 치과 좌표계(미드라인·교합평면) 기준 사분면 방향과 부호가 뒤집히지 않았는지 검증한다.
    if (refDentalFrame && ownFdi) {
      const phiNom = (Math.min(ownFdi.pos, 8) / 8) * 1.42;
      const bucWorldGuess: Vec3 = [
        refDentalFrame.right.x * ownFdi.side * Math.sin(phiNom) + refDentalFrame.anterior.x * Math.cos(phiNom),
        refDentalFrame.right.y * ownFdi.side * Math.sin(phiNom) + refDentalFrame.anterior.y * Math.cos(phiNom),
        refDentalFrame.right.z * ownFdi.side * Math.sin(phiNom) + refDentalFrame.anterior.z * Math.cos(phiNom),
      ];
      const mesWorldGuess: Vec3 = [
        refDentalFrame.anterior.x * Math.sin(phiNom) - refDentalFrame.right.x * ownFdi.side * Math.cos(phiNom),
        refDentalFrame.anterior.y * Math.sin(phiNom) - refDentalFrame.right.y * ownFdi.side * Math.cos(phiNom),
        refDentalFrame.anterior.z * Math.sin(phiNom) - refDentalFrame.right.z * ownFdi.side * Math.cos(phiNom),
      ];
      const bucGuessFix = worldDirToFixtureLocal(bucWorldGuess, fixture.fixturePose);
      const mesGuessFix = worldDirToFixtureLocal(mesWorldGuess, fixture.fixturePose);
      if (dot3(uTargetOcc, bucGuessFix) < 0) uTargetOcc = scale3(uTargetOcc, -1);
      if (dot3(vTargetOcc, mesGuessFix) < 0) vTargetOcc = scale3(vTargetOcc, -1);
    }

    const gingHs: number[] = [];
    for (let i = 0; i < jawLocalPts.length; i += 3) {
      const x = jawLocalPts[i]!;
      const y = jawLocalPts[i + 1]!;
      const z = jawLocalPts[i + 2]!;
      const r = Math.hypot(x, y);
      if (r >= sbR + 0.5 && r <= sbR + 2.8 && z >= 0.8 && z <= sbH - 0.3) {
        gingHs.push(dot3([x, y, z], wOccPlane));
      }
    }
    gingHs.sort((a, b) => a - b);
    const gingBaseOcc =
      gingHs.length >= 10
        ? gingHs[Math.floor(gingHs.length * 0.5)]!
        : Math.max(2.0, fixture.gingivaFloorMm + 0.4);

    // 폰틱 결손부 너머의 인접 자연치(#35·#34 등)와 상방 대합치 열까지 잘리지 않고 보도록
    // 교합평면 수평 반경 28mm 원기둥 범위에서 같은 악·대합악 정점을 가볍게 샘플링한다.
    const allJawFixtures = [fixture, ...(args.neighbors ?? []).filter((nb) => nb.jaw === fixture.jaw)];
    const sampleCylInFix = (geo: THREE.BufferGeometry | null, skipScanbodies: boolean): Float32Array => {
      if (!geo) return new Float32Array(0);
      const pos = geo.getAttribute("position");
      if (!pos || pos.count === 0) return new Float32Array(0);
      const stride = Math.max(1, Math.floor(pos.count / 14000));
      const [ox, oy, oz] = fixture.fixturePose.origin;
      const out: number[] = [];
      for (let i = 0; i < pos.count; i += stride) {
        const px = pos.getX(i);
        const py = pos.getY(i);
        const pz = pos.getZ(i);
        const dx = px - ox;
        const dy = py - oy;
        const dz = pz - oz;
        const hOcc = dx * trueOccWorld[0] + dy * trueOccWorld[1] + dz * trueOccWorld[2];
        if (hOcc < -4.0 || hOcc > 22.0) continue;
        const lat2 = dx * dx + dy * dy + dz * dz - hOcc * hOcc;
        if (lat2 > 28 * 28) continue;
        if (skipScanbodies) {
          let onSb = false;
          for (const sb of allJawFixtures) {
            const sx = px - sb.fixturePose.origin[0];
            const sy = py - sb.fixturePose.origin[1];
            const sz = pz - sb.fixturePose.origin[2];
            const sh = sx * sb.fixturePose.axis[0] + sy * sb.fixturePose.axis[1] + sz * sb.fixturePose.axis[2];
            if (sh < -0.5 || sh > sb.scanbodyHeightMm + 1.2) continue;
            const sr2 = sx * sx + sy * sy + sz * sz - sh * sh;
            if (sr2 < (sb.scanbodyRadiusMm + 0.95) ** 2) {
              onSb = true;
              break;
            }
          }
          if (onSb) continue;
        }
        out.push(
          dx * fixture.fixturePose.hexX[0] + dy * fixture.fixturePose.hexX[1] + dz * fixture.fixturePose.hexX[2],
          dx * fixture.fixturePose.hexY[0] + dy * fixture.fixturePose.hexY[1] + dz * fixture.fixturePose.hexY[2],
          dx * fixture.fixturePose.axis[0] + dy * fixture.fixturePose.axis[1] + dz * fixture.fixturePose.axis[2],
        );
      }
      return new Float32Array(out);
    };
    const jawArchPts = sampleCylInFix(jawGeometry, true);
    const oppArchPts = sampleCylInFix(opposingGeometry, false);

    type ArchStation = { v: number; u: number; w: number };
    const solveJointArchSlope = (
      groups: ReadonlyArray<ReadonlyArray<ArchStation>>,
      c2Fixed: number,
    ): { slope: number; jawOffsetU: number } | null => {
      const validGroups = groups.filter((g) => {
        if (g.length < 2) return false;
        let minV = Infinity;
        let maxV = -Infinity;
        for (const q of g) {
          if (q.v < minV) minV = q.v;
          if (q.v > maxV) maxV = q.v;
        }
        return maxV - minV >= 3.8;
      });
      if (validGroups.length === 0) return null;

      // 편측 구간(예: 사랑니 #38에서 v ≥ 0만 존재)에서 v와 v²을 동시에 자유 변수로 풀면 공선성(r=0.97) 때문에
      // 1차 접선 기울기(c1)가 과회전하므로, 완만한 해부학적 악궁 곡률(c2Fixed)만 보정한 뒤 정확한 중심 차감 선형 기울기를 푼다.
      let s11 = 3.5;
      let b1 = 0;
      let totalW = 0;

      const groupMeans = validGroups.map((g) => {
        const sw = g.reduce((s, q) => s + q.w, 0);
        const mv = g.reduce((s, q) => s + q.w * q.v, 0) / Math.max(sw, 1e-6);
        const muCorr =
          g.reduce((s, q) => s + q.w * (q.u - c2Fixed * q.v * q.v), 0) / Math.max(sw, 1e-6);
        for (const q of g) {
          const dv = q.v - mv;
          const du = q.u - c2Fixed * q.v * q.v - muCorr;
          s11 += q.w * dv * dv;
          b1 += q.w * dv * du;
          totalW += q.w;
        }
        return { g, sw, mv, muCorr };
      });
      if (totalW < 1.2 || s11 < 6.0) return null;

      const c1 = b1 / s11;

      let errSq = 0;
      let errW = 0;
      for (const gm of groupMeans) {
        const c0 = gm.muCorr - c1 * gm.mv;
        for (const q of gm.g) {
          const pred = c0 + c1 * q.v + c2Fixed * q.v * q.v;
          errSq += q.w * (q.u - pred) ** 2;
          errW += q.w;
        }
      }
      if (Math.sqrt(errSq / Math.max(errW, 1e-6)) > 1.75) return null;

      let jawOffsetU = 0;
      const jawG = groups[0];
      if (jawG && jawG.length >= 2) {
        const realJaw = jawG.filter((q) => Math.abs(q.v) >= 3.5);
        if (realJaw.length >= 1) {
          const sw = realJaw.reduce((s, q) => s + q.w, 0);
          jawOffsetU =
            realJaw.reduce((s, q) => s + q.w * (q.u - c1 * q.v - c2Fixed * q.v * q.v), 0) /
            Math.max(sw, 1e-6);
        }
      }
      return { slope: c1, jawOffsetU };
    };

    if (!ownFdi || ownFdi.pos >= 4) {
      // 사랑니(#8) 원심이나 후구치 삼각 융기(제2대구치 #7 원심 무치악 점막)는 치아가 아니므로 악궁선 피팅에서 제외한다.
      const hasDistalNeighborSb = neighbors.some((nb) => dot3(nb.origin, vTargetOcc) < -2.5);
      let distalCrownExists = false;
      if (ownFdi?.pos === 7 && !hasDistalNeighborSb) {
        let tallCnt = 0;
        for (let i = 0; i < jawArchPts.length; i += 3) {
          const p: Vec3 = [jawArchPts[i]!, jawArchPts[i + 1]!, jawArchPts[i + 2]!];
          const pv = dot3(p, vTargetOcc);
          const pu = dot3(p, uTargetOcc);
          const ph = dot3(p, wOccPlane);
          if (pv <= -4.0 && pv >= -10.5 && Math.abs(pu) <= 4.5 && ph >= gingBaseOcc + 3.4) {
            tallCnt += 1;
            if (tallCnt >= 24) {
              distalCrownExists = true;
              break;
            }
          }
        }
      }
      const vDistalJawMin = !ownFdi
        ? -16.0
        : ownFdi.pos === 8
          ? 0
          : ownFdi.pos === 7
            ? hasDistalNeighborSb || distalCrownExists
              ? -10.5
              : 0
            : ownFdi.pos === 6
              ? -15.0
              : ownFdi.pos === 5
                ? -18.0
                : -20.0;
      const vMesialMax = !ownFdi
        ? 16.0
        : ownFdi.pos === 8
          ? 20.5
          : ownFdi.pos === 7
            ? 18.5
            : ownFdi.pos === 6
              ? 14.0
              : ownFdi.pos === 5
                ? 9.0
                : 6.5;
      const vDistalOppMin = !ownFdi
        ? -16.0
        : ownFdi.pos === 8
          ? -4.5
          : ownFdi.pos === 7
            ? -9.5
            : vDistalJawMin;

      let archFitSucceeded = false;

      for (let pass = 0; pass < 2; pass += 1) {
        const binMm = 2.0;
        // 1) 같은 악 근처 치관·기성 어벗(심플어벗·지대치)·인접 임플란트 스테이션
        const jBinCount = Math.max(1, Math.ceil((vMesialMax - vDistalJawMin) / binMm));
        const jBins: Array<Array<{ u: number; h: number }>> = Array.from(
          { length: jBinCount },
          () => [],
        );
        for (let i = 0; i < jawArchPts.length; i += 3) {
          const p: Vec3 = [jawArchPts[i]!, jawArchPts[i + 1]!, jawArchPts[i + 2]!];
          const hOcc = dot3(p, wOccPlane);
          if (hOcc < gingBaseOcc + 1.0 || hOcc > gingBaseOcc + 13.0) continue;
          const pv = dot3(p, vTargetOcc);
          if (pv < vDistalJawMin || pv > vMesialMax || Math.abs(pv) < 3.8) continue;
          const pu = dot3(p, uTargetOcc);
          if (Math.abs(pu) > 9.5) continue;
          const bi = Math.min(jBinCount - 1, Math.max(0, Math.floor((pv - vDistalJawMin) / binMm)));
          jBins[bi]!.push({ u: pu, h: hOcc });
        }

        const jawCenterStations: ArchStation[] = [{ v: 0, u: 0, w: 0.55 }];
        const jawBuccalStations: ArchStation[] = [];
        for (let bi = 0; bi < jBinCount; bi += 1) {
          const list = jBins[bi]!;
          if (list.length < 10) continue;
          const hs = list.map((q) => q.h).sort((a, b) => a - b);
          const h92 = hs[Math.floor(hs.length * 0.92)]!;
          if (h92 < gingBaseOcc + 2.2) continue;
          const bandLo = Math.max(gingBaseOcc + 1.4, h92 - 2.6);
          const band = list
            .filter((q) => q.h >= bandLo && q.h <= h92 + 0.25)
            .map((q) => q.u)
            .sort((a, b) => a - b);
          if (band.length < 7) continue;
          const uLo = band[Math.floor(band.length * 0.1)]!;
          const uHi = band[Math.floor(band.length * 0.9)]!;
          const width = uHi - uLo;
          const vMid = vDistalJawMin + (bi + 0.5) * binMm;
          const distW = 1 / (1 + Math.abs(vMid) * 0.035);
          if (width >= 4.0 && width <= 13.6) {
            jawCenterStations.push({ v: vMid, u: 0.5 * (uLo + uHi), w: distW * 1.15 });
            jawBuccalStations.push({ v: vMid, u: uHi, w: distW * 0.75 });
          } else if (width >= 2.1 && width < 4.0 && Math.abs(0.5 * (uLo + uHi)) <= 3.8) {
            // 인접 심플어벗·지대치 기둥(폭 2.1~4.0mm)은 협측 외형선 대신 정확한 악궁 중심선 기준점으로 넣는다.
            jawCenterStations.push({ v: vMid, u: 0.5 * (uLo + uHi), w: distW * 1.2 });
          }
        }
        if (ownFdi) {
          for (const nb of neighbors) {
            const nbFdi = parseFdiTooth(nb.toothNumber);
            if (!nbFdi || nbFdi.digits[0] !== ownFdi.digits[0] || nbFdi.pos < 4) continue;
            if (Math.abs(ownFdi.pos - nbFdi.pos) > 3) continue;
            const pv = dot3(nb.origin, vTargetOcc);
            const pu = dot3(nb.origin, uTargetOcc);
            if (Math.abs(pv) >= 4.0 && pv >= vDistalJawMin - 1 && pv <= vMesialMax + 1) {
              jawCenterStations.push({ v: pv, u: pu, w: 1.45 / (1 + Math.abs(pv) * 0.03) });
            }
          }
        }

        // 2) 대합치(opposingGeometry) 치관 열의 중심와·교합면 중심 곡선 스테이션
        const oppCenterStations: ArchStation[] = [];
        if (oppArchPts.length >= 36) {
          const oBinCount = Math.max(1, Math.ceil((vMesialMax - vDistalOppMin) / binMm));
          const oBins: Array<Array<{ u: number; h: number }>> = Array.from(
            { length: oBinCount },
            () => [],
          );
          for (let i = 0; i < oppArchPts.length; i += 3) {
            const p: Vec3 = [oppArchPts[i]!, oppArchPts[i + 1]!, oppArchPts[i + 2]!];
            const hOcc = dot3(p, wOccPlane);
            if (hOcc < gingBaseOcc + 1.8 || hOcc > gingBaseOcc + 16.5) continue;
            const pv = dot3(p, vTargetOcc);
            if (pv < vDistalOppMin || pv > vMesialMax) continue;
            const pu = dot3(p, uTargetOcc);
            if (Math.abs(pu) > 9.8) continue;
            const bi = Math.min(oBinCount - 1, Math.max(0, Math.floor((pv - vDistalOppMin) / binMm)));
            oBins[bi]!.push({ u: pu, h: hOcc });
          }
          const binFloorHs: number[] = [];
          for (const list of oBins) {
            if (list.length < 10) continue;
            const hs = list.map((q) => q.h).sort((a, b) => a - b);
            binFloorHs.push(hs[Math.floor(hs.length * 0.08)]!);
          }
          if (binFloorHs.length >= 2) {
            binFloorHs.sort((a, b) => a - b);
            const oppOccFloor = binFloorHs[Math.floor(binFloorHs.length * 0.2)]!;
            for (let bi = 0; bi < oBinCount; bi += 1) {
              const list = oBins[bi]!;
              if (list.length < 10) continue;
              const hs = list.map((q) => q.h).sort((a, b) => a - b);
              const h08 = hs[Math.floor(hs.length * 0.08)]!;
              const h88 = hs[Math.floor(hs.length * 0.88)]!;
              if (h08 > oppOccFloor + 3.4 || h88 - h08 < 1.3) continue;
              const band = list
                .filter((q) => q.h <= h08 + 2.7)
                .map((q) => q.u)
                .sort((a, b) => a - b);
              if (band.length < 7) continue;
              const uLo = band[Math.floor(band.length * 0.12)]!;
              const uHi = band[Math.floor(band.length * 0.88)]!;
              const width = uHi - uLo;
              if (width < 4.0 || width > 13.8) continue;
              const vMid = vDistalOppMin + (bi + 0.5) * binMm;
              oppCenterStations.push({
                v: vMid,
                u: 0.5 * (uLo + uHi),
                w: 1.0 / (1 + Math.abs(vMid) * 0.038),
              });
            }
          }
        }

        const solved = solveJointArchSlope(
          [jawCenterStations, jawBuccalStations, oppCenterStations],
          -0.0009,
        );
        if (!solved) break;
        jawArchOffsetU = solved.jawOffsetU;
        const maxRot = pass === 0 ? Math.tan(28 * DEG) : Math.tan(12 * DEG);
        const slope = clamp(solved.slope, -maxRot, maxRot);
        const nextV = norm3(add3(vTargetOcc, scale3(uTargetOcc, slope)));
        const nextU = norm3(sub3(uTargetOcc, scale3(nextV, dot3(uTargetOcc, nextV))));
        vTargetOcc = nextV;
        uTargetOcc = nextU;
        archFitSucceeded = true;
      }

      // 악궁·대합 스테이션이 모두 부족한 경우에만 인접 접촉벽 기울기를 보조로 쓴다.
      if (!archFitSucceeded) {
        let slopeWeightSum = 0;
        let slopeWeighted = 0;
        for (const sign of [1, -1] as const) {
          if (ownFdi?.pos === 8 && sign < 0) continue;
          const strips: Array<[number, number]> = [];
          for (let u = -1.8; u <= 1.81; u += 0.45) {
            const vs: number[] = [];
            for (let i = 0; i < jawLocalPts.length; i += 3) {
              const x = jawLocalPts[i]!;
              const y = jawLocalPts[i + 1]!;
              const z = jawLocalPts[i + 2]!;
              if (Math.hypot(x, y) < sbR + 1.15 && z < sbH + 1.2) continue;
              const p: Vec3 = [x, y, z];
              const hOcc = dot3(p, wOccPlane);
              if (hOcc < gingBaseOcc + 2.0 || hOcc > gingBaseOcc + 7.6) continue;
              const pu = dot3(p, uTargetOcc);
              if (Math.abs(pu - u) > 0.32) continue;
              const pv = dot3(p, vTargetOcc) * sign;
              if (pv < Math.max(3.1, sbR + 1.15) || pv > 7.8) continue;
              vs.push(pv);
            }
            if (vs.length < 5) continue;
            vs.sort((a, b) => a - b);
            strips.push([u, sign * vs[Math.floor(vs.length * 0.08)]!]);
          }
          if (strips.length < 5) continue;
          if (strips[strips.length - 1]![0] - strips[0]![0] < 1.7) continue;
          const mu = strips.reduce((s, q) => s + q[0], 0) / strips.length;
          const mv = strips.reduce((s, q) => s + q[1], 0) / strips.length;
          if (Math.abs(mv) > 6.8) continue;
          let suu = 0;
          let suv = 0;
          for (const [u, v] of strips) {
            suu += (u - mu) ** 2;
            suv += (u - mu) * (v - mv);
          }
          if (suu < 0.4) continue;
          const rawSlope = suv / suu;
          let errSq = 0;
          for (const [u, v] of strips) errSq += (v - (mv + rawSlope * (u - mu))) ** 2;
          if (Math.sqrt(errSq / strips.length) > 0.36 || Math.abs(rawSlope) > Math.tan(24 * DEG)) {
            continue;
          }
          const wgt = 1 / Math.max(3.0, Math.abs(mv));
          slopeWeighted += clamp(-rawSlope, -Math.tan(18 * DEG), Math.tan(18 * DEG)) * wgt;
          slopeWeightSum += wgt;
        }
        if (slopeWeightSum > 0) {
          const s = slopeWeighted / slopeWeightSum;
          const nextV = norm3(add3(vTargetOcc, scale3(uTargetOcc, s)));
          const nextU = norm3(sub3(uTargetOcc, scale3(nextV, dot3(uTargetOcc, nextV))));
          vTargetOcc = nextV;
          uTargetOcc = nextU;
        }
      }
    } else {
      // 전치부: 바로 옆 인접 임플란트·근처 자연치 절단 호·대합 전치 절단 호를 함께 반영해 악궁 접선에 맞춘다.
      let slopeWeightSum = 0;
      let slopeWeighted = 0;
      if (ownFdi) {
        const contraQuad =
          ownFdi.digits[0] === "1" ? "2" : ownFdi.digits[0] === "2" ? "1" : ownFdi.digits[0] === "3" ? "4" : "3";
        for (const nb of neighbors) {
          const nbFdi = parseFdiTooth(nb.toothNumber);
          if (!nbFdi) continue;
          let signToMesial = 0;
          if (nbFdi.digits[0] === ownFdi.digits[0] && Math.abs(ownFdi.pos - nbFdi.pos) === 1) {
            signToMesial = ownFdi.pos > nbFdi.pos ? 1 : -1;
          } else if (ownFdi.pos === 1 && nbFdi.digits === `${contraQuad}1`) {
            signToMesial = 1;
          }
          if (signToMesial === 0) continue;
          const distXY = Math.hypot(nb.origin[0], nb.origin[1]);
          if (distXY < 4.0 || distXY > 11.5) continue;
          const vecToMesial = scale3(nb.origin, signToMesial);
          const duNb = dot3(vecToMesial, uTargetOcc);
          const dvNb = dot3(vecToMesial, vTargetOcc);
          if (dvNb > 2.8) {
            slopeWeighted += clamp(duNb / dvNb, -Math.tan(18 * DEG), Math.tan(18 * DEG)) * 2.0;
            slopeWeightSum += 2.0;
          }
        }
      }
      const antJawStations: ArchStation[] = [{ v: 0, u: 0, w: 0.6 }];
      const antOppStations: ArchStation[] = [];
      for (const [srcPts, outList, isOpp] of [
        [jawArchPts, antJawStations, false],
        [oppArchPts, antOppStations, true],
      ] as const) {
        if (srcPts.length < 30) continue;
        for (let vMid = -9; vMid <= 9; vMid += 3) {
          if (!isOpp && Math.abs(vMid) < 3.5) continue;
          const us: number[] = [];
          for (let i = 0; i < srcPts.length; i += 3) {
            const p: Vec3 = [srcPts[i]!, srcPts[i + 1]!, srcPts[i + 2]!];
            const hOcc = dot3(p, wOccPlane);
            if (isOpp ? hOcc < gingBaseOcc + 1.5 || hOcc > gingBaseOcc + 14.5 : hOcc < gingBaseOcc + 2.2 || hOcc > gingBaseOcc + 12.0) {
              continue;
            }
            const pv = dot3(p, vTargetOcc);
            if (Math.abs(pv - vMid) > 1.4) continue;
            const pu = dot3(p, uTargetOcc);
            if (Math.abs(pu) <= 7.0) us.push(pu);
          }
          if (us.length < 8) continue;
          us.sort((a, b) => a - b);
          const uLab = us[Math.floor(us.length * 0.85)]!;
          outList.push({ v: vMid, u: uLab, w: isOpp ? 0.65 : 0.9 });
        }
      }
      const antSolved = solveJointArchSlope([antJawStations, antOppStations], -0.0025);
      if (antSolved) {
        slopeWeighted += clamp(antSolved.slope, -Math.tan(16 * DEG), Math.tan(16 * DEG)) * 1.4;
        slopeWeightSum += 1.4;
      }
      if (slopeWeightSum > 0) {
        const s = slopeWeighted / slopeWeightSum;
        const nextV = norm3(add3(vTargetOcc, scale3(uTargetOcc, s)));
        const nextU = norm3(sub3(uTargetOcc, scale3(nextV, dot3(uTargetOcc, nextV))));
        vTargetOcc = nextV;
        uTargetOcc = nextU;
      }
    }

    alignedLabialWorld = norm3(fixtureLocalDirToWorld(uTargetOcc, fixture.fixturePose));
    alignedMesialWorld = norm3(fixtureLocalDirToWorld(vTargetOcc, fixture.fixturePose));

    // 사용자 포스트 수평 회전 보정(postYawDeg: 교합면에서 바라봤을 때 + = 반시계, - = 시계)
    if (Math.abs(params.postYawDeg) > 1e-3) {
      const rad = params.postYawDeg * DEG;
      const ccwSign = dot3(cross3(vTargetOcc, uTargetOcc), wOccPlane) >= 0 ? 1 : -1;
      const th = rad * ccwSign;
      const cs = Math.cos(th);
      const sn = Math.sin(th);
      const rotV = norm3(add3(scale3(vTargetOcc, cs), scale3(uTargetOcc, sn)));
      const rotU = norm3(sub3(scale3(uTargetOcc, cs), scale3(vTargetOcc, sn)));
      vTargetOcc = rotV;
      uTargetOcc = rotU;
    }

    // 임플란트 축(+Z)이 협측으로 기울어 있어도 포스트의 근·원심 벽([0,0,1]×labXY)이 교합면 시점의 uTargetOcc를
    // 정확히 향하도록 mesXY = normalize([0,0,1] × uTargetOcc)로 잡는다(투영 비틀림 0°).
    const mesCross = cross3([0, 0, 1], uTargetOcc);
    if (Math.hypot(mesCross[0], mesCross[1]) > 1e-5) {
      let nextMes: Vec3 = norm3([mesCross[0], mesCross[1], 0]);
      if (dot3(nextMes, vTargetOcc) < 0) nextMes = scale3(nextMes, -1);
      let nextLab: Vec3 = [-nextMes[1], nextMes[0], 0];
      if (dot3(nextLab, uTargetOcc) < 0) nextLab = scale3(nextLab, -1);
      labXY = nextLab;
      mesXY = nextMes;
    }
  }
  const labialAngleFix = Math.atan2(labXY[1], labXY[0]);
  const allWorks = args.toothWorks ?? [];
  const ownWork = allWorks.find((tw) => parseFdiTooth(tw.toothNumber)?.digits === ownFdi?.digits);
  const neighborScannedCrownAllowance = (adjFdiDigits: string | null): { wallMm: number; bridged: boolean } => {
    if (!adjFdiDigits) return { wallMm: 0, bridged: false };
    // 이미 스캔바디 이웃(neighbors)으로 매칭된 치아는 중간면(planeLimitAt)이 처리한다.
    if ((args.neighbors ?? []).some((nb) => nb.toothNumber === adjFdiDigits)) {
      return { wallMm: 0, bridged: false };
    }
    const adjWork = allWorks.find((tw) => parseFdiTooth(tw.toothNumber)?.digits === adjFdiDigits);
    if (!adjWork) return { wallMm: 0, bridged: false };
    const pType = String(adjWork.prosthesisType || "").trim();
    if (!pType || pType === "결손" || pType === "자연치" || /가철/i.test(pType)) {
      return { wallMm: 0, bridged: false };
    }
    const linkedFromOwn = (ownWork?.bridgeLinkedTeeth ?? []).some(
      (t) => parseFdiTooth(t)?.digits === adjFdiDigits,
    );
    const linkedFromAdj = (adjWork.bridgeLinkedTeeth ?? []).some(
      (t) => parseFdiTooth(t)?.digits === ownFdi?.digits,
    );
    const bridged =
      linkedFromOwn ||
      linkedFromAdj ||
      (String(ownWork?.prosthesisType || "").trim() === "브리지" && pType === "브리지");
    const isDirectAbutment =
      adjWork.customAbutment && resolveCustomAbutmentSelection(adjWork) === "abutment";
    const adjTpl = abutmentTemplateForTooth(adjFdiDigits);
    const baseWall = isDirectAbutment
      ? Math.max(1.05, (adjTpl.crownLabialMm + adjTpl.crownLingualMm) * 0.5)
      : /인레이/i.test(pType)
        ? 0
        : 0.95;
    return { wallMm: baseWall, bridged };
  };
  const mesialAdjDigits = ownFdi
    ? ownFdi.pos > 1
      ? `${ownFdi.digits[0]}${ownFdi.pos - 1}`
      : `${ownFdi.digits[0] === "1" ? "2" : ownFdi.digits[0] === "2" ? "1" : ownFdi.digits[0] === "3" ? "4" : "3"}1`
    : null;
  const distalAdjDigits = ownFdi && ownFdi.pos < 8 ? `${ownFdi.digits[0]}${ownFdi.pos + 1}` : null;
  const mesialAllowance = neighborScannedCrownAllowance(mesialAdjDigits);
  const distalAllowance = neighborScannedCrownAllowance(distalAdjDigits);
  // ── 1) 픽스쳐 둘레 치은연 높이 → 스캘럽 마진 높이
  const rawGingivaZ = new Array<number>(SECTORS).fill(Number.NaN);
  const gingivaBuckets: number[][] = Array.from({ length: SECTORS }, () => []);
  // 치은선: 스캔바디에서 바깥으로 반경 칸마다 잇몸 높이(중앙값)를 보고, 인접치 벽처럼 가파르게 솟기 전까지의 최고점.
  // 잇몸 터널이 벌어져 있으면 스캔바디에 닿는 곳이 아니라 터널 테두리가 크라운이 올라갈 치은선이다.
  const rimBinCount = Math.round(GINGIVA_RIM_REACH_MM / GINGIVA_RIM_BIN_MM);
  const rimBuckets: number[][][] = Array.from({ length: SECTORS }, () =>
    Array.from({ length: rimBinCount }, () => [] as number[]),
  );
  for (let i = 0; i < jawLocalPts.length; i += 3) {
    const x = jawLocalPts[i]!;
    const y = jawLocalPts[i + 1]!;
    const z = jawLocalPts[i + 2]!;
    if (z < 0.8 || z > sbH - 0.3) continue;
    const r = Math.hypot(x, y);
    if (r < sbR + 0.2 || r >= sbR + 0.2 + GINGIVA_RIM_REACH_MM) continue;
    const b = Math.min(SECTORS - 1, Math.floor((wrapAngle(Math.atan2(y, x)) / (Math.PI * 2)) * SECTORS));
    rimBuckets[b]![Math.min(rimBinCount - 1, Math.floor((r - sbR - 0.2) / GINGIVA_RIM_BIN_MM))]!.push(z);
    if (r >= sbR + 0.35 && r <= sbR + 2.4 && z <= sbH - 0.9) gingivaBuckets[b]!.push(z);
  }
  const rimRaw = rimBuckets.map((bins) => {
    let rim = Number.NaN;
    let last = Number.NaN;
    for (const list of bins) {
      if (list.length < 3) continue;
      list.sort((a, c) => a - c);
      const m = list[Math.floor(list.length / 2)]!;
      if (Number.isFinite(last) && m - last > GINGIVA_RIM_MAX_STEP_MM) break;
      rim = Number.isFinite(rim) ? Math.max(rim, m) : m;
      last = m;
    }
    return rim;
  });
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
      : Math.max(2.6, fixture.gingivaFloorMm + 0.5);

  for (let b = 0; b < SECTORS; b += 1) {
    if (Number.isFinite(rawGingivaZ[b]!)) {
      rawGingivaZ[b] = clamp(rawGingivaZ[b]!, medianGingivaZ - 1.6, medianGingivaZ + 1.8);
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

  const rimOk = rimRaw.filter(Number.isFinite).sort((a, c) => a - c);
  const medianRimZ = rimOk.length ? rimOk[Math.floor(rimOk.length / 2)]! : medianGingivaZ;
  const rimZ = smoothCircular(
    rimRaw.map((z, b) => clamp(Number.isFinite(z) ? z : rawGingivaZ[b]!, medianRimZ - 4.5, medianRimZ + 2.5)),
    2,
  );

  // 피니시라인 = 근·원심은 높고 협·설측은 낮은 완만한 scalloped pattern.
  // 치은선의 자잘한 굴곡을 그대로 따르지 않고 서브 0.5~1.0mm(기본 marginDepthMm=0.5~0.8)를 기준으로
  // 저차 조화(k ≤ 2: 평균 + 전후/근원심 기울기 + cos 2φ 스캘럽)만 남긴다.
  const minMarginZ = Math.max(1.5, coneTopZ + 1.1);
  let oppMarginCapZ = Infinity;
  if (opposingLocalPts.length > 0) {
    const oppCoreZs: number[] = [];
    const oppR2 = (posterior ? 3.6 : 3.0) ** 2;
    for (let i = 0; i < opposingLocalPts.length; i += 3) {
      const ox = opposingLocalPts[i]!;
      const oy = opposingLocalPts[i + 1]!;
      const oz = opposingLocalPts[i + 2]!;
      if (oz >= 2.8 && oz <= 15 && ox * ox + oy * oy <= oppR2) oppCoreZs.push(oz);
    }
    if (oppCoreZs.length >= 6) {
      oppCoreZs.sort((a, c) => a - c);
      const oppLowZ = oppCoreZs[Math.floor(oppCoreZs.length * 0.12)]!;
      oppMarginCapZ = Math.max(
        minMarginZ + 0.25,
        oppLowZ - clearance - chamfer.height - (posterior ? 1.45 : 1.6),
      );
    }
  }
  const maxMarginZ = Math.min(Math.max(8.5, sbH - 1.0), medianRimZ + (posterior ? 1.55 : 2.1), oppMarginCapZ);

  // 사랑니(#18·#28·#38·#48) 원심뿐 아니라 사랑니가 없는 제2대구치(#17·#27·#37·#47) 원심의 후구치 삼각 융기(retromolar pad)도
  // 실제 인접 자연치 치관(치은선 위 ≥3.1mm로 뚜렷이 솟은 치아)이 아니면 점막이므로 인접치 벽으로 취급하지 않는다.
  const hasDistalNeighborFixture = neighbors.some((nb) => {
    const d = sub3(nb.origin, [0, 0, 0]);
    return d[0] * mesXY[0] + d[1] * mesXY[1] < -2.5;
  });
  const hasDistalRetromolarPad = (() => {
    if (ownFdi?.pos === 8) return true;
    if (ownFdi?.pos !== 7 || distalAllowance.wallMm > 0 || hasDistalNeighborFixture) return false;
    let tallDistalCrownPts = 0;
    for (let i = 0; i < jawLocalPts.length; i += 3) {
      const px = jawLocalPts[i]!;
      const py = jawLocalPts[i + 1]!;
      const pz = jawLocalPts[i + 2]!;
      const r = Math.hypot(px, py);
      if (r < 3.8 || r > 9.2) continue;
      const alongDistal = -(px * mesXY[0] + py * mesXY[1]);
      if (alongDistal < 3.4 || Math.abs(px * labXY[0] + py * labXY[1]) > 4.2) continue;
      if (pz >= medianRimZ + 3.1) {
        tallDistalCrownPts += 1;
        if (tallDistalCrownPts >= 20) return false;
      }
    }
    return true;
  })();
  const targetSubgDepth = clamp(params.marginDepthMm + 0.15, params.marginDepthMm, 1.0);
  const rimFourier = lowPassCircular(rimZ, 2);
  let c2Scallop = 0;
  let c1Lab = 0;
  let s1Mes = 0;
  for (let b = 0; b < SECTORS; b += 1) {
    const theta = ((b + 0.5) / SECTORS) * Math.PI * 2;
    const phi = theta - labialAngleFix;
    const v = rimFourier[b]! - medianRimZ;
    c1Lab += (v * Math.cos(phi) * 2) / SECTORS;
    s1Mes += (v * Math.sin(phi) * 2) / SECTORS;
    c2Scallop += (-v * Math.cos(2 * phi) * 2) / SECTORS;
  }
  const scallopMin = Math.min(
    posterior ? SCALLOP_MIN_POSTERIOR_MM : SCALLOP_MIN_ANTERIOR_MM,
    params.marginScallopMm * 0.5,
  );
  const scallopMax = Math.max(
    posterior ? SCALLOP_MAX_POSTERIOR_MM : SCALLOP_MAX_ANTERIOR_MM,
    params.marginScallopMm * 0.65,
  );
  // c2Scallop > 0 이면 근·원심(φ=±π/2, -cos 2φ=+1)이 높고 협·설(φ=0, π, -cos 2φ=-1)이 낮다.
  const scallopAmp = clamp(
    Math.max(params.marginScallopMm * 0.5, c2Scallop * (params.marginScallopMm > 0.05 ? 1 : 0)),
    scallopMin,
    scallopMax,
  );
  // 치은선의 완만한 1차 경사만 절반 반영해 스캘럽(-cos 2φ: 근·원심 고점, 협·설 저점)이 뚜렷이 남게 한다.
  const tiltCap = posterior ? 0.55 : 0.9;
  const a1Lab = clamp(c1Lab * 0.5, -tiltCap, tiltCap);
  const b1Mes = clamp(s1Mes * 0.5, -tiltCap, tiltCap);
  const rimMean = rimFourier.reduce((s, v) => s + v, 0) / SECTORS;
  const scallopDraft = Array.from({ length: SECTORS }, (_, b) => {
    const theta = ((b + 0.5) / SECTORS) * Math.PI * 2;
    const phi = theta - labialAngleFix;
    return rimMean - targetSubgDepth + a1Lab * Math.cos(phi) + b1Mes * Math.sin(phi) - scallopAmp * Math.cos(2 * phi);
  });
  // 완만한 치은선(rimLow) 대비 서브 0.5~1.0mm 기준 대역에 머물게 고른 뒤 다시 k≤2로 매끄럽게 마감한다.
  // 협·설측이 높게 솟은 치은선이어도 스캘럽 곡선이 눌려 거꾸로 되지 않게 하한 여유를 둔다.
  const rimLow = lowPassCircular(rimZ, 2);
  const bandedDraft = scallopDraft.map((z, b) => {
    const hi = Math.max(minMarginZ, rimLow[b]! - Math.max(0.4, params.marginDepthMm - 0.05));
    const lo = rimLow[b]! - Math.max(1.35, params.marginDepthMm + 0.75);
    return clamp(Math.min(hi, Math.max(lo, z)), minMarginZ, maxMarginZ);
  });
  let smoothMarginZ = lowPassCircular(bandedDraft, 2).map((z, b) => {
    const supragingivalCap = Math.max(minMarginZ, rimLow[b]! - Math.min(0.35, params.marginDepthMm));
    return clamp(Math.min(z, supragingivalCap), minMarginZ, maxMarginZ);
  });
  // 최종 마진에서도 cos 2φ 스캘럽 성분이 최소치 이상 유지되도록 보강한다(근·원심 평균 > 협·설 평균).
  {
    let postC2 = 0;
    for (let b = 0; b < SECTORS; b += 1) {
      const phi = ((b + 0.5) / SECTORS) * Math.PI * 2 - labialAngleFix;
      postC2 += (-smoothMarginZ[b]! * Math.cos(2 * phi) * 2) / SECTORS;
    }
    const wantMinC2 = scallopMin * 0.85;
    if (postC2 < wantMinC2) {
      const addAmp = wantMinC2 - postC2;
      const baseWithScallop = smoothMarginZ.map((z, b) => {
        const phi = ((b + 0.5) / SECTORS) * Math.PI * 2 - labialAngleFix;
        // 근·원심(cos 2φ = -1)은 살짝 올리고(치은선 -0.35mm 상한 안), 협·설(cos 2φ = +1)은 내리는 대칭 스캘럽.
        const supragingivalCap = Math.max(minMarginZ, rimLow[b]! - Math.min(0.35, params.marginDepthMm));
        return clamp(Math.min(supragingivalCap, z - addAmp * Math.cos(2 * phi) * 0.5), minMarginZ, maxMarginZ);
      });
      smoothMarginZ = lowPassCircular(baseWithScallop, 2).map((z) => clamp(z, minMarginZ, maxMarginZ));
    }
  }
  smoothMarginZ = lowPassCircular(smoothMarginZ, 2).map((z) => clamp(z, minMarginZ, maxMarginZ));
  const meanMarginZ = smoothMarginZ.reduce((s, v) => s + v, 0) / SECTORS;
  // 마진 위 0.6~1.8mm(치은정 쪽) 연조직 개구부 반경. 치종 형태를 깨뜨리는 한쪽 왜곡을 막기 위해 대칭(짝수 조화) 평균만 참고한다.
  const tissueBuckets: number[][] = Array.from({ length: SECTORS }, () => []);
  // 치은정 부근(마진 위 0.3~1.1mm) 잇몸 안쪽 면. 스캔바디 기둥 표면(r <= sbR+0.55)을 잇몸 내벽으로 오인해
  // 마진이 스캔바디 지름으로 쪼그라들지 않도록 sbR+0.55mm 바깥의 연조직 깔때기 벽만 모은다.
  const innerBuckets: number[][] = Array.from({ length: SECTORS }, () => []);
  const sectorMaxNearZ = new Array<number>(SECTORS).fill(-Infinity);
  for (let i = 0; i < jawLocalPts.length; i += 3) {
    const x = jawLocalPts[i]!;
    const y = jawLocalPts[i + 1]!;
    const z = jawLocalPts[i + 2]!;
    const r = Math.hypot(x, y);
    if (r < sbR + 0.7 || r > sbR + 3.4) continue;
    const b = Math.min(SECTORS - 1, Math.floor((wrapAngle(Math.atan2(y, x)) / (Math.PI * 2)) * SECTORS));
    const zm = smoothMarginZ[b]!;
    if (r <= sbR + 2.4 && z > sectorMaxNearZ[b]!) sectorMaxNearZ[b] = z;
    if (z >= zm + 0.55 && z <= zm + 1.25) innerBuckets[b]!.push(r);
    if (z < zm + 0.6 || z > zm + 1.8) continue;
    tissueBuckets[b]!.push(r);
  }
  const innerRaw = innerBuckets.map((list, b) => {
    if (list.length < 4) return Number.NaN;
    if (sectorMaxNearZ[b]! > smoothMarginZ[b]! + 2.4) return Number.NaN;
    list.sort((a, c) => a - c);
    return list[Math.floor(list.length * 0.25)]!;
  });
  const validInnerCount = innerRaw.filter(Number.isFinite).length;
  const gingivaInnerR =
    validInnerCount >= Math.round(SECTORS * 0.5)
      ? lowPassCircular(
          innerRaw.map((r, _, all) => {
            if (Number.isFinite(r)) return r;
            const ok = all.filter(Number.isFinite);
            return ok.reduce((s, v) => s + v, 0) / ok.length;
          }),
          2,
        )
      : null;
  const tissueAll: number[] = [];
  for (let b = 0; b < SECTORS; b += 1) {
    const list = tissueBuckets[b]!;
    if (list.length < 3 || sectorMaxNearZ[b]! > smoothMarginZ[b]! + 2.6) continue;
    list.sort((a, c) => a - c);
    tissueAll.push(list[Math.floor(list.length * 0.5)]!);
  }
  tissueAll.sort((a, c) => a - c);
  const medianTissueR = tissueAll.length > 0 ? tissueAll[Math.floor(tissueAll.length * 0.5)]! : Number.NaN;
  const c0: Vec3 = [0, 0, meanMarginZ];

  // ── 2) 가상 치아(평균 크기 + 인접치 간격/순측선 + 반대측 동일치 거울상 + 대합치 중심) 구성
  const contraMirror = measureContralateralMirrorCrown(
    jawGeometry,
    fixture,
    args.neighbors ?? [],
    tpl,
    meanMarginZ,
  );
  // 치종 평균 크기를 기본으로 하되, 반대측 동일 자연치 거울상이 있으면 환자 고유 크기로 섞는다(평균 무시 방지 ±15%).
  const refNaturalMdMm = contraMirror
    ? clamp(tpl.naturalMdMm * 0.45 + contraMirror.mdMm * 0.55, tpl.naturalMdMm * 0.85, tpl.naturalMdMm * 1.15)
    : tpl.naturalMdMm;
  const refNaturalBlMm = contraMirror
    ? clamp(tpl.naturalBlMm * 0.45 + contraMirror.blMm * 0.55, tpl.naturalBlMm * 0.85, tpl.naturalBlMm * 1.15)
    : tpl.naturalBlMm;

  const rawTiltRad = Math.acos(clamp(occInFix[2], -1, 1));
  const tiltCapRad = params.axisMaxDeg * DEG;
  const occLat = Math.hypot(occInFix[0], occInFix[1]);
  const archTilt = Math.min(rawTiltRad * 0.85, tiltCapRad);
  const wArch: Vec3 =
    occLat > 1e-5
      ? norm3([
          (occInFix[0] / occLat) * Math.tan(archTilt),
          (occInFix[1] / occLat) * Math.tan(archTilt),
          1,
        ])
      : [0, 0, 1];
  const frame0 = insertionFrame(wArch, labXY);

  // 인접 자연치 접촉 높이(마진 위 3~7mm)만 본다. 그 아래는 치간유두 잇몸이라 간격이 작게 잡힌다.
  const adjBuckets: number[][] = Array.from({ length: SECTORS }, () => []);
  // 양옆이 자연치인지(접촉 높이 위로 솟은 점). 잇몸 둔덕만 있는 쪽은 크라운 크기를 맞추는 기준이 아니다.
  const tallSide: [number[], number[]] = [[], []];
  for (let i = 0; i < jawLocalPts.length; i += 3) {
    const p: Vec3 = [jawLocalPts[i]!, jawLocalPts[i + 1]!, jawLocalPts[i + 2]!];
    const rel = sub3(p, c0);
    const h = dot3(rel, frame0.w);
    const mesSign0 = dot3(frame0.vSide, mesXY) >= 0 ? 1 : -1;
    const isWisdomDistal0 = hasDistalRetromolarPad && dot3(rel, frame0.vSide) * mesSign0 < 0;
    if (!isWisdomDistal0 && h >= 2.6 && h <= 9.5) {
      const tu = dot3(rel, frame0.uLabial);
      const tv = dot3(rel, frame0.vSide);
      const tr = Math.hypot(tu, tv);
      if (tr >= 3 && tr <= 12 && Math.abs(tu) <= tr * Math.sin(32 * DEG)) tallSide[tv > 0 ? 0 : 1].push(tr);
    }
    if (isWisdomDistal0 || h < 2.2 || h > 7.5) continue;
    if (Math.hypot(p[0], p[1]) < sbR + 0.65) continue;
    const u = dot3(rel, frame0.uLabial);
    const v = dot3(rel, frame0.vSide);
    const r = Math.hypot(u, v);
    if (r < 3 || r > 9.5) continue;
    const phi = wrapAngle(Math.atan2(v, u));
    adjBuckets[Math.min(SECTORS - 1, Math.floor((phi / (Math.PI * 2)) * SECTORS))]!.push(r);
  }
  const adjLimitR = adjBuckets.map((list) => {
    if (list.length < 4) return Infinity;
    list.sort((a, c) => a - c);
    return list[Math.floor(list.length * 0.1)]!;
  });
  const sideReach = (centerPhi: number) => {
    const vals: number[] = [];
    for (let b = 0; b < SECTORS; b += 1) {
      const phi = ((b + 0.5) / SECTORS) * Math.PI * 2;
      let d = Math.abs(phi - centerPhi) % (Math.PI * 2);
      if (d > Math.PI) d = Math.PI * 2 - d;
      if (d <= 25 * DEG && Number.isFinite(adjLimitR[b]!)) vals.push(adjLimitR[b]!);
    }
    return vals.length ? Math.min(...vals) : Number.NaN;
  };
  const mesSign0 = dot3(frame0.vSide, mesXY) >= 0 ? 1 : -1;
  const posAllowance0 = mesSign0 > 0 ? mesialAllowance : distalAllowance;
  const negAllowance0 = mesSign0 > 0 ? distalAllowance : mesialAllowance;
  const rawReachPos = sideReach(Math.PI / 2);
  const rawReachNeg = sideReach((3 * Math.PI) / 2);
  // 옆 치아가 직접어벗(심플어벗)·지대치면 스캔 표면에서 그 치아의 크라운 인접면 두께만큼 안쪽이 내 예측 크라운의 경계다.
  const reachPos = Number.isFinite(rawReachPos)
    ? Math.max(2.6, rawReachPos - posAllowance0.wallMm)
    : Number.NaN;
  const reachNeg = Number.isFinite(rawReachNeg)
    ? Math.max(2.6, rawReachNeg - negAllowance0.wallMm)
    : Number.NaN;
  let mdScale = 1;
  let sideShiftMm = 0;
  if (Number.isFinite(reachPos) && Number.isFinite(reachNeg)) {
    mdScale = clamp((reachPos + reachNeg) / refNaturalMdMm, 0.92, 1.12);
    sideShiftMm = clamp((reachPos - reachNeg) / 2, -0.8, 0.8);
  } else if (Number.isFinite(reachPos) || Number.isFinite(reachNeg)) {
    const one = Number.isFinite(reachPos) ? reachPos : reachNeg;
    mdScale = clamp((one * 2) / refNaturalMdMm, 0.95, 1.08);
  } else if (contraMirror) {
    mdScale = clamp(refNaturalMdMm / tpl.naturalMdMm, 0.92, 1.1);
  }
  const sideHasTooth = (list: number[], rawReach: number) =>
    Number.isFinite(rawReach) && list.filter((r) => r <= rawReach + 3).length >= 15;
  const toothPos = sideHasTooth(tallSide[0], rawReachPos);
  const toothNeg = sideHasTooth(tallSide[1], rawReachNeg);
  // 가상 치아 근원심: 치종 평균(+거울상) 폭. 양옆 자연치가 있으면 그 사이(±15%), 한쪽만 있으면 그쪽에 닿게 둔다.
  const natHalfMd = refNaturalMdMm / 2;
  let crownHalfMd = natHalfMd;
  let crownCenterV = 0;
  if (toothPos && toothNeg) {
    crownHalfMd = clamp((reachPos + reachNeg) / 2, natHalfMd * 0.85, natHalfMd * 1.15);
    crownCenterV = (reachPos - reachNeg) / 2;
  } else if (toothPos) {
    crownCenterV = reachPos - crownHalfMd;
  } else if (toothNeg) {
    crownCenterV = crownHalfMd - reachNeg;
  }
  crownCenterV = clamp(crownCenterV, -NAT_CROWN_SHIFT_MAX_MM, NAT_CROWN_SHIFT_MAX_MM);
  const labialLimit = adjacentLabialLimit(jawLocalPts, {
    labXY,
    ownRadius: sbR,
    ownHeight: sbH,
    reachPos: Number.isFinite(reachPos) ? reachPos : (refNaturalMdMm / 2) * mdScale,
    reachNeg: Number.isFinite(reachNeg) ? reachNeg : (refNaturalMdMm / 2) * mdScale,
    zFrom: meanMarginZ + 0.5,
    zTo: meanMarginZ + 11,
    bulgeMm: ARCH_LABIAL_BULGE_MM[tpl.kind],
  });
  /** 가상 크라운 순측 한계(인접치 순측선)까지 dir 방향 반경. 순측을 향하지 않는 열은 제한 없음. */
  const labialLimitAt = (dir: Vec3, h: number, axis: Vec3 = frame.w) => {
    if (!labialLimit) return Infinity;
    const dl = dir[0] * labXY[0] + dir[1] * labXY[1];
    if (dl < 0.25) return Infinity;
    const base = add3(c0, scale3(axis, h));
    const ub = base[0] * labXY[0] + base[1] * labXY[1];
    return (labialLimit(base[2]) - ub) / dl;
  };
  const blScale = contraMirror
    ? clamp(refNaturalBlMm / tpl.naturalBlMm, 0.9, 1.12)
    : 1 + (mdScale - 1) * 0.5;
  const marginA = (tpl.marginBlMm / 2) * blScale * params.marginSizeScale;
  const marginB = (tpl.marginMdMm / 2) * mdScale * params.marginSizeScale;

  // ── 3) 삽입축:
  // - 구치부: 임플란트 수직축(+Z)을 기본으로 지키고 대합치 중앙에서 많이 벗어난 만큼만 완만히 반영한다.
  // - 전치부(1·2·3번, 우리·알토란기공소 남정헌 #13·#23, 정성윤 #22·#23, 이춘식 #33 등 실측):
  //   임플란트가 순측(전방)으로 경사지게 식립된 경우 순측 치축 기울기를 따라 설측으로 세우고,
  //   근·원심 역시 전체 악궁 평균 법선(곡률·스피만곡 오차 포함) 대신 양옆 인접치 치축·인접면 통로(proxCorridor)를 따라 세운다.
  // - 또한 전·구치 모두 포스트 상단이 한쪽 인접치에 치우쳐 지르코니아 크라운 두께(목표 ≥1.0mm)가 부족하고 반대쪽에 여유가 있으면
  //   열린 인접 공간 쪽으로 삽입축을 추가 보정한다.
  const proxCorridor = adjacentProximalCorridor(jawLocalPts, {
    c0,
    wOccRef: norm3(occInFix),
    labXY,
    mesXY,
    ownRadius: sbR,
    ownHeight: sbH,
    coreHalfBlMm: Math.max(2.5, marginA * 1.05),
    mesialWallAllowanceMm: mesialAllowance.wallMm,
    distalWallAllowanceMm: distalAllowance.wallMm,
    skipDistal: hasDistalRetromolarPad,
  });

  const steerAxisForProximalClearance = (wInit: Vec3, capRad: number): Vec3 => {
    let wCur = wInit;
    const H = tpl.postHeightMm;
    const hLo = Math.max(2.6, H * 0.38);
    const hHi = H * 0.98;
    const hRef = H * 0.72;
    const coreU = Math.max(2.2, marginA * 0.88);
    const baseHalfMdEst = posterior
      ? Math.max(1.55, boreTopR + SCREW_WALL_MM + 0.25)
      : Math.max(1.65, marginB - shoulderW * 0.85);
    const topHalfMdEst = posterior
      ? Math.max(1.45, boreTopR + SCREW_WALL_MM + 0.12)
      : Math.max(1.48, Math.min((tpl.topMdMm / 2) * mdScale * params.postWidthScale, baseHalfMdEst - 0.15));
    const wantThick = posterior
      ? Math.max(1.0, params.minCrownThicknessMm)
      : Math.max(1.06, params.minCrownThicknessMm + 0.06);
    const maxProxShiftMm = posterior ? 1.1 : 2.2;
    let movedAbs = 0;

    for (let iter = 0; iter < 4 && movedAbs < maxProxShiftMm; iter += 1) {
      const fr = insertionFrame(wCur, labXY);
      const vMes: Vec3 = dot3(fr.vSide, mesXY) >= 0 ? fr.vSide : scale3(fr.vSide, -1);
      // 높이별 여유(실제 벽 거리 - 해당 높이 포스트 반폭)를 재서 중단 풍융부에서도 1.0mm 크라운 두께를 지킨다.
      const mesClearSamples: number[] = [];
      const disClearSamples: number[] = [];
      for (let i = 0; i < jawLocalPts.length; i += 3) {
        const p: Vec3 = [jawLocalPts[i]!, jawLocalPts[i + 1]!, jawLocalPts[i + 2]!];
        if (Math.hypot(p[0], p[1]) < sbR + 0.55 && p[2] > -0.5 && p[2] < sbH + 0.75) continue;
        const rel = sub3(p, c0);
        const h = dot3(rel, fr.w);
        if (h < hLo || h > hHi) continue;
        if (Math.abs(dot3(rel, fr.uLabial)) > coreU) continue;
        const uH = clamp((h - 0.8) / Math.max(1.5, H - 0.8), 0, 1);
        const postHalfAtH = baseHalfMdEst + (topHalfMdEst - baseHalfMdEst) * uH;
        const v = dot3(rel, vMes);
        if (v > 0.6 && v < 8.5) mesClearSamples.push(v - mesialAllowance.wallMm - postHalfAtH);
        else if (!hasDistalRetromolarPad && v < -0.6 && v > -8.5) {
          disClearSamples.push(-v - distalAllowance.wallMm - postHalfAtH);
        }
      }
      let clearMes = Infinity;
      let clearDis = Infinity;
      if (mesClearSamples.length >= 8) {
        mesClearSamples.sort((a, c) => a - c);
        clearMes = mesClearSamples[Math.floor(mesClearSamples.length * 0.05)]!;
      }
      if (disClearSamples.length >= 8) {
        disClearSamples.sort((a, c) => a - c);
        clearDis = disClearSamples[Math.floor(disClearSamples.length * 0.05)]!;
      }
      // 이웃 임플란트 이등분면 유격도 함께 반영해 반대쪽 스캔바디 영역을 침범하지 않게 한다.
      const baseRef = add3(c0, scale3(fr.w, hRef));
      const postHalfRef =
        baseHalfMdEst + (topHalfMdEst - baseHalfMdEst) * clamp((hRef - 0.8) / Math.max(1.5, H - 0.8), 0, 1);
      for (const nb of neighbors) {
        const nbRef = add3(nb.origin, scale3(fr.w, meanMarginZ + hRef));
        let n = sub3(nbRef, baseRef);
        n = sub3(n, scale3(fr.w, dot3(n, fr.w)));
        const nLen = Math.hypot(...n);
        if (nLen < 1.5) continue;
        const nUnit = scale3(n, 1 / nLen);
        const projMes = dot3(nUnit, vMes);
        if (Math.abs(projMes) < 0.5) continue;
        const halfClear = (nLen * 0.5) / Math.abs(projMes) - postHalfRef;
        if (projMes > 0) clearMes = Math.min(clearMes, halfClear);
        else clearDis = Math.min(clearDis, halfClear);
      }

      const wantThickMes = mesialAllowance.bridged ? 0.55 : wantThick;
      const wantThickDis = distalAllowance.bridged ? 0.55 : wantThick;
      const defDis = Number.isFinite(clearDis) ? Math.max(0, wantThickDis - clearDis) : 0;
      const defMes = Number.isFinite(clearMes) ? Math.max(0, wantThickMes - clearMes) : 0;
      if (Math.max(defDis, defMes) <= 0.04) break;
      const minAsym = posterior ? 0.25 : 0.06;
      let shiftMes = 0;
      if (defDis >= defMes && clearMes > clearDis + minAsym) {
        const toCenter = Number.isFinite(clearMes) ? (clearMes - clearDis) * 0.5 : 1.6;
        shiftMes = Math.min(defDis, toCenter, maxProxShiftMm - movedAbs);
      } else if (defMes > defDis && clearDis > clearMes + minAsym) {
        const toCenter = Number.isFinite(clearDis) ? (clearDis - clearMes) * 0.5 : 1.6;
        shiftMes = -Math.min(defMes, toCenter, maxProxShiftMm - movedAbs);
      }
      if (Math.abs(shiftMes) <= 0.04) break;
      wCur = capTilt(
        norm3(add3(scale3(wCur, H / Math.max(wCur[2], 0.2)), scale3(mesXY, (shiftMes * H) / hRef))),
        capRad,
      );
      movedAbs += Math.abs(shiftMes);
    }
    return wCur;
  };

  let w: Vec3 = [0, 0, 1];
  let axisSource: CustomAbutmentDesignMetrics["axisSource"] = "arch";
  let neighborLockRad: number | null = null;
  const deadzoneMm = posterior ? AXIS_VERTICAL_DEADZONE_POSTERIOR_MM : AXIS_VERTICAL_DEADZONE_ANTERIOR_MM;

  if (!posterior) {
    const H = tpl.postHeightMm;
    // 인접 자연치 순측면(labialLimit) 기울기와 인접치 근원심 통로(proxCorridor) 기울기를 함께 반영한다.
    let wAntTarget = norm3(occInFix);
    const occLabSlope = dot3(wAntTarget, labXY) / Math.max(wAntTarget[2], 0.25);
    const occMesSlope = dot3(wAntTarget, mesXY) / Math.max(wAntTarget[2], 0.25);
    let blendedLabSlope = occLabSlope;
    if (labialLimit) {
      const zLo = meanMarginZ + 1.5;
      const zHi = meanMarginZ + 5.5;
      const uLo = labialLimit(zLo);
      const uHi = labialLimit(zHi);
      if (Number.isFinite(uLo) && Number.isFinite(uHi)) {
        const adjLabSlope = clamp((uHi - uLo) / (zHi - zLo), -Math.tan(26 * DEG), Math.tan(10 * DEG));
        blendedLabSlope = occLabSlope * 0.65 + adjLabSlope * 0.35;
      }
    }
    let blendedMesSlope: number;
    if (proxCorridor) {
      const corrMesSlope =
        dot3(proxCorridor.wCorr, mesXY) / Math.max(proxCorridor.wCorr[2], 0.25);
      const corrWeight = proxCorridor.bothSides ? 0.88 : 0.62;
      blendedMesSlope = clamp(
        corrMesSlope * corrWeight + occMesSlope * (1 - corrWeight),
        -Math.tan(16 * DEG),
        Math.tan(16 * DEG),
      );
    } else {
      blendedMesSlope = clamp(
        occMesSlope + (sideShiftMm * 0.35) / H,
        -Math.tan(12 * DEG),
        Math.tan(12 * DEG),
      );
    }
    wAntTarget = norm3([
      labXY[0] * blendedLabSlope + mesXY[0] * blendedMesSlope,
      labXY[1] * blendedLabSlope + mesXY[1] * blendedMesSlope,
      1,
    ]);
    // 임플란트(+Z)가 목표 치축에서 벗어난 전치는 인접치 치축으로 충분히 세우고, 이미 수직에 가까운 경우만 완만히 보정한다.
    const rawAntAng = Math.acos(clamp(wAntTarget[2], -1, 1));
    const antFollow = smootherstep(clamp((rawAntAng / DEG - 2.5) / 7.5, 0.4, 1.0)) * 0.92;
    w = capTilt(slerpDir([0, 0, 1], wAntTarget, antFollow), tiltCapRad);
    axisSource = "arch";

    // 인접치 순측 아치 라인(labialLimit) 안쪽으로 포스트 순측 벽 + 크라운 두께가 들어오도록 삽입축을 설측으로 추가 보정한다.
    if (labialLimit) {
      const hRef = H * 0.78;
      const postLab = tpl.topLabialHalfMm * blScale * params.postWidthScale + 0.25;
      let moved = 0;
      const maxLabShiftMm = 2.6;
      for (let iter = 0; iter < 4 && moved < maxLabShiftMm; iter += 1) {
        const fr = insertionFrame(w, labXY);
        const lim = labialLimitAt(fr.uLabial, hRef, fr.w);
        if (!Number.isFinite(lim)) break;
        const need = Math.min(postLab + params.minCrownThicknessMm - lim, maxLabShiftMm - moved);
        if (need <= 0.04) break;
        w = capTilt(
          norm3(add3(scale3(w, H / Math.max(w[2], 0.2)), scale3(labXY, (-need * H) / hRef))),
          tiltCapRad,
        );
        moved += need;
      }
    }
    w = steerAxisForProximalClearance(w, tiltCapRad);
  } else {
    // 구치부 포스트 각도(삽입축):
    // 1) 근처 치아들의 위치·치축(교합평면 법선 occInFix, 인접치·심플어벗 통로 proxCorridor, 주변 악궁 중심선 jawArchOffsetU)과
    // 2) 대합치 치관 교합면(중심와)의 실제 중심 위치를 함께 고려해 포스트가 악궁과 대합치 사이에 바르게 서도록 잡는다.
    const H = tpl.postHeightMm;
    const mesSignOnFrame0 = dot3(frame0.vSide, mesXY) >= 0 ? 1 : -1;
    const crownShiftMesMm = crownCenterV * mesSignOnFrame0;
    const hasProximalBound = Number.isFinite(reachPos) || Number.isFinite(reachNeg);
    const isBridgedToScanned = mesialAllowance.bridged || distalAllowance.bridged;

    const occU = (dot3(occInFix, labXY) / Math.max(occInFix[2], 0.25)) * H;
    const occV = (dot3(occInFix, mesXY) / Math.max(occInFix[2], 0.25)) * H;
    const nearU = occU * 0.78 + clamp(jawArchOffsetU, -1.8, 1.8) * 0.35;
    let nearV: number;
    if (proxCorridor) {
      const corrV = (dot3(proxCorridor.wCorr, mesXY) / Math.max(proxCorridor.wCorr[2], 0.25)) * H;
      const corrW = proxCorridor.bothSides ? 0.82 : isBridgedToScanned ? 0.78 : 0.58;
      nearV = corrV * corrW + occV * (1 - corrW) + crownShiftMesMm * 0.2;
    } else {
      nearV = occV * 0.75 + crownShiftMesMm * 0.25;
    }

    let wantU = nearU;
    let wantV = nearV;
    if (opposingLocalPts.length > 0 && params.axisToOpposing > 0) {
      const frameOccRef = insertionFrame(occInFix, labXY);
      const mesSignOcc = dot3(frameOccRef.vSide, mesXY) >= 0 ? 1 : -1;
      const center = opposingCenterPoint(opposingLocalPts, c0, frameOccRef, {
        vCrownMm: crownShiftMesMm * mesSignOcc,
        halfMdMm: crownHalfMd,
        constrainMesiodistal: hasProximalBound,
      });
      if (center) {
        const relOpp = sub3(center, c0);
        const scaleH = H / Math.max(relOpp[2], H + 1.2);
        const oppU = dot3(relOpp, labXY) * scaleH;
        const oppV = dot3(relOpp, mesXY) * scaleH;
        const wOppU = (isBridgedToScanned ? 0.5 : 0.62) * params.axisToOpposing;
        const wOppV = (isBridgedToScanned ? 0.28 : 0.42) * params.axisToOpposing;
        wantU = oppU * wOppU + nearU * (1 - wOppU);
        wantV = oppV * wOppV + nearV * (1 - wOppV);
        axisSource = "opposing";
      }
    }

    const wantLat = Math.hypot(wantU, wantV);
    const effLat = wantLat > deadzoneMm ? (wantLat - deadzoneMm) * 0.72 : 0;
    const postAutoTiltCap = Math.min(tiltCapRad, 7.0 * DEG);
    if (effLat > 1e-4 && wantLat > 1e-6) {
      const dirX = (labXY[0] * wantU + mesXY[0] * wantV) / wantLat;
      const dirY = (labXY[1] * wantU + mesXY[1] * wantV) / wantLat;
      w = capTilt(norm3([(dirX * effLat) / H, (dirY * effLat) / H, 1]), postAutoTiltCap);
    }
    w = steerAxisForProximalClearance(w, Math.min(tiltCapRad, 8.0 * DEG));
  }
  const neighborAxes = estimateAdjacentLongAxes(jawLocalPts, {
    wOcc: occInFix,
    labXY,
    mesXY,
    ownRadius: sbR,
    ownHeight: sbH,
    skipDistal: hasDistalRetromolarPad,
    mesialBridgedAbutment: mesialAllowance.bridged,
    distalBridgedAbutment: distalAllowance.bridged,
  });
  if (neighborAxes.length > 0) {
    let target = neighborAxes[0]!;
    if (neighborAxes.length > 1) {
      target = norm3(neighborAxes.reduce((acc, axis) => add3(acc, axis), [0, 0, 0] as Vec3));
      if (target[2] < 0) target = scale3(target, -1);
    }
    const spread =
      neighborAxes.length > 1
        ? Math.acos(clamp(Math.abs(dot3(neighborAxes[0]!, neighborAxes[1]!)), 0, 1))
        : 0;
    const bridgeTight =
      String(ownWork?.prosthesisType || "").trim() === "브리지" ||
      mesialAllowance.bridged ||
      distalAllowance.bridged;
    // 인접 어벗·자연치가 하나면 그 장축과 포스트 각도를 맞춘다. 양쪽이 크게 벌어질 때만 섞는다.
    const weight = spread > 28 * DEG ? (bridgeTight ? 0.94 : 0.82) : 1;
    w = weight >= 0.999 ? target : norm3(add3(scale3(w, 1 - weight), scale3(target, weight)));
    if (w[2] < 0) w = scale3(w, -1);
    neighborLockRad = (posterior ? 28 : 32) * DEG;
    w = capTilt(w, neighborLockRad);
    axisSource = "parallel";
  }
  if (mode.probeAxis) return { kind: "axis", axisWorld: fixtureLocalDirToWorld(w, fixture.fixturePose) };
  const hasManualAxisShift = params.axisShiftLabialMm !== 0 || params.axisShiftMesialMm !== 0;
  if (mode.groupAxisWorld) {
    w = worldDirToFixtureLocal(mode.groupAxisWorld, fixture.fixturePose);
    axisSource = "parallel";
  }
  if (hasManualAxisShift) {
    const H = tpl.postHeightMm;
    const top = add3(
      scale3(w, H / Math.max(w[2], 0.2)),
      add3(scale3(labXY, params.axisShiftLabialMm), scale3(mesXY, params.axisShiftMesialMm)),
    );
    w = norm3(top);
  }
  const effectiveTiltCapRad = posterior ? Math.min(tiltCapRad, 9.5 * DEG) : tiltCapRad;
  // 브리지·인접 평행 그룹(groupAxisWorld)은 이미 그룹 전체 각도 상한 안에서 공통 월드 축으로 맞췄으므로,
  // 치아마다 따로 capTilt·allowRatio로 꺾지 않아 모든 지대주 포스트가 완전히 같은 각도로 평행해진다.
  if (!mode.groupAxisWorld || hasManualAxisShift) {
    w = capTilt(w, hasManualAxisShift ? tiltCapRad : (neighborLockRad ?? effectiveTiltCapRad));
    if (posterior && neighborLockRad == null) {
      const H = tpl.postHeightMm;
      const allowRatio = 0.42;
      const offX = (w[0] / w[2]) * H;
      const offY = (w[1] / w[2]) * H;
      const off = Math.hypot(offX, offY);
      if (off > 1e-6) {
        const phi = Math.atan2(offY, offX) - labialAngleFix;
        const allow = superellipseRadius(marginA, marginB, phi) * allowRatio;
        if (off > allow) {
          const k = allow / off;
          w = norm3([(w[0] / w[2]) * k, (w[1] / w[2]) * k, 1]);
        }
      }
    }
  }
  const frame = insertionFrame(w, labXY);
  const angulationDeg = Math.acos(clamp(frame.w[2], -1, 1)) / DEG;

  // 가상 치아(예측 크라운) = 치종 평균(+반대측 거울상) 크기 타원(순설 natHalfBl × 근원심 crownHalfMd).
  // 인접치 순측선을 넘으면 크기는 그대로 두고 설측으로 옮긴다.
  const natHalfBl = refNaturalBlMm / 2;
  const contourH = tpl.anterior ? 3.5 : 3.0;
  const postLabMin = tpl.topLabialHalfMm * blScale * params.postWidthScale + 0.6 + params.minCrownThicknessMm;
  let crownCenterU = 0;
  {
    const lim = labialLimitAt(frame.uLabial, contourH);
    if (Number.isFinite(lim)) crownCenterU = Math.min(0, lim - natHalfBl);
    crownCenterU = Math.max(crownCenterU, -Math.max(0, natHalfBl - postLabMin));
  }
  const crownSideSign = dot3(frame.vSide, frame0.vSide) >= 0 ? 1 : -1;
  const mesialSignOnV = dot3(frame.vSide, mesXY) >= 0 ? 1 : -1;
  /** 가상 치아의 dir 방향 반경(높이 h). 마진(r0)에서 치종 해부 단면 풍융부까지 매끄럽게 올라온 뒤 교합·절단 쪽으로 수렴한다. */
  const naturalCrownR = (dir: Vec3, h: number, h0: number, r0: number, hCrownTop: number) => {
    const du = dot3(dir, frame.uLabial);
    const dv = dot3(dir, frame.vSide);
    const s = clamp((h - h0) / Math.max(hCrownTop - h0, 1), 0, 1);
    const fa = tpl.anterior
      ? 1 - 0.54 * smootherstep(clamp((s - 0.36) / 0.64, 0, 1))
      : 1 +
        0.025 * Math.sin(Math.PI * clamp(s / 0.72, 0, 1)) -
        0.175 * smootherstep(clamp((s - 0.5) / 0.5, 0, 1));
    const fb = tpl.anterior
      ? 1 - 0.1 * smootherstep(clamp((s - 0.72) / 0.28, 0, 1))
      : 1 - 0.095 * smootherstep(clamp((s - 0.72) / 0.28, 0, 1));
    let t = analyticSectionRay(
      tpl.kind,
      "crown",
      natHalfBl * fa,
      natHalfBl * fa,
      crownHalfMd * fb,
      crownCenterU * fa,
      crownCenterV * crownSideSign,
      du,
      dv,
    );
    if (Number.isFinite(t) && contraMirror) {
      const anatPhi = wrapAngle(Math.atan2(dv * mesialSignOnV, du));
      const mirrorRatio = evalPeriodicLinear(contraMirror.contourRatio, anatPhi);
      const bodyW = Math.sin(Math.PI * clamp(s, 0.05, 0.95));
      t *= 1 + (mirrorRatio - 1) * 0.55 * bodyW;
    }
    const emerge = smootherstep(clamp((h - h0) / (tpl.anterior ? 2.25 : 1.85), 0, 1));
    return r0 + ((Number.isFinite(t) ? t : r0) - r0) * emerge;
  };

  // ── 4) 가상 치아 교합면 높이 → 포스트 높이(대합치와 교합 접촉, 지르코니아 두께 최소 0.7mm, 목표 1.0~1.5mm 확보)
  const oppField =
    opposingLocalPts.length > 0 ? buildOpposingHeightField(opposingLocalPts, c0, frame, 9) : null;
  const footR = Math.max(marginA, marginB) - shoulderW + 0.6;
  const oppFootH = oppField ? oppField.heightAt(0, 0, footR) : Infinity;
  // 중심부(포스트 상단 면) 대합치 높이.
  // 구치는 중심 교합면(0, 0), 전치는 절단연 능선(순측 +0.45mm — 설측 와에 물리는 하악 절치 때문에 포스트 전체가 짧아지지 않게 구분)을 본다.
  const oppCoreH = oppField
    ? posterior
      ? oppField.heightAt(0, 0, Math.min(2.2, footR * 0.6))
      : oppField.heightAt(0.45, 0, 1.35)
    : Infinity;
  const oppRefH = Number.isFinite(oppCoreH) ? oppCoreH : oppFootH;
  const hasOpposing = Number.isFinite(posterior ? oppFootH : oppRefH);
  // 대합치가 가깝더라도 지르코니아 최소 두께(0.7mm)와 목표(clearance 기본 1.3mm, 1.0~1.5mm)를 확보하기 위해
  // MIN_POST_HEIGHT_MM 때문에 대합치를 파고드는 일을 절대 허용하지 않는다.
  const minSafePostHeightMm = hasOpposing ? 2.2 : MIN_POST_HEIGHT_MM;
  // 인접한 치아가 직접어벗·프렙 지대치면 그 치아 높이는 아직 크라운이 올라가기 전이므로 인접 완성 치관 높이에서 뺀다.
  const posHasFinishedNeighbor = (mesialSignOnV > 0 ? mesialAllowance : distalAllowance).wallMm === 0;
  const negHasFinishedNeighbor = (mesialSignOnV > 0 ? distalAllowance : mesialAllowance).wallMm === 0;
  const adjacentTopH =
    posHasFinishedNeighbor || negHasFinishedNeighbor
      ? adjacentOcclusalHeight(
          jawLocalPts,
          c0,
          frame,
          marginB,
          { radius: sbR, height: sbH },
          {
            mesialSignOnV,
            isWisdom: hasDistalRetromolarPad,
            skipPos: !posHasFinishedNeighbor,
            skipNeg: !negHasFinishedNeighbor,
          },
        )
      : Number.NaN;
  const mirrorTopH = contraMirror ? clamp(contraMirror.crownHeightMm, 5.0, 10.5) : Number.NaN;
  const archCrownTopH = Number.isFinite(adjacentTopH)
    ? Number.isFinite(mirrorTopH)
      ? adjacentTopH * 0.7 + mirrorTopH * 0.3
      : adjacentTopH
    : mirrorTopH;
  const offsetH = params.postHeightOffsetMm;
  const desiredOccThickness = clamp(Math.max(clearance, params.minCrownThicknessMm + 0.15), 1.0, 1.5);
  // 대합치가 있으면 구치는 대합치와 교합되도록 올리고, 전치는 인접 자연치 절단연(archCrownTopH - 절단 두께)도 넘지 않게 맞춘다.
  const antIncisalCap =
    !posterior && Number.isFinite(archCrownTopH)
      ? archCrownTopH - Math.max(desiredOccThickness, tpl.crownOcclusalMm * 0.88)
      : Infinity;
  const baseCap = hasOpposing
    ? Math.min(tpl.postHeightMm + (posterior ? 4.5 : 2.2), antIncisalCap)
    : Math.min(
        tpl.postHeightMm + 3.0,
        Number.isFinite(archCrownTopH) ? archCrownTopH - desiredOccThickness : Infinity,
      );
  const postTopMax = Math.max(
    minSafePostHeightMm,
    hasOpposing ? Math.min(baseCap + offsetH, oppRefH - clearance + 0.8) : baseCap + offsetH,
  );
  const noOppTop = Number.isFinite(archCrownTopH) ? baseCap : Math.min(baseCap, tpl.postHeightMm);
  let postTopH = (hasOpposing ? Math.min(baseCap, oppRefH - clearance) : noOppTop) + offsetH;
  if (hasOpposing) postTopH = Math.min(postTopH, oppRefH - clearance);
  postTopH = Math.max(minSafePostHeightMm, postTopH);
  if (hasOpposing) {
    // 뼈대 최소 높이(2.2mm)에서도 최소 지르코니아 두께(0.7mm)는 반드시 남긴다.
    postTopH = Math.min(postTopH, Math.max(1.8, oppRefH - CROWN_THICKNESS_FLOOR_MM));
  }
  // 사용자가 테이퍼를 직접 지정하지 않았으면 포스트 길이에 맞춰 유지력(retention) 테이퍼를 자동 조절한다:
  // 짧은 포스트(≤4.0mm → 1.5°, ~5.0mm → 2.0°)는 크라운 탈락을 막기 위해 평행에 가깝게 세우고, 긴 포스트(≥6.8mm → 2.6°)만 완만히 준다.
  const hasExplicitTaper =
    args.params?.postTaperDeg != null && Number.isFinite(Number(args.params.postTaperDeg));
  const effectiveTaperDeg = hasExplicitTaper
    ? params.postTaperDeg
    : mode.groupAxisWorld
      ? 2.0
      : clamp(1.5 + Math.max(0, postTopH - 3.8) * 0.36, 1.5, 2.6);
  params.postTaperDeg = Math.round(effectiveTaperDeg * 10) / 10;
  taperSlope = Math.tan(effectiveTaperDeg * DEG);
  chamfer = chamferGeometry(shoulderW, R, taperSlope);
  const crownTopTarget =
    posterior && hasOpposing
      ? Infinity
      : Number.isFinite(archCrownTopH)
        ? archCrownTopH
        : Infinity;

  // ── 5) 이웃 디자인 크라운·마진 경계면, 인접치 스캔 제한
  const isBridgeLinkedWithOwn = (otherTooth: string): boolean => {
    const otherDigits = parseFdiTooth(otherTooth)?.digits;
    if (!ownFdi || !otherDigits) return false;
    if ((ownWork?.bridgeLinkedTeeth ?? []).some((t) => parseFdiTooth(t)?.digits === otherDigits)) {
      return true;
    }
    const otherWork = allWorks.find((tw) => parseFdiTooth(tw.toothNumber)?.digits === otherDigits);
    if ((otherWork?.bridgeLinkedTeeth ?? []).some((t) => parseFdiTooth(t)?.digits === ownFdi.digits)) {
      return true;
    }
    return (
      String(ownWork?.prosthesisType || "").trim() === "브리지" &&
      String(otherWork?.prosthesisType || "").trim() === "브리지" &&
      ownFdi.digits[0] === otherDigits[0]
    );
  };
  const crownMid = add3(c0, scale3(frame.w, 3.5));
  const planes = neighbors.map((nb) => {
    const nbMid = add3(nb.origin, scale3(frame.w, meanMarginZ + 3.5));
    let n = sub3(nbMid, crownMid);
    n = sub3(n, scale3(frame.w, dot3(n, frame.w)));
    return {
      point: scale3(add3(crownMid, nbMid), 0.5),
      normal: norm3(n),
      bridged: isBridgeLinkedWithOwn(nb.toothNumber),
    };
  });
  const planeLimitAt = (dir: Vec3, h: number) => {
    let lim = Infinity;
    const base = add3(c0, scale3(frame.w, h));
    for (const pl of planes) {
      const dn = dot3(dir, pl.normal);
      if (dn <= 1e-4) continue;
      lim = Math.min(lim, dot3(sub3(pl.point, base), pl.normal) / dn);
    }
    return lim;
  };
  // 이웃 크라운 경계면에서 벽 두께(insetMm)만큼 평행 이동한 내부 평면까지의 거리(볼록성 보존 평면 한계).
  const postPlaneLimitAt = (dir: Vec3, h: number, bridgedInsetMm: number, singleInsetMm: number) => {
    let lim = Infinity;
    const base = add3(c0, scale3(frame.w, h));
    for (const pl of planes) {
      const dn = dot3(dir, pl.normal);
      if (dn <= 1e-4) continue;
      const dPerp = dot3(sub3(pl.point, base), pl.normal);
      const inset = pl.bridged ? bridgedInsetMm : singleInsetMm;
      lim = Math.min(lim, Math.max(0.85, dPerp - inset) / dn);
    }
    return lim;
  };

  const scanLimit = new Float32Array(LIMIT_PHI_BINS * LIMIT_H_BINS).fill(Infinity);
  const isWisdomTooth = hasDistalRetromolarPad;
  for (let i = 0; i < jawLocalPts.length; i += 3) {
    const p: Vec3 = [jawLocalPts[i]!, jawLocalPts[i + 1]!, jawLocalPts[i + 2]!];
    if (Math.hypot(p[0], p[1]) < sbR + 0.55 && p[2] > -0.5 && p[2] < sbH + 0.75) continue;
    const rel = sub3(p, c0);
    const h = dot3(rel, frame.w);
    const hb = Math.floor((h - LIMIT_H_MIN) / LIMIT_H_STEP);
    if (hb < 0 || hb >= LIMIT_H_BINS) continue;
    const u = dot3(rel, frame.uLabial);
    const v = dot3(rel, frame.vSide);
    // 사랑니(#18,#28,#38,#48) 원심의 후구치 삼각 융기(높은 점막)나 무치악 치조제를 인접치 벽으로 오인해
    // 원심·원심설측 크라운과 포스트를 깎아 사다리꼴로 만들지 않도록, 실제 인접치가 있는 쪽만 자른다.
    if (isWisdomTooth && v * mesialSignOnV < -0.35) continue;
    const r = Math.hypot(u, v);
    // 치관 상방(h ≥ 2.3mm)에서 인접치 변연융기가 삽입축(frame.w) 2.0mm 안쪽으로 오버행해도 누락하지 않는다.
    const minScanR = h >= 2.3 ? 0.55 : Math.max(2.0, sbR + 0.45);
    if (r < minScanR || r > 10.5) continue;
    const pb = Math.min(LIMIT_PHI_BINS - 1, Math.floor((wrapAngle(Math.atan2(v, u)) / (Math.PI * 2)) * LIMIT_PHI_BINS));
    const idx = pb * LIMIT_H_BINS + hb;
    if (r < scanLimit[idx]!) scanLimit[idx] = r;
  }
  const scanLimitAt = (phi: number, h: number) => {
    const pb = Math.floor((wrapAngle(phi) / (Math.PI * 2)) * LIMIT_PHI_BINS);
    const hb = Math.floor((h - LIMIT_H_MIN) / LIMIT_H_STEP);
    let lim = Infinity;
    for (let dp = -1; dp <= 1; dp += 1) {
      const pp = (pb + dp + LIMIT_PHI_BINS) % LIMIT_PHI_BINS;
      for (let dh = -1; dh <= 1; dh += 1) {
        const hh = hb + dh;
        if (hh < 0 || hh >= LIMIT_H_BINS) continue;
        lim = Math.min(lim, scanLimit[pp * LIMIT_H_BINS + hh]!);
      }
    }
    return lim;
  };

  /**
   * 스캔에 찍힌 옆 치아/어벗 표면(scanLimit)에서 이 치아 예측 크라운 외면까지의 거리 한도.
   * 옆 치아가 직접어벗(심플어벗)·지대치면 그 기둥 높이 위로도 크라운 외벽이 수직으로 이어지므로
   * 기둥 상단의 최소 반경까지 함께 보고, 그 위에 올라갈 인접 크라운 인접면 두께(wallMm)를 빼서 자리를 남긴다.
   */
  // ── 6) 열(픽스쳐 원통 각 θ)마다 마진·포스트 원하는 형상과 예측 크라운
  const topB = (tpl.topMdMm / 2) * mdScale * params.postWidthScale;
  const minMarginRadius = coneTopR + 0.5;
  const convergeFrom = tpl.anterior ? 0.5 : 0.7;
  const topRoundMm = tpl.anterior ? TOP_ROUND_ANTERIOR_MM : TOP_ROUND_POSTERIOR_MM;

  const sideAllowanceOf = (phi: number) =>
    Math.sin(phi) * mesialSignOnV >= 0 ? mesialAllowance : distalAllowance;
  // 옆 치아가 직접어벗(심플어벗)·프렙 지대치면 스캔에 찍힌 그 기둥의 최근접 축방향 평면에서
  // 인접 크라운 인접면 두께(wallMm)만큼 안쪽 평면을 브리지 커넥터/인접 접촉 경계로 삼는다.
  const computeScannedAbutmentPlane = (signOnV: 1 | -1, wallMm: number): number => {
    if (wallMm <= 0) return Infinity;
    const dists: number[] = [];
    for (let i = 0; i < jawLocalPts.length; i += 3) {
      const p: Vec3 = [jawLocalPts[i]!, jawLocalPts[i + 1]!, jawLocalPts[i + 2]!];
      if (Math.hypot(p[0], p[1]) < sbR + 0.7 && p[2] < sbH + 1) continue;
      const rel = sub3(p, c0);
      const h = dot3(rel, frame.w);
      if (h < 2.4 || h > 9.5) continue;
      const u = dot3(rel, frame.uLabial);
      const sv = dot3(rel, frame.vSide) * signOnV;
      if (sv < 2.8 || sv > 9.5 || Math.abs(u) > 3.8) continue;
      dists.push(sv);
    }
    if (dists.length < 15) return Infinity;
    dists.sort((a, b) => a - b);
    const frontV = dists[Math.floor(dists.length * 0.05)]!;
    return Math.max(minMarginRadius + 0.5, frontV - wallMm);
  };
  const mesialPlaneLimitV = computeScannedAbutmentPlane(mesialSignOnV, mesialAllowance.wallMm);
  const distalPlaneLimitV = computeScannedAbutmentPlane(
    (mesialSignOnV * -1) as 1 | -1,
    distalAllowance.wallMm,
  );
  const adjacentScanCrownLimitAt = (phi: number, h: number) => {
    const sideAllowance = sideAllowanceOf(phi);
    const s = Math.sin(phi);
    if (sideAllowance.wallMm <= 0) {
      const raw = scanLimitAt(phi, h);
      return Number.isFinite(raw) ? raw + contact : Infinity;
    }
    let lim = Infinity;
    const planeV = s * mesialSignOnV >= 0 ? mesialPlaneLimitV : distalPlaneLimitV;
    if (Number.isFinite(planeV) && Math.abs(s) > 0.15) {
      lim = Math.min(lim, planeV / Math.abs(s));
    }
    const raw = scanLimitAt(phi, h);
    if (Number.isFinite(raw)) {
      const dirWeight = smootherstep(clamp((Math.abs(s) - 0.18) / 0.35, 0, 1));
      const cosOblique = Math.max(0.55, Math.abs(s));
      lim = Math.min(lim, Math.max(minMarginRadius + 0.45, raw - (sideAllowance.wallMm / cosOblique) * dirWeight));
    }
    return lim;
  };

  type ColumnPlan = {
    marginPt: Vec3;
    dir: Vec3;
    phi: number;
    h0: number;
    r0: number;
    hTop: number;
    /** 윗면 가장자리 대략 위치(삽입축 평면 u, v). 평평한 윗면 맞춤용. */
    tipU: number;
    tipV: number;
    postDesired: (h: number) => number;
    crownR: number[];
    crownH: number[];
    /** 치종 평균 크라운 반경(crownH와 같은 칸). 순측선 제한도 이보다 작게 자르지 않는다. */
    crownNat: number[];
    crownTopOcc: number;
  };
  const cols: ColumnPlan[] = [];
  const topRaw: number[] = [];

  // 인접 자연치·기성 어벗(스캔에 이미 찍힌 기둥)이 마진·크라운 장착 경로와 간섭하지 않도록
  // 치간유두(hAboveMargin < 3.1mm) 위쪽으로 솟은 실제 인접 치아·기성 어벗 외벽(3.1~8.2mm)까지의 거리를 잰다.
  // 인접 완성 자연치에는 내 크라운 벽(~1.0mm) 하나만 들어가므로 마진을 과도하게 줄이지 않고,
  // 인접 직접어벗·지대치에는 양쪽 크라운 벽 두 개가 들어가므로 충분한 유격을 둔다.
  const adjCoreMaxAboveMargin = new Float32Array(LIMIT_PHI_BINS).fill(-Infinity);
  const adjEquatorWallR = new Float32Array(LIMIT_PHI_BINS).fill(Infinity);
  for (let i = 0; i < jawLocalPts.length; i += 3) {
    const p: Vec3 = [jawLocalPts[i]!, jawLocalPts[i + 1]!, jawLocalPts[i + 2]!];
    const cylR = Math.hypot(p[0], p[1]);
    if (cylR < sbR + 0.85 && p[2] < sbH + 1.2) continue;
    const rel = sub3(p, c0);
    const u = dot3(rel, frame.uLabial);
    const v = dot3(rel, frame.vSide);
    const r = Math.hypot(u, v);
    if (r < sbR + 0.85 || r > 7.5) continue;
    const phi = Math.atan2(v, u);
    const thetaFix = Math.atan2(p[1], p[0]);
    const localMarginZ = evalPeriodicLinear(smoothMarginZ, thetaFix);
    const hAboveMargin = p[2] - localMarginZ;
    if (hAboveMargin < 0.8 || hAboveMargin > 10.5) continue;
    const vSigned = v * crownSideSign;
    const isDistalOfWisdom = hasDistalRetromolarPad && v * mesialSignOnV < 0;
    const inMesialOrDistalSide =
      !isDistalOfWisdom && ((vSigned > 0 && toothPos) || (vSigned < 0 && toothNeg));
    if (!inMesialOrDistalSide || Math.abs(Math.sin(phi)) < Math.sin(42 * DEG)) continue;
    const pb = Math.min(
      LIMIT_PHI_BINS - 1,
      Math.floor((wrapAngle(phi) / (Math.PI * 2)) * LIMIT_PHI_BINS),
    );
    if (r <= 6.5 && hAboveMargin > adjCoreMaxAboveMargin[pb]!) {
      adjCoreMaxAboveMargin[pb] = hAboveMargin;
    }
    if (hAboveMargin >= 3.1 && hAboveMargin <= 8.2 && r < adjEquatorWallR[pb]!) {
      adjEquatorWallR[pb] = r;
    }
  }
  const adjacentMarginCapAt = (phi: number) => {
    const pb = Math.floor((wrapAngle(phi) / (Math.PI * 2)) * LIMIT_PHI_BINS);
    let bestEquator = Infinity;
    for (let dp = -2; dp <= 2; dp += 1) {
      const pp = (pb + dp + LIMIT_PHI_BINS) % LIMIT_PHI_BINS;
      if (adjCoreMaxAboveMargin[pp]! < 3.2) continue;
      if (adjEquatorWallR[pp]! < bestEquator) bestEquator = adjEquatorWallR[pp]!;
    }
    if (!Number.isFinite(bestEquator)) return Infinity;
    const extraNeighborWall = sideAllowanceOf(phi).wallMm;
    const equatorClearance =
      extraNeighborWall > 0
        ? extraNeighborWall + Math.max(0.55, params.minCrownThicknessMm - 0.35)
        : Math.max(0.55, params.minCrownThicknessMm - 0.4);
    return bestEquator - equatorClearance;
  };

  // 마진 반경: 열마다 독립 클리핑하면 한쪽 모서리가 깎여 대구치 사각형이 삼각형·원형으로 왜곡되므로,
  // 치종 해부 단면(대구치 n=3.0 둥근 사각형, 소구치 n=2.34 타원, 전치 대칭 타원)의 중심(mCu, mCv)과
  // 반축(mHalfBl, mHalfMd)만 인접 유격·커프 플레어 한도 안에서 맞춰 100% 대칭 해부 단면을 유지한다.
  const meanTemplateR = (marginA + marginB) / 2;
  const uniformTissueScale = Number.isFinite(medianTissueR)
    ? clamp(1 + 0.3 * (medianTissueR / Math.max(meanTemplateR, 1) - 1), 0.96, 1.12)
    : 1;
  const emergeHalfBl = natHalfBl * (tpl.kind === "molar" ? 0.77 : posterior ? 0.82 : 0.8);
  const emergeHalfMd = crownHalfMd * (tpl.kind === "molar" ? 0.81 : posterior ? 0.84 : 0.84);
  const crownWeight = posterior ? 0.72 : 0.58;
  const maxFlareSlope = Math.tan((posterior ? 50 : 40) * DEG);
  const maxAnatHalfBl =
    (tpl.kind === "molar"
      ? ownFdi?.pos === 6 && (ownFdi.digits[0] === "1" || ownFdi.digits[0] === "2")
        ? 3.64
        : 3.46
      : tpl.kind === "premolar"
        ? 3.28
        : tpl.kind === "canine"
          ? 2.88
          : 2.68) * params.marginSizeScale;
  const maxAnatHalfMd =
    (tpl.kind === "molar"
      ? ownFdi?.pos === 6 && (ownFdi.digits[0] === "1" || ownFdi.digits[0] === "2")
        ? 3.58
        : 3.42
      : tpl.kind === "premolar"
        ? 2.75
        : tpl.kind === "canine"
          ? 2.85
          : 2.78) * params.marginSizeScale;

  const cutbackBl = Math.max(
    minMarginRadius,
    (emergeHalfBl - params.minCrownThicknessMm + shoulderW * 0.55) * params.marginSizeScale,
  );
  const cutbackMd = Math.max(
    minMarginRadius,
    (emergeHalfMd - params.minCrownThicknessMm + shoulderW * 0.55) * params.marginSizeScale,
  );
  let mHalfBl = clamp(
    marginA * uniformTissueScale * (1 - crownWeight) + cutbackBl * crownWeight,
    minMarginRadius + 0.08,
    maxAnatHalfBl,
  );
  let mHalfMd = clamp(
    marginB * uniformTissueScale * (1 - crownWeight) + cutbackMd * crownWeight,
    minMarginRadius + 0.08,
    maxAnatHalfMd,
  );
  const targetMarginAspect = mHalfBl / Math.max(mHalfMd, 0.5);
  let mCu = clamp(crownCenterU * (posterior ? 0.42 : 0.26), -0.72, 0.72);
  let mCv = clamp(crownCenterV * crownSideSign * (posterior ? 0.42 : 0.26), -0.72, 0.72);
  // 구치부는 경사진 임플란트에서 포스트가 솔리드로 스크류 채널을 감싸면서도 4방위 마진 폭이 일정하도록
  // 마진 중심·반축이 처음부터 스크류 채널 + 최소 벽 + 균일 마진 폭을 함께 품고 출발한다.
  if (posterior) {
    const estAxCos = Math.max(frame.w[2], 0.25);
    const estHTop = Math.max(2.6, postTopH - topRoundMm * 0.85);
    const estSpan = Math.max(0.8, estHTop - chamfer.height);
    const estTaper = taperSlope * estSpan;
    const estWall = boreTopR + SCREW_WALL_MM;
    const estUScrewTop = (estHTop / estAxCos) * frame.uLabial[2];
    const estVScrewTop = (estHTop / estAxCos) * frame.vSide[2];
    const estUScrewBase = (chamfer.height / estAxCos) * frame.uLabial[2];
    const estVScrewBase = (chamfer.height / estAxCos) * frame.vSide[2];
    const needMarginPosU = Math.max(estUScrewBase + estWall, estUScrewTop + estWall + estTaper) + shoulderW;
    const needMarginNegU = Math.max(-estUScrewBase + estWall, -estUScrewTop + estWall + estTaper) + shoulderW;
    const needMarginPosV = Math.max(estVScrewBase + estWall, estVScrewTop + estWall + estTaper) + shoulderW;
    const needMarginNegV = Math.max(-estVScrewBase + estWall, -estVScrewTop + estWall + estTaper) + shoulderW;
    const curPosU = mCu + mHalfBl;
    const curNegU = -mCu + mHalfBl;
    const curPosV = mCv + mHalfMd;
    const curNegV = -mCv + mHalfMd;
    const nextPosU = Math.max(curPosU, Math.min(maxAnatHalfBl + 1.05, needMarginPosU));
    const nextNegU = Math.max(curNegU, Math.min(maxAnatHalfBl + 1.05, needMarginNegU));
    const nextPosV = Math.max(curPosV, Math.min(maxAnatHalfMd + 1.05, needMarginPosV));
    const nextNegV = Math.max(curNegV, Math.min(maxAnatHalfMd + 1.05, needMarginNegV));
    mCu = clamp((nextPosU - nextNegU) * 0.5, -1.15, 1.15);
    mHalfBl = clamp((nextPosU + nextNegU) * 0.5, minMarginRadius + 0.08, maxAnatHalfBl + 0.45);
    mCv = clamp((nextPosV - nextNegV) * 0.5, -1.15, 1.15);
    mHalfMd = clamp((nextPosV + nextNegV) * 0.5, minMarginRadius + 0.08, maxAnatHalfMd + 0.45);
  }

  const marginCap: number[] = [];
  const marginPlaneCap: number[] = [];
  const colDuFix: number[] = [];
  const colDvFix: number[] = [];
  const colProjScale: number[] = [];
  for (let col = 0; col < ANGULAR_COLS; col += 1) {
    const theta = (col / ANGULAR_COLS) * Math.PI * 2;
    const localMarginZ = evalPeriodicLinear(smoothMarginZ, theta);
    const radialFix: Vec3 = [Math.cos(theta), Math.sin(theta), 0];
    const proj = sub3(radialFix, scale3(frame.w, dot3(radialFix, frame.w)));
    const projLen = Math.max(0.25, Math.hypot(...proj));
    const dirInFrame = scale3(proj, 1 / projLen);
    const du = dot3(dirInFrame, frame.uLabial);
    const dv = dot3(dirInFrame, frame.vSide);
    const phiInFrame = Math.atan2(dv, du);
    colDuFix.push(du);
    colDvFix.push(dv);
    colProjScale.push(projLen);

    const cuffHardMaxR = coneTopR + Math.max(2.15, localMarginZ - coneTopZ) * maxFlareSlope;
    const limPlane = planeLimitAt(dirInFrame, localMarginZ - meanMarginZ);
    // 인접 픽스쳐와 간격이 넓으면 0.9mm 반유격(양쪽 합 1.8mm)을 두고, 픽스쳐가 바짝 붙어 있어도
    // 최소 물리 유격(반유격 0.31mm, 양쪽 합 ≥ 0.62mm > 0.5mm)은 절대 침범하지 않아 정체결 간섭을 원천 차단한다.
    let planeMarginCap = Infinity;
    if (Number.isFinite(limPlane)) {
      const minPairGapHalf = MIN_NEIGHBOR_MARGIN_PAIR_GAP_MM * 0.5;
      const hardPhysicalCap = Math.max(boreTopR + 0.34, limPlane - minPairGapHalf);
      const softPhysicalCap = Math.max(minMarginRadius * projLen, limPlane - NEIGHBOR_PLANE_MARGIN_GAP_MM);
      planeMarginCap = Math.min(hardPhysicalCap, softPhysicalCap);
    }
    marginPlaneCap.push(planeMarginCap);
    const otherCap = Math.max(
      minMarginRadius * projLen,
      Math.min(adjacentMarginCapAt(phiInFrame), cuffHardMaxR * projLen),
    );
    marginCap.push(Math.min(planeMarginCap, otherCap));
  }

  // 4방위 유격(협·설·근·원심)을 먼저 재서 중심(mCu, mCv)을 여유 있는 쪽으로 옮기고 양쪽 반축을 대칭으로 맞춘다.
  {
    const minPhysicalHalf = Math.min(
      minMarginRadius,
      Math.max(boreTopR + 0.36, Math.min(...marginPlaneCap) - 0.02),
    );
    const dirCap = (targetDu: number, targetDv: number) => {
      let best = Infinity;
      for (let col = 0; col < ANGULAR_COLS; col += 1) {
        if (colDuFix[col]! * targetDu + colDvFix[col]! * targetDv >= Math.cos(20 * DEG)) {
          best = Math.min(best, marginCap[col]!);
        }
      }
      return best;
    };
    const capPosU = dirCap(1, 0);
    const capNegU = dirCap(-1, 0);
    const capPosV = dirCap(0, 1);
    const capNegV = dirCap(0, -1);
    const fitAxis1D = (curC: number, curHalf: number, capPos: number, capNeg: number) => {
      const availSpan = capPos + capNeg;
      if (availSpan < minPhysicalHalf * 1.6) {
        const mid = Number.isFinite(availSpan) ? (capPos - capNeg) * 0.5 : curC;
        return { c: clamp(mid, -0.85, 0.85), half: Math.max(minPhysicalHalf, availSpan * 0.5) };
      }
      // 한쪽(예: 인접 임플란트 경계 capNeg)만 좁고 반대쪽(무치악·자연치 유격 capPos)이 여유 있으면
      // 맞닿는 쪽은 경계면에서 띄우고 열린 반대쪽으로 중심을 최대 ±0.95mm 옮겨 정체결 유격(≥0.5mm)과 포스트 면적을 함께 지킨다.
      const wantHalf = Math.max(minPhysicalHalf, Math.min(curHalf, availSpan * 0.5));
      const cMinOuter = Number.isFinite(capNeg) ? -capNeg + wantHalf : -1.15;
      const cMaxOuter = Number.isFinite(capPos) ? capPos - wantHalf : 1.15;
      const innerFloor = Math.min(minMarginRadius * 0.96, Math.max(boreTopR + 0.34, wantHalf - 0.95));
      const innerSpan = Math.max(0, wantHalf - innerFloor);
      const cMin = Math.max(-1.15, cMinOuter, -innerSpan);
      const cMax = Math.min(1.15, cMaxOuter, innerSpan);
      const nextC = clamp(
        cMin <= cMax ? clamp(curC, cMin, cMax) : (cMin + cMax) * 0.5,
        -1.15,
        1.15,
      );
      const nextHalf = Math.max(
        minPhysicalHalf,
        Math.min(wantHalf, capPos - nextC, nextC + capNeg),
      );
      return { c: nextC, half: nextHalf };
    };
    const fitU = fitAxis1D(mCu, mHalfBl, capPosU, capNegU);
    const fitV = fitAxis1D(mCv, mHalfMd, capPosV, capNegV);
    mCu = fitU.c;
    mHalfBl = fitU.half;
    mCv = fitV.c;
    mHalfMd = fitV.half;

    // 대각선 등 모든 열에서 marginCap 안쪽에 완전히 들어오도록 사각형/타원 반축과 중심을 비례 조정한다(모서리 깎기 금지 → 볼록 곡선 유지).
    for (let iter = 0; iter < 16; iter += 1) {
      const innerFloor = Math.min(minMarginRadius * 0.94, Math.max(boreTopR + 0.34, Math.min(mHalfBl, mHalfMd) - 0.95));
      const innerAllow = Math.max(0.12, Math.min(mHalfBl, mHalfMd) - innerFloor + 0.04);
      const maxShift = Math.max(0.12, Math.min(Math.min(mHalfBl, mHalfMd) * 0.68, innerAllow));
      if (Math.hypot(mCu, mCv) > maxShift) {
        const sc = maxShift / Math.hypot(mCu, mCv);
        mCu *= sc;
        mCv *= sc;
      }
      let worstExcess = 0;
      let worstWBl = 0.5;
      let worstDu = 0;
      let worstDv = 0;
      let worstCol = -1;
      for (let col = 0; col < ANGULAR_COLS; col += 1) {
        const cap = marginCap[col]!;
        if (!Number.isFinite(cap)) continue;
        const rRay = analyticSectionRay(
          tpl.kind,
          "margin",
          mHalfBl,
          mHalfBl,
          mHalfMd,
          mCu,
          mCv,
          colDuFix[col]!,
          colDvFix[col]!,
        );
        if (Number.isFinite(rRay) && rRay > cap + 1e-4) {
          const ex = (rRay - cap) / Math.max(rRay, 0.5);
          if (ex > worstExcess) {
            worstExcess = ex;
            worstWBl = colDuFix[col]! * colDuFix[col]!;
            worstDu = colDuFix[col]!;
            worstDv = colDvFix[col]!;
            worstCol = col;
          }
        }
      }
      if (worstExcess <= 1e-4) break;
      // 한쪽 인접 픽스쳐 경계에 걸리고 반대쪽에 여유가 남아 있으면 먼저 중심을 반대쪽으로 밀어 양쪽 합 유격(≥0.62mm)을 만든다.
      if (worstCol >= 0) {
        const oppCol = (worstCol + ANGULAR_COLS / 2) % ANGULAR_COLS;
        const rOpp = analyticSectionRay(
          tpl.kind,
          "margin",
          mHalfBl,
          mHalfBl,
          mHalfMd,
          mCu,
          mCv,
          colDuFix[oppCol]!,
          colDvFix[oppCol]!,
        );
        const oppSlack = Number.isFinite(rOpp)
          ? Math.min(marginCap[oppCol]! - rOpp, rOpp - innerFloor)
          : 0;
        if (oppSlack > 0.02) {
          const rawExMm = worstExcess * Math.max(mHalfBl, mHalfMd);
          const shift = Math.min(oppSlack * 0.65, rawExMm * 0.65, 0.16);
          mCu -= worstDu * shift;
          mCv -= worstDv * shift;
        }
      }
      const hasTightPlane = Number.isFinite(Math.min(...marginPlaneCap)) && Math.min(...marginPlaneCap) < minMarginRadius + 0.45;
      const dropBl = worstExcess * (hasTightPlane ? 0.18 + 0.82 * worstWBl : 0.35 + 0.65 * worstWBl) + 0.004;
      const dropMd = worstExcess * (hasTightPlane ? 0.18 + 0.82 * (1 - worstWBl) : 0.35 + 0.65 * (1 - worstWBl)) + 0.004;
      mHalfBl = Math.max(minPhysicalHalf, mHalfBl * (1 - dropBl));
      mHalfMd = Math.max(minPhysicalHalf, mHalfMd * (1 - dropMd));
      const minAspectRatio = hasTightPlane ? 0.68 : 0.82;
      const minBlByRatio = mHalfMd * targetMarginAspect * minAspectRatio;
      const minMdByRatio = (mHalfBl / Math.max(targetMarginAspect, 0.4)) * minAspectRatio;
      if (mHalfBl < minBlByRatio) mHalfMd = Math.max(minPhysicalHalf, mHalfBl / (targetMarginAspect * minAspectRatio));
      if (mHalfMd < minMdByRatio) mHalfBl = Math.max(minPhysicalHalf, mHalfMd * targetMarginAspect * minAspectRatio);
    }
  }

  const minSolveMarginR = Math.min(
    minMarginRadius,
    Math.max(boreTopR + 0.34, Math.min(...marginPlaneCap) - 0.03),
  );
  const solveMarginRadii = (zLoop: readonly number[], zRef: number) =>
    Array.from({ length: ANGULAR_COLS }, (_, col) => {
      const theta = (col / ANGULAR_COLS) * Math.PI * 2;
      const ct = Math.cos(theta);
      const st = Math.sin(theta);
      const radialFix: Vec3 = [ct, st, 0];
      const dz0 = evalPeriodicLinear(zLoop, theta) - zRef;
      // 마진 점 [rFix*ct, rFix*st, zMargin]을 삽입축 평면(uLabial, vSide)에 실제로 정사영했을 때
      // (u(rFix), v(rFix))가 해석 해부 단면 위에 정확히 놓이는 rFix를 직접 푼다.
      // 경사진 전치 삽입축(15~28°)에서 dz0 * uLabial[2] 수직 이동항을 빼먹으면 설측 마진이 불룩 튀어나오므로 정사영 방정식을 그대로 푼다.
      const u0Off = dz0 * frame.uLabial[2];
      const v0Off = dz0 * frame.vSide[2];
      const gu = dot3(radialFix, frame.uLabial);
      const gv = dot3(radialFix, frame.vSide);
      const evalMarginNorm = (rFix: number) => {
        const u = u0Off + rFix * gu - mCu;
        const v = v0Off + rFix * gv - mCv;
        const len = Math.hypot(u, v);
        if (len < 1e-7) return 0;
        const phi = Math.atan2(v, u);
        const secR = toothSectionRadius(tpl.kind, "margin", Math.max(0.35, mHalfBl), Math.max(0.35, mHalfMd), phi);
        return len / Math.max(secR, 1e-4);
      };
      if (evalMarginNorm(minSolveMarginR) >= 1) return minSolveMarginR;
      let lo = minSolveMarginR;
      let hi = minSolveMarginR + Math.max(mHalfBl, mHalfMd) * 2.2;
      while (evalMarginNorm(hi) < 1 && hi < 12) hi *= 1.4;
      for (let it = 0; it < 16; it += 1) {
        const mid = (lo + hi) * 0.5;
        if (evalMarginNorm(mid) < 1) lo = mid;
        else hi = mid;
      }
      return Math.max(minSolveMarginR, (lo + hi) * 0.5);
    });

  let marginRadii = solveMarginRadii(smoothMarginZ, meanMarginZ);

  // 마진 반경(marginRadii)과 예측 크라운 치경부 출현 윤곽이 확정된 뒤, 실제 치은 라인(출현 소켓 테두리·치간유두 능선)을 따라
  // 협·설측은 치은 하방(params.marginDepthMm)으로 내리고 근·원심은 치관 쪽으로 올라가는 스캘럽 마진을 잡는다.
  {
    const CREST_BIN_MM = 0.35;
    const CREST_BINS = 6;
    const sectorRStart = new Array<number>(SECTORS);
    const sectorREnd = new Array<number>(SECTORS);
    const sectorCLab = new Array<number>(SECTORS);
    const sectorSMes = new Array<number>(SECTORS);
    const sectorRetromolar = new Array<boolean>(SECTORS);
    for (let b = 0; b < SECTORS; b += 1) {
      const theta = ((b + 0.5) / SECTORS) * Math.PI * 2;
      const ct = Math.cos(theta);
      const st = Math.sin(theta);
      const cLab = ct * labXY[0] + st * labXY[1];
      const sMes = ct * mesXY[0] + st * mesXY[1];
      const proxW = sMes * sMes;
      const isRetromolar = hasDistalRetromolarPad && sMes < -0.35;
      const rM = evalPeriodicLinear(marginRadii, theta);
      const colIdx = Math.floor(((b + 0.5) / SECTORS) * ANGULAR_COLS) % ANGULAR_COLS;
      const tCrown = analyticSectionRay(
        tpl.kind,
        "crown",
        natHalfBl,
        natHalfBl,
        crownHalfMd,
        crownCenterU,
        crownCenterV * crownSideSign,
        colDuFix[colIdx]!,
        colDvFix[colIdx]!,
      );
      const rCrownFix = Number.isFinite(tCrown)
        ? tCrown / Math.max(0.35, colProjScale[colIdx]!)
        : rM + 1.0;
      const rProxEnd = Math.max(rM + 0.55, Math.min(rM + 1.25, rM * 0.4 + rCrownFix * 0.6));
      sectorCLab[b] = cLab;
      sectorSMes[b] = sMes;
      sectorRetromolar[b] = isRetromolar;
      sectorRStart[b] = Math.max(sbR + 0.22, rM - 0.32);
      sectorREnd[b] = isRetromolar ? rM + 0.35 : (rM + 0.5) * (1 - proxW) + rProxEnd * proxW;
    }

    const atMarginBuckets: number[][] = Array.from({ length: SECTORS }, () => []);
    const crestBins: number[][][] = Array.from({ length: SECTORS }, () =>
      Array.from({ length: CREST_BINS }, () => [] as number[]),
    );
    const zScanCap = medianRimZ + (posterior ? 2.7 : 3.5);
    for (let i = 0; i < jawLocalPts.length; i += 3) {
      const x = jawLocalPts[i]!;
      const y = jawLocalPts[i + 1]!;
      const z = jawLocalPts[i + 2]!;
      if (z < 0.8 || z > sbH - 0.15 || z > zScanCap) continue;
      const theta = wrapAngle(Math.atan2(y, x));
      const b = Math.min(SECTORS - 1, Math.floor((theta / (Math.PI * 2)) * SECTORS));
      const r = Math.hypot(x, y);
      const rStart = sectorRStart[b]!;
      if (r < rStart) continue;
      const rM = evalPeriodicLinear(marginRadii, theta);
      if (r <= rM + 0.32 && z <= rawGingivaZ[b]! + 2.3) {
        atMarginBuckets[b]!.push(z);
      }
      if (r <= sectorREnd[b]!) {
        const bi = Math.min(CREST_BINS - 1, Math.max(0, Math.floor((r - rStart) / CREST_BIN_MM)));
        crestBins[b]![bi]!.push(z);
      }
    }

    const fillMissingCircular = (arr: number[], fallback: readonly number[]) => {
      for (let b = 0; b < SECTORS; b += 1) {
        if (Number.isFinite(arr[b]!)) continue;
        let prev = fallback[b]!;
        let next = fallback[b]!;
        let dPrev = SECTORS;
        let dNext = SECTORS;
        for (let step = 1; step < SECTORS; step += 1) {
          const lp = arr[(b - step + SECTORS) % SECTORS]!;
          if (dPrev === SECTORS && Number.isFinite(lp)) {
            prev = lp;
            dPrev = step;
          }
          const rn = arr[(b + step) % SECTORS]!;
          if (dNext === SECTORS && Number.isFinite(rn)) {
            next = rn;
            dNext = step;
          }
          if (dPrev < SECTORS && dNext < SECTORS) break;
        }
        arr[b] =
          dPrev < SECTORS || dNext < SECTORS
            ? (prev * dNext + next * dPrev) / Math.max(dPrev + dNext, 1)
            : fallback[b]!;
      }
    };

    const gingAtM = atMarginBuckets.map((list) => {
      if (list.length < 3) return Number.NaN;
      list.sort((a, c) => a - c);
      return list[Math.floor(list.length * 0.52)]!;
    });
    fillMissingCircular(gingAtM, rimLow);

    const gingCrestRaw = crestBins.map((bins, b) => {
      const cLab = sectorCLab[b]!;
      let crest = Number.NaN;
      let prev = Number.NaN;
      for (const list of bins) {
        if (list.length < 3) continue;
        list.sort((a, c) => a - c);
        const m = list[Math.floor(list.length * 0.55)]!;
        // 반경 0.35mm 안에 0.92mm 넘게 치솟으면 치은이 아니라 인접 자연치 법랑질 벽이므로 직전에서 멈춘다.
        if (Number.isFinite(prev) && m - prev > 0.92) break;
        // 순·협측에서 치은정 능선을 넘어 바깥 치조점막으로 꺾여 내려가면 능선 꼭대기를 치은 라인으로 잡는다.
        if (cLab > 0.35 && Number.isFinite(crest) && m < crest - 0.18) break;
        crest = Number.isFinite(crest) ? Math.max(crest, m) : m;
        prev = m;
      }
      return crest;
    });
    fillMissingCircular(gingCrestRaw, gingAtM);

    const gingSmooth = lowPassCircular(gingCrestRaw, 3);
    // 협·설 치은정(cLab² 가중)을 잇는 기준선을 구해 임플란트 협설 경사와 무관하게 근·원심 치간유두 상승량을 분리한다.
    let flWSum = 0;
    let flMeanNum = 0;
    let flW2Sum = 0;
    let flSlopeNum = 0;
    for (let b = 0; b < SECTORS; b += 1) {
      const cLab = sectorCLab[b]!;
      const w = cLab * cLab;
      flWSum += w;
      flMeanNum += w * gingSmooth[b]!;
      flW2Sum += w * cLab * cLab;
      flSlopeNum += w * cLab * gingSmooth[b]!;
    }
    const flMean = flMeanNum / Math.max(flWSum, 1e-4);
    const flSlope = flSlopeNum / Math.max(flW2Sum, 1e-4);

    const defaultScallop = posterior ? 0.55 : 0.75;
    const scallopRatio = clamp(params.marginScallopMm / defaultScallop, 0, 2.4);
    const followScale = scallopRatio <= 1 ? scallopRatio : 1 + (scallopRatio - 1) * 0.25;
    const proxDepthRelief = Math.min(params.marginDepthMm * 0.62, params.marginScallopMm * 0.55);
    const extraUserProxLift = Math.max(0, params.marginScallopMm - defaultScallop) * 0.55;

    const baseMaxSpan = tpl.kind === "molar" ? 1.45 : tpl.kind === "premolar" ? 1.75 : 2.35;

    const draftZ = gingSmooth.map((gCrest, b) => {
      const cLab = sectorCLab[b]!;
      const sMes = sectorSMes[b]!;
      const proxW = sMes * sMes;
      const facialW = Math.max(0, cLab) ** 2;
      const isRetromolar = sectorRetromolar[b]!;
      const flBase = flMean + flSlope * cLab;
      const gingRise = clamp(
        gCrest - flBase,
        -0.55,
        isRetromolar ? 0.75 : baseMaxSpan,
      );
      const naturalLift = gingRise * followScale + proxDepthRelief * proxW;
      const minScallopLift =
        (isRetromolar ? Math.min(0.45, params.marginScallopMm * 0.65) : params.marginScallopMm * 0.92) *
        proxW;
      const coronalLift =
        params.marginScallopMm <= 0.02
          ? gingRise * scallopRatio
          : Math.max(naturalLift, minScallopLift);
      const zFl = flBase - params.marginDepthMm;
      const maxSpanAboveFl = (isRetromolar ? 0.95 : baseMaxSpan) + extraUserProxLift * proxW;
      const highCap = Math.min(maxMarginZ, zFl + maxSpanAboveFl);

      // 치은 상방 노출 방지: 협측은 마진 반경 직상방 치은(gingAtM) 아래로 감추고, 근·원심은 치간유두 치은 라인 바로 아래까지 따라 올라간다.
      const crestSubgMin =
        Math.min(0.38, params.marginDepthMm * 0.82) * (1 - proxW) +
        Math.min(0.28, params.marginDepthMm * 0.45) * proxW;
      const crestCeil = gCrest - crestSubgMin + extraUserProxLift * proxW;
      const facialSurfaceCeil = gingAtM[b]! - Math.min(0.32, params.marginDepthMm * 0.72);
      const ceilZ =
        facialW > 0.15
          ? Math.min(highCap, crestCeil * (1 - facialW * 0.75) + Math.min(crestCeil, facialSurfaceCeil) * (facialW * 0.75))
          : Math.min(highCap, crestCeil);
      return clamp(Math.min(zFl + coronalLift, ceilZ), minMarginZ, highCap);
    });

    const pass1 = lowPassCircular(draftZ, 3).map((mz, b) => {
      const cLab = sectorCLab[b]!;
      const sMes = sectorSMes[b]!;
      const proxW = sMes * sMes;
      const facialW = Math.max(0, cLab) ** 2;
      const flBase = flMean + flSlope * cLab;
      const maxSpanAboveFl = (sectorRetromolar[b] ? 0.95 : baseMaxSpan) + extraUserProxLift * proxW;
      const highCap = Math.min(maxMarginZ, flBase - params.marginDepthMm + maxSpanAboveFl);
      const facialGuard =
        facialW > 0.25 && params.marginDepthMm > 0.05
          ? gingAtM[b]! - Math.min(0.28, params.marginDepthMm * 0.65) * facialW
          : Infinity;
      return clamp(Math.min(mz, facialGuard), minMarginZ, highCap);
    });
    smoothMarginZ = lowPassCircular(pass1, 3).map((z) => clamp(z, minMarginZ, maxMarginZ));
    // 픽스쳐가 깊게 식립되어 커프를 줄이고 포스트를 늘릴 수 있는 경우, 치은 하방 0.5~1.0mm 규정보다 우선해
    // 포스트 높이(기준 평균 마진 → 포스트 상단)가 4.5mm 이상이 되도록 치은 하방 최대 2.0mm까지 마진을 낮춘다.
    // 협측이 이미 치은 하방 2.0mm에 닿았으면 스캘럽으로 높게 올라간 근·원심 마진도 치은 하방 2.0mm 한도 안에서 추가로 낮춰 평균 포스트 높이를 채운다.
    if (params.postHeightOffsetMm >= -0.05) {
      const axialCosM = Math.max(frame.w[2], 0.2);
      const subgLine = gingSmooth.map((gc, b) => Math.min(gc, gingAtM[b]!));
      const wantMeanMarginZ = meanMarginZ + postTopH / axialCosM - (TARGET_RETENTION_POST_HEIGHT_MM + 0.2);
      for (let dropIt = 0; dropIt < 4; dropIt += 1) {
        const curMeanM = smoothMarginZ.reduce((s, v) => s + v, 0) / SECTORS;
        if (curMeanM <= wantMeanMarginZ + 1e-3) break;
        const needMeanDrop = curMeanM - wantMeanMarginZ;
        let slackSectors = 0;
        for (let b = 0; b < SECTORS; b += 1) {
          const floorB = Math.max(minMarginZ, subgLine[b]! - MARGIN_SUBG_MAX_MM);
          if (smoothMarginZ[b]! > floorB + 0.03) slackSectors += 1;
        }
        if (slackSectors === 0) break;
        const stepDrop = Math.min(2.4, (needMeanDrop * SECTORS) / Math.max(slackSectors, 4) + 0.04);
        const shifted = smoothMarginZ.map((mz, b) => {
          const maxSubgFloor = Math.max(minMarginZ, subgLine[b]! - MARGIN_SUBG_MAX_MM);
          return Math.max(minMarginZ, Math.min(mz, Math.max(maxSubgFloor, mz - stepDrop)));
        });
        smoothMarginZ = lowPassCircular(shifted, 3).map((mz, b) => {
          const maxSubgFloor = Math.max(minMarginZ, subgLine[b]! - MARGIN_SUBG_MAX_MM);
          return clamp(Math.max(maxSubgFloor, mz), minMarginZ, maxMarginZ);
        });
      }
    }
    marginRadii = solveMarginRadii(smoothMarginZ, meanMarginZ);
  }
  const finalMeanMarginZ = smoothMarginZ.reduce((s, v) => s + v, 0) / SECTORS;
  // 포스트 굵기(postWidthScale) 보정도 편심 곱셈 대신 둘레 등폭 오프셋으로 환산해 협·설·근·원 마진 폭을 균일하게 지킨다.
  const rawMeanPostHalf = Math.max(0.85, (mHalfBl + mHalfMd) * 0.5 - shoulderW);
  const targetShoulderW = clamp(
    shoulderW + rawMeanPostHalf * (1 - params.postWidthScale),
    0.18,
    1.1,
  );
  chamfer = chamferGeometry(targetShoulderW, R, taperSlope);

  const initMarginHalfBl = mHalfBl;
  const initMarginHalfMd = mHalfMd;
  const initMarginCu = mCu;
  const initMarginCv = mCv;
  const initMarginRadii = [...marginRadii];

  const syncColsMarginGeometry = () => {
    for (let col = 0; col < ANGULAR_COLS; col += 1) {
      const theta = (col / ANGULAR_COLS) * Math.PI * 2;
      const rMargin = marginRadii[col]!;
      const zMargin = evalPeriodicLinear(smoothMarginZ, theta);
      const marginPt: Vec3 = [rMargin * Math.cos(theta), rMargin * Math.sin(theta), zMargin];
      const relM = sub3(marginPt, c0);
      const h0 = dot3(relM, frame.w);
      const radial = sub3(relM, scale3(frame.w, h0));
      const r0 = Math.hypot(...radial);
      const dir = scale3(radial, 1 / Math.max(r0, 1e-6));
      const c = cols[col]!;
      c.marginPt = marginPt;
      c.h0 = h0;
      c.r0 = r0;
      c.dir = dir;
      c.phi = Math.atan2(dot3(dir, frame.vSide), dot3(dir, frame.uLabial));
    }
  };
  for (let iter = 0; iter < 12; iter += 1) {
    let short = 0;
    for (let col = 0; col < ANGULAR_COLS; col += 4) {
      const t = analyticSectionRay(
        tpl.kind,
        "crown",
        natHalfBl,
        natHalfBl,
        crownHalfMd,
        crownCenterU,
        crownCenterV * crownSideSign,
        colDuFix[col]!,
        colDvFix[col]!,
      );
      const need = marginRadii[col]! * colProjScale[col]! - targetShoulderW + params.minCrownThicknessMm;
      short = Math.max(short, Number.isFinite(t) ? need - t : Infinity);
    }
    if (short <= 0.02) break;
    crownCenterU *= 0.82;
    crownCenterV *= 0.82;
  }

  for (let col = 0; col < ANGULAR_COLS; col += 1) {
    const theta = (col / ANGULAR_COLS) * Math.PI * 2;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const rMargin = marginRadii[col]!;
    const zMargin = evalPeriodicLinear(smoothMarginZ, theta);
    const marginPt: Vec3 = [rMargin * ct, rMargin * st, zMargin];

    const relM = sub3(marginPt, c0);
    const h0 = dot3(relM, frame.w);
    const radial = sub3(relM, scale3(frame.w, h0));
    const r0 = Math.hypot(...radial);
    const dir = scale3(radial, 1 / Math.max(r0, 1e-6));
    const phi = Math.atan2(dot3(dir, frame.vSide), dot3(dir, frame.uLabial));
    const cLab = Math.cos(phi);

    const topDrop = cLab < 0 ? tpl.lingualTopDropMm * -cLab : 0;
    let hTop = postTopH;
    const tipR = posterior
      ? Math.max(0.6, r0 - targetShoulderW - 0.8)
      : cLab >= 0
        ? Math.min(1.15, Math.max(0.55, r0 - targetShoulderW - 0.6))
        : Math.min(0.85, Math.max(0.45, r0 - targetShoulderW - 1.0));
    const tu = dot3(dir, frame.uLabial) * tipR;
    const tv = dot3(dir, frame.vSide) * tipR;
    if (oppField) {
      const oppH = oppField.heightAt(tu, tv, 1.0);
      if (Number.isFinite(oppH)) {
        hTop = posterior ? Math.max(postTopH, oppH - clearance) : Math.min(hTop, oppH - clearance);
      }
    }
    hTop = Math.min(hTop, postTopMax) - topDrop;
    topRaw.push(hTop);

    const rBase0 = Math.max(0.75, r0 - targetShoulderW);
    const hBase = h0 + chamfer.height;
    const labBlend = smootherstep((cLab + 1) * 0.5);
    // 전치부: 상단에서 스크류 채널이 절단연 근처로 올라오는 경우(|uScrewEst| <= 0.7mm)에만 둘레 칼라를 넓히고,
    // 순측으로 12° 이상 경사진 식립을 구개측으로 꺾어 세운 경우(uScrewEst > 0.7mm, 기공소 디자인 남정헌 #13·#23, 정성윤 #22·#23)에는
    // 포스트 외형을 자연 타원으로 유지하고 스크류 홀은 설측 경사면으로 자연스럽게 열리게 둔다.
    const uScrewEst = ((hTop - topRoundMm) / Math.max(frame.w[2], 0.2)) * frame.uLabial[2];
    const vScrewEst = ((hTop - topRoundMm) / Math.max(frame.w[2], 0.2)) * frame.vSide[2];
    const collarBlend = !posterior
      ? 1 - smootherstep(clamp((Math.abs(uScrewEst) - 0.55) / 0.85, 0, 1))
      : 0;
    const antLabCollar = collarBlend * (Math.max(0, uScrewEst) + boreTopR + ANTERIOR_SCREW_WALL_MM);
    const antLinCollar = collarBlend * (Math.max(0, -uScrewEst) + boreTopR + ANTERIOR_SCREW_LINGUAL_WALL_MM);
    const antMdCollar = !posterior
      ? Math.min(2.1, Math.abs(vScrewEst) * 0.5 + boreTopR + ANTERIOR_SCREW_WALL_MM) * Math.max(0.55, collarBlend)
      : 0;
    const effLabHalf = Math.max(tpl.topLabialHalfMm * blScale * params.postWidthScale, antLabCollar);
    const effLinHalf = Math.max(tpl.topLingualHalfMm * blScale * params.postWidthScale, antLinCollar);
    const effTopB = Math.max(topB, antMdCollar);
    const topA = effLinHalf + (effLabHalf - effLinHalf) * labBlend;
    const rTpl = toothOcclusalSectionRadius(tpl.kind, topA, effTopB, phi);
    const linW = smootherstep(clamp((-cLab + 0.05) / 0.85, 0, 1));
    const plan: ColumnPlan = {
      marginPt,
      dir,
      phi,
      h0,
      r0,
      hTop,
      tipU: tu,
      tipV: tv,
      // 소·대구치와 전치부 모두 숄더 끝에서 윗면 라운드 시작까지 중간 단차 없는 일직선 모선(ruled surface)으로 올라간다.
      // 짧은 전치 포스트(<5.8mm)에서는 순·근원심 유지벽이 과도하게 좁아져 크라운이 빠지지 않도록 길이 비례로만 수렴한다.
      postDesired: (h: number) => {
        const straight = rBase0 - taperSlope * Math.max(0, h - hBase);
        if (posterior) return straight;
        const span = Math.max(0.5, plan.hTop - topRoundMm - hBase);
        const u = clamp((h - hBase) / span, 0, 1);
        const rStart = rBase0;
        const tallScale = smootherstep(clamp((postTopH - 4.4) / 2.2, 0, 1));
        const convergeW = Math.max(linW, tallScale * 0.85);
        const rKeep = rStart - taperSlope * span;
        const rEndTarget = rKeep - Math.max(0, rKeep - rTpl) * convergeW;
        return rStart - Math.max(0, rStart - rEndTarget) * u;
      },
      crownR: [],
      crownH: [],
      crownNat: [],
      crownTopOcc: tpl.crownOcclusalMm,
    };
    cols.push(plan);
  }

  const oppNear: Vec3[] = [];
  for (let i = 0; i < opposingLocalPts.length; i += 3) {
    const q: Vec3 = [opposingLocalPts[i]!, opposingLocalPts[i + 1]!, opposingLocalPts[i + 2]!];
    const rel = sub3(q, c0);
    const h = dot3(rel, frame.w);
    if (h < 2 || h > postTopMax + clearance + 3) continue;
    // 포스트 자체 수평 반경 + 여유(0.9mm) 안의 대합치만 본다. 인접치(#37 등) 상방으로 내려온 옆 치아 대합 교두에 걸려 내 포스트가 낮아지지 않게 한다.
    if (Math.hypot(dot3(rel, frame.uLabial), dot3(rel, frame.vSide)) > footR + 0.9) continue;
    oppNear.push(q);
  }
  const nearestOpp = (p: Vec3) => {
    const relP = sub3(p, c0);
    const pu = dot3(relP, frame.uLabial);
    const pv = dot3(relP, frame.vSide);
    let best = Infinity;
    for (const q of oppNear) {
      const relQ = sub3(q, c0);
      if (Math.hypot(dot3(relQ, frame.uLabial) - pu, dot3(relQ, frame.vSide) - pv) > 1.35) continue;
      const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      if (d < best) best = d;
    }
    return best;
  };
  let apexDrop = 0;

  /** 윗면 높이. 구치 교합면과 전치 절단연 모두 두 뿔·움푹 패임이 생기지 않도록 하나의 매끄러운 경사 평면으로 맞춘다. */
  const fitTopSurface = () => {
    let s1 = 0, su = 0, sv = 0, suu = 0, svv = 0, suv = 0, sh = 0, suh = 0, svh = 0;
    for (let col = 0; col < ANGULAR_COLS; col += 1) {
      const c = cols[col]!;
      const h = topRaw[col]!;
      s1 += 1; su += c.tipU; sv += c.tipV;
      suu += c.tipU * c.tipU; svv += c.tipV * c.tipV; suv += c.tipU * c.tipV;
      sh += h; suh += c.tipU * h; svh += c.tipV * h;
    }
    const mu = su / s1, mv = sv / s1, mh = sh / s1;
    const cuu = suu / s1 - mu * mu, cvv = svv / s1 - mv * mv, cuv = suv / s1 - mu * mv;
    const cuh = suh / s1 - mu * mh, cvh = svh / s1 - mv * mh;
    const det = cuu * cvv - cuv * cuv;
    let gu = det > 1e-9 ? (cuh * cvv - cvh * cuv) / det : 0;
    let gv = det > 1e-9 ? (cvh * cuu - cuh * cuv) / det : 0;
    if (posterior) {
      const g = Math.hypot(gu, gv);
      if (g > FLAT_TOP_MAX_TILT) {
        gu *= FLAT_TOP_MAX_TILT / g;
        gv *= FLAT_TOP_MAX_TILT / g;
      }
    } else {
      // 전치 절단연: 순측이 살짝 높고 설측으로 완만히 낮아지는 경사 평면, 근원심은 수평에 가깝게 유지(양옆 뿔·가운데 홈 방지).
      gu = clamp(gu, 0.04, Math.tan(13 * DEG));
      gv = clamp(gv, -Math.tan(6 * DEG), Math.tan(6 * DEG));
    }
    let a = Infinity;
    for (let col = 0; col < ANGULAR_COLS; col += 1) {
      const c = cols[col]!;
      a = Math.min(a, topRaw[col]! - gu * c.tipU - gv * c.tipV);
    }
    a -= apexDrop;
    const minPostWall = hasOpposing ? (posterior ? 1.15 : 1.4) : 2.2;
    const minTop = Math.max(...cols.map((c) => c.h0 + chamfer.height + minPostWall - gu * c.tipU - gv * c.tipV));
    a = Math.max(a, minTop);
    if (hasOpposing && Number.isFinite(oppRefH)) {
      a = Math.min(a, oppRefH - CROWN_THICKNESS_FLOOR_MM);
    }
    return { heightAt: (u: number, v: number) => a + gu * u + gv * v, center: a };
  };

  /** 피니시라인 위 오목 챔퍼 점(열마다 같은 개수). 폭 width·높이 height, 해당 열의 실제 축벽 기울기(endSlope)에 매끄럽게 접한다. */
  const chamferPoints = (
    r0: number,
    h0: number,
    width: number,
    height: number,
    endSlope = taperSlope,
  ) => {
    const th1 = clamp(Math.atan(Math.max(0, endSlope)), 0.5 * DEG, 38 * DEG);
    const ratio = width / Math.max(height, 1e-4);
    const ratioAt = (t0: number) => (Math.cos(th1) - Math.cos(t0)) / (Math.sin(t0) - Math.sin(th1));
    const pts: Array<[number, number]> = [];
    let th0 = Math.PI / 2;
    let flat = 0;
    if (ratio >= ratioAt(Math.PI / 2)) {
      flat = width - height * ratioAt(Math.PI / 2);
    } else {
      let lo = th1 + 1e-3;
      let hi = Math.PI / 2;
      for (let it = 0; it < 40; it += 1) {
        const mid = (lo + hi) / 2;
        if (ratioAt(mid) < ratio) lo = mid;
        else hi = mid;
      }
      th0 = (lo + hi) / 2;
    }
    const rho = height / Math.max(Math.sin(th0) - Math.sin(th1), 1e-4);
    const rs0 = r0 - flat;
    const cr = rs0 + rho * Math.cos(th0);
    const ch = h0 + rho * Math.sin(th0);
    const arcAt = (s: number): [number, number] => {
      const th = th0 + (th1 - th0) * s;
      return [cr - rho * Math.cos(th), ch - rho * Math.sin(th)];
    };
    pts.push(flat > 0.02 ? [rs0, h0] : arcAt(0.5 / CHAMFER_STEPS));
    for (let s = 1; s <= CHAMFER_STEPS; s += 1) pts.push(arcAt(s / CHAMFER_STEPS));
    return { pts, rho };
  };

  const buildShape = () => {
    mHalfBl = initMarginHalfBl;
    mHalfMd = initMarginHalfMd;
    mCu = initMarginCu;
    mCv = initMarginCv;
    marginRadii = [...initMarginRadii];
    syncColsMarginGeometry();
    const top = fitTopSurface();
    for (let col = 0; col < ANGULAR_COLS; col += 1) {
      const c = cols[col]!;
      c.hTop = top.heightAt(c.tipU, c.tipV);
      c.crownR = [];
      c.crownH = [];
      c.crownTopOcc = Number.isFinite(crownTopTarget)
        ? clamp(crownTopTarget - c.hTop, 0.6, CROWN_TOP_OCC_MAX_MM)
        : tpl.crownOcclusalMm;
    }
    const hPostBase = chamfer.height;

    // 예측 크라운: 원하는 포스트 + 축벽 두께, 인접면은 접촉까지. 이웃 크라운·인접치·대합치와 접촉량만 겹친다.
    for (const c of cols) {
      const sSide = Math.sin(c.phi);
      const cLab = Math.cos(c.phi);
      const faceThick = cLab >= 0 ? tpl.crownLabialMm : tpl.crownLingualMm;
      const sideThick = faceThick + 0.4;
      const thick = faceThick + (sideThick - faceThick) * sSide * sSide;
      c.crownNat = [];
      for (let k = 1; k <= CROWN_LEVELS; k += 1) {
        const h = c.h0 + ((c.hTop - c.h0) * k) / CROWN_LEVELS;
        const ramp = smootherstep((h - c.h0) / 1.8);
        const frac = clamp((h - c.h0) / (c.hTop - c.h0), 0, 1);
        const nat = naturalCrownR(c.dir, h, c.h0, c.r0, c.hTop + c.crownTopOcc);
        c.crownNat.push(nat);
        let r = Math.max(
          nat,
          c.postDesired(Math.max(h, c.h0 + hPostBase)) +
            Math.min(thick, params.minCrownThicknessMm + 0.2) * ramp +
            0.25 * ramp * Math.sin(Math.PI * frac),
        );
        let adjacentBound = planeLimitAt(c.dir, h) + contact / 2;
        const clipStartH =
          sideAllowanceOf(c.phi).wallMm > 0
            ? Math.max(1.8, Math.max(c.h0, 0) + 1.6)
            : Math.max(CONTACT_CLIP_MIN_ABOVE_MEAN_MM, Math.max(c.h0, 0) + CONTACT_CLIP_FROM_MM);
        if (h >= clipStartH) {
          const lim = adjacentScanCrownLimitAt(c.phi, h);
          if (Number.isFinite(lim)) {
            // 인접면(또는 브리지 커넥터 경계)은 1.4mm 안쪽이면 경계까지 넓혀 열린 접촉을 막는다.
            if (Math.abs(sSide) > 0.6 && lim > r && lim - r <= 1.4) r = lim;
            adjacentBound = Math.min(adjacentBound, lim);
          }
        }
        // 가상 치아 외형은 자신의 포스트 + 최소 두께보다 안쪽으로 꺼지지 않되, 인접치·인접 어벗 경계는 넘지 않는다.
        const postFloor = Math.min(
          adjacentBound,
          c.postDesired(Math.max(h, c.h0 + hPostBase)) + CROWN_THICKNESS_FLOOR_MM * ramp,
        );
        r = Math.max(
          postFloor,
          Math.min(r, adjacentBound, Math.max(nat, labialLimitAt(c.dir, h))),
        );
        c.crownH.push(h);
        c.crownR.push(r);
      }
      if (oppField) {
        const tu = dot3(c.dir, frame.uLabial) * Math.max(0.5, c.crownR[c.crownR.length - 1]! * 0.6);
        const tv = dot3(c.dir, frame.vSide) * Math.max(0.5, c.crownR[c.crownR.length - 1]! * 0.6);
        const oppH = oppField.heightAt(tu, tv, 1.0);
        if (Number.isFinite(oppH)) {
          c.crownTopOcc = clamp(
            Math.min(oppH + contact, crownTopTarget) - c.hTop,
            CROWN_THICKNESS_FLOOR_MM,
            CROWN_TOP_OCC_MAX_MM,
          );
        }
      }
    }
    for (let k = 0; k < CROWN_LEVELS; k += 1) {
      const want = cols.map((c) => c.crownR[k]!);
      const cap = cols.map((c) => {
        let lim = Math.min(
          planeLimitAt(c.dir, c.crownH[k]!) + contact / 2,
          Math.max(c.crownNat[k]!, labialLimitAt(c.dir, c.crownH[k]!)),
        );
        const clipStartH =
          sideAllowanceOf(c.phi).wallMm > 0
            ? Math.max(1.8, Math.max(c.h0, 0) + 1.6)
            : Math.max(CONTACT_CLIP_MIN_ABOVE_MEAN_MM, Math.max(c.h0, 0) + CONTACT_CLIP_FROM_MM);
        if (c.crownH[k]! >= clipStartH) {
          lim = Math.min(lim, adjacentScanCrownLimitAt(c.phi, c.crownH[k]!));
        }
        return lim;
      });
      const ring = smoothCircularReduce(smoothCircular(want, 2), cap, 2, 3);
      for (let col = 0; col < ANGULAR_COLS; col += 1) {
        const c = cols[col]!;
        const h = c.crownH[k]!;
        const ramp = smootherstep((h - c.h0) / 1.8);
        const postFloor = Math.min(
          cap[col]!,
          c.postDesired(Math.max(h, c.h0 + hPostBase)) + CROWN_THICKNESS_FLOOR_MM * ramp,
        );
        c.crownR[k] = Math.max(Math.min(c.r0 * 0.9, cap[col]!), postFloor, ring[col]!);
      }
    }
    const crownRadiusAt = (c: ColumnPlan, h: number) => {
      const f = ((h - c.h0) / (c.hTop - c.h0)) * CROWN_LEVELS;
      if (f <= 1) return c.r0 + (c.crownR[0]! - c.r0) * clamp(f, 0, 1);
      const i = Math.min(CROWN_LEVELS - 1, Math.floor(f));
      const t = clamp(f - i, 0, 1);
      return c.crownR[i - 1]! * (1 - t) + c.crownR[Math.min(i, CROWN_LEVELS - 1)]! * t;
    };

    // 포스트 단면(향기로운치과 기공소 STL 37건 기준):
    // 열마다 독립 클리핑하면 한쪽 귀퉁이만 깎여 사각형이 삼각형으로 변하므로,
    // 치종 해부 단면(대구치 n=3.20 둥근 모서리 사각형, 소구치 n=2.34 타원, 전치 순측 호 + 설측 경사면)의
    // 중심(pTopCu, pTopCv)과 반축만 크라운 내면 유격·스크류 채널 벽에 맞춰 100% 대칭 직선 모선(ruled surface)으로 세운다.
    const minPostR = 0.9;
    const postR: number[][] = [];
    const postH: number[][] = [];
    const floorR: number[][] = [];
    const capR: number[][] = [];
    const hardCapR: number[][] = [];
    let meanSpanSum = 0;
    let meanHBaseSum = 0;
    let meanRoundStartSum = 0;
    for (const c of cols) {
      const estRTop = Math.max(0.75, c.r0 - shoulderW - 0.35);
      const colEdgeTop = top.heightAt(
        dot3(c.dir, frame.uLabial) * estRTop,
        dot3(c.dir, frame.vSide) * estRTop,
      );
      const hBase = Math.min(c.h0 + hPostBase, Math.max(c.h0 + 0.06, colEdgeTop - 0.3));
      // 인접면이나 원심 마진이 높고 대합치가 가까운 짧은 포스트에서도 roundStart가 윗면 평면(colEdgeTop)을 절대 넘지 않게 고정한다.
      // 넘어가면 해당 열 모서리가 교합면 위로 각지게 툭 튀어나온다.
      const maxRoundStart = Math.max(hBase + 0.08, colEdgeTop - 0.1);
      const roundStart = Math.min(
        maxRoundStart,
        Math.max(hBase + 0.36, colEdgeTop - topRoundMm * 0.9),
      );
      meanHBaseSum += hBase / ANGULAR_COLS;
      meanRoundStartSum += roundStart / ANGULAR_COLS;
      meanSpanSum += Math.max(0.4, roundStart - hBase) / ANGULAR_COLS;
      const hs: number[] = [];
      const fs: number[] = [];
      const cs: number[] = [];
      const hc: number[] = [];
      for (let k = 0; k <= POST_LEVELS; k += 1) {
        const h = hBase + ((roundStart - hBase) * k) / POST_LEVELS;
        const rawScrewFloor = (h / Math.max(frame.w[2], 0.2)) * c.dir[2] + boreTopR + SCREW_WALL_MM;
        const screwFloor = posterior ? Math.max(minPostR, rawScrewFloor) : 0.75;
        let cap = Infinity;
        let hardCap = Infinity;
        if (h >= c.h0 + hPostBase + 0.25) {
          const crown = crownRadiusAt(c, h);
          const ramp = smootherstep((h - c.h0) / 1.8);
          const sideAllow = sideAllowanceOf(c.phi);
          const clipStartH =
            sideAllow.wallMm > 0
              ? Math.max(1.8, Math.max(c.h0, 0) + 1.6)
              : Math.max(CONTACT_CLIP_MIN_ABOVE_MEAN_MM, Math.max(c.h0, 0) + CONTACT_CLIP_FROM_MM);
          // 실제 스캔 인접치 표면(또는 인접 크라운 경계)에서도 지르코니아 두께 목표(≥1.0mm)와 하한(≥0.7mm)을 직접 지킨다.
          let adjSoftPostCap = Infinity;
          let adjHardPostCap = Infinity;
          if (h >= clipStartH) {
            const adjCrownLim = adjacentScanCrownLimitAt(c.phi, h);
            if (Number.isFinite(adjCrownLim)) {
              const adjSurface = sideAllow.wallMm <= 0 ? adjCrownLim - contact : adjCrownLim;
              adjSoftPostCap = Math.max(0.75, adjSurface - Math.max(CROWN_THICKNESS_FLOOR_MM, params.minCrownThicknessMm));
              adjHardPostCap = Math.max(0.72, adjSurface - CROWN_THICKNESS_FLOOR_MM);
            }
          }
          // 인접 픽스쳐 경계면 쪽은 볼록성을 해치지 않는 평면 한계(postPlaneLimitAt)로 별도 처리한다.
          // 특히 브리지로 연결된 이웃 어벗 경계(bridged=true)는 두 크라운 벽(1.0mm×2) 대신 커넥터 여유만 두어 포스트가 과도하게 뾰족해지지 않게 한다.
          const planePostSoft = postPlaneLimitAt(
            c.dir,
            h,
            0.48 * ramp,
            params.minCrownThicknessMm * ramp,
          );
          const planePostHard = postPlaneLimitAt(
            c.dir,
            h,
            0.35 * ramp,
            CROWN_THICKNESS_FLOOR_MM * ramp,
          );
          const hasNeighborPlane = Number.isFinite(planeLimitAt(c.dir, h));
          const hasBridgedPlane = planes.some(
            (pl) => pl.bridged && dot3(c.dir, pl.normal) > 0.35,
          );
          cap = hasBridgedPlane
            ? Math.min(planePostSoft, adjSoftPostCap)
            : Math.min(crown - params.minCrownThicknessMm * ramp, adjSoftPostCap);
          const nonPlaneHard = Math.min(crown - CROWN_THICKNESS_FLOOR_MM * ramp, adjHardPostCap);
          hardCap = hasNeighborPlane
            ? Math.max(Math.min(nonPlaneHard, planePostHard), Math.min(planePostHard, screwFloor))
            : nonPlaneHard;
          if (cap < screwFloor) cap = Math.max(cap, Math.min(screwFloor, hardCap));
        }
        hs.push(h);
        cs.push(cap);
        hc.push(hardCap);
        fs.push(Number.isFinite(hardCap) ? Math.min(screwFloor, hardCap) : screwFloor);
      }
      postH.push(hs);
      postR.push(new Array<number>(POST_LEVELS + 1).fill(0));
      floorR.push(fs);
      capR.push(cs);
      hardCapR.push(hc);
    }

    const colPostDu = cols.map((c) => dot3(c.dir, frame.uLabial));
    const colPostDv = cols.map((c) => dot3(c.dir, frame.vSide));
    const MIN_MARGIN_SHOULDER_MM = 0.16;
    const axialCos = Math.max(frame.w[2], 0.2);
    const screwReqR = boreTopR + SCREW_WALL_MM;
    const uScrewBase = (meanHBaseSum / axialCos) * frame.uLabial[2];
    const vScrewBase = (meanHBaseSum / axialCos) * frame.vSide[2];
    const uScrewTop = (meanRoundStartSum / axialCos) * frame.uLabial[2];
    const vScrewTop = (meanRoundStartSum / axialCos) * frame.vSide[2];
    // 마진 해부 단면의 4방위(+u 협/순, -u 설/구개, +v, -v) 외경과 포스트 치종 단면 단위 계수.
    // 별다른 간섭(스크류 홀 벽 부족·한쪽 크라운 공간 협소)이 없으면 4방위 모두 동일한 마진 폭(targetShoulderW)을 유지하고,
    // 제약이 걸리는 방위만 필요한 만큼 조정해 반대쪽 마진 폭이 좁아지지 않게 한다.
    const mExtPosU = mCu + mHalfBl;
    const mExtNegU = -mCu + mHalfBl;
    const mExtPosV = mCv + mHalfMd;
    const mExtNegV = -mCv + mHalfMd;
    const postUnitLab = toothSectionRadius(tpl.kind, "post", 1, 1, 0);
    const postUnitLin = toothSectionRadius(tpl.kind, "post", 1, 1, Math.PI);

    let pTopCu = mCu;
    let pTopCv = mCv;
    if (posterior) {
      // 구치부(특히 브리지 지대주)는 하단부터 상단까지 동일한 단면 중심(pSecCu, pSecCv)을 유지해 삽입축 평행(0.00°)을 보장한다.
      // 마진 중심(mCu, mCv)과 같은 중심·동일 마진 폭(targetShoulderW)에서 출발하고,
      // 스크류 홀 벽 두께(screwReqR)나 한쪽 크라운 두께 한도에 실제로 걸리는 방위만 필요한 만큼 이동한다.
      const maxStraightSlope = Math.tan(
        (mode.groupAxisWorld ? Math.min(2.8, effectiveTaperDeg + 0.4) : Math.min(3.8, effectiveTaperDeg + 1.0)) * DEG,
      );
      let taperDeltaBl = taperSlope * meanSpanSum;
      let taperDeltaMd = taperSlope * meanSpanSum;
      let uniformW = targetShoulderW;
      const extraW = { posU: 0, negU: 0, posV: 0, negV: 0 };
      const reliefW = { posU: 0, negU: 0, posV: 0, negV: 0 };

      let pSecCu = mCu;
      let pSecCv = mCv;
      let pBaseBl = Math.max(minPostR + 0.2, mHalfBl - targetShoulderW);
      let pBaseMd = Math.max(minPostR + 0.2, mHalfMd - targetShoulderW);

      const computeScrewMaxWidths = (tdBl: number, tdMd: number) => {
        const minPosU = Math.max(minPostR + 0.15, uScrewBase + screwReqR, uScrewTop + screwReqR + tdBl);
        const minNegU = Math.max(minPostR + 0.15, -uScrewBase + screwReqR, -uScrewTop + screwReqR + tdBl);
        const minPosV = Math.max(minPostR + 0.15, vScrewBase + screwReqR, vScrewTop + screwReqR + tdMd);
        const minNegV = Math.max(minPostR + 0.15, -vScrewBase + screwReqR, -vScrewTop + screwReqR + tdMd);
        return {
          posU: Math.max(MIN_MARGIN_SHOULDER_MM, mExtPosU - minPosU),
          negU: Math.max(MIN_MARGIN_SHOULDER_MM, mExtNegU - minNegU),
          posV: Math.max(MIN_MARGIN_SHOULDER_MM, mExtPosV - minPosV),
          negV: Math.max(MIN_MARGIN_SHOULDER_MM, mExtNegV - minNegV),
        };
      };

      const syncPosteriorSection = () => {
        const maxW = computeScrewMaxWidths(taperDeltaBl, taperDeltaMd);
        const maxInU = minPostR + 0.15 + taperDeltaBl * 0.5;
        const maxInV = minPostR + 0.15 + taperDeltaMd * 0.5;
        const wPosU = clamp(
          Math.min(uniformW + extraW.posU, maxW.posU) - reliefW.posU,
          MIN_MARGIN_SHOULDER_MM,
          Math.max(MIN_MARGIN_SHOULDER_MM, mExtPosU - maxInU),
        );
        const wNegU = clamp(
          Math.min(uniformW + extraW.negU, maxW.negU) - reliefW.negU,
          MIN_MARGIN_SHOULDER_MM,
          Math.max(MIN_MARGIN_SHOULDER_MM, mExtNegU - maxInU),
        );
        const wPosV = clamp(
          Math.min(uniformW + extraW.posV, maxW.posV) - reliefW.posV,
          MIN_MARGIN_SHOULDER_MM,
          Math.max(MIN_MARGIN_SHOULDER_MM, mExtPosV - maxInV),
        );
        const wNegV = clamp(
          Math.min(uniformW + extraW.negV, maxW.negV) - reliefW.negV,
          MIN_MARGIN_SHOULDER_MM,
          Math.max(MIN_MARGIN_SHOULDER_MM, mExtNegV - maxInV),
        );
        const pPosU = mExtPosU - wPosU;
        const pNegU = mExtNegU - wNegU;
        const pPosV = mExtPosV - wPosV;
        const pNegV = mExtNegV - wNegV;
        pSecCu = (pPosU - pNegU) * 0.5;
        pBaseBl = Math.max(minPostR + 0.2, (pPosU + pNegU) * 0.5);
        pSecCv = (pPosV - pNegV) * 0.5;
        pBaseMd = Math.max(minPostR + 0.2, (pPosV + pNegV) * 0.5);
        const pTopBl = Math.max(minPostR + 0.15, pBaseBl - taperDeltaBl);
        const pTopMd = Math.max(minPostR + 0.15, pBaseMd - taperDeltaMd);
        const normOrigin = Math.hypot(pSecCu / pTopBl, pSecCv / pTopMd);
        if (normOrigin > 0.84) {
          const sc = 0.84 / normOrigin;
          pSecCu *= sc;
          pSecCv *= sc;
        }
        return { maxW, pTopBl, pTopMd };
      };

      const checkLevels = [
        0,
        Math.round(POST_LEVELS * 0.45),
        Math.round(POST_LEVELS * 0.8),
        POST_LEVELS,
      ];
      for (let iter = 0; iter < 16; iter += 1) {
        const { maxW, pTopBl, pTopMd } = syncPosteriorSection();
        let worstEx = 0;
        let worstDu = 0;
        let worstDv = 0;
        let worstU = 1;
        let worstFloorDef = 0;
        let defDu = 0;
        let defDv = 0;
        const useSoftCap = iter < 10;
        for (const k of checkLevels) {
          const u = k / POST_LEVELS;
          const curBl = pBaseBl + (pTopBl - pBaseBl) * u;
          const curMd = pBaseMd + (pTopMd - pBaseMd) * u;
          for (let col = 0; col < ANGULAR_COLS; col += 1) {
            const du = colPostDu[col]!;
            const dv = colPostDv[col]!;
            const bound = useSoftCap
              ? Math.max(floorR[col]![k]!, Math.min(capR[col]![k]!, hardCapR[col]![k]!))
              : Math.max(floorR[col]![k]!, hardCapR[col]![k]!);
            const limitWithMargin =
              k === 0 ? Math.min(bound, cols[col]!.r0 - MIN_MARGIN_SHOULDER_MM) : bound;
            const rRay = analyticSectionRay(
              tpl.kind,
              "post",
              curBl / postUnitLab,
              curBl / postUnitLin,
              curMd,
              pSecCu,
              pSecCv,
              du,
              dv,
            );
            if (!Number.isFinite(rRay)) continue;
            if (Number.isFinite(limitWithMargin) && rRay > limitWithMargin + 1e-4) {
              const ex = rRay - limitWithMargin;
              if (ex > worstEx) {
                worstEx = ex;
                worstDu = du;
                worstDv = dv;
                worstU = u;
              }
            }
            const reqFloor = Math.min(floorR[col]![k]!, cols[col]!.r0 - MIN_MARGIN_SHOULDER_MM);
            if (rRay < reqFloor - 1e-4) {
              const def = reqFloor - rRay;
              if (def > worstFloorDef) {
                worstFloorDef = def;
                defDu = du;
                defDv = dv;
              }
            }
          }
        }
        if (worstEx <= 1e-3 && worstFloorDef <= 1e-3) break;
        if (worstFloorDef > 1e-3) {
          const wu = defDu * defDu;
          const wv = defDv * defDv;
          if (wu >= 0.05) {
            if (defDu >= 0) reliefW.posU += worstFloorDef * (0.35 + 0.65 * wu);
            else reliefW.negU += worstFloorDef * (0.35 + 0.65 * wu);
          }
          if (wv >= 0.05) {
            if (defDv >= 0) reliefW.posV += worstFloorDef * (0.35 + 0.65 * wv);
            else reliefW.negV += worstFloorDef * (0.35 + 0.65 * wv);
          }
        }
        if (worstEx > 1e-3) {
          let remEx = worstEx;
          if (worstU > 0.55 && !mode.groupAxisWorld) {
            const maxExtraBl = Math.max(0, maxStraightSlope * meanSpanSum - taperDeltaBl);
            const maxExtraMd = Math.max(0, maxStraightSlope * meanSpanSum - taperDeltaMd);
            const addTaper = Math.min(Math.min(maxExtraBl, maxExtraMd), remEx * 0.45);
            if (addTaper > 1e-4) {
              taperDeltaBl += addTaper;
              taperDeltaMd += addTaper;
              remEx = Math.max(0, remEx - addTaper * worstU);
            }
          }
          if (remEx > 1e-4) {
            // 작은 여유 부족(≤0.14mm)은 스크류 홀 여유가 충분한 동안 4방위 마진 폭을 함께 넓혀 균일성을 유지하고,
            // 한쪽만 크게 좁거나 다른 방위가 스크류 벽 한도에 닿으면 해당 방위 포스트만 안쪽으로 들인다.
            const minScrewMaxW = Math.min(maxW.posU, maxW.negU, maxW.posV, maxW.negV);
            const maxUniformW = Math.min(targetShoulderW + 0.14, minScrewMaxW - 0.02);
            if (uniformW < maxUniformW && Math.min(pTopBl, pTopMd) > minPostR + 0.45) {
              const uniStep = Math.min(remEx * 0.85, maxUniformW - uniformW);
              uniformW += uniStep;
              remEx = Math.max(0, remEx - uniStep);
            }
            if (remEx > 1e-4) {
              const wu = worstDu * worstDu;
              const wv = worstDv * worstDv;
              if (wu >= 0.06) {
                if (worstDu >= 0) extraW.posU += remEx * (0.35 + 0.55 * wu);
                else extraW.negU += remEx * (0.35 + 0.55 * wu);
              }
              if (wv >= 0.06) {
                if (worstDv >= 0) extraW.posV += remEx * (0.35 + 0.55 * wv);
                else extraW.negV += remEx * (0.35 + 0.55 * wv);
              }
            }
          }
        }
      }

      const { pTopBl: finalTopBl, pTopMd: finalTopMd } = syncPosteriorSection();
      // 열별 사후 clamp나 Math.max(floorR)로 해석 단면 한쪽만 오목하게 패이거나 부풀리면 가공 드릴 공구 R 때문에
      // 미삭제가 생기므로, 전체 단면이 100% 볼록한 순수 해석 곡선(analyticSectionRay)이 되도록
      // 마지막으로 반축만 미세 보정해 모든 열이 마진 숄더 안쪽과 스크류 홀 최소 벽 바깥에 놓이게 한다.
      let convexBaseBl = pBaseBl;
      let convexBaseMd = pBaseMd;
      let convexTopBl = finalTopBl;
      let convexTopMd = finalTopMd;
      for (let fixIt = 0; fixIt < 10; fixIt += 1) {
        let baseScaleDown = 1;
        let topScaleDown = 1;
        let topScaleUp = 1;
        for (let col = 0; col < ANGULAR_COLS; col += 1) {
          const c = cols[col]!;
          const du = colPostDu[col]!;
          const dv = colPostDv[col]!;
          const r0Ray = analyticSectionRay(
            tpl.kind,
            "post",
            convexBaseBl / postUnitLab,
            convexBaseBl / postUnitLin,
            convexBaseMd,
            pSecCu,
            pSecCv,
            du,
            dv,
          );
          const maxR0 = Math.max(0.85, c.r0 - MIN_MARGIN_SHOULDER_MM);
          if (Number.isFinite(r0Ray) && r0Ray > maxR0 + 1e-4) {
            baseScaleDown = Math.min(baseScaleDown, maxR0 / r0Ray);
          }
          const rTopRay = analyticSectionRay(
            tpl.kind,
            "post",
            convexTopBl / postUnitLab,
            convexTopBl / postUnitLin,
            convexTopMd,
            pSecCu,
            pSecCv,
            du,
            dv,
          );
          const tightScrewFloor =
            (postH[col]![POST_LEVELS]! / axialCos) * c.dir[2] + boreTopR + SCREW_WALL_TIGHT_MM;
          const adjScanTopHard = Number.isFinite(hardCapR[col]![POST_LEVELS]!)
            ? Math.max(Math.max(minPostR, tightScrewFloor), hardCapR[col]![POST_LEVELS]!)
            : Infinity;
          const maxRTop = Math.min(
            Number.isFinite(r0Ray) ? Math.min(r0Ray, maxR0) : maxR0,
            postPlaneLimitAt(c.dir, postH[col]![POST_LEVELS]!, 0.32, CROWN_THICKNESS_FLOOR_MM),
            adjScanTopHard,
          );
          if (Number.isFinite(rTopRay) && rTopRay > maxRTop + 1e-4) {
            topScaleDown = Math.min(topScaleDown, maxRTop / rTopRay);
          }
          const reqTop = Math.min(maxRTop - 0.01, Math.max(minPostR, tightScrewFloor));
          if (Number.isFinite(rTopRay) && rTopRay < reqTop - 1e-4 && rTopRay > 0.2) {
            topScaleUp = Math.max(topScaleUp, reqTop / rTopRay);
          }
        }
        if (baseScaleDown >= 0.9995 && topScaleDown >= 0.9995 && topScaleUp <= 1.0005) break;
        if (baseScaleDown < 0.9995) {
          convexBaseBl = Math.max(minPostR + 0.08, convexBaseBl * (baseScaleDown - 0.002));
          convexBaseMd = Math.max(minPostR + 0.08, convexBaseMd * (baseScaleDown - 0.002));
        }
        if (topScaleDown < 0.9995) {
          convexTopBl = Math.max(minPostR, convexTopBl * (topScaleDown - 0.002));
          convexTopMd = Math.max(minPostR, convexTopMd * (topScaleDown - 0.002));
        } else if (topScaleUp > 1.0005) {
          convexTopBl = Math.min(convexBaseBl - 0.02, convexTopBl * Math.min(1.06, topScaleUp + 0.002));
          convexTopMd = Math.min(convexBaseMd - 0.02, convexTopMd * Math.min(1.06, topScaleUp + 0.002));
        }
        convexTopBl = Math.min(convexTopBl, convexBaseBl - 0.02);
        convexTopMd = Math.min(convexTopMd, convexBaseMd - 0.02);
      }

      pTopCu = pSecCu;
      pTopCv = pSecCv;
      const minWallTaperSlope = Math.tan(Math.max(1.2, effectiveTaperDeg * 0.85) * DEG);
      // 스캘럽 마진에서 가장 낮은 열(min hBase)에 맞춘 마진 둥근 사각형을 열별 실제 hBase에서 평가할 때에도
      // 모든 열의 챔퍼 폭(c.r0 - postR[col][0])이 동일하게 유지되도록 포스트 기준 높이는 minHBase로 잡는다.
      let minPostHBase = Infinity;
      for (let col = 0; col < ANGULAR_COLS; col += 1) {
        minPostHBase = Math.min(minPostHBase, postH[col]![0]!);
      }
      const hRefBase = Number.isFinite(minPostHBase) ? minPostHBase : meanHBaseSum;
      const hRefTop = Math.max(hRefBase + 0.5, meanRoundStartSum);
      const hRefSpan = hRefTop - hRefBase;

      const uniformShoulder = clamp(uniformW, 0.22, Math.max(targetShoulderW, 0.85));
      let syncedBaseScale = 1;
      for (let col = 0; col < ANGULAR_COLS; col += 1) {
        const cap = marginCap[col]!;
        if (!Number.isFinite(cap)) continue;
        const rM = analyticSectionRay(
          tpl.kind,
          "margin",
          convexBaseBl + uniformShoulder,
          convexBaseBl + uniformShoulder,
          convexBaseMd + uniformShoulder,
          pSecCu,
          pSecCv,
          colDuFix[col]!,
          colDvFix[col]!,
        );
        if (Number.isFinite(rM) && rM > cap + 1e-4) {
          syncedBaseScale = Math.min(syncedBaseScale, cap / rM);
        }
      }
      const finalBaseBl = Math.max(minPostR + 0.08, convexBaseBl * syncedBaseScale);
      const finalBaseMd = Math.max(minPostR + 0.08, convexBaseMd * syncedBaseScale);
      const finalTopBlScaled = Math.min(finalBaseBl - 0.02, Math.max(minPostR, convexTopBl * syncedBaseScale));
      const finalTopMdScaled = Math.min(finalBaseMd - 0.02, Math.max(minPostR, convexTopMd * syncedBaseScale));
      const effUniformShoulder = uniformShoulder * syncedBaseScale;

      // 각 열 θ에서 실제 마진 높이 zMargin(θ)의 정사영 점이 해당 열의 축벽 시작 반경 + 동일 챔퍼 폭(effUniformShoulder)에
      // 정확히 놓이도록 마진 반경(marginRadii)을 풀어 스캘럽 전 구간에서 둘레 마진 폭을 일정하게 맞춘다.
      const baseSlopeBl = Math.max(minWallTaperSlope * 0.65, (finalBaseBl - finalTopBlScaled) / hRefSpan);
      const baseSlopeMd = Math.max(minWallTaperSlope * 0.65, (finalBaseMd - finalTopMdScaled) / hRefSpan);
      marginRadii = Array.from({ length: ANGULAR_COLS }, (_, col) => {
        const theta = (col / ANGULAR_COLS) * Math.PI * 2;
        const ct = Math.cos(theta);
        const st = Math.sin(theta);
        const radialFix: Vec3 = [ct, st, 0];
        const zM = evalPeriodicLinear(smoothMarginZ, theta);
        const dz0 = zM - meanMarginZ;
        const u0Off = dz0 * frame.uLabial[2];
        const v0Off = dz0 * frame.vSide[2];
        const gu = dot3(radialFix, frame.uLabial);
        const gv = dot3(radialFix, frame.vSide);
        const h0Approx = dz0 * frame.w[2];
        const hBaseAtCol = h0Approx + hPostBase;
        const dh = Math.max(0, hBaseAtCol - hRefBase);
        const mBlAtCol = Math.max(minPostR, finalBaseBl - baseSlopeBl * dh) + effUniformShoulder;
        const mMdAtCol = Math.max(minPostR, finalBaseMd - baseSlopeMd * dh) + effUniformShoulder;
        const evalNormAtCol = (rFix: number) => {
          const u = u0Off + rFix * gu - pSecCu;
          const v = v0Off + rFix * gv - pSecCv;
          const len = Math.hypot(u, v);
          if (len < 1e-7) return 0;
          const phi = Math.atan2(v, u);
          const secR = toothSectionRadius(tpl.kind, "margin", mBlAtCol, mMdAtCol, phi);
          return len / Math.max(secR, 1e-4);
        };
        if (evalNormAtCol(minSolveMarginR) >= 1) return minSolveMarginR;
        let lo = minSolveMarginR;
        let hi = minSolveMarginR + Math.max(mBlAtCol, mMdAtCol) * 2.2;
        while (evalNormAtCol(hi) < 1 && hi < 12) hi *= 1.4;
        for (let it = 0; it < 16; it += 1) {
          const mid = (lo + hi) * 0.5;
          if (evalNormAtCol(mid) < 1) lo = mid;
          else hi = mid;
        }
        return Math.max(minSolveMarginR, (lo + hi) * 0.5);
      });
      mHalfBl = finalBaseBl + effUniformShoulder;
      mHalfMd = finalBaseMd + effUniformShoulder;
      mCu = pSecCu;
      mCv = pSecCv;
      syncColsMarginGeometry();

      for (let col = 0; col < ANGULAR_COLS; col += 1) {
        const c = cols[col]!;
        const du = dot3(c.dir, frame.uLabial);
        const dv = dot3(c.dir, frame.vSide);
        const maxRoundStartCol = Math.max(c.h0 + 0.14, top.heightAt(du * finalTopBlScaled, dv * finalTopMdScaled) - 0.1);
        const hBaseCol = Math.min(c.h0 + hPostBase, maxRoundStartCol - 0.08);
        const roundStartCol = Math.min(maxRoundStartCol, Math.max(hBaseCol + 0.36, top.heightAt(du * finalTopBlScaled, dv * finalTopMdScaled) - topRoundMm * 0.9));
        for (let k = 0; k <= POST_LEVELS; k += 1) {
          postH[col]![k] = hBaseCol + ((roundStartCol - hBaseCol) * k) / POST_LEVELS;
        }
        const r0Ray = analyticSectionRay(
          tpl.kind,
          "post",
          finalBaseBl / postUnitLab,
          finalBaseBl / postUnitLin,
          finalBaseMd,
          pSecCu,
          pSecCv,
          du,
          dv,
        );
        const rTopRay = analyticSectionRay(
          tpl.kind,
          "post",
          finalTopBlScaled / postUnitLab,
          finalTopBlScaled / postUnitLin,
          finalTopMdScaled,
          pSecCu,
          pSecCv,
          du,
          dv,
        );
        const rb = Number.isFinite(r0Ray) ? r0Ray : c.r0 - effUniformShoulder;
        const wantTaperDrop = Math.max(0.04, minWallTaperSlope * hRefSpan);
        const rt = Number.isFinite(rTopRay)
          ? Math.min(rTopRay, rb - wantTaperDrop * 0.5)
          : rb - taperSlope * hRefSpan;
        const slope = Math.max(minWallTaperSlope * 0.65, (rb - rt) / hRefSpan);
        for (let k = 0; k <= POST_LEVELS; k += 1) {
          const h = postH[col]![k]!;
          postR[col]![k] = Math.max(0.75, rb - slope * (h - hRefBase));
        }
      }
    } else {
      // 전치부(1·2·3번, 우리·알토란기공소 남정헌 #13·#23, 정성윤 #22·#23, 남덕순 #42·#43 실측):
      // 1) 단면은 어떤 열도 튀어나오지 않는 100% 매끈한 해석 타원(analyticSectionRay)만 사용한다(개별 열 collar 돌출 금지).
      // 2) 하단 마진 숄더(k=0)는 순·설·근·원 4방위 모두 동일한 마진 폭(targetShoulderW, 견치 0.97/1.03 단위 보정 포함)에서 출발하고,
      //    하단 스크류 홀 벽이나 수직 식립 상단 칼라 때문에 특정 방위만 넓혀야 할 때만 그 방위만 조정한다.
      // 3) 순측 경사 식립을 설측으로 꺾어 세운 전치(|uScrewTop| > 0.7mm, 예: 남정헌 #13·#23, 정성윤 #22·#23)는
      //    기공소 디자인처럼 매끈한 타원형 포스트를 유지하고 스크류 홀이 설측 사면으로 깔끔하게 열리게 한다.
      pTopCu = clamp(mCu * 0.75, -0.55, 0.55);
      pTopCv = clamp(mCv * 0.85, -0.75, 0.75);
      const screwAxialExitW = () =>
        1 - smootherstep(clamp((Math.abs(uScrewTop - pTopCu) - 0.55) / 0.85, 0, 1));
      const minLabCollar = () =>
        Math.max(
          1.12,
          1.12 +
            screwAxialExitW() *
              Math.max(0, uScrewTop - pTopCu + boreTopR + ANTERIOR_SCREW_WALL_MM - 1.12),
        );
      const minLinCollar = () =>
        Math.max(
          0.95,
          0.95 +
            screwAxialExitW() *
              Math.max(0, -(uScrewTop - pTopCu) + boreTopR + ANTERIOR_SCREW_LINGUAL_WALL_MM - 0.95),
        );
      const minMdCollar = () =>
        Math.max(
          1.28,
          1.28 +
            screwAxialExitW() *
              Math.max(
                0,
                Math.min(1.98, Math.abs(vScrewTop - pTopCv) * 0.5 + boreTopR + ANTERIOR_SCREW_WALL_MM) -
                  1.28,
              ),
        );

      const minAntBasePosU = Math.max(1.02, uScrewBase + boreTopR + ANTERIOR_SCREW_WALL_MM);
      const minAntBaseNegU = Math.max(0.92, -uScrewBase + boreTopR + ANTERIOR_SCREW_LINGUAL_WALL_MM);
      const minAntBasePosV = Math.max(1.22, vScrewBase + boreTopR + ANTERIOR_SCREW_WALL_MM);
      const minAntBaseNegV = Math.max(1.22, -vScrewBase + boreTopR + ANTERIOR_SCREW_WALL_MM);

      let antBaseUniformW = targetShoulderW;
      const antBaseExtraW = { posU: 0, negU: 0, posV: 0, negV: 0 };
      let pBaseCu = mCu;
      let pBaseCv = mCv;
      let pBaseBl = Math.max(1.05, mHalfBl - targetShoulderW);
      let pBaseMd = Math.max(1.25, mHalfMd - targetShoulderW);

      const syncAnteriorBase = (reqPosU: number, reqNegU: number, reqPosV: number, reqNegV: number) => {
        const maxPosU = Math.max(MIN_MARGIN_SHOULDER_MM, mExtPosU - Math.max(minAntBasePosU, reqPosU));
        const maxNegU = Math.max(MIN_MARGIN_SHOULDER_MM, mExtNegU - Math.max(minAntBaseNegU, reqNegU));
        const maxPosV = Math.max(MIN_MARGIN_SHOULDER_MM, mExtPosV - Math.max(minAntBasePosV, reqPosV));
        const maxNegV = Math.max(MIN_MARGIN_SHOULDER_MM, mExtNegV - Math.max(minAntBaseNegV, reqNegV));
        const wPosU = clamp(
          Math.min(antBaseUniformW + antBaseExtraW.posU, maxPosU),
          MIN_MARGIN_SHOULDER_MM,
          Math.max(MIN_MARGIN_SHOULDER_MM, mExtPosU - 0.98),
        );
        const wNegU = clamp(
          Math.min(antBaseUniformW + antBaseExtraW.negU, maxNegU),
          MIN_MARGIN_SHOULDER_MM,
          Math.max(MIN_MARGIN_SHOULDER_MM, mExtNegU - 0.92),
        );
        const wPosV = clamp(
          Math.min(antBaseUniformW + antBaseExtraW.posV, maxPosV),
          MIN_MARGIN_SHOULDER_MM,
          Math.max(MIN_MARGIN_SHOULDER_MM, mExtPosV - 1.18),
        );
        const wNegV = clamp(
          Math.min(antBaseUniformW + antBaseExtraW.negV, maxNegV),
          MIN_MARGIN_SHOULDER_MM,
          Math.max(MIN_MARGIN_SHOULDER_MM, mExtNegV - 1.18),
        );
        const bPosU = mExtPosU - wPosU;
        const bNegU = mExtNegU - wNegU;
        const bPosV = mExtPosV - wPosV;
        const bNegV = mExtNegV - wNegV;
        pBaseCu = (bPosU - bNegU) * 0.5;
        pBaseBl = Math.max(1.02, (bPosU + bNegU) * 0.5);
        pBaseCv = (bPosV - bNegV) * 0.5;
        pBaseMd = Math.max(1.22, (bPosV + bNegV) * 0.5);
        return { maxPosU, maxNegU, maxPosV, maxNegV, bPosU, bNegU, bPosV, bNegV };
      };

      syncAnteriorBase(
        pTopCu + minLabCollar() + 0.08,
        -pTopCu + minLinCollar() + 0.08,
        pTopCv + minMdCollar() + 0.08,
        -pTopCv + minMdCollar() + 0.08,
      );
      const tallScale = smootherstep(clamp((postTopH - 4.3) / 2.2, 0, 1));
      const tplLabHalf = Math.max(tpl.topLabialHalfMm * blScale * params.postWidthScale, minLabCollar());
      const tplLinHalf = Math.max(tpl.topLingualHalfMm * blScale * params.postWidthScale, minLinCollar());
      const tplMdHalf = Math.max(topB, minMdCollar());
      const keepBl = Math.max(1.15, pBaseBl - taperSlope * meanSpanSum);
      const keepMd = Math.max(1.62, pBaseMd - taperSlope * meanSpanSum);
      let topLabHalf = Math.max(minLabCollar(), keepBl - Math.max(0, keepBl - tplLabHalf) * (0.35 + 0.65 * tallScale));
      let topLinHalf = Math.max(minLinCollar(), keepBl - Math.max(0, keepBl - tplLinHalf) * (0.55 + 0.45 * tallScale));
      let topMdHalf = Math.max(minMdCollar(), keepMd - Math.max(0, keepMd - tplMdHalf) * (0.3 + 0.6 * tallScale));

      // 하단·중단·상단 모두 크라운 목표 두께(capR, 1.0mm)와 최소 지르코니아 두께(hardCapR, 0.7mm)를 침범하지 않도록
      // 반복 루프 안에서 타원 반축과 중심(pTopCu, pTopCv)을 함께 조정한다(루프 밖 열별 클리핑 금지 → 100% 볼록 단면 유지).
      const antCheckLevels = [
        Math.round(POST_LEVELS * 0.4),
        Math.round(POST_LEVELS * 0.75),
        POST_LEVELS,
      ];
      for (let iter = 0; iter < 20; iter += 1) {
        const limShift = Math.max(0.08, Math.min(topLabHalf, topLinHalf, topMdHalf) * 0.62);
        pTopCu = clamp(pTopCu, -0.65, 0.65);
        pTopCv = clamp(pTopCv, -0.85, 0.85);
        if (Math.hypot(pTopCu, pTopCv) > limShift) {
          const sc = limShift / Math.hypot(pTopCu, pTopCv);
          pTopCu *= sc;
          pTopCv *= sc;
        }
        const baseState = syncAnteriorBase(
          pTopCu + minLabCollar() + 0.06,
          -pTopCu + minLinCollar() + 0.06,
          pTopCv + minMdCollar() + 0.06,
          -pTopCv + minMdCollar() + 0.06,
        );
        topLabHalf = Math.min(topLabHalf, baseState.bPosU - pTopCu - 0.04);
        topLinHalf = Math.min(topLinHalf, baseState.bNegU + pTopCu - 0.04);
        topMdHalf = Math.min(
          topMdHalf,
          Math.min(baseState.bPosV - pTopCv, baseState.bNegV + pTopCv) - 0.04,
        );

        let worstTopLab = 0;
        let worstTopLin = 0;
        let worstTopMd = 0;
        let worstPosVEx = 0;
        let worstNegVEx = 0;
        let minPosVSlack = Infinity;
        let minNegVSlack = Infinity;
        let worstBaseEx = 0;
        let worstBaseDu = 0;
        let worstBaseDv = 0;
        const useSoft = iter < 12;
        for (let col = 0; col < ANGULAR_COLS; col += 1) {
          const du = colPostDu[col]!;
          const dv = colPostDv[col]!;
          const rBaseRay = analyticSectionRay(
            tpl.kind,
            "post",
            pBaseBl / postUnitLab,
            pBaseBl / postUnitLin,
            pBaseMd,
            pBaseCu,
            pBaseCv,
            du,
            dv,
          );
          const rTopRay = analyticSectionRay(
            tpl.kind,
            "post",
            topLabHalf / postUnitLab,
            topLinHalf / postUnitLin,
            topMdHalf,
            pTopCu,
            pTopCv,
            du,
            dv,
          );
          if (Number.isFinite(rTopRay) && Number.isFinite(rBaseRay)) {
            for (const k of antCheckLevels) {
              const uLvl = k / POST_LEVELS;
              const rLvl = rBaseRay + (rTopRay - rBaseRay) * uLvl;
              const boundLvl = useSoft
                ? Math.max(0.88, Math.min(capR[col]![k]!, hardCapR[col]![k]!))
                : Math.max(0.85, hardCapR[col]![k]!);
              if (!Number.isFinite(boundLvl)) continue;
              const slack = boundLvl - rLvl;
              if (k === POST_LEVELS && Math.abs(dv) >= 0.75) {
                if (dv > 0) minPosVSlack = Math.min(minPosVSlack, slack);
                else minNegVSlack = Math.min(minNegVSlack, slack);
              }
              if (slack < -1e-4) {
                // 중단(uLvl < 1) 간섭은 상단·하단 역할을 분담하고, 상단(uLvl = 1) 간섭은 상단 타원이 직접 흡수한다.
                const ex = (-slack) / Math.max(0.45, uLvl);
                if (Math.abs(dv) >= 0.45) {
                  worstTopMd = Math.max(worstTopMd, ex * Math.abs(dv));
                  if (dv > 0) worstPosVEx = Math.max(worstPosVEx, ex * dv);
                  else worstNegVEx = Math.max(worstNegVEx, ex * -dv);
                }
                if (Math.abs(du) >= 0.45) {
                  if (du >= 0) worstTopLab = Math.max(worstTopLab, ex * Math.max(0.5, du));
                  else worstTopLin = Math.max(worstTopLin, ex * Math.max(0.5, -du));
                }
                if (uLvl < 0.6 && -slack > worstBaseEx) {
                  worstBaseEx = -slack * (1 - uLvl * 0.7);
                  worstBaseDu = du;
                  worstBaseDv = dv;
                }
              }
            }
          }
          const boundBase = Math.max(
            0.95,
            Math.min(cols[col]!.r0 - MIN_MARGIN_SHOULDER_MM, hardCapR[col]![0]!),
          );
          if (Number.isFinite(rBaseRay) && rBaseRay > boundBase + 1e-4) {
            const ex = rBaseRay - boundBase;
            if (ex > worstBaseEx) {
              worstBaseEx = ex;
              worstBaseDu = du;
              worstBaseDv = dv;
            }
          }
        }
        if (Math.max(worstTopLab, worstTopLin, worstTopMd, worstBaseEx) <= 1e-3) break;
        if (worstBaseEx > 0) {
          let remBase = worstBaseEx;
          const minBaseMax = Math.min(
            baseState.maxPosU,
            baseState.maxNegU,
            baseState.maxPosV,
            baseState.maxNegV,
          );
          const maxUni = Math.min(targetShoulderW + 0.12, minBaseMax - 0.02);
          if (antBaseUniformW < maxUni) {
            const step = Math.min(remBase * 0.8, maxUni - antBaseUniformW);
            antBaseUniformW += step;
            remBase = Math.max(0, remBase - step);
          }
          if (remBase > 1e-4) {
            const wu = worstBaseDu * worstBaseDu;
            const wv = worstBaseDv * worstBaseDv;
            if (wu >= 0.06) {
              if (worstBaseDu >= 0) antBaseExtraW.posU += remBase * (0.35 + 0.55 * wu);
              else antBaseExtraW.negU += remBase * (0.35 + 0.55 * wu);
            }
            if (wv >= 0.06) {
              if (worstBaseDv >= 0) antBaseExtraW.posV += remBase * (0.35 + 0.55 * wv);
              else antBaseExtraW.negV += remBase * (0.35 + 0.55 * wv);
            }
          }
        }
        // 한쪽 인접면만 좁고 반대쪽 여유가 있으면 포스트 상단 중심(pTopCv)을 먼저 여유 쪽으로 옮겨 불필요한 폭 축소를 줄인다.
        if (worstNegVEx > worstPosVEx + 0.015 && minPosVSlack > 0.03) {
          const shift = Math.min((worstNegVEx - worstPosVEx) * 0.6, minPosVSlack * 0.65, 0.18);
          pTopCv = clamp(pTopCv + shift, -0.85, 0.85);
          worstTopMd = Math.max(0, worstTopMd - shift * 0.75);
        } else if (worstPosVEx > worstNegVEx + 0.015 && minNegVSlack > 0.03) {
          const shift = Math.min((worstPosVEx - worstNegVEx) * 0.6, minNegVSlack * 0.65, 0.18);
          pTopCv = clamp(pTopCv - shift, -0.85, 0.85);
          worstTopMd = Math.max(0, worstTopMd - shift * 0.75);
        }
        const labFloor = useSoft ? minLabCollar() : Math.max(0.9, minLabCollar() - 0.25);
        const linFloor = useSoft ? minLinCollar() : Math.max(0.82, minLinCollar() - 0.25);
        const hardMdMin =
          screwAxialExitW() > 0.35 ? Math.max(1.05, boreTopR + SCREW_WALL_TIGHT_MM - 0.08) : 1.05;
        const mdFloor = useSoft ? minMdCollar() : hardMdMin;
        if (worstTopLab > 0) topLabHalf = Math.max(labFloor, topLabHalf - worstTopLab * 0.78);
        if (worstTopLin > 0) topLinHalf = Math.max(linFloor, topLinHalf - worstTopLin * 0.78);
        if (worstTopMd > 0) topMdHalf = Math.max(mdFloor, topMdHalf - worstTopMd * 0.78);
      }

      const finalBase = syncAnteriorBase(
        pTopCu + minLabCollar() + 0.06,
        -pTopCu + minLinCollar() + 0.06,
        pTopCv + minMdCollar() + 0.06,
        -pTopCv + minMdCollar() + 0.06,
      );
      topLabHalf = Math.min(topLabHalf, finalBase.bPosU - pTopCu - 0.04);
      topLinHalf = Math.min(topLinHalf, finalBase.bNegU + pTopCu - 0.04);
      topMdHalf = Math.min(
        topMdHalf,
        Math.min(finalBase.bPosV - pTopCv, finalBase.bNegV + pTopCv) - 0.04,
      );

      let antBaseBl = pBaseBl;
      let antBaseMd = pBaseMd;
      for (let fixIt = 0; fixIt < 10; fixIt += 1) {
        let baseScaleDown = 1;
        let topScaleDown = 1;
        for (let col = 0; col < ANGULAR_COLS; col += 1) {
          const c = cols[col]!;
          const du = colPostDu[col]!;
          const dv = colPostDv[col]!;
          const r0Ray = analyticSectionRay(
            tpl.kind,
            "post",
            antBaseBl / postUnitLab,
            antBaseBl / postUnitLin,
            antBaseMd,
            pBaseCu,
            pBaseCv,
            du,
            dv,
          );
          const maxR0 = Math.max(0.85, c.r0 - MIN_MARGIN_SHOULDER_MM);
          if (Number.isFinite(r0Ray) && r0Ray > maxR0 + 1e-4) {
            baseScaleDown = Math.min(baseScaleDown, maxR0 / r0Ray);
          }
          const rTopRay = analyticSectionRay(
            tpl.kind,
            "post",
            topLabHalf / postUnitLab,
            topLinHalf / postUnitLin,
            topMdHalf,
            pTopCu,
            pTopCv,
            du,
            dv,
          );
          const maxTopHard = Math.max(0.85, hardCapR[col]![POST_LEVELS]!);
          if (Number.isFinite(maxTopHard) && Number.isFinite(rTopRay) && rTopRay > maxTopHard + 1e-4) {
            topScaleDown = Math.min(topScaleDown, maxTopHard / rTopRay);
          }
        }
        if (baseScaleDown >= 0.9995 && topScaleDown >= 0.9995) break;
        if (baseScaleDown < 0.9995) {
          antBaseBl = Math.max(0.95, antBaseBl * (baseScaleDown - 0.002));
          antBaseMd = Math.max(1.08, antBaseMd * (baseScaleDown - 0.002));
        }
        if (topScaleDown < 0.9995) {
          topLabHalf = Math.max(0.9, topLabHalf * (topScaleDown - 0.002));
          topLinHalf = Math.max(0.82, topLinHalf * (topScaleDown - 0.002));
          topMdHalf = Math.max(1.0, topMdHalf * (topScaleDown - 0.002));
        }
        topLabHalf = Math.min(topLabHalf, antBaseBl + pBaseCu - pTopCu - 0.04);
        topLinHalf = Math.min(topLinHalf, antBaseBl - pBaseCu + pTopCu - 0.04);
        topMdHalf = Math.min(
          topMdHalf,
          Math.min(antBaseMd + pBaseCv - pTopCv, antBaseMd - pBaseCv + pTopCv) - 0.04,
        );
      }

      // 열별 collarFloor 돌출이나 개별 hardCap 절단을 하지 않고 공통 기준 높이(hRefBase ↔ hRefTop)의
      // 순수 해석 볼록 단면을 각 열의 실제 높이(postH[col][k])에서 평가해 어느 수평 단면에서도 100% 볼록 곡선을 유지한다.
      const hRefBaseAnt = meanHBaseSum;
      const hRefTopAnt = Math.max(hRefBaseAnt + 0.5, meanRoundStartSum);
      const hRefSpanAnt = hRefTopAnt - hRefBaseAnt;
      const uniformAntShoulder = clamp(antBaseUniformW, 0.2, Math.max(targetShoulderW, 0.8));
      let syncedAntScale = 1;
      for (let col = 0; col < ANGULAR_COLS; col += 1) {
        const cap = marginCap[col]!;
        if (!Number.isFinite(cap)) continue;
        const rM = analyticSectionRay(
          tpl.kind,
          "margin",
          antBaseBl + uniformAntShoulder,
          antBaseBl + uniformAntShoulder,
          antBaseMd + uniformAntShoulder,
          pBaseCu,
          pBaseCv,
          colDuFix[col]!,
          colDvFix[col]!,
        );
        if (Number.isFinite(rM) && rM > cap + 1e-4) {
          syncedAntScale = Math.min(syncedAntScale, cap / rM);
        }
      }
      const finalAntBaseBl = Math.max(0.95, antBaseBl * syncedAntScale);
      const finalAntBaseMd = Math.max(1.08, antBaseMd * syncedAntScale);
      const finalAntTopLab = Math.min(finalAntBaseBl + pBaseCu - pTopCu - 0.04, Math.max(0.88, topLabHalf * syncedAntScale));
      const finalAntTopLin = Math.min(finalAntBaseBl - pBaseCu + pTopCu - 0.04, Math.max(0.8, topLinHalf * syncedAntScale));
      const finalAntTopMd = Math.min(
        Math.min(finalAntBaseMd + pBaseCv - pTopCv, finalAntBaseMd - pBaseCv + pTopCv) - 0.04,
        Math.max(1.0, topMdHalf * syncedAntScale),
      );
      mHalfBl = finalAntBaseBl + uniformAntShoulder * syncedAntScale;
      mHalfMd = finalAntBaseMd + uniformAntShoulder * syncedAntScale;
      mCu = pBaseCu;
      mCv = pBaseCv;
      marginRadii = solveMarginRadii(smoothMarginZ, meanMarginZ);
      syncColsMarginGeometry();

      for (let col = 0; col < ANGULAR_COLS; col += 1) {
        const c = cols[col]!;
        const du = dot3(c.dir, frame.uLabial);
        const dv = dot3(c.dir, frame.vSide);
        const topEdgeAnt = top.heightAt(du * finalAntTopLab, dv * finalAntTopMd);
        const maxRoundStartAnt = Math.max(c.h0 + 0.14, topEdgeAnt - 0.1);
        const hBaseAnt = Math.min(c.h0 + hPostBase, maxRoundStartAnt - 0.08);
        const roundStartAnt = Math.min(maxRoundStartAnt, Math.max(hBaseAnt + 0.36, topEdgeAnt - topRoundMm * 0.9));
        for (let k = 0; k <= POST_LEVELS; k += 1) {
          postH[col]![k] = hBaseAnt + ((roundStartAnt - hBaseAnt) * k) / POST_LEVELS;
        }
        const r0Ray = analyticSectionRay(
          tpl.kind,
          "post",
          finalAntBaseBl / postUnitLab,
          finalAntBaseBl / postUnitLin,
          finalAntBaseMd,
          pBaseCu,
          pBaseCv,
          du,
          dv,
        );
        const rTopRay = analyticSectionRay(
          tpl.kind,
          "post",
          finalAntTopLab / postUnitLab,
          finalAntTopLin / postUnitLin,
          finalAntTopMd,
          pTopCu,
          pTopCv,
          du,
          dv,
        );
        const rb = Number.isFinite(r0Ray) ? r0Ray : c.r0 - uniformAntShoulder;
        const rt = Number.isFinite(rTopRay) ? Math.min(rTopRay, rb - 0.03) : rb * 0.78;
        const slope = Math.max(0.015, (rb - rt) / hRefSpanAnt);
        // 전치·견치 설측 싱귤럼 사선(우리치과기공소 남정헌 #13·#23, 신대상 #13, 남덕순 #42·#43 실측):
        // 순측·근원심은 마진에서 일정한 각도로 쭉 올라가고, 설측(du < 0)만 싱귤럼 변곡점 위에서 사선 평면으로 깎여
        // 대합 전치 유도면 및 설측 크라운 두께를 확보한다.
        const cingulumStartH = hRefBaseAnt + hRefSpanAnt * 0.42;
        const cingulumTopSpan = Math.max(0.4, hRefTopAnt - cingulumStartH);
        const rStraightTop = rb - slope * hRefSpanAnt;
        const extraLingualCut =
          du < -0.05 ? Math.min(0.68, Math.max(0, rStraightTop - 0.85) * 0.38) * (-du) : 0;
        const bevelSlope = extraLingualCut / cingulumTopSpan;
        for (let k = 0; k <= POST_LEVELS; k += 1) {
          const h = postH[col]![k]!;
          const straightR = rb - slope * (h - hRefBaseAnt);
          const bevelCut = h > cingulumStartH ? bevelSlope * (h - cingulumStartH) : 0;
          postR[col]![k] = Math.max(0.7, straightR - bevelCut);
        }
      }
    }

    // 구치부는 이미 4방위 균일 마진 폭과 순수 둥근 사각형 직선 모선 안에 스크류 홀 벽 두께(screwReqR)가 반영되어 있으므로,
    // 한쪽 벽만 부풀려 사각형 단면을 찌그러뜨리는 coverPostOverScrew는 전치부 보조 보정에서만 제한적으로 쓴다.
    if (!posterior) {
      coverPostOverScrew({
        w: frame.w,
        c0,
        boreR: boreTopR,
        wallMm: ANTERIOR_SCREW_LINGUAL_WALL_MM,
        dirs: cols.map((c) => c.dir),
        postR,
        postH,
        marginCap: cols.map((c) => Math.max(0.85, c.r0 - MIN_MARGIN_SHOULDER_MM)),
        hardTop: hardCapR.map((row) => row[POST_LEVELS] ?? Number.POSITIVE_INFINITY),
        topLevel: POST_LEVELS,
      });
    }

    // ── 7) 열 점: 피니시라인 → 오목 챔퍼 → 축벽 → 윗면 라운드 / 해부 3링 예측 크라운 교합면
    const postByCol: Vec3[][] = [];
    const crownByCol: Vec3[][] = [];
    let cutbackSum = 0;
    let taperSum = 0;
    let taperCols = 0;
    let crownTopSum = 0;
    let rhoSum = 0;
    const rawEdgeH: number[] = [];
    const rawOcc1H: number[] = [];
    const rawOcc2H: number[] = [];
    const rawOcc3H: number[] = [];
    const cuspR1ByCol: number[] = [];
    const cuspR2ByCol: number[] = [];
    const cuspR3ByCol: number[] = [];
    const crownOccCu = clamp(crownCenterU * 0.45, -1.2, 1.2);
    const crownOccCv = clamp(crownCenterV * crownSideSign * 0.45, -1.2, 1.2);
    for (let col = 0; col < ANGULAR_COLS; col += 1) {
      const c = cols[col]!;
      const at = (h: number, r: number): Vec3 => add3(c0, add3(scale3(frame.w, h), scale3(c.dir, r)));
      const rs = postR[col]!;
      const hs = postH[col]!;
      const post: Vec3[] = [];
      const colWallSlope = Math.max(0, (rs[0]! - rs[1]!) / Math.max(hs[1]! - hs[0]!, 1e-4));
      const ch = chamferPoints(c.r0, c.h0, Math.max(0.02, c.r0 - rs[0]!), hs[0]! - c.h0, colWallSlope);
      rhoSum += ch.rho;
      for (const [r, h] of ch.pts) post.push(at(h, r));
      for (let k = 1; k <= POST_LEVELS; k += 1) post.push(at(hs[k]!, rs[k]!));
      // 윗면 라운드: 축벽 끝 기울기에서 접선으로 시작해 윗면에서 수평으로 끝난다.
      // 모자란 높이는 같은 기울기로 축벽을 늘려 채운다(점 개수는 열마다 같다).
      const rEnd = rs[POST_LEVELS]!;
      const hEnd = hs[POST_LEVELS]!;
      const wallSlope = Math.max(
        0,
        (rs[POST_LEVELS - 1]! - rEnd) / Math.max(hEnd - hs[POST_LEVELS - 1]!, 1e-4),
      );
      const t0 = Math.min(Math.atan(wallSlope), 60 * DEG);
      const sin0 = Math.sin(t0);
      const cos0 = Math.cos(t0);
      const edgeHeight = (rFlat: number) =>
        top.heightAt(dot3(c.dir, frame.uLabial) * rFlat, dot3(c.dir, frame.vSide) * rFlat);
      const rhoMax = Math.max(0.06, Math.min(topRoundMm, (rEnd - 0.3) / cos0));
      const rise = Math.max(1 - sin0, 1e-3);
      const availRise = Math.max(0.03, edgeHeight(rEnd - Math.min(rhoMax, 0.22) * cos0) - hEnd);
      const rhoCap = Math.min(rhoMax, availRise / rise);
      const rho = clamp(
        (edgeHeight(rEnd - rhoCap * cos0) - hEnd) / rise,
        Math.min(0.15, rhoCap),
        rhoCap,
      );
      const ext = Math.max(0, edgeHeight(rEnd - rho * cos0) - hEnd - rho * rise);
      const h1 = hEnd + ext;
      const r1 = Math.max(rho * cos0 + 0.2, rEnd - Math.tan(t0) * ext);
      post.push(at(h1, r1));
      const arcR = r1 - rho * cos0;
      const arcH = h1 - rho * sin0;
      for (let s = 1; s <= TOP_ROUND_STEPS; s += 1) {
        const t = t0 + ((Math.PI / 2 - t0) * s) / TOP_ROUND_STEPS;
        post.push(at(arcH + rho * Math.sin(t), arcR + rho * Math.cos(t)));
      }
      postByCol.push(post);

      const k20 = Math.round(POST_LEVELS * 0.2);
      const k60 = Math.round(POST_LEVELS * 0.6);
      if (posterior || Math.cos(c.phi) > -0.25) {
        taperSum += Math.atan2(rs[k20]! - rs[k60]!, hs[k60]! - hs[k20]!);
        taperCols += 1;
      }
      const hMid = hs[k20]! + (hs[k60]! - hs[k20]!) * 0.5;
      const kMid = Math.round(POST_LEVELS * 0.4);
      cutbackSum += crownRadiusAt(c, hMid) - rs[kMid]!;

      const rCrownTop = c.crownR[CROWN_LEVELS - 1]!;
      const du = dot3(c.dir, frame.uLabial);
      const dvRaw = dot3(c.dir, frame.vSide);
      const dv = dvRaw * mesialSignOnV;
      const cuspR1 = rCrownTop * 0.9;
      const cuspR2 = rCrownTop * 0.66;
      const cuspR3 = rCrownTop * 0.34;
      cuspR1ByCol.push(cuspR1);
      cuspR2ByCol.push(cuspR2);
      cuspR3ByCol.push(cuspR3);
      const uNorm1 = (du * cuspR1 - crownCenterU) / Math.max(natHalfBl, 1);
      const vNorm1 = (dv * cuspR1 - crownCenterV * crownSideSign * mesialSignOnV) / Math.max(crownHalfMd, 1);
      const uNorm2 = (du * cuspR2 - crownCenterU) / Math.max(natHalfBl, 1);
      const vNorm2 = (dv * cuspR2 - crownCenterV * crownSideSign * mesialSignOnV) / Math.max(crownHalfMd, 1);
      const uNorm3 = (du * cuspR3 - crownCenterU) / Math.max(natHalfBl, 1);
      const vNorm3 = (dv * cuspR3 - crownCenterV * crownSideSign * mesialSignOnV) / Math.max(crownHalfMd, 1);
      const reliefAmp = posterior ? 1.85 : 1.1;
      const lift1 = crownOcclusalReliefRatio(fixture.toothNumber, uNorm1, vNorm1) * reliefAmp;
      const lift2 = crownOcclusalReliefRatio(fixture.toothNumber, uNorm2, vNorm2) * reliefAmp;
      const lift3 = crownOcclusalReliefRatio(fixture.toothNumber, uNorm3, vNorm3) * reliefAmp;
      const occCapEdge = oppField
        ? oppField.heightAt(du * rCrownTop, dvRaw * rCrownTop, 1.0) + contact
        : Infinity;
      const lastH = Number.isFinite(occCapEdge)
        ? Math.max(c.h0 + 0.5, Math.min(c.crownH[CROWN_LEVELS - 1]!, occCapEdge - 0.14))
        : c.crownH[CROWN_LEVELS - 1]!;
      rawEdgeH.push(lastH);
      const occCap1 = oppField
        ? oppField.heightAt(du * cuspR1, dvRaw * cuspR1, 1.0) + contact
        : Infinity;
      const occCap2 = oppField
        ? oppField.heightAt(du * cuspR2, dvRaw * cuspR2, 1.0) + contact
        : occCap1;
      const occCap3 = oppField
        ? oppField.heightAt(du * cuspR3, dvRaw * cuspR3, 1.0) + contact
        : occCap2;
      const wantOcc1 = Number.isFinite(occCap1)
        ? Math.max(c.hTop + c.crownTopOcc * 0.7 + lift1 * 0.52, occCap1 - 0.24 + lift1 * 0.18)
        : c.hTop + c.crownTopOcc * 0.64 + lift1 * 0.68;
      const wantOcc2 = Number.isFinite(occCap2)
        ? Math.max(c.hTop + c.crownTopOcc * 0.96 + lift2 * 0.56, occCap2 - 0.08 + lift2 * 0.22)
        : c.hTop + c.crownTopOcc * 0.96 + lift2 * 0.92;
      const wantOcc3 = Number.isFinite(occCap3)
        ? Math.max(c.hTop + c.crownTopOcc * 0.88 + lift3 * 0.5, occCap3 - 0.16 + lift3 * 0.18)
        : c.hTop + c.crownTopOcc * 0.88 + lift3 * 0.82;
      rawOcc1H.push(
        Math.min(occCap1 - 0.05, Math.max(c.hTop + CROWN_THICKNESS_FLOOR_MM * 0.85, wantOcc1)),
      );
      rawOcc2H.push(
        Math.min(occCap2, Math.max(c.hTop + CROWN_THICKNESS_FLOOR_MM, wantOcc2)),
      );
      rawOcc3H.push(
        Math.min(occCap3 - 0.02, Math.max(c.hTop + CROWN_THICKNESS_FLOOR_MM * 0.92, wantOcc3)),
      );
    }
    // 대합 교두 유무가 열마다 끊기면서 예측 크라운 윗면에 방사형 주름이 생기지 않도록 교합 3링을 매끄럽게 고른다.
    const smoothEdgeH = lowPassCircular(rawEdgeH, 6);
    const smoothOcc1H = lowPassCircular(rawOcc1H, 6);
    const smoothOcc2H = lowPassCircular(rawOcc2H, 6);
    const smoothOcc3H = lowPassCircular(rawOcc3H, 6);
    for (let col = 0; col < ANGULAR_COLS; col += 1) {
      const c = cols[col]!;
      const at = (h: number, r: number): Vec3 => add3(c0, add3(scale3(frame.w, h), scale3(c.dir, r)));
      const crown: Vec3[] = [c.marginPt];
      for (let k = 0; k < CROWN_LEVELS - 1; k += 1) crown.push(at(c.crownH[k]!, c.crownR[k]!));
      crown.push(at(Math.max(c.h0 + 0.5, smoothEdgeH[col]!), c.crownR[CROWN_LEVELS - 1]!));
      const hOcc1 = Math.max(c.hTop + CROWN_THICKNESS_FLOOR_MM * 0.85, smoothOcc1H[col]!);
      const hOcc2 = Math.max(c.hTop + CROWN_THICKNESS_FLOOR_MM, smoothOcc2H[col]!);
      const hOcc3 = Math.max(c.hTop + CROWN_THICKNESS_FLOOR_MM * 0.92, smoothOcc3H[col]!);
      crown.push(at(hOcc1, cuspR1ByCol[col]!));
      crown.push(at(hOcc2, cuspR2ByCol[col]!));
      crown.push(at(hOcc3, cuspR3ByCol[col]!));
      crownTopSum += hOcc2;
      crownByCol.push(crown);
    }

    const apexH = top.heightAt(pTopCu, pTopCv);
    const postApex = add3(
      c0,
      add3(scale3(frame.w, apexH), add3(scale3(frame.uLabial, pTopCu), scale3(frame.vSide, pTopCv))),
    );
    const fossaDrop = crownOcclusalReliefRatio(fixture.toothNumber, 0, 0) * (posterior ? 1.85 : 1.1);
    const meanCrownCuspH = crownTopSum / ANGULAR_COLS;
    const oppApexCap = oppField ? oppField.heightAt(crownOccCu, crownOccCv, 1.4) + contact : Infinity;
    const crownCenterH = Math.min(
      oppApexCap,
      Math.max(
        apexH + Math.min(desiredOccThickness, 1.05),
        Number.isFinite(oppApexCap) ? oppApexCap - 0.25 : meanCrownCuspH + fossaDrop,
      ),
    );
    const crownApex = add3(
      c0,
      add3(
        scale3(frame.w, crownCenterH),
        add3(scale3(frame.uLabial, crownOccCu), scale3(frame.vSide, crownOccCv)),
      ),
    );
    return {
      postByCol,
      crownByCol,
      cutbackSum,
      taperMean: taperSum / Math.max(taperCols, 1),
      postApex,
      crownApex,
      meanCrownCuspH,
      chamferRho: rhoSum / ANGULAR_COLS,
    };
  };

  // 축 방향 높이만으로는 비스듬한 대합 교두가 옆에서 더 가깝거나 멀다.
  // 실제 포스트 윗면 전체(라운드 곡면 + 가장자리 + 정점)에서 대합치까지 거리를 재서 열마다 올리고 내린다.
  let shape = buildShape();
  if (oppNear.length > 0) {
    for (let pass = 0; pass < 7; pass += 1) {
      let changed = false;
      for (let col = 0; col < ANGULAR_COLS; col += 1) {
        const post = shape.postByCol[col]!;
        let d = Infinity;
        const sampleStart = Math.max(0, post.length - TOP_ROUND_STEPS - 2);
        for (let idx = sampleStart; idx < post.length; idx += 2) {
          d = Math.min(d, nearestOpp(post[idx]!));
        }
        d = Math.min(d, nearestOpp(post[post.length - 1]!));
        if (!Number.isFinite(d)) continue;
        if (d < clearance - 0.03) {
          topRaw[col] = topRaw[col]! - (clearance - d + 0.04);
          changed = true;
        } else if (d > clearance + 0.25 && topRaw[col]! < postTopMax - 0.01) {
          topRaw[col] = Math.min(postTopMax, topRaw[col]! + (d - clearance) * 0.65);
          changed = true;
        }
      }
      const dApex = nearestOpp(shape.postApex);
      if (Number.isFinite(dApex) && dApex < clearance - 0.03) {
        apexDrop += clearance - dApex + 0.04;
        changed = true;
      }
      if (!changed) break;
      shape = buildShape();
    }
  }
  const { postByCol, crownByCol, cutbackSum, taperMean, postApex, crownApex, meanCrownCuspH, chamferRho } = shape;
  // ── 8) 솔리드 외형(커넥션·커프·포스트)을 닫고, 스크류 홀은 임플란트 축 원통으로 따로 뚫는다
  const l2 = conn.l2Mm;
  const zBot = -l2;
  const seatZ0 = 0.8;
  const seatZ1 = 1.3;
  const hexFlatR = conn.hexSizeMm ? conn.hexSizeMm / 2 : originR - TAPER_11_SLOPE * (l2 * 0.45);
  const hexCornerR = conn.hexSizeMm ? (hexFlatR / Math.cos(Math.PI / 6)) * 0.982 : hexFlatR;
  const coneStartZ = Math.max(zBot + 0.75, Math.min(-0.25, (hexCornerR - originR) / TAPER_11_SLOPE));
  const cuffRows = 22;
  const bottomPole: Vec3 = [0, 0, zBot];

  const bodyColumns: Vec3[][] = [];
  for (let col = 0; col < ANGULAR_COLS; col += 1) {
    const theta = (col / ANGULAR_COLS) * Math.PI * 2;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const marginPt = cols[col]!.marginPt;
    const rMarginFix = Math.hypot(marginPt[0], marginPt[1]);
    const zMarginFix = marginPt[2];
    const cyl = (r: number, z: number): Vec3 => [r * ct, r * st, z];

    const hexR = conn.hexSizeMm ? hexOuterRadiusAt(theta, conn.hexSizeMm) : hexCornerR;
    const pts: Vec3[] = [
      bottomPole,
      cyl(hexR - 0.16, zBot),
      cyl(hexR, zBot + 0.14),
      cyl(hexR, coneStartZ - 0.06),
      cyl(Math.max(hexR, originR + TAPER_11_SLOPE * coneStartZ), coneStartZ),
      cyl(originR, 0),
      cyl(coneTopR, coneTopZ),
    ];
    const profile = cuffProfile(coneTopR, coneTopZ, rMarginFix, zMarginFix);
    const cuffSpan = Math.max(0.35, zMarginFix - coneTopZ);
    for (let k = 1; k < cuffRows; k += 1) {
      const z = coneTopZ + (cuffSpan * k) / cuffRows;
      pts.push(cyl(profile(z), z));
    }
    pts.push(marginPt, ...postByCol[col]!, postApex);
    bodyColumns.push(pts);
  }
  const bodySoup = stitchPolarColumns(bodyColumns, true);

  let zTopMax = -Infinity;
  for (let i = 2; i < bodySoup.length; i += 3) zTopMax = Math.max(zTopMax, bodySoup[i]!);
  const cutter = screwChannelSoup(boreBotR, boreTopR, zBot - 1, seatZ0, seatZ1, zTopMax + 3);
  const localPositions = await subtractTriangleSoups(
    bodySoup,
    [cutter],
    `#${fixture.toothNumber} 커스텀어벗`,
  );

  const crownLocalPositions = stitchPolarColumns(
    crownByCol.map((c) => [...c, crownApex]),
    false,
  );

  const marginLoopLocal = new Float32Array(ANGULAR_COLS * 3);
  for (let col = 0; col < ANGULAR_COLS; col += 1) {
    const mp = cols[col]!.marginPt;
    marginLoopLocal[col * 3] = mp[0];
    marginLoopLocal[col * 3 + 1] = mp[1];
    marginLoopLocal[col * 3 + 2] = mp[2];
  }

  // 실제 포스트 윗면(라운드 시작부터 정점까지 전체) → 대합치 최소 거리
  let occlusalClearanceMm: number | null = null;
  if (opposingLocalPts.length > 0) {
    const topPts: Vec3[] = [postApex];
    for (let col = 0; col < ANGULAR_COLS; col += 3) {
      const post = postByCol[col]!;
      const startIdx = Math.max(0, post.length - TOP_ROUND_STEPS - 1);
      for (let idx = startIdx; idx < post.length; idx += 3) topPts.push(post[idx]!);
      topPts.push(post[post.length - 1]!);
    }
    let best = Infinity;
    for (let i = 0; i < opposingLocalPts.length; i += 3) {
      const q: Vec3 = [opposingLocalPts[i]!, opposingLocalPts[i + 1]!, opposingLocalPts[i + 2]!];
      if (q[2] < meanMarginZ) continue;
      for (const p of topPts) {
        const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
        if (d < best) best = d;
      }
    }
    if (Number.isFinite(best) && best < 8) occlusalClearanceMm = Math.round(best * 100) / 100;
  }

  let zMinLocal = Infinity;
  let zMaxLocal = -Infinity;
  let maxOuterR = 0;
  for (let i = 0; i < localPositions.length; i += 3) {
    const z = localPositions[i + 2]!;
    if (z < zMinLocal) zMinLocal = z;
    if (z > zMaxLocal) zMaxLocal = z;
    maxOuterR = Math.max(maxOuterR, Math.hypot(localPositions[i]!, localPositions[i + 1]!));
  }

  const cleanPatient = String(args.patientName || "")
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, "");
  const fileName = cleanPatient
    ? `${cleanPatient}_${fixture.toothNumber}_custom_abutment.stl`
    : `custom_abutment_${fixture.toothNumber}.stl`;

  const round2 = (v: number) => Math.round(v * 100) / 100;
  const design = buildDesignedCustomAbutment({
    fixture: {
      ...fixture,
      archOcclusalDir: trueOccWorld,
      labialDir: alignedLabialWorld,
      mesialDir: alignedMesialWorld,
    },
    fileName,
    localPositions,
    solidBodyLocalPositions: bodySoup,
    crownLocalPositions,
    marginLoopLocal,
    params,
    metrics: {
      connectionDiameterMm: conn.originDiameterMm,
      maxDiameterMm: round2(maxOuterR * 2),
      cuffHeightMinMm: round2(Math.min(...smoothMarginZ)),
      cuffHeightMaxMm: round2(Math.max(...smoothMarginZ)),
      postHeightMm: round2(zMaxLocal - finalMeanMarginZ),
      totalLengthMm: round2(zMaxLocal - zMinLocal),
      angulationDeg: Math.round(angulationDeg * 10) / 10,
      cutbackMm: round2(cutbackSum / ANGULAR_COLS),
      rmsMm: fixture.rmsMm,
      postTaperDeg: Math.round((taperMean / DEG) * 10) / 10,
      occlusalClearanceMm,
      marginFilletRadiusMm: round2(chamferRho),
      axisSource,
      adjacentOcclusalMm: Number.isFinite(archCrownTopH) ? round2(archCrownTopH) : null,
      crownOverPostMm: round2(meanCrownCuspH - dot3(sub3(postApex, c0), frame.w)),
    },
  });
  return { kind: "design", design };
}
