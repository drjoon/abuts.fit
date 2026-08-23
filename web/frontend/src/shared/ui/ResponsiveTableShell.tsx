import type { ReactNode } from "react";
import { cn } from "@/shared/ui/cn";

type ResponsiveTableShellProps = {
  children: ReactNode;
  className?: string;
  /** Minimum table width before horizontal scroll kicks in */
  minWidthClassName?: string;
};

/** Horizontally scrollable table wrapper for narrow viewports. */
export function ResponsiveTableShell({
  children,
  className,
  minWidthClassName = "min-w-[560px]",
}: ResponsiveTableShellProps) {
  return (
    <div className={cn("w-full min-w-0 overflow-x-auto", className)}>
      <div className={cn("w-full", minWidthClassName)}>{children}</div>
    </div>
  );
}
