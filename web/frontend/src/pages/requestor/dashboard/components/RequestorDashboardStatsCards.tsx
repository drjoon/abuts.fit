// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export type RequestorDashboardStat = {
  label: string;
  value: string;
  change?: string;
  icon: React.ComponentType<{ className?: string }>;
};

type Props = {
  stats: RequestorDashboardStat[];
  loading?: boolean;
  onCardClick?: (stat: RequestorDashboardStat) => void;
};

export const RequestorDashboardStatsCards = ({
  stats,
  loading,
  onCardClick,
}: Props) => {
  if (loading) {
    return (
      <>
        {Array.from({ length: 6 }).map((_, index) => (
          <Card
            key={`skeleton-${index}`}
            className="app-glass-card app-glass-card--lg"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 px-2.5 sm:px-3 pt-2.5 sm:pt-3 pb-1">
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-3.5 w-3.5 rounded-full" />
            </CardHeader>
            <CardContent className="px-2.5 sm:px-3 pb-2.5 sm:pb-3 pt-1">
              <Skeleton className="h-6 w-14" />
              <Skeleton className="mt-1.5 h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </>
    );
  }

  return (
    <>
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card
            key={stat.label}
            className="app-glass-card app-glass-card--lg"
            onClick={() => onCardClick?.(stat)}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 px-2.5 sm:px-3 pt-2.5 sm:pt-3 pb-1">
              <CardTitle className="text-xs sm:text-sm font-medium leading-tight text-foreground">
                {stat.label}
              </CardTitle>
              <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-600 flex-shrink-0" />
            </CardHeader>
            <CardContent className="px-2.5 sm:px-3 pb-2.5 sm:pb-3 pt-1">
              <div className="w-full flex items-center justify-center text-base sm:text-xl md:text-2xl font-bold leading-none text-foreground whitespace-nowrap tracking-tight tabular-nums">
                {stat.value}
              </div>
              {stat.change && (
                <p className="text-[10px] sm:text-[11px] text-slate-600 leading-tight whitespace-normal break-keep min-h-[2em] text-center mt-1">
                  <span
                    className={
                      String(stat.change).includes("-")
                        ? "text-red-700"
                        : "text-blue-700"
                    }
                  >
                    {stat.change}
                  </span>{" "}
                  전기간대비
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </>
  );
};
