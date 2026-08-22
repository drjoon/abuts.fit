// change-log:
// - 2026-08-22: 의뢰자 정산 페이지 통계 탭 — 기간·유형·파트너·보철유형 차트.
// related files:
// - web/frontend/src/pages/requestor/credits/RequestorCreditsPage.tsx
// - web/backend/controllers/credits/creditLedgerStats.controller.js
// - web/frontend/src/shared/ui/PeriodFilter.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "@/shared/api/apiClient";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { periodToRange } from "@/store/usePeriodStore";
import { SettlementStatCard } from "@/shared/settlement/settlementUi";
import { formatWon } from "@/shared/settlement/affiliateVat";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/shared/ui/cn";
import { formatKstYmdToKo } from "@/shared/date/kst";

type StatsRow = {
  key: string;
  label: string;
  amountSupply: number;
  count: number;
};

type PeriodRow = {
  ymd: string;
  chargeSupply: number;
  spendSupply: number;
  settlementEarnSupply: number;
  count: number;
};

type CreditLedgerStatsResponse = {
  success: boolean;
  data?: {
    requestorKind: "practice" | "lab" | string;
    period: { key: string; fromYmd: string; toYmd: string };
    summary: {
      totalChargeSupply: number;
      totalSpendSupply: number;
      totalSettlementEarnSupply: number;
      totalSettlementPayoutSupply: number;
      transactionCount: number;
      orderCount: number;
    };
    byPeriod: PeriodRow[];
    byCategory: StatsRow[];
    byPartner: StatsRow[];
    byProsthesisType: StatsRow[];
  };
  message?: string;
};

const trendChartConfig = {
  spendSupply: { label: "소비", color: "hsl(var(--primary))" },
  chargeSupply: { label: "충전", color: "hsl(142 71% 45%)" },
  settlementEarnSupply: { label: "정산 적립", color: "hsl(38 92% 50%)" },
} satisfies ChartConfig;

