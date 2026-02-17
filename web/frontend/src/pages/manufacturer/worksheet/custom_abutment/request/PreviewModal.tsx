import { type ReactNode, useState } from "react";
import { DialogClose } from "@radix-ui/react-dialog";
import { RefreshCw, Trash2, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { StlPreviewViewer } from "@/components/StlPreviewViewer";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
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
  }) => Promise<void>;
  onDeleteCam: (req: ManufacturerRequest) => Promise<void>;
  onDeleteNc: (
    req: ManufacturerRequest,
    opts?: { nextStage?: string; navigate?: boolean },
  ) => Promise<void>;
  onDeleteStageFile: (params: {
    req: ManufacturerRequest;
    stage: "machining" | "packaging" | "shipping" | "tracking";
    rollbackOnly?: boolean;
    navigate?: boolean;
  }) => Promise<void>;
  onUploadCam: (req: ManufacturerRequest, files: File[]) => Promise<void>;
  onUploadNc: (req: ManufacturerRequest, files: File[]) => Promise<void>;
  onUploadStageFile: (params: {
    req: ManufacturerRequest;
    stage: "machining" | "packaging" | "shipping" | "tracking";
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
  onOpenNextRequest?: (currentReqId: string) => void;
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
  const req = previewFiles.request as ManufacturerRequest | null;
  if (!req) return null;

  const finishLinePoints = ((previewFiles.finishLinePoints ??
    req.caseInfos?.finishLine?.points) ||
    null) as number[][] | null;

  const currentReviewStageKey = getReviewStageKeyByTab({
    stage,
    isCamStage,
    isMachiningStage,
  });

  const isStageFileStage =
    currentReviewStageKey === "machining" ||
    currentReviewStageKey === "packaging" ||
    currentReviewStageKey === "shipping" ||
    currentReviewStageKey === "tracking";

  const isRequestStage = currentReviewStageKey === "request";
  const isNcStage = currentReviewStageKey === "machining";
  const isImageStage =
    currentReviewStageKey === "packaging" ||
    currentReviewStageKey === "shipping" ||
    currentReviewStageKey === "tracking";
  const imageStageKey =
    currentReviewStageKey === "shipping" ? "packaging" : currentReviewStageKey;

  const canApprove = (() => {
    if (isStageFileStage) {
      const key = currentReviewStageKey as
        | "machining"
        | "packaging"
        | "shipping"
        | "tracking";
      return !!req.caseInfos?.stageFiles?.[key]?.s3Key || !!previewStageUrl;
    }
    if (isCamStage) {
      return !!req.caseInfos?.ncFile?.s3Key || !!previewNcText;
    }
    // 의뢰 단계에서는 camFile이 있어야 다음으로 진행 가능
    return !!req.caseInfos?.camFile?.s3Key || !!previewFiles.cam;
  })();

  const controlBtnClass =
    "inline-flex h-8 w-8 items-center justify-center rounded-md border text-[13px] font-medium transition";

  const openBackConfirm = (fn: () => void | Promise<void>) => {
    const title = isMachiningStage
      ? "가공 → CAM 이동"
      : isCamStage
        ? "CAM → 의뢰 이동"
        : "의뢰 → 이전 단계";
    const desc = isMachiningStage
      ? "가공 단계에서 CAM 단계로 돌아갑니다. 진행할까요?"
      : isCamStage
        ? "CAM 단계에서 의뢰 단계로 돌아갑니다. 진행할까요?"
        : "의뢰 단계에서 이전 단계로 돌아갑니다. 진행할까요?";

    setConfirmTitle(title);
    setConfirmDescription(desc);
    // React useState에 함수 자체를 저장하기 위한 패턴
    setConfirmAction(() => fn);
    setConfirmOpen(true);
  };

  const isUploading = !!uploading[req._id || ""];

  const originalName =
    req.caseInfos?.file?.filePath ||
    req.caseInfos?.file?.originalName ||
    "original.stl";
  const camName = req.caseInfos?.camFile?.s3Key
    ? req.caseInfos?.camFile?.filePath ||
      req.caseInfos?.camFile?.originalName ||
      "filled.stl"
    : "filled.stl";
  const ncName =
    req.caseInfos?.ncFile?.filePath ||
    req.caseInfos?.ncFile?.originalName ||
    previewNcName ||
    "program.nc";

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
        | "packaging"
        | "shipping"
        | "tracking";
      void (async () => {
        await onUploadStageFile({
          req,
          stage: key,
          file,
          source: "manual",
        });

        if (key === "packaging") {
          try {
            await onUpdateReviewStatus({
              req,
              status: "APPROVED",
              stageOverride: "packaging",
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
      void onUploadNc(req, [file]);
      return;
    }
    void onUploadCam(req, [file]);
  };

  const rightMeta = isStageFileStage
    ? req.caseInfos?.stageFiles?.[
        imageStageKey as "machining" | "packaging" | "shipping" | "tracking"
      ]
    : isCamStage
      ? req.caseInfos?.ncFile
      : req.caseInfos?.camFile;
  const hasRightFile = !!rightMeta?.s3Key;

  const canRegenerateFilledStl = !isCamStage && !isStageFileStage;

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
    if (regenerating || isUploading) return;

    const standardFilePath =
      req?.requestId &&
      req?.caseInfos?.clinicName &&
      req?.caseInfos?.patientName &&
      req?.caseInfos?.tooth
        ? buildStandardStlFileName({
            requestId: String(req.requestId),
            clinicName: String(req.caseInfos.clinicName || ""),
            patientName: String(req.caseInfos.patientName || ""),
            tooth: String(req.caseInfos.tooth || ""),
            originalFileName:
              req.caseInfos?.file?.originalName || previewFiles.original?.name,
          })
        : "";

    const filePath = String(
      standardFilePath ||
        req.caseInfos?.file?.filePath ||
        req.caseInfos?.file?.originalName ||
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

      toast({
        title: "재생성 요청",
        description: "filled.stl 재처리를 시작했습니다.",
      });
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

  const onDownload = () => {
    if (!hasRightFile) return;
    if (isStageFileStage) {
      void onDownloadStageFile(req, imageStageKey);
      return;
    }
    if (isCamStage) {
      void onDownloadNcFile(req);
      return;
    }
    void onDownloadCamStl(req);
  };

  const onDelete = () => {
    if (!hasRightFile) return;
    if (isStageFileStage) {
      void onDeleteStageFile({
        req,
        stage: imageStageKey as
          | "machining"
          | "packaging"
          | "shipping"
          | "tracking",
      });
      return;
    }
    if (isCamStage) {
      void onDeleteNc(req);
      return;
    }
    void onDeleteCam(req);
  };

  const pickInputId = `right-upload-${req._id}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="w-[92vw] max-w-5xl h-[85vh] overflow-hidden"
      >
        <DialogTitle className="sr-only">의뢰 미리보기</DialogTitle>
        <DialogDescription className="sr-only">
          의뢰 파일과 NC 내용을 확인하는 영역입니다.
        </DialogDescription>

        {/* 상단 컨트롤 버튼들 */}
        <div className="absolute right-4 top-4 flex items-center gap-2">
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
                    stageKey === "packaging" ||
                    stageKey === "shipping" ||
                    stageKey === "tracking"
                  ) {
                    await onDeleteStageFile({
                      req,
                      stage: stageKey,
                      rollbackOnly: true,
                    });
                  } else if (isCamStage) {
                    await onDeleteNc(req, { nextStage: "request" });
                  } else {
                    await onDeleteCam(req);
                  }
                };

                void performBack().then(() => {
                  if (onOpenNextRequest && req._id) {
                    onOpenNextRequest(req._id);
                  }
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
              reviewSaving || !canApprove
                ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
            disabled={reviewSaving || !canApprove}
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              try {
                await onUpdateReviewStatus({
                  req,
                  status: "APPROVED",
                  stageOverride: currentReviewStageKey,
                  keepPreviewOpen: true,
                });

                if (isCamStage) {
                  const requestId = String(
                    (req as any)?.requestId || "",
                  ).trim();
                  if (!token) {
                    throw new Error("로그인이 필요합니다.");
                  }
                  if (!requestId) {
                    throw new Error(
                      "requestId가 없어 NC 동기화를 진행할 수 없습니다.",
                    );
                  }

                  const ensureRes = await fetch(
                    `/api/requests/by-request/${encodeURIComponent(requestId)}/nc-file/ensure-bridge`,
                    {
                      method: "POST",
                      headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({}),
                    },
                  );
                  const ensureBody: any = await ensureRes
                    .json()
                    .catch(() => ({}));
                  if (!ensureRes.ok || ensureBody?.success === false) {
                    throw new Error(
                      ensureBody?.message ||
                        ensureBody?.error ||
                        "NC 파일 bridge-store 동기화에 실패했습니다.",
                    );
                  }
                }

                // 성공 시에만 다음 요청으로 이동
                if (onOpenNextRequest && req._id) {
                  onOpenNextRequest(req._id);
                }
              } catch (err) {
                // 실패 시(BG 앱 미시동 등) 다음 공정으로 넘기지 않음
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

        {/* 본문 영역 */}
        <div className="h-full flex flex-col gap-4 overflow-hidden">
          {/* 모달 제목 영역 */}
          <div className="flex items-center gap-2 pb-2 border-b">
            {req.referenceIds && req.referenceIds.length > 0 && (
              <>
                {req.referenceIds.map((ref, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center px-2 py-1 rounded text-sm font-semibold bg-purple-50 text-purple-700 border border-purple-200"
                  >
                    #{idx + 1}
                  </span>
                ))}
                <span className="inline-flex items-center px-2 py-1 rounded text-sm font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  {req.referenceIds.length}
                </span>
              </>
            )}

            {(() => {
              const lotRaw = (req.lotNumber?.final ??
                req.lotNumber?.part ??
                "") as string | number;
              const lotBadge = String(lotRaw || "").slice(-3);
              const org =
                req.requestor?.organization || req.requestor?.name || "";
              const clinic = req.caseInfos?.clinicName || "";
              const patient = req.caseInfos?.patientName || "미지정";
              const tooth = req.caseInfos?.tooth || "-";
              const requestId = req.requestId || "";

              return (
                <div className="flex flex-col gap-1 min-w-0">
                  {/* 데스크탑 */}
                  <div className="hidden md:flex flex-wrap items-center gap-2 text-sm text-slate-700">
                    <span className="truncate max-w-[220px]" title={org}>
                      {org || "-"}
                    </span>
                    <span className="text-slate-400">/</span>
                    <span className="truncate max-w-[180px]" title={clinic}>
                      {clinic || "-"}
                    </span>
                    <span className="text-slate-400">/</span>
                    <span className="truncate max-w-[140px]" title={patient}>
                      {patient}
                    </span>
                    <span className="text-slate-400">/</span>
                    <span>{tooth}</span>
                    <span className="text-slate-400">/</span>
                    <span
                      className="font-medium text-slate-800"
                      title={requestId}
                    >
                      {requestId || "-"}
                    </span>
                    {lotBadge && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                        {lotBadge}
                      </span>
                    )}
                  </div>

                  {/* 모바일 */}
                  <div className="flex md:hidden flex-wrap items-center gap-2 text-sm text-slate-700">
                    <span className="truncate max-w-[160px]" title={clinic}>
                      {clinic || "-"}
                    </span>
                    <span className="text-slate-400">/</span>
                    <span className="truncate max-w-[140px]" title={patient}>
                      {patient}
                    </span>
                    <span className="text-slate-400">/</span>
                    <span>{tooth}</span>
                    {lotBadge && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                        {lotBadge}
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          {previewLoading ? (
            <div className="rounded-lg border border-dashed p-8 flex flex-col items-center gap-2 text-sm text-slate-500">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-blue-500" />
              <div>STL 불러오는 중...</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0 overflow-hidden">
              {/* 왼쪽: STL 뷰어 (가공 단계만 NC 텍스트) */}
              <div className="border rounded-lg p-3 space-y-2 flex flex-col overflow-hidden">
                <button
                  type="button"
                  className="text-sm font-semibold text-blue-700 hover:underline text-left max-w-[320px] truncate"
                  onClick={() => {
                    if (isMachiningStage) {
                      void onDownloadNcFile(req);
                      return;
                    }
                    if (isCamStage || isImageStage) {
                      void onDownloadCamStl(req);
                      return;
                    }
                    void onDownloadOriginalStl(req);
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
                      showOverlay={false}
                      finishLinePoints={finishLinePoints}
                    />
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-xs text-slate-500">
                    파일 없음
                  </div>
                )}
              </div>

              {/* 오른쪽: 단계별 이미지/NC/캠 뷰어 */}
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
                      stage === "packaging" || stage === "shipping"
                        ? "각인 이미지"
                        : fileLabel
                    }
                  >
                    {stage === "packaging" || stage === "shipping"
                      ? "각인 이미지"
                      : fileLabel}
                  </button>
                  <div className="flex items-center gap-2">
                    {canRegenerateFilledStl && (
                      <button
                        type="button"
                        className={`inline-flex items-center justify-center h-8 w-8 rounded-md border text-[13px] font-medium transition ${
                          regenerating || isUploading
                            ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                        disabled={regenerating || isUploading}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void onRegenerate();
                        }}
                        aria-label="재생성"
                        title="재생성"
                      >
                        <RefreshCw
                          className={
                            regenerating ? "h-4 w-4 animate-spin" : "h-4 w-4"
                          }
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
                      showOverlay={false}
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
