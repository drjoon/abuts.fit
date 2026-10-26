// related files:
// - web/frontend/src/features/landing/AbutsLabIntroSections.tsx
// - web/frontend/src/shared/events/abutsLabCampaign.ts
// - web/frontend/src/pages/public/EventApplyPage.tsx
// - web/frontend/src/shared/events/abutsLabApplyLocalDraft.ts
// - web/backend/controllers/events/marketingEvent.controller.js
import { useEffect, useLayoutEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowDown, ArrowLeft, CheckCircle2 } from "lucide-react";
import {
  PublicPageLayout,
  PUBLIC_CARD_CLASS,
} from "./components/PublicPageLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEventPageVisit } from "@/shared/events/useEventPageVisit";
import { eventsApi, type MarketingEvent } from "@/shared/events/eventsApi";
import {
  ABUTS_LAB_APPLY_FOLLOWUP,
  ABUTS_LAB_EVENT_HEADLINE,
  ABUTS_LAB_EVENT_SLUG,
  ABUTS_LAB_HERO_EYEBROW,
  ABUTS_LAB_HERO_SUB,
} from "@/shared/events/abutsLabCampaign";
import { cn } from "@/shared/ui/cn";
import { useAuthStore, type User } from "@/store/useAuthStore";
import { AbutsLabApplySection } from "@/features/landing/AbutsLabApplySection";
import { AbutsLabIntroSections } from "@/features/landing/AbutsLabIntroSections";
import { LandingSkyWash } from "@/features/landing/LandingSkyWash";
import { LandingMagnetic } from "@/features/landing/LandingMagnetic";
import { LandingParticleField } from "@/features/landing/LandingParticleField";
import { LandingScrollProgress } from "@/features/landing/LandingScrollProgress";
import { LandingSectionRail } from "@/features/landing/LandingSectionRail";

/** 치과만. 기공소·관리자·제조사·영업 계정은 신청할 수 없다. */
function isRequestorApplicant(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.requestorKind === "practice") return true;
  if (user.role === "practice") return true;
  if (user.requestorKind === "lab") return false;
  return Boolean(user.requestorCapabilities?.practice);
}

function scrollToApply() {
  document.getElementById("event-apply")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

export default function AbutsLabEventPage() {
  useEventPageVisit(ABUTS_LAB_EVENT_SLUG);
  const location = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  const requestorUser = isRequestorApplicant(user);
  const [event, setEvent] = useState<MarketingEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [alreadyApplied, setAlreadyApplied] = useState(false);
  const [applicationCheckLoading, setApplicationCheckLoading] = useState(
    () => Boolean(isAuthenticated && requestorUser),
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
              상담을 접수했습니다.
              <br />
              {ABUTS_LAB_APPLY_FOLLOWUP}
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

      <AbutsLabIntroSections onApply={scrollToApply} />

      <AbutsLabApplySection
        sectionId="event-apply"
        onCompleted={() => setDone(true)}
      />

    </PublicPageLayout>
  );
}
