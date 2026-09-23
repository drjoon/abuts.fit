// related files:
// - web/frontend/src/shared/events/eventsApi.ts
// - web/frontend/src/pages/public/EventApplyPage.tsx
// - web/frontend/src/App.tsx
// - web/frontend/src/features/landing/landingTheme.ts
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronRight } from "lucide-react";
import { PublicPageLayout } from "./components/PublicPageLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { eventsApi, type MarketingEvent } from "@/shared/events/eventsApi";
import { SIMPLEWAY_SAMPLE_SLUG } from "@/shared/events/simplewaySampleCampaign";
import { LANDING_SIMPLE_WAY_STILL } from "@/features/landing/landingAssets";
import {
  landingContent,
  landingSectionY,
} from "@/features/landing/landingTheme";
import { cn } from "@/shared/ui/cn";

const EVENTS_HERO = {
  eyebrow: "이벤트",
  title: "직접 만져보고 신청하세요.",
  line: "출시 행사와 제품 소개.",
  body: [
    "신청해 주시면 영업 담당자가 치과를 방문합니다.",
    "제품과 사용 방법을 자리에서 안내해 드립니다.",
    "진행 중인 행사는 아래에서 고르면 됩니다.",
  ],
} as const;

export default function EventsPage() {
  const [items, setItems] = useState<MarketingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void eventsApi
      .listPublic()
      .then((res) => {
        if (cancelled) return;
        setItems(res.items || []);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PublicPageLayout
      tone="light"
      plain
      contentClassName="relative z-10 w-full max-w-none px-0 py-0"
    >
      <div className="bg-white text-slate-900">
        <div className="h-14 bg-white sm:h-16" aria-hidden />

        <section className="bg-[#f4f5f7]">
          <div
            className={cn(
              landingContent,
              "grid items-center gap-10 pt-10 pb-14 sm:pt-12 sm:pb-16 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-12 lg:pb-20",
            )}
          >
            <div>
              <p className="text-base font-medium text-slate-500 sm:text-lg">
                {EVENTS_HERO.eyebrow}
              </p>
              <h1 className="mt-2 text-[clamp(2.4rem,5vw,3.75rem)] font-semibold leading-[1.08] tracking-tight text-slate-900">
                {EVENTS_HERO.title}
              </h1>
              <p className="mt-4 max-w-xl text-xl text-slate-600 sm:text-2xl">
                {EVENTS_HERO.line}
              </p>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600 sm:text-xl sm:leading-8">
                {EVENTS_HERO.body.map((line, index) => (
                  <span key={line}>
                    {index > 0 ? <br /> : null}
                    {line}
                  </span>
                ))}
              </p>
            </div>
            <div
              className={cn(
                "overflow-hidden rounded-[1.75rem] bg-[#e7e9ee] lg:rounded-[2rem]",
                landingSectionY.media,
              )}
            >
              <img
                src={LANDING_SIMPLE_WAY_STILL}
                alt="심플웨이 제품"
                className="h-full w-full object-cover object-center"
              />
            </div>
          </div>
        </section>

        <section
          id="list"
          className={cn("scroll-mt-20 bg-white", landingSectionY.band)}
        >
          <div className={landingContent}>
            <h2 className="text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-tight text-slate-900">
              진행 중인 행사
            </h2>
            <p className="mt-2 max-w-xl text-lg text-slate-600">
              회원가입 후 신청할 수 있습니다.
            </p>

            <div className="mt-10">
              {loading ? (
                <div className="space-y-4">
                  <Skeleton className="h-36 w-full rounded-[1.5rem]" />
                  <Skeleton className="h-36 w-full rounded-[1.5rem]" />
                </div>
              ) : error ? (
                <p className="rounded-[1.5rem] bg-[#f4f5f7] px-6 py-10 text-center text-base text-slate-600">
                  {error}
                </p>
              ) : items.length === 0 ? (
                <p className="rounded-[1.5rem] bg-[#f4f5f7] px-6 py-10 text-center text-base text-slate-600">
                  현재 신청 가능한 이벤트가 없습니다.
                </p>
              ) : (
                <ul className="space-y-4">
                  {items.map((ev) => {
                    const isSimpleway = ev.slug === SIMPLEWAY_SAMPLE_SLUG;
                    return (
                      <li key={ev.id}>
                        <Link
                          to={`/events/${encodeURIComponent(ev.slug)}`}
                          className="group block overflow-hidden rounded-[1.5rem] bg-[#f4f5f7] outline-none transition hover:bg-[#eef1f6] focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                        >
                          <div className="flex flex-col gap-4 px-6 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-8">
                            <div className="min-w-0 space-y-2">
                              <p className="text-sm font-medium text-slate-500">
                                {isSimpleway ? "심플웨이" : "행사"}
                              </p>
                              <h3 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                                {ev.title}
                              </h3>
                              {ev.summary ? (
                                <p className="max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
                                  {ev.summary}
                                </p>
                              ) : null}
                              <p className="inline-flex items-center gap-1.5 pt-1 text-sm text-slate-500">
                                <CalendarDays className="h-3.5 w-3.5" />
                                {isSimpleway
                                  ? "화 · 수 이틀간 신청"
                                  : "행사 신청"}
                              </p>
                            </div>
                            <span className="inline-flex shrink-0 items-center gap-1 text-base font-semibold text-[#1d4ed8]">
                              신청하기
                              <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                            </span>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </section>
      </div>
    </PublicPageLayout>
  );
}
