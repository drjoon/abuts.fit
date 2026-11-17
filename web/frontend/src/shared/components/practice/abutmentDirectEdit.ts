// 커스텀어벗 뷰어의 직접 편집.
// 검볼은 포스트 중심에 둔다. 빨간 축은 화면 오른쪽, 초록 축은 화면 위, 파란 축은 화면 밖이다.
// 고리(XY)가 화면에 평행하고 파란 축이 화면에 수직이다. 뷰가 바뀌면 검볼도 따라 돈다.
// 화살표는 그 방향으로 포스트를 옮긴다. 축 상자는 그 방향 크기, 노란 면은 평면, 흰 고리는 전체 크기다.
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
  CUSTOM_ABUTMENT_PARAM_SPECS,
  computeOptimalPostTaperDeg,
  isAnteriorTooth,
  type CustomAbutmentDesignParams,
} from "../../practice/customAbutmentDesignParams";
import { subtractTriangleSoups } from "../../practice/meshUnion";
import { computeCreasedVertexNormals, withDoubleSidePick } from "../../three/backFaceShell";

const AXIS_COLOR = [0xef4444, 0x22c55e, 0x3b82f6] as const;
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
  fixturePose: {
    hexX: readonly number[];
    hexY: readonly number[];
    axis: readonly number[];
    origin: readonly number[];
  };
  connectionSpec?: {
    l2Mm?: number;
    prcConeTopMm: number;
    screwLowerDiameterMm?: number;
    screwUpperDiameterMm: number;
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
  zone: Zone;
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
  op: "move" | "rot" | "scale" | "scale2" | "scale3" | "center";
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
      pointerId: number;
    }
  | {
      kind: "rot";
      tooth: string;
      axis: number;
      start: AbutmentEdit;
      startVec: THREE.Vector3;
      worldAxis: THREE.Vector3;
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
  getOpposingGeometry?: (jaw: "upper" | "lower") => THREE.BufferGeometry | null;
  ui: {
    gumballOn: boolean;
    sculptOn: boolean;
    radiusMm: number;
    readOnly: boolean;
    selected: string | null;
    visible: Record<string, boolean>;
    /** 어벗 정보에서 펼친 치아. 검볼은 여기만 보인다. */
    expanded: Record<string, boolean>;
  };
  onBadge: (tooth: string) => void;
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

/**
 * 초기 제안 정점에서 커넥션과 2° 테이퍼는 복사하고, 그 위 커프·포스트만 다시 놓는다.
 * 파란 회전 툴(tilt)은 마진 위 포스트와 평평한 최상단 교합면을 실제로 3D 회전시켜 대합치와의 각도를 맞추고,
 * extraPostTopLiftMm로 포스트 상단 높이를 보정해 최단 대합 거리를 유지한다.
 * 드래그 중에는 솔리드 외형(screwR=0)에 곧바로 적용하고, 드래그 종료 시 임플란트 축 원통으로 스크류 홀을 뚫는다.
 */
export function refitLocalPositions(
  proposal: Float32Array,
  edit: AbutmentEdit,
  zone: Zone,
  out: Float32Array,
  extraPostTopLiftMm = 0,
): { widthRatio: number; heightDeltaMm: number } {
  const { fixedZ, marginZ, screwR, labial, mesial } = zone;
  const yawRad = (edit.yawDeg * Math.PI) / 180;
  const hole = screwR > 0.15;
  const minWallR = screwR + 0.08;
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
  const safePropTop = Number.isFinite(propTop) ? propTop : marginZ + 4;
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
  const tiltSlopeL = Math.tan((edit.tiltLabialDeg * Math.PI) / 180);
  const tiltSlopeM = Math.tan((edit.tiltMesialDeg * Math.PI) / 180);
  const hasTilt = Math.abs(tiltSlopeL) > 1e-6 || Math.abs(tiltSlopeM) > 1e-6;
  const hasTopAdjust = hasTilt || Math.abs(extraPostTopLiftMm) > 1e-5;
  const { topLeanL, topLeanM } = hasTilt
    ? computeSafePostTopLean(edit, zone, safePropTop, postCenterL, postCenterM)
    : { topLeanL: 0, topLeanM: 0 };
  const manualTopLift = computeZLift(safePropTop, fixedZ, marginZ, safePropTop, edit);
  const marginLiftRef = computeZLift(zone.meanMarginZ ?? marginZ, fixedZ, marginZ, safePropTop, edit);
  const postHeightLift = manualTopLift - marginLiftRef;
  const basePostHeight = Math.max(2.2, safePropTop - (zone.meanMarginZ ?? marginZ));
  const nextLinkedPostHeight = Math.max(2.2, basePostHeight + postHeightLift);
  const taperLinkSlopeOld = zone.taperLink
    ? Math.tan((zone.taperLink.baseTaperDeg * Math.PI) / 180)
    : 0;
  const taperLinkSlopeNew = zone.taperLink
    ? Math.tan((computeOptimalPostTaperDeg(nextLinkedPostHeight, zone.taperLink) * Math.PI) / 180)
    : 0;
  const hasTaperLinkAdjust = Boolean(zone.taperLink && Math.abs(postHeightLift) > 0.02);
  const rimZ = (Number.isFinite(boreTop) ? boreTop : safePropTop) - 0.7;
  const minPostWallAboveMargin = 0.85;

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
      if (hasTopAdjust && uPost > 0) {
        const screwTiltZ = -((-postCenterL) * tiltSlopeL + (-postCenterM) * tiltSlopeM);
        const minAllowedDelta = minPostWallAboveMargin - postSpanCol - manualTopLift;
        zRim += Math.max(minAllowedDelta, extraPostTopLiftMm + screwTiltZ) * uPost;
      }
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

    let leanL = 0;
    let leanM = 0;
    let postTopDeltaZ = 0;
    if (hasTopAdjust && hAboveMargin > 0) {
      const hSmooth = (hAboveMargin * hAboveMargin) / (hAboveMargin + 0.12);
      const uLean = clamp(hSmooth / postSpanCol, 0, 1.15);
      leanL = topLeanL * uLean;
      leanM = topLeanM * uLean;
      const rawTiltZ = -(lRot * tiltSlopeL + mRot * tiltSlopeM);
      const minAllowedDelta = minPostWallAboveMargin - postSpanCol - manualTopLift;
      postTopDeltaZ = Math.max(minAllowedDelta, extraPostTopLiftMm + rawTiltZ) * uPost;
    }

    const offL = edit.shiftLabialMm * t + leanL;
    const offM = edit.shiftMesialMm * t + leanM;
    const z2 = z + baseZLift + postTopDeltaZ;
    let adjLRot = lRot;
    let adjMRot = mRot;
    if (hasTaperLinkAdjust && hAboveMargin > 0.22 && (!hole || rProp > screwR + 0.12)) {
      const mColLift = computeZLift(mZCol, fixedZ, marginZ, safePropTop, edit);
      const newHAbove = Math.max(0, z2 - (mZCol + mColLift));
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
    out[i] = ly * labial[0] + my * mesial[0];
    out[i + 1] = ly * labial[1] + my * mesial[1];
    out[i + 2] = z2;
    if (z > marginZ && rProp > screwR) {
      const rOrigFromCenter = Math.hypot(l - postCenterL, m - postCenterM);
      const rNowFromCenter = Math.hypot(ly - (postCenterL + offL), my - (postCenterM + offM));
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

/**
 * 콘 위 커프 정점을 지금 마진 열에 맞춰 다시 놓는다.
 * 2°로 시작해 오목하게 벌어지고, 끝점은 그 방향의 마진 점과 만난다. 마진 위 포스트는 그대로 둔다.
 * 경사진 포스트(삽입축 > 0°)는 마진이 낮은 방향을 넘어 인접 열로 기울면서 로컬 z가 그 열의 마진 높이보다 낮아질 수 있으므로,
 * 마진 곡면 위쪽(삽입축 방향)이 아닌 실제 커프 정점(오목 현 안쪽)만 재생성한다.
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
  const profiles: Array<(z: number) => number> = [];
  for (let col = 0; col < count; col += 1) {
    const i = col * 3;
    origZ[col] = proposalMargin[i + 2]!;
    origR[col] = Math.hypot(proposalMargin[i]!, proposalMargin[i + 1]!);
    const x = fittedMargin[i]!;
    const y = fittedMargin[i + 1]!;
    endZ[col] = fittedMargin[i + 2]!;
    endAng[col] = Math.atan2(y, x);
    profiles.push(cuffProfile(coneTopR, coneZ, Math.hypot(x, y), endZ[col]!));
  }
  const origProfiles = Array.from({ length: count }, (_, col) =>
    cuffProfile(coneTopR, coneZ, origR[col]!, origZ[col]!),
  );
  for (let i = 0; i < proposal.length; i += 3) {
    const ox = proposal[i]!;
    const oy = proposal[i + 1]!;
    const oz = proposal[i + 2]!;
    if (oz <= coneZ + 1e-3) continue;
    const orad = Math.hypot(ox, oy);
    if (screwR > 0.15 && orad <= screwR + 0.22) continue;
    const theta0 = Math.atan2(oy, ox);
    const { c0, c1, frac } = marginColumnBlend(theta0, count);
    const marginZ = origZ[c0]! * (1 - frac) + origZ[c1]! * frac;
    if (!(marginZ > coneZ + 0.05) || oz >= marginZ - 1e-3) continue;
    const u = clamp((oz - coneZ) / (marginZ - coneZ), 0, 1);
    const origCuffR =
      origProfiles[c0]!(coneZ + u * (origZ[c0]! - coneZ)) * (1 - frac) +
      origProfiles[c1]!(coneZ + u * (origZ[c1]! - coneZ)) * frac;
    const origChordR =
      coneTopR +
      ((origR[c0]! * (1 - frac) + origR[c1]! * frac - coneTopR) * (oz - coneZ)) /
        Math.max(0.05, marginZ - coneZ);
    if (orad > origChordR + 0.02 || Math.abs(orad - origCuffR) > 0.03) continue;
    const zEnd0 = coneZ + u * (endZ[c0]! - coneZ);
    const zEnd1 = coneZ + u * (endZ[c1]! - coneZ);
    const z2 = zEnd0 * (1 - frac) + zEnd1 * frac;
    const r = profiles[c0]!(zEnd0) * (1 - frac) + profiles[c1]!(zEnd1) * frac;
    const targetAng = endAng[c0]! + angleDelta(endAng[c1]!, endAng[c0]!) * frac;
    const theta = theta0 + angleDelta(targetAng, theta0) * smootherstep(u);
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
    baseTaperDeg: design.metrics?.postTaperDeg ?? design.params?.postTaperDeg ?? 4,
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
  let marginColZ: Float32Array | undefined;
  if (margin && margin.length >= 9) {
    const mCount = Math.floor(margin.length / 3);
    marginColZ = new Float32Array(mCount);
    for (let col = 0; col < mCount; col += 1) {
      const z = margin[col * 3 + 2]!;
      marginColZ[col] = z;
      if (z < marginMin) marginMin = z;
      marginMean += z;
    }
    marginMean /= mCount;
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

function buildOpposingClearanceProbe(
  opposingGeometry: THREE.BufferGeometry | null | undefined,
  fixture: DirectEditFixture,
  zone: Zone,
): OpposingClearanceProbe | null {
  if (!opposingGeometry) return null;
  const pos = opposingGeometry.getAttribute("position");
  if (!pos || pos.count < 3) return null;
  const pose = fixture.fixturePose;
  const ox = pose.origin[0] ?? 0;
  const oy = pose.origin[1] ?? 0;
  const oz = pose.origin[2] ?? 0;
  const toLocalPt = (wx: number, wy: number, wz: number): [number, number, number] => {
    const dx = wx - ox;
    const dy = wy - oy;
    const dz = wz - oz;
    return [
      dx * (pose.hexX[0] ?? 1) + dy * (pose.hexX[1] ?? 0) + dz * (pose.hexX[2] ?? 0),
      dx * (pose.hexY[0] ?? 0) + dy * (pose.hexY[1] ?? 1) + dz * (pose.hexY[2] ?? 0),
      dx * (pose.axis[0] ?? 0) + dy * (pose.axis[1] ?? 0) + dz * (pose.axis[2] ?? 1),
    ];
  };

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
  const helper: [number, number, number] = Math.abs(up[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let ux = helper[1] * up[2] - helper[2] * up[1];
  let uy = helper[2] * up[0] - helper[0] * up[2];
  let uz = helper[0] * up[1] - helper[1] * up[0];
  const uLen = Math.hypot(ux, uy, uz) || 1;
  ux /= uLen;
  uy /= uLen;
  uz /= uLen;
  const u: [number, number, number] = [ux, uy, uz];
  const v: [number, number, number] = [
    up[1] * uz - up[2] * uy,
    up[2] * ux - up[0] * uz,
    up[0] * uy - up[1] * ux,
  ];

  const step = 0.15;
  const halfSpan = 8.4;
  const minU = -halfSpan;
  const minV = -halfSpan;
  const cols = Math.round((halfSpan * 2) / step) + 1;
  const rows = cols;
  const grid = new Float32Array(cols * rows).fill(Infinity);

  const index = opposingGeometry.getIndex();
  const triCount = Math.floor((index ? index.count : pos.count) / 3);
  const maxR2 = 16.5 * 16.5;
  const minH = (zone.meanMarginZ ?? zone.marginZ) * up[2] + 0.8;
  const maxH = minH + 17.5;
  let written = 0;

  for (let t = 0; t < triCount; t += 1) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    const x0 = pos.getX(i0), y0 = pos.getY(i0), z0 = pos.getZ(i0);
    const x1 = pos.getX(i1), y1 = pos.getY(i1), z1 = pos.getZ(i1);
    const x2 = pos.getX(i2), y2 = pos.getY(i2), z2 = pos.getZ(i2);
    if (
      (x0 - ox) ** 2 + (y0 - oy) ** 2 + (z0 - oz) ** 2 > maxR2 &&
      (x1 - ox) ** 2 + (y1 - oy) ** 2 + (z1 - oz) ** 2 > maxR2 &&
      (x2 - ox) ** 2 + (y2 - oy) ** 2 + (z2 - oz) ** 2 > maxR2
    ) {
      continue;
    }
    const a = toLocalPt(x0, y0, z0);
    const b = toLocalPt(x1, y1, z1);
    const c = toLocalPt(x2, y2, z2);
    const ah = a[0] * up[0] + a[1] * up[1] + a[2] * up[2];
    const bh = b[0] * up[0] + b[1] * up[1] + b[2] * up[2];
    const ch = c[0] * up[0] + c[1] * up[1] + c[2] * up[2];
    if (Math.max(ah, bh, ch) < minH || Math.min(ah, bh, ch) > maxH) continue;

    const au = a[0] * u[0] + a[1] * u[1] + a[2] * u[2];
    const av = a[0] * v[0] + a[1] * v[1] + a[2] * v[2];
    const bu = b[0] * u[0] + b[1] * u[1] + b[2] * u[2];
    const bv = b[0] * v[0] + b[1] * v[1] + b[2] * v[2];
    const cu = c[0] * u[0] + c[1] * u[1] + c[2] * u[2];
    const cv = c[0] * v[0] + c[1] * v[1] + c[2] * v[2];

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
  if (written === 0) return null;

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
    if (sampleVertices.length === 0) return null;
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
      const py = positions[o + 1]!;
      const pz = positions[o + 2]!;
      checkPoint(px, py, pz);
      checkPoint(px * 0.75 + apexX * 0.25, py * 0.75 + apexY * 0.25, pz * 0.75 + apexZ * 0.25);
      checkPoint((px + apexX) * 0.5, (py + apexY) * 0.5, (pz + apexZ) * 0.5);
    }
    if (!Number.isFinite(best) || best >= 15) return null;
    return best;
  };

  return { up, u, v, minU, minV, step, cols, rows, grid, measureMinClearance };
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

/** 임플란트 로컬 Z축을 따르는 단일 계단형 닫힌 스크류 채널 절삭 입체. */
function screwChannelCutterSoup(
  rBot: number,
  rTop: number,
  zBot: number,
  zTop: number,
  segments = 64,
): Float32Array {
  const seatZ0 = 0.8;
  const seatZ1 = 1.3;
  const rings: Array<[number, number]> = [
    [rBot, zBot],
    [rBot, seatZ0],
    [rTop, seatZ1],
    [rTop, zTop],
  ];
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
    put(rBot * c1, rBot * s1, zBot);
    put(rBot * c0, rBot * s0, zBot);
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
    put(rTop * c0, rTop * s0, zTop);
    put(rTop * c1, rTop * s1, zTop);
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

export function makeGumball(tooth: string) {
  const group = new THREE.Group();
  group.name = "abutment-gumball";
  group.userData.tooth = tooth;
  group.frustumCulled = false;

  // 화면 정렬 검볼(X=화면 오른쪽, Y=화면 위, Z=화면 밖):
  // Z 방향 모서리 고리·평면이 앞쪽(z>0)에서 스케일 네모 판정을 가로채지 않도록 화면 평면(XY) 안에 비겹침 배치한다.
  for (const axis of [0, 1] as const) {
    const color = AXIS_COLOR[axis]!;
    const mat = basicMat(color);
    const shaft = tagHandle(
      new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.44, 12), mat),
      "move",
      axis,
      -1,
      mat,
    );
    alongAxis(shaft, axis, 0.82);
    const head = tagHandle(new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.28, 14), mat), "move", axis, -1, mat);
    alongAxis(head, axis, 1.15);
    const hit = tagHandle(
      new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.68, 10), basicMat(0xffffff, 0)),
      "move",
      axis,
      -1,
      mat,
    );
    alongAxis(hit, axis, 0.96);

    const scaleMat = basicMat(color);
    const box = tagHandle(
      new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.17, 0.08), scaleMat),
      "scale",
      axis,
      -1,
      scaleMat,
    );
    box.position.set(axis === 0 ? 0.47 : 0, axis === 1 ? 0.47 : 0, 0.02);
    box.renderOrder = 46;
    const scaleHit = tagHandle(
      new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.18), basicMat(0xffffff, 0)),
      "scale",
      axis,
      -1,
      scaleMat,
    );
    scaleHit.position.copy(box.position);
    group.add(shaft, head, hit, box, scaleHit);
  }

  // 파란 화면 평면 회전 호: 초록 축(90°) 왼쪽(104°~216°)에 놓아 노란 면 스케일 네모(45°)·축 스케일 네모와 완전히 분리한다.
  const arcColor = AXIS_COLOR[2]!;
  const arcMat = basicMat(arcColor);
  const arcSpan = (112 * Math.PI) / 180;
  const arcStart = (104 * Math.PI) / 180;
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

  // 노란 평면 스케일 네모(화면 가로·세로 동시 스케일): 1사분면(0.41, 0.41)에 배치하고 BoxGeometry 히트박스로 양면 판정을 보장한다.
  const planeMat = basicMat(0xf5d90a, 0.94);
  planeMat.side = THREE.DoubleSide;
  const quad = tagHandle(new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.21), planeMat), "scale2", 0, 1, planeMat);
  quad.position.set(0.41, 0.41, 0.02);
  quad.renderOrder = 47;
  const quadHit = tagHandle(
    new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.18), basicMat(0xffffff, 0)),
    "scale2",
    0,
    1,
    planeMat,
  );
  quadHit.position.copy(quad.position);
  group.add(quad, quadHit);

  const ringMat = basicMat(0xf8fafc);
  const ring = tagHandle(new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.036, 8, 28), ringMat), "scale3", 0, -1, ringMat);
  const ringHit = tagHandle(
    new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.062, 6, 22), basicMat(0xffffff, 0)),
    "scale3",
    0,
    -1,
    ringMat,
  );
  const centerMat = basicMat(0xe2e8f0);
  const center = tagHandle(new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), centerMat), "center", 0, -1, centerMat);
  const centerHit = tagHandle(
    new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10), basicMat(0xffffff, 0)),
    "center",
    0,
    -1,
    centerMat,
  );
  group.add(ring, ringHit, center, centerHit);
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
    if (h.op === "scale" || h.op === "scale2" || h.op === "center") return 0;
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

