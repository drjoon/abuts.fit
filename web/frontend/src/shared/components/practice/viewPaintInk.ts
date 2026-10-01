// 페인트 표시를 모델 좌표의 3D 객체로 만든다. 카메라가 돌면 같이 돈다.
// related files: viewPaintGeom.ts, viewPaintSpace.ts, ViewPaintSurface.tsx
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

import {
  TEXT_FONT,
  add,
  cross,
  dotRadius,
  mul,
  norm,
  posePoint,
  sub,
  textSize,
  vlen,
  type PaintShape,
  type Vec3,
} from "@/shared/components/practice/viewPaintGeom";

export function createPaintInkGroup() {
  const group = new THREE.Group();
  group.name = "view-paint";
  group.userData.viewPaint = true;
  return group;
}

export function disposePaintObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    const list = Array.isArray(material) ? material : material ? [material] : [];
    for (const entry of list) {
      const textured = entry as THREE.MeshBasicMaterial;
      textured.map?.dispose();
      entry.dispose();
    }
  });
}

function lineOf(points: Vec3[], color: string, widthPx: number, size: { width: number; height: number }) {
  const flat: number[] = [];
  for (const point of points) flat.push(point.x, point.y, point.z);
  if (points.length === 1) {
    const point = points[0];
    flat.push(point.x + 1e-4, point.y, point.z);
  }
  const geometry = new LineGeometry();
  geometry.setPositions(flat);
  const material = new LineMaterial({
    color: new THREE.Color(color).getHex(),
    linewidth: Math.max(widthPx, 1),
    depthTest: true,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
  });
  material.resolution.set(size.width, size.height);
  const line = new Line2(geometry, material);
  line.userData.viewPaint = true;
  line.computeLineDistances();
  line.renderOrder = 8;
  return line;
}

function lifted(
  shape: Extract<PaintShape, { pose?: unknown }>,
  u: number,
  v: number,
  extra = 0,
): Vec3 {
  const pose = shape.pose;
  if (!pose) return { x: 0, y: 0, z: 0 };
  return posePoint(pose, u, v, extra + (shape.ink?.lift ?? 0));
}

function basic(color: string) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}

export function buildPaintObject(
  shape: PaintShape,
  size: { width: number; height: number },
): THREE.Object3D | null {
  if (!shape.pose || !shape.ink) return null;
  if (shape.kind === "pen") {
    const samples = shape.samples ?? [];
    if (samples.length === 0) return null;
    return lineOf(
      samples.map((sample) => lifted(shape, sample.u, sample.v, sample.lift)),
      shape.color,
      shape.width,
      size,
    );
  }
  if (shape.kind === "rect" || shape.kind === "ellipse" || shape.kind === "arrow") {
    const u0 = shape.au ?? 0;
    const v0 = shape.av ?? 0;
    const u1 = shape.bu ?? 0;
    const v1 = shape.bv ?? 0;
    if (shape.kind === "rect") {
      return lineOf(
        [
          lifted(shape, u0, v0),
          lifted(shape, u1, v0),
          lifted(shape, u1, v1),
          lifted(shape, u0, v1),
          lifted(shape, u0, v0),
        ],
        shape.color,
        shape.width,
        size,
      );
    }
    if (shape.kind === "ellipse") {
      const cx = (u0 + u1) / 2;
      const cy = (v0 + v1) / 2;
      const rx = Math.abs(u1 - u0) / 2;
      const ry = Math.abs(v1 - v0) / 2;
      const points: Vec3[] = [];
      const steps = 48;
      for (let i = 0; i <= steps; i += 1) {
        const angle = (i / steps) * Math.PI * 2;
        points.push(lifted(shape, cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry));
      }
      return lineOf(points, shape.color, shape.width, size);
    }
    const from = lifted(shape, u0, v0);
    const to = lifted(shape, u1, v1);
    const group = new THREE.Group();
    group.userData.viewPaint = true;
    const delta = sub(to, from);
    if (vlen(delta) < 1e-6) return lineOf([from, to], shape.color, shape.width, size);
    const dir = norm(delta);
    const head = Math.max(10, shape.width * 3.5) * shape.ink.px;
    const side = norm(cross(shape.pose.normal, dir));
    const spread = Math.sin(Math.PI / 7) * head;
    const back = mul(dir, Math.cos(Math.PI / 7) * head);
    const neck = sub(to, mul(dir, head * 0.8));
    group.add(lineOf([from, neck], shape.color, shape.width, size));
    const left = add(sub(to, back), mul(side, spread));
    const right = sub(sub(to, back), mul(side, spread));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([to.x, to.y, to.z, left.x, left.y, left.z, right.x, right.y, right.z], 3),
    );
    const headMesh = new THREE.Mesh(geometry, basic(shape.color));
    headMesh.userData.viewPaint = true;
    headMesh.renderOrder = 8;
    group.add(headMesh);
    return group;
  }
  if (shape.kind === "dot") {
    const radius = Math.max(shape.radius ?? dotRadius(shape.width) * shape.ink.px, shape.ink.px);
    const at = lifted(shape, shape.au ?? 0, shape.av ?? 0);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 18, 14), basic(shape.color));
    mesh.position.set(at.x, at.y, at.z);
    mesh.userData.viewPaint = true;
    mesh.renderOrder = 8;
    return mesh;
  }
  if (shape.kind !== "text") return null;
  return textPlane(shape, size);
}

