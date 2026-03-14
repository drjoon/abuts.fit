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
import { DevopsPayoutAccountTab } from "./components/DevopsPayoutAccountTab";
import { User, Landmark, Bell, Shield, Users } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";

 type TabKey = "account" | "staff" | "payment" | "notifications" | "security";

export const DevopsSettingsPage = () => {
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
        key: "staff",
        label: "임직원",
        icon: Users,
        content: <StaffTab userData={user} />,
      },
      {
        key: "payment",
        label: "수익 분배",
        icon: Landmark,
        content: <DevopsPayoutAccountTab />,
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
