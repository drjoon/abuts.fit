// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx
// - web/frontend/src/shared/realtime/useAppEventListener.ts
// - web/backend/controllers/ai/lotCapture.controller.js
// change-log:
// - 2026-11-11: 인식 실패 이미지에 3글자를 입력하면 그 이미지로 세척.패킹 의뢰를 찾아 바로 매칭한다.
// - 2026-11-09: 다음 촬영 확정은 대기 목록을 바로 반영한다. 카드 드롭은 인식 없이 그 의뢰에 매칭한다.
// - 2026-11-09: 인식 API 실패·확장자 거절이어도 수동 입력 창을 연다. 다음 촬영 확정은 목록에 없는 후보도 진행.
// - 2026-09-04: 인식 성공 건은 다음 촬영 시 자동 확정. 수동 입력/드롭은 인식값 정정용.
// - 2026-09-04: 자동 인식은 제안만 — 작업자가 이미지·인식값 확인 후 수동 확정.
// - 2026-09-04: AI 미매칭 시 재촬영 대신 pending 수동 매칭(3글자 필터·카드 드롭).
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";
import { type ManufacturerRequest } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";
import { useS3TempUpload } from "@/shared/hooks/useS3TempUpload";

export type CaptureResult = {
  requestId: string;
  recognizedSuffix: string;
  request: ManufacturerRequest;
  capturedAt: Date;
};

export type PendingPackingMatch = {
  id: string;
  s3Key: string;
  s3Url: string;
  previewUrl: string;
  originalName: string;
  fileSize: number;
  aiSuffix: string;
  reason: string;
  candidateMatched: boolean;
  suggestedRequestMongoId: string;
  suggestedRequestId: string;
  suggestedLotValue: string;
  confidence: string;
  createdAt: Date;
  /** object URL이면 clear 시 revoke */
  revokePreviewOnClear?: boolean;
};

export const PACKING_PENDING_DRAG_MIME = "application/x-abuts-packing-pending";
/** 이미 올라간 각인 이미지(프리뷰)를 카드에 놓을 때. 인식하지 않고 그 의뢰에 붙인다. */
export const PACKING_IMAGE_DRAG_MIME = "application/x-abuts-packing-image";

export type PackingImageDragPayload = {
  s3Key: string;
  s3Url?: string;
  fileName?: string;
  fileSize?: number;
  sourceRequestMongoId?: string;
};

export const readPackingImageDragPayload = (
  dataTransfer: DataTransfer | null,
): PackingImageDragPayload | null => {
  if (!dataTransfer) return null;
  let raw = "";
  try {
    raw = dataTransfer.getData(PACKING_IMAGE_DRAG_MIME);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PackingImageDragPayload;
    const s3Key = String(parsed?.s3Key || "").trim();
    if (!s3Key) return null;
    return {
      s3Key,
      s3Url: String(parsed?.s3Url || "").trim(),
      fileName: String(parsed?.fileName || "").trim(),
      fileSize: Number(parsed?.fileSize) || 0,
      sourceRequestMongoId: String(parsed?.sourceRequestMongoId || "").trim(),
    };
  } catch {
    return null;
  }
};

const PACKING_IMAGE_EXTS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".bmp",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
];

export const isPackingCaptureImageFile = (file: File) => {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  return PACKING_IMAGE_EXTS.some((ext) => name.endsWith(ext));
};

