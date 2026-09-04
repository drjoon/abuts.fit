// change-log:
// - 2026-09-04: 포스트면 체크 — 미리보기는 항상 토글, 저장만 준비 단계.
// - 2026-09-04: 포스트면 각인 옵트인 체크(준비만). 기본 헥스면. Lot=오버레이 표시.
// - 2026-09-04: Wide Split 왼쪽 Lot 체크박스(기본 off) — on 시 STL 헥스 면 각인 3글자 오버레이.
// - 2026-09-03: 세척.패킹 → 승인은 각인 이미지가 있을 때만 가능. 프리뷰 업로드 후 승인 실패 시 토스트.
// - 2026-09-03: toManufacturerHexRotationLabel import 누락으로 PreviewModal 크래시 수정.
// - 2026-08-29: NC 재생성 성공 시 큐 NC 즉시 제거 이벤트 발행(Next Up「CAM 생성 중」).
// - 2026-08-29: 프리뷰 요약에 실제 출고일시(shippedAt) 전달(있으면 출고예정일보다 우선).
// - 2026-08-25: 추적관리 프리뷰 오른쪽을 NC코드/각인이미지 탭 뷰어로 변경(앞에서 생성한 파일 확인).
// - 2026-08-25: 관리자 헥스 확정 시 PreviewModal 헥스 Select 비활성(제조사 변경 불가).
// - 2026-08-23: Dialog 기본 닫기(X) 표시. 승인 처리 중에는 닫기·오버레이 닫기 차단.
// - 2026-08-23: Dialog sm:max-w-lg 잔존으로 PC가 ~512px 모바일처럼 보이던 문제 수정. 세로 스택·가로 2열 STL UX.
// - 2026-08-23: 가공 큐에서도 관리자 헥스 확정 시 PreviewModal 뱃지「확정」표시(full request 보강).
// - 2026-08-22: ExoCAD 헥스 회전 옆 관리자 확인 뱃지(확정/미정).
// - 2026-08-18: 준비 단계 프리뷰에도 로트번호를 표시한다.
// - 2026-08-18: filled STL/NC 재생성 요청 시 pending 표시 + 로컬 캐시 선삭제.
// - 2026-08-17: 세척.패킹 롤백 시 우편함 유지 안내 토스트.
// - 2026-08-13: 가공중(Now Playing)에는 NC 코드 에디터·NC 재생성 비활성화.
// - 2026-08-12: 상단 요약(환자/임플란트/생산) 문구가 열 너비를 넘으면 다음 줄로 넘김.
// - 2026-08-11: FP 저장 후 "NC 코드 재생성할까요?" 컨펌 → 확인 시 Esprit NC 재생성.
// - 2026-08-11: FP 저장은 DB 메타만 갱신(STL 재로드/forceRefresh 제거). realtime도 manual-front-point 스킵.
// - 2026-08-11: 가공 왼쪽 filled 편집 뷰어에 forceFilled(준비 오른쪽과 동일 가이드/오버레이).
// - 2026-08-11: 가공 프리뷰=왼쪽 filled STL 편집(FL/FP)·오른쪽 NC 코드(준비 오른쪽↔가공 왼쪽).
// - 2026-08-11: 프리뷰 모달 가로폭 확대(max-w-5xl→1680)로 헤더·요약 2줄 줄바꿈 완화.
// - 2026-08-11: 가공(isCamStage) 오른쪽을 NC textarea 대신 준비와 동일 filled STL+FL/FP/재생성/X로 표시(</>로 NC 유지).
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
// - web/frontend/src/features/requests/components/StlPreviewViewer.tsx
// - web/frontend/src/features/requests/utils/lotEngraving.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestInfoSummary.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/MachiningQueueBoard.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/hooks/useMachiningBoard.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/hooks/usePreviewLoader.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/hooks/useRequestFileHandlers.ts
// - web/frontend/src/shared/shipping/ShippingModeBadge.tsx
// - web/backend/controllers/requests/common.requests.controller.js
// - web/backend/modules/requests/request.routes.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/regenerationPending.ts
// - web/backend/controllers/rhino/rhino.controller.js
// - web/backend/modules/rhino/rhino.routes.js
import { useCallback, useEffect, useRef, useState } from "react";
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
import { lotSerialFromLotNumberValue } from "@/features/requests/utils/lotEngraving";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import { generateModelNumber } from "@/utils/modelNumber";
import { deleteCncProgramCache, invalidateRequestPreviewCaches } from "@/shared/files/fileBlobCache";
import {
  markFilledStlRegenerationPending,
  markNcRegenerationPending,
} from "../utils/regenerationPending";
import {
  type ManufacturerRequest,
  type ReviewStageKey,
  getDeadlineInfo,
  getReviewStageKeyByTab,
  resolveFilledStlFile,
  resolvePracticeDirectShippingContact,
} from "../utils/request";
import { resolveImplantConnectionSpec } from "@/utils/implantConnectionSpec";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { RequestInfoSummary } from "./RequestInfoSummary";
import { ShippingModeBadge } from "@/shared/shipping/ShippingModeBadge";
import { resolveShippingMode } from "@/shared/shipping/shippingMode";
import {
  normalizeManufacturerHexRotationMode,
  persistPrepApprovalSettings,
  resolveDefaultPrepHexRotationMode,
  resolveHexVerificationBadgeLabel,
  toManufacturerHexRotationLabel,
  type ManufacturerHexRotationDraftMode,
  type ManufacturerHexRotationMode,
} from "@/pages/manufacturer/worksheet/custom_abutment/utils/hexRotation";
import { cn } from "@/shared/ui/cn";
import { RESPONSIVE } from "@/shared/ui/responsive";

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