function HorizontalBarPanel({
  title,
  rows,
  emptyLabel,
  valueSuffix = "원",
}: {
  title: string;
  rows: StatsRow[];
  emptyLabel: string;
  valueSuffix?: string;
}) {
  const maxAmount = Math.max(1, ...rows.map((r) => r.amountSupply));

  return (
    <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="mb-3 text-sm font-semibold text-foreground">{title}</div>
      {rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((row) => {
            const ratio = Math.max(0, Math.min(1, row.amountSupply / maxAmount));
            return (
              <div key={row.key} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-muted-foreground">{row.label}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-foreground">
                    {row.amountSupply.toLocaleString("ko-KR")}
                    {valueSuffix} · {row.count.toLocaleString("ko-KR")}건
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-muted/60">
                  <div
                    className="h-full rounded bg-primary/80 transition-all"
                    style={{ width: `${ratio * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CreditStatisticsTab() {
  const [period, setPeriod] = useState<PeriodFilterValue>("30d");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<CreditLedgerStatsResponse["data"] | null>(
    null,
  );

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const range = periodToRange(period, {
        customStartDate,
        customEndDate,
      });
      const params = new URLSearchParams({ period });
      if (range.startDate) params.set("from", range.startDate);
      if (range.endDate) params.set("to", range.endDate);

      const res = await apiFetch<CreditLedgerStatsResponse>({
        path: `/api/credits/ledger/stats?${params.toString()}`,
      });
      if (!res.ok || !res.data?.success) {
        setStats(null);
        return;
      }
      setStats(res.data.data || null);
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [period, customStartDate, customEndDate]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const isLab = stats?.requestorKind === "lab";
  const partnerTitle = isLab ? "치과별" : "기공소별";

  const trendData = useMemo(
    () =>
      (stats?.byPeriod || []).map((row) => ({
        ...row,
        label: row.ymd.slice(5).replace("-", "/"),
      })),
    [stats?.byPeriod],
  );

  const categoryChartData = useMemo(
    () =>
      (stats?.byCategory || []).map((row) => ({
        label: row.label,
        amountSupply: row.amountSupply,
        count: row.count,
      })),
    [stats?.byCategory],
  );

  const categoryChartConfig = useMemo(() => {
    const config: ChartConfig = {};
    for (const row of stats?.byCategory || []) {
      config[row.key] = { label: row.label, color: "hsl(var(--primary))" };
    }
    return config;
  }, [stats?.byCategory]);

  const periodLabel =
    stats?.period?.fromYmd && stats?.period?.toYmd
      ? `${formatKstYmdToKo(stats.period.fromYmd)} – ${formatKstYmdToKo(stats.period.toYmd)}`
      : "";

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">정산 통계</div>
          {periodLabel ? (
            <div className="text-xs text-muted-foreground">{periodLabel}</div>
          ) : null}
        </div>
        <PeriodFilter
          value={period}
          onChange={setPeriod}
          customStartDate={customStartDate}
          customEndDate={customEndDate}
          onCustomRangeChange={({ startDate, endDate }) => {
            setCustomStartDate(startDate);
            setCustomEndDate(endDate);
          }}
          onClearCustomRange={() => {
            setCustomStartDate("");
            setCustomEndDate("");
          }}
          useStoreCustomRange={false}
          presets={["30d", "90d", "thisMonth"]}
        />
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border border-border/60 bg-muted/30"
            />
          ))}
        </div>
      ) : (
        <>
          <div
            className={cn(
              "grid gap-3",
              isLab ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2 xl:grid-cols-3",
            )}
          >
            <SettlementStatCard
              label="총 소비"
              value={formatWon(stats?.summary.totalSpendSupply || 0)}
              tone="primary"
            />
            <SettlementStatCard
              label="총 충전"
              value={formatWon(stats?.summary.totalChargeSupply || 0)}
            />
            {isLab ? (
              <SettlementStatCard
                label="정산 적립"
                value={formatWon(stats?.summary.totalSettlementEarnSupply || 0)}
              />
            ) : null}
            <SettlementStatCard
              label="주문·배송 건수"
              value={`${(stats?.summary.orderCount || 0).toLocaleString("ko-KR")}건`}
              hint={`거래 ${(stats?.summary.transactionCount || 0).toLocaleString("ko-KR")}건`}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
              <div className="mb-3 text-sm font-semibold">기간별 추이</div>
              {trendData.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  선택한 기간에 데이터가 없습니다.
                </div>
              ) : (
                <ChartContainer config={trendChartConfig} className="aspect-[16/9] w-full">
                  <LineChart data={trendData} margin={{ left: 8, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={56}
                      tickFormatter={(v) =>
                        Number(v) >= 10000
                          ? `${Math.round(Number(v) / 10000)}만`
                          : String(v)
                      }
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line
                      type="monotone"
                      dataKey="spendSupply"
                      stroke="var(--color-spendSupply)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="chargeSupply"
                      stroke="var(--color-chargeSupply)"
                      strokeWidth={2}
                      dot={false}
                    />
                    {isLab ? (
                      <Line
                        type="monotone"
                        dataKey="settlementEarnSupply"
                        stroke="var(--color-settlementEarnSupply)"
                        strokeWidth={2}
                        dot={false}
                      />
                    ) : null}
                  </LineChart>
                </ChartContainer>
              )}
            </div>

            <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
              <div className="mb-3 text-sm font-semibold">유형별 금액</div>
              {categoryChartData.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  유형별 집계 데이터가 없습니다.
                </div>
              ) : (
                <ChartContainer config={categoryChartConfig} className="aspect-[16/9] w-full">
                  <BarChart data={categoryChartData} margin={{ left: 8, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                      height={56}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={56}
                      tickFormatter={(v) =>
                        Number(v) >= 10000
                          ? `${Math.round(Number(v) / 10000)}만`
                          : String(v)
                      }
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="amountSupply" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              )}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <HorizontalBarPanel
              title={`${partnerTitle} 소비`}
              rows={stats?.byPartner || []}
              emptyLabel={`${partnerTitle} 집계 데이터가 없습니다.`}
            />
            <HorizontalBarPanel
              title="보철 유형별"
              rows={stats?.byProsthesisType || []}
              emptyLabel="보철 유형 집계 데이터가 없습니다."
            />
          </div>
        </>
      )}
    </div>
  );
}
