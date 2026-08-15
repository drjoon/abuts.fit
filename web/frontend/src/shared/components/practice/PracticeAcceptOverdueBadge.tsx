// related files:
// - web/frontend/src/shared/practice/practiceAcceptOverdue.ts
// - 2026-08-15: 기공의뢰 미수락(1영업일+) 「수락대기」뱃지.

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  getPracticeAcceptOverdueTooltip,
  PRACTICE_ACCEPT_OVERDUE_BADGE_CLASS,
  PRACTICE_ACCEPT_OVERDUE_LABEL,
  type PracticeAcceptOverdueViewer,
} from "@/shared/practice/practiceAcceptOverdue";

type PracticeAcceptOverdueBadgeProps = {
  viewer?: PracticeAcceptOverdueViewer;
  className?: string;
};

export function PracticeAcceptOverdueBadge({
  viewer = "practice",
  className,
}: PracticeAcceptOverdueBadgeProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 whitespace-nowrap",
              PRACTICE_ACCEPT_OVERDUE_BADGE_CLASS,
              className,
            )}
          >
            {PRACTICE_ACCEPT_OVERDUE_LABEL}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
          {getPracticeAcceptOverdueTooltip(viewer)}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
