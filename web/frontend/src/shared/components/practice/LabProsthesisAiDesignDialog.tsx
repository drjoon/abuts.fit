// 기공소 채팅 헤더 — 작업시작 오른쪽 AI.
// - 2026-09-26: 헤더 의뢰 정보는 한 줄.
// - 2026-09-26: 스캔·마진·디자인 단계, 언더컷·교합 접촉, 치아별 생성.
// - 2026-09-26: 언더컷·교합은 헤더 중앙. 치아 정보는 설측 아래 트리. 스캔 파일은 세션 캐시.
// - 2026-09-26: 언더컷·교합·칼라·투명도는 작업영역 왼쪽 위. 파일명은 라벨로 끌어 역할을 바꾼다.
// - 2026-09-26: 작업영역 위 버튼은 헤더와 같은 높이.
// - 2026-09-26: 마진·디자인은 카메라를 유지한다. 치아 이름을 누르면 그 치아 교합면.
// - 2026-09-26: 삽입축은 치아 정보에서 보철마다. 브리지는 스팬당 하나.
// - 2026-09-26: 브리지 삽입축 버튼은 스팬 한가운데. 치아는 선으로 잇고 아래 번호는 없앤다.
// - 2026-09-26: 브리지 연결선은 치아 중심에서 끝난다. 삽입축은 그 선 중심 왼쪽.
// - 2026-09-26: 투명 체크는 지대치 외 스캔을 20%로 비추고, 끄면 불투명하다. 처음에는 꺼져 있다.
// - 2026-09-27: 언더컷과 교합 접촉 사이 마진.
// - 2026-09-27: 삽입축·언더컷·마진·교합 접촉 범례는 각 토글 바로 아래.
// - 2026-09-27: 마진을 확인한 뒤에만 생성한다. 범위·재료 프리셋·최소 두께 색.
// - 2026-09-27: 정중앙은 버튼 줄 한가운데. 칼라는 교합 접촉, 투명 앞. 표시 쉐브론은 하나만.
// - 2026-09-26: 치아 이름은 글자 너비. 삽입축은 파란 버튼. 치아를 누르면 잡은 카메라로.
// - 2026-09-26: 작업영역 위 정중앙 버튼이 가로·세로 점선을 켠다.
// - 2026-09-26: 마진·삽입·내면·형상·훅·컷백·홀·커넥터를 작업 영역에서 고친다.
// - 2026-09-26: 삽입축이 잡히고 화면에 보이면 언더컷도 같이 칠한다.
// - 2026-09-26: 사이드바 제거. 표시는 위, 수정은 왼쪽 아래 패널. 작업영역 아래 생성 배지 제거.
// - 2026-09-26: 삽입축을 잡으면 치아·잇몸 색이 갈라지는 곳을 마진으로 다시 잡는다.
// - 2026-09-26: 마진은 기본 원보다 바깥을, 삽입축으로 스캔 면에 붙여 잡는다.
// - 2026-09-26: 표시 패널은 맨 위. 닫으면 글자 너비. 단계 접기는 패널 위.
// - 2026-09-26: 언더컷부터 정중앙은 작업영역 위 중앙. 색 범례는 그 배지 바로 아래.
// - 2026-09-26: 스캔 단계에 모델 정렬. 수동은 고른 악과 바이트만 좌우로 두고 점 3개로 붙인다.
// - 2026-09-26: 수동 정렬의 두 모델은 화면 가운데에 좁은 간격으로 나란히 둔다.
// - 2026-09-26: 정렬 안내 문장은 버튼 툴팁으로만.
// - 2026-09-26: 모델 정렬이 돌아가는 동안 취소할 수 있다.
// - 2026-09-26: 작업 저장·전체 생성은 없앤다. 작업은 IndexedDB에 두고 닫을 때 서버에 올린다.
// - 2026-09-26: 작업 스캔은 의뢰 파일이 아니라 채팅 작업 파일에 둔다.
// - 2026-09-26: 헤더에 자동 저장 스위치와 실행 취소·다시 실행.
// - 2026-09-26: 페인트로 표시한 뒤 채팅에 첨부.
// - 2026-09-26: 카메라 각도·위치·줌이 바뀌면 작업 초안에 둔다.
// - 2026-09-26: 닫기는 바로 하고, 작업 스캔 업로드·저장은 뒤에서 한다.
// - 2026-09-26: 자동 맞춤·삽입축처럼 문서를 바꾸는 명령마다 작업 초안을 저장한다.
// - 2026-09-27: 패널 닫기·열기 아이콘. 가로가 좁으면 헤더 버튼은 아이콘만.
// - 2026-09-27: 가이드 버튼 라벨은 없음 → 중앙선 → 모눈종이.
// - 2026-09-27: 모달을 닫으면 작업영역 위 토글을 남긴다. 정중앙은 모눈(2mm·10mm)까지 순환한다.
// - 2026-09-27: 표시 패널은 파일명을 기본으로 숨긴다. 헤더에서 닫거나 숨긴 뒤 열면 직전 패널 열림을 되돌린다.
// - 2026-09-27: 패널은 열기·닫기·숨김. 헤더 날짜는 도착일만.
// - 2026-09-27: 브리지는 지대치·폰틱을 나누고, 커넥터마다 연결·모양·단면적을 고친다. 스팬 단위 생성·조립·분리.
// - 2026-09-27: 모델정렬 위저드. 바이트 정렬·삽입축이 안 끝났으면 작업영역 아래에 하나씩 안내하고, 끝나면 마진·디자인 짧은 안내로 이어간다.
// - 2026-09-27: 바이트는 열 때 자동으로 맞으므로 위저드의 모델정렬 안내는 뺀다. 삽입축부터 안내한다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Blend,
  Crosshair,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ImageDown,
  Paintbrush,
  PanelLeftClose,
  PanelLeftDashed,
  PanelLeftOpen,
  Pencil,
  Paperclip,
  Redo2,
  Eraser,
  Undo2,
  Palette,
  Sparkles,
  Spline,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import { apiFetch } from "@/shared/api/apiClient";
import { setFileBlob } from "@/shared/files/fileBlobCache";
import {
  fetchS3BlobCached,
  s3FileBlobCacheKey,
} from "@/shared/files/s3BlobCache";
import { useS3TempUpload } from "@/shared/hooks/useS3TempUpload";
import { useToast } from "@/shared/hooks/use-toast";
import {
  fileFromImageBlob,
  fileFromModelBlob,
} from "@/shared/files/modelPreviewFile";
import { buildS3ProxyDownloadUrl } from "@/shared/files/useS3FileDownload";
import {
  LabBasketTagGuideButton,
  LabBasketTagPickerButton,
} from "@/shared/components/practice/LabBasketTagToolbar";
import { ConnectorFocusView } from "@/shared/components/practice/ConnectorFocusView";
import {
  DesignExportDialog,
  type DesignExportRestoration,
  type DesignExportScan,
  type DesignExportSelection,
} from "@/shared/components/practice/DesignExportDialog";
import {
  OralScanOverlayViewer,
  type ConnectorSectionShot,
  type OralScanOverlayHandle,
  type OralScanOverlaySource,
} from "@/shared/components/practice/OralScanOverlayViewer";
import {
  LabProsthesisModifyPanel,
  type ConnectorRow,
} from "@/shared/components/practice/LabProsthesisModifyPanel";
import {
  VIEW_PAINT_COLORS,
  ViewPaintSurface,
  downloadBlobFile,
  paintNoteFileName,
  viewPaintColorLabel,
  type ViewPaintHandle,
} from "@/shared/components/practice/ViewPaintSurface";
import {
  buildLabProsthesisAiPlan,
  isOralScanMeshName,
  oralScanRoleLabel,
  newestWorkScanUploadedAtMs,
  preferWorkingOralScanFiles,
  initialLabOralScanVisible,
  prepArchFromProsthesisTeeth,
  resolveOralScanRole,
  formatProsthesisAiToothLabel,
  type LabOralScanRole,
  type LabProsthesisAiTooth,
  type WorkScanRole,
} from "@/shared/practice/labProsthesisAiDesign";
import {
  assignNewerDraftFiles,
  dropWorkDraftRoles,
  newerDraftRoles,
  readWorkDraft,
  stampWorkDraftSavedAt,
  writeWorkDraftMeshes,
  writeWorkSession,
  parseViewToggles,
  writeWorkSessionDocument,
  type WorkDraftMesh,
  type WorkSessionCenterGuide,
  type WorkSessionDocument,
  type WorkSessionViewToggles,
} from "@/shared/practice/labProsthesisWorkDraft";
import {
  contactMapGradientCss,
  undercutLimitFromRange,
  type ContactPaintMode,
} from "@/shared/practice/oralScanDesignAnalysis";
import {
  applyClinicMaterialPreset,
  applyDetectedMargin,
  applyInnerPreset,
  clinicKeyFromCasePrimary,
  connectorIsWeak,
  createToothDesignEdit,
  INNER_PRESETS,
  materialSnapshot,
  readClinicMaterialPreset,
  redetectMargin,
  reduceDesignGesture,
  shellIsThin,
  writeClinicMaterialPreset,
  type ClinicMaterialPreset,
  type DesignGesture,
  type DesignScope,
  type EditBrush,
  type InnerPresetId,
  type MarginEditMode,
  type MarginReview,
  type ModifyTool,
  type ToothDesignEdit,
} from "@/shared/practice/labProsthesisModify";
import {
  compareArch,
  fdiToothDigits,
  insertionAxisKey,
  sortByArch,
} from "@/shared/practice/toothArchOrder";

type AiDesignFile = {
  fileName?: string | null;
  scanRole?: string | null;
  s3Key?: string | null;
  uploadedAt?: string | null;
};

export type WorkingScansPersisted = {
  files?: unknown;
  trashedFiles?: unknown;
  workScanFiles?: unknown;
};

type LabProsthesisAiCaseHeader = {
  /** 예: 테스트치과 · 노해인4 */
  primary?: string | null;
  /** 예: 주문 2026-09-26 · 도착 2026-10-07. 헤더에는 도착일만 쓴다. */
  dates?: string | null;
};

/** 열기=본문, 닫기=제목만, 숨김=패널 없음. 버튼은 다음 동작. */
type PanelLayout = "open" | "closed" | "hidden";

/** 헤더로 접기 전에 기억해 두는 패널 본문. 파일명은 기본 숨김. */
type PanelOpenMemory = {
  scanList: boolean;
  scanNames: boolean;
  modify: boolean;
  toothInfo: boolean;
};

const defaultPanelOpenMemory = (): PanelOpenMemory => ({
  scanList: true,
  scanNames: false,
  modify: true,
  toothInfo: true,
});

function overlayLegend(colorClass: string, label: string) {
  return (
    <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1.5 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap text-[10px] text-foreground">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", colorClass)} />
      {label}
    </span>
  );
}

function thicknessOverlayLegend() {
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-full z-10 mt-1.5 w-44 -translate-x-1/2 text-[10px] text-foreground"
      aria-label="최소 두께 미달"
    >
      <div className="flex justify-between whitespace-nowrap leading-none">
        <span>미달</span>
        <span>충족</span>
      </div>
      <div
        className="mt-0.5 h-2 rounded-sm"
        style={{
          background: "linear-gradient(90deg, rgb(219 51 46), rgb(51 184 82))",
        }}
      />
    </div>
  );
}

function contactOverlayLegend() {
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-full z-10 mt-1.5 w-44 -translate-x-1/2 text-[10px] text-foreground"
      aria-label="교합 거리 -0.5mm부터 +0.5mm"
    >
      <div className="flex justify-between whitespace-nowrap tabular-nums leading-none">
        <span>-0.5mm</span>
        <span>0.0</span>
        <span>+0.5mm</span>
      </div>
      <div
        className="mt-0.5 h-2 rounded-sm"
        style={{ background: contactMapGradientCss() }}
      />
    </div>
  );
}

function panelLayoutAction(layout: PanelLayout): string {
  if (layout === "open") return "패널 닫기";
  if (layout === "closed") return "패널 숨김";
  return "패널 열기";
}

type LabProsthesisAiBasketTag = {
  value: string;
  occupiedTags?: ReadonlySet<string> | null;
  onChange: (tag: string) => void;
};

type LabProsthesisAiDesignButtonProps = {
  toothWorks?: ReadonlyArray<{
    toothNumber?: string | null;
    prosthesisType?: string | null;
    bridgeLinkedTeeth?: readonly string[] | null;
  }> | null;
  files?: ReadonlyArray<AiDesignFile> | null;
  authToken?: string | null;
  /** 기공소 수신 의뢰. 작업 DCM은 이 의뢰의 작업 파일에 붙인다. */
  transferId?: string | null;
  /** 채팅 작업 파일의 작업 스캔. 의뢰 파일보다 나중이면 이걸 연다. */
  workScanFiles?: ReadonlyArray<AiDesignFile> | null;
  onWorkingScansPersisted?: (data: WorkingScansPersisted) => void;
  /** 표시가 입혀진 현재 뷰를 채팅 첨부로 넘긴다. */
  onAttachChatFile?: (file: File) => void;
  caseHeader?: LabProsthesisAiCaseHeader | null;
  /** 채팅 헤더와 같은 바구니 번호표 */
  basketTag?: LabProsthesisAiBasketTag | null;
  className?: string;
};

type AssignableScanRole = Exclude<LabOralScanRole, "other">;

type MeshSource = {
  id: string;
  fileName: string;
  role: AssignableScanRole;
};

const IMAGE_EXT = /\.(png|jpe?g|webp|bmp|gif)$/i;
const GHOST_OPACITY_ON = 0.2;
/** 같은 세션에서 다시 열면 IndexedDB·네트워크 대신 이 파일을 쓴다. */
const sessionScanFileCache = new Map<string, File>();
const ROLE_DOT: Record<LabOralScanRole, string> = {
  upper: "bg-blue-500",
  lower: "bg-amber-500",
  bite: "bg-teal-500",
  other: "bg-slate-400",
};

type WorkCloseSnapshot = {
  id: string;
  token: string;
  dirty: WorkDraftMesh[];
  document: WorkSessionDocument;
  pendingRoles: WorkScanRole[];
  serverAt: ReadonlyMap<WorkScanRole, number>;
};

type DesignStage = "scan" | "margin" | "design";

function isOpposingOrBite(
  role: AssignableScanRole,
  prepArch: "upper" | "lower" | "both" | null,
) {
  if (role === "bite") return true;
  if (prepArch !== "upper" && prepArch !== "lower") return false;
  return (role === "upper" || role === "lower") && role !== prepArch;
}

const DESIGN_STAGES: Array<{ id: DesignStage; label: string }> = [
  { id: "scan", label: "스캔" },
  { id: "margin", label: "마진" },
  { id: "design", label: "디자인" },
];

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function LabProsthesisAiDesignButton({
  toothWorks,
  files,
  authToken,
  transferId,
  workScanFiles,
  onWorkingScansPersisted,
  onAttachChatFile,
  caseHeader,
  basketTag,
  className,
}: LabProsthesisAiDesignButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("h-9 gap-1 px-3", className)}
        title="업로드 스캔으로 보철 디자인"
        aria-label="AI 디자인"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0" />
        <span>AI</span>
      </Button>
      <LabProsthesisAiDesignDialog
        open={open}
        onOpenChange={setOpen}
        toothWorks={toothWorks}
        files={files}
        authToken={authToken}
        transferId={transferId}
        workScanFiles={workScanFiles}
        onWorkingScansPersisted={onWorkingScansPersisted}
        onAttachChatFile={onAttachChatFile}
        caseHeader={caseHeader}
        basketTag={basketTag}
      />
    </>
  );
}

const AUTO_SAVE_PREF_KEY = "abuts.labProsthesis.autoSave";
const UNDO_LIMIT = 30;

type ArchAligned = { upper: boolean; lower: boolean };

type WorkUndoSnap = {
  edits: Record<string, ToothDesignEdit>;
  generated: Record<string, boolean>;
  marginReview: Record<string, MarginReview>;
  jaws: Array<{ id: string; positions: Float32Array }> | null;
  archAligned: ArchAligned;
};

type WorkUndoBook = {
  past: WorkUndoSnap[];
  future: WorkUndoSnap[];
  stroke: boolean;
  strokeKey: string;
  closeTimer: number;
};

function workDocumentSignature(document: WorkSessionDocument): string {
  return JSON.stringify({
    edits: document.edits,
    generated: document.generated,
    marginReview: document.marginReview,
    designScope: document.designScope,
    insertionAxes: document.insertionAxes,
    archAligned: document.archAligned,
    camera: document.camera,
    viewToggles: document.viewToggles,
  });
}

