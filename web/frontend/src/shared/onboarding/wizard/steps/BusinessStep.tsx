// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { useMemo } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { BusinessTab } from "@/shared/components/business/settings/BusinessTab";

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
  registerValidationState,
}: BusinessStepProps) => {
  const { user } = useAuthStore();
  const isPracticeBusiness = businessType === "practice";

  const userData = useMemo(
    () => ({
      companyName: user?.companyName || "",
      role: user?.role || "requestor",
    }),
    [user],
  );

  // 온보딩 모드에서는 BusinessTab을 그대로 사용
  // BusinessTab이 모든 로직을 처리함
  return (
    <div className="space-y-4">
      {isPracticeBusiness && role === "owner" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          치과는 사업자등록증 업로드 없이도 가입을 마칠 수 있습니다. 나중에
          설정에서 등록할 수 있어요.
        </p>
      ) : null}
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
