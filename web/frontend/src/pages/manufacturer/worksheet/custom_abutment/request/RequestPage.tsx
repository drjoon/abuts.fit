import {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
  type DragEvent,
  type ChangeEvent,
  type ReactNode,
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
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { FunctionalItemCard } from "@/components/FunctionalItemCard";
import { Dialog } from "@/components/ui/dialog";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DialogClose } from "@radix-ui/react-dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  type ManufacturerRequest,
  type ReviewStageKey,
  getReviewStageKeyByTab,
  getReviewLabel,
  getReviewBadgeClassName,
  deriveStageForFilter,
  stageOrder,
  getAcceptByStage,
  getDiameterBucketIndex,
} from "@/features/manufacturer/worksheet/customAbutment/request/utils";
import { WorksheetCardGrid } from "./WorksheetCardGrid";
import { MachiningQueueBoard } from "./MachiningQueueBoard";
import { PreviewModal } from "./PreviewModal";
import { useRequestFileHandlers } from "@/features/manufacturer/worksheet/customAbutment/request/useRequestFileHandlers";
import { usePreviewLoader } from "@/features/manufacturer/worksheet/customAbutment/request/usePreviewLoader";
import { useStageDropHandlers } from "@/features/manufacturer/worksheet/customAbutment/request/useStageDropHandlers";
import { WorksheetLoading } from "@/shared/ui/WorksheetLoading";
import { useSocket } from "@/shared/hooks/useSocket";
import { onCncMachiningCompleted, onCncMachiningTick } from "@/lib/socket";

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

