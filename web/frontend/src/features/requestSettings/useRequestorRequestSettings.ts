// related files:
// - web/frontend/src/features/requestSettings/RequestSettingsToolbar.tsx
// - web/frontend/src/features/requestSettings/DesignSoftwareSettingsDialog.tsx
// - web/backend/controllers/businesses/business.controller.js
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// change-log:
// - 2026-09-03: ExoCAD 모달에서 아노다이징 분리(툴바 토글 전용).
// - 2026-09-03: 설정 모달 ExoCAD 전용 — SW 선택 제거, 저장 시 ExoCAD 고정.
// - 2026-09-03: requestor·internalLab 모두 개인(User) SSOT. BA는 owner 템플릿·가입 시드만.
// - 2026-08-21: 설정 GET과 아노 토글 race — 사용자 변경 후 stale 로드가 ON→OFF로 덮지 않음.
// - 2026-08-16: 미설정 게이트 모달 — 당장은 X/취소로 닫기 가능. 재진입·새로고침 시 재노출.
// - 2026-08-16: internalLab(어벗츠기공소)도 사업체 기본값으로 로드·저장. 개인(requestor*) 필드 미전송.
// - 2026-08-16: 의뢰자·internalLab 미설정 시 기공의뢰수신/어벗생산의뢰 진입 모달 강제.
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import type { ExoCadVersion } from "./DesignSoftwareSettingsDialog";

