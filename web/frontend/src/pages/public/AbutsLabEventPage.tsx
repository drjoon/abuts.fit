// related files:
// - web/frontend/src/shared/events/abutsLabCampaign.ts
// - web/frontend/src/pages/public/EventApplyPage.tsx
// - web/backend/controllers/events/eventInlineSignup.controller.js
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  ScanLine,
} from "lucide-react";
import {
  PublicPageLayout,
  PUBLIC_CARD_CLASS,
} from "./components/PublicPageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/shared/hooks/use-toast";
import {
  eventsApi,
  type EventPlaceFields,
  type EventPlaceSuggest,
  type MarketingEvent,
} from "@/shared/events/eventsApi";
import {
  ABUTS_LAB_EVENT_HEADLINE,
  ABUTS_LAB_EVENT_PATH,
  ABUTS_LAB_EVENT_SLUG,
  ABUTS_LAB_HERO_EYEBROW,
  ABUTS_LAB_HERO_SUB_LINES,
  ABUTS_LAB_IMAGES,
} from "@/shared/events/abutsLabCampaign";
import EventPlaceSuggestInput from "@/shared/events/EventPlaceSuggestInput";
import { apiFetch } from "@/shared/api/apiClient";
import { cn } from "@/shared/ui/cn";
import { useAuthStore, type User } from "@/store/useAuthStore";
import {
  formatPhoneNumberInput,
  isValidEmail,
} from "@/shared/components/business/settings/business/validations";
import { LandingSkyWash } from "@/features/landing/LandingSkyWash";
import { LandingMagnetic } from "@/features/landing/LandingMagnetic";
import { LandingParticleField } from "@/features/landing/LandingParticleField";
import { LandingReveal } from "@/features/landing/LandingReveal";
import { LandingScrollProgress } from "@/features/landing/LandingScrollProgress";
import { LandingSectionRail } from "@/features/landing/LandingSectionRail";
import { LandingSpotlightCard } from "@/features/landing/LandingSpotlightCard";

const EMPTY_DEALER: EventPlaceFields = {
  name: "",
  representativeName: "",
  phone: "",
  address: "",
  lat: null,
  lng: null,
};

function WideCompare({
  src,
  alt,
  left,
  right,
}: {
  src: string;
  alt: string;
  left: string;
  right: string;
}) {
  const frame =
    "overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.05)]";
  return (
    <figure>
      <div className="grid gap-4 sm:hidden">
        <div className={frame}>
          <img src={src} alt="" className="w-[200%] max-w-none" />
        </div>
        <p className="break-keep text-xs leading-snug text-slate-600">
          <span className="font-semibold text-slate-900">왼쪽</span> {left}
        </p>
        <div className={frame}>
          <img
            src={src}
            alt={alt}
            className="w-[200%] max-w-none -translate-x-1/2"
          />
        </div>
        <p className="break-keep text-xs leading-snug text-slate-600">
          <span className="font-semibold text-slate-900">오른쪽</span> {right}
        </p>
      </div>
      <div className="hidden sm:block">
        <div className={frame}>
          <img src={src} alt={alt} className="w-full" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-600">
          <p className="min-w-0 break-keep">
            <span className="font-semibold text-slate-900">왼쪽</span> {left}
          </p>
          <p className="min-w-0 break-keep">
            <span className="font-semibold text-slate-900">오른쪽</span> {right}
          </p>
        </div>
      </div>
    </figure>
  );
}

/** 의뢰자(치과·기공소). 관리자·제조사·영업 계정은 신청할 수 없다. */
function isRequestorApplicant(user: User | null | undefined): boolean {
  if (!user) return false;
  return user.role === "requestor" || user.role === "practice";
}

type FieldErrors = Partial<
  Record<
    | "email"
    | "password"
    | "director"
    | "address"
    | "clinicName"
    | "phone"
    | "oral"
    | "profile",
    string
  >
>;

function FieldErrorText({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs leading-relaxed text-red-600" role="alert">
      {message}
    </p>
  );
}

