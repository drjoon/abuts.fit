// change-log:
// - 2026-08-03: 공정 첫단계 표시 변경(의뢰 -> 준비). titlePrefix 기본값을 '진행중인 준비'로 조정.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import {
  WorksheetDiameterQueueBar,
  type DiameterBucketKey,
} from "./WorksheetDiameterQueueBar";

interface WorksheetQueueSummaryProps {
  total: number;
  labels: DiameterBucketKey[];
  counts: number[];
  className?: string;
  titlePrefix?: string;
}

export const WorksheetQueueSummary = ({
  total,
  labels,
  counts,
  className = "",
  titlePrefix = "진행중인 의뢰",
}: WorksheetQueueSummaryProps) => {
  return (
    <div
      className={`flex flex-col gap-2 md:flex-row md:items-center md:gap-4 ${className}`}
    >
      <div className="text-lg font-semibold text-slate-800 md:whitespace-nowrap">
        {titlePrefix} {total}건
      </div>
      <div className="flex-1">
        <WorksheetDiameterQueueBar
          title=""
          labels={labels}
          counts={counts}
          total={total}
        />
      </div>
    </div>
  );
};
