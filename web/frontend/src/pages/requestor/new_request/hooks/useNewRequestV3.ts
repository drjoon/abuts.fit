/**
 * 새로운 의뢰 페이지 메인 훅 (V3 - 로컬 스토리지 SSOT)
 *
 * 워크플로우:
 * 1. 파일 드롭 → 로컬 스토리지 + IndexedDB에만 저장
 * 2. 정보 입력 → 로컬 스토리지 업데이트 + 백엔드 중복 체크
 * 3. 의뢰하기 클릭 → S3 업로드 + Draft 생성 + 제출
 */

import { useState, useCallback } from "react";
import { useLocalDraft } from "./useLocalDraft";
import { getFileKey, type CaseInfos } from "../utils/localDraftStorage";
import { useToast } from "@/components/ui/use-toast";

interface DuplicateInfo {
  fileKey: string;
  caseId: string;
  existingRequest: any;
  mode: "active" | "tracking";
}

export function useNewRequestV3() {
  const {
    draft,
    files,
    loading,
    addFiles,
    removeFile,
    updateCaseInfos,
    addDuplicateResolution,
    clearDraft,
    getCaseInfos,
    getDuplicateResolution,
  } = useLocalDraft();

  const { toast } = useToast();
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(
    null,
  );
  const [duplicatePrompt, setDuplicatePrompt] = useState<{
    duplicates: DuplicateInfo[];
    mode: "active" | "tracking";
  } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 파일 드롭 핸들러
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length === 0) return;

      try {
        const result = await addFiles(droppedFiles);

        if (result.skippedCount > 0) {
          toast({
            title: "중복 파일",
            description: `${result.skippedCount}개 파일은 이미 추가되어 건너뜁니다.`,
            duration: 3000,
          });
        }

        if (result.addedCount > 0) {
          toast({
            title: "파일 추가 완료",
            description: `${result.addedCount}개 파일이 추가되었습니다.`,
            duration: 2000,
          });
        }

        for (const f of droppedFiles) {
          const fileKey = getFileKey(f);
          const ci = getCaseInfos(fileKey);
          if (ci?.clinicName && ci?.patientName && ci?.tooth) {
            await checkDuplicate(fileKey, {
              clinicName: String(ci.clinicName),
              patientName: String(ci.patientName),
              tooth: String(ci.tooth),
            });
          }
        }
      } catch (error) {
        console.error("[handleDrop] Error:", error);
        toast({
          title: "오류",
          description: "파일 추가 중 오류가 발생했습니다.",
          variant: "destructive",
          duration: 3000,
        });
      }
    },
    [addFiles, toast],
  );

  // 파일 선택 핸들러 (input)
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
      if (selectedFiles.length === 0) return;

      try {
        const result = await addFiles(selectedFiles);

        if (result.skippedCount > 0) {
          toast({
            title: "중복 파일",
            description: `${result.skippedCount}개 파일은 이미 추가되어 건너뜁니다.`,
            duration: 3000,
          });
        }

        if (result.addedCount > 0) {
          toast({
            title: "파일 추가 완료",
            description: `${result.addedCount}개 파일이 추가되었습니다.`,
            duration: 2000,
          });
        }

        for (const f of selectedFiles) {
          const fileKey = getFileKey(f);
          const ci = getCaseInfos(fileKey);
          if (ci?.clinicName && ci?.patientName && ci?.tooth) {
            await checkDuplicate(fileKey, {
              clinicName: String(ci.clinicName),
              patientName: String(ci.patientName),
              tooth: String(ci.tooth),
            });
          }
        }
      } catch (error) {
        console.error("[handleFileSelect] Error:", error);
        toast({
          title: "오류",
          description: "파일 추가 중 오류가 발생했습니다.",
          variant: "destructive",
          duration: 3000,
        });
      }

      // input 초기화
      e.target.value = "";
    },
    [addFiles, toast],
  );

  // 파일 삭제 핸들러
  const handleRemoveFile = useCallback(
    async (index: number) => {
      const file = files[index];
      if (!file) return;

      const fileKey = getFileKey(file);

      try {
        await removeFile(fileKey);
        toast({
          title: "파일 삭제",
          description: "파일이 삭제되었습니다.",
          duration: 2000,
        });

        // 선택된 파일이 삭제되면 선택 해제
        if (selectedFileIndex === index) {
          setSelectedFileIndex(null);
        } else if (selectedFileIndex !== null && selectedFileIndex > index) {
          setSelectedFileIndex(selectedFileIndex - 1);
        }
      } catch (error) {
        console.error("[handleRemoveFile] Error:", error);
        toast({
          title: "오류",
          description: "파일 삭제 중 오류가 발생했습니다.",
          variant: "destructive",
          duration: 3000,
        });
      }
    },
    [files, removeFile, selectedFileIndex, toast],
  );

  // 정보 업데이트 핸들러
  const handleUpdateInfo = useCallback(
    async (fileKey: string, updates: Partial<CaseInfos>) => {
      try {
        updateCaseInfos(fileKey, updates);

        // 필수 정보가 모두 입력되었는지 확인
        const caseInfos = getCaseInfos(fileKey);
        if (!caseInfos) return;

        const { clinicName, patientName, tooth } = {
          ...caseInfos,
          ...updates,
        };

        // 필수 정보가 모두 입력되면 백엔드 중복 체크
        if (clinicName && patientName && tooth) {
          await checkDuplicate(fileKey, {
            clinicName,
            patientName,
            tooth,
          });
        }
      } catch (error) {
        console.error("[handleUpdateInfo] Error:", error);
        toast({
          title: "오류",
          description: "정보 업데이트 중 오류가 발생했습니다.",
          variant: "destructive",
          duration: 3000,
        });
      }
    },
    [updateCaseInfos, getCaseInfos, toast],
  );

  // 백엔드 중복 체크
  const checkDuplicate = useCallback(
    async (
      fileKey: string,
      info: { clinicName: string; patientName: string; tooth: string },
    ) => {
      try {
        const existingResolution = getDuplicateResolution(fileKey);
        if (existingResolution) {
          console.log("[checkDuplicate] Already resolved:", fileKey);
          return;
        }

        const token = localStorage.getItem("token");
        if (!token) return;

        const qs = new URLSearchParams({
          clinicName: String(info.clinicName || "").trim(),
          patientName: String(info.patientName || "").trim(),
          tooth: String(info.tooth || "").trim(),
        }).toString();

        const response = await fetch(`/api/requests/my/check-duplicate?${qs}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error("중복 체크 실패");
        }

        const body = await response.json();
        const data = body?.data || {};
        if (data?.exists) {
          const stageOrder = Number(data?.stageOrder ?? 0);
          const st = String(data?.existingRequest?.manufacturerStage || "");
          const mode = st === "추적관리" ? "tracking" : "active";
          setDuplicatePrompt({
            duplicates: [
              {
                fileKey,
                caseId: fileKey,
                existingRequest: data.existingRequest,
                mode,
              },
            ],
            mode,
          });
        }
      } catch (error) {
        console.error("[checkDuplicate] Error:", error);
      }
    },
    [getDuplicateResolution],
  );

  // 중복 처리 결정 적용
  const handleDuplicateChoice = useCallback(
    async (choice: {
      fileKey: string;
      strategy: "skip" | "replace" | "remake";
      existingRequestId: string;
    }) => {
      try {
        // skip인 경우 파일 삭제
        if (choice.strategy === "skip") {
          const fileIndex = files.findIndex(
            (f) => getFileKey(f) === choice.fileKey,
          );
          if (fileIndex >= 0) {
            await handleRemoveFile(fileIndex);
          }
        } else {
          // replace 또는 remake인 경우 결정 저장
          addDuplicateResolution({
            fileKey: choice.fileKey,
            strategy: choice.strategy,
            existingRequestId: choice.existingRequestId,
          });
        }

        // 모달에서 해당 항목 제거
        if (duplicatePrompt) {
          const remaining = duplicatePrompt.duplicates.filter(
            (d) => d.fileKey !== choice.fileKey,
          );

          if (remaining.length > 0) {
            setDuplicatePrompt({
              ...duplicatePrompt,
              duplicates: remaining,
            });
          } else {
            setDuplicatePrompt(null);
          }
        }
      } catch (error) {
        console.error("[handleDuplicateChoice] Error:", error);
        toast({
          title: "오류",
          description: "중복 처리 중 오류가 발생했습니다.",
          variant: "destructive",
          duration: 3000,
        });
      }
    },
    [files, duplicatePrompt, handleRemoveFile, addDuplicateResolution, toast],
  );

  // 의뢰하기 제출
  const handleSubmit = useCallback(async () => {
    if (!draft || files.length === 0) {
      toast({
        title: "오류",
        description: "파일을 추가해주세요.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("로그인이 필요합니다.");
      }

      // 1. Draft 생성
      const draftResponse = await fetch("/api/requests/draft", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (!draftResponse.ok) {
        throw new Error("Draft 생성 실패");
      }

      const draftData = await draftResponse.json();
      const draftId = draftData.data._id;

      // 2. 각 파일에 대해 S3 업로드 + Draft에 추가
      for (const file of files) {
        const fileKey = getFileKey(file);
        const caseInfos = getCaseInfos(fileKey);

        if (!caseInfos) {
          console.warn("[handleSubmit] No case infos for file:", fileKey);
          continue;
        }

        // S3 presigned URL 요청
        const presignResponse = await fetch(
          `/api/requests/draft/${draftId}/presign`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              filename: file.name,
              mimetype: file.type,
            }),
          },
        );

        if (!presignResponse.ok) {
          throw new Error("Presigned URL 생성 실패");
        }

        const presignData = await presignResponse.json();
        const { url, key } = presignData.data;

        // S3에 파일 업로드
        const uploadResponse = await fetch(url, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type,
          },
        });

        if (!uploadResponse.ok) {
          throw new Error("S3 업로드 실패");
        }

        // Draft에 파일 메타데이터 추가
        const addFileResponse = await fetch(
          `/api/requests/draft/${draftId}/files`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              file: {
                s3Key: key,
                originalName: file.name,
                size: file.size,
                mimetype: file.type,
              },
              ...caseInfos,
            }),
          },
        );

        if (!addFileResponse.ok) {
          throw new Error("Draft 파일 추가 실패");
        }
      }

      // 3. 중복 처리 정보와 함께 의뢰 생성
      const duplicateResolutions = draft.duplicateResolutions.map((r) => ({
        caseId: r.fileKey, // 실제로는 Draft caseInfo._id를 사용해야 하지만, 여기서는 간소화
        strategy: r.strategy,
        existingRequestId: r.existingRequestId,
      }));

      const submitResponse = await fetch(
        `/api/requests/from-draft/${draftId}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            duplicateResolutions,
          }),
        },
      );

      if (!submitResponse.ok) {
        throw new Error("의뢰 생성 실패");
      }

      // 4. 성공 - 로컬 Draft 초기화
      await clearDraft();

      toast({
        title: "의뢰 완료",
        description: "의뢰가 성공적으로 생성되었습니다.",
        duration: 3000,
      });

      // 페이지 이동 또는 상태 초기화
      window.location.href = "/requestor/requests";
    } catch (error) {
      console.error("[handleSubmit] Error:", error);
      toast({
        title: "오류",
        description:
          error instanceof Error
            ? error.message
            : "의뢰 생성 중 오류가 발생했습니다.",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [draft, files, getCaseInfos, clearDraft, toast]);

  // Drag & Drop 핸들러
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  return {
    // 상태
    draft,
    files,
    loading,
    selectedFileIndex,
    duplicatePrompt,
    isDragOver,
    isSubmitting,

    // 파일 관리
    handleDrop,
    handleFileSelect,
    handleRemoveFile,
    setSelectedFileIndex,

    // 정보 관리
    handleUpdateInfo,
    getCaseInfos,

    // 중복 처리
    handleDuplicateChoice,
    setDuplicatePrompt,

    // 제출
    handleSubmit,

    // Drag & Drop
    handleDragOver,
    handleDragLeave,
  };
}