function signupFieldErrors(draft: {
  email: string;
  password: string;
  directorName: string;
  addressMode: "search" | "manual";
  manualAddress: string;
  manualClinicName: string;
  place: EventPlaceSuggest | null;
  phone: string;
  phoneVerified: boolean;
  usesOralScan: boolean | null;
}): FieldErrors {
  const next: FieldErrors = {};
  if (!draft.email.trim()) next.email = "이메일을 입력해 주세요.";
  else if (!isValidEmail(draft.email))
    next.email = "이메일 형식을 확인해 주세요.";
  if (!draft.password) next.password = "비밀번호를 입력해 주세요.";
  else if (!isStrongPassword(draft.password)) {
    next.password = "10자 이상, 특수문자 포함. $는 쓸 수 없습니다.";
  }
  if (draft.directorName.trim().length < 2) {
    next.director = "원장님 성함을 입력해 주세요.";
  }
  if (draft.addressMode === "manual") {
    if (draft.manualAddress.trim().length < 5) {
      next.address = "주소를 입력해 주세요.";
    }
    if (draft.manualClinicName.trim().length < 2) {
      next.clinicName = "치과명을 입력해 주세요.";
    }
  } else if (
    !draft.place?.name ||
    !draft.place.address ||
    draft.place.lat == null ||
    draft.place.lng == null
  ) {
    next.address = "검색 결과에서 주소를 선택해 주세요.";
  }
  if (!isMobilePhone(draft.phone)) {
    next.phone = "휴대폰 번호를 확인해 주세요.";
  } else if (!draft.phoneVerified) {
    next.phone = "휴대폰 인증을 완료해 주세요.";
  }
  if (draft.usesOralScan == null) {
    next.oral = "구강 스캐너 사용 여부를 선택해 주세요.";
  }
  return next;
}

function practicePrefillFromUser(user: User) {
  const pp = user.practiceProfile || {};
  const name = String(pp.clinicName || user.companyName || "").trim();
  const directorName = String(
    pp.directorName || pp.staffName || user.name || name || "",
  ).trim();
  const clinicPhone = String(pp.clinicPhone || "").trim();
  const mobile = String(pp.phone || "").trim();
  const address = [pp.address, pp.addressDetail]
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .join(" ");
  return {
    practice: {
      name,
      representativeName: directorName,
      phone: clinicPhone || mobile,
      address,
      lat: null,
      lng: null,
    },
    directorName,
    applicantPhone: mobile || clinicPhone,
  };
}

function phoneDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function isMobilePhone(value: string) {
  return /^01[016789]\d{7,8}$/.test(phoneDigits(value));
}

function isStrongPassword(password: string) {
  const p = String(password || "");
  if (p.length < 10) return false;
  if (p.includes("$")) return false;
  if (!/[!@#%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p)) return false;
  return true;
}

function scrollToApply() {
  document.getElementById("event-apply")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function OralScanFields({
  usesOralScan,
  onChange,
  disabled,
  error,
}: {
  usesOralScan: boolean | null;
  onChange: (value: boolean) => void;
  disabled: boolean;
  error?: string;
}) {
  return (
    <Card className={cn(PUBLIC_CARD_CLASS, "rounded-3xl")}>
      <CardHeader className="space-y-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base text-slate-900">
          <ScanLine className="h-4 w-4 text-sky-600" />
          구강 스캐너 사용 여부
          <Badge
            variant="secondary"
            className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800 ring-1 ring-sky-100"
          >
            필수
          </Badge>
        </CardTitle>
        <div className="flex gap-2 rounded-2xl border border-sky-100 bg-sky-50/80 px-3 py-2.5 text-sm leading-relaxed text-sky-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
          <p>스캔을 쓰시는 치과와 아닌 치과에 맞춰 안내합니다.</p>
        </div>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={
            usesOralScan == null ? undefined : usesOralScan ? "yes" : "no"
          }
          onValueChange={(v) => onChange(v === "yes")}
          className="grid gap-3 sm:grid-cols-2"
          disabled={disabled}
        >
          <label
            htmlFor="lab-oral-scan-yes"
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-2xl border bg-white px-4 py-3.5 transition-colors",
              usesOralScan === true
                ? "border-sky-300 bg-sky-50/80"
                : "border-slate-200",
            )}
          >
            <RadioGroupItem value="yes" id="lab-oral-scan-yes" />
            <span className="text-sm font-medium text-slate-900">사용함</span>
          </label>
          <label
            htmlFor="lab-oral-scan-no"
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-2xl border bg-white px-4 py-3.5 transition-colors",
              usesOralScan === false
                ? "border-sky-300 bg-sky-50/80"
                : "border-slate-200",
            )}
          >
            <RadioGroupItem value="no" id="lab-oral-scan-no" />
            <span className="text-sm font-medium text-slate-900">
              사용 안 함
            </span>
          </label>
        </RadioGroup>
        <FieldErrorText message={error} />
      </CardContent>
    </Card>
  );
}

