import type { ReactNode } from "react";
import { cn } from "@/shared/ui/cn";

type PracticeTransferMiddleGridProps = {
  children: ReactNode;
  className?: string;
};

/** 위: 의뢰서 / 아래: 파일(목록·첨부) — 세로 스택 */
export function PracticeTransferMiddleGrid({ children, className }: PracticeTransferMiddleGridProps) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-10", className)}>
      {children}
    </div>
  );
}