function nextCenterGuide(mode: WorkSessionCenterGuide): WorkSessionCenterGuide {
  if (mode === "off") return "center";
  if (mode === "center") return "grid";
  return "off";
}

function centerGuideLabel(mode: WorkSessionCenterGuide): string {
  if (mode === "center") return "중앙선";
  if (mode === "grid") return "모눈종이";
  return "없음";
}

function storedAutoSave() {
  try {
    return window.localStorage.getItem(AUTO_SAVE_PREF_KEY) !== "0";
  } catch {
    return true;
  }
}

function LabProsthesisAiDesignDialog({
  open,
  onOpenChange,
  toothWorks,
  files,
  authToken,
  transferId,
  workScanFiles,
  onWorkingScansPersisted,
  onAttachChatFile,
  caseHeader,
  basketTag,
}: LabProsthesisAiDesignButtonProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const listedScanFiles = useMemo(
    () => [...(files || []), ...(workScanFiles || [])],
    [files, workScanFiles],
  );
  const plan = useMemo(
    () => buildLabProsthesisAiPlan({ toothWorks, files: listedScanFiles }),
    [listedScanFiles, toothWorks],
  );
  const filesRef = useRef(listedScanFiles);
  filesRef.current = listedScanFiles;

  const meshSources = useMemo(
    () => collectMeshSources(listedScanFiles),
    [listedScanFiles],
  );
  const meshKey = meshSources
    .map((row) => `${row.id}\0${row.role}\0${row.fileName}`)
    .join("|");
  const imageKey = useMemo(() => {
    return (files || [])
      .filter((file) => IMAGE_EXT.test(String(file.fileName || "")))
      .map((file) => `${file.s3Key || ""}\0${file.fileName || ""}`)
      .join("|");
  }, [files]);
  const prepTeeth =
    plan.designableTeeth.length > 0 ? plan.designableTeeth : plan.teeth;
  const prepArch = useMemo(
    () => prepArchFromProsthesisTeeth(prepTeeth),
    [prepTeeth],
  );
  const focusToothNumbers = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const tooth of prepTeeth) {
      for (const raw of [tooth.toothNumber, ...tooth.linkedTeeth]) {
        const number = String(raw || "").trim();
        if (!number || seen.has(number)) continue;
        seen.add(number);
        out.push(number);
      }
    }
    return out;
  }, [prepTeeth]);

  const [entries, setEntries] = useState<OralScanOverlaySource[]>([]);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [colorMapping, setColorMapping] = useState(true);
  const paintRef = useRef<ViewPaintHandle | null>(null);
  const [paintOn, setPaintOn] = useState(false);
  const [paintColor, setPaintColor] = useState<string>(VIEW_PAINT_COLORS[0]);
  const [paintInk, setPaintInk] = useState(false);
  const [hasScanColor, setHasScanColor] = useState(false);
  const [ghostOn, setGhostOn] = useState(false);
  const [marginShown, setMarginShown] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [progress, setProgress] = useState(0);
  const [fileState, setFileState] = useState<
    Record<string, "loading" | "ready" | "error">
  >({});
  const [stage, setStage] = useState<DesignStage>("scan");
  const [contactMap, setContactMap] = useState(false);
  const [undercutMap, setUndercutMap] = useState(false);
  const [occlusalGap, setOcclusalGap] = useState(0.1);
  const [contactMode, setContactMode] = useState<ContactPaintMode>("cut");
  const [selectedTooth, setSelectedTooth] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Record<string, boolean>>({});
  const [marginReview, setMarginReview] = useState<Record<string, MarginReview>>({});
  const [designScope, setDesignScope] = useState<DesignScope | null>(null);
  const [clinicPreset, setClinicPreset] = useState<ClinicMaterialPreset | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genLabel, setGenLabel] = useState("");
  const [panelsHidden, setPanelsHidden] = useState(false);
  const [toothInfoOpen, setToothInfoOpen] = useState(true);
  const [roleOverride, setRoleOverride] = useState<
    Record<string, AssignableScanRole>
  >({});
  const [scanOrder, setScanOrder] = useState<string[]>([]);
  const [scanListOpen, setScanListOpen] = useState(true);
  const [scanNamesOpen, setScanNamesOpen] = useState(false);
  const [modifyPanelOpen, setModifyPanelOpen] = useState(true);
  const panelOpenMemoryRef = useRef<PanelOpenMemory>(defaultPanelOpenMemory());
  /** 헤더 「패널 닫기」가 본문을 접은 직후. 그 false 값으로 기억을 덮지 않는다. */
  const panelHeaderFoldedRef = useRef(false);
  const [dragScanId, setDragScanId] = useState<string | null>(null);
  const [dropScanId, setDropScanId] = useState<string | null>(null);
  const [workWide, setWorkWide] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 720,
  );
  const [headerWide, setHeaderWide] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 1280,
  );
  const [insertionKeys, setInsertionKeys] = useState<string[]>([]);
  const [insertionShown, setInsertionShown] = useState(false);
  const [centerGuide, setCenterGuide] = useState<WorkSessionCenterGuide>("center");
  const viewTogglesRef = useRef<WorkSessionViewToggles>({
    insertion: false,
    undercut: false,
    margin: false,
    center: "center",
    color: true,
    contact: false,
    ghost: false,
  });
  const restoreGhostVisibleRef = useRef(false);
  const [modifyTool, setModifyTool] = useState<ModifyTool>("margin");
  const [marginMode, setMarginMode] = useState<MarginEditMode>("point");
  const [editBrush, setEditBrush] = useState<EditBrush>("none");
  const [edits, setEdits] = useState<Record<string, ToothDesignEdit>>({});
  const [holeNote, setHoleNote] = useState("");
  const [connectorFrom, setConnectorFrom] = useState<string | null>(null);
  const [focusViewOn, setFocusViewOn] = useState(true);
  const [connectorShot, setConnectorShot] = useState<ConnectorSectionShot | null>(null);
  const focusRowRef = useRef<ConnectorRow | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [alignKind, setAlignKind] = useState<"auto" | "manual" | null>(null);
  const [alignArch, setAlignArch] = useState<"upper" | "lower" | null>(null);
  const [alignPicks, setAlignPicks] = useState({ model: 0, bite: 0 });
  const [alignBusy, setAlignBusy] = useState(false);
  const [archAligned, setArchAligned] = useState<ArchAligned>({
    upper: false,
    lower: false,
  });
  const [autoSave, setAutoSave] = useState(storedAutoSave);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const viewerRef = useRef<OralScanOverlayHandle>(null);
  const autoSaveRef = useRef(autoSave);
  autoSaveRef.current = autoSave;
  const editsRef = useRef(edits);
  editsRef.current = edits;
  const generatedRef = useRef(generated);
  generatedRef.current = generated;
  const marginReviewRef = useRef(marginReview);
  marginReviewRef.current = marginReview;
  const designScopeRef = useRef(designScope);
  designScopeRef.current = designScope;
  const archAlignedRef = useRef(archAligned);
  archAlignedRef.current = archAligned;
  const historyRef = useRef<WorkUndoBook>({
    past: [],
    future: [],
    stroke: false,
    strokeKey: "",
    closeTimer: 0,
  });
  const alignBeforeSigRef = useRef("");
  const saveLockRef = useRef(false);
  const pendingDraftRolesRef = useRef<Set<WorkScanRole>>(new Set());
  const lastDraftSigRef = useRef("");
  const lastDocSigRef = useRef("");
  const sessionDocRef = useRef<WorkSessionDocument | null>(null);
  const suspendDraftRef = useRef(false);
  const draftTimerRef = useRef(0);
  const draftQueueRef = useRef(Promise.resolve());
  const queueSaveWorkRef = useRef<() => void>(() => {});
  const { toast } = useToast();
  const { uploadFiles } = useS3TempUpload({ token: authToken });
  const workObserveRef = useRef<ResizeObserver | null>(null);
  const bindWorkArea = useCallback((node: HTMLDivElement | null) => {
    workObserveRef.current?.disconnect();
    workObserveRef.current = null;
    if (!node) return;
    const sync = () => {
      setWorkWide(node.clientWidth >= 720);
      setHeaderWide(node.clientWidth >= 1280);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    workObserveRef.current = observer;
  }, []);
  const genSeq = useRef(0);

  useEffect(() => {
    if (!open) {
      setEntries([]);
      setVisible({});
      setColorMapping(true);
      setHasScanColor(false);
      setGhostOn(false);
      setMarginShown(false);
      setLoadError("");
      setProgress(0);
      setFileState({});
      setStage("scan");
      setContactMap(false);
      setUndercutMap(false);
      setOcclusalGap(0.1);
      setContactMode("cut");
      setSelectedTooth(null);
      setGenerated({});
      setMarginReview({});
      setDesignScope(null);
      setClinicPreset(null);
      setGenerating(false);
      setGenLabel("");
      setToothInfoOpen(true);
      setPanelsHidden(false);
      setRoleOverride({});
      setScanOrder([]);
      setScanListOpen(true);
      setScanNamesOpen(false);
      setModifyPanelOpen(true);
      panelOpenMemoryRef.current = defaultPanelOpenMemory();
      panelHeaderFoldedRef.current = false;
      setDragScanId(null);
      setDropScanId(null);
      setInsertionKeys([]);
      setInsertionShown(false);
      setCenterGuide("center");
      restoreGhostVisibleRef.current = false;
      setModifyTool("margin");
      setMarginMode("point");
      setEditBrush("none");
      setEdits({});
      setHoleNote("");
      setAlignKind(null);
      setAlignArch(null);
      setAlignPicks({ model: 0, bite: 0 });
      setAlignBusy(false);
      setArchAligned({ upper: false, lower: false });
      pendingDraftRolesRef.current = new Set();
      lastDraftSigRef.current = "";
      lastDocSigRef.current = "";
      sessionDocRef.current = null;
      suspendDraftRef.current = false;
      window.clearTimeout(draftTimerRef.current);
      window.clearTimeout(historyRef.current.closeTimer);
      historyRef.current.closeTimer = 0;
      historyRef.current.past = [];
      historyRef.current.future = [];
      historyRef.current.stroke = false;
      historyRef.current.strokeKey = "";
      historyRef.current.closeTimer = 0;
      setCanUndo(false);
      setCanRedo(false);
      genSeq.current += 1;
      return;
    }
    suspendDraftRef.current = false;

    const ac = new AbortController();
    const sources = collectMeshSources(filesRef.current);
    const images = collectImageSources(filesRef.current);

    if (sources.length === 0) {
      setEntries([]);
      setLoadError("");
      setProgress(0);
      return () => {
        ac.abort();
      };
    }
    if (!authToken) {
      setLoadError("로그인이 필요합니다.");
      return () => ac.abort();
    }

    const percents = new Map<string, number>();
    const report = () => {
      const values = [...percents.values()];
      if (!values.length) return;
      const avg = values.reduce((sum, n) => sum + n, 0) / values.length;
      setProgress(Math.round(avg));
    };

    setLoadError("");
    setProgress(0);
    setFileState(
      Object.fromEntries(sources.map((row) => [row.id, "loading" as const])),
    );
    setVisible(
      Object.fromEntries(
        sources.map((row) => [
          row.id,
          initialLabOralScanVisible(row.role, prepArch),
        ]),
      ),
    );

    void (async () => {
      let localFiles = new Map<string, File>();
      const caseId = String(transferId || "").trim();
      if (caseId) {
        try {
          const draft = await readWorkDraft(caseId);
          if (ac.signal.aborted) return;
          const assigned = assignNewerDraftFiles(
            sources,
            draft,
            newestWorkScanUploadedAtMs(filesRef.current || []),
          );
          localFiles = assigned.byId;
          pendingDraftRolesRef.current = new Set(assigned.roles);
          if (draft?.document) {
            editsRef.current = draft.document.edits;
            generatedRef.current = draft.document.generated;
            marginReviewRef.current = draft.document.marginReview;
            designScopeRef.current = draft.document.designScope;
            archAlignedRef.current = draft.document.archAligned;
            sessionDocRef.current = draft.document;
            lastDocSigRef.current = workDocumentSignature(draft.document);
            setEdits(draft.document.edits);
            setGenerated(draft.document.generated);
            setMarginReview(draft.document.marginReview);
            setDesignScope(draft.document.designScope);
            setArchAligned(draft.document.archAligned);
            if (draft.document.insertionAxes.length > 0) {
              setInsertionKeys(draft.document.insertionAxes.map((axis) => axis.key));
              setInsertionShown(true);
            }
            const toggles = parseViewToggles(draft.document.viewToggles);
            if (toggles) {
              setInsertionShown(toggles.insertion);
              setUndercutMap(toggles.undercut);
              setMarginShown(toggles.margin);
              setCenterGuide(toggles.center);
              setColorMapping(toggles.color);
              setContactMap(toggles.contact);
              setGhostOn(toggles.ghost);
              restoreGhostVisibleRef.current = toggles.ghost;
            }
          }
        } catch {
          localFiles = new Map();
        }
      }
      if (ac.signal.aborted) return;

      const companions: File[] = [];
      const wantsTexture = sources.some((row) =>
        /\.(ply|obj)$/i.test(row.fileName),
      );
      if (wantsTexture) {
        await Promise.all(
          images.map(async (image) => {
            const cacheKey = `img:${image.id}`;
            const hit = sessionScanFileCache.get(cacheKey);
            if (hit) {
              companions.push(hit);
              return;
            }
            try {
              const blob = await fetchS3BlobCached({
                s3Key: image.id,
                fileName: image.fileName,
                token: authToken,
                buildUrl: buildS3ProxyDownloadUrl,
                signal: ac.signal,
              });
              if (ac.signal.aborted) return;
              const file = fileFromImageBlob(blob, image.fileName);
              sessionScanFileCache.set(cacheKey, file);
              companions.push(file);
            } catch (err) {
              if ((err as { name?: string })?.name === "AbortError") return;
            }
          }),
        );
      }
      if (ac.signal.aborted) return;

      const loaded: OralScanOverlaySource[] = [];
      const nextState: Record<string, "ready" | "error"> = {};
      await Promise.all(
        sources.map(async (source) => {
          percents.set(source.id, 0);
          const localFile = localFiles.get(source.id);
          if (localFile) {
            loaded.push({
              id: source.id,
              fileName: localFile.name,
              role: source.role,
              file: localFile,
              companionFiles: companions,
            });
            nextState[source.id] = "ready";
            percents.set(source.id, 100);
            report();
            return;
          }
          const cachedFile = sessionScanFileCache.get(source.id);
          if (cachedFile) {
            loaded.push({
              id: source.id,
              fileName: source.fileName,
              role: source.role,
              file: cachedFile,
              companionFiles: companions,
            });
            nextState[source.id] = "ready";
            percents.set(source.id, 100);
            report();
            return;
          }
          try {
            const blob = await fetchS3BlobCached({
              s3Key: source.id,
              fileName: source.fileName,
              token: authToken,
              buildUrl: buildS3ProxyDownloadUrl,
              signal: ac.signal,
              onProgress: (percent) => {
                percents.set(source.id, percent);
                report();
              },
            });
            if (ac.signal.aborted) return;
            const file = fileFromModelBlob(blob, source.fileName);
            sessionScanFileCache.set(source.id, file);
            loaded.push({
              id: source.id,
              fileName: source.fileName,
              role: source.role,
              file,
              companionFiles: companions,
            });
            nextState[source.id] = "ready";
            percents.set(source.id, 100);
            report();
          } catch (err) {
            if ((err as { name?: string })?.name === "AbortError") return;
            nextState[source.id] = "error";
            percents.set(source.id, 100);
            report();
          }
        }),
      );
      if (ac.signal.aborted) return;
      loaded.sort(
        (a, b) =>
          sources.findIndex((row) => row.id === a.id) -
          sources.findIndex((row) => row.id === b.id),
      );
      setEntries(loaded);
      setFileState((prev) => ({ ...prev, ...nextState }));
      if (loaded.length === 0) {
        setLoadError("스캔을 불러오지 못했습니다.");
      }
    })();

    return () => {
      ac.abort();
    };
  }, [authToken, imageKey, meshKey, open, prepArch, transferId]);

  const scans = useMemo(() => {
    const byId = new Map(meshSources.map((row) => [row.id, row]));
    const ids = (
      scanOrder.length > 0 ? scanOrder : meshSources.map((row) => row.id)
    ).filter((id) => byId.has(id));
    for (const row of meshSources) {
      if (!ids.includes(row.id)) ids.push(row.id);
    }
    return ids.map((id) => {
      const row = byId.get(id)!;
      return { ...row, role: roleOverride[id] ?? row.role };
    });
  }, [meshSources, roleOverride, scanOrder]);
  const viewerItems = useMemo(
    () =>
      entries.map((entry) => ({
        ...entry,
        role: roleOverride[entry.id] ?? entry.role,
      })),
    [entries, roleOverride],
  );

  const busy = scans.some((row) => fileState[row.id] === "loading");
  const hasGhost = scans.some((row) => isOpposingOrBite(row.role, prepArch));
  const scanShown = (row: MeshSource) =>
    row.id in visible
      ? visible[row.id] !== false
      : initialLabOralScanVisible(row.role, prepArch);
  const allShown = scans.length > 0 && scans.every(scanShown);
  const swapScans = (sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const originalRole = (id: string) =>
      meshSources.find((row) => row.id === id)?.role;
    setRoleOverride((prev) => {
      const roleOf = (id: string) => prev[id] ?? originalRole(id);
      const roleA = roleOf(sourceId);
      const roleB = roleOf(targetId);
      if (!roleA || !roleB || roleA === roleB) return prev;
      const next = { ...prev };
      if (originalRole(sourceId) === roleB) delete next[sourceId];
      else next[sourceId] = roleB;
      if (originalRole(targetId) === roleA) delete next[targetId];
      else next[targetId] = roleA;
      return next;
    });
    setScanOrder((prev) => {
      const base =
        prev.length > 0 ? [...prev] : meshSources.map((row) => row.id);
      const from = base.indexOf(sourceId);
      const to = base.indexOf(targetId);
      if (from < 0 || to < 0) return base;
      const next = [...base];
      next[from] = targetId;
      next[to] = sourceId;
      return next;
    });
  };

  const toggleAllShown = () => {
    const next = !allShown;
    setVisible(Object.fromEntries(scans.map((row) => [row.id, next])));
  };

  const canUndercut = prepArch != null;
  const canContact =
    prepArch === "both"
      ? scans.some((row) => row.role === "upper") &&
        scans.some((row) => row.role === "lower")
      : prepArch === "upper"
        ? scans.some((row) => row.role === "lower")
        : prepArch === "lower"
          ? scans.some((row) => row.role === "upper")
          : false;
  const activeTooth =
    plan.teeth.find((tooth) => tooth.toothNumber === selectedTooth) ??
    plan.teeth[0] ??
    null;
  const undercutLimit = undercutLimitFromRange(40);
  const insertionAxisVisible = insertionShown && insertionKeys.length > 0;
  const paintUndercut = undercutMap || (insertionAxisVisible && canUndercut);
  viewTogglesRef.current = {
    insertion: insertionShown,
    undercut: undercutMap,
    margin: marginShown,
    center: centerGuide,
    color: colorMapping,
    contact: contactMap,
    ghost: ghostOn,
  };
  useEffect(() => {
    if (!restoreGhostVisibleRef.current || !ghostOn || scans.length === 0) return;
    restoreGhostVisibleRef.current = false;
    setVisible((prev) => {
      const out = { ...prev };
      for (const scan of scans) {
        if (!isOpposingOrBite(scan.role, prepArch)) continue;
        out[scan.id] = true;
      }
      return out;
    });
  }, [ghostOn, prepArch, scans]);
  const viewToolBtn = cn(
    "h-7 shadow-sm text-xs [&_svg]:!size-3",
    workWide ? "gap-0.5 px-2" : "w-7 px-0",
  );
  const activeNumber = activeTooth?.toothNumber ?? null;
  const activeEdit = activeNumber
    ? (edits[activeNumber] ?? createToothDesignEdit())
    : createToothDesignEdit();
  const bridgeSpan = insertionSpanForTooth(plan.teeth, activeNumber);
  const isBridgeSpan = bridgeSpan.length > 1 || activeTooth?.prosthesisType === "브리지";
  const bridges = useMemo(() => bridgeLinks(plan.teeth), [plan.teeth]);
  const spanConnectors: ConnectorRow[] = bridges
    .filter((link) => bridgeSpan.includes(link.from) && bridgeSpan.includes(link.to))
    .map((link) => ({
      ...link,
      edit: edits[link.from] ?? createToothDesignEdit(),
    }));
  const bridgeMembers = planSpanMembers(plan.teeth, bridgeSpan);
  const bridgeReady =
    bridgeMembers.length > 1 && bridgeMembers.every((tooth) => generated[tooth] === true);
  const bridgeAssembled = spanAssembled(bridgeSpan, edits);
  const activeConnectorFrom =
    spanConnectors.find((row) => row.from === connectorFrom)?.from ??
    spanConnectors.find((row) => row.from === activeNumber || row.to === activeNumber)
      ?.from ??
    spanConnectors[0]?.from ??
    null;
  const exportRestorations = useMemo(
    () => designExportRestorations(plan.teeth, generated, edits),
    [edits, generated, plan.teeth],
  );
  const exportScans = useMemo(() => {
    const out: DesignExportScan[] = [];
    for (const role of ["upper", "lower", "bite"] as const) {
      if (!scans.some((row) => row.role === role)) continue;
      const label = oralScanRoleLabel(role);
      out.push({ role, label, fileName: `${label}.stl` });
    }
    return out;
  }, [scans]);

  const buildExportFiles = (selection: DesignExportSelection) =>
    (
      viewerRef.current?.exportDesignStl({
        groups: selection.restorations.map((row) => ({
          fileName: row.fileName,
          teeth: row.teeth,
        })),
        scans: selection.scans.map((row) => ({ fileName: row.fileName, role: row.role })),
        camCoordinates: selection.camCoordinates,
      }) ?? []
    ).map((row) => new File([row.blob], row.fileName, { type: "model/stl" }));

  const downloadExport = async (selection: DesignExportSelection) => {
    setExportBusy(true);
    try {
      const files = buildExportFiles(selection);
      if (files.length === 0) {
        toast({ title: "내보낼 메시가 없습니다.", variant: "destructive" });
        return;
      }
      if (files.length === 1) {
        downloadBlobFile(files[0]!, files[0]!.name);
      } else {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        for (const file of files) zip.file(file.name, file);
        const blob = await zip.generateAsync({ type: "blob" });
        downloadBlobFile(blob, `${exportBaseName(caseHeader?.primary)}.zip`);
      }
      setExportOpen(false);
    } finally {
      setExportBusy(false);
    }
  };

  const attachExport = (selection: DesignExportSelection) => {
    if (!onAttachChatFile) return;
    const files = buildExportFiles(selection);
    if (files.length === 0) {
      toast({ title: "내보낼 메시가 없습니다.", variant: "destructive" });
      return;
    }
    for (const file of files) onAttachChatFile(file);
    setExportOpen(false);
    toast({
      title: "채팅에 첨부했습니다.",
      description: (
        <>
          STL {files.length}개가 대화 입력에 있습니다.
          <br />
          디자인을 닫고 보내기를 누르면 상대에게 전달됩니다.
        </>
      ),
    });
  };

  const focusRow =
    spanConnectors.find((row) => row.from === activeConnectorFrom) ?? null;
  focusRowRef.current = focusRow;
  const focusShown =
    focusViewOn &&
    stage === "design" &&
    modifyTool === "connector" &&
    isBridgeSpan &&
    focusRow != null &&
    generated[focusRow.from] === true &&
    generated[focusRow.to] === true;
  // 단면 이미지는 커넥터를 빼고 그린다. 커넥터 값이 바뀌어도 다시 찍지 않는다.
  const focusShotKey = focusShown && focusRow
    ? JSON.stringify([
        focusRow.from,
        focusRow.to,
        focusRow.edit.connector.along,
        insertionKeys,
        [focusRow.from, focusRow.to].map((tooth) => {
          const { connector: _connector, ...rest } = edits[tooth] ?? createToothDesignEdit();
          return rest;
        }),
      ])
    : "";
  useEffect(() => {
    if (!focusShotKey) {
      setConnectorShot(null);
      return;
    }
    const row = focusRowRef.current;
    if (!row) return;
    const timer = window.setTimeout(() => {
      setConnectorShot(
        viewerRef.current?.captureConnectorSection(
          { from: row.from, to: row.to },
          row.edit.connector,
        ) ?? null,
      );
    }, 120);
    return () => window.clearTimeout(timer);
  }, [focusShotKey]);
  const prepBackTransparent = Boolean(activeNumber && edits[activeNumber]?.margin.showBack);
  const designEdit = useMemo(
    () =>
      stage === "scan" && !marginShown
        ? null
        : {
            tool: modifyTool,
            marginMode,
            brush: editBrush,
            edits,
            generated,
            activeTooth: activeNumber,
            bridges,
            prepBackTransparent,
            showMargin: marginShown,
          },
    [
      activeNumber,
      bridges,
      editBrush,
      edits,
      generated,
      marginMode,
      marginShown,
      modifyTool,
      prepBackTransparent,
      stage,
    ],
  );

  useEffect(() => {
    if (!open || stage === "scan" || plan.teeth.length === 0) return;
    setEdits((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const tooth of plan.teeth) {
        if (next[tooth.toothNumber]) continue;
        next[tooth.toothNumber] = createToothDesignEdit();
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [open, plan.teeth, stage]);

  const publishHistory = () => {
    const book = historyRef.current;
    setCanUndo(book.past.length > 0);
    setCanRedo(book.future.length > 0);
  };

  const workSnapshotKey = () =>
    `${JSON.stringify(editsRef.current)}\n${JSON.stringify(generatedRef.current)}\n${JSON.stringify(marginReviewRef.current)}`;

  const takeSnap = (withJaws: boolean): WorkUndoSnap => ({
    edits: structuredClone(editsRef.current),
    generated: { ...generatedRef.current },
    marginReview: { ...marginReviewRef.current },
    jaws: withJaws ? (viewerRef.current?.captureJawPositions() ?? []) : null,
    archAligned: { ...archAlignedRef.current },
  });

  const applySnap = (snap: WorkUndoSnap) => {
    setEdits(snap.edits);
    setGenerated(snap.generated);
    setMarginReview(snap.marginReview ?? {});
    if (snap.jaws) {
      viewerRef.current?.restoreJawPositions(snap.jaws);
      setArchAligned(snap.archAligned);
    }
  };

  const finishDesignStroke = () => {
    const book = historyRef.current;
    window.clearTimeout(book.closeTimer);
    book.closeTimer = 0;
    if (!book.stroke) return;
    const key = book.strokeKey;
    book.stroke = false;
    book.strokeKey = "";
    queueSaveWorkRef.current();
    book.closeTimer = window.setTimeout(() => {
      const current = historyRef.current;
      current.closeTimer = 0;
      if (current.stroke || workSnapshotKey() !== key) return;
      const last = current.past[current.past.length - 1];
      if (!last || last.jaws) return;
      current.past.pop();
      publishHistory();
    }, 0);
  };

  const beginEditUndo = (force = false) => {
    if (alignBusy && !force) return;
    const book = historyRef.current;
    if (!book.stroke) {
      book.past.push(takeSnap(false));
      if (book.past.length > UNDO_LIMIT) book.past.shift();
      book.future = [];
      book.stroke = true;
      book.strokeKey = workSnapshotKey();
      publishHistory();
    }
    window.clearTimeout(book.closeTimer);
    book.closeTimer = window.setTimeout(finishDesignStroke, 400);
  };

  const pushJawCheckpoint = () => {
    const book = historyRef.current;
    window.clearTimeout(book.closeTimer);
    book.closeTimer = 0;
    if (book.stroke) {
      if (workSnapshotKey() === book.strokeKey) book.past.pop();
      book.stroke = false;
      book.strokeKey = "";
    }
    book.past.push(takeSnap(true));
    if (book.past.length > UNDO_LIMIT) book.past.shift();
    book.future = [];
    publishHistory();
  };

  const discardJawCheckpoint = (beforeSig: string) => {
    const book = historyRef.current;
    const last = book.past[book.past.length - 1];
    if (!last?.jaws) return;
    const sig = viewerRef.current?.changedScanSignature() ?? "";
    if (sig !== beforeSig) return;
    book.past.pop();
    publishHistory();
  };

  const undoWork = () => {
    if (alignBusy) return;
    const book = historyRef.current;
    window.clearTimeout(book.closeTimer);
    book.closeTimer = 0;
    book.stroke = false;
    book.strokeKey = "";
    const snap = book.past.pop();
    if (!snap) return;
    book.future.push(takeSnap(snap.jaws != null));
    if (book.future.length > UNDO_LIMIT) book.future.shift();
    applySnap(snap);
    publishHistory();
    queueSaveWorkRef.current();
  };

  const redoWork = () => {
    if (alignBusy) return;
    const book = historyRef.current;
    window.clearTimeout(book.closeTimer);
    book.closeTimer = 0;
    book.stroke = false;
    book.strokeKey = "";
    const snap = book.future.pop();
    if (!snap) return;
    book.past.push(takeSnap(snap.jaws != null));
    if (book.past.length > UNDO_LIMIT) book.past.shift();
    applySnap(snap);
    publishHistory();
    queueSaveWorkRef.current();
  };

  const onDesignGesture = (gesture: DesignGesture) => {
    if (gesture.type === "hole-reject") {
      setHoleNote("교합면이 아닙니다. 다른 위치를 고르세요.");
      return;
    }
    setHoleNote("");
    beginEditUndo();
    if (
      gesture.type === "margin" ||
      gesture.type === "margin-insert" ||
      gesture.type === "margin-remove"
    ) {
      setMarginReview((prev) =>
        prev[gesture.tooth] === "confirmed"
          ? prev
          : { ...prev, [gesture.tooth]: "confirmed" },
      );
    }
    if (gesture.type === "connector") {
      setConnectorFrom(gesture.tooth);
      if (editsRef.current[gesture.tooth]?.connector.assembled) return;
    }
    setEdits((prev) => {
      const current = prev[gesture.tooth] ?? createToothDesignEdit();
      const next = reduceDesignGesture(current, gesture, marginMode === "pen");
      return { ...prev, [gesture.tooth]: next };
    });
  };

  const setConnector = (from: string, connector: ToothDesignEdit["connector"]) => {
    beginEditUndo();
    setConnectorFrom(from);
    setEdits((prev) => {
      const base = prev[from] ?? createToothDesignEdit();
      return { ...prev, [from]: { ...base, connector } };
    });
    queueSaveWorkRef.current();
  };

  /** 조립·분리는 스팬 전체에 같이 건다. */
  const setSpanAssembled = (span: readonly string[], assembled: boolean) => {
    const members = planSpanMembers(plan.teeth, span);
    if (members.length < 2) return;
    if (assembled && !members.every((tooth) => generatedRef.current[tooth] === true)) {
      return;
    }
    beginEditUndo();
    setEdits((prev) => {
      const out = { ...prev };
      for (const tooth of members) {
        const base = out[tooth] ?? createToothDesignEdit();
        out[tooth] = { ...base, connector: { ...base.connector, assembled } };
      }
      return out;
    });
    queueSaveWorkRef.current();
  };

  /** 지대치 ↔ 폰틱. 스팬에 지대치가 하나는 남아야 한다. */
  const togglePontic = (toothNumber: string) => {
    const span = insertionSpanForTooth(plan.teeth, toothNumber);
    const current = editsRef.current[toothNumber] ?? createToothDesignEdit();
    const nextOn = !current.pontic.on;
    if (nextOn) {
      const abutments = span.filter(
        (tooth) => tooth !== toothNumber && !editsRef.current[tooth]?.pontic.on,
      );
      if (abutments.length === 0) return;
    }
    beginEditUndo();
    const out = {
      ...editsRef.current,
      [toothNumber]: { ...current, pontic: { ...current.pontic, on: nextOn } },
    };
    for (const tooth of span) {
      const row = out[tooth] ?? createToothDesignEdit();
      out[tooth] = { ...row, connector: { ...row.connector, assembled: false } };
    }
    editsRef.current = out;
    setEdits(out);
    setGenerated((prev) => ({ ...prev, [toothNumber]: false }));
    if (!nextOn) runMarginDetect([toothNumber]);
    queueSaveWorkRef.current();
  };

  const marginToothNumbersRef = useRef<string[]>([]);
  marginToothNumbersRef.current = (
    plan.designableTeeth.length > 0 ? plan.designableTeeth : prepTeeth
  ).map((tooth) => tooth.toothNumber);
  const clinicKey = clinicKeyFromCasePrimary(caseHeader?.primary);
  useEffect(() => {
    if (!open) return;
    setClinicPreset(clinicKey ? readClinicMaterialPreset(clinicKey) : null);
  }, [clinicKey, open]);

  const runMarginDetect = (toothNumbers: readonly string[]) => {
    const targets = toothNumbers.filter((number) => {
      if (!number) return false;
      const review = marginReviewRef.current[number];
      if (review === "detected" || review === "confirmed") return false;
      if (editsRef.current[number]?.margin.deleted) return false;
      if (editsRef.current[number]?.pontic.on) return false;
      return true;
    });
    if (targets.length === 0) return;
    const detected = new Map(
      (viewerRef.current?.detectColorMargins(targets) ?? []).map((row) => [
        row.tooth,
        row,
      ]),
    );
    beginEditUndo(true);
    setEdits((prev) => {
      const next = { ...prev };
      for (const number of targets) {
        const current = next[number] ?? createToothDesignEdit();
        const hit = detected.get(number);
        next[number] = hit
          ? applyDetectedMargin(current, hit.radii, hit.depths)
          : redetectMargin(current);
      }
      return next;
    });
    setMarginReview((prev) => {
      const next = { ...prev };
      for (const number of targets) next[number] = "detected";
      return next;
    });
    setMarginShown(true);
    queueSaveWorkRef.current();
  };

  const runGenerate = async (toothNumbers: string[]) => {
    if (designScopeRef.current !== "crown") return;
    const targets = toothNumbers.filter(
      (number) =>
        number &&
        (editsRef.current[number]?.pontic.on === true ||
          marginReviewRef.current[number] === "confirmed"),
    );
    if (targets.length === 0) return;
    const seq = genSeq.current + 1;
    genSeq.current = seq;
    setGenerating(true);
    setStage("design");
    const willBeThin = targets.some((number) => {
      const edit = editsRef.current[number];
      return Boolean(edit && shellIsThin(edit));
    });
    if (willBeThin) setContactMap(false);
    else if (canContact) setContactMap(true);
    setGenLabel(
      willBeThin
        ? "보철을 생성하는 중"
        : canContact
          ? "교합 접촉을 계산하는 중"
          : "보철을 생성하는 중",
    );
    viewerRef.current?.setView("occlusal");
    await wait(900);
    if (genSeq.current !== seq) return;
    setGenerating(false);
    setGenLabel("");
    beginEditUndo();
    setGenerated((prev) => {
      const next = { ...prev };
      for (const number of targets) next[number] = true;
      return next;
    });
    setModifyTool("refine");
    setStage("design");
    queueSaveWorkRef.current();
  };

  const chooseScope = (next: DesignScope) => {
    designScopeRef.current = next;
    setDesignScope(next);
    setStage("margin");
    setMarginShown(true);
    setModifyTool("margin");
    setAlignKind(null);
    setAlignArch(null);
    if (canUndercut) setUndercutMap(true);
    runMarginDetect(marginToothNumbersRef.current);
    queueSaveWorkRef.current();
  };

  const confirmMargin = (toothNumber: string) => {
    if (marginReviewRef.current[toothNumber] !== "detected") return;
    if (editsRef.current[toothNumber]?.margin.deleted) return;
    beginEditUndo();
    setMarginReview((prev) => ({ ...prev, [toothNumber]: "confirmed" }));
    queueSaveWorkRef.current();
  };

  const applyPresetToTooth = (toothNumber: string, presetId: InnerPresetId) => {
    beginEditUndo();
    setEdits((prev) => {
      const current = prev[toothNumber] ?? createToothDesignEdit();
      const next =
        presetId === "clinic" && clinicPreset
          ? applyClinicMaterialPreset(current, clinicPreset)
          : applyInnerPreset(current, presetId);
      return { ...prev, [toothNumber]: next };
    });
    queueSaveWorkRef.current();
  };

  const onStage = (next: DesignStage) => {
    if (next !== "scan" && !designScopeRef.current) return;
    if (next === "design" && designScopeRef.current !== "crown") return;
    setStage(next);
    setMarginShown(next !== "scan");
    if (next !== "scan") {
      setAlignKind(null);
      setAlignArch(null);
    }
    if (next === "scan") return;
    if (canUndercut) setUndercutMap(true);
    if (next === "design" && canContact) setContactMap(true);
  };

  const hasUpperScan = scans.some((row) => row.role === "upper");
  const hasLowerScan = scans.some((row) => row.role === "lower");
  const hasBiteScan = scans.some((row) => row.role === "bite");
  const canAlignModels = hasBiteScan && (hasUpperScan || hasLowerScan) && entries.length > 0;

  const runAutoAlign = async () => {
    const before = viewerRef.current?.changedScanSignature() ?? "";
    pushJawCheckpoint();
    setAlignKind("auto");
    setAlignArch(null);
    setAlignPicks({ model: 0, bite: 0 });
    setAlignBusy(true);
    const fitted = await viewerRef.current?.alignToBiteAuto();
    if (fitted !== true) discardJawCheckpoint(before);
    setAlignBusy(false);
    setAlignKind(null);
    if (fitted === true) {
      setArchAligned((prev) => ({
        upper: prev.upper || hasUpperScan,
        lower: prev.lower || hasLowerScan,
      }));
      queueSaveWorkRef.current();
      runMarginDetect(marginToothNumbersRef.current);
    }
  };

  const showTooth = (toothNumber: string) => {
    setSelectedTooth(toothNumber);
    const span = insertionSpanForTooth(plan.teeth, toothNumber);
    const restored =
      span.length > 0 &&
      viewerRef.current?.restoreInsertionView(span) === true;
    if (!restored) viewerRef.current?.focusTooth(toothNumber);
  };

  const applyColorDetections = (
    detected: ReadonlyArray<{ tooth: string; radii: number[]; depths: number[] }>,
  ) => {
    const fresh = detected.filter((row) => {
      if (marginReviewRef.current[row.tooth] === "confirmed") return false;
      if (editsRef.current[row.tooth]?.margin.deleted) return false;
      return true;
    });
    if (fresh.length === 0) return;
    beginEditUndo();
    setEdits((prev) => {
      const next = { ...prev };
      for (const row of fresh) {
        const current = next[row.tooth] ?? createToothDesignEdit();
        next[row.tooth] = applyDetectedMargin(current, row.radii, row.depths);
      }
      return next;
    });
    setMarginReview((prev) => {
      const next = { ...prev };
      for (const row of fresh) {
        if (next[row.tooth] !== "confirmed") next[row.tooth] = "detected";
      }
      return next;
    });
  };

  const rememberInsertion = (toothNumbers: readonly string[]) => {
    const ok = viewerRef.current?.setInsertionFromView(toothNumbers) === true;
    if (!ok) return;
    const key = insertionAxisKey(toothNumbers);
    if (!key) return;
    setInsertionKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setInsertionShown(true);
    applyColorDetections(viewerRef.current?.detectColorMargins(toothNumbers) ?? []);
    queueSaveWorkRef.current();
  };

  /** 작업 위저드 — 삽입축을 스팬 순서대로 하나씩 안내한다. 바이트는 열 때 맞춰진다. */
  const insertionWizardSpans = useMemo(
    () => [...insertionSpansByOwner(plan.teeth).values()],
    [plan.teeth],
  );
  const pendingInsertionSpans = useMemo(
    () =>
      insertionWizardSpans.filter((span) => {
        const key = insertionAxisKey(span);
        return !key || !insertionKeys.includes(key);
      }),
    [insertionWizardSpans, insertionKeys],
  );
  const pendingInsertionSpan = pendingInsertionSpans[0] ?? null;
  const alignWizardStep: "axis" | null = pendingInsertionSpan ? "axis" : null;
  const pendingInsertionSpanKey = pendingInsertionSpan
    ? insertionAxisKey(pendingInsertionSpan)
    : "";

  useEffect(() => {
    if (busy || alignWizardStep !== "axis" || !pendingInsertionSpan) return;
    const lead = pendingInsertionSpan[0];
    if (!lead) return;
    showTooth(lead);
    setCenterGuide((mode) => (mode === "off" ? "center" : mode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alignWizardStep, pendingInsertionSpanKey, busy]);

  const enqueueDraft = useCallback((task: () => Promise<void>) => {
    const run = draftQueueRef.current.then(task, task);
    draftQueueRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, []);

  const currentWorkDocument = useCallback((): WorkSessionDocument => {
    const axes =
      viewerRef.current?.exportInsertionAxes() ??
      sessionDocRef.current?.insertionAxes ??
      [];
    return {
      edits: editsRef.current,
      generated: generatedRef.current,
      marginReview: marginReviewRef.current,
      designScope: designScopeRef.current,
      insertionAxes: axes,
      archAligned: archAlignedRef.current,
      camera:
        viewerRef.current?.exportCamera() ??
        sessionDocRef.current?.camera ??
        null,
      viewToggles: viewTogglesRef.current,
      savedAt: Date.now(),
    };
  }, []);

  const flushWorkDraft = useCallback(() => {
    if (!autoSaveRef.current) return Promise.resolve();
    const id = String(transferId || "").trim();
    if (!id) return Promise.resolve();
    return enqueueDraft(async () => {
      if (saveLockRef.current || suspendDraftRef.current) return;
      const document = currentWorkDocument();
      const docSig = workDocumentSignature(document);
      const sig = viewerRef.current?.changedScanSignature() ?? "";
      const meshes =
        sig && sig !== lastDraftSigRef.current
          ? (viewerRef.current?.exportChangedScans() ?? [])
          : [];
      if (docSig === lastDocSigRef.current && meshes.length === 0) return;
      await writeWorkSession(id, { meshes, document });
      if (meshes.length > 0 && sig) lastDraftSigRef.current = sig;
      lastDocSigRef.current = docSig;
      sessionDocRef.current = document;
    });
  }, [currentWorkDocument, enqueueDraft, transferId]);

  const queueSaveWork = useCallback(() => {
    if (!autoSaveRef.current) return;
    window.clearTimeout(draftTimerRef.current);
    draftTimerRef.current = window.setTimeout(() => {
      void flushWorkDraft();
    }, 0);
  }, [flushWorkDraft]);
  queueSaveWorkRef.current = queueSaveWork;

  useEffect(() => {
    if (!open) return;
    const onHide = () => {
      window.clearTimeout(draftTimerRef.current);
      if (!autoSaveRef.current) return;
      void flushWorkDraft();
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") onHide();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.clearTimeout(draftTimerRef.current);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [flushWorkDraft, open]);

  const persistWorkingScans = useCallback(async (snapshot: WorkCloseSnapshot) => {
    const { id, token, dirty, document, pendingRoles, serverAt } = snapshot;
    try {
      await enqueueDraft(async () => {
        try {
          const encoded =
            dirty.length > 0 ? await writeWorkDraftMeshes(id, dirty) : [];
          await writeWorkSessionDocument(id, document);
          const draft = await readWorkDraft(id);
          const dirtyRoles = new Set(dirty.map((row) => row.role));
          const wanted = new Set<WorkScanRole>([
            ...newerDraftRoles(draft, serverAt),
            ...dirtyRoles,
            ...pendingRoles,
          ]);
          if (wanted.size === 0) return;

          const blobs: File[] = [];
          const roles: WorkScanRole[] = [];
          for (const file of encoded) {
            if (!wanted.has(file.role)) continue;
            blobs.push(
              new File([file.bytes], file.fileName, {
                type: "application/octet-stream",
              }),
            );
            roles.push(file.role);
          }
          // 이번 세션에서 움직이지 않은 초안은 IndexedDB 바이트를 올린다.
          // 화면 배치까지 파일에 넣으면 다음에 열 때 배치가 두 번 적용된다.
          for (const file of draft?.files || []) {
            if (!wanted.has(file.role) || dirtyRoles.has(file.role) || !file.bytes) {
              continue;
            }
            blobs.push(
              new File([file.bytes], file.fileName, {
                type: "application/octet-stream",
              }),
            );
            roles.push(file.role);
          }
          if (blobs.length === 0) return;

          const uploaded = await uploadFiles(blobs);
          const mapped = uploaded.map((file, index) => {
            const originalName = String(
              file.originalName || blobs[index]?.name || "",
            ).trim();
            const s3Key = String(file.key || "").trim();
            const role = roles[index];
            const local = blobs[index];
            if (!originalName || !s3Key || !role || !local) return null;
            sessionScanFileCache.set(s3Key, local);
            return {
              local,
              patientName: "",
              tooth: "",
              scanRole: role,
              scanRoleSetBy: "lab" as const,
              file: {
                originalName,
                mimetype: "application/octet-stream",
                size: Number(file.size || local.size || 0) || 0,
                s3Key,
              },
            };
          });
          const payload = mapped.filter((row) => row != null);
          if (!payload.length) {
            throw new Error("작업 스캔 업로드에 실패했습니다.");
          }
          const cacheReady = Promise.all(
            payload.map((row) =>
              setFileBlob(s3FileBlobCacheKey(row.file.s3Key), row.local),
            ),
          ).then(
            () => undefined,
            () => undefined,
          );
          const appended = await apiFetch({
            path: `/api/practice/transfers/received/${encodeURIComponent(id)}/work-scan-files`,
            method: "POST",
            token,
            jsonBody: {
              files: payload.map((row) => ({
                patientName: row.patientName,
                tooth: row.tooth,
                scanRole: row.scanRole,
                scanRoleSetBy: row.scanRoleSetBy,
                file: row.file,
              })),
            },
          });
          if (!appended.ok) {
            throw new Error(
              apiMessage(appended.data) || "작업 스캔 저장에 실패했습니다.",
            );
          }
          const savedRoles = new Set(roles);
          const data = unwrapApiData(appended.data);
          const production =
            data.production && typeof data.production === "object"
              ? (data.production as Record<string, unknown>)
              : {};
          const synced = newestWorkScanUploadedAtMs(
            filesOfApi(production.labWorkScanFiles),
          );
          let stamp = 0;
          for (const role of savedRoles) {
            stamp = Math.max(stamp, synced.get(role) ?? 0);
          }
          if (stamp > 0) {
            await stampWorkDraftSavedAt(id, [...savedRoles], stamp);
          }
          await Promise.all([
            dropWorkDraftRoles(id, [...savedRoles]),
            cacheReady,
          ]);
          onWorkingScansPersisted?.({
            files: data.files,
            trashedFiles: data.trashedFiles,
            workScanFiles: production.labWorkScanFiles,
          });
          const labels = [...savedRoles].map((role) => oralScanRoleLabel(role));
          toast({
            title: "작업 스캔을 저장했습니다.",
            description: (
              <>
                {labels.join(", ")} DCM이 작업 파일에 추가됐습니다.
                <br />
                AI를 다시 열면 이 파일을 읽고, 목록에서 다운로드할 수 있습니다.
              </>
            ),
          });
        } catch (error) {
          suspendDraftRef.current = false;
          toast({
            title: "작업 스캔 저장 실패",
            description:
              error instanceof Error
                ? error.message
                : "작업 스캔을 저장하지 못했습니다.",
            variant: "destructive",
          });
        }
      });
    } finally {
      saveLockRef.current = false;
    }
  }, [enqueueDraft, onWorkingScansPersisted, toast, uploadFiles]);

  const undoWorkRef = useRef(undoWork);
  const redoWorkRef = useRef(redoWork);
  const finishStrokeRef = useRef(finishDesignStroke);
  undoWorkRef.current = undoWork;
  redoWorkRef.current = redoWork;
  finishStrokeRef.current = finishDesignStroke;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undoWorkRef.current();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        redoWorkRef.current();
      }
    };
    const onUp = () => finishStrokeRef.current();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerup", onUp);
    };
  }, [open]);

  const requestOpenChange = (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (saveLockRef.current) return;
    window.clearTimeout(draftTimerRef.current);
    const id = String(transferId || "").trim();
    if (!autoSaveRef.current || alignBusy || !id || !authToken) {
      if (alignBusy) suspendDraftRef.current = true;
      onOpenChange(false);
      return;
    }
    const snapshot: WorkCloseSnapshot = {
      id,
      token: authToken,
      dirty: viewerRef.current?.exportChangedScans() ?? [],
      document: currentWorkDocument(),
      pendingRoles: [...pendingDraftRolesRef.current],
      serverAt: newestWorkScanUploadedAtMs(filesRef.current || []),
    };
    suspendDraftRef.current = true;
    saveLockRef.current = true;
    onOpenChange(false);
    window.requestAnimationFrame(() => {
      void persistWorkingScans(snapshot);
    });
  };

  const panelLayout: PanelLayout = panelsHidden
    ? "hidden"
    : scanListOpen || modifyPanelOpen || toothInfoOpen
      ? "open"
      : "closed";
  const panelsShown = panelLayout !== "hidden";
  const panelAction = panelLayoutAction(panelLayout);
  if (
    open &&
    !panelsHidden &&
    (panelHeaderFoldedRef.current
      ? scanListOpen || modifyPanelOpen || toothInfoOpen
      : true)
  ) {
    if (panelHeaderFoldedRef.current) panelHeaderFoldedRef.current = false;
    panelOpenMemoryRef.current = {
      scanList: scanListOpen,
      scanNames: scanNamesOpen,
      modify: modifyPanelOpen,
      toothInfo: toothInfoOpen,
    };
  }
  const cyclePanelLayout = () => {
    if (panelLayout === "open") {
      panelOpenMemoryRef.current = {
        scanList: scanListOpen,
        scanNames: scanNamesOpen,
        modify: modifyPanelOpen,
        toothInfo: toothInfoOpen,
      };
      panelHeaderFoldedRef.current = true;
      setScanListOpen(false);
      setModifyPanelOpen(false);
      setToothInfoOpen(false);
      return;
    }
    if (panelLayout === "closed") {
      setPanelsHidden(true);
      return;
    }
    const remembered = panelOpenMemoryRef.current;
    panelHeaderFoldedRef.current = false;
    setPanelsHidden(false);
    setScanListOpen(remembered.scanList);
    setScanNamesOpen(remembered.scanNames);
    setModifyPanelOpen(remembered.modify);
    setToothInfoOpen(remembered.toothInfo);
  };

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent
        className={cn(
          "inset-0 left-0 top-0 z-[480] flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0",
          "sm:inset-0 sm:left-0 sm:top-0 sm:h-[100dvh] sm:max-h-[100dvh] sm:w-screen sm:max-w-none sm:translate-x-0 sm:translate-y-0 sm:rounded-none sm:p-0",
          "duration-0 data-[state=open]:animate-none data-[state=closed]:animate-none",
        )}
        overlayClassName="z-[475]"
        closeClassName="right-3 top-3 z-20"
        closeIconClassName="h-5 w-5"
        onInteractOutside={(event) => {
          const target = event.target;
          if (
            target instanceof Element &&
            (target.closest("[data-radix-popper-content-wrapper]") ||
              target.closest("[data-lab-basket-layer]") ||
              target.closest(".lab-basket-layer-overlay"))
          ) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader className="relative shrink-0 flex-row items-center justify-between gap-3 space-y-0 border-b bg-white/95 py-2 pl-5 pr-3 text-left">
          <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-x-3 overflow-hidden">
            <DialogTitle className="shrink-0 text-base sm:text-lg">
              AI 디자인
            </DialogTitle>
            <CaseHeaderLines header={caseHeader} />
            {basketTag ? (
              <div className="flex shrink-0 items-center gap-0.5">
                <LabBasketTagPickerButton
                  value={basketTag.value}
                  occupiedTags={basketTag.occupiedTags}
                  onChange={basketTag.onChange}
                  popoverClassName="z-[520]"
                />
                <LabBasketTagGuideButton elevated />
              </div>
            ) : null}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(
              "absolute left-1/2 top-1/2 z-10 h-8 -translate-x-1/2 -translate-y-1/2 [&_svg]:!size-3.5",
              headerWide ? "gap-1 px-2.5" : "w-8 px-0",
            )}
            aria-label={panelAction}
            title={panelAction}
            onClick={cyclePanelLayout}
          >
            {panelLayout === "open" ? (
              <PanelLeftClose />
            ) : panelLayout === "closed" ? (
              <PanelLeftDashed />
            ) : (
              <PanelLeftOpen />
            )}
            {headerWide ? <span>{panelAction}</span> : null}
          </Button>
          <div className="flex shrink-0 items-center justify-end gap-1.5 pr-8">
            <label
              className="mr-0.5 flex items-center gap-2 whitespace-nowrap text-xs font-medium text-foreground"
              title="자동 저장"
            >
              {headerWide ? <span>자동 저장</span> : null}
              <Switch
                checked={autoSave}
                onCheckedChange={(on) => {
                  setAutoSave(on);
                  autoSaveRef.current = on;
                  try {
                    window.localStorage.setItem(AUTO_SAVE_PREF_KEY, on ? "1" : "0");
                  } catch {
                    /* 저장 설정은 이 탭에서만 유지한다. */
                  }
                  if (!on) window.clearTimeout(draftTimerRef.current);
                }}
                aria-label="자동 저장"
                className="h-5 w-9 data-[state=checked]:bg-primary [&>span]:h-4 [&>span]:w-4 data-[state=checked]:[&>span]:translate-x-4"
              />
            </label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 px-0"
              disabled={!canUndo || alignBusy}
              onClick={undoWork}
              title="실행 취소"
              aria-label="실행 취소"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 px-0"
              disabled={!canRedo || alignBusy}
              onClick={redoWork}
              title="다시 실행"
              aria-label="다시 실행"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              className={cn(
                "ml-4 h-8 [&_svg]:!size-3.5",
                headerWide ? "gap-1 px-2.5" : "w-8 px-0",
              )}
              disabled={exportScans.length === 0 && exportRestorations.length === 0}
              onClick={() => setExportOpen(true)}
              title="보철과 스캔을 STL로 내보냅니다"
              aria-label="내보내기"
            >
              <ArrowDownToLine className="h-3.5 w-3.5" />
              {headerWide ? <span>내보내기</span> : null}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                "h-8 [&_svg]:!size-3.5",
                headerWide ? "gap-1 px-2.5" : "w-8 px-0",
              )}
              onClick={() => {
                const base = viewerRef.current?.captureCanvas();
                if (!base || !paintInk || !paintRef.current) {
                  viewerRef.current?.saveImage();
                  return;
                }
                void paintRef.current.compositePng(base).then((blob) => {
                  if (!blob) return;
                  downloadBlobFile(blob, paintNoteFileName("작업"));
                });
              }}
              title="현재 뷰를 PNG로 저장"
              aria-label="이미지 저장"
            >
              <ImageDown className="h-3.5 w-3.5" />
              {headerWide ? <span>이미지 저장</span> : null}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={paintOn ? "default" : "outline"}
              className={cn(
                "h-8 [&_svg]:!size-3.5",
                headerWide ? "gap-1 px-2.5" : "w-8 px-0",
              )}
              aria-pressed={paintOn}
              aria-label="페인트"
              onClick={() => setPaintOn((on) => !on)}
              title="화면 위에 표시를 그립니다"
            >
              <Pencil className="h-3.5 w-3.5" />
              {headerWide ? <span>페인트</span> : null}
            </Button>
            {paintOn
              ? VIEW_PAINT_COLORS.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    className={cn(
                      "h-5 w-5 rounded-full border border-black/10",
                      paintColor === swatch && "ring-2 ring-primary ring-offset-1",
                    )}
                    style={{ backgroundColor: swatch }}
                    aria-label={viewPaintColorLabel(swatch)}
                    onClick={() => setPaintColor(swatch)}
                  />
                ))
              : null}
            {paintOn && paintInk ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={cn(
                  "h-8 [&_svg]:!size-3.5",
                  headerWide ? "gap-1 px-2.5" : "w-8 px-0",
                )}
                title="표시 지우기"
                aria-label="표시 지우기"
                onClick={() => paintRef.current?.clear()}
              >
                <Eraser className="h-3.5 w-3.5" />
                {headerWide ? <span>표시 지우기</span> : null}
              </Button>
            ) : null}
            {onAttachChatFile ? (
              <Button
                type="button"
                size="sm"
                className={cn(
                  "h-8 [&_svg]:!size-3.5",
                  headerWide ? "gap-1 px-2.5" : "w-8 px-0",
                )}
                disabled={!paintInk}
                onClick={() => {
                  const base = viewerRef.current?.captureCanvas();
                  if (!base) return;
                  void paintRef.current?.compositePng(base).then((blob) => {
                    if (!blob) return;
                    onAttachChatFile(
                      new File([blob], paintNoteFileName("작업"), {
                        type: "image/png",
                      }),
                    );
                    toast({
                      title: "채팅에 첨부했습니다.",
                      description: (
                        <>
                          표시가 입혀진 이미지가 대화 입력에 있습니다.
                          <br />
                          디자인을 닫고 보내기를 누르면 상대에게 전달됩니다.
                        </>
                      ),
                    });
                  });
                }}
                title="표시가 입혀진 이미지를 채팅에 첨부합니다"
                aria-label="채팅 첨부"
              >
                <Paperclip className="h-3.5 w-3.5" />
                {headerWide ? <span>채팅 첨부</span> : null}
              </Button>
            ) : null}
          </div>
        </DialogHeader>

        <div ref={bindWorkArea} className="relative min-h-0 min-w-0 flex-1">
            <OralScanOverlayViewer
              ref={viewerRef}
              items={viewerItems}
              visible={visible}
              colorMapping={colorMapping}
              ghostOpacity={ghostOn ? GHOST_OPACITY_ON : 1}
              prepArch={prepArch}
              focusToothNumbers={focusToothNumbers}
              toothBadges={plan.teeth.map((tooth) => ({
                toothNumber: tooth.toothNumber,
                active: activeTooth?.toothNumber === tooth.toothNumber,
              }))}
              onSelectTooth={showTooth}
              contactMap={contactMap}
              undercutMap={paintUndercut}
              occlusalGapMm={occlusalGap}
              contactMode={contactMode}
              undercutLimit={undercutLimit}
              busy={busy}
              busyLabel={busy ? `스캔을 불러오는 중 ${progress}%` : ""}
              onScanColorChange={setHasScanColor}
              onInsertionAxisChange={(active) => {
                if (!active) setInsertionKeys([]);
              }}
              onInsertionAxisAimed={(toothNumbers) => {
                applyColorDetections(
                  viewerRef.current?.detectColorMargins(toothNumbers) ?? [],
                );
                queueSaveWorkRef.current();
              }}
              showInsertionAxis={insertionShown}
              centerGuide={centerGuide}
              designEdit={designEdit}
              onDesignGesture={onDesignGesture}
              manualAlignArch={alignKind === "manual" ? alignArch : null}
              onAlignProgress={(picks) => {
                setAlignPicks(picks);
                if (picks.model >= 3 && picks.bite >= 3) {
                  alignBeforeSigRef.current =
                    viewerRef.current?.changedScanSignature() ?? "";
                  pushJawCheckpoint();
                  setAlignBusy(true);
                }
              }}
              onAlignMerged={(arch) => {
                setAlignBusy(false);
                setAlignArch(null);
                setAlignPicks({ model: 0, bite: 0 });
                setArchAligned((prev) => ({ ...prev, [arch]: true }));
                queueSaveWorkRef.current();
                runMarginDetect(marginToothNumbersRef.current);
              }}
              onAlignFailed={() => {
                discardJawCheckpoint(alignBeforeSigRef.current);
                setAlignBusy(false);
                setAlignPicks({ model: 0, bite: 0 });
              }}
              onAlignCancelled={() => {
                discardJawCheckpoint(alignBeforeSigRef.current);
                setAlignBusy(false);
              }}
              onViewSettled={() => {
                queueSaveWorkRef.current();
              }}
              onMeshesReady={({ deformed, restore }) => {
                if (restore) {
                  const saved = sessionDocRef.current;
                  const axes = saved?.insertionAxes ?? [];
                  if (axes.length > 0) viewerRef.current?.restoreInsertionAxes(axes);
                  if (saved?.camera) viewerRef.current?.restoreCamera(saved.camera);
                }
                if (deformed) queueSaveWorkRef.current();
              }}
              className="absolute inset-0"
            />
            <ViewPaintSurface
              ref={paintRef}
              enabled={paintOn}
              color={paintColor}
              onInkChange={setPaintInk}
            />
            <div className="pointer-events-none absolute left-1/2 top-3 z-10 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col items-center gap-1.5">
              <div className="pointer-events-auto relative flex items-center justify-center">
              <div className="absolute right-full mr-5 flex items-center gap-1">
              <div className={cn("relative flex justify-center", insertionShown && "min-w-12")}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant={insertionShown ? "default" : "outline"}
                    className={viewToolBtn}
                    title="삽입축"
                    aria-label="삽입축"
                    aria-pressed={insertionShown}
                    onClick={() => setInsertionShown((on) => !on)}
                  >
                    <ArrowDownToLine />
                    {workWide ? <span>삽입축</span> : null}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="z-[520]">
                  잡은 삽입축을 치아 위에 표시합니다.
                </TooltipContent>
              </Tooltip>
              {insertionShown ? overlayLegend("bg-amber-500", "삽입축") : null}
              </div>
              <div className={cn("relative flex justify-center", paintUndercut && "min-w-12")}>
              <Button
                type="button"
                size="sm"
                variant={paintUndercut ? "default" : "outline"}
                className={viewToolBtn}
                title={canUndercut ? "언더컷" : "주문 치아의 악을 알 수 없습니다"}
                aria-label="언더컷"
                aria-pressed={paintUndercut}
                disabled={!canUndercut}
                onClick={() => {
                  if (!canUndercut || insertionAxisVisible) return;
                  setUndercutMap((on) => !on);
                }}
              >
                <TriangleAlert />
                {workWide ? <span>언더컷</span> : null}
              </Button>
              {paintUndercut ? overlayLegend("bg-red-700", "언더컷") : null}
              </div>
              <div className={cn("relative flex justify-center", marginShown && "min-w-12")}>
              <Button
                type="button"
                size="sm"
                variant={marginShown ? "default" : "outline"}
                className={viewToolBtn}
                title="마진"
                aria-label="마진"
                aria-pressed={marginShown}
                onClick={() => {
                  const next = !marginShown;
                  setMarginShown(next);
                  if (next) {
                    setStage("margin");
                    setModifyTool("margin");
                    setAlignKind(null);
                    setAlignArch(null);
                  }
                }}
              >
                <Spline />
                {workWide ? <span>마진</span> : null}
              </Button>
              {marginShown ? overlayLegend("bg-teal-500", "마진") : null}
              </div>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant={centerGuide === "off" ? "outline" : "default"}
                    className={viewToolBtn}
                    title={centerGuideLabel(centerGuide)}
                    aria-label={centerGuideLabel(centerGuide)}
                    aria-pressed={centerGuide !== "off"}
                    onClick={() => setCenterGuide((mode) => nextCenterGuide(mode))}
                  >
                    <Crosshair />
                    {workWide ? <span>{centerGuideLabel(centerGuide)}</span> : null}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="z-[520]">
                  {centerGuide === "off" ? (
                    "중앙선을 켭니다."
                  ) : centerGuide === "center" ? (
                    <>
                      2mm 간격 모눈을 켭니다.
                      <br />
                      10mm마다 더 진합니다.
                    </>
                  ) : (
                    "선을 끕니다."
                  )}
                </TooltipContent>
              </Tooltip>
              <div className="absolute left-full ml-5 flex items-center gap-1">
              {hasScanColor ? (
                <Button
                  type="button"
                  size="sm"
                  variant={colorMapping ? "default" : "outline"}
                  className={viewToolBtn}
                  title="스캔 칼라"
                  aria-label="칼라"
                  aria-pressed={colorMapping}
                  onClick={() => setColorMapping((on) => !on)}
                >
                  <Paintbrush />
                  {workWide ? <span>칼라</span> : null}
                </Button>
              ) : null}
              <div className="relative flex justify-center">
              <Button
                type="button"
                size="sm"
                variant={contactMap ? "default" : "outline"}
                className={viewToolBtn}
                title={canContact ? "교합 접촉" : "대합 스캔이 없습니다"}
                aria-label="교합 접촉"
                disabled={!canContact}
                onClick={() => {
                  if (!canContact) return;
                  setContactMap((on) => !on);
                  setMarginShown(true);
                  setStage("design");
                }}
              >
                <Palette />
                {workWide ? <span>교합 접촉</span> : null}
              </Button>
              {contactMap
                ? contactOverlayLegend()
                : plan.teeth.some((tooth) => {
                    if (generated[tooth.toothNumber] !== true) return false;
                    const edit = edits[tooth.toothNumber];
                    return Boolean(edit && shellIsThin(edit));
                  })
                  ? thicknessOverlayLegend()
                  : null}
              </div>
              {hasGhost ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant={ghostOn ? "default" : "outline"}
                      className={viewToolBtn}
                      aria-label="투명"
                      aria-pressed={ghostOn}
                      onClick={() => {
                        const next = !ghostOn;
                        setGhostOn(next);
                        setVisible((prev) => {
                          const out = { ...prev };
                          for (const scan of scans) {
                            if (!isOpposingOrBite(scan.role, prepArch)) continue;
                            out[scan.id] = next;
                          }
                          return out;
                        });
                      }}
                    >
                      <Blend />
                      {workWide ? <span>투명</span> : null}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="z-[520]">
                    대합치와 바이트를 20%로 비춥니다.
                  </TooltipContent>
                </Tooltip>
              ) : null}
              </div>
              </div>
            </div>
            {panelsShown ? (
            <>
            <div className="absolute left-3 top-3 z-10 max-h-[calc(100%-5.5rem)]">
              <div
                className={cn(
                  "flex min-h-0 max-h-[min(18rem,34vh)] flex-col overflow-hidden rounded-lg border bg-background/95 text-sm shadow-sm",
                  scanListOpen && scanNamesOpen ? "w-80" : "w-max",
                )}
              >
                <div className="flex shrink-0 items-center gap-1.5 px-2.5 py-2">
                  <Checkbox
                    checked={allShown}
                    disabled={scans.length === 0}
                    onCheckedChange={() => toggleAllShown()}
                    aria-label="표시 전체 선택"
                  />
                  <button
                    type="button"
                    className="text-left"
                    onClick={() => setScanListOpen((open) => !open)}
                    aria-expanded={scanListOpen}
                  >
                    <span className="font-semibold text-foreground">표시</span>
                  </button>
                  <div className="ml-auto flex items-center">
                    {scanNamesOpen ? (
                      <button
                        type="button"
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="파일명 숨기기"
                        onClick={() => {
                          setScanNamesOpen(false);
                          setScanListOpen(true);
                        }}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="파일명 표시"
                        onClick={() => {
                          setScanNamesOpen(true);
                          setScanListOpen(true);
                        }}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="표시 목록"
                      aria-expanded={scanListOpen}
                      onClick={() => setScanListOpen((open) => !open)}
                    >
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform",
                          scanListOpen ? "rotate-180" : "",
                        )}
                      />
                    </button>
                  </div>
                </div>
                {scanListOpen ? (
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto border-t px-3.5 py-2.5">
                    {scans.length === 0 ? (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        상악·하악·바이트 스캔이 없습니다.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {scans.map((scan) => {
                          const state = fileState[scan.id];
                          return (
                            <li
                              key={scan.id}
                              className={cn(
                                "flex min-w-0 items-center gap-2 rounded px-0.5",
                                dropScanId === scan.id &&
                                  dragScanId &&
                                  dragScanId !== scan.id &&
                                  "bg-primary/10 ring-1 ring-primary",
                              )}
                              onDragOver={(event) => {
                                if (dragScanId === scan.id) return;
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                                setDropScanId((prev) =>
                                  prev === scan.id ? prev : scan.id,
                                );
                              }}
                              onDragLeave={(event) => {
                                const next = event.relatedTarget;
                                if (
                                  next instanceof Node &&
                                  event.currentTarget.contains(next)
                                ) {
                                  return;
                                }
                                setDropScanId((prev) =>
                                  prev === scan.id ? null : prev,
                                );
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                const id = event.dataTransfer.getData("text/plain");
                                setDropScanId(null);
                                setDragScanId(null);
                                if (id) swapScans(id, scan.id);
                              }}
                            >
                              <Checkbox
                                checked={scanShown(scan)}
                                disabled={state === "loading" || state === "error"}
                                onCheckedChange={(checked) => {
                                  setVisible((prev) => ({
                                    ...prev,
                                    [scan.id]: checked === true,
                                  }));
                                }}
                                aria-label={`${oralScanRoleLabel(scan.role)} 표시`}
                              />
                              <span
                                className={cn(
                                  "h-2 w-2 shrink-0 rounded-full",
                                  ROLE_DOT[scan.role],
                                )}
                              />
                              <span className="inline-flex h-5 w-12 shrink-0 items-center justify-center text-[11px] font-semibold text-primary">
                                {oralScanRoleLabel(scan.role)}
                              </span>
                              {scanNamesOpen ? (
                                <span
                                  draggable
                                  title="끌어 다른 파일이나 상악·하악·바이트 위에 놓으면 서로 바뀝니다"
                                  className="min-w-0 flex-1 cursor-grab truncate text-xs text-foreground active:cursor-grabbing"
                                  onDragStart={(event) => {
                                    event.dataTransfer.setData("text/plain", scan.id);
                                    event.dataTransfer.effectAllowed = "move";
                                    setDragScanId(scan.id);
                                  }}
                                  onDragEnd={() => {
                                    setDragScanId(null);
                                    setDropScanId(null);
                                  }}
                                >
                                  {scan.fileName}
                                </span>
                              ) : null}
                              {scanNamesOpen && state === "error" ? (
                                <span className="shrink-0 text-[10px] text-destructive">
                                  실패
                                </span>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {busy ? <Progress value={progress} className="h-1.5" /> : null}
                    {loadError ? (
                      <p className="text-xs leading-relaxed text-destructive">
                        {loadError}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="absolute bottom-3 left-3 z-20 flex max-h-[min(36rem,62vh)] w-[min(20rem,36vw)] flex-col">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background/95 text-sm shadow-sm">
                <button
                  type="button"
                  className={cn(
                    "flex w-full shrink-0 items-center justify-between gap-3 px-3.5 py-2.5 text-left",
                    modifyPanelOpen && "border-b",
                  )}
                  onClick={() => setModifyPanelOpen((open) => !open)}
                  aria-expanded={modifyPanelOpen}
                >
                  <span className="font-semibold text-foreground">단계</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      modifyPanelOpen ? "rotate-180" : "",
                    )}
                  />
                </button>
                {modifyPanelOpen ? (
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-2.5">
                    <section className="space-y-2">
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-foreground">범위</p>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          마진만은 생성 없이 마진 수정에서 끝냅니다.
                          <br />
                          크라운까지는 마진을 확인한 뒤에 생성합니다.
                        </p>
                        <div className="grid grid-cols-2 gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant={designScope === "margin" ? "default" : "outline"}
                            className="h-7 px-2 text-[11px]"
                            onClick={() => chooseScope("margin")}
                          >
                            마진만
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={designScope === "crown" ? "default" : "outline"}
                            className="h-7 px-2 text-[11px]"
                            onClick={() => chooseScope("crown")}
                          >
                            크라운까지
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {DESIGN_STAGES.map((item) => (
                          <Button
                            key={item.id}
                            type="button"
                            size="sm"
                            variant={stage === item.id ? "default" : "outline"}
                            className="h-7 px-2 text-[11px]"
                            disabled={
                              (item.id !== "scan" && designScope == null) ||
                              (item.id === "design" && designScope !== "crown")
                            }
                            title={
                              item.id !== "scan" && designScope == null
                                ? "범위를 먼저 고릅니다."
                                : item.id === "design" && designScope !== "crown"
                                  ? "마진만 진행 중입니다."
                                  : undefined
                            }
                            onClick={() => {
                              onStage(item.id);
                              if (item.id === "margin") setModifyTool("margin");
                              if (item.id === "design") setModifyTool("refine");
                            }}
                          >
                            {item.label}
                          </Button>
                        ))}
                      </div>
                    </section>
                    {stage === "scan" ? (
                      <section className="space-y-2">
                        <p className="text-xs font-semibold text-foreground">모델 정렬</p>
                        <div className="grid grid-cols-2 gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex min-w-0">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={alignBusy ? "default" : "outline"}
                                  className="h-7 w-full px-2 text-[11px]"
                                  disabled={!canAlignModels || alignBusy}
                                  onClick={() => void runAutoAlign()}
                                >
                                  자동
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="z-[520]">
                              파일 위치에서 상악·하악을 바이트에 맞춥니다.
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex min-w-0">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={alignKind === "manual" ? "default" : "outline"}
                                  className="h-7 w-full px-2 text-[11px]"
                                  disabled={!canAlignModels || alignBusy}
                                  onClick={() => {
                                    if (alignKind === "manual") {
                                      setAlignKind(null);
                                      setAlignArch(null);
                                      return;
                                    }
                                    setAlignKind("manual");
                                    setAlignArch(null);
                                    setAlignPicks({ model: 0, bite: 0 });
                                  }}
                                >
                                  수동
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="z-[520]">
                              붙일 악을 고른 뒤 점 3개씩 찍습니다.
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        {alignBusy ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 w-full px-2 text-[11px]"
                            onClick={() => viewerRef.current?.cancelAlign()}
                          >
                            취소
                          </Button>
                        ) : null}
                        {alignKind === "manual" ? (
                          <>
                            <div className="grid grid-cols-2 gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex min-w-0">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={alignArch === "upper" ? "default" : "outline"}
                                      className="h-7 w-full px-2 text-[11px]"
                                      disabled={!hasUpperScan || alignBusy}
                                      onClick={() => {
                                        if (alignArch === "upper") {
                                          viewerRef.current?.clearAlignPicks();
                                          setAlignPicks({ model: 0, bite: 0 });
                                          return;
                                        }
                                        setAlignArch("upper");
                                        setAlignPicks({ model: 0, bite: 0 });
                                      }}
                                    >
                                      상악
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="z-[520]">
                                  상악과 바이트만 화면 가운데에 나란히 보입니다.
                                  <br />
                                  같은 순서로 점 3개씩 찍습니다.
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex min-w-0">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={alignArch === "lower" ? "default" : "outline"}
                                      className="h-7 w-full px-2 text-[11px]"
                                      disabled={!hasLowerScan || alignBusy}
                                      onClick={() => {
                                        if (alignArch === "lower") {
                                          viewerRef.current?.clearAlignPicks();
                                          setAlignPicks({ model: 0, bite: 0 });
                                          return;
                                        }
                                        setAlignArch("lower");
                                        setAlignPicks({ model: 0, bite: 0 });
                                      }}
                                    >
                                      하악
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="z-[520]">
                                  하악과 바이트만 화면 가운데에 나란히 보입니다.
                                  <br />
                                  같은 순서로 점 3개씩 찍습니다.
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            {alignArch ? (
                              <>
                                <p className="text-[11px] font-medium text-foreground">
                                  모델 {alignPicks.model}/3 · 바이트 {alignPicks.bite}/3
                                </p>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 w-full px-2 text-[11px]"
                                  disabled={
                                    alignBusy ||
                                    (alignPicks.model === 0 && alignPicks.bite === 0)
                                  }
                                  onClick={() => {
                                    viewerRef.current?.clearAlignPicks();
                                    setAlignPicks({ model: 0, bite: 0 });
                                  }}
                                >
                                  점 지우기
                                </Button>
                              </>
                            ) : null}
                          </>
                        ) : null}
                      </section>
                    ) : null}
                    {stage !== "scan" ? (
                      <LabProsthesisModifyPanel
                        tool={modifyTool}
                        onTool={(next) => {
                          setModifyTool(next);
                          setEditBrush("none");
                          setHoleNote("");
                          if (next === "margin" || next === "insertion") onStage("margin");
                          else onStage("design");
                        }}
                        marginMode={marginMode}
                        onMarginMode={setMarginMode}
                        brush={editBrush}
                        onBrush={setEditBrush}
                        edit={activeEdit}
                        onEdit={(next) => {
                          if (!activeNumber) return;
                          beginEditUndo();
                          const previous = edits[activeNumber] ?? createToothDesignEdit();
                          if (next.margin.deleted && !previous.margin.deleted) {
                            setMarginReview((prev) => ({
                              ...prev,
                              [activeNumber]: "none",
                            }));
                          } else if (
                            !next.margin.deleted &&
                            marginLineChanged(previous, next)
                          ) {
                            setMarginReview((prev) =>
                              prev[activeNumber] === "confirmed"
                                ? prev
                                : { ...prev, [activeNumber]: "confirmed" },
                            );
                          }
                          setEdits((prev) => ({ ...prev, [activeNumber]: next }));
                          queueSaveWorkRef.current();
                        }}
                        connectors={spanConnectors}
                        connectorFrom={activeConnectorFrom}
                        onConnectorFrom={setConnectorFrom}
                        onConnector={setConnector}
                        bridgeAssembled={bridgeAssembled}
                        bridgeReady={bridgeReady}
                        onAssemble={(assembled) => setSpanAssembled(bridgeSpan, assembled)}
                        focusView={focusViewOn}
                        onFocusView={setFocusViewOn}
                        toothLabel={
                          activeTooth
                            ? formatProsthesisAiToothLabel(activeTooth)
                            : null
                        }
                        generated={
                          activeNumber ? generated[activeNumber] === true : false
                        }
                        isBridge={isBridgeSpan}
                        canMatchInsertion={entries.length > 0 && bridgeSpan.length > 0}
                        holeNote={holeNote}
                        onRedetect={() => {
                          if (!activeNumber) return;
                          beginEditUndo();
                          const detected =
                            viewerRef.current?.detectColorMargins([activeNumber]) ?? [];
                          const hit = detected[0];
                          setEdits((prev) => ({
                            ...prev,
                            [activeNumber]: hit
                              ? applyDetectedMargin(
                                  prev[activeNumber] ?? createToothDesignEdit(),
                                  hit.radii,
                                  hit.depths,
                                )
                              : redetectMargin(
                                  prev[activeNumber] ?? createToothDesignEdit(),
                                ),
                          }));
                          setMarginReview((prev) => ({
                            ...prev,
                            [activeNumber]: "detected",
                          }));
                          setMarginShown(true);
                          queueSaveWorkRef.current();
                        }}
                        onClearMargin={() => {
                          if (!activeNumber) return;
                          beginEditUndo();
                          const current = edits[activeNumber] ?? createToothDesignEdit();
                          setEdits((prev) => ({
                            ...prev,
                            [activeNumber]: {
                              ...current,
                              margin: { ...current.margin, deleted: true },
                            },
                          }));
                          setMarginReview((prev) => ({
                            ...prev,
                            [activeNumber]: "none",
                          }));
                          queueSaveWorkRef.current();
                        }}
                        onMatchInsertion={() => {
                          if (bridgeSpan.length === 0) return;
                          rememberInsertion(bridgeSpan);
                          setModifyTool("insertion");
                        }}
                        onApplyInner={() => {
                          if (!activeNumber) return;
                          beginEditUndo();
                          setEdits((prev) => {
                            const current = prev[activeNumber] ?? createToothDesignEdit();
                            return {
                              ...prev,
                              [activeNumber]: {
                                ...current,
                                inner: { ...current.inner, applied: true },
                              },
                            };
                          });
                          queueSaveWorkRef.current();
                        }}
                        onRemoveHook={() => {
                          if (!activeNumber) return;
                          beginEditUndo();
                          setEdits((prev) => {
                            const current = prev[activeNumber] ?? createToothDesignEdit();
                            return {
                              ...prev,
                              [activeNumber]: {
                                ...current,
                                hook: { ...current.hook, on: false },
                              },
                            };
                          });
                          queueSaveWorkRef.current();
                        }}
                        clinicLabel={clinicKey || null}
                        clinicSaved={clinicPreset != null}
                        onApplyClinic={() => {
                          if (!activeNumber || !clinicPreset) return;
                          applyPresetToTooth(activeNumber, "clinic");
                        }}
                        onSaveClinic={() => {
                          if (!clinicKey || !activeNumber) return;
                          const current = edits[activeNumber] ?? createToothDesignEdit();
                          const preset: ClinicMaterialPreset = {
                            clinicKey,
                            label: clinicKey,
                            ...materialSnapshot(current),
                          };
                          writeClinicMaterialPreset(preset);
                          setClinicPreset(preset);
                          beginEditUndo();
                          setEdits((prev) => ({
                            ...prev,
                            [activeNumber]: {
                              ...current,
                              inner: { ...current.inner, preset: "clinic" },
                            },
                          }));
                          queueSaveWorkRef.current();
                        }}
                      />
                    ) : null}
                    {stage === "design" ? (
                      <section className="space-y-2">
                        <p className="text-xs font-semibold text-foreground">교합</p>
                        <label className="flex items-center justify-between gap-3 text-xs font-medium">
                          접촉
                          <Switch
                            checked={contactMap}
                            disabled={!canContact}
                            onCheckedChange={setContactMap}
                            aria-label="교합 접촉 표시"
                            className="h-5 w-9 data-[state=checked]:bg-primary [&>span]:h-4 [&>span]:w-4 data-[state=checked]:[&>span]:translate-x-4"
                          />
                        </label>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs font-medium">
                            <span>교합 거리</span>
                            <span className="tabular-nums text-muted-foreground">
                              {occlusalGap.toFixed(2)} mm
                            </span>
                          </div>
                          <Slider
                            min={0}
                            max={50}
                            step={5}
                            value={[Math.round(occlusalGap * 100)]}
                            disabled={!canContact}
                            onValueChange={([value]) =>
                              setOcclusalGap((value ?? 10) / 100)
                            }
                            aria-label="교합 거리"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex min-w-0">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={contactMode === "cut" ? "default" : "outline"}
                                  className="h-7 w-full px-2 text-[11px]"
                                  onClick={() => setContactMode("cut")}
                                >
                                  절삭
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="z-[520]">
                              목표보다 가까운 면은 붉고,
                              <br />
                              먼 면은 파랗습니다.
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex min-w-0">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={contactMode === "keep" ? "default" : "outline"}
                                  className="h-7 w-full px-2 text-[11px]"
                                  onClick={() => setContactMode("keep")}
                                >
                                  형태 유지
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="z-[520]">
                              초록 폭을 넓혀 형태를 남깁니다.
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </section>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            </>
            ) : null}
            <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={() => viewerRef.current?.setView("occlusal")}
                title="교합면 뷰 (상악/하악 교합면 수직 시선)"
              >
                교합면
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={() => viewerRef.current?.setView("buccal")}
                title="협측 뷰 (바깥쪽 전면 시선)"
              >
                협측
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={() => viewerRef.current?.setView("lingual")}
                title="설측 뷰 (안쪽 구개/설측 시선)"
              >
                설측
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={() => viewerRef.current?.setView("fit")}
                title="화면 맞춤 (전체 모델을 화면 크기에 맞춤)"
              >
                맞춤
              </Button>
            </div>
            {focusShown && focusRow ? (
              <div className="pointer-events-none absolute left-1/2 top-16 z-10 -translate-x-1/2">
                <ConnectorFocusView
                  shot={connectorShot}
                  link={focusRow}
                  edit={focusRow.edit}
                  locked={bridgeAssembled}
                  onShift={(shiftXMm, shiftYMm) =>
                    setConnector(focusRow.from, {
                      ...focusRow.edit.connector,
                      shiftXMm,
                      shiftYMm,
                    })
                  }
                />
              </div>
            ) : null}
            <DesignViewerChrome
              teeth={plan.teeth}
              activeTooth={activeTooth}
              edits={edits}
              generated={generated}
              marginReview={marginReview}
              designScope={designScope}
              clinicPreset={clinicPreset}
              generating={generating}
              genLabel={genLabel}
              panelsShown={panelsShown}
              toothInfoOpen={toothInfoOpen}
              insertionKeys={insertionKeys}
              canSetInsertion={entries.length > 0}
              onSelectTooth={showTooth}
              onSetInsertion={rememberInsertion}
              onToggleInfo={() => setToothInfoOpen((open) => !open)}
              onConfirmMargin={confirmMargin}
              onApplyPreset={applyPresetToTooth}
              onGenerateTooth={(toothNumber) => void runGenerate([toothNumber])}
              onGenerateSpan={(span) => void runGenerate([...span])}
              onAssembleSpan={setSpanAssembled}
              onTogglePontic={togglePontic}
              onClearTooth={(toothNumber) => {
                beginEditUndo();
                setGenerated((prev) => ({ ...prev, [toothNumber]: false }));
                const span = insertionSpanForTooth(plan.teeth, toothNumber);
                if (span.length > 1 && spanAssembled(span, editsRef.current)) {
                  setEdits((prev) => {
                    const out = { ...prev };
                    for (const tooth of span) {
                      const row = out[tooth] ?? createToothDesignEdit();
                      out[tooth] = {
                        ...row,
                        connector: { ...row.connector, assembled: false },
                      };
                    }
                    return out;
                  });
                }
                queueSaveWorkRef.current();
              }}
            />
            {!busy && entries.length > 0 ? (
              <div className="pointer-events-none absolute inset-x-3 bottom-3 z-30 flex justify-center">
                <div className="pointer-events-auto max-w-sm rounded-lg border bg-background/95 px-3.5 py-2.5 text-xs shadow-sm">
                  {alignWizardStep === "axis" && pendingInsertionSpan ? (
                    <>
                      <p className="font-semibold text-foreground">
                        1. 모델정렬 ·{" "}
                        {insertionWizardSpans.length - pendingInsertionSpans.length + 1}/
                        {insertionWizardSpans.length}
                      </p>
                      <p className="mt-1 leading-relaxed text-muted-foreground">
                        {pendingInsertionSpan.length > 1
                          ? `브리지 ${pendingInsertionSpan[0]}-${pendingInsertionSpan[pendingInsertionSpan.length - 1]}의 삽입축을 설정해주세요.`
                          : `#${pendingInsertionSpan[0]}의 삽입축을 설정해주세요.`}
                        <br />
                        해당 치아를 교합면에서 바라보고 중점을 중앙선에 맞추면 됩니다.
                      </p>
                      <div className="mt-2">
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          disabled={entries.length === 0}
                          onClick={() => rememberInsertion(pendingInsertionSpan)}
                        >
                          삽입축 설정
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-foreground">
                        {stage === "design" ? "3. 디자인" : "2. 마진"}
                      </p>
                      <p className="mt-1 leading-relaxed text-muted-foreground">
                        {stage === "design"
                          ? "확인한 마진으로 디자인을 생성해주세요."
                          : "자동 검출된 마진을 확인해주세요."}
                      </p>
                    </>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        <DesignExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          restorations={exportRestorations}
          scans={exportScans}
          busy={exportBusy}
          onDownload={(selection) => void downloadExport(selection)}
          onAttach={onAttachChatFile ? attachExport : null}
        />
      </DialogContent>
    </Dialog>
  );
}

function toothArchGroup(toothNumber: string): "upper" | "lower" | "other" {
  const quadrant = String(toothNumber || "").replace(/\D/g, "")[0];
  if (quadrant === "1" || quadrant === "2") return "upper";
  if (quadrant === "3" || quadrant === "4") return "lower";
  return "other";
}

/**
 * 브리지는 연결된 치아를 한 스팬으로 묶는다.
 * 키는 스팬을 대표하는 행의 치아번호, 값은 스팬 전체(악궁 순서).
 */
function insertionSpansByOwner(
  teeth: readonly LabProsthesisAiTooth[],
): Map<string, string[]> {
  const order = new Map<string, number>();
  teeth.forEach((tooth, index) => order.set(tooth.toothNumber, index));
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const current = parent.get(id) ?? id;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const left = find(a);
    const right = find(b);
    if (left !== right) parent.set(right, left);
  };
  const ensure = (id: string) => {
    if (!id) return;
    if (!parent.has(id)) parent.set(id, id);
  };
  for (const tooth of teeth) {
    ensure(tooth.toothNumber);
    const bridged =
      tooth.prosthesisType === "브리지" || tooth.linkedTeeth.length > 0;
    if (!bridged) continue;
    for (const linked of tooth.linkedTeeth) {
      ensure(linked);
      union(tooth.toothNumber, linked);
    }
  }
  const members = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    const list = members.get(root) ?? [];
    list.push(id);
    members.set(root, list);
  }
  const owner = new Map<string, string[]>();
  for (const list of members.values()) {
    const rows = list
      .filter((id) => order.has(id))
      .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    const lead = rows[0];
    if (!lead) continue;
    owner.set(lead, sortByArch(list));
  }
  return owner;
}

/** 스팬 중 주문에 있는 치아. 연결만 걸려 있고 주문 행이 없는 번호는 뺀다. */
function planSpanMembers(
  teeth: readonly LabProsthesisAiTooth[],
  span: readonly string[],
): string[] {
  return span.filter((tooth) => teeth.some((row) => row.toothNumber === tooth));
}

function insertionSpanForTooth(
  teeth: readonly LabProsthesisAiTooth[],
  toothNumber: string | null | undefined,
): string[] {
  const digits = fdiToothDigits(String(toothNumber || ""));
  if (!digits) return [];
  const spans = insertionSpansByOwner(teeth);
  const own = spans.get(digits);
  if (own) return own;
  for (const span of spans.values()) {
    if (span.includes(digits)) return span;
  }
  return [digits];
}

/** 주문 치아만 악궁 순서로 이은 커넥터. 설정은 앞 치아(from)에 둔다. */
function bridgeLinks(
  teeth: readonly LabProsthesisAiTooth[],
): Array<{ from: string; to: string }> {
  const pairs: Array<{ from: string; to: string }> = [];
  for (const span of insertionSpansByOwner(teeth).values()) {
    const ordered = planSpanMembers(teeth, span);
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const from = ordered[index];
      const to = ordered[index + 1];
      if (from && to) pairs.push({ from, to });
    }
  }
  return pairs;
}

/** 내보내기 목록. 브리지는 스팬 하나가 파일 하나이고, 조립해야 낸다. */
function designExportRestorations(
  teeth: readonly LabProsthesisAiTooth[],
  generated: Record<string, boolean>,
  edits: Record<string, ToothDesignEdit>,
): DesignExportRestoration[] {
  const out: DesignExportRestoration[] = [];
  for (const block of toothInfoBlocks(teeth, insertionSpansByOwner(teeth))) {
    if (block.kind === "bridge") {
      const numbers = block.members.map((tooth) => tooth.toothNumber);
      const label = `브리지 ${numbers[0]}-${numbers[numbers.length - 1]}`;
      const made = numbers.every((tooth) => generated[tooth] === true);
      out.push({
        id: `bridge:${numbers.join(",")}`,
        label,
        fileName: `${label}.stl`,
        teeth: numbers,
        blocked: !made ? "생성 전" : !spanAssembled(numbers, edits) ? "조립 전" : null,
      });
      continue;
    }
    const tooth = block.tooth;
    if (!tooth.designable) continue;
    const label = `#${tooth.toothNumber} ${tooth.prosthesisType}`;
    out.push({
      id: `tooth:${tooth.toothNumber}`,
      label,
      fileName: `${label}.stl`,
      teeth: [tooth.toothNumber],
      blocked: generated[tooth.toothNumber] === true ? null : "생성 전",
    });
  }
  return out;
}

function exportBaseName(primary: string | null | undefined) {
  const name = String(primary || "")
    .replace(/\s*·\s*/g, "_")
    .replace(/[\\/:*?"<>|]/g, "")
    .trim();
  return name ? `${name}_디자인` : "AI_디자인";
}

/** 수정값이 있는 스팬 치아가 모두 조립돼 있어야 조립된 브리지다. */
function spanAssembled(
  span: readonly string[],
  edits: Record<string, ToothDesignEdit>,
): boolean {
  const rows = span.map((tooth) => edits[tooth]).filter(Boolean);
  return rows.length > 1 && rows.every((edit) => edit!.connector.assembled);
}

type ToothInfoBlock =
  | { kind: "single"; tooth: LabProsthesisAiTooth }
  | { kind: "bridge"; members: LabProsthesisAiTooth[]; span: string[] };

/** 같은 악 안에서 브리지 스팬을 한 덩어리로 모은다. */
function toothInfoBlocks(
  teeth: readonly LabProsthesisAiTooth[],
  spans: ReadonlyMap<string, string[]>,
): ToothInfoBlock[] {
  const spanOf = new Map<string, string[]>();
  for (const span of spans.values()) {
    if (span.length < 2) continue;
    for (const id of span) spanOf.set(id, span);
  }
  const seen = new Set<string>();
  const blocks: ToothInfoBlock[] = [];
  for (const tooth of teeth) {
    if (seen.has(tooth.toothNumber)) continue;
    const span = spanOf.get(tooth.toothNumber);
    const members = span
      ? teeth
          .filter((row) => span.includes(row.toothNumber))
          .sort((a, b) => compareArch(a.toothNumber, b.toothNumber))
      : [tooth];
    for (const row of members) seen.add(row.toothNumber);
    if (!span || members.length < 2) {
      blocks.push({ kind: "single", tooth });
      continue;
    }
    blocks.push({ kind: "bridge", members: [...members], span });
  }
  return blocks;
}

function marginLineChanged(prev: ToothDesignEdit, next: ToothDesignEdit) {
  if (prev.margin.offsetMm !== next.margin.offsetMm) return true;
  if (prev.margin.radii.length !== next.margin.radii.length) return true;
  if (prev.margin.radii.some((radius, index) => radius !== next.margin.radii[index])) {
    return true;
  }
  const before = prev.margin.depths ?? [];
  const after = next.margin.depths ?? [];
  if (before.length !== after.length) return true;
  return before.some((depth, index) => depth !== after[index]);
}

function DesignViewerChrome({
  teeth,
  activeTooth,
  edits,
  generated,
  marginReview,
  designScope,
  clinicPreset,
  generating,
  genLabel,
  panelsShown,
  toothInfoOpen,
  insertionKeys,
  canSetInsertion,
  onSelectTooth,
  onSetInsertion,
  onToggleInfo,
  onConfirmMargin,
  onApplyPreset,
  onGenerateTooth,
  onGenerateSpan,
  onAssembleSpan,
  onTogglePontic,
  onClearTooth,
}: {
  teeth: LabProsthesisAiTooth[];
  activeTooth: LabProsthesisAiTooth | null;
  edits: Record<string, ToothDesignEdit>;
  generated: Record<string, boolean>;
  marginReview: Record<string, MarginReview>;
  designScope: DesignScope | null;
  clinicPreset: ClinicMaterialPreset | null;
  generating: boolean;
  genLabel: string;
  panelsShown: boolean;
  toothInfoOpen: boolean;
  insertionKeys: readonly string[];
  canSetInsertion: boolean;
  onSelectTooth: (toothNumber: string) => void;
  onSetInsertion: (toothNumbers: readonly string[]) => void;
  onToggleInfo: () => void;
  onConfirmMargin: (toothNumber: string) => void;
  onApplyPreset: (toothNumber: string, presetId: InnerPresetId) => void;
  onGenerateTooth: (toothNumber: string) => void;
  onGenerateSpan: (span: readonly string[]) => void;
  onAssembleSpan: (span: readonly string[], assembled: boolean) => void;
  onTogglePontic: (toothNumber: string) => void;
  onClearTooth: (toothNumber: string) => void;
}) {
  const archGroups = (
    [
      { id: "upper" as const, label: "상악" },
      { id: "lower" as const, label: "하악" },
      { id: "other" as const, label: "기타" },
    ] as const
  )
    .map((group) => ({
      ...group,
      teeth: teeth.filter((tooth) => toothArchGroup(tooth.toothNumber) === group.id),
    }))
    .filter((group) => group.teeth.length > 0);
  const spans = insertionSpansByOwner(teeth);
  const toothActionClass =
    "inline-flex h-7 shrink-0 items-center justify-center rounded-md px-2 text-xs font-medium leading-none disabled:opacity-50";

  const axisState = (span: readonly string[]) => {
    const spanKey = insertionAxisKey(span);
    return Boolean(spanKey && insertionKeys.includes(spanKey));
  };

  const nameButton = (tooth: LabProsthesisAiTooth, axisOn: boolean) => (
    <button
      type="button"
      className={cn(
        "w-fit shrink-0 whitespace-nowrap rounded-md px-1 py-0.5 text-left",
        activeTooth?.toothNumber === tooth.toothNumber
          ? "bg-primary/10"
          : "hover:bg-muted",
      )}
      title={
        axisOn
          ? "삽입축을 잡았던 방향·각도·줌으로 봅니다"
          : "이 치아의 교합면을 봅니다"
      }
      onClick={() => onSelectTooth(tooth.toothNumber)}
    >
      <span className="font-semibold">#{tooth.toothNumber}</span>
    </button>
  );

  const insertionButton = (span: readonly string[], shared: boolean) => {
    const axisOn = axisState(span);
    return (
      <button
        type="button"
        className={cn(
          toothActionClass,
          "bg-primary text-primary-foreground",
          !canSetInsertion && "opacity-50",
        )}
        title={
          shared
            ? "화면 중앙을 지나 화면과 수직인 삽입축을 브리지 전체에 잡습니다. 화살표는 치아에서 2mm 떨어집니다"
            : "화면 중앙을 지나 화면과 수직인 삽입축을 잡습니다. 화살표는 치아에서 2mm 떨어집니다"
        }
        aria-label={shared ? "브리지 삽입축" : "삽입축"}
        aria-pressed={axisOn}
        disabled={!canSetInsertion}
        onClick={() => onSetInsertion(span)}
      >
        삽입축
      </button>
    );
  };

  const toothEdit = (toothNumber: string) =>
    edits[toothNumber] ?? createToothDesignEdit();

  const statusBits = (tooth: LabProsthesisAiTooth) => {
    const number = tooth.toothNumber;
    const made = generated[number] === true;
    const review = marginReview[number] ?? "none";
    const edit = edits[number];
    const thin = Boolean(made && edit && shellIsThin(edit));
    const label = made
      ? "생성됨"
      : edit?.pontic.on
        ? null
        : review === "detected" || review === "confirmed"
          ? "검출됨"
          : null;
    return (
      <>
        {label ? (
          <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
            {label}
          </span>
        ) : null}
        {thin ? (
          <button
            type="button"
            className="shrink-0 text-[10px] font-semibold text-destructive"
            onClick={() => onSelectTooth(number)}
          >
            최소 두께
          </button>
        ) : null}
      </>
    );
  };

  /** 브리지는 스팬 전체에 같은 재료를 건다. 커넥터 최소 면적도 이 재료를 따른다. */
  const presetSelect = (members: readonly LabProsthesisAiTooth[], label: string) => {
    if (designScope !== "crown") return null;
    const open = members.filter(
      (tooth) => tooth.designable && generated[tooth.toothNumber] !== true,
    );
    const lead = open[0];
    if (!lead) return null;
    const preset = toothEdit(lead.toothNumber).inner.preset;
    const value =
      preset === "clinic" && clinicPreset
        ? "clinic"
        : INNER_PRESETS.some((row) => row.id === preset)
          ? preset
          : "zirconia";
    return (
      <select
        className="h-7 max-w-[7.5rem] shrink-0 rounded-md border bg-background px-1 text-[11px]"
        aria-label={`${label} 재료`}
        value={value}
        onChange={(event) => {
          const next = event.target.value as InnerPresetId;
          for (const tooth of open) onApplyPreset(tooth.toothNumber, next);
        }}
      >
        {INNER_PRESETS.filter((row) => row.id !== "custom").map((row) => (
          <option key={row.id} value={row.id}>
            {row.label}
          </option>
        ))}
        {clinicPreset ? (
          <option value="clinic">{clinicPreset.label}</option>
        ) : null}
        <option value="custom">직접 입력</option>
      </select>
    );
  };

  const generateButton = (tooth: LabProsthesisAiTooth) => {
    if (designScope !== "crown") return null;
    if (generated[tooth.toothNumber] === true) {
      return (
        <button
          type="button"
          className={cn(toothActionClass, "text-muted-foreground hover:bg-muted")}
          onClick={() => onClearTooth(tooth.toothNumber)}
        >
          삭제
        </button>
      );
    }
    if (!tooth.designable) {
      return (
        <button
          type="button"
          className={cn(toothActionClass, "bg-primary text-primary-foreground")}
          disabled
        >
          생성
        </button>
      );
    }
    if (toothEdit(tooth.toothNumber).pontic.on) {
      return (
        <button
          type="button"
          className={cn(toothActionClass, "bg-primary text-primary-foreground")}
          disabled={generating}
          onClick={() => onGenerateTooth(tooth.toothNumber)}
        >
          생성
        </button>
      );
    }
    const review = marginReview[tooth.toothNumber] ?? "none";
    const deleted = toothEdit(tooth.toothNumber).margin.deleted;
    if (review === "detected" && !deleted) {
      return (
        <button
          type="button"
          className={cn(toothActionClass, "bg-primary text-primary-foreground")}
          onClick={() => onConfirmMargin(tooth.toothNumber)}
        >
          확인
        </button>
      );
    }
    const ready = review === "confirmed" && !deleted;
    return (
      <button
        type="button"
        className={cn(toothActionClass, "bg-primary text-primary-foreground")}
        disabled={generating || !ready}
        title={ready ? undefined : "마진을 확인한 뒤에 생성합니다."}
        onClick={() => onGenerateTooth(tooth.toothNumber)}
      >
        생성
      </button>
    );
  };

  const links = bridgeLinks(teeth);

  const roleButton = (tooth: LabProsthesisAiTooth, span: readonly string[]) => {
    const pontic = toothEdit(tooth.toothNumber).pontic.on;
    const lastAbutment =
      !pontic &&
      span.every(
        (number) => number === tooth.toothNumber || toothEdit(number).pontic.on,
      );
    return (
      <button
        type="button"
        className={cn(
          "inline-flex h-6 shrink-0 items-center rounded-full border px-2 text-[10px] font-medium leading-none disabled:opacity-50",
          pontic
            ? "border-violet-500/50 bg-violet-500/10 text-violet-700"
            : "border-sky-500/50 bg-sky-500/10 text-sky-700",
        )}
        disabled={lastAbutment}
        title={
          lastAbutment
            ? "브리지에는 지대치가 하나 이상 있어야 합니다."
            : pontic
              ? "지대치로 바꾸면 마진을 다시 검출합니다."
              : "폰틱은 마진 없이 기저면으로 치조정에 얹습니다."
        }
        aria-pressed={pontic}
        onClick={() => onTogglePontic(tooth.toothNumber)}
      >
        {pontic ? "폰틱" : "지대치"}
      </button>
    );
  };

  const bridgeHeader = (span: readonly string[], members: LabProsthesisAiTooth[]) => {
    const ordered = sortByArch(span);
    const label = `브리지 ${ordered[0]}-${ordered[ordered.length - 1]}`;
    const allMade = members.every((tooth) => generated[tooth.toothNumber] === true);
    const assembled = spanAssembled(span, edits);
    const weak = links.some(
      (link) =>
        span.includes(link.from) &&
        span.includes(link.to) &&
        connectorIsWeak(toothEdit(link.from), [link.from, link.to]),
    );
    const pending = members.filter((tooth) => generated[tooth.toothNumber] !== true);
    const spanReady = pending.every((tooth) => {
      const edit = toothEdit(tooth.toothNumber);
      if (edit.pontic.on) return true;
      return (
        tooth.designable &&
        !edit.margin.deleted &&
        marginReview[tooth.toothNumber] === "confirmed"
      );
    });
    return (
      <div className="mb-1 flex items-center gap-1.5">
        <span className="whitespace-nowrap text-xs font-semibold text-foreground">
          {label}
        </span>
        {allMade ? (
          assembled ? (
            <span className="shrink-0 text-[10px] font-medium text-emerald-600">
              조립됨
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-medium text-amber-600">
              <TriangleAlert className="h-3 w-3" />
              조립 전
            </span>
          )
        ) : null}
        {allMade && weak ? (
          <button
            type="button"
            className="shrink-0 text-[10px] font-semibold text-destructive"
            onClick={() => {
              const lead = members[0];
              if (lead) onSelectTooth(lead.toothNumber);
            }}
          >
            커넥터 약함
          </button>
        ) : null}
        {presetSelect(members, label)}
        {designScope === "crown" && !allMade ? (
          <button
            type="button"
            className={cn(toothActionClass, "bg-primary text-primary-foreground")}
            disabled={generating || !spanReady}
            title={spanReady ? undefined : "지대치 마진을 모두 확인한 뒤 생성합니다."}
            onClick={() => onGenerateSpan(pending.map((tooth) => tooth.toothNumber))}
          >
            브리지 생성
          </button>
        ) : null}
        {allMade ? (
          <button
            type="button"
            className={cn(
              toothActionClass,
              assembled
                ? "bg-destructive text-destructive-foreground"
                : "bg-primary text-primary-foreground",
            )}
            title={
              assembled
                ? "크라운이나 커넥터를 고치려면 분리합니다."
                : "커넥터로 브리지를 한 덩어리로 잇습니다."
            }
            onClick={() => onAssembleSpan(span, !assembled)}
          >
            {assembled ? "분리" : "조립"}
          </button>
        ) : null}
      </div>
    );
  };

  const thinTeeth = teeth.filter((tooth) => {
    if (generated[tooth.toothNumber] !== true) return false;
    const edit = edits[tooth.toothNumber];
    return Boolean(edit && shellIsThin(edit));
  });

  const unassembledSpan = [...spans.values()].find((span) => {
    const rows = teeth.filter((tooth) => span.includes(tooth.toothNumber));
    return (
      span.length > 1 &&
      rows.length > 1 &&
      rows.every((tooth) => generated[tooth.toothNumber] === true) &&
      !spanAssembled(span, edits)
    );
  });

  return (
    <>
      <style>
        {`@keyframes aiScanLine { 0% { transform: translateY(0); opacity: .25; } 50% { opacity: 1; } 100% { transform: translateY(58vh); opacity: .2; } }`}
      </style>

      <div className="absolute right-3 top-3 z-10 flex max-h-[calc(100%-1.5rem)] w-fit max-w-[min(32rem,70vw)] flex-col items-end gap-1">
        {panelsShown && teeth.length > 0 ? (
          <div className="mt-1 w-fit max-w-full overflow-hidden rounded-lg border bg-background/95 text-sm shadow-sm">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left"
              onClick={onToggleInfo}
              aria-expanded={toothInfoOpen}
            >
              <span className="font-semibold text-foreground">치아 정보</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                  toothInfoOpen ? "rotate-180" : "",
                )}
              />
            </button>
            {toothInfoOpen ? (
              <div className="max-h-[min(24rem,52vh)] overflow-y-auto border-t px-3.5 py-2.5">
                {archGroups.map((group) => (
                  <div key={group.id} className="mb-2.5 last:mb-0">
                    <p className="text-xs font-medium text-muted-foreground">
                      {group.label}
                    </p>
                    <ul className="ml-2 mt-1 border-l border-border pl-3">
                      {toothInfoBlocks(group.teeth, spans).map((block) => {
                        if (block.kind === "bridge") {
                          const axisOn = axisState(block.span);
                          const members = block.members;
                          const last = members.length - 1;
                          return (
                            <li
                              key={`bridge-${block.span.join("-")}`}
                              className="py-1"
                            >
                              {bridgeHeader(block.span, members)}
                              <div className="flex items-center gap-2">
                                {insertionButton(block.span, true)}
                                <div className="flex flex-col gap-1">
                                  {members.map((tooth, index) => (
                                    <div
                                      key={tooth.toothNumber}
                                      className="flex items-stretch"
                                    >
                                      <div className="relative w-[3px] shrink-0">
                                        {index > 0 ? (
                                          <span
                                            aria-hidden
                                            className="absolute inset-x-0 top-0 h-1/2 bg-primary"
                                          />
                                        ) : null}
                                        {index < last ? (
                                          <span
                                            aria-hidden
                                            className="absolute inset-x-0 top-1/2 h-[calc(50%+0.25rem)] bg-primary"
                                          />
                                        ) : null}
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span
                                          aria-hidden
                                          className="h-[3px] w-3 shrink-0 bg-primary"
                                        />
                                        {nameButton(tooth, axisOn)}
                                        {roleButton(tooth, block.span)}
                                        {statusBits(tooth)}
                                        {generateButton(tooth)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </li>
                          );
                        }
                        const tooth = block.tooth;
                        const span = insertionSpanForTooth(teeth, tooth.toothNumber);
                        const axisOn = axisState(span);
                        return (
                          <li
                            key={`${tooth.toothNumber}-${tooth.prosthesisType}`}
                            className="py-1"
                          >
                            <div className="flex w-fit items-center gap-1.5 py-0.5">
                              {nameButton(tooth, axisOn)}
                              {statusBits(tooth)}
                              {presetSelect([tooth], `#${tooth.toothNumber}`)}
                              {span.length > 0 ? insertionButton(span, false) : null}
                              {generateButton(tooth)}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {thinTeeth.length > 0 || unassembledSpan ? (
        <div className="absolute bottom-16 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1.5">
          {unassembledSpan ? (
            <button
              type="button"
              className="max-w-xs rounded-md bg-background/95 px-3 py-2 text-center text-xs font-medium text-foreground shadow-sm"
              onClick={() => {
                const lead = sortByArch(unassembledSpan)[0];
                if (lead) onSelectTooth(lead);
              }}
            >
              크라운·폰틱·커넥터를 만들었지만 아직 조립하지 않았습니다.
              <br />
              커넥터를 확인한 뒤 치아 정보에서 브리지를 조립하세요.
            </button>
          ) : null}
          {thinTeeth.length > 0 ? (
            <button
              type="button"
              className="max-w-xs rounded-md bg-background/95 px-3 py-2 text-center text-xs font-medium text-foreground shadow-sm"
              onClick={() => {
                const tooth = thinTeeth[0];
                if (tooth) onSelectTooth(tooth.toothNumber);
              }}
            >
              디자인에 최소 두께 미달이 있습니다.
              <br />
              치아 정보에서 해당 치아를 확인하세요.
            </button>
          ) : null}
        </div>
      ) : null}

      {generating ? (
        <>
          <div
            className="pointer-events-none absolute inset-x-8 top-16 z-10 h-px bg-sky-400 shadow-[0_0_12px_2px_rgba(56,189,248,0.85)]"
            style={{ animation: "aiScanLine 1.15s ease-in-out infinite" }}
          />
          {genLabel ? (
            <p className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-md bg-background/95 px-3 py-1.5 text-xs text-foreground shadow-sm">
              {genLabel}
            </p>
          ) : null}
        </>
      ) : null}
    </>
  );
}

function CaseHeaderLines({
  header,
}: {
  header?: LabProsthesisAiCaseHeader | null;
}) {
  const primary = String(header?.primary || "").trim();
  const dates = arrivalOnlyLabel(String(header?.dates || "").trim());
  if (!primary && !dates) return null;
  return (
    <p className="flex min-w-0 flex-nowrap items-center gap-x-3 overflow-hidden text-xs text-muted-foreground">
      {primary ? (
        <span className="min-w-0 truncate font-medium text-foreground">
          {primary}
        </span>
      ) : null}
      {dates ? (
        <span className="shrink-0 tabular-nums">{dates}</span>
      ) : null}
    </p>
  );
}

function arrivalOnlyLabel(dates: string): string {
  const parts = dates
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);
  const arrival = parts.find((part) => part.startsWith("도착"));
  if (arrival) return arrival;
  const ship = parts.find((part) => part.startsWith("출고"));
  if (ship) return ship;
  return parts
    .filter((part) => !part.startsWith("주문") && !part.startsWith("재주문"))
    .join(" · ");
}

function collectMeshSources(
  files: ReadonlyArray<AiDesignFile> | null | undefined,
): MeshSource[] {
  const out: MeshSource[] = [];
  const seen = new Set<string>();
  for (const file of preferWorkingOralScanFiles(files || [])) {
    const fileName = String(file?.fileName || "").trim();
    const id = String(file?.s3Key || "").trim();
    if (!fileName || !id || seen.has(id) || !isOralScanMeshName(fileName)) {
      continue;
    }
    const role = resolveOralScanRole(file);
    if (role !== "upper" && role !== "lower" && role !== "bite") continue;
    seen.add(id);
    out.push({ id, fileName, role });
  }
  return out;
}

function filesOfApi(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (row): row is {
      fileName?: string | null;
      originalName?: string | null;
      scanRole?: string | null;
      uploadedAt?: string | null;
    } => Boolean(row) && typeof row === "object",
  );
}

function unwrapApiData(raw: unknown): Record<string, unknown> {
  const body =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const data = body.data;
  if (data && typeof data === "object") return data as Record<string, unknown>;
  return body;
}

function apiMessage(raw: unknown): string {
  const body =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return String(body.message || "").trim();
}

function collectImageSources(
  files: ReadonlyArray<AiDesignFile> | null | undefined,
): Array<{ id: string; fileName: string }> {
  const out: Array<{ id: string; fileName: string }> = [];
  const seen = new Set<string>();
  for (const file of files || []) {
    const fileName = String(file?.fileName || "").trim();
    const id = String(file?.s3Key || "").trim();
    if (!fileName || !id || seen.has(id) || !IMAGE_EXT.test(fileName)) continue;
    seen.add(id);
    out.push({ id, fileName });
  }
  return out;
}
