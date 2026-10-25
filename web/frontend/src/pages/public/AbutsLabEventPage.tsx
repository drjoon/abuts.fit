// related files:
// - web/frontend/src/shared/events/abutsLabCampaign.ts
// - web/frontend/src/pages/public/EventApplyPage.tsx
// - web/frontend/src/shared/events/abutsLabApplyLocalDraft.ts
// - web/backend/controllers/events/marketingEvent.controller.js
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  CheckCircle2,
  MapPin,
  Phone,
  ScanLine,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import {
  PublicPageLayout,
  PUBLIC_CARD_CLASS,
} from "./components/PublicPageLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/shared/hooks/use-toast";
import {
  readEventVisitSessionId,
  useEventPageVisit,
} from "@/shared/events/useEventPageVisit";
import {
  eventsApi,
  type EventPlaceFields,
  type EventPlaceSuggest,
  type MarketingEvent,
} from "@/shared/events/eventsApi";
import {
  ABUTS_LAB_EVENT_HEADLINE,
  ABUTS_LAB_EVENT_SLUG,
  ABUTS_LAB_HERO_EYEBROW,
  ABUTS_LAB_HERO_SUB,
  ABUTS_LAB_IMAGES,
} from "@/shared/events/abutsLabCampaign";
import EventPlaceSuggestInput from "@/shared/events/EventPlaceSuggestInput";
import {
  abutsLabApplyDraftHasContent,
  clearAbutsLabApplyLocalDraft,
  readAbutsLabApplyLocalDraft,
  writeAbutsLabApplyLocalDraft,
  type AbutsLabApplyLocalDraft,
} from "@/shared/events/abutsLabApplyLocalDraft";
import { cn } from "@/shared/ui/cn";
import { useAuthStore, type User } from "@/store/useAuthStore";
import { formatPhoneNumberInput } from "@/shared/components/business/settings/business/validations";
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

const EVENT_MEDIA_CARD_CLASS =
  "h-full overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-gradient-to-b from-white to-[#f4f7fb] p-4 sm:p-5";

/** 단차 구역. 디자인 반쪽(512×416)과 같은 칸에 사진을 맞춘다. */
const MACHINING_FRAME_CLASS =
  "relative aspect-[512/416] overflow-hidden rounded-2xl bg-[#f4f7fb]";

const CORNER_FRAME_CLASS =
  "relative aspect-[512/465] overflow-hidden rounded-2xl bg-[#f4f7fb]";

function HalfImage({
  src,
  alt,
  shift,
  framed,
}: {
  src: string;
  alt: string;
  shift?: boolean;
  /** 가공 사진과 같은 칸 크기로 맞출 때 */
  framed?: boolean;
}) {
  if (!framed) {
    return (
      <div className="overflow-hidden rounded-2xl bg-[#f4f7fb]">
        <img
          src={src}
          alt={alt}
          className={cn("w-[200%] max-w-none", shift && "-translate-x-1/2")}
        />
      </div>
    );
  }
  return (
    <div className={MACHINING_FRAME_CLASS}>
      <img
        src={src}
        alt={alt}
        className={cn(
          "absolute top-0 h-full w-[200%] max-w-none object-cover",
          shift ? "right-0 object-right" : "left-0 object-left",
        )}
      />
    </div>
  );
}

function PhotoFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <div className={MACHINING_FRAME_CLASS}>
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
    </div>
  );
}

function MediaCardTitle({ children }: { children: string }) {
  return (
    <p className="mt-4 break-keep text-center text-lg font-semibold text-slate-900">
      {children}
    </p>
  );
}

/** 치과만. 기공소·관리자·제조사·영업 계정은 신청할 수 없다. */
function isRequestorApplicant(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.requestorKind === "practice") return true;
  if (user.role === "practice") return true;
  if (user.requestorKind === "lab") return false;
  return Boolean(user.requestorCapabilities?.practice);
}

type FieldErrors = Partial<
  Record<"director" | "address" | "clinicName" | "phone" | "oral", string>
>;

function FieldErrorText({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs leading-relaxed text-red-600" role="alert">
      {message}
    </p>
  );
}

