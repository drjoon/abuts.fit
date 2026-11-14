// 매칭된 픽스쳐 자세와 구강스캔(잇몸·인접치·대합치)으로 커스텀어벗 STL을 설계한다.
// 치종별 형상은 추적관리 커스텀어벗 실측(266건) 중앙값 템플릿에서 출발해 스캔에 맞춘다.
// 1) 마진 높이 = 픽스쳐 둘레 치은연(순측 서브진지발), 마진 단면 = 치종 템플릿(인접 간격·잇몸 개구부로 크기 보정)
// 2) 삽입축 = 악궁 교합 방향 + 인접치 사이 가운데, 치종별 상한(전치 16°, 소구치 13°, 대구치 10°)
// 3) 포스트 = 마진 숄더 0.5mm 안쪽에서 템플릿 윗면까지 삽입축 기준 단조 축소(언더컷 없음)
// 4) 닫힌 외형에서 스크류 채널을 빼서(manifold) 하나의 닫힌 STL을 만든다.
// 로컬 좌표계(제조사 STL SSOT): 플랫폼 원점(0,0,0), +Z 임플란트 장축, +X 헥스 평면 법선.
// related files:
// - web/frontend/src/shared/practice/customAbutmentScanbodyMatch.ts
// - web/frontend/src/shared/practice/toothMorphology.ts
// - web/frontend/src/shared/practice/meshUnion.ts
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
import { subtractTriangleSoups } from "@/shared/practice/meshUnion";
import { toothFormOf, type ToothKind } from "@/shared/practice/toothMorphology";
import type { Vec3 } from "@/shared/practice/scanbodyRegistration";

const TAPER_11_SLOPE = Math.tan((11 * Math.PI) / 180);
const CUFF_START_SLOPE = Math.tan((2 * Math.PI) / 180);
/** 포스트 축벽 최소 편측 테이퍼(실측 p25 ≈ 3°). */
const MIN_POST_TAPER_SLOPE = Math.tan((3 * Math.PI) / 180);
/** 2.5° 간격(144열) — 6각 헥스 모서리(30°+60°k)가 격자 위에 놓인다. */
const ANGULAR_COLS = 144;
const SECTORS = 36;
const SHOULDER_MM = 0.5;
const SUPERELLIPSE_N = 2.4;

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
  /** 스캔 월드 좌표로 배치된 예측 크라운 외형 BufferGeometry(뷰어 반투명 확인용). */
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
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function worldDirToFixtureLocal(dir: Vec3, pose: FixtureWorldPose): Vec3 {
  return norm3([dot3(dir, pose.hexX), dot3(dir, pose.hexY), dot3(dir, pose.axis)]);
}

