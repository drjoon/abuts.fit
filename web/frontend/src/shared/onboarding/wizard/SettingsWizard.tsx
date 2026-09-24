// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { resolveBusinessType } from "@/shared/utils/resolveBusinessType";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/ui/cn";
import { request } from "@/shared/api/apiClient";
import { defaultAvatarUrlFromSeed } from "@/shared/lib/avatarOptions";

import { PhoneStep } from "./steps/PhoneStep";
import { RoleStep } from "./steps/RoleStep";
import { BusinessStep } from "./steps/BusinessStep";
import { clearOnboardingLocalStorage } from "../clearOnboardingLocalStorage";

interface SettingsWizardProps {
  mode: "account" | "business";
  user: any;
  onRequestModeChange: (mode: "account" | "business") => void;
  onWizardComplete: () => void;
}

export type WizardStepId = "profile" | "phone" | "role" | "business";

const FULL_STEP_ORDER: WizardStepId[] = ["phone", "role", "business"];

const createStepCompletionState = (): Record<WizardStepId, boolean> => ({
  profile: false,
  phone: false,
  role: false,
  business: false,
});

const readStoredWizardRole = (
  keys: {
    roleStorageKey: string;
    legacyRoleStorageKey: string;
    fallbackRoleStorageKey: string;
  },
  dbVersion?: string,
): "owner" | "member" | null => {
  if (typeof window === "undefined") return null;

  const localDbVersion = window.localStorage.getItem("dbVersion");
  // readStoredStep과 동일: dbVersion이 아직 없으면(초기 로딩) 저장값을 유지
  if (dbVersion && dbVersion !== localDbVersion) {
    return null;
  }

  const storedRole =
    window.localStorage.getItem(keys.roleStorageKey) ||
    window.localStorage.getItem(keys.legacyRoleStorageKey) ||
    window.localStorage.getItem(keys.fallbackRoleStorageKey);

  return storedRole === "owner" || storedRole === "member"
    ? storedRole
    : null;
};

