// related files:
// - web/frontend/src/features/lab/LabDashboardTopBanners.tsx
// - web/frontend/src/features/settings/tabs/LabAutoMatchParticipationTab.tsx
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// change-log:
// - 2026-08-14: 거래 치과 소개 → 자동 매칭 참여 CTA로 교체.
import { useNavigate } from "react-router-dom";
import { ChevronRight, FlaskConical } from "lucide-react";
import { cn } from "@/shared/ui/cn";

type Props = {
  className?: string;
};

export const LabAutoMatchParticipationBanner = ({ className }: Props) => {
  const navigate = useNavigate();

  const goSettings = () => {
    navigate("/dashboard/settings?tab=auto-match");
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
        <FlaskConical className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-base font-semibold leading-snug tracking-tight sm:text-[17px]">
          자동 매칭에 참여하세요
        </p>
        <p className="text-sm leading-relaxed text-primary-strong/85 sm:text-[15px]">
          월 플랫폼 수수료로 치과 자동 매칭 의뢰를 받을 수 있습니다.
          <br />
          자세한 내용은 클릭하세요!
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
    </div>
  );
};
