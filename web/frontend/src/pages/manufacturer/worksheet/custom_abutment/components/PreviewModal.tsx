// change-log:
// - 2026-08-11: [FP] Front Point 수동 픽/저장(FL과 동일 더블클릭 픽 모드).
// - 2026-08-11: 아노다이징 표시 SSOT는 의뢰건 caseInfos(레거시만 사업체 기본값 폴백).
// - 2026-08-06: 준비 단계 헥스 회전 기본값을 designSoftware 정책으로 우선(미저장 finalHexRotation STL 오적용 수정).
// - 2026-08-06: 헥스 회전 draft를 rnd/finalHexRotation/requestorHexRotation에서도 복원(가공 단계 누락 수정).
// - 2026-08-06: 프리뷰 상단 요약에 출고예정·마감 남은시간 표시(RequestInfoSummary 인라인).
// - 2026-08-04: 프리뷰 헤더에 신속/묶음배송 ShippingModeBadge 상시 표시.
// - 2026-08-04: 환자 정보에 기공소명 전달 보강(business/requestorBusinessAnchor fallback).
// - 2026-08-04: PreviewModal 요약 layout=row(가로 3열)로 STL 영역 확보.
// - 2026-08-04: 프리뷰 상단 의뢰 요약을 RequestInfoSummary로 교체. 환자/임플란트/생산 단위 + STL 오버레이와 치수 중복 제거.
// - 2026-08-03: PreviewModal: 공정 표시 정규화 영향 반영(의뢰 -> 준비 표시). 주로 프리뷰/승인 버튼의 stage label 참조에 영향.
// - 2026-08-03: 작업 공정 변경 반영: 화살표 승인/롤백 기준을 준비 ↔ 가공 흐름으로 정렬(중간 단계 건너뛰기).
// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestInfoSummary.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/MachiningQueueBoard.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/hooks/usePreviewLoader.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/hooks/useRequestFileHandlers.ts
// - web/frontend/src/shared/shipping/ShippingModeBadge.tsx
// - web/backend/controllers/requests/common.requests.controller.js
// - web/backend/modules/requests/request.routes.js
// - web/backend/controllers/rhino/rhino.controller.js
// - web/backend/modules/rhino/rhino.routes.js
import { useCallback, useEffect, useRef, useState } from "react";
import { DialogClose } from "@radix-ui/react-dialog";
import { RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StlPreviewViewer } from "@/features/requests/components/StlPreviewViewer";
import { useStlMetadata } from "@/features/requests/hooks/useStlMetadata";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import { generateModelNumber } from "@/utils/modelNumber";
import { deleteCncProgramCache } from "@/shared/files/fileBlobCache";
import {
  type ManufacturerRequest,
  type ReviewStageKey,
  getDeadlineInfo,
  getReviewStageKeyByTab,
} from "../utils/request";
import { resolveImplantConnectionSpec } from "@/utils/implantConnectionSpec";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { RequestInfoSummary } from "./RequestInfoSummary";
import { ShippingModeBadge } from "@/shared/shipping/ShippingModeBadge";
import { resolveShippingMode } from "@/shared/shipping/shippingMode";

// related files (screw lot tracking):
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestInfoSummary.tsx
// - web/backend/controllers/requests/common.requests.controller.js
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx



type PreviewFiles = {
  original?: File | null;
  cam?: File | null;
  title?: string;
  request?: ManufacturerRequest | null;
  finishLinePoints?: number[][] | null;
  finishLineSource?: "caseInfos" | "file" | null;
};

// related files (hex rotation policy):
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/backend/controllers/requests/common.requests.controller.js
// - web/backend/controllers/bg/bg.controller.js
// - bg/pc1/esprit-addin/Helpers/NcFileGenerator.cs
// Rhino의 align 기능이 구성정보를 대체하므로, 개별 구성정보 파일 모드는 사용하지 않는다.
// 확장 규칙(표시/저장 통일):
// - 프론트 표시(UI)와 백엔드/Esprit 전달값 모두 total 라벨("헥스40도회전" = 30 + 10)을 사용한다.
// - legacy minor 라벨(예: 헥스10도회전)은 하위호환으로만 허용하고 total(헥스40도회전)로 정규화한다.
type ManufacturerHexRotationCanonicalMode = "STL모델대로" | "헥스30도회전";
type HexXRotationLabel = `헥스${number}도회전`;
type ManufacturerHexRotationMode = "STL모델대로" | "헥스30도회전" | HexXRotationLabel;
type ManufacturerHexRotationDraftMode = ManufacturerHexRotationMode | "";

const normalizeManufacturerHexRotationMode = (
  value: unknown,
): ManufacturerHexRotationMode | null => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw === "STL모델대로") return "STL모델대로";
  if (raw === "헥스30도회전") return "헥스30도회전";

  // legacy numeric(백엔드/DB) 값 호환
  if (raw === "0") return "STL모델대로";
  if (raw === "30") return "헥스30도회전";

  const matched = raw.match(/^헥스\s*([+-]?\d+(?:\.\d+)?)\s*도회전$/);
  if (!matched) return null;
  const parsedX = Number(matched[1]);
  if (!Number.isFinite(parsedX)) return null;
  if (parsedX === 30) return "헥스30도회전";

  // 전달/표시 SSOT: total 라벨 사용
  const totalDeg = parsedX < 30 ? parsedX + 30 : parsedX;
  return `헥스${String(totalDeg)}도회전` as ManufacturerHexRotationMode;
};

const toManufacturerHexRotationLabel = (
  mode: ManufacturerHexRotationCanonicalMode,
): "STL모델대로" | "헥스30도회전" => {
  switch (mode) {
    case "STL모델대로":
      return "STL모델대로";
    case "헥스30도회전":
      return "헥스30도회전";
    default:
      throw new Error(`지원하지 않는 헥스 회전 모드: ${String(mode)}`);
  }
};

const resolveRequestorHexRotationByDesignSoftware = (
  designSoftwareRaw: unknown,
): ManufacturerHexRotationCanonicalMode | null => {
  const designSoftware = String(designSoftwareRaw || "").trim();
  if (!designSoftware) return null;
  // 정책 SSOT:
  // - ExoCAD => 헥스30도회전
  // - 3Shape 및 기타(custom 포함) => STL모델대로
  if (designSoftware === "ExoCAD") return "헥스30도회전";
  return "STL모델대로";
};

const UNMACHINABLE_REASON_PRESETS = [
  "얇은 부위 찢어지고 휘어짐",
  "이머전스 프로파일 낮아서 커프 부위 툴 진입 불가",
] as const;

const UNMACHINABLE_REASON_LIST_STORAGE_KEY =
  "worksheet:custom-abutment:unmachinable-reasons";

const parseUnmachinableReasonTokens = (reasonRaw: string): string[] => {
  const raw = String(reasonRaw || "").trim();
  if (!raw) return [];
  return raw
    .split(/\s*\/\s*|\n+/)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
};

const normalizeReasonOptions = (items: unknown): string[] => {
  if (!Array.isArray(items)) return [];
  const deduped: string[] = [];
  for (const item of items) {
    const reason = String(item || "").slice(0, 500).trim();
    if (!reason) continue;
    if (deduped.includes(reason)) continue;
    deduped.push(reason);
    if (deduped.length >= 100) break;
  }
  return deduped;
};

const normalizeEventId = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value).trim();
  }
  if (typeof value === "object") {
    const obj = value as {
      _id?: unknown;
      id?: unknown;
      $oid?: unknown;
      requestId?: unknown;
      toString?: () => string;
    };
    const nested = obj.$oid ?? obj._id ?? obj.id ?? obj.requestId;
    if (nested != null && nested !== value) {
      const resolved = normalizeEventId(nested);
      if (resolved) return resolved;
    }
    const fromToString =
      typeof obj.toString === "function" ? String(obj.toString()) : "";
    const normalized = fromToString.trim();
    if (normalized && normalized !== "[object Object]") return normalized;
  }
  return "";
};

const normalizeLoopPoints = (pts: number[][]): number[][] => {
  const valid = (Array.isArray(pts) ? pts : [])
    .filter((p) => Array.isArray(p) && p.length >= 3)
    .map((p) => [Number(p[0]), Number(p[1]), Number(p[2])])
    .filter((p) => p.every((v) => Number.isFinite(v)));
  if (valid.length < 3) return [];
  const first = valid[0];
  const last = valid[valid.length - 1];
  if (
    Math.abs(first[0] - last[0]) < 1e-6 &&
    Math.abs(first[1] - last[1]) < 1e-6 &&
    Math.abs(first[2] - last[2]) < 1e-6
  ) {
    return valid.slice(0, -1);
  }
  return valid;
};

const nearestIndex = (pts: number[][], q: number[]): number => {
  let bestIdx = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const dx = p[0] - q[0];
    const dy = p[1] - q[1];
    const dz = p[2] - q[2];
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
};

const collectArcIndices = (
  n: number,
  start: number,
  end: number,
  forward: boolean,
): number[] => {
  if (n <= 0) return [];
  const out = [start];
  let cur = start;
  let guard = 0;
  while (cur !== end && guard < n + 2) {
    cur = forward ? (cur + 1) % n : (cur - 1 + n) % n;
    out.push(cur);
    guard += 1;
  }
  return out;
};

const polylineLength = (pts: number[][]): number => {
  if (pts.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    total += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return total;
};



const farthestPair = (pts: number[][]): [number, number] => {
  let bestA = 0;
  let bestB = Math.min(1, Math.max(0, pts.length - 1));
  let best = -1;
  for (let i = 0; i < pts.length; i += 1) {
    for (let j = i + 1; j < pts.length; j += 1) {
      const dx = pts[j][0] - pts[i][0];
      const dy = pts[j][1] - pts[i][1];
      const dz = pts[j][2] - pts[i][2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d > best) {
        best = d;
        bestA = i;
        bestB = j;
      }
    }
  }
  return [bestA, bestB];
};

const orderPickedByEndpoints = (
  picked: number[][],
  start: number[],
  end: number[],
): number[][] => {
  const vx = end[0] - start[0];
  const vy = end[1] - start[1];
  const vz = end[2] - start[2];
  const vLen2 = Math.max(1e-9, vx * vx + vy * vy + vz * vz);
  return [...picked].sort((a, b) => {
    const ta =
      ((a[0] - start[0]) * vx + (a[1] - start[1]) * vy + (a[2] - start[2]) * vz) /
      vLen2;
    const tb =
      ((b[0] - start[0]) * vx + (b[1] - start[1]) * vy + (b[2] - start[2]) * vz) /
      vLen2;
    return ta - tb;
  });
};

const pointToPolylineMinDistSq = (p: number[], poly: number[][]): number => {
  if (poly.length === 0) return Number.POSITIVE_INFINITY;
  if (poly.length === 1) {
    const dx = p[0] - poly[0][0];
    const dy = p[1] - poly[0][1];
    const dz = p[2] - poly[0][2];
    return dx * dx + dy * dy + dz * dz;
  }
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < poly.length; i += 1) {
    const a = poly[i - 1];
    const b = poly[i];
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const abz = b[2] - a[2];
    const apx = p[0] - a[0];
    const apy = p[1] - a[1];
    const apz = p[2] - a[2];
    const denom = Math.max(1e-9, abx * abx + aby * aby + abz * abz);
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / denom));
    const qx = a[0] + abx * t;
    const qy = a[1] + aby * t;
    const qz = a[2] + abz * t;
    const dx = p[0] - qx;
    const dy = p[1] - qy;
    const dz = p[2] - qz;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < best) best = d;
  }
  return best;
};

const avgDistToArc = (picked: number[][], arc: number[][]): number => {
  if (picked.length === 0 || arc.length === 0) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (const p of picked) total += Math.sqrt(pointToPolylineMinDistSq(p, arc));
  return total / picked.length;
};

