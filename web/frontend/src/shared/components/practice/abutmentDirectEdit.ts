// 커스텀어벗 뷰어의 직접 편집.
// 검볼 UI 원점은 포스트 중심이다. 클릭·드래그 종류와 관계없이 검볼 위치는 거기에 고정된다.
// 파란 회전의 형상 힌지는 피니시라인 중앙이다. 호를 끄는 각도는 검볼(호) 중심에서 잰다.
// 기울기는 포스트 축을 비틀지 않는 강체 회전이라 표면이 꼬이지 않는다.
// 빨간 축은 화면 오른쪽, 초록 축은 화면 위, 파란 축은 화면 밖이다.
// 고리(XY)가 화면에 평행하고 파란 축이 화면에 수직이다. 뷰가 바뀌면 검볼도 따라 돈다.
// 화살표는 그 방향으로 포스트를 옮긴다. 축 상자는 그 방향 크기, 노란 면은 평면 2D 스케일이다.
// 커넥션과 11° 콘은 고정이다. 커프는 지금 마진 라인까지 오목한 단면으로 다시 깔고, 그 위 포스트만 움직인다.
// 스크류 홀은 임플란트 축에 남기고, 윗면이 움직이면 입구 높이만 따라간다.
// 검볼을 움직이면 어벗 정보 수치를 다시 읽고, 손을 떼면 되돌리기 기록에 남긴다.
// related files:
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx
// - web/frontend/src/shared/practice/customAbutmentDesignParams.ts
// - web/frontend/src/shared/files/stlBinaryWrite.ts

import * as THREE from "three";

import { encodeBinaryStl } from "../../files/stlBinaryWrite";
import { cuffProfile } from "../../practice/cuffProfile";
import {
  buildJawGingivaMarginProbe,
  buildMinkowskiCuffRadiusEvaluator,
  cropTrianglesInFixtureFrame,
  resolveScrewChannelProfile,
  type JawGingivaMarginProbe,
} from "../../practice/customAbutmentStlDesign";
import {
  buildOpposingClearanceIndex,
  type OpposingClearanceIndex,
} from "../../practice/occlusalClearanceRay";
import {
  CUSTOM_ABUTMENT_PARAM_SPECS,
  computeOptimalPostTaperDeg,
  isAnteriorTooth,
  postRetentionSurface,
  RETENTION_SINGLE_REF_TAPER_DEG,
  type CustomAbutmentDesignParams,
} from "../../practice/customAbutmentDesignParams";
import { gumballGroupTeeth } from "../../practice/customAbutmentSelection";
import { subtractTriangleSoups } from "../../practice/meshUnion";
import { computeCreasedVertexNormals, withDoubleSidePick } from "../../three/backFaceShell";

const AXIS_COLOR = [0xef4444, 0x22c55e, 0x3b82f6] as const;
export const GUMBALL_SIZE_PX = 60;
const SCALE_MIN = 0.65;
const SCALE_MAX = 1.45;
const SHIFT_MM = 2.5;
const HEIGHT_MM = 2.5;
const TILT_DEG = 25;
const YAW_DEG = 30;
const HISTORY_LIMIT = 40;

export type DirectEditFixture = {
  labialDir: readonly number[];
  mesialDir: readonly number[];
  archOcclusalDir?: readonly number[];
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
    l2Mm?: number;
    prcConeTopMm: number;
    originDiameterMm?: number;
    screwLowerDiameterMm?: number;
    screwUpperDiameterMm: number;
    screwTopMouthDiameterMm?: number;
    screwSeatBottomZMm?: number;
    screwSeatTopZMm?: number;
  };
};

export type DirectEditDesign = {
  toothNumber: string;
  jaw?: "upper" | "lower";
  fixture: DirectEditFixture;
  localPositions: Float32Array;
  solidBodyLocalPositions?: Float32Array;
  crownLocalPositions: Float32Array;
  marginLoopLocal: Float32Array;
  stlBlob: Blob;
  params?: Partial<CustomAbutmentDesignParams>;
  metrics?: {
    occlusalClearanceMm?: number | null;
    postTaperDeg?: number;
    marginSubgMinMm?: number;
    marginSubgMaxMm?: number;
    isBridge?: boolean;
    bridgeRetainerCount?: number;
  };
};

export type AbutmentEdit = {
  heightMm: number;
  shiftLabialMm: number;
  shiftMesialMm: number;
  yawDeg: number;
  /** 커넥션을 축으로 윗면을 순측·근심으로 기울인 각도. */
  tiltLabialDeg: number;
  tiltMesialDeg: number;
  /** 순측, 근심, 삽입축. */
  scale: [number, number, number];
  partial: AbutmentPartial[];
};

export type AbutmentPartial = {
  z: number;
  angle: number;
  reach: number;
  grow: number;
};

/** 검볼로 바뀐 외형에서 다시 읽은 수치. 정보 패널은 초기 측정과의 차이만 더한다. */
export type EditedAbutmentMetrics = {
  maxDiameterMm: number;
  cuffHeightMinMm: number;
  cuffHeightMaxMm: number;
  postHeightMm: number;
  totalLengthMm: number;
  angulationDeg: number;
  postTaperDeg: number;
  cutbackMm: number | null;
  crownOverPostMm: number | null;
  occlusalClearanceMm?: number | null;
  /** 대합 스캔 프로브로 실제 3D 거리를 판정했는지 여부(대합치 범위 밖이면 occlusalClearanceMm = null). */
  hasOpposingProbe?: boolean;
};

export type AbutmentEditSummary = {
  tooth: string;
  widthRatio: number;
  heightDeltaMm: number;
  yawDeg: number;
  shiftLabialMm: number;
  shiftMesialMm: number;
  /** 손을 떼도 초기 제안과 같다. 정보 패널은 그때 수치로 되돌린다. */
  neutral: boolean;
  measured: EditedAbutmentMetrics | null;
  baselineMeasured: EditedAbutmentMetrics | null;
};

export type AbutmentPreferenceUpdate = {
  scope: "anterior" | "posterior";
  params: Partial<CustomAbutmentDesignParams>;
  note: string;
};

type MarginLine = THREE.Object3D & {
  geometry: { setPositions: (positions: Float32Array | number[]) => void };
  computeLineDistances: () => void;
};

type Zone = {
  coneZ: number;
  /** 커넥션 위 2° 테이퍼가 끝나는 높이. 이 아래는 고정. */
  fixedZ: number;
  marginZ: number;
  meanMarginZ?: number;
  /** 본체 솔리드 기준 최상단 Z. 마진·크라운 refit에서도 본체와 동일한 swing/lift 기준을 유지한다. */
  propTop?: number;
  marginColZ?: Float32Array;
  topColZ?: Float32Array;
  topMinOuterR?: number;
  boreTopR?: number;
  anterior?: boolean;
  screwR: number;
  span: number;
  labial: [number, number];
  mesial: [number, number];
  centerL?: number;
  centerM?: number;
  /** 피니시라인 루프 중심. 검볼 회전의 힌지다. */
  marginCenterL?: number;
  marginCenterM?: number;
  marginCenterZ?: number;
  /** 마진 폭을 뺀 축벽 반지름(mm). 높이·테이퍼 접착 연동에 쓴다. */
  wallRadiusMm?: number;
  /** PRC 면 반지름. 커프가 여기서 마진으로 벌어진다. */
  coneTopR?: number;
  taperLink?: {
    isBridge: boolean;
    retainerCount: number;
    baseTaperDeg: number;
  };
};

type OpposingClearanceProbe = {
  up: [number, number, number];
  u: [number, number, number];
  v: [number, number, number];
  minU: number;
  minV: number;
  step: number;
  cols: number;
  rows: number;
  grid: Float32Array;
  measureMinClearance: (positions: Float32Array, sampleVertices: Uint32Array) => number | null;
  measureSurfaceClearance: (positions: Float32Array, marginLocal: Float32Array | null) => number | null;
};

type ToothView = {
  geometry: THREE.BufferGeometry;
  proposal: Float32Array;
  proposalSolid: Float32Array | null;
  proposalCrown: Float32Array | null;
  proposalMargin: Float32Array | null;
  lastDrilledLocal: Float32Array;
  lastDrilledEdit: AbutmentEdit;
  lastAutoLiftMm: number;
  lastMarginZCorr: Float32Array | null;
  zone: Zone;
  gingivaProbe: JawGingivaMarginProbe | null;
  gingivaBaseResidual: Float32Array | null;
  oppProbe: OpposingClearanceProbe | null;
  topSampleVertices: Uint32Array;
  targetClearanceMm: number | null;
  anchor: THREE.Vector3;
  midZ: number;
  topZ: number;
  quat: THREE.Quaternion;
  axes: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  invFixture: THREE.Matrix4;
  fixture: THREE.Matrix4;
  gumball: THREE.Group;
  bakeEpoch: number;
  baselineMeasure: EditedAbutmentMetrics | null;
};

type HandleHit = {
  tooth: string;
  op: "move" | "move2" | "rot" | "scale" | "scale2" | "scale3" | "center";
  axis: number;
  axis2: number;
};

type Drag =
  | {
      kind: "move" | "scale";
      tooth: string;
      axis: number;
      axisWorld: THREE.Vector3;
      start: AbutmentEdit;
      startAlong: number;
      /** 제스처 측정 원점. 드래그 동안 고정. */
      pivotWorld: THREE.Vector3;
      pointerId: number;
    }
  | {
      kind: "rot";
      tooth: string;
      axis: number;
      start: AbutmentEdit;
      startVec: THREE.Vector3;
      worldAxis: THREE.Vector3;
      pivotWorld: THREE.Vector3;
      pointerId: number;
    }
  | {
      kind: "scale2" | "scale3";
      tooth: string;
      axis: number;
      axis2: number;
      start: AbutmentEdit;
      startRadialDir: THREE.Vector3;
      startRadialLen: number;
      pivotWorld: THREE.Vector3;
      pointerId: number;
    }
  | {
      kind: "move2";
      tooth: string;
      axis: number;
      axis2: number;
      start: AbutmentEdit;
      startHit: THREE.Vector3;
      pivotWorld: THREE.Vector3;
      pointerId: number;
    }
  | {
      kind: "center";
      tooth: string;
      pointerId: number;
      x: number;
      y: number;
      start: AbutmentEdit;
      startHit: THREE.Vector3;
      pivotWorld: THREE.Vector3;
    }
  | {
      kind: "sculpt";
      tooth: string;
      z: number;
      angle: number;
      reach: number;
      radial: [number, number];
      radius: number;
      start: AbutmentEdit;
      hitLocal: THREE.Vector3;
      pointerId: number;
    };

export type AbutmentEditBridge = {
  getScene: () => THREE.Scene | null;
  getCamera: () => THREE.OrthographicCamera | null;
  getRenderer: () => THREE.WebGLRenderer | null;
  getHost: () => HTMLElement | null;
  getDesigns: () => readonly DirectEditDesign[];
  getAbutment: (tooth: string) => THREE.Mesh | undefined;
  getCrown: (tooth: string) => THREE.Mesh | undefined;
  getMargin: (tooth: string) => MarginLine | undefined;
  getJawGeometry?: (jaw: "upper" | "lower") => THREE.BufferGeometry | null;
  getOpposingGeometry?: (jaw: "upper" | "lower") => THREE.BufferGeometry | null;
  ui: {
    gumballOn: boolean;
    sculptOn: boolean;
    radiusMm: number;
    readOnly: boolean;
    selected: string | null;
    /** 다중 선택. 마지막이 패널·검볼 기준이다. 없으면 selected 하나. */
    selectedTeeth?: readonly string[];
    visible: Record<string, boolean>;
    /** 어벗 정보에서 펼친 치아. 검볼은 여기만 보인다. 여러 개면 기준 치아만. */
    expanded: Record<string, boolean>;
  };
  onBadge: (tooth: string, additive?: boolean) => void;
  onCommit: (summary: AbutmentEditSummary) => void;
  /** 드래그 중과 확정 직후. 어벗 정보 패널만 고치고 저장은 onCommit이 한다. */
  onShape?: (summary: AbutmentEditSummary) => void;
  onHistory: () => void;
};

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane();
const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vC = new THREE.Vector3();

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function smootherstep(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export function sculptFalloff(dist: number, radius: number) {
  if (!(radius > 0) || dist >= radius) return 0;
  return smootherstep(1 - dist / radius);
}

export function identityAbutmentEdit(): AbutmentEdit {
  return {
    heightMm: 0,
    shiftLabialMm: 0,
    shiftMesialMm: 0,
    yawDeg: 0,
    tiltLabialDeg: 0,
    tiltMesialDeg: 0,
    scale: [1, 1, 1],
    partial: [],
  };
}

export function cloneAbutmentEdit(edit: AbutmentEdit): AbutmentEdit {
  return {
    heightMm: edit.heightMm,
    shiftLabialMm: edit.shiftLabialMm,
    shiftMesialMm: edit.shiftMesialMm,
    yawDeg: edit.yawDeg,
    tiltLabialDeg: edit.tiltLabialDeg,
    tiltMesialDeg: edit.tiltMesialDeg,
    scale: [edit.scale[0], edit.scale[1], edit.scale[2]],
    partial: edit.partial.map((row) => ({ ...row })),
  };
}

const LIVE_GUMBALL_EPS = 1e-3;

function hasOwnParam(
  patch: Partial<CustomAbutmentDesignParams>,
  key: keyof CustomAbutmentDesignParams,
): boolean {
  return Object.prototype.hasOwnProperty.call(patch, key);
}

/**
 * 검볼로 키운 굵기·높이는 메시에 남아 있다.
 * 대합 거리처럼 다른 항목만 다시 만들 때는 그 배율을 파라미터에 한 번 더 넣지 않는다.
 * 높이를 다시 정하는 패치(대합 거리·포스트 높이)는 높이 보정만 패치 값을 쓴다.
 */
export function retainLiveGumballParams(
  merged: Partial<CustomAbutmentDesignParams>,
  base: Partial<CustomAbutmentDesignParams> | null | undefined,
  edit: AbutmentEdit | null,
  patch: Partial<CustomAbutmentDesignParams>,
): Partial<CustomAbutmentDesignParams> {
  if (!edit || !base) return merged;
  const next = { ...merged };
  const radial =
    Math.abs(edit.scale[0] - 1) > LIVE_GUMBALL_EPS || Math.abs(edit.scale[1] - 1) > LIVE_GUMBALL_EPS;
  const vertical =
    Math.abs(edit.heightMm) > LIVE_GUMBALL_EPS || Math.abs(edit.scale[2] - 1) > LIVE_GUMBALL_EPS;
  if (radial && !hasOwnParam(patch, "postWidthScale") && base.postWidthScale != null) {
    next.postWidthScale = base.postWidthScale;
  }
  const patchSetsHeight = hasOwnParam(patch, "postHeightOffsetMm") || hasOwnParam(patch, "occlusalClearanceMm");
  if (vertical && !patchSetsHeight && base.postHeightOffsetMm != null) {
    next.postHeightOffsetMm = base.postHeightOffsetMm;
  }
  return next;
}

export function gumballPatchSetsPostHeight(patch: Partial<CustomAbutmentDesignParams>): boolean {
  return hasOwnParam(patch, "postHeightOffsetMm") || hasOwnParam(patch, "occlusalClearanceMm");
}

export function normalizeAbutmentEdit(raw: unknown): AbutmentEdit | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const rawScale = Array.isArray(r.scale) ? r.scale : [];
  const rawPartial = Array.isArray(r.partial) ? r.partial : [];
  const partial: AbutmentPartial[] = [];
  for (const item of rawPartial.slice(-24)) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const grow = num(p.grow, 0);
    if (Math.abs(grow) < 1e-4) continue;
    partial.push({
      z: num(p.z, 0),
      angle: clamp(num(p.angle, 0), -Math.PI * 2, Math.PI * 2),
      reach: clamp(num(p.reach, 1.5), 0.4, 8),
      grow: clamp(grow, SCALE_MIN - 1, SCALE_MAX - 1),
    });
  }
  const parsed: AbutmentEdit = {
    heightMm: clamp(num(r.heightMm, 0), -HEIGHT_MM, HEIGHT_MM),
    shiftLabialMm: clamp(num(r.shiftLabialMm, 0), -SHIFT_MM, SHIFT_MM),
    shiftMesialMm: clamp(num(r.shiftMesialMm, 0), -SHIFT_MM, SHIFT_MM),
    yawDeg: clamp(num(r.yawDeg, 0), -YAW_DEG, YAW_DEG),
    tiltLabialDeg: clamp(num(r.tiltLabialDeg, 0), -TILT_DEG, TILT_DEG),
    tiltMesialDeg: clamp(num(r.tiltMesialDeg, 0), -TILT_DEG, TILT_DEG),
    scale: [
      clamp(num(rawScale[0], 1), SCALE_MIN, SCALE_MAX),
      clamp(num(rawScale[1], 1), SCALE_MIN, SCALE_MAX),
      clamp(num(rawScale[2], 1), SCALE_MIN, SCALE_MAX),
    ],
    partial,
  };
  return editsEqual(parsed, identityAbutmentEdit()) ? null : parsed;
}

function editsEqual(a: AbutmentEdit, b: AbutmentEdit) {
  if (Math.abs(a.heightMm - b.heightMm) > 1e-4) return false;
  if (Math.abs(a.shiftLabialMm - b.shiftLabialMm) > 1e-4) return false;
  if (Math.abs(a.shiftMesialMm - b.shiftMesialMm) > 1e-4) return false;
  if (Math.abs(a.yawDeg - b.yawDeg) > 1e-3) return false;
  if (Math.abs(a.tiltLabialDeg - b.tiltLabialDeg) > 1e-3) return false;
  if (Math.abs(a.tiltMesialDeg - b.tiltMesialDeg) > 1e-3) return false;
  if (Math.abs(a.scale[0] - b.scale[0]) > 1e-4) return false;
  if (Math.abs(a.scale[1] - b.scale[1]) > 1e-4) return false;
  if (Math.abs(a.scale[2] - b.scale[2]) > 1e-4) return false;
  if (a.partial.length !== b.partial.length) return false;
  for (let i = 0; i < a.partial.length; i += 1) {
    const p = a.partial[i]!;
    const q = b.partial[i]!;
    if (Math.abs(p.grow - q.grow) > 1e-4 || Math.abs(p.z - q.z) > 1e-4) return false;
  }
  return true;
}

