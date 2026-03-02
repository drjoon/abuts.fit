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
import { User, Users, Bell, Shield, Truck, Building2 } from "lucide-react";
import { ManufacturerSecurity } from "./Security";
import { BusinessTab } from "./components/BusinessTab";
import { ManufacturerShippingTab } from "./components/ShippingTab";

type TabKey =
  | "account"
  | "business"
  | "staff"
  | "notifications"
  | "shipping"
  | "security";

export const ManufacturerSettingsPage = () => {
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
        key: "shipping",
        label: "배송",
        icon: Truck,
        content: <ManufacturerShippingTab userData={user} />,
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
        content: <ManufacturerSecurity />,
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