const isRequestMachiningInProgress = (req?: ManufacturerRequest | null) => {
  if (!req) return false;
  const rec =
    (req as any)?.productionSchedule?.machiningRecord ||
    (req as any)?.machiningRecord ||
    null;
  if (rec && typeof rec === "object") {
    const status = String(rec.status || "")
      .trim()
      .toUpperCase();
    if (status === "RUNNING" || status === "PROCESSING") return true;
    const startedAt = rec.startedAt ? new Date(rec.startedAt).getTime() : 0;
    const completedAt = rec.completedAt
      ? new Date(rec.completedAt).getTime()
      : 0;
    if (startedAt > 0 && completedAt <= 0) return true;
  }
  const phase = String(
    (req as any)?.productionSchedule?.machiningProgress?.phase || "",
  )
    .trim()
    .toUpperCase();
  if (phase === "RUNNING" || phase === "PROCESSING" || phase === "MACHINING") {
    return true;
  }
  return String((req as any)?.realtimeProgress?.badge || "").trim() === "가공중";
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
  /** 가공 큐 Now Playing 등 실시간 가공중 여부. 없으면 request 레코드로 판정. */
  isMachiningInProgress?: boolean;
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
  onSaveWideSplitEnabledOverride?: (
    req: ManufacturerRequest,
    value: boolean,
  ) => Promise<void>;
  onSaveLotEngravingTargetOverride?: (
    req: ManufacturerRequest,
    value: "hex" | "post",
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
  isMachiningInProgress = false,
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
  onSaveWideSplitEnabledOverride,
  onSaveLotEngravingTargetOverride,
  onOpenNextRequest,
  setSearchParams,
}: PreviewModalProps) => {

  const { token } = useAuthStore();
  const { toast } = useToast();
  const [regenerating, setRegenerating] = useState(false);
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
  const [deleteConfirmKind, setDeleteConfirmKind] = useState<
    null | "filled" | "nc"
  >(null);
  const [ncRegenConfirmOpen, setNcRegenConfirmOpen] = useState(false);
  const [trackingRightTab, setTrackingRightTab] = useState<"nc" | "engraving">(
    "nc",
  );
  const [manufacturerHexRotationDraft, setManufacturerHexRotationDraft] =
    useState<ManufacturerHexRotationDraftMode>("");
  const [anodizingEnabledDraft, setAnodizingEnabledDraft] = useState<boolean>(true);
  const [wideSplitEnabledDraft, setWideSplitEnabledDraft] = useState<boolean>(true);
  const [wideSplitSaving, setWideSplitSaving] = useState(false);
  const [lotEngravingTargetDraft, setLotEngravingTargetDraft] = useState<
    "hex" | "post"
  >("hex");
  const [lotEngravingTargetSaving, setLotEngravingTargetSaving] =
    useState(false);
  const [showLotEngraving, setShowLotEngraving] = useState(true);
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

      // 메타데이터만 먼저 오는 register-stl-metadata는 filled STL(stlFile) 전에 full STL reload 하면
      // 이후 filled 갱신을 레이스로 덮어쓸 수 있다. filled 준비 전에는 스킵(useStlMetadata가 수치 반영).
      // FP/FL 수동 저장도 DB 메타만 바뀌므로 STL 재로드하지 않는다(useStlMetadata가 오버레이 갱신).
      if (evtType === "request:stl-metadata-updated") {
        const source = String(rawPayload.source || "").trim();
        if (
          source === "manual-front-point" ||
          source === "manual-finish-line"
        ) {
          return false;
        }
        if (source === "register-stl-metadata") {
          const eventReq = rawPayload.request as
            | {
                caseInfos?: {
                  stlFile?: { s3Key?: unknown };
                  camFile?: { s3Key?: unknown };
                };
              }
            | undefined;
          const hasCam = Boolean(
            String(resolveFilledStlFile(eventReq?.caseInfos)?.s3Key || "").trim(),
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
      setDeleteConfirmKind(null);
      setNcRegenConfirmOpen(false);
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

    const caseWideSplit = (req as any)?.caseInfos?.wideSplitEnabled;
    if (typeof caseWideSplit === "boolean") {
      setWideSplitEnabledDraft(caseWideSplit);
    } else {
      setWideSplitEnabledDraft(true);
    }

    const caseLotTarget = (req as any)?.caseInfos?.lotEngravingTarget;
    setLotEngravingTargetDraft(caseLotTarget === "post" ? "post" : "hex");
    setShowLotEngraving(false);

    // 헥스 회전 SSOT: caseInfos.hexRotation.mode
    // 1) 저장된 mode
    // 2) 준비·CAM 단계(미저장): designSoftware 정책 > requestorHexRotation
    // 3) 가공 이후(미저장 스냅샷): legacy finalHexRotation/requestorHexRotation
    const savedHexRotationMode = normalizeManufacturerHexRotationMode(
      (req as any)?.caseInfos?.hexRotation?.mode,
    );

    const savedManufacturerHexMode =
      savedHexRotationMode ||
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
      nextHexRotationDraft =
        resolveDefaultPrepHexRotationMode(req as any) || "";
    } else {
      nextHexRotationDraft =
        normalizeManufacturerHexRotationMode(
          (req as any)?.caseInfos?.finalHexRotation,
        ) ||
        normalizeManufacturerHexRotationMode(
          (req as any)?.caseInfos?.requestorHexRotation,
        ) ||
        resolveDefaultPrepHexRotationMode(req as any) ||
        "";
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
  const isNcActionLocked =
    isMachiningInProgress || isRequestMachiningInProgress(activeReq);

  useEffect(() => {
    if (isNcActionLocked) {
      setNcRegenConfirmOpen(false);
    }
  }, [isNcActionLocked]);

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

  useEffect(() => {
    if (!open) return;
    const reviewStageKey = getReviewStageKeyByTab({
      stage,
      isCamStage,
      isMachiningStage,
    });
    if (reviewStageKey !== "tracking") return;
    setTrackingRightTab("nc");
  }, [open, stage, isCamStage, isMachiningStage, activeReq?._id]);

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
  const isTrackingStage = currentReviewStageKey === "tracking";
  const isImageStage =
    currentReviewStageKey === "packing" ||
    currentReviewStageKey === "shipping" ||
    currentReviewStageKey === "tracking";
  // 포장.발송·추적관리: 각인 이미지는 세척.패킹(packing)에 저장된다.
  const imageStageKey =
    currentReviewStageKey === "shipping" ||
    currentReviewStageKey === "tracking"
      ? "packing"
      : currentReviewStageKey;

  const canApprove = (() => {
    if (isStageFileStage) {
      const key = currentReviewStageKey as
        | "machining"
        | "packing"
        | "shipping"
        | "tracking";
      // 가공: 파일 유무와 무관하게 승인 가능
      if (key === "machining") {
        return true;
      }
      // 세척.패킹: 각인 이미지가 있으면 → 로 포장.발송 이동(AI 인식과 무관)
      if (key === "packing") {
        return (
          !!activeReq?.caseInfos?.stageFiles?.packing?.s3Key ||
          !!activeReq?.caseInfos?.stageFiles?.packing?.s3Url ||
          !!activeReq?.caseInfos?.stageFiles?.packing?.filePath ||
          !!previewStageUrl
        );
      }
      return (
        !!activeReq?.caseInfos?.stageFiles?.[key]?.s3Key || !!previewStageUrl
      );
    }
    if (isCamStage) {
      // NC가 없어도 승인 버튼으로 재생성 명령을 먼저 수행할 수 있게 허용한다.
      return true;
    }
    // request(준비) 단계도 CAM 파일 유무와 무관하게 승인 가능하며,
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
  const filledStlMeta = resolveFilledStlFile(activeReq?.caseInfos);
  const camName = filledStlMeta?.s3Key
    ? filledStlMeta?.filePath ||
      filledStlMeta?.originalName ||
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

  const filledViewer =
    previewFiles.cam || (isCamStage ? previewFiles.original : null) || null;

  const leftTitle = isNcStage
    ? ncName
    : isCamStage
      ? filledViewer?.name || camName
      : isImageStage
        ? camName
        : originalName;
  const rightTitle = isTrackingStage
    ? trackingRightTab === "nc"
      ? ncName
      : "각인 이미지"
    : isStageFileStage
      ? currentReviewStageKey === "machining"
        ? "로트번호 이미지"
        : "각인 이미지"
      : isCamStage
        ? ncName
        : camName;

  const leftViewer = isCamStage
    ? filledViewer
    : isImageStage
      ? previewFiles.cam || previewFiles.original || null
      : !isStageFileStage
        ? previewFiles.original
        : null;

  // 준비: 오른쪽 filled 편집. 가공: 왼쪽 filled 편집 + 오른쪽 NC.
  const rightViewer =
    !isCamStage && !isStageFileStage ? previewFiles.cam : null;
  const guideViewerFile = isCamStage ? filledViewer : rightViewer;

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
          } catch (err: any) {
            toast({
              title: "포장.발송 이동 실패",
              description:
                err?.message ||
                "각인 이미지는 저장되었습니다. → 로 다시 승인해 주세요.",
              variant: "destructive",
            });
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
      : resolveFilledStlFile(activeReq?.caseInfos);
  const hasRightFile = !!rightMeta?.s3Key;
  const hasCamFile = !!resolveFilledStlFile(activeReq?.caseInfos)?.s3Key;
  const hasNcFile = !!activeReq?.caseInfos?.ncFile?.s3Key;

  const canGuideFinishLine =
    !!token &&
    !isStageFileStage &&
    !!guideViewerFile &&
    !!activeReq?.requestId;

  const canGuideFrontPoint = canGuideFinishLine;

  const guidedFinishLineFilePath = String(
    resolveFilledStlFile(activeReq?.caseInfos)?.filePath ||
      resolveFilledStlFile(activeReq?.caseInfos)?.originalName ||
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
      markFilledStlRegenerationPending(activeReq?.requestId);
      await invalidateRequestPreviewCaches({
        camS3Key: resolveFilledStlFile(activeReq?.caseInfos)?.s3Key,
        ncS3Key: activeReq?.caseInfos?.ncFile?.s3Key,
        requestMongoId: String(activeReq?._id || "").trim(),
        requestId: String(activeReq?.requestId || "").trim(),
      });

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
    if (isTrackingStage) {
      if (trackingRightTab === "nc") {
        if (!hasNcFile) return;
        void onDownloadNcFile(activeReq);
        return;
      }
      if (!hasRightFile) return;
      void onDownloadStageFile(activeReq, imageStageKey);
      return;
    }
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

  const canDeleteFilledOutput =
    canRegenerateFilledStl && !isStageFileStage && hasCamFile;
  const canDeleteNcOutput = isCamStage && hasNcFile;

  const onDeleteFilledOutput = () => {
    if (!canDeleteFilledOutput || isUploading) return;
    void onDeleteCam(activeReq, { navigate: false });
  };

  const onDeleteNcOutput = () => {
    if (!canDeleteNcOutput || isUploading) return;
    void onDeleteNc(activeReq, { nextStage: "cam", navigate: false });
  };

  const onRegenerateNc = async () => {
    if (isNcActionLocked) {
      toast({
        title: "가공 중",
        description: "가공 중에는 NC 코드를 재생성할 수 없습니다.",
      });
      return;
    }
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

    setRegenerating(true);
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

      const controller = new AbortController();
      const timeoutRef = window.setTimeout(() => controller.abort(), 20000);
      let res: Response;
      try {
        res = await fetch(
          `/api/requests/by-request/${encodeURIComponent(requestId)}/nc-file/regenerate-2phase`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
            signal: controller.signal,
          },
        );
      } finally {
        window.clearTimeout(timeoutRef);
      }
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) {
        toast({
          title: "NC 재생성 실패",
          description:
            body?.message ||
            body?.error ||
            body?.detail ||
            "NC 재생성 요청에 실패했습니다.",
          variant: "destructive",
        });
        return;
      }

      const s3Key = activeReq?.caseInfos?.ncFile?.s3Key;
      if (s3Key) {
        await deleteCncProgramCache(s3Key);
      }
      markNcRegenerationPending(requestId);
      // 소켓 수신 전에도 Next Up「CAM 생성 중」이 보이도록 큐 NC 제거를 즉시 요청
      window.dispatchEvent(
        new CustomEvent("nc-regeneration-started", {
          detail: {
            requestId,
            requestMongoId: String(activeReq?._id || "").trim(),
            ncCleared: true,
          },
        }),
      );

      toast({
        title: "NC 재생성 요청",
        description: "기존 NC를 삭제하고 Esprit NC 재생성을 시작했습니다.",
      });
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
      setRegenerating(false);
    }
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

      // STL 재로드하지 않는다. frontPoint는 DB/메타만 갱신하고 오버레이·마커는 로컬 override로 유지.
      // request:stl-metadata-updated(manual-front-point)는 useStlMetadata가 수치만 반영한다.
      toast({
        title: "저장 완료",
        description: "Front Point를 저장했습니다.",
      });
      if (!isNcActionLocked) {
        setNcRegenConfirmOpen(true);
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
    if (
      !onSaveManufacturerHexRotation ||
      hexRotationSaving ||
      approveBusy ||
      resolveHexVerificationBadgeLabel(activeReq) === "확정"
    ) {
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

  const handleToggleWideSplitEnabled = async (checked: boolean) => {
    const prepStages = new Set(["준비", "의뢰", "CAM", "request", "cam"]);
    const mfgStage = String(activeReq?.manufacturerStage || "").trim();
    if (
      !onSaveWideSplitEnabledOverride ||
      wideSplitSaving ||
      approveBusy ||
      !(currentReviewStageKey === "request" || currentReviewStageKey === "cam") ||
      !prepStages.has(mfgStage)
    ) {
      return;
    }

    const prev = wideSplitEnabledDraft;
    setWideSplitEnabledDraft(checked);
    setWideSplitSaving(true);
    try {
      await onSaveWideSplitEnabledOverride(activeReq, checked);
    } catch (error) {
      setWideSplitEnabledDraft(prev);
      toast({
        title: "Wide Split 저장 실패",
        description:
          error instanceof Error
            ? error.message
            : "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setWideSplitSaving(false);
    }
  };

  const handleToggleLotEngravingOnPost = async (checked: boolean) => {
    if (lotEngravingTargetSaving || approveBusy) return;

    const next: "hex" | "post" = checked ? "post" : "hex";
    const prev = lotEngravingTargetDraft;
    // STL 미리보기는 단계와 무관하게 즉시 반영
    setLotEngravingTargetDraft(next);

    const prepStages = new Set(["준비", "의뢰", "CAM", "request", "cam"]);
    const mfgStage = String(activeReq?.manufacturerStage || "").trim();
    const canPersist =
      Boolean(onSaveLotEngravingTargetOverride) &&
      (currentReviewStageKey === "request" ||
        currentReviewStageKey === "cam") &&
      prepStages.has(mfgStage);
    if (!canPersist || !onSaveLotEngravingTargetOverride) return;

    setLotEngravingTargetSaving(true);
    try {
      await onSaveLotEngravingTargetOverride(activeReq, next);
    } catch (error) {
      setLotEngravingTargetDraft(prev);
      toast({
        title: "각인 위치 저장 실패",
        description:
          error instanceof Error
            ? error.message
            : "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setLotEngravingTargetSaving(false);
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
  const fullLotLabel = String(activeReq?.lotNumber?.value || "").trim();
  const lotSerialCode = lotSerialFromLotNumberValue(fullLotLabel);
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
  const hexVerificationBadgeLabel =
    resolveHexVerificationBadgeLabel(activeReq);
  const hexAdminLocked = hexVerificationBadgeLabel === "확정";
  const currentCaseAnodizing = (activeReq as any)?.caseInfos?.anodizingEnabled;
  const currentBusinessDefaultAnodizing =
    (activeReq as any)?.business?.requestSettings?.anodizingEnabled;
  const isAnodizingFromBusinessDefault =
    typeof currentCaseAnodizing !== "boolean" &&
    typeof currentBusinessDefaultAnodizing === "boolean";
  const prepManufacturerStages = new Set([
    "준비",
    "의뢰",
    "CAM",
    "request",
    "cam",
  ]);
  const manufacturerStageLabel = String(activeReq?.manufacturerStage || "").trim();
  const canOverrideAnodizing =
    currentReviewStageKey === "request" || currentReviewStageKey === "cam";
  const canOverrideWideSplit =
    canOverrideAnodizing && prepManufacturerStages.has(manufacturerStageLabel);
  const canPersistLotEngravingTarget = canOverrideWideSplit;
  // STL 미리보기용 포스트면 토글은 단계와 무관 (저장만 준비 단계)
  const canToggleLotEngravingTarget =
    Boolean(lotSerialCode) && !approveBusy && !lotEngravingTargetSaving;

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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // 승인/롤백 처리 중에는 우상단 X·Esc·오버레이로 닫지 않는다.
        if (!next && approveBusy) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className={cn(
          // Dialog 기본 sm:max-w-lg를 반드시 sm: 접두로 덮어쓴다(미지정 시 PC도 ~512px).
          RESPONSIVE.dialogContentPreview,
          // 우상단 기본 닫기(X)와 헤더 컨트롤이 겹치지 않도록 여유.
          "flex flex-col overflow-hidden gap-3 p-3 pr-10 sm:gap-4 sm:p-6 sm:pr-12",
          shouldShowUnmachinableWarning || isUnmachinable
            ? "border-accent-muted ring-2 ring-accent-muted/80"
            : "",
        )}
      >
        <DialogTitle className="sr-only">의뢰 미리보기</DialogTitle>
        <DialogDescription className="sr-only">
          의뢰 파일과 NC 내용을 확인하는 영역입니다.
        </DialogDescription>

        <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden sm:gap-4">
          <div className="flex min-w-0 flex-col gap-2 overflow-x-auto rounded-lg border border-slate-200/80 bg-slate-50/70 px-2 py-2 shrink-0 max-md:landscape:py-1.5 sm:px-3 md:flex-row md:flex-nowrap md:items-center md:justify-between md:gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2 md:flex-nowrap">
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
                <div className="flex flex-nowrap items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className="text-[11px] px-2 py-0.5 font-semibold bg-primary-soft text-primary-strong border-primary-muted whitespace-nowrap"
                  >
                    {fullLotLabel}
                  </Badge>
                  {generateModelNumber(activeReq?.caseInfos) && (
                    <Badge
                      variant="outline"
                      className="text-[11px] px-2 py-0.5 font-semibold leading-[1.1] border border-slate-200 bg-slate-50 text-slate-600 whitespace-nowrap"
                    >
                      {generateModelNumber(activeReq?.caseInfos)}
                    </Badge>
                  )}
                  {shouldShowUnmachinableBadge && (
                    <Badge
                      variant="outline"
                      className={`text-[11px] px-2 py-0.5 font-semibold leading-[1.1] border whitespace-nowrap ${
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
                      className="text-[11px] px-2 py-0.5 font-semibold leading-[1.1] border border-primary-muted bg-primary-soft text-primary-strong whitespace-nowrap"
                      title={requestorContinueMessage || "의뢰자가 계속 가공 진행을 요청했습니다."}
                    >
                      불완전가공 진행
                    </Badge>
                  )}
                </div>
              ) : isUnmachinable || showLatestContinueBadge ? (
                <div className="flex flex-nowrap items-center gap-1.5">
                  {shouldShowUnmachinableBadge && (
                    <Badge
                      variant="outline"
                      className={`text-[11px] px-2 py-0.5 font-semibold leading-[1.1] border whitespace-nowrap ${
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
                      className="text-[11px] px-2 py-0.5 font-semibold leading-[1.1] border border-primary-muted bg-primary-soft text-primary-strong whitespace-nowrap"
                      title={requestorContinueMessage || "의뢰자가 계속 가공 진행을 요청했습니다."}
                    >
                      불완전가공 진행
                    </Badge>
                  )}
                </div>
              ) : null}


            </div>

            <div className="flex w-full shrink-0 flex-wrap items-center gap-2 md:w-auto md:flex-nowrap">
              <label
                className={`inline-flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-[11px] font-semibold ${
                  lotSerialCode && !approveBusy
                    ? "border-slate-200 bg-white text-slate-700"
                    : "border-slate-200 bg-slate-100 text-slate-400"
                }`}
                title={
                  lotSerialCode
                    ? lotEngravingTargetDraft === "post"
                      ? `포스트 측면에 각인코드 ${lotSerialCode} 미리보기 (FL+1mm · C축)`
                      : `헥스면에 각인코드 ${lotSerialCode} 미리보기`
                    : "로트번호(각인 3글자)가 없습니다"
                }
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300"
                  checked={Boolean(showLotEngraving)}
                  disabled={!lotSerialCode || approveBusy}
                  onChange={(e) => {
                    setShowLotEngraving(Boolean(e.target.checked));
                  }}
                />
                <span className="whitespace-nowrap">Lot</span>
                <span className="text-[10px] font-semibold text-slate-500">
                  {showLotEngraving ? "O" : "X"}
                </span>
              </label>
              <label
                className={`inline-flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-[11px] font-semibold ${
                  canToggleLotEngravingTarget
                    ? "border-slate-200 bg-white text-slate-700"
                    : "border-slate-200 bg-slate-100 text-slate-400"
                }`}
                title={
                  canPersistLotEngravingTarget
                    ? "기본=헥스면. 체크 시 포스트 측면(FL+1mm·C축). 둘 중 하나만 가공."
                    : "미리보기만 전환됩니다. 저장(가공 반영)은 준비 단계에서만 가능합니다."
                }
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300"
                  checked={lotEngravingTargetDraft === "post"}
                  disabled={!canToggleLotEngravingTarget}
                  onChange={(e) => {
                    void handleToggleLotEngravingOnPost(
                      Boolean(e.target.checked),
                    );
                  }}
                />
                <span className="whitespace-nowrap">포스트면</span>
                <span className="text-[10px] font-semibold text-slate-500">
                  {lotEngravingTargetDraft === "post" ? "O" : "X"}
                </span>
              </label>
              <label
                className={`inline-flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-[11px] font-semibold ${
                  canOverrideWideSplit && !approveBusy && !wideSplitSaving
                    ? "border-slate-200 bg-white text-slate-700"
                    : "border-slate-200 bg-slate-100 text-slate-400"
                }`}
                title="Splitline_2>5mm일 때 Front/Middle 분할 가공. 준비 단계에서만 변경 가능."
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300"
                  checked={Boolean(wideSplitEnabledDraft)}
                  disabled={
                    !canOverrideWideSplit ||
                    approveBusy ||
                    wideSplitSaving ||
                    !onSaveWideSplitEnabledOverride
                  }
                  onChange={(e) => {
                    void handleToggleWideSplitEnabled(Boolean(e.target.checked));
                  }}
                />
                <span className="whitespace-nowrap">Wide Split</span>
                <span className="text-[10px] font-semibold text-slate-500">
                  {wideSplitEnabledDraft ? "O" : "X"}
                </span>
              </label>
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
                <span className="whitespace-nowrap text-[11px] font-semibold text-slate-500">
                  헥스 회전
                </span>
                {hexVerificationBadgeLabel ? (
                  <Badge
                    variant="outline"
                    className={
                      hexVerificationBadgeLabel === "확정"
                        ? "h-4 border-emerald-200 bg-emerald-50 px-1 text-[10px] font-semibold leading-none text-emerald-700"
                        : "h-4 border-amber-200 bg-amber-50 px-1 text-[10px] font-semibold leading-none text-amber-700"
                    }
                  >
                    {hexVerificationBadgeLabel}
                  </Badge>
                ) : null}
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
                    !isRequestStage ||
                    hexAdminLocked
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
                    <SelectItem value="STL모델+" className="text-[12px] font-medium">
                      STL모델+
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
                          stageKey === "packing" &&
                          String(activeReq?.mailboxAddress || "").trim()
                            ? `가공 단계로 되돌리는 중입니다. 우편함 ${String(activeReq.mailboxAddress).trim()}은 유지됩니다.`
                            : stageKey === "machining" || stageKey === "cam"
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
                      // 준비 단계 승인(준비→가공) 전: 헥스/아노다이징을 카드 승인과 동일한 SSOT로 선저장.
                      if (currentReviewStageKey === "request") {
                        const persisted = await persistPrepApprovalSettings({
                          req: activeReq,
                          hexDraft: manufacturerHexRotationDraft,
                          saveHex: onSaveManufacturerHexRotation,
                          saveAnodizing: onSaveAnodizingEnabledOverride,
                          saveWideSplit: onSaveWideSplitEnabledOverride,
                        });
                        if (!persisted.ok) {
                          toast({
                            title: persisted.title,
                            description: persisted.description,
                            variant: "destructive",
                          });
                          return;
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
                  } catch (err: any) {
                    console.error("Review status update failed:", err);
                    toast({
                      title: "승인 실패",
                      description:
                        err?.message ||
                        "승인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
                      variant: "destructive",
                    });
                  }
                }}
                aria-label="다음 공정"
                title={
                  isNcGenerating
                    ? "NC 재생성 완료를 기다리는 중입니다"
                    : currentReviewStageKey === "packing" && !canApprove
                      ? "각인 이미지를 업로드한 뒤 포장.발송으로 이동할 수 있습니다"
                      : currentReviewStageKey === "packing"
                        ? "포장.발송으로 이동"
                        : "다음 공정"
                }
              >
                →
              </button>
            </div>
          </div>

          <RequestInfoSummary
            className="shrink-0 max-md:landscape:max-h-[28vh] max-md:landscape:overflow-y-auto"
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
            shippedAt={
              activeReq?.deliveryInfoRef &&
              typeof activeReq.deliveryInfoRef === "object"
                ? ((activeReq.deliveryInfoRef as { shippedAt?: string | Date | null })
                    .shippedAt ?? null)
                : null
            }
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
            shippingContact={resolvePracticeDirectShippingContact(
              activeReq as ManufacturerRequest | null,
            )}
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
            <div className="grid flex-1 min-h-0 grid-cols-1 gap-3 overflow-y-auto max-md:landscape:grid-cols-2 max-md:landscape:gap-2 max-md:landscape:overflow-hidden md:grid-cols-2 md:gap-4 md:overflow-hidden">
              <div className="border rounded-lg p-2.5 sm:p-3 space-y-2 flex flex-col overflow-hidden min-h-[min(48vh,420px)] max-md:landscape:min-h-0 md:min-h-0">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-sm font-semibold text-primary-strong hover:underline text-left truncate"
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
                  {isCamStage && (
                    <div className="flex items-center gap-2">
                      <TooltipProvider>
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
                      {canRegenerateFilledStl && (
                        <>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className={`inline-flex items-center justify-center h-8 w-8 rounded-md border text-[13px] font-medium transition ${
                                    regenerating || isUploading || hexRotationSaving
                                      ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                                      : "border-primary-muted bg-primary-soft text-primary-strong hover:bg-primary-soft"
                                  }`}
                                  disabled={
                                    regenerating || isUploading || hexRotationSaving
                                  }
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void onRegenerate();
                                  }}
                                  aria-label="filled.stl 재생성"
                                >
                                  <RefreshCw
                                    className={`h-4 w-4 ${regenerating ? "animate-spin" : ""}`}
                                  />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom">
                                filled.stl 재생성
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <button
                            type="button"
                            className={`inline-flex items-center justify-center h-8 w-8 rounded-md border text-[13px] font-medium transition ${
                              !canDeleteFilledOutput ||
                              isUploading ||
                              regenerating ||
                              hexRotationSaving
                                ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                                : "border-slate-200 bg-white text-slate-700 hover:bg-destructive-soft hover:border-destructive-muted hover:text-destructive"
                            }`}
                            disabled={
                              !canDeleteFilledOutput ||
                              isUploading ||
                              regenerating ||
                              hexRotationSaving
                            }
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!canDeleteFilledOutput) return;
                              setDeleteConfirmKind("filled");
                            }}
                            aria-label="생성된 filled STL 삭제"
                            title="생성된 filled STL 삭제"
                          >
                            X
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {isNcStage ? (
                  <textarea
                    className="w-full flex-1 min-h-0 rounded-md border border-slate-200 p-3 font-mono text-xs text-slate-700 resize-none overflow-auto"
                    value={previewNcText}
                    readOnly
                  />
                ) : isCamStage && leftViewer ? (
                  <div className="flex-1 min-h-0 rounded-md border border-slate-200 overflow-hidden">
                    <StlPreviewViewer
                      file={leftViewer}
                      requestId={requestId}
                      metadata={viewerStlMetadata}
                      showOverlay={true}
                      forceFilled
                      showLotEngraving={showLotEngraving}
                      lotSerialCode={lotSerialCode}
                      lotEngravingNcText={previewNcText}
                      lotEngravingHexMode={manufacturerHexRotationDraft}
                      lotEngravingTarget={lotEngravingTargetDraft}
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
                ) : leftViewer ? (
                  <div className="flex-1 min-h-0 rounded-md border border-slate-200 overflow-hidden">
                    <StlPreviewViewer
                      file={leftViewer}
                      requestId={requestId}
                      metadata={stlMetadata}
                      showOverlay={true}
                      showLotEngraving={showLotEngraving}
                      lotSerialCode={lotSerialCode}
                      lotEngravingNcText={previewNcText}
                      lotEngravingHexMode={manufacturerHexRotationDraft}
                      lotEngravingTarget={lotEngravingTargetDraft}
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
                className="border rounded-lg p-2.5 sm:p-3 space-y-2 flex flex-col overflow-hidden min-h-[min(48vh,420px)] max-md:landscape:min-h-0 md:min-h-0"
                onDragOver={(e) => {
                  if (!isStageFileStage || isTrackingStage || isUploading) return;
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  if (!isStageFileStage || isTrackingStage || isUploading) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const file = e.dataTransfer.files?.[0];
                  if (!file) return;
                  onUploadRight(file);
                }}
              >
                <div className="flex items-center justify-between gap-2 min-w-0">
                  {isTrackingStage ? (
                    <div className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 min-w-0">
                      <button
                        type="button"
                        className={cn(
                          "h-7 rounded px-2.5 text-[12px] font-semibold transition",
                          trackingRightTab === "nc"
                            ? "bg-white text-primary-strong shadow-sm"
                            : "text-slate-600 hover:text-slate-800",
                        )}
                        onClick={() => setTrackingRightTab("nc")}
                      >
                        NC코드
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "h-7 rounded px-2.5 text-[12px] font-semibold transition",
                          trackingRightTab === "engraving"
                            ? "bg-white text-primary-strong shadow-sm"
                            : "text-slate-600 hover:text-slate-800",
                        )}
                        onClick={() => setTrackingRightTab("engraving")}
                      >
                        각인이미지
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-sm font-semibold text-primary-strong hover:underline text-left truncate"
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
                  )}
                  <div className="flex items-center gap-2">
                    {isTrackingStage ? (
                      <button
                        type="button"
                        className={cn(
                          "inline-flex items-center justify-center h-8 rounded-md border px-2 text-[12px] font-medium transition",
                          (trackingRightTab === "nc" ? hasNcFile : hasRightFile)
                            ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            : "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed",
                        )}
                        disabled={
                          trackingRightTab === "nc" ? !hasNcFile : !hasRightFile
                        }
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onDownload();
                        }}
                      >
                        다운로드
                      </button>
                    ) : (
                      <>
                        {!isCamStage && (
                          <TooltipProvider>
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
                        )}
                        {isCamStage && onOpenCodeEditor && (
                          <button
                            type="button"
                            className={`inline-flex items-center justify-center h-8 w-8 rounded-md border text-[12px] font-mono font-bold transition ${
                              isNcActionLocked
                                ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                            disabled={isNcActionLocked}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!activeReq || isNcActionLocked) return;
                              void onOpenCodeEditor(activeReq);
                            }}
                            aria-label="코드 에디터"
                            title={
                              isNcActionLocked
                                ? "가공 중에는 NC 코드를 수정할 수 없습니다."
                                : "코드 에디터"
                            }
                          >
                            {"</>"}
                          </button>
                        )}

                        {isCamStage ? (
                          <>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className={`inline-flex items-center justify-center h-8 w-8 rounded-md border text-[13px] font-medium transition ${
                                      isNcActionLocked ||
                                      regenerating ||
                                      isUploading ||
                                      hexRotationSaving
                                        ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                                        : "border-primary-muted bg-primary-soft text-primary-strong hover:bg-primary-soft"
                                    }`}
                                    disabled={
                                      isNcActionLocked ||
                                      regenerating ||
                                      isUploading ||
                                      hexRotationSaving
                                    }
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (isNcActionLocked) return;
                                      void onRegenerateNc();
                                    }}
                                    aria-label="NC 재생성"
                                  >
                                    <RefreshCw
                                      className={`h-4 w-4 ${regenerating ? "animate-spin" : ""}`}
                                    />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom">
                                  {isNcActionLocked
                                    ? "가공 중에는 NC 코드를 재생성할 수 없습니다."
                                    : "NC 재생성"}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <button
                              type="button"
                              className={`inline-flex items-center justify-center h-8 w-8 rounded-md border text-[13px] font-medium transition ${
                                !canDeleteNcOutput ||
                                isUploading ||
                                regenerating ||
                                hexRotationSaving
                                  ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                                  : "border-slate-200 bg-white text-slate-700 hover:bg-destructive-soft hover:border-destructive-muted hover:text-destructive"
                              }`}
                              disabled={
                                !canDeleteNcOutput ||
                                isUploading ||
                                regenerating ||
                                hexRotationSaving
                              }
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!canDeleteNcOutput) return;
                                setDeleteConfirmKind("nc");
                              }}
                              aria-label="생성된 NC 파일 삭제"
                              title="생성된 NC 파일 삭제"
                            >
                              X
                            </button>
                          </>
                        ) : (
                          canRegenerateFilledStl && (
                            <>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      className={`inline-flex items-center justify-center h-8 w-8 rounded-md border text-[13px] font-medium transition ${
                                        regenerating ||
                                        isUploading ||
                                        hexRotationSaving
                                          ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                                          : "border-primary-muted bg-primary-soft text-primary-strong hover:bg-primary-soft"
                                      }`}
                                      disabled={
                                        regenerating ||
                                        isUploading ||
                                        hexRotationSaving
                                      }
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        void onRegenerate();
                                      }}
                                      aria-label="filled.stl 재생성"
                                    >
                                      <RefreshCw
                                        className={`h-4 w-4 ${regenerating ? "animate-spin" : ""}`}
                                      />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom">
                                    filled.stl 재생성
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              <button
                                type="button"
                                className={`inline-flex items-center justify-center h-8 w-8 rounded-md border text-[13px] font-medium transition ${
                                  !canDeleteFilledOutput ||
                                  isUploading ||
                                  regenerating ||
                                  hexRotationSaving
                                    ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                                    : "border-slate-200 bg-white text-slate-700 hover:bg-destructive-soft hover:border-destructive-muted hover:text-destructive"
                                }`}
                                disabled={
                                  !canDeleteFilledOutput ||
                                  isUploading ||
                                  regenerating ||
                                  hexRotationSaving
                                }
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (!canDeleteFilledOutput) return;
                                  setDeleteConfirmKind("filled");
                                }}
                                aria-label="생성된 filled STL 삭제"
                                title="생성된 filled STL 삭제"
                              >
                                X
                              </button>
                            </>
                          )
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
                      </>
                    )}
                  </div>
                </div>



                {isTrackingStage ? (
                  trackingRightTab === "nc" ? (
                    previewNcText || hasNcFile ? (
                      <textarea
                        className="w-full flex-1 min-h-0 rounded-md border border-slate-200 p-3 font-mono text-xs text-slate-700 resize-none overflow-auto"
                        value={previewNcText}
                        readOnly
                      />
                    ) : (
                      <div className="h-full min-h-[300px] flex items-center justify-center text-xs text-slate-500 border rounded-md">
                        NC코드 없음
                      </div>
                    )
                  ) : (
                    <div className="flex-1 min-h-0 overflow-auto">
                      {previewStageUrl ? (
                        <img
                          src={previewStageUrl}
                          alt={previewStageName || "각인 이미지"}
                          className="w-full rounded-md border border-slate-200"
                        />
                      ) : hasRightFile && rightMeta?.s3Url ? (
                        <img
                          src={rightMeta.s3Url}
                          alt="각인 이미지"
                          className="w-full rounded-md border border-slate-200"
                        />
                      ) : (
                        <div className="h-full min-h-[300px] flex items-center justify-center text-xs text-slate-500 border rounded-md">
                          각인 이미지 없음
                        </div>
                      )}
                    </div>
                  )
                ) : isStageFileStage ? (
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
                      forceFilled
                      showLotEngraving={showLotEngraving}
                      lotSerialCode={lotSerialCode}
                      lotEngravingNcText={previewNcText}
                      lotEngravingHexMode={manufacturerHexRotationDraft}
                      lotEngravingTarget={lotEngravingTargetDraft}
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
          open={deleteConfirmKind !== null}
          title="생성 파일 삭제"
          description={
            deleteConfirmKind === "nc"
              ? "정말 삭제할까요? 생성된 NC 파일이 삭제됩니다."
              : "정말 삭제할까요? 생성된 filled STL 파일이 삭제됩니다."
          }
          confirmLabel="삭제"
          cancelLabel="취소"
          onCancel={() => setDeleteConfirmKind(null)}
          onConfirm={async () => {
            const kind = deleteConfirmKind;
            setDeleteConfirmKind(null);
            if (kind === "nc") {
              onDeleteNcOutput();
              return;
            }
            onDeleteFilledOutput();
          }}
        />
        <ConfirmDialog
          open={ncRegenConfirmOpen}
          title="NC 코드 재생성할까요?"
          description="Esprit를 다시 실행해 NC 코드를 생성합니다."
          confirmLabel="재생성"
          cancelLabel="취소"
          onCancel={() => setNcRegenConfirmOpen(false)}
          onConfirm={async () => {
            setNcRegenConfirmOpen(false);
            await onRegenerateNc();
          }}
        />
      </DialogContent>
    </Dialog>
  );
};

export default PreviewModal;
