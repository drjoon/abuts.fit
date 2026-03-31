import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { resolveBusinessType } from "@/shared/utils/resolveBusinessType";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/ui/cn";

import { ProfileStep } from "./steps/ProfileStep";
import { PhoneStep } from "./steps/PhoneStep";
import { RoleStep } from "./steps/RoleStep";
import { BusinessStep } from "./steps/BusinessStep";

interface SettingsWizardProps {
  mode: "account" | "business";
  user: any;
  onRequestModeChange: (mode: "account" | "business") => void;
  onWizardComplete: () => void;
}

export type WizardStepId = "profile" | "phone" | "role" | "business";

const STEP_ORDER: WizardStepId[] = ["profile", "phone", "role", "business"];

const createStepCompletionState = (): Record<WizardStepId, boolean> => ({
  profile: false,
  phone: false,
  role: false,
  business: false,
});

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
    return `onboarding:wizard-role:${businessType}:${mode}:${storageIdentity}`;
  }, [businessType, mode, storageIdentity]);
  const legacyRoleStorageKey = useMemo(() => {
    return `onboarding:wizard-role:${businessType}:${storageIdentity}`;
  }, [businessType, storageIdentity]);
  const fallbackRoleStorageKey = useMemo(() => {
    return `onboarding:wizard-role:${businessType}:${mode}`;
  }, [businessType, mode]);
  const stepStorageKey = useMemo(() => {
    return `onboarding:wizard-step:${businessType}:${mode}:${storageIdentity}`;
  }, [businessType, mode, storageIdentity]);
  const legacyStepStorageKey = useMemo(() => {
    return `onboarding:wizard-step:${businessType}:${storageIdentity}`;
  }, [businessType, storageIdentity]);
  const fallbackStepStorageKey = useMemo(() => {
    return `onboarding:wizard-step:${businessType}:${mode}`;
  }, [businessType, mode]);
  const dbVersion = user?.dbVersion;
  const readStoredStep = useCallback(() => {
    if (typeof window === "undefined") return null;

    // DB 버전이 다르면 저장된 단계를 무시하고 처음부터 시작
    if (dbVersion !== window.localStorage.getItem("dbVersion")) {
      // 이전 진행 상태 정리
      try {
        window.localStorage.removeItem(stepStorageKey);
        window.localStorage.removeItem(legacyStepStorageKey);
        window.localStorage.removeItem(fallbackStepStorageKey);
        window.localStorage.removeItem(roleStorageKey);
        window.localStorage.removeItem(legacyRoleStorageKey);
        window.localStorage.removeItem(fallbackRoleStorageKey);
      } catch {
        // ignore
      }
      return null;
    }

    const raw =
      window.localStorage.getItem(stepStorageKey) ||
      window.localStorage.getItem(legacyStepStorageKey) ||
      window.localStorage.getItem(fallbackStepStorageKey) ||
      "";
    const resolved = STEP_ORDER.includes(raw as WizardStepId)
      ? (raw as WizardStepId)
      : null;
    if (resolved && raw === window.localStorage.getItem(legacyStepStorageKey)) {
      window.localStorage.setItem(stepStorageKey, resolved);
      window.localStorage.removeItem(legacyStepStorageKey);
    }
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
    // 직원 신청 후 승인 대기 중이면 business 단계(4/4) 유지
    const hasPendingJoinRequest =
      user?.role === "manufacturer" ||
      user?.role === "admin" ||
      user?.role === "devops";
    if (hasPendingJoinRequest && !user?.onboardingWizardCompleted) {
      return "business";
    }
    return readStoredStep() || "profile";
  });
  const [selectedRole, setSelectedRole] = useState<"owner" | "member" | null>(
    () => {
      if (typeof window === "undefined") return null;

      // 직원 신청 후 승인 대기 중이면 member 역할 유지
      const hasPendingJoinRequest =
        user?.role === "manufacturer" ||
        user?.role === "admin" ||
        user?.role === "devops";
      if (hasPendingJoinRequest && !user?.onboardingWizardCompleted) {
        return "member";
      }

      // DB 버전이 다르면 저장된 역할을 무시
      if (dbVersion !== window.localStorage.getItem("dbVersion")) {
        return null;
      }

      const storedRole =
        window.localStorage.getItem(roleStorageKey) ||
        window.localStorage.getItem(legacyRoleStorageKey) ||
        window.localStorage.getItem(fallbackRoleStorageKey);
      return storedRole === "owner" || storedRole === "member"
        ? storedRole
        : null;
    },
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

  useEffect(() => {
    if (typeof window === "undefined" || !currentStep) return;
    window.localStorage.setItem(stepStorageKey, currentStep);
    window.localStorage.setItem(fallbackStepStorageKey, currentStep);
  }, [currentStep, fallbackStepStorageKey, stepStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!selectedRole) return;
    window.localStorage.setItem(roleStorageKey, selectedRole);
    window.localStorage.setItem(fallbackRoleStorageKey, selectedRole);
  }, [fallbackRoleStorageKey, roleStorageKey, selectedRole]);

  const handleNext = useCallback(async () => {
    if (!currentStep) return;
    if (
      currentStep === "profile" ||
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
    } else if (currentIndex === STEP_ORDER.length - 1) {
      // 마지막 단계 완료: 대시보드로 이동
      onWizardComplete();
    }
  }, [currentStep, selectedRole, onWizardComplete]);

  const handlePrev = useCallback(() => {
    if (!currentStep) return;
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    if (currentIndex <= 0) return;
    const prevStep = STEP_ORDER[currentIndex - 1];
    setCurrentStep(prevStep);
    // 사업자 단계 떠날 때 검증 상태 리셋
    if (currentStep === "business") {
      setValidationState({ passed: false, validating: false });
    }
  }, [currentStep]);

  // 역할 변경 시 검증 상태 리셋
  useEffect(() => {
    setValidationState({ passed: false, validating: false });
  }, [selectedRole]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      if (!currentStep || !["profile", "phone"].includes(currentStep)) {
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
      case "profile":
        return "프로필 설정";
      case "phone":
        return "휴대전화 인증";
      case "role":
        return "역할 선택";
      case "business":
        return selectedRole === "owner" ? "사업자 등록" : "사업자 가입";
      default:
        return "";
    }
  }, [currentStep, selectedRole]);

  const cardMaxWidth = useMemo(() => {
    switch (currentStep) {
      case "profile":
        return "max-w-md";
      case "phone":
        return "max-w-md";
      case "role":
        return "max-w-md";
      case "business":
        return "max-w-2xl";
      default:
        return "max-w-xl";
    }
  }, [currentStep]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#edf2ff] via-white to-[#f8fafc]">
      <div className="mx-auto flex min-h-screen w-full flex-col items-center justify-center px-4 py-12">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 shadow-sm">
            {STEP_ORDER.indexOf(currentStep) + 1}/{STEP_ORDER.length}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            기본 설정이 완료되면 플랫폼을 사용하실 수 있습니다.
          </p>
        </div>

        <Card
          className={cn(
            "w-full rounded-3xl border border-white/60 bg-white/95 shadow-xl backdrop-blur",
            cardMaxWidth,
          )}
        >
          <CardHeader className="space-y-1 border-slate-100/80 pb-0">
            <CardTitle className="text-2xl font-semibold text-slate-900">
              {stepTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {currentStep === "profile" && (
              <ProfileStep
                defaultCompleted={stepCompleted.profile}
                onComplete={() => handleStepComplete("profile")}
                registerGoNextAction={registerGoNextAction}
              />
            )}
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
                businessType={businessType}
                defaultCompleted={stepCompleted.business}
                onComplete={() => handleStepComplete("business")}
                registerGoNextAction={registerGoNextAction}
                registerBusyState={registerStepBusyState}
                registerValidationState={registerValidationState}
                registerValidateAction={registerValidateAction}
              />
            )}

            {(STEP_ORDER.indexOf(currentStep) > 0 ||
              currentStep === "profile" ||
              currentStep === "phone") && (
              <div className="mt-8 flex justify-between gap-3">
                {STEP_ORDER.indexOf(currentStep) > 0 ? (
                  <Button
                    variant="outline"
                    onClick={handlePrev}
                    disabled={
                      nextLoading || stepBusy || validationState.validating
                    }
                    className="w-20 h-11"
                  >
                    이전
                  </Button>
                ) : (
                  <div />
                )}
                <div className="flex gap-3">
                  {(currentStep === "profile" ||
                    currentStep === "phone" ||
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
                        (currentStep === "business" && !validationState.passed)
                      }
                      className="w-20 h-11"
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
              if (currentStep === "business" && validationState.passed) {
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
