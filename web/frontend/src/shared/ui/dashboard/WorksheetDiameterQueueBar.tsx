import type { ReactNode } from "react";

export type DiameterBucketKey = "6" | "8" | "10" | "10+";

export interface DiameterQueueSummaryProps {
  title: ReactNode;
  labels: DiameterBucketKey[];
  counts: number[];
  total?: number;
  onBucketClick?: (label: DiameterBucketKey) => void;
}

export const WorksheetDiameterQueueBar = ({
  title,
  labels,
  counts,
  total,
  onBucketClick,
}: DiameterQueueSummaryProps) => {
  const safeTotal =
    typeof total === "number" ? total : counts.reduce((sum, c) => sum + c, 0);

  return (
    <div className="flex items-center gap-3 text-lg text-slate-600 px-0.5 py-2">
      {safeTotal > 0 && (
        <div className="whitespace-nowrap font-semibold text-slate-700">
          {title}
        </div>
      )}
      <div className="flex-1 flex flex-wrap gap-2 justify-end">
        {labels.map((label, index) => {
          const count = counts[index] ?? 0;
          const percent = safeTotal > 0 ? (count / safeTotal) * 100 : 0;

          return (
            <button
              key={label}
              type="button"
              className="app-surface app-surface--item flex-1 min-w-[130px] max-w-[220px] text-left text-lg hover:border-blue-400 hover:bg-blue-50/60 transition-colors"
              onClick={() => onBucketClick?.(label)}
            >
              <div className="flex items-center justify-between mb-1 px-2">
                <span className="font-semibold text-slate-800 text-lg">
                  {label === "10+" ? "12mm" : `${label}mm`}
                </span>
                <span className="text-lg text-slate-600 px-1">{count}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden px-2">
                <div
                  className="h-full bg-blue-500 rounded-full"
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
