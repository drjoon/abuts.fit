/* eslint-disable @typescript-eslint/no-explicit-any */
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/requestor/new_request/hooks/useNewRequestPage.ts
// - web/frontend/src/shared/hooks/useFilePreUpload.ts
// - web/backend/controllers/requests/creation.from-draft.controller.js
// - 2026-08-21: 제출 시 아노 미설정이면 defaults→true로 보정(사업체 OFF 폴백만 타는 경우 방지).
// - 2026-08-19: 성공 시 로컬 초안을 파일 비우기 전에 지움. 제출 시작/성공 콜백으로 입력 중 중복 체크를 무효화.
// - 2026-08-19: IndexedDB 파일 삭제는 이동과 겹쳐 제출 체감을 막지 않는다.
// - 2026-08-19: 제출 잠금(ref). 방금 생성된 건을 중복으로 오인하면 성공 처리.
// - 2026-08-19: 제출 시작 시 초안 PATCH debounce를 멈춰 from-draft와 겹치지 않게.
// - 2026-08-13: 제출 시 사전업로드 캐시·from-draft caseInfos로 PATCH/credits GET 생략
// - 2026-10-18: from-draft 404면 새 Draft로 한 번 재시도. 성공 시 메타의 죽은 id도 지움.
// - 2026-09-10: from-draft 403(타 계정 Draft) 시 로컬 draft 캐시 삭제 + 새로고침 안내
/**
 * ===== 신규 의뢰 제출 표준 훅 (SSOT) =====
 * Draft 기반 워크플로우: POST /api/requests/from-draft 사용
 * - 중복 체크, 크레딧 체크, 에러 처리 포함
 * - 백엔드: creation.from-draft.controller.js의 createRequestsFromDraft
 * - 참고: rules.legacy-full.md 섹션 4.3.2 "신규 의뢰 생성 엔드포인트 (SSOT)"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadStashedUnsupportedCancelItems,
  stashUnsupportedCancelItems,
} from "@/shared/practice/unsupportedConnectionCancel";
import { useToast } from "@/shared/hooks/use-toast";
import { type ClinicPreset, type CaseInfos } from "./newRequestTypes";
import { clearFileCache } from "@/shared/files/fileCache";
import { createParseLog } from "@/shared/services/parseLogService";
import { parseFilenameWithRules } from "@/shared/filename/parseFilenameWithRules";
import { useUploadWithProgressToast } from "@/shared/hooks/useUploadWithProgressToast";
import { type TempUploadedFile } from "@/shared/hooks/useS3TempUpload";
import type { PatientFileGroup } from "../utils/patientGroups";
import {
  buildAttachmentListItems,
  getPrimaryFileKey,
} from "../utils/patientGroups";
import {
  buildNewSystemRequestPayload,
  collectNewImplantAckLines,
} from "@/shared/practice/newImplantCaseInfos";
import { clearLocalDraft } from "../utils/localDraftStorage";
import { clearAllFiles } from "../utils/fileIndexedDB";

const NEW_REQUEST_DRAFT_ID_STORAGE_KEY = "abutsfit:new-request-draft-id:v1";
const API_BASE_URL =
  (import.meta.env.DEV && (import.meta.env.VITE_API_BASE_URL as string)) ||
  "/api";

type UseNewRequestSubmitV2Params = {
  existingRequestId?: string;
  draftId?: string;
  token: string | null;
  navigate: (path: string) => void;
  files: File[];
  setFiles: (v: File[]) => void;
  clinicPresets: ClinicPreset[];
  selectedClinicId: string | null;
  setSelectedPreviewIndex: (v: number | null) => void;
  caseInfosMap?: Record<string, CaseInfos>;
  patientGroups?: PatientFileGroup[];
  patchDraftImmediately?: (map: Record<string, CaseInfos>) => Promise<void>;
  /**
   * 좁은 코너면 접수 검사가 S3에 남긴 보정 STL을 반환한다.
   * null이면 올린 원본을 쓴다. 실패해도 접수는 막지 않는다.
   */
  resolveCorrectedDesignUpload?: (file: File) => Promise<TempUploadedFile | null>;
  /** 사전 업로드 캐시 재사용 (useFilePreUpload.ensureFilesUploaded) */
  uploadFiles?: (
    files: File[],
    onProgress?: (progress: Record<string, number>) => void,
  ) => Promise<TempUploadedFile[]>;
  peekCachedUploadedFiles?: (files: File[]) => TempUploadedFile[] | null;
  onDuplicateDetected?: (payload: {
    mode: "active" | "tracking";
    duplicates: any[];
    remakeQuota?: {
      limit: number;
      used: number;
      remaining: number;
      currentMonthStartYmd?: string;
      currentMonthEndExclusiveYmd?: string;
    } | null;
  }) => void;
  /** 제출 시작 — 진행 중인 입력 중 중복 체크를 무효화 */
  onSubmitStart?: () => void;
  /** 서버 Draft가 없을 때 새 id. 첨부 파일은 유지한다. */
  onDraftMissing?: (
    map: Record<string, CaseInfos>,
  ) => Promise<string | null>;
  /** 성공 확정 직후(파일 비우기 전) — 로컬 초안 복원·중복 모달 억제 */
  onSuccessfulSubmitBegin?: () => void | Promise<void>;
};