function textPlane(shape: Extract<PaintShape, { kind: "text" }>, _size: { width: number; height: number }) {
  if (!shape.pose || !shape.ink) return null;
  const fontPx = 64;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.font = TEXT_FONT.replace("{size}", String(fontPx));
  const measured = ctx.measureText(shape.text || " ");
  const pad = 12;
  canvas.width = Math.max(8, Math.ceil(measured.width + pad * 2));
  canvas.height = fontPx + pad * 2;
  ctx.font = TEXT_FONT.replace("{size}", String(fontPx));
  ctx.textBaseline = "middle";
  ctx.lineWidth = 10;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.strokeText(shape.text, pad, canvas.height / 2);
  ctx.fillStyle = shape.color;
  ctx.fillText(shape.text, pad, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = basic(shape.color);
  material.map = texture;
  material.transparent = true;
  material.color.set("#ffffff");
  const worldH = textSize(shape.width) * (shape.scale ?? 1) * shape.ink.px * (canvas.height / fontPx);
  const worldW = worldH * (canvas.width / canvas.height);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldH), material);
  const basis = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(shape.pose.axisU.x, shape.pose.axisU.y, shape.pose.axisU.z),
    new THREE.Vector3(shape.pose.axisV.x, shape.pose.axisV.y, shape.pose.axisV.z),
    new THREE.Vector3(shape.pose.normal.x, shape.pose.normal.y, shape.pose.normal.z),
  );
  mesh.quaternion.setFromRotationMatrix(basis);
  const at = lifted(shape, shape.au ?? 0, shape.av ?? 0);
  // 2D 글자는 클릭점의 왼쪽 위에서 시작한다. 평면 중심을 그 자리로 민다.
  const center = add(add(at, mul(shape.pose.axisU, worldW / 2)), mul(shape.pose.axisV, -worldH / 2));
  mesh.position.set(center.x, center.y, center.z);
  mesh.userData.viewPaint = true;
  mesh.renderOrder = 8;
  return mesh;
}

export function syncPaintInk(
  group: THREE.Group,
  shapes: PaintShape[],
  size: { width: number; height: number },
) {
  for (const child of [...group.children]) {
    group.remove(child);
    disposePaintObject(child);
  }
  for (const shape of shapes) {
    const object = buildPaintObject(shape, size);
    if (object) group.add(object);
  }
}

export function syncPaintInkResolution(group: THREE.Group, size: { width: number; height: number }) {
  group.traverse((child) => {
    const material = (child as THREE.Mesh).material as { resolution?: THREE.Vector2 } | undefined;
    material?.resolution?.set(size.width, size.height);
  });
}
