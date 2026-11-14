// 치과 채팅창 「디자인」 버튼 → 전체 화면 프리뷰 모달.
// 치과 스캔에서 스캔바디를 인식·라이브러리 정합해 픽스쳐 위치를 잡고, 그 상방에 커스텀어벗 STL을 디자인하여
// 스캔 치아 데이터 위에 올라간 모습으로 확인한다. 수정은 AI 대화로 디자인 조정값을 바꿔 다시 만든다.
// 한 번 만든 디자인은 이 브라우저에 저장해 다시 열 때 그대로 보여 준다.
// related files:
// - web/frontend/src/shared/practice/customAbutmentScanbodyMatch.ts
// - web/frontend/src/shared/practice/customAbutmentStlDesign.ts
// - web/frontend/src/shared/practice/customAbutmentDesignParams.ts
// - web/frontend/src/shared/practice/customAbutmentDesignCache.ts
// - web/backend/controllers/ai/customAbutmentDesignChat.controller.js
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import {
  Bot,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Maximize2,
  Paintbrush,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  VIEW_GESTURE_HINT_LAYER_CLASS,
  ViewGestureHint,
} from "@/shared/components/ViewGestureHint";
import { saveBlobAsDownload } from "@/shared/files/downloadWithProgress";
import {
  applyScanColorToneMapping,
  createModelPreviewMaterial,
  fileFromImageBlob,
  fileFromModelBlob,
  getModelExtLower,
  isScanColorPreview,
  parseModelPreview,
  peekPlyHeaderInfo,
  resolveCompanionTextureFileName,
  SCAN_COLOR_PREVIEW_BACKGROUND,
} from "@/shared/files/modelPreviewFile";
import { fetchS3BlobCached } from "@/shared/files/s3BlobCache";
import { buildS3ProxyDownloadUrl } from "@/shared/files/useS3FileDownload";
import { registerJawsToBiteResult } from "@/shared/practice/biteRegistration";
import {
  CUSTOM_ABUTMENT_DESIGN_VERSION,
  customAbutmentDesignCacheKey,
  readCustomAbutmentDesign,
  toArrayBuffer,
  writeCustomAbutmentDesign,
  type CachedAlignedScan,
  type CustomAbutmentChatTurn,
} from "@/shared/practice/customAbutmentDesignCache";
import {
  CUSTOM_ABUTMENT_PARAM_SPECS,
  EMPTY_CUSTOM_ABUTMENT_PREFERENCE,
  describeCustomAbutmentPreference,
  hasCustomAbutmentPreference,
  parseCustomAbutmentParamOverrides,
  parseCustomAbutmentPreference,
  preferenceOverridesForTooth,
  type CustomAbutmentDesignParams,
  type CustomAbutmentDesignPreference,
  type CustomAbutmentParamKey,
} from "@/shared/practice/customAbutmentDesignParams";
import {
  buildScanGeometryWithoutScanbodies,
  detectAndMatchScanbodiesOnJaw,
  fixturePoseToMatrix4,
  loadCandidateScanbodyModels,
  parseFdiTooth,
  type MatchedScanbodyFixture,
} from "@/shared/practice/customAbutmentScanbodyMatch";
import {
  buildDesignedCustomAbutment,
  designCustomAbutmentStl,
  type DesignedCustomAbutment,
} from "@/shared/practice/customAbutmentStlDesign";
import { estimateDentalFrame, type DentalFrame } from "@/shared/practice/dentalFrame";
import {
  isOralScanMeshName,
  preferWorkingOralScanFiles,
  resolveOralScanRole,
} from "@/shared/practice/labProsthesisAiDesign";
import { apiFetch } from "@/shared/api/apiClient";
import { type ScanbodyCatalog } from "@/shared/practice/scanbodyLibraryApi";
import { toToothMemoSortNumber, type ToothWorkSelection } from "@/shared/practice/transferMemo";
import { useImplantConnectionCatalog } from "@/shared/practice/useImplantConnectionCatalog";
import { disposeBackFaceShell, syncBackFaceShell } from "@/shared/three/backFaceShell";
import { ScreenSpaceOrbitControls } from "@/shared/three/screenSpaceOrbitControls";
import {
  applyOrthoHeight,
  readHostSize,
  resizeWebglToHost,
} from "@/shared/three/squarePixelViewport";
import { cn } from "@/shared/ui/cn";
import {
  WIDE_CLUSTER_ROW_CLASS,
  WIDE_CLUSTER_SEPARATOR_CLASS,
} from "@/shared/ui/contentMeasuredChrome";

export type PracticeDesignPreviewFileItem = {
  fileName: string;
  s3Key?: string;
  size?: number;
  scanRole?: string | null;
  uploadedAt?: string | null;
};

export type PracticeCustomAbutmentPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authToken?: string | null;
  caseTitle?: string;
  caseDatesLabel?: string;
  patientName?: string;
  toothWorks: readonly ToothWorkSelection[];
  files: readonly PracticeDesignPreviewFileItem[];
  workScanFiles?: readonly PracticeDesignPreviewFileItem[];
  /** 기공의뢰 id. 의뢰 치과의 디자인 취향을 읽고 저장할 때 쓴다. */
  transferId?: string;
};

type CenterGuideMode = "off" | "center" | "grid";

type LoadedJawScan = {
  role: "upper" | "lower" | "bite";
  fileName: string;
  geometry: THREE.BufferGeometry;
  texture: THREE.Texture | null;
};

type PipelineStatus =
  | { kind: "loading"; percent: number; step: string }
  | { kind: "ready" }
  | { kind: "error"; message: string };

type ChatTurn = CustomAbutmentChatTurn & { pending?: boolean };

type DesignChange = { toothNumber: string; params: Partial<CustomAbutmentDesignParams> };

/** 재디자인·저장에 쓰는 현재 디자인 입력. 렌더와 무관해서 ref로 둔다. */
type DesignContext = {
  cacheKey: string;
  patientName: string;
  jawGeometry: { upper: THREE.BufferGeometry | null; lower: THREE.BufferGeometry | null };
  fixtures: MatchedScanbodyFixture[];
  overrides: Record<string, Partial<CustomAbutmentDesignParams>>;
  alignedScans: CachedAlignedScan[];
};

const VIEWER_PLAIN_BG = 0xe6e9ec;
const FIT_MARGIN = 1.06;
const CHAT_EXAMPLES = [
  "포스트를 0.5mm 낮춰줘",
  "삽입축을 순측으로 조금 기울여줘",
  "포스트를 더 수직으로",
  "앞으로 마진은 치은 하방 0.8mm로",
];

function nextCenterGuide(mode: CenterGuideMode): CenterGuideMode {
  if (mode === "off") return "center";
  if (mode === "center") return "grid";
  return "off";
}

function centerGuideLabel(mode: CenterGuideMode): string {
  if (mode === "center") return "중앙선";
  if (mode === "grid") return "모눈";
  return "가이드";
}

function createFixtureAnalogGeometry(originDiameterMm: number, lengthMm = 9.5): THREE.BufferGeometry {
  const topR = Math.max(1.5, originDiameterMm * 0.56);
  const botR = Math.max(1.15, topR * 0.78);
  const geo = new THREE.CylinderGeometry(topR, botR, lengthMm, 32, 8, false);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0, -lengthMm / 2 - 0.05);
  geo.computeVertexNormals();
  return geo;
}

function formatParamValue(key: CustomAbutmentParamKey, value: number): string {
  const spec = CUSTOM_ABUTMENT_PARAM_SPECS[key];
  const digits = spec.step >= 0.5 ? 1 : 2;
  const text = Number(value.toFixed(digits)).toString();
  return spec.unit === "배" ? `×${text}` : `${text}${spec.unit}`;
}

/** 바뀐 조정값 요약(대화에 붙인다). */
function describeChanges(
  changes: readonly DesignChange[],
  before: ReadonlyMap<string, CustomAbutmentDesignParams>,
): string {
  const lines: string[] = [];
  for (const change of changes) {
    const prev = before.get(change.toothNumber);
    const parts: string[] = [];
    for (const [key, value] of Object.entries(change.params) as Array<[CustomAbutmentParamKey, number]>) {
      const spec = CUSTOM_ABUTMENT_PARAM_SPECS[key];
      const from = prev ? formatParamValue(key, prev[key]) : "";
      parts.push(`${spec.label} ${from ? `${from} → ` : ""}${formatParamValue(key, value)}`);
    }
    if (parts.length) lines.push(`#${change.toothNumber} ${parts.join(", ")}`);
  }
  return lines.join("\n");
}

