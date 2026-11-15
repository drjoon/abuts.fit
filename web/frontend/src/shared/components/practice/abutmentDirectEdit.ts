// 커스텀어벗 뷰어의 직접 편집.
// 검볼은 포스트 중심에 두고, 화면을 정면으로 본다. 뷰가 바뀌면 검볼 방향도 바뀐다.
// 화살표는 그 방향으로 포스트를 옮긴다. 축 상자는 그 방향 크기, 노란 면은 평면, 흰 고리는 전체 크기다.
// 커넥션과 그 위 2° 테이퍼는 고정이다. 그 위 커프부터 포스트만 허용 범위 안에서 다시 계산한다.
// 스크류 홀은 임플란트 축에 남기고, 윗면이 움직이면 입구 높이만 따라간다.
// related files:
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx
// - web/frontend/src/shared/practice/customAbutmentDesignParams.ts
// - web/frontend/src/shared/files/stlBinaryWrite.ts

import * as THREE from "three";

import { encodeBinaryStl } from "../../files/stlBinaryWrite";
import {
  CUSTOM_ABUTMENT_PARAM_SPECS,
  isAnteriorTooth,
  type CustomAbutmentDesignParams,
} from "../../practice/customAbutmentDesignParams";
import { withDoubleSidePick } from "../../three/backFaceShell";

const AXIS_COLOR = [0xef4444, 0x22c55e, 0x3b82f6] as const;
const SCALE_MIN = 0.8;
const SCALE_MAX = 1.15;
const SHIFT_MM = 2;
const HEIGHT_MM = 2;
const YAW_DEG = 30;
const HISTORY_LIMIT = 40;

export type DirectEditFixture = {
  labialDir: readonly number[];
  mesialDir: readonly number[];
  fixturePose: {
    hexX: readonly number[];
    hexY: readonly number[];
    axis: readonly number[];
    origin: readonly number[];
  };
  connectionSpec?: {
    prcConeTopMm: number;
    screwUpperDiameterMm: number;
  };
};

