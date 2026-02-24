import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type PhoneDraft = {
  phone?: string;
  code?: string;
};

const readPhoneDraft = (): PhoneDraft | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PHONE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return {
        phone: typeof parsed.phone === "string" ? parsed.phone : "",
        code: typeof parsed.code === "string" ? parsed.code : "",
      };
    }
    return null;
  } catch {
    return null;
  }
};

const savePhoneDraft = (draft: PhoneDraft | null) => {
  if (typeof window === "undefined") return;
  if (!draft || (!draft.phone && !draft.code)) {
    window.localStorage.removeItem(PHONE_DRAFT_KEY);
    return;
  }
  window.localStorage.setItem(PHONE_DRAFT_KEY, JSON.stringify(draft));
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
  const draft = useMemo(() => readPhoneDraft(), []);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState(draft?.phone || "");
  const [code, setCode] = useState(draft?.code || "");
  const [phoneError, setPhoneError] = useState("");
  const [codeError, setCodeError] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [completed, setCompleted] = useState(Boolean(defaultCompleted));
  const [timeLeft, setTimeLeft] = useState(0);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const isExpired = verificationSent && !completed && timeLeft <= 0;

  const markCompleted = () => {
    if (completed) return;
    setCompleted(true);
    onComplete?.();
  };

  useEffect(() => {
    if (defaultCompleted) {
      setCompleted(true);
    }
  }, [defaultCompleted]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const loadProfile = async () => {
      setLoading(true);
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
        setPhone(formatKoreanPhone(String(data?.phoneNumber || "")));
        if (data?.phoneVerifiedAt) {
          markCompleted();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const normalizedPhone = useMemo(() => normalizePhone(phone), [phone]);
  const phoneFormatError =
    phone && !normalizedPhone ? "010-0000-0000 형식으로 입력하세요." : "";

  const sendCode = useCallback(async () => {
    if (!token) return;
    if (!normalizedPhone) {
      const errorMessage = phoneFormatError || "휴대전화 번호를 입력해주세요";
      setPhoneError(errorMessage);
      phoneInputRef.current?.focus();
      return false;
    }
    setSending(true);
    try {
      const e164Phone = toE164Korea(normalizedPhone);
      const res = await request<any>({
        path: "/api/users/phone-verification/send",
        method: "POST",
        token,
        jsonBody: { phoneNumber: e164Phone },
      });
      if (!res.ok) {
        const body: any = res.data || {};
        throw new Error(body?.message || "인증번호 발송에 실패했습니다.");
      }
      const expiresAtRaw = res.data?.data?.expiresAt;
      const nextExpiresAt = expiresAtRaw
        ? new Date(expiresAtRaw).getTime()
        : Date.now() + 3 * 60 * 1000;
      setExpiresAt(nextExpiresAt);
      setTimeLeft(Math.max(0, Math.floor((nextExpiresAt - Date.now()) / 1000)));
      toast({ title: "인증번호를 보냈어요" });
      setVerificationSent(true);
      setCode("");
      savePhoneDraft({ phone });
      return true;
    } catch (error: any) {
      toast({
        title: "발송 실패",
        description: String(error?.message || "잠시 후 다시 시도해주세요."),
        variant: "destructive",
      });
      return false;
    } finally {
      setSending(false);
    }
  }, [normalizedPhone, token, toast]);

  const verifyCode = useCallback(async () => {
    if (!token) return;
    if (!code.trim()) {
      setCodeError("인증번호를 입력하세요");
      codeInputRef.current?.focus();
      return false;
    }
    setVerifying(true);
    try {
      const res = await request<any>({
        path: "/api/users/phone-verification/verify",
        method: "POST",
        token,
        jsonBody: { code: code.trim() },
      });
      if (!res.ok) {
        const body: any = res.data || {};
        throw new Error(body?.message || "인증에 실패했습니다.");
      }
      toast({ title: "인증 완료" });
      markCompleted();
      savePhoneDraft(null);
      return true;
    } catch (error: any) {
      toast({
        title: "인증 실패",
        description: String(error?.message || "코드를 확인해주세요."),
        variant: "destructive",
      });
      return false;
    } finally {
      setVerifying(false);
    }
  }, [code, markCompleted, token, toast]);

  const handleNextAction = useCallback(async () => {
    if (completed) return true;
    if (!verificationSent) {
      await sendCode();
      return false;
    }
    if (isExpired) {
      return false;
    }
    if (!code.trim()) {
      toast({ title: "인증번호를 입력하세요", variant: "destructive" });
      return false;
    }
    return verifyCode();
  }, [
    code,
    completed,
    isExpired,
    sendCode,
    toast,
    verificationSent,
    verifyCode,
  ]);

  useEffect(() => {
    registerGoNextAction?.(() => handleNextAction());
    return () => registerGoNextAction?.(null);
  }, [handleNextAction, registerGoNextAction]);

  useEffect(() => {
    if (loading) return;
    const draftPayload: PhoneDraft = {
      phone: phone || undefined,
      code: code || undefined,
    };
    if (!draftPayload.phone && !draftPayload.code) {
      savePhoneDraft(null);
      return;
    }
    savePhoneDraft(draftPayload);
  }, [code, loading, phone]);

  useEffect(() => {
    if (!verificationSent || !expiresAt) return;

    const tick = () => {
      const next = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setTimeLeft(next);
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt, verificationSent]);

  const formatTimeLeft = (value: number) => {
    const minutes = Math.floor(value / 60);
    const seconds = value % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleNextAction();
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 정보를 불러오는 중…
      </div>
    );
  }

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
        <Input
          id="phone-input"
          ref={phoneInputRef}
          value={phone}
          onChange={(e) => {
            setPhone(formatKoreanPhone(e.target.value));
            if (phoneError) setPhoneError("");
          }}
          placeholder="010-####-####"
          className={cn(
            "placeholder:text-slate-300",
            phoneError || phoneFormatError ? "border-destructive" : "",
          )}
        />
      </div>

      {!completed && !verificationSent && (
        <Button
          type="button"
          className="w-full"
          onClick={() => {
            void sendCode();
          }}
          disabled={sending || !normalizedPhone}
        >
          {sending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            "인증번호 받기"
          )}
        </Button>
      )}

      {verificationSent && !completed && !isExpired && (
        <p className="text-xs text-slate-500">
          유효시간 {formatTimeLeft(timeLeft)}
        </p>
      )}

      {isExpired && (
        <p className="text-xs text-amber-500">
          유효시간이 만료되었습니다. 재발송이 필요합니다.
        </p>
      )}

      {verificationSent && !completed && !isExpired && (
        <div className="space-y-2">
          <Label htmlFor="phone-code" className="text-xs text-slate-500">
            인증번호
            {codeError && (
              <span className="ml-2 text-xs font-medium text-destructive">
                {codeError}
              </span>
            )}
          </Label>
          <Input
            id="phone-code"
            ref={codeInputRef}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, "").slice(0, 4));
              if (codeError) setCodeError("");
            }}
            placeholder="4자리"
            inputMode="numeric"
            maxLength={4}
            className={cn(codeError ? "border-destructive" : "")}
          />
        </div>
      )}

      {isExpired && (
        <Button
          type="button"
          className="w-full"
          onClick={() => {
            void sendCode();
          }}
          disabled={sending || !normalizedPhone}
        >
          {sending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            "인증번호 재발송"
          )}
        </Button>
      )}

      {completed && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-600">
          <Check className="h-4 w-4" /> 휴대전화 인증 완료
        </div>
      )}
    </form>
  );
};
