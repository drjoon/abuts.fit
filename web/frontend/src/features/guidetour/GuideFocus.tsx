import { ReactNode } from "react";
import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { useGuideTour } from "./GuideTourProvider";

type GuideFocusProps = {
  stepId: string;
  children: ReactNode;
  className?: string;
  hint?: string;
  muted?: boolean;
};

export const GuideFocus = ({
  stepId,
  children,
  className,
  hint,
  muted = false,
}: GuideFocusProps) => {
  const { isStepActive, getStepMeta } = useGuideTour();
  const active = isStepActive(stepId);
  const meta = getStepMeta(stepId);

  const message = hint || meta.step?.title;

  return (
    <div
      className={cn(
        "relative transition-all duration-300",
        active &&
          "z-10 rounded-3xl ring-2 ring-primary/60 shadow-[0_15px_60px_rgba(14,92,228,0.25)]",
        className
      )}
    >
      <div
        className={cn(
          "relative",
          active && !muted && "animate-[pulse_1.8s_ease-in-out_infinite]"
        )}
      >
        {children}
      </div>
      {active && message && (
        <div className="absolute -top-4 right-4 flex items-center gap-1 rounded-full border border-primary/30 bg-background/95 px-3 py-1 text-xs font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          {message}
        </div>
      )}
    </div>
  );
};
