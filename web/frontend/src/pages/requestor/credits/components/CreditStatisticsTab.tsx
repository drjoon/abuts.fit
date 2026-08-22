// change-log:
// - 2026-08-22: 클릭 시 CreditLedgerModal(내역 탭 동일 UI). 상단 잘림·카드 높이 정리.
// - 2026-08-22: glass 카드·균등 그리드. 공급가 정수 원 표시.
// related files:
// - web/frontend/src/pages/requestor/credits/RequestorCreditsPage.tsx
// - web/frontend/src/shared/components/CreditLedgerModal.tsx
// - web/backend/controllers/credits/creditLedgerStats.controller.js
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
import { ChevronRight } from "lucide-react";
import { apiFetch } from "@/shared/api/apiClient";
import {
  CreditLedgerModal,
  type CreditLedgerInitialFilters,
} from "@/shared/components/CreditLedgerModal";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { periodToRange } from "@/store/usePeriodStore";
import { SettlementStatCard } from "@/shared/settlement/settlementUi";
import { formatWon, formatWonWithUnit, roundWon } from "@/shared/settlement/affiliateVat";
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

type DrillDownState = {
  title: string;
  filters: CreditLedgerInitialFilters;
} | null;

const trendChartConfig = {
  spendSupply: { label: "소비", color: "hsl(var(--primary))" },
  chargeSupply: { label: "충전", color: "hsl(142 71% 45%)" },
  settlementEarnSupply: { label: "정산 적립", color: "hsl(38 92% 50%)" },
} satisfies ChartConfig;

const supplyTooltipFormatter = (value: number | string) =>
  formatWonWithUnit(roundWon(Number(value || 0)));

const PANEL_MIN_H = "min-h-[16.5rem]";

function baseFilters(
  period: PeriodFilterValue,
  customStartDate: string,
  customEndDate: string,
): CreditLedgerInitialFilters {
  return {
    period,
    customStartDate,
    customEndDate,
  };
}

function categoryLedgerFilters(
  categoryKey: string,
  base: CreditLedgerInitialFilters,
): CreditLedgerInitialFilters {
  if (categoryKey === "charge") return { ...base, action: "CHARGE" };
  if (categoryKey === "adjust") return { ...base, action: "ADJUST" };
  if (categoryKey === "settlement_earn" || categoryKey === "settlement_payout") {
    return { ...base, creditKind: "SETTLEMENT" };
  }
  return { ...base, action: "SPEND" };
}

