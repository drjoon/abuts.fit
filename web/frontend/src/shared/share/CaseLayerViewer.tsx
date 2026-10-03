// related files:
// - web/frontend/src/shared/share/CaseShareViewer.tsx
// - web/frontend/src/shared/files/modelPreviewFile.ts
// - web/frontend/src/shared/three/screenSpaceOrbitControls.ts
// - 2026-10-03: resetView — 사용자 조작을 잊고 보이는 메시에 다시 맞춘다(클러스터 전환용).
// - 2026-10-03: 어벗 적합이 끝나면 뷰를 다시 맞춘다.
// - 2026-10-03: 치식 라벨은 어벗 로컬 중심에 붙여 seating·펼침과 같이 움직인다.
// - 2026-10-03: 히트맵 구간 — 관통·0.01·0.02·0.03·0.05·0.1·0.2mm.
// - 2026-10-03: 맞추는 중 중단 버튼. 중단 후 자동으로 다시 맞추지 않는다.
// - 2026-10-03: 어벗 치아 번호(파일명 치식)를 CSS2D 라벨로 붙인다.
// - 2026-10-03: 진행 문구 — 어벗을 보철에 맞추는 중(알고리즘과 동일).
// - 2026-10-03: 보철은 파일 좌표 고정, 어벗을 옮겨 꽂는다. 편차 히트맵과 함께 확인받고, 확인·거절은 onSeatDecision으로 저장(storedSeats로 복원).
// - 2026-10-03: 맞추는 동안 가운데 진행 막대.
// - 2026-10-03: 브리지 seating은 치식으로 좌석을 고른다(이웃 리테이너 오삽입 방지).
// - 2026-10-03: 어벗 seating을 스캔바디·바이트와 같은 trimmed ICP로 맞춘다.
// - 2026-10-03: 어벗 seating에 피니시라인 방위각 회전을 포함한다.
// - 2026-10-03: 어벗은 보철 피니시라인(내면 좌석)에 맞춰 꽂은 뒤, 보철 펼침을 같이 따른다.
// - 2026-10-03: 보철 투명도 0=완전 불투명·100=완전 투명(SSOT).
// - 2026-10-03: 보철 기본 불투명. prosthesisOpacity로 투명도 조절.
// - 2026-10-03: 보철은 펼치고, 어벗은 원본 좌표로 짝 맞춰 같은 이동. 크라운 반투명.
// - 2026-10-03: 어벗·보철은 파일 좌표 그대로 맞춰 꽂는다(옆으로 펼치지 않음). 크라운은 반투명.
// - 2026-10-03: 어벗·보철이 같은 자리에 겹치면 X축으로 나란히 펼친다. 스캔은 파일 좌표 유지.
// - 2026-10-01: onPaintSpace — 페인트 표시를 모델에 붙인다. 화면을 돌리면 같이 돈다.
// - 2026-09-28: captureCanvas(페인트 합성)·colorMapping(스캔 칼라 끄기). 의뢰 파일 프리뷰와 같은 기능.
// - 2026-09-28: 화면 맞춤은 보이는 메시의 꼭짓점을 화면에 투영해 가로·세로에 꽉 차게 맞춘다.
// - 2026-09-28: 케이스 공유 뷰어 — 디자인·스캔 여러 메시를 파일 좌표 그대로 겹치고 레이어별로 켜고 끈다.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  applyScanColorToneMapping,
  createModelPreviewMaterial,
  isScanColorPreview,
  parseModelPreview,
} from "@/shared/files/modelPreviewFile";
import { disposeBackFaceShell, syncBackFaceShell } from "@/shared/three/backFaceShell";
import { ScreenSpaceOrbitControls, applyExternalView } from "@/shared/three/screenSpaceOrbitControls";
import {
  createViewPaintSpace,
  notifyViewPaint,
  type ViewPaintSpace,
} from "@/shared/components/practice/viewPaintSpace";
import {
  computeAbutmentSeats,
  isSeatCancelled,
  peekAbutmentSeats,
  rowMajorToSeatPose,
  seatPoseToRowMajor,
  toothLabelFromMeshName,
  toothLabelsOverlap,
  type AbutmentSeat,
  type AbutmentSeatPose,
  type ProsthesisSeatAbutment,
  type SeatDeviation,
} from "@/shared/share/seatAbutmentToProsthesis";
import { cn } from "@/shared/ui/cn";

export type CaseLayerTone = "prosthesis" | "abutment" | "scan";

export type CaseLayerModel = {
  id: string;
  file: File;
  companionFiles?: File[];
  tone: CaseLayerTone;
  visible: boolean;
};

/** 저장된 어벗 자세. matrix null이면 파일 좌표 그대로. */
export type CaseSeatRecord = {
  abutmentId: string;
  prosthesisId: string;
  matrix: number[] | null;
};

export type CaseSeatDecision = {
  prosthesisId: string;
  confirmed: boolean;
  abutments: Array<{ id: string; matrix: number[] | null; deviation: SeatDeviation | null }>;
};

export type CaseLayerViewerHandle = {
  fitToView: () => void;
  /** 카메라 조작을 잊고 보이는 메시에 맞춘다. 클러스터를 바꿀 때 쓴다. */
  resetView: () => void;
  /** 표시를 겹치기 위한 현재 프레임 캔버스. */
  captureCanvas: () => HTMLCanvasElement | null;
};

