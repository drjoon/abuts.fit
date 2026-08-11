// related files:
// - web/frontend/src/shared/lab/useLabTradingPartnerWindow.ts
// - web/frontend/src/features/settings/tabs/LabTradingPartnersTab.tsx
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// - 2026-08-11: 기공소 관점 문구·여백 정리.
import { useNavigate } from "react-router-dom";
import { ChevronRight, Handshake } from "lucide-react";
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

  const goSettings = () => {
    navigate("/dashboard/settings?tab=trading-partners");
  };

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={goSettings}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goSettings();
        }
      }}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-xl border border-primary-muted bg-primary-soft px-3.5 py-2.5 text-left text-primary-strong transition-colors hover:bg-primary-soft/80 sm:px-4 sm:py-3",
        className,
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/70 ring-1 ring-primary-muted/60">
        <Handshake className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-semibold leading-snug tracking-tight">
          거래 치과 등록 {remainingDays}일 남음
        </p>
        <p className="text-xs leading-relaxed text-primary-strong/80 sm:text-[13px]">
          등록한 치과 의뢰는 어벗 금액까지 기공소 결제크레딧으로 들어옵니다.
          미등록이면 보철 기공비만 적립되고, 어벗 금액은 어벗츠 몫입니다.
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
    </div>
  );
};
