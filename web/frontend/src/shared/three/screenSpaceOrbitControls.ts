import * as THREE from "three";

type ScreenSpaceOrbitControlsEvent = "start" | "change" | "end";

type ScreenSpaceOrbitControlsListener = () => void;

type DragMode = "none" | "rotate" | "pan";

export type ScreenSpaceOrbitControlsOptions = {
  rotateSpeed?: number;
  zoomSpeed?: number;
  panSpeed?: number;
  enablePan?: boolean;
  minPolarAngle?: number;
  maxPolarAngle?: number;
  minDistance?: number;
  maxDistance?: number;
};

/**
 * Dental preview orbit — decoupled to avoid roll:
 * - Horizontal: camera azimuth around viewTarget (screen-vertical / yaw, see left/right)
 * - Vertical: camera elevation (polar) only
 * - Pan: middle / right / Shift+left drag (screen-space)
 */
export class ScreenSpaceOrbitControls {
  readonly target = new THREE.Vector3();

  rotateSpeed: number;
  zoomSpeed: number;
  panSpeed: number;
  enablePan: boolean;
  minPolarAngle: number;
  maxPolarAngle: number;
  minDistance: number;
  maxDistance: number;

  /**
   * True if the last completed pointer gesture moved the camera (rotate/pan).
   * Used by viewers to ignore contextmenu undo after a right-drag pan.
   */
  lastGestureMoved = false;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly domElement: HTMLElement;
  private readonly worldUp = new THREE.Vector3(0, 0, 1);
  private readonly panRight = new THREE.Vector3();
  private readonly panUp = new THREE.Vector3();
  private readonly listeners = new Map<
    ScreenSpaceOrbitControlsEvent,
    Set<ScreenSpaceOrbitControlsListener>
  >();

  /** Camera azimuth in XY plane — horizontal drag (yaw around screen vertical). */
  private azimuth = 0;
  /** Colatitude from +Z. 0 = above, π/2 = horizon. */
  private polar = Math.PI / 4;
  private radius = 10;

  private dragMode: DragMode = "none";
  private disposed = false;
  private activePointerId: number | null = null;
  private lastPointer = new THREE.Vector2();

  private readonly onPointerDown = (event: PointerEvent) => {
    if (this.disposed) return;

    const mode = this.resolveDragMode(event);
    if (mode === "none") return;

    this.syncFromCamera();
    this.activePointerId = event.pointerId;
    this.dragMode = mode;
    this.lastGestureMoved = false;
    this.lastPointer.set(event.clientX, event.clientY);
    this.domElement.setPointerCapture(event.pointerId);
    this.dispatch("start");
    event.preventDefault();
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (
      this.disposed ||
      this.dragMode === "none" ||
      this.activePointerId === null ||
      event.pointerId !== this.activePointerId
    ) {
      return;
    }

    const deltaX = event.clientX - this.lastPointer.x;
    const deltaY = event.clientY - this.lastPointer.y;
    this.lastPointer.set(event.clientX, event.clientY);
    if (deltaX === 0 && deltaY === 0) return;

    if (Math.abs(deltaX) + Math.abs(deltaY) >= 2) {
      this.lastGestureMoved = true;
    }

    if (this.dragMode === "pan") {
      this.panFromScreenDelta(deltaX, deltaY);
    } else {
      this.rotateFromScreenDelta(deltaX, deltaY);
    }
    this.dispatch("change");
    event.preventDefault();
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    if (this.activePointerId === null || event.pointerId !== this.activePointerId) {
      return;
    }
    this.dragMode = "none";
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

  private readonly onContextMenu = (event: Event) => {
    // Right-drag pan uses button 2; block the browser menu.
    event.preventDefault();
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
    this.panSpeed = options.panSpeed ?? 1;
    this.enablePan = options.enablePan ?? true;
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
    domElement.addEventListener("contextmenu", this.onContextMenu);
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
    this.domElement.removeEventListener("contextmenu", this.onContextMenu);
    this.domElement.style.touchAction = "";
    this.listeners.clear();
  }

  private resolveDragMode(event: PointerEvent): DragMode {
    // Middle or right → pan. Shift+left → pan. Left → rotate.
    if (event.button === 1 || event.button === 2) {
      return this.enablePan ? "pan" : "none";
    }
    if (event.button === 0) {
      if (event.shiftKey && this.enablePan) return "pan";
      return "rotate";
    }
    return "none";
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

  private panFromScreenDelta(deltaX: number, deltaY: number) {
    const elementHeight = Math.max(this.domElement.clientHeight, 1);
    // Match three.js OrbitControls perspective pan scale (screen-space).
    const targetDistance =
      this.radius *
      Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5));
    const panScale =
      ((2 * targetDistance) / elementHeight) * this.panSpeed;

    this.camera.updateMatrixWorld();
    this.panRight.setFromMatrixColumn(this.camera.matrix, 0);
    this.panUp.setFromMatrixColumn(this.camera.matrix, 1);

    // Drag right → content follows cursor (target moves left in camera space).
    this.target.addScaledVector(this.panRight, -deltaX * panScale);
    this.target.addScaledVector(this.panUp, deltaY * panScale);
    this.applyCamera();
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
