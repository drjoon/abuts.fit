import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import {
  SettingsScaffold,
  type SettingsTabDef,
} from "@/features/components/SettingsScaffold";
import { SettingsTabsSkeleton } from "@/features/components/SettingsSkeletons";
import { AccountTab } from "@/features/settings/tabs/AccountTab";
import { BusinessTab } from "@/shared/components/business/settings/BusinessTab";
import { StaffTab } from "@/features/settings/tabs/StaffTab";
import { NotificationsTab } from "@/features/settings/tabs/NotificationsTab";
import { LabTradingPartnersTab } from "@/features/settings/tabs/LabTradingPartnersTab";
import { LabFeeScheduleTab } from "@/features/settings/tabs/LabFeeScheduleTab";
import {
  User,
  Building2,
  Bell,
  Users,
  Shield,
  Handshake,
  Banknote,
} from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { RequestorSecurity } from "./Security";
import { resolveBusinessType } from "@/shared/utils/resolveBusinessType";
import { formatKstDateTimeToKo, toKstYmd } from "@/shared/date/kst";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";

// related files:
// - web/backend/controllers/businesses/business.controller.js
// - web/backend/controllers/requests/utils.js
// - web/frontend/src/pages/requestor/credits/RequestorCreditsPage.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// 가입일시/경과일/D-day는 신규 기공소 90일 고정가와 동일 기준일(pricingBaseDate)을 사용한다.
// 2026-08-11: 설정 결제 탭 제거 → 사이드바 크레딧(`/dashboard/credits`)로 이전.
// 2026-08-11: 설정 의뢰 탭 제거 → 어벗의뢰 좌측 상단(디자인소프트웨어·아노다이징).
// 2026-08-11: 기공소 전용 「치과 등록」「기공비」탭(알림 왼쪽).

type TabKey =
  | "account"
  | "business"
  | "staff"
  | "lab-fees"
  | "trading-partners"
  | "notifications"
  | "security";

export const RequestorSettingsPage = () => {
  const { user, token } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const { loading: accessLoading, kind } = useRequestorBusinessAccess();
  const isLab = kind === "lab";

  const [loadingMembership, setLoadingMembership] = useState(Boolean(token));
  const [pricingBaseDate, setPricingBaseDate] = useState<string | null>(null);
  const membershipLoadedRef = useRef(false);

  const businessType = useMemo(() => {
    return resolveBusinessType(user?.role, "requestor");
  }, [user?.role]);

  useEffect(() => {
    const load = async () => {
      if (!token) {
        setPricingBaseDate(null);
        setLoadingMembership(false);
        membershipLoadedRef.current = true;
        return;
      }

      if (!membershipLoadedRef.current) {
        setLoadingMembership(true);
      }
      try {
        const res = await request<{
          data?: { pricingBaseDate?: string };
          pricingBaseDate?: string;
        }>({
          path: `/api/businesses/me?businessType=${encodeURIComponent(
            businessType,
          )}`,
          method: "GET",
          token,
        });
        if (!res.ok) {
          setPricingBaseDate(null);
          return;
        }
        const body = res.data || {};
        const data = body.data || body;
        setPricingBaseDate(
          data?.pricingBaseDate ? String(data.pricingBaseDate) : null,
        );
      } catch {
        setPricingBaseDate(null);
      } finally {
        membershipLoadedRef.current = true;
        setLoadingMembership(false);
      }
    };

    void load();
  }, [businessType, token]);

  const pricingElapsedDays = useMemo(() => {
    if (!pricingBaseDate) return null;
    const startYmd = toKstYmd(pricingBaseDate);
    const todayYmd = toKstYmd(new Date());
    if (!startYmd || !todayYmd) return null;

    const start = new Date(`${startYmd}T00:00:00+09:00`);
    const today = new Date(`${todayYmd}T00:00:00+09:00`);
    const diffMs = today.getTime() - start.getTime();
    if (!Number.isFinite(diffMs)) return null;
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }, [pricingBaseDate]);

  const launchEventRemainingDays = useMemo(() => {
    if (pricingElapsedDays == null) return null;
    return Math.max(0, 90 - pricingElapsedDays);
  }, [pricingElapsedDays]);

  const tabs: SettingsTabDef[] = useMemo(() => {
    const base: SettingsTabDef[] = [
      {
        key: "account",
        label: "계정",
        icon: User,
        content: <AccountTab userData={user} />,
      },
      {
        key: "business",
        label: "사업자",
        icon: Building2,
        content: (
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200/80">
                  <Building2 className="h-4 w-4 text-primary-strong" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">가입 정보</p>
                  <p className="text-xs text-muted-foreground">
                    런칭 이벤트·요금 기준일
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200/80 bg-white/70 px-4 py-3">
                  <p className="text-xs text-muted-foreground">가입일시</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {pricingBaseDate
                      ? formatKstDateTimeToKo(pricingBaseDate)
                      : "-"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-white/70 px-4 py-3">
                  <p className="text-xs text-muted-foreground">가입 후 경과일</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {pricingElapsedDays == null
                        ? "-"
                        : `${pricingElapsedDays}일`}
                    </p>
                    {launchEventRemainingDays != null && (
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold leading-none ${
                          launchEventRemainingDays > 0
                            ? "bg-primary-soft text-primary-strong ring-1 ring-primary-muted"
                            : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                        }`}
                      >
                        {launchEventRemainingDays > 0
                          ? `런칭 이벤트 D-${launchEventRemainingDays}일`
                          : "런칭 이벤트 종료"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <BusinessTab userData={user} />
          </div>
        ),
      },
      {
        key: "staff",
        label: "임직원",
        icon: Users,
        content: <StaffTab userData={user} />,
      },
    ];

    if (isLab) {
      base.push(
        {
          key: "lab-fees",
          label: "기공비",
          icon: Banknote,
          content: <LabFeeScheduleTab />,
        },
        {
          key: "trading-partners",
          label: "치과 등록",
          icon: Handshake,
          content: <LabTradingPartnersTab />,
        },
      );
    }

    base.push(
      {
        key: "notifications",
        label: "알림",
        icon: Bell,
        content: <NotificationsTab />,
      },
      {
        key: "security",
        label: "보안",
        icon: Shield,
        content: <RequestorSecurity />,
      },
    );

    return base;
  }, [
    isLab,
    launchEventRemainingDays,
    pricingBaseDate,
    pricingElapsedDays,
    user,
  ]);

  const tabFromUrl =
    (searchParams.get("tab") as TabKey | null) || (tabs[0]?.key as TabKey);
  const allowed = new Set(
    tabs.filter((t) => !t.disabled).map((t) => t.key),
  );
  const activeTab = allowed.has(tabFromUrl)
    ? tabFromUrl
    : (tabs.find((t) => !t.disabled)?.key as TabKey) ||
      (tabs[0]?.key as TabKey);

  if (loadingMembership || accessLoading) {
    return <SettingsTabsSkeleton tabCount={isLab ? 7 : 5} />;
  }

  return (
    <SettingsScaffold
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(next) => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set("tab", next);
        setSearchParams(nextParams, { replace: true });
      }}
    />
  );
};
