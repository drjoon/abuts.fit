// change-log:
// - 2026-10-24: 베타 중에는 미납 주문 정지 문구를 숨긴다.
// - 2026-10-24: 입금할 금액은 하이라이트. 미확인 안내는 두 줄.
// - 2026-10-24: 충전 페이지처럼 왼쪽 금액은 파란 그라데이션, 계좌번호는 크게.
// - 2026-10-24: 금액은 왼쪽, 입금자명·계좌는 오른쪽. 입금자명은 라벨 옆.
// - 2026-10-24: 기공료 카드가 세로 flex에서 줄어들며 입금자명·계좌가 잘리던 문제. shrink-0.
// - 2026-10-24: 사용월은 현재까지 사용분. 익월 1일~1차 기한은 1차 입금, 그 다음 날은 2차+정지. 입금자명은 치과명.
// - 2026-10-24: 어벗츠 입금 총액을 계좌 카드와 내역 합계에 표시. 안내는 입금 조건만.
// - 2026-10-24: 수기 후불. 1일 9시 문자, 5일 1차·재안내, 10일 2차, 11일부터 신규 의뢰만 쉼.
// - 2026-10-19: 어벗츠 기공사업부 기공은 법인 이체. 칩은 기공소 / 어벗츠.
// related files:
// - web/frontend/src/pages/requestor/credits/RequestorCreditsPage.tsx
// - web/backend/services/practiceObBilling.service.js
// - web/frontend/src/shared/legal/creditPrepaidCopy.ts
import { useCallback, useEffect, useState } from "react";
import { Building2, ChevronDown, Landmark } from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import { isCreditEventForBusiness } from "@/shared/realtime/creditBalanceEvent";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PracticeObBillingTabSkeleton } from "@/shared/ui/skeletons/RequestorCreditsPageSkeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/shared/ui/cn";
import { formatRequestorWon } from "@/shared/pricing/requestorUnitPricePolicy";
import { PRACTICE_OB_BILLING_NOTICE_TITLE } from "@/shared/legal/creditPrepaidCopy";
import { toKstYmd } from "@/shared/date/kst";

type SettlementLine = {
  id?: string;
  payeeKind: "direct_lab" | "abuts_corp";
  payeeName: string;
  amount: number;
  transferStatus: "PENDING" | "SUCCESS" | "FAILED";
};

type MonthlySettlement = {
  id: string;
  yearMonth: string;
  status: string;
  totalAmount: number;
  scheduledTransferAt?: string | null;
  firstDueYmd?: string;
  secondDueYmd?: string;
  paymentReceivedAt?: string | null;
  lines: SettlementLine[];
};

type PracticeBillingOverview = {
  practiceName: string;
  /** 실사용 전환 뒤에만 미납으로 새 기공의뢰를 막는다. */
  unpaidOrderPause?: boolean;
  depositAccount?: {
    bankName: string;
    accountNumber: string;
    holderName: string;
  };
  currentMonthEstimate: {
    yearMonth: string;
    totalAmount: number;
    directLabTotal: number;
    abutsCorpTotal: number;
    lines: SettlementLine[];
    firstDueYmd?: string;
    secondDueYmd?: string;
  };
  settlements: MonthlySettlement[];
};

function formatYmd(ymd?: string) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "";
  const [, month, day] = ymd.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

