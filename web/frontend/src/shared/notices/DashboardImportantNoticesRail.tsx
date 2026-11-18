// related files:
// - web/frontend/src/shared/notices/DashboardNoticeAlert.tsx
// - web/frontend/src/shared/credits/useRequestorLowCreditWarning.ts
// - web/frontend/src/shared/events/GriboEventToolbarAlert.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
//
// 기공의뢰 헤더 오른쪽 — 중요 사항 공지 영역.
// 남은 크레딧·대시보드 공지·이벤트 CTA를 한 슬롯에 모으고, 2건 이상이면 5초 롤링.
// change-log:
// - 2026-11-19: 헤더 오른쪽 중요 공지 레일. 크레딧·공지·이벤트 5초 롤링.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronRight, Gift, Megaphone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/shared/api/apiClient";
import {
  formatLowCreditWon,
  LOW_CREDIT_CHARGE_HREF,
  useRequestorLowCreditWarningContext,
} from "@/shared/credits/useRequestorLowCreditWarning";
import { eventsApi } from "@/shared/events/eventsApi";
import {
  GRIBO_EVENT_HREF,
  SIMPLEWAY_SAMPLE_SLUG,
} from "@/shared/events/simplewaySampleCampaign";
import { whenPracticeCalendarPainted } from "@/shared/practice/practiceCalendarFirstPaint";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/shared/ui/cn";
import {
  isNoticeWindowOpen,
  NOTICE_DIALOG_BODY_CLASS,
  NOTICE_DIALOG_HEADER_CLASS,
  NOTICE_DIALOG_SHELL_CLASS,
  type DashboardNotice,
} from "./dashboardNotice";

/** 그린 박스보다 조금 길게. 롤링 중 폭이 흔들리지 않게 고정. */
export const IMPORTANT_NOTICES_RAIL_WIDTH_CLASS =
  "w-[min(100%,22rem)] min-w-[16rem] max-w-[22rem]";

const ROLL_INTERVAL_MS = 5_000;

type ActiveResponse = {
  success?: boolean;
  data?: { items?: DashboardNotice[] };
};

type RailItem =
  | {
      key: string;
      kind: "credit";
      orderable: number;
      canCharge: boolean;
    }
  | {
      key: string;
      kind: "notice";
      notice: DashboardNotice;
    }
  | {
      key: string;
      kind: "event";
      applied: boolean;
      href: string;
    };

function NoticeCopy({ text }: { text: string }) {
  const parts = text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=\.)\s+/))
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  return (
    <p className="text-sm leading-relaxed text-slate-700">
      {parts.map((part, index) => (
        <span key={`${index}-${part.slice(0, 16)}`}>
          {index > 0 ? <br /> : null}
          {part}
        </span>
      ))}
    </p>
  );
}

const SLIDE_SHELL =
  "flex h-8 w-full min-w-0 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition";

function usePracticeEventSlide(enabled: boolean): RailItem | null {
  const token = useAuthStore((s) => s.token);
  const [item, setItem] = useState<RailItem | null>(null);

  useEffect(() => {
    if (!enabled || !token) {
      setItem(null);
      return;
    }
    let cancelled = false;
    const cancelWait = whenPracticeCalendarPainted(() => {
      void eventsApi
        .myApplication(SIMPLEWAY_SAMPLE_SLUG, token)
        .then((res) => {
          if (cancelled) return;
          const status = res.event?.status;
          if (status === "draft" || (status === "closed" && !res.applied)) {
            setItem(null);
            return;
          }
          setItem({
            key: "event:gribo",
            kind: "event",
            applied: Boolean(res.applied),
            href: GRIBO_EVENT_HREF,
          });
        })
        .catch(() => {
          if (!cancelled) setItem(null);
        });
    });
    return () => {
      cancelled = true;
      cancelWait();
    };
  }, [enabled, token]);

  return item;
}

/**
 * 기공의뢰 헤더·캘린더 툴바용 중요 사항 공지 슬롯.
 * credit · 공지 · 이벤트(치과)를 모으고 2건 이상이면 5초마다 롤링한다.
 */
