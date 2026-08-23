// change-log:
// - 2026-08-11: 비대칭 2열(상세 1.2fr / 출고) 레이아웃에 맞춰 재생성.
// - 2026-08-11: 상단 RequestorWorkspaceHeader(지난 의뢰) 스켈레톤 제거.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
import { Skeleton } from "@/components/ui/skeleton";

const repeat = (count: number) => Array.from({ length: count }, (_, i) => i);

export const NewRequestPageSkeleton = () => {
  return (
    <div className="bg-gradient-subtle p-4 flex flex-col h-full min-h-0 overflow-hidden">
      <div className="max-w-6xl mx-auto w-full space-y-3 flex flex-col flex-1 min-h-0 h-full">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(34rem,1.2fr)_minmax(0,1fr)] gap-3 items-stretch flex-1 min-h-0 h-full">
          <div className="flex flex-col gap-2.5 flex-1 min-h-0 h-full">
            <div className="flex-1 min-h-0 space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-5 w-28" />
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-8 w-16" />
                </div>
              </div>
              <Skeleton className="h-40 w-full rounded-xl" />
              <div className="space-y-2">
                {repeat(5).map((key) => (
                  <Skeleton key={`detail-${key}`} className="h-10 w-full rounded-xl" />
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col flex-1 min-h-0 h-full space-y-3">
            <div className="flex-1 min-h-0 space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
              <Skeleton className="h-5 w-24" />
              {repeat(4).map((key) => (
                <Skeleton key={`ship-${key}`} className="h-10 w-full rounded-xl" />
              ))}
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
            <Skeleton className="h-12 w-full shrink-0 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
};
