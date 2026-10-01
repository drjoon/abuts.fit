// 3D 뷰가 페인트에 넘기는 화면↔모델 변환.
// 좌표는 attach한 부모의 로컬이다. 카메라를 돌리면 그 자리에 남는다.
// 그린 표시는 그릴 때의 화면과 나란한 평면(법선이 화면을 향함)에 둔다.
// related files: viewPaintGeom.ts, viewPaintInk.ts, ViewPaintSurface.tsx
import * as THREE from "three";

import type { Pose, ScreenPoint, Vec3 } from "@/shared/components/practice/viewPaintGeom";

export type ViewPaintHit = {
  point: Vec3;
  pose: Pose;
};

export type ViewPaintRay = { origin: Vec3; direction: Vec3 };

/** 페인트가 왼쪽을 그리는 동안 화면을 돌리고 옮긴다. */
export type ViewPaintView =
  | { type: "start" }
  | { type: "end" }
  | { type: "zoom"; dy: number }
  | { type: "move"; action: "rotate" | "pan"; dx: number; dy: number };

export type ViewPaintSpace = {
  /** 그릴 때의 화면 평면. 닿은 곳이 깊이다. */
  pick: (clientX: number, clientY: number) => ViewPaintHit | null;
  /** 부모 로컬 광선. */
  ray: (clientX: number, clientY: number) => ViewPaintRay | null;
  project: (point: Vec3) => ScreenPoint | null;
  worldPerPixel: (point: Vec3) => number;
  /** 표면에 파묻히지 않게 띄우는 거리. */
  surfaceLift: () => number;
  viewSize: () => { width: number; height: number };
  attach: (object: THREE.Object3D) => () => void;
  subscribe: (listener: () => void) => () => void;
  /** 왼쪽 그리기와 겹치지 않게 화면을 돌린다. */
  view: (gesture: ViewPaintView) => void;
};

export function notifyViewPaint(listeners: Set<() => void>) {
  for (const listener of listeners) listener();
}