export function DashboardImportantNoticesRail({
  className,
  includeEvent = false,
}: {
  className?: string;
  /** 치과 발신 툴바 — 출시 행사 CTA 포함 */
  includeEvent?: boolean;
}) {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  const lowCredit = useRequestorLowCreditWarningContext();
  const showBanner = Boolean(lowCredit?.showBanner);
  const orderable = lowCredit?.orderable ?? 0;
  const canCharge = Boolean(lowCredit?.canCharge);
  const eventItem = usePracticeEventSlide(includeEvent);
  const [openNoticeId, setOpenNoticeId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const { data: fetched = [] } = useQuery({
    queryKey: ["dashboard-notices-active", role || "", "important-rail"],
    enabled: Boolean(token) && role !== "admin",
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const res = await apiFetch<ActiveResponse>({
        path: "/api/notices/active",
        token,
      });
      if (!res.ok || res.data?.success === false) return [];
      return res.data?.data?.items || [];
    },
  });

  const notices = useMemo(
    () => fetched.filter((item) => isNoticeWindowOpen(item)),
    [fetched],
  );

  const items = useMemo(() => {
    const next: RailItem[] = [];
    if (showBanner) {
      next.push({
        key: "credit",
        kind: "credit",
        orderable,
        canCharge,
      });
    }
    for (const notice of notices) {
      next.push({
        key: `notice:${notice.id}`,
        kind: "notice",
        notice,
      });
    }
    if (eventItem) next.push(eventItem);
    return next;
  }, [canCharge, eventItem, notices, orderable, showBanner]);

  const itemsKey = items.map((item) => item.key).join("|");
  useEffect(() => {
    setIndex(0);
  }, [itemsKey]);

  useEffect(() => {
    if (items.length < 2 || paused) return;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, ROLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [items.length, paused]);

  if (!items.length) return null;

  const safeIndex = index % items.length;
  const current = items[safeIndex];
  const openNotice = notices.find((row) => row.id === openNoticeId) || null;

  let slide: ReactNode = null;
  if (current.kind === "credit") {
    slide = (
      <div
        className={cn(
          SLIDE_SHELL,
          "border-amber-300 bg-amber-50 text-amber-950",
        )}
        role="status"
      >
        <span className="min-w-0 flex-1 truncate">
          남은 크레딧 {formatLowCreditWon(current.orderable)}
        </span>
        {current.canCharge ? (
          <button
            type="button"
            className="shrink-0 rounded-md px-1.5 py-0.5 underline underline-offset-2"
            onClick={() => navigate(LOW_CREDIT_CHARGE_HREF)}
          >
            충전
          </button>
        ) : null}
      </div>
    );
  } else if (current.kind === "notice") {
    slide = (
      <button
        type="button"
        onClick={() => setOpenNoticeId(current.notice.id)}
        className={cn(
          SLIDE_SHELL,
          "border-amber-300 bg-gradient-to-b from-amber-200 to-amber-300 text-left text-amber-950 hover:from-amber-100 hover:to-amber-200",
        )}
        title={current.notice.title}
        aria-label={current.notice.title}
      >
        <Megaphone className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{current.notice.title}</span>
      </button>
    );
  } else {
    slide = (
      <a
        href={current.href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          SLIDE_SHELL,
          current.applied
            ? "border-emerald-200 bg-emerald-50/90 text-emerald-900 hover:bg-emerald-100/80"
            : "border-sky-200 bg-sky-50/90 text-sky-950 hover:bg-sky-100/80",
        )}
      >
        {current.applied ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
        ) : (
          <Gift className="h-3.5 w-3.5 shrink-0 text-sky-600" />
        )}
        <span className="min-w-0 flex-1 truncate">
          {current.applied
            ? "어벗츠 이벤트 신청 완료"
            : "어벗츠 이벤트 신청하기"}
        </span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </a>
    );
  }

  return (
    <>
      <div
        className={cn(
          IMPORTANT_NOTICES_RAIL_WIDTH_CLASS,
          "shrink-0",
          className,
        )}
        aria-label="중요 사항 공지"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {slide}
      </div>
      <Dialog
        open={openNoticeId !== null}
        onOpenChange={(next) => !next && setOpenNoticeId(null)}
      >
        <DialogContent className={cn(NOTICE_DIALOG_SHELL_CLASS, "sm:max-w-lg")}>
          <DialogHeader className={NOTICE_DIALOG_HEADER_CLASS}>
            <DialogTitle className="pr-8 text-xl font-semibold leading-snug tracking-tight text-slate-900">
              {openNotice &&
              openNotice.body.trim() !== openNotice.title.trim()
                ? openNotice.title
                : "공지"}
            </DialogTitle>
          </DialogHeader>
          <div className={NOTICE_DIALOG_BODY_CLASS}>
            {openNotice ? (
              <article className="space-y-3">
                <NoticeCopy text={openNotice.body} />
                {openNotice.images?.length ? (
                  <div className="flex flex-col gap-3">
                    {openNotice.images.map((image, imageIndex) =>
                      image.url ? (
                        <img
                          key={image.url}
                          src={image.url}
                          alt={
                            image.fileName || `공지 이미지 ${imageIndex + 1}`
                          }
                          className="max-h-80 w-full rounded-xl border border-slate-200/80 bg-slate-50 object-contain"
                        />
                      ) : null,
                    )}
                  </div>
                ) : null}
              </article>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
