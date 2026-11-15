// 커스텀어벗 뷰어의 직접 편집. 번호 뱃지 자리에 라이노 검볼(이동·회전·축 스케일)을
// 어벗 중심축으로 두고, 부위 도구는 반경 안의 정점만 끌어 옮긴다.
// 검볼은 중심(바운딩 중심)을 지나는 삽입축·순측·근심으로 돈다.
// 조정값으로 형상을 다시 만들어도 같은 세션의 검볼·부위 변형은 새 메시에 다시 얹는다.
// 「다시 만들기」는 그 변형을 버린다.
// related files:
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx
// - web/frontend/src/shared/files/stlBinaryWrite.ts

import * as THREE from "three";

import { encodeBinaryStl } from "../../files/stlBinaryWrite";
import { withDoubleSidePick } from "../../three/backFaceShell";

const AXIS_COLOR = [0xef4444, 0x22c55e, 0x3b82f6] as const;
const MIN_SCALE = 0.4;
const MAX_SCALE = 2.2;
const MAX_TRANSLATE_MM = 30;
const STAMP_LIMIT = 32;

export type DirectEditFixture = {
  labialDir: readonly number[];
  mesialDir: readonly number[];
  fixturePose: {
    hexX: readonly number[];
    hexY: readonly number[];
    axis: readonly number[];
    origin: readonly number[];
  };
};

export type DirectEditDesign = {
  toothNumber: string;
  fixture: DirectEditFixture;
  localPositions: Float32Array;
  crownLocalPositions: Float32Array;
  marginLoopLocal: Float32Array;
  stlBlob: Blob;
};

type SculptStamp = {
  center: [number, number, number];
  delta: [number, number, number];
  radius: number;
};

type RigidEdit = {
  translate: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: [number, number, number];
};

type ToothEdit = {
  rigid: RigidEdit;
  stamps: SculptStamp[];
};

export type AbutmentFrame = {
  origin: THREE.Vector3;
  quat: THREE.Quaternion;
  axes: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
};

type MarginLine = THREE.Object3D & {
  geometry: { setPositions: (positions: Float32Array | number[]) => void };
  computeLineDistances: () => void;
};

type ToothView = {
  geometry: THREE.BufferGeometry;
  crownGeometry: THREE.BufferGeometry | null;
  base: Float32Array;
  crownBase: Float32Array | null;
  marginBase: Float32Array | null;
  baked: Float32Array;
  frame: AbutmentFrame;
  invFixture: THREE.Matrix4;
  gumball: THREE.Group;
};

type HandleHit = {
  tooth: string;
  op: "move" | "rot" | "scale" | "plane" | "center";
  axis: number;
  axis2: number;
};

type Drag =
  | {
      kind: "move";
      tooth: string;
      axis: number;
      startTranslate: THREE.Vector3;
      startAlong: number;
      pointerId: number;
    }
  | {
      kind: "rot";
      tooth: string;
      axis: number;
      startQuat: THREE.Quaternion;
      startVec: THREE.Vector3;
      worldAxis: THREE.Vector3;
      pointerId: number;
    }
  | {
      kind: "scale";
      tooth: string;
      axis: number;
      startScale: number;
      startDist: number;
      pointerId: number;
    }
  | {
      kind: "plane";
      tooth: string;
      startTranslate: THREE.Vector3;
      startHit: THREE.Vector3;
      normal: THREE.Vector3;
      pointerId: number;
    }
  | { kind: "center"; tooth: string; pointerId: number; x: number; y: number }
  | {
      kind: "sculpt";
      tooth: string;
      weights: Float32Array;
      hit: THREE.Vector3;
      normal: THREE.Vector3;
      radius: number;
      pointerId: number;
      x: number;
      y: number;
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
    paintOn: boolean;
    selected: string | null;
    visible: Record<string, boolean>;
  };
  onBadge: (tooth: string) => void;
  onCommit: () => void;
};

const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vC = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane();

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

function normalizeInto(out: THREE.Vector3, x: number, y: number, z: number) {
  const len = Math.hypot(x, y, z) || 1;
  return out.set(x / len, y / len, z / len);
}

