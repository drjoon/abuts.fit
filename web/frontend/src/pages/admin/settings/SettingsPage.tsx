// change-log:
// - 2026-09-23: 플랫폼 탭 제거 → 재무「설정」(/dashboard/finance?tab=settings).
// - 2026-09-23: 최상단을 계정·사업자·플랫폼·임직원·알림으로 평탄화. 사업영역 제거. 플랫폼은 사업자 오른쪽.
// - 2026-08-13: 결제 탭 제거 — 내용은 플랫폼 설정(크레딧·커스텀어벗)에 유지.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/pages/admin/AdminSettingsHubPage.tsx
// - web/frontend/src/pages/admin/AdminFinancePage.tsx
import { useEffect, useMemo } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import {
  SettingsScaffold,
  type SettingsTabDef,
} from "@/features/components/SettingsScaffold";
import { AccountTab } from "@/features/settings/tabs/AccountTab";
import { StaffTab } from "@/features/settings/tabs/StaffTab";
import { NotificationsTab } from "@/features/settings/tabs/NotificationsTab";
import { BusinessTab } from "@/shared/components/business/settings/BusinessTab";
import { User, Users, Bell, Building2 } from "lucide-react";

type TabKey = "account" | "business" | "staff" | "notifications";

const TOP_TABS: TabKey[] = [
  "account",
  "business",
  "staff",
  "notifications",
];

function resolveTopTab(raw: string | null, accountTab: string | null): TabKey {
  // 구 북마크: ?tab=account&accountTab=business → business
  if (raw === "account" && accountTab && TOP_TABS.includes(accountTab as TabKey)) {
    return accountTab as TabKey;
  }
  if (raw && TOP_TABS.includes(raw as TabKey)) return raw as TabKey;
  // 구 사업영역 허브 탭 — 제거됨
  if (raw === "partners") return "account";
  return "account";
}

export const AdminSettingsPage = ({
  embedded = false,
}: {
  embedded?: boolean;
} = {}) => {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawTab = searchParams.get("tab");
  const activeTab = resolveTopTab(rawTab, searchParams.get("accountTab"));

  const tabs: SettingsTabDef[] = useMemo(
    () => [
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
        content: <BusinessTab userData={user} businessTypeOverride="admin" />,
      },
      {
        key: "staff",
        label: "임직원",
        icon: Users,
        content: <StaffTab userData={user} businessTypeOverride="admin" />,
      },
      {
        key: "notifications",
        label: "알림",
        icon: Bell,
        content: <NotificationsTab />,
      },
    ],
    [user],
  );

  // 구 accountTab / partners URL을 평탄 탭으로 승격
  useEffect(() => {
    const raw = searchParams.get("tab");
    if (raw === "platform") return;
    const legacyAccountTab = searchParams.get("accountTab");
    const needsPartnersFix = raw === "partners";
    const needsAccountTabFix = Boolean(legacyAccountTab);
    const needsDefaultTab =
      !raw || (!TOP_TABS.includes(raw as TabKey) && raw !== "partners");
    if (!needsPartnersFix && !needsAccountTabFix && !needsDefaultTab) return;

    const nextParams = new URLSearchParams(searchParams);
    if (needsPartnersFix) {
      nextParams.set("tab", "account");
      nextParams.delete("partnersTab");
    }
    if (legacyAccountTab) {
      if (
        TOP_TABS.includes(legacyAccountTab as TabKey) &&
        (raw === "account" || !raw || needsPartnersFix)
      ) {
        nextParams.set("tab", legacyAccountTab);
      }
      nextParams.delete("accountTab");
    }
    if (!TOP_TABS.includes(nextParams.get("tab") as TabKey)) {
      nextParams.set("tab", "account");
    }
    nextParams.delete("platformTab");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // 구 설정·플랫폼 → 재무 설정
  if (rawTab === "platform") {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "settings");
    return <Navigate to={`/dashboard/finance?${next.toString()}`} replace />;
  }

  return (
    <SettingsScaffold
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(next) => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set("tab", next);
        nextParams.delete("accountTab");
        nextParams.delete("partnersTab");
        nextParams.delete("platformTab");
        setSearchParams(nextParams, { replace: true });
      }}
      fillHeight={embedded}
    />
  );
};
