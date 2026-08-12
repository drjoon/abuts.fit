// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SignupWizardAccountStepProps {
  formData: {
    name: string;
    password: string;
  };
  errors?: Partial<Record<"name" | "password", string>>;
  focusField?: "name" | "password" | null;
  isLoading: boolean;
  onFormChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPrevious: () => void;
  onNext: () => void;
}

export const SignupWizardAccountStep = ({
  formData,
  errors,
  focusField,
  isLoading,
  onFormChange,
  onPrevious,
  onNext,
}: SignupWizardAccountStepProps) => {
  const nameRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const activeErrorField = useMemo(() => focusField || null, [focusField]);

  useEffect(() => {
    if (!activeErrorField) return;
    const target =
      activeErrorField === "name" ? nameRef.current : passwordRef.current;
    target?.focus();
  }, [activeErrorField]);

  const handleNext = () => {
    onNext();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isLoading) {
      handleNext();
    }
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="name" className="text-sm font-medium text-white/80">
          사용자 이름 (직원명)
          {errors?.name && (
            <span className="ml-2 text-xs font-medium text-destructive-muted">
              {errors.name}
            </span>
          )}
        </Label>
        <Input
          id="name"
          name="name"
          type="text"
          placeholder="예: 홍길동"
          value={formData.name}
          onChange={onFormChange}
          ref={nameRef}
          disabled={isLoading}
          autoComplete="name"
          className={`h-10 border-white/10 bg-white/5 text-white placeholder:text-white/40 ${errors?.name ? "border-destructive/80" : ""}`}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="text-sm font-medium text-white/80">
          비밀번호
          {errors?.password && (
            <span className="ml-2 text-xs font-medium text-destructive-muted">
              {errors.password}
            </span>
          )}
        </Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder="10자 이상, 특수문자 포함"
            value={formData.password}
            onChange={onFormChange}
            ref={passwordRef}
            disabled={isLoading}
            autoComplete="new-password"
            className={`h-10 border-white/10 bg-white/5 pr-10 text-white placeholder:text-white/40 ${errors?.password ? "border-destructive/80" : ""}`}
          />
          <button
            type="button"
            aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
            onClick={() => setShowPassword((prev) => !prev)}
            disabled={isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-white/60 hover:text-white disabled:opacity-40"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          disabled={isLoading}
          onClick={onPrevious}
          className="h-11 border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
        >
          이전
        </Button>
        <Button
          type="submit"
          variant="hero"
          disabled={isLoading}
          className="h-11"
        >
          다음
        </Button>
      </div>
    </form>
  );
};
