// change-log:
// - 2026-08-14: 잔액 카드·테이블 스켈레톤을 최신 크레딧 UI(rounded-2xl)에 맞춤.
// - 2026-08-11: 크레딧(내역/충전/정산) SettingsScaffold 레이아웃에 맞춘 페이지 스켈레톤 신설.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/requestor/credits/RequestorCreditsPage.tsx
// - web/frontend/src/shared/components/CreditLedgerModal.tsx
// - web/frontend/src/features/components/SettingsScaffold.tsx
import { Skeleton } from "@/components/ui/skeleton";

const repeat = (count: number) => Array.from({ length: count }, (_, i) => i);

type RequestorCreditsPageSkeletonProps = {
  /** lab이면 정산 탭까지 3칸 */
  tabCount?: 2 | 3;
};

export const CreditLedgerTableSkeleton = ({
  rows = 8,
  showSettlement = false,
}: {
  rows?: number;
  showSettlement?: boolean;
}) => (
  <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
    <div
      className={
        showSettlement
          ? "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
          : "grid grid-cols-1 gap-3 sm:grid-cols-3"
      }
    >
      {repeat(showSettlement ? 4 : 3).map((key) => (
        <div
          key={`balance-card-${key}`}
          className="flex min-h-[6.5rem] flex-col justify-center rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3.5 shadow-sm"
        >
          <Skeleton className="mx-auto h-3.5 w-16" />
          <Skeleton className="mx-auto mt-2 h-7 w-28" />
        </div>
      ))}
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <Skeleton className="h-9 w-44 rounded-xl" />
      <Skeleton className="h-9 w-[150px] rounded-xl" />
      <Skeleton className="h-9 w-full rounded-xl sm:w-[280px]" />
    </div>
    <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/70 shadow-sm">
      <div className="border-b border-slate-100 px-3 py-2.5">
        <div className="grid grid-cols-5 gap-3">
          <Skeleton className="mx-auto h-4 w-10" />
          <Skeleton className="mx-auto h-4 w-10" />
          <Skeleton className="mx-auto h-4 w-10" />
          <Skeleton className="mx-auto h-4 w-16" />
          <Skeleton className="mx-auto h-4 w-10" />
        </div>
      </div>
      <div className="space-y-0">
        {repeat(rows).map((key) => (
          <div
            key={`ledger-row-${key}`}
            className="grid grid-cols-5 gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0"
          >
            <Skeleton className="mx-auto h-4 w-28" />
            <Skeleton className="mx-auto h-4 w-16" />
            <Skeleton className="mx-auto h-4 w-20" />
            <Skeleton className="mx-auto h-4 w-20" />
            <Skeleton className="mx-auto h-4 w-36" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const RequestorCreditsPageSkeleton = ({
  tabCount = 2,
}: RequestorCreditsPageSkeletonProps) => {
  return (
    <div className="box-border flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col justify-start gap-4">
        <div className="mx-auto w-full max-w-4xl shrink-0">
          <div className="flex h-auto w-full flex-wrap justify-stretch gap-1.5 rounded-xl border border-border bg-muted/30 px-1.5 py-1.5">
            {repeat(tabCount).map((key) => (
              <Skeleton
                key={`credit-tab-${key}`}
                className="h-10 min-w-[96px] flex-1 basis-0 rounded-lg"
              />
            ))}
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-6xl min-h-0 flex-1 flex-col">
          <CreditLedgerTableSkeleton />
        </div>
      </div>
    </div>
  );
};
