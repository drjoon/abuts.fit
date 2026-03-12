import { useCallback } from "react";
import { type ManufacturerRequest } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";
import { useToast } from "@/shared/hooks/use-toast";

export const useRequestCardHandlers = (
  token: string | null,
  isMachiningStage: boolean,
  isCamStage: boolean,
) => {
  const { toast } = useToast();

  const handleDownloadOriginal = useCallback(
    async (req: ManufacturerRequest) => {
      if (!token) return;
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
      }
    },
    [token, isMachiningStage, isCamStage, toast],
  );

  return { handleDownloadOriginal };
};
