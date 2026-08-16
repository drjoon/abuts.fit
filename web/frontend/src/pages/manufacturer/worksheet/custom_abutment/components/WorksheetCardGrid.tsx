// change-log:
// - 2026-08-17: 환자 호버 직납 치과 툴팁 — resolvePracticeDirectShippingContact 사용.
// - 2026-08-13: 준비 탭 라이노 미완료 카드 블러 + 「라이노 작업중」 오버레이, 클릭 차단. 완료 SSOT=camFile.s3Key.
// - 2026-08-12: 세척.패킹 카드 오른쪽 스크류 뱃지 위에 각인코드 3글자 뱃지 표시.
// - 2026-08-04: 신속/묶음배송 뱃지를 하단(마감시간 옆)으로 이동. API shippingMode projection 누락 수정과 맞춤.
// - 2026-08-04: 모든 의뢰카드에 신속배송/묶음배송 뱃지 상시 표시.
// - 2026-08-04: 환자 정보에 기공소명 전달 보강(business/requestorBusinessAnchor fallback).
// - 2026-08-04: 의뢰카드 본문을 RequestInfoSummary로 교체. 환자/임플란트 의미 단위 배치 + 치과명 중복 제거.
// - 2026-08-03: 카드/롤백 관련 stage label 정규화: '의뢰' 표시를 '준비'로 변경하여 화면 일관성 확보 (display-only)
// - 2026-08-03: 작업 공정 변경 반영: 화살표 승인/롤백 기준을 준비 ↔ 가공 흐름으로 정렬(중간 단계 건너뛰기)
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestInfoSummary.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/request.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/hooks/useWorksheetRealtimeStatus.ts
// - web/frontend/src/shared/shipping/shippingMode.ts
// - web/frontend/src/shared/shipping/ShippingModeBadge.tsx
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/controllers/requests/shippingPriority.utils.js
// - web/backend/controllers/bg/bg.controller.js
import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  FlaskConical,
  X,
} from "lucide-react";
import { resolveImplantConnectionSpec } from "@/utils/implantConnectionSpec";
import {
  type ManufacturerRequest,
  computeStageLabel,
  deriveStageForFilter,
  getAcceptByStage,
  getDeadlineInfo,
  getDiameterBucketIndex,
  stageOrder,
  isAnySampleRequest,
  isRndSampleRequest,
  isRhinoWorkPending,
  resolvePracticeDirectShippingContact,
} from "../utils/request";
import { RequestInfoSummary } from "./RequestInfoSummary";
import { resolveShippingMode } from "@/shared/shipping/shippingMode";
import { ShippingModeBadge } from "@/shared/shipping/ShippingModeBadge";

// related files (screw lot tracking):
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestInfoSummary.tsx
// - web/backend/controllers/requests/common.requests.controller.js

type WorksheetCardGridProps = {
  requests: ManufacturerRequest[];
  selectedRequestIds?: string[];
  printedRequestIds?: Set<string>;
  onToggleSelected?: (req: ManufacturerRequest) => void;
  onDownload: (req: ManufacturerRequest) => void;
  onOpenPreview: (req: ManufacturerRequest) => void;
  onDeleteCam: (req: ManufacturerRequest) => void;
  onDeleteNc: (req: ManufacturerRequest) => void;
  onCloneSample?: (req: ManufacturerRequest) => void;
  onSaveToRnd?: (req: ManufacturerRequest) => void;
  onRollback?: (req: ManufacturerRequest) => void;
  onApprove?: (req: ManufacturerRequest) => void;
  onDesignClaim?: (req: ManufacturerRequest) => void;
  enableDesignClaim?: boolean;
  designClaimBusyIds?: Record<string, boolean>;
  onDelete?: (req: ManufacturerRequest) => void;
  onDone?: (req: ManufacturerRequest) => void;
  onRestoreUnmachinable?: (req: ManufacturerRequest) => void;
  onSaveRndMemo?: (
    req: ManufacturerRequest,
    memo: string,
  ) => Promise<{
    memo: string;
    memoUpdatedAt?: string | null;
    memoUpdatedBy?: string | { _id?: string; name?: string } | null;
    memoUpdatedByName?: string | null;
  } | void>;
  onUploadNc?: (req: ManufacturerRequest, files: File[]) => Promise<void>;
  uploadProgress: Record<string, number>;
  rndMemoSaving?: Record<string, boolean>;
  isCamStage: boolean;
  isMachiningStage: boolean;
  uploading: Record<string, boolean>;
  downloading: Record<string, boolean>;
  deletingCam: Record<string, boolean>;
  deletingNc: Record<string, boolean>;
  currentStageOrder: number;
  tabStage?: string;
  debugLog?: boolean;
};

