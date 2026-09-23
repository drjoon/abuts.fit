// related files:
// - web/frontend/src/shared/events/eventsApi.ts
// - web/frontend/src/shared/events/EventPlaceSuggestInput.tsx
// - web/frontend/src/shared/events/simplewaySampleCampaign.ts
// - web/frontend/src/shared/events/eventApplyLocalDraft.ts
// - web/frontend/src/shared/components/business/settings/business/validations.ts
// - web/frontend/src/pages/public/EventsPage.tsx
// - web/frontend/src/store/useAuthStore.ts
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  CheckCircle2,
  Gift,
  Info,
  LayoutGrid,
  Package,
  ScanLine,
  Sparkles,
  Truck,
} from "lucide-react";
import {
  PublicPageLayout,
  PUBLIC_CARD_CLASS,
} from "./components/PublicPageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/shared/hooks/use-toast";
import {
  eventsApi,
  type EventPlaceFields,
  type MarketingEvent,
} from "@/shared/events/eventsApi";
import {
  GRIBO_HERO_EYEBROW,
  SIMPLEWAY_DEALER_HELP,
  SIMPLEWAY_HERO_SUB_LINES,
  SIMPLEWAY_SAMPLE_EXTRAS,
  SIMPLEWAY_SAMPLE_KIT,
  SIMPLEWAY_SAMPLE_SLUG,
} from "@/shared/events/simplewaySampleCampaign";
import {
  clearEventApplyLocalDraft,
  emptyEventApplyDealer,
  readEventApplyLocalDraft,
  writeEventApplyLocalDraft,
} from "@/shared/events/eventApplyLocalDraft";
import { cn } from "@/shared/ui/cn";
import { useAuthStore, type User } from "@/store/useAuthStore";
import { formatPhoneNumberInput } from "@/shared/components/business/settings/business/validations";
import {
  consumePostOnboardingReturn,
  eventApplySignupHref,
  peekPostOnboardingReturn,
} from "@/shared/navigation/postOnboardingReturn";

const emptyPlace = (): EventPlaceFields => emptyEventApplyDealer();

function isPracticeApplicant(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.requestorKind === "practice") return true;
  if (user.role === "practice") return true;
  if (user.requestorKind === "lab") return false;
  return Boolean(user.requestorCapabilities?.practice);
}

