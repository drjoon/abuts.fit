// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// change-log:
// - 2026-09-21: 정산 입금 계좌를 설정>사업자(PayoutAccountCard)로 통합. 결제 탭 제거.
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  SettingsScaffold,
  type SettingsTabDef,
} from "@/features/components/SettingsScaffold";
import { AccountTab } from "@/features/settings/tabs/AccountTab";
import { StaffTab } from "@/features/settings/tabs/StaffTab";
import { NotificationsTab } from "@/features/settings/tabs/NotificationsTab";
import { RequestorSecurity } from "@/pages/requestor/settings/Security";
import { BusinessTab } from "@/shared/components/business/settings/BusinessTab";
import { User, Building2, Bell, Shield, Users } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";

type TabKey =
  | "account"
  | "business"
  | "staff"
  | "notifications"
  | "security";

export const SalesmanSettingsPage = () => {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();

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
        content: <BusinessTab userData={user} />,
      },
      {
        key: "staff",
        label: "임직원",
        icon: Users,
        content: <StaffTab userData={user} />,
      },
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
    ],
    [user],
  );

  const rawTab = (searchParams.get("tab") || "").trim();
  // 레거시 결제/정산 탭 → 사업자(입금 계좌)
  const tabFromUrl = (
    rawTab === "payment" || rawTab === "payout" ? "business" : rawTab
  ) as TabKey;
  const allowed = new Set(tabs.map((t) => t.key));
  const activeTab = allowed.has(tabFromUrl)
    ? tabFromUrl
    : (tabs[0]?.key as TabKey);

  return (
    <SettingsScaffold
      compact
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
