// AI 디자인 스캔 단계 — 메시 편집 포인터·선택·오버레이.
// - 2026-09-28: 다듬기는 브러시·올가미·조각으로 고르고 적용하면 지운다. 구멍은 테두리를 눌러 고르고 메운다. 조각은 끄는 동안 정점을 옮긴다.
// - 2026-09-28: 빈 곳을 끌면 화면이 돈다. 올가미만 왼쪽 끌기를 쓴다.
// related files:
// - web/frontend/src/shared/practice/scanMeshEdit.ts
// - web/frontend/src/shared/components/practice/OralScanOverlayViewer.tsx
import * as THREE from "three";

import {
  buildTopology,
  fillHole,
  holeLoops,
  pointInPolygon,
  refreshNormals,
  sculptStamp,
  trimSelected,
  verticesInBrush,
  vertexComponents,
  type BoundaryLoop,
  type MeshTopology,
  type ScanMeshEdit,
  type ScanMeshEditStatus,
} from "@/shared/practice/scanMeshEdit";

export type MeshEditTarget = {
  id: string;
  mesh: THREE.Mesh;
  /** 로드 때 스캔 칼라. 분석 색이 깔려 있어도 이 값을 쓴다. */
  scanColor: THREE.BufferAttribute | null;
};

/** 토폴로지를 바꾼 새 모양. origin[새 정점] = 옛 정점, 새로 만든 정점은 -1. */
export type ScanShapeEdit = {
  positions: Float32Array;
  index: Uint32Array;
  color: Float32Array | null;
  uv: Float32Array | null;
  origin: Int32Array;
};

export type MeshEditApplyResult =
  | { kind: "trimmed"; scans: number }
  | { kind: "filled"; holes: number; failed: number }
  | { kind: "empty" }
  | { kind: "whole" };

type Host = {
  dom: HTMLCanvasElement;
  overlay: HTMLElement;
  camera: () => THREE.OrthographicCamera | null;
  targets: () => MeshEditTarget[];
  unitToMm: () => number;
  /** 색인이 없거나 교차 배열인 스캔을 평범한 색인 메시로 바꾼다. 좌표는 그대로다. */
  ensureIndexed: (id: string) => void;
  onStatus: (status: ScanMeshEditStatus) => void;
  /** 스캔을 바꾸기 직전. 실행 취소 지점을 잡는다. */
  onBegin: () => void;
  replaceShape: (id: string, shape: ScanShapeEdit) => void;
  /** 조각 브러시를 뗐을 때. 정점은 이미 옮겨져 있다. */
  onSculpted: (ids: readonly string[]) => void;
};

type EntryState = {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  index: THREE.BufferAttribute;
  position: THREE.BufferAttribute;
  topo: MeshTopology;
  selected: Uint8Array;
  selectedCount: number;
  comps: ReturnType<typeof vertexComponents> | null;
  loops: BoundaryLoop[] | null;
  pickedLoops: Set<number>;
  overlay: THREE.Mesh | null;
  loopLines: THREE.Group | null;
};

const SELECT_RGB = 0x22d3ee;
const LOOP_RGB = 0xf97316;
const LOOP_PICKED_RGB = 0x0891b2;
const CLICK_SLOP_PX = 6;
const LOOP_PICK_PX = 14;
const STROKE_MS = 24;

function disposeTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((row) => row.dispose());
    else material?.dispose();
    if (mesh.geometry && !mesh.userData.sharedGeometry) mesh.geometry.dispose();
  });
}

function readTriple(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null | undefined) {
  if (!attr) return null;
  const out = new Float32Array(attr.count * 3);
  for (let i = 0; i < attr.count; i += 1) {
    out[i * 3] = attr.getX(i);
    out[i * 3 + 1] = attr.getY(i);
    out[i * 3 + 2] = attr.getZ(i);
  }
  return out;
}

function readPair(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null | undefined) {
  if (!attr) return null;
  const out = new Float32Array(attr.count * 2);
  for (let i = 0; i < attr.count; i += 1) {
    out[i * 2] = attr.getX(i);
    out[i * 2 + 1] = attr.getY(i);
  }
  return out;
}

function gather(src: Float32Array | null, keep: ArrayLike<number>, size: number) {
  if (!src) return null;
  const out = new Float32Array(keep.length * size);
  for (let i = 0; i < keep.length; i += 1) {
    const from = keep[i]! * size;
    for (let k = 0; k < size; k += 1) out[i * size + k] = src[from + k] ?? 0;
  }
  return out;
}