/** 검볼 값을 초기 제안에서 너무 멀어지지 않게 자른다. */
export function clampAbutmentEdit(edit: AbutmentEdit, span: number) {
  edit.shiftLabialMm = clamp(edit.shiftLabialMm, -SHIFT_MM, SHIFT_MM);
  edit.shiftMesialMm = clamp(edit.shiftMesialMm, -SHIFT_MM, SHIFT_MM);
  edit.yawDeg = clamp(edit.yawDeg, -YAW_DEG, YAW_DEG);
  const postReach = Math.max(span * 0.55, 2.5);
  const maxTiltDeg = Math.min(TILT_DEG, (Math.atan2(3.2, postReach) * 180) / Math.PI);
  edit.tiltLabialDeg = clamp(edit.tiltLabialDeg, -maxTiltDeg, maxTiltDeg);
  edit.tiltMesialDeg = clamp(edit.tiltMesialDeg, -maxTiltDeg, maxTiltDeg);
  edit.scale[0] = clamp(edit.scale[0], SCALE_MIN, SCALE_MAX);
  edit.scale[1] = clamp(edit.scale[1], SCALE_MIN, SCALE_MAX);
  edit.scale[2] = clamp(edit.scale[2], SCALE_MIN, SCALE_MAX);
  edit.heightMm = clamp(edit.heightMm, -HEIGHT_MM, HEIGHT_MM);
  edit.partial = edit.partial.slice(-24);
  return edit;
}

function blendAbove(z: number, coneZ: number, marginZ: number) {
  if (z <= coneZ) return 0;
  if (z >= marginZ) return 1;
  const t = (z - coneZ) / Math.max(marginZ - coneZ, 0.35);
  return t * t * (3 - 2 * t);
}

/**
 * 커프 구간(fixedZ..marginZ)에서 z2 역전이 절대 일어나지 않게 하강량을 배분하고,
 * 수직 스케일(scale[2])은 마진 위 포스트 길이만 선형으로 늘이거나 줄인다.
 */
function computeZLift(
  z: number,
  fixedZ: number,
  marginZ: number,
  propTop: number,
  edit: AbutmentEdit,
): number {
  const t = blendAbove(z, fixedZ, marginZ);
  const cuffSpan = Math.max(marginZ - fixedZ, 0.35);
  const cuffHeightShift = clamp(edit.heightMm, -0.42 * cuffSpan, HEIGHT_MM);
  const remHeightShift = edit.heightMm - cuffHeightShift;
  const postSpan = Math.max(propTop - marginZ, 0.8);
  const postProgress = z > marginZ ? clamp((z - marginZ) / postSpan, 0, 1) : 0;
  const totalShiftAtTop = cuffHeightShift + remHeightShift;
  const scaleTopDelta = clamp(
    postSpan * (edit.scale[2] - 1),
    -HEIGHT_MM - totalShiftAtTop,
    HEIGHT_MM - totalShiftAtTop,
  );
  const rawLift =
    cuffHeightShift * t +
    (remHeightShift + scaleTopDelta) * postProgress;
  return clamp(rawLift, -HEIGHT_MM, HEIGHT_MM);
}

function angleDelta(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function samplePolarProfile(profile: Float32Array | undefined, angle: number, fallback: number): number {
  if (!profile || profile.length < 3) return fallback;
  const { c0, c1, frac } = marginColumnBlend(angle, profile.length);
  return profile[c0]! * (1 - frac) + profile[c1]! * frac;
}

/**
 * 파란 회전 핸들(tiltLabialDeg, tiltMesialDeg)로 포스트 상단이 옆으로 기우는 안전한 최대 변위.
 * 구치부의 높은 포스트에서 과도하게 옆으로 밀리면 임플란트 축 스크류 홀이 옆벽을 뚫고 나오므로,
 * 축벽 기울기는 스크류 벽 두께 한도 안에서 매끄럽게 포화시키고 포스트 상단 교합면 각도는 요청 각도대로 회전시킨다.
 */
function computeSafePostTopLean(
  edit: AbutmentEdit,
  zone: Zone,
  safePropTop: number,
  postCenterL: number,
  postCenterM: number,
): { topLeanL: number; topLeanM: number } {
  const tiltSlopeL = Math.tan((edit.tiltLabialDeg * Math.PI) / 180);
  const tiltSlopeM = Math.tan((edit.tiltMesialDeg * Math.PI) / 180);
  const meanM = zone.meanMarginZ ?? zone.marginZ;
  const meanSpan = Math.max(safePropTop - meanM, 1.0);
  const wantL = tiltSlopeL * meanSpan;
  const wantM = tiltSlopeM * meanSpan;
  const wantR = Math.hypot(wantL, wantM);
  if (wantR <= 1e-6) return { topLeanL: 0, topLeanM: 0 };

  const boreTopR = zone.boreTopR ?? 0;
  let maxAddR = 2.4;
  if (boreTopR > 0.1 && !zone.anterior && zone.topMinOuterR != null && zone.topMinOuterR > 0.4) {
    const centerDist = Math.hypot(postCenterL, postCenterM);
    const avail = zone.topMinOuterR - (boreTopR + 0.45) - centerDist * 0.55;
    maxAddR = clamp(avail, 0.22, 1.55);
  }
  const effR = maxAddR * Math.tanh(wantR / maxAddR);
  const k = effR / wantR;
  return { topLeanL: wantL * k, topLeanM: wantM * k };
}

type SwingRotation = {
  kL: number;
  kM: number;
  kZ: number;
  sinA: number;
  cosA: number;
};

/**
 * +Z를 순측·근심으로 넘기는 최소 회전.
 * 회전축이 수평이라 포스트 축 둘레 비틀림(요)이 없다.
 */
function swingTilt(tiltLabialRad: number, tiltMesialRad: number): SwingRotation | null {
  const mag = Math.hypot(tiltLabialRad, tiltMesialRad);
  if (mag < 1e-7) return null;
  const sinP = tiltMesialRad / mag;
  const cosP = tiltLabialRad / mag;
  return {
    kL: -sinP,
    kM: cosP,
    kZ: 0,
    sinA: Math.sin(mag),
    cosA: Math.cos(mag),
  };
}

function applySwing(
  l: number,
  m: number,
  z: number,
  pivotL: number,
  pivotM: number,
  pivotZ: number,
  swing: SwingRotation,
): { l: number; m: number; z: number } {
  const x = l - pivotL;
  const y = m - pivotM;
  const zz = z - pivotZ;
  const cx = swing.kM * zz - swing.kZ * y;
  const cy = swing.kZ * x - swing.kL * zz;
  const cz = swing.kL * y - swing.kM * x;
  const dot = swing.kL * x + swing.kM * y + swing.kZ * zz;
  const oneC = 1 - swing.cosA;
  return {
    l: pivotL + x * swing.cosA + cx * swing.sinA + swing.kL * dot * oneC,
    m: pivotM + y * swing.cosA + cy * swing.sinA + swing.kM * dot * oneC,
    z: pivotZ + zz * swing.cosA + cz * swing.sinA + swing.kZ * dot * oneC,
  };
}

/**
 * 초기 제안 정점에서 커넥션과 2° 테이퍼는 복사하고, 그 위 커프·포스트만 다시 놓는다.
 * 파란 회전 툴은 피니시라인 중앙을 힌지로 포스트를 강체 회전시킨다. 단면이 높이마다 다르게 밀리지 않아 표면이 꼬이지 않는다.
 * extraPostTopLiftMm로 포스트 상단 높이를 보정해 최단 대합 거리를 유지한다.
 * 드래그 중에는 솔리드 외형(screwR=0)에 곧바로 적용하고, 드래그 종료 시 임플란트 축 원통으로 스크류 홀을 뚫는다.
 */
export function refitLocalPositions(
  proposal: Float32Array,
  edit: AbutmentEdit,
  zone: Zone,
  out: Float32Array,
  extraPostTopLiftMm = 0,
  marginZCorrCol?: Float32Array | null,
): { widthRatio: number; heightDeltaMm: number } {
  const { fixedZ, marginZ, screwR, labial, mesial } = zone;
  const yawRad = (edit.yawDeg * Math.PI) / 180;
  const hole = screwR > 0.15;
  const minWallR = Math.max(screwR + 0.14, (zone.boreTopR ?? Math.max(0, screwR - 0.2)) + 0.34);
  let widthSum = 0;
  let widthN = 0;
  let propTop = -Infinity;
  let boreTop = -Infinity;
  for (let i = 0; i < proposal.length; i += 3) {
    const z = proposal[i + 2]!;
    if (z > propTop) propTop = z;
    if (!hole) continue;
    const r = Math.hypot(proposal[i]!, proposal[i + 1]!);
    if (r <= screwR && z > boreTop) boreTop = z;
  }
  const safePropTop =
    zone.propTop != null && Number.isFinite(zone.propTop)
      ? zone.propTop
      : Number.isFinite(propTop)
        ? propTop
        : marginZ + 4;
  let postCenterL = zone.centerL ?? Number.NaN;
  let postCenterM = zone.centerM ?? Number.NaN;
  if (!Number.isFinite(postCenterL) || !Number.isFinite(postCenterM)) {
    postCenterL = 0;
    postCenterM = 0;
    let postCenterN = 0;
    for (let i = 0; i < proposal.length; i += 3) {
      const z = proposal[i + 2]!;
      if (z <= marginZ) continue;
      const x = proposal[i]!;
      const y = proposal[i + 1]!;
      if (hole && Math.hypot(x, y) <= screwR + 0.12) continue;
      postCenterL += x * labial[0] + y * labial[1];
      postCenterM += x * mesial[0] + y * mesial[1];
      postCenterN += 1;
    }
    if (postCenterN > 0) {
      postCenterL /= postCenterN;
      postCenterM /= postCenterN;
    }
  }
  const hasTilt = Math.abs(edit.tiltLabialDeg) > 1e-4 || Math.abs(edit.tiltMesialDeg) > 1e-4;
  const hasTopAdjust = hasTilt || Math.abs(extraPostTopLiftMm) > 1e-5;
  const { topLeanL, topLeanM } = hasTilt
    ? computeSafePostTopLean(edit, zone, safePropTop, postCenterL, postCenterM)
    : { topLeanL: 0, topLeanM: 0 };
  const basePivotL = zone.marginCenterL ?? postCenterL;
  const basePivotM = zone.marginCenterM ?? postCenterM;
  const basePivotZ = zone.marginCenterZ ?? zone.meanMarginZ ?? marginZ;
  const postSpanPivot = Math.max(safePropTop - basePivotZ, 0.8);
  const swing = hasTilt
    ? swingTilt(Math.atan2(topLeanL, postSpanPivot), Math.atan2(topLeanM, postSpanPivot))
    : null;
  const yawCos = Math.cos(yawRad);
  const yawSin = Math.sin(yawRad);
  const pivotDl = (basePivotL - postCenterL) * (1 + (edit.scale[0] - 1));
  const pivotDm = (basePivotM - postCenterM) * (1 + (edit.scale[1] - 1));
  const pivotL = postCenterL + (pivotDl * yawCos - pivotDm * yawSin) + edit.shiftLabialMm;
  const pivotM = postCenterM + (pivotDl * yawSin + pivotDm * yawCos) + edit.shiftMesialMm;
  const pivotZ = basePivotZ + computeZLift(basePivotZ, fixedZ, marginZ, safePropTop, edit);
  const manualTopLift = computeZLift(safePropTop, fixedZ, marginZ, safePropTop, edit);
  const marginLiftRef = computeZLift(zone.meanMarginZ ?? marginZ, fixedZ, marginZ, safePropTop, edit);
  const postHeightLift = manualTopLift - marginLiftRef;
  const basePostHeight = Math.max(2.2, safePropTop - (zone.meanMarginZ ?? marginZ));
  const nextLinkedPostHeight = Math.max(2.2, basePostHeight + postHeightLift);
  const taperLinkSlopeOld = zone.taperLink
    ? Math.tan((zone.taperLink.baseTaperDeg * Math.PI) / 180)
    : 0;
  const taperLinkSlopeNew = zone.taperLink
    ? Math.tan(
        (computeOptimalPostTaperDeg(nextLinkedPostHeight, zone.taperLink, postRetentionSurface(zone.wallRadiusMm)) *
          Math.PI) /
          180,
      )
    : 0;
  const hasTaperLinkAdjust = Boolean(zone.taperLink && Math.abs(postHeightLift) > 0.02);
  const rimZ = (Number.isFinite(boreTop) ? boreTop : safePropTop) - 0.7;

  for (let i = 0; i < proposal.length; i += 3) {
    const x = proposal[i]!;
    const y = proposal[i + 1]!;
    const z = proposal[i + 2]!;
    const rProp = Math.hypot(x, y);
    const t = blendAbove(z, fixedZ, marginZ);
    const baseZLift = computeZLift(z, fixedZ, marginZ, safePropTop, edit);
    const frozenTaper = z <= fixedZ + 0.02;
    const deepBore = hole && rProp <= screwR && z < rimZ;
    if (frozenTaper || deepBore) {
      out[i] = x;
      out[i + 1] = y;
      out[i + 2] = z;
      continue;
    }
    const theta0 = Math.atan2(y, x);
    const mZCol = samplePolarProfile(zone.marginColZ, theta0, marginZ);
    const topZCol = Math.max(mZCol + 0.8, samplePolarProfile(zone.topColZ, theta0, safePropTop));
    const postSpanCol = Math.max(topZCol - mZCol, 0.8);
    const hAboveMargin = z > mZCol + 1e-4 ? z - mZCol : 0;
    const uPost = hAboveMargin > 0 ? clamp(hAboveMargin / postSpanCol, 0, 1) : 0;

    if (hole && rProp <= screwR + 0.22 && z >= rimZ) {
      let zRim = z + baseZLift;
      if (swing) {
        zRim = applySwing(0, 0, zRim, pivotL, pivotM, pivotZ, swing).z;
      }
      if (Math.abs(extraPostTopLiftMm) > 1e-5 && uPost > 0) zRim += extraPostTopLiftMm * uPost;
      out[i] = x;
      out[i + 1] = y;
      out[i + 2] = zRim;
      continue;
    }

    const l = x * labial[0] + y * labial[1];
    const m = x * mesial[0] + y * mesial[1];
    const yaw = yawRad * t;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    // 포스트 중심(postCenterL, postCenterM) 기준 스케일·회전을 적용하고, 마진·포스트 전체에 동일 배율이 걸려 마진 폭 비율을 유지한다.
    const dl = (l - postCenterL * t) * (1 + (edit.scale[0] - 1) * t);
    const dm = (m - postCenterM * t) * (1 + (edit.scale[1] - 1) * t);
    const lRot = dl * c - dm * s;
    const mRot = dl * s + dm * c;

    const offL = edit.shiftLabialMm * t;
    const offM = edit.shiftMesialMm * t;
    const mColCorr =
      !swing && marginZCorrCol && marginZCorrCol.length >= 3 && z >= mZCol - 0.025
        ? samplePolarProfile(marginZCorrCol, theta0, 0)
        : 0;
    const uH = clamp((z + baseZLift - basePivotZ) / postSpanPivot, 0, 1);
    const z2 = z + baseZLift + (hasTopAdjust ? extraPostTopLiftMm * uH : 0) + mColCorr * (1 - uPost);
    let adjLRot = lRot;
    let adjMRot = mRot;
    if (hasTaperLinkAdjust && hAboveMargin > 0.22 && (!hole || rProp > screwR + 0.12)) {
      const mColLift = computeZLift(mZCol, fixedZ, marginZ, safePropTop, edit);
      const newHAbove = Math.max(0, z2 - (mZCol + mColLift + mColCorr));
      const ramp = clamp((hAboveMargin - 0.22) / 0.28, 0, 1);
      const extraInward = (taperLinkSlopeNew * newHAbove - taperLinkSlopeOld * hAboveMargin) * ramp;
      const rRot = Math.hypot(adjLRot, adjMRot);
      if (rRot > 0.25) {
        const minSafeR = Math.max(0.65, (zone.boreTopR ?? screwR) + 0.36);
        const nextR = clamp(rRot - extraInward, Math.min(rRot, minSafeR), rRot + 0.65);
        const k = nextR / rRot;
        adjLRot *= k;
        adjMRot *= k;
      }
    }
    let ly = postCenterL * t + adjLRot + offL;
    let my = postCenterM * t + adjMRot + offM;

    if (z > marginZ && edit.partial.length > 0) {
      const ang = Math.atan2(my, ly);
      const rad = Math.max(Math.hypot(ly, my), 0.4);
      let extra = 1;
      for (const stamp of edit.partial) {
        const arc = Math.abs(angleDelta(ang, stamp.angle)) * rad;
        const dist = Math.hypot(z2 - stamp.z, arc);
        extra += stamp.grow * sculptFalloff(dist, stamp.reach);
      }
      const rNow = Math.hypot(ly, my);
      if (rNow > 1e-6 && rProp > screwR) {
        const target = clamp(rNow * extra, rProp * SCALE_MIN, rProp * SCALE_MAX);
        const k = target / rNow;
        ly *= k;
        my *= k;
      }
    }
    if (hole && rProp > screwR) {
      const rNow = Math.hypot(ly, my);
      if (rNow < minWallR && rNow > 1e-6) {
        const k = minWallR / rNow;
        ly *= k;
        my *= k;
      }
    }
    const preSwingL = ly;
    const preSwingM = my;
    let zOut = z2;
    if (swing && z > fixedZ + 0.02) {
      const swung = applySwing(ly, my, z2, pivotL, pivotM, pivotZ, swing);
      ly = swung.l;
      my = swung.m;
      zOut = swung.z;
    }
    out[i] = ly * labial[0] + my * mesial[0];
    out[i + 1] = ly * labial[1] + my * mesial[1];
    out[i + 2] = zOut;
    if (z > marginZ && rProp > screwR) {
      const rOrigFromCenter = Math.hypot(l - postCenterL, m - postCenterM);
      const rNowFromCenter = Math.hypot(preSwingL - (postCenterL + offL), preSwingM - (postCenterM + offM));
      if (rOrigFromCenter > 0.25) {
        widthSum += rNowFromCenter / rOrigFromCenter;
        widthN += 1;
      }
    }
  }
  return {
    widthRatio: widthN > 0 ? widthSum / widthN : 1,
    heightDeltaMm: Number.isFinite(propTop) ? clamp(manualTopLift, -HEIGHT_MM, HEIGHT_MM) : 0,
  };
}

function cuffNeedsRegen(edit: AbutmentEdit) {
  if (Math.abs(edit.heightMm) > 1e-4) return true;
  if (Math.abs(edit.shiftLabialMm) > 1e-4 || Math.abs(edit.shiftMesialMm) > 1e-4) return true;
  if (Math.abs(edit.tiltLabialDeg) > 1e-3 || Math.abs(edit.tiltMesialDeg) > 1e-3) return true;
  if (Math.abs(edit.yawDeg) > 1e-3) return true;
  if (Math.abs(edit.scale[0] - 1) > 1e-4) return true;
  if (Math.abs(edit.scale[1] - 1) > 1e-4) return true;
  if (Math.abs(edit.scale[2] - 1) > 1e-4) return true;
  return false;
}

function measureConeTopR(src: Float32Array, coneZ: number) {
  let best = 0;
  for (let i = 0; i < src.length; i += 3) {
    if (Math.abs(src[i + 2]! - coneZ) > 0.08) continue;
    best = Math.max(best, Math.hypot(src[i]!, src[i + 1]!));
  }
  if (!(best > 0.2)) return 1.6;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < src.length; i += 3) {
    if (Math.abs(src[i + 2]! - coneZ) > 0.08) continue;
    const r = Math.hypot(src[i]!, src[i + 1]!);
    if (r < best - 0.12) continue;
    sum += r;
    n += 1;
  }
  return n > 0 ? sum / n : best;
}

