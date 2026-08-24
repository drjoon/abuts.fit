// change-log:
// - 2026-08-11: 기공소 탭(기공비·치과 등록) 포함해 탭 수·카드 밀도 재생성.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
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

type SettingsTabsSkeletonProps = {
  /** 치과≈5, 기공소≈7. 미지정 시 6 */
  tabCount?: number;
};

export const SettingsTabsSkeleton = ({
  tabCount = 6,
}: SettingsTabsSkeletonProps) => {
  return (
    <div className="min-h-full pb-8 sm:pb-12">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex h-auto w-full flex-wrap justify-stretch gap-1.5 rounded-xl border border-border bg-muted/30 px-1.5 py-1.5">
          {Array.from({ length: tabCount }).map((_, index) => (
            <Skeleton
              key={`tab-${index}`}
              className="h-10 min-w-[96px] flex-1 basis-0 rounded-lg"
            />
          ))}
        </div>
        <div className="space-y-4">
          <SettingsCardSkeleton headerLines={2} bodyLines={6} />
          <SettingsCardSkeleton bodyLines={4} />
        </div>
      </div>
    </div>
  );
};
