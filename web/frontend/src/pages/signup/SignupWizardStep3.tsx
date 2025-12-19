import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertCircle } from "lucide-react";

interface SignupWizardStep3Props {
  formData: { email: string; phone: string };
  isLoading: boolean;
  emailCode: string;
  phoneCode: string;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  emailCodeSent: boolean;
  phoneCodeSent: boolean;
  onFormChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onEmailCodeChange: (value: string) => void;
  onPhoneCodeChange: (value: string) => void;
  onSendEmailVerification: () => void;
  onVerifyEmailVerification: () => void;
  onSendPhoneVerification: () => void;
  onVerifyPhoneVerification: () => void;
  onPrevious: () => void;
  onSubmit: () => void;
}

export const SignupWizardStep3 = ({
  formData,
  isLoading,
  emailCode,
  phoneCode,
  emailVerifiedAt,
  phoneVerifiedAt,
  emailCodeSent,
  phoneCodeSent,
  onFormChange,
  onEmailCodeChange,
  onPhoneCodeChange,
  onSendEmailVerification,
  onVerifyEmailVerification,
  onSendPhoneVerification,
  onVerifyPhoneVerification,
  onPrevious,
  onSubmit,
}: SignupWizardStep3Props) => {
  const handleEmailKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isLoading && emailCode) {
      e.preventDefault();
      onVerifyEmailVerification();
    }
  };

  const handlePhoneKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isLoading && phoneCode) {
      e.preventDefault();
      onVerifyPhoneVerification();
    }
  };

  return (
    <div className="space-y-6">
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
        {!emailVerifiedAt && emailCodeSent && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={emailCode}
                onChange={(e) => onEmailCodeChange(e.target.value)}
                onKeyDown={handleEmailKeyDown}
                placeholder="발송받은 인증번호 입력"
                disabled={isLoading}
                className="h-10 flex-1"
              />
              <Button
                type="button"
                variant="outline"
                disabled={isLoading || !emailCode}
                onClick={onVerifyEmailVerification}
                className="h-10 px-4 flex-shrink-0"
              >
                확인
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              이메일로 받은 인증번호를 위 입력창에 입력하고 확인 버튼을 누르세요
            </p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="phone" className="text-sm font-medium">
            휴대폰
          </Label>
          {phoneVerifiedAt && (
            <div className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              인증 완료
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            id="phone"
            name="phone"
            type="tel"
            placeholder="010-0000-0000"
            value={formData.phone}
            onChange={onFormChange}
            disabled={isLoading || !!phoneVerifiedAt}
            className="h-10 flex-1"
          />
          {!phoneVerifiedAt && (
            <Button
              type="button"
              variant="outline"
              disabled={isLoading || !formData.phone}
              onClick={onSendPhoneVerification}
              className="h-10 px-4 flex-shrink-0"
            >
              발송
            </Button>
          )}
        </div>
        {!phoneVerifiedAt && phoneCodeSent && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={phoneCode}
                onChange={(e) => onPhoneCodeChange(e.target.value)}
                onKeyDown={handlePhoneKeyDown}
                placeholder="발송받은 인증번호 입력"
                disabled={isLoading}
                className="h-10 flex-1"
              />
              <Button
                type="button"
                variant="outline"
                disabled={isLoading || !phoneCode}
                onClick={onVerifyPhoneVerification}
                className="h-10 px-4 flex-shrink-0"
              >
                확인
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              문자로 받은 인증번호를 위 입력창에 입력하고 확인 버튼을 누르세요
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
          disabled={isLoading || !emailVerifiedAt || !phoneVerifiedAt}
          onClick={onSubmit}
          className="h-10"
        >
          {isLoading ? "처리 중..." : "회원가입"}
        </Button>
      </div>
    </div>
  );
};
