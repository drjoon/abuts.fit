// 매칭된 픽스쳐 자세와 구강스캔(잇몸·인접치·대합치)으로 커스텀어벗 STL을 설계한다.
// 치종별 형상은 추적관리 커스텀어벗 실측(266건) 중앙값 템플릿에서 출발해 스캔에 맞춘다.
// 1) 마진 높이 = 픽스쳐 둘레 치은연(순측 서브진지발), 마진 단면 = 치종 템플릿(잇몸 개구부로 크기 보정)
// 2) 삽입축 = 대합치 중심 방향(없으면 악궁 교합 방향). 치종별 상한, 한쪽으로 쏠리면 줄인다.
// 3) 예측 크라운 = 포스트 + 축벽 두께. 인접치·이웃 크라운과는 접촉량만 겹치고 대합치와는 접촉만 한다.
// 4) 포스트 = R 라운드 숄더 → 편측 테이퍼 축벽(언더컷 없음) → 최정점은 대합치에서 occlusalClearance만큼 아래.
//    예측 크라운 안쪽 최소 두께를 지키고, 이웃 어벗과는 두 크라운 경계면 기준으로 떨어진다.
// 5) 커프 = cuffBlend 방식(PRC 면 2° 시작 → 4° 유지 → 오목하게 벌어져 마진, 볼록 없음).
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
/** cuffBlend: PRC 면 위 시작 기울기 2°, 골 높이까지 4° 유지, 끝 기울기 65°(최대 75°). */
const CUFF_START_SLOPE = Math.tan(2 * DEG);
const CUFF_HOLD_SLOPE = Math.tan(4 * DEG);
const CUFF_END_SLOPE = Math.tan(65 * DEG);
const CUFF_END_SLOPE_CAP = Math.tan(75 * DEG);
const CUFF_BONE_MM = 1.35;
const CUFF_EASE_MM = 0.5;
/** 크라운 제한 때문에 포스트가 안으로 들어갈 때 아래로 벌어지는 최대 기울기. */
const POST_STEP_SLOPE = Math.tan(25 * DEG);
/** 2.5° 간격(144열) — 6각 헥스 모서리(30°+60°k)가 격자 위에 놓인다. */
const ANGULAR_COLS = 144;
const SECTORS = 36;
const SUPERELLIPSE_N = 2.4;
const POST_LEVELS = 18;
const CROWN_LEVELS = 14;
const FILLET_STEPS = 6;
const LIMIT_PHI_BINS = 72;
const LIMIT_H_MIN = -1;
const LIMIT_H_STEP = 0.5;
const LIMIT_H_BINS = 34;
const OPP_CELL_MM = 0.5;
/** 인접치 스캔으로 크라운을 자르는 높이(마진 위). 그 아래는 치간유두라 자르지 않는다. */
const CONTACT_CLIP_FROM_MM = 2.5;
const MIN_POST_HEIGHT_MM = 4;

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
  axisSource: "opposing" | "arch";
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
 * 그 위는 기울기만 커지며(r'' ≥ 0, 볼록 없음) 마진에 65° 안쪽으로 닿는다.
 */
