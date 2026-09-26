// 기공소 AI 보철 — 상악·하악·바이트를 저장된 좌표 그대로 겹쳐 본다.
// - 2026-09-26: 지대치는 불투명, 대합·바이트는 투명. 기본 뷰는 화면에 맞춘다.
// - 2026-09-26: 교합면·협측·설측, 대합 접촉 색, 삽입 방향 언더컷.
// - 2026-09-26: 열릴 때 의뢰 치아 교합면을 화면 중앙에 둔다. 치아번호 뱃지는 그 좌표에 붙는다.
// - 2026-09-26: 파싱 결과는 메모리에 두고, 교합·언더컷 거리는 켤 때만 계산한다.
// - 2026-09-26: 역할만 바뀌면 메시를 다시 읽지 않고 색·대합을 다시 계산한다.
// - 2026-09-26: 삽입축은 보철마다 화면과 수직으로 잡고, 화살표와 고리로 표시한다.
// - 2026-09-26: 삽입축 표시는 토글. 새로 잡으면 치아 위쪽에 두고 화살표 끝이 표면에 닿는다.
// - 2026-09-26: 삽입축은 화면 중앙 광선이다. 치아 추정 좌표가 아니라 그 광선이 닿는 면에 둔다.
// - 2026-09-26: 삽입축을 잡으면 그 보철의 치아 추정 좌표를 같은 점으로 옮긴다.
// - 2026-09-26: 정중앙 점선은 토글로 켠다. 가로·세로는 화면 한가운데를 지난다.
// - 2026-09-26: 삽입축은 치아에서 2mm 띄운다. 치아번호는 윗단 고리 중심에 둔다.
// - 2026-09-26: 처음 카메라는 지대치 교합면과 인접치 하나씩. 그 자세를 초기 뷰로 둔다.
// - 2026-09-26: 열릴 때 화면 중심은 모델 중심이다. 삽입축은 사용자가 맞춘 화면 중앙으로 잡는다.
// - 2026-09-26: 양악이면 악궁 사이가 교합면이고, 한쪽만 있으면 바운딩박스에서 아이보리색 치아가 몰린 축에 수직으로 본다.
// - 2026-09-26: 삽입축을 잡으면 치아·잇몸 색이 갈라지는 곳을 마진으로 잡는다.
// - 2026-09-26: 마진은 기본 원보다 바깥을, 삽입축으로 스캔 면에 붙여 잡는다.
// - 2026-09-26: 바이트와 상·하악이 어긋나면 바이트에 맞춰 움직이고, 교합면 중심에 원점을 둔다.
// - 2026-09-26: 수동 정렬은 고른 악과 바이트만 좌우로 두고, 점 3개씩으로 근처 대응점을 잡아 붙인다.
// - 2026-09-26: 수동 정렬의 두 모델은 화면 가운데에 좁은 간격으로 나란히 둔다.
// - 2026-09-26: 화면 오른쪽·앞쪽에 방향광을 더해 악궁 양쪽이 같이 밝다.
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";

import { ScreenSpaceOrbitControls } from "@/shared/three/screenSpaceOrbitControls";
import {
  applyScanColorToneMapping,
  createModelPreviewMaterial,
  isScanColorPreview,
  parseModelPreview,
  SCAN_COLOR_PREVIEW_BACKGROUND,
} from "@/shared/files/modelPreviewFile";
import type { LabOralScanRole } from "@/shared/practice/labProsthesisAiDesign";
import {
  contactColorRgb,
  createScanPointIndex,
  geometryUnitsToMm,
  isUndercutAlignment,
  UNDERCUT_RGB,
  type ContactPaintMode,
} from "@/shared/practice/oralScanDesignAnalysis";
import {
  mergeArchToBiteByPoints,
  registerJawsToBite,
} from "@/shared/practice/biteRegistration";
import type {
  DesignGesture,
  ProsthesisDesignEdit,
} from "@/shared/practice/labProsthesisModify";
import {
  detectProjectedColorMargin,
  PROJECTED_MARGIN_TRIANGLE_STRIDE,
} from "@/shared/practice/detectColorMargin";
import {
  buildProsthesisEditLayer,
  readEditHit,
  type EditHit,
} from "@/shared/components/practice/labProsthesisEditLayer";
import { cn } from "@/shared/ui/cn";

export type OralScanViewPreset = "fit" | "occlusal" | "buccal" | "lingual";

export type OralScanOverlayHandle = {
  setView: (preset: OralScanViewPreset) => void;
  /** 의뢰 치아 교합면을 화면 중앙에 다시 맞춘다. */
  focusTooth: (toothNumber: string) => void;
  /**
   * 이 치아의 삽입축을 잡았던 카메라로 되돌린다.
   * 방향·각도·줌이 그때와 같다. 잡은 축이 없으면 false.
   */
  restoreInsertionView: (toothNumbers: readonly string[]) => boolean;
  saveImage: () => void;
  /**
   * 화면 중앙을 지나는, 화면과 수직인 방향을 이 치아들의 삽입축으로 잡는다.
   * 화살표 끝은 그 광선이 닿는 면에서 2mm 띄우고, 치아 추정 좌표는 그 면에 둔다.
   * 같은 치아 묶음이면 방향을 다시 잡고, 다른 보철 축은 유지한다.
   */
  setInsertionFromView: (toothNumbers: readonly string[]) => boolean;
  /**
   * 이 치아들의 스캔 칼라에서 마진을 고른다.
   * 기본 원보다 넓은 고리를 삽입축으로 스캔 면에 붙여 본다. 색 경계가 없으면 빈 배열.
   */
  detectColorMargins: (
    toothNumbers: readonly string[],
  ) => Array<{ tooth: string; radii: number[]; depths: number[] }>;
  /** 모달을 열었을 때의 교합면 카메라로 되돌린다. */
  resetHomeView: () => void;
  /** 파일 좌표에서 상악·하악을 바이트에 다시 맞춘다. 붙으면 true. */
  alignToBiteAuto: () => Promise<boolean>;
  /** 수동 정렬에서 찍은 점을 지운다. */
  clearAlignPicks: () => void;
};

export type OralScanToothBadge = {
  toothNumber: string;
  active?: boolean;
};

export type OralScanOverlaySource = {
  id: string;
  fileName: string;
  role: LabOralScanRole;
  file: File;
  companionFiles?: File[] | null;
};

type Props = {
  items: OralScanOverlaySource[];
  visible: Record<string, boolean>;
  colorMapping: boolean;
  /** 0–1. 대합악·바이트에 적용. 지대치 악은 항상 불투명. */
  ghostOpacity: number;
  /** 주문 치아가 있는 악. 반대악이 대합. */
  prepArch?: "upper" | "lower" | "both" | null;
  /** 이 FDI 치아들을 교합면 화면 중앙에 확대해 연다. */
  focusToothNumbers?: readonly string[];
  /** 교합면 3D 좌표에 붙는 치아번호. 모델을 돌리면 같이 움직인다. */
  toothBadges?: readonly OralScanToothBadge[];
  onSelectTooth?: (toothNumber: string) => void;
  /** 대합까지 거리를 색으로 칠한다. */
  contactMap?: boolean;
  /** 삽입 방향 언더컷을 붉게 칠한다. */
  undercutMap?: boolean;
  /** 교합 간격 목표(mm). */
  occlusalGapMm?: number;
  contactMode?: ContactPaintMode;
  /** 법선·삽입축 내적. 이 값보다 크면 언더컷. */
  undercutLimit?: number;
  busy?: boolean;
  busyLabel?: string;
  onScanColorChange?: (hasScanColor: boolean) => void;
  /** 삽입축 화살표가 켜지거나 꺼질 때. */
  onInsertionAxisChange?: (active: boolean) => void;
  /** 삽입축 방향을 손보고 손을 뗐을 때. 그 치아 번호. */
  onInsertionAxisAimed?: (toothNumbers: readonly string[]) => void;
  /** 잡은 삽입축을 작업 영역에 그릴지. */
  showInsertionAxis?: boolean;
  /** 화면 정중앙의 가로·세로 점선. */
  showCenterGuides?: boolean;
  /** 마진·보철 수정. 없으면 그리지 않는다. */
  designEdit?: ProsthesisDesignEdit | null;
  onDesignGesture?: (gesture: DesignGesture) => void;
  /**
   * 수동 정렬. 이 악과 바이트만 좌우로 보여 점을 찍는다.
   * 없으면 평소 뷰.
   */
  manualAlignArch?: "upper" | "lower" | null;
  onAlignProgress?: (picks: { model: number; bite: number }) => void;
  onAlignMerged?: (arch: "upper" | "lower") => void;
  onAlignFailed?: () => void;
  className?: string;
};

type LoadedMesh = {
  id: string;
  role: LabOralScanRole;
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  texture: THREE.Texture | null;
  hasColor: boolean;
  /** 로드 때 붙어 있던 스캔 칼라. 분석 색을 깔 때 치워 둔다. */
  scanColor: THREE.BufferAttribute | null;
  /** 기하 단위. 대합이 없으면 null. */
  dist: Float32Array | null;
  /** 법선·삽입축. 지대치가 아니면 null. */
  align: Float32Array | null;
  analysisColor: THREE.BufferAttribute | null;
  /** 스캔 파일 좌표. 역할을 바꾸면 여기로 되돌린 뒤 다시 맞춘다. */
  basePositions: Float32Array;
  /** 파일을 열었을 때의 좌표. 자동 정렬은 여기로 되돌린 뒤 다시 맞춘다. */
  filePositions: Float32Array;
};

type SnapAnim = {
  start: number;
  duration: number;
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromUp: THREE.Vector3;
  toUp: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromZoom: number;
  toZoom: number;
  fromLeft?: number;
  toLeft?: number;
  fromRight?: number;
  toRight?: number;
  fromTop?: number;
  toTop?: number;
  fromBottom?: number;
  toBottom?: number;
};

type SavedCameraView = {
  position: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
  zoom: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const ROLE_COLOR: Record<LabOralScanRole, number> = {
  upper: 0x3b82f6,
  lower: 0xe39a3c,
  bite: 0x14b8a6,
  other: 0x94a3b8,
};

const HOME_DIR = new THREE.Vector3(0.42, -1, 0.68);
const HOME_UP = new THREE.Vector3(0, 0, 1);
const FIT_MARGIN = 1.03;
/** 삽입축 화살표·레전드. amber-500 */
const INSERTION_AXIS_COLOR = 0xf59e0b;
/** 화살표 끝과 치아 표면 사이. */
const INSERTION_CLEARANCE_MM = 2;

function disposeObject3D(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const mat = mesh.material;
    if (Array.isArray(mat)) {
      for (const row of mat) materials.add(row);
    } else if (mat) materials.add(mat);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

function mmToGeometry(mm: number, unitToMm: number) {
  return mm / Math.max(unitToMm, 1e-9);
}

function insertionMarkerMetrics(radius: number) {
  const span = Math.max(radius, 1);
  const length = span * 2.15;
  const headLen = length * 0.34;
  return {
    span,
    length,
    headLen,
    shaftLen: length - headLen,
    shaftR: Math.max(span * 0.07, length * 0.02),
  };
}

/** 윗단 고리 중심. 화살표 끝은 표면에서 2mm, 고리는 그 위쪽이다. */
function insertionRingCenter(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  radius: number,
  unitToMm: number,
) {
  const direction = dir.clone().normalize();
  const { length } = insertionMarkerMetrics(radius);
  const clearance = mmToGeometry(INSERTION_CLEARANCE_MM, unitToMm);
  return origin.clone().addScaledVector(direction, -(clearance + length));
}

/**
 * 삽입 방향으로 화살표와, 그 축에 수직인 고리.
 * `contact`는 치아 표면. 화살표 끝은 거기서 화면 쪽으로 2mm 떨어진다.
 */
function buildInsertionMarker(
  contact: THREE.Vector3,
  radius: number,
  dir: THREE.Vector3,
  key: string,
  unitToMm: number,
) {
  const direction = dir.clone().normalize();
  const { span, length, headLen, shaftLen, shaftR } = insertionMarkerMetrics(radius);
  const tip = contact
    .clone()
    .addScaledVector(direction, -mmToGeometry(INSERTION_CLEARANCE_MM, unitToMm));
  const material = new THREE.MeshBasicMaterial({
    color: INSERTION_AXIS_COLOR,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.92,
    toneMapped: false,
  });
  const group = new THREE.Group();
  const align = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction,
  );
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(shaftR * 2.4, headLen, 20),
    material,
  );
  head.quaternion.copy(align);
  head.position.copy(tip).addScaledVector(direction, -headLen / 2);
  head.userData.editHit = { kind: "insertion", key } satisfies EditHit;
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(shaftR, shaftR, shaftLen, 16),
    material,
  );
  shaft.quaternion.copy(align);
  shaft.position
    .copy(tip)
    .addScaledVector(direction, -(headLen + shaftLen / 2));
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(span * 0.72, span * 0.98, 48),
    material,
  );
  ring.position.copy(tip).addScaledVector(direction, -length);
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
  for (const mesh of [shaft, head, ring]) {
    mesh.renderOrder = 20;
    mesh.frustumCulled = false;
  }
  group.add(shaft, head, ring);
  return group;
}

/** 화면 정중앙 광선. 방향은 카메라가 보는 쪽이고, 점은 처음 닿는 표면. */
function viewCenterHit(
  camera: THREE.Camera,
  meshes: THREE.Object3D[],
): { dir: THREE.Vector3; point: THREE.Vector3 | null } {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const dir = raycaster.ray.direction.clone();
  if (dir.lengthSq() < 1e-8) dir.set(0, 0, -1);
  else dir.normalize();
  const point =
    meshes.length > 0
      ? (raycaster.intersectObjects(meshes, false)[0]?.point.clone() ?? null)
      : null;
  return { dir, point };
}

/** 화면 쪽에서 치아 중심으로 쏴, 카메라가 보는 표면점을 고른다. */
function rayToothContact(
  center: THREE.Vector3,
  dir: THREE.Vector3,
  radius: number,
  meshes: THREE.Object3D[],
): THREE.Vector3 | null {
  if (meshes.length === 0) return null;
  const direction = dir.clone().normalize();
  if (direction.lengthSq() < 1e-8) return null;
  const reach = Math.max(radius * 14, 48);
  const start = center.clone().addScaledVector(direction, -reach);
  const raycaster = new THREE.Raycaster(start, direction, 0, reach * 2);
  const hits = raycaster.intersectObjects(meshes, false);
  const limit = Math.max(radius * 0.7, 1.2);
  let best: THREE.Intersection | null = null;
  let bestDist = limit;
  for (const hit of hits) {
    const dist = hit.point.distanceTo(center);
    if (dist < bestDist) {
      best = hit;
      bestDist = dist;
    }
  }
  return best ? best.point.clone() : null;
}

type DentalFrame = {
  up: THREE.Vector3;
  anterior: THREE.Vector3;
  right: THREE.Vector3;
};

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function samplePositions(geometry: THREE.BufferGeometry, cap: number) {
  const pos = geometry.getAttribute("position");
  const out: Array<[number, number, number]> = [];
  if (!pos || pos.count === 0) return out;
  const stride = Math.max(1, Math.floor(pos.count / cap));
  for (let i = 0; i < pos.count; i += stride) {
    out.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
  }
  return out;
}

function meanVec(points: Array<[number, number, number]>): THREE.Vector3 | null {
  if (points.length === 0) return null;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
    z += p[2];
  }
  const n = points.length;
  return new THREE.Vector3(x / n, y / n, z / n);
}

