// change-log:
// - 2026-08-24: 아웃라이어를 차트에서 제외하고 하단 표로 분리. 7일 필터.
// - 2026-08-24: 소요시간 라벨을 Customized+하단 수치로 표시. 관리자 대시보드 진입.
// - 2026-08-24: 소요시간 누적 막대 차트, 모달 여백·Y축 상단 여유 조정.
// related files:
// - web/backend/controllers/cnc/machiningBridge.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/MachiningQueueBoard.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Customized,
  LabelList,
  Legend,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import type { PeriodFilterValue } from "@/shared/ui/periodFilterValues";
import { appendPeriodQueryParams } from "@/store/usePeriodStore";
import { useAuthStore } from "@/store/useAuthStore";
import { formatDurationMMSS } from "@/features/manufacturer/cnc/lib/machiningUi";
import { Info } from "lucide-react";

type MachiningStatsOutlier = {
  requestId: string;
  machineId: string;
  businessName: string;
  clinicName: string;
  patientName: string;
  tooth: string;
  orderedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  outlierReason: "high" | "low";
};

type MachiningStatsOutlierCriteria = {
  lowMaxSeconds: number;
  highMinSeconds: number;
};

type MachiningStatsBucket = {
  label: "6" | "8" | "10" | "12";
  count: number;
  ratioPercent: number;
  duration: {
    minSeconds: number | null;
    avgSeconds: number | null;
    maxSeconds: number | null;
    sampleCount: number;
  };
  outliers: MachiningStatsOutlier[];
};

type MachiningStatisticsData = {
  period: { from: string; to: string };
  totalCount: number;
  outlierCriteria?: MachiningStatsOutlierCriteria;
  buckets: MachiningStatsBucket[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token?: string | null;
};

const DIAMETER_LABELS = ["6", "8", "10", "12"] as const;

/** 백엔드 SSOT와 동일 기본값 (API outlierCriteria 없을 때 폴백) */
const DEFAULT_OUTLIER_CRITERIA: MachiningStatsOutlierCriteria = {
  lowMaxSeconds: 3 * 60,
  highMinSeconds: 15 * 60,
};

const countRatioChartConfig = {
  count: { label: "제작 건수", color: "hsl(228 92% 78%)" },
  ratioPercent: { label: "비율", color: "hsl(215 22% 58%)" },
} satisfies ChartConfig;

const durationChartConfig = {
  stackMin: { label: "최소", color: "hsl(158 68% 62%)" },
  stackAvg: { label: "평균", color: "hsl(228 92% 78%)" },
  stackMax: { label: "최대", color: "hsl(348 88% 76%)" },
} satisfies ChartConfig;

const DIAMETER_TICKS = DIAMETER_LABELS.map((label) => `${label}mm`);

const CHART_AXIS_FONT = 18;
const CHART_LABEL_FONT = 18;
const CHART_BAR_LABEL_FONT = 14;
const CHART_LEGEND_FONT = 18;
const COUNT_BAR_SIZE = 56;
const DURATION_BAR_SIZE = 80;

const CHART_MARGIN = { left: 4, right: 20, top: 8, bottom: 4 };

const CHART_LEGEND_PROPS = {
  verticalAlign: "top" as const,
  align: "center" as const,
  height: 32,
  wrapperStyle: { fontSize: CHART_LEGEND_FONT, top: 0 },
};

const MODAL_BODY_MAX_HEIGHT = "calc(100vh - 1.5rem)";
const CHART_AREA_HEIGHT = "min(44vh, 400px)";
/** thead 1행 + 본문 2.5행 (text-[11px] py-1 기준) */
const OUTLIER_TABLE_MAX_HEIGHT = "calc(1.625rem * 3.5)";

type DurationChartRow = {
  label: string;
  minMin: number | null;
  avgMin: number | null;
  maxMin: number | null;
  stackMin: number;
  stackAvg: number;
  stackMax: number;
  sampleCount: number;
};

const secondsToMinutes = (seconds: number | null | undefined) => {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    return 0;
  }
  return Math.round((seconds / 60) * 10) / 10;
};

const toChartMinutes = (seconds: number | null | undefined) => {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  return secondsToMinutes(seconds);
};

