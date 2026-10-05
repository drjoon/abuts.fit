// 기공소 AI 보철 — 수정값을 치아 위에 그리는 레이어.

import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import {
  adaptCrownVertices,
  signedDistanceMm,
  type DiscPlane,
  type GingivalAdapt,
  type ScanCloud,
  type ScanColumns,
  type ScanGrid,
} from "@/shared/practice/crownAdapt";
import {
  buildIntaglio,
  IntaglioProbe,
  marginStripIndex,
  orientIntaglioIndex,
  raiseOuterToThickness,
  type IntaglioFailure,
  type IntaglioMesh,
} from "@/shared/practice/crownIntaglio";
import {
  colorMapRgb,
  emptyColorMapValues,
  paintColorMap,
  type ColorMapState,
  type ColorMapValues,
} from "@/shared/practice/labColorMap";
import { fdiToothDigits } from "@/shared/practice/toothArchOrder";
import { shapeToothMorphology } from "@/shared/practice/toothMorphology";
import {
  contactColorRgb,
  type ContactPaintMode,
} from "@/shared/practice/oralScanDesignAnalysis";
import {
  connectorIsWeak,
  connectorOutline,
  crownScale,
  innerGapMm,
  localShellThicknessMm,
  marginPointAngle,
  thicknessAlertRgb,
  type ConnectorShape,
  type PonticBase,
  type ProsthesisDesignEdit,
  type ScanbodyShape,
  type ToothDesignEdit,
} from "@/shared/practice/labProsthesisModify";
import {
  cavityDepthMm,
  cavityTaperIssue,
  normalizeCavityInfo,
} from "@/shared/practice/labInlayDesign";
import { cutbackMask } from "@/shared/practice/labCutback";
import { makeCavityRestorationGeometry } from "@/shared/components/practice/labInlayGeometry";

export type EditHit =
  | { kind: "margin"; tooth: string; index: number }
  | { kind: "margin-line"; tooth: string }
  | { kind: "crown"; tooth: string }
  | {
      kind: "transform";
      tooth: string;
      handle: TransformHandle;
      /** 모서리 핸들의 가로·세로 쪽. */
      sx?: -1 | 1;
      sz?: -1 | 1;
    }
  | { kind: "hook"; tooth: string; index: number }
  | { kind: "hole"; tooth: string }
  | { kind: "hole-tip"; tooth: string; end: "top" | "bottom" }
  | { kind: "connector"; tooth: string }
  | { kind: "scanbody"; tooth: string }
  | { kind: "insertion"; key: string };

export type TransformHandle = "corner" | "move" | "rotate" | "height";

/** 변형 핸들이 끌 때 보는 크라운 상자. 월드 좌표. 핸들 `userData.transformBox`에 둔다. */
export type TransformBox = {
  center: THREE.Vector3;
  normal: THREE.Vector3;
  /** 돌린 크라운의 가로·세로 축. */
  x: THREE.Vector3;
  z: THREE.Vector3;
  /** 돌리기 전 치아 축. 이동 거리는 이 축으로 잰다. */
  frameX: THREE.Vector3;
  frameZ: THREE.Vector3;
  halfX: number;
  halfZ: number;
};

/** 크라운 맞춤에 쓰는 스캔. 뷰어가 치아마다 모아 둔다. */
export type CrownAdaptScan = {
  opposing: ScanGrid | null;
  adjacent: ScanGrid | null;
  adjacentColumns: ScanColumns | null;
  ridge: ScanColumns | null;
  /** 마진 둘레 치은. 크라운 경부를 띄울 때 쓴다. */
  gingiva: ScanColumns | null;
  /** 마진 안쪽 지대치 악 스캔 점. 내면을 만들 때 쓴다. 마진이 없으면 null. */
  prep: ScanCloud | null;
  /** `prep` 격자. 내면과 지대치 사이 간격을 잴 때 쓴다. */
  prepGrid: ScanGrid | null;
};

/** 크라운 내면 계산 결과. */
export type CrownIntaglioInfo = {
  /** ok=내면을 만들었다, off=끔·해당 없음, sparse=지대치 스캔이 성겨 못 만든다, margin=마진이 모자라다. */
  status: "ok" | "off" | IntaglioFailure;
  /** ok일 때 외면과 내면 사이 가장 얇은 곳(mm). 테두리는 뺀다. */
  minThicknessMm?: number;
  /** ok일 때 설계 간격에서 가장 크게 벗어난 곳(mm, 절댓값). 스캔 구멍·잡음이 원인이다. */
  maxGapErrorMm?: number;
};

/** 내면 정점이 지대치에서 이보다 멀면 간격을 재지 않는다(mm). */
const FIT_PROBE_MM = 0.8;

/** 맞춘 크라운 메시. 수정값·자세·스캔이 같으면 다시 맞추지 않는다. */
export type CachedCrown = {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  index: Uint32Array | null;
  shellMm: number | null;
  /** 외면(0)과 내면(1)을 나눈 머티리얼 조각. 내면이 없으면 빈 배열. */
  groups: Array<{ start: number; count: number; materialIndex: number }>;
  /** 정점마다 잰 칼라맵 값. 칼라맵을 켜지 않았으면 null. */
  values: ColorMapValues | null;
  intaglio: CrownIntaglioInfo;
  /** 앞쪽 외면 정점 수. 뒤는 내면이다. */
  outerCount: number;
};

/** 점마다 가장 가까운 스캔 면까지의 부호 거리(mm). 바깥이 +. 스캔이 멀면 null. */
export type ScanDistanceProbe = (
  tooth: string,
  points: readonly THREE.Vector3[],
  normals: readonly THREE.Vector3[],
) => Array<number | null>;

/** -0.1 빨강 → 0 초록 → +0.1 파랑. 칼라맵과 같은 색 막대(`colorMapRgb`). */
export function fitDistanceRgb(mm: number | null): [number, number, number] {
  return colorMapRgb(mm, 0.1) ?? [0.78, 0.8, 0.83];
}

/** 임플란트 축과 스캔바디 윗면 중심. 맞추기 전이면 치아 추정 중심과 삽입축. */
export function implantPose(
  place: { center: THREE.Vector3 },
  normal: THREE.Vector3,
  implant: ToothDesignEdit["implant"],
) {
  const axis = implant.axis
    ? new THREE.Vector3(...implant.axis).normalize()
    : normal.clone().normalize();
  const top = place.center.clone().add(new THREE.Vector3(...implant.offset));
  return { axis, top };
}

type Place = {
  toothNumber: string;
  center: THREE.Vector3;
  radius: number;
};

type Frame = {
  up: THREE.Vector3;
  right: THREE.Vector3;
  anterior: THREE.Vector3;
};

const CROWN_RGB: [number, number, number] = [243 / 255, 239 / 255, 232 / 255];
const MARGIN = 0x14b8a6;
const TAPER_UNDERCUT = 0xdc2626;
const TAPER_WIDE = 0xf59e0b;
/** 훅 도구에서 잡을 수 있는 훅을 살짝 띄워 보인다. */
const HOOK_EDIT_GLOW = 0x0ea5e9;
/** 컷백 선택 영역. 마진 선과 같은 청록 계열. */
const CUTBACK_SELECT_RGB: [number, number, number] = [0.16, 0.86, 0.78];
/** 프리셋 그림과 같은 색. 시멘트 갭 하늘, 마진 실 노랑. */
const INNER_GAP = 0x7dd3fc;
const INNER_SEAL = 0xfacc15;

export function basisQuaternion(normal: THREE.Vector3, rightHint: THREE.Vector3) {
  const y = normal.clone().normalize();
  const x = rightHint.clone().addScaledVector(y, -rightHint.dot(y));
  if (x.lengthSq() < 1e-8) {
    const fallback = Math.abs(y.z) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    x.crossVectors(y, fallback);
  }
  x.normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** 스캔바디 형상. 윗면이 원점이고 플랫폼은 -heightMm. 실제 형상이 없으면 원기둥. */
function scanbodyGeometry(shape: ScanbodyShape, unit: number): THREE.BufferGeometry {
  const height = shape.heightMm / unit;
  if (!shape.mesh) {
    const radius = shape.radiusMm / unit;
    const geometry = new THREE.CylinderGeometry(radius, radius, height, 36, 6, false);
    geometry.translate(0, -height / 2, 0);
    return geometry;
  }
  const src = shape.mesh.positions;
  const positions = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    positions[i] = src[i]! / unit;
    positions[i + 1] = (src[i + 1]! - shape.heightMm) / unit;
    positions[i + 2] = src[i + 2]! / unit;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(shape.mesh.indices, 1));
  return geometry;
}

/** 마진 점의 월드 좌표. 선과 다이가 같은 곡선을 쓴다. */
export function marginWorldPoints(args: {
  place: { center: THREE.Vector3; radius: number };
  normal: THREE.Vector3;
  right: THREE.Vector3;
  margin: ToothDesignEdit["margin"];
  unitToMm: number;
}): THREE.Vector3[] {
  const unit = args.unitToMm > 0 ? args.unitToMm : 1;
  const quat = basisQuaternion(args.normal, args.right);
  const base = args.place.radius * 0.78;
  const extra = args.margin.offsetMm / unit;
  if (args.margin.worlds && args.margin.worlds.length === args.margin.radii.length) {
    return args.margin.worlds.map((row) => new THREE.Vector3(row[0], row[1], row[2]));
  }
  return args.margin.radii.map((ratio, index) => {
    const angle =
      args.margin.angles?.length === args.margin.radii.length
        ? args.margin.angles[index]!
        : marginPointAngle(index, args.margin.radii.length);
    const radial = base * ratio + extra;
    const axial = args.margin.depths?.[index] ?? 0;
    return new THREE.Vector3(Math.cos(angle) * radial, axial, Math.sin(angle) * radial)
      .applyQuaternion(quat)
      .add(args.place.center);
  });
}

function tag(mesh: THREE.Object3D, hit: EditHit) {
  mesh.userData.editHit = hit;
  mesh.frustumCulled = false;
}

/**
 * 크라운 외면 점에서 법선으로 나온 둥근 끝 원기둥. 밑은 외면 안으로 묻어
 * 스컬프트·맞춤으로 면이 조금 움직여도 떠 보이지 않게 한다. 바깥 끝까지가 길이다.
 */
function addHooks(
  root: THREE.Group,
  args: {
    tooth: string;
    hook: ToothDesignEdit["hook"];
    crownMatrix: THREE.Matrix4;
    unit: number;
    editing: boolean;
  },
) {
  const radius = args.hook.radiusMm / args.unit;
  const length = args.hook.lengthMm / args.unit;
  const embed = radius * 0.6;
  const shaft = Math.max(length + embed - radius, radius * 0.2);
  const toNormal = new THREE.Matrix3().getNormalMatrix(args.crownMatrix);
  const yAxis = new THREE.Vector3(0, 1, 0);
  args.hook.hooks.forEach((hook, index) => {
    const base = new THREE.Vector3(...hook.point).applyMatrix4(args.crownMatrix);
    const dir = new THREE.Vector3(...hook.normal).applyMatrix3(toNormal).normalize();
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(radius, shaft, 6, 20),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(...CROWN_RGB),
        roughness: 0.45,
        metalness: 0.04,
        emissive: args.editing ? HOOK_EDIT_GLOW : 0x000000,
        emissiveIntensity: args.editing ? 0.18 : 0,
      }),
    );
    mesh.quaternion.setFromUnitVectors(yAxis, dir);
    mesh.position.copy(base).addScaledVector(dir, (shaft + radius * 2) / 2 - radius - embed);
    mesh.renderOrder = 5;
    tag(mesh, { kind: "hook", tooth: args.tooth, index });
    root.add(mesh);
  });
}

