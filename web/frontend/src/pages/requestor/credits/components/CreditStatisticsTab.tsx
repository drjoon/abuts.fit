// change-log:
// - 2026-08-23: 요약 카드 — 내역과 동일 +/− 연산 레이아웃. 기간 충전·소비·의뢰건수 라벨.
// - 2026-08-23: 내역 탭과 동일 — 요약 카드 상단, 기간 필터는 그 아래. 정산 통계·기간 안내 문구 제거.
// - 2026-08-22: 클릭 시 CreditLedgerModal(내역 탭 동일 UI). 상단 잘림·카드 높이 정리.
// - 2026-08-22: semantic 팔레트(app-glass-card·primary) 통일. 패널 중첩 button 제거.
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
import {
  ChevronRight,
  Layers3,
  PieChart,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { apiFetch } from "@/shared/api/apiClient";
import {
  CreditLedgerModal,
  type CreditLedgerInitialFilters,
  type CreditLedgerStatsCategory,
} from "@/shared/components/CreditLedgerModal";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { appendPeriodQueryParams } from "@/store/usePeriodStore";
import {
  SettlementEquationOperator,
  SettlementStatCard,
} from "@/shared/settlement/settlementUi";
import { formatWonWithUnit, roundWon } from "@/shared/settlement/affiliateVat";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/shared/ui/cn";

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
  chargeSupply: { label: "충전", color: "hsl(var(--primary-strong))" },
  settlementEarnSupply: {
    label: "정산 적립",
    color: "hsl(var(--primary-muted))",
  },
} satisfies ChartConfig;

const supplyTooltipFormatter = (value: number | string) =>
  formatWonWithUnit(roundWon(Number(value || 0)));

const PANEL_MIN_H = "min-h-[17rem]";

const ORDER_STATS_CATEGORIES =
  "practice_transfer,abutment_production,shipping" as const;

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
    return {
      ...base,
      statsCategory: categoryKey as CreditLedgerStatsCategory,
    };
  }
  return {
    ...base,
    action: "SPEND",
    statsCategory: categoryKey as CreditLedgerStatsCategory,
  };
}

function StatsPanel({
  title,
  subtitle,
  icon: Icon,
  onOpenDetail,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: typeof TrendingUp;
  onOpenDetail: () => void;
  children: React.ReactNode;
}) {
  const panelTriggerClass =
    "w-full rounded-xl text-left transition hover:bg-primary-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";

  return (
    <div
      className={cn(
        "app-glass-card app-glass-card--lg flex w-full flex-col rounded-2xl p-4",
        PANEL_MIN_H,
      )}
    >
      <button
        type="button"
        onClick={onOpenDetail}
        className={cn(panelTriggerClass, "flex items-start justify-between gap-2 p-1 -m-1")}
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-strong ring-1 ring-primary-muted/60">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight text-foreground">
              {title}
            </div>
            {subtitle ? (
              <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {subtitle}
              </div>
            ) : null}
          </div>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/70" />
      </button>
      <div className="mt-3 flex min-h-0 flex-1 flex-col">{children}</div>
      <button
        type="button"
        onClick={onOpenDetail}
        className={cn(
          panelTriggerClass,
          "mt-3 border-t border-border/50 px-1 py-2 text-[10px] text-muted-foreground",
        )}
      >
        클릭하면 개별 거래 내역 보기
      </button>
    </div>
  );
}

