import { ReactNode } from "react";

import { cn } from "@/shared/ui/cn";

type GuideFocusProps = {
  stepId?: string;
  children: ReactNode;
  className?: string;
  hint?: string;
  muted?: boolean;
};

export const GuideFocus = ({ children, className }: GuideFocusProps) => {
  return <div className={cn("relative", className)}>{children}</div>;
};
