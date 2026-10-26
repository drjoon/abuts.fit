// related files:
// - web/frontend/src/features/dashboard/SettingsPage.tsx
// - web/frontend/src/pages/admin/settings/SettingsPage.tsx
// change-log:
// - 2026-10-27: 영업본부 설정 분리 제거. 어벗츠 임직원(마케팅영업부)과 같은 사업자·임직원.
// - 2026-09-06: 어벗츠(admin) 사업자. compact·wide 셸.
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Bell, Building2, Shield, User, Users } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import {
  SettingsScaffold,
  type SettingsTabDef,
} from "@/features/components/SettingsScaffold";
import { AccountTab } from "@/features/settings/tabs/AccountTab";
import { StaffTab } from "@/features/settings/tabs/StaffTab";
import { NotificationsTab } from "@/features/settings/tabs/NotificationsTab";
import { RequestorSecurity } from "@/pages/requestor/settings/Security";
import { BusinessTab } from "@/shared/components/business/settings/BusinessTab";

type TabKey = "account" | "business" | "staff" | "notifications" | "security";

/** 어벗츠 법인(BA type=admin). 부서는 마케팅영업부. */
export const SalesTeamSettingsPage = () => {
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
      {
        key: "security",
        label: "보안",
        icon: Shield,
        content: <RequestorSecurity />,
      },
    ],
    [user],
  );

  const tabFromUrl =
    (searchParams.get("tab") as TabKey | null) || (tabs[0]?.key as TabKey);
  const allowed = new Set(tabs.map((t) => t.key));
  const activeTab = allowed.has(tabFromUrl)
    ? tabFromUrl
    : (tabs[0]?.key as TabKey);

  return (
    <SettingsScaffold
      compact
      contentMaxClassName="max-w-5xl"
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
