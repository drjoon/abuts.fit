import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type RequestorDashboardStat = {
  label: string;
  value: string;
  change?: string;
  icon: React.ComponentType<{ className?: string }>;
};

type Props = {
  stats: RequestorDashboardStat[];
};

export const RequestorDashboardStatsCards = ({ stats }: Props) => {
  return (
    <>
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <Card
            key={index}
            className="relative flex flex-col rounded-2xl border border-gray-200 bg-white/80 shadow-sm transition-all hover:shadow-lg"
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
