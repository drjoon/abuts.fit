// 매칭된 픽스쳐 자세와 구강스캔(잇몸·인접치·대합치)으로 커스텀어벗 STL을 설계한다.
// 치종별 형상은 추적관리 커스텀어벗 실측(266건) 중앙값 템플릿에서 출발해 스캔에 맞춘다.
// 1) 피니시라인 = 둘레 치은연 아래 marginDepth(기본 0.5mm), 마진 단면 = 치종 템플릿(잇몸 개구부로 크기 보정)
// 2) 삽입축 = 대합치 중심 방향(없으면 악궁 교합 방향). 치종별 상한, 한쪽으로 쏠리면 줄인다.
// 3) 예측 크라운 = 포스트 + 축벽 두께. 인접치·이웃 크라운과는 접촉량만 겹치고 대합치와는 접촉만 한다.
// 4) 포스트 = 오목 챔퍼(실측: 45° 시작, 폭 0.5mm, 곡률 ≥ 공구 R) → 편측 테이퍼 축벽(언더컷 없음)
//    → 윗면 라운드. 소·대구치 윗면은 평면, 최정점은 대합치에서 occlusalClearance만큼 아래.
//    예측 크라운 두께(목표 1mm, 공간 없으면 0.65mm)와 스크류 채널 벽을 지키고, 줄이는 양은 둘레로 퍼뜨린다.
// 5) 커프 = cuffBlend 방식(PRC 면 2° 시작 → 4° 유지 → 오목하게 벌어져 실측 각도로 피니시라인, 볼록 없음).
// 6) 닫힌 외형에서 스크류 채널을 빼서(manifold) 하나의 닫힌 STL을 만든다.
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
/** 스크류 채널 둘레 포스트 벽 최소 두께. */
const SCREW_WALL_MM = 0.35;
/** 윗면 라운드 반경. 축벽에 접선으로 이어진다(턱 없음). */
const TOP_ROUND_POSTERIOR_MM = 0.6;
const TOP_ROUND_ANTERIOR_MM = 0.52;
const TOP_ROUND_STEPS = 10;
/** 픽스쳐 사이가 이 안이면 붙은 치아로 보고 삽입축을 평행하게 맞춘다. */
const PARALLEL_GROUP_MM = 13;
/** 소·대구치 평평한 윗면의 최대 기울기. */
const FLAT_TOP_MAX_TILT = Math.tan(10 * DEG);
/** 전치에서 크라운 제한 때문에 포스트가 안으로 들어갈 때 아래로 벌어지는 최대 기울기. */
const POST_STEP_SLOPE = Math.tan(25 * DEG);
/** 전치에서 크라운 공간 때문에 깎은 축벽이 아래 원래 벽으로 돌아가는 사선. */
const POST_CUT_SLOPE = Math.tan(12 * DEG);
const POST_BASE_KEEP_MM = 0.12;
const POST_BASE_LEAN = Math.tan(35 * DEG);
const LINGUAL_CONVERGE_EARLIER = 0.2;
/** 임플란트 수직축이 대합치·가상치아 중앙에서 이 안에 들면 기울이지 않고 수직(0°)으로 세운다. */
const AXIS_VERTICAL_DEADZONE_POSTERIOR_MM = 1.8;
const AXIS_VERTICAL_DEADZONE_ANTERIOR_MM = 1.2;
/** 스캘럽 마진 진폭(근·원심 높고 협·설 낮음, 반진폭 mm = 최고~최저의 절반). 완만한 곡선만 그린다. */
const SCALLOP_MIN_POSTERIOR_MM = 0.35;
const SCALLOP_MAX_POSTERIOR_MM = 0.85;
const SCALLOP_MIN_ANTERIOR_MM = 0.55;
const SCALLOP_MAX_ANTERIOR_MM = 1.25;
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
/** 인접치 스캔으로 크라운을 자르는 높이(마진 위). 그 아래는 치간유두라 자르지 않는다. */
const CONTACT_CLIP_FROM_MM = 2.5;
/** 인접치·인접 기성 어벗과 마진 사이의 최소 유격(크라운 장착 시 간섭 방지: 내 크라운 출현 두께 + 인접 크라운 출현 두께 + 장착 여유). */
const ADJACENT_MARGIN_CLEARANCE_MM = 1.6;
/** 인접 디자인 크라운 중간 경계면에서 각 마진까지 띄우는 반유격(양쪽 합 최소 1.8mm). */
const NEIGHBOR_PLANE_MARGIN_GAP_MM = 0.9;
/** 피니시라인을 스캔 잇몸 안쪽 면보다 이만큼 안에 둔다(잇몸을 누르지 않게). */
const GINGIVA_INSET_MM = 0.2;
/** 마진은 치은선(크라운이 올라갈 잇몸 테두리) 아래 marginDepthMm(기본 0.5), 매끄럽게 할 때도 1.0mm보다 깊지 않다. */
const MARGIN_SUBG_MAX_MM = 1.0;
/** 치은선을 찾는 범위: 스캔바디 면에서 바깥으로 이만큼. 잇몸 터널이 벌어져 있으면 그 테두리가 치은선이다. */
const GINGIVA_RIM_REACH_MM = 2.6;
const GINGIVA_RIM_BIN_MM = 0.4;
/** 바깥 칸이 이보다 가파르게 솟으면 잇몸이 아니라 인접치 벽이다. */
const GINGIVA_RIM_MAX_STEP_MM = 1.0;
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

/**
 * 전치부(1·2·3번) 포스트 축벽의 정규화 높이 진행률 g(u) ∈ [0, 1] (u ∈ [0, 1]).
 * - 순측·근원심(linW = 0): g(u) = u (단차 없는 일직선 테이퍼 — 우리·알토란 전치부 STL 실측).
 * - 설·구개측(linW = 1): 하단 싱귤럼 구간(0..42%)은 완만하게 올라가다 smootherstep 적분으로
 *   C² 연속(단차·변곡 0)으로 전환되어 상단 58%는 일직선 구개측 사면으로 절단연에 모인다.
 */
