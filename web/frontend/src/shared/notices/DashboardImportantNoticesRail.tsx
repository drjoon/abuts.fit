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

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Gift,
  Megaphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

/** 미처리 카드와 같은 측정 폭. 롤링 중에도 칸이 줄지 않게 최소 폭을 둔다. */
export const IMPORTANT_NOTICES_RAIL_WIDTH_CLASS =
  "w-fit min-w-[18rem] max-w-[min(100%,28rem)]";

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

function railKindLabel(item: RailItem) {
  if (item.kind === "credit") return "크레딧";
  if (item.kind === "notice") return "공지";
  return "이벤트";
}

function railItemLabel(item: RailItem) {
  if (item.kind === "credit") {
    return `남은 크레딧 ${formatLowCreditWon(item.orderable)}`;
  }
  if (item.kind === "notice") return item.notice.title;
  return item.applied ? "어벗츠 이벤트 신청 완료" : "어벗츠 이벤트 신청하기";
}

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
  const [listOpen, setListOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const { data: fetched = [] } = useQuery({
    queryKey: ["dashboard-notices-active", role || ""],
    enabled: Boolean(token) && role !== "admin",
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const res = await apiFetch<ActiveResponse>({
        path: "/api/notices/active",
        token,
      });
      if (!res.ok || res.data?.success === false) {
        throw new Error("notices");
      }
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
    if (items.length < 2 || paused || listOpen) return;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, ROLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [items.length, listOpen, paused]);

  if (!items.length) return null;

  const safeIndex = index % items.length;
  const current = items[safeIndex];
  const canCycle = items.length > 1;
  const countLabel = items.length > 99 ? "99+" : String(items.length);
  const step = (delta: number) => {
    setIndex((prev) => {
      const base = prev % items.length;
      return (base + delta + items.length) % items.length;
    });
  };

  return (
    <>
      <div
        className={cn(
          IMPORTANT_NOTICES_RAIL_WIDTH_CLASS,
          "flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-sm text-amber-950",
          className,
        )}
        role="status"
        aria-live="polite"
        aria-label={`중요 사항 ${items.length}건`}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <Megaphone className="h-4 w-4 shrink-0 text-amber-700" aria-hidden />
        <button
          type="button"
          className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2 py-1 text-left text-[11px] leading-snug text-amber-950 hover:bg-amber-50"
          title={`${railKindLabel(current)} · ${railItemLabel(current)}`}
          onClick={() => setListOpen(true)}
        >
          <span className="shrink-0 text-[10px] font-semibold text-amber-800">
            {railKindLabel(current)}
          </span>
          <span className="min-w-0 truncate">{railItemLabel(current)}</span>
        </button>
        {canCycle ? (
          <div className="flex shrink-0 flex-col">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-3.5 w-6 p-0 text-amber-900 hover:bg-amber-100 hover:text-amber-950"
              aria-label="이전 중요 사항"
              title="이전 중요 사항"
              onClick={() => step(-1)}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-3.5 w-6 p-0 text-amber-900 hover:bg-amber-100 hover:text-amber-950"
              aria-label="다음 중요 사항"
              title="다음 중요 사항"
              onClick={() => step(1)}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}
        <span
          className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-amber-600 px-1.5 text-[11px] font-bold tabular-nums leading-none text-white"
          title={`중요 사항 ${items.length}건`}
          aria-label={`중요 사항 ${items.length}건`}
        >
          {countLabel}
        </span>
      </div>
      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogContent className={cn(NOTICE_DIALOG_SHELL_CLASS, "sm:max-w-lg")}>
          <DialogHeader className={NOTICE_DIALOG_HEADER_CLASS}>
            <DialogTitle className="pr-8 text-xl font-semibold leading-snug tracking-tight text-slate-900">
              중요 사항 {items.length}건
            </DialogTitle>
          </DialogHeader>
          <div className={NOTICE_DIALOG_BODY_CLASS}>
            {items.map((item) => (
              <article
                key={item.key}
                className="space-y-2 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm"
              >
                <p className="text-[11px] font-semibold text-amber-800">
                  {railKindLabel(item)}
                </p>
                {item.kind === "credit" ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">
                      {railItemLabel(item)}
                    </p>
                    {item.canCharge ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          setListOpen(false);
                          navigate(LOW_CREDIT_CHARGE_HREF);
                        }}
                      >
                        충전
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {item.kind === "notice" ? (
                  <>
                    <p className="text-sm font-semibold leading-snug text-slate-900">
                      {item.notice.title}
                    </p>
                    {item.notice.body.trim() !== item.notice.title.trim() ? (
                      <NoticeCopy text={item.notice.body} />
                    ) : null}
                    {item.notice.images?.length ? (
                      <div className="flex flex-col gap-3">
                        {item.notice.images.map((image, imageIndex) =>
                          image.url ? (
                            <img
                              key={image.url}
                              src={image.url}
                              alt={
                                image.fileName ||
                                `공지 이미지 ${imageIndex + 1}`
                              }
                              className="max-h-80 w-full rounded-xl border border-slate-200/80 bg-slate-50 object-contain"
                            />
                          ) : null,
                        )}
                      </div>
                    ) : null}
                  </>
                ) : null}
                {item.kind === "event" ? (
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-800 underline underline-offset-2"
                  >
                    {item.applied ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Gift className="h-4 w-4 text-sky-600" />
                    )}
                    {railItemLabel(item)}
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
