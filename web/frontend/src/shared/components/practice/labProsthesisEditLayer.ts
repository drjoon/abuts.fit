// 기공소 AI 보철 — 수정값을 치아 위에 그리는 레이어.

import * as THREE from "three";

import {
  crownScale,
  holeIssue,
  marginPointAngle,
  shellIsThin,
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

const CROWN = 0xf3efe8;
const THIN = 0xe7a090;
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

function makeCrownGeometry(edit: ToothDesignEdit) {
  const geometry = new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.58);
  paintSculpt(geometry, edit);
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

    if (!edit.margin.deleted) {
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
        color: shellIsThin(edit) && !edit.refine.compensate ? THIN : CROWN,
        roughness: 0.45,
        metalness: 0.04,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    crown.quaternion.copy(quat);
    crown.scale.set(width, height, depth);
    crown.position.copy(place.center).addScaledVector(normal, height * 0.12);
    crown.renderOrder = 4;
    tag(crown, { kind: "crown", tooth });
    root.add(crown);

    if (edit.inner.applied) {
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
    const from = byTooth.get(link.from);
    const to = byTooth.get(link.to);
    const edit = args.spec.edits[link.from];
    if (!from || !to || !edit) continue;
    if (args.spec.generated[link.from] !== true || args.spec.generated[link.to] !== true) {
      continue;
    }
    const axis = to.center.clone().sub(from.center);
    const span = axis.length();
    if (span < 1e-4) continue;
    axis.multiplyScalar(1 / span);
    const along = edit.connector.along;
    const mid = from.center.clone().lerp(to.center, along);
    const reach = edit.connector.assembled ? span * 0.78 : span * 0.28;
    const transverse = Math.max(edit.connector.transverseMm / unit, from.radius * 0.12);
    const vertical = Math.max(edit.connector.verticalMm / unit, from.radius * 0.1);
    const shape = edit.connector.shape;
    const geometry =
      shape === "triangle" || shape === "inverted"
        ? new THREE.ConeGeometry(transverse * 0.55, reach, 3)
        : new THREE.CylinderGeometry(transverse * 0.42, transverse * 0.42, reach, 18);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: edit.connector.assembled ? 0xf8f4ee : 0xe7c9a4,
        roughness: 0.42,
      }),
    );
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    if (shape === "inverted") mesh.rotateX(Math.PI);
    mesh.scale.set(1, 1, vertical / Math.max(transverse, 1e-4));
    mesh.position.copy(mid);
    tag(mesh, { kind: "connector", tooth: link.from });
    root.add(mesh);
  }

  return root;
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