function anteriorAxialProgress(u: number, linW: number): number {
  const x = clamp(u, 0, 1);
  const alpha = 1 - 0.66 * clamp(linW, 0, 1);
  const tau = 0.42;
  const beta = (1 - 0.5 * alpha * tau) / (1 - 0.5 * tau);
  if (x <= tau) {
    return alpha * x + (beta - alpha) * tau * smootherstepIntegral(x / tau);
  }
  return 0.5 * (alpha + beta) * tau + beta * (x - tau);
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

/**
 * 교합면에서 본 치종별 해부 단면 반경(우리치과기공소·알토란치과기공소 STL 실측 기반).
 * - 대구치(molar): 타원에 가까운 둥근 모서리 사각형 (superellipse n ≈ 2.55)
 * - 소구치(premolar): 계란형 타원 (n ≈ 2.08, 협측 완만·설측 약간 좁아짐)
 * - 견치(canine): 둥근 모서리 삼각형 (순측 호 + 근·원심 우각 + 설측 결절로 좁아짐)
 * - 전치(incisor): 납작한 타원체 (순설 방향으로 납작하고 근원심으로 퍼진 타원, n ≈ 2.15)
 */
function toothOcclusalSectionRadius(kind: ToothKind, aBl: number, bMd: number, phi: number): number {
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  if (kind === "molar") {
    return superellipseRadius(aBl, bMd, phi, 2.55);
  }
  if (kind === "premolar") {
    const eggWidth = 1 + 0.055 * cp;
    return superellipseRadius(aBl, bMd * eggWidth, phi, 2.08);
  }
  if (kind === "canine") {
    // 순측(cp > 0)에서는 근원심이 넓게 퍼져 두 우각을 이루고, 설측(cp < 0)으로 갈수록 설측 결절 하나로 모이는 둥근 삼각형.
    const triWidth = 1 + 0.16 * cp;
    const base = superellipseRadius(aBl, bMd * triWidth, phi, 2.35);
    const corner3 = 1 - 0.045 * Math.cos(3 * phi);
    return base * corner3;
  }
  // incisor: 납작한 타원체 (순측은 살짝 더 평평하고 설측은 부드러운 타원)
  const incisorWidth = 1 + 0.05 * cp;
  return superellipseRadius(aBl, bMd * incisorWidth, phi, 2.15);
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
): number[] {
  const n = radii.length;
  const r = [...radii];
  const th = Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2);
  const cosT = th.map(Math.cos);
  const sinT = th.map(Math.sin);

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

  const sampled = th.map((_, i) => {
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
      const x1 = out[i]! * cosT[i]!;
      const y1 = out[i]! * sinT[i]!;
      const x2 = r2 * cosT[i2]!;
      const y2 = r2 * sinT[i2]!;
      if ((x1 - x0) * (y2 - y1) - (y1 - y0) * (x2 - x1) < -1e-7) {
        const chordR = (2 * r0 * r2 * Math.cos((Math.PI * 2) / n)) / Math.max(r0 + r2, 1e-6);
        if (chordR > out[i]!) {
          out[i] = chordR + 1e-5;
          fixedAny = true;
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
      marginBlMm: upper ? 5.95 : 5.45, marginMdMm: upper ? 4.95 : 4.85,
      topLabialHalfMm: upper ? 2.25 : 2.05, topLingualHalfMm: upper ? 2.15 : 1.95,
      topMdMm: upper ? 3.65 : 3.5,
      postHeightMm: upper ? 5.6 : 6.0, naturalMdMm: 7.0,
      naturalBlMm: upper ? 9.0 : pos === 4 ? 7.5 : 8.0,
      lingualTopDropMm: 0.2,
      crownLabialMm: 1.2, crownLingualMm: 1.1, crownOcclusalMm: 1.8,
    };
  }
  const second = pos === 7 || pos === 8;
  return {
    kind: "molar", anterior: false,
    marginBlMm: upper ? 6.05 : 5.85, marginMdMm: upper ? 7.05 : 6.95,
    topLabialHalfMm: upper ? 2.35 : 2.25, topLingualHalfMm: upper ? 2.35 : 2.25,
    topMdMm: upper ? 5.55 : 5.45,
    postHeightMm: upper ? 5.5 : 5.3,
    naturalMdMm: upper ? (second ? 9.5 : 10.2) : second ? 10.5 : 11.0,
    naturalBlMm: upper ? 11.0 : second ? 10.0 : 10.5,
    lingualTopDropMm: 0.15,
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

function frustumSoup(r0: number, r1: number, z0: number, z1: number, segments = 64): Float32Array {
  const out = new Float32Array(segments * 4 * 9);
  let o = 0;
  const put = (p: Vec3) => {
    out[o++] = p[0];
    out[o++] = p[1];
    out[o++] = p[2];
  };
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const p00: Vec3 = [r0 * Math.cos(a0), r0 * Math.sin(a0), z0];
    const p10: Vec3 = [r0 * Math.cos(a1), r0 * Math.sin(a1), z0];
    const p01: Vec3 = [r1 * Math.cos(a0), r1 * Math.sin(a0), z1];
    const p11: Vec3 = [r1 * Math.cos(a1), r1 * Math.sin(a1), z1];
    put(p00); put(p10); put(p11);
    put(p00); put(p11); put(p01);
    put([0, 0, z0]); put(p10); put(p00);
    put([0, 0, z1]); put(p01); put(p11);
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

/** 대합치 교합면(가까운 면) 중심. 삽입축 주변 5mm 안을 가우시안 가중으로 평균한다. */
function opposingCenterPoint(
  pts: Float32Array,
  c0: Vec3,
  frame: InsertionFrame,
): Vec3 | null {
  const field = buildOpposingHeightField(pts, c0, frame, 6);
  if (field.list.length < 12) return null;
  let minH = Infinity;
  for (const cell of field.list) {
    if (Math.hypot(cell.u, cell.v) <= 4 && cell.h < minH) minH = cell.h;
  }
  if (!Number.isFinite(minH)) return null;
  let sw = 0;
  let su = 0;
  let sv = 0;
  let sh = 0;
  for (const cell of field.list) {
    if (cell.h > minH + 4) continue;
    const lat = Math.hypot(cell.u, cell.v);
    if (lat > 5) continue;
    const wgt = Math.exp(-(lat * lat) / (2 * 2.5 * 2.5));
    sw += wgt;
    su += cell.u * wgt;
    sv += cell.v * wgt;
    sh += cell.h * wgt;
  }
  if (sw < 1e-6) return null;
  return add3(
    c0,
    add3(
      scale3(frame.w, sh / sw),
      add3(scale3(frame.uLabial, su / sw), scale3(frame.vSide, sv / sw)),
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

/** 같은 악에서 픽스쳐 사이가 PARALLEL_GROUP_MM 안으로 이어진 치아 묶음(자신 포함). */
function parallelGroupOf(
  fixture: MatchedScanbodyFixture,
  all: readonly MatchedScanbodyFixture[],
): MatchedScanbodyFixture[] {
  const pool = [fixture, ...all.filter((f) => f.toothNumber !== fixture.toothNumber && f.jaw === fixture.jaw)];
  const group = [fixture];
  const seen = new Set([fixture.toothNumber]);
  for (let i = 0; i < group.length; i += 1) {
    for (const f of pool) {
      if (seen.has(f.toothNumber)) continue;
      const d = Math.hypot(...sub3(f.fixturePose.origin, group[i]!.fixturePose.origin));
      if (d > PARALLEL_GROUP_MM) continue;
      seen.add(f.toothNumber);
      group.push(f);
    }
  }
  return group;
}

/**
 * 구강스캔(잇몸·인접치·대합치)과 치종 템플릿으로 커스텀어벗과 예측 크라운 외형을 설계한다.
 * neighbors: 같은 악의 다른 디자인 대상 픽스쳐. 두 크라운 경계면으로 서로 떨어뜨리고,
 * 붙은 치아끼리는 삽입축(포스트 패쓰)을 평행하게 맞춘다. 각 치아 각도 상한은 그대로 지킨다.
 */
export async function designCustomAbutmentStl(args: DesignArgs): Promise<DesignedCustomAbutment> {
  const group = parallelGroupOf(args.fixture, args.neighbors ?? []);
  let groupAxisWorld: Vec3 | null = null;
  if (group.length > 1) {
    const autoParams = { ...(args.params ?? {}), axisShiftLabialMm: 0, axisShiftMesialMm: 0 };
    let sum: Vec3 = [0, 0, 0];
    for (const f of group) {
      const axis = await autoAxisWorld({
        ...args,
        fixture: f,
        neighbors: [args.fixture, ...(args.neighbors ?? [])].filter((n) => n.toothNumber !== f.toothNumber),
        params: autoParams,
      });
      sum = add3(sum, axis);
    }
    groupAxisWorld = norm3(sum);
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
  const taperSlope = Math.tan(params.postTaperDeg * DEG);
  const chamfer = chamferGeometry(shoulderW, R, taperSlope);
  const posterior = !abutmentTemplateForTooth(fixture.toothNumber).anterior;
  const contact = params.crownContactMm;
  const clearance = params.occlusalClearanceMm;

  const jawLocalAll = cropScanPointsInFixtureFrame(jawGeometry, fixture.fixturePose, 17);
  const opposingLocalPts = cropScanPointsInFixtureFrame(opposingGeometry, fixture.fixturePose, 17);

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
      if (t < -0.5 || t > nb.height + 1) continue;
      if (Math.hypot(...sub3(rel, scale3(nb.axis, t))) < nb.radius + 0.7) {
        onNeighbor = true;
        break;
      }
    }
    if (!onNeighbor) jawKeep.push(p[0], p[1], p[2]);
  }
  const jawLocalPts = new Float32Array(jawKeep);

  const occInFix = worldDirToFixtureLocal(fixture.archOcclusalDir, fixture.fixturePose);
  const labInFix = worldDirToFixtureLocal(fixture.labialDir, fixture.fixturePose);
  const labXY = norm3([labInFix[0], labInFix[1], 0]);
  let mesXY: Vec3 = [-labXY[1], labXY[0], 0];
  if (fixture.mesialDir) {
    const mesInFix = worldDirToFixtureLocal(fixture.mesialDir, fixture.fixturePose);
    if (dot3(mesXY, mesInFix) < 0) mesXY = scale3(mesXY, -1);
  }
  const labialAngleFix = Math.atan2(labXY[1], labXY[0]);

  // 의뢰 내역(toothWorks)에서 바로 옆 근심·원심 치아가 스캔에 찍힌 직접어벗(심플어벗 등 customAbutmentSelection="abutment")이거나
  // 프렙 지대치(크라운·브리지 보철 대상)인지, 그리고 브리지로 연결되는지 읽어 인접 크라운 벽 두께 여유를 계산한다.
  const ownFdi = parseFdiTooth(fixture.toothNumber);
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
  const maxMarginZ = Math.min(8.0, medianRimZ + 1.4);
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
  const scallopMin = posterior ? SCALLOP_MIN_POSTERIOR_MM : SCALLOP_MIN_ANTERIOR_MM;
  const scallopMax = posterior ? SCALLOP_MAX_POSTERIOR_MM : SCALLOP_MAX_ANTERIOR_MM;
  // c2Scallop > 0 이면 근·원심(φ=±π/2, -cos 2φ=+1)이 높고 협·설(φ=0, π, -cos 2φ=-1)이 낮다.
  const scallopAmp = clamp(Math.max(scallopMin, c2Scallop), scallopMin, scallopMax);
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
  const frameFix = insertionFrame([0, 0, 1], labXY);

  // 인접 자연치 접촉 높이(마진 위 3~7mm)만 본다. 그 아래는 치간유두 잇몸이라 간격이 작게 잡힌다.
  const adjBuckets: number[][] = Array.from({ length: SECTORS }, () => []);
  // 양옆이 자연치인지(접촉 높이 위로 솟은 점). 잇몸 둔덕만 있는 쪽은 크라운 크기를 맞추는 기준이 아니다.
  const tallSide: [number[], number[]] = [[], []];
  for (let i = 0; i < jawLocalPts.length; i += 3) {
    const p: Vec3 = [jawLocalPts[i]!, jawLocalPts[i + 1]!, jawLocalPts[i + 2]!];
    const rel = sub3(p, c0);
    const h = dot3(rel, frame0.w);
    const mesSign0 = dot3(frame0.vSide, mesXY) >= 0 ? 1 : -1;
    const isWisdomDistal0 = parseFdiTooth(fixture.toothNumber)?.pos === 8 && dot3(rel, frame0.vSide) * mesSign0 < 0;
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

  // ── 3) 삽입축: 임플란트 수직축(+Z)을 기본으로 지키고, 대합치·가상치아에서 많이 벗어난 만큼만 최소한 기울인다.
  let w: Vec3 = [0, 0, 1];
  let axisSource: CustomAbutmentDesignMetrics["axisSource"] = "arch";
  const deadzoneMm = posterior ? AXIS_VERTICAL_DEADZONE_POSTERIOR_MM : AXIS_VERTICAL_DEADZONE_ANTERIOR_MM;
  if (opposingLocalPts.length > 0 && params.axisToOpposing > 0) {
    // 임플란트 수직축(+Z) 기준으로 대합치 교합면 중심이 어디에 있는지 먼저 본다.
    let center = opposingCenterPoint(opposingLocalPts, c0, frameFix);
    if (center) {
      const rel0 = sub3(center, c0);
      const lat0 = Math.hypot(rel0[0], rel0[1]);
      if (lat0 > deadzoneMm * 1.4) {
        const wSeed = norm3(rel0);
        center = opposingCenterPoint(opposingLocalPts, c0, insertionFrame(wSeed, labXY)) ?? center;
      }
      const rel = sub3(center, c0);
      // 대합치 중심과 가상 치아 근원심 중심을 함께 본 목표점.
      const sideSignFix = dot3(frameFix.vSide, frame0.vSide) >= 0 ? 1 : -1;
      const targetLatX = rel[0] * 0.75 + frameFix.vSide[0] * crownCenterV * sideSignFix * 0.25;
      const targetLatY = rel[1] * 0.75 + frameFix.vSide[1] * crownCenterV * sideSignFix * 0.25;
      const lat = Math.hypot(targetLatX, targetLatY);
      const refZ = Math.max(rel[2], tpl.postHeightMm + 1.5);
      // 데드존 안(임플란트 수직축이 대합치 중앙을 지남)이면 수직(0°) 유지, 밖이면 초과분만 완만히 반영한다.
      const excess = Math.max(0, lat - deadzoneMm) * (posterior ? 0.65 : 0.8) * params.axisToOpposing;
      const wOpp: Vec3 =
        excess > 1e-4 && lat > 1e-6
          ? norm3([(targetLatX / lat) * excess, (targetLatY / lat) * excess, refZ])
          : [0, 0, 1];
      w = slerpDir([0, 0, 1], wOpp, params.axisToOpposing);
      axisSource = "opposing";
    }
  }
  if (axisSource === "arch") {
    const H = tpl.postHeightMm;
    // 대합치가 없을 때도 수직축을 우선하고, 악궁 축과 많이 어긋날 때만 절반 이하로 따라간다.
    const archLatMm = Math.tan(archTilt) * H;
    const archExcess = Math.max(0, archLatMm - deadzoneMm) * 0.55;
    let offX = occLat > 1e-5 ? (occInFix[0] / occLat) * archExcess : 0;
    let offY = occLat > 1e-5 ? (occInFix[1] / occLat) * archExcess : 0;
    const shiftExcess = Math.sign(sideShiftMm) * Math.max(0, Math.abs(sideShiftMm) - 0.35) * 0.5;
    offX -= labXY[1] * shiftExcess;
    offY += labXY[0] * shiftExcess;
    if (tpl.anterior) {
      // 대합치를 못 찾은 전치: 스크류홀이 절단연 순측으로 뚫리지 않을 만큼만 순측 기울기를 허용한다.
      const labComp = offX * labXY[0] + offY * labXY[1];
      const want = Math.min(0.9, Math.tan(tiltCapRad) * H * 0.6);
      if (labComp < want) {
        offX += labXY[0] * (want - labComp);
        offY += labXY[1] * (want - labComp);
      }
    }
    w = norm3([offX / H, offY / H, 1]);
  }
  if (mode.probeAxis) return { kind: "axis", axisWorld: fixtureLocalDirToWorld(w, fixture.fixturePose) };
  if (mode.groupAxisWorld) {
    w = worldDirToFixtureLocal(mode.groupAxisWorld, fixture.fixturePose);
    axisSource = "parallel";
  }
  if (params.axisShiftLabialMm !== 0 || params.axisShiftMesialMm !== 0) {
    const H = tpl.postHeightMm;
    const top = add3(
      scale3(w, H / Math.max(w[2], 0.2)),
      add3(scale3(labXY, params.axisShiftLabialMm), scale3(mesXY, params.axisShiftMesialMm)),
    );
    w = norm3(top);
  }
  const effectiveTiltCapRad = posterior ? Math.min(tiltCapRad, 9 * DEG) : tiltCapRad;
  w = capTilt(w, params.axisShiftLabialMm !== 0 || params.axisShiftMesialMm !== 0 ? tiltCapRad : effectiveTiltCapRad);
  {
    // 포스트 윗면이 마진 한쪽으로 너무 나가면(구치 42%, 전치 52%, 평행 맞춤 70% 초과) 기울기를 줄인다.
    const H = tpl.postHeightMm;
    const allowRatio = mode.groupAxisWorld ? 0.7 : posterior ? 0.42 : 0.52;
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
  // 전치에서 포스트가 가상 크라운(인접치 순측선) 밖으로 나가면 크라운 두께만큼 들어오도록 설측으로 옮긴다.
  // 소·대구치는 대합치 중앙을 기준으로 한 수직 삽입축을 지키고, 인접치 순측선 때문에 포스트 축을 기울이지 않는다.
  if (labialLimit && !posterior && !mode.groupAxisWorld) {
    const H = tpl.postHeightMm;
    const hRef = H * 0.75;
    const postLab = tpl.topLabialHalfMm * blScale * params.postWidthScale + 0.3;
    let moved = 0;
    for (let iter = 0; iter < 3 && moved < AXIS_LINGUAL_SHIFT_MAX_MM; iter += 1) {
      const fr = insertionFrame(w, labXY);
      const lim = labialLimitAt(fr.uLabial, hRef, fr.w);
      if (!Number.isFinite(lim)) break;
      const need = Math.min(postLab + params.minCrownThicknessMm - lim, AXIS_LINGUAL_SHIFT_MAX_MM - moved);
      if (need <= 0.05) break;
      w = capTilt(norm3(add3(scale3(w, H / Math.max(w[2], 0.2)), scale3(labXY, (-need * H) / hRef))), effectiveTiltCapRad);
      moved += need;
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
  /** 가상 치아의 dir 방향 반경(높이 h). 마진(r0)에서 풍융부까지 올라온 뒤 교합·절단 쪽으로 좁아진다. */
  const naturalCrownR = (dir: Vec3, h: number, h0: number, r0: number, hCrownTop: number) => {
    const du = dot3(dir, frame.uLabial);
    const dv = dot3(dir, frame.vSide);
    const s = clamp((h - h0) / Math.max(hCrownTop - h0, 1), 0, 1);
    const fa = tpl.anterior
      ? 1 - 0.7 * smootherstep(clamp((s - 0.3) / 0.7, 0, 1))
      : 1 - 0.16 * smootherstep(clamp((s - 0.62) / 0.38, 0, 1));
    const fb = tpl.anterior
      ? 1 - 0.12 * smootherstep(clamp((s - 0.7) / 0.3, 0, 1))
      : 1 - 0.16 * smootherstep(clamp((s - 0.62) / 0.38, 0, 1));
    let t = ellipseRay(du, dv, natHalfBl * fa, crownHalfMd * fb, crownCenterU * fa, crownCenterV * crownSideSign);
    if (Number.isFinite(t) && contraMirror) {
      const anatPhi = wrapAngle(Math.atan2(dv * mesialSignOnV, du));
      const mirrorRatio = evalPeriodicLinear(contraMirror.contourRatio, anatPhi);
      const bodyW = Math.sin(Math.PI * clamp(s, 0.05, 0.95));
      t *= 1 + (mirrorRatio - 1) * 0.65 * bodyW;
    }
    const emerge = smootherstep(clamp((h - h0) / (tpl.anterior ? 2.5 : 2.1), 0, 1));
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
            isWisdom: parseFdiTooth(fixture.toothNumber)?.pos === 8,
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
  const crownTopTarget =
    posterior && hasOpposing
      ? Infinity
      : Number.isFinite(archCrownTopH)
        ? archCrownTopH
        : Infinity;

  // ── 5) 이웃 디자인 크라운 경계면, 인접치 스캔 제한
  const crownMid = add3(c0, scale3(frame.w, 3.5));
  const planes = neighbors.map((nb) => {
    const nbMid = add3(nb.origin, scale3(nb.axis, meanMarginZ + 3.5));
    let n = sub3(nbMid, crownMid);
    n = sub3(n, scale3(frame.w, dot3(n, frame.w)));
    return { point: scale3(add3(crownMid, nbMid), 0.5), normal: norm3(n) };
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

  const scanLimit = new Float32Array(LIMIT_PHI_BINS * LIMIT_H_BINS).fill(Infinity);
  const isWisdomTooth = parseFdiTooth(fixture.toothNumber)?.pos === 8;
  for (let i = 0; i < jawLocalPts.length; i += 3) {
    const p: Vec3 = [jawLocalPts[i]!, jawLocalPts[i + 1]!, jawLocalPts[i + 2]!];
    if (Math.hypot(p[0], p[1]) < sbR + 0.4 && p[2] > 0 && p[2] < sbH + 1) continue;
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
    if (r < 2 || r > 10) continue;
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
  // 근심·원심 방향(±48° 부채꼴)에서 그 방향의 실제 피니시라인 높이(zMargin) 위로 2.2mm 이상 우뚝 솟은
  // 인접 치아·기성 어벗 외벽까지의 반경을 구한다. 평균 마진 높이(meanMarginZ) 대신 각도별 피니시라인 높이를
  // 기준으로 써야 후구치 삼각 융기처럼 경사진 원심 잇몸을 인접 치아로 오인하지 않고, 근심의 인접 기성 어벗은 정확히 잡는다.
  const adjCoreMaxAboveMargin = new Float32Array(LIMIT_PHI_BINS).fill(-Infinity);
  const adjStructureWallR = new Float32Array(LIMIT_PHI_BINS).fill(Infinity);
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
    // 인접치·인접 어벗이 놓일 수 있는 근심·원심(±42°) 중에서도, 실제로 옆 치아/어벗이 감지된 쪽만 건다.
    // 최후방 사랑니(#18,#28,#38,#48)의 원심은 해부학적으로 항상 후구치 삼각 융기(무치악)이므로 제외한다.
    const vSigned = v * crownSideSign;
    const isDistalOfWisdom =
      parseFdiTooth(fixture.toothNumber)?.pos === 8 && v * mesialSignOnV < 0;
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
    if (hAboveMargin >= 1.8 && hAboveMargin <= 8.5 && r < adjStructureWallR[pb]!) {
      adjStructureWallR[pb] = r;
    }
  }
  const adjacentStructureWallAt = (phi: number) => {
    const pb = Math.floor((wrapAngle(phi) / (Math.PI * 2)) * LIMIT_PHI_BINS);
    let best = Infinity;
    for (let dp = -2; dp <= 2; dp += 1) {
      const pp = (pb + dp + LIMIT_PHI_BINS) % LIMIT_PHI_BINS;
      if (adjCoreMaxAboveMargin[pp]! < 2.4) continue;
      if (adjStructureWallR[pp]! < best) best = adjStructureWallR[pp]!;
    }
    return best;
  };

  // 마진 반경: 치종 해부 단면(대구치 둥근 4각형, 소구치 계란형 타원, 견치 둥근 삼각형, 전치 납작한 타원체)을 기본으로 하고,
  // 인접 디자인 어벗 경계면(NEIGHBOR_PLANE_MARGIN_GAP_MM)과 인접 자연치/기성어벗 측벽(ADJACENT_MARGIN_CLEARANCE_MM)에서 충분히 띄운다.
  const meanTemplateR = (marginA + marginB) / 2;
  const uniformTissueScale = Number.isFinite(medianTissueR)
    ? clamp(1 + 0.35 * (medianTissueR / Math.max(meanTemplateR, 1) - 1), 0.96, 1.14)
    : 1;
  const marginWant: number[] = [];
  const marginCap: number[] = [];
  for (let col = 0; col < ANGULAR_COLS; col += 1) {
    const theta = (col / ANGULAR_COLS) * Math.PI * 2;
    const rTemplate = toothOcclusalSectionRadius(tpl.kind, marginA, marginB, theta - labialAngleFix);
    marginWant.push(Math.max(minMarginRadius, rTemplate * uniformTissueScale));
    const radialFix: Vec3 = [Math.cos(theta), Math.sin(theta), 0];
    const dirInFrame = norm3(sub3(radialFix, scale3(frame.w, dot3(radialFix, frame.w))));
    const phiInFrame = Math.atan2(dot3(dirInFrame, frame.vSide), dot3(dirInFrame, frame.uLabial));
    const limPlane = planeLimitAt(
      dirInFrame,
      evalPeriodicLinear(smoothMarginZ, theta) - meanMarginZ,
    );
    let limR = Number.isFinite(limPlane) ? limPlane - NEIGHBOR_PLANE_MARGIN_GAP_MM : Infinity;
    const adjWall = adjacentStructureWallAt(phiInFrame);
    if (Number.isFinite(adjWall)) {
      limR = Math.min(limR, adjWall - ADJACENT_MARGIN_CLEARANCE_MM);
    }
    if (gingivaInnerR) limR = Math.min(limR, evalPeriodicLinear(gingivaInnerR, theta) - GINGIVA_INSET_MM);
    marginCap.push(Number.isFinite(limR) ? Math.max(minMarginRadius, limR) : Infinity);
  }
  let marginRadii = smoothCircularReduce(marginWant, marginCap, 5, 8).map((r) =>
    Math.max(minMarginRadius, r),
  );
  // 인접 유격으로 근·원심이 줄어들면 반대쪽 근·원심도 균형 있게 맞추고, 치종 본래의 MD/BL 비례가 깨지지 않게 협·설측도 함께 비례 축소한다.
  {
    let sideShort = 0;
    for (let col = 0; col < ANGULAR_COLS; col += 1) {
      const phi = (col / ANGULAR_COLS) * Math.PI * 2 - labialAngleFix;
      if (Math.abs(Math.sin(phi)) > 0.7) {
        sideShort = Math.max(sideShort, marginWant[col]! - marginRadii[col]!);
      }
    }
    if (sideShort > 0.15) {
      const symReduce = Math.min(0.65, sideShort * 0.75);
      marginRadii = marginRadii.map((r, col) => {
        const phi = (col / ANGULAR_COLS) * Math.PI * 2 - labialAngleFix;
        const wSide = Math.sin(phi) ** 2;
        const symWant = marginWant[col]! - symReduce * wSide;
        return Math.max(minMarginRadius, Math.min(r, symWant));
      });
      if (tpl.kind === "molar") {
        // 대구치 실측(우리·알토란 123건)처럼 근원심이 협설보다 길게(MD/BL ≥ 1.12) 유지되도록 협·설 폭을 비례로 맞춘다.
        let mdSum = 0;
        let blSum = 0;
        for (let col = 0; col < ANGULAR_COLS; col += 1) {
          const phi = (col / ANGULAR_COLS) * Math.PI * 2 - labialAngleFix;
          if (Math.abs(Math.sin(phi)) > 0.96) mdSum += marginRadii[col]!;
          if (Math.abs(Math.cos(phi)) > 0.96) blSum += marginRadii[col]!;
        }
        const curRatio = blSum > 1e-3 ? mdSum / blSum : 1;
        const minMolarRatio = 1.14;
        if (curRatio < minMolarRatio) {
          const blFactor = clamp(curRatio / minMolarRatio, 0.78, 1);
          marginRadii = marginRadii.map((r, col) => {
            const phi = (col / ANGULAR_COLS) * Math.PI * 2 - labialAngleFix;
            const scaleBl = 1 - (1 - blFactor) * Math.cos(phi) ** 2;
            return Math.max(minMarginRadius, r * scaleBl);
          });
        }
      }
    }
    // 피니시라인 평면 윤곽의 오목·굴곡을 모두 없애고 marginCap 안쪽의 매끄러운 볼록 곡선으로 마감한다.
    const minMarginArr = new Array<number>(ANGULAR_COLS).fill(minMarginRadius);
    marginRadii = convexInscribedSmoothRadii(marginRadii, minMarginArr, 18);
  }
  // 평균 크라운을 옮긴 뒤에도 풍융부에서 마진 위 축벽 + 최소 두께가 들어가야 한다. 모자라면 옮긴 양을 줄인다.
  for (let iter = 0; iter < 12; iter += 1) {
    let short = 0;
    for (let col = 0; col < ANGULAR_COLS; col += 4) {
      const theta = (col / ANGULAR_COLS) * Math.PI * 2;
      const radialFix: Vec3 = [Math.cos(theta), Math.sin(theta), 0];
      const dir = norm3(sub3(radialFix, scale3(frame.w, dot3(radialFix, frame.w))));
      const t = ellipseRay(
        dot3(dir, frame.uLabial),
        dot3(dir, frame.vSide),
        natHalfBl,
        crownHalfMd,
        crownCenterU,
        crownCenterV * crownSideSign,
      );
      const need = marginRadii[col]! - shoulderW + params.minCrownThicknessMm;
      short = Math.max(short, Number.isFinite(t) ? need - t : Infinity);
    }
    if (short <= 0.02) break;
    crownCenterU *= 0.8;
    crownCenterV *= 0.8;
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
      ? Math.max(0.6, r0 - shoulderW - 0.8)
      : cLab >= 0
        ? Math.min(1.15, Math.max(0.55, r0 - shoulderW - 0.6))
        : Math.min(0.85, Math.max(0.45, r0 - shoulderW - 1.0));
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

    const rBase0 = r0 - shoulderW;
    const hBase = h0 + chamfer.height;
    const labBlend = smootherstep((cLab + 1) * 0.5);
    const topA =
      (tpl.topLingualHalfMm + (tpl.topLabialHalfMm - tpl.topLingualHalfMm) * labBlend) *
      blScale *
      params.postWidthScale;
    const rTpl = toothOcclusalSectionRadius(tpl.kind, topA, topB, phi);
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
      // 소·대구치 포스트는 일직선 테이퍼, 전치부는 순·근원심 일직선 + 설·구개측 싱귤럼→사면 C² 연속 곡선으로 올라간다.
      postDesired: (h: number) => {
        const straight =
          rBase0 * Math.min(1, params.postWidthScale) - taperSlope * Math.max(0, h - hBase);
        if (posterior) return straight;
        const span = Math.max(0.5, plan.hTop - topRoundMm - hBase);
        const u = clamp((h - hBase) / span, 0, 1);
        const rStart = rBase0 * Math.min(1, params.postWidthScale);
        const rEndTarget = Math.min(rStart - taperSlope * span, rTpl);
        return rStart - Math.max(0, rStart - rEndTarget) * anteriorAxialProgress(u, linW);
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

  /** 피니시라인 위 오목 챔퍼 점(열마다 같은 개수). 폭 width·높이 height, 축벽 기울기에 접한다. */
  const th1 = Math.atan(taperSlope);
  const chamferPoints = (r0: number, h0: number, width: number, height: number) => {
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
        const clipStartAboveMargin =
          sideAllowanceOf(c.phi).wallMm > 0 ? 0.8 : CONTACT_CLIP_FROM_MM;
        if (h >= c.h0 + clipStartAboveMargin) {
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
        const clipStartAboveMargin =
          sideAllowanceOf(c.phi).wallMm > 0 ? 0.8 : CONTACT_CLIP_FROM_MM;
        if (c.crownH[k]! >= c.h0 + clipStartAboveMargin) {
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
        c.crownR[k] = Math.max(c.r0 * 0.9, postFloor, ring[col]!);
      }
    }
    const crownRadiusAt = (c: ColumnPlan, h: number) => {
      const f = ((h - c.h0) / (c.hTop - c.h0)) * CROWN_LEVELS;
      if (f <= 1) return c.r0 + (c.crownR[0]! - c.r0) * clamp(f, 0, 1);
      const i = Math.min(CROWN_LEVELS - 1, Math.floor(f));
      const t = clamp(f - i, 0, 1);
      return c.crownR[i - 1]! * (1 - t) + c.crownR[Math.min(i, CROWN_LEVELS - 1)]! * t;
    };

    // 포스트 단면: 원하는 형상 → 크라운 두께(목표, 공간 없으면 0.65mm까지) → 스크류 채널 벽
    // → 줄이는 양을 둘레·높이로 퍼뜨림(매끄러운 면) → 언더컷 없음(위로 갈수록 작거나 같다)
    const minPostR = 0.9;
    /** 아래로 벌어지는 기울기 한도 → 위로 갈수록 작거나 같다(언더컷 없음). */
    const enforcePostProfile = (rs: number[], hs: readonly number[]) => {
      for (let k = POST_LEVELS - 1; k >= 0; k -= 1) {
        rs[k] = Math.min(rs[k]!, rs[k + 1]! + POST_STEP_SLOPE * (hs[k + 1]! - hs[k]!));
      }
      for (let k = 1; k <= POST_LEVELS; k += 1) rs[k] = Math.min(rs[k]!, rs[k - 1]!);
    };
    const postR: number[][] = [];
    const postH: number[][] = [];
    const deficit: number[][] = [];
    const floorR: number[][] = [];
    const capR: number[][] = [];
    const hardCapR: number[][] = [];
    for (const c of cols) {
      const hBase = c.h0 + hPostBase;
      const roundStart = c.hTop - topRoundMm * 0.9;
      const hs: number[] = [];
      const rs: number[] = [];
      const ds: number[] = [];
      const fs: number[] = [];
      const cs: number[] = [];
      const hc: number[] = [];
      for (let k = 0; k <= POST_LEVELS; k += 1) {
        const h = hBase + ((roundStart - hBase) * k) / POST_LEVELS;
        const want = k === 0 ? Math.min(c.postDesired(h), c.r0 - shoulderW) : c.postDesired(h);
        const rawScrewFloor = (h / Math.max(frame.w[2], 0.2)) * c.dir[2] + boreTopR + SCREW_WALL_MM;
        // 구치는 교합면 끝까지 스크류 채널 둘레 벽을 감싸고, 전치(1·2·3번)는 하단 싱귤럼 칼라(0..34%)까지만 감싼 뒤
        // 상단은 구개 사면으로 스크류홀이 자연스럽게 열리면서 해부학적 절단연 두께(BL ~1.6~2.1mm)로 모이게 한다(우리·알토란 전치 STL 실측).
        const screwFloor = posterior
          ? Math.max(minPostR, rawScrewFloor)
          : (() => {
              const uLevel = k / POST_LEVELS;
              const collarKeep = 1 - smootherstep(clamp((uLevel - 0.32) / 0.38, 0, 1));
              const bladeFloor = 0.75;
              return Math.max(bladeFloor, bladeFloor + (Math.max(bladeFloor, rawScrewFloor) - bladeFloor) * collarKeep);
            })();
        let cap = Infinity;
        let hardCap = Infinity;
        if (h >= c.h0 + hPostBase + 0.3) {
          // 크라운 벽은 마진에서 0으로 시작해 1.8mm 위에서 제 두께가 된다. 요구 두께도 같이 올린다.
          const crown = crownRadiusAt(c, h);
          const ramp = smootherstep((h - c.h0) / 1.8);
          cap = crown - params.minCrownThicknessMm * ramp;
          hardCap = crown - CROWN_THICKNESS_FLOOR_MM * ramp;
          if (cap < screwFloor) cap = Math.max(cap, Math.min(screwFloor, hardCap));
        }
        hs.push(h);
        rs.push(want);
        cs.push(cap);
        hc.push(hardCap);
        ds.push(Math.max(0, want - cap));
        fs.push(
          Number.isFinite(hardCap) ? Math.min(screwFloor, hardCap) : screwFloor,
        );
      }
      // 깎는 곳 아래는 사선(POST_CUT_SLOPE)으로 원래 축벽까지 내려가고, 그 아래는 그대로 수직이다.
      // 마진 위 숄더가 넓어지지 않는다(기공소 샘플: 숄더 0.3~0.4mm). 언더컷 없음은 아래에서 다시 건다.
      for (let k = POST_LEVELS - 1; k >= 0; k -= 1) {
        ds[k] = Math.max(ds[k]!, ds[k + 1]! - POST_CUT_SLOPE * (hs[k + 1]! - hs[k]!));
      }
      // 숄더 바로 위는 거의 그대로 두고 POST_BASE_LEAN 기울기로 안쪽으로 들어간다(숄더가 넓어지지 않게).
      for (let k = 0; k <= POST_LEVELS; k += 1) {
        ds[k] = Math.min(ds[k]!, POST_BASE_KEEP_MM + POST_BASE_LEAN * (hs[k]! - hs[0]!));
      }
      const hard = rs.map((w, k) => Math.max(fs[k]!, w - ds[k]!));
      enforcePostProfile(hard, hs);
      for (let k = 0; k <= POST_LEVELS; k += 1) ds[k] = Math.max(0, rs[k]! - hard[k]!);
      postH.push(hs);
      postR.push(rs);
      deficit.push(ds);
      floorR.push(fs);
      capR.push(cs);
      hardCapR.push(hc);
    }
    const spread: number[][] = deficit.map((ds) => [...ds]);
    for (let k = 0; k <= POST_LEVELS; k += 1) {
      const dil = cols.map((_, col) => {
        let m = 0;
        for (let dc = -8; dc <= 8; dc += 1) {
          const ds = deficit[(col + dc + ANGULAR_COLS) % ANGULAR_COLS]!;
          for (let dk = -1; dk <= 1; dk += 1) {
            const kk = k + dk;
            if (kk >= 0 && kk <= POST_LEVELS) m = Math.max(m, ds[kk]!);
          }
        }
        return m;
      });
      const ring = smoothCircular(dil, 24);
      for (let col = 0; col < ANGULAR_COLS; col += 1) spread[col]![k] = ring[col]!;
    }
    for (let col = 0; col < ANGULAR_COLS; col += 1) {
      const sp = spread[col]!;
      for (let pass = 0; pass < 4; pass += 1) {
        const prev = [...sp];
        for (let k = 1; k < POST_LEVELS; k += 1) sp[k] = (prev[k - 1]! + prev[k]! * 2 + prev[k + 1]!) / 4;
      }
      const rs = postR[col]!;
      const hs = postH[col]!;
      const ds = deficit[col]!;
      const fs = floorR[col]!;
      for (let k = 0; k <= POST_LEVELS; k += 1) {
        rs[k] = Math.max(fs[k]!, rs[k]! - Math.max(sp[k]!, ds[k]!));
      }
      rs[0] = Math.min(rs[0]!, cols[col]!.r0 - 0.05);
      enforcePostProfile(rs, hs);
    }

    // 단면을 치종 해부 조화로 고르고(전치 2=납작한 타원, 견치 3=둥근 삼각형, 소구치 3=계란형 타원, 대구치 4=둥근 4각형)
    // 높이 방향으로 펴서 굴곡·턱 없이 잇는다.
    const harmonics = tpl.kind === "incisor" ? 2 : tpl.kind === "molar" ? 4 : 3;
    const blendLevels = Math.max(2, Math.round(POST_LEVELS * 0.35));
    for (let k = 1; k <= POST_LEVELS; k += 1) {
      const ring = cols.map((_, col) => postR[col]![k]!);
      const fitted = smoothCircularReduce(
        lowPassCircular(ring, harmonics),
        cols.map((_, col) => capR[col]![k]!),
        6,
        12,
      );
      const wgt = smootherstep(k / blendLevels);
      for (let col = 0; col < ANGULAR_COLS; col += 1) {
        postR[col]![k] = ring[col]! + (fitted[col]! - ring[col]!) * wgt;
      }
    }
    for (let col = 0; col < ANGULAR_COLS; col += 1) {
      const rs = postR[col]!;
      for (let pass = 0; pass < 6; pass += 1) {
        const prev = [...rs];
        for (let k = 1; k < POST_LEVELS; k += 1) rs[k] = (prev[k - 1]! + prev[k]! * 2 + prev[k + 1]!) / 4;
        rs[POST_LEVELS] = (prev[POST_LEVELS - 1]! + prev[POST_LEVELS]! * 3) / 4;
      }
      for (let k = 1; k <= POST_LEVELS; k += 1) {
        rs[k] = clamp(rs[k]!, floorR[col]![k]!, Math.max(floorR[col]![k]!, hardCapR[col]![k]!));
      }
      enforcePostProfile(rs, postH[col]!);
    }

    if (posterior) {
      // 소·대구치 포스트 축벽은 중간에 꺾이지 않고 숄더 끝에서 윗면 라운드 시작까지 일직선으로 올라간다.
      // 각 열에서 상단·하단 한계(capR/hardCapR)를 모두 만족하는 하나의 직선 r(h) = rBase - slope·(h - hBase)로 맞춘다.
      const maxStraightSlope = Math.tan(10 * DEG);
      const rawR0: number[] = [];
      const rawSlope: number[] = [];
      for (let col = 0; col < ANGULAR_COLS; col += 1) {
        const c = cols[col]!;
        const hs = postH[col]!;
        const h0Base = hs[0]!;
        const span = Math.max(0.35, hs[POST_LEVELS]! - h0Base);
        const rBaseMax = Math.min(
          c.r0 - Math.max(0.2, shoulderW * 0.85),
          postR[col]![0]!,
          hardCapR[col]![0]!,
        );
        const rBaseMin = Math.max(floorR[col]![0]!, Math.min(rBaseMax, c.r0 - shoulderW - 0.18));
        const rBase = clamp(c.r0 - shoulderW, rBaseMin, rBaseMax);

        let slopeNeed = taperSlope;
        for (let k = 2; k <= POST_LEVELS; k += 1) {
          const dh = Math.max(0.15, hs[k]! - h0Base);
          const allowR = Math.max(floorR[col]![k]!, Math.min(capR[col]![k]!, hardCapR[col]![k]!));
          if (Number.isFinite(allowR) && rBase - slopeNeed * dh > allowR) {
            slopeNeed = Math.max(slopeNeed, (rBase - allowR) / dh);
          }
        }
        slopeNeed = clamp(slopeNeed, taperSlope, maxStraightSlope);
        let r0Line = rBase;
        // 상단에서 여전히 크라운 최소 두께(0.7mm)보다 크면 기울기를 꺾지 않고 전체 직선을 살짝 안으로 들인다(최대 0.2mm).
        let extraIn = 0;
        for (let k = 2; k <= POST_LEVELS; k += 1) {
          const dh = hs[k]! - h0Base;
          const hc = Math.max(floorR[col]![k]!, hardCapR[col]![k]!);
          if (Number.isFinite(hc)) extraIn = Math.max(extraIn, r0Line - slopeNeed * dh - hc);
        }
        r0Line = Math.max(floorR[col]![0]!, r0Line - Math.min(0.6, extraIn));
        // 스크류 채널 벽 침범 방지
        for (let k = 1; k <= POST_LEVELS; k += 1) {
          const dh = Math.max(0.1, hs[k]! - h0Base);
          if (r0Line - slopeNeed * dh < floorR[col]![k]!) {
            slopeNeed = Math.max(0, (r0Line - floorR[col]![k]!) / dh);
          }
        }
        rawR0.push(r0Line);
        rawSlope.push(slopeNeed);
      }
      const harmonicsPost = tpl.kind === "molar" ? 4 : 3;
      const smoothR0 = lowPassCircular(rawR0, harmonicsPost);
      const smoothSlope = lowPassCircular(rawSlope, 3).map((s) => clamp(s, taperSlope * 0.85, maxStraightSlope));
      const baseRing: number[] = [];
      const topRing: number[] = [];
      for (let col = 0; col < ANGULAR_COLS; col += 1) {
        const hs = postH[col]!;
        const h0Base = hs[0]!;
        const span = Math.max(0.35, hs[POST_LEVELS]! - h0Base);
        let r0Line = clamp(
          smoothR0[col]!,
          floorR[col]![0]!,
          Math.max(floorR[col]![0]!, cols[col]!.r0 - 0.12),
        );
        let sl = smoothSlope[col]!;
        for (let k = 1; k <= POST_LEVELS; k += 1) {
          const dh = Math.max(0.1, hs[k]! - h0Base);
          const lo = floorR[col]![k]!;
          const hi = Math.max(lo, hardCapR[col]![k]!);
          if (r0Line - sl * dh > hi) {
            const needSlope = (r0Line - hi) / dh;
            if (needSlope <= maxStraightSlope) {
              sl = needSlope;
            } else {
              sl = maxStraightSlope;
              r0Line = Math.max(floorR[col]![0]!, hi + sl * dh);
            }
          }
          if (r0Line - sl * dh < lo) sl = Math.max(0, (r0Line - lo) / dh);
        }
        baseRing.push(r0Line);
        topRing.push(Math.max(floorR[col]![POST_LEVELS]!, r0Line - sl * span));
      }
      // 설측 등 한쪽 마진·크라운 여백이 좁아 포스트 단면이 오목하게 찌그러지지 않도록,
      // 하단(baseRing)과 상단(topRing) 단면을 모두 내접 볼록 매끄러운 곡선으로 다듬은 뒤 직선으로 잇는다.
      const convexBase = convexInscribedSmoothRadii(
        baseRing,
        cols.map((_, col) => floorR[col]![0]!),
        14,
      );
      const convexTop = convexInscribedSmoothRadii(
        topRing.map((rt, col) => Math.min(rt, convexBase[col]! - taperSlope * 0.5 * Math.max(0.35, postH[col]![POST_LEVELS]! - postH[col]![0]!))),
        cols.map((_, col) => floorR[col]![POST_LEVELS]!),
        14,
      );
      for (let col = 0; col < ANGULAR_COLS; col += 1) {
        const hs = postH[col]!;
        const h0Base = hs[0]!;
        const span = Math.max(0.35, hs[POST_LEVELS]! - h0Base);
        const r0Conv = convexBase[col]!;
        const rTopConv = Math.min(r0Conv, convexTop[col]!);
        const sl = (r0Conv - rTopConv) / span;
        for (let k = 0; k <= POST_LEVELS; k += 1) {
          postR[col]![k] = Math.max(floorR[col]![k]!, r0Conv - sl * (hs[k]! - h0Base));
        }
      }
    } else {
      // 전치부(1·2·3번, 우리·알토란 41건 실측): 축벽 중간 단차(28° 턱) 없이
      // 순·근원심은 숄더에서 절단연까지 일직선으로, 설·구개측은 하단 싱귤럼에서 구개 사면으로 C² 연속 수렴한다.
      const rawAntBase: number[] = [];
      const rawAntTop: number[] = [];
      const colLinW: number[] = [];
      for (let col = 0; col < ANGULAR_COLS; col += 1) {
        const c = cols[col]!;
        const hs = postH[col]!;
        const h0Base = hs[0]!;
        const span = Math.max(0.4, hs[POST_LEVELS]! - h0Base);
        const cLab = Math.cos(c.phi);
        const linW = smootherstep(clamp((-cLab + 0.05) / 0.85, 0, 1));
        colLinW.push(linW);

        const rBaseMax = Math.min(
          c.r0 - Math.max(0.2, shoulderW * 0.85),
          hardCapR[col]![0]!,
        );
        let r0Ant = clamp(
          c.r0 - shoulderW,
          floorR[col]![0]!,
          Math.max(floorR[col]![0]!, rBaseMax),
        );
        let rTopAnt = clamp(
          c.postDesired(hs[POST_LEVELS]!),
          floorR[col]![POST_LEVELS]!,
          Math.max(floorR[col]![POST_LEVELS]!, Math.min(r0Ant - taperSlope * span * 0.6, capR[col]![POST_LEVELS]!, hardCapR[col]![POST_LEVELS]!)),
        );
        // 중간 높이에서도 크라운 목표/최소 두께(capR/hardCapR)를 넘지 않도록 단차 없이 rTopAnt·r0Ant 끝점만 조율한다.
        for (let k = 2; k <= POST_LEVELS; k += 1) {
          const g = anteriorAxialProgress(k / POST_LEVELS, linW);
          const allow = Math.max(floorR[col]![k]!, Math.min(capR[col]![k]!, hardCapR[col]![k]!));
          const cur = r0Ant - (r0Ant - rTopAnt) * g;
          if (Number.isFinite(allow) && cur > allow) {
            if (g >= 0.35) {
              const needTop = r0Ant - (r0Ant - allow) / g;
              rTopAnt = Math.max(floorR[col]![POST_LEVELS]!, Math.min(rTopAnt, needTop));
            } else {
              r0Ant = Math.max(floorR[col]![0]!, r0Ant - Math.min(0.25, cur - allow));
            }
          }
        }
        rTopAnt = Math.min(rTopAnt, r0Ant);
        rawAntBase.push(r0Ant);
        rawAntTop.push(rTopAnt);
      }
      const harmonicsAnt = tpl.kind === "canine" ? 3 : 2;
      const convexAntBase = convexInscribedSmoothRadii(
        lowPassCircular(rawAntBase, harmonicsAnt),
        cols.map((_, col) => floorR[col]![0]!),
        14,
      );
      const convexAntTop = convexInscribedSmoothRadii(
        lowPassCircular(rawAntTop, harmonicsAnt).map((rt, col) =>
          Math.min(rt, convexAntBase[col]! - taperSlope * 0.4 * Math.max(0.4, postH[col]![POST_LEVELS]! - postH[col]![0]!)),
        ),
        cols.map((_, col) => floorR[col]![POST_LEVELS]!),
        14,
      );
      for (let col = 0; col < ANGULAR_COLS; col += 1) {
        const hs = postH[col]!;
        const h0Base = hs[0]!;
        const span = Math.max(0.4, hs[POST_LEVELS]! - h0Base);
        const r0Conv = Math.min(cols[col]!.r0 - 0.12, convexAntBase[col]!);
        const rTopConv = Math.min(r0Conv, convexAntTop[col]!);
        const linW = colLinW[col]!;
        for (let k = 0; k <= POST_LEVELS; k += 1) {
          const g = anteriorAxialProgress((hs[k]! - h0Base) / span, linW);
          const wantR = r0Conv - (r0Conv - rTopConv) * g;
          const hi = Math.max(floorR[col]![k]!, hardCapR[col]![k]!);
          postR[col]![k] = clamp(wantR, floorR[col]![k]!, hi);
        }
      }
      // 스크류 채널 보강(floorR)이 닿는 층도 오목 없이 매끄럽게 이어지고 언더컷이 없도록 마감한다.
      for (let k = 0; k <= POST_LEVELS; k += 1) {
        const ring = convexInscribedSmoothRadii(
          cols.map((_, col) => postR[col]![k]!),
          cols.map((_, col) => floorR[col]![k]!),
          10,
        );
        for (let col = 0; col < ANGULAR_COLS; col += 1) postR[col]![k] = ring[col]!;
      }
      for (let col = 0; col < ANGULAR_COLS; col += 1) {
        const rs = postR[col]!;
        for (let k = 1; k <= POST_LEVELS; k += 1) rs[k] = Math.min(rs[k]!, rs[k - 1]!);
      }
    }

    // ── 7) 열 점: 피니시라인 → 오목 챔퍼 → 축벽 → 윗면 라운드 / 예측 크라운
    const postByCol: Vec3[][] = [];
    const crownByCol: Vec3[][] = [];
    let cutbackSum = 0;
    let taperSum = 0;
    let taperCols = 0;
    let crownTopSum = 0;
    let rhoSum = 0;
    for (let col = 0; col < ANGULAR_COLS; col += 1) {
      const c = cols[col]!;
      const at = (h: number, r: number): Vec3 => add3(c0, add3(scale3(frame.w, h), scale3(c.dir, r)));
      const rs = postR[col]!;
      const hs = postH[col]!;
      const post: Vec3[] = [];
      const ch = chamferPoints(c.r0, c.h0, Math.max(0.02, c.r0 - rs[0]!), hs[0]! - c.h0);
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
      const rhoMax = Math.max(0.15, Math.min(topRoundMm, (rEnd - 0.3) / cos0));
      const rise = Math.max(1 - sin0, 1e-3);
      const rho = clamp((edgeHeight(rEnd - rhoMax * cos0) - hEnd) / rise, 0.15, rhoMax);
      const ext = Math.max(0.02, edgeHeight(rEnd - rho * cos0) - hEnd - rho * rise);
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

      const crown: Vec3[] = [c.marginPt];
      for (let k = 0; k < CROWN_LEVELS; k += 1) crown.push(at(c.crownH[k]!, c.crownR[k]!));
      const rCrownTop = c.crownR[CROWN_LEVELS - 1]!;
      const du = dot3(c.dir, frame.uLabial);
      const dv = dot3(c.dir, frame.vSide) * mesialSignOnV;
      const cuspR1 = rCrownTop * 0.88;
      const cuspR2 = rCrownTop * 0.5;
      const uNorm1 = (du * cuspR1 - crownCenterU) / Math.max(natHalfBl, 1);
      const vNorm1 = (dv * cuspR1 - crownCenterV * crownSideSign * mesialSignOnV) / Math.max(crownHalfMd, 1);
      const uNorm2 = (du * cuspR2 - crownCenterU) / Math.max(natHalfBl, 1);
      const vNorm2 = (dv * cuspR2 - crownCenterV * crownSideSign * mesialSignOnV) / Math.max(crownHalfMd, 1);
      const reliefAmp = posterior ? 1.8 : 1.1;
      const lift1 = crownOcclusalReliefRatio(fixture.toothNumber, uNorm1, vNorm1) * reliefAmp;
      const lift2 = crownOcclusalReliefRatio(fixture.toothNumber, uNorm2, vNorm2) * reliefAmp;
      const occCapEdge = oppField
        ? oppField.heightAt(du * rCrownTop, dot3(c.dir, frame.vSide) * rCrownTop, 1.0) + contact
        : Infinity;
      // 가장자리 링(crownR[CROWN_LEVELS - 1])도 대합치를 뚫지 않게 맞춘다.
      if (Number.isFinite(occCapEdge) && crown[crown.length - 1]!) {
        const lastH = Math.min(c.crownH[CROWN_LEVELS - 1]!, occCapEdge - 0.12);
        crown[crown.length - 1] = at(Math.max(c.h0 + 0.5, lastH), rCrownTop);
      }
      const occCap1 = oppField
        ? oppField.heightAt(du * cuspR1, dot3(c.dir, frame.vSide) * cuspR1, 1.0) + contact
        : Infinity;
      const occCap2 = oppField
        ? oppField.heightAt(du * cuspR2, dot3(c.dir, frame.vSide) * cuspR2, 1.0) + contact
        : occCap1;
      // 대합치가 있으면 예측 크라운 교합면이 대합치와 교합(가벼운 접촉, 침투 없음)하도록 맞춘다.
      const wantOcc1 = Number.isFinite(occCap1)
        ? Math.max(c.hTop + c.crownTopOcc * 0.72 + lift1 * 0.55, occCap1 - 0.22 + lift1 * 0.2)
        : c.hTop + c.crownTopOcc * 0.65 + lift1 * 0.7;
      const wantOcc2 = Number.isFinite(occCap2)
        ? Math.max(c.hTop + c.crownTopOcc + lift2 * 0.55, occCap2 - 0.08 + lift2 * 0.2)
        : c.hTop + c.crownTopOcc + lift2;
      const hOcc1 = Math.min(
        occCap1 - 0.04,
        Math.max(c.hTop + CROWN_THICKNESS_FLOOR_MM * 0.85, wantOcc1),
      );
      const hOcc2 = Math.min(
        occCap2,
        Math.max(c.hTop + CROWN_THICKNESS_FLOOR_MM, wantOcc2),
      );
      crown.push(at(hOcc1, cuspR1));
      crown.push(at(hOcc2, cuspR2));
      crownTopSum += hOcc2;
      crownByCol.push(crown);
    }

    const apexH = top.center;
    const postApex = add3(c0, scale3(frame.w, apexH));
    const fossaDrop = crownOcclusalReliefRatio(fixture.toothNumber, 0, 0) * (posterior ? 1.8 : 1.1);
    const meanCrownCuspH = crownTopSum / ANGULAR_COLS;
    const oppApexCap = oppField ? oppField.heightAt(0, 0, 1.4) + contact : Infinity;
    const crownCenterH = Math.min(
      oppApexCap,
      Math.max(
        apexH + Math.min(desiredOccThickness, 1.05),
        Number.isFinite(oppApexCap) ? oppApexCap - 0.25 : meanCrownCuspH + fossaDrop,
      ),
    );
    const crownApex = add3(c0, scale3(frame.w, crownCenterH));
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
  // ── 8) 커넥션(헥스 + 11° 원뿔) + cuffBlend 커프 + 포스트를 닫힌 외형으로 잇고 스크류 채널을 뺀다
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
  const cutters = [
    frustumSoup(boreBotR, boreBotR, zBot - 1, seatZ0),
    frustumSoup(boreBotR, boreTopR, seatZ0 - 0.001, seatZ1),
    frustumSoup(boreTopR, boreTopR, seatZ1 - 0.001, zTopMax + 3),
  ];
  const localPositions = await subtractTriangleSoups(
    bodySoup,
    cutters,
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
    fixture,
    fileName,
    localPositions,
    crownLocalPositions,
    marginLoopLocal,
    params,
    metrics: {
      connectionDiameterMm: conn.originDiameterMm,
      maxDiameterMm: round2(maxOuterR * 2),
      cuffHeightMinMm: round2(Math.min(...smoothMarginZ)),
      cuffHeightMaxMm: round2(Math.max(...smoothMarginZ)),
      postHeightMm: round2(zMaxLocal - meanMarginZ),
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