function metricsForAi(d: DesignedCustomAbutment) {
  const m = d.metrics;
  return {
    maxDiameterMm: m.maxDiameterMm,
    cuffHeightMinMm: m.cuffHeightMinMm,
    cuffHeightMaxMm: m.cuffHeightMaxMm,
    postHeightMm: m.postHeightMm,
    angulationDeg: m.angulationDeg,
    cutbackMm: m.cutbackMm,
    postTaperDeg: m.postTaperDeg,
    occlusalClearanceMm: m.occlusalClearanceMm,
    axisSource: m.axisSource,
  };
}

export function PracticeCustomAbutmentPreviewButton({
  disabled,
  className,
  ...dialogProps
}: Omit<PracticeCustomAbutmentPreviewDialogProps, "open" | "onOpenChange"> & {
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        className={cn(
          "h-7 shrink-0 gap-1 border-primary/45 bg-background px-2.5 text-xs font-medium text-primary hover:bg-primary/10 hover:text-primary",
          className,
        )}
        onClick={() => setOpen(true)}
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0" />
        <span>디자인</span>
      </Button>
      {open ? (
        <PracticeCustomAbutmentPreviewDialog
          {...dialogProps}
          open={open}
          onOpenChange={setOpen}
        />
      ) : null}
    </>
  );
}