function copyPositions(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null) {
  if (!attr || attr.count === 0) return new Float32Array(0);
  return new Float32Array((attr.array as Float32Array).slice(0));
}

export function frameFromPositions(positions: Float32Array, fixture: DirectEditFixture): AbutmentFrame {
  const origin = new THREE.Vector3();
  const n = Math.floor(positions.length / 3);
  if (n === 0) {
    const axis = normalizeInto(new THREE.Vector3(), fixture.fixturePose.axis[0] ?? 0, fixture.fixturePose.axis[1] ?? 0, fixture.fixturePose.axis[2] ?? 1);
    const labial = new THREE.Vector3(1, 0, 0);
    if (Math.abs(axis.dot(labial)) > 0.9) labial.set(0, 1, 0);
    labial.crossVectors(axis, labial).cross(axis).normalize();
    const mesial = new THREE.Vector3().crossVectors(axis, labial).normalize();
    return {
      origin,
      axes: [labial, mesial, axis],
      quat: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(labial, mesial, axis)),
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  const hint = normalizeInto(
    vA,
    fixture.fixturePose.axis[0] ?? 0,
    fixture.fixturePose.axis[1] ?? 0,
    fixture.fixturePose.axis[2] ?? 1,
  );
  let minP = Infinity;
  let maxP = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!;
    const y = positions[i + 1]!;
    const z = positions[i + 2]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
    const p = x * hint.x + y * hint.y + z * hint.z;
    if (p < minP) minP = p;
    if (p > maxP) maxP = p;
  }
  origin.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);

  const span = Math.max(maxP - minP, 1e-4);
  const hiCut = maxP - span * 0.15;
  const loCut = minP + span * 0.15;
  let hx = 0;
  let hy = 0;
  let hz = 0;
  let hn = 0;
  let lx = 0;
  let ly = 0;
  let lz = 0;
  let ln = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!;
    const y = positions[i + 1]!;
    const z = positions[i + 2]!;
    const p = x * hint.x + y * hint.y + z * hint.z;
    if (p >= hiCut) {
      hx += x;
      hy += y;
      hz += z;
      hn += 1;
    }
    if (p <= loCut) {
      lx += x;
      ly += y;
      lz += z;
      ln += 1;
    }
  }
  const axis = new THREE.Vector3();
  if (hn > 0 && ln > 0) {
    normalizeInto(axis, hx / hn - lx / ln, hy / hn - ly / ln, hz / hn - lz / ln);
  } else {
    axis.copy(hint);
  }
  if (axis.dot(hint) < 0) axis.negate();

  const labRaw = vB.set(fixture.labialDir[0] ?? 1, fixture.labialDir[1] ?? 0, fixture.labialDir[2] ?? 0);
  const labial = labRaw.clone().addScaledVector(axis, -labRaw.dot(axis));
  if (labial.lengthSq() < 1e-8) {
    labial.set(1, 0, 0).addScaledVector(axis, -axis.x);
    if (labial.lengthSq() < 1e-8) labial.set(0, 1, 0);
  }
  labial.normalize();
  const mesial = new THREE.Vector3().crossVectors(axis, labial).normalize();
  const mesRaw = vC.set(fixture.mesialDir[0] ?? 0, fixture.mesialDir[1] ?? 1, fixture.mesialDir[2] ?? 0);
  const score = labial.dot(labRaw) + mesial.dot(mesRaw);
  if (score < 0) {
    labial.negate();
    mesial.negate();
  }
  const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(labial, mesial, axis));
  return { origin, quat, axes: [labial, mesial, axis] };
}

