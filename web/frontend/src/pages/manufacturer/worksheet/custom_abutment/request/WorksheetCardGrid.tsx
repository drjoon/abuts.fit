import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  type ManufacturerRequest,
  computeStageLabel,
  deriveStageForFilter,
  getAcceptByStage,
  getDiameterBucketIndex,
  stageOrder,
} from "./utils";

type WorksheetCardGridProps = {
  requests: ManufacturerRequest[];
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
};

export const WorksheetCardGrid = ({
  requests,
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
}: WorksheetCardGridProps) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {requests.map((request) => {
      const caseInfos = request.caseInfos || {};
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
      const lotPart = String(request.lotNumber?.part || "").trim();
      const lotPartDisplay = lotPart.startsWith("CAP")
        ? lotPart.slice(3)
        : lotPart;
      const camMaterialDiameter = request.productionSchedule?.diameter;
      const camMaterialDiameterGroup =
        request.productionSchedule?.diameterGroup;
      const camGroup = (() => {
        const g = String(camMaterialDiameterGroup || "").trim();
        if (g) return g;
        const d = Number(camMaterialDiameter);
        if (!Number.isFinite(d) || d <= 0) return "";
        if (d <= 6) return "6";
        if (d <= 8) return "8";
        if (d <= 10) return "10";
        return "12";
      })();
      const progress = uploadProgress[request._id];
      const isUploading = uploading[request._id];
      const requestStageLabel = stageLabel;
      const requestStageOrder = stageOrder[requestStageLabel] ?? 0;
      const isCompletedForCurrentStage = requestStageOrder > currentStageOrder;

      const stageForRollback = deriveStageForFilter(request);
      const canRollback =
        stageForRollback !== "의뢰" && stageForRollback !== "추적관리";

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
        if (s === "세척.포장") {
          return (
            <Badge
              variant="outline"
              className={`${base} bg-emerald-50 text-emerald-700 border-emerald-200`}
            >
              세척·포장
            </Badge>
          );
        }
        if (s === "발송") {
          return (
            <Badge
              variant="outline"
              className={`${base} bg-amber-50 text-amber-700 border-amber-200`}
            >
              발송
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
        const sec = Number.isFinite(Number(secRaw))
          ? Math.max(0, Math.floor(Number(secRaw)))
          : null;
        if (sec == null) return "";
        const mm = String(Math.floor(sec / 60)).padStart(2, "0");
        const ss = String(sec % 60).padStart(2, "0");
        return `${mm}:${ss}`;
      })();

      const maxDiameter =
        typeof caseInfos.maxDiameter === "number" &&
        Number.isFinite(caseInfos.maxDiameter) &&
        caseInfos.maxDiameter > 0
          ? caseInfos.maxDiameter
          : null;
      const camDiameter =
        typeof camMaterialDiameter === "number" &&
        Number.isFinite(camMaterialDiameter) &&
        camMaterialDiameter > 0
          ? camMaterialDiameter
          : null;

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
          caseInfos.camFile?.filePath || caseInfos.camFile?.originalName || "";
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

      return (
        <Card
          key={request._id}
          className={`relative shadow-sm hover:shadow-lg transition-all duration-300 h-full flex flex-col border-solid group/card ${
            isCompletedForCurrentStage
              ? "border-emerald-500 border-2"
              : urgencyClass || "border-slate-200"
          }`}
          onClick={() => onOpenPreview(request)}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <div className="absolute right-2 top-2 z-20 hidden gap-1 group-hover/card:flex">
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
            {onApprove &&
              !isCompletedForCurrentStage &&
              tabStage !== "shipping" && (
                <button
                  type="button"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md border bg-white/90 text-slate-600 shadow-sm transition hover:bg-slate-50"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onApprove(request);
                  }}
                  aria-label="승인"
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
          <CardContent className="p-3 flex-1 flex flex-col gap-2">
            <div className="space-y-2 text-[15px] text-slate-700 rounded-xl p-3 transition">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">{stageBadge}</div>
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
                // (의뢰/CAM) 카드 상단의 진행상태 표시/배지는 사용하지 않음
                return null;
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
                <span>환자 {caseInfos.patientName || "미지정"}</span>
                {caseInfos.tooth && (
                  <>
                    <span>•</span>
                    <span>치아번호 {caseInfos.tooth}</span>
                  </>
                )}
                {caseInfos.connectionDiameter && (
                  <>
                    <span>•</span>
                    <span>
                      커넥션 직경 {caseInfos.connectionDiameter.toFixed(2)}
                    </span>
                  </>
                )}
              </div>
              {(maxDiameter != null || camDiameter != null) && (
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
                  {maxDiameter != null && (
                    <span>최대 직경 {maxDiameter.toFixed(3)}</span>
                  )}
                  {maxDiameter != null && camDiameter != null && <span>•</span>}
                  {camDiameter != null && (
                    <span>CAM 직경 {camDiameter.toFixed(3)}</span>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-1 text-[12px] text-slate-500">
                <div className="flex items-center gap-1">
                  {(caseInfos.implantManufacturer ||
                    caseInfos.implantSystem ||
                    caseInfos.implantType) && (
                    <span>
                      {caseInfos.implantManufacturer || "-"} /{" "}
                      {caseInfos.implantSystem || "-"} /{" "}
                      {caseInfos.implantType || "-"}
                    </span>
                  )}
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
                  {lotPartDisplay && (
                    <Badge
                      variant="outline"
                      className="text-[11px] px-2 py-0.5 bg-slate-50 text-slate-700 border-slate-200"
                    >
                      {lotPartDisplay}
                    </Badge>
                  )}
                </div>
              </div>
              {/* 백그라운드 작업 실패 시 안내 메시지 */}
              {((isCamStage &&
                request.caseInfos?.reviewByStage?.cam?.status === "REJECTED") ||
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
        </Card>
      );
    })}
  </div>
);
