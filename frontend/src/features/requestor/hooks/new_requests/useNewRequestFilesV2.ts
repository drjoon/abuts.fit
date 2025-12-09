import React, { useCallback, useEffect, useState, useRef } from "react";
import { type TempUploadedFile } from "@/hooks/useS3TempUpload";
import { useUploadWithProgressToast } from "@/hooks/useUploadWithProgressToast";
import { useToast } from "@/hooks/use-toast";
import { type DraftCaseInfo } from "./newRequestTypes";
import { getCachedUrl, setCachedUrl, removeCachedUrl } from "@/utils/fileCache";
import { getStlBlob, setStlBlob, setFileBlob } from "@/utils/fileBlobCache";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || "/api";

type UseNewRequestFilesV2Params = {
  draftId: string | null;
  token: string | null;
  draftFiles: DraftCaseInfo[];
  setDraftFiles: React.Dispatch<React.SetStateAction<DraftCaseInfo[]>>;
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  selectedPreviewIndex: number | null;
  setSelectedPreviewIndex: React.Dispatch<React.SetStateAction<number | null>>;
};

type FileWithDraftId = File & { _draftCaseInfoId?: string };

// 한글 파일명이 UTF-8 → Latin-1 등으로 잘못 디코딩된 경우를 최대한 복구한 뒤 NFC로 정규화한다.
const normalize = (s: string) => {
  if (typeof s !== "string") return s;

  try {
    const hasHangul = /[가-힣]/.test(s);

    // mojibake로 추정되는 문자열은 각 코드포인트를 1바이트로 보고 다시 UTF-8로 디코딩해본다.
    const bytes = new Uint8Array(
      Array.from(s).map((ch) => ch.charCodeAt(0) & 0xff)
    );
    const decoded = new TextDecoder("utf-8").decode(bytes);
    const decodedHasHangul = /[가-힣]/.test(decoded);

    const candidate = !hasHangul && decodedHasHangul ? decoded : s;
    return candidate.normalize("NFC");
  } catch {
    return s.normalize("NFC");
  }
};

