// related files:
// - web/frontend/rules.md
// - web/frontend/src/shared/onboarding/wizard/SettingsWizard.tsx
// - web/backend/controllers/users/user.controller.js
// 휴대전화는 팝빌 인증번호를 확인한 뒤에만 완료한다.
import {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/shared/ui/cn";

interface PhoneStepProps {
  defaultCompleted?: boolean;
  onComplete?: () => void;
  registerGoNextAction?: (action: (() => Promise<boolean>) | null) => void;
}

const PHONE_DRAFT_KEY = "wizard.phoneDraft";

const readPhoneDraft = (): string => {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem(PHONE_DRAFT_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return typeof parsed?.phone === "string" ? parsed.phone : "";
  } catch {
    return "";
  }
};

const savePhoneDraft = (phone: string) => {
  if (typeof window === "undefined") return;
  if (!phone) {
    window.localStorage.removeItem(PHONE_DRAFT_KEY);
    return;
  }
  window.localStorage.setItem(PHONE_DRAFT_KEY, JSON.stringify({ phone }));
};

const toKoreanDigits = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("82")) {
    return `0${digits.slice(2)}`;
  }
  return digits;
};

const formatKoreanPhone = (value: string) => {
  const digits = toKoreanDigits(value).slice(0, 11);
  if (!digits) return "";
  if (digits.startsWith("02")) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};

const normalizePhone = (value: string) => {
  const digits = toKoreanDigits(value);
  if (!digits) return "";
  if (digits.startsWith("02")) {
    return digits.length === 10 ? digits : "";
  }
  return digits.length === 11 ? digits : "";
};

const toE164Korea = (digits: string) => {
  if (!digits) return "";
  const stripped = digits.startsWith("0") ? digits.slice(1) : digits;
  return `+82${stripped}`;
};

