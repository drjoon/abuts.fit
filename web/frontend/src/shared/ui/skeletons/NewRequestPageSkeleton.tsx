// change-log:
// - 2026-08-12: 헤더(크롬)는 페이지가 유지하고, 폼 데이터 영역만 스켈레톤.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/components/RequestorWorkspaceHeader.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
import { Skeleton } from "@/components/ui/skeleton";

const repeat = (count: number) => Array.from({ length: count }, (_, i) => i);

/** 신규의뢰 폼/출고 컬럼만 — RequestorWorkspaceHeader는 페이지에서 유지 */
export const NewRequestPageSkeleton = () => {
  return (
    <div className="grid gap-3 lg:grid-cols-2 flex-1 min-h-0">
      <div className="space-y-3 flex flex-col min-h-0">
        <Skeleton className="h-52 w-full rounded-2xl shrink-0" />
        <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4 flex-1">
          <Skeleton className="h-5 w-40" />
          {repeat(4).map((key) => (
            <Skeleton key={key} className="h-10 w-full rounded-xl" />
          ))}
        </div>
      </div>

      <div className="space-y-4 flex flex-col min-h-0">
        <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4 flex-1">
          <Skeleton className="h-5 w-28" />
          {repeat(3).map((key) => (
            <Skeleton key={key} className="h-10 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-12 w-full rounded-xl shrink-0" />
      </div>
    </div>
  );
};
