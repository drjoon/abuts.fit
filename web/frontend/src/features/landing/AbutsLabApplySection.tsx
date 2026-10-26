// related files:
// - web/frontend/src/pages/public/AbutsLabEventPage.tsx
// - web/frontend/src/features/landing/LandingOfferPage.tsx
// - web/frontend/src/shared/events/abutsLabApplyLocalDraft.ts
//
// 어벗츠기공소 상담 신청. `/events/abuts-lab` 와 `/offer/lab` 이 같이 쓴다.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  MapPin,
  Phone,
  ScanLine,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { PUBLIC_CARD_CLASS } from "@/pages/public/components/PublicPageLayout";
import { useToast } from "@/shared/hooks/use-toast";
import { readEventVisitSessionId } from "@/shared/events/useEventPageVisit";
import {
  eventsApi,
  type EventPlaceFields,
  type EventPlaceSuggest,
  type MarketingEvent,
} from "@/shared/events/eventsApi";
import {
  ABUTS_LAB_APPLY_FOLLOWUP,
  ABUTS_LAB_EVENT_SLUG,
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
import { LandingReveal } from "./LandingReveal";

const EMPTY_DEALER: EventPlaceFields = {
  name: "",
  representativeName: "",
  phone: "",
  address: "",
  lat: null,
  lng: null,
};

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
  skipClinicName?: boolean;
  contactOnly?: boolean;
  fromProfile?: { director?: boolean; phone?: boolean; address?: boolean };
}): FieldErrors {
  const next: FieldErrors = {};
  const fromProfile = draft.fromProfile || {};
  const skipClinicName = Boolean(draft.skipClinicName);
  if (!fromProfile.director && draft.directorName.trim().length < 2) {
    next.director = "성함을 입력해 주세요.";
  }
  if (!fromProfile.phone && !isMobilePhone(draft.phone)) {
    next.phone = "휴대폰 번호를 확인해 주세요.";
  }
  if (draft.contactOnly) return next;
  if (fromProfile.director && fromProfile.phone && fromProfile.address) {
    if (draft.usesOralScan == null) {
      next.oral = "구강 스캐너 사용 여부를 선택해 주세요.";
    }
    return next;
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
    if (!skipClinicName && draft.manualClinicName.trim().length < 2) {
      next.clinicName = "치과명을 입력해 주세요.";
    }
  } else if (
    (!skipClinicName && !draft.place?.name) ||
    !draft.place?.address ||
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
  const name = String(user.companyName || "").trim();
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

const APPLY_LEAD_CLINIC =
  "구강 스캐너 사용 여부 체크와 함께 상담 신청하시면 빠른 시일 내로 연락드리겠습니다.";
const APPLY_LEAD_CONTACT =
  "상담 신청하시면 빠른 시일 내로 연락드리겠습니다.";

function ApplyLead({
  practiceMember,
  businessName,
  directorName,
}: {
  practiceMember: boolean;
  businessName: string;
  directorName: string;
}) {
  const who = [businessName, directorName].filter(Boolean).join(" ");
  return (
    <p className="max-w-xl break-keep text-sm leading-relaxed text-slate-600">
      {practiceMember && who ? (
        <>
          {who} 원장님,
          <br />
        </>
      ) : null}
      {practiceMember ? APPLY_LEAD_CLINIC : APPLY_LEAD_CONTACT}
    </p>
  );
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
  idPrefix,
}: {
  usesOralScan: boolean | null;
  onChange: (value: boolean) => void;
  disabled: boolean;
  error?: string;
  idPrefix: string;
}) {
  const yesId = `${idPrefix}-oral-yes`;
  const noId = `${idPrefix}-oral-no`;
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
          htmlFor={yesId}
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-2xl border bg-white px-3 py-2.5 transition-colors",
            usesOralScan === true
              ? "border-sky-300 bg-sky-50/80"
              : "border-slate-200",
          )}
        >
          <RadioGroupItem value="yes" id={yesId} />
          <span className="text-sm font-medium text-slate-900">사용함</span>
        </label>
        <label
          htmlFor={noId}
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-2xl border bg-white px-3 py-2.5 transition-colors",
            usesOralScan === false
              ? "border-sky-300 bg-sky-50/80"
              : "border-slate-200",
          )}
        >
          <RadioGroupItem value="no" id={noId} />
          <span className="text-sm font-medium text-slate-900">사용 안 함</span>
        </label>
      </RadioGroup>
      <FieldErrorText message={error} />
    </div>
  );
}