function marginColumnBlend(angle: number, count: number): { c0: number; c1: number; frac: number } {
  const tau = Math.PI * 2;
  const wrapped = ((angle % tau) + tau) % tau;
  const f = (wrapped / tau) * count;
  const i0 = Math.floor(f);
  const frac = f - i0;
  const c0 = ((i0 % count) + count) % count;
  const c1 = (c0 + 1) % count;
  return { c0, c1, frac };
}

const cuffMaskCache = new WeakMap<Float32Array, Map<string, Uint8Array | null>>();

/**
 * 삼각형 수프에서 콘 상단(coneZ)과 피니시라인 루프(proposalMargin) 사이의 실제 커프 정점만
 * 토폴로지 BFS로 정확히 분리한다.
 * - 마진 루프 정점을 닫힌 장벽(barrier)으로 두어, 기울어진 포스트의 챔퍼 정점이 마진보다 낮은 Z에 있더라도
 *   커프로 오인해 덮어쓰지 않고, 반대로 커프 스캘럽 정점이 반경 오차로 누락되지도 않는다.
 */
function getCuffVertexMask(
  proposal: Float32Array,
  proposalMargin: Float32Array,
  coneZ: number,
  screwR: number,
): Uint8Array | null {
  const key = `${Math.round(coneZ * 1000)}:${Math.round(screwR * 1000)}:${proposalMargin.length}`;
  let byKey = cuffMaskCache.get(proposal);
  if (byKey?.has(key)) return byKey.get(key) ?? null;

  const vCount = Math.floor(proposal.length / 3);
  const mCount = Math.floor(proposalMargin.length / 3);
  if (vCount < 9 || vCount % 3 !== 0 || mCount < 3) {
    if (!byKey) {
      byKey = new Map();
      cuffMaskCache.set(proposal, byKey);
    }
    byKey.set(key, null);
    return null;
  }

  const keyToUid = new Map<string, number>();
  const vertUid = new Int32Array(vCount);
  const ux: number[] = [];
  const uy: number[] = [];
  const uz: number[] = [];
  const ur: number[] = [];
  for (let v = 0; v < vCount; v += 1) {
    const x = proposal[v * 3]!;
    const y = proposal[v * 3 + 1]!;
    const z = proposal[v * 3 + 2]!;
    const k = `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
    let uid = keyToUid.get(k);
    if (uid === undefined) {
      uid = ux.length;
      keyToUid.set(k, uid);
      ux.push(x);
      uy.push(y);
      uz.push(z);
      ur.push(Math.hypot(x, y));
    }
    vertUid[v] = uid;
  }
  const uCount = ux.length;
  const isBarrier = new Uint8Array(uCount);
  let maxMarginZ = -Infinity;
  let matchedMargin = 0;
  for (let col = 0; col < mCount; col += 1) {
    const mx = proposalMargin[col * 3]!;
    const my = proposalMargin[col * 3 + 1]!;
    const mz = proposalMargin[col * 3 + 2]!;
    if (mz > maxMarginZ) maxMarginZ = mz;
    const exactKey = `${Math.round(mx * 1000)},${Math.round(my * 1000)},${Math.round(mz * 1000)}`;
    const exactUid = keyToUid.get(exactKey);
    if (exactUid !== undefined) {
      isBarrier[exactUid] = 1;
      matchedMargin += 1;
      continue;
    }
    let bestUid = -1;
    let bestD2 = 0.045 * 0.045;
    for (let u = 0; u < uCount; u += 1) {
      if (Math.abs(uz[u]! - mz) > 0.045) continue;
      const dx = ux[u]! - mx;
      const dy = uy[u]! - my;
      const dz = uz[u]! - mz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestUid = u;
      }
    }
    if (bestUid >= 0) {
      isBarrier[bestUid] = 1;
      matchedMargin += 1;
    }
  }

  let result: Uint8Array | null = null;
  if (matchedMargin >= Math.max(3, Math.floor(mCount * 0.75))) {
    const adj: number[][] = Array.from({ length: uCount }, () => []);
    for (let t = 0; t < vCount; t += 3) {
      const a = vertUid[t]!;
      const b = vertUid[t + 1]!;
      const c = vertUid[t + 2]!;
      if (a !== b) {
        adj[a]!.push(b);
        adj[b]!.push(a);
      }
      if (b !== c) {
        adj[b]!.push(c);
        adj[c]!.push(b);
      }
      if (c !== a) {
        adj[c]!.push(a);
        adj[a]!.push(c);
      }
    }

    const isCuffUid = new Uint8Array(uCount);
    const queue: number[] = [];
    const allowCuff = (u: number) =>
      uz[u]! > coneZ + 1e-3 &&
      !isBarrier[u] &&
      (screwR <= 0.15 || ur[u]! > screwR + 0.22);

    for (let u = 0; u < uCount; u += 1) {
      if (!allowCuff(u)) continue;
      const nbs = adj[u]!;
      for (let j = 0; j < nbs.length; j += 1) {
        if (uz[nbs[j]!]! <= coneZ + 1e-3) {
          isCuffUid[u] = 1;
          queue.push(u);
          break;
        }
      }
    }

    let head = 0;
    let maxCuffZ = -Infinity;
    while (head < queue.length) {
      const cur = queue[head++]!;
      if (uz[cur]! > maxCuffZ) maxCuffZ = uz[cur]!;
      const nbs = adj[cur]!;
      for (let j = 0; j < nbs.length; j += 1) {
        const nb = nbs[j]!;
        if (isCuffUid[nb] || !allowCuff(nb)) continue;
        isCuffUid[nb] = 1;
        queue.push(nb);
      }
    }

    if (queue.length > 0 && maxCuffZ <= maxMarginZ + 0.08) {
      const mask = new Uint8Array(vCount);
      for (let v = 0; v < vCount; v += 1) {
        if (isCuffUid[vertUid[v]!]) mask[v] = 1;
      }
      result = mask;
    }
  }

  if (!byKey) {
    byKey = new Map();
    cuffMaskCache.set(proposal, byKey);
  }
  byKey.set(key, result);
  return result;
}

/**
 * 콘 위 커프 정점을 지금 마진 열에 맞춰 다시 놓는다.
 * 2°로 시작해 오목하게 벌어지고, 끝점은 그 방향의 마진 점과 만난다. 마진 위 포스트는 그대로 둔다.
 * 경사진 포스트(삽입축 > 0°)는 마진이 낮은 방향을 넘어 인접 열로 기울면서 로컬 z가 그 열의 마진 높이보다 낮아질 수 있으므로,
 * 토폴로지 커프 마스크로 마진 링 아래 실제 커프 정점만 빠짐없이 재생성하고 포스트·챔퍼 정점은 절대 건드리지 않는다.
 */
export function regenerateCuffToMargin(
  proposal: Float32Array,
  fitted: Float32Array,
  proposalMargin: Float32Array,
  fittedMargin: Float32Array,
  zone: Zone,
) {
  const count = Math.floor(proposalMargin.length / 3);
  if (count < 3 || fittedMargin.length < count * 3 || proposal.length !== fitted.length) return;
  const coneZ = zone.coneZ;
  const coneTopR = zone.coneTopR && zone.coneTopR > 0.2 ? zone.coneTopR : measureConeTopR(proposal, coneZ);
  const screwR = zone.screwR;
  const origZ = new Float32Array(count);
  const origR = new Float32Array(count);
  const endZ = new Float32Array(count);
  const endAng = new Float32Array(count);
  const origMarginXY: Array<[number, number]> = [];
  const fittedMarginXY: Array<[number, number]> = [];
  let origSpan = 0.45;
  let origDelta = 0.35;
  let fitSpan = 0.45;
  let fitDelta = 0.35;
  for (let col = 0; col < count; col += 1) {
    const i = col * 3;
    const ox = proposalMargin[i]!;
    const oy = proposalMargin[i + 1]!;
    origZ[col] = proposalMargin[i + 2]!;
    origR[col] = Math.hypot(ox, oy);
    origMarginXY.push([ox, oy]);
    if (origR[col]! - coneTopR > origDelta) {
      origDelta = origR[col]! - coneTopR;
      origSpan = Math.max(0.35, origZ[col]! - coneZ);
    }
    const x = fittedMargin[i]!;
    const y = fittedMargin[i + 1]!;
    endZ[col] = fittedMargin[i + 2]!;
    endAng[col] = Math.atan2(y, x);
    fittedMarginXY.push([x, y]);
    const fitR = Math.hypot(x, y);
    if (fitR - coneTopR > fitDelta) {
      fitDelta = fitR - coneTopR;
      fitSpan = Math.max(0.35, endZ[col]! - coneZ);
    }
  }
  const origShared = cuffProfile(0, 0, origDelta, origSpan);
  const evalOrigMink = buildMinkowskiCuffRadiusEvaluator(coneTopR, origMarginXY);
  const origLegacyProfiles = Array.from({ length: count }, (_, col) =>
    cuffProfile(coneTopR, coneZ, origR[col]!, origZ[col]!),
  );

  const fitShared = cuffProfile(0, 0, fitDelta, fitSpan);
  const evalFitMink = buildMinkowskiCuffRadiusEvaluator(coneTopR, fittedMarginXY);
  const cuffMask = getCuffVertexMask(proposal, proposalMargin, coneZ, screwR);

  for (let i = 0; i < proposal.length; i += 3) {
    const vIdx = i / 3;
    const ox = proposal[i]!;
    const oy = proposal[i + 1]!;
    const oz = proposal[i + 2]!;
    if (cuffMask) {
      if (!cuffMask[vIdx]) continue;
    } else {
      if (oz <= coneZ + 1e-3) continue;
      const orad = Math.hypot(ox, oy);
      if (screwR > 0.15 && orad <= screwR + 0.22) continue;
    }
    const theta0 = Math.atan2(oy, ox);
    const { c0, c1, frac } = marginColumnBlend(theta0, count);
    const marginZ = origZ[c0]! * (1 - frac) + origZ[c1]! * frac;
    if (!(marginZ > coneZ + 0.05)) continue;
    const u = clamp((oz - coneZ) / (marginZ - coneZ), 0, 1);
    if (!cuffMask) {
      if (oz >= marginZ - 1e-3) continue;
      const orad = Math.hypot(ox, oy);
      const origAlpha = clamp(origShared(u * origSpan) / origDelta, 0, 1);
      const origMinkR = evalOrigMink(theta0, origAlpha);
      const origLegacyR =
        origLegacyProfiles[c0]!(coneZ + u * (origZ[c0]! - coneZ)) * (1 - frac) +
        origLegacyProfiles[c1]!(coneZ + u * (origZ[c1]! - coneZ)) * frac;
      const origChordR =
        coneTopR +
        ((origR[c0]! * (1 - frac) + origR[c1]! * frac - coneTopR) * (oz - coneZ)) /
          Math.max(0.05, marginZ - coneZ);
      if (
        orad > Math.max(origChordR, origMinkR) + 0.04 ||
        Math.min(Math.abs(orad - origMinkR), Math.abs(orad - origLegacyR)) > 0.08
      ) {
        continue;
      }
    }
    const zEnd0 = coneZ + u * (endZ[c0]! - coneZ);
    const zEnd1 = coneZ + u * (endZ[c1]! - coneZ);
    const z2 = zEnd0 * (1 - frac) + zEnd1 * frac;
    const targetAng = endAng[c0]! + angleDelta(endAng[c1]!, endAng[c0]!) * frac;
    const blendU = smootherstep(u);
    const theta = theta0 + angleDelta(targetAng, theta0) * blendU;
    const fitAlpha = clamp(fitShared(u * fitSpan) / fitDelta, 0, 1);
    const endX = fittedMargin[c0 * 3]! * (1 - frac) + fittedMargin[c1 * 3]! * frac;
    const endY = fittedMargin[c0 * 3 + 1]! * (1 - frac) + fittedMargin[c1 * 3 + 1]! * frac;
    const endR = Math.hypot(endX, endY);
    const rMink = evalFitMink(theta, fitAlpha);
    const rMinkEnd = evalFitMink(targetAng, 1);
    const r = Math.max(coneTopR, rMink + (endR - rMinkEnd) * blendU);
    fitted[i] = r * Math.cos(theta);
    fitted[i + 1] = r * Math.sin(theta);
    fitted[i + 2] = z2;
  }
}

/** 솔리드 외형과 마진 루프에서 정보 패널에 올릴 수치를 읽는다. */
export function measureEditedAbutment(
  solid: Float32Array,
  margin: Float32Array,
  crown: Float32Array | null,
): EditedAbutmentMetrics | null {
  const count = Math.floor(margin.length / 3);
  if (count < 3 || solid.length < 9) return null;
  let minMz = Infinity;
  let maxMz = -Infinity;
  let meanMz = 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < count * 3; i += 3) {
    const z = margin[i + 2]!;
    if (z < minMz) minMz = z;
    if (z > maxMz) maxMz = z;
    meanMz += z;
    mx += margin[i]!;
    my += margin[i + 1]!;
  }
  meanMz /= count;
  mx /= count;
  my /= count;

  let zMin = Infinity;
  let zMax = -Infinity;
  let maxR = 0;
  for (let i = 0; i < solid.length; i += 3) {
    const z = solid[i + 2]!;
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
    maxR = Math.max(maxR, Math.hypot(solid[i]!, solid[i + 1]!));
  }
  if (!Number.isFinite(zMax) || !Number.isFinite(zMin)) return null;

  const postSpan = Math.max(zMax - meanMz, 0.8);
  const half = Math.max(0.15, postSpan * 0.08);
  const bandSlice = (z0: number) => {
    let cx = 0;
    let cy = 0;
    let cn = 0;
    for (let i = 0; i < solid.length; i += 3) {
      if (Math.abs(solid[i + 2]! - z0) > half) continue;
      const x = solid[i]!;
      const y = solid[i + 1]!;
      if (Math.hypot(x, y) < 0.6) continue;
      cx += x;
      cy += y;
      cn += 1;
    }
    const refX = cn >= 8 ? cx / cn : mx;
    const refY = cn >= 8 ? cy / cn : my;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < solid.length; i += 3) {
      if (Math.abs(solid[i + 2]! - z0) > half) continue;
      const x = solid[i]!;
      const y = solid[i + 1]!;
      if (Math.hypot(x, y) < 0.6) continue;
      const r = cn >= 8 ? Math.hypot(x - refX, y - refY) : Math.hypot(x, y);
      sum += r;
      n += 1;
    }
    return { r: n > 0 ? sum / n : Number.NaN, cx: refX, cy: refY, n };
  };

  const upperBandZ = meanMz + postSpan * 0.62;
  const upperSlice = bandSlice(upperBandZ);
  let topX = 0;
  let topY = 0;
  let topZ = 0;
  if (upperSlice.n >= 8) {
    topX = upperSlice.cx;
    topY = upperSlice.cy;
    topZ = upperBandZ;
  } else {
    let topN = 0;
    const topCut = zMax - Math.min(0.45, postSpan * 0.12);
    for (let i = 0; i < solid.length; i += 3) {
      const z = solid[i + 2]!;
      if (z < topCut) continue;
      if (Math.hypot(solid[i]!, solid[i + 1]!) < 0.35) continue;
      topX += solid[i]!;
      topY += solid[i + 1]!;
      topZ += z;
      topN += 1;
    }
    if (topN > 0) {
      topX /= topN;
      topY /= topN;
      topZ /= topN;
    } else {
      topZ = zMax;
    }
  }
  const ang =
    (Math.atan2(Math.hypot(topX - mx, topY - my), Math.max(topZ - meanMz, 0.2)) * 180) / Math.PI;

  const rLow = bandSlice(meanMz + postSpan * 0.22).r;
  const rHigh = bandSlice(meanMz + postSpan * 0.58).r;
  const taper =
    Number.isFinite(rLow) && Number.isFinite(rHigh)
      ? (Math.atan2(rLow - rHigh, postSpan * 0.36) * 180) / Math.PI
      : 0;

  let crownOver: number | null = null;
  let cutback: number | null = null;
  if (crown && crown.length >= 9) {
    let crownTop = -Infinity;
    for (let i = 2; i < crown.length; i += 3) crownTop = Math.max(crownTop, crown[i]!);
    if (Number.isFinite(crownTop)) crownOver = crownTop - zMax;
    const zMid = meanMz + postSpan * 0.45;
    let postSum = 0;
    let postN = 0;
    let crownSum = 0;
    let crownN = 0;
    const collect = (src: Float32Array, kind: "post" | "crown") => {
      for (let i = 0; i < src.length; i += 3) {
        if (Math.abs(src[i + 2]! - zMid) > half) continue;
        const r = Math.hypot(src[i]!, src[i + 1]!);
        if (r < 0.6) continue;
        if (kind === "post") {
          postSum += r;
          postN += 1;
        } else {
          crownSum += r;
          crownN += 1;
        }
      }
    };
    collect(solid, "post");
    collect(crown, "crown");
    if (postN > 0 && crownN > 0) cutback = crownSum / crownN - postSum / postN;
  }

  return {
    maxDiameterMm: maxR * 2,
    cuffHeightMinMm: minMz,
    cuffHeightMaxMm: maxMz,
    postHeightMm: zMax - meanMz,
    totalLengthMm: zMax - zMin,
    angulationDeg: ang,
    postTaperDeg: taper,
    cutbackMm: cutback,
    crownOverPostMm: crownOver,
  };
}

export function buildAbutmentPreferenceUpdate(args: {
  tooth: string;
  baseWidth: number;
  baseHeight: number;
  widthRatio: number;
  heightDeltaMm: number;
}): AbutmentPreferenceUpdate | null {
  const widthSpec = CUSTOM_ABUTMENT_PARAM_SPECS.postWidthScale;
  const heightSpec = CUSTOM_ABUTMENT_PARAM_SPECS.postHeightOffsetMm;
  const width = clamp(args.baseWidth * args.widthRatio, widthSpec.min, widthSpec.max);
  const height = clamp(args.baseHeight + args.heightDeltaMm, heightSpec.min, heightSpec.max);
  const params: Partial<CustomAbutmentDesignParams> = {};
  const notes: string[] = [];
  if (Math.abs(width - args.baseWidth) >= 0.01) {
    params.postWidthScale = Math.round(width * 100) / 100;
    notes.push(`포스트 굵기 ${round1(args.baseWidth)}→${round1(width)}`);
  }
  if (Math.abs(height - args.baseHeight) >= 0.05) {
    params.postHeightOffsetMm = Math.round(height * 100) / 100;
    notes.push(`포스트 높이 ${round1(args.baseHeight)}→${round1(height)}`);
  }
  if (notes.length === 0) return null;
  return {
    scope: isAnteriorTooth(args.tooth) ? "anterior" : "posterior",
    params,
    note: `#${args.tooth} ${notes.join(" · ")}`,
  };
}

