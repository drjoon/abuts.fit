// related files:
// - web/frontend/src/shared/guideTour/GuideTourProvider.tsx
// - web/frontend/src/features/lab/LabDashboardTopBanners.tsx
// - 2026-09-08: 사이드바 1줄·문구 가운데·아이콘 왼쪽 고정. 부제 제거.
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
        "relative flex h-9 w-full cursor-pointer items-center justify-center text-center text-accent-strong transition-colors hover:bg-accent-soft/80",
        "rounded-lg border border-accent-muted bg-accent-soft",
        !collapsed && "px-2.5",
        className,
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/70 ring-1 ring-accent-muted/60",
          !collapsed && "absolute left-2 top-1/2 -translate-y-1/2",
        )}
      >
        <Compass className="h-3.5 w-3.5" />
      </span>
      {!collapsed ? (
        <p className="truncate text-sm font-semibold leading-none tracking-tight">
          {label}
        </p>
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