export class ScanMeshEditController {
  private spec: ScanMeshEdit | null = null;
  private readonly states = new Map<string, EntryState>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly ring: HTMLDivElement;
  private readonly lassoSvg: SVGSVGElement;
  private readonly lassoPath: SVGPolylineElement;
  private down: { x: number; y: number; pointerId: number } | null = null;
  private paint: { pointerId: number; at: number; pending: PointerEvent | null } | null = null;
  private lasso: { pointerId: number; points: number[] } | null = null;
  private sculpt: {
    pointerId: number;
    id: string;
    at: number;
    last: THREE.Vector3 | null;
    pending: PointerEvent | null;
  } | null = null;
  private flushTimer = 0;

  constructor(private readonly host: Host) {
    const ring = document.createElement("div");
    ring.style.cssText =
      "position:absolute;left:0;top:0;display:none;pointer-events:none;z-index:6;border-radius:9999px;border:1.5px solid rgb(8 145 178);background:rgba(34,211,238,0.08);transform:translate(-50%,-50%);";
    host.overlay.appendChild(ring);
    this.ring = ring;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute(
      "style",
      "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:6;display:none;",
    );
    const path = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    path.setAttribute("fill", "rgba(34,211,238,0.12)");
    path.setAttribute("stroke", "rgb(8 145 178)");
    path.setAttribute("stroke-width", "1.5");
    path.setAttribute("stroke-dasharray", "5 3");
    svg.appendChild(path);
    host.overlay.appendChild(svg);
    this.lassoSvg = svg;
    this.lassoPath = path;

    host.dom.addEventListener("pointerdown", this.onDown, true);
    host.dom.addEventListener("pointermove", this.onMove, true);
    host.dom.addEventListener("pointerup", this.onUp, true);
    host.dom.addEventListener("pointercancel", this.onUp, true);
    host.dom.addEventListener("pointerleave", this.onLeave);
  }

  dispose() {
    const dom = this.host.dom;
    dom.removeEventListener("pointerdown", this.onDown, true);
    dom.removeEventListener("pointermove", this.onMove, true);
    dom.removeEventListener("pointerup", this.onUp, true);
    dom.removeEventListener("pointercancel", this.onUp, true);
    dom.removeEventListener("pointerleave", this.onLeave);
    window.clearTimeout(this.flushTimer);
    for (const id of [...this.states.keys()]) this.dropState(id);
    this.ring.remove();
    this.lassoSvg.remove();
  }

  setSpec(next: ScanMeshEdit | null) {
    const prev = this.spec;
    this.spec = next;
    if (!next) {
      this.cancelGestures();
      for (const id of [...this.states.keys()]) this.dropState(id);
      this.ring.style.display = "none";
      this.emit();
      return;
    }
    if (prev && prev.tab !== next.tab) {
      for (const state of this.states.values()) this.clearSelection(state);
    }
    if (next.tab !== "fill") {
      for (const state of this.states.values()) this.removeLoopLines(state);
    } else {
      for (const target of this.host.targets()) {
        const state = this.stateOf(target);
        if (state) this.syncLoopLines(state);
      }
    }
    if (next.tab !== "trim") {
      for (const state of this.states.values()) this.syncOverlay(state);
    }
    if (next.tab === "trim" && next.trimTool !== "brush") this.ring.style.display = "none";
    if (next.tab === "fill") this.ring.style.display = "none";
    this.emit();
  }

  /** 스캔 좌표·토폴로지가 밖에서 바뀌었을 때(실행 취소, 정렬, 다시 열기). */
  refresh() {
    const alive = new Set(this.host.targets().map((row) => row.id));
    for (const [id, state] of this.states) {
      const target = this.host.targets().find((row) => row.id === id);
      const geometry = target?.mesh.geometry;
      if (
        !alive.has(id) ||
        !target ||
        geometry !== state.geometry ||
        geometry.getIndex() !== state.index ||
        geometry.getAttribute("position") !== state.position
      ) {
        this.dropState(id);
        continue;
      }
      state.loops = null;
      state.pickedLoops.clear();
      this.removeLoopLines(state);
    }
    if (this.spec?.tab === "fill") {
      for (const target of this.host.targets()) {
        const state = this.stateOf(target);
        if (state) this.syncLoopLines(state);
      }
    }
    this.emit();
  }

  invertSelection() {
    for (const target of this.visibleTargets()) {
      const state = this.stateOf(target);
      if (!state) continue;
      let count = 0;
      for (let v = 0; v < state.selected.length; v += 1) {
        const used = state.topo.triStart[v + 1]! > state.topo.triStart[v]!;
        const on = used && !state.selected[v];
        state.selected[v] = on ? 1 : 0;
        if (on) count += 1;
      }
      state.selectedCount = count;
      this.syncOverlay(state);
    }
    this.emit();
  }

