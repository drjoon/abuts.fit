// change-log:
// - 2026-08-29: 파일명 AI/룰은 치과·환자만 자동 채움. 치아번호는 의뢰자 수동 입력.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/backend/controllers/requests/creation.from-draft.controller.js
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
import { parseFilenameWithRules } from "@/shared/filename/parseFilenameWithRules";
import { request } from "@/shared/api/apiClient";
import { removeUploadedFile } from "../utils/localFileStorage";
import { getLocalDraft, getFileKey } from "../utils/localDraftStorage";

const API_BASE_URL =
  (import.meta.env.DEV && (import.meta.env.VITE_API_BASE_URL as string)) ||
  "/api";

const FILENAME_AI_CACHE_STORAGE_KEY =
  "abutsfit:new-request:filename-ai-cache:v1";
const FILENAME_AI_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7일

type FilenameAiCacheEntry = {
  clinicName: string;
  patientName: string;
  tooth: string;
  cachedAt: number;
};

const filenameAiCache = new Map<string, FilenameAiCacheEntry>();
let filenameAiCacheLoaded = false;

const toFilenameAiCacheKey = (name: string, size: number) =>
  `${normalize(name)}:${size}`;

const loadFilenameAiCache = () => {
  if (filenameAiCacheLoaded) return;
  filenameAiCacheLoaded = true;

  if (typeof window === "undefined") return;

  try {
    const raw = window.localStorage.getItem(FILENAME_AI_CACHE_STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw) as Record<string, FilenameAiCacheEntry>;
    if (!parsed || typeof parsed !== "object") return;

    const now = Date.now();
    Object.entries(parsed).forEach(([key, value]) => {
      if (!value || typeof value !== "object") return;

      const cachedAt = Number(value.cachedAt || 0);
      if (!Number.isFinite(cachedAt) || now - cachedAt > FILENAME_AI_CACHE_TTL_MS) {
        return;
      }

      filenameAiCache.set(key, {
        clinicName: String(value.clinicName || ""),
        patientName: String(value.patientName || ""),
        tooth: String(value.tooth || ""),
        cachedAt,
      });
    });
  } catch {
    // noop
  }
};

const persistFilenameAiCache = () => {
  if (typeof window === "undefined") return;

  try {
    const now = Date.now();
    const serializable: Record<string, FilenameAiCacheEntry> = {};

    filenameAiCache.forEach((value, key) => {
      if (!value || now - value.cachedAt > FILENAME_AI_CACHE_TTL_MS) return;
      serializable[key] = value;
    });

    window.localStorage.setItem(
      FILENAME_AI_CACHE_STORAGE_KEY,
      JSON.stringify(serializable),
    );
  } catch {
    // noop
  }
};

const getFilenameAiCache = (
  key: string,
): { clinicName: string; patientName: string; tooth: string } | null => {
  loadFilenameAiCache();

  const cached = filenameAiCache.get(key);
  if (!cached) return null;

  const now = Date.now();
  if (now - cached.cachedAt > FILENAME_AI_CACHE_TTL_MS) {
    filenameAiCache.delete(key);
    persistFilenameAiCache();
    return null;
  }

  return {
    clinicName: String(cached.clinicName || ""),
    patientName: String(cached.patientName || ""),
    tooth: String(cached.tooth || ""),
  };
};