type CaseLayerViewerProps = {
  layers: CaseLayerModel[];
  /** false면 스캔 레이어의 칼라·텍스처를 끄고 기본 틴트로 그린다. */
  colorMapping?: boolean;
  /** 보철 투명도 0~100. 0=완전 불투명, 100=완전 투명. */
  prosthesisTransparency?: number;
  onLayerError?: (id: string, message: string) => void;
  /** 페인트가 메시 표면에 붙도록. 씬이 준비되면 넘기고, 닫히면 null. */
  onPaintSpace?: (space: ViewPaintSpace | null) => void;
  /** 어벗·보철 파일을 아직 받는 중. 다 받은 뒤에 맞춰야 기준 어벗이 흔들리지 않는다. */
  designPending?: boolean;
  /** 이미 확인·거절한 어벗 자세(레이어 id 기준). 있으면 다시 맞추지 않는다. */
  storedSeats?: CaseSeatRecord[];
  /** 맞춘 결과를 확인·거절했을 때. false를 돌려주면 다시 묻는다. 없으면 확인 없이 미리보기만. */
  onSeatDecision?: (decision: CaseSeatDecision) => Promise<boolean>;
  className?: string;
};

const TEXTURE_KEY = "previewTexture";
const TONE_KEY = "layerTone";
const LAYER_ID_KEY = "layerId";
const HEAT_KEY = "seatHeat";
const TOOTH_LABEL_KEY = "toothLabel";

function scanTexture(mesh: THREE.Mesh): THREE.Texture | null {
  return (mesh.userData[TEXTURE_KEY] as THREE.Texture | undefined) ?? null;
}

function layerToneOf(mesh: THREE.Mesh): CaseLayerTone {
  return (mesh.userData[TONE_KEY] as CaseLayerTone | undefined) || "scan";
}

function clearToothLabel(mesh: THREE.Mesh) {
  const label = mesh.userData[TOOTH_LABEL_KEY] as CSS2DObject | undefined;
  if (!label) return;
  label.element.remove();
  mesh.remove(label);
  mesh.userData[TOOTH_LABEL_KEY] = undefined;
}

/** 메시 기하만으로 월드 AABB. 치식 라벨·백페이스 자식을 넣지 않는다. */
function meshWorldBox(mesh: THREE.Mesh, target = new THREE.Box3()): THREE.Box3 {
  mesh.updateMatrixWorld(true);
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const local = mesh.geometry.boundingBox;
  if (!local || local.isEmpty()) return target.makeEmpty();
  return target.copy(local).applyMatrix4(mesh.matrixWorld);
}

/**
 * 어벗 기하 로컬 중심에 치식 라벨을 둔다.
 * 월드로 다시 계산하지 않아 seating·펼침 때 메시와 같이 움직인다.
 */
function placeToothLabel(mesh: THREE.Mesh, label: CSS2DObject) {
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  if (!box || box.isEmpty()) {
    label.position.set(0, 0, 0);
    return;
  }
  box.getCenter(label.position);
}

/** 어벗 메시에 파일명 치식 라벨을 붙인다. 없으면 제거. */
function syncToothLabel(mesh: THREE.Mesh) {
  clearToothLabel(mesh);
  if (layerToneOf(mesh) !== "abutment") return;
  const tooth = toothLabelFromMeshName(mesh.name);
  if (!tooth) return;
  const tag = document.createElement("div");
  tag.textContent = tooth;
  tag.style.cssText = [
    "pointer-events:none",
    "user-select:none",
    "border-radius:0.375rem",
    "background:rgba(15,23,42,0.78)",
    "color:#fff",
    "font:600 11px/1.2 ui-sans-serif,system-ui,sans-serif",
    "padding:0.2rem 0.4rem",
    "white-space:nowrap",
  ].join(";");
  const label = new CSS2DObject(tag);
  label.center.set(0.5, 0.5);
  mesh.add(label);
  mesh.userData[TOOTH_LABEL_KEY] = label;
  placeToothLabel(mesh, label);
}

function refreshToothLabels(meshes: Iterable<THREE.Mesh>) {
  for (const mesh of meshes) {
    const label = mesh.userData[TOOTH_LABEL_KEY] as CSS2DObject | undefined;
    if (!label) {
      syncToothLabel(mesh);
      continue;
    }
    placeToothLabel(mesh, label);
  }
}

function disposeLayerMesh(mesh: THREE.Mesh) {
  clearToothLabel(mesh);
  disposeBackFaceShell(mesh);
  mesh.geometry.dispose();
  const mat = mesh.material as THREE.MeshStandardMaterial;
  if (mat.map && mat.map !== scanTexture(mesh)) mat.map.dispose();
  scanTexture(mesh)?.dispose();
  mat.dispose();
}

