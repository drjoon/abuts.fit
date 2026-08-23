// change-log:
// - 2026-08-24: 건수·비율 차트 라벨, 소요시간 직경별 그룹 막대(최소·평균·최대).
// related files:
// - web/backend/controllers/cnc/machiningBridge.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/MachiningQueueBoard.tsx
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
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
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import type { PeriodFilterValue } from "@/shared/ui/periodFilterValues";
import { appendPeriodQueryParams } from "@/store/usePeriodStore";
import { formatDurationMMSS } from "@/features/manufacturer/cnc/lib/machiningUi";

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
  buckets: MachiningStatsBucket[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token?: string | null;
};

const DIAMETER_LABELS = ["6", "8", "10", "12"] as const;

const countRatioChartConfig = {
  count: { label: "제작 건수", color: "hsl(var(--primary))" },
  ratioPercent: { label: "비율", color: "hsl(215 16% 47%)" },
} satisfies ChartConfig;

const durationChartConfig = {
  minMin: { label: "최소", color: "hsl(142 71% 45%)" },
  avgMin: { label: "평균", color: "hsl(var(--primary))" },
  maxMin: { label: "최대", color: "hsl(var(--destructive))" },
} satisfies ChartConfig;

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

const durationTooltipFormatter = (value: unknown) => {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return "-";
  return formatDurationMMSS(Math.round(minutes * 60));
};