  clearAll() {
    for (const state of this.states.values()) {
      this.clearSelection(state);
      state.pickedLoops.clear();
      this.syncLoopLines(state);
    }
    this.emit();
  }

  /** 스캔마다 가장 큰 조각을 빼고 떨어진 조각을 모두 고른다. */
  selectLoosePieces() {
    let any = false;
    for (const target of this.visibleTargets()) {
      const state = this.stateOf(target);
      if (!state) continue;
      const comps = this.compsOf(state);
      if (comps.sizes.length < 2) continue;
      let main = 0;
      comps.sizes.forEach((size, i) => {
        if (size > comps.sizes[main]!) main = i;
      });
      for (let v = 0; v < comps.comp.length; v += 1) {
        const c = comps.comp[v]!;
        if (c < 0 || c === main || state.selected[v]) continue;
        state.selected[v] = 1;
        state.selectedCount += 1;
        any = true;
      }
      this.syncOverlay(state);
    }
    this.emit();
    return any;
  }

  pickAllHoles(on: boolean) {
    for (const target of this.visibleTargets()) {
      const state = this.stateOf(target);
      if (!state) continue;
      const loops = this.loopsOf(state);
      state.pickedLoops.clear();
      if (on) loops.forEach((_, i) => state.pickedLoops.add(i));
      this.syncLoopLines(state);
    }
    this.emit();
  }

  apply(): MeshEditApplyResult {
    const spec = this.spec;
    if (!spec) return { kind: "empty" };
    if (spec.tab === "trim") return this.applyTrim();
    if (spec.tab === "fill") return this.applyFill();
    return { kind: "empty" };
  }

  private applyTrim(): MeshEditApplyResult {
    const jobs: Array<{ id: string; state: EntryState }> = [];
    for (const target of this.visibleTargets()) {
      const state = this.states.get(target.id);
      if (state && state.selectedCount > 0) jobs.push({ id: target.id, state });
    }
    if (jobs.length === 0) return { kind: "empty" };
    const shapes: Array<{ id: string; shape: ScanShapeEdit }> = [];
    for (const { id, state } of jobs) {
      const cut = trimSelected(state.topo, state.selected);
      if (!cut) continue;
      if (cut.index.length === 0) return { kind: "whole" };
      const target = this.host.targets().find((row) => row.id === id);
      const positions = state.position.array as Float32Array;
      const origin = new Int32Array(cut.keep.length);
      origin.set(cut.keep);
      shapes.push({
        id,
        shape: {
          positions: gather(positions, cut.keep, 3)!,
          index: cut.index,
          color: gather(readTriple(target?.scanColor), cut.keep, 3),
          uv: gather(readPair(state.geometry.getAttribute("uv")), cut.keep, 2),
          origin,
        },
      });
    }
    if (shapes.length === 0) return { kind: "empty" };
    this.host.onBegin();
    for (const { id, shape } of shapes) {
      this.dropState(id);
      this.host.replaceShape(id, shape);
    }
    this.emit();
    return { kind: "trimmed", scans: shapes.length };
  }

