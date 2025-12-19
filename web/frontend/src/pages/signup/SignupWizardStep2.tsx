import React, { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2 } from "lucide-react";

interface SignupWizardStep2Props {
  formData: {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
  };
  isLoading: boolean;
  emailVerifiedAt: Date | null;
  emailVerificationSent: boolean;
  onFormChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPrevious: () => void;
  onSendEmailVerification: () => void;
  onVerifyEmailVerification: (token: string) => void;
  onNext: () => void;
  isStrongPassword: (password: string) => boolean;
  toast: (options: any) => void;
}

export const SignupWizardStep2 = ({
  formData,
  isLoading,
  emailVerifiedAt,
  emailVerificationSent,
  onFormChange,
  onPrevious,
  onSendEmailVerification,
  onVerifyEmailVerification,
  onNext,
  isStrongPassword,
  toast,
}: SignupWizardStep2Props) => {
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const [emailCode, setEmailCode] = React.useState("");

  const handleNext = () => {
    const name = String(formData.name || "").trim();
    const email = String(formData.email || "")
      .trim()
      .toLowerCase();
    const password = String(formData.password || "");
    const confirm = String(formData.confirmPassword || "");

    if (!name) {
      toast({
        title: "오류",
        description: "이름을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (
      !email ||
      !/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email)
    ) {
      toast({
        title: "오류",
        description: "이메일 형식을 확인해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!isStrongPassword(password)) {
      toast({
        title: "오류",
        description: "비밀번호는 10자 이상이며 특수문자를 포함해야 합니다.",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirm) {
      toast({
        title: "오류",
        description: "비밀번호가 일치하지 않습니다.",
        variant: "destructive",
      });
      return;
    }

    if (!emailVerifiedAt) {
      toast({
        title: "오류",
        description: "이메일 인증을 완료해주세요.",
        variant: "destructive",
      });
      return;
    }

    onNext();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isLoading) {
      e.preventDefault();
      handleNext();
    }
  };

  const handleEmailFieldKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Enter" && !isLoading && !emailVerifiedAt && formData.email) {
      e.preventDefault();
      onSendEmailVerification();
    }
  };

  const handleEmailCodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isLoading && emailCode) {
      e.preventDefault();
      onVerifyEmailVerification(emailCode);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name" className="text-sm font-medium">
          이름
        </Label>
        <Input
          id="name"
          name="name"
          type="text"
          placeholder="예: 홍길동"
          value={formData.name}
          onChange={onFormChange}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          autoComplete="name"
          className="h-10"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="text-sm font-medium">
          비밀번호
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="10자 이상, 특수문자 포함"
          value={formData.password}
          onChange={onFormChange}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          autoComplete="new-password"
          className="h-10"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword" className="text-sm font-medium">
          비밀번호 확인
        </Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          placeholder="비밀번호를 다시 입력해주세요"
          value={formData.confirmPassword}
          onChange={onFormChange}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          autoComplete="new-password"
          className="h-10"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="email" className="text-sm font-medium">
            이메일
          </Label>
          {emailVerifiedAt && (
            <div className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              인증 완료
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="example@email.com"
            value={formData.email}
            onChange={onFormChange}
            onKeyDown={handleEmailFieldKeyDown}
            disabled={isLoading || !!emailVerifiedAt}
            className="h-10 flex-1"
          />
          {!emailVerifiedAt && (
            <Button
              type="button"
              variant="outline"
              disabled={isLoading || !formData.email}
              onClick={onSendEmailVerification}
              className="h-10 px-4 flex-shrink-0"
            >
              발송
            </Button>
          )}
        </div>
        {!emailVerifiedAt && emailVerificationSent && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={emailCode}
                onChange={(e) =>
                  setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                onKeyDown={handleEmailCodeKeyDown}
                placeholder="4자리 인증 코드 입력"
                disabled={isLoading}
                maxLength={4}
                className="h-10 flex-1 text-center text-lg tracking-widest"
              />
              <Button
                type="button"
                variant="outline"
                disabled={isLoading || emailCode.length !== 4}
                onClick={() => onVerifyEmailVerification(emailCode)}
                className="h-10 px-4 flex-shrink-0"
              >
                확인
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              이메일로 받은 4자리 인증 코드를 입력해주세요
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          disabled={isLoading}
          onClick={onPrevious}
          className="h-10"
        >
          이전
        </Button>
        <Button
          type="button"
          variant="hero"
          disabled={isLoading || !emailVerifiedAt}
          onClick={handleNext}
          className="h-10"
        >
          {isLoading ? "처리 중..." : "회원가입"}
        </Button>
      </div>
    </div>
  );
};
