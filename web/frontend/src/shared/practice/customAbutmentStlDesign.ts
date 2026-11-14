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
  cropScanPointsInFixtureFrame,
  fixturePoseToMatrix4,
  parseFdiTooth,
  type FixtureWorldPose,
  type MatchedScanbodyFixture,
} from "@/shared/practice/customAbutmentScanbodyMatch";
import {
  resolveCustomAbutmentParams,
  type CustomAbutmentDesignParams,
} from "@/shared/practice/customAbutmentDesignParams";
import { subtractTriangleSoups } from "@/shared/practice/meshUnion";
import { toothFormOf, type ToothKind } from "@/shared/practice/toothMorphology";
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
/** 크라운 두께 하한. 공간이 모자라도 이보다 얇게 두지 않는다. */
const CROWN_THICKNESS_FLOOR_MM = 0.65;
/** 스크류 채널 둘레 포스트 벽 최소 두께. */
const SCREW_WALL_MM = 0.35;
/** 윗면 라운드 반경. 축벽에 접선으로 이어진다(턱 없음). */
const TOP_ROUND_POSTERIOR_MM = 0.6;
const TOP_ROUND_ANTERIOR_MM = 0.8;
const TOP_ROUND_STEPS = 10;
/** 픽스쳐 사이가 이 안이면 붙은 치아로 보고 삽입축을 평행하게 맞춘다. */
const PARALLEL_GROUP_MM = 13;
/** 소·대구치 평평한 윗면의 최대 기울기. */
const FLAT_TOP_MAX_TILT = Math.tan(12 * DEG);
/** 크라운 제한 때문에 포스트가 안으로 들어갈 때 아래로 벌어지는 최대 기울기. */
const POST_STEP_SLOPE = Math.tan(25 * DEG);
/** 크라운 공간 때문에 깎은 축벽이 아래 원래 벽으로 돌아가는 사선(기공소 샘플 설측 윗벽 8~13°). */
const POST_CUT_SLOPE = Math.tan(12 * DEG);
/** 깎더라도 숄더 바로 위에서 더 들이는 양과, 그 위로 안쪽으로 기우는 기울기(숄더 폭 유지). */
const POST_BASE_KEEP_MM = 0.12;
const POST_BASE_LEAN = Math.tan(35 * DEG);
/** 설측 축벽이 모이기 시작하는 높이를 순측보다 이만큼(포스트 높이 비율) 낮춘다. */
const LINGUAL_CONVERGE_EARLIER = 0.2;
/** 2.5° 간격(144열) — 6각 헥스 모서리(30°+60°k)가 격자 위에 놓인다. */
const ANGULAR_COLS = 144;
const SECTORS = 36;
const SUPERELLIPSE_N = 2.4;
const POST_LEVELS = 24;
const CROWN_LEVELS = 14;
const CHAMFER_STEPS = 7;
const LIMIT_PHI_BINS = 72;
const LIMIT_H_MIN = -1;
const LIMIT_H_STEP = 0.5;
const LIMIT_H_BINS = 34;
const OPP_CELL_MM = 0.5;
/** 인접치 스캔으로 크라운을 자르는 높이(마진 위). 그 아래는 치간유두라 자르지 않는다. */
const CONTACT_CLIP_FROM_MM = 2.5;
/** 피니시라인을 스캔 잇몸 안쪽 면보다 이만큼 안에 둔다(잇몸을 누르지 않게). */
const GINGIVA_INSET_MM = 0.2;
/** 순측 마진은 치은연 아래 0.5~1.0mm(목표 0.75). 다른 면도 치은연 위 0.3mm 안으로는 올라가지 않는다. */
const LABIAL_SUBG_MM = 0.75;
const LABIAL_SUBG_MIN_MM = 0.5;
const LABIAL_SUBG_MAX_MM = 1.0;
const MARGIN_SUBG_MIN_MM = 0.3;
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
        marginBlMm: 4.9, marginMdMm: 4.6,
        topLabialHalfMm: 0.8, topLingualHalfMm: 0.6, topMdMm: 3.2,
        postHeightMm: 7.2, naturalMdMm: 5.6, lingualTopDropMm: 0.8,
        crownLabialMm: 1.1, crownLingualMm: 0.9, crownOcclusalMm: 1.6,
      };
    }
    const lateral = pos === 2;
    return {
      kind, anterior: true,
      marginBlMm: lateral ? 4.7 : 5.0, marginMdMm: lateral ? 4.8 : 5.2,
      topLabialHalfMm: 0.85, topLingualHalfMm: 0.65, topMdMm: lateral ? 3.2 : 3.6,
      postHeightMm: lateral ? 6.8 : 7.3, naturalMdMm: lateral ? 6.6 : 8.5,
      lingualTopDropMm: 1.0,
      crownLabialMm: 1.2, crownLingualMm: 1.0, crownOcclusalMm: 1.7,
    };
  }
  if (kind === "canine") {
    return {
      kind, anterior: true,
      marginBlMm: upper ? 5.5 : 5.0, marginMdMm: upper ? 5.1 : 4.9,
      topLabialHalfMm: 1.0, topLingualHalfMm: 0.85, topMdMm: 3.4,
      postHeightMm: upper ? 7.6 : 7.4, naturalMdMm: upper ? 7.6 : 6.9,
      lingualTopDropMm: 0.8,
      crownLabialMm: 1.2, crownLingualMm: 1.0, crownOcclusalMm: 1.8,
    };
  }
  if (kind === "premolar") {
    return {
      kind, anterior: false,
      marginBlMm: upper ? 6.1 : 5.4, marginMdMm: upper ? 5.1 : 5.1,
      topLabialHalfMm: upper ? 2.15 : 1.95, topLingualHalfMm: upper ? 2.15 : 1.95,
      topMdMm: upper ? 3.55 : 3.2,
      postHeightMm: upper ? 5.6 : 6.0, naturalMdMm: 7.0,
      lingualTopDropMm: 0.2,
      crownLabialMm: 1.2, crownLingualMm: 1.1, crownOcclusalMm: 1.8,
    };
  }
  const second = pos === 7;
  return {
    kind: "molar", anterior: false,
    marginBlMm: upper ? 7.05 : 6.35, marginMdMm: upper ? 6.45 : 6.7,
    topLabialHalfMm: upper ? 2.72 : 2.3, topLingualHalfMm: upper ? 2.72 : 2.3,
    topMdMm: upper ? 4.8 : 5.25,
    postHeightMm: upper ? 5.5 : 5.3,
    naturalMdMm: upper ? (second ? 9.0 : 10.0) : second ? 10.5 : 11.0,
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
): number {
  const sides: number[][] = [[], []];
  for (let i = 0; i < pts.length; i += 3) {
    const p: Vec3 = [pts[i]!, pts[i + 1]!, pts[i + 2]!];
    if (Math.hypot(p[0], p[1]) < ownScanbody.radius + 0.7 && p[2] < ownScanbody.height + 1) continue;
    const rel = sub3(p, c0);
    const h = dot3(rel, frame.w);
    if (h < 0) continue;
    if (Math.abs(dot3(rel, frame.uLabial)) > 4.5) continue;
    const v = dot3(rel, frame.vSide);
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

  // ── 1) 픽스쳐 둘레 치은연 높이 → 스캘럽 마진 높이
  const rawGingivaZ = new Array<number>(SECTORS).fill(Number.NaN);
  const gingivaBuckets: number[][] = Array.from({ length: SECTORS }, () => []);
  // 스캔바디에 닿는 치은연(바로 옆 0.35~1.2mm 고리). 순측 마진 깊이의 기준이다.
  const crestBuckets: number[][] = Array.from({ length: SECTORS }, () => []);
  for (let i = 0; i < jawLocalPts.length; i += 3) {
    const x = jawLocalPts[i]!;
    const y = jawLocalPts[i + 1]!;
    const z = jawLocalPts[i + 2]!;
    if (z < 0.8 || z > sbH - 0.9) continue;
    const r = Math.hypot(x, y);
    if (r < sbR + 0.35 || r > sbR + 2.4) continue;
    const b = Math.min(SECTORS - 1, Math.floor((wrapAngle(Math.atan2(y, x)) / (Math.PI * 2)) * SECTORS));
    gingivaBuckets[b]!.push(z);
    if (r <= sbR + 1.2) crestBuckets[b]!.push(z);
  }
  const crestZ = crestBuckets.map((list) => {
    if (list.length < 3) return Number.NaN;
    list.sort((a, c) => a - c);
    return list[Math.floor(list.length * 0.75)]!;
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

  // 피니시라인 = 둘레 전체 치은연 아래 marginDepth(기본 0.5mm).
  const minMarginZ = Math.max(1.5, coneTopZ + 1.1);
  const maxMarginZ = Math.min(8.0, medianGingivaZ + 1.4);
  // 순측(±70°)은 치은연에서 LABIAL_SUBG_MM 아래(최소 LABIAL_SUBG_MIN_MM). 순측 잇몸이 다른 면보다
  // 몇 mm 낮아도 중앙값 쪽으로 끌어올리지 않는다. 고른 뒤 어느 면도 치은연 위로 나오지 않게 깎는다.
  const labialWeight = (b: number) => {
    const phi = ((b + 0.5) / SECTORS) * Math.PI * 2 - labialAngleFix;
    return smootherstep(clamp((Math.cos(phi) - 0.34) / 0.3, 0, 1));
  };
  const marginTargetSamples = rawGingivaZ.map((gz, b) => {
    const base = gz - params.marginDepthMm;
    const crest = crestZ[b]!;
    const wl = labialWeight(b);
    const want = Number.isFinite(crest) && wl > 0 ? base + (crest - LABIAL_SUBG_MM - base) * wl : base;
    return clamp(want, minMarginZ, maxMarginZ);
  });
  const marginCapZ = rawGingivaZ.map((gz, b) => {
    const crest = crestZ[b]!;
    const wl = labialWeight(b);
    if (!Number.isFinite(crest)) return Infinity;
    if (wl > 0.5) return Math.max(minMarginZ, crest - LABIAL_SUBG_MIN_MM);
    return Math.max(minMarginZ, Math.min(gz, crest) - MARGIN_SUBG_MIN_MM);
  });
  const marginFloorZ = crestZ.map((crest, b) =>
    Number.isFinite(crest) && labialWeight(b) > 0.5 ? crest - LABIAL_SUBG_MAX_MM : -Infinity,
  );
  const smoothMarginZ = smoothCircular(
    smoothCircularReduce(lowPassCircular(marginTargetSamples, 2), marginCapZ, 2, 3).map((z, b) =>
      Math.min(marginCapZ[b]!, Math.max(marginFloorZ[b]!, z)),
    ),
    2,
  ).map((z) => clamp(z, minMarginZ, maxMarginZ));
  const meanMarginZ = smoothMarginZ.reduce((s, v) => s + v, 0) / SECTORS;
  // 마진 위 0.6~1.8mm(치은정 쪽) 연조직 개구부 반경. 넓게 벌어진 잇몸 터널은 마진을 키워 지지한다.
  const tissueBuckets: number[][] = Array.from({ length: SECTORS }, () => []);
  // 치은정 부근(마진 위 0.3~1.3mm) 잇몸 안쪽 면. 마진은 이보다 GINGIVA_INSET_MM 안에 둬서 잇몸을 누르지 않는다.
  const innerBuckets: number[][] = Array.from({ length: SECTORS }, () => []);
  for (let i = 0; i < jawLocalPts.length; i += 3) {
    const x = jawLocalPts[i]!;
    const y = jawLocalPts[i + 1]!;
    const z = jawLocalPts[i + 2]!;
    const r = Math.hypot(x, y);
    if (r < sbR + 0.25 || r > sbR + 3.2) continue;
    const b = Math.min(SECTORS - 1, Math.floor((wrapAngle(Math.atan2(y, x)) / (Math.PI * 2)) * SECTORS));
    const zm = smoothMarginZ[b]!;
    if (z >= zm + 0.3 && z <= zm + 1.3) innerBuckets[b]!.push(r);
    if (z < zm + 0.6 || z > zm + 1.8) continue;
    tissueBuckets[b]!.push(r);
  }
  const innerRaw = innerBuckets.map((list) => {
    if (list.length < 3) return Number.NaN;
    list.sort((a, c) => a - c);
    return list[Math.floor(list.length * 0.15)]!;
  });
  const gingivaInnerR = innerRaw.some(Number.isFinite)
    ? lowPassCircular(
        innerRaw.map((r, _, all) => {
          if (Number.isFinite(r)) return r;
          const ok = all.filter(Number.isFinite);
          return ok.reduce((s, v) => s + v, 0) / ok.length;
        }),
        3,
      )
    : null;
  const tissueR = lowPassCircular(
    tissueBuckets.map((list) => {
      if (list.length < 3) return Number.NaN;
      list.sort((a, c) => a - c);
      return list[Math.floor(list.length * 0.5)]!;
    }).map((r, _, all) => {
      if (Number.isFinite(r)) return r;
      const ok = all.filter(Number.isFinite);
      return ok.length ? ok.reduce((s, v) => s + v, 0) / ok.length : sbR + 0.3;
    }),
    2,
  );
  const c0: Vec3 = [0, 0, meanMarginZ];

  // ── 2) 악궁 교합 방향으로 1차 삽입축 → 인접치 간격으로 근원심 크기 보정
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
  for (let i = 0; i < jawLocalPts.length; i += 3) {
    const p: Vec3 = [jawLocalPts[i]!, jawLocalPts[i + 1]!, jawLocalPts[i + 2]!];
    const rel = sub3(p, c0);
    const h = dot3(rel, frame0.w);
    if (h < 3 || h > 7) continue;
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
  const reachPos = sideReach(Math.PI / 2);
  const reachNeg = sideReach((3 * Math.PI) / 2);
  let mdScale = 1;
  let sideShiftMm = 0;
  if (Number.isFinite(reachPos) && Number.isFinite(reachNeg)) {
    mdScale = clamp((reachPos + reachNeg) / tpl.naturalMdMm, 0.92, 1.1);
    sideShiftMm = clamp((reachPos - reachNeg) / 2, -0.8, 0.8);
  } else if (Number.isFinite(reachPos) || Number.isFinite(reachNeg)) {
    const one = Number.isFinite(reachPos) ? reachPos : reachNeg;
    mdScale = clamp((one * 2) / tpl.naturalMdMm, 0.95, 1.06);
  }
  const labialLimit = adjacentLabialLimit(jawLocalPts, {
    labXY,
    ownRadius: sbR,
    ownHeight: sbH,
    reachPos: Number.isFinite(reachPos) ? reachPos : (tpl.naturalMdMm / 2) * mdScale,
    reachNeg: Number.isFinite(reachNeg) ? reachNeg : (tpl.naturalMdMm / 2) * mdScale,
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
  const blScale = 1 + (mdScale - 1) * 0.5;
  const marginA = (tpl.marginBlMm / 2) * blScale * params.marginSizeScale;
  const marginB = (tpl.marginMdMm / 2) * mdScale * params.marginSizeScale;

  // ── 3) 삽입축: 대합치 교합면 중심 쪽(없으면 악궁 교합 방향 + 인접치 사이 가운데)
  let w: Vec3 = wArch;
  let axisSource: CustomAbutmentDesignMetrics["axisSource"] = "arch";
  if (opposingLocalPts.length > 0 && params.axisToOpposing > 0) {
    let wOpp: Vec3 = wArch;
    let found = false;
    for (let iter = 0; iter < 3; iter += 1) {
      const center = opposingCenterPoint(opposingLocalPts, c0, insertionFrame(wOpp, labXY));
      if (!center) break;
      wOpp = norm3(sub3(center, c0));
      found = true;
    }
    if (found) {
      w = slerpDir(wArch, wOpp, params.axisToOpposing);
      axisSource = "opposing";
    }
  }
  if (axisSource === "arch") {
    const H = tpl.postHeightMm;
    let offX = (w[0] / w[2]) * H - labXY[1] * sideShiftMm * 0.7;
    let offY = (w[1] / w[2]) * H + labXY[0] * sideShiftMm * 0.7;
    if (tpl.anterior) {
      // 대합치를 못 찾은 전치: 순측으로 기울여 스크류홀을 설측에 둔다.
      const labComp = offX * labXY[0] + offY * labXY[1];
      const want = Math.min(1.3, Math.tan(tiltCapRad) * H * 0.8);
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
  w = capTilt(w, tiltCapRad);
  {
    // 포스트 윗면이 마진 한쪽으로 너무 나가면(마진 반경의 55%, 평행 맞춤은 70% 초과) 기울기를 줄인다.
    const H = tpl.postHeightMm;
    const allowRatio = mode.groupAxisWorld ? 0.7 : 0.55;
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
  // 포스트가 가상 크라운(인접치 순측선) 밖으로 나가면 크라운 두께만큼 들어오도록 윗면을 설측으로 옮긴다.
  if (labialLimit && !mode.groupAxisWorld) {
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
      w = capTilt(norm3(add3(scale3(w, H / Math.max(w[2], 0.2)), scale3(labXY, (-need * H) / hRef))), tiltCapRad);
      moved += need;
    }
  }
  const frame = insertionFrame(w, labXY);
  const angulationDeg = Math.acos(clamp(frame.w[2], -1, 1)) / DEG;

  // ── 4) 포스트 높이: 대합치 최정점 거리
  const oppField =
    opposingLocalPts.length > 0 ? buildOpposingHeightField(opposingLocalPts, c0, frame, 8) : null;
  const footR = Math.max(marginA, marginB) - shoulderW + 0.6;
  const oppFootH = oppField ? oppField.heightAt(0, 0, footR) : Infinity;
  const hasOpposing = Number.isFinite(oppFootH);
  // 크라운 교합면은 인접 자연치 교합면(첨두·절단연) 높이에 맞춘다. 포스트는 그보다 POST_BELOW_CROWN_MM 낮다.
  const adjacentTopH = adjacentOcclusalHeight(jawLocalPts, c0, frame, marginB, {
    radius: sbR,
    height: sbH,
  });
  const offsetH = params.postHeightOffsetMm;
  const baseCap = Math.min(
    tpl.postHeightMm + 3.0,
    Number.isFinite(adjacentTopH) ? adjacentTopH - POST_BELOW_CROWN_MM : Infinity,
  );
  const postTopMax = Math.max(MIN_POST_HEIGHT_MM, baseCap + offsetH);
  // 대합치가 없으면 인접치 높이 − 1.5mm(없으면 템플릿 높이)까지.
  const noOppTop = Number.isFinite(adjacentTopH) ? baseCap : Math.min(baseCap, tpl.postHeightMm);
  let postTopH = (hasOpposing ? Math.min(baseCap, oppFootH - clearance) : noOppTop) + offsetH;
  if (hasOpposing) postTopH = Math.min(postTopH, oppFootH - clearance);
  postTopH = Math.max(MIN_POST_HEIGHT_MM, postTopH);
  const crownTopTarget = Number.isFinite(adjacentTopH) ? adjacentTopH : Infinity;

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
  for (let i = 0; i < jawLocalPts.length; i += 3) {
    const p: Vec3 = [jawLocalPts[i]!, jawLocalPts[i + 1]!, jawLocalPts[i + 2]!];
    if (Math.hypot(p[0], p[1]) < sbR + 0.4 && p[2] > 0 && p[2] < sbH + 1) continue;
    const rel = sub3(p, c0);
    const h = dot3(rel, frame.w);
    const hb = Math.floor((h - LIMIT_H_MIN) / LIMIT_H_STEP);
    if (hb < 0 || hb >= LIMIT_H_BINS) continue;
    const u = dot3(rel, frame.uLabial);
    const v = dot3(rel, frame.vSide);
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

  // ── 6) 열(픽스쳐 원통 각 θ)마다 마진·포스트 원하는 형상과 예측 크라운
  const topB = (tpl.topMdMm / 2) * mdScale * params.postWidthScale;
  const minMarginRadius = coneTopR + 0.5;
  const convergeFrom = tpl.anterior ? 0.5 : 0.7;
  const topRoundMm = tpl.anterior ? TOP_ROUND_ANTERIOR_MM : TOP_ROUND_POSTERIOR_MM;

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
    crownTopOcc: number;
  };
  const cols: ColumnPlan[] = [];
  const topRaw: number[] = [];

  // 마진 반경: 템플릿·연조직 → 이웃 크라운 경계면에서 0.5mm. 줄이는 양은 둘레로 퍼뜨려 매끄럽게.
  const marginWant: number[] = [];
  const marginCap: number[] = [];
  for (let col = 0; col < ANGULAR_COLS; col += 1) {
    const theta = (col / ANGULAR_COLS) * Math.PI * 2;
    const rTemplate = superellipseRadius(marginA, marginB, theta - labialAngleFix);
    const tissueRatio = evalPeriodicLinear(tissueR, theta) / rTemplate;
    marginWant.push(
      Math.max(minMarginRadius, rTemplate * clamp(1 + 0.5 * (tissueRatio - 1), 0.95, 1.22)),
    );
    const radialFix: Vec3 = [Math.cos(theta), Math.sin(theta), 0];
    const lim = planeLimitAt(
      norm3(sub3(radialFix, scale3(frame.w, dot3(radialFix, frame.w)))),
      evalPeriodicLinear(smoothMarginZ, theta) - meanMarginZ,
    );
    let limR = Number.isFinite(lim) ? lim - 0.5 : Infinity;
    if (gingivaInnerR) limR = Math.min(limR, evalPeriodicLinear(gingivaInnerR, theta) - GINGIVA_INSET_MM);
    marginCap.push(Number.isFinite(limR) ? Math.max(minMarginRadius, limR) : Infinity);
  }
  const marginRadii = smoothCircularReduce(marginWant, marginCap, 4, 6).map((r) =>
    Math.max(minMarginRadius, r),
  );

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
    const tipR = Math.max(0.6, r0 - shoulderW - 0.8);
    const tu = dot3(dir, frame.uLabial) * tipR;
    const tv = dot3(dir, frame.vSide) * tipR;
    if (oppField) {
      const oppH = oppField.heightAt(tu, tv, 1.0);
      if (Number.isFinite(oppH)) hTop = Math.max(postTopH, oppH - clearance);
    }
    hTop = Math.min(hTop, postTopMax) - topDrop;
    topRaw.push(hTop);

    const rBase0 = r0 - shoulderW;
    const hBase = h0 + chamfer.height;
    const topA = (cLab >= 0 ? tpl.topLabialHalfMm : tpl.topLingualHalfMm) * blScale * params.postWidthScale;
    const rTpl = superellipseRadius(topA, topB, phi);
    const linW = smootherstep(clamp((-cLab - 0.2) / 0.6, 0, 1));
    const plan: ColumnPlan = {
      marginPt,
      dir,
      phi,
      h0,
      r0,
      hTop,
      tipU: tu,
      tipV: tv,
      // 곧은 테이퍼 → 윗부분에서 템플릿 윗면 크기로 좁힌다. 순측은 볼록하게(기울기가 0부터 서서히),
      // 설측은 기공소 샘플처럼 수직으로 올라가다 사선으로 곧게 모인다(가운데가 불룩하지 않다).
      postDesired: (h: number) => {
        const straight =
          rBase0 * Math.min(1, params.postWidthScale) - taperSlope * Math.max(0, h - hBase);
        const span = Math.max(0.5, plan.hTop - topRoundMm - hBase);
        const from = convergeFrom - LINGUAL_CONVERGE_EARLIER * linW;
        const u = clamp(((h - hBase) / span - from) / (1 - from), 0, 1);
        return straight - Math.max(0, straight - rTpl) * u ** (2 - linW);
      },
      crownR: [],
      crownH: [],
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
    if (Math.hypot(dot3(rel, frame.uLabial), dot3(rel, frame.vSide)) > footR + 3) continue;
    oppNear.push(q);
  }
  const nearestOpp = (p: Vec3) => {
    let best = Infinity;
    for (const q of oppNear) {
      const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      if (d < best) best = d;
    }
    return best;
  };
  let apexDrop = 0;

  /** 윗면 높이. 소·대구치는 한 평면(평평한 교합면), 전치는 저차 조화함수로 매끄럽게. 둘 다 대합치 제한 아래. */
  const fitTopSurface = () => {
    if (posterior) {
      let s1 = 0, su = 0, sv = 0, suu = 0, svv = 0, suv = 0, sh = 0, suh = 0, svh = 0;
      for (let col = 0; col < ANGULAR_COLS; col += 1) {
        const c = cols[col]!;
        const h = topRaw[col]!;
        s1 += 1; su += c.tipU; sv += c.tipV;
        suu += c.tipU * c.tipU; svv += c.tipV * c.tipV; suv += c.tipU * c.tipV;
        sh += h; suh += c.tipU * h; svh += c.tipV * h;
      }
      // 중심화한 2×2로 기울기만 푼다.
      const mu = su / s1, mv = sv / s1, mh = sh / s1;
      const cuu = suu / s1 - mu * mu, cvv = svv / s1 - mv * mv, cuv = suv / s1 - mu * mv;
      const cuh = suh / s1 - mu * mh, cvh = svh / s1 - mv * mh;
      const det = cuu * cvv - cuv * cuv;
      let gu = det > 1e-9 ? (cuh * cvv - cvh * cuv) / det : 0;
      let gv = det > 1e-9 ? (cvh * cuu - cuh * cuv) / det : 0;
      const g = Math.hypot(gu, gv);
      if (g > FLAT_TOP_MAX_TILT) {
        gu *= FLAT_TOP_MAX_TILT / g;
        gv *= FLAT_TOP_MAX_TILT / g;
      }
      let a = Infinity;
      for (let col = 0; col < ANGULAR_COLS; col += 1) {
        const c = cols[col]!;
        a = Math.min(a, topRaw[col]! - gu * c.tipU - gv * c.tipV);
      }
      a -= apexDrop;
      const minTop = Math.max(...cols.map((c) => c.h0 + chamfer.height + 2.2 - gu * c.tipU - gv * c.tipV));
      a = Math.max(a, minTop);
      return { heightAt: (u: number, v: number) => a + gu * u + gv * v, center: a };
    }
    const lp = lowPassCircular(topRaw, 3);
    let off = Infinity;
    for (let col = 0; col < ANGULAR_COLS; col += 1) off = Math.min(off, topRaw[col]! - lp[col]!);
    const tops = lp.map((v, col) => Math.max(cols[col]!.h0 + chamfer.height + 2.2, v + off));
    return { tops, center: tops.reduce((s, v) => s + v, 0) / ANGULAR_COLS + 0.05 - apexDrop };
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
      c.hTop = "heightAt" in top ? top.heightAt(c.tipU, c.tipV) : top.tops[col]!;
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
      for (let k = 1; k <= CROWN_LEVELS; k += 1) {
        const h = c.h0 + ((c.hTop - c.h0) * k) / CROWN_LEVELS;
        const ramp = smootherstep((h - c.h0) / 1.8);
        const frac = clamp((h - c.h0) / (c.hTop - c.h0), 0, 1);
        let r =
          c.postDesired(Math.max(h, c.h0 + hPostBase)) +
          thick * ramp +
          0.25 * ramp * Math.sin(Math.PI * frac);
        if (h >= c.h0 + CONTACT_CLIP_FROM_MM) {
          const lim = scanLimitAt(c.phi, h);
          if (Number.isFinite(lim)) {
            // 인접면은 1.2mm 안쪽이면 접촉까지 넓혀 열린 접촉을 막는다.
            if (Math.abs(sSide) > 0.6 && lim + contact > r && lim + contact - r <= 1.2) r = lim + contact;
            r = Math.min(r, lim + contact);
          }
        }
        r = Math.min(r, planeLimitAt(c.dir, h) + contact / 2, labialLimitAt(c.dir, h));
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
            0.6,
            CROWN_TOP_OCC_MAX_MM,
          );
        }
      }
    }
    for (let k = 0; k < CROWN_LEVELS; k += 1) {
      const want = cols.map((c) => c.crownR[k]!);
      const cap = cols.map((c) => {
        let lim = Math.min(planeLimitAt(c.dir, c.crownH[k]!) + contact / 2, labialLimitAt(c.dir, c.crownH[k]!));
        if (c.crownH[k]! >= c.h0 + CONTACT_CLIP_FROM_MM) {
          lim = Math.min(lim, scanLimitAt(c.phi, c.crownH[k]!) + contact);
        }
        return lim;
      });
      const ring = smoothCircularReduce(smoothCircular(want, 2), cap, 2, 3);
      for (let col = 0; col < ANGULAR_COLS; col += 1) {
        const c = cols[col]!;
        c.crownR[k] = Math.max(c.r0 * 0.9, ring[col]!);
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
        const screwFloor = Math.max(minPostR, (h / Math.max(frame.w[2], 0.2)) * c.dir[2] + boreTopR + SCREW_WALL_MM);
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
          Number.isFinite(cap)
            ? Math.min(screwFloor, crownRadiusAt(c, h) - CROWN_THICKNESS_FLOOR_MM)
            : screwFloor,
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

    // 단면을 저차 조화로 고르고(전치는 타원) 높이 방향으로 펴서 굴곡·턱 없이 잇는다.
    // 아래쪽은 마진 단면을 따르고 높이 35%까지 서서히 넘어간다.
    const harmonics = tpl.anterior ? 2 : tpl.kind === "molar" ? 4 : 3;
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

    // ── 7) 열 점: 피니시라인 → 오목 챔퍼 → 축벽 → 윗면 라운드 / 예측 크라운
    const postByCol: Vec3[][] = [];
    const crownByCol: Vec3[][] = [];
    let cutbackSum = 0;
    let taperSum = 0;
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
        "heightAt" in top
          ? top.heightAt(dot3(c.dir, frame.uLabial) * rFlat, dot3(c.dir, frame.vSide) * rFlat)
          : c.hTop;
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
      taperSum += Math.atan2(rs[k20]! - rs[k60]!, hs[k60]! - hs[k20]!);
      const hMid = hs[k20]! + (hs[k60]! - hs[k20]!) * 0.5;
      const kMid = Math.round(POST_LEVELS * 0.4);
      cutbackSum += crownRadiusAt(c, hMid) - rs[kMid]!;

      const crown: Vec3[] = [c.marginPt];
      for (let k = 0; k < CROWN_LEVELS; k += 1) crown.push(at(c.crownH[k]!, c.crownR[k]!));
      const rCrownTop = c.crownR[CROWN_LEVELS - 1]!;
      crown.push(at(c.hTop + c.crownTopOcc * 0.6, rCrownTop * 0.88));
      crown.push(at(c.hTop + c.crownTopOcc, rCrownTop * 0.5));
      crownTopSum += c.hTop + c.crownTopOcc;
      crownByCol.push(crown);
    }

    let apexH = top.center;
    if (!posterior) apexH = Math.max(apexH, Math.min(...cols.map((c) => c.hTop)) - 0.3);
    const postApex = add3(c0, scale3(frame.w, apexH));
    const crownApex = add3(c0, scale3(frame.w, crownTopSum / ANGULAR_COLS + 0.1));
    return {
      postByCol,
      crownByCol,
      cutbackSum,
      taperSum,
      postApex,
      crownApex,
      chamferRho: rhoSum / ANGULAR_COLS,
    };
  };

  // 축 방향 높이만으로는 비스듬한 대합 교두가 옆에서 더 가깝거나 멀다.
  // 실제 윗면 점(마지막 라운드 두 점)에서 대합치까지 거리를 재서 열마다 올리고 내린다.
  let shape = buildShape();
  if (oppNear.length > 0) {
    for (let pass = 0; pass < 5; pass += 1) {
      let changed = false;
      for (let col = 0; col < ANGULAR_COLS; col += 1) {
        const post = shape.postByCol[col]!;
        const d = Math.min(nearestOpp(post[post.length - 1]!), nearestOpp(post[post.length - 2]!));
        if (!Number.isFinite(d)) continue;
        if (d < clearance - 0.04) {
          topRaw[col] = topRaw[col]! - (clearance - d + 0.03);
          changed = true;
        } else if (d > clearance + 0.25 && topRaw[col]! < postTopMax - 0.01) {
          topRaw[col] = Math.min(postTopMax, topRaw[col]! + (d - clearance) * 0.7);
          changed = true;
        }
      }
      const dApex = nearestOpp(shape.postApex);
      if (Number.isFinite(dApex) && dApex < clearance - 0.04) {
        apexDrop += clearance - dApex + 0.03;
        changed = true;
      }
      if (!changed) break;
      shape = buildShape();
    }
  }
  const { postByCol, crownByCol, cutbackSum, taperSum, postApex, crownApex, chamferRho } = shape;
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

  // 실제 포스트 윗면(마지막 라운드 점·정점) → 대합치 최소 거리
  let occlusalClearanceMm: number | null = null;
  if (opposingLocalPts.length > 0) {
    const topPts: Vec3[] = [postApex];
    for (let col = 0; col < ANGULAR_COLS; col += 3) {
      const post = postByCol[col]!;
      topPts.push(post[post.length - 1]!, post[post.length - 2]!);
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
      postTaperDeg: Math.round((taperSum / ANGULAR_COLS / DEG) * 10) / 10,
      occlusalClearanceMm,
      marginFilletRadiusMm: round2(chamferRho),
      axisSource,
      adjacentOcclusalMm: Number.isFinite(adjacentTopH) ? round2(adjacentTopH) : null,
      crownOverPostMm: round2(
        dot3(sub3(crownApex, c0), frame.w) - dot3(sub3(postApex, c0), frame.w) - 0.1,
      ),
    },
  });
  return { kind: "design", design };
}