function paintSculpt(
  geometry: THREE.BufferGeometry,
  edit: ToothDesignEdit,
) {
  const pos = geometry.getAttribute("position");
  if (!pos) return;
  const damp = 1 - edit.refine.smooth;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const radial = Math.hypot(x, z) || 1;
    const angle = Math.atan2(z, x);
    let bump = 0;
    for (const stamp of edit.refine.sculpt) {
      let delta = angle - stamp.angle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      bump += stamp.amount * Math.exp(-(delta * delta) / (stamp.width ?? 0.09));
    }
    bump *= damp;
    const pull = bump * 0.28;
    pos.setXYZ(i, x + (x / radial) * pull, y, z + (z / radial) * pull);
  }
  geometry.computeVertexNormals();
}

/** 로컬(단위 구) 정점의 외면 두께(mm). 대합·인접 깎기 전. */
function baseShellMm(geometry: THREE.BufferGeometry, edit: ToothDesignEdit) {
  const pos = geometry.getAttribute("position");
  const out = new Float32Array(pos?.count ?? 0);
  if (!pos) return out;
  const yMin = -0.19;
  for (let i = 0; i < pos.count; i += 1) {
    const angle = Math.atan2(pos.getZ(i), pos.getX(i));
    const occlusal01 = Math.min(1, Math.max(0, (pos.getY(i) - yMin) / (1 - yMin)));
    out[i] = localShellThicknessMm(edit, angle, occlusal01);
  }
  return out;
}

/** 교합면 폭과 구 깊이. 단위 구 로컬 좌표(y=교합)에서 민다. */
function shapeOcclusal(geometry: THREE.BufferGeometry, edit: ToothDesignEdit) {
  const table = edit.refine.occlusalTable;
  const groove = edit.refine.groove;
  if (table === 0 && groove === 0) return;
  const pos = geometry.getAttribute("position");
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const radial = Math.hypot(x, z);
    const widen = 1 + 0.22 * table * THREE.MathUtils.smoothstep(y, 0.35, 0.8);
    const fossa = 0.12 * groove * Math.exp(-((radial / 0.28) ** 2)) * Math.max(0, y);
    pos.setXYZ(i, x * widen, y - fossa, z * widen);
  }
}

/** 크라운 로컬 xz 평면의 협측·근심 단위 방향. 악궁을 모르면 null. */
export type ToothAnatomyDirs = { bx: number; bz: number; mx: number; mz: number };

/**
 * 협측·설측 교두와 근심·원심 변연융선. 단위 구 로컬 좌표에서 교합 쪽 높이를 민다.
 * 교두는 협설 가장자리를 근원심으로 길게, 변연융선은 근원심 가장자리를 협설로 길게 잡는다.
 */
function shapeAnatomy(
  geometry: THREE.BufferGeometry,
  edit: ToothDesignEdit,
  dirs: ToothAnatomyDirs | null,
) {
  const { buccalCusp, lingualCusp, mesialRidge, distalRidge } = edit.refine;
  if (!dirs || (!buccalCusp && !lingualCusp && !mesialRidge && !distalRidge)) return;
  const pos = geometry.getAttribute("position");
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const occlusal = THREE.MathUtils.smoothstep(y, 0.35, 0.75);
    if (occlusal <= 0) continue;
    const u = x * dirs.bx + z * dirs.bz;
    const v = x * dirs.mx + z * dirs.mz;
    const cusp = (at: number) => Math.exp(-((u - at) ** 2) / 0.06 - (v * v) / 0.18);
    const ridge = (at: number) => Math.exp(-((v - at) ** 2) / 0.03 - (u * u) / 0.2);
    const lift =
      buccalCusp * cusp(0.45) +
      lingualCusp * cusp(-0.45) +
      mesialRidge * ridge(0.55) +
      distalRidge * ridge(-0.55);
    pos.setY(i, y + 0.1 * lift * occlusal);
  }
}

function contralateralQuadrant(quadrant: number) {
  return quadrant === 1 ? 2 : quadrant === 2 ? 1 : quadrant === 3 ? 4 : 3;
}

/**
 * 치아의 협측·근심 방향(월드, 삽입축에 수직). 근심은 FDI 사분면 기준 정중선 쪽이다.
 * 근심·원심 이웃 치아 자리로 악궁 접선을 잡고, 협측은 그 접선에서 악궁 바깥 쪽이다.
 * 이웃이 없으면 치아 번호로 악궁 위 각도를 어림한다.
 */
export function toothArchDirs(args: {
  tooth: string;
  placements: readonly Place[];
  frame: Frame | null;
  normal: THREE.Vector3;
}): { buccal: THREE.Vector3; mesial: THREE.Vector3 } | null {
  const digits = fdiToothDigits(args.tooth);
  if (!digits || !args.frame) return null;
  const quadrant = Number(digits[0]);
  const position = Number(digits[1]);
  const side = quadrant === 1 || quadrant === 4 ? 1 : -1;
  const phi = (Math.min(position, 8) / 8) * 1.45;
  const { right, anterior } = args.frame;
  const normal = args.normal;
  const flat = (v: THREE.Vector3) => v.addScaledVector(normal, -v.dot(normal));
  const guessBuccal = flat(
    right.clone().multiplyScalar(side * Math.sin(phi)).addScaledVector(anterior, Math.cos(phi)),
  );
  const guessMesial = flat(
    anterior.clone().multiplyScalar(Math.sin(phi)).addScaledVector(right, -side * Math.cos(phi)),
  );
  const byDigits = new Map(args.placements.map((row) => [fdiToothDigits(row.toothNumber), row]));
  const self = byDigits.get(digits);
  const mesialTooth = byDigits.get(
    position > 1 ? `${quadrant}${position - 1}` : `${contralateralQuadrant(quadrant)}1`,
  );
  const distalTooth = position < 8 ? byDigits.get(`${quadrant}${position + 1}`) : undefined;
  const tangent =
    mesialTooth && distalTooth
      ? mesialTooth.center.clone().sub(distalTooth.center)
      : mesialTooth && self
        ? mesialTooth.center.clone().sub(self.center)
        : distalTooth && self
          ? self.center.clone().sub(distalTooth.center)
          : null;
  if (tangent) flat(tangent);
  let mesial: THREE.Vector3;
  let buccal: THREE.Vector3;
  if (tangent && tangent.lengthSq() > 1e-10) {
    mesial = tangent.normalize();
    if (mesial.dot(guessMesial) < 0) mesial.negate();
    buccal = new THREE.Vector3().crossVectors(mesial, normal).normalize();
    if (buccal.dot(guessBuccal) < 0) buccal.negate();
  } else {
    if (guessBuccal.lengthSq() < 1e-10) return null;
    buccal = guessBuccal.normalize();
    mesial = new THREE.Vector3().crossVectors(normal, buccal).normalize();
    if (mesial.dot(guessMesial) < 0) mesial.negate();
  }
  return { buccal, mesial };
}

function localAnatomyDirs(
  dirs: { buccal: THREE.Vector3; mesial: THREE.Vector3 } | null,
  frameQuat: THREE.Quaternion,
): ToothAnatomyDirs | null {
  if (!dirs) return null;
  const inverse = frameQuat.clone().invert();
  const b = dirs.buccal.clone().applyQuaternion(inverse);
  const m = dirs.mesial.clone().applyQuaternion(inverse);
  const bl = Math.hypot(b.x, b.z);
  const ml = Math.hypot(m.x, m.z);
  if (bl < 1e-6 || ml < 1e-6) return null;
  return { bx: b.x / bl, bz: b.z / bl, mx: m.x / ml, mz: m.z / ml };
}

/** 폰틱 기저면이 치조정 쪽으로 얼마나 내려오는지. 구의 극각 비율. */
const PONTIC_BASE_THETA: Record<PonticBase, number> = {
  ridgeLap: 0.9,
  modifiedRidgeLap: 0.78,
  ovate: 0.96,
  conical: 0.84,
  sanitary: 0.62,
};

function crownTheta(edit: ToothDesignEdit) {
  return edit.pontic.on ? PONTIC_BASE_THETA[edit.pontic.base] : 0.58;
}

/** 크라운 열린 테두리 정점과 외면 삼각형이 그 테두리를 도는 방향. `adaptCrownGeometry`가 내면을 이을 때 쓴다. */
type CrownRim = {
  /** 로컬 방위각(atan2(z,x)) 오름차순 정점 번호. */
  order: number[];
  /** 외면 삼각형이 테두리 변을 order[j] → order[j+1]로 쓰는가. */
  forward: boolean;
};

function recordCrownRim(geometry: THREE.BufferGeometry, theta: number) {
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  const index = geometry.getIndex();
  if (!index) return;
  const yBase = Math.cos(Math.PI * theta);
  const rim: Array<{ i: number; angle: number }> = [];
  for (let i = 0; i < pos.count; i += 1) {
    if (Math.abs(pos.getY(i) - yBase) < 1e-5) {
      rim.push({ i, angle: Math.atan2(pos.getZ(i), pos.getX(i)) });
    }
  }
  if (rim.length < 12) return;
  rim.sort((a, b) => a.angle - b.angle);
  const order = rim.map((row) => row.i);
  const a = order[0]!;
  const b = order[1]!;
  let forward: boolean | null = null;
  const tri = index.array;
  for (let t = 0; t < tri.length && forward == null; t += 3) {
    const corner = [tri[t]!, tri[t + 1]!, tri[t + 2]!];
    if (!corner.includes(a) || !corner.includes(b)) continue;
    for (let c = 0; c < 3; c += 1) {
      if (corner[c] === a && corner[(c + 1) % 3] === b) forward = true;
      else if (corner[c] === b && corner[(c + 1) % 3] === a) forward = false;
    }
  }
  if (forward == null) return;
  geometry.userData.rim = { order, forward } satisfies CrownRim;
}

/**
 * 로컬 단위 구 크라운. 색은 칠하지 않는다. 홀을 뚫는 크라운은 테두리가 매끈하도록 잘게 나눈다.
 * 이음매 정점을 붙여 두어야 대합·인접 맞춤으로 밀어도 틈이 나지 않는다.
 */
function makeCrownGeometry(
  edit: ToothDesignEdit,
  fine = false,
  anatomy: ToothAnatomyDirs | null = null,
  tooth = "",
) {
  const theta = crownTheta(edit);
  const sphere = new THREE.SphereGeometry(
    1,
    fine ? 96 : 48,
    fine ? 56 : 28,
    0,
    Math.PI * 2,
    0,
    Math.PI * theta,
  );
  sphere.deleteAttribute("uv");
  sphere.deleteAttribute("normal");
  const geometry = mergeVertices(sphere, 1e-6);
  sphere.dispose();
  recordCrownRim(geometry, theta);
  if (edit.pontic.on && edit.pontic.base === "conical") {
    const pos = geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      if (y >= 0) continue;
      const pinch = 1 + y * 0.75;
      pos.setX(i, pos.getX(i) * pinch);
      pos.setZ(i, pos.getZ(i) * pinch);
    }
  }
  // 치아 형태 라이브러리: 번호로 종류를 골라 기본 해부 형태를 입힌 뒤 수정값을 얹는다.
  if (tooth) shapeToothMorphology(geometry, tooth, anatomy);
  shapeOcclusal(geometry, edit);
  shapeAnatomy(geometry, edit, anatomy);
  paintSculpt(geometry, edit);
  return geometry;
}