function toVec(v: THREE.Vector3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

export function createViewPaintSpace(opts: {
  getCamera: () => THREE.Camera | null;
  getRenderer: () => THREE.WebGLRenderer | null;
  getParent: () => THREE.Object3D | null;
  getTargets: () => THREE.Object3D[];
  listeners: Set<() => void>;
  onView?: (gesture: ViewPaintView) => void;
}): ViewPaintSpace {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const inv = new THREE.Matrix4();
  const tmp = new THREE.Vector3();
  const camRight = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const towardCamera = new THREE.Vector3();
  const localPoint = new THREE.Vector3();
  const bounds = new THREE.Box3();
  const center = new THREE.Vector3();
  const rayOrigin = new THREE.Vector3();
  const rayDir = new THREE.Vector3();

  const view = () => {
    const camera = opts.getCamera();
    const renderer = opts.getRenderer();
    const parent = opts.getParent();
    if (!camera || !renderer || !parent) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    camera.updateMatrixWorld();
    parent.updateWorldMatrix(true, false);
    inv.copy(parent.matrixWorld).invert();
    return { camera, renderer, parent, rect };
  };

  const ray: ViewPaintSpace["ray"] = (clientX, clientY) => {
    const current = view();
    if (!current) return null;
    ndc.set(
      ((clientX - current.rect.left) / current.rect.width) * 2 - 1,
      -((clientY - current.rect.top) / current.rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, current.camera);
    const origin = raycaster.ray.origin.clone().applyMatrix4(inv);
    const direction = raycaster.ray.direction.clone().transformDirection(inv);
    if (direction.lengthSq() < 1e-12) return null;
    direction.normalize();
    return { origin: toVec(origin), direction: toVec(direction) };
  };

  const project: ViewPaintSpace["project"] = (point) => {
    const current = view();
    if (!current) return null;
    tmp.set(point.x, point.y, point.z);
    current.parent.localToWorld(tmp);
    tmp.project(current.camera);
    if (!Number.isFinite(tmp.x) || !Number.isFinite(tmp.y) || tmp.z < -1 || tmp.z > 1) {
      return null;
    }
    return { x: (tmp.x + 1) / 2, y: (1 - tmp.y) / 2 };
  };

  const worldPerPixel: ViewPaintSpace["worldPerPixel"] = (point) => {
    const current = view();
    if (!current) return 0.01;
    const cssH = Math.max(current.renderer.domElement.clientHeight, 1);
    const cam = current.camera;
    if ((cam as THREE.OrthographicCamera).isOrthographicCamera) {
      const ortho = cam as THREE.OrthographicCamera;
      const worldH = (ortho.top - ortho.bottom) / Math.max(ortho.zoom, 1e-6);
      return Math.abs(worldH) / cssH;
    }
    const persp = cam as THREE.PerspectiveCamera;
    tmp.set(point.x, point.y, point.z);
    current.parent.localToWorld(tmp);
    const dist = Math.max(persp.position.distanceTo(tmp), 1e-3);
    const worldH = 2 * Math.tan(THREE.MathUtils.degToRad(persp.fov) / 2) * dist;
    return worldH / cssH;
  };

  /** 화면 오른쪽·위와, 카메라를 향하는 법선. 부모 로컬. */
  const screenAxes = (current: NonNullable<ReturnType<typeof view>>) => {
    camRight.setFromMatrixColumn(current.camera.matrixWorld, 0).transformDirection(inv);
    towardCamera.setFromMatrixColumn(current.camera.matrixWorld, 2).transformDirection(inv);
    if (camRight.lengthSq() < 1e-8 || towardCamera.lengthSq() < 1e-8) return false;
    towardCamera.normalize();
    camRight.addScaledVector(towardCamera, -camRight.dot(towardCamera));
    if (camRight.lengthSq() < 1e-8) return false;
    camRight.normalize();
    // 카메라 +Z(컬럼 2)는 화면 밖, 관측자 쪽. towardCamera × right = 화면 위.
    camUp.crossVectors(towardCamera, camRight).normalize();
    return true;
  };

  return {
    pick: (clientX, clientY) => {
      const current = view();
      if (!current || !screenAxes(current)) return null;
      ndc.set(
        ((clientX - current.rect.left) / current.rect.width) * 2 - 1,
        -((clientY - current.rect.top) / current.rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, current.camera);
      const targets = opts.getTargets().filter((obj) => obj.visible && !obj.userData.viewPaint);
      const hit = raycaster.intersectObjects(targets, false).find((item) => {
        const mesh = item.object as THREE.Mesh;
        if (!mesh.isMesh || !item.face) return false;
        const material = mesh.material;
        const list = Array.isArray(material) ? material : [material];
        return list.every((entry) => entry && entry.depthTest !== false);
      });
      if (hit) {
        localPoint.copy(hit.point).applyMatrix4(inv);
      } else {
        bounds.makeEmpty();
        let any = false;
        for (const obj of targets) {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) continue;
          bounds.expandByObject(mesh);
          any = true;
        }
        if (!any || bounds.isEmpty()) return null;
        let best = -Infinity;
        const min = bounds.min;
        const max = bounds.max;
        for (const x of [min.x, max.x]) {
          for (const y of [min.y, max.y]) {
            for (const z of [min.z, max.z]) {
              tmp.set(x, y, z).applyMatrix4(inv);
              const score = tmp.dot(towardCamera);
              if (score > best) {
                best = score;
                center.copy(tmp);
              }
            }
          }
        }
        rayOrigin.copy(raycaster.ray.origin).applyMatrix4(inv);
        rayDir.copy(raycaster.ray.direction).transformDirection(inv);
        if (rayDir.lengthSq() < 1e-12) return null;
        rayDir.normalize();
        const denom = towardCamera.dot(rayDir);
        if (Math.abs(denom) < 1e-8) return null;
        const t = towardCamera.dot(tmp.copy(center).sub(rayOrigin)) / denom;
        if (t < 0) return null;
        localPoint.copy(rayOrigin).addScaledVector(rayDir, t);
      }
      const point = toVec(localPoint);
      const pose: Pose = {
        origin: point,
        normal: toVec(towardCamera),
        axisU: toVec(camRight),
        axisV: toVec(camUp),
      };
      return { point, pose };
    },
    ray,
    project,
    worldPerPixel,
    surfaceLift: () => {
      const current = view();
      if (!current) return 0.2;
      const cam = current.camera;
      if ((cam as THREE.OrthographicCamera).isOrthographicCamera) {
        const ortho = cam as THREE.OrthographicCamera;
        return Math.abs((ortho.top - ortho.bottom) / Math.max(ortho.zoom, 1e-6)) * 0.004;
      }
      return 0.25;
    },
    viewSize: () => {
      const renderer = opts.getRenderer();
      return {
        width: Math.max(renderer?.domElement.clientWidth ?? 1, 1),
        height: Math.max(renderer?.domElement.clientHeight ?? 1, 1),
      };
    },
    attach: (object) => {
      const parent = opts.getParent();
      if (!parent) return () => {};
      object.userData.viewPaint = true;
      parent.add(object);
      return () => {
        parent.remove(object);
      };
    },
    subscribe: (listener) => {
      opts.listeners.add(listener);
      return () => {
        opts.listeners.delete(listener);
      };
    },
    view: (gesture) => {
      opts.onView?.(gesture);
    },
  };
}
