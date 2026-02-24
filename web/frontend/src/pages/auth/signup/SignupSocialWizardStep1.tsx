import type React from "react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SignupSocialWizardStep1Props {
  formData: {
    name: string;
    email: string;
  };
  socialInfo: {
    name: string;
    email: string;
  } | null;
  isLoading: boolean;
  onFormChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPrevious: () => void;
  onNext: () => void;
}

export const SignupSocialWizardStep1 = ({
  formData,
  socialInfo,
  isLoading,
  onFormChange,
  onPrevious,
  onNext,
}: SignupSocialWizardStep1Props) => {
  const [nameError, setNameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const nameRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);

  const handleNext = () => {
    const name = String(formData.name || "").trim();
    const email = String(formData.email || "")
      .trim()
      .toLowerCase();
    let hasError = false;

    if (!name) {
      setNameError("이름을 입력해주세요");
      nameRef.current?.focus();
      hasError = true;
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("이메일 형식을 확인해주세요");
      if (!hasError) {
        emailRef.current?.focus();
      }
      hasError = true;
    }

    if (hasError) return;

    onNext();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isLoading) {
      e.preventDefault();
      handleNext();
    }
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        handleNext();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="name" className="text-sm font-medium text-white/80">
          이름
          {nameError && (
            <span className="ml-2 text-xs font-medium text-rose-200">
              {nameError}
            </span>
          )}
        </Label>
        <Input
          id="name"
          name="name"
          type="text"
          placeholder="예: 홍길동"
          value={formData.name}
          onChange={(e) => {
            onFormChange(e);
            if (nameError) setNameError("");
          }}
          ref={nameRef}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          autoComplete="name"
          className={`h-10 border-white/10 bg-white/5 text-white placeholder:text-white/40 ${nameError ? "border-rose-300" : ""}`}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email" className="text-sm font-medium text-white/80">
          이메일
          {emailError && (
            <span className="ml-2 text-xs font-medium text-rose-200">
              {emailError}
            </span>
          )}
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="example@email.com"
          value={formData.email}
          onChange={(e) => {
            onFormChange(e);
            if (emailError) setEmailError("");
          }}
          ref={emailRef}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          autoComplete="email"
          className={`h-10 border-white/10 bg-white/5 text-white placeholder:text-white/40 ${emailError ? "border-rose-300" : ""}`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          disabled={isLoading}
          onClick={onPrevious}
          className="h-10 border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
        >
          이전
        </Button>
        <Button
          type="submit"
          variant="hero"
          disabled={isLoading}
          className="h-10"
        >
          회원가입
        </Button>
      </div>
    </form>
  );
};