export const PhoneStep = ({
  defaultCompleted,
  onComplete,
  registerGoNextAction,
}: PhoneStepProps) => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState(readPhoneDraft);
  const [phoneError, setPhoneError] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [completed, setCompleted] = useState(Boolean(defaultCompleted));
  const [verifiedDigits, setVerifiedDigits] = useState("");
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const completedRef = useRef(completed);
  const loadingRef = useRef(true);
  const codeRef = useRef(code);
  const verifiedDigitsRef = useRef(verifiedDigits);
  const onCompleteRef = useRef(onComplete);
  completedRef.current = completed;
  loadingRef.current = loading;
  codeRef.current = code;
  verifiedDigitsRef.current = verifiedDigits;
  onCompleteRef.current = onComplete;

  const markCompleted = useCallback((digits: string) => {
    completedRef.current = true;
    verifiedDigitsRef.current = digits;
    setVerifiedDigits(digits);
    setCompleted(true);
    onCompleteRef.current?.();
  }, []);

  useEffect(() => {
    if (defaultCompleted) {
      setCompleted(true);
      completedRef.current = true;
    }
  }, [defaultCompleted]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const loadProfile = async () => {
      try {
        const res = await request<any>({
          path: "/api/users/profile",
          method: "GET",
          token,
        });
        if (!res.ok || cancelled) return;
        const body: any = res.data || {};
        const data = body.data || body;
        if (cancelled) return;
        const formatted = formatKoreanPhone(String(data?.phoneNumber || ""));
        if (formatted) setPhone(formatted);
        if (data?.phoneVerifiedAt) {
          markCompleted(normalizePhone(formatted));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [markCompleted, token]);

  const normalizedPhone = useMemo(() => normalizePhone(phone), [phone]);
  const phoneFormatError =
    phone && !normalizedPhone ? "010-0000-0000 형식으로 입력하세요." : "";
  const matchesVerified =
    Boolean(verifiedDigits) && normalizedPhone === verifiedDigits;

  const sendCode = useCallback(async () => {
    if (!token || loadingRef.current) return false;
    if (!normalizedPhone) {
      const errorMessage = phoneFormatError || "휴대전화 번호를 입력해주세요";
      setPhoneError(errorMessage);
      phoneInputRef.current?.focus();
      return false;
    }
    setSending(true);
    try {
      const res = await request<any>({
        path: "/api/users/phone-verification/send",
        method: "POST",
        token,
        jsonBody: { phoneNumber: toE164Korea(normalizedPhone) },
      });
      if (!res.ok) {
        const body: any = res.data || {};
        const message = String(
          body?.message || "인증번호 발송에 실패했습니다.",
        );
        toast({
          title: message,
          variant: "destructive",
        });
        return false;
      }
      setCode("");
      setCodeSent(true);
      setPhoneError("");
      toast({
        title: "인증번호를 발송했습니다.",
        description: "문자로 받은 번호를 입력해주세요.",
      });
      window.setTimeout(() => codeInputRef.current?.focus(), 0);
      return true;
    } catch (error: any) {
      toast({
        title: "인증번호 발송 실패",
        description: String(error?.message || "잠시 후 다시 시도해주세요."),
        variant: "destructive",
      });
      return false;
    } finally {
      setSending(false);
    }
  }, [normalizedPhone, phoneFormatError, token, toast]);

  const verifyCode = useCallback(async () => {
    if (!token || loadingRef.current) return false;
    if (
      completedRef.current &&
      verifiedDigitsRef.current &&
      verifiedDigitsRef.current === normalizedPhone
    ) {
      return true;
    }
    if (!normalizedPhone) {
      const errorMessage = phoneFormatError || "휴대전화 번호를 입력해주세요";
      setPhoneError(errorMessage);
      phoneInputRef.current?.focus();
      return false;
    }
    const nextCode = codeRef.current.trim();
    if (!/^\d{4}$/.test(nextCode)) {
      setPhoneError(
        codeSent ? "인증번호 4자리를 입력해주세요." : "인증번호를 발송해주세요.",
      );
      if (codeSent) codeInputRef.current?.focus();
      else phoneInputRef.current?.focus();
      return false;
    }
    setVerifying(true);
    try {
      const res = await request<any>({
        path: "/api/users/phone-verification/verify",
        method: "POST",
        token,
        jsonBody: { code: nextCode },
      });
      if (!res.ok) {
        const body: any = res.data || {};
        throw new Error(body?.message || "인증번호가 올바르지 않습니다.");
      }
      savePhoneDraft("");
      markCompleted(normalizedPhone);
      setCode("");
      setCodeSent(false);
      return true;
    } catch (error: any) {
      toast({
        title: "인증 실패",
        description: String(error?.message || "잠시 후 다시 시도해주세요."),
        variant: "destructive",
      });
      return false;
    } finally {
      setVerifying(false);
    }
  }, [codeSent, markCompleted, normalizedPhone, phoneFormatError, token, toast]);

  useEffect(() => {
    registerGoNextAction?.(() => verifyCode());
    return () => registerGoNextAction?.(null);
  }, [registerGoNextAction, verifyCode]);

  useEffect(() => {
    if (loading || completed) return;
    savePhoneDraft(phone);
  }, [completed, loading, phone]);

  const handlePhoneInputKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!codeSent) void sendCode();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 정보를 불러오는 중…
      </div>
    );
  }

  const busy = sending || verifying;

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="phone-input" className="text-xs text-slate-500">
          휴대전화 번호
          {(phoneError || phoneFormatError) && (
            <span className="ml-2 text-xs font-medium text-destructive">
              {phoneError || phoneFormatError}
            </span>
          )}
        </Label>
        <div className="flex gap-2">
          <Input
            id="phone-input"
            ref={phoneInputRef}
            value={phone}
            onChange={(e) => {
              const next = formatKoreanPhone(e.target.value);
              setPhone(next);
              if (phoneError) setPhoneError("");
              const nextDigits = normalizePhone(next);
              if (completed && nextDigits !== verifiedDigitsRef.current) {
                completedRef.current = false;
                setCompleted(false);
                setCodeSent(false);
                setCode("");
              }
            }}
            onKeyDown={handlePhoneInputKeyDown}
            placeholder="010-####-####"
            disabled={busy}
            className={cn(
              "placeholder:text-slate-300",
              phoneError || phoneFormatError ? "border-destructive" : "",
            )}
          />
          {!matchesVerified && (
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0"
              disabled={busy || !normalizedPhone}
              onClick={() => {
                void sendCode();
              }}
            >
              {sending ? "발송 중..." : codeSent ? "다시 발송" : "인증번호 발송"}
            </Button>
          )}
        </div>
      </div>

      {codeSent && !matchesVerified && (
        <div className="space-y-2">
          <Label htmlFor="phone-code" className="text-xs text-slate-500">
            인증번호
          </Label>
          <Input
            id="phone-code"
            ref={codeInputRef}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, "").slice(0, 4));
              if (phoneError) setPhoneError("");
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
            }}
            inputMode="numeric"
            placeholder="4자리"
            disabled={busy}
            className="placeholder:text-slate-300"
          />
        </div>
      )}

      {matchesVerified && !busy && (
        <div className="flex items-center gap-2 rounded-xl border border-primary-muted bg-primary-soft px-4 py-2 text-sm text-primary-strong">
          <Check className="h-4 w-4 shrink-0" /> 휴대폰 인증을 완료했습니다.
        </div>
      )}
    </form>
  );
};
