// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import type { ReactNode } from "react";

export type DiameterBucketKey = "6" | "8" | "10" | "12";

export interface DiameterQueueSummaryProps {
  title: ReactNode;
  labels: DiameterBucketKey[];
  counts: number[];
  total?: number;
  onBucketClick?: (label: DiameterBucketKey) => void;
  variant?: "default" | "compact";
}

export const WorksheetDiameterQueueBar = ({
  title,
  labels,
  counts,
  total,
  onBucketClick,
  variant = "default",
}: DiameterQueueSummaryProps) => {
  const safeTotal =
    typeof total === "number" ? total : counts.reduce((sum, c) => sum + c, 0);
  const isCompact = variant === "compact";

  return (
    <div
      className={`flex items-center gap-3 text-slate-600 px-0.5 ${
        isCompact ? "py-0 text-sm" : "py-2 text-lg"
      }`}
    >
      {!isCompact && safeTotal > 0 && (
        <div className="whitespace-nowrap font-semibold text-slate-700">
          {title}
        </div>
      )}
      <div
        className={`flex flex-wrap gap-1.5 ${
          isCompact ? "" : "flex-1 justify-end gap-2"
        }`}
      >
        {labels.map((label, index) => {
          const count = counts[index] ?? 0;
          const percent = safeTotal > 0 ? (count / safeTotal) * 100 : 0;

          return (
            <button
              key={label}
              type="button"
              className={`app-surface app-surface--item text-left hover:border-primary/70 hover:bg-primary-soft/60 transition-colors ${
                isCompact
                  ? "min-w-[58px] max-w-[76px] flex-1 px-1.5 py-1 text-xs"
                  : "flex-1 min-w-[130px] max-w-[220px] text-lg"
              }`}
              onClick={() => onBucketClick?.(label)}
            >
              <div
                className={`flex items-center justify-between ${
                  isCompact ? "mb-0.5" : "mb-1 px-2"
                }`}
              >
                <span
                  className={`font-semibold text-slate-800 ${
                    isCompact ? "text-[11px]" : "text-lg"
                  }`}
                >
                  {`${label}mm`}
                </span>
                <span
                  className={`text-slate-600 ${
                    isCompact ? "text-[11px] font-semibold" : "text-lg px-1"
                  }`}
                >
                  {count}
                </span>
              </div>
              <div
                className={`rounded-full bg-slate-100 overflow-hidden ${
                  isCompact ? "h-1 mx-0" : "h-1.5 px-2"
                }`}
              >
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
