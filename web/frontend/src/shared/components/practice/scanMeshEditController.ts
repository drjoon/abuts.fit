// AI 디자인 스캔 단계 — 메시 편집 포인터·선택·오버레이.
// - 2026-09-28: 다듬기는 브러시·올가미·조각으로 바로 지운다. 구멍은 테두리를 눌러 고르고 메운다. 조각은 끄는 동안 정점을 옮긴다.
// - 2026-09-28: 브러시·조각은 스캔 위 왼쪽 끌기, 올가미는 화면 왼쪽 끌기. 왼쪽은 뷰 회전에 쓰지 않는다.
// - 2026-10-04: 다듬기 브러시는 손을 떼면 테두리를 고르고 안쪽 구멍을 잇는다.
// - 2026-09-30: 가상 발치. 치아를 누르면 경계를 찾고, 브러시·넓히기·좁히기로 고친 뒤 적용하면 지우고 발치와를 메운다.
// related files:
// - web/frontend/src/shared/practice/scanMeshEdit.ts
// - web/frontend/src/shared/practice/virtualExtraction.ts
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
  trimSelectedFair,
  verticesInBrush,
  vertexComponents,
  type BoundaryLoop,
  type ExtractAction,
  type ExtractToothStatus,
  type MeshTopology,
  type ScanMeshEdit,
  type ScanMeshEditStatus,
} from "@/shared/practice/scanMeshEdit";
import { withDoubleSidePick } from "@/shared/three/backFaceShell";
import {
  closeMask,
  growToothField,
  maskComponentCount,
  maskRim,
  maskTouchesMeshBoundary,
  segmentTooth,
  toothBorderSegments,
  type ToothSegment,
} from "@/shared/practice/virtualExtraction";

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
  | { kind: "extracted"; teeth: number }
  /** edge: 경계가 스캔 가장자리에 닿음. fill: 발치와를 메우지 못함. 스캔은 그대로다. */
  | { kind: "extractFailed"; reason: "edge" | "fill" }
  | { kind: "empty" }
  | { kind: "whole" };

type ExtractTooth = {
  key: string;
  serial: number;
  seg: ToothSegment;
  /** 처음 찾은 경계. 되돌리기에 쓴다. */
  auto: Float32Array;
};

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
  /** 다듬기 획이 끝났을 때. 지웠든 되돌렸든 실행 취소를 닫는다. */
  onCommitted: () => void;
  onResult: (result: MeshEditApplyResult) => void;
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
  teeth: ExtractTooth[];
  toothOverlay: THREE.Mesh | null;
  toothLines: THREE.Group | null;
  /** 다듬기 획 동안 숨긴 삼각형. 손을 떼면 정점을 줄인다. */
  trimGone: Uint8Array | null;
  trimSlot: Int32Array | null;
  trimAt: Int32Array | null;
  trimLive: number;
};

const TOOTH_RGB = 0x38bdf8;
const TOOTH_LINE_RGB = 0x22d3ee;
const TOOTH_ACTIVE_LINE_RGB = 0x0369a1;
/** 적용 때 경계를 이만큼 넓혔다 좁혀 톱니와 치아 사이 띠를 없앤다. */
const EXTRACT_CLOSE_MM = 0.4;
/** 넓히기·좁히기 한 번. */
const EXTRACT_GROW_MM = 0.3;
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

