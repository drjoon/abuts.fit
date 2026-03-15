import { useCallback } from "react";
import { saveFile } from "../utils/fileIndexedDB";
import { getFileKey } from "../utils/localDraftStorage";
import { addUploadedFiles, filterNewFiles } from "../utils/localFileStorage";
import { useToast } from "@/shared/hooks/use-toast";
import { parseFilenameWithRules } from "@/shared/filename/parseFilenameWithRules";

export const useNewRequestLocalFiles = ({
  setFiles,
  setSelectedPreviewIndex,
  updateCaseInfos,
  caseInfosMap,
}: {
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  setSelectedPreviewIndex: React.Dispatch<React.SetStateAction<number | null>>;
  updateCaseInfos?: (fileKey: string, updates: any) => void;
  caseInfosMap?: Record<string, any>;
}) => {
  const { toast } = useToast();

  const normalize = (s: string) => {
    try {
      return String(s || "").normalize("NFC");
    } catch {
      return String(s || "");
    }
  };

  const handleUpload = useCallback(
    async (filesToUpload: File[]) => {
      try {
        const { newFiles, duplicateFiles } = filterNewFiles(filesToUpload);

        if (duplicateFiles.length > 0) {
          toast({
            title: "중복 파일",
            description: `${duplicateFiles.length}개 파일은 이미 추가되어 건너뜁니다.`,
            duration: 3000,
          });
        }

        if (newFiles.length === 0) return;

        const normalizedFiles = newFiles.map((file) => {
          const normalizedName = normalize(file.name);
          if (!normalizedName || normalizedName === file.name) {
            return file;
          }
          return new File([file], normalizedName, {
            type: file.type || "application/octet-stream",
            lastModified: file.lastModified,
          });
        });

        for (const file of normalizedFiles) {
          const fileKey = getFileKey(file);
          await saveFile(fileKey, file);
        }

        addUploadedFiles(normalizedFiles);

        setFiles((prev) => {
          const seen = new Set<string>();
          const out: File[] = [];

          const pushIfNew = (file: File) => {
            const key = getFileKey(file);
            if (seen.has(key)) return;
            seen.add(key);
            out.push(file);
          };

          prev.forEach(pushIfNew);
          normalizedFiles.forEach((file) => {
            pushIfNew(file);
          });

          return out;
        });

        setSelectedPreviewIndex((prev) => (prev === null ? 0 : prev));

        if (updateCaseInfos) {
          normalizedFiles.forEach((file) => {
            const normalizedName = normalize(file.name);
            const fileKey = getFileKey(file);
            const parsed = parseFilenameWithRules(normalizedName);

            if (!parsed.clinicName && !parsed.patientName && !parsed.tooth) {
              return;
            }

            const existing = (caseInfosMap && caseInfosMap[fileKey]) || null;
            updateCaseInfos(fileKey, {
              clinicName:
                String(existing?.clinicName || "").trim() ||
                String(parsed.clinicName || "").trim() ||
                undefined,
              patientName:
                String(existing?.patientName || "").trim() ||
                String(parsed.patientName || "").trim() ||
                undefined,
              tooth:
                String(existing?.tooth || "").trim() ||
                String(parsed.tooth || "").trim() ||
                undefined,
            });
          });
        }

        toast({
          title: "파일 추가 완료",
          description: `${normalizedFiles.length}개 파일이 추가되었습니다.`,
          duration: 2000,
        });
      } catch (error) {
        console.error("[NewRequestLocalFiles] Error:", error);
        toast({
          title: "오류",
          description: "파일 추가 중 오류가 발생했습니다.",
          variant: "destructive",
          duration: 3000,
        });
      }
    },
    [setFiles, setSelectedPreviewIndex, updateCaseInfos, caseInfosMap, toast],
  );

  return { handleUpload };
};
