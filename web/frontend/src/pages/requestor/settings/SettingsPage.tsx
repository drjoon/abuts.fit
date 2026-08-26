import { useMemo } from "react";
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
import { LabFeeScheduleTab } from "@/features/settings/tabs/LabFeeScheduleTab";
import { ThreeShapeIntegrationTab } from "@/features/settings/tabs/ThreeShapeIntegrationTab";
import {
  User,
  Building2,
  Bell,
  Users,
  Shield,
  Banknote,
  Scan,
} from "lucide-react";
import { RequestorSecurity } from "./Security";
import { formatKstDateTimeToKo, toKstYmd } from "@/shared/date/kst";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
import { InternalLabOrgBanner } from "@/features/settings/InternalLabOrgBanner";

// related files:
// - web/backend/controllers/businesses/business.controller.js
// - web/frontend/src/pages/requestor/credits/RequestorCreditsPage.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// 2026-08-19: 90일 런칭가 폐지. 가입일시·경과일만 표시.
// 2026-08-11: 설정 결제 탭 제거 → 사이드바 크레딧(`/dashboard/credits`)로 이전.
// 2026-08-11: 설정 의뢰 탭 제거 → 어벗의뢰 좌측 상단(디자인소프트웨어·아노다이징).
// 2026-08-19: 수락 클릭 시 기공비 미설정이면 `from=accept` 안내 모달.
// 2026-08-19: 「어벗츠 인증」탭 제거. 구 `?tab=auto-match`·`trading-partners` → 계정.
// 2026-08-14: 「치과 등록」탭 제거 → 「자동 매칭 참여」.
// 2026-08-11: 기공소 전용 「치과 등록」「기공비」탭(알림 왼쪽).
// 2026-08-18: 치과 「구독」탭 제거(월정 폐기). 구 `?tab=subscription` → 계정.

type TabKey =
  | "account"
  | "business"
  | "staff"
  | "lab-fees"
  | "3shape"
  | "notifications"
  | "security";

const LEGACY_TAB_REDIRECT: Partial<Record<string, TabKey>> = {
  "auto-match": "account",
  "trading-partners": "account",
  subscription: "account",
};

export const RequestorSettingsPage = () => {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const { loading: accessLoading, kind } = useRequestorBusinessAccess();
  const isLab = kind === "lab" || user?.role === "internalLab";

  const joinDate = user?.createdAt ? String(user.createdAt) : null;

  const pricingElapsedDays = useMemo(() => {
    if (!joinDate) return null;
    const startYmd = toKstYmd(joinDate);
    const todayYmd = toKstYmd(new Date());
    if (!startYmd || !todayYmd) return null;

    const start = new Date(`${startYmd}T00:00:00+09:00`);
    const today = new Date(`${todayYmd}T00:00:00+09:00`);
    const diffMs = today.getTime() - start.getTime();
    if (!Number.isFinite(diffMs)) return null;
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }, [joinDate]);

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
            {user?.role === "internalLab" ? <InternalLabOrgBanner /> : null}
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200/80">
                  <Building2 className="h-4 w-4 text-primary-strong" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">가입 정보</p>
                  <p className="text-xs text-muted-foreground">
                    계정 가입일
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200/80 bg-white/70 px-4 py-3">
                  <p className="text-xs text-muted-foreground">가입일시</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {joinDate ? formatKstDateTimeToKo(joinDate) : "-"}
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
      base.push({
        key: "lab-fees",
        label: "기공비",
        icon: Banknote,
        content: <LabFeeScheduleTab />,
      });
      base.push({
        key: "3shape",
        label: "3Shape",
        icon: Scan,
        content: <ThreeShapeIntegrationTab />,
      });
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
  }, [isLab, joinDate, pricingElapsedDays, user]);

  const rawTab = searchParams.get("tab");
  const mapped =
    rawTab && LEGACY_TAB_REDIRECT[rawTab]
      ? LEGACY_TAB_REDIRECT[rawTab]
      : (rawTab as TabKey | null);
  const tabFromUrl = mapped || (tabs[0]?.key as TabKey);
  const allowed = new Set(
    tabs.filter((t) => !t.disabled).map((t) => t.key),
  );
  const activeTab = allowed.has(tabFromUrl)
    ? tabFromUrl
    : (tabs.find((t) => !t.disabled)?.key as TabKey) ||
      (tabs[0]?.key as TabKey);

  if (accessLoading) {
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