type DuplicateResolutionCase = {
  caseId: string;
  strategy: "skip" | "replace" | "remake";
  existingRequestId: string;
};

export const useNewRequestSubmitV2 = ({
  existingRequestId,
  draftId,
  token,
  navigate,
  files,
  setFiles,
  clinicPresets,
  selectedClinicId,
  setSelectedPreviewIndex,
  caseInfosMap,
  patientGroups = [],
  patchDraftImmediately,
  resolveCorrectedDesignUpload,
  uploadFiles,
  peekCachedUploadedFiles,
  onDuplicateDetected,
  onSubmitStart,
  onDraftMissing,
  onSuccessfulSubmitBegin,
}: UseNewRequestSubmitV2Params) => {
  const { toast, dismiss } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [unsupportedCancelItems, setUnsupportedCancelItems] = useState<
    Array<{
      requestMongoId: string;
      requestId?: string;
      tooth?: string;
      label: string;
      cancelVia?: string;
    }>
  >([]);
  const [unsupportedCancelBusy, setUnsupportedCancelBusy] = useState(false);
  const [newImplantAckLines, setNewImplantAckLines] = useState<string[]>([]);
  useEffect(() => {
    const stashed = loadStashedUnsupportedCancelItems("new-request");
    if (stashed.length) setUnsupportedCancelItems(stashed);
  }, []);
  useEffect(() => {
    stashUnsupportedCancelItems("new-request", unsupportedCancelItems);
  }, [unsupportedCancelItems]);
  const submittingRef = useRef(false);
  const resolveCorrectedRef = useRef(resolveCorrectedDesignUpload);
  resolveCorrectedRef.current = resolveCorrectedDesignUpload;
  const preparedDraftRef = useRef<{
    draftId: string;
    uploadFingerprint: string;
    caseInfos?: Array<Record<string, unknown>>;
  } | null>(null);
  const { uploadFilesWithToast } = useUploadWithProgressToast({
    token,
    uploadFiles,
    peekCachedUploadedFiles,
  });

  const normalizeKeyPart = (s: string) => {
    try {
      return String(s || "").normalize("NFC");
    } catch {
      return String(s || "");
    }
  };

  const toNormalizedFileKey = (file: File) => {
    return `${normalizeKeyPart(file.name)}:${file.size}`;
  };

  const buildFilesFingerprint = (inputFiles: File[]) => {
    return inputFiles
      .map((f) => `${normalizeKeyPart(f.name)}:${f.size}`)
      .sort()
      .join("|");
  };

  const buildUploadFingerprint = (stlFiles: File[]) => {
    return buildFilesFingerprint(stlFiles);
  };

  const redirectToProfileIfNeeded = async () => false;

  useEffect(() => {
    preparedDraftRef.current = null;
  }, [draftId]);

  /**
   * 파일별 파싱 로그 저장
   * 파싱 결과 vs 사용자 최종 입력값 비교
   */
  const saveParseLogs = async () => {
    if (!files || files.length === 0 || !caseInfosMap) return;

    for (const file of files) {
      try {
        const fileKey = toNormalizedFileKey(file);
        const userInput = caseInfosMap[fileKey];

        if (!userInput) continue;

        // 파일명 파싱 결과
        const parsed = parseFilenameWithRules(file.name);

        // 로그 저장
        await createParseLog({
          filename: file.name,
          parsed: {
            clinicName: parsed.clinicName,
            patientName: parsed.patientName,
            tooth: parsed.tooth,
          },
          userInput: {
            clinicName: userInput.clinicName,
            patientName: userInput.patientName,
            tooth: userInput.tooth,
          },
          draftId,
        });
      } catch (err) {
        // 로그 저장 실패는 무시 (의뢰 제출에 영향 없음)
        console.warn("[useNewRequestSubmitV2] Failed to save parse log:", err);
      }
    }
  };

  // 헤더 생성 (mock dev 토큰 지원)
  const getHeaders = () => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  };

  const handleCancel = async () => {
    preparedDraftRef.current = null;

    // V3: 로컬 스토리지와 IndexedDB 정리
    try {
      await clearLocalDraft();
    } catch (err) {
      console.warn("[handleCancel] Failed to clear local draft:", err);
    }

    // NOTE: resetDraft() 후 useNewRequestPage의 draftId 변경 effect가
    // 자동으로 setFiles([])를 호출하므로, 여기서는 setSelectedPreviewIndex만 리셋
    setSelectedPreviewIndex(null);
  };

  const submitFromDraft = async (
    duplicateResolutions?: DuplicateResolutionCase[],
  ) => {
    if (submittingRef.current || isSubmitting) return;
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    // 의뢰 수정 모드
    if (existingRequestId) {
      try {
        const base = caseInfosMap?.__default__;
        const payload: any = {};

        if (base && typeof base === "object") {
          payload.caseInfos = {
            clinicName: base.clinicName,
            patientName: base.patientName,
            tooth: base.tooth,
            implantManufacturer: base.implantManufacturer,
            implantBrand: base.implantBrand,
            implantFamily: base.implantFamily,
            implantType: base.implantType,
            maxDiameter: base.maxDiameter,
            connectionDiameter: base.connectionDiameter,
            totalLength: base.totalLength,
            taperAngle: base.taperAngle,
            workType: base.workType,
            productMode: base.productMode,
            prosthesisType: base.prosthesisType,
            toothWorks: base.toothWorks,
            memo: base.memo,
            retentionGroove: base.retentionGroove,
            screwSupply: base.screwSupply,
            requestorHexRotation: base.requestorHexRotation,
            shippingMode: base.shippingMode,
            requestedShipDate: base.requestedShipDate,
            designSoftware: base.designSoftware,
            anodizingEnabled: base.anodizingEnabled,
          };

          Object.keys(payload.caseInfos).forEach((k) => {
            if (payload.caseInfos[k] === undefined) {
              delete payload.caseInfos[k];
            }
          });

          if (Object.keys(payload.caseInfos).length === 0) {
            delete payload.caseInfos;
          }
        }

        const res = await fetch(
          `${API_BASE_URL}/requests/${existingRequestId}`,
          {
            method: "PUT",
            headers: getHeaders(),
            body: JSON.stringify(payload),
          },
        );

        if (!res.ok) throw new Error("서버 응답 오류");

        toast({ title: "의뢰가 수정되었습니다", duration: 2000 });
        navigate("/dashboard");
      } catch (err: any) {
        toast({
          title: "의뢰 제출 중 오류",
          description:
            (err?.message || "알 수 없는 오류") +
            "\n크라운은 참고용이고, 커스텀 어벗만 의뢰할 수 있습니다.",
          variant: "destructive",
          duration: 3000,
        });
      }
      return;
    }

    // 신규 의뢰 제출 모드
    if (!draftId) {
      toast({
        title: "오류",
        description: "Draft ID가 없습니다. 페이지를 새로고침해주세요.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    submittingRef.current = true;
    onSubmitStart?.();
    const submitStart = Date.now();
    console.log("[NewRequestSubmit] submit start", {
      draftId,
      filesCount: files.length,
      hasDuplicateResolutions: Boolean(duplicateResolutions?.length),
    });

    const finishSuccessfulSubmit = async (options?: {
      deferNavigate?: boolean;
      skipSuccessToast?: boolean;
    }) => {
      saveParseLogs().catch((err) => {
        console.warn("[useNewRequestSubmitV2] Failed to save parse logs:", err);
      });

      try {
        await Promise.resolve(onSuccessfulSubmitBegin?.());
      } catch {
        // noop
      }

      try {
        clearLocalDraft();
        void clearAllFiles().catch(() => {});
      } catch (err) {
        console.warn("[submitFromDraft] Failed to clear local draft:", err);
      }

      try {
        void fetch(`${API_BASE_URL}/requests/drafts/${draftId}`, {
          method: "DELETE",
          headers: getHeaders(),
        });
      } catch {
        // noop
      }

      preparedDraftRef.current = null;
      setFiles([]);
      setSelectedPreviewIndex(null);

      try {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(NEW_REQUEST_DRAFT_ID_STORAGE_KEY);
          const prefix = "abutsfit:new-request-draft-meta:v1:";
          for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
            const key = window.localStorage.key(i);
            if (key && key.startsWith(prefix)) {
              window.localStorage.removeItem(key);
            }
          }
          clearFileCache();
        }
      } catch {
        // noop
      }

      dismiss();
      if (!options?.deferNavigate && !options?.skipSuccessToast) {
        toast({ title: "의뢰가 제출되었습니다" });
      }
      if (options?.deferNavigate) return;
      console.log("[NewRequestSubmit] navigate", {
        t: Date.now() - submitStart,
      });
      navigate(`/dashboard`);
    };

    try {
      setIsSubmitting(true);

      // 1. 클라이언트 사이드 중복 체크 (동기)
      if (files.length > 1 && caseInfosMap) {
        const firstByCombo = new Map<string, File>();
        const localDuplicates: {
          caseId: string;
          fileName: string;
          stageOrder: number;
          existingRequest: null;
          existingRequestId: string;
          duplicateType: "INTRA_SUBMISSION";
          combo: {
            clinicName: string;
            patientName: string;
            tooth: string;
          };
          firstFileName: string;
        }[] = [];

        for (const file of files) {
          const fileKey = toNormalizedFileKey(file);
          const info = caseInfosMap[fileKey];
          if (!info) continue;

          const clinicName = String(info.clinicName || "").trim();
          const patientName = String(info.patientName || "").trim();
          const tooth = String(info.tooth || "").trim();
          if (!clinicName || !patientName || !tooth) continue;

          const combo = `${clinicName}|${patientName}|${tooth}`;
          const first = firstByCombo.get(combo);
          if (!first) {
            firstByCombo.set(combo, file);
            continue;
          }

          localDuplicates.push({
            caseId: String((file as File & { _draftCaseInfoId?: string })?._draftCaseInfoId || fileKey).trim(),
            fileName: file.name,
            stageOrder: 0,
            existingRequest: null,
            existingRequestId: "",
            duplicateType: "INTRA_SUBMISSION",
            combo: {
              clinicName,
              patientName,
              tooth,
            },
            firstFileName: first.name,
          });
        }

        if (localDuplicates.length > 0) {
          onDuplicateDetected?.({
            mode: "active",
            duplicates: localDuplicates,
            remakeQuota: null,
          });

          if (!onDuplicateDetected) {
            const labels = localDuplicates.map(
              (d) => `${d.combo.patientName}(${d.combo.tooth})`,
            );
            toast({
              title: "의뢰 제출 중 오류",
              description: `제출한 의뢰 목록에 동일한 치과/환자/치아 조합이 중복되었습니다: ${labels.join(
                ", ",
              )}.`,
              variant: "destructive",
              duration: 5000,
            });
          }
          return;
        }
      }

      // 2. S3는 첨부 시 백그라운드 사전 업로드. 제출은 캐시 재사용만.
      // 크레딧 부족은 from-draft 402가 SSOT. 제출 직전 balance GET은 생략.
      const validFileKeys = new Set(files.map((f) => toNormalizedFileKey(f)));
      const filteredMap: Record<string, CaseInfos> = {};
      if (caseInfosMap) {
        for (const [key, value] of Object.entries(caseInfosMap)) {
          if (key === "__default__" || validFileKeys.has(key)) {
            filteredMap[key] = value;
          }
        }
      }
      const pendingNewImplantAckLines = collectNewImplantAckLines(
        filteredMap,
        validFileKeys,
      );

      const uploadFingerprint = buildUploadFingerprint(files);
      const canReusePreparedDraft =
        Array.isArray(duplicateResolutions) &&
        duplicateResolutions.length > 0 &&
        preparedDraftRef.current?.draftId === String(draftId) &&
        preparedDraftRef.current?.uploadFingerprint === uploadFingerprint;

      let submitCaseInfos: Array<Record<string, unknown>> | null =
        canReusePreparedDraft &&
        Array.isArray(preparedDraftRef.current?.caseInfos)
          ? preparedDraftRef.current.caseInfos
          : null;

      if (canReusePreparedDraft && submitCaseInfos?.length) {
        console.log(
          "[useNewRequestSubmitV2] Reusing prepared draft files, skip re-upload",
          {
            draftId,
            filesCount: files.length,
            companionCount: 0,
          },
        );
      } else {
        let tempFiles: TempUploadedFile[] = [];
        // 보정 STL이 없거나 실패해도 원본으로 접수한다.
        const correctedFiles: Array<TempUploadedFile | null> = await Promise.all(
          files.map((file) =>
            resolveCorrectedRef.current
              ? resolveCorrectedRef.current(file).catch(() => null)
              : Promise.resolve(null),
          ),
        );
        try {
          tempFiles =
            files.length > 0
              ? await uploadFilesWithToast(files)
              : [];
        } catch {
          return;
        }

        if (files.length > 0 && tempFiles.length > 0) {
          const fileByKey = new Map<
            string,
            { file: File; temp: TempUploadedFile }
          >();
          for (let i = 0; i < files.length; i += 1) {
            const file = files[i];
            const corrected = correctedFiles[i];
            const tf = corrected?.key ? corrected : tempFiles[i];
            if (!file || !tf?.key) continue;
            fileByKey.set(toNormalizedFileKey(file), { file, temp: tf });
          }

          const listItems = buildAttachmentListItems(
            files,
            toNormalizedFileKey,
            patientGroups,
          );

          const buildCasePayload = (
            primaryKey: string,
            memberKeys: string[],
          ) => {
            const primary = fileByKey.get(primaryKey);
            if (!primary) return null;
            const ci = (caseInfosMap?.[primaryKey] ||
              filteredMap[primaryKey] ||
              {}) as Partial<CaseInfos>;
            const defaults = (caseInfosMap?.__default__ ||
              filteredMap.__default__ ||
              {}) as Partial<CaseInfos>;

            const primaryKeyNorm = String(primary.temp.key || "").trim();
            const extraFiles = memberKeys
              .map((key) => fileByKey.get(key))
              .filter(
                (
                  row,
                ): row is { file: File; temp: TempUploadedFile } => Boolean(row),
              )
              .filter(
                (row) =>
                  String(row.temp.key || "").trim() !== primaryKeyNorm,
              )
              .map(({ temp }) => ({
                originalName: temp.originalName,
                size: temp.size,
                mimetype: temp.mimetype,
                s3Key: temp.key,
              }));

            const newSystemRequest = buildNewSystemRequestPayload(ci);
            return {
              clinicName: ci.clinicName,
              patientName: ci.patientName,
              tooth: ci.tooth,
              implantManufacturer: newSystemRequest
                ? undefined
                : ci.implantManufacturer,
              implantBrand: newSystemRequest ? undefined : ci.implantBrand,
              implantFamily: newSystemRequest ? undefined : ci.implantFamily,
              implantType: newSystemRequest ? undefined : ci.implantType,
              implantInputMode: newSystemRequest ? "custom" : ci.implantInputMode,
              newSystemRequest,
              maxDiameter: ci.maxDiameter,
              connectionDiameter: ci.connectionDiameter,
              totalLength: ci.totalLength,
              taperAngle: ci.taperAngle,
              workType: ci.workType || "abutment",
              productMode: ci.productMode,
              prosthesisType: ci.prosthesisType,
              toothWorks: ci.toothWorks,
              memo: ci.memo,
              retentionGroove: ci.retentionGroove,
              screwSupply: ci.screwSupply,
              requestorHexRotation: ci.requestorHexRotation,
              filletOvercutAllowed: ci.filletOvercutAllowed === true,
              filletDesignChoice:
                ci.filletDesignChoice === "fix" || ci.filletDesignChoice === "asis"
                  ? ci.filletDesignChoice
                  : null,
              shippingMode: ci.shippingMode,
              requestedShipDate: ci.requestedShipDate,
              designSoftware: String(
                ci.designSoftware || defaults.designSoftware || "",
              ).trim(),
              anodizingEnabled:
                typeof ci.anodizingEnabled === "boolean"
                  ? ci.anodizingEnabled
                  : typeof defaults.anodizingEnabled === "boolean"
                    ? defaults.anodizingEnabled
                    : true,
              file: {
                originalName: primary.temp.originalName,
                size: primary.temp.size,
                mimetype: primary.temp.mimetype,
                s3Key: primary.temp.key,
              },
              ...(extraFiles.length > 0
                ? {
                    files: extraFiles,
                  }
                : {}),
            };
          };

          submitCaseInfos = listItems
            .map((item) => {
              if (item.kind === "group") {
                const primary =
                  getPrimaryFileKey(item.group) || item.group.fileKeys[0];
                return buildCasePayload(primary, item.group.fileKeys);
              }
              return buildCasePayload(item.fileKey, [item.fileKey]);
            })
            .filter((ci): ci is NonNullable<typeof ci> =>
              Boolean(ci?.file?.s3Key),
            );
        } else if (
          patchDraftImmediately &&
          Object.keys(filteredMap).length > 0
        ) {
          await patchDraftImmediately(filteredMap).catch((err) =>
            console.warn(
              "[useNewRequestSubmitV2] Pre-submit patch failed:",
              err,
            ),
          );
        }

        preparedDraftRef.current = {
          draftId: String(draftId),
          uploadFingerprint,
          caseInfos: submitCaseInfos || undefined,
        };
      }

      // 3. Draft를 Request로 전환. s3Key는 from-draft body로 전달해 Draft PATCH 왕복을 생략한다.
      console.log("[useNewRequestSubmitV2] Submitting draft to request...", {
        draftId,
        duplicateResolutionsCount: duplicateResolutions?.length || 0,
      });

      const payload: any = {
        draftId,
        clinicId: selectedClinicId || undefined,
      };

      if (Array.isArray(submitCaseInfos) && submitCaseInfos.length > 0) {
        payload.caseInfos = submitCaseInfos;
      }

      if (Array.isArray(duplicateResolutions) && duplicateResolutions.length) {
        payload.duplicateResolutions = duplicateResolutions;
        console.log(
          "[useNewRequestSubmitV2] Resolution details:",
          duplicateResolutions,
        );
      }

      console.log("[NewRequestSubmit] submit API start", {
        t: Date.now() - submitStart,
        resolutions: duplicateResolutions?.length || 0,
      });
      let res = await fetch(`${API_BASE_URL}/requests/from-draft`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });
      console.log("[NewRequestSubmit] submit API response", {
        t: Date.now() - submitStart,
        ok: res.ok,
        status: res.status,
      });

      let errData: any = null;
      if (!res.ok) {
        errData = await res.json().catch(() => ({}));
        if (
          res.status === 404 &&
          String(errData?.message || "").includes("Draft") &&
          onDraftMissing
        ) {
          const nextId = await onDraftMissing(caseInfosMap || {});
          if (nextId) {
            payload.draftId = nextId;
            res = await fetch(`${API_BASE_URL}/requests/from-draft`, {
              method: "POST",
              headers: getHeaders(),
              body: JSON.stringify(payload),
            });
            errData = res.ok ? null : await res.json().catch(() => ({}));
          }
        }
      }

      if (!res.ok) {
        const dupCount = Array.isArray(errData?.data?.duplicates)
          ? errData.data.duplicates.length
          : 0;
        console.error("[useNewRequestSubmitV2] Server error response:", {
          status: res.status,
          code: errData?.code,
          message: errData?.message,
          dupCount,
        });

        // 402 크레딧 부족 에러 처리
        // related files:
        // - web/backend/controllers/requests/creation.from-draft.controller.js
        // 크레딧 부족 토스트는 서버 payload.requestCount를 노출해 사용자가 현재 제출 건수를 즉시 확인할 수 있게 한다.
        if (res.status === 402) {
          const payload = errData?.data;
          const requestCount = Number(payload?.requestCount || 0);
          const affordableRequestCount = Number(
            payload?.affordableRequestCount ?? NaN,
          );
          const serverMessage = String(errData?.message || "").trim();
          const shouldReduceCount =
            requestCount > 0 &&
            Number.isFinite(affordableRequestCount) &&
            affordableRequestCount < requestCount;

          const description =
            serverMessage ||
            (shouldReduceCount
              ? `현재 잔액으로는 ${affordableRequestCount}건까지 의뢰할 수 있습니다. 제출 건수를 ${affordableRequestCount}건 이하로 줄인 뒤 다시 시도해주세요.`
              : "크레딧이 부족합니다.");

          dismiss();
          toast({
            title: shouldReduceCount ? "제출 건수를 줄여주세요" : "크레딧 부족",
            description,
            variant: "destructive",
            duration: 10000, // 10초
          });
          return;
        }

        // 이미 제출·삭제된 Draft ID를 붙잡은 경우 — 캐시 비우고 새로고침 유도
        if (res.status === 404 && String(errData?.message || "").includes("Draft")) {
          try {
            if (typeof window !== "undefined") {
              window.localStorage.removeItem(NEW_REQUEST_DRAFT_ID_STORAGE_KEY);
              const prefix = "abutsfit:new-request-draft-meta:v1:";
              for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
                const key = window.localStorage.key(i);
                if (key && key.startsWith(prefix)) {
                  window.localStorage.removeItem(key);
                }
              }
            }
          } catch {
            // noop
          }
          dismiss();
          toast({
            title: "임시 의뢰가 만료되었습니다",
            description: "페이지를 새로고침한 뒤 파일을 다시 추가해 의뢰해주세요.",
            variant: "destructive",
          });
          return;
        }

        // 타 계정 Draft ID를 붙잡은 경우 — 캐시 비우고 새로고침 유도
        if (
          res.status === 403 &&
          String(errData?.message || "").includes("Draft")
        ) {
          try {
            if (typeof window !== "undefined") {
              window.localStorage.removeItem(NEW_REQUEST_DRAFT_ID_STORAGE_KEY);
              const prefix = "abutsfit:new-request-draft-meta:v1:";
              for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
                const key = window.localStorage.key(i);
                if (key && key.startsWith(prefix)) {
                  window.localStorage.removeItem(key);
                }
              }
            }
          } catch {
            // noop
          }
          dismiss();
          toast({
            title: "임시 의뢰 권한이 없습니다",
            description:
              "다른 계정에서 만든 임시 의뢰입니다. 페이지를 새로고침한 뒤 다시 의뢰해주세요.",
            variant: "destructive",
          });
          return;
        }

        if (res.status === 409 && errData?.code === "DUPLICATE_REQUEST") {
          const mode = errData?.data?.mode;
          const duplicates = errData?.data?.duplicates;
          const remakeQuota = errData?.data?.remakeQuota || null;
          if (
            (mode === "active" || mode === "tracking") &&
            Array.isArray(duplicates) &&
            duplicates.length > 0
          ) {
            const liveDuplicates = duplicates.filter((dup: any) => {
              const stage = String(
                dup?.existingRequest?.manufacturerStage || "",
              ).trim();
              return stage !== "취소";
            });
            const justCreated = liveDuplicates.filter((dup: any) => {
              const createdAtMs = new Date(
                dup?.existingRequest?.createdAt || 0,
              ).getTime();
              return (
                Number.isFinite(createdAtMs) &&
                createdAtMs >= submitStart - 30_000
              );
            });
            const remaining = liveDuplicates.filter(
              (dup: any) => !justCreated.includes(dup),
            );
            if (remaining.length === 0 && justCreated.length > 0) {
              await finishSuccessfulSubmit();
              return;
            }
            if (remaining.length === 0) {
              return;
            }
            console.log(
              "[useNewRequestSubmitV2] Duplicate detected, opening prompt",
              {
                mode,
                count: remaining.length,
              },
            );
            onDuplicateDetected?.({
              mode,
              duplicates: remaining,
              remakeQuota,
            });
            return;
          }
        }

        const detailMsg = String(
          errData?.details || errData?.message || `서버 오류: ${res.status}`,
        ).trim();
        const errorContext = errData?.code ? ` [${errData.code}]` : "";
        throw new Error(`${detailMsg}${errorContext}`);
      }

      const okBody = await res.json().catch(() => ({}));
      const unsupportedRaw = okBody?.data?.unsupportedConnections;
      const unsupportedConnections = Array.isArray(unsupportedRaw)
        ? unsupportedRaw.filter(
            (row: { requestMongoId?: string; label?: string }) =>
              String(row?.requestMongoId || "").trim() &&
              String(row?.label || "").trim(),
          )
        : [];
      if (unsupportedConnections.length > 0) {
        setUnsupportedCancelItems(unsupportedConnections);
        await finishSuccessfulSubmit({ deferNavigate: true });
        return;
      }

      if (pendingNewImplantAckLines.length > 0) {
        setNewImplantAckLines(pendingNewImplantAckLines);
        await finishSuccessfulSubmit({
          deferNavigate: true,
          skipSuccessToast: true,
        });
        return;
      }

      await finishSuccessfulSubmit();
    } catch (err: any) {
      const rawMessage = err?.message || "";
      const isNoAbutmentError =
        rawMessage.includes("커스텀 어벗 케이스가 없습니다") ||
        rawMessage.includes("Draft에 커스텀 어벗 케이스가 없습니다");

      const isMissingFieldsError =
        rawMessage.includes("필수 정보가 누락된 파일");

      let description = rawMessage || "알 수 없는 오류";

      if (isNoAbutmentError) {
        description = "커스텀 어벗을 하나 이상 의뢰해야 합니다";
      } else if (isMissingFieldsError) {
        description =
          rawMessage || "환자정보 또는 임플란트 정보가 누락되었습니다.";
      }

      dismiss();
      toast({
        title: "의뢰 제출 중 오류",
        description,
        variant: "destructive",
      });
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    await submitFromDraft();
  };

  const handleSubmitWithDuplicateResolutions = async (
    opts: DuplicateResolutionCase[],
  ) => {
    await submitFromDraft(opts);
  };

  const confirmNewImplantAck = useCallback(() => {
    setNewImplantAckLines([]);
    toast({ title: "의뢰가 제출되었습니다" });
    navigate(`/dashboard`);
  }, [navigate, toast]);

  const confirmUnsupportedCancel = async () => {
    if (!token || unsupportedCancelBusy || unsupportedCancelItems.length === 0) {
      return;
    }
    setUnsupportedCancelBusy(true);
    try {
      for (const item of unsupportedCancelItems) {
        const mongoId = String(item.requestMongoId || "").trim();
        if (!mongoId) continue;
        const res = await fetch(
          `${API_BASE_URL}/requests/${encodeURIComponent(mongoId)}/status`,
          {
            method: "PATCH",
            headers: getHeaders(),
            body: JSON.stringify({ manufacturerStage: "취소" }),
          },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            String(body?.message || "해당 건 의뢰 취소에 실패했습니다."),
          );
        }
      }
      setUnsupportedCancelItems([]);
      toast({ title: "해당 건을 의뢰 취소했습니다" });
      navigate(`/dashboard`);
    } catch (error) {
      toast({
        title: "의뢰 취소 실패",
        description:
          error instanceof Error
            ? error.message
            : "해당 건만 취소하지 못했습니다.",
        variant: "destructive",
      });
    } finally {
      setUnsupportedCancelBusy(false);
    }
  };

  return {
    handleSubmit,
    handleSubmitWithDuplicateResolutions,
    handleCancel,
    isSubmitting,
    unsupportedCancelItems,
    unsupportedCancelBusy,
    confirmUnsupportedCancel,
    newImplantAckLines,
    confirmNewImplantAck,
  };
};