/**
 * 크라운 경부 띠의 맞춤 세기와 마진 바닥. 세기는 열린 테두리에서 0으로 두어 마진 자리를 지키고,
 * 테두리 바로 위 띠에서 가장 세다. 바닥은 정점 각도의 마진 점 높이를 이어 잰다.
 */
function cervicalBand(
  local: THREE.BufferAttribute,
  world: Float32Array,
  normal: THREE.Vector3,
  cervical: { center: THREE.Vector3; frameQuat: THREE.Quaternion },
  edit: ToothDesignEdit,
) {
  const count = local.count;
  const weight = new Float32Array(count);
  const floor = new Float32Array(count);
  const yBase = Math.cos(Math.PI * crownTheta(edit));
  const inverse = cervical.frameQuat.clone().invert();
  const depths = edit.margin.depths ?? [];
  const n = Math.max(edit.margin.radii.length, 1);
  const baseAlong = cervical.center.dot(normal);
  const d = new THREE.Vector3();
  for (let i = 0; i < count; i += 1) {
    const y = local.getY(i);
    weight[i] =
      THREE.MathUtils.smoothstep(y, yBase, yBase + 0.1) *
      (1 - THREE.MathUtils.smoothstep(y, yBase + 0.2, yBase + 0.45));
    d.set(world[i * 3]!, world[i * 3 + 1]!, world[i * 3 + 2]!)
      .sub(cervical.center)
      .applyQuaternion(inverse);
    let angle = Math.atan2(d.z, d.x);
    if (angle < 0) angle += Math.PI * 2;
    const at = (angle / (Math.PI * 2)) * n;
    const i0 = Math.floor(at) % n;
    const t = at - Math.floor(at);
    const depth = (depths[i0] ?? 0) * (1 - t) + (depths[(i0 + 1) % n] ?? 0) * t;
    floor[i] = baseAlong + depth;
  }
  return { weight, floor };
}

/**
 * 크라운 테두리가 마진 높이에 오도록 아래쪽을 축 방향으로 옮긴다. 테두리에서 0.55까지 서서히 줄여
 * 위쪽 형태는 그대로 둔다. 테두리가 마진 아래에 놓인 채로 내면과 이으면 접히기 때문이다.
 */
function alignCrownToMargin(args: {
  world: Float32Array;
  pos: THREE.BufferAttribute;
  rimOrder: number[];
  azimuths: number[];
  center: THREE.Vector3;
  axis: THREE.Vector3;
  xDir: THREE.Vector3;
  zDir: THREE.Vector3;
  depths: number[];
}) {
  const { world, pos, rimOrder, azimuths, center, axis, xDir, zDir, depths } = args;
  const n = azimuths.length;
  const tau = Math.PI * 2;
  const axial = (i: number) =>
    (world[i * 3]! - center.x) * axis.x +
    (world[i * 3 + 1]! - center.y) * axis.y +
    (world[i * 3 + 2]! - center.z) * axis.z;
  const rimAxial = rimOrder.map(axial);
  const floorAt = (phi: number) => {
    const m = depths.length;
    let u = (((phi % tau) + tau) % tau) / tau * m;
    const i0 = Math.floor(u) % m;
    u -= Math.floor(u);
    return (depths[i0] ?? 0) * (1 - u) + (depths[(i0 + 1) % m] ?? 0) * u;
  };
  const shiftAt = (phi: number) => {
    const delta = (((phi - azimuths[0]!) % tau) + tau) % tau;
    let j = 0;
    while (j + 1 < n && azimuths[j + 1]! - azimuths[0]! <= delta) j += 1;
    const a0 = azimuths[j]! - azimuths[0]!;
    const a1 = (j + 1 < n ? azimuths[j + 1]! - azimuths[0]! : tau);
    const t = a1 > a0 ? (delta - a0) / (a1 - a0) : 0;
    const rimHere = rimAxial[j]! * (1 - t) + rimAxial[(j + 1) % n]! * t;
    return floorAt(phi) - rimHere;
  };
  const yBase = pos.getY(rimOrder[0]!);
  for (let i = 0; i < pos.count; i += 1) {
    const dx = world[i * 3]! - center.x;
    const dy = world[i * 3 + 1]! - center.y;
    const dz = world[i * 3 + 2]! - center.z;
    const phi = Math.atan2(dx * zDir.x + dy * zDir.y + dz * zDir.z, dx * xDir.x + dy * xDir.y + dz * xDir.z);
    const t = Math.min(1, Math.max(0, (pos.getY(i) - yBase) / Math.max(1 - yBase, 1e-6)));
    const weight = 1 - THREE.MathUtils.smoothstep(t, 0, 0.55);
    if (weight <= 0) continue;
    const shift = shiftAt(phi) * weight;
    world[i * 3] += axis.x * shift;
    world[i * 3 + 1] += axis.y * shift;
    world[i * 3 + 2] += axis.z * shift;
  }
}

/** 크라운 로컬 앞쪽 `count`개 정점의 컷백 선택(0~1). */
function crownCutbackMask(
  geometry: THREE.BufferGeometry,
  count: number,
  matrix: THREE.Matrix4,
  edit: ToothDesignEdit,
  unit: number,
  anatomy: ToothAnatomyDirs | null,
) {
  const column = new THREE.Vector3();
  const axisMm = [0, 1, 2].map(
    (k) => column.setFromMatrixColumn(matrix, k).length() * unit,
  ) as [number, number, number];
  return cutbackMask({
    positions: geometry.getAttribute("position").array as ArrayLike<number>,
    count,
    cutback: edit.cutback,
    axisMm,
    rimY: Math.cos(Math.PI * crownTheta(edit)),
    buccal: anatomy ? { x: anatomy.bx, z: anatomy.bz } : null,
  });
}

/**
 * 컷백 선택 영역을 외면 법선 안쪽으로 깊이만큼 민다. 정점마다 깎은 mm를 돌려준다.
 * `thickness`(지대치 내면에서 잰 두께)가 있고 최소 두께 유지를 켰으면 그 밑으로는 깎지 않는다.
 */
function carveCutback(args: {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  edit: ToothDesignEdit;
  unit: number;
  anatomy: ToothAnatomyDirs | null;
  thickness: Float32Array | null;
  skip: readonly number[];
}): Float32Array | null {
  const { geometry, matrix, edit, unit } = args;
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  const count = pos.count;
  const mask = crownCutbackMask(geometry, count, matrix, edit, unit, args.anatomy);
  for (const vertex of args.skip) mask[vertex] = 0;
  geometry.computeVertexNormals();
  const nor = geometry.getAttribute("normal");
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  const inverse = matrix.clone().invert();
  const floor = edit.cutback.preserveMinThickness ? edit.refine.minThicknessMm : null;
  const cut = new Float32Array(count);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  let any = false;
  for (let i = 0; i < count; i += 1) {
    let depth = edit.cutback.depthMm * mask[i]!;
    const shell = args.thickness?.[i];
    if (floor != null && shell != null && Number.isFinite(shell)) {
      depth = Math.min(depth, Math.max(0, shell - floor));
    }
    if (depth <= 1e-4) continue;
    p.fromBufferAttribute(pos, i).applyMatrix4(matrix);
    n.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
    p.addScaledVector(n, -depth / unit).applyMatrix4(inverse);
    pos.setXYZ(i, p.x, p.y, p.z);
    cut[i] = depth;
    any = true;
  }
  pos.needsUpdate = true;
  return any ? cut : null;
}

/** 고르는 중인 컷백 영역을 외면 색에 섞어 칠한다. */
function paintCutbackSelection(
  geometry: THREE.BufferGeometry,
  outerCount: number,
  matrix: THREE.Matrix4,
  edit: ToothDesignEdit,
  unit: number,
  anatomy: ToothAnatomyDirs | null,
) {
  const color = geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
  if (!color) return;
  const count = Math.min(outerCount, color.count);
  const mask = crownCutbackMask(geometry, count, matrix, edit, unit, anatomy);
  const rgb = color.array as Float32Array;
  for (let i = 0; i < count; i += 1) {
    const m = mask[i]!;
    if (m <= 0) continue;
    for (let c = 0; c < 3; c += 1) {
      rgb[i * 3 + c] = rgb[i * 3 + c]! * (1 - m) + CUTBACK_SELECT_RGB[c]! * m;
    }
  }
  color.needsUpdate = true;
}

/** 내면 색. 외면보다 조금 어둡게 두어 안쪽 면임을 알아보게 한다. */
const INTAGLIO_RGB: [number, number, number] = [0.86, 0.82, 0.76];

/**
 * 크라운을 월드에 놓고 대합·인접·치은에 맞추고 디스크로 떼어 낸 뒤 다시 로컬로 돌린다.
 * 두께·접촉 색을 칠한다. `shellMm`는 맞춤을 켠 치아에서 잰 가장 얇은 외면. 맞춤이 없으면
 * null(수정값 추정을 쓴다). 크라운 경부 맞춤은 `cervical`(마진)이 있어야 하고 마진 아래로 내리지 않는다.
 *
 * 지대치 스캔·마진이 있으면 지대치에서 실제 내면 메시를 만들어 외면에 이어 붙인다.
 * 그때 외면은 내면에서 최소 두께 밖으로 밀리고, `shellMm`·두께 색은 그 내면에서 잰 실제 두께다.
 * 결과 지오메트리는 `[외면 + 테두리 띠]`(그룹 0)와 `[내면]`(그룹 1)로 나뉜다.
 */