function HorizontalBarList({
  rows,
  onRowClick,
  emptyHint = "데이터가 없습니다.",
}: {
  rows: StatsRow[];
  onRowClick?: (row: StatsRow) => void;
  emptyHint?: string;
}) {
  const maxAmount = Math.max(1, ...rows.map((r) => roundWon(r.amountSupply)));

  if (!rows.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-2 py-6 text-center text-sm text-muted-foreground">
        {emptyHint}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col justify-center space-y-2.5">
      {rows.slice(0, 5).map((row) => {
        const ratio = Math.max(0, Math.min(1, row.amountSupply / maxAmount));
        const clickable = Boolean(onRowClick);
        return (
          <button
            key={row.key}
            type="button"
            disabled={!clickable}
            onClick={(event) => {
              if (!onRowClick) return;
              event.stopPropagation();
              onRowClick(row);
            }}
            className={cn(
              "w-full space-y-1.5 text-left",
              clickable
                ? "rounded-md px-1 py-1 transition hover:bg-muted/40"
                : "cursor-default",
            )}
          >
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate font-medium text-foreground/90">
                {row.label}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatWonWithUnit(row.amountSupply)} · {row.count}건
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted/50">
              <div
                className="h-full rounded-full bg-primary/80"
                style={{ width: `${ratio * 100}%` }}
              />
            </div>
          </button>
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
      const params = new URLSearchParams();
      appendPeriodQueryParams(params, period, {
        customStartDate,
        customEndDate,
      });

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

  const openDrillDown = (next: DrillDownState) => {
    setDrillDown(next);
  };

  const statCardClass = "min-w-[9.5rem] flex-1 sm:min-w-[10.5rem]";

  const summaryCards = (
    <div className="-mx-1 overflow-x-auto pb-1">
      <div className="flex min-w-max items-stretch gap-0.5 px-1 sm:gap-1">
        <SettlementStatCard
          className={statCardClass}
          label="기간 충전"
          value={stats?.summary.totalChargeSupply || 0}
          hint="안내"
          hintTooltip="선택한 기간에 충전된 금액 합계입니다."
          onClick={() =>
            openDrillDown({
              title: "기간 충전 내역",
              filters: { ...filterBase, action: "CHARGE" },
            })
          }
        />
        {isLab ? (
          <>
            <SettlementEquationOperator symbol="+" />
            <SettlementStatCard
              className={statCardClass}
              label="정산 적립"
              value={stats?.summary.totalSettlementEarnSupply || 0}
              hint="안내"
              hintTooltip="선택한 기간에 적립된 기공 정산 금액입니다."
              onClick={() =>
                openDrillDown({
                  title: "정산 적립 내역",
                  filters: {
                    ...filterBase,
                    statsCategory: "settlement_earn",
                  },
                })
              }
            />
          </>
        ) : null}
        <SettlementEquationOperator symbol="−" />
        <SettlementStatCard
          className={statCardClass}
          label="기간 소비"
          value={stats?.summary.totalSpendSupply || 0}
          tone="primary"
          hint="안내"
          hintTooltip="선택한 기간에 소비된 금액 합계입니다."
          onClick={() =>
            openDrillDown({
              title: "기간 소비 내역",
              filters: { ...filterBase, action: "SPEND" },
            })
          }
        />
        <SettlementStatCard
          className={statCardClass}
          label="의뢰건수"
          value={`${(stats?.summary.orderCount || 0).toLocaleString("ko-KR")}건`}
          hint="안내"
          hintTooltip="기공의뢰·어벗생산·배송 거래 건수입니다."
          onClick={() =>
            openDrillDown({
              title: "의뢰 내역",
              filters: {
                ...filterBase,
                statsCategories: ORDER_STATS_CATEGORIES,
              },
            })
          }
        />
      </div>
    </div>
  );

  return (
    <>
      <div className="flex flex-col gap-4 pb-2 pt-1">
        {loading ? (
          <>
            <div className="-mx-1 overflow-x-auto pb-1">
              <div className="flex min-w-max items-stretch gap-0.5 px-1 sm:gap-1">
                {Array.from({ length: isLab ? 4 : 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="min-h-[7.25rem] min-w-[9.5rem] flex-1 animate-pulse rounded-2xl border border-border/60 bg-muted/30 sm:min-w-[10.5rem]"
                  />
                ))}
              </div>
            </div>
            <div className="h-9 w-48 animate-pulse rounded-xl border border-border/60 bg-muted/30" />
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "animate-pulse rounded-2xl border border-border/60 bg-muted/30",
                    PANEL_MIN_H,
                  )}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            {summaryCards}

            <div className="flex flex-wrap items-center gap-2">
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

            <div className="grid gap-3 md:grid-cols-2">
              <StatsPanel
                title="기간별 추이"
                subtitle="일별 소비·충전"
                icon={TrendingUp}
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
                icon={PieChart}
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
                        onClick={(barData, _index, event) => {
                          event?.stopPropagation?.();
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
                icon={Wallet}
                onOpenDetail={() =>
                  openDrillDown({
                    title: `${partnerTitle} 거래 내역`,
                    filters: { ...filterBase, action: "SPEND" },
                  })
                }
              >
                <HorizontalBarList
                  rows={stats?.byPartner || []}
                  emptyHint="기공의뢰·소비 내역이 있을 때 파트너별로 표시됩니다."
                  onRowClick={(row) =>
                    openDrillDown({
                      title: `${row.label} 내역`,
                      filters: {
                        ...filterBase,
                        action: "SPEND",
                        partnerName: row.label,
                      },
                    })
                  }
                />
              </StatsPanel>

              <StatsPanel
                title="보철 유형별"
                subtitle="견적 라인 기준 공급가"
                icon={Layers3}
                onOpenDetail={() =>
                  openDrillDown({
                    title: "보철 유형별 거래 내역",
                    filters: { ...filterBase, action: "SPEND" },
                  })
                }
              >
                <HorizontalBarList
                  rows={stats?.byProsthesisType || []}
                  emptyHint="기공의뢰·어벗생산 소비가 있을 때 보철 유형별로 표시됩니다."
                  onRowClick={(row) =>
                    openDrillDown({
                      title: `${row.label} 내역`,
                      filters: {
                        ...filterBase,
                        action: "SPEND",
                        prosthesisType: row.label,
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
