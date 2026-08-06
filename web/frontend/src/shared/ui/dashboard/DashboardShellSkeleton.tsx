// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
// - web/frontend/src/shared/ui/dashboard/DashboardShell.tsx
import { Skeleton } from "@/components/ui/skeleton";

type DashboardShellSkeletonProps = {
  showMain?: boolean;
};

const repeat = (count: number) => {
  const items: number[] = [];
  for (let i = 0; i < count; i += 1) {
    items.push(i);
  }
  return items;
};

export const DashboardShellSkeleton = ({
  showMain = true,
}: DashboardShellSkeletonProps) => {
  return (
    <div className="p-3 space-y-3">
      {/* headerRight: PeriodFilter + 보유 크레딧 + 지난 의뢰 */}
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-8 w-14" />
        <Skeleton className="h-8 w-14" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-8 w-20" />
      </div>

      {/* stats: 6 cards */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {repeat(6).map((idx) => (
          <div
            key={`stat-${idx}`}
            className="rounded-2xl border border-border bg-muted/30 p-3 space-y-3"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
            <div className="flex flex-col items-center gap-1.5 pt-1">
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2.5">
        {/* top row: 가격 정책 (1) + 최근 의뢰 (2) */}
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3 items-stretch">
          <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-5 w-24" />
              <div className="flex gap-2">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-14" />
              </div>
            </div>
            <div className="space-y-3">
              {repeat(5).map((innerIdx) => (
                <div
                  key={`pricing-row-${innerIdx}`}
                  className="flex items-center justify-between gap-3"
                >
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
              <Skeleton className="h-10 w-full" />
            </div>
          </div>

          <div className="lg:col-span-2 rounded-2xl border border-border bg-muted/30 p-4 space-y-4">
            <Skeleton className="h-5 w-24" />
            <div className="space-y-3">
              {repeat(3).map((innerIdx) => (
                <div
                  key={`recent-row-${innerIdx}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/60 p-3"
                >
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <div className="flex gap-2">
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                    <Skeleton className="h-3 w-56" />
                  </div>
                  <Skeleton className="h-8 w-14" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* bottom row: 불완전가공 + 출고 + 지연 위험 요약 */}
        {showMain && (
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3 items-stretch">
            {repeat(3).map((idx) => (
              <div
                key={`bottom-${idx}`}
                className="rounded-2xl border border-border bg-muted/30 p-4 space-y-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-5 w-28" />
                  {idx === 1 && (
                    <div className="flex gap-2">
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  {repeat(idx === 0 ? 2 : 3).map((innerIdx) => (
                    <Skeleton
                      key={`bottom-row-${idx}-${innerIdx}`}
                      className="h-4 w-full"
                    />
                  ))}
                  {idx !== 0 && <Skeleton className="h-16 w-full" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
