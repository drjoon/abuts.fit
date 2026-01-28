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
        {Array.from({ length: 4 }).map((_, index) => (
          <Card
            key={`skeleton-${index}`}
            className="app-glass-card app-glass-card--lg"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-16" />
              <Skeleton className="mt-2 h-3 w-24" />
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
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-md font-medium">
                {stat.label}
              </CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              {stat.change && (
                <p className="text-xs text-muted-foreground">
                  <span className="text-green-600">{stat.change}</span> 지난 달
                  대비
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </>
  );
};
