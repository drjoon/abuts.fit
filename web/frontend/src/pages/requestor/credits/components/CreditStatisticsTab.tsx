// change-log:
// - 2026-09-05: 요약 충전 카드 라벨「충전」(치과·기공소 공통, 유료 접두 제거).
// - 2026-09-05: 데모 모드 충전 카드 라벨「충전」(유료/선수금 아님).
// - 2026-09-05: 요약 수식에서 무료 충전 카드 제거(유료 [+정산] − 소비).
// - 2026-09-05: 데모/실사용 집계 필터·2줄 카드 값 제거. 무료 충전 단일 라벨.
// - 2026-08-31: 기공소 통계 구역 — 기공/어벗 액센트 셸·좌측 레일로 클러스터 구분 강화.
// - 2026-08-31: 기공소 통계 — 치과로부터 수신(정산) / 어벗츠로 의뢰(충전·소비) 구역 분리.
// - 2026-08-31: 요약 — 유료/무료 충전 분리. 기공소 +정산 적립. 파트너=치과별 적립.
// - 2026-08-29: 통계 차트 — 충전(녹)·소비(청)·조정(호박) 등 유형별 색 구분.
// - 2026-08-23: 요약 카드 — 기공, 스토어 라벨.
// - 2026-08-23: 요약 카드 — 기공료·쇼핑 라벨·안내 문구 정리.
// - 2026-08-23: 요약 카드 — 내역과 동일 +/− 연산 레이아웃. 기간 충전·소비·의뢰건수 라벨.
// - 2026-08-23: 내역 탭과 동일 — 요약 카드 상단, 기간 필터는 그 아래. 정산 통계·기간 안내 문구 제거.
// - 2026-08-22: 클릭 시 CreditLedgerModal(내역 탭 동일 UI). 상단 잘림·카드 높이 정리.
// - 2026-08-22: semantic 팔레트(app-glass-card·primary) 통일. 패널 중첩 button 제거.
// related files:
// - web/frontend/src/pages/requestor/credits/RequestorCreditsPage.tsx
// - web/frontend/src/shared/components/CreditLedgerModal.tsx
// - web/backend/controllers/credits/creditLedgerStats.controller.js
// - web/frontend/src/shared/demo/demoModeCopy.ts
// - web/frontend/src/shared/ui/gigongAbutAccent.ts
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - .cursor/rules/ui-summary-cards.mdc
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  Building2,
  ChevronRight,
  FileText,
  Layers3,
  PieChart,
  TrendingUp,
  Wallet,
  type LucideIcon,
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
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/shared/ui/cn";
import { RESPONSIVE } from "@/shared/ui/responsive";
import {
  CREDIT_LEDGER_CHARGE_DETAIL_TITLE,
  CREDIT_LEDGER_CHARGE_LABEL,
  CREDIT_LEDGER_DEMO_CHARGE_HINT,
  CREDIT_LEDGER_DEMO_PERIOD_SPEND_HINT,
} from "@/shared/demo/demoModeCopy";
import { useDemoMode } from "@/shared/demo/useDemoMode";
import { useAuthStore } from "@/store/useAuthStore";
import { type GigongAbutAccentKey } from "@/shared/ui/gigongAbutAccent";

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
    demoMode?: boolean;
    period: { key: string; fromYmd: string; toYmd: string };
    summary: {
      totalChargeSupply: number;
      totalPaidChargeSupply?: number;
      totalFreeChargeSupply?: number;
      totalSpendSupply: number;
      totalSettlementEarnSupply: number;
      totalSettlementPayoutSupply: number;
      transactionCount: number;
      orderCount: number;
      settlementOrderCount?: number;
      abutsOrderCount?: number;
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

/** 충전·소비·조정 등이 한눈에 구분되도록 유형별 고정 팔레트 */
const CATEGORY_CHART_COLORS: Record<string, string> = {
  charge: "hsl(152 55% 42%)",
  practice_transfer: "hsl(var(--primary))",
  abutment_production: "hsl(199 72% 45%)",
  shipping: "hsl(221 62% 52%)",
  store: "hsl(262 42% 52%)",
  settlement_earn: "hsl(173 50% 38%)",
  settlement_payout: "hsl(340 55% 52%)",
  adjust: "hsl(32 90% 48%)",
  other: "hsl(215 14% 52%)",
};

const DEFAULT_CATEGORY_COLOR = "hsl(var(--primary))";

const categoryColor = (key: string) =>
  CATEGORY_CHART_COLORS[key] || DEFAULT_CATEGORY_COLOR;

const SETTLEMENT_CATEGORY_KEYS = new Set([
  "settlement_earn",
  "settlement_payout",
]);

const ABUTS_CATEGORY_KEYS = new Set([
  "charge",
  "abutment_production",
  "shipping",
  "store",
  "adjust",
  "other",
]);

const PRACTICE_ORDER_STATS_CATEGORIES =
  "practice_transfer,abutment_production,shipping" as const;
const ABUTS_ORDER_STATS_CATEGORIES =
  "abutment_production,shipping" as const;

const spendTrendChartConfig = {
  spendSupply: { label: "소비", color: CATEGORY_CHART_COLORS.practice_transfer },
  chargeSupply: { label: "충전", color: CATEGORY_CHART_COLORS.charge },
} satisfies ChartConfig;

const settlementTrendChartConfig = {
  settlementEarnSupply: {
    label: "정산 적립",
    color: CATEGORY_CHART_COLORS.settlement_earn,
  },
} satisfies ChartConfig;

const supplyTooltipFormatter = (value: number | string) =>
  formatWonWithUnit(roundWon(Number(value || 0)));

const PANEL_MIN_H = "min-h-[17rem]";

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

function StatsFlowSection({
  title,
  subtitle,
  accent,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle: string;
  accent: GigongAbutAccentKey;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  const isGigong = accent === "기공";
  return (
    <section
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden rounded-2xl border",
        isGigong
          ? "border-service-gigong-muted/80 bg-service-gigong-soft/55 shadow-[0_10px_28px_-18px_hsl(var(--service-gigong)/0.55)]"
          : "border-service-abut-muted/80 bg-service-abut-soft/55 shadow-[0_10px_28px_-18px_hsl(var(--service-abut)/0.5)]",
      )}
    >
      <div
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-1.5",
          isGigong ? "bg-service-gigong" : "bg-service-abut",
        )}
      />
      <header
        className={cn(
          "flex items-start gap-3 border-b px-4 py-3 pl-5 sm:px-5 sm:pl-6",
          isGigong
            ? "border-service-gigong-muted/60 bg-gradient-to-r from-service-gigong-soft via-white/80 to-transparent"
            : "border-service-abut-muted/60 bg-gradient-to-r from-service-abut-soft via-white/80 to-transparent",
        )}
      >
        <div
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1",
            isGigong
              ? "bg-service-gigong text-service-gigong-foreground ring-service-gigong-muted/70"
              : "bg-service-abut text-service-abut-foreground ring-service-abut-muted/70",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-foreground sm:text-[15px]">
            {title}
          </h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
            {subtitle}
          </p>
        </div>
      </header>
      <div className="flex min-w-0 flex-col gap-3 p-3 pl-4 sm:p-4 sm:pl-5">
        {children}
      </div>
    </section>
  );
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

