// change-log:
// - 2026-11-10: 외부 기공비는 기공소 계좌로 직접 입금. 법인 사용분은 입금 중단 유지.
// related files:
// - web/frontend/src/pages/requestor/credits/RequestorCreditsPage.tsx
// - web/backend/controllers/practiceLabDirectSettlement.controller.js
import { useCallback, useEffect, useState } from "react";
import { Building2, ChevronDown, Landmark } from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { PracticeObBillingTabSkeleton } from "@/shared/ui/skeletons/RequestorCreditsPageSkeleton";
import { formatRequestorWon } from "@/shared/pricing/requestorUnitPricePolicy";
import {
  SETTLEMENT_STAT_ROW_CLASS,
  SettlementStatCard,
} from "@/shared/settlement/settlementUi";
import { cn } from "@/shared/ui/cn";

type Line = {
  id: string;
  patientLabel: string;
  originalAmount: number;
  amount: number;
};

type Account = {
  bankName: string;
  accountNumber: string;
  holderName: string;
} | null;

type Statement = {
  id: string;
  yearMonth: string;
  status: string;
  labName: string;
  payableAmount: number;
  lines: Line[];
  account: Account;
};

type Overview = {
  currentMonthEstimate: {
    yearMonth: string;
    abutsCorpTotal: number;
    lines: { payeeKind: string; payeeName: string; amount: number }[];
  };
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "입금 전",
  ADJUSTED: "금액 수정",
  DEPOSIT_CONFIRMED: "입금 확인",
  INVOICE_ISSUED: "계산서 발행",
  SELF_INVOICE: "직접 발행",
};

export function PracticeObBillingTab() {
  const { token } = useAuthStore();
  const [statements, setStatements] = useState<Statement[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [openLines, setOpenLines] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [directRes, overviewRes] = await Promise.all([
        request<{ success: boolean; data?: { statements: Statement[] } }>({
          path: "/api/practice/billing/direct-settlements",
          method: "GET",
          token,
          skipCache: true,
        }),
        request<{ success: boolean; data?: Overview }>({
          path: "/api/practice/billing/overview",
          method: "GET",
          token,
          skipCache: true,
        }),
      ]);
      if (directRes.ok && directRes.data?.success) {
        setStatements(directRes.data.data?.statements || []);
      }
      if (overviewRes.ok && overviewRes.data?.success && overviewRes.data.data) {
        setOverview(overviewRes.data.data);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && statements.length === 0 && !overview) {
    return <PracticeObBillingTabSkeleton />;
  }

  const latestMonth = statements[0]?.yearMonth || "";
  const latest = statements.filter((row) => row.yearMonth === latestMonth);
  const older = statements.filter((row) => row.yearMonth !== latestMonth);
  const latestTotal = latest.reduce((sum, row) => sum + row.payableAmount, 0);
  const corpTotal = overview?.currentMonthEstimate?.abutsCorpTotal || 0;

  return (
    <div className="mx-auto flex w-full max-w-4xl shrink-0 flex-col gap-3 self-start px-1.5 py-1 pb-2">
      <section className="rounded-2xl border border-slate-200/90 bg-slate-50/80 px-4 py-3 text-slate-800 shadow-sm">
        <p className="text-sm font-medium">
          지난달 기공비입니다.
          <br />
          기공소 계좌로 입금해 주세요.
        </p>
      </section>

      <div className={SETTLEMENT_STAT_ROW_CLASS}>
        <SettlementStatCard
          label="지난달 기공비"
          value={`${formatRequestorWon(latestTotal)}원`}
          hint={latestMonth || "지난달"}
          tone="primary"
        />
      </div>

      {latest.length === 0 ? (
        <section className="rounded-2xl border border-slate-200/80 bg-white px-4 py-6 text-center text-sm text-slate-500">
          지난달 기공비가 없습니다.
        </section>
      ) : (
        latest.map((row) => (
          <section
            key={row.id}
            className="rounded-2xl border border-slate-200/90 bg-white px-4 py-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                  <p className="truncate text-sm font-semibold text-slate-950">
                    {row.labName || "기공소"}
                  </p>
                </div>
                <Badge variant="outline" className="mt-2">
                  {STATUS_LABEL[row.status] || "입금 전"}
                </Badge>
              </div>
              <p className="text-lg font-bold tabular-nums text-slate-950">
                {formatRequestorWon(row.payableAmount)}원
              </p>
            </div>
            {row.account ? (
              <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Landmark className="h-3.5 w-3.5 text-primary" />
                  입금 계좌
                </div>
                <p className="mt-1.5 text-xs text-slate-500">{row.account.bankName}</p>
                <p className="truncate text-lg font-semibold tracking-wide text-slate-950">
                  {row.account.accountNumber}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">예금주 {row.account.holderName}</p>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">
                기공소가 계좌를 등록하면 여기에 표시됩니다.
              </p>
            )}
            <Collapsible
              open={openLines[row.id] === true}
              onOpenChange={(open) => setOpenLines((prev) => ({ ...prev, [row.id]: open }))}
            >
              <CollapsibleTrigger className="mt-3 flex w-full items-center justify-between text-xs text-slate-500">
                의뢰 {row.lines.length}건
                <ChevronDown
                  className={cn("h-4 w-4 transition-transform", openLines[row.id] && "rotate-180")}
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200/70 px-1.5">
                  {row.lines.map((line) => (
                    <li key={line.id} className="flex items-center justify-between gap-3 px-2 py-2">
                      <span className="truncate text-sm text-slate-700">{line.patientLabel}</span>
                      <span className="shrink-0 text-sm tabular-nums text-slate-800">
                        {formatRequestorWon(line.amount)}원
                      </span>
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          </section>
        ))
      )}

      {older.length > 0 ? (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left">
              <span className="text-sm font-semibold text-slate-900">이전 달</span>
              <ChevronDown
                className={cn("h-4 w-4 text-slate-400 transition-transform", historyOpen && "rotate-180")}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 px-4 pb-4">
              {older.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-slate-700">
                    {row.yearMonth} {row.labName}
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-900">
                    {formatRequestorWon(row.payableAmount)}원
                  </span>
                </div>
              ))}
            </CollapsibleContent>
          </section>
        </Collapsible>
      ) : null}

      {corpTotal > 0 ? (
        <section className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-slate-700">
          <p className="text-sm font-medium">
            어벗·스토어·기공사업부 사용분은 따로입니다.
            <br />
            법인 입금은 잠시 중단되어 있습니다.
          </p>
          <p className="mt-2 text-sm font-semibold tabular-nums text-slate-900">
            {overview?.currentMonthEstimate?.yearMonth} {formatRequestorWon(corpTotal)}원
          </p>
        </section>
      ) : null}
    </div>
  );
}
