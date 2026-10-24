// change-log:
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import { formatRequestorWon } from "@/shared/pricing/requestorUnitPricePolicy";
import {
  PRACTICE_OB_BILLING_NOTICE_BODY,
  PRACTICE_OB_BILLING_NOTICE_TITLE,
} from "@/shared/legal/creditPrepaidCopy";

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

  const { currentMonthEstimate, settlements, depositAccount } = data;
  const openBill = settlements.find(
    (row) => settlementPhase(row) !== "received" && row.totalAmount > 0,
  );
  const paused = openBill ? settlementPhase(openBill) === "paused" : false;
  const noticeLines = PRACTICE_OB_BILLING_NOTICE_BODY.split("\n").filter(Boolean);
  const heroAmount = openBill?.totalAmount ?? currentMonthEstimate.totalAmount;
  const firstDue = formatYmd(openBill?.firstDueYmd || currentMonthEstimate.firstDueYmd);
  const secondDue = formatYmd(
    openBill?.secondDueYmd || currentMonthEstimate.secondDueYmd,
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-1.5 py-2 pb-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-primary/[0.04] shadow-sm">
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-slate-500">
                {openBill
                  ? `${openBill.yearMonth} 기공료`
                  : PRACTICE_OB_BILLING_NOTICE_TITLE}
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-[2rem]">
                {formatRequestorWon(heroAmount)}
                <span className="ml-0.5 text-lg font-semibold text-slate-600">
                  원
                </span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {openBill
                  ? "어벗츠 계좌로 입금해 주세요."
                  : `${currentMonthEstimate.yearMonth} 사용분 · 다음 달 1일 오전 9시 문자`}
              </p>
            </div>
            <Badge
              variant={paused ? "outline" : "secondary"}
              className="rounded-lg px-2.5 py-1"
            >
              {paused ? "확인 중" : openBill ? "입금 기간" : "이번 달"}
            </Badge>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-1 text-xs tabular-nums text-slate-700">
                  기공소 {formatRequestorWon(currentMonthEstimate.directLabTotal)}원
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                다른 기공소가 수행한 기공비입니다.
                <br />
                입금 확인 후 어벗츠가 그 기공소로 전달합니다.
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-1 text-xs tabular-nums text-slate-700">
                  어벗츠 {formatRequestorWon(currentMonthEstimate.abutsCorpTotal)}원
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                기공사업부 기공·커스텀어벗·스토어입니다.
                <br />
                어벗츠가 받습니다.
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            {noticeLines.map((line, index) => (
              <span key={line}>
                {index > 0 ? <br /> : null}
                {line}
              </span>
            ))}
          </p>
        </div>
      </section>

      {paused && openBill ? (
        <section className="rounded-2xl border border-amber-200/90 bg-amber-50/80 px-4 py-3 text-amber-950 shadow-sm">
          <p className="text-sm font-medium">
            {openBill.yearMonth} 기공료가 아직 확인되지 않았습니다.
            <br />
            확인되는 대로 새 기공의뢰를 바로 보내실 수 있습니다.
            <br />
            이미 입금해 주셨다면 확인 후 바로 열어 드립니다.
            <br />
            진행 중인 의뢰는 그대로 이어집니다.
          </p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Landmark className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight text-slate-900">
              입금 계좌
            </h2>
            <p className="text-xs text-slate-500">
              {firstDue ? `${firstDue}까지 1차` : "5일까지 1차"}
              {secondDue ? ` · ${secondDue}까지 2차` : " · 10일까지 2차"}
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-slate-200/70 bg-slate-50/80 px-4 py-3.5">
          <p className="font-semibold text-slate-900">
            {depositAccount?.bankName || "하나은행"}{" "}
            {depositAccount?.accountNumber || ""}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            예금주 {depositAccount?.holderName || "어벗츠 주식회사"}
          </p>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          1차까지 확인되면 다음 영업일에 기공소로 전달합니다.
          <br />
          그 이후 확인분은 확인한 다음 영업일에 전달합니다.
          <br />
          일부만 도착한 경우에는 전액이 확인된 뒤로 봅니다.
          <br />
          입금자명은 치과명으로 적어 주세요.
          <br />
          한 달만 늦으면 후불을 유지합니다.
          <br />
          기한을 두 번 넘기거나 일부만 입금하면 이후 주문은 선불 크레딧입니다.
        </p>
      </section>

      {currentMonthEstimate.lines.length > 0 ? (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">
            이번 달 수취처
          </h2>
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200/70 px-1.5 py-1.5">
            {currentMonthEstimate.lines.map((line, idx) => (
              <li
                key={`${line.payeeKind}-${idx}`}
                className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="font-medium text-slate-900">{line.payeeName}</span>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                  {formatRequestorWon(line.amount)}원
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {settlements.length > 0 ? (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-2xl px-5 py-4 text-left sm:px-6">
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
                const phase = settlementPhase(row);
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
                              : "입금 기간"}
                        </Badge>
                      </div>
                      <span className="text-sm font-bold tabular-nums text-slate-900">
                        {formatRequestorWon(row.totalAmount)}원
                      </span>
                    </div>
                    {row.firstDueYmd ? (
                      <p className="mt-1 text-xs text-slate-500">
                        {formatYmd(row.firstDueYmd)}까지 1차
                        {row.secondDueYmd
                          ? ` · ${formatYmd(row.secondDueYmd)}까지 2차`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </CollapsibleContent>
          </section>
        </Collapsible>
      ) : null}

      <p className="text-center text-[11px] text-slate-400">
        CNC 생산 의뢰는 「커스텀어벗 의뢰하기」에서 별도로 진행합니다.
      </p>
    </div>
  );
}
