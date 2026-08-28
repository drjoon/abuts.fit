import * as THREE from "three";

type ScreenSpaceOrbitControlsEvent = "start" | "change" | "end";

type ScreenSpaceOrbitControlsListener = () => void;

type DragMode = "none" | "rotate" | "pan";

export type ScreenSpaceOrbitControlsOptions = {
  rotateSpeed?: number;
  zoomSpeed?: number;
  panSpeed?: number;
  enablePan?: boolean;
  minDistance?: number;
  maxDistance?: number;
};

/**
 * Dental preview orbit — screen-space axes (no world-up lock):
 * - Horizontal drag: rotate around screen Y (camera local up) → keeps current horizon level
 * - Vertical drag: rotate around screen X (camera local right)
 * - Pan: middle / right / Shift+left drag (screen-space)
 *
 * World Z turntable is intentionally not used: scan PLY axes often disagree with
 * “level teeth” on screen, so Z-azimuth feels like spinning/tilting.
 */
export class ScreenSpaceOrbitControls {
  readonly target = new THREE.Vector3();

  rotateSpeed: number;
  zoomSpeed: number;
  panSpeed: number;
  enablePan: boolean;
  minDistance: number;
  maxDistance: number;

  /**
   * True if the last completed pointer gesture moved the camera (rotate/pan).
   * Used by viewers to ignore contextmenu undo after a right-drag pan.
   */
  lastGestureMoved = false;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly domElement: HTMLElement;
  private readonly offset = new THREE.Vector3();
  private readonly screenRight = new THREE.Vector3();
  private readonly screenUp = new THREE.Vector3();
  private readonly panRight = new THREE.Vector3();
  private readonly panUp = new THREE.Vector3();
  private readonly listeners = new Map<
    ScreenSpaceOrbitControlsEvent,
    Set<ScreenSpaceOrbitControlsListener>
  >();

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
    this.offset.subVectors(this.camera.position, this.target);
    if (this.offset.lengthSq() < 1e-16) {
      this.offset.set(0, -1, 0);
    }
    this.offset.setLength(this.radius);
    this.camera.position.copy(this.target).add(this.offset);
    this.camera.lookAt(this.target);
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
    this.radius = Math.max(
      this.camera.position.distanceTo(this.target),
      this.minDistance,
    );
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

    this.offset.subVectors(this.camera.position, this.target);
    this.camera.updateMatrixWorld();
    // Camera basis = screen axes (column 0 = right/X, column 1 = up/Y).
    this.screenRight.setFromMatrixColumn(this.camera.matrixWorld, 0).normalize();
    this.screenUp.setFromMatrixColumn(this.camera.matrixWorld, 1).normalize();

    if (deltaX !== 0) {
      // Left/right → yaw around screen Y (keeps current horizon).
      this.offset.applyAxisAngle(this.screenUp, -deltaX * rotateScale);
    }

    if (deltaY !== 0) {
      // Up/down → pitch around screen X; rotate up with it so horizon stays.
      const pitch = -deltaY * rotateScale;
      this.offset.applyAxisAngle(this.screenRight, pitch);
      this.camera.up.applyAxisAngle(this.screenRight, pitch);
    }

    this.radius = THREE.MathUtils.clamp(
      this.offset.length(),
      this.minDistance,
      this.maxDistance,
    );
    this.offset.setLength(this.radius);
    this.camera.position.copy(this.target).add(this.offset);
    this.camera.lookAt(this.target);
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
    this.panRight.setFromMatrixColumn(this.camera.matrixWorld, 0);
    this.panUp.setFromMatrixColumn(this.camera.matrixWorld, 1);

    // Drag right → content follows cursor (camera + target move together).
    const mx = -deltaX * panScale;
    const my = deltaY * panScale;
    this.target.addScaledVector(this.panRight, mx);
    this.target.addScaledVector(this.panUp, my);
    this.camera.position.addScaledVector(this.panRight, mx);
    this.camera.position.addScaledVector(this.panUp, my);
  }

  private dispatch(type: ScreenSpaceOrbitControlsEvent) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }
}
