import {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
  type DragEvent,
  type ChangeEvent,
} from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  WorksheetDiameterQueueBar,
  type DiameterBucketKey,
} from "@/shared/ui/dashboard/WorksheetDiameterQueueBar";
import {
  WorksheetDiameterQueueModal,
  type WorksheetQueueItem,
} from "@/shared/ui/dashboard/WorksheetDiameterQueueModal";
import type { RequestBase } from "@/types/request";
import { useToast } from "@/hooks/use-toast";
import { useS3TempUpload } from "@/shared/hooks/useS3TempUpload";
import { Badge } from "@/components/ui/badge";
import { FunctionalItemCard } from "@/components/FunctionalItemCard";
import { StlPreviewViewer } from "@/components/StlPreviewViewer";
import { getFileBlob, setFileBlob } from "@/utils/stlIndexedDb";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type ManufacturerRequest = RequestBase & {
  status1?: string;
  status2?: string;
  referenceIds?: string[];
};

type FilePreviewInfo = {
  originalName: string;
  url: string;
};

type PreviewFiles = {
  original?: File | null;
  cam?: File | null;
  title?: string;
  request?: ManufacturerRequest | null;
};

const getDiameterBucketIndex = (diameter?: number) => {
  if (diameter == null) return -1;
  if (diameter <= 6) return 0;
  if (diameter <= 8) return 1;
  if (diameter <= 10) return 2;
  return 3;
};

const computeStageLabel = (
  req: ManufacturerRequest,
  opts?: { isCamStage?: boolean; isMachiningStage?: boolean }
) => {
  // 서버에 저장된 manufacturerStage만 사용 (백엔드에서 확정)
  const savedStage = (req.manufacturerStage || "").trim();
  if (savedStage) return savedStage;
  // 혹시 누락 시 최소한의 폴백
  if (opts?.isMachiningStage) return "가공";
  if (opts?.isCamStage) return "CAM";
  return "의뢰";
};

const deriveStageForFilter = (req: ManufacturerRequest) => {
  const saved = (req.manufacturerStage || "").trim();
  if (saved) return saved;
  const s1 = (req.status1 || "").trim();
  const s2 = (req.status2 || "").trim();
  const main = (req.status || "").trim();

  if (s1 === "가공") {
    if (s2 === "후") return "CAM";
    return "가공";
  }
  if (s1 === "세척/검사/포장") return "세척·검사·포장";
  if (s1 === "배송") return "발송";
  if (s1 === "완료") return "추적관리";
  if (main === "가공후") return "CAM";
  return "의뢰";
};

const stageOrder: Record<string, number> = {
  의뢰: 0,
  CAM: 1,
  가공: 2,
  "세척·검사·포장": 3,
  발송: 4,
  추적관리: 5,
};

const getAcceptByStage = (stage: string) => {
  switch (stage) {
    case "의뢰":
      return ".stl";
    case "CAM":
      return ".cam.stl";
    case "가공":
      return ".png,.jpg,.jpeg,.webp,.bmp";
    case "세척·검사·포장":
    case "발송":
    case "추적관리":
      return ".png,.jpg,.jpeg,.webp,.bmp";
    default:
      return ".stl";
  }
};

