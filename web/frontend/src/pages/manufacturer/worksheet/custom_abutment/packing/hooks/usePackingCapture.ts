import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type Dispatch,
  type SetStateAction,
} from "react";
import { onAppEvent } from "@/shared/realtime/socket";
import { type ManufacturerRequest } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";
import { useS3TempUpload } from "@/shared/hooks/useS3TempUpload";

export const usePackingCapture = ({
  token,
  requests,
  toast,
  setRequests,
  previewOpen,
  previewFiles,
  handleOpenPreview,
  handleAutoPrintProcessedRequest,
}: {
  token?: string | null;
  requests: ManufacturerRequest[];
  toast: (opts: any) => void;
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
  const requestsRef = useRef(requests);
  const previewOpenRef = useRef(previewOpen);
  const previewFilesRef = useRef(previewFiles);
  const handleOpenPreviewRef = useRef(handleOpenPreview);
  const handleAutoPrintProcessedRequestRef = useRef(
    handleAutoPrintProcessedRequest,
  );

  useEffect(() => {
    requestsRef.current = requests;
    previewOpenRef.current = previewOpen;
    previewFilesRef.current = previewFiles;
    handleOpenPreviewRef.current = handleOpenPreview;
    handleAutoPrintProcessedRequestRef.current =
      handleAutoPrintProcessedRequest;
  }, [
    handleAutoPrintProcessedRequest,
    handleOpenPreview,
    previewFiles,
    previewOpen,
    requests,
  ]);

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
              const uploadedMeta = (uploaded || {}) as any;
              if (!uploaded?.key) {
                toast({
                  title: "이미지 업로드에 실패했습니다",
                  description: "잠시 후 다시 시도해주세요.",
                  variant: "destructive",
                });
                return;
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
                    uploadedMeta.fileSize || imageFiles[index]?.size || 0,
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
                toast({
                  title: "일치하는 의뢰를 찾지 못했습니다",
                  description:
                    reason === "no_recognized_suffix"
                      ? "이미지 내 영문 대문자 3글자가 보이도록 다시 촬영해주세요."
                      : recognizedSuffix
                        ? `일치하는 의뢰 없음: ${recognizedSuffix}`
                        : "세척.패킹 의뢰를 찾지 못했습니다.",
                  variant: "destructive",
                });
                return;
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
      handleOpenPreview,
      previewFiles.request,
      previewOpen,
      setRequests,
      toast,
      token,
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
      const movedToStage = String(payload?.movedToStage || "").trim();
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
        if (mergedEventRequest && handleAutoPrintProcessedRequestRef.current) {
          await handleAutoPrintProcessedRequestRef.current(mergedEventRequest);
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
  }, [setRequests, toast, token]);

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
