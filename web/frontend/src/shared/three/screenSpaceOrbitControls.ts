import * as THREE from "three";

type ScreenSpaceOrbitControlsEvent = "start" | "change" | "end";

type ScreenSpaceOrbitControlsListener = () => void;

export type ScreenSpaceOrbitControlsOptions = {
  rotateSpeed?: number;
  zoomSpeed?: number;
  minPolarAngle?: number;
  maxPolarAngle?: number;
  minDistance?: number;
  maxDistance?: number;
};

/**
 * Dental preview orbit — decoupled to avoid roll:
 * - Horizontal: camera azimuth around viewTarget (screen-vertical / yaw, see left/right)
 * - Vertical: camera elevation (polar) only
 */
export class ScreenSpaceOrbitControls {
  readonly target = new THREE.Vector3();

  rotateSpeed: number;
  zoomSpeed: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  minDistance: number;
  maxDistance: number;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly domElement: HTMLElement;
  private readonly worldUp = new THREE.Vector3(0, 0, 1);
  private readonly listeners = new Map<
    ScreenSpaceOrbitControlsEvent,
    Set<ScreenSpaceOrbitControlsListener>
  >();

  /** Camera azimuth in XY plane — horizontal drag (yaw around screen vertical). */
  private azimuth = 0;
  /** Colatitude from +Z. 0 = above, π/2 = horizon. */
  private polar = Math.PI / 4;
  private radius = 10;

  private dragging = false;
  private disposed = false;
  private activePointerId: number | null = null;
  private lastPointer = new THREE.Vector2();

  private readonly onPointerDown = (event: PointerEvent) => {
    if (this.disposed || event.button !== 0) return;
    this.syncFromCamera();
    this.activePointerId = event.pointerId;
    this.dragging = true;
    this.lastPointer.set(event.clientX, event.clientY);
    this.domElement.setPointerCapture(event.pointerId);
    this.dispatch("start");
    event.preventDefault();
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (
      this.disposed ||
      !this.dragging ||
      this.activePointerId === null ||
      event.pointerId !== this.activePointerId
    ) {
      return;
    }

    const deltaX = event.clientX - this.lastPointer.x;
    const deltaY = event.clientY - this.lastPointer.y;
    this.lastPointer.set(event.clientX, event.clientY);
    if (deltaX === 0 && deltaY === 0) return;

    this.rotateFromScreenDelta(deltaX, deltaY);
    this.dispatch("change");
    event.preventDefault();
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    if (this.activePointerId === null || event.pointerId !== this.activePointerId) {
      return;
    }
    this.dragging = false;
    this.activePointerId = null;
    try {
      this.domElement.releasePointerCapture(event.pointerId);
    } catch {
      // noop
    }
    this.dispatch("end");
  };

  private readonly onWheel = (event: WheelEvent) => {
    if (this.disposed) return;
    event.preventDefault();
    this.syncFromCamera();
    const scale = Math.exp((event.deltaY * this.zoomSpeed) / 100);
    this.radius = THREE.MathUtils.clamp(
      this.radius * scale,
      this.minDistance,
      this.maxDistance,
    );
    this.applyCamera();
    this.dispatch("change");
  };

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    options: ScreenSpaceOrbitControlsOptions = {},
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.rotateSpeed = options.rotateSpeed ?? 1;
    this.zoomSpeed = options.zoomSpeed ?? 1;
    this.minPolarAngle = options.minPolarAngle ?? 0.05;
    this.maxPolarAngle = options.maxPolarAngle ?? Math.PI - 0.05;
    this.minDistance = options.minDistance ?? 0.01;
    this.maxDistance = options.maxDistance ?? Infinity;

    domElement.style.touchAction = "none";
    domElement.addEventListener("pointerdown", this.onPointerDown);
    domElement.addEventListener("pointermove", this.onPointerMove);
    domElement.addEventListener("pointerup", this.onPointerUp);
    domElement.addEventListener("pointercancel", this.onPointerUp);
    domElement.addEventListener("wheel", this.onWheel, { passive: false });
  }

  addEventListener(
    type: ScreenSpaceOrbitControlsEvent,
    listener: ScreenSpaceOrbitControlsListener,
  ) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(
    type: ScreenSpaceOrbitControlsEvent,
    listener: ScreenSpaceOrbitControlsListener,
  ) {
    this.listeners.get(type)?.delete(listener);
  }

  syncFromCamera() {
    const dx = this.camera.position.x - this.target.x;
    const dy = this.camera.position.y - this.target.y;
    const dz = this.camera.position.z - this.target.z;
    this.radius = Math.max(Math.hypot(dx, dy, dz), this.minDistance);

    if (this.radius <= 1e-8) {
      this.azimuth = 0;
      this.polar = Math.PI / 4;
      return;
    }

    this.polar = THREE.MathUtils.clamp(
      Math.acos(THREE.MathUtils.clamp(dz / this.radius, -1, 1)),
      this.minPolarAngle,
      this.maxPolarAngle,
    );
    this.azimuth = Math.atan2(dy, dx);
  }

  update() {}

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.domElement.removeEventListener("pointermove", this.onPointerMove);
    this.domElement.removeEventListener("pointerup", this.onPointerUp);
    this.domElement.removeEventListener("pointercancel", this.onPointerUp);
    this.domElement.removeEventListener("wheel", this.onWheel);
    this.domElement.style.touchAction = "";
    this.listeners.clear();
  }

  private rotateFromScreenDelta(deltaX: number, deltaY: number) {
    const elementSize = Math.max(this.domElement.clientHeight, 1);
    const rotateScale = (this.rotateSpeed * (Math.PI * 2)) / elementSize;
    let cameraChanged = false;

    if (deltaX !== 0) {
      this.azimuth -= deltaX * rotateScale;
      cameraChanged = true;
    }

    if (deltaY !== 0) {
      this.polar = THREE.MathUtils.clamp(
        this.polar - deltaY * rotateScale,
        this.minPolarAngle,
        this.maxPolarAngle,
      );
      cameraChanged = true;
    }

    if (cameraChanged) {
      this.applyCamera();
    }
  }

  private applyCamera() {
    const sinP = Math.sin(this.polar);
    const cosP = Math.cos(this.polar);
    this.camera.position.set(
      this.target.x + this.radius * sinP * Math.cos(this.azimuth),
      this.target.y + this.radius * sinP * Math.sin(this.azimuth),
      this.target.z + this.radius * cosP,
    );
    this.camera.up.copy(this.worldUp);
    this.camera.lookAt(this.target);
  }

  private dispatch(type: ScreenSpaceOrbitControlsEvent) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }
}