export const WorksheetCardGrid = ({
  requests,
  selectedRequestIds = [],
  printedRequestIds,
  onToggleSelected,
  onDownload,
  onOpenPreview,
  onDeleteCam,
  onDeleteNc,
  onCloneSample,
  onSaveToRnd,
  onRollback,
  onApprove,
  onDesignClaim,
  enableDesignClaim = false,
  designClaimBusyIds = {},
  onDelete,
  onDone,
  onRestoreUnmachinable,
  onSaveRndMemo,
  onUploadNc,
  uploadProgress,
  uploading,
  downloading,
  deletingCam,
  deletingNc,
  isCamStage,
  isMachiningStage,
  currentStageOrder,
  tabStage,
  rndMemoSaving = {},
  debugLog = false,
}: WorksheetCardGridProps) => {
  const [claimTickMs, setClaimTickMs] = useState(() => Date.now());
  useEffect(() => {
    if (!enableDesignClaim) return;
    const id = window.setInterval(() => setClaimTickMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enableDesignClaim]);

  const camDiaLogRef = useRef<Record<string, number | null>>({});
  const [rndMemoDrafts, setRndMemoDrafts] = useState<Record<string, string>>(
    {},
  );
  const selectedRequestIdSet = new Set(selectedRequestIds);
  const formatElapsed = (secRaw?: number | null) => {
    const sec = Number.isFinite(Number(secRaw))
      ? Math.max(0, Math.floor(Number(secRaw)))
      : null;
    if (sec == null) return "";
    const hh = Math.floor(sec / 3600);
    const mm = Math.floor((sec % 3600) / 60);
    const ss = sec % 60;
    if (hh > 0) {
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    }
    return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  };

  const formatClaimRemaining = (remainingMs: number) => {
    const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
    const hh = Math.floor(totalSec / 3600);
    const mm = Math.floor((totalSec % 3600) / 60);
    const ss = totalSec % 60;
    if (hh > 0) {
      return `${hh}시간 ${mm}분`;
    }
    if (mm > 0) {
      return `${mm}분 ${String(ss).padStart(2, "0")}초`;
    }
    return `${ss}초`;
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

  useEffect(() => {
    if (!debugLog) return;
    requests.forEach((request) => {
      const caseInfos = (request.caseInfos ||
        {}) as typeof request.caseInfos & {
        newSystemRequest?: { requested?: boolean; free?: boolean };
      };
      const newSystemData = caseInfos.newSystemRequest;
      const isNewSystemRequest = !!newSystemData?.requested;

      console.log("[WorksheetCardGrid] case", {
        requestId: request.requestId,
        patientName: caseInfos.patientName,
        tooth: caseInfos.tooth,
        newSystemRequest: newSystemData,
        isNewSystemRequest,
      });
    });
  }, [debugLog, requests]);

  useEffect(() => {
    setRndMemoDrafts((prev) => {
      const next = { ...prev };
      for (const request of requests) {
        const id = String(request?._id || "");
        if (!id) continue;
        if (next[id] !== undefined) continue;
        next[id] = String(request.rnd?.memo || "");
      }
      return next;
    });
  }, [requests]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {requests.map((request) => {
        const isSelected = selectedRequestIdSet.has(String(request._id || ""));
        const isPrinted = printedRequestIds
          ? printedRequestIds.has(String(request._id || ""))
          : Boolean((request as any)?.shippingLabelPrinted?.printed);
        const caseInfos = (request.caseInfos ||
          {}) as typeof request.caseInfos & {
          newSystemRequest?: { requested?: boolean; free?: boolean };
        };
        const newSystemData = caseInfos.newSystemRequest;
        const isNewSystemRequest = !!newSystemData?.requested;
        const workType = (() => {
          const ciWorkType = caseInfos.workType as
            "abutment" | "crown" | "mixed" | "unknown" | undefined;
          if (ciWorkType === "abutment" || ciWorkType === "crown") {
            return ciWorkType;
          }
          if (ciWorkType === "mixed") return "mixed";
          return "unknown";
        })();
        const shouldShowAnodizingOffBadge =
          caseInfos.anodizingEnabled === false &&
          ["request", "cam", "packing", "shipping"].includes(
            String(tabStage || "request"),
          );

        const isDownloading = !!downloading[request._id];

        const currentStageForTab = isMachiningStage
          ? "가공"
          : isCamStage
            ? "CAM"
            : "준비";
        const stageLabel = computeStageLabel(request, {
          isCamStage,
          isMachiningStage,
        });
        const accept = getAcceptByStage(stageLabel || currentStageForTab);
        const formatDisplayName = (name: string) => name || "파일명 없음";

        const originalFileName =
          caseInfos.file?.filePath || caseInfos.file?.originalName || "";
        const camFileName = caseInfos.camFile?.s3Key
          ? caseInfos.camFile?.filePath || caseInfos.camFile?.originalName || ""
          : "";
        const displayFileName = isMachiningStage
          ? caseInfos.ncFile?.filePath || caseInfos.ncFile?.originalName || ""
          : formatDisplayName(camFileName || originalFileName);

        const rhinoWorkPending = isRhinoWorkPending(request, tabStage);
        const isDeletingCam = !!deletingCam[request._id];

        const hasNcFile = !!caseInfos.ncFile?.s3Key;
        const isDeletingNc = !!deletingNc[request._id];
        const finishLineMinZRaw = Number((caseInfos as any)?.finishLine?.min_z);
        const isFinishLineMinZRisky =
          Number.isFinite(finishLineMinZRaw) && finishLineMinZRaw < 1;
        const isUnmachinableSample = Boolean(
          (request as any)?.rnd?.unmachinableAt,
        );
        const lotCodeSource = String(request.lotNumber?.value || "").trim();
        const lotShortCode = lotCodeSource
          ? lotCodeSource.replace(/^CA(P)?/i, "").trim().slice(-3).toUpperCase()
          : "";
        const camMaterialDiameter = (() => {
          const sched = request.productionSchedule || {};
          const raw = Number(sched.diameter);
          if (Number.isFinite(raw) && raw > 0) return raw;
          const ci = (request.caseInfos || {}) as any;
          const camDia = Number(ci?.camDiameter);
          if (Number.isFinite(camDia) && camDia > 0) return camDia;
          return null;
        })();
        if (debugLog) {
          try {
            const last = camDiaLogRef.current[request.requestId];
            const changed = last !== camMaterialDiameter;
            if (changed) {
              camDiaLogRef.current[request.requestId] = camMaterialDiameter as
                number | null;
              const dbg = {
                requestId: request.requestId,
                stage: request.manufacturerStage,
                schedule: request.productionSchedule,
                caseInfos: {
                  maxDiameter: request.caseInfos?.maxDiameter,
                  camDiameter: (request.caseInfos as any)?.camDiameter,
                },
                camMaterialDiameter,
              } as any;
              if (camMaterialDiameter == null) {
                console.warn(
                  "[FRONT] CAM card: camMaterialDiameter is null",
                  dbg,
                );
              } else {
                console.log(
                  "[FRONT] CAM card: camMaterialDiameter resolved",
                  dbg,
                );
              }
            }
          } catch {}
        }
        const progress = uploadProgress[request._id];
        const isUploading = uploading[request._id];
        const requestStageLabel = stageLabel;
        const showCamDiameter =
          camMaterialDiameter != null && currentStageOrder >= stageOrder["CAM"];
        const requestStageOrder = stageOrder[requestStageLabel] ?? 0;
        const isCompletedForCurrentStage =
          requestStageOrder > currentStageOrder;

        const stageForRollback = deriveStageForFilter(request);
        const isSampleRequest = isAnySampleRequest(request);
        const isRndArchivedSample = isRndSampleRequest(request);
        const isRndVisualSample = isRndArchivedSample;
        const requestObjectId = String(request?._id || "");
        const rndMemoDraft = rndMemoDrafts[requestObjectId] ?? "";
        const rndMemoSaved = String(request.rnd?.memo || "");
        const isRndMemoDirty = rndMemoDraft.trim() !== rndMemoSaved.trim();
        const isSavingRndMemo = !!rndMemoSaving[requestObjectId];
        const rndMemoUpdatedAt = String(
          request.rnd?.memoUpdatedAt || "",
        ).trim();
        const rndMemoUpdaterName = (() => {
          const named = String(request.rnd?.memoUpdatedByName || "").trim();
          if (named) return named;
          const by = request.rnd?.memoUpdatedBy;
          if (by && typeof by === "object") {
            const n = String(by.name || "").trim();
            if (n) return n;
          }
          return "";
        })();
        const requestorContinueAt = String(
          request.rnd?.requestorContinueAt || "",
        ).trim();
        const requestorContinueMessage = String(
          request.rnd?.requestorContinueMessage || "",
        ).trim();
        const hasRequestorContinueDecision = Boolean(requestorContinueAt);
        const requestorContinueAtMs = Date.parse(requestorContinueAt);
        const unmachinableEventAtMs = Date.parse(
          String(
            request.rnd?.unmachinableAt || request.rnd?.unmachinablePotentialAt || "",
          ).trim(),
        );
        const showLatestContinueBadge =
          hasRequestorContinueDecision &&
          (!Number.isFinite(unmachinableEventAtMs) ||
            (Number.isFinite(requestorContinueAtMs) &&
              requestorContinueAtMs >= unmachinableEventAtMs));
        const shouldShowTopUnmachinableBadge =
          (isFinishLineMinZRisky || isUnmachinableSample) &&
          !showLatestContinueBadge;

        const shouldShowFullLot =
          !isSampleRequest &&
          !!lotCodeSource &&
          stageOrder[stageForRollback] >= stageOrder["CAM"];
        const rollbackCountFromRequest = Number(
          caseInfos.rollbackCounts?.request || 0,
        );
        const rollbackCountFromCam = Number(caseInfos.rollbackCounts?.cam || 0);
        const rollbackCountFromMachining = Number(
          caseInfos.rollbackCounts?.machining || 0,
        );
        const canRollback =
          tabStage === "rnd" ||
          stageForRollback === "추적관리" ||
          stageForRollback !== "준비" ||
          rollbackCountFromRequest > 0 ||
          rollbackCountFromCam > 0 ||
          rollbackCountFromMachining > 0;

        const reviewStageKey = (() => {
          const stage = String(tabStage || "").trim();
          if (stage === "tracking") return "tracking";
          if (stage === "shipping") return "shipping";
          if (stage === "packing") return "packing";
          if (isMachiningStage) return "machining";
          if (isCamStage) return "cam";
          return "request";
        })();
        const packingShippingRollbackCount =
          reviewStageKey === "packing"
            ? Number(caseInfos.rollbackCounts?.shipping || 0)
            : 0;

        // packing 단계에서는 각인 이미지가 있어야 승인 가능.
        // 단, 포장.발송에서 롤백되어 돌아온 경우(shipping 롤백 이력 있음)나
        // 세척.패킹에서 롤백되었다가 다시 온 경우(packing 롤백 이력 있음)는
        // 이미 각인 라벨이 인식된 적 있으므로 재인식 없이 승인 가능.
        const hasEngravingImage =
          reviewStageKey === "packing"
            ? packingShippingRollbackCount > 0 ||
              Number(caseInfos.rollbackCounts?.packing || 0) > 0 ||
              !!(
                caseInfos.stageFiles?.packing?.s3Url ||
                caseInfos.stageFiles?.packing?.filePath
              )
            : true;

        const resolvedConnectionSpec = resolveImplantConnectionSpec({
          implantManufacturer: caseInfos.implantManufacturer,
          implantBrand: caseInfos.implantBrand,
          implantFamily: caseInfos.implantFamily,
          implantType: caseInfos.implantType,
          connectionDiameter: (caseInfos as any)?.connectionDiameter,
        });
        const displayConnectionDiameter =
          resolvedConnectionSpec.connectionDiameter != null
            ? resolvedConnectionSpec.connectionDiameter
            : Number.isFinite(Number((caseInfos as any)?.connectionDiameter))
              ? Number((caseInfos as any)?.connectionDiameter)
              : null;

        const canApprove = (() => {
          if (enableDesignClaim) {
            const peerBusy = Boolean(
              request.designClaimPeerBusy ?? request.designClaimMeta?.peerBusy,
            );
            const mine = Boolean(
              request.designClaimMine ?? request.designClaimMeta?.mine,
            );
            if (peerBusy || !mine) return false;
          }
          if (
            reviewStageKey === "machining" ||
            reviewStageKey === "packing" ||
            reviewStageKey === "shipping" ||
            reviewStageKey === "tracking"
          ) {
            if (reviewStageKey === "packing") {
              return hasEngravingImage;
            }
            return Boolean(
              caseInfos.stageFiles?.[reviewStageKey]?.s3Key ||
                caseInfos.stageFiles?.[reviewStageKey]?.s3Url ||
                caseInfos.stageFiles?.[reviewStageKey]?.filePath,
            );
          }
          if (reviewStageKey === "cam") {
            return true;
          }
          return true;
        })();

        const designPeerBusy = Boolean(
          enableDesignClaim &&
            (request.designClaimPeerBusy ?? request.designClaimMeta?.peerBusy),
        );
        const designClaimMine = Boolean(
          enableDesignClaim &&
            (request.designClaimMine ?? request.designClaimMeta?.mine),
        );
        const designClaimable = Boolean(
          enableDesignClaim &&
            !designPeerBusy &&
            !designClaimMine &&
            (request.designClaimClaimable ??
              request.designClaimMeta?.claimable ??
              true),
        );
        const designDeadlineMs = request.designClaim?.deadlineAt
          ? Date.parse(String(request.designClaim.deadlineAt))
          : NaN;
        const designRemainingMs = designClaimMine
          ? Number.isFinite(designDeadlineMs)
            ? Math.max(0, designDeadlineMs - claimTickMs)
            : Number(request.designClaimRemainingMs ?? request.designClaimMeta?.remainingMs ?? 0)
          : null;
        const designClaimWarn =
          designClaimMine &&
          designRemainingMs != null &&
          designRemainingMs <= 30 * 60 * 1000;
        const designClaimBusy = Boolean(designClaimBusyIds[requestObjectId]);

        const isNcGenerating =
          reviewStageKey === "cam" &&
          String((request as any)?.realtimeProgress?.badge || "").trim() ===
            "NC 생성중";

        const lotBadgeClass = (() => {
          const s = String(stageForRollback || "").trim();
          const base =
            "text-[11px] px-2 py-0.5 font-semibold leading-[1.1] border";
          if (s === "CAM") {
            return `${base} bg-primary-soft text-primary-strong border-primary-muted`;
          }
          if (s === "가공") {
            return `${base} bg-primary-soft text-primary-strong border-primary-muted`;
          }
          if (s === "세척.포장" || s === "세척.패킹") {
            return `${base} bg-primary-soft text-primary-strong border-primary-muted`;
          }
          if (s === "발송" || s === "포장.발송") {
            return `${base} bg-accent-soft text-accent-strong border-accent-muted`;
          }
          if (s === "추적관리") {
            return `${base} bg-slate-50 text-slate-700 border-slate-200`;
          }
          return `${base} bg-slate-50 text-slate-700 border-slate-200`;
        })();

        const stageBadgeClassName = (() => {
          const s = String(stageForRollback || "").trim();
          const base =
            "text-[11px] px-2 py-0.5 font-extrabold leading-[1.1] border";
          if (s === "CAM") {
            return `${base} bg-primary-soft text-primary-strong border-primary-muted`;
          }
          if (s === "가공") {
            return `${base} bg-primary-soft text-primary-strong border-primary-muted`;
          }
          if (s === "세척.포장" || s === "세척.패킹") {
            return `${base} bg-primary-soft text-primary-strong border-primary-muted`;
          }
          if (s === "발송" || s === "포장.발송") {
            return `${base} bg-accent-soft text-accent-strong border-accent-muted`;
          }
          if (s === "추적관리") {
            return `${base} bg-slate-50 text-slate-700 border-slate-200`;
          }
          return `${base} bg-slate-50 text-slate-700 border-slate-200`;
        })();
        const stageBadgeLabel = (() => {
          const s = String(stageForRollback || "").trim();
          if (s === "세척.포장" || s === "세척.패킹") return "세척·패킹";
          if (s === "발송" || s === "포장.발송") return "포장·발송";
          return s || "준비";
        })();

        const machiningElapsedLabel = (() => {
          if (!isMachiningStage) return "";
          const progress = (request as any)?.productionSchedule
            ?.machiningProgress;
          const phase = String(progress?.phase || "")
            .trim()
            .toUpperCase();
          const secRaw = progress?.elapsedSeconds;

          if (phase === "AWAITING_START") {
            return "가공 시작 준비중...";
          }
          if (phase === "COMPLETED") {
            const elapsed = formatElapsed(secRaw);
            return elapsed ? `가공 완료 (${elapsed})` : "가공 완료";
          }
          return formatElapsed(secRaw);
        })();
        const realtimeBadge = String(
          request.realtimeProgress?.badge || "",
        ).trim();
        const isPackingLabelPrintFailure =
          tabStage === "packing" && realtimeBadge === "패킹 라벨 출력 실패";
        const realtimeElapsedLabel = isPackingLabelPrintFailure
          ? ""
          : formatElapsed(request.realtimeProgress?.elapsedSeconds);
        const realtimeToneClass = getRealtimeToneClass(
          request.realtimeProgress?.tone,
        );

        const maxDiameter =
          typeof caseInfos.maxDiameter === "number" &&
          Number.isFinite(caseInfos.maxDiameter) &&
          caseInfos.maxDiameter > 0
            ? caseInfos.maxDiameter
            : null;
        const maxLengthRaw = Number((caseInfos as any)?.totalLength);
        const maxLength =
          Number.isFinite(maxLengthRaw) && maxLengthRaw > 0
            ? maxLengthRaw
            : null;

        const sp = request.shippingPriority;
        const urgency = String(sp?.level || "").trim();
        const hasInsufficientShippingCredit = Boolean(
          request.shippingCreditMeta?.insufficient,
        );
        const shippingMode = resolveShippingMode(request as any);
        const deadlineInfo = getDeadlineInfo(
          request.createdAt,
          request.timeline?.estimatedShipYmd,
        );
        const hasRealtimeProgress =
          reviewStageKey !== "request" &&
          reviewStageKey !== "cam" &&
          Boolean(realtimeBadge || realtimeElapsedLabel);
        const showPackingLotShortBadge =
          tabStage === "packing" && Boolean(lotShortCode);
        const showSideSpecBadges =
          shouldShowAnodizingOffBadge ||
          showPackingLotShortBadge ||
          (tabStage === "packing" && Boolean(resolvedConnectionSpec.screwType));

        const hasTopFloatingControls =
          Boolean(onToggleSelected) ||
          Boolean(isSampleRequest) ||
          hasRealtimeProgress ||
          Boolean(
            onCloneSample &&
              (tabStage === "packing" ||
                tabStage === "request" ||
                tabStage === "cam"),
          ) ||
          Boolean(
            onSaveToRnd &&
              (tabStage === "packing" ||
                tabStage === "request" ||
                tabStage === "cam"),
          ) ||
          Boolean(onRollback && canRollback) ||
          Boolean(onDelete && isSampleRequest) ||
          Boolean(onDone && isSampleRequest && !isRndArchivedSample) ||
          Boolean(
            onRestoreUnmachinable &&
              tabStage === "unmachinable" &&
              isUnmachinableSample,
          ) ||
          Boolean(onApprove && !isCompletedForCurrentStage);

        // 신속/묶음배송 뱃지를 하단에 항상 표시
        const hasBottomFloatingBadges = true;
        const handleDrop = async (e: React.DragEvent) => {
          e.preventDefault();
          e.stopPropagation();

          if (!isCamStage || !onUploadNc) return;

          const files = Array.from(e.dataTransfer.files);
          const ncFiles = files.filter((f) =>
            f.name.toLowerCase().endsWith(".nc"),
          );

          if (ncFiles.length === 0) return;

          const getBaseName = (name: string) => {
            const s = String(name || "");
            if (!s.includes(".")) return s;
            return s.split(".").slice(0, -1).join(".");
          };

          const camFileName =
            caseInfos.camFile?.filePath ||
            caseInfos.camFile?.originalName ||
            "";
          const expectedBaseName = getBaseName(camFileName).toLowerCase();

          const matchingFile = ncFiles.find((f) => {
            const fileBaseName = getBaseName(f.name).toLowerCase();
            return fileBaseName === expectedBaseName;
          });

          if (matchingFile) {
            await onUploadNc(request, [matchingFile]);
          }
        };

        const handleDragOver = (e: React.DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
        };

        const handleToggleSelected = (e: React.MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          if (rhinoWorkPending) return;
          onToggleSelected?.(request);
        };

        const handleOpenCardPreview = (e: React.MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          if (rhinoWorkPending) return;
          onOpenPreview(request);
        };

        return (
          <Card
            key={String(request._id || request.requestId || "")}
            onClick={
              rhinoWorkPending
                ? undefined
                : onToggleSelected
                  ? handleToggleSelected
                  : undefined
            }
            className={`relative h-full border ${rhinoWorkPending ? "overflow-hidden" : ""} ${
              isSelected
                ? "border-primary bg-primary-soft/40"
                : isSampleRequest
                  ? isRndVisualSample
                    ? "border-primary/70 bg-primary-soft/40"
                    : "border-primary/70 bg-primary-soft/40"
                  : tabStage === "packing" && isPrinted
                    ? "border-slate-300 bg-slate-50/60 opacity-75"
                    : hasInsufficientShippingCredit
                      ? "border-destructive border-2 bg-destructive-soft/40"
                      : isCompletedForCurrentStage
                        ? "border-primary bg-primary-soft/30"
                        : deadlineInfo
                          ? deadlineInfo.borderClass
                          : urgency === "danger"
                            ? "border-destructive border-2"
                            : urgency === "warning"
                              ? "border-accent border-2"
                              : "border-slate-200"
            } ${
              isFinishLineMinZRisky || isUnmachinableSample
                ? "border-accent-muted ring-2 ring-accent-muted/80"
                : ""
            } ${onToggleSelected && !rhinoWorkPending ? "cursor-pointer" : ""}`}
            role={onToggleSelected && !rhinoWorkPending ? "button" : undefined}
            aria-pressed={
              onToggleSelected && !rhinoWorkPending ? isSelected : undefined
            }
          >
            {rhinoWorkPending ? (
              <div
                className="absolute inset-0 z-30 flex items-center justify-center rounded-[inherit] bg-white/55 backdrop-blur-[6px] cursor-not-allowed"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                role="status"
                aria-live="polite"
                aria-label="라이노 작업중"
              >
                <span className="rounded-full border border-primary-muted bg-primary-soft/90 px-3 py-1.5 text-sm font-extrabold text-primary-strong shadow-sm">
                  라이노 작업중
                </span>
              </div>
            ) : null}
            <div className="absolute left-2 top-2 z-20 flex items-center gap-1">
              {onToggleSelected ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleToggleSelected(e);
                  }}
                  className={`h-7 w-7 rounded-full border flex items-center justify-center text-sm font-semibold transition ${
                    isSelected
                      ? "bg-primary border-primary text-white"
                      : "bg-white border-slate-300 text-slate-500"
                  }`}
                  aria-label={
                    isSelected
                      ? `${String(request.requestId || "의뢰")} 선택 해제`
                      : `${String(request.requestId || "의뢰")} 선택`
                  }
                >
                  {isSelected ? "✓" : ""}
                </button>
              ) : null}
              {isSampleRequest && (
                <Badge
                  variant="outline"
                  className={`text-[11px] px-2 py-0.5 font-semibold h-7 flex items-center ${
                    isRndVisualSample
                      ? "border-primary/70 bg-primary-soft text-primary-strong"
                      : "border-primary/70 bg-primary-soft text-primary-strong"
                  }`}
                >
                  {isRndVisualSample ? "R&D" : "샘플"}
                </Badge>
              )}
            </div>
            {/* 실시간 상태 뱃지 (CAM 생성중 등) - 상단 배치 */}
            {hasRealtimeProgress && (
              <div className="absolute left-2 right-2 top-10 z-20 flex flex-wrap items-center gap-2">
                {realtimeBadge && (
                  <Badge
                    variant="outline"
                    className={`text-[11px] px-2 py-0.5 font-extrabold leading-[1.1] ${realtimeToneClass}`}
                  >
                    {realtimeBadge}
                  </Badge>
                )}
                {realtimeElapsedLabel && (
                  <span className="text-[12px] tabular-nums font-bold text-primary-strong whitespace-nowrap">
                    {realtimeElapsedLabel}
                  </span>
                )}
              </div>
            )}
            {enableDesignClaim && (designPeerBusy || designClaimMine) && (
              <div className="absolute left-2 right-14 top-10 z-20 flex flex-wrap items-center gap-2">
                {designPeerBusy && (
                  <Badge
                    variant="outline"
                    className="text-[11px] px-2 py-0.5 font-extrabold leading-[1.1] border-accent-muted bg-accent-soft text-accent-strong"
                  >
                    다른 디자이너 작업중
                  </Badge>
                )}
                {designClaimMine && designRemainingMs != null && (
                  <Badge
                    variant="outline"
                    className={`text-[11px] px-2 py-0.5 font-extrabold leading-[1.1] ${
                      designClaimWarn
                        ? "border-destructive/80 bg-destructive-soft text-destructive"
                        : "border-primary-muted bg-primary-soft text-primary-strong"
                    }`}
                    title={
                      designClaimWarn
                        ? "마감이 임박했습니다"
                        : "디자인 작업 마감까지 남은 시간"
                    }
                  >
                    {designClaimWarn ? "마감 임박 · " : "작업중 · "}
                    {formatClaimRemaining(designRemainingMs)}
                  </Badge>
                )}
              </div>
            )}
            <div className="absolute right-2 top-2 z-20 flex items-center gap-1">
              {enableDesignClaim && designClaimable && onDesignClaim && (
                <button
                  type="button"
                  className={`h-7 px-2 inline-flex items-center justify-center gap-1 rounded-md border bg-white/90 text-primary-strong shadow-sm transition hover:bg-primary-soft ${
                    designClaimBusy ? "opacity-40 cursor-not-allowed" : ""
                  }`}
                  disabled={designClaimBusy}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (designClaimBusy) return;
                    onDesignClaim(request);
                  }}
                  aria-label="수락"
                  title="이 디자인 작업을 수락합니다"
                >
                  <span className="text-[11px] font-semibold">
                    {designClaimBusy ? "수락 중…" : "수락"}
                  </span>
                </button>
              )}
              {shouldShowTopUnmachinableBadge && (
                <Badge
                  variant="outline"
                  className={`h-7 text-[11px] px-2 py-0.5 font-semibold leading-[1.1] border flex items-center ${
                    isUnmachinableSample
                      ? "border-accent-muted bg-accent-soft text-accent-strong"
                      : "border-accent-muted bg-accent-soft text-accent-strong"
                  }`}
                >
                  {isUnmachinableSample ? "불완전가공" : "불완전가공 확인요망"}
                </Badge>
              )}
              {showLatestContinueBadge && (
                <Badge
                  variant="outline"
                  className="h-7 text-[11px] px-2 py-0.5 font-semibold leading-[1.1] border border-primary-muted bg-primary-soft text-primary-strong flex items-center"
                  title={requestorContinueMessage || "의뢰자가 계속 가공 진행을 요청했습니다."}
                >
                  불완전가공 진행요청
                </Badge>
              )}
              {onCloneSample &&
                (tabStage === "packing" ||
                  tabStage === "request" ||
                  tabStage === "cam") && (
                <button
                  type="button"
                  className="h-7 px-2 inline-flex items-center justify-center gap-1 rounded-md border bg-white/90 text-primary-strong shadow-sm transition hover:bg-primary-soft"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onCloneSample(request);
                  }}
                  aria-label="샘플 복사"
                  title="크레딧 차감 없는 생산용 샘플 복사"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-semibold">샘플 복사</span>
                </button>
              )}
              {onSaveToRnd &&
                (tabStage === "packing" ||
                  tabStage === "request" ||
                  tabStage === "cam") && (
                <button
                  type="button"
                  className="h-7 px-2 inline-flex items-center justify-center gap-1 rounded-md border bg-white/90 text-primary-strong shadow-sm transition hover:bg-primary-soft"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSaveToRnd(request);
                  }}
                  aria-label="R&D 저장"
                  title="R&D 페이지로 샘플 복사 저장"
                >
                  <FlaskConical className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-semibold">R&D 저장</span>
                </button>
              )}
              {onRollback && canRollback && (
                <button
                  type="button"
                  className={`inline-flex items-center justify-center rounded-md border bg-white/90 text-slate-600 shadow-sm transition hover:bg-slate-50 ${
                    tabStage === "rnd" ? "h-7 px-2 gap-1" : "h-7 w-7"
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRollback(request);
                  }}
                  aria-label={tabStage === "rnd" ? "재제작" : "롤백"}
                  title={
                    tabStage === "rnd" ? "선택 공정으로 재제작 복사" : "롤백"
                  }
                >
                  {tabStage === "rnd" ? (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span className="text-[11px] font-semibold">재제작</span>
                    </>
                  ) : (
                    <ArrowLeft className="h-4 w-4" />
                  )}
                </button>
              )}
              {onDelete && isSampleRequest && (
                <button
                  type="button"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md border bg-white/90 text-destructive shadow-sm transition hover:bg-destructive-soft"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete(request);
                  }}
                  aria-label="삭제"
                  title="샘플 삭제"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              {onRestoreUnmachinable &&
                tabStage === "unmachinable" &&
                isUnmachinableSample && (
                  <button
                    type="button"
                    className="h-7 px-2 inline-flex items-center justify-center gap-1 rounded-md border bg-white/90 text-primary-strong shadow-sm transition hover:bg-primary-soft"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onRestoreUnmachinable(request);
                    }}
                    aria-label="불완전가공 복귀"
                    title="불완전가공 복귀"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-semibold">복귀</span>
                  </button>
                )}
              {onApprove && !isCompletedForCurrentStage && (
                <button
                  type="button"
                  className={`h-7 w-7 inline-flex items-center justify-center rounded-md border bg-white/90 text-slate-600 shadow-sm transition hover:bg-slate-50 ${
                    canApprove && !isNcGenerating
                      ? ""
                      : "opacity-40 cursor-not-allowed"
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!canApprove || isNcGenerating) return;
                    onApprove(request);
                  }}
                  aria-label="승인"
                  title={
                    !hasEngravingImage
                      ? "각인 이미지가 필요합니다"
                      : isNcGenerating
                        ? "NC 재생성 완료를 기다리는 중입니다"
                        : (reviewStageKey === "cam" || reviewStageKey === "request") &&
                            !hasNcFile
                          ? "가공 이동을 위해 NC 재생성 명령을 먼저 실행합니다"
                            : canApprove
                              ? "승인"
                              : "다음 공정으로 넘길 파일/데이터가 필요합니다"
                  }
                  disabled={!canApprove || isNcGenerating}
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
            {showSideSpecBadges && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex flex-col items-end gap-1.5">
                {shouldShowAnodizingOffBadge && (
                  <Badge
                    variant="outline"
                    className="text-[16px] px-3 py-1 font-semibold leading-[1.1] border border-slate-300 bg-slate-100 text-slate-700"
                  >
                    아노X
                  </Badge>
                )}
                {showPackingLotShortBadge && (
                  <Badge
                    variant="outline"
                    className="text-[16px] px-3 py-1 font-extrabold leading-[1.1] border border-slate-800 bg-slate-900 text-white tracking-wider"
                    title={`각인코드 ${lotShortCode}`}
                  >
                    {lotShortCode}
                  </Badge>
                )}
                {tabStage === "packing" && resolvedConnectionSpec.screwType && (
                  <Badge
                    variant="outline"
                    className="text-[16px] px-3 py-1 font-extrabold leading-[1.1] border border-primary-muted bg-primary-soft text-primary-strong"
                  >
                    스크류 {resolvedConnectionSpec.screwType}
                  </Badge>
                )}
              </div>
            )}
            {hasBottomFloatingBadges ? (
              <div className="absolute right-2 bottom-2 z-20 flex items-center gap-1 flex-nowrap">
                {tabStage === "packing" && isPrinted && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 font-semibold border-slate-300 bg-slate-100 text-slate-500"
                  >
                    ✓ 출력 완료
                  </Badge>
                )}
                {shouldShowFullLot && (
                  <Badge variant="outline" className={`${lotBadgeClass} whitespace-nowrap`}>
                    {lotCodeSource}
                  </Badge>
                )}
                {hasNcFile && (
                  <Badge
                    variant="outline"
                    className="text-[11px] px-2 py-0.5 font-extrabold leading-[1.1] border border-primary-muted bg-primary-soft text-primary-strong whitespace-nowrap"
                  >
                    NC
                  </Badge>
                )}
                <ShippingModeBadge
                  mode={shippingMode}
                  className="text-[11px] px-2 py-0.5 font-semibold leading-[1.1] whitespace-nowrap"
                />
                {deadlineInfo && (
                  <>
                    <Badge
                      variant="outline"
                      className={`text-[11px] px-2 py-0.5 font-semibold leading-[1.1] border whitespace-nowrap ${deadlineInfo.badgeClass}`}
                    >
                      {deadlineInfo.displayText}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`${stageBadgeClassName} whitespace-nowrap`}
                    >
                      {stageBadgeLabel}
                    </Badge>
                  </>
                )}
              </div>
            ) : null}
            {isUploading && progress !== undefined && (
              <div className="absolute inset-0 z-10 bg-white/80 flex flex-col items-center justify-center p-4 rounded-xl">
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-2">
                  <div
                    className="bg-primary h-full transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-primary-strong">
                  {progress}% 업로드 중...
                </span>
              </div>
            )}
            <CardContent
              className={`relative z-10 px-3 flex-1 flex flex-col gap-2 ${
                hasRealtimeProgress
                  ? "pt-14"
                  : hasTopFloatingControls
                    ? "pt-10"
                    : "pt-6"
              } ${hasBottomFloatingBadges ? "pb-8" : "pb-4"} ${
                isNewSystemRequest ? "bg-primary-soft/40" : ""
              }`}
            >
              <div
                className={`transition ${showSideSpecBadges ? "pr-24" : ""}`}
                onClick={handleOpenCardPreview}
              >
                <RequestInfoSummary
                  requestorLabel={
                    request.requestor?.business ||
                    request.business?.name ||
                    (request as any)?.requestorBusinessAnchor?.name ||
                    request.requestor?.name
                  }
                  clinicName={caseInfos.clinicName}
                  createdAt={request.createdAt}
                  patientName={caseInfos.patientName}
                  tooth={caseInfos.tooth}
                  connectionDiameter={displayConnectionDiameter}
                  maxDiameter={maxDiameter}
                  maxLength={maxLength}
                  implantParts={[
                    caseInfos.implantManufacturer,
                    caseInfos.implantBrand,
                    caseInfos.implantFamily,
                    caseInfos.implantType,
                  ]}
                  retentionGrooveLabel={(() => {
                    const rg = (caseInfos as any)?.retentionGroove as
                      | "none"
                      | "shallow"
                      | "deep"
                      | undefined;
                    if (!rg) return null;
                    return rg === "deep" ? "있음" : "없음";
                  })()}
                  shippingContact={resolvePracticeDirectShippingContact(
                    request as ManufacturerRequest,
                  )}
                  leadingSlot={
                    <>
                      {(isNewSystemRequest || hasInsufficientShippingCredit) && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {isNewSystemRequest && (
                            <Badge
                              variant="outline"
                              className="border-primary/70 text-primary-strong bg-primary-soft"
                            >
                              신규 임플란트
                            </Badge>
                          )}
                          {hasInsufficientShippingCredit && (
                            <Badge
                              variant="outline"
                              className="border-destructive/80 bg-destructive-soft text-destructive"
                            >
                              배송비 부족
                            </Badge>
                          )}
                        </div>
                      )}
                      {!!machiningElapsedLabel && (
                        <div className="flex items-center gap-2 text-[12px] text-slate-500">
                          <span className="font-semibold text-primary-strong">
                            Now Playing
                          </span>
                          <span className="tabular-nums font-bold text-primary-strong">
                            {machiningElapsedLabel}
                          </span>
                        </div>
                      )}
                    </>
                  }
                />

                {/* 백그라운드 작업 실패 시 안내 메시지 */}
                {((isCamStage &&
                  request.caseInfos?.reviewByStage?.cam?.status ===
                    "REJECTED") ||
                  (isMachiningStage &&
                    request.caseInfos?.reviewByStage?.machining?.status ===
                      "REJECTED")) && (
                  <div className="mt-2 p-2 bg-destructive-soft border border-destructive-soft rounded-lg text-xs text-destructive flex flex-col gap-1">
                    <div className="font-bold">⚠️ 백그라운드 작업 실패</div>
                    <div>
                      {isCamStage
                        ? "Rhino/ESPRIT 작업 중 오류가 발생했습니다. 파일을 확인 후 수동으로 업로드해주세요."
                        : "가공 명령 전송 중 오류가 발생했습니다. 장비 상태 확인 후 수동으로 조치해주세요."}
                    </div>
                  </div>
                )}
              </div>

              {tabStage === "rnd" && isSampleRequest && onSaveRndMemo && (
                <div
                  className="mt-1 px-3 pb-2"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <div className="rounded-md border border-primary-muted bg-primary-soft/40 p-2 space-y-2">
                    <div className="text-[11px] font-semibold text-primary-strong">
                      메모
                    </div>
                    <Textarea
                      value={rndMemoDraft}
                      onChange={(e) => {
                        const value = String(e.target.value || "").slice(
                          0,
                          500,
                        );
                        setRndMemoDrafts((prev) => ({
                          ...prev,
                          [requestObjectId]: value,
                        }));
                      }}
                      onBlur={async () => {
                        if (!isRndMemoDirty || isSavingRndMemo) return;
                        try {
                          const saved = await onSaveRndMemo(
                            request,
                            rndMemoDraft,
                          );
                          if (saved && typeof saved.memo === "string") {
                            setRndMemoDrafts((prev) => ({
                              ...prev,
                              [requestObjectId]: saved.memo,
                            }));
                          }
                        } catch {
                          // 실패 토스트는 상위 핸들러에서 표시
                        }
                      }}
                      placeholder="문제점 / 해결책 / 다음 확인사항"
                      rows={3}
                      maxLength={500}
                      className="min-h-[74px] resize-y bg-white text-xs"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-[11px] text-slate-500">
                          {rndMemoDraft.length}/500
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {rndMemoUpdatedAt
                            ? "수정: " +
                              new Date(rndMemoUpdatedAt).toLocaleString() +
                              (rndMemoUpdaterName
                                ? " · " + rndMemoUpdaterName
                                : "")
                            : ""}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={`h-7 rounded-md border px-2 text-[11px] font-semibold transition ${
                          isRndMemoDirty && !isSavingRndMemo
                            ? "border-primary/70 bg-white text-primary-strong hover:bg-primary-muted/50"
                            : "border-slate-200 bg-slate-100 text-slate-400"
                        }`}
                        disabled={!isRndMemoDirty || isSavingRndMemo}
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!isRndMemoDirty || isSavingRndMemo) return;
                          try {
                            const saved = await onSaveRndMemo(
                              request,
                              rndMemoDraft,
                            );
                            if (saved && typeof saved.memo === "string") {
                              setRndMemoDrafts((prev) => ({
                                ...prev,
                                [requestObjectId]: saved.memo,
                              }));
                            }
                          } catch {
                            // 실패 토스트는 상위 핸들러에서 표시
                          }
                        }}
                      >
                        {isSavingRndMemo ? "저장중..." : "지금 저장"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>

          </Card>
        );
      })}
    </div>
  );
};
