// 의뢰·작업 스캔·어벗·보철을 한 번에 띄운다. 3D는 같은 좌표로 겹치고, 사진은 오른쪽 패널에서 연다.
// change-log:
// - 2026-10-07: 카메라(각도·줌)도 workFilePaint.view에 남겨 다시 연다.
// - 2026-10-07: 프리뷰 닫을 때 clear가 빈 표시를 저장하던 버그 수정. 표시는 메타데이터로 유지.
// - 2026-10-07: 3D 페인트를 의뢰 메타데이터에 남겨 다시 연다. 채팅 첨부는 작업 파일을 연다.
// - 2026-10-03: 처음엔 활성 클러스터만 받아 보여주고, 다른 묶음은 클릭 때 S3→IndexedDB 캐시. 클러스터 전환 시 뷰 리셋.
// - 2026-10-03: 어벗을 보철에 맞춘 자세를 확인받아 의뢰에 저장(transferKey). 파일은 그대로, 자세만.
// - 2026-10-03: 투명도·스캔색을 localStorage에 저장. 의뢰를 바꿔도 같은 값 적용.
// - 2026-10-03: 클러스터별 표시/숨김을 localStorage에 저장. 다른 묶음 갔다 와도 복원.
// - 2026-10-03: 안내 — 어벗은 짝 보철 피니시라인에 꽂아 같이 옮김.
// - 2026-10-03: 투명도 슬라이더→뷰리셋 오른쪽. 기본 0(불투명), 올릴수록 보철 투명.
// - 2026-10-03: 어벗·보철 클러스터 통합(어벗 & 보철). 보철 기본 불투명+투명도 슬라이더.
// - 2026-10-03: 「작업 파일」라벨 제거. 아코디언으로 펼치면 숨김→표시도 같이.
// - 2026-10-03: 클러스터 collapse. 숨긴 묶음은 자동으로 접음. 보철 펼침+어벗 짝 이동은 뷰어.
// - 2026-10-03: 어벗·보철은 같이 켜고 파일 좌표로 꽂아 표시. 스캔(의뢰/작업)과는 배타.
// - 2026-10-03: 어벗↔보철은 같이 켜고 옆으로 펼침. 스캔(의뢰/작업)과는 배타.
// - 2026-10-03: 채팅 순서(의뢰→작업스캔→어벗→보철). 네 클러스터 배타 ON. 작업 파일 아래로.
// - 2026-10-03: 어벗 디자인·보철물도 같은 겹침 프리뷰(디자인 클러스터, 기본 ON).
// - 2026-10-03: 작업 스캔도 같이 로드. 패널은 의뢰 파일·작업 파일 말풍선.
// - 2026-10-03: 아래 썸네일 갤러리 제거. 파일 선택은 오른쪽 패널만.
// - 2026-10-03: 신설. 파일 1개씩 열고 좌우 화살표로 넘기던 의뢰 파일 프리뷰를 작업 스캔 프리뷰 구조로 바꿈.
// related files:
// - web/frontend/src/shared/components/WorkScanModelPreviewDialog.tsx
// - web/frontend/src/shared/components/ModelPreviewDialog.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/shared/share/CaseLayerViewer.tsx
// - web/frontend/src/shared/share/caseShareTypes.ts
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Maximize2,
} from "lucide-react";

import { AbutsLogo } from "@/components/branding/AbutsLogo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { formatKstDateTimeToKo } from "@/shared/date/kst";
import {
  fileFromImageBlob,
  fileFromModelBlob,
  getModelExtLower,
  isModelPreviewExt,
  peekPlyHeaderInfo,
  resolveCompanionTextureFileName,
} from "@/shared/files/modelPreviewFile";
import { request } from "@/shared/api/apiClient";
import { fetchS3BlobCached } from "@/shared/files/s3BlobCache";
import { buildS3ProxyDownloadUrl } from "@/shared/files/useS3FileDownload";
import {
  PREVIEW_HEADER_BUTTON_CLASS,
  keepOpenOnToastInteract,
  PreviewColorMappingToggle,
  PreviewPaintControls,
  PreviewPaintLayer,
  usePreviewPaint,
} from "@/shared/components/PreviewAnnotateActions";
import {
  ResizablePanelHandle,
  useResizablePanelWidth,
} from "@/shared/components/ResizablePanelHandle";
import {
  VIEW_GESTURE_HINT_LAYER_CLASS,
  ViewGestureHint,
} from "@/shared/components/ViewGestureHint";
import {
  ZoomableImagePreview,
  type ZoomableImagePreviewHandle,
} from "@/shared/components/ZoomableImagePreview";
import type { PaintShape } from "@/shared/components/practice/viewPaintGeom";
import type { ViewPaintSpace } from "@/shared/components/practice/viewPaintSpace";
import { parseWorkFilePaint } from "@/shared/practice/workFilePaint";
import {
  isAbutsWorkScanFileName,
  preferWorkingOralScanFiles,
  resolveOralScanRole,
} from "@/shared/practice/labProsthesisAiDesign";
import {
  CaseLayerViewer,
  type CaseLayerModel,
  type CaseLayerTone,
  type CaseLayerView,
  type CaseLayerViewerHandle,
  type CaseSeatDecision,
  type CaseSeatRecord,
} from "@/shared/share/CaseLayerViewer";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";

export type RequestPreviewFile = {
  id: string;
  fileName: string;
  size: number;
  s3Key: string;
  uploadedAt?: string | null;
  scanRole?: string | null;
};

type ItemCluster = "request" | "workScan" | "design";

type AbutmentSeatRow = {
  abutmentS3Key: string;
  prosthesisS3Key: string;
  matrix: number[] | null;
};

type Item = {
  key: string;
  file: RequestPreviewFile;
  kind: "model" | "image";
  roleLabel: string;
  cluster: ItemCluster;
  tone: CaseLayerTone;
};

type LoadState =
  | { status: "loading"; progress: number }
  | { status: "ready" }
  | { status: "error"; message: string };

const ROLE_LABEL: Record<string, string> = {
  upper: "상악",
  lower: "하악",
  bite: "바이트",
};

const CLUSTER_LABEL: Record<ItemCluster, string> = {
  request: "의뢰 파일",
  workScan: "작업 스캔",
  design: "어벗 & 보철",
};

const ALL_CLUSTERS: ItemCluster[] = ["request", "workScan", "design"];

/** 보철 투명도 슬라이더 기본(0=불투명). 0~100. material.opacity = 1 - t/100 */
const DEFAULT_PROSTHESIS_TRANSPARENCY = 0;
/** 스캔 칼라 기본 ON. 모든 의뢰에 공통. */
const DEFAULT_COLOR_MAPPING = true;

const LAYER_PREFS_STORAGE_KEY = "abuts.requestFilesPreview.layerPrefs.v1";