const buildPatchedFinishLinePoints = (
  basePointsRaw: number[][],
  pickedPointsRaw: number[][],
): number[][] => {
  const base = normalizeLoopPoints(basePointsRaw);
  const pickedRaw = normalizeLoopPoints(pickedPointsRaw);
  if (base.length < 6) return base;
  if (pickedRaw.length < 2) return base;

  const [ea, eb] = farthestPair(pickedRaw);
  const pickedStart = pickedRaw[ea];
  const pickedEnd = pickedRaw[eb];
  const pickedOrdered = orderPickedByEndpoints(pickedRaw, pickedStart, pickedEnd);

  const startIdx = nearestIndex(base, pickedStart);
  let endIdx = nearestIndex(base, pickedEnd);
  if (startIdx === endIdx) {
    endIdx = (startIdx + Math.max(2, Math.floor(base.length * 0.08))) % base.length;
  }

  const forwardArcIdx = collectArcIndices(base.length, startIdx, endIdx, true);
  const backwardArcIdx = collectArcIndices(base.length, startIdx, endIdx, false);
  const forwardArc = forwardArcIdx.map((idx) => base[idx]);
  const backwardArc = backwardArcIdx.map((idx) => base[idx]);

  const forwardScore = avgDistToArc(pickedOrdered, forwardArc);
  const backwardScore = avgDistToArc(pickedOrdered, backwardArc);

  const replaceForward = forwardScore <= backwardScore;
  const keptArc = replaceForward
    ? collectArcIndices(base.length, endIdx, startIdx, true)
    : collectArcIndices(base.length, endIdx, startIdx, false);

  const startSnap = base[startIdx];
  const endSnap = base[endIdx];
  const inner = pickedOrdered.filter(
    (p) =>
      !(
        Math.abs(p[0] - pickedStart[0]) < 1e-9 &&
        Math.abs(p[1] - pickedStart[1]) < 1e-9 &&
        Math.abs(p[2] - pickedStart[2]) < 1e-9
      ) &&
      !(
        Math.abs(p[0] - pickedEnd[0]) < 1e-9 &&
        Math.abs(p[1] - pickedEnd[1]) < 1e-9 &&
        Math.abs(p[2] - pickedEnd[2]) < 1e-9
      ),
  );

  // 사용자 요청: 시작/끝점을 제외한 입력 포인트는 반드시 커브가 통과해야 한다.
  // 따라서 패치 구간에서 내부 포인트는 스무딩으로 이동시키지 않고 그대로 사용한다.
  const patchCore = [startSnap, ...inner, endSnap];
  const keepInner = keptArc.slice(1, -1).map((idx) => base[idx]);

  return [...patchCore, ...keepInner];
};

type PreviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previewLoading: boolean;
  previewFiles: PreviewFiles;
  previewNcText: string;
  previewNcName: string;
  previewStageUrl: string;
  previewStageName: string;
  uploading: Record<string, boolean>;
  reviewSaving: boolean;
  stage: string;
  isCamStage: boolean;
  isMachiningStage: boolean;
  onOpenCodeEditor?: (req: ManufacturerRequest) => void | Promise<void>;
  onUpdateReviewStatus: (params: {
    req: ManufacturerRequest;
    status: "PENDING" | "APPROVED" | "REJECTED";
    stageOverride?: ReviewStageKey;
    keepPreviewOpen?: boolean;
    forceReprocess?: boolean;
    processBothHexVariants?: boolean;
    approvalTriggerSource?: "preview-modal" | "worksheet-tab" | "unknown";
    nextUpCamRunGuard?: boolean;
  }) => Promise<void>;
  onDeleteCam: (
    req: ManufacturerRequest,
    opts?: { rollbackOnly?: boolean; navigate?: boolean },
  ) => Promise<void>;
  onDeleteNc: (
    req: ManufacturerRequest,
    opts?: { nextStage?: string; rollbackOnly?: boolean; navigate?: boolean },
  ) => Promise<void>;
  onDeleteStageFile: (params: {
    req: ManufacturerRequest;
    stage: "machining" | "packing" | "shipping" | "tracking";
    rollbackOnly?: boolean;
    navigate?: boolean;
    preserveStage?: boolean;
  }) => Promise<void>;
  onUploadCam: (req: ManufacturerRequest, files: File[]) => Promise<void>;
  onUploadNc: (req: ManufacturerRequest, files: File[]) => Promise<void>;
  onUploadStageFile: (params: {
    req: ManufacturerRequest;
    stage: "machining" | "packing" | "shipping" | "tracking";
    file: File;
    source: "manual" | "worker";
  }) => Promise<void>;
  onDownloadOriginalStl: (req: ManufacturerRequest) => Promise<void>;
  onDownloadCamStl: (req: ManufacturerRequest) => Promise<void>;
  onDownloadNcFile: (req: ManufacturerRequest) => Promise<void>;
  onDownloadStageFile: (
    req: ManufacturerRequest,
    stage: string,
  ) => Promise<void>;
  onRefreshPreview?: (
    req: ManufacturerRequest,
    opts?: {
      forceRefresh?: boolean;
      openOnlyIfAlreadyOpen?: boolean;
      silent?: boolean;
    },
  ) => Promise<unknown>;
  onMarkUnmachinable?: (
    req: ManufacturerRequest,
    reason: string,
  ) => Promise<void>;
  onRestoreUnmachinable?: (req: ManufacturerRequest) => Promise<void>;
  onSaveManufacturerHexRotation?: (
    req: ManufacturerRequest,
    value: ManufacturerHexRotationMode,
  ) => Promise<void>;
  onSaveAnodizingEnabledOverride?: (
    req: ManufacturerRequest,
    value: boolean,
  ) => Promise<void>;
  onOpenNextRequest?: (currentRequestId: string) => Promise<boolean>;
  setSearchParams: (
    nextInit: ((prev: URLSearchParams) => URLSearchParams) | URLSearchParams,
    navigateOpts?: { replace?: boolean },
  ) => void;
};