  private applyFill(): MeshEditApplyResult {
    const shapes: Array<{ id: string; shape: ScanShapeEdit }> = [];
    let filled = 0;
    let failed = 0;
    for (const target of this.visibleTargets()) {
      const state = this.states.get(target.id);
      if (!state || state.pickedLoops.size === 0 || !state.loops) continue;
      const positions = state.position.array as Float32Array;
      const color = readTriple(target.scanColor);
      const uv = readPair(state.geometry.getAttribute("uv"));
      const dims = 3 + (color ? 3 : 0) + (uv ? 2 : 0);
      const baseCount = state.position.count;
      const addPos: number[] = [];
      const addColor: number[] = [];
      const addUv: number[] = [];
      const addTris: number[] = [];
      for (const at of state.pickedLoops) {
        const loop = state.loops[at];
        if (!loop) continue;
        const n = loop.verts.length;
        const data = new Float32Array(n * dims);
        for (let i = 0; i < n; i += 1) {
          const v = loop.verts[i]!;
          let o = i * dims;
          data[o++] = positions[v * 3]!;
          data[o++] = positions[v * 3 + 1]!;
          data[o++] = positions[v * 3 + 2]!;
          if (color) {
            data[o++] = color[v * 3]!;
            data[o++] = color[v * 3 + 1]!;
            data[o++] = color[v * 3 + 2]!;
          }
          if (uv) {
            data[o++] = uv[v * 2]!;
            data[o++] = uv[v * 2 + 1]!;
          }
        }
        const patch = fillHole(data, dims);
        if (!patch) {
          failed += 1;
          continue;
        }
        const first = baseCount + addPos.length / 3;
        const added = patch.verts.length / dims;
        for (let i = 0; i < added; i += 1) {
          let o = i * dims;
          addPos.push(patch.verts[o++]!, patch.verts[o++]!, patch.verts[o++]!);
          if (color) addColor.push(patch.verts[o++]!, patch.verts[o++]!, patch.verts[o++]!);
          if (uv) addUv.push(patch.verts[o++]!, patch.verts[o++]!);
        }
        for (const ref of patch.tris) {
          addTris.push(ref < n ? loop.verts[ref]! : first + (ref - n));
        }
        filled += 1;
      }
      if (addTris.length === 0) continue;
      const total = baseCount + addPos.length / 3;
      const nextPos = new Float32Array(total * 3);
      nextPos.set(positions.subarray(0, baseCount * 3));
      nextPos.set(addPos, baseCount * 3);
      const nextIndex = new Uint32Array(state.topo.index.length + addTris.length);
      nextIndex.set(state.topo.index);
      nextIndex.set(addTris, state.topo.index.length);
      let nextColor: Float32Array | null = null;
      if (color) {
        nextColor = new Float32Array(total * 3);
        nextColor.set(color);
        nextColor.set(addColor, baseCount * 3);
      }
      let nextUv: Float32Array | null = null;
      if (uv) {
        nextUv = new Float32Array(total * 2);
        nextUv.set(uv);
        nextUv.set(addUv, baseCount * 2);
      }
      const origin = new Int32Array(total).fill(-1);
      for (let i = 0; i < baseCount; i += 1) origin[i] = i;
      shapes.push({
        id: target.id,
        shape: { positions: nextPos, index: nextIndex, color: nextColor, uv: nextUv, origin },
      });
    }
    if (shapes.length === 0) return failed > 0 ? { kind: "filled", holes: 0, failed } : { kind: "empty" };
    this.host.onBegin();
    for (const { id, shape } of shapes) {
      this.dropState(id);
      this.host.replaceShape(id, shape);
    }
    if (this.spec?.tab === "fill") {
      for (const target of this.host.targets()) {
        const state = this.stateOf(target);
        if (state) this.syncLoopLines(state);
      }
    }
    this.emit();
    return { kind: "filled", holes: filled, failed };
  }

  private cancelGestures() {
    this.down = null;
    this.paint = null;
    this.sculpt = null;
    this.lasso = null;
    this.lassoSvg.style.display = "none";
  }

  /** 숨긴 스캔은 고르지도 지우지도 않는다. */
  private visibleTargets() {
    return this.host.targets().filter((row) => row.mesh.visible);
  }

  private emit() {
    let selected = 0;
    let holes = 0;
    let selectedHoles = 0;
    for (const target of this.visibleTargets()) {
      const state = this.states.get(target.id);
      if (!state) continue;
      selected += state.selectedCount;
      holes += state.loops?.length ?? 0;
      selectedHoles += state.pickedLoops.size;
    }
    this.host.onStatus({ selected, holes, selectedHoles });
  }