/** 상악·하악 중심 차이와 치열 형태로 교합 축을 잡는다. 메시 상대 위치는 바꾸지 않는다. */
function estimateDentalFrame(loaded: LoadedMesh[]): DentalFrame | null {
  const upperPts: Array<[number, number, number]> = [];
  const lowerPts: Array<[number, number, number]> = [];
  const archPts: Array<[number, number, number]> = [];
  for (const entry of loaded) {
    if (entry.role !== "upper" && entry.role !== "lower") continue;
    const pts = samplePositions(entry.geometry, 2500);
    archPts.push(...pts);
    if (entry.role === "upper") upperPts.push(...pts);
    else lowerPts.push(...pts);
  }
  if (archPts.length < 30) return null;

  const upperC = meanVec(upperPts);
  const lowerC = meanVec(lowerPts);
  const mean = meanVec(archPts)!;
  let up = new THREE.Vector3();
  if (upperC && lowerC) up.subVectors(upperC, lowerC);
  if (up.lengthSq() < 1e-4) {
    up = smallestPcaAxis(archPts, mean);
  }
  if (up.lengthSq() < 1e-8) return null;
  up.normalize();

  const tangent = Math.abs(up.z) < 0.9
    ? new THREE.Vector3(0, 0, 1)
    : new THREE.Vector3(1, 0, 0);
  const axisA = new THREE.Vector3().crossVectors(up, tangent).normalize();
  const axisB = new THREE.Vector3().crossVectors(up, axisA).normalize();

  let cxx = 0;
  let cxy = 0;
  let cyy = 0;
  const proj: Array<{ a: number; b: number }> = [];
  for (const p of archPts) {
    const dx = p[0] - mean.x;
    const dy = p[1] - mean.y;
    const dz = p[2] - mean.z;
    const a = dx * axisA.x + dy * axisA.y + dz * axisA.z;
    const b = dx * axisB.x + dy * axisB.y + dz * axisB.z;
    proj.push({ a, b });
    cxx += a * a;
    cxy += a * b;
    cyy += b * b;
  }
  const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const lAlong = cxx * ct * ct + 2 * cxy * ct * st + cyy * st * st;
  const lAcross = cxx * st * st - 2 * cxy * ct * st + cyy * ct * ct;
  let major = new THREE.Vector2(ct, st);
  let minor = new THREE.Vector2(-st, ct);
  if (lAcross > lAlong) {
    major = new THREE.Vector2(-st, ct);
    minor = new THREE.Vector2(ct, st);
  }

  const minorScores = proj.map((p) => p.a * minor.x + p.b * minor.y);
  const sorted = [...minorScores].sort((a, b) => a - b);
  const loCut = sorted[Math.floor(sorted.length * 0.1)] ?? sorted[0] ?? 0;
  const hiCut = sorted[Math.floor(sorted.length * 0.9)] ?? sorted[sorted.length - 1] ?? 0;
  const spread = (side: "lo" | "hi") => {
    let n = 0;
    let sum = 0;
    let sum2 = 0;
    for (let i = 0; i < proj.length; i += 1) {
      const score = minorScores[i] ?? 0;
      if (side === "lo" ? score > loCut : score < hiCut) continue;
      const majorScore = (proj[i]?.a ?? 0) * major.x + (proj[i]?.b ?? 0) * major.y;
      sum += majorScore;
      sum2 += majorScore * majorScore;
      n += 1;
    }
    if (n < 2) return 0;
    const avg = sum / n;
    return sum2 / n - avg * avg;
  };
  const loSpread = spread("lo");
  const hiSpread = spread("hi");
  const minor3 = new THREE.Vector3()
    .addScaledVector(axisA, minor.x)
    .addScaledVector(axisB, minor.y)
    .normalize();
  // 좌우로 벌어진 쪽이 구치(원심), 모아진 쪽이 전치(협측이 바라보는 방향).
  const anterior = hiSpread < loSpread ? minor3 : minor3.negate();
  const right = new THREE.Vector3().crossVectors(anterior, up).normalize();
  if (right.lengthSq() < 1e-8) return null;
  return { up, anterior, right };
}

function smallestPcaAxis(
  points: Array<[number, number, number]>,
  mean: THREE.Vector3,
): THREE.Vector3 {
  let xx = 0;
  let yy = 0;
  let zz = 0;
  let xy = 0;
  let xz = 0;
  let yz = 0;
  for (const p of points) {
    const x = p[0] - mean.x;
    const y = p[1] - mean.y;
    const z = p[2] - mean.z;
    xx += x * x;
    yy += y * y;
    zz += z * z;
    xy += x * y;
    xz += x * z;
    yz += y * z;
  }
  const axes = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ];
  const vars = [xx, yy, zz];
  let best = 0;
  if ((vars[1] ?? 0) < (vars[best] ?? 0)) best = 1;
  if ((vars[2] ?? 0) < (vars[best] ?? 0)) best = 2;
  const axis = axes[best] ?? new THREE.Vector3(0, 0, 1);
  if (xy * xy + xz * xz + yz * yz > 1) {
    const candidates = [
      new THREE.Vector3(yy + zz, -xy, -xz),
      new THREE.Vector3(-xy, xx + zz, -yz),
      new THREE.Vector3(-xz, -yz, xx + yy),
    ];
    let pick = candidates[0]!;
    let score = Infinity;
    for (const c of candidates) {
      if (c.lengthSq() < 1e-8) continue;
      const v = xx * c.x * c.x + yy * c.y * c.y + zz * c.z * c.z +
        2 * xy * c.x * c.y + 2 * xz * c.x * c.z + 2 * yz * c.y * c.z;
      if (v < score) {
        score = v;
        pick = c;
      }
    }
    if (pick.lengthSq() > 1e-8) return pick.normalize();
  }
  return axis;
}

function applyDentalFrame(frame: DentalFrame) {
  const { up, anterior } = frame;
  HOME_DIR.copy(anterior).multiplyScalar(-1).addScaledVector(up, 0.62).normalize();
  HOME_UP.copy(up);
}

function captureBasePositions(geometry: THREE.BufferGeometry) {
  const pos = geometry.getAttribute("position");
  if (!pos) return new Float32Array(0);
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    out[i * 3] = pos.getX(i);
    out[i * 3 + 1] = pos.getY(i);
    out[i * 3 + 2] = pos.getZ(i);
  }
  return out;
}

function restoreFilePositions(entry: LoadedMesh) {
  const pos = entry.geometry.getAttribute("position");
  const file = entry.filePositions;
  if (!pos || file.length < pos.count * 3) return;
  for (let i = 0; i < pos.count; i += 1) {
    pos.setXYZ(i, file[i * 3] ?? 0, file[i * 3 + 1] ?? 0, file[i * 3 + 2] ?? 0);
  }
  pos.needsUpdate = true;
  entry.geometry.computeVertexNormals();
  entry.geometry.computeBoundingBox();
  entry.dist = null;
  entry.align = null;
  entry.analysisColor = null;
}

function rememberPositions(entry: LoadedMesh) {
  entry.basePositions = captureBasePositions(entry.geometry);
}

function restoreBasePositions(entry: LoadedMesh) {
  const pos = entry.geometry.getAttribute("position");
  const base = entry.basePositions;
  if (!pos || base.length < pos.count * 3) return;
  for (let i = 0; i < pos.count; i += 1) {
    pos.setXYZ(i, base[i * 3] ?? 0, base[i * 3 + 1] ?? 0, base[i * 3 + 2] ?? 0);
  }
  pos.needsUpdate = true;
  entry.geometry.computeVertexNormals();
  entry.geometry.computeBoundingBox();
  entry.dist = null;
  entry.align = null;
  entry.analysisColor = null;
}

/** 교합면 중심을 원점으로 두고, 위쪽이 상악, 앞이 전치가 되게 돌린다. */
function reseatOcclusalOrigin(loaded: LoadedMesh[], frame: DentalFrame) {
  const upperPts: Array<[number, number, number]> = [];
  const lowerPts: Array<[number, number, number]> = [];
  const archPts: Array<[number, number, number]> = [];
  for (const entry of loaded) {
    if (entry.role !== "upper" && entry.role !== "lower") continue;
    const pts = samplePositions(entry.geometry, 1800);
    archPts.push(...pts);
    if (entry.role === "upper") upperPts.push(...pts);
    else lowerPts.push(...pts);
  }
  const mean = meanVec(archPts);
  if (!mean) return;
  const upperC = meanVec(upperPts);
  const lowerC = meanVec(lowerPts);
  const mid = upperC && lowerC ? upperC.clone().add(lowerC).multiplyScalar(0.5) : mean;
  const up = frame.up.clone().normalize();
  const shift =
    (mean.x - mid.x) * up.x + (mean.y - mid.y) * up.y + (mean.z - mid.z) * up.z;
  const origin = new THREE.Vector3(
    mean.x - up.x * shift,
    mean.y - up.y * shift,
    mean.z - up.z * shift,
  );
  const { right, anterior } = frame;
  if (
    Math.abs(right.dot(anterior)) > 0.02 ||
    Math.abs(right.dot(up)) > 0.02 ||
    Math.abs(anterior.dot(up)) > 0.02 ||
    Math.abs(right.length() - 1) > 0.02 ||
    Math.abs(anterior.length() - 1) > 0.02 ||
    Math.abs(up.length() - 1) > 0.02
  ) {
    return;
  }
  const matrix = new THREE.Matrix4().set(
    right.x,
    right.y,
    right.z,
    -right.dot(origin),
    anterior.x,
    anterior.y,
    anterior.z,
    -anterior.dot(origin),
    up.x,
    up.y,
    up.z,
    -up.dot(origin),
    0,
    0,
    0,
    1,
  );
  for (const entry of loaded) {
    entry.geometry.applyMatrix4(matrix);
    entry.geometry.computeBoundingBox();
  }
}

type AnalysisLook = {
  contactMap: boolean;
  undercutMap: boolean;
  occlusalGapMm: number;
  contactMode: ContactPaintMode;
  undercutLimit: number;
};

function paintAnalysisColors(
  entry: LoadedMesh,
  look: AnalysisLook,
  unitToMm: number,
): boolean {
  const showContact = look.contactMap && entry.dist != null;
  const showUndercut = look.undercutMap && entry.align != null;
  if (!showContact && !showUndercut) {
    if (entry.scanColor) entry.geometry.setAttribute("color", entry.scanColor);
    else entry.geometry.deleteAttribute("color");
    return false;
  }
  const pos = entry.geometry.getAttribute("position");
  const count = pos?.count ?? 0;
  if (!count) return false;
  if (!entry.analysisColor || entry.analysisColor.count !== count) {
    entry.analysisColor = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
  }
  const out = entry.analysisColor.array as Float32Array;
  const base = entry.scanColor;
  const roleHex = ROLE_COLOR[entry.role];
  const br = ((roleHex >> 16) & 255) / 255;
  const bg = ((roleHex >> 8) & 255) / 255;
  const bb = (roleHex & 255) / 255;
  for (let i = 0; i < count; i += 1) {
    let r = base ? base.getX(i) : br;
    let g = base ? base.getY(i) : bg;
    let b = base ? base.getZ(i) : bb;
    const align = entry.align?.[i] ?? 0;
    if (showUndercut && isUndercutAlignment(align, look.undercutLimit)) {
      r = UNDERCUT_RGB[0];
      g = UNDERCUT_RGB[1];
      b = UNDERCUT_RGB[2];
    } else if (showContact && entry.dist) {
      const painted = contactColorRgb(
        (entry.dist[i] ?? Infinity) * unitToMm,
        look.occlusalGapMm,
        look.contactMode,
      );
      if (painted) {
        r = painted[0];
        g = painted[1];
        b = painted[2];
      }
    }
    out[i * 3] = r;
    out[i * 3 + 1] = g;
    out[i * 3 + 2] = b;
  }
  entry.analysisColor.needsUpdate = true;
  entry.geometry.setAttribute("color", entry.analysisColor);
  return true;
}

function isGhostScanRole(
  role: LabOralScanRole,
  prepArch: "upper" | "lower" | "both" | null | undefined,
) {
  if (role === "bite") return true;
  if (prepArch !== "upper" && prepArch !== "lower") return false;
  return (role === "upper" || role === "lower") && role !== prepArch;
}

function undercutApplies(
  role: LabOralScanRole,
  prepArch: "upper" | "lower" | "both" | null | undefined,
) {
  return (
    (role === "upper" && (prepArch === "upper" || prepArch === "both")) ||
    (role === "lower" && (prepArch === "lower" || prepArch === "both"))
  );
}

function insertionForRole(
  role: LabOralScanRole,
  prepArch: "upper" | "lower" | "both" | null | undefined,
  frame: DentalFrame | null,
  override: THREE.Vector3 | null = null,
): THREE.Vector3 | null {
  if (!undercutApplies(role, prepArch)) return null;
  if (override) return override.clone();
  if (!frame) return null;
  if (role === "upper") return frame.up.clone();
  return frame.up.clone().negate();
}

type InsertionAxis = {
  key: string;
  toothNumbers: string[];
  dir: THREE.Vector3;
  /** 화살표가 향한 치아 표면. 표시는 여기서 2mm 띄운다. */
  origin: THREE.Vector3;
  /** 치아 크기에 맞춘 화살표 크기. */
  radius: number;
  /** 축을 잡은 순간의 카메라. */
  view: SavedCameraView;
};

type InsertionAnchor = {
  arch: "upper" | "lower";
  x: number;
  y: number;
  z: number;
  dir: THREE.Vector3;
};

function insertionAxisKey(toothNumbers: readonly string[]) {
  return toothNumbers
    .map((tooth) => fdiDigits(tooth))
    .filter(Boolean)
    .sort()
    .join(",");
}

/** 삽입축이 닿은 점으로 그 보철 치아들의 추정 중심을 옮긴다. 상대 간격은 유지한다. */
function alignPlacementsToPoint(
  placements: ToothPlacement[],
  toothNumbers: readonly string[],
  point: THREE.Vector3,
  fallbackRadius: number,
): ToothPlacement[] {
  const wanted = toothNumbers.filter(Boolean);
  if (wanted.length === 0) return placements;
  const next = placements.map((row) => ({
    ...row,
    center: row.center.clone(),
  }));
  const matched = next.filter((row) => wanted.includes(row.toothNumber));
  const radius = Math.max(matched[0]?.radius ?? fallbackRadius, 1);
  if (matched.length === 0) {
    for (const tooth of wanted) {
      const parsed = parseFdi(tooth);
      if (!parsed) continue;
      next.push({
        toothNumber: tooth,
        center: point.clone(),
        radius,
        arch: parsed.arch,
      });
    }
    return next;
  }
  const centroid = new THREE.Vector3();
  for (const row of matched) centroid.add(row.center);
  centroid.multiplyScalar(1 / matched.length);
  const delta = point.clone().sub(centroid);
  for (const row of matched) row.center.add(delta);
  for (const tooth of wanted) {
    if (matched.some((row) => row.toothNumber === tooth)) continue;
    const parsed = parseFdi(tooth);
    if (!parsed) continue;
    next.push({
      toothNumber: tooth,
      center: point.clone(),
      radius,
      arch: parsed.arch,
    });
  }
  return next;
}

function marginFrameAxes(normal: THREE.Vector3, rightHint: THREE.Vector3) {
  const y = normal.clone().normalize();
  const x = rightHint.clone().addScaledVector(y, -rightHint.dot(y));
  if (x.lengthSq() < 1e-8) {
    const fallback =
      Math.abs(y.z) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    x.crossVectors(y, fallback);
  }
  x.normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  return { x, y, z };
}

/**
 * 치아 주변 삼각형을 삽입축 프레임으로 옮긴다.
 * 칼라는 로드 때 스캔 색이다. 언더컷·접촉으로 칠한 색은 쓰지 않는다.
 */