export const PreviewModal = ({
  open,
  onOpenChange,
  previewLoading,
  previewFiles,
  previewNcText,
  previewNcName,
  previewStageUrl,
  previewStageName,
  uploading,
  reviewSaving,
  stage,
  isCamStage,
  isMachiningStage,
  onOpenCodeEditor,
  onUpdateReviewStatus,
  onDeleteCam,
  onDeleteNc,
  onDeleteStageFile,
  onUploadCam,
  onUploadNc,
  onUploadStageFile,
  onDownloadOriginalStl,
  onDownloadCamStl,
  onDownloadNcFile,
  onDownloadStageFile,
  onRefreshPreview,
  onMarkUnmachinable,
  onRestoreUnmachinable,
  onSaveManufacturerHexRotation,
  onSaveAnodizingEnabledOverride,
  onOpenNextRequest,
  setSearchParams,
}: PreviewModalProps) => {

  const { token } = useAuthStore();
  const { toast } = useToast();
  const [regenerating, setRegenerating] = useState(false);
  const [twoPhasing, setTwoPhasing] = useState(false);
  const [unmachinableEditorOpen, setUnmachinableEditorOpen] = useState(false);
  const [unmachinableReasonDraft, setUnmachinableReasonDraft] = useState("");
  const [unmachinableSaving, setUnmachinableSaving] = useState(false);
  const [customReasonLibrary, setCustomReasonLibrary] = useState<string[]>(
    [...UNMACHINABLE_REASON_PRESETS],
  );
  const [customReasonEditIndex, setCustomReasonEditIndex] = useState<number | null>(
    null,
  );
  const [customReasonEditDraft, setCustomReasonEditDraft] = useState("");
  const [selectedReasonValues, setSelectedReasonValues] = useState<string[]>([]);
  const [guidedFinishLineMode, setGuidedFinishLineMode] = useState(false);
  const [guidedFinishLinePoints, setGuidedFinishLinePoints] = useState<number[][]>(
    [],
  );
  const screwLotAutoAssignAttemptedRef = useRef<Set<string>>(new Set());
  const [guidedFinishLineSubmitting, setGuidedFinishLineSubmitting] = useState(false);
  const [guidedFinishLineOverridePoints, setGuidedFinishLineOverridePoints] =
    useState<number[][] | null>(null);
  const [guidedFrontPointMode, setGuidedFrontPointMode] = useState(false);
  const [guidedFrontPointPick, setGuidedFrontPointPick] = useState<
    [number, number, number] | null
  >(null);
  const [guidedFrontPointSubmitting, setGuidedFrontPointSubmitting] =
    useState(false);
  const [guidedFrontPointOverride, setGuidedFrontPointOverride] = useState<{
    x: number;
    y: number;
    z: number;
  } | null>(null);
  const [hexRotationSaving, setHexRotationSaving] = useState(false);
  const [anodizingSaving, setAnodizingSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [deleteGeneratedConfirmOpen, setDeleteGeneratedConfirmOpen] =
    useState(false);
  const [manufacturerHexRotationDraft, setManufacturerHexRotationDraft] =
    useState<ManufacturerHexRotationDraftMode>("");
  const [anodizingEnabledDraft, setAnodizingEnabledDraft] = useState<boolean>(true);
  const req = previewFiles.request as ManufacturerRequest | null;
  const lastStableReqRef = useRef<ManufacturerRequest | null>(null);
  const openRef = useRef<boolean>(open);
  const suppressRealtimePreviewRefreshUntilRef = useRef<number>(0);

  const currentRequestMongoId = normalizeEventId(req?._id || (req as any)?.id);
  const currentRequestId = normalizeEventId(req?.requestId);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    if (req) {
      lastStableReqRef.current = req;
    }
  }, [req]);

  useAppEventDebouncedReload({
    enabled: Boolean(open && token && req && onRefreshPreview),
    eventTypes: [
      "request:stage-changed",
      "request:delivery-updated",
      "request:rnd-unmachinable-updated",
      "request:rnd-unmachinable-confirmed",
      "request:stl-metadata-updated",
      "request:delivery-updated-batch",
    ],
    delayMs: 160,
    shouldHandle: (evt) => {
      const evtType = String(evt?.type || "").trim();
      const rawPayload =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as Record<string, unknown>)
          : {};

      // 승인/롤백 공정 전이는 프리뷰를 건드리지 않는다.
      // Rhino(2-filled)/ESPRIT BG 파일 수신(source=bg-file-processed)만 열린 프리뷰를 갱신한다.
      if (evtType === "request:stage-changed") {
        const source = String(rawPayload.source || "").trim();
        if (source !== "bg-file-processed") return false;
      }

      // 메타데이터만 먼저 오는 register-stl-metadata는 camFile 전에 full STL reload 하면
      // 이후 filled 갱신을 레이스로 덮어쓸 수 있다. cam 준비 전에는 스킵(useStlMetadata가 수치 반영).
      if (evtType === "request:stl-metadata-updated") {
        const source = String(rawPayload.source || "").trim();
        if (source === "register-stl-metadata") {
          const eventReq = rawPayload.request as
            | { caseInfos?: { camFile?: { s3Key?: unknown } } }
            | undefined;
          const hasCam = Boolean(
            String(eventReq?.caseInfos?.camFile?.s3Key || "").trim(),
          );
          if (!hasCam) return false;
        }
      }

      const payload = rawPayload as {
        requestId?: unknown;
        requestMongoId?: unknown;
        request?: { _id?: unknown; id?: unknown; requestId?: unknown };
        requests?: Array<{
          requestId?: unknown;
          requestMongoId?: unknown;
          request?: { _id?: unknown; id?: unknown; requestId?: unknown };
        }>;
      };

      const matchesOne = (candidate: {
        requestId?: unknown;
        requestMongoId?: unknown;
        request?: { _id?: unknown; id?: unknown; requestId?: unknown };
      }) => {
        const candidateMongoId = normalizeEventId(
          candidate?.requestMongoId ?? candidate?.request?._id ?? candidate?.request?.id,
        );
        const candidateRequestId = normalizeEventId(
          candidate?.requestId ?? candidate?.request?.requestId,
        );
        if (currentRequestMongoId && candidateMongoId === currentRequestMongoId) {
          return true;
        }
        if (currentRequestId && candidateRequestId === currentRequestId) {
          return true;
        }
        return false;
      };

      if (matchesOne(payload)) return true;
      const rows = Array.isArray(payload.requests) ? payload.requests : [];
      return rows.some((row) => matchesOne(row));
    },
    onMatch: (evt) => {
      if (!openRef.current) return;
      if (Date.now() < suppressRealtimePreviewRefreshUntilRef.current) return;
      const payload =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as {
              request?: ManufacturerRequest;
              requests?: Array<{ request?: ManufacturerRequest }>;
            })
          : {};
      const eventRequest =
        (payload.request as ManufacturerRequest | undefined) ||
        (Array.isArray(payload.requests)
          ? payload.requests.find((row) => {
              const candidate = row?.request;
              if (!candidate) return false;
              const mid = normalizeEventId(candidate._id || (candidate as any)?.id);
              const rid = normalizeEventId(candidate.requestId);
              if (currentRequestMongoId && mid === currentRequestMongoId) return true;
              if (currentRequestId && rid === currentRequestId) return true;
              return false;
            })?.request
          : undefined);
      const target = eventRequest || lastStableReqRef.current;
      if (!target || !onRefreshPreview) return;
      if (eventRequest) {
        lastStableReqRef.current = eventRequest;
      }
      void onRefreshPreview(target, {
        forceRefresh: true,
        openOnlyIfAlreadyOpen: true,
        silent: true,
      });
    },
  });

  useEffect(() => {
    if (!open) {
      setApproving(false);
      setDeleteGeneratedConfirmOpen(false);
    }
  }, [open]);

  const persistReasonLibraryToLocal = useCallback((next: string[]) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        UNMACHINABLE_REASON_LIST_STORAGE_KEY,
        JSON.stringify(next),
      );
    } catch {
      // noop
    }
  }, []);

  const saveReasonLibraryToServer = useCallback(
    async (next: string[]) => {
      if (!token) return;
      try {
        await fetch("/api/requests/rnd-unmachinable-reasons", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ options: next }),
        });
      } catch {
        // noop
      }
    },
    [token],
  );

  const setReasonLibraryWithSync = useCallback(
    (updater: (prev: string[]) => string[]) => {
      setCustomReasonLibrary((prev) => {
        const next = normalizeReasonOptions(updater(prev));
        persistReasonLibraryToLocal(next);
        void saveReasonLibraryToServer(next);
        return next;
      });
    },
    [persistReasonLibraryToLocal, saveReasonLibraryToServer],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(
        UNMACHINABLE_REASON_LIST_STORAGE_KEY,
      );
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const normalized = normalizeReasonOptions(parsed);
      setCustomReasonLibrary(
        normalized.length ? normalized : [...UNMACHINABLE_REASON_PRESETS],
      );
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    if (!open || !token) return;
    void (async () => {
      try {
        const res = await fetch("/api/requests/rnd-unmachinable-reasons", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body?.success === false) return;
        const serverOptions = normalizeReasonOptions(body?.data?.options || []);
        const next = serverOptions.length
          ? serverOptions
          : [...UNMACHINABLE_REASON_PRESETS];
        setCustomReasonLibrary(next);
        persistReasonLibraryToLocal(next);
      } catch {
        // noop
      }
    })();
  }, [open, persistReasonLibraryToLocal, token]);

  useEffect(() => {
    if (!req) return;
    setUnmachinableEditorOpen(false);
    setGuidedFinishLineMode(false);
    setGuidedFinishLinePoints([]);
    setGuidedFinishLineOverridePoints(null);
    setGuidedFrontPointMode(false);
    setGuidedFrontPointPick(null);
    setGuidedFrontPointOverride(null);
    const existingReason = String(req.rnd?.unmachinableReason || "").trim();
    const tokens = parseUnmachinableReasonTokens(existingReason);
    setSelectedReasonValues(tokens);
    setUnmachinableReasonDraft("");

    const caseAnodizing = (req as any)?.caseInfos?.anodizingEnabled;
    const businessDefaultAnodizing = (req as any)?.business?.requestSettings
      ?.anodizingEnabled;
    if (typeof caseAnodizing === "boolean") {
      setAnodizingEnabledDraft(caseAnodizing);
    } else if (typeof businessDefaultAnodizing === "boolean") {
      setAnodizingEnabledDraft(businessDefaultAnodizing);
    } else {
      setAnodizingEnabledDraft(true);
    }

    // 헥스 회전 SSOT 우선순위:
    // 1) 제조사 저장값(rnd/caseInfos.manufacturerHexRotation)
    // 2) 준비·CAM 단계(미저장): designSoftware 정책(ExoCAD=헥스30도, 3Shape=STL) > requestorHexRotation
    //    - 생성 시 finalHexRotation은 제조사 미저장이면 STL로 고정되므로 준비 단계 기본값으로 쓰지 않는다.
    // 3) 가공 이후(미저장 스냅샷): finalHexRotation > requestorHexRotation > designSoftware
    const savedManufacturerHexMode =
      normalizeManufacturerHexRotationMode(
        (req as any)?.rnd?.manufacturerHexRotation,
      ) ||
      normalizeManufacturerHexRotationMode(
        (req as any)?.caseInfos?.manufacturerHexRotation,
      );

    const reviewStageKey = getReviewStageKeyByTab({
      stage,
      isCamStage,
      isMachiningStage,
    });
    const isPrepStage =
      reviewStageKey === "request" || reviewStageKey === "cam";

    let nextHexRotationDraft: ManufacturerHexRotationDraftMode = "";

    if (savedManufacturerHexMode) {
      nextHexRotationDraft = savedManufacturerHexMode;
    } else if (isPrepStage) {
      const byDesignSoftware = resolveRequestorHexRotationByDesignSoftware(
        (req as any)?.caseInfos?.designSoftware,
      );
      if (byDesignSoftware) {
        nextHexRotationDraft = toManufacturerHexRotationLabel(byDesignSoftware);
      } else {
        nextHexRotationDraft =
          normalizeManufacturerHexRotationMode(
            (req as any)?.caseInfos?.requestorHexRotation,
          ) || "";
      }
    } else {
      nextHexRotationDraft =
        normalizeManufacturerHexRotationMode(
          (req as any)?.caseInfos?.finalHexRotation,
        ) ||
        normalizeManufacturerHexRotationMode(
          (req as any)?.caseInfos?.requestorHexRotation,
        ) ||
        (() => {
          const byDesignSoftware = resolveRequestorHexRotationByDesignSoftware(
            (req as any)?.caseInfos?.designSoftware,
          );
          return byDesignSoftware
            ? toManufacturerHexRotationLabel(byDesignSoftware)
            : "";
        })();
    }

    setManufacturerHexRotationDraft(nextHexRotationDraft);

    if (tokens.length) {
      setReasonLibraryWithSync((prev) => {
        const next = [...prev];
        for (const token of tokens) {
          if (!next.includes(token)) next.unshift(token);
        }
        return next;
      });
    }
  }, [req, setReasonLibraryWithSync, stage, isCamStage, isMachiningStage]);

  useEffect(() => {
    if (!open || (!guidedFinishLineMode && !guidedFrontPointMode)) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (guidedFinishLineMode) {
        setGuidedFinishLineMode(false);
        setGuidedFinishLinePoints([]);
      }
      if (guidedFrontPointMode) {
        setGuidedFrontPointMode(false);
        setGuidedFrontPointPick(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, guidedFinishLineMode, guidedFrontPointMode]);

  // Hook은 항상 같은 순서로 호출되어야 하므로 조건부 로직 이전에 호출
  const requestId = req?.requestId || lastStableReqRef.current?.requestId;
  const {
    metadata: stlMetadata,
    recalculate,
    loading: metadataLoading,
  } = useStlMetadata(requestId);

  const activeReq = req || lastStableReqRef.current;

  useEffect(() => {
    if (!open || !token || stage !== "packing" || !activeReq) return;

    const requestMongoId = String(activeReq?._id || "").trim();
    if (!requestMongoId) return;

    const trackedLotNumber = String(
      activeReq?.screwTracking?.lotNumber || "",
    ).trim();
    if (trackedLotNumber) return;

    const overlayCaseInfos = (activeReq?.caseInfos || {}) as Record<string, unknown>;
    const overlayFlat = (activeReq || {}) as Record<string, unknown>;
    const overlaySpec =
      ((overlayFlat.spec as Record<string, unknown> | undefined) || {}) as Record<
        string,
        unknown
      >;

    const resolvedSpec = resolveImplantConnectionSpec({
      implantManufacturer: String(
        overlayCaseInfos.implantManufacturer ||
          overlaySpec.implantCompany ||
          overlayFlat.implantManufacturer ||
          "",
      ).trim(),
      implantBrand: String(
        overlayCaseInfos.implantBrand ||
          overlaySpec.implantBrand ||
          overlaySpec.implantProduct ||
          overlayFlat.implantBrand ||
          "",
      ).trim(),
      implantFamily: String(
        overlayCaseInfos.implantFamily ||
          overlaySpec.implantFamily ||
          overlayFlat.implantFamily ||
          "",
      ).trim(),
      implantType: String(
        overlayCaseInfos.implantType ||
          overlaySpec.implantType ||
          overlayFlat.implantType ||
          "",
      ).trim(),
      connectionDiameter: activeReq?.caseInfos?.connectionDiameter,
    });

    const trackedScrewType = String(activeReq?.screwTracking?.screwType || "").trim();
    const fallbackScrewType = String(
      trackedScrewType || resolvedSpec?.screwType || "",
    )
      .trim()
      .toUpperCase();

    if (!fallbackScrewType || fallbackScrewType === "-") return;

    const attemptKey = `${requestMongoId}:${fallbackScrewType}`;
    if (screwLotAutoAssignAttemptedRef.current.has(attemptKey)) return;
    screwLotAutoAssignAttemptedRef.current.add(attemptKey);

    void (async () => {
      try {
        const res = await fetch(`/api/requests/${requestMongoId}/packing/screw-lot`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            screwType: fallbackScrewType,
          }),
        });

        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          return;
        }

        if (onRefreshPreview) {
          await onRefreshPreview(activeReq, { forceRefresh: true });
        }
      } catch {
        // 자동 보정 실패는 사용자 액션을 막지 않는다.
      }
    })();
  }, [activeReq, onRefreshPreview, open, stage, token]);

  if (!activeReq && !open) return null;

  const handleRecalculateMetadata = async () => {
    if (!requestId) return;

    setRegenerating(true);
    try {
      await recalculate();
      if (activeReq && onRefreshPreview) {
        await onRefreshPreview(activeReq, { forceRefresh: true });
      }
      toast({
        title: "메타데이터 재계산 완료",
        description: "STL 메타데이터가 재계산되었습니다.",
      });
    } catch (error: any) {
      toast({
        title: "재계산 실패",
        description: error.message || "메타데이터 재계산에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setRegenerating(false);
    }
  };

  const postJsonWithTimeout = async (
    url: string,
    options: {
      headers: Record<string, string>;
      body?: string;
      timeoutMs?: number;
    },
  ) => {
    const controller = new AbortController();
    const timeoutMs = Number(options.timeoutMs || 15000);
    const timeoutRef = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        method: "POST",
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeoutRef);
    }
  };

  const finishLinePoints = ((guidedFinishLineOverridePoints ??
    previewFiles.finishLinePoints ??
    activeReq?.caseInfos?.finishLine?.points ??
    stlMetadata?.finishLine?.points) ||
    null) as number[][] | null;

  const toValidFrontPoint = (
    value: unknown,
  ): { x: number; y: number; z: number } | null => {
    if (!value || typeof value !== "object") return null;
    const raw = value as { x?: unknown; y?: unknown; z?: unknown };
    const x = Number(raw.x);
    const y = Number(raw.y);
    const z = Number(raw.z);
    if (![x, y, z].every((v) => Number.isFinite(v))) return null;
    return { x, y, z };
  };

  const guidedFrontPointFromPick = guidedFrontPointPick
    ? {
        x: guidedFrontPointPick[0],
        y: guidedFrontPointPick[1],
        z: guidedFrontPointPick[2],
      }
    : null;

  const effectiveFrontPoint =
    guidedFrontPointOverride ??
    guidedFrontPointFromPick ??
    toValidFrontPoint(activeReq?.caseInfos?.frontPoint) ??
    toValidFrontPoint(stlMetadata?.frontPoint);

  const viewerStlMetadata = stlMetadata
    ? {
        ...stlMetadata,
        ...(effectiveFrontPoint ? { frontPoint: effectiveFrontPoint } : null),
      }
    : effectiveFrontPoint
      ? { frontPoint: effectiveFrontPoint }
      : null;

  const getFinishLineExtremaZ = () => {
    const metaMax = Number(stlMetadata?.finishLine?.max_z);
    const metaMin = Number(stlMetadata?.finishLine?.min_z);
    if (Number.isFinite(metaMax) && Number.isFinite(metaMin)) {
      return { maxZ: metaMax, minZ: metaMin };
    }

    const reqMax = Number(activeReq?.caseInfos?.finishLine?.max_z);
    const reqMin = Number(activeReq?.caseInfos?.finishLine?.min_z);
    if (Number.isFinite(reqMax) && Number.isFinite(reqMin)) {
      return { maxZ: reqMax, minZ: reqMin };
    }

    if (Array.isArray(finishLinePoints) && finishLinePoints.length > 0) {
      const zs = finishLinePoints
        .filter((p) => Array.isArray(p) && p.length >= 3)
        .map((p) => Number(p[2]))
        .filter((z) => Number.isFinite(z));
      if (zs.length > 0) {
        return { maxZ: Math.max(...zs), minZ: Math.min(...zs) };
      }
    }

    return { maxZ: null as number | null, minZ: null as number | null };
  };

  const { maxZ: finishLineMaxZ, minZ: finishLineMinZ } = getFinishLineExtremaZ();

  const isFinishLineMinZRisky =
    Number.isFinite(finishLineMinZ) && Number(finishLineMinZ) < 1;
  const isUnmachinable = Boolean((activeReq as any)?.rnd?.unmachinableAt);
  const shouldShowUnmachinableWarning = isFinishLineMinZRisky && !isUnmachinable;
  const requestorContinueAt = String(
    (activeReq as any)?.rnd?.requestorContinueAt || "",
  ).trim();
  const requestorContinueMessage = String(
    (activeReq as any)?.rnd?.requestorContinueMessage || "",
  ).trim();
  const hasRequestorContinueDecision = Boolean(requestorContinueAt);
  const requestorContinueAtLabel = hasRequestorContinueDecision
    ? new Date(requestorContinueAt).toLocaleString("ko-KR")
    : "";
  const requestorContinueAtMs = Date.parse(requestorContinueAt);
  const unmachinableEventAtMs = Date.parse(
    String(
      (activeReq as any)?.rnd?.unmachinableAt ||
        (activeReq as any)?.rnd?.unmachinablePotentialAt ||
        "",
    ).trim(),
  );
  const showLatestContinueBadge =
    hasRequestorContinueDecision &&
    (!Number.isFinite(unmachinableEventAtMs) ||
      (Number.isFinite(requestorContinueAtMs) &&
        requestorContinueAtMs >= unmachinableEventAtMs));
  const shouldShowUnmachinableBadge =
    (shouldShowUnmachinableWarning || isUnmachinable) && !showLatestContinueBadge;


  const currentReviewStageKey = getReviewStageKeyByTab({
    stage,
    isCamStage,
    isMachiningStage,
  });

  const isStageFileStage =
    currentReviewStageKey === "machining" ||
    currentReviewStageKey === "packing" ||
    currentReviewStageKey === "shipping" ||
    currentReviewStageKey === "tracking";

  const isRequestStage = currentReviewStageKey === "request";

  const isNcStage = currentReviewStageKey === "machining";
  const isImageStage =
    currentReviewStageKey === "packing" ||
    currentReviewStageKey === "shipping" ||
    currentReviewStageKey === "tracking";
  const imageStageKey =
    currentReviewStageKey === "shipping" ? "packing" : currentReviewStageKey;

  const canApprove = (() => {
    if (isStageFileStage) {
      const key = currentReviewStageKey as
        | "machining"
        | "packing"
        | "shipping"
        | "tracking";
      // packing 단계에서는 각인 이미지가 있거나, 포장.발송/packing 롤백 이력이 있으면 승인 가능
      // (롤백 이력 있음 = 이미 각인 라벨 인식 완료된 적 있음)
      if (key === "packing") {
        const hasFile =
          !!activeReq?.caseInfos?.stageFiles?.packing?.s3Key ||
          !!previewStageUrl;
        const hasRollbackHistory =
          Number(activeReq?.caseInfos?.rollbackCounts?.packing || 0) > 0 ||
          Number(activeReq?.caseInfos?.rollbackCounts?.shipping || 0) > 0;
        return hasFile || hasRollbackHistory;
      }
      return (
        !!activeReq?.caseInfos?.stageFiles?.[key]?.s3Key || !!previewStageUrl
      );
    }
    if (isCamStage) {
      // NC가 없어도 승인 버튼으로 재생성 명령을 먼저 수행할 수 있게 허용한다.
      return true;
    }
    // request 단계도 CAM 파일 유무와 무관하게 승인 가능하며,
    // 백엔드가 필요한 작업(재사용/재처리)을 결정한다.
    return true;
  })();

  const isNcGenerating =
    isCamStage &&
    String((activeReq as any)?.realtimeProgress?.badge || "").trim() ===
      "NC 생성중";

  const approveBusy = reviewSaving || approving;

  const controlBtnClass =
    "inline-flex h-8 w-8 items-center justify-center rounded-md border text-[13px] font-medium transition";

  const isUploading = !!uploading[activeReq?._id || ""];

  const originalName =
    activeReq?.caseInfos?.file?.filePath ||
    activeReq?.caseInfos?.file?.originalName ||
    "original.stl";
  const camName = activeReq?.caseInfos?.camFile?.s3Key
    ? activeReq?.caseInfos?.camFile?.filePath ||
      activeReq?.caseInfos?.camFile?.originalName ||
      "filled.stl"
    : "filled.stl";
  const ncName = (() => {
    const raw =
      activeReq?.caseInfos?.ncFile?.originalName ||
      activeReq?.caseInfos?.ncFile?.filePath ||
      previewNcName ||
      "program.nc";
    return raw.split("/").pop() || raw;
  })();

  const leftTitle = isNcStage
    ? ncName
    : isCamStage || isImageStage
      ? camName
      : originalName;
  const rightTitle = isStageFileStage
    ? currentReviewStageKey === "machining"
      ? "로트번호 이미지"
      : "각인 이미지"
    : isCamStage
      ? ncName
      : camName;

  const leftViewer =
    isCamStage || isImageStage
      ? previewFiles.cam || previewFiles.original || null
      : !isStageFileStage
        ? previewFiles.original
        : null;

  const rightViewer =
    !isCamStage && !isStageFileStage ? previewFiles.cam : null;

  const onUploadRight = (file: File) => {
    if (isStageFileStage) {
      const key = currentReviewStageKey as
        | "machining"
        | "packing"
        | "shipping"
        | "tracking";
      void (async () => {
        await onUploadStageFile({
          req: activeReq,
          stage: key,
          file,
          source: "manual",
        });

        if (key === "packing") {
          try {
            // 세척.패킹 프리뷰 모달 업로드는 LOT 인식 캡처 경로를 사용하지 않고,
            // 해당 의뢰 파일 저장 후 즉시 승인(포장.발송 이동)으로 처리한다.
            await onUpdateReviewStatus({
              req: activeReq,
              status: "APPROVED",
              stageOverride: "packing",
              keepPreviewOpen: false,
              approvalTriggerSource: "preview-modal",
            });
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.set("stage", "shipping");
              return next;
            });
            onOpenChange(false);
          } catch {
            // ignore
          }
        }
      })();
      return;
    }
    if (isCamStage) {
      void onUploadNc(activeReq, [file]);
      return;
    }
    void onUploadCam(activeReq, [file]);
  };

  const rightMeta = isStageFileStage
    ? activeReq?.caseInfos?.stageFiles?.[
        imageStageKey as "machining" | "packing" | "shipping" | "tracking"
      ]
    : isCamStage
      ? activeReq?.caseInfos?.ncFile
      : activeReq?.caseInfos?.camFile;
  const hasRightFile = !!rightMeta?.s3Key;

  const canGuideFinishLine =
    !!token &&
    !isStageFileStage &&
    !isCamStage &&
    !!rightViewer &&
    !!activeReq?.requestId;

  const canGuideFrontPoint = canGuideFinishLine;

  const guidedFinishLineFilePath = String(
    activeReq?.caseInfos?.camFile?.filePath ||
      activeReq?.caseInfos?.camFile?.originalName ||
      activeReq?.caseInfos?.file?.filePath ||
      activeReq?.caseInfos?.file?.originalName ||
      previewFiles.cam?.name ||
      previewFiles.original?.name ||
      "",
  ).trim();

  const guidedFrontPointFilePath = guidedFinishLineFilePath;

  const canRegenerateFilledStl = !isStageFileStage;

  const buildStandardStlFileName = (args: {
    requestId: string;
    clinicName?: string;
    patientName?: string;
    tooth?: string;
    originalFileName?: string;
  }) => {
    const ext = args.originalFileName?.includes(".")
      ? `.${String(args.originalFileName).split(".").pop()?.toLowerCase()}`
      : ".stl";
    return `${args.requestId}-${args.clinicName || ""}-${args.patientName || ""}-${args.tooth || ""}${ext}`;
  };

  // 2026-06-08: NC 재생성 - Two-Phase가 기본값, One-Phase는 명시적 요청
  // 기본 NC 재생성 (Two-Phase)
  const onRegenerateNc = async () => {
    if (!canRegenerateFilledStl) return;
    if (!token) {
      toast({
        title: "실패",
        description: "로그인이 필요합니다.",
        variant: "destructive",
      });
      return;
    }
    if (twoPhasing || isUploading || hexRotationSaving) {
      if (hexRotationSaving) {
        toast({
          title: "헥스 회전 저장 중",
          description: "헥스 회전 저장 완료 후 다시 시도해주세요.",
        });
      }
      return;
    }

    setTwoPhasing(true);
    try {
      const requestId = String(activeReq?.requestId || "").trim();
      if (!requestId) {
        toast({
          title: "실패",
          description: "requestId가 없어 NC 재생성을 진행할 수 없습니다.",
          variant: "destructive",
        });
        return;
      }

      const res = await postJsonWithTimeout(
        `/api/requests/by-request/${encodeURIComponent(requestId)}/nc-file/regenerate-2phase`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
          timeoutMs: 20000,
        },
      );
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) {
        const msg =
          body?.message ||
          body?.error ||
          body?.detail ||
          "NC 재생성 요청에 실패했습니다.";
        toast({
          title: "NC 재생성 실패",
          description: msg,
          variant: "destructive",
        });
        return;
      }

      // NC 재생성 성공 시 캐시 무효화
      const s3Key = activeReq?.caseInfos?.ncFile?.s3Key;
      if (s3Key) {
        await deleteCncProgramCache(s3Key);
      }

      toast({
        title: "NC 재생성 요청",
        description: "Two-Phase NC 재생성 요청을 전송했습니다.",
      });

      // 요청 성공 시 모달 닫기
      onOpenChange(false);
    } catch (err: any) {
      const isAbort = String(err?.name || "") === "AbortError";
      toast({
        title: "NC 재생성 실패",
        description: isAbort
          ? "재생성 요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요."
          : err?.message || "NC 재생성 요청에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setTwoPhasing(false);
    }
  };

  const onRegenerate = async () => {
    if (!canRegenerateFilledStl) return;
    if (!token) {
      toast({
        title: "실패",
        description: "로그인이 필요합니다.",
        variant: "destructive",
      });
      return;
    }
    if (regenerating || isUploading || hexRotationSaving) {
      if (hexRotationSaving) {
        toast({
          title: "헥스 회전 저장 중",
          description: "헥스 회전 저장 완료 후 다시 시도해주세요.",
        });
      }
      return;
    }

    if (isCamStage) {
      setRegenerating(true);
      try {
        const requestId = String(activeReq?.requestId || "").trim();
        if (!requestId) {
          toast({
            title: "실패",
            description: "requestId가 없어 재생성을 진행할 수 없습니다.",
            variant: "destructive",
          });
          return;
        }

        const res = await postJsonWithTimeout(
          `/api/requests/by-request/${encodeURIComponent(requestId)}/nc-file/regenerate-2phase`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            timeoutMs: 20000,
          },
        );
        const body: any = await res.json().catch(() => ({}));
        if (!res.ok || body?.success === false) {
          const msg =
            body?.message ||
            body?.error ||
            body?.detail ||
            "NC 재생성 요청에 실패했습니다.";
          toast({
            title: "재생성 실패",
            description: msg,
            variant: "destructive",
          });
          return;
        }

        // NC 재생성 성공 시 캐시 무효화
        const s3Key = activeReq?.caseInfos?.ncFile?.s3Key;
        if (s3Key) {
          await deleteCncProgramCache(s3Key);
        }

        toast({
          title: "재생성 요청",
          description: "NC 재생성을 시작했습니다.",
        });

        // NC 재생성 성공 시 모달 닫기
        onOpenChange(false);
      } catch (err: any) {
        const isAbort = String(err?.name || "") === "AbortError";
        toast({
          title: "재생성 실패",
          description: isAbort
            ? "재생성 요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요."
            : err?.message || "재생성 요청에 실패했습니다.",
          variant: "destructive",
        });
      } finally {
        setRegenerating(false);
      }
      return;
    }

    const standardFilePath =
      activeReq?.requestId &&
      activeReq?.caseInfos?.clinicName &&
      activeReq?.caseInfos?.patientName &&
      activeReq?.caseInfos?.tooth
        ? buildStandardStlFileName({
            requestId: String(activeReq.requestId),
            clinicName: String(activeReq.caseInfos.clinicName || ""),
            patientName: String(activeReq.caseInfos.patientName || ""),
            tooth: String(activeReq.caseInfos.tooth || ""),
            originalFileName:
              activeReq.caseInfos?.file?.originalName ||
              previewFiles.original?.name,
          })
        : "";

    const filePath = String(
      standardFilePath ||
        activeReq?.caseInfos?.file?.filePath ||
        activeReq?.caseInfos?.file?.originalName ||
        previewFiles.original?.name ||
        "",
    ).trim();
    if (!filePath) {
      toast({
        title: "실패",
        description: "원본 STL 파일명이 없어 재생성을 진행할 수 없습니다.",
        variant: "destructive",
      });
      return;
    }

    setRegenerating(true);
    try {
      const res = await fetch("/api/rhino/process-file", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filePath,
          fileName: filePath,
          requestId: activeReq?.requestId || "",
          force: true,
        }),
      });
      const body: any = await res.json().catch(() => ({}));

      if (!res.ok || body?.success === false) {
        const status = res.status;

        const mapped = (() => {
          if (status === 401) {
            return {
              title: "재생성 실패",
              description: "Rhino 서버 인증 실패(Secret 확인)",
            };
          }
          if (status === 404) {
            return {
              title: "재생성 실패",
              description:
                "Rhino 서버에서 파일을 찾지 못했습니다. (filePath 확인)",
            };
          }
          if (status === 503) {
            return {
              title: "재생성 실패",
              description: "Rhino 서비스가 중지 상태입니다.",
            };
          }
          return null;
        })();

        const msg =
          body?.message ||
          body?.error ||
          body?.detail ||
          body?.data?.error ||
          "재생성 요청에 실패했습니다.";

        toast({
          title: mapped?.title || "재생성 실패",
          description: mapped?.description || msg,
          variant: "destructive",
        });
        return;
      }

      // STL 재생성 성공 시 캐시 무효화 (filled.stl 재생성 시 NC도 재생성되므로 NC 캐시도 무효화)
      const ncS3Key = activeReq?.caseInfos?.ncFile?.s3Key;
      if (ncS3Key) {
        await deleteCncProgramCache(ncS3Key);
      }

      toast({
        title: "재생성 요청",
        description: "filled.stl 재처리를 시작했습니다.",
      });

      // 재생성 성공 시 모달 닫기
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "재생성 실패",
        description: err?.message || "재생성 요청에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setRegenerating(false);
    }
  };

  const accept = isStageFileStage
    ? ".png,.jpg,.jpeg,.webp,.bmp"
    : isCamStage
      ? ".nc"
      : ".filled.stl";

  const fileLabel = hasRightFile
    ? String(rightMeta?.filePath || rightTitle).trim() || rightTitle
    : rightTitle;

  const formatElapsed = (secRaw?: number | null) => {
    const sec = Number.isFinite(Number(secRaw))
      ? Math.max(0, Math.floor(Number(secRaw)))
      : null;
    if (sec == null) return "";
    const mm = String(Math.floor(sec / 60)).padStart(2, "0");
    const ss = String(sec % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const getRealtimeToneClass = (tone?: string | null) => {
    if (tone === "amber") {
      return "bg-accent-soft text-accent-strong border-accent-muted";
    }
    if (tone === "indigo") {
      return "bg-primary-soft text-primary-strong border-primary-muted";
    }
    if (tone === "rose") {
      return "bg-destructive-soft text-destructive border-destructive-muted";
    }
    if (tone === "slate") {
      return "bg-slate-50 text-slate-700 border-slate-200";
    }
    return "bg-primary-soft text-primary-strong border-primary-muted";
  };

  const onDownload = () => {
    if (!hasRightFile) return;
    if (isStageFileStage) {
      void onDownloadStageFile(activeReq, imageStageKey);
      return;
    }
    if (isCamStage) {
      void onDownloadNcFile(activeReq);
      return;
    }
    void onDownloadCamStl(activeReq);
  };

  const onDelete = () => {
    if (!hasRightFile) return;
    if (isStageFileStage) {
      void onDeleteStageFile({
        req: activeReq,
        stage: imageStageKey as
          | "machining"
          | "packing"
          | "shipping"
          | "tracking",
        preserveStage: true,
        navigate: false,
      });
      return;
    }
    if (isCamStage) {
      void onDeleteNc(activeReq);
      return;
    }
    void onDeleteCam(activeReq);
  };

  const canDeleteGeneratedOutput =
    canRegenerateFilledStl && !isStageFileStage && hasRightFile;

  const onDeleteGeneratedOutput = () => {
    if (!canDeleteGeneratedOutput || isUploading) return;

    if (isCamStage) {
      void onDeleteNc(activeReq, { nextStage: "cam", navigate: false });
      return;
    }

    void onDeleteCam(activeReq, { navigate: false });
  };

  const toggleReasonSelection = (reasonRaw: string) => {
    const reason = String(reasonRaw || "").trim();
    if (!reason) return;
    setSelectedReasonValues((prev) =>
      prev.includes(reason) ? prev.filter((item) => item !== reason) : [...prev, reason],
    );
  };

  const handleAddGuidedFinishLinePoint = (point: [number, number, number]) => {
    setGuidedFinishLinePoints((prev) => {
      const nextPoint = [Number(point[0]), Number(point[1]), Number(point[2])];
      if (!nextPoint.every((v) => Number.isFinite(v))) return prev;
      const exists = prev.some(
        (p) =>
          Math.abs(Number(p[0]) - nextPoint[0]) < 1e-6 &&
          Math.abs(Number(p[1]) - nextPoint[1]) < 1e-6 &&
          Math.abs(Number(p[2]) - nextPoint[2]) < 1e-6,
      );
      if (exists) return prev;
      if (prev.length >= 24) return prev;
      return [...prev, nextPoint];
    });
  };

  const handleSetGuidedFrontPoint = (point: [number, number, number]) => {
    const nextPoint: [number, number, number] = [
      Number(point[0]),
      Number(point[1]),
      Number(point[2]),
    ];
    if (!nextPoint.every((v) => Number.isFinite(v))) return;
    setGuidedFrontPointPick(nextPoint);
  };

  const handleUndoGuidedFinishLinePoint = () => {
    if (!guidedFinishLineMode || guidedFinishLineSubmitting || isUploading) return;
    setGuidedFinishLinePoints((prev) => prev.slice(0, -1));
  };

  const handleUndoGuidedFrontPoint = () => {
    if (!guidedFrontPointMode || guidedFrontPointSubmitting || isUploading) return;
    setGuidedFrontPointPick(null);
  };

  const handleSubmitGuidedFinishLine = async () => {
    if (!canGuideFinishLine || guidedFinishLineSubmitting || isUploading) return;

    const basePoints = Array.isArray(finishLinePoints) ? finishLinePoints : [];
    const patchedPoints = buildPatchedFinishLinePoints(
      basePoints,
      guidedFinishLinePoints,
    );

    if (patchedPoints.length < 3) {
      setGuidedFinishLineMode(false);
      setGuidedFinishLinePoints([]);
      return;
    }

    if (!guidedFinishLineFilePath) {
      toast({
        title: "실패",
        description: "대상 STL 파일 경로를 찾을 수 없습니다.",
        variant: "destructive",
      });
      return;
    }

    setGuidedFinishLineSubmitting(true);
    setGuidedFinishLineOverridePoints(patchedPoints);

    try {
      const res = await fetch("/api/rhino/finish-line/manual", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId: String(activeReq?.requestId || "").trim(),
          filePath: guidedFinishLineFilePath,
          finishLine: {
            version: 1,
            sectionCount: patchedPoints.length,
            points: patchedPoints,
            strategyUsed: "FRONTEND_GUIDED_PATCH",
          },
        }),
      });

      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
        error?: string;
        detail?: string;
        data?: {
          finishLine?: { points?: unknown };
        };
      };

      if (!res.ok || body?.success === false) {
        const msg =
          body?.message ||
          body?.error ||
          body?.detail ||
          "피니시라인 수동 보정 저장에 실패했습니다.";
        toast({
          title: "저장 실패",
          description: msg,
          variant: "destructive",
        });
        return;
      }

      const savedPoints = body?.data?.finishLine?.points;
      if (Array.isArray(savedPoints) && savedPoints.length >= 3) {
        setGuidedFinishLineOverridePoints(savedPoints as number[][]);
      }

      setGuidedFinishLineMode(false);
      setGuidedFinishLinePoints([]);

      if (onRefreshPreview) {
        await onRefreshPreview(activeReq, { forceRefresh: true });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      toast({
        title: "저장 실패",
        description: message || "피니시라인 수동 보정 저장에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setGuidedFinishLineSubmitting(false);
    }
  };

  const handleSubmitGuidedFrontPoint = async () => {
    if (!canGuideFrontPoint || guidedFrontPointSubmitting || isUploading) return;

    if (!guidedFrontPointPick) {
      setGuidedFrontPointMode(false);
      return;
    }

    if (!guidedFrontPointFilePath) {
      toast({
        title: "실패",
        description: "대상 STL 파일 경로를 찾을 수 없습니다.",
        variant: "destructive",
      });
      return;
    }

    const nextFrontPoint = {
      x: guidedFrontPointPick[0],
      y: guidedFrontPointPick[1],
      z: guidedFrontPointPick[2],
    };

    setGuidedFrontPointSubmitting(true);
    setGuidedFrontPointOverride(nextFrontPoint);

    try {
      const res = await fetch("/api/rhino/front-point/manual", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId: String(activeReq?.requestId || "").trim(),
          filePath: guidedFrontPointFilePath,
          frontPoint: nextFrontPoint,
        }),
      });

      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
        error?: string;
        detail?: string;
        data?: {
          frontPoint?: { x?: unknown; y?: unknown; z?: unknown };
        };
      };

      if (!res.ok || body?.success === false) {
        const msg =
          body?.message ||
          body?.error ||
          body?.detail ||
          "Front Point 수동 저장에 실패했습니다.";
        toast({
          title: "저장 실패",
          description: msg,
          variant: "destructive",
        });
        return;
      }

      const savedPoint = toValidFrontPoint(body?.data?.frontPoint);
      if (savedPoint) {
        setGuidedFrontPointOverride(savedPoint);
      }

      setGuidedFrontPointMode(false);
      setGuidedFrontPointPick(null);

      if (onRefreshPreview) {
        await onRefreshPreview(activeReq, { forceRefresh: true });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      toast({
        title: "저장 실패",
        description: message || "Front Point 수동 저장에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setGuidedFrontPointSubmitting(false);
    }
  };

  const handleToggleFinishLineEdit = () => {
    if (!canGuideFinishLine || guidedFinishLineSubmitting || isUploading) return;
    if (!guidedFinishLineMode) {
      setGuidedFrontPointMode(false);
      setGuidedFrontPointPick(null);
      setGuidedFinishLinePoints([]);
      setGuidedFinishLineMode(true);
      return;
    }
    void handleSubmitGuidedFinishLine();
  };

  const handleToggleFrontPointEdit = () => {
    if (!canGuideFrontPoint || guidedFrontPointSubmitting || isUploading) return;
    if (!guidedFrontPointMode) {
      setGuidedFinishLineMode(false);
      setGuidedFinishLinePoints([]);
      setGuidedFrontPointPick(null);
      setGuidedFrontPointMode(true);
      return;
    }
    void handleSubmitGuidedFrontPoint();
  };

  const addCustomReasonToLibrary = (reasonRaw: string) => {
    const reason = String(reasonRaw || "").slice(0, 500).trim();
    if (!reason) return;
    if (UNMACHINABLE_REASON_PRESETS.includes(reason as (typeof UNMACHINABLE_REASON_PRESETS)[number])) {
      return;
    }
    setReasonLibraryWithSync((prev) => {
      if (prev.some((item) => item === reason)) return prev;
      return [reason, ...prev];
    });
  };

  const handleSubmitUnmachinable = async () => {
    if (!onMarkUnmachinable || isUnmachinable) {
      return;
    }
    const normalizedReasons = Array.from(
      new Set(
        selectedReasonValues
          .map((item) => String(item || "").slice(0, 500).trim())
          .filter(Boolean),
      ),
    );

    if (!normalizedReasons.length) {
      toast({
        title: "사유 선택 필요",
        description: "불완전가공 사유를 1개 이상 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    const reason = normalizedReasons.join(" / ");

    setUnmachinableSaving(true);
    try {
      await onMarkUnmachinable(activeReq, reason);
      normalizedReasons.forEach((item) => addCustomReasonToLibrary(item));
      setUnmachinableEditorOpen(false);
      onOpenChange(false);
    } catch {
      // 실패 토스트는 상위 핸들러에서 표시
    } finally {
      setUnmachinableSaving(false);
    }
  };

  const handleRestoreUnmachinable = async () => {
    if (!onRestoreUnmachinable || !isUnmachinable || unmachinableSaving || approveBusy) {
      return;
    }

    setUnmachinableSaving(true);
    try {
      await onRestoreUnmachinable(activeReq);
      onOpenChange(false);
    } catch {
      // 실패 토스트는 상위 핸들러에서 표시
    } finally {
      setUnmachinableSaving(false);
    }
  };

  const handleSaveManufacturerHexRotation = async (
    next: ManufacturerHexRotationMode,
  ) => {
    if (!onSaveManufacturerHexRotation || hexRotationSaving || approveBusy) {
      return;
    }
    const prev = manufacturerHexRotationDraft;
    setManufacturerHexRotationDraft(next);
    setHexRotationSaving(true);
    try {
      await onSaveManufacturerHexRotation(activeReq, next);
    } catch {
      setManufacturerHexRotationDraft(prev);
    } finally {
      setHexRotationSaving(false);
    }
  };

  const handleToggleAnodizingEnabled = async (checked: boolean) => {
    if (
      !onSaveAnodizingEnabledOverride ||
      anodizingSaving ||
      approveBusy ||
      !(currentReviewStageKey === "request" || currentReviewStageKey === "cam")
    ) {
      return;
    }

    const prev = anodizingEnabledDraft;
    setAnodizingEnabledDraft(checked);
    setAnodizingSaving(true);
    try {
      await onSaveAnodizingEnabledOverride(activeReq, checked);
    } catch (error) {
      setAnodizingEnabledDraft(prev);
      toast({
        title: "아노다이징 저장 실패",
        description:
          error instanceof Error
            ? error.message
            : "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setAnodizingSaving(false);
    }
  };

  const pickInputId = `right-upload-${activeReq?._id || "pending"}`;

  const realtimeBadge = String(activeReq?.realtimeProgress?.badge || "").trim();
  const realtimeElapsedLabel = formatElapsed(
    activeReq?.realtimeProgress?.elapsedSeconds,
  );
  const realtimeToneClass = getRealtimeToneClass(
    activeReq?.realtimeProgress?.tone,
  );
  const fullLotLabel = isRequestStage
    ? ""
    : String(activeReq?.lotNumber?.value || "").trim();
  const hasNcMetadata = Boolean(activeReq?.caseInfos?.ncFile?.s3Key);
  const previewShippingMode = resolveShippingMode(activeReq as any);

  // 유지홈(retentionGroove) 표시
  // none=없음 / shallow=없음 / deep=있음
  const retentionGrooveLabel = (() => {
    const rg = (activeReq?.caseInfos as any)?.retentionGroove as
      | "none"
      | "shallow"
      | "deep"
      | undefined;
    if (!rg) return "";
    return rg === "deep" ? "있음" : "없음";
  })();

  // 헤더 디자인소프트웨어 표시는 BusinessAnchor 전역값이 아닌
  // 의뢰건(caseInfos)에 저장된 값을 사용한다.
  const requestorDesignSoftwareLabel =
    String((activeReq as any)?.caseInfos?.designSoftware || "").trim() || "-";
  const currentCaseAnodizing = (activeReq as any)?.caseInfos?.anodizingEnabled;
  const currentBusinessDefaultAnodizing =
    (activeReq as any)?.business?.requestSettings?.anodizingEnabled;
  const isAnodizingFromBusinessDefault =
    typeof currentCaseAnodizing !== "boolean" &&
    typeof currentBusinessDefaultAnodizing === "boolean";
  const canOverrideAnodizing =
    currentReviewStageKey === "request" || currentReviewStageKey === "cam";

  const overlayCaseInfos = (activeReq?.caseInfos || {}) as Record<string, any>;
  const overlayFlat = (activeReq || {}) as Record<string, any>;
  const overlaySpec = (overlayFlat?.spec || {}) as Record<string, any>;
  const overlayRequestor = (activeReq?.requestor || {}) as Record<string, any>;

  const packMailboxCode = String(activeReq?.mailboxAddress || "").trim();
  const packMaterial = String(
    overlayCaseInfos?.material ||
      overlayFlat?.material ||
      overlayFlat?.lotNumber?.material ||
      "",
  ).trim();
  const packResolvedSpec = resolveImplantConnectionSpec({
    implantManufacturer: String(
      overlayCaseInfos?.implantManufacturer ||
        overlaySpec?.implantCompany ||
        overlayFlat?.implantManufacturer ||
        "",
    ).trim(),
    implantBrand: String(
      overlayCaseInfos?.implantBrand ||
        overlaySpec?.implantBrand ||
        overlaySpec?.implantProduct ||
        overlayFlat?.implantBrand ||
        "",
    ).trim(),
    implantFamily: String(
      overlayCaseInfos?.implantFamily ||
        overlaySpec?.implantFamily ||
        overlayFlat?.implantFamily ||
        "",
    ).trim(),
    implantType: String(
      overlayCaseInfos?.implantType ||
        overlaySpec?.implantType ||
        overlayFlat?.implantType ||
        "",
    ).trim(),
    connectionDiameter: overlayCaseInfos?.connectionDiameter,
  });
  const packScrewType = String(packResolvedSpec?.screwType || "").trim();
  const trackedScrewType = String((activeReq as any)?.screwTracking?.screwType || "").trim();
  const trackedScrewLotNumber = String(
    (activeReq as any)?.screwTracking?.lotNumber || "",
  ).trim();

  const toFiniteNumber = (value: unknown): number | null => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const displayConnectionDiameter =
    toFiniteNumber(overlayCaseInfos?.connectionDiameter) ??
    toFiniteNumber(overlayFlat?.connectionDiameter) ??
    toFiniteNumber(stlMetadata?.connectionDiameter) ??
    toFiniteNumber(overlayCaseInfos?.connectionSpec?.diameter) ??
    toFiniteNumber(overlayCaseInfos?.fixtureConnectionDiameter);

  const maxDiameter =
    toFiniteNumber(stlMetadata?.maxDiameter) ??
    toFiniteNumber(overlayCaseInfos?.maxDiameter) ??
    toFiniteNumber(overlayFlat?.maxDiameter);

  const maxLength =
    toFiniteNumber(stlMetadata?.totalLength) ??
    toFiniteNumber(overlayCaseInfos?.maxLength) ??
    toFiniteNumber(overlayCaseInfos?.totalLength) ??
    toFiniteNumber(overlayFlat?.totalLength);

  const overlayPackMetaItems = [
    packMailboxCode ? `메일함: ${packMailboxCode}` : "",
    trackedScrewType
      ? `스크류타입: ${trackedScrewType}`
      : packScrewType && packScrewType !== "-"
        ? `스크류타입: ${packScrewType}`
        : "",
    `스크류 로트번호: ${trackedScrewLotNumber || "미설정"}`,
    packMaterial ? `재질: ${packMaterial}` : "",
  ].filter(Boolean);

  const estimatedShipYmd = String(
    activeReq?.timeline?.estimatedShipYmd ||
      (activeReq as any)?.estimatedShipYmd ||
      "",
  ).trim();
  const deadlineInfo = getDeadlineInfo(
    activeReq?.createdAt,
    estimatedShipYmd || null,
  );



  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className={`w-[92vw] max-w-5xl h-[85vh] overflow-hidden ${
          shouldShowUnmachinableWarning || isUnmachinable
            ? "border-accent-muted ring-2 ring-accent-muted/80"
            : ""
        }`}
      >
        <DialogTitle className="sr-only">의뢰 미리보기</DialogTitle>
        <DialogDescription className="sr-only">
          의뢰 파일과 NC 내용을 확인하는 영역입니다.
        </DialogDescription>

        <div className="h-full flex flex-col gap-4 overflow-hidden">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-slate-50/70 px-3 py-2 shrink-0">
            <div className="flex min-w-0 items-center gap-2">
              {hasNcMetadata && (
                <Badge
                  variant="outline"
                  className="text-[11px] px-2 py-0.5 font-extrabold leading-[1.1] border border-primary-muted bg-primary-soft text-primary-strong"
                >
                  NC
                </Badge>
              )}
              {activeReq ? (
                <ShippingModeBadge
                  mode={previewShippingMode}
                  className="text-[11px] px-2 py-0.5 font-semibold leading-[1.1] whitespace-nowrap"
                />
              ) : null}
              {fullLotLabel ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className="text-[11px] px-2 py-0.5 font-semibold bg-primary-soft text-primary-strong border-primary-muted"
                  >
                    {fullLotLabel}
                  </Badge>
                  {generateModelNumber(activeReq?.caseInfos) && (
                    <Badge
                      variant="outline"
                      className="text-[11px] px-2 py-0.5 font-semibold leading-[1.1] border border-slate-200 bg-slate-50 text-slate-600"
                    >
                      {generateModelNumber(activeReq?.caseInfos)}
                    </Badge>
                  )}
                  {shouldShowUnmachinableBadge && (
                    <Badge
                      variant="outline"
                      className={`text-[11px] px-2 py-0.5 font-semibold leading-[1.1] border ${
                        isUnmachinable
                          ? "border-accent-muted bg-accent-soft text-accent-strong"
                          : "border-accent-muted bg-accent-soft text-accent-strong"
                      }`}
                    >
                      {isUnmachinable ? "불완전가공" : "불완전가공 확인요망"}
                    </Badge>
                  )}
                  {showLatestContinueBadge && (
                    <Badge
                      variant="outline"
                      className="text-[11px] px-2 py-0.5 font-semibold leading-[1.1] border border-primary-muted bg-primary-soft text-primary-strong"
                      title={requestorContinueMessage || "의뢰자가 계속 가공 진행을 요청했습니다."}
                    >
                      불완전가공 진행
                    </Badge>
                  )}
                </div>
              ) : isUnmachinable || showLatestContinueBadge ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {shouldShowUnmachinableBadge && (
                    <Badge
                      variant="outline"
                      className={`text-[11px] px-2 py-0.5 font-semibold leading-[1.1] border ${
                        isUnmachinable
                          ? "border-accent-muted bg-accent-soft text-accent-strong"
                          : "border-accent-muted bg-accent-soft text-accent-strong"
                      }`}
                    >
                      {isUnmachinable ? "불완전가공" : "불완전가공 확인요망"}
                    </Badge>
                  )}
                  {showLatestContinueBadge && (
                    <Badge
                      variant="outline"
                      className="text-[11px] px-2 py-0.5 font-semibold leading-[1.1] border border-primary-muted bg-primary-soft text-primary-strong"
                      title={requestorContinueMessage || "의뢰자가 계속 가공 진행을 요청했습니다."}
                    >
                      불완전가공 진행
                    </Badge>
                  )}
                </div>
              ) : null}


            </div>

            <div className="flex shrink-0 items-center gap-2">
              <label
                className={`inline-flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-[11px] font-semibold ${
                  canOverrideAnodizing && !approveBusy && !anodizingSaving
                    ? "border-slate-200 bg-white text-slate-700"
                    : "border-slate-200 bg-slate-100 text-slate-400"
                }`}
                title={
                  isAnodizingFromBusinessDefault
                    ? "의뢰건 값이 없어 사업체 기본값(레거시)을 표시 중입니다."
                    : "의뢰건 caseInfos.anodizingEnabled 값을 사용 중입니다."
                }
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300"
                  checked={Boolean(anodizingEnabledDraft)}
                  disabled={
                    !canOverrideAnodizing ||
                    approveBusy ||
                    anodizingSaving ||
                    !onSaveAnodizingEnabledOverride
                  }
                  onChange={(e) => {
                    void handleToggleAnodizingEnabled(Boolean(e.target.checked));
                  }}
                />
                <span className="whitespace-nowrap">아노다이징</span>
                <span className="text-[10px] font-semibold text-slate-500">
                  {anodizingEnabledDraft ? "O" : "X"}
                </span>
              </label>
              <div className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-1">
                <span className="whitespace-nowrap text-[12px] font-semibold text-slate-700">
                  {requestorDesignSoftwareLabel}
                </span>
              </div>
              <div className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-1">
                <span className="mr-2 whitespace-nowrap text-[11px] font-semibold text-slate-500">
                  헥스 회전
                </span>
                <Select
                  value={manufacturerHexRotationDraft || undefined}
                  onValueChange={(value) => {
                    const next = normalizeManufacturerHexRotationMode(value);
                    if (!next) return;
                    void handleSaveManufacturerHexRotation(next);
                  }}
                  disabled={
                    hexRotationSaving ||
                    approveBusy ||
                    !onSaveManufacturerHexRotation ||
                    !isRequestStage
                  }
                >
                  <SelectTrigger className="h-7 min-w-[112px] rounded-md border border-slate-200 bg-slate-50 px-2 text-[12px] font-semibold text-slate-700 shadow-sm focus:ring-1 focus:ring-primary-muted disabled:opacity-60">
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent align="end" className="min-w-[112px]">
                    <SelectItem value="STL모델대로" className="text-[12px] font-medium">
                      {toManufacturerHexRotationLabel("STL모델대로")}
                    </SelectItem>
                    <SelectItem value="헥스30도회전" className="text-[12px] font-medium">
                      {toManufacturerHexRotationLabel("헥스30도회전")}
                    </SelectItem>
                    <SelectItem value="헥스40도회전" className="text-[12px] font-medium">
                      헥스40도회전
                    </SelectItem>

                  </SelectContent>
                </Select>
              </div>
              {isUnmachinable ? (
                  <button
                    type="button"
                    className={`h-8 rounded-md border px-2 text-[12px] font-semibold transition ${
                      unmachinableSaving || approveBusy
                        ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                        : "border-primary-muted bg-primary-soft text-primary-strong hover:bg-primary-soft"
                    }`}
                    disabled={unmachinableSaving || approveBusy}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleRestoreUnmachinable();
                    }}
                  >
                    {unmachinableSaving ? "복귀 중..." : "불완전가공 복귀"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`h-8 rounded-md border px-2 text-[12px] font-semibold transition ${
                      unmachinableSaving || approveBusy
                        ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                        : "border-accent-muted bg-accent-soft text-accent-strong hover:bg-accent-muted/50"
                    }`}
                    disabled={unmachinableSaving || approveBusy}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (unmachinableSaving || approveBusy) return;
                      setUnmachinableEditorOpen(true);
                    }}
                  >
                    불완전가공
                  </button>
                )}
              {!isRequestStage && (
                <button
                  type="button"
                  className={`${controlBtnClass} ${
                    approveBusy
                      ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                  disabled={approveBusy}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const performBack = async () => {
                      const stageKey = currentReviewStageKey;
                      suppressRealtimePreviewRefreshUntilRef.current = Date.now() + 7000;

                      toast({
                        title: "롤백 요청 전송됨",
                        description:
                          stageKey === "machining" || stageKey === "cam"
                            ? "준비 단계로 되돌리는 중입니다. 잠시만 기다려주세요."
                            : "이전 공정으로 되돌리는 중입니다. 잠시만 기다려주세요.",
                        duration: 3000,
                        skipDuplicateCheck: true,
                      });

                      if (stageKey === "machining") {
                        // 작업 공정 변경: 중간 단계를 건너뛰고 가공 → 준비로 직접 롤백
                        await onDeleteNc(activeReq, {
                          nextStage: "request",
                          rollbackOnly: true,
                          navigate: false,
                        });
                      } else if (
                        stageKey === "packing" ||
                        stageKey === "shipping" ||
                        stageKey === "tracking"
                      ) {
                        await onDeleteStageFile({
                          req: activeReq,
                          stage: stageKey,
                          rollbackOnly: true,
                          navigate: false,
                        });
                      } else if (stageKey === "cam") {
                        await onDeleteNc(activeReq, {
                          nextStage: "request",
                          rollbackOnly: true,
                          navigate: false,
                        });
                      } else {
                        await onDeleteCam(activeReq, {
                          rollbackOnly: true,
                          navigate: false,
                        });
                      }
                    };

                    // 롤백 후에는 자동 재오픈 없이 모달만 닫는다.
                    void performBack().then(() => {
                      onOpenChange(false);
                    });
                  }}
                  aria-label="이전 공정"
                  title="이전 공정"
                >
                  ←
                </button>
              )}

              <button
                type="button"
                className={`${controlBtnClass} ${
                  approveBusy || !onOpenNextRequest
                    ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                disabled={approveBusy || !onOpenNextRequest}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const currentRequestId = String(
                    activeReq?.requestId || "",
                  ).trim();
                  if (!currentRequestId || !onOpenNextRequest) return;
                  void onOpenNextRequest(currentRequestId);
                }}
                aria-label="Skip"
                title="Skip"
              >
                S
              </button>

              <button
                type="button"
                className={`${controlBtnClass} ${
                  approveBusy || !canApprove || isNcGenerating
                    ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                disabled={approveBusy || !canApprove || isNcGenerating}
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (approveBusy || !canApprove || isNcGenerating) return;

                  const runApprove = async () => {
                    if (approving) return;
                    setApproving(true);
                    suppressRealtimePreviewRefreshUntilRef.current = Date.now() + 7000;
                    try {
                      // 준비 단계 승인(준비→가공) 전, rnd.manufacturerHexRotation 누락 시
                      // 현재 선택된 "헥스 회전" 값(라벨: STL모델대로/헥스30도회전)으로 선저장한다.
                      // request-meta는 rnd.manufacturerHexRotation을 필수로 사용하므로,
                      // 누락 상태에서 승인되면 BG(Esprit) 재실행이 실패할 수 있다.
                      if (currentReviewStageKey === "request") {
                        const hasRndManufacturerHex =
                          !!normalizeManufacturerHexRotationMode(
                            activeReq?.rnd?.manufacturerHexRotation,
                          );

                        if (!hasRndManufacturerHex) {
                          if (!onSaveManufacturerHexRotation) {
                            toast({
                              title: "승인 불가",
                              description:
                                "헥스 회전 저장 핸들러가 없어 승인할 수 없습니다.",
                              variant: "destructive",
                            });
                            return;
                          }

                          let nextHexMode: ManufacturerHexRotationMode | null = null;
                          const normalizedDraft = normalizeManufacturerHexRotationMode(
                            manufacturerHexRotationDraft,
                          );
                          if (normalizedDraft) {
                            nextHexMode = normalizedDraft;
                          } else {
                            const byDesignSoftware =
                              resolveRequestorHexRotationByDesignSoftware(
                                (
                                  activeReq?.caseInfos as
                                    | { designSoftware?: unknown }
                                    | undefined
                                )?.designSoftware,
                              );
                            if (byDesignSoftware) {
                              nextHexMode =
                                toManufacturerHexRotationLabel(byDesignSoftware);
                            }
                          }

                          if (!nextHexMode) {
                            toast({
                              title: "승인 불가",
                              description:
                                "헥스 회전값이 비어 있습니다. 'STL모델대로', '헥스30도회전', '헥스X도회전' 중 하나를 선택해 주세요.",
                              variant: "destructive",
                            });
                            return;
                          }

                          await onSaveManufacturerHexRotation(activeReq, nextHexMode);
                        }
                      }

                      // 준비 승인 SSOT: stage=machining + nextUpCamRunGuard 로 가공 진입.
                      const transitionStageKey =
                        currentReviewStageKey === "request"
                          ? "machining"
                          : currentReviewStageKey;

                      const isRequestNextUpTransition =
                        currentReviewStageKey === "request" &&
                        transitionStageKey === "machining";

                      toast({
                        title:
                          currentReviewStageKey === "request"
                            ? "가공 이동 요청 전송됨"
                            : "승인 요청 전송됨",
                        description:
                          currentReviewStageKey === "request"
                            ? "의뢰를 가공으로 넘기는 중입니다. 잠시만 기다려주세요."
                            : "승인 처리 중입니다. 잠시만 기다려주세요.",
                        duration: 15000,
                        skipDuplicateCheck: true,
                      });

                      // 승인 처리: keepPreviewOpen=false → 승인 후 모달이 즉시 닫힌다.
                      // BG 앱 트리거(Esprit 등)는 백엔드 ReviewApprovalQueue에서 직렬로 처리된다.
                      // 다음 의뢰는 자동으로 열리지 않는다(연속 승인으로 인한 충돌 방지).
                      await onUpdateReviewStatus({
                        req: activeReq,
                        status: "APPROVED",
                        stageOverride: transitionStageKey,
                        keepPreviewOpen: false,
                        // 기본 승인에서는 기존 작업 이력을 우선 재사용한다.
                        // 강제 재실행이 필요한 경우에만 forceReprocess=true를 명시 전달한다.
                        forceReprocess: false,
                        approvalTriggerSource: "preview-modal",
                        nextUpCamRunGuard: isRequestNextUpTransition,
                      });

                      // 준비→가공 진입 승인 시 NC 파일 bridge-store 동기화 (비동기, 실패 무시)
                      if (isRequestNextUpTransition) {
                        const requestId = String(activeReq.requestId).trim();
                        if (token && requestId) {
                          void fetch(
                            `/api/requests/by-request/${encodeURIComponent(requestId)}/nc-file/ensure-bridge`,
                            {
                              method: "POST",
                              headers: {
                                Authorization: `Bearer ${token}`,
                                "Content-Type": "application/json",
                              },
                              body: JSON.stringify({}),
                            },
                          ).catch((err) => {
                            console.error("NC bridge ensure failed:", err);
                          });
                        }
                      }

                      // 승인 후에는 자동 재오픈 없이 모달만 닫는다.
                      onOpenChange(false);
                    } finally {
                      setApproving(false);
                    }
                  };

                  try {
                    await runApprove();
                  } catch (err) {
                    console.error("Review status update failed:", err);
                  }
                }}
                aria-label="다음 공정"
                title="다음 공정"
              >
                →
              </button>

              <DialogClose asChild>
                <button
                  type="button"
                  className={`${controlBtnClass} ${
                    approveBusy
                      ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                  disabled={approveBusy}
                >
                  X
                </button>
              </DialogClose>
            </div>
          </div>

          <RequestInfoSummary
            className="shrink-0"
            layout="row"
            requestorLabel={
              overlayRequestor?.business ||
              (activeReq as any)?.business?.name ||
              (activeReq as any)?.requestorBusinessAnchor?.name ||
              overlayFlat?.business?.name ||
              overlayRequestor?.name
            }
            clinicName={
              overlayCaseInfos?.clinicName || overlayFlat?.clinicName
            }
            createdAt={activeReq?.createdAt}
            patientName={
              overlayCaseInfos?.patientName || overlayFlat?.patientName
            }
            tooth={overlayCaseInfos?.tooth || overlayFlat?.tooth}
            connectionDiameter={displayConnectionDiameter}
            maxDiameter={maxDiameter}
            maxLength={maxLength}
            omitGeometryMetrics={!isNcStage && Boolean(leftViewer)}
            implantParts={[
              overlayCaseInfos?.implantManufacturer ||
                overlaySpec?.implantCompany ||
                overlayFlat?.implantManufacturer,
              overlayCaseInfos?.implantBrand ||
                overlaySpec?.implantBrand ||
                overlaySpec?.implantProduct ||
                overlayFlat?.implantBrand,
              overlayCaseInfos?.implantFamily ||
                overlaySpec?.implantFamily ||
                overlayFlat?.implantFamily,
              overlayCaseInfos?.implantType ||
                overlaySpec?.implantType ||
                overlayFlat?.implantType,
            ]}
            retentionGrooveLabel={retentionGrooveLabel || null}
            productionMetaItems={overlayPackMetaItems}
            estimatedShipYmd={estimatedShipYmd || null}
            deadlineInfo={deadlineInfo}
          />

          {unmachinableEditorOpen && (
            <div className="shrink-0 rounded-lg border border-accent-muted bg-accent-soft/70 p-2 space-y-2 max-h-[34vh] overflow-y-auto">
              <div className="text-xs font-semibold text-accent-strong">불완전가공 사유 입력</div>

              <div className="space-y-1.5 rounded-md border border-accent-muted bg-white/80 p-1.5">
                {customReasonLibrary.map((reason, idx) => {
                  const selected = selectedReasonValues.includes(reason);
                  return (
                    <div
                      key={`${reason}-${idx}`}
                      className="flex items-center gap-1 rounded border border-slate-200 bg-white p-1"
                    >
                      {customReasonEditIndex === idx ? (
                        <>
                          <input
                            value={customReasonEditDraft}
                            onChange={(e) =>
                              setCustomReasonEditDraft(
                                String(e.target.value || "").slice(0, 500),
                              )
                            }
                            className="flex-1 h-7 rounded border border-slate-200 px-2 text-xs"
                          />
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              const next = customReasonEditDraft.trim();
                              if (!next) return;
                              setReasonLibraryWithSync((prev) => {
                                const clone = [...prev];
                                clone[idx] = next;
                                return Array.from(new Set(clone));
                              });
                              setSelectedReasonValues((prev) => {
                                const filtered = prev.filter((item) => item !== reason);
                                return filtered.includes(next)
                                  ? filtered
                                  : [...filtered, next];
                              });
                              setCustomReasonEditIndex(null);
                              setCustomReasonEditDraft("");
                            }}
                          >
                            저장
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              setCustomReasonEditIndex(null);
                              setCustomReasonEditDraft("");
                            }}
                          >
                            취소
                          </Button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={`flex-1 text-left text-xs rounded px-2 h-7 ${
                              selected
                                ? "bg-primary-soft text-primary-strong border border-primary-muted"
                                : "text-slate-700 hover:bg-slate-50"
                            }`}
                            onClick={() => toggleReasonSelection(reason)}
                          >
                            {reason}
                          </button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              setCustomReasonEditIndex(idx);
                              setCustomReasonEditDraft(reason);
                            }}
                          >
                            수정
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => {
                              setReasonLibraryWithSync((prev) =>
                                prev.filter((_, i) => i !== idx),
                              );
                              setSelectedReasonValues((prev) =>
                                prev.filter((item) => item !== reason),
                              );
                            }}
                          >
                            삭제
                          </Button>
                        </>
                      )}
                    </div>
                  );
                })}

                <div className="flex items-center gap-1 rounded border border-dashed border-slate-300 bg-slate-50 p-1">
                  <input
                    value={unmachinableReasonDraft}
                    onChange={(e) =>
                      setUnmachinableReasonDraft(
                        String(e.target.value || "").slice(0, 500),
                      )
                    }
                    placeholder="새 사유 입력"
                    className="flex-1 h-7 rounded border border-slate-200 px-2 text-xs bg-white"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={unmachinableSaving || !unmachinableReasonDraft.trim()}
                    onClick={() => {
                      addCustomReasonToLibrary(unmachinableReasonDraft);
                      setUnmachinableReasonDraft("");
                    }}
                  >
                    추가
                  </Button>
                </div>
              </div>

              <div className="rounded-md border border-accent-muted bg-white px-2 py-2">
                <div className="text-[11px] font-semibold text-slate-700 mb-1">
                  선택된 사유 ({selectedReasonValues.length})
                </div>
                {selectedReasonValues.length ? (
                  <div className="flex flex-wrap gap-1">
                    {selectedReasonValues.map((reason) => (
                      <Badge
                        key={`selected-reason-${reason}`}
                        variant="outline"
                        className="text-[11px] border-accent-muted bg-accent-soft text-accent-strong"
                      >
                        {reason}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500">선택된 사유가 없습니다.</div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={unmachinableSaving}
                  onClick={() => setUnmachinableEditorOpen(false)}
                >
                  취소
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-accent-strong hover:bg-accent-strong"
                  disabled={unmachinableSaving}
                  onClick={() => void handleSubmitUnmachinable()}
                >
                  {unmachinableSaving ? "처리 중..." : "확인"}
                </Button>
              </div>
            </div>
          )}

          {previewLoading ? (
            <div className="rounded-lg border border-dashed p-8 flex flex-col items-center gap-2 text-sm text-slate-500">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-primary" />
              <div>STL 불러오는 중...</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0 overflow-hidden">
              <div className="border rounded-lg p-3 space-y-2 flex flex-col overflow-hidden">
                <button
                  type="button"
                  className="text-sm font-semibold text-primary-strong hover:underline text-left max-w-[320px] truncate"
                  onClick={() => {
                    if (isMachiningStage) {
                      void onDownloadNcFile(activeReq);
                      return;
                    }
                    if (isCamStage || isImageStage) {
                      void onDownloadCamStl(activeReq);
                      return;
                    }
                    void onDownloadOriginalStl(activeReq);
                  }}
                >
                  {leftTitle}
                </button>
                {isNcStage ? (
                  <textarea
                    className="w-full flex-1 min-h-0 rounded-md border border-slate-200 p-3 font-mono text-xs text-slate-700 resize-none overflow-auto"
                    value={previewNcText}
                    readOnly
                  />
                ) : leftViewer ? (
                  <div className="flex-1 min-h-0 rounded-md border border-slate-200 overflow-hidden">
                    <StlPreviewViewer
                      file={leftViewer}
                      requestId={requestId}
                      metadata={stlMetadata}
                      showOverlay={true}
                      finishLinePoints={finishLinePoints}
                    />
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-xs text-slate-500">
                    파일 없음
                  </div>
                )}
              </div>

              <div
                className="border rounded-lg p-3 space-y-2 flex flex-col overflow-hidden"
                onDragOver={(e) => {
                  if (!isStageFileStage || isUploading) return;
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  if (!isStageFileStage || isUploading) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const file = e.dataTransfer.files?.[0];
                  if (!file) return;
                  onUploadRight(file);
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="text-sm font-semibold text-primary-strong hover:underline text-left max-w-[320px] truncate"
                    onClick={onDownload}
                    title={
                      stage === "packing" || stage === "shipping"
                        ? "각인 이미지"
                        : fileLabel
                    }
                  >
                    {stage === "packing" || stage === "shipping"
                      ? "각인 이미지"
                      : fileLabel}
                  </button>
                  <div className="flex items-center gap-2">
                    <TooltipProvider delayDuration={0}>
                      {canGuideFinishLine && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className={`inline-flex items-center justify-center h-8 w-8 rounded-md border text-[11px] font-bold transition ${
                                guidedFinishLineMode
                                  ? "border-accent/80 bg-accent-soft text-accent-strong"
                                  : "border-primary-muted bg-primary-soft text-primary-strong hover:bg-primary-soft"
                              } ${guidedFinishLineSubmitting || guidedFrontPointSubmitting || isUploading ? "opacity-60 cursor-not-allowed" : ""}`}
                              disabled={
                                guidedFinishLineSubmitting ||
                                guidedFrontPointSubmitting ||
                                isUploading
                              }
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleToggleFinishLineEdit();
                              }}
                              aria-label={
                                guidedFinishLineMode
                                  ? "Finish Line 수동편집 완료"
                                  : "Finish Line"
                              }
                            >
                              FL
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            Finish Line
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {canGuideFrontPoint && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className={`inline-flex items-center justify-center h-8 w-8 rounded-md border text-[11px] font-bold transition ${
                                guidedFrontPointMode
                                  ? "border-accent/80 bg-accent-soft text-accent-strong"
                                  : "border-primary-muted bg-primary-soft text-primary-strong hover:bg-primary-soft"
                              } ${guidedFrontPointSubmitting || guidedFinishLineSubmitting || isUploading ? "opacity-60 cursor-not-allowed" : ""}`}
                              disabled={
                                guidedFrontPointSubmitting ||
                                guidedFinishLineSubmitting ||
                                isUploading
                              }
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleToggleFrontPointEdit();
                              }}
                              aria-label={
                                guidedFrontPointMode
                                  ? "Front Point 수동편집 완료"
                                  : "Front Point"
                              }
                            >
                              FP
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            Front Point
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </TooltipProvider>
                    {isCamStage && onOpenCodeEditor && (
                      <button
                        type="button"
                        className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-slate-200 bg-white text-[12px] font-mono font-bold text-slate-700 transition hover:bg-slate-50"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!activeReq) return;
                          void onOpenCodeEditor(activeReq);
                        }}
                        aria-label="코드 에디터"
                        title="코드 에디터"
                      >
                        {"</>"}
                      </button>
                    )}

                    {canRegenerateFilledStl && (
                      <>
                        <TooltipProvider delayDuration={0}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className={`inline-flex items-center justify-center h-8 w-8 rounded-md border text-[13px] font-medium transition ${
                                  twoPhasing || regenerating || isUploading || hexRotationSaving
                                    ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                                    : "border-primary-muted bg-primary-soft text-primary-strong hover:bg-primary-soft"
                                }`}
                                disabled={
                                  twoPhasing || regenerating || isUploading || hexRotationSaving
                                }
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (isCamStage) {
                                    void onRegenerateNc();
                                    return;
                                  }
                                  void onRegenerate();
                                }}
                                aria-label={
                                  isCamStage ? "NC 재생성" : "filled.stl 재생성"
                                }
                              >
                                <RefreshCw
                                  className={`h-4 w-4 ${twoPhasing || regenerating ? "animate-spin" : ""}`}
                                />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                              {isCamStage ? "NC 재생성" : "filled.stl 재생성"}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <button
                          type="button"
                          className={`inline-flex items-center justify-center h-8 w-8 rounded-md border text-[13px] font-medium transition ${
                            !canDeleteGeneratedOutput || isUploading || twoPhasing || regenerating || hexRotationSaving
                              ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-destructive-soft hover:border-destructive-muted hover:text-destructive"
                          }`}
                          disabled={
                            !canDeleteGeneratedOutput ||
                            isUploading ||
                            twoPhasing ||
                            regenerating ||
                            hexRotationSaving
                          }
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!canDeleteGeneratedOutput) return;
                            setDeleteGeneratedConfirmOpen(true);
                          }}
                          aria-label={
                            isCamStage
                              ? "생성된 NC 파일 삭제"
                              : "생성된 filled STL 삭제"
                          }
                          title={
                            isCamStage
                              ? "생성된 NC 파일 삭제"
                              : "생성된 filled STL 삭제"
                          }
                        >
                          X
                        </button>
                      </>
                    )}

                    {isStageFileStage && (
                      <>
                        <button
                          type="button"
                          className={`inline-flex items-center justify-center h-8 w-8 rounded-md border text-[13px] font-medium transition ${
                            !hasRightFile || isUploading
                              ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-destructive-soft hover:border-destructive-muted hover:text-destructive"
                          }`}
                          disabled={!hasRightFile || isUploading}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDelete();
                          }}
                          aria-label="삭제"
                          title="삭제"
                        >
                          삭제
                        </button>

                        <label
                          htmlFor={pickInputId}
                          className={`inline-flex items-center justify-center h-8 rounded-md border px-2 text-[12px] font-medium transition ${
                            isUploading
                              ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                              : "border-slate-200 bg-white text-slate-700 cursor-pointer hover:bg-accent-soft hover:border-accent-muted hover:text-accent-strong"
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          업로드
                        </label>
                        <input
                          id={pickInputId}
                          type="file"
                          accept={accept}
                          className="hidden"
                          disabled={isUploading}
                          onChange={(e) => {
                            e.stopPropagation();
                            const file = e.target.files?.[0];
                            if (!file) return;
                            onUploadRight(file);
                            e.target.value = "";
                          }}
                        />
                      </>
                    )}
                  </div>
                </div>



                {isStageFileStage ? (
                  <div className="flex-1 min-h-0 overflow-auto">
                    {previewStageUrl ? (
                      <img
                        src={previewStageUrl}
                        alt={previewStageName || "preview"}
                        className="w-full rounded-md border border-slate-200"
                      />
                    ) : hasRightFile && rightMeta?.s3Url ? (
                      <img
                        src={rightMeta.s3Url}
                        alt={fileLabel}
                        className="w-full rounded-md border border-slate-200"
                      />
                    ) : (
                      <div className="h-full min-h-[300px] flex items-center justify-center text-xs text-slate-500 border rounded-md">
                        여기로 파일을 드롭하거나 U를 눌러 업로드하세요.
                      </div>
                    )}
                  </div>
                ) : isCamStage ? (
                  <textarea
                    className="w-full flex-1 min-h-0 rounded-md border border-slate-200 p-3 font-mono text-xs text-slate-700 resize-none overflow-auto"
                    value={previewNcText}
                    readOnly
                  />
                ) : rightViewer ? (
                  <div className="flex-1 min-h-0 rounded-md border border-slate-200 overflow-hidden">
                    <StlPreviewViewer
                      file={rightViewer}
                      requestId={requestId}
                      metadata={viewerStlMetadata}
                      showOverlay={true}
                      finishLinePoints={finishLinePoints}
                      enableManualPick={
                        (canGuideFinishLine && guidedFinishLineMode) ||
                        (canGuideFrontPoint && guidedFrontPointMode)
                      }
                      manualPickPoints={
                        guidedFinishLineMode
                          ? guidedFinishLinePoints
                          : guidedFrontPointMode && guidedFrontPointPick
                            ? [guidedFrontPointPick]
                            : null
                      }
                      onSurfacePointDoubleClick={
                        guidedFrontPointMode
                          ? handleSetGuidedFrontPoint
                          : handleAddGuidedFinishLinePoint
                      }
                      onManualUndo={
                        guidedFrontPointMode
                          ? handleUndoGuidedFrontPoint
                          : handleUndoGuidedFinishLinePoint
                      }
                    />
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-xs text-slate-500">
                    파일 없음
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <ConfirmDialog
          open={deleteGeneratedConfirmOpen}
          title="생성 파일 삭제"
          description={
            isCamStage
              ? "정말 삭제할까요? 생성된 NC 파일이 삭제됩니다."
              : "정말 삭제할까요? 생성된 filled STL 파일이 삭제됩니다."
          }
          confirmLabel="삭제"
          cancelLabel="취소"
          onCancel={() => setDeleteGeneratedConfirmOpen(false)}
          onConfirm={async () => {
            setDeleteGeneratedConfirmOpen(false);
            onDeleteGeneratedOutput();
          }}
        />
      </DialogContent>
    </Dialog>
  );
};

export default PreviewModal;