function nextMonthStartYmd(yearMonth: string) {
  const [y, m] = String(yearMonth || "").split("-").map(Number);
  if (!y || !m) return "";
  if (m === 12) return `${y + 1}-01-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/**
 * 사용월 안에서는 기한을 숨긴다.
 * 익월 1일부터 1차 기한까지는 1차 입금.
 * 1차 기한 다음 날부터는 2차 입금과 미납 시 정지.
 */
function resolvePracticeDepositCue(opts: {
  todayYmd: string;
  usageYearMonth: string;
  firstDueYmd?: string;
  secondDueYmd?: string;
}) {
  const usage = String(opts.usageYearMonth || "");
  const today = String(opts.todayYmd || "");
  const inUsageMonth = Boolean(usage) && today.startsWith(`${usage}-`);
  const usageLabel = inUsageMonth ? `${usage} 현재까지 사용분` : `${usage} 사용분`;
  const payStart = nextMonthStartYmd(usage);
  const first = String(opts.firstDueYmd || "");
  const second = String(opts.secondDueYmd || "");
  if (!payStart || !today || today < payStart || !first) {
    return { usageLabel, dueLabel: "", late: false };
  }
  if (today <= first) {
    return { usageLabel, dueLabel: `${formatYmd(first)}까지 입금`, late: false };
  }
  const secondDay = formatYmd(second) || formatYmd(first);
  return { usageLabel, dueLabel: `${secondDay}까지 입금`, late: true };
}

function settlementPhase(row: MonthlySettlement, now = Date.now()) {
  if (row.paymentReceivedAt || row.status === "COMPLETED") return "received";
  const suspend = row.scheduledTransferAt
    ? new Date(row.scheduledTransferAt).getTime()
    : NaN;
  if (Number.isFinite(suspend) && suspend <= now) return "paused";
  return "open";
}

export function PracticeObBillingTab() {
  const { token, user } = useAuthStore();
  const [data, setData] = useState<PracticeBillingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  const loadOverview = useCallback(async (opts?: { silent?: boolean }) => {
    if (!token) return;
    if (!opts?.silent) setLoading(true);
    try {
      const res = await request<{
        success: boolean;
        data?: PracticeBillingOverview;
      }>({
        path: "/api/practice/billing/overview",
        method: "GET",
        token,
        skipCache: true,
      });
      if (res.ok && res.data?.success && res.data.data) {
        const next = res.data.data;
        setData(next);
        if (
          next.unpaidOrderPause !== false &&
          next.settlements.some((row) => settlementPhase(row) === "paused")
        ) {
          setHistoryOpen(true);
        }
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useAppEventDebouncedReload({
    enabled: Boolean(token && user?.businessAnchorId),
    eventTypes: ["credit:balance-updated"],
    shouldHandle: (evt) =>
      isCreditEventForBusiness(evt, user?.businessAnchorId),
    onMatch: () => loadOverview({ silent: true }),
    delayMs: 300,
  });

  if (loading && !data) {
    return <PracticeObBillingTabSkeleton />;
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-1.5 py-8 text-center text-sm text-slate-500">
        정보를 불러오지 못했습니다.
      </div>
    );
  }

  const { currentMonthEstimate, settlements, depositAccount, practiceName } = data;
  const pauseOrders = data.unpaidOrderPause !== false;
  const visiblePhase = (row: MonthlySettlement) => {
    const phase = settlementPhase(row);
    if (!pauseOrders && phase === "paused") return "open";
    return phase;
  };
  const openBill = settlements.find(
    (row) => visiblePhase(row) !== "received" && row.totalAmount > 0,
  );
  const paused = openBill ? visiblePhase(openBill) === "paused" : false;
  const depositAmount = openBill?.totalAmount ?? currentMonthEstimate.totalAmount;
  const monthTotal = currentMonthEstimate.totalAmount;
  const dueMonth = openBill?.yearMonth || currentMonthEstimate.yearMonth;
  const cue = resolvePracticeDepositCue({
    todayYmd: toKstYmd(new Date()) || "",
    usageYearMonth: dueMonth,
    firstDueYmd: openBill?.firstDueYmd || currentMonthEstimate.firstDueYmd,
    secondDueYmd: openBill?.secondDueYmd || currentMonthEstimate.secondDueYmd,
  });
  const depositorName = practiceName?.trim() || "치과명";

  return (
    <div className="mx-auto flex w-full max-w-4xl shrink-0 flex-col gap-3 self-start px-1.5 py-1 pb-2">
      {paused && openBill ? (
        <section className="rounded-2xl border border-amber-200/90 bg-amber-50/80 px-4 py-3 text-amber-950 shadow-sm">
          <p className="text-sm font-medium">
            {openBill.yearMonth} 기공료가 아직 확인되지 않았습니다.
            <br />
            확인되면 새 기공의뢰를 바로 보낼 수 있습니다.
          </p>
        </section>
      ) : null}

      <section className="shrink-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
        <div className="grid sm:grid-cols-2">
          <div className="bg-gradient-to-b from-primary-soft/80 to-white px-5 py-5 sm:px-6 sm:py-6">
            <p className="text-xs font-medium text-primary-strong">
              {PRACTICE_OB_BILLING_NOTICE_TITLE}
            </p>
            <p
              className={cn(
                "mt-2 w-fit text-4xl font-bold tabular-nums tracking-tight text-primary",
                (paused || Boolean(cue.dueLabel)) &&
                  "animate-scroll-halo-blue rounded-xl px-1 motion-reduce:animate-none",
              )}
            >
              {formatRequestorWon(depositAmount)}
              <span className="text-2xl font-semibold">원</span>
            </p>
            <p className="mt-2 text-sm text-slate-600">{cue.usageLabel}</p>
                {cue.dueLabel && !paused ? (
              <p
                className={cn(
                  "mt-2 text-sm font-semibold",
                  cue.late ? "text-amber-800" : "text-primary-strong",
                )}
              >
                {cue.dueLabel}
                {pauseOrders && cue.late ? (
                  <>
                    <br />
                    미납 시 추가 주문 정지
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col justify-center gap-3 border-t border-slate-200/80 px-5 py-5 sm:border-l sm:border-t-0 sm:px-6">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-xs text-slate-500">입금자명</span>
              <span className="text-lg font-bold tracking-tight text-slate-950">
                {depositorName}
              </span>
            </p>
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Landmark className="h-3.5 w-3.5 text-primary" />
                입금 계좌
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                {depositAccount?.bankName || "하나은행"}
              </p>
              <p className="truncate text-lg font-semibold tracking-wide text-slate-950">
                {depositAccount?.accountNumber || ""}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                예금주 {depositAccount?.holderName || "어벗츠 주식회사"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {currentMonthEstimate.lines.length > 0 ? (
        <section className="shrink-0 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm sm:px-5">
          <h2 className="px-1 text-sm font-semibold tracking-tight text-slate-900">
            기공소별
          </h2>
          <ul className="mt-1.5 divide-y divide-slate-100 rounded-xl border border-slate-200/70 px-1.5 py-0.5">
            {currentMonthEstimate.lines.map((line, idx) => (
              <li
                key={`${line.payeeKind}-${idx}`}
                className="flex items-center justify-between gap-3 px-2 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate text-sm text-slate-800">
                    {line.payeeName}
                  </span>
                </div>
                <span className="shrink-0 text-sm tabular-nums text-slate-700">
                  {formatRequestorWon(line.amount)}원
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between rounded-lg bg-primary-soft/60 px-2.5 py-1.5">
            <span className="text-sm text-slate-600">합계</span>
            <span className="text-sm font-bold tabular-nums text-primary">
              {formatRequestorWon(monthTotal)}원
            </span>
          </div>
        </section>
      ) : null}

      {settlements.length > 0 ? (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <section className="shrink-0 rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-2xl px-4 py-3 text-left sm:px-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900">지난 기공료</h2>
                <p className="mt-0.5 text-xs text-slate-500">{settlements.length}건</p>
              </div>
              <ChevronDown
                className={cn(
                  "h-5 w-5 shrink-0 text-slate-400 transition-transform",
                  historyOpen && "rotate-180",
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2.5 px-5 pb-5 sm:px-6 sm:pb-6">
              <Separator className="mb-2" />
              {settlements.map((row) => {
                const phase = visiblePhase(row);
                const rowCue = resolvePracticeDepositCue({
                  todayYmd: toKstYmd(new Date()) || "",
                  usageYearMonth: row.yearMonth,
                  firstDueYmd: row.firstDueYmd,
                  secondDueYmd: row.secondDueYmd,
                });
                return (
                  <div
                    key={row.id}
                    className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums text-slate-900">
                          {row.yearMonth}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {phase === "received"
                            ? "입금 확인"
                            : phase === "paused"
                              ? "확인 중"
                              : "입금"}
                        </Badge>
                      </div>
                      <span className="text-sm font-bold tabular-nums text-slate-900">
                        {formatRequestorWon(row.totalAmount)}원
                      </span>
                    </div>
                    {phase !== "received" && rowCue.dueLabel ? (
                      <p className="mt-1 text-xs text-slate-500">
                        {rowCue.dueLabel}
                        {pauseOrders && rowCue.late ? (
                          <>
                            <br />
                            미납 시 추가 주문 정지
                          </>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </CollapsibleContent>
          </section>
        </Collapsible>
      ) : null}
    </div>
  );
}