export type DirectEditDesign = {
  toothNumber: string;
  fixture: DirectEditFixture;
  localPositions: Float32Array;
  crownLocalPositions: Float32Array;
  marginLoopLocal: Float32Array;
  stlBlob: Blob;
  params?: Partial<CustomAbutmentDesignParams>;
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

export type AbutmentEditSummary = {
  tooth: string;
  widthRatio: number;
  heightDeltaMm: number;
  yawDeg: number;
  shiftLabialMm: number;
  shiftMesialMm: number;
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
  screwR: number;
  span: number;
  labial: [number, number];
  mesial: [number, number];
};

type ToothView = {
  geometry: THREE.BufferGeometry;
  proposal: Float32Array;
  proposalCrown: Float32Array | null;
  proposalMargin: Float32Array | null;
  zone: Zone;
  anchor: THREE.Vector3;
  midZ: number;
  quat: THREE.Quaternion;
  axes: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  invFixture: THREE.Matrix4;
  fixture: THREE.Matrix4;
  gumball: THREE.Group;
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
      startDist: number;
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
  ui: {
    gumballOn: boolean;
    sculptOn: boolean;
    radiusMm: number;
    readOnly: boolean;
    selected: string | null;
    visible: Record<string, boolean>;
  };
  onBadge: (tooth: string) => void;
  onCommit: (summary: AbutmentEditSummary) => void;
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
  const tiltSpan = Math.max(span, 0.5);
  const maxTilt = (roomMm: number) => (Math.atan2(roomMm, tiltSpan) * 180) / Math.PI;
  edit.tiltLabialDeg = clamp(
    edit.tiltLabialDeg,
    -maxTilt(SHIFT_MM - Math.abs(edit.shiftLabialMm)),
    maxTilt(SHIFT_MM - Math.abs(edit.shiftLabialMm)),
  );
  edit.tiltMesialDeg = clamp(
    edit.tiltMesialDeg,
    -maxTilt(SHIFT_MM - Math.abs(edit.shiftMesialMm)),
    maxTilt(SHIFT_MM - Math.abs(edit.shiftMesialMm)),
  );
  edit.scale[0] = clamp(edit.scale[0], SCALE_MIN, SCALE_MAX);
  edit.scale[1] = clamp(edit.scale[1], SCALE_MIN, SCALE_MAX);
  const reach = Math.max(span, 0.5);
  const maxSz = Math.min(SCALE_MAX - 1, HEIGHT_MM / reach);
  edit.scale[2] = clamp(edit.scale[2], 1 - maxSz, 1 + maxSz);
  const fromScale = (edit.scale[2] - 1) * reach;
  const room = Math.max(0, HEIGHT_MM - Math.abs(fromScale));
  edit.heightMm = clamp(edit.heightMm, -room, room);
  edit.partial = edit.partial.slice(-24);
  return edit;
}

function blendAbove(z: number, coneZ: number, marginZ: number) {
  if (z <= coneZ) return 0;
  if (z >= marginZ) return 1;
  const t = (z - coneZ) / Math.max(marginZ - coneZ, 0.35);
  return t * t * (3 - 2 * t);
}

function angleDelta(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

/**
 * 초기 제안 정점에서 커넥션과 2° 테이퍼는 복사하고, 그 위 커프·포스트만 다시 놓는다.
 * 스크류 홀은 반경을 유지하고, 윗면 입구만 높이를 따라간다.
 * 반경은 제안 대비 0.8~1.15, 높이 이동은 ±2mm를 넘지 않는다.
 */
export function refitLocalPositions(
  proposal: Float32Array,
  edit: AbutmentEdit,
  zone: Zone,
  out: Float32Array,
): { widthRatio: number; heightDeltaMm: number } {
  const { fixedZ, marginZ, screwR, labial, mesial } = zone;
  const yawRad = (edit.yawDeg * Math.PI) / 180;
  const hole = screwR > 0.15;
  const minWallR = screwR + 0.08;
  let widthSum = 0;
  let widthN = 0;
  let propTop = -Infinity;
  let boreTop = -Infinity;
  let nextTop = -Infinity;
  for (let i = 0; i < proposal.length; i += 3) {
    const z = proposal[i + 2]!;
    if (z > propTop) propTop = z;
    if (!hole) continue;
    const r = Math.hypot(proposal[i]!, proposal[i + 1]!);
    if (r <= screwR && z > boreTop) boreTop = z;
  }
  const rimZ = (Number.isFinite(boreTop) ? boreTop : propTop) - 0.7;
  for (let i = 0; i < proposal.length; i += 3) {
    const x = proposal[i]!;
    const y = proposal[i + 1]!;
    const z = proposal[i + 2]!;
    const rProp = Math.hypot(x, y);
    const t = blendAbove(z, fixedZ, marginZ);
    const zLift = (z - fixedZ) * (edit.scale[2] - 1) * t + edit.heightMm * t;
    const z2 = z + clamp(zLift, -HEIGHT_MM, HEIGHT_MM);
    const frozenTaper = z <= fixedZ + 0.02;
    const deepBore = hole && rProp <= screwR && z < rimZ;
    if (frozenTaper || deepBore) {
      out[i] = x;
      out[i + 1] = y;
      out[i + 2] = z;
      if (z > nextTop) nextTop = z;
      continue;
    }
    if (hole && rProp <= screwR + 0.22 && z >= rimZ) {
      out[i] = x;
      out[i + 1] = y;
      out[i + 2] = z2;
      if (z2 > nextTop) nextTop = z2;
      continue;
    }
    const l = x * labial[0] + y * labial[1];
    const m = x * mesial[0] + y * mesial[1];
    const yaw = yawRad * t;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const lS = l * (1 + (edit.scale[0] - 1) * t);
    const mS = m * (1 + (edit.scale[1] - 1) * t);
    const h = Math.max(z - fixedZ, 0);
    const offL = edit.shiftLabialMm + Math.tan((edit.tiltLabialDeg * Math.PI) / 180) * h;
    const offM = edit.shiftMesialMm + Math.tan((edit.tiltMesialDeg * Math.PI) / 180) * h;
    let ly = lS * c - mS * s + (offL * c - offM * s) * t;
    let my = lS * s + mS * c + (offL * s + offM * c) * t;
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
      const rNow = Math.hypot(out[i]!, out[i + 1]!);
      widthSum += rNow / Math.max(rProp, 1e-4);
      widthN += 1;
    }
    if (z2 > nextTop) nextTop = z2;
  }
  return {
    widthRatio: widthN > 0 ? widthSum / widthN : 1,
    heightDeltaMm: Number.isFinite(propTop) ? clamp(nextTop - propTop, -HEIGHT_MM, HEIGHT_MM) : 0,
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

function zoneOf(design: DirectEditDesign, proposal: Float32Array, margin: Float32Array | null): Zone {
  const axes = localAxes(design.fixture);
  const coneZ = design.fixture.connectionSpec?.prcConeTopMm ?? 1;
  const screwR = (design.fixture.connectionSpec?.screwUpperDiameterMm ?? 2) / 2 + 0.2;
  let marginSum = 0;
  let marginN = 0;
  if (margin && margin.length >= 3) {
    for (let i = 2; i < margin.length; i += 3) {
      marginSum += margin[i]!;
      marginN += 1;
    }
  }
  let top = coneZ + 4;
  for (let i = 2; i < proposal.length; i += 3) top = Math.max(top, proposal[i]!);
  const marginZ = Math.max(marginN > 0 ? marginSum / marginN : coneZ + 1.5, coneZ + 0.4);
  const spanToMargin = Math.max(0.35, marginZ - coneZ);
  let fixedZ = coneZ + Math.max(0.45, Math.min(1.35, spanToMargin * 0.25));
  if (fixedZ > marginZ - 0.25) fixedZ = Math.max(coneZ, marginZ - 0.25);
  return {
    coneZ,
    fixedZ,
    marginZ,
    screwR,
    span: Math.max(0.5, top - coneZ),
    labial: axes.labial,
    mesial: axes.mesial,
  };
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

function writeAttribute(geometry: THREE.BufferGeometry, positions: Float32Array) {
  const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
  (attr.array as Float32Array).set(positions.subarray(0, attr.array.length));
  attr.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
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

function alongAxis(mesh: THREE.Object3D, axis: number, distance: number) {
  mesh.position.set(axis === 0 ? distance : 0, axis === 1 ? distance : 0, axis === 2 ? distance : 0);
  if (axis === 0) mesh.rotation.z = -Math.PI / 2;
  else if (axis === 2) mesh.rotation.x = Math.PI / 2;
}

function makeGumball(tooth: string) {
  const group = new THREE.Group();
  group.name = "abutment-gumball";
  group.userData.tooth = tooth;
  group.frustumCulled = false;
  const arcRoll = 0.62;
  for (let axis = 0; axis < 3; axis += 1) {
    const color = AXIS_COLOR[axis]!;
    const mat = basicMat(color);
    const shaft = tagHandle(
      new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.5, 12), mat),
      "move",
      axis,
      -1,
      mat,
    );
    alongAxis(shaft, axis, 0.78);
    const head = tagHandle(new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.28, 14), mat), "move", axis, -1, mat);
    alongAxis(head, axis, 1.12);
    const hit = tagHandle(
      new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.86, 10), basicMat(0xffffff, 0)),
      "move",
      axis,
      -1,
      mat,
    );
    alongAxis(hit, axis, 0.78);
    const scaleMat = basicMat(color);
    const box = tagHandle(
      new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), scaleMat),
      "scale",
      axis,
      -1,
      scaleMat,
    );
    box.position.set(axis === 0 ? 0.4 : 0, axis === 1 ? 0.4 : 0, axis === 2 ? 0.4 : 0);
    const scaleHit = tagHandle(
      new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), basicMat(0xffffff, 0)),
      "scale",
      axis,
      -1,
      scaleMat,
    );
    scaleHit.position.copy(box.position);
    const arcMat = basicMat(color);
    const arc = tagHandle(
      new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.045, 8, 20, Math.PI * 0.72), arcMat),
      "rot",
      axis,
      -1,
      arcMat,
    );
    const arcHit = tagHandle(
      new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.14, 6, 16, Math.PI * 0.72), basicMat(0xffffff, 0)),
      "rot",
      axis,
      -1,
      arcMat,
    );
    const orient = new THREE.Quaternion();
    if (axis === 0) orient.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    else if (axis === 1) orient.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const roll = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0),
      arcRoll,
    );
    arc.quaternion.copy(roll).multiply(orient);
    arcHit.quaternion.copy(arc.quaternion);
    group.add(shaft, head, hit, box, scaleHit, arc, arcHit);
  }
  const planePairs: Array<[number, number]> = [
    [0, 1],
    [1, 2],
    [2, 0],
  ];
  for (const [a, b] of planePairs) {
    const mat = basicMat(0xf5d90a, 0.9);
    const quad = tagHandle(new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), mat), "scale2", a, b, mat);
    const hit = tagHandle(
      new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), basicMat(0xffffff, 0)),
      "scale2",
      a,
      b,
      mat,
    );
    const pos = new THREE.Vector3();
    pos.setComponent(a, 0.36);
    pos.setComponent(b, 0.36);
    quad.position.copy(pos);
    hit.position.copy(pos);
    const facing = 3 - a - b;
    if (facing === 0) {
      quad.rotation.y = Math.PI / 2;
      hit.rotation.y = Math.PI / 2;
    } else if (facing === 1) {
      quad.rotation.x = Math.PI / 2;
      hit.rotation.x = Math.PI / 2;
    }
    group.add(quad, hit);
  }
  const ringMat = basicMat(0xf8fafc);
  const ring = tagHandle(new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.04, 8, 28), ringMat), "scale3", 0, -1, ringMat);
  const ringHit = tagHandle(
    new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.1, 6, 20), basicMat(0xffffff, 0)),
    "scale3",
    0,
    -1,
    ringMat,
  );
  const centerMat = basicMat(0xe2e8f0);
  const center = tagHandle(new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), centerMat), "center", 0, -1, centerMat);
  const centerHit = tagHandle(
    new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), basicMat(0xffffff, 0)),
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

