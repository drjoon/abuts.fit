import {
  useCallback,
  useEffect,
  useState,
  type DragEvent,
  type Dispatch,
  type SetStateAction,
} from "react";
import { onAppEvent } from "@/shared/realtime/socket";
import {
  deriveStageForFilter,
  type ManufacturerRequest,
} from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";
import { useS3TempUpload } from "@/shared/hooks/useS3TempUpload";

const IS_SIMULATION_MODE = true;

export const usePackingCapture = ({
  token,
  requests,
  toast,
  uploadStageFile,
  updateReviewStatus,
  fetchRequestsList,
  setRequests,
  previewOpen,
  previewFiles,
  handleOpenPreview,
  handleAutoPrintProcessedRequest,
}: {
  token?: string | null;
  requests: ManufacturerRequest[];
  toast: (opts: any) => void;
  uploadStageFile: (opts: any) => Promise<void>;
  updateReviewStatus: (opts: any) => Promise<void>;
  fetchRequestsList: (
    silent?: boolean,
    append?: boolean,
  ) => Promise<ManufacturerRequest[] | null>;
  setRequests: Dispatch<SetStateAction<ManufacturerRequest[]>>;
  previewOpen: boolean;
  previewFiles: any;
  handleOpenPreview: (req: ManufacturerRequest) => Promise<void>;
  handleAutoPrintProcessedRequest?: (req: ManufacturerRequest) => Promise<void>;
}) => {
  const { uploadFiles: uploadToS3 } = useS3TempUpload({ token });
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrStage, setOcrStage] = useState<"idle" | "upload" | "recognize">(
    "idle",
  );

  const extractLotSuffix3 = useCallback((value: string | null | undefined) => {
    const s = String(value || "").toUpperCase();
    const match = s.match(/[A-Z]{3}(?!.*[A-Z])/);
    return match ? match[0] : "";
  }, []);

  const resizeImageFile = useCallback((file: File) => {
    return new Promise<File>((resolve) => {
      const reader = new FileReader();
      const image = new Image();
      reader.onload = () => {
        image.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = image.width * 0.2;
          canvas.height = image.height * 0.2;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(file);
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (!blob) return resolve(file);
            resolve(new File([blob], file.name, { type: file.type }));
          }, file.type || "image/jpeg");
        };
        image.onerror = () => resolve(file);
        image.src = reader.result as string;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  }, []);

  const handlePackingImageDrop = useCallback(
    async (imageFiles: File[]) => {
      if (!token || imageFiles.length === 0) return;
      setOcrProcessing(true);
      setOcrStage("upload");
      try {
        const resizedFiles = await Promise.all(
          imageFiles.map((file) => resizeImageFile(file)),
        );
        const uploadResult = await uploadToS3(resizedFiles);
        setOcrStage("recognize");
        await Promise.allSettled(
          uploadResult.map(async (uploaded, index) => {
            try {
              const resizedFile = resizedFiles[index] ?? imageFiles[index];
              if (!uploaded?.key) {
                toast({
                  title: "이미지 업로드에 실패했습니다",
                  description: "잠시 후 다시 시도해주세요.",
                  variant: "destructive",
                });
                return;
              }
              let rawLot = "";
              let matchingRequest: ManufacturerRequest | undefined;
              if (IS_SIMULATION_MODE) {
                await new Promise((resolve) => setTimeout(resolve, 800));
                matchingRequest =
                  requests.find(
                    (r) => deriveStageForFilter(r) === "세척.패킹",
                  ) || requests[0];
                rawLot = extractLotSuffix3(matchingRequest?.lotNumber?.value);
              } else {
                const aiRes = await fetch("/api/ai/recognize-lot-number", {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    s3Key: uploaded.key,
                    originalName: uploaded.originalName,
                  }),
                });
                if (!aiRes.ok) {
                  toast({
                    title: "LOT 번호 인식에 실패했습니다",
                    description: "AI 인식 서버 응답이 올바르지 않습니다.",
                    variant: "destructive",
                  });
                  return;
                }
                const aiData = await aiRes.json();
                rawLot = aiData?.data?.lotNumber || "";
              }
              if (IS_SIMULATION_MODE && !matchingRequest) {
                toast({
                  title: "승인할 의뢰가 없습니다",
                  description: "세척·패킹 단계 의뢰를 먼저 불러와주세요.",
                  variant: "destructive",
                });
                return;
              }
              const recognizedSuffix = extractLotSuffix3(rawLot || "");
              if (!IS_SIMULATION_MODE && !recognizedSuffix) {
                toast({
                  title: "LOT 코드를 인식하지 못했습니다",
                  description:
                    "이미지 내 영문 대문자 3글자가 보이도록 다시 촬영해주세요.",
                  variant: "destructive",
                });
                return;
              }
              if (!matchingRequest) {
                matchingRequest = requests.find(
                  (req) =>
                    extractLotSuffix3(String(req.lotNumber?.value || "")) ===
                    recognizedSuffix,
                );
              }
              if (!matchingRequest) {
                toast({
                  title: "누락",
                  description: `일치하는 의뢰 없음: ${recognizedSuffix}`,
                });
                return;
              }
              setRequests((prev) =>
                prev.map((req) => {
                  if (
                    String(req.requestId || "").trim() !==
                    String(matchingRequest?.requestId || "").trim()
                  ) {
                    return req;
                  }
                  return {
                    ...req,
                    realtimeProgress: {
                      badge: "각인 인식 대기중",
                      startedAt: new Date().toISOString(),
                      elapsedSeconds: 0,
                      tone: "amber",
                    },
                  };
                }),
              );
              await uploadStageFile({
                req: matchingRequest,
                stage: "packing",
                file: resizedFile || imageFiles[index] || imageFiles[0],
                source: "manual",
              });
              await updateReviewStatus({
                req: matchingRequest,
                status: "APPROVED",
                stageOverride: "packing",
              });
              toast({
                title: "세척·포장 완료",
                description: `LOT 코드 ${recognizedSuffix} 의뢰를 발송 단계로 이동했습니다.`,
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
          }),
        );
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
      extractLotSuffix3,
      fetchRequestsList,
      handleOpenPreview,
      previewFiles.request,
      previewOpen,
      requests,
      setRequests,
      toast,
      token,
      updateReviewStatus,
      uploadStageFile,
      uploadToS3,
      resizeImageFile,
    ],
  );

  const handlePageDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);
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
    setIsDraggingOver(true);
  }, []);

  const handlePageDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  }, []);

  useEffect(() => {
    if (!token) return;
    const unsubscribe = onAppEvent((evt) => {
      if (evt?.type !== "packing:capture-processed") return;
      const payload = evt?.data || {};
      const requestId = String(payload?.requestId || "").trim();
      const requestMongoId = String(payload?.requestMongoId || "").trim();
      const suffix = String(payload?.recognizedSuffix || "").trim();
      const eventRequest = payload?.request as ManufacturerRequest | undefined;
      if (requestId) {
        setRequests((prev) =>
          prev.map((req) => {
            if (String(req.requestId || "").trim() !== requestId) return req;
            return {
              ...req,
              realtimeProgress: null,
            };
          }),
        );
      }
      void (async () => {
        if (previewOpen && previewFiles.request?._id) {
          const currentPreviewId = String(
            previewFiles.request._id || "",
          ).trim();
          const matchedRequest = eventRequest
            ? (() => {
                const mongoId = String(eventRequest._id || "").trim();
                const businessId = String(eventRequest.requestId || "").trim();
                return mongoId === currentPreviewId ||
                  (requestMongoId && mongoId === requestMongoId) ||
                  (requestId && businessId === requestId)
                  ? eventRequest
                  : null;
              })()
            : null;
          if (matchedRequest) await handleOpenPreview(matchedRequest);
        }
        if (eventRequest && handleAutoPrintProcessedRequest) {
          await handleAutoPrintProcessedRequest(eventRequest);
        }
      })();
      toast({
        title: "자동 처리 완료",
        description: requestId
          ? `${requestId}${suffix ? ` · ${suffix}` : ""}`
          : "세척.패킹 처리 결과가 반영되었습니다.",
      });
    });
    return () => {
      unsubscribe?.();
    };
  }, [
    handleOpenPreview,
    previewFiles.request,
    previewOpen,
    setRequests,
    toast,
    token,
    handleAutoPrintProcessedRequest,
  ]);

  return {
    isDraggingOver,
    ocrProcessing,
    ocrStage,
    handlePageDrop,
    handlePageDragOver,
    handlePageDragLeave,
    handlePackingImageDrop,
  };
};
