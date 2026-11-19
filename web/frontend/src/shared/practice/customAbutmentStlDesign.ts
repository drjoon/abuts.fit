// 매칭된 픽스쳐 자세와 구강스캔(잇몸·인접치·대합치)으로 커스텀어벗 STL을 설계한다.
// 치종별 형상은 추적관리 커스텀어벗 실측(266건) 중앙값 템플릿에서 출발해 스캔에 맞춘다.
// 1) 피니시라인 = 둘레 치은 연하(얕은 끝~깊은 끝)의 완만한 스캘럽. 깊이를 옮겨도 2차 조화만 남긴다. 마진 단면 = 치종 템플릿.
// 2) 삽입축 = 인접 자연치·인접 어벗 장축과 같은 각도(브리지는 더 정확히). 없으면 대합·악궁 방향.
//    같은 브리지의 지대치 포스트 높이는 맞춘다. 대합 공간이 가장 긴 쪽까지 못 가면, 짧은 포스트 높이로 맞춘다.
// 3) 예측 크라운 = 포스트 + 축벽 두께. 인접치·이웃 크라운과는 접촉량만 겹치고 대합치와는 접촉만 한다.
// 4) 포스트 = 오목 챔퍼(실측: 45° 시작, 폭 0.5mm, 곡률 ≥ 공구 R) → 편측 테이퍼 축벽(언더컷 없음)
//    → 윗면 라운드. 소·대구치 윗면은 평면, 최정점은 대합치에서 occlusalClearance만큼 아래.
//    절치는 인접 자연치 절단부처럼 순설로 좁은 삽형이다. 설측은 치경 싱귤럼 위부터 설면와가 들어가게 사선으로 깎는다.
//    절치 포스트 높이는 대합보다 인접 자연치 절단연 길이(순측으로 기운 끝 포함)를 따르고, 도재 두께만 뺀다.
//    삽입축의 순측·근원심 기울기도 그 인접치 장축을 따른다. 설측 대합만 가까우면 순측 절단을 함께 깎지 않는다.
//    예측 크라운 두께(목표 1mm, 공간 없으면 0.65mm)와 스크류 채널 벽을 지키고, 줄이는 양은 둘레로 퍼뜨린다.
// 5) 커프 = cuffBlend 방식(PRC 면 2° 시작 → 4° 유지 → 오목하게 벌어져 실측 각도로 피니시라인, 볼록 없음).
// 6) 포스트 축벽은 솔리드로 두고, 화면용 메시만 임플란트 축 원통으로 스크류 홀을 뚫는다.
//    저장·다운로드 STL은 홀을 메운 솔리드다. 가공에서 그 홀을 다시 메운다.
//    원통이 옆면으로 나오지 않게 축벽이 채널을 윗면까지 감싼 뒤 뺀다(manifold).
// 로컬 좌표계(제조사 STL SSOT): 플랫폼 원점(0,0,0), +Z 임플란트 장축, +X 헥스 평면 법선.
// related files:
// - web/frontend/src/shared/practice/customAbutmentDesignParams.ts
// - web/frontend/src/shared/practice/customAbutmentScanbodyMatch.ts
// - web/frontend/src/shared/practice/toothMorphology.ts
// - web/frontend/src/shared/practice/meshUnion.ts
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx
// - web/frontend/src/shared/practice/cuffProfile.ts
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
  RETENTION_SINGLE_MIN_TAPER_DEG,
  computeOptimalPostTaperDeg,
  evaluatePostTaperRetention,
  resolveAbutmentBridgeRetentionSpec,
  resolveCustomAbutmentParams,
  resolveToothBridgeRetentionContext,
  snapMaxDiameterMm,
  type CustomAbutmentDesignParams,
} from "@/shared/practice/customAbutmentDesignParams";
import {
  abutmentLogicSignature,
  applyAbutmentGenerationLogic,
  generationAxisBias,
  type AbutmentGenerationRule,
} from "@/shared/practice/abutmentDesignLogic";
import { cuffProfile } from "@/shared/practice/cuffProfile";
import { subtractTriangleSoups } from "@/shared/practice/meshUnion";
import {
  shortestPostTopClearanceMm,
  solvePostTopClearanceShiftMm,
} from "@/shared/practice/occlusalClearanceRay";
import {
  crownOcclusalReliefRatio,
  toothFormOf,
  type ToothKind,
} from "@/shared/practice/toothMorphology";
import {
  getToothAnatomy,
  type ToothAnatomySpec,
} from "@/shared/practice/toothAnatomy";
import {
  resolveCustomAbutmentSelection,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";
import type { Vec3 } from "@/shared/practice/scanbodyRegistration";
import { computeCreasedVertexNormals } from "@/shared/three/backFaceShell";

const DEG = Math.PI / 180;
const TAPER_11_SLOPE = Math.tan(11 * DEG);
/** 지르코니아 크라운 두께 하한. 공간이 좁아도 이보다 얇게 두지 않는다(적절 두께 1.0~1.5mm). */
const CROWN_THICKNESS_FLOOR_MM = 0.7;
/** 스크류 채널 둘레 포스트 벽 최소 두께(구치부 360° 칼라 및 전치부 순·근·원심 칼라). 모든 포스트 외벽은 절대 0.3mm 이상을 유지한다. */
const SCREW_WALL_MM = 0.55;
const SCREW_WALL_TIGHT_MM = 0.4;
const MIN_POST_WALL_MM = 0.4;
/** 스크류 홀을 뚫은 뒤에도 상단 라운드 끝단까지 포스트 파절이 없도록 지키는 외벽 목표 두께(0.38mm → 라운드·부울 뒤 ≥0.31mm 확보). */
const MIN_FRACTURE_SAFE_POST_WALL_MM = 0.38;
/** 인접치 공간 협소 시 편측 최대 인접면 법랑질 삭제(enameloplasty) 허용량(mm). */
const MAX_ADJACENT_ENAMELOPLASTY_MM = 0.2;
/** 인접치 인접면 미세 삭제까지 동원할 때 반드시 남길 최소 크라운 두께(mm). */
const MIN_STRIP_CROWN_WALL_MM = 0.52;
/** 공간 협소로 포스트 파절 위험이 있을 때 인접치처럼 올리는 치은 연상 구간(치은 연하 -2.0 ~ -1.5mm). */
const SUPRAGINGIVAL_STRENGTH_MIN_MM = -2.0;
const SUPRAGINGIVAL_STRENGTH_MAX_MM = -1.5;
const ANTERIOR_SCREW_WALL_MM = 0.52;
const ANTERIOR_SCREW_LINGUAL_WALL_MM = 0.44;
/** 교합면-축벽 라인 앵글 반경. 축벽에 접선으로 이어진다. 전치·구치 모두 0.5mm. */
const TOP_ROUND_POSTERIOR_MM = 0.5;
const TOP_ROUND_ANTERIOR_MM = 0.5;
const TOP_ROUND_STEPS = 10;
/** 픽스쳐 사이가 이 안이면 붙은 치아로 보고 삽입축을 평행하게 맞춘다. */
const PARALLEL_GROUP_MM = 13;
/** 소·대구치 윗면이 대합 경사를 따르는 삽입축 프레임 기울기 상한. */
const FLAT_TOP_MAX_TILT = Math.tan(18 * DEG);
/** 교합 방향에서 본 구치 윗면 기울기. 0이면 교합면과 평행한 평평한 면. */
const FLAT_TOP_ARCH_MAX_TILT = Math.tan(2 * DEG);
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
/** 픽스쳐가 깊게 식립되어 커프 여유가 있을 때 우선 확보할 최소 포스트 높이(mm). 마진은 치은 연하 깊은 끝을 넘지 않는다. */
const TARGET_RETENTION_POST_HEIGHT_MM = 4.5;
/** 치은선을 초기 추정하는 범위: 스캔바디 면에서 바깥으로 이만큼(출현 소켓 테두리까지 보되 가파른 인접치 벽 직전에서 멈춘다). */
const GINGIVA_RIM_REACH_MM = 2.1;
const GINGIVA_RIM_BIN_MM = 0.4;
/** 바깥 칸이 이보다 가파르게 솟으면 잇몸이 아니라 인접치 벽이다. */
const GINGIVA_RIM_MAX_STEP_MM = 0.95;
const MIN_POST_HEIGHT_MM = 4;
/** 포스트 윗면은 예측 크라운 교합면(인접치 높이)보다 이만큼 낮다. */
const POST_BELOW_CROWN_MM = 1.5;
const CROWN_TOP_OCC_MAX_MM = 4.5;

export type AdjacentEnameloplastyGuide = {
  /** 인접 치아 FDI 번호 (예: "32", "34"). */
  adjacentToothNumber: string;
  /** 내 치아 기준 방향 ("mesial" | "distal"). */
  side: "mesial" | "distal";
  /** 편측 최대 삭제량(mm, 최대 0.20mm). */
  maxDepthMm: number;
  /** 스캔 월드 좌표 기준 삭제 부위 중심점 [x, y, z]. */
  spotCenterWorld: [number, number, number];
};

export type CustomAbutmentDesignMetrics = {
  connectionDiameterMm: number;
  maxDiameterMm: number;
  cuffHeightMinMm: number;
  cuffHeightMaxMm: number;
  postHeightMm: number;
  /** 접착 면적에 쓰는 축벽 반지름(mm). 피니시라인 평균 반지름에서 마진 폭을 뺀 값. */
  postWallRadiusMm?: number;
  totalLengthMm: number;
  /** 픽스쳐 장축과 크라운 삽입축 사이의 각도(°). */
  angulationDeg: number;
  /** 예측 크라운 대비 평균 축벽 컷백 두께(mm). */
  cutbackMm: number;
  rmsMm: number;
  /** 포스트 축벽 평균 편측 테이퍼(°). */
  postTaperDeg: number;
  /** 최소 테이퍼(2°) 클램프 전 포스트 높이·상단 벽 여유 기준 적정 편측 테이퍼(°). */
  idealPostTaperDeg?: number;
  /** 전치부(절치·견치) 설측 사면 — 마진에서 사면이 시작되는 높이(mm). 구치부는 null. */
  postLingualBevelMm?: number | null;
  /** 전치부(절치·견치) 순측 사면 — 마진에서 사면이 시작되는 높이(mm). 0이면 없음. 구치부는 null. */
  postLabialBevelMm?: number | null;
  /** 포스트 윗면 → 대합치 최소 거리(mm). 대합치가 없으면 null. */
  occlusalClearanceMm: number | null;
  marginFilletRadiusMm: number;
  /** opposing: 대합치 중심, arch: 악궁 교합 방향, parallel: 붙은 치아와 평행. */
  axisSource: "opposing" | "arch" | "parallel";
  /** 인접 자연치 교합면 높이(마진 기준 mm). 인접치가 없으면 null. 예전 저장본은 없다. */
  adjacentOcclusalMm?: number | null;
  /** 예측 크라운 교합면 − 포스트 윗면(mm). */
  crownOverPostMm?: number;
  /** 치은 연하 마진 얕은 끝(mm). 설정값. */
  marginSubgMinMm?: number;
  /** 치은 연하 마진 깊은 끝(mm). 설정값. */
  marginSubgMaxMm?: number;
  /** 의뢰 치식 메타데이터 기준 브리지 연결 여부. */
  isBridge?: boolean;
  /** 브리지 스팬 내 연결 지대치 수(싱글은 1). */
  bridgeRetainerCount?: number;
  /** 포스트 파절 방지 두께(≥0.3mm) 확보를 위해 치은 연상(-1.5~-2.0mm)으로 올렸는지 여부. */
  supragingivalRaisedForStrength?: boolean;
  /** 스크류 홀 둘레 최소 포스트 벽 두께(mm). */
  minPostWallThicknessMm?: number;
  /** 크라운 두께 확보를 위해 필요한 인접치 인접면 미세 삭제(편측 ≤0.2mm) 목록. */
  adjacentEnameloplasty?: AdjacentEnameloplastyGuide[];
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
  /** 픽스쳐 로컬 좌표 인접치 인접면 삭제 표시 패치 삼각형 정점(9개씩). */
  enameloplastyLocalPositions?: Float32Array;
  stlBlob: Blob;
  /** 스캔 월드 좌표로 배치된 커스텀어벗 BufferGeometry. */
  worldGeometry: THREE.BufferGeometry;
  /** 스캔 월드 좌표로 배치된 예측 크라운 외형 BufferGeometry(뷰어 반투명 확인용). */
  predictedCrownWorldGeometry: THREE.BufferGeometry;
  /** 인접치 삭제 부위(계산용). 뷰어에는 올리지 않는다. */
  enameloplastyWorldGeometry?: THREE.BufferGeometry;
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

function fixtureLocalPointToWorld(p: Vec3, pose: FixtureWorldPose): Vec3 {
  return add3(
    pose.origin,
    add3(add3(scale3(pose.hexX, p[0]), scale3(pose.hexY, p[1])), scale3(pose.axis, p[2])),
  );
}

/** 원점(0, 0)에서 단위 방향 (dx, dy) 반직선이 중심 (cx, cy)·반지름 r 원의 바깥 경계까지 닿는 양의 거리. */
function rayCircleRadius(cx: number, cy: number, r: number, dx: number, dy: number): number {
  if (r <= 0) return 0;
  const b = cx * dx + cy * dy;
  const c2 = cx * cx + cy * cy;
  const disc = r * r - (c2 - b * b);
  if (disc <= 0) return 0;
  return Math.max(0, b + Math.sqrt(disc));
}

/** 픽스쳐 주변 대합 스캔 삼각형을 로컬 좌표로 모은다. 9 float = 삼각형 하나. */
function opposingTrianglesInFixtureFrame(
  geometry: THREE.BufferGeometry | null | undefined,
  pose: FixtureWorldPose,
  radiusMm: number,
): Float32Array {
  if (!geometry) return new Float32Array(0);
  const pos = geometry.getAttribute("position");
  if (!pos || pos.count < 3) return new Float32Array(0);
  const index = geometry.getIndex();
  const triCount = Math.floor((index ? index.count : pos.count) / 3);
  const r2 = radiusMm * radiusMm;
  const [ox, oy, oz] = pose.origin;
  const out: number[] = [];
  const far = (x: number, y: number, z: number) => {
    const dx = x - ox;
    const dy = y - oy;
    const dz = z - oz;
    return dx * dx + dy * dy + dz * dz > r2;
  };
  for (let t = 0; t < triCount; t += 1) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    const x0 = pos.getX(i0);
    const y0 = pos.getY(i0);
    const z0 = pos.getZ(i0);
    const x1 = pos.getX(i1);
    const y1 = pos.getY(i1);
    const z1 = pos.getZ(i1);
    const x2 = pos.getX(i2);
    const y2 = pos.getY(i2);
    const z2 = pos.getZ(i2);
    if (far(x0, y0, z0) && far(x1, y1, z1) && far(x2, y2, z2)) continue;
    const a = worldPointToFixtureLocal([x0, y0, z0], pose);
    const b = worldPointToFixtureLocal([x1, y1, z1], pose);
    const c = worldPointToFixtureLocal([x2, y2, z2], pose);
    out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  }
  return new Float32Array(out);
}

function measurePostTopClearanceMm(
  opposingGeometry: THREE.BufferGeometry | null | undefined,
  pose: FixtureWorldPose,
  columns: readonly Vec3[][],
  apex: Vec3,
  up: Vec3,
): number | null {
  const tris = opposingTrianglesInFixtureFrame(opposingGeometry, pose, 18);
  if (tris.length < 9) return null;
  return shortestPostTopClearanceMm({
    columns,
    apex,
    roundSteps: TOP_ROUND_STEPS,
    opposingTris: tris,
    up,
  });
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

/**
 * 커넥션(coneZ 이하)은 그대로 두고, 커프~포스트 전체에 균등 비례 스케일을 걸어 최대 반경이 targetR이 되도록 줄인다.
 * 개별 정점 원호 클램프(minKeepOuterR)는 직선 벽 중간에 원호를 튀어나오게 해 오목 단면을 만들므로 쓰지 않고,
 * 스크류 채널 최소 벽 두께를 지키는 전역 균등 배율 하한만 적용해 모든 수평 단면의 볼록성을 100% 보존한다.
 */
function compressOuterRadius(
  positions: Float32Array,
  coneZ: number,
  blendTopZ: number,
  maxR: number,
  targetR: number,
  minKeepOuterR = 0,
  boreSkipR = 0,
) {
  if (!(maxR > 0.5) || !(targetR > 0.3) || !(targetR < maxR - 1e-4)) return;
  const rawScale = targetR / maxR;
  const zSpan = Math.max(0.35, blendTopZ - coneZ);
  let safeScale = rawScale;
  if (minKeepOuterR > 0) {
    for (let i = 0; i < positions.length; i += 3) {
      const z = positions[i + 2]!;
      if (z <= coneZ + 1e-4) continue;
      const rXY = Math.hypot(positions[i]!, positions[i + 1]!);
      if (rXY <= boreSkipR + 0.03) continue;
      const u = smootherstep((z - coneZ) / zSpan);
      if (u <= 1e-4) continue;
      if (rXY * (1 + (safeScale - 1) * u) < minKeepOuterR) {
        const reqS = Math.min(1, 1 + (minKeepOuterR / rXY - 1) / u);
        if (reqS > safeScale) safeScale = reqS;
      }
    }
  }
  if (safeScale >= 1 - 1e-5) return;
  for (let i = 0; i < positions.length; i += 3) {
    const z = positions[i + 2]!;
    if (z <= coneZ + 1e-4) continue;
    const u = smootherstep((z - coneZ) / zSpan);
    const s = 1 + (safeScale - 1) * u;
    positions[i] = positions[i]! * s;
    positions[i + 1] = positions[i + 1]! * s;
  }
}

/** 2D 점 집합의 엄밀 볼록 외측 포락선(반시계 방향 CCW, Andrew's Monotone Chain). */
export function compute2DConvexHull(pts: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  if (pts.length <= 2) return pts.map((p) => [p[0], p[1]]);
  const sorted = pts
    .map((p): [number, number] => [p[0], p[1]])
    .sort((a, b) => (Math.abs(a[0] - b[0]) > 1e-12 ? a[0] - b[0] : a[1] - b[1]));
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const p of sorted) {
    if (lower.length > 0) {
      const prev = lower[lower.length - 1]!;
      if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) < 1e-9) continue;
    }
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 1e-10) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Array<[number, number]> = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const p = sorted[i]!;
    if (upper.length > 0) {
      const prev = upper[upper.length - 1]!;
      if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) < 1e-9) continue;
    }
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 1e-10) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** 점 (px, py)가 반시계 볼록 다각형 hull의 엄밀 내부(경계 제외)에 있는지 판정한다. */
function isStrictlyInsideConvexHull(
  px: number,
  py: number,
  hull: ReadonlyArray<readonly [number, number]>,
  eps = 1e-5,
): boolean {
  const m = hull.length;
  if (m < 3) return false;
  for (let k = 0; k < m; k += 1) {
    const a = hull[k]!;
    const b = hull[(k + 1) % m]!;
    const cr = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
    if (cr <= eps) return false;
  }
  return true;
}

/** 반시계 볼록 다각형 hull 내부 기준점 (cx, cy)에서 단위 방향 (dx, dy) 반직선이 밖으로 나가며 hull 경계와 만나는 유일한 양수 거리. */
function rayDistanceToConvexHull(
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  hull: ReadonlyArray<readonly [number, number]>,
): number {
  const m = hull.length;
  if (m < 3) return 0;
  let bestT = Infinity;
  for (let k = 0; k < m; k += 1) {
    const a = hull[k]!;
    const b = hull[(k + 1) % m]!;
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    // 반시계 변 (ex, ey)의 외향 법선은 (ey, -ex). 밖으로 나가는 교차만 허용(det > 0).
    const det = dx * ey - dy * ex;
    if (det <= 1e-9) continue;
    const ax = a[0] - cx;
    const ay = a[1] - cy;
    const s = (ax * dy - ay * dx) / det;
    if (s < -1e-5 || s > 1 + 1e-5) continue;
    const t = (ax * ey - ay * ex) / det;
    if (t > 0 && t < bestT) bestT = t;
  }
  return Number.isFinite(bestT) ? bestT : 0;
}

/** 원점(0,0)을 품는 극좌표 반경 배열을 외측 2D 볼록 포락선으로 투영해 내측 꺾임(오목)을 0으로 만든다. */
function projectPolarRadiiToConvexHull(radii: readonly number[]): number[] {
  const n = radii.length;
  if (n < 3) return [...radii];
  const pts: Array<[number, number]> = radii.map((r, i) => {
    const th = (i / n) * Math.PI * 2;
    return [r * Math.cos(th), r * Math.sin(th)];
  });
  const hull = compute2DConvexHull(pts);
  if (hull.length < 3) return [...radii];
  return radii.map((r, i) => {
    const th = (i / n) * Math.PI * 2;
    const hit = rayDistanceToConvexHull(0, 0, Math.cos(th), Math.sin(th), hull);
    return hit > 0 ? Math.max(r, hit) : r;
  });
}

/**
 * 원 B(0, coneTopR)과 볼록 마진 다각형 M의 민코프스키 가중합 (1-α)·B(0, coneTopR) ⊕ α·M 반경 평가기.
 * 모든 0 ≤ α ≤ 1에서 곡률 반경 (1-α)·coneTopR + α·ρ_M > 0 이므로 평평한 설측 벽에서도 중앙 능선이나 양옆 세로 주름이 절대 생기지 않는다.
 */
export function buildMinkowskiCuffRadiusEvaluator(
  coneTopR: number,
  marginXY: ReadonlyArray<readonly [number, number]>,
): (theta: number, alpha: number) => number {
  const hull = compute2DConvexHull(marginXY);
  const dirs = ANGULAR_COLS;
  const cosP = new Float64Array(dirs);
  const sinP = new Float64Array(dirs);
  const hMargin = new Float64Array(dirs);
  for (let m = 0; m < dirs; m += 1) {
    const psi = (m / dirs) * Math.PI * 2;
    const cp = Math.cos(psi);
    const sp = Math.sin(psi);
    cosP[m] = cp;
    sinP[m] = sp;
    let sup = coneTopR;
    for (const v of hull) {
      const proj = v[0] * cp + v[1] * sp;
      if (proj > sup) sup = proj;
    }
    hMargin[m] = sup;
  }
  return (theta: number, alpha: number) => {
    const a = clamp(alpha, 0, 1);
    if (a <= 1e-6) return coneTopR;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    let best = Infinity;
    for (let m = 0; m < dirs; m += 1) {
      const denom = ct * cosP[m]! + st * sinP[m]!;
      if (denom <= 0.25) continue;
      const h = (1 - a) * coneTopR + a * hMargin[m]!;
      const cand = h / denom;
      if (cand < best) best = cand;
    }
    return Number.isFinite(best) ? Math.max(coneTopR, best) : coneTopR;
  };
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

/**
 * 섹터 중심(((i + 0.5) / n) · 2π) 샘플에서 저차 푸리에 삼각다항식을 만들어 임의 각도 θ에서 C∞ 연속으로 평가한다.
 * Catmull-Rom 매듭 꺾임·극값 평탄 클리핑·k=5 벽면 절단(Gibbs 물결)을 원천 차단한다.
 */
function buildPeriodicSmoothCurve(
  samples: readonly number[],
  maxHarmonic = 3,
): (theta: number) => number {
  const n = samples.length;
  if (n === 0) return () => 0;
  if (n === 1) return () => samples[0]!;
  let a0 = 0;
  for (let i = 0; i < n; i += 1) a0 += samples[i]! / n;
  const hMax = Math.min(maxHarmonic, Math.floor((n - 1) / 2));
  const cosC = new Float64Array(hMax);
  const sinC = new Float64Array(hMax);
  for (let k = 1; k <= hMax; k += 1) {
    let ac = 0;
    let bs = 0;
    for (let i = 0; i < n; i += 1) {
      const ang = ((i + 0.5) / n) * Math.PI * 2 * k;
      ac += (samples[i]! * Math.cos(ang) * 2) / n;
      bs += (samples[i]! * Math.sin(ang) * 2) / n;
    }
    cosC[k - 1] = ac;
    sinC[k - 1] = bs;
  }
  return (theta: number) => {
    let sum = a0;
    for (let k = 1; k <= hMax; k += 1) {
      const ang = theta * k;
      sum += cosC[k - 1]! * Math.cos(ang) + sinC[k - 1]! * Math.sin(ang);
    }
    return sum;
  };
}

function evalPeriodicSmooth(samples: readonly number[], theta: number): number {
  return buildPeriodicSmoothCurve(samples, 3)(theta);
}

/** 꺾임 없는 C∞ 하한 결합(항상 min(a, b) 이하). */
function smoothMin(a: number, b: number, k = 0.04): number {
  return 0.5 * (a + b - Math.hypot(a - b, k));
}

/** 꺾임 없는 C∞ 상한 결합(항상 max(a, b) 이상). */
function smoothMax(a: number, b: number, k = 0.04): number {
  return 0.5 * (a + b + Math.hypot(a - b, k));
}

/** [0, 0.9] 구간에서 C¹ 연속으로 0→1 이동(최대 기울기 1.25). u≤0·u≥0.9에서 기울기 0이라 상·하단 접합이 매끄럽다. */
function smoothRamp09(u: number): number {
  if (u <= 0) return 0;
  if (u >= 0.9) return 1;
  if (u < 0.1) return 6.25 * u * u;
  if (u <= 0.8) return 0.0625 + 1.25 * (u - 0.1);
  const d = 0.9 - u;
  return 1 - 6.25 * d * d;
}

/**
 * 전치·견치 설측 싱귤럼 사선.
 * 견치는 카탈로그 각이 28° 미만이면 상단 사선용으로 8°를 더하고, 인접치 측면 기울기만큼 치아마다 다르게 기울인다.
 * 절치는 치경 1/3에 싱귤럼 축벽을 남기고, 그 위는 설면와(lingual fossa)가 들어가도록 더 일찍·더 가파른 직선 사선으로 깎는다.
 * 인접 자연치에서 잰 설측 후퇴각이 있으면 그 각을 함께 쓴다.
 */
function anteriorCingulumPlan(
  bevelAngleDeg: number,
  collarRatio: number,
  neighborSideDeg: number,
  kind: ToothKind = "canine",
  neighborBevelDeg = 0,
) {
  const catalog = Number.isFinite(bevelAngleDeg) && bevelAngleDeg > 0 ? bevelAngleDeg : 30;
  const tilt = clamp(neighborSideDeg, -16, 12);
  if (kind === "incisor") {
    const fromNeighbor = neighborBevelDeg >= 24 ? neighborBevelDeg : 0;
    const angleDeg = clamp(Math.max(catalog + 12, fromNeighbor) - tilt * 0.25, 40, 52);
    const collar = clamp(0.34 - tilt * 0.003, 0.3, 0.42);
    return { angleDeg, collar, slope: Math.tan(angleDeg * DEG) };
  }
  const steepBase = catalog < 28 ? catalog + 8 : catalog;
  const angleDeg = clamp(steepBase - tilt * 0.6, 22, 38);
  const collar = clamp(Math.max(collarRatio || 0, 0.58), 0.54, 0.68);
  return { angleDeg, collar, slope: Math.tan(angleDeg * DEG) };
}

/** 치경부 칼라는 2° 테이퍼만 유지하고, 그 위부터 상단까지 직선 사선으로 설측을 깎는다. */
function cingulumTopHalfMm(
  plan: { collar: number; slope: number },
  lingualRoomMm: number,
  minDropMm: number,
  spanMm: number,
  minHalfMm: number,
): number {
  const collarLin = lingualRoomMm - minDropMm * plan.collar;
  const steepTop = collarLin - plan.slope * spanMm * (1 - plan.collar);
  // 단면 모서리가 반폭보다 안쪽이므로, 스크류 벽 0.3mm가 남도록 최소 반폭을 조금 띄운다.
  return Math.max(minHalfMm + 0.08, steepTop);
}

/**
 * 전치·견치 설측 싱귤럼 사선 삭제 램프:
 * 포스트 아래쪽(u ≤ collar)은 0이라 2° 축벽이 유지되고, 그 위는 짧은 진입 뒤 상단까지 직선 사선이다.
 */
function smoothCingulumBevelRamp(u: number, collarRatio = 0.58): number {
  const c = clamp(collarRatio, 0.28, 0.72);
  if (u <= c) return 0;
  const t = (u - c) / Math.max(0.16, 1 - c);
  if (t >= 1) return 1;
  const knee = 0.06;
  if (t < knee) {
    return (t * t) / (knee * (2 - knee));
  }
  return (knee + 2 * (t - knee)) / (2 - knee);
}

/** 윗면 중심 근처에 꼭짓점이 있으면 스크류 채널이 막혀 있다. */
export function abutmentTopLooksClosed(positions: Float32Array): boolean {
  if (positions.length < 9) return false;
  let zMax = -Infinity;
  for (let i = 2; i < positions.length; i += 3) zMax = Math.max(zMax, positions[i]!);
  let near = 0;
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i + 2]! < zMax - 1.1) continue;
    if (Math.hypot(positions[i]!, positions[i + 1]!) < 0.4) near += 1;
  }
  return near >= 3;
}

type ScrewBoreSpecInput = {
  l2Mm?: number;
  screwLowerDiameterMm?: number;
  screwUpperDiameterMm?: number;
  screwTopMouthDiameterMm?: number;
  screwSeatBottomZMm?: number;
  screwSeatTopZMm?: number;
};

/**
 * 우리치과기공소 실측 샘플 및 AcroDent FaceHole(90° 센터드릴 입구 ~2.50mm + 스텝드릴 단차) 기준 스크류 홀 프로파일.
 * 하부 관통홀(rBot) → 45° 스크류 시트 턱(seatZ0..seatZ1) → 포스트 상부 채널(rUpper) → 최상단 개구 입구 베벨(rMouth).
 */
export function resolveScrewChannelProfile(
  conn: ScrewBoreSpecInput | null | undefined,
  zMouthSurface?: number | null,
) {
  const rUpper = (conn?.screwUpperDiameterMm ?? 2.45) / 2;
  const rBot = (conn?.screwLowerDiameterMm ?? 2.1) / 2;
  const rMouth = Math.max(rUpper, (conn?.screwTopMouthDiameterMm ?? rUpper * 2) / 2);
  const seatZ0 = conn?.screwSeatBottomZMm ?? 0.7;
  const seatZ1 =
    conn?.screwSeatTopZMm ?? Math.max(seatZ0 + 0.17, seatZ0 + Math.max(0.12, rUpper - rBot));
  const mouthBevelDrop = Math.max(0.14, rMouth - rUpper + 0.08);
  const hasMouth =
    rMouth > rUpper + 1e-4 &&
    zMouthSurface != null &&
    Number.isFinite(zMouthSurface) &&
    zMouthSurface > seatZ1 + mouthBevelDrop + 0.25;
  const mouthZ1 = hasMouth ? (zMouthSurface as number) : Infinity;
  const mouthZ0 = hasMouth ? mouthZ1 - mouthBevelDrop : Infinity;
  const radiusAtZ = (z: number): number => {
    if (z <= seatZ0) return rBot;
    if (z < seatZ1) {
      return rBot + ((rUpper - rBot) * (z - seatZ0)) / Math.max(1e-4, seatZ1 - seatZ0);
    }
    if (hasMouth && z >= mouthZ0) {
      if (z >= mouthZ1) return rMouth;
      return rUpper + ((rMouth - rUpper) * (z - mouthZ0)) / Math.max(1e-4, mouthZ1 - mouthZ0);
    }
    return rUpper;
  };
  return { rBot, rUpper, rMouth, seatZ0, seatZ1, mouthZ0, mouthZ1, hasMouth, radiusAtZ };
}

function findScrewMouthSurfaceZ(positions: Float32Array): number | null {
  if (positions.length < 9) return null;
  let zMax = -Infinity;
  let centralTop = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const z = positions[i + 2]!;
    if (z > zMax) zMax = z;
    if (Math.hypot(positions[i]!, positions[i + 1]!) <= 0.45 && z > centralTop) {
      centralTop = z;
    }
  }
  if (Number.isFinite(centralTop) && centralTop > 1.5) return centralTop;
  return Number.isFinite(zMax) ? zMax : null;
}

/**
 * 디자인 화면용으로 막힌 솔리드에 스크류 채널을 연다.
 * 이미 열려 있으면 같은 배열을 돌려준다. 저장 STL은 이 결과를 쓰지 않는다.
 */
export async function openScrewChannelForView(
  positions: Float32Array,
  fixture: MatchedScanbodyFixture,
): Promise<Float32Array> {
  if (!abutmentTopLooksClosed(positions)) return positions;
  const conn = fixture.connectionSpec;
  const l2 = conn?.l2Mm ?? 2.75;
  let zTop = -Infinity;
  for (let i = 2; i < positions.length; i += 3) zTop = Math.max(zTop, positions[i]!);
  const mouthZ = findScrewMouthSurfaceZ(positions);
  const bore = resolveScrewChannelProfile(conn, mouthZ);
  const cutter = screwChannelSoup(bore, -l2 - 1, zTop + 3);
  try {
    return await subtractTriangleSoups(positions, [cutter], `#${fixture.toothNumber} 커스텀어벗`);
  } catch {
    return positions;
  }
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
 * 소구치(premolar) 교합면 해부 단면:
 * 협설(BL)로 약간 길면서 협측(+u, cos ψ > 0)은 조금 더 볼록하고 넓으며,
 * 설측(-u, cos ψ < 0)은 폭을 줄이고 뾰족하게 돌출되지 않게 다듬어 둥근 사각형에 가까운 계란형(난원형) 단면을 만든다.
 * 종횡비 정규화 각 ψ = atan2(aBl·sin φ, bMd·cos φ) 위에서 C∞ 엄밀 양수 곡률 게이지로 정의해
 * 모든 (aBl, bMd) 비율과 4변 중앙에서도 평탄 절벽 없이 100% 엄밀 볼록 곡선을 보장한다.
 */
function smoothSuperellipseGauge1D(t: number, p: number, delta = 0.07, ellipticLam = 0.18): number {
  const d0 = delta ** p;
  const d1 = (1 + delta * delta) ** (p * 0.5) - d0;
  const core = ((t * t + delta * delta) ** (p * 0.5) - d0) / Math.max(d1, 1e-9);
  return (1 - ellipticLam) * core + ellipticLam * t * t;
}

function molarRoundedSquareRadius(aBl: number, bMd: number, phi: number): number {
  const a = Math.max(0.35, aBl);
  const b = Math.max(0.35, bMd);
  const psi = Math.atan2(a * Math.sin(phi), b * Math.cos(phi));
  const cp = Math.abs(Math.cos(psi));
  const sp = Math.abs(Math.sin(psi));
  let lo = 0.98;
  let hi = 1.2;
  for (let it = 0; it < 20; it += 1) {
    const mid = (lo + hi) * 0.5;
    if (
      smoothSuperellipseGauge1D(mid * cp, 3.12, 0.05, 0.1) +
        smoothSuperellipseGauge1D(mid * sp, 3.12, 0.05, 0.1) <
      1
    ) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const u = (lo + hi) * 0.5;
  const denom = Math.hypot(b * Math.cos(phi), a * Math.sin(phi));
  return (a * b * u) / Math.max(denom, 1e-9);
}

function premolarOvoidTrapezoidRadius(
  aBl: number,
  bMd: number,
  phi: number,
  role: SectionRole,
): number {
  const a = Math.max(0.35, aBl);
  const b = Math.max(0.35, bMd);
  const psi = Math.atan2(a * Math.sin(phi), b * Math.cos(phi));
  const cPsi = Math.cos(psi);
  const w = 0.96 + 0.1 * cPsi;
  const n =
    role === "post"
      ? 2.48 - 0.22 * cPsi
      : role === "margin"
        ? 2.44 - 0.2 * cPsi
        : 2.36 - 0.16 * cPsi;
  if (role === "crown") {
    const unitR = superellipseRadius(1, w, psi, n);
    const denom = Math.hypot(b * Math.cos(phi), a * Math.sin(phi));
    return (a * b * unitR) / Math.max(denom, 1e-9);
  }
  const cp = Math.abs(cPsi);
  const sp = Math.abs(Math.sin(psi)) / Math.max(w, 0.2);
  let lo = 0.82;
  let hi = 1.22;
  for (let it = 0; it < 20; it += 1) {
    const mid = (lo + hi) * 0.5;
    if (
      smoothSuperellipseGauge1D(mid * cp, n, 0.06, 0.16) +
        smoothSuperellipseGauge1D(mid * sp, n, 0.06, 0.16) <
      1
    ) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const unitR = (lo + hi) * 0.5;
  const denom = Math.hypot(b * Math.cos(phi), a * Math.sin(phi));
  return (a * b * unitR) / Math.max(denom, 1e-9);
}

/** C∞ 엄밀 볼록 모서리 완화 정규화 함수: huber01(0)=0, huber01(±1)=1, 전 구간 이계도함수 > 0. */
function huber01(t: number, eps: number): number {
  const a = Math.abs(t);
  return (Math.sqrt(a * a + eps * eps) - eps) / (Math.sqrt(1 + eps * eps) - eps);
}

type AnteriorConvexGaugeSpec = {
  xPeak: number;
  epsLab: number;
  pLab: number;
  epsLin: number;
  pLin: number;
  epsLat: number;
  pLat: number;
};

function anteriorGaugeSpec(kind: "canine" | "incisor", role: SectionRole): AnteriorConvexGaugeSpec {
  if (kind === "canine") {
    // 견치 교합면 형상: 순측 중앙 융선과 순측 치우침 근·원심 우각, 설측 싱귤럼 꼭짓점으로 수렴하는
    // 모서리가 둥근 역삼각형 / 마름모(100% 엄밀 볼록 → 땅콩 모양 원천 차단).
    return {
      xPeak: role === "margin" ? 0.22 : role === "post" ? 0.27 : 0.25,
      epsLab: role === "margin" ? 0.25 : 0.22,
      pLab: role === "margin" ? 1.42 : 1.34,
      epsLin: role === "margin" ? 0.19 : 0.16,
      pLin: role === "margin" ? 1.24 : 1.18,
      epsLat: role === "margin" ? 0.22 : 0.2,
      pLat: role === "margin" ? 1.46 : 1.4,
    };
  }
  // 절치 교합면 형상: 완만한 순측 호 + 근·원심 우각 + 설측 결절로 좁아지는 둥근 역삼각-난원형.
  return {
    xPeak: role === "margin" ? 0.2 : 0.23,
    epsLab: 0.3,
    pLab: role === "margin" ? 1.76 : 1.72,
    epsLin: 0.2,
    pLin: role === "margin" ? 1.32 : 1.28,
    epsLat: 0.24,
    pLat: role === "margin" ? 1.58 : 1.54,
  };
}

/**
 * 순측 반폭(+aLab)·설측 반폭(-aLin)·근원심 반폭(±bMd)에 정확히 내접하는 C∞ 엄밀 볼록 게이지.
 * 두 엄밀 볼록 함수의 합 G(u, v) = fx(u) + fy(v) ≤ 1 로 정의되어 어떤 반축 비율에서도 오목(땅콩 모양)이 절대 생기지 않는다.
 */
function evalAnteriorConvexGauge(
  kind: "canine" | "incisor",
  role: SectionRole,
  aLab: number,
  aLin: number,
  bMd: number,
  u: number,
  v: number,
): number {
  const aP = Math.max(0.35, aLab);
  const aN = Math.max(0.35, aLin);
  const b = Math.max(0.35, bMd);
  const uc = (aP - aN) * 0.5;
  const A = (aP + aN) * 0.5;
  const x = (u - uc) / A;
  const y = Math.abs(v) / b;
  const spec = anteriorGaugeSpec(kind, role);
  const xp = spec.xPeak;
  const xi = x >= xp ? (x - xp) / (1 - xp) : (xp - x) / (1 + xp);
  const fx =
    x >= xp
      ? huber01(xi, spec.epsLab) ** spec.pLab
      : huber01(xi, spec.epsLin) ** spec.pLin;
  const fy = huber01(y, spec.epsLat) ** spec.pLat;
  return fx + fy;
}

function anteriorPolarRadius(
  kind: "canine" | "incisor",
  role: SectionRole,
  aLab: number,
  aLin: number,
  bMd: number,
  phi: number,
): number {
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  let lo = 0;
  let hi = Math.max(aLab, aLin, bMd) * 1.45;
  while (evalAnteriorConvexGauge(kind, role, aLab, aLin, bMd, hi * cp, hi * sp) < 1 && hi < 24) {
    hi *= 1.4;
  }
  for (let it = 0; it < 22; it += 1) {
    const mid = (lo + hi) * 0.5;
    if (evalAnteriorConvexGauge(kind, role, aLab, aLin, bMd, mid * cp, mid * sp) < 1) lo = mid;
    else hi = mid;
  }
  return (lo + hi) * 0.5;
}

/**
 * 교합면에서 본 치종·역할별 해부 단면 반경(자연치 구강스캔 + 기공소 커스텀어벗·보철 STL 실측 기반).
 * - 대구치(molar): 포스트 n=3.25·마진 n=3.05의 뚜렷한 둥근 모서리 사각형, 크라운 n=2.65 해부 사각 외형
 * - 소구치(premolar): 협설(BL)로 약간 길고 협측이 넓으며 설측 폭을 줄인 사다리꼴-계란형(난원형) 단면
 * - 견치(canine): 순측 융선 + 근·원심 우각 + 설측 싱귤럼으로 수렴하는 모서리가 둥근 역삼각형/마름모(엄밀 볼록)
 * - 전치(incisor): 완만한 순측 호와 설측 결절로 수렴하는 둥근 역삼각-난원형(엄밀 볼록)
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
    if (role === "post" || role === "margin") return molarRoundedSquareRadius(aBl, bMd, phi);
    return superellipseRadius(aBl, bMd * (1 + 0.025 * cp), phi, 2.65);
  }
  if (kind === "premolar") {
    return premolarOvoidTrapezoidRadius(aBl, bMd, phi, role);
  }
  if (kind === "canine" || kind === "incisor") {
    return anteriorPolarRadius(kind, role, aBl, aBl, bMd, phi);
  }
  return superellipseRadius(aBl, bMd, phi, 2.25);
}

function toothOcclusalSectionRadius(kind: ToothKind, aBl: number, bMd: number, phi: number): number {
  return toothSectionRadius(kind, "post", aBl, bMd, phi);
}

/** 단면 중심 기준 방위각 φ에서 순·설 비대칭 반폭(aLab, aLin)과 근원심 반폭(bMd)을 엄밀 볼록으로 결합한 포스트 반경. */
function evalPostSectionRadiusAtPhi(
  kind: ToothKind,
  aLab: number,
  aLin: number,
  bMd: number,
  phi: number,
): number {
  if (kind === "canine" || kind === "incisor") {
    return anteriorPolarRadius(kind, "post", Math.max(0.35, aLab), Math.max(0.35, aLin), Math.max(0.35, bMd), phi);
  }
  const aBl =
    Math.abs(aLab - aLin) < 1e-6
      ? aLab
      : aLin + (aLab - aLin) * smootherstep((Math.cos(phi) + 1) * 0.5);
  return toothSectionRadius(kind, "post", Math.max(0.35, aBl), Math.max(0.35, bMd), phi);
}

type ParallelOffsetMarginSolver = {
  evalAtAlpha: (alpha: number) => { radius: number; footPsi: number };
  solveRay: (
    uOff: number,
    vOff: number,
    gu: number,
    gv: number,
    minT?: number,
  ) => { t: number; footPsi: number };
};

/**
 * 매끈한 엄밀 볼록 포스트 시작 단면 γ_P(ψ) = (secCu + r_P(ψ) cos ψ, secCv + r_P(ψ) sin ψ)에서
 * 외향 단위 법선 n_P(ψ) 방향으로 정확히 shoulderMm만큼 등폭 이동한 C∞ 병행 마진 곡선
 * γ_M(ψ) = γ_P(ψ) + shoulderMm · n_P(ψ) 평가기.
 * 다각형 서포트 근사나 열별 독립 클리핑 없이 360° 전 구간 양수 곡률(볼록 혹·오목 홈 0)과 등폭 마진을 보장한다.
 */
function buildParallelOffsetMarginSolver(
  secCu: number,
  secCv: number,
  evalPostR: (psi: number) => number,
  shoulderMm: number,
): ParallelOffsetMarginSolver {
  const N = 576;
  const sh = Math.max(0.02, shoulderMm);
  const uP = new Float64Array(N);
  const vP = new Float64Array(N);
  for (let m = 0; m < N; m += 1) {
    const psi = (m / N) * Math.PI * 2;
    const r = Math.max(0.25, evalPostR(psi));
    uP[m] = secCu + r * Math.cos(psi);
    vP[m] = secCv + r * Math.sin(psi);
  }
  const alpha = new Float64Array(N + 1);
  const rM = new Float64Array(N + 1);
  const psiUnwrapped = new Float64Array(N + 1);
  let maxRadius = 0.5;
  for (let m = 0; m < N; m += 1) {
    const mPrev2 = (m - 2 + N) % N;
    const mPrev1 = (m - 1 + N) % N;
    const mNext1 = (m + 1) % N;
    const mNext2 = (m + 2) % N;
    const du = -uP[mNext2]! + 8 * uP[mNext1]! - 8 * uP[mPrev1]! + uP[mPrev2]!;
    const dv = -vP[mNext2]! + 8 * vP[mNext1]! - 8 * vP[mPrev1]! + vP[mPrev2]!;
    const dLen = Math.hypot(du, dv) || 1;
    const nu = dv / dLen;
    const nv = -du / dLen;
    const um = uP[m]! + sh * nu - secCu;
    const vm = vP[m]! + sh * nv - secCv;
    const rad = Math.hypot(um, vm);
    if (rad > maxRadius) maxRadius = rad;
    rM[m] = rad;
    psiUnwrapped[m] = (m / N) * Math.PI * 2;
    let a = Math.atan2(vm, um);
    if (m > 0) {
      while (a <= alpha[m - 1]!) a += Math.PI * 2;
      while (a > alpha[m - 1]! + Math.PI * 2) a -= Math.PI * 2;
      if (a <= alpha[m - 1]! + 1e-7) a = alpha[m - 1]! + 1e-7;
    }
    alpha[m] = a;
  }
  alpha[N] = alpha[0]! + Math.PI * 2;
  rM[N] = rM[0]!;
  psiUnwrapped[N] = Math.PI * 2;

  const evalAtAlpha = (rawAlpha: number) => {
    const a0 = alpha[0]!;
    const a = a0 + wrapAngle(rawAlpha - a0);
    let lo = 0;
    let hi = N;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (alpha[mid]! <= a) lo = mid;
      else hi = mid;
    }
    const idx = lo;
    const span = Math.max(1e-9, alpha[idx + 1]! - alpha[idx]!);
    const tau = clamp((a - alpha[idx]!) / span, 0, 1);
    const r0 = rM[(idx - 1 + N) % N]!;
    const r1 = rM[idx]!;
    const r2 = rM[(idx + 1) % N]!;
    const r3 = rM[(idx + 2) % N]!;
    const tau2 = tau * tau;
    const tau3 = tau2 * tau;
    const radius =
      0.5 *
      (2 * r1 +
        (-r0 + r2) * tau +
        (2 * r0 - 5 * r1 + 4 * r2 - r3) * tau2 +
        (-r0 + 3 * r1 - 3 * r2 + r3) * tau3);
    const footPsi = wrapAngle(
      psiUnwrapped[idx]! + (psiUnwrapped[idx + 1]! - psiUnwrapped[idx]!) * tau,
    );
    return { radius: Math.max(0.25, radius), footPsi };
  };

  const solveRay = (uOff: number, vOff: number, gu: number, gv: number, minT = 0) => {
    const evalNorm = (t: number) => {
      const du = uOff + t * gu - secCu;
      const dv = vOff + t * gv - secCv;
      const len = Math.hypot(du, dv);
      if (len < 1e-7) return 0;
      return len / evalAtAlpha(Math.atan2(dv, du)).radius;
    };
    if (evalNorm(minT) >= 1) {
      const du0 = uOff + minT * gu - secCu;
      const dv0 = vOff + minT * gv - secCv;
      return { t: minT, footPsi: evalAtAlpha(Math.atan2(dv0, du0)).footPsi };
    }
    let lo = minT;
    let hi = minT + maxRadius * 2.2 + Math.hypot(uOff - secCu, vOff - secCv);
    let guard = 0;
    while (evalNorm(hi) < 1 && hi < 24 && guard < 8) {
      hi *= 1.45;
      guard += 1;
    }
    for (let it = 0; it < 26; it += 1) {
      const mid = (lo + hi) * 0.5;
      if (evalNorm(mid) < 1) lo = mid;
      else hi = mid;
    }
    const t = Math.max(minT, (lo + hi) * 0.5);
    const du = uOff + t * gu - secCu;
    const dv = vOff + t * gv - secCv;
    return { t, footPsi: evalAtAlpha(Math.atan2(dv, du)).footPsi };
  };

  return { evalAtAlpha, solveRay };
}

function minPolarCrossXY(radii: readonly number[]): number {
  const n = radii.length;
  if (n < 3) return 0;
  let worst = Infinity;
  for (let i = 0; i < n; i += 1) {
    const i0 = (i - 1 + n) % n;
    const i2 = (i + 1) % n;
    const t0 = (i0 / n) * Math.PI * 2;
    const t1 = (i / n) * Math.PI * 2;
    const t2 = (i2 / n) * Math.PI * 2;
    const x0 = radii[i0]! * Math.cos(t0);
    const y0 = radii[i0]! * Math.sin(t0);
    const x1 = radii[i]! * Math.cos(t1);
    const y1 = radii[i]! * Math.sin(t1);
    const x2 = radii[i2]! * Math.cos(t2);
    const y2 = radii[i2]! * Math.sin(t2);
    const cr = (x1 - x0) * (y2 - y1) - (y1 - y0) * (x2 - x1);
    if (cr < worst) worst = cr;
  }
  return worst;
}

function minLoopCrossInPlane(
  radii: readonly number[],
  zCols: readonly number[],
  uAxis: Vec3,
  vAxis: Vec3,
): number {
  const n = radii.length;
  if (n < 3) return 0;
  const us = new Float64Array(n);
  const vs = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const th = (i / n) * Math.PI * 2;
    const x = radii[i]! * Math.cos(th);
    const y = radii[i]! * Math.sin(th);
    const z = zCols[i]!;
    us[i] = x * uAxis[0] + y * uAxis[1] + z * uAxis[2];
    vs[i] = x * vAxis[0] + y * vAxis[1] + z * vAxis[2];
  }
  let area2 = 0;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    area2 += us[i]! * vs[j]! - vs[i]! * us[j]!;
  }
  const orient = area2 >= 0 ? 1 : -1;
  let worst = Infinity;
  for (let i = 0; i < n; i += 1) {
    const i0 = (i - 1 + n) % n;
    const i2 = (i + 1) % n;
    const cr =
      ((us[i]! - us[i0]!) * (vs[i2]! - vs[i]!) - (vs[i]! - vs[i0]!) * (us[i2]! - us[i]!)) * orient;
    if (cr < worst) worst = cr;
  }
  return worst;
}

/**
 * 교합면(삽입축 평면) 투영이 γ_M = γ_P ⊕ B(0, sh) 등폭 병행 곡선 위에 정확히 놓이면서,
 * 픽스쳐 수평면(XY)과 악궁 교합면(뷰큐브 교합 시점) 양쪽 모두에서 다각형 현·오목 홈 없이
 * 100% 매끈한 엄밀 볼록 곡선이 되도록 3D 피니시라인을 푼다.
 */
function solveSmoothOffsetMarginLoop(
  offsetSolver: ParallelOffsetMarginSolver,
  zCurve: (theta: number) => number,
  zRef: number,
  frame: InsertionFrame,
  minSolveR: number,
  zMinClamp: number,
  zMaxClamp: number,
  occViewDir?: Vec3,
): { radii: number[]; zCols: number[]; footPsis: number[]; duLats: number[]; dvLats: number[] } {
  const occFrame = occViewDir ? insertionFrame(occViewDir, frame.uLabial) : null;
  const occOz =
    occViewDir && Math.abs(occViewDir[2]) > 0.25
      ? occViewDir[2]
      : occViewDir
        ? Math.sign(occViewDir[2] || 1) * 0.25
        : 1;
  const occSlopeX = occViewDir ? occViewDir[0] / occOz : 0;
  const occSlopeY = occViewDir ? occViewDir[1] / occOz : 0;

  const zRaw = new Float64Array(ANGULAR_COLS);
  let a0 = 0;
  let a1 = 0;
  let b1 = 0;
  for (let col = 0; col < ANGULAR_COLS; col += 1) {
    const theta = (col / ANGULAR_COLS) * Math.PI * 2;
    const z = clamp(zCurve(theta), zMinClamp, zMaxClamp);
    zRaw[col] = z;
    a0 += z / ANGULAR_COLS;
    a1 += (z * Math.cos(theta) * 2) / ANGULAR_COLS;
    b1 += (z * Math.sin(theta) * 2) / ANGULAR_COLS;
  }
  const zPlane = new Float64Array(ANGULAR_COLS);
  const zScallop = new Float64Array(ANGULAR_COLS);
  for (let col = 0; col < ANGULAR_COLS; col += 1) {
    const theta = (col / ANGULAR_COLS) * Math.PI * 2;
    const zp = clamp(a0 + a1 * Math.cos(theta) + b1 * Math.sin(theta), zMinClamp, zMaxClamp);
    zPlane[col] = zp;
    zScallop[col] = zRaw[col]! - zp;
  }

  // 수직 피니시라인 높이(zCols)는 치은선 스캘럽(zScale=1)을 그대로 유지하고,
  // 경사 식립에서 스캘럽 때문에 수평·교합 투영 곡률이 줄어들 때만 광선 수평 오프셋(betaLat, occComp)을 먼저 조절한다.
  const evalCandidate = (betaLat: number, occComp: number, zScale = 1) => {
    const radii = new Array<number>(ANGULAR_COLS);
    const zCols = new Array<number>(ANGULAR_COLS);
    const footPsis = new Array<number>(ANGULAR_COLS);
    const duLats = new Array<number>(ANGULAR_COLS);
    const dvLats = new Array<number>(ANGULAR_COLS);
    for (let col = 0; col < ANGULAR_COLS; col += 1) {
      const theta = (col / ANGULAR_COLS) * Math.PI * 2;
      const radialFix: Vec3 = [Math.cos(theta), Math.sin(theta), 0];
      const zScal = zScallop[col]! * zScale;
      const zCol = clamp(zPlane[col]! + zScal, zMinClamp, zMaxClamp);
      const dzFull = zCol - zRef;
      const dzPlane = zPlane[col]! - zRef;
      const occDx = occComp * zScal * occSlopeX;
      const occDy = occComp * zScal * occSlopeY;
      const uOff =
        (dzPlane + betaLat * zScal) * frame.uLabial[2] -
        (occDx * frame.uLabial[0] + occDy * frame.uLabial[1]);
      const vOff =
        (dzPlane + betaLat * zScal) * frame.vSide[2] -
        (occDx * frame.vSide[0] + occDy * frame.vSide[1]);
      duLats[col] = dzFull * frame.uLabial[2] - uOff;
      dvLats[col] = dzFull * frame.vSide[2] - vOff;
      const gu = dot3(radialFix, frame.uLabial);
      const gv = dot3(radialFix, frame.vSide);
      const lenDir = Math.hypot(gu, gv);
      if (lenDir < 0.2) {
        radii[col] = minSolveR;
        zCols[col] = zCol;
        footPsis[col] = theta;
        continue;
      }
      const solved = offsetSolver.solveRay(uOff, vOff, gu, gv, minSolveR);
      radii[col] = solved.t;
      zCols[col] = zCol;
      footPsis[col] = solved.footPsi;
    }
    const minCrXY = minPolarCrossXY(radii);
    const minCrOcc = occFrame
      ? minLoopCrossInPlane(radii, zCols, occFrame.uLabial, occFrame.vSide)
      : minCrXY;
    return { radii, zCols, footPsis, duLats, dvLats, minCr: Math.min(minCrXY, minCrOcc) };
  };

  const full = evalCandidate(1, 0, 1);
  if (full.minCr >= 1.2e-5) {
    return {
      radii: full.radii,
      zCols: full.zCols,
      footPsis: full.footPsis,
      duLats: full.duLats,
      dvLats: full.dvLats,
    };
  }

  // 1단계: zScale=1(치은 스캘럽 100% 보존)에서 occComp·betaLat 수평 보정만으로 엄밀 볼록을 확보한다.
  let bestOccComp = 0;
  let bestZeroLat = evalCandidate(0, 0, 1);
  if (occFrame) {
    for (const oc of [0.25, 0.5, 0.75, 1]) {
      const c = evalCandidate(0, oc, 1);
      if (c.minCr > bestZeroLat.minCr) {
        bestZeroLat = c;
        bestOccComp = oc;
      }
    }
  }
  if (bestZeroLat.minCr >= 1.2e-5) {
    let loLat = 0;
    let hiLat = 1;
    let best = bestZeroLat;
    for (let it = 0; it < 9; it += 1) {
      const midLat = (loLat + hiLat) * 0.5;
      const cand = evalCandidate(midLat, bestOccComp * (1 - midLat), 1);
      if (cand.minCr >= 1.2e-5) {
        best = cand;
        loLat = midLat;
      } else {
        hiLat = midLat;
      }
    }
    return {
      radii: best.radii,
      zCols: best.zCols,
      footPsis: best.footPsis,
      duLats: best.duLats,
      dvLats: best.dvLats,
    };
  }

  // 2단계: 초극단 절벽 지형에서도 스캘럽을 평면으로 죽이지 않고 볼록 한계까지만 최소 완화한다.
  const flatPlane = evalCandidate(0, 0, 0);
  if (flatPlane.minCr < 1e-6) {
    return {
      radii: projectPolarRadiiToConvexHull(bestZeroLat.radii),
      zCols: bestZeroLat.zCols,
      footPsis: bestZeroLat.footPsis,
      duLats: bestZeroLat.duLats,
      dvLats: bestZeroLat.dvLats,
    };
  }
  let loZ = 0;
  let hiZ = 1;
  let bestZ = flatPlane;
  for (let it = 0; it < 9; it += 1) {
    const midZ = (loZ + hiZ) * 0.5;
    const cand = evalCandidate(0, bestOccComp, midZ);
    if (cand.minCr >= 1.2e-5) {
      bestZ = cand;
      loZ = midZ;
    } else {
      hiZ = midZ;
    }
  }
  return {
    radii: bestZ.radii,
    zCols: bestZ.zCols,
    footPsis: bestZ.footPsis,
    duLats: bestZ.duLats,
    dvLats: bestZ.dvLats,
  };
}

/**
 * 중심 (cu, cv)에 놓인 치종 해부 단면(순측 반폭 aBlPos, 설측 반폭 aBlNeg, 근원심 반폭 bMd)과
 * 원점 (0, 0)에서 (du, dv) 방향으로 쏜 반직선이 만나는 정확한 거리를 이분법으로 구한다.
 * 열별 독립 클리핑 대신 중심 이동·반축 스케일만 조정한 해석 단면을 써서 삼각형 찌그러짐과 땅콩형 오목을 원천 차단한다.
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
    if (Math.hypot(u, v) < 1e-7) return 0;
    if (kind === "canine" || kind === "incisor") {
      return evalAnteriorConvexGauge(
        kind,
        role,
        Math.max(0.35, aBlPos),
        Math.max(0.35, aBlNeg),
        Math.max(0.35, bMd),
        u,
        v,
      );
    }
    const len = Math.hypot(u, v);
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
  for (let it = 0; it < 24; it += 1) {
    const mid = (lo + hi) * 0.5;
    if (evalNorm(mid) < 1) lo = mid;
    else hi = mid;
  }
  return (lo + hi) * 0.5;
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
 * 치아 번호별 커스텀어벗 템플릿(mm).
 * ToothAnatomy DB(자연치 스캔·기공소 크라운/어벗 실측)의 부위별 정상 크기에서
 * 편측 크라운 두께(~1.0mm 내외)만큼 안쪽으로 들어간 기준치를 읽어 온다.
 */
type AbutmentTemplate = {
  kind: ToothKind;
  anterior: boolean;
  anatomy: ToothAnatomySpec;
  marginBlMm: number;
  marginMdMm: number;
  maxMarginBlMm: number;
  maxMarginMdMm: number;
  topLabialHalfMm: number;
  topLingualHalfMm: number;
  topMdMm: number;
  postHeightMm: number;
  /** 자연치 근원심 폭(최대 풍융부) — 인접 간격으로 크기 보정할 때 기준. */
  naturalMdMm: number;
  /** 자연치 순설(협설) 폭(최대 풍융부). 예측 크라운 기준이며 커스텀어벗은 이보다 편측 ~1mm 작게 만든다. */
  naturalBlMm: number;
  /** 자연치 치경부/출현부 근원심·순설 폭. */
  cervicalMdMm: number;
  cervicalBlMm: number;
  /** 자연치 상부 1/3(절단·교합부) 순설 폭. */
  occlusalBlMm: number;
  /** 윗면 설측이 순측보다 낮아지는 양(전치 절단 경사). */
  lingualTopDropMm: number;
  /** 크라운 축벽 두께: 순측 / 설측 / 교합·절단. */
  crownLabialMm: number;
  crownLingualMm: number;
  crownOcclusalMm: number;
};

function abutmentTemplateForTooth(toothNumber: string): AbutmentTemplate {
  const anat = getToothAnatomy(toothNumber);
  const kind = anat.kind;
  const anterior = kind === "incisor" || kind === "canine";
  const cb = anat.abutmentCutback;
  return {
    kind,
    anterior,
    anatomy: anat,
    marginBlMm: cb.marginBlMm,
    marginMdMm: cb.marginMdMm,
    maxMarginBlMm: cb.maxMarginBlMm,
    maxMarginMdMm: cb.maxMarginMdMm,
    topLabialHalfMm: cb.topLabialHalfMm,
    topLingualHalfMm: cb.topLingualHalfMm,
    topMdMm: cb.topMdMm,
    postHeightMm: cb.defaultPostHeightMm,
    naturalMdMm: anat.crown.equator.mdMm,
    naturalBlMm: anat.crown.equator.blMm,
    cervicalMdMm: anat.crown.cervical.mdMm,
    cervicalBlMm: anat.crown.cervical.blMm,
    occlusalBlMm: anat.crown.occlusal.blMm,
    lingualTopDropMm: cb.lingualTopDropMm,
    crownLabialMm: cb.crownWallLabialMm,
    crownLingualMm: cb.crownWallLingualMm,
    crownOcclusalMm: cb.crownWallOcclusalMm,
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

type IncisorNeighborGuide = {
  /** 마진 중심에서 교합 방향으로 잰 목표 크라운 절단연 높이(mm, 치종 간 절단 단차 반영). */
  incisalH: number;
  /** 치경부 중심 → 절단 중심(교합 직교 프레임 du/dh). 양수면 절단이 순측으로 기운다. */
  labialSlope: number;
  /** 양수면 절단이 근심으로 기운다(교합 직교 프레임 dv/dh). */
  mesialSlope: number;
};

/**
 * 절치 옆 자연치의 절단연 길이와 장축 기울기.
 * 순측으로 빠진 절단연도 포함하되, 측절치·견치·중절치 치관 단차와 양옆 짧은 치아 경계를 함께 지킨다.
 */
function measureAdjacentIncisorGuide(
  pts: Float32Array,
  c0: Vec3,
  up: Vec3,
  labialHint: Vec3,
  mesialHint: Vec3,
  halfMdMm: number,
  ownScanbody: { radius: number; height: number },
  opts?: {
    skipPos?: boolean;
    skipNeg?: boolean;
    ownClinicalHeightMm?: number;
    posClinicalHeightMm?: number;
    negClinicalHeightMm?: number;
  },
): IncisorNeighborGuide | null {
  const archFr = insertionFrame(norm3(up), labialHint);
  const vMes = dot3(archFr.vSide, mesialHint) >= 0 ? archFr.vSide : scale3(archFr.vSide, -1);
  const sides: Array<Array<{ h: number; u: number; v: number }>> = [[], []];
  for (let i = 0; i < pts.length; i += 3) {
    const p: Vec3 = [pts[i]!, pts[i + 1]!, pts[i + 2]!];
    if (Math.hypot(p[0], p[1]) < ownScanbody.radius + 0.7 && p[2] < ownScanbody.height + 1) continue;
    const rel = sub3(p, c0);
    const h = dot3(rel, archFr.w);
    if (h < 0.4 || h > 14.5) continue;
    const u = dot3(rel, archFr.uLabial);
    if (u < -5.5 || u > 11) continue;
    const v = dot3(rel, vMes);
    if (v > 0 && opts?.skipPos) continue;
    if (v < 0 && opts?.skipNeg) continue;
    const av = Math.abs(v);
    if (av < halfMdMm + 0.45 || av > halfMdMm + 9.2) continue;
    sides[v >= 0 ? 0 : 1]!.push({ h, u, v });
  }
  const ownClin = opts?.ownClinicalHeightMm ?? 9.2;
  const guides: Array<IncisorNeighborGuide & { rawTopH: number }> = [];
  for (let sideIdx = 0; sideIdx < 2; sideIdx += 1) {
    const list = sides[sideIdx]!;
    if (list.length < 36) continue;
    const hs = list.map((q) => q.h).sort((a, b) => a - b);
    const rawTopH = Math.min(12.4, hs[Math.floor(hs.length * 0.975)]!);
    const hBot = hs[Math.floor(hs.length * 0.1)]!;
    if (rawTopH < 5.6 || rawTopH - hBot < 4.0) continue;
    const adjClin =
      (sideIdx === 0 ? opts?.posClinicalHeightMm : opts?.negClinicalHeightMm) ?? ownClin;
    const stepMm = clamp((adjClin - ownClin) * 0.75, -0.6, 1.0);
    const band = (h0: number, h1: number) => {
      const rows = list.filter((q) => q.h >= h0 && q.h <= h1);
      if (rows.length < 6) return null;
      const us = rows.map((q) => q.u).sort((a, b) => a - b);
      const vs = rows.map((q) => q.v).sort((a, b) => a - b);
      const hh = rows.map((q) => q.h).sort((a, b) => a - b);
      return {
        u: us[Math.floor(us.length * 0.5)]!,
        v: vs[Math.floor(vs.length * 0.5)]!,
        h: hh[Math.floor(hh.length * 0.5)]!,
      };
    };
    const cerv = band(Math.max(1.5, hBot + 0.35), Math.min(rawTopH - 2.6, Math.max(hBot + 3.1, 3.4)));
    const inc = band(rawTopH - 1.85, rawTopH - 0.2);
    let labialSlope = 0;
    let mesialSlope = 0;
    if (cerv && inc && inc.h - cerv.h >= 1.8) {
      const dh = inc.h - cerv.h;
      labialSlope = clamp((inc.u - cerv.u) / dh, -0.5, 0.55);
      mesialSlope = clamp((inc.v - cerv.v) / dh, -0.4, 0.4);
    }
    guides.push({ incisalH: rawTopH - stepMm, rawTopH, labialSlope, mesialSlope });
  }
  if (!guides.length) return null;
  let incisalH: number;
  if (guides.length === 1) {
    incisalH = guides[0]!.incisalH;
  } else {
    const meanH = (guides[0]!.incisalH + guides[1]!.incisalH) * 0.5;
    const minSideH = Math.min(guides[0]!.incisalH, guides[1]!.incisalH);
    const minRawH = Math.min(guides[0]!.rawTopH, guides[1]!.rawTopH);
    const spread = Math.abs(guides[0]!.incisalH - guides[1]!.incisalH);
    const shortWeight = spread > 1.2 ? 0.88 : 0.65;
    incisalH = Math.min(minSideH * shortWeight + meanH * (1 - shortWeight), minRawH);
  }
  let labialSlope = 0;
  let mesialSlope = 0;
  for (const g of guides) {
    labialSlope += g.labialSlope;
    mesialSlope += g.mesialSlope;
  }
  return {
    incisalH,
    labialSlope: labialSlope / guides.length,
    mesialSlope: mesialSlope / guides.length,
  };
}

type IncisorNeighborShovel = {
  incisalBlMm: number;
  lingualBevelDeg: number;
};

/**
 * 바로 옆 자연 절치의 절단부 순설 폭과 설측 후퇴각.
 * 양옆 중 카탈로그 절단 순설에 더 가까운 치아(예: #11 옆의 #21)를 고른다. 스캔바디·무치악이면 null.
 */
function measureAdjacentIncisorShovel(
  pts: Float32Array,
  c0: Vec3,
  frame: InsertionFrame,
  halfMdMm: number,
  ownScanbody: { radius: number; height: number },
  catalogIncisalBlMm: number,
): IncisorNeighborShovel | null {
  const sides: Array<Array<{ h: number; u: number }>> = [[], []];
  for (let i = 0; i < pts.length; i += 3) {
    const p: Vec3 = [pts[i]!, pts[i + 1]!, pts[i + 2]!];
    if (Math.hypot(p[0], p[1]) < ownScanbody.radius + 0.65 && p[2] < ownScanbody.height + 0.8) continue;
    const rel = sub3(p, c0);
    const h = dot3(rel, frame.w);
    if (h < 1.6 || h > 12) continue;
    const u = dot3(rel, frame.uLabial);
    if (Math.abs(u) > 6.2) continue;
    const v = dot3(rel, frame.vSide);
    const av = Math.abs(v);
    if (av < halfMdMm + 0.7 || av > halfMdMm + 7.2) continue;
    sides[v >= 0 ? 0 : 1]!.push({ h, u });
  }
  let best: IncisorNeighborShovel | null = null;
  let bestScore = Infinity;
  for (const list of sides) {
    if (list.length < 48) continue;
    const hs = list.map((q) => q.h).sort((a, b) => a - b);
    const hTop = hs[Math.floor(hs.length * 0.97)]!;
    const hBot = hs[Math.floor(hs.length * 0.12)]!;
    if (hTop - hBot < 4.2) continue;
    const band = (h0: number, h1: number) => {
      const us = list
        .filter((q) => q.h >= h0 && q.h <= h1)
        .map((q) => q.u)
        .sort((a, b) => a - b);
      if (us.length < 8) return null;
      const uLin = us[Math.floor(us.length * 0.08)]!;
      const uLab = us[Math.floor(us.length * 0.92)]!;
      return { uLin, bl: uLab - uLin };
    };
    const inc = band(hTop - 1.7, hTop - 0.35);
    const cerv = band(hBot + (hTop - hBot) * 0.22, hBot + (hTop - hBot) * 0.42);
    if (!inc || !cerv) continue;
    if (inc.bl < 2.2 || inc.bl > 8.5) continue;
    const span = Math.max(1.4, hTop - 1.0 - (hBot + (hTop - hBot) * 0.32));
    // 절단 설측이 치경 싱귤럼보다 순측으로 들어가면 양수. 그 각이 설면와 사선이다.
    const bevelDeg = (Math.atan2(Math.max(0, inc.uLin - cerv.uLin), span) * 180) / Math.PI;
    const score = Math.abs(inc.bl - catalogIncisalBlMm);
    if (score < bestScore) {
      bestScore = score;
      best = { incisalBlMm: inc.bl, lingualBevelDeg: bevelDeg };
    }
  }
  return best;
}

/** 대합 높이장에서 순설 구간(u0~u1, |v|≤vHalf)의 가장 가까운 높이. 없으면 Infinity. */
function opposingBandMinHeight(
  field: ReturnType<typeof buildOpposingHeightField>,
  u0: number,
  u1: number,
  vHalf: number,
): number {
  let best = Infinity;
  const lo = Math.min(u0, u1);
  const hi = Math.max(u0, u1);
  for (const cell of field.list) {
    if (cell.u < lo || cell.u > hi || Math.abs(cell.v) > vHalf) continue;
    if (cell.h < best) best = cell.h;
  }
  return best;
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

type AdjacentLongAxisEstimate = {
  axis: Vec3;
  weight: number;
  isNarrowAbutment: boolean;
  bridged: boolean;
};

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
): AdjacentLongAxisEstimate[] {
  const found: AdjacentLongAxisEstimate[] = [];
  for (const sign of [1, -1] as const) {
    if (sign < 0 && o.skipDistal) continue;
    const vStart = o.ownRadius + 0.95;
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
    found.push({
      axis: res.axis,
      weight: wgt,
      isNarrowAbutment: res.isNarrowAbutment,
      bridged: bridgedThisSide,
    });
  }
  if (found.length <= 1) return found;
  if (found[0]!.weight >= found[1]!.weight * 2) return [found[0]!];
  if (found[1]!.weight >= found[0]!.weight * 2) return [found[1]!];
  return found;
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

function screwChannelSoup(
  bore: ReturnType<typeof resolveScrewChannelProfile>,
  zBot: number,
  zTop: number,
  segments = 64,
): Float32Array {
  const rings: Array<[number, number]> = [
    [bore.rBot, zBot],
    [bore.rBot, bore.seatZ0],
    [bore.rUpper, bore.seatZ1],
  ];
  if (bore.hasMouth && bore.mouthZ0 > bore.seatZ1 + 0.05 && bore.mouthZ1 < zTop - 0.05) {
    rings.push([bore.rUpper, bore.mouthZ0], [bore.rMouth, bore.mouthZ1], [bore.rMouth, zTop]);
  } else {
    rings.push([bore.rUpper, zTop]);
  }
  const rCapTop = rings[rings.length - 1]![0];
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
    put([bore.rBot * c1, bore.rBot * s1, zBot]);
    put([bore.rBot * c0, bore.rBot * s0, zBot]);
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
    put([rCapTop * c0, rCapTop * s0, zTop]);
    put([rCapTop * c1, rCapTop * s1, zTop]);
  }
  return out;
}

/**
 * 극점(첫·끝 점이 모든 열에서 같은 점)을 가진 열 묶음을 닫힌 삼각형 메시로 잇는다.
 * 열 안의 점은 바닥 중심 → 외면 → 윗면 중심 순서여야 바깥 법선이 된다.
 * 비평면 사각형 패치(스캘럽 경사 등)에서는 두 대각선 중 외측 볼록 능선(convex dihedral edge)을 선택해
 * 수평 단면 절단 시 대각선 골에 의한 내측 꺾임 주름을 원천 차단한다.
 */
function stitchPolarColumns(
  columns: readonly Vec3[][],
  capped: boolean,
  convexQuadUpToRing = -1,
): Float32Array {
  const ringCount = columns[0]!.length;
  const tris: number[] = [];
  const push = (a: Vec3, b: Vec3, c: Vec3) => tris.push(...a, ...b, ...c);
  for (let col = 0; col < columns.length; col += 1) {
    const A = columns[col]!;
    const B = columns[(col + 1) % columns.length]!;
    for (let r = 0; r < ringCount - 1; r += 1) {
      const bottomPole = capped && r === 0;
      const topPole = r === ringCount - 2;
      if (bottomPole) {
        push(A[r]!, B[r + 1]!, A[r + 1]!);
        continue;
      }
      if (topPole) {
        push(A[r]!, B[r]!, B[r + 1]!);
        continue;
      }
      if (convexQuadUpToRing >= 0 && r <= convexQuadUpToRing) {
        const a0 = A[r]!;
        const b0 = B[r]!;
        const b1 = B[r + 1]!;
        const a1 = A[r + 1]!;
        const n1 = cross3(sub3(b0, a0), sub3(b1, a0));
        if (dot3(sub3(a1, a0), n1) > 0) {
          push(a0, b0, a1);
          push(b0, b1, a1);
          continue;
        }
      }
      push(A[r]!, B[r]!, B[r + 1]!);
      push(A[r]!, B[r + 1]!, A[r + 1]!);
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
 * 포스트 상단 영역 위의 대합치 교합면(하한 포락면)에 평행하면서 가장 높은 평면 기울기(gu, gv)를 구한다.
 * 대합치가 한쪽(예: 설측)에 비어 있어도 Infinity 열에 끌려 기울기가 반대로 눕지 않고,
 * 양쪽 교두가 있으면 두 교두 모두 비슷한 대합 거리를 갖도록 평평한 경사면을 맞춘다.
 */
function estimateOpposingOcclusalPlane(
  field: ReturnType<typeof buildOpposingHeightField>,
  opts: {
    centerU: number;
    centerV: number;
    halfU: number;
    halfV: number;
    maxTilt: number;
  },
): { gu: number; gv: number; lowH: number } | null {
  let pool = field.list.filter(
    (c) => Math.abs(c.u - opts.centerU) <= opts.halfU && Math.abs(c.v - opts.centerV) <= opts.halfV,
  );
  if (pool.length < 6) {
    const rWide = Math.max(opts.halfU, opts.halfV) + 1.2;
    pool = field.list.filter((c) => Math.hypot(c.u - opts.centerU, c.v - opts.centerV) <= rWide);
  }
  if (pool.length < 5) return null;

  const hs = pool.map((c) => c.h).sort((a, b) => a - b);
  // 단일 먼지 정점 하나에 기울기가 휘둘리지 않도록 최하단 두 번째 셀을 기준으로 이상치를 거른다.
  const secondH = hs[Math.min(1, hs.length - 1)]!;
  const floorNoiseH = secondH - 0.55;
  const lowH = Math.max(hs[Math.floor(hs.length * 0.04)]!, floorNoiseH);
  const band = pool.filter((c) => c.h >= floorNoiseH && c.h <= lowH + 3.6);
  if (band.length < 5) return null;

  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  for (const c of band) {
    if (c.u < uMin) uMin = c.u;
    if (c.u > uMax) uMax = c.u;
    if (c.v < vMin) vMin = c.v;
    if (c.v > vMax) vMax = c.v;
  }
  const uSpan = uMax - uMin;
  const vSpan = vMax - vMin;

  const maxTilt = opts.maxTilt;
  const regWeight = 0.28;
  const evalScore = (gu: number, gv: number) => {
    let minA = Infinity;
    for (const c of band) {
      const a = c.h - gu * (c.u - opts.centerU) - gv * (c.v - opts.centerV);
      if (a < minA) minA = a;
    }
    return minA - regWeight * (gu * gu + gv * gv);
  };

  let bestGu = 0;
  let bestGv = 0;
  let bestScore = evalScore(0, 0);
  let step = maxTilt / 4;
  for (let pass = 0; pass < 4; pass += 1) {
    const cGu = bestGu;
    const cGv = bestGv;
    const gridN = pass === 0 ? 4 : 2;
    for (let iu = -gridN; iu <= gridN; iu += 1) {
      for (let iv = -gridN; iv <= gridN; iv += 1) {
        let gu = cGu + iu * step;
        let gv = cGv + iv * step;
        const g = Math.hypot(gu, gv);
        if (g > maxTilt) {
          gu *= maxTilt / g;
          gv *= maxTilt / g;
        }
        const s = evalScore(gu, gv);
        if (s > bestScore) {
          bestScore = s;
          bestGu = gu;
          bestGv = gv;
        }
      }
    }
    step /= 2.6;
  }

  // 대합치가 포스트 한쪽 끝에만 살짝 스치는 경우(폭 < 0.7mm)에는 빈 공간 쪽으로 과도하게 기울이지 않는다.
  const dampU = clamp((uSpan - 0.7) / 1.4, 0, 1);
  const dampV = clamp((vSpan - 0.7) / 1.4, 0, 1);
  return {
    gu: bestGu * dampU,
    gv: bestGv * dampV,
    lowH,
  };
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

/** 승인된 치종 보정을 삽입축 윗면에 더한다. 브리지 공통 축에는 다시 더하지 않는다. */
function applyGenerationAxisBias(
  w: Vec3,
  labXY: Vec3,
  mesXY: Vec3,
  bias: { tiltLabialDeg: number; tiltMesialDeg: number; shiftLabialMm: number; shiftMesialMm: number },
  postHeightMm: number,
  capRad: number,
): Vec3 {
  const H = Math.max(postHeightMm, 0.5);
  const lab = Math.tan(bias.tiltLabialDeg * DEG) * H + bias.shiftLabialMm;
  const mes = Math.tan(bias.tiltMesialDeg * DEG) * H + bias.shiftMesialMm;
  if (Math.abs(lab) < 1e-4 && Math.abs(mes) < 1e-4) return w;
  let next = norm3(
    add3(scale3(w, H / Math.max(w[2], 0.2)), add3(scale3(labXY, lab), scale3(mesXY, mes))),
  );
  if (next[2] < 0) next = scale3(next, -1);
  return capTilt(next, capRad);
}

/** 디자인 결과(로컬 좌표)로 월드 메시·STL을 만든다. 저장된 디자인 복원에도 쓴다. */
export function buildDesignedCustomAbutment(input: {
  fixture: MatchedScanbodyFixture;
  fileName: string;
  localPositions: Float32Array;
  solidBodyLocalPositions?: Float32Array;
  crownLocalPositions: Float32Array;
  marginLoopLocal: Float32Array;
  enameloplastyLocalPositions?: Float32Array;
  params: CustomAbutmentDesignParams;
  metrics: CustomAbutmentDesignMetrics;
}): DesignedCustomAbutment {
  const { fixture } = input;
  const stlPositions =
    input.solidBodyLocalPositions && input.solidBodyLocalPositions.length >= 9
      ? input.solidBodyLocalPositions
      : input.localPositions;
  const stlBlob = encodeBinaryStl(
    stlPositions,
    `abuts.fit custom abutment #${fixture.toothNumber}`,
  );
  const toWorld = fixturePoseToMatrix4(fixture.fixturePose);
  const worldGeometry = new THREE.BufferGeometry();
  worldGeometry.setAttribute("position", new THREE.BufferAttribute(input.localPositions.slice(), 3));
  worldGeometry.applyMatrix4(toWorld);
  computeCreasedVertexNormals(worldGeometry);
  worldGeometry.computeBoundingBox();

  const predictedCrownWorldGeometry = new THREE.BufferGeometry();
  predictedCrownWorldGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(input.crownLocalPositions.slice(), 3),
  );
  predictedCrownWorldGeometry.applyMatrix4(toWorld);
  computeCreasedVertexNormals(predictedCrownWorldGeometry);
  predictedCrownWorldGeometry.computeBoundingBox();

  let enameloplastyWorldGeometry: THREE.BufferGeometry | undefined;
  if (input.enameloplastyLocalPositions && input.enameloplastyLocalPositions.length >= 9) {
    enameloplastyWorldGeometry = new THREE.BufferGeometry();
    enameloplastyWorldGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(input.enameloplastyLocalPositions.slice(), 3),
    );
    enameloplastyWorldGeometry.applyMatrix4(toWorld);
    enameloplastyWorldGeometry.computeVertexNormals();
    enameloplastyWorldGeometry.computeBoundingBox();
  }

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
    ...(input.enameloplastyLocalPositions && input.enameloplastyLocalPositions.length >= 9
      ? { enameloplastyLocalPositions: input.enameloplastyLocalPositions }
      : {}),
    stlBlob,
    worldGeometry,
    predictedCrownWorldGeometry,
    ...(enameloplastyWorldGeometry ? { enameloplastyWorldGeometry } : {}),
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
  /** 사용자가 이번 치아에서 직접 편집한 조정값(치과 공통 취향과 구분). */
  explicitParams?: Partial<CustomAbutmentDesignParams> | null;
  /** 관리자가 승인한 치종 보정. 취향 기본값과 따로 더한다. */
  logicRules?: readonly AbutmentGenerationRule[] | null;
  patientName?: string;
};

export type CustomAbutmentConflictVariant =
  | "space_fill"
  | "strict_subg"
  | "space_moderate"
  | "keep_subg_no_supra"
  | "fixture_axis";

export type CustomAbutmentDesignCandidate = {
  id: CustomAbutmentConflictVariant;
  /** 우선 적용한 조건 요약(툴팁 표시용). */
  label: string;
  design: DesignedCustomAbutment;
};

type ConflictHints = {
  hasWideProximalSpace: boolean;
  maxProximalExcessMm: number;
  supragingivalRaised: boolean;
  rawTiltDeg: number;
  hasGroupAxis: boolean;
};

type DesignMode = {
  probeAxis?: boolean;
  /** 브리지 높이 맞추기 전 이 치아의 자연 높이와 대합 상한만 반환한다. 형제 프로브는 다시 프로브하지 않는다. */
  probeHeight?: boolean;
  groupAxisWorld?: Vec3 | null;
  /** 포스트 파절 방지 치은 연상 자동 승격 1회 실행 여부(재귀 루프 원천 차단). */
  supragingivalRetried?: boolean;
  variant?: CustomAbutmentConflictVariant;
  forbidSupragingivalRetry?: boolean;
};
type DesignResult =
  | { kind: "axis"; axisWorld: Vec3 }
  | { kind: "height"; naturalTopH: number; safeTopH: number; oppClearTopH: number }
  | { kind: "design"; design: DesignedCustomAbutment; conflictHints: ConflictHints };

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
    p.marginSubgMinMm,
    p.marginSubgMaxMm,
    p.marginScallopMm,
    p.postYawDeg,
    p.axisToOpposing,
    p.axisMaxDeg,
    abutmentLogicSignature(args.fixture.toothNumber, args.logicRules),
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

type BridgeTopProbe = { naturalTopH: number; safeTopH: number; oppClearTopH: number };

const bridgeHeightProbeCache = new WeakMap<THREE.BufferGeometry, Map<string, Promise<BridgeTopProbe>>>();

function bridgeHeightProbeKey(args: DesignArgs): string {
  const p = resolveCustomAbutmentParams(args.fixture.toothNumber, args.params);
  const o = args.fixture.fixturePose.origin;
  const r = (v: number) => Math.round(v * 100) / 100;
  return JSON.stringify([
    args.fixture.toothNumber,
    args.fixture.jaw,
    [r(o[0]), r(o[1]), r(o[2])],
    args.opposingGeometry?.uuid ?? null,
    r(p.occlusalClearanceMm),
    r(p.marginDepthMm),
    r(p.marginSubgMinMm),
    r(p.marginSubgMaxMm),
    r(p.axisMaxDeg),
    p.axisToOpposing,
    abutmentLogicSignature(args.fixture.toothNumber, args.logicRules),
  ]);
}

/** 같은 bridgeLinkedTeeth 묶음의 다른 지대치. 사분악이 같다고 다른 브리지를 섞지 않는다. */
function bridgeAbutmentMates(
  fixture: MatchedScanbodyFixture,
  neighbors: readonly MatchedScanbodyFixture[] | undefined,
  toothWorks: readonly ToothWorkSelection[] | undefined,
): MatchedScanbodyFixture[] {
  const works = toothWorks ?? [];
  const digitsOf = (tooth: string) => parseFdiTooth(tooth)?.digits ?? "";
  const start = digitsOf(fixture.toothNumber);
  if (!start) return [];
  const visited = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const wCur = works.find((tw) => digitsOf(tw.toothNumber) === cur);
    for (const linked of wCur?.bridgeLinkedTeeth ?? []) {
      const d = digitsOf(linked);
      if (d && !visited.has(d)) queue.push(d);
    }
    for (const tw of works) {
      const d = digitsOf(tw.toothNumber);
      if (!d || visited.has(d)) continue;
      if ((tw.bridgeLinkedTeeth ?? []).some((t) => digitsOf(t) === cur)) queue.push(d);
    }
  }
  if (visited.size < 2) return [];
  return (neighbors ?? []).filter(
    (n) => n.jaw === fixture.jaw && n.toothNumber !== fixture.toothNumber && visited.has(digitsOf(n.toothNumber)),
  );
}

/** 가장 긴 높이까지 모두가 대합·인접 상한을 지킬 수 있으면 그 높이, 아니면 짧은 포스트 높이. */
function resolveBridgeMatchedTopH(rows: Array<BridgeTopProbe & { oppClearTopH?: number }>): number | null {
  const usable = rows.filter((row) => Number.isFinite(row.naturalTopH));
  if (usable.length < 2) return null;
  let tallest = -Infinity;
  let shortest = Infinity;
  for (const row of usable) {
    tallest = Math.max(tallest, row.naturalTopH);
    shortest = Math.min(shortest, row.naturalTopH);
  }
  const oppBlocked = usable.some(
    (row) => Number.isFinite(row.oppClearTopH ?? Infinity) && (row.oppClearTopH ?? Infinity) + 0.3 < tallest,
  );
  // 치종·치은 정점 차이(중절치·측절치 등 ≤1.25mm)만 있고 대합 간섭이 없으면 각 치아의 자연 절단 높이를 유지한다.
  if (!oppBlocked && tallest - shortest <= 1.25) return null;
  const blocked = oppBlocked || usable.some((row) => row.safeTopH + 0.3 < tallest);
  return blocked ? shortest : tallest;
}

async function probeBridgePostTop(args: DesignArgs): Promise<BridgeTopProbe> {
  const key = bridgeHeightProbeKey(args);
  let byKey = bridgeHeightProbeCache.get(args.jawGeometry);
  if (!byKey) {
    byKey = new Map();
    bridgeHeightProbeCache.set(args.jawGeometry, byKey);
  }
  const hit = byKey.get(key);
  if (hit) return hit;
  const pending = (async () => {
    const probeArgs: DesignArgs = {
      ...args,
      params: { ...(args.params ?? {}), postHeightOffsetMm: 0 },
    };
    const groupAxisWorld = await resolveGroupAxisWorld(probeArgs);
    const res = await designImpl(probeArgs, { groupAxisWorld, probeHeight: true });
    if (res.kind !== "height") return { naturalTopH: Number.NaN, safeTopH: Infinity, oppClearTopH: Infinity };
    return { naturalTopH: res.naturalTopH, safeTopH: res.safeTopH, oppClearTopH: res.oppClearTopH };
  })();
  byKey.set(key, pending);
  pending.catch(() => {
    if (byKey.get(key) === pending) byKey.delete(key);
  });
  return pending;
}

/**
 * 구강스캔(잇몸·인접치·대합치)과 치종 템플릿으로 커스텀어벗과 예측 크라운 외형을 설계한다.
 * neighbors: 같은 악의 다른 디자인 대상 픽스쳐. 두 크라운 경계면으로 서로 떨어뜨리고,
 * 브리지·인접 치아끼리는 삽입축(포스트 패쓰)을 100% 동일한 월드 축으로 평행하게 맞춘다.
 */
async function resolveGroupAxisWorld(args: DesignArgs): Promise<Vec3 | null> {
  const explicitAxisSource =
    args.params?.axisSourceCode != null && Number.isFinite(Number(args.params.axisSourceCode))
      ? Math.round(Number(args.params.axisSourceCode))
      : -1;
  const group =
    explicitAxisSource === 0 || explicitAxisSource === 1
      ? [args.fixture]
      : parallelGroupOf(args.fixture, args.neighbors ?? [], args.toothWorks);
  if (group.length <= 1) return null;

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
  const minTaperSlopeGroup = Math.tan(RETENTION_SINGLE_MIN_TAPER_DEG * DEG);
  for (let iter = 0; iter < 12; iter += 1) {
    let moved = false;
    for (const f of sortedGroup) {
      const fAxis = norm3(f.fixturePose.axis);
      const ang = Math.acos(clamp(dot3(shared, fAxis), -1, 1));
      if (ang > maxGroupTilt + 1e-4) {
        shared = slerpDir(shared, fAxis, (ang - maxGroupTilt) / ang);
        moved = true;
      }
      const wLocal = worldDirToFixtureLocal(shared, f.fixturePose);
      if (wLocal[2] > 0.25) {
        const fConn = f.connectionSpec;
        const fBoreTopR = fConn.screwUpperDiameterMm / 2;
        const fOriginR = fConn.originDiameterMm / 2;
        const fConeTopZ = fConn.prcConeTopMm;
        const fConeTopR = fOriginR + TAPER_11_SLOPE * fConeTopZ;
        const fTpl = abutmentTemplateForTooth(f.toothNumber);
        const estSpanH = Math.max(3.6, fTpl.postHeightMm + 0.6);
        const maxFlare = Math.tan((fTpl.anterior ? 40 : 45) * DEG);
        const estAnatMaxR = Math.min(
          fConeTopR + 2.4 * maxFlare,
          Math.max(fTpl.naturalBlMm, fTpl.naturalMdMm) * 0.5,
        );
        let tx = wLocal[0] / wLocal[2];
        let ty = wLocal[1] / wLocal[2];
        let clampedLocal = false;
        const freeAllowShift = Math.max(
          0.25,
          estAnatMaxR - 0.22 - estSpanH * minTaperSlopeGroup - (fBoreTopR + MIN_POST_WALL_MM + 0.06),
        );
        const maxFreeTan = freeAllowShift / estSpanH;
        const curTanLen = Math.hypot(tx, ty);
        if (curTanLen > maxFreeTan + 1e-4) {
          const k = maxFreeTan / curTanLen;
          tx *= k;
          ty *= k;
          clampedLocal = true;
        }
        for (const other of allPool) {
          if (other.toothNumber === f.toothNumber || other.jaw !== f.jaw) continue;
          const rel = worldPointToFixtureLocal(other.fixturePose.origin, f.fixturePose);
          const distXY = Math.hypot(rel[0], rel[1]);
          if (distXY < 1.5 || distXY > 14) continue;
          const nx = rel[0] / distXY;
          const ny = rel[1] / distXY;
          const availR = Math.min(estAnatMaxR, distXY * 0.5 - MIN_NEIGHBOR_MARGIN_PAIR_GAP_MM * 0.5);
          const allowShift = Math.max(
            0,
            availR - 0.18 - estSpanH * minTaperSlopeGroup - (fBoreTopR + MIN_POST_WALL_MM + 0.06),
          );
          const maxOppTan = allowShift / estSpanH;
          const oppTan = -(tx * nx + ty * ny);
          if (oppTan > maxOppTan + 1e-4) {
            const deltaTan = oppTan - maxOppTan;
            tx += nx * deltaTan;
            ty += ny * deltaTan;
            clampedLocal = true;
          }
        }
        if (clampedLocal) {
          const nextLocal = norm3([tx, ty, 1]);
          shared = fixtureLocalDirToWorld(nextLocal, f.fixturePose);
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return shared;
}

function disposeDesignedGeometries(d: DesignedCustomAbutment) {
  d.worldGeometry.dispose();
  d.predictedCrownWorldGeometry.dispose();
  d.enameloplastyWorldGeometry?.dispose();
}

function areCandidatesDistinct(a: DesignedCustomAbutment, b: DesignedCustomAbutment): boolean {
  if (Math.abs(a.metrics.angulationDeg - b.metrics.angulationDeg) >= 2.4) return true;
  if (Math.abs(a.metrics.maxDiameterMm - b.metrics.maxDiameterMm) >= 0.35) return true;
  const ma = a.marginLoopLocal;
  const mb = b.marginLoopLocal;
  if (ma.length !== mb.length) return true;
  let maxDist = 0;
  for (let i = 0; i < ma.length; i += 3) {
    const d = Math.hypot(ma[i]! - mb[i]!, ma[i + 1]! - mb[i + 1]!, (ma[i + 2]! - mb[i + 2]!) * 0.85);
    if (d > maxDist) maxDist = d;
  }
  return maxDist >= 0.36;
}

export async function designCustomAbutmentStl(args: DesignArgs): Promise<DesignedCustomAbutment> {
  const groupAxisWorld = await resolveGroupAxisWorld(args);
  const res = await designImpl(args, { groupAxisWorld });
  if (res.kind !== "design") throw new Error("커스텀어벗 디자인을 만들지 못했습니다.");
  return res.design;
}

/**
 * 인접 공간·치은 연하·포스트 강도·삽입축 등 조건이 서로 충돌하는 케이스에서
 * 우선순위가 높은 디자인 후보를 최대 3개까지 돌려준다(충돌이 없으면 길이 1).
 */
export async function designCustomAbutmentCandidates(
  args: DesignArgs,
): Promise<CustomAbutmentDesignCandidate[]> {
  const groupAxisWorld = await resolveGroupAxisWorld(args);
  const primaryRes = await designImpl(args, { groupAxisWorld, variant: "space_fill" });
  if (primaryRes.kind !== "design") {
    throw new Error("커스텀어벗 디자인을 만들지 못했습니다.");
  }
  const hints = primaryRes.conflictHints;
  const primaryLabel = hints.supragingivalRaised
    ? "포스트 강도 · 크라운 두께 우선"
    : hints.hasWideProximalSpace
      ? "인접 공간 균형 우선"
      : "기본 최적 디자인";
  const out: CustomAbutmentDesignCandidate[] = [
    { id: "space_fill", label: primaryLabel, design: primaryRes.design },
  ];

  const tryPush = async (
    variant: CustomAbutmentConflictVariant,
    label: string,
    extraParams?: Partial<CustomAbutmentDesignParams>,
    forbidSupragingivalRetry?: boolean,
  ) => {
    if (out.length >= 3) return;
    const altArgs: DesignArgs = extraParams
      ? { ...args, params: { ...(args.params ?? {}), ...extraParams } }
      : args;
    const altRes = await designImpl(altArgs, {
      groupAxisWorld: variant === "fixture_axis" ? null : groupAxisWorld,
      variant,
      forbidSupragingivalRetry,
    });
    if (altRes.kind !== "design") return;
    if (out.every((prev) => areCandidatesDistinct(prev.design, altRes.design))) {
      out.push({ id: variant, label, design: altRes.design });
    } else {
      disposeDesignedGeometries(altRes.design);
    }
  };

  if (hints.hasWideProximalSpace) {
    await tryPush("strict_subg", "치은 연하 깊이 우선");
    if (hints.maxProximalExcessMm >= 1.25) {
      await tryPush("space_moderate", "인접 공간 · 치은 연하 절충");
    }
  }
  if (hints.supragingivalRaised && out.length < 3) {
    await tryPush("keep_subg_no_supra", "치은 연하 심미 우선", undefined, true);
  }
  if (!hints.hasGroupAxis && hints.rawTiltDeg >= 13.5 && out.length < 3) {
    await tryPush("fixture_axis", "픽스쳐 축 · 마진 컴팩트 우선", { axisMaxDeg: 3.0 });
  }

  return out.slice(0, 3);
}

async function designImpl(args: DesignArgs, mode: DesignMode): Promise<DesignResult> {
  const { fixture, jawGeometry, opposingGeometry } = args;
  const bridgeRetentionEarly = resolveToothBridgeRetentionContext(fixture.toothNumber, args.toothWorks);
  const params = resolveCustomAbutmentParams(fixture.toothNumber, args.params, bridgeRetentionEarly);
  applyAbutmentGenerationLogic(params, fixture.toothNumber, args.logicRules);
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

  const baseBore = resolveScrewChannelProfile(conn, null);
  const boreBotR = baseBore.rBot;
  const boreTopR = baseBore.rUpper;
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
    const nearPts = (bins[0]?.length ?? 0) + (bins[1]?.length ?? 0) + (bins[2]?.length ?? 0);
    if (nearPts < 3) return Number.NaN;
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
  // 치은 연하 얕은 끝~깊은 끝(기본 0.5~1.0mm) 안에 두고, 저차 조화만 남긴다.
  // 대화의 마진 깊이는 얕은 끝이다. 범위와 어긋나면 구간 폭을 유지한 채 그 끝을 따라간다.
  let subgMin = Math.min(params.marginSubgMinMm, params.marginSubgMaxMm);
  let subgMax = Math.max(params.marginSubgMinMm, params.marginSubgMaxMm);
  if (Math.abs(params.marginDepthMm - params.marginSubgMinMm) > 0.02) {
    const width = Math.max(0, subgMax - subgMin);
    subgMin = params.marginDepthMm;
    subgMax = Math.min(2.5, Math.max(subgMin, subgMin + width));
  }
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
        oppLowZ - CROWN_THICKNESS_FLOOR_MM - 0.35 - (posterior ? 1.45 : 1.6),
      );
    }
  }
  const supragingivalLiftAllowance = Math.max(0, -subgMin) + 0.65;
  const maxMarginZ = Math.min(
    Math.max(8.5, sbH + (subgMin < -0.5 ? 0.6 : -1.0)),
    medianRimZ + Math.max(posterior ? 1.55 : 2.1, supragingivalLiftAllowance),
    oppMarginCapZ,
  );

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
  const targetSubgDepth = (subgMin + subgMax) * 0.5;
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
  const tiltCap = posterior ? 0.24 : 0.9;
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
    const hi = Math.max(minMarginZ, rimLow[b]! - subgMin);
    const lo = rimLow[b]! - subgMax;
    const loZ = Math.min(hi, lo);
    const hiZ = Math.max(hi, lo);
    return clamp(z, Math.max(minMarginZ, loZ), Math.min(maxMarginZ, hiZ));
  });
  let smoothMarginZ = lowPassCircular(bandedDraft, 2).map((z, b) => {
    const supragingivalCap = Math.max(minMarginZ, rimLow[b]! - subgMin);
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
        const supragingivalCap = Math.max(minMarginZ, rimLow[b]! - subgMin);
        return clamp(Math.min(supragingivalCap, z - addAmp * Math.cos(2 * phi) * 0.5), minMarginZ, maxMarginZ);
      });
      smoothMarginZ = lowPassCircular(baseWithScallop, 2).map((z) => clamp(z, minMarginZ, maxMarginZ));
    }
  }
  smoothMarginZ = lowPassCircular(smoothMarginZ, 2).map((z) => clamp(z, minMarginZ, maxMarginZ));
  let meanMarginZ = smoothMarginZ.reduce((s, v) => s + v, 0) / SECTORS;
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

  // 인접 자연치 접촉 높이(마진 위 3.2~7.5mm)만 본다. 그 아래(h < 3.2mm)는 치간유두 잇몸이라 간격이 작게 잡힌다.
  const adjBuckets: number[][] = Array.from({ length: SECTORS }, () => []);
  // 양옆이 자연치인지(접촉 높이 위로 솟은 점). 잇몸 둔덕만 있는 쪽은 크라운 크기를 맞추는 기준이 아니다.
  const tallSide: [number[], number[]] = [[], []];
  for (let i = 0; i < jawLocalPts.length; i += 3) {
    const p: Vec3 = [jawLocalPts[i]!, jawLocalPts[i + 1]!, jawLocalPts[i + 2]!];
    if (Math.hypot(p[0], p[1]) < sbR + 0.65 && p[2] > -0.4 && p[2] < sbH + 0.85) continue;
    const rel = sub3(p, c0);
    const h = dot3(rel, frame0.w);
    const mesSign0 = dot3(frame0.vSide, mesXY) >= 0 ? 1 : -1;
    const isWisdomDistal0 = hasDistalRetromolarPad && dot3(rel, frame0.vSide) * mesSign0 < 0;
    if (!isWisdomDistal0 && h >= 3.2 && h <= 9.8) {
      const tu = dot3(rel, frame0.uLabial);
      const tv = dot3(rel, frame0.vSide);
      const tr = Math.hypot(tu, tv);
      if (tr >= 2.2 && tr <= 12 && Math.abs(tu) <= tr * Math.sin(36 * DEG)) tallSide[tv > 0 ? 0 : 1].push(tr);
    }
    if (isWisdomDistal0 || h < 3.2 || h > 7.6) continue;
    const u = dot3(rel, frame0.uLabial);
    const v = dot3(rel, frame0.vSide);
    const r = Math.hypot(u, v);
    if (r < 2.2 || r > 9.5) continue;
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
      if (d <= 28 * DEG && Number.isFinite(adjLimitR[b]!)) vals.push(adjLimitR[b]!);
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
    ? Math.max(1.85, rawReachPos - posAllowance0.wallMm)
    : Number.NaN;
  const reachNeg = Number.isFinite(rawReachNeg)
    ? Math.max(1.85, rawReachNeg - negAllowance0.wallMm)
    : Number.NaN;
  let mdScale = 1;
  let sideShiftMm = 0;
  if (Number.isFinite(reachPos) && Number.isFinite(reachNeg)) {
    mdScale = clamp((reachPos + reachNeg) / refNaturalMdMm, 0.78, 1.12);
    sideShiftMm = clamp((reachPos - reachNeg) / 2, -0.8, 0.8);
  } else if (Number.isFinite(reachPos) || Number.isFinite(reachNeg)) {
    const one = Number.isFinite(reachPos) ? reachPos : reachNeg;
    mdScale = clamp((one * 2) / refNaturalMdMm, 0.82, 1.08);
  } else if (contraMirror) {
    mdScale = clamp(refNaturalMdMm / tpl.naturalMdMm, 0.88, 1.1);
  }
  const sideHasTooth = (list: number[], rawReach: number) =>
    Number.isFinite(rawReach) && list.filter((r) => r <= rawReach + 3).length >= 12;
  const toothPos = sideHasTooth(tallSide[0], rawReachPos);
  const toothNeg = sideHasTooth(tallSide[1], rawReachNeg);
  let nbBoundPos = Infinity;
  let nbBoundNeg = Infinity;
  for (const nb of neighbors) {
    const dvNb = dot3(nb.origin, frame0.vSide);
    const duNb = dot3(nb.origin, frame0.uLabial);
    if (Math.abs(dvNb) > 2.2 && Math.abs(duNb) < Math.abs(dvNb) * 1.2) {
      const halfDist = Math.hypot(duNb, dvNb) * 0.5;
      if (dvNb > 0) nbBoundPos = Math.min(nbBoundPos, halfDist);
      else nbBoundNeg = Math.min(nbBoundNeg, halfDist);
    }
  }
  const effBoundPos = toothPos ? Math.min(reachPos, nbBoundPos) : nbBoundPos;
  const effBoundNeg = toothNeg ? Math.min(reachNeg, nbBoundNeg) : nbBoundNeg;
  const hasPosBound = Number.isFinite(effBoundPos);
  const hasNegBound = Number.isFinite(effBoundNeg);
  // 가상 치아 근원심: 치종 평균(+거울상) 폭. 양옆 자연치·인접 픽스쳐 경계가 있으면 그 안에 맞추고,
  // 한쪽 인접치가 더 가까우면 여유 있는 반대쪽으로 중심을 자연스럽게 옮긴다.
  const natHalfMd = refNaturalMdMm / 2;
  let crownHalfMd = natHalfMd;
  let crownCenterV = 0;
  if (hasPosBound && hasNegBound) {
    crownHalfMd = clamp((effBoundPos + effBoundNeg) / 2, natHalfMd * 0.72, natHalfMd * 1.15);
    crownCenterV = clamp((effBoundPos - effBoundNeg) * 0.45, -0.75, 0.75);
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
    ? clamp(refNaturalBlMm / tpl.naturalBlMm, 0.92, 1.12)
    : posterior
      ? 1 + (mdScale - 1) * 0.5
      : 1 + Math.max(0, mdScale - 1) * 0.35;
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

  // 절치 각도는 이미 기운 삽입축이 아니라 교합 직교 프레임(occInFix 기준)에서 인접 자연치를 잰다.
  const alignedLabInFix = worldDirToFixtureLocal(alignedLabialWorld, fixture.fixturePose);
  const alignedMesInFix = worldDirToFixtureLocal(alignedMesialWorld, fixture.fixturePose);
  const incisorGuide =
    tpl.kind === "incisor"
      ? measureAdjacentIncisorGuide(
          jawLocalPts,
          c0,
          occInFix,
          alignedLabInFix,
          alignedMesInFix,
          Math.max(2.2, marginB),
          { radius: sbR, height: sbH },
          {
            skipPos: mesialAllowance.wallMm > 0,
            skipNeg: distalAllowance.wallMm > 0,
            ownClinicalHeightMm: tpl.anatomy.crown.clinicalHeightMm,
            posClinicalHeightMm: mesialAdjDigits
              ? getToothAnatomy(mesialAdjDigits).crown.clinicalHeightMm
              : tpl.anatomy.crown.clinicalHeightMm,
            negClinicalHeightMm: distalAdjDigits
              ? getToothAnatomy(distalAdjDigits).crown.clinicalHeightMm
              : tpl.anatomy.crown.clinicalHeightMm,
          },
        )
      : null;

  let w: Vec3 = [0, 0, 1];
  /** 인접 자연치 순측 기울기(°). 전치·견치 싱귤럼 사선을 치아마다 다르게 기울일 때 쓴다. 0이면 곧은 인접치. */
  let anteriorNeighborSideDeg = 0;
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
        // 측면에서 본 각도는 인접치 치축을 따른다. 치아마다 다르고, 인접치가 곧으면 거의 꺾지 않는다.
        anteriorNeighborSideDeg = Math.atan(adjLabSlope) / DEG;
        blendedLabSlope = occLabSlope * 0.4 + adjLabSlope * 0.6;
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

    const explicitSourceCode = Math.round(params.axisSourceCode);
    const effectiveAxisToOpposing =
      explicitSourceCode === 0 ? 0 : explicitSourceCode === 1 ? 1 : params.axisToOpposing;
    let wantU = nearU;
    let wantV = nearV;
    if (opposingLocalPts.length > 0 && effectiveAxisToOpposing > 0) {
      const frameOccRef = insertionFrame(occInFix, labXY);
      const labSignOcc = dot3(frameOccRef.uLabial, labXY) >= 0 ? 1 : -1;
      const mesSignOcc = dot3(frameOccRef.vSide, mesXY) >= 0 ? 1 : -1;
      const center = opposingCenterPoint(opposingLocalPts, c0, frameOccRef, {
        vCrownMm: crownShiftMesMm * mesSignOcc,
        halfMdMm: crownHalfMd,
        constrainMesiodistal: hasProximalBound,
      });
      const oppFieldOcc = buildOpposingHeightField(opposingLocalPts, c0, frameOccRef, 9.0);
      const oppPlaneOcc = estimateOpposingOcclusalPlane(oppFieldOcc, {
        centerU: 0,
        centerV: crownShiftMesMm * mesSignOcc,
        halfU: Math.max(2.6, marginA - shoulderW + 0.8),
        halfV: Math.max(2.4, Math.min(marginB - shoulderW + 0.7, crownHalfMd * 0.88)),
        maxTilt: FLAT_TOP_MAX_TILT,
      });
      if (center || oppPlaneOcc) {
        let oppTargetU = nearU;
        let oppTargetV = nearV;
        if (center) {
          const relOpp = sub3(center, c0);
          const scaleH = H / Math.max(relOpp[2], H + 1.2);
          oppTargetU = dot3(relOpp, labXY) * scaleH;
          oppTargetV = dot3(relOpp, mesXY) * scaleH;
        }
        if (oppPlaneOcc) {
          // 대합치 교합면이 +u 쪽으로 낮고 -u 쪽으로 높으면(gu < 0), 그 면에 수직인 포스트 축은 +u(-gu > 0)로 기운다.
          const normU = occU + clamp(-oppPlaneOcc.gu * labSignOcc, -0.36, 0.36) * H * 0.65;
          const normV = occV + clamp(-oppPlaneOcc.gv * mesSignOcc, -0.3, 0.3) * H * 0.55;
          oppTargetU = center ? oppTargetU * 0.42 + normU * 0.58 : normU;
          oppTargetV = center ? oppTargetV * 0.45 + normV * 0.55 : normV;
        }
        const wOppU = (isBridgedToScanned ? 0.52 : 0.68) * effectiveAxisToOpposing;
        const wOppV = (isBridgedToScanned ? 0.32 : 0.48) * effectiveAxisToOpposing;
        wantU = oppTargetU * wOppU + nearU * (1 - wOppU);
        wantV = oppTargetV * wOppV + nearV * (1 - wOppV);
        axisSource = "opposing";
      }
    } else if (explicitSourceCode === 0) {
      axisSource = "arch";
    }

    const wantLat = Math.hypot(wantU, wantV);
    const effDeadzone = axisSource === "opposing" ? deadzoneMm * 0.6 : deadzoneMm;
    const effLat = wantLat > effDeadzone ? (wantLat - effDeadzone) * 0.82 : 0;
    const postAutoTiltCap = Math.min(tiltCapRad, 8.0 * DEG);
    if (effLat > 1e-4 && wantLat > 1e-6) {
      const dirX = (labXY[0] * wantU + mesXY[0] * wantV) / wantLat;
      const dirY = (labXY[1] * wantU + mesXY[1] * wantV) / wantLat;
      w = capTilt(norm3([(dirX * effLat) / H, (dirY * effLat) / H, 1]), postAutoTiltCap);
    }
    w = steerAxisForProximalClearance(w, Math.min(tiltCapRad, 8.0 * DEG));
  }
  const explicitSource = Math.round(params.axisSourceCode);
  const neighborAxes =
    explicitSource === 0 || explicitSource === 1
      ? []
      : estimateAdjacentLongAxes(jawLocalPts, {
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
    let target = neighborAxes[0]!.axis;
    if (neighborAxes.length > 1) {
      target = norm3(neighborAxes.reduce((acc, row) => add3(acc, row.axis), [0, 0, 0] as Vec3));
      if (target[2] < 0) target = scale3(target, -1);
    }
    const spread =
      neighborAxes.length > 1
        ? Math.acos(clamp(Math.abs(dot3(neighborAxes[0]!.axis, neighborAxes[1]!.axis)), 0, 1))
        : 0;
    const bridgeTight =
      String(ownWork?.prosthesisType || "").trim() === "브리지" ||
      mesialAllowance.bridged ||
      distalAllowance.bridged;
    const hasPreparedNeighborPillar = neighborAxes.some(
      (row) => row.bridged || (row.isNarrowAbutment && (mesialAllowance.wallMm > 0 || distalAllowance.wallMm > 0)),
    );
    if (bridgeTight || explicitSource === 2 || hasPreparedNeighborPillar) {
      // 브리지 연결·명시적 평행 선택·인접 프렙/기성어벗 기둥은 그 장축과 삽입축을 일치시킨다.
      const weight = spread > 28 * DEG ? (bridgeTight ? 0.94 : 0.82) : 1;
      w = weight >= 0.999 ? target : norm3(add3(scale3(w, 1 - weight), scale3(target, weight)));
      if (w[2] < 0) w = scale3(w, -1);
      neighborLockRad = (posterior ? 28 : 32) * DEG;
      w = capTilt(w, neighborLockRad);
      axisSource = "parallel";
    } else {
      // 싱글 크라운 옆 완성 자연치 치관은 비대칭 순·설 풍융부 때문에 기둥 중심선이 교합축에서 기울 수 있으므로,
      // 순설 기울기는 교합·순측 아치 축(w)을 그대로 지키고 근원심 치축만 완만히(22%) 참고한 뒤 인접 유격 보정을 다시 거친다.
      const wLabSlope = dot3(w, labXY) / Math.max(w[2], 0.25);
      const wMesSlope = dot3(w, mesXY) / Math.max(w[2], 0.25);
      const tgtMesSlope = dot3(target, mesXY) / Math.max(target[2], 0.25);
      const blendedMes = wMesSlope + clamp(tgtMesSlope - wMesSlope, -Math.tan(6 * DEG), Math.tan(6 * DEG)) * 0.22;
      w = capTilt(
        norm3([
          labXY[0] * wLabSlope + mesXY[0] * blendedMes,
          labXY[1] * wLabSlope + mesXY[1] * blendedMes,
          1,
        ]),
        posterior ? Math.min(tiltCapRad, 8.5 * DEG) : tiltCapRad,
      );
      w = steerAxisForProximalClearance(w, posterior ? Math.min(tiltCapRad, 8.5 * DEG) : tiltCapRad);
    }
  }
  // 절치만: 교합 직교 프레임에서 잰 인접 자연치 장축의 순측 벌림(최대 22°)과 근원심 기울기를 삽입축에 반영한다.
  if (tpl.kind === "incisor" && incisorGuide) {
    const labCap = Math.tan(22 * DEG);
    const mesCap = Math.tan(16 * DEG);
    const labS = clamp(incisorGuide.labialSlope, -labCap, labCap);
    const mesS = clamp(incisorGuide.mesialSlope, -mesCap, mesCap);
    const archFr = insertionFrame(norm3(occInFix), alignedLabInFix);
    const vMesArch =
      dot3(archFr.vSide, alignedMesInFix) >= 0 ? archFr.vSide : scale3(archFr.vSide, -1);
    const curW = norm3(w);
    const curDen = Math.max(0.25, dot3(curW, archFr.w));
    const curLab = dot3(curW, archFr.uLabial) / curDen;
    const curMes = dot3(curW, vMesArch) / curDen;
    const nextLab = clamp(curLab * 0.25 + labS * 0.75, -labCap, labCap);
    const nextMes = clamp(curMes * 0.45 + mesS * 0.55, -mesCap, mesCap);
    const wArch = norm3(
      add3(archFr.w, add3(scale3(archFr.uLabial, nextLab), scale3(vMesArch, nextMes))),
    );
    if (wArch[2] > 0.15) {
      w = capTilt(wArch, tiltCapRad);
      w = steerAxisForProximalClearance(w, tiltCapRad);
    }
  }
  const logicBias = generationAxisBias(fixture.toothNumber, args.logicRules);
  if (mode.probeAxis) {
    w = applyGenerationAxisBias(w, labXY, mesXY, logicBias, tpl.postHeightMm, tiltCapRad);
    return { kind: "axis", axisWorld: fixtureLocalDirToWorld(w, fixture.fixturePose) };
  }
  const hasManualAxisShift = params.axisShiftLabialMm !== 0 || params.axisShiftMesialMm !== 0;
  if (mode.groupAxisWorld && explicitSource !== 0 && explicitSource !== 1) {
    w = worldDirToFixtureLocal(mode.groupAxisWorld, fixture.fixturePose);
    axisSource = "parallel";
  } else if (explicitSource === 2) {
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
  if (!mode.groupAxisWorld || hasManualAxisShift || explicitSource === 0 || explicitSource === 1) {
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
  if (!mode.groupAxisWorld) {
    w = applyGenerationAxisBias(w, labXY, mesXY, logicBias, tpl.postHeightMm, tiltCapRad);
  }
  if (
    args.params?.axisTargetDeg != null &&
    Number.isFinite(Number(args.params.axisTargetDeg)) &&
    params.axisTargetDeg >= 0
  ) {
    const targetRad = clamp(params.axisTargetDeg, 0, 32) * DEG;
    let dirX = w[0];
    let dirY = w[1];
    let len = Math.hypot(dirX, dirY);
    if (len < 1e-5) {
      dirX = occInFix[0];
      dirY = occInFix[1];
      len = Math.hypot(dirX, dirY);
    }
    if (len < 1e-5) {
      dirX = labXY[0];
      dirY = labXY[1];
      len = Math.hypot(dirX, dirY) || 1;
    }
    if (targetRad < 1e-5) {
      w = [0, 0, 1];
    } else {
      const s = Math.sin(targetRad) / len;
      w = norm3([dirX * s, dirY * s, Math.cos(targetRad)]);
    }
  }
  if (!mode.groupAxisWorld && w[2] > 0.25 && neighbors.length > 0) {
    const estSpanH = Math.max(3.2, tpl.postHeightMm);
    const minSlope = Math.tan(RETENTION_SINGLE_MIN_TAPER_DEG * DEG);
    const maxFlare = Math.tan((tpl.anterior ? 40 : 45) * DEG);
    const estMarginMaxR = coneTopR + Math.max(2.15, meanMarginZ - coneTopZ) * maxFlare;
    let tx = w[0] / w[2];
    let ty = w[1] / w[2];
    let clampedAxis = false;
    for (const nb of neighbors) {
      const distXY = Math.hypot(nb.origin[0], nb.origin[1]);
      if (distXY < 1.5 || distXY > 14) continue;
      const nx = nb.origin[0] / distXY;
      const ny = nb.origin[1] / distXY;
      const availR = Math.min(estMarginMaxR, distXY * 0.5 - MIN_NEIGHBOR_MARGIN_PAIR_GAP_MM * 0.5);
      const allowShift = Math.max(
        0,
        availR - 0.18 - estSpanH * minSlope - (boreTopR + MIN_POST_WALL_MM + 0.06),
      );
      const maxOppTan = allowShift / estSpanH;
      const oppTan = -(tx * nx + ty * ny);
      if (oppTan > maxOppTan + 1e-4) {
        const deltaTan = oppTan - maxOppTan;
        tx += nx * deltaTan;
        ty += ny * deltaTan;
        clampedAxis = true;
      }
    }
    if (clampedAxis) w = norm3([tx, ty, 1]);
  }
  // 치은 연상 전환(공간 협소·포스트 파절 방지) 싱글 케이스는 포스트 상단까지 360° 스크류 홀 벽 두께(≥0.3mm)를 감싸면서도
  // 마진 직경이 정상 치아 컷백 범위를 넘지 않도록 삽입축 기울기를 적정 기하 한도 안으로 맞춘다.
  const hasExplicitTargetDeg =
    args.params?.axisTargetDeg != null &&
    Number.isFinite(Number(args.params.axisTargetDeg)) &&
    params.axisTargetDeg >= 0;
  if (
    Boolean(mode.supragingivalRetried) &&
    !mode.groupAxisWorld &&
    !hasManualAxisShift &&
    !hasExplicitTargetDeg &&
    w[2] > 0.25
  ) {
    const estSpan = Math.max(4.5, tpl.postHeightMm);
    const minSlopeAxis = Math.tan(RETENTION_SINGLE_MIN_TAPER_DEG * DEG);
    const allowShiftBl = Math.max(
      0.4,
      tpl.maxMarginBlMm * 0.5 -
        0.22 -
        estSpan * minSlopeAxis -
        (boreTopR + MIN_FRACTURE_SAFE_POST_WALL_MM + 0.04),
    );
    const allowShiftMd = Math.max(
      0.3,
      tpl.maxMarginMdMm * 0.5 -
        0.22 -
        estSpan * minSlopeAxis -
        (boreTopR + MIN_FRACTURE_SAFE_POST_WALL_MM + 0.04),
    );
    const maxTanBl = allowShiftBl / estSpan;
    // 상단 스크류 홀(X=0, Y=0)을 0.3mm 이상 벽으로 감쌀 때 삽입축을 인접치 반대쪽으로 기울이면
    // 언더컷 방지 모선이 하단(마진)을 오히려 좁은 인접치 쪽으로 밀어내므로 근원심 축 기울기는 임플란트 축에 가깝게 유지한다.
    const maxTanMd = Math.min(allowShiftMd / estSpan, Math.tan(1.8 * DEG));
    const tLab = clamp((w[0] * labXY[0] + w[1] * labXY[1]) / w[2], -maxTanBl, maxTanBl);
    const tMes = clamp((w[0] * mesXY[0] + w[1] * mesXY[1]) / w[2], -maxTanMd, maxTanMd);
    w = norm3([labXY[0] * tLab + mesXY[0] * tMes, labXY[1] * tLab + mesXY[1] * tMes, 1]);
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
  /** 가상 치아의 dir 방향 반경(높이 h). 마진(r0)에서 부위별 정상 크라운 풍융부(순측 능선·설측 싱귤럼→설면와)를 거쳐 교합·절단으로 수렴한다. */
  const naturalCrownR = (dir: Vec3, h: number, h0: number, r0: number, hCrownTop: number) => {
    const du = dot3(dir, frame.uLabial);
    const dv = dot3(dir, frame.vSide);
    const s = clamp((h - h0) / Math.max(hCrownTop - h0, 1), 0, 1);
    const faLab = tpl.anterior
      ? 1 - 0.52 * smootherstep(clamp((s - 0.36) / 0.64, 0, 1))
      : 1 +
        0.025 * Math.sin(Math.PI * clamp(s / 0.72, 0, 1)) -
        0.175 * smootherstep(clamp((s - 0.5) / 0.5, 0, 1));
    // 전치·견치의 설측은 치경부 싱귤럼(s≈0.24) 위부터 설면와(lingual fossa)를 이루며 순측보다 일찍 사선으로 좁아진다.
    const faLin = tpl.anterior
      ? 1 - 0.58 * smootherstep(clamp((s - 0.24) / 0.76, 0, 1))
      : faLab;
    const fb = tpl.anterior
      ? 1 - 0.12 * smootherstep(clamp((s - 0.68) / 0.32, 0, 1))
      : 1 - 0.095 * smootherstep(clamp((s - 0.72) / 0.28, 0, 1));
    let t = analyticSectionRay(
      tpl.kind,
      "crown",
      natHalfBl * faLab,
      natHalfBl * faLin,
      crownHalfMd * fb,
      crownCenterU * faLab,
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
  let archCrownTopH = Number.isFinite(adjacentTopH)
    ? Number.isFinite(mirrorTopH)
      ? adjacentTopH * 0.7 + mirrorTopH * 0.3
      : adjacentTopH
    : mirrorTopH;
  // 순측으로 빠진 절단연은 |u|≤4.5 샘플에 안 잡힌다. 절치는 치종 단차·양옆 균형을 반영한 인접 절단연 높이를 그대로 쓴다.
  if (tpl.kind === "incisor" && incisorGuide && Number.isFinite(incisorGuide.incisalH)) {
    const axial = Math.max(0.72, Math.abs(dot3(frame.w, norm3(occInFix))));
    const guideAxial = incisorGuide.incisalH / axial;
    archCrownTopH = Number.isFinite(mirrorTopH)
      ? Math.min(guideAxial + 0.35, guideAxial * 0.8 + mirrorTopH * 0.2)
      : guideAxial;
  }
  const offsetH = params.postHeightOffsetMm;
  const desiredOccThickness = clamp(Math.max(clearance, params.minCrownThicknessMm + 0.15), 1.0, 1.5);
  // 절치는 절단 도재 두께(중절치 약 1.35mm, 측절치 약 1.95mm)를 남기고 카탈로그 상한 안에서 인접 자연치 절단선을 따른다.
  const isLateralIncisor = tpl.kind === "incisor" && ownFdi?.pos === 2;
  const incisorCutbackMm = isLateralIncisor
    ? clamp(tpl.crownOcclusalMm * 1.18, 1.85, 2.05)
    : clamp(tpl.crownOcclusalMm * 0.78, 1.25, 1.45);
  const antIncisalCap =
    !posterior && Number.isFinite(archCrownTopH)
      ? archCrownTopH -
        (tpl.kind === "incisor" ? incisorCutbackMm : Math.max(desiredOccThickness, tpl.crownOcclusalMm * 0.88))
      : Infinity;
  const neighborHeightCap = Number.isFinite(archCrownTopH)
    ? archCrownTopH - (tpl.kind === "incisor" ? incisorCutbackMm : desiredOccThickness)
    : Infinity;
  const maxDefaultPostAdd = posterior ? 3.0 : tpl.kind === "incisor" ? (isLateralIncisor ? -0.45 : 1.05) : 2.2;
  const baseCap = hasOpposing
    ? Math.min(
        tpl.postHeightMm + (posterior ? 4.5 : tpl.kind === "incisor" ? (isLateralIncisor ? 0.35 : 1.05) : 2.2),
        antIncisalCap,
      )
    : Math.min(tpl.postHeightMm + maxDefaultPostAdd, neighborHeightCap);
  const hasExplicitClearance =
    args.params?.occlusalClearanceMm != null && Number.isFinite(Number(args.params.occlusalClearanceMm));
  const minClearanceFloor = hasExplicitClearance
    ? Math.min(CROWN_THICKNESS_FLOOR_MM, clearance)
    : CROWN_THICKNESS_FLOOR_MM;
  let postTopMax = Math.max(
    minSafePostHeightMm,
    hasOpposing
      ? oppRefH - clearance + Math.max(0, offsetH) + 4.0
      : baseCap + offsetH,
  );
  const noOppTop = Number.isFinite(archCrownTopH) ? baseCap : Math.min(baseCap, tpl.postHeightMm);
  // 대합치가 있으면 대합 거리(기본 1.5mm, 최소 0.7mm)를 1순위로 잡아 포스트 높이를 먼저 결정한다.
  let postTopH =
    (hasOpposing
      ? posterior || hasExplicitClearance
        ? oppRefH - clearance
        : Math.min(antIncisalCap, oppRefH - clearance)
      : noOppTop) + offsetH;
  if (hasOpposing && offsetH <= 0) postTopH = Math.min(postTopH, oppRefH - clearance);
  postTopH = Math.max(minSafePostHeightMm, postTopH);
  if (hasOpposing) {
    // 뼈대 최소 높이(2.2mm)에서도 최소 크라운 두께(또는 명시 대합 거리 하한)는 반드시 남긴다.
    postTopH = Math.min(postTopH, Math.max(1.8, oppRefH - minClearanceFloor));
  }
  // 절치 딥바이트·수평피개: 설측 대합만 가깝고 순측이 비어 있거나 멀면 포스트 전체를 짧게 만들지 않는다.
  // 순측 절단 높이는 인접 자연치 기준(baseCap)과 순측 대합 거리 중 낮은 쪽까지 올리고, 설측은 사선으로 비운다.
  let incisorDeepBite = false;
  let incisorShovelScale = 1;
  let incisorNeighborBevelDeg = 0;
  let incisorPalatalOppH = Infinity;
  let incisorPalatalContactU = -4;
  let incisorLabialClearTopH = Infinity;
  if (tpl.kind === "incisor") {
    const neighborShovel = measureAdjacentIncisorShovel(
      jawLocalPts,
      c0,
      frame,
      Math.max(2.2, marginB),
      { radius: sbR, height: sbH },
      tpl.occlusalBlMm,
    );
    if (neighborShovel) {
      incisorShovelScale = clamp(neighborShovel.incisalBlMm / Math.max(3.2, tpl.occlusalBlMm), 0.84, 1.16);
      incisorNeighborBevelDeg = neighborShovel.lingualBevelDeg;
    }
    if (hasOpposing && oppField && !hasExplicitClearance) {
      const labialOppH = opposingBandMinHeight(oppField, 0.45, 2.8, 1.8);
      const palatalOppH = opposingBandMinHeight(oppField, -3.8, 0.15, 2.0);
      if (Number.isFinite(labialOppH)) {
        incisorLabialClearTopH = Math.max(minSafePostHeightMm, labialOppH - clearance);
      }
      if (
        Number.isFinite(palatalOppH) &&
        (!Number.isFinite(labialOppH) || palatalOppH + 0.55 < labialOppH)
      ) {
        const neighborTop = Number.isFinite(baseCap) ? baseCap : tpl.postHeightMm;
        const labialTop = Number.isFinite(labialOppH)
          ? Math.min(labialOppH - clearance, labialOppH - minClearanceFloor)
          : Infinity;
        const raised = Math.max(minSafePostHeightMm, Math.min(neighborTop + offsetH, labialTop));
        incisorDeepBite = true;
        incisorPalatalOppH = palatalOppH;
        const contactCeil = Number.isFinite(labialOppH)
          ? labialOppH - 0.55
          : Math.max(palatalOppH + 2.6, raised + clearance + 0.8);
        let contactU = -4;
        for (const cell of oppField.list) {
          if (Math.abs(cell.v) > 2.2) continue;
          if (cell.h < contactCeil && cell.u > contactU) contactU = cell.u;
        }
        incisorPalatalContactU = Number.isFinite(labialOppH) ? contactU : Math.min(contactU, 0.35);
        if (raised > postTopH + 0.25) {
          postTopH = raised;
          postTopMax = Math.max(postTopMax, postTopH + 0.45);
        }
      }
    }
  }
  // 구치는 대합 거리까지 윗면이 올라가고, 전치는 이미 잡은 postTopH가 자연 높이다.
  const effClearTopH = incisorDeepBite
    ? incisorLabialClearTopH
    : hasOpposing && Number.isFinite(oppRefH)
      ? Math.max(minSafePostHeightMm, oppRefH - clearance)
      : Infinity;
  const naturalTopH = posterior && Number.isFinite(effClearTopH) ? effClearTopH : postTopH;
  const archSafeCapH = !posterior && Number.isFinite(baseCap) ? baseCap + 0.35 : Infinity;
  const safeTopH = Math.min(
    archSafeCapH,
    Number.isFinite(effClearTopH) ? Math.max(effClearTopH, posterior ? 0 : postTopH) : Infinity,
  );
  if (mode.probeHeight) return { kind: "height", naturalTopH, safeTopH, oppClearTopH: effClearTopH };
  let bridgeMatchedTopH: number | null = null;
  if (Math.abs(offsetH) <= 0.05) {
    const mates = bridgeAbutmentMates(fixture, args.neighbors, args.toothWorks);
    if (mates.length > 0) {
      const probed = await Promise.all(
        mates.map((mate) =>
          probeBridgePostTop({
            ...args,
            fixture: mate,
            neighbors: [fixture, ...(args.neighbors ?? []).filter((n) => n.toothNumber !== mate.toothNumber)],
          }),
        ),
      );
      const matched = resolveBridgeMatchedTopH([
        { naturalTopH, safeTopH, oppClearTopH: effClearTopH },
        ...probed,
      ]);
      if (matched != null && Number.isFinite(matched)) {
        const applied = Math.min(safeTopH, Math.max(minSafePostHeightMm, matched));
        postTopH = applied;
        postTopMax = applied;
        bridgeMatchedTopH = applied;
      }
    }
  }
  // 높이·테이퍼 연결(postTaperLink=1)이면 포스트 높이·축벽 둘레와 싱글/브리지에 맞춰 접착 지수가 같은 테이퍼를 쓴다.
  // 연결이 끊어져 있으면(postTaperLink=0) 설정된 테이퍼(최소 2°)를 그대로 쓴다.
  const bridgeRetention = resolveToothBridgeRetentionContext(fixture.toothNumber, args.toothWorks);
  const taperSpec = resolveAbutmentBridgeRetentionSpec(bridgeRetention);
  const isTaperLinked = (params.postTaperLink ?? 1) >= 0.5;
  const templateWallRadiusMm = Math.max(
    1.1,
    (((tpl.topLabialHalfMm + tpl.topLingualHalfMm) / 2 + tpl.topMdMm / 2) / 2) *
      Math.max(0.7, params.postWidthScale),
  );
  let axialWallRadiusMm = templateWallRadiusMm;
  let effectiveTaperDeg = clamp(
    isTaperLinked
      ? computeOptimalPostTaperDeg(postTopH, bridgeRetention, { radiusMm: axialWallRadiusMm })
      : params.postTaperDeg,
    isTaperLinked ? taperSpec.minTaperDeg : RETENTION_SINGLE_MIN_TAPER_DEG,
    taperSpec.maxTaperDeg,
  );
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
    if (Math.hypot(p[0], p[1]) < sbR + 0.4 && p[2] > -0.4 && p[2] < sbH + 0.65) continue;
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
    // 치관 상방(h ≥ 1.8mm)에서 좁은 전치·견치 인접벽이나 변연융기가 삽입축 안쪽으로 들어와도 누락하지 않는다.
    const minScanR = h >= 1.8 ? 0.55 : Math.max(1.65, sbR + 0.4);
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

  const hasUserExplicitMarginDepth =
    args.explicitParams !== undefined
      ? [
          args.explicitParams?.marginDepthMm,
          args.explicitParams?.marginSubgMinMm,
          args.explicitParams?.marginSubgMaxMm,
        ].some((v) => v != null && Number.isFinite(Number(v)))
      : [args.params?.marginDepthMm, args.params?.marginSubgMinMm, args.params?.marginSubgMaxMm].some(
          (v) => v != null && Number.isFinite(Number(v)),
        );

  // 인접치와의 최소 크라운 공간(≥0.5mm)을 확보하려 할 때 치은연하 마진에서는 긴 포스트 테이퍼와 스크류 홀 때문에
  // 포스트 벽 두께가 0.3mm 미만으로 얇아져 부러질 위험이 있으면, 인접치처럼 치은 연상(-1.5 ~ -2.0mm)으로 올려 재설계한다.
  if (
    !mode.probeAxis &&
    !mode.supragingivalRetried &&
    !mode.forbidSupragingivalRetry &&
    !hasUserExplicitMarginDepth &&
    subgMin > -1.2
  ) {
    const estTopRound = tpl.anterior ? TOP_ROUND_ANTERIOR_MM : TOP_ROUND_POSTERIOR_MM;
    const hCheckStart = Math.max(1.2, chamfer.height + 0.65);
    // 절치는 스크류 채널이 설측 사선으로 열리므로(360° 칼라 아님) 치경부 칼라 구간만 강도를 검사해 불필요한 치은연상 노출을 막는다.
    const hCheckEnd =
      tpl.kind === "incisor"
        ? Math.max(hCheckStart + 0.4, Math.min(2.8, postTopH * 0.45))
        : Math.max(hCheckStart + 0.6, postTopH - estTopRound * 0.9);
    const axialCosCheck = Math.max(frame.w[2], 0.25);
    const taperCheckSlope = Math.tan(
      Math.max(RETENTION_SINGLE_MIN_TAPER_DEG, effectiveTaperDeg) * DEG,
    );
    const uScTopCheck = (hCheckEnd / axialCosCheck) * frame.uLabial[2];
    const vScTopCheck = (hCheckEnd / axialCosCheck) * frame.vSide[2];
    let tightHits = 0;
    let worstCrownSpaceMm = Infinity;
    const sampleSteps = 10;
    const degOffsets = [-28, -18, -9, 0, 9, 18, 28];
    for (let s = 0; s <= sampleSteps; s += 1) {
      const h = hCheckStart + ((hCheckEnd - hCheckStart) * s) / sampleSteps;
      const zAtH = meanMarginZ + h / axialCosCheck;
      const boreAtH = resolveScrewChannelProfile(
        conn,
        meanMarginZ + postTopH / axialCosCheck,
      ).radiusAtZ(zAtH);
      const uSc = (h / axialCosCheck) * frame.uLabial[2];
      const vSc = (h / axialCosCheck) * frame.vSide[2];
      const taperAdd = taperCheckSlope * Math.max(0, hCheckEnd - h);
      let sampleTight = false;
      for (const sideSign of [1, -1] as const) {
        const isMesialSide = sideSign * mesialSignOnV >= 0;
        const sideAllow = isMesialSide ? mesialAllowance : distalAllowance;
        if (sideAllow.wallMm > 0) continue;
        if (!isMesialSide && isWisdomTooth) continue;
        const basePhi = sideSign > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
        for (const degOff of degOffsets) {
          const phi = basePhi + degOff * DEG;
          const rawAdj = scanLimitAt(phi, h);
          if (!Number.isFinite(rawAdj)) continue;
          const du = Math.cos(phi);
          const dv = Math.sin(phi);
          const reqHere = rayCircleRadius(
            uSc,
            vSc,
            boreAtH + MIN_FRACTURE_SAFE_POST_WALL_MM + 0.02,
            du,
            dv,
          );
          const reqFromTop =
            rayCircleRadius(
              uScTopCheck,
              vScTopCheck,
              boreTopR + MIN_FRACTURE_SAFE_POST_WALL_MM + 0.02,
              du,
              dv,
            ) + taperAdd;
          const availCrownMm = rawAdj - Math.max(reqHere, reqFromTop);
          if (availCrownMm < worstCrownSpaceMm) worstCrownSpaceMm = availCrownMm;
          if (availCrownMm < MIN_STRIP_CROWN_WALL_MM) sampleTight = true;
        }
      }
      if (sampleTight) tightHits += 1;
    }
    if (tightHits >= 2 && worstCrownSpaceMm < MIN_STRIP_CROWN_WALL_MM) {
      const estCurrAboveRim = meanMarginZ - medianRimZ;
      const maxAllowAboveRim = hasOpposing
        ? clamp(
            estCurrAboveRim + (postTopH - 3.2) / Math.max(frame.w[2], 0.35),
            0.6,
            -SUPRAGINGIVAL_STRENGTH_MIN_MM,
          )
        : -SUPRAGINGIVAL_STRENGTH_MIN_MM;
      if (maxAllowAboveRim > -subgMin + 0.35) {
        const nextSubgMin = -Math.round(maxAllowAboveRim * 10) / 10;
        const nextSubgMax = Math.min(
          SUPRAGINGIVAL_STRENGTH_MAX_MM,
          -Math.round(Math.max(0.5, maxAllowAboveRim - 0.5) * 10) / 10,
        );
        return designImpl(
          {
            ...args,
            params: {
              ...(args.params ?? {}),
              marginDepthMm: nextSubgMin,
              marginSubgMinMm: nextSubgMin,
              marginSubgMaxMm: Math.max(nextSubgMin, nextSubgMax),
            },
          },
          { ...mode, supragingivalRetried: true },
        );
      }
    }
  }
  const supragingivalRaisedForStrength = Boolean(mode.supragingivalRetried);

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

  // 인접 자연치·기성 어벗(스캔에 이미 찍힌 기둥)이 피니시라인 및 크라운 장착 경로와 닿지 않도록
  // 치간유두 위쪽으로 솟은 실제 인접 치관 중체 풍융부(치은선 기준 2.6~5.8mm) 외벽 거리를 잰다.
  const isSupragingivalMargin = supragingivalRaisedForStrength || subgMin <= -1.2;
  const adjCoreMaxAboveMargin = new Float32Array(LIMIT_PHI_BINS).fill(-Infinity);
  const adjEquatorWallR = new Float32Array(LIMIT_PHI_BINS).fill(Infinity);
  const adjCervicalWallR = new Float32Array(LIMIT_PHI_BINS).fill(Infinity);
  const supraGingivalOffsetEst = Math.max(0, -subgMin);
  for (let i = 0; i < jawLocalPts.length; i += 3) {
    const p: Vec3 = [jawLocalPts[i]!, jawLocalPts[i + 1]!, jawLocalPts[i + 2]!];
    const cylR = Math.hypot(p[0], p[1]);
    if (cylR < sbR + 0.68 && p[2] > -0.5 && p[2] < sbH + 0.95) continue;
    const rel = sub3(p, c0);
    const hInFrame = dot3(rel, frame.w);
    const u = dot3(rel, frame.uLabial);
    const v = dot3(rel, frame.vSide);
    const r = Math.hypot(u, v);
    if (r < (isSupragingivalMargin ? 1.65 : 2.15) || r > 7.8) continue;
    const phi = Math.atan2(v, u);
    const thetaFix = Math.atan2(p[1], p[0]);
    const localMarginZ = evalPeriodicSmooth(smoothMarginZ, thetaFix);
    const h0Est = (localMarginZ - meanMarginZ) * frame.w[2];
    const hAboveMargin = hInFrame - h0Est;
    const hAboveGing = hAboveMargin + supraGingivalOffsetEst * frame.w[2];
    if (hAboveGing < 0.8 || hAboveGing > 11.5) continue;
    const isDistalOfWisdom = hasDistalRetromolarPad && v * mesialSignOnV < -0.35;
    if (isDistalOfWisdom || Math.abs(Math.sin(phi)) < Math.sin(42 * DEG)) continue;
    const pb = Math.min(
      LIMIT_PHI_BINS - 1,
      Math.floor((wrapAngle(phi) / (Math.PI * 2)) * LIMIT_PHI_BINS),
    );
    if (r <= 6.8 && hAboveGing > adjCoreMaxAboveMargin[pb]!) {
      adjCoreMaxAboveMargin[pb] = hAboveGing;
    }
    if (hAboveMargin >= -0.25 && hAboveMargin <= 1.25 && r < adjCervicalWallR[pb]!) {
      adjCervicalWallR[pb] = r;
    }
    const eqLo = isSupragingivalMargin ? 2.2 : 3.2;
    const eqHi = isSupragingivalMargin ? 6.4 : 5.6;
    if (hAboveGing >= eqLo && hAboveGing <= eqHi && hAboveMargin >= -0.25 && r < adjEquatorWallR[pb]!) {
      adjEquatorWallR[pb] = r;
    }
  }
  const designVariant: CustomAbutmentConflictVariant = mode.variant ?? "space_fill";
  const isStrictSubgVariant = designVariant === "strict_subg" || designVariant === "fixture_axis";
  const spaceFillFactor =
    isStrictSubgVariant ? 0 : designVariant === "space_moderate" ? 0.55 : 1;

  const adjacentMarginCapAt = (phi: number) => {
    const pb = Math.floor((wrapAngle(phi) / (Math.PI * 2)) * LIMIT_PHI_BINS);
    let bestEquator = Infinity;
    let bestCervical = Infinity;
    for (let dp = -2; dp <= 2; dp += 1) {
      const pp = (pb + dp + LIMIT_PHI_BINS) % LIMIT_PHI_BINS;
      if (adjCoreMaxAboveMargin[pp]! < 3.4) continue;
      if (adjEquatorWallR[pp]! < bestEquator) bestEquator = adjEquatorWallR[pp]!;
      if (adjCervicalWallR[pp]! < bestCervical) bestCervical = adjCervicalWallR[pp]!;
    }
    if (!Number.isFinite(bestEquator) && !Number.isFinite(bestCervical)) return Infinity;
    // 인접 자연치가 멀리(예: r ≈ 7.4mm) 있는데 가까이(r ≈ 3.0mm) 무치악 치조제 잇몸 능선이 있는 경우,
    // 치은 연하 엄수 후보(strict_subg)에서는 그 치은 능선 침범을 막고,
    // 인접 공간 균형 후보(space_fill)에서는 실제 치관 최대풍융부 바로 아래(1.25mm 이내)에 이어진 치경부 벽만 치아 벽으로 인정한다.
    if (
      !isStrictSubgVariant &&
      Number.isFinite(bestEquator) &&
      Number.isFinite(bestCervical) &&
      bestCervical < bestEquator - 1.25
    ) {
      bestCervical = Infinity;
    }
    const extraNeighborWall = sideAllowanceOf(phi).wallMm;
    const stripMarginRelief =
      extraNeighborWall <= 0 && isSupragingivalMargin ? MAX_ADJACENT_ENAMELOPLASTY_MM : 0;
    const postClearanceAtEquator = Math.max(
      0.48,
      Math.max(0.62, params.minCrownThicknessMm - 0.36) - stripMarginRelief,
    );
    const chamferInsetAllowance = clamp(shoulderW * 0.85, 0.22, 0.42);
    const equatorMarginClearance =
      extraNeighborWall + Math.max(0.08, postClearanceAtEquator - chamferInsetAllowance);
    const capFromEquator = Number.isFinite(bestEquator)
      ? bestEquator - equatorMarginClearance
      : Infinity;
    const capFromCervical = Number.isFinite(bestCervical)
      ? bestCervical - extraNeighborWall - Math.max(0.24, 0.36 - stripMarginRelief * 0.5)
      : Infinity;
    const effCervicalCap =
      spaceFillFactor > 0 && spaceFillFactor < 1 && Number.isFinite(capFromCervical) && Number.isFinite(capFromEquator)
        ? capFromCervical + (capFromEquator - capFromCervical) * spaceFillFactor
        : capFromCervical;
    return Math.max(boreTopR + 0.36, Math.min(capFromEquator, effCervicalCap));
  };

  // 마진 반경: 정상 크라운(ToothAnatomy)보다 편측 ~1.0mm 내외 작게 잡되,
  // 치종 해부 단면(대구치 둥근 사각형, 소구치 사다리꼴-계란형, 견치 둥근 역삼각형/마름모, 절치 순측호-난원형)의 중심(mCu, mCv)과
  // 반축(mHalfBl, mHalfMd)만 인접 유격·커프 플레어 한도 안에서 맞춰 100% 볼록 해부 단면을 유지한다.
  const meanTemplateR = (marginA + marginB) / 2;
  const uniformTissueScale = Number.isFinite(medianTissueR)
    ? clamp(
        1 + 0.25 * (medianTissueR / Math.max(meanTemplateR, 1) - 1),
        0.95,
        1.0,
      )
    : 1;
  const emergeHalfBl = natHalfBl * (tpl.kind === "molar" ? 0.77 : posterior ? 0.82 : 0.85);
  const emergeHalfMd = crownHalfMd * (tpl.kind === "molar" ? 0.81 : posterior ? 0.84 : 0.88);
  const crownWeight = posterior ? 0.72 : 0.62;
  const maxFlareSlope = Math.tan((posterior ? 50 : 40) * DEG);
  const crownMinus1Bl = Math.max(
    minMarginRadius,
    (natHalfBl - params.minCrownThicknessMm + 0.1) * params.marginSizeScale,
  );
  const crownMinus1Md = Math.max(
    boreTopR + 0.45,
    (crownHalfMd - params.minCrownThicknessMm + 0.1) * params.marginSizeScale,
  );
  const maxAnatHalfBl = Math.min(
    (tpl.maxMarginBlMm / 2) * params.marginSizeScale,
    posterior ? (tpl.maxMarginBlMm / 2) * params.marginSizeScale : crownMinus1Bl,
  );
  const maxAnatHalfMd = Math.min(
    (tpl.maxMarginMdMm / 2) * params.marginSizeScale,
    posterior ? (tpl.maxMarginMdMm / 2) * params.marginSizeScale : crownMinus1Md,
  );

  const floorMarginMd = posterior ? minMarginRadius + 0.08 : Math.max(boreTopR + 0.44, coneTopR + 0.22);
  const floorMarginBl = posterior ? minMarginRadius + 0.08 : Math.max(boreTopR + 0.48, coneTopR + 0.26);
  // 구치부는 기존 출현부 공식을 유지하고, 전치·견치는 정상 크라운 반폭(natHalfBl, crownHalfMd)보다
  // 편측 크라운 두께(~1.0mm 내외)만큼 작게 피니시라인 반폭을 잡는다(이중 축소 방지).
  const cutbackBl = posterior
    ? Math.max(
        floorMarginBl,
        (emergeHalfBl - params.minCrownThicknessMm + shoulderW * 0.55) * params.marginSizeScale,
      )
    : Math.max(
        floorMarginBl,
        (natHalfBl - params.minCrownThicknessMm + shoulderW * 0.4) * params.marginSizeScale,
      );
  const cutbackMd = posterior
    ? Math.max(
        floorMarginMd,
        (emergeHalfMd - params.minCrownThicknessMm + shoulderW * 0.55) * params.marginSizeScale,
      )
    : Math.max(
        floorMarginMd,
        (crownHalfMd - params.minCrownThicknessMm + shoulderW * 0.3) * params.marginSizeScale,
      );
  let mHalfBl = clamp(
    marginA * uniformTissueScale * (1 - crownWeight) + cutbackBl * crownWeight,
    floorMarginBl,
    Math.max(floorMarginBl, maxAnatHalfBl),
  );
  let mHalfMd = clamp(
    marginB * uniformTissueScale * (1 - crownWeight) + cutbackMd * crownWeight,
    floorMarginMd,
    Math.max(floorMarginMd, maxAnatHalfMd),
  );
  // 픽스쳐가 발치와 한쪽으로 치우쳐 인접 치아까지 빈 공간이 많이 남는 경우(예: #37 픽스쳐가 원심에 있고 #36까지 7.4mm),
  // 인접 공간 균형 후보(space_fill)는 남는 인접 공간 쪽으로 마진 반폭과 중심을 자연스럽게 넓혀 과도한 캔틸레버를 줄인다.
  const posToothReachOnV =
    crownSideSign > 0 ? (toothPos ? reachPos : Number.NaN) : toothNeg ? reachNeg : Number.NaN;
  const negToothReachOnV =
    crownSideSign > 0 ? (toothNeg ? reachNeg : Number.NaN) : toothPos ? reachPos : Number.NaN;
  const idealCrownClearMm = Math.max(1.25, params.minCrownThicknessMm + 0.3);
  const rawPosExcess = Number.isFinite(posToothReachOnV)
    ? Math.max(0, posToothReachOnV - idealCrownClearMm - mHalfMd)
    : 0;
  const rawNegExcess = Number.isFinite(negToothReachOnV)
    ? Math.max(0, negToothReachOnV - idealCrownClearMm - mHalfMd)
    : 0;
  const maxProximalExcessMm = Math.max(rawPosExcess, rawNegExcess);
  const hasWideProximalSpace = tpl.kind !== "premolar" && maxProximalExcessMm >= 0.85;

  if (spaceFillFactor > 0 && hasWideProximalSpace) {
    const extraHalfMd = Math.min(0.82, maxProximalExcessMm * 0.45) * spaceFillFactor;
    mHalfMd = clamp(
      mHalfMd + extraHalfMd,
      floorMarginMd,
      Math.max(floorMarginMd, maxAnatHalfMd + 0.58 * spaceFillFactor),
    );
    if (posterior) {
      const extraHalfBl = Math.min(0.42, extraHalfMd * 0.55);
      mHalfBl = clamp(
        mHalfBl + extraHalfBl,
        floorMarginBl,
        Math.max(floorMarginBl, maxAnatHalfBl + 0.36 * spaceFillFactor),
      );
    }
  }
  if (tpl.kind === "premolar") {
    mHalfMd = Math.max(minMarginRadius + 0.08, Math.min(mHalfMd, mHalfBl / 1.14));
  }
  const targetMarginAspect = mHalfBl / Math.max(mHalfMd, 0.5);
  const baseComfortShift = tpl.kind === "premolar" ? 0.18 : posterior ? 0.28 : 0.55;
  const spaceExtraShift =
    spaceFillFactor > 0 && hasWideProximalSpace
      ? Math.min(0.95, maxProximalExcessMm * 0.48) * spaceFillFactor
      : 0;
  const maxComfortShift = baseComfortShift + spaceExtraShift;
  let mCu = clamp(
    crownCenterU * (posterior ? 0.32 : 0.38),
    tpl.kind === "premolar" ? -0.18 : -0.65,
    tpl.kind === "premolar" ? 0.28 : 0.65,
  );
  const shiftGainV =
    spaceFillFactor > 0 && hasWideProximalSpace
      ? (posterior ? 0.28 : 0.48) + 0.36 * spaceFillFactor
      : posterior
        ? 0.28
        : 0.48;
  let mCv = clamp(
    crownCenterV * crownSideSign * shiftGainV,
    -maxComfortShift,
    maxComfortShift,
  );
  // 대합 거리·포스트 높이·테이퍼·챔퍼 R을 바꿔도 마진 외경과 깊이가 흔들리지 않도록
  // 마진·베이스 기하의 기준 높이는 스캔 대합 기준 고정 높이(refBasePostTopH)로 잡는다.
  const defaultRefClearance = resolveCustomAbutmentParams(fixture.toothNumber).occlusalClearanceMm;
  const refBasePostTopH = (() => {
    const refClear = defaultRefClearance;
    const rawRef = hasOpposing
      ? posterior
        ? oppRefH - refClear
        : Math.min(
            Number.isFinite(archCrownTopH)
              ? archCrownTopH - Math.max(1.35, tpl.crownOcclusalMm * 0.88)
              : Infinity,
            oppRefH - refClear,
          )
      : noOppTop;
    const bounded = Math.max(minSafePostHeightMm, rawRef);
    return hasOpposing
      ? Math.min(bounded, Math.max(1.8, oppRefH - CROWN_THICKNESS_FLOOR_MM))
      : bounded;
  })();
  const refBaseTaperDeg = Math.max(
    RETENTION_SINGLE_MIN_TAPER_DEG,
    computeOptimalPostTaperDeg(refBasePostTopH, bridgeRetention, { radiusMm: axialWallRadiusMm }),
  );
  const refBaseTaperSlope = Math.tan(refBaseTaperDeg * DEG);
  const refBaseChamfer = chamferGeometry(shoulderW, 0.6, refBaseTaperSlope);

  // 구치부는 경사진 임플란트에서 포스트가 솔리드로 스크류 채널을 감싸면서도 4방위 마진 폭이 일정하도록
  // 마진 중심·반축이 처음부터 스크류 채널 + 최소 벽 + 균일 마진 폭을 함께 품고 출발한다.
  if (posterior) {
    const estAxCos = Math.max(frame.w[2], 0.25);
    const estHTop = Math.max(2.6, refBasePostTopH - topRoundMm * 0.85);
    const estSpan = Math.max(0.8, estHTop - refBaseChamfer.height);
    const estTaper = refBaseTaperSlope * estSpan;
    const estWall = boreTopR + SCREW_WALL_MM;
    const estUScrewTop = (estHTop / estAxCos) * frame.uLabial[2];
    const estVScrewTop = (estHTop / estAxCos) * frame.vSide[2];
    const estUScrewBase = (refBaseChamfer.height / estAxCos) * frame.uLabial[2];
    const estVScrewBase = (refBaseChamfer.height / estAxCos) * frame.vSide[2];
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
    const localMarginZ = evalPeriodicSmooth(smoothMarginZ, theta);
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
    const cuffCap = Math.max(minMarginRadius * projLen, cuffHardMaxR * projLen);
    const hardConnFloor = posterior
      ? minMarginRadius * projLen
      : Math.max(boreTopR + 0.36, (coneTopR + 0.14) * projLen);
    const otherCap = Math.max(
      hardConnFloor,
      Math.min(adjacentMarginCapAt(phiInFrame), cuffCap),
    );
    marginCap.push(Math.min(planeMarginCap, otherCap));
  }

  // 4방위 유격(협·설·근·원심)을 먼저 재서 중심(mCu, mCv)을 여유 있는 쪽으로 옮기고 양쪽 반축을 대칭으로 맞춘다.
  {
    const minPhysicalHalf = Math.min(
      minMarginRadius,
      Math.max(boreTopR + 0.36, Math.min(...marginCap) - 0.02),
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
    const estMarginAxCos = Math.max(frame.w[2], 0.25);
    const estMarginTopH = Math.max(2.2, refBasePostTopH - topRoundMm * 0.85);
    const estMarginSpan = Math.max(0.6, estMarginTopH - refBaseChamfer.height);
    const estMinMarginWall = boreTopR + MIN_POST_WALL_MM + 0.22 + refBaseTaperSlope * estMarginSpan;
    const reqPosU = posterior
      ? Math.max(boreTopR + 0.36, (estMarginTopH / estMarginAxCos) * frame.uLabial[2] + estMinMarginWall)
      : Math.max(boreTopR + 0.38, (refBaseChamfer.height / estMarginAxCos) * frame.uLabial[2] + boreTopR + 0.42);
    const reqNegU = posterior
      ? Math.max(boreTopR + 0.36, -(estMarginTopH / estMarginAxCos) * frame.uLabial[2] + estMinMarginWall)
      : Math.max(boreTopR + 0.38, -(refBaseChamfer.height / estMarginAxCos) * frame.uLabial[2] + boreTopR + 0.42);
    const reqPosV = posterior
      ? Math.max(boreTopR + 0.36, (estMarginTopH / estMarginAxCos) * frame.vSide[2] + estMinMarginWall)
      : Math.max(boreTopR + 0.38, (refBaseChamfer.height / estMarginAxCos) * frame.vSide[2] + boreTopR + 0.42);
    const reqNegV = posterior
      ? Math.max(boreTopR + 0.36, -(estMarginTopH / estMarginAxCos) * frame.vSide[2] + estMinMarginWall)
      : Math.max(boreTopR + 0.38, -(refBaseChamfer.height / estMarginAxCos) * frame.vSide[2] + boreTopR + 0.42);
    const fitAxis1D = (
      curC: number,
      curHalf: number,
      capPos: number,
      capNeg: number,
      reqPos: number,
      reqNeg: number,
    ) => {
      const availSpan = capPos + capNeg;
      if (availSpan < minPhysicalHalf * 1.6) {
        const mid = Number.isFinite(availSpan) ? (capPos - capNeg) * 0.5 : curC;
        return { c: clamp(mid, -1.35, 1.35), half: Math.max(minPhysicalHalf, availSpan * 0.5) };
      }
      // 한쪽(예: 인접 임플란트 경계)만 좁고 반대쪽(원심 등)이 열려 있을 때 중심을 열린 쪽으로 과도하게 밀면
      // #25·#37처럼 원심으로 배가 불룩 튀어나오므로, 스크류 홀 벽 두께(reqPos/reqNeg) 확보에 꼭 필요한 만큼만 옮기고
      // 나머지는 반폭을 대칭으로 줄여 단면의 중심 균형과 해부 비율을 지킨다.
      const boundReqPos = Number.isFinite(capPos) ? Math.min(capPos, reqPos) : reqPos;
      const boundReqNeg = Number.isFinite(capNeg) ? Math.min(capNeg, reqNeg) : reqNeg;
      let extPos = Math.max(boundReqPos, Math.min(capPos, curC + curHalf));
      let extNeg = Math.max(boundReqNeg, Math.min(capNeg, -curC + curHalf));
      const maxAsym =
        posterior && !(spaceFillFactor > 0 && hasWideProximalSpace)
          ? maxComfortShift * 1.6
          : maxComfortShift * 2;
      if (extPos > extNeg + maxAsym) {
        extPos = Math.max(boundReqPos, extNeg + maxAsym);
      } else if (extNeg > extPos + maxAsym) {
        extNeg = Math.max(boundReqNeg, extPos + maxAsym);
      }
      const nextC = clamp((extPos - extNeg) * 0.5, -1.35, 1.35);
      const nextHalf = Math.max(
        minPhysicalHalf,
        Math.min((extPos + extNeg) * 0.5, capPos - nextC, nextC + capNeg),
      );
      return { c: nextC, half: nextHalf };
    };
    const fitU = fitAxis1D(mCu, mHalfBl, capPosU, capNegU, reqPosU, reqNegU);
    const fitV = fitAxis1D(mCv, mHalfMd, capPosV, capNegV, reqPosV, reqNegV);
    mCu = fitU.c;
    mHalfBl = fitU.half;
    mCv = fitV.c;
    mHalfMd = fitV.half;
    if (tpl.kind === "premolar") {
      const minMdForScrew = Math.max(reqPosV - mCv, reqNegV + mCv, minPhysicalHalf);
      mHalfMd = Math.min(mHalfMd, Math.max(minMdForScrew, mHalfBl / 1.12));
    }

    // 대각선 등 모든 열에서 marginCap 안쪽에 완전히 들어오도록 사각형/타원 반축과 중심을 비례 조정한다(모서리 깎기 금지 → 볼록 곡선 유지).
    for (let iter = 0; iter < 16; iter += 1) {
      const innerFloor = Math.min(minMarginRadius * 0.94, Math.max(boreTopR + 0.34, Math.min(mHalfBl, mHalfMd) - 1.25));
      const innerAllow = Math.max(0.12, Math.min(mHalfBl, mHalfMd) - innerFloor + 0.04);
      const maxShift = Math.max(0.12, Math.min(Math.min(mHalfBl, mHalfMd) * 0.82, Math.max(innerAllow, 1.25)));
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
          const shift = Math.min(oppSlack * 0.65, rawExMm * 0.65, 0.14);
          const candCu = mCu - worstDu * shift;
          const candCv = mCv - worstDv * shift;
          const needScrewShift =
            mHalfBl - rawExMm < Math.max(reqPosU - mCu, reqNegU + mCu) ||
            mHalfMd - rawExMm < Math.max(reqPosV - mCv, reqNegV + mCv);
          if (needScrewShift || Math.hypot(candCu, candCv) <= maxComfortShift + 0.04) {
            mCu = candCu;
            mCv = candCv;
          }
        }
      }
      const hasTightPlane = Number.isFinite(Math.min(...marginPlaneCap)) && Math.min(...marginPlaneCap) < minMarginRadius + 0.45;
      const baseCrossDrop =
        tpl.kind === "premolar"
          ? hasTightPlane
            ? 0.1
            : 0.2
          : !posterior
            ? 0.14
            : hasTightPlane
              ? 0.18
              : 0.35;
      const dropBl = worstExcess * (baseCrossDrop + (1 - baseCrossDrop) * worstWBl) + 0.004;
      const dropMd = worstExcess * (baseCrossDrop + (1 - baseCrossDrop) * (1 - worstWBl)) + 0.004;
      mHalfBl = Math.max(minPhysicalHalf, mHalfBl * (1 - dropBl));
      mHalfMd = Math.max(minPhysicalHalf, mHalfMd * (1 - dropMd));
      const minAspectRatio = !posterior ? 0.76 : hasTightPlane ? 0.68 : 0.82;
      const minBlByRatio = mHalfMd * targetMarginAspect * minAspectRatio;
      const minMdByRatio = (mHalfBl / Math.max(targetMarginAspect, 0.4)) * minAspectRatio;
      if (mHalfBl < minBlByRatio) mHalfMd = Math.max(minPhysicalHalf, mHalfBl / (targetMarginAspect * minAspectRatio));
      if (mHalfMd < minMdByRatio) mHalfBl = Math.max(minPhysicalHalf, (mHalfMd * targetMarginAspect) / minAspectRatio);
    }
  }

  // 편심 단면의 평평한 변 중앙을 원호(coneTopR + 0.5)로 찔러 배불뚝이를 만들지 않도록,
  // 최종 마진 광선 솔버의 안전 하한은 콘 상단 바로 바깥(coneTopR + 0.14)만 두고 커프 여유는 단면 중심 보정으로 확보한다.
  const minInitSolveMarginR = Math.min(
    minMarginRadius,
    Math.max(boreTopR + 0.34, Math.min(...marginCap) - 0.03),
  );
  const minSolveMarginR = Math.min(
    Math.max(boreTopR + 0.34, coneTopR + 0.14),
    minInitSolveMarginR,
  );
  const solveMarginRadii = (zLoop: readonly number[], zRef: number) => {
    const zCurve = buildPeriodicSmoothCurve(zLoop, 3);
    let estSh = clamp(shoulderW, 0.22, 0.85);
    let baseBlEst = Math.max(0.45, mHalfBl - estSh);
    let baseMdEst = Math.max(0.45, mHalfMd - estSh);
    let curCu = mCu;
    let curCv = mCv;
    const unitLab = toothSectionRadius(tpl.kind, "post", 1, 1, 0);
    const unitLin = toothSectionRadius(tpl.kind, "post", 1, 1, Math.PI);
    const minInitSh = clamp(shoulderW * 0.74, 0.24, 0.36);
    for (let it = 0; it < 8; it += 1) {
      const solver = buildParallelOffsetMarginSolver(
        curCu,
        curCv,
        (psi) => evalPostSectionRadiusAtPhi(tpl.kind, baseBlEst / unitLab, baseBlEst / unitLin, baseMdEst, psi),
        estSh,
      );
      let worstEx = 0;
      let worstWu = 0.5;
      let worstCol = -1;
      const curR0 = new Float64Array(ANGULAR_COLS);
      for (let col = 0; col < ANGULAR_COLS; col += 1) {
        const theta = (col / ANGULAR_COLS) * Math.PI * 2;
        const dz0 = zCurve(theta) - zRef;
        const radialFix: Vec3 = [Math.cos(theta), Math.sin(theta), 0];
        const gu = dot3(radialFix, frame.uLabial);
        const gv = dot3(radialFix, frame.vSide);
        if (Math.hypot(gu, gv) < 0.2) continue;
        const uOff = dz0 * frame.uLabial[2];
        const vOff = dz0 * frame.vSide[2];
        const rFix = solver.solveRay(uOff, vOff, gu, gv, minInitSolveMarginR).t;
        const r0Col = Math.hypot(uOff + rFix * gu, vOff + rFix * gv);
        curR0[col] = r0Col;
        const cap = marginCap[col]!;
        if (Number.isFinite(cap) && r0Col > cap + 1e-4) {
          const ex = r0Col - cap;
          if (ex > worstEx) {
            worstEx = ex;
            worstWu = colDuFix[col]! * colDuFix[col]!;
            worstCol = col;
          }
        }
      }
      if (worstEx <= 1e-4 || worstCol < 0) break;
      const oppCol = (worstCol + ANGULAR_COLS / 2) % ANGULAR_COLS;
      const oppCap = marginCap[oppCol]!;
      const oppSlack = Number.isFinite(oppCap) ? Math.max(0, oppCap - curR0[oppCol]!) : worstEx;
      let rem = worstEx;
      if (oppSlack > 0.02) {
        const shMove = Math.min(oppSlack * 0.5, rem * 0.6, 0.2);
        const nextCu = curCu - colDuFix[worstCol]! * shMove;
        const nextCv = curCv - colDvFix[worstCol]! * shMove;
        if (Math.hypot(nextCu, nextCv) <= Math.hypot(curCu, curCv) + 0.06) {
          const moved = Math.hypot(nextCu - curCu, nextCv - curCv);
          curCu = nextCu;
          curCv = nextCv;
          rem = Math.max(0, rem - moved * 0.85);
        }
      }
      const cross = tpl.kind === "premolar" ? 0.1 : !posterior ? 0.16 : 0.28;
      const nextBl = Math.max(0.75, baseBlEst - rem * (cross + (1 - cross) * worstWu));
      const nextMd = Math.max(0.75, baseMdEst - rem * (cross + (1 - cross) * (1 - worstWu)));
      const shrunk = Math.hypot(baseBlEst - nextBl, baseMdEst - nextMd);
      baseBlEst = nextBl;
      baseMdEst = nextMd;
      if (shrunk < rem * 0.45) {
        estSh = Math.max(minInitSh, estSh - (rem - shrunk) * 0.8 - 0.002);
      }
    }
    const offsetSolver = buildParallelOffsetMarginSolver(
      curCu,
      curCv,
      (psi) => evalPostSectionRadiusAtPhi(tpl.kind, baseBlEst / unitLab, baseBlEst / unitLin, baseMdEst, psi),
      estSh,
    );
    return solveSmoothOffsetMarginLoop(
      offsetSolver,
      zCurve,
      zRef,
      frame,
      minInitSolveMarginR,
      minMarginZ,
      maxMarginZ,
      occInFix,
    ).radii;
  };

  let marginRadii = solveMarginRadii(smoothMarginZ, meanMarginZ);

  // 마진 반경(marginRadii)과 예측 크라운 치경부 출현 윤곽이 확정된 뒤, 실제 치은 라인(출현 소켓 테두리·치간유두 능선)을 따라
  // 협·설측은 치은 연하 깊은 쪽으로 감추고 근·원심은 치간유두 치은선을 따라 치관 쪽으로 올라가는 스캘럽 마진을 잡는다. 최종은 얕은 끝~깊은 끝 안이다.
  const hasExplicitMarginDepth =
    hasUserExplicitMarginDepth || supragingivalRaisedForStrength;
  const baseRetentionRefMeanZ = meanMarginZ;
  const drapeMarginZForRadii = (curRadii: readonly number[]): number[] => {
    const CREST_BIN_MM = 0.35;
    const CREST_BINS = 6;
    const sectorRStart = new Array<number>(SECTORS);
    const sectorREnd = new Array<number>(SECTORS);
    const sectorCLab = new Array<number>(SECTORS);
    const sectorSMes = new Array<number>(SECTORS);
    const sectorRetromolar = new Array<boolean>(SECTORS);
    const sectorRM = new Array<number>(SECTORS);
    for (let b = 0; b < SECTORS; b += 1) {
      const theta = ((b + 0.5) / SECTORS) * Math.PI * 2;
      const ct = Math.cos(theta);
      const st = Math.sin(theta);
      const cLab = ct * labXY[0] + st * labXY[1];
      const sMes = ct * mesXY[0] + st * mesXY[1];
      const proxW = sMes * sMes;
      const isRetromolar = hasDistalRetromolarPad && sMes < -0.35;
      const rM = evalPeriodicLinear(curRadii, theta);
      sectorRM[b] = rM;
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
      const rProxEnd = Math.max(
        rM + 0.55,
        Math.min(rM + (posterior ? 1.05 : 1.25), rM * 0.4 + rCrownFix * 0.6),
      );
      sectorCLab[b] = cLab;
      sectorSMes[b] = sMes;
      sectorRetromolar[b] = isRetromolar;
      sectorRStart[b] = Math.max(sbR + 0.22, Math.min(rM - 0.32, sbR + 0.55));
      sectorREnd[b] = isRetromolar
        ? rM + 0.35
        : (rM + 0.48) * (1 - proxW) + rProxEnd * proxW;
    }

    const atMarginBuckets: number[][] = Array.from({ length: SECTORS }, () => []);
    const nearSupportCounts = new Int32Array(SECTORS);
    const crestBins: number[][][] = Array.from({ length: SECTORS }, () =>
      Array.from({ length: CREST_BINS }, () => [] as number[]),
    );
    const zScanCap = medianRimZ + (posterior ? 2.85 : 3.5);
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
      const rM = evalPeriodicLinear(curRadii, theta);
      if (r <= rM + 0.72 && z <= rawGingivaZ[b]! + 2.5) {
        nearSupportCounts[b] += 1;
      }
      if (r >= Math.max(sbR + 0.22, rM - 0.24) && r <= rM + 0.42 && z <= rawGingivaZ[b]! + 2.4) {
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

    const hasNearGingiva = Array.from({ length: SECTORS }, (_, b) => {
      const n0 = nearSupportCounts[(b - 1 + SECTORS) % SECTORS]!;
      const n1 = nearSupportCounts[b]!;
      const n2 = nearSupportCounts[(b + 1) % SECTORS]!;
      return n1 >= 2 || n0 + n1 + n2 >= 4;
    });
    const gingAtM = atMarginBuckets.map((list, b) => {
      if (list.length < 2) return Number.NaN;
      list.sort((a, c) => a - c);
      const proxW = sectorSMes[b]! * sectorSMes[b]!;
      const q = proxW > 0.35 ? 0.68 : 0.5;
      return list[Math.min(list.length - 1, Math.floor(list.length * q))]!;
    });
    fillMissingCircular(gingAtM, rimLow);

    const gingCrestRaw = crestBins.map((bins, b) => {
      // 피니시라인 근처에 잇몸이 없고 치은선이 멀리 떨어져 있는 방향에서는
      // 먼 바깥 치은 능선을 억지로 따라 올라가지 않고 주변 치은선과 완만하게 잇는다.
      if (!hasNearGingiva[b]) return Number.NaN;
      const cLab = sectorCLab[b]!;
      let crest = Number.NaN;
      let prev = Number.NaN;
      const binCap = sectorRetromolar[b] ? 2 : bins.length;
      for (let bi = 0; bi < binCap; bi += 1) {
        const list = bins[bi]!;
        if (list.length < 2) continue;
        list.sort((a, c) => a - c);
        const m = list[Math.floor(list.length * 0.55)]!;
        // 반경 0.35mm 안에 0.92mm 넘게 치솟으면 치은이 아니라 인접 자연치 법랑질 벽이므로 직전에서 멈춘다.
        if (Number.isFinite(prev) && m - prev > 0.92) break;
        // 순·협·설측에서 치은정 능선을 넘어 바깥 치조점막으로 꺾여 내려가면 능선 꼭대기를 치은 라인으로 잡는다.
        if (Math.abs(cLab) > 0.35 && Number.isFinite(crest) && m < crest - 0.18) break;
        crest = Number.isFinite(crest) ? Math.max(crest, m) : m;
        prev = m;
      }
      return crest;
    });
    fillMissingCircular(gingCrestRaw, gingAtM);

    const gingSmooth = lowPassCircular(gingCrestRaw, 3);
    // 협·설은 마진 반경 직상방 치은(gingAtM)과 치은정 중 낮은 쪽을 기준으로 노출을 막고,
    // 근·원심은 치간유두 치은선(gingSmooth)과 마진 위치 치은 중 높은 쪽을 따라 스캘럽을 살린다.
    const gingLine = Array.from({ length: SECTORS }, (_, b) => {
      const proxW = sectorSMes[b]! * sectorSMes[b]!;
      const gS = gingSmooth[b]!;
      const gM = gingAtM[b]!;
      if (!Number.isFinite(gM)) return gS;
      const flGing = Math.min(gS, gM);
      const proxGing = sectorRetromolar[b]
        ? flGing
        : Math.max(gS, Math.min(gM, gS + 0.55));
      return flGing * (1 - proxW) + proxGing * proxW;
    });

    // 협·설 치은정(cLab² 가중)을 잇는 기준선을 구해 임플란트 협설 경사와 무관하게 근·원심 치간유두 상승량을 분리한다.
    let flWSum = 0;
    let flMeanNum = 0;
    let flW2Sum = 0;
    let flSlopeNum = 0;
    for (let b = 0; b < SECTORS; b += 1) {
      const cLab = sectorCLab[b]!;
      const w = cLab * cLab;
      flWSum += w;
      flMeanNum += w * gingLine[b]!;
      flW2Sum += w * cLab * cLab;
      flSlopeNum += w * cLab * gingLine[b]!;
    }
    const flMean = flMeanNum / Math.max(flWSum, 1e-4);
    const flSlope = flSlopeNum / Math.max(flW2Sum, 1e-4);

    const defaultScallop = posterior ? 0.55 : 0.75;
    const scallopRatio = clamp(params.marginScallopMm / defaultScallop, 0, 2.4);
    const followScale = scallopRatio <= 1 ? scallopRatio : 1 + (scallopRatio - 1) * 0.25;
    const subgSpan = Math.max(0, subgMax - subgMin);
    const proxDepthRelief = Math.min(
      Math.max(subgSpan * 0.65, Math.max(0, subgMin) * 0.62),
      params.marginScallopMm * 0.65 + subgSpan * 0.4,
    );
    const extraUserProxLift = Math.max(0, params.marginScallopMm - defaultScallop) * 0.55;

    const baseMaxSpan = tpl.kind === "molar" ? 2.05 : tpl.kind === "premolar" ? 2.15 : 2.45;

    const draftZ = gingLine.map((gCrest, b) => {
      const cLab = sectorCLab[b]!;
      const sMes = sectorSMes[b]!;
      const proxW = sMes * sMes;
      const flW = cLab * cLab;
      const isRetromolar = sectorRetromolar[b]!;
      const baseDepthFl = subgMin + subgSpan * 0.72;
      const flBase = flMean + flSlope * cLab;
      const gingRise = clamp(
        gCrest - flBase,
        -0.65,
        isRetromolar ? 0.75 : baseMaxSpan,
      );
      const naturalLift = gingRise * followScale + proxDepthRelief * proxW;
      const minScallopLift =
        (isRetromolar ? Math.min(0.45, params.marginScallopMm * 0.65) : params.marginScallopMm * 0.85) *
        proxW;
      const coronalLift =
        params.marginScallopMm <= 0.02
          ? gingRise * scallopRatio
          : Math.max(naturalLift, minScallopLift);
      const zFl = flBase - baseDepthFl;
      const supragingivalLift = Math.max(0, -subgMin);
      const maxSpanAboveFl =
        (isRetromolar ? 0.95 : baseMaxSpan) + extraUserProxLift * proxW + supragingivalLift + subgSpan;
      const highCap = Math.min(maxMarginZ, zFl + maxSpanAboveFl);

      const crestSubgMin =
        subgMin < 0
          ? subgMin
          : subgMin + subgSpan * (0.55 * (1 - proxW) + 0.1 * proxW);
      const crestCeil = gCrest - crestSubgMin + extraUserProxLift * proxW;
      const flSurfaceCeil =
        subgMin < 0
          ? gingAtM[b]! + supragingivalLift
          : gingAtM[b]! - Math.min(subgMax, Math.max(subgMin, subgMin + subgSpan * 0.5));
      const ceilZ =
        flW > 0.2
          ? Math.min(highCap, crestCeil * (1 - flW * 0.7) + Math.min(crestCeil, flSurfaceCeil) * (flW * 0.7))
          : Math.min(highCap, crestCeil);
      return clamp(Math.min(zFl + coronalLift, ceilZ), minMarginZ, highCap);
    });

    const pass1 = lowPassCircular(draftZ, 3).map((mz, b) => {
      const cLab = sectorCLab[b]!;
      const sMes = sectorSMes[b]!;
      const proxW = sMes * sMes;
      const flW = cLab * cLab;
      const flBase = flMean + flSlope * cLab;
      const supragingivalLift = Math.max(0, -subgMin);
      const maxSpanAboveFl =
        (sectorRetromolar[b] ? 0.95 : baseMaxSpan) + extraUserProxLift * proxW + supragingivalLift;
      const highCap = Math.min(maxMarginZ, flBase - subgMin + maxSpanAboveFl);
      const flGuard =
        flW > 0.25 && subgMin > 0.02
          ? Math.min(gingSmooth[b]!, gingAtM[b]!) - subgMin * flW
          : Infinity;
      return clamp(Math.min(mz, flGuard), minMarginZ, highCap);
    });
    let nextMarginZ = lowPassCircular(pass1, 3).map((z, b) => {
      const bounded = clamp(z, minMarginZ, maxMarginZ);
      if (!hasNearGingiva[b]) return bounded;
      const ging = gingLine[b]!;
      if (!Number.isFinite(ging)) return bounded;
      const hi = ging - subgMin;
      const lo = ging - subgMax;
      const loZ = Math.max(minMarginZ, Math.min(lo, hi));
      const hiZ = Math.min(maxMarginZ, Math.max(lo, hi));
      return clamp(bounded, loZ, hiZ);
    });
    // 사용자가 치은 연하를 지정하지 않았고 기준 포스트 높이가 짧으면, 깊은 끝(기본 1.0mm)까지 마진을 내려 유지 높이를 채운다.
    // 대합 거리·포스트 높이 편집 시 마진 깊이가 따라 움직이지 않도록 스캔 기준 높이(refBasePostTopH)만 본다.
    if (!hasExplicitMarginDepth) {
      const axialCosM = Math.max(frame.w[2], 0.2);
      const wantMeanMarginZ =
        baseRetentionRefMeanZ + refBasePostTopH / axialCosM - (TARGET_RETENTION_POST_HEIGHT_MM + 0.2);
      for (let dropIt = 0; dropIt < 4; dropIt += 1) {
        const curMeanM = nextMarginZ.reduce((s, v) => s + v, 0) / SECTORS;
        if (curMeanM <= wantMeanMarginZ + 1e-3) break;
        const needMeanDrop = curMeanM - wantMeanMarginZ;
        let slackSectors = 0;
        for (let b = 0; b < SECTORS; b += 1) {
          const floorB = Math.max(minMarginZ, gingLine[b]! - subgMax);
          if (nextMarginZ[b]! > floorB + 0.03) slackSectors += 1;
        }
        if (slackSectors === 0) break;
        const stepDrop = Math.min(2.4, (needMeanDrop * SECTORS) / Math.max(slackSectors, 4) + 0.04);
        const shifted = nextMarginZ.map((mz, b) => {
          const maxSubgFloor = Math.max(minMarginZ, gingLine[b]! - subgMax);
          return Math.max(minMarginZ, Math.min(mz, Math.max(maxSubgFloor, mz - stepDrop)));
        });
        nextMarginZ = lowPassCircular(shifted, 3).map((mz, b) => {
          const maxSubgFloor = Math.max(minMarginZ, gingLine[b]! - subgMax);
          return clamp(Math.max(maxSubgFloor, mz), minMarginZ, maxMarginZ);
        });
      }
    }
    nextMarginZ = nextMarginZ.map((mz, b) => {
      if (!hasNearGingiva[b]) return clamp(mz, minMarginZ, maxMarginZ);
      const ging = gingLine[b]!;
      if (!Number.isFinite(ging)) return clamp(mz, minMarginZ, maxMarginZ);
      const hi = ging - subgMin;
      const lo = ging - subgMax;
      const loZ = Math.max(minMarginZ, Math.min(lo, hi));
      const hiZ = Math.min(maxMarginZ, Math.max(lo, hi));
      return clamp(mz, loZ, hiZ);
    });
    // 치은 연하 구간 클램프 뒤 스캔 삼각형 미세 요철만 걸러내고,
    // 임플란트 경사(1차)와 근·원심 고점 / 협·설 저점 치은 스캘럽(2·3차)은 그대로 살린다.
    return lowPassCircular(nextMarginZ, 3).map((z) => clamp(z, minMarginZ, maxMarginZ));
  };

  smoothMarginZ = drapeMarginZForRadii(marginRadii);
  meanMarginZ = smoothMarginZ.reduce((s, v) => s + v, 0) / SECTORS;
  marginRadii = solveMarginRadii(smoothMarginZ, meanMarginZ);
  let finalMeanMarginZ = meanMarginZ;
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

  let smoothMarginZAt = buildPeriodicSmoothCurve(smoothMarginZ, 3);
  const initMarginColZs = Array.from({ length: ANGULAR_COLS }, (_, col) =>
    smoothMarginZAt((col / ANGULAR_COLS) * Math.PI * 2),
  );
  let marginColZs = [...initMarginColZs];

  const syncColsMarginGeometry = () => {
    for (let col = 0; col < ANGULAR_COLS; col += 1) {
      const theta = (col / ANGULAR_COLS) * Math.PI * 2;
      const rMargin = marginRadii[col]!;
      const zMargin = marginColZs[col] ?? smoothMarginZAt(theta);
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

  const refTopRaw: number[] = [];
  const colHasOpp: boolean[] = [];
  const refPostTopMax = Math.max(
    minSafePostHeightMm,
    hasOpposing ? oppRefH - defaultRefClearance + 4.0 : baseCap,
  );
  for (let col = 0; col < ANGULAR_COLS; col += 1) {
    const theta = (col / ANGULAR_COLS) * Math.PI * 2;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const rMargin = marginRadii[col]!;
    const zMargin = smoothMarginZAt(theta);
    const marginPt: Vec3 = [rMargin * ct, rMargin * st, zMargin];

    const relM = sub3(marginPt, c0);
    const h0 = dot3(relM, frame.w);
    const radial = sub3(relM, scale3(frame.w, h0));
    const r0 = Math.hypot(...radial);
    const dir = scale3(radial, 1 / Math.max(r0, 1e-6));
    const phi = Math.atan2(dot3(dir, frame.vSide), dot3(dir, frame.uLabial));
    const cLab = Math.cos(phi);

    const topDrop = !posterior && cLab < 0 ? tpl.lingualTopDropMm * -cLab : 0;
    let hTop = postTopH;
    let refHTop = refBasePostTopH;
    let hasColOpp = false;
    const tipR = posterior
      ? Math.max(0.6, r0 - targetShoulderW - 0.8)
      : cLab >= 0
        ? Math.min(1.15, Math.max(0.55, r0 - targetShoulderW - 0.6))
        : Math.min(0.85, Math.max(0.45, r0 - targetShoulderW - 1.0));
    const tu = dot3(dir, frame.uLabial) * tipR;
    const tv = dot3(dir, frame.vSide) * tipR;
    if (oppField) {
      const deepLabialTip = incisorDeepBite && tu > incisorPalatalContactU + 0.35;
      const oppH = deepLabialTip
        ? opposingBandMinHeight(oppField, tu - 0.35, tu + 0.5, Math.abs(tv) + 0.4)
        : oppField.heightAt(tu, tv, 1.05);
      if (Number.isFinite(oppH)) {
        hasColOpp = true;
        hTop = posterior ? oppH - clearance + Math.max(0, offsetH) : Math.min(hTop, oppH - clearance);
        if (!deepLabialTip) {
          refHTop = posterior ? oppH - defaultRefClearance : Math.min(refHTop, oppH - defaultRefClearance);
        }
      }
    }
    hTop = Math.min(hTop, postTopMax) - topDrop;
    refHTop = Math.min(refHTop, refPostTopMax) - topDrop;
    topRaw.push(hTop);
    refTopRaw.push(refHTop);
    colHasOpp.push(hasColOpp);

    const rBase0 = Math.max(0.75, r0 - targetShoulderW);
    const labBlend = smootherstep((cLab + 1) * 0.5);
    // 전치부: 상단에서 스크류 채널이 절단연 근처로 올라오는 경우(|uScrewEst| <= 0.7mm)에만 둘레 칼라를 넓히고,
    // 순측으로 12° 이상 경사진 식립을 구개측으로 꺾어 세운 경우(uScrewEst > 0.7mm, 기공소 디자인 남정헌 #13·#23, 정성윤 #22·#23)에는
    // 포스트 외형을 자연 타원으로 유지하고 스크류 홀은 설측 경사면으로 자연스럽게 열리게 둔다.
    const uScrewEst = ((refHTop - topRoundMm) / Math.max(frame.w[2], 0.2)) * frame.uLabial[2];
    const vScrewEst = ((refHTop - topRoundMm) / Math.max(frame.w[2], 0.2)) * frame.vSide[2];
    const collarBlend = !posterior
      ? 1 - smootherstep(clamp((Math.abs(uScrewEst) - 0.55) / 0.85, 0, 1))
      : 0;
    const antLabCollar = collarBlend * (Math.max(0, uScrewEst) + boreTopR + ANTERIOR_SCREW_WALL_MM);
    const antLinCollar = collarBlend * (Math.max(0, -uScrewEst) + boreTopR + ANTERIOR_SCREW_LINGUAL_WALL_MM);
    const antMdCollar = !posterior
      ? Math.min(2.1, Math.abs(vScrewEst) + boreTopR + ANTERIOR_SCREW_WALL_MM) * collarBlend
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
      // 소·대구치와 전치부 모두 숄더 끝에서 윗면 라운드 시작까지 중간 단차 없는 매끄러운 모선으로 올라간다.
      // 사용자가 테이퍼를 직접 조절한 경우에는 그 테이퍼 기울기를 우선 따른다.
      postDesired: (h: number) => {
        const curHBase = plan.h0 + chamfer.height;
        const straight = rBase0 - taperSlope * Math.max(0, h - curHBase);
        if (posterior) return straight;
        const span = Math.max(0.5, plan.hTop - topRoundMm - curHBase);
        const u = clamp((h - curHBase) / span, 0, 1);
        const rStart = rBase0;
        const convergeW = linW * 0.45;
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
  const maxOppNearH = Math.max(postTopMax + clearance + 4, 16);
  for (let i = 0; i < opposingLocalPts.length; i += 3) {
    const q: Vec3 = [opposingLocalPts[i]!, opposingLocalPts[i + 1]!, opposingLocalPts[i + 2]!];
    const rel = sub3(q, c0);
    const h = dot3(rel, frame.w);
    if (h < 2 || h > maxOppNearH) continue;
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
  let planeShift = 0;
  const oppTopFootU = Math.max(2.4, marginA - targetShoulderW + 0.55);
  const oppTopFootV = Math.max(2.2, Math.min(marginB - targetShoulderW + 0.55, crownHalfMd * 0.88));
  const topCapHalfU = Math.max(
    1.6,
    Math.max(...cols.map((c) => Math.abs(c.tipU - initMarginCu))) + 0.75,
  );
  const topCapHalfV = Math.max(
    1.5,
    Math.max(...cols.map((c) => Math.abs(c.tipV - initMarginCv))) + 0.75,
  );
  const oppTopPlane =
    hasOpposing && oppField
      ? estimateOpposingOcclusalPlane(oppField, {
          centerU: initMarginCu,
          centerV: initMarginCv,
          halfU: oppTopFootU,
          halfV: oppTopFootV,
          maxTilt: posterior ? FLAT_TOP_MAX_TILT : Math.tan(13 * DEG),
        })
      : null;

  /**
   * 윗면 높이. 구치 교합면과 전치 절단연 모두 하나의 평면이다.
   * 구치는 대합 경사를 조금 따르되, 교합 방향 기울기는 2°를 넘기지 않아 홈처럼 파이지 않는다.
   */
  const fitTopSurface = (opts?: {
    clearanceMm?: number;
    offsetHMm?: number;
    shiftMm?: number;
    chamferHMm?: number;
    explicitClearance?: boolean;
    rawCols?: readonly number[];
  }) => {
    const curClearance = opts?.clearanceMm ?? clearance;
    const curOffsetH = opts?.offsetHMm ?? offsetH;
    const curShift = opts?.shiftMm ?? planeShift;
    const curChamferH = opts?.chamferHMm ?? chamfer.height;
    const curExplicit = opts?.explicitClearance ?? hasExplicitClearance;
    const curFloor = curExplicit ? Math.min(CROWN_THICKNESS_FLOOR_MM, curClearance) : CROWN_THICKNESS_FLOOR_MM;
    const curRaw = opts?.rawCols ?? topRaw;
    let gu = 0;
    let gv = 0;
    if (posterior) {
      if (oppTopPlane) {
        gu = oppTopPlane.gu;
        gv = oppTopPlane.gv;
      }
      const g = Math.hypot(gu, gv);
      if (g > FLAT_TOP_MAX_TILT) {
        gu *= FLAT_TOP_MAX_TILT / g;
        gv *= FLAT_TOP_MAX_TILT / g;
      }
      // 삽입축에 수직인 윗면은 교합 시점에서 한쪽으로 파인다. 그 기울기를 2° 안으로 되돌린다.
      const wOcc = Math.max(0.35, dot3(frame.w, occInFix));
      const levelGu = -dot3(frame.uLabial, occInFix) / wOcc;
      const levelGv = -dot3(frame.vSide, occInFix) / wOcc;
      const dHu = gu * wOcc + dot3(frame.uLabial, occInFix);
      const dHv = gv * wOcc + dot3(frame.vSide, occInFix);
      const gArch = Math.hypot(dHu, dHv);
      if (gArch > FLAT_TOP_ARCH_MAX_TILT) {
        const t = FLAT_TOP_ARCH_MAX_TILT / gArch;
        gu = levelGu + (gu - levelGu) * t;
        gv = levelGv + (gv - levelGv) * t;
      }
    } else {
      const hasEnoughOppCols = colHasOpp.filter(Boolean).length >= 12;
      let s1 = 0, su = 0, sv = 0, suu = 0, svv = 0, suv = 0, sh = 0, suh = 0, svh = 0;
      for (let col = 0; col < ANGULAR_COLS; col += 1) {
        if (hasEnoughOppCols && !colHasOpp[col]) continue;
        const c = cols[col]!;
        const h = curRaw[col]!;
        s1 += 1; su += c.tipU; sv += c.tipV;
        suu += c.tipU * c.tipU; svv += c.tipV * c.tipV; suv += c.tipU * c.tipV;
        sh += h; suh += c.tipU * h; svh += c.tipV * h;
      }
      if (s1 >= 4) {
        const mu = su / s1, mv = sv / s1, mh = sh / s1;
        const cuu = suu / s1 - mu * mu, cvv = svv / s1 - mv * mv, cuv = suv / s1 - mu * mv;
        const cuh = suh / s1 - mu * mh, cvh = svh / s1 - mv * mh;
        const det = cuu * cvv - cuv * cuv;
        gu = det > 1e-9 ? (cuh * cvv - cvh * cuv) / det : 0;
        gv = det > 1e-9 ? (cvh * cuu - cuh * cuv) / det : 0;
      }
      if (oppTopPlane) {
        gv = oppTopPlane.gv;
      }
      // 전치부(절치·견치) 절단 상단은 순설 경사(gu)를 두지 않아 설측 사면과 2단 경사가 생기지 않게 한다.
      gu = 0;
      gv = clamp(gv, -Math.tan(4 * DEG), Math.tan(4 * DEG));
    }

    const effClearance =
      curOffsetH >= 0
        ? Math.max(curFloor, curClearance - curOffsetH)
        : curClearance - curOffsetH;
    const evalOpposingCaps = (slopeU: number, slopeV: number) => {
      let aClear = Infinity;
      let aHard = Infinity;
      if (hasOpposing && oppField) {
        for (const cell of oppField.list) {
          const du = (cell.u - initMarginCu) / topCapHalfU;
          const dv = (cell.v - initMarginCv) / topCapHalfV;
          if (du * du + dv * dv > 1) {
            continue;
          }
          // 딥바이트 절치는 설측 대합이 순측 절단 높이를 끌어내리지 않는다. 설측은 사선 삭제 쪽에 둔다.
          if (incisorDeepBite && cell.u <= incisorPalatalContactU + 0.55) continue;
          const planeSub = slopeU * cell.u + slopeV * cell.v;
          aClear = Math.min(aClear, cell.h - effClearance - planeSub);
          aHard = Math.min(aHard, cell.h - curFloor - planeSub);
        }
      }
      if (!incisorDeepBite && !Number.isFinite(aClear) && hasOpposing && Number.isFinite(oppRefH)) {
        aClear = oppRefH - effClearance;
        aHard = oppRefH - curFloor;
      }
      return { aClear, aHard };
    };

    let { aClear, aHard } = evalOpposingCaps(gu, gv);
    const minPostWall = hasOpposing ? (posterior ? 1.15 : 1.4) : 2.2;
    let minTop = Math.max(
      ...cols.map((c) => c.h0 + curChamferH + minPostWall - gu * c.tipU - gv * c.tipV),
    );
    if (hasOpposing && Number.isFinite(aHard) && minTop > aHard && Math.hypot(gu, gv) > 1e-4) {
      gu *= 0.45;
      gv *= 0.45;
      ({ aClear, aHard } = evalOpposingCaps(gu, gv));
      minTop = Math.max(
        ...cols.map((c) => c.h0 + curChamferH + minPostWall - gu * c.tipU - gv * c.tipV),
      );
    }

    let a = Infinity;
    if (hasOpposing && Number.isFinite(aClear)) {
      if (posterior || curExplicit) {
        a = aClear;
      } else {
        const maxEdgeRise = Math.max(0, ...cols.map((c) => gu * c.tipU + gv * c.tipV));
        const aHeightCap = Math.max(baseCap, postTopH) + curOffsetH + 0.65 - maxEdgeRise * 0.65;
        a = Math.min(aClear, aHeightCap);
      }
      if (Number.isFinite(aHard)) {
        a = Math.min(a, aHard);
      }
    } else {
      for (let col = 0; col < ANGULAR_COLS; col += 1) {
        const c = cols[col]!;
        a = Math.min(a, curRaw[col]! - gu * c.tipU - gv * c.tipV);
      }
    }
    a += curShift;
    a = Math.max(a, minTop);
    if (tpl.kind === "incisor") {
      // 절단 상단의 순설 경사(gu)는 0으로 유지해 설측 단일 사면 위에 2단 절단 경사면이 생기지 않게 한다.
      // 딥바이트 절치는 순측 절단 대합 여유만 확인하고 설측 공간은 단일 설측 사면 평면이 확보한다.
      let labialU = 0.45;
      for (const c of cols) if (c.tipU > labialU) labialU = c.tipU;
      if (incisorDeepBite && hasOpposing && oppField) {
        let labialCap = Infinity;
        const tipLo = Math.max(incisorPalatalContactU + 0.55, labialU - 0.85);
        for (const cell of oppField.list) {
          if (cell.u < tipLo || cell.u > labialU + 0.4 || Math.abs(cell.v) > 1.2) continue;
          labialCap = Math.min(labialCap, cell.h - effClearance - gv * cell.v);
        }
        if (Number.isFinite(labialCap)) a = Math.min(a, labialCap);
      }
      if (incisorDeepBite && a > postTopH + 0.15) a = postTopH;
    }
    if (bridgeMatchedTopH != null && Number.isFinite(bridgeMatchedTopH)) {
      let peak = -Infinity;
      for (const c of cols) peak = Math.max(peak, a + gu * c.tipU + gv * c.tipV);
      if (peak > bridgeMatchedTopH + 0.04) a = Math.max(minTop, a - (peak - bridgeMatchedTopH));
    }
    return { heightAt: (u: number, v: number) => a + gu * u + gv * v, center: a, gu, gv };
  };

  /**
   * 피니시라인(offset=width, dh=0)에서 포스트 시작점(offset=0, dh=height)까지
   * 평탄 숄더 + 오목 원호 전체 호장(totalLen)을 등분해 C¹ 연속 점열([offsetFromBase, dhAboveMargin])을 돌려준다.
   * flat 임계값 분기가 없어 열 사이에 단차가 절대 생기지 않는다.
   */
  const chamferPoints = (
    width: number,
    height: number,
    endSlope = taperSlope,
  ): Array<[number, number]> => {
    const w = Math.max(0.02, width);
    const h = Math.max(0.02, height);
    const th1 = clamp(Math.atan(Math.max(0, endSlope)), 0.5 * DEG, 38 * DEG);
    const ratio = w / h;
    const ratioAt = (t0: number) => (Math.cos(th1) - Math.cos(t0)) / (Math.sin(t0) - Math.sin(th1));
    const maxArcRatio = ratioAt(Math.PI / 2);
    let th0 = Math.PI / 2;
    let flat = 0;
    if (ratio >= maxArcRatio) {
      flat = w - h * maxArcRatio;
    } else {
      let lo = th1 + 1e-4;
      let hi = Math.PI / 2;
      for (let it = 0; it < 40; it += 1) {
        const mid = (lo + hi) * 0.5;
        if (ratioAt(mid) < ratio) lo = mid;
        else hi = mid;
      }
      th0 = (lo + hi) * 0.5;
    }
    const rho = h / Math.max(Math.sin(th0) - Math.sin(th1), 1e-4);
    const arcLen = Math.max(1e-5, rho * Math.max(1e-4, th0 - th1));
    const totalLen = flat + arcLen;
    const totalSteps = CHAMFER_STEPS + 1;
    const pts: Array<[number, number]> = [];
    for (let m = 1; m <= totalSteps; m += 1) {
      const dist = (totalLen * m) / totalSteps;
      if (dist <= flat) {
        pts.push([w - dist, 0]);
      } else {
        const s = clamp((dist - flat) / arcLen, 0, 1);
        const th = th0 + (th1 - th0) * s;
        pts.push([
          Math.max(0, w - flat + rho * (Math.cos(th0) - Math.cos(th))),
          Math.min(h, rho * (Math.sin(th0) - Math.sin(th))),
        ]);
      }
    }
    return pts;
  };

  type LockedPosteriorBase = {
    pSecCu: number;
    pSecCv: number;
    finalBaseBl: number;
    finalBaseMd: number;
    effUniformShoulder: number;
    geomIdealTaperDeg: number | null;
    footPsis: number[];
    duLats: number[];
    dvLats: number[];
  };
  type LockedAnteriorBase = {
    pBaseCu: number;
    pBaseCv: number;
    finalAntBaseBl: number;
    finalAntBaseMd: number;
    effAntShoulder: number;
    wrapAnteriorScrew360: boolean;
    footPsis: number[];
  };
  let lockedMarginRadii: number[] | null = null;
  let lockedMarginColZs: number[] | null = null;
  let lockedPosteriorBase: LockedPosteriorBase | null = null;
  let lockedAnteriorBase: LockedAnteriorBase | null = null;

  const buildShape = (lockBasePass = false) => {
    const passTaperDeg = lockBasePass ? refBaseTaperDeg : effectiveTaperDeg;
    const passTaperSlope = lockBasePass ? refBaseTaperSlope : taperSlope;
    mHalfBl = initMarginHalfBl;
    mHalfMd = initMarginHalfMd;
    mCu = initMarginCu;
    mCv = initMarginCv;
    marginRadii = lockedMarginRadii && !lockBasePass ? [...lockedMarginRadii] : [...initMarginRadii];
    marginColZs = lockedMarginColZs && !lockBasePass ? [...lockedMarginColZs] : [...initMarginColZs];
    syncColsMarginGeometry();
    const top = lockBasePass
      ? fitTopSurface({
          clearanceMm: defaultRefClearance,
          offsetHMm: 0,
          shiftMm: 0,
          chamferHMm: refBaseChamfer.height,
          explicitClearance: false,
          rawCols: refTopRaw,
        })
      : fitTopSurface();
    for (let col = 0; col < ANGULAR_COLS; col += 1) {
      const c = cols[col]!;
      c.hTop = top.heightAt(c.tipU, c.tipV);
      c.crownR = [];
      c.crownH = [];
      c.crownTopOcc = Number.isFinite(crownTopTarget)
        ? clamp(crownTopTarget - c.hTop, 0.6, CROWN_TOP_OCC_MAX_MM)
        : tpl.crownOcclusalMm;
    }
    const hPostBase = lockBasePass ? refBaseChamfer.height : chamfer.height;

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
        const supraClipRelief = Math.max(0, -subgMin) * frame.w[2];
        const clipStartH =
          sideAllowanceOf(c.phi).wallMm > 0
            ? Math.max(c.h0 + 0.2, Math.max(1.8, Math.max(c.h0, 0) + 1.6) - supraClipRelief)
            : Math.max(
                c.h0 + 0.2,
                Math.max(CONTACT_CLIP_MIN_ABOVE_MEAN_MM, Math.max(c.h0, 0) + CONTACT_CLIP_FROM_MM) -
                  supraClipRelief,
              );
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
        const supraClipRelief = Math.max(0, -subgMin) * frame.w[2];
        const clipStartH =
          sideAllowanceOf(c.phi).wallMm > 0
            ? Math.max(c.h0 + 0.2, Math.max(1.8, Math.max(c.h0, 0) + 1.6) - supraClipRelief)
            : Math.max(
                c.h0 + 0.2,
                Math.max(CONTACT_CLIP_MIN_ABOVE_MEAN_MM, Math.max(c.h0, 0) + CONTACT_CLIP_FROM_MM) -
                  supraClipRelief,
              );
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
    // 치종 해부 단면(대구치 둥근 모서리 사각형, 소구치 협측 광·설측 협 사다리꼴-계란형, 전치 순측 호 + 설측 경사면)의
    // 중심(pTopCu, pTopCv)과 반축만 크라운 내면 유격·스크류 채널 벽에 맞춰 100% 직선 모선(ruled surface)으로 세운다.
    const minPostR = 0.9;
    const postR: number[][] = [];
    const postH: number[][] = [];
    const floorR: number[][] = [];
    const capR: number[][] = [];
    const hardCapR: number[][] = [];
    let meanSpanSum = 0;
    let meanHBaseSum = 0;
    let meanRoundStartSum = 0;
    let minHBaseEst = Infinity;
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
      minHBaseEst = Math.min(minHBaseEst, hBase);
      meanHBaseSum += hBase / ANGULAR_COLS;
      meanRoundStartSum += roundStart / ANGULAR_COLS;
      meanSpanSum += Math.max(0.4, roundStart - hBase) / ANGULAR_COLS;
      const hs: number[] = [];
      const fs: number[] = [];
      const cs: number[] = [];
      const hc: number[] = [];
      const cDu = dot3(c.dir, frame.uLabial);
      const cDv = dot3(c.dir, frame.vSide);
      const axCosCol = Math.max(frame.w[2], 0.2);
      const colBoreProfile = resolveScrewChannelProfile(
        conn,
        meanMarginZ + colEdgeTop / axCosCol,
      );
      for (let k = 0; k <= POST_LEVELS; k += 1) {
        const h = hBase + ((roundStart - hBase) * k) / POST_LEVELS;
        const zAtColH = meanMarginZ + h / axCosCol;
        const boreAtColH = colBoreProfile.radiusAtZ(zAtColH);
        const uScH = (h / axCosCol) * frame.uLabial[2];
        const vScH = (h / axCosCol) * frame.vSide[2];
        const screwSafeWall = posterior ? SCREW_WALL_MM : MIN_FRACTURE_SAFE_POST_WALL_MM + 0.03;
        const exactScrewR = rayCircleRadius(
          uScH,
          vScH,
          boreAtColH + screwSafeWall,
          cDu,
          cDv,
        );
        const enforceColScrew =
          posterior || angulationDeg <= 15.5 || Math.abs(cDv) >= 0.38 || k <= Math.round(POST_LEVELS * 0.35);
        const screwFloor = enforceColScrew
          ? Math.max(posterior ? minPostR : 0.78, exactScrewR)
          : 0.75;
        const tightScrewSafeR = rayCircleRadius(
          uScH,
          vScH,
          boreAtColH + MIN_FRACTURE_SAFE_POST_WALL_MM + 0.02,
          cDu,
          cDv,
        );
        let cap = Infinity;
        let hardCap = Infinity;
        if (h >= c.h0 + hPostBase + 0.25) {
          const crown = crownRadiusAt(c, h);
          const ramp = smootherstep((h - c.h0) / 1.8);
          const sideAllow = sideAllowanceOf(c.phi);
          const pbCol = Math.floor((wrapAngle(c.phi) / (Math.PI * 2)) * LIMIT_PHI_BINS);
          const hasStandingAdjInCol =
            adjCoreMaxAboveMargin[pbCol]! >= 2.8 ||
            adjCoreMaxAboveMargin[(pbCol + 1) % LIMIT_PHI_BINS]! >= 2.8 ||
            adjCoreMaxAboveMargin[(pbCol - 1 + LIMIT_PHI_BINS) % LIMIT_PHI_BINS]! >= 2.8;
          const supraClipRelief = Math.max(0, -subgMin) * frame.w[2];
          const clipStartH =
            sideAllow.wallMm > 0
              ? Math.max(c.h0 + 0.2, Math.max(1.5, Math.max(c.h0, 0) + 1.3) - supraClipRelief)
              : hasStandingAdjInCol
                ? Math.max(c.h0 + 0.2, Math.max(1.55, Math.max(c.h0, 0) + 1.25) - supraClipRelief)
                : Math.max(
                    c.h0 + 0.2,
                    Math.max(CONTACT_CLIP_MIN_ABOVE_MEAN_MM, Math.max(c.h0, 0) + CONTACT_CLIP_FROM_MM) -
                      supraClipRelief,
                  );
          // 실제 스캔 인접치 표면(또는 인접 크라운 경계)에서 크라운 두께 목표(≥1.0mm)와 하한(≥0.7mm)을 지키되,
          // 포스트 최소 벽 두께(≥0.3mm)와 충돌하면 인접치 인접면 미세 삭제(편측 최대 0.2mm) 여유를 허용하고 포스트 강도를 지킨다.
          let adjSoftPostCap = Infinity;
          let adjHardPostCap = Infinity;
          if (h >= clipStartH) {
            const adjCrownLim = adjacentScanCrownLimitAt(c.phi, h);
            if (Number.isFinite(adjCrownLim)) {
              const adjSurface = sideAllow.wallMm <= 0 ? adjCrownLim - contact : adjCrownLim;
              const rawSoftCap = Math.max(
                0.68,
                adjSurface - Math.max(CROWN_THICKNESS_FLOOR_MM, params.minCrownThicknessMm),
              );
              const rawHardCap = Math.max(0.64, adjSurface - CROWN_THICKNESS_FLOOR_MM);
              if (sideAllow.wallMm <= 0 && (rawHardCap < tightScrewSafeR || supragingivalRaisedForStrength)) {
                const strippedHardCap =
                  adjSurface + MAX_ADJACENT_ENAMELOPLASTY_MM - MIN_STRIP_CROWN_WALL_MM;
                adjSoftPostCap = Math.max(rawSoftCap, Math.min(strippedHardCap, tightScrewSafeR + 0.08));
                adjHardPostCap = Math.max(
                  rawHardCap,
                  strippedHardCap,
                  enforceColScrew ? tightScrewSafeR : 0.64,
                );
              } else {
                adjSoftPostCap = rawSoftCap;
                adjHardPostCap = enforceColScrew ? Math.max(rawHardCap, tightScrewSafeR) : rawHardCap;
              }
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
          const rawCrownFloorCap = crown - CROWN_THICKNESS_FLOOR_MM * ramp;
          const effCrownHard = enforceColScrew
            ? Math.max(tightScrewSafeR, rawCrownFloorCap)
            : rawCrownFloorCap;
          const nonPlaneHard = Math.min(effCrownHard, adjHardPostCap);
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
    const MIN_MARGIN_SHOULDER_MM = clamp(targetShoulderW * 0.74, 0.25, 0.36);
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
    const postUnitMd = toothSectionRadius(tpl.kind, "post", 1, 1, Math.PI / 2);
    let meanPostUnitR = 0;
    for (let col = 0; col < ANGULAR_COLS; col += 1) {
      meanPostUnitR +=
        evalPostSectionRadiusAtPhi(
          tpl.kind,
          1 / postUnitLab,
          1 / postUnitLin,
          1,
          (col / ANGULAR_COLS) * Math.PI * 2,
        ) / ANGULAR_COLS;
    }
    meanPostUnitR = Math.max(0.85, meanPostUnitR);
    const hRefSpanEst = Math.max(
      0.5,
      meanRoundStartSum - (Number.isFinite(minHBaseEst) ? minHBaseEst : meanHBaseSum),
    );

    const postWallPtsByCol: Vec3[][] = Array.from({ length: ANGULAR_COLS }, () => []);
    let pTopCu = mCu;
    let pTopCv = mCv;
    let topFaceCu = mCu;
    let topFaceCv = mCv;
    let geomIdealTaperDeg: number | null = null;
    let appliedLingualBevelMm: number | null = null;
    let appliedLabialBevelMm: number | null = null;
    let wrapAnteriorScrew360 = false;
    if (posterior) {
      let pSecCu = mCu;
      let pSecCv = mCv;
      let finalBaseBl: number;
      let finalBaseMd: number;
      let finalTopBlScaled: number;
      let finalTopMdScaled: number;
      let effUniformShoulder: number;
      let colFootPsis: number[];
      let colDuLats: number[] = new Array<number>(ANGULAR_COLS).fill(0);
      let colDvLats: number[] = new Array<number>(ANGULAR_COLS).fill(0);

      const hRefBase = meanHBaseSum;
      const hRefTop = Math.max(hRefBase + 0.5, meanRoundStartSum);
      const hRefSpan = hRefTop - hRefBase;
      const minWallTaperSlope = Math.tan(
        Math.max(RETENTION_SINGLE_MIN_TAPER_DEG, passTaperDeg) * DEG,
      );
      const estSurfaceTopZPosterior = meanMarginZ + top.heightAt(mCu, mCv) / axialCos;
      const postBoreProfile = resolveScrewChannelProfile(conn, estSurfaceTopZPosterior);
      const strictPostWallMm = MIN_POST_WALL_MM + 0.032;
      const strictTopCornerMm = 0.042;
      const boreStrictTopR =
        postBoreProfile.radiusAtZ(estSurfaceTopZPosterior + topRoundMm * 0.65) +
        strictPostWallMm +
        strictTopCornerMm;
      const boreStrictBaseR =
        postBoreProfile.radiusAtZ(meanMarginZ + hPostBase / axialCos) + strictPostWallMm;

      const buildPosteriorWallColumns = (
        cuSec: number,
        cvSec: number,
        baseBl: number,
        baseMd: number,
        topBl: number,
        topMd: number,
        footPsis: readonly number[],
        duLats: readonly number[],
        dvLats: readonly number[],
      ) => {
        for (let col = 0; col < ANGULAR_COLS; col += 1) {
          const c = cols[col]!;
          const phiSec = footPsis[col]!;
          const cp = Math.cos(phiSec);
          const sp = Math.sin(phiSec);
          const topEdge = top.heightAt(cuSec + cp * topBl, cvSec + sp * topMd);
          const maxRoundStartCol = Math.max(c.h0 + 0.14, topEdge - 0.1);
          const hBaseCol = smoothMin(c.h0 + hPostBase, maxRoundStartCol - 0.08, 0.03);
          const roundStartCol = smoothMin(
            maxRoundStartCol,
            Math.max(hBaseCol + 0.36, topEdge - topRoundMm * 0.9),
            0.03,
          );
          const duLat = duLats[col] ?? 0;
          const dvLat = dvLats[col] ?? 0;
          const wallPts: Vec3[] = [];
          for (let k = 0; k <= POST_LEVELS; k += 1) {
            const uSpan = k / POST_LEVELS;
            const h = hBaseCol + (roundStartCol - hBaseCol) * uSpan;
            postH[col]![k] = h;
            const blAtH = Math.max(0.65, baseBl + (topBl - baseBl) * uSpan);
            const mdAtH = Math.max(0.65, baseMd + (topMd - baseMd) * uSpan);
            const s = evalPostSectionRadiusAtPhi(
              tpl.kind,
              blAtH / postUnitLab,
              blAtH / postUnitLin,
              mdAtH,
              phiSec,
            );
            const u = cuSec + s * cp + duLat * (1 - uSpan);
            const v = cvSec + s * sp + dvLat * (1 - uSpan);
            postR[col]![k] = Math.hypot(u, v);
            wallPts.push(
              add3(c0, add3(scale3(frame.w, h), add3(scale3(frame.uLabial, u), scale3(frame.vSide, v)))),
            );
          }
          postWallPtsByCol[col] = wallPts;
        }
      };

      if (!lockBasePass && lockedPosteriorBase) {
        // 대합 거리·포스트 높이·마진 챔퍼 R을 바꿔도 마진 외경이 흔들리지 않도록 베이스 단면을 먼저 고정한다.
        // 편측 테이퍼는 상단을 좁혀 맞춘다. 스크류 벽이 상단을 더 못 좁히면 그 각도만큼 베이스와 마진을 함께 넓힌다.
        pSecCu = lockedPosteriorBase.pSecCu;
        pSecCv = lockedPosteriorBase.pSecCv;
        finalBaseBl = lockedPosteriorBase.finalBaseBl;
        finalBaseMd = lockedPosteriorBase.finalBaseMd;
        effUniformShoulder = lockedPosteriorBase.effUniformShoulder;
        geomIdealTaperDeg = lockedPosteriorBase.geomIdealTaperDeg;
        colFootPsis = lockedPosteriorBase.footPsis;
        colDuLats = lockedPosteriorBase.duLats;
        colDvLats = lockedPosteriorBase.dvLats;
        pTopCu = pSecCu;
        pTopCv = pSecCv;
        topFaceCu = pSecCu;
        topFaceCv = pSecCv;
        mCu = pSecCu;
        mCv = pSecCv;
        mHalfBl = finalBaseBl + effUniformShoulder;
        mHalfMd = finalBaseMd + effUniformShoulder;

        const minTaperDropBl = minWallTaperSlope * hRefSpan * Math.max(1, postUnitLab, postUnitLin);
        const minTaperDropMd = (minWallTaperSlope * hRefSpan) / Math.max(0.8, postUnitMd);
        const screwTightR = Math.max(boreTopR + SCREW_WALL_TIGHT_MM, boreStrictTopR);
        const screwTightMd = screwTightR / Math.max(0.8, postUnitMd);
        const reqTopBl = Math.max(minPostR, Math.abs(uScrewTop - pSecCu) + screwTightR);
        const reqTopMd = Math.max(minPostR, Math.abs(vScrewTop - pSecCv) + screwTightMd);
        // 스크류가 상단을 더 못 좁히면 상단을 베이스에 붙여 각도를 지우지 않는다.
        // 상단은 스크류 벽 두께를 지키고, 부족한 편측 기울기만큼 베이스(와 마진)를 넓힌다.
        const expandMarginForBaseGrowth = (prevBl: number, prevMd: number) => {
          const dBl = finalBaseBl - prevBl;
          const dMd = finalBaseMd - prevMd;
          if (dBl <= 1e-4 && dMd <= 1e-4) return;
          for (let col = 0; col < ANGULAR_COLS; col += 1) {
            const psi = colFootPsis[col]!;
            const before = evalPostSectionRadiusAtPhi(
              tpl.kind,
              prevBl / postUnitLab,
              prevBl / postUnitLin,
              prevMd,
              psi,
            );
            const after = evalPostSectionRadiusAtPhi(
              tpl.kind,
              finalBaseBl / postUnitLab,
              finalBaseBl / postUnitLin,
              finalBaseMd,
              psi,
            );
            marginRadii[col] = (marginRadii[col] ?? 0) + Math.max(0, after - before);
          }
          mHalfBl = finalBaseBl + effUniformShoulder;
          mHalfMd = finalBaseMd + effUniformShoulder;
          syncColsMarginGeometry();
        };
        const seatLockedTaper = (topFloorBl: number, topFloorMd: number) => {
          const prevBl = finalBaseBl;
          const prevMd = finalBaseMd;
          finalTopBlScaled = Math.max(topFloorBl, prevBl - minTaperDropBl);
          finalTopMdScaled = Math.max(topFloorMd, prevMd - minTaperDropMd);
          finalBaseBl = Math.max(prevBl, finalTopBlScaled + minTaperDropBl);
          finalBaseMd = Math.max(prevMd, finalTopMdScaled + minTaperDropMd);
          finalTopBlScaled = Math.max(topFloorBl, finalBaseBl - minTaperDropBl);
          finalTopMdScaled = Math.max(topFloorMd, finalBaseMd - minTaperDropMd);
          finalBaseBl = Math.max(finalBaseBl, finalTopBlScaled + minTaperDropBl);
          finalBaseMd = Math.max(finalBaseMd, finalTopMdScaled + minTaperDropMd);
          expandMarginForBaseGrowth(prevBl, prevMd);
        };
        seatLockedTaper(reqTopBl, reqTopMd);
        buildPosteriorWallColumns(
          pSecCu,
          pSecCv,
          finalBaseBl,
          finalBaseMd,
          finalTopBlScaled,
          finalTopMdScaled,
          colFootPsis,
          colDuLats,
          colDvLats,
        );
        for (let topFix = 0; topFix < 4; topFix += 1) {
          let worstTopDef = 0;
          let worstWu = 0.5;
          const surfZNow = meanMarginZ + top.heightAt(pSecCu, pSecCv) / axialCos;
          const boreNow = resolveScrewChannelProfile(conn, surfZNow);
          for (let col = 0; col < ANGULAR_COLS; col += 1) {
            const wallPts = postWallPtsByCol[col]!;
            for (let k = 1; k <= POST_LEVELS; k += 1) {
              const pt = wallPts[k]!;
              const req =
                k === POST_LEVELS
                  ? boreNow.radiusAtZ(pt[2] + topRoundMm * 0.65) + strictPostWallMm + strictTopCornerMm
                  : boreNow.radiusAtZ(pt[2]) + strictPostWallMm;
              const rXY = Math.hypot(pt[0], pt[1]);
              if (rXY < req - 1e-4) {
                const def = (req - rXY) / Math.max(k / POST_LEVELS, 0.35);
                if (def > worstTopDef) {
                  worstTopDef = def;
                  worstWu = Math.cos(colFootPsis[col]!) ** 2;
                }
              }
            }
          }
          if (worstTopDef <= 1e-4) break;
          const addBl = (worstTopDef / axialCos) * (0.35 + 0.65 * worstWu) + 0.004;
          const addMd = (worstTopDef / axialCos) * (0.35 + 0.65 * (1 - worstWu)) + 0.004;
          finalTopBlScaled += addBl;
          finalTopMdScaled += addMd;
          seatLockedTaper(finalTopBlScaled, finalTopMdScaled);
          buildPosteriorWallColumns(
            pSecCu,
            pSecCv,
            finalBaseBl,
            finalBaseMd,
            finalTopBlScaled,
            finalTopMdScaled,
            colFootPsis,
            colDuLats,
            colDvLats,
          );
        }
      } else {
        // 구치부(특히 브리지 지대주)는 하단부터 상단까지 동일한 단면 중심(pSecCu, pSecCv)을 유지해 삽입축 평행(0.00°)을 보장한다.
        // 마진 중심(mCu, mCv)과 같은 중심·동일 마진 폭(targetShoulderW)에서 출발하고,
        // 3D 스크류 홀 전 구간 안전 반경과 인접 한계(marginCap)를 해부 단면 중심·반축 단계에서 완전히 수렴시켜
        // 사후 국소 볼록 혹이나 열별 절단 없이 100% 매끈한 등폭 병행 마진 곡선을 만든다.
        const maxStraightSlope = Math.tan(
          Math.min(12.5, passTaperDeg + (mode.groupAxisWorld ? 0.4 : 1.0)) * DEG,
        );
        let taperDeltaBl = (passTaperSlope / meanPostUnitR) * hRefSpanEst;
        let taperDeltaMd = (passTaperSlope / meanPostUnitR) * hRefSpanEst;
        const uniformW = targetShoulderW;
        const extraW = { posU: 0, negU: 0, posV: 0, negV: 0 };
        const reliefW = { posU: 0, negU: 0, posV: 0, negV: 0 };

        let pBaseBl = Math.max(minPostR + 0.2, mHalfBl - targetShoulderW);
        let pBaseMd = Math.max(minPostR + 0.2, mHalfMd - targetShoulderW);

        const effScrewReqR = screwReqR;
        const screwReqMd = effScrewReqR / Math.max(0.8, postUnitMd);
        const screwTightR = boreTopR + SCREW_WALL_TIGHT_MM;
        const screwTightMd = screwTightR / Math.max(0.8, postUnitMd);
        const screwBaseTightR = boreTopR + SCREW_WALL_TIGHT_MM;
        const screwBaseTightMd = screwBaseTightR / Math.max(0.8, postUnitMd);

        const computeScrewMaxWidths = (tdBl: number, tdMd: number) => {
          const minPosU = Math.max(minPostR + 0.15, uScrewBase + effScrewReqR, uScrewTop + effScrewReqR + tdBl);
          const minNegU = Math.max(minPostR + 0.15, -uScrewBase + effScrewReqR, -uScrewTop + effScrewReqR + tdBl);
          const minPosV = Math.max(minPostR + 0.15, vScrewBase + screwReqMd, vScrewTop + screwReqMd + tdMd);
          const minNegV = Math.max(minPostR + 0.15, -vScrewBase + screwReqMd, -vScrewTop + screwReqMd + tdMd);
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
          let pPosU = mExtPosU - wPosU;
          let pNegU = mExtNegU - wNegU;
          let pPosV = mExtPosV - wPosV;
          let pNegV = mExtNegV - wNegV;
          pPosU = Math.max(pPosU, uScrewBase + screwBaseTightR, uScrewTop + screwTightR + taperDeltaBl);
          pNegU = Math.max(pNegU, -uScrewBase + screwBaseTightR, -uScrewTop + screwTightR + taperDeltaBl);
          pPosV = Math.max(pPosV, vScrewBase + screwBaseTightMd, vScrewTop + screwTightMd + taperDeltaMd);
          pNegV = Math.max(pNegV, -vScrewBase + screwBaseTightMd, -vScrewTop + screwTightMd + taperDeltaMd);
          pSecCu = (pPosU - pNegU) * 0.5;
          pBaseBl = Math.max(minPostR + 0.2, (pPosU + pNegU) * 0.5);
          pSecCv = (pPosV - pNegV) * 0.5;
          pBaseMd = Math.max(minPostR + 0.2, (pPosV + pNegV) * 0.5);
          const pTopBl = Math.max(minPostR + 0.15, pBaseBl - taperDeltaBl);
          const pTopMd = Math.max(minPostR + 0.15, pBaseMd - taperDeltaMd);
          return { maxW, pTopBl, pTopMd };
        };

        const checkLevels = [
          0,
          Math.round(POST_LEVELS * 0.45),
          Math.round(POST_LEVELS * 0.8),
          POST_LEVELS,
        ];
        for (let iter = 0; iter < 16; iter += 1) {
          const { pTopBl, pTopMd } = syncPosteriorSection();
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
            // 높이·테이퍼 연결 상태에서 임의로 테이퍼를 키우면 설정된 [2.0, 5.0] 테이퍼보다 각도가 벌어지므로,
            // 연결 해제 상태에서만 미세 테이퍼 여유를 허용하고 기본적으로는 마진 숄더(extraW)로 폭을 줄여 테이퍼 각도를 지킨다.
            if (!isTaperLinked && worstU > 0.55 && !mode.groupAxisWorld) {
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

        const { pTopBl: finalTopBl, pTopMd: finalTopMd } = syncPosteriorSection();
        let convexBaseBl = pBaseBl;
        let convexBaseMd = pBaseMd;
        let convexTopBl = finalTopBl;
        let convexTopMd = finalTopMd;
        for (let fixIt = 0; fixIt < 10; fixIt += 1) {
          let baseScaleDownBl = 1;
          let baseScaleDownMd = 1;
          let topScaleDownBl = 1;
          let topScaleDownMd = 1;
          let topScaleUp = 1;
          for (let col = 0; col < ANGULAR_COLS; col += 1) {
            const c = cols[col]!;
            const du = colPostDu[col]!;
            const dv = colPostDv[col]!;
            const wu = du * du;
            const wv = dv * dv;
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
              const deficit = 1 - maxR0 / r0Ray;
              baseScaleDownBl = Math.min(baseScaleDownBl, 1 - deficit * (0.15 + 0.85 * wu));
              baseScaleDownMd = Math.min(baseScaleDownMd, 1 - deficit * (0.15 + 0.85 * wv));
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
              (postH[col]![POST_LEVELS]! / axialCos) * c.dir[2] + screwTightR;
            const adjScanTopHard = Number.isFinite(hardCapR[col]![POST_LEVELS]!)
              ? Math.max(Math.max(minPostR, tightScrewFloor), hardCapR[col]![POST_LEVELS]!)
              : Infinity;
            const maxRTop = Math.max(
              tightScrewFloor,
              Math.min(
                Number.isFinite(r0Ray) ? Math.min(r0Ray, maxR0) : maxR0,
                postPlaneLimitAt(c.dir, postH[col]![POST_LEVELS]!, 0.32, CROWN_THICKNESS_FLOOR_MM),
                adjScanTopHard,
              ),
            );
            if (Number.isFinite(rTopRay) && rTopRay > maxRTop + 1e-4) {
              const topDeficit = 1 - maxRTop / rTopRay;
              topScaleDownBl = Math.min(topScaleDownBl, 1 - topDeficit * (0.15 + 0.85 * wu));
              topScaleDownMd = Math.min(topScaleDownMd, 1 - topDeficit * (0.15 + 0.85 * wv));
            }
            const reqTop = Math.max(minPostR, tightScrewFloor);
            if (Number.isFinite(rTopRay) && rTopRay < reqTop - 1e-4 && rTopRay > 0.2) {
              topScaleUp = Math.max(topScaleUp, reqTop / rTopRay);
            }
          }
          if (
            Math.min(baseScaleDownBl, baseScaleDownMd) >= 0.9995 &&
            Math.min(topScaleDownBl, topScaleDownMd) >= 0.9995 &&
            topScaleUp <= 1.0005
          ) {
            break;
          }
          if (Math.min(baseScaleDownBl, baseScaleDownMd) < 0.9995) {
            convexBaseBl = Math.max(minPostR + 0.08, convexBaseBl * (baseScaleDownBl - 0.002));
            convexBaseMd = Math.max(minPostR + 0.08, convexBaseMd * (baseScaleDownMd - 0.002));
          }
          if (topScaleUp > 1.0005) {
            const prevDropBl = Math.max(0.04, convexBaseBl - convexTopBl);
            const prevDropMd = Math.max(0.04, convexBaseMd - convexTopMd);
            convexTopBl = convexTopBl * Math.min(1.08, topScaleUp + 0.002);
            convexTopMd = convexTopMd * Math.min(1.08, topScaleUp + 0.002);
            convexBaseBl = Math.max(convexBaseBl, convexTopBl + prevDropBl);
            convexBaseMd = Math.max(convexBaseMd, convexTopMd + prevDropMd);
          } else if (Math.min(topScaleDownBl, topScaleDownMd) < 0.9995) {
            convexTopBl = Math.max(minPostR, convexTopBl * (topScaleDownBl - 0.002));
            convexTopMd = Math.max(minPostR, convexTopMd * (topScaleDownMd - 0.002));
          }
          convexTopBl = Math.min(convexTopBl, convexBaseBl - 0.04);
          convexTopMd = Math.min(convexTopMd, convexBaseMd - 0.04);
        }

        const uniformShoulder = clamp(uniformW, 0.22, Math.max(targetShoulderW, 0.85));
        let syncedScaleBl = 1;
        let syncedScaleMd = 1;
        for (let matchIt = 0; matchIt < 10; matchIt += 1) {
          let worstDef = 0;
          let worstWu = 0.5;
          const sh = Math.max(MIN_MARGIN_SHOULDER_MM, uniformShoulder * Math.min(syncedScaleBl, syncedScaleMd));
          const offsetSolver = buildParallelOffsetMarginSolver(
            pSecCu,
            pSecCv,
            (psi) =>
              evalPostSectionRadiusAtPhi(
                tpl.kind,
                (convexBaseBl * syncedScaleBl) / postUnitLab,
                (convexBaseBl * syncedScaleBl) / postUnitLin,
                convexBaseMd * syncedScaleMd,
                psi,
              ),
            sh,
          );
          for (let col = 0; col < ANGULAR_COLS; col += 1) {
            const cap = marginCap[col]!;
            if (!Number.isFinite(cap)) continue;
            const theta = (col / ANGULAR_COLS) * Math.PI * 2;
            const dz0 = smoothMarginZAt(theta) - meanMarginZ;
            const radialFix: Vec3 = [Math.cos(theta), Math.sin(theta), 0];
            const gu = dot3(radialFix, frame.uLabial);
            const gv = dot3(radialFix, frame.vSide);
            if (Math.hypot(gu, gv) < 0.2) continue;
            const uOff = dz0 * frame.uLabial[2];
            const vOff = dz0 * frame.vSide[2];
            const rFix = offsetSolver.solveRay(
              uOff,
              vOff,
              gu,
              gv,
              minSolveMarginR,
            ).t;
            const r0AtCol = Math.hypot(uOff + rFix * gu, vOff + rFix * gv);
            if (Number.isFinite(r0AtCol) && r0AtCol > cap + 1e-4) {
              const def = 1 - cap / r0AtCol;
              if (def > worstDef) {
                worstDef = def;
                worstWu = colDuFix[col]! * colDuFix[col]!;
              }
            }
          }
          if (worstDef <= 1e-4) break;
          const crossShare = tpl.kind === "premolar" ? 0.1 : 0.28;
          syncedScaleBl *= 1 - worstDef * (crossShare + (1 - crossShare) * worstWu) - 0.002;
          syncedScaleMd *= 1 - worstDef * (crossShare + (1 - crossShare) * (1 - worstWu)) - 0.002;
        }
        const syncedBaseScale = Math.min(syncedScaleBl, syncedScaleMd);
        const minTaperDropBl = minWallTaperSlope * hRefSpan * Math.max(1, postUnitLab, postUnitLin);
        const minTaperDropMd = (minWallTaperSlope * hRefSpan) / Math.max(0.8, postUnitMd);
        const wantDropBl = Math.max(minTaperDropBl, (convexBaseBl - convexTopBl) * syncedScaleBl);
        const wantDropMd = Math.max(minTaperDropMd, (convexBaseMd - convexTopMd) * syncedScaleMd);
        let topPosU = pSecCu + Math.min(convexTopBl * syncedScaleBl, convexBaseBl * syncedScaleBl - minTaperDropBl);
        let topNegU = -pSecCu + Math.min(convexTopBl * syncedScaleBl, convexBaseBl * syncedScaleBl - minTaperDropBl);
        let topPosV = pSecCv + Math.min(convexTopMd * syncedScaleMd, convexBaseMd * syncedScaleMd - minTaperDropMd);
        let topNegV = -pSecCv + Math.min(convexTopMd * syncedScaleMd, convexBaseMd * syncedScaleMd - minTaperDropMd);
        topPosU = Math.max(topPosU, uScrewTop + screwTightR);
        topNegU = Math.max(topNegU, -uScrewTop + screwTightR);
        topPosV = Math.max(topPosV, vScrewTop + screwTightMd);
        topNegV = Math.max(topNegV, -vScrewTop + screwTightMd);
        pSecCu = (topPosU - topNegU) * 0.5;
        pSecCv = (topPosV - topNegV) * 0.5;
        finalTopBlScaled = Math.max(minPostR, (topPosU + topNegU) * 0.5);
        finalTopMdScaled = Math.max(minPostR, (topPosV + topNegV) * 0.5);
        const rawGeomDropBl = Math.max(0.005, convexBaseBl * syncedScaleBl - finalTopBlScaled);
        const rawGeomDropMd = Math.max(
          0.005,
          (convexBaseMd * syncedScaleMd - finalTopMdScaled) * Math.max(0.8, postUnitMd),
        );
        const rawGeomDeg = Math.atan(Math.min(rawGeomDropBl, rawGeomDropMd) / hRefSpan) / DEG;
        if (rawGeomDeg < RETENTION_SINGLE_MIN_TAPER_DEG - 0.05) {
          geomIdealTaperDeg = Math.max(0.1, Math.floor(rawGeomDeg * 10) / 10);
        }
        effUniformShoulder = Math.max(MIN_MARGIN_SHOULDER_MM, uniformShoulder * syncedBaseScale);
        finalBaseBl = Math.max(
          minPostR + 0.08,
          convexBaseBl * syncedScaleBl,
          finalTopBlScaled + wantDropBl,
        );
        finalBaseMd = Math.max(
          minPostR + 0.08,
          convexBaseMd * syncedScaleMd,
          finalTopMdScaled + wantDropMd,
        );
        if (tpl.kind === "premolar") {
          const minTopMdScrew = Math.max(
            minPostR,
            Math.abs(vScrewTop - pSecCv) + screwTightMd,
          );
          const minBaseMdScrew = Math.max(
            minPostR + 0.08,
            Math.abs(vScrewBase - pSecCv) + screwBaseTightMd,
            minTopMdScrew + minTaperDropMd,
          );
          const maxPremolarBaseMd = Math.max(
            minBaseMdScrew,
            (finalBaseBl + effUniformShoulder) / 1.18 - effUniformShoulder,
          );
          if (finalBaseMd > maxPremolarBaseMd) {
            const dropKeep = Math.max(minTaperDropMd, finalBaseMd - finalTopMdScaled);
            finalBaseMd = maxPremolarBaseMd;
            finalTopMdScaled = Math.max(minTopMdScrew, Math.min(finalTopMdScaled, finalBaseMd - dropKeep));
          }
          const wantPremolarBl = (finalBaseMd + effUniformShoulder) * 1.13 - effUniformShoulder;
          if (finalBaseBl < wantPremolarBl) {
            let capBlPremolar = Infinity;
            for (let col = 0; col < ANGULAR_COLS; col += 1) {
              if (Math.abs(colDuFix[col]!) >= Math.cos(18 * DEG)) {
                capBlPremolar = Math.min(capBlPremolar, marginCap[col]! - Math.abs(pSecCu));
              }
            }
            finalBaseBl = Math.max(
              finalBaseBl,
              Math.min(wantPremolarBl, capBlPremolar - effUniformShoulder),
            );
          }
        }

        // 스크류 재보정 뒤 등폭 병행 마진이 marginCap을 넘으면 여유 있는 상단 반폭·편심 중심·숄더를 함께 정돈해
        // 열별 클리핑 없이도 인접 경계 및 커프 한도(marginCap) 안쪽에 매끈하게 들어오게 한다.
        for (let postCapIt = 0; postCapIt < 12; postCapIt += 1) {
          const offsetSolver = buildParallelOffsetMarginSolver(
            pSecCu,
            pSecCv,
            (psi) =>
              evalPostSectionRadiusAtPhi(
                tpl.kind,
                finalBaseBl / postUnitLab,
                finalBaseBl / postUnitLin,
                finalBaseMd,
                psi,
              ),
            effUniformShoulder,
          );
          const curM = new Float64Array(ANGULAR_COLS);
          let worstExMm = 0;
          let worstWu = 0.5;
          let worstCol = -1;
          for (let col = 0; col < ANGULAR_COLS; col += 1) {
            const theta = (col / ANGULAR_COLS) * Math.PI * 2;
            const dz0 = smoothMarginZAt(theta) - meanMarginZ;
            const radialFix: Vec3 = [Math.cos(theta), Math.sin(theta), 0];
            const gu = dot3(radialFix, frame.uLabial);
            const gv = dot3(radialFix, frame.vSide);
            if (Math.hypot(gu, gv) < 0.2) {
              curM[col] = minSolveMarginR;
              continue;
            }
            const uOff = dz0 * frame.uLabial[2];
            const vOff = dz0 * frame.vSide[2];
            const rFix = offsetSolver.solveRay(
              uOff,
              vOff,
              gu,
              gv,
              minSolveMarginR,
            ).t;
            const r0AtCol = Math.hypot(uOff + rFix * gu, vOff + rFix * gv);
            curM[col] = r0AtCol;
            const cap = marginCap[col]!;
            if (!Number.isFinite(cap)) continue;
            if (r0AtCol > cap + 1e-4) {
              const exMm = r0AtCol - cap;
              if (exMm > worstExMm) {
                worstExMm = exMm;
                worstWu = colDuFix[col]! * colDuFix[col]!;
                worstCol = col;
              }
            }
          }
          if (worstExMm <= 1e-4 || worstCol < 0) break;

          const remEx = worstExMm;
          const wDu = colDuFix[worstCol]!;
          const wDv = colDvFix[worstCol]!;
          const reqPosUBase = Math.max(
            minPostR + 0.08,
            uScrewBase + screwBaseTightR,
            uScrewTop + screwTightR + minTaperDropBl,
          );
          const reqNegUBase = Math.max(
            minPostR + 0.08,
            -uScrewBase + screwBaseTightR,
            -uScrewTop + screwTightR + minTaperDropBl,
          );
          const reqPosVBase = Math.max(
            minPostR + 0.08,
            vScrewBase + screwBaseTightMd,
            vScrewTop + screwTightMd + minTaperDropMd,
          );
          const reqNegVBase = Math.max(
            minPostR + 0.08,
            -vScrewBase + screwBaseTightMd,
            -vScrewTop + screwTightMd + minTaperDropMd,
          );
          let bPosU = pSecCu + finalBaseBl;
          let bNegU = -pSecCu + finalBaseBl;
          let bPosV = pSecCv + finalBaseMd;
          let bNegV = -pSecCv + finalBaseMd;
          const prevPosU = bPosU;
          const prevNegU = bNegU;
          const prevPosV = bPosV;
          const prevNegV = bNegV;
          const capCrossShare = tpl.kind === "premolar" ? 0.08 : 0.28;
          const dropU = remEx * (capCrossShare + (1 - capCrossShare) * worstWu);
          const dropV = remEx * (capCrossShare + (1 - capCrossShare) * (1 - worstWu));
          bPosU = Math.max(reqPosUBase, bPosU - dropU);
          bNegU = Math.max(reqNegUBase, bNegU - dropU);
          bPosV = Math.max(reqPosVBase, bPosV - dropV);
          bNegV = Math.max(reqNegVBase, bNegV - dropV);
          const shrunk = Math.hypot(
            prevPosU - bPosU + (prevNegU - bNegU),
            prevPosV - bPosV + (prevNegV - bNegV),
          );
          pSecCu = (bPosU - bNegU) * 0.5;
          pSecCv = (bPosV - bNegV) * 0.5;
          finalBaseBl = Math.max(minPostR + 0.08, (bPosU + bNegU) * 0.5);
          finalBaseMd = Math.max(minPostR + 0.08, (bPosV + bNegV) * 0.5);
          const tPosU = Math.min(bPosU - minTaperDropBl, Math.max(pSecCu + finalTopBlScaled, uScrewTop + screwTightR));
          const tNegU = Math.min(bNegU - minTaperDropBl, Math.max(-pSecCu + finalTopBlScaled, -uScrewTop + screwTightR));
          const tPosV = Math.min(bPosV - minTaperDropMd, Math.max(pSecCv + finalTopMdScaled, vScrewTop + screwTightMd));
          const tNegV = Math.min(bNegV - minTaperDropMd, Math.max(-pSecCv + finalTopMdScaled, -vScrewTop + screwTightMd));
          finalTopBlScaled = Math.max(minPostR, (tPosU + tNegU) * 0.5);
          finalTopMdScaled = Math.max(minPostR, (tPosV + tNegV) * 0.5);
          if (shrunk < remEx * 0.45) {
            effUniformShoulder = Math.max(
              MIN_MARGIN_SHOULDER_MM,
              effUniformShoulder - (remEx - shrunk) * 0.8 - 0.002,
            );
          }
        }

        // 확정된 매끈한 포스트 단면의 정확한 등폭 병행 곡선 γ_M = γ_P ⊕ B(0, effUniformShoulder)으로
        // 피니시라인을 풀고, 실제 144열 3D 포스트 정점의 스크류 벽 여유가 부족하면
        // 상단 반폭 보강 또는 편심 중심(pSecCu, pSecCv) 복귀만으로 메워 원호 배불뚝이(needsScrewPush)를 막는다.
        const solvePosteriorMarginAndWalls = () => {
          const offsetSolver = buildParallelOffsetMarginSolver(
            pSecCu,
            pSecCv,
            (psi) =>
              evalPostSectionRadiusAtPhi(
                tpl.kind,
                finalBaseBl / postUnitLab,
                finalBaseBl / postUnitLin,
                finalBaseMd,
                psi,
              ),
            effUniformShoulder,
          );
          const solved = solveSmoothOffsetMarginLoop(
            offsetSolver,
            smoothMarginZAt,
            meanMarginZ,
            frame,
            minSolveMarginR,
            minMarginZ,
            maxMarginZ,
            occInFix,
          );
          marginRadii = solved.radii;
          marginColZs = solved.zCols;
          colFootPsis = solved.footPsis;
          colDuLats = solved.duLats;
          colDvLats = solved.dvLats;
          mHalfBl = finalBaseBl + effUniformShoulder;
          mHalfMd = finalBaseMd + effUniformShoulder;
          syncColsMarginGeometry();
          buildPosteriorWallColumns(
            pSecCu,
            pSecCv,
            finalBaseBl,
            finalBaseMd,
            finalTopBlScaled,
            finalTopMdScaled,
            colFootPsis,
            colDuLats,
            colDvLats,
          );
        };

        solvePosteriorMarginAndWalls();
        const minCuffMarginR = Math.max(minSolveMarginR + 0.02, coneTopR + 0.22);
        for (let exactIt = 0; exactIt < 6; exactIt += 1) {
          const surfZExact = meanMarginZ + top.heightAt(pSecCu, pSecCv) / axialCos;
          const boreExact = resolveScrewChannelProfile(conn, surfZExact);
          let worstDef = 0;
          let worstCol = -1;
          let worstK = POST_LEVELS;
          let fromCuffFloor = false;
          for (let col = 0; col < ANGULAR_COLS; col += 1) {
            const cuffDef = minCuffMarginR - marginRadii[col]!;
            if (cuffDef > worstDef + 1e-4) {
              worstDef = cuffDef;
              worstCol = col;
              worstK = 0;
              fromCuffFloor = true;
            }
            const wallPts = postWallPtsByCol[col]!;
            for (let k = 0; k <= POST_LEVELS; k += 1) {
              const pt = wallPts[k]!;
              const req =
                k === POST_LEVELS
                  ? boreExact.radiusAtZ(pt[2] + topRoundMm * 0.65) + strictPostWallMm + strictTopCornerMm
                  : boreExact.radiusAtZ(pt[2]) + strictPostWallMm;
              const rXY = Math.hypot(pt[0], pt[1]);
              if (rXY < req - 1e-4) {
                const def = req - rXY;
                if (def > worstDef) {
                  worstDef = def;
                  worstCol = col;
                  worstK = k;
                  fromCuffFloor = false;
                }
              }
            }
          }
          if (worstDef <= 1e-4 || worstCol < 0) break;
          const wPsi = colFootPsis[worstCol]!;
          const cpW = Math.cos(wPsi);
          const spW = Math.sin(wPsi);
          const wu = cpW * cpW;
          const needPlane = (fromCuffFloor ? worstDef / Math.max(colProjScale[worstCol]!, 0.5) : worstDef / axialCos) + 0.004;

          // 1순위: 상단(k > 0) 부족분은 마진 외경을 넓히지 않고 상단 반폭(finalTopBl/Md)을 먼저 키워 흡수한다.
          let remNeed = needPlane;
          if (worstK > 0 && !fromCuffFloor) {
            const roomBl = Math.max(0, finalBaseBl - 0.025 - finalTopBlScaled);
            const roomMd = Math.max(0, finalBaseMd - 0.025 - finalTopMdScaled);
            const addBl = Math.min(roomBl, remNeed * (0.25 + 0.75 * wu));
            const addMd = Math.min(roomMd, remNeed * (0.25 + 0.75 * (1 - wu)));
            finalTopBlScaled += addBl;
            finalTopMdScaled += addMd;
            remNeed = Math.max(0, remNeed - Math.hypot(addBl, addMd));
          }
          // 2순위: 편심으로 한쪽 벽이 스크류에 가까워진 경우(#37 등), 반대편 스크류 여유와 marginCap 안에서 중심을 되돌린다.
          const oppColExact = (worstCol + ANGULAR_COLS / 2) % ANGULAR_COLS;
          if (remNeed > 1e-4) {
            const capAtWorst = marginCap[worstCol]!;
            const capRoomMm = Number.isFinite(capAtWorst)
              ? Math.max(0, capAtWorst - cols[worstCol]!.r0)
              : remNeed;
            const oppTopPt = postWallPtsByCol[oppColExact]![POST_LEVELS]!;
            const oppReqTop =
              boreExact.radiusAtZ(oppTopPt[2] + topRoundMm * 0.65) + strictPostWallMm + strictTopCornerMm;
            const oppScrewSlackMm = Math.max(0, Math.hypot(oppTopPt[0], oppTopPt[1]) - oppReqTop - 0.02);
            const shiftAmt = Math.min(remNeed, capRoomMm * 0.85, oppScrewSlackMm * 0.85, 0.35);
            if (shiftAmt > 1e-4) {
              const nextCu = pSecCu + cpW * shiftAmt;
              const nextCv = pSecCv + spW * shiftAmt;
              if (Math.hypot(nextCu, nextCv) <= Math.hypot(pSecCu, pSecCv) + 0.08) {
                pSecCu = nextCu;
                pSecCv = nextCv;
                remNeed = Math.max(0, remNeed - shiftAmt);
              }
            }
          }
          // 3순위: 여전히 부족하고 양쪽(worstCol·반대편 oppCol) 모두 marginCap 여유가 있을 때만 대칭 반폭을 소폭 확장한다.
          if (remNeed > 1e-4) {
            const capAtWorst = marginCap[worstCol]!;
            const capRoomWorst = Number.isFinite(capAtWorst)
              ? Math.max(0, capAtWorst - cols[worstCol]!.r0)
              : remNeed;
            const capAtOpp = marginCap[oppColExact]!;
            const capRoomOpp = Number.isFinite(capAtOpp)
              ? Math.max(0, capAtOpp - cols[oppColExact]!.r0)
              : remNeed;
            const grow = Math.min(remNeed, capRoomWorst * 0.85, capRoomOpp * 0.85);
            if (grow > 1e-4) {
              const gBl = grow * (0.25 + 0.75 * wu);
              const gMd = grow * (0.25 + 0.75 * (1 - wu));
              finalBaseBl += gBl;
              finalBaseMd += gMd;
              finalTopBlScaled = Math.min(finalBaseBl - 0.025, finalTopBlScaled + gBl);
              finalTopMdScaled = Math.min(finalBaseMd - 0.025, finalTopMdScaled + gMd);
            }
          }
          solvePosteriorMarginAndWalls();
        }
        {
          let maxMarginShift = 0;
          for (let col = 0; col < ANGULAR_COLS; col += 1) {
            maxMarginShift = Math.max(
              maxMarginShift,
              Math.abs(marginRadii[col]! - initMarginRadii[col]!),
            );
          }
          if (maxMarginShift > 0.08) {
            smoothMarginZ = drapeMarginZForRadii(marginRadii);
            meanMarginZ = smoothMarginZ.reduce((s, v) => s + v, 0) / SECTORS;
            smoothMarginZAt = buildPeriodicSmoothCurve(smoothMarginZ, 3);
            solvePosteriorMarginAndWalls();
          }
        }

        pTopCu = pSecCu;
        pTopCv = pSecCv;
        topFaceCu = pSecCu;
        topFaceCv = pSecCv;
        mCu = pSecCu;
        mCv = pSecCv;
        lockedPosteriorBase = {
          pSecCu,
          pSecCv,
          finalBaseBl,
          finalBaseMd,
          effUniformShoulder,
          geomIdealTaperDeg,
          footPsis: [...colFootPsis!],
          duLats: [...colDuLats],
          dvLats: [...colDvLats],
        };
      }
    } else {
      // 전치부·견치(1·2·3번, 알토란·우리기공소 이춘식 #33, 남정헌 #13·#23, 정성윤 #22·#23, 남덕순 #42·#43 실측 + ToothAnatomy DB):
      // 1) 단면은 엄밀 볼록 게이지(견치: 모서리가 둥근 역삼각형/마름모, 절치: 순측호-역삼각 난원형)만 사용해 땅콩형 오목을 원천 차단한다.
      // 2) 근원심·순설 공간이 좁아 스크류 홀 360° 외벽을 끝까지 감싸면 마진 폭이 죽거나 마진 위가 역전되는 케이스(이춘식 #33 알토란기공소 STL 실측)에서는
      //    전 둘레 보철물 안착 마진 폭(≥ MIN_MARGIN_SHOULDER_MM, ~0.30~0.40mm)과 치관 중앙 테이퍼 포스트를 최우선으로 지키고
      //    스크류 홀은 가까운 사면(순측·근심순측 사면)으로 자연스럽게 비스듬히 개구시킨다.
      // 3) 설측은 마진에서 postLingualBevelMm(포스트 높이 미만)까지 2° 축벽을 유지하고,
      //    그 위부터 절단까지 단일 평면 사선으로 싱귤럼을 깎는다. 절치는 상단 순설을 인접 자연치처럼 좁은 삽형으로 둔다.
      const cingulumPlan = anteriorCingulumPlan(
        tpl.anatomy.morphology.cingulum.bevelAngleDeg,
        tpl.anatomy.morphology.cingulum.collarHeightRatio,
        anteriorNeighborSideDeg,
        tpl.kind,
        incisorNeighborBevelDeg,
      );
      const hasExplicitLingualBevel =
        !lockBasePass &&
        Number.isFinite(params.postLingualBevelMm) &&
        params.postLingualBevelMm >= 0;
      const estAntTaperSlope = Math.tan(
        Math.max(RETENTION_SINGLE_MIN_TAPER_DEG, effectiveTaperDeg) * DEG,
      );
      const estAntDropBl = estAntTaperSlope * hRefSpanEst * Math.max(1, postUnitLab, postUnitLin);
      const estAntDropMd = estAntTaperSlope * hRefSpanEst;
      let capAntPosUInit = Infinity;
      let capAntNegUInit = Infinity;
      let capAntPosVInit = Infinity;
      let capAntNegVInit = Infinity;
      for (let col = 0; col < ANGULAR_COLS; col += 1) {
        if (colDuFix[col]! >= Math.cos(22 * DEG)) capAntPosUInit = Math.min(capAntPosUInit, marginCap[col]!);
        if (-colDuFix[col]! >= Math.cos(22 * DEG)) capAntNegUInit = Math.min(capAntNegUInit, marginCap[col]!);
        if (colDvFix[col]! >= Math.cos(22 * DEG)) capAntPosVInit = Math.min(capAntPosVInit, marginCap[col]!);
        if (-colDvFix[col]! >= Math.cos(22 * DEG)) capAntNegVInit = Math.min(capAntNegVInit, marginCap[col]!);
      }
      const screwSafeR = boreTopR + MIN_FRACTURE_SAFE_POST_WALL_MM + 0.03;
      const reqWrapLabMargin =
        Math.max(Math.abs(uScrewTop), Math.abs(uScrewBase)) +
        screwSafeR +
        estAntDropBl +
        MIN_MARGIN_SHOULDER_MM;
      const availPosUWrap = Math.min(capAntPosUInit, Math.max(mExtPosU, maxAnatHalfBl * params.marginSizeScale));
      const availNegUWrap = Math.min(capAntNegUInit, Math.max(mExtNegU, maxAnatHalfBl * params.marginSizeScale));
      const availPosVWrap = Math.min(capAntPosVInit, Math.max(mExtPosV, maxAnatHalfMd * params.marginSizeScale));
      const availNegVWrap = Math.min(capAntNegVInit, Math.max(mExtNegV, maxAnatHalfMd * params.marginSizeScale));
      const needPosVWrap = Math.max(vScrewTop, vScrewBase) + screwSafeR + estAntDropMd + MIN_MARGIN_SHOULDER_MM;
      const needNegVWrap = Math.max(-vScrewTop, -vScrewBase) + screwSafeR + estAntDropMd + MIN_MARGIN_SHOULDER_MM;
      const canWrapBl =
        reqWrapLabMargin <= maxAnatHalfBl * params.marginSizeScale + 0.35 &&
        Math.max(uScrewTop, uScrewBase) + screwSafeR + estAntDropBl + MIN_MARGIN_SHOULDER_MM <= availPosUWrap + 0.22 &&
        Math.max(-uScrewTop, -uScrewBase) + screwSafeR + estAntDropBl + MIN_MARGIN_SHOULDER_MM <= availNegUWrap + 0.22;
      const canWrapMd =
        needPosVWrap <= availPosVWrap + (supragingivalRaisedForStrength && params.marginSizeScale >= 0.97 ? 0.28 : 0.04) &&
        needNegVWrap <= availNegVWrap + (supragingivalRaisedForStrength && params.marginSizeScale >= 0.97 ? 0.28 : 0.04);
      const reqWrapMdMargin =
        Math.max(Math.abs(vScrewTop), Math.abs(vScrewBase)) +
        screwSafeR +
        estAntDropMd +
        MIN_MARGIN_SHOULDER_MM;
      wrapAnteriorScrew360 =
        canWrapBl &&
        (canWrapMd ||
          (isSupragingivalMargin &&
            params.marginSizeScale >= 0.95 &&
            angulationDeg <= 13.5 &&
            reqWrapMdMargin <= maxAnatHalfMd + 0.45));
      // 절치는 스크류를 360°로 감싸 원기둥이 되지 않게 한다. 홀은 설측·절단 사면으로 열고 순설은 삽형으로 좁힌다.
      if (tpl.kind === "incisor") wrapAnteriorScrew360 = false;
      const maxTopShiftU = wrapAnteriorScrew360 ? 1.55 : tpl.kind === "incisor" ? 1.25 : 0.72;
      const maxTopShiftV = 1.35;
      pTopCu = wrapAnteriorScrew360
        ? clamp(uScrewTop * 0.72 + (tpl.kind === "canine" ? 0.16 : 0.12), -maxTopShiftU, maxTopShiftU)
        : clamp(mCu * 0.75 + (tpl.kind === "canine" ? 0.22 : 0.16), -0.55, maxTopShiftU);
      // 근원심(v) 중심은 하단(pBaseCv)과 일치시켜 삽입축 평행과 좌우 대칭 편측 테이퍼를 지킨다.
      pTopCv = wrapAnteriorScrew360
        ? clamp(vScrewTop * 0.5 + mCv * 0.5, -maxTopShiftV, maxTopShiftV)
        : mCv;
      if (tpl.kind === "incisor") {
        // 삽형은 순측에 두고 설측을 비운다. 딥바이트면 설측 모서리가 가까운 대합 밖으로 나오게 더 옮긴다.
        let nextCu = pTopCu + 0.32;
        if (incisorDeepBite) nextCu = Math.max(nextCu, incisorPalatalContactU + 2.0);
        pTopCu = clamp(nextCu, -0.15, maxTopShiftU);
      }
      const screwAxialExitW = () =>
        wrapAnteriorScrew360
          ? 1
          : 1 - smootherstep(clamp((Math.hypot(uScrewTop - pTopCu, vScrewTop - pTopCv) - 0.45) / 0.65, 0, 1));
      const minLabCollar = () => {
        const capLab = Math.max(0.75, mExtPosU - MIN_MARGIN_SHOULDER_MM - pTopCu - estAntDropBl * 0.85);
        const want = wrapAnteriorScrew360
          ? Math.max(0.88, uScrewTop - pTopCu + screwSafeR)
          : Math.max(
              0.88,
              0.88 +
                screwAxialExitW() *
                  Math.max(0, uScrewTop - pTopCu + boreTopR + ANTERIOR_SCREW_WALL_MM - 0.88),
            );
        return wrapAnteriorScrew360 ? want : Math.min(want, capLab);
      };
      const minLinCollar = () => {
        const capLin = Math.max(0.62, mExtNegU - MIN_MARGIN_SHOULDER_MM + pTopCu - estAntDropBl * 0.85);
        const want =
          wrapAnteriorScrew360 || uScrewTop >= 0
            ? Math.max(0.64, -(uScrewTop - pTopCu) + screwSafeR)
            : Math.max(
                0.66,
                0.66 +
                  screwAxialExitW() *
                    Math.max(0, -(uScrewTop - pTopCu) + boreTopR + ANTERIOR_SCREW_LINGUAL_WALL_MM - 0.66),
              );
        return wrapAnteriorScrew360 ? want : Math.min(want, capLin);
      };
      const minMdCollar = () => {
        const availTopMdFromMargin = Math.max(
          0.78,
          Math.min(mExtPosV - pTopCv, mExtNegV + pTopCv) - MIN_MARGIN_SHOULDER_MM - estAntDropMd * 0.85,
        );
        if (!wrapAnteriorScrew360) {
          const softReq =
            0.95 +
            screwAxialExitW() * Math.max(0, Math.abs(vScrewTop - pTopCv) + screwSafeR - 0.95);
          return Math.min(availTopMdFromMargin, Math.max(0.88, Math.min(maxAnatHalfMd + 0.1, softReq)));
        }
        const reqMd = Math.abs(vScrewTop - pTopCv) + screwSafeR + 0.02;
        return Math.max(0.95, Math.min(maxAnatHalfMd + 0.15, reqMd));
      };

      const screwBaseExitW = wrapAnteriorScrew360
        ? 1
        : 1 - smootherstep(clamp((Math.hypot(uScrewBase - mCu, vScrewBase - mCv) - 0.55) / 0.7, 0, 1));
      const minAntBasePosU = wrapAnteriorScrew360
        ? Math.max(0.95, uScrewBase + screwSafeR)
        : Math.min(
            Math.max(0.82, mExtPosU - MIN_MARGIN_SHOULDER_MM),
            Math.max(0.92, 0.92 + screwBaseExitW * Math.max(0, uScrewBase + screwSafeR - 0.92)),
          );
      const minAntBaseNegU = wrapAnteriorScrew360
        ? Math.max(0.88, -uScrewBase + screwSafeR)
        : Math.min(
            Math.max(0.78, mExtNegU - MIN_MARGIN_SHOULDER_MM),
            Math.max(0.86, 0.86 + screwBaseExitW * Math.max(0, -uScrewBase + screwSafeR - 0.86)),
          );
      const minAntBasePosV = wrapAnteriorScrew360
        ? Math.max(1.02, Math.min(maxAnatHalfMd + 0.22, vScrewBase + screwSafeR + 0.02))
        : Math.min(
            Math.max(0.84, mExtPosV - MIN_MARGIN_SHOULDER_MM),
            Math.max(0.96, 0.96 + screwBaseExitW * Math.max(0, vScrewBase + screwSafeR - 0.96)),
          );
      const minAntBaseNegV = wrapAnteriorScrew360
        ? Math.max(1.02, Math.min(maxAnatHalfMd + 0.22, -vScrewBase + screwSafeR + 0.02))
        : Math.min(
            Math.max(0.84, mExtNegV - MIN_MARGIN_SHOULDER_MM),
            Math.max(0.96, 0.96 + screwBaseExitW * Math.max(0, -vScrewBase + screwSafeR - 0.96)),
          );

      const antBaseUniformW = targetShoulderW;
      const antBaseExtraW = { posU: 0, negU: 0, posV: 0, negV: 0 };
      let pBaseCu = mCu;
      let pBaseCv = mCv;
      let pBaseBl = Math.max(0.98, mHalfBl - targetShoulderW);
      let pBaseMd = Math.max(1.08, mHalfMd - targetShoulderW);

      const syncAnteriorBase = (reqPosU: number, reqNegU: number, reqPosV: number, reqNegV: number) => {
        const maxPosU = Math.max(MIN_MARGIN_SHOULDER_MM, mExtPosU - Math.max(minAntBasePosU, reqPosU));
        const maxNegU = Math.max(MIN_MARGIN_SHOULDER_MM, mExtNegU - Math.max(minAntBaseNegU, reqNegU));
        const maxPosV = Math.max(MIN_MARGIN_SHOULDER_MM, mExtPosV - Math.max(minAntBasePosV, reqPosV));
        const maxNegV = Math.max(MIN_MARGIN_SHOULDER_MM, mExtNegV - Math.max(minAntBaseNegV, reqNegV));
        const wPosU = clamp(
          Math.min(antBaseUniformW + antBaseExtraW.posU, maxPosU),
          MIN_MARGIN_SHOULDER_MM,
          Math.max(MIN_MARGIN_SHOULDER_MM, mExtPosU - 0.92),
        );
        const wNegU = clamp(
          Math.min(antBaseUniformW + antBaseExtraW.negU, maxNegU),
          MIN_MARGIN_SHOULDER_MM,
          Math.max(MIN_MARGIN_SHOULDER_MM, mExtNegU - 0.88),
        );
        const wPosV = clamp(
          Math.min(antBaseUniformW + antBaseExtraW.posV, maxPosV),
          MIN_MARGIN_SHOULDER_MM,
          Math.max(MIN_MARGIN_SHOULDER_MM, mExtPosV - 1.02),
        );
        const wNegV = clamp(
          Math.min(antBaseUniformW + antBaseExtraW.negV, maxNegV),
          MIN_MARGIN_SHOULDER_MM,
          Math.max(MIN_MARGIN_SHOULDER_MM, mExtNegV - 1.02),
        );
        const bPosU = mExtPosU - wPosU;
        const bNegU = mExtNegU - wNegU;
        const bPosV = mExtPosV - wPosV;
        const bNegV = mExtNegV - wNegV;
        pBaseCu = (bPosU - bNegU) * 0.5;
        pBaseBl = Math.max(0.95, (bPosU + bNegU) * 0.5);
        pBaseCv = (bPosV - bNegV) * 0.5;
        pBaseMd = Math.max(1.05, (bPosV + bNegV) * 0.5);
        return { maxPosU, maxNegU, maxPosV, maxNegV, bPosU, bNegU, bPosV, bNegV };
      };

      syncAnteriorBase(
        pTopCu + minLabCollar() + 0.08,
        -pTopCu + minLinCollar() + 0.08,
        pTopCv + minMdCollar() + 0.08,
        -pTopCv + minMdCollar() + 0.08,
      );
      const tplLinHalf = Math.max(tpl.topLingualHalfMm * blScale * params.postWidthScale, minLinCollar());
      const keepBl = Math.max(0.98, pBaseBl - (taperSlope / meanPostUnitR) * hRefSpanEst);
      const keepMd = Math.max(1.12, pBaseMd - (taperSlope / meanPostUnitR) * hRefSpanEst);
      // 순측·근원심은 원래 로직처럼 유지 테이퍼(keepBl/keepMd)에서 출발해 예측 크라운 - 1mm(capR) 안쪽으로 자연 수렴시키고,
      // 설측만 싱귤럼 사선 삭제로 상단 반폭(tplLinHalf)까지 깊게 깎아 보철 싱귤럼·설면와 공간을 확보한다.
      let topLabHalf = Math.max(minLabCollar(), keepBl);
      let topLinHalf = Math.min(keepBl, Math.max(minLinCollar(), tplLinHalf));
      let topMdHalf = Math.max(minMdCollar(), keepMd);
      if (tpl.kind === "incisor") {
        // 상단 순설은 인접 자연치 절단 폭(없으면 치종 템플릿)까지 좁힌다. 치경부는 마진 폭을 유지해 싱귤럼이 앉는다.
        const shovelLab = Math.max(
          1.15,
          Math.max(tpl.topLabialHalfMm, 1.62) * blScale * params.postWidthScale * incisorShovelScale,
        );
        const shovelLin = Math.max(0.72, tpl.topLingualHalfMm * blScale * params.postWidthScale * incisorShovelScale);
        topLabHalf = Math.max(1.05, Math.min(topLabHalf, shovelLab + 0.18));
        topLinHalf = Math.min(topLinHalf, shovelLin);
        if (incisorDeepBite) {
          topLinHalf = Math.min(topLinHalf, Math.max(0.62, pTopCu - incisorPalatalContactU - 1.15));
        }
      }

      // 하단·중단·상단 모두 크라운 목표 두께(capR, 1.0mm)와 최소 지르코니아 두께(hardCapR, 0.7mm)를 침범하지 않도록
      // 반복 루프 안에서 해부 단면 반축과 중심(pTopCu, pTopCv)을 함께 조정한다(루프 밖 열별 클리핑 금지 → 100% 볼록 단면 유지).
      const antCheckLevels = [
        Math.round(POST_LEVELS * 0.35),
        Math.round(POST_LEVELS * 0.7),
        POST_LEVELS,
      ];
      for (let iter = 0; iter < 20; iter += 1) {
        const limShift = wrapAnteriorScrew360
          ? Math.hypot(maxTopShiftU, maxTopShiftV)
          : Math.max(0.12, Math.min(topLabHalf + topLinHalf, topMdHalf * 1.4) * 0.52);
        pTopCu = clamp(pTopCu, -maxTopShiftU, maxTopShiftU);
        pTopCv = clamp(pTopCv, -maxTopShiftV, maxTopShiftV);
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
        topLabHalf = Math.min(topLabHalf, baseState.bPosU - pTopCu - 0.05);
        topLinHalf = Math.min(topLinHalf, baseState.bNegU + pTopCu - 0.05);
        topMdHalf = Math.min(
          topMdHalf,
          Math.min(baseState.bPosV - pTopCv, baseState.bNegV + pTopCv) - 0.05,
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
                ? Math.max(0.75, Math.min(capR[col]![k]!, hardCapR[col]![k]!))
                : Math.max(0.72, hardCapR[col]![k]!);
              if (!Number.isFinite(boundLvl)) continue;
              const slack = boundLvl - rLvl;
              if (k === POST_LEVELS && Math.abs(dv) >= 0.75) {
                if (dv > 0) minPosVSlack = Math.min(minPosVSlack, slack);
                else minNegVSlack = Math.min(minNegVSlack, slack);
              }
              if (slack < -1e-4) {
                const ex = (-slack) / Math.max(0.42, uLvl);
                if (Math.abs(dv) >= 0.42) {
                  worstTopMd = Math.max(worstTopMd, ex * Math.abs(dv));
                  if (dv > 0) worstPosVEx = Math.max(worstPosVEx, ex * dv);
                  else worstNegVEx = Math.max(worstNegVEx, ex * -dv);
                }
                if (Math.abs(du) >= 0.42) {
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
            0.88,
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
        // 크라운 목표 두께(soft)가 설정 편측 테이퍼(keepBl/keepMd)보다 순측·근원심 상단을 더 좁히지 않는다.
        // 좁히면 패널 테이퍼(예: 2°)와 달리 실제 축벽이 5°~7° 원뿔로 벌어진다.
        // 인접 하드 캡(useSoft=false)만 그 아래로 깎을 수 있다.
        if (useSoft) {
          if (topLabHalf <= Math.max(minLabCollar(), keepBl) + 1e-3) worstTopLab = 0;
          if (topMdHalf <= Math.max(minMdCollar(), keepMd) + 1e-3) worstTopMd = 0;
        }
        if (Math.max(worstTopLab, worstTopLin, worstTopMd, worstBaseEx) <= 1e-3) break;
        if (worstBaseEx > 0) {
          const wu = worstBaseDu * worstBaseDu;
          const wv = worstBaseDv * worstBaseDv;
          if (wu >= 0.06) {
            if (worstBaseDu >= 0) antBaseExtraW.posU += worstBaseEx * (0.3 + 0.6 * wu);
            else antBaseExtraW.negU += worstBaseEx * (0.3 + 0.6 * wu);
          }
          if (wv >= 0.06) {
            if (worstBaseDv >= 0) antBaseExtraW.posV += worstBaseEx * (0.3 + 0.6 * wv);
            else antBaseExtraW.negV += worstBaseEx * (0.3 + 0.6 * wv);
          }
        }
        // 근원심 한쪽이 좁아 중심을 옮길 때는 상단(pTopCv)만 밀지 않고 하단 숄더(antBaseExtraW)를 함께 조절해
        // 하단·상단 근원심 중심을 일치시킨다(상단만 밀면 한쪽 벽이 10° 이상 눕고 반대쪽은 2° 미만으로 무너진다).
        if (worstNegVEx > worstPosVEx + 0.015 && minPosVSlack > 0.03) {
          const shift = Math.min((worstNegVEx - worstPosVEx) * 0.6, minPosVSlack * 0.65, 0.24);
          antBaseExtraW.negV += shift;
          pTopCv = pBaseCv;
          worstTopMd = Math.max(0, worstTopMd - shift * 0.75);
        } else if (worstPosVEx > worstNegVEx + 0.015 && minNegVSlack > 0.03) {
          const shift = Math.min((worstPosVEx - worstNegVEx) * 0.6, minNegVSlack * 0.65, 0.24);
          antBaseExtraW.posV += shift;
          pTopCv = pBaseCv;
          worstTopMd = Math.max(0, worstTopMd - shift * 0.75);
        } else {
          pTopCv = pBaseCv;
        }
        const labFloor = wrapAnteriorScrew360 || useSoft ? minLabCollar() : Math.max(0.8, minLabCollar() - 0.2);
        const linFloor = wrapAnteriorScrew360 || useSoft ? minLinCollar() : Math.max(0.62, minLinCollar() - 0.18);
        const hardMdMin = minMdCollar();
        const mdFloor = useSoft ? minMdCollar() : hardMdMin;
        if (worstTopLab > 0) topLabHalf = Math.max(labFloor, topLabHalf - worstTopLab * 0.78);
        if (worstTopLin > 0) topLinHalf = Math.max(linFloor, topLinHalf - worstTopLin * 0.78);
        if (worstTopMd > 0) topMdHalf = Math.max(mdFloor, topMdHalf - worstTopMd * 0.78);
      }

      const finalBase = syncAnteriorBase(
        pTopCu + minLabCollar() + 0.06,
        -pTopCu + minLinCollar() + 0.06,
        pBaseCv + minMdCollar() + 0.06,
        -pBaseCv + minMdCollar() + 0.06,
      );
      pTopCv = pBaseCv;
      topLabHalf = Math.min(topLabHalf, finalBase.bPosU - pTopCu - 0.04);
      topLinHalf = Math.min(topLinHalf, finalBase.bNegU + pTopCu - 0.04);
      topMdHalf = Math.min(
        topMdHalf,
        Math.min(finalBase.bPosV - pTopCv, finalBase.bNegV + pTopCv) - 0.04,
      );

      let antBaseBl = pBaseBl;
      let antBaseMd = pBaseMd;
      for (let fixIt = 0; fixIt < 10; fixIt += 1) {
        let baseScaleDownBl = 1;
        let baseScaleDownMd = 1;
        let topScaleDownBl = 1;
        let topScaleDownMd = 1;
        for (let col = 0; col < ANGULAR_COLS; col += 1) {
          const c = cols[col]!;
          const du = colPostDu[col]!;
          const dv = colPostDv[col]!;
          const wu = du * du;
          const wv = dv * dv;
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
          const maxR0 = Math.max(0.8, c.r0 - MIN_MARGIN_SHOULDER_MM);
          if (Number.isFinite(r0Ray) && r0Ray > maxR0 + 1e-4) {
            const def0 = 1 - maxR0 / r0Ray;
            baseScaleDownBl = Math.min(baseScaleDownBl, 1 - def0 * (0.14 + 0.86 * wu));
            baseScaleDownMd = Math.min(baseScaleDownMd, 1 - def0 * (0.14 + 0.86 * wv));
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
          if (Number.isFinite(r0Ray) && Number.isFinite(rTopRay)) {
            for (const kFix of [
              Math.round(POST_LEVELS * 0.35),
              Math.round(POST_LEVELS * 0.65),
              POST_LEVELS,
            ]) {
              const uFix = kFix / POST_LEVELS;
              const rFixLvl = r0Ray + (rTopRay - r0Ray) * uFix;
              const maxFixHard = Math.max(0.75, hardCapR[col]![kFix]!);
              if (Number.isFinite(maxFixHard) && rFixLvl > maxFixHard + 1e-4) {
                const defLvl = 1 - maxFixHard / rFixLvl;
                if (uFix < 0.55) {
                  baseScaleDownBl = Math.min(baseScaleDownBl, 1 - defLvl * 0.5 * (0.14 + 0.86 * wu));
                  baseScaleDownMd = Math.min(baseScaleDownMd, 1 - defLvl * 0.5 * (0.14 + 0.86 * wv));
                }
                topScaleDownBl = Math.min(topScaleDownBl, 1 - defLvl * (0.14 + 0.86 * wu));
                topScaleDownMd = Math.min(topScaleDownMd, 1 - defLvl * (0.14 + 0.86 * wv));
              }
            }
          }
        }
        if (
          Math.min(baseScaleDownBl, baseScaleDownMd) >= 0.9995 &&
          Math.min(topScaleDownBl, topScaleDownMd) >= 0.9995
        ) {
          break;
        }
        if (Math.min(baseScaleDownBl, baseScaleDownMd) < 0.9995) {
          antBaseBl = Math.max(0.88, antBaseBl * (baseScaleDownBl - 0.002));
          antBaseMd = Math.max(0.98, antBaseMd * (baseScaleDownMd - 0.002));
        }
        if (Math.min(topScaleDownBl, topScaleDownMd) < 0.9995) {
          topLabHalf = Math.max(0.8, topLabHalf * (topScaleDownBl - 0.002));
          topLinHalf = Math.max(0.62, topLinHalf * (topScaleDownBl - 0.002));
          topMdHalf = Math.max(0.9, topMdHalf * (topScaleDownMd - 0.002));
        }
        topLabHalf = Math.min(topLabHalf, antBaseBl + pBaseCu - pTopCu - 0.04);
        topLinHalf = Math.min(topLinHalf, antBaseBl - pBaseCu + pTopCu - 0.04);
        topMdHalf = Math.min(
          topMdHalf,
          Math.min(antBaseMd + pBaseCv - pTopCv, antBaseMd - pBaseCv + pTopCv) - 0.04,
        );
      }

      const hRefBaseAnt = meanHBaseSum;
      const hRefTopAnt = Math.max(hRefBaseAnt + 0.5, meanRoundStartSum);
      const hRefSpanAnt = hRefTopAnt - hRefBaseAnt;
      const uniformAntShoulder = clamp(antBaseUniformW, 0.24, Math.max(targetShoulderW, 0.8));
      const minAntTaperSlope = Math.tan(
        Math.max(RETENTION_SINGLE_MIN_TAPER_DEG, passTaperDeg) * DEG,
      );
      const minAntDropBl = minAntTaperSlope * hRefSpanAnt * Math.max(1, postUnitLab, postUnitLin);
      const minAntDropMd = minAntTaperSlope * hRefSpanAnt;

      let finalAntBaseBl: number;
      let finalAntBaseMd: number;
      let effAntShoulder: number;
      let antFootPsis: number[];
      let syncedAntScaleBl = 1;
      let syncedAntScaleMd = 1;

      if (!lockBasePass && lockedAnteriorBase) {
        pBaseCu = lockedAnteriorBase.pBaseCu;
        pBaseCv = lockedAnteriorBase.pBaseCv;
        pTopCv = pBaseCv;
        finalAntBaseBl = lockedAnteriorBase.finalAntBaseBl;
        finalAntBaseMd = lockedAnteriorBase.finalAntBaseMd;
        effAntShoulder = lockedAnteriorBase.effAntShoulder;
        wrapAnteriorScrew360 = lockedAnteriorBase.wrapAnteriorScrew360;
        antFootPsis = lockedAnteriorBase.footPsis;
        syncedAntScaleBl = clamp(finalAntBaseBl / Math.max(antBaseBl, 0.5), 0.72, 1.15);
        syncedAntScaleMd = clamp(finalAntBaseMd / Math.max(antBaseMd, 0.5), 0.72, 1.15);
      } else {
        effAntShoulder = clamp(uniformAntShoulder, MIN_MARGIN_SHOULDER_MM, Math.max(targetShoulderW, 0.8));
        finalAntBaseBl = Math.max(0.88, antBaseBl);
        finalAntBaseMd = Math.max(0.98, antBaseMd);
        const curTopLabPre = Math.max(
          wrapAnteriorScrew360 ? minLabCollar() : 0.78,
          Math.min(finalAntBaseBl + pBaseCu - pTopCu - minAntDropBl, Math.max(0.78, topLabHalf)),
        );
        const cingulumBevelTopPre = cingulumTopHalfMm(
          cingulumPlan,
          finalAntBaseBl - pBaseCu + pTopCu,
          minAntDropBl,
          hRefSpanAnt,
          minLinCollar(),
        );
        const curTopLinPre = Math.max(
          minLinCollar(),
          Math.min(
            finalAntBaseBl - pBaseCu + pTopCu - minAntDropBl,
            Math.max(0.64, Math.min(topLinHalf, cingulumBevelTopPre)),
          ),
        );
        const curTopMdPre = Math.max(
          minMdCollar(),
          Math.min(
            Math.min(finalAntBaseMd + pBaseCv - pTopCv, finalAntBaseMd - pBaseCv + pTopCv) - minAntDropMd,
            Math.max(0.9, topMdHalf),
          ),
        );
        const reqBasePosUPre = Math.max(pBaseCu + finalAntBaseBl, pTopCu + curTopLabPre + minAntDropBl);
        const reqBaseNegUPre = Math.max(-pBaseCu + finalAntBaseBl, -pTopCu + curTopLinPre + minAntDropBl);
        const reqBasePosVPre = Math.max(pBaseCv + finalAntBaseMd, pTopCv + curTopMdPre + minAntDropMd);
        const reqBaseNegVPre = Math.max(-pBaseCv + finalAntBaseMd, -pTopCv + curTopMdPre + minAntDropMd);
        pBaseCu = (reqBasePosUPre - reqBaseNegUPre) * 0.5;
        finalAntBaseBl = Math.max(0.88, (reqBasePosUPre + reqBaseNegUPre) * 0.5);
        pBaseCv = (reqBasePosVPre - reqBaseNegVPre) * 0.5;
        finalAntBaseMd = Math.max(0.98, (reqBasePosVPre + reqBaseNegVPre) * 0.5);

        // 전치부도 열별 절단이나 근원심 별도 숄더 축소 없이, 단일 등폭 병행 곡선 γ_M = γ_P ⊕ B(0, effAntShoulder)가
        // 전 둘레 marginCap 안쪽에 들어오도록 중심·반축·균일 숄더를 함께 수렴시킨다.
        for (let matchIt = 0; matchIt < 12; matchIt += 1) {
          const offsetSolver = buildParallelOffsetMarginSolver(
            pBaseCu,
            pBaseCv,
            (psi) =>
              evalPostSectionRadiusAtPhi(
                tpl.kind,
                finalAntBaseBl / postUnitLab,
                finalAntBaseBl / postUnitLin,
                finalAntBaseMd,
                psi,
              ),
            effAntShoulder,
          );
          const curM = new Float64Array(ANGULAR_COLS);
          let worstExMm = 0;
          let worstCol = -1;
          for (let col = 0; col < ANGULAR_COLS; col += 1) {
            const theta = (col / ANGULAR_COLS) * Math.PI * 2;
            const dz0 = smoothMarginZAt(theta) - meanMarginZ;
            const radialFix: Vec3 = [Math.cos(theta), Math.sin(theta), 0];
            const gu = dot3(radialFix, frame.uLabial);
            const gv = dot3(radialFix, frame.vSide);
            if (Math.hypot(gu, gv) < 0.2) {
              curM[col] = minSolveMarginR;
              continue;
            }
            const uOff = dz0 * frame.uLabial[2];
            const vOff = dz0 * frame.vSide[2];
            const rFix = offsetSolver.solveRay(
              uOff,
              vOff,
              gu,
              gv,
              minSolveMarginR,
            ).t;
            const r0AtCol = Math.hypot(uOff + rFix * gu, vOff + rFix * gv);
            curM[col] = r0AtCol;
            const cap = marginCap[col]!;
            if (Number.isFinite(cap) && r0AtCol > cap + 1e-4) {
              const exMm = r0AtCol - cap;
              if (exMm > worstExMm) {
                worstExMm = exMm;
                worstCol = col;
              }
            }
          }
          if (worstExMm <= 1e-4 || worstCol < 0) break;
          const oppCol = (worstCol + ANGULAR_COLS / 2) % ANGULAR_COLS;
          const oppCap = marginCap[oppCol]!;
          const oppSlackMm = Number.isFinite(oppCap)
            ? Math.max(0, oppCap - curM[oppCol]!)
            : worstExMm;
          const wDu = colDuFix[worstCol]!;
          const wDv = colDvFix[worstCol]!;
          let shiftedMm = 0;
          if (oppSlackMm > 0.015) {
            const tryShift = Math.min(oppSlackMm * 0.5, worstExMm * 0.6, 0.18);
            pBaseCu -= wDu * tryShift;
            pBaseCv -= wDv * tryShift;
            shiftedMm = tryShift;
          }
          const remEx = Math.max(0, worstExMm - shiftedMm * 0.85);
          if (remEx > 1e-4) {
            const wu = wDu * wDu;
            const crossShare = 0.18;
            const minBlAllow = wrapAnteriorScrew360
              ? Math.max(0.88, Math.abs(uScrewBase - pBaseCu) + screwSafeR)
              : 0.88;
            const minMdAllow = wrapAnteriorScrew360
              ? Math.max(0.98, Math.abs(vScrewBase - pBaseCv) + screwSafeR)
              : 0.96;
            const nextBl = Math.max(minBlAllow, finalAntBaseBl - remEx * (crossShare + (1 - crossShare) * wu) - 0.003);
            const nextMd = Math.max(minMdAllow, finalAntBaseMd - remEx * (crossShare + (1 - crossShare) * (1 - wu)) - 0.003);
            const absorbed = Math.hypot(finalAntBaseBl - nextBl, finalAntBaseMd - nextMd);
            finalAntBaseBl = nextBl;
            finalAntBaseMd = nextMd;
            if (absorbed < remEx * 0.5) {
              effAntShoulder = Math.max(
                MIN_MARGIN_SHOULDER_MM,
                effAntShoulder - (remEx - absorbed) * 0.8 - 0.002,
              );
            }
          }
        }
        syncedAntScaleBl = clamp(finalAntBaseBl / Math.max(antBaseBl, 0.5), 0.72, 1.15);
        syncedAntScaleMd = clamp(finalAntBaseMd / Math.max(antBaseMd, 0.5), 0.72, 1.15);
        pTopCv = pBaseCv;
      }

      const computeAnteriorDirectionalSpans = (footPsis?: readonly number[]) => {
        if (!footPsis || footPsis.length !== ANGULAR_COLS) {
          return { hSpanLab: hRefSpanAnt, hSpanLin: hRefSpanAnt, hSpanMd: hRefSpanAnt };
        }
        let labSum = 0;
        let labN = 0;
        let linSum = 0;
        let linN = 0;
        let mdSum = 0;
        let mdN = 0;
        for (let col = 0; col < ANGULAR_COLS; col += 1) {
          const c = cols[col]!;
          const phiSec = footPsis[col]!;
          const cp = Math.cos(phiSec);
          const sp = Math.sin(phiSec);
          const topEdgeEst = top.heightAt(
            pTopCu + cp * Math.max(0.7, finalAntBaseBl - minAntDropBl),
            pBaseCv + sp * Math.max(0.8, finalAntBaseMd - minAntDropMd),
          );
          const maxRound = Math.max(c.h0 + 0.14, topEdgeEst - 0.1);
          const hBase = smoothMin(c.h0 + hPostBase, maxRound - 0.08, 0.03);
          const roundStart = smoothMin(
            maxRound,
            Math.max(hBase + 0.36, topEdgeEst - topRoundMm * 0.9),
            0.03,
          );
          const span = Math.max(0.36, roundStart - hBase);
          if (cp >= 0.7) {
            labSum += span;
            labN += 1;
          } else if (cp <= -0.7) {
            linSum += span;
            linN += 1;
          }
          if (Math.abs(sp) >= 0.7) {
            mdSum += span;
            mdN += 1;
          }
        }
        return {
          hSpanLab: labN > 0 ? labSum / labN : hRefSpanAnt,
          hSpanLin: linN > 0 ? linSum / linN : hRefSpanAnt,
          hSpanMd: mdN > 0 ? mdSum / mdN : hRefSpanAnt,
        };
      };

      const computeAnteriorTopHalves = (footPsis?: readonly number[]) => {
        // 근원심(v) 중심은 하단(pBaseCv)과 일치시켜 양쪽 근원심 축벽이 삽입축 기준 대칭 편측 테이퍼를 따르게 한다.
        pTopCv = pBaseCv;
        // 스캘럽으로 방향별 축벽 높이가 다르므로 순측·설측·근원심 각각의 실제 축벽 높이로 편측 테이퍼 감소량을 계산한다.
        const { hSpanLab, hSpanLin, hSpanMd } = computeAnteriorDirectionalSpans(footPsis);
        const dropLab = minAntTaperSlope * hSpanLab * Math.max(1, postUnitLab);
        const dropLin = minAntTaperSlope * hSpanLin * Math.max(1, postUnitLin);
        const dropMd = minAntTaperSlope * hSpanMd;
        const labRoom = finalAntBaseBl + pBaseCu - pTopCu;
        const mdRoom = finalAntBaseMd;
        const taperLab = labRoom - dropLab;
        const taperMd = mdRoom - dropMd;
        const hardLab =
          topLabHalf < keepBl - 0.05
            ? Math.max(0.7, topLabHalf * syncedAntScaleBl)
            : Infinity;
        const hardMd =
          topMdHalf < keepMd - 0.05
            ? Math.max(0.8, topMdHalf * syncedAntScaleMd)
            : Infinity;
        // 절치 등 스크류 사면 개구 케이스에서는 soft minCollar가 taperLab/taperMd를 덮어써 최소 2° 아래로 무너지지 않게 한다.
        const minLabFloor = wrapAnteriorScrew360
          ? minLabCollar()
          : Math.min(minLabCollar(), Math.max(0.78, taperLab));
        const tLab = wrapAnteriorScrew360
          ? Math.max(minLabFloor, Math.min(taperLab, hardLab))
          : Math.min(taperLab, Math.max(minLabFloor, Math.min(taperLab, hardLab)));
        // 설측 싱귤럼: 칼라 위 상단만 단일 평면으로 깎고, 스크류 홀 최소 벽(minLinCollar)은 남긴다.
        const incisorOpenScrew = tpl.kind === "incisor" && !wrapAnteriorScrew360;
        const linFloor = incisorOpenScrew ? 0.62 : minLinCollar();
        const lingualRoom = finalAntBaseBl - pBaseCu + pTopCu;
        const cingulumBevelTopLin = cingulumTopHalfMm(
          cingulumPlan,
          lingualRoom,
          dropLin,
          hSpanLin,
          incisorOpenScrew ? 0.58 : minLinCollar(),
        );
        const tLin = Math.max(
          linFloor,
          Math.min(
            lingualRoom - dropLin,
            Math.max(linFloor, Math.min(topLinHalf * syncedAntScaleBl, cingulumBevelTopLin)),
          ),
        );
        const minMdFloor = wrapAnteriorScrew360
          ? minMdCollar()
          : Math.min(minMdCollar(), Math.max(0.82, taperMd));
        const tMd = wrapAnteriorScrew360
          ? Math.max(minMdFloor, Math.min(taperMd, hardMd))
          : Math.min(taperMd, Math.max(minMdFloor, Math.min(taperMd, hardMd)));
        // 인접치 하드 캡 등으로 상단 근원심(tMd)이 taperMd보다 좁아진 경우, 하단 반폭(wallBaseMd)도 함께 맞춰
        // 마진 외경은 유지하면서 실제 근원심 축벽 각도가 설정 테이퍼(최소 2°)를 벗어나지 않게 한다.
        let wallBaseMd = finalAntBaseMd;
        if (tMd < wallBaseMd - dropMd - 1e-3) {
          const minWallBaseMd = wrapAnteriorScrew360
            ? Math.max(0.98, Math.abs(vScrewBase - pBaseCv) + screwSafeR)
            : Math.max(0.92, finalAntBaseMd - 0.55);
          wallBaseMd = Math.max(minWallBaseMd, tMd + dropMd);
        } else if (wrapAnteriorScrew360 && tMd > wallBaseMd - dropMd + 1e-3) {
          const spareSh = Math.max(0, effAntShoulder - MIN_MARGIN_SHOULDER_MM);
          wallBaseMd = Math.min(finalAntBaseMd + spareSh, tMd + dropMd);
        }
        return { tLab, tLin, tMd, wallBaseMd, dropLin, hSpanMd, hSpanLin };
      };

      let {
        tLab: finalAntTopLab,
        tLin: finalAntTopLin,
        tMd: finalAntTopMd,
        wallBaseMd: finalAntWallBaseMd,
        dropLin: finalAntDropLin,
        hSpanMd: finalAntSpanMd,
        hSpanLin: finalAntSpanLin,
      } = computeAnteriorTopHalves(!lockBasePass && lockedAnteriorBase ? antFootPsis : undefined);

      const buildAnteriorWallColumns = (
        footPsis: readonly number[],
        tLab: number,
        tLin: number,
        tMd: number,
        wallBaseMd = finalAntBaseMd,
        dropLin = minAntDropBl,
        hSpanMdRef = hRefSpanAnt,
        hSpanLinRef = hRefSpanAnt,
      ) => {
        const topGv = top.gv ?? 0;
        const hIncisalTop = top.heightAt(pBaseCu, pBaseCv);
        let labBaseSum = 0;
        let labBaseN = 0;
        let labMarginSum = 0;
        let labR0Sum = 0;
        let linBaseSum = 0;
        let linBaseN = 0;
        let linMarginSum = 0;
        let linMarginN = 0;
        for (let col = 0; col < ANGULAR_COLS; col += 1) {
          const c = cols[col]!;
          const phiSec = footPsis[col]!;
          const cp = Math.cos(phiSec);
          const sp = Math.sin(phiSec);
          const topEdgeEst = top.heightAt(pBaseCu, pBaseCv + sp * tMd);
          const maxRoundEst = Math.max(c.h0 + 0.14, topEdgeEst - 0.08);
          const hBaseColEst = smoothMin(c.h0 + hPostBase, maxRoundEst - 0.08, 0.03);
          if (cp >= 0.7) {
            labBaseSum += hBaseColEst;
            labBaseN += 1;
            labMarginSum += c.h0;
            labR0Sum += c.r0;
          } else if (cp <= -0.7) {
            linBaseSum += hBaseColEst;
            linBaseN += 1;
            linMarginSum += c.h0;
            linMarginN += 1;
          }
        }
        const hLabStart = labBaseN > 0 ? labBaseSum / labBaseN : meanHBaseSum;
        const hLinStart = linBaseN > 0 ? linBaseSum / linBaseN : meanHBaseSum;
        const hLinMargin = linMarginN > 0 ? linMarginSum / linMarginN : hLinStart;
        const wallFromMargin = Math.max(0.6, hIncisalTop - hLinMargin);
        const estPostHeightMm = Math.max(1.2, hIncisalTop * Math.max(0.35, frame.w[2]));
        const maxFromMarginMm = Math.max(
          0.5,
          Math.min(wallFromMargin - 0.45, estPostHeightMm - 0.5),
        );
        const minFromMarginMm = Math.min(0.5, maxFromMarginMm);
        const autoFromMarginMm = wallFromMargin * cingulumPlan.collar;
        const fromMarginMm = clamp(
          hasExplicitLingualBevel ? params.postLingualBevelMm : autoFromMarginMm,
          minFromMarginMm,
          maxFromMarginMm,
        );
        // 마진에서 fromMarginMm 올라간 높이에서 단일 설측 사면이 시작된다. 챔퍼 안에서는 시작하지 않는다.
        const hBevelStart = clamp(
          Math.max(hLinMargin + fromMarginMm, hLinStart),
          hLinStart,
          hIncisalTop - 0.45,
        );
        appliedLingualBevelMm = Math.round((hBevelStart - hLinMargin) * 10) / 10;

        const mdWallSlope = Math.max(
          minAntTaperSlope,
          (wallBaseMd - tMd) / Math.max(hSpanMdRef, 0.36),
        );
        const linCollarSlope = Math.max(
          minAntTaperSlope,
          dropLin / Math.max(hSpanLinRef, 0.36),
        );
        const hSpanRefBl = Math.max(0.5, hIncisalTop - topRoundMm - hLinStart);
        const cuSlopeU = (pTopCu - pBaseCu) / hSpanRefBl;
        const uLabBase = pBaseCu + finalAntBaseBl;
        const uLabTop = pTopCu + tLab;
        const labWallSlope = (uLabBase - uLabTop) / Math.max(0.36, hIncisalTop - topRoundMm - hLabStart);
        const linCollarAt = (hVal: number) => {
          const dhLin = Math.max(0, hVal - hLinStart);
          const cuAt = pBaseCu + cuSlopeU * dhLin;
          return cuAt - Math.max(0.58, finalAntBaseBl - linCollarSlope * dhLin);
        };
        const uBevelStart = linCollarAt(hBevelStart);
        const bevelRun = Math.max(0.25, hIncisalTop - hBevelStart);
        const wantIncisalBl =
          tpl.kind === "incisor"
            ? clamp(1.45 * blScale * params.postWidthScale * incisorShovelScale, 1.15, 1.75)
            : clamp(2.15 * blScale * params.postWidthScale, 1.65, 2.6);
        const hardLinCapU = pTopCu - topLinHalf * syncedAntScaleBl;
        let uTargetBevelTop = hasExplicitLingualBevel
          ? Math.max(hardLinCapU, uLabTop - wantIncisalBl)
          : Math.max(pTopCu - tLin, hardLinCapU, uLabTop - wantIncisalBl);
        if (incisorDeepBite) {
          uTargetBevelTop = Math.max(uTargetBevelTop, incisorPalatalContactU + 0.95);
        }
        if (wrapAnteriorScrew360) {
          uTargetBevelTop = Math.min(uTargetBevelTop, uScrewTop - screwSafeR);
        }
        const minIncisalBl = tpl.kind === "incisor" ? 1.05 : 1.3;
        const uMinBevelTop = linCollarAt(hIncisalTop);
        const uMaxBevelTop = Math.min(
          uLabTop - minIncisalBl,
          uBevelStart + Math.tan(56 * DEG) * bevelRun,
        );
        const uBevelTop = clamp(
          uTargetBevelTop,
          uMinBevelTop,
          Math.max(uMinBevelTop, uMaxBevelTop),
        );
        const bevelSlope = (uBevelTop - uBevelStart) / bevelRun;

        const hLabMargin = labBaseN > 0 ? labMarginSum / labBaseN : hLabStart;
        const labR0 = labBaseN > 0 ? labR0Sum / labBaseN : Math.max(1.2, uLabBase);
        const needIncisalMm = Math.max(0.7, params.minCrownThicknessMm);
        const hCrownTop = hIncisalTop + Math.max(tpl.crownOcclusalMm, needIncisalMm);
        const crownLabU = (hVal: number) =>
          naturalCrownR(frame.uLabial, hVal, hLabMargin, labR0, hCrownTop);
        const uLabWallAt = (hVal: number) =>
          uLabBase - labWallSlope * Math.max(0, hVal - hLabStart);
        const explicitLabialRaw = args.explicitParams?.postLabialBevelMm;
        const hasExplicitLabial =
          explicitLabialRaw != null && Number.isFinite(Number(explicitLabialRaw)) && Number(explicitLabialRaw) >= 0;
        const maxLabFromMargin = Math.max(
          0,
          Math.min(hIncisalTop - hLabMargin - 0.45, estPostHeightMm - 0.5),
        );
        let hLabBevelStart = hIncisalTop;
        let labBevelActive = false;
        if (hasExplicitLabial && Number(explicitLabialRaw) > 0) {
          const fromMargin = clamp(Number(explicitLabialRaw), 0, maxLabFromMargin);
          hLabBevelStart = clamp(
            Math.max(hLabMargin + fromMargin, hLabStart),
            hLabStart,
            hIncisalTop - 0.35,
          );
          labBevelActive = hIncisalTop - hLabBevelStart >= 0.3;
        } else if (!hasExplicitLabial) {
          const gapTop = crownLabU(hIncisalTop) - uLabWallAt(hIncisalTop);
          if (gapTop < needIncisalMm - 0.05) {
            let hOk = hLabStart;
            const steps = 24;
            for (let i = 0; i <= steps; i += 1) {
              const hVal = hLabStart + ((hIncisalTop - hLabStart) * i) / steps;
              if (crownLabU(hVal) - uLabWallAt(hVal) >= needIncisalMm) hOk = hVal;
              else break;
            }
            hLabBevelStart = clamp(hOk, hLabStart, hIncisalTop - 0.35);
            labBevelActive = hIncisalTop - hLabBevelStart >= 0.3;
          }
        }
        const uLabBevel0 = uLabWallAt(hLabBevelStart);
        let uLabBevelTop = Math.min(uLabWallAt(hIncisalTop), crownLabU(hIncisalTop) - needIncisalMm);
        if (labBevelActive && uLabBevelTop > uLabBevel0 - 0.12) {
          uLabBevelTop = uLabBevel0 - Math.max(0.2, (hIncisalTop - hLabBevelStart) * Math.tan(8 * DEG));
        }
        uLabBevelTop = Math.max(uLabBevelTop, uScrewTop + screwSafeR);
        uLabBevelTop = Math.min(uLabBevelTop, uLabWallAt(hIncisalTop) - 0.04);
        if (labBevelActive && uLabBevelTop >= uLabBevel0 - 0.08) labBevelActive = false;
        const labBevelRun = Math.max(0.25, hIncisalTop - hLabBevelStart);
        const labBevelSlope = labBevelActive ? (uLabBevelTop - uLabBevel0) / labBevelRun : 0;
        appliedLabialBevelMm = labBevelActive
          ? Math.round(Math.max(0, hLabBevelStart - hLabMargin) * 10) / 10
          : 0;

        for (let col = 0; col < ANGULAR_COLS; col += 1) {
          const c = cols[col]!;
          const phiSec = footPsis[col]!;
          const cp = Math.cos(phiSec);
          const sp = Math.sin(phiSec);
          const topEdgeAnt = top.heightAt(pBaseCu, pBaseCv + sp * tMd);
          const maxRoundStartAnt = Math.max(c.h0 + 0.14, topEdgeAnt - 0.08);
          const hBaseAnt = smoothMin(c.h0 + hPostBase, maxRoundStartAnt - 0.08, 0.03);
          const roundStartAnt = smoothMin(
            maxRoundStartAnt,
            Math.max(hBaseAnt + 0.36, topEdgeAnt - topRoundMm * 0.9),
            0.025,
          );
          const wallPts: Vec3[] = [];
          for (let k = 0; k <= POST_LEVELS; k += 1) {
            const uSpan = k / POST_LEVELS;
            const h = hBaseAnt + (roundStartAnt - hBaseAnt) * uSpan;
            postH[col]![k] = h;
            const uLabAtH = uLabBase - labWallSlope * Math.max(0, h - hLabStart);
            const uLinCollarAtH = linCollarAt(h);
            const cuBody = 0.5 * (uLabAtH + uLinCollarAtH);
            const aBlBody = Math.max(0.68, 0.5 * (uLabAtH - uLinCollarAtH));
            const bMdH = Math.max(0.82, wallBaseMd - mdWallSlope * Math.max(0, h - hBaseAnt));
            // 단일 설측 사면 평면 u >= uBevelStart + bevelSlope * ((h - topGv * (v - pBaseCv)) - hBevelStart)
            // 과 기본 볼록 테이퍼 기둥의 교집합으로 로브·중심 홈·면 꼬임을 원천 차단한다.
            const uPlaneCenter = uBevelStart + bevelSlope * (h - hBevelStart);
            const uLinEff = smoothMax(uLinCollarAtH, uPlaneCenter, 0.035);
            const cuRef = 0.5 * (uLabAtH + Math.min(uLabAtH - 0.32, uLinEff));
            const sBodyRaw = analyticSectionRay(
              tpl.kind,
              "post",
              aBlBody / postUnitLab,
              aBlBody / postUnitLin,
              bMdH,
              cuBody - cuRef,
              0,
              cp,
              sp,
            );
            const sBody = Number.isFinite(sBodyRaw)
              ? sBodyRaw
              : evalPostSectionRadiusAtPhi(
                  tpl.kind,
                  aBlBody / postUnitLab,
                  aBlBody / postUnitLin,
                  bMdH,
                  phiSec,
                );
            const denom = cp + bevelSlope * topGv * sp;
            const sLingual = denom < -1e-5 ? (uPlaneCenter - cuRef) / denom : Infinity;
            const uLabPlane =
              labBevelActive && h >= hLabBevelStart
                ? uLabBevel0 + labBevelSlope * (h - hLabBevelStart)
                : Infinity;
            const sLabial = cp > 1e-4 && uLabPlane < 1e6 ? (uLabPlane - cuRef) / cp : Infinity;
            let s = sBody;
            if (Number.isFinite(sLingual) && sLingual > 0) s = smoothMin(s, sLingual, 0.03);
            if (Number.isFinite(sLabial) && sLabial > 0) s = smoothMin(s, sLabial, 0.03);
            const u = cuRef + s * cp;
            const v = pBaseCv + s * sp;
            postR[col]![k] = Math.hypot(u, v);
            wallPts.push(
              add3(c0, add3(scale3(frame.w, h), add3(scale3(frame.uLabial, u), scale3(frame.vSide, v)))),
            );
          }
          postWallPtsByCol[col] = wallPts;
        }
      };

      if (lockBasePass || !lockedAnteriorBase) {
        const solveAnteriorMarginAndWalls = () => {
          pTopCv = pBaseCv;
          const offsetSolver = buildParallelOffsetMarginSolver(
            pBaseCu,
            pBaseCv,
            (psi) =>
              evalPostSectionRadiusAtPhi(
                tpl.kind,
                finalAntBaseBl / postUnitLab,
                finalAntBaseBl / postUnitLin,
                finalAntBaseMd,
                psi,
              ),
            effAntShoulder,
          );
          const solved = solveSmoothOffsetMarginLoop(
            offsetSolver,
            smoothMarginZAt,
            meanMarginZ,
            frame,
            minSolveMarginR,
            minMarginZ,
            maxMarginZ,
            occInFix,
          );
          marginRadii = solved.radii;
          marginColZs = solved.zCols;
          antFootPsis = solved.footPsis;
          syncColsMarginGeometry();
          ({
            tLab: finalAntTopLab,
            tLin: finalAntTopLin,
            tMd: finalAntTopMd,
            wallBaseMd: finalAntWallBaseMd,
            dropLin: finalAntDropLin,
            hSpanMd: finalAntSpanMd,
            hSpanLin: finalAntSpanLin,
          } = computeAnteriorTopHalves(antFootPsis));
          buildAnteriorWallColumns(
            antFootPsis,
            finalAntTopLab,
            finalAntTopLin,
            finalAntTopMd,
            finalAntWallBaseMd,
            finalAntDropLin,
            finalAntSpanMd,
            finalAntSpanLin,
          );
        };

        solveAnteriorMarginAndWalls();
        const minAntCuffR = Math.max(minSolveMarginR + 0.02, coneTopR + 0.18);
        for (let cuffIt = 0; cuffIt < 4; cuffIt += 1) {
          let worstCuffDef = 0;
          let worstCol = -1;
          for (let col = 0; col < ANGULAR_COLS; col += 1) {
            const def = minAntCuffR - marginRadii[col]!;
            if (def > worstCuffDef + 1e-4) {
              worstCuffDef = def;
              worstCol = col;
            }
          }
          if (worstCuffDef <= 1e-4 || worstCol < 0) break;
          const psiW = antFootPsis![worstCol]!;
          const step = Math.min(0.28, worstCuffDef / Math.max(colProjScale[worstCol]!, 0.5) + 0.005);
          pBaseCu += Math.cos(psiW) * step;
          pBaseCv += Math.sin(psiW) * step;
          solveAnteriorMarginAndWalls();
        }
        if (wrapAnteriorScrew360) {
          const strictAntWallMm = MIN_FRACTURE_SAFE_POST_WALL_MM + 0.032;
          const strictAntTopExtra = 0.076;
          for (let exactIt = 0; exactIt < 5; exactIt += 1) {
            const surfZAnt = meanMarginZ + top.heightAt(pTopCu, pTopCv) / axialCos;
            const boreAnt = resolveScrewChannelProfile(conn, surfZAnt);
            let worstDef = 0;
            let worstPsi = 0;
            let worstUFrac = 1;
            for (let col = 0; col < ANGULAR_COLS; col += 1) {
              const wallPts = postWallPtsByCol[col]!;
              for (let k = 0; k <= POST_LEVELS; k += 1) {
                const pt = wallPts[k]!;
                const req =
                  k === POST_LEVELS
                    ? boreAnt.radiusAtZ(pt[2] + topRoundMm * 0.65) + strictAntWallMm + strictAntTopExtra
                    : boreAnt.radiusAtZ(pt[2]) + strictAntWallMm;
                const rXY = Math.hypot(pt[0], pt[1]);
                if (rXY < req - 1e-4) {
                  const def = req - rXY;
                  if (def > worstDef) {
                    worstDef = def;
                    worstPsi = antFootPsis![col]!;
                    worstUFrac = k / POST_LEVELS;
                  }
                }
              }
            }
            if (worstDef <= 1e-4) break;
            const cpW = Math.cos(worstPsi);
            const spW = Math.sin(worstPsi);
            const grow = worstDef / axialCos + 0.006;
            if (worstUFrac > 0.25) {
              pTopCu += cpW * grow * 0.55;
              topLabHalf += grow * 0.45 * Math.max(0, cpW);
              topLinHalf += grow * 0.45 * Math.max(0, -cpW);
              topMdHalf += grow * 0.45 * Math.abs(spW);
            }
            pBaseCu += cpW * grow * 0.4;
            pBaseCv += spW * grow * (worstUFrac > 0.25 ? 0.55 : 0.4);
            pTopCv = pBaseCv;
            finalAntBaseBl += grow * 0.6 * (0.3 + 0.7 * cpW * cpW);
            finalAntBaseMd += grow * 0.6 * (0.3 + 0.7 * spW * spW);
            solveAnteriorMarginAndWalls();
          }
        }
        {
          let maxAntMarginShift = 0;
          for (let col = 0; col < ANGULAR_COLS; col += 1) {
            maxAntMarginShift = Math.max(
              maxAntMarginShift,
              Math.abs(marginRadii[col]! - initMarginRadii[col]!),
            );
          }
          if (maxAntMarginShift > 0.08) {
            smoothMarginZ = drapeMarginZForRadii(marginRadii);
            meanMarginZ = smoothMarginZ.reduce((s, v) => s + v, 0) / SECTORS;
            smoothMarginZAt = buildPeriodicSmoothCurve(smoothMarginZ, 3);
            solveAnteriorMarginAndWalls();
          }
        }
        lockedAnteriorBase = {
          pBaseCu,
          pBaseCv,
          finalAntBaseBl,
          finalAntBaseMd,
          effAntShoulder,
          wrapAnteriorScrew360,
          footPsis: [...antFootPsis!],
        };
      } else {
        buildAnteriorWallColumns(
          antFootPsis!,
          finalAntTopLab,
          finalAntTopLin,
          finalAntTopMd,
          finalAntWallBaseMd,
          finalAntDropLin,
          finalAntSpanMd,
          finalAntSpanLin,
        );
      }
      {
        let minTopUAnt = Infinity;
        let maxTopUAnt = -Infinity;
        for (let col = 0; col < ANGULAR_COLS; col += 1) {
          const relTop = sub3(postWallPtsByCol[col]![POST_LEVELS]!, c0);
          const uT = dot3(relTop, frame.uLabial);
          if (uT < minTopUAnt) minTopUAnt = uT;
          if (uT > maxTopUAnt) maxTopUAnt = uT;
        }
        topFaceCu = Number.isFinite(minTopUAnt)
          ? (minTopUAnt + maxTopUAnt) * 0.5
          : pTopCu + (finalAntTopLab - finalAntTopLin) * 0.5;
      }
      topFaceCv = pBaseCv;
      mHalfBl = finalAntBaseBl + effAntShoulder;
      mHalfMd = finalAntBaseMd + effAntShoulder;
      mCu = pBaseCu;
      mCv = pBaseCv;
    }

    // 최후 스크류 홀 벽 두께(≥0.3mm) 안전망:
    // 앞단계에서 이미 360° 3D 스크류 안전 반경을 해부 단면 중심·반축에 선반영했으므로 일반·편심 케이스에서는 개입하지 않는다.
    // 초극단 케이스에서 만에 하나 개입하더라도 국소 열만 피니시라인을 부풀리지 않아 원호 혹이 생기지 않는다.
    if (posterior || wrapAnteriorScrew360) {
      const estSurfaceTopZ = meanMarginZ + top.heightAt(0, 0) / Math.max(frame.w[2], 0.2);
      const boreProfile = resolveScrewChannelProfile(conn, estSurfaceTopZ);
      const reqWallMm = (posterior ? MIN_POST_WALL_MM : MIN_FRACTURE_SAFE_POST_WALL_MM) + 0.025;
      const minUndercutSlope = Math.tan(RETENTION_SINGLE_MIN_TAPER_DEG * DEG);
      const CIRCLE_SEGS = 72;
      const circleCos = 1 / Math.cos(Math.PI / CIRCLE_SEGS);

      let anyPushed = false;
      let basePushed = false;
      const prevDeltaXY: Array<[number, number]> = Array.from({ length: ANGULAR_COLS }, () => [0, 0]);
      const origWallSnapshot: Vec3[][] = postWallPtsByCol.map((pts) => pts.map((p): Vec3 => [p[0], p[1], p[2]]));

      const topCornerExtra = posterior ? 0.038 : 0.072;
      let needsScrewPush = false;
      for (let col = 0; col < ANGULAR_COLS && !needsScrewPush; col += 1) {
        const wallPts = postWallPtsByCol[col]!;
        for (let k = 0; k <= POST_LEVELS; k += 1) {
          const pt = wallPts[k]!;
          const req =
            k === POST_LEVELS
              ? boreProfile.radiusAtZ(pt[2] + topRoundMm * 0.65) + reqWallMm + topCornerExtra
              : boreProfile.radiusAtZ(pt[2]) + reqWallMm;
          if (Math.hypot(pt[0], pt[1]) < req - 1e-3) {
            needsScrewPush = true;
            break;
          }
        }
      }

      for (let k = POST_LEVELS; needsScrewPush && k >= 0; k -= 1) {
        const candPts: Vec3[] = [];
        const unionPts: Array<[number, number]> = [];
        let maxReqR = 0;
        for (let col = 0; col < ANGULAR_COLS; col += 1) {
          const c = cols[col]!;
          const origPt = origWallSnapshot[col]![k]!;
          let pdx = prevDeltaXY[col]![0];
          let pdy = prevDeltaXY[col]![1];
          let cxPt = origPt[0];
          let cyPt = origPt[1];
          if (k < POST_LEVELS && Math.hypot(pdx, pdy) > 1e-5) {
            const dh = Math.max(0, postH[col]![k + 1]! - postH[col]![k]!);
            const origAbove = origWallSnapshot[col]![k + 1]!;
            const relOrig = sub3(origPt, c0);
            const relOrigAbove = sub3(origAbove, c0);
            const builtInStep = Math.max(
              0,
              dot3(sub3(relOrig, relOrigAbove), c.dir) - minUndercutSlope * dh,
            );
            const pLen = Math.hypot(pdx, pdy);
            const remLen = Math.max(0, pLen - builtInStep);
            if (remLen > 1e-5) {
              pdx *= remLen / pLen;
              pdy *= remLen / pLen;
              cxPt += pdx;
              cyPt += pdy;
            }
          }
          const cand: Vec3 = [cxPt, cyPt, origPt[2]];
          candPts.push(cand);
          unionPts.push([cxPt, cyPt]);
          let colReqR = boreProfile.radiusAtZ(origPt[2]) + reqWallMm;
          if (k === POST_LEVELS) {
            colReqR = boreProfile.radiusAtZ(origPt[2] + topRoundMm * 0.65) + reqWallMm + topCornerExtra;
          }
          maxReqR = Math.max(maxReqR, colReqR);
        }
        const safeOuterR = maxReqR * circleCos;
        for (let s = 0; s < CIRCLE_SEGS; s += 1) {
          const ang = (s / CIRCLE_SEGS) * Math.PI * 2;
          unionPts.push([safeOuterR * Math.cos(ang), safeOuterR * Math.sin(ang)]);
        }
        const hull = compute2DConvexHull(unionPts);
        if (hull.length < 3) continue;

        let loopCx = 0;
        let loopCy = 0;
        for (const cp of candPts) {
          loopCx += cp[0] / ANGULAR_COLS;
          loopCy += cp[1] / ANGULAR_COLS;
        }
        for (let col = 0; col < ANGULAR_COLS; col += 1) {
          const wallPts = postWallPtsByCol[col]!;
          const origPt = origWallSnapshot[col]![k]!;
          const cand = candPts[col]!;
          const rx = cand[0] - loopCx;
          const ry = cand[1] - loopCy;
          const rLen = Math.hypot(rx, ry);
          let finalX = cand[0];
          let finalY = cand[1];
          if (rLen > 1e-5) {
            const ux = rx / rLen;
            const uy = ry / rLen;
            const hullDist = rayDistanceToConvexHull(loopCx, loopCy, ux, uy, hull);
            if (hullDist > rLen + 1e-4 && hullDist < 10.0) {
              finalX = loopCx + ux * hullDist;
              finalY = loopCy + uy * hullDist;
            }
          }
          const dxMoved = finalX - origPt[0];
          const dyMoved = finalY - origPt[1];
          prevDeltaXY[col] = [dxMoved, dyMoved];
          if (Math.hypot(dxMoved, dyMoved) > 1e-4) {
            const moved: Vec3 = [finalX, finalY, origPt[2]];
            wallPts[k] = moved;
            const rel = sub3(moved, c0);
            postR[col]![k] = Math.hypot(dot3(rel, frame.uLabial), dot3(rel, frame.vSide));
            anyPushed = true;
            if (k === 0) basePushed = true;
          }
        }
      }

      if (anyPushed) {
        if (basePushed && (lockBasePass || !lockedMarginRadii)) {
          let marginIntruded = false;
          const minShNeed = Math.max(0.2, MIN_MARGIN_SHOULDER_MM * 0.9);
          for (let col = 0; col < ANGULAR_COLS; col += 1) {
            if (cols[col]!.r0 < postR[col]![0]! + minShNeed) {
              marginIntruded = true;
              break;
            }
          }
          if (marginIntruded) {
            // 초극단 대경사로 포스트 베이스가 확장된 경우에도 과팽창이나 국소 각짐 없이,
            // 실제 포스트 하단 볼록 단면 P의 스무딩 서포트 함수 h_P(ψ) + wantSh 등폭 곡선으로 매끄럽게 감싼다.
            const baseUV: Array<[number, number]> = [];
            let sumU = 0;
            let sumV = 0;
            for (let col = 0; col < ANGULAR_COLS; col += 1) {
              const rel0 = sub3(postWallPtsByCol[col]![0]!, c0);
              const u0 = dot3(rel0, frame.uLabial);
              const v0 = dot3(rel0, frame.vSide);
              baseUV.push([u0, v0]);
              sumU += u0 / ANGULAR_COLS;
              sumV += v0 / ANGULAR_COLS;
            }
            const SUP_N = 288;
            const rawSup = new Array<number>(SUP_N);
            for (let m = 0; m < SUP_N; m += 1) {
              const psi = (m / SUP_N) * Math.PI * 2;
              const cp = Math.cos(psi);
              const sp = Math.sin(psi);
              let best = 0.2;
              for (const [bu, bv] of baseUV) {
                const proj = (bu - sumU) * cp + (bv - sumV) * sp;
                if (proj > best) best = proj;
              }
              rawSup[m] = best;
            }
            const smoothSup = smoothCircular(rawSup, 10);
            let maxDef = 0;
            for (let m = 0; m < SUP_N; m += 1) {
              if (rawSup[m]! - smoothSup[m]! > maxDef) maxDef = rawSup[m]! - smoothSup[m]!;
            }
            const supCos = Array.from({ length: SUP_N }, (_, m) => Math.cos((m / SUP_N) * Math.PI * 2));
            const supSin = Array.from({ length: SUP_N }, (_, m) => Math.sin((m / SUP_N) * Math.PI * 2));
            const fallbackSolver = buildParallelOffsetMarginSolver(
              sumU,
              sumV,
              (psi) => {
                const cp = Math.cos(psi);
                const sp = Math.sin(psi);
                let best = Infinity;
                for (let m = 0; m < SUP_N; m += 1) {
                  const denom = cp * supCos[m]! + sp * supSin[m]!;
                  if (denom <= 0.25) continue;
                  const r = (smoothSup[m]! + maxDef) / denom;
                  if (r < best) best = r;
                }
                return Number.isFinite(best) ? Math.max(0.3, best) : 1.2;
              },
              Math.max(MIN_MARGIN_SHOULDER_MM, targetShoulderW * 0.78),
            );
            const solvedFallback = solveSmoothOffsetMarginLoop(
              fallbackSolver,
              smoothMarginZAt,
              meanMarginZ,
              frame,
              minSolveMarginR,
              minMarginZ,
              maxMarginZ,
              occInFix,
            );
            marginRadii = solvedFallback.radii;
            marginColZs = solvedFallback.zCols;
            mCu = sumU;
            mCv = sumV;
            syncColsMarginGeometry();
          }
        }
        let minTopU = Infinity;
        let maxTopU = -Infinity;
        let minTopV = Infinity;
        let maxTopV = -Infinity;
        for (let col = 0; col < ANGULAR_COLS; col += 1) {
          const relTop = sub3(postWallPtsByCol[col]![POST_LEVELS]!, c0);
          const uT = dot3(relTop, frame.uLabial);
          const vT = dot3(relTop, frame.vSide);
          if (uT < minTopU) minTopU = uT;
          if (uT > maxTopU) maxTopU = uT;
          if (vT < minTopV) minTopV = vT;
          if (vT > maxTopV) maxTopV = vT;
        }
        topFaceCu = (minTopU + maxTopU) * 0.5;
        topFaceCv = (minTopV + maxTopV) * 0.5;
      }
    }
    if (lockBasePass || !lockedMarginRadii) {
      lockedMarginRadii = [...marginRadii];
      lockedMarginColZs = [...marginColZs];
      finalMeanMarginZ = marginColZs.reduce((s, v) => s + v, 0) / Math.max(marginColZs.length, 1);
    }

    // ── 7) 열 점: 피니시라인 → 오목 챔퍼 → 축벽 → 윗면 라운드 / 해부 3링 예측 크라운 교합면
    const postByCol: Vec3[][] = [];
    const crownByCol: Vec3[][] = [];
    let cutbackSum = 0;
    let taperSum = 0;
    let taperCols = 0;
    let crownTopSum = 0;
    const rawEdgeH: number[] = [];
    const rawOcc1H: number[] = [];
    const rawOcc2H: number[] = [];
    const rawOcc3H: number[] = [];
    const cuspR1ByCol: number[] = [];
    const cuspR2ByCol: number[] = [];
    const cuspR3ByCol: number[] = [];
    const crownOccCu = clamp(crownCenterU * 0.45, -1.2, 1.2);
    const crownOccCv = clamp(crownCenterV * crownSideSign * 0.45, -1.2, 1.2);
    const apexH = top.heightAt(topFaceCu, topFaceCv);
    const postApex = add3(
      c0,
      add3(scale3(frame.w, apexH), add3(scale3(frame.uLabial, topFaceCu), scale3(frame.vSide, topFaceCv))),
    );
    // 안전망 등으로 상단 중심이 이동해 포스트 실제 기둥 축이 기울어진 경우에도 오버행이 생기지 않도록
    // 둘레 스무딩된 최소 숄더 인셋을 먼저 확보한다(열별 급격한 단차·세로 홈 방지).
    {
      const leanDu = topFaceCu - mCu;
      const leanDv = topFaceCv - mCv;
      const rawNeedIn = cols.map((c, col) => {
        const uM = dot3(c.dir, frame.uLabial) * c.r0;
        const vM = dot3(c.dir, frame.vSide) * c.r0;
        const outDu = uM - mCu;
        const outDv = vM - mCv;
        const outLen = Math.hypot(outDu, outDv) || 1;
        const outU = outDu / outLen;
        const outV = outDv / outLen;
        const rel0Raw = sub3(postWallPtsByCol[col]![0]!, c0);
        const u0Raw = dot3(rel0Raw, frame.uLabial);
        const v0Raw = dot3(rel0Raw, frame.vSide);
        const signedInward = (uM - u0Raw) * outU + (vM - v0Raw) * outV;
        // 전치부는 설측 사면 삭제로 상단 면 중심(topFaceCu)이 순측으로 이동하므로 leanGuard로 설측 중앙을 파지 않는다.
        const leanGuard = posterior ? Math.max(0, -(leanDu * outU + leanDv * outV) * 0.52) : 0;
        const minSafeShoulder = Math.max(0.2, MIN_MARGIN_SHOULDER_MM * 0.85) + leanGuard;
        return Math.max(0, minSafeShoulder - signedInward);
      });
      if (rawNeedIn.some((v) => v > 1e-4)) {
        const smoothNeedIn = smoothCircular(rawNeedIn, 4).map((v, col) => Math.max(v, rawNeedIn[col]!));
        for (let col = 0; col < ANGULAR_COLS; col += 1) {
          const needIn = smoothNeedIn[col]!;
          if (needIn <= 1e-4) continue;
          const c = cols[col]!;
          const wallPts = postWallPtsByCol[col]!;
          const rs = postR[col]!;
          const uM = dot3(c.dir, frame.uLabial) * c.r0;
          const vM = dot3(c.dir, frame.vSide) * c.r0;
          const outDu = uM - mCu;
          const outDv = vM - mCv;
          const outLen = Math.hypot(outDu, outDv) || 1;
          const outU = outDu / outLen;
          const outV = outDv / outLen;
          // 베이스만 당기면 편측 각이 사라진다. 스크류 벽을 넘는 범위에서 축벽 전체를 같은 양만큼 넣는다.
          let effIn = needIn;
          if (posterior || wrapAnteriorScrew360) {
            const minSafeXY = boreTopR + (posterior ? 0.34 : 0.33);
            for (let k = 0; k <= POST_LEVELS && effIn > 1e-4; k += 1) {
              const pt = wallPts[k]!;
              const origR = Math.hypot(pt[0], pt[1]);
              if (origR <= minSafeXY + 1e-4) {
                effIn = 0;
                break;
              }
              const cand = sub3(
                pt,
                add3(scale3(frame.uLabial, outU * effIn), scale3(frame.vSide, outV * effIn)),
              );
              const candR = Math.hypot(cand[0], cand[1]);
              if (candR < minSafeXY) {
                effIn *= clamp((origR - minSafeXY) / Math.max(origR - candR, 1e-5), 0, 1);
              }
            }
          }
          if (effIn <= 1e-4) continue;
          for (let k = 0; k <= POST_LEVELS; k += 1) {
            const cand = sub3(
              wallPts[k]!,
              add3(scale3(frame.uLabial, outU * effIn), scale3(frame.vSide, outV * effIn)),
            );
            wallPts[k] = cand;
            const relK = sub3(wallPts[k]!, c0);
            rs[k] = Math.hypot(dot3(relK, frame.uLabial), dot3(relK, frame.vSide));
          }
        }
      }
    }

    let meanTopSEnd = 0;
    for (let col = 0; col < ANGULAR_COLS; col += 1) {
      const relEndC = sub3(postWallPtsByCol[col]![POST_LEVELS]!, c0);
      meanTopSEnd +=
        Math.hypot(
          dot3(relEndC, frame.uLabial) - topFaceCu,
          dot3(relEndC, frame.vSide) - topFaceCv,
        ) / ANGULAR_COLS;
    }
    for (let col = 0; col < ANGULAR_COLS; col += 1) {
      const c = cols[col]!;
      const at = (h: number, r: number): Vec3 => add3(c0, add3(scale3(frame.w, h), scale3(c.dir, r)));
      const rs = postR[col]!;
      const hs = postH[col]!;
      const wallPts = postWallPtsByCol[col]!;
      const post: Vec3[] = [];

      // 마진 점(c.marginPt)에서 축벽 시작점(wallPts[0])으로 정확히 이어지는 평면 내 오목 챔퍼.
      const uM = dot3(c.dir, frame.uLabial) * c.r0;
      const vM = dot3(c.dir, frame.vSide) * c.r0;
      const outDu = uM - mCu;
      const outDv = vM - mCv;
      const outLen = Math.hypot(outDu, outDv) || 1;
      const outU = outDu / outLen;
      const outV = outDv / outLen;
      const p0 = wallPts[0]!;
      const p1 = wallPts[1]!;
      const rel0 = sub3(p0, c0);
      const u0 = dot3(rel0, frame.uLabial);
      const v0 = dot3(rel0, frame.vSide);
      let chDu = uM - u0;
      let chDv = vM - v0;
      if (chDu * outU + chDv * outV < 0.02) {
        chDu = outU * 0.02;
        chDv = outV * 0.02;
      }
      const chWidth = Math.max(0.02, Math.hypot(chDu, chDv));
      const chDirU = chDu / chWidth;
      const chDirV = chDv / chWidth;
      const rel1 = sub3(p1, c0);
      const stepIn = Math.max(
        0,
        -((dot3(rel1, frame.uLabial) - u0) * chDirU + (dot3(rel1, frame.vSide) - v0) * chDirV),
      );
      const colWallSlope = stepIn / Math.max(hs[1]! - hs[0]!, 1e-4);
      const chPts = chamferPoints(chWidth, Math.max(0.02, hs[0]! - c.h0), colWallSlope);
      for (const [off, dh] of chPts) {
        const u = u0 + chDirU * off;
        const v = v0 + chDirV * off;
        post.push(
          add3(c0, add3(scale3(frame.w, c.h0 + dh), add3(scale3(frame.uLabial, u), scale3(frame.vSide, v)))),
        );
      }
      for (let k = 1; k <= POST_LEVELS; k += 1) post.push(wallPts[k]!);

      // 윗면 라운드: 상단 면 기하 중심(topFaceCu, topFaceCv)을 향해 축벽 끝 접선에서 윗면 평면까지 C¹ 원호로 닫는다.
      const pEnd = wallPts[POST_LEVELS]!;
      const pPrev = wallPts[POST_LEVELS - 1]!;
      const relEnd = sub3(pEnd, c0);
      const uEnd = dot3(relEnd, frame.uLabial);
      const vEnd = dot3(relEnd, frame.vSide);
      const hEnd = hs[POST_LEVELS]!;
      const topDu = uEnd - topFaceCu;
      const topDv = vEnd - topFaceCv;
      const sEnd = Math.max(0.22, Math.hypot(topDu, topDv));
      const topDirU = topDu / sEnd;
      const topDirV = topDv / sEnd;
      const relPrev = sub3(pPrev, c0);
      const sPrev =
        (dot3(relPrev, frame.uLabial) - topFaceCu) * topDirU +
        (dot3(relPrev, frame.vSide) - topFaceCv) * topDirV;
      const wallSlope = Math.max(0, (sPrev - sEnd) / Math.max(hEnd - hs[POST_LEVELS - 1]!, 1e-4));
      const t0 = Math.min(Math.atan(wallSlope), 60 * DEG);
      const sin0 = Math.sin(t0);
      const cos0 = Math.cos(t0);
      const edgeHeight = (sFlat: number) =>
        top.heightAt(topFaceCu + topDirU * sFlat, topFaceCv + topDirV * sFlat);
      const rise = Math.max(1 - sin0, 1e-3);
      // 교합면-축벽 라인 앵글은 전치·구치 모두 topRoundMm(0.5mm). 스크류에 닿는 열만 원호를 줄인다.
      const rho = topRoundMm;
      let ext = Math.max(0, edgeHeight(sEnd - rho * cos0) - hEnd - rho * rise);
      if (ext > 1e-4) {
        const minTopRoundWall = posterior ? MIN_POST_WALL_MM : MIN_FRACTURE_SAFE_POST_WALL_MM + 0.015;
        const atCandidate = (candExt: number): number => {
          const candH = hEnd + candExt;
          const candS = Math.max(rho * cos0 + 0.18, sEnd - Math.tan(t0) * candExt);
          const pt = add3(
            c0,
            add3(
              scale3(frame.w, candH),
              add3(
                scale3(frame.uLabial, topFaceCu + topDirU * candS),
                scale3(frame.vSide, topFaceCv + topDirV * candS),
              ),
            ),
          );
          return Math.hypot(pt[0], pt[1]) - (boreTopR + minTopRoundWall);
        };
        if (atCandidate(ext) < 0) {
          let lo = 0;
          let hi = ext;
          for (let it = 0; it < 12; it += 1) {
            const mid = (lo + hi) * 0.5;
            if (atCandidate(mid) >= 0) lo = mid;
            else hi = mid;
          }
          ext = lo;
        }
      }
      const h1 = hEnd + ext;
      const s1 = Math.max(rho * cos0 + 0.16, sEnd - Math.tan(t0) * ext);
      const atTop = (h: number, sRad: number): Vec3 =>
        add3(
          c0,
          add3(
            scale3(frame.w, h),
            add3(scale3(frame.uLabial, topFaceCu + topDirU * sRad), scale3(frame.vSide, topFaceCv + topDirV * sRad)),
          ),
        );
      // 스크류 홀과 동심인 원으로 필레를 밀지 않는다. 홀에 닿을 열만 원호를 짧게 해서 벽 밖에서 끝낸다.
      post.push(atTop(h1, s1));
      let radialRho = meanTopSEnd > 0.3 ? rho * (s1 / meanTopSEnd) : rho;
      {
        const minFilletR = boreTopR + 0.32;
        const closestR = (useRadial: number): number => {
          let best = Infinity;
          for (let step = 0; step <= TOP_ROUND_STEPS; step += 1) {
            const t = t0 + ((Math.PI / 2 - t0) * step) / TOP_ROUND_STEPS;
            const sPos = Math.max(0.08, s1 - useRadial * (cos0 - Math.cos(t)));
            const pt = atTop(h1, sPos);
            best = Math.min(best, Math.hypot(pt[0], pt[1]));
          }
          return best;
        };
        if (closestR(radialRho) < minFilletR && closestR(0) >= minFilletR) {
          let lo = 0;
          let hi = radialRho;
          for (let it = 0; it < 14; it += 1) {
            const mid = (lo + hi) * 0.5;
            if (closestR(mid) >= minFilletR) lo = mid;
            else hi = mid;
          }
          radialRho = lo;
        }
      }
      const arcS = Math.max(0.08, s1 - radialRho * cos0);
      const arcH = h1 - rho * sin0;
      for (let s = 1; s <= TOP_ROUND_STEPS; s += 1) {
        const t = t0 + ((Math.PI / 2 - t0) * s) / TOP_ROUND_STEPS;
        const sPos = arcS + radialRho * Math.cos(t);
        // 원호 끝점(s = TOP_ROUND_STEPS)이 경사 윗면 평면(edgeHeight) 위에 정확히 놓여 중앙 정점(postApex)과 단차 없이 이어진다.
        const uFrac = s / TOP_ROUND_STEPS;
        const hArc = arcH + rho * Math.sin(t);
        const hPlane = edgeHeight(sPos);
        post.push(atTop(hArc + (hPlane - (arcH + rho)) * uFrac * uFrac, sPos));
      }
      postByCol.push(post);

      const k20 = Math.round(POST_LEVELS * 0.2);
      const k60 = Math.round(POST_LEVELS * 0.6);
      if (posterior || Math.cos(c.phi) > -0.25) {
        const rel20 = sub3(wallPts[k20]!, c0);
        const rel60 = sub3(wallPts[k60]!, c0);
        const s20 =
          (dot3(rel20, frame.uLabial) - pTopCu) * topDirU +
          (dot3(rel20, frame.vSide) - pTopCv) * topDirV;
        const s60 =
          (dot3(rel60, frame.uLabial) - pTopCu) * topDirU +
          (dot3(rel60, frame.vSide) - pTopCv) * topDirV;
        taperSum += Math.atan2(s20 - s60, hs[k60]! - hs[k20]!);
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
      geomIdealTaperDeg,
      lingualBevelMm: appliedLingualBevelMm,
      labialBevelMm: appliedLabialBevelMm,
      postApex,
      crownApex,
      meanCrownCuspH,
    };
  };

  const measureShapePostHeightMm = (s: ReturnType<typeof buildShape>) => {
    let maxZ = s.postApex[2];
    for (let col = 0; col < ANGULAR_COLS; col += 1) {
      const post = s.postByCol[col]!;
      for (let idx = Math.max(0, post.length - TOP_ROUND_STEPS - 2); idx < post.length; idx += 1) {
        if (post[idx]![2] > maxZ) maxZ = post[idx]![2];
      }
    }
    return Math.round((maxZ - finalMeanMarginZ) * 100) / 100;
  };
  const refreshAxialWallRadius = () => {
    if (marginRadii.length > 0) {
      let sum = 0;
      for (const radius of marginRadii) sum += radius;
      axialWallRadiusMm = Math.max(1.1, sum / marginRadii.length - targetShoulderW);
    }
  };
  const syncLinkedTaperForHeight = (heightMm: number): boolean => {
    if (!isTaperLinked) return false;
    refreshAxialWallRadius();
    const nextDeg = computeOptimalPostTaperDeg(heightMm, bridgeRetention, { radiusMm: axialWallRadiusMm });
    if (Math.abs(nextDeg - effectiveTaperDeg) < 0.05) return false;
    effectiveTaperDeg = nextDeg;
    params.postTaperDeg = nextDeg;
    taperSlope = Math.tan(effectiveTaperDeg * DEG);
    chamfer = chamferGeometry(targetShoulderW, R, taperSlope);
    return true;
  };

  // 평평한 포스트 상단 경사(gu, gv)를 그대로 유지한 채, 실제 포스트 상단(라운드·정점 포함)에서
  // 대합치까지의 최단 거리가 설정한 대합 거리(clearance)에 정확히 맞도록 상단 평면 높이(planeShift)만 평행이동한다.
  // 높이·테이퍼가 연결되어 있으면 실제 포스트 높이에 맞춰 최적 접착력 테이퍼도 함께 수렴시킨다.
  const oppTrisLocal = opposingTrianglesInFixtureFrame(opposingGeometry, fixture.fixturePose, 18);
  // 대합 거리·포스트 높이·테이퍼·챔퍼 R 편집과 무관한 기준 상태에서 마진·베이스 단면을 먼저 1회 확정한다.
  buildShape(true);
  // 연결이 끊기면 높이 맞춤은 기준 테이퍼로 하고, 사용자가 준 각은 그 높이에 나중에 얹는다.
  // 테이퍼를 바꿔도 측정 높이가 따라 움직이지 않게 한다.
  const userTaperDeg = effectiveTaperDeg;
  const userTaperSlope = taperSlope;
  const userChamfer = chamfer;
  if (!isTaperLinked) {
    effectiveTaperDeg = refBaseTaperDeg;
    taperSlope = refBaseTaperSlope;
    chamfer = refBaseChamfer;
  }
  let shape = buildShape(false);
  const maxShiftUpBase = posterior || hasExplicitClearance || offsetH > 0.01 ? 8.0 : 0;
  if (hasOpposing && (oppTrisLocal.length >= 9 || oppNear.length > 0)) {
    const targetClear =
      offsetH >= 0
        ? Math.max(minClearanceFloor, clearance - offsetH)
        : clearance - offsetH;
    const axialCos = Math.max(dot3(frame.w, occInFix), 0.35);
    // 전치·견치는 수평피개(overjet)로 상악 대합치가 멀리 있을 때 포스트가 인접치 절단연 위로 솟지 않도록
    // 대합 거리를 직접 편집하지 않은 기본 생성에서는 아래쪽(대합 간섭 회피)으로만 평행이동한다.
    for (let pass = 0; pass < 6; pass += 1) {
      const measuredH = measureShapePostHeightMm(shape);
      let maxShiftUp = incisorDeepBite
        ? Math.min(8, Math.max(maxShiftUpBase, postTopH - measuredH + planeShift))
        : maxShiftUpBase;
      if (bridgeMatchedTopH != null) {
        const axialH = measuredH / Math.max(frame.w[2], 0.35);
        maxShiftUp = Math.min(maxShiftUp, planeShift + Math.max(0, bridgeMatchedTopH - axialH));
      }
      const taperChanged = syncLinkedTaperForHeight(measuredH);
      let delta = 0;
      let hasDelta = true;
      if (oppTrisLocal.length >= 9) {
        const solveShift = (
          columns: readonly (readonly Vec3[])[],
          targetMm: number,
          lateralMm?: number,
        ) =>
          solvePostTopClearanceShiftMm({
            columns,
            apex: shape.postApex,
            roundSteps: TOP_ROUND_STEPS,
            opposingTris: oppTrisLocal,
            up: occInFix,
            targetClearanceMm: targetMm,
            lateralMm,
          });
        let occShift: number | null;
        if (incisorDeepBite) {
          // 순측 절단은 대합 거리(1.5mm)를 맞추고, 설측은 면이 0.7mm만 비우면 된다.
          // 설측 대합이 가깝다고 순측 절단까지 같이 내리지 않는다.
          const labialColumns = shape.postByCol.filter((post) => {
            const start = Math.max(0, post.length - 14);
            let labial = -Infinity;
            for (let i = start; i < post.length; i += 1) {
              const rel = sub3(post[i]!, c0);
              const radial = sub3(rel, scale3(frame.w, dot3(rel, frame.w)));
              if (Math.hypot(radial[0], radial[1], radial[2]) < 0.45) continue;
              labial = Math.max(labial, dot3(radial, frame.uLabial));
            }
            return labial > 0.15;
          });
          const labialShift =
            labialColumns.length >= 4 ? solveShift(labialColumns, targetClear) : solveShift(shape.postByCol, targetClear);
          const floorShift = solveShift(shape.postByCol, minClearanceFloor, 0.3);
          if (labialShift == null && floorShift == null) occShift = null;
          else occShift = Math.min(labialShift ?? Infinity, floorShift ?? Infinity);
        } else {
          occShift = solveShift(shape.postByCol, targetClear);
        }
        if (occShift == null) hasDelta = false;
        else delta = occShift / axialCos;
      } else {
        let min3D = nearestOpp(shape.postApex);
        for (let col = 0; col < ANGULAR_COLS; col += 2) {
          const post = shape.postByCol[col]!;
          const sampleStart = Math.max(0, post.length - TOP_ROUND_STEPS - 2);
          for (let idx = sampleStart; idx < post.length; idx += 2) {
            min3D = Math.min(min3D, nearestOpp(post[idx]!));
          }
          min3D = Math.min(min3D, nearestOpp(post[post.length - 1]!));
        }
        if (!Number.isFinite(min3D)) hasDelta = false;
        else delta = min3D - targetClear;
      }
      const nextShift = hasDelta ? clamp(planeShift + delta, -20.0, maxShiftUp) : planeShift;
      if (!taperChanged && (!hasDelta || Math.abs(nextShift - planeShift) < 0.008)) break;
      planeShift = nextShift;
      shape = buildShape();
    }
    if (syncLinkedTaperForHeight(measureShapePostHeightMm(shape))) {
      shape = buildShape();
    }
  } else if (syncLinkedTaperForHeight(measureShapePostHeightMm(shape))) {
    shape = buildShape();
  }
  if (!isTaperLinked) {
    const targetH = measureShapePostHeightMm(shape);
    effectiveTaperDeg = userTaperDeg;
    taperSlope = userTaperSlope;
    chamfer = userChamfer;
    params.postTaperDeg = Math.round(userTaperDeg * 10) / 10;
    shape = buildShape(false);
    for (let fit = 0; fit < 3; fit += 1) {
      const deltaH = targetH - measureShapePostHeightMm(shape);
      if (Math.abs(deltaH) < 0.02) break;
      const shiftCap = incisorDeepBite
        ? Math.max(maxShiftUpBase, postTopH - measureShapePostHeightMm(shape) + planeShift)
        : maxShiftUpBase;
      planeShift = clamp(planeShift + deltaH, -20, shiftCap);
      shape = buildShape(false);
    }
  }
  const { postByCol, crownByCol, cutbackSum, postApex, crownApex, meanCrownCuspH } = shape;
  // ── 8) 솔리드 외형(커넥션·커프·포스트)을 닫고, 스크류 홀은 임플란트 축 실측 단차 입체로 따로 뚫는다
  const l2 = conn.l2Mm;
  const zBot = -l2;
  const hexFlatR = conn.hexSizeMm ? conn.hexSizeMm / 2 : originR - TAPER_11_SLOPE * (l2 * 0.45);
  const hexCornerR = conn.hexSizeMm ? (hexFlatR / Math.cos(Math.PI / 6)) * 0.982 : hexFlatR;
  const coneStartZ = Math.max(zBot + 0.75, Math.min(-0.25, (hexCornerR - originR) / TAPER_11_SLOPE));
  const cuffRows = 22;
  const bottomPole: Vec3 = [0, 0, zBot];
  const connectionRingsCount = 7;
  const marginRingIdx = connectionRingsCount + (cuffRows - 1);

  const marginPtsXY = cols.map((c): [number, number] => [c.marginPt[0], c.marginPt[1]]);
  const evalMinkowskiCuffR = buildMinkowskiCuffRadiusEvaluator(coneTopR, marginPtsXY);
  let refCuffDelta = 0.35;
  let refCuffSpan = Math.max(0.45, finalMeanMarginZ - coneTopZ);
  for (const c of cols) {
    const rM = Math.hypot(c.marginPt[0], c.marginPt[1]);
    if (rM - coneTopR > refCuffDelta) {
      refCuffDelta = rM - coneTopR;
      refCuffSpan = Math.max(0.35, c.marginPt[2] - coneTopZ);
    }
  }
  const sharedCuffCurve = cuffProfile(0, 0, refCuffDelta, refCuffSpan);

  const minMarginZForCuff = Math.min(...cols.map((c) => c.marginPt[2]));
  const maxMarginZForCuff = Math.max(...cols.map((c) => c.marginPt[2]));
  const hasScallopBand = maxMarginZForCuff - minMarginZForCuff > 0.12 && minMarginZForCuff > coneTopZ + 0.55;
  const horizCuffRows = hasScallopBand ? 16 : cuffRows - 1;
  const scallopCuffRows = cuffRows - 1 - horizCuffRows;
  const horizTopZ = hasScallopBand
    ? Math.max(coneTopZ + 0.3, minMarginZForCuff - 0.06)
    : minMarginZForCuff;

  // 수평 등고선 커프 구간(coneTopZ .. horizTopZ)은 같은 높이 Z에서 144개 열의 반경을 구한 뒤
  // 매 층마다 2D 외측 볼록 포락선으로 마감해 커프 전 구간의 수평 단면 오목(설측 주름)을 수학적으로 0으로 만든다.
  const horizRingZ: number[] = [];
  const horizRingRadii: number[][] = [];
  for (let k = 1; k <= horizCuffRows; k += 1) {
    const z = hasScallopBand
      ? coneTopZ + ((horizTopZ - coneTopZ) * k) / horizCuffRows
      : coneTopZ + ((minMarginZForCuff - coneTopZ) * k) / cuffRows;
    horizRingZ.push(z);
    const rawR = cols.map((c, col) => {
      const theta = (col / ANGULAR_COLS) * Math.PI * 2;
      const zM = c.marginPt[2];
      const u = clamp((z - coneTopZ) / Math.max(0.35, zM - coneTopZ), 0, 1);
      const alpha = clamp(sharedCuffCurve(u * refCuffSpan) / refCuffDelta, 0, 1);
      return evalMinkowskiCuffR(theta, alpha);
    });
    horizRingRadii.push(projectPolarRadiiToConvexHull(rawR));
  }

  const bodyColumns: Vec3[][] = [];
  for (let col = 0; col < ANGULAR_COLS; col += 1) {
    const theta = (col / ANGULAR_COLS) * Math.PI * 2;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const marginPt = cols[col]!.marginPt;
    const zMarginFix = marginPt[2];
    const rMarginFix = Math.hypot(marginPt[0], marginPt[1]);
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
    if (hasScallopBand) {
      for (let k = 0; k < horizCuffRows; k += 1) {
        pts.push(cyl(horizRingRadii[k]![col]!, horizRingZ[k]!));
      }
      const rAtHorizTop = horizRingRadii[horizCuffRows - 1]![col]!;
      const remZ = Math.max(0.03, zMarginFix - horizTopZ);
      for (let s = 1; s <= scallopCuffRows; s += 1) {
        const z = horizTopZ + (remZ * s) / (scallopCuffRows + 1);
        const u = clamp((z - coneTopZ) / Math.max(0.35, zMarginFix - coneTopZ), 0, 1);
        const alpha = clamp(sharedCuffCurve(u * refCuffSpan) / refCuffDelta, 0, 1);
        const rMink = evalMinkowskiCuffR(theta, alpha);
        const fracS = s / (scallopCuffRows + 1);
        const rSmooth = Math.max(
          rAtHorizTop,
          Math.min(rMarginFix, rMink * (1 - fracS * 0.15) + (rAtHorizTop + (rMarginFix - rAtHorizTop) * fracS) * (fracS * 0.15)),
        );
        pts.push(cyl(rSmooth, z));
      }
    } else {
      const cuffSpan = Math.max(0.35, zMarginFix - coneTopZ);
      for (let k = 1; k < cuffRows; k += 1) {
        const u = k / cuffRows;
        const z = coneTopZ + cuffSpan * u;
        const alpha = clamp(sharedCuffCurve(u * refCuffSpan) / refCuffDelta, 0, 1);
        pts.push(cyl(evalMinkowskiCuffR(theta, alpha), z));
      }
    }
    pts.push([marginPt[0], marginPt[1], marginPt[2]], ...postByCol[col]!, postApex);
    bodyColumns.push(pts);
  }

  const bodySoup = stitchPolarColumns(
    bodyColumns,
    true,
    bodyColumns[0]!.length - 3 - TOP_ROUND_STEPS,
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

  // 포스트 윗면 0.1mm 그리드에서 교합 방향(수직) 레이 → 대합 스캔 면까지의 최단 거리
  const occlusalClearanceMm =
    oppTrisLocal.length >= 9
      ? shortestPostTopClearanceMm({
          columns: postByCol,
          apex: postApex,
          roundSteps: TOP_ROUND_STEPS,
          opposingTris: oppTrisLocal,
          up: occInFix,
        })
      : measurePostTopClearanceMm(
          opposingGeometry,
          fixture.fixturePose,
          postByCol,
          postApex,
          occInFix,
        );

  let zMinLocal = Infinity;
  let zMaxLocal = -Infinity;
  let maxOuterR = 0;
  for (let i = 0; i < bodySoup.length; i += 3) {
    const z = bodySoup[i + 2]!;
    if (z < zMinLocal) zMinLocal = z;
    if (z > zMaxLocal) zMaxLocal = z;
    maxOuterR = Math.max(maxOuterR, Math.hypot(bodySoup[i]!, bodySoup[i + 1]!));
  }
  const snappedDiameter = snapMaxDiameterMm(maxOuterR * 2);
  const connectionKeepR = Math.max(hexCornerR, coneTopR) + 0.04;
  const minMarginZVal = Math.min(...smoothMarginZ);
  if (
    snappedDiameter < Math.round(maxOuterR * 2 * 100) / 100 - 1e-6 &&
    maxOuterR > connectionKeepR + 0.25
  ) {
    const targetR = snappedDiameter / 2;
    const minKeepWallR = boreTopR + MIN_POST_WALL_MM;
    compressOuterRadius(bodySoup, coneTopZ, minMarginZVal, maxOuterR, targetR, minKeepWallR, boreTopR);
    compressOuterRadius(marginLoopLocal, coneTopZ, minMarginZVal, maxOuterR, targetR, minKeepWallR, boreTopR);
    compressOuterRadius(crownLocalPositions, coneTopZ, minMarginZVal, maxOuterR, targetR);
    maxOuterR = 0;
    for (let i = 0; i < bodySoup.length; i += 3) {
      maxOuterR = Math.max(maxOuterR, Math.hypot(bodySoup[i]!, bodySoup[i + 1]!));
    }
  }

  let zTopMax = -Infinity;
  for (let i = 2; i < bodySoup.length; i += 3) zTopMax = Math.max(zTopMax, bodySoup[i]!);
  const mouthSurfaceZ = postApex[2];
  const finalBore = resolveScrewChannelProfile(conn, mouthSurfaceZ);
  const cutter = screwChannelSoup(finalBore, zBot - 1, zTopMax + 3);
  const localPositions = await subtractTriangleSoups(
    bodySoup,
    [cutter],
    `#${fixture.toothNumber} 커스텀어벗`,
  );

  const cleanPatient = String(args.patientName || "")
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, "");
  const fileName = cleanPatient
    ? `${cleanPatient}_${fixture.toothNumber}_custom_abutment.stl`
    : `custom_abutment_${fixture.toothNumber}.stl`;

  const round2 = (v: number) => Math.round(v * 100) / 100;
  params.marginSubgMinMm = round2(subgMin);
  params.marginSubgMaxMm = round2(subgMax);
  params.marginDepthMm = round2(subgMin);
  const finalPostHeightMm = round2(zMaxLocal - finalMeanMarginZ);

  // 스크류 홀 둘레 실제 최소 포스트 외벽 두께(mm)와, 최소 크라운 두께 확보를 위해 인접치 인접면을
  // 살짝(편측 ≤0.2mm) 갈아내야 하는 부위의 3D 패치(enameloplastyLocalPositions) 및 치아별 삭제량을 산출한다.
  let minPostWallThicknessMm: number | undefined;
  {
    let minWall = Infinity;
    for (let col = 0; col < ANGULAR_COLS; col += 1) {
      const pts = postByCol[col]!;
      const limitIdx = Math.max(1, pts.length - TOP_ROUND_STEPS + 1);
      for (let idx = 0; idx < limitIdx; idx += 1) {
        const pt = pts[idx]!;
        const boreR = finalBore.radiusAtZ(pt[2]);
        const rXY = Math.hypot(pt[0], pt[1]);
        if (rXY > boreR + 0.02) minWall = Math.min(minWall, rXY - boreR);
      }
    }
    if (Number.isFinite(minWall)) minPostWallThicknessMm = round2(minWall);
  }

  let enameloplastyLocalPositions: Float32Array | undefined;
  const adjacentEnameloplasty: AdjacentEnameloplastyGuide[] = [];
  if (mesialAdjDigits || distalAdjDigits) {
    const STRIP_PHI_BINS = 72;
    const STRIP_H_MIN = -1.0;
    const STRIP_H_STEP = 0.4;
    const STRIP_H_BINS = 40;
    const postOuterGrid = new Float32Array(STRIP_PHI_BINS * STRIP_H_BINS).fill(0);
    let maxPostHInFrame = 0;
    for (let col = 0; col < ANGULAR_COLS; col += 1) {
      for (const pt of postByCol[col]!) {
        const rel = sub3(pt, c0);
        const h = dot3(rel, frame.w);
        if (h > maxPostHInFrame) maxPostHInFrame = h;
        const hb = Math.floor((h - STRIP_H_MIN) / STRIP_H_STEP);
        if (hb < 0 || hb >= STRIP_H_BINS) continue;
        const u = dot3(rel, frame.uLabial);
        const v = dot3(rel, frame.vSide);
        const r = Math.hypot(u, v);
        const pb = Math.min(
          STRIP_PHI_BINS - 1,
          Math.floor((wrapAngle(Math.atan2(v, u)) / (Math.PI * 2)) * STRIP_PHI_BINS),
        );
        const idx = pb * STRIP_H_BINS + hb;
        if (r > postOuterGrid[idx]!) postOuterGrid[idx] = r;
      }
    }
    const postOuterAt = (phi: number, h: number) => {
      const pb = Math.floor((wrapAngle(phi) / (Math.PI * 2)) * STRIP_PHI_BINS);
      const hb = Math.floor((h - STRIP_H_MIN) / STRIP_H_STEP);
      let best = 0;
      for (let dp = -1; dp <= 1; dp += 1) {
        const pp = (pb + dp + STRIP_PHI_BINS) % STRIP_PHI_BINS;
        for (let dh = -1; dh <= 1; dh += 1) {
          const hh = hb + dh;
          if (hh < 0 || hh >= STRIP_H_BINS) continue;
          const val = postOuterGrid[pp * STRIP_H_BINS + hh]!;
          if (val > best) best = val;
        }
      }
      return best;
    };
    const h0ByPhi = cols.map((c) => c.h0);
    const reqCrownRAt = (phi: number, h: number) => {
      const colApprox =
        Math.floor((wrapAngle(phi) / (Math.PI * 2)) * ANGULAR_COLS) % ANGULAR_COLS;
      const localH0 = h0ByPhi[colApprox] ?? 0;
      if (h < localH0 + 0.35 || h > maxPostHInFrame + 0.9) return 0;
      const pOut = postOuterAt(phi, h);
      if (pOut <= 0.2) return 0;
      const ramp = smootherstep(clamp((h - localH0 - 0.25) / 1.0, 0, 1));
      // 포스트 최소 두께(≥0.3mm) 바깥에 최소 크라운 두께(0.55mm 이상)를 얹은 필수 외경.
      const minCrownWall = Math.max(MIN_STRIP_CROWN_WALL_MM, 0.56);
      return pOut + minCrownWall * ramp;
    };

    const jawPosAttr = jawGeometry.getAttribute("position");
    const jawIndex = jawGeometry.getIndex();
    if (jawPosAttr && jawPosAttr.count >= 3) {
      const triCount = Math.floor((jawIndex ? jawIndex.count : jawPosAttr.count) / 3);
      const [ox, oy, oz] = fixture.fixturePose.origin;
      const cropR2 = 12 * 12;
      type SideAccum = {
        tris: number[];
        peakDepth: number;
        sumX: number;
        sumY: number;
        sumZ: number;
        sumW: number;
      };
      const sideAcc: Record<"mesial" | "distal", SideAccum> = {
        mesial: { tris: [], peakDepth: 0, sumX: 0, sumY: 0, sumZ: 0, sumW: 0 },
        distal: { tris: [], peakDepth: 0, sumX: 0, sumY: 0, sumZ: 0, sumW: 0 },
      };
      const evalVert = (lp: Vec3) => {
        if (Math.hypot(lp[0], lp[1]) < sbR + 0.5 && lp[2] > -0.4 && lp[2] < sbH + 0.65) {
          return null;
        }
        const rel = sub3(lp, c0);
        const h = dot3(rel, frame.w);
        const u = dot3(rel, frame.uLabial);
        const v = dot3(rel, frame.vSide);
        const r = Math.hypot(u, v);
        if (r < 1.25 || r > 6.4) return null;
        const phi = Math.atan2(v, u);
        if (Math.abs(Math.sin(phi)) < Math.sin(34 * DEG)) return null;
        const reqR = reqCrownRAt(phi, h);
        const rawIntrusion = reqR - r;
        return { h, u, v, r, phi, rawIntrusion };
      };
      for (let t = 0; t < triCount; t += 1) {
        const i0 = jawIndex ? jawIndex.getX(t * 3) : t * 3;
        const i1 = jawIndex ? jawIndex.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = jawIndex ? jawIndex.getX(t * 3 + 2) : t * 3 + 2;
        const wx0 = jawPosAttr.getX(i0);
        const wy0 = jawPosAttr.getY(i0);
        const wz0 = jawPosAttr.getZ(i0);
        if ((wx0 - ox) ** 2 + (wy0 - oy) ** 2 + (wz0 - oz) ** 2 > cropR2) continue;
        const a = worldPointToFixtureLocal([wx0, wy0, wz0], fixture.fixturePose);
        const b = worldPointToFixtureLocal(
          [jawPosAttr.getX(i1), jawPosAttr.getY(i1), jawPosAttr.getZ(i1)],
          fixture.fixturePose,
        );
        const d = worldPointToFixtureLocal(
          [jawPosAttr.getX(i2), jawPosAttr.getY(i2), jawPosAttr.getZ(i2)],
          fixture.fixturePose,
        );
        const va = evalVert(a);
        const vb = evalVert(b);
        const vd = evalVert(d);
        if (!va || !vb || !vd) continue;
        const maxRaw = Math.max(va.rawIntrusion, vb.rawIntrusion, vd.rawIntrusion);
        if (maxRaw <= 0.02) continue;
        const meanSin = (Math.sin(va.phi) + Math.sin(vb.phi) + Math.sin(vd.phi)) / 3;
        const isMesial = meanSin * mesialSignOnV >= 0;
        const adjDigits = isMesial ? mesialAdjDigits : distalAdjDigits;
        const sideAllow = isMesial ? mesialAllowance : distalAllowance;
        if (!adjDigits || sideAllow.wallMm > 0 || (!isMesial && isWisdomTooth)) continue;

        // 내 지대치 쪽을 바라보는 인접치 인접면 법선만 채택해 순·설 반대편 뒷면이 칠해지지 않게 한다.
        const nLocal = norm3(cross3(sub3(b, a), sub3(d, a)));
        const midU = (va.u + vb.u + vd.u) / 3;
        const midV = (va.v + vb.v + vd.v) / 3;
        const toCenterLocal = norm3(
          add3(scale3(frame.uLabial, -midU), scale3(frame.vSide, -midV)),
        );
        const facingDot = dot3(nLocal, toCenterLocal);
        if (Math.abs(facingDot) < 0.16) continue;
        const outNormal = facingDot >= 0 ? nLocal : scale3(nLocal, -1);

        const clampedDepth = Math.min(MAX_ADJACENT_ENAMELOPLASTY_MM, maxRaw);
        const sideKey = isMesial ? "mesial" : "distal";
        const bucket = sideAcc[sideKey];
        if (clampedDepth > bucket.peakDepth) bucket.peakDepth = clampedDepth;
        const offsetMm = 0.026;
        const ao = add3(a, scale3(outNormal, offsetMm));
        const bo = add3(b, scale3(outNormal, offsetMm));
        const doPt = add3(d, scale3(outNormal, offsetMm));
        bucket.tris.push(ao[0], ao[1], ao[2], bo[0], bo[1], bo[2], doPt[0], doPt[1], doPt[2]);
        const wgt = clampedDepth * clampedDepth;
        bucket.sumX += ((ao[0] + bo[0] + doPt[0]) / 3) * wgt;
        bucket.sumY += ((ao[1] + bo[1] + doPt[1]) / 3) * wgt;
        bucket.sumZ += ((ao[2] + bo[2] + doPt[2]) / 3) * wgt;
        bucket.sumW += wgt;
      }

      const mergedTris: number[] = [];
      for (const sideKey of ["mesial", "distal"] as const) {
        const adjDigits = sideKey === "mesial" ? mesialAdjDigits : distalAdjDigits;
        const bucket = sideAcc[sideKey];
        if (!adjDigits || bucket.peakDepth < 0.04 || bucket.tris.length < 18 || bucket.sumW <= 0) {
          continue;
        }
        mergedTris.push(...bucket.tris);
        const centerLocal: Vec3 = [
          bucket.sumX / bucket.sumW,
          bucket.sumY / bucket.sumW,
          bucket.sumZ / bucket.sumW,
        ];
        const centerWorld = fixtureLocalPointToWorld(centerLocal, fixture.fixturePose);
        adjacentEnameloplasty.push({
          adjacentToothNumber: adjDigits,
          side: sideKey,
          maxDepthMm: Math.min(MAX_ADJACENT_ENAMELOPLASTY_MM, round2(bucket.peakDepth)),
          spotCenterWorld: [
            round2(centerWorld[0]),
            round2(centerWorld[1]),
            round2(centerWorld[2]),
          ],
        });
      }
      if (mergedTris.length >= 9) {
        enameloplastyLocalPositions = new Float32Array(mergedTris);
      }
    }
  }
  refreshAxialWallRadius();
  const retentionIdealDeg = evaluatePostTaperRetention(finalPostHeightMm, bridgeRetention, {
    radiusMm: axialWallRadiusMm,
  }).idealTaperDeg;
  const idealPostTaperDeg =
    shape.geomIdealTaperDeg != null
      ? Math.min(retentionIdealDeg, shape.geomIdealTaperDeg)
      : retentionIdealDeg;
  const minAllowedReportTaper = isTaperLinked
    ? taperSpec.minTaperDeg
    : RETENTION_SINGLE_MIN_TAPER_DEG;
  // 연결이 끊기면 표시 각은 사용자가 둔 값이다. 높이를 바꿔 벽 측정각이 흔들려도 테이퍼 숫자는 그대로다.
  const reportedPostTaperDeg = clamp(
    Math.round(effectiveTaperDeg * 10) / 10,
    minAllowedReportTaper,
    taperSpec.maxTaperDeg,
  );
  const reportedLingualBevelMm =
    shape.lingualBevelMm != null
      ? Math.round(
          Math.min(shape.lingualBevelMm, Math.max(0.5, finalPostHeightMm - 0.5)) * 10,
        ) / 10
      : null;
  const reportedLabialBevelMm =
    shape.labialBevelMm != null
      ? Math.round(Math.min(shape.labialBevelMm, Math.max(0, finalPostHeightMm - 0.5)) * 10) / 10
      : null;
  let marginZMinActual = Infinity;
  let marginZMaxActual = -Infinity;
  for (let i = 2; i < marginLoopLocal.length; i += 3) {
    const mz = marginLoopLocal[i]!;
    if (mz < marginZMinActual) marginZMinActual = mz;
    if (mz > marginZMaxActual) marginZMaxActual = mz;
  }
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
    ...(enameloplastyLocalPositions ? { enameloplastyLocalPositions } : {}),
    params,
    metrics: {
      connectionDiameterMm: conn.originDiameterMm,
      maxDiameterMm: round2(maxOuterR * 2),
      cuffHeightMinMm: round2(Number.isFinite(marginZMinActual) ? marginZMinActual : Math.min(...smoothMarginZ)),
      cuffHeightMaxMm: round2(Number.isFinite(marginZMaxActual) ? marginZMaxActual : Math.max(...smoothMarginZ)),
      postHeightMm: finalPostHeightMm,
      postWallRadiusMm: round2(axialWallRadiusMm),
      totalLengthMm: round2(zMaxLocal - zMinLocal),
      angulationDeg: Math.round(angulationDeg * 10) / 10,
      cutbackMm: round2(cutbackSum / ANGULAR_COLS),
      rmsMm: fixture.rmsMm,
      postTaperDeg: reportedPostTaperDeg,
      idealPostTaperDeg,
      ...(reportedLingualBevelMm != null ? { postLingualBevelMm: reportedLingualBevelMm } : {}),
      ...(reportedLabialBevelMm != null ? { postLabialBevelMm: reportedLabialBevelMm } : {}),
      occlusalClearanceMm,
      marginFilletRadiusMm: Math.round(params.marginFilletRadiusMm * 10) / 10,
      marginSubgMinMm: round2(subgMin),
      marginSubgMaxMm: round2(subgMax),
      isBridge: bridgeRetention.isBridge,
      bridgeRetainerCount: bridgeRetention.retainerCount,
      axisSource,
      adjacentOcclusalMm: Number.isFinite(archCrownTopH) ? round2(archCrownTopH) : null,
      crownOverPostMm: round2(meanCrownCuspH - dot3(sub3(postApex, c0), frame.w)),
      ...(supragingivalRaisedForStrength ? { supragingivalRaisedForStrength: true } : {}),
      ...(minPostWallThicknessMm != null ? { minPostWallThicknessMm } : {}),
      ...(adjacentEnameloplasty.length > 0 ? { adjacentEnameloplasty } : {}),
    },
  });
  return {
    kind: "design",
    design,
    conflictHints: {
      hasWideProximalSpace,
      maxProximalExcessMm,
      supragingivalRaised: Boolean(supragingivalRaisedForStrength),
      rawTiltDeg: rawTiltRad / DEG,
      hasGroupAxis: Boolean(mode.groupAxisWorld),
    },
  };
}

export type JawGingivaMarginProbeFixture = {
  labialDir: readonly number[];
  mesialDir: readonly number[];
  scanbodyRadiusMm?: number;
  scanbodyHeightMm?: number;
  gingivaFloorMm?: number;
  fixturePose: {
    hexX: readonly number[];
    hexY: readonly number[];
    axis: readonly number[];
    origin: readonly number[];
  };
  connectionSpec?: {
    prcConeTopMm: number;
    originDiameterMm?: number;
  };
};

export type JawGingivaMarginProbe = {
  minMarginZ: number;
  drapeMarginLoopZ: (
    marginLoopLocal: Float32Array,
    opts: {
      subgMinMm: number;
      subgMaxMm: number;
      scallopMm?: number;
    },
  ) => Float32Array | null;
};

const jawGingivaProbeCache = new WeakMap<
  THREE.BufferGeometry,
  Map<string, JawGingivaMarginProbe | null>
>();

/**
 * 구강 스캔(jawGeometry)을 픽스쳐 로컬 XY 상면 높이 격자로 래스터화해,
 * 검볼 이동·스케일·회전 및 치은 연하 변경 때마다 현재 피니시라인 XY 윤곽 위의 실제 치은선 굴곡(근·원심 고점, 협·설 저점)과
 * 치은 연하 설정(subgMinMm ~ subgMaxMm)에 맞춰 피니시라인 Z 높이를 즉시 계산한다.
 */
export function buildJawGingivaMarginProbe(
  jawGeometry: THREE.BufferGeometry | null | undefined,
  fixture: JawGingivaMarginProbeFixture,
  toothNumber: string,
): JawGingivaMarginProbe | null {
  if (!jawGeometry) return null;
  const pos = jawGeometry.getAttribute("position");
  if (!pos || pos.count < 9) return null;

  const pose = fixture.fixturePose;
  const ox = pose.origin[0] ?? 0;
  const oy = pose.origin[1] ?? 0;
  const oz = pose.origin[2] ?? 0;
  const cacheKey = `${toothNumber}:${ox.toFixed(3)},${oy.toFixed(3)},${oz.toFixed(3)}`;
  let byFixture = jawGingivaProbeCache.get(jawGeometry);
  if (byFixture?.has(cacheKey)) {
    return byFixture.get(cacheKey) ?? null;
  }
  if (!byFixture) {
    byFixture = new Map();
    jawGingivaProbeCache.set(jawGeometry, byFixture);
  }

  const tpl = abutmentTemplateForTooth(toothNumber);
  const posterior = !tpl.anterior;
  const ownFdi = parseFdiTooth(toothNumber);
  const coneTopZ = fixture.connectionSpec?.prcConeTopMm ?? 1.0;
  const minMarginZ = Math.max(1.45, coneTopZ + 0.95);
  const sbR = Math.max(1.5, fixture.scanbodyRadiusMm ?? (fixture.connectionSpec?.originDiameterMm ?? 3.6) * 0.5);
  const sbH = Math.max(4.8, fixture.scanbodyHeightMm ?? 7.5);

  const hx0 = pose.hexX[0] ?? 1, hx1 = pose.hexX[1] ?? 0, hx2 = pose.hexX[2] ?? 0;
  const hy0 = pose.hexY[0] ?? 0, hy1 = pose.hexY[1] ?? 1, hy2 = pose.hexY[2] ?? 0;
  const az0 = pose.axis[0] ?? 0, az1 = pose.axis[1] ?? 0, az2 = pose.axis[2] ?? 1;
  const toLocalPt = (wx: number, wy: number, wz: number): Vec3 => {
    const dx = wx - ox;
    const dy = wy - oy;
    const dz = wz - oz;
    return [
      dx * hx0 + dy * hx1 + dz * hx2,
      dx * hy0 + dy * hy1 + dz * hy2,
      dx * az0 + dy * az1 + dz * az2,
    ];
  };
  const toLocalXYDir = (dir: readonly number[]): [number, number] => {
    const wx = dir[0] ?? 1;
    const wy = dir[1] ?? 0;
    const wz = dir[2] ?? 0;
    const lx = wx * hx0 + wy * hx1 + wz * hx2;
    const ly = wx * hy0 + wy * hy1 + wz * hy2;
    const len = Math.hypot(lx, ly);
    return len > 1e-6 ? [lx / len, ly / len] : [1, 0];
  };
  const labXY = toLocalXYDir(fixture.labialDir);
  let mesXY: [number, number] = [-labXY[1], labXY[0]];
  const rawMes = toLocalXYDir(fixture.mesialDir);
  if (mesXY[0] * rawMes[0] + mesXY[1] * rawMes[1] < 0) {
    mesXY = [-mesXY[0], -mesXY[1]];
  }

  // 1) 치은 기준 중앙 높이와 후구치 융기(retromolar pad) 여부를 먼저 읽는다.
  const index = jawGeometry.getIndex();
  const vStride = Math.max(1, Math.floor(pos.count / 18000));
  const nearRimZs: number[] = [];
  for (let v = 0; v < pos.count; v += vStride) {
    const wx = pos.getX(v), wy = pos.getY(v), wz = pos.getZ(v);
    if ((wx - ox) ** 2 + (wy - oy) ** 2 + (wz - oz) ** 2 > 144) continue;
    const p = toLocalPt(wx, wy, wz);
    if (p[2] < 0.7 || p[2] > sbH - 0.25) continue;
    const r = Math.hypot(p[0], p[1]);
    if (r >= sbR + 0.25 && r <= sbR + 2.6) nearRimZs.push(p[2]);
  }
  nearRimZs.sort((a, c) => a - c);
  const medianRimZ =
    nearRimZs.length >= 6
      ? nearRimZs[Math.floor(nearRimZs.length * 0.52)]!
      : Math.max(2.6, (fixture.gingivaFloorMm ?? 2.1) + 0.55);

  let tallDistalPts = 0;
  if (ownFdi?.pos === 7) {
    for (let v = 0; v < pos.count; v += vStride) {
      const wx = pos.getX(v), wy = pos.getY(v), wz = pos.getZ(v);
      if ((wx - ox) ** 2 + (wy - oy) ** 2 + (wz - oz) ** 2 > 144) continue;
      const p = toLocalPt(wx, wy, wz);
      const r = Math.hypot(p[0], p[1]);
      if (r < 3.8 || r > 9.2) continue;
      const alongDistal = -(p[0] * mesXY[0] + p[1] * mesXY[1]);
      if (alongDistal >= 3.4 && Math.abs(p[0] * labXY[0] + p[1] * labXY[1]) <= 4.2 && p[2] >= medianRimZ + 3.1) {
        tallDistalPts += 1;
        if (tallDistalPts >= 16) break;
      }
    }
  }
  const hasDistalRetromolarPad = ownFdi?.pos === 8 || (ownFdi?.pos === 7 && tallDistalPts < 16);

  // 2) 스캔바디 기둥 바깥의 치은 상면을 0.20mm XY 격자에 래스터화한다(삼각형 밀도와 무관하게 연속 치은선 확보).
  const step = 0.2;
  const halfSpan = 9.6;
  const minXY = -halfSpan;
  const gridCols = Math.round((halfSpan * 2) / step) + 1;
  const grid = new Float32Array(gridCols * gridCols).fill(-Infinity);
  const zScanCap = Math.min(sbH + 0.5, medianRimZ + (posterior ? 2.95 : 3.65));
  const minScanR2 = (sbR + 0.2) * (sbR + 0.2);
  const maxWorldR2 = 13.5 * 13.5;
  const triCount = Math.floor((index ? index.count : pos.count) / 3);
  let written = 0;

  for (let t = 0; t < triCount; t += 1) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    const x0 = pos.getX(i0), y0 = pos.getY(i0), z0 = pos.getZ(i0);
    const x1 = pos.getX(i1), y1 = pos.getY(i1), z1 = pos.getZ(i1);
    const x2 = pos.getX(i2), y2 = pos.getY(i2), z2 = pos.getZ(i2);
    if (
      (x0 - ox) ** 2 + (y0 - oy) ** 2 + (z0 - oz) ** 2 > maxWorldR2 &&
      (x1 - ox) ** 2 + (y1 - oy) ** 2 + (z1 - oz) ** 2 > maxWorldR2 &&
      (x2 - ox) ** 2 + (y2 - oy) ** 2 + (z2 - oz) ** 2 > maxWorldR2
    ) {
      continue;
    }
    const a = toLocalPt(x0, y0, z0);
    const b = toLocalPt(x1, y1, z1);
    const c = toLocalPt(x2, y2, z2);
    if (Math.max(a[2], b[2], c[2]) < 0.65 || Math.min(a[2], b[2], c[2]) > zScanCap) continue;
    // 인접치 수직 법랑질 절벽 삼각형(높이차 > 1.1mm & 급경사)은 치은 격자에 덮어쓰지 않는다.
    const ab = sub3(b, a);
    const ac = sub3(c, a);
    const nrm = cross3(ab, ac);
    const nLen = Math.hypot(nrm[0], nrm[1], nrm[2]);
    if (nLen < 1e-8) continue;
    if (Math.abs(nrm[2]) / nLen < 0.24 && Math.max(a[2], b[2], c[2]) > medianRimZ + 0.9) continue;

    const ixLo = Math.max(0, Math.floor((Math.min(a[0], b[0], c[0]) - minXY) / step));
    const ixHi = Math.min(gridCols - 1, Math.ceil((Math.max(a[0], b[0], c[0]) - minXY) / step));
    const iyLo = Math.max(0, Math.floor((Math.min(a[1], b[1], c[1]) - minXY) / step));
    const iyHi = Math.min(gridCols - 1, Math.ceil((Math.max(a[1], b[1], c[1]) - minXY) / step));
    const v0x = b[0] - a[0], v0y = b[1] - a[1];
    const v1x = c[0] - a[0], v1y = c[1] - a[1];
    const den = v0x * v1y - v1x * v0y;
    if (Math.abs(den) < 1e-9) continue;
    const invDen = 1 / den;

    for (let iy = iyLo; iy <= iyHi; iy += 1) {
      const py = minXY + iy * step;
      const v2y = py - a[1];
      const rowOff = iy * gridCols;
      for (let ix = ixLo; ix <= ixHi; ix += 1) {
        const px = minXY + ix * step;
        if (px * px + py * py < minScanR2) continue;
        const v2x = px - a[0];
        const w1 = (v2x * v1y - v1x * v2y) * invDen;
        const w2 = (v0x * v2y - v2x * v0y) * invDen;
        const w0 = 1 - w1 - w2;
        if (w0 < -0.05 || w1 < -0.05 || w2 < -0.05) continue;
        const z = a[2] * w0 + b[2] * w1 + c[2] * w2;
        if (z < 0.65 || z > zScanCap) continue;
        const cell = rowOff + ix;
        if (z > grid[cell]!) {
          grid[cell] = z;
          written += 1;
        }
      }
    }
  }

  if (written < 16) {
    byFixture.set(cacheKey, null);
    return null;
  }

  const sampleGridZ = (px: number, py: number): number => {
    const fx = (px - minXY) / step;
    const fy = (py - minXY) / step;
    const ix0 = Math.round(fx);
    const iy0 = Math.round(fy);
    if (ix0 < 1 || ix0 >= gridCols - 1 || iy0 < 1 || iy0 >= gridCols - 1) return Number.NaN;
    let sum = 0;
    let cnt = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      const rOff = (iy0 + dy) * gridCols;
      for (let dx = -1; dx <= 1; dx += 1) {
        const v = grid[rOff + ix0 + dx]!;
        if (Number.isFinite(v)) {
          sum += v;
          cnt += 1;
        }
      }
    }
    return cnt > 0 ? sum / cnt : Number.NaN;
  };

  const fillMissing = (arr: number[], fallbackVal: number) => {
    for (let b = 0; b < SECTORS; b += 1) {
      if (Number.isFinite(arr[b]!)) continue;
      let prev = fallbackVal;
      let next = fallbackVal;
      let dPrev = SECTORS;
      let dNext = SECTORS;
      for (let s = 1; s < SECTORS; s += 1) {
        const lp = arr[(b - s + SECTORS) % SECTORS]!;
        if (dPrev === SECTORS && Number.isFinite(lp)) {
          prev = lp;
          dPrev = s;
        }
        const rn = arr[(b + s) % SECTORS]!;
        if (dNext === SECTORS && Number.isFinite(rn)) {
          next = rn;
          dNext = s;
        }
        if (dPrev < SECTORS && dNext < SECTORS) break;
      }
      arr[b] =
        dPrev < SECTORS || dNext < SECTORS
          ? (prev * dNext + next * dPrev) / Math.max(dPrev + dNext, 1)
          : fallbackVal;
    }
  };

  const defaultScallop = posterior ? 0.55 : 0.75;
  const baseMaxSpan = tpl.kind === "molar" ? 2.05 : tpl.kind === "premolar" ? 2.15 : 2.45;

  const probe: JawGingivaMarginProbe = {
    minMarginZ,
    drapeMarginLoopZ: (marginLoopLocal, opts) => {
      const count = Math.floor(marginLoopLocal.length / 3);
      if (count < 8) return null;
      const subgMin = Math.min(opts.subgMinMm, opts.subgMaxMm);
      const subgMax = Math.max(opts.subgMinMm, opts.subgMaxMm);
      const subgSpan = Math.max(0, subgMax - subgMin);
      const scallopMm = opts.scallopMm ?? defaultScallop;
      const maxMarginZ = medianRimZ + Math.max(posterior ? 2.1 : 2.5, Math.max(0, -subgMin) + 0.85);

      let cx = 0;
      let cy = 0;
      for (let i = 0; i < count; i += 1) {
        cx += marginLoopLocal[i * 3]! / count;
        cy += marginLoopLocal[i * 3 + 1]! / count;
      }
      const cLen = Math.hypot(cx, cy);
      if (cLen > 2.2) {
        cx *= 2.2 / cLen;
        cy *= 2.2 / cLen;
      }

      const sectorRho = new Float64Array(SECTORS);
      const sectorCnt = new Int32Array(SECTORS);
      for (let i = 0; i < count; i += 1) {
        const dx = marginLoopLocal[i * 3]! - cx;
        const dy = marginLoopLocal[i * 3 + 1]! - cy;
        const ang = wrapAngle(Math.atan2(dy, dx));
        const b = Math.min(SECTORS - 1, Math.floor((ang / (Math.PI * 2)) * SECTORS));
        sectorRho[b] += Math.hypot(dx, dy);
        sectorCnt[b] += 1;
      }
      const rhoBySector = Array.from({ length: SECTORS }, (_, b) =>
        sectorCnt[b]! > 0 ? sectorRho[b]! / sectorCnt[b]! : Number.NaN,
      );
      fillMissing(rhoBySector, sbR + 1.0);

      const gingCrestRaw = new Array<number>(SECTORS).fill(Number.NaN);
      const gingAtMRaw = new Array<number>(SECTORS).fill(Number.NaN);
      const sectorCLab = new Array<number>(SECTORS);
      const sectorSMes = new Array<number>(SECTORS);
      const sectorRetromolar = new Array<boolean>(SECTORS);
      const hasNearGingiva = new Array<boolean>(SECTORS).fill(false);

      for (let b = 0; b < SECTORS; b += 1) {
        const phi = ((b + 0.5) / SECTORS) * Math.PI * 2;
        const cp = Math.cos(phi);
        const sp = Math.sin(phi);
        const cLab = cp * labXY[0] + sp * labXY[1];
        const sMes = cp * mesXY[0] + sp * mesXY[1];
        const proxW = sMes * sMes;
        const isRetromolar = hasDistalRetromolarPad && sMes < -0.35;
        sectorCLab[b] = cLab;
        sectorSMes[b] = sMes;
        sectorRetromolar[b] = isRetromolar;

        const rhoM = rhoBySector[b]!;
        const rhoStart = Math.max(0.35, rhoM - 0.55);
        const rhoEnd = isRetromolar
          ? rhoM + 0.35
          : (rhoM + 0.48) * (1 - proxW) + (rhoM + (posterior ? 0.85 : 1.0)) * proxW;

        let crest = Number.NaN;
        let prev = Number.NaN;
        for (let rho = rhoStart; rho <= rhoEnd + 1e-6; rho += 0.22) {
          const px = cx + rho * cp;
          const py = cy + rho * sp;
          if (px * px + py * py < minScanR2) continue;
          const z = sampleGridZ(px, py);
          if (!Number.isFinite(z)) continue;
          if (rho <= rhoM + 0.65) hasNearGingiva[b] = true;
          if (Number.isFinite(prev) && z - prev > 0.62) break;
          if (Math.abs(cLab) > 0.35 && Number.isFinite(crest) && z < crest - 0.16) break;
          crest = Number.isFinite(crest) ? Math.max(crest, z) : z;
          prev = z;
        }
        gingCrestRaw[b] = crest;

        const nearSamples: number[] = [];
        for (const dRho of [-0.16, 0, 0.16, 0.32]) {
          const rho = rhoM + dRho;
          if (rho < 0.3) continue;
          const px = cx + rho * cp;
          const py = cy + rho * sp;
          if (px * px + py * py < minScanR2) continue;
          const z = sampleGridZ(px, py);
          if (!Number.isFinite(z)) continue;
          if (Number.isFinite(crest) && z > crest + 0.85) continue;
          nearSamples.push(z);
        }
        if (nearSamples.length > 0) {
          nearSamples.sort((a, c) => a - c);
          const q = proxW > 0.35 ? 0.7 : 0.5;
          gingAtMRaw[b] = nearSamples[Math.min(nearSamples.length - 1, Math.floor(nearSamples.length * q))]!;
          hasNearGingiva[b] = true;
        }
      }

      fillMissing(gingAtMRaw, medianRimZ);
      for (let b = 0; b < SECTORS; b += 1) {
        if (!Number.isFinite(gingCrestRaw[b]!) && hasNearGingiva[b]) {
          gingCrestRaw[b] = gingAtMRaw[b]!;
        }
      }
      fillMissing(gingCrestRaw, medianRimZ);
      const gingSmooth = lowPassCircular(gingCrestRaw, 3);

      const gingLine = Array.from({ length: SECTORS }, (_, b) => {
        const proxW = sectorSMes[b]! * sectorSMes[b]!;
        const gS = gingSmooth[b]!;
        const gM = gingAtMRaw[b]!;
        const flGing = Math.min(gS, gM);
        const proxGing = sectorRetromolar[b]
          ? flGing
          : Math.max(gS, Math.min(gM, gS + 0.55));
        return flGing * (1 - proxW) + proxGing * proxW;
      });

      let flWSum = 0;
      let flMeanNum = 0;
      let flW2Sum = 0;
      let flSlopeNum = 0;
      for (let b = 0; b < SECTORS; b += 1) {
        const cLab = sectorCLab[b]!;
        const w = cLab * cLab;
        flWSum += w;
        flMeanNum += w * gingLine[b]!;
        flW2Sum += w * cLab * cLab;
        flSlopeNum += w * cLab * gingLine[b]!;
      }
      const flMean = flMeanNum / Math.max(flWSum, 1e-4);
      const flSlope = flSlopeNum / Math.max(flW2Sum, 1e-4);

      const scallopRatio = clamp(scallopMm / defaultScallop, 0, 2.4);
      const followScale = scallopRatio <= 1 ? scallopRatio : 1 + (scallopRatio - 1) * 0.25;
      const proxDepthRelief = Math.min(
        Math.max(subgSpan * 0.65, Math.max(0, subgMin) * 0.62),
        scallopMm * 0.65 + subgSpan * 0.4,
      );
      const extraUserProxLift = Math.max(0, scallopMm - defaultScallop) * 0.55;

      const draftZ = gingLine.map((gCrest, b) => {
        const cLab = sectorCLab[b]!;
        const sMes = sectorSMes[b]!;
        const proxW = sMes * sMes;
        const flW = cLab * cLab;
        const isRetromolar = sectorRetromolar[b]!;
        const baseDepthFl = subgMin + subgSpan * 0.72;
        const flBase = flMean + flSlope * cLab;
        const gingRise = clamp(gCrest - flBase, -0.65, isRetromolar ? 0.75 : baseMaxSpan);
        const naturalLift = gingRise * followScale + proxDepthRelief * proxW;
        const minScallopLift =
          (isRetromolar ? Math.min(0.45, scallopMm * 0.65) : scallopMm * 0.85) * proxW;
        const coronalLift =
          scallopMm <= 0.02 ? gingRise * scallopRatio : Math.max(naturalLift, minScallopLift);
        const zFl = flBase - baseDepthFl;
        const supragingivalLift = Math.max(0, -subgMin);
        const maxSpanAboveFl =
          (isRetromolar ? 0.95 : baseMaxSpan) + extraUserProxLift * proxW + supragingivalLift + subgSpan;
        const highCap = Math.min(maxMarginZ, zFl + maxSpanAboveFl);
        const crestSubgMin =
          subgMin < 0 ? subgMin : subgMin + subgSpan * (0.55 * (1 - proxW) + 0.1 * proxW);
        const crestCeil = gCrest - crestSubgMin + extraUserProxLift * proxW;
        const flSurfaceCeil =
          subgMin < 0
            ? gingAtMRaw[b]! + supragingivalLift
            : gingAtMRaw[b]! - Math.min(subgMax, Math.max(subgMin, subgMin + subgSpan * 0.5));
        const ceilZ =
          flW > 0.2
            ? Math.min(highCap, crestCeil * (1 - flW * 0.7) + Math.min(crestCeil, flSurfaceCeil) * (flW * 0.7))
            : Math.min(highCap, crestCeil);
        return clamp(Math.min(zFl + coronalLift, ceilZ), minMarginZ, highCap);
      });

      const clampedZ = lowPassCircular(draftZ, 3).map((z, b) => {
        const bounded = clamp(z, minMarginZ, maxMarginZ);
        if (!hasNearGingiva[b]) return bounded;
        const ging = gingLine[b]!;
        const hi = ging - subgMin;
        const lo = ging - subgMax;
        return clamp(bounded, Math.max(minMarginZ, Math.min(lo, hi)), Math.min(maxMarginZ, Math.max(lo, hi)));
      });
      const smoothZ = lowPassCircular(clampedZ, 3).map((z) => clamp(z, minMarginZ, maxMarginZ));
      const evalZ = buildPeriodicSmoothCurve(smoothZ, 3);

      const outZ = new Float32Array(count);
      for (let i = 0; i < count; i += 1) {
        const dx = marginLoopLocal[i * 3]! - cx;
        const dy = marginLoopLocal[i * 3 + 1]! - cy;
        outZ[i] = clamp(evalZ(wrapAngle(Math.atan2(dy, dx))), minMarginZ, maxMarginZ);
      }
      return outZ;
    },
  };

  byFixture.set(cacheKey, probe);
  return probe;
}
