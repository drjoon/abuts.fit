// related files:
// - web/frontend/src/features/requestSettings/RequestSettingsToolbar.tsx
// - web/frontend/src/features/requestSettings/DesignSoftwareSettingsDialog.tsx
// - web/backend/controllers/businesses/business.controller.js
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import type { DesignSoftwareMode } from "./DesignSoftwareSettingsDialog";

export type RequestSettingsDefaults = {
  designSoftware: string;
  anodizingEnabled: boolean;
  retentionGroove: "none" | "deep";
};

type UseRequestorRequestSettingsOptions = {
  /** false면 API/강제 게이트 비활성 */
  enabled?: boolean;
  /** 진입 시 미설정이면 모달 강제 */
  forceOnEntry?: boolean;
  /** Draft __default__ 등 외부 시드와 동기화 */
  onDefaultsChange?: (next: Partial<RequestSettingsDefaults>) => void;
  /** 게이트 저장 후 대기 파일 이어서 처리 */
  onGateComplete?: (files: File[]) => void;
  /** 외부 Draft 기본값(디자인 SW) — 있으면 서버값보다 우선 표시 */
  draftDesignSoftware?: string;
  /** 외부 Draft 기본값(아노다이징) */
  draftAnodizingEnabled?: boolean | null;
  /** 외부 Draft 기본값(유지홈) */
  draftRetentionGroove?: "none" | "deep" | null;
};

type RequestSettingsApiData = {
  canEdit?: boolean;
  canEditDesignSoftware?: boolean;
  canEditAnodizing?: boolean;
  designSoftware?: string | null;
  requestorDesignSoftware?: string | null;
  anodizingEnabled?: boolean;
  requestorAnodizingEnabled?: boolean;
  hasBusinessAnodizingSetting?: boolean;
  hasRequestorAnodizingSetting?: boolean;
  retentionGroove?: string | null;
  requestorRetentionGroove?: string | null;
};

const resolveModeFromValue = (value: string): {
  mode: DesignSoftwareMode;
  custom: string;
} => {
  const current = String(value || "").trim();
  if (current === "3Shape" || current === "ExoCAD") {
    return { mode: current, custom: "" };
  }
  if (current) {
    return { mode: "custom", custom: current };
  }
  return { mode: "3Shape", custom: "" };
};

const normalizeRetentionGrooveChoice = (
  value: unknown,
): "none" | "deep" => {
  const rg = String(value || "")
    .trim()
    .toLowerCase();
  if (rg === "deep") return "deep";
  return "none";
};