const formatMinutesTick = (value: number) => {
  if (!Number.isFinite(value)) return "0";
  if (value >= 10) return `${Math.round(value)}분`;
  return `${value}분`;
};

const minutesToDurationLabel = (minutes: number | null | undefined) => {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) {
    return "";
  }
  return formatDurationMMSS(Math.round(minutes * 60));
};

type AxisScale = {
  scale?: ((value: string | number) => number) & {
    bandwidth?: () => number;
  };
};

type DurationValueLabelsProps = {
  rows: DurationChartRow[];
  xAxisMap?: Record<string, AxisScale>;
  yAxisMap?: Record<string, AxisScale>;
};

const durationStackLabelText = (cx: number, cy: number, text: string, key: string) => (
  <text
    key={key}
    x={cx}
    y={cy}
    fill="hsl(215 28% 17%)"
    stroke="#fff"
    strokeWidth={3.5}
    paintOrder="stroke"
    textAnchor="middle"
    dominantBaseline="central"
    fontSize={CHART_BAR_LABEL_FONT}
    fontWeight={700}
    pointerEvents="none"
  >
    {text}
  </text>
);

type ChartLabelContentProps = {
  x?: number | string;
  y?: number | string;
  value?: number | string;
  offset?: number;
};

const renderOutlinedTopLabel =
  (format: (value: number) => string, fill = "hsl(215 28% 17%)") =>
  (props: ChartLabelContentProps) => {
    const raw = Number(props.value);
    if (!Number.isFinite(raw) || raw <= 0) return null;
    const text = format(raw);
    if (!text) return null;
    const x = Number(props.x ?? 0);
    const y = Number(props.y ?? 0);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    return (
      <text
        x={x}
        y={y}
        fill={fill}
        stroke="#fff"
        strokeWidth={3.5}
        paintOrder="stroke"
        textAnchor="middle"
        dominantBaseline="auto"
        fontSize={CHART_LABEL_FONT}
        fontWeight={600}
        pointerEvents="none"
      >
        {text}
      </text>
    );
  };

/** LabelList on stacked bars is unreliable — place labels via axis scales. */
function DurationValueLabels({
  rows,
  xAxisMap,
  yAxisMap,
}: DurationValueLabelsProps) {
  const xAxis = xAxisMap ? Object.values(xAxisMap)[0] : undefined;
  const yAxis = yAxisMap ? Object.values(yAxisMap)[0] : undefined;
  const xScale = xAxis?.scale;
  const yScale = yAxis?.scale;
  if (!xScale || !yScale) return null;

  const bandwidth = typeof xScale.bandwidth === "function" ? xScale.bandwidth() : 0;

  return (
    <g className="recharts-duration-value-labels" pointerEvents="none">
      {rows.map((row) => {
        if ((row.sampleCount ?? 0) <= 0) return null;
        const stackMin = row.stackMin ?? 0;
        const stackAvg = row.stackAvg ?? 0;
        const stackMax = row.stackMax ?? 0;
        if (stackMin <= 0 && stackAvg <= 0 && stackMax <= 0) return null;

        const xBand = xScale(row.label);
        if (!Number.isFinite(xBand)) return null;
        const cx = xBand + bandwidth / 2;

        const y0 = yScale(0);
        const yMinTop = yScale(stackMin);
        const yAvgTop = yScale(stackMin + stackAvg);
        const yMaxTop = yScale(stackMin + stackAvg + stackMax);
        if (
          ![y0, yMinTop, yAvgTop, yMaxTop].every((v) => Number.isFinite(v))
        ) {
          return null;
        }

        const nodes = [];
        if (stackMin > 0) {
          const text = minutesToDurationLabel(row.minMin);
          if (text) {
            nodes.push(
              durationStackLabelText(cx, (y0 + yMinTop) / 2, text, `${row.label}-min`),
            );
          }
        }
        if (stackAvg > 0) {
          const text = minutesToDurationLabel(row.avgMin);
          if (text) {
            nodes.push(
              durationStackLabelText(
                cx,
                (yMinTop + yAvgTop) / 2,
                text,
                `${row.label}-avg`,
              ),
            );
          }
        }
        if (stackMax > 0 || (stackAvg <= 0 && stackMin <= 0)) {
          const text = minutesToDurationLabel(row.maxMin);
          if (text) {
            const cy =
              stackMax > 0 ? (yAvgTop + yMaxTop) / 2 : (y0 + yMaxTop) / 2;
            nodes.push(durationStackLabelText(cx, cy, text, `${row.label}-max`));
          }
        }
        return nodes.length ? (
          <g key={row.label}>{nodes}</g>
        ) : null;
      })}
    </g>
  );
}

