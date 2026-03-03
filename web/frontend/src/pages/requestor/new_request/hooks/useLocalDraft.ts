/**
 * 로컬 Draft 관리 훅
 * 
 * 로컬 스토리지와 IndexedDB를 SSOT로 사용
 * - 파일 드롭 시: 로컬에만 저장
 * - 정보 입력 시: 로컬 업데이트
 * - 의뢰하기 클릭 시: 백엔드 업로드
 */

import { useState, useEffect, useCallback } from "react";
import {
  getLocalDraft,
  saveLocalDraft,
  initLocalDraft,
  clearLocalDraft,
  addFiles,
  removeFile,
  updateCaseInfos,
  addDuplicateResolution,
  getFileKey,
  type LocalDraft,
  type CaseInfos,
  type FileMetadata,
  type DuplicateResolution,
} from "../utils/localDraftStorage";
import {
  saveFile,
  getFile,
  deleteFile,
  getAllFiles,
  clearAllFiles,
} from "../utils/fileIndexedDB";

export function useLocalDraft() {
  const [draft, setDraft] = useState<LocalDraft | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);

  // 초기 로드
  useEffect(() => {
    const loadDraft = async () => {
      try {
        let localDraft = getLocalDraft();
        if (!localDraft) {
          localDraft = initLocalDraft();
        }
        setDraft(localDraft);

        // IndexedDB에서 파일 로드
        const fileMap = await getAllFiles();
        const loadedFiles: File[] = [];
        
        for (const meta of localDraft.files) {
          const file = fileMap.get(meta.fileKey);
          if (file) {
            loadedFiles.push(file);
          }
        }
        
        setFiles(loadedFiles);
      } catch (error) {
        console.error("[useLocalDraft] Failed to load draft:", error);
      } finally {
        setLoading(false);
      }
    };

    loadDraft();
  }, []);

  // 파일 추가
  const handleAddFiles = useCallback(async (newFiles: File[]) => {
    try {
      const result = addFiles(newFiles);
      setDraft(result.draft);

      // IndexedDB에 파일 저장
      for (const file of newFiles) {
        const fileKey = getFileKey(file);
        await saveFile(fileKey, file);
      }

      // 상태 업데이트
      setFiles((prev) => {
        const existingKeys = new Set(prev.map((f) => getFileKey(f)));
        const filesToAdd = newFiles.filter(
          (f) => !existingKeys.has(getFileKey(f)),
        );
        return [...prev, ...filesToAdd];
      });

      return result;
    } catch (error) {
      console.error("[useLocalDraft] Failed to add files:", error);
      throw error;
    }
  }, []);

  // 파일 제거
  const handleRemoveFile = useCallback(async (fileKey: string) => {
    try {
      const updatedDraft = removeFile(fileKey);
      setDraft(updatedDraft);

      // IndexedDB에서 파일 삭제
      await deleteFile(fileKey);

      // 상태 업데이트
      setFiles((prev) => prev.filter((f) => getFileKey(f) !== fileKey));
    } catch (error) {
      console.error("[useLocalDraft] Failed to remove file:", error);
      throw error;
    }
  }, []);

  // CaseInfos 업데이트
  const handleUpdateCaseInfos = useCallback(
    (fileKey: string, caseInfos: Partial<CaseInfos>) => {
      try {
        const updatedDraft = updateCaseInfos(fileKey, caseInfos);
        setDraft(updatedDraft);
      } catch (error) {
        console.error("[useLocalDraft] Failed to update case infos:", error);
        throw error;
      }
    },
    [],
  );

  // 중복 처리 결정 추가
  const handleAddDuplicateResolution = useCallback(
    (resolution: Omit<DuplicateResolution, "resolvedAt">) => {
      try {
        const updatedDraft = addDuplicateResolution(resolution);
        setDraft(updatedDraft);
      } catch (error) {
        console.error(
          "[useLocalDraft] Failed to add duplicate resolution:",
          error,
        );
        throw error;
      }
    },
    [],
  );

  // Draft 초기화
  const handleClearDraft = useCallback(async () => {
    try {
      clearLocalDraft();
      await clearAllFiles();
      const newDraft = initLocalDraft();
      setDraft(newDraft);
      setFiles([]);
    } catch (error) {
      console.error("[useLocalDraft] Failed to clear draft:", error);
      throw error;
    }
  }, []);

  // 특정 파일의 CaseInfos 조회
  const getCaseInfos = useCallback(
    (fileKey: string): CaseInfos | undefined => {
      return draft?.caseInfosMap[fileKey];
    },
    [draft],
  );

  // 특정 파일의 중복 처리 결정 조회
  const getDuplicateResolution = useCallback(
    (fileKey: string): DuplicateResolution | undefined => {
      return draft?.duplicateResolutions.find((r) => r.fileKey === fileKey);
    },
    [draft],
  );

  return {
    draft,
    files,
    loading,
    addFiles: handleAddFiles,
    removeFile: handleRemoveFile,
    updateCaseInfos: handleUpdateCaseInfos,
    addDuplicateResolution: handleAddDuplicateResolution,
    clearDraft: handleClearDraft,
    getCaseInfos,
    getDuplicateResolution,
  };
}
