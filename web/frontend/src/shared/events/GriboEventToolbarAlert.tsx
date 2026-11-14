// related files:
// - web/frontend/src/shared/events/simplewaySampleCampaign.ts
// - web/frontend/src/shared/events/eventsApi.ts
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersCalendar.tsx
import { useEffect, useState } from "react";
import { CheckCircle2, Gift, ChevronRight } from "lucide-react";
import { eventsApi } from "@/shared/events/eventsApi";
import {
  GRIBO_EVENT_HREF,
  SIMPLEWAY_SAMPLE_SLUG,
} from "@/shared/events/simplewaySampleCampaign";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/shared/ui/cn";
import { whenPracticeCalendarPainted } from "@/shared/practice/practiceCalendarFirstPaint";

/**
 * 치과 발신(send) 캘린더 툴바 — 검색·필터 오른쪽 끝 어벗츠 출시 행사 CTA.
 * 클릭 시 이벤트 신청 페이지를 새 탭으로 연다.
 */
let griboApplicationCache: {
  token: string;
  applied: boolean;
  visible: boolean;
  savedAt: number;
} | null = null;
const GRIBO_CACHE_TTL_MS = 60 * 1000;

export function GriboEventToolbarAlert({
  className,
}: {
  className?: string;
}) {
  const token = useAuthStore((s) => s.token);
  const [applied, setApplied] = useState<boolean | null>(() =>
    token &&
    griboApplicationCache &&
    griboApplicationCache.token === token &&
    Date.now() - griboApplicationCache.savedAt < GRIBO_CACHE_TTL_MS
      ? griboApplicationCache.applied
      : null,
  );
  const [visible, setVisible] = useState(() =>
    Boolean(
      token &&
        griboApplicationCache &&
        griboApplicationCache.token === token &&
        Date.now() - griboApplicationCache.savedAt < GRIBO_CACHE_TTL_MS &&
        griboApplicationCache.visible,
    ),
  );

  useEffect(() => {
    if (!token) {
      setVisible(false);
      return;
    }
    if (
      griboApplicationCache &&
      griboApplicationCache.token === token &&
      Date.now() - griboApplicationCache.savedAt < GRIBO_CACHE_TTL_MS
    ) {
      setApplied(griboApplicationCache.applied);
      setVisible(griboApplicationCache.visible);
      return;
    }
    let cancelled = false;
    const cancelWait = whenPracticeCalendarPainted(() => {
      void eventsApi
      .myApplication(SIMPLEWAY_SAMPLE_SLUG, token)
      .then((res) => {
        if (cancelled) return;
        const status = res.event?.status;
        // 초안은 미공개. 마감은 이미 신청한 치과만 「신청 완료」를 남긴다.
        if (status === "draft" || (status === "closed" && !res.applied)) {
          griboApplicationCache = {
            token,
            applied: false,
            visible: false,
            savedAt: Date.now(),
          };
          setVisible(false);
          return;
        }
        const nextApplied = Boolean(res.applied);
        griboApplicationCache = {
          token,
          applied: nextApplied,
          visible: true,
          savedAt: Date.now(),
        };
        setApplied(nextApplied);
        setVisible(true);
      })
      .catch(() => {
        if (!cancelled) setVisible(false);
      });
    });
    return () => {
      cancelled = true;
      cancelWait();
    };
  }, [token]);

  if (!visible || applied == null) return null;

  return (
    <a
      href={GRIBO_EVENT_HREF}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group inline-flex min-w-0 max-w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-xs font-medium transition-colors sm:text-[13px]",
        applied
          ? "border-emerald-200 bg-emerald-50/90 text-emerald-900 hover:bg-emerald-100/80"
          : "border-sky-200 bg-sky-50/90 text-sky-950 hover:bg-sky-100/80",
        className,
      )}
    >
      {applied ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
      ) : (
        <Gift className="h-3.5 w-3.5 shrink-0 text-sky-600" />
      )}
      <span className="min-w-0 truncate">
        {applied ? "어벗츠 이벤트 신청 완료" : "어벗츠 이벤트 신청하기"}
      </span>
      <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" />
    </a>
  );
}