export type RequestSettingsDefaults = {
  designSoftware: string;
  exoCadVersion?: ExoCadVersion | null;
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

/** 의뢰 설정 훅을 쓰는 역할 — 개인 필드 vs 사업체 필드 분기 */
const isRequestSettingsRole = (role: string | undefined | null) =>
  role === "requestor" || role === "internalLab";

type RequestSettingsApiData = {
  canEdit?: boolean;
  canEditDesignSoftware?: boolean;
  canEditAnodizing?: boolean;
  designSoftware?: string | null;
  requestorDesignSoftware?: string | null;
  exoCadVersion?: string | null;
  requestorExoCadVersion?: string | null;
  anodizingEnabled?: boolean;
  requestorAnodizingEnabled?: boolean;
  hasBusinessAnodizingSetting?: boolean;
  hasRequestorAnodizingSetting?: boolean;
  retentionGroove?: string | null;
  requestorRetentionGroove?: string | null;
};

const normalizeExoCadVersion = (value: unknown): ExoCadVersion | null => {
  const raw = String(value || "").trim();
  if (raw === "le_3_0" || raw === "3.0" || raw === "<=3.0") return "le_3_0";
  if (raw === "ge_3_2" || raw === "3.2" || raw === ">=3.2") return "ge_3_2";
  return null;
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
  // requestor·internalLab 모두 개인 User.requestSettings SSOT
  const isPersonalRequestor = isRequestSettingsRole(userRole);
  const canUseRequestSettings = isPersonalRequestor;

  const [designSoftwareValue, setDesignSoftwareValue] = useState("");
  const [exoCadVersion, setExoCadVersion] = useState<ExoCadVersion | null>(null);
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
  const [designSoftwareSaving, setDesignSoftwareSaving] = useState(false);
  const [anodizingSaving, setAnodizingSaving] = useState(false);
  const [forceRequired, setForceRequired] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [gatePendingFiles, setGatePendingFiles] = useState<File[]>([]);
  const gatePendingRef = useRef<File[]>([]);
  const onDefaultsChangeRef = useRef(onDefaultsChange);
  const onGateCompleteRef = useRef(onGateComplete);
  const entryForcedRef = useRef(false);
  /** 아노 토글/모달 저장 후 stale GET이 OFF로 되돌리는 race 방지 */
  const anodizingTouchedRef = useRef(false);
  const anodizingEnabledRef = useRef(anodizingEnabled);
  const draftAnodizingRef = useRef(draftAnodizingEnabled);
  const draftDesignSoftwareRef = useRef(draftDesignSoftware);
  const draftRetentionGrooveRef = useRef(draftRetentionGroove);

  useEffect(() => {
    onDefaultsChangeRef.current = onDefaultsChange;
  }, [onDefaultsChange]);

  useEffect(() => {
    onGateCompleteRef.current = onGateComplete;
  }, [onGateComplete]);

  useEffect(() => {
    anodizingEnabledRef.current = anodizingEnabled;
  }, [anodizingEnabled]);

  useEffect(() => {
    draftAnodizingRef.current = draftAnodizingEnabled;
  }, [draftAnodizingEnabled]);

  useEffect(() => {
    draftDesignSoftwareRef.current = draftDesignSoftware;
  }, [draftDesignSoftware]);

  useEffect(() => {
    draftRetentionGrooveRef.current = draftRetentionGroove;
  }, [draftRetentionGroove]);

  const isIncomplete = useCallback(
    (_designSoftware: string, version: ExoCadVersion | null = null) => {
      // 모달이 ExoCAD 전용 — 버전 미선택이면 미완료
      return !version;
    },
    [],
  );

  const openModalForValue = useCallback(
    (
      _value: string,
      opts?: {
        force?: boolean;
        exoCadVersion?: ExoCadVersion | null;
      },
    ) => {
      setExoCadVersion(
        opts?.exoCadVersion !== undefined
          ? opts.exoCadVersion
          : exoCadVersion,
      );
      setForceRequired(Boolean(opts?.force));
      setModalOpen(true);
    },
    [exoCadVersion],
  );

  const openModalForValueRef = useRef(openModalForValue);
  useEffect(() => {
    openModalForValueRef.current = openModalForValue;
  }, [openModalForValue]);

  const clearGatePending = useCallback(() => {
    gatePendingRef.current = [];
    setGatePendingFiles([]);
  }, []);

  const openDesignSoftwareModal = useCallback(() => {
    const current = String(
      designSoftwareValue || draftDesignSoftware || "",
    ).trim();
    const incomplete = isIncomplete(current, exoCadVersion);
    openModalForValue(current, {
      force: incomplete,
      exoCadVersion,
    });
  }, [
    designSoftwareValue,
    draftDesignSoftware,
    exoCadVersion,
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
      openModalForValue("", { force: true });
    },
    [openModalForValue],
  );

  // 서버 설정 로드 + 미설정 시 진입 강제
  useEffect(() => {
    if (!enabled || !token || !canUseRequestSettings) return;

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
        let requestorExo = normalizeExoCadVersion(data?.requestorExoCadVersion);
        let businessExo = normalizeExoCadVersion(data?.exoCadVersion);
        // draft* 는 마운트 클로저가 아니라 ref(최신)로 시드 — 토글 후 stale GET race 완화
        const draftDefault = String(draftDesignSoftwareRef.current || "").trim();
        const draftAno = draftAnodizingRef.current;
        const draftRetention = draftRetentionGrooveRef.current;

        const hasRequestorAno = Boolean(data?.hasRequestorAnodizingSetting);
        const hasBusinessAno = Boolean(data?.hasBusinessAnodizingSetting);
        // 개인 우선, 없으면 BA 폴백(가입 시드·레거시)
        const anodizingConfigured = hasRequestorAno || hasBusinessAno;

        const requestorAnodizing =
          typeof data?.requestorAnodizingEnabled === "boolean"
            ? data.requestorAnodizingEnabled
            : null;
        const businessAnodizing =
          typeof data?.anodizingEnabled === "boolean"
            ? data.anodizingEnabled
            : true;

        const resolvedAnodizing =
          typeof draftAno === "boolean"
            ? draftAno
            : typeof requestorAnodizing === "boolean"
              ? requestorAnodizing
              : businessAnodizing;

        // 사용자가 이미 토글/모달로 바꾼 뒤면 서버 GET으로 아노를 덮지 않음
        const skipAnodizingFromLoad = anodizingTouchedRef.current;
        if (!skipAnodizingFromLoad) {
          setAnodizingEnabled(resolvedAnodizing);
        }
        setHasAnodizingSetting(anodizingConfigured);

        const resolvedRetention = normalizeRetentionGrooveChoice(
          draftRetention ||
            data?.requestorRetentionGroove ||
            data?.retentionGroove ||
            "none",
        );
        setRetentionGrooveDefault(resolvedRetention);

        setNeedsBusinessDesignSoftwareBootstrap(
          !businessDefault && canEditBusinessDesign,
        );
        setNeedsBusinessAnodizingBootstrap(!hasBusinessAno && canEditBusinessAno);

        // 빈 개인값만 BA에서 1회 승격(로드 시 재동기화·BA 덮어쓰기 없음)
        if (!requestorDefault && (draftDefault || businessDefault)) {
          const bootstrapDefault = draftDefault || businessDefault;
          const syncPayload: Record<string, string | null> = {
            requestorDesignSoftware: bootstrapDefault,
          };
          if (bootstrapDefault === "ExoCAD") {
            syncPayload.requestorExoCadVersion =
              requestorExo || businessExo || null;
          }
          const syncRes = await apiFetch<{ data?: RequestSettingsApiData }>({
            path: "/api/businesses/me/request-settings",
            method: "PUT",
            token,
            jsonBody: syncPayload,
          });
          if (syncRes.ok) {
            requestorDefault = bootstrapDefault;
            if (bootstrapDefault === "ExoCAD" && !requestorExo) {
              requestorExo = businessExo;
            }
          }
        }

        if (cancelled) return;

        const effectiveDesign =
          draftDefault || requestorDefault || businessDefault;
        const effectiveExo =
          effectiveDesign === "ExoCAD"
            ? requestorExo || businessExo
            : null;

        const defaultsPatch: Partial<RequestSettingsDefaults> = {
          retentionGroove: resolvedRetention,
        };
        if (!skipAnodizingFromLoad) {
          defaultsPatch.anodizingEnabled = resolvedAnodizing;
        }

        if (effectiveDesign) {
          setDesignSoftwareValue(effectiveDesign);
          setExoCadVersion(effectiveExo);
          onDefaultsChangeRef.current?.({
            designSoftware: effectiveDesign,
            exoCadVersion: effectiveExo,
            ...defaultsPatch,
          });
        } else {
          setExoCadVersion(null);
          onDefaultsChangeRef.current?.(defaultsPatch);
        }

        setLoaded(true);

        if (
          forceOnEntry &&
          !entryForcedRef.current &&
          isIncomplete(effectiveDesign, effectiveExo)
        ) {
          entryForcedRef.current = true;
          openModalForValueRef.current(effectiveDesign, {
            force: true,
            exoCadVersion: effectiveExo,
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
    // openModalForValue 는 ref로 호출(의존성 변경으로 로드 취소·재진입 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canUseRequestSettings,
    enabled,
    forceOnEntry,
    isIncomplete,
    isPersonalRequestor,
    token,
  ]);

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
      if (!token || !canUseRequestSettings) return;

      const jsonBody: Record<string, string> = {};
      if (isPersonalRequestor) {
        jsonBody.requestorRetentionGroove = next;
      }
      if (canEditBusinessAnodizing) {
        jsonBody.retentionGroove = next;
      }
      if (Object.keys(jsonBody).length === 0) return;

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
    [canEditBusinessAnodizing, canUseRequestSettings, isPersonalRequestor, token],
  );

  const handleSaveDesignSoftware = useCallback(async () => {
    if (!exoCadVersion) {
      toast({
        title: "ExoCAD 버전이 필요합니다",
        description: "3.0 이하 여부를 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        description: "의뢰 설정을 저장하려면 로그인해주세요.",
        variant: "destructive",
      });
      return;
    }

    const designSoftware = "ExoCAD";

    setDesignSoftwareSaving(true);
    try {
      // 개인 User SSOT. 대표자만 BA 템플릿(신규 가입 시드)도 갱신.
      // 아노다이징은 툴바 토글에서 별도 저장.
      const savePayload: Record<string, string | null> = {
        requestorDesignSoftware: designSoftware,
        requestorExoCadVersion: exoCadVersion,
      };
      if (canEditBusinessDesignSoftware) {
        savePayload.designSoftware = designSoftware;
        savePayload.exoCadVersion = exoCadVersion;
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
            body?.message || "ExoCAD 버전 저장에 실패했습니다.",
          ),
          variant: "destructive",
        });
        return;
      }

      setDesignSoftwareValue(designSoftware);
      setExoCadVersion(exoCadVersion);
      setNeedsBusinessDesignSoftwareBootstrap(false);
      setForceRequired(false);
      setModalOpen(false);
      onDefaultsChangeRef.current?.({
        designSoftware,
        exoCadVersion,
      });

      const pending = gatePendingRef.current;
      clearGatePending();
      if (pending.length > 0) {
        onGateCompleteRef.current?.(pending);
      }

      toast({
        title: "저장 완료",
        description: "ExoCAD 버전이 저장되었습니다.",
      });
    } finally {
      setDesignSoftwareSaving(false);
    }
  }, [
    canEditBusinessDesignSoftware,
    clearGatePending,
    exoCadVersion,
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

    const next = !anodizingEnabled;
    const prev = anodizingEnabled;
    anodizingTouchedRef.current = true;
    setAnodizingEnabled(next);
    anodizingEnabledRef.current = next;
    onDefaultsChangeRef.current?.({ anodizingEnabled: next });

    setAnodizingSaving(true);
    void (async () => {
      try {
        const jsonBody: Record<string, boolean> = {};
        if (isPersonalRequestor) {
          jsonBody.requestorAnodizingEnabled = next;
          if (canEditBusinessAnodizing) {
            jsonBody.anodizingEnabled = next;
          }
        } else {
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
          anodizingEnabledRef.current = prev;
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
        if (
          isPersonalRequestor &&
          typeof data?.requestorAnodizingEnabled === "boolean"
        ) {
          setAnodizingEnabled(data.requestorAnodizingEnabled);
          anodizingEnabledRef.current = data.requestorAnodizingEnabled;
          onDefaultsChangeRef.current?.({
            anodizingEnabled: data.requestorAnodizingEnabled,
          });
        } else if (typeof data?.anodizingEnabled === "boolean") {
          setAnodizingEnabled(data.anodizingEnabled);
          anodizingEnabledRef.current = data.anodizingEnabled;
          onDefaultsChangeRef.current?.({
            anodizingEnabled: data.anodizingEnabled,
          });
        }
        setHasAnodizingSetting(true);
      } catch {
        setAnodizingEnabled(prev);
        anodizingEnabledRef.current = prev;
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
    isPersonalRequestor,
    toast,
    token,
  ]);

  const handleModalOpenChange = useCallback(
    (next: boolean) => {
      // 미설정이어도 당장 닫기 허용. entryForcedRef는 유지 → 재진입/새로고침 시에만 재노출.
      if (!next) {
        clearGatePending();
        setForceRequired(false);
      }
      setModalOpen(next);
    },
    [clearGatePending],
  );

  const settingsComplete = Boolean(exoCadVersion);

  return {
    loaded,
    designSoftwareValue,
    setDesignSoftwareValue,
    exoCadVersion,
    setExoCadVersion,
    anodizingEnabled,
    setAnodizingEnabled,
    retentionGrooveDefault,
    saveRetentionGroove,
    anodizingSaving,
    designSoftwareSaving,
    hasAnodizingSetting,
    settingsComplete,
    modalOpen,
    forceRequired,
    gatePendingFiles,
    openDesignSoftwareModal,
    openGateModal,
    clearGatePending,
    handleSaveDesignSoftware,
    handleToggleAnodizing,
    handleModalOpenChange,
  };
}
