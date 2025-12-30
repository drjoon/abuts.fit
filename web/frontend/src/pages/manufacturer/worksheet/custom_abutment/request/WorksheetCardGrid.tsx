import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import {
  type ManufacturerRequest,
  computeStageLabel,
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
  onUploadNc?: (req: ManufacturerRequest, files: File[]) => Promise<void>;
  uploadProgress: Record<string, number>;
  isCamStage: boolean;
  isMachiningStage: boolean;
  uploading: Record<string, boolean>;
  downloading: Record<string, boolean>;
  deletingCam: Record<string, boolean>;
  deletingNc: Record<string, boolean>;
  currentStageOrder: number;
};

export const WorksheetCardGrid = ({
  requests,
  onDownload,
  onOpenPreview,
  onDeleteCam,
  onDeleteNc,
  onRollback,
  onUploadNc,
  uploadProgress,
  uploading,
  downloading,
  deletingCam,
  deletingNc,
  isCamStage,
  isMachiningStage,
  currentStageOrder,
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
        ? "생산"
        : isCamStage
        ? "CAM"
        : "의뢰";
      const stageLabel = computeStageLabel(request, {
        isCamStage,
        isMachiningStage,
      });
      const accept = getAcceptByStage(stageLabel || currentStageForTab);
      const formatCamDisplayName = (name: string) => {
        if (!name) return "파일명 없음";
        if (isCamStage) {
          return name
            .replace(/\.cam\.stl$/i, ".cam")
            .replace(/\.stl$/i, ".cam");
        }
        return name;
      };
      const displayFileName = isMachiningStage
        ? caseInfos.ncFile?.fileName || caseInfos.ncFile?.originalName || ""
        : formatCamDisplayName(
            caseInfos.file?.fileName ||
              caseInfos.file?.originalName ||
              caseInfos.camFile?.fileName ||
              caseInfos.camFile?.originalName ||
              ""
          );

      const hasCamFile = !!(
        caseInfos.camFile?.s3Key ||
        caseInfos.camFile?.fileName ||
        caseInfos.camFile?.originalName
      );
      const isDeletingCam = !!deletingCam[request._id];

      const hasNcFile = !!(
        caseInfos.ncFile?.s3Key ||
        caseInfos.ncFile?.fileName ||
        caseInfos.ncFile?.originalName
      );
      const isDeletingNc = !!deletingNc[request._id];
      const lotNumber = (request.lotNumber || "").trim();
      const progress = uploadProgress[request._id];
      const isUploading = uploading[request._id];
      const requestStageLabel = stageLabel;
      const requestStageOrder = stageOrder[requestStageLabel] ?? 0;
      const isCompletedForCurrentStage = requestStageOrder > currentStageOrder;

      const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!isCamStage || !onUploadNc) return;

        const files = Array.from(e.dataTransfer.files);
        const ncFiles = files.filter((f) =>
          f.name.toLowerCase().endsWith(".nc")
        );

        if (ncFiles.length === 0) return;

        const getBaseName = (name: string) => {
          const s = String(name || "");
          if (!s.includes(".")) return s;
          return s.split(".").slice(0, -1).join(".");
        };

        const camFileName =
          caseInfos.camFile?.fileName || caseInfos.camFile?.originalName || "";
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
          className={`relative shadow-sm hover:shadow-lg transition-all duration-300 h-full flex flex-col border-dashed group/card ${
            isCompletedForCurrentStage
              ? "border-emerald-300 bg-emerald-50/80 shadow-[0_0_0_1px_rgba(16,185,129,0.25)]"
              : "border-slate-200"
          }`}
          onClick={() => onOpenPreview(request)}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          {onRollback && !isCompletedForCurrentStage && (
            <button
              type="button"
              className="absolute right-2 top-2 z-20 hidden h-7 w-7 items-center justify-center rounded-md border bg-white/90 text-slate-600 shadow-sm transition hover:bg-slate-50 group-hover/card:flex"
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
                const bucketIndex = getDiameterBucketIndex(
                  caseInfos.maxDiameter
                );
                const labels = ["6", "8", "10", "10+"];

                return (
                  <div className="space-y-2">
                    <div className="grid grid-cols-5 items-center gap-2">
                      <div className="col-span-4 flex gap-1">
                        {labels.map((label, index) => {
                          const isActive = index === bucketIndex;
                          return (
                            <div
                              key={label}
                              className={`relative flex-1 h-4 rounded-full ${
                                isActive ? "bg-blue-500" : "bg-slate-200"
                              }`}
                            >
                              {isActive && caseInfos.maxDiameter != null && (
                                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white">
                                  {caseInfos.maxDiameter.toFixed(2)}mm
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <Badge
                          variant="outline"
                          className="text-[11px] px-2 py-0.5 bg-slate-50 text-slate-700 border-slate-200"
                        >
                          {stageLabel}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })()}
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
                  {!!request.assignedMachine && (
                    <Badge
                      variant="outline"
                      className="text-[11px] px-2 py-0.5 bg-blue-50 text-blue-700 border-blue-200 font-semibold"
                    >
                      {request.assignedMachine}
                    </Badge>
                  )}
                  {lotNumber && (
                    <Badge
                      variant="outline"
                      className="text-[11px] px-2 py-0.5 bg-slate-50 text-slate-700 border-slate-200"
                    >
                      {lotNumber}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    })}
  </div>
);