function practicePrefillFromUser(user: User): {
  practice: EventPlaceFields;
  directorName: string;
  applicantPhone: string;
} {
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

function scrollToApply() {
  document.getElementById("event-apply")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function SimplewayHero({
  canApply,
  showSignupCta,
  signupHref,
}: {
  canApply: boolean;
  showSignupCta: boolean;
  signupHref: string;
}) {
  return (
    <section className="relative overflow-hidden border-b border-slate-200/80">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(56,189,248,0.18),transparent_55%),radial-gradient(ellipse_at_90%_10%,rgba(37,99,235,0.14),transparent_50%),linear-gradient(180deg,#f8fafc_0%,#eef4fb_55%,#ffffff_100%)]" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(15,23,42,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.04) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      <div className="relative mx-auto flex min-h-[72vh] max-w-5xl flex-col justify-center px-4 pb-16 pt-20 sm:px-6 sm:pb-20 sm:pt-24 lg:px-8">
        <Link
          to="/#events"
          className="mb-8 inline-flex w-fit items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          이벤트 목록
        </Link>

        <p className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both text-xs font-semibold uppercase tracking-[0.28em] text-sky-700 duration-700">
          {GRIBO_HERO_EYEBROW}
        </p>
        <h1 className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both mt-4 max-w-3xl font-semibold leading-[1.12] tracking-tight text-[#0b2a5c] duration-700 delay-100">
          <span className="block text-[clamp(0.95rem,2.2vw,1.2rem)] font-medium tracking-wide text-slate-500">
            심플웨이 신제품
          </span>
          <span className="mt-2 block text-[clamp(2.1rem,5.5vw,3.75rem)]">
            그리보(Gribo) 출시 행사
          </span>
        </h1>
        <p className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both mt-5 max-w-3xl text-base leading-relaxed text-slate-600 sm:max-w-4xl sm:text-lg duration-700 delay-200">
          {SIMPLEWAY_HERO_SUB_LINES[0]}
          <br />
          {SIMPLEWAY_HERO_SUB_LINES[1]}
        </p>

        <div className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both mt-8 flex flex-wrap items-center gap-3 duration-700 delay-300">
          {showSignupCta ? (
            canApply ? (
              <Button
                asChild
                size="lg"
                className="h-12 rounded-full bg-[#2563eb] px-7 text-base font-semibold text-white shadow-[0_12px_32px_rgba(37,99,235,0.28)] hover:bg-[#1d4ed8]"
              >
                <Link to={signupHref}>회원가입 후 신청하기</Link>
              </Button>
            ) : (
              <Button
                type="button"
                size="lg"
                className="h-12 rounded-full bg-[#2563eb] px-7 text-base font-semibold text-white"
                disabled
              >
                신청 마감
              </Button>
            )
          ) : (
            <Button
              type="button"
              size="lg"
              className="h-12 rounded-full bg-[#2563eb] px-7 text-base font-semibold text-white shadow-[0_12px_32px_rgba(37,99,235,0.28)] hover:bg-[#1d4ed8]"
              onClick={scrollToApply}
              disabled={!canApply}
            >
              {canApply ? "출시 행사 신청하기" : "신청 마감"}
              {canApply ? <ArrowDown className="ml-2 h-4 w-4" /> : null}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function KitSection() {
  return (
    <section className="border-b border-slate-100 bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
              Product lineup
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              행사에서 소개하는 제품
            </h2>
          </div>
          <Package className="hidden h-8 w-8 text-sky-500/80 sm:block" />
        </div>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SIMPLEWAY_SAMPLE_KIT.map((item, i) => (
            <li
              key={item.id}
              className={cn(
                "group relative overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-b from-white to-[#f4f7fb] p-6 transition-transform duration-500 hover:-translate-y-1",
                "animate-in fade-in slide-in-from-bottom-4 fill-mode-both",
              )}
              style={{ animationDelay: `${120 + i * 80}ms` }}
            >
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-sky-100/60 blur-2xl transition-opacity group-hover:opacity-100" />
              <div className="relative">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
                  <Gift className="h-4 w-4" />
                </span>
                <h3 className="mt-5 text-lg font-semibold text-slate-900">
                  {item.name}
                </h3>
                {item.spec ? (
                  <p className="mt-1 text-sm font-medium tabular-nums text-sky-700">
                    {item.spec}
                  </p>
                ) : null}
                <p className="mt-3 text-sm text-slate-500">{item.note}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ExtrasSection() {
  return (
    <section className="border-b border-slate-100 bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
          Also included
        </p>
        <h2 className="mt-2 max-w-xl text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          함께 소개하는 디지털 지원
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {SIMPLEWAY_SAMPLE_EXTRAS.map((extra) => (
            <article
              key={extra.id}
              className="flex gap-4 rounded-[1.75rem] border border-slate-200/90 bg-gradient-to-br from-[#0b2a5c] to-[#163a72] p-6 text-white sm:p-7"
            >
              <span className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                {extra.id === "scanbar" ? (
                  <ScanLine className="h-5 w-5" />
                ) : extra.id === "abuts-platform" ? (
                  <LayoutGrid className="h-5 w-5" />
                ) : (
                  <Sparkles className="h-5 w-5" />
                )}
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold">{extra.title}</h3>
                  <Badge className="border-0 bg-white/15 text-white hover:bg-white/20">
                    {extra.tag}
                  </Badge>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-white/80">
                  {extra.body}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function EventApplyPage() {
  const { slug = "" } = useParams();
  const location = useLocation();
  const { toast } = useToast();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [event, setEvent] = useState<MarketingEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [alreadyApplied, setAlreadyApplied] = useState(false);
  const [applicationCheckLoading, setApplicationCheckLoading] = useState(
    () => Boolean(isAuthenticated && isPracticeApplicant(user)),
  );

  const [dealer, setDealer] = useState<EventPlaceFields>(() => {
    const draft = readEventApplyLocalDraft(slug, user?._id);
    return draft?.dealer ?? emptyPlace();
  });
  /** null = 미선택(필수). 로컬 초안이 있으면 복원 */
  const [usesOralScan, setUsesOralScan] = useState<boolean | null>(() => {
    const draft = readEventApplyLocalDraft(slug, user?._id);
    return draft ? draft.usesOralScan : null;
  });

  const isSimpleway = slug === SIMPLEWAY_SAMPLE_SLUG;
  const canApply = event?.status !== "closed";
  const signupHref = eventApplySignupHref(slug);
  const practiceUser = isPracticeApplicant(user);
  const prefill = useMemo(
    () => (user && practiceUser ? practicePrefillFromUser(user) : null),
    [user, practiceUser],
  );

  useEffect(() => {
    if (!slug) return;
    const keyed = readEventApplyLocalDraft(slug, user?._id);
    const anon =
      user?._id && !keyed ? readEventApplyLocalDraft(slug, null) : null;
    const draft = keyed || anon;
    if (!draft) {
      setDealer(emptyPlace());
      setUsesOralScan(null);
      return;
    }
    setDealer(draft.dealer);
    setUsesOralScan(draft.usesOralScan);
    if (user?._id && anon) {
      writeEventApplyLocalDraft(slug, draft, user._id);
      clearEventApplyLocalDraft(slug, null);
    }
  }, [slug, user?._id]);

  useEffect(() => {
    if (!slug || done || alreadyApplied) return;
    const hasDealer =
      Boolean(dealer.name) ||
      Boolean(dealer.representativeName) ||
      Boolean(dealer.phone);
    if (usesOralScan == null && !hasDealer) {
      clearEventApplyLocalDraft(slug, user?._id);
      return;
    }
    writeEventApplyLocalDraft(
      slug,
      { usesOralScan, dealer },
      user?._id,
    );
  }, [
    alreadyApplied,
    dealer,
    done,
    slug,
    user?._id,
    usesOralScan,
  ]);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    void eventsApi
      .getPublic(slug)
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
  }, [slug]);

  useEffect(() => {
    if (!isAuthenticated || !token || !slug || !practiceUser) {
      setAlreadyApplied(false);
      setApplicationCheckLoading(false);
      return;
    }
    let cancelled = false;
    setApplicationCheckLoading(true);
    void eventsApi
      .myApplication(slug, token)
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
  }, [isAuthenticated, token, slug, practiceUser]);

  useEffect(() => {
    if (loading || applicationCheckLoading) return;
    const pending = peekPostOnboardingReturn();
    const here = `${location.pathname}${location.hash}`;
    const onboarded = Boolean(
      user?.onboardingWizardCompleted || user?.businessVerified,
    );
    if (pending && onboarded && pending === here) {
      consumePostOnboardingReturn();
    }
    if (location.hash !== "#event-apply") return;
    document.getElementById("event-apply")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [
    applicationCheckLoading,
    loading,
    location.hash,
    location.pathname,
    user?.businessVerified,
    user?.onboardingWizardCompleted,
  ]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event || submitting || !canApply || !isAuthenticated || !prefill)
      return;
    if (usesOralScan == null) {
      toast({
        title: "구강 스캔 사용 여부를 선택해 주세요",
        description: "사용함 / 사용 안 함 중 하나를 선택해야 신청할 수 있습니다.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      await eventsApi.apply(
        event.slug,
        {
          practice: prefill.practice,
          directorName: prefill.directorName,
          dealer,
          applicantPhone: prefill.applicantPhone || prefill.practice.phone,
          usesOralScan,
        },
        token,
      );
      clearEventApplyLocalDraft(event.slug, user?._id);
      if (user) {
        setUser({
          ...user,
          practiceProfile: {
            ...(user.practiceProfile || {}),
            usesOralScan,
          },
        });
      }
      setDone(true);
      setAlreadyApplied(true);
      toast({
        title: "신청이 접수되었습니다",
        description: "영업 담당자가 확인 후 방문·안내드리겠습니다.",
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

  if (loading || applicationCheckLoading) {
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

  if (error || !event) {
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
          <CardContent className="flex flex-col items-center gap-3 px-6 pb-14 pt-14 text-center">
            <CheckCircle2 className="h-11 w-11 shrink-0 text-emerald-600" />
            <h2 className="text-2xl font-semibold text-slate-900">
              신청이 완료되었습니다
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-slate-600">
              {event.title} 신청을 접수했습니다.
              <br />
              영업 담당자가 방문해 제품·사용 방법을 안내합니다.
            </p>
            <Button asChild className="mt-3 rounded-full">
              <Link to="/dashboard/practice-transfers?mode=send">
                대시보드로
              </Link>
            </Button>
          </CardContent>
        </Card>
      </PublicPageLayout>
    );
  }

  const dealerHelp =
    event.formConfig.dealerHelpText ||
    (isSimpleway ? SIMPLEWAY_DEALER_HELP : "");
  const showDealer = isSimpleway || event.formConfig.requireDealer;

  return (
    <PublicPageLayout
      plain
      navOverlay
      contentClassName="relative z-10 w-full space-y-0 px-0 pb-0 pt-0"
    >
      {isSimpleway ? (
        <>
          <SimplewayHero
            canApply={canApply}
            showSignupCta={!isAuthenticated || !practiceUser}
            signupHref={signupHref}
          />
          <KitSection />
          <ExtrasSection />
        </>
      ) : (
        <section className="mx-auto max-w-2xl space-y-4 px-4 pt-20 pb-8 sm:px-6">
          <Link
            to="/#events"
            className="inline-flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            이벤트 목록
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-[#0b2a5c] sm:text-4xl">
            {event.title}
          </h1>
          {event.summary ? (
            <p className="text-slate-600">{event.summary}</p>
          ) : null}
          {event.description ? (
            <Card className={PUBLIC_CARD_CLASS}>
              <CardContent className="whitespace-pre-line py-5 text-sm leading-relaxed text-slate-700">
                {event.description}
              </CardContent>
            </Card>
          ) : null}
        </section>
      )}

      <section
        id="event-apply"
        className="scroll-mt-24 border-t border-slate-200 bg-[#f7f9fc] py-14 sm:py-20"
      >
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <div className="mb-8 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
              Apply
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              출시 행사 신청
            </h2>
            <p className="text-sm leading-relaxed text-slate-600">
              {isAuthenticated
                ? "영업 담당자가 방문해 제품·사용 방법을 안내합니다."
                : "회원가입 후 치과 정보를 등록하면 바로 신청할 수 있습니다."}
            </p>
          </div>

          {!isAuthenticated || !practiceUser ? (
            <div className="flex justify-center py-2">
              {canApply ? (
                <Button
                  asChild
                  className="h-12 rounded-full bg-[#2563eb] px-8 text-base font-semibold hover:bg-[#1d4ed8]"
                  size="lg"
                >
                  <Link to={signupHref}>회원가입 후 신청하기</Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  className="h-12 rounded-full"
                  size="lg"
                  disabled
                >
                  신청 마감
                </Button>
              )}
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-5">
              <Card className={cn(PUBLIC_CARD_CLASS, "rounded-3xl")}>
                <CardHeader className="space-y-2">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base text-slate-900">
                    <ScanLine className="h-4 w-4 text-sky-600" />
                    구강 스캔 사용 여부
                    <Badge
                      variant="secondary"
                      className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800 ring-1 ring-sky-100"
                    >
                      필수
                    </Badge>
                  </CardTitle>
                  <div className="flex gap-2 rounded-2xl border border-sky-100 bg-sky-50/80 px-3 py-2.5 text-sm leading-relaxed text-sky-900">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                    <p>사용 중이면 스캔바도 함께 안내합니다.</p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <RadioGroup
                    value={
                      usesOralScan == null
                        ? undefined
                        : usesOralScan
                          ? "yes"
                          : "no"
                    }
                    onValueChange={(v) => setUsesOralScan(v === "yes")}
                    disabled={!canApply}
                    className="grid gap-3 sm:grid-cols-2"
                  >
                    <label
                      htmlFor="event-oral-scan-yes"
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-2xl border bg-slate-50/70 px-4 py-3.5 transition-colors",
                        usesOralScan === true
                          ? "border-sky-300 bg-sky-50/80"
                          : "border-slate-200",
                        !canApply && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <RadioGroupItem value="yes" id="event-oral-scan-yes" />
                      <span className="text-sm font-medium text-slate-900">
                        사용함
                      </span>
                    </label>
                    <label
                      htmlFor="event-oral-scan-no"
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-2xl border bg-slate-50/70 px-4 py-3.5 transition-colors",
                        usesOralScan === false
                          ? "border-sky-300 bg-sky-50/80"
                          : "border-slate-200",
                        !canApply && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <RadioGroupItem value="no" id="event-oral-scan-no" />
                      <span className="text-sm font-medium text-slate-900">
                        사용 안 함
                      </span>
                    </label>
                  </RadioGroup>
                </CardContent>
              </Card>

              {showDealer ? (
                <Card className={cn(PUBLIC_CARD_CLASS, "rounded-3xl")}>
                  <CardHeader className="space-y-2">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base text-slate-900">
                      <Truck className="h-4 w-4 text-sky-600" />
                      거래하시는 지역 재료상 입력
                      <Badge
                        variant="secondary"
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200"
                      >
                        옵션
                      </Badge>
                    </CardTitle>
                    <div className="flex gap-2 rounded-2xl border border-sky-100 bg-sky-50/80 px-3 py-2.5 text-sm leading-relaxed text-sky-900">
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                      <p>{dealerHelp}</p>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="dealerName">회사명</Label>
                        <Input
                          id="dealerName"
                          value={dealer.name}
                          onChange={(e) =>
                            setDealer((d) => ({ ...d, name: e.target.value }))
                          }
                          placeholder="재료상 상호"
                          disabled={!canApply}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="dealerRep">대표님 성함</Label>
                        <Input
                          id="dealerRep"
                          value={dealer.representativeName}
                          onChange={(e) =>
                            setDealer((d) => ({
                              ...d,
                              representativeName: e.target.value,
                            }))
                          }
                          placeholder="대표 성함"
                          disabled={!canApply}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="dealerPhone">휴대전화</Label>
                        <Input
                          id="dealerPhone"
                          value={dealer.phone}
                          onChange={(e) =>
                            setDealer((d) => ({
                              ...d,
                              phone: formatPhoneNumberInput(e.target.value),
                            }))
                          }
                          inputMode="tel"
                          autoComplete="tel"
                          placeholder="010-0000-0000"
                          disabled={!canApply}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <Button
                type="submit"
                className="h-12 w-full rounded-full bg-[#2563eb] text-base font-semibold hover:bg-[#1d4ed8]"
                size="lg"
                disabled={submitting || !canApply}
              >
                {!canApply
                  ? "신청 마감"
                  : submitting
                    ? "처리 중…"
                    : "신청하기"}
              </Button>
            </form>
          )}
        </div>
      </section>
    </PublicPageLayout>
  );
}