type LayerPrefs = {
  v: 1;
  /** 클러스터별로 마지막으로 켜 두었던 파일 키(s3Key 등). */
  byCluster: Partial<Record<ItemCluster, string[]>>;
  /** 보철 투명도 0~100. 의뢰 공통. */
  prosthesisTransparency?: number;
  /** 스캔 칼라 ON/OFF. 의뢰 공통. */
  colorMapping?: boolean;
};

function clampTransparency(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(100, Math.max(0, value));
}

function loadLayerPrefs(): LayerPrefs {
  try {
    const raw = window.localStorage.getItem(LAYER_PREFS_STORAGE_KEY);
    if (!raw) return { v: 1, byCluster: {} };
    const parsed = JSON.parse(raw) as Partial<LayerPrefs> | null;
    if (!parsed || parsed.v !== 1 || typeof parsed !== "object") {
      return { v: 1, byCluster: {} };
    }
    const byCluster: LayerPrefs["byCluster"] = {};
    for (const cluster of ALL_CLUSTERS) {
      const keys = parsed.byCluster?.[cluster];
      if (Array.isArray(keys)) {
        byCluster[cluster] = keys.map(String).filter(Boolean);
      }
    }
    return {
      v: 1,
      byCluster,
      prosthesisTransparency: clampTransparency(parsed.prosthesisTransparency),
      colorMapping:
        typeof parsed.colorMapping === "boolean"
          ? parsed.colorMapping
          : undefined,
    };
  } catch {
    return { v: 1, byCluster: {} };
  }
}

function saveLayerPrefs(prefs: LayerPrefs) {
  try {
    window.localStorage.setItem(LAYER_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // quota / private mode
  }
}

function rememberedVisibleKeys(
  cluster: ItemCluster,
  models: readonly Item[],
  byCluster: LayerPrefs["byCluster"] | undefined,
): Set<string> {
  const present = new Set(
    models.filter((m) => m.cluster === cluster).map((m) => m.key),
  );
  const remembered = byCluster?.[cluster];
  if (remembered && remembered.length > 0) {
    const keys = new Set<string>();
    for (const key of remembered) {
      if (present.has(key)) keys.add(key);
    }
    if (keys.size > 0) return keys;
  }
  return defaultVisibleKeysForCluster(cluster, models);
}

function itemKey(file: RequestPreviewFile) {
  return String(file.s3Key || file.id || file.fileName);
}

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]);

function kindOf(fileName: string): "model" | "image" | null {
  const ext = getModelExtLower(fileName);
  if (isModelPreviewExt(ext)) return "model";
  const dot = fileName.lastIndexOf(".");
  const plain = dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
  if (IMAGE_EXTS.has(plain)) return "image";
  return null;
}

function EyeToggle({
  on,
  onClick,
  label,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted disabled:opacity-40",
        on ? "text-primary" : "text-muted-foreground/60",
      )}
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      title={label}
      disabled={disabled}
    >
      {on ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
    </button>
  );
}

function toScanItems(
  list: readonly RequestPreviewFile[],
  cluster: "request" | "workScan",
): Item[] {
  const out: Item[] = [];
  for (const file of list) {
    const kind = kindOf(file.fileName);
    if (!kind || !String(file.s3Key || "").trim()) continue;
    const role = resolveOralScanRole({
      fileName: file.fileName,
      scanRole: file.scanRole,
    });
    out.push({
      key: itemKey(file),
      file,
      kind,
      cluster,
      tone: "scan",
      roleLabel:
        kind === "image"
          ? "사진"
          : cluster === "workScan"
            ? ROLE_LABEL[role || ""] || "작업"
            : (role && ROLE_LABEL[role]) || "3D",
    });
  }
  return out;
}

function toDesignItems(
  list: readonly RequestPreviewFile[],
  tone: "abutment" | "prosthesis",
): Item[] {
  const out: Item[] = [];
  for (const file of list) {
    const kind = kindOf(file.fileName);
    if (!kind || !String(file.s3Key || "").trim()) continue;
    out.push({
      key: itemKey(file),
      file,
      kind,
      cluster: "design",
      tone,
      roleLabel:
        kind === "image" ? "사진" : tone === "abutment" ? "어벗" : "보철",
    });
  }
  return out;
}

/** 스캔 묶음에서 기본으로 켤 키(상·하악 우선). */
function preferredScanKeys(models: readonly Item[]): Set<string> {
  return new Set(
    preferWorkingOralScanFiles(
      models.map((m) => ({
        fileKey: m.key,
        fileName: m.file.fileName,
        scanRole: m.file.scanRole,
        uploadedAt: m.file.uploadedAt,
      })),
    ).map((f) => f.fileKey),
  );
}

function defaultVisibleKeysForCluster(
  cluster: ItemCluster,
  models: readonly Item[],
): Set<string> {
  const inCluster = models.filter((m) => m.cluster === cluster);
  if (cluster === "request" || cluster === "workScan") {
    const preferred = preferredScanKeys(inCluster);
    const keys = new Set<string>();
    for (const m of inCluster) {
      const role = resolveOralScanRole({
        fileName: m.file.fileName,
        scanRole: m.file.scanRole,
      });
      if ((role === "upper" || role === "lower") && preferred.has(m.key)) {
        keys.add(m.key);
      }
    }
    if (keys.size === 0) {
      for (const m of inCluster) keys.add(m.key);
    }
    return keys;
  }
  return new Set(inCluster.map((m) => m.key));
}

function pickInitialCluster(
  models: readonly Item[],
  wanted: string | null | undefined,
): ItemCluster | null {
  if (wanted) {
    const hit = models.find((m) => m.key === wanted);
    if (hit) return hit.cluster;
  }
  // 작업 스캔 타일(initialKey="") → 작업 스캔 우선. 없으면 채팅 순.
  for (const cluster of ["workScan", "request", "design"] as const) {
    if (models.some((m) => m.cluster === cluster)) return cluster;
  }
  return null;
}

/** 스캔끼리·스캔↔디자인은 배타. 어벗·보철은 한 묶음. */
function clustersHiddenBy(active: ItemCluster): ItemCluster[] {
  if (active === "request") return ["workScan", "design"];
  if (active === "workScan") return ["request", "design"];
  return ["request", "workScan"];
}

function buildExclusiveHidden(
  models: readonly Item[],
  active: ItemCluster | null,
  forceKey?: string | null,
  byCluster?: LayerPrefs["byCluster"],
): Record<string, boolean> {
  const visible =
    active != null
      ? rememberedVisibleKeys(active, models, byCluster)
      : new Set<string>();
  if (forceKey && models.some((m) => m.key === forceKey)) {
    visible.add(forceKey);
  }
  const hide = active != null ? new Set(clustersHiddenBy(active)) : null;
  const hidden: Record<string, boolean> = {};
  for (const m of models) {
    if (active == null) {
      hidden[m.key] = true;
      continue;
    }
    if (m.cluster === active) {
      hidden[m.key] = !visible.has(m.key);
      continue;
    }
    if (hide?.has(m.cluster)) {
      hidden[m.key] = true;
      continue;
    }
    hidden[m.key] = true;
  }
  return hidden;
}