function smootherstep(t: number) {
  const x = clamp(t, 0, 1);
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
  tiltCapDeg: number;
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
        postHeightMm: 7.2, naturalMdMm: 5.6, tiltCapDeg: 16, lingualTopDropMm: 0.8,
        crownLabialMm: 1.1, crownLingualMm: 0.9, crownOcclusalMm: 1.6,
      };
    }
    const lateral = pos === 2;
    return {
      kind, anterior: true,
      marginBlMm: lateral ? 4.7 : 5.0, marginMdMm: lateral ? 4.8 : 5.2,
      topLabialHalfMm: 0.85, topLingualHalfMm: 0.65, topMdMm: lateral ? 3.2 : 3.6,
      postHeightMm: lateral ? 6.8 : 7.3, naturalMdMm: lateral ? 6.6 : 8.5,
      tiltCapDeg: 16, lingualTopDropMm: 1.0,
      crownLabialMm: 1.2, crownLingualMm: 1.0, crownOcclusalMm: 1.7,
    };
  }
  if (kind === "canine") {
    return {
      kind, anterior: true,
      marginBlMm: upper ? 5.5 : 5.0, marginMdMm: upper ? 5.1 : 4.9,
      topLabialHalfMm: 1.0, topLingualHalfMm: 0.85, topMdMm: 3.4,
      postHeightMm: upper ? 7.6 : 7.4, naturalMdMm: upper ? 7.6 : 6.9,
      tiltCapDeg: 16, lingualTopDropMm: 0.8,
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
      tiltCapDeg: 13, lingualTopDropMm: 0.2,
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
    tiltCapDeg: 10, lingualTopDropMm: 0.15,
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

/**
 * 구강스캔(잇몸·인접치·대합치)과 치종 템플릿으로 커스텀어벗과 예측 크라운 외형을 설계한다.
 */
export async function designCustomAbutmentStl(args: {
  fixture: MatchedScanbodyFixture;
  jawGeometry: THREE.BufferGeometry;
  opposingGeometry: THREE.BufferGeometry | null;
  patientName?: string;
}): Promise<DesignedCustomAbutment> {
  const { fixture, jawGeometry, opposingGeometry } = args;
  const conn = fixture.connectionSpec;
  const tpl = abutmentTemplateForTooth(fixture.toothNumber);

  const jawLocalPts = cropScanPointsInFixtureFrame(jawGeometry, fixture.fixturePose, 14.5);
  const opposingLocalPts = cropScanPointsInFixtureFrame(opposingGeometry, fixture.fixturePose, 16);

  const boreBotR = conn.screwLowerDiameterMm / 2;
  const boreTopR = conn.screwUpperDiameterMm / 2;
  const originR = conn.originDiameterMm / 2;
  const coneTopZ = conn.prcConeTopMm;
  const coneTopR = originR + TAPER_11_SLOPE * coneTopZ;
  const sbR = fixture.scanbodyRadiusMm;
  const sbH = fixture.scanbodyHeightMm;

  const occInFix = worldDirToFixtureLocal(fixture.archOcclusalDir, fixture.fixturePose);
  const labInFix = worldDirToFixtureLocal(fixture.labialDir, fixture.fixturePose);
  const labXY = norm3([labInFix[0], labInFix[1], 0]);
  const sideXY: Vec3 = [-labXY[1], labXY[0], 0];
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

  // 순측 0.7mm·설측 0.4mm·인접 0.2mm 치은연 아래(실측 마진 z 2~6mm, 스캘럽 1.2~2mm).
  const minMarginZ = Math.max(1.5, coneTopZ + 1.1);
  const maxMarginZ = Math.min(8.0, medianGingivaZ + 1.4);
  const marginTargetSamples = rawGingivaZ.map((gz, b) => {
    const theta = (b / SECTORS) * Math.PI * 2;
    const cLab = Math.cos(theta - labialAngleFix);
    const sub = cLab >= 0 ? 0.2 + 0.5 * cLab : 0.2 + 0.2 * -cLab;
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
    const ang = ((Math.atan2(y, x) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const b = Math.min(SECTORS - 1, Math.floor((ang / (Math.PI * 2)) * SECTORS));
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

  // ── 2) 악궁 교합 방향으로 1차 삽입축 → 인접치 간격·대합치 간격 측정
  const rawTiltRad = Math.acos(clamp(occInFix[2], -1, 1));
  const tiltCapRad = (tpl.tiltCapDeg * Math.PI) / 180;
  const occLat = Math.hypot(occInFix[0], occInFix[1]);
  const tiltPerMm: [number, number] =
    occLat > 1e-5
      ? [
          (occInFix[0] / occLat) * Math.tan(Math.min(rawTiltRad * 0.85, tiltCapRad)),
          (occInFix[1] / occLat) * Math.tan(Math.min(rawTiltRad * 0.85, tiltCapRad)),
        ]
      : [0, 0];
  const frame0 = insertionFrame(norm3([tiltPerMm[0], tiltPerMm[1], 1]), labXY);

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
    const phi = ((Math.atan2(v, u) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
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
      if (d <= (25 * Math.PI) / 180 && Number.isFinite(adjLimitR[b]!)) vals.push(adjLimitR[b]!);
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
  let opposingMinH = Infinity;
  for (let i = 0; i < opposingLocalPts.length; i += 3) {
    const rel = sub3(
      [opposingLocalPts[i]!, opposingLocalPts[i + 1]!, opposingLocalPts[i + 2]!],
      c0,
    );
    const h = dot3(rel, frame0.w);
    if (h < 2 || h > 16) continue;
    const u = dot3(rel, frame0.uLabial);
    const v = dot3(rel, frame0.vSide);
    if (Math.hypot(u, v) <= 3.2 && h < opposingMinH) opposingMinH = h;
  }
  // 대합치가 있으면 크라운 교합 두께만 남기고 포스트를 올린다(실측 p75까지).
  const postTopH = Number.isFinite(opposingMinH)
    ? clamp(opposingMinH - tpl.crownOcclusalMm - 0.2, 4.2, tpl.postHeightMm + 1.2)
    : tpl.postHeightMm;

  // ── 3) 최종 삽입축: 교합 방향 기울기 + 인접치 사이 가운데(전치는 순측 기울기로 스크류홀을 설측에 둔다)
  let offX = tiltPerMm[0] * postTopH + sideXY[0] * sideShiftMm * 0.7;
  let offY = tiltPerMm[1] * postTopH + sideXY[1] * sideShiftMm * 0.7;
  if (tpl.anterior) {
    const labComp = offX * labXY[0] + offY * labXY[1];
    const want = Math.min(1.3, Math.tan(tiltCapRad) * postTopH * 0.8);
    if (labComp < want) {
      offX += labXY[0] * (want - labComp);
      offY += labXY[1] * (want - labComp);
    }
  }
  const maxOff = Math.tan(tiltCapRad) * postTopH;
  const offLen = Math.hypot(offX, offY);
  if (offLen > maxOff) {
    offX *= maxOff / offLen;
    offY *= maxOff / offLen;
  }
  const frame = insertionFrame(norm3([offX / postTopH, offY / postTopH, 1]), labXY);
  const angulationDeg = (Math.acos(clamp(frame.w[2], -1, 1)) * 180) / Math.PI;

  // ── 4) 열(픽스쳐 원통 각 θ)마다 마진 → 숄더 → 포스트 → 윗면 라운드
  const marginA = (tpl.marginBlMm / 2) * blScale;
  const marginB = (tpl.marginMdMm / 2) * mdScale;
  const topB = (tpl.topMdMm / 2) * mdScale;
  const minMarginRadius = coneTopR + 0.5;
  const postLevels = 16;

  const marginPointByCol: Vec3[] = [];
  const postByCol: Vec3[][] = [];
  const crownByCol: Vec3[][] = [];
  const topHByCol: number[] = [];
  let cutbackSum = 0;
  let crownTopSum = 0;

  for (let col = 0; col < ANGULAR_COLS; col += 1) {
    const theta = (col / ANGULAR_COLS) * Math.PI * 2;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const phiFix = theta - labialAngleFix;
    const rTemplate = superellipseRadius(marginA, marginB, phiFix);
    const tissueRatio = evalPeriodicLinear(tissueR, theta) / rTemplate;
    const rMargin = Math.max(
      minMarginRadius,
      rTemplate * clamp(1 + 0.5 * (tissueRatio - 1), 0.95, 1.22),
    );
    const zMargin = evalPeriodicLinear(smoothMarginZ, theta);
    const marginPt: Vec3 = [rMargin * ct, rMargin * st, zMargin];
    marginPointByCol.push(marginPt);

    const relM = sub3(marginPt, c0);
    const h0 = dot3(relM, frame.w);
    const radial = sub3(relM, scale3(frame.w, h0));
    const r0 = Math.hypot(...radial);
    const dir = scale3(radial, 1 / Math.max(r0, 1e-6));
    const phi = Math.atan2(dot3(dir, frame.vSide), dot3(dir, frame.uLabial));
    const cLab = Math.cos(phi);
    const sSide = Math.sin(phi);
    const at = (h: number, r: number): Vec3 =>
      add3(c0, add3(scale3(frame.w, h), scale3(dir, r)));

    // 실측 숄더: 마진 위 0.5mm에서 0.27mm, 1mm에서 0.5mm 안쪽.
    const rBase = r0 - SHOULDER_MM;
    const hBase = h0 + 1.0;
    const topDrop = cLab < 0 ? tpl.lingualTopDropMm * -cLab : 0;
    const hTop = Math.max(hBase + 2.6, postTopH - topDrop);
    topHByCol.push(hTop);
    const span = hTop - hBase;
    const topA = cLab >= 0 ? tpl.topLabialHalfMm * blScale : tpl.topLingualHalfMm * blScale;
    const rTop = clamp(
      superellipseRadius(topA, topB, phi),
      0.45,
      rBase - MIN_POST_TAPER_SLOPE * span,
    );
    const radiusAt = (h: number) => rBase + (rTop - rBase) * clamp((h - hBase) / span, 0, 1);

    const post: Vec3[] = [
      at(h0 + 0.12, r0 - 0.05),
      at(h0 + 0.5, r0 - 0.27),
      at(hBase, rBase),
    ];
    const roundStart = hTop - 0.5;
    for (let k = 1; k <= postLevels; k += 1) {
      const h = hBase + ((roundStart - hBase) * k) / postLevels;
      post.push(at(h, radiusAt(h)));
    }
    const rEnd = radiusAt(roundStart);
    post.push(at(hTop - 0.17, Math.max(0.3, rEnd - 0.16)));
    post.push(at(hTop, Math.max(0.2, rEnd - 0.5)));
    postByCol.push(post);

    // 예측 크라운: 포스트 + 축벽 두께(인접면은 인접치 접촉까지), 교합·절단 두께
    const adjR = evalPeriodicLinear(
      adjLimitR.map((r) => (Number.isFinite(r) ? r : 99)),
      ((phi % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2),
    );
    const rPostMid = radiusAt(hBase + span * 0.4);
    const faceThick = cLab >= 0 ? tpl.crownLabialMm : tpl.crownLingualMm;
    const sideThick = adjR < 50 ? clamp(adjR - 0.05 - rPostMid, 1.0, 2.6) : faceThick + 0.3;
    const thick = faceThick + (sideThick - faceThick) * sSide * sSide;
    cutbackSum += thick;
    const crown: Vec3[] = [marginPt];
    for (let k = 1; k <= 14; k += 1) {
      const h = h0 + ((hTop - h0) * k) / 14;
      const ramp = smootherstep((h - h0) / 1.8);
      crown.push(at(h, radiusAt(h) + thick * ramp + 0.25 * ramp * Math.sin(Math.PI * clamp((h - h0) / (hTop - h0), 0, 1))));
    }
    const rCrownTop = rTop + thick;
    const occ = Number.isFinite(opposingMinH)
      ? clamp(opposingMinH - 0.1 - topDrop - hTop, tpl.crownOcclusalMm, tpl.crownOcclusalMm + 0.8)
      : tpl.crownOcclusalMm;
    crown.push(at(hTop + occ * 0.6, rCrownTop * 0.88));
    crown.push(at(hTop + occ, rCrownTop * 0.5));
    crownTopSum += hTop + occ;
    crownByCol.push(crown);
  }

  const meanTopH = topHByCol.reduce((s, v) => s + v, 0) / ANGULAR_COLS;
  const postApex = add3(c0, scale3(frame.w, meanTopH + 0.05));
  const crownApex = add3(c0, scale3(frame.w, crownTopSum / ANGULAR_COLS + 0.1));

  // ── 5) 커넥션(헥스 + 11° 원뿔) + 치은 커프 + 포스트를 닫힌 외형으로 잇고 스크류 채널을 뺀다
  const l2 = conn.l2Mm;
  const zBot = -l2;
  const seatZ0 = 0.8;
  const seatZ1 = 1.3;
  const hexFlatR = conn.hexSizeMm ? conn.hexSizeMm / 2 : originR - TAPER_11_SLOPE * (l2 * 0.45);
  const hexCornerR = conn.hexSizeMm ? (hexFlatR / Math.cos(Math.PI / 6)) * 0.982 : hexFlatR;
  const coneStartZ = Math.max(zBot + 0.75, Math.min(-0.25, (hexCornerR - originR) / TAPER_11_SLOPE));
  const cuffRows = 20;
  const bottomPole: Vec3 = [0, 0, zBot];

  const bodyColumns: Vec3[][] = [];
  for (let col = 0; col < ANGULAR_COLS; col += 1) {
    const theta = (col / ANGULAR_COLS) * Math.PI * 2;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const marginPt = marginPointByCol[col]!;
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
    const cuffSpan = Math.max(0.35, zMarginFix - coneTopZ);
    for (let k = 1; k < cuffRows; k += 1) {
      const u = k / cuffRows;
      const z = coneTopZ + cuffSpan * u;
      const linearBase = coneTopR + CUFF_START_SLOPE * (z - coneTopZ);
      pts.push(cyl(linearBase + smootherstep(u) * (rMarginFix - linearBase), z));
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

  const cleanPatient = String(args.patientName || "")
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, "");
  const fileName = cleanPatient
    ? `${cleanPatient}_${fixture.toothNumber}_custom_abutment.stl`
    : `custom_abutment_${fixture.toothNumber}.stl`;
  const stlBlob = encodeBinaryStl(localPositions, `abuts.fit custom abutment #${fixture.toothNumber}`);

  const toWorld = fixturePoseToMatrix4(fixture.fixturePose);
  const worldGeometry = new THREE.BufferGeometry();
  worldGeometry.setAttribute("position", new THREE.BufferAttribute(localPositions.slice(), 3));
  worldGeometry.applyMatrix4(toWorld);
  worldGeometry.computeVertexNormals();
  worldGeometry.computeBoundingBox();

  const predictedCrownWorldGeometry = new THREE.BufferGeometry();
  predictedCrownWorldGeometry.setAttribute("position", new THREE.BufferAttribute(crownLocalPositions, 3));
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
  let maxOuterR = 0;
  for (let i = 0; i < localPositions.length; i += 3) {
    const z = localPositions[i + 2]!;
    if (z < zMinLocal) zMinLocal = z;
    if (z > zMaxLocal) zMaxLocal = z;
    maxOuterR = Math.max(maxOuterR, Math.hypot(localPositions[i]!, localPositions[i + 1]!));
  }

  const round2 = (v: number) => Math.round(v * 100) / 100;
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
      maxDiameterMm: round2(maxOuterR * 2),
      cuffHeightMinMm: round2(Math.min(...smoothMarginZ)),
      cuffHeightMaxMm: round2(Math.max(...smoothMarginZ)),
      postHeightMm: round2(zMaxLocal - meanMarginZ),
      totalLengthMm: round2(zMaxLocal - zMinLocal),
      angulationDeg: Math.round(angulationDeg * 10) / 10,
      cutbackMm: round2(cutbackSum / ANGULAR_COLS),
      rmsMm: fixture.rmsMm,
    },
  };
}
