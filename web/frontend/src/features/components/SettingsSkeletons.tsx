import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type SettingsCardSkeletonProps = {
  headerLines?: number;
  bodyLines?: number;
};

export const SettingsCardSkeleton = ({
  headerLines = 1,
  bodyLines = 4,
}: SettingsCardSkeletonProps) => {
  return (
    <Card className="relative flex flex-col rounded-2xl border border-gray-200 bg-white/80 shadow-sm">
      <CardHeader className="space-y-3">
        {Array.from({ length: headerLines }).map((_, index) => (
          <Skeleton key={`header-line-${index}`} className="h-5 w-40" />
        ))}
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: bodyLines }).map((_, index) => (
          <Skeleton key={`body-line-${index}`} className="h-4 w-full" />
        ))}
      </CardContent>
    </Card>
  );
};

export const SettingsTabsSkeleton = () => {
  return (
    <div className="min-h-screen bg-gradient-subtle p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={`tab-${index}`} className="h-12 rounded-xl" />
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <SettingsCardSkeleton key={`settings-skeleton-${index}`} />
          ))}
        </div>
      </div>
    </div>
  );
};