export const RequestPage = ({
  showQueueBar = true,
  filterRequests,
}: {
  showQueueBar?: boolean;
  filterRequests?: (req: ManufacturerRequest) => boolean;
}) => {
  const { user, token } = useAuthStore();
  useSocket();
  const { worksheetSearch, showCompleted } = useOutletContext<{
    worksheetSearch: string;
    showCompleted: boolean;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const isCamStage = (searchParams.get("stage") || "request") === "cam";
  const isMachiningStage =
    (searchParams.get("stage") || "request") === "machining";
  const tabStage = String(searchParams.get("stage") || "request").trim();

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
  const [reviewSaving, setReviewSaving] = useState(false);
  const [previewNcText, setPreviewNcText] = useState<string>("");
  const [previewNcName, setPreviewNcName] = useState<string>("");
  const [previewStageUrl, setPreviewStageUrl] = useState<string>("");
  const [previewStageName, setPreviewStageName] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmDescription, setConfirmDescription] = useState<ReactNode>("");
  const [confirmAction, setConfirmAction] = useState<
    (() => void | Promise<void>) | null
  >(null);
  const [deletingCam, setDeletingCam] = useState<Record<string, boolean>>({});
  const [deletingNc, setDeletingNc] = useState<Record<string, boolean>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>(
    {},
  );
  const [visibleCount, setVisibleCount] = useState(9);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const decodeNcText = useCallback((buffer: ArrayBuffer) => {
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

  const { handleOpenPreview } = usePreviewLoader({
    token,
    isCamStage,
    isMachiningStage,
    tabStage,
    decodeNcText,
    setPreviewLoading,
    setPreviewNcText,
    setPreviewNcName,
    setPreviewStageUrl,
    setPreviewStageName,
    setPreviewFiles,
    setPreviewOpen,
  });

  const fetchRequests = useCallback(async () => {
    if (!token) return;

    try {
      setIsLoading(true);
      const basePath =
        user?.role === "admin"
          ? "/api/admin/requests"
          : user?.role === "manufacturer"
            ? "/api/requests/all"
            : "/api/requests";

      const path = (() => {
        if (user?.role !== "manufacturer") return basePath;
        const url = new URL(basePath, window.location.origin);
        // /api/requests/all 은 기본 limit=10 페이지네이션이므로, 워크시트 집계/큐바를 위해 넉넉히 가져온다.
        url.searchParams.set("page", "1");
        url.searchParams.set("limit", "5000");
        return url.pathname + url.search;
      })();

      // 캐시를 무시하고 항상 최신 데이터를 조회 (NC 파일 업데이트 반영용)
      const res = await fetch(path, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store", // 브라우저 캐시 무시
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
            status2: req.status2,
            manufacturerStage: req.manufacturerStage,
            derivedStage: deriveStageForFilter(req),
          });
        });
        console.groupEnd();
      }
      if (data?.success && Array.isArray(list)) {
        setRequests(list);
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

  const {
    handleDownloadOriginalStl,
    handleDownloadCamStl,
    handleDownloadNcFile,
    handleDownloadStageFile,
    handleUpdateReviewStatus,
    handleDeleteCam,
    handleDeleteNc,
    handleUploadCam,
    handleUploadNc,
    handleUploadStageFile,
    handleDeleteStageFile,
  } = useRequestFileHandlers({
    token,
    stage: tabStage,
    isCamStage,
    isMachiningStage,
    fetchRequests,
    setDownloading,
    setUploading,
    setDeletingCam,
    setDeletingNc,
    setReviewSaving,
    setPreviewOpen,
    setPreviewFiles,
    setPreviewNcText,
    setPreviewNcName,
    setPreviewStageUrl,
    setPreviewStageName,
    setPreviewLoading,
    setSearchParams,
    setUploadProgress,
    decodeNcText,
  });

  useEffect(() => {
    if (!token) return;

    const unsubTick = onCncMachiningTick((data: any) => {
      const requestId = data?.requestId ? String(data.requestId).trim() : "";
      if (!requestId) return;
      const elapsedSecondsRaw = data?.elapsedSeconds;
      const elapsedSeconds = Number.isFinite(Number(elapsedSecondsRaw))
        ? Math.max(0, Math.floor(Number(elapsedSecondsRaw)))
        : 0;
      const machineId = data?.machineId ? String(data.machineId).trim() : "";
      const jobId = data?.jobId ? String(data.jobId).trim() : "";
      const phase = data?.phase ? String(data.phase).trim() : "";
      const percentRaw = data?.percent;
      const percent = Number.isFinite(Number(percentRaw))
        ? Math.max(0, Math.min(100, Number(percentRaw)))
        : null;

      setRequests((prev) =>
        prev.map((r) => {
          if (String((r as any)?.requestId || "").trim() !== requestId)
            return r;
          const productionSchedule = (r as any)?.productionSchedule || {};
          return {
            ...r,
            productionSchedule: {
              ...productionSchedule,
              machiningProgress: {
                ...(productionSchedule?.machiningProgress || {}),
                machineId: machineId || null,
                jobId: jobId || null,
                phase: phase || null,
                percent,
                elapsedSeconds,
              },
            },
          } as any;
        }),
      );
    });

    const unsubCompleted = onCncMachiningCompleted((data: any) => {
      const requestId = data?.requestId ? String(data.requestId).trim() : "";
      if (!requestId) {
        void fetchRequests();
        return;
      }

      setRequests((prev) =>
        prev.filter((r) => {
          const rid = String((r as any)?.requestId || "").trim();
          return rid !== requestId;
        }),
      );

      void fetchRequests();
    });

    return () => {
      if (typeof unsubTick === "function") unsubTick();
      if (typeof unsubCompleted === "function") unsubCompleted();
    };
  }, [fetchRequests, token]);

  const {
    handlePageDrop,
    handlePageDragOver,
    handlePageDragLeave,
    isDraggingOver,
    ocrProcessing,
  } = useStageDropHandlers({
    isMachiningStage,
    isCamStage,
    token,
    requests,
    handleUploadStageFile,
    handleUploadCam,
  });

  const handleUploadByStage = useCallback(
    (req: ManufacturerRequest, files: File[]) => {
      if (isCamStage) return handleUploadCam(req, files);
      if (isMachiningStage) return handleUploadNc(req, files);
      return handleUploadStageFile({
        req,
        stage: tabStage as "machining" | "packaging" | "shipping" | "tracking",
        file: files[0],
        source: "manual",
      });
    },
    [
      isCamStage,
      isMachiningStage,
      handleUploadNc,
      handleUploadCam,
      handleUploadStageFile,
      tabStage,
    ],
  );

  const handleUploadFromModal = useCallback(
    (req: ManufacturerRequest, file: File) => {
      if (!req?._id) return;
      void handleUploadByStage(req, [file]);
    },
    [handleUploadByStage],
  );

  const handleCardRollback = useCallback(
    (req: ManufacturerRequest) => {
      if (!req?._id) return;

      if (tabStage === "machining") {
        void handleDeleteStageFile({
          req,
          stage: "machining",
          rollbackOnly: true,
        });
        return;
      }

      if (tabStage === "cam") {
        void handleDeleteNc(req, {
          nextStage: "request",
          rollbackOnly: true,
          navigate: false,
        });
        return;
      }

      if (tabStage === "shipping") {
        // 발송 탭에서 롤백: 세척.포장 단계로 되돌리기
        void handleUpdateReviewStatus({
          req,
          status: "PENDING",
          stageOverride: "shipping",
        });
        return;
      }

      if (tabStage === "tracking") {
        void handleDeleteStageFile({
          req,
          stage: "tracking",
          rollbackOnly: true,
        });
        return;
      }
    },
    [tabStage, handleDeleteStageFile, handleDeleteNc, handleUpdateReviewStatus],
  );

  const handleCardApprove = useCallback(
    (req: ManufacturerRequest) => {
      if (!req?._id || tabStage !== "shipping") return;

      // 발송 탭에서 승인: 추적관리 단계로 넘어가기
      void handleUpdateReviewStatus({
        req,
        status: "APPROVED",
        stageOverride: "shipping",
      });
    },
    [tabStage, handleUpdateReviewStatus],
  );

  const enableCardRollback =
    tabStage === "cam" ||
    tabStage === "machining" ||
    tabStage === "shipping" ||
    tabStage === "tracking";

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
        if (!url) throw new Error("download url missing");

        const fetchAndSave = async (signedUrl: string, filename: string) => {
          const r = await fetch(signedUrl);
          if (!r.ok) throw new Error("download failed");
          const blob = await r.blob();

          const nameWithExt = filename.includes(".")
            ? filename
            : `${filename}.stl`;
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = nameWithExt;
          link.click();
          URL.revokeObjectURL(link.href);
        };

        const fileName =
          isMachiningStage || isCamStage
            ? req.caseInfos?.camFile?.filePath ||
              req.caseInfos?.camFile?.fileName ||
              req.caseInfos?.camFile?.originalName ||
              req.caseInfos?.file?.filePath ||
              req.caseInfos?.file?.originalName ||
              "download.stl"
            : req.caseInfos?.file?.filePath ||
              req.caseInfos?.file?.originalName ||
              "download.stl";

        await fetchAndSave(url, fileName);

        toast({
          title: "다운로드 시작",
          description: "파일을 내려받고 있습니다.",
          duration: 2000,
        });
      } catch (error) {
        toast({
          title: "다운로드 실패",
          description: "파일을 내려받을 수 없습니다.",
          variant: "destructive",
          duration: 3000,
        });
      } finally {
        setDownloading((prev) => ({ ...prev, [req._id]: false }));
      }
    },
    [token, isMachiningStage, isCamStage, toast],
  );

  useEffect(() => {
    void fetchRequests();
  }, [fetchRequests, tabStage]);

  const searchLower = worksheetSearch.toLowerCase();
  const currentStageForTab = isMachiningStage
    ? "가공"
    : isCamStage
      ? "CAM"
      : tabStage === "shipping"
        ? "발송"
        : tabStage === "tracking"
          ? "추적관리"
          : "의뢰";
  const currentStageOrder = stageOrder[currentStageForTab] ?? 0;

  const filteredBase = (() => {
    // 완료포함: 탭 기준 단계 이상 모든 건 포함 (CAM 탭=CAM~추적관리, 생산 탭=생산~추적관리)
    if (showCompleted) {
      // 발송 탭에서는 "발송" 단계만 보여주되(WorkSheet.tsx filterRequests), 완료 포함은 status 기준 숨김을 해제하는 의미다.
      if (tabStage === "shipping") {
        return requests.filter((req) => {
          if (!filterRequests) return true;
          try {
            return filterRequests(req);
          } catch {
            return false;
          }
        });
      }
      return requests.filter((req) => {
        const stage = deriveStageForFilter(req);
        const order = stageOrder[stage] ?? 0;
        return order >= currentStageOrder;
      });
    }

    // 발송 탭 기본: 완료 건은 숨김 (헤더의 완료포함 체크 시에만 노출)
    if (tabStage === "shipping") {
      return requests.filter((req) => {
        const status = String(req.status || "").trim();
        const status2 = String((req as any).status2 || "").trim();
        if (status === "완료" || status2 === "완료") return false;
        try {
          return filterRequests ? filterRequests(req) : true;
        } catch {
          return false;
        }
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

    // 기본(의뢰/CAM) 탭에서는 생산(가공후) 단계 이상은 제외
    return base.filter((req) => {
      const stage = deriveStageForFilter(req);
      const order = stageOrder[stage] ?? 0;
      // 현재 탭보다 높은 단계의 의뢰는 숨김 (단, showCompleted가 꺼져있을 때)
      return order <= currentStageOrder;
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
    .sort((a, b) => {
      const aScore = a.shippingPriority?.score ?? 0;
      const bScore = b.shippingPriority?.score ?? 0;
      if (aScore !== bScore) return bScore - aScore;
      return new Date(a.createdAt) < new Date(b.createdAt) ? 1 : -1;
    });

  const handleOpenNextRequest = useCallback(
    (currentReqId: string) => {
      const currentIndex = filteredAndSorted.findIndex(
        (r) => r._id === currentReqId,
      );
      if (currentIndex === -1) return;

      const nextReq = filteredAndSorted[currentIndex + 1];
      if (!nextReq) {
        // 마지막 카드인 경우 모달 닫기
        setPreviewOpen(false);
        return;
      }

      setTimeout(() => {
        void handleOpenPreview(nextReq);
      }, 200);
    },
    [filteredAndSorted, handleOpenPreview, setPreviewOpen],
  );

  const paginatedRequests = filteredAndSorted.slice(0, visibleCount);
  const groupedByShippingPackage = useMemo(() => {
    if (tabStage !== "shipping") return null;
    const map = new Map<string, ManufacturerRequest[]>();
    for (const r of paginatedRequests) {
      const key = String(r.shippingPackageId || "").trim() || "unassigned";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [paginatedRequests, tabStage]);

  const handleDownloadShippingToday = useCallback(async () => {
    if (tabStage !== "shipping") return;

    // 박스 단위 그룹핑: shippingPackageId 기준, 미배정(unassigned)은 제외
    const boxMap = new Map<string, ManufacturerRequest[]>();
    for (const r of filteredAndSorted) {
      const rawKey = String(r.shippingPackageId || "").trim();
      if (!rawKey) continue;
      if (!boxMap.has(rawKey)) boxMap.set(rawKey, []);
      boxMap.get(rawKey)!.push(r);
    }

    const totalBoxCount = boxMap.size;
    const totalRequestCount = Array.from(boxMap.values()).reduce(
      (sum, reqs) => sum + reqs.length,
      0,
    );

    // 컨펌 모달 띄우기
    setConfirmTitle("모든 박스 접수 확인");
    setConfirmDescription(
      <div className="space-y-2">
        <p>
          총 <span className="font-semibold">{totalBoxCount}개 박스</span>(
          {totalRequestCount}건)를 접수하시겠습니까?
        </p>
        <p className="text-sm text-slate-600">
          접수하면 모든 의뢰건이 일괄 승인되어 추적관리 탭으로 이동합니다.
        </p>
      </div>,
    );
    setConfirmAction(() => async () => {
      try {
        // 1. 모든 의뢰건 일괄 승인
        const allRequests = Array.from(boxMap.values()).flat();
        for (const req of allRequests) {
          await handleUpdateReviewStatus({
            req,
            status: "APPROVED",
            stageOverride: "shipping",
          });
        }

        // 2. 엑셀 다운로드
        const { utils, writeFileXLSX } = await import("xlsx");
        const today = new Date().toISOString().slice(0, 10);

        const header = [
          "기공소명",
          "전화1",
          "",
          "전화2",
          "",
          "주소",
          "박스수량",
          "종류",
          "",
          "결제",
        ];

        const aoa: (string | number)[][] = [header];

        for (const [, reqs] of boxMap.entries()) {
          const sample = reqs[0];
          if (!sample) continue;

          const ci: any = sample.caseInfos || {};
          const name =
            ci.clinicName ||
            sample.requestor?.organization ||
            sample.requestor?.name ||
            "";

          const orgPhone = (sample as any)?.requestorOrganization?.extracted
            ?.phoneNumber as string | undefined;
          const userPhone = sample.requestor?.phoneNumber as string | undefined;
          const phone = (ci as any)?.phone || orgPhone || userPhone || "";

          const di = (sample.deliveryInfoRef || null) as any;
          const addrObj = di?.address as
            | {
                street?: string;
                city?: string;
                state?: string;
                zipCode?: string;
                country?: string;
              }
            | undefined;
          const diAddr = addrObj
            ? [
                addrObj.street,
                addrObj.city,
                addrObj.state,
                addrObj.zipCode,
                addrObj.country,
              ]
                .filter(Boolean)
                .join(" ")
            : "";

          const orgAddr = (sample as any)?.requestorOrganization?.extracted
            ?.address as string | undefined;

          const addr = (ci as any)?.address || diAddr || orgAddr || "";

          aoa.push([
            name,
            phone,
            "",
            phone,
            "",
            addr,
            "1",
            "의료기기",
            "",
            "신용",
          ]);
        }

        const sheet = utils.aoa_to_sheet(aoa);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, sheet, "배송");
        writeFileXLSX(wb, `애크로덴트-${today}.xlsx`);

        toast({
          title: "접수 완료",
          description: `${totalBoxCount}개 박스가 접수되었습니다.`,
          duration: 3000,
        });
      } catch (error) {
        toast({
          title: "접수 실패",
          description:
            (error as Error)?.message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
      }
    });
    setConfirmOpen(true);
  }, [filteredAndSorted, tabStage, handleUpdateReviewStatus, toast]);

  const loadMore = useCallback(() => {
    setVisibleCount((prev) =>
      Math.min(prev + 9, filteredAndSorted.length || 0),
    );
  }, [filteredAndSorted.length]);

  useEffect(() => {
    setVisibleCount(Math.min(3, filteredAndSorted.length));
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
      { root: null, threshold: 1 },
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
        connectionDiameter:
          typeof caseInfos.connectionDiameter === "number" &&
          Number.isFinite(caseInfos.connectionDiameter)
            ? caseInfos.connectionDiameter
            : null,
        maxDiameter:
          typeof caseInfos.maxDiameter === "number" &&
          Number.isFinite(caseInfos.maxDiameter)
            ? caseInfos.maxDiameter
            : null,
        camDiameter:
          typeof req.productionSchedule?.diameter === "number" &&
          Number.isFinite(req.productionSchedule.diameter)
            ? req.productionSchedule.diameter
            : null,
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
    return <WorksheetLoading />;
  }

  const isEmpty = filteredAndSorted.length === 0;

  return (
    <div
      onDrop={handlePageDrop}
      onDragOver={handlePageDragOver}
      onDragLeave={handlePageDragLeave}
      className="relative"
    >
      {(isMachiningStage || isCamStage) && isDraggingOver && (
        <div className="fixed inset-0 z-50 bg-blue-500/20 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-2xl shadow-2xl p-8 border-4 border-solid border-blue-500 text-center">
            <div className="text-2xl font-bold text-blue-700 mb-2">
              {isMachiningStage
                ? "생산 이미지를 드롭하세요"
                : "NC 파일을 드롭하세요"}
            </div>
            <div className="text-sm text-slate-600">
              {isMachiningStage
                ? "로트넘버를 자동으로 인식하여 해당 파일에 업로드합니다"
                : "파일명이 일치하는 의뢰건에 자동으로 업로드됩니다"}
            </div>
          </div>
        </div>
      )}
      {ocrProcessing && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <div className="text-xl font-bold text-slate-800 mb-2">
              로트넘버 인식 중...
            </div>
            <div className="text-sm text-slate-600">잠시만 기다려주세요</div>
          </div>
        </div>
      )}
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
        {tabStage === "shipping" && (
          <div className="flex justify-end">
            <Button
              variant="default"
              size="sm"
              onClick={handleDownloadShippingToday}
            >
              오늘 택배 접수
            </Button>
          </div>
        )}
        {tabStage === "machining" ? (
          <MachiningQueueBoard searchQuery={worksheetSearch} />
        ) : isEmpty ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-10 text-center text-slate-500">
            표시할 의뢰가 없습니다.
          </div>
        ) : tabStage === "shipping" && groupedByShippingPackage ? (
          <div className="space-y-4">
            {Array.from(groupedByShippingPackage.entries()).map(
              ([key, reqs]) => {
                const sample = reqs[0];
                const org =
                  sample?.requestor?.organization ||
                  sample?.requestor?.name ||
                  sample?.requestor?._id ||
                  "기공소 미지정";
                const pickup = sample?.productionSchedule?.scheduledShipPickup;
                const shipYmd = pickup
                  ? new Date(pickup).toISOString().slice(0, 10)
                  : "-";
                const title =
                  key === "unassigned"
                    ? "발송 박스 미배정"
                    : `발송 박스 ${String(key).slice(-6)}`;
                return (
                  <div
                    key={key}
                    className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-slate-800">
                          {title}
                        </div>
                        <Badge
                          variant="outline"
                          className="text-[11px] bg-slate-50 text-slate-700 border-slate-200"
                        >
                          {org}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-[11px] bg-slate-50 text-slate-700 border-slate-200"
                        >
                          출고 {shipYmd}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-[11px] bg-blue-50 text-blue-700 border-blue-200 font-semibold"
                        >
                          {reqs.length}건
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md border bg-white/90 text-slate-600 shadow-sm transition hover:bg-slate-50"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            reqs.forEach((req) => handleCardRollback(req));
                          }}
                          aria-label="롤백"
                          title="모든 의뢰 롤백"
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md border bg-white/90 text-slate-600 shadow-sm transition hover:bg-slate-50"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            reqs.forEach((req) => handleCardApprove(req));
                          }}
                          aria-label="승인"
                          title="모든 의뢰 승인"
                        >
                          →
                        </button>
                      </div>
                    </div>
                    <WorksheetCardGrid
                      requests={reqs}
                      onDownload={handleDownloadOriginal}
                      onOpenPreview={handleOpenPreview}
                      onDeleteCam={handleDeleteCam}
                      onDeleteNc={handleDeleteNc}
                      onRollback={
                        enableCardRollback ? handleCardRollback : undefined
                      }
                      onApprove={
                        tabStage === "shipping" ? handleCardApprove : undefined
                      }
                      onUploadNc={handleUploadNc}
                      uploadProgress={uploadProgress}
                      uploading={uploading}
                      deletingCam={deletingCam}
                      deletingNc={deletingNc}
                      isCamStage={isCamStage}
                      isMachiningStage={isMachiningStage}
                      downloading={downloading}
                      currentStageOrder={currentStageOrder}
                      tabStage={tabStage}
                    />
                  </div>
                );
              },
            )}
          </div>
        ) : (
          <WorksheetCardGrid
            requests={paginatedRequests}
            onDownload={handleDownloadOriginal}
            onOpenPreview={handleOpenPreview}
            onDeleteCam={handleDeleteCam}
            onDeleteNc={handleDeleteNc}
            onRollback={enableCardRollback ? handleCardRollback : undefined}
            onApprove={tabStage === "shipping" ? handleCardApprove : undefined}
            onUploadNc={handleUploadNc}
            uploadProgress={uploadProgress}
            uploading={uploading}
            deletingCam={deletingCam}
            deletingNc={deletingNc}
            isCamStage={isCamStage}
            isMachiningStage={isMachiningStage}
            downloading={downloading}
            currentStageOrder={currentStageOrder}
            tabStage={tabStage}
          />
        )}
        {!isEmpty && paginatedRequests.length < filteredAndSorted.length && (
          <div ref={sentinelRef} className="h-6 w-full" />
        )}
      </div>

      <WorksheetDiameterQueueModal
        open={receiveQueueModalOpen}
        onOpenChange={setReceiveQueueModalOpen}
        processLabel={`커스텀어벗 > ${currentStageForTab}`}
        queues={diameterQueueForReceive.buckets}
        selectedBucket={receiveSelectedBucket}
        onSelectBucket={setReceiveSelectedBucket}
      />

      <PreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        previewLoading={previewLoading}
        previewFiles={previewFiles}
        previewNcText={previewNcText}
        previewNcName={previewNcName}
        previewStageUrl={previewStageUrl}
        previewStageName={previewStageName}
        uploading={uploading}
        reviewSaving={reviewSaving}
        stage={tabStage}
        isCamStage={isCamStage}
        isMachiningStage={isMachiningStage}
        onUpdateReviewStatus={handleUpdateReviewStatus}
        onDeleteCam={handleDeleteCam}
        onDeleteNc={handleDeleteNc}
        onDeleteStageFile={handleDeleteStageFile}
        onUploadCam={handleUploadCam}
        onUploadNc={handleUploadNc}
        onUploadStageFile={handleUploadStageFile}
        onDownloadOriginalStl={handleDownloadOriginalStl}
        onDownloadCamStl={handleDownloadCamStl}
        onDownloadNcFile={handleDownloadNcFile}
        onDownloadStageFile={handleDownloadStageFile}
        setSearchParams={setSearchParams}
        setConfirmTitle={setConfirmTitle}
        setConfirmDescription={setConfirmDescription}
        setConfirmAction={setConfirmAction}
        setConfirmOpen={setConfirmOpen}
        onOpenNextRequest={handleOpenNextRequest}
      />

      <ConfirmDialog
        open={confirmOpen}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel="확인"
        cancelLabel="취소"
        onConfirm={async () => {
          if (!confirmAction) return;
          const action = confirmAction;
          // 즉시 상태 초기화하여 중복 실행 및 UI 깜빡임 방지
          setConfirmOpen(false);
          setConfirmAction(null);

          try {
            await action();
          } catch (error) {
            console.error("Confirm action failed:", error);
          }
        }}
        onCancel={() => {
          setConfirmOpen(false);
          setConfirmAction(null);
        }}
      />
    </div>
  );
};