export function rigidMatrix(
  frame: AbutmentFrame,
  rigid: { translate: THREE.Vector3; quat: THREE.Quaternion; scale: readonly [number, number, number] },
) {
  const r0Inv = new THREE.Matrix4().makeRotationFromQuaternion(frame.quat.clone().invert());
  const scale = new THREE.Matrix4().makeScale(rigid.scale[0], rigid.scale[1], rigid.scale[2]);
  const orient = frame.quat.clone().multiply(rigid.quat);
  const orientM = new THREE.Matrix4().makeRotationFromQuaternion(orient);
  const linear = new THREE.Matrix4().multiplyMatrices(orientM, scale).multiply(r0Inv);
  const shifted = frame.origin.clone().applyMatrix4(linear);
  const center = frame.origin.clone().add(rigid.translate);
  linear.setPosition(center.sub(shifted));
  return linear;
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

export function applyStamps(base: Float32Array, stamps: readonly SculptStamp[], out: Float32Array) {
  out.set(base);
  for (const stamp of stamps) {
    const [cx, cy, cz] = stamp.center;
    const [dx, dy, dz] = stamp.delta;
    for (let i = 0; i < base.length; i += 3) {
      const dist = Math.hypot(base[i]! - cx, base[i + 1]! - cy, base[i + 2]! - cz);
      const w = sculptFalloff(dist, stamp.radius);
      if (w === 0) continue;
      out[i]! += dx * w;
      out[i + 1]! += dy * w;
      out[i + 2]! += dz * w;
    }
  }
  return out;
}

function addWeighted(base: Float32Array, weights: Float32Array, delta: THREE.Vector3, out: Float32Array) {
  for (let i = 0, v = 0; i < base.length; i += 3, v += 1) {
    const w = weights[v] ?? 0;
    out[i] = base[i]! + delta.x * w;
    out[i + 1] = base[i + 1]! + delta.y * w;
    out[i + 2] = base[i + 2]! + delta.z * w;
  }
  return out;
}

function identityRigid(): RigidEdit {
  return {
    translate: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    scale: [1, 1, 1],
  };
}

function fixtureMatrix(pose: DirectEditFixture["fixturePose"]) {
  const [xx, xy, xz] = pose.hexX;
  const [yx, yy, yz] = pose.hexY;
  const [zx, zy, zz] = pose.axis;
  const [tx, ty, tz] = pose.origin;
  return new THREE.Matrix4().set(xx!, yx!, zx!, tx!, xy!, yy!, zy!, ty!, xz!, yz!, zz!, tz!, 0, 0, 0, 1);
}

function worldToLocal(world: Float32Array, inv: THREE.Matrix4, out: Float32Array) {
  const e = inv.elements;
  for (let i = 0; i < world.length; i += 3) {
    const x = world[i]!;
    const y = world[i + 1]!;
    const z = world[i + 2]!;
    out[i] = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
    out[i + 1] = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
    out[i + 2] = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
  }
  return out;
}

function orientQuat(frame: AbutmentFrame, rigid: RigidEdit) {
  return frame.quat.clone().multiply(rigid.quat);
}

function visualAxis(frame: AbutmentFrame, rigid: RigidEdit, axis: number, out: THREE.Vector3) {
  return out.set(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0).applyQuaternion(orientQuat(frame, rigid));
}

function setNdc(event: PointerEvent, dom: HTMLElement) {
  const rect = dom.getBoundingClientRect();
  ndc.set(
    ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
    -((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1,
  );
}

function rayOnPlane(event: PointerEvent, dom: HTMLElement, camera: THREE.Camera, target: THREE.Plane) {
  setNdc(event, dom);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.intersectPlane(target, vA) ? vA.clone() : null;
}

function axisPlane(axis: THREE.Vector3, origin: THREE.Vector3, viewDir: THREE.Vector3) {
  const side = vB.crossVectors(axis, viewDir);
  if (side.lengthSq() < 1e-8) {
    side.crossVectors(axis, Math.abs(axis.x) < 0.9 ? vC.set(1, 0, 0) : vC.set(0, 1, 0));
  }
  const normal = vC.crossVectors(axis, side).normalize();
  return plane.setFromNormalAndCoplanarPoint(normal, origin);
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
      new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.46, 10), mat),
      "move",
      axis,
      -1,
      mat,
    );
    alongAxis(shaft, axis, 0.58);
    const head = tagHandle(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 12), mat), "move", axis, -1, mat);
    alongAxis(head, axis, 0.9);
    const hit = tagHandle(
      new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.78, 8), basicMat(0xffffff, 0)),
      "move",
      axis,
      -1,
      mat,
    );
    alongAxis(hit, axis, 0.62);

    const scaleMat = basicMat(color);
    const box = tagHandle(
      new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.13), scaleMat),
      "scale",
      axis,
      -1,
      scaleMat,
    );
    box.position.set(axis === 0 ? 0.3 : 0, axis === 1 ? 0.3 : 0, axis === 2 ? 0.3 : 0);
    const scaleHit = tagHandle(
      new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), basicMat(0xffffff, 0)),
      "scale",
      axis,
      -1,
      scaleMat,
    );
    scaleHit.position.copy(box.position);

    const arcMat = basicMat(color);
    const arc = tagHandle(
      new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 8, 18, Math.PI * 0.72), arcMat),
      "rot",
      axis,
      -1,
      arcMat,
    );
    const arcHit = tagHandle(
      new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.11, 6, 14, Math.PI * 0.72), basicMat(0xffffff, 0)),
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
    const quad = tagHandle(new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), mat), "plane", a, b, mat);
    const hit = tagHandle(
      new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), basicMat(0xffffff, 0)),
      "plane",
      a,
      b,
      mat,
    );
    const pos = new THREE.Vector3();
    pos.setComponent(a, 0.3);
    pos.setComponent(b, 0.3);
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

  const centerMat = basicMat(0xf8fafc);
  const center = tagHandle(new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), centerMat), "center", 0, -1, centerMat);
  const centerHit = tagHandle(
    new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), basicMat(0xffffff, 0)),
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
  const base = mat.userData.baseColor as number | undefined;
  if (base == null) {
    mat.userData.baseColor = mat.color.getHex();
  }
  const hex = (mat.userData.baseColor as number) ?? mat.color.getHex();
  mat.color.setHex(hot ? 0xfff4c2 : hex);
}

