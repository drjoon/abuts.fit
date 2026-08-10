// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/components/RequestorWorkspaceHeader.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
import { Skeleton } from "@/components/ui/skeleton";

const repeat = (count: number) => Array.from({ length: count }, (_, i) => i);

export const NewRequestPageSkeleton = () => {
  return (
    <div className="p-4">
      <div className="max-w-6xl mx-auto w-full space-y-3">
      {/* RequestorWorkspaceHeader: 지난 의뢰 (기간 필터 없음) */}
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-20" />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3">
          <Skeleton className="h-52 w-full rounded-2xl" />
          <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
            <Skeleton className="h-5 w-40" />
            {repeat(4).map((key) => (
              <Skeleton key={key} className="h-10 w-full rounded-xl" />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
            <Skeleton className="h-5 w-28" />
            {repeat(3).map((key) => (
              <Skeleton key={key} className="h-10 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
      </div>
    </div>
  );
};
