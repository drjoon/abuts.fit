// change-log:
// - 2026-09-13: compact — centerAddon으로 R&D/불완전가공 등 중앙 탭 슬롯 지원.
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
  centerAddon?: ReactNode;
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
  centerAddon,
  toolbar,
}: WorksheetQueueSummaryProps) => {
  if (variant === "compact") {
    const queueLeading = (
      <div className="flex min-w-0 w-full flex-wrap items-center gap-2 md:w-auto md:flex-nowrap">
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
          <div className="w-full min-w-0 shrink-0 sm:w-auto">{leadingAddon}</div>
        ) : null}
      </div>
    );

    if (centerAddon) {
      return (
        <div
          className={`mb-3 grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center md:gap-3 ${className}`}
        >
          <div className="min-w-0 md:justify-self-start">{queueLeading}</div>
          <div className="flex min-w-0 items-center justify-center">
            {centerAddon}
          </div>
          <div className="flex w-full min-w-0 flex-wrap items-center justify-start gap-2 md:justify-self-end md:justify-end">
            {toolbar}
          </div>
        </div>
      );
    }

    return (
      <div
        className={`mb-3 flex flex-col gap-2 md:flex-row md:items-center md:gap-3 ${className}`}
      >
        {queueLeading}
        {toolbar ? (
          <div className="flex w-full min-w-0 flex-wrap items-center justify-start gap-2 md:ml-auto md:w-auto md:justify-end">
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