export class AbutmentDirectEditSession {
  private readonly views = new Map<string, ToothView>();
  private readonly edits = new Map<string, ToothEdit>();
  private drag: Drag | null = null;
  private dom: HTMLElement | null = null;
  private hover: THREE.Object3D | null = null;
  private readonly brush: THREE.Mesh;
  private scratchBuf = new Float32Array(0);
  private outBuf = new Float32Array(0);

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
    const scene = this.bridge.getScene();
    if (scene && this.brush.parent !== scene) scene.add(this.brush);
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

  clear(teeth: readonly string[]) {
    for (const tooth of teeth) this.edits.delete(tooth);
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
      if (prev && prev.geometry === mesh.geometry) {
        if (prev.gumball.parent !== scene) scene.add(prev.gumball);
        continue;
      }
      if (prev) this.disposeGumball(prev.gumball);
      const base = copyPositions(mesh.geometry.getAttribute("position"));
      const crown = this.bridge.getCrown(design.toothNumber);
      const crownBase = crown ? copyPositions(crown.geometry.getAttribute("position")) : null;
      const margin = this.bridge.getMargin(design.toothNumber);
      const marginBase = worldMarginFromDesign(design);
      const frame = frameFromPositions(base, design.fixture);
      const edit = this.edits.get(design.toothNumber) ?? null;
      const baked = new Float32Array(base.length);
      if (edit && edit.stamps.length > 0) applyStamps(base, edit.stamps, baked);
      else baked.set(base);
      const view: ToothView = {
        geometry: mesh.geometry,
        crownGeometry: crown?.geometry ?? null,
        base,
        crownBase,
        marginBase,
        baked,
        frame,
        invFixture: fixtureMatrix(design.fixture.fixturePose).invert(),
        gumball: makeGumball(design.toothNumber),
      };
      this.views.set(design.toothNumber, view);
      scene.add(view.gumball);
      if (edit && editIsActive(edit)) {
        this.writeTooth(design, view, edit, true);
        this.bridge.onCommit();
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
    const show = this.bridge.ui.gumballOn && !this.bridge.ui.readOnly && !this.bridge.ui.paintOn;
    for (const [tooth, view] of this.views) {
      const mesh = this.bridge.getAbutment(tooth);
      const visible = !!mesh && mesh.visible && this.bridge.ui.visible[tooth] !== false;
      const edit = this.peek(tooth);
      const orient = orientQuat(view.frame, edit.rigid);
      const selected = this.bridge.ui.selected === tooth;
      view.gumball.visible = show && visible;
      view.gumball.quaternion.copy(orient);
      view.gumball.position.copy(view.frame.origin).add(edit.rigid.translate);
      view.gumball.scale.setScalar(worldPerPx * (selected ? 78 : 64));
      if (mesh) moveBadge(mesh, view.gumball.position, show && visible);
    }
  }

  private readonly onDown = (event: PointerEvent) => {
    if (event.button !== 0 || !this.dom) return;
    if (this.bridge.ui.readOnly || this.bridge.ui.paintOn) return;
    const camera = this.bridge.getCamera();
    if (!camera) return;
    setNdc(event, this.dom);
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
    if (drag.kind === "center") {
      if (Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y) < 5) {
        this.bridge.onBadge(drag.tooth);
      }
      return;
    }
    if (drag.kind === "sculpt") this.commitSculpt(drag, event);
    else this.commitRigid(drag.tooth);
    this.brush.visible = false;
  };

