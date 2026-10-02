import * as THREE from "three";

// change-log:
// - 2026-10-02: 트랙패드 두 손가락 스크롤은 이동. 핀치·마우스 휠은 확대·축소.
// - 2026-09-14: OrthographicCamera 지원 — 줌은 camera.zoom, 패닝 스케일 ortho 분기.
// - 2026-10-01: beginExternal·dragBy·zoomByWheel — 페인트가 왼쪽을 쓰는 동안 화면 조작.
// - 2026-09-30: 마우스 버튼 매핑(`mouse`) — 회전·이동·드래그 확대·클릭 회전 중심. 왼쪽+오른쪽 동시 누름 지원.
type ScreenSpaceOrbitControlsEvent = "start" | "change" | "end";

type ScreenSpaceOrbitControlsListener = () => void;

export type OrbitDragMode = "none" | "rotate" | "pan" | "zoom";

type OrbitCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;

export type OrbitMouseButton = "left" | "middle" | "right" | "left+right";
export type OrbitModifier = "none" | "shift" | "ctrl" | "alt";
export type OrbitGesture = { button: OrbitMouseButton; mod: OrbitModifier };
export type OrbitMouseAction = "rotate" | "pan" | "zoom" | "pivot";

export type OrbitMouseBindings = Record<OrbitMouseAction, OrbitGesture[]> & {
  /** 켜면 휠을 내릴 때 확대한다. */
  invertWheel: boolean;
};

/** 어벗츠 기본. 오른쪽 드래그 회전, 휠 버튼 드래그 이동. 휠·핀치는 확대·축소. 왼쪽은 그리기. */
export const DEFAULT_ORBIT_MOUSE: OrbitMouseBindings = {
  rotate: [{ button: "right", mod: "none" }],
  pan: [{ button: "middle", mod: "none" }],
  zoom: [],
  pivot: [],
  invertWheel: false,
};

/** 누른 버튼 비트(`buttons`)를 제스처 버튼으로. 두 개 넘게 누르면 null. */
function orbitButtonOf(event: PointerEvent | MouseEvent): OrbitMouseButton | null {
  let bits = event.buttons;
  if (!bits && event.type !== "pointermove") {
    bits = event.button === 0 ? 1 : event.button === 1 ? 4 : event.button === 2 ? 2 : 0;
  }
  if (bits === 1) return "left";
  if (bits === 2) return "right";
  if (bits === 4) return "middle";
  if (bits === 3) return "left+right";
  return null;
}

function orbitModifierOf(event: PointerEvent | MouseEvent): OrbitModifier | "many" {
  const mods: OrbitModifier[] = [];
  if (event.ctrlKey || event.metaKey) mods.push("ctrl");
  if (event.shiftKey) mods.push("shift");
  if (event.altKey) mods.push("alt");
  if (mods.length === 0) return "none";
  return mods.length === 1 ? mods[0] : "many";
}

/**
 * 이 이벤트에 걸린 동작. 수식키가 정확히 같은 제스처가 먼저다.
 * 없으면 수식키 없는 제스처로 본다(예: Ctrl+왼쪽도 왼쪽 회전).
 */
export function matchOrbitGesture(
  bindings: OrbitMouseBindings,
  event: PointerEvent | MouseEvent,
  actions: readonly OrbitMouseAction[],
): OrbitMouseAction | null {
  const button = orbitButtonOf(event);
  if (!button) return null;
  const mod = orbitModifierOf(event);
  for (const action of actions) {
    if (bindings[action].some((row) => row.button === button && row.mod === mod)) return action;
  }
  if (mod === "none") return null;
  for (const action of actions) {
    if (bindings[action].some((row) => row.button === button && row.mod === "none")) return action;
  }
  return null;
}

const DRAG_ACTIONS = ["rotate", "pan", "zoom"] as const;

type LegacyWheelEvent = WheelEvent & {
  wheelDeltaY?: number;
  /** 자연 스크롤이면 true. 휠 델타는 손가락과 반대다. */
  webkitDirectionInvertedFromDevice?: boolean;
};

/** 트랙패드 연속 이벤트 간격. 이보다 긴 간격의 노치는 마우스 휠이다. */
const TRACKPAD_STREAM_MS = 48;
let lastWheelAt = -Infinity;
let lastWheelWasTrackpad = false;

