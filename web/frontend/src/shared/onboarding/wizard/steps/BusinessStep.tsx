// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/onboarding/wizard/steps/PracticeBusinessProfileStep.tsx
import { useMemo } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { BusinessTab } from "@/shared/components/business/settings/BusinessTab";
import { PracticeBusinessProfileStep } from "./PracticeBusinessProfileStep";

interface BusinessStepProps {
  role: "owner" | "member" | null;
  businessType: string;
  defaultCompleted?: boolean;
  onComplete?: () => void;
  registerGoNextAction?: (action: (() => Promise<boolean>) | null) => void;
  registerBusyState?: (busy: boolean) => void;
  registerValidationState?: (state: {
    passed: boolean;
    validating: boolean;
  }) => void;
  registerValidateAction?: (action: (() => void) | null) => void;
}

export const BusinessStep = ({
  role,
  businessType,
  registerGoNextAction,
  registerBusyState,
  registerValidationState,
}: BusinessStepProps) => {
  const { user } = useAuthStore();
  const isPracticeOwner =
    businessType === "practice" && role === "owner";

  const userData = useMemo(
    () => ({
      companyName: user?.companyName || "",
      role: user?.role || "requestor",
    }),
    [user],
  );

  if (isPracticeOwner) {
    return (
      <PracticeBusinessProfileStep
        registerGoNextAction={registerGoNextAction}
        registerBusyState={registerBusyState}
        registerValidationState={registerValidationState}
      />
    );
  }

  return (
    <div className="space-y-4">
      <BusinessTab
        userData={userData}
        businessTypeOverride={businessType}
        selectedRole={role}
        registerValidationState={registerValidationState}
        isOnboarding={true}
      />
    </div>
  );
};
