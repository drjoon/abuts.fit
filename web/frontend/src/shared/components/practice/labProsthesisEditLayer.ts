// 기공소 AI 보철 — 수정값을 치아 위에 그리는 레이어.

import * as THREE from "three";

import {
  connectorIsWeak,
  connectorOutline,
  crownScale,
  holeIssue,
  localShellThicknessMm,
  marginPointAngle,
  thicknessAlertRgb,
  type ConnectorShape,
  type PonticBase,
  type ProsthesisDesignEdit,
  type ToothDesignEdit,
} from "@/shared/practice/labProsthesisModify";

export type EditHit =
  | { kind: "margin"; tooth: string; index: number }
  | { kind: "margin-line"; tooth: string }
  | { kind: "crown"; tooth: string }
  | { kind: "transform"; tooth: string }
  | { kind: "hook"; tooth: string }
  | { kind: "hole"; tooth: string }
  | { kind: "connector"; tooth: string }
  | { kind: "insertion"; key: string };

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
const HOOK = 0x64748b;
const CUTBACK = 0xd6a37a;

function basisQuaternion(normal: THREE.Vector3, rightHint: THREE.Vector3) {
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
      bump += stamp.amount * Math.exp(-(delta * delta) / 0.09);
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

function makeCrownGeometry(edit: ToothDesignEdit) {
  const theta = edit.pontic.on ? PONTIC_BASE_THETA[edit.pontic.base] : 0.58;
  const geometry = new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI * theta);
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

export function buildProsthesisEditLayer(args: {
  placements: Place[];
  frame: Frame | null;
  insertionByTooth: Map<string, THREE.Vector3>;
  unitToMm: number;
  spec: ProsthesisDesignEdit;
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

    if (args.spec.showMargin && !edit.margin.deleted && !edit.pontic.on) {
      const base = place.radius * 0.78;
      const extra = edit.margin.offsetMm / unit;
      const points: THREE.Vector3[] = [];
      edit.margin.radii.forEach((ratio, index) => {
        const angle = marginPointAngle(index, edit.margin.radii.length);
        const radial = base * ratio + extra;
        const axial = edit.margin.depths?.[index] ?? 0;
        const local = new THREE.Vector3(
          Math.cos(angle) * radial,
          axial,
          Math.sin(angle) * radial,
        )
          .applyQuaternion(quat)
          .add(place.center);
        points.push(local);
        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(Math.max(place.radius * 0.045, 0.15), 10, 8),
          new THREE.MeshBasicMaterial({
            color: active ? MARGIN : 0x94a3b8,
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

    if (!generated) continue;

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
    const crown = new THREE.Mesh(
      makeCrownGeometry(edit),
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
    crown.quaternion.copy(quat);
    crown.scale.set(width, height, depth);
    const lift =
      edit.pontic.on && edit.pontic.base === "sanitary" ? height * 0.4 : height * 0.12;
    crown.position.copy(place.center).addScaledVector(normal, lift);
    crown.renderOrder = 4;
    tag(crown, { kind: "crown", tooth });
    root.add(crown);

    if (edit.inner.applied && !edit.pontic.on) {
      const gap = (edit.inner.cementGapMm + edit.inner.spacerMm * 0.35) / unit;
      const inner = new THREE.Mesh(
        new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.42),
        new THREE.MeshStandardMaterial({
          color: 0xc9bfb2,
          roughness: 0.7,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      );
      inner.quaternion.copy(quat);
      inner.scale.set(
        Math.max(width - gap, width * 0.7),
        Math.max(height * 0.55 - edit.inner.marginTaperMm / unit, height * 0.28),
        Math.max(depth - gap, depth * 0.7),
      );
      inner.position.copy(place.center);
      inner.renderOrder = 3;
      root.add(inner);
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

    if (edit.hole.on) {
      const angle = (edit.hole.angle * Math.PI) / 180;
      const radiusMm = Math.max(edit.hole.radiusMm / unit, place.radius * 0.05);
      const hole = new THREE.Mesh(
        new THREE.CylinderGeometry(radiusMm, radiusMm, height * 1.35, 20),
        new THREE.MeshStandardMaterial({
          color: holeIssue(edit.hole) ? 0xb91c1c : 0x334155,
          roughness: 0.35,
          transparent: true,
          opacity: holeIssue(edit.hole) ? 0.45 : 0.88,
        }),
      );
      const tilt = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        (edit.hole.tiltDeg * Math.PI) / 180,
      );
      const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      hole.quaternion.copy(quat).multiply(spin).multiply(tilt);
      hole.position.copy(crown.position);
      tag(hole, { kind: "hole", tooth });
      root.add(hole);
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
