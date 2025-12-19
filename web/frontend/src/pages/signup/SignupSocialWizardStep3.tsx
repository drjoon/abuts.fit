import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2 } from "lucide-react";

interface SignupSocialWizardStep2Props {
  formData: {
    name: string;
    email: string;
  };
  socialInfo: {
    name: string;
    email: string;
  } | null;
  isLoading: boolean;
  emailVerifiedAt: Date | null;
  emailVerificationSent: boolean;
  onFormChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSendEmailVerification: () => void;
  onVerifyEmailVerification: (token: string) => void;
  onPrevious: () => void;
  onSubmit: () => void;
}

export const SignupSocialWizardStep2 = ({
  formData,
  socialInfo,
  isLoading,
  emailVerifiedAt,
  emailVerificationSent,
  onFormChange,
  onSendEmailVerification,
  onVerifyEmailVerification,
  onPrevious,
  onSubmit,
}: SignupSocialWizardStep2Props) => {
  const [emailCode, setEmailCode] = useState("");
  const emailChanged = socialInfo?.email !== formData.email;

  const handleEmailCodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isLoading && emailCode.length === 4) {
      e.preventDefault();
      onVerifyEmailVerification(emailCode);
    }
  };

  return (
    <div className="space-y-6">
      {emailChanged && (
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
      )}

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
          disabled={isLoading || (emailChanged && !emailVerifiedAt)}
          onClick={onSubmit}
          className="h-10"
        >
          {isLoading ? "처리 중..." : "회원가입"}
        </Button>
      </div>
    </div>
  );
};
