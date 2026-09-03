// related files:
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/features/lab/LabDashboardTopBanners.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorPolicyRemakeHeader.tsx
// change-log:
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
        "w-full bg-primary text-xs text-primary-foreground hover:bg-primary/90",
        collapsed ? "h-10 justify-center px-0" : "h-9 px-3",
        className,
      )}
      onClick={() => setOpen(true)}
      aria-label="정책 안내"
    >
      {collapsed ? (
        <BookOpen className="h-4 w-4" />
      ) : (
        "정책 안내"
      )}
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
