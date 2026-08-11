// change-log:
// - 2026-08-12: 역할 공통 — 데이터 갱신 섹션 전용 스켈레톤(크롬/헤더 유지용).
// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// - web/frontend/src/pages/salesman/SalesmanDashboardPage.tsx
// - web/frontend/src/pages/devops/DevopsDashboardPage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const repeat = (count: number) => Array.from({ length: count }, (_, i) => i);

export const GlassStatCardSkeleton = ({
  className,
  lines = 3,
}: {
  className?: string;
  lines?: number;
}) => (
  <Card className={`app-glass-card app-glass-card--lg ${className || ""}`.trim()}>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-4 w-4 rounded-full" />
    </CardHeader>
    <CardContent className="space-y-2">
      {repeat(lines).map((key) => (
        <Skeleton
          key={`stat-line-${key}`}
          className={key === 0 ? "h-7 w-20" : "h-3 w-full"}
        />
      ))}
    </CardContent>
  </Card>
);

export const GlassStatCardsSkeleton = ({
  count = 4,
  className = "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4",
  lines = 3,
}: {
  count?: number;
  className?: string;
  lines?: number;
}) => (
  <div className={className}>
    {repeat(count).map((key) => (
      <GlassStatCardSkeleton key={`stat-card-${key}`} lines={lines} />
    ))}
  </div>
);

export const DashboardListRowsSkeleton = ({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) => (
  <div className={`space-y-2 ${className || ""}`.trim()}>
    {repeat(rows).map((key) => (
      <div
        key={`list-row-${key}`}
        className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
      >
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-48" />
        </div>
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
    ))}
  </div>
);

export const UnmachinableOverviewSkeleton = () => (
  <div className="space-y-2">
    <div className="grid grid-cols-3 gap-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
    </div>
    <DashboardListRowsSkeleton rows={3} />
  </div>
);

/** 제조사 워크시트 카드 그리드 자리표시 */
export const WorksheetCardsSkeleton = ({ count = 6 }: { count?: number }) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
    {repeat(count).map((key) => (
      <div
        key={`ws-card-${key}`}
        className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    ))}
  </div>
);

export const LedgerTableRowsSkeleton = ({ rows = 6 }: { rows?: number }) => (
  <div className="space-y-0 rounded-md border overflow-hidden">
    <div className="grid grid-cols-5 gap-3 border-b px-3 py-2.5 bg-muted/30">
      {repeat(5).map((key) => (
        <Skeleton key={`ledger-head-${key}`} className="mx-auto h-4 w-12" />
      ))}
    </div>
    {repeat(rows).map((key) => (
      <div
        key={`ledger-row-${key}`}
        className="grid grid-cols-5 gap-3 border-b px-3 py-3 last:border-b-0"
      >
        <Skeleton className="mx-auto h-4 w-24" />
        <Skeleton className="mx-auto h-4 w-16" />
        <Skeleton className="mx-auto h-4 w-20" />
        <Skeleton className="mx-auto h-4 w-20" />
        <Skeleton className="mx-auto h-4 w-28" />
      </div>
    ))}
  </div>
);
