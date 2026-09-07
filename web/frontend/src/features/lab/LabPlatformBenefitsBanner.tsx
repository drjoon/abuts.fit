// related files:
// - web/frontend/src/features/platform/PlatformBenefitsDialog.tsx
// - web/frontend/src/features/lab/LabDashboardTopBanners.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorPolicyRemakeHeader.tsx
// - 2026-09-08: 사이드바 1줄·문구 가운데·아이콘 왼쪽 고정. 부제 제거.
// - 2026-08-19: 사이드 카피 — 의뢰.정산.어벗생산.
// - 2026-08-19: 기공소 사이드 — 설정과 계정 팝업 사이. 접히면 아이콘만.
// - 2026-08-19: 짧은 카피(사이드 폭).
// - 2026-08-12: 기공소 가입 이유 배너·모달.
// - 2026-08-12: PlatformBenefitsDialog(lab) 래퍼.
import { useState } from "react";
import { Sparkles } from "lucide-react";
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
        "relative flex h-9 w-full cursor-pointer items-center justify-center text-center text-primary-strong transition-colors hover:bg-primary-soft/80",
        "rounded-lg border border-primary-muted bg-primary-soft",
        !collapsed && "px-2.5",
        className,
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/70 ring-1 ring-primary-muted/60",
          !collapsed && "absolute left-2 top-1/2 -translate-y-1/2",
        )}
      >
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      {!collapsed ? (
        <p className="truncate text-sm font-semibold leading-none tracking-tight">
          왜 가입할까요?
        </p>
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
