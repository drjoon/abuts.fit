import type { ReactNode } from "react";
import { cn } from "@/shared/ui/cn";

type PracticeTransferMiddleGridProps = {
  children: ReactNode;
  className?: string;
};

/** 의뢰서 세로 스택(메모|드롭존 2열은 intake 내부) */
export function PracticeTransferMiddleGrid({ children, className }: PracticeTransferMiddleGridProps) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-10", className)}>
      {children}
    </div>
  );
}
