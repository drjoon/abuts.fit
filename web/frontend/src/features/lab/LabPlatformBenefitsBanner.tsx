// related files:
// - web/frontend/src/features/platform/PlatformBenefitsDialog.tsx
// - web/frontend/src/features/lab/LabDashboardTopBanners.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorPolicyRemakeHeader.tsx
// - 2026-08-12: 기공소 가입 이유 배너·모달.
// - 2026-08-12: PlatformBenefitsDialog(lab) 래퍼.
import { useState } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/shared/ui/cn";
import { PlatformBenefitsDialog } from "@/features/platform/PlatformBenefitsDialog";

type BannerProps = {
  className?: string;
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

export const LabPlatformBenefitsBanner = ({ className }: BannerProps) => {
  const [open, setOpen] = useState(false);

  return (
    <>
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
          "flex h-full w-full cursor-pointer items-center gap-3 rounded-xl border border-primary-muted bg-primary-soft px-4 py-3 text-left text-primary-strong transition-colors hover:bg-primary-soft/80 sm:gap-3.5 sm:px-5 sm:py-3.5",
          className,
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/70 ring-1 ring-primary-muted/60">
          <Sparkles className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-base font-semibold leading-snug tracking-tight sm:text-[17px]">
            왜 어벗츠에 가입해야 할까요?
          </p>
          <p className="text-sm leading-relaxed text-primary-strong/85 sm:text-[15px]">
            의뢰·정산·매칭·생산까지 — 클릭해서 자세히 보기
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
      </div>

      <LabPlatformBenefitsDialog open={open} onOpenChange={setOpen} />
    </>
  );
};