/** 한 칸의 마우스 휠. 가로 성분이 있거나 자잘한 픽셀이면 트랙패드다. */
function isDiscreteMouseWheel(event: WheelEvent): boolean {
  if (event.deltaX !== 0) return false;
  if (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return true;
  const absY = Math.abs(event.deltaY);
  if (absY === 0) return false;
  if (Number.isInteger(event.deltaY) && absY >= 100 && (absY % 100 === 0 || absY % 120 === 0)) {
    return true;
  }
  const legacy = (event as LegacyWheelEvent).wheelDeltaY;
  if (typeof legacy !== "number" || legacy === 0 || event.deltaY === 0) return false;
  if (Math.abs(legacy) % 120 !== 0) return false;
  // Safari 마우스: deltaY는 작은 정수, wheelDeltaY는 ±120. 트랙패드 비율은 약 3이다.
  const ratio = Math.abs(legacy / event.deltaY);
  return ratio >= 20 && absY <= 16 && Number.isInteger(event.deltaY);
}

/** 손가락이 움직인 부호. 자연 스크롤은 휠 델타를 뒤집는다. */
function fingerSign(event: LegacyWheelEvent): number {
  if (event.webkitDirectionInvertedFromDevice === true) return -1;
  if (event.webkitDirectionInvertedFromDevice === false) return 1;
  if (typeof navigator !== "undefined" && /Mac|iP(hone|ad)/.test(navigator.userAgent)) return -1;
  return 1;
}

/**
 * 트랙패드 두 손가락 스크롤을 화면 이동 픽셀로.
 * 핀치(ctrl)와 마우스 휠이면 null — 호출하는 쪽이 확대·축소한다.
 */
export function trackpadPanDelta(event: WheelEvent): { dx: number; dy: number } | null {
  if (event.ctrlKey) return null;
  const now = event.timeStamp || (typeof performance !== "undefined" ? performance.now() : Date.now());
  const gap = now - lastWheelAt;
  lastWheelAt = now;
  if (gap > 200) lastWheelWasTrackpad = false;

  const trackpad = isDiscreteMouseWheel(event)
    ? lastWheelWasTrackpad && gap < TRACKPAD_STREAM_MS
    : event.deltaMode === WheelEvent.DOM_DELTA_PIXEL;
  lastWheelWasTrackpad = trackpad;
  if (!trackpad) return null;

  // 화면은 손가락과 반대로 움직인다.
  const sign = -fingerSign(event as LegacyWheelEvent);
  const dx = sign * event.deltaX;
  const dy = sign * event.deltaY;
  if (dx === 0 && dy === 0) return null;
  return { dx, dy };
}

export type ScreenSpaceOrbitControlsOptions = {
  rotateSpeed?: number;
  zoomSpeed?: number;
  panSpeed?: number;
  enablePan?: boolean;
  minDistance?: number;
  maxDistance?: number;
  /** Orthographic only — clamp camera.zoom */
  minZoom?: number;
  maxZoom?: number;
  /** 누를 때마다 읽는다. 없으면 어벗츠 기본. */
  mouse?: () => OrbitMouseBindings;
};

/**
 * Dental preview orbit — screen-space axes (no world-up lock):
 * - Horizontal drag: rotate around screen Y (camera local up) → keeps current horizon level
 * - Vertical drag: rotate around screen X (camera local right)
 * - Buttons come from `mouse` (default: left rotate, middle/right/Shift+left pan)
 * - Orthographic zoom: camera.zoom (distance does not change apparent size)
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
  minZoom: number;
  maxZoom: number;
  /** 회전 중심 클릭에서 화면 아래 면 좌표. 없으면 회전 중심 클릭을 무시한다. */
  pickPivot: ((event: PointerEvent) => THREE.Vector3 | null) | null = null;

  /**
   * True if the last completed pointer gesture moved the camera (rotate/pan).
   * Used by viewers to ignore contextmenu undo after a right-drag pan.
   */
  lastGestureMoved = false;

  private readonly camera: OrbitCamera;
  private readonly domElement: HTMLElement;
  private readonly mouse: () => OrbitMouseBindings;
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

  private dragMode: OrbitDragMode = "none";
  private started = false;
  private disposed = false;
  private activePointerId: number | null = null;
  private activeButtons = 0;
  private pivotArmed = false;
  private readonly downPointer = new THREE.Vector2();
  private lastPointer = new THREE.Vector2();

  private readonly onPointerDown = (event: PointerEvent) => {
    if (this.disposed) return;
    if (this.activePointerId !== null && event.pointerId !== this.activePointerId) return;

    const mode = this.dragModeFor(event);
    const pivot =
      event.pointerType !== "touch" &&
      this.pickPivot != null &&
      matchOrbitGesture(this.mouse(), event, ["pivot"]) === "pivot";
    if (mode === "none" && !pivot) return;
    this.begin(event, mode, pivot);
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (this.disposed) return;
    if (this.activePointerId === null) {
      // 화면 동작이 없는 버튼(예: exocad 왼쪽)을 누른 채 다른 버튼을 더 누른 경우.
      if (event.pointerType !== "mouse" || event.buttons === 0) return;
      const mode = this.dragModeFor(event);
      if (mode !== "none") this.begin(event, mode, false);
      return;
    }
    if (event.pointerId !== this.activePointerId) return;
    // 드래그 중 두 번째 버튼을 누르거나 떼면 pointermove로만 온다.
    if (event.pointerType === "mouse" && event.buttons !== this.activeButtons) {
      this.activeButtons = event.buttons;
      const next = event.buttons !== 0 ? this.dragModeFor(event) : "none";
      if (next !== "none") this.setMode(next);
    }

    const deltaX = event.clientX - this.lastPointer.x;
    const deltaY = event.clientY - this.lastPointer.y;
    this.lastPointer.set(event.clientX, event.clientY);
    if (deltaX === 0 && deltaY === 0) return;

    if (
      Math.abs(event.clientX - this.downPointer.x) + Math.abs(event.clientY - this.downPointer.y) >=
      4
    ) {
      this.pivotArmed = false;
    }
    if (this.dragMode === "none") return;
    if (Math.abs(deltaX) + Math.abs(deltaY) >= 2) {
      this.lastGestureMoved = true;
    }

    if (this.dragMode === "pan") {
      this.panFromScreenDelta(deltaX, deltaY);
    } else if (this.dragMode === "zoom") {
      this.zoomBy(Math.exp((deltaY * this.zoomSpeed) / 200));
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
    const pivot = this.pivotArmed && !this.lastGestureMoved;
    this.dragMode = "none";
    this.activePointerId = null;
    this.activeButtons = 0;
    this.pivotArmed = false;
    try {
      this.domElement.releasePointerCapture(event.pointerId);
    } catch {
      // noop
    }
    if (pivot) this.pivotAt(event);
    if (this.started) {
      this.started = false;
      this.dispatch("end");
    }
  };

  private readonly onWheel = (event: WheelEvent) => {
    if (this.disposed) return;
    event.preventDefault();
    // 두 손가락 드래그(오른쪽 버튼)는 회전이다. 그 동안의 휠은 이동·확대에 쓰지 않는다.
    if (this.activePointerId !== null) return;
    this.syncFromCamera();
    const pan = trackpadPanDelta(event);
    if (pan && this.enablePan) {
      this.panFromScreenDelta(pan.dx, pan.dy);
      this.dispatch("change");
      return;
    }
    const sign = this.mouse().invertWheel ? -1 : 1;
    this.zoomBy(Math.exp((sign * event.deltaY * this.zoomSpeed) / 100));
    this.dispatch("change");
  };

  private readonly onContextMenu = (event: Event) => {
    // Right-drag uses button 2; block the browser menu.
    event.preventDefault();
  };

  constructor(
    camera: OrbitCamera,
    domElement: HTMLElement,
    options: ScreenSpaceOrbitControlsOptions = {},
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.mouse = options.mouse ?? (() => DEFAULT_ORBIT_MOUSE);
    this.rotateSpeed = options.rotateSpeed ?? 1;
    this.zoomSpeed = options.zoomSpeed ?? 1;
    this.panSpeed = options.panSpeed ?? 1;
    this.enablePan = options.enablePan ?? true;
    this.minDistance = options.minDistance ?? 0.01;
    this.maxDistance = options.maxDistance ?? Infinity;
    this.minZoom = options.minZoom ?? 0.2;
    this.maxZoom = options.maxZoom ?? 20;

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

  /** 이 누름이 화면 드래그(회전·이동·확대)인지. 편집 도구가 오른쪽 클릭을 미룰지 정한다. */
  dragModeFor(event: PointerEvent | MouseEvent): OrbitDragMode {
    if ((event as PointerEvent).pointerType === "touch") return "rotate";
    const action = matchOrbitGesture(this.mouse(), event, DRAG_ACTIONS);
    if (!action || action === "pivot") return "none";
    if (action === "pan" && !this.enablePan) return "none";
    return action;
  }

  syncFromCamera() {
    this.radius = Math.max(
      this.camera.position.distanceTo(this.target),
      this.minDistance,
    );
  }

  /** 다른 레이어가 왼쪽 버튼을 쓰는 동안 같은 회전·이동을 시작한다. */
  beginExternal() {
    if (this.disposed) return;
    this.syncFromCamera();
    if (!this.started) {
      this.started = true;
      this.dispatch("start");
    }
  }

  endExternal() {
    if (this.disposed || !this.started) return;
    this.started = false;
    this.dispatch("end");
  }

  dragBy(mode: Exclude<OrbitDragMode, "none">, deltaX: number, deltaY: number) {
    if (this.disposed) return;
    this.syncFromCamera();
    if (mode === "pan") {
      if (!this.enablePan) return;
      this.panFromScreenDelta(deltaX, deltaY);
    } else if (mode === "zoom") {
      this.zoomBy(Math.exp((deltaY * this.zoomSpeed) / 200));
    } else {
      this.rotateFromScreenDelta(deltaX, deltaY);
    }
    this.dispatch("change");
  }

  zoomByWheel(deltaY: number) {
    if (this.disposed) return;
    this.syncFromCamera();
    const sign = this.mouse().invertWheel ? -1 : 1;
    this.zoomBy(Math.exp((sign * deltaY * this.zoomSpeed) / 100));
    this.dispatch("change");
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

  private begin(event: PointerEvent, mode: OrbitDragMode, pivot: boolean) {
    this.syncFromCamera();
    this.activePointerId = event.pointerId;
    this.activeButtons = event.buttons;
    this.pivotArmed = pivot;
    this.lastGestureMoved = false;
    this.downPointer.set(event.clientX, event.clientY);
    this.lastPointer.set(event.clientX, event.clientY);
    try {
      this.domElement.setPointerCapture(event.pointerId);
    } catch {
      // noop
    }
    this.setMode(mode);
    event.preventDefault();
  }

  private setMode(mode: OrbitDragMode) {
    this.dragMode = mode;
    if (mode !== "none" && !this.started) {
      this.started = true;
      this.dispatch("start");
    }
  }

  private orthographic(): THREE.OrthographicCamera | null {
    const camera = this.camera as THREE.OrthographicCamera;
    return camera.isOrthographicCamera === true ? camera : null;
  }

  /** scale > 1 이면 멀어진다. */
  private zoomBy(scale: number) {
    const ortho = this.orthographic();
    if (ortho) {
      // Ortho: apparent size comes from frustum/zoom, not camera distance.
      ortho.zoom = THREE.MathUtils.clamp(ortho.zoom / scale, this.minZoom, this.maxZoom);
      ortho.updateProjectionMatrix();
      return;
    }
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
  }

  /** 누른 면을 화면 가운데·회전 중심으로. 방향·줌은 그대로다. */
  private pivotAt(event: PointerEvent) {
    const point = this.pickPivot?.(event);
    if (!point) return;
    this.offset.subVectors(point, this.target);
    this.target.copy(point);
    this.camera.position.add(this.offset);
    this.camera.lookAt(this.target);
    this.syncFromCamera();
    this.dispatch("start");
    this.dispatch("change");
    this.dispatch("end");
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
    let panScale: number;
    const ortho = this.orthographic();
    if (ortho) {
      // Match three.js OrbitControls orthographic pan (world units per pixel).
      panScale = ((ortho.top - ortho.bottom) / ortho.zoom / elementHeight) * this.panSpeed;
    } else {
      // Match three.js OrbitControls perspective pan scale (screen-space).
      const perspective = this.camera as THREE.PerspectiveCamera;
      const targetDistance =
        this.radius *
        Math.tan(THREE.MathUtils.degToRad(perspective.fov * 0.5));
      panScale = ((2 * targetDistance) / elementHeight) * this.panSpeed;
    }

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

export type ExternalViewGesture =
  | { type: "start" }
  | { type: "end" }
  | { type: "zoom"; dy: number }
  | { type: "move"; action: "rotate" | "pan"; dx: number; dy: number };

/** 페인트 레이어가 넘긴 화면 조작. */
export function applyExternalView(
  controls: ScreenSpaceOrbitControls | null,
  gesture: ExternalViewGesture,
) {
  if (!controls) return;
  if (gesture.type === "start") controls.beginExternal();
  else if (gesture.type === "end") controls.endExternal();
  else if (gesture.type === "zoom") controls.zoomByWheel(gesture.dy);
  else controls.dragBy(gesture.action, gesture.dx, gesture.dy);
}