export default function AbutsLabEventPage() {
  const location = useLocation();
  const { toast } = useToast();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const loginWithToken = useAuthStore((s) => s.loginWithToken);

  const [event, setEvent] = useState<MarketingEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [alreadyApplied, setAlreadyApplied] = useState(false);
  const [usesOralScan, setUsesOralScan] = useState<boolean | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [applicationCheckLoading, setApplicationCheckLoading] = useState(
    () => Boolean(isAuthenticated && isRequestorApplicant(user)),
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [directorName, setDirectorName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneSending, setPhoneSending] = useState(false);
  const [phoneVerifying, setPhoneVerifying] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [clinicQuery, setClinicQuery] = useState("");
  const [place, setPlace] = useState<EventPlaceSuggest | null>(null);
  const [addressMode, setAddressMode] = useState<"search" | "manual">("search");
  const [manualAddress, setManualAddress] = useState("");
  const [manualClinicName, setManualClinicName] = useState("");

  const requestorUser = isRequestorApplicant(user);
  const prefill = useMemo(
    () => (user && requestorUser ? practicePrefillFromUser(user) : null),
    [user, requestorUser],
  );
  const canApply = event?.status === "open";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void eventsApi
      .getPublic(ABUTS_LAB_EVENT_SLUG)
      .then((ev) => {
        if (cancelled) return;
        setEvent(ev);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setEvent(null);
        setError(
          e instanceof Error ? e.message : "이벤트를 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (done || !isAuthenticated || !token || !requestorUser) {
      if (!requestorUser) {
        setAlreadyApplied(false);
        setApplicationCheckLoading(false);
      }
      return;
    }
    let cancelled = false;
    setApplicationCheckLoading(true);
    void eventsApi
      .myApplication(ABUTS_LAB_EVENT_SLUG, token)
      .then((res) => {
        if (cancelled) return;
        setAlreadyApplied(Boolean(res.applied));
      })
      .catch(() => {
        if (!cancelled) setAlreadyApplied(false);
      })
      .finally(() => {
        if (!cancelled) setApplicationCheckLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [done, isAuthenticated, token, requestorUser]);

  useEffect(() => {
    if (loading || applicationCheckLoading) return;
    if (location.hash !== "#event-apply") return;
    document.getElementById("event-apply")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [applicationCheckLoading, loading, location.hash]);

  useLayoutEffect(() => {
    if (!done && !alreadyApplied) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [done, alreadyApplied]);

  const sendPhoneCode = async () => {
    if (!isMobilePhone(phone) || phoneSending || phoneVerified) return;
    setPhoneSending(true);
    try {
      const res = await apiFetch<{
        success?: boolean;
        message?: string;
      }>({
        path: "/api/auth/signup/phone-verification/send",
        method: "POST",
        jsonBody: { phone: phone.trim() },
      });
      const body = res.data;
      if (!res.ok || !body?.success) {
        toast({
          title: "인증번호 발송 실패",
          description: body?.message || "잠시 후 다시 시도해 주세요.",
          variant: "destructive",
        });
        return;
      }
      setPhoneCodeSent(true);
      setPhoneCode("");
      toast({ title: "인증번호를 발송했습니다" });
    } catch {
      toast({
        title: "인증번호 발송 실패",
        description: "네트워크 상태를 확인해 주세요.",
        variant: "destructive",
      });
    } finally {
      setPhoneSending(false);
    }
  };

  const verifyPhoneCode = async () => {
    const code = phoneCode.trim();
    if (code.length !== 4 || phoneVerifying || phoneVerified) return;
    setPhoneVerifying(true);
    try {
      const res = await apiFetch<{ success?: boolean; message?: string }>({
        path: "/api/auth/signup/phone-verification/verify",
        method: "POST",
        jsonBody: { phone: phone.trim(), code },
      });
      const body = res.data;
      if (!res.ok || !body?.success) {
        toast({
          title: "휴대폰 인증 실패",
          description: body?.message || "인증 코드가 일치하지 않습니다.",
          variant: "destructive",
        });
        return;
      }
      setPhoneVerified(true);
      setPhoneCode("");
      clearField("phone");
    } catch {
      toast({
        title: "휴대폰 인증 실패",
        description: "네트워크 상태를 확인해 주세요.",
        variant: "destructive",
      });
    } finally {
      setPhoneVerifying(false);
    }
  };

  const clearField = (key: keyof FieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event || submitting || !canApply) return;
    if (isAuthenticated && !requestorUser) return;

    const signingUp = !(requestorUser && prefill);
    if (requestorUser && !token) {
      toast({
        title: "로그인이 필요합니다",
        description: "다시 로그인한 뒤 신청해 주세요.",
        variant: "destructive",
      });
      return;
    }

    const errors: FieldErrors = signingUp
      ? signupFieldErrors({
          email,
          password,
          directorName,
          addressMode,
          manualAddress,
          manualClinicName,
          place,
          phone,
          phoneVerified,
          usesOralScan,
        })
      : {
          ...( !prefill?.practice.name ||
          String(prefill.directorName || "").trim().length < 2
            ? {
                profile:
                  user?.requestorKind === "lab"
                    ? "기공소명과 담당자 성함을 확인해 주세요."
                    : "치과명과 원장님 성함을 확인해 주세요.",
              }
            : {}),
          ...(usesOralScan == null
            ? { oral: "구강 스캐너 사용 여부를 선택해 주세요." }
            : {}),
        };
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({
        title: "입력 내용을 확인해 주세요",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      if (!signingUp && prefill && token) {
        await eventsApi.apply(
          event.slug,
          {
            practice: prefill.practice,
            directorName: prefill.directorName,
            dealer: EMPTY_DEALER,
            applicantPhone: prefill.applicantPhone || prefill.practice.phone,
            usesOralScan: usesOralScan as boolean,
          },
          token,
        );
      } else if (
        addressMode === "manual" ||
        (place && place.lat != null && place.lng != null)
      ) {
        const manual = addressMode === "manual";
        const signed = await eventsApi.signupApply(event.slug, {
          email: email.trim().toLowerCase(),
          password,
          directorName: directorName.trim(),
          phone: phone.trim(),
          clinicName: manual ? manualClinicName.trim() : place!.name,
          address: manual ? manualAddress.trim() : place!.address,
          lat: manual ? null : place!.lat ?? null,
          lng: manual ? null : place!.lng ?? null,
          usesOralScan: usesOralScan as boolean,
          manualAddress: manual,
        });
        if (signed.token) {
          try {
            await loginWithToken(signed.token, signed.refreshToken);
          } catch {
            // 접수는 끝났고, 방문 때 로그인하면 된다.
          }
        }
      }
      setDone(true);
      setAlreadyApplied(true);
      toast({
        title: "신청이 접수되었습니다",
        description: "영업 담당자가 방문해 안내합니다.",
      });
    } catch (err) {
      toast({
        title: "신청 실패",
        description:
          err instanceof Error ? err.message : "잠시 후 다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!done && (loading || applicationCheckLoading)) {
    return (
      <PublicPageLayout
        plain
        contentClassName="relative z-10 mx-auto w-full max-w-3xl space-y-4 px-4 pt-24 pb-16 sm:px-6"
      >
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-56 w-full rounded-3xl" />
        <Skeleton className="h-40 w-full rounded-3xl" />
      </PublicPageLayout>
    );
  }

  if (error || !event || event.status === "draft") {
    return (
      <PublicPageLayout
        plain
        contentClassName="relative z-10 mx-auto w-full max-w-2xl px-4 pt-24 pb-16 sm:px-6"
      >
        <Card className={PUBLIC_CARD_CLASS}>
          <CardContent className="space-y-3 py-10 text-center">
            <p className="text-sm text-slate-600">
              {error || "이벤트를 찾을 수 없습니다."}
            </p>
            <Button asChild variant="outline">
              <Link to="/#events">목록으로</Link>
            </Button>
          </CardContent>
        </Card>
      </PublicPageLayout>
    );
  }

  if (done || alreadyApplied) {
    return (
      <PublicPageLayout
        plain
        contentClassName="relative z-10 mx-auto w-full max-w-2xl px-4 pb-16 pt-28 sm:px-6 sm:pt-32"
      >
        <Card className={cn(PUBLIC_CARD_CLASS, "rounded-3xl")}>
          <CardContent className="flex flex-col items-center gap-3 px-5 pb-12 pt-12 text-center sm:px-6 sm:pb-14 sm:pt-14">
            <CheckCircle2 className="h-11 w-11 shrink-0 text-emerald-600" />
            <h2 className="text-2xl font-semibold text-slate-900">
              신청이 완료되었습니다
            </h2>
            <p className="max-w-md break-keep text-sm leading-relaxed text-slate-600">
              {ABUTS_LAB_EVENT_HEADLINE} 상담을 접수했습니다.
              <br />
              영업 담당자가 곧 연락드리고 방문하겠습니다.
            </p>
            <Button asChild className="mt-3 rounded-full">
              <Link to="/">홈으로</Link>
            </Button>
          </CardContent>
        </Card>
      </PublicPageLayout>
    );
  }

  return (
    <PublicPageLayout
      plain
      navOverlay
      footerSurface="sky"
      contentClassName="relative z-10 w-full space-y-0 px-0 pb-0 pt-0"
    >
      <LandingScrollProgress />
      <LandingSectionRail />
      <section
        data-rail-label="시작"
        className="relative overflow-hidden border-b border-slate-200/80"
      >
        <LandingSkyWash />
        <LandingParticleField tone="onLight" />
        <div className="relative z-10 mx-auto flex min-h-[64vh] max-w-5xl flex-col justify-center px-4 pb-14 pt-20 sm:min-h-[72vh] sm:px-6 sm:pb-20 sm:pt-24 lg:px-8">
          <Link
            to="/#events"
            className="mb-8 inline-flex w-fit items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            이벤트 목록
          </Link>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">
            {ABUTS_LAB_HERO_EYEBROW}
          </p>
          <h1 className="mt-4 max-w-3xl break-keep font-semibold leading-[1.12] tracking-tight text-[#0b2a5c]">
            <span className="block text-[clamp(2.1rem,5.5vw,3.75rem)]">
              {ABUTS_LAB_EVENT_HEADLINE}
            </span>
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg">
            {ABUTS_LAB_HERO_SUB_LINES[0]}
            <br />
            {ABUTS_LAB_HERO_SUB_LINES[1]}
          </p>
          <div className="mt-8 w-full sm:w-auto">
            <LandingMagnetic>
              <Button
                type="button"
                size="lg"
                className="landing-btn h-12 w-full rounded-full bg-[#2563eb] px-7 text-base font-semibold text-white shadow-[0_12px_32px_rgba(37,99,235,0.28)] hover:bg-[#1d4ed8] sm:w-auto"
                onClick={scrollToApply}
                disabled={!canApply}
              >
                {canApply ? "상담 신청하기" : "신청 마감"}
                {canApply ? <ArrowDown className="ml-2 h-4 w-4" /> : null}
              </Button>
            </LandingMagnetic>
          </div>
        </div>
      </section>

      <section
        data-rail-label="가공"
        className="border-b border-slate-100 bg-white py-16 sm:py-20"
      >
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <LandingReveal>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
              Machining
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              단차가 나는 곡면
            </h2>
            <p className="mt-4 max-w-3xl break-keep text-sm leading-relaxed text-slate-600 sm:text-base">
              기공사 선생님이 성의껏 예쁘게 디자인해 주셔도, 가공하면 단차가 날
              수 있습니다.
              <br />
              어벗츠기공소는 자체 개발한 소프트웨어로 그 문제를 해결합니다.
            </p>
          </LandingReveal>

          <LandingReveal className="mt-10">
            <WideCompare
              src={ABUTS_LAB_IMAGES.design}
              alt="기공사 디자인과 어벗츠가 곡면을 맞춘 디자인. 왼쪽은 기공사 디자인이고, 오른쪽은 소프트웨어로 맞춘 디자인입니다."
              left="기공사 디자인"
              right="어벗츠가 맞춘 곡면"
            />
          </LandingReveal>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <LandingReveal>
              <LandingSpotlightCard className="h-full overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-gradient-to-b from-white to-[#f4f7fb] p-4 sm:p-5">
                <div className="overflow-hidden rounded-2xl bg-[#f4f7fb]">
                  <img
                    src={ABUTS_LAB_IMAGES.step}
                    alt="가공 후 단차가 남은 어벗먼트. 표시된 홈이 단차입니다."
                    className="h-56 w-full object-contain sm:h-72 md:h-80"
                  />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">
                  일반 가공
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  단차가 남을 수 있습니다.
                </p>
              </LandingSpotlightCard>
            </LandingReveal>
            <LandingReveal delay={90}>
              <LandingSpotlightCard className="h-full overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-gradient-to-b from-white to-[#f4f7fb] p-4 sm:p-5">
                <div className="overflow-hidden rounded-2xl bg-[#eef2f4]">
                  <img
                    src={ABUTS_LAB_IMAGES.smooth}
                    alt="곡면 처리 후 매끈하게 가공된 어벗먼트"
                    className="h-56 w-full object-contain sm:h-72 md:h-80"
                  />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">
                  어벗츠 가공
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  매끈하게 가공됩니다.
                </p>
              </LandingSpotlightCard>
            </LandingReveal>
          </div>
        </div>
      </section>

      <section
        data-rail-label="코너"
        className="border-b border-slate-100 bg-[#f7f9fc] py-16 sm:py-20"
      >
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <LandingReveal>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
              Corner
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              공구보다 작은 코너
            </h2>
            <p className="mt-4 max-w-3xl break-keep text-sm leading-relaxed text-slate-600 sm:text-base">
              마진과 축면이 만나는 코너의 필레 반지름이 공구보다 작으면, 그
              자리는 움푹 패여 가공됩니다.
              <br />
              어벗츠 소프트웨어는 이 반지름을 재고, 작으면 경고합니다.
            </p>
          </LandingReveal>

          <LandingReveal className="mt-10">
            <WideCompare
              src={ABUTS_LAB_IMAGES.fillet}
              alt="마진·축면 코너. 왼쪽은 받은 디자인이고, 오른쪽은 필레 반지름이 공구보다 작아 경고가 표시된 화면입니다."
              left="받은 디자인"
              right="필레 반지름 경고"
            />
          </LandingReveal>

        </div>
      </section>

      <section
        data-rail-label="함께"
        className="border-b border-sky-100 bg-[#eef6ff] py-16 sm:py-20"
      >
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <LandingReveal>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
              Design
            </p>
            <h2 className="mt-2 max-w-3xl text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              정확한 임상을 위한 디자인
            </h2>
            <p className="mt-4 max-w-3xl break-keep text-sm leading-relaxed text-slate-600 sm:text-base">
              수많은 커스텀 어벗 디자인을 분석했습니다.
              <br />
              정확하고 편안한 임상을 위해서는 computational design이 필요합니다.
              <br />
              앞의 단차와 코너는 예시일 뿐입니다.
              <br />
              어벗츠는 수많은 디자인 문제를 해결해 왔고, 앞으로도 그럴 것입니다.
            </p>
            <p className="mt-6 max-w-3xl break-keep text-lg font-semibold tracking-tight text-slate-900">
              어벗츠기공소와 함께하시겠습니까?
            </p>
            <div className="mt-6 w-full sm:w-auto">
              <LandingMagnetic>
                <Button
                  type="button"
                  size="lg"
                  className="landing-btn h-12 w-full rounded-full bg-[#2563eb] px-7 text-base font-semibold text-white shadow-[0_12px_32px_rgba(37,99,235,0.28)] hover:bg-[#1d4ed8] sm:w-auto"
                  onClick={scrollToApply}
                >
                  상담 신청하기
                  <ArrowDown className="ml-2 h-4 w-4" />
                </Button>
              </LandingMagnetic>
            </div>
          </LandingReveal>
        </div>
      </section>

      <section
        id="event-apply"
        data-rail-label="신청"
        className="scroll-mt-24 border-t border-slate-200 bg-white py-14 sm:py-20"
      >
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <LandingReveal className="mb-8 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
              Apply
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              상담 신청
            </h2>
            <p className="break-keep text-sm leading-relaxed text-slate-600">
              {isAuthenticated && !requestorUser ? (
                "의뢰자(치과, 기공소)만 신청할 수 있습니다."
              ) : requestorUser ? (
                <>
                  상담을 신청하면 영업 담당자가 치과를 방문합니다.
                  <br />
                  곡면 가공을 설명하고, 어벗츠를 부담 없이 시작하실 수 있게
                  안내합니다.
                </>
              ) : (
                <>
                  회원가입 후 상담을 신청하면 영업 담당자가 치과를 방문합니다.
                  <br />
                  곡면 가공을 설명하고, 어벗츠를 부담 없이 시작하실 수 있게
                  안내합니다.
                </>
              )}
            </p>
          </LandingReveal>

          {isAuthenticated && !requestorUser ? null : !isAuthenticated ? (
            <div className="mb-5 rounded-3xl border border-sky-200 bg-sky-50 p-4 sm:p-5">
              <Button
                asChild
                className="landing-btn h-12 w-full rounded-full bg-[#2563eb] text-base font-semibold hover:bg-[#1d4ed8]"
                size="lg"
              >
                <Link
                  to={`/login?next=${encodeURIComponent(ABUTS_LAB_EVENT_PATH)}`}
                >
                  로그인 후 신청하기
                </Link>
              </Button>
            </div>
          ) : null}

          {isAuthenticated && !requestorUser ? null : (
          <form onSubmit={onSubmit} className="space-y-5">
            {requestorUser && prefill ? (
              <FieldErrorText message={fieldErrors.profile} />
            ) : (
              <Card className={cn(PUBLIC_CARD_CLASS, "rounded-3xl")}>
                <CardContent className="space-y-4 py-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="lab-email">이메일</Label>
                      <Input
                        id="lab-email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          clearField("email");
                        }}
                        placeholder="name@clinic.com"
                        disabled={!canApply || submitting}
                        aria-invalid={Boolean(fieldErrors.email)}
                        className={fieldErrors.email ? "border-red-400" : undefined}
                      />
                      <FieldErrorText message={fieldErrors.email} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lab-password">비밀번호</Label>
                      <div className="relative">
                        <Input
                          id="lab-password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            clearField("password");
                          }}
                          disabled={!canApply || submitting}
                          aria-invalid={Boolean(fieldErrors.password)}
                          className={
                            fieldErrors.password
                              ? "border-red-400 pr-10"
                              : "pr-10"
                          }
                        />
                        <button
                          type="button"
                          aria-label={
                            showPassword ? "비밀번호 숨기기" : "비밀번호 보기"
                          }
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-40"
                          onClick={() => setShowPassword((prev) => !prev)}
                          disabled={!canApply || submitting}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-slate-500">
                        10자 이상, 특수문자 포함. $는 쓸 수 없습니다.
                      </p>
                      <FieldErrorText message={fieldErrors.password} />
                    </div>
                  </div>
                  <div className="grid items-start gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="lab-director">원장님 성함</Label>
                      <Input
                        id="lab-director"
                        value={directorName}
                        onChange={(e) => {
                          setDirectorName(e.target.value);
                          clearField("director");
                        }}
                        autoComplete="name"
                        disabled={!canApply || submitting}
                        aria-invalid={Boolean(fieldErrors.director)}
                        className={
                          fieldErrors.director ? "border-red-400" : undefined
                        }
                      />
                      <FieldErrorText message={fieldErrors.director} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lab-clinic">치과주소</Label>
                      {addressMode === "manual" ? (
                        <>
                          <Input
                            id="lab-clinic"
                            value={manualAddress}
                            onChange={(e) => {
                              setManualAddress(e.target.value);
                              clearField("address");
                            }}
                            autoComplete="street-address"
                            placeholder="도로명 주소"
                            disabled={!canApply || submitting}
                            aria-invalid={Boolean(fieldErrors.address)}
                            className={
                              fieldErrors.address ? "border-red-400" : undefined
                            }
                          />
                          <FieldErrorText message={fieldErrors.address} />
                          <Label htmlFor="lab-clinic-name">치과명</Label>
                          <Input
                            id="lab-clinic-name"
                            value={manualClinicName}
                            onChange={(e) => {
                              setManualClinicName(e.target.value);
                              clearField("clinicName");
                            }}
                            placeholder="치과명"
                            disabled={!canApply || submitting}
                            aria-invalid={Boolean(fieldErrors.clinicName)}
                            className={
                              fieldErrors.clinicName
                                ? "border-red-400"
                                : undefined
                            }
                          />
                          <FieldErrorText message={fieldErrors.clinicName} />
                          <p className="text-xs leading-relaxed text-slate-500">
                            검색 결과가 없어 직접 입력합니다.
                            <br />
                            <button
                              type="button"
                              className="font-medium text-sky-700 hover:text-sky-800"
                              onClick={() => {
                                setAddressMode("search");
                                setClinicQuery("");
                                setManualAddress("");
                                setManualClinicName("");
                                setPlace(null);
                              }}
                            >
                              다시 검색
                            </button>
                          </p>
                        </>
                      ) : (
                        <>
                          <EventPlaceSuggestInput
                            id="lab-clinic"
                            value={clinicQuery}
                            onChange={(value) => {
                              setClinicQuery(value);
                              clearField("address");
                              setPlace((prev) =>
                                prev &&
                                (prev.address === value || prev.name === value)
                                  ? prev
                                  : null,
                              );
                            }}
                            onPick={(item) => {
                              if (
                                !item.address ||
                                item.lat == null ||
                                item.lng == null
                              ) {
                                setPlace(null);
                                setAddressMode("manual");
                                setManualAddress(item.address || clinicQuery);
                                setManualClinicName(item.name || "");
                                return;
                              }
                              setAddressMode("search");
                              setPlace(item);
                            }}
                            pickValue={(item) => item.address || item.name}
                            onManual={(query) => {
                              setAddressMode("manual");
                              setPlace(null);
                              setManualAddress(query);
                              setManualClinicName("");
                            }}
                            kind="practice"
                            inputClassName={
                              fieldErrors.address ? "border-red-400" : undefined
                            }
                            placeholder="주소 또는 치과명 검색"
                            listMode="inline"
                            emptyText="검색 결과가 없습니다."
                          />
                          {fieldErrors.address ? (
                            <FieldErrorText message={fieldErrors.address} />
                          ) : (
                            <p className="text-xs leading-relaxed text-slate-500">
                              {place?.address
                                ? place.name
                                : "검색 결과에서 주소를 선택해 주세요."}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="lab-phone">휴대폰번호</Label>
                      <div className="flex gap-2">
                        <Input
                          id="lab-phone"
                          value={phone}
                          onChange={(e) => {
                            setPhone(formatPhoneNumberInput(e.target.value));
                            setPhoneVerified(false);
                            setPhoneCodeSent(false);
                            setPhoneCode("");
                            clearField("phone");
                          }}
                          aria-invalid={Boolean(fieldErrors.phone)}
                          className={
                            fieldErrors.phone
                              ? "min-w-0 flex-1 border-red-400"
                              : "min-w-0 flex-1"
                          }
                          inputMode="tel"
                          autoComplete="tel"
                          placeholder="010-0000-0000"
                          disabled={!canApply || submitting || phoneVerified}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="shrink-0 rounded-full"
                          disabled={
                            !canApply ||
                            submitting ||
                            phoneVerified ||
                            phoneSending ||
                            !isMobilePhone(phone)
                          }
                          onClick={() => void sendPhoneCode()}
                        >
                          {phoneVerified
                            ? "인증됨"
                            : phoneSending
                              ? "발송 중…"
                              : "발송"}
                          </Button>
                      </div>
                      <FieldErrorText message={fieldErrors.phone} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lab-phone-code">인증번호</Label>
                      <div className="flex gap-2">
                        <Input
                          id="lab-phone-code"
                          className="min-w-0 flex-1"
                          value={phoneCode}
                          onChange={(e) =>
                            setPhoneCode(
                              e.target.value.replace(/\D/g, "").slice(0, 4),
                            )
                          }
                          inputMode="numeric"
                          placeholder="4자리"
                          disabled={
                            !canApply ||
                            submitting ||
                            phoneVerified ||
                            !phoneCodeSent
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="shrink-0 rounded-full"
                          disabled={
                            phoneVerified ||
                            !phoneCodeSent ||
                            phoneCode.length !== 4 ||
                            phoneVerifying ||
                            submitting
                          }
                          onClick={() => void verifyPhoneCode()}
                        >
                          {phoneVerified
                            ? "인증됨"
                            : phoneVerifying
                              ? "확인 중…"
                              : "확인"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <OralScanFields
              usesOralScan={usesOralScan}
              onChange={(value) => {
                setUsesOralScan(value);
                clearField("oral");
              }}
              disabled={!canApply || submitting}
              error={fieldErrors.oral}
            />

            <Button
              type="submit"
              className="landing-btn h-12 w-full rounded-full bg-[#2563eb] text-base font-semibold hover:bg-[#1d4ed8]"
              size="lg"
              disabled={submitting || !canApply || usesOralScan == null}
            >
              {!canApply
                ? "신청 마감"
                : submitting
                  ? "처리 중…"
                  : requestorUser
                    ? "상담 신청하기"
                    : "가입하고 상담 신청"}
            </Button>
          </form>
          )}
        </div>
      </section>
    </PublicPageLayout>
  );
}