function consultFieldErrors(draft: {
  directorName: string;
  phone: string;
  addressMode: "search" | "manual";
  manualAddress: string;
  manualClinicName: string;
  place: EventPlaceSuggest | null;
  usesOralScan: boolean | null;
  /** 치과 계정 프로필로 채운 항목은 다시 받지 않는다. */
  fromProfile?: { director?: boolean; phone?: boolean; address?: boolean };
}): FieldErrors {
  const next: FieldErrors = {};
  const fromProfile = draft.fromProfile || {};
  if (fromProfile.director && fromProfile.phone && fromProfile.address) {
    if (draft.usesOralScan == null) {
      next.oral = "구강 스캐너 사용 여부를 선택해 주세요.";
    }
    return next;
  }
  if (!fromProfile.director && draft.directorName.trim().length < 2) {
    next.director = "원장님 성함을 입력해 주세요.";
  }
  if (!fromProfile.phone && !isMobilePhone(draft.phone)) {
    next.phone = "휴대폰 번호를 확인해 주세요.";
  }
  if (fromProfile.address) {
    if (draft.usesOralScan == null) {
      next.oral = "구강 스캐너 사용 여부를 선택해 주세요.";
    }
    return next;
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
  const mobile = String(pp.phone || user.phoneNumber || "").trim();
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
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("82")) digits = `0${digits.slice(2)}`;
  return digits;
}

function isMobilePhone(value: string) {
  return /^01[016789]\d{7,8}$/.test(phoneDigits(value));
}

function scrollToApply() {
  document.getElementById("event-apply")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function FieldLabel({
  htmlFor,
  icon: Icon,
  children,
}: {
  htmlFor?: string;
  icon: LucideIcon;
  children: string;
}) {
  return (
    <Label
      htmlFor={htmlFor}
      className="flex items-center gap-2 text-base text-slate-900"
    >
      <Icon className="h-4 w-4 shrink-0 text-sky-600" />
      {children}
    </Label>
  );
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
    <div className="space-y-2">
      <FieldLabel icon={ScanLine}>구강 스캐너 사용 여부</FieldLabel>
      <RadioGroup
        value={usesOralScan == null ? undefined : usesOralScan ? "yes" : "no"}
        onValueChange={(v) => onChange(v === "yes")}
        className="grid grid-cols-2 gap-2"
        disabled={disabled}
      >
        <label
          htmlFor="lab-oral-scan-yes"
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-2xl border bg-white px-3 py-2.5 transition-colors",
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
            "flex cursor-pointer items-center gap-2 rounded-2xl border bg-white px-3 py-2.5 transition-colors",
            usesOralScan === false
              ? "border-sky-300 bg-sky-50/80"
              : "border-slate-200",
          )}
        >
          <RadioGroupItem value="no" id="lab-oral-scan-no" />
          <span className="text-sm font-medium text-slate-900">사용 안 함</span>
        </label>
      </RadioGroup>
      <FieldErrorText message={error} />
    </div>
  );
}

