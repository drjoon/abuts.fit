// change-log:
// - 2026-08-11: 소개(리퍼럴) 페이지 레이아웃에 맞춘 페이지 스켈레톤 신설.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/requestor/referralGroups/RequestorReferralPage.tsx
import { Skeleton } from "@/components/ui/skeleton";

const repeat = (count: number) => Array.from({ length: count }, (_, i) => i);

export const RequestorReferralPageSkeleton = () => {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 xl:items-stretch">
          <div className="flex h-full flex-col rounded-2xl border border-border bg-muted/30 p-4 space-y-4 xl:col-span-5">
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
            <Skeleton className="h-24 w-full rounded-xl" />
            <div className="mt-auto grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          </div>

          <div className="flex h-full flex-col rounded-2xl border border-border bg-muted/30 p-4 space-y-4 xl:col-span-7">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-8 w-20" />
            </div>
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              {repeat(4).map((key) => (
                <Skeleton
                  key={`metric-${key}`}
                  className="h-full min-h-[88px] rounded-xl"
                />
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-4 xl:col-span-12">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-[320px] w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
};