function SummaryCardsRow({
  children,
  cardCount,
}: {
  children: React.ReactNode;
  cardCount: number;
}) {
  return (
    <div className={cn("min-w-0", RESPONSIVE.tableShell, "pb-1")}>
      <div className="flex min-w-max items-stretch gap-0.5 px-1 sm:gap-1">
        {children}
      </div>
      <span className="sr-only">{cardCount}개 요약</span>
    </div>
  );
}

function SummarySkeleton({ cardCount }: { cardCount: number }) {
  return (
    <div className={cn("min-w-0", RESPONSIVE.tableShell, "pb-1")}>
      <div className="flex min-w-max items-stretch gap-0.5 px-1 sm:gap-1">
        {Array.from({ length: cardCount }).map((_, i) => (
          <div
            key={i}
            className="min-h-[7.25rem] min-w-[8.5rem] flex-1 animate-pulse rounded-2xl border border-border/60 bg-muted/30 sm:min-w-[9.5rem] md:min-w-[10.5rem]"
          />
        ))}
      </div>
    </div>
  );
}

function TrendLineChart({
  data,
  config,
  keys,
}: {
  data: Array<PeriodRow & { label: string }>;
  config: ChartConfig;
  keys: Array<keyof typeof spendTrendChartConfig | "settlementEarnSupply">;
}) {
  if (data.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        선택한 기간에 데이터가 없습니다.
      </div>
    );
  }

  return (
    <ChartContainer config={config} className="aspect-[16/10] w-full flex-1">
      <LineChart data={data} margin={{ left: 4, right: 8, top: 4 }}>
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
                config[String(name)]?.label || String(name),
              ]}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        {keys.map((key) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={`var(--color-${key})`}
            strokeWidth={key === "spendSupply" ? 2.5 : 2}
            dot={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}

function CategoryBarChart({
  rows,
  filterBase,
  onOpenDrillDown,
}: {
  rows: StatsRow[];
  filterBase: CreditLedgerInitialFilters;
  onOpenDrillDown: (next: DrillDownState) => void;
}) {
  const categoryChartConfig = useMemo(() => {
    const config: ChartConfig = {
      amountSupply: { label: "공급가" },
    };
    for (const row of rows) {
      config[row.key] = {
        label: row.label,
        color: categoryColor(row.key),
      };
    }
    return config;
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        유형별 집계 데이터가 없습니다.
      </div>
    );
  }

  return (
    <ChartContainer
      config={categoryChartConfig}
      className="aspect-[16/10] w-full flex-1"
    >
      <BarChart data={rows} margin={{ left: 4, right: 8, top: 4, bottom: 0 }}>
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
              nameKey="key"
              formatter={(value, _name, item) => {
                const key = String(
                  (item?.payload as { key?: string } | undefined)?.key || "",
                );
                const label = categoryChartConfig[key]?.label || "공급가";
                return [supplyTooltipFormatter(value), label];
              }}
            />
          }
        />
        <Bar
          dataKey="amountSupply"
          radius={[6, 6, 0, 0]}
          className="cursor-pointer"
          onClick={(barData, _index, event) => {
            event?.stopPropagation?.();
            const key = String(
              (barData as { payload?: { key?: string } })?.payload?.key || "",
            );
            if (!key) return;
            onOpenDrillDown({
              title: `${String((barData as { payload?: { label?: string } })?.payload?.label || "유형")} 내역`,
              filters: categoryLedgerFilters(key, filterBase),
            });
          }}
        >
          {rows.map((row) => (
            <Cell key={row.key} fill={`var(--color-${row.key})`} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

export function CreditStatisticsTab() {
  const { demoMode } = useDemoMode();
  const accessKind = useAuthStore((s) => s.user?.requestorKind || null);
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
      const next = res.data.data || null;
      setStats(next);
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [period, customStartDate, customEndDate]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const isLab =
    stats?.requestorKind === "lab" ||
    (!stats && accessKind === "lab");
  const filterBase = useMemo(
    () => baseFilters(period, customStartDate, customEndDate),
    [period, customStartDate, customEndDate],
  );

  const paidChargeTotal = Number(
    stats?.summary.totalPaidChargeSupply ??
      Math.max(
        0,
        (stats?.summary.totalChargeSupply || 0) -
          (stats?.summary.totalFreeChargeSupply || 0),
      ),
  );
  const spendTotal = Number(stats?.summary.totalSpendSupply || 0);
  const settlementEarnTotal = Number(
    stats?.summary.totalSettlementEarnSupply || 0,
  );

  const trendData = useMemo(
    () =>
      (stats?.byPeriod || []).map((row) => ({
        ...row,
        label: row.ymd.slice(5).replace("-", "/"),
      })),
    [stats?.byPeriod],
  );

  const settlementCategoryRows = useMemo(
    () =>
      (stats?.byCategory || []).filter((row) =>
        SETTLEMENT_CATEGORY_KEYS.has(row.key),
      ),
    [stats?.byCategory],
  );

  const abutsCategoryRows = useMemo(
    () =>
      (stats?.byCategory || []).filter((row) =>
        ABUTS_CATEGORY_KEYS.has(row.key),
      ),
    [stats?.byCategory],
  );

  const practiceCategoryRows = useMemo(
    () =>
      (stats?.byCategory || []).filter(
        (row) => !SETTLEMENT_CATEGORY_KEYS.has(row.key),
      ),
    [stats?.byCategory],
  );

  const openDrillDown = (next: DrillDownState) => {
    setDrillDown(next);
  };

  const statCardClass =
    "min-w-[8.5rem] flex-1 sm:min-w-[9.5rem] md:min-w-[10.5rem]";

  const abutsSpendTooltip = demoMode
    ? CREDIT_LEDGER_DEMO_PERIOD_SPEND_HINT
    : "선택한 기간에 지출한 어벗 생산·배송·스토어 결제 합계입니다.";
  const practiceSpendTooltip = demoMode
    ? CREDIT_LEDGER_DEMO_PERIOD_SPEND_HINT
    : "선택한 기간에 지출한 기공료와 스토어 결제 합계입니다.";
  const chargeLabel = CREDIT_LEDGER_CHARGE_LABEL;
  const chargeDetailTitle = CREDIT_LEDGER_CHARGE_DETAIL_TITLE;
  const chargeTooltip = demoMode
    ? CREDIT_LEDGER_DEMO_CHARGE_HINT
    : "선택한 기간에 충전된 금액 합계입니다.";

  const settlementOrderCount = Number(
    stats?.summary.settlementOrderCount ?? stats?.summary.orderCount ?? 0,
  );
  const abutsOrderCount = Number(stats?.summary.abutsOrderCount ?? 0);

  const filterBar = (
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
  );

  const chargeSpendCards = ({
    spendTooltip,
    orderCount,
    orderHint,
    orderCategories,
    spendLabel = "소비",
  }: {
    spendTooltip: string;
    orderCount: number;
    orderHint: string;
    orderCategories: string;
    spendLabel?: string;
  }) => (
    <SummaryCardsRow cardCount={3}>
      <SettlementStatCard
        className={statCardClass}
        label={chargeLabel}
        value={paidChargeTotal}
        hint="안내"
        hintTooltip={chargeTooltip}
        onClick={() =>
          openDrillDown({
            title: chargeDetailTitle,
            filters: {
              ...filterBase,
              creditKind: "PAID",
              action: "CHARGE",
            },
          })
        }
      />
      <SettlementEquationOperator symbol="−" />
      <SettlementStatCard
        className={statCardClass}
        label={spendLabel}
        value={spendTotal}
        tone="primary"
        hint="안내"
        hintTooltip={spendTooltip}
        onClick={() =>
          openDrillDown({
            title: `${spendLabel} 내역`,
            filters: { ...filterBase, action: "SPEND" },
          })
        }
      />
      <SettlementStatCard
        className={statCardClass}
        label="의뢰건수"
        value={`${orderCount.toLocaleString("ko-KR")}건`}
        hint="안내"
        hintTooltip={orderHint}
        onClick={() =>
          openDrillDown({
            title: "의뢰 내역",
            filters: {
              ...filterBase,
              statsCategories: orderCategories,
            },
          })
        }
      />
    </SummaryCardsRow>
  );

  const settlementCards = (
    <SummaryCardsRow cardCount={2}>
      <SettlementStatCard
        className={statCardClass}
        label="정산 적립"
        value={settlementEarnTotal}
        hint="안내"
        hintTooltip="선택한 기간에 적립된 기공 정산(작업완료 전 적립 보류 포함)입니다."
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
      <SettlementStatCard
        className={statCardClass}
        label="의뢰건수"
        value={`${settlementOrderCount.toLocaleString("ko-KR")}건`}
        hint="안내"
        hintTooltip="치과로부터 수신한 기공의뢰(정산 적립·보류) 건수입니다."
        onClick={() =>
          openDrillDown({
            title: "치과로부터 수신 내역",
            filters: {
              ...filterBase,
              statsCategory: "settlement_earn",
            },
          })
        }
      />
    </SummaryCardsRow>
  );

  const labContent = (
    <div className="flex min-w-0 flex-col gap-6">
      {filterBar}

      <StatsFlowSection
        title="치과로부터 수신"
        subtitle="치과 → 기공소 · 정산 적립"
        accent="기공"
        icon={Building2}
      >
        {settlementCards}
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          <StatsPanel
            title="기간별 추이"
            subtitle="일별 정산 적립"
            icon={TrendingUp}
            onOpenDetail={() =>
              openDrillDown({
                title: "정산 적립 내역",
                filters: {
                  ...filterBase,
                  statsCategory: "settlement_earn",
                },
              })
            }
          >
            <TrendLineChart
              data={trendData}
              config={settlementTrendChartConfig}
              keys={["settlementEarnSupply"]}
            />
          </StatsPanel>

          <StatsPanel
            title="유형별 금액"
            subtitle="정산 적립·지급"
            icon={PieChart}
            onOpenDetail={() =>
              openDrillDown({
                title: "정산 적립 내역",
                filters: {
                  ...filterBase,
                  statsCategory: "settlement_earn",
                },
              })
            }
          >
            <CategoryBarChart
              rows={settlementCategoryRows}
              filterBase={filterBase}
              onOpenDrillDown={openDrillDown}
            />
          </StatsPanel>

          <StatsPanel
            title="치과별 적립"
            subtitle="치과별 정산 적립(보류 포함)"
            icon={Wallet}
            onOpenDetail={() =>
              openDrillDown({
                title: "치과별 적립 내역",
                filters: {
                  ...filterBase,
                  statsCategory: "settlement_earn",
                },
              })
            }
          >
            <HorizontalBarList
              rows={stats?.byPartner || []}
              emptyHint="치과로부터 수신·정산 적립이 있을 때 치과별로 표시됩니다."
              onRowClick={(row) =>
                openDrillDown({
                  title: `${row.label} 내역`,
                  filters: {
                    ...filterBase,
                    statsCategory: "settlement_earn",
                    partnerName: row.label,
                  },
                })
              }
            />
          </StatsPanel>

          <StatsPanel
            title="보철 유형별"
            subtitle="견적 라인 기준 정산 적립"
            icon={Layers3}
            onOpenDetail={() =>
              openDrillDown({
                title: "보철 유형별 거래 내역",
                filters: {
                  ...filterBase,
                  statsCategory: "settlement_earn",
                },
              })
            }
          >
            <HorizontalBarList
              rows={stats?.byProsthesisType || []}
              emptyHint="정산 적립(보류 포함)이 있을 때 보철 유형별로 표시됩니다."
              onRowClick={(row) =>
                openDrillDown({
                  title: `${row.label} 내역`,
                  filters: {
                    ...filterBase,
                    statsCategory: "settlement_earn",
                    prosthesisType: row.label,
                  },
                })
              }
            />
          </StatsPanel>
        </div>
      </StatsFlowSection>

      <StatsFlowSection
        title="어벗츠로 의뢰"
        subtitle="기공소 → 어벗츠 · 충전·소비"
        accent="어벗"
        icon={FileText}
      >
        {chargeSpendCards({
          spendTooltip: abutsSpendTooltip,
          orderCount: abutsOrderCount,
          orderHint: "어벗츠로 의뢰한 어벗생산·배송 거래 건수입니다.",
          orderCategories: ABUTS_ORDER_STATS_CATEGORIES,
        })}
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          <StatsPanel
            title="기간별 추이"
            subtitle="일별 소비·충전"
            icon={TrendingUp}
            onOpenDetail={() =>
              openDrillDown({
                title: "어벗츠 거래 내역",
                filters: {
                  ...filterBase,
                  statsCategories: "charge,abutment_production,shipping,store",
                },
              })
            }
          >
            <TrendLineChart
              data={trendData}
              config={spendTrendChartConfig}
              keys={["spendSupply", "chargeSupply"]}
            />
          </StatsPanel>

          <StatsPanel
            title="유형별 금액"
            subtitle="충전·어벗생산·배송·스토어"
            icon={PieChart}
            onOpenDetail={() =>
              openDrillDown({
                title: "어벗츠 유형별 내역",
                filters: {
                  ...filterBase,
                  statsCategories: "charge,abutment_production,shipping,store",
                },
              })
            }
          >
            <CategoryBarChart
              rows={abutsCategoryRows}
              filterBase={filterBase}
              onOpenDrillDown={openDrillDown}
            />
          </StatsPanel>
        </div>
      </StatsFlowSection>
    </div>
  );

  const practiceContent = (
    <>
      {chargeSpendCards({
        spendTooltip: practiceSpendTooltip,
        orderCount: Number(stats?.summary.orderCount || 0),
        orderHint: "기공의뢰·어벗생산·배송 거래 건수입니다.",
        orderCategories: PRACTICE_ORDER_STATS_CATEGORIES,
      })}
      {filterBar}
      <div className="grid min-w-0 gap-3 md:grid-cols-2">
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
          <TrendLineChart
            data={trendData}
            config={spendTrendChartConfig}
            keys={["spendSupply", "chargeSupply"]}
          />
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
          <CategoryBarChart
            rows={practiceCategoryRows}
            filterBase={filterBase}
            onOpenDrillDown={openDrillDown}
          />
        </StatsPanel>

        <StatsPanel
          title="기공소별 소비"
          subtitle="파트너별 공급가 합계"
          icon={Wallet}
          onOpenDetail={() =>
            openDrillDown({
              title: "기공소별 소비 내역",
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
  );

  return (
    <>
      <div className="flex min-w-0 flex-col gap-4 pb-2 pt-1">
        {loading ? (
          <>
            {isLab ? (
              <>
                <div className="h-9 w-48 animate-pulse rounded-xl border border-border/60 bg-muted/30" />
                <div className="h-9 w-40 animate-pulse rounded-xl border border-border/60 bg-muted/30" />
                <SummarySkeleton cardCount={2} />
                <div className="grid min-w-0 gap-3 md:grid-cols-2">
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
                <div className="h-9 w-36 animate-pulse rounded-xl border border-border/60 bg-muted/30" />
                <SummarySkeleton cardCount={4} />
              </>
            ) : (
              <>
                <SummarySkeleton cardCount={4} />
                <div className="h-9 w-48 animate-pulse rounded-xl border border-border/60 bg-muted/30" />
                <div className="grid min-w-0 gap-3 md:grid-cols-2">
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
            )}
          </>
        ) : isLab ? (
          labContent
        ) : (
          practiceContent
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
