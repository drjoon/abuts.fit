// related files:
// - web/frontend/src/pages/admin/system/AdminPlatformSettingsPage.tsx
// - web/frontend/src/features/settings/tabs/AdminCreditSettingsTab.tsx
// - web/backend/controllers/admin/admin.settings.controller.js
// - web/backend/services/creditRevenuePolicy.service.js
// change-log:
// - 2026-09-27: 심플웨이 딜러 10% · 커스텀어벗 딜러 20%. 기공 제외.
// - 2026-09-25: 신규 유치 요율 20% 고정. 15%/10% 선택·인하 예약 제거.
// - 2026-09-24: (철회) 월 매출 누진 구간.
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Percent } from "lucide-react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/shared/ui/cn";

/** 커스텀어벗 영업 수수료. 대시보드 스탬프와 잔여 분배 딜러%. */
const ABUTMENT_SHARE_PCT = 20;
const ABUTMENT_RATE = ABUTMENT_SHARE_PCT / 100;
/** 심플웨이(스토어) 영업 수수료. 판매가 대비 딜러 분배%. */
const STORE_SHARE_PCT = 10;

type CreditSettingsPayload = {
  dealershipActiveCommissionRate?: number | null;
  dealershipEventCommissionRate?: number | null;
  dealershipEventCommissionEnabled?: boolean;
  dealershipRateChangeScheduledAt?: string | Date | null;
  dealershipRateChangeScheduledRate?: number | null;
  salesmanSharePercent?: number | null;
  storeSalesmanSharePercent?: number | null;
  manufacturerSharePercent?: number | null;
  devopsSharePercent?: number | null;
  storeManufacturerSharePercent?: number | null;
  storeDevopsSharePercent?: number | null;
  storeDealerRateChangeScheduledAt?: string | Date | null;
  storeDealerRateChangeScheduledRate?: number | null;
};

type CreditsApiResponse = {
  success?: boolean;
  message?: string;
  data?: {
    creditSettings?: CreditSettingsPayload;
  };
};

function needsLock(settings: CreditSettingsPayload): boolean {
  const active = Number(
    settings.dealershipActiveCommissionRate ??
      settings.dealershipEventCommissionRate,
  );
  if (settings.dealershipRateChangeScheduledAt) return true;
  if (settings.dealershipRateChangeScheduledRate != null) return true;
  if (settings.storeDealerRateChangeScheduledAt) return true;
  if (settings.storeDealerRateChangeScheduledRate != null) return true;
  if (Number.isFinite(active) && Math.abs(active - ABUTMENT_RATE) > 0.0001) {
    return true;
  }
  const dealerShares: Array<[number | null | undefined, number]> = [
    [settings.salesmanSharePercent, ABUTMENT_SHARE_PCT],
    [settings.storeSalesmanSharePercent, STORE_SHARE_PCT],
  ];
  return dealerShares.some(([value, expected]) => {
    const n = Number(value);
    return Number.isFinite(n) && Math.abs(n - expected) > 0.001;
  });
}

function abutsAfterDealer(
  manufacturer: number | null | undefined,
  devops: number | null | undefined,
  manufacturerFallback: number,
  devopsFallback: number,
  dealerPct: number,
): number {
  const mfr = Number.isFinite(Number(manufacturer))
    ? Number(manufacturer)
    : manufacturerFallback;
  const ops = Number.isFinite(Number(devops)) ? Number(devops) : devopsFallback;
  return Math.max(0, Math.round((100 - mfr - dealerPct - ops) * 100) / 100);
}

/** 플랫폼 설정 · 딜러십 영업 수수료(심플웨이 10% · 커스텀어벗 20%). */
export function AdminDealershipSettingsTab({
  className,
}: {
  className?: string;
}) {
  const { token } = useAuthStore();
  const queryClient = useQueryClient();
  const lockedRef = useRef(false);

  useEffect(() => {
    if (!token || lockedRef.current) return;
    let mounted = true;
    const run = async () => {
      const res = await apiFetch<CreditsApiResponse>({
        path: "/api/admin/settings/credits",
        method: "GET",
        token,
        skipCache: true,
      });
      if (!mounted || !res.ok) return;
      const settings = res.data?.data?.creditSettings || {};
      if (!needsLock(settings)) return;
      lockedRef.current = true;
      const saved = await apiFetch<CreditsApiResponse>({
        path: "/api/admin/settings/credits",
        method: "PATCH",
        token,
        jsonBody: {
          dealershipActiveCommissionRate: ABUTMENT_RATE,
          dealershipEventCommissionRate: ABUTMENT_RATE,
          dealershipEventCommissionEnabled: true,
          dealershipRateChangeScheduledAt: null,
          dealershipRateChangeScheduledRate: null,
          storeDealerRateChangeScheduledAt: null,
          storeDealerRateChangeScheduledRate: null,
          salesmanSharePercent: ABUTMENT_SHARE_PCT,
          storeSalesmanSharePercent: STORE_SHARE_PCT,
          abutsSharePercent: abutsAfterDealer(
            settings.manufacturerSharePercent,
            settings.devopsSharePercent,
            50,
            5,
            ABUTMENT_SHARE_PCT,
          ),
          storeAbutsSharePercent: abutsAfterDealer(
            settings.storeManufacturerSharePercent,
            settings.storeDevopsSharePercent,
            50,
            5,
            STORE_SHARE_PCT,
          ),
        },
      });
      if (!saved.ok || !mounted) return;
      void queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      void queryClient.invalidateQueries({ queryKey: ["credit-settings"] });
    };
    void run();
    return () => {
      mounted = false;
    };
  }, [token, queryClient]);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          딜러십 영업 수수료
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          심플웨이 매출액 대비 {STORE_SHARE_PCT}%입니다.
          <br />
          커스텀어벗 매출액 대비 {ABUTMENT_SHARE_PCT}%입니다.
          <br />
          기공은 제외됩니다.
          <br />
          배송비·월정액은 빠집니다.
          <br />
          90일 무주문이면 소개 코드가 리셋됩니다.
          <br />
          누구든 다시 영업할 수 있습니다.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <RateLock label="심플웨이" pct={STORE_SHARE_PCT} />
        <RateLock label="커스텀어벗" pct={ABUTMENT_SHARE_PCT} />
      </div>
    </div>
  );
}

function RateLock({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-muted/60 bg-primary-soft/30 px-4 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/90 ring-1 ring-primary-muted/50">
          <Percent className="h-4 w-4 text-primary-strong" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">{label}</div>
          <p className="text-[12px] leading-snug text-muted-foreground">
            매출액 대비
          </p>
        </div>
      </div>
      <div className="flex h-9 min-w-[3.25rem] items-center justify-center rounded-lg bg-white px-2.5 text-sm font-semibold tabular-nums text-primary-strong shadow-sm ring-1 ring-primary-muted/50">
        {pct}%
      </div>
    </div>
  );
}
