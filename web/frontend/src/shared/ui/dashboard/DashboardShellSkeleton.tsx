// change-log:
// - 2026-08-11: DashboardShell `p-3`와 맞춤(작업영역 여백 일치).
// - 2026-08-11: 지난 의뢰 스켈레톤을 헤더에서 최근 의뢰 카드 헤더로 이동.
// - 2026-08-11: 보유 크레딧 스켈레톤 슬롯 제거(사이드바 크레딧 페이지로 이전).
// - 2026-08-11: 압축 요약카드(전기간대비 제거)·기공/어벗 라벨·출고 Info 툴팁·오늘의 가격 숨김에 맞춰 재생성.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorRecentRequestsCard.tsx
// - web/frontend/src/shared/ui/dashboard/DashboardShell.tsx
// - web/frontend/src/shared/components/RequestorWorkspaceHeader.tsx
import { Skeleton } from "@/components/ui/skeleton";
import { GIGONG_ABUT_CONNECTOR_THICKNESS_CLASS } from "@/shared/ui/gigongAbutAccent";

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

const StatCardSkeleton = () => (
  <div className="rounded-2xl border border-border bg-muted/30 px-2 pt-1.5 pb-1.5 space-y-1">
    <div className="flex items-center justify-between">
      <Skeleton className="h-3 w-14" />
      <Skeleton className="h-3 w-3 rounded-full" />
    </div>
    <div className="flex justify-center pt-0.5">
      <Skeleton className="h-5 w-12" />
    </div>
  </div>
);

export const DashboardShellSkeleton = ({
  showMain = true,
}: DashboardShellSkeletonProps) => {
  return (
    <div className="h-full min-h-0">
      <div className="max-w-6xl mx-auto w-full space-y-3">
        <div className="space-y-3 p-3">
          {/* headerRight: PeriodFilter (+ 불완전가공 알림) */}
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-8 w-14" />
            <Skeleton className="h-8 w-14" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-16" />
          </div>

          {/* stats: 기공/어벗 2행 × (라벨 + 5카드), 행 연결선 */}
          <div className="space-y-2">
            {repeat(2).map((rowIdx) => (
              <div key={`stat-row-${rowIdx}`} className="relative">
                <div
                  aria-hidden
                  className={`pointer-events-none absolute inset-x-0 bottom-1 z-0 rounded-full bg-slate-200/70 opacity-55 ${GIGONG_ABUT_CONNECTOR_THICKNESS_CLASS}`}
                />
                <div className="relative z-[1] grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
                  <div className="flex min-h-[3.25rem] items-center justify-center">
                    <Skeleton className="h-[2.75rem] w-[4.5rem] rounded-xl" />
                  </div>
                  {repeat(5).map((idx) => (
                    <StatCardSkeleton key={`stat-${rowIdx}-${idx}`} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            {/* top row: 출고 (2) + 최근 의뢰 (3) */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-5 items-stretch">
              <div className="lg:col-span-2 rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Skeleton className="h-5 w-10" />
                    <Skeleton className="h-4 w-4 rounded-full" />
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                </div>
                <Skeleton className="h-20 w-full rounded-xl" />
                <div className="grid grid-cols-2 gap-2">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              </div>

              <div className="lg:col-span-3 rounded-2xl border border-border bg-muted/30 p-4 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-8 w-20" />
                </div>
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

            {/* bottom row: 불완전가공 + 오늘의 가격 + 지연 위험 요약 */}
            {showMain && (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 items-stretch">
                <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-4 min-w-0">
                  <Skeleton className="h-5 w-28" />
                  <div className="space-y-3">
                    {repeat(2).map((innerIdx) => (
                      <Skeleton
                        key={`unmachinable-row-${innerIdx}`}
                        className="h-4 w-full"
                      />
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-4 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-5 w-20" />
                    <div className="flex gap-2">
                      <Skeleton className="h-8 w-24" />
                      <Skeleton className="h-8 w-14" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    {repeat(4).map((innerIdx) => (
                      <div
                        key={`pricing-row-${innerIdx}`}
                        className="flex items-center justify-between gap-3"
                      >
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-4 min-w-0">
                  <Skeleton className="h-5 w-28" />
                  <div className="space-y-3">
                    {repeat(3).map((innerIdx) => (
                      <Skeleton
                        key={`risk-row-${innerIdx}`}
                        className="h-4 w-full"
                      />
                    ))}
                    <Skeleton className="h-16 w-full" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