function ApplySuccess() {
  return (
    <Card className={cn(PUBLIC_CARD_CLASS, "rounded-3xl")}>
      <CardContent className="flex flex-col items-center gap-3 px-5 pb-12 pt-12 text-center sm:px-6 sm:pb-14 sm:pt-14">
        <CheckCircle2 className="h-11 w-11 shrink-0 text-emerald-600" />
        <h2 className="text-2xl font-semibold text-slate-900">
          신청이 완료되었습니다
        </h2>
        <p className="max-w-md break-keep text-sm leading-relaxed text-slate-600">
          상담을 접수했습니다.
          <br />
          {ABUTS_LAB_APPLY_FOLLOWUP}
        </p>
        <Button asChild className="mt-3 rounded-full">
          <Link to="/">홈으로</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function AbutsLabApplySection({
  sectionId,
  onCompleted,
}: {
  sectionId: string;
  /** 접수 후 페이지가 완료 화면으로 바꿀 때. */
  onCompleted?: () => void;
}) {
  const { toast } = useToast();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const userId = user?.id || null;
  const fieldPrefix = sectionId.replace(/[^a-z0-9-]/gi, "") || "lab-apply";

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
  const [accountBusiness, setAccountBusiness] = useState({
    name: "",
    address: "",
  });
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
  const contactOnly = !requestorUser;
  const prefill = useMemo(
    () => (user && requestorUser ? practicePrefillFromUser(user) : null),
    [user, requestorUser],
  );
  const accountName = (
    accountBusiness.name ||
    prefill?.practice.name ||
    ""
  ).trim();
  const accountAddress = (
    prefill?.practice.address ||
    accountBusiness.address ||
    ""
  ).trim();
  const fromProfile = {
    director: Boolean(prefill && prefill.directorName.trim().length >= 2),
    phone: Boolean(prefill && isMobilePhone(prefill.applicantPhone)),
    address: Boolean(requestorUser && accountAddress.length >= 5),
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
        setAccountBusiness({
          name: String(res.businessName || "").trim(),
          address: String(res.businessAddress || "").trim(),
        });
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
    if (prefill.practice.address) {
      setClinicQuery(prefill.practice.address);
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

  const onSubmit = async (e: FormEvent) => {
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
      skipClinicName: requestorUser,
      contactOnly,
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
    const practice = contactOnly
      ? {
          name: "",
          representativeName: director,
          phone: applicantPhone,
          address: "",
          lat: null,
          lng: null,
        }
      : fromProfile.address
        ? {
            name: accountName,
            representativeName: director,
            phone: applicantPhone,
            address: accountAddress,
            lat: null,
            lng: null,
          }
        : {
            name: requestorUser
              ? accountName
              : manual
                ? manualClinicName.trim()
                : place!.name,
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
          ...(contactOnly ? {} : { usesOralScan: usesOralScan as boolean }),
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
        description: ABUTS_LAB_APPLY_FOLLOWUP,
      });
      onCompleted?.();
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

  const busy = !done && (loading || applicationCheckLoading);
  const blocked = Boolean(error || !event || event.status === "draft");

  return (
    <section
      id={sectionId}
      data-rail-label="신청"
      className="scroll-mt-24 border-t border-slate-200 bg-white py-14 sm:py-20"
    >
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        {busy ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-56 w-full rounded-3xl" />
          </div>
        ) : blocked ? (
          <p className="text-sm text-slate-600">
            {error || "상담 신청을 불러오지 못했습니다."}
          </p>
        ) : done || alreadyApplied ? (
          <ApplySuccess />
        ) : (
          <>
            <LandingReveal className="mb-8 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
                Apply
              </p>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                상담 신청
              </h2>
              <ApplyLead
                practiceMember={requestorUser}
                businessName={accountName}
                directorName={prefill?.directorName || ""}
              />
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
                      <FieldLabel
                        htmlFor={`${fieldPrefix}-director`}
                        icon={UserRound}
                      >
                        성함
                      </FieldLabel>
                      <Input
                        id={`${fieldPrefix}-director`}
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
                      <FieldLabel
                        htmlFor={`${fieldPrefix}-phone`}
                        icon={Phone}
                      >
                        휴대폰번호
                      </FieldLabel>
                      <Input
                        id={`${fieldPrefix}-phone`}
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
                  {contactOnly || fromProfile.address ? null : (
                    <div className="space-y-2">
                      <FieldLabel
                        htmlFor={`${fieldPrefix}-clinic`}
                        icon={MapPin}
                      >
                        {requestorUser ? "주소" : "치과명 (주소검색)"}
                      </FieldLabel>
                      {addressMode === "manual" ? (
                        <>
                          <Input
                            id={`${fieldPrefix}-clinic`}
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
                          {requestorUser ? null : (
                            <>
                              <Label htmlFor={`${fieldPrefix}-clinic-name`}>
                                치과명
                              </Label>
                              <Input
                                id={`${fieldPrefix}-clinic-name`}
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
                              <FieldErrorText
                                message={fieldErrors.clinicName}
                              />
                            </>
                          )}
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
                            id={`${fieldPrefix}-clinic`}
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
                            placeholder={
                              requestorUser
                                ? "주소 검색"
                                : "주소 또는 치과명 검색"
                            }
                            listMode="inline"
                            emptyText="검색 결과가 없습니다."
                          />
                          {fieldErrors.address ? (
                            <FieldErrorText message={fieldErrors.address} />
                          ) : (
                            <p className="text-xs leading-relaxed text-slate-500">
                              {place?.address
                                ? requestorUser
                                  ? "선택한 주소로 신청합니다."
                                  : place.name
                                : "검색 결과에서 주소를 선택해 주세요."}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  {contactOnly ? null : (
                    <OralScanFields
                      idPrefix={fieldPrefix}
                      usesOralScan={usesOralScan}
                      onChange={(value) => {
                        setUsesOralScan(value);
                        clearField("oral");
                      }}
                      disabled={!canApply || submitting}
                      error={fieldErrors.oral}
                    />
                  )}
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
          </>
        )}
      </div>
    </section>
  );
}
