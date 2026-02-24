import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/shared/api/apiClient";
import { onAppEvent } from "@/shared/realtime/socket";
import { cn } from "@/shared/ui/cn";
import { useAuthStore } from "@/store/useAuthStore";
import { AccountSetupStep } from "./steps/AccountSetupStep";
import { OrganizationSetupStep } from "./steps/OrganizationSetupStep";
import type {
  SharedOnboardingProgress,
  SharedOnboardingStepId,
  SharedAccountDraft,
  SharedOrganizationDraft,
} from "./types";

interface SharedSettingsOnboardingWizardProps {
  user: any;
  tourId?: string;
  onComplete?: () => void;
}

const STEP_ORDER: SharedOnboardingStepId[] = ["account", "organization"];
const STEP_GUIDE_IDS: Record<SharedOnboardingStepId, string> = {
  account: "settings.account",
  organization: "settings.organization",
};

const initialAccountDraft: SharedAccountDraft = {
  name: "",
  email: "",
};

const initialOrganizationDraft: SharedOrganizationDraft = {
  membershipRole: "owner",
  organizationName: "",
  businessNumber: "",
  representativeName: "",
  phoneNumber: "",
  email: "",
  address: "",
  selectedOrganizationId: "",
  searchKeyword: "",
};

export const SharedSettingsOnboardingWizard = ({
  user,
  tourId = "settings-onboarding",
  onComplete,
}: SharedSettingsOnboardingWizardProps) => {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const [progress, setProgress] = useState<SharedOnboardingProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<SharedOnboardingStepId | null>(null);
  const [completed, setCompleted] = useState<Record<SharedOnboardingStepId, boolean>>({
    account: false,
    organization: false,
  });
  const [accountDraft, setAccountDraft] = useState<SharedAccountDraft>(initialAccountDraft);
  const [organizationDraft, setOrganizationDraft] =
    useState<SharedOrganizationDraft>(initialOrganizationDraft);
  const [nextLoading, setNextLoading] = useState(false);
  const submitActionRef = useRef<(() => Promise<boolean>) | null>(null);

  const organizationType = useMemo(() => {
    const role = String(user?.role || "requestor").trim();
    return ["requestor", "salesman", "manufacturer"].includes(role)
      ? role
      : "requestor";
  }, [user?.role]);

  const markStep = useCallback(
    async (step: SharedOnboardingStepId, done: boolean) => {
      if (!token) return;
      const remoteStepId = STEP_GUIDE_IDS[step];
      await apiFetch({
        path: `/api/guide-progress/${encodeURIComponent(tourId)}/steps/${encodeURIComponent(remoteStepId)}`,
        method: "PATCH",
        token,
        jsonBody: { done },
      });
    },
    [token, tourId],
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const res = await apiFetch<any>({
          path: `/api/guide-progress/${encodeURIComponent(tourId)}`,
          method: "GET",
          token,
        });
        if (!res.ok || cancelled) return;
        const body = res.data || {};
        const data = body.data || body;
        setProgress(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [token, tourId]);

  useEffect(() => {
    if (!token) return;
    const unsubscribe = onAppEvent((evt) => {
      if (evt.type !== "guide-progress:updated") return;
      const payload = evt.data || {};
      if (payload?.tourId !== tourId) return;
      setProgress(payload);
    });
    return () => unsubscribe?.();
  }, [token, tourId]);

  useEffect(() => {
    const steps = progress?.steps || [];
    const nextDone = { account: false, organization: false };
    for (const step of steps) {
      if (step.stepId === STEP_GUIDE_IDS.account) {
        nextDone.account = step.status === "done";
      }
      if (step.stepId === STEP_GUIDE_IDS.organization) {
        nextDone.organization = step.status === "done";
      }
    }
    setCompleted(nextDone);
    const firstIncomplete = STEP_ORDER.find((s) => !nextDone[s]);
    setCurrentStep(firstIncomplete || "organization");
  }, [progress?.steps]);

  useEffect(() => {
    if (progress?.finishedAt) {
      onComplete?.();
    }
  }, [onComplete, progress?.finishedAt]);

  const handleNext = useCallback(async () => {
    if (!currentStep) return;
    const action = submitActionRef.current;
    if (action) {
      setNextLoading(true);
      const ok = await action();
      setNextLoading(false);
      if (!ok) return;
    }

    await markStep(currentStep, true);
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    const next = STEP_ORDER[currentIndex + 1];
    if (next) {
      setCurrentStep(next);
      return;
    }
    onComplete?.();
  }, [currentStep, markStep, onComplete]);

  const handlePrev = useCallback(() => {
    if (!currentStep) return;
    const idx = STEP_ORDER.indexOf(currentStep);
    if (idx <= 0) return;
    setCurrentStep(STEP_ORDER[idx - 1]);
  }, [currentStep]);

  const registerSubmitAction = useCallback(
    (action: (() => Promise<boolean>) | null) => {
      submitActionRef.current = action;
    },
    [],
  );

  if (loading || !currentStep) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f7fb]">
        <div className="text-sm text-slate-500">설정 위저드를 불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#edf2ff] via-white to-[#f8fafc]">
      <div className="mx-auto flex min-h-screen w-full flex-col items-center justify-center px-4 py-12">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-4 py-1 text-xs font-semibold text-slate-500 shadow-sm">
            {STEP_ORDER.indexOf(currentStep) + 1}/{STEP_ORDER.length}
          </div>
        </div>

        <Card className={cn("w-full rounded-3xl border border-white/60 bg-white/95 shadow-xl", currentStep === "organization" ? "max-w-lg" : "max-w-md")}>
          <CardHeader className="pb-1">
            <CardTitle className="text-2xl font-semibold text-slate-900">
              {currentStep === "account" ? "계정 설정" : "조직 설정"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            {currentStep === "account" ? (
              <AccountSetupStep
                token={token || ""}
                draft={accountDraft}
                onDraftChange={setAccountDraft}
                registerSubmitAction={registerSubmitAction}
              />
            ) : (
              <OrganizationSetupStep
                token={token || ""}
                organizationType={organizationType}
                draft={organizationDraft}
                onDraftChange={setOrganizationDraft}
                registerSubmitAction={registerSubmitAction}
              />
            )}

            <div className="mt-8 flex justify-between">
              <Button variant="outline" onClick={handlePrev} disabled={STEP_ORDER.indexOf(currentStep) === 0 || nextLoading} className="w-20 h-11">
                이전
              </Button>
              <Button onClick={() => void handleNext()} disabled={nextLoading} className="w-20 h-11">
                {nextLoading ? "저장 중..." : "다음"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate("/")}>홈으로 돌아가기</Button>
          <Button
            variant="ghost"
            onClick={() => {
              logout();
              navigate("/");
            }}
          >
            로그아웃
          </Button>
        </div>
      </div>
    </div>
  );
};
