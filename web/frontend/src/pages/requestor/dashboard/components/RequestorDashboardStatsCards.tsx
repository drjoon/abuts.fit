// change-log:
// - 2026-08-11: 행 악센트 바 제거 → 6카드 가로 연결선. 라벨은 가운데 정렬 유지.
// - 2026-08-11: 기공/어벗 행 라벨 — 그라데이션·악센트 바·글래스 톤으로 세련화.
// - 2026-08-11: 요약카드 수직 압축, 전기간대비 제거, 기공/어벗 행 라벨 스타일 정리.
// - 2026-08-11: 치과·기공소 공통 — 기공/어벗 2행 + 좌측 행 라벨 슬롯 지원.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/shared/ui/cn";
import {
  DEFAULT_GIGONG_ABUT_ACCENT,
  GIGONG_ABUT_ACCENT,
  GIGONG_ABUT_CONNECTOR_THICKNESS_CLASS,
  gigongAbutConnectorLineClass,
  type GigongAbutAccentKey,
} from "@/shared/ui/gigongAbutAccent";

export type RequestorDashboardStat = {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  /** false면 클릭/포인터 비활성(기공 라인 placeholder 등) */
  interactive?: boolean;
};

export type RequestorDashboardStatRow = {
  rowLabel: string;
  stats: RequestorDashboardStat[];
};

type Props = {
  /** 단일 행(기공소 등). `rows`가 있으면 무시. */
  stats?: RequestorDashboardStat[];
  /** 행 라벨 + 카드. 치과/기공소 기공/어벗 2행. */
  rows?: RequestorDashboardStatRow[];
  loading?: boolean;
  onCardClick?: (stat: RequestorDashboardStat, rowLabel?: string) => void;
};

const ROW_GRID_CLASS =
  "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2";

const resolveRowTheme = (label: string) =>
  GIGONG_ABUT_ACCENT[label as GigongAbutAccentKey] || DEFAULT_GIGONG_ABUT_ACCENT;

const StatCardSkeleton = () => (
  <Card className="app-glass-card app-glass-card--lg">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 px-2 pt-1.5 pb-0.5">
      <Skeleton className="h-3 w-14" />
      <Skeleton className="h-3 w-3 rounded-full" />
    </CardHeader>
    <CardContent className="px-2 pb-1.5 pt-0.5">
      <Skeleton className="mx-auto h-5 w-12" />
    </CardContent>
  </Card>
);

const RowLabelSlot = ({ label }: { label: string }) => {
  const theme = resolveRowTheme(label);
  return (
    <div className="flex h-full min-h-[3.25rem] items-center justify-center">
      <div
        className={cn(
          "relative inline-flex h-[2.75rem] min-w-[4.5rem] items-center justify-center overflow-hidden rounded-xl border px-3 py-1.5 backdrop-blur-sm",
          theme.shell,
          theme.glow,
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -left-4 -top-4 h-12 w-12 rounded-full bg-white/50 blur-xl"
        />
        <span
          className={cn(
            "relative z-[1] text-center text-xs font-semibold leading-none tracking-[0.14em]",
            theme.text,
          )}
        >
          {label}
        </span>
      </div>
    </div>
  );
};

const StatCard = ({
  stat,
  onClick,
}: {
  stat: RequestorDashboardStat;
  onClick?: () => void;
}) => {
  const Icon = stat.icon;
  return (
    <Card
      className={`app-glass-card app-glass-card--lg${onClick ? " cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 px-2 pt-1.5 pb-0.5">
        <CardTitle className="text-[11px] sm:text-xs font-medium leading-tight text-foreground">
          {stat.label}
        </CardTitle>
        <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-slate-500 flex-shrink-0" />
      </CardHeader>
      <CardContent className="px-2 pb-1.5 pt-0.5">
        <div className="w-full flex items-center justify-center text-sm sm:text-base md:text-lg font-bold leading-none text-foreground whitespace-nowrap tracking-tight tabular-nums">
          {stat.value}
        </div>
      </CardContent>
    </Card>
  );
};

const renderStatCards = (
  row: RequestorDashboardStatRow,
  onCardClick?: Props["onCardClick"],
) =>
  row.stats.map((stat) => {
    const clickable = Boolean(onCardClick) && stat.interactive !== false;
    return (
      <StatCard
        key={`${row.rowLabel || "default"}-${stat.label}`}
        stat={stat}
        onClick={
          clickable
            ? () => onCardClick?.(stat, row.rowLabel || undefined)
            : undefined
        }
      />
    );
  });

const StatsRow = ({
  row,
  onCardClick,
}: {
  row: RequestorDashboardStatRow;
  onCardClick?: Props["onCardClick"];
}) => {
  return (
    <div className="relative">
      <div
        aria-hidden
        className={gigongAbutConnectorLineClass(
          row.rowLabel as GigongAbutAccentKey,
        )}
      />
      <div className={cn("relative z-[1]", ROW_GRID_CLASS)}>
        <RowLabelSlot label={row.rowLabel} />
        {renderStatCards(row, onCardClick)}
      </div>
    </div>
  );
};

export const RequestorDashboardStatsCards = ({
  stats,
  rows,
  loading,
  onCardClick,
}: Props) => {
  const labeledRows = rows?.length ? rows : null;
  const flatStats = !labeledRows && stats?.length ? stats : null;

  if (loading) {
    if (labeledRows) {
      return (
        <div className="space-y-2">
          {labeledRows.map((row, rowIndex) => (
            <div key={`skeleton-row-${rowIndex}`} className="relative">
              <div
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-x-0 bottom-1 z-0 rounded-full bg-slate-200/70 opacity-55",
                  GIGONG_ABUT_CONNECTOR_THICKNESS_CLASS,
                )}
              />
              <div className={cn("relative z-[1]", ROW_GRID_CLASS)}>
                <div className="flex min-h-[3.25rem] items-center justify-center">
                  <Skeleton className="h-[2.75rem] w-[4.5rem] rounded-xl" />
                </div>
                {Array.from({ length: Math.max(row.stats.length, 5) }).map(
                  (_, index) => (
                    <StatCardSkeleton key={`skeleton-${rowIndex}-${index}`} />
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <>
        {Array.from({ length: 6 }).map((_, index) => (
          <StatCardSkeleton key={`skeleton-${index}`} />
        ))}
      </>
    );
  }

  if (labeledRows) {
    return (
      <div className="space-y-2">
        {labeledRows.map((row) => (
          <StatsRow
            key={`row-${row.rowLabel}`}
            row={row}
            onCardClick={onCardClick}
          />
        ))}
      </div>
    );
  }

  if (!flatStats) return null;

  return <>{renderStatCards({ rowLabel: "", stats: flatStats }, onCardClick)}</>;
};
