/* eslint-disable @typescript-eslint/no-explicit-any */
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/requestor/new_request/hooks/useNewRequestPage.ts
// - web/frontend/src/shared/hooks/useFilePreUpload.ts
// - web/backend/controllers/requests/creation.from-draft.controller.js
// - 2026-08-19: 성공 시 로컬 초안을 파일 비우기 전에 지움. 제출 시작/성공 콜백으로 입력 중 중복 체크를 무효화.
// - 2026-08-19: IndexedDB 파일 삭제는 이동과 겹쳐 제출 체감을 막지 않는다.
// - 2026-08-19: 제출 잠금(ref). 방금 생성된 건을 중복으로 오인하면 성공 처리.
// - 2026-08-19: 제출 시작 시 초안 PATCH debounce를 멈춰 from-draft와 겹치지 않게.
// - 2026-08-13: 제출 시 사전업로드 캐시·from-draft caseInfos로 PATCH/credits GET 생략
/**
 * ===== 신규 의뢰 제출 표준 훅 (SSOT) =====
 * Draft 기반 워크플로우: POST /api/requests/from-draft 사용
 * - 중복 체크, 크레딧 체크, 에러 처리 포함
 * - 백엔드: creation.from-draft.controller.js의 createRequestsFromDraft
 * - 참고: rules.legacy-full.md 섹션 4.3.2 "신규 의뢰 생성 엔드포인트 (SSOT)"
 */
import { useEffect, useRef, useState } from "react";
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
  uploadFiles,
  peekCachedUploadedFiles,
  onDuplicateDetected,
  onSubmitStart,
  onSuccessfulSubmitBegin,
}: UseNewRequestSubmitV2Params) => {
  const { toast, dismiss } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
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
      const { clearLocalDraft } = await import("../utils/localDraftStorage");
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

    const finishSuccessfulSubmit = async () => {
      saveParseLogs().catch((err) => {
        console.warn("[useNewRequestSubmitV2] Failed to save parse logs:", err);
      });

      try {
        await Promise.resolve(onSuccessfulSubmitBegin?.());
      } catch {
        // noop
      }

      try {
        const { clearLocalDraft } = await import("../utils/localDraftStorage");
        clearLocalDraft();
        void import("../utils/fileIndexedDB")
          .then(({ clearAllFiles }) => clearAllFiles())
          .catch(() => {});
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
          clearFileCache();
        }
      } catch {
        // noop
      }

      dismiss();
      toast({ title: "의뢰가 제출되었습니다" });
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
            const tf = tempFiles[i];
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

            return {
              clinicName: ci.clinicName,
              patientName: ci.patientName,
              tooth: ci.tooth,
              implantManufacturer: ci.implantManufacturer,
              implantBrand: ci.implantBrand,
              implantFamily: ci.implantFamily,
              implantType: ci.implantType,
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
              requestorHexRotation: ci.requestorHexRotation,
              shippingMode: ci.shippingMode,
              requestedShipDate: ci.requestedShipDate,
              designSoftware: String(
                ci.designSoftware || defaults.designSoftware || "",
              ).trim(),
              anodizingEnabled:
                typeof ci.anodizingEnabled === "boolean"
                  ? ci.anodizingEnabled
                  : defaults.anodizingEnabled,
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
      const res = await fetch(`${API_BASE_URL}/requests/from-draft`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });
      console.log("[NewRequestSubmit] submit API response", {
        t: Date.now() - submitStart,
        ok: res.ok,
        status: res.status,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
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
          const machiningFee = payload?.machiningFee;
          const shippingFee = payload?.shippingFee;
          const requestCount = Number(payload?.requestCount || 0);

          let description = errData?.message || "크레딧이 부족합니다.";

          // 상세 정보가 있으면 추가 안내
          if (machiningFee || shippingFee) {
            const details = [];
            if (requestCount > 0) {
              details.push(`현재 제출 건수: ${requestCount}건`);
            }
            if (machiningFee?.shortfall > 0) {
              details.push(
                `의뢰비 부족: ${machiningFee.shortfall.toLocaleString()}원`,
              );
            }
            if (shippingFee?.shortfall > 0) {
              details.push(
                `배송비 부족: ${shippingFee.shortfall.toLocaleString()}원`,
              );
            }
            if (details.length > 0) {
              description += "\n\n" + details.join("\n");
            }
          }

          dismiss();
          toast({
            title: "크레딧 부족",
            description,
            variant: "destructive",
            duration: 10000, // 10초
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

  return {
    handleSubmit,
    handleSubmitWithDuplicateResolutions,
    handleCancel,
    isSubmitting,
  };
};
