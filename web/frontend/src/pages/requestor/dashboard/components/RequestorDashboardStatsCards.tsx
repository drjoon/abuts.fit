// change-log:
// - 2026-08-12: 카드 라벨 2줄 허용 — 어벗「무료 재제작 잔여」표시.
// - 2026-08-11: 기공/어벗 라벨 박스는 6.5rem(열 10rem 유지·가운데).
// - 2026-08-11: 기공/어벗 라벨 열 폭 확대(10rem) — 요약카드는 남은 폭 균등.
// - 2026-08-11: 요약카드 패딩·라벨·아이콘·간격 완화(답답함 해소).
// - 2026-08-11: 기공/어벗 — 라벨 고정폭 + 카드 flex로 좌·총폭 정렬(어벗 카드 약간 넓게).
// - 2026-08-11: 기공 5카드(의뢰·수락·완료·발송·추적) 한 줄 — 열 수 동적·카드 패딩 축소.
// - 2026-08-11: 기공 5카드(발송·수락·완료·발송·추적) 한 줄 — 열 수 동적·카드 패딩 축소.
// - 2026-08-11: 기공 6카드(+작업완료) 한 줄 — 열 수 동적·카드 패딩 축소.
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

/** 기공/어벗 공통: 라벨 열 폭을 맞춰 카드 영역 시작점을 정렬 */
const ROW_LABEL_COL_CLASS = "w-full xl:w-[10rem] xl:shrink-0";

const resolveRowTheme = (label: string) =>
  GIGONG_ABUT_ACCENT[label as GigongAbutAccentKey] || DEFAULT_GIGONG_ABUT_ACCENT;

const StatCardSkeleton = () => (
  <Card className="app-glass-card app-glass-card--lg min-w-0 xl:flex-1">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 px-2.5 pt-2 pb-1">
      <Skeleton className="h-3 w-12" />
      <Skeleton className="h-3.5 w-3.5 rounded-full" />
    </CardHeader>
    <CardContent className="px-2.5 pb-2 pt-0.5">
      <Skeleton className="mx-auto h-5 w-12" />
    </CardContent>
  </Card>
);

const RowLabelSlot = ({ label }: { label: string }) => {
  const theme = resolveRowTheme(label);
  return (
    <div className="flex h-full min-h-[3.5rem] w-full items-center justify-center">
      <div
        className={cn(
          "relative inline-flex h-[3rem] w-[6.5rem] items-center justify-center overflow-hidden rounded-xl border px-2 py-1.5 backdrop-blur-sm",
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
      className={`app-glass-card app-glass-card--lg min-w-0 xl:flex-1${onClick ? " cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 px-2.5 pt-2 pb-1">
        <CardTitle className="min-w-0 text-[11px] sm:text-xs font-medium leading-tight text-foreground line-clamp-2">
          {stat.label}
        </CardTitle>
        <Icon className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
      </CardHeader>
      <CardContent className="px-2.5 pb-2 pt-0.5">
        <div className="w-full flex items-center justify-center text-base sm:text-lg font-bold leading-none text-foreground whitespace-nowrap tracking-tight tabular-nums">
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

const StatsRowShell = ({
  rowLabel,
  children,
}: {
  rowLabel?: string;
  children: React.ReactNode;
}) => (
  <div className="relative z-[1] flex flex-col gap-2 xl:flex-row xl:items-stretch">
    {rowLabel ? (
      <div className={ROW_LABEL_COL_CLASS}>
        <RowLabelSlot label={rowLabel} />
      </div>
    ) : null}
    <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 xl:flex xl:flex-1">
      {children}
    </div>
  </div>
);

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
      <StatsRowShell rowLabel={row.rowLabel}>
        {renderStatCards(row, onCardClick)}
      </StatsRowShell>
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
              <div className="relative z-[1] flex flex-col gap-2 xl:flex-row xl:items-stretch">
                <div className={ROW_LABEL_COL_CLASS}>
                  <div className="flex min-h-[3.5rem] w-full items-center justify-center">
                    <Skeleton className="h-[3rem] w-[6.5rem] rounded-xl" />
                  </div>
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 xl:flex xl:flex-1">
                  {Array.from({ length: Math.max(row.stats.length, 1) }).map(
                    (_, index) => (
                      <StatCardSkeleton key={`skeleton-${rowIndex}-${index}`} />
                    ),
                  )}
                </div>
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
