// related files:
// - web/frontend/src/shared/lab/useLabTradingPartnerWindow.ts
// - web/frontend/src/features/lab/LabDashboardTopBanners.tsx
// - web/frontend/src/features/settings/tabs/LabTradingPartnersTab.tsx
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// - 2026-08-11: 기공소 관점 문구·여백 정리.
// - 2026-08-12: LabDashboardTopBanners 왼쪽 절반·표시 전용으로 분리.
import { useNavigate } from "react-router-dom";
import { ChevronRight, Handshake } from "lucide-react";
import { cn } from "@/shared/ui/cn";

type Props = {
  remainingDays: number;
  className?: string;
};

export const LabTradingPartnerWindowBanner = ({
  remainingDays,
  className,
}: Props) => {
  const navigate = useNavigate();

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
        "flex h-full w-full cursor-pointer items-center gap-3 rounded-xl border border-primary-muted bg-primary-soft px-4 py-3 text-left text-primary-strong transition-colors hover:bg-primary-soft/80 sm:gap-3.5 sm:px-5 sm:py-3.5",
        className,
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/70 ring-1 ring-primary-muted/60">
        <Handshake className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-base font-semibold leading-snug tracking-tight sm:text-[17px]">
          소개치과 등록 {remainingDays}일 남음
        </p>
        <p className="text-sm leading-relaxed text-primary-strong/85 sm:text-[15px]">
          거래하시던 치과를 소개하여 등록하시면 플랫폼 수수료가 면제됩니다.
          <br />
          자세한 내용은 클릭하세요!
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
    </div>
  );
};