const durationTooltipFormatter = (value: unknown) => {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return "-";
  return formatDurationMMSS(Math.round(minutes * 60));
};

const durationYAxisMax = (dataMax: number) =>
  Math.ceil((dataMax || 1) * 1.22 + 0.4);

function DurationChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    payload?: DurationChartRow;
    name?: string;
    value?: number;
  }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;
  if (
    !point ||
    (point.minMin == null && point.avgMin == null && point.maxMin == null)
  ) {
    return null;
  }

  return (
    <div className="grid min-w-[8rem] gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md">
      <div className="font-semibold text-slate-900">{label}</div>
      {point.minMin != null ? (
        <div className="flex items-center justify-between gap-3 text-slate-600">
          <span>최소</span>
          <span className="font-medium text-slate-900">
            {durationTooltipFormatter(point.minMin)}
          </span>
        </div>
      ) : null}
      {point.avgMin != null ? (
        <div className="flex items-center justify-between gap-3 text-slate-600">
          <span>평균</span>
          <span className="font-medium text-slate-900">
            {durationTooltipFormatter(point.avgMin)}
          </span>
        </div>
      ) : null}
      {point.maxMin != null ? (
        <div className="flex items-center justify-between gap-3 text-slate-600">
          <span>최대</span>
          <span className="font-medium text-slate-900">
            {durationTooltipFormatter(point.maxMin)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function MachiningStatisticsModal({ open, onOpenChange, token }: Props) {
  const authToken = useAuthStore((s) => s.token);
  const resolvedToken = token || authToken;
  const [period, setPeriod] = useState<PeriodFilterValue>("30d");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [data, setData] = useState<MachiningStatisticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !resolvedToken) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        appendPeriodQueryParams(params, period, {
          customStartDate,
          customEndDate,
        });
        const res = await fetch(
          `/api/cnc-machines/machining/statistics?${params.toString()}`,
          { headers: { Authorization: `Bearer ${resolvedToken}` } },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body?.success === false) {
          throw new Error(body?.message || "통계를 불러오지 못했습니다.");
        }
        if (!cancelled) setData(body?.data || null);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "통계를 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, resolvedToken, period, customStartDate, customEndDate]);

  const buckets = useMemo(() => {
    const map = new Map(
      (data?.buckets ?? []).map((bucket) => [bucket.label, bucket]),
    );
    return DIAMETER_LABELS.map(
      (label) =>
        map.get(label) ?? {
          label,
          count: 0,
          ratioPercent: 0,
          duration: {
            minSeconds: null,
            avgSeconds: null,
            maxSeconds: null,
            sampleCount: 0,
          },
          outliers: [],
        },
    );
  }, [data?.buckets]);

  const chartRows = useMemo(
    () =>
      buckets.map((bucket) => ({
        label: `${bucket.label}mm`,
        diameter: bucket.label,
        count: bucket.count,
        ratioPercent: bucket.ratioPercent,
      })),
    [buckets],
  );

  const durationChartRows = useMemo<DurationChartRow[]>(
    () =>
      buckets.map((bucket) => {
        const min = toChartMinutes(bucket.duration.minSeconds);
        const avg = toChartMinutes(bucket.duration.avgSeconds);
        const max = toChartMinutes(bucket.duration.maxSeconds);
        const hasData =
          min != null &&
          avg != null &&
          max != null &&
          bucket.duration.sampleCount > 0;

        return {
          label: `${bucket.label}mm`,
          minMin: min,
          avgMin: avg,
          maxMin: max,
          stackMin: hasData ? min : 0,
          stackAvg: hasData ? Math.max(0, avg - min) : 0,
          stackMax: hasData ? Math.max(0, max - avg) : 0,
          sampleCount: bucket.duration.sampleCount,
        };
      }),
    [buckets],
  );

  const hasDurationSamples = buckets.some(
    (bucket) => bucket.duration.sampleCount > 0,
  );

  const outlierRows = useMemo(() => {
    const rows: Array<MachiningStatsOutlier & { diameterLabel: string }> = [];
    for (const bucket of buckets) {
      for (const outlier of bucket.outliers) {
        rows.push({
          ...outlier,
          diameterLabel: `${bucket.label}mm`,
        });
      }
    }
    return rows.sort(
      (a, b) => (b.durationSeconds || 0) - (a.durationSeconds || 0),
    );
  }, [buckets]);

  const outlierCriteria = data?.outlierCriteria ?? DEFAULT_OUTLIER_CRITERIA;
  const outlierLowMaxMinutes = Math.round(outlierCriteria.lowMaxSeconds / 60);
  const outlierHighMinMinutes = Math.round(outlierCriteria.highMinSeconds / 60);
  const outlierCriteriaTooltip = `단시간: ${outlierLowMaxMinutes}분 이하 · 장시간: ${outlierHighMinMinutes}분 이상. 차트·카드 수치에서 제외됩니다.`;
  const outlierCriteriaShortLabel = `${outlierLowMaxMinutes}분↓ / ${outlierHighMinMinutes}분↑ 제외`;

  const durationLegendPayload = useMemo(
    () => [
      {
        value: "최소",
        type: "square" as const,
        color: "hsl(158 68% 62%)",
      },
      {
        value: "평균",
        type: "square" as const,
        color: "hsl(228 92% 78%)",
      },
      {
        value: "최대",
        type: "square" as const,
        color: "hsl(348 88% 76%)",
      },
    ],
    [],
  );

  const durationYAxisCap = useMemo(() => {
    const barPeak = durationChartRows.reduce(
      (peak, row) => Math.max(peak, row.maxMin ?? 0),
      0,
    );
    return durationYAxisMax(barPeak);
  }, [durationChartRows]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[var(--machining-stats-modal-max-h)] flex-col gap-0 overflow-hidden rounded-2xl border border-slate-200/80 p-0 shadow-[0_24px_64px_rgba(15,23,42,0.28)] sm:max-w-7xl"
        style={
          {
            "--machining-stats-modal-max-h": MODAL_BODY_MAX_HEIGHT,
            "--machining-stats-chart-h": CHART_AREA_HEIGHT,
            "--machining-stats-outlier-table-max-h": OUTLIER_TABLE_MAX_HEIGHT,
          } as CSSProperties
        }
      >
        <div className="shrink-0 px-5 pt-4 pb-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <DialogHeader className="space-y-0 p-0">
              <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">
                가공 통계
              </DialogTitle>
              <DialogDescription className="sr-only">
                직경별 제작 건수·비율 및 가공 소요시간 통계
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
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
                presets={["7d", "30d", "90d", "180d", "thisMonth"]}
              />
              {loading ? (
                <span className="shrink-0 text-xs text-slate-500">조회 중…</span>
              ) : data ? (
                <span className="shrink-0 text-sm text-slate-600">
                  총{" "}
                  <span className="font-semibold text-slate-900">
                    {data.totalCount.toLocaleString("ko-KR")}건
                  </span>
                  {data.period?.from && data.period?.to ? (
                    <span className="ml-1.5 text-xs text-slate-500">
                      ({data.period.from} ~ {data.period.to})
                    </span>
                  ) : null}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">
          {loading ? (
            <div className="flex h-[var(--machining-stats-chart-h)] items-center justify-center text-sm text-slate-500">
              통계 조회 중…
            </div>
          ) : error ? (
            <div className="flex h-[var(--machining-stats-chart-h)] items-center justify-center">
              <div className="rounded-lg border border-destructive-muted bg-destructive-soft px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            </div>
          ) : !data ? (
            <div className="flex h-[var(--machining-stats-chart-h)] items-center justify-center text-sm text-slate-500">
              표시할 데이터가 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-2">
                <section className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-slate-100 bg-gradient-to-b from-slate-50/90 to-white p-3 shadow-sm">
                  <h3 className="mb-1 shrink-0 px-1 text-xs font-semibold tracking-tight text-slate-600">
                    직경별 제작 건수 · 비율
                  </h3>
                  <ChartContainer
                    config={countRatioChartConfig}
                    className="aspect-auto min-h-[var(--machining-stats-chart-h)] w-full flex-1"
                  >
                    <ComposedChart
                      data={chartRows}
                      margin={CHART_MARGIN}
                    >
                      <CartesianGrid
                        vertical={false}
                        strokeDasharray="3 3"
                        stroke="hsl(214 32% 91%)"
                      />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: CHART_AXIS_FONT, fill: "hsl(215 16% 47%)" }}
                      />
                      <YAxis
                        yAxisId="count"
                        tickLine={false}
                        axisLine={false}
                        width={44}
                        allowDecimals={false}
                        tick={{ fontSize: CHART_AXIS_FONT, fill: "hsl(215 16% 47%)" }}
                      />
                      <YAxis
                        yAxisId="ratio"
                        orientation="right"
                        tickLine={false}
                        axisLine={false}
                        width={56}
                        domain={[0, 100]}
                        tick={{ fontSize: CHART_AXIS_FONT, fill: "hsl(215 16% 47%)" }}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            labelKey="label"
                            formatter={(value, name) => {
                              if (name === "ratioPercent") {
                                return [
                                  `${Number(value).toFixed(1)}%`,
                                  "비율",
                                ];
                              }
                              return [
                                `${Number(value).toLocaleString("ko-KR")}건`,
                                "제작",
                              ];
                            }}
                          />
                        }
                      />
                      <Legend {...CHART_LEGEND_PROPS} />
                      <Bar
                        yAxisId="count"
                        dataKey="count"
                        fill="var(--color-count)"
                        radius={[8, 8, 0, 0]}
                        name="제작 건수"
                        barSize={COUNT_BAR_SIZE}
                      >
                        <LabelList
                          dataKey="count"
                          position="top"
                          content={renderOutlinedTopLabel((value) =>
                            `${value.toLocaleString("ko-KR")}건`,
                          )}
                        />
                      </Bar>
                      <Line
                        yAxisId="ratio"
                        type="monotone"
                        dataKey="ratioPercent"
                        stroke="var(--color-ratioPercent)"
                        strokeWidth={3}
                        dot={{ r: 6, fill: "var(--color-ratioPercent)" }}
                        activeDot={{ r: 7 }}
                        name="비율"
                      >
                        <LabelList
                          dataKey="ratioPercent"
                          position="top"
                          offset={12}
                          content={renderOutlinedTopLabel(
                            (value) => `${value.toFixed(1)}%`,
                            "hsl(215 16% 40%)",
                          )}
                        />
                      </Line>
                    </ComposedChart>
                  </ChartContainer>
                </section>

                <section className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-slate-100 bg-gradient-to-b from-slate-50/90 to-white p-3 shadow-sm">
                  <h3 className="mb-1 shrink-0 px-1 text-xs font-semibold tracking-tight text-slate-600">
                    직경별 가공 소요시간 비교 (최소 · 평균 · 최대)
                  </h3>
                  {hasDurationSamples ? (
                    <>
                    <ChartContainer
                      config={durationChartConfig}
                      className="aspect-auto h-[var(--machining-stats-chart-h)] w-full shrink-0"
                    >
                      <ComposedChart
                        data={durationChartRows}
                        margin={CHART_MARGIN}
                        barCategoryGap="12%"
                      >
                        <CartesianGrid
                          vertical={false}
                          strokeDasharray="3 3"
                          stroke="hsl(214 32% 91%)"
                        />
                        <XAxis
                          dataKey="label"
                          type="category"
                          ticks={DIAMETER_TICKS}
                          tickLine={false}
                          axisLine={false}
                          tick={false}
                          height={8}
                          interval={0}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          width={50}
                          tick={{ fontSize: CHART_AXIS_FONT, fill: "hsl(215 16% 47%)" }}
                          tickFormatter={formatMinutesTick}
                          domain={[0, durationYAxisCap]}
                        />
                        <ChartTooltip content={<DurationChartTooltip />} />
                        <Legend
                          {...CHART_LEGEND_PROPS}
                          payload={durationLegendPayload}
                        />
                        <Bar
                          dataKey="stackMin"
                          stackId="duration"
                          fill="var(--color-stackMin)"
                          name="최소"
                          maxBarSize={DURATION_BAR_SIZE}
                          isAnimationActive={false}
                        />
                        <Bar
                          dataKey="stackAvg"
                          stackId="duration"
                          fill="var(--color-stackAvg)"
                          name="평균"
                          maxBarSize={DURATION_BAR_SIZE}
                          isAnimationActive={false}
                        />
                        <Bar
                          dataKey="stackMax"
                          stackId="duration"
                          fill="var(--color-stackMax)"
                          name="최대"
                          radius={[8, 8, 0, 0]}
                          maxBarSize={DURATION_BAR_SIZE}
                          isAnimationActive={false}
                        />
                        <Customized
                          component={(chartProps: Record<string, unknown>) => (
                            <DurationValueLabels
                              rows={durationChartRows}
                              xAxisMap={
                                chartProps.xAxisMap as DurationValueLabelsProps["xAxisMap"]
                              }
                              yAxisMap={
                                chartProps.yAxisMap as DurationValueLabelsProps["yAxisMap"]
                              }
                            />
                          )}
                        />
                      </ComposedChart>
                    </ChartContainer>
                    <div className="mt-3 shrink-0 rounded-xl border border-slate-100 bg-white/90 px-2 py-2">
                        <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
                          <div className="flex items-center gap-1">
                            <h4 className="text-xs font-semibold text-slate-600">
                              아웃라이어 ({outlierRows.length}건)
                            </h4>
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="inline-flex h-4 w-4 items-center justify-center rounded text-slate-400 hover:text-slate-600"
                                    aria-label="아웃라이어 판정 기준"
                                  >
                                    <Info className="h-3.5 w-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent
                                  side="top"
                                  className="max-w-[16rem] text-xs leading-relaxed"
                                >
                                  {outlierCriteriaTooltip}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {outlierCriteriaShortLabel}
                          </span>
                        </div>
                        {outlierRows.length > 0 ? (
                        <div className="max-h-[var(--machining-stats-outlier-table-max-h)] overflow-y-auto">
                          <table className="w-full min-w-[28rem] border-collapse text-left text-[11px]">
                            <thead className="sticky top-0 bg-white text-slate-500">
                              <tr className="border-b border-slate-100">
                                <th className="px-1.5 py-1 font-semibold">직경</th>
                                <th className="px-1.5 py-1 font-semibold">구분</th>
                                <th className="px-1.5 py-1 font-semibold">소요</th>
                                <th className="px-1.5 py-1 font-semibold">기공소</th>
                                <th className="px-1.5 py-1 font-semibold">치과</th>
                                <th className="px-1.5 py-1 font-semibold">치아</th>
                              </tr>
                            </thead>
                            <tbody>
                              {outlierRows.map((row, index) => (
                                <tr
                                  key={`${row.requestId}-${index}`}
                                  className="border-b border-slate-50 text-slate-700"
                                >
                                  <td className="px-1.5 py-1 tabular-nums">
                                    {row.diameterLabel}
                                  </td>
                                  <td className="px-1.5 py-1">
                                    <span
                                      className={
                                        row.outlierReason === "high"
                                          ? "font-semibold text-orange-600"
                                          : "font-semibold text-sky-600"
                                      }
                                    >
                                      {row.outlierReason === "high"
                                        ? "장시간"
                                        : "단시간"}
                                    </span>
                                  </td>
                                  <td className="px-1.5 py-1 font-semibold tabular-nums text-slate-900">
                                    {formatDurationMMSS(row.durationSeconds ?? 0)}
                                  </td>
                                  <td className="max-w-[7rem] truncate px-1.5 py-1">
                                    {row.businessName || "-"}
                                  </td>
                                  <td className="max-w-[6rem] truncate px-1.5 py-1">
                                    {row.clinicName || "-"}
                                  </td>
                                  <td className="px-1.5 py-1 tabular-nums">
                                    {row.tooth || "-"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        ) : (
                          <div className="px-1 py-1 text-[11px] text-slate-400">
                            해당 기간에 아웃라이어가 없습니다.
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex h-[var(--machining-stats-chart-h)] items-center justify-center text-sm text-slate-500">
                      소요시간 데이터가 없습니다.
                    </div>
                  )}
                </section>
              </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