const makePendingId = () =>
  `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const clearPackingImageLocal = (req: ManufacturerRequest): ManufacturerRequest => {
  const caseInfos = { ...(req.caseInfos || {}) } as ManufacturerRequest["caseInfos"] & {
    stageFiles?: Record<string, Record<string, unknown>>;
    reviewByStage?: Record<string, Record<string, unknown>>;
  };
  const stageFiles = { ...(caseInfos.stageFiles || {}) };
  const packing = { ...(stageFiles.packing || {}) };
  stageFiles.packing = {
    ...packing,
    fileName: "",
    filePath: "",
    s3Key: "",
    s3Url: "",
    fileType: "",
    fileSize: 0,
  };
  const reviewByStage = { ...(caseInfos.reviewByStage || {}) };
  reviewByStage.packing = {
    ...(reviewByStage.packing || {}),
    status: "PENDING",
    reason: "",
  };
  return {
    ...req,
    caseInfos: {
      ...caseInfos,
      stageFiles,
      reviewByStage,
    },
  };
};

export const extractLotSuffix3 = (value: string | null | undefined) => {
  const s = String(value || "").toUpperCase();
  const match = s.match(/[A-Z]{3}(?!.*[A-Z])/);
  return match ? match[0] : "";
};

const pendingFromCapturePayload = (
  payload: Record<string, unknown>,
  extras?: Partial<PendingPackingMatch>,
): Omit<PendingPackingMatch, "id" | "createdAt"> | null => {
  const s3Key = String(payload.s3Key || extras?.s3Key || "").trim();
  if (!s3Key) return null;
  const recognized =
    payload.recognized && typeof payload.recognized === "object"
      ? (payload.recognized as Record<string, unknown>)
      : {};
  return {
    s3Key,
    s3Url: String(payload.s3Url || extras?.s3Url || "").trim(),
    previewUrl: String(
      payload.previewUrl || payload.s3Url || extras?.previewUrl || "",
    ).trim(),
    originalName: String(
      payload.originalName || extras?.originalName || "capture.jpg",
    ).trim(),
    fileSize: Number(payload.fileSize ?? extras?.fileSize) || 0,
    aiSuffix: extractLotSuffix3(
      String(payload.suffix || recognized.lotNumber || extras?.aiSuffix || ""),
    ),
    reason: String(payload.reason || extras?.reason || "").trim(),
    candidateMatched: Boolean(
      payload.candidateMatched ?? extras?.candidateMatched,
    ),
    suggestedRequestMongoId: String(
      payload.suggestedRequestMongoId || extras?.suggestedRequestMongoId || "",
    ).trim(),
    suggestedRequestId: String(
      payload.suggestedRequestId || extras?.suggestedRequestId || "",
    ).trim(),
    suggestedLotValue: String(
      payload.suggestedLotValue || extras?.suggestedLotValue || "",
    ).trim(),
    confidence: String(
      recognized.confidence || extras?.confidence || "",
    ).trim(),
    revokePreviewOnClear: extras?.revokePreviewOnClear,
  };
};

export const usePackingCapture = ({
  token,
  requests,
  toast,
  setRequests,
  previewOpen,
  previewFiles,
  handleOpenPreview,
  onCaptureResult,
}: {
  token?: string | null;
  requests: ManufacturerRequest[];
  toast: (opts: any) => void;
  setRequests: Dispatch<SetStateAction<ManufacturerRequest[]>>;
  previewOpen: boolean;
  previewFiles: any;
  handleOpenPreview: (req: ManufacturerRequest) => Promise<void>;
  onCaptureResult?: (result: CaptureResult) => void;
}) => {
  const { uploadFiles: uploadToS3 } = useS3TempUpload({ token });
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrStage, setOcrStage] = useState<
    "idle" | "upload" | "recognize" | "match"
  >("idle");
  const [pendingMatches, setPendingMatches] = useState<PendingPackingMatch[]>(
    [],
  );
  const [activePendingId, setActivePendingId] = useState<string | null>(null);
  const [manualSuffixQuery, setManualSuffixQuery] = useState("");
  const [matchingBusy, setMatchingBusy] = useState(false);
  /** miss: 코드에 해당하는 세척.패킹 의뢰 없음. ambiguous: 같은 코드가 여러 건. error: 요청 실패. */
  const [suffixCommitNote, setSuffixCommitNote] = useState<
    "" | "miss" | "ambiguous" | "error"
  >("");
  const requestsRef = useRef(requests);
  const previewOpenRef = useRef(previewOpen);
  const previewFilesRef = useRef(previewFiles);
  const handleOpenPreviewRef = useRef(handleOpenPreview);
  const onCaptureResultRef = useRef(onCaptureResult);
  const pendingMatchesRef = useRef(pendingMatches);
  const confirmingKeysRef = useRef(new Set<string>());
  const manualSuffixQueryRef = useRef(manualSuffixQuery);

  useEffect(() => {
    requestsRef.current = requests;
    previewOpenRef.current = previewOpen;
    previewFilesRef.current = previewFiles;
    handleOpenPreviewRef.current = handleOpenPreview;
    onCaptureResultRef.current = onCaptureResult;
    manualSuffixQueryRef.current = manualSuffixQuery;
  }, [
    onCaptureResult,
    handleOpenPreview,
    manualSuffixQuery,
    previewFiles,
    previewOpen,
    requests,
  ]);

  useEffect(() => {
    setSuffixCommitNote("");
  }, [manualSuffixQuery]);

  const commitPendingMatches = useCallback(
    (updater: (prev: PendingPackingMatch[]) => PendingPackingMatch[]) => {
      const next = updater(pendingMatchesRef.current);
      pendingMatchesRef.current = next;
      setPendingMatches(next);
    },
    [],
  );

  useEffect(() => {
    if (!pendingMatches.length) {
      setActivePendingId(null);
      return;
    }
    if (
      !activePendingId ||
      !pendingMatches.some((row) => row.id === activePendingId)
    ) {
      setActivePendingId(pendingMatches[0].id);
    }
  }, [activePendingId, pendingMatches]);

  const activePending =
    pendingMatches.find((row) => row.id === activePendingId) ||
    pendingMatches[0] ||
    null;

  const pushPendingMatch = useCallback(
    (row: Omit<PendingPackingMatch, "id" | "createdAt"> & { id?: string }) => {
      const s3Key = String(row.s3Key || "").trim();
      if (!s3Key) return;
      commitPendingMatches((prev) => {
        if (prev.some((item) => item.s3Key === s3Key)) {
          return prev.map((item) =>
            item.s3Key === s3Key
              ? {
                  ...item,
                  ...row,
                  id: item.id,
                  createdAt: item.createdAt,
                  previewUrl: row.previewUrl || item.previewUrl,
                }
              : item,
          );
        }
        const next: PendingPackingMatch = {
          id: row.id || makePendingId(),
          s3Key,
          s3Url: String(row.s3Url || "").trim(),
          previewUrl: String(row.previewUrl || row.s3Url || "").trim(),
          originalName: String(row.originalName || "capture.jpg").trim(),
          fileSize: Number(row.fileSize) || 0,
          aiSuffix: extractLotSuffix3(row.aiSuffix),
          reason: String(row.reason || "").trim(),
          candidateMatched: Boolean(row.candidateMatched),
          suggestedRequestMongoId: String(
            row.suggestedRequestMongoId || "",
          ).trim(),
          suggestedRequestId: String(row.suggestedRequestId || "").trim(),
          suggestedLotValue: String(row.suggestedLotValue || "").trim(),
          confidence: String(row.confidence || "").trim(),
          createdAt: new Date(),
          revokePreviewOnClear: !!row.revokePreviewOnClear,
        };
        return [next, ...prev].slice(0, 12);
      });
      if (row.aiSuffix) {
        const suffix = extractLotSuffix3(row.aiSuffix);
        if (suffix) setManualSuffixQuery(suffix.slice(0, 3));
      }
    },
    [commitPendingMatches],
  );

  const clearPendingMatch = useCallback((pendingId?: string | null) => {
    commitPendingMatches((prev) => {
      const targetId = pendingId || activePendingId || prev[0]?.id;
      const removed = prev.filter((row) => {
        if (row.id !== targetId) return true;
        if (row.revokePreviewOnClear && row.previewUrl.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(row.previewUrl);
          } catch {
            // ignore
          }
        }
        return false;
      });
      return removed;
    });
  }, [activePendingId, commitPendingMatches]);

  const clearAllPendingMatches = useCallback(() => {
    commitPendingMatches((prev) => {
      for (const row of prev) {
        if (row.revokePreviewOnClear && row.previewUrl.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(row.previewUrl);
          } catch {
            // ignore
          }
        }
      }
      return [];
    });
    setManualSuffixQuery("");
  }, [commitPendingMatches]);

  // 업로드 대역폭용 다운스케일. 긴 변만 상한으로 줄이고, 이미 작은 크롭은 절대 축소하지 않는다.
  const resizeImageFile = useCallback((file: File) => {
    const MAX_EDGE = 1600;
    return new Promise<File>((resolve) => {
      const reader = new FileReader();
      const image = new Image();
      reader.onload = () => {
        image.onload = () => {
          const longest = Math.max(image.width, image.height);
          if (!longest || longest <= MAX_EDGE) return resolve(file);
          const scale = MAX_EDGE / longest;
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(file);
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          const mime = file.type || "image/jpeg";
          canvas.toBlob(
            (blob) => {
              if (!blob) return resolve(file);
              resolve(new File([blob], file.name, { type: mime }));
            },
            mime,
            mime === "image/jpeg" ? 0.92 : undefined,
          );
        };
        image.onerror = () => resolve(file);
        image.src = reader.result as string;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  }, []);

  const bindCaptureToRequest = useCallback(
    async (params: {
      request: ManufacturerRequest;
      s3Key: string;
      s3Url?: string;
      originalName?: string;
      fileSize?: number;
      recognizedSuffix?: string;
      pendingId?: string | null;
      /** auto: 다음 촬영으로 이전 성공건 확정. manual: 작업자 정정/확정 */
      mode?: "auto" | "manual";
      /** 다른 의뢰에 붙어 있던 같은 각인 파일. S3는 지우지 않고 메타만 뗀다. */
      detachFromRequestMongoId?: string;
    }) => {
      if (!token) return false;
      const requestMongoId = String(params.request._id || "").trim();
      if (!requestMongoId || !params.s3Key) return false;
      const mode = params.mode || "manual";
      const detachFrom = String(params.detachFromRequestMongoId || "").trim();
      setMatchingBusy(true);
      try {
        const captureRes = await fetch("/api/bg/lot-capture/packing", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            s3Key: params.s3Key,
            s3Url: params.s3Url || "",
            originalName: params.originalName || "capture.jpg",
            fileSize: params.fileSize || 0,
            recognizedSuffix: params.recognizedSuffix || "",
            requestMongoId,
            source: "manual",
            detachFromRequestMongoId:
              detachFrom && detachFrom !== requestMongoId ? detachFrom : "",
          }),
        });
        const captureData = await captureRes.json().catch(() => ({}));
        if (!captureRes.ok || captureData?.success === false) {
          throw new Error(
            captureData?.message || "매칭 처리에 실패했습니다.",
          );
        }
        if (!captureData?.data?.matched) {
          throw new Error(
            captureData?.message ||
              "선택한 의뢰에 매칭하지 못했습니다. 세척.패킹 단계인지 확인하세요.",
          );
        }
        if (params.pendingId) clearPendingMatch(params.pendingId);
        setRequests((prev) =>
          prev
            .filter((req) => String(req._id || "").trim() !== requestMongoId)
            .map((req) =>
              detachFrom && String(req._id || "").trim() === detachFrom
                ? clearPackingImageLocal(req)
                : req,
            ),
        );
        toast({
          title: mode === "auto" ? "인식 확정" : "매칭 완료",
          description: `${params.request.requestId || requestMongoId} → 포장.발송`,
        });
        return true;
      } catch (error) {
        toast({
          title: mode === "auto" ? "자동 확정 실패" : "매칭 실패",
          description:
            (error as Error)?.message ||
            "이미지를 의뢰에 연결하는 중 오류가 발생했습니다.",
          variant: "destructive",
        });
        return false;
      } finally {
        setMatchingBusy(false);
      }
    },
    [clearPendingMatch, setRequests, toast, token],
  );

  const findSuggestedRequest = useCallback((pending: PendingPackingMatch) => {
    const suggestedMongoId = String(pending.suggestedRequestMongoId || "").trim();
    const suggestedBusinessId = String(pending.suggestedRequestId || "").trim();
    if (!suggestedMongoId && !suggestedBusinessId) return null;
    return (
      requestsRef.current.find((req) => {
        const mongoId = String(req._id || "").trim();
        const businessId = String(req.requestId || "").trim();
        return (
          (!!suggestedMongoId && mongoId === suggestedMongoId) ||
          (!!suggestedBusinessId && businessId === suggestedBusinessId)
        );
      }) || null
    );
  }, []);

  /** 인식 성공(후보 있음) 대기건 — 다음 촬영이 오면 AI 제안대로 확정 */
  const autoConfirmSuccessfulPendings = useCallback(
    async (exceptS3Key?: string) => {
      const skipKey = String(exceptS3Key || "").trim();
      const toConfirm = pendingMatchesRef.current
        .filter(
          (row) =>
            row.candidateMatched &&
            (row.suggestedRequestMongoId || row.suggestedRequestId) &&
            row.s3Key !== skipKey &&
            !confirmingKeysRef.current.has(row.s3Key),
        )
        // newest-first 배열이므로 오래된 것부터 확정
        .slice()
        .reverse();
      for (const pending of toConfirm) {
        confirmingKeysRef.current.add(pending.s3Key);
      }
      try {
        for (const pending of toConfirm) {
          const request =
            findSuggestedRequest(pending) ||
            (pending.suggestedRequestMongoId || pending.suggestedRequestId
              ? ({
                  _id: pending.suggestedRequestMongoId,
                  requestId: pending.suggestedRequestId,
                } as ManufacturerRequest)
              : null);
          if (!request) continue;
          await bindCaptureToRequest({
            request,
            s3Key: pending.s3Key,
            s3Url: pending.s3Url,
            originalName: pending.originalName,
            fileSize: pending.fileSize,
            recognizedSuffix: pending.aiSuffix,
            pendingId: pending.id,
            mode: "auto",
          });
        }
      } finally {
        for (const pending of toConfirm) {
          confirmingKeysRef.current.delete(pending.s3Key);
        }
      }
    },
    [bindCaptureToRequest, findSuggestedRequest],
  );

  const enqueuePendingMatch = useCallback(
    async (
      row: Omit<PendingPackingMatch, "id" | "createdAt"> & { id?: string },
    ) => {
      const s3Key = String(row.s3Key || "").trim();
      if (!s3Key) return;
      const isUpdate = pendingMatchesRef.current.some(
        (item) => item.s3Key === s3Key,
      );
      // 창을 먼저 연다. 이전 성공 건 확정은 그 다음이다.
      // 확정을 기다린 뒤에 넣으면 다음 촬영이 빈 목록을 보고 넘어가지 않는다.
      pushPendingMatch(row);
      if (!isUpdate) {
        await autoConfirmSuccessfulPendings(s3Key);
      }
    },
    [autoConfirmSuccessfulPendings, pushPendingMatch],
  );

  const openManualPendingFromUpload = useCallback(
    async (params: {
      s3Key: string;
      s3Url?: string;
      originalName?: string;
      fileSize?: number;
      sourceFile?: File | null;
      reason?: string;
    }) => {
      const s3Key = String(params.s3Key || "").trim();
      if (!s3Key) return;
      let previewUrl = String(params.s3Url || "").trim();
      let revokePreviewOnClear = false;
      if (!previewUrl && params.sourceFile) {
        try {
          previewUrl = URL.createObjectURL(params.sourceFile);
          revokePreviewOnClear = true;
        } catch {
          previewUrl = "";
        }
      }
      await enqueuePendingMatch({
        s3Key,
        s3Url: String(params.s3Url || "").trim(),
        previewUrl,
        originalName:
          params.originalName || params.sourceFile?.name || "capture.jpg",
        fileSize: Number(params.fileSize) || params.sourceFile?.size || 0,
        aiSuffix: "",
        reason: params.reason || "recognition_failed",
        candidateMatched: false,
        suggestedRequestMongoId: "",
        suggestedRequestId: "",
        suggestedLotValue: "",
        confidence: "",
        revokePreviewOnClear,
      });
    },
    [enqueuePendingMatch],
  );

  const matchPendingToRequest = useCallback(
    async (request: ManufacturerRequest, pendingId?: string | null) => {
      const pending =
        pendingMatchesRef.current.find(
          (row) => row.id === (pendingId || activePendingId),
        ) || pendingMatchesRef.current[0];
      if (!pending) {
        toast({
          title: "매칭할 이미지가 없습니다",
          description: "먼저 각인 이미지를 업로드하거나 촬영하세요.",
          variant: "destructive",
        });
        return false;
      }
      // 수동 입력값이 있으면 그걸로 정정, 없으면 AI 인식값
      const corrected = extractLotSuffix3(manualSuffixQuery);
      const ok = await bindCaptureToRequest({
        request,
        s3Key: pending.s3Key,
        s3Url: pending.s3Url,
        originalName: pending.originalName,
        fileSize: pending.fileSize,
        recognizedSuffix: corrected || pending.aiSuffix,
        pendingId: pending.id,
        mode: "manual",
      });
      if (
        ok &&
        extractLotSuffix3(manualSuffixQueryRef.current) ===
          (corrected || pending.aiSuffix)
      ) {
        setManualSuffixQuery("");
      }
      return ok;
    },
    [activePendingId, bindCaptureToRequest, manualSuffixQuery, toast],
  );

  /** 선택한 대기 이미지 + 3글자. 목록에 아직 없어도 서버가 세척.패킹에서 찾는다. */
  const matchPendingBySuffix = useCallback(
    async (suffix: string, pendingId: string) => {
      const code = extractLotSuffix3(suffix);
      if (!token || code.length !== 3) return false;
      const pending =
        pendingMatchesRef.current.find((row) => row.id === pendingId) || null;
      if (!pending) {
        toast({
          title: "매칭할 이미지가 없습니다",
          description: "먼저 각인 이미지를 고르세요.",
          variant: "destructive",
        });
        return false;
      }
      setMatchingBusy(true);
      setSuffixCommitNote("");
      try {
        const captureRes = await fetch("/api/bg/lot-capture/packing", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            s3Key: pending.s3Key,
            s3Url: pending.s3Url || "",
            originalName: pending.originalName || "capture.jpg",
            fileSize: pending.fileSize || 0,
            recognizedSuffix: code,
            confirmBySuffix: true,
            source: "manual",
          }),
        });
        const captureData = await captureRes.json().catch(() => ({}));
        if (!captureRes.ok || captureData?.success === false) {
          throw new Error(captureData?.message || "매칭 처리에 실패했습니다.");
        }
        const data =
          captureData?.data && typeof captureData.data === "object"
            ? (captureData.data as Record<string, unknown>)
            : {};
        if (!data.matched) {
          const suggestedMongoId = String(
            data.suggestedRequestMongoId || "",
          ).trim();
          const suggestedRequestId = String(data.suggestedRequestId || "").trim();
          if (
            data.candidateMatched &&
            (suggestedMongoId || suggestedRequestId)
          ) {
            const ok = await bindCaptureToRequest({
              request: {
                _id: suggestedMongoId,
                requestId: suggestedRequestId,
              } as ManufacturerRequest,
              s3Key: pending.s3Key,
              s3Url: pending.s3Url,
              originalName: pending.originalName,
              fileSize: pending.fileSize,
              recognizedSuffix: code,
              pendingId: pending.id,
              mode: "manual",
            });
            if (ok) setManualSuffixQuery("");
            return ok;
          }
          const reason = String(data.reason || "");
          setSuffixCommitNote(
            reason === "ambiguous_suffix" ? "ambiguous" : "miss",
          );
          return false;
        }
        clearPendingMatch(pending.id);
        const requestMongoId = String(data.requestMongoId || "").trim();
        const requestId = String(data.requestId || "").trim();
        if (requestMongoId || requestId) {
          setRequests((prev) =>
            prev.filter((req) => {
              const mongoId = String(req._id || "").trim();
              const businessId = String(req.requestId || "").trim();
              return !(
                (requestMongoId && mongoId === requestMongoId) ||
                (requestId && businessId === requestId)
              );
            }),
          );
        }
        // 이 코드는 방금 처리한 이미지 것이다. 다음 이미지에 넘어가지 않게 비운다.
        setManualSuffixQuery("");
        toast({
          title: "매칭 완료",
          description: `${requestId || code} → 포장.발송`,
        });
        return true;
      } catch (error) {
        setSuffixCommitNote("error");
        toast({
          title: "매칭 실패",
          description:
            (error as Error)?.message ||
            "이미지를 의뢰에 연결하는 중 오류가 발생했습니다.",
          variant: "destructive",
        });
        return false;
      } finally {
        setMatchingBusy(false);
      }
    },
    [bindCaptureToRequest, clearPendingMatch, setRequests, toast, token],
  );

  const confirmSuggestedMatch = useCallback(
    async (pendingId?: string | null) => {
      const pending =
        pendingMatchesRef.current.find(
          (row) => row.id === (pendingId || activePendingId),
        ) || pendingMatchesRef.current[0];
      if (!pending) return false;
      const suggested =
        findSuggestedRequest(pending) ||
        (pending.suggestedRequestMongoId || pending.suggestedRequestId
          ? ({
              _id: pending.suggestedRequestMongoId,
              requestId: pending.suggestedRequestId,
            } as ManufacturerRequest)
          : null);
      if (!suggested) {
        toast({
          title: "제안 의뢰를 찾을 수 없습니다",
          description: "카드에 이미지를 놓거나, 각인 3글자를 입력하세요.",
          variant: "destructive",
        });
        return false;
      }
      return bindCaptureToRequest({
        request: suggested,
        s3Key: pending.s3Key,
        s3Url: pending.s3Url,
        originalName: pending.originalName,
        fileSize: pending.fileSize,
        recognizedSuffix: pending.aiSuffix,
        pendingId: pending.id,
        mode: "manual",
      });
    },
    [activePendingId, bindCaptureToRequest, findSuggestedRequest, toast],
  );

  const handlePackingImageDropOnRequest = useCallback(
    async (
      request: ManufacturerRequest,
      imageFiles: File[],
      extras?: {
        pendingId?: string;
        existing?: PackingImageDragPayload | null;
      },
    ) => {
      if (!token || !request?._id) return;
      const existing = extras?.existing;
      if (existing?.s3Key) {
        setOcrProcessing(true);
        setOcrStage("match");
        try {
          await bindCaptureToRequest({
            request,
            s3Key: existing.s3Key,
            s3Url: existing.s3Url,
            originalName: existing.fileName || "engraving.jpg",
            fileSize: existing.fileSize,
            mode: "manual",
            detachFromRequestMongoId: existing.sourceRequestMongoId,
          });
        } finally {
          setOcrProcessing(false);
          setOcrStage("idle");
        }
        return;
      }
      if (!imageFiles.length) {
        await matchPendingToRequest(request, extras?.pendingId);
        return;
      }
      setOcrProcessing(true);
      setOcrStage("upload");
      let uploadedKey = "";
      let uploadedUrl = "";
      let uploadedName = imageFiles[0]?.name || "capture.jpg";
      let uploadedSize = imageFiles[0]?.size || 0;
      try {
        const resized = await resizeImageFile(imageFiles[0]);
        const uploadResult = await uploadToS3([resized]);
        const uploaded = uploadResult[0];
        const uploadedMeta = (uploaded || {}) as any;
        if (!uploaded?.key) {
          throw new Error("이미지 업로드에 실패했습니다.");
        }
        uploadedKey = uploaded.key;
        uploadedUrl =
          uploadedMeta.url || uploadedMeta.s3Url || uploadedMeta.location || "";
        uploadedName = uploaded.originalName || imageFiles[0].name;
        uploadedSize = uploadedMeta.fileSize || imageFiles[0].size || 0;
        setOcrStage("match");
        const matched = await bindCaptureToRequest({
          request,
          s3Key: uploaded.key,
          s3Url: uploadedUrl,
          originalName: uploadedName,
          fileSize: uploadedSize,
          recognizedSuffix: extractLotSuffix3(manualSuffixQuery),
        });
        if (!matched) {
          await openManualPendingFromUpload({
            s3Key: uploadedKey,
            s3Url: uploadedUrl,
            originalName: uploadedName,
            fileSize: uploadedSize,
            sourceFile: imageFiles[0],
            reason: "manual_bind_failed",
          });
        }
      } catch (error) {
        if (uploadedKey) {
          await openManualPendingFromUpload({
            s3Key: uploadedKey,
            s3Url: uploadedUrl,
            originalName: uploadedName,
            fileSize: uploadedSize,
            sourceFile: imageFiles[0],
            reason: "manual_bind_failed",
          });
        }
        toast({
          title: "카드 매칭 실패",
          description:
            (error as Error)?.message ||
            "이미지를 의뢰 카드에 연결하지 못했습니다. 3글자를 입력하세요.",
          variant: "destructive",
        });
      } finally {
        setOcrProcessing(false);
        setOcrStage("idle");
      }
    },
    [
      bindCaptureToRequest,
      matchPendingToRequest,
      manualSuffixQuery,
      openManualPendingFromUpload,
      resizeImageFile,
      toast,
      token,
      uploadToS3,
    ],
  );

  const handlePackingImageDrop = useCallback(
    async (imageFiles: File[]) => {
      // 프리뷰 모달이 열려 있을 때는 카드 기반 LOT 인식 캡처를 비활성화한다.
      if (previewOpenRef.current) return;
      if (!token || imageFiles.length === 0) return;
      setOcrProcessing(true);
      setOcrStage("upload");
      try {
        const resizedFiles = await Promise.all(
          imageFiles.map((file) => resizeImageFile(file)),
        );
        const uploadResult = await uploadToS3(resizedFiles);
        setOcrStage("recognize");
        for (let index = 0; index < uploadResult.length; index += 1) {
          const uploaded = uploadResult[index];
          const sourceFile = imageFiles[index];
          const uploadedMeta = (uploaded || {}) as any;
          if (!uploaded?.key) {
            toast({
              title: "이미지 업로드에 실패했습니다",
              description: "잠시 후 다시 시도해주세요.",
              variant: "destructive",
            });
            continue;
          }
          try {
            const captureRes = await fetch("/api/bg/lot-capture/packing", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                s3Key: uploaded.key,
                s3Url: uploadedMeta.url || uploadedMeta.s3Url || "",
                originalName: uploaded.originalName,
                fileSize:
                  uploadedMeta.fileSize || sourceFile?.size || 0,
                source: "manual",
              }),
            });
            const captureData = await captureRes.json().catch(() => ({}));
            if (!captureRes.ok || captureData?.success === false) {
              throw new Error(
                captureData?.message || "세척·포장 캡쳐 처리에 실패했습니다.",
              );
            }

            const data =
              captureData?.data && typeof captureData.data === "object"
                ? (captureData.data as Record<string, unknown>)
                : {};
            // 자동 인식은 항상 작업자 확인 대기(needsConfirm). 즉시 확정하지 않는다.
            let previewUrl = String(
              data.previewUrl || data.s3Url || "",
            ).trim();
            let revokePreviewOnClear = false;
            if (!previewUrl && sourceFile) {
              try {
                previewUrl = URL.createObjectURL(sourceFile);
                revokePreviewOnClear = true;
              } catch {
                previewUrl = "";
              }
            }
            const pendingRow = pendingFromCapturePayload(data, {
              s3Key: uploaded.key,
              s3Url: String(
                data.s3Url || uploadedMeta.url || uploadedMeta.s3Url || "",
              ).trim(),
              previewUrl,
              originalName:
                uploaded.originalName || sourceFile?.name || "capture.jpg",
              fileSize:
                Number(data.fileSize) ||
                uploadedMeta.fileSize ||
                sourceFile?.size ||
                0,
              revokePreviewOnClear,
            });
            if (pendingRow) {
              await enqueuePendingMatch(pendingRow);
            }
            const recognizedSuffix = extractLotSuffix3(
              String(data.suffix || ""),
            );
            toast({
              title: pendingRow?.candidateMatched
                ? `인식: ${recognizedSuffix || "확인"}`
                : "인식 실패 — 정정 필요",
              description: pendingRow?.candidateMatched
                ? "맞으면 다음 촬영으로 확정. 틀리면 3글자 수정 또는 카드에 드롭."
                : recognizedSuffix
                  ? `인식값 ${recognizedSuffix}. 수동 입력 또는 카드에 드롭하세요.`
                  : "이미지를 보고 각인 3글자를 입력하거나 카드에 드롭하세요.",
            });
          } catch (error) {
            await openManualPendingFromUpload({
              s3Key: uploaded.key,
              s3Url: uploadedMeta.url || uploadedMeta.s3Url || "",
              originalName:
                uploaded.originalName || sourceFile?.name || "capture.jpg",
              fileSize: uploadedMeta.fileSize || sourceFile?.size || 0,
              sourceFile,
              reason: "recognition_failed",
            });
            toast({
              title: "인식 실패 — 직접 입력",
              description:
                (error as Error)?.message ||
                "각인 3글자를 입력하거나 카드에 드롭하세요.",
              variant: "destructive",
            });
          }
        }
      } catch (error: any) {
        console.error("Packing LOT 인식 처리 오류:", error);
        toast({
          title: "이미지 처리 실패",
          description:
            error?.message || "세척·포장 이미지 처리 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      } finally {
        setOcrProcessing(false);
        setOcrStage("idle");
      }
    },
    [
      enqueuePendingMatch,
      openManualPendingFromUpload,
      resizeImageFile,
      toast,
      token,
      uploadToS3,
    ],
  );

  const handlePageDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);

      const dragTypes = Array.from(e.dataTransfer.types || []);
      // 카드 매칭용 드래그는 페이지 인식으로 넣지 않는다.
      if (
        dragTypes.includes(PACKING_PENDING_DRAG_MIME) ||
        dragTypes.includes(PACKING_IMAGE_DRAG_MIME)
      ) {
        return;
      }
      if (previewOpenRef.current) {
        toast({
          title: "프리뷰가 열려 있습니다",
          description: "프리뷰를 닫은 뒤 각인 이미지를 드롭하세요.",
        });
        return;
      }

      const files = Array.from(e.dataTransfer.files || []);
      if (!files.length) return;
      const imageFiles = files.filter((file) => isPackingCaptureImageFile(file));
      if (!imageFiles.length) {
        toast({
          title: "이미지 파일이 아닙니다",
          description: "jpg, png, webp, bmp, tiff 파일을 드롭하세요.",
        });
        return;
      }
      void handlePackingImageDrop(imageFiles);
    },
    [handlePackingImageDrop, toast],
  );

  const handlePageDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (previewOpenRef.current) {
      setIsDraggingOver(false);
      return;
    }
    const dragTypes = Array.from(e.dataTransfer.types || []);
    if (
      dragTypes.includes(PACKING_PENDING_DRAG_MIME) ||
      dragTypes.includes(PACKING_IMAGE_DRAG_MIME)
    ) {
      setIsDraggingOver(false);
      return;
    }
    setIsDraggingOver(true);
  }, []);

  const handlePageDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  }, []);

  useAppEventListener({
    enabled: Boolean(token),
    eventTypes: [
      "packing:capture-processed",
      "packing:capture-needs-confirm",
      "packing:capture-unmatched",
    ],
    onMatch: (evt) => {
      const payload =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as Record<string, unknown>)
          : {};
      const eventType = String(evt?.type || "").trim();

      if (
        eventType === "packing:capture-needs-confirm" ||
        eventType === "packing:capture-unmatched"
      ) {
        // frontend drop 경로는 HTTP 응답에서 이미 pending에 넣는다.
        if (String(payload.capturedBy || "") === "frontend") return;
        const pendingRow = pendingFromCapturePayload(payload);
        if (!pendingRow) return;
        void enqueuePendingMatch(pendingRow).then(() => {
          const suffix = pendingRow.aiSuffix;
          toast({
            title: pendingRow.candidateMatched
              ? `인식: ${suffix || "확인"}`
              : "인식 실패 — 정정 필요",
            description: pendingRow.candidateMatched
              ? "맞으면 다음 촬영으로 확정. 틀리면 3글자 수정 또는 카드에 드롭."
              : "이미지를 보고 각인 3글자를 입력하거나 카드에 드롭하세요.",
          });
        });
        return;
      }

      const requestId = String(payload.requestId || "").trim();
      const requestMongoId = String(payload.requestMongoId || "").trim();
      const suffix = String(payload.recognizedSuffix || "").trim();
      const packingFile =
        payload.packingFile && typeof payload.packingFile === "object"
          ? (payload.packingFile as Record<string, unknown>)
          : null;
      const packingS3Key = String(packingFile?.s3Key || "").trim();
      if (packingS3Key) {
        commitPendingMatches((prev) =>
          prev.filter((row) => {
            if (row.s3Key !== packingS3Key) return true;
            if (row.revokePreviewOnClear && row.previewUrl.startsWith("blob:")) {
              try {
                URL.revokeObjectURL(row.previewUrl);
              } catch {
                // ignore
              }
            }
            return false;
          }),
        );
      }
      const eventRequest = payload.request as ManufacturerRequest | undefined;
      const movedToStage = String(payload.movedToStage || "").trim();
      const detachedFromRequestMongoId = String(
        payload.detachedFromRequestMongoId || "",
      ).trim();
      const mergedEventRequest = (() => {
        const currentRequest = requestsRef.current.find((req) => {
          const currentMongoId = String(req._id || "").trim();
          const currentRequestId = String(req.requestId || "").trim();
          return (
            (!!requestMongoId && currentMongoId === requestMongoId) ||
            (!!requestId && currentRequestId === requestId)
          );
        });
        if (currentRequest && eventRequest) {
          return {
            ...currentRequest,
            ...eventRequest,
            requestor: eventRequest.requestor || currentRequest.requestor,
            requestorBusiness:
              eventRequest.requestorBusiness ||
              currentRequest.requestorBusiness,
            caseInfos: {
              ...(currentRequest.caseInfos || {}),
              ...(eventRequest.caseInfos || {}),
            },
            lotNumber: eventRequest.lotNumber || currentRequest.lotNumber,
            productionSchedule:
              eventRequest.productionSchedule ||
              currentRequest.productionSchedule,
            timeline: eventRequest.timeline || currentRequest.timeline,
          } as ManufacturerRequest;
        }
        return eventRequest || currentRequest;
      })();
      if (requestId || requestMongoId) {
        setRequests((prev) => {
          if (movedToStage && movedToStage !== "세척.패킹") {
            return prev
              .filter((req) => {
                const currentMongoId = String(req._id || "").trim();
                const currentRequestId = String(req.requestId || "").trim();
                return !(
                  (!!requestMongoId && currentMongoId === requestMongoId) ||
                  (!!requestId && currentRequestId === requestId)
                );
              })
              .map((req) =>
                detachedFromRequestMongoId &&
                String(req._id || "").trim() === detachedFromRequestMongoId
                  ? clearPackingImageLocal(req)
                  : req,
              );
          }
          return prev.map((req) => {
            const currentMongoId = String(req._id || "").trim();
            const currentRequestId = String(req.requestId || "").trim();
            if (
              (!requestMongoId || currentMongoId !== requestMongoId) &&
              (!requestId || currentRequestId !== requestId)
            ) {
              return req;
            }
            return {
              ...req,
              ...(mergedEventRequest || {}),
              realtimeProgress: null,
            };
          });
        });
      }
      void (async () => {
        if (previewOpenRef.current && previewFilesRef.current.request?._id) {
          const currentPreviewId = String(
            previewFilesRef.current.request._id || "",
          ).trim();
          const matchedRequest = mergedEventRequest
            ? (() => {
                const mongoId = String(mergedEventRequest._id || "").trim();
                const businessId = String(
                  mergedEventRequest.requestId || "",
                ).trim();
                return mongoId === currentPreviewId ||
                  (requestMongoId && mongoId === requestMongoId) ||
                  (requestId && businessId === requestId)
                  ? mergedEventRequest
                  : null;
              })()
            : null;
          if (matchedRequest) {
            await handleOpenPreviewRef.current(matchedRequest);
          }
        }
        if (mergedEventRequest && onCaptureResultRef.current) {
          onCaptureResultRef.current({
            requestId: String(mergedEventRequest.requestId || requestId || ""),
            recognizedSuffix: suffix,
            request: mergedEventRequest,
            capturedAt: new Date(),
          });
        }
      })();
      if (String(payload.capturedBy || "") !== "frontend") {
        toast({
          title: `각인 매칭 완료: ${suffix || "확정"}`,
          description: requestId
            ? `${requestId} → 포장.발송으로 이동`
            : "세척.패킹 처리 결과가 반영되었습니다.",
        });
      }
    },
  });

  return {
    isDraggingOver,
    ocrProcessing,
    ocrStage,
    handlePageDrop,
    handlePageDragOver,
    handlePageDragLeave,
    handlePackingImageDrop,
    handlePackingImageDropOnRequest,
    pendingMatches,
    activePending,
    activePendingId,
    setActivePendingId,
    manualSuffixQuery,
    setManualSuffixQuery,
    clearPendingMatch,
    clearAllPendingMatches,
    matchPendingToRequest,
    matchPendingBySuffix,
    confirmSuggestedMatch,
    matchingBusy,
    suffixCommitNote,
  };
};
