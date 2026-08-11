// change-log:
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
}: {
  rows?: number;
}) => (
  <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
    <div className="flex flex-wrap items-center gap-2 shrink-0">
      <Skeleton className="h-9 w-44" />
      <Skeleton className="h-9 w-[140px]" />
      <Skeleton className="h-9 w-full sm:w-[320px]" />
    </div>
    <div className="flex-1 min-h-0 overflow-hidden rounded-md border">
      <div className="border-b px-3 py-2.5">
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
            className="grid grid-cols-5 gap-3 border-b px-3 py-3 last:border-b-0"
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