export function RequestFilesPreviewDialog({
  open,
  onOpenChange,
  files,
  workFiles = [],
  designFiles = [],
  resultFiles = [],
  initialKey,
  authToken,
  transferKey,
  title,
  caseInfo,
  onDownload,
  downloadBusy = false,
  onAttachChatFile,
  onRemoveChatFile,
  onReorderChatFiles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: readonly RequestPreviewFile[];
  /** 작업 스캔(상악·하악·바이트 DCM 등). 있으면 같이 로드한다. */
  workFiles?: readonly RequestPreviewFile[];
  /** 어벗 디자인 STL 등. 작업 파일 아래 별도 클러스터. */
  designFiles?: readonly RequestPreviewFile[];
  /** 보철물 STL 등. 작업 파일 아래 별도 클러스터. */
  resultFiles?: readonly RequestPreviewFile[];
  /** 처음에 열 파일(사진이면 바로 그 사진). 없으면 3D 겹침. */
  initialKey?: string | null;
  authToken?: string | null;
  /** 의뢰 _id 또는 transferId. 있으면 어벗을 보철에 맞춘 자세를 확인받아 저장한다. */
  transferKey?: string | null;
  title?: string;
  caseInfo?: ReactNode;
  onDownload?: (files: RequestPreviewFile[]) => void | Promise<void>;
  downloadBusy?: boolean;
  onAttachChatFile?: (file: File) => void;
  onRemoveChatFile?: (file: File) => void;
  onReorderChatFiles?: (files: File[]) => void;
}) {
  const items = useMemo<Item[]>(() => {
    const request = toScanItems(files, "request").filter(
      (item) => !isAbutsWorkScanFileName(item.file.fileName),
    );
    const workScan = toScanItems(workFiles, "workScan");
    const design = [
      ...toDesignItems(designFiles, "abutment"),
      ...toDesignItems(resultFiles, "prosthesis"),
    ];
    const seen = new Set<string>();
    const out: Item[] = [];
    // 채팅 상세와 같은 순서: 의뢰 → 작업 스캔 → 어벗&보철
    for (const item of [...request, ...workScan, ...design]) {
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      out.push(item);
    }
    return out;
  }, [designFiles, files, resultFiles, workFiles]);
  const heading =
    title ||
    (items.some((i) => i.cluster !== "request") ? "케이스" : "의뢰 파일");
  const itemsKey = items.map((i) => i.key).join("|");
  const models = items.filter((i) => i.kind === "model");
  const requestItems = items.filter((i) => i.cluster === "request");
  const workScanItems = items.filter((i) => i.cluster === "workScan");
  const designItems = items.filter((i) => i.cluster === "design");
  const workSectionClusters = (
    [
      { cluster: "workScan" as const, list: workScanItems },
      { cluster: "design" as const, list: designItems },
    ] as const
  ).filter((group) => group.list.length > 0);

  const { toast } = useToast();
  const seatTransferKey = transferKey && authToken ? String(transferKey).trim() : "";
  /** 저장된 어벗 자세. 받기 전에는 null이라 맞추지 않는다. */
  const [seatRows, setSeatRows] = useState<AbutmentSeatRow[] | null>(null);
  useEffect(() => {
    setSeatRows(null);
    if (!open || !seatTransferKey) return;
    let alive = true;
    void request<{ data?: { seats?: AbutmentSeatRow[] } }>({
      path: `/api/practice/transfers/${encodeURIComponent(seatTransferKey)}/abutment-seats`,
      method: "GET",
      token: authToken,
      skipCache: true,
    }).then((res) => {
      if (!alive) return;
      const seats = res.ok ? res.data?.data?.seats : null;
      setSeatRows(Array.isArray(seats) ? seats : []);
    });
    return () => {
      alive = false;
    };
  }, [open, seatTransferKey, authToken, itemsKey]);
  const viewerRef = useRef<CaseLayerViewerHandle | null>(null);
  const imageRef = useRef<ZoomableImagePreviewHandle | null>(null);
  const panel = useResizablePanelWidth("abuts.requestFilesPanelWidth.v1");
  const paint = usePreviewPaint({
    open,
    resetKey: itemsKey,
    initiallyOn: false,
  });
  const [paintSpace, setPaintSpace] = useState<ViewPaintSpace | null>(null);
  const [loads, setLoads] = useState<Record<string, LoadState>>({});
  const [modelFiles, setModelFiles] = useState<
    Record<string, { file: File; companionFiles: File[] }>
  >({});
  const [imageFiles, setImageFiles] = useState<Record<string, File>>({});
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [shownImageKey, setShownImageKey] = useState<string | null>(null);
  const [colorMapping, setColorMapping] = useState(
    () => loadLayerPrefs().colorMapping ?? DEFAULT_COLOR_MAPPING,
  );
  const [prosthesisTransparency, setProsthesisTransparency] = useState(
    () => loadLayerPrefs().prosthesisTransparency ?? DEFAULT_PROSTHESIS_TRANSPARENCY,
  );
  const initialKeyRef = useRef(initialKey);
  initialKeyRef.current = initialKey;
  const layerPrefsRef = useRef<LayerPrefs>(loadLayerPrefs());
  /** 프리뷰 세션(열림) 동안의 fetch 취소. */
  const loadAbortRef = useRef<AbortController | null>(null);
  /** 이미 받기 시작한 파일 키. 클러스터를 다시 켜도 중복 fetch 안 함. */
  const startedKeysRef = useRef(new Set<string>());
  /** PLY/OBJ 텍스처용. state와 같이 갱신해 모델 로드가 기다리지 않게 한다. */
  const imageFilesRef = useRef<Record<string, File>>({});
  const imageUrlsRef = useRef<string[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;

  const paintFileKeys = useMemo(
    () =>
      [...new Set(models.map((item) => item.key).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [models],
  );
  const paintFileKeySig = paintFileKeys.join("|");
  const [loadedPaint, setLoadedPaint] = useState<PaintShape[] | null>(null);
  const [loadedView, setLoadedView] = useState<CaseLayerView | null>(null);
  const persistReadyRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);
  const persistShapesRef = useRef<PaintShape[]>([]);
  const persistViewRef = useRef<CaseLayerView | null>(null);
  const paintFileKeysRef = useRef(paintFileKeys);
  paintFileKeysRef.current = paintFileKeys;
  const appliedPaintSigRef = useRef("");
  const appliedViewSigRef = useRef("");
  const persistSigRef = useRef(paintFileKeySig);
  if (persistSigRef.current !== paintFileKeySig) {
    persistSigRef.current = paintFileKeySig;
    persistReadyRef.current = false;
  }

  const currentPersistBody = () => {
    const shapes =
      paint.paintRef.current?.getShapes() ?? persistShapesRef.current;
    const view = viewerRef.current?.getView() ?? persistViewRef.current;
    persistShapesRef.current = shapes;
    if (view) persistViewRef.current = view;
    return {
      fileKeys: paintFileKeysRef.current,
      shapes,
      view: view || persistViewRef.current,
    };
  };

  const flushWorkFilePaint = () => {
    if (persistTimerRef.current != null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    const token = authTokenRef.current;
    if (!seatTransferKey || !token) return;
    const body = currentPersistBody();
    void request({
      path: `/api/practice/transfers/${encodeURIComponent(seatTransferKey)}/work-file-paint`,
      method: "PUT",
      token,
      jsonBody: body,
    }).catch((error) => {
      console.error("[work-file-paint] flush failed", error);
    });
  };

  useEffect(() => {
    persistReadyRef.current = false;
    setLoadedPaint(null);
    setLoadedView(null);
    appliedPaintSigRef.current = "";
    appliedViewSigRef.current = "";
    if (!open || !seatTransferKey) return;
    const ac = new AbortController();
    void request<{
      data?: { fileKeys?: string[]; shapes?: unknown; view?: unknown };
    }>({
      path: `/api/practice/transfers/${encodeURIComponent(seatTransferKey)}/work-file-paint`,
      method: "GET",
      token: authToken,
      skipCache: true,
      signal: ac.signal,
    })
      .then((res) => {
        if (ac.signal.aborted) return;
        const parsed = parseWorkFilePaint(res.ok ? res.data?.data : null);
        persistShapesRef.current = parsed.shapes;
        persistViewRef.current = parsed.view;
        setLoadedPaint(parsed.shapes);
        setLoadedView(parsed.view);
        // 뷰어가 아직 없어도 그리면 바로 저장되게 한다.
        persistReadyRef.current = true;
      })
      .catch(() => {
        if (ac.signal.aborted) return;
        persistShapesRef.current = [];
        persistViewRef.current = null;
        setLoadedPaint([]);
        setLoadedView(null);
        persistReadyRef.current = true;
      });
    return () => {
      ac.abort();
      // 닫을 때 디바운스·최신 표시·뷰를 바로 저장한다(빈 clear로 덮지 않음).
      if (persistReadyRef.current) flushWorkFilePaint();
    };
    // flushWorkFilePaint는 seatTransferKey·refs만 쓴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seatTransferKey, authToken, paintFileKeySig]);

  useEffect(() => {
    if (!open || !paintSpace || loadedPaint == null) return;
    if (appliedPaintSigRef.current === paintFileKeySig) return;
    let cancelled = false;
    let frames = 0;
    const apply = () => {
      if (cancelled) return;
      const surface = paint.paintRef.current;
      if (!surface) {
        if (frames < 60) {
          frames += 1;
          window.requestAnimationFrame(apply);
        }
        return;
      }
      // 서버 표시를 넣기 전에 사용자가 이미 그린 경우 덮지 않는다.
      if (surface.hasInk() && loadedPaint.length === 0) {
        appliedPaintSigRef.current = paintFileKeySig;
        persistShapesRef.current = surface.getShapes();
        return;
      }
      surface.replaceShapes(loadedPaint, { silent: true });
      paint.setCount(loadedPaint.length);
      appliedPaintSigRef.current = paintFileKeySig;
    };
    apply();
    return () => {
      cancelled = true;
    };
  }, [loadedPaint, open, paint, paintFileKeySig, paintSpace]);

  useEffect(() => {
    if (!open || !paintSpace || !loadedView) return;
    if (appliedViewSigRef.current === paintFileKeySig) return;
    let cancelled = false;
    let frames = 0;
    const apply = () => {
      if (cancelled) return;
      const viewer = viewerRef.current;
      if (!viewer?.getView()) {
        if (frames < 90) {
          frames += 1;
          window.requestAnimationFrame(apply);
        }
        return;
      }
      viewer.restoreView(loadedView);
      persistViewRef.current = loadedView;
      appliedViewSigRef.current = paintFileKeySig;
    };
    apply();
    return () => {
      cancelled = true;
    };
  }, [loadedView, open, paintFileKeySig, paintSpace]);

  const persistWorkFilePaint = (
    shapes?: PaintShape[],
    immediate = false,
  ) => {
    if (shapes) persistShapesRef.current = shapes;
    if (!persistReadyRef.current || !seatTransferKey) return Promise.resolve();
    const run = () => {
      persistTimerRef.current = null;
      const token = authTokenRef.current;
      if (!seatTransferKey || !token) return Promise.resolve();
      const body = currentPersistBody();
      return request({
        path: `/api/practice/transfers/${encodeURIComponent(seatTransferKey)}/work-file-paint`,
        method: "PUT",
        token,
        jsonBody: body,
      })
        .then(() => undefined)
        .catch((error) => {
          console.error("[work-file-paint] save failed", error);
        });
    };
    if (persistTimerRef.current != null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    if (immediate) return run();
    persistTimerRef.current = window.setTimeout(() => {
      void run();
    }, 450);
    return Promise.resolve();
  };

  const expandCluster = (cluster: ItemCluster) => {
    setCollapsed((prev) =>
      prev[cluster] ? { ...prev, [cluster]: false } : prev,
    );
  };
  const collapseCluster = (cluster: ItemCluster) => {
    setCollapsed((prev) =>
      prev[cluster] ? prev : { ...prev, [cluster]: true },
    );
  };

  const persistActiveClusterVisibility = (
    nextHidden: Record<string, boolean>,
  ) => {
    for (const cluster of ALL_CLUSTERS) {
      const visibleKeys = models
        .filter((m) => m.cluster === cluster && !nextHidden[m.key])
        .map((m) => m.key);
      if (visibleKeys.length === 0) continue;
      // 배타로 꺼진 묶음은 비우지 않고, 켜진 묶음만 갱신한다.
      layerPrefsRef.current = {
        ...layerPrefsRef.current,
        byCluster: {
          ...layerPrefsRef.current.byCluster,
          [cluster]: visibleKeys,
        },
      };
    }
    saveLayerPrefs(layerPrefsRef.current);
  };

  const scheduleViewReset = () => {
    // hidden/layers가 반영된 뒤에 맞춘다. userMoved는 바로 지워 두어 이후 메시 로드도 따라온다.
    viewerRef.current?.resetView();
    requestAnimationFrame(() => {
      viewerRef.current?.resetView();
    });
  };

  /** 지정 키만 S3→IndexedDB 캐시로 받는다. 이미 시작한 키는 건너뛴다. */
  const ensureItemsLoaded = (keys: readonly string[]) => {
    const token = authTokenRef.current;
    const ac = loadAbortRef.current;
    if (!token || !ac || ac.signal.aborted) return;
    const wanted = new Set(keys.filter(Boolean));
    if (wanted.size === 0) return;
    const list = itemsRef.current.filter((item) => wanted.has(item.key));
    if (list.length === 0) return;

    const toStart = list.filter((item) => !startedKeysRef.current.has(item.key));
    if (toStart.length === 0) return;
    for (const item of toStart) startedKeysRef.current.add(item.key);

    setLoads((prev) => {
      const next = { ...prev };
      for (const item of toStart) {
        if (next[item.key]?.status === "ready") continue;
        next[item.key] = { status: "loading", progress: 0 };
      }
      return next;
    });

    const setProgress = (key: string, progress: number) =>
      setLoads((prev) =>
        prev[key]?.status === "loading"
          ? { ...prev, [key]: { status: "loading", progress } }
          : prev,
      );
    const fail = (key: string, error: unknown) => {
      if (ac.signal.aborted) return;
      setLoads((prev) => ({
        ...prev,
        [key]: {
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "파일을 불러오지 못했습니다.",
        },
      }));
    };
    const fetchBlob = (item: Item) =>
      fetchS3BlobCached({
        s3Key: item.file.s3Key,
        fileName: item.file.fileName,
        token,
        buildUrl: buildS3ProxyDownloadUrl,
        signal: ac.signal,
        onProgress: (progress) => setProgress(item.key, progress),
      });

    const loadImage = async (item: Item) => {
      if (imageFilesRef.current[item.key]) {
        return { item, file: imageFilesRef.current[item.key] };
      }
      try {
        const blob = await fetchBlob(item);
        if (ac.signal.aborted) return null;
        const file = fileFromImageBlob(blob, item.file.fileName);
        const url = URL.createObjectURL(file);
        imageUrlsRef.current.push(url);
        imageFilesRef.current = { ...imageFilesRef.current, [item.key]: file };
        setImageFiles((prev) => ({ ...prev, [item.key]: file }));
        setImageUrls((prev) => ({ ...prev, [item.key]: url }));
        setLoads((prev) => ({ ...prev, [item.key]: { status: "ready" } }));
        return { item, file };
      } catch (error) {
        fail(item.key, error);
        return null;
      }
    };

    const imagesToLoad = list.filter((i) => i.kind === "image");
    const modelsToLoad = list.filter((i) => i.kind === "model");
    // PLY/OBJ 텍스처는 보통 의뢰 사진. 모델 묶음을 받을 때 사진도 같이 받는다.
    const needsTextureCompanions = modelsToLoad.some((m) => {
      const ext = getModelExtLower(m.file.fileName);
      return ext === ".ply" || ext === ".obj";
    });
    if (needsTextureCompanions) {
      for (const item of itemsRef.current) {
        if (item.kind !== "image") continue;
        if (startedKeysRef.current.has(item.key)) continue;
        startedKeysRef.current.add(item.key);
        imagesToLoad.push(item);
        setLoads((prev) =>
          prev[item.key]?.status === "ready"
            ? prev
            : { ...prev, [item.key]: { status: "loading", progress: 0 } },
        );
      }
    }

    const imagePromises = imagesToLoad.map((item) => loadImage(item));

    for (const item of modelsToLoad) {
      void (async () => {
        try {
          const blob = await fetchBlob(item);
          if (ac.signal.aborted) return;
          const images = (await Promise.all(imagePromises)).filter(
            (v): v is { item: Item; file: File } => Boolean(v),
          );
          const ext = getModelExtLower(item.file.fileName);
          let companionFiles: File[] = [];
          if ((ext === ".ply" || ext === ".obj") && images.length > 0) {
            const preferred =
              ext === ".ply"
                ? peekPlyHeaderInfo(await blob.arrayBuffer()).textureFileName
                : null;
            const textureName = resolveCompanionTextureFileName(
              item.file.fileName,
              preferred,
              images.map((v) => v.item.file.fileName),
            );
            companionFiles = images
              .filter((v) => v.item.file.fileName === textureName)
              .map((v) => v.file);
          }
          if (ac.signal.aborted) return;
          setModelFiles((prev) => ({
            ...prev,
            [item.key]: {
              file: fileFromModelBlob(blob, item.file.fileName),
              companionFiles,
            },
          }));
          setLoads((prev) => ({ ...prev, [item.key]: { status: "ready" } }));
        } catch (error) {
          fail(item.key, error);
        }
      })();
    }
  };

  /** 이 묶음에서 켤 파일(+사진)만 받는다. 숨긴 악·이전 날짜는 눈 아이콘 때. */
  const ensureClusterLoaded = (
    cluster: ItemCluster,
    nextHidden?: Record<string, boolean>,
  ) => {
    const hide = nextHidden;
    const keys = itemsRef.current
      .filter((item) => {
        if (item.cluster !== cluster) return false;
        if (item.kind === "image") return true;
        if (hide) return !hide[item.key];
        return true;
      })
      .map((item) => item.key);
    ensureItemsLoaded(keys);
  };

  // 열 때 활성 클러스터만 먼저 받는다. 나머지는 묶음 클릭 때.
  useEffect(() => {
    if (!open || !authToken) return;
    const ac = new AbortController();
    loadAbortRef.current = ac;
    startedKeysRef.current = new Set();
    imageFilesRef.current = {};
    for (const url of imageUrlsRef.current) URL.revokeObjectURL(url);
    imageUrlsRef.current = [];
    const prefs = loadLayerPrefs();
    layerPrefsRef.current = prefs;
    setColorMapping(prefs.colorMapping ?? DEFAULT_COLOR_MAPPING);
    setProsthesisTransparency(
      prefs.prosthesisTransparency ?? DEFAULT_PROSTHESIS_TRANSPARENCY,
    );
    setModelFiles({});
    setImageFiles({});
    setImageUrls({});
    setLoads({});
    const wanted = initialKeyRef.current;
    const active = pickInitialCluster(models, wanted);
    const startHidden = buildExclusiveHidden(
      models,
      active,
      wanted,
      prefs.byCluster,
    );
    setHidden(startHidden);
    persistActiveClusterVisibility(startHidden);
    setCollapsed(
      Object.fromEntries(
        ALL_CLUSTERS.map((cluster) => {
          const keys = models
            .filter((m) => m.cluster === cluster)
            .map((m) => m.key);
          if (keys.length === 0) return [cluster, true];
          const anyOn = keys.some((key) => !startHidden[key]);
          return [cluster, !anyOn];
        }),
      ),
    );
    const initialImage =
      wanted && items.some((i) => i.key === wanted && i.kind === "image")
        ? wanted
        : null;
    setShownImageKey(initialImage);

    if (active) ensureClusterLoaded(active, startHidden);
    if (initialImage) ensureItemsLoaded([initialImage]);

    return () => {
      ac.abort();
      if (loadAbortRef.current === ac) loadAbortRef.current = null;
      for (const url of imageUrlsRef.current) URL.revokeObjectURL(url);
      imageUrlsRef.current = [];
    };
    // items는 itemsKey가 같으면 같은 파일이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, authToken, itemsKey]);

  // 묶음이 전부 숨겨지면 패널에서 접는다.
  useEffect(() => {
    if (!open) return;
    setCollapsed((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const cluster of ALL_CLUSTERS) {
        const list = models.filter((m) => m.cluster === cluster);
        if (list.length === 0) continue;
        const anyOn = list.some((m) => !hidden[m.key]);
        if (!anyOn && !next[cluster]) {
          next[cluster] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [hidden, models, open]);

  // 켜진 묶음의 표시 키를 localStorage에 남긴다(배타로 꺼진 묶음은 덮지 않음).
  useEffect(() => {
    if (!open) return;
    persistActiveClusterVisibility(hidden);
  }, [hidden, models, open]);

  // 투명도·스캔색은 의뢰와 무관하게 공통 저장.
  useEffect(() => {
    if (!open) return;
    layerPrefsRef.current = {
      ...layerPrefsRef.current,
      prosthesisTransparency,
      colorMapping,
    };
    saveLayerPrefs(layerPrefsRef.current);
  }, [open, prosthesisTransparency, colorMapping]);

  const layers = useMemo<CaseLayerModel[]>(() => {
    const out: CaseLayerModel[] = [];
    for (const m of models) {
      const loaded = modelFiles[m.key];
      if (!loaded) continue;
      out.push({
        id: m.key,
        file: loaded.file,
        companionFiles: loaded.companionFiles,
        tone: m.tone,
        visible: !hidden[m.key],
      });
    }
    return out;
  }, [hidden, modelFiles, models]);

  const pending = items.filter((i) => loads[i.key]?.status === "loading");
  // 화면에 켜진 어벗·보철만 본다. 아직 안 받은 다른 묶음 때문에 seating을 막지 않는다.
  const designShown = designItems.some(
    (i) => i.kind === "model" && !hidden[i.key],
  );
  const designPending =
    designShown &&
    ((Boolean(seatTransferKey) && seatRows === null) ||
      designItems.some(
        (i) =>
          i.kind === "model" &&
          !hidden[i.key] &&
          loads[i.key]?.status !== "ready",
      ));
  const storedSeats = useMemo<CaseSeatRecord[] | undefined>(() => {
    if (!seatRows) return undefined;
    const idOf = new Map(models.map((m) => [m.file.s3Key, m.key]));
    return seatRows.flatMap((row) => {
      const abutmentId = idOf.get(row.abutmentS3Key);
      const prosthesisId = idOf.get(row.prosthesisS3Key);
      return abutmentId && prosthesisId ? [{ abutmentId, prosthesisId, matrix: row.matrix }] : [];
    });
  }, [models, seatRows]);
  const saveSeatDecision = async (decision: CaseSeatDecision): Promise<boolean> => {
    const keyOf = (id: string) => models.find((m) => m.key === id)?.file.s3Key || "";
    const prosthesisS3Key = keyOf(decision.prosthesisId);
    const abutments = decision.abutments.map((a) => ({
      s3Key: keyOf(a.id),
      matrix: a.matrix,
      deviation: a.deviation,
    }));
    if (!seatTransferKey || !authToken || !prosthesisS3Key) return false;
    const res = await request<{ data?: { seats?: AbutmentSeatRow[] } }>({
      path: `/api/practice/transfers/${encodeURIComponent(seatTransferKey)}/abutment-seats`,
      method: "POST",
      token: authToken,
      jsonBody: { prosthesisS3Key, confirmed: decision.confirmed, abutments },
    });
    const seats = res.data?.data?.seats;
    if (res.ok && Array.isArray(seats)) {
      setSeatRows(seats);
      return true;
    }
    toast({ title: "어벗 위치를 저장하지 못했습니다", variant: "destructive", duration: 3000 });
    return false;
  };
  const progress =
    pending.length > 0
      ? pending.reduce((sum, i) => {
          const state = loads[i.key];
          return sum + (state?.status === "loading" ? state.progress : 0);
        }, 0) / pending.length
      : 100;
  const showingImage = Boolean(shownImageKey && imageUrls[shownImageKey]);
  const canAnnotate = showingImage
    ? true
    : layers.some((layer) => layer.visible);
  const shownImage = items.find((i) => i.key === shownImageKey) || null;

  const setClusterShown = (cluster: ItemCluster, on: boolean) => {
    setShownImageKey(null);
    if (!on) {
      setHidden((prev) => {
        // 끄기 직전 이 묶음의 표시 키를 남긴다.
        const visibleKeys = models
          .filter((m) => m.cluster === cluster && !prev[m.key])
          .map((m) => m.key);
        if (visibleKeys.length > 0) {
          layerPrefsRef.current = {
            ...layerPrefsRef.current,
            byCluster: {
              ...layerPrefsRef.current.byCluster,
              [cluster]: visibleKeys,
            },
          };
          saveLayerPrefs(layerPrefsRef.current);
        }
        const next = { ...prev };
        for (const m of models) {
          if (m.cluster === cluster) next[m.key] = true;
        }
        return next;
      });
      collapseCluster(cluster);
      return;
    }
    const nextHidden = buildExclusiveHidden(
      models,
      cluster,
      null,
      layerPrefsRef.current.byCluster,
    );
    ensureClusterLoaded(cluster, nextHidden);
    setHidden(nextHidden);
    expandCluster(cluster);
    scheduleViewReset();
  };

  const setModelVisibleExclusive = (item: Item, on: boolean) => {
    setShownImageKey(null);
    if (!on) {
      setHidden((prev) => {
        const next = { ...prev, [item.key]: true };
        const visibleKeys = models
          .filter((m) => m.cluster === item.cluster && !next[m.key])
          .map((m) => m.key);
        layerPrefsRef.current = {
          ...layerPrefsRef.current,
          byCluster: {
            ...layerPrefsRef.current.byCluster,
            [item.cluster]: visibleKeys,
          },
        };
        saveLayerPrefs(layerPrefsRef.current);
        return next;
      });
      return;
    }
    ensureItemsLoaded([item.key]);
    const sameClusterActive = models.some(
      (m) => m.cluster === item.cluster && !hidden[m.key],
    );
    if (sameClusterActive) {
      setHidden((prev) => ({ ...prev, [item.key]: false }));
      expandCluster(item.cluster);
      return;
    }
    const nextHidden = buildExclusiveHidden(
      models,
      item.cluster,
      item.key,
      layerPrefsRef.current.byCluster,
    );
    ensureClusterLoaded(item.cluster, nextHidden);
    ensureItemsLoaded([item.key]);
    setHidden(nextHidden);
    expandCluster(item.cluster);
    scheduleViewReset();
  };

  const anyModelShown = models.some((m) => !hidden[m.key]);
  const showProsthesisOpacitySlider =
    !showingImage &&
    models.some((m) => m.tone === "prosthesis" && !hidden[m.key]);

  const selectItem = (item: Item) => {
    if (item.kind === "image") {
      ensureItemsLoaded([item.key]);
      setShownImageKey((cur) => (cur === item.key ? null : item.key));
      return;
    }
    setModelVisibleExclusive(item, true);
  };

  const renderClusterGroup = ({
    cluster,
    label,
    list,
    bubbleClass,
  }: {
    cluster: ItemCluster;
    label: string;
    list: Item[];
    bubbleClass: string;
  }) => {
    const keys = list
      .filter((item) => item.kind === "model")
      .map((item) => item.key);
    const clusterOn = !showingImage && keys.some((key) => !hidden[key]);
    const isCollapsed = Boolean(collapsed[cluster]);
    return (
      <li key={cluster} className="flex flex-col items-start gap-1">
        <div className="flex w-full items-center justify-between gap-1 pl-0.5">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-0.5 py-0.5 text-left hover:bg-muted/60"
            onClick={() => {
              if (isCollapsed || !clusterOn) {
                // 접혀 있거나 숨김이면 펼치면서 표시
                setClusterShown(cluster, true);
                return;
              }
              setCollapsed((prev) => ({ ...prev, [cluster]: true }));
            }}
            aria-expanded={!isCollapsed}
            aria-label={`${label} ${isCollapsed || !clusterOn ? "펼치며 보기" : "접기"}`}
          >
            {isCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <p className="truncate text-xs font-semibold text-muted-foreground">
              {label}
            </p>
          </button>
          {keys.length > 0 ? (
            <EyeToggle
              on={clusterOn}
              label={`${label} ${clusterOn ? "숨기기" : "보기"}`}
              onClick={() =>
                setClusterShown(cluster, !clusterOn || showingImage)
              }
            />
          ) : null}
        </div>
        {!isCollapsed ? (
          <ul
            className={cn(
              "flex flex-col divide-y rounded-2xl border px-3 py-0.5",
              bubbleClass,
            )}
          >
            {list.map((item) => {
              const state = loads[item.key];
              const on =
                item.kind === "image"
                  ? shownImageKey === item.key
                  : !hidden[item.key];
              return (
                <li key={item.key} className="flex items-center gap-2 py-1.5">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => selectItem(item)}
                  >
                    <p
                      className="truncate text-[0.8125rem]"
                      title={item.file.fileName}
                    >
                      {item.file.fileName}
                    </p>
                    {state?.status === "error" ? (
                      <p
                        className="truncate text-xs text-destructive"
                        title={state.message}
                      >
                        {state.message}
                      </p>
                    ) : item.file.uploadedAt ? (
                      <p className="text-xs text-muted-foreground">
                        {formatKstDateTimeToKo(item.file.uploadedAt)}
                      </p>
                    ) : null}
                  </button>
                  {state?.status === "loading" ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {Math.round(state.progress)}%
                    </span>
                  ) : (
                    <span className="shrink-0 whitespace-nowrap rounded bg-white/80 px-1.5 py-0.5 text-[0.6875rem] font-medium text-primary-strong">
                      {item.roleLabel}
                    </span>
                  )}
                  <EyeToggle
                    on={on && !(item.kind === "model" && showingImage)}
                    label={on ? "숨기기" : "보기"}
                    disabled={state?.status === "loading"}
                    onClick={() => {
                      if (item.kind === "image") {
                        selectItem(item);
                        return;
                      }
                      if (showingImage) {
                        setModelVisibleExclusive(item, true);
                        return;
                      }
                      setModelVisibleExclusive(item, !on);
                    }}
                  />
                </li>
              );
            })}
          </ul>
        ) : null}
      </li>
    );
  };

  const renderDownloadControl = () => {
    if (!onDownload || items.length === 0) return null;
    const label = downloadBusy ? "다운로드 중..." : "다운로드";
    const trigger = (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn(PREVIEW_HEADER_BUTTON_CLASS, "h-7 px-2 text-xs")}
        disabled={downloadBusy}
        aria-label={label}
        onClick={
          items.length === 1
            ? () => void onDownload([items[0].file])
            : undefined
        }
      >
        <Download />
        <span className="hidden sm:inline">{label}</span>
        {items.length > 1 ? <ChevronDown className="opacity-70" /> : null}
      </Button>
    );
    if (items.length === 1) return trigger;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="z-[460]">
          {items.map((item) => (
            <DropdownMenuItem
              key={item.key}
              onClick={() => void onDownload([item.file])}
            >
              <span className="max-w-[16rem] truncate">
                {item.file.fileName}
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => void onDownload(items.map((item) => item.file))}
          >
            전체 ({items.length}개)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[450] flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 outline-none focus:outline-none focus-visible:outline-none sm:h-[100dvh] sm:max-h-[100dvh] sm:w-screen sm:max-w-none sm:gap-0 sm:rounded-none sm:p-0"
        overlayClassName="z-[445]"
        closeClassName="right-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background opacity-100 shadow-md hover:bg-foreground/85 focus:ring-0 focus:ring-offset-0"
        closeIconClassName="h-5 w-5 stroke-[2.5]"
        onInteractOutside={keepOpenOnToastInteract}
      >
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="relative min-h-[55dvh] min-w-0 flex-1 overflow-hidden bg-muted/50 md:min-h-0">
            {open ? (
              <CaseLayerViewer
                ref={viewerRef}
                layers={layers}
                colorMapping={colorMapping}
                prosthesisTransparency={prosthesisTransparency}
                onPaintSpace={setPaintSpace}
                onViewChange={
                  seatTransferKey
                    ? () => {
                        void persistWorkFilePaint();
                      }
                    : undefined
                }
                designPending={designPending}
                storedSeats={storedSeats}
                onSeatDecision={seatTransferKey ? saveSeatDecision : undefined}
              />
            ) : null}
            {showingImage && shownImageKey ? (
              <div className="absolute inset-0 z-10 bg-muted">
                <ZoomableImagePreview
                  ref={imageRef}
                  src={imageUrls[shownImageKey]}
                  alt={shownImage?.file.fileName || "사진"}
                  fill
                />
              </div>
            ) : null}
            <div className="absolute left-3 top-3 z-20 flex flex-col items-start gap-2">
              <PreviewColorMappingToggle
                checked={colorMapping}
                onCheckedChange={setColorMapping}
                disabled={showingImage || layers.length === 0}
                className="static"
              />
              <PreviewPaintControls
                paint={paint}
                disabled={!canAnnotate}
                className="bg-white/95 text-xs shadow-sm"
              />
            </div>
            {pending.length > 0 ? (
              <div className="pointer-events-none absolute left-1/2 top-4 z-20 w-56 -translate-x-1/2 rounded-md bg-black/55 px-3 py-2 text-xs text-white">
                <p className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  파일 {pending.length}개 불러오는 중
                </p>
                <Progress value={progress} className="mt-1.5 h-1" />
              </div>
            ) : null}
            {canAnnotate ? (
              <PreviewPaintLayer
                paint={paint}
                surfaceKey={showingImage ? shownImageKey || "" : itemsKey}
                captureCanvas={() =>
                  showingImage
                    ? (imageRef.current?.captureCanvas() ?? null)
                    : (viewerRef.current?.captureCanvas() ?? null)
                }
                fileName={shownImage?.file.fileName || heading}
                space={showingImage ? null : paintSpace}
                onAttachChatFile={onAttachChatFile}
                onRemoveChatFile={onRemoveChatFile}
                onReorderChatFiles={onReorderChatFiles}
                onShapesCommit={
                  showingImage
                    ? undefined
                    : (shapes) => {
                        void persistWorkFilePaint(shapes);
                      }
                }
                attachOpensWorkFiles={!showingImage}
                onBeforeAttach={
                  showingImage
                    ? undefined
                    : () => persistWorkFilePaint(
                        paint.paintRef.current?.getShapes() ?? persistShapesRef.current,
                        true,
                      )
                }
              />
            ) : null}
            {!showingImage ? (
              <div className={VIEW_GESTURE_HINT_LAYER_CLASS}>
                <ViewGestureHint />
              </div>
            ) : null}
            {!showingImage ? (
              <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 bg-white/95 px-2.5 text-xs shadow-sm"
                  onClick={() => viewerRef.current?.resetView()}
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  뷰리셋
                </Button>
                {showProsthesisOpacitySlider ? (
                  <div
                    className="flex h-8 w-44 items-center gap-2 rounded-md border border-slate-200 bg-white/95 px-2.5 text-xs font-medium text-slate-800 shadow-sm"
                    title="보철 투명도 (0=완전 불투명, 100=완전 투명)"
                  >
                    <span className="shrink-0">투명도</span>
                    <Slider
                      min={0}
                      max={100}
                      step={1}
                      value={[prosthesisTransparency]}
                      onValueChange={(value) => {
                        const next = Array.isArray(value) ? value[0] : value;
                        setProsthesisTransparency(
                          Math.min(100, Math.max(0, Number(next) || 0)),
                        );
                      }}
                      className="w-full"
                      aria-label="보철 투명도"
                    />
                    <span className="w-7 shrink-0 tabular-nums text-muted-foreground">
                      {prosthesisTransparency}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}
            <AbutsLogo
              variant="light"
              className="pointer-events-none absolute bottom-4 right-4 z-10 opacity-80"
              iconClassName="h-7 w-7"
              wordmarkClassName="text-base"
            />
          </div>

          <aside
            className="relative flex max-h-[45dvh] w-full shrink-0 flex-col border-t bg-card md:max-h-none md:w-[var(--panel-w)] md:border-l md:border-t-0"
            style={panel.style}
          >
            <ResizablePanelHandle panel={panel} />
            <DialogHeader className="space-y-0 border-b bg-muted/50 py-3 pl-4 pr-4 text-left sm:pl-4 sm:pr-4">
              <DialogTitle className="flex min-h-10 items-center pr-12 text-left text-sm font-semibold">
                {heading}
              </DialogTitle>
              {caseInfo ? (
                <div className="mt-0.5 min-w-0 [&_*]:!max-w-full [&_*]:!flex-wrap [&_*]:!overflow-visible [&_*]:!text-clip [&_*]:!whitespace-normal">
                  {caseInfo}
                </div>
              ) : null}
              <DialogDescription className="sr-only">
                의뢰 파일·작업 스캔·어벗·보철을 같은 좌표로 겹쳐 보고,
                사진은 오른쪽 패널에서 엽니다. 스캔과 디자인은 배타로 켜고,
                보철은 파일 좌표에 두고 어벗을 옮겨 꽂은 뒤 편차를 보고 확인합니다. 보철이 여럿이면 펼칩니다. 보철 투명도는
                왼쪽 슬라이더로 조절합니다.
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-muted-foreground">
                  파일
                </p>
                {renderDownloadControl()}
              </div>
              <EyeToggle
                on={anyModelShown && !showingImage}
                label={anyModelShown ? "3D 모두 숨기기" : "3D 모두 보기"}
                disabled={models.length === 0}
                onClick={() => {
                  if (anyModelShown && !showingImage) {
                    persistActiveClusterVisibility(hidden);
                    setHidden(
                      Object.fromEntries(models.map((m) => [m.key, true])),
                    );
                    setCollapsed(
                      Object.fromEntries(
                        ALL_CLUSTERS.map((cluster) => [cluster, true]),
                      ),
                    );
                    setShownImageKey(null);
                    return;
                  }
                  const active = pickInitialCluster(
                    models,
                    initialKeyRef.current,
                  );
                  const nextHidden = buildExclusiveHidden(
                    models,
                    active,
                    null,
                    layerPrefsRef.current.byCluster,
                  );
                  setHidden(nextHidden);
                  setCollapsed(
                    Object.fromEntries(
                      ALL_CLUSTERS.map((cluster) => {
                        const keys = models
                          .filter((m) => m.cluster === cluster)
                          .map((m) => m.key);
                        if (keys.length === 0) return [cluster, true];
                        const anyOn = keys.some((key) => !nextHidden[key]);
                        return [cluster, !anyOn];
                      }),
                    ),
                  );
                  setShownImageKey(null);
                }}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <ul className="flex flex-col gap-2">
                {requestItems.length > 0
                  ? renderClusterGroup({
                      cluster: "request",
                      label: CLUSTER_LABEL.request,
                      list: requestItems,
                      bubbleClass: "w-[92%] rounded-tl-sm bg-muted/60",
                    })
                  : null}
                {workSectionClusters.map((group) =>
                  renderClusterGroup({
                    cluster: group.cluster,
                    label: CLUSTER_LABEL[group.cluster],
                    list: group.list,
                    bubbleClass:
                      "w-full rounded-tr-sm border-primary/30 bg-primary-soft divide-primary/15",
                  }),
                )}
              </ul>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
