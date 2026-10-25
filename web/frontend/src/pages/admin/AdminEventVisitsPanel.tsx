// related files:
// - web/frontend/src/pages/admin/AdminEventsPage.tsx
// - web/frontend/src/shared/events/eventsApi.ts
// - web/backend/controllers/events/eventVisit.controller.js
import { useCallback, useEffect, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { AdminPanel } from "@/pages/admin/adminUi";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";
import {
  eventsApi,
  type EventVisitReport,
} from "@/shared/events/eventsApi";

const DEVICE_LABEL: Record<string, string> = {
  mobile: "모바일",
  tablet: "태블릿",
  desktop: "데스크톱",
};

const RANGES = [
  { days: 1, label: "오늘" },
  { days: 7, label: "7일" },
  { days: 30, label: "30일" },
] as const;

function formatWhen(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDwell(ms?: number) {
  const sec = Math.max(0, Math.round((ms || 0) / 1000));
  if (sec < 60) return `${sec}초`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return rem ? `${min}분 ${rem}초` : `${min}분`;
  const hour = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${hour}시간 ${rest}분` : `${hour}시간`;
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">
        {value}
      </div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}

const trendConfig = {
  sessions: { label: "방문", color: "hsl(var(--primary))" },
  applications: { label: "신청", color: "hsl(var(--accent))" },
  rate: { label: "신청율", color: "hsl(var(--foreground))" },
};

type TrendPoint = {
  label: string;
  sessions: number;
  applications: number;
  rate: number;
};

function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="overflow-x-auto px-1.5 py-1.5">
      <ChartContainer config={trendConfig} className="aspect-auto h-56 w-full">
        <ComposedChart data={data} margin={{ left: 0, right: 4, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            yAxisId="count"
            allowDecimals={false}
            width={28}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            yAxisId="rate"
            orientation="right"
            width={32}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `${value}%`}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, _name, item) => {
                  const key = String(item?.dataKey || "");
                  const label =
                    key === "rate" ? "신청율" : key === "applications" ? "신청" : "방문";
                  const shown = key === "rate" ? `${value}%` : String(value ?? 0);
                  return (
                    <div className="flex w-full items-center justify-between gap-3">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium tabular-nums">{shown}</span>
                    </div>
                  );
                }}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar
            yAxisId="count"
            dataKey="sessions"
            fill="var(--color-sessions)"
            radius={3}
            maxBarSize={16}
          />
          <Bar
            yAxisId="count"
            dataKey="applications"
            fill="var(--color-applications)"
            radius={3}
            maxBarSize={16}
          />
          <Line
            yAxisId="rate"
            dataKey="rate"
            stroke="var(--color-rate)"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}

function Funnel({
  steps,
}: {
  steps: { label: string; value: number; hint?: string }[];
}) {
  const top = Math.max(1, ...steps.map((step) => step.value));
  return (
    <ol className="space-y-2">
      {steps.map((step) => {
        const width = Math.max(step.value > 0 ? 8 : 0, Math.round((step.value / top) * 100));
        return (
          <li key={step.label}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{step.label}</span>
              <span className="shrink-0 tabular-nums">
                {step.value}
                {step.hint ? (
                  <span className="ml-1 text-[11px] text-muted-foreground">{step.hint}</span>
                ) : null}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${width}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function CountList({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; hint?: string }[];
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-slate-700">{title}</div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">없음</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => (
            <li
              key={`${title}-${row.label}`}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span className="min-w-0 truncate">{row.label}</span>
              <span className="shrink-0 tabular-nums text-slate-700">
                {row.value}
                {row.hint ? (
                  <span className="ml-1 text-[11px] text-muted-foreground">
                    {row.hint}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AdminEventVisitsPanel({
  token,
  eventId,
  reloadToken = 0,
}: {
  token: string | null;
  eventId: string;
  reloadToken?: number;
}) {
  const { toast } = useToast();
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const [trend, setTrend] = useState<"day" | "hour">("day");
  const [report, setReport] = useState<EventVisitReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await eventsApi.adminVisits(token, eventId, days);
      setReport(res);
    } catch (error) {
      toast({
        title: "통계 조회 실패",
        description: error instanceof Error ? error.message : "다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [token, eventId, days, toast]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const summary = report?.summary;
  const funnel = report?.funnel;
  const empty = !loading && (summary?.sessions || 0) === 0 && (summary?.applications || 0) === 0;

  return (
    <AdminPanel
      title="통계"
      actions={
        <div className="flex gap-1">
          {RANGES.map((range) => (
            <Button
              key={range.days}
              type="button"
              size="sm"
              variant={days === range.days ? "default" : "outline"}
              className="h-8"
              onClick={() => setDays(range.days)}
            >
              {range.label}
            </Button>
          ))}
        </div>
      }
    >
      {loading && !report ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="방문"
              value={`${summary?.sessions ?? 0}`}
              hint={
                [
                  summary?.returning ? `재방문 ${summary.returning}` : "",
                  summary?.bounces ? `바로 이탈 ${summary.bounces}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
            />
            <Stat label="순방문" value={`${summary?.uniqueVisitors ?? 0}`} />
            <Stat label="평균 체류" value={formatDwell(summary?.avgDwellMs)} />
            <Stat
              label="접수"
              value={`${summary?.applications ?? 0}`}
              hint={`방문 대비 ${summary?.conversionRate ?? 0}%`}
            />
          </div>

          {empty ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              이 기간의 방문이 없습니다.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-8">
                <div className="min-w-0">
                  <div className="mb-1 text-xs font-medium text-slate-700">방문</div>
                  <Funnel
                    steps={[
                      { label: "방문", value: funnel?.sessions ?? 0 },
                      { label: "신청 구간", value: funnel?.reachedApply ?? 0 },
                      { label: "입력 시작", value: funnel?.formStarted ?? 0 },
                      { label: "신청 완료", value: funnel?.converted ?? 0 },
                    ]}
                  />
                </div>
                <div className="min-w-0">
                  <div className="mb-1 text-xs font-medium text-slate-700">
                    방문한 페이지
                  </div>
                  {(report?.pages || []).length > 0 ? (
                    <Funnel
                      steps={(report?.pages || []).map((row) => ({
                        label: row.label,
                        value: row.sessions,
                      }))}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">없음</p>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="mb-1 text-xs font-medium text-slate-700">지역</div>
                  {(report?.regions || []).length > 0 ? (
                    <Funnel
                      steps={(report?.regions || []).map((row) => ({
                        label: row.label,
                        value: row.sessions,
                        hint: row.converted ? `신청 ${row.converted}` : undefined,
                      }))}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">없음</p>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="mb-1 text-xs font-medium text-slate-700">기기</div>
                  {(report?.devices || []).length > 0 ? (
                    <Funnel
                      steps={[...(report?.devices || [])]
                        .sort((a, b) => b.sessions - a.sessions)
                        .map((row) => ({
                          label: DEVICE_LABEL[row.device] || row.device,
                          value: row.sessions,
                        }))}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">없음</p>
                  )}
                </div>
              </div>
              {(report?.routes || []).length > 0 ? (
                <CountList
                  title="다른 페이지"
                  rows={(report?.routes || []).map((row) => ({
                    label: row.label,
                    value: `${row.sessions}`,
                  }))}
                />
              ) : null}
              <div>
                <div className="mb-1 flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={trend === "day" ? "default" : "outline"}
                    className="h-8"
                    onClick={() => setTrend("day")}
                  >
                    날짜
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={trend === "hour" ? "default" : "outline"}
                    className="h-8"
                    onClick={() => setTrend("hour")}
                  >
                    시간
                  </Button>
                </div>
                <TrendChart
                  data={
                    trend === "day"
                      ? (report?.daily || []).map((row) => ({
                          label: row.date.slice(5),
                          sessions: row.sessions,
                          applications: row.applications,
                          rate: row.rate,
                        }))
                      : (report?.hours || []).map((row) => ({
                          label: String(row.hour),
                          sessions: row.sessions,
                          applications: row.applications,
                          rate: row.rate,
                        }))
                  }
                />
              </div>
              <div className="overflow-x-auto px-1.5 py-1.5">
                <table className="w-full min-w-[32rem] text-left text-sm">
                  <thead className="border-b border-slate-100 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 font-medium">시간</th>
                      <th className="px-2 py-2 font-medium">지역</th>
                      <th className="px-2 py-2 font-medium">방문횟수</th>
                      <th className="px-2 py-2 font-medium">다른 페이지</th>
                      <th className="px-2 py-2 font-medium">체류</th>
                      <th className="px-2 py-2 font-medium">단계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(report?.recent || []).map((row) => (
                      <tr key={row.id} className="border-b border-slate-50">
                        <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">
                          {formatWhen(row.startedAt)}
                        </td>
                        <td className="px-2 py-2">{row.place}</td>
                        <td className="whitespace-nowrap px-2 py-2 tabular-nums">
                          {row.visits || 1}
                          {row.returning ? (
                            <span className="text-muted-foreground"> · 재방문</span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2">
                          {row.routes?.length ? row.routes.join(" · ") : "-"}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 tabular-nums">
                          {formatDwell(row.dwellMs)}
                        </td>
                        <td className={cn("px-2 py-2", row.stage === "신청 완료" && "font-medium")}>
                          {row.stage}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </AdminPanel>
  );
}