export function useRequestorRequestSettings(
  options: UseRequestorRequestSettingsOptions = {},
) {
  const {
    enabled = true,
    forceOnEntry = true,
    onDefaultsChange,
    onGateComplete,
    draftDesignSoftware,
    draftAnodizingEnabled,
    draftRetentionGroove,
  } = options;

  const { toast } = useToast();
  const token = useAuthStore((s) => s.token);
  const userRole = useAuthStore((s) => s.user?.role);

  const [designSoftwareValue, setDesignSoftwareValue] = useState("");
  const [anodizingEnabled, setAnodizingEnabled] = useState(true);
  const [retentionGrooveDefault, setRetentionGrooveDefault] = useState<
    "none" | "deep"
  >("none");
  const [hasAnodizingSetting, setHasAnodizingSetting] = useState(false);
  const [canEditBusinessDesignSoftware, setCanEditBusinessDesignSoftware] =
    useState(false);
  const [canEditBusinessAnodizing, setCanEditBusinessAnodizing] = useState(false);
  const [needsBusinessDesignSoftwareBootstrap, setNeedsBusinessDesignSoftwareBootstrap] =
    useState(false);
  const [needsBusinessAnodizingBootstrap, setNeedsBusinessAnodizingBootstrap] =
    useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [designSoftwareMode, setDesignSoftwareMode] =
    useState<DesignSoftwareMode>("3Shape");
  const [customDesignSoftware, setCustomDesignSoftware] = useState("");
  const [modalAnodizingEnabled, setModalAnodizingEnabled] = useState(true);
  const [designSoftwareSaving, setDesignSoftwareSaving] = useState(false);
  const [anodizingSaving, setAnodizingSaving] = useState(false);
  const [forceRequired, setForceRequired] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [gatePendingFiles, setGatePendingFiles] = useState<File[]>([]);
  const gatePendingRef = useRef<File[]>([]);
  const onDefaultsChangeRef = useRef(onDefaultsChange);
  const onGateCompleteRef = useRef(onGateComplete);
  const entryForcedRef = useRef(false);

  useEffect(() => {
    onDefaultsChangeRef.current = onDefaultsChange;
  }, [onDefaultsChange]);

  useEffect(() => {
    onGateCompleteRef.current = onGateComplete;
  }, [onGateComplete]);

  const isIncomplete = useCallback(
    (designSoftware: string) => !String(designSoftware || "").trim(),
    [],
  );

  const openModalForValue = useCallback(
    (value: string, opts?: { force?: boolean; showCurrentAnodizing?: boolean }) => {
      const resolved = resolveModeFromValue(value);
      setDesignSoftwareMode(resolved.mode);
      setCustomDesignSoftware(resolved.custom);
      setModalAnodizingEnabled(
        typeof opts?.showCurrentAnodizing === "boolean"
          ? opts.showCurrentAnodizing
          : anodizingEnabled,
      );
      setForceRequired(Boolean(opts?.force));
      setModalOpen(true);
    },
    [anodizingEnabled],
  );

  const clearGatePending = useCallback(() => {
    gatePendingRef.current = [];
    setGatePendingFiles([]);
  }, []);

  const openDesignSoftwareModal = useCallback(() => {
    const current = String(
      designSoftwareValue || draftDesignSoftware || "",
    ).trim();
    const incomplete = isIncomplete(current);
    openModalForValue(current, {
      force: incomplete,
      showCurrentAnodizing: anodizingEnabled,
    });
  }, [
    anodizingEnabled,
    designSoftwareValue,
    draftDesignSoftware,
    isIncomplete,
    openModalForValue,
  ]);

  const openGateModal = useCallback(
    (pendingFiles: File[] = []) => {
      if (pendingFiles.length > 0) {
        const next = [...gatePendingRef.current, ...pendingFiles];
        gatePendingRef.current = next;
        setGatePendingFiles(next);
      }
      openModalForValue("", {
        force: true,
        showCurrentAnodizing: anodizingEnabled,
      });
    },
    [anodizingEnabled, openModalForValue],
  );

  // 서버 설정 로드 + 미설정 시 진입 강제
  useEffect(() => {
    if (!enabled || !token || userRole !== "requestor") return;

    let cancelled = false;

    const load = async () => {
      try {
        const res = await apiFetch<{ data?: RequestSettingsApiData } & RequestSettingsApiData>({
          path: "/api/businesses/me/request-settings",
          method: "GET",
          token,
        });
        if (!res.ok || cancelled) return;

        const body = (res.data || {}) as {
          data?: RequestSettingsApiData;
        } & RequestSettingsApiData;
        const data = body.data || body;

        const canEditBusinessDesign =
          typeof data?.canEditDesignSoftware === "boolean"
            ? data.canEditDesignSoftware
            : false;
        const canEditBusinessAno =
          typeof data?.canEditAnodizing === "boolean"
            ? data.canEditAnodizing
            : canEditBusinessDesign;

        setCanEditBusinessDesignSoftware(canEditBusinessDesign);
        setCanEditBusinessAnodizing(canEditBusinessAno);

        let requestorDefault = String(data?.requestorDesignSoftware || "").trim();
        let businessDefault = String(data?.designSoftware || "").trim();
        const draftDefault = String(draftDesignSoftware || "").trim();

        const hasRequestorAno = Boolean(data?.hasRequestorAnodizingSetting);
        const hasBusinessAno = Boolean(data?.hasBusinessAnodizingSetting);
        let anodizingConfigured = hasRequestorAno || hasBusinessAno;

        const requestorAnodizing =
          typeof data?.requestorAnodizingEnabled === "boolean"
            ? data.requestorAnodizingEnabled
            : null;
        const businessAnodizing =
          typeof data?.anodizingEnabled === "boolean"
            ? data.anodizingEnabled
            : true;

        const resolvedAnodizing =
          typeof draftAnodizingEnabled === "boolean"
            ? draftAnodizingEnabled
            : typeof requestorAnodizing === "boolean"
              ? requestorAnodizing
              : businessAnodizing;

        setAnodizingEnabled(resolvedAnodizing);
        setHasAnodizingSetting(anodizingConfigured);

        const resolvedRetention = normalizeRetentionGrooveChoice(
          draftRetentionGroove ||
            data?.requestorRetentionGroove ||
            data?.retentionGroove ||
            "none",
        );
        setRetentionGrooveDefault(resolvedRetention);

        setNeedsBusinessDesignSoftwareBootstrap(
          !businessDefault && canEditBusinessDesign,
        );
        setNeedsBusinessAnodizingBootstrap(!hasBusinessAno && canEditBusinessAno);

        // 한쪽만 있으면 사업화(보정)
        if ((!requestorDefault || !businessDefault) && (draftDefault || requestorDefault || businessDefault)) {
          const bootstrapDefault =
            draftDefault || requestorDefault || businessDefault;
          const syncPayload: Record<string, string> = {};
          if (!requestorDefault) {
            syncPayload.requestorDesignSoftware = bootstrapDefault;
          }
          if (!businessDefault && canEditBusinessDesign) {
            syncPayload.designSoftware = bootstrapDefault;
          }
          if (Object.keys(syncPayload).length > 0) {
            const syncRes = await apiFetch<{ data?: RequestSettingsApiData }>({
              path: "/api/businesses/me/request-settings",
              method: "PUT",
              token,
              jsonBody: syncPayload,
            });
            if (syncRes.ok) {
              if (!requestorDefault) requestorDefault = bootstrapDefault;
              if (!businessDefault && canEditBusinessDesign) {
                businessDefault = bootstrapDefault;
                setNeedsBusinessDesignSoftwareBootstrap(false);
              }
            }
          }
        }

        const effectiveDesign =
          draftDefault || requestorDefault || businessDefault;

        if (effectiveDesign) {
          setDesignSoftwareValue(effectiveDesign);
          onDefaultsChangeRef.current?.({
            designSoftware: effectiveDesign,
            anodizingEnabled: resolvedAnodizing,
            retentionGroove: resolvedRetention,
          });
        } else {
          onDefaultsChangeRef.current?.({
            anodizingEnabled: resolvedAnodizing,
            retentionGroove: resolvedRetention,
          });
        }

        setLoaded(true);

        if (
          forceOnEntry &&
          !entryForcedRef.current &&
          isIncomplete(effectiveDesign)
        ) {
          entryForcedRef.current = true;
          openModalForValue(effectiveDesign, {
            force: true,
            showCurrentAnodizing: resolvedAnodizing,
          });
        }
      } catch {
        // ignore
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
    // draft* 는 초기 시드용 — 매번 리로드하지 않음
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, forceOnEntry, isIncomplete, openModalForValue, token, userRole]);

  // Draft가 늦게 들어오면 표시값 동기화
  useEffect(() => {
    const draftDefault = String(draftDesignSoftware || "").trim();
    if (!draftDefault) return;
    if (draftDefault === String(designSoftwareValue || "").trim()) return;
    setDesignSoftwareValue(draftDefault);
  }, [designSoftwareValue, draftDesignSoftware]);

  useEffect(() => {
    if (typeof draftAnodizingEnabled !== "boolean") return;
    setAnodizingEnabled(draftAnodizingEnabled);
  }, [draftAnodizingEnabled]);

  useEffect(() => {
    if (draftRetentionGroove !== "none" && draftRetentionGroove !== "deep") {
      return;
    }
    setRetentionGrooveDefault(draftRetentionGroove);
  }, [draftRetentionGroove]);

  const saveRetentionGroove = useCallback(
    async (next: "none" | "deep") => {
      setRetentionGrooveDefault(next);
      onDefaultsChangeRef.current?.({ retentionGroove: next });
      if (!token || userRole !== "requestor") return;

      const jsonBody: Record<string, string> = {
        requestorRetentionGroove: next,
      };
      if (canEditBusinessAnodizing) {
        jsonBody.retentionGroove = next;
      }

      try {
        await apiFetch({
          path: "/api/businesses/me/request-settings",
          method: "PUT",
          token,
          jsonBody,
        });
      } catch {
        // best-effort — UI 값은 유지
      }
    },
    [canEditBusinessAnodizing, token, userRole],
  );

  const handleSaveDesignSoftware = useCallback(async () => {
    const designSoftware =
      designSoftwareMode === "custom"
        ? String(customDesignSoftware || "").trim()
        : designSoftwareMode;

    if (!designSoftware) {
      toast({
        title: "입력값이 필요합니다",
        description: "직접 입력을 선택한 경우 소프트웨어 이름을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        description: "디자인 소프트웨어 설정을 저장하려면 로그인해주세요.",
        variant: "destructive",
      });
      return;
    }

    setDesignSoftwareSaving(true);
    try {
      const savePayload: Record<string, string | boolean> = {
        requestorDesignSoftware: designSoftware,
        requestorAnodizingEnabled: modalAnodizingEnabled,
      };
      if (
        (needsBusinessDesignSoftwareBootstrap || !designSoftwareValue) &&
        canEditBusinessDesignSoftware
      ) {
        savePayload.designSoftware = designSoftware;
      } else if (canEditBusinessDesignSoftware) {
        // 기공소 사업자 계정값 SSOT — 멤버도 사업체 값을 함께 갱신
        savePayload.designSoftware = designSoftware;
      }
      if (canEditBusinessAnodizing || needsBusinessAnodizingBootstrap) {
        savePayload.anodizingEnabled = modalAnodizingEnabled;
      }

      const res = await apiFetch<{
        data?: RequestSettingsApiData;
        message?: string;
      }>({
        path: "/api/businesses/me/request-settings",
        method: "PUT",
        token,
        jsonBody: savePayload,
      });

      if (!res.ok) {
        const body = (res.data || {}) as { message?: string };
        toast({
          title: "저장 실패",
          description: String(
            body?.message || "디자인 소프트웨어 설정 저장에 실패했습니다.",
          ),
          variant: "destructive",
        });
        return;
      }

      setDesignSoftwareValue(designSoftware);
      setAnodizingEnabled(modalAnodizingEnabled);
      setHasAnodizingSetting(true);
      setNeedsBusinessDesignSoftwareBootstrap(false);
      setNeedsBusinessAnodizingBootstrap(false);
      setForceRequired(false);
      setModalOpen(false);
      onDefaultsChangeRef.current?.({
        designSoftware,
        anodizingEnabled: modalAnodizingEnabled,
      });

      const pending = gatePendingRef.current;
      clearGatePending();
      if (pending.length > 0) {
        onGateCompleteRef.current?.(pending);
      }

      toast({
        title: "저장 완료",
        description: "의뢰 기본 디자인 소프트웨어·아노다이징이 저장되었습니다.",
      });
    } finally {
      setDesignSoftwareSaving(false);
    }
  }, [
    canEditBusinessAnodizing,
    canEditBusinessDesignSoftware,
    clearGatePending,
    customDesignSoftware,
    designSoftwareMode,
    designSoftwareValue,
    modalAnodizingEnabled,
    needsBusinessAnodizingBootstrap,
    needsBusinessDesignSoftwareBootstrap,
    toast,
    token,
  ]);

  const handleToggleAnodizing = useCallback(() => {
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        description: "아노다이징 설정을 저장하려면 로그인해주세요.",
        variant: "destructive",
      });
      return;
    }
    if (anodizingSaving) return;

    // 미설정이면 토글 대신 설정 모달 강제(아노다이징도 함께 확정)
    if (!String(designSoftwareValue || "").trim()) {
      openDesignSoftwareModal();
      return;
    }

    const next = !anodizingEnabled;
    const prev = anodizingEnabled;
    setAnodizingEnabled(next);
    onDefaultsChangeRef.current?.({ anodizingEnabled: next });

    setAnodizingSaving(true);
    void (async () => {
      try {
        const jsonBody: Record<string, boolean> = {
          requestorAnodizingEnabled: next,
        };
        if (canEditBusinessAnodizing) {
          jsonBody.anodizingEnabled = next;
        }

        const res = await apiFetch<{
          data?: RequestSettingsApiData;
          message?: string;
        }>({
          path: "/api/businesses/me/request-settings",
          method: "PUT",
          token,
          jsonBody,
        });

        if (!res.ok) {
          setAnodizingEnabled(prev);
          onDefaultsChangeRef.current?.({ anodizingEnabled: prev });
          const body = (res.data || {}) as { message?: string };
          toast({
            title: "저장에 실패했습니다",
            description: String(
              body?.message || "아노다이징 기본값 저장 중 오류가 발생했습니다.",
            ),
            variant: "destructive",
          });
          return;
        }

        const body = (res.data || {}) as { data?: RequestSettingsApiData };
        const data = body.data || (body as RequestSettingsApiData);
        if (typeof data?.requestorAnodizingEnabled === "boolean") {
          setAnodizingEnabled(data.requestorAnodizingEnabled);
          onDefaultsChangeRef.current?.({
            anodizingEnabled: data.requestorAnodizingEnabled,
          });
        }
        setHasAnodizingSetting(true);
      } catch {
        setAnodizingEnabled(prev);
        onDefaultsChangeRef.current?.({ anodizingEnabled: prev });
        toast({
          title: "저장에 실패했습니다",
          description: "아노다이징 기본값 저장 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      } finally {
        setAnodizingSaving(false);
      }
    })();
  }, [
    anodizingEnabled,
    anodizingSaving,
    canEditBusinessAnodizing,
    designSoftwareValue,
    openDesignSoftwareModal,
    toast,
    token,
  ]);

  const handleModalOpenChange = useCallback(
    (next: boolean) => {
      const incomplete = isIncomplete(designSoftwareValue);
      const hasPending = gatePendingFiles.length > 0;

      // 미설정 + 첨부 대기 없음 → 강제 유지
      if (incomplete && !hasPending && forceRequired) {
        if (next) setModalOpen(true);
        return;
      }
      if (!next) {
        clearGatePending();
        setForceRequired(false);
      }
      setModalOpen(next);
    },
    [
      clearGatePending,
      designSoftwareValue,
      forceRequired,
      gatePendingFiles.length,
      isIncomplete,
    ],
  );

  const settingsComplete = Boolean(String(designSoftwareValue || "").trim());

  const dialogDescription =
    gatePendingFiles.length > 0
      ? "파일 첨부 전에 디자인 소프트웨어와 아노다이징을 먼저 설정해주세요."
      : forceRequired
        ? "진행 전에 사용 중인 디자인 소프트웨어와 아노다이징을 먼저 설정해주세요."
        : "기공소 기본 디자인 소프트웨어를 설정합니다.";

  return {
    loaded,
    designSoftwareValue,
    setDesignSoftwareValue,
    anodizingEnabled,
    setAnodizingEnabled,
    retentionGrooveDefault,
    saveRetentionGroove,
    anodizingSaving,
    designSoftwareSaving,
    hasAnodizingSetting,
    settingsComplete,
    modalOpen,
    designSoftwareMode,
    setDesignSoftwareMode,
    customDesignSoftware,
    setCustomDesignSoftware,
    modalAnodizingEnabled,
    setModalAnodizingEnabled,
    forceRequired,
    gatePendingFiles,
    dialogDescription,
    openDesignSoftwareModal,
    openGateModal,
    clearGatePending,
    handleSaveDesignSoftware,
    handleToggleAnodizing,
    handleModalOpenChange,
  };
}
