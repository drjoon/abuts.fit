// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { Button } from "@/components/ui/button";
import { useCallback } from "react";
import type { KeyboardEvent } from "react";

interface RoleStepProps {
  selectedRole: "owner" | "member" | null;
  onRoleSelect: (role: "owner" | "member") => void;
  onComplete?: () => void;
}

export const RoleStep = ({
  selectedRole,
  onRoleSelect,
  onComplete,
}: RoleStepProps) => {
  const handleSelect = useCallback(
    (role: "owner" | "member") => {
      onRoleSelect(role);
    },
    [onRoleSelect],
  );

  const handleAdvance = useCallback(() => {
    if (!selectedRole) return;
    onComplete?.();
  }, [onComplete, selectedRole]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (!selectedRole) return;
      handleAdvance();
    },
    [handleAdvance, selectedRole],
  );

  return (
    <div className="space-y-4" onKeyDown={handleKeyDown}>
      <p className="text-sm text-slate-500">
        등록 방식을 고르면 필요한 단계만 보여드릴게요.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button
          type="button"
          variant={selectedRole === "owner" ? "default" : "outline"}
          className="h-24 flex-col items-start justify-center gap-1 whitespace-normal text-left"
          onClick={() => handleSelect("owner")}
        >
          <span className="text-base font-semibold leading-snug">
            처음으로 사업자 등록
          </span>
        </Button>
        <Button
          type="button"
          variant={selectedRole === "member" ? "default" : "outline"}
          className="h-24 flex-col items-start justify-center gap-1 whitespace-normal text-left"
          onClick={() => handleSelect("member")}
        >
          <span className="text-base font-semibold leading-snug">
            이미 등록된 사업자에
            <br />
            임직원 추가 등록
          </span>
        </Button>
      </div>
    </div>
  );
};
