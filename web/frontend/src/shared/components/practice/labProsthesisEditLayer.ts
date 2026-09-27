// 기공소 AI 보철 — 수정값을 치아 위에 그리는 레이어.

import * as THREE from "three";

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
import { makeCavityRestorationGeometry } from "@/shared/components/practice/labInlayGeometry";

export type EditHit =
  | { kind: "margin"; tooth: string; index: number }
  | { kind: "margin-line"; tooth: string }
  | { kind: "crown"; tooth: string }
  | { kind: "transform"; tooth: string }
  | { kind: "hook"; tooth: string }
  | { kind: "hole"; tooth: string }
  | { kind: "hole-tip"; tooth: string; end: "top" | "bottom" }
  | { kind: "connector"; tooth: string }
  | { kind: "scanbody"; tooth: string }
  | { kind: "insertion"; key: string };

/** 점마다 가장 가까운 스캔 면까지의 부호 거리(mm). 바깥이 +. 스캔이 멀면 null. */
export type ScanDistanceProbe = (
  tooth: string,
  points: readonly THREE.Vector3[],
  normals: readonly THREE.Vector3[],
) => Array<number | null>;

/** -0.1 빨강 → 0 초록 → +0.1 파랑. Dentbird 색 막대와 같은 순서. */
export function fitDistanceRgb(mm: number | null): [number, number, number] {
  if (mm == null) return [0.78, 0.8, 0.83];
  const t = Math.min(1, Math.max(0, (mm + 0.1) / 0.2));
  const stops: Array<[number, [number, number, number]]> = [
    [0, [0.86, 0.15, 0.15]],
    [0.25, [0.96, 0.78, 0.18]],
    [0.5, [0.2, 0.78, 0.35]],
    [0.75, [0.16, 0.74, 0.86]],
    [1, [0.15, 0.3, 0.86]],
  ];
  for (let index = 1; index < stops.length; index += 1) {
    const [t1, c1] = stops[index]!;
    const [t0, c0] = stops[index - 1]!;
    if (t <= t1) {
      const u = (t - t0) / Math.max(t1 - t0, 1e-6);
      return [c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u, c0[2] + (c1[2] - c0[2]) * u];
    }
  }
  return stops[stops.length - 1]![1];
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
const HOOK = 0x64748b;
const CUTBACK = 0xd6a37a;
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
  return args.margin.radii.map((ratio, index) => {
    const angle = marginPointAngle(index, args.margin.radii.length);
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
    let shrink = 0;
    if (edit.cutback.on) {
      const top = edit.cutback.region === "partial" ? y > 0.15 : true;
      const excluded = edit.cutback.excluded.some((slot) => {
        let delta = angle - slot;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        return Math.abs(delta) < 0.42;
      });
      if (top && !excluded) shrink = Math.min(0.28, edit.cutback.thicknessMm * 0.16);
    }
    const pull = bump * 0.28 - shrink;
    pos.setXYZ(i, x + (x / radial) * pull, y, z + (z / radial) * pull);
  }
  geometry.computeVertexNormals();
}

function paintThicknessColors(geometry: THREE.BufferGeometry, edit: ToothDesignEdit) {
  const pos = geometry.getAttribute("position");
  if (!pos) return;
  const colors = new Float32Array(pos.count * 3);
  const yMin = -0.19;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const angle = Math.atan2(z, x);
    const occlusal01 = Math.min(1, Math.max(0, (y - yMin) / (1 - yMin)));
    const thickness = localShellThicknessMm(edit, angle, occlusal01);
    const alert = thicknessAlertRgb(edit, thickness);
    const rgb = alert ?? CROWN_RGB;
    colors[i * 3] = rgb[0];
    colors[i * 3 + 1] = rgb[1];
    colors[i * 3 + 2] = rgb[2];
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
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

/** 홀을 뚫는 크라운은 테두리가 매끈하도록 잘게 나눈다. */
function makeCrownGeometry(edit: ToothDesignEdit, fine = false) {
  const theta = crownTheta(edit);
  const geometry = new THREE.SphereGeometry(
    1,
    fine ? 96 : 28,
    fine ? 56 : 16,
    0,
    Math.PI * 2,
    0,
    Math.PI * theta,
  );
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
  paintSculpt(geometry, edit);
  paintThicknessColors(geometry, edit);
  return geometry;
}

export type CrownPose = {
  quat: THREE.Quaternion;
  position: THREE.Vector3;
  radius: number;
  width: number;
  height: number;
  depth: number;
  /** 크라운 구의 극각 비율. 아래 열린 테두리 높이. */
  theta: number;
};

/** 생성 크라운 자리. 레이어와 홀 검사가 같이 쓴다. */
export function crownPose(
  place: { center: THREE.Vector3; radius: number },
  normal: THREE.Vector3,
  right: THREE.Vector3,
  edit: ToothDesignEdit,
): CrownPose {
  const quat = basisQuaternion(normal, right);
  const scale = crownScale(edit);
  const radius = place.radius * 0.86 * scale;
  const height =
    place.radius *
    0.62 *
    scale *
    (1 + edit.refine.cusp * 0.14) *
    (edit.refine.occlusalTrim ? Math.max(0.72, 1 - edit.refine.occlusalClearanceMm * 0.35) : 1);
  const width =
    radius *
    (edit.refine.proximalTrim
      ? Math.max(0.78, 1 - edit.refine.proximalClearanceMm * 0.55)
      : 1);
  const depth = radius * (1 + edit.refine.ridge * 0.12);
  const lift =
    edit.pontic.on && edit.pontic.base === "sanitary" ? height * 0.4 : height * 0.12;
  const position = place.center.clone().addScaledVector(normal.clone().normalize(), lift);
  return { quat, position, radius, width, height, depth, theta: crownTheta(edit) };
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
  const pose = crownPose(args.place, args.normal, args.right, args.edit);
  const origin = args.axis
    ? args.axis.origin.clone()
    : new THREE.Vector3(...args.edit.hole.point)
        .multiplyScalar(1 / unit)
        .applyQuaternion(pose.quat)
        .add(args.place.center);
  const dir = (
    args.axis
      ? args.axis.dir.clone()
      : new THREE.Vector3(...args.edit.hole.dir).applyQuaternion(pose.quat)
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
}) {
  const root = new THREE.Group();
  root.name = "prosthesis-edit";
  const unit = args.unitToMm > 0 ? args.unitToMm : 1;
  const up = args.frame?.up ?? new THREE.Vector3(0, 0, 1);
  const right = args.frame?.right ?? new THREE.Vector3(1, 0, 0);
  const byTooth = new Map(args.placements.map((row) => [row.toothNumber, row]));

  for (const [tooth, edit] of Object.entries(args.spec.edits)) {
    const place = byTooth.get(tooth);
    if (!place) continue;
    const normal = args.insertionByTooth.get(tooth)?.clone() ?? up.clone();
    if (normal.lengthSq() < 1e-8) normal.copy(up);
    normal.normalize();
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
          new THREE.SphereGeometry(Math.max(place.radius * 0.045, 0.15), 10, 8),
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
        const line = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({
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

    const crownAt = crownPose(place, normal, right, edit);
    const { width, height, depth } = crownAt;
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
    const crown = new THREE.Mesh(
      cutHole
        ? cutScrewHole(makeCrownGeometry(edit, true), crownMatrix, cutHole)
        : makeCrownGeometry(edit),
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
      }),
    );
    crown.quaternion.copy(crownAt.quat);
    crown.scale.set(width, height, depth);
    crown.position.copy(crownAt.position);
    crown.renderOrder = 4;
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

    if (edit.cutback.on) {
      const shell = new THREE.Mesh(
        makeCrownGeometry(edit),
        new THREE.MeshStandardMaterial({
          color: CUTBACK,
          roughness: 0.55,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
        }),
      );
      const pull = Math.min(0.22, edit.cutback.thicknessMm * 0.12);
      shell.quaternion.copy(quat);
      shell.scale.set(width * (1 - pull), height * (edit.cutback.region === "full" ? 1 - pull : 0.62), depth * (1 - pull));
      shell.position.copy(crown.position).addScaledVector(normal, height * 0.08);
      shell.renderOrder = 5;
      root.add(shell);
    }

    if (args.spec.tool === "refine" && active) {
      for (const corner of [-1, 1]) {
        for (const side of [-1, 1]) {
          const handle = new THREE.Mesh(
            new THREE.BoxGeometry(place.radius * 0.09, place.radius * 0.09, place.radius * 0.09),
            new THREE.MeshBasicMaterial({ color: 0x0f766e, depthTest: false }),
          );
          handle.position
            .copy(crown.position)
            .addScaledVector(right.clone().addScaledVector(normal, -right.dot(normal)).normalize(), width * corner * 0.95);
          const anterior = args.frame?.anterior ?? new THREE.Vector3(0, 1, 0);
          handle.position.addScaledVector(
            anterior.clone().addScaledVector(normal, -anterior.dot(normal)).normalize(),
            depth * side * 0.85,
          );
          handle.renderOrder = 14;
          tag(handle, { kind: "transform", tooth });
          root.add(handle);
        }
      }
    }

    if (edit.hook.on) {
      const angle = (edit.hook.angle * Math.PI) / 180;
      const outward = new THREE.Vector3(Math.cos(angle), 0.15, Math.sin(angle))
        .normalize()
        .applyQuaternion(quat);
      const length = Math.max(edit.hook.lengthMm / unit, place.radius * 0.25);
      const hookRadius = Math.max(edit.hook.radiusMm / unit, place.radius * 0.04);
      const base = crown.position.clone().addScaledVector(outward, width * 0.72);
      const tip = base.clone().addScaledVector(outward, length);
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(hookRadius, hookRadius, length, 12),
        new THREE.MeshStandardMaterial({ color: HOOK, roughness: 0.4 }),
      );
      shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);
      shaft.position.copy(base).addScaledVector(outward, length / 2);
      tag(shaft, { kind: "hook", tooth });
      const knob = new THREE.Mesh(
        new THREE.SphereGeometry(hookRadius * 1.35, 12, 10),
        new THREE.MeshStandardMaterial({ color: HOOK, roughness: 0.35 }),
      );
      knob.position.copy(tip);
      tag(knob, { kind: "hook", tooth });
      root.add(shaft, knob);
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
