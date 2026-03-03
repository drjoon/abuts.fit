import { useCallback } from "react";
import { saveFile } from "../utils/fileIndexedDB";
import { getFileKey } from "../utils/localDraftStorage";
import { addUploadedFiles, filterNewFiles } from "../utils/localFileStorage";
import { useToast } from "@/shared/hooks/use-toast";
import { parseFilenameWithRules } from "@/shared/filename/parseFilenameWithRules";

/**
 * V3 방식 파일 업로드 래퍼
 * - 파일 드롭 시 IndexedDB + 로컬 스토리지에만 저장
 * - S3 업로드 없음 (제출 시에만 업로드)
 */
export const useNewRequestFilesV3Wrapper = ({
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
        // 1. 중복 파일 필터링
        const { newFiles, duplicateFiles } = filterNewFiles(filesToUpload);

        if (duplicateFiles.length > 0) {
          toast({
            title: "중복 파일",
            description: `${duplicateFiles.length}개 파일은 이미 추가되어 건너뜁니다.`,
            duration: 3000,
          });
        }

        if (newFiles.length === 0) return;

        // 2. IndexedDB에 파일 저장
        for (const file of newFiles) {
          const fileKey = getFileKey(file);
          await saveFile(fileKey, file);
        }

        // 3. 로컬 스토리지에 메타데이터 저장
        addUploadedFiles(newFiles);

        // 4. UI 상태 업데이트 (SSOT 키 기반 중복 방지)
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
          newFiles.forEach((f) => {
            const normalizedName = normalize(f.name);
            const baseFile =
              normalizedName && normalizedName !== f.name
                ? new File([f], normalizedName, {
                    type: f.type || "application/octet-stream",
                  })
                : f;
            pushIfNew(baseFile);
          });

          return out;
        });

        setSelectedPreviewIndex((prev) => (prev === null ? 0 : prev));

        // 5. 파일명 파싱으로 정보 자동 채우기 (SSOT 키 사용)
        if (updateCaseInfos) {
          newFiles.forEach((f) => {
            const normalizedName = normalize(f.name);
            const fileKey = getFileKey(f);
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
          description: `${newFiles.length}개 파일이 추가되었습니다.`,
          duration: 2000,
        });
      } catch (error) {
        console.error("[V3 Upload] Error:", error);
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