function round1(v: number) {
  return Math.round(v * 100) / 100;
}

function fixtureMatrix(pose: DirectEditFixture["fixturePose"]) {
  const [xx, xy, xz] = pose.hexX;
  const [yx, yy, yz] = pose.hexY;
  const [zx, zy, zz] = pose.axis;
  const [tx, ty, tz] = pose.origin;
  return new THREE.Matrix4().set(
    xx!,
    yx!,
    zx!,
    tx!,
    xy!,
    yy!,
    zy!,
    ty!,
    xz!,
    yz!,
    zz!,
    tz!,
    0,
    0,
    0,
    1,
  );
}

function localAxes(fixture: DirectEditFixture): { labial: [number, number]; mesial: [number, number] } {
  const pose = fixture.fixturePose;
  const toLocal = (dir: readonly number[]) => {
    const x = dir[0] ?? 0;
    const y = dir[1] ?? 0;
    const z = dir[2] ?? 0;
    return [
      x * (pose.hexX[0] ?? 0) + y * (pose.hexX[1] ?? 0) + z * (pose.hexX[2] ?? 0),
      x * (pose.hexY[0] ?? 0) + y * (pose.hexY[1] ?? 0) + z * (pose.hexY[2] ?? 0),
    ];
  };
  const lab = toLocal(fixture.labialDir);
  let lx = lab[0] ?? 1;
  let ly = lab[1] ?? 0;
  const len = Math.hypot(lx, ly);
  if (len < 1e-6) {
    lx = 1;
    ly = 0;
  } else {
    lx /= len;
    ly /= len;
  }
  let mx = -ly;
  let my = lx;
  const mes = toLocal(fixture.mesialDir);
  if (mx * (mes[0] ?? 0) + my * (mes[1] ?? 0) < 0) {
    mx = -mx;
    my = -my;
  }
  return { labial: [lx, ly], mesial: [mx, my] };
}

const TOP_SECTORS = 72;

function taperLinkOfDesign(design: DirectEditDesign): Zone["taperLink"] {
  if ((design.params?.postTaperLink ?? 1) < 0.5) return undefined;
  const isBridge = Boolean(design.metrics?.isBridge);
  return {
    isBridge,
    retainerCount: design.metrics?.bridgeRetainerCount ?? (isBridge ? 2 : 1),
    baseTaperDeg: design.metrics?.postTaperDeg ?? design.params?.postTaperDeg ?? RETENTION_SINGLE_REF_TAPER_DEG,
  };
}

function zoneOf(
  design: DirectEditDesign,
  proposal: Float32Array,
  proposalSolid: Float32Array | null,
  margin: Float32Array | null,
): Zone {
  const axes = localAxes(design.fixture);
  const coneZ = design.fixture.connectionSpec?.prcConeTopMm ?? 1;
  const boreTopR =
    design.fixture.connectionSpec?.screwUpperDiameterMm != null
      ? design.fixture.connectionSpec.screwUpperDiameterMm / 2
      : 0;
  const screwR = (design.fixture.connectionSpec?.screwUpperDiameterMm ?? 2) / 2 + 0.2;
  let marginMin = Infinity;
  let marginMean = 0;
  let marginCenterL = 0;
  let marginCenterM = 0;
  let marginCenterZ = 0;
  let marginRadiusSum = 0;
  let marginColZ: Float32Array | undefined;
  if (margin && margin.length >= 9) {
    const mCount = Math.floor(margin.length / 3);
    marginColZ = new Float32Array(mCount);
    for (let col = 0; col < mCount; col += 1) {
      const x = margin[col * 3]!;
      const y = margin[col * 3 + 1]!;
      const z = margin[col * 3 + 2]!;
      marginColZ[col] = z;
      if (z < marginMin) marginMin = z;
      marginMean += z;
      marginCenterL += x * axes.labial[0] + y * axes.labial[1];
      marginCenterM += x * axes.mesial[0] + y * axes.mesial[1];
      marginCenterZ += z;
      marginRadiusSum += Math.hypot(x, y);
    }
    marginMean /= mCount;
    marginCenterL /= mCount;
    marginCenterM /= mCount;
    marginCenterZ /= mCount;
    marginRadiusSum /= mCount;
  }
  const src = proposalSolid && proposalSolid.length >= 9 ? proposalSolid : proposal;
  let top = coneZ + 4;
  for (let i = 2; i < src.length; i += 3) top = Math.max(top, src[i]!);
  const marginZ = Math.max(Number.isFinite(marginMin) ? marginMin : coneZ + 1.5, coneZ + 0.4);
  const meanMarginZ = marginColZ ? Math.max(marginMean, marginZ) : marginZ;
  const spanToMargin = Math.max(0.35, marginZ - coneZ);
  let fixedZ = coneZ + Math.max(0.45, Math.min(1.35, spanToMargin * 0.25));
  if (fixedZ > marginZ - 0.25) fixedZ = Math.max(coneZ, marginZ - 0.25);
  let centerL = 0;
  let centerM = 0;
  let centerN = 0;
  const rawTopBins = new Float32Array(TOP_SECTORS).fill(-Infinity);
  for (let i = 0; i < src.length; i += 3) {
    const z = src[i + 2]!;
    if (z <= marginZ) continue;
    const x = src[i]!;
    const y = src[i + 1]!;
    const rXY = Math.hypot(x, y);
    if (!proposalSolid && rXY <= screwR + 0.12) continue;
    centerL += x * axes.labial[0] + y * axes.labial[1];
    centerM += x * axes.mesial[0] + y * axes.mesial[1];
    centerN += 1;
    if (rXY > 0.35) {
      const tau = Math.PI * 2;
      const wrapped = ((Math.atan2(y, x) % tau) + tau) % tau;
      const bin = Math.min(TOP_SECTORS - 1, Math.floor((wrapped / tau) * TOP_SECTORS));
      if (z > rawTopBins[bin]!) rawTopBins[bin] = z;
    }
  }
  if (centerN > 0) {
    centerL /= centerN;
    centerM /= centerN;
  }

  let topColZ: Float32Array | undefined;
  if (rawTopBins.some((v) => Number.isFinite(v))) {
    const filled = new Float32Array(TOP_SECTORS);
    for (let b = 0; b < TOP_SECTORS; b += 1) {
      if (Number.isFinite(rawTopBins[b]!)) {
        filled[b] = rawTopBins[b]!;
        continue;
      }
      let best = top;
      for (let step = 1; step < TOP_SECTORS; step += 1) {
        const lVal = rawTopBins[(b - step + TOP_SECTORS) % TOP_SECTORS]!;
        const rVal = rawTopBins[(b + step) % TOP_SECTORS]!;
        if (Number.isFinite(lVal) && Number.isFinite(rVal)) {
          best = 0.5 * (lVal + rVal);
          break;
        }
        if (Number.isFinite(lVal)) {
          best = lVal;
          break;
        }
        if (Number.isFinite(rVal)) {
          best = rVal;
          break;
        }
      }
      filled[b] = best;
    }
    topColZ = new Float32Array(TOP_SECTORS);
    for (let b = 0; b < TOP_SECTORS; b += 1) {
      const p1 = filled[(b - 1 + TOP_SECTORS) % TOP_SECTORS]!;
      const p0 = filled[b]!;
      const n1 = filled[(b + 1) % TOP_SECTORS]!;
      topColZ[b] = 0.25 * p1 + 0.5 * p0 + 0.25 * n1;
    }
  }

  let topMinOuterR = Infinity;
  const bandZ = meanMarginZ + Math.max(0.8, top - meanMarginZ) * 0.72;
  const bandHalf = Math.max(0.25, (top - meanMarginZ) * 0.12);
  for (let i = 0; i < src.length; i += 3) {
    const z = src[i + 2]!;
    if (Math.abs(z - bandZ) > bandHalf) continue;
    const x = src[i]!;
    const y = src[i + 1]!;
    if (!proposalSolid && Math.hypot(x, y) <= screwR + 0.2) continue;
    const l = x * axes.labial[0] + y * axes.labial[1];
    const m = x * axes.mesial[0] + y * axes.mesial[1];
    const rFromCenter = Math.hypot(l - centerL, m - centerM);
    if (rFromCenter > 0.55 && rFromCenter < topMinOuterR) topMinOuterR = rFromCenter;
  }

  return {
    coneZ,
    fixedZ,
    marginZ,
    meanMarginZ,
    propTop: top,
    marginColZ,
    topColZ,
    topMinOuterR: Number.isFinite(topMinOuterR) ? topMinOuterR : undefined,
    boreTopR,
    anterior: isAnteriorTooth(design.toothNumber),
    screwR,
    span: Math.max(0.5, top - coneZ),
    labial: axes.labial,
    mesial: axes.mesial,
    centerL,
    centerM,
    ...(marginColZ
      ? {
          marginCenterL,
          marginCenterM,
          marginCenterZ,
          wallRadiusMm: Math.max(1.1, marginRadiusSum - (design.params?.marginShoulderMm ?? 0.5)),
        }
      : {}),
    coneTopR: measureConeTopR(src, coneZ),
    taperLink: taperLinkOfDesign(design),
  };
}

function collectTopSampleVertices(src: Float32Array, zone: Zone): Uint32Array {
  const out: number[] = [];
  const vCount = Math.floor(src.length / 3);
  let maxZ = -Infinity;
  for (let v = 0; v < vCount; v += 1) {
    const z = src[v * 3 + 2]!;
    if (z > maxZ) maxZ = z;
  }
  if (!Number.isFinite(maxZ)) return new Uint32Array(0);
  const stride = vCount > 6000 ? 2 : 1;
  for (let v = 0; v < vCount; v += stride) {
    const o = v * 3;
    const x = src[o]!;
    const y = src[o + 1]!;
    const z = src[o + 2]!;
    if (z <= zone.marginZ + 0.2) continue;
    const colTop = samplePolarProfile(zone.topColZ, Math.atan2(y, x), maxZ);
    if (z >= colTop - 0.55 || z >= maxZ - 0.35) {
      out.push(v);
    }
  }
  return new Uint32Array(out);
}

export function buildOpposingClearanceProbe(
  opposingGeometry: THREE.BufferGeometry | null | undefined,
  fixture: DirectEditFixture,
  zone: Zone,
): OpposingClearanceProbe | null {
  if (!opposingGeometry) return null;
  const pose = fixture.fixturePose;
  const oppTris = cropTrianglesInFixtureFrame(opposingGeometry, pose, 18);
  if (oppTris.length < 9) return null;

  let up: [number, number, number] = [0, 0, 1];
  if (fixture.archOcclusalDir && fixture.archOcclusalDir.length >= 3) {
    const wx = fixture.archOcclusalDir[0] ?? 0;
    const wy = fixture.archOcclusalDir[1] ?? 0;
    const wz = fixture.archOcclusalDir[2] ?? 1;
    const lx = wx * (pose.hexX[0] ?? 1) + wy * (pose.hexX[1] ?? 0) + wz * (pose.hexX[2] ?? 0);
    const ly = wx * (pose.hexY[0] ?? 0) + wy * (pose.hexY[1] ?? 1) + wz * (pose.hexY[2] ?? 0);
    const lz = wx * (pose.axis[0] ?? 0) + wy * (pose.axis[1] ?? 0) + wz * (pose.axis[2] ?? 1);
    const len = Math.hypot(lx, ly, lz);
    if (len > 1e-6) {
      const sign = lz >= 0 ? 1 : -1;
      up = [(lx * sign) / len, (ly * sign) / len, (lz * sign) / len];
    }
  }
  const labialHint: [number, number, number] = [zone.labial[0], zone.labial[1], 0];
  let ux = labialHint[0] - up[0] * (labialHint[0] * up[0] + labialHint[1] * up[1]);
  let uy = labialHint[1] - up[1] * (labialHint[0] * up[0] + labialHint[1] * up[1]);
  let uz = -up[2] * (labialHint[0] * up[0] + labialHint[1] * up[1]);
  let uLen = Math.hypot(ux, uy, uz);
  if (uLen < 1e-6) {
    const helper: [number, number, number] = Math.abs(up[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    ux = helper[1] * up[2] - helper[2] * up[1];
    uy = helper[2] * up[0] - helper[0] * up[2];
    uz = helper[0] * up[1] - helper[1] * up[0];
    uLen = Math.hypot(ux, uy, uz) || 1;
  }
  ux /= uLen;
  uy /= uLen;
  uz /= uLen;
  const u: [number, number, number] = [ux, uy, uz];
  const v: [number, number, number] = [
    up[1] * uz - up[2] * uy,
    up[2] * ux - up[0] * uz,
    up[0] * uy - up[1] * ux,
  ];

  const baseMeanMarginZ = zone.meanMarginZ ?? zone.marginZ;
  const surfaceIndex: OpposingClearanceIndex | null = buildOpposingClearanceIndex(oppTris, {
    origin: [0, 0, baseMeanMarginZ],
    up,
    labialHint: u,
    minHeightMm: 0.35,
    maxHeightMm: 22,
    maxAbsUMm: 12.5,
  });

  const step = 0.15;
  const halfSpan = 8.4;
  const minU = -halfSpan;
  const minV = -halfSpan;
  const cols = Math.round((halfSpan * 2) / step) + 1;
  const rows = cols;
  const grid = new Float32Array(cols * rows).fill(Infinity);

  const triCount = Math.floor(oppTris.length / 9);
  const minH = baseMeanMarginZ * up[2] + 0.8;
  const maxH = minH + 17.5;
  let written = 0;

  for (let t = 0; t < triCount; t += 1) {
    const o = t * 9;
    const ax = oppTris[o]!, ay = oppTris[o + 1]!, az = oppTris[o + 2]!;
    const bx = oppTris[o + 3]!, by = oppTris[o + 4]!, bz = oppTris[o + 5]!;
    const cx = oppTris[o + 6]!, cy = oppTris[o + 7]!, cz = oppTris[o + 8]!;
    const ah = ax * up[0] + ay * up[1] + az * up[2];
    const bh = bx * up[0] + by * up[1] + bz * up[2];
    const ch = cx * up[0] + cy * up[1] + cz * up[2];
    if (Math.max(ah, bh, ch) < minH || Math.min(ah, bh, ch) > maxH) continue;

    const au = ax * u[0] + ay * u[1] + az * u[2];
    const av = ax * v[0] + ay * v[1] + az * v[2];
    const bu = bx * u[0] + by * u[1] + bz * u[2];
    const bv = bx * v[0] + by * v[1] + bz * v[2];
    const cu = cx * u[0] + cy * u[1] + cz * u[2];
    const cv = cx * v[0] + cy * v[1] + cz * v[2];

    const uLo = Math.max(0, Math.floor((Math.min(au, bu, cu) - minU) / step));
    const uHi = Math.min(cols - 1, Math.ceil((Math.max(au, bu, cu) - minU) / step));
    const vLo = Math.max(0, Math.floor((Math.min(av, bv, cv) - minV) / step));
    const vHi = Math.min(rows - 1, Math.ceil((Math.max(av, bv, cv) - minV) / step));
    const v0x = bu - au, v0y = bv - av;
    const v1x = cu - au, v1y = cv - av;
    const den = v0x * v1y - v1x * v0y;
    if (Math.abs(den) < 1e-9) continue;
    const invDen = 1 / den;

    for (let iv = vLo; iv <= vHi; iv += 1) {
      const pv = minV + iv * step;
      const v2y = pv - av;
      const rowOff = iv * cols;
      for (let iu = uLo; iu <= uHi; iu += 1) {
        const pu = minU + iu * step;
        const v2x = pu - au;
        const w1 = (v2x * v1y - v1x * v2y) * invDen;
        const w2 = (v0x * v2y - v2x * v0y) * invDen;
        const w0 = 1 - w1 - w2;
        if (w0 < -0.04 || w1 < -0.04 || w2 < -0.04) continue;
        const h = ah * w0 + bh * w1 + ch * w2;
        if (h < minH || h > maxH) continue;
        const idx = rowOff + iu;
        if (h < grid[idx]!) {
          grid[idx] = h;
          written += 1;
        }
      }
    }
  }
  if (written === 0 && !surfaceIndex) return null;

  const probeDiskOffsets: Array<{ di: number; dj: number; dLatSq: number; dLat: number }> = [];
  const latCells = Math.round(0.9 / step);
  const latR2 = 0.9 * 0.9 + 1e-6;
  for (let dj = -latCells; dj <= latCells; dj += 1) {
    for (let di = -latCells; di <= latCells; di += 1) {
      if (di === 0 && dj === 0) continue;
      const dLatSq = (di * step) ** 2 + (dj * step) ** 2;
      if (dLatSq > latR2) continue;
      probeDiskOffsets.push({ di, dj, dLatSq, dLat: Math.sqrt(dLatSq) });
    }
  }
  probeDiskOffsets.sort((a, b) => a.dLatSq - b.dLatSq);

  const measureMinClearance = (positions: Float32Array, sampleVertices: Uint32Array): number | null => {
    if (written === 0 || sampleVertices.length === 0) return null;
    let best = Infinity;
    let apexX = 0, apexY = 0, apexZ = -Infinity;
    for (let k = 0; k < sampleVertices.length; k += 1) {
      const o = sampleVertices[k]! * 3;
      const z = positions[o + 2]!;
      if (z > apexZ) {
        apexZ = z;
        apexX = positions[o]!;
        apexY = positions[o + 1]!;
      }
    }
    const checkPoint = (px: number, py: number, pz: number) => {
      const pu = px * u[0] + py * u[1] + pz * u[2];
      const pv = px * v[0] + py * v[1] + pz * v[2];
      const iu = Math.round((pu - minU) / step);
      const iv = Math.round((pv - minV) / step);
      if (iu < 0 || iu >= cols || iv < 0 || iv >= rows) return;
      const ph = px * up[0] + py * up[1] + pz * up[2];
      const oppH0 = grid[iv * cols + iu]!;
      if (Number.isFinite(oppH0)) {
        const d0 = oppH0 - ph;
        if (d0 < best) best = d0;
      }
      if (best <= 0) return;
      for (const off of probeDiskOffsets) {
        if (off.dLat >= best) break;
        const ci = iu + off.di;
        const rj = iv + off.dj;
        if (ci < 0 || ci >= cols || rj < 0 || rj >= rows) continue;
        const oppH = grid[rj * cols + ci]!;
        if (!Number.isFinite(oppH)) continue;
        const dzPos = oppH > ph ? oppH - ph : 0;
        const d3 = Math.sqrt(off.dLatSq + dzPos * dzPos);
        if (d3 < best) best = d3;
      }
    };
    for (let k = 0; k < sampleVertices.length; k += 1) {
      const o = sampleVertices[k]! * 3;
      const px = positions[o]!;
      const py = positions[o]!;
      const pz = positions[o + 2]!;
      const pyActual = positions[o + 1]!;
      checkPoint(px, pyActual, pz);
      checkPoint(px * 0.75 + apexX * 0.25, pyActual * 0.75 + apexY * 0.25, pz * 0.75 + apexZ * 0.25);
      checkPoint((px + apexX) * 0.5, (pyActual + apexY) * 0.5, (pz + apexZ) * 0.5);
    }
    if (!Number.isFinite(best) || best >= 15) return null;
    return best;
  };

  const measureSurfaceClearance = (
    positions: Float32Array,
    marginLocal: Float32Array | null,
  ): number | null => {
    if (!surfaceIndex || positions.length < 9) return null;
    let marginFloorZ = zone.marginZ;
    let marginMeanZ = baseMeanMarginZ;
    let marginCx = 0;
    let marginCy = 0;
    if (marginLocal && marginLocal.length >= 9) {
      let minMz = Infinity;
      let sumMz = 0;
      let sumMx = 0;
      let sumMy = 0;
      const mCount = Math.floor(marginLocal.length / 3);
      for (let i = 0; i < mCount; i += 1) {
        const mx = marginLocal[i * 3]!;
        const my = marginLocal[i * 3 + 1]!;
        const mz = marginLocal[i * 3 + 2]!;
        if (mz < minMz) minMz = mz;
        sumMx += mx;
        sumMy += my;
        sumMz += mz;
      }
      if (Number.isFinite(minMz)) marginFloorZ = minMz;
      marginCx = sumMx / mCount;
      marginCy = sumMy / mCount;
      marginMeanZ = sumMz / mCount;
    }

    let maxPostZ = -Infinity;
    for (let i = 2; i < positions.length; i += 3) {
      const z = positions[i]!;
      if (z > maxPostZ) maxPostZ = z;
    }
    if (!Number.isFinite(maxPostZ) || maxPostZ <= marginFloorZ + 0.3) return null;

    const minSampleZ = marginFloorZ + 0.22;
    const topBandZ = maxPostZ - 0.75;
    const boreWallR2 = Math.max(0.28, (zone.boreTopR ?? zone.screwR) + 0.08) ** 2;
    const pts: number[] = [];
    const topPts: number[] = [];

    const triCountMesh = Math.floor(positions.length / 9);
    for (let t = 0; t < triCountMesh; t += 1) {
      const o = t * 9;
      const az = positions[o + 2]!;
      const bz = positions[o + 5]!;
      const cz = positions[o + 8]!;
      if (az < minSampleZ && bz < minSampleZ && cz < minSampleZ) continue;
      const ax = positions[o]!, ay = positions[o + 1]!;
      // 인접 삼각형끼리 정점을 공유하는 soup에서 삼각형 첫 정점만 취해도 모든 격자 정점이 빠짐없이 덮인다.
      if (az >= minSampleZ && !(az < maxPostZ - 0.18 && ax * ax + ay * ay <= boreWallR2)) {
        pts.push(ax, ay, az);
        if (az >= topBandZ) topPts.push(ax, ay, az);
      }

      if (az >= topBandZ && bz >= topBandZ && cz >= topBandZ) {
        const bx = positions[o + 3]!, by = positions[o + 4]!;
        const cx = positions[o + 6]!, cy = positions[o + 7]!;
        if (cz >= maxPostZ - 0.06 && !(cx * cx + cy * cy <= boreWallR2 && cz < maxPostZ - 0.18)) {
          pts.push(cx, cy, cz);
          topPts.push(cx, cy, cz);
        }
        const eMaxSq = Math.max(
          (bx - ax) ** 2 + (by - ay) ** 2 + (bz - az) ** 2,
          (cx - bx) ** 2 + (cy - by) ** 2 + (cz - bz) ** 2,
          (ax - cx) ** 2 + (ay - cy) ** 2 + (az - cz) ** 2,
        );
        if (eMaxSq > 0.25 && (t & 1) === 0) {
          const mx = (ax + bx + cx) * (1 / 3);
          const my = (ay + by + cy) * (1 / 3);
          const mz = (az + bz + cz) * (1 / 3);
          pts.push(mx, my, mz);
          topPts.push(mx, my, mz);
        }
      }
    }

    if (pts.length < 3) return null;
    void marginCx;
    void marginCy;
    void marginMeanZ;
    return surfaceIndex.measureClearanceMm({
      points: new Float32Array(pts),
      topPoints: topPts.length >= 3 ? new Float32Array(topPts) : null,
      postCorridorMarginMm: 2.2,
    });
  };

  return { up, u, v, minU, minV, step, cols, rows, grid, measureMinClearance, measureSurfaceClearance };
}

function applyMatrixToPositions(src: Float32Array, matrix: THREE.Matrix4, out: Float32Array) {
  const e = matrix.elements;
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i]!;
    const y = src[i + 1]!;
    const z = src[i + 2]!;
    out[i] = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
    out[i + 1] = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
    out[i + 2] = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
  }
  return out;
}

