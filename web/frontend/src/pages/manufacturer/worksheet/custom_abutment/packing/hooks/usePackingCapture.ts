// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx
// - web/frontend/src/shared/realtime/useAppEventListener.ts
// - web/backend/controllers/ai/lotCapture.controller.js
// change-log:
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
  createdAt: Date;
  /** object URL이면 clear 시 revoke */
  revokePreviewOnClear?: boolean;
};

export const PACKING_PENDING_DRAG_MIME = "application/x-abuts-packing-pending";

const makePendingId = () =>
  `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const extractLotSuffix3 = (value: string | null | undefined) => {
  const s = String(value || "").toUpperCase();
  const match = s.match(/[A-Z]{3}(?!.*[A-Z])/);
  return match ? match[0] : "";
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
  const [ocrStage, setOcrStage] = useState<"idle" | "upload" | "recognize">(
    "idle",
  );
  const [pendingMatches, setPendingMatches] = useState<PendingPackingMatch[]>(
    [],
  );
  const [activePendingId, setActivePendingId] = useState<string | null>(null);
  const [manualSuffixQuery, setManualSuffixQuery] = useState("");
  const [matchingBusy, setMatchingBusy] = useState(false);
  const requestsRef = useRef(requests);
  const previewOpenRef = useRef(previewOpen);
  const previewFilesRef = useRef(previewFiles);
  const handleOpenPreviewRef = useRef(handleOpenPreview);
  const onCaptureResultRef = useRef(onCaptureResult);
  const pendingMatchesRef = useRef(pendingMatches);

  useEffect(() => {
    requestsRef.current = requests;
    previewOpenRef.current = previewOpen;
    previewFilesRef.current = previewFiles;
    handleOpenPreviewRef.current = handleOpenPreview;
    onCaptureResultRef.current = onCaptureResult;
  }, [onCaptureResult, handleOpenPreview, previewFiles, previewOpen, requests]);

  useEffect(() => {
    pendingMatchesRef.current = pendingMatches;
  }, [pendingMatches]);

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
      setPendingMatches((prev) => {
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
    [],
  );

  const clearPendingMatch = useCallback((pendingId?: string | null) => {
    setPendingMatches((prev) => {
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
  }, [activePendingId]);

  const clearAllPendingMatches = useCallback(() => {
    setPendingMatches((prev) => {
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
  }, []);

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
    }) => {
      if (!token) return false;
      const requestMongoId = String(params.request._id || "").trim();
      if (!requestMongoId || !params.s3Key) return false;
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
          }),
        });
        const captureData = await captureRes.json().catch(() => ({}));
        if (!captureRes.ok || captureData?.success === false) {
          throw new Error(
            captureData?.message || "수동 매칭 처리에 실패했습니다.",
          );
        }
        if (!captureData?.data?.matched) {
          throw new Error(
            captureData?.message ||
              "선택한 의뢰에 매칭하지 못했습니다. 세척.패킹 단계인지 확인하세요.",
          );
        }
        if (params.pendingId) clearPendingMatch(params.pendingId);
        toast({
          title: "수동 매칭 완료",
          description: `${params.request.requestId || requestMongoId} → 포장.발송`,
        });
        return true;
      } catch (error) {
        toast({
          title: "수동 매칭 실패",
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
    [clearPendingMatch, toast, token],
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
      return bindCaptureToRequest({
        request,
        s3Key: pending.s3Key,
        s3Url: pending.s3Url,
        originalName: pending.originalName,
        fileSize: pending.fileSize,
        recognizedSuffix: extractLotSuffix3(manualSuffixQuery) || pending.aiSuffix,
        pendingId: pending.id,
      });
    },
    [activePendingId, bindCaptureToRequest, manualSuffixQuery, toast],
  );

  const handlePackingImageDropOnRequest = useCallback(
    async (request: ManufacturerRequest, imageFiles: File[]) => {
      if (previewOpenRef.current) return;
      if (!token || !request?._id) return;
      if (!imageFiles.length) {
        await matchPendingToRequest(request);
        return;
      }
      setOcrProcessing(true);
      setOcrStage("upload");
      try {
        const resized = await resizeImageFile(imageFiles[0]);
        const uploadResult = await uploadToS3([resized]);
        const uploaded = uploadResult[0];
        const uploadedMeta = (uploaded || {}) as any;
        if (!uploaded?.key) {
          throw new Error("이미지 업로드에 실패했습니다.");
        }
        setOcrStage("recognize");
        await bindCaptureToRequest({
          request,
          s3Key: uploaded.key,
          s3Url: uploadedMeta.url || uploadedMeta.s3Url || uploadedMeta.location || "",
          originalName: uploaded.originalName || imageFiles[0].name,
          fileSize: uploadedMeta.fileSize || imageFiles[0].size || 0,
          recognizedSuffix: extractLotSuffix3(manualSuffixQuery),
        });
      } catch (error) {
        toast({
          title: "카드 매칭 실패",
          description:
            (error as Error)?.message ||
            "이미지를 의뢰 카드에 연결하지 못했습니다.",
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
          try {
            const uploadedMeta = (uploaded || {}) as any;
            if (!uploaded?.key) {
              toast({
                title: "이미지 업로드에 실패했습니다",
                description: "잠시 후 다시 시도해주세요.",
                variant: "destructive",
              });
              continue;
            }
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

            if (!captureData?.data?.matched) {
              const reason = String(captureData?.data?.reason || "").trim();
              const recognizedSuffix = extractLotSuffix3(
                String(captureData?.data?.suffix || ""),
              );
              let previewUrl = String(
                captureData?.data?.previewUrl ||
                  captureData?.data?.s3Url ||
                  "",
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
              pushPendingMatch({
                s3Key: uploaded.key,
                s3Url: String(
                  captureData?.data?.s3Url ||
                    uploadedMeta.url ||
                    uploadedMeta.s3Url ||
                    "",
                ).trim(),
                previewUrl,
                originalName:
                  uploaded.originalName || sourceFile?.name || "capture.jpg",
                fileSize:
                  Number(captureData?.data?.fileSize) ||
                  uploadedMeta.fileSize ||
                  sourceFile?.size ||
                  0,
                aiSuffix: recognizedSuffix,
                reason,
                revokePreviewOnClear,
              });
              toast({
                title: "자동 매칭 실패 — 수동 매칭",
                description: recognizedSuffix
                  ? `인식값 ${recognizedSuffix}. 이미지를 확인한 뒤 3글자를 입력하거나 카드에 드롭하세요.`
                  : "이미지를 확인한 뒤 각인 3글자를 입력하거나 카드에 드롭하세요.",
              });
              continue;
            }

            const recognizedSuffix = extractLotSuffix3(
              String(captureData?.data?.suffix || ""),
            );
            toast({
              title: "세척·포장 처리 완료",
              description: recognizedSuffix
                ? `LOT 코드 ${recognizedSuffix} 의뢰를 발송 단계로 이동했습니다.`
                : "세척·포장 처리 결과를 반영했습니다.",
            });
          } catch (error) {
            toast({
              title: "이미지 처리 실패",
              description:
                (error as Error)?.message ||
                "세척·포장 이미지 처리 중 오류가 발생했습니다.",
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
    [pushPendingMatch, toast, token, uploadToS3, resizeImageFile],
  );

  const handlePageDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);

      if (previewOpenRef.current) return;
      // 카드→pending 드래그는 페이지 전역 AI 경로로 다시 넣지 않는다.
      if (e.dataTransfer.types.includes(PACKING_PENDING_DRAG_MIME)) return;

      const files = Array.from(e.dataTransfer.files || []);
      if (!files.length) return;
      const imageFiles = files.filter((file) => {
        const name = file.name.toLowerCase();
        return (
          name.endsWith(".jpg") ||
          name.endsWith(".jpeg") ||
          name.endsWith(".png")
        );
      });
      if (!imageFiles.length) return;
      void handlePackingImageDrop(imageFiles);
    },
    [handlePackingImageDrop],
  );

  const handlePageDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (previewOpenRef.current) {
      setIsDraggingOver(false);
      return;
    }
    if (e.dataTransfer.types.includes(PACKING_PENDING_DRAG_MIME)) {
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
    eventTypes: ["packing:capture-processed", "packing:capture-unmatched"],
    onMatch: (evt) => {
      const payload =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as Record<string, unknown>)
          : {};

      if (evt?.type === "packing:capture-unmatched") {
        // frontend drop 경로는 HTTP 응답에서 이미 pending에 넣는다.
        if (String(payload.capturedBy || "") === "frontend") return;
        const s3Key = String(payload.s3Key || "").trim();
        if (!s3Key) return;
        pushPendingMatch({
          s3Key,
          s3Url: String(payload.s3Url || "").trim(),
          previewUrl: String(
            payload.previewUrl || payload.s3Url || "",
          ).trim(),
          originalName: String(payload.originalName || "capture.jpg").trim(),
          fileSize: Number(payload.fileSize) || 0,
          aiSuffix: extractLotSuffix3(String(payload.suffix || "")),
          reason: String(payload.reason || "").trim(),
        });
        toast({
          title: "자동 매칭 실패 — 수동 매칭",
          description:
            "현미경 이미지를 확인한 뒤 각인 3글자를 입력하거나 카드에 드롭하세요.",
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
        setPendingMatches((prev) =>
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
            return prev.filter((req) => {
              const currentMongoId = String(req._id || "").trim();
              const currentRequestId = String(req.requestId || "").trim();
              return !(
                (!!requestMongoId && currentMongoId === requestMongoId) ||
                (!!requestId && currentRequestId === requestId)
              );
            });
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
      toast({
        title: `각인 인식: ${suffix || "인식됨"}`,
        description: requestId
          ? `${requestId} → 포장.발송으로 이동`
          : "세척.패킹 처리 결과가 반영되었습니다.",
      });
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
    matchingBusy,
  };
};
