// related files:
// - web/frontend/src/shared/events/simplewaySampleCampaign.ts
// - web/frontend/src/shared/events/eventsApi.ts
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersCalendar.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Gift, ChevronRight } from "lucide-react";
import { eventsApi } from "@/shared/events/eventsApi";
import {
  GRIBO_EVENT_HREF,
  SIMPLEWAY_SAMPLE_SLUG,
} from "@/shared/events/simplewaySampleCampaign";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/shared/ui/cn";

/**
 * 치과 발신(send) 캘린더 툴바 — 검색·필터 오른쪽 끝 그리보 이벤트 CTA.
 */
export function GriboEventToolbarAlert({
  className,
}: {
  className?: string;
}) {
  const token = useAuthStore((s) => s.token);
  const [applied, setApplied] = useState<boolean | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!token) {
      setVisible(false);
      return;
    }
    let cancelled = false;
    void eventsApi
      .myApplication(SIMPLEWAY_SAMPLE_SLUG, token)
      .then((res) => {
        if (cancelled) return;
        const status = res.event?.status;
        if (status === "closed" && !res.applied) {
          setVisible(false);
          return;
        }
        setApplied(Boolean(res.applied));
        setVisible(true);
      })
      .catch(() => {
        if (!cancelled) setVisible(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!visible || applied == null) return null;

  return (
    <Link
      to={GRIBO_EVENT_HREF}
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
        {applied ? "그리보 이벤트 신청 완료" : "그리보 이벤트 신청하기"}
      </span>
      <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