export function writeAttribute(geometry: THREE.BufferGeometry, positions: Float32Array) {
  if (geometry.index) geometry.setIndex(null);
  const attr = geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!attr || attr.array.length !== positions.length) {
    // 정점 수가 바뀔 때 이전 normal 버퍼가 남아 있으면 WebGL glDrawArrays 범위 초과로 메시가 통째로 사라진다.
    geometry.deleteAttribute("normal");
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  } else {
    const normalAttr = geometry.getAttribute("normal") as THREE.BufferAttribute | undefined;
    if (normalAttr && normalAttr.array.length !== positions.length) {
      geometry.deleteAttribute("normal");
    }
    (attr.array as Float32Array).set(positions);
    attr.needsUpdate = true;
  }
  computeCreasedVertexNormals(geometry);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

/** 임플란트 로컬 Z축을 따르는 실측 계단형 닫힌 스크류 채널 절삭 입체. */
function screwChannelCutterSoup(
  conn: DirectEditFixture["connectionSpec"],
  zBot: number,
  zMouthSurface: number | null,
  zTop: number,
  segments = 64,
): Float32Array {
  const bore = resolveScrewChannelProfile(conn, zMouthSurface);
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
  const put = (x: number, y: number, z: number) => {
    out[o++] = x;
    out[o++] = y;
    out[o++] = z;
  };
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const c0 = Math.cos(a0);
    const s0 = Math.sin(a0);
    const c1 = Math.cos(a1);
    const s1 = Math.sin(a1);
    put(0, 0, zBot);
    put(bore.rBot * c1, bore.rBot * s1, zBot);
    put(bore.rBot * c0, bore.rBot * s0, zBot);
    for (let k = 0; k < rings.length - 1; k += 1) {
      const [ra, za] = rings[k]!;
      const [rb, zb] = rings[k + 1]!;
      put(ra * c0, ra * s0, za);
      put(ra * c1, ra * s1, za);
      put(rb * c1, rb * s1, zb);
      put(ra * c0, ra * s0, za);
      put(rb * c1, rb * s1, zb);
      put(rb * c0, rb * s0, zb);
    }
    put(0, 0, zTop);
    put(rCapTop * c0, rCapTop * s0, zTop);
    put(rCapTop * c1, rCapTop * s1, zTop);
  }
  return out;
}

/**
 * 월드 공간 이동 벡터를 로컬 순측(axes[0])·근심(axes[1])·임플란트 장축(axes[2]) 분해로 정확히 옮긴다.
 * view.axes[0]·view.axes[1]은 임플란트 축에 수직이고, refitLocalPositions의 labial·mesial은 XY 단위벡터다.
 */
export function applyWorldDeltaToAbutmentEdit(
  edit: AbutmentEdit,
  deltaWorld: THREE.Vector3,
  axes: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3],
) {
  edit.shiftLabialMm += deltaWorld.dot(axes[0]);
  edit.shiftMesialMm += deltaWorld.dot(axes[1]);
  edit.heightMm += deltaWorld.dot(axes[2]);
}

const rotCross = new THREE.Vector3();

function projectOntoPlane(vec: THREE.Vector3, normal: THREE.Vector3, out: THREE.Vector3) {
  out.copy(vec);
  out.addScaledVector(normal, -out.dot(normal));
  return out;
}

/**
 * 월드 회전축(worldAxis) 주위로 오른손 법칙 각도 deg만큼 돌렸을 때 포스트 상단(+axes[2])이 움직이는 방향
 * (worldAxis × axes[2])과 단면 수평 회전 방향(worldAxis × axes[0])이 사분면 좌·우수계(Q1·Q3 vs Q2·Q4)에
 * 상관없이 100% 일치하도록 외적으로 직접 투영한다.
 */
export function applyWorldRotationToAbutmentEdit(
  edit: AbutmentEdit,
  worldAxis: THREE.Vector3,
  deg: number,
  axes: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3],
) {
  rotCross.crossVectors(worldAxis, axes[2]);
  edit.tiltLabialDeg += deg * rotCross.dot(axes[0]);
  edit.tiltMesialDeg += deg * rotCross.dot(axes[1]);
  // 측면 뷰(근심·원심·협측·설측)에서 파란 호로 포스트 상단 각도를 맞출 때 마진 수평 비틀림(yaw)이 섞이지 않도록,
  // 카메라가 교합면 방향에 가까울 때만 수평 회전(yaw)을 적용한다.
  if (Math.abs(worldAxis.dot(axes[2])) > 0.55) {
    rotCross.crossVectors(worldAxis, axes[0]);
    edit.yawDeg += deg * rotCross.dot(axes[1]);
  }
}

function copyPositions(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
  return new Float32Array(attr.array as ArrayLike<number>);
}

function basicMat(color: number, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color,
    depthTest: false,
    depthWrite: false,
    transparent: opacity < 1,
    opacity,
    toneMapped: false,
  });
}

function tagHandle(
  mesh: THREE.Mesh,
  op: HandleHit["op"],
  axis: number,
  axis2 = -1,
  colorMat?: THREE.MeshBasicMaterial,
) {
  mesh.userData.editHandle = { op, axis, axis2 };
  if (colorMat) mesh.userData.colorMat = colorMat;
  mesh.renderOrder = 40 + axis;
  mesh.frustumCulled = false;
  return mesh;
}

const gumballBasis = new THREE.Matrix4();

/**
 * 화면 오른쪽·위·화면 밖(+Z). 오른손 좌표계라 흰 고리가 화면에 평행하고 파란 축이 화면에 수직이다.
 * 화면 안쪽(-Z)을 세 번째 축으로 쓰면 행렬식이 -1이 되어 고리가 기울어진다.
 */
export function screenGumballQuaternion(
  right: THREE.Vector3,
  up: THREE.Vector3,
  outOfScreen: THREE.Vector3,
  out: THREE.Quaternion,
) {
  gumballBasis.makeBasis(right, up, outOfScreen);
  return out.setFromRotationMatrix(gumballBasis);
}

function alongAxis(mesh: THREE.Object3D, axis: number, distance: number) {
  mesh.position.set(axis === 0 ? distance : 0, axis === 1 ? distance : 0, axis === 2 ? distance : 0);
  if (axis === 0) mesh.rotation.z = -Math.PI / 2;
  else if (axis === 2) mesh.rotation.x = Math.PI / 2;
}

function addAxisScaleDot(group: THREE.Group, axis: 0 | 1, at: number, radius = 0.07) {
  const scaleMat = basicMat(AXIS_COLOR[axis]!);
  const dot = tagHandle(new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 10), scaleMat), "scale", axis, -1, scaleMat);
  dot.position.set(axis === 0 ? at : 0, axis === 1 ? at : 0, 0.04);
  dot.renderOrder = 46;
  const scaleHit = tagHandle(
    new THREE.Mesh(new THREE.SphereGeometry(radius + 0.045, 12, 8), basicMat(0xffffff, 0)),
    "scale",
    axis,
    -1,
    scaleMat,
  );
  scaleHit.position.copy(dot.position);
  group.add(dot, scaleHit);
}

/** 2D 이동 코너용 짧은 축 화살표(색은 해당 축). */
function addCornerMoveArrow(
  group: THREE.Group,
  axis: 0 | 1,
  corner: number,
  len: number,
  colorMat: THREE.MeshBasicMaterial,
) {
  const shaft = tagHandle(
    new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, len * 0.62, 10), colorMat),
    "move2",
    axis,
    axis === 0 ? 1 : 0,
    colorMat,
  );
  const head = tagHandle(
    new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.14, 12), colorMat),
    "move2",
    axis,
    axis === 0 ? 1 : 0,
    colorMat,
  );
  if (axis === 0) {
    shaft.position.set(corner + len * 0.38, corner, 0.03);
    head.position.set(corner + len * 0.82, corner, 0.03);
    shaft.rotation.z = -Math.PI / 2;
    head.rotation.z = -Math.PI / 2;
  } else {
    shaft.position.set(corner, corner + len * 0.38, 0.03);
    head.position.set(corner, corner + len * 0.82, 0.03);
  }
  group.add(shaft, head);
}

export function makeGumball(tooth: string) {
  const group = new THREE.Group();
  group.name = "abutment-gumball";
  group.userData.tooth = tooth;
  group.frustumCulled = false;

  // 화면 정렬 검볼(X=화면 오른쪽, Y=화면 위, Z=화면 밖). 1단위 ≈ 60px.
  // 스케일 점은 뱃지 바로 밖(우상), 이동 화살표는 그 바깥으로 간격을 두고 짧게 둔다. 회전 호는 좌하.
  const scaleAxisDist = 0.3;
  const scale2Corner = 0.26;
  for (const axis of [0, 1] as const) {
    const color = AXIS_COLOR[axis]!;
    const mat = basicMat(color);
    const shaftLen = 0.28;
    const shaftAt = 0.64;
    const shaft = tagHandle(
      new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, shaftLen, 12), mat),
      "move",
      axis,
      -1,
      mat,
    );
    alongAxis(shaft, axis, shaftAt);
    const head = tagHandle(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 14), mat), "move", axis, -1, mat);
    alongAxis(head, axis, shaftAt + shaftLen * 0.5 + 0.06);
    const hit = tagHandle(
      new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, shaftLen + 0.16, 10), basicMat(0xffffff, 0)),
      "move",
      axis,
      -1,
      mat,
    );
    alongAxis(hit, axis, shaftAt + 0.04);
    group.add(shaft, head, hit);
  }
  for (const axis of [0, 1] as const) {
    addAxisScaleDot(group, axis, scaleAxisDist);
  }

  // 파란 화면 평면 회전 호: 3사분면(169°~281°) — 예전 1축·2축 스케일 점이 있던 자리.
  const arcColor = AXIS_COLOR[2]!;
  const arcMat = basicMat(arcColor);
  const arcSpan = (112 * Math.PI) / 180;
  const arcStart = (169 * Math.PI) / 180;
  const arc = tagHandle(
    new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.045, 8, 22, arcSpan), arcMat),
    "rot",
    2,
    -1,
    arcMat,
  );
  const arcHit = tagHandle(
    new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.12, 6, 18, arcSpan), basicMat(0xffffff, 0)),
    "rot",
    2,
    -1,
    arcMat,
  );
  arc.rotation.z = arcStart;
  arcHit.rotation.z = arcStart;
  group.add(arc, arcHit);

  const moveCorner = 0.46;
  const moveCornerLen = 0.22;
  addCornerMoveArrow(group, 0, moveCorner, moveCornerLen, basicMat(AXIS_COLOR[0]!));
  addCornerMoveArrow(group, 1, moveCorner, moveCornerLen, basicMat(AXIS_COLOR[1]!));
  const move2Hit = tagHandle(
    new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.14), basicMat(0xffffff, 0)),
    "move2",
    0,
    1,
    basicMat(AXIS_COLOR[0]!),
  );
  move2Hit.position.set(moveCorner + moveCornerLen * 0.42, moveCorner + moveCornerLen * 0.42, 0.02);
  group.add(move2Hit);

  // 노란 2D 스케일 점: 축 스케일 점과 코너 화살표 사이, 뱃지 우상.
  const planeMat = basicMat(0xf5d90a, 0.94);
  const scale2Dot = tagHandle(new THREE.Mesh(new THREE.SphereGeometry(0.078, 14, 10), planeMat), "scale2", 0, 1, planeMat);
  scale2Dot.position.set(scale2Corner, scale2Corner, 0.02);
  scale2Dot.renderOrder = 47;
  const scale2Hit = tagHandle(
    new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), basicMat(0xffffff, 0)),
    "scale2",
    0,
    1,
    planeMat,
  );
  scale2Hit.position.copy(scale2Dot.position);
  group.add(scale2Dot, scale2Hit);

  // 중심 이동은 히트만 두고 뱃지 위 회색 구는 그리지 않는다.
  const centerMat = basicMat(0xe2e8f0, 0);
  const center = tagHandle(new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), centerMat), "center", 0, -1, centerMat);
  const centerHit = tagHandle(
    new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10), basicMat(0xffffff, 0)),
    "center",
    0,
    -1,
    centerMat,
  );
  group.add(center, centerHit);
  return group;
}

function handleFrom(object: THREE.Object3D | null): HandleHit | null {
  let tooth = "";
  let handle: { op: HandleHit["op"]; axis: number; axis2: number } | null = null;
  let cur: THREE.Object3D | null = object;
  while (cur) {
    const raw = cur.userData.editHandle as { op?: HandleHit["op"]; axis?: number; axis2?: number } | undefined;
    if (raw?.op) handle = { op: raw.op, axis: raw.axis ?? 0, axis2: raw.axis2 ?? -1 };
    if (typeof cur.userData.tooth === "string") tooth = cur.userData.tooth;
    cur = cur.parent;
  }
  if (!tooth || !handle) return null;
  return { tooth, ...handle };
}