function adaptCrownGeometry(args: {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  normal: THREE.Vector3;
  edit: ToothDesignEdit;
  unit: number;
  scan: () => CrownAdaptScan | null;
  contactPaint: { gapMm: number; mode: ContactPaintMode } | null;
  discs: DiscPlane[];
  cervical: { center: THREE.Vector3; frameQuat: THREE.Quaternion } | null;
  /** 마진 바깥 반지름·높이(월드 단위). 내면을 만들 때 쓴다. */
  marginRing: { radii: number[]; depths: number[] } | null;
  /** 내면 메시를 만들어도 되는 크라운인가(폰틱·임플란트·홀 크라운은 false). */
  intaglio: boolean;
  /** 칼라맵 값을 재는가. */
  needValues: boolean;
  /** 컷백 부분 프리셋이 순면을 찾을 때 쓴다. */
  anatomy: ToothAnatomyDirs | null;
}): {
  shellMm: number | null;
  values: ColorMapValues | null;
  intaglio: CrownIntaglioInfo;
  groups: CachedCrown["groups"];
  outerCount: number;
} {
  const { geometry, edit, unit, contactPaint, discs } = args;
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  const count = pos.count;
  const refine = edit.refine;
  const base = baseShellMm(geometry, edit);
  const cervical = !edit.pontic.on && refine.gingivalFit ? args.cervical : null;
  const rim = geometry.userData.rim as CrownRim | undefined;
  const wantIntaglio = Boolean(
    args.intaglio && !edit.pontic.on && rim && args.marginRing && args.cervical,
  );
  const scanAdapting =
    refine.occlusalTrim ||
    refine.occlusalFit ||
    refine.proximalTrim ||
    refine.proximalFit ||
    (edit.pontic.on && refine.gingivalFit) ||
    cervical != null;
  const adapting = scanAdapting || discs.length > 0;
  let cutMm: Float32Array | null = null;
  let contactMm: Float32Array | null = null;
  let opposingMm: Float32Array | null = null;
  let adjacentMm: Float32Array | null = null;
  let mesh: IntaglioMesh | null = null;
  let probe: IntaglioProbe | null = null;
  let realThickness: Float32Array | null = null;
  let intaglioInfo: CrownIntaglioInfo = { status: "off" };
  let azimuths: number[] = [];
  const scan =
    scanAdapting || contactPaint || args.needValues || wantIntaglio ? args.scan() : null;
  const inverse = args.matrix.clone().invert();
  const v = new THREE.Vector3();
  if (scan || discs.length > 0) {
    const world = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(args.matrix);
    const readWorld = () => {
      for (let i = 0; i < count; i += 1) {
        v.fromBufferAttribute(pos, i).applyMatrix4(args.matrix);
        world[i * 3] = v.x;
        world[i * 3 + 1] = v.y;
        world[i * 3 + 2] = v.z;
      }
    };
    const readNormals = () => {
      geometry.computeVertexNormals();
      const nor = geometry.getAttribute("normal");
      for (let i = 0; i < count; i += 1) {
        v.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
        normals[i * 3] = v.x;
        normals[i * 3 + 1] = v.y;
        normals[i * 3 + 2] = v.z;
      }
    };
    const writeWorld = () => {
      for (let i = 0; i < count; i += 1) {
        v.set(world[i * 3]!, world[i * 3 + 1]!, world[i * 3 + 2]!).applyMatrix4(inverse);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      pos.needsUpdate = true;
    };
    const measureThickness = (skip: Uint8Array | null) => {
      const out = new Float32Array(count).fill(Number.NaN);
      for (let i = 0; i < count; i += 1) {
        if (skip?.[i]) continue;
        out[i] = probe!.closest(world[i * 3]!, world[i * 3 + 1]!, world[i * 3 + 2]!).signedMm;
      }
      return out;
    };
    readWorld();
    readNormals();

    let rimSkip: Uint8Array | null = null;
    const frame = args.cervical;
    const ring = args.marginRing;
    if (wantIntaglio && rim && frame && ring) {
      if (!scan?.prep) {
        intaglioInfo = { status: "sparse" };
      } else {
        const xDir = new THREE.Vector3(1, 0, 0).applyQuaternion(frame.frameQuat);
        const zDir = new THREE.Vector3(0, 0, 1).applyQuaternion(frame.frameQuat);
        const c = frame.center;
        const firstAt = (index: number) => {
          v.set(world[index * 3]! - c.x, world[index * 3 + 1]! - c.y, world[index * 3 + 2]! - c.z);
          return Math.atan2(v.dot(zDir), v.dot(xDir));
        };
        // 크라운 테두리 정점과 같은 방위각에 내면 열을 둔다. 순서가 뒤엉키면 만들지 않는다.
        const first = firstAt(rim.order[0]!);
        let ordered = true;
        let previous = 0;
        azimuths = rim.order.map((vertex, j) => {
          let delta = firstAt(vertex) - first;
          delta -= Math.floor(delta / (Math.PI * 2)) * Math.PI * 2;
          if (j > 0 && delta <= previous) ordered = false;
          previous = delta;
          return first + delta;
        });
        if (!ordered) {
          intaglioInfo = { status: "margin" };
        } else {
          const built = buildIntaglio({
            cloud: scan.prep,
            center: [c.x, c.y, c.z],
            axis: [args.normal.x, args.normal.y, args.normal.z],
            xDir: [xDir.x, xDir.y, xDir.z],
            zDir: [zDir.x, zDir.y, zDir.z],
            marginRadii: ring.radii,
            marginDepths: ring.depths,
            azimuths,
            unitToMm: unit,
            params: {
              cementGapMm: edit.inner.cementGapMm,
              extraGapMm: edit.inner.extraGapMm,
              sealGapMm: edit.inner.sealGapMm,
              sealHeightMm: edit.inner.sealHeightMm,
              toolRadiusMm: edit.inner.toolRadiusMm,
              marginWidthMm: edit.inner.marginWidthMm,
            },
          });
          if ("reason" in built) {
            intaglioInfo = { status: built.reason };
          } else {
            mesh = built.mesh;
            probe = new IntaglioProbe(mesh, unit);
            rimSkip = new Uint8Array(count);
            for (const vertex of rim.order) rimSkip[vertex] = 1;
            alignCrownToMargin({
              world,
              pos,
              rimOrder: rim.order,
              azimuths,
              center: c,
              axis: args.normal,
              xDir,
              zDir,
              depths: ring.depths,
            });
            // 외면이 내면에서 최소 두께 밖에 있도록 먼저 민다. 이후 맞춤은 이 두께에서 깎는다.
            raiseOuterToThickness(world, rimSkip, probe, refine.minThicknessMm, unit);
            writeWorld();
            readNormals();
            realThickness = measureThickness(rimSkip);
          }
        }
      }
    }

    let allowCutMm: Float32Array | null = null;
    if (refine.compensate && !edit.pontic.on) {
      allowCutMm = new Float32Array(count);
      for (let i = 0; i < count; i += 1) {
        const shell = realThickness?.[i];
        allowCutMm[i] = Math.max(
          0,
          (shell != null && Number.isFinite(shell) ? shell : base[i]!) - refine.minThicknessMm,
        );
      }
    }
    let gingival: GingivalAdapt | null = null;
    if (edit.pontic.on) {
      gingival = { distanceMm: refine.gingivalMm, fit: refine.gingivalFit };
    } else if (cervical && scan?.gingiva) {
      gingival = {
        distanceMm: refine.gingivalMm,
        fit: true,
        ...cervicalBand(pos, world, args.normal, cervical, edit),
      };
    }
    const result = adaptCrownVertices({
      positions: world,
      normals,
      axis: [args.normal.x, args.normal.y, args.normal.z],
      unitToMm: unit,
      opposing: scan?.opposing ?? null,
      adjacent: scan?.adjacent ?? null,
      adjacentColumns: scan?.adjacentColumns ?? null,
      ridge: edit.pontic.on ? (scan?.ridge ?? null) : cervical ? (scan?.gingiva ?? null) : null,
      occlusal: {
        clearanceMm: refine.occlusalClearanceMm,
        trim: refine.occlusalTrim,
        fit: refine.occlusalFit,
      },
      proximal: {
        clearanceMm: refine.proximalClearanceMm,
        trim: refine.proximalTrim,
        fit: refine.proximalFit,
      },
      gingival,
      discs,
      allowCutMm,
    });
    cutMm = result.cutMm;
    contactMm = result.contactMm;
    opposingMm = result.opposingMm;
    adjacentMm = result.adjacentMm;
    if (mesh && probe && rim && rimSkip) {
      // 테두리는 맞춤에서 빼 내면 마진 끝에서 바깥으로 마진 두께만큼 둔다.
      const outward = new THREE.Vector3();
      const width = edit.inner.marginWidthMm / unit;
      const xDir = new THREE.Vector3(1, 0, 0).applyQuaternion(args.cervical!.frameQuat);
      const zDir = new THREE.Vector3(0, 0, 1).applyQuaternion(args.cervical!.frameQuat);
      for (let j = 0; j < rim.order.length; j += 1) {
        const at = mesh.rim[j]! * 3;
        outward
          .copy(xDir)
          .multiplyScalar(Math.cos(azimuths[j]!))
          .addScaledVector(zDir, Math.sin(azimuths[j]!));
        const vertex = rim.order[j]!;
        world[vertex * 3] = mesh.positions[at]! + outward.x * width;
        world[vertex * 3 + 1] = mesh.positions[at + 1]! + outward.y * width;
        world[vertex * 3 + 2] = mesh.positions[at + 2]! + outward.z * width;
      }
      writeWorld();
      realThickness = measureThickness(rimSkip);
    } else if (adapting) {
      writeWorld();
    }
    if (mesh && realThickness) {
      let min = Infinity;
      for (const t of realThickness) if (Number.isFinite(t) && t < min) min = t;
      intaglioInfo = { status: "ok", minThicknessMm: Number.isFinite(min) ? min : undefined };
    }
  }

  if (wantIntaglio && !mesh && intaglioInfo.status === "off") intaglioInfo = { status: "sparse" };

  // 맞춘 외면에서 컷백한다. 대합·인접 맞춤이 컷백 면을 다시 밀지 않는다.
  const cutbackMm = edit.cutback.applied
    ? carveCutback({
        geometry,
        matrix: args.matrix,
        edit,
        unit,
        anatomy: args.anatomy,
        thickness: realThickness,
        skip: rim?.order ?? [],
      })
    : null;
  if (cutbackMm && realThickness) {
    for (let i = 0; i < count; i += 1) realThickness[i] = realThickness[i]! - cutbackMm[i]!;
    let min = Infinity;
    for (const t of realThickness) if (Number.isFinite(t) && t < min) min = t;
    if (intaglioInfo.status === "ok") {
      intaglioInfo = { ...intaglioInfo, minThicknessMm: Number.isFinite(min) ? min : undefined };
    }
  }
  const thicknessAt = (i: number) => {
    const real = realThickness?.[i];
    if (real != null) return real;
    return realThickness
      ? Number.NaN
      : base[i]! - Math.max(0, cutMm?.[i] ?? 0) - (cutbackMm?.[i] ?? 0);
  };

  // 내면 정점과 테두리 띠를 외면 뒤에 붙인다.
  let total = count;
  let groups: CachedCrown["groups"] = [];
  let fitValues: Float32Array | null = null;
  if (mesh && rim && scan) {
    const meshCount = mesh.positions.length / 3;
    total = count + meshCount;
    const outPos = new Float32Array(total * 3);
    outPos.set(pos.array as Float32Array);
    for (let k = 0; k < meshCount; k += 1) {
      v.set(mesh.positions[k * 3]!, mesh.positions[k * 3 + 1]!, mesh.positions[k * 3 + 2]!)
        .applyMatrix4(inverse);
      outPos[(count + k) * 3] = v.x;
      outPos[(count + k) * 3 + 1] = v.y;
      outPos[(count + k) * 3 + 2] = v.z;
    }
    const domeIndex = geometry.getIndex()!.array;
    const inside = orientIntaglioIndex(mesh.index, rim.forward);
    const innerRim = Array.from(mesh.rim, (vertex) => vertex + count);
    const strip = marginStripIndex(rim.order, innerRim, rim.forward);
    const outerLength = domeIndex.length + strip.length;
    const index = new Uint32Array(outerLength + inside.length);
    index.set(domeIndex as ArrayLike<number>, 0);
    index.set(strip, domeIndex.length);
    for (let t = 0; t < inside.length; t += 1) index[outerLength + t] = inside[t]! + count;
    geometry.setAttribute("position", new THREE.BufferAttribute(outPos, 3));
    geometry.deleteAttribute("normal");
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.clearGroups();
    groups = [
      { start: 0, count: outerLength, materialIndex: 0 },
      { start: outerLength, count: inside.length, materialIndex: 1 },
    ];
    for (const group of groups) geometry.addGroup(group.start, group.count, group.materialIndex);
    if (scan.prepGrid) {
      fitValues = new Float32Array(meshCount).fill(Number.NaN);
      let worst = 0;
      for (let k = 0; k < meshCount; k += 1) {
        const gap = signedDistanceMm(
          scan.prepGrid,
          mesh.positions[k * 3]!,
          mesh.positions[k * 3 + 1]!,
          mesh.positions[k * 3 + 2]!,
          FIT_PROBE_MM,
          unit,
        );
        fitValues[k] = gap;
        if (Number.isFinite(gap)) worst = Math.max(worst, Math.abs(gap - mesh.designedGapMm[k]!));
      }
      intaglioInfo = { ...intaglioInfo, maxGapErrorMm: worst };
    }
  }
  geometry.computeVertexNormals();

  const colors = new Float32Array(total * 3);
  let shellMm = Infinity;
  for (let i = 0; i < count; i += 1) {
    const thickness = thicknessAt(i);
    if (Number.isFinite(thickness) && thickness < shellMm) shellMm = thickness;
    const contact = contactMm?.[i];
    const touching =
      contactPaint && contact != null && Number.isFinite(contact)
        ? contactColorRgb(contact, contactPaint.gapMm, contactPaint.mode)
        : null;
    const rgb =
      touching ??
      (edit.pontic.on || !Number.isFinite(thickness) ? null : thicknessAlertRgb(edit, thickness)) ??
      CROWN_RGB;
    colors[i * 3] = rgb[0];
    colors[i * 3 + 1] = rgb[1];
    colors[i * 3 + 2] = rgb[2];
  }
  for (let i = count; i < total; i += 1) {
    colors[i * 3] = INTAGLIO_RGB[0];
    colors[i * 3 + 1] = INTAGLIO_RGB[1];
    colors[i * 3 + 2] = INTAGLIO_RGB[2];
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  let values: ColorMapValues | null = null;
  if (args.needValues) {
    values = emptyColorMapValues(total);
    for (let i = 0; i < count; i += 1) {
      // 간섭: 대합·인접 중 목표에서 더 모자란 쪽.
      const opposing = opposingMm?.[i];
      const adjacent = adjacentMm?.[i];
      let bestGap = Infinity;
      if (opposing != null && Number.isFinite(opposing)) {
        bestGap = opposing - refine.occlusalClearanceMm;
        values.contact.value[i] = opposing;
        values.contact.ref[i] = refine.occlusalClearanceMm;
      }
      if (adjacent != null && Number.isFinite(adjacent)) {
        if (adjacent - refine.proximalClearanceMm < bestGap) {
          values.contact.value[i] = adjacent;
          values.contact.ref[i] = refine.proximalClearanceMm;
        }
      }
      const thickness = thicknessAt(i);
      if (Number.isFinite(thickness)) {
        values.thickness.value[i] = thickness;
        values.thickness.ref[i] = refine.minThicknessMm;
      }
    }
    if (fitValues && mesh) {
      for (let k = 0; k < fitValues.length; k += 1) {
        values.fit.value[count + k] = fitValues[k]!;
        values.fit.ref[count + k] = mesh.designedGapMm[k]!;
      }
    }
  }
  return {
    shellMm: realThickness
      ? Number.isFinite(shellMm)
        ? shellMm
        : null
      : adapting && cutMm && !edit.pontic.on && Number.isFinite(shellMm)
        ? shellMm
        : null,
    values,
    intaglio: intaglioInfo,
    groups,
    outerCount: count,
  };
}

export type CrownPose = {
  /** 변형 회전까지 넣은 크라운 자세. */
  quat: THREE.Quaternion;
  position: THREE.Vector3;
  radius: number;
  width: number;
  height: number;
  depth: number;
  /** 크라운 구의 극각 비율. 아래 열린 테두리 높이. */
  theta: number;
  /** 변형 전 크라운 크기. 내면(지대치)은 이 크기를 쓴다. */
  baseWidth: number;
  baseHeight: number;
  baseDepth: number;
};

/**
 * 생성 크라운 자리. 레이어와 홀 검사가 같이 쓴다.
 * 변형(가로·높이·세로 배율, 치아 평면 이동, 삽입축 회전)을 넣는다. 대합·인접 맞춤은 정점에서 한다.
 */
export function crownPose(
  place: { center: THREE.Vector3; radius: number },
  normal: THREE.Vector3,
  right: THREE.Vector3,
  edit: ToothDesignEdit,
  unitToMm = 1,
): CrownPose {
  const unit = unitToMm > 0 ? unitToMm : 1;
  const frame = basisQuaternion(normal, right);
  const { stretch, offsetMm, rotateDeg } = edit.refine;
  const quat = frame
    .clone()
    .multiply(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        (-rotateDeg * Math.PI) / 180,
      ),
    );
  const scale = crownScale(edit);
  const radius = place.radius * 0.86 * scale;
  const baseHeight = place.radius * 0.62 * scale * (1 + edit.refine.cusp * 0.14);
  const baseWidth = radius;
  const baseDepth = radius * (1 + edit.refine.ridge * 0.12);
  const height = baseHeight * stretch[1];
  const lift =
    edit.pontic.on && edit.pontic.base === "sanitary" ? height * 0.4 : height * 0.12;
  const position = place.center
    .clone()
    .addScaledVector(normal.clone().normalize(), lift)
    .add(new THREE.Vector3(offsetMm[0] / unit, 0, offsetMm[1] / unit).applyQuaternion(frame));
  return {
    quat,
    position,
    radius,
    width: baseWidth * stretch[0],
    height,
    depth: baseDepth * stretch[2],
    theta: crownTheta(edit),
    baseWidth,
    baseHeight,
    baseDepth,
  };
}

export const HOLE_THROUGH_ISSUE = "홀이 보철 안쪽과 바깥쪽을 모두 지나야 합니다.";

export type ScrewHoleLine = {
  /** 축 위 한 점(월드). 회전 중심. */
  origin: THREE.Vector3;
  /** 교합면 쪽 단위 벡터(월드). */
  dir: THREE.Vector3;
  /** 월드 단위 반지름. */
  radius: number;
  /** 축이 바깥면을 나가는 점. 크라운을 비껴가면 null. */
  top: THREE.Vector3 | null;
  /** 축이 크라운 아래 열린 테두리 면을 지나는 점. */
  bottom: THREE.Vector3 | null;
  issue: string | null;
};

function crownToLocal(pose: CrownPose) {
  return new THREE.Matrix4()
    .compose(pose.position, pose.quat, new THREE.Vector3(pose.width, pose.height, pose.depth))
    .invert();
}

/** 크라운 단위 구 공간의 직선 o + t·d 가 구를 지나는 t 두 개(작은 것부터). */
function unitSphereHits(o: THREE.Vector3, d: THREE.Vector3): [number, number] | null {
  const a = d.lengthSq();
  if (a < 1e-12) return null;
  const b = 2 * o.dot(d);
  const c = o.lengthSq() - 1;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)];
}

