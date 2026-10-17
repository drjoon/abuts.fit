// change-log:
// - 2026-10-17: 딜러·개발운영 정산 — 요약 카드·거래처 그리드 스켈레톤.
// related files:
// - web/frontend/src/features/commission/CommissionPaymentsPage.tsx
// - web/frontend/src/pages/salesman/SalesmanPaymentsPage.tsx
// - web/frontend/src/pages/devops/DevopsPaymentsPage.tsx
import { Skeleton } from "@/components/ui/skeleton";
import {
  SETTLEMENT_STAT_CARD_WIDTH_CLASS,
  SETTLEMENT_STAT_ROW_CLASS,
} from "@/shared/settlement/settlementUi";

const repeat = (count: number) => Array.from({ length: count }, (_, i) => i);

const StatCardSkeleton = () => (
  <div
    className={`flex min-h-[5.5rem] flex-col justify-center rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 shadow-sm ${SETTLEMENT_STAT_CARD_WIDTH_CLASS}`}
  >
    <Skeleton className="h-3.5 w-16" />
    <Skeleton className="mt-2 h-7 w-28" />
    <Skeleton className="mt-2 h-3 w-24" />
  </div>
);

export const CommissionPaymentsStatCardsSkeleton = () => (
  <div className={SETTLEMENT_STAT_ROW_CLASS}>
    {repeat(3).map((key) => (
      <StatCardSkeleton key={`commission-stat-${key}`} />
    ))}
  </div>
);

export const CommissionPaymentsOrgGridSkeleton = ({
  count = 6,
}: {
  count?: number;
}) => (
  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
    {repeat(count).map((key) => (
      <div
        key={`commission-org-${key}`}
        className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm"
      >
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-2 h-3 w-40" />
        <div className="mt-3 space-y-2">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-5/6" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
      </div>
    ))}
  </div>
);

export const CommissionPaymentsToolbarSkeleton = () => (
  <div className="mb-2 flex min-w-0 flex-nowrap items-center gap-2">
    <Skeleton className="h-9 w-44 shrink-0 rounded-xl" />
    <Skeleton className="h-9 w-24 shrink-0 rounded-xl" />
  </div>
);