export const SettingsWizard = ({
  mode,
  user,
  onRequestModeChange,
  onWizardComplete,
}: SettingsWizardProps) => {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const businessType = useMemo(() => {
    return resolveBusinessType(user?.role, "requestor");
  }, [user?.role]);
  // auth store 역할도 함께 반영 (prop user 지연 대비)
  const authRole = useAuthStore((s) => s.user?.role);
  const authRequestorKind = useAuthStore((s) => s.user?.requestorKind);
  const authRequestorCapabilities = useAuthStore(
    (s) => s.user?.requestorCapabilities,
  );
  const effectiveBusinessType = useMemo(() => {
    if (authRole === "practice" || businessType === "practice") return "practice";
    return businessType;
  }, [authRole, businessType]);
  const STEP_ORDER = useMemo(() => FULL_STEP_ORDER, []);
  const storageIdentity = useMemo(() => {
    const resolvedUser = user as {
      _id?: string;
      id?: string;
      email?: string;
    } | null;
    return String(
      resolvedUser?._id ||
        resolvedUser?.id ||
        resolvedUser?.email ||
        token ||
        "anonymous",
    );
  }, [token, user]);
  const roleStorageKey = useMemo(() => {
    return `onboarding:wizard-role:${effectiveBusinessType}:${mode}:${storageIdentity}`;
  }, [effectiveBusinessType, mode, storageIdentity]);
  const legacyRoleStorageKey = useMemo(() => {
    return `onboarding:wizard-role:${effectiveBusinessType}:${storageIdentity}`;
  }, [effectiveBusinessType, storageIdentity]);
  const fallbackRoleStorageKey = useMemo(() => {
    return `onboarding:wizard-role:${effectiveBusinessType}:${mode}`;
  }, [effectiveBusinessType, mode]);
  const stepStorageKey = useMemo(() => {
    return `onboarding:wizard-step:${effectiveBusinessType}:${mode}:${storageIdentity}`;
  }, [effectiveBusinessType, mode, storageIdentity]);
  const legacyStepStorageKey = useMemo(() => {
    return `onboarding:wizard-step:${effectiveBusinessType}:${storageIdentity}`;
  }, [effectiveBusinessType, storageIdentity]);
  const fallbackStepStorageKey = useMemo(() => {
    return `onboarding:wizard-step:${effectiveBusinessType}:${mode}`;
  }, [effectiveBusinessType, mode]);
  const dbVersion = user?.dbVersion;
  const readStoredStep = useCallback(() => {
    if (typeof window === "undefined") return null;

    const localDbVersion = window.localStorage.getItem("dbVersion");
    console.log("[wizard-readStoredStep] dbVersion check:", {
      userDbVersion: dbVersion,
      localDbVersion,
      match: dbVersion === localDbVersion,
    });

    // DB 버전이 다르면 저장된 단계를 무시하고 처음부터 시작
    // 단, dbVersion이 undefined일 때는 체크하지 않음 (초기 로딩 중)
    if (dbVersion && dbVersion !== localDbVersion) {
      console.warn(
        "[wizard-readStoredStep] DB version mismatch, clearing localStorage",
      );
      clearOnboardingLocalStorage();
      return null;
    }

    const storedRaw =
      window.localStorage.getItem(stepStorageKey) ||
      window.localStorage.getItem(legacyStepStorageKey) ||
      window.localStorage.getItem(fallbackStepStorageKey) ||
      "";
    const raw = storedRaw === "profile" ? "phone" : storedRaw;

    console.log("[wizard-readStoredStep] reading from localStorage:", {
      fallbackStepStorageKey,
      stepStorageKey,
      raw,
      isValid: STEP_ORDER.includes(raw as WizardStepId),
    });

    const resolved = STEP_ORDER.includes(raw as WizardStepId)
      ? (raw as WizardStepId)
      : null;

    // 유효하지 않은 단계가 저장되어 있으면 localStorage 정리
    if (!resolved && raw) {
      console.warn(
        "[wizard-readStoredStep] Invalid step in localStorage:",
        raw,
      );
      try {
        window.localStorage.removeItem(stepStorageKey);
        window.localStorage.removeItem(legacyStepStorageKey);
        window.localStorage.removeItem(fallbackStepStorageKey);
      } catch {
        // ignore
      }
    }

    if (resolved && raw === window.localStorage.getItem(legacyStepStorageKey)) {
      window.localStorage.setItem(stepStorageKey, resolved);
      window.localStorage.removeItem(legacyStepStorageKey);
    }

    console.log("[wizard-readStoredStep] resolved step:", resolved);
    return resolved;
  }, [
    dbVersion,
    fallbackStepStorageKey,
    legacyStepStorageKey,
    stepStorageKey,
    roleStorageKey,
    legacyRoleStorageKey,
    fallbackRoleStorageKey,
  ]);
  const [currentStep, setCurrentStep] = useState<WizardStepId | null>(() => {
    // DB 버전 체크 후 localStorage에 저장된 단계 또는 첫 단계부터 시작
    const stored = readStoredStep();
    const initial = stored || "phone";
    console.log("[wizard-init] currentStep:", {
      stored,
      initial,
      dbVersion,
      localDbVersion:
        typeof window !== "undefined"
          ? window.localStorage.getItem("dbVersion")
          : null,
    });
    return initial;
  });
  const readStoredRole = useCallback(
    () =>
      readStoredWizardRole(
        {
          roleStorageKey,
          legacyRoleStorageKey,
          fallbackRoleStorageKey,
        },
        dbVersion,
      ),
    [
      dbVersion,
      fallbackRoleStorageKey,
      legacyRoleStorageKey,
      roleStorageKey,
    ],
  );
  const [selectedRole, setSelectedRole] = useState<"owner" | "member" | null>(
    () =>
      readStoredWizardRole(
        {
          roleStorageKey,
          legacyRoleStorageKey,
          fallbackRoleStorageKey,
        },
        dbVersion,
      ),
  );
  const [stepCompleted, setStepCompleted] = useState<
    Record<WizardStepId, boolean>
  >(() => createStepCompletionState());
  const nextActionRef = useRef<(() => Promise<boolean>) | null>(null);
  const [nextLoading, setNextLoading] = useState(false);
  const [stepBusy, setStepBusy] = useState(false);
  const [validationState, setValidationState] = useState<{
    passed: boolean;
    validating: boolean;
  }>({ passed: false, validating: false });
  const validateActionRef = useRef<(() => void) | null>(null);
  /** requestor practice-only: 사업자등록증 건너뛴 뒤 필수 치과정보 단계 */
  const [practiceProfilePhase, setPracticeProfilePhase] = useState(false);
  /** 치과 대표: 사업자등록 직후 구강 스캔 사용 여부 */
  const [oralScanPhase, setOralScanPhase] = useState(false);
  const avatarAssignedRef = useRef(false);

  useEffect(() => {
    if (!token || avatarAssignedRef.current) return;
    const profileUser = user as {
      _id?: string;
      id?: string;
      email?: string;
      profileImage?: string;
    } | null;
    const existing = String(profileUser?.profileImage || "").trim();
    if (existing) return;
    const seed = String(
      profileUser?._id || profileUser?.id || profileUser?.email || "",
    ).trim();
    if (!seed) return;
    avatarAssignedRef.current = true;
    void request({
      path: "/api/users/profile",
      method: "PUT",
      token,
      jsonBody: { profileImage: defaultAvatarUrlFromSeed(seed) },
    }).catch(() => {});
  }, [token, user]);

  const handlePracticeProfilePhaseChange = useCallback((active: boolean) => {
    setPracticeProfilePhase(active);
    if (active) {
      setValidationState({ passed: false, validating: false });
    }
  }, []);

  const handleLogout = useCallback(() => {
    console.log("[wizard-logout] click", {
      path: window.location.pathname + window.location.search,
      hasToken: Boolean(token),
      userId: user?._id || user?.id || null,
    });
    logout();
    try {
      localStorage.removeItem("abuts_auth_token");
      localStorage.removeItem("abuts_auth_refresh_token");
      localStorage.removeItem("abuts_auth_user");
    } catch {
      // ignore
    }
    const nextUrl = `${window.location.origin}/login`;
    console.log("[wizard-logout] redirect", {
      nextUrl,
      tokenAfterRemove: localStorage.getItem("abuts_auth_token"),
      userAfterRemove: localStorage.getItem("abuts_auth_user"),
    });
    window.location.href = nextUrl;
  }, [logout, token, user]);

  const registerGoNextAction = useCallback(
    (action: (() => Promise<boolean>) | null) => {
      nextActionRef.current = action;
    },
    [],
  );

  const registerStepBusyState = useCallback((busy: boolean) => {
    setStepBusy(busy);
  }, []);

  const registerValidationState = useCallback(
    (state: { passed: boolean; validating: boolean }) => {
      setValidationState(state);
    },
    [],
  );

  const registerValidateAction = useCallback((action: (() => void) | null) => {
    validateActionRef.current = action;
  }, []);

  const handleValidate = useCallback(() => {
    validateActionRef.current?.();
  }, []);

  // DB 버전 저장 (DB 리셋 감지용)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!dbVersion) return;
    window.localStorage.setItem("dbVersion", dbVersion);
  }, [dbVersion]);

  // currentStep 변경 시 localStorage에 저장
  // fallbackStepStorageKey를 우선 저장하여 storageIdentity 변경에도 단계 유지
  useEffect(() => {
    if (typeof window === "undefined" || !currentStep) return;
    console.log("[wizard-save] saving currentStep to localStorage:", {
      currentStep,
      fallbackStepStorageKey,
      stepStorageKey,
    });
    window.localStorage.setItem(fallbackStepStorageKey, currentStep);
    window.localStorage.setItem(stepStorageKey, currentStep);
  }, [currentStep, fallbackStepStorageKey, stepStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!selectedRole) return;
    window.localStorage.setItem(roleStorageKey, selectedRole);
    window.localStorage.setItem(fallbackRoleStorageKey, selectedRole);
  }, [fallbackRoleStorageKey, roleStorageKey, selectedRole]);

  // storageIdentity/user 지연 로딩 후에도 역할 복원
  useEffect(() => {
    if (selectedRole) return;
    const storedRole = readStoredRole();
    if (storedRole) {
      setSelectedRole(storedRole);
    }
  }, [readStoredRole, selectedRole]);

  // 사업자 단계인데 등록 방식이 없으면 역할 선택으로 되돌림
  // (stale localStorage로 business에 바로 진입해 등록증 UI가 뜨는 것 방지)
  useEffect(() => {
    if (currentStep !== "business") return;
    if (selectedRole) return;
    const storedRole = readStoredRole();
    if (storedRole) {
      setSelectedRole(storedRole);
      return;
    }
    setCurrentStep("role");
  }, [currentStep, readStoredRole, selectedRole]);

  const handleNext = useCallback(async () => {
    if (!currentStep) return;
    if (
      currentStep === "phone" ||
      currentStep === "business"
    ) {
      const action = nextActionRef.current;
      if (action) {
        setNextLoading(true);
        const ok = await action();
        setNextLoading(false);
        if (!ok) {
          return;
        }
      }
    }
    if (currentStep === "role") {
      if (!selectedRole) return;
      handleStepComplete("role");
    }
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    if (currentIndex < STEP_ORDER.length - 1) {
      setCurrentStep(STEP_ORDER[currentIndex + 1]);
      return;
    }
    if (currentIndex !== STEP_ORDER.length - 1) return;

    // 사업자 단계 완료 후: 치과 대표만 구강 스캔 단계(이미 프로필 단계에서 답한 레거시 practice 제외)
    if (currentStep === "business" && !oralScanPhase) {
      const latest = useAuthStore.getState().user;
      const isPracticeCapable =
        latest?.requestorKind === "practice" ||
        latest?.role === "practice" ||
        Boolean(latest?.requestorCapabilities?.practice);
      const answeredInLegacyPracticeForm = latest?.role === "practice";
      if (
        selectedRole === "owner" &&
        isPracticeCapable &&
        !answeredInLegacyPracticeForm
      ) {
        setOralScanPhase(true);
        setValidationState({ passed: false, validating: false });
        return;
      }
    }

    onWizardComplete();
  }, [currentStep, oralScanPhase, selectedRole, onWizardComplete, STEP_ORDER]);

  const canProceedBusinessStep = validationState.passed;

  const handlePrev = useCallback(() => {
    if (!currentStep) return;
    if (currentStep === "business" && oralScanPhase) {
      setOralScanPhase(false);
      setValidationState({ passed: false, validating: false });
      return;
    }
    if (currentStep === "business" && practiceProfilePhase) {
      setPracticeProfilePhase(false);
      setValidationState({ passed: false, validating: false });
      return;
    }
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    if (currentIndex <= 0) return;
    const prevStep = STEP_ORDER[currentIndex - 1];
    setCurrentStep(prevStep);
    // 사업자 단계 떠날 때 검증 상태 리셋
    if (currentStep === "business") {
      setPracticeProfilePhase(false);
      setOralScanPhase(false);
      setValidationState({ passed: false, validating: false });
    }
  }, [oralScanPhase, practiceProfilePhase, currentStep, STEP_ORDER]);

  // 역할 변경 시 검증 상태 리셋
  useEffect(() => {
    setPracticeProfilePhase(false);
    setOralScanPhase(false);
    setValidationState({ passed: false, validating: false });
  }, [selectedRole]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      if (!currentStep || currentStep !== "phone") {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "BUTTON"].includes(target.tagName)) {
        return;
      }
      event.preventDefault();
      void handleNext();
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [currentStep, handleNext]);

  const handleStepComplete = (
    step: WizardStepId,
    options?: { autoAdvance?: boolean },
  ) => {
    setStepCompleted((prev) => {
      if (prev[step]) return prev;
      return { ...prev, [step]: true };
    });
    if (options?.autoAdvance && step !== "business") {
      void handleNext();
    }
  };

  const stepTitle = useMemo(() => {
    switch (currentStep) {
      case "phone":
        return "휴대전화 인증";
      case "role":
        return "등록 방식 선택";
      case "business":
        if (oralScanPhase) {
          return "구강 스캔";
        }
        if (
          practiceProfilePhase ||
          (effectiveBusinessType === "practice" && selectedRole === "owner")
        ) {
          return "치과 정보";
        }
        return selectedRole === "owner" ? "사업자 등록" : "사업자 가입";
      default:
        return "";
    }
  }, [
    oralScanPhase,
    practiceProfilePhase,
    currentStep,
    effectiveBusinessType,
    selectedRole,
  ]);

  const cardMaxWidth = useMemo(() => {
    switch (currentStep) {
      case "phone":
        return "max-w-md";
      case "role":
        return "max-w-2xl";
      case "business":
        return "max-w-3xl";
      default:
        return "max-w-xl";
    }
  }, [currentStep]);

  // 치과 대표는 사업자 등록 뒤 구강 스캔 단계가 추가되므로 진행 표시는 4단계.
  // (레거시 practice 역할은 프로필에서 이미 답해 구강 스캔 단계를 생략)
  const includesOralScanStep = useMemo(() => {
    if (oralScanPhase) return true;
    if (selectedRole !== "owner") return false;
    const role = String(authRole || user?.role || "").trim();
    if (role === "practice") return false;
    const kind = String(
      authRequestorKind || user?.requestorKind || "",
    ).trim();
    if (kind === "practice") return true;
    if (kind === "lab") return false;
    return Boolean(
      authRequestorCapabilities?.practice ||
        user?.requestorCapabilities?.practice,
    );
  }, [
    oralScanPhase,
    selectedRole,
    authRole,
    authRequestorKind,
    authRequestorCapabilities,
    user,
  ]);

  const stepProgress = useMemo(() => {
    const baseIndex = currentStep ? STEP_ORDER.indexOf(currentStep) : -1;
    const baseCurrent = Math.max(1, baseIndex + 1);
    if (!includesOralScanStep) {
      return { current: baseCurrent, total: STEP_ORDER.length };
    }
    const total = STEP_ORDER.length + 1;
    return {
      current: oralScanPhase ? total : baseCurrent,
      total,
    };
  }, [STEP_ORDER, currentStep, includesOralScanStep, oralScanPhase]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#edf2ff] via-white to-[#f8fafc]">
      <div className="mx-auto flex min-h-screen w-full flex-col items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-5 text-center sm:mb-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-4 py-1.5 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500 shadow-sm">
            {stepProgress.current}/{stepProgress.total}
          </div>
          <p className="mt-3 text-sm text-slate-500">
            기본 설정이 완료되면 플랫폼을 사용하실 수 있습니다.
          </p>
        </div>

        <Card
          className={cn(
            "w-full rounded-2xl border border-white/60 bg-white/95 shadow-xl backdrop-blur sm:rounded-3xl",
            cardMaxWidth,
          )}
        >
          <CardHeader className="space-y-1 border-slate-100/80 px-4 pb-0 pt-5 sm:px-8 sm:pt-6 md:px-12">
            <CardTitle className="text-2xl font-semibold leading-tight text-slate-900 sm:text-3xl">
              {stepTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-5 pt-5 sm:px-8 sm:pb-6 sm:pt-6 md:px-12">
            {currentStep === "phone" && (
              <PhoneStep
                defaultCompleted={stepCompleted.phone}
                onComplete={() => handleStepComplete("phone")}
                registerGoNextAction={registerGoNextAction}
              />
            )}
            {currentStep === "role" && (
              <RoleStep
                selectedRole={selectedRole}
                onRoleSelect={(role) => {
                  setSelectedRole(role);
                }}
                onComplete={() => handleStepComplete("role")}
              />
            )}
            {currentStep === "business" && (
              <BusinessStep
                role={selectedRole}
                businessType={effectiveBusinessType}
                defaultCompleted={stepCompleted.business}
                onComplete={() => handleStepComplete("business")}
                practiceProfilePhase={practiceProfilePhase}
                onPracticeProfilePhaseChange={handlePracticeProfilePhaseChange}
                oralScanPhase={oralScanPhase}
                registerGoNextAction={registerGoNextAction}
                registerBusyState={registerStepBusyState}
                registerValidationState={registerValidationState}
                registerValidateAction={registerValidateAction}
              />
            )}

            {(STEP_ORDER.indexOf(currentStep) > 0 ||
              currentStep === "phone") && (
              <div className="mt-6 flex flex-col-reverse gap-3 sm:mt-8 sm:flex-row sm:justify-between">
                {STEP_ORDER.indexOf(currentStep) > 0 ? (
                  <Button
                    variant="outline"
                    onClick={handlePrev}
                    disabled={
                      nextLoading || stepBusy || validationState.validating
                    }
                    className="h-11 w-full sm:w-20"
                  >
                    이전
                  </Button>
                ) : (
                  <div className="hidden sm:block" />
                )}
                <div className="flex gap-3 sm:ml-auto">
                  {(currentStep === "phone" ||
                    currentStep === "role" ||
                    currentStep === "business") && (
                    <Button
                      onClick={() => {
                        void handleNext();
                      }}
                      disabled={
                        nextLoading ||
                        stepBusy ||
                        (currentStep === "role" && !selectedRole) ||
                        (currentStep === "business" && !canProceedBusinessStep)
                      }
                      className="h-11 w-full sm:w-20"
                    >
                      {nextLoading ? "저장 중..." : "다음"}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-slate-500">
          <Button
            variant="ghost"
            className="text-slate-500 hover:text-slate-900"
            type="button"
            onClick={() => {
              if (currentStep === "business" && canProceedBusinessStep) {
                onWizardComplete();
              } else {
                navigate("/");
              }
            }}
          >
            홈으로 돌아가기
          </Button>
          <Button
            variant="ghost"
            className="text-slate-500 hover:text-slate-900"
            type="button"
            onClick={handleLogout}
          >
            로그아웃
          </Button>
        </div>
      </div>
    </div>
  );
};
