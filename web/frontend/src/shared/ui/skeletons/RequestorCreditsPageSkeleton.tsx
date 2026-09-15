// change-log:
// - 2026-09-16: 기공소 탭 4칸(내역·통계·충전·지급). 내역 스켈레톤=수식 카드·6열·필터 행.
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
  /** 치과=3(내역·통계·충전), 기공소=4(+지급) */
  tabCount?: 3 | 4;
  /** 기공소 내역 수식: 현재=충전+정산−소비 */
  showSettlement?: boolean;
};

const EquationOperatorSkeleton = () => (
  <div
    className="flex min-h-[6.5rem] w-9 shrink-0 items-center justify-center self-stretch sm:w-11"
    aria-hidden
  >
    <Skeleton className="h-6 w-4 rounded-sm sm:h-7 sm:w-5" />
  </div>
);

const BalanceCardSkeleton = () => (
  <div className="flex min-h-[6.5rem] min-w-[9.5rem] flex-1 flex-col justify-center rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3.5 shadow-sm sm:min-w-[10.5rem]">
    <Skeleton className="mx-auto h-3.5 w-16" />
    <Skeleton className="mx-auto mt-2 h-7 w-28" />
  </div>
);

export const CreditLedgerTableSkeleton = ({
  rows = 8,
  showSettlement = false,
}: {
  rows?: number;
  showSettlement?: boolean;
}) => (
  <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
    <div className="scroll-x-bar-top -mx-1 px-1">
      <div className="flex min-w-max items-stretch gap-0.5 px-1 sm:gap-1">
        <BalanceCardSkeleton />
        <EquationOperatorSkeleton />
        <BalanceCardSkeleton />
        {showSettlement ? (
          <>
            <EquationOperatorSkeleton />
            <BalanceCardSkeleton />
          </>
        ) : null}
        <EquationOperatorSkeleton />
        <BalanceCardSkeleton />
      </div>
    </div>
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
      <Skeleton className="h-9 w-full rounded-xl sm:w-[130px]" />
      <Skeleton className="h-9 w-full rounded-xl sm:w-[130px]" />
      <Skeleton className="h-9 w-full rounded-xl sm:w-[280px]" />
      <Skeleton className="ml-auto h-9 w-full rounded-xl sm:w-56" />
    </div>
    <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/70 shadow-sm">
      <div className="border-b border-slate-100 px-3 py-2.5">
        <div className="grid grid-cols-6 gap-3">
          <Skeleton className="mx-auto h-4 w-10" />
          <Skeleton className="mx-auto h-4 w-10" />
          <Skeleton className="mx-auto h-4 w-10" />
          <Skeleton className="mx-auto h-4 w-10" />
          <Skeleton className="mx-auto h-4 w-10" />
          <Skeleton className="mx-auto h-4 w-16" />
        </div>
      </div>
      <div className="space-y-0">
        {repeat(rows).map((key) => (
          <div
            key={`ledger-row-${key}`}
            className="grid grid-cols-6 gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0"
          >
            <Skeleton className="mx-auto h-4 w-28" />
            <Skeleton className="mx-auto h-4 w-16" />
            <Skeleton className="mx-auto h-4 w-14" />
            <Skeleton className="mx-auto h-4 w-20" />
            <Skeleton className="mx-auto h-4 w-20" />
            <Skeleton className="mx-auto h-4 w-36" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

/** 지급 탭 — 요약 2카드 + 월별 4열 표 */
export const LabSettlementPayoutTableSkeleton = ({
  rows = 6,
}: {
  rows?: number;
}) => (
  <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {repeat(2).map((key) => (
        <div
          key={`payout-card-${key}`}
          className="flex min-h-[5.5rem] flex-col justify-center rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 shadow-sm"
        >
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="mt-2 h-7 w-28" />
        </div>
      ))}
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <Skeleton className="h-9 w-44 rounded-xl" />
      <Skeleton className="ml-auto h-9 w-24 rounded-xl" />
    </div>
    <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/70 shadow-sm">
      <div className="border-b border-slate-100 px-3 py-2.5">
        <div className="grid grid-cols-4 gap-3">
          <Skeleton className="mx-auto h-4 w-12" />
          <Skeleton className="mx-auto h-4 w-10" />
          <Skeleton className="mx-auto h-4 w-10" />
          <Skeleton className="mx-auto h-4 w-10" />
        </div>
      </div>
      <div className="space-y-0">
        {repeat(rows).map((key) => (
          <div
            key={`payout-row-${key}`}
            className="grid grid-cols-4 gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0"
          >
            <Skeleton className="mx-auto h-4 w-16" />
            <Skeleton className="mx-auto h-4 w-20" />
            <Skeleton className="mx-auto h-4 w-20" />
            <Skeleton className="mx-auto h-4 w-14" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const RequestorCreditsPageSkeleton = ({
  tabCount = 3,
  showSettlement = false,
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
          <CreditLedgerTableSkeleton showSettlement={showSettlement} />
        </div>
      </div>
    </div>
  );
};
