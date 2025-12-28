import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import {
  SettingsScaffold,
  type SettingsTabDef,
} from "@/features/components/SettingsScaffold";
import { AccountTab } from "./components/AccountTab";
import { BusinessTab } from "./components/BusinessTab";
import { PricingTab } from "@/components/settings/PricingTab";
import { PaymentTab } from "@/components/settings/CreditPaymentTab";
import { NotificationsTab } from "@/components/settings/NotificationsTab";
import { User, Building2, CreditCard, Bell, Shield } from "lucide-react";
import { ManufacturerSecurity } from "./Security";

type TabKey =
  | "account"
  | "business"
  | "pricing"
  | "payment"
  | "notifications"
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
        key: "pricing",
        label: "가격",
        icon: CreditCard,
        content: <PricingTab />,
      },
      {
        key: "payment",
        label: "결제",
        icon: CreditCard,
        content: <PaymentTab userData={user} />,
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
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(next) => setSearchParams({ tab: next })}
    />
  );
};
