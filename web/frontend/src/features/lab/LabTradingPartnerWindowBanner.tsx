// related files:
// - web/frontend/src/shared/lab/useLabTradingPartnerWindow.ts
// - web/frontend/src/features/settings/tabs/LabTradingPartnersTab.tsx
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
import { useNavigate } from "react-router-dom";
import { ChevronRight, Handshake } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/shared/ui/cn";
import { useLabTradingPartnerWindow } from "@/shared/lab/useLabTradingPartnerWindow";

type Props = {
  className?: string;
};

export const LabTradingPartnerWindowBanner = ({ className }: Props) => {
  const navigate = useNavigate();
  const { isLab, canInvite, remainingDays, loading } =
    useLabTradingPartnerWindow();

  if (loading || !isLab || !canInvite || remainingDays == null) {
    return null;
  }

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() =>
        navigate("/dashboard/settings?tab=trading-partners")
      }
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate("/dashboard/settings?tab=trading-partners");
        }
      }}
      className={cn("block w-full cursor-pointer text-left", className)}
    >
      <Alert className="border-primary-muted bg-primary-soft text-primary-strong transition-colors hover:bg-primary-soft/80">
        <Handshake className="h-4 w-4" />
        <div className="flex items-start justify-between gap-3 pl-0">
          <div className="min-w-0">
            <AlertTitle>
              거래 치과 등록 {remainingDays}일 남음
            </AlertTitle>
            <AlertDescription className="text-primary-strong/85">
              <p>
                등록 치과 기공의뢰는 커스텀 어벗 소매가까지 결제크레딧으로
                적립됩니다. 미등록이면 보철 기공비만 적립됩니다.
              </p>
            </AlertDescription>
          </div>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
        </div>
      </Alert>
    </div>
  );
};