  private beginHandle(event: PointerEvent, handle: HandleHit) {
    const view = this.views.get(handle.tooth);
    const camera = this.bridge.getCamera();
    if (!view || !camera || !this.dom) return false;
    if (handle.op === "center") {
      this.drag = { kind: "center", tooth: handle.tooth, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      return true;
    }
    const edit = this.editOf(handle.tooth);
    const center = view.frame.origin.clone().add(edit.rigid.translate);
    camera.getWorldDirection(vB);
    if (handle.op === "move" || handle.op === "scale") {
      const axis = visualAxis(view.frame, edit.rigid, handle.axis, vC).clone();
      axisPlane(axis, center, vB);
      const hit = rayOnPlane(event, this.dom, camera, plane);
      if (!hit) return false;
      const along = hit.sub(center).dot(axis);
      if (handle.op === "move") {
        this.drag = {
          kind: "move",
          tooth: handle.tooth,
          axis: handle.axis,
          startTranslate: edit.rigid.translate.clone(),
          startAlong: along,
          pointerId: event.pointerId,
        };
      } else {
        if (Math.abs(along) < 0.15) return false;
        this.drag = {
          kind: "scale",
          tooth: handle.tooth,
          axis: handle.axis,
          startScale: edit.rigid.scale[handle.axis]!,
          startDist: along,
          pointerId: event.pointerId,
        };
      }
      return true;
    }
    if (handle.op === "rot") {
      const axis = visualAxis(view.frame, edit.rigid, handle.axis, vC).clone();
      plane.setFromNormalAndCoplanarPoint(axis, center);
      const hit = rayOnPlane(event, this.dom, camera, plane);
      if (!hit) return false;
      this.drag = {
        kind: "rot",
        tooth: handle.tooth,
        axis: handle.axis,
        startQuat: edit.rigid.quat.clone(),
        startVec: hit.sub(center),
        worldAxis: axis,
        pointerId: event.pointerId,
      };
      return true;
    }
    const a = visualAxis(view.frame, edit.rigid, handle.axis, vC).clone();
    const b = visualAxis(view.frame, edit.rigid, handle.axis2, vA).clone();
    const normal = new THREE.Vector3().crossVectors(a, b).normalize();
    plane.setFromNormalAndCoplanarPoint(normal, center);
    const hit = rayOnPlane(event, this.dom, camera, plane);
    if (!hit) return false;
    this.drag = {
      kind: "plane",
      tooth: handle.tooth,
      startTranslate: edit.rigid.translate.clone(),
      startHit: hit,
      normal,
      pointerId: event.pointerId,
    };
    return true;
  }

  private beginSculpt(event: PointerEvent, tooth: string, hit: THREE.Intersection) {
    const view = this.views.get(tooth);
    const mesh = this.bridge.getAbutment(tooth);
    const displayed = mesh?.geometry.getAttribute("position")?.array as Float32Array | undefined;
    if (!tooth || !view || !displayed) return false;
    const weights = new Float32Array(displayed.length / 3);
    const radius = clamp(this.bridge.ui.radiusMm, 0.4, 8);
    const p = hit.point;
    for (let i = 0, v = 0; i < displayed.length; i += 3, v += 1) {
      weights[v] = sculptFalloff(
        Math.hypot(displayed[i]! - p.x, displayed[i + 1]! - p.y, displayed[i + 2]! - p.z),
        radius,
      );
    }
    this.drag = {
      kind: "sculpt",
      tooth,
      weights,
      hit: p.clone(),
      normal: hit.face?.normal.clone().transformDirection(hit.object.matrixWorld).normalize() ?? new THREE.Vector3(0, 0, 1),
      radius,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    this.brush.visible = true;
    this.brush.position.copy(p);
    this.brush.scale.setScalar(radius);
    return true;
  }

  private dragMove(event: PointerEvent) {
    const drag = this.drag;
    const camera = this.bridge.getCamera();
    if (!drag || !camera || !this.dom) return;
    if (drag.kind === "center") return;
    const view = this.views.get(drag.tooth);
    const design = this.bridge.getDesigns().find((row) => row.toothNumber === drag.tooth);
    if (!view || !design) return;
    const edit = this.editOf(drag.tooth);
    camera.getWorldDirection(vB);

    if (drag.kind === "move" || drag.kind === "scale") {
      const axis = visualAxis(view.frame, edit.rigid, drag.axis, vC).clone();
      const center = view.frame.origin.clone().add(drag.kind === "move" ? drag.startTranslate : edit.rigid.translate);
      camera.getWorldDirection(vB);
      axisPlane(axis, center, vB);
      const hit = rayOnPlane(event, this.dom, camera, plane);
      if (!hit) return;
      const along = hit.sub(center).dot(axis);
      if (drag.kind === "move") {
        const delta = along - drag.startAlong;
        edit.rigid.translate.copy(drag.startTranslate).addScaledVector(axis, delta);
        clampTranslate(edit.rigid.translate);
      } else {
        edit.rigid.scale[drag.axis] = clamp(drag.startScale * (along / drag.startDist), MIN_SCALE, MAX_SCALE);
      }
      this.writeTooth(design, view, edit, false);
      return;
    }

    if (drag.kind === "rot") {
      const center = view.frame.origin.clone().add(edit.rigid.translate);
      plane.setFromNormalAndCoplanarPoint(drag.worldAxis, center);
      const hit = rayOnPlane(event, this.dom, camera, plane);
      if (!hit) return;
      const cur = hit.sub(center);
      const angle = Math.atan2(vA.crossVectors(drag.startVec, cur).dot(drag.worldAxis), drag.startVec.dot(cur));
      const axisInFrame = new THREE.Vector3(drag.axis === 0 ? 1 : 0, drag.axis === 1 ? 1 : 0, drag.axis === 2 ? 1 : 0)
        .applyQuaternion(drag.startQuat);
      edit.rigid.quat.copy(new THREE.Quaternion().setFromAxisAngle(axisInFrame, angle)).multiply(drag.startQuat);
      this.writeTooth(design, view, edit, false);
      return;
    }

    if (drag.kind === "plane") {
      const center = view.frame.origin.clone().add(drag.startTranslate);
      plane.setFromNormalAndCoplanarPoint(drag.normal, center);
      const hit = rayOnPlane(event, this.dom, camera, plane);
      if (!hit) return;
      edit.rigid.translate.copy(drag.startTranslate).add(hit.sub(drag.startHit));
      clampTranslate(edit.rigid.translate);
      this.writeTooth(design, view, edit, false);
      return;
    }

    this.previewSculpt(drag, event, view, design);
  }

  private previewSculpt(drag: Extract<Drag, { kind: "sculpt" }>, event: PointerEvent, view: ToothView, design: DirectEditDesign) {
    const delta = this.sculptDelta(drag, event, view);
    if (!delta) return;
    const param = this.ensureScratch(view.baked.length);
    addWeighted(view.baked, drag.weights, delta, param);
    const edit = this.editOf(drag.tooth);
    const matrix = rigidMatrix(view.frame, edit.rigid);
    const mesh = this.bridge.getAbutment(drag.tooth);
    if (mesh) writeAttribute(mesh.geometry, applyMatrixToPositions(param, matrix, this.ensureOut(param.length)));
    this.brush.position.copy(drag.hit);
    this.brush.scale.setScalar(drag.radius);
    this.brush.visible = true;
    void design;
  }

  private sculptDelta(drag: Extract<Drag, { kind: "sculpt" }>, event: PointerEvent, view: ToothView) {
    const camera = this.bridge.getCamera();
    const host = this.bridge.getHost();
    if (!camera || !this.dom || !host) return null;
    const edit = this.editOf(drag.tooth);
    const matrix = rigidMatrix(view.frame, edit.rigid);
    const invLinear = linearOf(matrix.clone().invert());
    const world = new THREE.Vector3();
    if (event.shiftKey) {
      const viewH = (camera.top - camera.bottom) / Math.max(camera.zoom, 1e-4);
      const mm = (drag.y - event.clientY) * (viewH / Math.max(host.clientHeight, 1));
      world.copy(drag.normal).multiplyScalar(mm);
    } else {
      camera.getWorldDirection(vB);
      plane.setFromNormalAndCoplanarPoint(vB, drag.hit);
      const hit = rayOnPlane(event, this.dom, camera, plane);
      if (!hit) return null;
      world.copy(hit).sub(drag.hit);
    }
    return world.applyMatrix4(invLinear);
  }

  private commitSculpt(drag: Extract<Drag, { kind: "sculpt" }>, event: PointerEvent) {
    const view = this.views.get(drag.tooth);
    const design = this.bridge.getDesigns().find((row) => row.toothNumber === drag.tooth);
    if (!view || !design) return;
    const delta = this.sculptDelta(drag, event, view);
    if (!delta || delta.lengthSq() < 1e-8) {
      this.writeTooth(design, view, this.editOf(drag.tooth));
      return;
    }
    addWeighted(view.baked, drag.weights, delta, view.baked);
    const edit = this.editOf(drag.tooth);
    const center = drag.hit.clone().applyMatrix4(rigidMatrix(view.frame, edit.rigid).invert());
    edit.stamps.push({
      center: [center.x, center.y, center.z],
      delta: [delta.x, delta.y, delta.z],
      radius: drag.radius,
    });
    if (edit.stamps.length > STAMP_LIMIT) edit.stamps.splice(0, edit.stamps.length - STAMP_LIMIT);
    this.edits.set(drag.tooth, edit);
    this.writeTooth(design, view, edit);
    this.bridge.onCommit();
  }

  private commitRigid(tooth: string) {
    const view = this.views.get(tooth);
    const design = this.bridge.getDesigns().find((row) => row.toothNumber === tooth);
    if (!view || !design) return;
    const edit = this.editOf(tooth);
    if (editIsActive(edit)) this.edits.set(tooth, edit);
    this.writeTooth(design, view, edit);
    this.bridge.onCommit();
  }

  private hoverMove(event: PointerEvent) {
    const camera = this.bridge.getCamera();
    if (!camera || !this.dom || this.bridge.ui.readOnly || this.bridge.ui.paintOn) {
      this.brush.visible = false;
      return;
    }
    setNdc(event, this.dom);
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
      if (picked) {
        this.brush.visible = true;
        this.brush.position.copy(picked.hit.point);
        this.brush.scale.setScalar(clamp(this.bridge.ui.radiusMm, 0.4, 8));
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

  private peek(tooth: string) {
    return this.edits.get(tooth) ?? EMPTY_EDIT;
  }

  private editOf(tooth: string) {
    let edit = this.edits.get(tooth);
    if (!edit) {
      edit = identityRigidEdit();
      this.edits.set(tooth, edit);
    }
    return edit;
  }

  private writeTooth(design: DirectEditDesign, view: ToothView, edit: ToothEdit, bakeFiles = true) {
    const matrix = rigidMatrix(view.frame, edit.rigid);
    const mesh = this.bridge.getAbutment(design.toothNumber);
    const world = applyMatrixToPositions(view.baked, matrix, this.ensureOut(view.baked.length));
    if (mesh) writeAttribute(mesh.geometry, world);
    const crown = this.bridge.getCrown(design.toothNumber);
    if (crown && view.crownBase) {
      const crownWorld = applyMatrixToPositions(view.crownBase, matrix, new Float32Array(view.crownBase.length));
      writeAttribute(crown.geometry, crownWorld);
      if (bakeFiles) {
        design.crownLocalPositions = worldToLocal(crownWorld, view.invFixture, new Float32Array(crownWorld.length));
      }
    }
    if (view.marginBase) {
      const stamped = new Float32Array(view.marginBase.length);
      applyStamps(view.marginBase, edit.stamps, stamped);
      const marginWorld = applyMatrixToPositions(stamped, matrix, new Float32Array(stamped.length));
      const margin = this.bridge.getMargin(design.toothNumber);
      if (margin) {
        const closed = new Float32Array(marginWorld.length + 3);
        closed.set(marginWorld);
        closed[marginWorld.length] = marginWorld[0]!;
        closed[marginWorld.length + 1] = marginWorld[1]!;
        closed[marginWorld.length + 2] = marginWorld[2]!;
        margin.geometry.setPositions(closed);
        margin.computeLineDistances();
      }
      if (bakeFiles) {
        design.marginLoopLocal = worldToLocal(marginWorld, view.invFixture, new Float32Array(marginWorld.length));
      }
    }
    if (bakeFiles) {
      const local = worldToLocal(world, view.invFixture, new Float32Array(world.length));
      design.localPositions = local;
      design.stlBlob = encodeBinaryStl(local, `abuts.fit custom abutment #${design.toothNumber}`);
    }
    if (mesh) moveBadge(mesh, view.frame.origin.clone().add(edit.rigid.translate), view.gumball.visible);
  }

  private ensureScratch(length: number) {
    if (this.scratchBuf.length < length) this.scratchBuf = new Float32Array(length);
    return this.scratchBuf.subarray(0, length);
  }

  private ensureOut(length: number) {
    if (this.outBuf.length < length) this.outBuf = new Float32Array(length);
    return this.outBuf.subarray(0, length);
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

function identityRigidEdit(): ToothEdit {
  return { rigid: identityRigid(), stamps: [] };
}

const EMPTY_EDIT: ToothEdit = identityRigidEdit();

function editIsActive(edit: ToothEdit) {
  if (edit.stamps.length > 0) return true;
  if (edit.rigid.translate.lengthSq() > 1e-6) return true;
  if (Math.abs(edit.rigid.scale[0] - 1) > 1e-4) return true;
  if (Math.abs(edit.rigid.scale[1] - 1) > 1e-4) return true;
  if (Math.abs(edit.rigid.scale[2] - 1) > 1e-4) return true;
  return Math.abs(edit.rigid.quat.w) < 0.999999;
}

function clampTranslate(v: THREE.Vector3) {
  if (v.length() > MAX_TRANSLATE_MM) v.setLength(MAX_TRANSLATE_MM);
}

function linearOf(matrix: THREE.Matrix4) {
  const next = matrix.clone();
  next.setPosition(0, 0, 0);
  return next;
}

function writeAttribute(geometry: THREE.BufferGeometry, positions: Float32Array) {
  const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
  (attr.array as Float32Array).set(positions);
  attr.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

function moveBadge(mesh: THREE.Mesh, center: THREE.Vector3, gumballOn: boolean) {
  for (const child of mesh.children) {
    const el = (child as { element?: HTMLElement }).element;
    if (!el) continue;
    child.position.copy(center);
    el.style.pointerEvents = gumballOn ? "none" : "auto";
  }
}

function worldMarginFromDesign(design: DirectEditDesign): Float32Array | null {
  const local = design.marginLoopLocal;
  if (!local || local.length < 9) return null;
  const out = new Float32Array(local.length);
  applyMatrixToPositions(local, fixtureMatrix(design.fixture.fixturePose), out);
  return out;
}
