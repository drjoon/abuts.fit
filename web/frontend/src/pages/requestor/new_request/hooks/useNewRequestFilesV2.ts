import React, { useCallback, useEffect, useState, useRef } from "react";
import { type TempUploadedFile } from "@/shared/hooks/useS3TempUpload";
import { useUploadWithProgressToast } from "@/shared/hooks/useUploadWithProgressToast";
import { useToast } from "@/shared/hooks/use-toast";
import { type DraftCaseInfo, type CaseInfos } from "./newRequestTypes";
import {
  getCachedUrl,
  setCachedUrl,
  removeCachedUrl,
} from "@/shared/files/fileCache";
import {
  getStlBlob,
  setStlBlob,
  setFileBlob,
} from "@/shared/files/fileBlobCache";
import { parseFilenames } from "@/shared/filename/parseFilename";
import { parseFilenameWithRules } from "@/shared/filename/parseFilenameWithRules";
import { request } from "@/shared/api/apiClient";
import { removeUploadedFile } from "../utils/localFileStorage";
import { getLocalDraft, getFileKey } from "../utils/localDraftStorage";

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
  removeCaseInfos?: (fileKey: string) => void;
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
      Array.from(s).map((ch) => ch.charCodeAt(0) & 0xff),
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
  removeCaseInfos,
}: UseNewRequestFilesV2Params) => {
  const { toast } = useToast();
  const { uploadFilesWithToast } = useUploadWithProgressToast({ token });

  const sleep = useCallback(async (ms: number) => {
    await new Promise<void>((resolve) => {
      window.setTimeout(() => resolve(), ms);
    });
  }, []);

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

  // 헤더 생성 (표준 Authorization만 사용)
  const getHeaders = useCallback(() => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
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

    // V3 모드: Draft 서버 복원 비활성화 (로컬 스토리지만 사용)
    // 로컬 Draft 복원은 useNewRequestPage의 useEffect에서 처리됨
    console.log("[restoreFileUrls] V3 mode - skipping server draft restore");
    return;

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
          },
        );
        const res = await fetch(
          `${API_BASE_URL}/requests/drafts/${currentDraftId}`,
          {
            method: "GET",
            headers: getHeaders(),
          },
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
                { endpoint, s3Key: fileMeta.s3Key, fileId: fileMeta.fileId },
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
        const uniqueIncomingFiles: File[] = [];
        const seenIncoming = new Set<string>();
        for (const file of filesToUpload) {
          const key = `${file.name}:${file.size}`;
          if (seenIncoming.has(key)) continue;
          seenIncoming.add(key);
          uniqueIncomingFiles.push(file);
        }

        const filesToProcess = uniqueIncomingFiles;

        // UI는 먼저 보여주고(optimistic), Draft 등록이 끝나면 _draftCaseInfoId를 붙인 파일로 교체한다.
        setFiles((prev) => {
          const seen = new Set<string>();
          const out: FileWithDraftId[] = [];
          const pushIfNew = (file: File) => {
            const key = `${file.name}:${file.size}`;
            if (seen.has(key)) return;
            seen.add(key);
            out.push(file as FileWithDraftId);
          };
          prev.forEach(pushIfNew);

          filesToProcess.forEach((f) => {
            const sourceKey = `${f.name}:${f.size}`;
            const normalizedName = normalize(f.name);
            const baseFile =
              normalizedName && normalizedName !== f.name
                ? new File([f], normalizedName, {
                    type: f.type || "application/octet-stream",
                  })
                : f;
            const optimistic = baseFile as FileWithDraftId;
            optimistic._sourceFileKey = sourceKey;
            try {
              optimistic._sourceFileKeyNfc = `${String(f.name || "").normalize(
                "NFC",
              )}:${f.size}`;
            } catch {
              optimistic._sourceFileKeyNfc = sourceKey;
            }
            pushIfNew(optimistic);
          });

          return out;
        });
        setSelectedPreviewIndex((prev) => (prev === null ? 0 : prev));

        // optimistic 단계에서도 파일명 기반 정보 추출을 선반영한다.
        // (첫 파일이 선택된 상태에서 Draft 응답 반영이 늦어 누락되는 케이스 방지)
        if (updateCaseInfos) {
          filesToProcess.forEach((f) => {
            const normalizedName = normalize(f.name);
            const fileKey = `${normalizedName}:${f.size}`;
            const parsed = parseFilenameWithRules(normalizedName);
            if (!parsed.clinicName && !parsed.patientName && !parsed.tooth) {
              return;
            }

            const existing =
              (caseInfosMap && (caseInfosMap as any)[fileKey]) || null;
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

        console.log(
          `[Upload] Processing ${filesToProcess.length} of ${filesToUpload.length} files`,
        );

        // 1. S3 임시 업로드
        const tempFiles = await uploadFilesWithToast(filesToProcess);
        if (!tempFiles || tempFiles.length === 0) {
          return;
        }

        // 업로드 응답과 원본 파일 매칭을 위해 맵 구성
        const tempFileMap = new Map<string, File>();
        filesToProcess.forEach((file) => {
          const rawKey = `${file.name}:${file.size}`;
          tempFileMap.set(rawKey, file);
          try {
            const normalizedKey = `${normalize(file.name)}:${file.size}`;
            tempFileMap.set(normalizedKey, file);
          } catch {
            /* noop */
          }
        });

        // 2. Draft API에 파일 메타 추가
        const newDraftFiles: DraftCaseInfo[] = [];

        const postDraftFileWithRetry = async (tempFile: TempUploadedFile) => {
          const maxAttempts = 6;
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
              },
            );

            if (res.ok) {
              return res;
            }

            // Draft 만료/삭제
            if (res.status === 404) {
              return res;
            }

            // Too Many Requests: backoff 후 재시도
            if (res.status === 429 && attempt < maxAttempts) {
              const delayMs = Math.min(4000, 250 * Math.pow(2, attempt - 1));
              await sleep(delayMs);
              continue;
            }

            return res;
          }
          return null;
        };

        // 2-1) bulk로 한 번에 추가 시도 (429 회피)
        let bulkOk = false;
        try {
          const bulkRes = await fetch(
            `${API_BASE_URL}/requests/drafts/${draftId}/files/bulk`,
            {
              method: "POST",
              headers: getHeaders(),
              body: JSON.stringify({
                items: tempFiles.map((tempFile) => ({
                  originalName: tempFile.originalName,
                  size: tempFile.size,
                  mimetype: tempFile.mimetype,
                  s3Key: tempFile.key,
                  fileId: tempFile._id,
                })),
              }),
            },
          );

          if (bulkRes.ok) {
            const body = await bulkRes.json();
            const list = body?.data || body;
            if (Array.isArray(list) && list.length) {
              list.forEach((ci: any) => newDraftFiles.push(ci));
              bulkOk = true;
            }
          }
        } catch {
          bulkOk = false;
        }

        // 2-2) bulk 실패 시 기존 단건+재시도 로직으로 fallback
        if (!bulkOk) {
          for (const tempFile of tempFiles) {
            try {
              // 서버 429 회피: 파일 추가 요청을 천천히 보내고, 429이면 재시도한다.
              const res = await postDraftFileWithRetry(tempFile);
              if (!res) {
                continue;
              }

              if (!res.ok) {
                if (res.status === 404) {
                  // Draft가 삭제되었거나 만료된 경우
                  try {
                    if (typeof window !== "undefined") {
                      window.localStorage.removeItem(
                        "abutsfit:new-request-draft-id:v1",
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

                console.error(
                  `[Upload] Failed to add file to draft: ${tempFile.originalName}, status: ${res.status}`,
                );
                const errorText = await res.text().catch(() => "Unknown error");
                console.error(`[Upload] Error response: ${errorText}`);
                continue;
              }

              const data = await res.json();
              const addedCaseInfo: DraftCaseInfo = data.data || data;
              newDraftFiles.push(addedCaseInfo);
              console.log(
                `[Upload] Successfully added file to draft: ${tempFile.originalName}`,
              );

              // 서버 레이트리밋 회피를 위한 최소 딜레이
              await sleep(150);
            } catch (err) {
              console.error(
                `[Upload] Exception while adding file to draft: ${tempFile.originalName}`,
                err,
              );
              continue;
            }
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

          // 4. Draft 등록 결과(_draftCaseInfoId)를 반영한 File로 교체
          setFiles((prev) => {
            const replaced: FileWithDraftId[] = prev.map(
              (p) => p as FileWithDraftId,
            );
            const indexBySource = new Map<string, number>();
            replaced.forEach((f, idx) => {
              const rawKey = f._sourceFileKey || `${f.name}:${f.size}`;
              indexBySource.set(rawKey, idx);
              if (f._sourceFileKeyNfc) {
                indexBySource.set(f._sourceFileKeyNfc, idx);
              }
              const normalizedRuntimeKey = `${normalize(f.name)}:${f.size}`;
              indexBySource.set(normalizedRuntimeKey, idx);
            });

            newDraftFiles.forEach((draftCase) => {
              const fileMeta = draftCase.file;
              const originalSize = fileMeta?.size ?? 0;
              const rawKey = `${fileMeta?.originalName}:${originalSize}`;
              const normalizedKey = fileMeta?.originalName
                ? `${normalize(fileMeta.originalName)}:${originalSize}`
                : undefined;
              const fallbackOriginal = filesToProcess.find((file) => {
                if (!fileMeta?.originalName) return false;
                if (
                  file.name === fileMeta.originalName &&
                  file.size === originalSize
                )
                  return true;
                try {
                  return (
                    normalize(file.name) === normalize(fileMeta.originalName) &&
                    file.size === originalSize
                  );
                } catch {
                  return false;
                }
              });
              const originalFile =
                tempFileMap.get(rawKey) ||
                (normalizedKey ? tempFileMap.get(normalizedKey) : undefined) ||
                fallbackOriginal ||
                filesToProcess[0];
              const sourceKey = `${originalFile.name}:${originalFile.size}`;
              const idx = indexBySource.get(sourceKey);
              if (idx === undefined) return;

              const fileName = normalize(
                fileMeta?.originalName ?? originalFile.name,
              );
              const mimeType = fileMeta?.mimetype || originalFile.type;
              const next = new File([originalFile], fileName, {
                type: mimeType,
              }) as FileWithDraftId;
              next._draftCaseInfoId = draftCase._id;
              next._sourceFileKey = sourceKey;
              try {
                next._sourceFileKeyNfc = `${String(
                  originalFile.name || "",
                ).normalize("NFC")}:${originalFile.size}`;
              } catch {
                next._sourceFileKeyNfc = sourceKey;
              }

              replaced[idx] = next;
            });

            // 최종 중복 제거
            const seen = new Set<string>();
            const deduped: FileWithDraftId[] = [];
            replaced.forEach((file) => {
              const k = `${file.name}:${file.size}`;
              if (seen.has(k)) return;
              seen.add(k);
              deduped.push(file);
            });
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
            description: `${newDraftFiles.length}개 파일이 업로드되었습니다.`,
            duration: 2000,
          });

          // 6. 파일 업로드 직후 파일명 파싱으로 환자정보 자동 채우기
          //    1차: 파일명 파싱
          //    2차: 파싱에 실패한 파일만 AI 분석(/api/ai/parse-filenames)으로 보완
          if (updateCaseInfos) {
            const filenamesForAi: string[] = [];
            const fileKeysForAi: string[] = [];

            // Draft가 저장한 정규화된 originalName 기준으로 파싱/AI 대상을 구성한다.
            // (optimistic 단계에서는 NFD 등으로 파싱이 실패할 수 있음)
            newDraftFiles.forEach((draftCase) => {
              const fileMeta = draftCase?.file;
              const originalName = String(fileMeta?.originalName || "").trim();
              const size = Number(fileMeta?.size || 0);
              if (!originalName || !Number.isFinite(size) || size <= 0) return;

              const fileKey = `${originalName}:${size}`;
              const parsed = parseFilenameWithRules(originalName);

              if (parsed.clinicName || parsed.patientName || parsed.tooth) {
                // 파일명에서 정보를 추출한 경우 바로 Draft.caseInfos에 반영
                updateCaseInfos(fileKey, {
                  _id: draftCase?._id, // 서버에서 생성된 ID 반영
                  clinicName: parsed.clinicName || "",
                  patientName: parsed.patientName || "",
                  tooth: parsed.tooth || "",
                });
              } else {
                // 파일명에서 아무 것도 못 찾은 파일은 AI 분석 대상으로 모은다
                filenamesForAi.push(originalName);
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
                    const draftCase = newDraftFiles.find((ci: any) => {
                      const fm = ci?.file;
                      return `${fm?.originalName}:${fm?.size}` === fileKey;
                    });

                    updateCaseInfos(fileKey, {
                      _id: item._id || draftCase?._id, // 서버에서 생성된 ID 반영
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
    ],
  );

  // 파일 삭제
  const handleRemoveFile = useCallback(
    async (index: number) => {
      const file = filesRef.current[index];
      if (!file) return;
      // SSOT: NFC-normalized key via getFileKey
      const ssotKey = getFileKey(file);

      // V3: IndexedDB와 로컬 스토리지에서 파일 제거
      try {
        const { deleteFile } = await import("../utils/fileIndexedDB");
        await deleteFile(ssotKey);
        console.log("[handleRemoveFile] IDB delete done", { ssotKey });
      } catch (err) {
        console.warn(
          "[handleRemoveFile] Failed to delete from IndexedDB:",
          err,
        );
      }

      try {
        // Remove from local draft meta by SSOT key
        removeUploadedFile(ssotKey);
        console.log("[handleRemoveFile] localDraft remove done", { ssotKey });
      } catch (err) {
        console.warn(
          "[handleRemoveFile] Failed to remove from localStorage:",
          err,
        );
      }

      const draftCaseInfoId = (file as FileWithDraftId)._draftCaseInfoId;
      if (!draftCaseInfoId || !draftId || !token) {
        // Draft 파일 ID가 없으면 로컬에서만 제거
        const newFiles = filesRef.current.filter((_, i) => i !== index);
        setFiles(newFiles);
        // Remove SSOT key from caseInfosMap
        removeCaseInfos?.(ssotKey);
        console.log("[handleRemoveFile] caseInfosMap remove done", { ssotKey });

        // 모든 파일이 삭제되면 Draft ID도 제거 (V3 모드에서 복원 방지)
        if (newFiles.length === 0) {
          try {
            localStorage.removeItem("abutsfit:new-request-draft-id:v1");
            console.log(
              "[handleRemoveFile] All files removed, cleared draft ID",
            );
          } catch (err) {
            console.warn("[handleRemoveFile] Failed to clear draft ID:", err);
          }
        }

        // Debug: log current local draft files and IDB keys after removal
        try {
          const d = getLocalDraft();
          console.log("[handleRemoveFile] Local draft files after removal", {
            fileKeys: d?.files?.map((f) => f.fileKey),
          });
        } catch {}
        try {
          const { getAllFiles } = await import("../utils/fileIndexedDB");
          const idb = await getAllFiles();
          console.log("[handleRemoveFile] IDB keys after removal", {
            keys: Array.from(idb.keys()),
          });
        } catch {}
        return;
      }

      try {
        // Draft API에서 해당 caseInfo(파일 포함 케이스) 삭제
        const res = await fetch(
          `${API_BASE_URL}/requests/drafts/${draftId}/files/${draftCaseInfoId}`,
          {
            method: "DELETE",
            headers: getHeaders(),
          },
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
          prev.filter((ci) => ci._id !== draftCaseInfoId),
        );
        setFiles((prev) => prev.filter((_, i) => i !== index));
        // Remove SSOT key from caseInfosMap
        removeCaseInfos?.(ssotKey);
        console.log("[handleRemoveFile] caseInfosMap remove done (server)", {
          ssotKey,
        });

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

        // Debug: log current local draft files and IDB keys after server-synced removal
        try {
          const d = getLocalDraft();
          console.log(
            "[handleRemoveFile] Local draft files after server removal",
            {
              fileKeys: d?.files?.map((f) => f.fileKey),
            },
          );
        } catch {}
        try {
          const { getAllFiles } = await import("../utils/fileIndexedDB");
          const idb = await getAllFiles();
          console.log("[handleRemoveFile] IDB keys after server removal", {
            keys: Array.from(idb.keys()),
          });
        } catch {}
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
    ],
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
    [handleUpload],
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
