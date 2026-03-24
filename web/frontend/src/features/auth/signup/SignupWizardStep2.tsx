import React, { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, ExternalLink, Mail } from "lucide-react";

interface SignupWizardStep2Props {
  formData: {
    email: string;
  };
  isLoading: boolean;
  emailVerifiedAt: Date | null;
  emailVerificationSent: boolean;
  isEmailValid: boolean;
  isEmailStatusChecking: boolean;
  lastEmailVerificationSentAt: Date | null;
  onFormChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPrevious: () => void;
  onNext: () => void | Promise<void>;
  onSendEmailVerification: () => void;
  onVerifyCode: (code: string) => Promise<void>;
  onEditEmail: () => void;
}

export const SignupWizardStep2 = ({
  formData,
  isLoading,
  emailVerifiedAt,
  emailVerificationSent,
  isEmailValid,
  isEmailStatusChecking,
  lastEmailVerificationSentAt,
  onFormChange,
  onPrevious,
  onNext,
  onSendEmailVerification,
  onVerifyCode,
  onEditEmail,
}: SignupWizardStep2Props) => {
  const [verificationCode, setVerificationCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [codeError, setCodeError] = useState("");
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const emailDomain = useMemo(() => {
    return formData.email.split("@")[1]?.toLowerCase() || "";
  }, [formData.email]);
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
  };

  const handleEmailFieldKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Enter" && !isLoading && !emailVerifiedAt && formData.email) {
      e.preventDefault();
      onSendEmailVerification();
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 4);
    setVerificationCode(value);
    if (codeError) setCodeError("");
  };

  const handleVerifyCode = async () => {
    if (verificationCode.length !== 4 || isVerifying) {
      if (!isVerifying) {
        setCodeError("4자리를 입력해주세요");
        codeInputRef.current?.focus();
      }
      return;
    }
    setIsVerifying(true);
    try {
      await onVerifyCode(verificationCode);
      setVerificationCode("");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    handleVerifyCode();
  };

  const handleSendVerification = () => {
    if (!formData.email.trim() || !isEmailValid) {
      setEmailError("이메일 형식을 확인해주세요");
      emailInputRef.current?.focus();
      return;
    }
    onSendEmailVerification();
  };

  const emailHelperBlock = () => {
    if (emailVerifiedAt) return null;

    const lastSentLabel = lastEmailVerificationSentAt
      ? new Intl.DateTimeFormat("ko-KR", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(lastEmailVerificationSentAt)
      : null;

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
              ref={codeInputRef}
              disabled={isVerifying}
              className={`h-12 flex-1 border-white/10 bg-white/5 text-center text-2xl font-semibold tracking-[0.5em] text-white placeholder:text-white/30 ${codeError ? "border-rose-300" : ""}`}
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
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="space-y-5">
        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="email"
              className="text-sm font-medium text-white/80"
            >
              이메일
              {emailError && (
                <span className="ml-2 text-xs font-medium text-rose-200">
                  {emailError}
                </span>
              )}
            </Label>
            {emailVerifiedAt && (
              <div className="flex items-center gap-1 text-xs text-green-400">
                <CheckCircle2 className="h-4 w-4" />
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
              onChange={(e) => {
                onFormChange(e);
                if (emailError) setEmailError("");
              }}
              ref={emailInputRef}
              onKeyDown={handleEmailFieldKeyDown}
              disabled={isLoading || !!emailVerifiedAt}
              className={`h-11 flex-1 border-white/10 bg-white/5 text-white placeholder:text-white/40 ${emailError ? "border-rose-300" : ""}`}
            />
            {!emailVerifiedAt && (
              <Button
                type="button"
                variant="outline"
                disabled={isLoading || !isEmailValid || emailVerificationSent}
                onClick={handleSendVerification}
                className="h-11 px-4 flex-shrink-0 border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
              >
                발송
              </Button>
            )}
          </div>
          {/* <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={onPrevious}
              className="h-10 border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
            >
              뒤로 돌아가기
            </Button>
            {emailVerifiedAt && (
              <Button
                type="button"
                variant="secondary"
                disabled={isLoading}
                onClick={onEditEmail}
                className="h-10 border-white/10 bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"
              >
                이메일 변경하기
              </Button>
            )}
          </div> */}
        </div>

        {emailVerificationSent && !emailVerifiedAt && emailHelperBlock()}
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2">
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
          type="button"
          variant="hero"
          disabled={isLoading || !emailVerifiedAt}
          onClick={() => {
            if (!emailVerifiedAt) return;
            void onNext();
          }}
          className="h-11"
        >
          다음
        </Button>
      </div>
    </form>
  );
};
