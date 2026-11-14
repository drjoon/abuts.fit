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
// - web/frontend/src/shared/practice/customAbutmentChatCommands.ts (정형 명령은 AI 없이 처리)
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentDesignTree.tsx
// - web/frontend/src/shared/components/practice/ViewPaintToolbar.tsx (페인트: AI 디자인·프리뷰 공용)
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentViewCube.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import {
  Bot,
  ChevronsDownUp,
  ChevronsUpDown,
  Loader2,
  Send,
  Settings,
  Sparkles,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
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
  CUSTOM_ABUTMENT_FIT_VERSION,
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
  detectAndMatchScanbodiesOnJaw,
  splitScanByScanbodies,
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
import { parseLocalDesignCommand } from "@/shared/practice/customAbutmentChatCommands";
import { PracticeCustomAbutmentDesignTree } from "@/shared/components/practice/PracticeCustomAbutmentDesignTree";
import {
  downloadBlobFile,
  paintNoteFileName,
  ViewPaintSurface,
} from "@/shared/components/practice/ViewPaintSurface";
import {
  useViewPaint,
  ViewPaintToolbar,
  viewPaintSurfaceProps,
} from "@/shared/components/practice/ViewPaintToolbar";
import {
  createViewPaintSpace,
  notifyViewPaint,
  type ViewPaintSpace,
} from "@/shared/components/practice/viewPaintSpace";
import {
  PracticeCustomAbutmentViewCube,
  toothViewCube,
  viewCubeDirection,
  type ViewCubeFace,
  type ViewCubeHandle,
} from "@/shared/components/practice/PracticeCustomAbutmentViewCube";
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
import {
  applyExternalView,
  ScreenSpaceOrbitControls,
} from "@/shared/three/screenSpaceOrbitControls";
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
const MARGIN_LINE_COLOR = 0x0891b2;
const MARGIN_LINE_PX = 3.5;
const PIVOT_MARKER_COLOR = 0xf59e0b;
const CHAT_WIDTH_KEY = "abuts.caDesign.chatWidthRem";
const CHAT_WIDTH_DEFAULT_REM = 22;
const CHAT_WIDTH_MIN_REM = 16;
const VIEW_KEY = "abuts.caDesign.view.v1";
/** 맞춤 화면 기준 이 배율까지만. 그 이상이면 메쉬가 픽셀 단위로 깨지고, 핀치는 브라우저 배율로 넘어간다. */
const VIEW_MAX_ZOOM = 8;

type SavedCaView = {
  transferId: string;
  pos: [number, number, number];
  quat: [number, number, number, number];
  up: [number, number, number];
  target: [number, number, number];
  zoom: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
};

function readSavedView(transferId: string): SavedCaView | null {
  if (!transferId) return null;
  try {
    const raw = JSON.parse(sessionStorage.getItem(VIEW_KEY) || "null") as SavedCaView | null;
    if (!raw || raw.transferId !== transferId) return null;
    if (!Array.isArray(raw.pos) || raw.pos.length !== 3) return null;
    if (!Number.isFinite(raw.zoom) || !Number.isFinite(raw.top)) return null;
    return raw;
  } catch {
    return null;
  }
}

function writeSavedView(
  transferId: string,
  camera: THREE.OrthographicCamera,
  target: THREE.Vector3,
) {
  if (!transferId) return;
  const payload: SavedCaView = {
    transferId,
    pos: camera.position.toArray() as [number, number, number],
    quat: camera.quaternion.toArray() as [number, number, number, number],
    up: camera.up.toArray() as [number, number, number],
    target: target.toArray() as [number, number, number],
    zoom: camera.zoom,
    top: camera.top,
    bottom: camera.bottom,
    left: camera.left,
    right: camera.right,
  };
  try {
    sessionStorage.setItem(VIEW_KEY, JSON.stringify(payload));
  } catch {
    // 저장 실패해도 이번 화면은 유지
  }
}

function applySavedView(
  camera: THREE.OrthographicCamera,
  controls: ScreenSpaceOrbitControls,
  saved: SavedCaView,
) {
  camera.position.fromArray(saved.pos);
  camera.quaternion.fromArray(saved.quat);
  camera.up.fromArray(saved.up);
  controls.target.fromArray(saved.target);
  camera.zoom = THREE.MathUtils.clamp(saved.zoom, 0.2, VIEW_MAX_ZOOM);
  camera.top = saved.top;
  camera.bottom = saved.bottom;
  camera.left = saved.left;
  camera.right = saved.right;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  controls.syncFromCamera();
}
const SKETCH_MAX_PX = 1024;
const VIEW_ANIM_MS = 280;
const CHAT_EXAMPLES = [
  "#23 포스트 0.5mm 낮춰줘",
  "마진 0.3mm 얕게",
  "포스트를 더 수직으로",
  "앞으로 마진은 치은 하방 0.8mm로",
];
const CENTER_GUIDE_OPTIONS: Array<{ value: CenterGuideMode; label: string }> = [
  { value: "off", label: "끔" },
  { value: "center", label: "중앙선" },
  { value: "grid", label: "모눈" },
];

function rootFontPx(): number {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

function readChatWidthRem(): number {
  try {
    const v = Number(window.localStorage.getItem(CHAT_WIDTH_KEY));
    return Number.isFinite(v) && v >= CHAT_WIDTH_MIN_REM ? v : CHAT_WIDTH_DEFAULT_REM;
  } catch {
    return CHAT_WIDTH_DEFAULT_REM;
  }
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
  /** 치아별 스캔바디 표시. 기본은 가린다. */
  const [shownScanbodies, setShownScanbodies] = useState<Record<string, boolean>>({});
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
  const transferIdRef = useRef(transferIdParam);
  transferIdRef.current = transferIdParam;
  /** 디자인 배치 후 맞춤·복원이 끝난 뒤에만 카메라 뷰를 저장한다. */
  const viewReadyRef = useRef(false);
  const paint = useViewPaint({ open, resetKey: transferIdParam, initiallyOn: true });
  const [paintSpace, setPaintSpace] = useState<ViewPaintSpace | null>(null);
  const paintListenersRef = useRef(new Set<() => void>());
  /** 「AI에게」로 잡아 둔 화면(표시 포함). 다음 메시지와 함께 보낸다. */
  const [sketchUrl, setSketchUrl] = useState<string | null>(null);
  const [chatWidthRem, setChatWidthRem] = useState(readChatWidthRem);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [pivotSet, setPivotSet] = useState(false);
  const [pivotArmed, setPivotArmed] = useState(false);
  const pivotArmedRef = useRef(false);
  pivotArmedRef.current = pivotArmed;
  const pivotMarkerRef = useRef<THREE.Mesh | null>(null);
  const cubeFrameRef = useRef<DentalFrame | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const viewCubeRef = useRef<ViewCubeHandle | null>(null);
  const viewAnimRef = useRef<{
    from: THREE.Quaternion;
    to: THREE.Quaternion;
    fromPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    pivot: THREE.Vector3;
    t0: number;
  } | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);
  const badgeClickRef = useRef<(toothNumber: string) => void>(() => {});

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
    upperScanbody: THREE.Mesh[];
    upperTrimmed: THREE.Mesh[];
    lowerScanbody: THREE.Mesh[];
    lowerTrimmed: THREE.Mesh[];
  }>({
    upperScanbody: [],
    upperTrimmed: [],
    lowerScanbody: [],
    lowerTrimmed: [],
  });
  const abutmentMeshesRef = useRef(new Map<string, THREE.Mesh>());
  const predictedCrownMeshesRef = useRef(new Map<string, THREE.Mesh>());
  const fixtureMeshesRef = useRef(new Map<string, THREE.Mesh>());
  const marginLinesRef = useRef(new Map<string, Line2>());

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
        line.material.dispose();
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
    const tagEl = document.createElement("button");
    tagEl.type = "button";
    tagEl.textContent = `#${d.toothNumber}`;
    tagEl.title = `#${d.toothNumber} 고르기`;
    tagEl.style.cssText =
      "pointer-events:auto;cursor:pointer;user-select:none;border:0;border-radius:0.375rem;" +
      "background:rgba(15,23,42,0.82);color:#fff;font:600 0.6875rem/1.2 ui-sans-serif,system-ui,sans-serif;" +
      "padding:0.18rem 0.42rem;white-space:nowrap;";
    tagEl.addEventListener("click", (e) => {
      e.stopPropagation();
      badgeClickRef.current(d.toothNumber);
    });
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

    const loop = Array.from(d.marginLoopWorld);
    loop.push(loop[0]!, loop[1]!, loop[2]!);
    const lineGeo = new LineGeometry();
    lineGeo.setPositions(loop);
    const lineMat = new LineMaterial({
      color: MARGIN_LINE_COLOR,
      linewidth: MARGIN_LINE_PX,
      depthTest: false,
      transparent: true,
      opacity: 1,
    });
    const host = hostRef.current;
    if (host) {
      const size = readHostSize(host);
      lineMat.resolution.set(size.width, size.height);
    }
    const marginLine = new Line2(lineGeo, lineMat);
    marginLine.computeLineDistances();
    marginLine.renderOrder = 5;
    scene.add(marginLine);
    marginLinesRef.current.set(d.toothNumber, marginLine);
  }, []);

  const clearSceneObjects = useCallback(() => {
    for (const list of Object.values(jawMeshesRef.current)) {
      for (const m of list) disposeMesh(m);
    }
    jawMeshesRef.current = {
      upperScanbody: [],
      upperTrimmed: [],
      lowerScanbody: [],
      lowerTrimmed: [],
    };
    for (const tooth of [...abutmentMeshesRef.current.keys()]) removeDesignFromScene(tooth);
  }, [disposeMesh, removeDesignFromScene]);

  const clearPivot = useCallback(() => {
    if (controlsRef.current) controlsRef.current.pivot = null;
    if (pivotMarkerRef.current) pivotMarkerRef.current.visible = false;
    setPivotSet(false);
    setPivotArmed(false);
  }, []);

  /** 화면 좌표 아래 보이는 면을 회전 중심으로. 빈 곳이면 false. */
  const pickPivotAt = useCallback((clientX: number, clientY: number): boolean => {
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    const controls = controlsRef.current;
    if (!camera || !renderer || !controls) return false;
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const targets = [
      ...jawMeshesRef.current.upperTrimmed,
      ...jawMeshesRef.current.upperScanbody,
      ...jawMeshesRef.current.lowerTrimmed,
      ...jawMeshesRef.current.lowerScanbody,
      ...abutmentMeshesRef.current.values(),
      ...predictedCrownMeshesRef.current.values(),
      ...fixtureMeshesRef.current.values(),
    ].filter((m) => m.visible && m.parent?.visible !== false);
    const hit = ray.intersectObjects(targets, false)[0];
    if (!hit) return false;
    controls.pivot = hit.point.clone();
    const marker = pivotMarkerRef.current;
    if (marker) {
      marker.position.copy(hit.point);
      marker.visible = true;
    }
    setPivotSet(true);
    setPivotArmed(false);
    return true;
  }, []);

  useEffect(() => {
    const el = rendererRef.current?.domElement;
    if (!el) return;
    el.style.cursor = pivotArmed ? "crosshair" : "";
  }, [pivotArmed]);

  const fitCameraToTargets = useCallback(
    (targets: THREE.Object3D[], viewDir?: THREE.Vector3, upDir?: THREE.Vector3) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      const host = hostRef.current;
      if (!camera || !controls || !host || targets.length === 0) return;
      viewAnimRef.current = null;
      clearPivot();

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
    [clearPivot],
  );

  const fitDefaultCamera = useCallback(() => {
    const frame = frameRef.current;
    const abutMeshes = [...abutmentMeshesRef.current.values()].filter((m) => m.visible);
    const jawMeshes = [
      ...jawMeshesRef.current.upperTrimmed,
      ...jawMeshesRef.current.upperScanbody,
      ...jawMeshesRef.current.lowerTrimmed,
      ...jawMeshesRef.current.lowerScanbody,
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

  /** 지금 보이는 대상 그대로 화면에 맞춘다(방향 유지). */
  const fitCurrentView = useCallback(() => {
    const targets = [
      ...jawMeshesRef.current.upperTrimmed,
      ...jawMeshesRef.current.upperScanbody,
      ...jawMeshesRef.current.lowerTrimmed,
      ...jawMeshesRef.current.lowerScanbody,
      ...abutmentMeshesRef.current.values(),
    ].filter((m) => m.visible);
    if (targets.length === 0) return;
    const camera = cameraRef.current;
    fitCameraToTargets(targets, undefined, camera?.up.clone());
  }, [fitCameraToTargets]);

  /** 회전 중심·확대는 그대로 두고 카메라 자세만 `to`로 부드럽게 돌린다. 렌더 루프가 진행한다. */
  const animateCameraTo = useCallback((to: THREE.Quaternion) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    viewAnimRef.current = {
      from: camera.quaternion.clone(),
      to,
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
      pivot: (controls.pivot ?? controls.target).clone(),
      t0: performance.now(),
    };
  }, []);

  /** 방향 큐브 면: 그 방향에서 본다. */
  const jumpToFace = useCallback(
    (face: ViewCubeFace) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      const frame = cubeFrameRef.current ?? frameRef.current;
      if (!camera || !controls || !frame) return;
      const { viewDir, upDir } = viewCubeDirection(face, frame);
      const eye = controls.target.clone().addScaledVector(viewDir.normalize(), 1);
      const m = new THREE.Matrix4().lookAt(eye, controls.target, upDir.normalize());
      animateCameraTo(new THREE.Quaternion().setFromRotationMatrix(m));
    },
    [animateCameraTo],
  );

  /** 보는 방향은 그대로, 화면만 90° 돌린다. */
  const rollView = useCallback(
    (dir: 1 | -1) => {
      const camera = cameraRef.current;
      if (!camera) return;
      const base = viewAnimRef.current?.to ?? camera.quaternion;
      const roll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (-dir * Math.PI) / 2);
      animateCameraTo(base.clone().multiply(roll));
    },
    [animateCameraTo],
  );

  const cubeView = useMemo(() => {
    const frame = frameRef.current;
    if (!frame || designedList.length === 0) return null;
    const designed =
      designedList.find((d) => d.toothNumber === selectedTooth) ?? designedList[0];
    const view = toothViewCube(designed.toothNumber, designed.fixture, frame);
    return view ? { ...view, toothNumber: designed.toothNumber } : null;
  }, [designedList, selectedTooth]);
  cubeFrameRef.current = cubeView?.frame ?? null;
  const cubeFaceLabels = cubeView?.labels ?? null;

  const selectTooth = useCallback(
    (toothNumber: string | null) => {
      if (!toothNumber) {
        setSelectedTooth(null);
        return;
      }
      focusSingleTooth(toothNumber);
    },
    [focusSingleTooth],
  );
  badgeClickRef.current = (toothNumber: string) => {
    if (selectedTooth === toothNumber) {
      setSelectedTooth(null);
      return;
    }
    focusSingleTooth(toothNumber);
  };

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
      fitVersion: CUSTOM_ABUTMENT_FIT_VERSION,
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

    viewReadyRef.current = false;
    const controls = new ScreenSpaceOrbitControls(camera, renderer.domElement, {
      minZoom: 0.35,
      maxZoom: VIEW_MAX_ZOOM,
    });
    controlsRef.current = controls;
    const persistView = () => {
      if (!viewReadyRef.current) return;
      writeSavedView(transferIdRef.current, camera, controls.target);
    };
    controls.addEventListener("start", () => {
      viewAnimRef.current = null;
    });
    controls.addEventListener("change", persistView);
    const blockBrowserZoom = (event: WheelEvent) => {
      // 트랙패드 핀치는 ctrl+휠로 온다. 막지 않으면 Chrome이 페이지 배율을 바꾼다.
      if (!event.ctrlKey) return;
      event.preventDefault();
    };
    const blockGesture = (event: Event) => {
      event.preventDefault();
    };
    host.addEventListener("wheel", blockBrowserZoom, { capture: true, passive: false });
    host.addEventListener("gesturestart", blockGesture, { capture: true, passive: false });
    host.addEventListener("gesturechange", blockGesture, { capture: true, passive: false });

    const pivotMarker = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: PIVOT_MARKER_COLOR, depthTest: false, transparent: true, opacity: 0.9 }),
    );
    pivotMarker.renderOrder = 1000;
    pivotMarker.visible = false;
    scene.add(pivotMarker);
    pivotMarkerRef.current = pivotMarker;

    let pickDown: { x: number; y: number } | null = null;
    const onPickDown = (e: PointerEvent) => {
      pickDown = pivotArmedRef.current && e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
    };
    const onPickUp = (e: PointerEvent) => {
      const down = pickDown;
      pickDown = null;
      if (!down || !pivotArmedRef.current) return;
      if (Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 4) return;
      pickPivotAt(e.clientX, e.clientY);
    };
    const onPickDouble = (e: MouseEvent) => {
      if (!pickPivotAt(e.clientX, e.clientY)) clearPivot();
    };
    renderer.domElement.addEventListener("pointerdown", onPickDown);
    renderer.domElement.addEventListener("pointerup", onPickUp);
    renderer.domElement.addEventListener("dblclick", onPickDouble);

    let raf = 0;
    const renderLoop = () => {
      raf = window.requestAnimationFrame(renderLoop);
      const anim = viewAnimRef.current;
      if (anim) {
        const t = Math.min(1, (performance.now() - anim.t0) / VIEW_ANIM_MS);
        const k = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
        camera.quaternion.slerpQuaternions(anim.from, anim.to, k);
        const delta = camera.quaternion.clone().multiply(anim.from.clone().invert());
        camera.position.copy(anim.fromPos).sub(anim.pivot).applyQuaternion(delta).add(anim.pivot);
        controls.target.copy(anim.fromTarget).sub(anim.pivot).applyQuaternion(delta).add(anim.pivot);
        camera.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
        camera.updateMatrixWorld();
        if (t >= 1) {
          viewAnimRef.current = null;
          controls.syncFromCamera();
        }
      }
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

      if (pivotMarker.visible) {
        const viewH = (camera.top - camera.bottom) / camera.zoom;
        pivotMarker.scale.setScalar((viewH / Math.max(host.clientHeight, 1)) * 5);
      }
      if (paintListeners.size > 0) notifyViewPaint(paintListeners);
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
      viewCubeRef.current?.sync(camera, cubeFrameRef.current ?? frameRef.current);
    };
    const paintListeners = paintListenersRef.current;
    renderLoop();
    setPaintSpace(
      createViewPaintSpace({
        getCamera: () => cameraRef.current,
        getRenderer: () => rendererRef.current,
        getParent: () => sceneRef.current,
        getTargets: () =>
          [
            ...jawMeshesRef.current.upperTrimmed,
            ...jawMeshesRef.current.upperScanbody,
            ...jawMeshesRef.current.lowerTrimmed,
            ...jawMeshesRef.current.lowerScanbody,
            ...abutmentMeshesRef.current.values(),
          ].filter((mesh) => mesh.visible),
        listeners: paintListeners,
        onView: (gesture) => applyExternalView(controls, gesture),
      }),
    );

    const onResize = () => {
      if (!host) return;
      const next = resizeWebglToHost(renderer, host);
      labelRenderer.setSize(next.width, next.height);
      const halfH = (camera.top - camera.bottom) / 2;
      applyOrthoHeight(camera, halfH, next.aspect);
      for (const line of marginLinesRef.current.values()) {
        (line.material as LineMaterial).resolution.set(next.width, next.height);
      }
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    return () => {
      persistView();
      window.cancelAnimationFrame(raf);
      host.removeEventListener("wheel", blockBrowserZoom, { capture: true });
      host.removeEventListener("gesturestart", blockGesture, { capture: true });
      host.removeEventListener("gesturechange", blockGesture, { capture: true });
      paintListeners.clear();
      setPaintSpace(null);
      ro.disconnect();
      controls.dispose();
      clearSceneObjects();
      renderer.dispose();
      renderer.domElement.removeEventListener("pointerdown", onPickDown);
      renderer.domElement.removeEventListener("pointerup", onPickUp);
      renderer.domElement.removeEventListener("dblclick", onPickDouble);
      scene.remove(pivotMarker);
      pivotMarker.geometry.dispose();
      (pivotMarker.material as THREE.Material).dispose();
      pivotMarkerRef.current = null;
      renderer.domElement.remove();
      labelRenderer.domElement.remove();
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      labelRendererRef.current = null;
      controlsRef.current = null;
    };
  }, [clearPivot, clearSceneObjects, hostEl, open, pickPivotAt]);

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

        let redesignedFromFit = false;
        if (restored && cached && !cached.designFresh) {
          // 정합은 그대로 쓰고 형상만 새 규칙으로 다시 만든다.
          redesignedFromFit = true;
          const curPreference = await preferencePromise;
          if (cancelled) return;
          const fixtures = cached.teeth.map((row) => row.fixture);
          for (const row of cached.teeth) {
            setStatus({
              kind: "loading",
              percent: 80,
              step: `#${row.toothNumber} 커스텀어벗 디자인 중…`,
            });
            await new Promise<void>((r) => window.setTimeout(r, 16));
            if (cancelled) return;
            const jaw = row.fixture.jaw;
            const jawGeo = jaw === "upper" ? upperPrimary : lowerPrimary;
            if (!jawGeo) continue;
            const rowOverrides = parseCustomAbutmentParamOverrides(row.overrides);
            overrides[row.toothNumber] = rowOverrides;
            builtAbutments.push(
              await designCustomAbutmentStl({
                fixture: row.fixture,
                jawGeometry: jawGeo,
                opposingGeometry: jaw === "upper" ? lowerPrimary : upperPrimary,
                neighbors: fixtures.filter((f) => f.jaw === jaw),
                params: {
                  ...preferenceOverridesForTooth(row.toothNumber, curPreference.preference),
                  ...rowOverrides,
                },
                patientName: curPatientName,
              }),
            );
          }
        } else if (restored && cached) {
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
          mesh.userData.scanTexture = tex;
          mesh.userData.scanColorCapable = isScanColorPreview(geo, tex);
          syncBackFaceShell(mesh);
          scene.add(mesh);
          return mesh;
        };

        const fixturesOf = (jaw: "upper" | "lower") =>
          builtAbutments.filter((d) => d.jaw === jaw).map((d) => d.fixture);
        for (const scan of jawScans) {
          const jaw = scan.role as "upper" | "lower";
          if (!scan.geometry.getAttribute("normal")) scan.geometry.computeVertexNormals();
          const split = splitScanByScanbodies(scan.geometry, fixturesOf(jaw));
          const restMesh = makeScanMesh(split.rest, scan.texture, false);
          jawMeshesRef.current[jaw === "upper" ? "upperTrimmed" : "lowerTrimmed"].push(restMesh);
          for (const [tooth, geo] of split.scanbodies) {
            const sbMesh = makeScanMesh(geo, scan.texture, true);
            sbMesh.userData.scanbodyTooth = tooth;
            jawMeshesRef.current[jaw === "upper" ? "upperScanbody" : "lowerScanbody"].push(sbMesh);
          }
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
        setShownScanbodies({});
        setAvailableJaws({ upper: upperScans.length > 0, lower: lowerScans.length > 0 });
        setVisibleJaws({ upper: upperScans.length > 0, lower: lowerScans.length > 0 });
        setDesignedList(builtAbutments);
        setRestoredFromCache(restored);
        const restoredChat = restored && cached ? cached.chat : [];
        setChatTurns(restoredChat);
        chatTurnsRef.current = restoredChat;
        setStatus({ kind: "ready" });
        if (!restored || redesignedFromFit) persistDesign(restoredChat);

        window.requestAnimationFrame(() => {
          const saved = readSavedView(transferIdParam);
          const cam = cameraRef.current;
          const controls = controlsRef.current;
          if (saved && cam && controls) applySavedView(cam, controls, saved);
          else fitDefaultCamera();
          viewReadyRef.current = true;
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
      scanbodyList: THREE.Mesh[],
      restList: THREE.Mesh[],
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
          (mesh.userData.scanTexture as THREE.Texture | null | undefined) ??
          (mesh.userData.previewTexture as THREE.Texture | undefined) ??
          mat.map ??
          null;
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

      for (const m of scanbodyList) {
        applyMat(m, roleVisible && shownScanbodies[String(m.userData.scanbodyTooth)] === true);
      }
      for (const m of restList) applyMat(m, roleVisible);
    };

    syncJawRole("upper", jawMeshesRef.current.upperScanbody, jawMeshesRef.current.upperTrimmed);
    syncJawRole("lower", jawMeshesRef.current.lowerScanbody, jawMeshesRef.current.lowerTrimmed);

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
    shownScanbodies,
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

  /** 저장본이 아니라 지금 조정값으로 형상을 다시 만든다. 선택된 말이 있으면 그 치아만. */
  const regenerateDesigns = useCallback(
    async (teeth?: readonly string[]) => {
      const ctx = designContextRef.current;
      const list = designedListRef.current;
      const targets = (teeth && teeth.length > 0 ? teeth : list.map((d) => d.toothNumber)).filter((tooth) =>
        list.some((d) => d.toothNumber === tooth),
      );
      if (!ctx || targets.length === 0) return;
      await applyDesignChanges(
        targets.map((toothNumber) => ({
          toothNumber,
          params: { ...(ctx.overrides[toothNumber] ?? {}) },
        })),
        "replace",
      );
      persistDesign();
    },
    [applyDesignChanges, persistDesign],
  );

  const startChatResize = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const aside = asideRef.current;
    if (!aside || e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startPx = aside.getBoundingClientRect().width;
    const remPx = rootFontPx();
    const maxPx = window.innerWidth * 0.6;
    let lastRem = startPx / remPx;
    const onMove = (ev: PointerEvent) => {
      const px = Math.min(maxPx, Math.max(CHAT_WIDTH_MIN_REM * remPx, startPx + startX - ev.clientX));
      lastRem = Math.round((px / remPx) * 4) / 4;
      setChatWidthRem(lastRem);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      try {
        window.localStorage.setItem(CHAT_WIDTH_KEY, String(lastRem));
      } catch {
        // 저장 실패해도 이번 세션 너비는 유지
      }
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  /** 지금 화면 + 페인트 표시 + 치아 번호 라벨을 한 장(JPEG data URL)으로 만든다. */
  const captureSketch = useCallback(async (): Promise<string | null> => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const surface = paint.paintRef.current;
    if (!renderer || !camera || !surface) return null;
    const blob = await surface.compositePng(renderer.domElement);
    if (!blob) return null;
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, SKETCH_MAX_PX / Math.max(bitmap.width, bitmap.height, 1));
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(bitmap.width * scale));
    out.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = out.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, out.width, out.height);
    bitmap.close();
    ctx.font = `600 ${Math.round(13 * scale * (window.devicePixelRatio || 1))}px sans-serif`;
    ctx.textBaseline = "middle";
    const p = new THREE.Vector3();
    for (const [tooth, mesh] of abutmentMeshesRef.current.entries()) {
      if (!mesh.visible || !mesh.geometry.boundingBox) continue;
      mesh.geometry.boundingBox.getCenter(p).project(camera);
      const x = ((p.x + 1) / 2) * out.width;
      const y = ((1 - p.y) / 2) * out.height;
      const label = `#${tooth}`;
      const w = ctx.measureText(label).width + 8;
      ctx.fillStyle = "rgba(15,23,42,0.85)";
      ctx.fillRect(x - w / 2, y - 10, w, 20);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, x - w / 2 + 4, y);
    }
    return out.toDataURL("image/jpeg", 0.82);
  }, [paint.paintRef]);

  /** 페인트 막대 「AI에게」: 지금 화면을 첨부로 잡고 대화 입력으로 간다. 보낼 때 같이 간다. */
  const attachSketchToChat = useCallback(() => {
    void captureSketch().then((url) => {
      if (!url) return;
      setSketchUrl(url);
      setChatOpen(true);
      window.requestAnimationFrame(() => chatInputRef.current?.focus());
    });
  }, [captureSketch]);

  const saveViewImage = useCallback(() => {
    const renderer = rendererRef.current;
    const surface = paint.paintRef.current;
    if (!renderer || !surface) return;
    void surface.compositePng(renderer.domElement).then((blob) => {
      if (blob) downloadBlobFile(blob, paintNoteFileName(`커스텀어벗_${patientName || "디자인"}`));
    });
  }, [paint.paintRef, patientName]);

  const savePreferenceDirect = useCallback(
    async (
      token: string,
      update: { scope: string; params: Partial<CustomAbutmentDesignParams>; note: string },
    ): Promise<string> => {
      if (!preferenceCanSave) return "치과 기본값은 의뢰 치과 계정에서만 저장됩니다.";
      const res = await apiFetch<{ data?: { preference?: unknown } }>({
        path: "/api/ai/custom-abutment-design-preference",
        method: "PUT",
        token,
        jsonBody: { transferId: transferIdParam || undefined, ...update },
      });
      if (!res.ok) return "치과 기본값을 저장하지 못했습니다.";
      const nextPref = parseCustomAbutmentPreference(res.data?.data?.preference);
      preferenceRef.current = nextPref;
      setPreference(nextPref);
      return `치과 기본값으로 저장: ${update.note}`;
    },
    [preferenceCanSave, transferIdParam],
  );

  const sendChat = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      const token = String(authToken || "").trim();
      if (!text || chatBusy || !token || designedListRef.current.length === 0) return;
      const history = chatTurnsRef.current
        .filter((t) => !t.pending)
        .map((t) => ({ role: t.role, text: t.text }));
      const sketch =
        sketchUrl ?? (paint.paintRef.current?.hasInk() ? await captureSketch() : null);
      const withUser: ChatTurn[] = [
        ...chatTurnsRef.current,
        { role: "user", text: sketch ? `${text}\n(화면 그림 첨부)` : text },
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
      const showApplying = () => {
        const pendingNext: ChatTurn[] = [
          ...chatTurnsRef.current.filter((t) => !t.pending),
          { role: "assistant", text: "디자인에 반영하는 중…", pending: true },
        ];
        chatTurnsRef.current = pendingNext;
        setChatTurns(pendingNext);
      };

      // 정형 명령(치아 고르기, 「마진 0.3mm 얕게」 등)은 AI를 부르지 않는다. 그림이 있으면 AI가 본다.
      const local = sketch
        ? null
        : parseLocalDesignCommand(text, {
            teeth: designedListRef.current.map((d) => ({
              toothNumber: d.toothNumber,
              params: d.params,
              hasOpposing: d.metrics.occlusalClearanceMm != null,
            })),
            selectedTooth,
          });
      if (local) {
        try {
          if (local.kind === "select") {
            selectTooth(local.toothNumber);
            finish(
              local.toothNumber
                ? `#${local.toothNumber}만 바꿉니다. 전체로 돌리려면 「전체」라고 입력하세요.`
                : "전체 치아를 바꿉니다.",
            );
          } else if (local.kind === "reply") {
            finish(local.text);
          } else if (local.kind === "reset") {
            showApplying();
            await applyDesignChanges(
              local.teeth.map((toothNumber) => ({ toothNumber, params: {} })),
              "replace",
            );
            finish(`기본 디자인으로 되돌렸습니다: ${local.teeth.map((t) => `#${t}`).join(" ")}`);
          } else if (local.kind === "regenerate") {
            showApplying();
            await regenerateDesigns(local.teeth);
            finish(`다시 만들었습니다: ${local.teeth.map((t) => `#${t}`).join(" ")}`);
          } else {
            const before = new Map(designedListRef.current.map((d) => [d.toothNumber, d.params]));
            showApplying();
            await applyDesignChanges(local.changes);
            const lines = [describeChanges(local.changes, before) || "바꿀 내용이 없습니다."];
            if (local.preference) lines.push(await savePreferenceDirect(token, local.preference));
            finish(lines.join("\n"));
          }
        } catch (err) {
          console.warn("[custom-abutment] local command failed", err);
          finish("디자인을 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.");
        } finally {
          setChatBusy(false);
        }
        return;
      }

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
            image: sketch ?? undefined,
            teeth: designedListRef.current.map((d) => ({
              toothNumber: d.toothNumber,
              params: d.params,
              metrics: metricsForAi(d),
            })),
          },
        });
        if (sketch && res.ok) {
          setSketchUrl(null);
          paint.paintRef.current?.clear({ silent: true });
          paint.setPaintOn(false);
        }
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
        showApplying();
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
    [
      applyDesignChanges,
      regenerateDesigns,
      authToken,
      captureSketch,
      chatBusy,
      paint,
      persistDesign,
      savePreferenceDirect,
      selectTooth,
      selectedTooth,
      sketchUrl,
      transferIdParam,
    ],
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

  const renderChatPanel = () => (
    <aside
      ref={asideRef}
      className={cn(
        "pointer-events-auto relative flex max-w-[60vw] flex-col rounded-lg border bg-background/95 shadow-sm",
        chatCollapsed ? "shrink-0" : "min-h-0 flex-1",
      )}
      style={{ width: `${chatWidthRem}rem` }}
    >
      {chatCollapsed ? null : (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="대화 패널 너비"
          className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize rounded-l-lg hover:bg-primary/20"
          onPointerDown={startChatResize}
        />
      )}
      <div
        className={cn(
          "flex items-center gap-1.5 py-1 pl-2.5 pr-1 text-xs font-semibold text-foreground",
          chatCollapsed ? null : "border-b",
        )}
      >
        <Bot className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate">AI 디자인 대화</span>
        {chatBusy ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" /> : null}
        <button
          type="button"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={chatCollapsed ? "대화 펼치기" : "대화 접기"}
          title={chatCollapsed ? "대화 펼치기" : "대화 접기"}
          aria-expanded={!chatCollapsed}
          onClick={() => setChatCollapsed((v) => !v)}
        >
          {chatCollapsed ? (
            <ChevronsUpDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronsDownUp className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      {chatCollapsed ? null : (
        <>
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
                <p className="leading-relaxed">
                  바꾸고 싶은 점을 말이나 그림으로 알려 주면 디자인을 다시 만듭니다.
                  <br />
                  치아는 왼쪽 목록이나 화면의 번호 뱃지를 누르거나, #23처럼 입력해 고릅니다.
                  <br />
                  페인트로 표시하고 「AI에게」를 누르면 그림이 함께 전달됩니다.
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
            <div className="flex items-center gap-2 text-[0.6875rem] text-muted-foreground">
              <span>대상 {selectedTooth ? `#${selectedTooth}` : "전체 치아"}</span>
              {selectedTooth ? (
                <button
                  type="button"
                  className="rounded px-1 font-medium text-primary hover:bg-muted"
                  onClick={() => setSelectedTooth(null)}
                >
                  전체로
                </button>
              ) : null}
              {!sketchUrl && paint.paintOn && paint.count > 0 ? (
                <span className="text-rose-600">보내면 그림도 함께 갑니다</span>
              ) : null}
            </div>
            {sketchUrl ? (
              <div className="relative h-14 w-20 overflow-hidden rounded-md border">
                <img src={sketchUrl} alt="첨부한 화면" className="h-full w-full object-cover" />
                <button
                  type="button"
                  className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-white/95 text-slate-600 shadow-sm hover:bg-destructive hover:text-destructive-foreground"
                  aria-label="첨부 지우기"
                  onClick={() => setSketchUrl(null)}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : null}
            <div className="flex items-end gap-1.5">
              <Textarea
                ref={chatInputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void sendChat(chatInput);
                  }
                }}
                placeholder={
                  sketchUrl || paint.count > 0
                    ? "표시한 부위를 어떻게 바꿀지 적어 주세요"
                    : "예: #23 마진 0.3mm 얕게"
                }
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
        </>
      )}
    </aside>
  );

  const hasOpposingJaw =
    (prepJaws.has("upper") && availableJaws.lower) ||
    (prepJaws.has("lower") && availableJaws.upper);
  const ready = status.kind === "ready" && designedList.length > 0;

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
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
                >
                  <Settings className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">설정</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="z-[520] w-60 space-y-3 p-3 text-xs">
                <label className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                    AI 디자인 대화
                  </span>
                  <Switch checked={chatOpen} onCheckedChange={setChatOpen} />
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span className="font-medium">스캔색</span>
                  <Switch checked={colorMapping} onCheckedChange={setColorMapping} />
                </label>
                <div className="space-y-1.5">
                  <span className="font-medium">가이드</span>
                  <div className="grid grid-cols-3 gap-1">
                    {CENTER_GUIDE_OPTIONS.map((opt) => (
                      <Button
                        key={opt.value}
                        type="button"
                        size="sm"
                        variant={centerGuide === opt.value ? "default" : "outline"}
                        className="h-7 px-2 text-xs"
                        onClick={() => setCenterGuide(opt.value)}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
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
            <div ref={bindHostRef} className="relative h-full w-full touch-none overflow-hidden" />

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
                </div>
              </div>
            ) : null}

            {ready ? (
              <div className="pointer-events-none absolute bottom-3 left-3 top-3 z-10 flex min-h-0 flex-col items-start gap-2 overflow-hidden">
                <PracticeCustomAbutmentViewCube
                  ref={viewCubeRef}
                  className="shrink-0"
                  faceLabels={cubeFaceLabels}
                  caption={cubeView ? `#${cubeView.toothNumber} 기준` : null}
                  pivotActive={pivotSet}
                  pivotArmed={pivotArmed}
                  onFace={jumpToFace}
                  onHome={() => {
                    setSelectedTooth(null);
                    fitDefaultCamera();
                  }}
                  onFit={fitCurrentView}
                  onRoll={rollView}
                  onPivot={() => {
                    if (pivotSet || pivotArmed) {
                      clearPivot();
                      return;
                    }
                    setPivotArmed(true);
                  }}
                  onOrbit={(gesture) => applyExternalView(controlsRef.current, gesture)}
                />
                {designedList.length > 0 ? (
                  <PracticeCustomAbutmentDesignTree
                    className="min-h-0"
                    items={designedList}
                    visibleTeeth={visibleTeeth}
                    selectedTooth={selectedTooth}
                    redesigning={redesigning}
                    onToggleVisible={(toothNumber) =>
                      setVisibleTeeth((prev) => ({
                        ...prev,
                        [toothNumber]: prev[toothNumber] === false,
                      }))
                    }
                    onSetAllVisible={(visible) =>
                      setVisibleTeeth(
                        Object.fromEntries(designedList.map((d) => [d.toothNumber, visible])),
                      )
                    }
                    shownScanbodies={shownScanbodies}
                    onToggleScanbody={(toothNumber) =>
                      setShownScanbodies((prev) => ({ ...prev, [toothNumber]: !prev[toothNumber] }))
                    }
                    onSetAllScanbodies={(shown) =>
                      setShownScanbodies(
                        Object.fromEntries(designedList.map((d) => [d.toothNumber, shown])),
                      )
                    }
                    onSelect={(toothNumber) => {
                      if (selectedTooth === toothNumber) {
                        setSelectedTooth(null);
                        fitDefaultCamera();
                        return;
                      }
                      focusSingleTooth(toothNumber);
                    }}
                    onDownload={(item) => saveBlobAsDownload(item.stlBlob, item.fileName)}
                    onRegenerate={() => void regenerateDesigns()}
                  />
                ) : null}
              </div>
            ) : null}

            {ready && chatOpen ? (
              <div className="pointer-events-none absolute bottom-3 right-3 top-3 z-10 flex flex-col items-end">
                {renderChatPanel()}
              </div>
            ) : null}

            <ViewPaintSurface
              {...viewPaintSurfaceProps(paint)}
              enabled={ready && paint.paintOn}
              space={paintSpace}
            />
            {ready ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-3">
                <ViewPaintToolbar
                  paint={paint}
                  collapsible
                  onSaveImage={saveViewImage}
                  onSendToAi={attachSketchToChat}
                />
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

        </div>
      </DialogContent>
    </Dialog>
  );
}