/** 고리마다 fillHole로 메워 새 정점·삼각형을 붙인다. 색·UV도 같이 늘린다. */
function appendHoleFills(args: {
  positions: Float32Array;
  color: Float32Array | null;
  uv: Float32Array | null;
  index: Uint32Array;
  loops: readonly BoundaryLoop[];
}) {
  const { positions, color, uv, index, loops } = args;
  const dims = 3 + (color ? 3 : 0) + (uv ? 2 : 0);
  const baseCount = positions.length / 3;
  const addPos: number[] = [];
  const addColor: number[] = [];
  const addUv: number[] = [];
  const addTris: number[] = [];
  let filled = 0;
  let failed = 0;
  for (const loop of loops) {
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
  const total = baseCount + addPos.length / 3;
  const nextPos = new Float32Array(total * 3);
  nextPos.set(positions);
  nextPos.set(addPos, baseCount * 3);
  const nextIndex = new Uint32Array(index.length + addTris.length);
  nextIndex.set(index);
  nextIndex.set(addTris, index.length);
  let nextColor: Float32Array | null = null;
  if (color) {
    nextColor = new Float32Array(total * 3);
    nextColor.set(color.subarray(0, baseCount * 3));
    nextColor.set(addColor, baseCount * 3);
  }
  let nextUv: Float32Array | null = null;
  if (uv) {
    nextUv = new Float32Array(total * 2);
    nextUv.set(uv.subarray(0, baseCount * 2));
    nextUv.set(addUv, baseCount * 2);
  }
  return { positions: nextPos, index: nextIndex, color: nextColor, uv: nextUv, filled, failed };
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
  private paint: {
    pointerId: number;
    at: number;
    pending: PointerEvent | null;
    began: boolean;
  } | null = null;
  private lasso: { pointerId: number; points: number[] } | null = null;
  private sculpt: {
    pointerId: number;
    id: string;
    at: number;
    last: THREE.Vector3 | null;
    pending: PointerEvent | null;
  } | null = null;
  private toothSerial = 0;
  private activeTooth: string | null = null;
  private findTimer = 0;
  private readonly findNote: HTMLDivElement;

  constructor(private readonly host: Host) {
    const note = document.createElement("div");
    note.textContent = "경계를 찾는 중…";
    note.style.cssText =
      "position:absolute;left:0;top:0;display:none;pointer-events:none;z-index:7;transform:translate(-50%,-140%);padding:2px 8px;border-radius:6px;font-size:11px;color:#fff;background:rgba(3,105,161,0.9);white-space:nowrap;";
    host.overlay.appendChild(note);
    this.findNote = note;
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
    window.clearTimeout(this.findTimer);
    for (const id of [...this.states.keys()]) this.dropState(id);
    this.ring.remove();
    this.lassoSvg.remove();
    this.findNote.remove();
  }

  setSpec(next: ScanMeshEdit | null) {
    const prev = this.spec;
    this.spec = next;
    if (!next) {
      this.cancelGestures();
      this.cancelFind();
      for (const id of [...this.states.keys()]) this.dropState(id);
      this.ring.style.display = "none";
      this.emit();
      return;
    }
    if (prev && prev.tab !== next.tab) {
      this.cancelFind();
      for (const state of this.states.values()) {
        this.clearSelection(state);
        this.clearTeeth(state);
      }
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
    if (next.tab === "extract" && next.extractTool !== "brush") this.ring.style.display = "none";
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

  clearAll() {
    for (const state of this.states.values()) {
      this.restoreTrimPreview(state);
      this.clearSelection(state);
      this.clearTeeth(state);
      state.pickedLoops.clear();
      this.syncLoopLines(state);
    }
    this.emit();
  }

  extract(action: ExtractAction) {
    if (action.kind === "activate") {
      this.activeTooth = action.key;
      for (const state of this.states.values()) this.syncTeeth(state);
      this.emit();
      return;
    }
    if (action.kind === "remove") {
      for (const state of this.states.values()) {
        const at = state.teeth.findIndex((row) => row.key === action.key);
        if (at < 0) continue;
        state.teeth.splice(at, 1);
        this.syncTeeth(state);
      }
      if (this.activeTooth === action.key) this.activeTooth = null;
      this.emit();
      return;
    }
    const found = this.findActiveTooth();
    if (!found) return;
    const { state, tooth } = found;
    if (action.kind === "restore") {
      tooth.seg.field.set(tooth.auto);
    } else {
      const rings = Math.max(
        1,
        Math.round(EXTRACT_GROW_MM / Math.max(this.host.unitToMm(), 1e-9) / Math.max(tooth.seg.edge, 1e-9)),
      );
      growToothField(state.topo, tooth.seg, rings, action.kind === "grow");
    }
    this.syncTeeth(state);
    this.emit();
  }

  /** 스캔마다 가장 큰 조각을 빼고 떨어진 조각을 바로 지운다. */
  trimLoosePieces(): MeshEditApplyResult {
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
    }
    if (!any) return { kind: "empty" };
    const result = this.applyTrim();
    this.host.onResult(result);
    return result;
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
    if (spec.tab === "fill") return this.applyFill();
    if (spec.tab === "extract") return this.applyExtract();
    return { kind: "empty" };
  }

  private applyExtract(): MeshEditApplyResult {
    const jobs: Array<{ target: MeshEditTarget; state: EntryState }> = [];
    for (const target of this.visibleTargets()) {
      const state = this.states.get(target.id);
      if (state && state.teeth.length > 0) jobs.push({ target, state });
    }
    if (jobs.length === 0) return { kind: "empty" };
    const unit = Math.max(this.host.unitToMm(), 1e-9);
    const shapes: Array<{ id: string; shape: ScanShapeEdit }> = [];
    let teeth = 0;
    for (const { target, state } of jobs) {
      const mask = this.teethMask(state);
      const edge =
        state.teeth.reduce((sum, row) => sum + row.seg.edge, 0) / Math.max(state.teeth.length, 1);
      closeMask(state.topo, mask, Math.max(1, Math.round(EXTRACT_CLOSE_MM / unit / Math.max(edge, 1e-9))));
      if (maskTouchesMeshBoundary(state.topo, mask)) return { kind: "extractFailed", reason: "edge" };
      const sockets = maskComponentCount(state.topo, mask);
      const rim = maskRim(state.topo, mask);
      const cut = trimSelected(state.topo, mask);
      if (!cut) continue;
      if (cut.index.length === 0) return { kind: "whole" };
      const positions = gather(state.position.array as Float32Array, cut.keep, 3)!;
      const color = gather(readTriple(target.scanColor), cut.keep, 3);
      const uv = gather(readPair(state.geometry.getAttribute("uv")), cut.keep, 2);
      const topo = buildTopology(cut.index, cut.keep.length);
      const loops = holeLoops(topo, positions, vertexComponents(topo).comp).filter((loop) => {
        let onRim = 0;
        for (const v of loop.verts) if (rim[cut.keep[v]!]) onRim += 1;
        return onRim * 2 >= loop.verts.length;
      });
      if (loops.length < sockets) return { kind: "extractFailed", reason: "fill" };
      const patched = appendHoleFills({ positions, color, uv, index: cut.index, loops });
      if (patched.failed > 0) return { kind: "extractFailed", reason: "fill" };
      const origin = new Int32Array(patched.positions.length / 3).fill(-1);
      origin.set(cut.keep);
      shapes.push({
        id: target.id,
        shape: {
          positions: patched.positions,
          index: patched.index,
          color: patched.color,
          uv: patched.uv,
          origin,
        },
      });
      teeth += state.teeth.length;
    }
    if (shapes.length === 0) return { kind: "empty" };
    this.host.onBegin();
    for (const { id, shape } of shapes) {
      this.dropState(id);
      this.host.replaceShape(id, shape);
    }
    this.activeTooth = null;
    this.emit();
    return { kind: "extracted", teeth };
  }

  private applyTrim(begun = false): MeshEditApplyResult {
    const jobs: Array<{ id: string; state: EntryState }> = [];
    for (const target of this.visibleTargets()) {
      const state = this.states.get(target.id);
      if (state && state.selectedCount > 0) jobs.push({ id: target.id, state });
    }
    if (jobs.length === 0) return { kind: "empty" };
    const shapes: Array<{ id: string; shape: ScanShapeEdit }> = [];
    const fillInterior = this.spec?.trimTool === "brush";
    for (const { id, state } of jobs) {
      const target = this.host.targets().find((row) => row.id === id);
      const cut = trimSelectedFair({
        positions: state.position.array as Float32Array,
        index: state.topo.index,
        selected: state.selected,
        color: readTriple(target?.scanColor),
        uv: readPair(state.geometry.getAttribute("uv")),
      });
      if (!cut) continue;
      if (cut.index.length === 0) {
        this.restoreTrimAll();
        for (const row of jobs) {
          row.state.selected.fill(0);
          row.state.selectedCount = 0;
        }
        return { kind: "whole" };
      }
      let positions = cut.positions;
      let nextIndex = cut.index;
      let color = cut.color;
      let uv = cut.uv;
      if (fillInterior) {
        const topo = buildTopology(nextIndex, positions.length / 3);
        const loops = holeLoops(topo, positions, vertexComponents(topo).comp).filter((loop) => {
          let onRim = 0;
          for (const v of loop.verts) if (cut.cutRim[v]) onRim += 1;
          return onRim * 2 >= loop.verts.length;
        });
        if (loops.length > 0) {
          const patched = appendHoleFills({ positions, color, uv, index: nextIndex, loops });
          if (patched.filled > 0) {
            positions = patched.positions;
            nextIndex = patched.index;
            color = patched.color;
            uv = patched.uv;
          }
        }
      }
      const origin = new Int32Array(positions.length / 3).fill(-1);
      origin.set(cut.origin);
      shapes.push({
        id,
        shape: {
          positions,
          index: nextIndex,
          color,
          uv,
          origin,
        },
      });
    }
    if (shapes.length === 0) {
      this.restoreTrimAll();
      return { kind: "empty" };
    }
    if (!begun) this.host.onBegin();
    for (const { id, shape } of shapes) {
      this.dropState(id);
      this.host.replaceShape(id, shape);
    }
    this.emit();
    this.host.onCommitted();
    return { kind: "trimmed", scans: shapes.length };
  }

  private applyFill(): MeshEditApplyResult {
    const shapes: Array<{ id: string; shape: ScanShapeEdit }> = [];
    let filled = 0;
    let failed = 0;
    for (const target of this.visibleTargets()) {
      const state = this.states.get(target.id);
      if (!state || state.pickedLoops.size === 0 || !state.loops) continue;
      const loops: BoundaryLoop[] = [];
      for (const at of state.pickedLoops) {
        const loop = state.loops[at];
        if (loop) loops.push(loop);
      }
      const baseCount = state.position.count;
      const patched = appendHoleFills({
        positions: (state.position.array as Float32Array).subarray(0, baseCount * 3),
        color: readTriple(target.scanColor),
        uv: readPair(state.geometry.getAttribute("uv")),
        index: state.topo.index,
        loops,
      });
      filled += patched.filled;
      failed += patched.failed;
      if (patched.filled === 0) continue;
      const total = patched.positions.length / 3;
      const origin = new Int32Array(total).fill(-1);
      for (let i = 0; i < baseCount; i += 1) origin[i] = i;
      shapes.push({
        id: target.id,
        shape: {
          positions: patched.positions,
          index: patched.index,
          color: patched.color,
          uv: patched.uv,
          origin,
        },
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
    const began = Boolean(this.paint?.began && this.spec?.tab === "trim");
    if (this.paint && this.spec?.tab === "trim") this.restoreTrimAll();
    this.down = null;
    this.paint = null;
    this.sculpt = null;
    this.lasso = null;
    this.lassoSvg.style.display = "none";
    if (began) this.host.onCommitted();
  }

  /** 숨긴 스캔은 고르지도 지우지도 않는다. */
  private visibleTargets() {
    return this.host.targets().filter((row) => row.mesh.visible);
  }

  private emit() {
    let selected = 0;
    let holes = 0;
    let selectedHoles = 0;
    const all: ExtractTooth[] = [];
    for (const target of this.visibleTargets()) {
      const state = this.states.get(target.id);
      if (!state) continue;
      selected += state.selectedCount;
      holes += state.loops?.length ?? 0;
      selectedHoles += state.pickedLoops.size;
      all.push(...state.teeth);
    }
    all.sort((a, b) => a.serial - b.serial);
    if (all.length === 0) this.toothSerial = 0;
    if (!all.some((row) => row.key === this.activeTooth)) {
      const next = all[all.length - 1]?.key ?? null;
      if (next !== this.activeTooth) {
        this.activeTooth = next;
        for (const state of this.states.values()) this.syncTeeth(state);
      }
    }
    const teeth: ExtractToothStatus[] = all.map((row) => ({
      key: row.key,
      label: `#${row.serial}`,
      active: row.key === this.activeTooth,
      weak: row.seg.weak,
    }));
    this.host.onStatus({
      selected,
      holes,
      selectedHoles,
      teeth,
      finding: this.findTimer !== 0,
    });
  }

  private cancelFind() {
    if (this.findTimer) window.clearTimeout(this.findTimer);
    this.findTimer = 0;
    this.findNote.style.display = "none";
  }

  private clearTeeth(state: EntryState) {
    if (state.teeth.length === 0) return;
    state.teeth = [];
    this.syncTeeth(state);
  }

  private findActiveTooth() {
    for (const state of this.states.values()) {
      const tooth = state.teeth.find((row) => row.key === this.activeTooth);
      if (tooth) return { state, tooth };
    }
    return null;
  }

  private toothAt(state: EntryState, v: number) {
    return (
      state.teeth.find((row) => {
        const j = row.seg.local[v]!;
        return j >= 0 && row.seg.field[j]! >= 0.5;
      }) ?? null
    );
  }

  private teethMask(state: EntryState) {
    const mask = new Uint8Array(state.topo.vertexCount);
    for (const tooth of state.teeth) {
      const { patch, field } = tooth.seg;
      for (let i = 0; i < patch.length; i += 1) if (field[i]! >= 0.5) mask[patch[i]!] = 1;
    }
    return mask;
  }

  private removeToothVisuals(state: EntryState) {
    if (state.toothOverlay) {
      state.mesh.remove(state.toothOverlay);
      disposeTree(state.toothOverlay);
      state.toothOverlay.geometry.dispose();
      state.toothOverlay = null;
    }
    if (state.toothLines) {
      state.mesh.remove(state.toothLines);
      disposeTree(state.toothLines);
      state.toothLines = null;
    }
  }

  /** 고른 치아를 옅게 칠하고 경계선을 그린다. 고친 치아는 진한 선이다. */
  private syncTeeth(state: EntryState) {
    if (this.spec?.tab !== "extract" || state.teeth.length === 0) {
      this.removeToothVisuals(state);
      return;
    }
    const index = state.topo.index;
    if (!state.toothOverlay) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", state.position);
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(index.length), 1));
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: TOOTH_RGB,
          transparent: true,
          opacity: 0.32,
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
      state.toothOverlay = mesh;
    }
    const mask = this.teethMask(state);
    const attr = state.toothOverlay.geometry.getIndex()!;
    const out = attr.array as Uint32Array;
    const drawn = new Uint8Array(index.length / 3);
    let count = 0;
    for (const tooth of state.teeth) {
      for (const t of tooth.seg.tris) {
        if (drawn[t]) continue;
        const a = index[t * 3]!;
        const b = index[t * 3 + 1]!;
        const c = index[t * 3 + 2]!;
        if (!mask[a] || !mask[b] || !mask[c]) continue;
        drawn[t] = 1;
        out[count] = a;
        out[count + 1] = b;
        out[count + 2] = c;
        count += 3;
      }
    }
    attr.needsUpdate = true;
    state.toothOverlay.geometry.setDrawRange(0, count);

    if (state.toothLines) {
      state.mesh.remove(state.toothLines);
      disposeTree(state.toothLines);
    }
    const positions = state.position.array as Float32Array;
    const group = new THREE.Group();
    group.userData.meshEditLoops = true;
    for (const tooth of state.teeth) {
      const active = tooth.key === this.activeTooth;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(toothBorderSegments(state.topo, positions, tooth.seg), 3),
      );
      const line = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({
          color: active ? TOOTH_ACTIVE_LINE_RGB : TOOTH_LINE_RGB,
          depthTest: false,
          transparent: true,
          opacity: active ? 1 : 0.8,
          toneMapped: false,
        }),
      );
      line.renderOrder = active ? 8 : 7;
      line.frustumCulled = false;
      line.raycast = () => {};
      group.add(line);
    }
    state.mesh.add(group);
    state.toothLines = group;
  }

  private dropState(id: string) {
    const state = this.states.get(id);
    if (!state) return;
    this.removeOverlay(state);
    this.removeLoopLines(state);
    this.removeToothVisuals(state);
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
    const indexArray = Uint32Array.from(index.array as ArrayLike<number>);
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
      teeth: [],
      toothOverlay: null,
      toothLines: null,
      trimGone: null,
      trimSlot: null,
      trimAt: null,
      trimLive: 0,
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
    this.restoreTrimPreview(state);
    if (state.selectedCount === 0) return;
    state.selected.fill(0);
    state.selectedCount = 0;
    this.syncOverlay(state);
  }

  private restoreTrimAll() {
    for (const state of this.states.values()) this.restoreTrimPreview(state);
  }

  private restoreTrimPreview(state: EntryState) {
    if (!state.trimGone) return;
    const src = state.topo.index;
    const dst = state.index.array;
    for (let i = 0; i < src.length; i += 1) dst[i] = src[i]!;
    state.index.needsUpdate = true;
    state.geometry.setDrawRange(0, src.length);
    state.trimGone = null;
    state.trimSlot = null;
    state.trimAt = null;
    state.trimLive = 0;
  }

  private ensureTrimScratch(state: EntryState) {
    if (state.trimGone) return;
    const n = Math.floor(state.topo.index.length / 3);
    const slot = new Int32Array(n);
    const at = new Int32Array(n);
    for (let i = 0; i < n; i += 1) {
      slot[i] = i;
      at[i] = i;
    }
    state.trimGone = new Uint8Array(n);
    state.trimSlot = slot;
    state.trimAt = at;
    state.trimLive = n;
  }

  /** 고른 정점이 닿은 면을 당장 숨긴다. 스캔 전체가 없어지면 그 점은 건너뛴다. */
  private hideTrimVerts(state: EntryState, verts: readonly number[]) {
    this.ensureTrimScratch(state);
    const gone = state.trimGone!;
    const slot = state.trimSlot!;
    const at = state.trimAt!;
    const { tris, triStart } = state.topo;
    const hide: number[] = [];
    for (const v of verts) {
      if (state.selected[v]) continue;
      for (let i = triStart[v]!; i < triStart[v + 1]!; i += 1) {
        const t = tris[i]!;
        if (gone[t]) continue;
        gone[t] = 2;
        hide.push(t);
      }
    }
    if (hide.length === 0) return false;
    if (state.trimLive - hide.length <= 0) {
      for (const t of hide) gone[t] = 0;
      return false;
    }
    const meshIndex = state.index.array;
    for (const t of hide) {
      gone[t] = 1;
      const from = slot[t]!;
      const last = state.trimLive - 1;
      if (from !== last) {
        const other = at[last]!;
        const a = from * 3;
        const b = last * 3;
        const ia = meshIndex[a]!;
        const ib = meshIndex[a + 1]!;
        const ic = meshIndex[a + 2]!;
        meshIndex[a] = meshIndex[b]!;
        meshIndex[a + 1] = meshIndex[b + 1]!;
        meshIndex[a + 2] = meshIndex[b + 2]!;
        meshIndex[b] = ia;
        meshIndex[b + 1] = ib;
        meshIndex[b + 2] = ic;
        slot[other] = from;
        at[from] = other;
        slot[t] = last;
        at[last] = t;
      }
      state.trimLive -= 1;
    }
    for (const v of verts) {
      if (state.selected[v]) continue;
      state.selected[v] = 1;
      state.selectedCount += 1;
    }
    state.index.needsUpdate = true;
    state.geometry.setDrawRange(0, state.trimLive * 3);
    return true;
  }

  private removeOverlay(state: EntryState) {
    if (!state.overlay) return;
    state.mesh.remove(state.overlay);
    disposeTree(state.overlay);
    state.overlay.geometry.dispose();
    state.overlay = null;
  }

  private syncOverlay(state: EntryState) {
    this.removeOverlay(state);
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
    camera.updateMatrixWorld();
    const rect = this.host.dom.getBoundingClientRect();
    this.ndc.set(
      ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
      -((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, camera);
    return camera;
  }

  private resolveTarget(targets: MeshEditTarget[], obj: THREE.Object3D | null) {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      const found = targets.find((row) => row.mesh === cur);
      if (found) return found;
      cur = cur.parent;
    }
    return null;
  }

  private hitTargets(event: PointerEvent, onlyId?: string) {
    if (!this.aim(event)) return null;
    const targets = this.host
      .targets()
      .filter((row) => row.mesh.visible && (!onlyId || row.id === onlyId));
    if (targets.length === 0) return null;
    const meshes = targets.map((row) => row.mesh);
    const hits = withDoubleSidePick(meshes, () =>
      this.raycaster.intersectObjects(meshes, true),
    );
    const hit = hits[0];
    if (!hit || !hit.face) return null;
    const target = this.resolveTarget(targets, hit.object);
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
    const mm =
      spec.tab === "sculpt"
        ? spec.sculptBrushMm
        : spec.tab === "extract"
          ? spec.extractBrushMm
          : spec.trimBrushMm;
    return mm / 2 / Math.max(this.host.unitToMm(), 1e-9);
  }

  private usesRing() {
    const spec = this.spec;
    if (!spec) return false;
    return (
      spec.tab === "sculpt" ||
      (spec.tab === "trim" && spec.trimTool === "brush") ||
      (spec.tab === "extract" && spec.extractTool === "brush")
    );
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

  /** 누른 치아의 경계를 찾는다. 계산 전에 안내를 한 번 그리도록 잠깐 미룬다. */
  private pickTooth(event: PointerEvent) {
    if (this.findTimer) return;
    const found = this.hitTargets(event);
    if (!found?.hit.face) return;
    const target = found.target;
    const state = this.stateOf(target);
    if (!state) return;
    const local = target.mesh.worldToLocal(found.hit.point.clone());
    const positions = state.position.array as Float32Array;
    const face = found.hit.face;
    let seed = face.a;
    let best = Infinity;
    for (const v of [face.a, face.b, face.c]) {
      const d = Math.hypot(
        positions[v * 3]! - local.x,
        positions[v * 3 + 1]! - local.y,
        positions[v * 3 + 2]! - local.z,
      );
      if (d < best) {
        best = d;
        seed = v;
      }
    }
    const existing = this.toothAt(state, seed);
    if (existing) {
      this.extract({ kind: "activate", key: existing.key });
      return;
    }
    const overlayRect = this.host.overlay.getBoundingClientRect();
    this.findNote.style.left = `${event.clientX - overlayRect.left}px`;
    this.findNote.style.top = `${event.clientY - overlayRect.top}px`;
    this.findNote.style.display = "block";
    this.findTimer = window.setTimeout(() => {
      this.findTimer = 0;
      this.findNote.style.display = "none";
      if (this.spec?.tab !== "extract" || this.states.get(target.id) !== state) {
        this.emit();
        return;
      }
      const seg = segmentTooth({
        topo: state.topo,
        positions: state.position.array as Float32Array,
        color: readTriple(target.scanColor),
        seed,
        unitToMm: this.host.unitToMm(),
        blocked: (v) => this.toothAt(state, v) != null,
      });
      if (seg) {
        this.toothSerial += 1;
        const key = `${target.id}:${this.toothSerial}`;
        state.teeth.push({ key, serial: this.toothSerial, seg, auto: seg.field.slice() });
        this.activeTooth = key;
        for (const row of this.states.values()) this.syncTeeth(row);
      }
      this.emit();
    }, 30);
    this.emit();
  }

  private paintTooth(event: PointerEvent) {
    const spec = this.spec;
    const found = this.hitTargets(event);
    if (!spec || !found) return;
    const state = this.stateOf(found.target);
    const tooth = state?.teeth.find((row) => row.key === this.activeTooth);
    if (!state || !tooth) return;
    const local = found.target.mesh.worldToLocal(found.hit.point.clone());
    const facing = found.hit.face!.normal;
    const normals = state.geometry.getAttribute("normal") as THREE.BufferAttribute | undefined;
    const positions = state.position.array as Float32Array;
    const radius = this.brushRadius();
    const picked = verticesInBrush(
      positions,
      normals?.array instanceof Float32Array ? normals.array : null,
      [local.x, local.y, local.z],
      [facing.x, facing.y, facing.z],
      radius,
    );
    const { field } = tooth.seg;
    const r2 = radius * radius;
    let changed = false;
    for (const v of picked) {
      const j = tooth.seg.local[v]!;
      if (j < 0) continue;
      const dx = positions[v * 3]! - local.x;
      const dy = positions[v * 3 + 1]! - local.y;
      const dz = positions[v * 3 + 2]! - local.z;
      const t = Math.max(0, 1 - (dx * dx + dy * dy + dz * dz) / r2);
      const next =
        spec.selectMode === "add"
          ? Math.max(field[j]!, 0.5 + 0.5 * t * t)
          : Math.min(field[j]!, 0.5 - 0.01 - 0.49 * t * t);
      if (next === field[j]) continue;
      field[j] = next;
      changed = true;
    }
    if (changed) this.syncTeeth(state);
  }

  private paintAt(event: PointerEvent) {
    const spec = this.spec;
    if (!spec) return;
    if (spec.tab === "extract") {
      this.paintTooth(event);
      return;
    }
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
    if (picked.length === 0) return;
    const changed = this.hideTrimVerts(state, picked);
    if (!changed) return;
    if (this.paint && !this.paint.began) {
      this.paint.began = true;
      this.host.onBegin();
    }
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
        if (state.selected[v]) continue;
        state.selected[v] = 1;
        state.selectedCount += 1;
      }
    }
    this.host.onResult(this.applyTrim());
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
    const found = this.hitTargets(event, stroke.id || undefined);
    if (!found) return;
    const state = this.stateOf(found.target);
    if (!state) return;
    if (!stroke.id) {
      stroke.id = found.target.id;
      this.host.onBegin();
    }
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
    const extractBrush = spec.tab === "extract" && spec.extractTool === "brush";
    if ((spec.tab === "trim" && spec.trimTool === "brush") || extractBrush) {
      const found = this.hitTargets(event);
      if (found) this.stateOf(found.target);
      if (extractBrush && found && !this.states.get(found.target.id)?.teeth.some((row) => row.key === this.activeTooth)) {
        this.grab(event);
        return;
      }
      this.paint = { pointerId: event.pointerId, at: performance.now(), pending: null, began: false };
      this.grab(event);
      this.paintAt(event);
      return;
    }
    if (spec.tab === "sculpt") {
      const found = this.hitTargets(event);
      const ready = found ? this.stateOf(found.target) : null;
      this.sculpt = {
        pointerId: event.pointerId,
        id: ready && found ? found.target.id : "",
        at: performance.now(),
        last: null,
        pending: null,
      };
      this.grab(event);
      if (!found || !ready) return;
      this.host.onBegin();
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
      const began = this.paint.began;
      const trim = this.spec?.tab === "trim";
      this.release(event);
      this.paint = null;
      if (trim) {
        if (event.type === "pointercancel") {
          this.restoreTrimAll();
          for (const state of this.states.values()) {
            state.selected.fill(0);
            state.selectedCount = 0;
          }
          if (began) this.host.onCommitted();
        } else {
          const result = this.applyTrim(began);
          if (result.kind !== "trimmed" && began) this.host.onCommitted();
          if (result.kind === "whole" || result.kind === "trimmed") this.host.onResult(result);
        }
      } else {
        this.emit();
      }
      event.stopImmediatePropagation();
      return;
    }
    if (this.sculpt && event.pointerId === this.sculpt.pointerId) {
      const id = this.sculpt.id;
      this.release(event);
      this.sculpt = null;
      if (!id) {
        event.stopImmediatePropagation();
        return;
      }
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
    if (spec.tab === "fill") this.pickLoop(event);
    else if (spec.tab === "extract" && spec.extractTool === "pick") this.pickTooth(event);
  };

  private readonly onLeave = () => {
    this.ring.style.display = "none";
  };
}