function collectProjectedMarginTriangles(
  entries: LoadedMesh[],
  center: THREE.Vector3,
  normal: THREE.Vector3,
  right: THREE.Vector3,
  toothRadius: number,
) {
  const axes = marginFrameAxes(normal, right);
  const outer = toothRadius * 2.7;
  const outerSq = outer * outer;
  const yMin = -toothRadius * 1.6;
  const yMax = toothRadius * 2.8;
  const world = new THREE.Vector3();
  let packed = new Float32Array(2048 * PROJECTED_MARGIN_TRIANGLE_STRIDE);
  let count = 0;
  const push = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
    ar: number,
    ag: number,
    ab: number,
    br: number,
    bg: number,
    bb: number,
    cr: number,
    cg: number,
    cb: number,
  ) => {
    if ((count + 1) * PROJECTED_MARGIN_TRIANGLE_STRIDE > packed.length) {
      const next = new Float32Array(packed.length * 2);
      next.set(packed);
      packed = next;
    }
    const offset = count * PROJECTED_MARGIN_TRIANGLE_STRIDE;
    packed[offset] = ax;
    packed[offset + 1] = ay;
    packed[offset + 2] = az;
    packed[offset + 3] = bx;
    packed[offset + 4] = by;
    packed[offset + 5] = bz;
    packed[offset + 6] = cx;
    packed[offset + 7] = cy;
    packed[offset + 8] = cz;
    packed[offset + 9] = ar;
    packed[offset + 10] = ag;
    packed[offset + 11] = ab;
    packed[offset + 12] = br;
    packed[offset + 13] = bg;
    packed[offset + 14] = bb;
    packed[offset + 15] = cr;
    packed[offset + 16] = cg;
    packed[offset + 17] = cb;
    count += 1;
  };

  for (const entry of entries) {
    const color = entry.scanColor;
    const pos = entry.geometry.getAttribute("position");
    if (!color || !pos || color.count !== pos.count) continue;
    entry.mesh.updateWorldMatrix(true, false);
    const matrix = entry.mesh.matrixWorld;
    const fx = new Float32Array(pos.count);
    const fy = new Float32Array(pos.count);
    const fz = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i += 1) {
      world.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      const dx = world.x - center.x;
      const dy = world.y - center.y;
      const dz = world.z - center.z;
      fx[i] = dx * axes.x.x + dy * axes.x.y + dz * axes.x.z;
      fy[i] = dx * axes.y.x + dy * axes.y.y + dz * axes.y.z;
      fz[i] = dx * axes.z.x + dy * axes.z.y + dz * axes.z.z;
    }
    const index = entry.geometry.index;
    const triCount = index ? Math.floor(index.count / 3) : Math.floor(pos.count / 3);
    for (let tri = 0; tri < triCount; tri += 1) {
      const ia = index ? index.getX(tri * 3) : tri * 3;
      const ib = index ? index.getX(tri * 3 + 1) : tri * 3 + 1;
      const ic = index ? index.getX(tri * 3 + 2) : tri * 3 + 2;
      const ax = fx[ia] ?? 0;
      const ay = fy[ia] ?? 0;
      const az = fz[ia] ?? 0;
      const bx = fx[ib] ?? 0;
      const by = fy[ib] ?? 0;
      const bz = fz[ib] ?? 0;
      const cx = fx[ic] ?? 0;
      const cy = fy[ic] ?? 0;
      const cz = fz[ic] ?? 0;
      if (ay < yMin && by < yMin && cy < yMin) continue;
      if (ay > yMax && by > yMax && cy > yMax) continue;
      if (
        ax * ax + az * az > outerSq &&
        bx * bx + bz * bz > outerSq &&
        cx * cx + cz * cz > outerSq
      ) {
        continue;
      }
      push(
        ax,
        ay,
        az,
        bx,
        by,
        bz,
        cx,
        cy,
        cz,
        color.getX(ia),
        color.getY(ia),
        color.getZ(ia),
        color.getX(ib),
        color.getY(ib),
        color.getZ(ib),
        color.getX(ic),
        color.getY(ic),
        color.getZ(ic),
      );
    }
  }
  return packed.subarray(0, count * PROJECTED_MARGIN_TRIANGLE_STRIDE);
}

function nearestInsertionDir(
  x: number,
  y: number,
  z: number,
  anchors: InsertionAnchor[],
  fallback: THREE.Vector3 | null,
): THREE.Vector3 | null {
  if (anchors.length === 0) return fallback;
  let best = Infinity;
  let dir = anchors[0]?.dir ?? fallback;
  for (const anchor of anchors) {
    const dx = anchor.x - x;
    const dy = anchor.y - y;
    const dz = anchor.z - z;
    const dist = dx * dx + dy * dy + dz * dz;
    if (dist < best) {
      best = dist;
      dir = anchor.dir;
    }
  }
  return dir;
}

function antagonistRole(
  role: LabOralScanRole,
  prepArch: "upper" | "lower" | "both" | null | undefined,
): LabOralScanRole | null {
  if (prepArch === "upper" && role === "upper") return "lower";
  if (prepArch === "lower" && role === "lower") return "upper";
  if (prepArch === "both" && role === "upper") return "lower";
  if (prepArch === "both" && role === "lower") return "upper";
  return null;
}

async function fillDesignAnalysis(
  loaded: LoadedMesh[],
  prepArch: "upper" | "lower" | "both" | null | undefined,
  frame: DentalFrame | null,
  unitToMm: number,
  cancelled: () => boolean,
  anchors: InsertionAnchor[] = [],
) {
  const indexes = new Map<
    LabOralScanRole,
    ReturnType<typeof createScanPointIndex>
  >();
  for (const role of ["upper", "lower"] as const) {
    const index = createScanPointIndex(unitToMm);
    let any = false;
    for (const entry of loaded) {
      if (entry.role !== role) continue;
      const pos = entry.geometry.getAttribute("position");
      if (!pos) continue;
      const stride = Math.max(1, Math.floor(pos.count / 70000));
      for (let i = 0; i < pos.count; i += stride) {
        index.add(pos.getX(i), pos.getY(i), pos.getZ(i));
        any = true;
      }
    }
    if (any) indexes.set(role, index);
  }

  for (const entry of loaded) {
    const against = antagonistRole(entry.role, prepArch);
    const mine = anchors.filter((anchor) => anchor.arch === entry.role);
    const insertion = insertionForRole(entry.role, prepArch, frame, null);
    const index = against ? indexes.get(against) : undefined;
    const pos = entry.geometry.getAttribute("position");
    const nor = entry.geometry.getAttribute("normal");
    if (!pos || (!index && !insertion && mine.length === 0)) {
      entry.dist = null;
      entry.align = null;
      continue;
    }
    const count = pos.count;
    const dist = index ? new Float32Array(count) : null;
    const align = (mine.length > 0 || insertion) && nor ? new Float32Array(count) : null;
    if (dist) dist.fill(Infinity);
    let budget = performance.now() + 6;
    for (let i = 0; i < count; i += 1) {
      if ((i & 511) === 0 && performance.now() > budget) {
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        });
        if (cancelled()) return;
        budget = performance.now() + 6;
      }
      if (align && nor) {
        const dir = nearestInsertionDir(
          pos.getX(i),
          pos.getY(i),
          pos.getZ(i),
          mine,
          insertion,
        );
        if (dir) {
          align[i] =
            nor.getX(i) * dir.x + nor.getY(i) * dir.y + nor.getZ(i) * dir.z;
        }
      }
      if (dist && index) {
        dist[i] = index.nearest(pos.getX(i), pos.getY(i), pos.getZ(i));
      }
    }
    if (cancelled()) return;
    entry.dist = dist;
    entry.align = align;
  }
}

function viewBasis(viewDir: THREE.Vector3, viewUp: THREE.Vector3) {
  const dir = viewDir.clone().normalize();
  const up = viewUp.clone();
  if (Math.abs(up.dot(dir)) > 0.92) up.set(0, 0, 1);
  up.addScaledVector(dir, -up.dot(dir));
  if (up.lengthSq() < 1e-8) up.set(0, 1, 0);
  up.normalize();
  const right = new THREE.Vector3().crossVectors(up, dir).normalize();
  const screenUp = new THREE.Vector3().crossVectors(dir, right).normalize();
  return { dir, up, right, screenUp };
}

/** 정점 실루엣으로 화면에 맞춘다. 박스 모서리는 빈 공간을 포함한다. */
function measureMeshFit(
  meshes: LoadedMesh[],
  groupPosition: THREE.Vector3,
  viewDir: THREE.Vector3,
  viewUp: THREE.Vector3,
) {
  const { right, screenUp } = viewBasis(viewDir, viewUp);
  const xs: number[] = [];
  const ys: number[] = [];
  const point = new THREE.Vector3();
  for (const entry of meshes) {
    const pos = entry.geometry.getAttribute("position");
    if (!pos || pos.count === 0) continue;
    const stride = pos.count > 250000 ? Math.ceil(pos.count / 250000) : 1;
    for (let i = 0; i < pos.count; i += stride) {
      point.set(
        pos.getX(i) + entry.mesh.position.x + groupPosition.x,
        pos.getY(i) + entry.mesh.position.y + groupPosition.y,
        pos.getZ(i) + entry.mesh.position.z + groupPosition.z,
      );
      xs.push(point.dot(right));
      ys.push(point.dot(screenUp));
    }
  }
  if (xs.length < 8) {
    return {
      halfW: 40,
      halfH: 40,
      target: new THREE.Vector3(),
    };
  }
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  // 떨어진 스캔 파편은 빼고 치열에 맞춘다.
  const at = (sorted: number[], p: number) =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))] ?? 0;
  const minX = at(xs, 0.004);
  const maxX = at(xs, 0.996);
  const minY = at(ys, 0.004);
  const maxY = at(ys, 0.996);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    halfW: Math.max((maxX - minX) / 2, 0.5),
    halfH: Math.max((maxY - minY) / 2, 0.5),
    target: new THREE.Vector3()
      .addScaledVector(right, cx)
      .addScaledVector(screenUp, cy),
  };
}

/**
 * 정중선에서 치아 중심까지, 편측 치열 길이의 비율.
 * 근원심 폭(중절치→제3대구치)으로 나눈다. 제1대구치(6번)는 약 0.64.
 */
const TOOTH_SPAN_T = [0, 0.065, 0.181, 0.289, 0.401, 0.508, 0.639, 0.794, 0.935];

type ToothPlacement = {
  toothNumber: string;
  center: THREE.Vector3;
  radius: number;
  arch: "upper" | "lower";
};

type ParsedScanCache = {
  geometry: THREE.BufferGeometry;
  texture: THREE.Texture | null;
};

const parsedScanCache = new Map<string, ParsedScanCache>();

function parsedScanCacheKey(source: OralScanOverlaySource) {
  return `${source.id}:${source.file.size}:${source.file.lastModified}`;
}

function releaseSceneGeometry(geometry: THREE.BufferGeometry) {
  for (const row of parsedScanCache.values()) {
    if (row.geometry === geometry) return;
  }
  geometry.dispose();
}

function releaseSceneTexture(texture: THREE.Texture | null) {
  if (!texture) return;
  for (const row of parsedScanCache.values()) {
    if (row.texture === texture) return;
  }
  texture.dispose();
}

async function loadCachedScanPreview(source: OralScanOverlaySource) {
  const key = parsedScanCacheKey(source);
  const hit = parsedScanCache.get(key);
  if (hit) {
    return {
      geometry: hit.geometry.clone(),
      texture: hit.texture,
    };
  }
  const parsed = await parseModelPreview(source.file, {
    companionFiles: source.companionFiles,
  });
  parsedScanCache.set(key, {
    geometry: parsed.geometry.clone(),
    texture: parsed.texture,
  });
  return {
    geometry: parsed.geometry,
    texture: parsed.texture,
  };
}

type WorkFraming = {
  dir: THREE.Vector3;
  up: THREE.Vector3;
  halfW: number;
  halfH: number;
  target: THREE.Vector3;
  placements: ToothPlacement[];
};

function quantile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const i = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * p)),
  );
  return sorted[i] ?? 0;
}

function angleAbsDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

function parseFdi(raw: string): {
  arch: "upper" | "lower";
  side: 1 | -1;
  pos: number;
} | null {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!/^[1-4][1-8]$/.test(digits)) return null;
  const quadrant = Number(digits[0]);
  const pos = Number(digits[1]);
  return {
    arch: quadrant <= 2 ? "upper" : "lower",
    side: quadrant === 1 || quadrant === 4 ? 1 : -1,
    pos,
  };
}

function sampleWorldPoints(
  entries: LoadedMesh[],
  groupPosition: THREE.Vector3,
  cap: number,
) {
  const out: Array<[number, number, number]> = [];
  const per = Math.max(800, Math.floor(cap / Math.max(entries.length, 1)));
  for (const entry of entries) {
    const pos = entry.geometry.getAttribute("position");
    if (!pos || pos.count === 0) continue;
    const stride = Math.max(1, Math.floor(pos.count / per));
    const ox = groupPosition.x;
    const oy = groupPosition.y;
    const oz = groupPosition.z;
    for (let i = 0; i < pos.count; i += stride) {
      out.push([pos.getX(i) + ox, pos.getY(i) + oy, pos.getZ(i) + oz]);
    }
  }
  return out;
}

type PlanePoint = {
  x: number;
  y: number;
  z: number;
  r: number;
  a: number;
};

function projectArch(
  points: Array<[number, number, number]>,
  frame: DentalFrame,
  origin: THREE.Vector3,
): PlanePoint[] {
  const out: PlanePoint[] = [];
  for (const p of points) {
    const dx = p[0] - origin.x;
    const dy = p[1] - origin.y;
    const dz = p[2] - origin.z;
    out.push({
      x: p[0],
      y: p[1],
      z: p[2],
      r: dx * frame.right.x + dy * frame.right.y + dz * frame.right.z,
      a:
        dx * frame.anterior.x +
        dy * frame.anterior.y +
        dz * frame.anterior.z,
    });
  }
  return out;
}

function archPole(plane: PlanePoint[]) {
  const rs = plane.map((p) => p.r).sort((a, b) => a - b);
  const as = plane.map((p) => p.a).sort((a, b) => a - b);
  const rLo = quantile(rs, 0.05);
  const rHi = quantile(rs, 0.95);
  const aLo = quantile(as, 0.05);
  const aHi = quantile(as, 0.95);
  const depth = Math.max(aHi - aLo, 1e-6);
  return {
    poleR: (rLo + rHi) / 2,
    poleA: aHi - depth * 0.38,
    depth,
  };
}

function horseshoeScore(
  points: Array<[number, number, number]>,
  frame: DentalFrame,
) {
  if (points.length < 30) return 0;
  const origin = meanVec(points);
  if (!origin) return 0;
  const { poleR, poleA } = archPole(projectArch(points, frame, origin));
  const dists = projectArch(points, frame, origin).map((p) =>
    Math.hypot(p.r - poleR, p.a - poleA),
  );
  const sorted = [...dists].sort((a, b) => a - b);
  const outer = quantile(sorted, 0.9);
  if (outer < 1e-6) return 0;
  let rim = 0;
  for (const dist of dists) if (dist > outer * 0.62) rim += 1;
  return rim / dists.length;
}