function applyScanRendering(renderer: THREE.WebGLRenderer, colorMapping: boolean) {
  if (colorMapping) {
    applyScanColorToneMapping(renderer);
    return;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
}

const VIEWER_BACKGROUND = 0xe6e9ec;
const CAMERA_FOV = 30;
/** 화면 맞춤 여백. 1이면 가장자리에 딱 붙는다. */
const FIT_MARGIN = 1.04;
/** 보철 묶음을 펼칠 때 옆 간격(큰 쪽 치수 비율). */
const PROSTHESIS_GAP_RATIO = 0.3;

function designMaterial(tone: CaseLayerTone): THREE.MeshStandardMaterial {
  if (tone === "abutment") {
    return new THREE.MeshStandardMaterial({
      color: 0xb9bec6,
      metalness: 0.55,
      roughness: 0.35,
    });
  }
  return new THREE.MeshStandardMaterial({
    color: 0xf2eee4,
    metalness: 0.04,
    roughness: 0.42,
  });
}

type DesignPiece = {
  mesh: THREE.Mesh;
  tone: "abutment" | "prosthesis";
  box: THREE.Box3;
  center: THREE.Vector3;
  size: THREE.Vector3;
};

function transparencyToOpacity(transparency: number): number {
  const t = Math.min(100, Math.max(0, transparency));
  return 1 - t / 100;
}

function applyProsthesisOpacity(mesh: THREE.Mesh, opacity: number) {
  const mat = mesh.material as THREE.MeshStandardMaterial;
  const clamped = Math.min(1, Math.max(0, opacity));
  // 0에 가까워도 transparent를 켜야 완전 투명이 된다.
  const seeThrough = clamped < 1;
  mat.transparent = seeThrough;
  mat.opacity = clamped;
  // 반투명일 때 depthWrite면 안쪽 어벗이 가려질 수 있다.
  mat.depthWrite = !seeThrough;
  mesh.renderOrder = seeThrough ? 2 : 1;
  mat.needsUpdate = true;
}

function refreshPieceBox(piece: DesignPiece) {
  meshWorldBox(piece.mesh, piece.box);
  piece.box.getCenter(piece.center);
  piece.box.getSize(piece.size);
}

/** 확인 중인 보철은 안쪽 어벗이 보이게 이만큼은 비친다. */
const REVIEW_CROWN_OPACITY = 0.35;
const HEAT_BASE = new THREE.Color(0xb9bec6);
const HEAT_BANDS: Array<{ max: number; color: THREE.Color; label: string }> = [
  { max: -1e-9, color: new THREE.Color(0x3b82f6), label: "관통" },
  { max: 0.01, color: new THREE.Color(0x22c55e), label: "≤0.01" },
  { max: 0.02, color: new THREE.Color(0x84cc16), label: "≤0.02" },
  { max: 0.03, color: new THREE.Color(0xc4e017), label: "≤0.03" },
  { max: 0.05, color: new THREE.Color(0xeab308), label: "≤0.05" },
  { max: 0.1, color: new THREE.Color(0xf97316), label: "≤0.1" },
  { max: 0.2, color: new THREE.Color(0xef4444), label: "≤0.2" },
];

function heatColor(d: number): THREE.Color {
  if (Number.isNaN(d)) return HEAT_BASE;
  return (HEAT_BANDS.find((b) => d <= b.max) ?? HEAT_BANDS[HEAT_BANDS.length - 1]!).color;
}

function setHeatMap(mesh: THREE.Mesh, distances: Float32Array | null) {
  if (mesh.userData[HEAT_KEY] === distances) return;
  mesh.userData[HEAT_KEY] = distances;
  const mat = mesh.material as THREE.MeshStandardMaterial;
  if (!distances) {
    if (!mat.vertexColors) return;
    mat.vertexColors = false;
    mat.color.setHex(0xb9bec6);
    mesh.geometry.deleteAttribute("color");
  } else {
    const colors = new Float32Array(distances.length * 3);
    distances.forEach((d, i) => heatColor(d).toArray(colors, i * 3));
    mesh.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    mat.vertexColors = true;
    mat.color.setHex(0xffffff);
  }
  mat.needsUpdate = true;
  syncBackFaceShell(mesh);
}

function layerIdOf(mesh: THREE.Mesh): string {
  return String(mesh.userData[LAYER_ID_KEY] ?? "");
}

/** 보철 하나에 짝지은 어벗들의 화면 자세. 아직 모르면 null(파일 좌표). */
type SeatResolver = (crown: THREE.Mesh, paired: THREE.Mesh[]) => Array<AbutmentSeatPose | null> | null;

type SeatReview = {
  crownId: string;
  crown: THREE.Mesh;
  paired: THREE.Mesh[];
  seats: Array<AbutmentSeat | null>;
};

/**
 * 짝 어벗을 보철에 꽂고(보철은 파일 좌표 그대로), 보철이 둘 이상이면 옆으로 펼친다.
 * 어벗 자세는 resolveSeat가 정한다. 스캔은 손대지 않는다.
 */
function syncDesignAssembly(
  meshes: Iterable<THREE.Mesh>,
  crownOpacity: (crown: THREE.Mesh) => number,
  resolveSeat: SeatResolver,
): boolean {
  // 숨긴 어벗도 짝·좌석 배정에는 넣는다. 켜고 끌 때마다 좌석 배정이 바뀌면 안 된다.
  const all: DesignPiece[] = [];
  for (const mesh of meshes) {
    const tone = layerToneOf(mesh);
    if (tone !== "abutment" && tone !== "prosthesis") continue;
    mesh.position.set(0, 0, 0);
    mesh.quaternion.identity();
    const box = meshWorldBox(mesh);
    all.push({
      mesh,
      tone,
      box,
      center: box.getCenter(new THREE.Vector3()),
      size: box.getSize(new THREE.Vector3()),
    });
  }

  const allCrowns = all.filter((p) => p.tone === "prosthesis");
  const allAbuts = all.filter((p) => p.tone === "abutment");

  // 치식 포함 우선, 아니면 겹침·중심 거리로 보철↔어벗 짝.
  const abutToCrown = new Map<THREE.Mesh, THREE.Mesh>();
  for (const abut of allAbuts) {
    const abutTooth = toothLabelFromMeshName(abut.mesh.name);
    let best: DesignPiece | null = null;
    let bestScore = Infinity;
    for (const crown of allCrowns) {
      const crownTooth = toothLabelFromMeshName(crown.mesh.name);
      const toothHit = toothLabelsOverlap(abutTooth, crownTooth);
      const dist = abut.center.distanceTo(crown.center);
      const intersects = abut.box.intersectsBox(crown.box);
      let score = intersects ? dist * 0.01 : dist + crown.size.length() * 0.5;
      if (toothHit) score *= 0.001;
      if (score < bestScore) {
        bestScore = score;
        best = crown;
      }
    }
    if (best) abutToCrown.set(abut.mesh, best.mesh);
  }

  const basePosition = new Map<THREE.Mesh, THREE.Vector3>();
  const baseQuaternion = new Map<THREE.Mesh, THREE.Quaternion>();
  const setBase = (mesh: THREE.Mesh, pose: AbutmentSeatPose | null) => {
    basePosition.set(mesh, pose ? pose.position : new THREE.Vector3());
    baseQuaternion.set(mesh, pose ? pose.quaternion : new THREE.Quaternion());
    mesh.position.copy(basePosition.get(mesh)!);
    mesh.quaternion.copy(baseQuaternion.get(mesh)!);
  };
  for (const crown of allCrowns) {
    const paired = allAbuts
      .filter((a) => abutToCrown.get(a.mesh) === crown.mesh)
      .sort((a, b) => String(a.mesh.name).localeCompare(String(b.mesh.name)));
    setBase(crown.mesh, null);
    for (const a of paired) setBase(a.mesh, null);
    if (paired.length === 0) continue;
    const poses = resolveSeat(
      crown.mesh,
      paired.map((a) => a.mesh),
    );
    if (poses) paired.forEach((a, i) => setBase(a.mesh, poses[i] ?? null));
  }
  for (const abut of allAbuts) {
    if (!basePosition.has(abut.mesh)) setBase(abut.mesh, null);
  }

  const pieces = all.filter((p) => p.mesh.visible);
  for (const piece of pieces) refreshPieceBox(piece);
  const crowns = pieces.filter((p) => p.tone === "prosthesis");
  const abuts = pieces.filter((p) => p.tone === "abutment");
  const assemble = crowns.length > 0 && abuts.length > 0;

  const units = crowns.map((crown) => {
    const members = [
      crown,
      ...abuts.filter((a) => abutToCrown.get(a.mesh) === crown.mesh),
    ];
    const unitBox = new THREE.Box3();
    for (const m of members) unitBox.union(m.box);
    return {
      crown,
      members,
      box: unitBox,
      center: unitBox.getCenter(new THREE.Vector3()),
      size: unitBox.getSize(new THREE.Vector3()),
    };
  });

  // 보철이 2개 이상이면 펼친다. 어벗만 있으면 seating만 유지.
  if (units.length >= 2) {
    units.sort(
      (a, b) =>
        a.center.x - b.center.x ||
        a.center.y - b.center.y ||
        String(a.crown.mesh.name || "").localeCompare(
          String(b.crown.mesh.name || ""),
        ),
    );
    const gap =
      Math.max(
        ...units.map((u) => Math.max(u.size.x, u.size.y, u.size.z, 1e-3)),
      ) * PROSTHESIS_GAP_RATIO;
    let cursor = 0;
    const spreadByMesh = new Map<THREE.Mesh, THREE.Vector3>();
    for (const unit of units) {
      const halfW = Math.max(unit.size.x / 2, 1e-3);
      const target = new THREE.Vector3(cursor + halfW, 0, 0);
      const delta = target.sub(unit.center);
      for (const member of unit.members) {
        spreadByMesh.set(member.mesh, delta.clone());
      }
      cursor += unit.size.x + gap;
    }
    for (const [mesh, spread] of spreadByMesh) {
      const base = basePosition.get(mesh) ?? new THREE.Vector3();
      const quat = baseQuaternion.get(mesh) ?? new THREE.Quaternion();
      mesh.quaternion.copy(quat);
      mesh.position.copy(base).add(spread);
    }
    // 펼친 줄 가운데를 원점으로.
    const row = new THREE.Box3();
    for (const unit of units) {
      for (const member of unit.members) {
        member.mesh.updateMatrixWorld(true);
        row.expandByObject(member.mesh);
      }
    }
    if (!row.isEmpty()) {
      const rowCenter = row.getCenter(new THREE.Vector3());
      for (const mesh of spreadByMesh.keys()) {
        mesh.position.x -= rowCenter.x;
        mesh.position.y -= rowCenter.y;
        mesh.position.z -= rowCenter.z;
      }
    }
  }

  for (const piece of allCrowns) {
    applyProsthesisOpacity(piece.mesh, crownOpacity(piece.mesh));
  }
  for (const mesh of allAbuts) {
    mesh.mesh.renderOrder = 1;
  }
  refreshToothLabels(allAbuts.map((a) => a.mesh));
  return units.length >= 2 || assemble;
}

export const CaseLayerViewer = forwardRef<CaseLayerViewerHandle, CaseLayerViewerProps>(
  function CaseLayerViewer({
    layers,
    colorMapping = true,
    prosthesisTransparency = 0,
    onLayerError,
    onPaintSpace,
    designPending = false,
    storedSeats,
    onSeatDecision,
    className,
  }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    /** 맞추는 중인 보철별 진행률(0~1). */
    const seatJobsRef = useRef(new Map<string, number>());
    /** 중단 시 올라간다. 돌고 있는 작업이 cancelled를 본다. */
    const seatCancelGenRef = useRef(0);
    /** 중단한 jobKey. 자동으로 다시 맞추지 않는다. */
    const seatSuppressedRef = useRef(new Set<string>());
    const [seatPercent, setSeatPercent] = useState<number | null>(null);
    const designPendingRef = useRef(designPending);
    designPendingRef.current = designPending;
    const storedSeatsRef = useRef(storedSeats);
    storedSeatsRef.current = storedSeats;
    const onSeatDecisionRef = useRef(onSeatDecision);
    onSeatDecisionRef.current = onSeatDecision;
    /** 저장 응답 전에도 바로 반영하는 확인·거절. 키 `어벗id|보철id`. */
    const decisionsRef = useRef(new Map<string, number[] | null>());
    const reviewRef = useRef<SeatReview | null>(null);
    const [review, setReview] = useState<SeatReview | null>(null);
    const [deciding, setDeciding] = useState(false);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const labelRendererRef = useRef<CSS2DRenderer | null>(null);
    const controlsRef = useRef<ScreenSpaceOrbitControls | null>(null);
    const meshesRef = useRef(new Map<string, THREE.Mesh>());
    const loadingRef = useRef(new Set<string>());
    /** 사용자가 돌리거나 옮기기 전에는 메시가 들어올 때마다 다시 맞춘다. */
    const userMovedRef = useRef(false);
    const layersRef = useRef(layers);
    layersRef.current = layers;
    const onLayerErrorRef = useRef(onLayerError);
    onLayerErrorRef.current = onLayerError;
    const colorMappingRef = useRef(colorMapping);
    colorMappingRef.current = colorMapping;
    const prosthesisTransparencyRef = useRef(prosthesisTransparency);
    prosthesisTransparencyRef.current = prosthesisTransparency;
    const onPaintSpaceRef = useRef(onPaintSpace);
    onPaintSpaceRef.current = onPaintSpace;
    const paintListenersRef = useRef(new Set<() => void>());

    const fitToView = () => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
      const meshes = [...meshesRef.current.values()];
      const visible = meshes.filter((m) => m.visible);
      const targets = visible.length > 0 ? visible : meshes;
      if (targets.length === 0) return;

      const dir = camera.position.clone().sub(controls.target);
      if (dir.lengthSq() < 1e-9) dir.set(0, 0, 1);
      dir.normalize();

      // 보는 방향 그대로 화면 가로·세로에 맞춘다. 구 대신 실제 꼭짓점을 투영해 여백을 줄인다.
      const box = new THREE.Box3();
      for (const mesh of targets) box.expandByObject(mesh);
      const boxCenter = box.getCenter(new THREE.Vector3());
      camera.position.copy(boxCenter).add(dir);
      camera.lookAt(boxCenter);
      camera.updateMatrixWorld();
      const toView = new THREE.Matrix4()
        .makeRotationFromQuaternion(camera.quaternion)
        .invert();
      const min = new THREE.Vector3(Infinity, Infinity, Infinity);
      const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      const point = new THREE.Vector3();
      const points: THREE.Vector3[] = [];
      for (const mesh of targets) {
        mesh.updateMatrixWorld();
        const pos = mesh.geometry.getAttribute("position");
        if (!pos) continue;
        const stride = Math.max(1, Math.floor(pos.count / 60000));
        for (let i = 0; i < pos.count; i += stride) {
          point
            .fromBufferAttribute(pos, i)
            .applyMatrix4(mesh.matrixWorld)
            .sub(boxCenter)
            .applyMatrix4(toView);
          min.min(point);
          max.max(point);
          points.push(point.clone());
        }
      }
      if (points.length === 0) return;

      // 화면 평면(x·y) 중심으로 옮긴다. z는 카메라 쪽이 +.
      const mid = new THREE.Vector3((min.x + max.x) / 2, (min.y + max.y) / 2, 0);
      const tanV = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2));
      const tanH = tanV * Math.max(camera.aspect, 1e-3);
      let distance = 1e-3;
      for (const p of points) {
        const dx = Math.abs(p.x - mid.x);
        const dy = Math.abs(p.y - mid.y);
        distance = Math.max(distance, p.z + dx / tanH, p.z + dy / tanV);
      }
      distance *= FIT_MARGIN;

      const center = mid.applyQuaternion(camera.quaternion).add(boxCenter);
      controls.target.copy(center);
      camera.position.copy(center).addScaledVector(dir, distance);
      camera.near = Math.max(distance / 200, 0.01);
      camera.far = distance * 200;
      camera.updateProjectionMatrix();
      camera.lookAt(center);
      controls.syncFromCamera();
    };

    const resetView = () => {
      userMovedRef.current = false;
      fitToView();
    };

    const captureCanvas = () => {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (!renderer || !scene || !camera) return null;
      renderer.render(scene, camera);
      return renderer.domElement;
    };

    useImperativeHandle(ref, () => ({ fitToView, resetView, captureCanvas }));

    const publishSeatProgress = () => {
      const jobs = [...seatJobsRef.current.values()];
      const next =
        jobs.length === 0
          ? null
          : Math.round((jobs.reduce((a, b) => a + b, 0) / jobs.length) * 100);
      setSeatPercent((prev) => (prev === next ? prev : next));
    };

    const designLoading = () =>
      designPendingRef.current ||
      [...loadingRef.current].some((id) => {
        const tone = layersRef.current.find((l) => l.id === id)?.tone;
        return tone === "abutment" || tone === "prosthesis";
      });

    const requestSeat = (
      crown: THREE.Mesh,
      abutments: ProsthesisSeatAbutment[],
      crownTooth: string,
    ) => {
      const jobKey = [crown.geometry.uuid, ...abutments.map((a) => a.geometry.uuid)].join("|");
      if (seatSuppressedRef.current.has(jobKey)) return;
      if (seatJobsRef.current.has(jobKey)) return;
      const jobGen = seatCancelGenRef.current;
      seatJobsRef.current.set(jobKey, 0);
      publishSeatProgress();
      void computeAbutmentSeats(
        crown.geometry,
        abutments,
        crownTooth,
        (ratio) => {
          if (!seatJobsRef.current.has(jobKey)) return;
          seatJobsRef.current.set(jobKey, ratio);
          publishSeatProgress();
        },
        () => seatCancelGenRef.current !== jobGen,
      )
        .then(() => {
          seatJobsRef.current.delete(jobKey);
          publishSeatProgress();
          if (!sceneRef.current || seatCancelGenRef.current !== jobGen) return;
          assemble();
          // 맞추는 동안 화면을 돌렸어도 적합 결과 기준으로 다시 맞춘다.
          userMovedRef.current = false;
          fitToView();
        })
        .catch((error) => {
          seatJobsRef.current.delete(jobKey);
          publishSeatProgress();
          if (isSeatCancelled(error)) return;
          console.info("[case-layer] seat failed", error);
        });
    };

    const cancelSeat = () => {
      if (seatJobsRef.current.size === 0) return;
      for (const key of seatJobsRef.current.keys()) {
        seatSuppressedRef.current.add(key);
      }
      seatCancelGenRef.current += 1;
      seatJobsRef.current.clear();
      publishSeatProgress();
    };

    const storedMatrix = (abutId: string, crownId: string): number[] | null | undefined => {
      const key = `${abutId}|${crownId}`;
      if (decisionsRef.current.has(key)) return decisionsRef.current.get(key);
      const row = storedSeatsRef.current?.find(
        (r) => r.abutmentId === abutId && r.prosthesisId === crownId,
      );
      return row ? row.matrix : undefined;
    };

    const assemble = () => {
      const proposals: SeatReview[] = [];
      const resolveSeat: SeatResolver = (crown, paired) => {
        const crownId = layerIdOf(crown);
        const stored = paired.map((a) => storedMatrix(layerIdOf(a), crownId));
        if (stored.every((m) => m !== undefined)) {
          return stored.map((m) => (m ? rowMajorToSeatPose(m) : null));
        }
        const inputs: ProsthesisSeatAbutment[] = paired.map((a) => ({
          geometry: a.geometry,
          tooth: toothLabelFromMeshName(a.name),
        }));
        const crownTooth = toothLabelFromMeshName(crown.name);
        const result = peekAbutmentSeats(crown.geometry, inputs, crownTooth);
        if (result === undefined) {
          if (!designLoading()) requestSeat(crown, inputs, crownTooth);
          return null;
        }
        if (!result) return null;
        if (onSeatDecisionRef.current) {
          proposals.push({ crownId, crown, paired, seats: result.abutments });
        }
        return result.abutments.map((a) => a?.pose ?? null);
      };
      const reviewCrownOpacity = (crown: THREE.Mesh) => {
        const base = transparencyToOpacity(prosthesisTransparencyRef.current);
        return reviewRef.current?.crown === crown ? Math.min(base, REVIEW_CROWN_OPACITY) : base;
      };
      const assembled = syncDesignAssembly(
        meshesRef.current.values(),
        reviewCrownOpacity,
        resolveSeat,
      );
      const prev = reviewRef.current;
      // 같은 보철을 보고 있으면 그대로 둔다. 매번 맨 앞 것으로 바뀌면 카드가 튄다.
      const keep =
        prev && proposals.some((p) => p.crownId === prev.crownId && p.crown === prev.crown);
      const next =
        (keep ? prev : null) ??
        proposals.sort((x, y) => x.crown.name.localeCompare(y.crown.name))[0] ??
        null;
      reviewRef.current = next;
      for (const mesh of meshesRef.current.values()) {
        const tone = layerToneOf(mesh);
        if (tone === "prosthesis") applyProsthesisOpacity(mesh, reviewCrownOpacity(mesh));
        if (tone !== "abutment") continue;
        const i = next ? next.paired.indexOf(mesh) : -1;
        setHeatMap(mesh, i >= 0 ? (next!.seats[i]?.vertexDistances ?? null) : null);
      }
      setReview(next);
      return assembled;
    };

    const decideSeat = async (confirmed: boolean) => {
      const current = reviewRef.current;
      const save = onSeatDecisionRef.current;
      if (!current || !save || deciding) return;
      const abutments = current.paired.map((mesh, i) => {
        const seat = current.seats[i];
        return {
          id: layerIdOf(mesh),
          matrix: confirmed && seat?.pose ? seatPoseToRowMajor(seat.pose) : null,
          deviation: confirmed ? (seat?.deviation ?? null) : null,
        };
      });
      const keys = abutments.map((a) => `${a.id}|${current.crownId}`);
      abutments.forEach((a, i) => decisionsRef.current.set(keys[i]!, a.matrix));
      setDeciding(true);
      assemble();
      const ok = await save({ prosthesisId: current.crownId, confirmed, abutments }).catch(
        () => false,
      );
      setDeciding(false);
      if (ok || !sceneRef.current) return;
      for (const key of keys) decisionsRef.current.delete(key);
      assemble();
    };

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(VIEWER_BACKGROUND);
      const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 5000);
      camera.position.set(0, 0, 100);
      scene.add(camera);
      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 0.55));
      const key = new THREE.DirectionalLight(0xffffff, 1.05);
      key.position.set(0.6, 0.8, 1);
      camera.add(key);
      const fill = new THREE.DirectionalLight(0xffffff, 0.35);
      fill.position.set(-0.8, -0.3, 0.6);
      camera.add(fill);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      container.appendChild(renderer.domElement);
      renderer.domElement.style.display = "block";
      renderer.domElement.style.position = "absolute";
      renderer.domElement.style.inset = "0";

      const labelRenderer = new CSS2DRenderer();
      labelRenderer.domElement.style.position = "absolute";
      labelRenderer.domElement.style.inset = "0";
      labelRenderer.domElement.style.pointerEvents = "none";
      container.appendChild(labelRenderer.domElement);

      const controls = new ScreenSpaceOrbitControls(camera, renderer.domElement, {
        rotateSpeed: 1,
        zoomSpeed: 1.1,
      });
      controls.addEventListener("change", () => {
        userMovedRef.current = true;
      });

      const resize = () => {
        const w = Math.max(container.clientWidth, 1);
        const h = Math.max(container.clientHeight, 1);
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        labelRenderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(container);

      const paintListeners = paintListenersRef.current;
      let raf = 0;
      const tick = () => {
        raf = requestAnimationFrame(tick);
        if (paintListeners.size > 0) notifyViewPaint(paintListeners);
        renderer.render(scene, camera);
        labelRenderer.render(scene, camera);
      };
      tick();

      sceneRef.current = scene;
      cameraRef.current = camera;
      rendererRef.current = renderer;
      labelRendererRef.current = labelRenderer;
      controlsRef.current = controls;
      if (onPaintSpaceRef.current) {
        onPaintSpaceRef.current(
          createViewPaintSpace({
            getCamera: () => cameraRef.current,
            getRenderer: () => rendererRef.current,
            getParent: () => sceneRef.current,
            getTargets: () =>
              [...meshesRef.current.values()].filter((mesh) => mesh.visible && !mesh.userData.viewPaint),
            listeners: paintListeners,
            onView: (gesture) => applyExternalView(controls, gesture),
          }),
        );
      }

      const meshes = meshesRef.current;
      return () => {
        cancelAnimationFrame(raf);
        paintListeners.clear();
        onPaintSpaceRef.current?.(null);
        observer.disconnect();
        controls.dispose();
        for (const mesh of meshes.values()) disposeLayerMesh(mesh);
        meshes.clear();
        renderer.dispose();
        renderer.domElement.remove();
        labelRenderer.domElement.remove();
        sceneRef.current = null;
        cameraRef.current = null;
        rendererRef.current = null;
        labelRendererRef.current = null;
        controlsRef.current = null;
      };
    }, []);

    useEffect(() => {
      const scene = sceneRef.current;
      const renderer = rendererRef.current;
      if (!scene || !renderer) return;
      const meshes = meshesRef.current;
      const wanted = new Set(layers.map((l) => l.id));

      for (const [id, mesh] of meshes) {
        if (wanted.has(id)) continue;
        scene.remove(mesh);
        disposeLayerMesh(mesh);
        meshes.delete(id);
      }

      let visibilityChanged = false;
      for (const layer of layers) {
        const existing = meshes.get(layer.id);
        if (existing) {
          if (existing.visible !== layer.visible) visibilityChanged = true;
          existing.visible = layer.visible;
          continue;
        }
        if (loadingRef.current.has(layer.id)) continue;
        loadingRef.current.add(layer.id);
        void (async () => {
          try {
            const parsed = await parseModelPreview(layer.file, {
              companionFiles: layer.companionFiles || [],
            });
            const geometry = parsed.geometry;
            if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
            const material =
              layer.tone === "scan"
                ? createModelPreviewMaterial(geometry, parsed.texture, {
                    colorMapping: colorMappingRef.current,
                  })
                : designMaterial(layer.tone);
            if (layer.tone === "scan" && isScanColorPreview(geometry, parsed.texture)) {
              applyScanRendering(renderer, colorMappingRef.current);
            }
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = layer.file.name || layer.id;
            mesh.userData[TONE_KEY] = layer.tone;
            mesh.userData[LAYER_ID_KEY] = layer.id;
            if (layer.tone === "scan") mesh.userData[TEXTURE_KEY] = parsed.texture;
            mesh.renderOrder = layer.tone === "scan" ? 0 : 1;
            syncBackFaceShell(mesh);
            syncToothLabel(mesh);
            if (!sceneRef.current) {
              disposeLayerMesh(mesh);
              return;
            }
            const latest = layersRef.current.find((l) => l.id === layer.id);
            if (!latest) {
              disposeLayerMesh(mesh);
              return;
            }
            mesh.visible = latest.visible;
            sceneRef.current.add(mesh);
            meshes.set(layer.id, mesh);
            loadingRef.current.delete(layer.id);
            assemble();
            if (!userMovedRef.current && mesh.visible) fitToView();
          } catch (error) {
            onLayerErrorRef.current?.(
              layer.id,
              error instanceof Error ? error.message : "3D 파일을 읽지 못했습니다.",
            );
            loadingRef.current.delete(layer.id);
            if (sceneRef.current) assemble();
          } finally {
            loadingRef.current.delete(layer.id);
          }
        })();
      }

      assemble();
      if (
        !userMovedRef.current &&
        visibilityChanged &&
        [...meshes.values()].some((m) => m.visible)
      ) {
        fitToView();
      }
      // assemble·fitToView는 ref만 읽는다.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layers]);

    useEffect(() => {
      if (designPending || !sceneRef.current) return;
      assemble();
      if (!userMovedRef.current) fitToView();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [designPending]);

    useEffect(() => {
      const opacity = transparencyToOpacity(prosthesisTransparency);
      for (const mesh of meshesRef.current.values()) {
        if (layerToneOf(mesh) !== "prosthesis") continue;
        applyProsthesisOpacity(
          mesh,
          reviewRef.current?.crown === mesh ? Math.min(opacity, REVIEW_CROWN_OPACITY) : opacity,
        );
      }
    }, [prosthesisTransparency]);

    useEffect(() => {
      if (!sceneRef.current || designPending) return;
      assemble();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storedSeats]);

    useEffect(() => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      let scanColor = false;
      for (const [id, mesh] of meshesRef.current) {
        if (layersRef.current.find((l) => l.id === id)?.tone !== "scan") continue;
        const texture = scanTexture(mesh);
        if (!isScanColorPreview(mesh.geometry, texture)) continue;
        scanColor = true;
        const prev = mesh.material as THREE.Material;
        mesh.material = createModelPreviewMaterial(mesh.geometry, texture, { colorMapping });
        prev.dispose();
        syncBackFaceShell(mesh);
      }
      if (scanColor) applyScanRendering(renderer, colorMapping);
    }, [colorMapping]);

    return (
      <div className={cn("absolute inset-0 overflow-hidden", className)}>
        <div ref={containerRef} className="absolute inset-0" />
        {seatPercent !== null ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="pointer-events-auto w-64 rounded-lg bg-black/60 px-4 py-3 text-xs text-white shadow-md">
              <p className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                어벗을 보철에 맞추는 중
                <span className="ml-auto tabular-nums">{seatPercent}%</span>
              </p>
              <Progress value={seatPercent} className="mt-2 h-1.5" />
              <div className="mt-2 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 bg-white/90 px-2.5 text-[11px] text-foreground hover:bg-white"
                  onClick={cancelSeat}
                >
                  중단
                </Button>
              </div>
            </div>
          </div>
        ) : null}
        {review && seatPercent === null ? (
          <SeatReviewCard review={review} deciding={deciding} onDecide={decideSeat} />
        ) : null}
      </div>
    );
  },
);