const WorksheetCardGrid = ({
  requests,
  onDownload,
  onUpload,
  onOpenPreview,
  onDeleteCam,
  onDeleteNc,
  downloading,
  uploading,
  deletingCam,
  deletingNc,
  isCamStage,
  isMachiningStage,
}: {
  requests: ManufacturerRequest[];
  onDownload: (req: ManufacturerRequest) => void;
  onUpload: (req: ManufacturerRequest, files: File[]) => void;
  onOpenPreview: (req: ManufacturerRequest) => void;
  onDeleteCam: (req: ManufacturerRequest) => void;
  onDeleteNc: (req: ManufacturerRequest) => void;
  isCamStage: boolean;
  isMachiningStage: boolean;
  downloading: Record<string, boolean>;
  uploading: Record<string, boolean>;
  deletingCam: Record<string, boolean>;
  deletingNc: Record<string, boolean>;
}) => (
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
      const isUploading = !!uploading[request._id];

      const handleDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const files = Array.from(e.dataTransfer.files || []);
        if (files.length > 0) {
          onUpload(request, files);
        }
      };

      const handleSelectFiles = (e: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0) {
          onUpload(request, files);
        }
      };

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
      return (
        <Card
          key={request._id}
          className="shadow-sm hover:shadow-lg transition-all duration-300 h-full flex flex-col border-dashed border-slate-200"
          onClick={() => onOpenPreview(request)}
        >
          <CardContent className="p-3 flex-1 flex flex-col gap-2">
            <div
              className="space-y-2 text-[15px] text-slate-700 border-2 border-dashed border-transparent hover:border-blue-200 rounded-xl p-3 transition"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={handleDrop}
            >
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

                const badgeLabel = displayFileName;

                return (
                  <div className="space-y-2">
                    <div>
                      {isMachiningStage ? (
                        <FunctionalItemCard
                          onRemove={() => onDeleteNc(request)}
                          confirmTitle="NC 파일을 삭제할까요?"
                          confirmDescription={
                            "삭제 시 CAM 단계로 되돌아가며 CAM 탭으로 다시 이동합니다."
                          }
                          confirmLabel="삭제"
                          cancelLabel="취소"
                          disabled={isDeletingNc}
                          className="border-0 bg-transparent hover:shadow-none"
                        >
                          <div className="text-xs font-semibold text-blue-700 pr-8">
                            {badgeLabel}
                          </div>
                        </FunctionalItemCard>
                      ) : isCamStage && hasCamFile ? (
                        <FunctionalItemCard
                          onRemove={() => onDeleteCam(request)}
                          confirmTitle="CAM 수정본을 삭제할까요?"
                          confirmDescription={
                            "삭제 시 상태가 가공전으로 돌아가며 의뢰 탭으로 다시 이동합니다."
                          }
                          confirmLabel="삭제"
                          cancelLabel="취소"
                          disabled={isDeletingCam}
                          className="border-0 bg-transparent hover:shadow-none"
                        >
                          <div className="text-xs font-semibold text-blue-700 pr-8">
                            {badgeLabel}
                          </div>
                        </FunctionalItemCard>
                      ) : (
                        <div className="text-xs font-semibold text-blue-700">
                          {badgeLabel}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-[13px] min-w-[104px] hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDownload(request);
                        }}
                        disabled={isDownloading}
                      >
                        {isDownloading ? "다운로드중..." : "다운로드"}
                      </Button>
                      <label
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center justify-center min-w-[104px] px-3 py-1.5 rounded-md border border-slate-200 bg-white text-[13px] font-medium text-slate-700 cursor-pointer hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700 transition"
                      >
                        {isUploading ? "업로드 중..." : "업로드"}
                        <input
                          type="file"
                          accept={accept}
                          className="hidden"
                          onChange={(e) => {
                            e.stopPropagation();
                          }}
                          disabled={isUploading}
                        />
                      </label>
                      <div className="ml-auto">
                        <Badge
                          variant="outline"
                          className="text-[11px] px-2 py-0.5 bg-slate-50 text-slate-700 border-slate-200"
                        >
                          {stageLabel}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 flex gap-1">
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
              <div className="flex flex-wrap items-center gap-1 text-[12px] text-slate-500">
                {(caseInfos.implantManufacturer ||
                  caseInfos.implantSystem ||
                  caseInfos.implantType) && (
                  <span>
                    임플란트 {caseInfos.implantManufacturer || "-"} /{" "}
                    {caseInfos.implantSystem || "-"} /{" "}
                    {caseInfos.implantType || "-"}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      );
    })}
  </div>
);