  private scheduleEmit() {
    if (this.flushTimer) return;
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = 0;
      this.emit();
    }, 60);
  }

  private dropState(id: string) {
    const state = this.states.get(id);
    if (!state) return;
    this.removeOverlay(state);
    this.removeLoopLines(state);
    this.states.delete(id);
  }

  private stateOf(target: MeshEditTarget): EntryState | null {
    let geometry = target.mesh.geometry;
    const pos = geometry.getAttribute("position");
    if (
      !geometry.getIndex() ||
      !(pos instanceof THREE.BufferAttribute) ||
      !(pos.array instanceof Float32Array) ||
      pos.itemSize !== 3
    ) {
      this.dropState(target.id);
      this.host.ensureIndexed(target.id);
      geometry = target.mesh.geometry;
    }
    const index = geometry.getIndex();
    const position = geometry.getAttribute("position");
    if (!index || !(position instanceof THREE.BufferAttribute)) return null;
    const hit = this.states.get(target.id);
    if (
      hit &&
      hit.geometry === geometry &&
      hit.index === index &&
      hit.position === position &&
      hit.mesh === target.mesh
    ) {
      return hit;
    }
    if (hit) this.dropState(target.id);
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    const indexArray =
      index.array instanceof Uint32Array ? index.array : Uint32Array.from(index.array as ArrayLike<number>);
    const state: EntryState = {
      mesh: target.mesh,
      geometry,
      index,
      position,
      topo: buildTopology(indexArray, position.count),
      selected: new Uint8Array(position.count),
      selectedCount: 0,
      comps: null,
      loops: null,
      pickedLoops: new Set(),
      overlay: null,
      loopLines: null,
    };
    this.states.set(target.id, state);
    return state;
  }

  private compsOf(state: EntryState) {
    if (!state.comps) state.comps = vertexComponents(state.topo);
    return state.comps;
  }

  private loopsOf(state: EntryState) {
    if (!state.loops) {
      state.loops = holeLoops(
        state.topo,
        state.position.array as Float32Array,
        this.compsOf(state).comp,
      );
    }
    return state.loops;
  }

  private clearSelection(state: EntryState) {
    if (state.selectedCount === 0) return;
    state.selected.fill(0);
    state.selectedCount = 0;
    this.syncOverlay(state);
  }

  private removeOverlay(state: EntryState) {
    if (!state.overlay) return;
    state.mesh.remove(state.overlay);
    disposeTree(state.overlay);
    state.overlay.geometry.dispose();
    state.overlay = null;
  }

  private syncOverlay(state: EntryState) {
    const show = this.spec?.tab === "trim" && state.selectedCount > 0;
    if (!show) {
      this.removeOverlay(state);
      return;
    }
    const index = state.topo.index;
    const sel = state.selected;
    if (!state.overlay) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", state.position);
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(index.length), 1));
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: SELECT_RGB,
          transparent: true,
          opacity: 0.78,
          side: THREE.DoubleSide,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
          toneMapped: false,
        }),
      );
      mesh.userData.sharedGeometry = true;
      mesh.userData.meshEditOverlay = true;
      mesh.renderOrder = 5;
      mesh.frustumCulled = false;
      mesh.raycast = () => {};
      state.mesh.add(mesh);
      state.overlay = mesh;
    }
    // 색인 버퍼는 한 번 잡아 두고 채운 길이만 그린다. 칠할 때마다 새로 만들면 GPU 버퍼가 쌓인다.
    const attr = state.overlay.geometry.getIndex()!;
    const out = attr.array as Uint32Array;
    let count = 0;
    for (let t = 0; t + 2 < index.length; t += 3) {
      const a = index[t]!;
      const b = index[t + 1]!;
      const c = index[t + 2]!;
      if (!sel[a] && !sel[b] && !sel[c]) continue;
      out[count] = a;
      out[count + 1] = b;
      out[count + 2] = c;
      count += 3;
    }
    attr.needsUpdate = true;
    state.overlay.geometry.setDrawRange(0, count);
  }

  private removeLoopLines(state: EntryState) {
    if (!state.loopLines) return;
    state.mesh.remove(state.loopLines);
    disposeTree(state.loopLines);
    state.loopLines = null;
  }

  private syncLoopLines(state: EntryState) {
    this.removeLoopLines(state);
    if (this.spec?.tab !== "fill") return;
    const loops = this.loopsOf(state);
    if (loops.length === 0) return;
    const positions = state.position.array as Float32Array;
    const normals = state.geometry.getAttribute("normal") as THREE.BufferAttribute | undefined;
    const lift = 0.04 / Math.max(this.host.unitToMm(), 1e-9);
    const group = new THREE.Group();
    group.userData.meshEditLoops = true;
    group.renderOrder = 6;
    loops.forEach((loop, i) => {
      const pts = new Float32Array(loop.verts.length * 3);
      loop.verts.forEach((v, k) => {
        const nx = normals ? normals.getX(v) : 0;
        const ny = normals ? normals.getY(v) : 0;
        const nz = normals ? normals.getZ(v) : 0;
        pts[k * 3] = positions[v * 3]! + nx * lift;
        pts[k * 3 + 1] = positions[v * 3 + 1]! + ny * lift;
        pts[k * 3 + 2] = positions[v * 3 + 2]! + nz * lift;
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(pts, 3));
      const picked = state.pickedLoops.has(i);
      const line = new THREE.LineLoop(
        geometry,
        new THREE.LineBasicMaterial({
          color: picked ? LOOP_PICKED_RGB : LOOP_RGB,
          depthTest: !picked,
          transparent: true,
          opacity: picked ? 1 : 0.95,
          toneMapped: false,
        }),
      );
      line.renderOrder = picked ? 8 : 6;
      line.frustumCulled = false;
      line.raycast = () => {};
      group.add(line);
    });
    state.mesh.add(group);
    state.loopLines = group;
  }

  private aim(event: PointerEvent) {
    const camera = this.host.camera();
    if (!camera) return null;
    const rect = this.host.dom.getBoundingClientRect();
    this.ndc.set(
      ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
      -((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, camera);
    return camera;
  }

  private hitTargets(event: PointerEvent, onlyId?: string) {
    if (!this.aim(event)) return null;
    const targets = this.host
      .targets()
      .filter((row) => row.mesh.visible && (!onlyId || row.id === onlyId));
    if (targets.length === 0) return null;
    const hits = this.raycaster.intersectObjects(
      targets.map((row) => row.mesh),
      false,
    );
    const hit = hits[0];
    if (!hit || !hit.face) return null;
    const target = targets.find((row) => row.mesh === hit.object);
    if (!target) return null;
    return { target, hit };
  }

  /** 화면 1px당 기하 단위. */
  private worldPerPx() {
    const camera = this.host.camera();
    const rect = this.host.dom.getBoundingClientRect();
    if (!camera) return 1;
    return (camera.top - camera.bottom) / Math.max(camera.zoom, 1e-6) / Math.max(rect.height, 1);
  }

  private brushRadius() {
    const spec = this.spec;
    if (!spec) return 0;
    const mm = spec.tab === "sculpt" ? spec.sculptBrushMm : spec.trimBrushMm;
    return mm / 2 / Math.max(this.host.unitToMm(), 1e-9);
  }

  private usesRing() {
    const spec = this.spec;
    if (!spec) return false;
    return spec.tab === "sculpt" || (spec.tab === "trim" && spec.trimTool === "brush");
  }

  private moveRing(event: PointerEvent) {
    if (!this.usesRing()) {
      this.ring.style.display = "none";
      return;
    }
    const overlayRect = this.host.overlay.getBoundingClientRect();
    const px = this.brushRadius() / this.worldPerPx();
    this.ring.style.display = "block";
    this.ring.style.width = `${px * 2}px`;
    this.ring.style.height = `${px * 2}px`;
    this.ring.style.left = `${event.clientX - overlayRect.left}px`;
    this.ring.style.top = `${event.clientY - overlayRect.top}px`;
  }

  private grab(event: PointerEvent) {
    try {
      this.host.dom.setPointerCapture(event.pointerId);
    } catch {
      // noop
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  private release(event: PointerEvent) {
    try {
      this.host.dom.releasePointerCapture(event.pointerId);
    } catch {
      // noop
    }
  }

  private paintAt(event: PointerEvent) {
    const spec = this.spec;
    if (!spec) return;
    const found = this.hitTargets(event);
    if (!found) return;
    const state = this.stateOf(found.target);
    if (!state) return;
    const local = found.target.mesh.worldToLocal(found.hit.point.clone());
    const facing = found.hit.face!.normal;
    const normals = state.geometry.getAttribute("normal") as THREE.BufferAttribute | undefined;
    const picked = verticesInBrush(
      state.position.array as Float32Array,
      normals?.array instanceof Float32Array ? normals.array : null,
      [local.x, local.y, local.z],
      [facing.x, facing.y, facing.z],
      this.brushRadius(),
    );
    const on = spec.selectMode === "add" ? 1 : 0;
    let changed = false;
    for (const v of picked) {
      if (state.selected[v] === on) continue;
      state.selected[v] = on;
      state.selectedCount += on ? 1 : -1;
      changed = true;
    }
    if (!changed) return;
    this.syncOverlay(state);
    this.scheduleEmit();
  }

  private selectPiece(event: PointerEvent) {
    const spec = this.spec;
    if (!spec) return;
    const found = this.hitTargets(event);
    if (!found?.hit.face) return;
    const state = this.stateOf(found.target);
    if (!state) return;
    const comps = this.compsOf(state);
    const seed = comps.comp[found.hit.face.a] ?? -1;
    if (seed < 0) return;
    const on = spec.selectMode === "add" ? 1 : 0;
    for (let v = 0; v < comps.comp.length; v += 1) {
      if (comps.comp[v] !== seed || state.selected[v] === on) continue;
      state.selected[v] = on;
      state.selectedCount += on ? 1 : -1;
    }
    this.syncOverlay(state);
    this.emit();
  }

  private finishLasso() {
    const lasso = this.lasso;
    this.lasso = null;
    this.lassoSvg.style.display = "none";
    const spec = this.spec;
    const camera = this.host.camera();
    if (!lasso || !spec || !camera || lasso.points.length < 6) return;
    const rect = this.host.dom.getBoundingClientRect();
    const w = Math.max(rect.width, 1);
    const h = Math.max(rect.height, 1);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < lasso.points.length; i += 2) {
      minX = Math.min(minX, lasso.points[i]!);
      maxX = Math.max(maxX, lasso.points[i]!);
      minY = Math.min(minY, lasso.points[i + 1]!);
      maxY = Math.max(maxY, lasso.points[i + 1]!);
    }
    camera.updateMatrixWorld();
    const view = new THREE.Vector3();
    camera.getWorldDirection(view);
    const on = spec.selectMode === "add" ? 1 : 0;
    for (const target of this.host.targets()) {
      if (!target.mesh.visible) continue;
      const state = this.stateOf(target);
      if (!state) continue;
      target.mesh.updateWorldMatrix(true, false);
      const m = new THREE.Matrix4()
        .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
        .multiply(target.mesh.matrixWorld);
      const e = m.elements;
      const localView = view
        .clone()
        .transformDirection(target.mesh.matrixWorld.clone().invert());
      const positions = state.position.array as Float32Array;
      const normals = state.geometry.getAttribute("normal") as THREE.BufferAttribute | undefined;
      const nArr = normals?.array instanceof Float32Array ? normals.array : null;
      let changed = false;
      for (let v = 0; v < state.position.count; v += 1) {
        if (nArr) {
          const dot =
            nArr[v * 3]! * localView.x + nArr[v * 3 + 1]! * localView.y + nArr[v * 3 + 2]! * localView.z;
          if (dot > 0.05) continue;
        }
        const x = positions[v * 3]!;
        const y = positions[v * 3 + 1]!;
        const z = positions[v * 3 + 2]!;
        const cw = e[3]! * x + e[7]! * y + e[11]! * z + e[15]! || 1;
        const nx = (e[0]! * x + e[4]! * y + e[8]! * z + e[12]!) / cw;
        const ny = (e[1]! * x + e[5]! * y + e[9]! * z + e[13]!) / cw;
        const sx = ((nx + 1) / 2) * w;
        const sy = ((1 - ny) / 2) * h;
        if (sx < minX || sx > maxX || sy < minY || sy > maxY) continue;
        if (!pointInPolygon(sx, sy, lasso.points)) continue;
        if (state.selected[v] === on) continue;
        state.selected[v] = on;
        state.selectedCount += on ? 1 : -1;
        changed = true;
      }
      if (changed) this.syncOverlay(state);
    }
    this.emit();
  }

  private pickLoop(event: PointerEvent) {
    const camera = this.host.camera();
    if (!camera) return;
    const rect = this.host.dom.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const w = Math.max(rect.width, 1);
    const h = Math.max(rect.height, 1);
    camera.updateMatrixWorld();
    let best: { state: EntryState; at: number; d: number } | null = null;
    const tmp = new THREE.Vector3();
    for (const target of this.host.targets()) {
      if (!target.mesh.visible) continue;
      const state = this.stateOf(target);
      if (!state) continue;
      const loops = this.loopsOf(state);
      const positions = state.position.array as Float32Array;
      target.mesh.updateWorldMatrix(true, false);
      const world = target.mesh.matrixWorld;
      loops.forEach((loop, at) => {
        let prevX = 0;
        let prevY = 0;
        const n = loop.verts.length;
        for (let k = 0; k <= n; k += 1) {
          const v = loop.verts[k % n]!;
          tmp.set(positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!)
            .applyMatrix4(world)
            .project(camera);
          const sx = ((tmp.x + 1) / 2) * w;
          const sy = ((1 - tmp.y) / 2) * h;
          if (k > 0) {
            const dx = sx - prevX;
            const dy = sy - prevY;
            const len2 = dx * dx + dy * dy;
            const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - prevX) * dx + (py - prevY) * dy) / len2)) : 0;
            const d = Math.hypot(px - (prevX + dx * t), py - (prevY + dy * t));
            if (d < LOOP_PICK_PX && (!best || d < best.d)) best = { state, at, d };
          }
          prevX = sx;
          prevY = sy;
        }
      });
    }
    if (!best) return;
    const { state, at } = best as { state: EntryState; at: number; d: number };
    if (state.pickedLoops.has(at)) state.pickedLoops.delete(at);
    else state.pickedLoops.add(at);
    this.syncLoopLines(state);
    this.emit();
  }

  private stampSculpt(event: PointerEvent) {
    const stroke = this.sculpt;
    const spec = this.spec;
    if (!stroke || !spec) return;
    const found = this.hitTargets(event, stroke.id);
    if (!found) return;
    const state = this.stateOf(found.target);
    if (!state) return;
    const local = found.target.mesh.worldToLocal(found.hit.point.clone());
    const radius = this.brushRadius();
    if (stroke.last && stroke.last.distanceTo(local) < radius * 0.2) return;
    stroke.last = local;
    const normals = state.geometry.getAttribute("normal") as THREE.BufferAttribute;
    if (!(normals?.array instanceof Float32Array)) return;
    const facing = found.hit.face!.normal;
    const positions = state.position.array as Float32Array;
    const moved = sculptStamp({
      topo: state.topo,
      positions,
      normals: normals.array,
      center: [local.x, local.y, local.z],
      facing: [facing.x, facing.y, facing.z],
      radius,
      strength: spec.strength,
      tool: spec.sculptTool,
    });
    if (moved.length === 0) return;
    refreshNormals(state.topo, positions, normals.array, moved);
    state.position.needsUpdate = true;
    normals.needsUpdate = true;
  }

  private readonly onDown = (event: PointerEvent) => {
    const spec = this.spec;
    if (!spec || event.button !== 0) return;
    if (event.shiftKey) return;
    // 색인 없는 스캔은 여기서 색인 메시로 바뀐다. 광선 검사 전에 해 두어야 면 번호가 맞는다.
    for (const target of this.host.targets()) this.stateOf(target);
    if (spec.tab === "trim" && spec.trimTool === "lasso") {
      const rect = this.host.dom.getBoundingClientRect();
      this.lasso = {
        pointerId: event.pointerId,
        points: [event.clientX - rect.left, event.clientY - rect.top],
      };
      this.lassoPath.setAttribute("points", "");
      this.lassoSvg.style.display = "block";
      this.grab(event);
      return;
    }
    if (spec.tab === "trim" && spec.trimTool === "brush") {
      if (!this.hitTargets(event)) return;
      this.paint = { pointerId: event.pointerId, at: performance.now(), pending: null };
      this.grab(event);
      this.paintAt(event);
      return;
    }
    if (spec.tab === "sculpt") {
      const found = this.hitTargets(event);
      if (!found || !this.stateOf(found.target)) return;
      this.host.onBegin();
      this.sculpt = {
        pointerId: event.pointerId,
        id: found.target.id,
        at: performance.now(),
        last: null,
        pending: null,
      };
      this.grab(event);
      this.stampSculpt(event);
      return;
    }
    this.down = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  };

  private readonly onMove = (event: PointerEvent) => {
    if (!this.spec) return;
    this.moveRing(event);
    if (this.lasso && event.pointerId === this.lasso.pointerId) {
      const rect = this.host.dom.getBoundingClientRect();
      const pts = this.lasso.points;
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const lx = pts[pts.length - 2]!;
      const ly = pts[pts.length - 1]!;
      if (Math.hypot(x - lx, y - ly) >= 3) {
        pts.push(x, y);
        const overlayRect = this.host.overlay.getBoundingClientRect();
        const ox = rect.left - overlayRect.left;
        const oy = rect.top - overlayRect.top;
        const list: string[] = [];
        for (let i = 0; i < pts.length; i += 2) list.push(`${pts[i]! + ox},${pts[i + 1]! + oy}`);
        this.lassoPath.setAttribute("points", list.join(" "));
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (this.paint && event.pointerId === this.paint.pointerId) {
      const now = performance.now();
      if (now - this.paint.at >= STROKE_MS) {
        this.paint.at = now;
        this.paintAt(event);
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (this.sculpt && event.pointerId === this.sculpt.pointerId) {
      const now = performance.now();
      if (now - this.sculpt.at >= STROKE_MS) {
        this.sculpt.at = now;
        this.stampSculpt(event);
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  private readonly onUp = (event: PointerEvent) => {
    if (this.lasso && event.pointerId === this.lasso.pointerId) {
      this.release(event);
      if (event.type === "pointercancel") {
        this.lasso = null;
        this.lassoSvg.style.display = "none";
      } else {
        this.finishLasso();
      }
      event.stopImmediatePropagation();
      return;
    }
    if (this.paint && event.pointerId === this.paint.pointerId) {
      this.release(event);
      this.paint = null;
      this.emit();
      event.stopImmediatePropagation();
      return;
    }
    if (this.sculpt && event.pointerId === this.sculpt.pointerId) {
      const id = this.sculpt.id;
      this.release(event);
      this.sculpt = null;
      const state = this.states.get(id);
      if (state) {
        state.geometry.computeBoundingBox();
        state.geometry.computeBoundingSphere();
      }
      this.host.onSculpted([id]);
      event.stopImmediatePropagation();
      return;
    }
    const start = this.down;
    this.down = null;
    const spec = this.spec;
    if (!start || !spec || event.pointerId !== start.pointerId || event.type === "pointercancel") return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP_PX) return;
    if (spec.tab === "trim" && spec.trimTool === "piece") this.selectPiece(event);
    else if (spec.tab === "fill") this.pickLoop(event);
  };

  private readonly onLeave = () => {
    this.ring.style.display = "none";
  };
}
