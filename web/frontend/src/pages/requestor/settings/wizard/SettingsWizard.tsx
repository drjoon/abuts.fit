import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/shared/api/apiClient";
import { onAppEvent } from "@/shared/realtime/socket";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/ui/cn";

import { ProfileStep } from "./steps/ProfileStep";
import { PhoneStep } from "./steps/PhoneStep";
import { RoleStep } from "./steps/RoleStep";
import { OrganizationStep } from "./steps/OrganizationStep";

interface SettingsWizardProps {
  mode: "account" | "organization";
  user: any;
  onRequestModeChange: (mode: "account" | "organization") => void;
  onWizardComplete: () => void;
}

export type WizardStepId = "profile" | "phone" | "role" | "organization";

const STEP_ORDER: WizardStepId[] = ["profile", "phone", "role", "organization"];

type GuideProgressStep = {
  stepId: string;
  status: string;
  doneAt?: string | null;
};

type BackendGuideProgress = {
  steps?: GuideProgressStep[];
  finishedAt?: string | null;
};

const WIZARD_TOUR_ID = "requestor-wizard";

const STEP_GUIDE_IDS: Record<WizardStepId, string> = {
  profile: "wizard.profile",
  phone: "wizard.phone",
  role: "wizard.role",
  organization: "wizard.organization",
};

const GUIDE_TO_STEP = Object.entries(STEP_GUIDE_IDS).reduce(
  (acc, [step, guide]) => {
    acc[guide] = step as WizardStepId;
    return acc;
  },
  {} as Record<string, WizardStepId>,
);

const createStepCompletionState = (): Record<WizardStepId, boolean> => ({
  profile: false,
  phone: false,
  role: false,
  organization: false,
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
  const organizationType = useMemo(() => {
    const role = String(user?.role || "requestor").trim();
    if (["salesman", "manufacturer", "requestor"].includes(role)) {
      return role;
    }
    return "requestor";
  }, [user?.role]);
  const [progress, setProgress] = useState<BackendGuideProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<WizardStepId | null>(null);
  const [selectedRole, setSelectedRole] = useState<"owner" | "member" | null>(
    null,
  );
  const [stepCompleted, setStepCompleted] = useState<
    Record<WizardStepId, boolean>
  >(() => createStepCompletionState());
  const nextActionRef = useRef<(() => Promise<boolean>) | null>(null);
  const [nextLoading, setNextLoading] = useState(false);

  const handleLogout = useCallback(() => {
    logout();
    navigate("/");
  }, [logout, navigate]);

  const registerGoNextAction = useCallback(
    (action: (() => Promise<boolean>) | null) => {
      nextActionRef.current = action;
    },
    [],
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const fetchOnce = async () => {
      try {
        setLoading(true);
        const res = await apiFetch<any>({
          path: `/api/guide-progress/${WIZARD_TOUR_ID}`,
          method: "GET",
          token,
        });
        if (cancelled) return;
        if (!res.ok) return;
        const body: any = res.data || {};
        const data = body.data || body;
        setProgress(data);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchOnce();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const unsubscribe = onAppEvent((evt) => {
      if (evt.type !== "guide-progress:updated") return;
      const payload = evt.data || {};
      if (payload?.tourId !== WIZARD_TOUR_ID) return;
      setProgress(payload);
      setLoading(false);
    });
    return () => {
      unsubscribe?.();
    };
  }, [token]);

  useEffect(() => {
    if (!progress?.steps) return;
    const nextCompleted = createStepCompletionState();
    progress.steps.forEach((entry) => {
      const stepId = GUIDE_TO_STEP[entry.stepId];
      if (stepId) {
        nextCompleted[stepId] = entry.status === "done";
      }
    });
    setStepCompleted(nextCompleted);
    setCurrentStep((prev) => {
      const firstIncomplete = STEP_ORDER.find((step) => !nextCompleted[step]);
      if (firstIncomplete) return firstIncomplete;
      return prev ?? "organization";
    });
  }, [progress?.steps]);

  useEffect(() => {
    if (progress?.finishedAt) {
      onWizardComplete();
    }
  }, [onWizardComplete, progress?.finishedAt]);

  useEffect(() => {
    if (!currentStep) return;
    const nextStep = STEP_ORDER.find((step) => !stepCompleted[step]);
    if (!nextStep) return;
    const nextIndex = STEP_ORDER.indexOf(nextStep);
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    if (currentIndex === -1 || currentIndex > nextIndex) {
      setCurrentStep(nextStep);
    }
  }, [currentStep, stepCompleted]);

  const markGuideStep = useCallback(
    async (step: WizardStepId, done: boolean) => {
      if (!token) return;
      const remoteStepId = STEP_GUIDE_IDS[step];
      if (!remoteStepId) return;
      try {
        await apiFetch({
          path: `/api/guide-progress/${WIZARD_TOUR_ID}/steps/${encodeURIComponent(remoteStepId)}`,
          method: "PATCH",
          token,
          jsonBody: { done },
        });
      } catch (error) {
        console.warn("[wizard] step sync failed", step, error);
      }
    },
    [token],
  );

  const handleNext = useCallback(async () => {
    if (!currentStep) return;
    if (
      currentStep === "profile" ||
      currentStep === "phone" ||
      currentStep === "organization"
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
    }
  }, [currentStep, selectedRole]);

  const handlePrev = useCallback(() => {
    if (!currentStep) return;
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    if (currentIndex <= 0) return;
    const prevStep = STEP_ORDER[currentIndex - 1];
    setCurrentStep(prevStep);
  }, [currentStep]);

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
    void markGuideStep(step, true);
    if (options?.autoAdvance && step !== "organization") {
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
      case "organization":
        return selectedRole === "owner" ? "사업자 등록" : "조직 가입";
      default:
        return "";
    }
  }, [currentStep, selectedRole]);

  const stepDescription = useMemo(() => {
    switch (currentStep) {
      case "profile":
        return "이름과 프로필 이미지를 설정하세요.";
      case "phone":
        return "휴대전화 번호를 인증하세요.";
      case "role":
        return "대표 또는 직원 중 선택하세요.";
      case "organization":
        return selectedRole === "owner"
          ? "사업자 정보를 입력해 대표 등록을 완료하세요."
          : "기공소를 검색해 소속 신청을 보내세요.";
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
      case "organization":
        return "max-w-lg";
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
            {currentStep === "organization" && (
              <OrganizationStep
                role={selectedRole}
                organizationType={organizationType}
                defaultCompleted={stepCompleted.organization}
                onComplete={() => handleStepComplete("organization")}
                registerGoNextAction={registerGoNextAction}
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
                    disabled={nextLoading}
                    className="w-20 h-11"
                  >
                    이전
                  </Button>
                ) : (
                  <div />
                )}
                {(currentStep === "profile" ||
                  currentStep === "phone" ||
                  currentStep === "role" ||
                  currentStep === "organization") && (
                  <Button
                    onClick={() => {
                      void handleNext();
                    }}
                    disabled={
                      nextLoading || (currentStep === "role" && !selectedRole)
                    }
                    className="w-20 h-11"
                  >
                    {nextLoading ? "저장 중..." : "다음"}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-slate-500">
          <Button
            variant="ghost"
            className="text-slate-500 hover:text-slate-900"
            onClick={() => navigate("/")}
          >
            홈으로 돌아가기
          </Button>
          <Button
            variant="ghost"
            className="text-slate-500 hover:text-slate-900"
            onClick={handleLogout}
          >
            로그아웃
          </Button>
        </div>
      </div>
    </div>
  );
};