/**
 * 직선이 크라운 바깥면(위)과 아래 열린 테두리 면을 지나는 t. t는 월드 방향 단위다.
 * 테두리에 닿기 전에 옆벽으로 나가면 bottom은 null.
 */
function crownCrossing(toLocal: THREE.Matrix4, theta: number, origin: THREE.Vector3, dir: THREE.Vector3) {
  const o = origin.clone().applyMatrix4(toLocal);
  const d = origin.clone().add(dir).applyMatrix4(toLocal).sub(o);
  const hits = unitSphereHits(o, d);
  if (!hits || d.y <= 1e-9) return null;
  const yBase = Math.cos(Math.PI * theta);
  const top = hits[1];
  const topY = o.y + d.y * top;
  const lowY = o.y + d.y * hits[0];
  const base = (yBase - o.y) / d.y;
  const bottom = lowY > yBase + 1e-6 ? null : base;
  const at = (t: number) => o.clone().addScaledVector(d, t);
  const rim = bottom == null ? null : Math.hypot(at(bottom).x, at(bottom).z);
  return { top, topY, bottom, rim, openRadius: Math.sin(Math.PI * theta) };
}

/**
 * 스크류홀 축과 검사. 치아 프레임 mm 값을 월드로 옮긴다.
 * `axis`를 주면(임플란트) 그 축을 쓴다.
 */
export function screwHoleLine(args: {
  place: { center: THREE.Vector3; radius: number };
  normal: THREE.Vector3;
  right: THREE.Vector3;
  edit: ToothDesignEdit;
  unitToMm: number;
  axis?: { origin: THREE.Vector3; dir: THREE.Vector3 } | null;
}): ScrewHoleLine {
  const unit = args.unitToMm > 0 ? args.unitToMm : 1;
  const pose = crownPose(args.place, args.normal, args.right, args.edit, unit);
  const frame = basisQuaternion(args.normal, args.right);
  const origin = args.axis
    ? args.axis.origin.clone()
    : new THREE.Vector3(...args.edit.hole.point)
        .multiplyScalar(1 / unit)
        .applyQuaternion(frame)
        .add(args.place.center);
  const dir = (
    args.axis
      ? args.axis.dir.clone()
      : new THREE.Vector3(...args.edit.hole.dir).applyQuaternion(frame)
  ).normalize();
  const radius = args.edit.hole.radiusMm / unit;
  const cross = crownCrossing(crownToLocal(pose), pose.theta, origin, dir);
  const top = cross ? origin.clone().addScaledVector(dir, cross.top) : null;
  const bottom =
    cross?.bottom != null ? origin.clone().addScaledVector(dir, cross.bottom) : null;
  const span = Math.min(pose.width, pose.depth);
  let issue: string | null = null;
  if (!cross || cross.topY < 0.3) {
    issue = "교합면을 지나도록 자리를 옮기세요.";
  } else if (cross.bottom == null || cross.rim == null) {
    issue = HOLE_THROUGH_ISSUE;
  } else if (radius > span * 0.42) {
    issue = "홀이 교합면보다 큽니다. 반지름을 줄이세요.";
  } else if ((cross.openRadius - cross.rim) * span < radius * 1.15) {
    issue = "홀이 마진에 너무 가깝습니다. 안쪽으로 옮기거나 기울기를 줄이세요.";
  }
  return { origin, dir, radius, top, bottom, issue };
}

function perpendicular(dir: THREE.Vector3) {
  const hint = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  return new THREE.Vector3().crossVectors(dir, hint).normalize();
}

/**
 * 원기둥 안쪽 삼각형을 지우고, 걸친 삼각형의 안쪽 꼭짓점을 원기둥 면으로 민다.
 * 좌표는 메시 로컬이고 `toWorld`로 월드에서 잰다.
 */
function cutScrewHole(
  geometry: THREE.BufferGeometry,
  toWorld: THREE.Matrix4,
  line: ScrewHoleLine,
): THREE.BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  const pos = flat.getAttribute("position") as THREE.BufferAttribute;
  const fromWorld = toWorld.clone().invert();
  const inside = new Uint8Array(pos.count);
  const world = new THREE.Vector3();
  const rel = new THREE.Vector3();
  const spoke = perpendicular(line.dir);
  for (let i = 0; i < pos.count; i += 1) {
    world.fromBufferAttribute(pos, i).applyMatrix4(toWorld);
    rel.copy(world).sub(line.origin);
    const along = rel.dot(line.dir);
    rel.addScaledVector(line.dir, -along);
    if (rel.length() >= line.radius) continue;
    inside[i] = 1;
    if (rel.lengthSq() < 1e-12) rel.copy(spoke);
    rel.normalize().multiplyScalar(line.radius);
    world.copy(line.origin).addScaledVector(line.dir, along).add(rel).applyMatrix4(fromWorld);
    pos.setXYZ(i, world.x, world.y, world.z);
  }
  const keep: number[] = [];
  for (let tri = 0; tri < pos.count; tri += 3) {
    if (inside[tri] && inside[tri + 1] && inside[tri + 2]) continue;
    keep.push(tri, tri + 1, tri + 2);
  }
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(flat.attributes)) {
    const src = attr as THREE.BufferAttribute;
    const size = src.itemSize;
    const data = new Float32Array(keep.length * size);
    keep.forEach((index, row) => {
      for (let k = 0; k < size; k += 1) data[row * size + k] = src.array[index * size + k]!;
    });
    out.setAttribute(name, new THREE.BufferAttribute(data, size));
  }
  flat.dispose();
  return out;
}

