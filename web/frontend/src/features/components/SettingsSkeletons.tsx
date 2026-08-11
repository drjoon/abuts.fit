// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
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
    <Card className="app-glass-card app-glass-card--lg">
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
    <div className="min-h-screen bg-gradient-subtle p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* 탭 크롬은 유지하지 않음(역할에 따라 탭 구성이 달라짐). 데이터 카드만 스켈레톤. */}
        <div className="space-y-4">
          <SettingsCardSkeleton headerLines={2} bodyLines={6} />
          <SettingsCardSkeleton bodyLines={4} />
        </div>
      </div>
    </div>
  );
};
