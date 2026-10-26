// related files:
// - web/frontend/rules.md
// - web/frontend/src/shared/onboarding/wizard/SettingsWizard.tsx
// 문자 인증 없이 휴대전화 번호만 저장한다.
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
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(Boolean(defaultCompleted));
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const completedRef = useRef(completed);
  const loadingRef = useRef(true);
  completedRef.current = completed;
  loadingRef.current = loading;

  const markCompleted = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setCompleted(true);
    onComplete?.();
  }, [onComplete]);

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
        const formatted = formatKoreanPhone(String(data?.phoneNumber || ""));
        if (formatted) setPhone(formatted);
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
  }, [markCompleted, token]);

  const normalizedPhone = useMemo(() => normalizePhone(phone), [phone]);
  const phoneFormatError =
    phone && !normalizedPhone ? "010-0000-0000 형식으로 입력하세요." : "";

  const savePhone = useCallback(async () => {
    if (!token || loadingRef.current) return false;
    if (completedRef.current) return true;
    if (!normalizedPhone) {
      const errorMessage = phoneFormatError || "휴대전화 번호를 입력해주세요";
      setPhoneError(errorMessage);
      phoneInputRef.current?.focus();
      return false;
    }
    setSaving(true);
    try {
      const res = await request<any>({
        path: "/api/users/phone",
        method: "POST",
        token,
        jsonBody: { phoneNumber: toE164Korea(normalizedPhone) },
      });
      if (!res.ok) {
        const body: any = res.data || {};
        throw new Error(body?.message || "휴대전화 번호 저장에 실패했습니다.");
      }
      savePhoneDraft("");
      markCompleted();
      return true;
    } catch (error: any) {
      toast({
        title: "저장 실패",
        description: String(error?.message || "잠시 후 다시 시도해주세요."),
        variant: "destructive",
      });
      return false;
    } finally {
      setSaving(false);
    }
  }, [markCompleted, normalizedPhone, phoneFormatError, token, toast]);

  useEffect(() => {
    registerGoNextAction?.(() => savePhone());
    return () => registerGoNextAction?.(null);
  }, [registerGoNextAction, savePhone]);

  useEffect(() => {
    if (loading) return;
    savePhoneDraft(phone);
  }, [loading, phone]);

  const handlePhoneInputKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
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
            if (completed) {
              completedRef.current = false;
              setCompleted(false);
            }
          }}
          onKeyDown={handlePhoneInputKeyDown}
          placeholder="010-####-####"
          disabled={saving}
          className={cn(
            "placeholder:text-slate-300",
            phoneError || phoneFormatError ? "border-destructive" : "",
          )}
        />
      </div>

      {completed && !saving && (
        <div className="flex items-center gap-2 rounded-xl border border-primary-muted bg-primary-soft px-4 py-2 text-sm text-primary-strong">
          <Check className="h-4 w-4 shrink-0" /> 휴대전화 번호를 저장했습니다.
        </div>
      )}
    </form>
  );
};