function cuffProfile(rStart: number, zStart: number, rEnd: number, zEnd: number) {
  const span = Math.max(0.35, zEnd - zStart);
  const delta = rEnd - rStart;
  if (delta <= 0) {
    return (z: number) => rStart + delta * clamp((z - zStart) / span, 0, 1);
  }
  const s0 = CUFF_START_SLOPE;
  const s1 = CUFF_HOLD_SLOPE;
  type Plan = { e: number; zh: number; lead: number; scale: number; sEnd: number; p: number };
  const planFor = (holdMm: number): Plan => {
    const zh = Math.min(holdMm, span * 0.5);
    const e = Math.min(CUFF_EASE_MM, zh * 0.6);
    const lead = (e * (s0 + s1)) / 2 + (zh - e) * s1;
    const L = span - zh;
    const need = delta - lead;
    if (L <= 1e-6 || need <= L * s1) {
      // 마진이 가까워 벌어질 필요가 없다. 같은 모양을 비례로 줄인다.
      const full = lead + L * s1;
      return { e, zh, lead, scale: full > 0 ? delta / full : 1, sEnd: s1, p: 1 };
    }
    const avg = need / L;
    let p = 2;
    let sEnd = s1 + (avg - s1) * (p + 1);
    if (sEnd > CUFF_END_SLOPE) {
      p = (L * (CUFF_END_SLOPE - s1)) / (need - L * s1) - 1;
      sEnd = CUFF_END_SLOPE;
      if (p < 1) {
        p = 1;
        sEnd = s1 + (avg - s1) * 2;
      }
    }
    return { e, zh, lead, scale: 1, sEnd, p };
  };
  let plan = planFor(CUFF_BONE_MM);
  if (plan.sEnd > CUFF_END_SLOPE_CAP) plan = planFor(CUFF_EASE_MM);
  if (plan.sEnd > CUFF_END_SLOPE_CAP) plan = planFor(0);
  const { e, zh, lead, scale, sEnd, p } = plan;
  const L = span - zh;
  return (z: number) => {
    const u = clamp(z - zStart, 0, span);
    let r: number;
    if (u <= e) {
      r = s0 * u + (e > 0 ? (s1 - s0) * e * smootherstepIntegral(u / e) : 0);
    } else if (u <= zh) {
      r = (e * (s0 + s1)) / 2 + s1 * (u - e);
    } else {
      const t = L > 0 ? (u - zh) / L : 1;
      r = lead + L * (s1 * t + ((sEnd - s1) * t ** (p + 1)) / (p + 1));
    }
    return rStart + r * scale;
  };
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

/** 픽스쳐 로컬 Z축을 따르는 닫힌 원뿔대(스크류 채널 cutter). */
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

/**
 * 구강스캔(잇몸·인접치·대합치)과 치종 템플릿으로 커스텀어벗과 예측 크라운 외형을 설계한다.
 * neighbors: 같은 악의 다른 디자인 대상 픽스쳐. 두 크라운 경계면으로 서로 떨어뜨린다.
 */
export async function designCustomAbutmentStl(args: {
  fixture: MatchedScanbodyFixture;
  jawGeometry: THREE.BufferGeometry;
  opposingGeometry: THREE.BufferGeometry | null;
  neighbors?: readonly MatchedScanbodyFixture[];
  params?: Partial<CustomAbutmentDesignParams> | null;
  patientName?: string;
}): Promise<DesignedCustomAbutment> {
  const { fixture, jawGeometry, opposingGeometry } = args;
  const params = resolveCustomAbutmentParams(fixture.toothNumber, args.params);
  const conn = fixture.connectionSpec;
  const tpl = abutmentTemplateForTooth(fixture.toothNumber);
  const R = params.marginFilletRadiusMm;
  const contact = params.crownContactMm;
  const clearance = params.occlusalClearanceMm;

  const jawLocalAll = cropScanPointsInFixtureFrame(jawGeometry, fixture.fixturePose, 15);
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
  for (let i = 0; i < jawLocalPts.length; i += 3) {
    const x = jawLocalPts[i]!;
    const y = jawLocalPts[i + 1]!;
    const z = jawLocalPts[i + 2]!;
    if (z < 0.8 || z > sbH - 0.9) continue;
    const r = Math.hypot(x, y);
    if (r < sbR + 0.35 || r > sbR + 2.4) continue;
    const b = Math.min(SECTORS - 1, Math.floor((wrapAngle(Math.atan2(y, x)) / (Math.PI * 2)) * SECTORS));
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

  // 순측 marginDepth, 설측 그 57%, 인접 0.2mm 치은연 아래(실측 마진 z 2~6mm).
  const depthLab = params.marginDepthMm;
  const depthLing = params.marginDepthMm * 0.57;
  const depthProx = Math.min(0.2, params.marginDepthMm);
  const minMarginZ = Math.max(1.5, coneTopZ + 1.1);
  const maxMarginZ = Math.min(8.0, medianGingivaZ + 1.4);
  const marginTargetSamples = rawGingivaZ.map((gz, b) => {
    const theta = (b / SECTORS) * Math.PI * 2;
    const cLab = Math.cos(theta - labialAngleFix);
    const sub =
      cLab >= 0
        ? depthProx + (depthLab - depthProx) * cLab
        : depthProx + (depthLing - depthProx) * -cLab;
    return clamp(gz - sub, minMarginZ, maxMarginZ);
  });
  const smoothMarginZ = lowPassCircular(marginTargetSamples, 2).map((z) =>
    clamp(z, minMarginZ, maxMarginZ),
  );
  const meanMarginZ = smoothMarginZ.reduce((s, v) => s + v, 0) / SECTORS;

  // 마진 위 0.6~1.8mm(치은정 쪽) 연조직 개구부 반경. 넓게 벌어진 잇몸 터널은 마진을 키워 지지한다.
  const tissueBuckets: number[][] = Array.from({ length: SECTORS }, () => []);
  for (let i = 0; i < jawLocalPts.length; i += 3) {
    const x = jawLocalPts[i]!;
    const y = jawLocalPts[i + 1]!;
    const z = jawLocalPts[i + 2]!;
    const r = Math.hypot(x, y);
    if (r < sbR + 0.25 || r > sbR + 3.2) continue;
    const b = Math.min(SECTORS - 1, Math.floor((wrapAngle(Math.atan2(y, x)) / (Math.PI * 2)) * SECTORS));
    const zm = smoothMarginZ[b]!;
    if (z < zm + 0.6 || z > zm + 1.8) continue;
    tissueBuckets[b]!.push(r);
  }
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
    // 포스트 윗면이 마진 한쪽으로 너무 나가면(마진 반경의 55% 초과) 기울기를 줄인다.
    const H = tpl.postHeightMm;
    const offX = (w[0] / w[2]) * H;
    const offY = (w[1] / w[2]) * H;
    const off = Math.hypot(offX, offY);
    if (off > 1e-6) {
      const phi = Math.atan2(offY, offX) - labialAngleFix;
      const allow = superellipseRadius(marginA, marginB, phi) * 0.55;
      if (off > allow) {
        const k = allow / off;
        w = norm3([(w[0] / w[2]) * k, (w[1] / w[2]) * k, 1]);
      }
    }
  }
  const frame = insertionFrame(w, labXY);
  const angulationDeg = Math.acos(clamp(frame.w[2], -1, 1)) / DEG;

  // ── 4) 포스트 높이: 대합치 최정점 거리
  const oppField =
    opposingLocalPts.length > 0 ? buildOpposingHeightField(opposingLocalPts, c0, frame, 8) : null;
  const footR = Math.max(marginA, marginB) - R + 0.6;
  const oppFootH = oppField ? oppField.heightAt(0, 0, footR) : Infinity;
  const hasOpposing = Number.isFinite(oppFootH);
  const postTopMax = tpl.postHeightMm + 3.0 + Math.min(0, params.postHeightOffsetMm);
  let postTopH = hasOpposing
    ? Math.min(postTopMax, oppFootH - clearance) + Math.min(0, params.postHeightOffsetMm)
    : tpl.postHeightMm + params.postHeightOffsetMm;
  postTopH = Math.max(MIN_POST_HEIGHT_MM, postTopH);

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
  const taperSlope = Math.tan(params.postTaperDeg * DEG);
  const convergeFrom = tpl.anterior ? 0.7 : 0.8;

  type ColumnPlan = {
    marginPt: Vec3;
    dir: Vec3;
    phi: number;
    h0: number;
    r0: number;
    hTop: number;
    postDesired: (h: number) => number;
    crownR: number[];
    crownH: number[];
    crownTopOcc: number;
  };
  const cols: ColumnPlan[] = [];
  const topRaw: number[] = [];

  for (let col = 0; col < ANGULAR_COLS; col += 1) {
    const theta = (col / ANGULAR_COLS) * Math.PI * 2;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const phiFix = theta - labialAngleFix;
    const rTemplate = superellipseRadius(marginA, marginB, phiFix);
    const tissueRatio = evalPeriodicLinear(tissueR, theta) / rTemplate;
    let rMargin = Math.max(
      minMarginRadius,
      rTemplate * clamp(1 + 0.5 * (tissueRatio - 1), 0.95, 1.22),
    );
    const zMargin = evalPeriodicLinear(smoothMarginZ, theta);
    const radialFix: Vec3 = [ct, st, 0];
    {
      const lim = planeLimitAt(
        norm3(sub3(radialFix, scale3(frame.w, dot3(radialFix, frame.w)))),
        zMargin - meanMarginZ,
      );
      if (Number.isFinite(lim)) rMargin = Math.max(minMarginRadius, Math.min(rMargin, lim - 0.5));
    }
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
    if (oppField) {
      const tipR = Math.max(0.6, r0 - R - 0.8);
      const tu = dot3(dir, frame.uLabial) * tipR;
      const tv = dot3(dir, frame.vSide) * tipR;
      const oppH = oppField.heightAt(tu, tv, 1.0);
      if (Number.isFinite(oppH)) hTop = Math.max(postTopH, oppH - clearance);
    }
    hTop = Math.min(hTop, postTopMax) - topDrop;
    topRaw.push(hTop);

    const rBase0 = r0 - R;
    const hBase = h0 + R;
    const topA = (cLab >= 0 ? tpl.topLabialHalfMm : tpl.topLingualHalfMm) * blScale * params.postWidthScale;
    const rTpl = superellipseRadius(topA, topB, phi);
    const plan: ColumnPlan = {
      marginPt,
      dir,
      phi,
      h0,
      r0,
      hTop,
      postDesired: (h: number) => {
        const straight =
          rBase0 * Math.min(1, params.postWidthScale) - taperSlope * Math.max(0, h - hBase);
        const span = Math.max(0.5, plan.hTop - hBase);
        const t = (h - hBase) / span;
        if (t <= convergeFrom || rTpl >= straight) return straight;
        return straight + (rTpl - straight) * smootherstep((t - convergeFrom) / (1 - convergeFrom));
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

  const buildShape = () => {
    // 윗면 높이는 열 사이를 매끄럽게 하되 대합치 제한은 다시 지킨다.
    const topSmooth = smoothCircular(topRaw, 3);
    for (let col = 0; col < ANGULAR_COLS; col += 1) {
      const c = cols[col]!;
      c.hTop = Math.max(c.h0 + R + 2.6, Math.min(topSmooth[col]!, topRaw[col]!));
      c.crownR = [];
      c.crownH = [];
      c.crownTopOcc = tpl.crownOcclusalMm;
    }

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
        let r = c.postDesired(Math.max(h, c.h0 + R)) + thick * ramp + 0.25 * ramp * Math.sin(Math.PI * frac);
        if (h >= c.h0 + CONTACT_CLIP_FROM_MM) {
          const lim = scanLimitAt(c.phi, h);
          if (Number.isFinite(lim)) {
            // 인접면은 1.2mm 안쪽이면 접촉까지 넓혀 열린 접촉을 막는다.
            if (Math.abs(sSide) > 0.6 && lim + contact > r && lim + contact - r <= 1.2) r = lim + contact;
            r = Math.min(r, lim + contact);
          }
        }
        r = Math.min(r, planeLimitAt(c.dir, h) + contact / 2);
        c.crownH.push(h);
        c.crownR.push(r);
      }
      if (oppField) {
        const tu = dot3(c.dir, frame.uLabial) * Math.max(0.5, c.crownR[c.crownR.length - 1]! * 0.6);
        const tv = dot3(c.dir, frame.vSide) * Math.max(0.5, c.crownR[c.crownR.length - 1]! * 0.6);
        const oppH = oppField.heightAt(tu, tv, 1.0);
        if (Number.isFinite(oppH)) c.crownTopOcc = clamp(oppH + contact - c.hTop, 0.6, 3.0);
      }
    }
    for (let k = 0; k < CROWN_LEVELS; k += 1) {
      const ring = smoothCircular(cols.map((c) => c.crownR[k]!), 2);
      for (let col = 0; col < ANGULAR_COLS; col += 1) {
        const c = cols[col]!;
        let cap = planeLimitAt(c.dir, c.crownH[k]!) + contact / 2;
        if (c.crownH[k]! >= c.h0 + CONTACT_CLIP_FROM_MM) {
          cap = Math.min(cap, scanLimitAt(c.phi, c.crownH[k]!) + contact);
        }
        c.crownR[k] = Math.max(c.r0 * 0.9, Math.min(ring[col]!, cap));
      }
    }
    const crownRadiusAt = (c: ColumnPlan, h: number) => {
      const f = ((h - c.h0) / (c.hTop - c.h0)) * CROWN_LEVELS;
      if (f <= 1) return c.r0 + (c.crownR[0]! - c.r0) * clamp(f, 0, 1);
      const i = Math.min(CROWN_LEVELS - 1, Math.floor(f));
      const t = clamp(f - i, 0, 1);
      return c.crownR[i - 1]! * (1 - t) + c.crownR[Math.min(i, CROWN_LEVELS - 1)]! * t;
    };

    // 포스트 단면: 원하는 형상 → 크라운 최소 두께 → 열 사이 평활 → 언더컷 없음(위로 갈수록 작거나 같다)
    const postR: number[][] = [];
    const postH: number[][] = [];
    const minPostR = 0.9;
    for (const c of cols) {
      const hBase = c.h0 + R;
      const roundStart = c.hTop - 0.5;
      const hs: number[] = [];
      const rs: number[] = [];
      for (let k = 0; k <= POST_LEVELS; k += 1) {
        const h = hBase + ((roundStart - hBase) * k) / POST_LEVELS;
        hs.push(h);
        rs.push(c.postDesired(h));
      }
      postH.push(hs);
      postR.push(rs);
    }
    const postCapAt = (col: number, k: number) => {
      const c = cols[col]!;
      const h = postH[col]![k]!;
      if (h < c.h0 + 1.5) return Infinity;
      return crownRadiusAt(c, h) - params.minCrownThicknessMm;
    };
    for (let k = 0; k <= POST_LEVELS; k += 1) {
      const ring = smoothCircular(
        postR.map((rs, col) => Math.min(rs[k]!, postCapAt(col, k))),
        2,
      );
      for (let col = 0; col < ANGULAR_COLS; col += 1) {
        postR[col]![k] = Math.max(minPostR, Math.min(ring[col]!, postCapAt(col, k), postR[col]![k]!));
      }
    }
    for (let col = 0; col < ANGULAR_COLS; col += 1) {
      const rs = postR[col]!;
      const hs = postH[col]!;
      rs[0] = Math.min(rs[0]!, cols[col]!.r0 - R);
      for (let k = POST_LEVELS - 1; k >= 0; k -= 1) {
        rs[k] = Math.min(rs[k]!, rs[k + 1]! + POST_STEP_SLOPE * (hs[k + 1]! - hs[k]!));
      }
      for (let k = 1; k <= POST_LEVELS; k += 1) rs[k] = Math.min(rs[k]!, rs[k - 1]!);
    }

    // ── 7) 열 점: 마진 → (평평한 숄더) → R 라운드 → 축벽 → 윗면 라운드 / 예측 크라운
    const postByCol: Vec3[][] = [];
    const crownByCol: Vec3[][] = [];
    let cutbackSum = 0;
    let taperSum = 0;
    let crownTopSum = 0;
    for (let col = 0; col < ANGULAR_COLS; col += 1) {
      const c = cols[col]!;
      const at = (h: number, r: number): Vec3 => add3(c0, add3(scale3(frame.w, h), scale3(c.dir, r)));
      const rs = postR[col]!;
      const hs = postH[col]!;
      const rBase = rs[0]!;
      const post: Vec3[] = [];
      // 오목 1/4원(중심 = 숄더 안쪽 끝 바로 위 R). 마진에서 축에 수직으로 들어가 축벽에 접한다.
      const arcR = R;
      const arcOuter = rBase + arcR;
      // 열마다 점 수가 같아야 한다. 평평한 숄더가 없으면 첫 점을 1/4원 반 칸 위치에 둔다.
      if (c.r0 - arcOuter > 0.02) post.push(at(c.h0, arcOuter));
      else {
        const t = (0.5 / FILLET_STEPS) * (Math.PI / 2);
        post.push(at(c.h0 + arcR - arcR * Math.cos(t), arcOuter - arcR * Math.sin(t)));
      }
      for (let s = 1; s <= FILLET_STEPS; s += 1) {
        const t = (s / FILLET_STEPS) * (Math.PI / 2);
        post.push(at(c.h0 + arcR - arcR * Math.cos(t), arcOuter - arcR * Math.sin(t)));
      }
      for (let k = 1; k <= POST_LEVELS; k += 1) post.push(at(hs[k]!, rs[k]!));
      const rEnd = rs[POST_LEVELS]!;
      post.push(at(c.hTop - 0.17, Math.max(0.3, rEnd - 0.16)));
      post.push(at(c.hTop, Math.max(0.2, rEnd - 0.5)));
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

    const meanTopH = cols.reduce((s, c) => s + c.hTop, 0) / ANGULAR_COLS;
    let apexH = meanTopH + 0.05 - apexDrop;
    apexH = Math.max(apexH, Math.min(...cols.map((c) => c.hTop)) - 0.3);
    const postApex = add3(c0, scale3(frame.w, apexH));
    const crownApex = add3(c0, scale3(frame.w, crownTopSum / ANGULAR_COLS + 0.1));
    return { postByCol, crownByCol, cutbackSum, taperSum, postApex, crownApex };
  };

  // 축 방향 높이만으로는 비스듬한 대합 교두가 옆에서 더 가깝거나 멀다.
  // 실제 윗면 점(마지막 라운드 두 점)에서 대합치까지 거리를 재서 열마다 올리고 내린다.
  let shape = buildShape();
  if (oppNear.length > 0) {
    for (let pass = 0; pass < 4; pass += 1) {
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
  const { postByCol, crownByCol, cutbackSum, taperSum, postApex, crownApex } = shape;

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
  return buildDesignedCustomAbutment({
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
      marginFilletRadiusMm: R,
      axisSource,
    },
  });
}
