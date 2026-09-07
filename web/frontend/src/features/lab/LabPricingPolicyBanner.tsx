// related files:
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/features/lab/LabDashboardTopBanners.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorPolicyRemakeHeader.tsx
// change-log:
// - 2026-09-08: 사이드바 문구 가운데·아이콘 왼쪽 고정(펼침 시 BookOpen).
// - 2026-09-03: 기공소 기공의뢰(수신·어벗츠로 의뢰) 정책 안내를 사이드바로 이동.
import { useState } from "react";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PricingPolicyDialog } from "@/shared/ui/PricingPolicyDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";

type Props = {
  className?: string;
  collapsed?: boolean;
};

export const LabPricingPolicyBanner = ({
  className,
  collapsed = false,
}: Props) => {
  const [open, setOpen] = useState(false);

  const trigger = (
    <Button
      type="button"
      size="sm"
      className={cn(
        "relative w-full justify-center bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90",
        collapsed ? "h-9 px-0" : "h-9 px-2.5",
        className,
      )}
      onClick={() => setOpen(true)}
      aria-label="정책 안내"
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center",
          !collapsed && "absolute left-2 top-1/2 -translate-y-1/2",
        )}
      >
        <BookOpen className="h-3.5 w-3.5" />
      </span>
      {!collapsed ? "정책 안내" : null}
    </Button>
  );

  return (
    <>
      {collapsed ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block w-full">{trigger}</span>
            </TooltipTrigger>
            <TooltipContent side="right">정책 안내</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        trigger
      )}

      <PricingPolicyDialog open={open} onOpenChange={setOpen} />
    </>
  );
};
