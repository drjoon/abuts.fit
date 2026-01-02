import React, { useCallback, useEffect, useState, useRef } from "react";
import { type TempUploadedFile } from "@/hooks/useS3TempUpload";
import { useUploadWithProgressToast } from "@/hooks/useUploadWithProgressToast";
import { useToast } from "@/hooks/use-toast";
import { type DraftCaseInfo, type CaseInfos } from "./newRequestTypes";
import { getCachedUrl, setCachedUrl, removeCachedUrl } from "@/utils/fileCache";
import { getStlBlob, setStlBlob, setFileBlob } from "@/utils/fileBlobCache";
import { parseFilenames } from "@/utils/parseFilename";
import { parseFilenameWithRules } from "@/utils/parseFilenameWithRules";
import { request } from "@/lib/apiClient";

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
  caseInfosMap?: Record<string, any>;
  updateCaseInfos?: (fileKey: string, updates: any) => void;
};

const toFileKey = (name: string, size: number) => {
  return `${normalize(name)}:${size}`;
};

type FileWithDraftId = File & {
  _draftCaseInfoId?: string;
  _sourceFileKey?: string;
  _sourceFileKeyNfc?: string;
};

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
  caseInfosMap,
  updateCaseInfos,
}: UseNewRequestFilesV2Params) => {
  const { toast } = useToast();
  const { uploadFilesWithToast } = useUploadWithProgressToast({ token });

  const [isDragOver, setIsDragOver] = useState(false);
  const filesRef = useRef<FileWithDraftId[]>([]);
  const draftFilesRef = useRef<DraftCaseInfo[]>(draftFiles);
  const selectedPreviewIndexRef = useRef(selectedPreviewIndex);
  const aiQuotaExhaustedRef = useRef(false); // 429 쿼터 소진 플래그
  const pendingRemovalRef = useRef<Set<string>>(new Set());

  const draftIdRef = useRef(draftId);
  useEffect(() => {
    draftIdRef.current = draftId;
  }, [draftId]);

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
    const currentDraftId = draftId; // 이 함수가 시작될 때의 draftId 스냅샷
    console.log("[restoreFileUrls] start", {
      currentDraftId,
      draftFilesLen: draftFilesRef.current.length,
    });

    // draftId가 변경되었으면 즉시 중단 (새 Draft로 전환됨)
    if (draftId !== currentDraftId) {
      console.log("[restoreFileUrls] draftId changed, aborting restore");
      return;
    }

    // 1) 복원 대상 draftFiles (항상 최신값 Ref 사용)
    let sourceDraftFiles = draftFilesRef.current;

    // draftFiles가 비어 있는데 draftId는 있는 경우, 서버에서 최신 draft를 한 번 조회해 caseInfos를 채운다.
    if (!sourceDraftFiles.length && currentDraftId) {
      try {
        console.log(
          "[restoreFileUrls] draftFiles empty, fetching draft from server",
          {
            draftId: currentDraftId,
          }
        );
        const res = await fetch(
          `${API_BASE_URL}/requests/drafts/${currentDraftId}`,
          {
            method: "GET",
            headers: getHeaders(),
          }
        );

        if (res.ok) {
          const data = await res.json();
          const draft = data.data || data;
          const draftCaseInfos = Array.isArray(draft.caseInfos)
            ? draft.caseInfos
            : [];

          if (draftCaseInfos.length > 0) {
            console.log("[restoreFileUrls] server draft caseInfos loaded", {
              len: draftCaseInfos.length,
            });
            draftFilesRef.current = draftCaseInfos;
            setDraftFiles(draftCaseInfos);
            sourceDraftFiles = draftCaseInfos;
          }
        } else {
          console.warn("[restoreFileUrls] failed to refetch draft", {
            status: res.status,
          });
        }
      } catch (err) {
        console.error("[restoreFileUrls] error while refetching draft", err);
      }
    }

    if (!sourceDraftFiles.length) {
      console.log("[restoreFileUrls] no draftFiles to restore, skipping");
      return;
    }

    const restoredFiles: FileWithDraftId[] = [];
    let hadError = false;

    for (const draftCase of sourceDraftFiles) {
      const fileMeta = draftCase.file;
      console.log("[restoreFileUrls] processing case", {
        caseId: draftCase._id,
        fileMeta,
      });
      if (!fileMeta) continue;

      try {
        // 루프 중간에도 draftId 변경 확인 (빠른 취소 대응)
        if (draftId !== currentDraftId) {
          return;
        }

        // 캐시 확인 (fileId 또는 s3Key 기반)
        const cacheKey = fileMeta.fileId || fileMeta.s3Key;
        if (!cacheKey) continue;

        // 1) IndexedDB에서 Blob 먼저 시도
        let blobData: Blob | null = await getStlBlob(cacheKey);

        // 2) IndexedDB에 없으면 presigned URL → 네트워크 fetch
        if (!blobData) {
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

          // URL에서 파일 다운로드
          const response = await fetch(url);
          if (!response.ok) {
            hadError = true;
            continue;
          }

          blobData = await response.blob();
        }

        if (!blobData) {
          hadError = true;
          continue;
        }

        const file = new File([blobData], fileMeta.originalName, {
          type: blobData.type,
        }) as FileWithDraftId;
        // 서버 Draft.caseInfos 의 _id 를 파일에 매핑해 두어야, 이후 삭제 시 서버에서도 동일 caseInfo 를 제거할 수 있다.
        file._draftCaseInfoId = (draftCase as any)._id;
        restoredFiles.push(file);
      } catch (err) {
        // 복원 실패는 조용히 표시만 남기고 계속 진행
        hadError = true;
      }
    }

    // 여기서 한 번 더 체크
    if (draftId !== currentDraftId) {
      // Draft가 중간에 바뀌었으면, 이 복원 결과는 무시
      return;
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
    draftId,
    token,
    getHeaders,
    setFiles,
    setSelectedPreviewIndex,
    setDraftFiles,
    toast,
  ]);

  // 페이지 최초 진입 시 또는 draftId 변경 후에 파일 복원
  // 취소 후 새 Draft로 전환된 경우에는 동일 draftId에 대해 한 번만 복원한다 (완전 리셋 보장)
  const restoredDraftIdRef = useRef<string | null>(null);
  const draftIdChangedRef = useRef<boolean>(false);

  // draftId가 변경되면 restoredDraftIdRef도 초기화하고, 다음 restore 시도는 스킵 플래그 설정
  // (draftFiles가 아직 비워지지 않은 상태에서 복원되는 것을 방지)
  useEffect(() => {
    restoredDraftIdRef.current = null;
    draftIdChangedRef.current = true;
  }, [draftId]);

  useEffect(() => {
    const currentDraftId = draftIdRef.current;

    if (!currentDraftId) {
      return;
    }

    // draftId 변경 직후 첫 번째 restore 시도는 스킵 (draftFiles 정리 대기)
    if (draftIdChangedRef.current) {
      draftIdChangedRef.current = false;
      return;
    }

    if (restoredDraftIdRef.current === currentDraftId) {
      return;
    }

    restoredDraftIdRef.current = currentDraftId;
    restoreFileUrls();
  }, [draftId, draftFiles, restoreFileUrls]);

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
        // 0. 이미 업로드된 파일(파일명+사이즈 기준)은 중복 업로드를 방지한다.
        //    - 화면에 올라와 있는 filesRef (File 객체)
        //    - Draft.caseInfos 에 이미 등록된 draftFilesRef (file.originalName + size)
        const existingKeys = new Set<string>();

        // 현재 화면에 보이는 파일들
        filesRef.current.forEach((f) => {
          existingKeys.add(`${f.name}:${f.size}`);
          existingKeys.add(toFileKey(f.name, f.size));
        });

        // 현재 Draft에 이미 연결된 파일들
        draftFilesRef.current.forEach((ci) => {
          const fileMeta = ci.file;
          if (!fileMeta) return;
          existingKeys.add(`${fileMeta.originalName}:${fileMeta.size}`);
          existingKeys.add(toFileKey(fileMeta.originalName, fileMeta.size));
        });

        const filesToProcess = filesToUpload.filter((f) => {
          const key = `${f.name}:${f.size}`;
          const keyNfc = toFileKey(f.name, f.size);
          return !existingKeys.has(key) && !existingKeys.has(keyNfc);
        });

        if (filesToProcess.length === 0) {
          toast({
            title: "안내",
            description: "이미 업로드된 파일입니다.",
            duration: 2000,
          });
          return;
        }

        // 1. S3 임시 업로드
        const tempFiles = await uploadFilesWithToast(filesToProcess);
        if (!tempFiles || tempFiles.length === 0) {
          return;
        }

        // 2. Draft API에 파일 메타 추가
        const newDraftFiles: DraftCaseInfo[] = [];

        // Draft에 이미 존재하는 파일 키(파일명+사이즈)
        const existingDraftKeys = new Set<string>();
        draftFilesRef.current.forEach((ci) => {
          const fileMeta = ci.file;
          if (!fileMeta) return;
          existingDraftKeys.add(`${fileMeta.originalName}:${fileMeta.size}`);
        });

        for (const tempFile of tempFiles) {
          const draftKey = `${tempFile.originalName}:${tempFile.size}`;
          // 같은 Draft 안에서 이미 연결된 파일이면 Draft.caseInfos에 다시 추가하지 않는다.
          if (existingDraftKeys.has(draftKey)) {
            continue;
          }

          // [추가] 업로드 전 파일명 기반 중복 체크 (생산 이후 단계 차단)
          const parsed = parseFilenameWithRules(tempFile.originalName);
          if (parsed.clinicName && parsed.patientName && parsed.tooth) {
            try {
              const query = new URLSearchParams({
                clinicName: parsed.clinicName,
                patientName: parsed.patientName,
                tooth: parsed.tooth,
              }).toString();
              const checkRes = await fetch(
                `${API_BASE_URL}/requests/my/has-duplicate?${query}`,
                {
                  headers: getHeaders(),
                }
              );
              if (checkRes.ok) {
                const checkData = await checkRes.json();
                const { exists, stageOrder } = checkData.data || {};
                if (exists && stageOrder > 1) {
                  // 생산 이후 단계(stageOrder > 1: 생산, 발송, 완료)는 업로드 차단
                  toast({
                    title: "중복 의뢰 불가",
                    description: `${parsed.patientName}(${parsed.tooth})님은 이미 생산 단계 이상으로 진행 중인 의뢰가 있어 추가할 수 없습니다.`,
                    variant: "destructive",
                    duration: 5000,
                  });
                  continue; // 다음 파일로 넘어가고 현재 파일은 Draft에 추가하지 않음
                }
              }
            } catch (err) {
              console.error("Duplicate check error during upload:", err);
            }
          }

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

              continue;
            }

            const data = await res.json();
            const addedCaseInfo: DraftCaseInfo = data.data || data;
            newDraftFiles.push(addedCaseInfo);
          } catch (err) {
            continue;
          }
        }

        // tempFiles는 있었지만, 모두 existingDraftKeys 에 걸려서 newDraftFiles 가 비면
        // 사용자 입장에서는 "이미 업로드된 파일"이므로 안내 토스트를 띄운다.
        if (newDraftFiles.length === 0) {
          toast({
            title: "안내",
            description: "이미 업로드된 파일입니다.",
            duration: 2000,
          });
          return;
        }

        // 3. Draft.caseInfos로 상태 동기화 (파일이 포함된 케이스들)
        if (newDraftFiles.length > 0) {
          // Ref를 즉시 업데이트하여 동시 업로드 시 중복 검사 가능하게 함
          const updatedDraftFiles = [
            ...draftFilesRef.current,
            ...newDraftFiles,
          ];
          draftFilesRef.current = updatedDraftFiles;
          setDraftFiles(updatedDraftFiles);

          // 4. File 객체 생성: 실제 업로드한 원본 File을 그대로 사용해 STL 내용이 보이도록 한다.
          const newFiles: FileWithDraftId[] = newDraftFiles.map(
            (draftCase, idx) => {
              const originalFile = filesToProcess[idx];
              const fileMeta = draftCase.file;
              const fileName = normalize(
                fileMeta?.originalName ?? originalFile.name
              );
              const mimeType = fileMeta?.mimetype || originalFile.type;

              const file = new File([originalFile], fileName, {
                type: mimeType,
              }) as FileWithDraftId;
              file._draftCaseInfoId = draftCase._id;

              const sourceKey = `${originalFile.name}:${originalFile.size}`;
              file._sourceFileKey = sourceKey;
              try {
                file._sourceFileKeyNfc = `${String(
                  originalFile.name || ""
                ).normalize("NFC")}:${originalFile.size}`;
              } catch {
                file._sourceFileKeyNfc = sourceKey;
              }
              return file;
            }
          );

          // 기존 files와 합칠 때도 파일명+사이즈 기준으로 한 번 더 중복 제거
          setFiles((prev) => {
            const seen = new Set<string>();
            const deduped: FileWithDraftId[] = [];

            const pushIfNew = (file: File) => {
              const key = `${file.name}:${file.size}`;
              if (seen.has(key)) return;
              seen.add(key);
              deduped.push(file as FileWithDraftId);
            };

            prev.forEach(pushIfNew);
            newFiles.forEach(pushIfNew);

            return deduped;
          });

          // 5. 업로드 직후 원본 File을 IndexedDB에 즉시 캐싱
          //    (재진입 시에는 IndexedDB → URL 캐시 → S3 순으로 복원)
          newDraftFiles.forEach((draftCase, idx) => {
            const fileMeta = draftCase.file;
            const originalFile = filesToProcess[idx];
            if (!fileMeta || !originalFile) return;

            const cacheKey = fileMeta.fileId || fileMeta.s3Key;
            if (!cacheKey) return;

            try {
              // File은 Blob 서브타입이므로 그대로 저장 가능
              void setFileBlob(cacheKey, originalFile);
            } catch (e) {
              return;
            }
          });

          toast({
            title: "성공",
            description: `${newFiles.length}개 파일이 업로드되었습니다.`,
            duration: 2000,
          });

          // 6. 파일 업로드 직후 파일명 파싱으로 환자정보 자동 채우기
          //    1차: 파일명 파싱
          //    2차: 파싱에 실패한 파일만 AI 분석(/api/ai/parse-filenames)으로 보완
          if (updateCaseInfos) {
            const filenamesForAi: string[] = [];
            const fileKeysForAi: string[] = [];

            newFiles.forEach((file) => {
              const fileKey = `${file.name}:${file.size}`;
              // 룰 기반 파싱 (fallback으로 기존 parseFilename 포함)
              const parsed = parseFilenameWithRules(file.name);

              if (parsed.clinicName || parsed.patientName || parsed.tooth) {
                // 파일명에서 정보를 추출한 경우 바로 Draft.caseInfos에 반영
                updateCaseInfos(fileKey, {
                  clinicName: parsed.clinicName || "",
                  patientName: parsed.patientName || "",
                  tooth: parsed.tooth || "",
                });
              } else {
                // 파일명에서 아무 것도 못 찾은 파일은 AI 분석 대상으로 모은다
                filenamesForAi.push(file.name);
                fileKeysForAi.push(fileKey);
              }
            });

            // 2차: 파일명 파싱으로도 정보가 안 나온 파일에 대해서만 AI 분석 수행
            if (filenamesForAi.length > 0 && !aiQuotaExhaustedRef.current) {
              (async () => {
                try {
                  const res = await request<
                    {
                      filename: string;
                      clinicName: string | null;
                      patientName: string | null;
                      tooth: string | null;
                    }[]
                  >({
                    path: "/api/ai/parse-filenames",
                    method: "POST",
                    jsonBody: { filenames: filenamesForAi },
                  });

                  // 응답에서 provider 확인 (429 쿼터 소진 여부)
                  const provider = (res.data as any)?.provider;
                  if (provider === "fallback-quota-exceeded") {
                    aiQuotaExhaustedRef.current = true;
                    toast({
                      title: "자동 분석 실패",
                      description:
                        "환자정보를 직접 입력해주세요. (내일 17:00 이후 자동 분석 재개)",
                      variant: "destructive",
                      duration: 4000,
                    });
                    return;
                  }

                  const items = (res.data as any)?.data || res.data;
                  if (!Array.isArray(items) || !items.length) return;

                  // 파일명 기준으로 결과를 매핑하여 Draft.caseInfos에 반영
                  items.forEach((item: any) => {
                    const idx = filenamesForAi.indexOf(item.filename);
                    if (idx === -1) return;
                    const fileKey = fileKeysForAi[idx];

                    updateCaseInfos(fileKey, {
                      clinicName: item.clinicName || "",
                      patientName: item.patientName || "",
                      tooth: item.tooth || "",
                    });
                  });
                } catch (error) {
                  // AI 분석 실패는 무시 (빈 상태 유지)
                }
              })();
            }
          }
        }
      } catch (err) {
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

        let localOnlyMessage: string | null = null;
        if (!res.ok) {
          if (res.status === 404) {
            localOnlyMessage = "임시 의뢰가 만료되어 로컬 파일만 정리했습니다.";
          } else {
            localOnlyMessage =
              "서버와 동기화되지 않았지만 로컬 파일을 정리했습니다.";
          }
        }

        // 상태 동기화 (서버 성공/실패와 무관하게 로컬은 제거)
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

        if (localOnlyMessage) {
          toast({
            title: "삭제 완료",
            description: localOnlyMessage,
            duration: 2000,
          });
        } else {
          toast({
            title: "성공",
            description: "파일이 삭제되었습니다.",
            duration: 2000,
          });
        }
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

  const handleDragLeave = useCallback((_e?: React.DragEvent) => {
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