function paintHandle(object: THREE.Object3D | null, hot: boolean) {
  const mat = object?.userData.colorMat as THREE.MeshBasicMaterial | undefined;
  if (!mat) return;
  if (mat.userData.baseColor == null) mat.userData.baseColor = mat.color.getHex();
  mat.color.setHex(hot ? 0xfff4c2 : (mat.userData.baseColor as number));
}

function pickGumballHit(groups: THREE.Object3D[]) {
  const hits = raycaster.intersectObjects(groups, true);
  if (hits.length <= 1) return hits[0];
  const rank = (obj: THREE.Object3D) => {
    const h = handleFrom(obj);
    if (!h) return 9;
    if (h.op === "scale" || h.op === "scale2" || h.op === "move2" || h.op === "center") return 0;
    return 1;
  };
  let best = hits[0]!;
  let bestRank = rank(best.object);
  for (let i = 1; i < hits.length; i += 1) {
    const r = rank(hits[i]!.object);
    if (r < bestRank) {
      best = hits[i]!;
      bestRank = r;
    }
  }
  return best;
}

const EMPTY_EDIT = identityAbutmentEdit();

type AbutmentEditStep = { tooth: string; before: AbutmentEdit; after: AbutmentEdit };

type DragGesture =
  | { kind: "translate"; delta: THREE.Vector3 }
  | { kind: "rotate"; axis: THREE.Vector3; deg: number }
  | { kind: "scaleAxes"; axes: THREE.Vector3[]; factor: number }
  | { kind: "scaleUniform"; factor: number };

export class AbutmentDirectEditSession {
  private readonly views = new Map<string, ToothView>();
  private readonly edits = new Map<string, AbutmentEdit>();
  private history: AbutmentEditStep[][] = [];
  private future: AbutmentEditStep[][] = [];
  private readonly stale = new Set<string>();
  private drag: Drag | null = null;
  private dragGroup: Array<{ tooth: string; start: AbutmentEdit }> = [];
  /** 드래그 한 프레임에서 선택 치아 패널을 같이 갱신한다. */
  private shapeBatch = true;
  private pendingPick: { tooth: string; x: number; y: number; pointerId: number } | null = null;
  private dom: HTMLElement | null = null;
  private hover: THREE.Object3D | null = null;
  private readonly brush: THREE.Mesh;
  private localBuf = new Float32Array(0);
  private worldBuf = new Float32Array(0);
  private summary: { widthRatio: number; heightDeltaMm: number } = { widthRatio: 1, heightDeltaMm: 0 };
  private shapeAt = 0;
  private readonly camRight = new THREE.Vector3();
  private readonly camUp = new THREE.Vector3();
  private readonly camForward = new THREE.Vector3();
  private readonly viewQuat = new THREE.Quaternion();

  constructor(private readonly bridge: AbutmentEditBridge) {
    this.brush = new THREE.Mesh(
      new THREE.SphereGeometry(1, 18, 12),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.18,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.brush.name = "abutment-sculpt-brush";
    this.brush.visible = false;
    this.brush.frustumCulled = false;
    this.brush.raycast = () => {};
    this.brush.renderOrder = 35;
  }

  attach(dom: HTMLElement) {
    this.detach();
    this.dom = dom;
    dom.addEventListener("pointerdown", this.onDown, { capture: true });
    dom.addEventListener("pointermove", this.onMove);
    dom.addEventListener("pointerup", this.onUp);
    dom.addEventListener("pointercancel", this.onUp);
  }

  detach() {
    if (this.dom) {
      this.dom.removeEventListener("pointerdown", this.onDown, { capture: true });
      this.dom.removeEventListener("pointermove", this.onMove);
      this.dom.removeEventListener("pointerup", this.onUp);
      this.dom.removeEventListener("pointercancel", this.onUp);
      this.dom = null;
    }
    this.drag = null;
    this.pendingPick = null;
    this.brush.visible = false;
  }

  dispose() {
    this.detach();
    for (const view of this.views.values()) this.disposeGumball(view.gumball);
    this.views.clear();
    this.brush.geometry.dispose();
    (this.brush.material as THREE.Material).dispose();
    this.brush.removeFromParent();
  }

  /** 초기 제안과 다른 검볼. 생성 로직 패턴으로 넘긴다. */
  listEdits(): { tooth: string; edit: AbutmentEdit }[] {
    const out: { tooth: string; edit: AbutmentEdit }[] = [];
    for (const [tooth, edit] of this.edits) {
      if (editsEqual(edit, EMPTY_EDIT)) continue;
      out.push({ tooth, edit: cloneAbutmentEdit(edit) });
    }
    return out;
  }

  canUndo() {
    return this.history.length > 0;
  }

  canRedo() {
    return this.future.length > 0;
  }

  undo() {
    const batch = this.history.pop();
    if (!batch) return;
    this.future.push(batch);
    for (const step of batch) {
      this.edits.set(step.tooth, cloneAbutmentEdit(step.before));
      this.show(step.tooth, true);
    }
    this.bridge.onHistory();
  }

  redo() {
    const batch = this.future.pop();
    if (!batch) return;
    this.history.push(batch);
    for (const step of batch) {
      this.edits.set(step.tooth, cloneAbutmentEdit(step.after));
      this.show(step.tooth, true);
    }
    this.bridge.onHistory();
  }

  /** 선택 치아, 없으면 편집된 치아 전부를 초기 제안으로 되돌린다. */
  reset(tooth?: string | null) {
    const teeth = tooth
      ? [tooth]
      : [...this.edits.keys()].filter((key) => !editsEqual(this.edits.get(key) ?? EMPTY_EDIT, EMPTY_EDIT));
    const steps: AbutmentEditStep[] = [];
    for (const key of teeth) {
      const before = this.edits.get(key);
      if (!before || editsEqual(before, EMPTY_EDIT)) continue;
      const after = identityAbutmentEdit();
      steps.push({
        tooth: key,
        before: cloneAbutmentEdit(before),
        after: cloneAbutmentEdit(after),
      });
      this.edits.set(key, after);
      this.show(key, true);
    }
    if (steps.length > 0) {
      this.pushHistoryBatch(steps);
      this.bridge.onHistory();
    }
  }

  clear(teeth: readonly string[]) {
    const drop = new Set(teeth);
    for (const tooth of teeth) this.edits.delete(tooth);
    const keep = (batches: AbutmentEditStep[][]) =>
      batches
        .map((batch) => batch.filter((step) => !drop.has(step.tooth)))
        .filter((batch) => batch.length > 0);
    this.history = keep(this.history);
    this.future = keep(this.future);
    for (const tooth of teeth) this.stale.add(tooth);
    this.bridge.onHistory();
  }

  editOf(tooth: string): AbutmentEdit | null {
    const edit = this.edits.get(tooth);
    return edit && !editsEqual(edit, EMPTY_EDIT) ? cloneAbutmentEdit(edit) : null;
  }

  setEdit(tooth: string, edit: AbutmentEdit | null) {
    if (!edit || editsEqual(edit, EMPTY_EDIT)) {
      this.edits.delete(tooth);
    } else {
      this.edits.set(tooth, cloneAbutmentEdit(edit));
    }
  }

  /**
   * 대합 거리·포스트 높이로 세로만 다시 만든 뒤, 그 세로 스케일을 검볼에서 뺀다.
   * 순측·근심 굵기 스케일은 남겨 다른 항목을 고쳐도 키운 크기가 유지된다.
   */
  clearBakedVertical(teeth: readonly string[]) {
    for (const tooth of teeth) {
      const cur = this.edits.get(tooth);
      if (!cur) continue;
      if (Math.abs(cur.heightMm) <= LIVE_GUMBALL_EPS && Math.abs(cur.scale[2] - 1) <= LIVE_GUMBALL_EPS) {
        continue;
      }
      const next = cloneAbutmentEdit(cur);
      next.heightMm = 0;
      next.scale = [cur.scale[0], cur.scale[1], 1];
      if (editsEqual(next, EMPTY_EDIT)) this.edits.delete(tooth);
      else this.edits.set(tooth, next);
    }
  }

  sync() {
    if (this.drag) return;
    const scene = this.bridge.getScene();
    if (!scene) return;
    if (this.brush.parent !== scene) scene.add(this.brush);
    const seen = new Set<string>();
    for (const design of this.bridge.getDesigns()) {
      const mesh = this.bridge.getAbutment(design.toothNumber);
      if (!mesh) continue;
      seen.add(design.toothNumber);
      const prev = this.views.get(design.toothNumber);
      if (prev && prev.geometry === mesh.geometry && !this.stale.has(design.toothNumber)) {
        if (prev.gumball.parent !== scene) scene.add(prev.gumball);
        continue;
      }
      const rebuilt = Boolean(prev);
      const wasStale = this.stale.has(design.toothNumber);
      this.stale.delete(design.toothNumber);
      if (prev) this.disposeGumball(prev.gumball);
      const preservedEdit = !wasStale ? this.edits.get(design.toothNumber) : undefined;
      if (rebuilt && wasStale) {
        const had =
          this.edits.has(design.toothNumber) ||
          this.history.some((batch) => batch.some((step) => step.tooth === design.toothNumber)) ||
          this.future.some((batch) => batch.some((step) => step.tooth === design.toothNumber));
        this.edits.delete(design.toothNumber);
        const dropTooth = (batches: AbutmentEditStep[][]) =>
          batches
            .map((batch) => batch.filter((step) => step.tooth !== design.toothNumber))
            .filter((batch) => batch.length > 0);
        this.history = dropTooth(this.history);
        this.future = dropTooth(this.future);
        if (had) this.bridge.onHistory();
      }
      const proposal = new Float32Array(design.localPositions);
      const proposalSolid = design.solidBodyLocalPositions?.length
        ? new Float32Array(design.solidBodyLocalPositions)
        : null;
      const margin = design.marginLoopLocal?.length ? new Float32Array(design.marginLoopLocal) : null;
      const fixture = fixtureMatrix(design.fixture.fixturePose);
      const zone = zoneOf(design, proposal, proposalSolid, margin);
      const inferredJaw: "upper" | "lower" =
        design.jaw ?? (/^[12]/.test(String(design.toothNumber || "")) ? "upper" : "lower");
      const jawGeometry = this.bridge.getJawGeometry?.(inferredJaw) ?? null;
      const gingivaProbe = buildJawGingivaMarginProbe(jawGeometry, design.fixture, design.toothNumber);
      let gingivaBaseResidual: Float32Array | null = null;
      if (gingivaProbe && margin && margin.length >= 24) {
        const subgMinMm = design.params?.marginSubgMinMm ?? design.metrics?.marginSubgMinMm ?? 0.5;
        const subgMaxMm = design.params?.marginSubgMaxMm ?? design.metrics?.marginSubgMaxMm ?? 1.0;
        const baseDrapedZ = gingivaProbe.drapeMarginLoopZ(margin, {
          subgMinMm,
          subgMaxMm,
          scallopMm: design.params?.marginScallopMm,
        });
        if (baseDrapedZ && baseDrapedZ.length * 3 === margin.length) {
          gingivaBaseResidual = new Float32Array(baseDrapedZ.length);
          for (let col = 0; col < baseDrapedZ.length; col += 1) {
            gingivaBaseResidual[col] = clamp(margin[col * 3 + 2]! - baseDrapedZ[col]!, -0.45, 0.45);
          }
        }
      }
      const opposingGeometry = this.bridge.getOpposingGeometry?.(inferredJaw) ?? null;
      const oppProbe = buildOpposingClearanceProbe(opposingGeometry, design.fixture, zone);
      const sampleSrc = proposalSolid ?? proposal;
      const topSampleVertices = collectTopSampleVertices(sampleSrc, zone);
      const rawTargetClearance =
        design.metrics?.occlusalClearanceMm ?? design.params?.occlusalClearanceMm ?? null;
      const targetClearanceMm =
        rawTargetClearance != null && Number.isFinite(Number(rawTargetClearance))
          ? Number(rawTargetClearance)
          : oppProbe
            ? oppProbe.measureMinClearance(sampleSrc, topSampleVertices)
            : null;
      const view: ToothView = {
        geometry: mesh.geometry,
        proposal,
        proposalSolid,
        proposalCrown: design.crownLocalPositions?.length ? new Float32Array(design.crownLocalPositions) : null,
        proposalMargin: margin,
        lastDrilledLocal: new Float32Array(proposal),
        lastDrilledEdit: identityAbutmentEdit(),
        lastAutoLiftMm: 0,
        lastMarginZCorr: null,
        zone,
        gingivaProbe,
        gingivaBaseResidual,
        oppProbe,
        topSampleVertices,
        targetClearanceMm,
        anchor: new THREE.Vector3(),
        midZ: 0,
        topZ: 0,
        quat: new THREE.Quaternion(),
        axes: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
        invFixture: fixture.clone().invert(),
        fixture,
        gumball: makeGumball(design.toothNumber),
        bakeEpoch: 0,
        baselineMeasure: null,
      };
      this.placeAnchor(view, design);
      this.views.set(design.toothNumber, view);
      scene.add(view.gumball);
      if (preservedEdit && !editsEqual(preservedEdit, EMPTY_EDIT)) {
        this.show(design.toothNumber, true);
      }
    }
    for (const [tooth, view] of this.views) {
      if (seen.has(tooth)) continue;
      this.disposeGumball(view.gumball);
      this.views.delete(tooth);
    }
  }

  tick() {
    const camera = this.bridge.getCamera();
    const host = this.bridge.getHost();
    if (!camera || !host) return;
    const viewH = (camera.top - camera.bottom) / Math.max(camera.zoom, 1e-4);
    const worldPerPx = viewH / Math.max(host.clientHeight, 1);
    const show = this.bridge.ui.gumballOn && !this.bridge.ui.readOnly;
    const gumballQuat = this.viewQuaternion();
    const picked = this.bridge.ui.selectedTeeth ?? [];
    const multi = picked.length > 1;
    const primary = picked[picked.length - 1] ?? this.bridge.ui.selected;
    for (const [tooth, view] of this.views) {
      const mesh = this.bridge.getAbutment(tooth);
      const visible = !!mesh && mesh.visible && this.bridge.ui.visible[tooth] !== false;
      const edit = this.edits.get(tooth) ?? EMPTY_EDIT;
      const expanded = this.bridge.ui.expanded[tooth] === true;
      const leadGumball = !multi || tooth === primary;
      view.gumball.visible = show && visible && expanded && leadGumball;
      view.gumball.quaternion.copy(gumballQuat);
      view.gumball.position.copy(this.gumballPosition(view, edit));
      view.gumball.scale.setScalar(worldPerPx * (expanded ? GUMBALL_SIZE_PX : 50));
      if (mesh) this.moveBadge(mesh, view.gumball.position, show && visible && expanded);
    }
  }

  private readonly onDown = (event: PointerEvent) => {
    if (event.button !== 0 || !this.dom) return;
    const camera = this.bridge.getCamera();
    if (!camera) return;
    this.pendingPick = null;
    this.setNdc(event);
    raycaster.setFromCamera(ndc, camera);
    if (!this.bridge.ui.readOnly && this.bridge.ui.gumballOn) {
      const groups = [...this.views.values()].filter((view) => view.gumball.visible).map((view) => view.gumball);
      const hit = pickGumballHit(groups);
      const handle = hit ? handleFrom(hit.object) : null;
      if (handle) {
        if (this.beginHandle(event, handle, hit.point)) {
          this.armDragGroup(handle.tooth);
          event.preventDefault();
          event.stopPropagation();
          this.dom.setPointerCapture(event.pointerId);
        }
        return;
      }
    }
    if (!this.bridge.ui.readOnly && this.bridge.ui.sculptOn) {
      const meshHit = this.pickAbutment();
      if (!meshHit) return;
      if (this.beginSculpt(event, meshHit.tooth, meshHit.hit)) {
        event.preventDefault();
        event.stopPropagation();
        this.dom.setPointerCapture(event.pointerId);
      }
      return;
    }
    const meshHit = this.pickAbutment();
    if (!meshHit) return;
    this.pendingPick = {
      tooth: meshHit.tooth,
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    };
  };

  private readonly onMove = (event: PointerEvent) => {
    if (!this.dom) return;
    if (this.drag && event.pointerId === this.drag.pointerId) {
      this.dragMove(event);
      this.dom.style.cursor = "grabbing";
      return;
    }
    if (this.drag) return;
    this.hoverMove(event);
  };

  private readonly onUp = (event: PointerEvent) => {
    const pending = this.pendingPick;
    if (pending && event.pointerId === pending.pointerId && !this.drag) {
      this.pendingPick = null;
      if (Math.abs(event.clientX - pending.x) + Math.abs(event.clientY - pending.y) < 6) {
        this.bridge.onBadge(pending.tooth, event.shiftKey);
      }
      return;
    }
    this.pendingPick = null;
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const drag = this.drag;
    this.drag = null;
    try {
      this.dom?.releasePointerCapture(event.pointerId);
    } catch {
      // 캡처가 이미 풀린 경우.
    }
    this.brush.visible = false;
    if (drag.kind === "center") {
      const moved = Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y);
      if (moved < 6) {
        this.restoreDragGroup();
        this.bridge.onBadge(drag.tooth, event.shiftKey);
        return;
      }
    }
    if (drag.kind === "sculpt") {
      this.finishSculpt(drag, event);
      const edit = this.edits.get(drag.tooth);
      if (!edit || editsEqual(edit, drag.start)) {
        this.edits.set(drag.tooth, drag.start);
        this.show(drag.tooth, true, true);
        return;
      }
      this.pushHistoryBatch([{ tooth: drag.tooth, before: drag.start, after: edit }]);
      this.show(drag.tooth, true);
      this.bridge.onHistory();
      return;
    }
    this.commitDragGroup();
  };