const setFilenameAiCache = (
  key: string,
  value: { clinicName: string; patientName: string; tooth: string },
) => {
  const clinicName = String(value?.clinicName || "").trim();
  const patientName = String(value?.patientName || "").trim();
  const tooth = String(value?.tooth || "").trim();

  // 의미 있는 값이 하나라도 있을 때만 캐시
  if (!clinicName && !patientName && !tooth) return;

  loadFilenameAiCache();
  filenameAiCache.set(key, {
    clinicName,
    patientName,
    tooth,
    cachedAt: Date.now(),
  });
  persistFilenameAiCache();
};

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
  const caseInfosMapRef = useRef(caseInfosMap);
  useEffect(() => {
    draftIdRef.current = draftId;
  }, [draftId]);

  useEffect(() => {
    caseInfosMapRef.current = caseInfosMap;
  }, [caseInfosMap]);

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
    return;
  }, []);

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
        // 치아번호는 오인식이 잦아 자동 채우지 않음 — 의뢰자 수동 입력.
        if (updateCaseInfos) {
          filesToProcess.forEach((f) => {
            const normalizedName = normalize(f.name);
            const fileKey = `${normalizedName}:${f.size}`;
            const parsed = parseFilenameWithRules(normalizedName);
            const clinicName = String(parsed.clinicName || "").trim();
            const patientName = String(parsed.patientName || "").trim();
            if (!clinicName && !patientName) {
              return;
            }

            const existing =
              (caseInfosMap && (caseInfosMap as any)[fileKey]) || null;
            updateCaseInfos(fileKey, {
              clinicName:
                String(existing?.clinicName || "").trim() ||
                clinicName ||
                undefined,
              patientName:
                String(existing?.patientName || "").trim() ||
                patientName ||
                undefined,
            });
          });
        }

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

          // 6. 파일 업로드 직후 자동 인식 (치과명·환자명만)
          //    1차: 룰/regex 기반으로 빠르게 선반영
          //    2차: 백엔드 AI(/api/ai/parse-filenames)는 치과/환자가 모두 비어 있을 때만 호출
          //    치아번호는 오인식이 잦아 자동 채우지 않음 — 의뢰자 수동 입력.
          if (updateCaseInfos) {
            const filenamesForAi: string[] = [];
            const fileKeysForAi: string[] = [];
            const parsedByRule = new Map<
              string,
              { clinicName?: string; patientName?: string; tooth?: string }
            >();
            const aiCacheKeyByFileKey = new Map<string, string>();

            const trimText = (value: unknown) => String(value || "").trim();

            // Draft가 저장한 정규화된 originalName 기준으로 파싱/AI 대상을 구성한다.
            // (optimistic 단계에서는 NFD 등으로 파싱이 실패할 수 있음)
            newDraftFiles.forEach((draftCase) => {
              const fileMeta = draftCase?.file;
              const originalName = String(fileMeta?.originalName || "").trim();
              const size = Number(fileMeta?.size || 0);
              if (!originalName || !Number.isFinite(size) || size <= 0) return;

              const fileKey = `${originalName}:${size}`;
              const parsed = parseFilenameWithRules(originalName);
              parsedByRule.set(fileKey, parsed);

              const current =
                (caseInfosMapRef.current &&
                  (caseInfosMapRef.current as any)[fileKey]) ||
                {};

              const hasClinicOrPatientCurrent =
                !!trimText(current?.clinicName) ||
                !!trimText(current?.patientName);

              const hasClinicOrPatientParsed =
                !!trimText(parsed?.clinicName) ||
                !!trimText(parsed?.patientName);

              if (hasClinicOrPatientParsed) {
                // 1차 룰 결과 선반영 (치아번호 제외)
                updateCaseInfos(fileKey, {
                  _id: draftCase?._id,
                  clinicName: parsed.clinicName || "",
                  patientName: parsed.patientName || "",
                });
              }

              // 비용 절감: 치과/환자가 모두 비어 있을 때만 AI 호출
              if (!hasClinicOrPatientCurrent && !hasClinicOrPatientParsed) {
                const cacheKey = toFilenameAiCacheKey(originalName, size);
                const cached = getFilenameAiCache(cacheKey);
                const cachedClinic = trimText(cached?.clinicName);
                const cachedPatient = trimText(cached?.patientName);

                if ((cachedClinic || cachedPatient) && cached) {
                  updateCaseInfos(fileKey, {
                    _id: draftCase?._id,
                    clinicName: cachedClinic,
                    patientName: cachedPatient,
                  });
                  return;
                }

                filenamesForAi.push(originalName);
                fileKeysForAi.push(fileKey);
                aiCacheKeyByFileKey.set(fileKey, cacheKey);
              }
            });

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

                  // 동일 filename이 여러 개일 수 있어 queue 방식으로 인덱스 매핑
                  const queueByFilename = new Map<string, number[]>();
                  filenamesForAi.forEach((name, idx) => {
                    const q = queueByFilename.get(name) || [];
                    q.push(idx);
                    queueByFilename.set(name, q);
                  });

                  items.forEach((item: any) => {
                    const queue = queueByFilename.get(String(item?.filename || ""));
                    if (!queue || queue.length === 0) return;

                    const idx = queue.shift() as number;
                    const fileKey = fileKeysForAi[idx];
                    const draftCase = newDraftFiles.find((ci: any) => {
                      const fm = ci?.file;
                      return `${fm?.originalName}:${fm?.size}` === fileKey;
                    });

                    const current =
                      (caseInfosMapRef.current && (caseInfosMapRef.current as any)[fileKey]) ||
                      {};
                    const fallback = parsedByRule.get(fileKey) || {};

                    // 수동 입력이 이미 있으면 유지하고,
                    // 빈 값만 AI -> 룰 순으로 채운다. 치아번호는 자동 채우지 않음.
                    const aiClinicName = trimText(item?.clinicName);
                    const aiPatientName = trimText(item?.patientName);
                    const aiTooth = trimText(item?.tooth);

                    const clinicName =
                      trimText(current?.clinicName) ||
                      aiClinicName ||
                      trimText(fallback?.clinicName);
                    const patientName =
                      trimText(current?.patientName) ||
                      aiPatientName ||
                      trimText(fallback?.patientName);

                    updateCaseInfos(fileKey, {
                      _id: item._id || draftCase?._id,
                      clinicName,
                      patientName,
                    });

                    const cacheKey = aiCacheKeyByFileKey.get(fileKey);
                    if (cacheKey) {
                      setFilenameAiCache(cacheKey, {
                        clinicName: aiClinicName,
                        patientName: aiPatientName,
                        tooth: aiTooth,
                      });
                    }
                  });
                } catch (error) {
                  // AI 분석 실패 시 1차 룰 결과를 유지
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
      } catch {
        // noop
      }

      try {
        // Remove from local draft meta by SSOT key
        removeUploadedFile(ssotKey);
      } catch {
        // noop
      }

      const draftCaseInfoId = (file as FileWithDraftId)._draftCaseInfoId;
      if (!draftCaseInfoId || !draftId || !token) {
        // Draft 파일 ID가 없으면 로컬에서만 제거
        const newFiles = filesRef.current.filter((_, i) => i !== index);
        setFiles(newFiles);
        // Remove SSOT key from caseInfosMap
        removeCaseInfos?.(ssotKey);

        // 모든 파일이 삭제되면 Draft ID도 제거 (V3 모드에서 복원 방지)
        if (newFiles.length === 0) {
          try {
            localStorage.removeItem("abutsfit:new-request-draft-id:v1");
          } catch {
            // noop
          }
        }
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