/** 교합면 쪽 정점. 구개·혀 쪽 덩어리면 반대 밴드를 고른다. */
function occlusalBand(
  points: Array<[number, number, number]>,
  frame: DentalFrame,
  arch: "upper" | "lower",
) {
  const heights = points.map(
    (p) => p[0] * frame.up.x + p[1] * frame.up.y + p[2] * frame.up.z,
  );
  const sorted = [...heights].sort((a, b) => a - b);
  const lo = quantile(sorted, 0.2);
  const hi = quantile(sorted, 0.8);
  const low = points.filter((_, i) => (heights[i] ?? 0) <= lo);
  const high = points.filter((_, i) => (heights[i] ?? 0) >= hi);
  const preferLow = arch === "upper";
  const first = preferLow ? low : high;
  const second = preferLow ? high : low;
  if (horseshoeScore(second, frame) > horseshoeScore(first, frame) + 0.08) {
    return second;
  }
  return first.length >= 40 ? first : second;
}

function fdiDigits(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  return /^[1-4][1-8]$/.test(digits) ? digits : "";
}

function anchorsFromAxes(
  axes: InsertionAxis[],
  placements: ToothPlacement[],
  groupPosition: THREE.Vector3,
): InsertionAnchor[] {
  const out: InsertionAnchor[] = [];
  for (const axis of axes) {
    for (const tooth of axis.toothNumbers) {
      const place = placements.find((row) => row.toothNumber === tooth);
      if (!place) continue;
      out.push({
        arch: place.arch,
        x: place.center.x - groupPosition.x,
        y: place.center.y - groupPosition.y,
        z: place.center.z - groupPosition.z,
        dir: axis.dir,
      });
    }
  }
  return out;
}

function locateToothPlacements(
  band: Array<[number, number, number]>,
  frame: DentalFrame,
  arch: "upper" | "lower",
  teeth: Array<{ toothNumber: string; side: 1 | -1; pos: number }>,
): ToothPlacement[] {
  if (band.length < 40 || teeth.length === 0) return [];
  const origin = meanVec(band);
  if (!origin) return [];
  const plane = projectArch(band, frame, origin);
  const { poleR, poleA, depth } = archPole(plane);
  const angled = plane.map((p) => {
    const dr = p.r - poleR;
    const da = p.a - poleA;
    return { ...p, ang: Math.atan2(dr, da), dist: Math.hypot(dr, da) };
  });
  const outer = angled.filter((p) => p.dist > depth * 0.22);
  const use = outer.length > 40 ? outer : angled;
  const rightAng = use
    .map((p) => p.ang)
    .filter((ang) => ang > 0.08)
    .sort((a, b) => a - b);
  const leftAng = use
    .map((p) => -p.ang)
    .filter((ang) => ang > 0.08)
    .sort((a, b) => a - b);
  let spanR = quantile(rightAng, 0.92);
  let spanL = quantile(leftAng, 0.92);
  if (spanR < 0.4) spanR = spanL;
  if (spanL < 0.4) spanL = spanR;
  if (spanR < 0.4) return [];
  const placements: ToothPlacement[] = [];
  for (const tooth of teeth) {
    const span = tooth.side > 0 ? spanR : spanL;
    const along = TOOTH_SPAN_T[tooth.pos] ?? 0.5;
    const ang = tooth.side * along * span;
    let wedge = Math.max(0.18, span * 0.1);
    let picked = use.filter((p) => angleAbsDiff(p.ang, ang) <= wedge);
    if (picked.length < 12) {
      wedge = Math.max(wedge, 0.48);
      picked = use.filter((p) => angleAbsDiff(p.ang, ang) <= wedge);
    }
    if (picked.length < 8) continue;
    const dists = picked.map((p) => p.dist).sort((a, b) => a - b);
    const inner = quantile(dists, 0.42);
    const outer = quantile(dists, 0.78);
    const crown = picked.filter((p) => p.dist >= inner && p.dist <= outer);
    const row = crown.length >= 8 ? crown : picked;
    const mesial = row.filter((p) => {
      const delta = Math.abs(p.ang) - Math.abs(ang);
      return delta <= 0.05 && delta >= -0.32;
    });
    const tableSrc = mesial.length >= 8 ? mesial : row;
    const heights = tableSrc.map(
      (p) => p.x * frame.up.x + p.y * frame.up.y + p.z * frame.up.z,
    );
    const heightOrder = [...heights].sort((a, b) => a - b);
    const low = quantile(heightOrder, arch === "upper" ? 0.08 : 0.52);
    const high = quantile(heightOrder, arch === "upper" ? 0.42 : 0.9);
    const table = tableSrc.filter((_, index) => {
      const h = heights[index] ?? 0;
      return h >= low && h <= high;
    });
    const used = table.length >= 6 ? table : tableSrc;
    let x = 0;
    let y = 0;
    let z = 0;
    for (const p of used) {
      x += p.x;
      y += p.y;
      z += p.z;
    }
    const n = used.length;
    const center = new THREE.Vector3(x / n, y / n, z / n);
    let spread = 0;
    for (const p of used) {
      spread = Math.max(spread, Math.hypot(p.x - center.x, p.y - center.y, p.z - center.z));
    }
    placements.push({
      toothNumber: tooth.toothNumber,
      center,
      radius: Math.max(spread, 1e-3),
      arch,
    });
  }
  return placements;
}

function occlusalCamera(frame: DentalFrame, arch: "upper" | "lower") {
  const dir = frame.up.clone();
  if (arch === "upper") dir.negate();
  const up = frame.anterior.clone();
  up.addScaledVector(dir, -up.dot(dir));
  if (up.lengthSq() < 1e-8) up.copy(frame.right);
  return { dir: dir.normalize(), up: up.normalize() };
}

function linearToSrgb(channel: number) {
  const c = Math.min(1, Math.max(0, channel));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** 치아는 양수, 잇몸은 음수. 아이보리는 밝고 붉은기가 약하다. */
function toothVsGingiva(r: number, g: number, b: number) {
  const sr = linearToSrgb(r);
  const sg = linearToSrgb(g);
  const sb = linearToSrgb(b);
  const pink = sr - 0.5 * (sg + sb);
  const luma = 0.299 * sr + 0.587 * sg + 0.114 * sb;
  return luma * 0.45 - pink;
}

type ColoredSample = { x: number; y: number; z: number; score: number };

function sampleArchColors(
  entries: LoadedMesh[],
  groupPosition: THREE.Vector3,
  cap: number,
) {
  const out: ColoredSample[] = [];
  const per = Math.max(600, Math.floor(cap / Math.max(entries.length, 1)));
  for (const entry of entries) {
    const pos = entry.geometry.getAttribute("position");
    const color = entry.scanColor;
    if (!pos || pos.count === 0) continue;
    const colored = color != null && color.count === pos.count;
    const stride = Math.max(1, Math.floor(pos.count / per));
    const ox = groupPosition.x;
    const oy = groupPosition.y;
    const oz = groupPosition.z;
    for (let i = 0; i < pos.count; i += stride) {
      out.push({
        x: pos.getX(i) + ox,
        y: pos.getY(i) + oy,
        z: pos.getZ(i) + oz,
        score: colored
          ? toothVsGingiva(color.getX(i), color.getY(i), color.getZ(i))
          : 0,
      });
    }
  }
  return out;
}

/** 점구름 공분산의 세 축. 악궁 바운딩박스의 모서리 방향이다. */
function cloudPrincipalAxes(
  points: Array<[number, number, number]>,
  mean: THREE.Vector3,
) {
  let xx = 0;
  let yy = 0;
  let zz = 0;
  let xy = 0;
  let xz = 0;
  let yz = 0;
  for (const p of points) {
    const x = p[0] - mean.x;
    const y = p[1] - mean.y;
    const z = p[2] - mean.z;
    xx += x * x;
    yy += y * y;
    zz += z * z;
    xy += x * y;
    xz += x * z;
    yz += y * z;
  }
  const a = [
    [xx, xy, xz],
    [xy, yy, yz],
    [xz, yz, zz],
  ];
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let iter = 0; iter < 12; iter += 1) {
    let p = 0;
    let q = 1;
    let max = Math.abs(a[0]?.[1] ?? 0);
    if (Math.abs(a[0]?.[2] ?? 0) > max) {
      max = Math.abs(a[0]?.[2] ?? 0);
      p = 0;
      q = 2;
    }
    if (Math.abs(a[1]?.[2] ?? 0) > max) {
      max = Math.abs(a[1]?.[2] ?? 0);
      p = 1;
      q = 2;
    }
    if (max < 1e-10) break;
    const app = a[p]?.[p] ?? 0;
    const aqq = a[q]?.[q] ?? 0;
    const apq = a[p]?.[q] ?? 0;
    if (Math.abs(apq) < 1e-15) break;
    const tau = (aqq - app) / (2 * apq);
    const tt = Math.sign(tau) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
    const c = 1 / Math.sqrt(1 + tt * tt);
    const s = tt * c;
    for (let k = 0; k < 3; k += 1) {
      if (k === p || k === q) continue;
      const aik = a[k]?.[p] ?? 0;
      const akq = a[k]?.[q] ?? 0;
      const nip = c * aik - s * akq;
      const niq = s * aik + c * akq;
      if (a[k]) {
        a[k][p] = nip;
        a[k][q] = niq;
      }
      if (a[p]) a[p][k] = nip;
      if (a[q]) a[q][k] = niq;
    }
    if (a[p]) a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    if (a[q]) a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    if (a[p]) a[p][q] = 0;
    if (a[q]) a[q][p] = 0;
    for (let k = 0; k < 3; k += 1) {
      const vip = v[k]?.[p] ?? 0;
      const viq = v[k]?.[q] ?? 0;
      if (!v[k]) continue;
      v[k][p] = c * vip - s * viq;
      v[k][q] = s * vip + c * viq;
    }
  }
  return [0, 1, 2].map((index) => ({
    value: a[index]?.[index] ?? 0,
    axis: new THREE.Vector3(
      v[0]?.[index] ?? 0,
      v[1]?.[index] ?? 0,
      v[2]?.[index] ?? 0,
    ),
  }));
}

/**
 * 교합면 법선. 카메라는 이 방향(교합면 쪽)에 둔다.
 * 악궁 바운딩박스의 세 축 가운데, 아이보리색 치아 점수가 한 끝에 몰리는 축을 고른다.
 */
function occlusalNormalFromColor(
  entries: LoadedMesh[],
  groupPosition: THREE.Vector3,
  fallback: THREE.Vector3,
) {
  const samples = sampleArchColors(entries, groupPosition, 9000);
  if (samples.length < 40) return null;
  const scored = samples.filter((sample) => sample.score !== 0 || entries.some((e) => e.scanColor));
  const usable = scored.length > 40 ? scored : samples;
  const points = usable.map(
    (sample) => [sample.x, sample.y, sample.z] as [number, number, number],
  );
  const mean = meanVec(points);
  if (!mean) return null;
  const axes = cloudPrincipalAxes(points, mean).filter(
    (row) => row.axis.lengthSq() > 1e-8,
  );
  if (axes.length === 0) return fallback.clone();
  let best: THREE.Vector3 | null = null;
  let bestGap = 0.015;
  for (const row of axes) {
    const axis = row.axis.clone().normalize();
    const heightOf = (sample: ColoredSample) =>
      (sample.x - mean.x) * axis.x +
      (sample.y - mean.y) * axis.y +
      (sample.z - mean.z) * axis.z;
    const heights = usable.map(heightOf).sort((a, b) => a - b);
    const lo = quantile(heights, 0.18);
    const hi = quantile(heights, 0.82);
    let hiSum = 0;
    let hiCount = 0;
    let loSum = 0;
    let loCount = 0;
    for (const sample of usable) {
      const height = heightOf(sample);
      if (height >= hi) {
        hiSum += sample.score;
        hiCount += 1;
      } else if (height <= lo) {
        loSum += sample.score;
        loCount += 1;
      }
    }
    const hiMean = hiCount > 0 ? hiSum / hiCount : 0;
    const loMean = loCount > 0 ? loSum / loCount : 0;
    const gap = hiMean - loMean;
    if (Math.abs(gap) <= bestGap) continue;
    bestGap = Math.abs(gap);
    best = gap < 0 ? axis.negate() : axis;
  }
  return best ?? fallback.clone();
}

function pickCameraArch(
  prepArch: "upper" | "lower" | "both" | null,
  teeth: Array<{ arch: "upper" | "lower" }>,
  loaded: LoadedMesh[],
): "upper" | "lower" | null {
  const has = (role: "upper" | "lower") =>
    loaded.some((entry) => entry.role === role);
  const preferred = teeth[0]?.arch ?? prepArch;
  if (preferred === "upper" || preferred === "lower") {
    if (has(preferred)) return preferred;
  }
  if (has("upper")) return "upper";
  if (has("lower")) return "lower";
  return null;
}

function toothWindowHalf(placements: ToothPlacement[], jawRadius: number) {
  let spread = 0;
  for (const place of placements) spread = Math.max(spread, place.radius);
  return Math.max(spread * 2.6, jawRadius * 0.2);
}

/** 같은 악에서 근심·원심으로 한 치아씩. 중절치는 반대편 중절치가 근심이다. */
function adjacentFdi(toothNumber: string): string[] {
  const digits = fdiDigits(toothNumber);
  const row = parseFdi(toothNumber);
  if (!digits || !row) return [];
  const quadrant = Number(digits[0]);
  const out: string[] = [];
  if (row.pos > 1) out.push(`${quadrant}${row.pos - 1}`);
  else {
    const across =
      quadrant === 1 ? 2 : quadrant === 2 ? 1 : quadrant === 3 ? 4 : 3;
    out.push(`${across}1`);
  }
  if (row.pos < 8) out.push(`${quadrant}${row.pos + 1}`);
  return out;
}

/** 화면 한가운데에 모델 중심을 두고 교합면에서 본다. 삽입축은 이 화면을 옮긴 뒤 잡는다. */
function frameWorkOcclusal(args: {
  loaded: LoadedMesh[];
  groupPosition: THREE.Vector3;
  frame: DentalFrame;
  prepArch: "upper" | "lower" | "both" | null;
  toothNumbers: readonly string[];
}): WorkFraming | null {
  const parsed = args.toothNumbers.flatMap((tooth) => {
    const row = parseFdi(tooth);
    const toothNumber = fdiDigits(tooth);
    if (!row || !toothNumber) return [];
    return [{ ...row, toothNumber }];
  });
  const prepKeys = new Set(parsed.map((row) => row.toothNumber));
  const seen = new Set(prepKeys);
  const withNeighbors = [...parsed];
  for (const tooth of parsed) {
    for (const neighbor of adjacentFdi(tooth.toothNumber)) {
      if (seen.has(neighbor)) continue;
      const row = parseFdi(neighbor);
      const toothNumber = fdiDigits(neighbor);
      if (!row || !toothNumber) continue;
      seen.add(neighbor);
      withNeighbors.push({ ...row, toothNumber });
    }
  }
  const arch = pickCameraArch(args.prepArch, parsed, args.loaded);
  if (!arch) return null;
  const meshes = args.loaded.filter((entry) => entry.role === arch);
  if (meshes.length === 0) return null;
  const world = sampleWorldPoints(meshes, args.groupPosition, 8000);
  if (world.length < 40) return null;
  const band = occlusalBand(world, args.frame, arch);
  const pose = occlusalCamera(args.frame, arch);
  const placements = locateToothPlacements(
    band,
    args.frame,
    arch,
    withNeighbors.filter((row) => row.arch === arch),
  );
  const colored = occlusalNormalFromColor(meshes, args.groupPosition, pose.dir);
  const hasPair =
    args.loaded.some((entry) => entry.role === "upper") &&
    args.loaded.some((entry) => entry.role === "lower");
  const dir = (() => {
    if (hasPair) {
      const jaw = pose.dir.clone();
      if (colored && colored.dot(jaw) < 0) jaw.negate();
      return jaw;
    }
    return colored ?? pose.dir.clone();
  })();
  const up = args.frame.anterior.clone();
  up.addScaledVector(dir, -up.dot(dir));
  if (up.lengthSq() < 1e-8) up.copy(pose.up);
  else up.normalize();
  const fit = measureMeshFit(meshes, args.groupPosition, dir, up);
  return {
    dir,
    up,
    halfW: fit.halfW,
    halfH: fit.halfH,
    target: fit.target,
    placements,
  };
}

