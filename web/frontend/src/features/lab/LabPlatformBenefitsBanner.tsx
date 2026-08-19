// related files:
// - web/frontend/src/features/platform/PlatformBenefitsDialog.tsx
// - web/frontend/src/features/lab/LabDashboardTopBanners.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorPolicyRemakeHeader.tsx
// - 2026-08-19: 사이드 카피 — 의뢰.정산.어벗생산.
// - 2026-08-19: 기공소 사이드 — 설정과 계정 팝업 사이. 접히면 아이콘만.
// - 2026-08-19: 짧은 카피(사이드 폭).
// - 2026-08-12: 기공소 가입 이유 배너·모달.
// - 2026-08-12: PlatformBenefitsDialog(lab) 래퍼.
import { useState } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/shared/ui/cn";
import { PlatformBenefitsDialog } from "@/features/platform/PlatformBenefitsDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type BannerProps = {
  className?: string;
  collapsed?: boolean;
};

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const LabPlatformBenefitsDialog = ({
  open,
  onOpenChange,
}: DialogProps) => (
  <PlatformBenefitsDialog open={open} onOpenChange={onOpenChange} variant="lab" />
);

export const PracticePlatformBenefitsDialog = ({
  open,
  onOpenChange,
}: DialogProps) => (
  <PlatformBenefitsDialog
    open={open}
    onOpenChange={onOpenChange}
    variant="practice"
  />
);

export const LabPlatformBenefitsBanner = ({
  className,
  collapsed = false,
}: BannerProps) => {
  const [open, setOpen] = useState(false);

  const trigger = (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setOpen(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen(true);
        }
      }}
      className={cn(
        "flex cursor-pointer items-center text-left text-primary-strong transition-colors hover:bg-primary-soft/80",
        collapsed
          ? "h-10 w-full justify-center rounded-lg border border-primary-muted bg-primary-soft"
          : "w-full gap-2 rounded-lg border border-primary-muted bg-primary-soft px-2.5 py-2",
        className,
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/70 ring-1 ring-primary-muted/60">
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      {!collapsed ? (
        <>
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-sm font-semibold leading-snug tracking-tight">
              왜 가입할까요?
            </p>
            <p className="text-xs leading-snug text-primary-strong/85">
              의뢰.정산.어벗생산
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
        </>
      ) : null}
    </div>
  );

  return (
    <>
      {collapsed ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block w-full">{trigger}</span>
            </TooltipTrigger>
            <TooltipContent side="right">왜 가입할까요?</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        trigger
      )}

      <LabPlatformBenefitsDialog open={open} onOpenChange={setOpen} />
    </>
  );
};