export default function AbutsLabEventPage() {
  useEventPageVisit(ABUTS_LAB_EVENT_SLUG);
  const location = useLocation();
  const { toast } = useToast();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const userId = user?.id || null;

  const [event, setEvent] = useState<MarketingEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [alreadyApplied, setAlreadyApplied] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [applicationCheckLoading, setApplicationCheckLoading] = useState(
    () => Boolean(isAuthenticated && isRequestorApplicant(user)),
  );
  const [boundUserId, setBoundUserId] = useState<string | null>(userId);
  const [storedDraft] = useState(() => readAbutsLabApplyLocalDraft(userId));

  const [directorName, setDirectorName] = useState(
    () => storedDraft?.directorName ?? "",
  );
  const [phone, setPhone] = useState(() => storedDraft?.phone ?? "");
  const [clinicQuery, setClinicQuery] = useState(
    () => storedDraft?.clinicQuery ?? "",
  );
  const [place, setPlace] = useState<EventPlaceSuggest | null>(
    () => storedDraft?.place ?? null,
  );
  const [addressMode, setAddressMode] = useState<"search" | "manual">(
    () => storedDraft?.addressMode ?? "search",
  );
  const [manualAddress, setManualAddress] = useState(
    () => storedDraft?.manualAddress ?? "",
  );
  const [manualClinicName, setManualClinicName] = useState(
    () => storedDraft?.manualClinicName ?? "",
  );
  const [usesOralScan, setUsesOralScan] = useState<boolean | null>(
    () => storedDraft?.usesOralScan ?? null,
  );

  const requestorUser = isRequestorApplicant(user);
  const prefill = useMemo(
    () => (user && requestorUser ? practicePrefillFromUser(user) : null),
    [user, requestorUser],
  );
  const fromProfile = {
    director: Boolean(prefill && prefill.directorName.trim().length >= 2),
    phone: Boolean(prefill && isMobilePhone(prefill.applicantPhone)),
    address: Boolean(
      prefill &&
        prefill.practice.name.trim().length >= 2 &&
        prefill.practice.address.trim().length >= 5,
    ),
  };
  const profileOnlyScanner =
    fromProfile.director && fromProfile.phone && fromProfile.address;
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

  const applyStoredDraft = (draft: AbutsLabApplyLocalDraft) => {
    setDirectorName(draft.directorName);
    setPhone(draft.phone);
    setClinicQuery(draft.clinicQuery);
    setPlace(draft.place);
    setAddressMode(draft.addressMode);
    setManualAddress(draft.manualAddress);
    setManualClinicName(draft.manualClinicName);
    setUsesOralScan(draft.usesOralScan);
  };

  useEffect(() => {
    const keyed = readAbutsLabApplyLocalDraft(userId);
    const anon = userId ? readAbutsLabApplyLocalDraft(null) : null;
    const draft = abutsLabApplyDraftHasContent(keyed)
      ? keyed
      : abutsLabApplyDraftHasContent(anon)
        ? anon
        : null;
    if (userId === boundUserId) {
      if (draft && userId && !abutsLabApplyDraftHasContent(keyed)) {
        applyStoredDraft(draft);
        writeAbutsLabApplyLocalDraft(draft, userId);
        clearAbutsLabApplyLocalDraft(null);
      }
      return;
    }
    if (draft) {
      applyStoredDraft(draft);
      if (userId && !abutsLabApplyDraftHasContent(keyed)) {
        writeAbutsLabApplyLocalDraft(draft, userId);
        clearAbutsLabApplyLocalDraft(null);
      }
    }
    setBoundUserId(userId);
  }, [boundUserId, userId]);

  const skipEmptyClear = useRef(true);
  useEffect(() => {
    if (done || alreadyApplied) {
      clearAbutsLabApplyLocalDraft(userId);
      clearAbutsLabApplyLocalDraft(null);
      return;
    }
    const draft = {
      directorName,
      phone,
      clinicQuery,
      place,
      addressMode,
      manualAddress,
      manualClinicName,
      usesOralScan,
    };
    if (!abutsLabApplyDraftHasContent({ ...draft, updatedAt: 0 })) {
      if (skipEmptyClear.current) {
        skipEmptyClear.current = false;
        return;
      }
      clearAbutsLabApplyLocalDraft(userId);
      return;
    }
    skipEmptyClear.current = false;
    writeAbutsLabApplyLocalDraft(draft, userId);
  }, [
    addressMode,
    alreadyApplied,
    clinicQuery,
    directorName,
    done,
    manualAddress,
    manualClinicName,
    phone,
    place,
    userId,
    usesOralScan,
  ]);

  const prefillOnce = useRef(false);
  useEffect(() => {
    if (prefillOnce.current || !prefill) return;
    prefillOnce.current = true;
    const saved = readAbutsLabApplyLocalDraft(userId);
    const anon = userId ? readAbutsLabApplyLocalDraft(null) : null;
    if (
      abutsLabApplyDraftHasContent(saved) ||
      abutsLabApplyDraftHasContent(anon)
    ) {
      return;
    }
    if (prefill.directorName) setDirectorName(prefill.directorName);
    if (prefill.applicantPhone) {
      setPhone(formatPhoneNumberInput(prefill.applicantPhone));
    }
    if (prefill.practice.address || prefill.practice.name) {
      setClinicQuery(prefill.practice.address || prefill.practice.name);
    }
  }, [prefill, userId]);

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

    const errors = consultFieldErrors({
      directorName,
      phone,
      addressMode,
      manualAddress,
      manualClinicName,
      place,
      usesOralScan,
      fromProfile,
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({
        title: "입력 내용을 확인해 주세요",
        variant: "destructive",
      });
      return;
    }

    const manual = addressMode === "manual";
    const director = fromProfile.director
      ? prefill!.directorName.trim()
      : directorName.trim();
    const applicantPhone = fromProfile.phone
      ? prefill!.applicantPhone.trim()
      : phone.trim();
    const practice = fromProfile.address
      ? {
          name: prefill!.practice.name.trim(),
          representativeName: director,
          phone: applicantPhone,
          address: prefill!.practice.address.trim(),
          lat: null,
          lng: null,
        }
      : {
          name: manual ? manualClinicName.trim() : place!.name,
          representativeName: director,
          phone: applicantPhone,
          address: manual ? manualAddress.trim() : place!.address || "",
          lat: manual ? null : place!.lat ?? null,
          lng: manual ? null : place!.lng ?? null,
        };
    setSubmitting(true);
    try {
      await eventsApi.apply(
        event.slug,
        {
          practice,
          directorName: director,
          dealer: EMPTY_DEALER,
          applicantPhone,
          usesOralScan: usesOralScan as boolean,
          visitSessionId: readEventVisitSessionId(event.slug),
        },
        requestorUser ? token : undefined,
      );
      clearAbutsLabApplyLocalDraft(userId);
      clearAbutsLabApplyLocalDraft(null);
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
              상담을 접수했습니다. 영업 담당자가 연락드린 뒤 치과로 방문해
              안내합니다.
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
          <p className="mt-5 max-w-xl break-keep text-base leading-relaxed text-slate-600 sm:max-w-2xl sm:text-lg">
            {ABUTS_LAB_HERO_SUB}
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
            <p className="mt-4 max-w-xl break-keep text-sm leading-relaxed text-slate-600 sm:max-w-2xl sm:text-base">
              기공사 선생님이 성의껏 디자인해 주셔도, 가공하면 단차가 날 수
              있습니다. 어벗츠기공소는 자체 소프트웨어로 그 곡면을 맞춰
              매끈하게 가공합니다.
            </p>
          </LandingReveal>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <LandingReveal>
              <LandingSpotlightCard className={EVENT_MEDIA_CARD_CLASS}>
                <HalfImage
                  src={ABUTS_LAB_IMAGES.design}
                  alt="일반 기공사 디자인"
                  framed
                />
                <MediaCardTitle>일반 기공사 디자인</MediaCardTitle>
              </LandingSpotlightCard>
            </LandingReveal>
            <LandingReveal delay={90}>
              <LandingSpotlightCard className={EVENT_MEDIA_CARD_CLASS}>
                <PhotoFrame
                  src={ABUTS_LAB_IMAGES.step}
                  alt="일반 기공사 가공. 가공 후 단차가 남은 어벗먼트입니다."
                />
                <MediaCardTitle>일반 기공사 가공</MediaCardTitle>
              </LandingSpotlightCard>
            </LandingReveal>
            <LandingReveal delay={120}>
              <LandingSpotlightCard className={EVENT_MEDIA_CARD_CLASS}>
                <HalfImage
                  src={ABUTS_LAB_IMAGES.design}
                  alt="어벗츠 디자인"
                  shift
                  framed
                />
                <MediaCardTitle>어벗츠 디자인</MediaCardTitle>
              </LandingSpotlightCard>
            </LandingReveal>
            <LandingReveal delay={180}>
              <LandingSpotlightCard className={EVENT_MEDIA_CARD_CLASS}>
                <PhotoFrame
                  src={ABUTS_LAB_IMAGES.smooth}
                  alt="어벗츠 가공. 곡면 처리 후 매끈하게 가공된 어벗먼트입니다."
                />
                <MediaCardTitle>어벗츠 가공</MediaCardTitle>
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
            <p className="mt-4 max-w-xl break-keep text-sm leading-relaxed text-slate-600 sm:max-w-2xl sm:text-base">
              마진과 축면이 만나는 코너가 공구보다 작으면 그 자리는 움푹 패여
              나옵니다. 어벗츠 소프트웨어는 필레 반지름을 재서, 작으면 가공 전에
              경고합니다.
            </p>
          </LandingReveal>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <LandingReveal>
              <LandingSpotlightCard className={EVENT_MEDIA_CARD_CLASS}>
                <div className={CORNER_FRAME_CLASS}>
                  <img
                    src={ABUTS_LAB_IMAGES.fillet}
                    alt="필레 반지름 경고"
                    className="absolute top-0 right-0 h-full w-[200%] max-w-none object-cover object-right"
                  />
                </div>
                <MediaCardTitle>필레 반지름 경고</MediaCardTitle>
              </LandingSpotlightCard>
            </LandingReveal>
            <LandingReveal delay={90}>
              <LandingSpotlightCard className={EVENT_MEDIA_CARD_CLASS}>
                <div className={CORNER_FRAME_CLASS}>
                  <img
                    src={ABUTS_LAB_IMAGES.gouge}
                    alt="움푹 패인 가공. 코너가 패여 가공된 어벗먼트입니다."
                    className="absolute inset-0 h-full w-full object-cover object-center"
                  />
                </div>
                <MediaCardTitle>움푹 패인 가공</MediaCardTitle>
              </LandingSpotlightCard>
            </LandingReveal>
          </div>

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
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              임상에 맞춘 디자인
            </h2>
            <p className="mt-4 max-w-xl break-keep text-sm leading-relaxed text-slate-600 sm:max-w-2xl sm:text-base">
              수많은 커스텀 어벗 디자인을 분석했습니다.
              <br />
              정확하고 편안한 임상을 위해서는 computational design이 필요합니다.
              <br />
              단차와 코너는 어벗츠가 해결한 많은 문제 중 하나이며, 어벗츠는 이런
              문제를 계속 풀어 갑니다.
            </p>
            <p className="mt-6 break-keep text-lg font-semibold tracking-tight text-slate-900">
              어벗츠와 함께하시겠습니까?
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
            <p className="max-w-xl break-keep text-sm leading-relaxed text-slate-600">
              신청해주시면 영업 담당자가 연락드리고 찾아뵙겠습니다.
            </p>
          </LandingReveal>

          <form onSubmit={onSubmit} className="space-y-5">
            <Card className={cn(PUBLIC_CARD_CLASS, "rounded-3xl")}>
              <CardContent
                className={cn(
                  "grid items-start gap-4 py-6",
                  profileOnlyScanner ? "" : "sm:grid-cols-2",
                )}
              >
                {fromProfile.director ? null : (
                <div className="space-y-2">
                  <FieldLabel htmlFor="lab-director" icon={UserRound}>
                    원장님 성함
                  </FieldLabel>
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
                )}
                {fromProfile.phone ? null : (
                <div className="space-y-2">
                  <FieldLabel htmlFor="lab-phone" icon={Phone}>
                    휴대폰번호
                  </FieldLabel>
                  <Input
                    id="lab-phone"
                    value={phone}
                    onChange={(e) => {
                      setPhone(formatPhoneNumberInput(e.target.value));
                      clearField("phone");
                    }}
                    aria-invalid={Boolean(fieldErrors.phone)}
                    className={
                      fieldErrors.phone ? "border-red-400" : undefined
                    }
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="010-0000-0000"
                    disabled={!canApply || submitting}
                  />
                  <FieldErrorText message={fieldErrors.phone} />
                </div>
                )}
                {fromProfile.address ? null : (
                <div className="space-y-2">
                  <FieldLabel htmlFor="lab-clinic" icon={MapPin}>
                    치과명 (주소검색)
                  </FieldLabel>
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
                          fieldErrors.clinicName ? "border-red-400" : undefined
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
                          setClinicQuery(item.address || item.name);
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
              </CardContent>
            </Card>

            <Button
              type="submit"
              className="landing-btn h-12 w-full rounded-full bg-[#2563eb] text-base font-semibold hover:bg-[#1d4ed8]"
              size="lg"
              disabled={submitting || !canApply}
            >
              {!canApply
                ? "신청 마감"
                : submitting
                  ? "처리 중…"
                  : "상담 신청하기"}
            </Button>
          </form>
        </div>
      </section>
    </PublicPageLayout>
  );
}
