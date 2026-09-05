// related files:
// - web/frontend/src/shared/guideTour/GuideTourProvider.tsx
// - web/frontend/src/features/lab/LabDashboardTopBanners.tsx
import { Compass } from "lucide-react";
import { cn } from "@/shared/ui/cn";
import { useGuideTour } from "@/shared/guideTour/GuideTourProvider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Props = {
  className?: string;
  collapsed?: boolean;
};

/** 사이드바 — 미수료 시만. 일시중단이면「계속」. */
export function GuideTourSidebarButton({
  className,
  collapsed = false,
}: Props) {
  const { eligible, active, resumeStepId, startOrResume } = useGuideTour();
  if (!eligible || active) return null;

  const continuing = Boolean(resumeStepId);
  const label = continuing ? "가이드투어 계속" : "가이드투어";

  const trigger = (
    <div
      role="button"
      tabIndex={0}
      onClick={() => startOrResume()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          startOrResume();
        }
      }}
      className={cn(
        "flex cursor-pointer items-center text-left text-accent-strong transition-colors hover:bg-accent-soft/80",
        collapsed
          ? "h-10 w-full justify-center rounded-lg border border-accent-muted bg-accent-soft"
          : "w-full gap-2 rounded-lg border border-accent-muted bg-accent-soft px-2.5 py-2",
        className,
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/70 ring-1 ring-accent-muted/60">
        <Compass className="h-3.5 w-3.5" />
      </span>
      {!collapsed ? (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-snug tracking-tight">
            {label}
          </p>
          <p className="truncate text-[11px] text-accent-strong/70">
            {continuing ? "이어서 진행" : "사용 안내 1회"}
          </p>
        </div>
      ) : null}
    </div>
  );

  if (!collapsed) return trigger;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