export const RequestPage = ({
  showQueueBar = true,
  filterRequests,
}: {
  showQueueBar?: boolean;
  filterRequests?: (req: ManufacturerRequest) => boolean;
}) => {
  const { user, token } = useAuthStore();
  const { worksheetSearch, showCompleted } = useOutletContext<{
    worksheetSearch: string;
    showCompleted: boolean;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const isCamStage = (searchParams.get("stage") || "request") === "cam";
  const isMachiningStage =
    (searchParams.get("stage") || "request") === "machining";

  const [requests, setRequests] = useState<ManufacturerRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [receiveQueueModalOpen, setReceiveQueueModalOpen] = useState(false);
  const [receiveSelectedBucket, setReceiveSelectedBucket] =
    useState<DiameterBucketKey | null>(null);
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFiles, setPreviewFiles] = useState<PreviewFiles>({});
  const [previewNcText, setPreviewNcText] = useState<string>("");
  const [previewNcName, setPreviewNcName] = useState<string>("");
  const [deletingCam, setDeletingCam] = useState<Record<string, boolean>>({});
  const [deletingNc, setDeletingNc] = useState<Record<string, boolean>>({});
  const [visibleCount, setVisibleCount] = useState(9);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const decodeNcText = useCallback((buffer: ArrayBuffer) => {
    // 우선 UTF-8 시도 후 깨진 경우 EUC-KR로 재시도
    const utf8Decoder = new TextDecoder("utf-8", { fatal: false });
    const utf8Text = utf8Decoder.decode(buffer);
    if (!utf8Text.includes("\uFFFD")) return utf8Text;
    try {
      const eucKrDecoder = new TextDecoder("euc-kr", { fatal: false });
      return eucKrDecoder.decode(buffer);
    } catch {
      return utf8Text;
    }
  }, []);
  const { toast } = useToast();
  const { uploadFiles } = useS3TempUpload({ token });

  const fetchRequests = useCallback(async () => {
    if (!token) return;

    try {
      setIsLoading(true);
      const url =
        user?.role === "admin" ? "/api/admin/requests" : "/api/requests";
      const params = new URLSearchParams();
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        toast({
          title: "의뢰 불러오기 실패",
          description: "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }

      const data = await res.json();
      const raw = data?.data;
      const list = Array.isArray(raw?.requests)
        ? raw.requests
        : Array.isArray(raw)
        ? raw
        : [];
      // DB 메타 확인용 로그
      if (list.length) {
        console.groupCollapsed("[request files] 목록");
        list.forEach((req: ManufacturerRequest) => {
          console.log(req._id, {
            file: req.caseInfos?.file,
            camFile: req.caseInfos?.camFile,
            ncFile: req.caseInfos?.ncFile,
            status: req.status,
            status1: req.status1,
            status2: req.status2,
          });
        });
        console.groupEnd();
      }
      if (data.success && Array.isArray(raw?.requests)) {
        setRequests(raw.requests);
      }
    } catch (error) {
      console.error("Error fetching requests:", error);
      toast({
        title: "의뢰 불러오기 실패",
        description: "네트워크 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [token, user?.role, toast]);

  const handleDownloadOriginal = useCallback(
    async (req: ManufacturerRequest) => {
      if (!token) return;
      setDownloading((prev) => ({ ...prev, [req._id]: true }));
      try {
        const endpoint = isMachiningStage
          ? `/api/requests/${req._id}/nc-file-url`
          : isCamStage
          ? `/api/requests/${req._id}/cam-file-url`
          : `/api/requests/${req._id}/original-file-url`;

        const res = await fetch(endpoint, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) {
          throw new Error("download url failed");
        }
        const data = await res.json();
        const url = data?.data?.url;
        if (url) {
          window.open(url, "_blank");
        } else {
          throw new Error("no url");
        }
      } catch (error) {
        toast({
          title: "다운로드 실패",
          description: isMachiningStage
            ? "NC 파일을 가져올 수 없습니다."
            : isCamStage
            ? "CAM STL을 가져올 수 없습니다."
            : "원본 STL을 가져올 수 없습니다.",
          variant: "destructive",
        });
      } finally {
        setDownloading((prev) => ({ ...prev, [req._id]: false }));
      }
    },
    [token, toast, isCamStage, isMachiningStage]
  );

  const handleDeleteCam = useCallback(
    async (req: ManufacturerRequest) => {
      if (!token) return;
      setDeletingCam((prev) => ({ ...prev, [req._id]: true }));
      try {
        const res = await fetch(`/api/requests/${req._id}/cam-file`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) {
          throw new Error("delete cam file failed");
        }
        toast({
          title: "삭제 완료",
          description: "CAM 수정본을 삭제하고 상태를 가공전으로 되돌렸습니다.",
        });
        await fetchRequests();
        // 의뢰 탭으로 이동하고 모달/프리뷰 초기화
        setPreviewOpen(false);
        setPreviewFiles({});
        setPreviewNcText("");
        setPreviewNcName("");
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set("stage", "receive");
            return next;
          },
          { replace: true }
        );
      } catch (error) {
        toast({
          title: "삭제 실패",
          description: "CAM 수정본 삭제에 실패했습니다.",
          variant: "destructive",
        });
      } finally {
        setDeletingCam((prev) => ({ ...prev, [req._id]: false }));
      }
    },
    [token, toast, fetchRequests]
  );

  const handleDeleteNc = useCallback(
    async (req: ManufacturerRequest) => {
      if (!token) return;
      setDeletingNc((prev) => ({ ...prev, [req._id]: true }));
      try {
        const res = await fetch(`/api/requests/${req._id}/nc-file`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) {
          throw new Error("delete nc file failed");
        }
        toast({
          title: "삭제 완료",
          description: "NC 파일을 삭제하고 CAM 단계로 되돌렸습니다.",
        });
        await fetchRequests();
        // CAM 탭으로 이동하고 모달/프리뷰 초기화
        setPreviewOpen(false);
        setPreviewFiles({});
        setPreviewNcText("");
        setPreviewNcName("");
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set("stage", "cam");
            return next;
          },
          { replace: true }
        );
      } catch (error) {
        toast({
          title: "삭제 실패",
          description: "NC 파일 삭제에 실패했습니다.",
          variant: "destructive",
        });
      } finally {
        setDeletingNc((prev) => ({ ...prev, [req._id]: false }));
      }
    },
    [token, toast, fetchRequests]
  );

  const handleUploadCam = useCallback(
    async (req: ManufacturerRequest, files: File[]) => {
      if (!token) return;
      const normalize = (name: string) =>
        name.trim().toLowerCase().normalize("NFC");
      const originalName =
        req.caseInfos?.file?.fileName ||
        req.caseInfos?.file?.originalName ||
        req.caseInfos?.camFile?.fileName ||
        req.caseInfos?.camFile?.originalName ||
        "";
      // 원본 확장자(.stl 또는 .cam.stl)가 섞여 있어도 마지막 확장자만 제거
      const originalBase = originalName
        .replace(/(\.cam\.stl|\.stl)$/i, "")
        .trim();
      const expectedCamName = originalBase ? `${originalBase}.cam.stl` : "";

      const filtered = files.filter((f) =>
        f.name.toLowerCase().endsWith(".cam.stl")
      );
      if (!filtered.length) {
        toast({
          title: "업로드 실패",
          description: "CAM 파일(.cam.stl)만 업로드할 수 있습니다.",
          variant: "destructive",
        });
        return;
      }
      if (expectedCamName) {
        const mismatch = filtered.some(
          (f) => normalize(f.name) !== normalize(expectedCamName)
        );
        if (mismatch) {
          toast({
            title: "파일명 불일치",
            description: `CAM 파일명은 ${expectedCamName} 으로 업로드해주세요.`,
            variant: "destructive",
          });
          return;
        }
      }

      setUploading((prev) => ({ ...prev, [req._id]: true }));
      try {
        const uploaded = await uploadFiles(filtered);
        if (!uploaded || !uploaded.length) {
          throw new Error("upload failed");
        }
        const first = uploaded[0];
        const res = await fetch(`/api/requests/${req._id}/cam-file`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileName: expectedCamName || first.originalName,
            fileType: first.mimetype,
            fileSize: first.size,
            s3Key: first.key,
            s3Url: first.location,
          }),
        });
        if (!res.ok) {
          throw new Error("save cam file failed");
        }
        toast({
          title: "업로드 완료",
          description: "CAM 결과가 저장되고 상태가 가공후로 변경되었습니다.",
        });
        await fetchRequests();
      } catch (error) {
        console.error(error);
        toast({
          title: "업로드 실패",
          description: "파일 업로드 또는 저장에 실패했습니다.",
          variant: "destructive",
        });
      } finally {
        setUploading((prev) => ({ ...prev, [req._id]: false }));
      }
    },
    [token, uploadFiles, toast, fetchRequests]
  );

  const handleUploadNc = useCallback(
    async (req: ManufacturerRequest, files: File[]) => {
      if (!token) return;

      const normalize = (name: string) =>
        String(name || "")
          .trim()
          .toLowerCase()
          .normalize("NFC");

      const originalName =
        req.caseInfos?.file?.fileName ||
        req.caseInfos?.file?.originalName ||
        "";
      const base = originalName.includes(".")
        ? originalName.split(".").slice(0, -1).join(".")
        : originalName;
      const expectedNcName = base ? `${base}.nc` : "";

      const filtered = files.filter((f) =>
        f.name.toLowerCase().endsWith(".nc")
      );
      if (!filtered.length) {
        toast({
          title: "업로드 실패",
          description: "NC(.nc) 파일만 업로드할 수 있습니다.",
          variant: "destructive",
        });
        return;
      }

      const firstLocal = filtered[0];
      if (
        expectedNcName &&
        normalize(firstLocal.name) !== normalize(expectedNcName)
      ) {
        toast({
          title: "파일명 불일치",
          description: `원본과 동일한 파일명(${expectedNcName})으로 업로드해주세요.`,
          variant: "destructive",
        });
        return;
      }

      setUploading((prev) => ({ ...prev, [req._id]: true }));
      try {
        const uploaded = await uploadFiles([firstLocal]);
        if (!uploaded || !uploaded.length) {
          throw new Error("upload failed");
        }
        const first = uploaded[0];
        const res = await fetch(`/api/requests/${req._id}/nc-file`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileName: expectedNcName || first.originalName,
            fileType: first.mimetype,
            fileSize: first.size,
            s3Key: first.key,
            s3Url: first.location,
          }),
        });
        if (!res.ok) {
          throw new Error("save nc file failed");
        }
        toast({
          title: "업로드 완료",
          description: "CAM 수정본을 업로드했습니다.",
        });
        await fetchRequests();
        // CAM 탭으로 이동하고 모달/프리뷰 초기화
        setPreviewOpen(false);
        setPreviewFiles({});
        setPreviewNcText("");
        setPreviewNcName("");
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set("stage", "cam");
            return next;
          },
          { replace: true }
        );
      } catch (error) {
        console.error(error);
        toast({
          title: "업로드 실패",
          description: "CAM 수정본 업로드에 실패했습니다.",
          variant: "destructive",
        });
      } finally {
        setUploading((prev) => ({ ...prev, [req._id]: false }));
      }
    },
    [token, uploadFiles, toast, fetchRequests, setSearchParams]
  );

  const handleUploadByStage = useCallback(
    (req: ManufacturerRequest, files: File[]) => {
      if (isCamStage) return handleUploadNc(req, files);
      return handleUploadCam(req, files);
    },
    [isCamStage, handleUploadNc, handleUploadCam]
  );

  const handleOpenPreview = useCallback(
    async (req: ManufacturerRequest) => {
      if (!token) return;
      try {
        setPreviewLoading(true);
        setPreviewNcText("");
        setPreviewNcName("");
        toast({
          title: "다운로드 중...",
          description: "STL을 불러오고 있습니다.",
          duration: 60000,
        });

        const blobToFile = (blob: Blob, filename: string) =>
          new File([blob], filename, {
            type: blob.type || "model/stl",
          });

        const fetchAsFileWithCache = async (
          cacheKey: string | null,
          signedUrl: string,
          filename: string
        ) => {
          if (cacheKey) {
            const cached = await getFileBlob(cacheKey);
            if (cached) {
              return blobToFile(cached, filename);
            }
          }

          const r = await fetch(signedUrl);
          if (!r.ok) throw new Error("file fetch failed");
          const blob = await r.blob();

          if (cacheKey) {
            try {
              await setFileBlob(cacheKey, blob);
            } catch {
              // ignore cache write errors
            }
          }

          return blobToFile(blob, filename);
        };

        const title =
          req.caseInfos?.patientName ||
          req.requestor?.organization ||
          req.requestor?.name ||
          "파일 미리보기";

        const originalName =
          req.caseInfos?.file?.fileName ||
          req.caseInfos?.file?.originalName ||
          "original.stl";

        const originalCacheKey = req.caseInfos?.file?.s3Key || null;

        const originalUrlRes = await fetch(
          `/api/requests/${req._id}/original-file-url`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!originalUrlRes.ok) throw new Error("original url failed");
        const originalUrlBody = await originalUrlRes.json();
        const originalSignedUrl = originalUrlBody?.data?.url;
        if (!originalSignedUrl) throw new Error("no original url");

        const originalFile = await fetchAsFileWithCache(
          originalCacheKey,
          originalSignedUrl,
          originalName
        );

        let camFile: File | null = null;
        const hasCamFile = !!(
          req.caseInfos?.camFile?.s3Key ||
          req.caseInfos?.camFile?.fileName ||
          req.caseInfos?.camFile?.originalName
        );

        if ((isCamStage || isMachiningStage) && hasCamFile) {
          const camName =
            req.caseInfos?.camFile?.fileName ||
            req.caseInfos?.camFile?.originalName ||
            originalName;

          const camCacheKey = req.caseInfos?.camFile?.s3Key || null;
          const camUrlRes = await fetch(
            `/api/requests/${req._id}/cam-file-url`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          if (camUrlRes.ok) {
            const camUrlBody = await camUrlRes.json();
            const camSignedUrl = camUrlBody?.data?.url;
            if (camSignedUrl) {
              camFile = await fetchAsFileWithCache(
                camCacheKey,
                camSignedUrl,
                camName
              );
            }
          }
        }

        if (isMachiningStage) {
          const ncMeta = req.caseInfos?.ncFile;
          if (!ncMeta?.s3Key) {
            toast({
              title: "NC 파일 정보가 없습니다.",
              description:
                "CAM 탭에서 NC 파일을 업로드한 뒤 다시 시도해주세요.",
              variant: "destructive",
            });
            setPreviewLoading(false);
            return;
          }
          const ncUrlRes = await fetch(`/api/requests/${req._id}/nc-file-url`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (ncUrlRes.ok) {
            const ncUrlBody = await ncUrlRes.json();
            const ncSignedUrl = ncUrlBody?.data?.url;
            if (ncSignedUrl) {
              const ncName =
                ncMeta?.fileName || ncMeta?.originalName || "program.nc";
              const r = await fetch(ncSignedUrl);
              if (r.ok) {
                const buf = await r.arrayBuffer();
                const text = decodeNcText(buf);
                setPreviewNcText(text);
                setPreviewNcName(ncName);
              } else {
                toast({
                  title: "NC 파일을 불러올 수 없습니다.",
                  description: "파일이 삭제되었거나 경로가 잘못되었습니다.",
                  variant: "destructive",
                });
              }
            } else {
              toast({
                title: "NC URL 생성 실패",
                description: "NC 파일 다운로드 URL을 가져오지 못했습니다.",
                variant: "destructive",
              });
            }
          } else {
            toast({
              title: "NC 파일 정보 없음",
              description: "NC 파일이 존재하지 않습니다.",
              variant: "destructive",
            });
          }
        }

        setPreviewFiles({
          original: originalFile,
          cam: camFile,
          title,
          request: req,
        });
        setPreviewOpen(true);
        toast({
          title: "다운로드 완료",
          description: "캐시에서 재사용됩니다.",
          duration: 2000,
        });
      } catch (error) {
        toast({
          title: "미리보기 실패",
          description: "파일을 불러올 수 없습니다.",
          variant: "destructive",
        });
      } finally {
        setPreviewLoading(false);
      }
    },
    [token, toast, isCamStage, isMachiningStage]
  );

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const searchLower = worksheetSearch.toLowerCase();
  const currentStageForTab = isMachiningStage
    ? "가공"
    : isCamStage
    ? "CAM"
    : "의뢰";
  const currentStageOrder = stageOrder[currentStageForTab] ?? 0;

  const filteredBase = (() => {
    // 완료포함: 탭 기준 단계 이상 모든 건 포함 (CAM 탭=CAM~추적관리, 가공 탭=가공~추적관리)
    if (showCompleted) {
      return requests.filter((req) => {
        const stage = deriveStageForFilter(req);
        const order = stageOrder[stage] ?? 0;
        return order >= currentStageOrder;
      });
    }

    const base = filterRequests
      ? requests.filter((req) => {
          try {
            return filterRequests(req);
          } catch {
            return false;
          }
        })
      : requests;

    // 단계별 필터가 있으면 추가 필터 없이 그 결과 사용
    if (filterRequests) return base;

    // 기본(의뢰/CAM) 탭에서는 가공후(완료된 CAM) 제외
    return base.filter((req) => {
      const status = (req.status || "").trim();
      const status1 = (req.status1 || "").trim();
      const status2 = (req.status2 || "").trim();
      const camDone =
        status === "가공후" ||
        status1 === "가공후" ||
        status2 === "가공후" ||
        !!req.caseInfos?.camFile?.s3Key;
      return !camDone;
    });
  })();

  const filteredAndSorted = filteredBase
    .filter((request) => {
      const caseInfos = request.caseInfos || {};
      const text = (
        (request.referenceIds?.join(",") || "") +
        (request.requestor?.organization || "") +
        (request.requestor?.name || "") +
        (caseInfos.clinicName || "") +
        (caseInfos.patientName || "") +
        (request.description || "") +
        (caseInfos.tooth || "") +
        (caseInfos.connectionDiameter || "") +
        (caseInfos.implantSystem || "") +
        (caseInfos.implantType || "")
      ).toLowerCase();
      return text.includes(searchLower);
    })
    .sort((a, b) => (new Date(a.createdAt) < new Date(b.createdAt) ? 1 : -1));

  const paginatedRequests = filteredAndSorted.slice(0, visibleCount);

  const loadMore = useCallback(() => {
    setVisibleCount((prev) =>
      Math.min(prev + 9, filteredAndSorted.length || 0)
    );
  }, [filteredAndSorted.length]);

  useEffect(() => {
    setVisibleCount(Math.min(9, filteredAndSorted.length));
  }, [
    filteredAndSorted.length,
    worksheetSearch,
    showCompleted,
    isCamStage,
    isMachiningStage,
  ]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore();
        }
      },
      { root: null, threshold: 1 }
    );
    observer.observe(el);
    return () => observer.unobserve(el);
  }, [loadMore]);

  const diameterQueueForReceive = useMemo(() => {
    const labels: DiameterBucketKey[] = ["6", "8", "10", "10+"];
    const counts = labels.map(() => 0);
    const buckets: Record<DiameterBucketKey, WorksheetQueueItem[]> = {
      "6": [],
      "8": [],
      "10": [],
      "10+": [],
    };

    for (const req of filteredAndSorted) {
      const caseInfos = req.caseInfos || {};
      const bucketIndex = getDiameterBucketIndex(caseInfos.maxDiameter);
      const item: WorksheetQueueItem = {
        id: req._id,
        client: req.requestor?.organization || req.requestor?.name || "",
        patient: caseInfos.patientName || "",
        tooth: caseInfos.tooth || "",
        programText: req.description,
        qty: 1, // 기본 1개로 가정
      };

      if (bucketIndex === 0) {
        counts[0]++;
        buckets["6"].push(item);
      } else if (bucketIndex === 1) {
        counts[1]++;
        buckets["8"].push(item);
      } else if (bucketIndex === 2) {
        counts[2]++;
        buckets["10"].push(item);
      } else {
        counts[3]++;
        buckets["10+"].push(item);
      }
    }

    const total = counts.reduce((sum, c) => sum + c, 0);
    return { labels, counts, total, buckets };
  }, [filteredAndSorted]);

  if (isLoading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  const isEmpty = filteredAndSorted.length === 0;

  return (
    <>
      {showQueueBar && (
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
          <div className="text-lg font-semibold text-slate-800 md:whitespace-nowrap">
            진행중인 의뢰 총 {diameterQueueForReceive.total}건
          </div>
          <div className="flex-1">
            <WorksheetDiameterQueueBar
              title=""
              labels={diameterQueueForReceive.labels}
              counts={diameterQueueForReceive.counts}
              total={diameterQueueForReceive.total}
              onBucketClick={(label) => {
                setReceiveSelectedBucket(label);
                setReceiveQueueModalOpen(true);
              }}
            />
          </div>
        </div>
      )}

      <div className="space-y-4 mt-6">
        {isEmpty ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-10 text-center text-slate-500">
            표시할 의뢰가 없습니다.
          </div>
        ) : (
          <WorksheetCardGrid
            requests={paginatedRequests}
            onDownload={handleDownloadOriginal}
            onUpload={handleUploadByStage}
            onOpenPreview={handleOpenPreview}
            onDeleteCam={handleDeleteCam}
            onDeleteNc={handleDeleteNc}
            deletingCam={deletingCam}
            deletingNc={deletingNc}
            isCamStage={isCamStage}
            isMachiningStage={isMachiningStage}
            downloading={downloading}
            uploading={uploading}
          />
        )}
        {!isEmpty && paginatedRequests.length < filteredAndSorted.length && (
          <div ref={sentinelRef} className="h-6 w-full" />
        )}
      </div>

      <WorksheetDiameterQueueModal
        open={receiveQueueModalOpen}
        onOpenChange={setReceiveQueueModalOpen}
        processLabel="커스텀어벗 > 의뢰, CAM"
        queues={diameterQueueForReceive.buckets}
        selectedBucket={receiveSelectedBucket}
        onSelectBucket={setReceiveSelectedBucket}
      />

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogTitle className="sr-only">의뢰 미리보기</DialogTitle>
          <DialogDescription className="sr-only">
            의뢰 파일과 NC 내용을 확인하는 영역입니다.
          </DialogDescription>
          <div className="space-y-4">
            <div className="rounded-lg border p-3 text-sm text-slate-700">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <span className="font-semibold">환자</span>:{" "}
                  {previewFiles.request?.caseInfos?.patientName || "-"}
                </div>
                <div>
                  <span className="font-semibold">치아번호</span>:{" "}
                  {previewFiles.request?.caseInfos?.tooth || "-"}
                </div>
                <div>
                  <span className="font-semibold">치과</span>:{" "}
                  {previewFiles.request?.caseInfos?.clinicName || "-"}
                </div>
                <div>
                  <span className="font-semibold">커넥션 직경</span>:{" "}
                  {previewFiles.request?.caseInfos?.connectionDiameter != null
                    ? previewFiles.request.caseInfos.connectionDiameter.toFixed(
                        2
                      )
                    : "-"}
                </div>
                <div>
                  <span className="font-semibold">임플란트</span>:{" "}
                  {previewFiles.request?.caseInfos?.implantManufacturer || "-"}{" "}
                  / {previewFiles.request?.caseInfos?.implantSystem || "-"} /{" "}
                  {previewFiles.request?.caseInfos?.implantType || "-"}
                </div>
                <div>
                  <span className="font-semibold">최대 직경</span>:{" "}
                  {previewFiles.request?.caseInfos?.maxDiameter != null
                    ? previewFiles.request.caseInfos.maxDiameter.toFixed(2)
                    : "-"}
                </div>
              </div>
            </div>

            {previewLoading ? (
              <div className="rounded-lg border border-dashed p-8 flex flex-col items-center gap-2 text-sm text-slate-500">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-blue-500" />
                <div>STL 불러오는 중...</div>
              </div>
            ) : (
              <div
                className={`grid gap-4 ${
                  isMachiningStage || isCamStage
                    ? "grid-cols-1 md:grid-cols-2"
                    : "grid-cols-1"
                }`}
              >
                <div className="border rounded-lg p-3 space-y-2">
                  <div className="text-sm font-semibold text-slate-700">
                    {isMachiningStage ? "수정본(CAM) STL" : "원본 STL"}
                  </div>
                  {(
                    isMachiningStage ? previewFiles.cam : previewFiles.original
                  ) ? (
                    <StlPreviewViewer
                      file={
                        (isMachiningStage
                          ? previewFiles.cam
                          : previewFiles.original) as File
                      }
                      showOverlay={false}
                    />
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-xs text-slate-500">
                      파일 없음
                    </div>
                  )}
                </div>
                {(isCamStage || isMachiningStage) && (
                  <div className="border rounded-lg p-3 space-y-2">
                    <div className="text-sm font-semibold text-slate-700">
                      {isMachiningStage ? "NC 파일" : "수정본(CAM) STL"}
                    </div>
                    {isMachiningStage ? (
                      <div className="space-y-2">
                        {/* NC 파일명은 보이지 않도록 숨김 */}
                        <div className="text-xs text-slate-500 sr-only">
                          {previewNcName || ""}
                        </div>
                        <textarea
                          className="w-full h-[300px] rounded-md border border-slate-200 p-3 font-mono text-xs text-slate-700"
                          value={previewNcText}
                          readOnly
                        />
                      </div>
                    ) : previewFiles.cam ? (
                      <StlPreviewViewer
                        file={previewFiles.cam}
                        showOverlay={false}
                      />
                    ) : (
                      <div className="h-[300px] flex items-center justify-center text-xs text-slate-500">
                        파일 없음
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
