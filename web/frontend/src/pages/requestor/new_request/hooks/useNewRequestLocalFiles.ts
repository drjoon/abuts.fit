// change-log:
// - 2026-08-29: 파일명 AI/룰은 치과·환자만 자동 채움. 치아번호는 의뢰자 수동 입력.
// - 2026-08-09: 신규의뢰 V3 로컬 업로드에서도 파일명 AI로 치과/환자 보강.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/backend/controllers/requests/creation.from-draft.controller.js
// - web/frontend/src/pages/requestor/new_request/hooks/usePatientFileGroups.ts
// - web/frontend/src/pages/requestor/new_request/utils/filenameAiCache.ts
import { useCallback, useRef } from "react";
import { saveFile } from "../utils/fileIndexedDB";
import { getFileKey } from "../utils/localDraftStorage";
import { addUploadedFiles, filterNewFiles } from "../utils/localFileStorage";
import {
  getFilenameAiCache,
  setFilenameAiCache,
  toFilenameAiCacheKey,
} from "../utils/filenameAiCache";
import { useToast } from "@/shared/hooks/use-toast";
import { parseFilenameWithRules } from "@/shared/filename/parseFilenameWithRules";
import { request } from "@/shared/api/apiClient";

export type LocalUploadParsedMeta = {
  fileKey: string;
  clinicName?: string;
  patientName?: string;
};

const trimText = (value: unknown) => String(value || "").trim();

export const useNewRequestLocalFiles = ({
  setFiles,
  setSelectedPreviewIndex,
  updateCaseInfos,
  caseInfosMap,
  onFilesAdded,
}: {
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  setSelectedPreviewIndex: React.Dispatch<React.SetStateAction<number | null>>;
  updateCaseInfos?: (fileKey: string, updates: any) => void;
  caseInfosMap?: Record<string, any>;
  onFilesAdded?: (payload: {
    files: File[];
    parsed: LocalUploadParsedMeta[];
  }) => void;
}) => {
  const { toast } = useToast();
  const aiQuotaExhaustedRef = useRef(false);
  const caseInfosMapRef = useRef(caseInfosMap);
  caseInfosMapRef.current = caseInfosMap;

  const normalize = (s: string) => {
    try {
      return String(s || "").normalize("NFC");
    } catch {
      return String(s || "");
    }
  };

  const enrichWithAi = useCallback(
    async (params: {
      files: File[];
      parsedByRule: Map<
        string,
        { clinicName?: string; patientName?: string }
      >;
    }) => {
      if (!updateCaseInfos) return [] as LocalUploadParsedMeta[];
      if (aiQuotaExhaustedRef.current) return [] as LocalUploadParsedMeta[];

      const filenamesForAi: string[] = [];
      const fileKeysForAi: string[] = [];
      const aiCacheKeyByFileKey = new Map<string, string>();
      const enriched: LocalUploadParsedMeta[] = [];

      for (const file of params.files) {
        const fileKey = getFileKey(file);
        const current = caseInfosMapRef.current?.[fileKey] || {};
        const fallback = params.parsedByRule.get(fileKey) || {};
        const clinicName =
          trimText(current?.clinicName) || trimText(fallback?.clinicName);
        const patientName =
          trimText(current?.patientName) || trimText(fallback?.patientName);

        // 치과명·환자명 중 하나라도 비어 있으면 AI로 보강
        if (clinicName && patientName) continue;

        const cacheKey = toFilenameAiCacheKey(file.name, file.size);
        const cached = getFilenameAiCache(cacheKey);
        const cachedClinic = trimText(cached?.clinicName);
        const cachedPatient = trimText(cached?.patientName);

        if (cachedClinic || cachedPatient) {
          const nextClinic = clinicName || cachedClinic || undefined;
          const nextPatient = patientName || cachedPatient || undefined;
          updateCaseInfos(fileKey, {
            ...(nextClinic ? { clinicName: nextClinic } : {}),
            ...(nextPatient ? { patientName: nextPatient } : {}),
          });
          enriched.push({
            fileKey,
            clinicName: nextClinic,
            patientName: nextPatient,
          });
          continue;
        }

        filenamesForAi.push(file.name);
        fileKeysForAi.push(fileKey);
        aiCacheKeyByFileKey.set(fileKey, cacheKey);
      }

      if (filenamesForAi.length === 0) return enriched;

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
          return enriched;
        }

        const items = (res.data as any)?.data || res.data;
        if (!Array.isArray(items) || !items.length) return enriched;

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
          if (!fileKey) return;

          const current = caseInfosMapRef.current?.[fileKey] || {};
          const fallback = params.parsedByRule.get(fileKey) || {};
          const aiClinicName = trimText(item?.clinicName);
          const aiPatientName = trimText(item?.patientName);
          const aiTooth = trimText(item?.tooth);

          const nextClinic =
            trimText(current?.clinicName) ||
            aiClinicName ||
            trimText(fallback?.clinicName) ||
            undefined;
          const nextPatient =
            trimText(current?.patientName) ||
            aiPatientName ||
            trimText(fallback?.patientName) ||
            undefined;

          if (nextClinic || nextPatient) {
            updateCaseInfos(fileKey, {
              ...(nextClinic ? { clinicName: nextClinic } : {}),
              ...(nextPatient ? { patientName: nextPatient } : {}),
            });
            enriched.push({
              fileKey,
              clinicName: nextClinic,
              patientName: nextPatient,
            });
          }

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
        console.warn("[NewRequestLocalFiles] AI parse failed:", error);
      }

      return enriched;
    },
    [toast, updateCaseInfos],
  );

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

        const parsedMeta: LocalUploadParsedMeta[] = [];
        const parsedByRule = new Map<
          string,
          { clinicName?: string; patientName?: string }
        >();

        normalizedFiles.forEach((file) => {
          const normalizedName = normalize(file.name);
          const fileKey = getFileKey(file);
          const parsed = parseFilenameWithRules(normalizedName);
          const clinicName = trimText(parsed.clinicName) || undefined;
          const patientName = trimText(parsed.patientName) || undefined;

          parsedByRule.set(fileKey, { clinicName, patientName });
          parsedMeta.push({ fileKey, clinicName, patientName });

          if (!updateCaseInfos) return;
          if (!clinicName && !patientName) return;

          const existing = caseInfosMapRef.current?.[fileKey] || null;
          updateCaseInfos(fileKey, {
            clinicName: trimText(existing?.clinicName) || clinicName,
            patientName: trimText(existing?.patientName) || patientName,
          });
        });

        onFilesAdded?.({ files: normalizedFiles, parsed: parsedMeta });

        toast({
          title: "파일 추가 완료",
          description: `${normalizedFiles.length}개 파일이 추가되었습니다.`,
          duration: 2000,
        });

        // 룰로 치과/환자가 비면 AI로 보강 (치아번호는 자동 채우지 않음)
        void enrichWithAi({ files: normalizedFiles, parsedByRule }).then(
          (enriched) => {
            if (!enriched.length) return;
            onFilesAdded?.({ files: normalizedFiles, parsed: enriched });
          },
        );
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
    [
      setFiles,
      setSelectedPreviewIndex,
      updateCaseInfos,
      onFilesAdded,
      toast,
      enrichWithAi,
    ],
  );

  return { handleUpload };
};
