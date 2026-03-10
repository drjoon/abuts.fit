import { useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { formatImplantDisplay } from "@/utils/implant";
import {
  type ManufacturerRequest,
  computeStageLabel,
  deriveStageForFilter,
  getAcceptByStage,
  getDiameterBucketIndex,
  stageOrder,
} from "../utils/request";

type WorksheetCardGridProps = {
  requests: ManufacturerRequest[];
  selectedRequestIds?: string[];
  onToggleSelected?: (req: ManufacturerRequest) => void;
  onDownload: (req: ManufacturerRequest) => void;
  onOpenPreview: (req: ManufacturerRequest) => void;
  onDeleteCam: (req: ManufacturerRequest) => void;
  onDeleteNc: (req: ManufacturerRequest) => void;
  onRollback?: (req: ManufacturerRequest) => void;
  onApprove?: (req: ManufacturerRequest) => void;
  onUploadNc?: (req: ManufacturerRequest, files: File[]) => Promise<void>;
  uploadProgress: Record<string, number>;
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
  onToggleSelected,
  onDownload,
  onOpenPreview,
  onDeleteCam,
  onDeleteNc,
  onRollback,
  onApprove,
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
  debugLog = false,
}: WorksheetCardGridProps) => {
  const camDiaLogRef = useRef<Record<string, number | null>>({});
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

  const getRealtimeToneClass = (tone?: string | null) => {
    if (tone === "amber") {
      return "bg-amber-50 text-amber-700 border-amber-200";
    }
    if (tone === "indigo") {
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
    }
    if (tone === "rose") {
      return "bg-rose-50 text-rose-700 border-rose-200";
    }
    if (tone === "slate") {
      return "bg-slate-50 text-slate-700 border-slate-200";
    }
    return "bg-blue-50 text-blue-700 border-blue-200";
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
      // eslint-disable-next-line no-console
      console.log("[WorksheetCardGrid] case", {
        requestId: request.requestId,
        patientName: caseInfos.patientName,
        tooth: caseInfos.tooth,
        newSystemRequest: newSystemData,
        isNewSystemRequest,
      });
    });
  }, [debugLog, requests]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {requests.map((request) => {
        const isSelected = selectedRequestIdSet.has(String(request._id || ""));
        const caseInfos = (request.caseInfos ||
          {}) as typeof request.caseInfos & {
          newSystemRequest?: { requested?: boolean; free?: boolean };
        };
        const newSystemData = caseInfos.newSystemRequest;
        const isNewSystemRequest = !!newSystemData?.requested;
        const workType = (() => {
          const ciWorkType = caseInfos.workType as
            | "abutment"
            | "crown"
            | "mixed"
            | "unknown"
            | undefined;
          if (ciWorkType === "abutment" || ciWorkType === "crown") {
            return ciWorkType;
          }
          if (ciWorkType === "mixed") return "mixed";
          return "unknown";
        })();

        const isDownloading = !!downloading[request._id];

        const currentStageForTab = isMachiningStage
          ? "가공"
          : isCamStage
            ? "CAM"
            : "의뢰";
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

        const hasCamFile = !!caseInfos.camFile?.s3Key;
        const isDeletingCam = !!deletingCam[request._id];

        const hasNcFile = !!caseInfos.ncFile?.s3Key;
        const isDeletingNc = !!deletingNc[request._id];
        const lotCodeSource = String(request.lotNumber?.value || "").trim();
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
                | number
                | null;
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
        const showCamDiameter = camMaterialDiameter != null;
        const requestStageOrder = stageOrder[requestStageLabel] ?? 0;
        const isCompletedForCurrentStage =
          requestStageOrder > currentStageOrder;

        const stageForRollback = deriveStageForFilter(request);
        const shouldShowFullLot =
          !!lotCodeSource && stageOrder[stageForRollback] >= stageOrder["CAM"];
        const rollbackCountFromRequest = Number(
          caseInfos.rollbackCounts?.request || 0,
        );
        const rollbackCountFromCam = Number(caseInfos.rollbackCounts?.cam || 0);
        const rollbackCountFromMachining = Number(
          caseInfos.rollbackCounts?.machining || 0,
        );
        const canRollback =
          stageForRollback === "추적관리" ||
          stageForRollback !== "의뢰" ||
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
        const rollbackCountForStage = Number(
          caseInfos.rollbackCounts?.[reviewStageKey] || 0,
        );

        // packing 단계에서는 각인 이미지가 있어야 승인 가능
        const hasEngravingImage =
          reviewStageKey === "packing"
            ? !!(
                caseInfos.stageFiles?.packing?.s3Url ||
                caseInfos.stageFiles?.packing?.filePath
              )
            : true;

        const requestStageRollbackExists =
          Number(caseInfos.rollbackCounts?.request || 0) > 0 ||
          Number(caseInfos.rollbackCounts?.cam || 0) > 0 ||
          Number(caseInfos.rollbackCounts?.machining || 0) > 0;

        const canApproveFromRollback =
          hasEngravingImage &&
          (rollbackCountForStage > 0 ||
            (isCamStage && Number(caseInfos.rollbackCounts?.cam || 0) > 0) ||
            (reviewStageKey === "packing" &&
              Number(caseInfos.rollbackCounts?.shipping || 0) > 0) ||
            (reviewStageKey === "cam" &&
              Number(caseInfos.rollbackCounts?.machining || 0) > 0) ||
            (reviewStageKey === "request" && requestStageRollbackExists));

        const lotBadgeClass = (() => {
          const s = String(stageForRollback || "").trim();
          const base =
            "text-[11px] px-2 py-0.5 font-semibold leading-[1.1] border";
          if (s === "CAM") {
            return `${base} bg-indigo-50 text-indigo-700 border-indigo-200`;
          }
          if (s === "가공") {
            return `${base} bg-blue-50 text-blue-700 border-blue-200`;
          }
          if (s === "세척.포장" || s === "세척.패킹") {
            return `${base} bg-emerald-50 text-emerald-700 border-emerald-200`;
          }
          if (s === "발송" || s === "포장.발송") {
            return `${base} bg-amber-50 text-amber-700 border-amber-200`;
          }
          if (s === "추적관리") {
            return `${base} bg-slate-50 text-slate-700 border-slate-200`;
          }
          return `${base} bg-slate-50 text-slate-700 border-slate-200`;
        })();

        const stageBadge = (() => {
          const s = String(stageForRollback || "").trim();
          const base =
            "text-[11px] px-2 py-0.5 font-extrabold leading-[1.1] border";
          if (s === "CAM") {
            return (
              <Badge
                variant="outline"
                className={`${base} bg-indigo-50 text-indigo-700 border-indigo-200`}
              >
                CAM
              </Badge>
            );
          }
          if (s === "가공") {
            return (
              <Badge
                variant="outline"
                className={`${base} bg-blue-50 text-blue-700 border-blue-200`}
              >
                가공
              </Badge>
            );
          }
          if (s === "세척.포장" || s === "세척.패킹") {
            return (
              <Badge
                variant="outline"
                className={`${base} bg-emerald-50 text-emerald-700 border-emerald-200`}
              >
                세척·패킹
              </Badge>
            );
          }
          if (s === "발송" || s === "포장.발송") {
            return (
              <Badge
                variant="outline"
                className={`${base} bg-amber-50 text-amber-700 border-amber-200`}
              >
                포장·발송
              </Badge>
            );
          }
          if (s === "추적관리") {
            return (
              <Badge
                variant="outline"
                className={`${base} bg-slate-50 text-slate-700 border-slate-200`}
              >
                추적관리
              </Badge>
            );
          }
          return (
            <Badge
              variant="outline"
              className={`${base} bg-slate-50 text-slate-700 border-slate-200`}
            >
              {s || "의뢰"}
            </Badge>
          );
        })();

        const machiningElapsedLabel = (() => {
          if (!isMachiningStage) return "";
          const secRaw = (request as any)?.productionSchedule?.machiningProgress
            ?.elapsedSeconds;
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
        const camDiameter = camMaterialDiameter;

        const sp = request.shippingPriority;
        const urgency = String(sp?.level || "").trim();
        const urgencyClass = (() => {
          if (isCompletedForCurrentStage) return "";
          if (urgency === "danger") {
            return "border-rose-500 border-2";
          }
          if (urgency === "warning") {
            return "border-amber-500 border-2";
          }
          return "";
        })();

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
          onToggleSelected?.(request);
        };

        const handleOpenCardPreview = (e: React.MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenPreview(request);
        };

        return (
          <Card
            key={request._id}
            onClick={onToggleSelected ? handleToggleSelected : undefined}
            className={`relative h-full border ${
              isSelected
                ? "border-blue-500 bg-blue-50/40"
                : isCompletedForCurrentStage
                  ? "border-emerald-500 bg-emerald-50/30"
                  : "border-slate-200"
            } ${onToggleSelected ? "cursor-pointer" : ""}`}
            role={onToggleSelected ? "button" : undefined}
            aria-pressed={onToggleSelected ? isSelected : undefined}
          >
            <div className="absolute right-2 top-2 z-20 flex gap-1">
              {onRollback && canRollback && (
                <button
                  type="button"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md border bg-white/90 text-slate-600 shadow-sm transition hover:bg-slate-50"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRollback(request);
                  }}
                  aria-label="롤백"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              {onApprove && !isCompletedForCurrentStage && (
                <button
                  type="button"
                  className={`h-7 w-7 inline-flex items-center justify-center rounded-md border bg-white/90 text-slate-600 shadow-sm transition hover:bg-slate-50 ${
                    canApproveFromRollback
                      ? ""
                      : "opacity-40 cursor-not-allowed"
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!canApproveFromRollback) return;
                    onApprove(request);
                  }}
                  aria-label="승인"
                  title={
                    !hasEngravingImage
                      ? "각인 이미지가 필요합니다"
                      : canApproveFromRollback
                        ? "승인"
                        : "롤백 이력이 있을 때만 승인 가능"
                  }
                  disabled={!canApproveFromRollback}
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
            {isUploading && progress !== undefined && (
              <div className="absolute inset-0 z-10 bg-white/80 flex flex-col items-center justify-center p-4 rounded-xl">
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-2">
                  <div
                    className="bg-blue-500 h-full transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-blue-600">
                  {progress}% 업로드 중...
                </span>
              </div>
            )}
            <CardContent
              className={`relative z-10 p-3 flex-1 flex flex-col gap-2 ${
                isNewSystemRequest ? "bg-emerald-50/40" : ""
              }`}
            >
              <div
                className="space-y-2 text-[15px] text-slate-700 rounded-xl p-3 transition"
                onClick={handleOpenCardPreview}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {stageBadge}
                    {shouldShowFullLot && (
                      <Badge variant="outline" className={lotBadgeClass}>
                        {lotCodeSource}
                      </Badge>
                    )}
                    {isNewSystemRequest && (
                      <Badge
                        variant="outline"
                        className="border-emerald-400 text-emerald-700 bg-emerald-50"
                      >
                        신규 임플란트
                      </Badge>
                    )}
                  </div>
                </div>
                {request.referenceIds && request.referenceIds.length > 0 && (
                  <div className="mb-1">
                    {(() => {
                      const first = request.referenceIds![0];
                      const extraCount = request.referenceIds!.length - 1;
                      const label =
                        extraCount > 0 ? `${first} 외 ${extraCount}건` : first;
                      return (
                        <span className="inline-flex items-center px-3 py-1 rounded text-[15px] font-medium bg-purple-50 text-purple-700 border border-purple-100">
                          Ref: {label}
                        </span>
                      );
                    })()}
                  </div>
                )}
                {(() => {
                  if (!realtimeBadge && !realtimeElapsedLabel) return null;
                  return (
                    <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
                      {realtimeBadge ? (
                        <Badge
                          variant="outline"
                          className={`text-[11px] px-2 py-0.5 font-extrabold leading-[1.1] ${realtimeToneClass}`}
                        >
                          {realtimeBadge}
                        </Badge>
                      ) : null}
                      {realtimeElapsedLabel ? (
                        <span className="tabular-nums font-bold text-blue-600">
                          {realtimeElapsedLabel}
                        </span>
                      ) : null}
                    </div>
                  );
                })()}
                {!!machiningElapsedLabel && (
                  <div className="flex items-center gap-2 text-[12px] text-slate-500">
                    <span className="font-semibold text-blue-600">
                      Now Playing
                    </span>
                    <span className="tabular-nums font-bold text-blue-600">
                      {machiningElapsedLabel}
                    </span>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
                  <span>
                    {request.requestor?.organization || request.requestor?.name}
                  </span>
                  {caseInfos.clinicName && (
                    <>
                      <span>•</span>
                      <span>{caseInfos.clinicName}</span>
                    </>
                  )}
                  {request.createdAt && (
                    <>
                      <span>•</span>
                      <span>
                        {new Date(request.createdAt).toLocaleDateString()}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
                  <span>
                    치과: {caseInfos.clinicName || "-"} /{" "}
                    {caseInfos.patientName || "미지정"} /{" "}
                    {caseInfos.tooth || "-"}
                  </span>
                  {caseInfos.connectionDiameter && (
                    <>
                      <span>•</span>
                      <span>
                        커넥션 직경 {caseInfos.connectionDiameter.toFixed(2)}
                      </span>
                    </>
                  )}
                </div>
                {(maxDiameter != null ||
                  (showCamDiameter && camDiameter != null)) && (
                  <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
                    {maxDiameter != null && (
                      <span>최대 직경 {maxDiameter.toFixed(3)}</span>
                    )}
                    {maxDiameter != null &&
                      showCamDiameter &&
                      camDiameter != null && <span>•</span>}
                    {showCamDiameter && camDiameter != null && (
                      <span>CAM 직경 {camDiameter.toFixed(3)}</span>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-1 text-[12px] text-slate-500">
                  <div className="flex items-center gap-1">
                    <span>{formatImplantDisplay(caseInfos as any)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {sp?.label &&
                      (urgency === "danger" || urgency === "warning") && (
                        <Badge
                          variant="outline"
                          className={`text-[11px] px-2 py-0.5 font-semibold leading-[1.1] ${
                            urgency === "danger"
                              ? "bg-white text-rose-700 border-rose-500"
                              : "bg-white text-amber-700 border-amber-500"
                          }`}
                        >
                          {sp.label}
                        </Badge>
                      )}
                  </div>
                </div>
                {/* 백그라운드 작업 실패 시 안내 메시지 */}
                {((isCamStage &&
                  request.caseInfos?.reviewByStage?.cam?.status ===
                    "REJECTED") ||
                  (isMachiningStage &&
                    request.caseInfos?.reviewByStage?.machining?.status ===
                      "REJECTED")) && (
                  <div className="mt-2 p-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600 flex flex-col gap-1">
                    <div className="font-bold">⚠️ 백그라운드 작업 실패</div>
                    <div>
                      {isCamStage
                        ? "Rhino/ESPRIT 작업 중 오류가 발생했습니다. 파일을 확인 후 수동으로 업로드해주세요."
                        : "가공 명령 전송 중 오류가 발생했습니다. 장비 상태 확인 후 수동으로 조치해주세요."}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
            {onToggleSelected ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleToggleSelected(e);
                }}
                className={`absolute right-3 bottom-3 z-20 h-7 w-7 rounded-full border flex items-center justify-center text-sm font-semibold transition ${
                  isSelected
                    ? "bg-blue-500 border-blue-500 text-white"
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
          </Card>
        );
      })}
    </div>
  );
};
