// related files:
// - web/frontend/src/features/landing/LandingHome.tsx
// - web/frontend/src/pages/public/EventsPage.tsx
// - web/frontend/src/shared/events/eventsApi.ts
// - web/frontend/src/features/landing/landingTheme.ts
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { eventsApi, type MarketingEvent } from "@/shared/events/eventsApi";
import { SIMPLEWAY_SAMPLE_SLUG } from "@/shared/events/simplewaySampleCampaign";
import {
  landingContent,
  landingHome,
  landingSectionY,
} from "@/features/landing/landingTheme";
import { cn } from "@/shared/ui/cn";

/** `/` `#events` — 진행 중 행사 목록. 헤더 메뉴 대신 랜딩에 둔다. */
export function LandingEventsSection() {
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
    <section
      id="events"
      className={cn("scroll-mt-20 bg-white", landingSectionY.band)}
    >
      <div className={landingContent}>
        <h2 className="text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-tight text-slate-900">
          {landingHome.eventsHeading}
        </h2>
        <p className="mt-2 max-w-xl text-lg text-slate-600 sm:text-xl">
          {landingHome.eventsLead}
        </p>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg sm:leading-7">
          {landingHome.eventsBody.map((line, index) => (
            <span key={line}>
              {index > 0 ? <br /> : null}
              {line}
            </span>
          ))}
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
                            {isSimpleway ? "화 · 수 이틀간 신청" : "행사 신청"}
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
  );
}
