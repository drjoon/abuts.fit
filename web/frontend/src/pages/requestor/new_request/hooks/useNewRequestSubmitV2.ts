/**
 * ===== 신규 의뢰 제출 표준 훅 (SSOT) =====
 * Draft 기반 워크플로우: POST /api/requests/from-draft 사용
 * - 중복 체크, 크레딧 체크, 에러 처리 포함
 * - 백엔드: creation.from-draft.controller.js의 createRequestsFromDraft
 * - 참고: rules.md 섹션 4.3.2 "신규 의뢰 생성 엔드포인트 (SSOT)"
 */
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/shared/hooks/use-toast";
import { type ClinicPreset, type CaseInfos } from "./newRequestTypes";
import { clearFileCache } from "@/shared/files/fileCache";
import { createParseLog } from "@/shared/services/parseLogService";
import { parseFilenameWithRules } from "@/shared/filename/parseFilenameWithRules";
import { useUploadWithProgressToast } from "@/shared/hooks/useUploadWithProgressToast";
import { type TempUploadedFile } from "@/shared/hooks/useS3TempUpload";
import { useSystemSettings } from "@/hooks/useSystemSettings";

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
  patchDraftImmediately?: (map: Record<string, CaseInfos>) => Promise<void>;
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
  patchDraftImmediately,
  onDuplicateDetected,
}: UseNewRequestSubmitV2Params) => {
  const { toast, dismiss } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const preparedDraftRef = useRef<{
    draftId: string;
    filesFingerprint: string;
  } | null>(null);
  const { uploadFilesWithToast } = useUploadWithProgressToast({ token });
  const { data: systemSettings } = useSystemSettings();

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
    if (isSubmitting) return;
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
            retentionGroove: base.retentionGroove,
            shippingMode: base.shippingMode,
            requestedShipDate: base.requestedShipDate,
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

    const submitStart = Date.now();
    console.log("[NewRequestSubmit] submit start", {
      draftId,
      filesCount: files.length,
      hasDuplicateResolutions: Boolean(duplicateResolutions?.length),
    });

    try {
      setIsSubmitting(true);

      // boxCount = 1 (백엔드도 항상 1로 고정; 별도 draft 조회 불필요)
      const boxCount = 1;

      // 1. 클라이언트 사이드 중복 체크 (동기)
      if (files.length > 1 && caseInfosMap) {
        const uniqueCombinations = new Set();
        const duplicates = [];

        for (const file of files) {
          const fileKey = toNormalizedFileKey(file);
          const info = caseInfosMap[fileKey];
          if (info) {
            const combo = `${info.clinicName}|${info.patientName}|${info.tooth}`;
            if (uniqueCombinations.has(combo)) {
              duplicates.push(`${info.patientName}(${info.tooth})`);
            }
            uniqueCombinations.add(combo);
          }
        }

        if (duplicates.length > 0) {
          toast({
            title: "의뢰 제출 중 오류",
            description: `제출한 의뢰 목록에 동일한 치과/환자/치아 조합이 중복되었습니다: ${duplicates.join(
              ", ",
            )}. 중복 항목을 제거하거나 수정한 후 다시 제출해주세요.`,
            variant: "destructive",
            duration: 5000,
          });
          return;
        }
      }

      // 2. S3 업로드 + Draft 파일 패치 (중복 해소 재제출 시에는 재업로드 생략)
      const validFileKeys = new Set(files.map((f) => toNormalizedFileKey(f)));
      const filteredMap: Record<string, CaseInfos> = {};
      if (caseInfosMap) {
        for (const [key, value] of Object.entries(caseInfosMap)) {
          if (key === "__default__" || validFileKeys.has(key)) {
            filteredMap[key] = value;
          }
        }
      }

      const filesFingerprint = buildFilesFingerprint(files);
      const canReusePreparedDraft =
        Array.isArray(duplicateResolutions) &&
        duplicateResolutions.length > 0 &&
        preparedDraftRef.current?.draftId === String(draftId) &&
        preparedDraftRef.current?.filesFingerprint === filesFingerprint;

      if (canReusePreparedDraft) {
        console.log(
          "[useNewRequestSubmitV2] Reusing prepared draft files, skip re-upload",
          {
            draftId,
            filesCount: files.length,
          },
        );
      } else {
        let creditShortfallMsg: string | null = null;
        let tempFiles: TempUploadedFile[] = [];
        try {
          const [uploadResult] = await Promise.all([
            files.length > 0
              ? uploadFilesWithToast(files)
              : Promise.resolve([] as TempUploadedFile[]),
            (async () => {
              try {
                const creditRes = await fetch(
                  `${API_BASE_URL}/credits/balance`,
                  {
                    headers: getHeaders(),
                  },
                );
                if (creditRes.ok) {
                  const creditResponse = await creditRes.json();
                  const creditData = creditResponse?.data || {};
                  const paidCredit = Number(creditData?.paidCredit || 0);
                  const bonusRequestCredit = Number(
                    creditData?.bonusRequestCredit || 0,
                  );
                  const bonusShippingCredit = Number(
                    creditData?.bonusShippingCredit || 0,
                  );

                  const estimatedMachiningFee = files.length * 10000;
                  const estimatedShippingFee = boxCount * 3500;

                  const availableForMachining = paidCredit + bonusRequestCredit;
                  const availableForShipping = paidCredit + bonusShippingCredit;

                  const machiningShortfall = Math.max(
                    0,
                    estimatedMachiningFee - availableForMachining,
                  );
                  const shippingShortfall = Math.max(
                    0,
                    estimatedShippingFee - availableForShipping,
                  );

                  if (machiningShortfall > 0 || shippingShortfall > 0) {
                    let message = "";
                    const details = [];

                    if (machiningShortfall > 0 && shippingShortfall > 0) {
                      message = "의뢰비와 배송비 크레딧이 모두 부족합니다.";
                      details.push(
                        `의뢰비 예상: ${estimatedMachiningFee.toLocaleString()}원 (보유: ${availableForMachining.toLocaleString()}원)`,
                      );
                      details.push(
                        `배송비 예상: ${estimatedShippingFee.toLocaleString()}원 (${boxCount}박스, 보유: ${availableForShipping.toLocaleString()}원)`,
                      );
                    } else if (machiningShortfall > 0) {
                      message = "의뢰비 크레딧이 부족합니다.";
                      details.push(
                        `예상: ${estimatedMachiningFee.toLocaleString()}원, 보유: ${availableForMachining.toLocaleString()}원`,
                      );
                    } else {
                      message = "배송비 크레딧이 부족합니다.";
                      details.push(
                        `예상: ${estimatedShippingFee.toLocaleString()}원 (${boxCount}박스), 보유: ${availableForShipping.toLocaleString()}원`,
                      );
                    }

                    message += "\n\n" + details.join("\n");
                    message += "\n\n크레딧을 충전한 뒤 다시 시도해주세요.";
                    creditShortfallMsg = message;
                  }
                }
              } catch (err) {
                console.warn("[NewRequestSubmit] credit check failed:", err);
              }
            })(),
          ]);

          tempFiles = uploadResult ?? [];
        } catch {
          // S3 업로드 실패 - toast는 uploadFilesWithToast에서 이미 처리됨
          return;
        }

        if (creditShortfallMsg) {
          dismiss();
          toast({
            title: "크레딧 부족",
            description: creditShortfallMsg,
            variant: "destructive",
            duration: 10000, // 10초
          });
          return;
        }

        // 3. Draft 파일+정보 업데이트 (S3 업로드 완료 후)
        if (files.length > 0 && tempFiles.length > 0) {
          const toNfcName = (name: string) => {
            try {
              return String(name || "").normalize("NFC");
            } catch {
              return String(name || "");
            }
          };

          const caseInfosPayload = files
            .map((file, i) => {
              const tf = tempFiles[i];
              const fileKey = `${toNfcName(file.name)}:${file.size}`;
              const ci = (caseInfosMap?.[fileKey] ||
                filteredMap[fileKey] ||
                {}) as Partial<CaseInfos>;
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
                retentionGroove: ci.retentionGroove,
                shippingMode: ci.shippingMode,
                requestedShipDate: ci.requestedShipDate,
                file: tf?.key
                  ? {
                      originalName: tf.originalName,
                      size: tf.size,
                      mimetype: tf.mimetype,
                      s3Key: tf.key,
                    }
                  : undefined,
              };
            })
            .filter((ci) => Boolean(ci.file?.s3Key));

          if (caseInfosPayload.length > 0) {
            const patchRes = await fetch(
              `${API_BASE_URL}/requests/drafts/${draftId}`,
              {
                method: "PATCH",
                headers: getHeaders(),
                body: JSON.stringify({ caseInfos: caseInfosPayload }),
              },
            ).catch((err) => {
              console.error(
                "[submitFromDraft] Draft file PATCH network error:",
                err,
              );
              return null;
            });

            if (!patchRes || !patchRes.ok) {
              const status = patchRes?.status ?? "network error";
              throw new Error(
                `파일 정보 저장에 실패했습니다 (${status}). 다시 시도해주세요.`,
              );
            }
          }
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
          filesFingerprint,
        };
      }

      // 4. Draft를 Request로 전환
      console.log("[useNewRequestSubmitV2] Submitting draft to request...", {
        draftId,
        duplicateResolutionsCount: duplicateResolutions?.length || 0,
      });

      const payload: any = {
        draftId,
        clinicId: selectedClinicId || undefined,
      };

      if (Array.isArray(duplicateResolutions) && duplicateResolutions.length) {
        payload.duplicateResolutions = duplicateResolutions;
        console.log(
          "[useNewRequestSubmitV2] Resolution details:",
          duplicateResolutions,
        );
      }

      // NOTE: caseInfos 페이로드를 제거하여 백엔드가 Draft의 데이터를 신뢰하도록 함
      // (중복 체크 인덱스 불일치 방지)

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
        if (res.status === 402) {
          const payload = errData?.data;
          const machiningFee = payload?.machiningFee;
          const shippingFee = payload?.shippingFee;

          let description = errData?.message || "크레딧이 부족합니다.";

          // 상세 정보가 있으면 추가 안내
          if (machiningFee || shippingFee) {
            const details = [];
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
            console.log(
              "[useNewRequestSubmitV2] Duplicate detected, opening prompt",
              {
                mode,
                count: duplicates.length,
              },
            );
            onDuplicateDetected?.({ mode, duplicates, remakeQuota });
            return;
          }
        }

        const detailMsg = errData?.message || `서버 오류: ${res.status}`;
        const errorContext = errData?.code ? ` [${errData.code}]` : "";
        throw new Error(`${detailMsg}${errorContext}`);
      }

      const data = await res.json();
      console.log("[NewRequestSubmit] submit API json parsed", {
        t: Date.now() - submitStart,
      });

      // 파싱 로그 저장 (비동기, 실패해도 무시)
      saveParseLogs().catch((err) => {
        console.warn("[useNewRequestSubmitV2] Failed to save parse logs:", err);
      });

      try {
        void fetch(`${API_BASE_URL}/requests/drafts/${draftId}`, {
          method: "DELETE",
          headers: getHeaders(),
        });
      } catch {}

      // 상태 초기화
      preparedDraftRef.current = null;
      setFiles([]);
      setSelectedPreviewIndex(null);

      // localStorage 및 캐시 정리
      try {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(NEW_REQUEST_DRAFT_ID_STORAGE_KEY);
          clearFileCache();
        }
      } catch {}

      // V3 로컬 드래프트 정리 (localStorage + IndexedDB)
      try {
        const { clearLocalDraft } = await import("../utils/localDraftStorage");
        clearLocalDraft();
        const { clearAllFiles } = await import("../utils/fileIndexedDB");
        await clearAllFiles();
      } catch (err) {
        console.warn("[submitFromDraft] Failed to clear local draft:", err);
      }

      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("abuts:credits:updated"));
        }
      } catch {}

      dismiss();
      toast({ title: "의뢰가 제출되었습니다" });
      console.log("[NewRequestSubmit] navigate", {
        t: Date.now() - submitStart,
      });
      navigate(`/dashboard`);
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
        description = "환자정보 또는 임플란트 정보가 누락되었습니다.";
      }

      dismiss();
      toast({
        title: "의뢰 제출 중 오류",
        description,
        variant: "destructive",
      });
    } finally {
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