  private beginHandle(event: PointerEvent, handle: HandleHit, pickWorld?: THREE.Vector3) {
    const view = this.views.get(handle.tooth);
    const camera = this.bridge.getCamera();
    if (!view || !camera || !this.dom) return false;
    if (handle.op === "center") {
      const start = cloneAbutmentEdit(this.ensureEdit(handle.tooth));
      const center = this.resolveGumballCenter(view, start, handle.tooth);
      this.viewPlane(center);
      const hit = this.rayOnPlane(event);
      this.drag = {
        kind: "center",
        tooth: handle.tooth,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        start,
        startHit: (hit ?? center).clone(),
        pivotWorld: center.clone(),
      };
      return true;
    }
    const start = cloneAbutmentEdit(this.ensureEdit(handle.tooth));
    // 호는 검볼(포스트) 중심에 그려진다. 각도를 피니시라인에서 재면 좌하 호가 힌지 근처라 회전이 튀거나 안 된다.
    const center = this.resolveGumballCenter(view, start, handle.tooth);
    if (handle.op === "move" || handle.op === "scale") {
      const axis = this.cameraAxis(handle.axis, vC).clone();
      this.axisPlane(axis, center);
      const hit = this.rayOnPlane(event);
      if (!hit) return false;
      const along = hit.sub(center).dot(axis);
      this.drag = {
        kind: handle.op,
        tooth: handle.tooth,
        axis: handle.axis,
        axisWorld: axis,
        start,
        startAlong: along,
        pivotWorld: center.clone(),
        pointerId: event.pointerId,
      };
      this.show(handle.tooth, false);
      return true;
    }
    if (handle.op === "rot") {
      const axis = this.cameraAxis(handle.axis, vC).clone();
      plane.setFromNormalAndCoplanarPoint(axis, center);
      const seed = pickWorld ?? this.rayOnPlane(event);
      if (!seed) return false;
      projectOntoPlane(vA.copy(seed).sub(center), axis, vA);
      if (vA.lengthSq() < 1e-8) return false;
      this.drag = {
        kind: "rot",
        tooth: handle.tooth,
        axis: handle.axis,
        start,
        startVec: vA.clone(),
        worldAxis: axis,
        pivotWorld: center.clone(),
        pointerId: event.pointerId,
      };
      this.show(handle.tooth, false);
      return true;
    }
    if (handle.op === "move2") {
      this.viewPlane(center);
      const hit = this.rayOnPlane(event);
      if (!hit) return false;
      this.drag = {
        kind: "move2",
        tooth: handle.tooth,
        axis: handle.axis,
        axis2: handle.axis2,
        start,
        startHit: hit.clone(),
        pivotWorld: center.clone(),
        pointerId: event.pointerId,
      };
      this.show(handle.tooth, false);
      return true;
    }
    if (handle.op !== "scale2" && handle.op !== "scale3") return false;
    this.viewPlane(center);
    const hit = this.rayOnPlane(event) ?? raycaster.ray.closestPointToPoint(center, vA).clone();
    const radial = hit.sub(center);
    const radialLen = Math.max(radial.length(), 0.2);
    const radialDir = radial.lengthSq() > 1e-8 ? radial.clone().normalize() : this.cameraAxis(0, vC).clone();
    this.drag = {
      kind: handle.op,
      tooth: handle.tooth,
      axis: handle.axis,
      axis2: handle.axis2,
      start,
      startRadialDir: radialDir,
      startRadialLen: radialLen,
      pivotWorld: center.clone(),
      pointerId: event.pointerId,
    };
    this.show(handle.tooth, false);
    return true;
  }

  private beginSculpt(event: PointerEvent, tooth: string, hit: THREE.Intersection) {
    const view = this.views.get(tooth);
    if (!view) return false;
    const local = hit.point.clone().applyMatrix4(view.invFixture);
    if (local.z <= view.zone.marginZ) return false;
    const l = local.x * view.zone.labial[0] + local.y * view.zone.labial[1];
    const m = local.x * view.zone.mesial[0] + local.y * view.zone.mesial[1];
    const radius = Math.hypot(l, m);
    if (radius <= view.zone.screwR) return false;
    const reach = clamp(this.bridge.ui.radiusMm, 0.6, 6);
    this.dragGroup = [];
    this.drag = {
      kind: "sculpt",
      tooth,
      z: local.z,
      angle: Math.atan2(m, l),
      reach,
      radial: [l / radius, m / radius],
      radius,
      start: cloneAbutmentEdit(this.ensureEdit(tooth)),
      hitLocal: local,
      pointerId: event.pointerId,
    };
    this.brush.visible = true;
    this.brush.position.copy(hit.point);
    this.brush.scale.setScalar(reach);
    return true;
  }

  private dragMove(event: PointerEvent) {
    const drag = this.drag;
    const camera = this.bridge.getCamera();
    if (!drag || !camera || !this.dom) return;
    const view = this.views.get(drag.tooth);
    if (!view) return;
    if (drag.kind === "sculpt") {
      const edit = cloneAbutmentEdit(drag.start);
      this.previewSculpt(drag, event, view, edit);
      this.edits.set(drag.tooth, edit);
      this.show(drag.tooth, false);
      return;
    }
    const gesture = this.gestureFromDrag(drag, event, view);
    if (!gesture) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.shapeBatch = now - this.shapeAt >= 90;
    if (this.shapeBatch) this.shapeAt = now;
    const mates = this.dragGroup.length > 0 ? this.dragGroup : [{ tooth: drag.tooth, start: drag.start }];
    for (const mate of mates) {
      const mateView = this.views.get(mate.tooth);
      if (!mateView) continue;
      const edit = cloneAbutmentEdit(mate.start);
      this.applyGesture(edit, mate.start, mateView, gesture);
      clampAbutmentEdit(edit, mateView.zone.span);
      this.edits.set(mate.tooth, edit);
      this.show(mate.tooth, false);
    }
    this.shapeBatch = true;
  }

  private gestureFromDrag(
    drag: Exclude<Drag, { kind: "sculpt" }>,
    event: PointerEvent,
    view: ToothView,
  ): DragGesture | null {
    if (drag.kind === "center") {
      this.viewPlane(drag.startHit);
      const hit = this.rayOnPlane(event);
      if (!hit) return null;
      return { kind: "translate", delta: hit.sub(drag.startHit).clone() };
    }
    if (drag.kind === "move" || drag.kind === "scale") {
      const axis = drag.axisWorld;
      const center = drag.pivotWorld;
      this.axisPlane(axis, center);
      const hit = this.rayOnPlane(event);
      if (!hit) return null;
      const along = hit.sub(center).dot(axis);
      const delta = along - drag.startAlong;
      if (drag.kind === "move") {
        return { kind: "translate", delta: axis.clone().multiplyScalar(delta) };
      }
      const refSpan = Math.max(Math.abs(drag.startAlong), 0.25);
      return { kind: "scaleAxes", axes: [axis.clone()], factor: clamp(1 + delta / refSpan, 0.4, 2.2) };
    }
    if (drag.kind === "rot") {
      const center = drag.pivotWorld;
      plane.setFromNormalAndCoplanarPoint(drag.worldAxis, center);
      const hit = this.rayOnPlane(event);
      if (!hit) return null;
      projectOntoPlane(hit.sub(center), drag.worldAxis, vA);
      const angle = Math.atan2(
        vB.crossVectors(drag.startVec, vA).dot(drag.worldAxis),
        drag.startVec.dot(vA),
      );
      return { kind: "rotate", axis: drag.worldAxis.clone(), deg: (angle * 180) / Math.PI };
    }
    if (drag.kind === "move2") {
      this.viewPlane(drag.startHit);
      const hit = this.rayOnPlane(event);
      if (!hit) return null;
      const raw = hit.sub(drag.startHit);
      const a = this.cameraAxis(drag.axis, vA).clone();
      const b = this.cameraAxis(drag.axis2, vB).clone();
      return {
        kind: "translate",
        delta: a.multiplyScalar(raw.dot(a)).add(b.multiplyScalar(raw.dot(b))),
      };
    }
    if (drag.kind === "scale2" || drag.kind === "scale3") {
      const center = drag.pivotWorld;
      this.viewPlane(center);
      const hit = this.rayOnPlane(event);
      if (!hit) return null;
      const proj = hit.sub(center).dot(drag.startRadialDir);
      const factor = clamp(proj / Math.max(drag.startRadialLen, 0.2), 0.4, 2.2);
      if (drag.kind === "scale3") return { kind: "scaleUniform", factor };
      const a = this.cameraAxis(drag.axis, vB).clone();
      const b = drag.axis2 >= 0 ? this.cameraAxis(drag.axis2, vC).clone() : null;
      return { kind: "scaleAxes", axes: b ? [a, b] : [a], factor };
    }
    return null;
  }

  private applyGesture(edit: AbutmentEdit, start: AbutmentEdit, view: ToothView, gesture: DragGesture) {
    if (gesture.kind === "translate") {
      applyWorldDeltaToAbutmentEdit(edit, gesture.delta, view.axes);
      return;
    }
    if (gesture.kind === "rotate") {
      applyWorldRotationToAbutmentEdit(edit, gesture.axis, gesture.deg, view.axes);
      return;
    }
    if (gesture.kind === "scaleUniform") {
      edit.scale[0] = start.scale[0] * gesture.factor;
      edit.scale[1] = start.scale[1] * gesture.factor;
      edit.scale[2] = start.scale[2] * gesture.factor;
      return;
    }
    this.scaleAxes(edit, start, view, gesture.axes, gesture.factor);
  }

  private armDragGroup(lead: string) {
    const selected = this.bridge.ui.selectedTeeth ?? [];
    this.dragGroup = gumballGroupTeeth(selected, lead)
      .filter((tooth) => this.views.has(tooth))
      .map((tooth) => ({ tooth, start: cloneAbutmentEdit(this.ensureEdit(tooth)) }));
  }

  private restoreDragGroup() {
    const mates = this.dragGroup;
    this.dragGroup = [];
    for (const mate of mates) {
      this.edits.set(mate.tooth, mate.start);
      this.show(mate.tooth, true, true);
    }
  }

  private commitDragGroup() {
    const mates = this.dragGroup;
    this.dragGroup = [];
    const steps: AbutmentEditStep[] = [];
    for (const mate of mates) {
      const edit = this.edits.get(mate.tooth);
      if (!edit || editsEqual(edit, mate.start)) {
        this.edits.set(mate.tooth, mate.start);
        this.show(mate.tooth, true, true);
        continue;
      }
      steps.push({ tooth: mate.tooth, before: mate.start, after: cloneAbutmentEdit(edit) });
    }
    if (steps.length === 0) return;
    for (const step of steps) this.show(step.tooth, true);
    this.pushHistoryBatch(steps);
    this.bridge.onHistory();
  }

  private previewSculpt(drag: Extract<Drag, { kind: "sculpt" }>, event: PointerEvent, view: ToothView, edit: AbutmentEdit) {
    const camera = this.bridge.getCamera();
    const host = this.bridge.getHost();
    if (!camera || !this.dom || !host) return;
    camera.getWorldDirection(vB);
    const hitLocal = drag.hitLocal;
    const worldHit = hitLocal.clone().applyMatrix4(view.fixture);
    plane.setFromNormalAndCoplanarPoint(vB, worldHit);
    const hit = this.rayOnPlane(event);
    if (!hit) return;
    const local = hit.applyMatrix4(view.invFixture).sub(hitLocal);
    const lab = view.zone.labial;
    const mes = view.zone.mesial;
    const along =
      (local.x * lab[0] + local.y * lab[1]) * drag.radial[0] +
      (local.x * mes[0] + local.y * mes[1]) * drag.radial[1];
    const grow = along / Math.max(drag.radius, 0.8);
    edit.partial = [...drag.start.partial, { z: drag.z, angle: drag.angle, reach: drag.reach, grow }];
    this.brush.position.copy(worldHit);
    this.brush.scale.setScalar(drag.reach);
    this.brush.visible = true;
  }

  private finishSculpt(drag: Extract<Drag, { kind: "sculpt" }>, event: PointerEvent) {
    const view = this.views.get(drag.tooth);
    if (!view) return;
    const edit = cloneAbutmentEdit(drag.start);
    this.previewSculpt(drag, event, view, edit);
    const stamp = edit.partial[edit.partial.length - 1];
    if (!stamp || Math.abs(stamp.grow) < 0.01) {
      this.edits.set(drag.tooth, drag.start);
      this.show(drag.tooth, false);
      return;
    }
    stamp.grow = clamp(stamp.grow, SCALE_MIN - 1, SCALE_MAX - 1);
    clampAbutmentEdit(edit, view.zone.span);
    this.edits.set(drag.tooth, edit);
  }

  private hoverMove(event: PointerEvent) {
    const camera = this.bridge.getCamera();
    if (!camera || !this.dom || this.bridge.ui.readOnly) {
      this.brush.visible = false;
      return;
    }
    this.setNdc(event);
    raycaster.setFromCamera(ndc, camera);
    paintHandle(this.hover, false);
    this.hover = null;
    if (this.bridge.ui.gumballOn) {
      const groups = [...this.views.values()].filter((view) => view.gumball.visible).map((view) => view.gumball);
      const hit = pickGumballHit(groups);
      if (hit) {
        this.hover = hit.object;
        paintHandle(hit.object, true);
        this.brush.visible = false;
        this.dom.style.cursor = "grab";
        return;
      }
    }
    if (this.bridge.ui.sculptOn) {
      const picked = this.pickAbutment();
      const view = picked ? this.views.get(picked.tooth) : null;
      const local = picked && view ? picked.hit.point.clone().applyMatrix4(view.invFixture) : null;
      if (picked && view && local && local.z > view.zone.marginZ) {
        this.brush.visible = true;
        this.brush.position.copy(picked.hit.point);
        this.brush.scale.setScalar(clamp(this.bridge.ui.radiusMm, 0.6, 6));
        this.dom.style.cursor = "crosshair";
        return;
      }
    }
    this.brush.visible = false;
    if (this.dom.style.cursor === "grab" || this.dom.style.cursor === "crosshair" || this.dom.style.cursor === "grabbing") {
      this.dom.style.cursor = "";
    }
  }

  private pickAbutment() {
    const meshes = [...this.views.keys()]
      .map((tooth) => this.bridge.getAbutment(tooth))
      .filter((mesh): mesh is THREE.Mesh => !!mesh && mesh.visible);
    const hit = withDoubleSidePick(meshes, () => raycaster.intersectObjects(meshes, false))[0];
    if (!hit) return null;
    for (const [tooth] of this.views) {
      const mesh = this.bridge.getAbutment(tooth);
      if (mesh && (hit.object === mesh || hit.object.parent === mesh)) return { tooth, hit };
    }
    return null;
  }

  private show(tooth: string, bake: boolean, silent = false) {
    const view = this.views.get(tooth);
    const design = this.bridge.getDesigns().find((row) => row.toothNumber === tooth);
    const mesh = this.bridge.getAbutment(tooth);
    if (!view || !design || !mesh) return;
    view.zone.taperLink = taperLinkOfDesign(design);
    const edit = this.edits.get(tooth) ?? EMPTY_EDIT;

    // 드래그 중(bake=false)에는 스크류 홀이 없는 솔리드 외형(proposalSolid)을 곧바로 변형해 그리고,
    // 드래그가 끝나 확정(bake=true)될 때 임플란트 축 원통으로 스크류 홀을 뚫는다.
    let previewSrc = view.proposal;
    let previewZone = view.zone;
    if (view.proposalSolid) {
      if (bake && editsEqual(edit, EMPTY_EDIT)) {
        previewSrc = view.proposal;
        previewZone = view.zone;
      } else if (bake && editsEqual(edit, view.lastDrilledEdit)) {
        previewSrc = view.lastDrilledLocal;
        previewZone = { ...view.zone, screwR: 0 };
      } else {
        previewSrc = view.proposalSolid;
        previewZone = { ...view.zone, screwR: 0 };
      }
    }

    const cached = Boolean(bake && view.proposalSolid && editsEqual(edit, view.lastDrilledEdit));
    const local = cached ? new Float32Array(view.lastDrilledLocal) : this.take("local", previewSrc.length);
    let marginLocal: Float32Array | null = null;
    let marginZCorr: Float32Array | null = cached ? view.lastMarginZCorr : null;
    let hasMarginZCorr = false;
    if (view.proposalMargin) {
      marginLocal = new Float32Array(view.proposalMargin.length);
      refitLocalPositions(
        view.proposalMargin,
        { ...edit, partial: [] },
        { ...view.zone, screwR: 0 },
        marginLocal,
        0,
      );
      const tilting = Math.abs(edit.tiltLabialDeg) > 0.15 || Math.abs(edit.tiltMesialDeg) > 0.15;
      if (!editsEqual(edit, EMPTY_EDIT) && view.gingivaProbe && !tilting) {
        const mCount = Math.floor(marginLocal.length / 3);
        const subgMinMm = design.params?.marginSubgMinMm ?? design.metrics?.marginSubgMinMm ?? 0.5;
        const subgMaxMm = design.params?.marginSubgMaxMm ?? design.metrics?.marginSubgMaxMm ?? 1.0;
        const drapedZ = view.gingivaProbe.drapeMarginLoopZ(marginLocal, {
          subgMinMm,
          subgMaxMm,
          scallopMm: design.params?.marginScallopMm,
        });
        if (drapedZ && drapedZ.length === mCount) {
          let maxXYShift = 0;
          for (let col = 0; col < mCount; col += 1) {
            const dx = marginLocal[col * 3]! - view.proposalMargin[col * 3]!;
            const dy = marginLocal[col * 3 + 1]! - view.proposalMargin[col * 3 + 1]!;
            maxXYShift = Math.max(maxXYShift, Math.hypot(dx, dy));
          }
          const xyBlend = clamp(maxXYShift / 0.18, 0, 1);
          const manualTopLift = computeZLift(view.topZ, view.zone.fixedZ, view.zone.marginZ, view.topZ, edit);
          marginZCorr = new Float32Array(mCount);
          for (let col = 0; col < mCount; col += 1) {
            const origZ = view.proposalMargin[col * 3 + 2]!;
            const rawRefitZ = marginLocal[col * 3 + 2]!;
            const res = view.gingivaBaseResidual?.[col] ?? 0;
            const probeTargetZ = drapedZ[col]! + res * (1 - xyBlend * 0.75);
            const thetaCol = (col / mCount) * Math.PI * 2;
            const colTopBefore = samplePolarProfile(view.zone.topColZ, thetaCol, view.topZ);
            const maxAllowZ = Math.max(
              view.zone.coneZ + 0.45,
              colTopBefore + manualTopLift - 0.95,
            );
            const wantZ = clamp(
              origZ * (1 - xyBlend) + probeTargetZ * xyBlend,
              Math.max(view.zone.coneZ + 0.42, view.gingivaProbe.minMarginZ),
              maxAllowZ,
            );
            marginLocal[col * 3 + 2] = wantZ;
            const corr = wantZ - rawRefitZ;
            marginZCorr[col] = corr;
            if (Math.abs(corr) > 1e-4) hasMarginZCorr = true;
          }
        }
      }
    }
    let measured = this.summary;
    let autoLiftMm = cached ? view.lastAutoLiftMm : 0;
    if (!cached) {
      measured = refitLocalPositions(previewSrc, edit, previewZone, local, 0, marginZCorr);
      const hasRotation =
        Math.abs(edit.tiltLabialDeg) > 1e-3 ||
        Math.abs(edit.tiltMesialDeg) > 1e-3 ||
        Math.abs(edit.yawDeg) > 1e-3;
      if (
        hasRotation &&
        view.oppProbe &&
        view.targetClearanceMm != null &&
        view.topSampleVertices.length > 0 &&
        previewSrc.length === (view.proposalSolid ?? view.proposal).length
      ) {
        const manualLift = computeZLift(view.topZ, view.zone.fixedZ, view.zone.marginZ, view.topZ, edit);
        const desiredClearance = Math.max(0.5, view.targetClearanceMm - manualLift);
        const axialCos = Math.max(view.oppProbe.up[2], 0.35);
        for (let pass = 0; pass < 2; pass += 1) {
          const curClear = view.oppProbe.measureMinClearance(local, view.topSampleVertices);
          if (curClear == null) break;
          const stepLift = (curClear - desiredClearance) / axialCos;
          const nextLift = clamp(autoLiftMm + stepLift, -2.8, 2.8);
          if (Math.abs(nextLift - autoLiftMm) < 0.008) break;
          autoLiftMm = nextLift;
          measured = refitLocalPositions(previewSrc, edit, previewZone, local, autoLiftMm, marginZCorr);
        }
      }
      view.lastAutoLiftMm = autoLiftMm;
      view.lastMarginZCorr = marginZCorr;
      this.summary = measured;
      if (marginLocal && view.proposalMargin && (cuffNeedsRegen(edit) || hasMarginZCorr)) {
        regenerateCuffToMargin(previewSrc, local, view.proposalMargin, marginLocal, previewZone);
      }
    }
    const world = applyMatrixToPositions(local, view.fixture, this.take("world", local.length));
    writeAttribute(mesh.geometry, world);

    const crown = this.bridge.getCrown(tooth);
    let crownLocal: Float32Array | null = null;
    if (crown && view.proposalCrown) {
      crownLocal = new Float32Array(view.proposalCrown.length);
      refitLocalPositions(
        view.proposalCrown,
        { ...edit, partial: [] },
        { ...view.zone, screwR: 0 },
        crownLocal,
        autoLiftMm,
        marginZCorr,
      );
      writeAttribute(
        crown.geometry,
        applyMatrixToPositions(crownLocal, view.fixture, new Float32Array(crownLocal.length)),
      );
      if (bake && !silent) design.crownLocalPositions = crownLocal;
    }
    if (marginLocal) {
      const marginWorld = applyMatrixToPositions(marginLocal, view.fixture, new Float32Array(marginLocal.length));
      const margin = this.bridge.getMargin(tooth);
      if (margin) {
        const closed = new Float32Array(marginWorld.length + 3);
        closed.set(marginWorld);
        closed[marginWorld.length] = marginWorld[0]!;
        closed[marginWorld.length + 1] = marginWorld[1]!;
        closed[marginWorld.length + 2] = marginWorld[2]!;
        margin.geometry.setPositions(closed);
        margin.computeLineDistances();
      }
      if (bake && !silent) design.marginLoopLocal = marginLocal;
    }

    const summary = this.shapeSummary(view, design, edit, measured, local, marginLocal, crownLocal, cached);
    this.publishShape(summary, bake);
    if (bake && !silent) this.commitShape(tooth, view, design, edit, local, marginLocal, previewSrc, summary);
    this.moveBadge(mesh, this.resolveGumballCenter(view, edit, tooth), view.gumball.visible);
  }

