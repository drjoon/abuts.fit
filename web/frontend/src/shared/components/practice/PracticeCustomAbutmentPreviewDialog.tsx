// 치과 채팅의 작업 스캔 → 전체 화면 커스텀어벗 디자인 모달.
// 헤더 다운로드는 스크류홀이 열린 어벗을 악궁에 넣은 상악·하악·바이트(기공소 크라운 작업용).
// 포맷은 받을 포맷이 있으면 그걸, 없으면 디자인 소프트웨어 설정이다(3Shape DCM, 그 외 PLY 칼라).
// 치과 스캔에서 스캔바디를 인식·라이브러리 정합해 픽스쳐 위치를 잡고, 그 상방에 커스텀어벗 STL을 디자인하여
// 스캔 치아 데이터 위에 올라간 모습으로 확인한다.
// 한 번 만든 디자인은 이 브라우저에 저장해 다시 열 때 그대로 보여 준다.
// 커프·대합 거리 같은 취향은 확정 때 다음 케이스 적용을 묻는다.
// 기울기·이동·회전이 여러 케이스에서 반복되면 관리자 승인 뒤에만 생성에 더한다.
// 이미 쌓인 AI 대화는 의뢰별로 저장만 하고, 이 화면에서는 패널을 열지 않는다.
// 번호 뱃지·어벗을 누르면 카메라 뷰는 그대로 두고 그 치아만 고른다.
// 어벗 정보에서는 그 치아만 펼치고, 검볼도 펼친 어벗만 보여 준다.
// 화살표는 이동, 우상 점은 크기·평면 스케일, 좌하 호는 회전이다. 커넥션과 2° 테이퍼는 고정이다.
// - 2026-11-19: 기공소가 제조 주문을 취소한 뒤 치과 「취소 가능」은 확정을 해제하고 다시 확정한다.
// - 2026-11-19: 기공소 디자인 확정 — 제조 의뢰 응답을 부모에 넘겨 목록 상태를 바로 갱신한다.
// - 2026-11-19: 기공소 확정 — 형상을 안 바꿨으면 프리뷰 STL을 다시 올리지 않는다.
// - 2026-11-19: 소통 패널은 뷰 큐브 아래 플로팅(기공소: 치과 소통, 치과: 기공소 소통).
// - 2026-11-19: 소통 패널은 접기만 한다. chatOpen false는 숨김이 아니라 접힘. 뷰 큐브 크기는 그대로.
// - 2026-11-19: 치과 소통은 뷰 큐브 아래 플로팅. 검토 안내는 디자인 확정 툴팁.
// - 2026-11-19: 기공소는 치과 디자인 확정 전 뷰어로 두지 않고 모달을 닫는다.
// - 2026-11-20: 기공소 열기 — 확정 JSON만 먼저 보고, 스캔과 프리뷰 STL은 같이 받는다.
// - 2026-11-19: filesPending — 캘린더 hydrate 전에 모달을 먼저 열고 스캔 키를 기다린다.
// related files:
// - web/frontend/src/shared/practice/customAbutmentScanbodyMatch.ts
// - web/frontend/src/shared/practice/customAbutmentStlDesign.ts
// - web/frontend/src/shared/practice/customAbutmentDesignParams.ts
// - web/frontend/src/shared/practice/customAbutmentDesignCache.ts
// - web/frontend/src/shared/practice/abutmentDesignLogic.ts
// - web/backend/services/abutmentDesignLogic.service.js
// - web/backend/controllers/ai/customAbutmentDesignChat.controller.js
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentDesignTree.tsx
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentViewCube.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import {
  Axis3d,
  Check,
  ChevronDown,
  Download,
  Loader2,
  MessageSquare,
  Paintbrush,
  Redo2,
  RotateCcw,
  Send,
  Settings,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  VIEW_GESTURE_HINT_LAYER_CLASS,
  ViewGestureHint,
} from "@/shared/components/ViewGestureHint";
import { AbutsLogo } from "@/components/branding/AbutsLogo";
import { PracticeAbutmentDesignReviewRail } from "@/shared/practice/practiceAbutmentDesignReview";
import { saveBlobAsDownload } from "@/shared/files/downloadWithProgress";
import {
  readStoredDcmDownloadFormat,
  type DcmDownloadFormat,
} from "@/shared/files/dcmDownloadFormat";
import {
  encodeLabMeshData,
  meshesToLabMeshData,
} from "@/shared/files/labDownloadMeshes";
import { dcmFormatForDesignSoftware } from "@/shared/files/labWorkFolder";
import { useAccountDesignSoftware } from "@/shared/files/useAccountDesignSoftware";
import {
  applyScanColorToneMapping,
  createModelPreviewMaterial,
  fileFromImageBlob,
  fileFromModelBlob,
  getModelExtLower,
  isScanColorPreview,
  loadTextureFromFile,
  parseModelPreview,
  peekPlyHeaderInfo,
  resolveCompanionTextureFileName,
  SCAN_COLOR_PREVIEW_BACKGROUND,
} from "@/shared/files/modelPreviewFile";
import { readCachedScanGeometry, storeScanGeometry } from "@/shared/files/scanMeshCache";
import { fetchS3BlobCached } from "@/shared/files/s3BlobCache";
import { buildS3ProxyDownloadUrl } from "@/shared/files/useS3FileDownload";
import { registerJawsToBiteResult } from "@/shared/practice/biteRegistration";
import { preloadMeshUnion } from "@/shared/practice/meshUnion";
import {
  CUSTOM_ABUTMENT_DESIGN_VERSION,
  CUSTOM_ABUTMENT_FIT_VERSION,
  beginCustomAbutmentSnapshot,
  confirmCustomAbutmentDesignRemote,
  customAbutmentDesignCacheKey,
  preferFresherCustomAbutmentDesign,
  normalizeCustomAbutmentChat,
  pickCustomAbutmentChat,
  publishCustomAbutmentSnapshot,
  readCustomAbutmentChat,
  readCustomAbutmentDesign,
  requestManualCustomAbutmentDesignRemote,
  saveCustomAbutmentDesignPaintRemote,
  toArrayBuffer,
  writeCustomAbutmentChat,
  writeCustomAbutmentDesign,
  type CachedAlignedScan,
  type CustomAbutmentChatTurn,
  type CustomAbutmentPaintRecord,
  type CustomAbutmentPaintView,
  type CustomAbutmentRouteFeeGuide,
} from "@/shared/practice/customAbutmentDesignCache";
import { ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE } from "@/shared/pricing/abutsAbutmentService";
import {
  CUSTOM_ABUTMENT_PARAM_SPECS,
  EMPTY_CUSTOM_ABUTMENT_PREFERENCE,
  RETENTION_SINGLE_MIN_TAPER_DEG,
  computeOptimalPostTaperDeg,
  postRetentionSurface,
  parseCustomAbutmentParamOverrides,
  parseCustomAbutmentPreference,
  preferenceOverridesForTooth,
  resolveAbutmentBridgeRetentionSpec,
  type CustomAbutmentDesignParams,
  type CustomAbutmentDesignPreference,
  type CustomAbutmentPreferenceScope,
} from "@/shared/practice/customAbutmentDesignParams";
import {
  collectGenerationEditRows,
  parseAbutmentGenerationRules,
  type AbutmentGenerationRule,
} from "@/shared/practice/abutmentDesignLogic";
import { getDesignControls, matchDesignKey } from "@/shared/practice/labDesignControls";
import {
  detectAndMatchScanbodiesOnJaw,
  locateNominalToothSlot,
  matchScanbodyNearPoint,
  splitScanByScanbodies,
  fixturePoseToMatrix4,
  loadCandidateScanbodyModels,
  parseFdiTooth,
  type LoadedScanbodyModel,
  type MatchedScanbodyFixture,
} from "@/shared/practice/customAbutmentScanbodyMatch";
import {
  abutmentTopLooksClosed,
  buildDesignedCustomAbutment,
  designCustomAbutmentCandidates,
  designCustomAbutmentStl,
  openScrewChannelForView,
  type CustomAbutmentDesignCandidate,
  type CustomAbutmentDesignMetrics,
  type DesignedCustomAbutment,
} from "@/shared/practice/customAbutmentStlDesign";
import { abutmentEditTargets, nextAbutmentSelection } from "@/shared/practice/customAbutmentSelection";
import { hydrateToothAnatomyCatalog } from "@/shared/practice/toothAnatomy";
import {
  loadCustomAbutmentViewerPrefs,
  saveCustomAbutmentViewerPrefs,
  DEFAULT_CUSTOM_ABUTMENT_VIEWER_PREFS,
  type CustomAbutmentViewerPrefs,
} from "@/shared/practice/customAbutmentViewerPrefs";
import {
  AbutmentDirectEditSession,
  gumballPatchSetsPostHeight,
  normalizeAbutmentEdit,
  retainLiveGumballParams,
  type AbutmentEdit,
  type AbutmentEditBridge,
  type AbutmentEditSummary,
} from "@/shared/components/practice/abutmentDirectEdit";
import {
  ABUTMENT_INFO_FIELD_LABELS,
  computeParamsFromInfoFieldEdit,
  formatAbutmentInfoFieldValue,
  PracticeCustomAbutmentDesignTree,
  type AbutmentAxisSource,
  type AbutmentInfoFieldKey,
} from "@/shared/components/practice/PracticeCustomAbutmentDesignTree";
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
import type { PaintShape } from "@/shared/components/practice/viewPaintGeom";
import { useChatMessages } from "@/shared/hooks/useChatMessages";
import { useToast } from "@/shared/hooks/use-toast";
import { onAppEvent } from "@/shared/realtime/socket";
import {
  PracticeCustomAbutmentViewCube,
  toothViewCube,
  viewCubeDirection,
  type ViewCubeFace,
  type ViewCubeHandle,
} from "@/shared/components/practice/PracticeCustomAbutmentViewCube";
import { estimateDentalFrame, type DentalFrame } from "@/shared/practice/dentalFrame";
import {
  isAbutsWorkScanFileName,
  isOralScanMeshName,
  preferWorkingOralScanFiles,
  resolveOralScanRole,
} from "@/shared/practice/labProsthesisAiDesign";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { type ScanbodyCatalog } from "@/shared/practice/scanbodyLibraryApi";
import {
  resolveCustomAbutmentSelection,
  toToothMemoSortNumber,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";
import {
  useImplantConnectionCatalog,
  type ImplantConnection,
} from "@/shared/practice/useImplantConnectionCatalog";
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
  CONTENT_MEASURED_CHROME_CLASS,
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
  /** 관리자 확인. 저장된 형상·대화만 보여주고 새로 만들지 않는다. */
  readOnly?: boolean;
  /** 치과(발신) 또는 기공소(수신) 역할 구분 */
  viewerRole?: "practice" | "lab";
  /** 확정 & 의뢰, 수작업 의뢰, 확정 취소, 기공소 확인 후 콜백 */
  onActionComplete?: (
    action: "confirmed" | "manual" | "checked" | "cancelled" | "unconfirmed",
    detail?: { body?: unknown },
  ) => void;
  /** 검토 대기 의뢰. 헤더에서 한 건씩 넘긴다. */
  reviewItems?: readonly { id: string; label: string }[];
  reviewIndex?: number;
  onReviewIndexChange?: (index: number) => void;
  /**
   * 캘린더 행처럼 s3Key가 아직 없을 때. 부모가 hydrate하는 동안
   * 스캔 없음 에러 대신 로딩을 보여 모달을 먼저 연다.
   */
  filesPending?: boolean;
};

type PendingInfoChange = {
  id: string;
  toothNumber: string;
  field: AbutmentInfoFieldKey;
  label: string;
  beforeText: string;
  afterText: string;
  params: Partial<CustomAbutmentDesignParams>;
};

const ROUTE_COST_DISMISS_PREFIX = "abuts.caRouteCost.v1.dismissed.";

function routeCostDismissed(userId: string) {
  try {
    return window.localStorage.getItem(`${ROUTE_COST_DISMISS_PREFIX}${userId || "anon"}`) === "1";
  } catch {
    return false;
  }
}

function rememberRouteCostDismissed(userId: string) {
  try {
    window.localStorage.setItem(`${ROUTE_COST_DISMISS_PREFIX}${userId || "anon"}`, "1");
  } catch {
    // 저장이 안 되면 다음에도 모달을 보여 준다.
  }
}

function formatWon(amount: number) {
  return `${Math.max(0, Math.round(amount)).toLocaleString("ko-KR")}원`;
}

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
  | { kind: "pick"; toothNumber: string; phase: "aim" | "empty" | "searching" | "designing" | "miss" }
  | { kind: "error"; message: string };

type ScanbodyPickJob = {
  toothNumber: string;
  jaw: "upper" | "lower";
  toothWork: ToothWorkSelection;
  models: LoadedScanbodyModel[];
};

type ScanbodyPickSession = {
  jobs: ScanbodyPickJob[];
  connections: readonly ImplantConnection[];
  busy: boolean;
};

type ChatTurn = CustomAbutmentChatTurn & { pending?: boolean };

type DesignChange = { toothNumber: string; params: Partial<CustomAbutmentDesignParams> };

/** 재디자인·저장에 쓰는 현재 디자인 입력. 렌더와 무관해서 ref로 둔다. */
type DesignContext = {
  cacheKey: string;
  patientName: string;
  jawGeometry: { upper: THREE.BufferGeometry | null; lower: THREE.BufferGeometry | null };
  fixtures: MatchedScanbodyFixture[];
  allToothWorks: readonly ToothWorkSelection[];
  overrides: Record<string, Partial<CustomAbutmentDesignParams>>;
  alignedScans: CachedAlignedScan[];
};

const VIEWER_PLAIN_BG = 0xe6e9ec;
const FIT_MARGIN = 1.06;
const MARGIN_LINE_COLOR = 0x0891b2;
const MARGIN_LINE_PX = 3.5;
const PIVOT_MARKER_COLOR = 0xf59e0b;
/** 이미 잡힌 치아 상단 근처를 찍으면 그 자리를 가져온다(잘못된 자동 배정·스왑 교정). */
const SCANBODY_STEAL_RADIUS_MM = 5;
const VIEW_KEY_PREFIX = "abuts.caDesign.view.v1:";
/** 레거시 단일 키. 의뢰별 키로 옮긴 뒤 지운다. */
const VIEW_KEY_LEGACY = "abuts.caDesign.view.v1";
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

function viewStorageKey(transferId: string): string {
  return `${VIEW_KEY_PREFIX}${transferId}`;
}

function parseSavedView(raw: unknown, transferId: string): SavedCaView | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as SavedCaView;
  if (row.transferId && row.transferId !== transferId) return null;
  if (!Array.isArray(row.pos) || row.pos.length !== 3) return null;
  if (!Number.isFinite(row.zoom) || !Number.isFinite(row.top)) return null;
  return { ...row, transferId };
}

function readSavedView(transferId: string): SavedCaView | null {
  if (!transferId) return null;
  try {
    const keyed = parseSavedView(
      JSON.parse(sessionStorage.getItem(viewStorageKey(transferId)) || "null"),
      transferId,
    );
    if (keyed) return keyed;
    const legacy = parseSavedView(
      JSON.parse(sessionStorage.getItem(VIEW_KEY_LEGACY) || "null"),
      transferId,
    );
    if (!legacy) return null;
    try {
      sessionStorage.setItem(viewStorageKey(transferId), JSON.stringify(legacy));
      sessionStorage.removeItem(VIEW_KEY_LEGACY);
    } catch {
      // 마이그레이션 실패해도 이번 복원은 유지
    }
    return legacy;
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
    sessionStorage.setItem(viewStorageKey(transferId), JSON.stringify(payload));
    sessionStorage.removeItem(VIEW_KEY_LEGACY);
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
const VIEW_ANIM_MS = 280;

function labDesignConfirmHint(cancelDeadlineAt: string | null): ReactNode {
  if (cancelDeadlineAt && new Date(cancelDeadlineAt).getTime() < Date.now()) {
    return (
      <>
        확정 기한이 지났습니다.
        <br />
        지금 확정해도 의뢰자 취소는 닫혀 있습니다.
      </>
    );
  }
  if (cancelDeadlineAt) {
    const label = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(cancelDeadlineAt));
    return (
      <>
        {label}까지 검토해 주세요.
        <br />
        크라운에 맞게 수정한 뒤 디자인 확정하면 제조로 넘어갑니다.
      </>
    );
  }
  return (
    <>
      1영업일 안에 검토해 주세요.
      <br />
      크라운에 맞게 수정한 뒤 디자인 확정하면 제조로 넘어갑니다.
    </>
  );
}
const CENTER_GUIDE_OPTIONS: Array<{ value: CenterGuideMode; label: string }> = [
  { value: "off", label: "끔" },
  { value: "center", label: "중앙선" },
  { value: "grid", label: "모눈" },
];

function createFixtureAnalogGeometry(originDiameterMm: number, lengthMm = 9.5): THREE.BufferGeometry {
  const topR = Math.max(1.5, originDiameterMm * 0.56);
  const botR = Math.max(1.15, topR * 0.78);
  const geo = new THREE.CylinderGeometry(topR, botR, lengthMm, 32, 8, false);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0, -lengthMm / 2 - 0.05);
  geo.computeVertexNormals();
  return geo;
}

