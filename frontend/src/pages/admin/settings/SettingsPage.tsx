import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import {
  SettingsScaffold,
  type SettingsTabDef,
} from "@/features/components/SettingsScaffold";
import { AccountTab } from "@/components/settings/AccountTab";
import { NotificationsTab } from "@/components/settings/NotificationsTab";
import { User, Bell } from "lucide-react";

type TabKey = "account" | "notifications";

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
        key: "notifications",
        label: "알림",
        icon: Bell,
        content: <NotificationsTab />,
      },
    ],
    [user]
  );

  const tabFromUrl =
    (searchParams.get("tab") as TabKey | null) || (tabs[0]?.key as TabKey);
  const allowed = new Set(tabs.map((t) => t.key));
  const activeTab = allowed.has(tabFromUrl)
    ? tabFromUrl
    : (tabs[0]?.key as TabKey);

  return (
    <SettingsScaffold
      title="설정"
      subtitle="시스템 설정을 관리하세요"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(next) => setSearchParams({ tab: next })}
    />
  );
};
