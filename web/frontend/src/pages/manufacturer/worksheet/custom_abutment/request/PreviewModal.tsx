import { type ReactNode } from "react";
import { DialogClose } from "@radix-ui/react-dialog";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { StlPreviewViewer } from "@/components/StlPreviewViewer";
import {
  type ManufacturerRequest,
  type ReviewStageKey,
  getReviewStageKeyByTab,
} from "./utils";

type PreviewFiles = {
  original?: File | null;
  cam?: File | null;
  title?: string;
  request?: ManufacturerRequest | null;
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
  isCamStage: boolean;
  isMachiningStage: boolean;
  onUpdateReviewStatus: (params: {
    req: ManufacturerRequest;
    status: "PENDING" | "APPROVED" | "REJECTED";
    stageOverride?: ReviewStageKey;
  }) => Promise<void>;
  onDeleteCam: (req: ManufacturerRequest) => Promise<void>;
  onDeleteNc: (
    req: ManufacturerRequest,
    opts?: { nextStage?: string }
  ) => Promise<void>;
  onDeleteStageFile: (params: {
    req: ManufacturerRequest;
    stage: "machining" | "packaging" | "shipping" | "tracking";
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
    stage: string
  ) => Promise<void>;
  setSearchParams: (
    nextInit: ((prev: URLSearchParams) => URLSearchParams) | URLSearchParams,
    navigateOpts?: { replace?: boolean }
  ) => void;
  setConfirmTitle: (title: string) => void;
  setConfirmDescription: (desc: ReactNode) => void;
  setConfirmAction: (
    action:
      | ((() => void | Promise<void>) | null)
      | ((
          prev: (() => void | Promise<void>) | null
        ) => (() => void | Promise<void>) | null)
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
  setSearchParams,
  setConfirmTitle,
  setConfirmDescription,
  setConfirmAction,
  setConfirmOpen,
}: PreviewModalProps) => {
  const req = previewFiles.request as ManufacturerRequest | null;
  if (!req) return null;

  const currentReviewStageKey = getReviewStageKeyByTab({
    isCamStage,
    isMachiningStage,
  });

  const isRequestStage = currentReviewStageKey === "request";

  const canApprove = (() => {
    if (isMachiningStage) {
      return !!req.caseInfos?.stageFiles?.machining?.s3Key || !!previewStageUrl;
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
      ? "생산 → CAM 이동"
      : isCamStage
      ? "CAM → 의뢰 이동"
      : "의뢰 → 이전 단계";
    const desc = isMachiningStage
      ? "생산 단계에서 CAM 단계로 돌아갑니다. 진행할까요?"
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
    req.caseInfos?.file?.fileName ||
    req.caseInfos?.file?.originalName ||
    "original.stl";
  const camName =
    req.caseInfos?.camFile?.fileName ||
    req.caseInfos?.camFile?.originalName ||
    "cam.stl";
  const ncName =
    req.caseInfos?.ncFile?.fileName ||
    req.caseInfos?.ncFile?.originalName ||
    previewNcName ||
    "program.nc";

  const leftTitle = isMachiningStage
    ? ncName
    : isCamStage
    ? camName
    : originalName;
  const rightTitle = isMachiningStage
    ? "로트번호 이미지"
    : isCamStage
    ? ncName
    : camName;

  const leftViewer = isCamStage
    ? previewFiles.cam
    : isMachiningStage
    ? null
    : previewFiles.original;

  const onUploadRight = (file: File) => {
    if (isMachiningStage) {
      void onUploadStageFile({
        req,
        stage: "machining",
        file,
        source: "manual",
      });
      return;
    }
    if (isCamStage) {
      void onUploadNc(req, [file]);
      return;
    }
    void onUploadCam(req, [file]);
  };

  const rightMeta = isMachiningStage
    ? req.caseInfos?.stageFiles?.machining
    : isCamStage
    ? req.caseInfos?.ncFile
    : req.caseInfos?.camFile;
  const hasRightFile = !!rightMeta?.s3Key;

  const accept = isMachiningStage
    ? ".png,.jpg,.jpeg,.webp,.bmp"
    : isCamStage
    ? ".nc"
    : ".stl";

  const fileLabel = hasRightFile
    ? String(rightMeta?.fileName || rightTitle).trim() || rightTitle
    : rightTitle;

  const onDownload = () => {
    if (!hasRightFile) return;
    if (isMachiningStage) {
      void onDownloadStageFile(req, "machining");
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
    if (isMachiningStage) {
      void onDeleteStageFile({
        req,
        stage: "machining",
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
      <DialogContent hideClose className="max-w-4xl">
        <DialogTitle className="sr-only">의뢰 미리보기</DialogTitle>
        <DialogDescription className="sr-only">
          의뢰 파일과 NC 내용을 확인하는 영역입니다.
        </DialogDescription>

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

                openBackConfirm(async () => {
                  if (isMachiningStage) {
                    await onDeleteStageFile({
                      req,
                      stage: "machining",
                    });
                    setSearchParams(
                      (prev) => {
                        const next = new URLSearchParams(prev);
                        next.set("stage", "cam");
                        return next;
                      },
                      { replace: true }
                    );
                    return;
                  }
                  if (isCamStage) {
                    await onDeleteNc(req, { nextStage: "request" });
                    return;
                  }
                  await onDeleteCam(req);
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
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void onUpdateReviewStatus({
                req,
                status: "APPROVED",
                stageOverride: currentReviewStageKey,
              });
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

        <div className="space-y-4">
          {previewLoading ? (
            <div className="rounded-lg border border-dashed p-8 flex flex-col items-center gap-2 text-sm text-slate-500">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-blue-500" />
              <div>STL 불러오는 중...</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-10">
              <div className="border rounded-lg p-3 space-y-2">
                <button
                  type="button"
                  className="text-sm font-semibold text-blue-700 hover:underline text-left"
                  onClick={() => {
                    if (isMachiningStage) {
                      void onDownloadNcFile(req);
                      return;
                    }
                    if (isCamStage) {
                      void onDownloadCamStl(req);
                      return;
                    }
                    void onDownloadOriginalStl(req);
                  }}
                >
                  {leftTitle}
                </button>
                {isMachiningStage ? (
                  <textarea
                    className="w-full h-[300px] rounded-md border border-slate-200 p-3 font-mono text-xs text-slate-700"
                    value={previewNcText}
                    readOnly
                  />
                ) : leftViewer ? (
                  <StlPreviewViewer file={leftViewer} showOverlay={false} />
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-xs text-slate-500">
                    파일 없음
                  </div>
                )}
              </div>

              <div
                className="border rounded-lg p-3 space-y-2"
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
                    title={fileLabel}
                  >
                    {fileLabel}
                  </button>

                  <div className="flex items-center gap-2">
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
                      X
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
                      {isUploading ? "…" : "U"}
                    </label>
                    <input
                      id={pickInputId}
                      type="file"
                      accept={accept}
                      className="hidden"
                      disabled={isUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        onUploadRight(file);
                        e.currentTarget.value = "";
                      }}
                    />
                  </div>
                </div>

                {isMachiningStage ? (
                  previewStageUrl ? (
                    <img
                      src={previewStageUrl}
                      alt={previewStageName || "machining"}
                      className="w-full h-[300px] object-contain rounded-md border border-slate-200"
                    />
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-xs text-slate-500">
                      여기로 이미지를 드롭하거나 U를 눌러 업로드하세요.
                    </div>
                  )
                ) : isCamStage ? (
                  <textarea
                    className="w-full h-[300px] rounded-md border border-slate-200 p-3 font-mono text-xs text-slate-700"
                    value={previewNcText}
                    readOnly
                  />
                ) : previewFiles.cam ? (
                  <StlPreviewViewer
                    file={previewFiles.cam}
                    showOverlay={false}
                  />
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-xs text-slate-500">
                    여기로 파일을 드롭하거나 U를 눌러 업로드하세요.
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
