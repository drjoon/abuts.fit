import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, ExternalLink, Mail } from "lucide-react";

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
  isEmailValid: boolean;
  isEmailStatusChecking: boolean;
  lastEmailVerificationSentAt: Date | null;
  onFormChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSendEmailVerification: () => void;
  onVerifyCode: (code: string) => Promise<void>;
  onPrevious: () => void;
}

export const SignupSocialWizardStep2 = ({
  formData,
  socialInfo,
  isLoading,
  emailVerifiedAt,
  emailVerificationSent,
  isEmailValid,
  isEmailStatusChecking,
  lastEmailVerificationSentAt,
  onFormChange,
  onSendEmailVerification,
  onVerifyCode,
  onPrevious,
}: SignupSocialWizardStep2Props) => {
  const [verificationCode, setVerificationCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const emailChanged = socialInfo?.email !== formData.email;

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 4);
    setVerificationCode(value);
  };

  const handleVerifyCode = async () => {
    if (verificationCode.length !== 4 || isVerifying) return;
    setIsVerifying(true);
    try {
      await onVerifyCode(verificationCode);
      setVerificationCode("");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && verificationCode.length === 4) {
      e.preventDefault();
      handleVerifyCode();
    }
  };

  const helperBlock = () => {
    if (emailVerifiedAt) return null;

    const lastSentLabel = lastEmailVerificationSentAt
      ? new Intl.DateTimeFormat("ko-KR", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(lastEmailVerificationSentAt)
      : null;

    const emailDomain = useMemo(() => {
      return formData.email.split("@")[1]?.toLowerCase() || "";
    }, [formData.email]);

    const mailboxShortcuts: Record<string, { label: string; url: string }> = {
      "gmail.com": { label: "Gmail 열기", url: "https://mail.google.com" },
      "naver.com": { label: "네이버 메일 열기", url: "https://mail.naver.com" },
      "daum.net": { label: "다음 메일 열기", url: "https://mail.daum.net" },
      "kakao.com": { label: "카카오 메일 열기", url: "https://mail.kakao.com" },
      "outlook.com": { label: "Outlook 열기", url: "https://outlook.live.com" },
    };

    const shortcut = mailboxShortcuts[emailDomain];

    return (
      <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-cyan-500/20 p-2">
            <Mail className="h-5 w-5 text-cyan-400" />
          </div>
          <div className="flex-1 space-y-1 text-sm">
            <p className="font-medium text-white">
              {formData.email}로 인증 코드를 발송했습니다
            </p>
            <p className="text-white/60">
              메일함에서 4자리 코드를 확인하고 아래에 입력해주세요.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              type="text"
              inputMode="numeric"
              placeholder="0000"
              value={verificationCode}
              onChange={handleCodeChange}
              onKeyDown={handleCodeKeyDown}
              disabled={isVerifying}
              className="h-12 flex-1 border-white/10 bg-white/5 text-center text-2xl font-semibold tracking-[0.5em] text-white placeholder:text-white/30"
              maxLength={4}
            />
            <Button
              type="button"
              variant="hero"
              disabled={verificationCode.length !== 4 || isVerifying}
              onClick={handleVerifyCode}
              className="h-12 px-6"
            >
              {isVerifying ? "확인 중..." : "확인"}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {shortcut && (
              <Button
                type="button"
                variant="outline"
                onClick={() => window.open(shortcut.url, "_blank")}
                className="h-9 flex-1 border-white/10 bg-white/5 text-xs text-white/80 hover:bg-white/10 hover:text-white"
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                {shortcut.label}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              disabled={isLoading}
              onClick={onSendEmailVerification}
              className="h-9 flex-1 text-xs text-white/70 hover:text-white"
            >
              코드 재발송
            </Button>
          </div>

          {lastSentLabel && (
            <p className="text-center text-xs text-white/50">
              최근 발송: {lastSentLabel}
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {!emailChanged && (
        <div className="space-y-2 text-center">
          <h3 className="text-lg font-semibold text-white">
            이메일을 확인하고 가입을 마무리하세요
          </h3>
          <p className="text-sm text-white/70">
            {formData.email} 주소로 가입 확인 메일을 보냈습니다.
            <br /> 메일의 확인 버튼을 눌러야 로그인할 수 있습니다.
          </p>
        </div>
      )}

      {emailChanged && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="email"
              className="text-sm font-medium text-white/80"
            >
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
              className="h-10 flex-1 border-white/10 bg-white/5 text-white placeholder:text-white/40"
            />
            {!emailVerifiedAt && (
              <Button
                type="button"
                variant="outline"
                disabled={isLoading || !isEmailValid}
                onClick={onSendEmailVerification}
                className="h-10 px-4 flex-shrink-0 border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
              >
                발송
              </Button>
            )}
          </div>
          {!emailVerifiedAt && helperBlock()}
        </div>
      )}

      {!emailChanged && helperBlock()}

      <div className="pt-4">
        <Button
          type="button"
          variant="outline"
          disabled={isLoading}
          onClick={onPrevious}
          className="h-10 border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
        >
          정보 수정하기
        </Button>
      </div>
    </div>
  );
};
