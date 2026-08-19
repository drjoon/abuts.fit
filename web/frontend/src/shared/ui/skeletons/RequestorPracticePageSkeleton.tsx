// change-log:
// - 2026-08-19: 수신 스켈레톤 — 안쪽 외곽 카드 테두리 제거(본문과 동일).
// - 2026-08-16: 수신 카드 스켈레톤 — 상태/치과 타이틀/칩 메타 계층에 맞춤.
// - 2026-08-13: 수신 스켈레톤 상태 뱃지 5→6(취소 추가).
// - 2026-08-13: 수신 스켈레톤 — 치과초대 제거·작업영역 카드 전체 높이.
// - 2026-08-11: 기공의뢰(발신)·기공의뢰수신 레이아웃에 맞춘 페이지 스켈레톤 신설.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
import { Skeleton } from "@/components/ui/skeleton";

const repeat = (count: number) => Array.from({ length: count }, (_, i) => i);

type RequestorPracticePageSkeletonProps = {
  /** send=치과 발신(기공의뢰), receive=기공소 수신 */
  mode?: "send" | "receive";
};

const TransferCardSkeleton = () => (
  <div className="space-y-2.5 rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-sm">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <Skeleton className="h-5 w-12 rounded-md" />
        <Skeleton className="h-5 w-14 rounded-md" />
      </div>
      <Skeleton className="h-5 w-12 rounded-md" />
    </div>
    <div className="flex items-start gap-2.5">
      <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-40" />
      </div>
    </div>
    <div className="space-y-1.5">
      <Skeleton className="h-3 w-48" />
      <Skeleton className="h-3 w-56" />
      <div className="flex gap-1">
        <Skeleton className="h-5 w-14 rounded-md" />
        <Skeleton className="h-5 w-12 rounded-md" />
      </div>
    </div>
  </div>
);

const SendSkeleton = () => (
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
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-8 w-44" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="h-9 w-full rounded-xl" />
          {repeat(3).map((key) => (
            <Skeleton key={`recent-${key}`} className="h-16 w-full rounded-xl" />
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      </div>
    </div>
  </div>
);

const ReceiveSkeleton = () => (
  <div className="flex h-full min-h-0 flex-col overflow-hidden">
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 space-y-3 pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-9 w-full md:max-w-md rounded-xl" />
          </div>
          <div className="flex flex-wrap gap-2">
            {repeat(6).map((key) => (
              <Skeleton key={`badge-${key}`} className="h-6 w-20 rounded-full" />
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {repeat(6).map((key) => (
              <TransferCardSkeleton key={`card-${key}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

/** 수신 목록 카드 그리드 전용(페이지 크롬 유지 시) */
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

export const RequestorPracticePageSkeleton = ({
  mode = "send",
}: RequestorPracticePageSkeletonProps) => {
  if (mode === "receive") return <ReceiveSkeleton />;
  return <SendSkeleton />;
};
