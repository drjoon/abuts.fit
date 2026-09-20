// related files:
// - web/frontend/src/shared/events/eventsApi.ts
// - web/frontend/src/pages/public/EventApplyPage.tsx
// - web/frontend/src/App.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronRight, Gift, Package } from "lucide-react";
import {
  PublicPageLayout,
  PUBLIC_CARD_CLASS,
  PUBLIC_PAGE_EYEBROW,
  PUBLIC_PAGE_TITLE,
} from "./components/PublicPageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { eventsApi, type MarketingEvent } from "@/shared/events/eventsApi";
import { SIMPLEWAY_SAMPLE_SLUG } from "@/shared/events/simplewaySampleCampaign";
import { cn } from "@/shared/ui/cn";

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
    <PublicPageLayout>
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="space-y-2 text-center">
          <p className={PUBLIC_PAGE_EYEBROW}>events</p>
          <h1 className={PUBLIC_PAGE_TITLE}>이벤트</h1>
          <p className="text-slate-600">
            진행 중인 행사에 비회원으로도 신청할 수 있습니다.
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-28 w-full rounded-2xl" />
          </div>
        ) : error ? (
          <Card className={PUBLIC_CARD_CLASS}>
            <CardContent className="py-8 text-center text-sm text-slate-600">
              {error}
            </CardContent>
          </Card>
        ) : items.length === 0 ? (
          <Card className={PUBLIC_CARD_CLASS}>
            <CardContent className="py-10 text-center text-sm text-slate-600">
              현재 신청 가능한 이벤트가 없습니다.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {items.map((ev) => {
              const isSimpleway = ev.slug === SIMPLEWAY_SAMPLE_SLUG;
              return (
                <li key={ev.id}>
                  <Link
                    to={`/events/${encodeURIComponent(ev.slug)}`}
                    className="block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                  >
                    <Card
                      className={cn(
                        PUBLIC_CARD_CLASS,
                        "transition-all hover:-translate-y-0.5 hover:border-sky-200",
                        isSimpleway &&
                          "border-sky-200/80 bg-gradient-to-br from-white via-white to-sky-50/60",
                      )}
                    >
                      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                              isSimpleway
                                ? "bg-[#0b2a5c] text-white"
                                : "bg-sky-50 text-sky-700",
                            )}
                          >
                            {isSimpleway ? (
                              <Package className="h-5 w-5" />
                            ) : (
                              <Gift className="h-5 w-5" />
                            )}
                          </div>
                          <div className="min-w-0 space-y-1">
                            <CardTitle className="text-lg leading-snug text-slate-900">
                              {ev.title}
                            </CardTitle>
                            {ev.summary ? (
                              <p className="text-sm leading-relaxed text-slate-600">
                                {ev.summary}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className="shrink-0 border-sky-200 bg-sky-50 text-sky-800"
                        >
                          신청 가능
                        </Badge>
                      </CardHeader>
                      <CardContent className="flex items-center justify-between gap-2 pt-0 text-sm text-slate-500">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {isSimpleway ? "화 · 수 이틀간 신청" : "샘플 신청"}
                        </span>
                        <span className="inline-flex items-center gap-0.5 font-medium text-sky-700">
                          신청하기
                          <ChevronRight className="h-4 w-4" />
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PublicPageLayout>
  );
}
