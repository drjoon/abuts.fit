import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { DialogClose } from "@radix-ui/react-dialog";
import { RefreshCw, Trash2, Upload, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StlPreviewViewer } from "@/features/requests/components/StlPreviewViewer";
import { useStlMetadata } from "@/features/requests/hooks/useStlMetadata";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import { generateModelNumber } from "@/utils/modelNumber";
import { deleteCncProgramCache } from "@/shared/files/fileBlobCache";
import {
  type ManufacturerRequest,
  type ReviewStageKey,
  getReviewStageKeyByTab,
} from "../utils/request";

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
  onUpdateReviewStatus: (params: {
    req: ManufacturerRequest;
    status: "PENDING" | "APPROVED" | "REJECTED";
    stageOverride?: ReviewStageKey;
    keepPreviewOpen?: boolean;
    forceReprocess?: boolean;
  }) => Promise<void>;
  onDeleteCam: (
    req: ManufacturerRequest,
    opts?: { rollbackOnly?: boolean; navigate?: boolean },
  ) => Promise<void>;
  onDeleteNc: (
    req: ManufacturerRequest,
    opts?: { nextStage?: string; navigate?: boolean },
  ) => Promise<void>;
  onDeleteStageFile: (params: {
    req: ManufacturerRequest;
    stage: "machining" | "packing" | "shipping" | "tracking";
    rollbackOnly?: boolean;
    navigate?: boolean;
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
    opts?: { forceRefresh?: boolean },
  ) => Promise<void>;
  onMarkUnmachinable?: (
    req: ManufacturerRequest,
    reason: string,
  ) => Promise<void>;
  onRestoreUnmachinable?: (req: ManufacturerRequest) => Promise<void>;
  onOpenNextRequest?: (currentReqId: string) => Promise<void>;
  setSearchParams: (
    nextInit: ((prev: URLSearchParams) => URLSearchParams) | URLSearchParams,
    navigateOpts?: { replace?: boolean },
  ) => void;
  setConfirmTitle: (title: string) => void;
  setConfirmDescription: (desc: ReactNode) => void;
  setConfirmAction: (
    action:
      | ((() => void | Promise<void>) | null)
      | ((
          prev: (() => void | Promise<void>) | null,
        ) => (() => void | Promise<void>) | null),
  ) => void;
  setConfirmOpen: (open: boolean) => void;
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
  onOpenNextRequest,
  setSearchParams,
  setConfirmTitle,
  setConfirmDescription,
  setConfirmAction,
  setConfirmOpen,
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
  const req = previewFiles.request as ManufacturerRequest | null;
  const lastStableReqRef = useRef<ManufacturerRequest | null>(null);

  useEffect(() => {
    if (req) {
      lastStableReqRef.current = req;
    }
  }, [req]);

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
    const existingReason = String(req.rnd?.unmachinableReason || "").trim();
    const tokens = parseUnmachinableReasonTokens(existingReason);
    setSelectedReasonValues(tokens);
    setUnmachinableReasonDraft("");
    if (tokens.length) {
      setReasonLibraryWithSync((prev) => {
        const next = [...prev];
        for (const token of tokens) {
          if (!next.includes(token)) next.unshift(token);
        }
        return next;
      });
    }
  }, [req, setReasonLibraryWithSync]);

  // Hook은 항상 같은 순서로 호출되어야 하므로 조건부 로직 이전에 호출
  const requestId = req?.requestId || lastStableReqRef.current?.requestId;
  const {
    metadata: stlMetadata,
    recalculate,
    loading: metadataLoading,
  } = useStlMetadata(requestId);

  const activeReq = req || lastStableReqRef.current;
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

  const finishLinePoints = ((previewFiles.finishLinePoints ??
    activeReq?.caseInfos?.finishLine?.points ??
    stlMetadata?.finishLine?.points) ||
    null) as number[][] | null;

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
      return !!activeReq?.caseInfos?.ncFile?.s3Key || !!previewNcText;
    }
    return !!activeReq?.caseInfos?.camFile?.s3Key || !!previewFiles.cam;
  })();

  const isNcGenerating =
    isCamStage &&
    String((activeReq as any)?.realtimeProgress?.badge || "").trim() ===
      "NC 생성중";

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
            await onUpdateReviewStatus({
              req: activeReq,
              status: "APPROVED",
              stageOverride: "packing",
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
    if (twoPhasing || isUploading) return;

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

      const res = await fetch(
        `/api/requests/by-request/${encodeURIComponent(requestId)}/nc-file/regenerate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
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
      toast({
        title: "NC 재생성 실패",
        description: err?.message || "NC 재생성 요청에 실패했습니다.",
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
    if (regenerating || isUploading) return;

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

        const res = await fetch(
          `/api/requests/by-request/${encodeURIComponent(requestId)}/nc-file/regenerate`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
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
        toast({
          title: "재생성 실패",
          description: err?.message || "재생성 요청에 실패했습니다.",
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
      });
      return;
    }
    if (isCamStage) {
      void onDeleteNc(activeReq);
      return;
    }
    void onDeleteCam(activeReq);
  };

  const toggleReasonSelection = (reasonRaw: string) => {
    const reason = String(reasonRaw || "").trim();
    if (!reason) return;
    setSelectedReasonValues((prev) =>
      prev.includes(reason) ? prev.filter((item) => item !== reason) : [...prev, reason],
    );
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
        description: "가공불가 사유를 1개 이상 선택해주세요.",
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
    if (!onRestoreUnmachinable || !isUnmachinable || unmachinableSaving || reviewSaving) {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className={`w-[92vw] max-w-5xl h-[85vh] overflow-hidden ${
          shouldShowUnmachinableWarning || isUnmachinable
            ? "border-red-300 ring-2 ring-red-200"
            : ""
        }`}
      >
        <DialogTitle className="sr-only">의뢰 미리보기</DialogTitle>
        <DialogDescription className="sr-only">
          의뢰 파일과 NC 내용을 확인하는 영역입니다.
        </DialogDescription>

        <div className="h-full flex flex-col gap-4 overflow-hidden">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-slate-50/70 px-3 py-2 shrink-0">
            <div className="flex items-center gap-2">
              {fullLotLabel ? (
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className="text-[11px] px-2 py-0.5 font-semibold bg-violet-50 text-violet-700 border-violet-200"
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
                  {retentionGrooveLabel && (
                    <Badge
                      variant="outline"
                      className="text-[11px] px-2 py-0.5 font-semibold leading-[1.1] border border-amber-200 bg-amber-50 text-amber-700"
                    >
                      유지홈 {retentionGrooveLabel}
                    </Badge>
                  )}
                  {Number.isFinite(finishLineMaxZ) && (
                    <Badge
                      variant="outline"
                      className="text-[11px] px-2 py-0.5 font-semibold leading-[1.1] border border-emerald-200 bg-emerald-50 text-emerald-700"
                    >
                      max_z {Number(finishLineMaxZ).toFixed(2)}
                    </Badge>
                  )}
                  {Number.isFinite(finishLineMinZ) && (
                    <Badge
                      variant="outline"
                      className="text-[11px] px-2 py-0.5 font-semibold leading-[1.1] border border-emerald-200 bg-emerald-50 text-emerald-700"
                    >
                      min_z {Number(finishLineMinZ).toFixed(2)}
                    </Badge>
                  )}
                  {(shouldShowUnmachinableWarning || isUnmachinable) && (
                    <Badge
                      variant="outline"
                      className={`text-[11px] px-2 py-0.5 font-semibold leading-[1.1] border ${
                        isUnmachinable
                          ? "border-red-300 bg-red-50 text-red-700"
                          : "border-red-200 bg-red-50 text-red-600"
                      }`}
                    >
                      {isUnmachinable ? "가공불가" : "가공불가 확인요망"}
                    </Badge>
                  )}
                </div>
              ) : retentionGrooveLabel ||
                Number.isFinite(finishLineMaxZ) ||
                Number.isFinite(finishLineMinZ) ||
                isUnmachinable ? (
                <div className="flex items-center gap-1.5">
                  {retentionGrooveLabel && (
                    <Badge
                      variant="outline"
                      className="text-[11px] px-2 py-0.5 font-semibold leading-[1.1] border border-amber-200 bg-amber-50 text-amber-700"
                    >
                      유지홈 {retentionGrooveLabel}
                    </Badge>
                  )}
                  {Number.isFinite(finishLineMaxZ) && (
                    <Badge
                      variant="outline"
                      className="text-[11px] px-2 py-0.5 font-semibold leading-[1.1] border border-emerald-200 bg-emerald-50 text-emerald-700"
                    >
                      max_z {Number(finishLineMaxZ).toFixed(2)}
                    </Badge>
                  )}
                  {Number.isFinite(finishLineMinZ) && (
                    <Badge
                      variant="outline"
                      className="text-[11px] px-2 py-0.5 font-semibold leading-[1.1] border border-emerald-200 bg-emerald-50 text-emerald-700"
                    >
                      min_z {Number(finishLineMinZ).toFixed(2)}
                    </Badge>
                  )}
                  {(shouldShowUnmachinableWarning || isUnmachinable) && (
                    <Badge
                      variant="outline"
                      className={`text-[11px] px-2 py-0.5 font-semibold leading-[1.1] border ${
                        isUnmachinable
                          ? "border-red-300 bg-red-50 text-red-700"
                          : "border-red-200 bg-red-50 text-red-600"
                      }`}
                    >
                      {isUnmachinable ? "가공불가" : "가공불가 확인요망"}
                    </Badge>
                  )}
                </div>
              ) : null}

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleRecalculateMetadata}
                disabled={regenerating || metadataLoading}
                className="h-7 text-xs gap-1.5 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
              >
                <RotateCcw
                  className={`w-3 h-3 ${regenerating || metadataLoading ? "animate-spin" : ""}`}
                />
                메타데이터 재계산
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {isUnmachinable ? (
                  <button
                    type="button"
                    className={`h-8 rounded-md border px-2 text-[12px] font-semibold transition ${
                      unmachinableSaving || reviewSaving
                        ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    }`}
                    disabled={unmachinableSaving || reviewSaving}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleRestoreUnmachinable();
                    }}
                  >
                    {unmachinableSaving ? "복귀 중..." : "가공불가 복귀"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`h-8 rounded-md border px-2 text-[12px] font-semibold transition ${
                      unmachinableSaving || reviewSaving
                        ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                        : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                    }`}
                    disabled={unmachinableSaving || reviewSaving}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (unmachinableSaving || reviewSaving) return;
                      setUnmachinableEditorOpen(true);
                    }}
                  >
                    가공불가
                  </button>
                )}
              {!isRequestStage && (
                <button
                  type="button"
                  className={`${controlBtnClass} ${
                    reviewSaving
                      ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                  disabled={reviewSaving}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const performBack = async () => {
                      const stageKey = currentReviewStageKey;
                      if (
                        stageKey === "machining" ||
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
                      } else if (isCamStage) {
                        await onDeleteNc(activeReq, {
                          nextStage: "request",
                          navigate: false,
                        });
                      } else {
                        await onDeleteCam(activeReq, { navigate: false });
                      }
                    };

                    // 롤백 후 모달 닫기만 한다. 다음 의뢰 자동 열기는 하지 않는다.
                    void performBack();
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
                  reviewSaving || !canApprove || isNcGenerating
                    ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                disabled={reviewSaving || !canApprove || isNcGenerating}
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  try {
                    // 승인 처리: keepPreviewOpen=false → 승인 후 모달이 즉시 닫힌다.
                    // BG 앱 트리거(Esprit 등)는 백엔드 ReviewApprovalQueue에서 직렬로 처리된다.
                    // 다음 의뢰는 자동으로 열리지 않는다(연속 승인으로 인한 충돌 방지).
                    await onUpdateReviewStatus({
                      req: activeReq,
                      status: "APPROVED",
                      stageOverride: currentReviewStageKey,
                      keepPreviewOpen: false,
                      forceReprocess: true,
                    });

                    // CAM 단계 승인 시 NC 파일 bridge-store 동기화 (비동기, 실패 무시)
                    if (isCamStage) {
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

                    // 승인 완료 후 모달 닫기 (onOpenNextRequest는 더 이상 호출하지 않음)
                    onOpenChange(false);
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
                    reviewSaving
                      ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  X
                </button>
              </DialogClose>
            </div>
          </div>

          {unmachinableEditorOpen && (
            <div className="shrink-0 rounded-lg border border-red-200 bg-red-50/70 p-2 space-y-2 max-h-[34vh] overflow-y-auto">
              <div className="text-xs font-semibold text-red-700">가공불가 사유 입력</div>

              <div className="space-y-1.5 rounded-md border border-red-200 bg-white/80 p-1.5">
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
                                ? "bg-blue-50 text-blue-700 border border-blue-200"
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
                            className="h-7 px-2 text-xs text-red-600 hover:text-red-700"
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

              <div className="rounded-md border border-red-200 bg-white px-2 py-2">
                <div className="text-[11px] font-semibold text-slate-700 mb-1">
                  선택된 사유 ({selectedReasonValues.length})
                </div>
                {selectedReasonValues.length ? (
                  <div className="flex flex-wrap gap-1">
                    {selectedReasonValues.map((reason) => (
                      <Badge
                        key={`selected-reason-${reason}`}
                        variant="outline"
                        className="text-[11px] border-red-200 bg-red-50 text-red-700"
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
                  className="bg-red-600 hover:bg-red-700"
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
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-blue-500" />
              <div>STL 불러오는 중...</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0 overflow-hidden">
              <div className="border rounded-lg p-3 space-y-2 flex flex-col overflow-hidden">
                <button
                  type="button"
                  className="text-sm font-semibold text-blue-700 hover:underline text-left max-w-[320px] truncate"
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
                  if (isUploading) return;
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  if (isUploading) return;
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
                    className="text-sm font-semibold text-blue-700 hover:underline text-left max-w-[320px] truncate"
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
                    {canRegenerateFilledStl && (
                      <button
                        type="button"
                        className={`inline-flex items-center justify-center h-8 w-8 rounded-md border text-[13px] font-medium transition ${
                          twoPhasing || regenerating || isUploading
                            ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                            : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                        }`}
                        disabled={twoPhasing || regenerating || isUploading}
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
                        title={isCamStage ? "NC 재생성" : "filled.stl 재생성"}
                      >
                        <RefreshCw
                          className={`h-4 w-4 ${twoPhasing || regenerating ? "animate-spin" : ""}`}
                        />
                      </button>
                    )}

                    <button
                      type="button"
                      className={`inline-flex items-center justify-center h-8 w-8 rounded-md border text-[13px] font-medium transition ${
                        !hasRightFile || isUploading
                          ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700"
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
                      <Trash2 className="h-4 w-4" />
                    </button>

                    <label
                      htmlFor={pickInputId}
                      className={`inline-flex items-center justify-center h-8 w-8 rounded-md border text-[13px] font-medium transition ${
                        isUploading
                          ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                          : "border-slate-200 bg-white text-slate-700 cursor-pointer hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700"
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isUploading ? "…" : <Upload className="h-4 w-4" />}
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
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PreviewModal;
