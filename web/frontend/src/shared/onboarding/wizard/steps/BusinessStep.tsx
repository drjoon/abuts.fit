import { useCallback, useMemo } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { BusinessTab } from "@/pages/requestor/settings/components/BusinessTab";

interface BusinessStepProps {
  role: "owner" | "member" | null;
  organizationType: string;
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
  organizationType,
  defaultCompleted,
  onComplete,
  registerGoNextAction,
  registerBusyState,
  registerValidationState,
  registerValidateAction,
}: BusinessStepProps) => {
  const { user } = useAuthStore();

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
    <BusinessTab
      userData={userData}
      organizationTypeOverride={organizationType}
      selectedRole={role}
    />
  );
};
