import type { ReactNode } from "react";
import { cn } from "@/shared/ui/cn";

type PracticeTransferMiddleGridProps = {
  children: ReactNode;
  className?: string;
};

export function PracticeTransferMiddleGrid({ children, className }: PracticeTransferMiddleGridProps) {
  return (
    <div className={cn("grid min-h-0 flex-1 grid-cols-1 items-stretch gap-3 lg:grid-cols-[0.9fr_1.1fr]", className)}>
      {children}
    </div>
  );
}