function StatsPanel({
  title,
  subtitle,
  onOpenDetail,
  children,
}: {
  title: string;
  subtitle?: string;
  onOpenDetail: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onOpenDetail}
      className={cn(
        "app-glass-card app-glass-card--lg group flex w-full flex-col rounded-2xl p-4 text-left transition-shadow",
        "hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        PANEL_MIN_H,
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight text-foreground">
            {title}
          </div>
          {subtitle ? (
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {subtitle}
            </div>
          ) : null}
        </div>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/70 transition group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      <div className="mt-3 border-t border-border/50 pt-2 text-[10px] text-muted-foreground/90">
        클릭하면 개별 거래 내역 보기
      </div>
    </button>
  );
}

function HorizontalBarList({
  rows,
  onRowClick,
}: {
  rows: StatsRow[];
  onRowClick?: (row: StatsRow) => void;
}) {
  const maxAmount = Math.max(1, ...rows.map((r) => roundWon(r.amountSupply)));

  if (!rows.length) {
    return (
      <div className="flex flex-1 items-center justify-center py-6 text-sm text-muted-foreground">
        데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col justify-center space-y-2.5">
      {rows.slice(0, 5).map((row) => {
        const ratio = Math.max(0, Math.min(1, row.amountSupply / maxAmount));
        const clickable = Boolean(onRowClick);
        return (
          <div key={row.key} className="space-y-1.5">
            <button
              type="button"
              disabled={!clickable}
              onClick={(event) => {
                if (!onRowClick) return;
                event.stopPropagation();
                onRowClick(row);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-3 text-xs",
                clickable
                  ? "rounded-md px-1 py-0.5 text-left transition hover:bg-muted/40"
                  : "cursor-default",
              )}
            >
              <span className="truncate font-medium text-foreground/90">
                {row.label}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatWonWithUnit(row.amountSupply)} · {row.count}건
              </span>
            </button>
            <div className="h-2 overflow-hidden rounded-full bg-muted/50">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary/90 to-primary/60"
                style={{ width: `${ratio * 100}%` }}
              />
            </div>
          </div>
        );
      })}
      {rows.length > 5 ? (
        <div className="text-center text-[10px] text-muted-foreground">
          외 {rows.length - 5}건 — 패널 클릭으로 전체 내역
        </div>
      ) : null}
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
  const [drillDown, setDrillDown] = useState<DrillDownState>(null);

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
  const filterBase = useMemo(
    () => baseFilters(period, customStartDate, customEndDate),
    [period, customStartDate, customEndDate],
  );

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
        key: row.key,
        label: row.label,
        amountSupply: row.amountSupply,
        count: row.count,
      })),
    [stats?.byCategory],
  );

  const categoryChartConfig = useMemo(
    () =>
      ({
        amountSupply: { label: "공급가", color: "hsl(var(--primary))" },
      }) satisfies ChartConfig,
    [],
  );

  const periodLabel =
    stats?.period?.fromYmd && stats?.period?.toYmd
      ? `${formatKstYmdToKo(stats.period.fromYmd)} – ${formatKstYmdToKo(stats.period.toYmd)}`
      : "";

  const openDrillDown = (next: DrillDownState) => {
    setDrillDown(next);
  };

  const summaryCardCount = isLab ? 4 : 3;

  return (
    <>
      <div className="flex flex-col gap-4 pb-2 pt-1">
        <div className="app-glass-card app-glass-card--lg flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <div>
            <div className="text-base font-semibold tracking-tight text-foreground">
              정산 통계
            </div>
            {periodLabel ? (
              <div className="mt-0.5 text-xs text-muted-foreground">
                {periodLabel}
              </div>
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
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: summaryCardCount + 4 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "animate-pulse rounded-2xl border border-border/60 bg-muted/30",
                  i < summaryCardCount ? "min-h-[7.25rem]" : PANEL_MIN_H,
                )}
              />
            ))}
          </div>
        ) : (
          <>
            <div
              className={cn(
                "grid gap-3",
                summaryCardCount === 4
                  ? "sm:grid-cols-2 xl:grid-cols-4"
                  : "sm:grid-cols-2 lg:grid-cols-3",
              )}
            >
              <SettlementStatCard
                label="총 소비"
                value={formatWon(stats?.summary.totalSpendSupply || 0)}
                tone="primary"
                onClick={() =>
                  openDrillDown({
                    title: "총 소비 내역",
                    filters: { ...filterBase, action: "SPEND" },
                  })
                }
              />
              <SettlementStatCard
                label="총 충전"
                value={formatWon(stats?.summary.totalChargeSupply || 0)}
                onClick={() =>
                  openDrillDown({
                    title: "총 충전 내역",
                    filters: { ...filterBase, action: "CHARGE" },
                  })
                }
              />
              {isLab ? (
                <SettlementStatCard
                  label="정산 적립"
                  value={formatWon(stats?.summary.totalSettlementEarnSupply || 0)}
                  onClick={() =>
                    openDrillDown({
                      title: "정산 적립 내역",
                      filters: { ...filterBase, creditKind: "SETTLEMENT" },
                    })
                  }
                />
              ) : null}
              <SettlementStatCard
                label="주문·배송 건수"
                value={`${(stats?.summary.orderCount || 0).toLocaleString("ko-KR")}건`}
                hint={`거래 ${(stats?.summary.transactionCount || 0).toLocaleString("ko-KR")}건`}
                onClick={() =>
                  openDrillDown({
                    title: "주문·배송 내역",
                    filters: { ...filterBase, action: "SPEND" },
                  })
                }
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <StatsPanel
                title="기간별 추이"
                subtitle="일별 소비·충전"
                onOpenDetail={() =>
                  openDrillDown({
                    title: "기간별 거래 내역",
                    filters: filterBase,
                  })
                }
              >
                {trendData.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                    선택한 기간에 데이터가 없습니다.
                  </div>
                ) : (
                  <ChartContainer
                    config={trendChartConfig}
                    className="aspect-[16/10] w-full flex-1"
                  >
                    <LineChart data={trendData} margin={{ left: 4, right: 8, top: 4 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        minTickGap={20}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={48}
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) =>
                          Number(v) >= 10000
                            ? `${Math.round(Number(v) / 10000)}만`
                            : String(v)
                        }
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(value, name) => [
                              supplyTooltipFormatter(value),
                              trendChartConfig[name as keyof typeof trendChartConfig]
                                ?.label || String(name),
                            ]}
                          />
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="spendSupply"
                        stroke="var(--color-spendSupply)"
                        strokeWidth={2.5}
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
              </StatsPanel>

              <StatsPanel
                title="유형별 금액"
                subtitle="충전·기공의뢰·배송 등"
                onOpenDetail={() =>
                  openDrillDown({
                    title: "유형별 거래 내역",
                    filters: filterBase,
                  })
                }
              >
                {categoryChartData.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                    유형별 집계 데이터가 없습니다.
                  </div>
                ) : (
                  <ChartContainer
                    config={categoryChartConfig}
                    className="aspect-[16/10] w-full flex-1"
                  >
                    <BarChart
                      data={categoryChartData}
                      margin={{ left: 4, right: 8, top: 4, bottom: 0 }}
                    >
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        interval={0}
                        angle={-18}
                        textAnchor="end"
                        height={52}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={48}
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) =>
                          Number(v) >= 10000
                            ? `${Math.round(Number(v) / 10000)}만`
                            : String(v)
                        }
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            labelKey="label"
                            formatter={(value) => [
                              supplyTooltipFormatter(value),
                              "공급가",
                            ]}
                          />
                        }
                      />
                      <Bar
                        dataKey="amountSupply"
                        fill="hsl(var(--primary))"
                        radius={[6, 6, 0, 0]}
                        className="cursor-pointer"
                        onClick={(barData) => {
                          const key = String(
                            (barData as { payload?: { key?: string } })?.payload
                              ?.key || "",
                          );
                          if (!key) return;
                          openDrillDown({
                            title: `${String((barData as { payload?: { label?: string } })?.payload?.label || "유형")} 내역`,
                            filters: categoryLedgerFilters(key, filterBase),
                          });
                        }}
                      />
                    </BarChart>
                  </ChartContainer>
                )}
              </StatsPanel>

              <StatsPanel
                title={`${partnerTitle} 소비`}
                subtitle="파트너별 공급가 합계"
                onOpenDetail={() =>
                  openDrillDown({
                    title: `${partnerTitle} 거래 내역`,
                    filters: { ...filterBase, action: "SPEND" },
                  })
                }
              >
                <HorizontalBarList
                  rows={stats?.byPartner || []}
                  onRowClick={(row) =>
                    openDrillDown({
                      title: `${row.label} 내역`,
                      filters: {
                        ...filterBase,
                        action: "SPEND",
                        q: row.label,
                      },
                    })
                  }
                />
              </StatsPanel>

              <StatsPanel
                title="보철 유형별"
                subtitle="견적 라인 기준 공급가"
                onOpenDetail={() =>
                  openDrillDown({
                    title: "보철 유형별 거래 내역",
                    filters: { ...filterBase, action: "SPEND" },
                  })
                }
              >
                <HorizontalBarList
                  rows={stats?.byProsthesisType || []}
                  onRowClick={(row) =>
                    openDrillDown({
                      title: `${row.label} 내역`,
                      filters: {
                        ...filterBase,
                        action: "SPEND",
                        q: row.label,
                      },
                    })
                  }
                />
              </StatsPanel>
            </div>
          </>
        )}
      </div>

      <CreditLedgerModal
        key={
          drillDown
            ? `${drillDown.title}:${JSON.stringify(drillDown.filters)}`
            : "stats-drilldown-closed"
        }
        open={Boolean(drillDown)}
        onOpenChange={(next) => {
          if (!next) setDrillDown(null);
        }}
        initialFilters={drillDown?.filters}
        detailTitle={drillDown?.title}
        hideBalanceSummary
      />
    </>
  );
}
