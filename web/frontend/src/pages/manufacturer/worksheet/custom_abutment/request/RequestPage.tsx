import {
  useMemo,
  useState,
  useEffect,
  useCallback,
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

const getDiameterBucketIndex = (diameter?: number) => {
  if (diameter == null) return -1;
  if (diameter <= 6) return 0;
  if (diameter <= 8) return 1;
  if (diameter <= 10) return 2;
  return 3;
};

const WorksheetCardGrid = ({
  requests,
  onDownload,
  onUpload,
  onOpenPreview,
  onDeleteCam,
  downloading,
  uploading,
  deletingCam,
  isCamStage,
}: {
  requests: ManufacturerRequest[];
  onDownload: (req: ManufacturerRequest) => void;
  onUpload: (req: ManufacturerRequest, files: File[]) => void;
  onOpenPreview: (req: ManufacturerRequest) => void;
  onDeleteCam: (req: ManufacturerRequest) => void;
  isCamStage: boolean;
  downloading: Record<string, boolean>;
  uploading: Record<string, boolean>;
  deletingCam: Record<string, boolean>;
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

      const accept = ".stl,.obj,.zip";
      const displayFileName =
        caseInfos.file?.fileName ||
        caseInfos.file?.originalName ||
        caseInfos.camFile?.fileName ||
        caseInfos.camFile?.originalName ||
        "파일명 없음";

      const hasCamFile = !!(
        caseInfos.camFile?.s3Key ||
        caseInfos.camFile?.fileName ||
        caseInfos.camFile?.originalName
      );
      const isDeletingCam = !!deletingCam[request._id];

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
              onClick={(e) => e.stopPropagation()}
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
                    <div className="flex items-center justify-between gap-2">
                      {isCamStage && hasCamFile ? (
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
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-[13px] min-w-[78px] hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDownload(request);
                          }}
                          disabled={isDownloading}
                        >
                          {isDownloading ? "다운로드중..." : "다운로드"}
                        </Button>
                        <label className="inline-flex items-center justify-center min-w-[78px] px-3 py-1.5 rounded-md border border-slate-200 bg-white text-[13px] font-medium text-slate-700 cursor-pointer hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700 transition">
                          {isUploading ? "업로드 중..." : "업로드"}
                          <input
                            type="file"
                            accept={accept}
                            className="hidden"
                            onChange={(e) => {
                              e.stopPropagation();
                              handleSelectFiles(e);
                            }}
                          />
                        </label>
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
  const { worksheetSearch } = useOutletContext<{
    worksheetSearch: string;
  }>();
  const [searchParams] = useSearchParams();
  const isCamStage = (searchParams.get("stage") || "request") === "cam";

  const [requests, setRequests] = useState<ManufacturerRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [receiveQueueModalOpen, setReceiveQueueModalOpen] = useState(false);
  const [receiveSelectedBucket, setReceiveSelectedBucket] =
    useState<DiameterBucketKey | null>(null);
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFiles, setPreviewFiles] = useState<{
    original?: FilePreviewInfo | null;
    cam?: FilePreviewInfo | null;
    title?: string;
  }>({});
  const [deletingCam, setDeletingCam] = useState<Record<string, boolean>>({});
  const { toast } = useToast();
  const { uploadFiles } = useS3TempUpload({ token });

  const fetchRequests = useCallback(async () => {
    if (!token) return;

    try {
      setIsLoading(true);
      const url =
        user?.role === "admin" ? "/api/admin/requests" : "/api/requests";

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
      if (data.success && Array.isArray(data.data?.requests)) {
        setRequests(data.data.requests);
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
        const res = await fetch(`/api/requests/${req._id}/original-file-url`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) {
          throw new Error("download url failed");
        }
        const body = await res.json();
        const url = body?.data?.url;
        if (url) {
          window.open(url, "_blank");
        } else {
          throw new Error("no url");
        }
      } catch (error) {
        toast({
          title: "다운로드 실패",
          description: "원본 STL을 가져올 수 없습니다.",
          variant: "destructive",
        });
      } finally {
        setDownloading((prev) => ({ ...prev, [req._id]: false }));
      }
    },
    [token, toast]
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

  const handleUploadCam = useCallback(
    async (req: ManufacturerRequest, files: File[]) => {
      if (!token) return;
      const normalize = (name: string) =>
        name.trim().toLowerCase().normalize("NFC");
      const expectedName =
        req.caseInfos?.file?.fileName ||
        req.caseInfos?.file?.originalName ||
        req.caseInfos?.camFile?.fileName ||
        req.caseInfos?.camFile?.originalName ||
        "";
      const filtered = files.filter((f) =>
        [".stl", ".obj", ".zip"].some((ext) =>
          f.name.toLowerCase().endsWith(ext)
        )
      );
      if (!filtered.length) {
        toast({
          title: "업로드 실패",
          description: "STL/OBJ/ZIP 파일만 업로드할 수 있습니다.",
          variant: "destructive",
        });
        return;
      }
      if (
        expectedName &&
        filtered.some((f) => normalize(f.name) !== normalize(expectedName))
      ) {
        toast({
          title: "파일명 불일치",
          description: `다운로드한 원본 파일명(${expectedName})과 동일한 파일명으로 업로드해주세요.`,
          variant: "destructive",
        });
        return;
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
            fileName: first.originalName,
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

  const handleOpenPreview = useCallback(
    async (req: ManufacturerRequest) => {
      if (!token) return;
      try {
        const [origRes, camRes] = await Promise.all([
          fetch(`/api/requests/${req._id}/original-file-url`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/requests/${req._id}/cam-file-url`, {
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => null),
        ]);
        let original: FilePreviewInfo | null = null;
        let cam: FilePreviewInfo | null = null;

        if (origRes?.ok) {
          const body = await origRes.json();
          const url = body?.data?.url;
          const name =
            req.caseInfos?.file?.fileName ||
            req.caseInfos?.file?.originalName ||
            "original.stl";
          if (url) original = { originalName: name, url };
        }
        if (camRes && camRes.ok) {
          const body = await camRes.json();
          const url = body?.data?.url;
          const name =
            req.caseInfos?.camFile?.fileName ||
            req.caseInfos?.camFile?.originalName ||
            "cam.stl";
          if (url) cam = { originalName: name, url };
        }

        setPreviewFiles({
          original,
          cam,
          title:
            req.caseInfos?.patientName ||
            req.requestor?.organization ||
            req.requestor?.name ||
            "파일 미리보기",
        });
        setPreviewOpen(true);
      } catch (error) {
        toast({
          title: "미리보기 실패",
          description: "파일 URL을 불러올 수 없습니다.",
          variant: "destructive",
        });
      }
    },
    [token, toast]
  );

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const searchLower = worksheetSearch.toLowerCase();
  const filteredBase = filterRequests
    ? requests.filter((req) => {
        try {
          return filterRequests(req);
        } catch {
          return false;
        }
      })
    : requests.filter((req) => {
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
            requests={filteredAndSorted}
            onDownload={handleDownloadOriginal}
            onUpload={handleUploadCam}
            onOpenPreview={handleOpenPreview}
            onDeleteCam={handleDeleteCam}
            deletingCam={deletingCam}
            isCamStage={isCamStage}
            downloading={downloading}
            uploading={uploading}
          />
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
          <DialogHeader>
            <DialogTitle>{previewFiles.title || "파일 미리보기"}</DialogTitle>
            <DialogDescription>
              원본 STL / 수정본 STL을 좌우로 비교해 다운로드할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded-lg p-3 space-y-2">
              <div className="text-sm font-semibold text-slate-700">
                원본 파일
              </div>
              {previewFiles.original ? (
                <a
                  href={previewFiles.original.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center px-3 py-2 rounded-md border border-slate-200 bg-white text-sm font-medium text-blue-600 hover:bg-blue-50"
                >
                  {previewFiles.original.originalName}
                </a>
              ) : (
                <div className="text-xs text-slate-500">원본 파일 없음</div>
              )}
            </div>
            <div className="border rounded-lg p-3 space-y-2">
              <div className="text-sm font-semibold text-slate-700">
                수정본(CAM) 파일
              </div>
              {previewFiles.cam ? (
                <a
                  href={previewFiles.cam.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center px-3 py-2 rounded-md border border-slate-200 bg-white text-sm font-medium text-blue-600 hover:bg-blue-50"
                >
                  {previewFiles.cam.originalName}
                </a>
              ) : (
                <div className="text-xs text-slate-500">수정본 파일 없음</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
