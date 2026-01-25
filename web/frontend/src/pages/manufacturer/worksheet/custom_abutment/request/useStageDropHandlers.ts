import { useCallback, useEffect, useState, type DragEvent } from "react";
import { useToast } from "@/hooks/use-toast";
import { useS3TempUpload } from "@/shared/hooks/useS3TempUpload";
import type { ManufacturerRequest } from "./utils";

type StageDropParams = {
  isMachiningStage: boolean;
  isCamStage: boolean;
  token: string | null;
  requests: ManufacturerRequest[];
  handleUploadStageFile: (params: {
    req: ManufacturerRequest;
    stage: "machining" | "packaging" | "shipping" | "tracking";
    file: File;
    source: "manual" | "worker";
  }) => Promise<void>;
  handleUploadCam: (req: ManufacturerRequest, files: File[]) => Promise<void>;
};

export function useStageDropHandlers({
  isMachiningStage,
  isCamStage,
  token,
  requests,
  handleUploadStageFile,
  handleUploadCam,
}: StageDropParams) {
  const { toast } = useToast();
  const { uploadFiles: uploadToS3 } = useS3TempUpload({ token });
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);

  const handleImageDropForOCR = useCallback(
    async (imageFiles: File[]) => {
      if (!isMachiningStage || imageFiles.length === 0 || !token) return;
      setOcrProcessing(true);
      try {
        const uploadResult = await uploadToS3(imageFiles);
        const uploaded = uploadResult?.[0];
        if (!uploaded?._id) throw new Error("업로드 실패");

        const ocrRes = await fetch("/api/ocr/lot-number", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ fileId: uploaded._id }),
        });

        if (!ocrRes.ok) {
          throw new Error("로트넘버 인식에 실패했습니다.");
        }

        const ocrData = await ocrRes.json();
        const recognizedLotNumber = ocrData?.data?.lotNumber;
        if (!recognizedLotNumber) {
          toast({
            title: "로트넘버를 인식하지 못했습니다",
            description: "이미지를 다시 확인해주세요.",
            variant: "destructive",
          });
          return;
        }

        const matchingRequest = requests.find(
          (req) =>
            String(req.lotNumber?.part || "").trim() ===
            recognizedLotNumber.trim(),
        );

        if (!matchingRequest) {
          toast({
            title: "일치하는 의뢰를 찾을 수 없습니다",
            description: `인식된 로트넘버: ${recognizedLotNumber}`,
            variant: "destructive",
          });
          return;
        }

        await handleUploadStageFile({
          req: matchingRequest,
          stage: "machining",
          file: imageFiles[0],
          source: "manual",
        });

        toast({
          title: "업로드 완료",
          description: `로트넘버 ${recognizedLotNumber}에 이미지가 업로드되었습니다.`,
        });
      } catch (error: any) {
        console.error("OCR 처리 오류:", error);
        toast({
          title: "OCR 처리 실패",
          description: error?.message || "오류가 발생했습니다.",
          variant: "destructive",
        });
      } finally {
        setOcrProcessing(false);
      }
    },
    [
      handleUploadStageFile,
      isMachiningStage,
      requests,
      token,
      toast,
      uploadToS3,
    ],
  );

  useEffect(() => {
    if (!(isMachiningStage || isCamStage)) return;

    const onWindowDragOver = (e: globalThis.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(true);
    };

    const onWindowDragLeave = (e: globalThis.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);
    };

    const onWindowDrop = (e: globalThis.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);

      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length === 0) return;

      if (isMachiningStage) {
        void handleImageDropForOCR(files);
        return;
      }

      if (isCamStage) {
        const filledStlFiles = files.filter((f) =>
          f.name.toLowerCase().endsWith(".filled.stl"),
        );
        if (filledStlFiles.length === 0) return;

        const getBase = (n: string) => {
          const s = String(n || "").trim();
          return s
            .replace(/\.filled\.stl$/i, "")
            .replace(/\.cam\.stl$/i, "")
            .replace(/\.stl$/i, "")
            .replace(/\.nc$/i, "");
        };

        const normalize = (n: string) =>
          n.trim().toLowerCase().normalize("NFC");

        filledStlFiles.forEach((file) => {
          const fileBase = normalize(getBase(file.name));
          const matchingReq = requests.find((r) => {
            const rBase = normalize(
              getBase(
                r.caseInfos?.camFile?.fileName ||
                  r.caseInfos?.camFile?.originalName ||
                  r.caseInfos?.file?.filePath ||
                  r.caseInfos?.file?.originalName ||
                  "",
              ),
            );
            return rBase === fileBase;
          });

          if (matchingReq) {
            void handleUploadCam(matchingReq, [file]);
          }
        });
      }
    };

    window.addEventListener("dragover", onWindowDragOver);
    window.addEventListener("dragleave", onWindowDragLeave);
    window.addEventListener("drop", onWindowDrop);

    return () => {
      window.removeEventListener("dragover", onWindowDragOver);
      window.removeEventListener("dragleave", onWindowDragLeave);
      window.removeEventListener("drop", onWindowDrop);
    };
  }, [
    handleImageDropForOCR,
    handleUploadCam,
    isCamStage,
    isMachiningStage,
    requests,
  ]);

  const handlePageDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      if (isMachiningStage) {
        void handleImageDropForOCR(files);
      } else if (isCamStage) {
        const filledStlFiles = files.filter((f) =>
          f.name.toLowerCase().endsWith(".filled.stl"),
        );
        if (filledStlFiles.length === 0) return;

        const getBase = (n: string) => {
          const s = String(n || "").trim();
          return s
            .replace(/\.filled\.stl$/i, "")
            .replace(/\.cam\.stl$/i, "")
            .replace(/\.stl$/i, "")
            .replace(/\.nc$/i, "");
        };

        const normalize = (n: string) =>
          n.trim().toLowerCase().normalize("NFC");

        filledStlFiles.forEach((file) => {
          const fileBase = normalize(getBase(file.name));
          const matchingReq = requests.find((r) => {
            const rBase = normalize(
              getBase(
                r.caseInfos?.camFile?.fileName ||
                  r.caseInfos?.camFile?.originalName ||
                  r.caseInfos?.file?.filePath ||
                  r.caseInfos?.file?.originalName ||
                  "",
              ),
            );
            return rBase === fileBase;
          });

          if (matchingReq) {
            void handleUploadCam(matchingReq, [file]);
          }
        });
      }
    },
    [
      handleImageDropForOCR,
      handleUploadCam,
      isCamStage,
      isMachiningStage,
      requests,
    ],
  );

  const handlePageDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (isMachiningStage || isCamStage) {
        setIsDraggingOver(true);
      }
    },
    [isMachiningStage, isCamStage],
  );

  const handlePageDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  }, []);

  return {
    handlePageDrop,
    handlePageDragOver,
    handlePageDragLeave,
    isDraggingOver,
    ocrProcessing,
  };
}
