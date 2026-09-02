// related files:
// - web/frontend/src/shared/practice/practiceAbutmentUploadOverdue.ts
// - web/frontend/src/shared/components/practice/PracticeLabReceiveWorkActionsBar.tsx
// - 2026-09-02: 수락 후 어벗 STL 미업로드 24h/48h 경고 배너.

import { AlertTriangle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  getPracticeAbutmentUploadOverdueLabel,
  getPracticeAbutmentUploadOverdueTooltip,
  type PracticeAbutmentUploadOverdueLevel,
} from "@/shared/practice/practiceAbutmentUploadOverdue";
import { cn } from "@/shared/ui/cn";

type PracticeAbutmentUploadOverdueAlertProps = {
  level: PracticeAbutmentUploadOverdueLevel;
  className?: string;
  compact?: boolean;
};

const LEVEL_CLASS: Record<PracticeAbutmentUploadOverdueLevel, string> = {
  yellow:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100",
  red: "border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-100",
  deadline:
    "border-red-600 bg-red-100 text-red-950 ring-2 ring-red-400/80 dark:border-red-500 dark:bg-red-950/60 dark:text-red-50 dark:ring-red-500/50",
};

export function PracticeAbutmentUploadOverdueAlert({
  level,
  className,
  compact = false,
}: PracticeAbutmentUploadOverdueAlertProps) {
  const label = getPracticeAbutmentUploadOverdueLabel(level);
  const tooltip = getPracticeAbutmentUploadOverdueTooltip(level);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role="status"
          className={cn(
            "flex w-fit max-w-full cursor-help items-start gap-1.5 rounded-md border px-2 py-1.5 text-xs leading-snug",
            LEVEL_CLASS[level],
            compact && "px-1.5 py-1",
            className,
          )}
        >
          <AlertTriangle
            className={cn(
              "mt-0.5 shrink-0",
              compact ? "h-3.5 w-3.5" : "h-4 w-4",
              level === "deadline" || level === "red"
                ? "text-red-600"
                : "text-amber-600",
            )}
            aria-hidden
          />
          <span className="font-medium">{label}</span>
          {!compact ? (
            <span className="text-[11px] opacity-90">
              — 커스텀 어벗 STL을 업로드해 주세요.
            </span>
          ) : null}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
