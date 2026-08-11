// change-log:
// - 2026-08-12: 기공의뢰 데이터 영역 전용 스켈레톤(발신 폼 / 수신 카드 목록).
// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
import { Skeleton } from "@/components/ui/skeleton";

const repeat = (count: number) => Array.from({ length: count }, (_, i) => i);

const TransferCardSkeleton = () => (
  <div className="rounded-lg border p-4 space-y-3">
    <div className="flex items-center justify-between gap-2">
      <Skeleton className="h-4 w-28" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
    </div>
    <Skeleton className="h-3 w-48" />
    <Skeleton className="h-3 w-full" />
  </div>
);

/** 수신 목록 카드 그리드 */
export const RequestorPracticeTransferCardsSkeleton = ({
  count = 4,
}: {
  count?: number;
}) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
    {repeat(count).map((key) => (
      <TransferCardSkeleton key={`transfer-skel-${key}`} />
    ))}
  </div>
);

/** access 로딩 등 — 페이지 크롬 없이 데이터 영역만 */
export const RequestorPracticePageSkeleton = ({
  mode = "send",
}: {
  mode?: "send" | "receive";
}) => {
  if (mode === "receive") {
    return (
      <div className="flex h-full min-h-0 flex-col p-4 space-y-3">
        <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-9 w-full md:max-w-md rounded-xl" />
          </div>
          <div className="flex flex-wrap gap-2">
            {repeat(5).map((key) => (
              <Skeleton key={`badge-${key}`} className="h-6 w-20 rounded-full" />
            ))}
          </div>
          <RequestorPracticeTransferCardsSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 p-4 space-y-3">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-10">
        <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-4 xl:col-span-7">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-5 w-24" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>
          <Skeleton className="h-36 w-full rounded-xl" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {repeat(6).map((key) => (
              <Skeleton key={`field-${key}`} className="h-10 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
        <div className="space-y-3 xl:col-span-3">
          <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-10 w-full rounded-xl" />
            {repeat(3).map((key) => (
              <Skeleton key={`side-${key}`} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