function triggerPngDownload(dataUrl: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = "scan-overlay.png";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const OralScanOverlayViewer = forwardRef<OralScanOverlayHandle, Props>(
  function OralScanOverlayViewer(
    {
      items,
      visible,
      colorMapping,
      ghostOpacity,
      prepArch = null,
      focusToothNumbers = [],
      toothBadges = [],
      onSelectTooth,
      contactMap = false,
      undercutMap = false,
      occlusalGapMm = 0.1,
      contactMode = "cut",
      undercutLimit = 0.2,
      busy = false,
      busyLabel = "",
      onScanColorChange,
      onInsertionAxisChange,
      onInsertionAxisAimed,
      showInsertionAxis = false,
      showCenterGuides = false,
      designEdit = null,
      onDesignGesture,
      manualAlignArch = null,
      onAlignProgress,
      onAlignMerged,
      onAlignFailed,
      className,
    },
    ref,
  ) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<ScreenSpaceOrbitControls | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const loadedRef = useRef<LoadedMesh[]>([]);
  const fitRadiusRef = useRef(40);
  const fitExtentRef = useRef({ halfW: 40, halfH: 40 });
  const fitTargetRef = useRef(new THREE.Vector3());
  const snapRef = useRef<SnapAnim | null>(null);
  const lookRef = useRef({
    colorMapping,
    ghostOpacity,
    prepArch,
    contactMap,
    undercutMap,
    occlusalGapMm,
    contactMode,
    undercutLimit,
    prepBackTransparent: Boolean(designEdit?.prepBackTransparent),
  });
  const visibleRef = useRef(visible);
  const focusTeethRef = useRef(focusToothNumbers);
  const badgesRef = useRef(toothBadges);
  const onSelectToothRef = useRef(onSelectTooth);
  const placementsRef = useRef<ToothPlacement[]>([]);
  const labelRendererRef = useRef<CSS2DRenderer | null>(null);
  const badgeLayerRef = useRef<THREE.Group | null>(null);
  const focusToothRef = useRef<(toothNumber: string) => void>(() => {});
  const restoreInsertionViewRef = useRef<
    (toothNumbers: readonly string[]) => boolean
  >(() => false);
  const syncBadgesRef = useRef<() => void>(() => {});
  const onScanColorChangeRef = useRef(onScanColorChange);
  const onInsertionAxisChangeRef = useRef(onInsertionAxisChange);
  const onInsertionAxisAimedRef = useRef(onInsertionAxisAimed);
  const showInsertionRef = useRef(showInsertionAxis);
  const itemsRef = useRef(items);
  const frameRef = useRef<DentalFrame | null>(null);
  const insertionAxesRef = useRef<InsertionAxis[]>([]);
  const initialPoseRef = useRef<{
    dir: THREE.Vector3;
    up: THREE.Vector3;
    target: THREE.Vector3;
    halfW: number;
    halfH: number;
  } | null>(null);
  const resetHomeRef = useRef<() => void>(() => {});
  const insertionMarkerRef = useRef<THREE.Group | null>(null);
  const syncInsertionMarkerRef = useRef<() => void>(() => {});
  const unitToMmRef = useRef(1);
  const designEditRef = useRef<ProsthesisDesignEdit | null>(null);
  const onDesignGestureRef = useRef(onDesignGesture);
  const editLayerRef = useRef<THREE.Group | null>(null);
  const manualRef = useRef<{
    arch: "upper" | "lower" | null;
    model: THREE.Vector3[];
    bite: THREE.Vector3[];
    merging: boolean;
    skipLayout: boolean;
  }>({
    arch: null,
    model: [],
    bite: [],
    merging: false,
    skipLayout: false,
  });
  const alignWatchRef = useRef<"upper" | "lower" | null>(null);
  const onAlignProgressRef = useRef(onAlignProgress);
  const onAlignMergedRef = useRef(onAlignMerged);
  const onAlignFailedRef = useRef(onAlignFailed);
  const layoutSplitRef = useRef<(arch: "upper" | "lower") => void>(() => {});
  const clearAlignMarksRef = useRef<() => void>(() => {});
  const exitAlignViewRef = useRef<() => void>(() => {});
  const alignApiRef = useRef<{ pick: (event: PointerEvent) => void }>({
    pick: () => {},
  });
  const alignAutoRef = useRef<() => Promise<boolean>>(async () => false);
  const clearPicksRef = useRef<() => void>(() => {});
  designEditRef.current = designEdit;
  onDesignGestureRef.current = onDesignGesture;
  onAlignProgressRef.current = onAlignProgress;
  onAlignMergedRef.current = onAlignMerged;
  onAlignFailedRef.current = onAlignFailed;
  const setViewRef = useRef<(preset: OralScanViewPreset) => void>(() => {});
  const saveImageRef = useRef<() => void>(() => {});
  const [parseNote, setParseNote] = useState("");
  const [loadVersion, setLoadVersion] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [aligning, setAligning] = useState(false);
  const layoutGenRef = useRef(0);
  const placeLoadedRef = useRef<(reseated: boolean) => void>(() => {});

  lookRef.current = {
    colorMapping,
    ghostOpacity,
    prepArch,
    contactMap,
    undercutMap,
    occlusalGapMm,
    contactMode,
    undercutLimit,
    prepBackTransparent: Boolean(designEdit?.prepBackTransparent),
  };
  visibleRef.current = visible;
  focusTeethRef.current = focusToothNumbers;
  badgesRef.current = toothBadges;
  onSelectToothRef.current = onSelectTooth;
  onScanColorChangeRef.current = onScanColorChange;
  onInsertionAxisChangeRef.current = onInsertionAxisChange;
  onInsertionAxisAimedRef.current = onInsertionAxisAimed;
  showInsertionRef.current = showInsertionAxis;
  itemsRef.current = items;

  const itemsKey = items
    .map((item) => `${item.id}:${item.file.size}:${item.file.lastModified}`)
    .join("|");
  const roleKey = items.map((item) => `${item.id}:${item.role}`).join("|");

  const frameCamera = (
    dir: THREE.Vector3,
    up: THREE.Vector3,
    animate: boolean,
  ) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const radius = Math.max(fitRadiusRef.current, 1);
    const dist = radius * 4;
    const toTarget = fitTargetRef.current.clone();
    const toPos = dir.clone().normalize().multiplyScalar(dist).add(toTarget);
    const toUp = up.clone();
    if (Math.abs(toUp.dot(dir.clone().normalize())) > 0.92) {
      toUp.set(0, 0, 1);
    }
    toUp.normalize();
    if (!animate) {
      snapRef.current = null;
      controls.target.copy(toTarget);
      camera.position.copy(toPos);
      camera.up.copy(toUp);
      camera.zoom = 1;
      camera.lookAt(controls.target);
      camera.updateProjectionMatrix();
      controls.syncFromCamera();
      return;
    }
    snapRef.current = {
      start: performance.now(),
      duration: 280,
      fromPos: camera.position.clone(),
      toPos,
      fromUp: camera.up.clone(),
      toUp,
      fromTarget: controls.target.clone(),
      toTarget,
      fromZoom: camera.zoom,
      toZoom: 1,
    };
  };

  const applyFitFrustum = () => {
    const camera = cameraRef.current;
    const el = containerRef.current;
    if (!camera || !el) return;
    const width = Math.max(el.clientWidth, 1);
    const height = Math.max(el.clientHeight, 1);
    const aspect = width / height;
    const { halfW, halfH } = fitExtentRef.current;
    const worldW = Math.max(halfW * 2 * FIT_MARGIN, 1);
    const worldH = Math.max(halfH * 2 * FIT_MARGIN, 1);
    const frustumH = worldW / worldH > aspect ? worldW / aspect : worldH;
    const frustumW = frustumH * aspect;
    camera.top = frustumH / 2;
    camera.bottom = -frustumH / 2;
    camera.right = frustumW / 2;
    camera.left = -frustumW / 2;
    const radius = Math.max(fitRadiusRef.current, 1);
    const dist = radius * 4;
    camera.near = Math.max(radius * 0.01, 0.05);
    camera.far = dist * 40;
    camera.updateProjectionMatrix();
    const controls = controlsRef.current;
    if (controls) {
      controls.minDistance = Math.max(radius * 0.15, 1);
      controls.maxDistance = Math.max(radius * 30, 80);
    }
  };

  const restyleLoaded = () => {
    const look = lookRef.current;
    const {
      colorMapping: mapping,
      ghostOpacity: opacity,
      prepArch: prep,
    } = look;
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    let anyColor = false;
    const unit = unitToMmRef.current;
    for (const entry of loadedRef.current) {
      if (entry.hasColor) anyColor = true;
      const analysis = paintAnalysisColors(entry, look, unit);
      const useScan = mapping && entry.hasColor && !analysis;
      const mat = analysis
        ? new THREE.MeshStandardMaterial({
            color: 0xffffff,
            vertexColors: true,
            metalness: 0.04,
            roughness: 0.55,
            side: THREE.DoubleSide,
          })
        : createModelPreviewMaterial(entry.geometry, entry.texture, {
            colorMapping: useScan,
          });
      mat.side = THREE.DoubleSide;
      if (!useScan && !analysis) mat.color.set(ROLE_COLOR[entry.role]);
      const ghost = isGhostScanRole(entry.role, prep);
      const ghostOff = ghost && opacity <= 0.001;
      const alpha = ghostOff ? 0 : ghost ? Math.min(1, Math.max(0.08, opacity)) : 1;
      const prepShell =
        look.prepBackTransparent &&
        !ghost &&
        (prep === "both"
          ? entry.role === "upper" || entry.role === "lower"
          : entry.role === prep);
      const shown = prepShell ? Math.min(alpha, 0.38) : alpha;
      mat.transparent = shown < 0.995;
      mat.opacity = shown;
      mat.depthWrite = !ghostOff && !prepShell && (!ghost || shown > 0.92);
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = ghost ? 1 : -1;
      mat.polygonOffsetUnits = 1;
      const prev = entry.mesh.material;
      entry.mesh.material = mat;
      entry.mesh.renderOrder = ghost ? 2 : 0;
      const list = Array.isArray(prev) ? prev : [prev];
      for (const old of list) old.dispose();
      const split = manualRef.current.arch;
      const forced =
        split != null && (entry.role === split || entry.role === "bite");
      const hiddenByAlign =
        split != null && entry.role !== split && entry.role !== "bite";
      if (forced) {
        mat.transparent = false;
        mat.opacity = 1;
        mat.depthWrite = true;
      }
      entry.mesh.visible =
        !hiddenByAlign && !ghostOff && visibleRef.current[entry.id] !== false;
      if (forced) entry.mesh.visible = true;
    }
    if (scene && renderer) {
      if (mapping && anyColor) {
        applyScanColorToneMapping(renderer);
        scene.background = new THREE.Color(SCAN_COLOR_PREVIEW_BACKGROUND);
      } else {
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1;
        scene.background = new THREE.Color(0xf3f4f6);
      }
    }
  };

  const applyFitFrustumRef = useRef(applyFitFrustum);
  applyFitFrustumRef.current = applyFitFrustum;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf3f4f6);
    sceneRef.current = scene;

    const width = Math.max(el.clientWidth, 1);
    const height = Math.max(el.clientHeight, 1);
    const aspect = width / height;
    const frustum = 80;
    const camera = new THREE.OrthographicCamera(
      (-frustum * aspect) / 2,
      (frustum * aspect) / 2,
      frustum / 2,
      -frustum / 2,
      0.1,
      5000,
    );
    camera.up.copy(HOME_UP);
    camera.position.copy(HOME_DIR.clone().normalize().multiplyScalar(160));
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    rendererRef.current = renderer;
    el.appendChild(renderer.domElement);

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(width, height);
    labelRenderer.domElement.style.position = "absolute";
    labelRenderer.domElement.style.inset = "0";
    labelRenderer.domElement.style.pointerEvents = "none";
    labelRenderer.domElement.style.overflow = "hidden";
    el.appendChild(labelRenderer.domElement);
    labelRendererRef.current = labelRenderer;

    const badgeLayer = new THREE.Group();
    scene.add(badgeLayer);
    badgeLayerRef.current = badgeLayer;

    scene.add(new THREE.HemisphereLight(0xf8fafc, 0xcbd5e1, 0.55));
    scene.add(new THREE.AmbientLight(0xffffff, 0.22));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(40, -60, 90);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xe8eef8, 0.4);
    fill.position.set(-70, 40, 40);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.28);
    rim.position.set(10, 80, -50);
    scene.add(rim);
    const viewRight = new THREE.Vector3();
    const viewUp = new THREE.Vector3();
    const viewToward = new THREE.Vector3();
    const addViewLight = (color: number, intensity: number) => {
      const light = new THREE.DirectionalLight(color, intensity);
      scene.add(light);
      scene.add(light.target);
      return light;
    };
    const rightKey = addViewLight(0xfff6ee, 0.68);
    const rightLow = addViewLight(0xeaf0ff, 0.4);
    const rightFront = addViewLight(0xffffff, 0.34);

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    camera.lookAt(0, 0, 0);
    const controls = new ScreenSpaceOrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.syncFromCamera();
    controlsRef.current = controls;
    const cancelSnap = () => {
      snapRef.current = null;
    };
    controls.addEventListener("start", cancelSnap);

    const placeViewLight = (
      light: THREE.DirectionalLight,
      rightAmt: number,
      upAmt: number,
      towardAmt: number,
    ) => {
      light.position
        .copy(controls.target)
        .addScaledVector(viewRight, rightAmt)
        .addScaledVector(viewUp, upAmt)
        .addScaledVector(viewToward, towardAmt);
      light.target.position.copy(controls.target);
    };

    let raf = 0;
    const loop = () => {
      raf = window.requestAnimationFrame(loop);
      const snap = snapRef.current;
      if (snap) {
        const k = easeOutCubic(
          Math.min(1, (performance.now() - snap.start) / snap.duration),
        );
        camera.position.lerpVectors(snap.fromPos, snap.toPos, k);
        camera.up.lerpVectors(snap.fromUp, snap.toUp, k).normalize();
        controls.target.lerpVectors(snap.fromTarget, snap.toTarget, k);
        camera.zoom = snap.fromZoom + (snap.toZoom - snap.fromZoom) * k;
        if (
          snap.fromLeft != null &&
          snap.toLeft != null &&
          snap.fromRight != null &&
          snap.toRight != null &&
          snap.fromTop != null &&
          snap.toTop != null &&
          snap.fromBottom != null &&
          snap.toBottom != null
        ) {
          camera.left = snap.fromLeft + (snap.toLeft - snap.fromLeft) * k;
          camera.right = snap.fromRight + (snap.toRight - snap.fromRight) * k;
          camera.top = snap.fromTop + (snap.toTop - snap.fromTop) * k;
          camera.bottom =
            snap.fromBottom + (snap.toBottom - snap.fromBottom) * k;
        }
        camera.lookAt(controls.target);
        camera.updateProjectionMatrix();
        if (k >= 1) {
          snapRef.current = null;
          controls.syncFromCamera();
        }
      }
      camera.updateMatrixWorld();
      viewRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      viewUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
      viewToward.copy(camera.position).sub(controls.target);
      if (viewToward.lengthSq() < 1e-8) viewToward.set(0, 0, 1);
      else viewToward.normalize();
      placeViewLight(rightKey, 52, 24, 34);
      placeViewLight(rightLow, 44, -30, 22);
      placeViewLight(rightFront, 20, 6, 72);
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    };
    loop();

    const onResize = () => {
      const w = Math.max(el.clientWidth, 1);
      const h = Math.max(el.clientHeight, 1);
      renderer.setSize(w, h);
      labelRenderer.setSize(w, h);
      applyFitFrustumRef.current();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    const raycaster = new THREE.Raycaster();
    raycaster.params.Line = { threshold: 0.6 };
    const ndc = new THREE.Vector2();
    type EditDrag =
      | { kind: "margin"; tooth: string; index: number }
      | { kind: "transform"; tooth: string; scale0: number; x0: number }
      | { kind: "hook"; tooth: string }
      | { kind: "hole"; tooth: string; tilt0: number; y0: number }
      | { kind: "connector"; tooth: string; along0: number; x0: number }
      | { kind: "insertion"; key: string };
    let drag: EditDrag | null = null;
    let lastPointer = { x: 0, y: 0 };

    const aim = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const width = Math.max(rect.width, 1);
      const height = Math.max(rect.height, 1);
      ndc.set(
        ((event.clientX - rect.left) / width) * 2 - 1,
        -((event.clientY - rect.top) / height) * 2 + 1,
      );
      raycaster.params.Line = { threshold: Math.max(fitRadiusRef.current * 0.02, 0.35) };
      raycaster.setFromCamera(ndc, camera);
    };

    const toothFrame = (tooth: string) => {
      const place = placementsRef.current.find((row) => row.toothNumber === tooth);
      if (!place) return null;
      const axis = insertionAxesRef.current.find((row) =>
        row.toothNumbers.includes(tooth),
      );
      const normal = (axis?.dir ?? frameRef.current?.up ?? new THREE.Vector3(0, 0, 1))
        .clone()
        .normalize();
      const hint = frameRef.current?.right ?? new THREE.Vector3(1, 0, 0);
      const x = hint.clone().addScaledVector(normal, -hint.dot(normal));
      if (x.lengthSq() < 1e-8) x.crossVectors(normal, new THREE.Vector3(0, 1, 0));
      x.normalize();
      const z = new THREE.Vector3().crossVectors(x, normal).normalize();
      return { place, normal, x, z };
    };

    const planePoint = (tooth: string) => {
      const frame = toothFrame(tooth);
      if (!frame) return null;
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        frame.normal,
        frame.place.center,
      );
      const point = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(plane, point)) return null;
      const local = point.clone().sub(frame.place.center);
      const angle = Math.atan2(local.dot(frame.z), local.dot(frame.x));
      return { ...frame, point, angle };
    };

    const pickEdit = () => {
      const roots: THREE.Object3D[] = [];
      if (editLayerRef.current) roots.push(editLayerRef.current);
      if (
        insertionMarkerRef.current &&
        designEditRef.current?.tool === "insertion"
      ) {
        roots.push(insertionMarkerRef.current);
      }
      if (roots.length === 0) return null;
      const hits = raycaster.intersectObjects(roots, true);
      for (const hit of hits) {
        const tag = readEditHit(hit.object);
        if (!tag) continue;
        const marginPoints = hit.object.userData.marginPoints as
          | THREE.Vector3[]
          | undefined;
        return { tag, point: hit.point.clone(), marginPoints };
      }
      return null;
    };

    const marginRatio = (tooth: string, point: THREE.Vector3) => {
      const frame = toothFrame(tooth);
      const edit = designEditRef.current?.edits[tooth];
      if (!frame || !edit) return null;
      const unit = unitToMmRef.current || 1;
      const base = frame.place.radius * 0.78;
      if (base < 1e-6) return null;
      const offset = edit.margin.offsetMm / unit;
      const delta = point.clone().sub(frame.place.center);
      const axial = delta.dot(frame.normal);
      const radial = Math.sqrt(Math.max(0, delta.lengthSq() - axial * axial));
      return (radial - offset) / base;
    };

    const onEditPointerDown = (event: PointerEvent) => {
      if (!designEditRef.current) return;
      aim(event);
      const hit = pickEdit();
      if (!hit) return;
      const tool = designEditRef.current.tool;
      const brush = designEditRef.current.brush;
      const send = onDesignGestureRef.current;
      if (!send) return;

      if (hit.tag.kind === "insertion" && tool === "insertion" && event.button === 0) {
        drag = { kind: "insertion", key: hit.tag.key };
      } else if (hit.tag.kind === "margin" && event.button === 2) {
        send({ type: "margin-remove", tooth: hit.tag.tooth, index: hit.tag.index });
      } else if (hit.tag.kind === "margin" && event.button === 0 && tool === "margin") {
        drag = { kind: "margin", tooth: hit.tag.tooth, index: hit.tag.index };
      } else if (hit.tag.kind === "margin-line" && event.button === 0 && tool === "margin") {
        const points = hit.marginPoints ?? [];
        let near = 0;
        let best = Infinity;
        points.forEach((row, index) => {
          const dist = row.distanceTo(hit.point);
          if (dist < best) {
            best = dist;
            near = index;
          }
        });
        const ratio = marginRatio(hit.tag.tooth, hit.point);
        if (ratio == null) return;
        send({
          type: "margin-insert",
          tooth: hit.tag.tooth,
          index: near + 1,
          radius: ratio,
        });
      } else if (hit.tag.kind === "transform" && event.button === 0) {
        const scale0 =
          designEditRef.current.edits[hit.tag.tooth]?.refine.scale ?? 1;
        drag = { kind: "transform", tooth: hit.tag.tooth, scale0, x0: event.clientX };
      } else if (hit.tag.kind === "hook" && (event.button === 2 || brush === "erase")) {
        send({ type: "hook-off", tooth: hit.tag.tooth });
      } else if (hit.tag.kind === "hook" && event.button === 0) {
        drag = { kind: "hook", tooth: hit.tag.tooth };
      } else if (hit.tag.kind === "hole" && event.button === 0) {
        const tilt0 = designEditRef.current.edits[hit.tag.tooth]?.hole.tiltDeg ?? 0;
        drag = { kind: "hole", tooth: hit.tag.tooth, tilt0, y0: event.clientY };
      } else if (hit.tag.kind === "connector" && event.button === 0) {
        const along0 =
          designEditRef.current.edits[hit.tag.tooth]?.connector.along ?? 0.5;
        drag = { kind: "connector", tooth: hit.tag.tooth, along0, x0: event.clientX };
      } else if (hit.tag.kind === "crown" && event.button === 0) {
        const frame = toothFrame(hit.tag.tooth);
        if (!frame) return;
        const local = hit.point.clone().sub(frame.place.center);
        const angle = Math.atan2(local.dot(frame.z), local.dot(frame.x));
        const along = local.dot(frame.normal);
        if (tool === "hook") {
          send({
            type: "hook-angle",
            tooth: hit.tag.tooth,
            angle: ((angle * 180) / Math.PI + 360) % 360,
          });
        } else if (tool === "hole") {
          if (along < frame.place.radius * 0.08) {
            send({ type: "hole-reject", tooth: hit.tag.tooth });
          } else {
            send({
              type: "hole-angle",
              tooth: hit.tag.tooth,
              angle: ((angle * 180) / Math.PI + 360) % 360,
            });
          }
        } else if (tool === "cutback" && brush === "minus") {
          send({ type: "cutback-exclude", tooth: hit.tag.tooth, angle });
        } else if (tool === "refine" && brush === "sculpt") {
          send({ type: "sculpt", tooth: hit.tag.tooth, angle, amount: 0.42 });
        } else if (tool === "refine" && brush === "erase") {
          send({ type: "smooth", tooth: hit.tag.tooth });
        } else {
          return;
        }
      } else if (hit.tag.kind === "crown" && event.button === 2 && tool === "refine") {
        const placed = planePoint(hit.tag.tooth);
        if (!placed) return;
        send({ type: "sculpt", tooth: hit.tag.tooth, angle: placed.angle, amount: -0.42 });
      } else {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      lastPointer = { x: event.clientX, y: event.clientY };
    };

    const onEditPointerMove = (event: PointerEvent) => {
      if (!drag) return;
      aim(event);
      const send = onDesignGestureRef.current;
      if (!send) return;
      if (drag.kind === "margin") {
        const placed = planePoint(drag.tooth);
        if (!placed) return;
        const ratio = marginRatio(drag.tooth, placed.point);
        if (ratio == null) return;
        send({ type: "margin", tooth: drag.tooth, index: drag.index, radius: ratio });
      } else if (drag.kind === "transform") {
        send({
          type: "transform",
          tooth: drag.tooth,
          scale: drag.scale0 + (event.clientX - drag.x0) / 180,
        });
      } else if (drag.kind === "hook") {
        const placed = planePoint(drag.tooth);
        if (!placed) return;
        send({
          type: "hook-angle",
          tooth: drag.tooth,
          angle: ((placed.angle * 180) / Math.PI + 360) % 360,
        });
      } else if (drag.kind === "hole") {
        send({
          type: "hole-tilt",
          tooth: drag.tooth,
          tilt: drag.tilt0 + (drag.y0 - event.clientY) / 4,
        });
      } else if (drag.kind === "connector") {
        send({
          type: "connector",
          tooth: drag.tooth,
          along: drag.along0 + (event.clientX - drag.x0) / 240,
        });
      } else if (drag.kind === "insertion") {
        const axis = insertionAxesRef.current.find((row) => row.key === drag?.key);
        const rect = renderer.domElement.getBoundingClientRect();
        if (!axis) return;
        const dx = (event.clientX - lastPointer.x) / Math.max(rect.height, 1);
        const dy = (event.clientY - lastPointer.y) / Math.max(rect.height, 1);
        const screenRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
        const screenUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
        axis.dir.addScaledVector(screenRight, dx * 2.6).addScaledVector(screenUp, -dy * 2.6);
        if (axis.dir.lengthSq() > 1e-8) axis.dir.normalize();
        syncInsertionMarkerRef.current();
        lastPointer = { x: event.clientX, y: event.clientY };
      }
      event.preventDefault();
      event.stopPropagation();
    };

    const endEditDrag = (event: PointerEvent) => {
      if (!drag) return;
      if (drag.kind === "insertion") {
        const aimed = insertionAxesRef.current.find((row) => row.key === drag.key);
        for (const entry of loadedRef.current) entry.align = null;
        setLoadVersion((value) => value + 1);
        if (aimed) onInsertionAxisAimedRef.current?.(aimed.toothNumbers);
      }
      drag = null;
      event.stopPropagation();
    };

    const onEditContext = (event: Event) => {
      if (!designEditRef.current) return;
      aim(event as PointerEvent);
      const hit = pickEdit();
      if (!hit) return;
      event.preventDefault();
      event.stopPropagation();
    };

    renderer.domElement.addEventListener("pointerdown", onEditPointerDown, true);
    renderer.domElement.addEventListener("pointermove", onEditPointerMove, true);
    renderer.domElement.addEventListener("pointerup", endEditDrag, true);
    renderer.domElement.addEventListener("pointercancel", endEditDrag, true);
    renderer.domElement.addEventListener("contextmenu", onEditContext, true);

    let alignDown: { x: number; y: number } | null = null;
    const onAlignPointerDown = (event: PointerEvent) => {
      if (!manualRef.current.arch || manualRef.current.merging || event.button !== 0) {
        return;
      }
      alignDown = { x: event.clientX, y: event.clientY };
    };
    const onAlignPointerUp = (event: PointerEvent) => {
      const start = alignDown;
      alignDown = null;
      if (!start || !manualRef.current.arch || manualRef.current.merging) return;
      if (event.button !== 0) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
      alignApiRef.current.pick(event);
    };
    renderer.domElement.addEventListener("pointerdown", onAlignPointerDown);
    renderer.domElement.addEventListener("pointerup", onAlignPointerUp);

    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onEditPointerDown, true);
      renderer.domElement.removeEventListener("pointermove", onEditPointerMove, true);
      renderer.domElement.removeEventListener("pointerup", endEditDrag, true);
      renderer.domElement.removeEventListener("pointercancel", endEditDrag, true);
      renderer.domElement.removeEventListener("contextmenu", onEditContext, true);
      renderer.domElement.removeEventListener("pointerdown", onAlignPointerDown);
      renderer.domElement.removeEventListener("pointerup", onAlignPointerUp);
      controls.removeEventListener("start", cancelSnap);
      controls.dispose();
      for (const entry of loadedRef.current) {
        group.remove(entry.mesh);
        releaseSceneGeometry(entry.geometry);
        releaseSceneTexture(entry.texture);
        const prev = entry.mesh.material;
        const list = Array.isArray(prev) ? prev : [prev];
        for (const old of list) old.dispose();
      }
      loadedRef.current = [];
      placementsRef.current = [];
      for (const child of [...badgeLayer.children]) {
        (child as CSS2DObject).element.remove();
        badgeLayer.remove(child);
      }
      renderer.dispose();
      renderer.domElement.remove();
      labelRenderer.domElement.remove();
      const marker = insertionMarkerRef.current;
      if (marker) {
        scene.remove(marker);
        disposeObject3D(marker);
        insertionMarkerRef.current = null;
      }
      const edits = editLayerRef.current;
      if (edits) {
        scene.remove(edits);
        disposeObject3D(edits);
        editLayerRef.current = null;
      }
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      labelRendererRef.current = null;
      badgeLayerRef.current = null;
      controlsRef.current = null;
      groupRef.current = null;
    };
  }, []);

  placeLoadedRef.current = (reseated) => {
    const group = groupRef.current;
    const loaded = loadedRef.current;
    if (!group || loaded.length === 0) return;
    group.position.set(0, 0, 0);
    const box = new THREE.Box3().setFromObject(group);
    if (!box.isEmpty()) {
      if (!reseated) {
        const center = box.getCenter(new THREE.Vector3());
        group.position.sub(center);
      }
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      fitRadiusRef.current = Math.max(sphere.radius, 1);
    }
    const frame = estimateDentalFrame(loaded);
    frameRef.current = frame
      ? {
          up: frame.up.clone(),
          anterior: frame.anterior.clone(),
          right: frame.right.clone(),
        }
      : null;
    unitToMmRef.current = geometryUnitsToMm(fitRadiusRef.current);
    const framed = frame
      ? frameWorkOcclusal({
          loaded,
          groupPosition: group.position,
          frame,
          prepArch: lookRef.current.prepArch ?? null,
          toothNumbers: focusTeethRef.current,
        })
      : null;
    if (framed) {
      HOME_DIR.copy(framed.dir);
      HOME_UP.copy(framed.up);
      fitExtentRef.current = { halfW: framed.halfW, halfH: framed.halfH };
      fitTargetRef.current.copy(framed.target);
      placementsRef.current = framed.placements;
    } else {
      if (frame) applyDentalFrame(frame);
      const fit = measureMeshFit(loaded, group.position, HOME_DIR, HOME_UP);
      fitExtentRef.current = { halfW: fit.halfW, halfH: fit.halfH };
      fitTargetRef.current.copy(fit.target);
      placementsRef.current = [];
    }
    initialPoseRef.current = {
      dir: HOME_DIR.clone(),
      up: HOME_UP.clone(),
      target: fitTargetRef.current.clone(),
      halfW: fitExtentRef.current.halfW,
      halfH: fitExtentRef.current.halfH,
    };
    applyFitFrustum();
    frameCamera(HOME_DIR, HOME_UP, false);
    restyleLoaded();
    if (insertionAxesRef.current.length > 0) syncInsertionMarkerRef.current();
  };

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    let cancelled = false;
    const gen = ++layoutGenRef.current;

    const clearGroup = () => {
      for (const entry of loadedRef.current) {
        group.remove(entry.mesh);
        releaseSceneGeometry(entry.geometry);
        releaseSceneTexture(entry.texture);
        const prev = entry.mesh.material;
        const list = Array.isArray(prev) ? prev : [prev];
        for (const old of list) old.dispose();
      }
      loadedRef.current = [];
      placementsRef.current = [];
      const layer = badgeLayerRef.current;
      if (layer) {
        for (const child of [...layer.children]) {
          (child as CSS2DObject).element.remove();
          layer.remove(child);
        }
      }
      group.clear();
      group.position.set(0, 0, 0);
    };

    const sources = itemsRef.current;
    insertionAxesRef.current = [];
    syncInsertionMarkerRef.current();
    onInsertionAxisChangeRef.current?.(false);
    if (sources.length === 0) {
      clearGroup();
      setParseNote("");
      setAnalyzing(false);
      setAligning(false);
      onScanColorChangeRef.current?.(false);
      setLoadVersion((v) => v + 1);
      return;
    }

    void (async () => {
      clearGroup();
      setParseNote("");
      const failed: string[] = [];
      const loaded: LoadedMesh[] = [];
      await Promise.all(
        sources.map(async (source) => {
          try {
            const parsed = await loadCachedScanPreview(source);
            if (cancelled) {
              releaseSceneGeometry(parsed.geometry);
              releaseSceneTexture(parsed.texture);
              return;
            }
            parsed.geometry.computeBoundingBox();
            if (!parsed.geometry.getAttribute("normal")) {
              parsed.geometry.computeVertexNormals();
            }
            const hasColor = isScanColorPreview(parsed.geometry, parsed.texture);
            const colorAttr = parsed.geometry.getAttribute("color");
            const mesh = new THREE.Mesh(parsed.geometry);
            loaded.push({
              id: source.id,
              role: source.role,
              mesh,
              geometry: parsed.geometry,
              texture: parsed.texture,
              hasColor,
              scanColor:
                colorAttr instanceof THREE.BufferAttribute ? colorAttr : null,
              dist: null,
              align: null,
              analysisColor: null,
              basePositions: captureBasePositions(parsed.geometry),
              filePositions: captureBasePositions(parsed.geometry),
            });
          } catch {
            failed.push(source.fileName);
          }
        }),
      );
      if (cancelled) {
        for (const entry of loaded) {
          releaseSceneGeometry(entry.geometry);
          releaseSceneTexture(entry.texture);
        }
        return;
      }
      const latestRoles = new Map(
        itemsRef.current.map((item) => [item.id, item.role]),
      );
      for (const entry of loaded) {
        const nextRole = latestRoles.get(entry.id);
        if (nextRole) entry.role = nextRole;
      }
      setAligning(true);
      try {
        await registerJawsToBite(loaded, {
          cancelled: () => cancelled || gen !== layoutGenRef.current,
        });
      } catch (error) {
        console.info("[oral-scan] bite-fit failed", error);
      }
      if (cancelled || gen !== layoutGenRef.current) {
        for (const entry of loaded) {
          releaseSceneGeometry(entry.geometry);
          releaseSceneTexture(entry.texture);
        }
        return;
      }
      const seated = estimateDentalFrame(loaded);
      if (seated) reseatOcclusalOrigin(loaded, seated);
      for (const entry of loaded) group.add(entry.mesh);
      loadedRef.current = loaded;
      if (manualRef.current.arch) layoutSplitRef.current(manualRef.current.arch);
      else placeLoadedRef.current(Boolean(seated));
      setAligning(false);
      onScanColorChangeRef.current?.(loaded.some((entry) => entry.hasColor));
      setParseNote(
        failed.length ? `열지 못했습니다: ${failed.join(", ")}` : "",
      );
      setLoadVersion((v) => v + 1);
    })();

    return () => {
      cancelled = true;
    };
  }, [itemsKey]);

  const restyleRef = useRef(restyleLoaded);
  restyleRef.current = restyleLoaded;

  const clearAlignMarks = () => {
    for (const entry of loadedRef.current) {
      const marks = entry.mesh.children.filter((child) => child.userData.alignPick);
      for (const child of marks) {
        child.traverse((obj) => {
          const label = obj as CSS2DObject;
          if (label.element?.isConnected) label.element.remove();
        });
        entry.mesh.remove(child);
        disposeObject3D(child);
      }
    }
  };
  clearAlignMarksRef.current = clearAlignMarks;

  const roleBounds = (role: string) => {
    const box = new THREE.Box3();
    let any = false;
    for (const entry of loadedRef.current) {
      if (entry.role !== role) continue;
      entry.geometry.computeBoundingBox();
      const bounds = entry.geometry.boundingBox;
      if (!bounds || bounds.isEmpty()) continue;
      box.union(bounds);
      any = true;
    }
    return any ? box : null;
  };

  const finishAlignedView = () => {
    const loaded = loadedRef.current;
    for (const entry of loaded) {
      entry.mesh.position.set(0, 0, 0);
      entry.dist = null;
      entry.align = null;
      rememberPositions(entry);
    }
    const seated = estimateDentalFrame(loaded);
    if (seated) {
      reseatOcclusalOrigin(loaded, seated);
      for (const entry of loaded) rememberPositions(entry);
    }
    manualRef.current.arch = null;
    manualRef.current.model = [];
    manualRef.current.bite = [];
    manualRef.current.skipLayout = true;
    placeLoadedRef.current(Boolean(seated));
    syncBadgesRef.current();
    setLoadVersion((value) => value + 1);
  };

  const layoutSplit = (arch: "upper" | "lower") => {
    const group = groupRef.current;
    const loaded = loadedRef.current;
    if (!group || loaded.length === 0) return;
    clearAlignMarks();
    manualRef.current.model = [];
    manualRef.current.bite = [];
    manualRef.current.arch = arch;
    for (const entry of loaded) entry.mesh.position.set(0, 0, 0);
    group.position.set(0, 0, 0);
    const archBox = roleBounds(arch);
    const biteBox = roleBounds("bite");
    if (!archBox || !biteBox) {
      restyleLoaded();
      return;
    }
    const frame = estimateDentalFrame(loaded);
    if (frame) applyDentalFrame(frame);
    frameRef.current = frame
      ? {
          up: frame.up.clone(),
          anterior: frame.anterior.clone(),
          right: frame.right.clone(),
        }
      : null;
    const viewDir = HOME_DIR.clone().normalize();
    const up = HOME_UP.clone();
    if (Math.abs(up.dot(viewDir)) > 0.92) up.set(0, 0, 1);
    up.normalize();
    const screenRight = new THREE.Vector3().crossVectors(viewDir, up);
    if (screenRight.lengthSq() < 1e-8) screenRight.set(1, 0, 0);
    screenRight.normalize();
    const archCenter = archBox.getCenter(new THREE.Vector3());
    const biteCenter = biteBox.getCenter(new THREE.Vector3());
    const halfAlong = (box: THREE.Box3) => {
      const size = box.getSize(new THREE.Vector3());
      return (
        0.5 *
        (Math.abs(size.x * screenRight.x) +
          Math.abs(size.y * screenRight.y) +
          Math.abs(size.z * screenRight.z))
      );
    };
    const archHalf = halfAlong(archBox);
    const biteHalf = halfAlong(biteBox);
    const gap = Math.max(archHalf, biteHalf) * 0.16;
    const halfSep = (archHalf + biteHalf + gap) * 0.5;
    const archOffset = screenRight.clone().multiplyScalar(-halfSep).sub(archCenter);
    const biteOffset = screenRight.clone().multiplyScalar(halfSep).sub(biteCenter);
    for (const entry of loaded) {
      if (entry.role === arch) entry.mesh.position.copy(archOffset);
      else if (entry.role === "bite") entry.mesh.position.copy(biteOffset);
    }
    group.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3();
    for (const entry of loaded) {
      if (entry.role !== arch && entry.role !== "bite") continue;
      entry.mesh.updateWorldMatrix(true, false);
      bounds.expandByObject(entry.mesh);
    }
    if (!bounds.isEmpty()) {
      const center = bounds.getCenter(new THREE.Vector3());
      group.position.sub(center);
      fitRadiusRef.current = Math.max(bounds.getBoundingSphere(new THREE.Sphere()).radius, 1);
    }
    unitToMmRef.current = geometryUnitsToMm(fitRadiusRef.current);
    const shown = loaded.filter((entry) => entry.role === arch || entry.role === "bite");
    const fit = measureMeshFit(shown, group.position, HOME_DIR, HOME_UP);
    fitExtentRef.current = { halfW: fit.halfW, halfH: fit.halfH };
    fitTargetRef.current.copy(fit.target);
    applyFitFrustum();
    frameCamera(HOME_DIR, HOME_UP, false);
    restyleLoaded();
    syncBadgesRef.current();
  };
  layoutSplitRef.current = layoutSplit;

  const addAlignMark = (entry: LoadedMesh, local: THREE.Vector3, index: number) => {
    const radius = Math.max(fitRadiusRef.current * 0.014, 0.35);
    const colors = [0xef4444, 0x22c55e, 0xf59e0b];
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 16, 12),
      new THREE.MeshBasicMaterial({
        color: colors[index] ?? 0xffffff,
        depthTest: false,
      }),
    );
    sphere.position.copy(local);
    sphere.renderOrder = 8;
    sphere.userData.alignPick = true;
    const tag = document.createElement("div");
    tag.textContent = String(index + 1);
    tag.style.cssText = [
      "width:16px",
      "height:16px",
      "margin-top:-8px",
      "border-radius:999px",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "font:700 10px/1 sans-serif",
      "color:#fff",
      "background:rgba(15,23,42,0.78)",
      "pointer-events:none",
    ].join(";");
    const label = new CSS2DObject(tag);
    label.position.set(0, radius * 2.1, 0);
    label.userData.alignPick = true;
    sphere.add(label);
    entry.mesh.add(sphere);
  };

  const runManualMerge = async () => {
    const arch = manualRef.current.arch;
    if (!arch || manualRef.current.merging) return;
    if (manualRef.current.model.length < 3 || manualRef.current.bite.length < 3) return;
    const loaded = loadedRef.current;
    const arches = loaded.filter((entry) => entry.role === arch);
    const bites = loaded.filter((entry) => entry.role === "bite");
    manualRef.current.merging = true;
    setAligning(true);
    const model = manualRef.current.model.map(
      (point) => [point.x, point.y, point.z] as [number, number, number],
    );
    const bite = manualRef.current.bite.map(
      (point) => [point.x, point.y, point.z] as [number, number, number],
    );
    let ok = false;
    try {
      ok = await mergeArchToBiteByPoints(
        arches.map((entry) => entry.geometry),
        bites.map((entry) => entry.geometry),
        model,
        bite,
      );
    } catch (error) {
      console.info("[oral-scan] bite-points failed", error);
      ok = false;
    }
    clearAlignMarks();
    manualRef.current.merging = false;
    setAligning(false);
    if (!ok) {
      manualRef.current.model = [];
      manualRef.current.bite = [];
      onAlignProgressRef.current?.({ model: 0, bite: 0 });
      onAlignFailedRef.current?.();
      return;
    }
    for (const entry of loaded) entry.mesh.position.set(0, 0, 0);
    finishAlignedView();
    onAlignProgressRef.current?.({ model: 0, bite: 0 });
    onAlignMergedRef.current?.(arch);
  };

  alignApiRef.current.pick = (event) => {
    const arch = manualRef.current.arch;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!arch || !renderer || !camera || manualRef.current.merging) return;
    groupRef.current?.updateWorldMatrix(true, true);
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
      -((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const meshes = loadedRef.current
      .filter((entry) => entry.mesh.visible)
      .map((entry) => entry.mesh);
    const hit = raycaster.intersectObjects(meshes, false)[0];
    if (!hit) return;
    const entry = loadedRef.current.find((row) => row.mesh === hit.object);
    if (!entry) return;
    const side = entry.role === "bite" ? "bite" : entry.role === arch ? "model" : null;
    if (!side) return;
    const list = manualRef.current[side];
    if (list.length >= 3) return;
    const local = entry.mesh.worldToLocal(hit.point.clone());
    list.push(local);
    addAlignMark(entry, local, list.length - 1);
    onAlignProgressRef.current?.({
      model: manualRef.current.model.length,
      bite: manualRef.current.bite.length,
    });
    if (manualRef.current.model.length >= 3 && manualRef.current.bite.length >= 3) {
      void runManualMerge();
    }
  };

  alignAutoRef.current = async () => {
    const loaded = loadedRef.current;
    if (loaded.length === 0) return false;
    manualRef.current.merging = true;
    manualRef.current.skipLayout = true;
    clearAlignMarks();
    manualRef.current.model = [];
    manualRef.current.bite = [];
    manualRef.current.arch = null;
    for (const entry of loaded) {
      entry.mesh.position.set(0, 0, 0);
      restoreFilePositions(entry);
    }
    setAligning(true);
    let ok = false;
    try {
      ok = await registerJawsToBite(loaded);
      const seated = estimateDentalFrame(loaded);
      if (seated) reseatOcclusalOrigin(loaded, seated);
      for (const entry of loaded) {
        entry.dist = null;
        entry.align = null;
        rememberPositions(entry);
      }
      placeLoadedRef.current(Boolean(seated));
      syncBadgesRef.current();
      setLoadVersion((value) => value + 1);
      return ok;
    } catch (error) {
      console.info("[oral-scan] bite-fit failed", error);
      return false;
    } finally {
      manualRef.current.merging = false;
      manualRef.current.skipLayout = false;
      setAligning(false);
    }
  };

  clearPicksRef.current = () => {
    if (manualRef.current.merging) return;
    clearAlignMarks();
    manualRef.current.model = [];
    manualRef.current.bite = [];
    onAlignProgressRef.current?.({ model: 0, bite: 0 });
  };

  exitAlignViewRef.current = () => {
    clearAlignMarks();
    manualRef.current.model = [];
    manualRef.current.bite = [];
    manualRef.current.arch = null;
    for (const entry of loadedRef.current) entry.mesh.position.set(0, 0, 0);
    if (loadedRef.current.length > 0) {
      const seated = estimateDentalFrame(loadedRef.current);
      placeLoadedRef.current(Boolean(seated));
    }
    syncBadgesRef.current();
  };

  useEffect(() => {
    const next = manualAlignArch ?? null;
    const prev = alignWatchRef.current;
    alignWatchRef.current = next;
    if (manualRef.current.skipLayout) {
      manualRef.current.skipLayout = false;
      manualRef.current.arch = next;
      return;
    }
    if (next === prev) return;
    manualRef.current.arch = next;
    manualRef.current.model = [];
    manualRef.current.bite = [];
    clearAlignMarksRef.current();
    onAlignProgressRef.current?.({ model: 0, bite: 0 });
    if (loadedRef.current.length === 0) return;
    if (!next) {
      exitAlignViewRef.current();
      return;
    }
    layoutSplitRef.current(next);
  }, [manualAlignArch]);

  useEffect(() => {
    const loaded = loadedRef.current;
    if (loaded.length === 0) return;
    const byId = new Map(itemsRef.current.map((item) => [item.id, item.role]));
    let changed = false;
    for (const entry of loaded) {
      const next = byId.get(entry.id);
      if (!next || next === entry.role) continue;
      changed = true;
    }
    if (!changed) return;
    const gen = ++layoutGenRef.current;
    for (const entry of loaded) {
      restoreBasePositions(entry);
      const next = byId.get(entry.id);
      if (next) entry.role = next;
    }
    setAligning(true);
    void (async () => {
      try {
        await registerJawsToBite(loaded, {
          cancelled: () => gen !== layoutGenRef.current,
        });
        if (gen !== layoutGenRef.current) return;
        const seated = estimateDentalFrame(loaded);
        if (seated) reseatOcclusalOrigin(loaded, seated);
        if (manualRef.current.arch) layoutSplitRef.current(manualRef.current.arch);
        else placeLoadedRef.current(Boolean(seated));
        setLoadVersion((version) => version + 1);
      } finally {
        if (gen === layoutGenRef.current) setAligning(false);
      }
    })();
  }, [roleKey]);

  useEffect(() => {
    const loaded = loadedRef.current;
    const look = lookRef.current;
    if (loaded.length === 0 || (!look.contactMap && !look.undercutMap)) {
      setAnalyzing(false);
      return;
    }
    const frame = frameRef.current;
    const anchors = anchorsFromAxes(
      insertionAxesRef.current,
      placementsRef.current,
      groupRef.current?.position ?? new THREE.Vector3(),
    );
    const pending = loaded.some((entry) => {
      const needsDist =
        look.contactMap &&
        antagonistRole(entry.role, prepArch) != null &&
        entry.dist == null;
      const needsAlign =
        look.undercutMap &&
        entry.align == null &&
        (anchors.some((anchor) => anchor.arch === entry.role) ||
          insertionForRole(entry.role, prepArch, frame, null) != null);
      return needsDist || needsAlign;
    });
    if (!pending) {
      setAnalyzing(false);
      return;
    }
    let cancelled = false;
    setAnalyzing(true);
    void fillDesignAnalysis(
      loaded,
      prepArch,
      frame,
      unitToMmRef.current,
      () => cancelled,
      anchors,
    ).then(() => {
      if (cancelled) return;
      setAnalyzing(false);
      restyleRef.current();
    });
    return () => {
      cancelled = true;
    };
  }, [prepArch, loadVersion, contactMap, undercutMap]);

  useEffect(() => {
    const opacity = lookRef.current.ghostOpacity;
    const prep = lookRef.current.prepArch;
    const split = manualRef.current.arch;
    for (const entry of loadedRef.current) {
      const ghostOff = isGhostScanRole(entry.role, prep) && opacity <= 0.001;
      const hidden =
        split != null && entry.role !== split && entry.role !== "bite";
      const forced = split != null && (entry.role === split || entry.role === "bite");
      entry.mesh.visible = forced
        ? true
        : !hidden && !ghostOff && visible[entry.id] !== false;
    }
  }, [visible, loadVersion, ghostOpacity, prepArch, manualAlignArch]);

  useEffect(() => {
    restyleLoaded();
  }, [
    colorMapping,
    ghostOpacity,
    prepArch,
    contactMap,
    undercutMap,
    occlusalGapMm,
    contactMode,
    undercutLimit,
    designEdit?.prepBackTransparent,
    loadVersion,
  ]);

  setViewRef.current = (preset) => {
    const frame = frameRef.current;
    if (preset === "fit" || !frame) {
      frameCamera(HOME_DIR, HOME_UP, true);
      return;
    }
    if (preset === "occlusal") {
      frameCamera(HOME_DIR, HOME_UP, true);
      return;
    }
    if (preset === "buccal") {
      frameCamera(frame.anterior, frame.up, true);
      return;
    }
    frameCamera(frame.anterior.clone().negate(), frame.up, true);
  };

  focusToothRef.current = (raw) => {
    const digits = fdiDigits(raw);
    const place = placementsRef.current.find((row) => row.toothNumber === digits);
    const frame = frameRef.current;
    if (!place || !frame) return;
    const pose = occlusalCamera(frame, place.arch);
    const half = toothWindowHalf([place], fitRadiusRef.current);
    fitExtentRef.current = { halfW: half, halfH: half };
    fitTargetRef.current.copy(place.center);
    HOME_DIR.copy(pose.dir);
    HOME_UP.copy(pose.up);
    applyFitFrustum();
    frameCamera(pose.dir, pose.up, true);
  };

  restoreInsertionViewRef.current = (toothNumbers) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const key = insertionAxisKey(toothNumbers);
    const digits = toothNumbers.map((tooth) => fdiDigits(tooth)).filter(Boolean);
    const axis =
      insertionAxesRef.current.find((row) => row.key === key) ??
      insertionAxesRef.current.find((row) =>
        digits.some((tooth) => row.toothNumbers.includes(tooth)),
      );
    if (!camera || !controls || !axis?.view) return false;
    const view = axis.view;
    fitTargetRef.current.copy(view.target);
    snapRef.current = {
      start: performance.now(),
      duration: 280,
      fromPos: camera.position.clone(),
      toPos: view.position.clone(),
      fromUp: camera.up.clone(),
      toUp: view.up.clone(),
      fromTarget: controls.target.clone(),
      toTarget: view.target.clone(),
      fromZoom: camera.zoom,
      toZoom: view.zoom,
      fromLeft: camera.left,
      toLeft: view.left,
      fromRight: camera.right,
      toRight: view.right,
      fromTop: camera.top,
      toTop: view.top,
      fromBottom: camera.bottom,
      toBottom: view.bottom,
    };
    return true;
  };

  syncBadgesRef.current = () => {
    const layer = badgeLayerRef.current;
    if (!layer) return;
    for (const child of [...layer.children]) {
      (child as CSS2DObject).element.remove();
      layer.remove(child);
    }
    if (manualRef.current.arch) return;
    const frame = frameRef.current;
    const used = new Set<string>();
    const placeOnRing = (button: HTMLButtonElement, parent: HTMLElement) => {
      button.type = "button";
      button.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelectToothRef.current?.(button.textContent ?? "");
      });
      parent.appendChild(button);
    };
    if (showInsertionRef.current) {
      for (const axis of insertionAxesRef.current) {
        const rows = badgesRef.current.filter((badge) =>
          axis.toothNumbers.includes(fdiDigits(badge.toothNumber)),
        );
        if (rows.length === 0 || !axis.origin) continue;
        const wrap = document.createElement("div");
        wrap.className = "pointer-events-auto flex items-center justify-center";
        for (const badge of rows) {
          const button = document.createElement("button");
          button.textContent = badge.toothNumber;
          button.className = badge.active
            ? "rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary-foreground"
            : "rounded-full bg-background/95 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-foreground shadow-sm";
          placeOnRing(button, wrap);
          used.add(fdiDigits(badge.toothNumber));
        }
        const label = new CSS2DObject(wrap);
        label.position.copy(
          insertionRingCenter(
            axis.origin,
            axis.dir,
            axis.radius,
            unitToMmRef.current,
          ),
        );
        label.center.set(0.5, 0.5);
        layer.add(label);
      }
    }
    if (!frame) return;
    for (const badge of badgesRef.current) {
      const digits = fdiDigits(badge.toothNumber);
      if (!digits || used.has(digits)) continue;
      const place = placementsRef.current.find((row) => row.toothNumber === digits);
      if (!place) continue;
      const pose = occlusalCamera(frame, place.arch);
      const lift = Math.max(place.radius * 0.2, fitRadiusRef.current * 0.008);
      const button = document.createElement("button");
      button.textContent = badge.toothNumber;
      button.className = badge.active
        ? "pointer-events-auto rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground shadow-sm"
        : "pointer-events-auto rounded-md border border-border bg-background/95 px-2 py-1 text-xs font-semibold text-foreground shadow-sm";
      button.type = "button";
      button.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelectToothRef.current?.(badge.toothNumber);
      });
      const label = new CSS2DObject(button);
      label.position.copy(place.center).addScaledVector(pose.dir, lift);
      label.center.set(0.5, 0.5);
      layer.add(label);
    }
  };

  const badgeKey = toothBadges
    .map((badge) => `${badge.toothNumber}:${badge.active ? 1 : 0}`)
    .join("|");

  useEffect(() => {
    syncBadgesRef.current();
  }, [badgeKey, loadVersion, showInsertionAxis]);

  syncInsertionMarkerRef.current = () => {
    const scene = sceneRef.current;
    const prev = insertionMarkerRef.current;
    if (prev && scene) {
      scene.remove(prev);
      disposeObject3D(prev);
    }
    insertionMarkerRef.current = null;
    const axes = insertionAxesRef.current;
    if (!scene || !showInsertionRef.current || axes.length === 0) return;
    const layer = new THREE.Group();
    for (const axis of axes) {
      const origin = axis.origin?.clone() ?? null;
      const radius =
        axis.radius > 0
          ? axis.radius
          : Math.max(fitRadiusRef.current * 0.08, 1);
      if (!origin) continue;
      layer.add(
        buildInsertionMarker(
          origin,
          radius,
          axis.dir,
          axis.key,
          unitToMmRef.current,
        ),
      );
    }
    if (layer.children.length === 0) return;
    scene.add(layer);
    insertionMarkerRef.current = layer;
  };

  useEffect(() => {
    syncInsertionMarkerRef.current();
  }, [showInsertionAxis]);

  resetHomeRef.current = () => {
    const pose = initialPoseRef.current;
    if (!pose) return;
    fitExtentRef.current = { halfW: pose.halfW, halfH: pose.halfH };
    fitTargetRef.current.copy(pose.target);
    applyFitFrustum();
    frameCamera(pose.dir, pose.up, true);
  };

  useImperativeHandle(
    ref,
    () => ({
      setView: (preset) => setViewRef.current(preset),
      focusTooth: (toothNumber) => focusToothRef.current(toothNumber),
      restoreInsertionView: (toothNumbers) =>
        restoreInsertionViewRef.current(toothNumbers),
      saveImage: () => saveImageRef.current(),
      resetHomeView: () => resetHomeRef.current(),
      alignToBiteAuto: () => alignAutoRef.current(),
      clearAlignPicks: () => clearPicksRef.current(),
      setInsertionFromView: (toothNumbers) => {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        const key = insertionAxisKey(toothNumbers);
        if (!camera || !controls || !key) return false;
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(true);
        groupRef.current?.updateWorldMatrix(true, true);
        const places: ToothPlacement[] = [];
        for (const tooth of key.split(",")) {
          const place = placementsRef.current.find(
            (row) => row.toothNumber === tooth,
          );
          if (place) places.push(place);
        }
        const center = new THREE.Vector3();
        let radius = 0;
        for (const place of places) {
          center.add(place.center);
          radius = Math.max(radius, place.radius);
        }
        if (places.length > 0) center.multiplyScalar(1 / places.length);
        else center.copy(controls.target);
        if (!(radius > 0)) {
          const height =
            Math.abs(camera.top - camera.bottom) / Math.max(camera.zoom, 1e-6);
          radius = Math.max(height * 0.06, 1);
        }
        const toothRadius = radius;
        const arch = places[0]?.arch;
        const loaded = loadedRef.current.filter((entry) => entry.mesh.visible);
        const scoped = arch
          ? loaded.filter((entry) => entry.role === arch)
          : loaded;
        const meshes = (scoped.length > 0 ? scoped : loaded).map(
          (entry) => entry.mesh,
        );
        const view = viewCenterHit(camera, meshes);
        const look = view.dir;
        if (look.lengthSq() < 1e-8) return false;
        let contact = view.point;
        if (!contact) contact = rayToothContact(center, look, toothRadius, meshes);
        if (!contact && places.length > 0) contact = center.clone();
        if (!contact) contact = controls.target.clone();
        placementsRef.current = alignPlacementsToPoint(
          placementsRef.current,
          key.split(","),
          contact,
          toothRadius,
        );
        const framed = fitExtentRef.current.halfH;
        radius = Math.max(Math.min(toothRadius * 0.48, framed * 0.2), 0.6);
        const kept = insertionAxesRef.current.filter((axis) => axis.key !== key);
        kept.push({
          key,
          toothNumbers: key.split(","),
          dir: look.clone(),
          origin: contact,
          radius,
          view: {
            position: camera.position.clone(),
            target: controls.target.clone(),
            up: camera.up.clone(),
            zoom: camera.zoom,
            left: camera.left,
            right: camera.right,
            top: camera.top,
            bottom: camera.bottom,
          },
        });
        insertionAxesRef.current = kept;
        for (const entry of loadedRef.current) entry.align = null;
        syncInsertionMarkerRef.current();
        syncBadgesRef.current();
        onInsertionAxisChangeRef.current?.(kept.length > 0);
        setLoadVersion((v) => v + 1);
        return true;
      },
      detectColorMargins: (toothNumbers) => {
        groupRef.current?.updateWorldMatrix(true, true);
        const right = frameRef.current?.right ?? new THREE.Vector3(1, 0, 0);
        const fallback = frameRef.current?.up ?? new THREE.Vector3(0, 0, 1);
        const loaded = loadedRef.current;
        const out: Array<{ tooth: string; radii: number[]; depths: number[] }> = [];
        for (const raw of toothNumbers) {
          const tooth = fdiDigits(raw);
          if (!tooth) continue;
          const place = placementsRef.current.find((row) => row.toothNumber === tooth);
          if (!place || !(place.radius > 0)) continue;
          const axis = insertionAxesRef.current.find((row) =>
            row.toothNumbers.includes(tooth),
          );
          const normal = axis?.dir ?? fallback;
          const entries = loaded.filter(
            (entry) => entry.role === place.arch && entry.scanColor,
          );
          if (entries.length === 0) continue;
          const triangles = collectProjectedMarginTriangles(
            entries,
            place.center,
            normal,
            right,
            place.radius,
          );
          const line = detectProjectedColorMargin(triangles, place.radius);
          if (!line) continue;
          out.push({ tooth: raw, radii: line.radii, depths: line.depths });
        }
        return out;
      },
    }),
    [],
  );

  const onSaveImage = () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;
    renderer.render(scene, camera);
    triggerPngDownload(renderer.domElement.toDataURL("image/png"));
  };
  saveImageRef.current = onSaveImage;

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const prev = editLayerRef.current;
    if (prev) {
      scene.remove(prev);
      disposeObject3D(prev);
      editLayerRef.current = null;
    }
    if (!designEdit) return;
    const insertionByTooth = new Map<string, THREE.Vector3>();
    for (const axis of insertionAxesRef.current) {
      for (const tooth of axis.toothNumbers) insertionByTooth.set(tooth, axis.dir);
    }
    const layer = buildProsthesisEditLayer({
      placements: placementsRef.current,
      frame: frameRef.current,
      insertionByTooth,
      unitToMm: unitToMmRef.current,
      spec: designEdit,
    });
    scene.add(layer);
    editLayerRef.current = layer;
  }, [designEdit, loadVersion, showInsertionAxis]);

  return (
    <div className={cn("relative h-full min-h-0 w-full", className)}>
      <div ref={containerRef} className="absolute inset-0" />
      {showCenterGuides ? (
        <div
          className="pointer-events-none absolute inset-0 z-[4]"
          aria-hidden
        >
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 border-t border-dashed border-slate-900/75" />
          <div className="absolute bottom-0 left-1/2 top-0 -translate-x-1/2 border-l border-dashed border-slate-900/75" />
        </div>
      ) : null}

      {busy && items.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
          <p className="rounded-md bg-background/90 px-3 py-2 text-sm text-muted-foreground shadow-sm">
            {busyLabel || "스캔을 불러오는 중…"}
          </p>
        </div>
      ) : null}

      {parseNote ? (
        <p className="absolute left-3 top-3 z-10 max-w-sm rounded-md bg-background/95 px-3 py-2 text-xs text-destructive shadow-sm">
          {parseNote}
        </p>
      ) : null}

      {aligning && items.length > 0 ? (
        <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-md bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
          바이트에 맞추는 중
        </p>
      ) : analyzing && items.length > 0 ? (
        <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-md bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
          접촉과 언더컷을 계산하는 중
        </p>
      ) : null}
    </div>
  );
},
);