/** 원기둥 벽. 모선마다 바깥면과 아래 테두리 면 사이를 잇는다. 월드 좌표. */
function screwHoleWall(line: ScrewHoleLine, pose: CrownPose, segments = 48) {
  if (!line.top || !line.bottom) return null;
  const toLocal = crownToLocal(pose);
  const u = perpendicular(line.dir);
  const v = new THREE.Vector3().crossVectors(line.dir, u).normalize();
  const topT = line.top.clone().sub(line.origin).dot(line.dir);
  const bottomT = line.bottom.clone().sub(line.origin).dot(line.dir);
  const positions: number[] = [];
  for (let k = 0; k <= segments; k += 1) {
    const angle = (k / segments) * Math.PI * 2;
    const foot = line.origin
      .clone()
      .addScaledVector(u, Math.cos(angle) * line.radius)
      .addScaledVector(v, Math.sin(angle) * line.radius);
    const cross = crownCrossing(toLocal, pose.theta, foot, line.dir);
    const high = cross ? cross.top : topT;
    const low = cross?.bottom ?? bottomT;
    const a = foot.clone().addScaledVector(line.dir, high);
    const b = foot.clone().addScaledVector(line.dir, Math.min(low, high));
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const index: number[] = [];
  for (let k = 0; k < segments; k += 1) {
    const a = k * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

const HOLE_OK = 0x22d3ee;
const HOLE_TIP = 0x0d9488;
const HOLE_BAD = 0xdc2626;

/** 홀 편집 핸들. 원기둥은 이동, 양 끝 공은 회전. */
function screwHoleHandles(root: THREE.Group, tooth: string, line: ScrewHoleLine, size: number) {
  const bad = line.issue != null;
  const top = line.top ?? line.origin.clone().addScaledVector(line.dir, size * 0.5);
  const bottom = line.bottom ?? line.origin.clone().addScaledVector(line.dir, -size * 0.5);
  const upper = top.clone().addScaledVector(line.dir, Math.max(line.radius * 2.6, size * 0.25));
  const lower = bottom.clone().addScaledVector(line.dir, -line.radius * 0.6);
  const length = upper.distanceTo(lower);
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(line.radius, line.radius, length, 32, 1, false),
    new THREE.MeshBasicMaterial({
      color: bad ? HOLE_BAD : HOLE_OK,
      transparent: true,
      opacity: 0.38,
      depthTest: false,
      depthWrite: false,
    }),
  );
  body.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), line.dir);
  body.position.copy(upper).lerp(lower, 0.5);
  body.renderOrder = 15;
  tag(body, { kind: "hole", tooth });
  root.add(body);
  const knob = Math.max(line.radius * 0.5, size * 0.06);
  for (const [end, at] of [
    ["top", upper],
    ["bottom", lower],
  ] as const) {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(knob, 16, 12),
      new THREE.MeshBasicMaterial({ color: bad ? HOLE_BAD : HOLE_TIP, depthTest: false }),
    );
    ball.position.copy(at);
    ball.renderOrder = 16;
    tag(ball, { kind: "hole-tip", tooth, end });
    root.add(ball);
  }
}

const TRANSFORM_HANDLE = 0x0f766e;
const TRANSFORM_ROTATE = 0xf59e0b;

/**
 * 변형 상자. 모서리는 크기(Shift면 가운데 기준 대칭), 위 공은 이동, 위 원뿔은 높이, 옆 공은 회전.
 * 핸들마다 `userData.transformBox`에 상자를 둔다.
 */
function addTransformHandles(
  root: THREE.Group,
  args: {
    tooth: string;
    center: THREE.Vector3;
    normal: THREE.Vector3;
    quat: THREE.Quaternion;
    frame: THREE.Quaternion;
    width: number;
    height: number;
    depth: number;
    size: number;
  },
) {
  const box: TransformBox = {
    center: args.center.clone(),
    normal: args.normal.clone(),
    x: new THREE.Vector3(1, 0, 0).applyQuaternion(args.quat),
    z: new THREE.Vector3(0, 0, 1).applyQuaternion(args.quat),
    frameX: new THREE.Vector3(1, 0, 0).applyQuaternion(args.frame),
    frameZ: new THREE.Vector3(0, 0, 1).applyQuaternion(args.frame),
    halfX: args.width,
    halfZ: args.depth,
  };
  const corner = (sx: number, sz: number) =>
    box.center.clone().addScaledVector(box.x, sx * box.halfX).addScaledVector(box.z, sz * box.halfZ);
  const outline = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      corner(-1, -1),
      corner(1, -1),
      corner(1, 1),
      corner(-1, 1),
    ]),
    new THREE.LineBasicMaterial({ color: TRANSFORM_HANDLE, depthTest: false }),
  );
  outline.renderOrder = 13;
  outline.frustumCulled = false;
  root.add(outline);
  const add = (mesh: THREE.Mesh, hit: EditHit) => {
    mesh.renderOrder = 14;
    mesh.userData.transformBox = box;
    tag(mesh, hit);
    root.add(mesh);
  };
  const cube = args.size * 0.1;
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(cube, cube, cube),
        new THREE.MeshBasicMaterial({ color: TRANSFORM_HANDLE, depthTest: false }),
      );
      handle.quaternion.copy(args.quat);
      handle.position.copy(corner(sx, sz));
      add(handle, { kind: "transform", tooth: args.tooth, handle: "corner", sx, sz });
    }
  }
  const top = box.center.clone().addScaledVector(box.normal, args.height);
  const move = new THREE.Mesh(
    new THREE.SphereGeometry(args.size * 0.08, 16, 12),
    new THREE.MeshBasicMaterial({ color: TRANSFORM_HANDLE, depthTest: false }),
  );
  move.position.copy(top).addScaledVector(box.normal, args.size * 0.14);
  add(move, { kind: "transform", tooth: args.tooth, handle: "move" });
  const lift = new THREE.Mesh(
    new THREE.ConeGeometry(args.size * 0.07, args.size * 0.18, 16),
    new THREE.MeshBasicMaterial({ color: TRANSFORM_HANDLE, depthTest: false }),
  );
  lift.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), box.normal);
  lift.position.copy(top).addScaledVector(box.normal, args.size * 0.42);
  add(lift, { kind: "transform", tooth: args.tooth, handle: "height" });
  const spin = new THREE.Mesh(
    new THREE.SphereGeometry(args.size * 0.08, 16, 12),
    new THREE.MeshBasicMaterial({ color: TRANSFORM_ROTATE, depthTest: false }),
  );
  spin.position.copy(box.center).addScaledVector(box.x, box.halfX + args.size * 0.35);
  add(spin, { kind: "transform", tooth: args.tooth, handle: "rotate" });
}

/** 크라운 타원체가 방향 dir(단위, 월드)으로 중심에서 뻗는 거리. */
function crownSupport(pose: CrownPose, dir: THREE.Vector3) {
  const d = dir.clone().applyQuaternion(pose.quat.clone().invert());
  return Math.hypot(pose.width * d.x, pose.height * d.y, pose.depth * d.z);
}

/**
 * 커넥터를 끈 브리지 이음매의 디스크 평면. 두 크라운이 서로 뻗은 끝의 가운데에 평면을 두고,
 * 양쪽을 간격 절반씩 물린다. 둘 다 생성된 치아만 깎는다.
 */
function discPlanes(args: {
  spec: ProsthesisDesignEdit;
  byTooth: Map<string, Place>;
  right: THREE.Vector3;
  toothNormal: (tooth: string) => THREE.Vector3;
  unit: number;
}) {
  const out = new Map<string, DiscPlane[]>();
  const push = (tooth: string, plane: DiscPlane) => {
    const rows = out.get(tooth) ?? [];
    rows.push(plane);
    out.set(tooth, rows);
  };
  for (const link of args.spec.bridges) {
    const fromEdit = args.spec.edits[link.from];
    const toEdit = args.spec.edits[link.to];
    if (!fromEdit || !toEdit || fromEdit.connector.linked) continue;
    const gapMm = fromEdit.connector.discMm;
    if (!(gapMm > 0)) continue;
    if (args.spec.generated[link.from] !== true || args.spec.generated[link.to] !== true) continue;
    if (args.spec.cavityKinds?.[link.from] || args.spec.cavityKinds?.[link.to]) continue;
    const fromPlace = args.byTooth.get(link.from);
    const toPlace = args.byTooth.get(link.to);
    if (!fromPlace || !toPlace) continue;
    const dir = toPlace.center.clone().sub(fromPlace.center);
    if (dir.lengthSq() < 1e-10) continue;
    dir.normalize();
    const fromPose = crownPose(fromPlace, args.toothNormal(link.from), args.right, fromEdit, args.unit);
    const toPose = crownPose(toPlace, args.toothNormal(link.to), args.right, toEdit, args.unit);
    const fromEnd = fromPose.position.dot(dir) + crownSupport(fromPose, dir);
    const toEnd = toPose.position.dot(dir) - crownSupport(toPose, dir);
    const mid = (fromEnd + toEnd) / 2;
    const half = gapMm / 2 / args.unit;
    push(link.from, { normal: [dir.x, dir.y, dir.z], offset: mid - half });
    push(link.to, { normal: [-dir.x, -dir.y, -dir.z], offset: -(mid + half) });
  }
  return out;
}