export class AbutmentDirectEditSession {
  private readonly views = new Map<string, ToothView>();
  private readonly edits = new Map<string, AbutmentEdit>();
  private history: Array<{ tooth: string; before: AbutmentEdit; after: AbutmentEdit }> = [];
  private future: Array<{ tooth: string; before: AbutmentEdit; after: AbutmentEdit }> = [];
  private readonly stale = new Set<string>();
  private drag: Drag | null = null;
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
    const step = this.history.pop();
    if (!step) return;
    this.future.push(step);
    this.edits.set(step.tooth, cloneAbutmentEdit(step.before));
    this.show(step.tooth, true);
    this.bridge.onHistory();
  }

  redo() {
    const step = this.future.pop();
    if (!step) return;
    this.history.push(step);
    this.edits.set(step.tooth, cloneAbutmentEdit(step.after));
    this.show(step.tooth, true);
    this.bridge.onHistory();
  }

  /** 선택 치아, 없으면 편집된 치아 전부를 초기 제안으로 되돌린다. */
  reset(tooth?: string | null) {
    const teeth = tooth
      ? [tooth]
      : [...this.edits.keys()].filter((key) => !editsEqual(this.edits.get(key) ?? EMPTY_EDIT, EMPTY_EDIT));
    let changed = false;
    for (const key of teeth) {
      const before = this.edits.get(key);
      if (!before || editsEqual(before, EMPTY_EDIT)) continue;
      this.pushHistory(key, before, identityAbutmentEdit());
      this.edits.set(key, identityAbutmentEdit());
      this.show(key, true);
      changed = true;
    }
    if (changed) this.bridge.onHistory();
  }

  clear(teeth: readonly string[]) {
    const drop = new Set(teeth);
    for (const tooth of teeth) this.edits.delete(tooth);
    this.history = this.history.filter((step) => !drop.has(step.tooth));
    this.future = this.future.filter((step) => !drop.has(step.tooth));
    for (const tooth of teeth) this.stale.add(tooth);
    this.bridge.onHistory();
  }

  /** 재생성된 치아에 이미 반영된 높이·크기 스케일만 검볼 누적분에서 빼 이중 적용을 막는다. */
  clearBakedScaleAndHeight(teeth: readonly string[]) {
    const drop = new Set(teeth);
    for (const tooth of teeth) {
      const cur = this.edits.get(tooth);
      if (!cur) continue;
      const next = cloneAbutmentEdit(cur);
      next.heightMm = 0;
      next.scale = [1, 1, 1];
      if (editsEqual(next, EMPTY_EDIT)) {
        this.edits.delete(tooth);
      } else {
        this.edits.set(tooth, next);
      }
    }
    const prevLen = this.history.length + this.future.length;
    this.history = this.history.filter((step) => !drop.has(step.tooth));
    this.future = this.future.filter((step) => !drop.has(step.tooth));
    if (this.history.length + this.future.length !== prevLen) {
      this.bridge.onHistory();
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
      const preservedEdit =
        rebuilt && !wasStale ? this.edits.get(design.toothNumber) : undefined;
      if (rebuilt && wasStale) {
        const had =
          this.edits.has(design.toothNumber) ||
          this.history.some((step) => step.tooth === design.toothNumber) ||
          this.future.some((step) => step.tooth === design.toothNumber);
        this.edits.delete(design.toothNumber);
        this.history = this.history.filter((step) => step.tooth !== design.toothNumber);
        this.future = this.future.filter((step) => step.tooth !== design.toothNumber);
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
        zone,
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
    for (const [tooth, view] of this.views) {
      const mesh = this.bridge.getAbutment(tooth);
      const visible = !!mesh && mesh.visible && this.bridge.ui.visible[tooth] !== false;
      const edit = this.edits.get(tooth) ?? EMPTY_EDIT;
      const expanded = this.bridge.ui.expanded[tooth] === true;
      view.gumball.visible = show && visible && expanded;
      view.gumball.quaternion.copy(gumballQuat);
      view.gumball.position.copy(this.gumballPosition(view, edit));
      view.gumball.scale.setScalar(worldPerPx * (expanded ? 156 : 132));
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
        if (this.beginHandle(event, handle)) {
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
        this.bridge.onBadge(pending.tooth);
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
        this.edits.set(drag.tooth, drag.start);
        this.show(drag.tooth, true, true);
        this.bridge.onBadge(drag.tooth);
        return;
      }
    }
    if (drag.kind === "sculpt") this.finishSculpt(drag, event);
    const edit = this.edits.get(drag.tooth);
    if (!edit || editsEqual(edit, drag.start)) {
      this.edits.set(drag.tooth, drag.start);
      this.show(drag.tooth, true, true);
      return;
    }
    this.pushHistory(drag.tooth, drag.start, edit);
    this.show(drag.tooth, true);
    this.bridge.onHistory();
  };

  private beginHandle(event: PointerEvent, handle: HandleHit) {
    const view = this.views.get(handle.tooth);
    const camera = this.bridge.getCamera();
    if (!view || !camera || !this.dom) return false;
    if (handle.op === "center") {
      const start = cloneAbutmentEdit(this.editOf(handle.tooth));
      const center = this.gumballPosition(view, start);
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
      };
      return true;
    }
    const start = cloneAbutmentEdit(this.editOf(handle.tooth));
    const center = this.gumballPosition(view, start);
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
        pointerId: event.pointerId,
      };
      this.show(handle.tooth, false);
      return true;
    }
    if (handle.op === "rot") {
      const axis = this.cameraAxis(handle.axis, vC).clone();
      plane.setFromNormalAndCoplanarPoint(axis, center);
      const hit = this.rayOnPlane(event);
      if (!hit) return false;
      this.drag = {
        kind: "rot",
        tooth: handle.tooth,
        axis: handle.axis,
        start,
        startVec: hit.sub(center),
        worldAxis: axis,
        pointerId: event.pointerId,
      };
      this.show(handle.tooth, false);
      return true;
    }
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
    this.drag = {
      kind: "sculpt",
      tooth,
      z: local.z,
      angle: Math.atan2(m, l),
      reach,
      radial: [l / radius, m / radius],
      radius,
      start: cloneAbutmentEdit(this.editOf(tooth)),
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
    const edit = cloneAbutmentEdit(drag.start);
    if (drag.kind === "center") {
      this.viewPlane(drag.startHit);
      const hit = this.rayOnPlane(event);
      if (!hit) return;
      const delta = hit.sub(drag.startHit);
      applyWorldDeltaToAbutmentEdit(edit, delta, view.axes);
    } else if (drag.kind === "move" || drag.kind === "scale") {
      const axis = drag.axisWorld;
      const center = this.gumballPosition(view, drag.start);
      this.axisPlane(axis, center);
      const hit = this.rayOnPlane(event);
      if (!hit) return;
      const along = hit.sub(center).dot(axis);
      const delta = along - drag.startAlong;
      if (drag.kind === "move") {
        vB.copy(axis).multiplyScalar(delta);
        applyWorldDeltaToAbutmentEdit(edit, vB, view.axes);
      } else {
        const refSpan = Math.max(Math.abs(drag.startAlong), 0.25);
        const factor = clamp(1 + delta / refSpan, 0.4, 2.2);
        this.scaleAlong(edit, drag.start, view, axis, factor);
      }
    } else if (drag.kind === "rot") {
      const center = this.gumballPosition(view, drag.start);
      plane.setFromNormalAndCoplanarPoint(drag.worldAxis, center);
      const hit = this.rayOnPlane(event);
      if (!hit) return;
      const cur = hit.sub(center);
      const angle = Math.atan2(vA.crossVectors(drag.startVec, cur).dot(drag.worldAxis), drag.startVec.dot(cur));
      const deg = (angle * 180) / Math.PI;
      applyWorldRotationToAbutmentEdit(edit, drag.worldAxis, deg, view.axes);
    } else if (drag.kind === "scale2" || drag.kind === "scale3") {
      const center = this.gumballPosition(view, drag.start);
      this.viewPlane(center);
      const hit = this.rayOnPlane(event);
      if (!hit) return;
      const proj = hit.sub(center).dot(drag.startRadialDir);
      const factor = clamp(proj / Math.max(drag.startRadialLen, 0.2), 0.4, 2.2);
      if (drag.kind === "scale3") {
        edit.scale[0] = drag.start.scale[0] * factor;
        edit.scale[1] = drag.start.scale[1] * factor;
        edit.scale[2] = drag.start.scale[2] * factor;
      } else {
        const a = this.cameraAxis(drag.axis, vB).clone();
        const b = drag.axis2 >= 0 ? this.cameraAxis(drag.axis2, vC).clone() : null;
        this.scaleAxes(edit, drag.start, view, b ? [a, b] : [a], factor);
      }
    } else if (drag.kind === "sculpt") {
      this.previewSculpt(drag, event, view, edit);
    } else {
      return;
    }
    clampAbutmentEdit(edit, view.zone.span);
    this.edits.set(drag.tooth, edit);
    this.show(drag.tooth, false);
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
    if (view.proposalMargin) {
      marginLocal = new Float32Array(view.proposalMargin.length);
      refitLocalPositions(
        view.proposalMargin,
        { ...edit, partial: [] },
        { ...view.zone, screwR: 0 },
        marginLocal,
        0,
      );
    }
    let measured = this.summary;
    let autoLiftMm = cached ? view.lastAutoLiftMm : 0;
    if (!cached) {
      measured = refitLocalPositions(previewSrc, edit, previewZone, local, 0);
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
          measured = refitLocalPositions(previewSrc, edit, previewZone, local, autoLiftMm);
        }
      }
      view.lastAutoLiftMm = autoLiftMm;
      this.summary = measured;
      if (marginLocal && view.proposalMargin && cuffNeedsRegen(edit)) {
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
    this.moveBadge(mesh, this.gumballPosition(view, edit), view.gumball.visible);
  }

  private publishShape(summary: AbutmentEditSummary, bake: boolean) {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (!bake && now - this.shapeAt < 90) return;
    this.shapeAt = now;
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
    const postSpan = Math.max(view.topZ - view.zone.fixedZ, 1.5);
    let measured: EditedAbutmentMetrics | null = null;
    let baselineMeasured = view.baselineMeasure;
    if (marginLocal && view.proposalMargin) {
      const proposalSurface = view.proposalSolid ?? view.proposal;
      if (!baselineMeasured) {
        baselineMeasured = measureEditedAbutment(proposalSurface, view.proposalMargin, view.proposalCrown);
        if (baselineMeasured && view.oppProbe && view.topSampleVertices.length > 0) {
          const baseClear = view.oppProbe.measureMinClearance(proposalSurface, view.topSampleVertices);
          if (baseClear != null) {
            baselineMeasured.occlusalClearanceMm = Math.max(0, Math.round(baseClear * 100) / 100);
          }
        }
        view.baselineMeasure = baselineMeasured;
      }
      const savedSolid = design.solidBodyLocalPositions;
      const surface =
        cached && savedSolid && savedSolid.length >= 9 ? savedSolid : local;
      measured = measureEditedAbutment(surface, marginLocal, crownLocal ?? view.proposalCrown);
      if (
        measured &&
        view.oppProbe &&
        view.topSampleVertices.length > 0 &&
        surface.length === proposalSurface.length
      ) {
        const liveClear = view.oppProbe.measureMinClearance(surface, view.topSampleVertices);
        if (liveClear != null) {
          measured.occlusalClearanceMm = Math.max(0, Math.round(liveClear * 100) / 100);
        }
      }
    }
    return {
      tooth: design.toothNumber,
      widthRatio: fit.widthRatio,
      heightDeltaMm: fit.heightDeltaMm,
      yawDeg: edit.yawDeg,
      shiftLabialMm: edit.shiftLabialMm + Math.tan((edit.tiltLabialDeg * Math.PI) / 180) * postSpan,
      shiftMesialMm: edit.shiftMesialMm + Math.tan((edit.tiltMesialDeg * Math.PI) / 180) * postSpan,
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
        );
        if (marginLocal && view.proposalMargin && cuffNeedsRegen(edit)) {
          regenerateCuffToMargin(view.proposalSolid, solidOut, view.proposalMargin, marginLocal, view.zone);
        }
      }
      design.solidBodyLocalPositions = solidOut;
      const conn = design.fixture.connectionSpec;
      const l2 = conn?.l2Mm ?? 2.75;
      const zBot = -l2;
      const boreTopR = (conn?.screwUpperDiameterMm ?? 2.45) / 2;
      const boreBotR = (conn?.screwLowerDiameterMm ?? boreTopR * 0.85) / 2;
      let zTopMax = -Infinity;
      for (let i = 2; i < solidOut.length; i += 3) zTopMax = Math.max(zTopMax, solidOut[i]!);
      const cutter = screwChannelCutterSoup(boreBotR, boreTopR, zBot - 1, zTopMax + 3);
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
          refitLocalPositions(view.proposal, edit, view.zone, fallback, view.lastAutoLiftMm);
          if (marginLocal && view.proposalMargin && cuffNeedsRegen(edit)) {
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

  private editOf(tooth: string) {
    let edit = this.edits.get(tooth);
    if (!edit) {
      edit = identityAbutmentEdit();
      this.edits.set(tooth, edit);
    }
    return edit;
  }

  private pushHistory(tooth: string, before: AbutmentEdit, after: AbutmentEdit) {
    this.history.push({ tooth, before: cloneAbutmentEdit(before), after: cloneAbutmentEdit(after) });
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
    const meanM = view.zone.meanMarginZ ?? view.zone.marginZ;
    const postSpan = Math.max(view.topZ - meanM, 0.8);
    const hAbove = Math.max(view.midZ - meanM, 0);
    const uLean = hAbove > 0 ? clamp(((hAbove * hAbove) / (hAbove + 0.12)) / postSpan, 0, 1.15) : 0;
    const { topLeanL, topLeanM } = computeSafePostTopLean(
      edit,
      view.zone,
      view.topZ,
      view.zone.centerL ?? 0,
      view.zone.centerM ?? 0,
    );
    const offL = edit.shiftLabialMm + topLeanL * uLean;
    const offM = edit.shiftMesialMm + topLeanM * uLean;
    const uPost = hAbove > 0 ? clamp(hAbove / postSpan, 0, 1) : 0;
    const zLift =
      computeZLift(view.midZ, view.zone.fixedZ, view.zone.marginZ, view.topZ, edit) +
      view.lastAutoLiftMm * uPost;
    return view.anchor
      .clone()
      .addScaledVector(view.axes[0], offL)
      .addScaledVector(view.axes[1], offM)
      .addScaledVector(view.axes[2], zLift);
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
      el.style.pointerEvents = gumballOn ? "none" : "auto";
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