function ToolbarToggle({
  active,
  onClick,
  icon,
  label,
  tip,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon?: ReactNode;
  label: string;
  tip?: string;
  disabled?: boolean;
}) {
  const button = (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      className="h-8 gap-1.5 px-2.5 text-xs"
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </Button>
  );
  if (!tip) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="bottom" className="z-[520]">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

export function PracticeCustomAbutmentPreviewDialog({
  open,
  onOpenChange,
  authToken,
  caseTitle,
  caseDatesLabel,
  patientName,
  toothWorks,
  files,
  workScanFiles = [],
  transferId,
}: PracticeCustomAbutmentPreviewDialogProps) {
  const { connections } = useImplantConnectionCatalog(open ? (authToken ?? null) : null);

  const abutmentToothWorks = useMemo(() => {
    const seen = new Set<string>();
    const list: ToothWorkSelection[] = [];
    for (const row of toothWorks || []) {
      if (!row?.customAbutment) continue;
      const parsed = parseFdiTooth(row.toothNumber);
      if (!parsed || seen.has(parsed.digits)) continue;
      seen.add(parsed.digits);
      list.push({ ...row, toothNumber: parsed.digits });
    }
    return list.sort(
      (a, b) => toToothMemoSortNumber(a.toothNumber) - toToothMemoSortNumber(b.toothNumber),
    );
  }, [toothWorks]);

  const scanSources = useMemo(() => {
    const merged: PracticeDesignPreviewFileItem[] = [];
    const seen = new Set<string>();
    const push = (item: PracticeDesignPreviewFileItem) => {
      const key = String(item.s3Key || item.fileName || "").trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      merged.push(item);
    };
    for (const f of workScanFiles) push(f);
    for (const f of files) push(f);
    const preferred = preferWorkingOralScanFiles(merged);
    const meshes = preferred.filter(
      (f) => Boolean(f.s3Key) && isOralScanMeshName(f.fileName),
    );
    const companions = merged.filter((f) => {
      if (!f.s3Key) return false;
      return /\.(mtl|jpe?g|png|webp|bmp)$/i.test(f.fileName);
    });
    return { meshes, companions };
  }, [files, workScanFiles]);

  const [status, setStatus] = useState<PipelineStatus>({
    kind: "loading",
    percent: 5,
    step: "구강 스캔을 불러오는 중…",
  });
  const [designedList, setDesignedList] = useState<DesignedCustomAbutment[]>([]);
  const [restoredFromCache, setRestoredFromCache] = useState(false);
  const [colorMapping, setColorMapping] = useState(true);
  const [centerGuide, setCenterGuide] = useState<CenterGuideMode>("off");
  const [hideScanbodyOnScan, setHideScanbodyOnScan] = useState(true);
  const [showPredictedCrown, setShowPredictedCrown] = useState(false);
  const [showFixtureAnalog, setShowFixtureAnalog] = useState(true);
  const [showFinishLine, setShowFinishLine] = useState(true);
  const [opposingTransparency, setOpposingTransparency] = useState(55);
  const [visibleJaws, setVisibleJaws] = useState<{ upper: boolean; lower: boolean }>({
    upper: true,
    lower: true,
  });
  const [availableJaws, setAvailableJaws] = useState<{ upper: boolean; lower: boolean }>({
    upper: false,
    lower: false,
  });
  const [visibleTeeth, setVisibleTeeth] = useState<Record<string, boolean>>({});
  const [selectedTooth, setSelectedTooth] = useState<string | null>(null);
  const [hostEl, setHostEl] = useState<HTMLDivElement | null>(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [redesigning, setRedesigning] = useState<string[]>([]);
  const [preference, setPreference] = useState<CustomAbutmentDesignPreference>(
    EMPTY_CUSTOM_ABUTMENT_PREFERENCE,
  );
  const [preferenceCanSave, setPreferenceCanSave] = useState(false);
  const preferenceRef = useRef<CustomAbutmentDesignPreference>(EMPTY_CUSTOM_ABUTMENT_PREFERENCE);
  const transferIdParam = String(transferId || "").trim();

  const hostRef = useRef<HTMLDivElement | null>(null);
  const bindHostRef = useCallback((node: HTMLDivElement | null) => {
    hostRef.current = node;
    setHostEl(node);
  }, []);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const labelRendererRef = useRef<CSS2DRenderer | null>(null);
  const controlsRef = useRef<ScreenSpaceOrbitControls | null>(null);
  const frameRef = useRef<DentalFrame | null>(null);
  const designContextRef = useRef<DesignContext | null>(null);
  const designedListRef = useRef<DesignedCustomAbutment[]>([]);
  designedListRef.current = designedList;
  const chatTurnsRef = useRef<ChatTurn[]>([]);
  chatTurnsRef.current = chatTurns;
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const jawMeshesRef = useRef<{
    upperRaw: THREE.Mesh[];
    upperTrimmed: THREE.Mesh[];
    lowerRaw: THREE.Mesh[];
    lowerTrimmed: THREE.Mesh[];
  }>({
    upperRaw: [],
    upperTrimmed: [],
    lowerRaw: [],
    lowerTrimmed: [],
  });
  const abutmentMeshesRef = useRef(new Map<string, THREE.Mesh>());
  const predictedCrownMeshesRef = useRef(new Map<string, THREE.Mesh>());
  const fixtureMeshesRef = useRef(new Map<string, THREE.Mesh>());
  const marginLinesRef = useRef(new Map<string, THREE.LineLoop>());

  const prepJaws = useMemo(() => {
    const set = new Set<"upper" | "lower">();
    for (const row of abutmentToothWorks) {
      const p = parseFdiTooth(row.toothNumber);
      if (p) set.add(p.jaw);
    }
    return set;
  }, [abutmentToothWorks]);

  const disposeMesh = useCallback((mesh: THREE.Mesh) => {
    sceneRef.current?.remove(mesh);
    mesh.children.slice().forEach((ch) => {
      if (ch instanceof CSS2DObject) {
        ch.element.remove();
        mesh.remove(ch);
      }
    });
    disposeBackFaceShell(mesh);
    mesh.geometry.dispose();
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const savedTex = mesh.userData.previewTexture as THREE.Texture | undefined;
    if (mat.map && mat.map !== savedTex) mat.map.dispose();
    savedTex?.dispose();
    mat.dispose();
  }, []);

  const removeDesignFromScene = useCallback(
    (toothNumber: string) => {
      for (const map of [abutmentMeshesRef, predictedCrownMeshesRef, fixtureMeshesRef]) {
        const mesh = map.current.get(toothNumber);
        if (mesh) disposeMesh(mesh);
        map.current.delete(toothNumber);
      }
      const line = marginLinesRef.current.get(toothNumber);
      if (line) {
        sceneRef.current?.remove(line);
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      }
      marginLinesRef.current.delete(toothNumber);
    },
    [disposeMesh],
  );

  const addDesignToScene = useCallback((d: DesignedCustomAbutment) => {
    const scene = sceneRef.current;
    if (!scene) return;

    const abutMat = new THREE.MeshStandardMaterial({
      color: 0xd4c59e,
      metalness: 0.52,
      roughness: 0.3,
      side: THREE.DoubleSide,
    });
    const abutMesh = new THREE.Mesh(d.worldGeometry, abutMat);
    abutMesh.renderOrder = 2;
    syncBackFaceShell(abutMesh);

    if (!d.worldGeometry.boundingBox) d.worldGeometry.computeBoundingBox();
    const tagEl = document.createElement("div");
    tagEl.textContent = `#${d.toothNumber}`;
    tagEl.style.cssText =
      "pointer-events:none;user-select:none;border-radius:0.375rem;" +
      "background:rgba(15,23,42,0.82);color:#fff;font:600 0.6875rem/1.2 ui-sans-serif,system-ui,sans-serif;" +
      "padding:0.18rem 0.42rem;white-space:nowrap;";
    const badge = new CSS2DObject(tagEl);
    const abutCenter = d.worldGeometry.boundingBox
      ? d.worldGeometry.boundingBox.getCenter(new THREE.Vector3())
      : new THREE.Vector3(...d.fixture.scanbodyTop);
    badge.position.copy(abutCenter);
    abutMesh.add(badge);
    scene.add(abutMesh);
    abutmentMeshesRef.current.set(d.toothNumber, abutMesh);

    const crownMat = new THREE.MeshStandardMaterial({
      color: 0xf5f0e1,
      metalness: 0.04,
      roughness: 0.36,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const crownMesh = new THREE.Mesh(d.predictedCrownWorldGeometry, crownMat);
    crownMesh.renderOrder = 4;
    crownMesh.visible = false;
    scene.add(crownMesh);
    predictedCrownMeshesRef.current.set(d.toothNumber, crownMesh);

    const fixGeo = createFixtureAnalogGeometry(d.fixture.connectionSpec.originDiameterMm);
    fixGeo.applyMatrix4(fixturePoseToMatrix4(d.fixture.fixturePose));
    const fixMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.48,
      roughness: 0.38,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    });
    const fixMesh = new THREE.Mesh(fixGeo, fixMat);
    fixMesh.renderOrder = 3;
    scene.add(fixMesh);
    fixtureMeshesRef.current.set(d.toothNumber, fixMesh);

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.BufferAttribute(d.marginLoopWorld, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x0d9488,
      depthTest: false,
      transparent: true,
      opacity: 0.9,
    });
    const marginLine = new THREE.LineLoop(lineGeo, lineMat);
    marginLine.renderOrder = 5;
    scene.add(marginLine);
    marginLinesRef.current.set(d.toothNumber, marginLine);
  }, []);

  const clearSceneObjects = useCallback(() => {
    for (const list of Object.values(jawMeshesRef.current)) {
      for (const m of list) disposeMesh(m);
    }
    jawMeshesRef.current = {
      upperRaw: [],
      upperTrimmed: [],
      lowerRaw: [],
      lowerTrimmed: [],
    };
    for (const tooth of [...abutmentMeshesRef.current.keys()]) removeDesignFromScene(tooth);
  }, [disposeMesh, removeDesignFromScene]);

  const fitCameraToTargets = useCallback(
    (targets: THREE.Object3D[], viewDir?: THREE.Vector3, upDir?: THREE.Vector3) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      const host = hostRef.current;
      if (!camera || !controls || !host || targets.length === 0) return;

      const box = new THREE.Box3();
      for (const obj of targets) {
        obj.updateMatrixWorld(true);
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          if (m.geometry.boundingBox && !m.geometry.boundingBox.isEmpty()) {
            box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));
          }
        } else {
          box.expandByObject(obj);
        }
      }
      if (box.isEmpty()) return;

      const center = box.getCenter(new THREE.Vector3());
      const dir = (
        viewDir && viewDir.lengthSq() > 1e-6
          ? viewDir.clone()
          : camera.position.clone().sub(controls.target)
      ).normalize();
      if (dir.lengthSq() < 1e-6) dir.set(0, -0.75, 0.66).normalize();
      if (upDir && upDir.lengthSq() > 1e-6) {
        const cleanUp = upDir.clone().addScaledVector(dir, -upDir.dot(dir));
        if (cleanUp.lengthSq() > 1e-6) camera.up.copy(cleanUp.normalize());
      }

      camera.position.copy(center).add(dir);
      camera.lookAt(center);
      camera.updateMatrixWorld();
      const toView = new THREE.Matrix4().makeRotationFromQuaternion(camera.quaternion).invert();

      const min = new THREE.Vector3(Infinity, Infinity, Infinity);
      const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      const pt = new THREE.Vector3();
      let count = 0;

      for (const obj of targets) {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) continue;
        const pos = mesh.geometry.getAttribute("position");
        if (!pos) continue;
        const stride = Math.max(1, Math.floor(pos.count / 35000));
        for (let i = 0; i < pos.count; i += stride) {
          pt.fromBufferAttribute(pos, i)
            .applyMatrix4(mesh.matrixWorld)
            .sub(center)
            .applyMatrix4(toView);
          min.min(pt);
          max.max(pt);
          count += 1;
        }
      }
      if (count === 0) return;

      const aspect = readHostSize(host).aspect;
      const halfW = Math.max((max.x - min.x) / 2, 2);
      let halfH = Math.max((max.y - min.y) / 2, 2);
      if (halfW / halfH > aspect) halfH = halfW / aspect;
      halfH *= FIT_MARGIN;

      const mid = new THREE.Vector3((min.x + max.x) / 2, (min.y + max.y) / 2, 0)
        .applyQuaternion(camera.quaternion)
        .add(center);
      const depth = Math.max(max.z - min.z, halfH, 10);
      const distance = Math.max(max.z + depth * 1.5, halfH * 4, 60);

      controls.target.copy(mid);
      camera.position.copy(mid).addScaledVector(dir, distance);
      camera.near = Math.max(distance / 250, 0.05);
      camera.far = distance * 200;
      camera.zoom = 1;
      applyOrthoHeight(camera, halfH, aspect);
      camera.lookAt(mid);
      controls.syncFromCamera();
    },
    [],
  );

  const fitDefaultCamera = useCallback(() => {
    const frame = frameRef.current;
    const abutMeshes = [...abutmentMeshesRef.current.values()].filter((m) => m.visible);
    const jawMeshes = [
      ...jawMeshesRef.current.upperTrimmed,
      ...jawMeshesRef.current.upperRaw,
      ...jawMeshesRef.current.lowerTrimmed,
      ...jawMeshesRef.current.lowerRaw,
    ].filter((m) => m.visible);
    const targets = jawMeshes.length > 0 ? [...jawMeshes, ...abutMeshes] : abutMeshes;
    if (targets.length === 0) return;

    if (frame) {
      const onlyUpper = prepJaws.has("upper") && !prepJaws.has("lower");
      const onlyLower = prepJaws.has("lower") && !prepJaws.has("upper");
      const tilt = onlyUpper ? -0.45 : onlyLower ? 0.45 : 0.22;
      const viewDir = frame.anterior
        .clone()
        .multiplyScalar(0.9)
        .addScaledVector(frame.up, tilt)
        .normalize();
      fitCameraToTargets(targets, viewDir, frame.up);
      return;
    }
    fitCameraToTargets(targets);
  }, [fitCameraToTargets, prepJaws]);

  const focusSingleTooth = useCallback(
    (toothNumber: string) => {
      setSelectedTooth(toothNumber);
      const designed = designedListRef.current.find((d) => d.toothNumber === toothNumber);
      const mesh = abutmentMeshesRef.current.get(toothNumber);
      const frame = frameRef.current;
      if (!designed || !mesh) return;
      const labial = new THREE.Vector3(...designed.fixture.labialDir);
      const occ = new THREE.Vector3(...designed.fixture.archOcclusalDir);
      const viewDir = labial.multiplyScalar(0.82).addScaledVector(occ, 0.52).normalize();
      const upDir = frame ? frame.up.clone() : new THREE.Vector3(0, 0, 1);
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox?.clone();
      if (box) {
        box.expandByScalar(8);
        const helper = new THREE.Mesh(
          new THREE.BoxGeometry(
            box.max.x - box.min.x,
            box.max.y - box.min.y,
            box.max.z - box.min.z,
          ),
        );
        box.getCenter(helper.position);
        fitCameraToTargets([helper], viewDir, upDir);
        helper.geometry.dispose();
        return;
      }
      fitCameraToTargets([mesh], viewDir, upDir);
    },
    [fitCameraToTargets],
  );

  /** 지금 디자인·조정값·대화를 저장한다. 실패해도 화면은 그대로 둔다. */
  const persistDesign = useCallback((chat?: readonly ChatTurn[]) => {
    const ctx = designContextRef.current;
    if (!ctx) return;
    const list = designedListRef.current;
    const turns = (chat ?? chatTurnsRef.current)
      .filter((t) => !t.pending)
      .map((t) => ({ role: t.role, text: t.text }))
      .slice(-40);
    void writeCustomAbutmentDesign({
      key: ctx.cacheKey,
      version: CUSTOM_ABUTMENT_DESIGN_VERSION,
      savedAt: Date.now(),
      alignedScans: ctx.alignedScans,
      teeth: list.map((d) => ({
        toothNumber: d.toothNumber,
        fileName: d.fileName,
        fixture: d.fixture,
        overrides: ctx.overrides[d.toothNumber] ?? {},
        params: d.params,
        metrics: d.metrics,
        localPositions: toArrayBuffer(d.localPositions),
        crownLocalPositions: toArrayBuffer(d.crownLocalPositions),
        marginLoopLocal: toArrayBuffer(d.marginLoopLocal),
      })),
      chat: turns,
    }).catch((err) => console.warn("[custom-abutment] design cache write failed", err));
  }, []);

  const latestInputsRef = useRef({
    abutmentToothWorks,
    scanSources,
    connections,
    patientName,
    workScanFiles,
  });
  latestInputsRef.current = {
    abutmentToothWorks,
    scanSources,
    connections,
    patientName,
    workScanFiles,
  };

  const pipelineKey = useMemo(
    () =>
      JSON.stringify({
        teeth: abutmentToothWorks.map((t) => [
          t.toothNumber,
          t.implantManufacturer,
          t.implantBrand,
          t.implantFamily,
          t.implantType,
          t.abutmentManufacturer,
          t.abutmentDiameter,
          t.abutmentHeight,
        ]),
        scans: scanSources.meshes.map((s) => [s.s3Key, s.fileName, s.scanRole]),
      }),
    [abutmentToothWorks, scanSources.meshes],
  );

  // WebGL 씬 초기화 (Radix DialogPortal이 마운트된 뒤 hostEl 콜백 ref로 실행)
  useEffect(() => {
    if (!open || !hostEl) return;
    const host = hostEl;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SCAN_COLOR_PREVIEW_BACKGROUND);
    sceneRef.current = scene;

    const { width, height, aspect } = readHostSize(host);
    const camera = new THREE.OrthographicCamera(-20 * aspect, 20 * aspect, 20, -20, 0.1, 4000);
    camera.position.set(0, 90, 20);
    camera.up.set(0, 0, 1);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    applyScanColorToneMapping(renderer);
    renderer.domElement.className = "block h-full w-full touch-none select-none";
    host.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(width, height);
    labelRenderer.domElement.style.cssText =
      "position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:4;";
    host.appendChild(labelRenderer.domElement);
    labelRendererRef.current = labelRenderer;

    const hemi = new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 0.92);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.08);
    const fillLight = new THREE.DirectionalLight(0xf8fafc, 0.58);
    const rimLight = new THREE.DirectionalLight(0xe2e8f0, 0.42);
    scene.add(keyLight, fillLight, rimLight);

    const controls = new ScreenSpaceOrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;

    let raf = 0;
    const renderLoop = () => {
      raf = window.requestAnimationFrame(renderLoop);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      const fwd = camera.position.clone().sub(controls.target).normalize();
      keyLight.position
        .copy(controls.target)
        .addScaledVector(fwd, 120)
        .addScaledVector(up, 55)
        .addScaledVector(right, 35);
      fillLight.position
        .copy(controls.target)
        .addScaledVector(fwd, 95)
        .addScaledVector(right, -65)
        .addScaledVector(up, -25);
      rimLight.position
        .copy(controls.target)
        .addScaledVector(fwd, -90)
        .addScaledVector(up, 50);

      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    };
    renderLoop();

    const onResize = () => {
      if (!host) return;
      const next = resizeWebglToHost(renderer, host);
      labelRenderer.setSize(next.width, next.height);
      const halfH = (camera.top - camera.bottom) / 2;
      applyOrthoHeight(camera, halfH, next.aspect);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      clearSceneObjects();
      renderer.dispose();
      renderer.domElement.remove();
      labelRenderer.domElement.remove();
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      labelRendererRef.current = null;
      controlsRef.current = null;
    };
  }, [clearSceneObjects, hostEl, open]);

  // 스캔 로드 → (저장본 복원 | 스캔바디 인식·정합 → 커스텀어벗 디자인) → 씬 배치
  useEffect(() => {
    if (!open || !hostEl) return;
    const {
      abutmentToothWorks: curToothWorks,
      scanSources: curScanSources,
      connections: curConnections,
      patientName: curPatientName,
      workScanFiles: curWorkScanFiles,
    } = latestInputsRef.current;
    const token = String(authToken || "").trim();
    if (!token) {
      setStatus({ kind: "error", message: "로그인이 필요합니다." });
      return;
    }
    if (curToothWorks.length === 0) {
      setStatus({ kind: "error", message: "커스텀어벗 디자인 대상 치아가 없습니다." });
      return;
    }
    if (curScanSources.meshes.length === 0) {
      setStatus({
        kind: "error",
        message: "구강 스캔 파일(DCM·PLY·STL·OBJ)이 없어 디자인 프리뷰를 만들 수 없습니다.",
      });
      return;
    }

    const abort = new AbortController();
    let cancelled = false;
    const cacheKey = customAbutmentDesignCacheKey(pipelineKey);

    const loadSingleScan = async (
      item: PracticeDesignPreviewFileItem,
      onProgress: (p: number) => void,
    ): Promise<LoadedJawScan | null> => {
      const s3Key = String(item.s3Key || "").trim();
      if (!s3Key) return null;
      const role = resolveOralScanRole({
        fileName: item.fileName,
        scanRole: item.scanRole ?? undefined,
      });
      if (role !== "upper" && role !== "lower" && role !== "bite") return null;

      const blob = await fetchS3BlobCached({
        s3Key,
        fileName: item.fileName,
        token,
        buildUrl: buildS3ProxyDownloadUrl,
        onProgress,
        signal: abort.signal,
      });
      const modelFile = fileFromModelBlob(blob, item.fileName);
      const companionFiles: File[] = [];
      const ext = getModelExtLower(item.fileName);
      if ((ext === ".ply" || ext === ".obj") && curScanSources.companions.length > 0) {
        const preferredTex =
          ext === ".ply"
            ? peekPlyHeaderInfo(await blob.arrayBuffer()).textureFileName
            : null;
        const texName = resolveCompanionTextureFileName(
          item.fileName,
          preferredTex,
          curScanSources.companions.map((c) => c.fileName),
        );
        const hitComp = texName
          ? curScanSources.companions.find((c) => c.fileName === texName)
          : null;
        if (hitComp?.s3Key) {
          const texBlob = await fetchS3BlobCached({
            s3Key: hitComp.s3Key,
            fileName: hitComp.fileName,
            token,
            buildUrl: buildS3ProxyDownloadUrl,
            signal: abort.signal,
          });
          companionFiles.push(fileFromImageBlob(texBlob, hitComp.fileName));
        }
      }
      const parsed = await parseModelPreview(modelFile, { companionFiles });
      return {
        role,
        fileName: item.fileName,
        geometry: parsed.geometry,
        texture: parsed.texture ?? null,
      };
    };

    const runPipeline = async () => {
      try {
        clearSceneObjects();
        setDesignedList([]);
        setAvailableJaws({ upper: false, lower: false });
        setSelectedTooth(null);
        setRestoredFromCache(false);
        designContextRef.current = null;
        setStatus({ kind: "loading", percent: 8, step: "구강 스캔을 불러오는 중…" });

        const cachePromise = readCustomAbutmentDesign(cacheKey);
        const targetRoles = new Set<"upper" | "lower" | "bite">(["upper", "lower"]);
        const hasWorkScans = curWorkScanFiles.some((f) => isOralScanMeshName(f.fileName));
        if (!hasWorkScans) targetRoles.add("bite");

        const toLoad = curScanSources.meshes.filter((f) => {
          const r = resolveOralScanRole({
            fileName: f.fileName,
            scanRole: f.scanRole ?? undefined,
          });
          return r === "upper" || r === "lower" || (targetRoles.has("bite") && r === "bite");
        });

        const emptyCatalog: ScanbodyCatalog = {
          libraries: [],
          templates: [],
          templateUploads: [],
          labUploadRequestKeys: [],
        };
        const catalogPromise = apiFetch<{ data?: ScanbodyCatalog }>({
          path: "/api/scanbody-libraries",
          token,
          cacheTtlMs: 30_000,
        })
          .then((res) =>
            res.ok && res.data?.data
              ? {
                  ...emptyCatalog,
                  ...res.data.data,
                  templateUploads: res.data.data.templateUploads ?? [],
                  labUploadRequestKeys: res.data.data.labUploadRequestKeys ?? [],
                }
              : emptyCatalog,
          )
          .catch(() => emptyCatalog);
        const preferencePromise = apiFetch<{
          data?: { preference?: unknown; canSave?: boolean };
        }>({
          path: `/api/ai/custom-abutment-design-preference${
            transferIdParam ? `?transferId=${encodeURIComponent(transferIdParam)}` : ""
          }`,
          token,
        })
          .then((res) => ({
            preference: parseCustomAbutmentPreference(res.ok ? res.data?.data?.preference : null),
            canSave: Boolean(res.ok && res.data?.data?.canSave),
          }))
          .catch(() => ({ preference: EMPTY_CUSTOM_ABUTMENT_PREFERENCE, canSave: false }));
        void preferencePromise.then((p) => {
          if (cancelled) return;
          preferenceRef.current = p.preference;
          setPreference(p.preference);
          setPreferenceCanSave(p.canSave);
        });

        const progressByIdx = new Array<number>(Math.max(toLoad.length, 1)).fill(0);
        const [rawLoadedScans, cached] = await Promise.all([
          Promise.all(
            toLoad.map((item, idx) =>
              loadSingleScan(item, (pct) => {
                progressByIdx[idx] = pct;
                const avg =
                  progressByIdx.reduce((a, b) => a + b, 0) / Math.max(toLoad.length, 1);
                if (!cancelled) {
                  setStatus({
                    kind: "loading",
                    percent: Math.round(8 + avg * 0.45),
                    step: "구강 스캔을 불러오는 중…",
                  });
                }
              }),
            ),
          ),
          cachePromise,
        ]);
        const loadedScans = rawLoadedScans.filter(
          (row): row is LoadedJawScan => row != null,
        );
        if (cancelled) return;

        const upperScans = loadedScans.filter((s) => s.role === "upper");
        const lowerScans = loadedScans.filter((s) => s.role === "lower");
        const biteScans = loadedScans.filter((s) => s.role === "bite");
        const jawScans = [...upperScans, ...lowerScans];

        // 저장본: 바이트 정렬 결과 정점이 같은 스캔에 맞을 때만 그대로 쓴다.
        let restored = false;
        let alignedScans: CachedAlignedScan[] = [];
        if (cached && cached.teeth.length > 0) {
          const fits = cached.alignedScans.every((row) => {
            const scan = jawScans.find((s) => s.role === row.role && s.fileName === row.fileName);
            return scan?.geometry.getAttribute("position")?.count === row.vertexCount;
          });
          if (fits) {
            for (const row of cached.alignedScans) {
              const scan = jawScans.find((s) => s.role === row.role && s.fileName === row.fileName)!;
              const attr = scan.geometry.getAttribute("position") as THREE.BufferAttribute;
              (attr.array as Float32Array).set(new Float32Array(row.positions));
              attr.needsUpdate = true;
              scan.geometry.computeVertexNormals();
              scan.geometry.computeBoundingBox();
              scan.geometry.computeBoundingSphere();
            }
            alignedScans = cached.alignedScans;
            restored = true;
          }
        }

        if (!restored && !hasWorkScans && biteScans.length > 0 && jawScans.length > 0) {
          setStatus({ kind: "loading", percent: 58, step: "상·하악 교합을 맞추는 중…" });
          await new Promise<void>((r) => window.setTimeout(r, 0));
          await registerJawsToBiteResult(
            loadedScans.map((s) => ({ role: s.role, geometry: s.geometry })),
            { sweepPoses: true, cancelled: () => cancelled },
          );
          if (cancelled) return;
          alignedScans = jawScans.map((s) => {
            const attr = s.geometry.getAttribute("position") as THREE.BufferAttribute;
            return {
              fileName: s.fileName,
              role: s.role as "upper" | "lower",
              vertexCount: attr.count,
              positions: toArrayBuffer(attr.array as Float32Array),
            };
          });
        }

        const frame = estimateDentalFrame(
          jawScans.map((s) => ({ role: s.role, geometry: s.geometry })),
        );
        if (!frame) {
          for (const s of loadedScans) {
            s.geometry.dispose();
            s.texture?.dispose();
          }
          setStatus({
            kind: "error",
            message: "상악·하악 스캔 좌표를 해석하지 못했습니다.",
          });
          return;
        }
        frameRef.current = frame;

        const upperPrimary = upperScans[0]?.geometry ?? null;
        const lowerPrimary = lowerScans[0]?.geometry ?? null;
        const builtAbutments: DesignedCustomAbutment[] = [];
        const overrides: Record<string, Partial<CustomAbutmentDesignParams>> = {};

        if (restored && cached) {
          setStatus({ kind: "loading", percent: 80, step: "저장된 디자인을 여는 중…" });
          for (const row of cached.teeth) {
            overrides[row.toothNumber] = parseCustomAbutmentParamOverrides(row.overrides);
            builtAbutments.push(
              buildDesignedCustomAbutment({
                fixture: row.fixture,
                fileName: row.fileName,
                localPositions: new Float32Array(row.localPositions),
                crownLocalPositions: new Float32Array(row.crownLocalPositions),
                marginLoopLocal: new Float32Array(row.marginLoopLocal),
                params: row.params,
                metrics: row.metrics,
              }),
            );
          }
        } else {
          setStatus({
            kind: "loading",
            percent: 68,
            step: "스캔바디 인식 및 픽스쳐 위치 정합 중…",
          });
          await new Promise<void>((r) => window.setTimeout(r, 16));
          if (cancelled) return;
          const [curCatalog, curPreference] = await Promise.all([catalogPromise, preferencePromise]);
          if (cancelled) return;

          const teethByJaw = { upper: [] as ToothWorkSelection[], lower: [] as ToothWorkSelection[] };
          for (const tw of curToothWorks) {
            const parsed = parseFdiTooth(tw.toothNumber);
            if (parsed) teethByJaw[parsed.jaw].push(tw);
          }

          for (const jaw of ["upper", "lower"] as const) {
            const jawGeo = jaw === "upper" ? upperPrimary : lowerPrimary;
            const oppGeo = jaw === "upper" ? lowerPrimary : upperPrimary;
            const teeth = teethByJaw[jaw];
            if (!jawGeo || teeth.length === 0) continue;

            setStatus({
              kind: "loading",
              percent: jaw === "upper" ? 72 : 82,
              step: `${teeth.map((t) => `#${t.toothNumber}`).join(" ")} 스캔바디 매칭 중…`,
            });
            await new Promise<void>((r) => window.setTimeout(r, 16));
            if (cancelled) return;

            const withModels = await Promise.all(
              teeth.map(async (tw) => ({
                toothWork: tw,
                models: await loadCandidateScanbodyModels({
                  toothWork: tw,
                  catalog: curCatalog,
                  connections: curConnections,
                }),
              })),
            );
            if (cancelled) return;

            const matchedTeeth = detectAndMatchScanbodiesOnJaw({
              jawGeometry: jawGeo,
              frame,
              teeth: withModels,
              connections: curConnections,
            });
            const jawFixtures = teeth
              .map((tw) => matchedTeeth.get(tw.toothNumber))
              .filter((m): m is MatchedScanbodyFixture => m != null);

            for (const matched of jawFixtures) {
              setStatus({
                kind: "loading",
                percent: jaw === "upper" ? 78 : 90,
                step: `#${matched.toothNumber} 커스텀어벗 디자인 중…`,
              });
              const designed = await designCustomAbutmentStl({
                fixture: matched,
                jawGeometry: jawGeo,
                opposingGeometry: oppGeo,
                neighbors: jawFixtures,
                params: preferenceOverridesForTooth(matched.toothNumber, curPreference.preference),
                patientName: curPatientName,
              });
              if (cancelled) {
                designed.worldGeometry.dispose();
                designed.predictedCrownWorldGeometry.dispose();
                break;
              }
              builtAbutments.push(designed);
            }
          }
        }

        for (const bite of biteScans) {
          bite.geometry.dispose();
          bite.texture?.dispose();
        }

        if (cancelled || builtAbutments.length === 0) {
          for (const d of builtAbutments) {
            d.worldGeometry.dispose();
            d.predictedCrownWorldGeometry.dispose();
          }
          for (const s of jawScans) {
            s.geometry.dispose();
            s.texture?.dispose();
          }
          if (!cancelled) {
            setStatus({
              kind: "error",
              message: "스캔 데이터에서 의뢰 치아의 스캔바디를 찾지 못했습니다.",
            });
          }
          return;
        }

        const scene = sceneRef.current;
        if (!scene) {
          throw new Error("3D 뷰어 캔버스를 준비하지 못했습니다.");
        }

        const makeScanMesh = (
          geo: THREE.BufferGeometry,
          tex: THREE.Texture | null,
          shareTex: boolean,
        ) => {
          if (!geo.getAttribute("normal")) geo.computeVertexNormals();
          const mat = createModelPreviewMaterial(geo, tex);
          mat.side = THREE.DoubleSide;
          const mesh = new THREE.Mesh(geo, mat);
          if (!shareTex && tex) mesh.userData.previewTexture = tex;
          mesh.userData.scanColorCapable = isScanColorPreview(geo, tex);
          syncBackFaceShell(mesh);
          scene.add(mesh);
          return mesh;
        };

        const fixturesOf = (jaw: "upper" | "lower") =>
          builtAbutments.filter((d) => d.jaw === jaw).map((d) => d.fixture);
        for (const scan of jawScans) {
          const jaw = scan.role as "upper" | "lower";
          const rawMesh = makeScanMesh(scan.geometry, scan.texture, false);
          const trimmedGeo = buildScanGeometryWithoutScanbodies(scan.geometry, fixturesOf(jaw));
          const trimmedMesh = makeScanMesh(trimmedGeo, scan.texture, true);
          jawMeshesRef.current[jaw === "upper" ? "upperRaw" : "lowerRaw"].push(rawMesh);
          jawMeshesRef.current[jaw === "upper" ? "upperTrimmed" : "lowerTrimmed"].push(trimmedMesh);
        }

        const nextVisibleTeeth: Record<string, boolean> = {};
        for (const d of builtAbutments) {
          nextVisibleTeeth[d.toothNumber] = true;
          addDesignToScene(d);
        }

        designContextRef.current = {
          cacheKey,
          patientName: String(curPatientName || ""),
          jawGeometry: { upper: upperPrimary, lower: lowerPrimary },
          fixtures: builtAbutments.map((d) => d.fixture),
          overrides,
          alignedScans,
        };
        designedListRef.current = builtAbutments;

        setVisibleTeeth(nextVisibleTeeth);
        setAvailableJaws({ upper: upperScans.length > 0, lower: lowerScans.length > 0 });
        setVisibleJaws({ upper: upperScans.length > 0, lower: lowerScans.length > 0 });
        setDesignedList(builtAbutments);
        setRestoredFromCache(restored);
        const restoredChat = restored && cached ? cached.chat : [];
        setChatTurns(restoredChat);
        chatTurnsRef.current = restoredChat;
        setStatus({ kind: "ready" });
        if (!restored) persistDesign(restoredChat);

        window.requestAnimationFrame(() => {
          fitDefaultCamera();
        });
      } catch (err) {
        if (cancelled || (err as { name?: string } | null)?.name === "AbortError") return;
        setStatus({
          kind: "error",
          message:
            err instanceof Error && err.message
              ? err.message
              : "커스텀어벗 디자인 프리뷰 생성 중 오류가 발생했습니다.",
        });
      }
    };

    void runPipeline();
    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [
    addDesignToScene,
    authToken,
    clearSceneObjects,
    fitDefaultCamera,
    hostEl,
    open,
    persistDesign,
    pipelineKey,
    transferIdParam,
  ]);

  // 표시 옵션 동기화(스캔색, 스캔바디 가리기, 대합 투명도, 픽스쳐, 마진선, 악·치아 토글)
  useEffect(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    if (!renderer || !scene) return;

    if (colorMapping) {
      applyScanColorToneMapping(renderer);
      scene.background = new THREE.Color(SCAN_COLOR_PREVIEW_BACKGROUND);
    } else {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      scene.background = new THREE.Color(VIEWER_PLAIN_BG);
    }

    const syncJawRole = (
      role: "upper" | "lower",
      rawList: THREE.Mesh[],
      trimmedList: THREE.Mesh[],
    ) => {
      const roleVisible = visibleJaws[role];
      const isOpposing =
        (role === "upper" && !prepJaws.has("upper") && prepJaws.has("lower")) ||
        (role === "lower" && !prepJaws.has("lower") && prepJaws.has("upper"));
      const opacity = isOpposing
        ? Math.max(0.05, Math.min(1, 1 - opposingTransparency / 100))
        : 1;

      const applyMat = (mesh: THREE.Mesh, show: boolean) => {
        mesh.visible = show;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        const tex =
          (mesh.userData.previewTexture as THREE.Texture | undefined) ?? mat.map ?? null;
        const hasVertexColors = Boolean(mesh.geometry.getAttribute("color"));
        if (colorMapping && (tex || hasVertexColors)) {
          mat.map = tex;
          mat.vertexColors = hasVertexColors && !tex;
          mat.color.setHex(0xffffff);
          mat.roughness = 0.78;
          mat.metalness = 0.02;
        } else {
          mat.map = null;
          mat.vertexColors = false;
          mat.color.setHex(role === "upper" ? 0xdbeafe : 0xe2e8f0);
          mat.roughness = 0.55;
          mat.metalness = 0.04;
        }
        const seeThrough = opacity < 0.995;
        mat.transparent = seeThrough;
        mat.opacity = opacity;
        mat.depthWrite = !seeThrough;
        mesh.renderOrder = seeThrough ? 4 : 1;
        mat.needsUpdate = true;
        syncBackFaceShell(mesh);
      };

      for (const m of rawList) applyMat(m, roleVisible && !hideScanbodyOnScan);
      for (const m of trimmedList) applyMat(m, roleVisible && hideScanbodyOnScan);
    };

    syncJawRole("upper", jawMeshesRef.current.upperRaw, jawMeshesRef.current.upperTrimmed);
    syncJawRole("lower", jawMeshesRef.current.lowerRaw, jawMeshesRef.current.lowerTrimmed);

    for (const [tooth, mesh] of abutmentMeshesRef.current.entries()) {
      mesh.visible = visibleTeeth[tooth] !== false;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(selectedTooth === tooth ? 0x332800 : 0x000000);
    }
    for (const [tooth, mesh] of predictedCrownMeshesRef.current.entries()) {
      mesh.visible = showPredictedCrown && visibleTeeth[tooth] !== false;
    }
    for (const [tooth, mesh] of fixtureMeshesRef.current.entries()) {
      mesh.visible = showFixtureAnalog && visibleTeeth[tooth] !== false;
    }
    for (const [tooth, line] of marginLinesRef.current.entries()) {
      line.visible = showFinishLine && visibleTeeth[tooth] !== false;
    }
  }, [
    colorMapping,
    designedList,
    hideScanbodyOnScan,
    opposingTransparency,
    prepJaws,
    selectedTooth,
    showFinishLine,
    showFixtureAnalog,
    showPredictedCrown,
    visibleJaws,
    visibleTeeth,
  ]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatTurns, chatOpen]);

  /** 치아별 조정값을 바꿔 다시 디자인하고 씬·목록·저장본을 바꾼다. */
  const applyDesignChanges = useCallback(
    async (changes: readonly DesignChange[], mode: "merge" | "replace" = "merge") => {
      const ctx = designContextRef.current;
      if (!ctx || changes.length === 0) return;
      const teeth = [...new Set(changes.map((c) => c.toothNumber))];
      setRedesigning(teeth);
      try {
        for (const tooth of teeth) {
          const prev = designedListRef.current.find((d) => d.toothNumber === tooth);
          if (!prev) continue;
          const jawGeo = ctx.jawGeometry[prev.jaw];
          if (!jawGeo) continue;
          const merged: Partial<CustomAbutmentDesignParams> =
            mode === "replace" ? {} : { ...(ctx.overrides[tooth] ?? {}) };
          for (const change of changes) {
            if (change.toothNumber === tooth) Object.assign(merged, change.params);
          }
          await new Promise<void>((r) => window.setTimeout(r, 16));
          const next = await designCustomAbutmentStl({
            fixture: prev.fixture,
            jawGeometry: jawGeo,
            opposingGeometry: ctx.jawGeometry[prev.jaw === "upper" ? "lower" : "upper"],
            neighbors: ctx.fixtures.filter((f) => f.jaw === prev.jaw),
            params: { ...preferenceOverridesForTooth(tooth, preferenceRef.current), ...merged },
            patientName: ctx.patientName,
          });
          ctx.overrides[tooth] = merged;
          removeDesignFromScene(tooth);
          prev.worldGeometry.dispose();
          prev.predictedCrownWorldGeometry.dispose();
          addDesignToScene(next);
          const list = designedListRef.current.map((d) => (d.toothNumber === tooth ? next : d));
          designedListRef.current = list;
          setDesignedList(list);
        }
      } finally {
        setRedesigning([]);
      }
    },
    [addDesignToScene, removeDesignFromScene],
  );

  const sendChat = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      const token = String(authToken || "").trim();
      if (!text || chatBusy || !token || designedListRef.current.length === 0) return;
      const history = chatTurnsRef.current
        .filter((t) => !t.pending)
        .map((t) => ({ role: t.role, text: t.text }));
      const withUser: ChatTurn[] = [
        ...chatTurnsRef.current,
        { role: "user", text },
        { role: "assistant", text: "디자인을 검토하는 중…", pending: true },
      ];
      chatTurnsRef.current = withUser;
      setChatTurns(withUser);
      setChatInput("");
      setChatBusy(true);

      const finish = (reply: string) => {
        const next: ChatTurn[] = [
          ...chatTurnsRef.current.filter((t) => !t.pending),
          { role: "assistant", text: reply },
        ];
        chatTurnsRef.current = next;
        setChatTurns(next);
        persistDesign(next);
      };

      try {
        const res = await apiFetch<{
          success?: boolean;
          message?: string;
          data?: {
            reply?: string;
            changes?: DesignChange[];
            preference?: unknown;
            preferenceSaved?: { note?: string } | null;
          };
        }>({
          path: "/api/ai/custom-abutment-design-chat",
          method: "POST",
          token,
          jsonBody: {
            message: text,
            history,
            selectedTooth,
            transferId: transferIdParam || undefined,
            teeth: designedListRef.current.map((d) => ({
              toothNumber: d.toothNumber,
              params: d.params,
              metrics: metricsForAi(d),
            })),
          },
        });
        if (!res.ok || !res.data?.data) {
          finish(res.data?.message || "AI 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.");
          return;
        }
        if (res.data.data.preference) {
          const nextPref = parseCustomAbutmentPreference(res.data.data.preference);
          preferenceRef.current = nextPref;
          setPreference(nextPref);
        }
        const savedNote = res.data.data.preferenceSaved
          ? String(res.data.data.preferenceSaved.note || "").trim() || "요청한 값"
          : "";
        const reply = [
          String(res.data.data.reply || "").trim(),
          savedNote ? `치과 기본값으로 저장: ${savedNote}` : "",
        ]
          .filter(Boolean)
          .join("\n");
        const changes = (res.data.data.changes ?? [])
          .map((c) => ({
            toothNumber: String(c.toothNumber || ""),
            params: parseCustomAbutmentParamOverrides(c.params),
          }))
          .filter((c) => Object.keys(c.params).length > 0);
        if (changes.length === 0) {
          finish(reply || "바꿀 내용이 없습니다.");
          return;
        }
        const before = new Map(designedListRef.current.map((d) => [d.toothNumber, d.params]));
        const pendingNext: ChatTurn[] = [
          ...chatTurnsRef.current.filter((t) => !t.pending),
          { role: "assistant", text: "디자인에 반영하는 중…", pending: true },
        ];
        chatTurnsRef.current = pendingNext;
        setChatTurns(pendingNext);
        await applyDesignChanges(changes);
        const summary = describeChanges(changes, before);
        finish(summary ? `${reply}\n${summary}` : reply);
      } catch (err) {
        console.warn("[custom-abutment] chat failed", err);
        finish("디자인을 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        setChatBusy(false);
      }
    },
    [applyDesignChanges, authToken, chatBusy, persistDesign, selectedTooth, transferIdParam],
  );

  const clearPreference = useCallback(async () => {
    const token = String(authToken || "").trim();
    if (!token || chatBusy) return;
    setChatBusy(true);
    try {
      const res = await apiFetch<{ data?: { preference?: unknown } }>({
        path: `/api/ai/custom-abutment-design-preference${
          transferIdParam ? `?transferId=${encodeURIComponent(transferIdParam)}` : ""
        }`,
        method: "DELETE",
        token,
      });
      if (!res.ok) return;
      preferenceRef.current = EMPTY_CUSTOM_ABUTMENT_PREFERENCE;
      setPreference(EMPTY_CUSTOM_ABUTMENT_PREFERENCE);
      const next: ChatTurn[] = [
        ...chatTurnsRef.current,
        { role: "assistant", text: "치과 기본값을 지웠습니다. 다음 케이스부터 표준 디자인으로 만듭니다." },
      ];
      chatTurnsRef.current = next;
      setChatTurns(next);
      persistDesign(next);
    } finally {
      setChatBusy(false);
    }
  }, [authToken, chatBusy, persistDesign, transferIdParam]);

  const resetAllDesigns = useCallback(async () => {
    const ctx = designContextRef.current;
    if (!ctx || chatBusy) return;
    const changed = Object.entries(ctx.overrides)
      .filter(([, v]) => Object.keys(v).length > 0)
      .map(([toothNumber]) => ({ toothNumber, params: {} }));
    if (changed.length === 0) return;
    setChatBusy(true);
    try {
      await applyDesignChanges(changed, "replace");
      const next: ChatTurn[] = [
        ...chatTurnsRef.current,
        { role: "assistant", text: "모든 치아를 기본 디자인으로 되돌렸습니다." },
      ];
      chatTurnsRef.current = next;
      setChatTurns(next);
      persistDesign(next);
    } finally {
      setChatBusy(false);
    }
  }, [applyDesignChanges, chatBusy, persistDesign]);

  const hasOpposingJaw =
    (prepJaws.has("upper") && availableJaws.lower) ||
    (prepJaws.has("lower") && availableJaws.upper);
  const ready = status.kind === "ready" && designedList.length > 0;
  const hasOverrides = designedList.some(
    (d) => Object.keys(designContextRef.current?.overrides[d.toothNumber] ?? {}).length > 0,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "inset-0 left-0 top-0 z-[480] flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0",
          "sm:inset-0 sm:left-0 sm:top-0 sm:h-[100dvh] sm:max-h-[100dvh] sm:w-screen sm:max-w-none sm:translate-x-0 sm:translate-y-0 sm:rounded-none sm:p-0",
          "duration-0 data-[state=open]:animate-none data-[state=closed]:animate-none",
        )}
        overlayClassName="z-[475]"
        hideClose
      >
        <DialogHeader className="relative shrink-0 flex-row items-center justify-between gap-3 space-y-0 border-b bg-white/95 py-2.5 pl-5 pr-14 text-left">
          <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
            <DialogTitle className="shrink-0 text-base sm:text-lg">
              커스텀어벗 디자인
            </DialogTitle>
            {caseTitle ? (
              <span className="truncate text-sm font-medium text-foreground">
                {caseTitle}
              </span>
            ) : null}
            {caseDatesLabel ? (
              <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground md:inline">
                {caseDatesLabel}
              </span>
            ) : null}
            {ready && restoredFromCache ? (
              <span className="hidden shrink-0 rounded bg-muted px-1.5 py-0.5 text-[0.6875rem] text-muted-foreground sm:inline">
                저장된 디자인
              </span>
            ) : null}
          </div>

          {ready ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 px-2.5 text-xs"
                onClick={() => {
                  setSelectedTooth(null);
                  fitDefaultCamera();
                }}
              >
                <Maximize2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">전체 맞춤</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={chatOpen ? "default" : "outline"}
                className="h-8 gap-1.5 px-2.5 text-xs"
                onClick={() => setChatOpen((v) => !v)}
              >
                <Bot className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">AI 대화</span>
              </Button>
            </div>
          ) : null}

          <DialogClose
            className="absolute right-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md bg-destructive text-destructive-foreground opacity-100 shadow-sm hover:bg-destructive/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="닫기"
          >
            <X className="h-7 w-7" />
          </DialogClose>
        </DialogHeader>

        <div className="flex min-h-0 min-w-0 flex-1">
          <div className="relative min-h-0 min-w-0 flex-1">
            <div ref={bindHostRef} className="relative h-full w-full overflow-hidden" />

            {centerGuide !== "off" ? (
              <div
                className="pointer-events-none absolute inset-0 z-[3]"
                style={
                  centerGuide === "grid"
                    ? {
                        backgroundImage:
                          "linear-gradient(to right, rgba(15,23,42,0.06) 1px, transparent 1px)," +
                          "linear-gradient(to bottom, rgba(15,23,42,0.06) 1px, transparent 1px)," +
                          "linear-gradient(to right, rgba(15,23,42,0.13) 1px, transparent 1px)," +
                          "linear-gradient(to bottom, rgba(15,23,42,0.13) 1px, transparent 1px)",
                        backgroundSize: "1.5rem 1.5rem, 1.5rem 1.5rem, 7.5rem 7.5rem, 7.5rem 7.5rem",
                        backgroundPosition: "center center",
                      }
                    : undefined
                }
              >
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-slate-500/55" />
                <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 border-l border-dashed border-slate-500/55" />
              </div>
            ) : null}

            {ready ? (
              <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex flex-col items-center gap-2 px-3">
                <div
                  className={cn(
                    "pointer-events-auto max-w-full rounded-lg border bg-background/95 p-1 shadow-sm",
                    WIDE_CLUSTER_ROW_CLASS,
                  )}
                >
                  <div className="flex shrink-0 items-center gap-1.5">
                    {availableJaws.upper ? (
                      <ToolbarToggle
                        active={visibleJaws.upper}
                        label="상악"
                        onClick={() => setVisibleJaws((p) => ({ ...p, upper: !p.upper }))}
                      />
                    ) : null}
                    {availableJaws.lower ? (
                      <ToolbarToggle
                        active={visibleJaws.lower}
                        label="하악"
                        onClick={() => setVisibleJaws((p) => ({ ...p, lower: !p.lower }))}
                      />
                    ) : null}
                    {hasOpposingJaw ? (
                      <div className="flex items-center gap-2 px-1.5">
                        <span className="whitespace-nowrap text-[0.6875rem] text-muted-foreground">
                          대합 투명도
                        </span>
                        <Slider
                          className="w-20"
                          min={0}
                          max={90}
                          step={5}
                          value={[opposingTransparency]}
                          onValueChange={([val]) => setOpposingTransparency(val ?? 55)}
                          aria-label="대합악 투명도"
                        />
                      </div>
                    ) : null}
                  </div>
                  <div className={cn("flex shrink-0 items-center gap-1.5", WIDE_CLUSTER_SEPARATOR_CLASS)}>
                    <ToolbarToggle
                      active={hideScanbodyOnScan}
                      icon={hideScanbodyOnScan ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      label="스캔바디 가리기"
                      tip="스캔에 찍힌 스캔바디를 가립니다."
                      onClick={() => setHideScanbodyOnScan((v) => !v)}
                    />
                    <ToolbarToggle
                      active={showPredictedCrown}
                      label="예측 크라운"
                      tip="컷백 기준인 예측 크라운을 반투명으로 겹칩니다."
                      onClick={() => setShowPredictedCrown((v) => !v)}
                    />
                    <ToolbarToggle
                      active={showFinishLine}
                      label="마진선"
                      onClick={() => setShowFinishLine((v) => !v)}
                    />
                    <ToolbarToggle
                      active={showFixtureAnalog}
                      label="픽스쳐"
                      onClick={() => setShowFixtureAnalog((v) => !v)}
                    />
                  </div>
                  <div className={cn("flex shrink-0 items-center gap-1.5", WIDE_CLUSTER_SEPARATOR_CLASS)}>
                    <ToolbarToggle
                      active={colorMapping}
                      icon={<Paintbrush className="h-3.5 w-3.5" />}
                      label="스캔색"
                      onClick={() => setColorMapping((v) => !v)}
                    />
                    <ToolbarToggle
                      active={centerGuide !== "off"}
                      icon={<Crosshair className="h-3.5 w-3.5" />}
                      label={centerGuideLabel(centerGuide)}
                      onClick={() => setCenterGuide((m) => nextCenterGuide(m))}
                    />
                  </div>
                </div>

                <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5">
                  {designedList.map((item) => {
                    const checked = visibleTeeth[item.toothNumber] !== false;
                    const isSelected = selectedTooth === item.toothNumber;
                    const busy = redesigning.includes(item.toothNumber);
                    const m = item.metrics;
                    const conn = item.fixture.connectionSpec;
                    return (
                      <div
                        key={item.toothNumber}
                        className={cn(
                          "flex items-center gap-1 rounded-md border bg-background/95 py-0.5 pl-1 pr-0.5 text-xs shadow-sm",
                          isSelected ? "border-primary ring-1 ring-primary/40" : "border-border",
                        )}
                      >
                        <button
                          type="button"
                          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label={checked ? `#${item.toothNumber} 숨기기` : `#${item.toothNumber} 보이기`}
                          onClick={() =>
                            setVisibleTeeth((prev) => ({ ...prev, [item.toothNumber]: !checked }))
                          }
                        >
                          {checked ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </button>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted"
                              onClick={() => {
                                if (!isSelected) {
                                  focusSingleTooth(item.toothNumber);
                                  return;
                                }
                                setSelectedTooth(null);
                                fitDefaultCamera();
                              }}
                            >
                              <span className="font-semibold text-foreground">
                                #{item.toothNumber}
                              </span>
                              {busy ? (
                                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                              ) : (
                                <span className="tabular-nums text-muted-foreground">
                                  Ø{m.maxDiameterMm} · 커프 {m.cuffHeightMinMm}~{m.cuffHeightMaxMm} ·{" "}
                                  {m.angulationDeg}°
                                  {m.occlusalClearanceMm != null ? ` · 대합 ${m.occlusalClearanceMm}` : ""}
                                </span>
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="z-[520] max-w-xs text-xs">
                            <div className="space-y-0.5 tabular-nums">
                              <div>
                                {[conn.manufacturer, conn.brand, conn.family, conn.type]
                                  .filter(Boolean)
                                  .join(" / ") || "-"}
                              </div>
                              <div>
                                스캔바디 {item.fixture.matchedLibraryLabel} · 오차 {m.rmsMm}mm
                              </div>
                              <div>
                                포스트 {m.postHeightMm}mm · 테이퍼 {m.postTaperDeg}° · 컷백 {m.cutbackMm}mm
                              </div>
                              <div>
                                마진 R {m.marginFilletRadiusMm}mm · 삽입축{" "}
                                {m.axisSource === "opposing" ? "대합치 중심" : "악궁 교합 방향"}
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                        <button
                          type="button"
                          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label={`#${item.toothNumber} STL 다운로드`}
                          onClick={() => saveBlobAsDownload(item.stlBlob, item.fileName)}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {status.kind === "loading" ? (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-900/15">
                <div className="w-[min(22rem,calc(100%-2rem))] space-y-2.5 rounded-xl border bg-background/95 p-4 shadow-lg">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                    <span className="truncate">{status.step}</span>
                  </div>
                  <Progress value={status.percent} className="h-2" />
                </div>
              </div>
            ) : null}

            {status.kind === "error" ? (
              <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
                <div className="max-w-md space-y-2 rounded-xl border bg-background p-5 text-center shadow-lg">
                  <p className="text-sm font-semibold text-destructive">
                    프리뷰를 준비하지 못했습니다.
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {status.message}
                  </p>
                </div>
              </div>
            ) : null}

            <div className={cn(VIEW_GESTURE_HINT_LAYER_CLASS, "z-[30]")}>
              <ViewGestureHint storageKey="abuts.viewGestureHint.practiceCaPreview.v1.dismissed" />
            </div>
          </div>

          {ready && chatOpen ? (
            <aside className="flex w-[min(22rem,40vw)] shrink-0 flex-col border-l bg-background">
              <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Bot className="h-4 w-4 shrink-0 text-primary" />
                  <span className="text-sm font-semibold">AI 디자인 대화</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-xs"
                  disabled={chatBusy || !hasOverrides}
                  onClick={() => void resetAllDesigns()}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  기본값
                </Button>
              </div>

              {hasCustomAbutmentPreference(preference) ? (
                <div className="flex items-start gap-2 border-b bg-amber-50/70 px-3 py-2 text-[0.6875rem] leading-relaxed text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold">치과 기본값</span>
                    <span className="ml-1.5">{describeCustomAbutmentPreference(preference)}</span>
                  </div>
                  {preferenceCanSave ? (
                    <button
                      type="button"
                      className="shrink-0 rounded px-1.5 py-0.5 font-medium hover:bg-amber-100 disabled:opacity-50 dark:hover:bg-amber-900/40"
                      disabled={chatBusy}
                      onClick={() => void clearPreference()}
                    >
                      지우기
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div ref={chatScrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
                {chatTurns.length === 0 ? (
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <p>
                      바꾸고 싶은 점을 말로 적으면 디자인을 다시 만듭니다.
                      <br />
                      치아를 고르면 그 치아에만 적용합니다.
                      <br />
                      「앞으로」처럼 규칙으로 말하면 다음 케이스 기본값이 됩니다.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {CHAT_EXAMPLES.map((ex) => (
                        <button
                          key={ex}
                          type="button"
                          className="rounded-full border px-2.5 py-1 text-foreground hover:bg-muted"
                          onClick={() => void sendChat(ex)}
                        >
                          {ex}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {chatTurns.map((turn, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "max-w-[92%] whitespace-pre-line rounded-lg px-3 py-2 text-xs leading-relaxed",
                      turn.role === "user"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "mr-auto border bg-muted/40 text-foreground",
                    )}
                  >
                    {turn.pending ? (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {turn.text}
                      </span>
                    ) : (
                      turn.text
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-1.5 border-t px-3 py-2.5">
                <div className="text-[0.6875rem] text-muted-foreground">
                  대상 {selectedTooth ? `#${selectedTooth}` : "전체 치아"}
                </div>
                <div className="flex items-end gap-1.5">
                  <Textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        void sendChat(chatInput);
                      }
                    }}
                    placeholder="예: 포스트를 조금 더 얇게"
                    rows={2}
                    className="min-h-[2.75rem] resize-none text-xs"
                    disabled={chatBusy}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 w-9 shrink-0 px-0"
                    aria-label="보내기"
                    disabled={chatBusy || !chatInput.trim()}
                    onClick={() => void sendChat(chatInput)}
                  >
                    {chatBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </aside>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