  private publishShape(summary: AbutmentEditSummary, bake: boolean) {
    if (!bake && !this.shapeBatch) return;
    if (bake) {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      this.shapeAt = now;
    }
    this.bridge.onShape?.(summary);
  }

  private shapeSummary(
    view: ToothView,
    design: DirectEditDesign,
    edit: AbutmentEdit,
    fit: { widthRatio: number; heightDeltaMm: number },
    local: Float32Array,
    marginLocal: Float32Array | null,
    crownLocal: Float32Array | null,
    cached: boolean,
  ): AbutmentEditSummary {
    const neutral = editsEqual(edit, EMPTY_EDIT);
    const hinge = Math.max(
      view.topZ - (view.zone.marginCenterZ ?? view.zone.meanMarginZ ?? view.zone.marginZ),
      0.8,
    );
    let measured: EditedAbutmentMetrics | null = null;
    let baselineMeasured = view.baselineMeasure;
    if (marginLocal && view.proposalMargin) {
      const proposalSurface = view.proposalSolid ?? view.proposal;
      if (!baselineMeasured) {
        baselineMeasured = measureEditedAbutment(proposalSurface, view.proposalMargin, view.proposalCrown);
        if (baselineMeasured && view.oppProbe) {
          baselineMeasured.hasOpposingProbe = true;
          baselineMeasured.occlusalClearanceMm = view.oppProbe.measureSurfaceClearance(
            proposalSurface,
            view.proposalMargin,
          );
        }
        view.baselineMeasure = baselineMeasured;
      }
      const savedSolid = design.solidBodyLocalPositions;
      const surface =
        cached && savedSolid && savedSolid.length >= 9 ? savedSolid : local;
      measured = measureEditedAbutment(surface, marginLocal, crownLocal ?? view.proposalCrown);
      if (measured && view.oppProbe) {
        measured.hasOpposingProbe = true;
        measured.occlusalClearanceMm = view.oppProbe.measureSurfaceClearance(surface, marginLocal);
      }
    }
    return {
      tooth: design.toothNumber,
      widthRatio: fit.widthRatio,
      heightDeltaMm: fit.heightDeltaMm,
      yawDeg: edit.yawDeg,
      shiftLabialMm: edit.shiftLabialMm + Math.sin((edit.tiltLabialDeg * Math.PI) / 180) * hinge,
      shiftMesialMm: edit.shiftMesialMm + Math.sin((edit.tiltMesialDeg * Math.PI) / 180) * hinge,
      neutral,
      measured,
      baselineMeasured,
    };
  }

  private commitShape(
    tooth: string,
    view: ToothView,
    design: DirectEditDesign,
    edit: AbutmentEdit,
    local: Float32Array,
    marginLocal: Float32Array | null,
    previewSrc: Float32Array,
    summary: AbutmentEditSummary,
  ) {
    const epoch = ++view.bakeEpoch;
    const neutral = editsEqual(edit, EMPTY_EDIT);
    if (view.proposalSolid && editsEqual(edit, view.lastDrilledEdit)) {
      this.bridge.onCommit(summary);
      return;
    }
    if (view.proposalSolid && !neutral) {
      const solidOut =
        previewSrc === view.proposalSolid ? new Float32Array(local) : new Float32Array(view.proposalSolid.length);
      if (previewSrc !== view.proposalSolid) {
        refitLocalPositions(
          view.proposalSolid,
          edit,
          { ...view.zone, screwR: 0 },
          solidOut,
          view.lastAutoLiftMm,
          view.lastMarginZCorr,
        );
        if (marginLocal && view.proposalMargin && (cuffNeedsRegen(edit) || Boolean(view.lastMarginZCorr))) {
          regenerateCuffToMargin(view.proposalSolid, solidOut, view.proposalMargin, marginLocal, view.zone);
        }
      }
      design.solidBodyLocalPositions = solidOut;
      const conn = design.fixture.connectionSpec;
      const l2 = conn?.l2Mm ?? 2.75;
      const zBot = -l2;
      let zTopMax = -Infinity;
      let centralMouthZ = -Infinity;
      for (let i = 0; i < solidOut.length; i += 3) {
        const z = solidOut[i + 2]!;
        if (z > zTopMax) zTopMax = z;
        if (Math.hypot(solidOut[i]!, solidOut[i + 1]!) <= 0.45 && z > centralMouthZ) {
          centralMouthZ = z;
        }
      }
      const mouthZ = Number.isFinite(centralMouthZ) && centralMouthZ > 1.5 ? centralMouthZ : zTopMax;
      const cutter = screwChannelCutterSoup(conn, zBot - 1, mouthZ, zTopMax + 3);
      void subtractTriangleSoups(solidOut, [cutter], `#${tooth} 커스텀어벗`)
        .then((drilled) => {
          if (view.bakeEpoch !== epoch) return;
          view.lastDrilledLocal = drilled;
          view.lastDrilledEdit = cloneAbutmentEdit(edit);
          const curMesh = this.bridge.getAbutment(tooth);
          if (curMesh) {
            writeAttribute(
              curMesh.geometry,
              applyMatrixToPositions(drilled, view.fixture, new Float32Array(drilled.length)),
            );
          }
          design.localPositions = drilled;
          design.stlBlob = encodeBinaryStl(solidOut, `abuts.fit custom abutment #${tooth}`);
          this.bridge.onCommit(summary);
        })
        .catch(() => {
          if (view.bakeEpoch !== epoch) return;
          const fallback = new Float32Array(view.proposal.length);
          refitLocalPositions(view.proposal, edit, view.zone, fallback, view.lastAutoLiftMm, view.lastMarginZCorr);
          if (marginLocal && view.proposalMargin && (cuffNeedsRegen(edit) || Boolean(view.lastMarginZCorr))) {
            regenerateCuffToMargin(view.proposal, fallback, view.proposalMargin, marginLocal, view.zone);
          }
          view.lastDrilledLocal = fallback;
          view.lastDrilledEdit = cloneAbutmentEdit(edit);
          const curMesh = this.bridge.getAbutment(tooth);
          if (curMesh) {
            writeAttribute(
              curMesh.geometry,
              applyMatrixToPositions(fallback, view.fixture, new Float32Array(fallback.length)),
            );
          }
          design.localPositions = fallback;
          design.stlBlob = encodeBinaryStl(fallback, `abuts.fit custom abutment #${tooth}`);
          this.bridge.onCommit(summary);
        });
      return;
    }
    if (view.proposalSolid && neutral) {
      design.solidBodyLocalPositions = new Float32Array(view.proposalSolid);
      view.lastDrilledLocal = new Float32Array(view.proposal);
      view.lastDrilledEdit = identityAbutmentEdit();
      view.lastAutoLiftMm = 0;
      view.lastMarginZCorr = null;
    }
    design.localPositions = new Float32Array(local);
    const stlPositions =
      design.solidBodyLocalPositions && design.solidBodyLocalPositions.length >= 9
        ? design.solidBodyLocalPositions
        : design.localPositions;
    design.stlBlob = encodeBinaryStl(stlPositions, `abuts.fit custom abutment #${tooth}`);
    this.bridge.onCommit(summary);
  }

  private take(slot: "local" | "world", length: number) {
    const current = slot === "local" ? this.localBuf : this.worldBuf;
    const full = current.length >= length ? current : new Float32Array(length);
    if (slot === "local") this.localBuf = full;
    else this.worldBuf = full;
    return full.subarray(0, length);
  }

  private ensureEdit(tooth: string) {
    let edit = this.edits.get(tooth);
    if (!edit) {
      edit = identityAbutmentEdit();
      this.edits.set(tooth, edit);
    }
    return edit;
  }

  private pushHistoryBatch(steps: readonly AbutmentEditStep[]) {
    if (steps.length === 0) return;
    this.history.push(
      steps.map((step) => ({
        tooth: step.tooth,
        before: cloneAbutmentEdit(step.before),
        after: cloneAbutmentEdit(step.after),
      })),
    );
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    this.future = [];
  }

  private placeAnchor(view: ToothView, design: DirectEditDesign) {
    const pose = design.fixture.fixturePose;
    const hexX = new THREE.Vector3(pose.hexX[0] ?? 1, pose.hexX[1] ?? 0, pose.hexX[2] ?? 0);
    const hexY = new THREE.Vector3(pose.hexY[0] ?? 0, pose.hexY[1] ?? 1, pose.hexY[2] ?? 0);
    const axis = vA.set(pose.axis[0] ?? 0, pose.axis[1] ?? 0, pose.axis[2] ?? 1).normalize();
    // refitLocalPositions가 쓰는 로컬 XY 단위벡터(zone.labial, zone.mesial)와 100% 일치하는 월드 직교 기저를 쓴다.
    const labial = vB
      .copy(hexX)
      .multiplyScalar(view.zone.labial[0])
      .addScaledVector(hexY, view.zone.labial[1])
      .normalize();
    const mesial = vC
      .copy(hexX)
      .multiplyScalar(view.zone.mesial[0])
      .addScaledVector(hexY, view.zone.mesial[1])
      .normalize();
    view.axes[0].copy(labial);
    view.axes[1].copy(mesial);
    view.axes[2].copy(axis);
    view.quat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(labial, mesial, axis));
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let n = 0;
    let top = -Infinity;
    const src = view.proposalSolid && view.proposalSolid.length >= 9 ? view.proposalSolid : view.proposal;
    const postZ = Math.max(view.zone.marginZ, view.zone.fixedZ);
    for (let i = 0; i < src.length; i += 3) {
      const x = src[i]!;
      const y = src[i + 1]!;
      const z = src[i + 2]!;
      if (z > top) top = z;
      if (z <= postZ || (!view.proposalSolid && Math.hypot(x, y) <= view.zone.screwR + 0.15)) continue;
      sx += x;
      sy += y;
      sz += z;
      n += 1;
    }
    view.topZ = Number.isFinite(top) ? top : view.zone.marginZ + 4;
    if (n > 0) {
      view.midZ = sz / n;
      view.anchor.set(sx / n, sy / n, sz / n);
    } else {
      view.midZ = (view.zone.fixedZ + view.topZ) / 2;
      view.anchor.set(0, 0, view.midZ);
    }
    view.anchor.applyMatrix4(view.fixture);
  }

  private gumballPosition(view: ToothView, edit: AbutmentEdit) {
    const zone = view.zone;
    const l0 = zone.centerL ?? 0;
    const m0 = zone.centerM ?? 0;
    const z0 = view.midZ;
    const zLift = computeZLift(z0, zone.fixedZ, zone.marginZ, view.topZ, edit);
    const l = l0 + edit.shiftLabialMm;
    const m = m0 + edit.shiftMesialMm;
    return new THREE.Vector3(
      l * zone.labial[0] + m * zone.mesial[0],
      l * zone.labial[1] + m * zone.mesial[1],
      z0 + zLift,
    ).applyMatrix4(view.fixture);
  }

  /** 검볼 UI·이동·스케일·회전 드래그 피봇 — 포스트 중심. 형상 힌지는 피니시라인. */
  private resolveGumballCenter(view: ToothView, edit: AbutmentEdit, _tooth: string): THREE.Vector3 {
    return this.gumballPosition(view, edit);
  }

  private cameraBasis() {
    const camera = this.bridge.getCamera();
    if (!camera) return false;
    camera.updateMatrixWorld();
    this.camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    this.camUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    // 카메라 로컬 +Z는 화면 밖(보는 사람). 고리가 화면에 평행하다.
    this.camForward.setFromMatrixColumn(camera.matrixWorld, 2).normalize();
    return true;
  }

  /** 화면 오른쪽, 위, 화면 밖. 검볼은 이 축으로 화면에 수직이다. */
  private cameraAxis(axis: number, out: THREE.Vector3) {
    this.cameraBasis();
    if (axis === 0) return out.copy(this.camRight);
    if (axis === 1) return out.copy(this.camUp);
    return out.copy(this.camForward);
  }

  private viewQuaternion() {
    this.cameraBasis();
    return screenGumballQuaternion(this.camRight, this.camUp, this.camForward, this.viewQuat);
  }

  /** 화살표 방향으로 키우거나 줄인다. 그 방향에 놓인 순측·근심·삽입축 비율만 바꾼다. */
  private scaleAlong(edit: AbutmentEdit, start: AbutmentEdit, view: ToothView, axis: THREE.Vector3, factor: number) {
    this.scaleAxes(edit, start, view, [axis], factor);
  }

  private scaleAxes(
    edit: AbutmentEdit,
    start: AbutmentEdit,
    view: ToothView,
    axes: readonly THREE.Vector3[],
    factor: number,
  ) {
    const clampedFactor = clamp(factor, 0.4, 2.2);
    for (let i = 0; i < 3; i += 1) {
      let weight = 0;
      for (const axis of axes) weight += axis.dot(view.axes[i]!) ** 2;
      const w = Math.min(1, weight);
      edit.scale[i] = start.scale[i]! * Math.pow(clampedFactor, w);
    }
  }

  private setNdc(event: PointerEvent) {
    if (!this.dom) return;
    const rect = this.dom.getBoundingClientRect();
    ndc.set(
      ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
      -((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1,
    );
  }

  private rayOnPlane(event: PointerEvent) {
    const camera = this.bridge.getCamera();
    if (!camera) return null;
    this.setNdc(event);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(plane, vA) ? vA.clone() : null;
  }

  private viewPlane(origin: THREE.Vector3) {
    const camera = this.bridge.getCamera();
    if (!camera) return;
    camera.getWorldDirection(vB);
    plane.setFromNormalAndCoplanarPoint(vB, origin);
  }

  /** 축을 포함하고 카메라를 바라보는 평면. 끌기 부호가 화살표와 같다. */
  private axisPlane(axis: THREE.Vector3, origin: THREE.Vector3) {
    const camera = this.bridge.getCamera();
    if (!camera) return;
    vB.copy(camera.position).sub(origin);
    vB.addScaledVector(axis, -vB.dot(axis));
    if (vB.lengthSq() < 1e-8) {
      camera.getWorldDirection(vB);
      vB.addScaledVector(axis, -vB.dot(axis));
    }
    if (vB.lengthSq() < 1e-8) vB.set(0, 1, 0).addScaledVector(axis, -axis.y);
    vB.normalize();
    plane.setFromNormalAndCoplanarPoint(vB, origin);
  }

  private moveBadge(mesh: THREE.Mesh, center: THREE.Vector3, gumballOn: boolean) {
    for (const child of mesh.children) {
      const el = (child as { element?: HTMLElement }).element;
      if (!el) continue;
      child.position.copy(center);
      if (el.dataset.candidatePicker === "true") {
        el.style.pointerEvents = "none";
      } else {
        el.style.pointerEvents = gumballOn ? "none" : "auto";
      }
    }
  }

  private disposeGumball(group: THREE.Group) {
    const materials = new Set<THREE.Material>();
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((row) => materials.add(row));
      else if (mat) materials.add(mat);
    });
    materials.forEach((mat) => mat.dispose());
    group.removeFromParent();
  }
}