const EMPTY_EDIT = identityAbutmentEdit();

export class AbutmentDirectEditSession {
  private readonly views = new Map<string, ToothView>();
  private readonly edits = new Map<string, AbutmentEdit>();
  private history: Array<{ tooth: string; before: AbutmentEdit; after: AbutmentEdit }> = [];
  private future: Array<{ tooth: string; before: AbutmentEdit; after: AbutmentEdit }> = [];
  private readonly stale = new Set<string>();
  private drag: Drag | null = null;
  private dom: HTMLElement | null = null;
  private hover: THREE.Object3D | null = null;
  private readonly brush: THREE.Mesh;
  private localBuf = new Float32Array(0);
  private worldBuf = new Float32Array(0);
  private summary: { widthRatio: number; heightDeltaMm: number } = { widthRatio: 1, heightDeltaMm: 0 };
  private readonly camRight = new THREE.Vector3();
  private readonly camUp = new THREE.Vector3();
  private readonly camForward = new THREE.Vector3();
  private readonly viewQuat = new THREE.Quaternion();
  private readonly basisM = new THREE.Matrix4();

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
      this.stale.delete(design.toothNumber);
      if (prev) this.disposeGumball(prev.gumball);
      if (rebuilt) {
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
      const margin = design.marginLoopLocal?.length ? new Float32Array(design.marginLoopLocal) : null;
      const fixture = fixtureMatrix(design.fixture.fixturePose);
      const view: ToothView = {
        geometry: mesh.geometry,
        proposal,
        proposalCrown: design.crownLocalPositions?.length ? new Float32Array(design.crownLocalPositions) : null,
        proposalMargin: margin,
        zone: zoneOf(design, proposal, margin),
        anchor: new THREE.Vector3(),
        midZ: 0,
        quat: new THREE.Quaternion(),
        axes: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
        invFixture: fixture.clone().invert(),
        fixture,
        gumball: makeGumball(design.toothNumber),
      };
      this.placeAnchor(view, design);
      this.views.set(design.toothNumber, view);
      scene.add(view.gumball);
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
      const selected = this.bridge.ui.selected === tooth;
      view.gumball.visible = show && visible;
      view.gumball.quaternion.copy(gumballQuat);
      view.gumball.position.copy(this.gumballPosition(view, edit));
      view.gumball.scale.setScalar(worldPerPx * (selected ? 156 : 132));
      if (mesh) this.moveBadge(mesh, view.gumball.position, show && visible);
    }
  }

  private readonly onDown = (event: PointerEvent) => {
    if (event.button !== 0 || !this.dom) return;
    if (this.bridge.ui.readOnly) return;
    const camera = this.bridge.getCamera();
    if (!camera) return;
    this.setNdc(event);
    raycaster.setFromCamera(ndc, camera);
    if (this.bridge.ui.gumballOn) {
      const groups = [...this.views.values()].filter((view) => view.gumball.visible).map((view) => view.gumball);
      const hit = raycaster.intersectObjects(groups, true)[0];
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
    if (!this.bridge.ui.sculptOn) return;
    const meshHit = this.pickAbutment();
    if (!meshHit) return;
    if (this.beginSculpt(event, meshHit.tooth, meshHit.hit)) {
      event.preventDefault();
      event.stopPropagation();
      this.dom.setPointerCapture(event.pointerId);
    }
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
        this.show(drag.tooth, false);
        this.bridge.onBadge(drag.tooth);
        return;
      }
    }
    if (drag.kind === "sculpt") this.finishSculpt(drag, event);
    const edit = this.edits.get(drag.tooth);
    if (!edit || editsEqual(edit, drag.start)) return;
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
      return true;
    }
    const hit = raycaster.ray.closestPointToPoint(center, vA).clone();
    const dist = Math.max(hit.sub(center).length(), 0.2);
    this.drag = {
      kind: handle.op,
      tooth: handle.tooth,
      axis: handle.axis,
      axis2: handle.axis2,
      start,
      startDist: dist,
      pointerId: event.pointerId,
    };
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
      edit.shiftLabialMm += delta.dot(view.axes[0]);
      edit.shiftMesialMm += delta.dot(view.axes[1]);
      edit.heightMm += delta.dot(view.axes[2]);
    } else if (drag.kind === "move" || drag.kind === "scale") {
      const axis = drag.axisWorld;
      const center = this.gumballPosition(view, drag.start);
      this.axisPlane(axis, center);
      const hit = this.rayOnPlane(event);
      if (!hit) return;
      const along = hit.sub(center).dot(axis);
      const delta = along - drag.startAlong;
      if (drag.kind === "move") {
        edit.shiftLabialMm += delta * axis.dot(view.axes[0]);
        edit.shiftMesialMm += delta * axis.dot(view.axes[1]);
        edit.heightMm += delta * axis.dot(view.axes[2]);
      } else if (Math.abs(drag.startAlong) > 0.15) {
        this.scaleAlong(edit, drag.start, view, axis, along / drag.startAlong);
      }
    } else if (drag.kind === "rot") {
      const center = this.gumballPosition(view, drag.start);
      plane.setFromNormalAndCoplanarPoint(drag.worldAxis, center);
      const hit = this.rayOnPlane(event);
      if (!hit) return;
      const cur = hit.sub(center);
      const angle = Math.atan2(vA.crossVectors(drag.startVec, cur).dot(drag.worldAxis), drag.startVec.dot(cur));
      const deg = (angle * 180) / Math.PI;
      const axis = drag.worldAxis;
      edit.yawDeg += deg * axis.dot(view.axes[2]);
      edit.tiltMesialDeg += deg * axis.dot(view.axes[0]);
      edit.tiltLabialDeg -= deg * axis.dot(view.axes[1]);
    } else if (drag.kind === "scale2" || drag.kind === "scale3") {
      this.setNdc(event);
      raycaster.setFromCamera(ndc, camera);
      const center = this.gumballPosition(view, drag.start);
      const hit = raycaster.ray.closestPointToPoint(center, vA);
      const dist = Math.max(hit.sub(center).length(), 0.05);
      const factor = dist / drag.startDist;
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
      const hit = raycaster.intersectObjects(groups, true)[0];
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

  private show(tooth: string, bake: boolean) {
    const view = this.views.get(tooth);
    const design = this.bridge.getDesigns().find((row) => row.toothNumber === tooth);
    const mesh = this.bridge.getAbutment(tooth);
    if (!view || !design || !mesh) return;
    const edit = this.edits.get(tooth) ?? EMPTY_EDIT;
    const local = this.take("local", view.proposal.length);
    const measured = refitLocalPositions(view.proposal, edit, view.zone, local);
    this.summary = measured;
    const world = applyMatrixToPositions(local, view.fixture, this.take("world", local.length));
    writeAttribute(mesh.geometry, world);
    const crown = this.bridge.getCrown(tooth);
    if (crown && view.proposalCrown) {
      const crownLocal = new Float32Array(view.proposalCrown.length);
      refitLocalPositions(view.proposalCrown, { ...edit, partial: [] }, { ...view.zone, screwR: 0 }, crownLocal);
      writeAttribute(crown.geometry, applyMatrixToPositions(crownLocal, view.fixture, new Float32Array(crownLocal.length)));
      if (bake) design.crownLocalPositions = crownLocal;
    }
    if (view.proposalMargin) {
      const marginLocal = new Float32Array(view.proposalMargin.length);
      refitLocalPositions(view.proposalMargin, { ...edit, partial: [] }, { ...view.zone, screwR: 0 }, marginLocal);
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
      if (bake) design.marginLoopLocal = marginLocal;
    }
    if (bake) {
      design.localPositions = new Float32Array(local);
      design.stlBlob = encodeBinaryStl(design.localPositions, `abuts.fit custom abutment #${tooth}`);
      this.bridge.onCommit({
        tooth,
        widthRatio: measured.widthRatio,
        heightDeltaMm: measured.heightDeltaMm,
        yawDeg: edit.yawDeg,
        shiftLabialMm:
          edit.shiftLabialMm + Math.tan((edit.tiltLabialDeg * Math.PI) / 180) * view.zone.span,
        shiftMesialMm:
          edit.shiftMesialMm + Math.tan((edit.tiltMesialDeg * Math.PI) / 180) * view.zone.span,
      });
    }
    this.moveBadge(mesh, this.gumballPosition(view, edit), view.gumball.visible);
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
    const axis = vA.set(pose.axis[0] ?? 0, pose.axis[1] ?? 0, pose.axis[2] ?? 1).normalize();
    const labial = vB.set(design.fixture.labialDir[0] ?? 1, design.fixture.labialDir[1] ?? 0, design.fixture.labialDir[2] ?? 0);
    labial.addScaledVector(axis, -labial.dot(axis));
    if (labial.lengthSq() < 1e-8) labial.set(1, 0, 0).addScaledVector(axis, -axis.x);
    labial.normalize();
    const mesial = vC.crossVectors(axis, labial).normalize();
    const mesRaw = new THREE.Vector3(
      design.fixture.mesialDir[0] ?? 0,
      design.fixture.mesialDir[1] ?? 1,
      design.fixture.mesialDir[2] ?? 0,
    );
    if (labial.dot(new THREE.Vector3(...(design.fixture.labialDir as [number, number, number]))) + mesial.dot(mesRaw) < 0) {
      labial.negate();
      mesial.negate();
    }
    view.axes[0].copy(labial);
    view.axes[1].copy(mesial);
    view.axes[2].copy(axis);
    view.quat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(labial, mesial, axis));
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let n = 0;
    let top = -Infinity;
    const proposal = view.proposal;
    const postZ = Math.max(view.zone.marginZ, view.zone.fixedZ);
    for (let i = 0; i < proposal.length; i += 3) {
      const x = proposal[i]!;
      const y = proposal[i + 1]!;
      const z = proposal[i + 2]!;
      if (z > top) top = z;
      if (z <= postZ || Math.hypot(x, y) <= view.zone.screwR + 0.15) continue;
      sx += x;
      sy += y;
      sz += z;
      n += 1;
    }
    if (n > 0) {
      view.midZ = sz / n;
      view.anchor.set(sx / n, sy / n, sz / n);
    } else {
      view.midZ = Number.isFinite(top) ? (view.zone.fixedZ + top) / 2 : view.zone.fixedZ;
      view.anchor.set(0, 0, view.midZ);
    }
    view.anchor.applyMatrix4(view.fixture);
  }

  private gumballPosition(view: ToothView, edit: AbutmentEdit) {
    const yaw = (edit.yawDeg * Math.PI) / 180;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const h = Math.max(view.midZ - view.zone.fixedZ, 0);
    const offL = edit.shiftLabialMm + Math.tan((edit.tiltLabialDeg * Math.PI) / 180) * h;
    const offM = edit.shiftMesialMm + Math.tan((edit.tiltMesialDeg * Math.PI) / 180) * h;
    const lab = offL * c - offM * s;
    const mes = offL * s + offM * c;
    return view.anchor
      .clone()
      .addScaledVector(view.axes[0], lab)
      .addScaledVector(view.axes[1], mes)
      .addScaledVector(view.axes[2], edit.heightMm);
  }

  private cameraBasis() {
    const camera = this.bridge.getCamera();
    if (!camera) return false;
    camera.updateMatrixWorld();
    this.camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    this.camUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    this.camForward.setFromMatrixColumn(camera.matrixWorld, 2).negate().normalize();
    return true;
  }

  /** 화면 오른쪽, 위, 보는 방향. 검볼은 이 축으로 뷰에 수직이다. */
  private cameraAxis(axis: number, out: THREE.Vector3) {
    this.cameraBasis();
    if (axis === 0) return out.copy(this.camRight);
    if (axis === 1) return out.copy(this.camUp);
    return out.copy(this.camForward);
  }

  private viewQuaternion() {
    this.cameraBasis();
    this.basisM.makeBasis(this.camRight, this.camUp, this.camForward);
    return this.viewQuat.setFromRotationMatrix(this.basisM);
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
    const gain = clamp(factor, 0.5, 1.8) - 1;
    for (let i = 0; i < 3; i += 1) {
      let weight = 0;
      for (const axis of axes) weight += axis.dot(view.axes[i]!) ** 2;
      edit.scale[i] = start.scale[i]! * (1 + gain * Math.min(1, weight));
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
