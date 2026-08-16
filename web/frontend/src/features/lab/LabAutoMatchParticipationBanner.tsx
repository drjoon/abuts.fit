// related files:
// - web/frontend/src/features/lab/LabDashboardTopBanners.tsx
// - web/frontend/src/features/settings/tabs/LabAutoMatchParticipationTab.tsx
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// change-log:
// - 2026-08-16: 미신청·심사 중 안내. 인증 완료 시 배너 숨김.
// - 2026-08-16: 레거시 풀 ON만으로 certified 취급해 배너가 사라지지 않게 — raw status 기준.
// - 2026-08-14: 거래 치과 소개 → 자동 매칭 참여 CTA로 교체.
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, FlaskConical } from "lucide-react";
import { cn } from "@/shared/ui/cn";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import {
  normalizeAbutsLabCertStatus,
  type AbutsLabCertStatus,
} from "@/shared/practice/abutsLabCertification";

type Props = {
  className?: string;
};

export const LabAutoMatchParticipationBanner = ({ className }: Props) => {
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const [certStatus, setCertStatus] = useState<AbutsLabCertStatus | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await request<{
        data?: {
          abutsLabCertification?: { status?: unknown } | null;
        };
      }>({
        path: "/api/businesses/me/auto-match-participation",
        method: "GET",
        token,
      });
      if (!res.ok) return;
      // 레거시 풀 ON → virtual certified 승격은 배너 숨김에 쓰지 않음(미신청 안내 유지).
      setCertStatus(
        normalizeAbutsLabCertStatus(res.data?.data?.abutsLabCertification?.status),
      );
    } catch {
      // silent
    } finally {
      setReady(true);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!ready || certStatus === "certified") {
    return null;
  }

  const goSettings = () => {
    navigate("/dashboard/settings?tab=auto-match");
  };

  const pending =
    certStatus === "applied" || certStatus === "testing";
  const title = pending
    ? "어벗츠 인증 심사 중"
    : "인증 테스트를 신청하세요";
  const subtitle = pending
    ? "기공 테스트 통과 후 인증 기공소 뱃지가 부여됩니다"
    : "신청 → 테스트 → 통과 시 자동 매칭에 참여할 수 있습니다";

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
          {title}
        </p>
        <p className="text-sm leading-relaxed text-primary-strong/85 sm:text-[15px]">
          {subtitle}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
    </div>
  );
};
