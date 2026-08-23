// change-log:
// - 2026-08-24: compact — 장비 상태 등 leadingAddon을 직경 카드 옆에 배치.
// - 2026-08-24: compact — `N건`만 표시, 좌 1/3·우 2/3 한 행(툴바 없어도 우측 열 유지).
// - 2026-08-03: 공정 첫단계 표시 변경(의뢰 -> 준비). titlePrefix 기본값을 '진행중인 준비'로 조정.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import type { ReactNode } from "react";
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
  variant?: "default" | "compact";
  leadingAddon?: ReactNode;
  toolbar?: ReactNode;
}

export const WorksheetQueueSummary = ({
  total,
  labels,
  counts,
  className = "",
  titlePrefix = "진행중인 의뢰",
  variant = "default",
  leadingAddon,
  toolbar,
}: WorksheetQueueSummaryProps) => {
  if (variant === "compact") {
    return (
      <div
        className={`mb-3 flex items-center gap-3 ${className}`}
      >
        <div className="flex min-w-0 shrink items-center gap-2">
          <div className="shrink-0 whitespace-nowrap text-base font-semibold text-slate-800">
            {total}건
          </div>
          <WorksheetDiameterQueueBar
            title=""
            labels={labels}
            counts={counts}
            total={total}
            variant="compact"
          />
          {leadingAddon ? (
            <div className="shrink-0">{leadingAddon}</div>
          ) : null}
        </div>
        {toolbar ? (
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
            {toolbar}
          </div>
        ) : null}
      </div>
    );
  }

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
