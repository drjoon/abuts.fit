import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import {
  SettingsScaffold,
  type SettingsTabDef,
} from "@/features/components/SettingsScaffold";
import { AccountTab } from "@/features/settings/tabs/AccountTab";
import { StaffTab } from "@/features/settings/tabs/StaffTab";
import { NotificationsTab } from "@/features/settings/tabs/NotificationsTab";
import { BusinessTab } from "@/shared/components/business/settings/BusinessTab";
import { User, Users, Bell, CreditCard, Building2 } from "lucide-react";
import { AdminCreditSettingsTab } from "@/features/settings/tabs/AdminCreditSettingsTab";

type TabKey = "account" | "business" | "staff" | "notifications" | "payment";

export const AdminSettingsPage = () => {
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
        key: "payment",
        label: "결제",
        icon: CreditCard,
        content: <AdminCreditSettingsTab />,
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
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(next) => setSearchParams({ tab: next })}
    />
  );
};