export function MachiningStatisticsModal({ open, onOpenChange, token }: Props) {
  const [period, setPeriod] = useState<PeriodFilterValue>("30d");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [data, setData] = useState<MachiningStatisticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !token) return;
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
          { headers: { Authorization: `Bearer ${token}` } },
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
  }, [open, token, period, customStartDate, customEndDate]);

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
        minMin: toChartMinutes(bucket.duration.minSeconds),
        avgMin: toChartMinutes(bucket.duration.avgSeconds),
        maxMin: toChartMinutes(bucket.duration.maxSeconds),
        sampleCount: bucket.duration.sampleCount,
      })),
    [buckets],
  );

  const hasDurationSamples = buckets.some(
    (bucket) => bucket.duration.sampleCount > 0,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden rounded-2xl border border-slate-200/80 p-0 shadow-[0_24px_64px_rgba(15,23,42,0.28)] sm:max-w-5xl">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-5 py-4 sm:px-6">
          <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">
            가공 통계
          </DialogTitle>
          <DialogDescription className="mt-0.5 text-xs text-slate-500">
            직경별 제작 수·비율·소요시간 비교 · 아웃라이어 상세
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 border-b border-slate-100 px-5 py-3 sm:px-6">
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">
              통계 조회 중…
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive-muted bg-destructive-soft px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : !data ? (
            <div className="py-10 text-center text-sm text-slate-500">
              표시할 데이터가 없습니다.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="text-sm text-slate-600">
                총{" "}
                <span className="font-semibold text-slate-900">
                  {data.totalCount.toLocaleString("ko-KR")}건
                </span>
                {data.period?.from && data.period?.to ? (
                  <span className="ml-2 text-xs text-slate-500">
                    ({data.period.from} ~ {data.period.to})
                  </span>
                ) : null}
              </div>

              <section className="rounded-xl border border-slate-200 bg-white p-3">
                <h3 className="mb-2 px-1 text-xs font-semibold text-slate-700">
                  직경별 제작 건수 · 비율
                </h3>
                <ChartContainer
                  config={countRatioChartConfig}
                  className="aspect-[5/2] w-full"
                >
                  <ComposedChart
                    data={chartRows}
                    margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
                  >
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      yAxisId="count"
                      tickLine={false}
                      axisLine={false}
                      width={36}
                      allowDecimals={false}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      yAxisId="ratio"
                      orientation="right"
                      tickLine={false}
                      axisLine={false}
                      width={40}
                      domain={[0, 100]}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelKey="label"
                          formatter={(value, name) => {
                            if (name === "ratioPercent") {
                              return [`${Number(value).toFixed(1)}%`, "비율"];
                            }
                            return [
                              `${Number(value).toLocaleString("ko-KR")}건`,
                              "제작",
                            ];
                          }}
                        />
                      }
                    />
                    <Legend
                      verticalAlign="top"
                      height={28}
                      wrapperStyle={{ fontSize: 11 }}
                    />
                    <Bar
                      yAxisId="count"
                      dataKey="count"
                      fill="var(--color-count)"
                      radius={[6, 6, 0, 0]}
                      name="제작 건수"
                      barSize={40}
                    >
                      <LabelList
                        dataKey="count"
                        position="top"
                        className="fill-slate-700"
                        fontSize={10}
                        fontWeight={600}
                        formatter={(value: number) =>
                          Number(value) > 0
                            ? `${Number(value).toLocaleString("ko-KR")}건`
                            : ""
                        }
                      />
                    </Bar>
                    <Line
                      yAxisId="ratio"
                      type="monotone"
                      dataKey="ratioPercent"
                      stroke="var(--color-ratioPercent)"
                      strokeWidth={2}
                      dot={{ r: 4, fill: "var(--color-ratioPercent)" }}
                      activeDot={{ r: 5 }}
                      name="비율"
                    >
                      <LabelList
                        dataKey="ratioPercent"
                        position="top"
                        offset={10}
                        className="fill-slate-600"
                        fontSize={10}
                        fontWeight={600}
                        formatter={(value: number) =>
                          Number(value) > 0
                            ? `${Number(value).toFixed(1)}%`
                            : ""
                        }
                      />
                    </Line>
                  </ComposedChart>
                </ChartContainer>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-3">
                <h3 className="mb-2 px-1 text-xs font-semibold text-slate-700">
                  직경별 가공 소요시간 비교 (최소 · 평균 · 최대)
                </h3>
                {hasDurationSamples ? (
                  <ChartContainer
                    config={durationChartConfig}
                    className="aspect-[16/7] w-full"
                  >
                    <BarChart
                      data={chartRows}
                      margin={{ left: 4, right: 8, top: 24, bottom: 0 }}
                      barCategoryGap="24%"
                      barGap={4}
                    >
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11 }}
                        interval={0}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={44}
                        tick={{ fontSize: 11 }}
                        tickFormatter={formatMinutesTick}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            labelKey="label"
                            formatter={(value, name) => [
                              durationTooltipFormatter(value),
                              String(name),
                            ]}
                          />
                        }
                      />
                      <Legend
                        verticalAlign="top"
                        height={24}
                        wrapperStyle={{ fontSize: 11 }}
                      />
                      <Bar
                        dataKey="minMin"
                        fill="var(--color-minMin)"
                        radius={[4, 4, 0, 0]}
                        name="최소"
                        maxBarSize={28}
                      >
                        <LabelList
                          dataKey="minMin"
                          position="top"
                          fontSize={9}
                          fontWeight={600}
                          className="fill-emerald-700"
                          formatter={(value: number | null) =>
                            minutesToDurationLabel(value)
                          }
                        />
                      </Bar>
                      <Bar
                        dataKey="avgMin"
                        fill="var(--color-avgMin)"
                        radius={[4, 4, 0, 0]}
                        name="평균"
                        maxBarSize={28}
                      >
                        <LabelList
                          dataKey="avgMin"
                          position="top"
                          fontSize={9}
                          fontWeight={600}
                          className="fill-primary-strong"
                          formatter={(value: number | null) =>
                            minutesToDurationLabel(value)
                          }
                        />
                      </Bar>
                      <Bar
                        dataKey="maxMin"
                        fill="var(--color-maxMin)"
                        radius={[4, 4, 0, 0]}
                        name="최대"
                        maxBarSize={28}
                      >
                        <LabelList
                          dataKey="maxMin"
                          position="top"
                          fontSize={9}
                          fontWeight={600}
                          className="fill-destructive"
                          formatter={(value: number | null) =>
                            minutesToDurationLabel(value)
                          }
                        />
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <div className="flex aspect-[16/7] items-center justify-center text-sm text-slate-500">
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
