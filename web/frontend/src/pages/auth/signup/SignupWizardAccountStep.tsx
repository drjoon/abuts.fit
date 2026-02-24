import React, { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SignupWizardAccountStepProps {
  formData: {
    name: string;
    password: string;
    confirmPassword: string;
  };
  errors?: Partial<Record<"name" | "password" | "confirmPassword", string>>;
  focusField?: "name" | "password" | "confirmPassword" | null;
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
  const confirmRef = useRef<HTMLInputElement | null>(null);

  const activeErrorField = useMemo(() => focusField || null, [focusField]);

  useEffect(() => {
    if (!activeErrorField) return;
    const target =
      activeErrorField === "name"
        ? nameRef.current
        : activeErrorField === "password"
          ? passwordRef.current
          : confirmRef.current;
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
          이름
          {errors?.name && (
            <span className="ml-2 text-xs font-medium text-rose-200">
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
          className={`h-10 border-white/10 bg-white/5 text-white placeholder:text-white/40 ${errors?.name ? "border-rose-300" : ""}`}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="text-sm font-medium text-white/80">
          비밀번호
          {errors?.password && (
            <span className="ml-2 text-xs font-medium text-rose-200">
              {errors.password}
            </span>
          )}
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="10자 이상, 특수문자 포함"
          value={formData.password}
          onChange={onFormChange}
          ref={passwordRef}
          disabled={isLoading}
          autoComplete="new-password"
          className={`h-10 border-white/10 bg-white/5 text-white placeholder:text-white/40 ${errors?.password ? "border-rose-300" : ""}`}
        />
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="confirmPassword"
          className="text-sm font-medium text-white/80"
        >
          비밀번호 확인
          {errors?.confirmPassword && (
            <span className="ml-2 text-xs font-medium text-rose-200">
              {errors.confirmPassword}
            </span>
          )}
        </Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          placeholder="비밀번호를 다시 입력해주세요"
          value={formData.confirmPassword}
          onChange={onFormChange}
          ref={confirmRef}
          disabled={isLoading}
          autoComplete="new-password"
          className={`h-10 border-white/10 bg-white/5 text-white placeholder:text-white/40 ${errors?.confirmPassword ? "border-rose-300" : ""}`}
        />
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