export function PracticeCustomAbutmentPreviewButton({
  disabled,
  className,
  onOpen,
  title,
  ...dialogProps
}: Omit<PracticeCustomAbutmentPreviewDialogProps, "open" | "onOpenChange"> & {
  disabled?: boolean;
  className?: string;
  /** 비활성·안내 툴팁 */
  title?: string;
  /** 있으면 이 버튼은 열기만 하고, 다이얼로그는 부모가 연다. */
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);

  const button = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      className={cn(
        "h-7 shrink-0 gap-1 border-primary/45 bg-background px-2.5 text-xs font-medium text-primary hover:bg-primary/10 hover:text-primary",
        className,
      )}
      onClick={() => {
        if (disabled) return;
        if (onOpen) {
          onOpen();
          return;
        }
        setOpen(true);
      }}
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0" />
      <span>디자인</span>
    </Button>
  );

  return (
    <>
      {title ? (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="bottom" className="z-[520] max-w-xs text-xs">
            {title}
          </TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
      {open && !onOpen ? (
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
  tip?: ReactNode;
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

function HeaderIconButton({
  label,
  tip,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  tip?: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={active ? "default" : "outline"}
          className="h-8 w-8 px-0"
          disabled={disabled}
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="z-[520]">
        {tip ?? label}
      </TooltipContent>
    </Tooltip>
  );
}

function crownScanStem(patientName: string | undefined, role: string) {
  const safe = (patientName || "스캔").replace(/[\\/:*?"<>|]+/g, " ").trim() || "스캔";
  return `${safe}_${role}`;
}

/** 받을 포맷이 있으면 그걸, 없으면 디자인 소프트웨어(3Shape=DCM, ExoCAD·그외=PLY). */
function crownDownloadFormat(designSoftware: string): DcmDownloadFormat {
  return (
    readStoredDcmDownloadFormat() ||
    (designSoftware.trim() ? dcmFormatForDesignSoftware(designSoftware) : "dcm")
  );
}

/** 바이트처럼 씬에 없는 스캔. 캐시·동반 텍스처를 쓰고, 복사본은 호출부가 버린다. */
async function loadExportScanMesh(
  item: PracticeDesignPreviewFileItem,
  token: string,
  companions: readonly PracticeDesignPreviewFileItem[],
): Promise<THREE.Mesh | null> {
  const s3Key = String(item.s3Key || "").trim();
  if (!s3Key) return null;
  let geometry = await readCachedScanGeometry(s3Key);
  let texture: THREE.Texture | null = null;
  if (!geometry) {
    const blob = await fetchS3BlobCached({
      s3Key,
      fileName: item.fileName,
      token,
      buildUrl: buildS3ProxyDownloadUrl,
    });
    const modelFile = fileFromModelBlob(blob, item.fileName);
    const ext = getModelExtLower(item.fileName);
    let preferredTex: string | null = null;
    const companionFiles: File[] = [];
    if ((ext === ".ply" || ext === ".obj") && companions.length > 0) {
      preferredTex =
        ext === ".ply" ? peekPlyHeaderInfo(await blob.arrayBuffer()).textureFileName : null;
      const texName = resolveCompanionTextureFileName(
        item.fileName,
        preferredTex,
        companions.map((c) => c.fileName),
      );
      const hit = texName ? companions.find((c) => c.fileName === texName) : null;
      if (hit?.s3Key) {
        const texBlob = await fetchS3BlobCached({
          s3Key: hit.s3Key,
          fileName: hit.fileName,
          token,
          buildUrl: buildS3ProxyDownloadUrl,
        });
        companionFiles.push(fileFromImageBlob(texBlob, hit.fileName));
      }
    }
    const parsed = await parseModelPreview(modelFile, {
      textureFile: companionFiles[0] ?? null,
      companionFiles,
    });
    storeScanGeometry(s3Key, parsed.geometry);
    geometry = parsed.geometry;
    texture = parsed.texture;
  } else if (geometry.getAttribute("uv") && companions.length > 0) {
    const texName = resolveCompanionTextureFileName(
      item.fileName,
      null,
      companions.map((c) => c.fileName),
    );
    const hit = texName ? companions.find((c) => c.fileName === texName) : null;
    if (hit?.s3Key) {
      try {
        const texBlob = await fetchS3BlobCached({
          s3Key: hit.s3Key,
          fileName: hit.fileName,
          token,
          buildUrl: buildS3ProxyDownloadUrl,
        });
        texture = await loadTextureFromFile(fileFromImageBlob(texBlob, hit.fileName));
      } catch {
        texture = null;
      }
    }
  }
  const mat = createModelPreviewMaterial(geometry, texture);
  const mesh = new THREE.Mesh(geometry, mat);
  if (texture) mesh.userData.scanTexture = texture;
  return mesh;
}

function disposeExportMesh(mesh: THREE.Mesh) {
  mesh.geometry.dispose();
  const mat = mesh.material as THREE.MeshStandardMaterial;
  const tex = mesh.userData.scanTexture as THREE.Texture | undefined;
  if (mat.map && mat.map !== tex) mat.map.dispose();
  tex?.dispose();
  mat.dispose();
}

const USER_EDIT_PREF_PREFIX = "abuts.abutmentDirectPreference.v1.";

function readUserEditPreference(userId: string): CustomAbutmentDesignPreference {
  if (!userId || typeof localStorage === "undefined") return EMPTY_CUSTOM_ABUTMENT_PREFERENCE;
  try {
    return parseCustomAbutmentPreference(JSON.parse(localStorage.getItem(USER_EDIT_PREF_PREFIX + userId) || "null"));
  } catch {
    return EMPTY_CUSTOM_ABUTMENT_PREFERENCE;
  }
}

function mergeEditPreference(
  base: CustomAbutmentDesignPreference,
  extra: CustomAbutmentDesignPreference,
): CustomAbutmentDesignPreference {
  const scopes: CustomAbutmentDesignPreference["scopes"] = { ...base.scopes };
  for (const scope of ["all", "anterior", "posterior"] as const) {
    const next = { ...(base.scopes[scope] ?? {}), ...(extra.scopes[scope] ?? {}) };
    if (Object.keys(next).length > 0) scopes[scope] = next;
  }
  return {
    scopes,
    notes: [...base.notes, ...extra.notes].filter(Boolean).slice(-20),
    updatedAt: extra.updatedAt || base.updatedAt,
  };
}

function shiftMetric(base: number, now: number, orig: number, digits = 2) {
  const scale = 10 ** digits;
  return Math.round((base + (now - orig)) * scale) / scale;
}

/** 검볼로 움직인 만큼만 초기 정보 수치에 더한다. 손을 떼고 원위치면 처음 수치다. */
function metricsFromGumball(
  base: CustomAbutmentDesignMetrics,
  summary: AbutmentEditSummary,
  taperLinked = true,
): CustomAbutmentDesignMetrics {
  if (summary.neutral || !summary.measured || !summary.baselineMeasured) return base;
  const now = summary.measured;
  const orig = summary.baselineMeasured;
  const nextPostHeightMm = shiftMetric(base.postHeightMm, now.postHeightMm, orig.postHeightMm);
  const bridgeCtx = {
    isBridge: Boolean(base.isBridge),
    retainerCount: base.bridgeRetainerCount,
  };
  const taperSpec = resolveAbutmentBridgeRetentionSpec(bridgeCtx);
  const widthScale = orig.maxDiameterMm > 0.5 ? now.maxDiameterMm / orig.maxDiameterMm : 1;
  const wallRadiusMm =
    base.postWallRadiusMm != null && Number.isFinite(base.postWallRadiusMm)
      ? Math.max(1.1, base.postWallRadiusMm * widthScale)
      : undefined;
  const hasTilt =
    Math.abs(summary.shiftLabialMm) >= 0.05 || Math.abs(summary.shiftMesialMm) >= 0.05;
  const rawNextTaper = taperLinked
    ? computeOptimalPostTaperDeg(nextPostHeightMm, bridgeCtx, postRetentionSurface(wallRadiusMm))
    : Math.abs(summary.heightDeltaMm) >= 0.02
      ? base.postTaperDeg
      : hasTilt
        ? shiftMetric(base.postTaperDeg, now.postTaperDeg, orig.postTaperDeg, 1)
        : base.postTaperDeg;
  const minTaper = taperLinked ? taperSpec.minTaperDeg : RETENTION_SINGLE_MIN_TAPER_DEG;
  const nextPostTaperDeg = Math.min(taperSpec.maxTaperDeg, Math.max(minTaper, rawNextTaper));
  return {
    ...base,
    maxDiameterMm: shiftMetric(base.maxDiameterMm, now.maxDiameterMm, orig.maxDiameterMm),
    cuffHeightMinMm: shiftMetric(base.cuffHeightMinMm, now.cuffHeightMinMm, orig.cuffHeightMinMm),
    cuffHeightMaxMm: shiftMetric(base.cuffHeightMaxMm, now.cuffHeightMaxMm, orig.cuffHeightMaxMm),
    postHeightMm: nextPostHeightMm,
    ...(wallRadiusMm != null ? { postWallRadiusMm: Math.round(wallRadiusMm * 100) / 100 } : {}),
    totalLengthMm: shiftMetric(base.totalLengthMm, now.totalLengthMm, orig.totalLengthMm),
    angulationDeg: shiftMetric(base.angulationDeg, now.angulationDeg, orig.angulationDeg, 1),
    postTaperDeg: nextPostTaperDeg,
    cutbackMm:
      now.cutbackMm == null || orig.cutbackMm == null
        ? base.cutbackMm
        : shiftMetric(base.cutbackMm, now.cutbackMm, orig.cutbackMm),
    crownOverPostMm:
      base.crownOverPostMm == null || now.crownOverPostMm == null || orig.crownOverPostMm == null
        ? base.crownOverPostMm
        : shiftMetric(base.crownOverPostMm, now.crownOverPostMm, orig.crownOverPostMm),
    occlusalClearanceMm: now.hasOpposingProbe
      ? now.occlusalClearanceMm == null
        ? null
        : base.occlusalClearanceMm != null &&
            orig.occlusalClearanceMm != null &&
            Math.abs(base.occlusalClearanceMm - orig.occlusalClearanceMm) <= 0.12
          ? Math.max(0, shiftMetric(base.occlusalClearanceMm, now.occlusalClearanceMm, orig.occlusalClearanceMm))
          : now.occlusalClearanceMm
      : base.occlusalClearanceMm == null
        ? null
        : now.occlusalClearanceMm != null && orig.occlusalClearanceMm != null
          ? Math.max(0, shiftMetric(base.occlusalClearanceMm, now.occlusalClearanceMm, orig.occlusalClearanceMm))
          : Math.round(Math.max(0, base.occlusalClearanceMm - summary.heightDeltaMm) * 100) / 100,
  };
}

function sameAbutmentMetrics(a: CustomAbutmentDesignMetrics, b: CustomAbutmentDesignMetrics) {
  return (
    a.maxDiameterMm === b.maxDiameterMm &&
    a.cuffHeightMinMm === b.cuffHeightMinMm &&
    a.cuffHeightMaxMm === b.cuffHeightMaxMm &&
    a.postHeightMm === b.postHeightMm &&
    a.totalLengthMm === b.totalLengthMm &&
    a.angulationDeg === b.angulationDeg &&
    a.postTaperDeg === b.postTaperDeg &&
    a.postLingualBevelMm === b.postLingualBevelMm &&
    a.postLabialBevelMm === b.postLabialBevelMm &&
    a.cutbackMm === b.cutbackMm &&
    a.crownOverPostMm === b.crownOverPostMm &&
    a.occlusalClearanceMm === b.occlusalClearanceMm
  );
}

function writeUserEditPreference(
  userId: string,
  scope: CustomAbutmentPreferenceScope,
  params: Partial<CustomAbutmentDesignParams>,
  note: string,
) {
  if (!userId) return null;
  const next = mergeEditPreference(readUserEditPreference(userId), {
    scopes: { [scope]: params },
    notes: note ? [note] : [],
    updatedAt: new Date().toISOString(),
  });
  try {
    localStorage.setItem(USER_EDIT_PREF_PREFIX + userId, JSON.stringify(next));
  } catch {
    // 저장 공간이 없으면 이번 케이스 형상만 남긴다.
  }
  return next;
}

function formatCancelLeft(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const clock = [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
  return days > 0 ? `${days}일 ${clock}` : clock;
}

function CancelWindowTimer({
  deadlineAt,
  closed,
  onCancel,
  busy = false,
}: {
  deadlineAt: string | null;
  closed: boolean;
  onCancel?: () => void;
  busy?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (closed || !deadlineAt) return;
    const end = new Date(deadlineAt).getTime();
    if (!Number.isFinite(end) || end <= Date.now()) return;
    const id = window.setInterval(() => {
      const next = Date.now();
      setNow(next);
      if (next >= end) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [closed, deadlineAt]);
  const end = deadlineAt ? new Date(deadlineAt).getTime() : Number.NaN;
  const open =
    !closed &&
    (!deadlineAt || (Number.isFinite(end) && end > now));
  const label = open
    ? deadlineAt && Number.isFinite(end)
      ? `취소 가능 ${formatCancelLeft(end - now)}`
      : "취소 가능"
    : closed || (deadlineAt && Number.isFinite(end))
      ? "취소 마감"
      : "취소 가능";
  if (onCancel && open) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            className="h-9 gap-1.5 px-3 text-sm font-semibold tabular-nums"
            onClick={onCancel}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4 shrink-0" />
            )}
            <span>{label}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="z-[520] max-w-xs text-xs">
          디자인 확정을 취소합니다.
          <br />
          기공소가 확인하기 전까지 취소할 수 있습니다.
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <div className="flex h-9 items-center px-3 text-sm font-semibold tabular-nums text-foreground">
      {label}
    </div>
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
  readOnly = false,
  viewerRole = "practice",
  onActionComplete,
  reviewItems = [],
  reviewIndex = 0,
  onReviewIndexChange,
  filesPending = false,
}: PracticeCustomAbutmentPreviewDialogProps) {
  const { toast } = useToast();
  const designSoftware = useAccountDesignSoftware();
  const { connections } = useImplantConnectionCatalog(open ? (authToken ?? null) : null);
  const authUserId = useAuthStore((state) => {
    const user = state.user as { id?: string; _id?: string } | null;
    return String(user?.id || user?._id || "");
  });
  const isLabViewer = viewerRole === "lab";

  const normalizedToothWorks = useMemo(() => {
    const seen = new Set<string>();
    const list: ToothWorkSelection[] = [];
    for (const row of toothWorks || []) {
      const rawTooth =
        (row as { toothNumber?: unknown; tooth?: unknown })?.toothNumber ??
        (row as { tooth?: unknown })?.tooth;
      const parsed = parseFdiTooth(String(rawTooth ?? ""));
      if (!parsed || seen.has(parsed.digits)) continue;
      seen.add(parsed.digits);
      list.push({ ...row, toothNumber: parsed.digits });
    }
    return list.sort(
      (a, b) => toToothMemoSortNumber(a.toothNumber) - toToothMemoSortNumber(b.toothNumber),
    );
  }, [toothWorks]);

  const abutmentToothWorks = useMemo(() => {
    // 직접어벗(심플어벗 등 customAbutmentSelection === "abutment")은 스캔에 이미 어벗이 찍혀 크라운만 올리는 치아이므로
    // 스캔바디 인식·커스텀어벗 디자인 대상에서 빼고, 스캔바디("scanbody") 치아만 디자인한다.
    const scanbodyOnly = normalizedToothWorks.filter(
      (row) => row.customAbutment && resolveCustomAbutmentSelection(row) === "scanbody",
    );
    return scanbodyOnly.length > 0
      ? scanbodyOnly
      : normalizedToothWorks.filter((row) => row.customAbutment);
  }, [normalizedToothWorks]);

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
  const [shownPredictedCrowns, setShownPredictedCrowns] = useState<Record<string, boolean>>({});
  const [showFixtureAnalog, setShowFixtureAnalog] = useState(true);
  const [showFinishLine, setShowFinishLine] = useState(true);
  const [scanTransparency, setScanTransparency] = useState(0);
  const [visibleJaws, setVisibleJaws] = useState<{ upper: boolean; lower: boolean }>({
    upper: true,
    lower: true,
  });
  const [availableJaws, setAvailableJaws] = useState<{ upper: boolean; lower: boolean }>({
    upper: false,
    lower: false,
  });
  const [visibleTeeth, setVisibleTeeth] = useState<Record<string, boolean>>({});
  const [selectedTeeth, setSelectedTeeth] = useState<string[]>([]);
  const selectedTooth = selectedTeeth[selectedTeeth.length - 1] ?? null;
  const selectedTeethRef = useRef<string[]>([]);
  selectedTeethRef.current = selectedTeeth;
  const [hostEl, setHostEl] = useState<HTMLDivElement | null>(null);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const [redesigning, setRedesigning] = useState<string[]>([]);
  const [crownDownloadBusy, setCrownDownloadBusy] = useState(false);
  const preferenceRef = useRef<CustomAbutmentDesignPreference>(EMPTY_CUSTOM_ABUTMENT_PREFERENCE);
  const logicRulesRef = useRef<AbutmentGenerationRule[]>([]);
  const transferIdParam = String(transferId || "").trim();
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const isLabViewerRef = useRef(isLabViewer);
  isLabViewerRef.current = isLabViewer;
  const labCanReviseRef = useRef(false);
  const transferIdRef = useRef(transferIdParam);
  transferIdRef.current = transferIdParam;
  /** 디자인 배치 후 맞춤·복원이 끝난 뒤에만 카메라 뷰를 저장한다. */
  const viewReadyRef = useRef(false);
  const paint = useViewPaint({ open, resetKey: transferIdParam, initiallyOn: false });
  const paintStateRef = useRef(paint);
  paintStateRef.current = paint;
  const [paintSpace, setPaintSpace] = useState<ViewPaintSpace | null>(null);
  const paintListenersRef = useRef(new Set<() => void>());
  const pendingRemotePaintRef = useRef<CustomAbutmentPaintRecord | null>(null);
  const paintSaveTimerRef = useRef(0);
  const baselineMetricsRef = useRef<Record<string, CustomAbutmentDesignMetrics>>({});
  const gumballMetricBaseRef = useRef<Record<string, CustomAbutmentDesignMetrics>>({});
  const gumballParamBaseRef = useRef<Record<string, CustomAbutmentDesignParams>>({});
  const savedGumballEditRef = useRef<Record<string, AbutmentEdit>>({});
  const baselineParamsRef = useRef<Record<string, CustomAbutmentDesignParams>>({});
  const designRunChainRef = useRef<Promise<void>>(Promise.resolve());
  const activeRedesignCountRef = useRef(0);
  /** 치아를 처음 제안할 때 넘긴 조정값. 리셋은 여기로만 돌아간다. */
  const proposalInputRef = useRef<Record<string, Partial<CustomAbutmentDesignParams>>>({});
  const ignoreEditCommitRef = useRef(false);
  const viewerPrefsRef = useRef<CustomAbutmentViewerPrefs>({
    ...DEFAULT_CUSTOM_ABUTMENT_VIEWER_PREFS,
    expandedTeeth: {},
  });
  const viewerTouchRef = useRef(new Set<string>());
  const viewerSavedRef = useRef("");
  const [viewerHydrated, setViewerHydrated] = useState(false);
  const [expandedTeeth, setExpandedTeeth] = useState<Record<string, boolean>>({});
  const editedInfoFieldsRef = useRef<Record<string, Set<AbutmentInfoFieldKey>>>({});

  const [manualChatOpen, setManualChatOpen] = useState(!readOnly && Boolean(transferIdParam));
  const [manualChatCollapsed, setManualChatCollapsed] = useState(false);
  const [ptxRoomId, setPtxRoomId] = useState<string | null>(null);
  const [ptxRoomLoading, setPtxRoomLoading] = useState(false);
  const [sharedChatDraft, setSharedChatDraft] = useState("");
  const [sharedChatSending, setSharedChatSending] = useState(false);
  const sharedChatInputRef = useRef<HTMLInputElement | null>(null);
  const sharedChatScrollRef = useRef<HTMLDivElement | null>(null);
  const [actionBusy, setActionBusy] = useState<
    "confirm" | "manual" | "check" | "cancel" | null
  >(null);
  const [confirmPrefDialogOpen, setConfirmPrefDialogOpen] = useState(false);
  const [confirmPrefChanges, setConfirmPrefChanges] = useState<PendingInfoChange[]>([]);
  const [checkedChangeIds, setCheckedChangeIds] = useState<Set<string>>(new Set());
  const [remoteMode, setRemoteMode] = useState<"confirmed" | "manual" | null>(null);
  const [feeGuide, setFeeGuide] = useState<CustomAbutmentRouteFeeGuide | null>(null);
  const [labCheckedAt, setLabCheckedAt] = useState<string | null>(null);
  const [cancelDeadlineAt, setCancelDeadlineAt] = useState<string | null>(null);
  const [routeCostOpen, setRouteCostOpen] = useState(false);
  const [routeCostAction, setRouteCostAction] = useState<"confirm" | "manual">("confirm");
  const [routeCostHideNext, setRouteCostHideNext] = useState(false);
  const routeCostPassedRef = useRef<"confirm" | "manual" | null>(null);
  /** 서버 프리뷰 STL. 이번 세션에서 형상을 바꾸기 전에만 재업로드를 건너뛴다. */
  const labSourceStlRef = useRef<Record<string, { s3Key: string; crownS3Key: string }>>({});
  const labGeometryTouchedRef = useRef(false);
  const canEditDesign = !readOnly && (!isLabViewer || remoteMode === "confirmed");
  const canChooseAbutmentRoute = !readOnly && !isLabViewer;
  labCanReviseRef.current = canEditDesign && isLabViewer;

  const {
    messages: ptxMessages,
    loading: ptxMessagesLoading,
    sendMessage: sendPtxChatMessage,
  } = useChatMessages({
    roomId: ptxRoomId || undefined,
    autoFetch: Boolean(ptxRoomId && open),
  });

  const [pivotSet, setPivotSet] = useState(false);
  const [pivotArmed, setPivotArmed] = useState(false);
  const [gumballOn, setGumballOn] = useState(true);
  const [editRev, setEditRev] = useState(0);
  const pivotArmedRef = useRef(false);
  pivotArmedRef.current = pivotArmed;
  /** 회전 중심이 선택 어벗에서 왔는지, 면 클릭으로 수동인지. */
  const pivotSourceRef = useRef<"selection" | "manual" | null>(null);
  const scanbodyPickRef = useRef<ScanbodyPickSession | null>(null);
  const scanbodyPickClickRef = useRef<(clientX: number, clientY: number) => void>(() => {});
  const pickEpochRef = useRef(0);
  /** 위치 다시 지정·미매칭 픽에 쓰는 스캔바디 카탈로그. 파이프라인에서 채운다. */
  const scanbodyCatalogRef = useRef<ScanbodyCatalog | null>(null);
  const pivotMarkerRef = useRef<THREE.Mesh | null>(null);
  const cubeFrameRef = useRef<DentalFrame | null>(null);
  const viewCubeRef = useRef<ViewCubeHandle | null>(null);
  const viewAnimRef = useRef<{
    from: THREE.Quaternion;
    to: THREE.Quaternion;
    fromPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    pivot: THREE.Vector3;
    t0: number;
  } | null>(null);
  const badgeClickRef = useRef<(toothNumber: string, additive?: boolean) => void>(() => {});
  const directEditRef = useRef<AbutmentDirectEditSession | null>(null);
  const canSavePreferenceRef = useRef(false);
  const authUserIdRef = useRef(authUserId);
  authUserIdRef.current = authUserId;
  const editCommitTimerRef = useRef(0);
  const editBridgeRef = useRef<AbutmentEditBridge | null>(null);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const bindHostRef = useCallback((node: HTMLDivElement | null) => {
    hostRef.current = node;
    setHostEl((prev) => (prev === node ? prev : node));
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
  /** 대화 저장 범위. 의뢰 id가 있으면 스캔 키가 바뀌어도 같은 대화를 연다. */
  const chatScopeRef = useRef("");
  /** 파이프라인이 겹치면 먼저 끝난 쪽이 대화를 덮지 않게 한다. */
  const chatApplyEpochRef = useRef(0);

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
  const rawJawScansRef = useRef<
    Array<{ jaw: "upper" | "lower"; geometry: THREE.BufferGeometry; texture: THREE.Texture | null }>
  >([]);
  const abutmentMeshesRef = useRef(new Map<string, THREE.Mesh>());
  const predictedCrownMeshesRef = useRef(new Map<string, THREE.Mesh>());
  const fixtureMeshesRef = useRef(new Map<string, THREE.Mesh>());
  const marginLinesRef = useRef(new Map<string, Line2>());
  type ToothCandidateChoice = {
    candidates: CustomAbutmentDesignCandidate[];
    selectedIndex: number | null;
  };
  const candidateChoicesRef = useRef<Record<string, ToothCandidateChoice>>({});
  const ghostCandidateVisualsRef = useRef(
    new Map<string, Array<{ mesh: THREE.Mesh; line: Line2 }>>(),
  );
  const candidatePickerObjRef = useRef(new Map<string, CSS2DObject>());
  const selectCandidateRef = useRef<(toothNumber: string, index: number) => void>(() => {});
  const confirmCandidateRef = useRef<(toothNumber: string) => void>(() => {});
  if (!editBridgeRef.current) {
    editBridgeRef.current = {
      getScene: () => sceneRef.current,
      getCamera: () => cameraRef.current,
      getRenderer: () => rendererRef.current,
      getHost: () => hostRef.current,
      getDesigns: () => designedListRef.current,
      getAbutment: (tooth) => abutmentMeshesRef.current.get(tooth),
      getCrown: (tooth) => predictedCrownMeshesRef.current.get(tooth),
      getMargin: (tooth) => marginLinesRef.current.get(tooth),
      getJawGeometry: (jaw) =>
        designContextRef.current?.jawGeometry[jaw] ??
        rawJawScansRef.current.find((s) => s.jaw === jaw)?.geometry ??
        null,
      getOpposingGeometry: (jaw) => {
        const oppJaw = jaw === "upper" ? "lower" : "upper";
        return (
          designContextRef.current?.jawGeometry[oppJaw] ??
          rawJawScansRef.current.find((s) => s.jaw === oppJaw)?.geometry ??
          null
        );
      },
      ui: {
        gumballOn: true,
        sculptOn: false,
        radiusMm: 2.4,
        readOnly: false,
        selected: null,
        selectedTeeth: [],
        visible: {},
        expanded: {},
      },
      onBadge: (tooth, additive) => badgeClickRef.current(tooth, additive),
      onCommit: () => {},
      onHistory: () => {},
    };
  }

  const prepJaws = useMemo(() => {
    const set = new Set<"upper" | "lower">();
    for (const row of abutmentToothWorks) {
      const p = parseFdiTooth(row.toothNumber);
      if (p) set.add(p.jaw);
    }
    return set;
  }, [abutmentToothWorks]);

  const disposeMesh = useCallback(
    (mesh: THREE.Mesh, keepTexture = false, keepGeometry = false) => {
      sceneRef.current?.remove(mesh);
      mesh.children.slice().forEach((ch) => {
        if (ch instanceof CSS2DObject) {
          ch.element.remove();
          mesh.remove(ch);
        }
      });
      disposeBackFaceShell(mesh);
      if (!keepGeometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const savedTex = mesh.userData.previewTexture as THREE.Texture | undefined;
      if (!keepTexture) {
        if (mat.map && mat.map !== savedTex) mat.map.dispose();
        savedTex?.dispose();
      }
      mat.dispose();
    },
    [],
  );

  const rebuildJawScanMeshes = useCallback(
    (jaw: "upper" | "lower", fixtures: readonly MatchedScanbodyFixture[], visible = true) => {
      const scene = sceneRef.current;
      if (!scene) return;
      const trimKey = jaw === "upper" ? "upperTrimmed" : "lowerTrimmed";
      const sbKey = jaw === "upper" ? "upperScanbody" : "lowerScanbody";
      for (const m of jawMeshesRef.current[trimKey]) disposeMesh(m, true);
      for (const m of jawMeshesRef.current[sbKey]) disposeMesh(m, true);
      jawMeshesRef.current[trimKey] = [];
      jawMeshesRef.current[sbKey] = [];

      const makeMesh = (geo: THREE.BufferGeometry, tex: THREE.Texture | null, shareTex: boolean) => {
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

      const jawFixtures = fixtures.filter((f) => f.jaw === jaw);
      for (const scan of rawJawScansRef.current) {
        if (scan.jaw !== jaw) continue;
        if (!scan.geometry.getAttribute("normal")) scan.geometry.computeVertexNormals();
        const split = splitScanByScanbodies(scan.geometry, jawFixtures);
        const restMesh = makeMesh(split.rest, scan.texture, false);
        restMesh.userData.sourceGeometry = scan.geometry;
        restMesh.visible = visible;
        jawMeshesRef.current[trimKey].push(restMesh);
        for (const [tooth, geo] of split.scanbodies) {
          const sbMesh = makeMesh(geo, scan.texture, true);
          sbMesh.userData.sourceGeometry = scan.geometry;
          sbMesh.userData.scanbodyTooth = tooth;
          sbMesh.visible = false;
          jawMeshesRef.current[sbKey].push(sbMesh);
        }
      }
    },
    [disposeMesh],
  );

  const clearGhostCandidateVisuals = useCallback((toothNumber: string) => {
    const ghosts = ghostCandidateVisualsRef.current.get(toothNumber);
    if (ghosts) {
      for (const g of ghosts) {
        sceneRef.current?.remove(g.mesh);
        disposeBackFaceShell(g.mesh);
        (g.mesh.material as THREE.Material).dispose();
        sceneRef.current?.remove(g.line);
        g.line.geometry.dispose();
        g.line.material.dispose();
      }
      ghostCandidateVisualsRef.current.delete(toothNumber);
    }
    const picker = candidatePickerObjRef.current.get(toothNumber);
    if (picker) {
      picker.element.remove();
      picker.parent?.remove(picker);
      candidatePickerObjRef.current.delete(toothNumber);
    }
  }, []);

  const disposeOtherCandidateGeometries = useCallback(
    (choice: ToothCandidateChoice | undefined, keepDesign: DesignedCustomAbutment | null) => {
      if (!choice) return;
      for (const cand of choice.candidates) {
        if (cand.design === keepDesign) continue;
        if (cand.design.worldGeometry !== keepDesign?.worldGeometry) {
          cand.design.worldGeometry.dispose();
        }
        if (cand.design.predictedCrownWorldGeometry !== keepDesign?.predictedCrownWorldGeometry) {
          cand.design.predictedCrownWorldGeometry.dispose();
        }
        if (cand.design.enameloplastyWorldGeometry !== keepDesign?.enameloplastyWorldGeometry) {
          cand.design.enameloplastyWorldGeometry?.dispose();
        }
      }
    },
    [],
  );

  const removeDesignFromScene = useCallback(
    (toothNumber: string, keepGeometry = false) => {
      clearGhostCandidateVisuals(toothNumber);
      const abutMesh = abutmentMeshesRef.current.get(toothNumber);
      if (abutMesh) disposeMesh(abutMesh, false, keepGeometry);
      abutmentMeshesRef.current.delete(toothNumber);
      const crownMesh = predictedCrownMeshesRef.current.get(toothNumber);
      if (crownMesh) disposeMesh(crownMesh, false, keepGeometry);
      predictedCrownMeshesRef.current.delete(toothNumber);
      const fixMesh = fixtureMeshesRef.current.get(toothNumber);
      if (fixMesh) disposeMesh(fixMesh, false, false);
      fixtureMeshesRef.current.delete(toothNumber);
      const line = marginLinesRef.current.get(toothNumber);
      if (line) {
        sceneRef.current?.remove(line);
        line.geometry.dispose();
        line.material.dispose();
      }
      marginLinesRef.current.delete(toothNumber);
    },
    [clearGhostCandidateVisuals, disposeMesh],
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
      badgeClickRef.current(d.toothNumber, e.shiftKey);
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

  /** 조건 충돌 후보가 있을 때 씬의 흐릿한 비교 후보·진한 선택 후보와 검볼 옆 (1)(2)(3)·✓ 뱃지를 동기화한다. */
  const syncCandidateSceneForTooth = useCallback(
    (toothNumber: string) => {
      const scene = sceneRef.current;
      const abutMesh = abutmentMeshesRef.current.get(toothNumber);
      const mainLine = marginLinesRef.current.get(toothNumber);
      if (!scene || !abutMesh) return;

      clearGhostCandidateVisuals(toothNumber);
      const choice = candidateChoicesRef.current[toothNumber];
      const abutMat = abutMesh.material as THREE.MeshStandardMaterial;

      if (!choice || choice.candidates.length < 2 || !canEditDesign) {
        abutMat.transparent = false;
        abutMat.opacity = 1;
        abutMat.depthWrite = true;
        abutMesh.renderOrder = 2;
        abutMat.needsUpdate = true;
        syncBackFaceShell(abutMesh);
        if (mainLine) {
          const lm = mainLine.material as LineMaterial;
          lm.opacity = 1;
          lm.needsUpdate = true;
        }
        return;
      }

      const activeIdx = choice.selectedIndex ?? 0;
      const isPicked = choice.selectedIndex !== null;

      // 미선택 초기에는 모든 후보를 흐릿하게 그려 비교하고, 번호를 선택하면 선택된 것만 진하게 그린다.
      abutMat.transparent = !isPicked;
      abutMat.opacity = isPicked ? 1 : 0.44;
      abutMat.depthWrite = isPicked;
      abutMesh.renderOrder = isPicked ? 2 : 3;
      abutMat.needsUpdate = true;
      syncBackFaceShell(abutMesh);
      if (mainLine) {
        const lm = mainLine.material as LineMaterial;
        lm.opacity = isPicked ? 1 : 0.56;
        lm.needsUpdate = true;
      }

      const host = hostRef.current;
      const hostSize = host ? readHostSize(host) : null;
      const isToothShown = visibleTeeth[toothNumber] !== false;
      const ghosts: Array<{ mesh: THREE.Mesh; line: Line2 }> = [];
      for (let i = 0; i < choice.candidates.length; i += 1) {
        if (i === activeIdx) continue;
        const cand = choice.candidates[i]!.design;
        const gMat = new THREE.MeshStandardMaterial({
          color: 0xcab88c,
          metalness: 0.38,
          roughness: 0.38,
          transparent: true,
          opacity: isPicked ? 0.24 : 0.36,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const gMesh = new THREE.Mesh(cand.worldGeometry, gMat);
        gMesh.renderOrder = 3;
        gMesh.visible = isToothShown;
        gMesh.raycast = () => {};
        scene.add(gMesh);

        const gLoop = Array.from(cand.marginLoopWorld);
        gLoop.push(gLoop[0]!, gLoop[1]!, gLoop[2]!);
        const gLineGeo = new LineGeometry();
        gLineGeo.setPositions(gLoop);
        const gLineMat = new LineMaterial({
          color: MARGIN_LINE_COLOR,
          linewidth: Math.max(1.2, MARGIN_LINE_PX * 0.85),
          depthTest: false,
          transparent: true,
          opacity: isPicked ? 0.3 : 0.45,
        });
        if (hostSize) {
          gLineMat.resolution.set(hostSize.width, hostSize.height);
        }
        const gLine = new Line2(gLineGeo, gLineMat);
        gLine.computeLineDistances();
        gLine.renderOrder = 4;
        gLine.visible = showFinishLine && isToothShown;
        gLine.raycast = () => {};
        scene.add(gLine);
        ghosts.push({ mesh: gMesh, line: gLine });
      }
      ghostCandidateVisualsRef.current.set(toothNumber, ghosts);

      // 검볼 옆 (1) (2) (3) 선택 뱃지 + 선택 시 컨펌(✓) 뱃지
      const pickerRoot = document.createElement("div");
      pickerRoot.dataset.candidatePicker = "true";
      pickerRoot.style.cssText = "pointer-events:none;user-select:none;";

      const bar = document.createElement("div");
      bar.style.cssText =
        "pointer-events:auto;display:inline-flex;align-items:center;gap:0.25rem;" +
        "transform:translate(2.15rem, 1.45rem);padding:0.18rem 0.24rem;border-radius:9999px;" +
        "background:rgba(15,23,42,0.82);backdrop-filter:blur(4px);box-shadow:0 2px 8px rgba(0,0,0,0.28);";
      const stopEvt = (e: Event) => {
        e.stopPropagation();
      };
      bar.addEventListener("pointerdown", stopEvt);
      bar.addEventListener("pointerup", stopEvt);
      bar.addEventListener("wheel", stopEvt, { passive: true });

      choice.candidates.forEach((cand, idx) => {
        const selected = choice.selectedIndex === idx;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = `(${idx + 1})`;
        btn.title = `(${idx + 1}) ${cand.label} · Ø${cand.design.metrics.maxDiameterMm}mm`;
        btn.style.cssText =
          "cursor:pointer;border:0;border-radius:9999px;padding:0.14rem 0.42rem;" +
          "font:600 0.6875rem/1.2 ui-sans-serif,system-ui,sans-serif;white-space:nowrap;transition:background 120ms;" +
          (selected
            ? "background:#2563eb;color:#ffffff;box-shadow:0 0 0 1.5px #93c5fd;"
            : "background:rgba(255,255,255,0.12);color:#e2e8f0;");
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          selectCandidateRef.current(toothNumber, idx);
        });
        bar.appendChild(btn);
      });

      if (isPicked) {
        const confirmBtn = document.createElement("button");
        confirmBtn.type = "button";
        confirmBtn.textContent = "✓";
        confirmBtn.title = `(${(choice.selectedIndex ?? 0) + 1})번 디자인으로 확정`;
        confirmBtn.setAttribute("aria-label", `${toothNumber} 선택한 디자인으로 확정`);
        confirmBtn.style.cssText =
          "cursor:pointer;border:0;border-radius:9999px;width:1.35rem;height:1.35rem;" +
          "display:inline-flex;align-items:center;justify-content:center;" +
          "background:#16a34a;color:#ffffff;font:700 0.75rem/1 ui-sans-serif,system-ui,sans-serif;" +
          "box-shadow:0 0 0 1.5px #86efac;";
        confirmBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          confirmCandidateRef.current(toothNumber);
        });
        bar.appendChild(confirmBtn);
      }

      pickerRoot.appendChild(bar);
      const pickerObj = new CSS2DObject(pickerRoot);
      if (!abutMesh.geometry.boundingBox) abutMesh.geometry.computeBoundingBox();
      const center = abutMesh.geometry.boundingBox
        ? abutMesh.geometry.boundingBox.getCenter(new THREE.Vector3())
        : new THREE.Vector3();
      pickerObj.position.copy(center);
      pickerObj.visible = isToothShown;
      abutMesh.add(pickerObj);
      candidatePickerObjRef.current.set(toothNumber, pickerObj);
    },
    [canEditDesign, clearGhostCandidateVisuals, showFinishLine, visibleTeeth],
  );

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
    for (const raw of rawJawScansRef.current) {
      raw.geometry.dispose();
    }
    rawJawScansRef.current = [];
    for (const tooth of Object.keys(candidateChoicesRef.current)) {
      const choice = candidateChoicesRef.current[tooth];
      const active = designedListRef.current.find((d) => d.toothNumber === tooth) ?? null;
      disposeOtherCandidateGeometries(choice, active);
    }
    candidateChoicesRef.current = {};
    for (const tooth of [...abutmentMeshesRef.current.keys()]) removeDesignFromScene(tooth);
  }, [disposeMesh, disposeOtherCandidateGeometries, removeDesignFromScene]);

  const clearPivot = useCallback(() => {
    if (controlsRef.current) controlsRef.current.pivot = null;
    if (pivotMarkerRef.current) pivotMarkerRef.current.visible = false;
    pivotSourceRef.current = null;
    setPivotSet(false);
    setPivotArmed(false);
  }, []);

  /** 선택 어벗(들)의 바운딩 박스 중심을 회전 중심으로. 화면은 옮기지 않는다. */
  const applySelectionPivot = useCallback(
    (teeth: readonly string[]) => {
      if (teeth.length === 0) {
        clearPivot();
        return;
      }
      const box = new THREE.Box3();
      let any = false;
      for (const tooth of teeth) {
        const mesh = abutmentMeshesRef.current.get(tooth);
        if (!mesh) continue;
        mesh.updateMatrixWorld(true);
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        const bb = mesh.geometry.boundingBox;
        if (!bb || bb.isEmpty()) continue;
        box.union(bb.clone().applyMatrix4(mesh.matrixWorld));
        any = true;
      }
      if (!any) {
        clearPivot();
        return;
      }
      const controls = controlsRef.current;
      if (!controls) return;
      const center = box.getCenter(new THREE.Vector3());
      controls.pivot = center.clone();
      const marker = pivotMarkerRef.current;
      if (marker) {
        marker.position.copy(center);
        marker.visible = true;
      }
      pivotSourceRef.current = "selection";
      setPivotSet(true);
      setPivotArmed(false);
    },
    [clearPivot],
  );

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
    pivotSourceRef.current = "manual";
    setPivotSet(true);
    setPivotArmed(false);
    return true;
  }, []);

  useEffect(() => {
    const el = rendererRef.current?.domElement;
    if (!el) return;
    const picking = status.kind === "pick";
    const waiting = picking && (status.phase === "searching" || status.phase === "designing");
    el.style.cursor = waiting ? "progress" : picking || pivotArmed ? "crosshair" : "";
  }, [pivotArmed, status]);

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
      const restoreSelectionPivot = () => {
        if (selectedTeethRef.current.length > 0) {
          applySelectionPivot(selectedTeethRef.current);
        }
      };
      if (box.isEmpty()) {
        restoreSelectionPivot();
        return;
      }

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
      if (count === 0) {
        restoreSelectionPivot();
        return;
      }

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
      restoreSelectionPivot();
    },
    [applySelectionPivot, clearPivot],
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
    const view = toothViewCube(
      designed.toothNumber,
      designed.fixture,
      frame,
      designedList.map((row) => ({
        toothNumber: row.toothNumber,
        origin: row.fixture.fixturePose.origin,
      })),
    );
    return view ? { ...view, toothNumber: designed.toothNumber } : null;
  }, [designedList, selectedTooth]);
  cubeFrameRef.current = cubeView?.frame ?? null;
  const cubeFaceLabels = cubeView?.labels ?? null;

  const selectAbutments = (toothNumber: string, additive = false) => {
    const nextTeeth = nextAbutmentSelection(selectedTeethRef.current, toothNumber, additive);
    selectedTeethRef.current = nextTeeth;
    setSelectedTeeth(nextTeeth);
    applySelectionPivot(nextTeeth);
    const primary = nextTeeth[nextTeeth.length - 1] ?? null;
    viewerTouchRef.current.add("expanded");
    const next: Record<string, boolean> = {};
    for (const row of designedListRef.current) {
      next[row.toothNumber] = primary != null && row.toothNumber === primary;
    }
    viewerPrefsRef.current = {
      ...viewerPrefsRef.current,
      infoExpanded:
        designedListRef.current.length > 0 &&
        designedListRef.current.every((row) => next[row.toothNumber] !== false),
      expandedTeeth: { ...viewerPrefsRef.current.expandedTeeth, ...next },
    };
    setExpandedTeeth(next);
  };

  badgeClickRef.current = selectAbutments;

  /** 선택 피봇일 때 형상·선택이 바뀌면 중심을 다시 맞춘다. */
  useEffect(() => {
    if (pivotSourceRef.current !== "selection") return;
    if (selectedTeeth.length === 0) {
      clearPivot();
      return;
    }
    applySelectionPivot(selectedTeeth);
  }, [applySelectionPivot, clearPivot, designedList, editRev, selectedTeeth]);

  /** 대화를 의뢰 키로 남긴다. 빈 목록은 쓰지 않아 재계산이 대화를 지우지 않는다. */
  const persistChat = useCallback((chat?: readonly ChatTurn[]) => {
    if (readOnlyRef.current || isLabViewerRef.current) return;
    const scope = chatScopeRef.current;
    const turns = normalizeCustomAbutmentChat(
      (chat ?? chatTurnsRef.current).filter((t) => !t.pending),
    );
    if (!scope || turns.length === 0) return;
    void writeCustomAbutmentChat(scope, turns).catch((err) =>
      console.warn("[custom-abutment] chat cache write failed", err),
    );
  }, []);

  /** 지금 디자인·조정값·대화를 저장한다. 실패해도 화면은 그대로 둔다. */
  const persistDesign = useCallback((chat?: readonly ChatTurn[]) => {
    if (readOnlyRef.current || (isLabViewerRef.current && !labCanReviseRef.current)) return;
    const turns = normalizeCustomAbutmentChat(
      (chat ?? chatTurnsRef.current).filter((t) => !t.pending),
    );
    if (turns.length > 0) persistChat(turns);
    const ctx = designContextRef.current;
    if (!ctx) return;
    const list = designedListRef.current;
    const scope = chatScopeRef.current;
    void (async () => {
      const savedChat =
        turns.length > 0 ? turns : scope ? await readCustomAbutmentChat(scope) : [];
      await writeCustomAbutmentDesign({
        key: ctx.cacheKey,
        version: CUSTOM_ABUTMENT_DESIGN_VERSION,
        fitVersion: CUSTOM_ABUTMENT_FIT_VERSION,
        savedAt: Date.now(),
        alignedScans: ctx.alignedScans,
        teeth: list.map((d) => {
          const gumballEdit =
            directEditRef.current?.editOf(d.toothNumber) ??
            savedGumballEditRef.current[d.toothNumber] ??
            null;
          const gumballBaseParams = gumballParamBaseRef.current[d.toothNumber];
          const gumballBaseMetrics = gumballMetricBaseRef.current[d.toothNumber];
          return {
            toothNumber: d.toothNumber,
            fileName: d.fileName,
            fixture: d.fixture,
            overrides: ctx.overrides[d.toothNumber] ?? {},
            params: d.params,
            metrics: d.metrics,
            baselineMetrics: baselineMetricsRef.current[d.toothNumber] ?? d.metrics,
            baselineParams: baselineParamsRef.current[d.toothNumber] ?? d.params,
            ...(gumballEdit ? { gumballEdit } : {}),
            ...(gumballEdit && gumballBaseParams ? { gumballBaseParams } : {}),
            ...(gumballEdit && gumballBaseMetrics ? { gumballBaseMetrics } : {}),
            proposalInput: proposalInputRef.current[d.toothNumber] ?? {},
            editedInfoFields: [...(editedInfoFieldsRef.current[d.toothNumber] ?? [])],
            localPositions: toArrayBuffer(d.localPositions),
            ...(d.solidBodyLocalPositions?.length
              ? { solidBodyLocalPositions: toArrayBuffer(d.solidBodyLocalPositions) }
              : {}),
            crownLocalPositions: toArrayBuffer(d.crownLocalPositions),
            marginLoopLocal: toArrayBuffer(d.marginLoopLocal),
            ...(d.enameloplastyLocalPositions?.length
              ? { enameloplastyLocalPositions: toArrayBuffer(d.enameloplastyLocalPositions) }
              : {}),
          };
        }),
        chat: savedChat,
      });
      const transferId = transferIdRef.current;
      if (transferId && list.length > 0) {
        publishCustomAbutmentSnapshot(String(authToken || ""), transferId, {
          version: CUSTOM_ABUTMENT_DESIGN_VERSION,
          fitVersion: CUSTOM_ABUTMENT_FIT_VERSION,
          teeth: list.map((d) => {
            const gumballEdit =
              directEditRef.current?.editOf(d.toothNumber) ??
              savedGumballEditRef.current[d.toothNumber] ??
              null;
            const gumballBaseParams = gumballParamBaseRef.current[d.toothNumber];
            const gumballBaseMetrics = gumballMetricBaseRef.current[d.toothNumber];
            return {
              toothNumber: d.toothNumber,
              fileName: d.fileName,
              fixture: d.fixture,
              overrides: ctx.overrides[d.toothNumber] ?? {},
              params: d.params,
              metrics: d.metrics,
              ...(gumballEdit ? { gumballEdit } : {}),
              ...(gumballEdit && gumballBaseParams ? { gumballBaseParams } : {}),
              ...(gumballEdit && gumballBaseMetrics ? { gumballBaseMetrics } : {}),
              stlBlob: d.stlBlob,
              crownLocalPositions: d.crownLocalPositions,
              marginLoopLocal: d.marginLoopLocal,
              ...(d.enameloplastyLocalPositions?.length
                ? { enameloplastyLocalPositions: d.enameloplastyLocalPositions }
                : {}),
            };
          }),
          chat: savedChat,
        });
      }
    })().catch((err) => console.warn("[custom-abutment] design cache write failed", err));
  }, [authToken, persistChat]);

  const applyGumballMetrics = useCallback((summary: AbutmentEditSummary) => {
    const design = designedListRef.current.find((row) => row.toothNumber === summary.tooth);
    if (!design) return;
    if (savedGumballEditRef.current[summary.tooth]) {
      // 이미 구워진 저장 메시에 사용자가 새로 검볼 드래그를 시작한 경우 지금 메시를 새 기준으로 삼는다.
      delete savedGumballEditRef.current[summary.tooth];
      gumballMetricBaseRef.current[summary.tooth] = design.metrics;
      gumballParamBaseRef.current[summary.tooth] = { ...design.params };
    }
    if (!gumballMetricBaseRef.current[summary.tooth]) {
      gumballMetricBaseRef.current[summary.tooth] = design.metrics;
    }
    const base = gumballMetricBaseRef.current[summary.tooth]!;
    const taperLinked = (design.params.postTaperLink ?? 1) >= 0.5;
    const nextMetrics = metricsFromGumball(base, summary, taperLinked);
    if (sameAbutmentMetrics(design.metrics, nextMetrics)) return;
    design.metrics = nextMetrics;
    const list = designedListRef.current.map((row) => (row.toothNumber === summary.tooth ? design : row));
    designedListRef.current = list;
    setDesignedList(list);
  }, []);
  const stripDirectEditShiftOverrides = (
    raw: Partial<CustomAbutmentDesignParams>,
  ): Partial<CustomAbutmentDesignParams> => {
    const next = { ...raw };
    delete next.axisShiftLabialMm;
    delete next.axisShiftMesialMm;
    delete next.postYawDeg;
    return next;
  };
  const rememberAbutmentEdit = useCallback(
    (summary: AbutmentEditSummary) => {
      const design = designedListRef.current.find((row) => row.toothNumber === summary.tooth);
      const ctx = designContextRef.current;
      if (!design || !ctx) return;
      const clampKey = (key: keyof CustomAbutmentDesignParams, value: number) => {
        const row = CUSTOM_ABUTMENT_PARAM_SPECS[key];
        return Math.min(row.max, Math.max(row.min, value));
      };
      if (!gumballParamBaseRef.current[summary.tooth]) {
        gumballParamBaseRef.current[summary.tooth] = { ...design.params };
      }
      const base = gumballParamBaseRef.current[summary.tooth]!;
      const taperLinked = (design.params.postTaperLink ?? 1) >= 0.5;
      const next: Partial<CustomAbutmentDesignParams> = {};
      if (Math.abs(summary.widthRatio - 1) >= 0.005) {
        next.postWidthScale = clampKey("postWidthScale", base.postWidthScale * summary.widthRatio);
      }
      if (Math.abs(summary.heightDeltaMm) >= 0.02) {
        next.postHeightOffsetMm = clampKey("postHeightOffsetMm", base.postHeightOffsetMm + summary.heightDeltaMm);
        if (taperLinked) {
          next.postTaperDeg = computeOptimalPostTaperDeg(
            design.metrics.postHeightMm,
            {
              isBridge: Boolean(design.metrics.isBridge),
              retainerCount: design.metrics.bridgeRetainerCount,
            },
            postRetentionSurface(design.metrics.postWallRadiusMm),
          );
        }
      }
      design.params = { ...design.params, ...next };
      ctx.overrides[summary.tooth] = {
        ...stripDirectEditShiftOverrides(ctx.overrides[summary.tooth] ?? {}),
        ...next,
      };
      // 이번 케이스 형상만 남긴다. 계정 기본값은 확정·의뢰에서 고른 항목만 저장한다.
    },
    [],
  );

  const confirmCandidateForTooth = useCallback(
    (toothNumber: string, shouldPersist = true) => {
      const choice = candidateChoicesRef.current[toothNumber];
      if (!choice) return;
      const idx = choice.selectedIndex ?? 0;
      const chosen = choice.candidates[idx]?.design;
      delete candidateChoicesRef.current[toothNumber];
      clearGhostCandidateVisuals(toothNumber);
      if (chosen) {
        const curActive = designedListRef.current.find((d) => d.toothNumber === toothNumber);
        if (curActive && curActive !== chosen) {
          labGeometryTouchedRef.current = true;
          removeDesignFromScene(toothNumber, true);
          addDesignToScene(chosen);
          const list = designedListRef.current.map((d) =>
            d.toothNumber === toothNumber ? chosen : d,
          );
          designedListRef.current = list;
          setDesignedList(list);
        }
        disposeOtherCandidateGeometries(choice, chosen);
        baselineMetricsRef.current[toothNumber] = { ...chosen.metrics };
        baselineParamsRef.current[toothNumber] = { ...chosen.params };
      }
      syncCandidateSceneForTooth(toothNumber);
      directEditRef.current?.sync();
      directEditRef.current?.tick();
      if (shouldPersist) persistDesign();
    },
    [
      addDesignToScene,
      clearGhostCandidateVisuals,
      disposeOtherCandidateGeometries,
      persistDesign,
      removeDesignFromScene,
      syncCandidateSceneForTooth,
    ],
  );

  const selectCandidateForTooth = useCallback(
    (toothNumber: string, index: number) => {
      const choice = candidateChoicesRef.current[toothNumber];
      if (!choice || index < 0 || index >= choice.candidates.length) return;
      const nextDesign = choice.candidates[index]!.design;
      const curActive = designedListRef.current.find((d) => d.toothNumber === toothNumber);
      choice.selectedIndex = index;
      directEditRef.current?.clear([toothNumber]);
      delete gumballMetricBaseRef.current[toothNumber];
      delete gumballParamBaseRef.current[toothNumber];
      delete savedGumballEditRef.current[toothNumber];
      if (curActive !== nextDesign) {
        removeDesignFromScene(toothNumber, true);
        addDesignToScene(nextDesign);
        const list = designedListRef.current.map((d) =>
          d.toothNumber === toothNumber ? nextDesign : d,
        );
        designedListRef.current = list;
        setDesignedList(list);
      }
      selectedTeethRef.current = [toothNumber];
      setSelectedTeeth([toothNumber]);
      applySelectionPivot([toothNumber]);
      setExpandedTeeth((prev) => (prev[toothNumber] ? prev : { ...prev, [toothNumber]: true }));
      syncCandidateSceneForTooth(toothNumber);
      directEditRef.current?.sync();
      directEditRef.current?.tick();
    },
    [addDesignToScene, applySelectionPivot, removeDesignFromScene, syncCandidateSceneForTooth],
  );

  selectCandidateRef.current = selectCandidateForTooth;
  confirmCandidateRef.current = (toothNumber: string) => confirmCandidateForTooth(toothNumber, true);

  const bridge = editBridgeRef.current;
  if (bridge) {
    bridge.ui.gumballOn = gumballOn && !paint.paintOn && canEditDesign;
    bridge.ui.sculptOn = false;
    bridge.ui.readOnly = !canEditDesign;
    bridge.ui.selected = selectedTooth;
    bridge.ui.selectedTeeth = selectedTeeth;
    bridge.ui.visible = visibleTeeth;
    bridge.ui.expanded = expandedTeeth;
    bridge.onHistory = () => setEditRev((rev) => rev + 1);
    bridge.onShape = (summary) => {
      if (
        readOnlyRef.current ||
        (isLabViewerRef.current && !labCanReviseRef.current) ||
        ignoreEditCommitRef.current
      ) {
        return;
      }
      if (!summary.neutral && candidateChoicesRef.current[summary.tooth]) {
        confirmCandidateForTooth(summary.tooth, false);
      }
      applyGumballMetrics(summary);
    };
    bridge.onCommit = (summary) => {
      if (
        readOnlyRef.current ||
        (isLabViewerRef.current && !labCanReviseRef.current) ||
        ignoreEditCommitRef.current
      ) {
        return;
      }
      if (!summary.neutral && candidateChoicesRef.current[summary.tooth]) {
        confirmCandidateForTooth(summary.tooth, false);
      }
      if (!summary.neutral) labGeometryTouchedRef.current = true;
      applyGumballMetrics(summary);
      rememberAbutmentEdit(summary);
      window.clearTimeout(editCommitTimerRef.current);
      editCommitTimerRef.current = window.setTimeout(() => persistDesign(), 400);
    };
  }

  const jawsForJobs = useCallback((jobs: readonly { jaw: "upper" | "lower" }[]) => {
    const has = {
      upper:
        jawMeshesRef.current.upperTrimmed.length + jawMeshesRef.current.upperScanbody.length > 0,
      lower:
        jawMeshesRef.current.lowerTrimmed.length + jawMeshesRef.current.lowerScanbody.length > 0,
    };
    if (jobs.length === 0) return has;
    const need = new Set(jobs.map((job) => job.jaw));
    return {
      upper: has.upper && need.has("upper"),
      lower: has.lower && need.has("lower"),
    };
  }, []);

  /** 스캔바디를 못 찾았거나 위치를 다시 지정할 때: 찍은 점 주변만 정합하고 디자인을 붙인다. */
  const handleScanbodyPickAt = useCallback(
    async (clientX: number, clientY: number) => {
      const session = scanbodyPickRef.current;
      if (!session || session.busy || session.jobs.length === 0) return;
      const job = session.jobs[0]!;
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      if (!camera || !renderer) return;
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const jawMeshes =
        job.jaw === "upper"
          ? [...jawMeshesRef.current.upperTrimmed, ...jawMeshesRef.current.upperScanbody]
          : [...jawMeshesRef.current.lowerTrimmed, ...jawMeshesRef.current.lowerScanbody];
      // 잘못 붙은 어벗·픽스처 위를 찍어도 그 스캔바디 자리로 인식한다.
      const designMeshes: THREE.Object3D[] = [];
      for (const [tooth, mesh] of abutmentMeshesRef.current.entries()) {
        const fx = designContextRef.current?.fixtures.find((row) => row.toothNumber === tooth);
        if (fx?.jaw === job.jaw && mesh.visible) designMeshes.push(mesh);
      }
      for (const [tooth, mesh] of fixtureMeshesRef.current.entries()) {
        const fx = designContextRef.current?.fixtures.find((row) => row.toothNumber === tooth);
        if (fx?.jaw === job.jaw && mesh.visible) designMeshes.push(mesh);
      }
      const hit = ray.intersectObjects(
        [...designMeshes, ...jawMeshes.filter((mesh) => mesh.visible)],
        false,
      )[0];
      if (!hit) {
        setStatus({ kind: "pick", toothNumber: job.toothNumber, phase: "empty" });
        return;
      }

      const epoch = pickEpochRef.current;
      session.busy = true;
      setStatus({ kind: "pick", toothNumber: job.toothNumber, phase: "searching" });
      const built = new Map<string, DesignedCustomAbutment>();
      let committed = false;
      try {
        await new Promise<void>((r) => window.setTimeout(r, 16));
        if (pickEpochRef.current !== epoch) return;
        const ctx = designContextRef.current;
        const frame = frameRef.current;
        const hitGeo =
          (hit.object.userData?.sourceGeometry as THREE.BufferGeometry | undefined) ?? null;
        const candidateGeos: THREE.BufferGeometry[] = [];
        for (const g of [
          hitGeo,
          ctx?.jawGeometry[job.jaw] ?? null,
          ...rawJawScansRef.current.filter((s) => s.jaw === job.jaw).map((s) => s.geometry),
        ]) {
          if (g && !candidateGeos.includes(g)) candidateGeos.push(g);
        }
        if (!ctx || !frame || candidateGeos.length === 0) {
          setStatus({ kind: "pick", toothNumber: job.toothNumber, phase: "miss" });
          return;
        }
        const hitPoint: [number, number, number] = [hit.point.x, hit.point.y, hit.point.z];
        const toothOwningMesh = (obj: THREE.Object3D): string | null => {
          let cur: THREE.Object3D | null = obj;
          while (cur) {
            for (const [tooth, mesh] of abutmentMeshesRef.current.entries()) {
              if (mesh === cur) return tooth;
            }
            for (const [tooth, mesh] of fixtureMeshesRef.current.entries()) {
              if (mesh === cur) return tooth;
            }
            cur = cur.parent;
          }
          return null;
        };
        const hitDesignTooth = toothOwningMesh(hit.object);
        const stealRadius = SCANBODY_STEAL_RADIUS_MM;
        const displacedNear = ctx.fixtures.find((row) => {
          if (row.jaw !== job.jaw || row.toothNumber === job.toothNumber) return false;
          const dx = row.scanbodyTop[0] - hitPoint[0];
          const dy = row.scanbodyTop[1] - hitPoint[1];
          const dz = row.scanbodyTop[2] - hitPoint[2];
          return dx * dx + dy * dy + dz * dz <= stealRadius * stealRadius;
        });
        const displacedTooth =
          (hitDesignTooth && hitDesignTooth !== job.toothNumber ? hitDesignTooth : null) ??
          displacedNear?.toothNumber ??
          null;
        const displacedFixture = displacedTooth
          ? ctx.fixtures.find((row) => row.toothNumber === displacedTooth) ?? null
          : null;
        const matchPoint: [number, number, number] = displacedFixture
          ? [
              displacedFixture.scanbodyTop[0],
              displacedFixture.scanbodyTop[1],
              displacedFixture.scanbodyTop[2],
            ]
          : hitPoint;
        const excludeTops = ctx.fixtures
          .filter(
            (row) =>
              row.jaw === job.jaw &&
              row.toothNumber !== job.toothNumber &&
              row.toothNumber !== displacedTooth,
          )
          .map((row) => row.scanbodyTop);
        let fixture: MatchedScanbodyFixture | null = null;
        let matchedGeo: THREE.BufferGeometry = candidateGeos[0]!;
        let bestRank = Infinity;
        for (const candGeo of candidateGeos) {
          const candFixture = matchScanbodyNearPoint({
            jawGeometry: candGeo,
            frame,
            toothWork: job.toothWork,
            models: job.models,
            connections: session.connections,
            point: matchPoint,
            excludeTops,
          });
          if (!candFixture) continue;
          const rank = candFixture.rmsMm + (1 - candFixture.topCoverage) * 0.5;
          if (!fixture || rank < bestRank) {
            fixture = candFixture;
            matchedGeo = candGeo;
            bestRank = rank;
          }
        }
        if (pickEpochRef.current !== epoch) return;
        if (!fixture) {
          setStatus({ kind: "pick", toothNumber: job.toothNumber, phase: "miss" });
          return;
        }
        const jawGeo = ctx.jawGeometry[job.jaw] ?? matchedGeo;
        ctx.jawGeometry[job.jaw] = matchedGeo;

        setStatus({ kind: "pick", toothNumber: job.toothNumber, phase: "designing" });
        await new Promise<void>((r) => window.setTimeout(r, 16));
        if (pickEpochRef.current !== epoch) return;

        const jawFixtures = [
          ...ctx.fixtures.filter(
            (row) =>
              row.jaw === job.jaw &&
              row.toothNumber !== fixture.toothNumber &&
              row.toothNumber !== displacedTooth,
          ),
          fixture,
        ];
        const preference = preferenceRef.current;
        const builtCands = new Map<string, CustomAbutmentDesignCandidate[]>();
        const discardBuilt = () => {
          for (const list of builtCands.values()) {
            for (const c of list) {
              c.design.worldGeometry.dispose();
              c.design.predictedCrownWorldGeometry.dispose();
              c.design.enameloplastyWorldGeometry?.dispose();
            }
          }
        };
        for (const fx of jawFixtures) {
          if (!proposalInputRef.current[fx.toothNumber]) {
            proposalInputRef.current[fx.toothNumber] = {
              ...preferenceOverridesForTooth(fx.toothNumber, preference),
            };
          }
          const fxOverrides = ctx.overrides[fx.toothNumber] ?? {};
          const cands = await designCustomAbutmentCandidates({
            fixture: fx,
            jawGeometry: matchedGeo || jawGeo,
            opposingGeometry: ctx.jawGeometry[job.jaw === "upper" ? "lower" : "upper"],
            neighbors: jawFixtures,
            toothWorks: ctx.allToothWorks,
            params: {
              ...preferenceOverridesForTooth(fx.toothNumber, preference),
              ...fxOverrides,
            },
            explicitParams: fxOverrides,
            logicRules: logicRulesRef.current,
            patientName: ctx.patientName,
          });
          if (pickEpochRef.current !== epoch) {
            for (const c of cands) {
              c.design.worldGeometry.dispose();
              c.design.predictedCrownWorldGeometry.dispose();
              c.design.enameloplastyWorldGeometry?.dispose();
            }
            discardBuilt();
            return;
          }
          builtCands.set(fx.toothNumber, cands);
          built.set(fx.toothNumber, cands[0]!.design);
        }

        ctx.fixtures = [...ctx.fixtures.filter((row) => row.jaw !== job.jaw), ...jawFixtures];
        rebuildJawScanMeshes(job.jaw, jawFixtures, true);
        const prevList = designedListRef.current;
        const dropTeeth = new Set<string>([...built.keys()]);
        if (displacedTooth) dropTeeth.add(displacedTooth);
        for (const tooth of dropTeeth) {
          if (candidateChoicesRef.current[tooth]) {
            const oldChoice = candidateChoicesRef.current[tooth];
            const curActive = prevList.find((row) => row.toothNumber === tooth) ?? null;
            delete candidateChoicesRef.current[tooth];
            clearGhostCandidateVisuals(tooth);
            disposeOtherCandidateGeometries(oldChoice, curActive);
          }
          const prev = prevList.find((row) => row.toothNumber === tooth);
          if (prev) {
            removeDesignFromScene(tooth);
            prev.worldGeometry.dispose();
            prev.predictedCrownWorldGeometry.dispose();
            prev.enameloplastyWorldGeometry?.dispose();
          }
          if (tooth === displacedTooth) {
            directEditRef.current?.clear([tooth]);
            delete gumballMetricBaseRef.current[tooth];
            delete gumballParamBaseRef.current[tooth];
            delete savedGumballEditRef.current[tooth];
          }
        }
        for (const tooth of built.keys()) {
          const cands = builtCands.get(tooth) ?? [];
          if (cands.length >= 2) {
            candidateChoicesRef.current[tooth] = {
              candidates: cands,
              selectedIndex: null,
            };
          }
          addDesignToScene(built.get(tooth)!);
          syncCandidateSceneForTooth(tooth);
        }
        const list = [
          ...prevList.filter((row) => !dropTeeth.has(row.toothNumber)),
          ...jawFixtures.map((fx) => built.get(fx.toothNumber)!),
        ];
        designedListRef.current = list;
        setDesignedList(list);
        setVisibleTeeth((prev) => {
          const next = { ...prev };
          for (const tooth of built.keys()) {
            next[tooth] = tooth === fixture.toothNumber ? true : prev[tooth] !== false;
          }
          if (displacedTooth) delete next[displacedTooth];
          return next;
        });

        committed = true;
        session.jobs.shift();
        if (displacedTooth) {
          const catalog = scanbodyCatalogRef.current;
          const displacedWork =
            ctx.allToothWorks.find((row) => row.toothNumber === displacedTooth) ?? null;
          if (catalog && displacedWork) {
            const models = await loadCandidateScanbodyModels({
              toothWork: displacedWork,
              catalog,
              connections: session.connections,
            });
            if (pickEpochRef.current !== epoch) return;
            if (models.length > 0) {
              const alreadyQueued = session.jobs.some((j) => j.toothNumber === displacedTooth);
              if (!alreadyQueued) {
                const parsed = parseFdiTooth(displacedTooth);
                session.jobs.unshift({
                  toothNumber: displacedTooth,
                  jaw: parsed?.jaw ?? job.jaw,
                  toothWork: displacedWork,
                  models,
                });
              }
            }
          }
        }
        if (session.jobs.length === 0) {
          scanbodyPickRef.current = null;
          setVisibleJaws(jawsForJobs([]));
          setStatus({ kind: "ready" });
          if (Object.keys(candidateChoicesRef.current).length === 0) {
            persistDesign();
          }
        } else {
          setVisibleJaws(jawsForJobs(session.jobs));
          setStatus({
            kind: "pick",
            toothNumber: session.jobs[0]!.toothNumber,
            phase: "aim",
          });
        }
      } catch (err) {
        if (!committed) {
          for (const made of built.values()) {
            made.worldGeometry.dispose();
            made.predictedCrownWorldGeometry.dispose();
            made.enameloplastyWorldGeometry?.dispose();
          }
          built.clear();
        }
        if (pickEpochRef.current !== epoch) return;
        console.warn("[custom-abutment] scanbody pick failed", err);
        setStatus({ kind: "pick", toothNumber: job.toothNumber, phase: "miss" });
      } finally {
        if (scanbodyPickRef.current === session) session.busy = false;
      }
    },
    [
      addDesignToScene,
      clearGhostCandidateVisuals,
      disposeOtherCandidateGeometries,
      jawsForJobs,
      persistDesign,
      rebuildJawScanMeshes,
      removeDesignFromScene,
      syncCandidateSceneForTooth,
    ],
  );
  scanbodyPickClickRef.current = (clientX, clientY) => {
    void handleScanbodyPickAt(clientX, clientY);
  };

  /** 이미 잡힌(또는 잘못된) 치아 스캔바디 위치를 다시 찍게 한다. */
  const startScanbodyRepick = useCallback(
    async (toothNumbers: readonly string[]) => {
      if (!canEditDesign) return;
      const sessionBusy = scanbodyPickRef.current?.busy;
      if (sessionBusy) return;
      const ctx = designContextRef.current;
      const catalog = scanbodyCatalogRef.current;
      const frame = frameRef.current;
      if (!ctx || !catalog || !frame) {
        toast({
          title: "위치를 다시 지정할 수 없습니다.",
          description: "스캔바디 라이브러리를 아직 불러오지 못했습니다.",
        });
        return;
      }
      const unique = [...new Set(toothNumbers.map((t) => String(t || "").trim()).filter(Boolean))];
      if (unique.length === 0) return;

      const jobs: ScanbodyPickJob[] = [];
      for (const toothNumber of unique) {
        const toothWork =
          ctx.allToothWorks.find((row) => row.toothNumber === toothNumber) ??
          abutmentToothWorks.find((row) => row.toothNumber === toothNumber) ??
          null;
        const parsed = parseFdiTooth(toothNumber);
        if (!toothWork || !parsed) continue;
        const models = await loadCandidateScanbodyModels({
          toothWork,
          catalog,
          connections,
        });
        if (models.length === 0) {
          toast({
            title: `#${toothNumber} 위치를 다시 지정할 수 없습니다.`,
            description: "스캔바디 모델을 찾지 못했습니다.",
          });
          continue;
        }
        jobs.push({
          toothNumber,
          jaw: parsed.jaw,
          toothWork,
          models,
        });
      }
      if (jobs.length === 0) return;

      pickEpochRef.current += 1;
      const repickSet = new Set(jobs.map((j) => j.toothNumber));
      const prevList = designedListRef.current;
      for (const tooth of repickSet) {
        if (candidateChoicesRef.current[tooth]) {
          const oldChoice = candidateChoicesRef.current[tooth];
          const curActive = prevList.find((row) => row.toothNumber === tooth) ?? null;
          delete candidateChoicesRef.current[tooth];
          clearGhostCandidateVisuals(tooth);
          disposeOtherCandidateGeometries(oldChoice, curActive);
        }
        const prev = prevList.find((row) => row.toothNumber === tooth);
        if (prev) {
          removeDesignFromScene(tooth);
          prev.worldGeometry.dispose();
          prev.predictedCrownWorldGeometry.dispose();
          prev.enameloplastyWorldGeometry?.dispose();
        }
        directEditRef.current?.clear([tooth]);
        delete gumballMetricBaseRef.current[tooth];
        delete gumballParamBaseRef.current[tooth];
        delete savedGumballEditRef.current[tooth];
      }

      ctx.fixtures = ctx.fixtures.filter((row) => !repickSet.has(row.toothNumber));
      const affectedJaws = new Set(jobs.map((j) => j.jaw));
      for (const jaw of affectedJaws) {
        rebuildJawScanMeshes(
          jaw,
          ctx.fixtures.filter((row) => row.jaw === jaw),
          true,
        );
      }

      const nextList = prevList.filter((row) => !repickSet.has(row.toothNumber));
      designedListRef.current = nextList;
      setDesignedList(nextList);
      setVisibleTeeth((prev) => {
        const next = { ...prev };
        for (const tooth of repickSet) delete next[tooth];
        return next;
      });
      selectedTeethRef.current = selectedTeethRef.current.filter((t) => !repickSet.has(t));
      setSelectedTeeth(selectedTeethRef.current);
      applySelectionPivot(selectedTeethRef.current);

      const existing = scanbodyPickRef.current;
      const keptJobs = (existing?.jobs ?? []).filter((j) => !repickSet.has(j.toothNumber));
      const nextJobs = [...jobs, ...keptJobs];
      scanbodyPickRef.current = {
        jobs: nextJobs,
        connections,
        busy: false,
      };
      setVisibleJaws(jawsForJobs(nextJobs));
      setStatus({
        kind: "pick",
        toothNumber: nextJobs[0]!.toothNumber,
        phase: "aim",
      });
    },
    [
      abutmentToothWorks,
      applySelectionPivot,
      canEditDesign,
      clearGhostCandidateVisuals,
      connections,
      disposeOtherCandidateGeometries,
      jawsForJobs,
      rebuildJawScanMeshes,
      removeDesignFromScene,
      toast,
    ],
  );

  const latestInputsRef = useRef({
    abutmentToothWorks,
    normalizedToothWorks,
    scanSources,
    connections,
    patientName,
    workScanFiles,
  });
  latestInputsRef.current = {
    abutmentToothWorks,
    normalizedToothWorks,
    scanSources,
    connections,
    patientName,
    workScanFiles,
  };

  // 확정 뒤 목록 응답이 파일 이름·스캔 역할만 바꿔도 구강 스캔을 다시 받지 않는다.
  const pipelineKey = useMemo(
    () =>
      JSON.stringify({
        teeth: abutmentToothWorks.map((t) => t.toothNumber).join(","),
        scans: scanSources.meshes
          .map((s) => s.s3Key)
          .sort()
          .join(","),
      }),
    [abutmentToothWorks, scanSources.meshes],
  );
  chatScopeRef.current = transferIdParam || pipelineKey;

  /** 모달 닫기·케이스 전환(unmount) 직전에 디자인·카메라·대화를 바로 남긴다. */
  const flushSessionWork = useCallback(() => {
    window.clearTimeout(editCommitTimerRef.current);
    editCommitTimerRef.current = 0;
    persistDesign();
    const cam = cameraRef.current;
    const controls = controlsRef.current;
    if (viewReadyRef.current && cam && controls) {
      writeSavedView(transferIdRef.current, cam, controls.target);
    }
  }, [persistDesign]);

  useEffect(() => {
    return () => {
      flushSessionWork();
    };
  }, [flushSessionWork]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) flushSessionWork();
      onOpenChange(next);
    },
    [flushSessionWork, onOpenChange],
  );
  const handleOpenChangeRef = useRef(handleOpenChange);
  handleOpenChangeRef.current = handleOpenChange;
  const onActionCompleteRef = useRef(onActionComplete);
  onActionCompleteRef.current = onActionComplete;
  const toastRef = useRef(toast);
  toastRef.current = toast;

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
      const picking = scanbodyPickRef.current != null && !scanbodyPickRef.current.busy;
      pickDown =
        e.button === 0 && (pivotArmedRef.current || picking) ? { x: e.clientX, y: e.clientY } : null;
    };
    const onPickUp = (e: PointerEvent) => {
      const down = pickDown;
      pickDown = null;
      if (!down) return;
      if (Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 4) return;
      const session = scanbodyPickRef.current;
      if (session && !session.busy) {
        scanbodyPickClickRef.current(e.clientX, e.clientY);
        return;
      }
      if (!pivotArmedRef.current) return;
      pickPivotAt(e.clientX, e.clientY);
    };
    const onPickDouble = (e: MouseEvent) => {
      if (scanbodyPickRef.current && !scanbodyPickRef.current.busy) return;
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
      directEditRef.current?.tick();
      if (paintListeners.size > 0) notifyViewPaint(paintListeners);
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
      viewCubeRef.current?.sync(camera, cubeFrameRef.current ?? frameRef.current);
    };
    const paintListeners = paintListenersRef.current;
    const editSession = new AbutmentDirectEditSession(editBridgeRef.current!);
    directEditRef.current = editSession;
    editSession.attach(renderer.domElement);
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
      for (const list of ghostCandidateVisualsRef.current.values()) {
        for (const g of list) {
          (g.line.material as LineMaterial).resolution.set(next.width, next.height);
        }
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
      editSession.dispose();
      directEditRef.current = null;
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

  useEffect(() => {
    directEditRef.current?.sync();
  }, [designedList]);

  // 스캔 로드 → (저장본 복원 | 스캔바디 인식·정합 → 커스텀어벗 디자인) → 씬 배치
  useEffect(() => {
    if (!open || !hostEl) return;
    const {
      abutmentToothWorks: curToothWorks,
      normalizedToothWorks: curAllToothWorks,
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
      if (filesPending) {
        setStatus({
          kind: "loading",
          percent: 4,
          step: "의뢰 파일을 불러오는 중…",
        });
        return;
      }
      setStatus({
        kind: "error",
        message: "구강 스캔 파일(DCM·PLY·STL·OBJ)이 없어 디자인 프리뷰를 만들 수 없습니다.",
      });
      return;
    }

    const abort = new AbortController();
    let cancelled = false;
    const cacheKey = customAbutmentDesignCacheKey(pipelineKey);

    const loadCompanionTexture = async (
      fileName: string,
      preferredTex: string | null,
    ): Promise<THREE.Texture | null> => {
      const ext = getModelExtLower(fileName);
      if ((ext !== ".ply" && ext !== ".obj") || curScanSources.companions.length === 0) return null;
      const texName = resolveCompanionTextureFileName(
        fileName,
        preferredTex,
        curScanSources.companions.map((c) => c.fileName),
      );
      const hitComp = texName ? curScanSources.companions.find((c) => c.fileName === texName) : null;
      if (!hitComp?.s3Key) return null;
      const texBlob = await fetchS3BlobCached({
        s3Key: hitComp.s3Key,
        fileName: hitComp.fileName,
        token,
        buildUrl: buildS3ProxyDownloadUrl,
        signal: abort.signal,
      });
      return loadTextureFromFile(fileFromImageBlob(texBlob, hitComp.fileName));
    };

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

      const cachedGeometry = await readCachedScanGeometry(s3Key);
      if (cachedGeometry) {
        onProgress(100);
        let texture: THREE.Texture | null = null;
        if (cachedGeometry.getAttribute("uv")) {
          try {
            texture = await loadCompanionTexture(item.fileName, null);
          } catch {
            texture = null;
          }
        }
        return {
          role,
          fileName: item.fileName,
          geometry: cachedGeometry,
          texture,
        };
      }

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
      let preferredTex: string | null = null;
      if ((ext === ".ply" || ext === ".obj") && curScanSources.companions.length > 0) {
        preferredTex =
          ext === ".ply" ? peekPlyHeaderInfo(await blob.arrayBuffer()).textureFileName : null;
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
      storeScanGeometry(s3Key, parsed.geometry);
      return {
        role,
        fileName: item.fileName,
        geometry: parsed.geometry,
        texture: parsed.texture ?? null,
      };
    };

    const runPipeline = async () => {
      preloadMeshUnion();
      try {
        proposalInputRef.current = {};
        labSourceStlRef.current = {};
        labGeometryTouchedRef.current = false;
        gumballMetricBaseRef.current = {};
        gumballParamBaseRef.current = {};
        savedGumballEditRef.current = {};
        pickEpochRef.current += 1;
        scanbodyPickRef.current = null;
        clearSceneObjects();
        setDesignedList([]);
        setAvailableJaws({ upper: false, lower: false });
        selectedTeethRef.current = [];
        setSelectedTeeth([]);
        setRestoredFromCache(false);
        designContextRef.current = null;
        const chatApplyEpoch = ++chatApplyEpochRef.current;
        setStatus({ kind: "loading", percent: 8, step: "구강 스캔을 불러오는 중…" });

        const cachePromise =
          readOnly || isLabViewer
            ? Promise.resolve(null)
            : readCustomAbutmentDesign(cacheKey);
        const chatPromise =
          readOnly || isLabViewer
            ? Promise.resolve([] as CustomAbutmentChatTurn[])
            : readCustomAbutmentChat(transferIdParam || pipelineKey);
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
        void catalogPromise.then((catalog) => {
          if (!cancelled) scanbodyCatalogRef.current = catalog;
        });
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
        const logicPromise = apiFetch<{ data?: { rules?: unknown } }>({
          path: "/api/ai/custom-abutment-design-logic",
          token,
        })
          .then((res) => parseAbutmentGenerationRules(res.ok ? res.data?.data?.rules : []))
          .catch(() => [] as AbutmentGenerationRule[]);
        const anatomyPromise = hydrateToothAnatomyCatalog(token);
        void logicPromise.then((rules) => {
          if (cancelled) return;
          logicRulesRef.current = rules;
        });
        void preferencePromise.then((p) => {
          if (cancelled) return;
          canSavePreferenceRef.current = p.canSave;
          preferenceRef.current = mergeEditPreference(p.preference, readUserEditPreference(authUserIdRef.current));
        });

        const progressByIdx = new Array<number>(Math.max(toLoad.length, 1)).fill(0);
        const snapshotLoad = transferIdParam
          ? beginCustomAbutmentSnapshot(token, transferIdParam)
          : null;
        const scansPromise = Promise.all(
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
        );
        // 기공소는 스캔을 그리기 전에 확정만 본다. STL은 스캔과 같이 받는다.
        const remoteModeFirst = isLabViewerRef.current ? await snapshotLoad?.mode : null;
        if (cancelled) return;
        if (isLabViewerRef.current && remoteModeFirst !== "confirmed") {
          abort.abort();
          void scansPromise.catch(() => undefined);
          const snapshotKnown = remoteModeFirst !== "missing";
          if (snapshotKnown) onActionCompleteRef.current?.("unconfirmed");
          toastRef.current({
            title: "디자인 검토",
            description: snapshotKnown
              ? "치과 디자인 확정 후 검토할 수 있습니다."
              : "디자인 상태를 확인하지 못했습니다.",
          });
          handleOpenChangeRef.current(false);
          return;
        }
        const [rawLoadedScans, localCached, localChat, remote] = await Promise.all([
          scansPromise,
          cachePromise,
          chatPromise,
          snapshotLoad ? snapshotLoad.full() : Promise.resolve(null),
        ]);
        if (cancelled) return;
        const serverDesign =
          remote?.design && remote.design.teeth.length > 0
            ? {
                ...remote.design,
                alignedScans: remote.design.alignedScans,
              }
            : null;
        const cached =
          readOnly || isLabViewer
            ? serverDesign
            : preferFresherCustomAbutmentDesign(localCached, serverDesign);
        proposalInputRef.current = {};
        for (const row of cached?.teeth ?? []) {
          const saved = row.proposalInput;
          if (saved && typeof saved === "object") {
            proposalInputRef.current[row.toothNumber] = { ...saved };
          }
        }
        pendingRemotePaintRef.current = remote?.paint ?? null;
        setRemoteMode(remote?.mode ?? null);
        setFeeGuide(remote?.feeGuide ?? null);
        setLabCheckedAt(remote?.choice?.labCheckedAt ?? null);
        setCancelDeadlineAt(remote?.choice?.cancelDeadlineAt ?? null);
        if (!viewerTouchRef.current.has("chat")) {
          if (viewerPrefsRef.current.chatOpen === false) {
            setManualChatOpen(true);
            setManualChatCollapsed(true);
          } else if (
            viewerPrefsRef.current.chatOpen === true ||
            remote?.mode === "manual" ||
            (!readOnly && transferIdParam)
          ) {
            setManualChatOpen(true);
            setManualChatCollapsed(false);
          }
        }
        const savedChat = pickCustomAbutmentChat(localChat, remote?.chat ?? [], cached?.chat ?? []);
        const loadedScans = rawLoadedScans.filter(
          (row): row is LoadedJawScan => row != null,
        );
        if (cancelled) return;

        const upperScans = loadedScans.filter((s) => s.role === "upper");
        const lowerScans = loadedScans.filter((s) => s.role === "lower");
        const biteScans = loadedScans.filter((s) => s.role === "bite");
        const jawScans = [...upperScans, ...lowerScans];

        // 저장본: 바이트 정렬 결과 정점이 같은 스캔에 맞을 때만 그대로 쓴다.
        // 서버 스냅샷은 alignedScans가 비어 있다 — 최신이면 메시만 복원하고,
        // 구버전이면 교합·스캔바디부터 다시 돌려 새 형상을 본다.
        let restored = false;
        let meshRestore = false;
        let serverMeshRestore = false;
        let alignedScans: CachedAlignedScan[] = [];
        if (cached && cached.teeth.length > 0) {
          if (cached.alignedScans.length > 0) {
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
          } else if (hasWorkScans) {
            // 작업 스캔은 이미 정렬된 월드 좌표이므로 alignedScans가 비어 있어도 정합을 재사용한다.
            restored = true;
          } else if (cached.designFresh || isLabViewer) {
            meshRestore = true;
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

        let upperPrimary = upperScans[0]?.geometry ?? null;
        let lowerPrimary = lowerScans[0]?.geometry ?? null;
        const pickBestJawGeoForFixtures = (
          scans: readonly LoadedJawScan[],
          fixturesForJaw: readonly MatchedScanbodyFixture[],
        ): THREE.BufferGeometry | null => {
          if (scans.length === 0) return null;
          if (scans.length === 1 || fixturesForJaw.length === 0) return scans[0]!.geometry;
          let bestGeo = scans[0]!.geometry;
          let bestErr = Infinity;
          for (const scan of scans) {
            const pos = scan.geometry.getAttribute("position");
            if (!pos || pos.count === 0) continue;
            const stride = Math.max(1, Math.floor(pos.count / 12000));
            let errSum = 0;
            for (const fx of fixturesForJaw) {
              let minD2 = Infinity;
              const [tx, ty, tz] = fx.scanbodyTop;
              for (let i = 0; i < pos.count; i += stride) {
                const d2 =
                  (pos.getX(i) - tx) ** 2 + (pos.getY(i) - ty) ** 2 + (pos.getZ(i) - tz) ** 2;
                if (d2 < minD2) minD2 = d2;
              }
              errSum += Math.sqrt(minD2);
            }
            if (errSum < bestErr) {
              bestErr = errSum;
              bestGeo = scan.geometry;
            }
          }
          return bestGeo;
        };
        const builtAbutments: DesignedCustomAbutment[] = [];
        const overrides: Record<string, Partial<CustomAbutmentDesignParams>> = {};
        const pendingPickJobs: ScanbodyPickJob[] = [];

        let redesignedFromFit = false;
        const [loadedRules] = await Promise.all([logicPromise, anatomyPromise]);
        logicRulesRef.current = loadedRules;
        if (cancelled) return;
        if (restored && cached && !cached.designFresh) {
          // 정합은 그대로 쓰고 형상만 새 규칙으로 다시 만든다.
          redesignedFromFit = true;
          const curPreference = await preferencePromise;
          if (cancelled) return;
          canSavePreferenceRef.current = curPreference.canSave;
          preferenceRef.current = mergeEditPreference(
            curPreference.preference,
            readUserEditPreference(authUserIdRef.current),
          );
          const fixtures = cached.teeth.map((row) => row.fixture);
          upperPrimary = pickBestJawGeoForFixtures(
            upperScans,
            fixtures.filter((f) => f.jaw === "upper"),
          );
          lowerPrimary = pickBestJawGeoForFixtures(
            lowerScans,
            fixtures.filter((f) => f.jaw === "lower"),
          );
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
            let rowOverrides = stripDirectEditShiftOverrides(
              parseCustomAbutmentParamOverrides(row.overrides),
            );
            if ((rowOverrides.postTaperLink ?? 1) >= 0.5) {
              delete rowOverrides.postTaperDeg;
            }
            const restoredGumball = !readOnly ? normalizeAbutmentEdit(row.gumballEdit) : null;
            if (restoredGumball && row.gumballBaseParams) {
              rowOverrides = retainLiveGumballParams(
                rowOverrides,
                parseCustomAbutmentParamOverrides(row.gumballBaseParams),
                restoredGumball,
                {},
              );
            } else if (!restoredGumball && (cached.version ?? 0) < 52) {
              delete rowOverrides.postWidthScale;
            }
            overrides[row.toothNumber] = rowOverrides;
            if (!proposalInputRef.current[row.toothNumber]) {
              proposalInputRef.current[row.toothNumber] = {
                ...preferenceOverridesForTooth(row.toothNumber, preferenceRef.current),
              };
            }
            if (restoredGumball) {
              const freshBuilt = await designCustomAbutmentStl({
                fixture: row.fixture,
                jawGeometry: jawGeo,
                opposingGeometry: jaw === "upper" ? lowerPrimary : upperPrimary,
                neighbors: fixtures.filter((f) => f.jaw === jaw),
                toothWorks: curAllToothWorks,
                params: {
                  ...preferenceOverridesForTooth(row.toothNumber, preferenceRef.current),
                  ...rowOverrides,
                },
                explicitParams: rowOverrides,
                logicRules: logicRulesRef.current,
                patientName: curPatientName,
              });
              gumballMetricBaseRef.current[row.toothNumber] = { ...freshBuilt.metrics };
              gumballParamBaseRef.current[row.toothNumber] = { ...freshBuilt.params };
              directEditRef.current?.setEdit(row.toothNumber, restoredGumball);
              builtAbutments.push(freshBuilt);
            } else {
              const freshCands = await designCustomAbutmentCandidates({
                fixture: row.fixture,
                jawGeometry: jawGeo,
                opposingGeometry: jaw === "upper" ? lowerPrimary : upperPrimary,
                neighbors: fixtures.filter((f) => f.jaw === jaw),
                toothWorks: curAllToothWorks,
                params: {
                  ...preferenceOverridesForTooth(row.toothNumber, preferenceRef.current),
                  ...rowOverrides,
                },
                explicitParams: rowOverrides,
                logicRules: logicRulesRef.current,
                patientName: curPatientName,
              });
              const primaryDesign = freshCands[0]!.design;
              if (freshCands.length >= 2) {
                candidateChoicesRef.current[row.toothNumber] = {
                  candidates: freshCands,
                  selectedIndex: null,
                };
              }
              builtAbutments.push(primaryDesign);
            }
          }
        } else if ((restored || meshRestore) && cached) {
          serverMeshRestore = true;
          setStatus({ kind: "loading", percent: 80, step: "저장된 디자인을 여는 중…" });
          const cachedFixtures = cached.teeth.map((row) => row.fixture);
          upperPrimary = pickBestJawGeoForFixtures(
            upperScans,
            cachedFixtures.filter((f) => f.jaw === "upper"),
          );
          lowerPrimary = pickBestJawGeoForFixtures(
            lowerScans,
            cachedFixtures.filter((f) => f.jaw === "lower"),
          );
          for (const row of cached.teeth) {
            const rowOverrides = parseCustomAbutmentParamOverrides(row.overrides);
            overrides[row.toothNumber] = rowOverrides;
            const restoredGumball = !readOnly ? normalizeAbutmentEdit(row.gumballEdit) : null;
            if (restoredGumball) {
              savedGumballEditRef.current[row.toothNumber] = restoredGumball;
              if (row.gumballBaseParams) {
                gumballParamBaseRef.current[row.toothNumber] = {
                  ...row.params,
                  ...parseCustomAbutmentParamOverrides(row.gumballBaseParams),
                };
              }
              if (row.gumballBaseMetrics) {
                gumballMetricBaseRef.current[row.toothNumber] = { ...row.gumballBaseMetrics };
              }
            }
            if (!readOnly && !row.solidBodyLocalPositions?.byteLength) {
              const storedEarly = new Float32Array(row.localPositions);
              // 서버 스냅샷은 alignedScans가 비고 STL이 솔리드다. 휴리스틱 오판 시에도 강제 천공한다.
              const fromSolidSnapshot = !cached.alignedScans?.length;
              const closedTop = abutmentTopLooksClosed(storedEarly);
              if (fromSolidSnapshot || closedTop) {
                const viewEarly = await openScrewChannelForView(storedEarly, row.fixture, {
                  force: fromSolidSnapshot || closedTop,
                });
                builtAbutments.push(
                  buildDesignedCustomAbutment({
                    fixture: row.fixture,
                    fileName: row.fileName,
                    localPositions: viewEarly,
                    solidBodyLocalPositions: storedEarly,
                    crownLocalPositions: new Float32Array(row.crownLocalPositions),
                    marginLoopLocal: new Float32Array(row.marginLoopLocal),
                    ...(row.enameloplastyLocalPositions?.byteLength
                      ? {
                          enameloplastyLocalPositions: new Float32Array(
                            row.enameloplastyLocalPositions,
                          ),
                        }
                      : {}),
                    params: row.params,
                    metrics: row.metrics,
                  }),
                );
                continue;
              }
              const jaw = row.fixture.jaw;
              const jawGeo = jaw === "upper" ? upperPrimary : lowerPrimary;
              if (jawGeo) {
                const freshSolid = await designCustomAbutmentStl({
                  fixture: row.fixture,
                  jawGeometry: jawGeo,
                  opposingGeometry: jaw === "upper" ? lowerPrimary : upperPrimary,
                  neighbors: cachedFixtures.filter((f) => f.jaw === jaw),
                  toothWorks: curAllToothWorks,
                  params: row.params,
                  explicitParams: rowOverrides,
                  logicRules: logicRulesRef.current,
                  patientName: curPatientName,
                });
                freshSolid.worldGeometry.dispose();
                freshSolid.predictedCrownWorldGeometry.dispose();
                freshSolid.enameloplastyWorldGeometry?.dispose();
                const savedMarginLoop = new Float32Array(row.marginLoopLocal);
                // 저장된 디자인의 마진과 새로 만든 솔리드의 마진이 일치할 때만 솔리드 베이스로 결합한다.
                // (이미 검볼 편집이 반영돼 저장된 디자인에 미편집 freshSolid를 섞으면 커프·마진 메시가 찢어진다.)
                let freshSolidMatchesSavedMargin =
                  !restoredGumball &&
                  Boolean(freshSolid.solidBodyLocalPositions?.length) &&
                  freshSolid.marginLoopLocal.length === savedMarginLoop.length &&
                  savedMarginLoop.length >= 9;
                if (freshSolidMatchesSavedMargin) {
                  let maxMarginDiffSq = 0;
                  for (let mi = 0; mi < savedMarginLoop.length; mi += 3) {
                    const dx = freshSolid.marginLoopLocal[mi]! - savedMarginLoop[mi]!;
                    const dy = freshSolid.marginLoopLocal[mi + 1]! - savedMarginLoop[mi + 1]!;
                    const dz = freshSolid.marginLoopLocal[mi + 2]! - savedMarginLoop[mi + 2]!;
                    const d2 = dx * dx + dy * dy + dz * dz;
                    if (d2 > maxMarginDiffSq) maxMarginDiffSq = d2;
                  }
                  if (maxMarginDiffSq > 0.08 * 0.08) {
                    freshSolidMatchesSavedMargin = false;
                  }
                }
                builtAbutments.push(
                  buildDesignedCustomAbutment({
                    fixture: row.fixture,
                    fileName: row.fileName,
                    localPositions: new Float32Array(row.localPositions),
                    ...(freshSolidMatchesSavedMargin
                      ? { solidBodyLocalPositions: freshSolid.solidBodyLocalPositions }
                      : {}),
                    crownLocalPositions: new Float32Array(row.crownLocalPositions),
                    marginLoopLocal: savedMarginLoop,
                    ...(row.enameloplastyLocalPositions?.byteLength
                      ? {
                          enameloplastyLocalPositions: new Float32Array(
                            row.enameloplastyLocalPositions,
                          ),
                        }
                      : freshSolid.enameloplastyLocalPositions
                        ? { enameloplastyLocalPositions: freshSolid.enameloplastyLocalPositions }
                        : {}),
                    params: row.params,
                    metrics: row.metrics,
                  }),
                );
                continue;
              }
            }
            const stored = new Float32Array(row.localPositions);
            const view = await openScrewChannelForView(stored, row.fixture);
            const savedSolid = row.solidBodyLocalPositions?.byteLength
              ? new Float32Array(row.solidBodyLocalPositions)
              : view !== stored || abutmentTopLooksClosed(stored)
                ? stored
                : undefined;
            builtAbutments.push(
              buildDesignedCustomAbutment({
                fixture: row.fixture,
                fileName: row.fileName,
                localPositions: view,
                ...(savedSolid ? { solidBodyLocalPositions: savedSolid } : {}),
                crownLocalPositions: new Float32Array(row.crownLocalPositions),
                marginLoopLocal: new Float32Array(row.marginLoopLocal),
                ...(row.enameloplastyLocalPositions?.byteLength
                  ? { enameloplastyLocalPositions: new Float32Array(row.enameloplastyLocalPositions) }
                  : {}),
                params: row.params,
                metrics: row.metrics,
              }),
            );
          }
        } else if (readOnly && cached?.designFresh) {
          setStatus({ kind: "loading", percent: 80, step: "저장된 디자인을 여는 중…" });
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
          canSavePreferenceRef.current = curPreference.canSave;
          preferenceRef.current = mergeEditPreference(
            curPreference.preference,
            readUserEditPreference(authUserIdRef.current),
          );

          const teethByJaw = { upper: [] as ToothWorkSelection[], lower: [] as ToothWorkSelection[] };
          for (const tw of curToothWorks) {
            const parsed = parseFdiTooth(tw.toothNumber);
            if (parsed) teethByJaw[parsed.jaw].push(tw);
          }

          for (const jaw of ["upper", "lower"] as const) {
            const jawScanList = jaw === "upper" ? upperScans : lowerScans;
            const oppGeo = jaw === "upper" ? lowerPrimary : upperPrimary;
            const teeth = teethByJaw[jaw];
            if (jawScanList.length === 0 || teeth.length === 0) continue;

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

            // 치은 스캔과 스캔바디 스캔처럼 같은 악궁 파일이 여러 개 올라온 의뢰는 각 스캔에서 찾은 뒤
            // 매칭 치아 수가 가장 많은 스캔을 기준으로 삼고, 다른 스캔에만 찍힌 치아가 있으면 함께 합친다.
            const perScanMatches = jawScanList.map((scan) => {
              const matched = detectAndMatchScanbodiesOnJaw({
                jawGeometry: scan.geometry,
                frame,
                teeth: withModels,
                connections: curConnections,
              });
              let rmsSum = 0;
              for (const fx of matched.values()) rmsSum += fx.rmsMm;
              const avgRms = matched.size > 0 ? rmsSum / matched.size : Infinity;
              const verts = scan.geometry.getAttribute("position")?.count ?? 0;
              return { geometry: scan.geometry, matched, avgRms, verts };
            });
            perScanMatches.sort(
              (a, b) =>
                b.matched.size - a.matched.size || a.avgRms - b.avgRms || b.verts - a.verts,
            );
            const jawGeo = perScanMatches[0]!.geometry;
            if (jaw === "upper") upperPrimary = jawGeo;
            else lowerPrimary = jawGeo;

            const matchedTeeth = new Map(perScanMatches[0]!.matched);
            if (matchedTeeth.size < teeth.length && perScanMatches.length > 1) {
              for (const alt of perScanMatches.slice(1)) {
                for (const [tn, fx] of alt.matched.entries()) {
                  if (matchedTeeth.has(tn)) continue;
                  const collides = [...matchedTeeth.values()].some(
                    (prev) =>
                      Math.hypot(
                        prev.scanbodyTop[0] - fx.scanbodyTop[0],
                        prev.scanbodyTop[1] - fx.scanbodyTop[1],
                        prev.scanbodyTop[2] - fx.scanbodyTop[2],
                      ) < 3.0,
                  );
                  if (!collides) matchedTeeth.set(tn, fx);
                }
              }
            }
            const jawFixtures = teeth
              .map((tw) => matchedTeeth.get(tw.toothNumber))
              .filter((m): m is MatchedScanbodyFixture => m != null);
            for (const row of withModels) {
              if (matchedTeeth.has(row.toothWork.toothNumber) || row.models.length === 0) continue;
              pendingPickJobs.push({
                toothNumber: row.toothWork.toothNumber,
                jaw,
                toothWork: row.toothWork,
                models: row.models,
              });
            }

            for (const matched of jawFixtures) {
              setStatus({
                kind: "loading",
                percent: jaw === "upper" ? 78 : 90,
                step: `#${matched.toothNumber} 커스텀어벗 디자인 중…`,
              });
              if (!proposalInputRef.current[matched.toothNumber]) {
                proposalInputRef.current[matched.toothNumber] = {
                  ...preferenceOverridesForTooth(matched.toothNumber, preferenceRef.current),
                };
              }
              const cands = await designCustomAbutmentCandidates({
                fixture: matched,
                jawGeometry: jawGeo,
                opposingGeometry: oppGeo,
                neighbors: jawFixtures,
                toothWorks: curAllToothWorks,
                params: preferenceOverridesForTooth(matched.toothNumber, preferenceRef.current),
                explicitParams: {},
                logicRules: logicRulesRef.current,
                patientName: curPatientName,
              });
              if (cancelled) {
                for (const c of cands) {
                  c.design.worldGeometry.dispose();
                  c.design.predictedCrownWorldGeometry.dispose();
                  c.design.enameloplastyWorldGeometry?.dispose();
                }
                break;
              }
              if (cands.length >= 2) {
                candidateChoicesRef.current[matched.toothNumber] = {
                  candidates: cands,
                  selectedIndex: null,
                };
              }
              builtAbutments.push(cands[0]!.design);
            }
          }
        }

        // 저장본에 없는 치아, 또는 옆 치아 슬롯에 붙어 있는 치아는 다시 찍게 한다.
        // 그렇지 않으면 화면이 바로 확정되고 #36이 #35 자리에 남은 채로 안내가 사라진다.
        if (!readOnly && (restored || meshRestore) && !cancelled && frame) {
          const slotCenter = new Map<string, [number, number, number]>();
          for (const tw of curToothWorks) {
            const parsed = parseFdiTooth(tw.toothNumber);
            const geo = parsed?.jaw === "upper" ? upperPrimary : parsed?.jaw === "lower" ? lowerPrimary : null;
            if (!parsed || !geo) continue;
            const slot = locateNominalToothSlot({
              geometry: geo,
              frame,
              toothNumber: tw.toothNumber,
              allowPartialArch: true,
            });
            if (slot) slotCenter.set(tw.toothNumber, slot.center);
          }
          const misplaced = new Set<string>();
          for (const designed of builtAbutments) {
            const own = slotCenter.get(designed.toothNumber);
            if (!own) continue;
            const top = designed.fixture.scanbodyTop;
            const dist = (center: readonly [number, number, number]) =>
              Math.hypot(top[0] - center[0], top[1] - center[1], top[2] - center[2]);
            const ownD = dist(own);
            for (const [other, center] of slotCenter) {
              if (other === designed.toothNumber) continue;
              const otherFdi = parseFdiTooth(other);
              const ownFdi = parseFdiTooth(designed.toothNumber);
              if (!otherFdi || !ownFdi || otherFdi.jaw !== ownFdi.jaw || otherFdi.digits[0] !== ownFdi.digits[0]) {
                continue;
              }
              if (dist(center) + 2.5 < ownD) misplaced.add(designed.toothNumber);
            }
          }
          if (misplaced.size > 0) {
            const kept: DesignedCustomAbutment[] = [];
            for (const designed of builtAbutments) {
              if (!misplaced.has(designed.toothNumber)) {
                kept.push(designed);
                continue;
              }
              const staleChoice = candidateChoicesRef.current[designed.toothNumber];
              if (staleChoice) {
                delete candidateChoicesRef.current[designed.toothNumber];
                for (const cand of staleChoice.candidates) {
                  if (cand.design === designed) continue;
                  cand.design.worldGeometry.dispose();
                  cand.design.predictedCrownWorldGeometry.dispose();
                  cand.design.enameloplastyWorldGeometry?.dispose();
                }
              }
              designed.worldGeometry.dispose();
              designed.predictedCrownWorldGeometry.dispose();
              designed.enameloplastyWorldGeometry?.dispose();
            }
            builtAbutments.length = 0;
            builtAbutments.push(...kept);
          }
          const builtTeeth = new Set(builtAbutments.map((d) => d.toothNumber));
          const missing = curToothWorks.filter((tw) => !builtTeeth.has(tw.toothNumber));
          if (missing.length > 0) {
            const curCatalog = scanbodyCatalogRef.current ?? (await catalogPromise);
            if (!cancelled) {
              scanbodyCatalogRef.current = curCatalog;
              const queued = new Set(pendingPickJobs.map((job) => job.toothNumber));
              for (const tw of missing) {
                if (queued.has(tw.toothNumber)) continue;
                const parsed = parseFdiTooth(tw.toothNumber);
                if (!parsed) continue;
                const models = await loadCandidateScanbodyModels({
                  toothWork: tw,
                  catalog: curCatalog,
                  connections: curConnections,
                });
                if (cancelled) break;
                if (models.length === 0) continue;
                pendingPickJobs.push({
                  toothNumber: tw.toothNumber,
                  jaw: parsed.jaw,
                  toothWork: tw,
                  models,
                });
              }
            }
          }
        }

        for (const bite of biteScans) {
          bite.geometry.dispose();
          bite.texture?.dispose();
        }

        if (cancelled) {
          for (const d of builtAbutments) {
            d.worldGeometry.dispose();
            d.predictedCrownWorldGeometry.dispose();
            d.enameloplastyWorldGeometry?.dispose();
          }
          for (const s of jawScans) {
            s.geometry.dispose();
            s.texture?.dispose();
          }
          return;
        }

        if (builtAbutments.length === 0 && pendingPickJobs.length === 0 && !readOnly) {
          for (const s of jawScans) {
            s.geometry.dispose();
            s.texture?.dispose();
          }
          setStatus({
            kind: "error",
            message: "스캔 데이터에서 의뢰 치아의 스캔바디를 찾지 못했습니다.",
          });
          return;
        }

        const scene = sceneRef.current;
        if (!scene) {
          throw new Error("3D 뷰어 캔버스를 준비하지 못했습니다.");
        }

        rawJawScansRef.current = jawScans.map((scan) => ({
          jaw: scan.role as "upper" | "lower",
          geometry: scan.geometry,
          texture: scan.texture,
        }));
        const pickJaws = new Set(pendingPickJobs.map((job) => job.jaw));
        const allBuiltFixtures = builtAbutments.map((d) => d.fixture);
        if (upperScans.length > 0) {
          rebuildJawScanMeshes("upper", allBuiltFixtures, pickJaws.size === 0 || pickJaws.has("upper"));
        }
        if (lowerScans.length > 0) {
          rebuildJawScanMeshes("lower", allBuiltFixtures, pickJaws.size === 0 || pickJaws.has("lower"));
        }

        const nextVisibleTeeth: Record<string, boolean> = {};
        for (const d of builtAbutments) {
          nextVisibleTeeth[d.toothNumber] = true;
          addDesignToScene(d);
          syncCandidateSceneForTooth(d.toothNumber);
        }

        const nextBaselineMetrics: Record<string, CustomAbutmentDesignMetrics> = {};
        const nextBaselineParams: Record<string, CustomAbutmentDesignParams> = {};
        const nextEditedFields: Record<string, Set<AbutmentInfoFieldKey>> = {};
        for (const d of builtAbutments) {
          if (!proposalInputRef.current[d.toothNumber]) {
            proposalInputRef.current[d.toothNumber] = {
              ...preferenceOverridesForTooth(d.toothNumber, preferenceRef.current),
            };
          }
          const cachedRow = cached?.teeth.find((r) => r.toothNumber === d.toothNumber);
          nextBaselineMetrics[d.toothNumber] = {
            ...(cachedRow?.baselineMetrics ?? d.metrics),
          };
          nextBaselineParams[d.toothNumber] = {
            ...(cachedRow?.baselineParams ?? d.params),
          };
          nextEditedFields[d.toothNumber] = new Set(
            (cachedRow?.editedInfoFields ?? []) as AbutmentInfoFieldKey[],
          );
        }
        baselineMetricsRef.current = nextBaselineMetrics;
        baselineParamsRef.current = nextBaselineParams;
        editedInfoFieldsRef.current = nextEditedFields;
        if (serverMeshRestore && cached) {
          const nextSource: Record<string, { s3Key: string; crownS3Key: string }> = {};
          for (const design of builtAbutments) {
            const row = cached.teeth.find((tooth) => tooth.toothNumber === design.toothNumber);
            const s3Key = String(row?.sourceS3Key || "").trim();
            if (!s3Key) continue;
            nextSource[design.toothNumber] = {
              s3Key,
              crownS3Key: String(row?.sourceCrownS3Key || "").trim(),
            };
          }
          labSourceStlRef.current = nextSource;
          labGeometryTouchedRef.current = false;
        }

        designContextRef.current = {
          cacheKey,
          patientName: String(curPatientName || ""),
          jawGeometry: { upper: upperPrimary, lower: lowerPrimary },
          fixtures: builtAbutments.map((d) => d.fixture),
          allToothWorks: curAllToothWorks,
          overrides,
          alignedScans,
        };
        designedListRef.current = builtAbutments;

        setVisibleTeeth(nextVisibleTeeth);
        setAvailableJaws({ upper: upperScans.length > 0, lower: lowerScans.length > 0 });
        if (!viewerTouchRef.current.has("scanbodies")) {
          setShownScanbodies(
            viewerPrefsRef.current.showScanbodies
              ? Object.fromEntries(builtAbutments.map((d) => [d.toothNumber, true]))
              : {},
          );
        }
        if (!viewerTouchRef.current.has("crown")) {
          setShownPredictedCrowns(
            viewerPrefsRef.current.showPredictedCrown
              ? Object.fromEntries(builtAbutments.map((d) => [d.toothNumber, true]))
              : {},
          );
        }
        if (!viewerTouchRef.current.has("jaws")) {
          setVisibleJaws(
            pendingPickJobs.length > 0
              ? {
                  upper: upperScans.length > 0 && pickJaws.has("upper"),
                  lower: lowerScans.length > 0 && pickJaws.has("lower"),
                }
              : {
                  upper: upperScans.length > 0 && viewerPrefsRef.current.showUpper,
                  lower: lowerScans.length > 0 && viewerPrefsRef.current.showLower,
                },
          );
        }
        setDesignedList(builtAbutments);
        setRestoredFromCache(restored);
        const fromDesign = cached ? normalizeCustomAbutmentChat(cached.chat) : [];
        const restoredChat =
          chatApplyEpochRef.current === chatApplyEpoch
            ? pickCustomAbutmentChat(
                chatTurnsRef.current.filter((t) => !t.pending),
                savedChat,
                fromDesign,
              )
            : null;
        if (restoredChat) {
          setChatTurns(restoredChat);
          chatTurnsRef.current = restoredChat;
          if (restoredChat.length > savedChat.length) persistChat(restoredChat);
        }
        if (pendingPickJobs.length > 0) {
          pendingPickJobs.sort(
            (a, b) => toToothMemoSortNumber(a.toothNumber) - toToothMemoSortNumber(b.toothNumber),
          );
          scanbodyPickRef.current = {
            jobs: pendingPickJobs,
            connections: curConnections,
            busy: false,
          };
          setStatus({
            kind: "pick",
            toothNumber: pendingPickJobs[0]!.toothNumber,
            phase: "aim",
          });
        } else {
          setStatus({ kind: "ready" });
          const remoteNeedsPublish =
            !remote?.hasStl ||
            !remote?.design ||
            remote.design.version !== CUSTOM_ABUTMENT_DESIGN_VERSION ||
            remote.design.fitVersion !== CUSTOM_ABUTMENT_FIT_VERSION;
          if (
            builtAbutments.length > 0 &&
            Object.keys(candidateChoicesRef.current).length === 0 &&
            (remoteNeedsPublish || redesignedFromFit || (!restored && !serverMeshRestore))
          ) {
            persistDesign(restoredChat && restoredChat.length > 0 ? restoredChat : undefined);
          }
        }

        window.requestAnimationFrame(() => {
          const saved = readSavedView(transferIdParam);
          const cam = cameraRef.current;
          const controls = controlsRef.current;
          const remotePaintView = pendingRemotePaintRef.current?.view ?? null;
          if (saved && cam && controls) {
            applySavedView(cam, controls, saved);
          } else if (
            remotePaintView &&
            (pendingRemotePaintRef.current?.shapes?.length ?? 0) > 0 &&
            cam &&
            controls &&
            hostRef.current
          ) {
            cam.position.fromArray(remotePaintView.position);
            controls.target.fromArray(remotePaintView.target);
            cam.up.fromArray(remotePaintView.up);
            if (remotePaintView.span && remotePaintView.span > 0) {
              const aspect = readHostSize(hostRef.current).aspect;
              applyOrthoHeight(cam, remotePaintView.span / 2, aspect);
              cam.zoom = 1;
            }
            cam.lookAt(controls.target);
            cam.updateMatrixWorld();
            controls.syncFromCamera();
          } else {
            fitDefaultCamera();
          }
          if (
            pendingRemotePaintRef.current?.shapes?.length &&
            paintStateRef.current.paintRef.current
          ) {
            const shapes = pendingRemotePaintRef.current.shapes;
            paintStateRef.current.paintRef.current.replaceShapes(shapes, { silent: true });
            paintStateRef.current.setCount(shapes.length);
          }
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

    // 콜백 식별자가 바뀔 때마다 파이프라인을 다시 열면 스냅샷 GET이 무한 반복된다.
    // 조회는 의뢰 키가 바뀔 때만 한다. 같은 키의 재진입은 타이머를 지워 한 번만 남긴다.
    const timer = window.setTimeout(() => {
      if (!cancelled) void runPipeline();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      abort.abort();
      pickEpochRef.current += 1;
      scanbodyPickRef.current = null;
    };
  }, [
    authToken,
    filesPending,
    hostEl,
    isLabViewer,
    open,
    pipelineKey,
    readOnly,
    transferIdParam,
  ]);

  // 표시 옵션 동기화(스캔색, 스캔바디 가리기, 상·하악 투명도, 픽스쳐, 피니시라인, 악·치아 토글)
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
      const opacity =
        scanTransparency <= 0 ? 1 : Math.max(0.08, Math.min(1, 1 - scanTransparency / 100));

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
      const picked = selectedTeeth.includes(tooth);
      mat.emissive.setHex(picked ? (tooth === selectedTooth ? 0x332800 : 0x2a2200) : 0x000000);
    }
    for (const [tooth, mesh] of predictedCrownMeshesRef.current.entries()) {
      mesh.visible =
        shownPredictedCrowns[tooth] === true && visibleTeeth[tooth] !== false;
    }
    for (const [tooth, mesh] of fixtureMeshesRef.current.entries()) {
      mesh.visible = showFixtureAnalog && visibleTeeth[tooth] !== false;
    }
    for (const [tooth, line] of marginLinesRef.current.entries()) {
      line.visible = showFinishLine && visibleTeeth[tooth] !== false;
    }
    for (const [tooth, list] of ghostCandidateVisualsRef.current.entries()) {
      const shown = visibleTeeth[tooth] !== false;
      for (const g of list) {
        g.mesh.visible = shown;
        g.line.visible = showFinishLine && shown;
      }
    }
    for (const [tooth, picker] of candidatePickerObjRef.current.entries()) {
      picker.visible = visibleTeeth[tooth] !== false;
    }
  }, [
    colorMapping,
    designedList,
    shownScanbodies,
    scanTransparency,
    selectedTooth,
    selectedTeeth,
    showFinishLine,
    showFixtureAnalog,
    shownPredictedCrowns,
    visibleJaws,
    visibleTeeth,
  ]);

  /** 치아별 조정값을 바꿔 다시 디자인하고 씬·목록·저장본을 바꾼다. */
  const applyDesignChanges = useCallback(
    async (changes: readonly DesignChange[], mode: "merge" | "replace" | "proposal" = "merge") => {
      if (changes.length === 0) return;
      const run = async () => {
        const ctx = designContextRef.current;
        if (!ctx) return;
        const teeth = [...new Set(changes.map((c) => c.toothNumber))];
        activeRedesignCountRef.current += 1;
        setRedesigning((prev) => [...new Set([...prev, ...teeth])]);
        try {
          for (const tooth of teeth) {
            if (mode === "merge" && candidateChoicesRef.current[tooth]) {
              confirmCandidateForTooth(tooth, false);
            } else if (candidateChoicesRef.current[tooth]) {
              const prevChoice = candidateChoicesRef.current[tooth];
              const curActive = designedListRef.current.find((d) => d.toothNumber === tooth) ?? null;
              delete candidateChoicesRef.current[tooth];
              clearGhostCandidateVisuals(tooth);
              disposeOtherCandidateGeometries(prevChoice, curActive);
            }
            const prev = designedListRef.current.find((d) => d.toothNumber === tooth);
            if (!prev) continue;
            const jawGeo = ctx.jawGeometry[prev.jaw];
            if (!jawGeo) continue;
            const merged: Partial<CustomAbutmentDesignParams> =
              mode === "merge" ? { ...(ctx.overrides[tooth] ?? {}) } : {};
            const patch: Partial<CustomAbutmentDesignParams> = {};
            if (mode !== "proposal") {
              for (const change of changes) {
                if (change.toothNumber === tooth) Object.assign(patch, change.params);
              }
              Object.assign(merged, patch);
            }
            const liveGumball =
              directEditRef.current?.editOf(tooth) ?? savedGumballEditRef.current[tooth] ?? null;
            if (mode === "merge") {
              const kept = retainLiveGumballParams(
                merged,
                gumballParamBaseRef.current[tooth],
                liveGumball,
                patch,
              );
              if (kept.postWidthScale != null) merged.postWidthScale = kept.postWidthScale;
              if (kept.postHeightOffsetMm != null) merged.postHeightOffsetMm = kept.postHeightOffsetMm;
            }
            const proposal = proposalInputRef.current[tooth];
            const params =
              mode === "proposal"
                ? { ...(proposal ?? preferenceOverridesForTooth(tooth, preferenceRef.current)) }
                : { ...preferenceOverridesForTooth(tooth, preferenceRef.current), ...merged };
            await new Promise<void>((r) => window.setTimeout(r, 16));
            let next: DesignedCustomAbutment;
            if (mode === "replace" || mode === "proposal") {
              const nextCands = await designCustomAbutmentCandidates({
                fixture: prev.fixture,
                jawGeometry: jawGeo,
                opposingGeometry: ctx.jawGeometry[prev.jaw === "upper" ? "lower" : "upper"],
                neighbors: ctx.fixtures.filter((f) => f.jaw === prev.jaw),
                toothWorks: ctx.allToothWorks,
                params,
                explicitParams: mode === "proposal" ? {} : merged,
                logicRules: logicRulesRef.current,
                patientName: ctx.patientName,
              });
              next = nextCands[0]!.design;
              if (nextCands.length >= 2) {
                candidateChoicesRef.current[tooth] = {
                  candidates: nextCands,
                  selectedIndex: null,
                };
              }
            } else {
              next = await designCustomAbutmentStl({
                fixture: prev.fixture,
                jawGeometry: jawGeo,
                opposingGeometry: ctx.jawGeometry[prev.jaw === "upper" ? "lower" : "upper"],
                neighbors: ctx.fixtures.filter((f) => f.jaw === prev.jaw),
                toothWorks: ctx.allToothWorks,
                params,
                explicitParams: merged,
                logicRules: logicRulesRef.current,
                patientName: ctx.patientName,
              });
            }
            ctx.overrides[tooth] = mode === "proposal" ? {} : merged;
            if (mode === "replace" || mode === "proposal") {
              delete gumballMetricBaseRef.current[tooth];
              delete gumballParamBaseRef.current[tooth];
              delete savedGumballEditRef.current[tooth];
              directEditRef.current?.clear([tooth]);
            } else {
              gumballMetricBaseRef.current[tooth] = { ...next.metrics };
              gumballParamBaseRef.current[tooth] = { ...next.params };
              if (savedGumballEditRef.current[tooth]) {
                directEditRef.current?.setEdit(tooth, savedGumballEditRef.current[tooth]);
                delete savedGumballEditRef.current[tooth];
              }
              if (gumballPatchSetsPostHeight(patch)) {
                directEditRef.current?.clearBakedVertical([tooth]);
              }
            }
            removeDesignFromScene(tooth);
            prev.worldGeometry.dispose();
            prev.predictedCrownWorldGeometry.dispose();
            prev.enameloplastyWorldGeometry?.dispose();
            addDesignToScene(next);
            syncCandidateSceneForTooth(tooth);
            const list = designedListRef.current.map((d) => (d.toothNumber === tooth ? next : d));
            designedListRef.current = list;
            setDesignedList(list);
          }
          directEditRef.current?.sync();
        } finally {
          activeRedesignCountRef.current = Math.max(0, activeRedesignCountRef.current - 1);
          if (activeRedesignCountRef.current === 0) {
            setRedesigning([]);
          }
        }
      };
      const nextChain = designRunChainRef.current.then(run, run);
      designRunChainRef.current = nextChain;
      await nextChain;
    },
    [
      addDesignToScene,
      clearGhostCandidateVisuals,
      confirmCandidateForTooth,
      disposeOtherCandidateGeometries,
      removeDesignFromScene,
      syncCandidateSceneForTooth,
    ],
  );

  /** 저장본이 아니라 지금 조정값으로 형상을 다시 만든다. 대합거리(기본 1.5mm)를 1순위로 잡아 포스트 높이·테이퍼를 새로 결정한다. */
  const regenerateDesigns = useCallback(
    async (teeth?: readonly string[]) => {
      const ctx = designContextRef.current;
      const list = designedListRef.current;
      const targets = (teeth && teeth.length > 0 ? teeth : list.map((d) => d.toothNumber)).filter((tooth) =>
        list.some((d) => d.toothNumber === tooth),
      );
      if (!ctx || targets.length === 0) return;
      labGeometryTouchedRef.current = true;
      await applyDesignChanges(
        targets.map((toothNumber) => {
          const clean = stripDirectEditShiftOverrides(ctx.overrides[toothNumber] ?? {});
          delete clean.postHeightOffsetMm;
          delete clean.postWidthScale;
          if ((clean.postTaperLink ?? 1) >= 0.5) {
            delete clean.postTaperDeg;
          }
          editedInfoFieldsRef.current[toothNumber]?.delete("postHeightMm");
          return {
            toothNumber,
            params: clean,
          };
        }),
        "replace",
      );
      if (Object.keys(candidateChoicesRef.current).length === 0) {
        persistDesign();
      }
    },
    [applyDesignChanges, persistDesign],
  );

  // 단면 각이 어긋나 스캔바디 밖으로 나간 저장 형상을, 이 브라우저에서 한 번 정합 위치로 다시 만든다.
  const scanbodyRealignRef = useRef(false);
  useEffect(() => {
    if (scanbodyRealignRef.current || !open || !canEditDesign) return;
    if (designedList.length === 0 || redesigning.length > 0) return;
    const key = "abuts.customAbutment.realignScanbody.v65";
    try {
      if (window.localStorage.getItem(key)) {
        scanbodyRealignRef.current = true;
        return;
      }
      window.localStorage.setItem(key, "1");
    } catch {
      return;
    }
    scanbodyRealignRef.current = true;
    void regenerateDesigns();
  }, [open, canEditDesign, designedList.length, redesigning.length, regenerateDesigns]);

  // PTX 공유 채팅방 조회 (치과↔기공소 동일 대화 공유)
  useEffect(() => {
    const token = String(authToken || "").trim();
    if (!open || !transferIdParam || !token) {
      setPtxRoomId(null);
      return;
    }
    let cancelled = false;
    setPtxRoomLoading(true);
    void apiFetch<{ data?: { _id?: string } }>({
      path: `/api/chats/practice/transfer-room/${encodeURIComponent(transferIdParam)}`,
      method: "GET",
      token,
    })
      .then((res) => {
        if (cancelled) return;
        const roomId = String(res.data?.data?._id || "").trim();
        if (res.ok && roomId) setPtxRoomId(roomId);
      })
      .catch(() => {
        // 채팅방 미생성 시 무시
      })
      .finally(() => {
        if (!cancelled) setPtxRoomLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authToken, open, transferIdParam]);

  useEffect(() => {
    if (manualChatCollapsed) return;
    const el = sharedChatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [manualChatCollapsed, ptxMessages, manualChatOpen]);

  // 상대방이 3D 페인트를 갱신하면 실시간 반영
  useEffect(() => {
    if (!open || !transferIdParam) return;
    return onAppEvent((evt) => {
      if (evt.type !== "practice:custom-abutment-paint") return;
      const ev = evt.data as {
        transferId?: string;
        shapes?: PaintShape[];
        updatedBy?: string;
      } | null;
      if (!ev || ev.transferId !== transferIdParam || !Array.isArray(ev.shapes)) return;
      if (ev.updatedBy && ev.updatedBy === authUserIdRef.current) return;
      if (!paintStateRef.current.paintRef.current) return;
      paintStateRef.current.paintRef.current.replaceShapes(ev.shapes, { silent: true });
      paintStateRef.current.setCount(ev.shapes.length);
    });
  }, [open, transferIdParam]);

  useEffect(() => {
    return () => window.clearTimeout(paintSaveTimerRef.current);
  }, []);

  const captureCurrentPaintView = useCallback((): CustomAbutmentPaintView | null => {
    const cam = cameraRef.current;
    const controls = controlsRef.current;
    if (!cam || !controls) return null;
    const span = Math.abs((cam.top - cam.bottom) / Math.max(cam.zoom, 1e-6));
    return {
      position: cam.position.toArray() as [number, number, number],
      target: controls.target.toArray() as [number, number, number],
      up: cam.up.toArray() as [number, number, number],
      ...(Number.isFinite(span) && span > 0 ? { span } : {}),
    };
  }, []);

  const handlePaintCommit = useCallback(
    (shapes: PaintShape[]) => {
      if (readOnlyRef.current) return;
      const token = String(authToken || "").trim();
      const tid = transferIdRef.current;
      if (!token || !tid) return;
      window.clearTimeout(paintSaveTimerRef.current);
      paintSaveTimerRef.current = window.setTimeout(() => {
        void saveCustomAbutmentDesignPaintRemote(token, tid, {
          shapes,
          view: captureCurrentPaintView(),
        });
      }, 220);
    },
    [authToken, captureCurrentPaintView],
  );

  const saveViewImage = useCallback(() => {
    const renderer = rendererRef.current;
    const surface = paint.paintRef.current;
    if (!renderer || !surface) return;
    void surface.compositePng(renderer.domElement).then((blob) => {
      if (blob) downloadBlobFile(blob, paintNoteFileName(`커스텀어벗_${patientName || "디자인"}`));
    });
  }, [paint.paintRef, patientName]);

  const handleEditInfoField = useCallback(
    (
      item: DesignedCustomAbutment,
      field: AbutmentInfoFieldKey,
      nextValue: number | AbutmentAxisSource | { min: number; max: number },
    ) => {
      if (!canEditDesign) return;
      const targetNumbers = abutmentEditTargets(selectedTeethRef.current, item.toothNumber);
      const targets = designedListRef.current.filter((row) => targetNumbers.includes(row.toothNumber));
      if (targets.length === 0) return;
      const changes: DesignChange[] = [];
      let taperLinkLocal = field === "postTaperLink";
      for (const row of targets) {
        if (!baselineMetricsRef.current[row.toothNumber]) {
          baselineMetricsRef.current[row.toothNumber] = { ...row.metrics };
        }
        if (!baselineParamsRef.current[row.toothNumber]) {
          baselineParamsRef.current[row.toothNumber] = { ...row.params };
        }
        const patch = computeParamsFromInfoFieldEdit(row, field, nextValue);
        if (Object.keys(patch).length === 0) continue;
        if (field === "postTaperLink") {
          const nextLinked = (patch.postTaperLink ?? 1) >= 0.5;
          const targetDeg = patch.postTaperDeg ?? row.metrics.postTaperDeg;
          if (nextLinked && Math.abs(targetDeg - row.metrics.postTaperDeg) >= 0.05) taperLinkLocal = false;
        }
        changes.push({ toothNumber: row.toothNumber, params: patch });
      }
      if (changes.length === 0) return;
      labGeometryTouchedRef.current = true;

      if (taperLinkLocal) {
        const ctx = designContextRef.current;
        const byTooth = new Map(changes.map((change) => [change.toothNumber, change.params]));
        const list = designedListRef.current.map((row) => {
          const patch = byTooth.get(row.toothNumber);
          if (!patch) return row;
          if (ctx) ctx.overrides[row.toothNumber] = { ...(ctx.overrides[row.toothNumber] ?? {}), ...patch };
          return { ...row, params: { ...row.params, ...patch } };
        });
        designedListRef.current = list;
        setDesignedList(list);
        directEditRef.current?.sync();
        persistDesign();
        return;
      }

      for (const change of changes) {
        const row = targets.find((itemRow) => itemRow.toothNumber === change.toothNumber);
        if (!row) continue;
        let set = editedInfoFieldsRef.current[change.toothNumber];
        if (!set) {
          set = new Set();
          editedInfoFieldsRef.current[change.toothNumber] = set;
        }
        const linked = (row.params.postTaperLink ?? 1) >= 0.5;
        if (field === "occlusalClearanceMm") {
          set.delete("postHeightMm");
        } else if (field === "postHeightMm") {
          set.delete("occlusalClearanceMm");
        } else if (field === "postTaperDeg" && linked) {
          set.delete("occlusalClearanceMm");
          set.add("postHeightMm");
        }
        set.add(field);
      }
      if (field === "axisSource") {
        directEditRef.current?.clear(changes.map((change) => change.toothNumber));
      }
      void applyDesignChanges(changes).then(() => {
        persistDesign();
      });
    },
    [applyDesignChanges, canEditDesign, persistDesign],
  );

  const collectPendingInfoChanges = useCallback((): PendingInfoChange[] => {
    const out: PendingInfoChange[] = [];
    for (const d of designedListRef.current) {
      const fields = editedInfoFieldsRef.current[d.toothNumber];
      const baseM = baselineMetricsRef.current[d.toothNumber];
      if (!fields || fields.size === 0 || !baseM) continue;
      const p = d.params;
      const linked = (p.postTaperLink ?? 1) >= 0.5;
      for (const field of fields) {
        if (field === "postTaperLink") continue;
        if (field === "postTaperDeg" && linked) continue;
        if (!(field in ABUTMENT_INFO_FIELD_LABELS)) continue;
        const beforeText = formatAbutmentInfoFieldValue(baseM, field);
        const afterText = formatAbutmentInfoFieldValue(d.metrics, field);
        if (beforeText === afterText) continue;
        // 사면 해제는 이번 케이스만 — 다음 케이스 기본값 모달에는 넣지 않는다.
        if (field === "postLingualBevelMm" || field === "postLabialBevelMm") {
          const afterMm =
            field === "postLingualBevelMm"
              ? d.metrics.postLingualBevelMm
              : d.metrics.postLabialBevelMm;
          if (afterMm == null || afterMm <= 0) continue;
        }
        let params: Partial<CustomAbutmentDesignParams> = {};
        switch (field) {
          case "marginSubgMm":
            params = {
              marginSubgMinMm: p.marginSubgMinMm,
              marginSubgMaxMm: p.marginSubgMaxMm,
              marginDepthMm: p.marginSubgMinMm,
            };
            break;
          case "maxDiameterMm":
            params = { marginSizeScale: p.marginSizeScale };
            break;
          case "postHeightMm":
            params = { postHeightOffsetMm: p.postHeightOffsetMm };
            break;
          case "postTaperDeg":
            params = { postTaperDeg: p.postTaperDeg };
            break;
          case "postLingualBevelMm":
            params = { postLingualBevelMm: p.postLingualBevelMm };
            break;
          case "postLabialBevelMm":
            params = { postLabialBevelMm: p.postLabialBevelMm };
            break;
          case "axisSource":
            params = { axisSourceCode: p.axisSourceCode, axisToOpposing: p.axisToOpposing };
            break;
          case "occlusalClearanceMm":
            params = { occlusalClearanceMm: p.occlusalClearanceMm, postHeightOffsetMm: 0 };
            break;
          case "marginFilletRadiusMm":
            params = { marginFilletRadiusMm: p.marginFilletRadiusMm };
            break;
          default:
            continue;
        }
        out.push({
          id: `${d.toothNumber}:${field}`,
          toothNumber: d.toothNumber,
          field,
          label: ABUTMENT_INFO_FIELD_LABELS[field],
          beforeText,
          afterText,
          params,
        });
      }
    }
    return out;
  }, []);

  const snapshotGenerationEdits = useCallback(() => {
    const rows = collectGenerationEditRows({
      teeth: designedListRef.current.map((row) => ({
        toothNumber: row.toothNumber,
        params: row.params,
      })),
      baselineParams: baselineParamsRef.current,
      gumball: (directEditRef.current?.listEdits() ?? []).map((row) => ({
        tooth: row.tooth,
        edit: {
          tiltLabialDeg: row.edit.tiltLabialDeg,
          tiltMesialDeg: row.edit.tiltMesialDeg,
          shiftLabialMm: row.edit.shiftLabialMm,
          shiftMesialMm: row.edit.shiftMesialMm,
          yawDeg: row.edit.yawDeg,
        },
      })),
    });
    const byTooth = new Map(rows.map((row) => [row.toothNumber, row.deltas]));
    return designedListRef.current.map((row) => ({
      toothNumber: row.toothNumber,
      deltas: byTooth.get(row.toothNumber) ?? [],
    }));
  }, []);

  const reportGenerationEdits = useCallback(
    (action: "confirm" | "manual", teeth: ReturnType<typeof collectGenerationEditRows>) => {
      const token = String(authToken || "").trim();
      const tid = transferIdRef.current;
      if (!token || !tid || teeth.length === 0) return;
      void apiFetch({
        path: "/api/ai/custom-abutment-design-edits",
        method: "POST",
        token,
        jsonBody: {
          transferId: tid,
          action,
          patientName: patientName || "",
          teeth,
        },
      }).catch((err) => console.warn("[custom-abutment] generation edit record failed", err));
    },
    [authToken, patientName],
  );

  const executeConfirmAndOrder = useCallback(
    async (selectedPrefChanges: readonly PendingInfoChange[]) => {
      for (const tooth of Object.keys(candidateChoicesRef.current)) {
        confirmCandidateForTooth(tooth, false);
      }
      const token = String(authToken || "").trim();
      const tid = transferIdRef.current;
      const list = designedListRef.current;
      const ctx = designContextRef.current;
      if (!token || !tid || list.length === 0) return;
      const generationEdits = snapshotGenerationEdits();

      setActionBusy("confirm");
      try {
        if (selectedPrefChanges.length > 0) {
          const mergedParams: Partial<CustomAbutmentDesignParams> = {};
          const notes: string[] = [];
          for (const ch of selectedPrefChanges) {
            Object.assign(mergedParams, ch.params);
            notes.push(`${ch.label} ${ch.beforeText}→${ch.afterText}`);
          }
          const noteText = notes.join(", ").slice(0, 110);
          const localSaved = writeUserEditPreference(
            authUserIdRef.current,
            "all",
            mergedParams,
            noteText,
          );
          if (localSaved) {
            preferenceRef.current = mergeEditPreference(preferenceRef.current, localSaved);
          }
          void apiFetch({
            path: "/api/ai/custom-abutment-design-preference",
            method: "PUT",
            token,
            jsonBody: {
              transferId: tid,
              scope: "all",
              params: mergedParams,
              note: noteText,
            },
          }).catch((err) => console.warn("[custom-abutment] preference save failed", err));
        }

        const res = await confirmCustomAbutmentDesignRemote(token, tid, {
          patientName: patientName || ctx?.patientName || "",
          version: CUSTOM_ABUTMENT_DESIGN_VERSION,
          fitVersion: CUSTOM_ABUTMENT_FIT_VERSION,
          teeth: list.map((d) => ({
            toothNumber: d.toothNumber,
            fileName: d.fileName,
            fixture: d.fixture,
            overrides: ctx?.overrides[d.toothNumber] ?? {},
            params: d.params,
            metrics: d.metrics,
            stlBlob: d.stlBlob,
            crownLocalPositions: d.crownLocalPositions,
            marginLoopLocal: d.marginLoopLocal,
            ...(d.enameloplastyLocalPositions?.length
              ? { enameloplastyLocalPositions: d.enameloplastyLocalPositions }
              : {}),
          })),
        });

        if (!res.ok) {
          toast({
            title: "디자인 확정 실패",
            description: res.message || "잠시 후 다시 시도해 주세요.",
            variant: "destructive",
          });
          return;
        }

        setConfirmPrefDialogOpen(false);
        if (res.cancelDeadlineAt) setCancelDeadlineAt(res.cancelDeadlineAt);
        setRemoteMode("confirmed");
        reportGenerationEdits("confirm", generationEdits);
        toast({
          title: "디자인 확정",
          description: "수행 기공소가 검토·수정한 뒤 제조에 넘깁니다.",
        });
        onActionComplete?.("confirmed");
      } catch (err) {
        toast({
          title: "디자인 확정 실패",
          description: err instanceof Error ? err.message : "잠시 후 다시 시도해 주세요.",
          variant: "destructive",
        });
      } finally {
        setActionBusy(null);
      }
    },
    [
      authToken,
      confirmCandidateForTooth,
      onActionComplete,
      patientName,
      reportGenerationEdits,
      snapshotGenerationEdits,
      toast,
    ],
  );

  const handleLabDesignConfirm = useCallback(async () => {
    if (!authToken || !transferIdParam || actionBusy || labCheckedAt) return;
    const token = String(authToken || "").trim();
    const tid = transferIdRef.current || transferIdParam;
    const list = designedListRef.current;
    const ctx = designContextRef.current;
    if (!token || !tid) return;

    setActionBusy("confirm");
    try {
      for (const tooth of Object.keys(candidateChoicesRef.current)) {
        confirmCandidateForTooth(tooth, false);
      }
      if (list.length > 0) {
        const generationEdits = snapshotGenerationEdits();
        const sources = labSourceStlRef.current;
        const reuseExisting =
          !labGeometryTouchedRef.current &&
          list.every((d) => Boolean(sources[d.toothNumber]?.s3Key));
        const res = await confirmCustomAbutmentDesignRemote(token, tid, {
          patientName: patientName || ctx?.patientName || "",
          version: CUSTOM_ABUTMENT_DESIGN_VERSION,
          fitVersion: CUSTOM_ABUTMENT_FIT_VERSION,
          ...(reuseExisting ? { existingS3: sources } : {}),
          teeth: list.map((d) => ({
            toothNumber: d.toothNumber,
            fileName: d.fileName,
            fixture: d.fixture,
            overrides: ctx?.overrides[d.toothNumber] ?? {},
            params: d.params,
            metrics: d.metrics,
            stlBlob: d.stlBlob,
            crownLocalPositions: d.crownLocalPositions,
            marginLoopLocal: d.marginLoopLocal,
            ...(d.enameloplastyLocalPositions?.length
              ? { enameloplastyLocalPositions: d.enameloplastyLocalPositions }
              : {}),
          })),
        });
        if (!res.ok) {
          toast({
            title: "디자인 확정 실패",
            description: res.message || "잠시 후 다시 시도해 주세요.",
            variant: "destructive",
          });
          return;
        }
        if (res.cancelDeadlineAt) setCancelDeadlineAt(res.cancelDeadlineAt);
        setRemoteMode("confirmed");
        reportGenerationEdits("confirm", generationEdits);
      }

      const checkRes = await apiFetch<{ success?: boolean; message?: string }>({
        path: `/api/practice/transfers/${encodeURIComponent(tid)}/confirm-abutment-design`,
        method: "POST",
        token,
      });
      const checkBody =
        checkRes.data && typeof checkRes.data === "object"
          ? (checkRes.data as { message?: string })
          : {};
      if (!checkRes.ok) {
        toast({
          title: "디자인 확정 실패",
          description: String(
            checkBody.message || "제조 의뢰로 넘기지 못했습니다.",
          ),
          variant: "destructive",
        });
        return;
      }

      setLabCheckedAt(new Date().toISOString());
      toast({
        title: "디자인 확정",
        description: "제조사에 실물 어벗 생산을 의뢰했습니다.",
      });
      onActionComplete?.("checked", { body: checkRes.data });
      handleOpenChange(false);
    } catch (err) {
      toast({
        title: "디자인 확정 실패",
        description: err instanceof Error ? err.message : "잠시 후 다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      setActionBusy(null);
    }
  }, [
    actionBusy,
    authToken,
    confirmCandidateForTooth,
    handleOpenChange,
    labCheckedAt,
    onActionComplete,
    patientName,
    reportGenerationEdits,
    snapshotGenerationEdits,
    toast,
    transferIdParam,
  ]);

  const handlePracticeDesignConfirmCancel = useCallback(async () => {
    if (isLabViewer || !canChooseAbutmentRoute || remoteMode !== "confirmed") return;
    if (!authToken || !transferIdParam || actionBusy) return;
    if (labCheckedAt) return;
    const deadlineMs = cancelDeadlineAt
      ? new Date(cancelDeadlineAt).getTime()
      : Number.NaN;
    if (cancelDeadlineAt && Number.isFinite(deadlineMs) && deadlineMs <= Date.now()) {
      toast({
        title: "취소할 수 없습니다",
        description: "확정 후 취소 기한이 지났습니다.",
        variant: "destructive",
      });
      return;
    }

    const token = String(authToken || "").trim();
    const tid = transferIdRef.current || transferIdParam;
    setActionBusy("cancel");
    try {
      const res = await apiFetch<{
        success?: boolean;
        message?: string;
        code?: string;
      }>({
        path: `/api/practice/transfers/${encodeURIComponent(tid)}/custom-abutment-process/cancel`,
        method: "POST",
        token,
      });
      const body =
        res.data && typeof res.data === "object"
          ? (res.data as { message?: string; code?: string })
          : {};
      if (!res.ok) {
        toast({
          title: "디자인 확정 취소 실패",
          description:
            String(body.message || "").trim() ||
            "디자인 확정을 취소하는 중 오류가 발생했습니다.",
          variant: "destructive",
        });
        return;
      }

      setRemoteMode(null);
      setCancelDeadlineAt(null);
      setLabCheckedAt(null);
      toast({
        title: "디자인 확정 해제",
        description:
          String(body.message || "").trim() ||
          "디자인 확정을 해제했습니다. 다시 확정할 수 있습니다.",
      });
      onActionComplete?.("cancelled");
    } catch (err) {
      toast({
        title: "디자인 확정 취소 실패",
        description:
          err instanceof Error
            ? err.message
            : "디자인 확정을 취소하는 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setActionBusy(null);
    }
  }, [
    actionBusy,
    authToken,
    cancelDeadlineAt,
    canChooseAbutmentRoute,
    isLabViewer,
    labCheckedAt,
    onActionComplete,
    remoteMode,
    toast,
    transferIdParam,
  ]);

  const handleClickConfirmAndOrder = useCallback(() => {
    if (actionBusy || designedListRef.current.length === 0) return;
    if (isLabViewer) {
      void handleLabDesignConfirm();
      return;
    }
    if (
      routeCostPassedRef.current !== "confirm" &&
      !routeCostDismissed(authUserIdRef.current)
    ) {
      setRouteCostAction("confirm");
      setRouteCostHideNext(false);
      setRouteCostOpen(true);
      return;
    }
    routeCostPassedRef.current = null;
    for (const tooth of Object.keys(candidateChoicesRef.current)) {
      confirmCandidateForTooth(tooth, false);
    }
    const changes = collectPendingInfoChanges();
    if (changes.length > 0) {
      setConfirmPrefChanges(changes);
      setCheckedChangeIds(new Set(changes.map((c) => c.id)));
      setConfirmPrefDialogOpen(true);
      return;
    }
    void executeConfirmAndOrder([]);
  }, [
    actionBusy,
    collectPendingInfoChanges,
    confirmCandidateForTooth,
    executeConfirmAndOrder,
    handleLabDesignConfirm,
    isLabViewer,
  ]);

  const sendTextToSharedChat = useCallback(
    async (rawText: string): Promise<boolean> => {
      const text = rawText.trim();
      const token = String(authToken || "").trim();
      const tid = transferIdRef.current;
      if (!text || !token || !tid) return false;
      if (ptxRoomId) {
        const sent = await sendPtxChatMessage(text, []);
        return Boolean(sent);
      }
      const roomRes = await apiFetch<{ data?: { _id?: string } }>({
        path: `/api/chats/practice/transfer-room/${encodeURIComponent(tid)}`,
        method: "GET",
        token,
      });
      const resolvedRoomId = String(roomRes.data?.data?._id || "").trim();
      if (!roomRes.ok || !resolvedRoomId) return false;
      setPtxRoomId(resolvedRoomId);
      const msgRes = await apiFetch({
        path: `/api/chats/rooms/${resolvedRoomId}/messages`,
        method: "POST",
        token,
        jsonBody: { content: text, attachments: [] },
      });
      return msgRes.ok;
    },
    [authToken, ptxRoomId, sendPtxChatMessage],
  );

  const handleSendSharedChat = useCallback(async () => {
    const text = sharedChatDraft.trim();
    if (!text || sharedChatSending) return;
    setSharedChatSending(true);
    setSharedChatDraft("");
    try {
      const ok = await sendTextToSharedChat(text);
      if (!ok) {
        setSharedChatDraft(text);
        toast({
          title: "메시지 전송 실패",
          description: "잠시 후 다시 시도해 주세요.",
          variant: "destructive",
        });
        return;
      }
      if (canEditDesign && transferIdRef.current) {
        persistDesign();
      }
    } finally {
      setSharedChatSending(false);
    }
  }, [canEditDesign, persistDesign, sendTextToSharedChat, sharedChatDraft, sharedChatSending, toast]);

  const handleClickManualDesign = useCallback(async () => {
    if (actionBusy) return;
    if (
      routeCostPassedRef.current !== "manual" &&
      !routeCostDismissed(authUserIdRef.current)
    ) {
      setRouteCostAction("manual");
      setRouteCostHideNext(false);
      setRouteCostOpen(true);
      return;
    }
    routeCostPassedRef.current = null;
    if (!manualChatOpen || manualChatCollapsed) {
      viewerTouchRef.current.add("chat");
      viewerPrefsRef.current = { ...viewerPrefsRef.current, chatOpen: true };
      setManualChatOpen(true);
      setManualChatCollapsed(false);
      paint.setPaintOn(true);
      persistDesign();
      window.requestAnimationFrame(() => sharedChatInputRef.current?.focus());
      return;
    }

    const token = String(authToken || "").trim();
    const tid = transferIdRef.current;
    if (!token || !tid) return;
    const generationEdits = snapshotGenerationEdits();

    setActionBusy("manual");
    try {
      const draftText = sharedChatDraft.trim();
      let chatSentDirectly = false;
      if (draftText) {
        chatSentDirectly = await sendTextToSharedChat(draftText);
        if (chatSentDirectly) setSharedChatDraft("");
      }

      const list = designedListRef.current;
      const ctx = designContextRef.current;
      const shapes = paint.paintRef.current?.getShapes() ?? [];
      const res = await requestManualCustomAbutmentDesignRemote(token, tid, {
        message: draftText || undefined,
        chatSentDirectly,
        version: CUSTOM_ABUTMENT_DESIGN_VERSION,
        fitVersion: CUSTOM_ABUTMENT_FIT_VERSION,
        teeth: list.map((d) => ({
          toothNumber: d.toothNumber,
          fileName: d.fileName,
          fixture: d.fixture,
          overrides: ctx?.overrides[d.toothNumber] ?? {},
          params: d.params,
          metrics: d.metrics,
          stlBlob: d.stlBlob,
          crownLocalPositions: d.crownLocalPositions,
          marginLoopLocal: d.marginLoopLocal,
          ...(d.enameloplastyLocalPositions?.length
            ? { enameloplastyLocalPositions: d.enameloplastyLocalPositions }
            : {}),
        })),
        paint: {
          shapes,
          view: captureCurrentPaintView(),
        },
      });

      if (!res.ok) {
        toast({
          title: "수작업 의뢰 실패",
          description: res.message || "잠시 후 다시 시도해 주세요.",
          variant: "destructive",
        });
        return;
      }

      setRemoteMode("manual");
      reportGenerationEdits("manual", generationEdits);
      toast({
        title: "수작업 의뢰 전달 완료",
        description: "디자인 프리뷰·페인트·전달 내용이 기공소와 공유되었습니다.",
      });
      onActionComplete?.("manual");
      handleOpenChange(false);
    } catch (err) {
      toast({
        title: "수작업 의뢰 실패",
        description: err instanceof Error ? err.message : "잠시 후 다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      setActionBusy(null);
    }
  }, [
    actionBusy,
    authToken,
    captureCurrentPaintView,
    handleOpenChange,
    manualChatCollapsed,
    manualChatOpen,
    onActionComplete,
    paint,
    persistDesign,
    reportGenerationEdits,
    sendTextToSharedChat,
    sharedChatDraft,
    snapshotGenerationEdits,
    toast,
  ]);

  const proceedRouteCost = useCallback(() => {
    if (routeCostHideNext) rememberRouteCostDismissed(authUserIdRef.current);
    const action = routeCostAction;
    setRouteCostOpen(false);
    routeCostPassedRef.current = action;
    if (action === "confirm") handleClickConfirmAndOrder();
    else void handleClickManualDesign();
  }, [handleClickConfirmAndOrder, handleClickManualDesign, routeCostAction, routeCostHideNext]);

  const touchViewer = (key: string) => {
    viewerTouchRef.current.add(key);
  };

  useEffect(() => {
    if (!open) {
      viewerTouchRef.current = new Set();
      viewerSavedRef.current = "";
      setViewerHydrated(false);
      return;
    }
    const token = String(authToken || "").trim();
    if (!token) {
      setViewerHydrated(true);
      return;
    }
    let cancel = false;
    void loadCustomAbutmentViewerPrefs(token)
      .then((prefs) => {
        if (cancel) return;
        viewerPrefsRef.current = prefs;
        const touch = viewerTouchRef.current;
        if (!touch.has("color")) setColorMapping(prefs.colorMapping);
        if (!touch.has("guide")) setCenterGuide(prefs.centerGuide);
        if (!touch.has("transparency")) setScanTransparency(prefs.scanTransparency);
        if (!touch.has("margin")) setShowFinishLine(prefs.showFinishLine);
        if (!touch.has("fixture")) setShowFixtureAnalog(prefs.showFixtureAnalog);
        if (!touch.has("gumball")) setGumballOn(prefs.gumballOn);
        if (!touch.has("chat") && prefs.chatOpen != null) {
          setManualChatOpen(true);
          setManualChatCollapsed(prefs.chatOpen === false);
        }
        if (!touch.has("jaws")) {
          setVisibleJaws({ upper: prefs.showUpper, lower: prefs.showLower });
        }
        if (!touch.has("scanbodies") && designedListRef.current.length > 0) {
          setShownScanbodies(
            Object.fromEntries(
              designedListRef.current.map((d) => [d.toothNumber, prefs.showScanbodies]),
            ),
          );
        }
        if (!touch.has("crown") && designedListRef.current.length > 0) {
          setShownPredictedCrowns(
            Object.fromEntries(
              designedListRef.current.map((d) => [d.toothNumber, prefs.showPredictedCrown]),
            ),
          );
        }
        setViewerHydrated(true);
      })
      .catch(() => {
        if (!cancel) setViewerHydrated(true);
      });
    return () => {
      cancel = true;
    };
  }, [authToken, open]);

  useEffect(() => {
    if (!open || !viewerHydrated || designedList.length === 0) return;
    setExpandedTeeth((prev) => {
      const next = { ...prev };
      let changed = false;
      const touched = viewerTouchRef.current.has("expanded");
      for (const d of designedList) {
        const saved = viewerPrefsRef.current.expandedTeeth[d.toothNumber];
        if (!touched && saved !== undefined && next[d.toothNumber] !== saved) {
          next[d.toothNumber] = saved;
          changed = true;
          continue;
        }
        if (next[d.toothNumber] === undefined) {
          next[d.toothNumber] = saved ?? viewerPrefsRef.current.infoExpanded;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [designedList, open, viewerHydrated]);

  useEffect(() => {
    if (!open || !viewerHydrated) return;
    const token = String(authToken || "").trim();
    if (!token) return;
    const touch = viewerTouchRef.current;
    const infoExpanded =
      designedList.length > 0
        ? designedList.every((d) => expandedTeeth[d.toothNumber] !== false)
        : viewerPrefsRef.current.infoExpanded;
    const prefs: CustomAbutmentViewerPrefs = {
      colorMapping,
      centerGuide,
      scanTransparency,
      showUpper: touch.has("jaws") ? visibleJaws.upper : viewerPrefsRef.current.showUpper,
      showLower: touch.has("jaws") ? visibleJaws.lower : viewerPrefsRef.current.showLower,
      showScanbodies: viewerPrefsRef.current.showScanbodies,
      showPredictedCrown: viewerPrefsRef.current.showPredictedCrown,
      showFinishLine,
      showFixtureAnalog,
      gumballOn,
      chatOpen:
        touch.has("chat") || viewerPrefsRef.current.chatOpen != null
          ? !manualChatCollapsed
          : null,
      infoExpanded,
      expandedTeeth: { ...viewerPrefsRef.current.expandedTeeth, ...expandedTeeth },
    };
    const key = JSON.stringify(prefs);
    if (key === viewerSavedRef.current) {
      viewerPrefsRef.current = prefs;
      return;
    }
    const timer = window.setTimeout(() => {
      viewerSavedRef.current = key;
      viewerPrefsRef.current = prefs;
      void saveCustomAbutmentViewerPrefs(token, prefs).catch((err) =>
        console.warn("[custom-abutment] viewer prefs save failed", err),
      );
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    authToken,
    centerGuide,
    colorMapping,
    designedList,
    expandedTeeth,
    gumballOn,
    manualChatCollapsed,
    manualChatOpen,
    open,
    scanTransparency,
    showFinishLine,
    showFixtureAnalog,
    shownPredictedCrowns,
    shownScanbodies,
    viewerHydrated,
    visibleJaws.lower,
    visibleJaws.upper,
  ]);

  const ready = status.kind === "ready" && (designedList.length > 0 || readOnly);
  const crownFormat = crownDownloadFormat(designSoftware);
  const canUndoEdit = editRev >= 0 && Boolean(directEditRef.current?.canUndo());
  const canRedoEdit = editRev >= 0 && Boolean(directEditRef.current?.canRedo());
  const hasInfoFieldEdits = designedList.some(
    (d) => (editedInfoFieldsRef.current[d.toothNumber]?.size ?? 0) > 0,
  );
  const canResetAny = canUndoEdit || hasInfoFieldEdits;
  const viewerLive = ready || status.kind === "pick";

  useEffect(() => {
    if (!open || !canEditDesign) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const action = matchDesignKey(getDesignControls().keys, event);
      if (action !== "undo" && action !== "redo") return;
      event.preventDefault();
      const session = directEditRef.current;
      if (!session) return;
      if (action === "undo" && session.canUndo()) session.undo();
      else if (action === "redo" && session.canRedo()) session.redo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEditDesign, open]);

  const handleResetToInitial = useCallback(() => {
    const ctx = designContextRef.current;
    if (!ctx) return;
    const targets =
      selectedTeeth.length > 0
        ? selectedTeeth
        : designedListRef.current.map((d) => d.toothNumber);
    ignoreEditCommitRef.current = true;
    labGeometryTouchedRef.current = true;
    const previousList = designedListRef.current;
    const list = previousList.map((d) => {
      if (!targets.includes(d.toothNumber)) return d;
      const base = baselineMetricsRef.current[d.toothNumber];
      return base ? { ...d, metrics: { ...base } } : d;
    });
    designedListRef.current = list;
    setDesignedList(list);
    void applyDesignChanges(
      targets.map((toothNumber) => ({ toothNumber, params: {} })),
      "proposal",
    )
      .then(() => {
        for (const t of targets) editedInfoFieldsRef.current[t]?.clear();
        persistDesign();
      })
      .catch(() => {
        designedListRef.current = previousList;
        setDesignedList(previousList);
      })
      .finally(() => {
        ignoreEditCommitRef.current = false;
      });
  }, [applyDesignChanges, persistDesign, selectedTeeth]);

  const crownDownloadLockRef = useRef(false);
  const downloadCrownWorkScans = useCallback(async () => {
    if (crownDownloadLockRef.current) return;
    const token = String(authToken || "").trim();
    if (!token) {
      toast({ title: "로그인이 필요합니다." });
      return;
    }
    if (designedListRef.current.length === 0) return;
    crownDownloadLockRef.current = true;
    setCrownDownloadBusy(true);
    const format = crownDownloadFormat(designSoftware);
    const temps: THREE.Mesh[] = [];
    try {
      const jawMeshes = (jaw: "upper" | "lower") => {
        const key = jaw === "upper" ? "upperTrimmed" : "lowerTrimmed";
        const parts: THREE.Mesh[] = [...jawMeshesRef.current[key]];
        for (const design of designedListRef.current) {
          if (design.jaw !== jaw) continue;
          const mesh = abutmentMeshesRef.current.get(design.toothNumber);
          if (mesh) {
            parts.push(mesh);
            continue;
          }
          const temp = new THREE.Mesh(
            design.worldGeometry,
            new THREE.MeshStandardMaterial({ color: 0xd4c59e }),
          );
          temps.push(temp);
          parts.push(temp);
        }
        return parts;
      };
      const packed: Array<{ name: string; blob: Blob }> = [];
      const upper = meshesToLabMeshData(jawMeshes("upper"));
      const lower = meshesToLabMeshData(jawMeshes("lower"));
      if (upper) packed.push({ name: `${crownScanStem(patientName, "상악")}.${format}`, blob: encodeLabMeshData(upper, format) });
      if (lower) packed.push({ name: `${crownScanStem(patientName, "하악")}.${format}`, blob: encodeLabMeshData(lower, format) });

      const usingWorkScans = workScanFiles.some((file) => isOralScanMeshName(file.fileName));
      const biteItems = scanSources.meshes.filter((file) => {
        if (!file.s3Key) return false;
        const role = resolveOralScanRole({
          fileName: file.fileName,
          scanRole: file.scanRole ?? undefined,
        });
        if (role !== "bite") return false;
        if (usingWorkScans && !isAbutsWorkScanFileName(file.fileName)) return false;
        return true;
      });
      let biteMissing = false;
      if (biteItems.length > 0) {
        const loaded = await Promise.all(
          biteItems.map(async (item) => {
            try {
              return await loadExportScanMesh(item, token, scanSources.companions);
            } catch (err) {
              console.warn("[custom-abutment] bite scan export failed", err);
              return null;
            }
          }),
        );
        const bites = loaded.filter((mesh): mesh is THREE.Mesh => Boolean(mesh));
        try {
          const bite = meshesToLabMeshData(bites);
          if (!bite) biteMissing = true;
          else {
            packed.push({
              name: `${crownScanStem(patientName, "바이트")}.${format}`,
              blob: encodeLabMeshData(bite, format),
            });
          }
        } finally {
          for (const mesh of bites) disposeExportMesh(mesh);
        }
      }
      if (packed.length === 0) {
        toast({ title: "받을 스캔이 없습니다." });
        return;
      }
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const file of packed) zip.file(file.name, file.blob);
      const blob = await zip.generateAsync({ type: "blob" });
      saveBlobAsDownload(blob, `${crownScanStem(patientName, "크라운작업")}.zip`);
      if (biteMissing) toast({ title: "바이트 스캔을 넣지 못했습니다." });
    } catch (err) {
      console.warn("[custom-abutment] crown scan export failed", err);
      toast({ title: "크라운 작업 스캔을 만들지 못했습니다." });
    } finally {
      for (const mesh of temps) (mesh.material as THREE.Material).dispose();
      crownDownloadLockRef.current = false;
      setCrownDownloadBusy(false);
    }
  }, [authToken, designSoftware, patientName, scanSources.companions, scanSources.meshes, toast, workScanFiles]);

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "inset-0 left-0 top-0 z-[480] flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0",
          "sm:inset-0 sm:left-0 sm:top-0 sm:h-[100dvh] sm:max-h-[100dvh] sm:w-screen sm:max-w-none sm:translate-x-0 sm:translate-y-0 sm:rounded-none sm:p-0",
          "duration-0 data-[state=open]:animate-none data-[state=closed]:animate-none",
        )}
        overlayClassName="z-[475]"
        hideClose
        onContextMenu={(e) => e.preventDefault()}
      >
        <DialogHeader className="relative shrink-0 flex-row items-center justify-between gap-3 space-y-0 border-b bg-white/95 py-2.5 pl-5 pr-14 text-left">
          <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
            <DialogTitle className="shrink-0 text-base sm:text-lg">
              커스텀어벗 디자인
            </DialogTitle>
            {reviewItems.length > 0 ? (
              <PracticeAbutmentDesignReviewRail
                items={reviewItems.map((item, index) =>
                  index === reviewIndex && caseTitle
                    ? { ...item, label: caseTitle }
                    : item,
                )}
                index={reviewIndex}
                onIndexChange={(next) => onReviewIndexChange?.(next)}
              />
            ) : caseTitle ? (
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
            {remoteMode === "confirmed" ? (
              <span className="hidden shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[0.6875rem] font-medium text-primary sm:inline">
                확정됨
              </span>
            ) : remoteMode === "manual" ? (
              <span className="hidden shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[0.6875rem] font-medium text-amber-900 sm:inline">
                수작업 의뢰
              </span>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {ready && canEditDesign ? (
              <>
                <HeaderIconButton
                  label="검볼"
                  active={gumballOn && !paint.paintOn}
                  tip={
                    <>
                      화살표는 이동, 우상 점은 축·평면 크기입니다.
                      <br />
                      좌하 파란 호는 회전입니다.
                      <br />
                      커넥션과 2° 테이퍼는 고정이고, 커프부터 바뀝니다.
                    </>
                  }
                  onClick={() => {
                    touchViewer("gumball");
                    if (paint.paintOn) paint.setPaintOn(false);
                    setGumballOn((on) => {
                      viewerPrefsRef.current = { ...viewerPrefsRef.current, gumballOn: !on };
                      return !on;
                    });
                  }}
                >
                  <Axis3d className="h-4 w-4" />
                </HeaderIconButton>
                <HeaderIconButton
                  label="되돌리기"
                  tip={
                    <>
                      직전 변형을 되돌립니다.
                      <br />
                      Ctrl+Z 단축키와 같습니다.
                    </>
                  }
                  disabled={!canUndoEdit}
                  onClick={() => directEditRef.current?.undo()}
                >
                  <Undo2 className="h-4 w-4" />
                </HeaderIconButton>
                <HeaderIconButton
                  label="다시실행"
                  tip={
                    <>
                      되돌린 변형을 다시 적용합니다.
                      <br />
                      Ctrl+Y 단축키와 같습니다.
                    </>
                  }
                  disabled={!canRedoEdit}
                  onClick={() => directEditRef.current?.redo()}
                >
                  <Redo2 className="h-4 w-4" />
                </HeaderIconButton>
                <HeaderIconButton
                  label="초기값"
                  tip={
                    <>
                      선택한 어벗을 처음 계산한 형상으로 되돌립니다.
                      <br />
                      선택된 치아가 없으면 바꾼 어벗을 모두 되돌립니다.
                    </>
                  }
                  disabled={!canResetAny || redesigning.length > 0}
                  onClick={handleResetToInitial}
                >
                  <RotateCcw className="h-4 w-4" />
                </HeaderIconButton>
              </>
            ) : null}
            {viewerLive && !readOnly ? (
              <HeaderIconButton
                label="페인트"
                active={paint.paintOn}
                tip={
                  <>
                    3D 모델 위에 표시를 남기고 기공소와 공유합니다.
                    <br />
                    왼쪽 드래그는 그리기, 오른쪽 드래그는 화면 회전입니다.
                  </>
                }
                onClick={() => paint.setPaintOn((on) => !on)}
              >
                <div className="relative flex items-center justify-center">
                  <Paintbrush className="h-4 w-4" />
                  {!paint.paintOn && paint.count > 0 ? (
                    <span className="absolute -right-2 -top-2 rounded-full bg-primary px-1 text-[0.625rem] font-semibold leading-3.5 text-primary-foreground">
                      {paint.count}
                    </span>
                  ) : null}
                </div>
              </HeaderIconButton>
            ) : null}
            <HeaderIconButton
              label="크라운 스캔"
              disabled={crownDownloadBusy || designedList.length === 0 || redesigning.length > 0}
              tip={
                <>
                  스크류홀이 열린 어벗을 악궁에 넣어 받습니다.
                  <br />
                  {crownFormat === "dcm" ? (
                    "3Shape DCM으로 저장합니다."
                  ) : crownFormat === "stl" ? (
                    "STL로 저장합니다."
                  ) : (
                    <>
                      PLY로 저장합니다.
                      <br />
                      칼라가 보입니다.
                    </>
                  )}
                </>
              }
              onClick={() => void downloadCrownWorkScans()}
            >
              {crownDownloadBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </HeaderIconButton>
          {ready ? (
            <Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 shrink-0 px-0"
                      aria-label="설정"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="z-[520]">
                  설정
                </TooltipContent>
              </Tooltip>
              <PopoverContent align="end" className="z-[520] w-60 space-y-3 p-3 text-xs">
                <label className="flex items-center justify-between gap-3">
                  <span className="font-medium">스캔색</span>
                  <Switch
                    checked={colorMapping}
                    onCheckedChange={(checked) => {
                      touchViewer("color");
                      viewerPrefsRef.current = { ...viewerPrefsRef.current, colorMapping: checked };
                      setColorMapping(checked);
                    }}
                  />
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
                        onClick={() => {
                          touchViewer("guide");
                          viewerPrefsRef.current = { ...viewerPrefsRef.current, centerGuide: opt.value };
                          setCenterGuide(opt.value);
                        }}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
          </div>

          <DialogClose
            className="absolute right-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md bg-destructive text-destructive-foreground opacity-100 shadow-sm hover:bg-destructive/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="닫기"
          >
            <X className="h-7 w-7" />
          </DialogClose>
        </DialogHeader>

        <div className="flex min-h-0 min-w-0 flex-1">
          <div className="relative h-full min-h-0 min-w-0 flex-1">
            <div ref={bindHostRef} className="relative h-full w-full touch-none overflow-hidden" />
            <ViewPaintSurface
              {...viewPaintSurfaceProps(paint)}
              enabled={paint.paintOn && viewerLive && !readOnly}
              space={paintSpace}
              onShapesCommit={handlePaintCommit}
            />

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

            {viewerLive ? (
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
                        onClick={() => {
                          touchViewer("jaws");
                          setVisibleJaws((p) => {
                            const upper = !p.upper;
                            viewerPrefsRef.current = { ...viewerPrefsRef.current, showUpper: upper };
                            return { ...p, upper };
                          });
                        }}
                      />
                    ) : null}
                    {availableJaws.lower ? (
                      <ToolbarToggle
                        active={visibleJaws.lower}
                        label="하악"
                        onClick={() => {
                          touchViewer("jaws");
                          setVisibleJaws((p) => {
                            const lower = !p.lower;
                            viewerPrefsRef.current = { ...viewerPrefsRef.current, showLower: lower };
                            return { ...p, lower };
                          });
                        }}
                      />
                    ) : null}
                    {availableJaws.upper || availableJaws.lower ? (
                      <div className="flex items-center gap-2 px-1.5">
                        <span className="whitespace-nowrap text-[0.6875rem] text-muted-foreground">
                          투명도
                        </span>
                        <Slider
                          className="w-20"
                          min={0}
                          max={90}
                          step={5}
                          value={[scanTransparency]}
                          onValueChange={([val]) => {
                            const next = val ?? 0;
                            touchViewer("transparency");
                            viewerPrefsRef.current = { ...viewerPrefsRef.current, scanTransparency: next };
                            setScanTransparency(next);
                          }}
                          aria-label="스캔 투명도"
                        />
                      </div>
                    ) : null}
                  </div>
                  <div className={cn("flex shrink-0 items-center gap-1.5", WIDE_CLUSTER_SEPARATOR_CLASS)}>
                    <ToolbarToggle
                      active={showFinishLine}
                      label="피니시라인"
                      onClick={() => {
                        touchViewer("margin");
                        setShowFinishLine((v) => {
                          viewerPrefsRef.current = { ...viewerPrefsRef.current, showFinishLine: !v };
                          return !v;
                        });
                      }}
                    />
                    <ToolbarToggle
                      active={showFixtureAnalog}
                      label="픽스쳐"
                      onClick={() => {
                        touchViewer("fixture");
                        setShowFixtureAnalog((v) => {
                          viewerPrefsRef.current = { ...viewerPrefsRef.current, showFixtureAnalog: !v };
                          return !v;
                        });
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {readOnly && viewerLive && designedList.length === 0 ? (
              <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center px-3">
                <p
                  className={cn(
                    CONTENT_MEASURED_CHROME_CLASS,
                    "rounded-lg border bg-background/95 px-3 py-2 text-center text-xs leading-relaxed text-foreground shadow-sm",
                  )}
                >
                  저장된 어벗 형상이 없습니다.
                  <br />
                  스캔만 표시합니다.
                </p>
              </div>
            ) : null}

            {viewerLive ? (
              <div className="pointer-events-none absolute left-3 top-3 z-20 flex h-[calc(100%-4.25rem)] w-[min(15rem,calc(100vw-2rem))] flex-col items-start gap-2">
                <PracticeCustomAbutmentViewCube
                  ref={viewCubeRef}
                  className="shrink-0"
                  faceLabels={cubeFaceLabels}
                  caption={cubeView ? `#${cubeView.toothNumber} 기준` : null}
                  pivotActive={pivotSet}
                  pivotArmed={pivotArmed}
                  onFace={jumpToFace}
                  onHome={() => {
                    selectedTeethRef.current = [];
                    setSelectedTeeth([]);
                    clearPivot();
                    fitDefaultCamera();
                  }}
                  onFit={fitCurrentView}
                  onRoll={rollView}
                  onPivot={() => {
                    if (pivotSet || pivotArmed) {
                      clearPivot();
                      return;
                    }
                    if (selectedTeethRef.current.length > 0) {
                      applySelectionPivot(selectedTeethRef.current);
                      return;
                    }
                    setPivotArmed(true);
                  }}
                  onOrbit={(gesture) => applyExternalView(controlsRef.current, gesture)}
                />
                {!readOnly && transferIdParam ? (
                  <div
                    className={cn(
                      "pointer-events-auto flex w-full flex-col overflow-hidden rounded-xl border bg-background/95 shadow-lg backdrop-blur",
                      manualChatCollapsed ? "h-auto shrink-0" : "min-h-0 flex-1",
                    )}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <div
                      className={cn(
                        "flex shrink-0 items-center justify-between gap-2 px-3 py-1.5 text-xs",
                        !manualChatCollapsed && "border-b",
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-1.5 font-semibold text-foreground">
                        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="truncate">
                          {isLabViewer ? "치과 소통" : "기공소 소통"}
                        </span>
                        {paint.count > 0 ? (
                          <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[0.6875rem] font-medium text-primary">
                            페인트 {paint.count}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          className={cn(
                            "flex h-6 items-center gap-1 rounded px-2 text-[0.6875rem] font-medium transition-colors",
                            paint.paintOn
                              ? "bg-primary text-primary-foreground"
                              : "border text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                          onClick={() => paint.setPaintOn((on) => !on)}
                        >
                          <Paintbrush className="h-3 w-3" />
                          <span>페인트</span>
                        </button>
                        <button
                          type="button"
                          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label={manualChatCollapsed ? "소통 패널 펼치기" : "소통 패널 접기"}
                          aria-expanded={!manualChatCollapsed}
                          onClick={() => {
                            viewerTouchRef.current.add("chat");
                            setManualChatCollapsed((collapsed) => {
                              const next = !collapsed;
                              if (!next) {
                                window.requestAnimationFrame(() =>
                                  sharedChatInputRef.current?.focus(),
                                );
                              }
                              return next;
                            });
                          }}
                        >
                          <ChevronDown
                            className={cn(
                              "h-3.5 w-3.5 transition-transform",
                              !manualChatCollapsed && "rotate-180",
                            )}
                          />
                        </button>
                      </div>
                    </div>

                    {!manualChatCollapsed ? (
                    <div
                      ref={sharedChatScrollRef}
                      className="min-h-[3.25rem] flex-1 space-y-1 overflow-y-auto px-2.5 py-1.5 text-xs"
                    >
                      {ptxRoomLoading || ptxMessagesLoading ? (
                        <p className="flex items-center gap-1.5 py-1 text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>대화를 불러오는 중…</span>
                        </p>
                      ) : ptxMessages.length === 0 ? (
                        <p className="py-1 text-muted-foreground">
                          {isLabViewer
                            ? "치과와 이 디자인 화면·페인트·대화를 실시간으로 공유합니다."
                            : "기공소와 이 디자인 화면·페인트·대화를 실시간으로 공유합니다."}
                        </p>
                      ) : (
                        ptxMessages.slice(-20).map((msg) => {
                          const senderId = String(msg.sender?._id || "").trim();
                          const mine = Boolean(authUserId && senderId === authUserId);
                          const isSystem =
                            msg.messageKind === "system" || Boolean(msg.systemEvent);
                          if (isSystem) {
                            return (
                              <div
                                key={msg._id}
                                className="rounded bg-muted/70 px-2 py-1 text-[0.6875rem] text-muted-foreground"
                              >
                                {msg.content}
                              </div>
                            );
                          }
                          return (
                            <div
                              key={msg._id}
                              className={cn(
                                "flex items-baseline gap-1.5 leading-snug",
                                mine ? "justify-end" : "justify-start",
                              )}
                            >
                              {!mine ? (
                                <span className="shrink-0 font-semibold text-muted-foreground">
                                  {msg.sender?.name || (isLabViewer ? "치과" : "기공소")}
                                </span>
                              ) : null}
                              <span
                                className={cn(
                                  "max-w-[82%] break-words rounded-lg px-2.5 py-1",
                                  mine
                                    ? "bg-primary text-primary-foreground"
                                    : "border bg-muted/50 text-foreground",
                                )}
                              >
                                {msg.content}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                    ) : null}

                    {!manualChatCollapsed ? (
                    <form
                      className="flex shrink-0 items-center gap-1.5 border-t bg-background px-2.5 py-1.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleSendSharedChat();
                      }}
                    >
                      <input
                        ref={sharedChatInputRef}
                        type="text"
                        value={sharedChatDraft}
                        onChange={(e) => setSharedChatDraft(e.target.value)}
                        placeholder={
                          isLabViewer
                            ? "치과에 전달할 메시지를 입력하세요…"
                            : "기공소에 전달할 메시지를 입력하세요…"
                        }
                        className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/40"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        disabled={!sharedChatDraft.trim() || sharedChatSending}
                        className="h-8 shrink-0 gap-1 px-3 text-xs"
                      >
                        {sharedChatSending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        <span>전송</span>
                      </Button>
                    </form>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <AbutsLogo
              variant="light"
              className="pointer-events-none absolute bottom-4 left-4 z-10 opacity-80"
              iconClassName="h-7 w-7"
              wordmarkClassName="text-base"
            />

            {viewerLive && designedList.length > 0 ? (
              <div className="pointer-events-none absolute bottom-3 right-3 top-3 z-10 flex min-h-0 flex-col items-end">
                <PracticeCustomAbutmentDesignTree
                    className="min-h-0 max-h-full"
                    items={designedList}
                    visibleTeeth={visibleTeeth}
                    selectedTeeth={selectedTeeth}
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
                    onToggleScanbody={(toothNumber) => {
                      touchViewer("scanbodies");
                      setShownScanbodies((prev) => {
                        const next = { ...prev, [toothNumber]: !prev[toothNumber] };
                        const any = designedList.some((d) => next[d.toothNumber]);
                        viewerPrefsRef.current = { ...viewerPrefsRef.current, showScanbodies: any };
                        return next;
                      });
                    }}
                    onSetAllScanbodies={(shown) => {
                      touchViewer("scanbodies");
                      viewerPrefsRef.current = { ...viewerPrefsRef.current, showScanbodies: shown };
                      setShownScanbodies(
                        Object.fromEntries(designedList.map((d) => [d.toothNumber, shown])),
                      );
                    }}
                    shownPredictedCrowns={shownPredictedCrowns}
                    onTogglePredictedCrown={(toothNumber) => {
                      touchViewer("crown");
                      setShownPredictedCrowns((prev) => {
                        const next = { ...prev, [toothNumber]: !prev[toothNumber] };
                        const any = designedList.some((d) => next[d.toothNumber]);
                        viewerPrefsRef.current = {
                          ...viewerPrefsRef.current,
                          showPredictedCrown: any,
                        };
                        return next;
                      });
                    }}
                    onSetAllPredictedCrowns={(shown) => {
                      touchViewer("crown");
                      viewerPrefsRef.current = {
                        ...viewerPrefsRef.current,
                        showPredictedCrown: shown,
                      };
                      setShownPredictedCrowns(
                        Object.fromEntries(designedList.map((d) => [d.toothNumber, shown])),
                      );
                    }}
                    expanded={expandedTeeth}
                    onExpandedChange={(next) => {
                      touchViewer("expanded");
                      const infoExpanded =
                        designedList.length > 0 &&
                        designedList.every((d) => next[d.toothNumber] !== false);
                      viewerPrefsRef.current = {
                        ...viewerPrefsRef.current,
                        infoExpanded,
                        expandedTeeth: { ...viewerPrefsRef.current.expandedTeeth, ...next },
                      };
                      setExpandedTeeth(next);
                    }}
                    onSelect={selectAbutments}
                    onDownload={(item) => saveBlobAsDownload(item.stlBlob, item.fileName)}
                    onDownloadAll={() => {
                      const items = designedListRef.current;
                      if (items.length === 0) return;
                      if (items.length === 1) {
                        const only = items[0]!;
                        saveBlobAsDownload(only.stlBlob, only.fileName);
                        return;
                      }
                      void (async () => {
                        const { default: JSZip } = await import("jszip");
                        const zip = new JSZip();
                        const used = new Set<string>();
                        for (const item of items) {
                          let name = item.fileName || `#${item.toothNumber}.stl`;
                          if (used.has(name)) name = `#${item.toothNumber}_${name}`;
                          used.add(name);
                          zip.file(name, item.stlBlob);
                        }
                        const blob = await zip.generateAsync({ type: "blob" });
                        const safe =
                          (patientName || "디자인").replace(/[\\/:*?"<>|]+/g, " ").trim() || "디자인";
                        saveBlobAsDownload(blob, `커스텀어벗_${safe}.zip`);
                      })();
                    }}
                    onRegenerate={canEditDesign ? () => void regenerateDesigns() : undefined}
                    onRegenerateTooth={
                      canEditDesign ? (tooth) => void regenerateDesigns([tooth]) : undefined
                    }
                    onRepickScanbody={
                      canEditDesign
                        ? (teeth) => {
                            void startScanbodyRepick(teeth);
                          }
                        : undefined
                    }
                    onEditField={canEditDesign ? handleEditInfoField : undefined}
                  />
              </div>
            ) : null}

            {!readOnly ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex flex-col items-center gap-2 px-3">
                {paint.paintOn && viewerLive ? (
                  <ViewPaintToolbar paint={paint} onSaveImage={saveViewImage} />
                ) : null}


                {canChooseAbutmentRoute ||
                (isLabViewer && remoteMode === "confirmed" && !labCheckedAt) ? (
                  <div className="pointer-events-auto">
                    <div className="flex items-center gap-2.5 rounded-xl border bg-background/95 p-1.5 shadow-lg backdrop-blur">
                    {canChooseAbutmentRoute && remoteMode === "confirmed" ? (
                      <CancelWindowTimer
                        deadlineAt={cancelDeadlineAt}
                        closed={Boolean(labCheckedAt)}
                        busy={actionBusy === "cancel"}
                        onCancel={() => void handlePracticeDesignConfirmCancel()}
                      />
                    ) : null}
                    {canChooseAbutmentRoute &&
                    remoteMode !== "confirmed" &&
                    remoteMode !== "manual" ? (
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              size="sm"
                              disabled={
                                !ready ||
                                designedList.length === 0 ||
                                actionBusy !== null ||
                                redesigning.length > 0
                              }
                              className="h-9 gap-1.5 px-4 text-sm font-semibold"
                              onClick={handleClickConfirmAndOrder}
                            >
                              {actionBusy === "confirm" ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                              <span>디자인 확정</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="z-[520] max-w-xs text-xs">
                            어벗 비용·진행 방식을 고른 뒤 확정합니다.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : null}
                    {isLabViewer && remoteMode === "confirmed" && !labCheckedAt ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            size="sm"
                            disabled={
                              !ready ||
                              designedList.length === 0 ||
                              actionBusy !== null ||
                              redesigning.length > 0
                            }
                            className="h-9 gap-1.5 px-4 text-sm font-semibold"
                            onClick={() => void handleLabDesignConfirm()}
                          >
                            {actionBusy === "confirm" ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                            <span>디자인 확정</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="z-[520] max-w-xs text-xs">
                          {labDesignConfirmHint(cancelDeadlineAt)}
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                    </div>
                  </div>
                ) : null}
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

            {status.kind === "pick" ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-24 z-30 flex justify-center px-3">
                <div
                  className={cn(
                    CONTENT_MEASURED_CHROME_CLASS,
                    "rounded-xl border border-primary/40 bg-background/95 px-4 py-3 text-center shadow-lg",
                  )}
                >
                  {status.phase === "searching" || status.phase === "designing" ? (
                    <p className="flex items-center justify-center gap-2 text-sm font-medium text-foreground">
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                      {status.phase === "searching"
                        ? `#${status.toothNumber} 주변을 찾는 중…`
                        : `#${status.toothNumber} 커스텀어벗 디자인 중…`}
                    </p>
                  ) : status.phase === "miss" ? (
                    <p className="text-sm leading-relaxed text-foreground">
                      이 주변에서 스캔바디를 찾지 못했습니다.
                      <br />
                      #{status.toothNumber} 상단을 다시 클릭하세요.
                    </p>
                  ) : status.phase === "empty" ? (
                    <p className="text-sm leading-relaxed text-foreground">
                      스캔 표면을 클릭하세요.
                      <br />
                      #{status.toothNumber} 스캔바디 상단을 클릭하세요.
                    </p>
                  ) : (
                    <p className="text-sm leading-relaxed text-foreground">
                      #{status.toothNumber} 스캔바디 상단을 클릭하세요.
                      <br />
                      잘못 잡힌 어벗 위를 눌러도 그 위치로 옮깁니다.
                    </p>
                  )}
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

    <Dialog open={routeCostOpen} onOpenChange={setRouteCostOpen}>
      <DialogContent
        className="z-[540] max-w-md space-y-3 p-5"
        overlayClassName="z-[535]"
        onContextMenu={(e) => e.preventDefault()}
      >
        <DialogHeader className="space-y-1 text-left">
          <DialogTitle className="text-base font-semibold">어벗 비용</DialogTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">
            디자인 확정 후 수행 기공소가 검토·수정한 뒤 제조에 넘깁니다.
            <br />
            수작업 의뢰는 수행 기공소가 3Shape·ExoCAD로 새로 디자인합니다.
          </p>
        </DialogHeader>
        <div className="space-y-2" role="radiogroup" aria-label="어벗 진행 방식">
          <button
            type="button"
            role="radio"
            aria-checked={routeCostAction === "confirm"}
            onClick={() => setRouteCostAction("confirm")}
            className={cn(
              "w-full rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted/30",
              routeCostAction === "confirm"
                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                : "bg-background",
            )}
          >
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">디자인 확정</span>
              <span className="shrink-0 font-semibold tabular-nums">
                {formatWon(
                  feeGuide?.platformUnit || ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE,
                )}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              어벗츠에 냅니다.
              <br />
              기공소가 이 화면에서 수정한 뒤 제조에 넘깁니다.
            </p>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={routeCostAction === "manual"}
            onClick={() => setRouteCostAction("manual")}
            className={cn(
              "w-full rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted/30",
              routeCostAction === "manual"
                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                : "bg-background",
            )}
          >
            <div className="flex items-start justify-between gap-3 text-sm">
              <span className="font-medium">수작업 의뢰</span>
              <span className="shrink-0 text-right font-semibold tabular-nums">
                {(feeGuide?.labTeeth.length ?? 0) === 0 ? (
                  "기공소 수가"
                ) : new Set(feeGuide?.labTeeth.map((row) => row.unit)).size === 1 ? (
                  formatWon(feeGuide?.labTeeth[0]?.unit || 0)
                ) : (
                  <span className="block">
                    {feeGuide?.labTeeth.map((row) => (
                      <span key={row.toothNumber} className="block">
                        #{row.toothNumber} {formatWon(row.unit)}
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              기공소에 냅니다.
              <br />
              기공소 프로그램으로 처음부터 작업합니다.
            </p>
          </button>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={routeCostHideNext}
            onCheckedChange={(val) => setRouteCostHideNext(val === true)}
          />
          <span>다시 표시하지 않기</span>
        </label>
        <DialogFooter className="flex-row justify-end gap-2 sm:justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => setRouteCostOpen(false)}>
            취소
          </Button>
          <Button type="button" size="sm" onClick={proceedRouteCost}>
            {routeCostAction === "confirm"
              ? "디자인 확정"
              : manualChatOpen
                ? "수작업 의뢰 전달"
                : "수작업 의뢰"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={confirmPrefDialogOpen} onOpenChange={setConfirmPrefDialogOpen}>
        <DialogContent
          className="z-[540] max-w-md space-y-3 p-5"
          overlayClassName="z-[535]"
          onContextMenu={(e) => e.preventDefault()}
        >
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-base font-semibold">
              다음 케이스에도 적용할까요?
            </DialogTitle>
            <p className="text-xs leading-relaxed text-muted-foreground">
              선택한 변경 사항을 다음 케이스 기본값으로 저장합니다.
              <br />
              체크하지 않은 항목은 이번 의뢰에만 반영됩니다.
            </p>
          </DialogHeader>

          <ul className="max-h-64 space-y-1.5 overflow-y-auto px-1.5 py-1.5">
            {confirmPrefChanges.map((change) => {
              const checked = checkedChangeIds.has(change.id);
              return (
                <li key={change.id}>
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-sm shadow-sm transition-colors hover:bg-muted/40">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(val) => {
                          setCheckedChangeIds((prev) => {
                            const next = new Set(prev);
                            if (val === true) next.add(change.id);
                            else next.delete(change.id);
                            return next;
                          });
                        }}
                      />
                      <span className="truncate font-medium text-foreground">
                        {designedList.length > 1 ? `#${change.toothNumber} ` : ""}
                        {change.label}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums">
                      <span className="text-muted-foreground">{change.beforeText}</span>
                      <span className="mx-1.5 text-muted-foreground">→</span>
                      <span className="font-semibold text-primary">{change.afterText}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <DialogFooter className="flex-row justify-end gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={actionBusy !== null}
              onClick={() => void executeConfirmAndOrder([])}
            >
              이번만 적용하고 의뢰
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={actionBusy !== null}
              onClick={() =>
                void executeConfirmAndOrder(
                  confirmPrefChanges.filter((c) => checkedChangeIds.has(c.id)),
                )
              }
            >
              {actionBusy === "confirm" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              선택 항목 저장 후 의뢰
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