export const useNewRequestFilesV2 = ({
  draftId,
  token,
  draftFiles,
  setDraftFiles,
  files,
  setFiles,
  selectedPreviewIndex,
  setSelectedPreviewIndex,
}: UseNewRequestFilesV2Params) => {
  const { toast } = useToast();
  const { uploadFilesWithToast } = useUploadWithProgressToast({ token });

  const [isDragOver, setIsDragOver] = useState(false);
  const filesRef = useRef(files);
  const draftFilesRef = useRef(draftFiles);
  const selectedPreviewIndexRef = useRef(selectedPreviewIndex);
  const pendingRemovalRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  useEffect(() => {
    draftFilesRef.current = draftFiles;
  }, [draftFiles]);
  useEffect(() => {
    selectedPreviewIndexRef.current = selectedPreviewIndex;
  }, [selectedPreviewIndex]);

  // 헤더 생성 (mock dev 토큰 지원)
  const getHeaders = useCallback(() => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token === "MOCK_DEV_TOKEN") {
      headers["x-mock-role"] = "requestor";
    }
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }, [token]);

  // 파일 URL 복원 (Draft.files 기준)
  const restoreFileUrls = useCallback(async () => {
    // 1) 복원 대상 draftFiles가 비어 있고 draftId가 있으면 서버에서 한 번 더 조회해온다.
    let sourceDraftFiles = draftFiles;

    if (!sourceDraftFiles.length && draftId && token) {
      try {
        const res = await fetch(`${API_BASE_URL}/requests/drafts/${draftId}`, {
          method: "GET",
          headers: getHeaders(),
        });

        if (res.ok) {
          const body = await res.json().catch(() => ({} as any));
          const draft = (body as any).data || body;
          const serverCaseInfos: DraftCaseInfo[] = Array.isArray(
            draft?.caseInfos
          )
            ? draft.caseInfos
            : [];

          // 파일 메타가 있는 케이스만 복원 대상으로 사용
          sourceDraftFiles = serverCaseInfos.filter((ci) => !!ci.file);
          if (sourceDraftFiles.length) {
            setDraftFiles(sourceDraftFiles);
          } else if (
            serverCaseInfos.length > 0 &&
            filesRef.current.length === 0
          ) {
            // caseInfos는 있지만 file 메타가 전혀 없으면 STL을 복원할 수 없음을 알림
            toast({
              title: "STL 복원 정보 없음",
              description:
                "임시 의뢰에는 STL 파일 메타데이터가 없어 자동으로 복원할 수 없습니다. STL 파일을 다시 업로드해주세요.",
              variant: "destructive",
              duration: 4000,
            });
          }
        }
      } catch (err) {
        console.error("restoreFileUrls: failed to refetch draft", err);
      }
    }

    if (!sourceDraftFiles.length) return;

    const restoredFiles: FileWithDraftId[] = [];
    let hadError = false;

    for (const draftCase of sourceDraftFiles) {
      const fileMeta = draftCase.file;
      if (!fileMeta) continue;

      try {
        // 캐시 확인 (fileId 또는 s3Key 기반)
        const cacheKey = fileMeta.fileId || fileMeta.s3Key;
        if (!cacheKey) continue;

        // 1) IndexedDB에서 Blob 먼저 시도
        let blob: Blob | null = await getStlBlob(cacheKey);

        // 2) IndexedDB에 없으면 presigned URL → 네트워크 fetch
        if (!blob) {
          let url = getCachedUrl(cacheKey);
          if (!url) {
            // 캐시 없으면 서버에서 URL 획득
            const endpoint = fileMeta.fileId
              ? `/files/${fileMeta.fileId}/download-url`
              : `/files/s3/${encodeURIComponent(fileMeta.s3Key!)}/download-url`;

            const res = await fetch(`${API_BASE_URL}${endpoint}`, {
              method: "GET",
              headers: getHeaders(),
            });

            if (!res.ok) {
              console.warn(
                `Failed to get download URL for ${fileMeta.originalName}: ${res.status} ${res.statusText}`,
                { endpoint, s3Key: fileMeta.s3Key, fileId: fileMeta.fileId }
              );
              continue;
            }

            const data = await res.json();
            url = data.data?.url || data.url;
            if (!url) {
              console.warn(`No URL in response for ${fileMeta.originalName}`);
              continue;
            }

            // URL 캐시 저장 (localStorage)
            setCachedUrl(cacheKey, url, 50 * 60 * 1000); // 50분 TTL
          }

          // Blob 획득
          const blobRes = await fetch(url);
          if (!blobRes.ok) {
            console.warn(
              `Failed to fetch blob for ${fileMeta.originalName}: ${blobRes.status} ${blobRes.statusText}`,
              { url }
            );
            hadError = true;
            continue;
          }

          blob = await blobRes.blob();

          // IndexedDB 캐시에 저장 (에러는 앱에 영향을 주지 않도록 무시)
          try {
            await setStlBlob(cacheKey, blob);
          } catch (e) {
            console.warn("Failed to cache STL blob to IndexedDB", e);
          }
        }

        if (!blob) {
          continue;
        }

        const file = new File([blob], fileMeta.originalName, {
          type: fileMeta.mimetype,
        }) as FileWithDraftId;
        file._draftCaseInfoId = draftCase._id;

        restoredFiles.push(file);
      } catch (err) {
        console.error(`Error restoring file ${fileMeta.originalName}:`, err);
        hadError = true;
      }
    }

    if (restoredFiles.length > 0) {
      setFiles(restoredFiles);
      setSelectedPreviewIndex((prev) => (prev === null ? 0 : prev));
    } else if (hadError && filesRef.current.length === 0) {
      toast({
        title: "STL 복원 실패",
        description:
          "임시 STL 파일을 다시 불러오지 못했습니다. 네트워크 또는 서버 상태를 확인한 뒤 파일을 다시 업로드해주세요.",
        variant: "destructive",
        duration: 4000,
      });
    }
  }, [
    draftFiles,
    draftId,
    token,
    getHeaders,
    setDraftFiles,
    setFiles,
    setSelectedPreviewIndex,
    toast,
  ]);

  // 페이지 진입 시 파일 복원
  useEffect(() => {
    restoreFileUrls();
  }, [restoreFileUrls]);

  // 파일 업로드
  const handleUpload = useCallback(
    async (filesToUpload: File[]) => {
      if (!draftId || !token) {
        toast({
          title: "오류",
          description: "Draft ID가 없습니다. 페이지를 새로고침해주세요.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      try {
        // 1. S3 임시 업로드
        const tempFiles = await uploadFilesWithToast(filesToUpload);
        if (!tempFiles || tempFiles.length === 0) {
          return;
        }

        // 2. Draft API에 파일 메타 추가
        const newDraftFiles: DraftCaseInfo[] = [];
        for (const tempFile of tempFiles) {
          try {
            const res = await fetch(
              `${API_BASE_URL}/requests/drafts/${draftId}/files`,
              {
                method: "POST",
                headers: getHeaders(),
                body: JSON.stringify({
                  originalName: tempFile.originalName,
                  size: tempFile.size,
                  mimetype: tempFile.mimetype,
                  s3Key: tempFile.key,
                  fileId: tempFile._id,
                }),
              }
            );

            if (!res.ok) {
              if (res.status === 404) {
                // Draft가 삭제되었거나 만료된 경우
                console.error("Failed to add file to draft: Draft not found");
                try {
                  if (typeof window !== "undefined") {
                    window.localStorage.removeItem(
                      "abutsfit:new-request-draft-id:v1"
                    );
                  }
                } catch {}

                toast({
                  title: "임시 의뢰가 만료되었습니다",
                  description:
                    "임시 의뢰가 더 이상 유효하지 않아 새로 시작해야 합니다. 페이지를 새로고침한 뒤 다시 시도해주세요.",
                  variant: "destructive",
                  duration: 4000,
                });

                // 한 번 404가 발생하면 이후 파일들도 모두 실패할 것이므로 조기 종료
                return;
              }

              console.error(`Failed to add file to draft: ${res.status}`);
              continue;
            }

            const data = await res.json();
            const addedCaseInfo: DraftCaseInfo = data.data || data;
            newDraftFiles.push(addedCaseInfo);
          } catch (err) {
            console.error("Error adding file to draft:", err);
          }
        }

        // 3. Draft.caseInfos로 상태 동기화 (파일이 포함된 케이스들)
        if (newDraftFiles.length > 0) {
          setDraftFiles((prev) => [...prev, ...newDraftFiles]);

          // 4. File 객체 생성: 실제 업로드한 원본 File을 그대로 사용해 STL 내용이 보이도록 한다.
          const newFiles: FileWithDraftId[] = newDraftFiles.map(
            (draftCase, idx) => {
              const originalFile = filesToUpload[idx];
              const fileMeta = draftCase.file;
              const fileName = normalize(
                fileMeta?.originalName ?? originalFile.name
              );
              const mimeType = fileMeta?.mimetype || originalFile.type;

              const file = new File([originalFile], fileName, {
                type: mimeType,
              }) as FileWithDraftId;
              file._draftCaseInfoId = draftCase._id;
              return file;
            }
          );

          setFiles((prev) => [...prev, ...newFiles]);

          // 5. 업로드 직후 원본 File을 IndexedDB에 즉시 캐싱
          //    (재진입 시에는 IndexedDB → URL 캐시 → S3 순으로 복원)
          newDraftFiles.forEach((draftCase, idx) => {
            const fileMeta = draftCase.file;
            const originalFile = filesToUpload[idx];
            if (!fileMeta || !originalFile) return;

            const cacheKey = fileMeta.fileId || fileMeta.s3Key;
            if (!cacheKey) return;

            try {
              // File은 Blob 서브타입이므로 그대로 저장 가능
              void setFileBlob(cacheKey, originalFile);
            } catch (e) {
              console.warn("Failed to cache uploaded file to IndexedDB", e);
            }
          });

          toast({
            title: "성공",
            description: `${newFiles.length}개 파일이 업로드되었습니다.`,
            duration: 2000,
          });
        }
      } catch (err) {
        console.error("Upload error:", err);
        toast({
          title: "오류",
          description: "파일 업로드 중 오류가 발생했습니다.",
          variant: "destructive",
          duration: 3000,
        });
      }
    },
    [
      draftId,
      token,
      uploadFilesWithToast,
      getHeaders,
      setDraftFiles,
      setFiles,
      toast,
    ]
  );

  // 파일 삭제
  const handleRemoveFile = useCallback(
    async (index: number) => {
      const file = filesRef.current[index];
      if (!file) return;

      const draftCaseInfoId = (file as FileWithDraftId)._draftCaseInfoId;
      if (!draftCaseInfoId || !draftId || !token) {
        // Draft 파일 ID가 없으면 로컬에서만 제거
        setFiles((prev) => prev.filter((_, i) => i !== index));
        return;
      }

      try {
        // Draft API에서 해당 caseInfo(파일 포함 케이스) 삭제
        const res = await fetch(
          `${API_BASE_URL}/requests/drafts/${draftId}/files/${draftCaseInfoId}`,
          {
            method: "DELETE",
            headers: getHeaders(),
          }
        );

        if (!res.ok) {
          throw new Error(`Failed to delete file: ${res.status}`);
        }

        // 상태 동기화
        setDraftFiles((prev) =>
          prev.filter((ci) => ci._id !== draftCaseInfoId)
        );
        setFiles((prev) => prev.filter((_, i) => i !== index));

        // 미리보기 인덱스 조정
        if (selectedPreviewIndexRef.current === index) {
          setSelectedPreviewIndex(null);
        } else if (
          selectedPreviewIndexRef.current !== null &&
          selectedPreviewIndexRef.current > index
        ) {
          setSelectedPreviewIndex(selectedPreviewIndexRef.current - 1);
        }

        toast({
          title: "성공",
          description: "파일이 삭제되었습니다.",
          duration: 2000,
        });
      } catch (err) {
        console.error("Delete error:", err);
        toast({
          title: "오류",
          description: "파일 삭제 중 오류가 발생했습니다.",
          variant: "destructive",
          duration: 3000,
        });
      }
    },
    [
      draftId,
      token,
      getHeaders,
      setDraftFiles,
      setFiles,
      setSelectedPreviewIndex,
      toast,
    ]
  );

  // 드래그 앤 드롭
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const droppedFiles = Array.from(e.dataTransfer.files);
      handleUpload(droppedFiles);
    },
    [handleUpload]
  );

  return {
    files,
    draftFiles,
    isDragOver,
    selectedPreviewIndex,
    handleUpload,
    handleRemoveFile,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
};