export function buildProsthesisEditLayer(args: {
  placements: Place[];
  frame: Frame | null;
  insertionByTooth: Map<string, THREE.Vector3>;
  unitToMm: number;
  spec: ProsthesisDesignEdit;
  probe?: ScanDistanceProbe | null;
  /** 선택 크라운 치아의 마진 점마다 스캔 언더컷 면 위인지. */
  marginUndercut?: ((tooth: string, points: readonly THREE.Vector3[]) => boolean[]) | null;
  /** 홀을 켠 생성 치아마다 검사 결과. 통과면 null. */
  onHoleIssue?: ((tooth: string, issue: string | null) => void) | null;
  /** 치아마다 대합·인접·치조정 스캔. 없으면 맞춤·접촉 색을 하지 않는다. */
  adaptScan?: ((tooth: string) => CrownAdaptScan | null) | null;
  /** 켜면 크라운도 스캔과 같은 접촉 색으로 칠한다. */
  contactPaint?: { gapMm: number; mode: ContactPaintMode } | null;
  /** 뷰어가 들고 있는 맞춤 캐시. 스캔이 바뀌면 뷰어가 비운다. */
  adaptCache?: Map<string, CachedCrown> | null;
  /** 생성 크라운마다 맞춘 뒤 가장 얇은 외면(mm). 맞춤이 없으면 null. */
  onCrownShell?: ((tooth: string, mm: number | null) => void) | null;
  /** 켜면 크라운을 칼라맵(간섭·두께·내면 간격)으로 칠한다. 값은 정점마다 재서 지오메트리에 둔다. */
  colorMap?: ColorMapState | null;
  /** 생성 크라운마다 내면 메시를 만들었는지와 결과. */
  onIntaglio?: ((tooth: string, info: CrownIntaglioInfo) => void) | null;
}) {
  const root = new THREE.Group();
  root.name = "prosthesis-edit";
  const unit = args.unitToMm > 0 ? args.unitToMm : 1;
  const up = args.frame?.up ?? new THREE.Vector3(0, 0, 1);
  const right = args.frame?.right ?? new THREE.Vector3(1, 0, 0);
  const byTooth = new Map(args.placements.map((row) => [row.toothNumber, row]));
  const toothNormal = (tooth: string) => {
    const normal = args.insertionByTooth.get(tooth)?.clone() ?? up.clone();
    if (normal.lengthSq() < 1e-8) normal.copy(up);
    return normal.normalize();
  };
  const discsByTooth = discPlanes({ ...args, byTooth, right, toothNormal, unit });

  for (const [tooth, edit] of Object.entries(args.spec.edits)) {
    const place = byTooth.get(tooth);
    if (!place) continue;
    const normal = toothNormal(tooth);
    const quat = basisQuaternion(normal, right);
    const active = args.spec.activeTooth === tooth;
    const generated = args.spec.generated[tooth] === true;
    const cavityKind =
      edit.pontic.on || edit.implant.on ? null : (args.spec.cavityKinds?.[tooth] ?? null);
    const taper = cavityKind ? (normalizeCavityInfo(edit.margin.cavity)?.taperDeg ?? []) : [];

    if (args.spec.showMargin && !edit.margin.deleted && !edit.pontic.on) {
      const points = marginWorldPoints({
        place,
        normal,
        right,
        margin: edit.margin,
        unitToMm: unit,
      });
      const onUndercut =
        active && !cavityKind && !edit.implant.on
          ? (args.marginUndercut?.(tooth, points) ?? [])
          : [];
      points.forEach((local, index) => {
        const issue = onUndercut[index] ? "undercut" : cavityTaperIssue(taper[index]);
        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(Math.max(place.radius * 0.042, 0.12), 10, 8),
          new THREE.MeshBasicMaterial({
            color:
              issue === "undercut"
                ? TAPER_UNDERCUT
                : issue === "wide"
                  ? TAPER_WIDE
                  : active
                    ? MARGIN
                    : 0x94a3b8,
            depthTest: false,
          }),
        );
        dot.position.copy(local);
        dot.renderOrder = 12;
        tag(dot, { kind: "margin", tooth, index });
        root.add(dot);
      });
      if (points.length > 2) {
        const line = new THREE.Mesh(
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3(points, true, "centripetal"),
            Math.min(Math.max(points.length * 2, 24), 800),
            Math.max(place.radius * 0.042, 0.12) * 0.4,
            6,
            true,
          ),
          new THREE.MeshBasicMaterial({
            color: active ? MARGIN : 0x94a3b8,
            depthTest: false,
          }),
        );
        line.renderOrder = 11;
        line.frustumCulled = false;
        line.userData.marginPoints = points;
        tag(line, { kind: "margin-line", tooth });
        root.add(line);
      }
    }

    const shape = args.spec.scanbodies[tooth];
    const pose = edit.implant.on ? implantPose(place, normal, edit.implant) : null;
    if (pose && shape && (edit.implant.libraryId || shape.mesh)) {
      const radius = shape.radiusMm / unit;
      const height = shape.heightMm / unit;
      const spin = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        (edit.implant.rotDeg * Math.PI) / 180,
      );
      const bodyQuat = basisQuaternion(pose.axis, right).multiply(spin);
      const showBody = !generated && (args.spec.tool === "scanbody" || !edit.implant.aligned);
      if (showBody) {
        const geometry = scanbodyGeometry(shape, unit);
        const pos = geometry.getAttribute("position");
        geometry.computeVertexNormals();
        const nor = geometry.getAttribute("normal");
        // 실제 형상은 꼭짓점이 많아 일부만 스캔 거리를 재고 이웃 번호에 같은 색을 쓴다.
        const stride = Math.max(1, Math.ceil(pos.count / 600));
        const points: THREE.Vector3[] = [];
        const normals: THREE.Vector3[] = [];
        const toWorld = new THREE.Matrix4().compose(pose.top, bodyQuat, new THREE.Vector3(1, 1, 1));
        const rot = new THREE.Matrix3().setFromMatrix4(toWorld);
        for (let i = 0; i < pos.count; i += stride) {
          points.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(toWorld));
          normals.push(new THREE.Vector3().fromBufferAttribute(nor, i).applyMatrix3(rot).normalize());
        }
        const distances = args.probe?.(tooth, points, normals) ?? [];
        const colors = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i += 1) {
          const rgb = fitDistanceRgb(distances[Math.floor(i / stride)] ?? null);
          colors[i * 3] = rgb[0];
          colors[i * 3 + 1] = rgb[1];
          colors[i * 3 + 2] = rgb[2];
        }
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        const body = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({
            color: 0xffffff,
            vertexColors: true,
            roughness: 0.5,
            transparent: true,
            opacity: edit.implant.aligned ? 0.92 : 0.6,
            depthWrite: edit.implant.aligned,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
          }),
        );
        body.quaternion.copy(bodyQuat);
        body.position.copy(pose.top);
        body.renderOrder = 6;
        tag(body, { kind: "scanbody", tooth });
        root.add(body);
        if (!shape.mesh) {
          const flat = new THREE.Mesh(
            new THREE.BoxGeometry(radius * 0.5, height * 0.35, radius * 0.12),
            new THREE.MeshBasicMaterial({ color: 0x0f766e, depthTest: false }),
          );
          flat.quaternion.copy(bodyQuat);
          flat.position
            .copy(pose.top)
            .addScaledVector(pose.axis, -height * 0.2)
            .add(new THREE.Vector3(0, 0, radius).applyQuaternion(bodyQuat));
          flat.renderOrder = 13;
          root.add(flat);
        }
      } else if (edit.implant.aligned && shape.mesh && shape.marginHeightMm != null) {
        const geometry = scanbodyGeometry(shape, unit);
        geometry.computeVertexNormals();
        const abutment = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.3, metalness: 0.6 }),
        );
        abutment.quaternion.copy(bodyQuat);
        abutment.position.copy(pose.top);
        abutment.renderOrder = 3;
        root.add(abutment);
      } else if (edit.implant.aligned) {
        const baseHeight = Math.min(height * 0.5, 5 / unit);
        const tiBase = new THREE.Mesh(
          new THREE.CylinderGeometry(radius * 0.72, radius * 0.82, baseHeight, 24),
          new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.3, metalness: 0.6 }),
        );
        tiBase.quaternion.copy(bodyQuat);
        tiBase.position
          .copy(pose.top)
          .addScaledVector(pose.axis, -height + baseHeight / 2);
        tiBase.renderOrder = 3;
        root.add(tiBase);
      }
    }

    if (!generated) continue;

    if (cavityKind) {
      const base = place.radius * 0.78;
      const extra = edit.margin.offsetMm / unit;
      const geometry = makeCavityRestorationGeometry({
        edit,
        kind: cavityKind,
        depthMm: cavityDepthMm(edit, cavityKind),
        unitToMm: unit,
        radial: edit.margin.radii.map((ratio) => Math.max(base * ratio + extra, 0)),
        axial: edit.margin.radii.map((_, index) => edit.margin.depths?.[index] ?? 0),
      });
      if (geometry) {
        const inlay = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({
            color: 0xffffff,
            vertexColors: true,
            roughness: 0.45,
            metalness: 0.04,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
          }),
        );
        inlay.quaternion.copy(quat);
        inlay.position.copy(place.center);
        inlay.renderOrder = 4;
        tag(inlay, { kind: "crown", tooth });
        root.add(inlay);
      }
      continue;
    }

    const crownAt = crownPose(place, normal, right, edit, unit);
    const { width, height, depth } = crownAt;
    const crownQuat = crownAt.quat;
    const holeEditing = args.spec.tool === "hole" && active;
    const holeLine = edit.pontic.on
      ? null
      : pose && edit.implant.screwHole
        ? screwHoleLine({
            place,
            normal,
            right,
            edit,
            unitToMm: unit,
            axis: { origin: pose.top, dir: pose.axis },
          })
        : !edit.implant.on && edit.hole.on
          ? screwHoleLine({ place, normal, right, edit, unitToMm: unit })
          : null;
    if (holeLine) args.onHoleIssue?.(tooth, holeLine.issue);
    const cutHole =
      holeLine && !holeLine.issue && (edit.implant.on || edit.hole.applied) ? holeLine : null;
    const crownMatrix = new THREE.Matrix4().compose(
      crownAt.position,
      crownAt.quat,
      new THREE.Vector3(width, height, depth),
    );
    const fine = Boolean(cutHole);
    const discs = discsByTooth.get(tooth) ?? [];
    const anatomy = localAnatomyDirs(
      toothArchDirs({ tooth, placements: args.placements, frame: args.frame, normal }),
      quat,
    );
    const colorMap = args.colorMap?.on ? args.colorMap : null;
    const cacheKey = args.adaptCache
      ? JSON.stringify([
          tooth,
          fine,
          // 훅과 깎기 전 컷백 선택은 크라운 형상을 바꾸지 않아 맞춤을 다시 하지 않는다.
          {
            ...edit,
            hook: null,
            cutback: edit.cutback.applied ? { ...edit.cutback, brushMm: 0 } : null,
          },
          crownMatrix.elements.map((n) => Math.round(n * 1e5)),
          args.contactPaint ?? null,
          discs.map((row) => [...row.normal, row.offset].map((n) => Math.round(n * 1e5))),
          anatomy ? Object.values(anatomy).map((n) => Math.round(n * 1e4)) : null,
          place.radius,
          place.center.toArray().map((n) => Math.round(n * 1e4)),
          colorMap != null,
        ])
      : "";
    let crownGeometry: THREE.BufferGeometry;
    let crownGroups: CachedCrown["groups"];
    let crownValues: ColorMapValues | null;
    let crownIntaglio: CrownIntaglioInfo;
    let crownOuterCount: number;
    const cached = args.adaptCache?.get(cacheKey);
    if (cached) {
      crownGeometry = new THREE.BufferGeometry();
      crownGeometry.setAttribute("position", new THREE.BufferAttribute(cached.positions.slice(), 3));
      crownGeometry.setAttribute("normal", new THREE.BufferAttribute(cached.normals.slice(), 3));
      crownGeometry.setAttribute("color", new THREE.BufferAttribute(cached.colors.slice(), 3));
      if (cached.index) crownGeometry.setIndex(new THREE.BufferAttribute(cached.index.slice(), 1));
      for (const group of cached.groups) {
        crownGeometry.addGroup(group.start, group.count, group.materialIndex);
      }
      crownGroups = cached.groups;
      crownValues = cached.values;
      crownIntaglio = cached.intaglio;
      crownOuterCount = cached.outerCount;
      args.onCrownShell?.(tooth, cached.shellMm);
    } else {
      const shaped = makeCrownGeometry(edit, fine, anatomy, tooth);
      const marginRatio = place.radius * 0.78;
      const adapted = adaptCrownGeometry({
        geometry: shaped,
        matrix: crownMatrix,
        normal,
        edit,
        unit,
        scan: () => args.adaptScan?.(tooth) ?? null,
        contactPaint: args.contactPaint ?? null,
        discs,
        cervical: edit.margin.deleted ? null : { center: place.center, frameQuat: quat },
        marginRing: edit.margin.deleted
          ? null
          : {
              radii: edit.margin.radii.map((ratio) => marginRatio * ratio + edit.margin.offsetMm / unit),
              depths: edit.margin.radii.map((_, index) => edit.margin.depths?.[index] ?? 0),
            },
        intaglio: !cutHole && !edit.implant.on,
        needValues: colorMap != null,
        anatomy,
      });
      const { shellMm } = adapted;
      crownGeometry = cutHole ? cutScrewHole(shaped, crownMatrix, cutHole) : shaped;
      crownGroups = adapted.groups;
      crownValues = adapted.values;
      crownIntaglio = adapted.intaglio;
      crownOuterCount = cutHole
        ? crownGeometry.getAttribute("position").count
        : adapted.outerCount;
      args.onCrownShell?.(tooth, shellMm);
      if (args.adaptCache) {
        if (args.adaptCache.size > 64) args.adaptCache.clear();
        const index = crownGeometry.getIndex();
        args.adaptCache.set(cacheKey, {
          positions: (crownGeometry.getAttribute("position").array as Float32Array).slice(),
          normals: (crownGeometry.getAttribute("normal").array as Float32Array).slice(),
          colors: (crownGeometry.getAttribute("color").array as Float32Array).slice(),
          index: index ? Uint32Array.from(index.array as ArrayLike<number>) : null,
          shellMm,
          groups: crownGroups,
          values: crownValues,
          intaglio: crownIntaglio,
          outerCount: crownOuterCount,
        });
      }
    }
    args.onIntaglio?.(tooth, crownIntaglio);
    const hasIntaglio = crownGroups.length > 1;
    if (colorMap && crownValues) {
      paintColorMap(
        crownGeometry.getAttribute("color").array as Float32Array,
        crownValues,
        colorMap.mode,
        colorMap.half[colorMap.mode],
      );
      crownGeometry.getAttribute("color").needsUpdate = true;
      crownGeometry.userData.colorMap = { values: crownValues, mode: colorMap.mode };
    }
    if (args.spec.tool === "cutback" && active && !edit.cutback.applied) {
      paintCutbackSelection(crownGeometry, crownOuterCount, crownMatrix, edit, unit, anatomy);
    }
    const crownMaterial = () =>
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.45,
        metalness: 0.04,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        // 홀 자리를 잡는 동안 지대치와 원기둥이 비쳐 보이게 한다.
        transparent: holeEditing,
        opacity: holeEditing ? 0.62 : 1,
        depthWrite: !holeEditing,
      });
    // 내면 간격을 볼 때는 외면을 숨겨 안쪽 면을 보인다. 안 보여도 내보내기에는 그대로 들어간다.
    const outerMaterial = crownMaterial();
    const innerMaterial = crownMaterial();
    const seeFit = colorMap?.mode === "fit" && hasIntaglio;
    outerMaterial.visible = !seeFit;
    innerMaterial.side = THREE.DoubleSide;
    const crown = new THREE.Mesh(
      crownGeometry,
      hasIntaglio ? [outerMaterial, innerMaterial] : outerMaterial,
    );
    crown.quaternion.copy(crownAt.quat);
    crown.scale.set(width, height, depth);
    crown.position.copy(crownAt.position);
    crown.renderOrder = 4;
    crown.userData.crownBody = true;
    tag(crown, { kind: "crown", tooth });
    root.add(crown);
    const wallGeometry = cutHole ? screwHoleWall(cutHole, crownAt) : null;
    if (wallGeometry) {
      const wall = new THREE.Mesh(
        wallGeometry,
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(...CROWN_RGB).multiplyScalar(0.92),
          roughness: 0.5,
          side: THREE.DoubleSide,
          transparent: holeEditing,
          opacity: holeEditing ? 0.62 : 1,
          depthWrite: !holeEditing,
        }),
      );
      wall.renderOrder = 4;
      wall.userData.holeWall = true;
      tag(wall, { kind: "crown", tooth });
      root.add(wall);
    }
    if (holeEditing && holeLine && !edit.implant.on) {
      screwHoleHandles(root, tooth, holeLine, place.radius);
    }

    if (args.spec.tool === "inner" && !edit.pontic.on) {
      // 내면은 지대치에 붙으므로 변형 전 크기를 쓴다.
      const width = crownAt.baseWidth;
      const height = crownAt.baseHeight;
      const depth = crownAt.baseDepth;
      const gap = innerGapMm(edit.inner) / unit;
      const sealGap = edit.inner.sealGapMm / unit;
      const sealHeight = Math.min(edit.inner.sealHeightMm / unit, height * 0.4);
      const inner = new THREE.Mesh(
        new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.42),
        new THREE.MeshStandardMaterial({
          color: INNER_GAP,
          roughness: 0.7,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      );
      inner.quaternion.copy(quat);
      inner.scale.set(
        Math.max(width - gap, width * 0.7),
        Math.max(height * 0.55 - sealHeight * 0.5, height * 0.28),
        Math.max(depth - gap, depth * 0.7),
      );
      inner.position.copy(place.center).addScaledVector(normal, sealHeight * 0.5);
      inner.renderOrder = 3;
      root.add(inner);
      if (sealHeight > 1e-6) {
        const seal = new THREE.Mesh(
          new THREE.CylinderGeometry(1, 1, 1, 32, 1, true),
          new THREE.MeshStandardMaterial({
            color: INNER_SEAL,
            roughness: 0.6,
            transparent: true,
            opacity: 0.6,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        seal.quaternion.copy(quat);
        seal.scale.set(
          Math.max(width - sealGap, width * 0.7) * 0.97,
          sealHeight,
          Math.max(depth - sealGap, depth * 0.7) * 0.97,
        );
        seal.position.copy(place.center).addScaledVector(normal, sealHeight * 0.5);
        seal.renderOrder = 3;
        root.add(seal);
      }
    }

    if (
      args.spec.tool === "refine" &&
      active &&
      (args.spec.refineTab ?? "transform") === "transform"
    ) {
      addTransformHandles(root, {
        tooth,
        center: crown.position.clone(),
        normal,
        quat: crownQuat,
        frame: quat,
        width,
        height,
        depth,
        size: place.radius,
      });
    }

    if (edit.hook.hooks.length > 0) {
      addHooks(root, {
        tooth,
        hook: edit.hook,
        crownMatrix,
        unit,
        editing: args.spec.tool === "hook" && active,
      });
    }

    if (pose && holeLine && edit.implant.screwHole) {
      const holeRadius = holeLine.radius;
      const holeQuat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        pose.axis,
      );
      if (args.spec.showScrewPath) {
        const reach = height * 1.2 + 8 / unit;
        const path = new THREE.Mesh(
          new THREE.CylinderGeometry(holeRadius * 1.05, holeRadius * 1.05, reach, 20, 1, true),
          new THREE.MeshBasicMaterial({
            color: 0xf59e0b,
            transparent: true,
            opacity: 0.3,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        path.quaternion.copy(holeQuat);
        path.position.copy(crown.position).addScaledVector(pose.axis, reach / 2 - height * 0.4);
        path.renderOrder = 15;
        root.add(path);
      }
    }
  }

  for (const link of args.spec.bridges) {
    const edit = args.spec.edits[link.from];
    if (!edit || !edit.connector.linked) continue;
    if (args.spec.generated[link.from] !== true || args.spec.generated[link.to] !== true) {
      continue;
    }
    const place = connectorFrame({ ...args, link, connector: edit.connector });
    if (!place) continue;
    const reach = edit.connector.assembled ? place.span * 0.78 : place.span * 0.28;
    const shape = edit.connector.shape;
    const weak = connectorIsWeak(edit, [link.from, link.to]);
    const mesh = new THREE.Mesh(
      connectorGeometry(shape),
      new THREE.MeshStandardMaterial({
        color: weak ? 0xdb332e : edit.connector.assembled ? 0xf8f4ee : 0xe7c9a4,
        roughness: 0.42,
      }),
    );
    // 로컬 x=가로(협설), y=치아 사이, z=세로(교합-치은). 단면이 가로×세로 mm다.
    mesh.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(place.lateral, place.axis, place.up),
    );
    mesh.scale.set(
      edit.connector.transverseMm / unit,
      reach,
      edit.connector.verticalMm / unit,
    );
    mesh.position.copy(place.center);
    tag(mesh, { kind: "connector", tooth: link.from });
    root.add(mesh);
  }

  return root;
}

/** 단면 윤곽을 y축(치아 사이)으로 길이 1만큼 민 기둥. 윤곽 y는 로컬 z가 된다. */
function connectorGeometry(shape: ConnectorShape) {
  if (shape === "round") return new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
  const outline = new THREE.Shape(
    connectorOutline(shape).map(([x, y]) => new THREE.Vector2(x, y)),
  );
  const geometry = new THREE.ExtrudeGeometry(outline, { depth: 1, bevelEnabled: false });
  // 윤곽은 xy, 압출은 +z. 로컬 x=가로, y=치아 사이(−0.5~0.5), z=세로로 돌린다.
  geometry.translate(0, 0, -0.5);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

export type ConnectorFrame = {
  /** 두 치아 사이 커넥터 기준점(이동 전). */
  mid: THREE.Vector3;
  /** 이동을 더한 커넥터 중심. */
  center: THREE.Vector3;
  /** from → to 단위 벡터. */
  axis: THREE.Vector3;
  /** 치아 사이 축에 수직인 교합 방향. */
  up: THREE.Vector3;
  /** axis × up. 협설 방향. */
  lateral: THREE.Vector3;
  span: number;
  radius: number;
};

/** 커넥터 단면 좌표계. 레이어와 단면 보기(Focus View)가 같이 쓴다. */
export function connectorFrame(args: {
  placements: Place[];
  frame: Frame | null;
  insertionByTooth: Map<string, THREE.Vector3>;
  unitToMm: number;
  link: { from: string; to: string };
  connector: ToothDesignEdit["connector"];
}): ConnectorFrame | null {
  const from = args.placements.find((row) => row.toothNumber === args.link.from);
  const to = args.placements.find((row) => row.toothNumber === args.link.to);
  if (!from || !to) return null;
  const axis = to.center.clone().sub(from.center);
  const span = axis.length();
  if (span < 1e-4) return null;
  axis.multiplyScalar(1 / span);
  const up = (args.insertionByTooth.get(args.link.from)?.clone() ?? new THREE.Vector3())
    .add(args.insertionByTooth.get(args.link.to) ?? new THREE.Vector3());
  if (up.lengthSq() < 1e-8) up.copy(args.frame?.up ?? new THREE.Vector3(0, 0, 1));
  up.addScaledVector(axis, -up.dot(axis));
  if (up.lengthSq() < 1e-8) {
    up.set(0, 0, 1).addScaledVector(axis, -axis.z);
    if (up.lengthSq() < 1e-8) up.set(1, 0, 0);
  }
  up.normalize();
  const lateral = new THREE.Vector3().crossVectors(axis, up).normalize();
  const unit = args.unitToMm > 0 ? args.unitToMm : 1;
  const mid = from.center.clone().lerp(to.center, args.connector.along);
  const center = mid
    .clone()
    .addScaledVector(lateral, args.connector.shiftXMm / unit)
    .addScaledVector(up, args.connector.shiftYMm / unit);
  return {
    mid,
    center,
    axis,
    up,
    lateral,
    span,
    radius: Math.max(from.radius, to.radius),
  };
}

export function readEditHit(object: THREE.Object3D | null): EditHit | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const hit = current.userData.editHit as EditHit | undefined;
    if (hit?.kind) return hit;
    current = current.parent;
  }
  return null;
}
