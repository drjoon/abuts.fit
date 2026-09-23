// related files:
// - web/frontend/src/features/landing/LandingHome.tsx
// - web/frontend/src/pages/public/EventApplyPage.tsx
// - web/frontend/src/shared/events/eventsApi.ts
// - web/frontend/src/shared/events/simplewaySampleCampaign.ts
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

/** `/` `#events` — 진행 중 행사 목록. 그리보 문구는 EventApplyPage SSOT. */
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
        <h2 className="text-2xl font-semibold tracking-tight text-[#0b2a5c] sm:text-[2rem]">
          {landingHome.eventsHeading}
        </h2>

        <div className="mt-8 max-w-md sm:max-w-lg">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-2xl" />
            </div>
          ) : error ? (
            <p className="rounded-2xl border border-sky-100 bg-[#eef6ff] px-5 py-8 text-center text-[14px] text-slate-600">
              {error}
            </p>
          ) : items.length === 0 ? (
            <p className="rounded-2xl border border-sky-100 bg-[#eef6ff] px-5 py-8 text-center text-[14px] text-slate-600">
              현재 신청 가능한 이벤트가 없습니다.
            </p>
          ) : (
            <ul className="space-y-3">
              {items.map((ev) => {
                const isSimpleway = ev.slug === SIMPLEWAY_SAMPLE_SLUG;
                const title = isSimpleway
                  ? "그리보(Gribo) 출시 행사"
                  : ev.title;
                const meta = isSimpleway ? "출시 행사 신청" : "행사 신청";
                return (
                  <li key={ev.id}>
                    <Link
                      to={`/events/${encodeURIComponent(ev.slug)}`}
                      className="group block overflow-hidden rounded-2xl border border-sky-100/80 bg-white shadow-[0_10px_32px_rgba(37,99,235,0.06)] outline-none transition hover:border-sky-200 hover:bg-[#f8fbff] focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
                    >
                      <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-5">
                        <div className="min-w-0 space-y-1.5">
                          <p className="text-[12px] font-medium text-sky-600">
                            {isSimpleway ? "심플웨이 신제품" : "행사"}
                          </p>
                          <h3 className="break-keep text-lg font-semibold tracking-tight text-[#0b2a5c] sm:text-xl">
                            {title}
                          </h3>
                          {!isSimpleway && ev.summary ? (
                            <p className="break-keep text-[14px] leading-6 text-slate-600 sm:text-[15px]">
                              {ev.summary}
                            </p>
                          ) : null}
                          <p className="inline-flex items-center gap-1.5 pt-0.5 text-[12px] text-slate-500">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {meta}
                          </p>
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-1 text-[14px] font-semibold text-[#2563eb]">
                          신청하기
                          <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
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