const pct = (v: number) => `${Math.round(v * 100)}%`;
const mm = (v: number) => `${v.toFixed(2)}mm`;

function SeatReviewCard({
  review,
  deciding,
  onDecide,
}: {
  review: SeatReview;
  deciding: boolean;
  onDecide: (confirmed: boolean) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
      <div className="pointer-events-auto w-fit min-w-[16rem] max-w-[min(100%,36rem)] rounded-lg border bg-white/95 px-4 py-3 text-xs shadow-md">
        <p className="text-sm font-semibold">어벗 위치 확인</p>
        <p className="mt-0.5 text-muted-foreground">
          {toothLabelFromMeshName(review.crown.name) || review.crown.name}
        </p>
        <ul className="mt-2 space-y-1">
          {review.paired.map((mesh, i) => {
            const seat = review.seats[i];
            const tooth = toothLabelFromMeshName(mesh.name) || mesh.name;
            if (!seat) {
              return (
                <li key={mesh.uuid} className="text-muted-foreground">
                  {tooth} · 자리를 못 찾음
                </li>
              );
            }
            const d = seat.deviation;
            return (
              <li key={mesh.uuid} className="tabular-nums">
                <span className="font-medium">{tooth}</span> · 접촉 {pct(d.contact)} · 중앙{" "}
                {mm(d.medianMm)} · 최대 틈 {mm(d.maxGapMm)} · 관통 {mm(d.maxPenetrationMm)}
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] text-muted-foreground">
          {HEAT_BANDS.map((b) => (
            <span key={b.label} className="flex items-center gap-1">
              <span
                className="h-2 w-2 rounded-sm"
                style={{ backgroundColor: `#${b.color.getHexString()}` }}
              />
              {b.label}
            </span>
          ))}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="outline" disabled={deciding} onClick={() => onDecide(false)}>
            안 맞음
          </Button>
          <Button size="sm" disabled={deciding} onClick={() => onDecide(true)}>
            맞음 · 저장
          </Button>
        </div>
      </div>
    </div>
  );
}
